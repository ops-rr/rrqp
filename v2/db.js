/* RR AI Quiz Platform V2 — 資料層（直接讀寫 Firestore）
 * 對外提供 window.RRQP_DB = { api(action, payload), signIn(), signOut(), onAuth(cb) }
 * api 的動作名稱沿用 V1（例如 't_topics'、'tw_addTag'），畫面程式不用改。
 * 預覽模式（網址加 ?preview=1）改用記憶體資料，不連 Firebase，方便本機測試畫面。
 */
const CFG = window.RRQP_CONFIG || {};
const PREVIEW = /[?&]preview=1/.test(location.search);
const SDK = 'https://www.gstatic.com/firebasejs/10.14.1/';

// ───────── 儲存層：Firestore 或記憶體，介面相同 ─────────
async function firestoreStore() {
  const [{ initializeApp }, A, F] = await Promise.all([
    import(SDK + 'firebase-app.js'), import(SDK + 'firebase-auth.js'), import(SDK + 'firebase-firestore.js'),
  ]);
  const app = initializeApp(CFG.firebase);
  const auth = A.getAuth(app);
  let db;
  try { db = F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) }); }
  catch (_) { db = F.getFirestore(app); }          // 無痕視窗等不支援本機快取時
  const ref = (path) => F.doc(db, path);
  /** Firestore 的 Timestamp 一律轉成毫秒數字，畫面程式不用處理 */
  const norm = (v) => (v && typeof v.toMillis === 'function' ? v.toMillis() : Array.isArray(v) ? v.map(norm) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, norm(x)])) : v);
  const toOps = (b, ops) => ops.forEach((o) => {
    if (o.op === 'set') b.set(ref(o.path), o.data, o.merge ? { merge: true } : {});
    else if (o.op === 'update') b.update(ref(o.path), o.data);
    else if (o.op === 'del') b.delete(ref(o.path));
  });
  return {
    async get(path) { const s = await F.getDoc(ref(path)); return s.exists() ? norm(s.data()) : null; },
    async list(coll) { const s = await F.getDocs(F.collection(db, coll)); return s.docs.map((d) => Object.assign({ id: d.id }, norm(d.data()))); },
    /** 查詢（例如 assignees array-contains 自己的 Email） */
    async query(coll, field, op, value) { const s = await F.getDocs(F.query(F.collection(db, coll), F.where(field, op, value))); return s.docs.map((d) => Object.assign({ id: d.id }, norm(d.data()))); },
    ts: (ms) => F.Timestamp.fromMillis(Number(ms)),
    serverTime: () => F.serverTimestamp(),
    async set(path, data, merge) { await F.setDoc(ref(path), data, merge ? { merge: true } : {}); },
    async update(path, data) { await F.updateDoc(ref(path), data); },
    async del(path) { await F.deleteDoc(ref(path)); },
    async batch(ops) { for (let i = 0; i < ops.length; i += 450) { const b = F.writeBatch(db); toOps(b, ops.slice(i, i + 450)); await b.commit(); } },
    deleteField: () => F.deleteField(),
    /** 即時監聽：資料有變動就呼叫 cb；回傳取消監聽的函式 */
    watchDoc(path, cb) { return F.onSnapshot(ref(path), (s) => cb(s.exists() ? norm(s.data()) : null), (e) => console.warn('watch', path, e.code)); },
    watchColl(coll, cb) { return F.onSnapshot(F.collection(db, coll), (s) => cb(s.docs.map((d) => Object.assign({ id: d.id }, norm(d.data())))), (e) => console.warn('watch', coll, e.code)); },
    /** 流水號：用交易保證兩位講師同時申請也不會拿到同一個號碼；回傳第一個號碼 */
    async nextIds(kind, count) {
      return F.runTransaction(db, async (tx) => {
        const r = ref('meta/counters'), s = await tx.get(r);
        const cur = s.exists() ? Number(s.data()[kind] || 0) : 0;
        tx.set(r, { [kind]: cur + count }, { merge: true });
        return cur + 1;
      });
    },
    auth: {
      signIn: () => A.signInWithPopup(auth, new A.GoogleAuthProvider()),
      signOut: () => A.signOut(auth),
      onAuth: (cb) => A.onAuthStateChanged(auth, (u) => cb(u ? { email: String(u.email || '').toLowerCase(), name: u.displayName || '' } : null)),
    },
  };
}

function memoryStore() {
  const KEY = 'rrqp2:preview-db';
  let data = {};
  try { data = JSON.parse(sessionStorage.getItem(KEY) || '{}'); } catch (_) { /* */ }
  const watchers = new Set();
  const save = () => { try { sessionStorage.setItem(KEY, JSON.stringify(data)); } catch (_) { /* */ } setTimeout(() => watchers.forEach((w) => w()), 0); };
  const DEL = { __del: true };
  const setPath = (obj, dotted, v) => {
    const ks = dotted.split('.'); let o = obj;
    ks.slice(0, -1).forEach((k) => { if (typeof o[k] !== 'object' || o[k] === null) o[k] = {}; o = o[k]; });
    if (v === DEL) delete o[ks.at(-1)]; else o[ks.at(-1)] = v;
  };
  const clone = (o) => (o == null ? null : JSON.parse(JSON.stringify(o)));
  const deep = (a, b) => { Object.entries(b).forEach(([k, v]) => { if (v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k])) deep(a[k], v); else a[k] = v; }); return a; };
  const apply = (o) => {
    if (o.op === 'set') data[o.path] = o.merge ? deep(clone(data[o.path] || {}), clone(o.data)) : clone(o.data);
    else if (o.op === 'update') { if (!data[o.path]) throw new Error('No document to update: ' + o.path); Object.entries(o.data).forEach(([k, v]) => setPath(data[o.path], k, v === DEL ? DEL : clone(v))); }
    else if (o.op === 'del') delete data[o.path];
  };
  let user = null; const subs = [];
  return {
    async get(path) { return clone(data[path] || null); },
    async list(coll) {
      const pre = coll + '/';
      return Object.keys(data).filter((p) => p.startsWith(pre) && !p.slice(pre.length).includes('/')).map((p) => Object.assign({ id: p.slice(pre.length) }, clone(data[p])));
    },
    async set(path, d, merge) { apply({ op: 'set', path, data: d, merge }); save(); },
    async update(path, d) { apply({ op: 'update', path, data: d }); save(); },
    async del(path) { apply({ op: 'del', path }); save(); },
    async batch(ops) { ops.forEach(apply); save(); },
    async query(coll, field, op, value) {
      return (await this.list(coll)).filter((d) => (op === 'array-contains' ? (d[field] || []).includes(value) : op === '==' ? d[field] === value : true));
    },
    ts: (ms) => Number(ms),
    serverTime: () => Date.now(),
    deleteField: () => DEL,
    async nextIds(kind, count) { const c = data['meta/counters'] || (data['meta/counters'] = {}); const first = Number(c[kind] || 0) + 1; c[kind] = first + count - 1; save(); return first; },
    auth: {
      signIn: async () => { user = { email: (CFG.OWNER || 'preview@shopee.com').toLowerCase(), name: 'Preview' }; subs.forEach((cb) => cb(user)); },
      signOut: async () => { user = null; subs.forEach((cb) => cb(null)); },
      onAuth: (cb) => { subs.push(cb); cb(user); },
    },
    devPut: (path, d) => { data[path] = clone(d); save(); },
    watchDoc(path, cb) { const w = () => cb(clone(data[path] || null)); watchers.add(w); w(); return () => watchers.delete(w); },
    watchColl(coll, cb) { const pre = coll + '/'; const w = () => cb(Object.keys(data).filter((p) => p.startsWith(pre) && !p.slice(pre.length).includes('/')).map((p) => Object.assign({ id: p.slice(pre.length) }, clone(data[p])))); watchers.add(w); w(); return () => watchers.delete(w); },   // 只在預覽模式：放入測試資料
  };
}

// ───────── 共用 ─────────
const VERSION = 'V2-2026-11-04m';
let S = null, ME = null, currentEmail = null;
const now = () => Date.now();
const fail = (msg) => { throw new Error(msg); };
const slug = (s, max = 30) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max);
const bumpVersion = (v) => { const m = /^v(\d+)$/.exec(String(v || '')); return m ? 'v' + (Number(m[1]) + 1) : 'v2'; };
const friendly = (e) => {
  const code = e && e.code ? String(e.code) : '';
  if (/permission-denied/.test(code)) return '沒有權限執行這個動作 / Permission denied';
  if (/unavailable|network/.test(code)) return '連線不穩定，請稍後再試 / Network unavailable';
  if (/popup-closed|cancelled-popup/.test(code)) return '已取消登入 / Sign-in cancelled';
  if (/popup-blocked/.test(code)) return '瀏覽器擋住了登入視窗，請允許彈出視窗 / Allow pop-ups to sign in';
  if (/admin-restricted-operation/.test(code)) return 'Firebase 目前不允許建立新帳號：請到 Authentication → 設定 → 使用者動作，勾選「啟用建立（註冊）」/ New sign-ups are disabled in Firebase Authentication';
  if (/unauthorized-domain/.test(code)) return '這個網址尚未加入 Firebase 已授權網域 / This domain is not authorized';
  return e && e.message ? e.message : String(e);
};

async function whoAmI() {
  if (ME && ME.email === currentEmail) return ME;
  const email = currentEmail;
  if (!email) fail('Not signed in');
  let role = 'agent';
  try { const r = await S.get('roles/' + email); if (r && (r.role === 'tw' || r.role === 'bpo')) role = r.role; } catch (_) { /* 專員讀不到別人的，讀自己的沒有時也是 agent */ }
  if (email === String(CFG.OWNER || '').toLowerCase()) role = 'tw';
  ME = { email, role, isTeacher: role === 'tw' || role === 'bpo', version: VERSION };
  return ME;
}
const needTeacher = async () => { const m = await whoAmI(); if (!m.isTeacher) fail('Teacher access only / 僅限講師'); return m; };
const needTW = async () => { const m = await whoAmI(); if (m.role !== 'tw') fail('TW teacher access only / 僅限 TW 講師'); return m; };

const topicOut = (t) => ({ topicId: t.id, name: t.name || { zh: t.id, en: t.id }, criteriaVersion: t.criteriaVersion || 'v1', active: t.active !== false,
  prompt: t.prompt || null, defaultOptionSet: t.defaultOptionSet || '' });

// ───────── DMS 系統規則（與主題無關，所有題目都要遵守） ─────────
const SOLUTIONS = ['Return and Refund', 'Refund Only'];
/** 預設規則：DMS 申退原因與允許的申請方案（2025-Dec）；設定頁儲存後以 settings/dms 為準 */
const DEFAULT_DMS = {
  reasons: [
    { en: 'Parcel not delivered', zh: '包裹未送達／無法取件', solutions: ['Refund Only'], aliases: [] },
    { en: 'Missing part of the order', zh: '商品缺件／賣家通知缺貨', solutions: ['Return and Refund', 'Refund Only'], aliases: [] },
    { en: 'Seller sent wrong item (e.g wrong size, model)', zh: '收到完全不同的商品', solutions: ['Return and Refund'], aliases: [] },
    { en: 'Damaged item', zh: '商品外表瑕疵／毀損', solutions: ['Return and Refund'], aliases: [] },
    { en: 'Product is defective or does not work', zh: '商品功能有問題', solutions: ['Return and Refund'], aliases: [] },
    { en: 'Counterfeit product', zh: '商品有仿品疑慮', solutions: ['Return and Refund'], aliases: [] },
    { en: 'I want to return item in original / sealed condition', zh: '其它(商品須以原包裝退還)', solutions: ['Return and Refund'], aliases: [] },
    { en: 'Product is significantly different from description', zh: '實品與賣場描述／圖片有落差', solutions: ['Return and Refund'], aliases: ['Product does not meet expectations'] },
    { en: 'Empty Parcel', zh: '只收到破壞袋、外箱', solutions: ['Refund Only'], aliases: [] },
  ],
  notes: '',
};
/** 比對用：忽略大小寫與空白（"Damaged Item" = "Damaged item"、"original/ sealed" = "original / sealed"） */
const reasonKey = (s) => String(s || '').toLowerCase().replace(/\s+/g, '');
function findReason(rules, name) {
  const k = reasonKey(name);
  if (!k) return null;
  return ((rules && rules.reasons) || []).find((x) => reasonKey(x.en) === k || (x.aliases || []).some((a) => reasonKey(a) === k)) || null;
}
/** 舊名稱、大小寫不同 → 換成規則表的正式英文名稱 */
function normalizeReason(q, rules) {
  const r = q && q.request; if (!r || Array.isArray(rules)) return q;
  const e = findReason(rules, r.reason);
  if (e && r.reason !== e.en) r.reason = e.en;
  return q;
}
async function loadDms() {
  const d = await S.get('settings/dms').catch(() => null);
  return d && Array.isArray(d.reasons) && d.reasons.length ? { reasons: d.reasons, notes: d.notes || '', updatedAt: d.updatedAt || null, saved: true } : Object.assign({ saved: false }, DEFAULT_DMS);
}
/** 判斷時點：題目內所有時間都不能晚於 cutoff（格式 YYYY-MM-DD HH:mm） */
const TS_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/;
function cutoffErrors(q) {
  const c = q && q.cutoff;
  if (c === undefined || c === null || c === '') return [];
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(String(c))) return ['cutoff must be YYYY-MM-DD HH:mm'];
  const out = [];
  const chk = (t, p) => { if (TS_RE.test(String(t || '')) && String(t).slice(0, 16) > c) out.push(p + ' (' + t + ') is after the cutoff ' + c); };
  (q.chat || []).forEach((m, j) => chk(m && m.t, 'chat[' + j + '].t'));
  ['buyer', 'seller'].forEach((s) => ((q.drc || {})[s] || []).forEach((d, j) => chk(d && d.t, 'drc.' + s + '[' + j + '].t')));
  ((q.logistics || {}).events || []).forEach((e, j) => chk(e && e.t, 'logistics.events[' + j + '].t'));
  return out;
}
const tagOut = (t) => ({ tagId: t.id, topicId: t.topicId, name: t.name || { zh: t.id, en: t.id }, desc: t.desc || '' });

// ───────── 範例的共用處理 ─────────
const reqOut = (r) => ({ requestId: r.id, requestedBy: r.requestedBy || '', requestedAt: r.requestedAt || null, returnId: r.returnId || '', topicId: r.topicId || 'agreement',
  wantedTags: r.wantedTags || [], note: r.note || '', status: r.status, reason: r.reason || '', sampleId: r.sampleId || '', updatedAt: r.updatedAt || null,
  cutoffAt: r.cutoffAt || null, noCutoff: !!r.noCutoff });
