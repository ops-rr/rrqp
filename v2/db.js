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
  const toOps = (b, ops) => ops.forEach((o) => {
    if (o.op === 'set') b.set(ref(o.path), o.data, o.merge ? { merge: true } : {});
    else if (o.op === 'update') b.update(ref(o.path), o.data);
    else if (o.op === 'del') b.delete(ref(o.path));
  });
  return {
    async get(path) { const s = await F.getDoc(ref(path)); return s.exists() ? s.data() : null; },
    async list(coll) { const s = await F.getDocs(F.collection(db, coll)); return s.docs.map((d) => Object.assign({ id: d.id }, d.data())); },
    async set(path, data, merge) { await F.setDoc(ref(path), data, merge ? { merge: true } : {}); },
    async update(path, data) { await F.updateDoc(ref(path), data); },
    async del(path) { await F.deleteDoc(ref(path)); },
    async batch(ops) { for (let i = 0; i < ops.length; i += 450) { const b = F.writeBatch(db); toOps(b, ops.slice(i, i + 450)); await b.commit(); } },
    deleteField: () => F.deleteField(),
    /** 即時監聽：資料有變動就呼叫 cb；回傳取消監聽的函式 */
    watchDoc(path, cb) { return F.onSnapshot(ref(path), (s) => cb(s.exists() ? s.data() : null), (e) => console.warn('watch', path, e.code)); },
    watchColl(coll, cb) { return F.onSnapshot(F.collection(db, coll), (s) => cb(s.docs.map((d) => Object.assign({ id: d.id }, d.data()))), (e) => console.warn('watch', coll, e.code)); },
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
const VERSION = 'V2-2026-11-03b';
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

const topicOut = (t) => ({ topicId: t.id, name: t.name || { zh: t.id, en: t.id }, criteriaVersion: t.criteriaVersion || 'v1' });
const tagOut = (t) => ({ tagId: t.id, topicId: t.topicId, name: t.name || { zh: t.id, en: t.id }, desc: t.desc || '' });

// ───────── 範例的共用處理 ─────────
const reqOut = (r) => ({ requestId: r.id, requestedBy: r.requestedBy || '', requestedAt: r.requestedAt || null, returnId: r.returnId || '', topicId: r.topicId || 'agreement',
  wantedTags: r.wantedTags || [], note: r.note || '', status: r.status, reason: r.reason || '', sampleId: r.sampleId || '', updatedAt: r.updatedAt || null });
const indexRow = (x, req) => ({ topicId: x.topicId, tags: x.tags || [], pointZh: x.pointZh || '', answer: x.answer || '', changeHint: x.changeHint || '', status: x.status,
  source: x.source || '', requestId: x.requestId || '', requestedBy: (req && req.requestedBy) || '', wantedTags: (req && req.wantedTags) || [], approvedBy: x.approvedBy || '', updatedAt: x.updatedAt || null });
async function sampleFull(id) {
  const x = await S.get('samples/' + id) || fail('找不到範例 / Sample not found: ' + id);
  const req = x.requestId ? await S.get('sampleRequests/' + x.requestId).catch(() => null) : null;
  return Object.assign({ sampleId: id, tags: [], changeHint: '', reviewNote: '', suggest: null }, x, {
    wantedTags: (req && req.wantedTags) || [], requestedBy: (req && req.requestedBy) || '', note: (req && req.note) || '' });
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
function checkQuestion(q, reasons) {
  const errs = [], warn = [];
  const need = (c, m) => { if (!c) errs.push(m); };
  const bi = (v, p) => {
    if (!v || typeof v !== 'object') { errs.push(p + ' must be {zh, en}'); return; }
    if (!String(v.zh || '').trim()) errs.push(p + '.zh empty');
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
  if (reasons && reasons.length && !reasons.includes(r.reason)) errs.push('request.reason "' + r.reason + '" is not in the allowed list');
  bi(r.remark, 'request.remark');
  const fo = (drc.buyer || []).find((d) => d && d.type === 'offer');
  if (fo && (fo.solution !== r.solution || fo.amount !== r.amount)) errs.push('drc.buyer first offer (' + fo.solution + ' $' + fo.amount + ') must equal request (' + r.solution + ' $' + r.amount + ')');
  if (q.type === 'A' || q.type === 'B') {
    const opts = Array.isArray(q.options) ? q.options : [];
    need(opts.length >= 2 && opts.length <= 4, 'options must have 2–4 items');
    opts.forEach((o, j) => { need(o && o.id, 'options[' + j + '].id missing'); if (o) bi(o.text, 'options[' + j + '].text'); });
    need(opts.some((o) => o && o.id === q.answer), 'answer must be one of the option ids');
  }
  if (q.type === 'B' || q.type === 'C') { bi(q.modelAnswer, 'modelAnswer'); bi(q.rubric, 'rubric'); }
  bi(q.explanation, 'explanation'); bi(q.point, 'point');
  return { errors: errs, warnings: warn };
}

// ───────── 動作 ─────────
const ACTIONS = {
  me: async () => whoAmI(),

  /** 主題、標籤（啟用 / 停用）、選項範本：各頁共用 */
  t_topics: async () => {
    await needTeacher();
    const [topics, tags, sets] = await Promise.all([S.list('topics'), S.list('tags'), S.list('optionSets')]);
    return {
      topics: topics.map(topicOut),
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

  // ─── 範例生成（TW 講師） ───
  tw_requestSamples: async (b) => {
    const m = await needTW();
    const topicId = b.topicId || 'agreement';
    if (!(await S.get('topics/' + topicId))) fail('找不到主題 / Topic not found');
    const ids = [...new Set(String(Array.isArray(b.returnIds) ? b.returnIds.join('\n') : b.returnIds || '').split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean))];
    if (!ids.length) fail('請輸入 Return ID / Enter at least one Return ID');
    const bad = ids.filter((x) => !/^\d{6,20}$/.test(x));
    if (bad.length) fail('Return ID 格式錯誤（只能是數字） / Invalid Return ID: ' + bad.join(', '));
    if (ids.length > 30) fail('一次最多 30 筆 / At most 30 per request');
    // 等待中、處理中、已完成的 Return ID 不重複申請（取消或失敗的可以再申請）
    const open = new Set((await S.list('sampleRequests')).filter((r) => ['queued', 'processing', 'done'].includes(r.status)).map((r) => String(r.returnId)));
    const dup = ids.filter((x) => open.has(x)), add = ids.filter((x) => !open.has(x));
    if (!add.length) return { added: 0, duplicates: dup };
    const first = await S.nextIds('R', add.length);
    const t = now(), tags = (b.wantedTags || []).map(String), note = String(b.note || '').slice(0, 500);
    await S.batch(add.map((rid, i) => ({ op: 'set', path: 'sampleRequests/R' + String(first + i).padStart(4, '0'),
      data: { requestedBy: m.email, requestedAt: t, returnId: rid, topicId, wantedTags: tags, note, status: 'queued', reason: '', sampleId: '', updatedAt: t } })));
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
      const q = Object.assign({}, b.question); ['id', 'qid', 'seq', 'points'].forEach((k) => delete q[k]);
      const topic = (await S.get('topics/' + cur.topicId)) || {};
      const chk = checkQuestion(q, topic.reasons || []);
      if (chk.errors.length) fail('格式錯誤，未儲存 / Not saved: ' + chk.errors.slice(0, 6).join('; '));
      const leak = leakScan(q, '');
      if (leak.length) fail('內容疑似含有真實資料，未儲存 / Possible real data: ' + leak.join('、'));
      patch.question = q;
    }
    if (b.tags !== undefined) {
      const known = new Set((await S.list('tags')).filter((t) => t.topicId === cur.topicId).map((t) => t.id));
      const tags = (b.tags || []).map(String), unknown = tags.filter((t) => !known.has(t));
      if (unknown.length) fail('未知的標籤 / Unknown tags: ' + unknown.join(', '));
      patch.tags = tags;
    }
    if (b.pointZh !== undefined) patch.pointZh = String(b.pointZh || '').slice(0, 200);
    if (b.answer !== undefined) patch.answer = String(b.answer || '').slice(0, 50);
    if (b.changeHint !== undefined) patch.changeHint = String(b.changeHint || '').slice(0, 1000);
    await saveSample(b.sampleId, cur, patch);
    return { sample: await sampleFull(b.sampleId) };
  },

  /** 核准：進入範例庫，AI 出題時會使用；也可用來重新啟用停用的範例 */
  tw_approveSample: async (b) => {
    const m = await needTW();
    const cur = await S.get('samples/' + b.sampleId) || fail('找不到範例 / Sample not found');
    if (!(cur.tags || []).length) fail('請至少選一個標籤 / Pick at least one tag');
    if (!String(cur.pointZh || '').trim() || !String(cur.answer || '').trim()) fail('請填寫判斷重點與正解 / Key point and answer are required');
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
    ['keyFactors', 'reasons'].forEach((k) => { if (Array.isArray(p[k])) patch[k] = p[k].map((x) => String(x).trim()).filter(Boolean); });
    if (typeof p.rules === 'string') patch.rules = p.rules;
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
    check: (q, reasons) => checkQuestion(q, reasons),   // 題目格式檢查（編輯器套用前先檢查）
    /** 即時監聽（只給 TW 講師的範例生成頁用；權限仍由規則把關） */
    live: {
      requests: (cb) => S.watchColl('sampleRequests', (rows) => cb(rows.map(reqOut).sort((a, b) => b.requestId.localeCompare(a.requestId)))),
      sampleIndex: (cb) => S.watchDoc('meta/sampleIndex', (d) => { const items = (d && d.items) || {}; cb(Object.keys(items).sort().reverse().map((id) => Object.assign({ sampleId: id, tags: [], wantedTags: [] }, items[id]))); }),
    },
  };
  window.dispatchEvent(new Event('rrqp-db-ready'));
})();
