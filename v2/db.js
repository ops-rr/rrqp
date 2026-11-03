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
  const save = () => { try { sessionStorage.setItem(KEY, JSON.stringify(data)); } catch (_) { /* */ } };
  const DEL = { __del: true };
  const setPath = (obj, dotted, v) => {
    const ks = dotted.split('.'); let o = obj;
    ks.slice(0, -1).forEach((k) => { if (typeof o[k] !== 'object' || o[k] === null) o[k] = {}; o = o[k]; });
    if (v === DEL) delete o[ks.at(-1)]; else o[ks.at(-1)] = v;
  };
  const clone = (o) => (o == null ? null : JSON.parse(JSON.stringify(o)));
  const apply = (o) => {
    if (o.op === 'set') data[o.path] = o.merge ? Object.assign({}, data[o.path] || {}, clone(o.data)) : clone(o.data);
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
    auth: {
      signIn: async () => { user = { email: (CFG.OWNER || 'preview@shopee.com').toLowerCase(), name: 'Preview' }; subs.forEach((cb) => cb(user)); },
      signOut: async () => { user = null; subs.forEach((cb) => cb(null)); },
      onAuth: (cb) => { subs.push(cb); cb(user); },
    },
  };
}

// ───────── 共用 ─────────
const VERSION = 'V2-2026-11-03a';
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
  };
  window.dispatchEvent(new Event('rrqp-db-ready'));
})();