/** 主題必須存在且啟用中（建立草稿、申請範例時檢查） */
async function activeTopic(topicId) {
  if (!topicId) fail('請選擇主題 / Choose a topic');
  const t = await S.get('topics/' + topicId);
  if (!t) fail('找不到主題 / Topic not found');
  if (t.active === false) fail('這個主題已停用 / This topic is inactive');
  return t;
}
const indexRow = (x, req) => ({ topicId: x.topicId, tags: x.tags || [], pointZh: x.pointZh || '', answer: x.answer || '', changeHint: x.changeHint || '', status: x.status,
  source: x.source || '', requestId: x.requestId || '', requestedBy: (req && req.requestedBy) || '', wantedTags: (req && req.wantedTags) || [], approvedBy: x.approvedBy || '', updatedAt: x.updatedAt || null,
  ...gapOf(x), gapState: x.gapState || '', enPending: (x.enPending || []).length });
/** 判斷標準缺口：講師修正後 AI 分析的結果（criteriaGap）優先於匯入時的回報（suggest.criteriaGap） */
function gapOf(x) {
  const g = (x.criteriaGap && x.criteriaGap.kind !== 'ai_misread' && x.criteriaGap.situation) ? x.criteriaGap : (x.suggest && x.suggest.criteriaGap) || null;
  return { gap: (g && g.situation) || '', gapSuggestion: String((g && g.suggestion) || '').slice(0, 500) };
}
async function sampleFull(id) {
  const x = await S.get('samples/' + id) || fail('找不到範例 / Sample not found: ' + id);
  const req = x.requestId ? await S.get('sampleRequests/' + x.requestId).catch(() => null) : null;
  return Object.assign({ sampleId: id, tags: [], changeHint: '', reviewNote: '', suggest: null, criteriaGap: null }, x, { _m: metaOut(x) }, {
    wantedTags: (req && req.wantedTags) || [], requestedBy: (req && req.requestedBy) || '', note: (req && req.note) || '',
    returnId: (req && req.returnId) || '', cutoffAt: (req && req.cutoffAt) || null, noCutoff: !!(req && req.noCutoff) });
}
/** 範例與範例索引在同一批寫入 */
async function saveSample(id, cur, patch) {
  const next = Object.assign({}, cur, patch);
  const req = next.requestId ? await S.get('sampleRequests/' + next.requestId).catch(() => null) : null;
  await S.batch([{ op: 'update', path: 'samples/' + id, data: patch }, { op: 'set', path: 'meta/sampleIndex', merge: true, data: { items: { [id]: indexRow(next, req) } } }]);
}

// ───────── 題目格式檢查與外洩掃描（與排程、舊版平台相同規則） ─────────
function leakScan(obj, returnId) {
  const text = JSON.stringify(obj), hits = [];
  if (returnId && text.includes(String(returnId))) hits.push('原始 Return ID');
  [[/\b\d{6}[A-Z0-9]{6,10}\b/, '疑似訂單編號'], [/\b(TW|SPX|TWS|NP|BL)[A-Z0-9]?\d{8,}\b/i, '疑似物流追蹤號碼'], [/\b09\d{2}[-\s]?\d{3}[-\s]?\d{3}\b/, '疑似手機號碼'],
    [/[\w.+-]+@[\w-]+\.[\w.-]+/, '疑似 Email'], [/https?:\/\/[^\s"]+/, '網址'], [/\b\d{14,}\b/, '疑似長數字編號']].forEach(([re, n]) => { if (re.test(text)) hits.push(n); });
  return hits;
}
function checkQuestion(q, reasons, opt = {}) {
  const errs = [], warn = [];
  const need = (c, m) => { if (!c) errs.push(m); };
  const bi = (v, p) => {
    if (!v || typeof v !== 'object') { errs.push(p + ' must be {zh, en}'); return; }
    if (!String(v.zh || '').trim()) errs.push(p + '.zh empty');
    if (opt.allowEmptyEn) return;                   // 講師編輯：英文可以留白，存檔後標成「待翻譯」
    if (!String(v.en || '').trim()) errs.push(p + '.en empty');
    if (/[㐀-鿿]/.test(String(v.en || ''))) warn.push(p + '.en contains Chinese');
  };
  if (!q || typeof q !== 'object') return { errors: ['not an object'], warnings: [] };
  need(['A', 'B', 'C'].includes(q.type), 'type must be A / B / C');
  bi(q.prompt, 'prompt');
  ['buyer', 'seller'].forEach((s) => need(q[s] && q[s].id && q[s].username, s + '.id / ' + s + '.username missing'));
  need(Array.isArray(q.chat) && q.chat.length, 'chat must be a non-empty array');
  (q.chat || []).forEach((m, j) => {
    const p = 'chat[' + j + ']';
    if (!m) { errs.push(p + ' missing'); return; }
    need(m.t, p + '.t missing'); need(m.from === 'buyer' || m.from === 'seller', p + '.from must be buyer / seller');
    if (m.type === 'text') bi(m.text, p + '.text');
    else if (m.type === 'sticker') need(m.sticker === 'ok' || m.sticker === 'thanks', p + '.sticker must be ok / thanks');
    else if (m.type === 'media') { need(m.kind === 'image' || m.kind === 'video', p + '.kind must be image / video'); if (!m.src) bi(m.desc, p + '.desc'); }
    else errs.push(p + '.type must be text / sticker / media');
  });
  const drc = q.drc || {};
  need(Array.isArray(drc.buyer) && Array.isArray(drc.seller), 'drc.buyer / drc.seller must be arrays');
  ['buyer', 'seller'].forEach((side) => (drc[side] || []).forEach((d, j) => {
    const p = 'drc.' + side + '[' + j + ']';
    if (d && d.type === 'offer') need(d.solution && typeof d.amount === 'number', p + ' offer needs solution + numeric amount');
    else if (d && d.type === 'text') bi(d.text, p + '.text');
    else errs.push(p + '.type must be offer / text');
  }));
  const r = q.request || {};
  need(r.solution === 'Refund Only' || r.solution === 'Return and Refund', 'request.solution must be Refund Only / Return and Refund');
  need(typeof r.amount === 'number', 'request.amount must be a number');
  const key = (it) => String((it && it.name && it.name.zh) || '') + '|' + String((it && it.variation && it.variation.zh) || '');
  const oi = q.order && q.order.items, ri = r.items;
  need(Array.isArray(oi) && oi.length, 'order.items must be a non-empty array');
  need(Array.isArray(ri) && ri.length, 'request.items must be a non-empty array');
  [['order.items', oi], ['request.items', ri]].forEach(([path, arr]) => (arr || []).forEach((it, j) => {
    const p = path + '[' + j + ']';
    if (!it || typeof it !== 'object') { errs.push(p + ' must be an object'); return; }
    bi(it.name, p + '.name'); if (it.variation !== undefined) bi(it.variation, p + '.variation');
    need(Number.isInteger(it.qty) && it.qty > 0, p + '.qty must be a positive integer');
    need(typeof it.price === 'number' && it.price > 0, p + '.price must be a positive number');
  }));
  if (Array.isArray(oi) && Array.isArray(ri)) {
    const ordered = {}; oi.forEach((it) => { if (it) ordered[key(it)] = it; });
    let sum = 0;
    ri.forEach((it, j) => {
      if (!it) return;
      const o = ordered[key(it)];
      if (!o) { errs.push('request.items[' + j + '] (' + key(it) + ') is not in order.items'); return; }
      if (it.qty > o.qty) errs.push('request.items[' + j + '].qty ' + it.qty + ' exceeds ordered qty ' + o.qty);
      if (it.price !== o.price) errs.push('request.items[' + j + '].price must equal the order price ' + o.price);
      sum += (Number(it.qty) || 0) * (Number(it.price) || 0);
    });
    const ded = r.deduction !== undefined ? Number(r.deduction) : 0;
    if (!(ded >= 0) || (ded >= sum && sum > 0)) errs.push('request.deduction must be >= 0 and less than the items subtotal');
    if (typeof r.amount === 'number' && Math.round((sum - ded) * 100) !== Math.round(r.amount * 100)) errs.push('request.amount ' + r.amount + ' must equal the sum of request.items price x qty (' + sum + ')' + (ded ? ' minus deduction ' + ded : ''));
  }
  const pay = q.payment; if (!pay) errs.push('payment missing'); else { bi(pay.method, 'payment.method'); bi(pay.status, 'payment.status'); }
  const lg = q.logistics;
  if (!lg) errs.push('logistics missing');
  else { bi(lg.carrier, 'logistics.carrier'); need(Array.isArray(lg.events) && lg.events.length, 'logistics.events must be a non-empty array'); (lg.events || []).forEach((e, j) => { need(e && e.t, 'logistics.events[' + j + '].t missing'); if (e) bi(e.status, 'logistics.events[' + j + '].status'); }); }
  if (Array.isArray(reasons)) { if (reasons.length && !reasons.includes(r.reason)) errs.push('request.reason "' + r.reason + '" is not in the allowed list'); }
  else if (reasons && reasons.reasons) {
    const e = findReason(reasons, r.reason);
    if (!e) errs.push('request.reason "' + r.reason + '" is not a DMS return reason (use one of: ' + reasons.reasons.map((x) => x.en).join(' | ') + ')');
    else if (SOLUTIONS.includes(r.solution) && !(e.solutions || []).includes(r.solution)) errs.push('DMS rule: reason "' + e.en + '" only allows ' + (e.solutions || []).join(' / ') + ' as the request solution, but request.solution is "' + r.solution + '"');
  }
  cutoffErrors(q).forEach((x) => errs.push(x));
  bi(r.remark, 'request.remark');
  const fo = (drc.buyer || []).find((d) => d && d.type === 'offer');
  if (fo && (fo.solution !== r.solution || fo.amount !== r.amount)) errs.push('drc.buyer first offer (' + fo.solution + ' $' + fo.amount + ') must equal request (' + r.solution + ' $' + r.amount + ')');
  if (q.type === 'A' || q.type === 'B') {
    const opts = Array.isArray(q.options) ? q.options : [];
    need(opts.length >= 2 && opts.length <= 8, 'options must have 2–8 items');
    opts.forEach((o, j) => { need(o && o.id, 'options[' + j + '].id missing'); if (o) bi(o.text, 'options[' + j + '].text'); });
    need(opts.some((o) => o && o.id === q.answer), 'answer must be one of the option ids');
  }
  if (q.type === 'B' || q.type === 'C') { bi(q.modelAnswer, 'modelAnswer'); bi(q.rubric, 'rubric'); }
  bi(q.explanation, 'explanation'); bi(q.point, 'point');
  return { errors: errs, warnings: warn };
}

// ───────── 英文同步：逐欄位比對講師改了哪裡 ─────────
const CJK = /[㐀-鿿]/;
/** 題目中所有 {zh, en} 欄位 → { 'chat.3.text': {zh, en}, ... } */
function biLeaves(o, pre = '', out = {}) {
  if (Array.isArray(o)) o.forEach((x, i) => biLeaves(x, pre + i + '.', out));
  else if (o && typeof o === 'object') {
    const ks = Object.keys(o);
    if (ks.length && ks.every((k) => k === 'zh' || k === 'en') && ks.includes('zh')) out[pre.slice(0, -1)] = { zh: String(o.zh || ''), en: String(o.en || '') };
    else ks.forEach((k) => biLeaves(o[k], pre + k + '.', out));
  }
  return out;
}
/**
 * 存檔時決定哪些欄位的英文要重新翻譯：
 *   只改中文 → 待翻譯；英文有改（講師自己同步）或兩邊都改 → 不翻；英文空白或還是中文 → 待翻譯；
 *   沒改 → 維持原狀態；訊息上下移動時用「中文＋英文」對回原欄位，沿用原本的狀態。
 */
function enPendingAfter(oldQ, newQ, prev) {
  const o = biLeaves(oldQ || {}), n = biLeaves(newQ || {}), was = new Set(prev || []), out = [];
  const byPair = {}; Object.entries(o).forEach(([p, v]) => { byPair[v.zh + '\u0000' + v.en] = p; });
  Object.entries(n).forEach(([p, v]) => {
    if (!v.zh.trim()) return;
    if (!v.en.trim() || CJK.test(v.en)) { out.push(p); return; }
    const ol = o[p];
    if (ol && ol.zh === v.zh && ol.en === v.en) { if (was.has(p)) out.push(p); return; }
    const moved = byPair[v.zh + '\u0000' + v.en];
    if (moved !== undefined) { if (was.has(moved)) out.push(p); return; }
    if (ol && ol.en === v.en && ol.zh !== v.zh) out.push(p);
  });
  return out;
}
const sameQ = (a, b) => JSON.stringify(a || {}) === JSON.stringify(b || {});
/** 題目以外的處理狀態（英文待翻譯、修訂號、AI 審查）放在 _m，存檔時移除 */
const metaOut = (x) => ({ enPending: x.enPending || [], rev: x.rev || 0, review: x.review || null, reviewWanted: !!x.reviewWanted, blind: x.blind || null });
const STRIP = ['id', 'qid', 'seq', 'points', 'reviewed', 'criteriaVersion', 'warnings', 'bankedAs', '_m'];

/** 題目的判斷重點（中文）與正解（選項中文文字） */
function judgementOf(q) {
  const o = ((q && q.options) || []).find((x) => x && x.id === q.answer);
  return { pointZh: String((q && q.point && q.point.zh) || '').slice(0, 200), answer: o ? String((o.text && o.text.zh) || '') : '' };
}

// ───────── 草稿與題庫的共用處理 ─────────
const draftOut = (d) => ({ draftId: d.id, name: d.name, topicId: d.topicId, tags: d.tags || [], target: d.target || 0, mix: d.mix || {}, imported: d.imported || 0,
  reviewed: d.reviewed || 0, status: d.status, createdBy: d.createdBy || '', updatedAt: d.updatedAt ? new Date(d.updatedAt).toISOString() : null, version: d.updatedAt || 0 });
const questionOut = (q) => Object.assign({}, q.question || {}, { id: q.id, reviewed: !!q.reviewed, criteriaVersion: q.criteriaVersion || '', warnings: q.warnings || [], _m: metaOut(q) });
const bankIndexRow = (x) => {
  const j = x.question || {}, opt = (j.options || []).find((o) => o.id === j.answer);
  return { topicId: x.topicId, type: x.type, tags: x.tags || [], pointZh: x.pointZh || '', point: j.point || null, prompt: j.prompt || null, answer: opt ? opt.text : null,
    criteriaVersion: x.criteriaVersion || '', status: x.status, version: x.version || 1, sourceDraft: x.sourceDraft || '', sourceQid: x.sourceQid || '', updatedAt: x.updatedAt || null,
    used: x.used || 0, rateSum: x.rateSum || 0, rateN: x.rateN || 0 };
};
/** 草稿題目 → 題庫編號（從題庫索引查，不用讀整個題庫） */
async function bankedBySource() {
  const idx = (await S.get('meta/bankIndex')) || {}; const m = {};
  Object.entries(idx.items || {}).forEach(([qid, r]) => { if (r.sourceQid) m[r.sourceQid] = qid; });
  return m;
}
/** 重新計算已校對題數；可發佈的草稿被修改後退回待校對 */
async function touchDraft(draftId, d) {
  const qs = await S.list('drafts/' + draftId + '/questions');
  const patch = { reviewed: qs.filter((q) => q.reviewed).length, updatedAt: now() };
  if (d.status === 'ready' && patch.reviewed < qs.length) patch.status = 'draft';
  await S.update('drafts/' + draftId, patch);
  return draftOut(Object.assign({ id: draftId }, d, patch));
}

// ───────── 動作 ─────────
const ACTIONS = {
  me: async () => whoAmI(),

  /** 主題、標籤（啟用 / 停用）、選項範本：各頁共用 */
  t_topics: async () => {
    await needTeacher();
    const [topics, tags, sets, dms] = await Promise.all([S.list('topics'), S.list('tags'), S.list('optionSets'), loadDms()]);
    return {
      topics: topics.map(topicOut).sort((a, b) => (b.active - a.active) || a.topicId.localeCompare(b.topicId)),
      dms,
      tags: tags.filter((t) => t.active !== false).map(tagOut),
      inactiveTags: tags.filter((t) => t.active === false).map(tagOut),
      optionSets: sets.map((o) => ({ setId: o.id, name: o.name, options: o.options || [] })),
    };
  },

  tw_addTag: async (b) => {
    const m = await needTW();
    const topic = await S.get('topics/' + (b.topicId || 'agreement'));
    if (!topic) fail('找不到主題 / Topic not found');
    const zh = String(b.nameZh || '').trim().slice(0, 20), en = String(b.nameEn || '').trim().slice(0, 40);
    if (!zh || !en) fail('請填寫中文與英文名稱 / Both names are required');
    const all = await S.list('tags');
    if (all.some((t) => t.topicId === b.topicId && String(t.name?.zh || '').trim() === zh)) fail('這個主題已有同名標籤 / A tag with this name already exists: ' + zh);
    const base = slug(en) || 'tag';
    let tagId = base, n = 2;
    while (all.some((t) => t.id === tagId)) tagId = base + '-' + (n++);
    await S.set('tags/' + tagId, { topicId: b.topicId, name: { zh, en }, desc: String(b.descZh || '').trim().slice(0, 200), active: true, updatedAt: now(), updatedBy: m.email });
    return { tag: { tagId, topicId: b.topicId, name: { zh, en } } };
  },

  tw_updateTag: async (b) => {
    const m = await needTW();
    const r = await S.get('tags/' + b.tagId);
    if (!r) fail('找不到標籤 / Tag not found: ' + b.tagId);
    const patch = { updatedAt: now(), updatedBy: m.email };
    if (b.nameZh !== undefined || b.nameEn !== undefined) {
      const zh = String(b.nameZh ?? r.name.zh).trim().slice(0, 20), en = String(b.nameEn ?? r.name.en).trim().slice(0, 40);
      if (!zh || !en) fail('請填寫中文與英文名稱 / Both names are required');
      const all = await S.list('tags');
      if (all.some((t) => t.id !== b.tagId && t.topicId === r.topicId && String(t.name?.zh || '').trim() === zh)) fail('這個主題已有同名標籤 / A tag with this name already exists: ' + zh);
      patch.name = { zh, en };
    }
    if (b.descZh !== undefined) patch.desc = String(b.descZh || '').trim().slice(0, 200);
    if (b.active !== undefined) patch.active = !!b.active;
    await S.update('tags/' + b.tagId, patch);
    return { tag: { tagId: b.tagId, topicId: r.topicId, name: patch.name || r.name, active: b.active !== undefined ? !!b.active : r.active !== false } };
  },

  // ─── 題庫生成（草稿） ───
  t_createDraft: async (b) => {
    const m = await needTeacher();
    const name = String(b.name || '').trim();
    if (!name) fail('草稿名稱必填 / Draft name is required');
    const topicId = String(b.topicId || '');
    await activeTopic(topicId);
    const target = Number(b.target);
    if (!(target >= 1 && target <= 50)) fail('題數需介於 1–50 / Target must be 1–50');
    const mx = b.mix || {};
    const mix = { A: Number(mx.A) || 0, B: Number(mx.B) || 0, C: Number(mx.C) || 0 };
    if (mix.A + mix.B + mix.C === 0) mix.B = target;
    if (mix.A + mix.B + mix.C !== target) fail('題型數量加總需等於題數 / Type mix must add up to target');
    const tags = (b.tags || []).map(String);
    const known = new Set((await S.list('tags')).filter((t) => t.topicId === topicId).map((t) => t.id));
    const unknown = tags.filter((t) => !known.has(t));
    if (unknown.length) fail('未知的標籤 / Unknown tags: ' + unknown.join(', '));
    const n = await S.nextIds('D', 1);
    const draftId = 'D' + String(n).padStart(3, '0'), t = now();
    await S.set('drafts/' + draftId, { name, topicId, tags, target, mix, imported: 0, reviewed: 0, status: 'generating', createdBy: m.email, createdAt: t, updatedAt: t });
    return { draftId, command: '生成考題 ' + draftId };
  },

  t_listDrafts: async () => {
    await needTeacher();
    const rows = await S.list('drafts');
    return { drafts: rows.filter((d) => d.status !== 'deleted').map(draftOut).sort((a, b) => b.draftId.localeCompare(a.draftId)) };
  },

  t_deleteDraft: async (b) => {
    const m = await needTeacher();
    const d = await S.get('drafts/' + b.draftId) || fail('找不到草稿 / Draft not found');
    const [qs, banked] = await Promise.all([S.list('drafts/' + b.draftId + '/questions'), bankedBySource()]);
    await S.update('drafts/' + b.draftId, { status: 'deleted', prevStatus: d.status, updatedAt: now(), updatedBy: m.email });
    return { deleted: b.draftId, unbanked: qs.filter((q) => !banked[q.id]).length };
  },

  t_getDraft: async (b) => {
    await needTeacher();
    const d = await S.get('drafts/' + b.draftId) || fail('找不到草稿 / Draft not found: ' + b.draftId);
    const [qs, banked] = await Promise.all([S.list('drafts/' + b.draftId + '/questions'), bankedBySource()]);
    return { draft: draftOut(Object.assign({ id: b.draftId }, d)), questions: qs.sort((x, y) => (x.seq || 0) - (y.seq || 0)).map((q) => Object.assign(questionOut(q), { bankedAs: banked[q.id] || null })) };
  },

  /** 修改一題（整題）；重新檢查格式，有錯誤就不寫入。可同時設定 reviewed */
  t_updateQuestion: async (b) => {
    const m = await needTeacher();
    const d = await S.get('drafts/' + b.draftId) || fail('找不到草稿 / Draft not found');
    if (d.status === 'generating') fail('草稿生成中，請等生成完成再修改 / Draft is still generating');
    const path = 'drafts/' + b.draftId + '/questions/' + b.qid;
    const row = await S.get(path) || fail('找不到題目 / Question not found: ' + b.qid);
    const q = Object.assign({}, b.question || {}); STRIP.forEach((k) => delete q[k]);
    const dms = await loadDms();
    normalizeReason(q, dms);
    const chk = checkQuestion(q, dms, { allowEmptyEn: true });
    if (chk.errors.length) fail('格式錯誤，未儲存 / Not saved: ' + chk.errors.slice(0, 6).join('; '));
    if (q.type !== row.type) fail('不能變更題型 / Question type cannot be changed');
    const changed = !sameQ(row.question, q);
    const patch = { question: q, answer: q.answer || '', pointZh: (q.point && q.point.zh) || '', warnings: chk.warnings, updatedAt: now(), updatedBy: m.email };
    if (changed) Object.assign(patch, { enPending: enPendingAfter(row.question, q, row.enPending), rev: (row.rev || 0) + 1 });
    if (b.reviewed !== undefined) patch.reviewed = !!b.reviewed;
    await S.update(path, patch);
    const nd = await touchDraft(b.draftId, d);
    return { question: questionOut(Object.assign({ id: b.qid }, row, patch)), draft: nd };
  },

  t_setReviewed: async (b) => {
    await needTeacher();
    const d = await S.get('drafts/' + b.draftId) || fail('找不到草稿 / Draft not found');
    if (d.status === 'generating') fail('草稿生成中 / Draft is still generating');
    if (b.reviewed) {
      const row = await S.get('drafts/' + b.draftId + '/questions/' + b.qid) || fail('找不到題目 / Question not found');
      const chk = checkQuestion(normalizeReason(Object.assign({}, row.question), await loadDms()), await loadDms(), { allowEmptyEn: true });
      if (chk.errors.length) fail('不符合目前的規則，請先修正 / Fix first: ' + chk.errors.slice(0, 4).join('; '));
    }
    await S.update('drafts/' + b.draftId + '/questions/' + b.qid, { reviewed: !!b.reviewed });
    return { qid: b.qid, reviewed: !!b.reviewed, draft: await touchDraft(b.draftId, d) };
  },

  /** 刪除一題；refill=true 時草稿回到生成中，再傳一次指令讓 Agent 補題；否則題數減 1 */
  t_deleteQuestion: async (b) => {
    await needTeacher();
    const d = await S.get('drafts/' + b.draftId) || fail('找不到草稿 / Draft not found');
    if (d.status === 'generating') fail('草稿生成中 / Draft is still generating');
    const path = 'drafts/' + b.draftId + '/questions/' + b.qid;
    const row = await S.get(path) || fail('找不到題目 / Question not found: ' + b.qid);
    const patch = { imported: Math.max(0, (d.imported || 0) - 1), updatedAt: now() };
    if (b.refill) patch.status = 'generating';
    else {
      const mix = Object.assign({ A: 0, B: 0, C: 0 }, d.mix);
      if (mix[row.type] > 0) mix[row.type]--;
      Object.assign(patch, { mix, target: Math.max(0, (d.target || 0) - 1), status: 'draft' });
    }
    await S.batch([{ op: 'del', path }, { op: 'update', path: 'drafts/' + b.draftId, data: patch }]);
    const nd = await touchDraft(b.draftId, Object.assign({}, d, patch));
    return { deleted: b.qid, draft: nd, command: b.refill ? '生成考題 ' + b.draftId : '' };
  },

  /** 要求 AI 檢查（下次「處理」指令時會審查這題）；草稿題目或範例 */
  t_requestReview: async (b) => {
    const m = await needTeacher();
    const path = b.sampleId ? 'samples/' + b.sampleId : 'drafts/' + b.draftId + '/questions/' + b.qid;
    if (b.sampleId && m.role !== 'tw') fail('TW teacher access only / 僅限 TW 講師');
    if (!(await S.get(path))) fail('找不到題目 / Not found');
    await S.update(path, { reviewWanted: b.wanted !== false });
    if (!b.sampleId) await S.update('drafts/' + b.draftId, { updatedAt: now() });
    return { reviewWanted: b.wanted !== false };
  },

  t_markReady: async (b) => {
    await needTeacher();
    const d = await S.get('drafts/' + b.draftId) || fail('找不到草稿 / Draft not found');
    if (b.ready === false) { await S.update('drafts/' + b.draftId, { status: 'draft', updatedAt: now() }); return { draft: draftOut(Object.assign({ id: b.draftId }, d, { status: 'draft' })) }; }
    if (d.status !== 'draft') fail('只有「待校對」的草稿可以標記為可發佈 / Only drafts under review can be marked ready');
    const qs = await S.list('drafts/' + b.draftId + '/questions');
    if (!qs.length) fail('草稿沒有題目 / Draft has no questions');
    const left = qs.filter((q) => !q.reviewed).length;
    if (left) fail('還有 ' + left + ' 題未校對 / ' + left + ' question(s) not reviewed');
    await S.update('drafts/' + b.draftId, { status: 'ready', updatedAt: now() });
    return { draft: draftOut(Object.assign({ id: b.draftId }, d, { status: 'ready' })) };
  },

  /** 把草稿中已校對的題目加入題庫；題目、題庫索引、草稿狀態在同一批寫入 */
  t_bankAdd: async (b) => {
    const m = await needTeacher();
    const d = await S.get('drafts/' + b.draftId) || fail('找不到草稿 / Draft not found');
    if (d.status === 'generating') fail('草稿生成中 / Draft is still generating');
    const [all, banked] = await Promise.all([S.list('drafts/' + b.draftId + '/questions'), bankedBySource()]);
    all.sort((x, y) => (x.seq || 0) - (y.seq || 0));
    const want = Array.isArray(b.qids) && b.qids.length ? b.qids.map(String) : null;
    const pick = all.filter((q) => (!want || want.includes(q.id)) && !banked[q.id]);
    const notRev = pick.filter((q) => !q.reviewed);
    if (want && notRev.length) fail('只有已校對的題目可以入庫 / Only reviewed questions can be added: ' + notRev.map((q) => q.id).join(', '));
    const rows = pick.filter((q) => q.reviewed);
    if (!rows.length) fail('沒有可入庫的題目（需已校對且尚未入庫） / Nothing to add');
    const dms = await loadDms();
    const enQ = rows.filter((q) => (q.enPending || []).length);
    if (enQ.length) fail('以下題目還有英文待翻譯，請先在 SeaTalk 傳「處理 ' + b.draftId + '」/ English pending: ' + enQ.map((q) => q.id).join(', '));
    const badQ = rows.filter((q) => checkQuestion(normalizeReason(JSON.parse(JSON.stringify(q.question || {})), dms), dms).errors.length);
    if (badQ.length) fail('以下題目不符合目前的規則，請先修正 / Fix first: ' + badQ.map((q) => q.id).join(', '));
    const first = await S.nextIds('Q', rows.length), t = now(), ops = [], idx = {};
    const out = rows.map((q, i) => {
      const qid = 'Q' + String(first + i).padStart(4, '0'), j = q.question || {};
      const doc = { topicId: d.topicId, type: q.type, tags: j.tags || [], answer: j.answer || '', pointZh: (j.point && j.point.zh) || '', criteriaVersion: q.criteriaVersion || '',
        status: 'active', sourceDraft: b.draftId, sourceQid: q.id, addedBy: m.email, addedAt: t, updatedAt: t, version: 1, question: j };
      ops.push({ op: 'set', path: 'bank/' + qid, data: doc });
      idx[qid] = bankIndexRow(doc);
      return { qid, sourceQid: q.id };
    });
    ops.push({ op: 'set', path: 'meta/bankIndex', merge: true, data: { items: idx } });
    const allBanked = all.every((q) => banked[q.id] || rows.some((r) => r.id === q.id));
    if (allBanked) ops.push({ op: 'update', path: 'drafts/' + b.draftId, data: { status: 'banked', updatedAt: t } });
    await S.batch(ops);
    return { added: out, draft: draftOut(Object.assign({ id: b.draftId }, d, allBanked ? { status: 'banked' } : {})) };
  },

  // ─── 範例生成（TW 講師） ───
  tw_requestSamples: async (b) => {
    const m = await needTW();
    const topicId = String(b.topicId || '');
    await activeTopic(topicId);
    // items：[{returnId, cutoffAt}]；cutoffAt 是毫秒（判斷時點），沒有時必須勾選 noCutoff（使用完整資料）
    const raw = Array.isArray(b.items) ? b.items : String(Array.isArray(b.returnIds) ? b.returnIds.join('\n') : b.returnIds || '').split(/[\s,;]+/).map((x) => ({ returnId: x }));
    const seen = new Set(), items = [];
    raw.forEach((x) => { const id = String((x && x.returnId) || '').trim(); if (id && !seen.has(id)) { seen.add(id); items.push({ returnId: id, cutoffAt: x.cutoffAt ? Number(x.cutoffAt) : null }); } });
    const ids = items.map((x) => x.returnId);
    if (!ids.length) fail('請輸入 Return ID / Enter at least one Return ID');
    const bad = ids.filter((x) => !/^\d{6,20}$/.test(x));
    if (bad.length) fail('Return ID 格式錯誤（只能是數字） / Invalid Return ID: ' + bad.join(', '));
    if (ids.length > 30) fail('一次最多 30 筆 / At most 30 per request');
    const badT = items.filter((x) => x.cutoffAt !== null && !(x.cutoffAt > 1.5e12 && x.cutoffAt < now() + 864e5));
    if (badT.length) fail('判斷時點不正確（不能是未來時間） / Invalid cutoff: ' + badT.map((x) => x.returnId).join(', '));
    const noTime = items.filter((x) => x.cutoffAt === null);
    if (noTime.length && !b.noCutoff) fail('以下 Return ID 沒有填判斷時點；若確定使用完整資料，請勾選「不截斷」 / Missing cutoff: ' + noTime.map((x) => x.returnId).join(', '));
    // 等待中、處理中、已完成的 Return ID 不重複申請（取消或失敗的可以再申請）
    const open = new Set((await S.list('sampleRequests')).filter((r) => ['queued', 'processing', 'done'].includes(r.status)).map((r) => String(r.returnId)));
    const dup = ids.filter((x) => open.has(x)), add = items.filter((x) => !open.has(x.returnId));
    if (!add.length) return { added: 0, duplicates: dup };
    const first = await S.nextIds('R', add.length);
    const t = now(), tags = (b.wantedTags || []).map(String), note = String(b.note || '').slice(0, 500);
    await S.batch(add.map((x, i) => ({ op: 'set', path: 'sampleRequests/R' + String(first + i).padStart(4, '0'),
      data: { requestedBy: m.email, requestedAt: t, returnId: x.returnId, topicId, wantedTags: tags, note, status: 'queued', reason: '', sampleId: '', updatedAt: t,
        cutoffAt: x.cutoffAt, noCutoff: x.cutoffAt === null } })));
    return { added: add.length, duplicates: dup };
  },

  tw_listRequests: async () => {
    await needTW();
    const rows = await S.list('sampleRequests');
    return { requests: rows.map(reqOut).sort((a, b) => b.requestId.localeCompare(a.requestId)) };
  },

  tw_cancelRequest: async (b) => {
    await needTW();
    const r = await S.get('sampleRequests/' + b.requestId) || fail('找不到申請 / Request not found');
    if (!['queued', 'failed'].includes(r.status)) fail('只能取消「等待中」或「失敗」的申請 / Only queued or failed requests can be cancelled');
    await S.update('sampleRequests/' + b.requestId, { status: 'cancelled', updatedAt: now() });
    return { requestId: b.requestId };
  },

  tw_retryRequest: async (b) => {
    await needTW();
    const r = await S.get('sampleRequests/' + b.requestId) || fail('找不到申請 / Request not found');
    if (r.status !== 'failed') fail('只能重試失敗的申請 / Only failed requests can be retried');
    await S.update('sampleRequests/' + b.requestId, { status: 'queued', reason: '', updatedAt: now() });
    return { requestId: b.requestId };
  },

  /** 範例列表只讀「範例索引」一份文件 */
  tw_listSamples: async () => {
    await needTW();
    const idx = (await S.get('meta/sampleIndex')) || {};
    const items = idx.items || {};
    return { samples: Object.keys(items).sort().reverse().map((id) => Object.assign({ sampleId: id, tags: [], wantedTags: [] }, items[id])) };
  },

  tw_getSample: async (b) => {
    await needTW();
    return { sample: await sampleFull(b.sampleId) };
  },

  /** 審核時調整：題目內容、標籤、判斷重點、正解、變化提示 */
  tw_updateSample: async (b) => {
    const m = await needTW();
    const cur = await S.get('samples/' + b.sampleId) || fail('找不到範例 / Sample not found: ' + b.sampleId);
    const patch = { updatedAt: now(), updatedBy: m.email };
    if (b.question) {
      const q = Object.assign({}, b.question); STRIP.forEach((k) => delete q[k]);
      const dms = await loadDms();
      normalizeReason(q, dms);
      const chk = checkQuestion(q, dms, { allowEmptyEn: true });
      if (chk.errors.length) fail('格式錯誤，未儲存 / Not saved: ' + chk.errors.slice(0, 6).join('; '));
      const leak = leakScan(q, '');
      if (leak.length) fail('內容疑似含有真實資料，未儲存 / Possible real data: ' + leak.join('、'));
      patch.question = q;
      if (!sameQ(cur.question, q)) Object.assign(patch, { enPending: enPendingAfter(cur.question, q, cur.enPending), rev: (cur.rev || 0) + 1 });
    }
    if (b.tags !== undefined) {
      const known = new Set((await S.list('tags')).filter((t) => t.topicId === cur.topicId).map((t) => t.id));
      const tags = (b.tags || []).map(String), unknown = tags.filter((t) => !known.has(t));
      if (unknown.length) fail('未知的標籤 / Unknown tags: ' + unknown.join(', '));
      patch.tags = tags;
    }
    // 判斷重點與正解只存在題目內；範例的 pointZh / answer 由題目推出（列表與「講師改了 AI 的判斷」用）
    if (patch.question) Object.assign(patch, judgementOf(patch.question));
    if ((patch.answer !== undefined && patch.answer !== (cur.answer || '')) || (patch.pointZh !== undefined && patch.pointZh !== (cur.pointZh || ''))) patch.judgedBy = m.email;
    if (b.changeHint !== undefined) patch.changeHint = String(b.changeHint || '').slice(0, 1000);
    await saveSample(b.sampleId, cur, patch);
    return { sample: await sampleFull(b.sampleId) };
  },

  /** 核准：進入範例庫，AI 出題時會使用；也可用來重新啟用停用的範例 */
  tw_approveSample: async (b) => {
    const m = await needTW();
    const cur = await S.get('samples/' + b.sampleId) || fail('找不到範例 / Sample not found');
    if (!(cur.tags || []).length) fail('請至少選一個標籤 / Pick at least one tag');
    const jd = judgementOf(cur.question || {});
    if (!jd.pointZh.trim() || ((cur.question || {}).type !== 'C' && !jd.answer)) fail('請填寫判斷重點與正解 / Key point and answer are required');
    if ((cur.enPending || []).length) fail('還有 ' + cur.enPending.length + ' 個英文欄位待翻譯，請先在 SeaTalk 傳「處理 ' + b.sampleId + '」/ English pending');
    await saveSample(b.sampleId, cur, { status: 'active', approvedBy: m.email, updatedAt: now(), reviewNote: String(b.note || '').slice(0, 500) });
    return { sampleId: b.sampleId, status: 'active' };
  },

  /** 退回（待審）或停用（已核准） */
  tw_rejectSample: async (b) => {
    const m = await needTW();
    const cur = await S.get('samples/' + b.sampleId) || fail('找不到範例 / Sample not found');
    const st = cur.status === 'active' ? 'inactive' : 'rejected';
    await saveSample(b.sampleId, cur, { status: st, approvedBy: m.email, updatedAt: now(), reviewNote: String(b.reason || '').slice(0, 500) });
    return { sampleId: b.sampleId, status: st };
  },

  /** 刪除範例（同一個 Return ID 之後可以重新申請）；requeue 時直接用新的判斷時點重新申請 */
  tw_deleteSample: async (b) => {
    const m = await needTW();
    const id = String(b.sampleId || '');
    const cur = await S.get('samples/' + id) || fail('找不到範例 / Sample not found: ' + id);
    const req = cur.requestId ? await S.get('sampleRequests/' + cur.requestId).catch(() => null) : null;
    const t = now();
    const ops = [{ op: 'del', path: 'samples/' + id }, { op: 'update', path: 'meta/sampleIndex', data: { ['items.' + id]: S.deleteField() } }];
    if (req) ops.push({ op: 'del', path: 'sampleRequests/' + cur.requestId });     // 申請紀錄一併刪除；Return ID ↔ 範例的對照仍保留在排程機的 map.csv
    let newReq = '';
    if (b.requeue) {
      if (!req || !req.returnId) fail('找不到原本的 Return ID，無法重新申請 / Original Return ID not found');
      const rq = b.requeue, at = rq.cutoffAt ? Number(rq.cutoffAt) : null;
      if (at !== null && !(at > 1.5e12 && at < t + 864e5)) fail('判斷時點不正確 / Invalid cutoff');
      if (at === null && !rq.noCutoff) fail('請填判斷時點，或勾選「不截斷」 / Enter a cutoff or choose no cutoff');
      newReq = 'R' + String(await S.nextIds('R', 1)).padStart(4, '0');
      ops.push({ op: 'set', path: 'sampleRequests/' + newReq, data: { requestedBy: m.email, requestedAt: t, returnId: req.returnId, topicId: req.topicId || cur.topicId,
        wantedTags: req.wantedTags || [], note: req.note || '', status: 'queued', reason: '', sampleId: '', updatedAt: t, cutoffAt: at, noCutoff: at === null, replaces: id } });
    }
    await S.batch(ops);
    return { deleted: id, requestId: newReq };
  },

  /** 判斷標準建議（範例匯入時 AI 回報的缺口）：added = 已加入判斷標準、dismissed = 忽略、'' = 待處理 */
  tw_setGap: async (b) => {
    const m = await needTW();
    const state = ['added', 'dismissed', ''].includes(b.state) ? b.state : fail('state must be added / dismissed / empty');
    const ids = (Array.isArray(b.sampleIds) ? b.sampleIds : [b.sampleId]).map(String).filter(Boolean);
    if (!ids.length) return { updated: 0 };
    const idx = (await S.get('meta/sampleIndex')) || {};
    const ops = [];
    ids.forEach((id) => {
      ops.push({ op: 'update', path: 'samples/' + id, data: { gapState: state, gapBy: m.email, gapAt: now() } });
      if ((idx.items || {})[id]) ops.push({ op: 'update', path: 'meta/sampleIndex', data: { ['items.' + id + '.gapState']: state } });
    });
    await S.batch(ops);
    return { updated: ids.length, state };
  },

  /** 重建範例索引：讀一次所有範例重新產生（意外時的保險） */
  tw_rebuildSampleIndex: async () => {
    await needTW();
    const [samples, reqs] = await Promise.all([S.list('samples'), S.list('sampleRequests')]);
    const rq = {}; reqs.forEach((r) => { rq[r.id] = r; });
    const items = {}; samples.forEach((x) => { items[x.id] = indexRow(x, rq[x.requestId]); });
    await S.set('meta/sampleIndex', { items, rebuiltAt: now() });
    return { count: samples.length };
  },

  // ─── 主題設定 ───
  /** 系統狀態：是否已建立初始資料 */
  tw_status: async () => {
    await needTW();
    const topics = await S.list('topics');
    return { seeded: topics.length > 0, topics: topics.length, version: VERSION };
  },

  /** 建立初始資料：主題、標籤、選項範本、系統設定（只在還沒有主題時執行） */
  tw_seed: async (b) => {
    const m = await needTW();
    const seed = b.seed || fail('沒有初始資料 / Missing seed data');
    if (!Array.isArray(seed.topics) || !seed.topics.length) fail('初始資料格式不正確 / Invalid seed file');
    if ((await S.list('topics')).length && !b.force) fail('已經有主題資料，不能重複建立 / Already initialized');
    const t = now(), ops = [];
    seed.topics.forEach((x) => { const { topicId, ...rest } = x; ops.push({ op: 'set', path: 'topics/' + topicId, data: Object.assign(rest, { updatedAt: t, updatedBy: m.email, history: [] }) }); });
    (seed.tags || []).forEach((x) => { const { tagId, ...rest } = x; ops.push({ op: 'set', path: 'tags/' + tagId, data: Object.assign(rest, { updatedAt: t, updatedBy: m.email }) }); });
    (seed.optionSets || []).forEach((x) => { const { setId, ...rest } = x; ops.push({ op: 'set', path: 'optionSets/' + setId, data: Object.assign(rest, { updatedAt: t, updatedBy: m.email }) }); });
    ops.push({ op: 'set', path: 'settings/app', data: { values: seed.settings || {}, updatedAt: t, updatedBy: m.email } });
    ops.push({ op: 'set', path: 'roles/' + m.email, data: { role: 'tw', addedBy: m.email, addedAt: t } });
    await S.batch(ops);
    return { topics: seed.topics.length, tags: (seed.tags || []).length, optionSets: (seed.optionSets || []).length };
  },

  /** 主題的完整內容（判斷標準、關鍵因素、出題規則、退貨原因…） */
  tw_getTopic: async (b) => {
    await needTeacher();
    const t = await S.get('topics/' + b.topicId);
    if (!t) fail('找不到主題 / Topic not found');
    return { topic: Object.assign({ topicId: b.topicId }, t) };
  },

  /** 儲存主題；判斷標準有改動時版本號自動 +1，並保留上一版 */
  tw_saveTopic: async (b) => {
    const m = await needTW();
    const t = await S.get('topics/' + b.topicId);
    if (!t) fail('找不到主題 / Topic not found');
    if (b.baseUpdatedAt && t.updatedAt && b.baseUpdatedAt !== t.updatedAt) fail('這個主題剛被其他人修改，請重新整理後再編輯 / Someone else just changed this topic. Reload and try again.');
    const p = b.patch || {};
    const patch = { updatedAt: now(), updatedBy: m.email };
    if (p.name) { if (!p.name.zh || !p.name.en) fail('主題名稱需要中英文 / Topic name needs both languages'); patch.name = p.name; }
    if (p.prompt) patch.prompt = p.prompt;
    if (p.defaultOptionSet !== undefined) patch.defaultOptionSet = p.defaultOptionSet;
    if (Array.isArray(p.keyFactors)) patch.keyFactors = p.keyFactors.map((x) => String(x).trim()).filter(Boolean);
    if (p.active !== undefined) {
      if (!p.active && t.active !== false && (await S.list('topics')).filter((x) => x.active !== false).length <= 1) fail('至少要保留一個啟用中的主題 / Keep at least one active topic');
      patch.active = !!p.active;
    }
    if (typeof p.rules === 'string') patch.rules = p.rules;
    if (typeof p.gradingGuide === 'string') patch.gradingGuide = p.gradingGuide.trim().slice(0, 3000);
    let bumped = null;
    if (typeof p.criteria === 'string' && p.criteria.trim() !== String(t.criteria || '').trim()) {
      if (!p.criteria.trim()) fail('判斷標準不能是空的 / Criteria cannot be empty');
      bumped = bumpVersion(t.criteriaVersion);
      patch.criteria = p.criteria;
      patch.criteriaVersion = bumped;
      patch.history = (t.history || []).concat([{ version: t.criteriaVersion, criteria: t.criteria, until: patch.updatedAt, by: m.email }]).slice(-10);
    }
    await S.update('topics/' + b.topicId, patch);
    return { topic: Object.assign({ topicId: b.topicId }, t, patch), bumped };
  },

  /** 新增主題；可從現有主題複製出題規則、判斷關鍵、預設選項（判斷標準需另外填寫） */
  tw_addTopic: async (b) => {
    const m = await needTW();
    const name = b.name || {}, zh = String(name.zh || '').trim(), en = String(name.en || '').trim();
    if (!zh || !en) fail('主題名稱需要中英文 / Topic name needs both languages');
    const all = await S.list('topics');
    if (all.some((x) => String(x.name?.zh || '').trim() === zh)) fail('已有同名主題 / A topic with this name already exists: ' + zh);
    const base = slug(en, 24) || 'topic'; let topicId = base, n = 2;
    while (all.some((x) => x.id === topicId)) topicId = base + '-' + (n++);
    const src = b.copyFrom ? all.find((x) => x.id === b.copyFrom) : null;
    const t = now();
    const doc = { name: { zh, en }, active: true, criteriaVersion: 'v1', criteria: String(b.criteria || '').trim() || '（請填寫判斷標準）',
      keyFactors: src ? (src.keyFactors || []) : [], rules: src ? (src.rules || '') : '', blocks: src ? (src.blocks || []) : [],
      prompt: b.prompt && b.prompt.zh && b.prompt.en ? b.prompt : (src ? src.prompt : { zh: '', en: '' }), defaultOptionSet: src ? (src.defaultOptionSet || '') : '',
      history: [], createdAt: t, createdBy: m.email, updatedAt: t, updatedBy: m.email };
    await S.set('topics/' + topicId, doc);
    return { topic: Object.assign({ topicId }, doc) };
  },

  /** 匯入主題（JSON）：主題、標籤、選項範本一次建立；已存在的主題或標籤不覆蓋 */
  tw_importTopic: async (b) => {
    const m = await needTW();
    const d = b.data || fail('沒有資料 / No data');
    const tp = d.topic || fail('檔案缺少 topic / Missing topic');
    const topicId = slug(tp.topicId || '', 30);
    if (!topicId) fail('topic.topicId 必填（英文小寫與 -） / topic.topicId is required');
    if (!tp.name || !tp.name.zh || !tp.name.en) fail('topic.name 需要中英文 / topic.name needs zh and en');
    if (!String(tp.criteria || '').trim()) fail('topic.criteria（判斷標準）必填 / topic.criteria is required');
    if (await S.get('topics/' + topicId)) fail('已經有這個主題，不會覆蓋 / Topic already exists: ' + topicId);
    const [tags, sets] = await Promise.all([S.list('tags'), S.list('optionSets')]);
    const dupTags = (d.tags || []).filter((x) => tags.some((y) => y.id === x.tagId)).map((x) => x.tagId);
    if (dupTags.length) fail('標籤代碼已被使用 / Tag id already used: ' + dupTags.join(', '));
    const t = now(), ops = [];
    (d.optionSets || []).forEach((o) => {
      const ex = sets.find((y) => y.id === o.setId);
      const opts = (o.options || []).map((x, i) => ({ id: String.fromCharCode(97 + i), text: { zh: String(x.text?.zh || '').trim(), en: String(x.text?.en || '').trim() } }));
      if (opts.length < 2 || opts.length > 8 || opts.some((x) => !x.text.zh || !x.text.en)) fail('選項範本 ' + o.setId + '：需要 2–8 個中英文選項 / 2–8 options with zh and en');
      if (ex) { if (JSON.stringify(ex.options) !== JSON.stringify(opts)) fail('選項範本代碼已被使用且內容不同 / Option set id already used: ' + o.setId); return; }
      ops.push({ op: 'set', path: 'optionSets/' + o.setId, data: { name: o.name, options: opts, updatedAt: t, updatedBy: m.email } });
    });
    const setIds = new Set(sets.map((x) => x.id).concat((d.optionSets || []).map((x) => x.setId)));
    if (tp.defaultOptionSet && !setIds.has(tp.defaultOptionSet)) fail('找不到預設選項範本 / Default option set not found: ' + tp.defaultOptionSet);
    ops.push({ op: 'set', path: 'topics/' + topicId, data: { name: tp.name, prompt: tp.prompt || { zh: '', en: '' }, criteria: String(tp.criteria), criteriaVersion: tp.criteriaVersion || 'v1',
      keyFactors: tp.keyFactors || [], rules: tp.rules || '', blocks: tp.blocks || [], defaultOptionSet: tp.defaultOptionSet || '', gradingGuide: tp.gradingGuide || '',
      active: true, history: [], createdAt: t, createdBy: m.email, updatedAt: t, updatedBy: m.email } });
    (d.tags || []).forEach((x) => {
      if (!x.tagId || !x.name || !x.name.zh || !x.name.en) fail('標籤需要 tagId 與中英文名稱 / Tags need tagId and names');
      ops.push({ op: 'set', path: 'tags/' + x.tagId, data: { topicId, name: x.name, desc: x.desc || '', active: true, updatedAt: t, updatedBy: m.email } });
    });
    await S.batch(ops);
    return { topicId, tags: (d.tags || []).length, optionSets: ops.filter((o) => o.path.startsWith('optionSets/')).length };
  },

  /** DMS 系統規則：申退原因 × 允許的申請方案，與給 AI 的文字規則 */
  tw_getDms: async () => { await needTeacher(); return { dms: await loadDms() }; },
  tw_saveDms: async (b) => {
    const m = await needTW();
    const cur = await S.get('settings/dms');
    if (b.baseUpdatedAt && cur && cur.updatedAt && b.baseUpdatedAt !== cur.updatedAt) fail('DMS 規則剛被其他人修改，請重新整理後再編輯 / Someone else just changed the rules. Reload and try again.');
    const seen = new Set();
    const reasons = (b.reasons || []).map((x, i) => {
      const en = String(x.en || '').trim(), zh = String(x.zh || '').trim();
      if (!en || !zh) fail('第 ' + (i + 1) + ' 列：申退原因需要中英文 / Row ' + (i + 1) + ': both names are required');
      const sol = SOLUTIONS.filter((s) => (x.solutions || []).includes(s));
      if (!sol.length) fail('「' + zh + '」至少要允許一種申請方案 / Allow at least one solution for ' + en);
      const aliases = (x.aliases || []).map((a) => String(a).trim()).filter(Boolean);
      [en].concat(aliases).forEach((k) => { const kk = reasonKey(k); if (seen.has(kk)) fail('申退原因重複 / Duplicate reason: ' + k); seen.add(kk); });
      return { en, zh, solutions: sol, aliases };
    });
    if (!reasons.length) fail('至少要有一個申退原因 / At least one reason');
    const t = now();
    await S.set('settings/dms', { reasons, notes: String(b.notes || '').slice(0, 5000), updatedAt: t, updatedBy: m.email });
    return { dms: { reasons, notes: String(b.notes || ''), updatedAt: t, saved: true } };
  },

  tw_saveOptionSet: async (b) => {
    const m = await needTW();
    const name = b.name || {};
    if (!name.zh || !name.en) fail('範本名稱需要中英文 / Name needs both languages');
    const opts = (b.options || []).map((o, i) => ({ id: String.fromCharCode(97 + i), text: { zh: String(o.text?.zh || '').trim(), en: String(o.text?.en || '').trim() } }));
    if (opts.length < 2) fail('至少需要 2 個選項 / At least 2 options');
    if (opts.some((o) => !o.text.zh || !o.text.en)) fail('每個選項都要有中英文 / Every option needs both languages');
    let setId = b.setId;
    if (!setId) {
      const all = await S.list('optionSets');
      const base = slug(name.en) || 'set'; setId = base; let n = 2;
      while (all.some((s) => s.id === setId)) setId = base + '-' + (n++);
    }
    await S.set('optionSets/' + setId, { name: { zh: name.zh.trim(), en: name.en.trim() }, options: opts, updatedAt: now(), updatedBy: m.email });
    return { setId };
  },

  tw_deleteOptionSet: async (b) => {
    await needTW();
    const topics = await S.list('topics');
    const used = topics.filter((t) => t.defaultOptionSet === b.setId);
    if (used.length) fail('這個範本是主題「' + (used[0].name?.zh || used[0].id) + '」的預設選項，請先更換 / This set is a topic default');
    await S.del('optionSets/' + b.setId);
    return { deleted: b.setId };
  },

  // ─── 講師名單 ───
  tw_listRoles: async () => {
    await needTW();
    const rows = await S.list('roles');
    return { roles: rows.map((r) => ({ email: r.id, role: r.role, addedBy: r.addedBy || '', addedAt: r.addedAt || null })).sort((a, b) => a.role.localeCompare(b.role) || a.email.localeCompare(b.email)), owner: String(CFG.OWNER || '').toLowerCase() };
  },
  tw_setRole: async (b) => {
    const m = await needTW();
    const email = String(b.email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail('Email 格式不正確 / Invalid email');
    if (!['tw', 'bpo'].includes(b.role)) fail('身分只能是 tw 或 bpo / Role must be tw or bpo');
    await S.set('roles/' + email, { role: b.role, addedBy: m.email, addedAt: now() });
    return { email, role: b.role };
  },
  tw_removeRole: async (b) => {
    const m = await needTW();
    const email = String(b.email || '').toLowerCase();
    if (email === m.email) fail('不能移除自己 / You cannot remove yourself');
    await S.del('roles/' + email);
    return { removed: email };
  },

  // ─── 系統設定 ───
  tw_getSettings: async () => {
    await needTeacher();
    const s = await S.get('settings/app');
    return { values: (s && s.values) || {}, updatedAt: s ? s.updatedAt : null };
  },
  tw_saveSetting: async (b) => {
    const m = await needTW();
    const v = Number(b.value);
    if (!Number.isFinite(v) || v < 0) fail('請輸入大於等於 0 的數字 / Enter a number ≥ 0');
    const s = (await S.get('settings/app')) || { values: {} };
    const cur = (s.values || {})[b.key] || {};
    await S.set('settings/app', { values: Object.assign({}, s.values, { [b.key]: Object.assign({}, cur, { value: v }) }), updatedAt: now(), updatedBy: m.email });
    return { key: b.key, value: v };
  },
};

// ───────── 題庫（M4）：草稿 = 生產線、題庫 = 倉庫；發佈測驗一律從題庫組卷，試卷是發佈當下的快照 ─────────
const AGENT_FIELDS = ['type', 'points', 'prompt', 'buyer', 'seller', 'order', 'payment', 'logistics', 'chat', 'drc', 'request', 'options', 'cutoff'];
const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
const r2 = (n) => Math.round(n * 100) / 100;
function shuffle(a) { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }
function validEmails(list) {
  const emails = [...new Set((list || []).map((e) => String(e).trim().toLowerCase()).filter(Boolean))];
  const bad = emails.filter((e) => !EMAIL_RE.test(e));
  if (bad.length) fail('Email 格式錯誤 / Invalid email: ' + bad.join(', '));
  if (!emails.length) fail('請至少指派一位 / Assign at least one person');
  return emails;
}
/** 預設配分：總分 100 依題數平均；B 題選擇與原因各半 */
function pointsOf(type, n) {
  const each = r2(100 / n);
  if (type === 'A') return { choice: each };
  if (type === 'C') return { text: each };
  const half = r2(each / 2);
  return { choice: half, text: r2(each - half) };
}
async function topicVersions() { const m = {}; (await S.list('topics')).forEach((t) => { m[t.id] = t.criteriaVersion; }); return m; }
/** 誰做過哪些題（以「曾被指派」計）：seen/{email}.qids */
async function seenMap(emails) {
  const out = {};
  await Promise.all((emails || []).map(async (e) => { const d = await S.get('seen/' + e).catch(() => null); out[e] = new Set((d && d.qids) || []); }));
  return out;
}
function bankOut(qid, r, tv, seen) {
  const emails = seen ? Object.keys(seen) : null;
  return Object.assign({}, r, { qid, tags: r.tags || [], outdated: !!tv[r.topicId] && tv[r.topicId] !== r.criteriaVersion, avgRate: r.rateN ? r2(r.rateSum / r.rateN) : null,
    answered: r.rateN || 0, used: r.used || 0, seenTotal: r.seenN || 0, seenBy: emails ? emails.filter((e) => seen[e].has(qid)).length : null });
}
async function bankRows() { const idx = (await S.get('meta/bankIndex')) || {}; return idx.items || {}; }

// ───────── 測驗（M4）：sessions/{E001}、paper/public（不含答案）、paper/key、attempts/{email} ─────────
const GRACE_MIN = 5;
function sessionState(s, now) {
  if (s.released) return 'released';
  if (s.ended || now > s.endAt) return 'closed';
  if (now < s.startAt) return 'scheduled';
  return 'open';
}
function sessionOut(id, s, now) {
  return { sessionId: id, draftId: 'BANK', title: s.title || { zh: id, en: id }, startAt: s.startAt, endAt: s.endAt, minutes: s.minutes, state: sessionState(s, now),
    questionCount: s.questionCount || (s.qids || []).length, createdBy: s.createdBy || '', parentSession: s.parentSession || '', topicId: s.topicId || '' };
}
function attemptOut(s, a, now) {
  if (!a) return { status: 'not_started' };
  const dl = Math.min(a.startedAt + s.minutes * 60000, s.endAt);
  const status = a.submittedAt ? 'submitted' : now > dl + (s.graceMin || GRACE_MIN) * 60000 ? 'expired' : 'in_progress';
  return { status, startedAt: a.startedAt, submittedAt: a.submittedAt || null, deadline: dl, autoSubmitted: !!a.autoSubmitted };
}
async function sessionDoc(id) {
  const sid = String(id || '').trim().toUpperCase();
  const s = await S.get('sessions/' + sid);
  if (!s) fail('找不到測驗 / Quiz not found: ' + id);
  return [sid, s];
}
function requireAssigned(s, m) { if (!(s.assignees || []).includes(m.email)) fail('這份測驗沒有指派給你 / This quiz is not assigned to you'); }
const indexOfSession = (s) => ({ title: s.title, startAt: s.startAt, endAt: s.endAt, minutes: s.minutes, questionCount: s.questionCount, assigned: (s.assignees || []).length,
  ended: !!s.ended, released: !!s.released, createdBy: s.createdBy || '', createdAt: s.createdAt || 0, qids: s.qids || [], topicId: s.topicId || '', parentSession: s.parentSession || '' });

const M4 = {
  /** 題庫列表：只讀題庫索引一份文件；給 assignees 時計算「這些人中有幾位做過」 */
  t_bankList: async (b) => {
    await needTeacher();
    const [items, tv, meta] = await Promise.all([bankRows(), topicVersions(), ACTIONS.t_topics()]);
    const emails = Array.isArray(b.assignees) ? b.assignees.map((e) => String(e).trim().toLowerCase()).filter(Boolean) : null;
    const seen = emails ? await seenMap(emails) : null;
    return { questions: Object.keys(items).sort().reverse().map((q) => bankOut(q, items[q], tv, seen)),
      topics: meta.topics, tags: meta.tags, inactiveTags: meta.inactiveTags };
  },

  t_bankGet: async (b) => {
    await needTeacher();
    const qid = String(b.qid || '').toUpperCase();
    const [r, tv, sidx, rows] = await Promise.all([S.get('bank/' + qid), topicVersions(), S.get('meta/sessionIndex'), bankRows()]);
    if (!r) fail('找不到題庫題目 / Bank question not found: ' + qid);
    const items = (sidx && sidx.items) || {};
    return { question: Object.assign({}, r.question, { id: qid }), info: bankOut(qid, Object.assign({}, rows[qid] || {}, bankIndexRow(Object.assign({}, rows[qid] || {}, r))), tv, null), currentVersion: tv[r.topicId] || '',
      sessions: Object.keys(items).filter((k) => (items[k].qids || []).includes(qid)).map((k) => ({ sessionId: k, title: items[k].title, startAt: items[k].startAt })) };
  },

  /** 修改題庫題目：完整檢查（題庫要給專員作答，英文不能缺）；版本 +1；標記為符合目前的判斷標準 */
  t_bankUpdate: async (b) => {
    const m = await needTeacher();
    const qid = String(b.qid || '').toUpperCase();
    const r = await S.get('bank/' + qid) || fail('找不到題庫題目 / Bank question not found: ' + qid);
    const q = Object.assign({}, b.question || {}); STRIP.forEach((k) => delete q[k]);
    const dms = await loadDms();
    normalizeReason(q, dms);
    const chk = checkQuestion(q, dms);
    if (chk.errors.length) fail('格式錯誤，未儲存 / Not saved: ' + chk.errors.slice(0, 6).join('; '));
    if (q.type !== r.type) fail('不能變更題型 / Question type cannot be changed');
    const topic = (await S.get('topics/' + r.topicId)) || {};
    const next = Object.assign({}, r, { question: q, answer: q.answer || '', pointZh: (q.point && q.point.zh) || '', tags: q.tags || r.tags || [],
      criteriaVersion: topic.criteriaVersion || r.criteriaVersion, updatedAt: now(), updatedBy: m.email, version: (r.version || 1) + 1 });
    const row = bankIndexRow(next); ['used', 'rateSum', 'rateN'].forEach((k) => delete row[k]);   // 使用統計保留索引上的數字
    await S.batch([{ op: 'set', path: 'bank/' + qid, data: next }, { op: 'set', path: 'meta/bankIndex', merge: true, data: { items: { [qid]: row } } }]);
    return M4.t_bankGet({ qid });
  },

  t_bankSetStatus: async (b) => {
    const m = await needTeacher();
    const qid = String(b.qid || '').toUpperCase(), st = b.status === 'retired' ? 'retired' : 'active';
    if (!(await S.get('bank/' + qid))) fail('找不到題庫題目 / Bank question not found: ' + qid);
    await S.batch([{ op: 'update', path: 'bank/' + qid, data: { status: st, updatedAt: now(), updatedBy: m.email } },
      { op: 'update', path: 'meta/bankIndex', data: { ['items.' + qid + '.status']: st } }]);
    return { qid, status: st };
  },

  /** 自動抽題：依題型配比；優先符合標籤、較少被使用；可避開受測者做過的題目 */
  t_bankPick: async (b) => {
    await needTeacher();
    const [items, tv] = await Promise.all([bankRows(), topicVersions()]);
    const emails = (b.assignees || []).map((e) => String(e).trim().toLowerCase()).filter(Boolean);
    const seen = await seenMap(emails);
    const tags = (b.tags || []).map(String), exclude = (b.exclude || []).map(String), avoid = b.avoidSeen !== false;
    const mix = { A: Number((b.mix || {}).A) || 0, B: Number((b.mix || {}).B) || 0, C: Number((b.mix || {}).C) || 0 };
    const all = Object.keys(items).filter((q) => { const r = items[q]; return r.status === 'active' && (!b.topicId || r.topicId === b.topicId) && !exclude.includes(q) && (b.includeOutdated || tv[r.topicId] === r.criteriaVersion); });
    const seenAny = (q) => emails.some((e) => seen[e].has(q));
    const picked = [], shortage = {}, available = {};
    ['A', 'B', 'C'].forEach((k) => {
      const pool = all.filter((q) => items[q].type === k), fresh = pool.filter((q) => !seenAny(q));
      available[k] = { total: pool.length, fresh: fresh.length };
      const ranked = shuffle(avoid ? fresh : pool).map((q) => ({ q, m: (items[q].tags || []).filter((x) => tags.includes(x)).length, u: items[q].used || 0 })).sort((x, y) => (y.m - x.m) || (x.u - y.u));
      ranked.slice(0, mix[k]).forEach((x) => picked.push(x.q));
      if (ranked.length < mix[k]) shortage[k] = mix[k] - ranked.length;
    });
    return { picked: picked.map((q) => bankOut(q, items[q], tv, seen)), shortage, available };
  },

  /** 發佈測驗：題目來自題庫（qids 依順序），建立試卷快照與配分；專員讀得到的試卷不含答案 */
  t_createSession: async (b) => {
    const m = await needTeacher();
    const title = { zh: String(b.titleZh || '').trim(), en: String(b.titleEn || '').trim() };
    if (!title.zh || !title.en) fail('請填寫中英文測驗名稱 / Title (zh and en) is required');
    const startAt = Number(b.startAt), endAt = Number(b.endAt), minutes = Number(b.minutes);
    if (!(startAt > 0 && endAt > startAt)) fail('結束時間需晚於開始時間 / End must be after start');
    if (endAt < now()) fail('結束時間已過 / End time is in the past');
    if (!(minutes >= 1 && minutes <= 300)) fail('作答時間需介於 1–300 分鐘 / Duration must be 1–300 minutes');
    const assignees = validEmails(b.assignees);
    const ids = [...new Set((b.qids || []).map((x) => String(x).trim().toUpperCase()).filter(Boolean))];
    if (!ids.length) fail('請從題庫選擇題目 / Pick questions from the bank');
    const settings = ((await S.get('settings/app')) || {}).values || {};
    const maxQ = Number((settings.maxQuestions || {}).value) || 20;
    if (ids.length > maxQ) fail('每份試卷最多 ' + maxQ + ' 題 / At most ' + maxQ + ' questions per quiz');
    const rows = await Promise.all(ids.map((id) => S.get('bank/' + id)));
    rows.forEach((r, i) => { if (!r) fail('找不到題庫題目 / Not in bank: ' + ids[i]); if (r.status !== 'active') fail(ids[i] + ' 已停用 / is retired'); });
    const key = rows.map((r, i) => Object.assign({}, r.question, { qid: ids[i], seq: i + 1, points: pointsOf(r.type, ids.length), criteriaVersion: r.criteriaVersion }));
    const total = key.reduce((t, j) => t + (j.points.choice || 0) + (j.points.text || 0), 0);   // 尾差由最後一題吸收，總分固定 100
    const last = key[key.length - 1].points, k = last.text !== undefined ? 'text' : 'choice';
    last[k] = r2(last[k] + 100 - total);
    const pub = key.map((q) => { const o = { qid: q.qid, seq: q.seq }; AGENT_FIELDS.forEach((f) => { if (q[f] !== undefined) o[f] = q[f]; }); return o; });
    const sid = 'E' + String(await S.nextIds('E', 1)).padStart(3, '0'), t = now();
    const sess = { title, startAt: S.ts(startAt), endAt: S.ts(endAt), minutes, graceMin: Number((settings.autoSubmitGraceMin || {}).value) || GRACE_MIN, assignees,
      qids: ids, questionCount: ids.length, topicId: rows[0].topicId, ended: false, released: false, createdBy: m.email, createdAt: t };
    // 做過的題目（以指派計）與使用次數
    const seen = await seenMap(assignees), idx = await bankRows();
    const ops = [
      { op: 'set', path: 'sessions/' + sid, data: sess },
      { op: 'set', path: 'sessions/' + sid + '/paper/public', data: { questions: pub } },
      { op: 'set', path: 'sessions/' + sid + '/paper/key', data: { questions: key } },
      { op: 'set', path: 'meta/sessionIndex', merge: true, data: { items: { [sid]: indexOfSession(Object.assign({}, sess, { startAt, endAt })) } } },
    ];
    assignees.forEach((e) => ops.push({ op: 'set', path: 'seen/' + e, data: { qids: [...new Set([...seen[e], ...ids])], updatedAt: t } }));
    const upd = {};
    ids.forEach((q) => {
      upd['items.' + q + '.used'] = ((idx[q] || {}).used || 0) + 1;
      upd['items.' + q + '.seenN'] = ((idx[q] || {}).seenN || 0) + assignees.filter((e) => !seen[e].has(q)).length;
    });
    ops.push({ op: 'update', path: 'meta/bankIndex', data: upd });
    await S.batch(ops);
    return { sessionId: sid, session: sessionOut(sid, Object.assign({}, sess, { startAt, endAt }), now()) };
  },

  /** 測驗列表：索引一份文件 + 各場次的作答紀錄 */
  t_listSessions: async () => {
    await needTeacher();
    const items = ((await S.get('meta/sessionIndex')) || {}).items || {}, t = now();
    const ids = Object.keys(items).sort().reverse();
    const atts = await Promise.all(ids.map((id) => S.list('sessions/' + id + '/attempts').catch(() => [])));
    return { sessions: ids.map((id, i) => Object.assign(sessionOut(id, items[id], t), { assigned: items[id].assigned || 0, started: atts[i].length, submitted: atts[i].filter((a) => a.submittedAt).length })) };
  },

  t_getSession: async (b) => {
    await needTeacher();
    const [sid, s] = await sessionDoc(b.sessionId), t = now();
    const [atts, key] = await Promise.all([S.list('sessions/' + sid + '/attempts'), S.get('sessions/' + sid + '/paper/key')]);
    const roster = (s.assignees || []).map((email) => Object.assign({ email }, attemptOut(s, atts.find((a) => a.id === email), t)));
    return { session: Object.assign(sessionOut(sid, s, t), { assignees: s.assignees || [] }), roster, questions: (key && key.questions) || [], serverNow: t };
  },

  /** 提前結束：結束時間改成現在；作答中的人在緩衝時間內由瀏覽器自動交卷 */
  t_endSession: async (b) => {
    await needTeacher();
    const [sid, s] = await sessionDoc(b.sessionId), t = now();
    await S.batch([{ op: 'update', path: 'sessions/' + sid, data: { ended: true, endAt: S.ts(t) } },
      { op: 'update', path: 'meta/sessionIndex', data: { ['items.' + sid + '.ended']: true, ['items.' + sid + '.endAt']: t } }]);
    return { session: sessionOut(sid, Object.assign({}, s, { ended: true, endAt: t }), t) };
  },

  // ── 專員（只看得到指派給自己的測驗；權限由規則把關） ──
  s_list: async () => {
    const m = await whoAmI(), t = now();
    const rows = await S.query('sessions', 'assignees', 'array-contains', m.email);
    const atts = await Promise.all(rows.map((s) => S.get('sessions/' + s.id + '/attempts/' + m.email).catch(() => null)));
    const res = await Promise.all(rows.map((s) => (s.released ? S.get('results/' + s.id + '_' + m.email).catch(() => null) : null)));
    return { serverNow: t, sessions: rows.map((s, i) => { const at = attemptOut(s, atts[i], t); if (res[i]) at.score = res[i].score; return Object.assign(sessionOut(s.id, s, t), { attempt: at }); })
      .sort((a, b) => b.sessionId.localeCompare(a.sessionId)) };
  },

  s_get: async (b) => {
    const m = await whoAmI();
    const [sid, s] = await sessionDoc(b.sessionId); requireAssigned(s, m);
    const t = now(), a = await S.get('sessions/' + sid + '/attempts/' + m.email), att = attemptOut(s, a, t);
    const out = { serverNow: t, session: sessionOut(sid, s, t), attempt: att, graceMin: s.graceMin || GRACE_MIN };
    if (att.status === 'in_progress') out.questions = ((await S.get('sessions/' + sid + '/paper/public')) || {}).questions || [];
    return out;
  },

  /** 開始作答：開始時間由伺服器記錄（規則強制），不能從瀏覽器竄改 */
  s_start: async (b) => {
    const m = await whoAmI();
    const [sid, s] = await sessionDoc(b.sessionId); requireAssigned(s, m);
    const path = 'sessions/' + sid + '/attempts/' + m.email;
    let a = await S.get(path);
    if (!a) {
      const st = sessionState(s, now());
      if (st === 'scheduled') fail('測驗尚未開始 / The quiz has not started yet');
      if (st !== 'open') fail('測驗已結束 / The quiz has ended');
      await S.set(path, { email: m.email, startedAt: S.serverTime(), submittedAt: null, answers: {}, autoSubmitted: false });
      a = await S.get(path);
    }
    const t = now(), att = attemptOut(s, a, t);
    if (att.status !== 'in_progress') return { serverNow: t, attempt: att };
    return { serverNow: t, attempt: att, questions: ((await S.get('sessions/' + sid + '/paper/public')) || {}).questions || [] };
  },

  /** 交卷：只寫一次（作答過程存在瀏覽器）；時間限制由規則檢查 */
  s_submit: async (b) => {
    const m = await whoAmI();
    const [sid, s] = await sessionDoc(b.sessionId); requireAssigned(s, m);
    const path = 'sessions/' + sid + '/attempts/' + m.email;
    const a = await S.get(path) || fail('尚未開始作答 / You have not started this quiz');
    if (a.submittedAt) return { attempt: attemptOut(s, a, now()), already: true };
    const answers = {};
    Object.entries(b.answers || {}).forEach(([q, x]) => { if ((s.qids || []).includes(q)) answers[q] = { choice: String((x && x.choice) || '').slice(0, 10), text: String((x && x.text) || '').slice(0, 3000) }; });
    try { await S.update(path, { answers, submittedAt: S.serverTime(), autoSubmitted: !!b.auto }); }
    catch (e) { if (/permission/i.test(String(e.code || e.message))) fail('已超過交卷時間 / The submission window has closed'); throw e; }
    return { attempt: attemptOut(s, await S.get(path), now()) };
  },

  /** 作答中定期檢查：講師提前結束時，前端會自動交卷 */
  s_status: async (b) => {
    const m = await whoAmI();
    const [sid, s] = await sessionDoc(b.sessionId); requireAssigned(s, m);
    const t = now();
    return { serverNow: t, state: sessionState(s, t), attempt: attemptOut(s, await S.get('sessions/' + sid + '/attempts/' + m.email), t) };
  },
};
Object.assign(ACTIONS, M4);

// ───────── 閱卷與成績（M5）：grades/{email}（ai = AI 分數、teacher = 講師確認）；發佈時寫 results/{sid}_{email} 給專員看 ─────────
const isTextQ = (t) => t === 'B' || t === 'C';
/** 預設批改原則（主題沒有設定時使用；與 rrqp2_tool.py 相同） */
const DEFAULT_GRADING_GUIDE = `1. 專員只要點出正確的判斷關鍵就給滿分（例如「買家申退數量和協議不同」），不需要引用判斷標準的條文編號，也不需要重述案件細節（商品名稱、金額、數量）。
2. 回答簡短、用英文或中文都可以，不因文法、拼字、用詞簡略扣分。
3. 給部分分數：本題有兩個以上必要的判斷關鍵，只答出其中一部分。
4. 給 0 分或低分：判斷關鍵錯誤、與正解矛盾、只寫結論沒有理由（例如只寫「未達成」）、理由與本題無關。
5. rubric 的細項若要求引用條文或寫出具體細節，以本原則為準。`;
const qMax = (q) => r2(((q.points || {}).choice || 0) + ((q.points || {}).text || 0));
const resultId = (sid, email) => sid + '_' + email;
const aidOf = (email, qid) => email + '|' + qid;
function parseAid(aid) { const i = String(aid || '').lastIndexOf('|'); if (i < 1) fail('找不到答案 / Answer not found: ' + aid); return [aid.slice(0, i), aid.slice(i + 1)]; }
async function settingValue(k, def) { const v = ((((await S.get('settings/app')) || {}).values || {})[k] || {}).value; return v === undefined || v === null ? def : Number(v); }
/** 讀一場測驗的閱卷資料：題目（含答案）、作答、分數 */
async function gradingData(sid) {
  const [s, key, atts, grades] = await Promise.all([S.get('sessions/' + sid), S.get('sessions/' + sid + '/paper/key'), S.list('sessions/' + sid + '/attempts'), S.list('sessions/' + sid + '/grades')]);
  if (!s) fail('找不到測驗 / Quiz not found: ' + sid);
  const qs = ((key && key.questions) || []).slice().sort((a, b) => a.seq - b.seq);
  const g = {}; grades.forEach((x) => { g[x.id] = x; });
  return { s, qs, atts, g };
}
/** 每位交卷者、每一題一筆答案；空白的文字答案直接 0 分（不需要 AI） */
function answerRows(qs, atts, g) {
  const out = [];
  atts.filter((a) => a.submittedAt).forEach((a) => {
    const gr = g[a.id] || {};
    qs.forEach((q) => {
      const x = (a.answers || {})[q.qid] || {}, ai = (gr.ai || {})[q.qid], tc = (gr.teacher || {})[q.qid] || {};
      const blank = isTextQ(q.type) && !String(x.text || '').trim();
      out.push({ aid: aidOf(a.id, q.qid), email: a.id, qid: q.qid, choice: x.choice || '', text: x.text || '',
        autoScore: q.type === 'A' || q.type === 'B' ? (x.choice && x.choice === q.answer ? (q.points || {}).choice || 0 : 0) : null,
        aiScore: blank && !ai ? 0 : ai ? ai.score : null, aiConfidence: blank && !ai ? 1 : ai ? ai.confidence : null, aiReason: blank && !ai ? '未作答 / No answer' : ai ? ai.reason : '',
        teacherScore: tc.score === undefined || tc.score === null ? null : tc.score, teacherComment: tc.comment || '', teacherBy: tc.by || '', teacherAt: tc.at || null });
    });
  });
  return out;
}
const textScore = (r) => (r.teacherScore !== null ? r.teacherScore : r.aiScore !== null ? r.aiScore : null);
const rowScore = (r) => (r.autoScore || 0) + (textScore(r) || 0);
/** 一位專員的成績（發佈時寫進 results，專員只讀得到自己的） */
function resultOf(sid, s, qs, a, rows) {
  let choiceN = 0, choiceOk = 0, textGot = 0, textMax = 0;
  const items = qs.map((q) => {
    const r = rows.find((x) => x.qid === q.qid) || {}, max = qMax(q), got = r2(rowScore(r));
    if (q.type === 'A' || q.type === 'B') { choiceN++; if (r.choice && r.choice === q.answer) choiceOk++; }
    if (isTextQ(q.type)) { textMax += (q.points || {}).text || 0; textGot += textScore(r) || 0; }
    const opt = (id) => { const o = (q.options || []).find((x) => x.id === id); return o ? o.text : null; };
    return { qid: q.qid, seq: q.seq, type: q.type, max, got, prompt: q.prompt || null, point: q.point || null, myChoice: opt(r.choice), myText: r.text || '', correct: opt(q.answer),
      choiceOk: r.choice ? r.choice === q.answer : false, explanation: q.explanation || null, modelAnswer: q.type === 'C' ? q.modelAnswer || null : null, comment: r.teacherComment || '' };
  });
  return { sessionId: sid, email: a.id, title: s.title, score: r2(items.reduce((t, x) => t + x.got, 0)), total: r2(items.reduce((t, x) => t + x.max, 0)), choiceOk, choiceN,
    textGot: r2(textGot), textMax: r2(textMax), timeUsed: a.submittedAt - a.startedAt, submittedAt: a.submittedAt, startedAt: a.startedAt, autoSubmitted: !!a.autoSubmitted,
    review: items.filter((x) => x.got < x.max - 1e-9), all: items.map((x) => ({ seq: x.seq, got: x.got, max: x.max, qid: x.qid, point: x.point })), releasedAt: now() };
}
/** 題庫得分率：發佈時把這場的「每題得分率」加進題庫索引；重新發佈時先扣掉上次加的 */
function bankStatOps(s, qs, rows) {
  const cur = {};
  qs.forEach((q) => {
    const mine = rows.filter((r) => r.qid === q.qid), m = qMax(q); if (!m || !mine.length) return;
    cur[q.qid] = { sum: r2(mine.reduce((t, r) => t + rowScore(r) / m, 0)), n: mine.length };
  });
  return cur;
}
async function applyBankStats(sid, prev, cur) {
  const idx = await bankRows(), upd = {};
  new Set([...Object.keys(prev || {}), ...Object.keys(cur || {})]).forEach((q) => {
    if (!idx[q]) return;
    const p = (prev || {})[q] || { sum: 0, n: 0 }, c = (cur || {})[q] || { sum: 0, n: 0 };
    upd['items.' + q + '.rateSum'] = r2((idx[q].rateSum || 0) - p.sum + c.sum);
    upd['items.' + q + '.rateN'] = Math.max(0, (idx[q].rateN || 0) - p.n + c.n);
  });
  return Object.keys(upd).length ? [{ op: 'update', path: 'meta/bankIndex', data: upd }] : [];
}
/** 已發佈的測驗改分數時：重寫成績與題庫得分率 */
async function republish(sid) {
  const { s, qs, atts, g } = await gradingData(sid);
  if (!s.released) return;
  const rows = answerRows(qs, atts, g), cur = bankStatOps(s, qs, rows);
  const ops = atts.filter((a) => a.submittedAt).map((a) => ({ op: 'set', path: 'results/' + resultId(sid, a.id), data: resultOf(sid, s, qs, a, rows.filter((r) => r.email === a.id)) }));
  ops.push(...(await applyBankStats(sid, s.bankStats, cur)), { op: 'update', path: 'sessions/' + sid, data: { bankStats: cur } });
  await S.batch(ops);
}
function requireClosed(s) { const st = sessionState(s, now()); if (st === 'open' || st === 'scheduled') fail('測驗尚未結束，請等結束時間到或在場次頁「提前結束測驗」 / The quiz has not ended yet'); }

const M5 = {
  t_grading: async (b) => {
    await needTeacher();
    const [sid] = await sessionDoc(b.sessionId);
    const { s, qs, atts, g } = await gradingData(sid), t = now();
    return { serverNow: t, session: Object.assign(sessionOut(sid, s, t), { released: !!s.released }), threshold: await settingValue('confidenceThreshold', 0.7),
      questions: qs, answers: answerRows(qs, atts, g),
      attempts: atts.map((a) => ({ email: a.id, startedAt: a.startedAt, submittedAt: a.submittedAt || null, autoSubmitted: !!a.autoSubmitted, score: null })), command: '批改 ' + sid };
  },

  /** 講師確認分數（score = null 取消確認，改回 AI 分數）與評語；記錄是誰、什麼時候確認的 */
  t_setScore: async (b) => {
    const m = await needTeacher();
    const [sid] = await sessionDoc(b.sessionId);
    const [email, qid] = parseAid(b.aid);
    const key = (await S.get('sessions/' + sid + '/paper/key')) || {};
    const q = (key.questions || []).find((x) => x.qid === qid) || fail('找不到題目 / Question not found: ' + qid);
    const g = (await S.get('sessions/' + sid + '/grades/' + email)) || {};
    const cur = Object.assign({}, (g.teacher || {})[qid]);
    if (b.score !== undefined) {
      if (b.score === null || b.score === '') cur.score = null;
      else {
        if (!isTextQ(q.type)) fail('只有 B / C 題可以調整文字分數 / Only B / C answers have a text score');
        const max = (q.points || {}).text || 0, sc = Number(b.score);
        if (!(sc >= 0 && sc <= max + 1e-9)) fail('分數需介於 0–' + max + ' / Score must be 0–' + max);
        cur.score = r2(sc);
      }
    }
    if (b.comment !== undefined) cur.comment = String(b.comment || '').slice(0, 1000);
    Object.assign(cur, { by: m.email, at: now() });
    await S.set('sessions/' + sid + '/grades/' + email, { teacher: { [qid]: cur } }, true);
    await republish(sid);
    const d = await gradingData(sid);
    return { answer: answerRows(d.qs, d.atts, d.g).find((r) => r.aid === b.aid) };
  },

  /** 清除某題「講師還沒確認」的 AI 分數，再傳一次「批改」指令就會依新的批改原則重新評分 */
  t_resetAi: async (b) => {
    await needTeacher();
    const [sid] = await sessionDoc(b.sessionId);
    const d = await gradingData(sid);
    if (d.s.released) fail('成績已公布，請先取消公布 / Withdraw the results first');
    const pick = answerRows(d.qs, d.atts, d.g).filter((r) => (!b.qid || r.qid === b.qid) && r.teacherScore === null && ((d.g[r.email] || {}).ai || {})[r.qid]);
    const by = {}; pick.forEach((r) => { (by[r.email] = by[r.email] || {})['ai.' + r.qid] = S.deleteField(); });
    const ops = Object.entries(by).map(([e, data]) => ({ op: 'update', path: 'sessions/' + sid + '/grades/' + e, data }));
    if (ops.length) await S.batch(ops);
    return { cleared: pick.length, command: '批改 ' + sid };
  },

  /** 一次接受某題所有「未確認且非低信心」的 AI 分數 */
  t_acceptAll: async (b) => {
    const m = await needTeacher();
    const [sid] = await sessionDoc(b.sessionId);
    const th = await settingValue('confidenceThreshold', 0.7);
    const d = await gradingData(sid), t = now();
    const pick = answerRows(d.qs, d.atts, d.g).filter((r) => r.qid === b.qid && r.teacherScore === null && r.aiScore !== null && r.aiConfidence >= th);
    const ops = pick.map((r) => ({ op: 'set', path: 'sessions/' + sid + '/grades/' + r.email, merge: true,
      data: { teacher: { [r.qid]: { score: r.aiScore, comment: r.teacherComment || '', by: m.email, at: t } } } }));
    if (ops.length) await S.batch(ops);
    await republish(sid);
    const d2 = await gradingData(sid);
    return { accepted: ops.length, answers: answerRows(d2.qs, d2.atts, d2.g).filter((r) => r.qid === b.qid) };
  },

  /** 發佈 / 取消發佈成績：文字答案都要有分數（AI 或講師）；未確認的使用 AI 分數 */
  t_release: async (b) => {
    const m = await needTeacher();
    const [sid] = await sessionDoc(b.sessionId);
    const { s, qs, atts, g } = await gradingData(sid);
    const done = atts.filter((a) => a.submittedAt);
    if (b.release === false) {
      const ops = done.map((a) => ({ op: 'del', path: 'results/' + resultId(sid, a.id) }));
      ops.push(...(await applyBankStats(sid, s.bankStats, {})), { op: 'update', path: 'sessions/' + sid, data: { released: false, bankStats: {} } },
        { op: 'update', path: 'meta/sessionIndex', data: { ['items.' + sid + '.released']: false } });
      await S.batch(ops);
      return { released: false };
    }
    requireClosed(s);
    const rows = answerRows(qs, atts, g);
    const text = rows.filter((r) => isTextQ((qs.find((q) => q.qid === r.qid) || {}).type));
    const missing = text.filter((r) => textScore(r) === null).length;
    if (missing) fail('還有 ' + missing + ' 筆文字答案沒有分數，請先在 SeaTalk 傳「批改 ' + sid + '」或手動給分 / ' + missing + ' answers have no score yet');
    const cur = bankStatOps(s, qs, rows), t = now();
    const ops = done.map((a) => ({ op: 'set', path: 'results/' + resultId(sid, a.id), data: resultOf(sid, s, qs, a, rows.filter((r) => r.email === a.id)) }));
    ops.push(...(await applyBankStats(sid, s.bankStats, cur)), { op: 'update', path: 'sessions/' + sid, data: { released: true, releasedAt: t, releasedBy: m.email, bankStats: cur } },
      { op: 'update', path: 'meta/sessionIndex', data: { ['items.' + sid + '.released']: true } });
    await S.batch(ops);
    return { released: true, unconfirmed: text.filter((r) => r.teacherScore === null).length };
  },

  /** 專員：成績公布後查看自己的分數與錯題 */
  s_result: async (b) => {
    const m = await whoAmI();
    const [sid, s] = await sessionDoc(b.sessionId); requireAssigned(s, m);
    if (!s.released) fail('成績尚未公布 / Results have not been released yet');
    const r = await S.get('results/' + resultId(sid, m.email)).catch(() => null) || fail('沒有你的成績紀錄 / No result found');
    return Object.assign({}, r, { session: sessionOut(sid, s, now()) });
  },

  /** 延長結束時間（也可重新開放已提前結束的測驗） */
  t_extendSession: async (b) => {
    await needTeacher();
    const [sid, s] = await sessionDoc(b.sessionId), endAt = Number(b.endAt);
    if (s.released) fail('成績已公布，不能延長 / Results already released');
    if (!(endAt > now() && endAt > s.startAt)) fail('新的結束時間需晚於現在 / New end time must be in the future');
    await S.batch([{ op: 'update', path: 'sessions/' + sid, data: { endAt: S.ts(endAt), ended: false } },
      { op: 'update', path: 'meta/sessionIndex', data: { ['items.' + sid + '.endAt']: endAt, ['items.' + sid + '.ended']: false } }]);
    return { session: sessionOut(sid, Object.assign({}, s, { endAt, ended: false }), now()) };
  },

  /** 退回作答：原本的作答與分數搬到 returned 保存，專員可以在測驗開放期間重新作答 */
  t_returnAttempt: async (b) => {
    const m = await needTeacher();
    const [sid, s] = await sessionDoc(b.sessionId), email = String(b.email || '').trim().toLowerCase();
    const a = await S.get('sessions/' + sid + '/attempts/' + email) || fail('這位專員還沒有作答紀錄 / No attempt to return');
    if (s.released) fail('成績已公布，請先取消公布 / Withdraw the results first');
    const g = await S.get('sessions/' + sid + '/grades/' + email), t = now();
    await S.batch([
      { op: 'set', path: 'sessions/' + sid + '/returned/' + email + '_' + t, data: { email, attempt: a, grades: g || null, reason: String(b.reason || '').slice(0, 200), by: m.email, at: t } },
      { op: 'del', path: 'sessions/' + sid + '/attempts/' + email }, { op: 'del', path: 'sessions/' + sid + '/grades/' + email }]);
    const open = sessionState(s, t) === 'open';
    return { returned: email, sessionOpen: open, hint: open ? '' : '測驗已結束，專員無法重新作答；請延長結束時間 / The quiz is closed: extend it so the agent can retake it' };
  },
};
Object.assign(ACTIONS, M5);

// ───────── 歷史成績（M6）：分數一律即時計算（講師確認優先，否則 AI 分數），未發佈的測驗也看得到 ─────────
/** 一場測驗的成績摘要（與 V1 sessionResults_ 相同格式） */
function sessionResults(sid, s, qs, atts, g, line) {
  const t = now(), rows = answerRows(qs, atts, g);
  const out = (s.assignees || []).map((email) => {
    const a = atts.find((x) => x.id === email), st = attemptOut(s, a, t);
    if (st.status !== 'submitted') return { email, status: st.status, score: null, wrong: [] };
    const per = qs.map((q) => { const r = rows.find((x) => x.email === email && x.qid === q.qid) || {}; return { q, got: r2(rowScore(r)), max: qMax(q) }; });
    const score = r2(per.reduce((n, x) => n + x.got, 0));
    return { email, status: 'submitted', score, coaching: score < line, autoSubmitted: st.autoSubmitted, startedAt: st.startedAt, submittedAt: st.submittedAt,
      wrong: per.filter((x) => x.got < x.max - 1e-9).map((x) => ({ seq: x.q.seq, partial: x.got > 0, point: x.q.point || null })) };
  });
  const done = out.filter((r) => r.status === 'submitted'), scores = done.map((r) => r.score).sort((a, b) => a - b);
  const qstats = qs.map((q) => {
    const got = rows.filter((r) => r.qid === q.qid && done.some((d) => d.email === r.email)).map((r) => rowScore(r) / (qMax(q) || 1));
    return { qid: q.qid, seq: q.seq, type: q.type, point: q.point || null, rate: got.length ? r2(got.reduce((n, x) => n + x, 0) / got.length) : null };
  });
  const mid = scores.length % 2 ? scores[(scores.length - 1) / 2] : (scores[scores.length / 2 - 1] + scores[scores.length / 2]) / 2;
  return { session: Object.assign(sessionOut(sid, s, t), { released: !!s.released, parentSession: s.parentSession || '' }), coachLine: line, rows: out, questions: qstats,
    stats: { assigned: out.length, submitted: done.length, auto: done.filter((r) => r.autoSubmitted).length, coaching: done.filter((r) => r.coaching).length,
      avg: scores.length ? r2(scores.reduce((n, x) => n + x, 0) / scores.length) : null, median: scores.length ? r2(mid) : null,
      max: scores.length ? scores[scores.length - 1] : null, min: scores.length ? scores[0] : null } };
}
const coachLine = async () => Math.round((await settingValue('coachingThreshold', 0.7)) * 100);
async function resultsOf(sid) { const { s, qs, atts, g } = await gradingData(sid); return sessionResults(sid, s, qs, atts, g, await coachLine()); }

const M6 = {
  /** 成績首頁：各場次摘要 + 各專員摘要（尚未開始的測驗不列） */
  t_resultsIndex: async () => {
    await needTeacher();
    const items = ((await S.get('meta/sessionIndex')) || {}).items || {}, t = now(), line = await coachLine();
    const ids = Object.keys(items).filter((id) => sessionState(items[id], t) !== 'scheduled').sort();
    const list = await Promise.all(ids.map(async (id) => { const { s, qs, atts, g } = await gradingData(id); return sessionResults(id, s, qs, atts, g, line); }));
    const agents = {};
    list.forEach((r) => r.rows.filter((x) => x.status === 'submitted').forEach((x) => {
      const a = agents[x.email] || (agents[x.email] = { email: x.email, taken: 0, total: 0, coaching: 0, last: null });
      a.taken++; a.total += x.score; if (x.coaching) a.coaching++;
      if (!a.last || x.submittedAt > a.last.submittedAt) a.last = { sessionId: r.session.sessionId, title: r.session.title, score: x.score, submittedAt: x.submittedAt };
    }));
    return { coachLine: line, sessions: list.map((r) => Object.assign({}, r.session, r.stats)).reverse(),
      agents: Object.values(agents).map((a) => ({ email: a.email, taken: a.taken, avg: r2(a.total / a.taken), coaching: a.coaching, last: a.last })).sort((a, b) => a.avg - b.avg) };
  },

  t_results: async (b) => { await needTeacher(); const [sid] = await sessionDoc(b.sessionId); return resultsOf(sid); },

  /** 某位專員的歷次成績與錯誤重點 */
  t_agentHistory: async (b) => {
    await needTeacher();
    const email = String(b.email || '').trim().toLowerCase();
    const rows = await S.query('sessions', 'assignees', 'array-contains', email), line = await coachLine();
    const items = await Promise.all(rows.map(async (s) => { const { qs, atts, g } = await gradingData(s.id); const r = sessionResults(s.id, s, qs, atts, g, line); return { session: r.session, row: r.rows.find((x) => x.email === email) }; }));
    return { email, coachLine: line, items: items.sort((x, y) => x.session.startAt - y.session.startAt) };
  },

  /** 某位專員在某場測驗的作答明細 */
  t_attemptDetail: async (b) => {
    await needTeacher();
    const [sid] = await sessionDoc(b.sessionId), email = String(b.email || '').trim().toLowerCase();
    const { s, qs, atts, g } = await gradingData(sid), t = now();
    return { session: sessionOut(sid, s, t), email, attempt: attemptOut(s, atts.find((a) => a.id === email), t), questions: qs,
      answers: answerRows(qs, atts, g).filter((r) => r.email === email) };
  },

  /** 補考：沿用原測驗的試卷快照與配分，建立新的場次（新的連結） */
  t_createMakeup: async (b) => {
    const m = await needTeacher();
    const [pid, p] = await sessionDoc(b.sessionId);
    const assignees = validEmails(b.assignees);
    const startAt = Number(b.startAt), endAt = Number(b.endAt), minutes = Number(b.minutes || p.minutes);
    if (!(startAt > 0 && endAt > startAt && endAt > now())) fail('時間設定有誤 / Check the start and end time');
    if (!(minutes >= 1 && minutes <= 300)) fail('作答時間需介於 1–300 分鐘 / Duration must be 1–300 minutes');
    const [pub, key] = await Promise.all([S.get('sessions/' + pid + '/paper/public'), S.get('sessions/' + pid + '/paper/key')]);
    const sid = 'E' + String(await S.nextIds('E', 1)).padStart(3, '0'), t = now();
    const title = { zh: String(b.titleZh || (p.title.zh + '（補考）')).trim(), en: String(b.titleEn || (p.title.en + ' (Makeup)')).trim() };
    const sess = { title, startAt: S.ts(startAt), endAt: S.ts(endAt), minutes, graceMin: p.graceMin || GRACE_MIN, assignees, qids: p.qids || [], questionCount: p.questionCount || (p.qids || []).length,
      topicId: p.topicId || '', parentSession: pid, ended: false, released: false, createdBy: m.email, createdAt: t };
    const seen = await seenMap(assignees);
    const ops = [{ op: 'set', path: 'sessions/' + sid, data: sess }, { op: 'set', path: 'sessions/' + sid + '/paper/public', data: pub || { questions: [] } },
      { op: 'set', path: 'sessions/' + sid + '/paper/key', data: key || { questions: [] } },
      { op: 'set', path: 'meta/sessionIndex', merge: true, data: { items: { [sid]: Object.assign(indexOfSession(Object.assign({}, sess, { startAt, endAt })), { parentSession: pid }) } } }];
    assignees.forEach((e) => ops.push({ op: 'set', path: 'seen/' + e, data: { qids: [...new Set([...seen[e], ...(p.qids || [])])], updatedAt: t } }));
    await S.batch(ops);
    return { sessionId: sid };
  },
};
Object.assign(ACTIONS, M6);

async function api(action, payload = {}) {
  const fn = ACTIONS[action];
  if (!fn) throw new Error('V2 開發中：這個功能還沒搬到 Firebase（' + action + '）/ Not available in V2 yet');
  try { return await fn(payload || {}); }
  catch (e) { const err = new Error(friendly(e)); err.code = e && e.code; throw err; }
}

// ───────── 啟動 ─────────
(async () => {
  try {
    S = PREVIEW ? memoryStore() : await firestoreStore();
  } catch (e) {
    window.RRQP_DB = { error: 'Firebase 載入失敗：' + friendly(e) };
    window.dispatchEvent(new Event('rrqp-db-ready'));
    return;
  }
  window.RRQP_DB = {
    preview: PREVIEW,
    api,
    signIn: async () => { try { await S.auth.signIn(); } catch (e) { throw new Error(friendly(e)); } },
    signOut: () => { ME = null; currentEmail = null; return S.auth.signOut(); },
    onAuth: (cb) => S.auth.onAuth((u) => { ME = null; currentEmail = u ? u.email : null; cb(u); }),
    devPut: PREVIEW ? S.devPut : undefined,
    check: (q, rules, opt) => checkQuestion(q, rules, opt),   // 題目格式檢查（編輯器套用前先檢查；rules = DMS 規則）
    enPendingAfter, biLeaves, gradingGuide: DEFAULT_GRADING_GUIDE,
    dms: { find: findReason, normalize: normalizeReason, defaults: DEFAULT_DMS, solutions: SOLUTIONS },
    /** 即時監聽（範例生成頁、題庫生成頁；權限仍由規則把關） */
    live: {
      requests: (cb) => S.watchColl('sampleRequests', (rows) => cb(rows.map(reqOut).sort((a, b) => b.requestId.localeCompare(a.requestId)))),
      drafts: (cb) => S.watchColl('drafts', (rows) => cb(rows.filter((d) => d.status !== 'deleted').map(draftOut).sort((a, b) => b.draftId.localeCompare(a.draftId)))),
      draft: (id, cb) => S.watchDoc('drafts/' + id, (d) => cb(d ? draftOut(Object.assign({ id }, d)) : null)),
      sample: (id, cb) => S.watchDoc('samples/' + id, (d) => cb(d)),
      grades: (sid, cb) => S.watchColl('sessions/' + sid + '/grades', (rows) => cb(rows)),   // 多位講師同時閱卷：別人確認的分數即時出現
      sampleIndex: (cb) => S.watchDoc('meta/sampleIndex', (d) => { const items = (d && d.items) || {}; cb(Object.keys(items).sort().reverse().map((id) => Object.assign({ sampleId: id, tags: [], wantedTags: [] }, items[id]))); }),
    },
  };
  window.dispatchEvent(new Event('rrqp-db-ready'));
})();
