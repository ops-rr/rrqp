/* RR AI Quiz Platform V2 — 前端（資料直接讀寫 Firestore，見 db.js） */
(() => {
  'use strict';
  const CFG = window.RRQP_CONFIG || {};
  const PREVIEW = /[?&]preview=1/.test(location.search);
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (_) { /* 無法儲存時忽略 */ } },
  };
  const sess = {
    get(k) { try { return sessionStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch (_) { /* */ } },
    del(k) { try { sessionStorage.removeItem(k); } catch (_) { /* */ } },
  };

  // ───────── i18n ─────────
  let lang = store.get('rrqp2:lang') === 'en' ? 'en' : 'zh';
  const I18N = {
    zh: {
      appSub: 'RR 部門線上測驗平台', signIn: '請使用公司 Google 帳號登入', signInGoogle: '使用 Google 帳號登入', navSettings: '主題設定', navAdmin: '管理', signOut: '登出', teacherPortal: '講師後台',
      reLogin: '登入已失效，請重新登入', noConfig: '尚未設定 config.js（firebase）', loading: '載入中…',
      guide: '使用說明', navLibrary: '範例生成', navDrafts: '題庫生成', navSessions: '測驗管理', navGrading: '閱卷發佈', navResults: '歷史成績', soon: '即將推出',
      drafts: '題庫生成', newDraft: '建立草稿', name: '草稿名稱', topic: '主題', tags: '重點標籤', tagsHint: '不選代表涵蓋全部', target: '題數',
      mix: '題型配比', typeA: 'A 選擇', typeB: 'B 選擇＋原因', typeC: 'C 文字', typeG: 'G 題組', mixSum: '合計 {n} 題', create: '建立', cancel: '取消',
      created: '草稿 {id} 已建立', cmdHint: '複製下面的指令，到 SeaTalk @RR AI Quiz Assistant 貼上，Agent 會開始生成題目。',
      copy: '複製', copied: '已複製', open: '開啟', copyCmd: '複製指令', refresh: '重新整理',
      colDraft: '草稿', colTopic: '主題', colProgress: '進度', colStatus: '狀態', colBy: '建立者', colUpdated: '更新時間',
      st_generating: '生成中', st_draft: '待校對', st_ready: '可發佈', generated: '已生成 {a} / {b}', reviewedN: '已校對 {a} / {b}',
      noDrafts: '還沒有草稿。按「建立草稿」開始。', back: '← 草稿',
      genBanner: 'Agent 正在生成題目（{a} / {b}）。若尚未開始，請到 SeaTalk @RR AI Quiz Assistant 貼上：',
      genAuto: '此頁每 15 秒自動更新。', markReady: '標記為可發佈', unready: '退回校對', readyDone: '草稿已標記為可發佈',
      readyNeed: '還有 {n} 題未校對', prev: '上一題', next: '下一題', save: '儲存', saved: '已儲存', saving: '儲存中…',
      markReviewed: '確認並標記已校對', unmarkReviewed: '取消已校對', reviewedTag: '已校對', notReviewed: '未校對',
      noChat: '（買賣雙方沒有聊聊）', editJson: '編輯 JSON', apply: '套用', jsonBad: 'JSON 格式錯誤：', del: '刪除', delRefill: '刪除並請 Agent 補一題', delOnly: '刪除，題數減 1',
      delConfirm: '確定刪除 {id}？', delRefillDone: '已刪除。請到 SeaTalk 再傳一次「{cmd}」補題。', delDone: '已刪除',
      unsaved: '這題有未儲存的修改，要放棄嗎？', discard: '放棄修改', keep: '繼續編輯',
      answerHint: '點選項可改正解', correct: '正解', setAnswer: '設為正解',
      prompt: '題目', buyer: '買家', seller: '賣家', chat: '聊聊', drc: 'DRC', drcBuyer: '買家 → 蝦皮', drcSeller: '賣家 → 蝦皮',
      request: '退貨退款申請', deduction: '折抵（折價券 / 蝦幣）', solution: '方案', amount: '金額', reason: '原因', remark: '備註', reqItems: '申退商品', orderItems: '訂單商品',
      item: '商品', variation: '規格', qty: '數量', price: '單價', subtotal: '小計', payment: '付款', method: '方式', status: '狀態', logistics: '物流',
      options: '選項', point: '判斷重點', explanation: '解析', modelAnswer: '參考答案', rubric: '評分標準', warnings: '系統提醒',
      agentHome: '目前沒有指派給你的測驗', agentHomeSub: '講師發佈測驗後，你會在這裡看到測驗連結。', none: '—',
      errTitle: '發生錯誤', sticker: '貼圖', criteria: '判斷標準',
    },
    en: {
      appSub: 'RR online quiz platform', signIn: 'Sign in with your company Google account', signInGoogle: 'Sign in with Google', navSettings: 'Settings', navAdmin: 'Admin', signOut: 'Sign out', teacherPortal: 'Trainer Console',
      reLogin: 'Your session expired. Please sign in again.', noConfig: 'config.js is not set (firebase)', loading: 'Loading…',
      guide: 'Guide', navLibrary: 'Samples', navDrafts: 'Generate', navSessions: 'Quizzes', navGrading: 'Grading', navResults: 'History', soon: 'Coming soon',
      drafts: 'Question Builder', newDraft: 'New draft', name: 'Draft name', topic: 'Topic', tags: 'Focus tags', tagsHint: 'Leave empty to cover all', target: 'Questions',
      mix: 'Type mix', typeA: 'A Choice', typeB: 'B Choice + reason', typeC: 'C Written', typeG: 'G Question set', mixSum: 'Total {n}', create: 'Create', cancel: 'Cancel',
      created: 'Draft {id} created', cmdHint: 'Copy this command and send it to @RR AI Quiz Assistant in SeaTalk to start generating.',
      copy: 'Copy', copied: 'Copied', open: 'Open', copyCmd: 'Copy command', refresh: 'Refresh',
      colDraft: 'Draft', colTopic: 'Topic', colProgress: 'Progress', colStatus: 'Status', colBy: 'Created by', colUpdated: 'Updated',
      st_generating: 'Generating', st_draft: 'In review', st_ready: 'Ready', generated: 'Generated {a} / {b}', reviewedN: 'Reviewed {a} / {b}',
      noDrafts: 'No drafts yet. Click "New draft" to start.', back: '← Drafts',
      genBanner: 'The agent is generating questions ({a} / {b}). If it has not started, send this to @RR AI Quiz Assistant in SeaTalk:',
      genAuto: 'This page refreshes every 15 seconds.', markReady: 'Mark as ready', unready: 'Back to review', readyDone: 'Draft marked as ready',
      readyNeed: '{n} question(s) not reviewed', prev: 'Previous', next: 'Next', save: 'Save', saved: 'Saved', saving: 'Saving…',
      markReviewed: 'Confirm & mark reviewed', unmarkReviewed: 'Unmark reviewed', reviewedTag: 'Reviewed', notReviewed: 'Not reviewed',
      noChat: '(No chat between buyer and seller)', editJson: 'Edit JSON', apply: 'Apply', jsonBad: 'Invalid JSON: ', del: 'Delete', delRefill: 'Delete and let the agent add one', delOnly: 'Delete, reduce count by 1',
      delConfirm: 'Delete {id}?', delRefillDone: 'Deleted. Send "{cmd}" in SeaTalk again to add a replacement.', delDone: 'Deleted',
      unsaved: 'This question has unsaved changes. Discard them?', discard: 'Discard', keep: 'Keep editing',
      answerHint: 'Click an option to change the answer', correct: 'Answer', setAnswer: 'Set as answer',
      prompt: 'Question', buyer: 'Buyer', seller: 'Seller', chat: 'Chat', drc: 'DRC', drcBuyer: 'Buyer → Shopee', drcSeller: 'Seller → Shopee',
      request: 'Return / refund request', deduction: 'Deduction (voucher / coins)', solution: 'Solution', amount: 'Amount', reason: 'Reason', remark: 'Remark', reqItems: 'Requested items', orderItems: 'Order items',
      item: 'Item', variation: 'Variation', qty: 'Qty', price: 'Price', subtotal: 'Subtotal', payment: 'Payment', method: 'Method', status: 'Status', logistics: 'Logistics',
      options: 'Options', point: 'Key point', explanation: 'Explanation', modelAnswer: 'Model answer', rubric: 'Rubric', warnings: 'System notes',
      agentHome: 'No quiz assigned to you yet', agentHomeSub: 'When your trainer publishes a quiz, the link will appear here.', none: '—',
      errTitle: 'Something went wrong', sticker: 'Sticker', criteria: 'Criteria',
    },
  };
  const t = (k, vars) => String((I18N[lang][k] ?? I18N.zh[k] ?? k)).replace(/\{(\w+)\}/g, (_, v) => (vars && vars[v] !== undefined ? vars[v] : ''));
  const L = (v) => (v == null ? '' : typeof v === 'object' ? (v[lang] ?? v.zh ?? v.en ?? '') : String(v));
  function setLang(l) { if (leaveGuard && !leaveGuard()) return; leaveGuard = null; lang = l; store.set('rrqp2:lang', l); document.documentElement.lang = l === 'zh' ? 'zh-Hant' : 'en'; route(); }

  // ───────── toast & modal ─────────
  let toastTimer;
  function toast(msg, ms = 2600) {
    const el = $('#toast'); el.textContent = msg; el.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, ms);
  }
  function modal(html, { wide = false, onMount } = {}) {
    return new Promise((resolve) => {
      const bg = document.createElement('div');
      bg.className = 'modal-bg';
      bg.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">${html}</div>`;
      document.body.appendChild(bg);
      const close = (v) => { bg.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
      const onKey = (e) => { if (e.key === 'Escape') close(null); };
      document.addEventListener('keydown', onKey);
      bg.addEventListener('click', (e) => { if (e.target === bg) close(null); const b = e.target.closest('[data-close]'); if (b) close(b.dataset.close); });
      if (onMount) onMount(bg.firstElementChild, close);
    });
  }
  const confirmBox = (msg, okLabel, cancelLabel = t('cancel'), danger = false) => modal(
    `<div>${esc(msg)}</div><div class="row" style="justify-content:flex-end"><button class="btn" data-close="">${esc(cancelLabel)}</button><button class="btn ${danger ? 'brand' : 'primary'}" data-close="ok">${esc(okLabel)}</button></div>`,
  ).then((v) => v === 'ok');
  async function copyText(s) {
    try { await navigator.clipboard.writeText(s); } catch (_) {
      const ta = document.createElement('textarea'); ta.value = s; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch (__) { /* */ } ta.remove();
    }
    toast(t('copied') + '：' + s);
  }

  // ───────── auth（Firebase Google 登入） ─────────
  let auth = null, me = null, authKnown = false;
  const DB = () => window.RRQP_DB;
  function signOut() {
    me = null; auth = null;
    try { DB() && DB().signOut && DB().signOut(); } catch (_) { /* */ }
    location.hash = ''; renderLogin();
  }
  function expired() { me = null; renderLogin(t('reLogin')); }

  // ───────── API（db.js） ─────────
  async function api(action, payload = {}) {
    if (!DB() || !DB().api) throw new Error((DB() && DB().error) || 'Firebase not ready');
    try { return await DB().api(action, payload); }
    catch (e) { if (/Not signed in/.test(e.message || '')) expired(); throw e; }
  }

  // ───────── layout ─────────
  const app = () => $('#app');
  function langSeg() {
    return `<div class="seg" role="group" aria-label="Language"><button type="button" data-lang="zh" class="${lang === 'zh' ? 'on' : ''}">中文</button><button type="button" data-lang="en" class="${lang === 'en' ? 'on' : ''}">EN</button></div>`;
  }
  function bindCommon(root) {
    $$('[data-lang]', root).forEach((b) => b.addEventListener('click', () => setLang(b.dataset.lang)));
    const so = $('[data-signout]', root); if (so) so.addEventListener('click', signOut);
  }
  function shell(active, inner) {
    const teacher = me && me.isTeacher;
    const nav = teacher ? `<nav class="nav" aria-label="${esc(t('teacherPortal'))}">
        ${me.role === 'tw' ? `<a href="#/library" class="${active === 'library' ? 'on' : ''}">${esc(t('navLibrary'))}</a>` : ''}
        <a href="#/drafts" class="${active === 'drafts' ? 'on' : ''}">${esc(t('navDrafts'))}</a>
        <a href="#/bank" class="${active === 'bank' ? 'on' : ''}">${esc(t('navBank'))}</a>
        <a href="#/sessions" class="${active === 'sessions' ? 'on' : ''}">${esc(t('navSessions'))}</a>
        <a href="#/grading" class="${active === 'grading' ? 'on' : ''}">${esc(t('navGrading'))}</a>
        <a href="#/results" class="${active === 'results' ? 'on' : ''}">${esc(t('navResults'))}</a>${me.role === 'tw' ? `<a href="#/settings" class="${active === 'settings' ? 'on' : ''}">${esc(t('navSettings'))}</a>` : ''}${me.isAdmin ? `<a href="#/admin" class="${active === 'admin' ? 'on' : ''}">${esc(t('navAdmin'))}</a>` : ''}</nav>` : '';
    app().innerHTML = `<header class="top">
        <div class="brandmark"><span class="logo" aria-hidden="true">S</span><span>RR AI Quiz Platform</span><span class="chip brand" style="font-weight:700">V2</span></div>
        ${nav}
        <div class="right">${me ? `<a class="btn sm guide-link" href="guide.html#${teacher ? 'trainer' : 'agent'}-${lang}" target="_blank" rel="noopener">${esc(t('guide'))}</a>` : ''}${langSeg()}<span class="muted hide-sm hdr-email">${esc(me ? me.email : '')}</span><button class="btn sm ghost" data-signout title="${esc(me ? me.email : '')}">${esc(t('signOut'))}</button></div>
      </header><main id="main">${inner}</main>`;
    bindCommon(app());
    return $('#main');
  }
  function showError(e, where) {
    const el = where || $('#main') || app();
    el.innerHTML = `<div class="banner err"><b>${esc(t('errTitle'))}</b><br>${esc(e.message || e)}</div>`;
  }

  // ───────── login ─────────
  function renderLogin(msg) {
    app().innerHTML = `<div class="login"><div class="card">
        <span class="logo" aria-hidden="true">S</span>
        <h1>RR AI Quiz Platform <span class="chip brand">V2</span></h1>
        <div class="muted">${esc(t('appSub'))}</div>
        ${msg ? `<div class="banner warn" style="width:100%">${esc(msg)}</div>` : ''}
        <div class="small muted" style="margin-top:8px">${esc(t('signIn'))}</div>
        <button class="btn brand" id="gbtn" type="button">${esc(t('signInGoogle'))}</button>
        <div id="loginErr" class="banner err" hidden></div>
        <div style="margin-top:8px">${langSeg()}</div>
      </div></div>`;
    bindCommon(app());
    const err = (m) => { const e = $('#loginErr'); e.textContent = m; e.hidden = false; };
    if (!DB() || DB().error) { err((DB() && DB().error) || t('noConfig')); $('#gbtn').disabled = true; return; }
    $('#gbtn').onclick = async () => {
      $('#gbtn').disabled = true;
      try { await DB().signIn(); } catch (e) { err(e.message); $('#gbtn').disabled = false; }
    };
  }

  async function boot() {
    app().innerHTML = `<div class="login"><div class="muted"><span class="spin"></span> ${esc(t('loading'))}</div></div>`;
    try {
      me = await api('me');
      if (!me.isTeacher && !store.get('rrqp2:lang')) { lang = 'en'; document.documentElement.lang = 'en'; } // 專員預設英文
      if (me.isTeacher && (!location.hash || location.hash === '#/')) location.hash = '#/drafts';
      route();
    } catch (e) {
      if (!auth) return;
      renderLogin(e.message);
    }
  }

  // ───────── router ─────────
  let pollTimer = null;
  let liveOff = null;   // 即時監聽的取消函式（換頁時取消）
  let leaveGuard = null; // 回傳 true 表示可以離開
  function route() {
    clearInterval(pollTimer); pollTimer = null;
    if (liveOff) { liveOff(); liveOff = null; }
    if (!authKnown) { app().innerHTML = `<div class="login"><div class="muted"><span class="spin"></span> ${esc(t('loading'))}</div></div>`; return; }
    if (!auth) { renderLogin(); return; }
    if (!me) { boot(); return; }
    leaveGuard = null;
    const h = location.hash.replace(/^#\/?/, '').split('?')[0];
    const [page, arg] = h.split('/');
    if (page === 's' && arg) return viewQuizEntry(decodeURIComponent(arg));
    if (me.isTeacher && page === 'draft' && arg) return viewDraft(decodeURIComponent(arg));
    if (me.isTeacher && page === 'sessions') return viewSessions();
    if (me.isTeacher && page === 'session' && arg) return viewSession(decodeURIComponent(arg));
    if (me.isTeacher && page === 'preview' && arg) return viewPreview(decodeURIComponent(arg));
    if (me.isTeacher && page === 'mine') return viewMyQuizzes();
    if (me.isTeacher && page === 'library' && arg) return viewSample(decodeURIComponent(arg));
    if (me.isTeacher && page === 'library') return viewLibrary();
    if (me.isTeacher && page === 'bank' && arg) return viewBankItem(decodeURIComponent(arg));
    if (me.isTeacher && page === 'bank') return viewBank();
    if (me.isTeacher && page === 'grading' && arg) return viewGrading(decodeURIComponent(arg));
    if (me.isTeacher && page === 'grading') return viewGradingList();
    if (me.isTeacher && page === 'results' && arg) return viewSessionResults(decodeURIComponent(arg));
    if (me.isTeacher && page === 'results') return viewResults();
    if (me.isTeacher && page === 'agent' && arg) return viewAgentHistory(decodeURIComponent(arg));
    if (me.isAdmin && page === 'admin') return viewAdmin();
    if (me.role === 'tw' && page === 'settings') return viewSettings();
    if (me.isTeacher && (page === 'drafts' || page === '')) return viewDrafts();
    return viewMyQuizzes();
  }
  window.addEventListener('hashchange', () => {
    if (leaveGuard && !leaveGuard()) return;
    leaveGuard = null; route();
  });

  // ───────── 草稿列表 ─────────
  let topicsCache = null;
  async function getTopics() { if (!topicsCache) { topicsCache = await api('t_topics'); dmsRules = topicsCache.dms || dmsRules; } return topicsCache; }
  const statusChip = (s) => `<span class="chip ${s === 'ready' || s === 'banked' ? 'ok' : s === 'generating' ? 'info' : 'warn'}">${s === 'generating' ? '<span class="spin" style="width:10px;height:10px;border-width:1.5px"></span> ' : ''}${esc(t('st_' + s))}</span>`;
  const fmtTime = (iso) => { if (!iso) return ''; const d = new Date(iso); if (isNaN(d)) return iso; const p = (n) => String(n).padStart(2, '0'); return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`; };
  function progressCell(d) {
    if (d.status === 'generating') {
      const pct = d.target ? Math.round((d.imported / d.target) * 100) : 0;
      return `<div class="bar"><i style="width:${pct}%"></i></div><div class="small muted">${esc(t('generated', { a: d.imported, b: d.target }))}</div>`;
    }
    const pct = d.imported ? Math.round((d.reviewed / d.imported) * 100) : 0;
    return `<div class="bar ok"><i style="width:${pct}%"></i></div><div class="small muted">${esc(t('reviewedN', { a: d.reviewed, b: d.imported }))}</div>`;
  }

  async function viewDrafts(createdCmd) {
    const main = shell('drafts', `<div class="row"><h1>${esc(t('drafts'))}</h1><span class="spacer"></span>
        <button class="btn" id="refresh">${esc(t('refresh'))}</button><button class="btn brand" id="newBtn">+ ${esc(t('newDraft'))}</button></div>
      <div id="createBox"></div><div id="cmdBox"></div>
      <div class="card scroll-x" id="listBox"><div class="empty-state"><span class="spin"></span> ${esc(t('loading'))}</div></div>`);
    $('#newBtn').onclick = () => openCreate();
    $('#refresh').onclick = () => loadList();
    if (createdCmd) showCmd(createdCmd);
    let topics;
    let lastJ = '';
    async function loadList(silent) {
      try {
        const [{ drafts }, tp] = await Promise.all([api('t_listDrafts'), getTopics()]);
        topics = tp; render(drafts);
        if (!liveOff) liveOff = DB().live.drafts((rows) => { const j = JSON.stringify(rows); if (j !== lastJ && $('#listBox')) render(rows); });
      } catch (e) { if (!silent) showError(e, $('#listBox')); }
    }
    function render(drafts) {
      lastJ = JSON.stringify(drafts);
      {
        const topicName = (id) => L((topics.topics.find((x) => x.topicId === id) || {}).name) || id;
        const box = $('#listBox'); if (!box) return;
        if (!drafts.length) { box.innerHTML = `<div class="empty-state">${esc(t('noDrafts'))}</div>`; return; }
        box.innerHTML = `<table class="list"><thead><tr><th>${esc(t('colDraft'))}</th><th>${esc(t('colTopic'))}</th><th>${esc(t('colProgress'))}</th><th>${esc(t('colStatus'))}</th><th class="hide-sm">${esc(t('colBy'))}</th><th class="hide-sm">${esc(t('colUpdated'))}</th><th></th></tr></thead><tbody>${
          drafts.map((d) => `<tr class="click" data-open="${esc(d.draftId)}">
            <td><b>${esc(d.draftId)}</b> ${esc(d.name)}<div class="small soft">${d.tags.map(esc).join(' · ')}</div></td>
            <td>${esc(topicName(d.topicId))}</td><td>${progressCell(d)}</td><td>${statusChip(d.status)}</td>
            <td class="hide-sm small muted">${esc(d.createdBy)}</td><td class="hide-sm small muted">${esc(fmtTime(d.updatedAt))}</td>
            <td style="text-align:right;white-space:nowrap">${d.status === 'generating' ? `<button class="btn sm" data-copy="生成考題 ${esc(d.draftId)}">${esc(t('copyCmd'))}</button>` : `<button class="btn sm">${esc(t('open'))}</button>`}
              ${me.can.draft ? `<button class="btn sm ghost danger" data-del="${esc(d.draftId)}" data-banked="${d.status === 'banked' ? 1 : 0}" title="${esc(t('delDraft'))}">${esc(t('del'))}</button>` : ''}</td></tr>`).join('')
        }</tbody></table>`;
        $$('[data-copy]', box).forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); copyText(b.dataset.copy); }));
        $$('[data-open]', box).forEach((r) => r.addEventListener('click', () => { location.hash = '#/draft/' + r.dataset.open; }));
        $$('[data-del]', box).forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); deleteDraft(b.dataset.del, b.dataset.banked === '1' ? 0 : null, loadList); }));
      }
    }
    function showCmd(cmd) {
      const id = cmd.replace('生成考題 ', '');
      $('#cmdBox').innerHTML = `<div class="card pad" style="display:flex;flex-direction:column;gap:10px">
        <div><b>${esc(t('created', { id }))}</b> <span class="muted">${esc(t('cmdHint'))}</span></div>
        <div class="cmd"><code>${esc(cmd)}</code><span class="spacer"></span><button class="btn sm" id="cpy">${esc(t('copy'))}</button></div></div>`;
      $('#cpy').onclick = () => copyText(cmd);
    }
    async function openCreate() {
      const tp = topics || await getTopics();
      const box = $('#createBox');
      if (box.innerHTML) { box.innerHTML = ''; return; }
      const topicOpts = tp.topics.filter((x) => x.active).map((x) => `<option value="${esc(x.topicId)}">${esc(L(x.name))}</option>`).join('');
      box.innerHTML = `<form class="card pad" id="cform" style="display:flex;flex-direction:column;gap:16px">
        <h2>${esc(t('newDraft'))}</h2>
        <div class="form">
          <label class="k" for="f_name">${esc(t('name'))}</label><input type="text" id="f_name" required maxlength="60" placeholder="${lang === 'zh' ? '例：寄錯商品-第1梯' : 'e.g. Wrong item - Batch 1'}">
          <label class="k" for="f_topic">${esc(t('topic'))}</label><select id="f_topic">${topicOpts}</select>
          <span class="k">${esc(t('tags'))}</span><div><div class="tags" id="f_tags"></div><div class="small soft" style="margin-top:4px">${esc(t('tagsHint'))}</div></div>
          <label class="k" for="f_target">${esc(t('target'))}</label><div class="row"><input type="number" id="f_target" min="1" max="50" value="10"></div>
          <span class="k">${esc(t('mix'))}</span><div><div class="small" id="f_grp" hidden></div><div class="row" id="f_mix">
            <label class="small">${esc(t('typeA'))} <input type="number" id="f_A" min="0" max="50" value="3"></label>
            <label class="small">${esc(t('typeB'))} <input type="number" id="f_B" min="0" max="50" value="5"></label>
            <label class="small">${esc(t('typeC'))} <input type="number" id="f_C" min="0" max="50" value="2"></label>
            <span class="small" id="f_sum"></span></div></div>
        </div>
        <div id="f_err" class="banner err" hidden></div>
        <div class="row"><button type="submit" class="btn brand" id="f_go">${esc(t('create'))}</button><button type="button" class="btn" id="f_cancel">${esc(t('cancel'))}</button></div>
      </form>`;
      const drawTags = () => {
        const tid = $('#f_topic').value;
        $('#f_tags').innerHTML = tp.tags.filter((x) => x.topicId === tid).map((x) => `<label class="tag-opt"><input type="checkbox" value="${esc(x.tagId)}"> ${esc(L(x.name))}</label>`).join('');
        $$('#f_tags input').forEach((c) => c.addEventListener('change', () => c.parentElement.classList.toggle('on', c.checked)));
      };
      const grpOf = () => { const x = tp.topics.find((y) => y.topicId === $('#f_topic').value); return (x && x.group) || null; };
      const sum = () => {
        const g = grpOf();
        $('#f_grp').hidden = !g; $('#f_mix').hidden = !!g;
        if (g) { $('#f_grp').innerHTML = `<span class="chip info">${esc(t('grpTopicOnly', { n: g.length }))}</span>`; const n0 = +$('#f_target').value || 0; $('#f_go').disabled = n0 < 1 || n0 > 50; return; }
        const n = +$('#f_target').value || 0, s = (+$('#f_A').value || 0) + (+$('#f_B').value || 0) + (+$('#f_C').value || 0);
        $('#f_sum').innerHTML = s === n ? `<span class="chip ok">${esc(t('mixSum', { n: s }))} ✓</span>` : `<span class="chip warn">${esc(t('mixSum', { n: s }))} ≠ ${n}</span>`;
        $('#f_go').disabled = s !== n || n < 1 || n > 50;
      };
      $('#f_target').addEventListener('input', () => { // 題數改變時自動調整 B
        const n = +$('#f_target').value || 0; const a = +$('#f_A').value || 0, c = +$('#f_C').value || 0;
        $('#f_B').value = Math.max(0, n - a - c); sum();
      });
      ['#f_A', '#f_B', '#f_C'].forEach((s) => $(s).addEventListener('input', sum));
      $('#f_topic').addEventListener('change', () => { drawTags(); sum(); });
      $('#f_cancel').onclick = () => { box.innerHTML = ''; };
      drawTags(); sum(); $('#f_name').focus();
      $('#cform').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = $('#f_go'); btn.disabled = true; $('#f_err').hidden = true;
        try {
          const r = await api('t_createDraft', {
            name: $('#f_name').value.trim(), topicId: $('#f_topic').value, target: +$('#f_target').value,
            tags: $$('#f_tags input:checked').map((c) => c.value),
            mix: grpOf() ? { G: +$('#f_target').value } : { A: +$('#f_A').value || 0, B: +$('#f_B').value || 0, C: +$('#f_C').value || 0 },
          });
          box.innerHTML = ''; showCmd(r.command); loadList();
        } catch (err) { $('#f_err').textContent = err.message; $('#f_err').hidden = false; btn.disabled = false; }
      });
    }
    loadList();
  }

  // ───────── 題目呈現 ─────────
  function itemTable(items) {
    if (!items || !items.length) return `<div class="soft">${t('none')}</div>`;
    const total = items.reduce((s, it) => s + (+it.qty || 0) * (+it.price || 0), 0);
    return `<table class="items"><tr><th>${esc(t('item'))}</th><th>${esc(t('variation'))}</th><th>${esc(t('qty'))}</th><th>${esc(t('price'))}</th></tr>${
      items.map((it) => `<tr><td>${esc(L(it.name))}</td><td>${esc(L(it.variation)) || t('none')}</td><td>${esc(it.qty)}</td><td>$${esc(it.price)}</td></tr>`).join('')
    }<tr><td colspan="3" style="text-align:right" class="soft">${esc(t('subtotal'))}</td><td><b>$${total}</b></td></tr></table>`;
  }
  function chatMsg(m) {
    let inner;
    if (m.type === 'sticker') inner = `<span class="sticker" title="${esc(t('sticker'))}: ${esc(m.sticker)}">${m.sticker === 'thanks' ? '🙏' : '👌'}</span>`;
    else if (m.type === 'media' || m.type === 'image') inner = `<div class="media">${m.kind === 'video' ? '🎬' : '🖼️'} ${esc(L(m.desc) || '')}</div>`;
    else inner = esc(L(m.text));
    const who = m.from === 'seller' ? 'seller' : 'buyer';
    return `<div class="msg ${who}"><div class="t">${esc(t(who))} · ${esc(m.t)}</div>${inner}</div>`;
  }
  function drcItems(arr) {
    if (!arr || !arr.length) return `<div class="soft small">${t('none')}</div>`;
    return arr.map((d) => `<div class="item"><span class="soft">${esc(d.t || '')}</span> ${d.type === 'offer' ? `<b>${esc(d.solution)} $${esc(d.amount)}</b>` : esc(L(d.text))}</div>`).join('');
  }
  /** DMS 申退原因：中文介面顯示「中文（English）」；講師端用設定頁的 DMS 規則，專員端用內建表 */
  let dmsRules = null;                       // 由 t_topics 載入（getTopics / getLibMeta）
  const dmsNow = () => dmsRules || (DB() && DB().dms ? DB().dms.defaults : { reasons: [] });
  const findReason = (r) => (DB() && DB().dms ? DB().dms.find(dmsNow(), r) : null);
  const reasonLabel = (r) => { const e = findReason(r); const en = e ? e.en : r; return lang === 'zh' && e ? `${e.zh}（${en}）` : en || ''; };
  /** 題目情境（左欄 + 右欄的申請資訊）；講師與專員共用 */
  function caseHtml(q) {
    const r = q.request || {};
    const left = `${q.cutoff ? `<div class="cutoff">⏱ ${esc(t('cutoffBanner', { t: q.cutoff }))}</div>` : ''}<div class="prompt">${esc(L(q.prompt))}</div>
      <div class="parties">${esc(t('buyer'))} ${esc(q.buyer?.username)} (${esc(q.buyer?.id)}) · ${esc(t('seller'))} ${esc(q.seller?.username)} (${esc(q.seller?.id)})</div>
      ${q.order ? `<h4>${esc(t('orderItems'))}</h4>${itemTable(q.order.items)}` : ''}
      ${q.payment ? `<h4>${esc(t('payment'))}</h4><div class="box kv"><span>${esc(t('method'))}</span><span>${esc(L(q.payment.method))}</span><span>${esc(t('status'))}</span><span>${esc(L(q.payment.status))}</span></div>` : ''}
      ${q.logistics ? `<h4>${esc(t('logistics'))} · ${esc(L(q.logistics.carrier))}</h4><div class="box">${(q.logistics.events || []).map((e) => `<span class="soft">${esc(e.t)}</span> ${esc(L(e.status))}`).join('<br>')}</div>` : ''}
      <h4>${esc(t('chat'))}</h4><div class="chat">${(q.chat || []).length ? q.chat.map(chatMsg).join('') : `<div class="small soft">${esc(t('noChat'))}</div>`}</div>
      <h4>${esc(t('drc'))}</h4><div class="drc"><div class="box"><b class="small">${esc(t('drcBuyer'))}</b>${drcItems(q.drc?.buyer)}</div><div class="box"><b class="small">${esc(t('drcSeller'))}</b>${drcItems(q.drc?.seller)}</div></div>`;
    const req = `<h4>${esc(t('request'))}</h4>
      <div class="box kv"><span>${esc(t('solution'))}</span><span><b>${esc(r.solution)}</b></span><span>${esc(t('amount'))}</span><span><b>$${esc(r.amount)}</b></span>
      ${r.deduction ? `<span>${esc(t('deduction'))}</span><span>−$${esc(r.deduction)}</span>` : ''}
      <span>${esc(t('reason'))}</span><span>${esc(reasonLabel(r.reason))}</span><span>${esc(t('remark'))}</span><span>${L(r.remark) ? esc(L(r.remark)) : '<span class="soft">—</span>'}</span></div>
      ${r.items ? `<h4>${esc(t('reqItems'))}</h4>${itemTable(r.items)}` : ''}`;
    return { left, req };
  }

  // ───────── 題組（G 題）：一題多個小題，全對得滿分，否則每對一小題得 滿分 ÷（2 × 小題數） ─────────
  Object.assign(I18N.zh, {
    grpConvert: '轉成題組', grpTitle: '題組（{n} 小題）', grpKeyHint: '點選每個小題的正解', grpNoAns: '未設定正解', grpScoring: '計分：全對得滿分，否則每答對一小題得 滿分 ÷（2 × {n}）',
    grpMine: '你的答案', grpKey: '正解', grpOkN: '答對 {a} / {b} 小題', grpTopicOnly: '這個主題使用題組：全部出 G 題（{n} 小題）', qeTypeG: 'G：題組',
    grpToG: '改成題組後，原本的選項、正解、參考答案與評分標準會移除，請重新點選每個小題的正解。', grpNone: '這個主題沒有題組範本',
    grpTopic: '題組範本', grpTopicHint: '題組範本目前用「匯入主題」更新（JSON 檔的 topic.group）。改範本不會影響已經出好的題目。',
    blindSubs: 'AI 沒看答案時，以下小題和正解不同：', tImportUpdate: '已經有主題「{n}」。要用檔案內容更新它嗎？判斷標準有改時版本號會 +1 並保留舊版；已有的標籤不會被修改。', tUpdated: '已更新主題 {n}',
  });
  Object.assign(I18N.en, {
    grpConvert: 'Convert to question set', grpTitle: 'Question set ({n} parts)', grpKeyHint: 'Pick the correct answer for each part', grpNoAns: 'No answer set', grpScoring: 'Scoring: all correct = full points; otherwise each correct part earns full ÷ (2 × {n})',
    grpMine: 'Your answer', grpKey: 'Correct', grpOkN: '{a} / {b} parts correct', grpTopicOnly: 'This topic uses question sets: all questions are type G ({n} parts)', qeTypeG: 'G: Question set',
    grpToG: 'Switching to a question set removes the options, answer, model answer and rubric. Pick the answer for each part again.', grpNone: 'This topic has no question set template',
    grpTopic: 'Question set template', grpTopicHint: 'Update the template with Import topic (topic.group in the JSON). Changing it does not affect existing questions.',
    blindSubs: 'Without seeing the key, the AI answered these parts differently: ', tImportUpdate: 'Topic "{n}" already exists. Update it with this file? If the criteria changed, the version goes up and the old version is kept. Existing tags are not changed.', tUpdated: 'Topic {n} updated',
  });
  const topicGroup = (meta, topicId) => { const x = ((meta && meta.topics) || []).find((y) => y.topicId === topicId); return (x && x.group) || null; };
  const grpOpt = (sub, id) => ((sub && sub.options) || []).find((o) => o.id === id);
  /** 正解摘要（列表用）：各小題答案以「／」串起來 */
  const grpSummary = (q) => (q && q.type === 'G' ? (q.group || []).map((x) => { const o = grpOpt(x, (q.subAnswers || {})[x.id]); return o ? L(o.text) : '?'; }).join('／') : '');
  /**
   * 題組畫面：mode = key（講師點正解）、view（唯讀顯示正解）、quiz（專員作答）、result（作答與正解對照）
   * picks = 作答 {s1: 'a'}（quiz / result）
   */
  function groupHtml(q, mode, picks = {}, disabled = false) {
    const g = q.group || [], key = q.subAnswers || {};
    return `<div class="grp">${g.map((x, i) => {
      const head = `<div class="grp-q"><span class="grp-n">${i + 1}</span><b>${esc(L(x.text))}</b></div>`;
      if (mode === 'quiz') return `<div class="grp-sub">${head}<div class="grp-opts">${x.options.map((o) => `<label class="ropt ${picks[x.id] === o.id ? 'on' : ''} ${o.id === 'na' ? 'na' : ''}"><input type="radio" name="sub_${esc(x.id)}" data-sub="${esc(x.id)}" value="${esc(o.id)}" ${picks[x.id] === o.id ? 'checked' : ''}> ${esc(L(o.text))}</label>`).join('')}</div></div>`;
      if (mode === 'result') {
        const mine = grpOpt(x, picks[x.id]), right = grpOpt(x, key[x.id]), ok = !!mine && picks[x.id] === key[x.id];
        return `<div class="grp-sub">${head}<div class="rvgrid small"><span>${esc(t('grpMine'))}</span><span class="${ok ? 'okc' : 'errc'}">${mine ? esc(L(mine.text)) : esc(t('noChoice'))} ${ok ? '✓' : '✕'}</span>${ok ? '' : `<span>${esc(t('grpKey'))}</span><span class="okc"><b>${right ? esc(L(right.text)) : '—'}</b></span>`}</div></div>`;
      }
      return `<div class="grp-sub">${head}<div class="grp-opts">${x.options.map((o) => {
        const on = key[x.id] === o.id;
        return mode === 'key' ? `<button type="button" class="opt sm ${on ? 'correct' : ''}" data-subkey="${esc(x.id)}" data-val="${esc(o.id)}" ${disabled ? 'disabled' : ''}>${esc(L(o.text))}${on ? `<span class="hint">✓ ${esc(t('correct'))}</span>` : ''}</button>`
          : `<div class="opt sm ${on ? 'correct' : ''}">${esc(L(o.text))}${on ? `<span class="hint">✓ ${esc(t('correct'))}</span>` : ''}</div>`;
      }).join('')}${key[x.id] ? '' : `<span class="chip warn">${esc(t('grpNoAns'))}</span>`}</div></div>`;
    }).join('')}</div>`;
  }
  /** 講師點選正解：work.subAnswers 更新後呼叫 onChange */
  function bindGroupKey(root, work, onChange) {
    $$('[data-subkey]', root).forEach((b) => b.addEventListener('click', () => {
      work.subAnswers = Object.assign({}, work.subAnswers, { [b.dataset.subkey]: b.dataset.val }); onChange();
    }));
  }

  // ───────── 題目內容編輯器（表單，取代手動編輯 JSON） ─────────
  Object.assign(I18N.zh, {
    qeApplied: '已套用，記得按「儲存」', qeTitle: '編輯題目內容', qeOpen: '編輯題目內容', qeApply: '套用', qeCancel: '取消', qeJsonAdv: '進階：編輯 JSON',
    qeParties: '買家與賣家', qeBuyer: '買家帳號', qeSeller: '賣家帳號', qeId: 'ID',
    qeOrder: '訂單商品', qeName: '商品名稱', qeVar: '規格', qeQty: '數量', qePrice: '單價', qeAddItem: '＋ 新增商品',
    qePayment: '付款', qeMethod: '付款方式', qePayStatus: '付款狀態',
    qeLogistics: '物流', qeCarrier: '物流商', qeEvents: '物流時間軸', qeAddEvent: '＋ 新增物流紀錄', qeTime: '時間', qeEvStatus: '狀態',
    qeChat: '聊聊', qeAddMsg: '＋ 新增訊息', qeFrom: '誰說的', qeType: '類型', qeText: '文字', qeSticker: '貼圖', qeMedia: '照片 / 影片', qeKind: '種類', qeImage: '照片', qeVideo: '影片', qeDesc: '畫面描述',
    qeStickerOk: 'OK（同意）', qeStickerThanks: '謝謝',
    qeDrc: 'DRC', qeAddDrc: '＋ 新增', qeOffer: '提案', qeDrcText: '文字', qeDrcSync: '買家 DRC 第一筆固定是申請時的提案（System Info），方案與金額自動和下方申請一致；文字訊息提到的金額、原因也要和申請相同。',
    qeRequest: '退貨退款申請', qeSolution: '方案', qeReason: '退貨原因', qeRemark: '申請備註', qeDeduction: '折抵（折價券 / 蝦幣）', qeReqItems: '申退商品', qeAmount: '申請金額',
    qeAmountAuto: '依申退商品「單價 × 數量」加總，再扣掉折抵，自動計算；買家無法自行調整金額。',
    qeQuestion: '題目與解析', qePrompt: '題目問句', qeQType: '題型', qeTypeA: 'A：選擇', qeTypeB: 'B：選擇 + 原因', qeTypeC: 'C：文字作答', qeOptions: '選項（點圓圈設為正解）', qeAddOpt: '＋ 新增選項',
    qePoint: '判斷重點', qeModel: '參考答案', qeRubric: '評分標準', qeExpl: '解析',
    qeUp: '上移', qeDown: '下移', qeDel: '刪除', qeErrors: '還有以下問題需要修正：', qeOrderHint: '申退商品要從訂單商品中挑選，名稱與規格需完全相同、單價相同。',
    qeSolOnly: 'DMS 規則：此原因只能申請 {s}', ruleErrTitle: '不符合目前的規則', ruleErrHint: '（可能是規則加入前生成的題目）。請用「編輯題目內容」修正，修正前不能標記已校對或加入題庫。', qeCutoff: '判斷時點（資訊截至）', qeCutoffHint: '題目只呈現到這個時間；聊聊、DRC、物流都不能晚於此時間。空白表示不截斷。',
    cutoffBanner: '資訊截至 {t}（請依此時點判斷）',
  });
  Object.assign(I18N.en, {
    qeApplied: 'Applied. Remember to press Save.', qeTitle: 'Edit question content', qeOpen: 'Edit content', qeApply: 'Apply', qeCancel: 'Cancel', qeJsonAdv: 'Advanced: edit JSON',
    qeParties: 'Buyer & seller', qeBuyer: 'Buyer username', qeSeller: 'Seller username', qeId: 'ID',
    qeOrder: 'Order items', qeName: 'Item name', qeVar: 'Variation', qeQty: 'Qty', qePrice: 'Unit price', qeAddItem: '＋ Add item',
    qePayment: 'Payment', qeMethod: 'Method', qePayStatus: 'Status',
    qeLogistics: 'Logistics', qeCarrier: 'Carrier', qeEvents: 'Timeline', qeAddEvent: '＋ Add event', qeTime: 'Time', qeEvStatus: 'Status',
    qeChat: 'Chat', qeAddMsg: '＋ Add message', qeFrom: 'From', qeType: 'Type', qeText: 'Text', qeSticker: 'Sticker', qeMedia: 'Photo / video', qeKind: 'Kind', qeImage: 'Photo', qeVideo: 'Video', qeDesc: 'What it shows',
    qeStickerOk: 'OK (agree)', qeStickerThanks: 'Thanks',
    qeDrc: 'DRC', qeAddDrc: '＋ Add', qeOffer: 'Offer', qeDrcText: 'Text', qeDrcSync: "The buyer's first DRC entry is always the request offer (System Info); its solution and amount follow the request below. Amounts or reasons mentioned in messages should match the request too.",
    qeRequest: 'Return / refund request', qeSolution: 'Solution', qeReason: 'Reason', qeRemark: 'Remark', qeDeduction: 'Deduction (voucher / coins)', qeReqItems: 'Requested items', qeAmount: 'Amount',
    qeAmountAuto: 'Calculated from the requested items (price × qty) minus the deduction; buyers cannot edit the amount.',
    qeQuestion: 'Question & explanation', qePrompt: 'Prompt', qeQType: 'Type', qeTypeA: 'A: Choice', qeTypeB: 'B: Choice + reason', qeTypeC: 'C: Written', qeOptions: 'Options (click the circle to set the answer)', qeAddOpt: '＋ Add option',
    qePoint: 'Key point', qeModel: 'Model answer', qeRubric: 'Rubric', qeExpl: 'Explanation',
    qeUp: 'Up', qeDown: 'Down', qeDel: 'Delete', qeErrors: 'Please fix the following:', qeOrderHint: 'Requested items must come from the order items, with the same name, variation and unit price.',
    qeSolOnly: 'DMS rule: this reason only allows {s}', ruleErrTitle: 'Does not meet the current rules', ruleErrHint: ' (possibly generated before the rule existed). Fix it with Edit content; it cannot be marked reviewed or added to the bank until fixed.', qeCutoff: 'Information cutoff', qeCutoffHint: 'The case only shows information up to this time; chat, DRC and logistics cannot be later. Leave blank for no cutoff.',
    cutoffBanner: 'Information as of {t} (judge at this point)',
  });

  const getP = (o, path) => path.split('.').reduce((a, k) => (a == null ? a : a[/^\d+$/.test(k) ? +k : k]), o);
  const setP = (o, path, v) => {
    const ks = path.split('.'); let a = o;
    ks.slice(0, -1).forEach((k, i) => { const kk = /^\d+$/.test(k) ? +k : k; if (a[kk] == null) a[kk] = /^\d+$/.test(ks[i + 1]) ? [] : {}; a = a[kk]; });
    const last = ks.at(-1); a[/^\d+$/.test(last) ? +last : last] = v;
  };

  /** 開啟題目內容編輯器；回傳修改後的題目，取消時回傳 null */
  async function questionEditor(question, { rules = null, title = '', group = null } = {}) {
    rules = rules || dmsNow();
    const q = clone(question);
    if (DB() && DB().dms) DB().dms.normalize(q, rules);     // 舊名稱換成規則表的正式名稱
    q.order = q.order || { items: [] }; q.order.items = q.order.items || [];
    q.request = q.request || {}; q.request.items = q.request.items || [];
    q.payment = q.payment || { method: { zh: '', en: '' }, status: { zh: '', en: '' } };
    q.logistics = q.logistics || { carrier: { zh: '', en: '' }, events: [] }; q.logistics.events = q.logistics.events || [];
    q.chat = q.chat || []; q.drc = q.drc || { buyer: [], seller: [] }; q.drc.buyer = q.drc.buyer || []; q.drc.seller = q.drc.seller || [];
    q.buyer = q.buyer || {}; q.seller = q.seller || {};

    const fld = 'border:1px solid var(--line2);border-radius:8px;padding:6px 8px;font-size:14px;background:#fff;min-width:0';
    const inp = (p, ph, w, num) => `<input data-p="${p}" ${num ? 'data-num="1" type="number" step="any" min="0"' : 'type="text"'} value="${esc(getP(q, p) ?? '')}" placeholder="${esc(ph || '')}" style="${fld};${w ? 'width:' + w : 'width:100%'}">`;
    const txt = (p, ph, rows = 2) => `<textarea data-p="${p}" rows="${rows}" placeholder="${esc(ph || '')}" style="${fld};width:100%;resize:vertical">${esc(getP(q, p) ?? '')}</textarea>`;
    const bi = (p, rows) => `<div class="qe-bi">${rows ? txt(p + '.zh', '中文', rows) : inp(p + '.zh', '中文')}${rows ? txt(p + '.en', 'English', rows) : inp(p + '.en', 'English')}</div>`;
    const sel = (p, opts) => `<select data-p="${p}" style="${fld}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(getP(q, p) ?? '') === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    const ctl = (arr, i, n) => `<span class="qe-ctl">${i > 0 ? `<button type="button" class="btn sm ghost" data-act="up" data-arr="${arr}" data-i="${i}" title="${esc(t('qeUp'))}">↑</button>` : ''}${i < n - 1 ? `<button type="button" class="btn sm ghost" data-act="down" data-arr="${arr}" data-i="${i}" title="${esc(t('qeDown'))}">↓</button>` : ''}<button type="button" class="btn sm ghost danger" data-act="del" data-arr="${arr}" data-i="${i}" title="${esc(t('qeDel'))}">✕</button></span>`;
    const lab = (k) => `<div class="qe-lab">${esc(t(k))}</div>`;
    const sec = (k, body, note) => `<section class="qe-sec"><h3>${esc(t(k))}</h3>${note ? `<div class="small muted" style="margin:-4px 0 8px">${esc(note)}</div>` : ''}${body}</section>`;
    const items = (arr) => `${(getP(q, arr) || []).map((_, i, a) => `<div class="qe-card"><div class="qe-row"><div class="qe-grow">${lab('qeName')}${bi(`${arr}.${i}.name`)}</div>${ctl(arr, i, a.length)}</div>
        <div class="qe-row"><div class="qe-grow">${lab('qeVar')}${bi(`${arr}.${i}.variation`)}</div><div>${lab('qeQty')}${inp(`${arr}.${i}.qty`, '', '80px', true)}</div><div>${lab('qePrice')}${inp(`${arr}.${i}.price`, '', '110px', true)}</div></div></div>`).join('')}
        <button type="button" class="btn sm" data-act="add" data-arr="${arr}">${esc(t('qeAddItem'))}</button>`;
    const fromOpts = [['buyer', t('buyer')], ['seller', t('seller')]];
    const solOpts = [['Refund Only', 'Refund Only'], ['Return and Refund', 'Return and Refund']];
    const chatHtml = () => q.chat.map((m, i) => `<div class="qe-card ${m.from === 'seller' ? 'qe-seller' : ''}"><div class="qe-row">
        <div>${lab('qeTime')}${inp(`chat.${i}.t`, 'YYYY-MM-DD HH:mm', '170px')}</div><div>${lab('qeFrom')}${sel(`chat.${i}.from`, fromOpts)}</div>
        <div>${lab('qeType')}<select data-type="chat.${i}" style="${fld}">${[['text', t('qeText')], ['sticker', t('qeSticker')], ['media', t('qeMedia')]].map(([v, l]) => `<option value="${v}" ${m.type === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
        <span class="spacer"></span>${ctl('chat', i, q.chat.length)}</div>
        ${m.type === 'sticker' ? `<div>${lab('qeSticker')}${sel(`chat.${i}.sticker`, [['ok', t('qeStickerOk')], ['thanks', t('qeStickerThanks')]])}</div>`
          : m.type === 'media' ? `<div class="qe-row"><div>${lab('qeKind')}${sel(`chat.${i}.kind`, [['image', t('qeImage')], ['video', t('qeVideo')]])}</div><div class="qe-grow">${lab('qeDesc')}${bi(`chat.${i}.desc`, 2)}</div></div>`
          : `<div>${bi(`chat.${i}.text`, 2)}</div>`}</div>`).join('') + `<button type="button" class="btn sm" data-act="add" data-arr="chat">${esc(t('qeAddMsg'))}</button>`;
    const drcHtml = (side) => q.drc[side].map((d, i) => `<div class="qe-card"><div class="qe-row"><div>${lab('qeTime')}${inp(`drc.${side}.${i}.t`, 'YYYY-MM-DD HH:mm', '170px')}</div>
        <div>${lab('qeType')}<select data-type="drc.${side}.${i}" style="${fld}">${[['offer', t('qeOffer')], ['text', t('qeDrcText')]].map(([v, l]) => `<option value="${v}" ${d.type === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div><span class="spacer"></span>${ctl('drc.' + side, i, q.drc[side].length)}</div>
        ${d.type === 'offer' ? `<div class="qe-row"><div>${lab('qeSolution')}${sel(`drc.${side}.${i}.solution`, solOpts)}</div><div>${lab('qeAmount')}${inp(`drc.${side}.${i}.amount`, '', '120px', true)}</div></div>` : bi(`drc.${side}.${i}.text`, 2)}</div>`).join('') + `<button type="button" class="btn sm" data-act="add" data-arr="drc.${side}">${esc(t('qeAddDrc'))}</button>`;
    const subHtml = () => `<div class="small muted" style="margin-bottom:6px">${esc(t('grpKeyHint'))}</div>${(q.group || []).map((x, i) => `<div class="qe-card"><div><b>${i + 1}. ${esc(L(x.text))}</b></div><div class="qe-row">${x.options.map((o) => `<label class="small" style="display:inline-flex;gap:4px;align-items:center"><input type="radio" name="qe_sub_${esc(x.id)}" data-qsub="${esc(x.id)}" value="${esc(o.id)}" ${(q.subAnswers || {})[x.id] === o.id ? 'checked' : ''}> ${esc(L(o.text))}</label>`).join('')}</div></div>`).join('')}`;
    const optHtml = () => (q.type === 'G' ? subHtml() : q.type === 'C' ? '' : `${lab('qeOptions')}${(q.options || []).map((o, i) => `<div class="qe-row"><input type="radio" name="qe_ans" value="${esc(o.id)}" ${o.id === q.answer ? 'checked' : ''} title="${esc(t('correct'))}"><b class="mono">${esc(o.id)}.</b><div class="qe-grow">${bi(`options.${i}.text`)}</div>${(q.options || []).length > 2 ? ctl('options', i, q.options.length) : ''}</div>`).join('')}
        ${(q.options || []).length < 8 ? `<button type="button" class="btn sm" data-act="add" data-arr="options">${esc(t('qeAddOpt'))}</button>` : ''}`);

    const rlist = (rules.reasons || []).map((x) => x.en);
    const reasonOpts = (rlist.includes(q.request.reason) ? [] : [[q.request.reason || '', (q.request.reason || '—') + ' ⚠']]).concat(rlist.map((r) => [r, reasonLabel(r)]));
    const allowed = () => { const e = (rules.reasons || []).find((x) => x.en === q.request.reason); return e ? e.solutions : ['Return and Refund', 'Refund Only']; };
    /** 申退原因只允許一種方案時，自動帶入 */
    const fitSolution = () => { const a = allowed(); if (a.length === 1 && q.request.solution !== a[0]) q.request.solution = a[0]; };
    const solHint = () => { const a = allowed(); return a.length < 2 ? t('qeSolOnly', { s: a.join(' / ') }) : ''; };
    const recalc = () => {
      const sum = q.request.items.reduce((a, it) => a + (Number(it.qty) || 0) * (Number(it.price) || 0), 0);
      const ded = Number(q.request.deduction) || 0;
      q.request.amount = Math.round((sum - ded) * 100) / 100;
      if (!q.request.deduction) delete q.request.deduction;
      // 買家 DRC 第一筆固定是申請的 System Info：沒有就補上，方案與金額跟著申請
      if (!q.drc.buyer.length || q.drc.buyer[0].type !== 'offer') q.drc.buyer.unshift({ t: (q.drc.buyer[0] && q.drc.buyer[0].t) || '', type: 'offer', solution: q.request.solution, amount: q.request.amount });
      const first = q.drc.buyer[0];
      first.solution = q.request.solution; first.amount = q.request.amount;
    };
    recalc();

    const body = () => `
      ${sec('qeCutoff', `<div class="qe-row"><div>${inp('cutoff', 'YYYY-MM-DD HH:mm', '170px')}</div><div class="small muted qe-grow">${esc(t('qeCutoffHint'))}</div></div>`)}
      ${sec('qeParties', `<div class="qe-row"><div class="qe-grow">${lab('qeBuyer')}${inp('buyer.username')}</div><div>${lab('qeId')}${inp('buyer.id', '', '130px', true)}</div><div class="qe-grow">${lab('qeSeller')}${inp('seller.username')}</div><div>${lab('qeId')}${inp('seller.id', '', '130px', true)}</div></div>`)}
      ${sec('qeOrder', items('order.items'))}
      ${sec('qePayment', `<div class="qe-row"><div class="qe-grow">${lab('qeMethod')}${bi('payment.method')}</div><div class="qe-grow">${lab('qePayStatus')}${bi('payment.status')}</div></div>`)}
      ${sec('qeLogistics', `${lab('qeCarrier')}${bi('logistics.carrier')}<div style="margin-top:8px">${lab('qeEvents')}</div>${q.logistics.events.map((e, i) => `<div class="qe-row"><div>${inp(`logistics.events.${i}.t`, 'YYYY-MM-DD HH:mm', '170px')}</div><div class="qe-grow">${bi(`logistics.events.${i}.status`)}</div>${ctl('logistics.events', i, q.logistics.events.length)}</div>`).join('')}<button type="button" class="btn sm" data-act="add" data-arr="logistics.events">${esc(t('qeAddEvent'))}</button>`)}
      ${sec('qeChat', chatHtml())}
      ${sec('qeDrc', `<div class="qe-two"><div><b class="small">${esc(t('drcBuyer'))}</b>${drcHtml('buyer')}</div><div><b class="small">${esc(t('drcSeller'))}</b>${drcHtml('seller')}</div></div>`, t('qeDrcSync'))}
      ${sec('qeRequest', `<div class="qe-row"><div>${lab('qeSolution')}${sel('request.solution', solOpts.map(([v, l]) => [v, allowed().includes(v) ? l : l + ' ✕']))}<div class="small" style="color:var(--warn);margin-top:2px">${esc(solHint())}</div></div><div class="qe-grow">${lab('qeReason')}${sel('request.reason', reasonOpts)}</div><div>${lab('qeDeduction')}${inp('request.deduction', '0', '120px', true)}</div><div>${lab('qeAmount')}<div class="qe-amount" id="qe_amt">$${esc(q.request.amount)}</div></div></div>
        <div class="small muted" style="margin:4px 0 10px">${esc(t('qeAmountAuto'))}</div>${lab('qeRemark')}${bi('request.remark', 2)}
        <div style="margin-top:10px">${lab('qeReqItems')}<div class="small muted" style="margin-bottom:6px">${esc(t('qeOrderHint'))}</div>${items('request.items')}</div>`)}
      ${sec('qeQuestion', `${lab('qePrompt')}${bi('prompt')}<div class="qe-row" style="margin-top:8px"><div>${lab('qeQType')}${sel('type', [['A', t('qeTypeA')], ['B', t('qeTypeB')], ['C', t('qeTypeC')]].concat(group || q.type === 'G' ? [['G', t('qeTypeG')]] : []))}</div></div>
        <div style="margin-top:8px">${optHtml()}</div>
        <div style="margin-top:8px">${lab('qePoint')}${bi('point')}</div>
        ${q.type === 'B' || q.type === 'C' ? `<div style="margin-top:8px">${lab('qeModel')}${bi('modelAnswer', 3)}</div><div style="margin-top:8px">${lab('qeRubric')}${bi('rubric', 3)}</div>` : ''}
        <div style="margin-top:8px">${lab('qeExpl')}${bi('explanation', 4)}</div>`)}`;

    return modal(`<div class="qe"><div class="row qe-head"><h2>${esc(t('qeTitle'))}${title ? ' · ' + esc(title) : ''}</h2></div>
        <div class="qe-body" id="qe_body"></div>
        <div class="qe-foot"><div id="qe_err" class="banner err" hidden></div><div class="row"><span class="spacer"></span><button class="btn" data-close="">${esc(t('qeCancel'))}</button><button class="btn brand" id="qe_ok" type="button">${esc(t('qeApply'))}</button></div></div></div>`,
    { wide: true, onMount: (el, close) => {
      el.classList.add('qe-modal');
      const box = $('#qe_body', el);
      const render = () => { const y = box.scrollTop; box.innerHTML = body(); box.scrollTop = y; };
      render();
      box.addEventListener('input', (e) => {
        const p = e.target.dataset.p; if (!p) return;
        setP(q, p, e.target.dataset.num ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value);
        if (/^request\.(items|deduction)/.test(p)) { recalc(); $('#qe_amt', el).textContent = '$' + q.request.amount; }
      });
      box.addEventListener('change', (e) => {
        const tgt = e.target;
        if (tgt.name === 'qe_ans') { q.answer = tgt.value; return; }
        if (tgt.dataset.qsub) { q.subAnswers = Object.assign({}, q.subAnswers, { [tgt.dataset.qsub]: tgt.value }); return; }
        if (tgt.dataset.type) {   // 換類型：只保留共用欄位
          const cur = getP(q, tgt.dataset.type), v = tgt.value, base = { t: cur.t };
          if (tgt.dataset.type.startsWith('chat')) Object.assign(base, { from: cur.from, type: v }, v === 'text' ? { text: { zh: '', en: '' } } : v === 'sticker' ? { sticker: 'ok' } : { kind: 'image', desc: { zh: '', en: '' } });
          else Object.assign(base, { type: v }, v === 'offer' ? { solution: q.request.solution || 'Refund Only', amount: q.request.amount || 0 } : { text: { zh: '', en: '' } });
          setP(q, tgt.dataset.type, base); recalc(); render(); return;
        }
        const p = tgt.dataset.p; if (!p) return;
        if (p === 'type') {
          if (q.type === 'G') {   // 改成題組：小題從主題範本帶入，原本的選項與文字作答欄位移除
            if (!group && !q.group) { toast(t('grpNone')); q.type = 'B'; render(); return; }
            if (!q.group) q.group = clone(group);
            q.subAnswers = {}; ['options', 'answer', 'modelAnswer', 'rubric'].forEach((k) => delete q[k]); toast(t('grpToG'), 5000); render(); return;
          }
          delete q.group; delete q.subAnswers;
          if (q.type === 'C') { delete q.options; delete q.answer; } else if (!q.options) { q.options = [{ id: 'a', text: { zh: '', en: '' } }, { id: 'b', text: { zh: '', en: '' } }]; } if (q.type === 'A') { delete q.modelAnswer; delete q.rubric; } else { q.modelAnswer = q.modelAnswer || { zh: '', en: '' }; q.rubric = q.rubric || { zh: '', en: '' }; } render();
        }
        if (p === 'request.solution') { recalc(); render(); }
        if (p === 'request.reason') { fitSolution(); recalc(); render(); }
      });
      box.addEventListener('click', (e) => {
        const b = e.target.closest('[data-act]'); if (!b) return;
        const arrP = b.dataset.arr, arr = getP(q, arrP) || [], i = +b.dataset.i;
        if (b.dataset.act === 'del') arr.splice(i, 1);
        else if (b.dataset.act === 'up') [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
        else if (b.dataset.act === 'down') [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]];
        else if (b.dataset.act === 'add') {
          const last = arr.at(-1);
          if (/items$/.test(arrP)) arr.push(arrP.startsWith('request') && q.order.items[0] ? clone(Object.assign({}, q.order.items[0], { qty: 1 })) : { name: { zh: '', en: '' }, variation: { zh: '', en: '' }, qty: 1, price: 0 });
          else if (arrP === 'chat') arr.push({ t: (last && last.t) || '', from: last && last.from === 'buyer' ? 'seller' : 'buyer', type: 'text', text: { zh: '', en: '' } });
          else if (arrP.startsWith('drc')) arr.push({ t: (last && last.t) || '', type: 'text', text: { zh: '', en: '' } });
          else if (arrP === 'logistics.events') arr.push({ t: (last && last.t) || '', status: { zh: '', en: '' } });
          else if (arrP === 'options') arr.push({ id: '', text: { zh: '', en: '' } });
          setP(q, arrP, arr);
        }
        if (arrP === 'options') { const old = (q.options || []).findIndex((o) => o.id === q.answer); q.options.forEach((o, k) => { o.id = String.fromCharCode(97 + k); }); if (old < 0 || old >= q.options.length) q.answer = q.answer && q.options.some((o) => o.id === q.answer) ? q.answer : undefined; }
        recalc(); render();
      });
      $('#qe_ok', el).onclick = () => {
        const out = clone(q);
        (out.order.items || []).concat(out.request.items || []).forEach((it) => { if (it.variation && !String(it.variation.zh || '').trim() && !String(it.variation.en || '').trim()) delete it.variation; });
        if (!String(out.cutoff || '').trim()) delete out.cutoff; else out.cutoff = String(out.cutoff).trim();
        const chk = DB() && DB().check ? DB().check(out, rules, { allowEmptyEn: true }) : { errors: [] };   // 英文可留白，存檔後標成待翻譯
        if (chk.errors.length) { const er = $('#qe_err', el); er.innerHTML = `<b>${esc(t('qeErrors'))}</b><br>${chk.errors.slice(0, 8).map(esc).join('<br>')}`; er.hidden = false; return; }
        close(out);
      };
    } });
  }

  // ───────── 處理狀態：英文待翻譯、AI 檢查、判斷標準缺口（草稿題目與範例共用） ─────────
  Object.assign(I18N.zh, {
    wkCmdTitle: '有修改需要處理', wkCmdHint: '複製指令，在 SeaTalk 傳給 @RR AI Quiz Assistant；完成後這裡會自動更新。',
    wkEnQ: '英文待翻譯 {n} 題', wkRvQ: '待 AI 檢查 {n} 題', wkEnF: '英文待翻譯 {n} 個欄位', wkRv1: '待 AI 檢查', wkGap1: '待分析判斷標準',
    enPendingTitle: '英文待翻譯', enPendingHint: '這些欄位的中文已更新，英文還沒跟上。傳上方的「處理」指令會自動翻譯；也可以直接自己改英文，改過就不會再自動翻譯。',
    enPendingBlock: '英文翻譯完成前不能加入題庫', rvTitle: 'AI 檢查（前後矛盾＋盲答）', rvOk: '沒有發現問題', rvIssues: '發現 {n} 個問題', rvStale: '檢查之後又修改過，下次處理時會重新檢查',
    rvAsk: '要求 AI 檢查', rvAsked: '已排入 AI 檢查，請傳「{cmd}」', rvWanted: '已排入 AI 檢查',
    lv_must: '必改', lv_suggest: '建議', lv_note: '提醒', blindOk: '盲答與正解一致', blindDiff: '盲答與正解不同', blindPicked: 'AI 沒看答案時選了 {a}：', blindHint: '請確認正解，或題目內容是否足以支持正解。', mkEn: '譯', mkRv: 'AI',
    gk_missing: '判斷標準缺少條文', gk_ambiguous: '判斷標準條文模糊', gk_ai_misread: 'AI 讀錯（標準已足夠）', gapFromTrainer: '依你修改的判斷分析',
    pl_chat: '聊聊第 {n} 則', pl_chatDesc: '聊聊第 {n} 則（照片 / 影片描述）', pl_drcB: '買家 DRC 第 {n} 則', pl_drcS: '賣家 DRC 第 {n} 則', pl_remark: '申請備註',
    pl_oName: '訂單商品 {n} 名稱', pl_oVar: '訂單商品 {n} 規格', pl_rName: '申退商品 {n} 名稱', pl_rVar: '申退商品 {n} 規格', pl_payM: '付款方式', pl_payS: '付款狀態',
    pl_carrier: '物流商', pl_ev: '物流第 {n} 筆', pl_prompt: '題目問句', pl_point: '判斷重點', pl_expl: '解析', pl_model: '參考答案', pl_rubric: '評分標準', pl_opt: '選項 {n}',
  });
  Object.assign(I18N.en, {
    wkCmdTitle: 'Changes to process', wkCmdHint: 'Copy the command and send it to @RR AI Quiz Assistant on SeaTalk; this page updates automatically when done.',
    wkEnQ: 'English pending: {n} question(s)', wkRvQ: 'AI check pending: {n} question(s)', wkEnF: '{n} English field(s) pending', wkRv1: 'AI check pending', wkGap1: 'Criteria analysis pending',
    enPendingTitle: 'English pending', enPendingHint: 'The Chinese of these fields was updated but the English has not caught up. Send the Process command above to translate them automatically, or edit the English yourself — fields you edit are not translated again.',
    enPendingBlock: 'Cannot add to the bank until the English is translated', rvTitle: 'AI check (consistency + blind answer)', rvOk: 'No problems found', rvIssues: '{n} issue(s) found', rvStale: 'Edited after the check; it will be checked again next time',
    rvAsk: 'Request AI check', rvAsked: 'AI check requested. Send "{cmd}"', rvWanted: 'AI check requested',
    lv_must: 'Must fix', lv_suggest: 'Suggestion', lv_note: 'Note', blindOk: 'Blind answer matches the key', blindDiff: 'Blind answer differs from the key', blindPicked: 'Without seeing the key, the AI chose {a}: ', blindHint: 'Check the key, or whether the case supports it.', mkEn: 'EN', mkRv: 'AI',
    gk_missing: 'Missing rule in the criteria', gk_ambiguous: 'Ambiguous rule in the criteria', gk_ai_misread: 'AI misread (criteria are sufficient)', gapFromTrainer: 'Based on your corrected judgement',
    pl_chat: 'Chat #{n}', pl_chatDesc: 'Chat #{n} (photo / video)', pl_drcB: 'Buyer DRC #{n}', pl_drcS: 'Seller DRC #{n}', pl_remark: 'Request remark',
    pl_oName: 'Order item {n} name', pl_oVar: 'Order item {n} variation', pl_rName: 'Requested item {n} name', pl_rVar: 'Requested item {n} variation', pl_payM: 'Payment method', pl_payS: 'Payment status',
    pl_carrier: 'Carrier', pl_ev: 'Logistics #{n}', pl_prompt: 'Prompt', pl_point: 'Key point', pl_expl: 'Explanation', pl_model: 'Model answer', pl_rubric: 'Rubric', pl_opt: 'Option {n}',
  });
  /** 欄位路徑 → 講師看得懂的位置 */
  function pathLabel(p) {
    const m = (re) => re.exec(p), n = (x) => Number(x) + 1; let r;
    if ((r = m(/^chat\.(\d+)\.text$/))) return t('pl_chat', { n: n(r[1]) });
    if ((r = m(/^chat\.(\d+)\.desc$/))) return t('pl_chatDesc', { n: n(r[1]) });
    if ((r = m(/^drc\.buyer\.(\d+)\.text$/))) return t('pl_drcB', { n: n(r[1]) });
    if ((r = m(/^drc\.seller\.(\d+)\.text$/))) return t('pl_drcS', { n: n(r[1]) });
    if ((r = m(/^(order|request)\.items\.(\d+)\.(name|variation)$/))) return t('pl_' + (r[1] === 'order' ? 'o' : 'r') + (r[3] === 'name' ? 'Name' : 'Var'), { n: n(r[2]) });
    if ((r = m(/^logistics\.events\.(\d+)\.status$/))) return t('pl_ev', { n: n(r[1]) });
    if ((r = m(/^options\.(\d+)\.text$/))) return t('pl_opt', { n: String.fromCharCode(97 + Number(r[1])) });
    return t({ 'request.remark': 'pl_remark', 'payment.method': 'pl_payM', 'payment.status': 'pl_payS', 'logistics.carrier': 'pl_carrier', prompt: 'pl_prompt', point: 'pl_point',
      explanation: 'pl_expl', modelAnswer: 'pl_model', rubric: 'pl_rubric' }[p] || p);
  }
  const metaOf = (x) => (x && x._m) || { enPending: [], rev: 0, review: null, reviewWanted: false };
  /** 下次「處理」會做什麼 */
  const needsReview = (m) => m.reviewWanted || (m.rev > 0 && m.rev > ((m.review && m.review.rev) || 0));
  const sampleNeedsGap = (smp) => {
    const sg = smp.suggest; if (!smp.judgedBy || !sg) return false;
    const cur = { answer: smp.answer || '', pointZh: smp.pointZh || '' };
    if (cur.answer === (sg.answer || '') && cur.pointZh === (sg.pointZh || '')) return false;
    const b = smp.criteriaGap && smp.criteriaGap.basis; return !b || b.answer !== cur.answer || b.pointZh !== cur.pointZh;
  };
  function cmdBox(cmd, counts) {
    return `<div class="banner info wkbox"><div><b>${esc(t('wkCmdTitle'))}</b> <span class="small">${esc(counts)}</span><div class="small" style="margin-top:2px">${esc(t('wkCmdHint'))}</div></div>
      <span class="cmd" style="padding:6px 12px"><code style="font-size:15px">${esc(cmd)}</code><button class="btn sm" type="button" data-copycmd="${esc(cmd)}">${esc(t('copy'))}</button></span></div>`;
  }
  function enPendingHtml(m) {
    if (!m.enPending.length) return '';
    return `<div class="banner warn" style="border-radius:0;border-width:0 0 1px"><b>${esc(t('enPendingTitle'))}</b>：${m.enPending.map((p) => esc(pathLabel(p))).join('、')}<div class="small" style="margin-top:2px">${esc(t('enPendingHint'))}</div></div>`;
  }
  /** 盲答：AI 沒看答案自己作答的結果（只顯示目前版本的） */
  function blindHtml(m, q) {
    const b = m.blind; if (!b || b.rev !== m.rev) return '';
    if (q && q.type === 'G') {   // 題組：列出和正解不同的小題
      const diff = (q.group || []).filter((x) => (b.subAnswers || {})[x.id] !== (q.subAnswers || {})[x.id]);
      return !diff.length ? `<div class="rvitem"><span class="chip ok">${esc(t('blindOk'))}</span><div class="small muted">${esc(b.reason || '')}</div></div>`
        : `<div class="rvitem"><span class="chip lv-must">${esc(t('blindDiff'))}</span><div class="small"><b>${esc(t('blindSubs'))}</b>${diff.map((x) => { const o = grpOpt(x, (b.subAnswers || {})[x.id]); return `<div>・${esc(L(x.text))} → ${esc(o ? L(o.text) : '—')}</div>`; }).join('')}<div>${esc(b.reason || '')}</div><div class="muted">${esc(t('blindHint'))}</div></div></div>`;
    }
    const opt = ((q && q.options) || []).find((o) => o.id === b.answer);
    return b.match ? `<div class="rvitem"><span class="chip ok">${esc(t('blindOk'))}</span><div class="small muted">${esc(b.reason || '')}</div></div>`
      : `<div class="rvitem"><span class="chip lv-must">${esc(t('blindDiff'))}</span><div class="small"><b>${esc(t('blindPicked', { a: b.answer + (opt ? '. ' + L(opt.text) : '') }))}</b> ${esc(b.reason || '')}<div class="muted">${esc(t('blindHint'))}</div></div></div>`;
  }
  function reviewHtml(m, canAsk, q) {
    const r = m.review, stale = r && m.rev > (r.rev || 0);
    const ask = canAsk ? (m.reviewWanted ? `<span class="chip info">${esc(t('rvWanted'))}</span>` : `<button class="btn sm ghost" type="button" id="rvAsk">${esc(t('rvAsk'))}</button>`) : '';
    if (!r) return ask ? `<div class="rvbox"><div class="row"><b>🤖 ${esc(t('rvTitle'))}</b><span class="spacer"></span>${ask}</div></div>` : '';
    const bad = !stale && (r.verdict === 'issues' || (m.blind && m.blind.rev === m.rev && m.blind.match === false));
    return `<div class="rvbox ${bad ? 'bad' : ''}"><div class="row"><b>🤖 ${esc(t('rvTitle'))}</b>
        <span class="chip ${r.verdict === 'ok' ? 'ok' : 'warn'}">${esc(r.verdict === 'ok' ? t('rvOk') : t('rvIssues', { n: (r.items || []).length }))}</span>
        <span class="small soft">${esc(fmtDT(r.at))}</span>${stale ? `<span class="chip">${esc(t('rvStale'))}</span>` : ''}<span class="spacer"></span>${ask}</div>
      ${r.summary ? `<div class="small" style="margin-top:4px">${esc(r.summary)}</div>` : ''}
      ${blindHtml(m, q)}
      ${(r.items || []).map((x) => `<div class="rvitem"><span class="chip lv-${esc(x.level)}">${esc(t('lv_' + x.level))}</span><div><b class="small">${esc(x.where || '')}</b> <span class="small">${esc(x.issue)}</span>${x.fix ? `<div class="small muted">→ ${esc(x.fix)}</div>` : ''}</div></div>`).join('')}</div>`;
  }

  // ───────── 草稿校對 ─────────
  async function viewDraft(draftId) {
    const main = shell('drafts', `<div class="empty-state"><span class="spin"></span> ${esc(t('loading'))}</div>`);
    let data;
    try { [data] = await Promise.all([api('t_getDraft', { draftId }), getTopics().catch(() => null)]); } catch (e) { showError(e); return; }
    /** 依目前的 DMS 規則重新檢查（規則加入前生成的題目也會標出來） */
    const ruleErrs = (q) => { if (!DB() || !DB().check) return []; const x = clone(q); ['id', 'reviewed', 'criteriaVersion', 'warnings', 'bankedAs', '_m'].forEach((k) => delete x[k]); return DB().check(x, dmsNow(), { allowEmptyEn: true }).errors; };
    let { draft, questions } = data;
    const params = new URLSearchParams((location.hash.split('?')[1]) || '');
    let idx = Math.max(0, questions.findIndex((q) => q.id === params.get('q')));
    let work = null, dirty = false, saving = false;
    const cmd = '生成考題 ' + draft.draftId;
    leaveGuard = () => !dirty || window.confirm(t('unsaved'));

    function header() {
      const all = questions.length, rev = questions.filter((q) => q.reviewed).length;
      const toBank = questions.filter((q) => q.reviewed && !q.bankedAs).length;
      return `<div class="row"><a href="#/drafts">${esc(t('back'))}</a>
        <h1>${esc(draft.draftId)} ${esc(draft.name)}</h1>${statusChip(draft.status)}
        <span class="chip">${esc(t('reviewedN', { a: rev, b: all }))}</span>
        <span class="spacer"></span>
        <button class="btn" id="reload">${esc(t('refresh'))}</button>
        ${draft.status !== 'deleted' && me.can.draft ? `<button class="btn danger" id="delDraft">${esc(t('delDraft'))}</button>` : ''}
        ${draft.status === 'banked' ? `<a class="btn" style="display:inline-grid;place-items:center;text-decoration:none" href="#/bank">${esc(t('goBank'))} →</a>` : ''}
        ${draft.status !== 'generating' && draft.status !== 'banked' ? `<button class="btn ok" id="bankAdd" ${toBank ? '' : 'disabled'} title="${toBank ? '' : esc(t('readyNeed', { n: all - rev }))}">${esc(t('addToBank', { n: toBank }))}</button>` : ''}
      </div>
      ${draft.status === 'deleted' ? `<div class="banner warn">${esc(t('deletedNote'))}</div>` : ''}
      ${(() => {
        if (draft.status === 'generating' || draft.status === 'deleted') return '';
        const live = questions.filter((q) => !q.bankedAs), a = live.filter((q) => metaOf(q).enPending.length).length, b = live.filter((q) => needsReview(metaOf(q))).length;
        return a || b ? cmdBox('處理 ' + draft.draftId, [a && t('wkEnQ', { n: a }), b && t('wkRvQ', { n: b })].filter(Boolean).join(' · ')) : '';
      })()}
      ${draft.status === 'generating' ? `<div class="banner info row"><span>${esc(t('genBanner', { a: draft.imported, b: draft.target }))}</span>
        <span class="cmd" style="padding:6px 12px"><code style="font-size:15px">${esc(cmd)}</code><button class="btn sm" id="cpy2">${esc(t('copy'))}</button></span><span class="small">${esc(t('genAuto'))}</span></div>` : ''}`;
    }
    function listHtml() {
      return questions.map((q, i) => {
        const opt = (q.options || []).find((o) => o.id === q.answer);
        return `<div class="qitem ${i === idx ? 'on' : ''}" data-i="${i}" role="button" tabindex="0">
          <span class="dot ${q.reviewed ? 'on' : ''}" title="${esc(q.reviewed ? t('reviewedTag') : t('notReviewed'))}">${q.reviewed ? '✓' : ''}</span>
          <span class="id">${esc(q.id.split('-').pop())}</span><span class="chip" style="padding:0 7px">${esc(q.type)}</span>
          <span class="ans">${esc(q.type === 'G' ? grpSummary(q) : opt ? L(opt.text) : L(q.point))}</span>${metaOf(q).enPending.length ? `<span class="chip warn mk" title="${esc(t('enPendingTitle'))}">${esc(t('mkEn'))}</span>` : ''}${(() => { const m = metaOf(q), r = m.review; if (!r || r.rev !== m.rev) return ''; const ok = r.verdict === 'ok' && !(m.blind && m.blind.rev === m.rev && m.blind.match === false); return `<span class="chip ${ok ? 'ok' : 'warn'} mk" title="${esc(t('rvTitle'))}">${esc(t('mkRv'))}${ok ? '✓' : '!'}</span>`; })()}${q.bankedAs ? `<span class="chip ok" style="padding:0 6px" title="${esc(t('bankedAs', { id: q.bankedAs }))}">${esc(q.bankedAs)}</span>` : ''}${ruleErrs(q).length ? `<span class="wmark" style="color:var(--err)" title="${esc(t('ruleErrTitle'))}">⛔</span>` : q.warnings && q.warnings.length ? '<span class="wmark" title="warnings">⚠</span>' : ''}</div>`;
      }).join('');
    }
    function biField(key, label, short) {
      const v = work[key] || {};
      return `<h4>${esc(label)}</h4><div class="bi">
        <div><div class="lab">中文</div><textarea class="${short ? 'short' : ''}" data-f="${key}" data-l="zh">${esc(v.zh || '')}</textarea></div>
        <div><div class="lab">English</div><textarea class="${short ? 'short' : ''}" data-f="${key}" data-l="en">${esc(v.en || '')}</textarea></div></div>`;
    }
    function detailHtml() {
      if (!questions.length) return `<div class="card empty-state">${draft.status === 'generating' ? '<span class="spin"></span> ' : ''}${esc(t('generated', { a: draft.imported, b: draft.target }))}</div>`;
      const q = work, src = questions[idx];
      const { left, req } = caseHtml(q);
      const editable = draft.status !== 'generating' && draft.status !== 'deleted' && !src.bankedAs;
      const opts = (q.options || []).map((o) => `<button type="button" class="opt ${o.id === q.answer ? 'correct' : ''}" data-ans="${esc(o.id)}" ${editable ? '' : 'disabled'}>
          <b>${esc(o.id)}.</b> ${esc(L(o.text))}<span class="hint">${o.id === q.answer ? '✓ ' + esc(t('correct')) : esc(t('setAnswer'))}</span></button>`).join('');
      return `<div class="card detail">
        <div class="dhead"><span class="id">${esc(src.id)}</span><span class="chip">Type ${esc(q.type)}</span>
          ${(q.tags || []).map((x) => `<span class="chip">${esc(x)}</span>`).join('')}
          ${src.criteriaVersion ? `<span class="chip">${esc(t('criteria'))} ${esc(src.criteriaVersion)}</span>` : ''}
          ${src.reviewed ? `<span class="chip ok">✓ ${esc(t('reviewedTag'))}</span>` : `<span class="chip warn">${esc(t('notReviewed'))}</span>`}
          <span class="spacer"></span>
          <button class="btn sm" id="prev" ${idx === 0 ? 'disabled' : ''}>${esc(t('prev'))}</button>
          <button class="btn sm" id="next" ${idx === questions.length - 1 ? 'disabled' : ''}>${esc(t('next'))}</button></div>
        ${src.bankedAs ? `<div class="banner info" style="border-radius:0;border-width:0 0 1px">${esc(t('bankedNote', { id: src.bankedAs }))} <a href="#/bank/${esc(src.bankedAs)}">${esc(t('goBank'))} →</a></div>` : ''}
        ${(() => { const er = ruleErrs(q); return er.length ? `<div class="banner err" style="border-radius:0;border-width:0 0 1px"><b>${esc(t('ruleErrTitle'))}</b>${esc(t('ruleErrHint'))}<br>${er.slice(0, 6).map(esc).join('<br>')}</div>` : ''; })()}
        ${src.warnings && src.warnings.length ? `<div class="banner warn" style="border-radius:0;border-width:0 0 1px"><b>${esc(t('warnings'))}</b><br>${src.warnings.map(esc).join('<br>')}</div>` : ''}
        ${enPendingHtml(metaOf(src))}
        ${(() => { const h = reviewHtml(metaOf(src), editable, src); return h ? `<div style="padding:10px 16px;border-bottom:1px solid var(--line)">${h}</div>` : ''; })()}
        <div class="qbody"><div>${left}</div><div>${req}
          ${opts ? `<h4>${esc(t('options'))} <span class="soft">· ${esc(t('answerHint'))}</span></h4>${opts}` : ''}
          ${q.type === 'G' ? `<h4>${esc(t('grpTitle', { n: (q.group || []).length }))} <span class="soft">· ${esc(t('grpKeyHint'))}</span></h4>${groupHtml(q, 'key', {}, !editable)}` : ''}
          ${biField('point', t('point'), true)}
          ${q.type === 'B' || q.type === 'C' ? biField('modelAnswer', t('modelAnswer')) + biField('rubric', t('rubric')) : ''}
          ${biField('explanation', t('explanation'))}
        </div></div>
        <div id="saveErr" class="banner err" style="border-radius:0" hidden></div>
        <div class="dfoot">
          ${me.can.draftQ ? `<button class="btn sm danger" id="del" ${editable ? '' : 'disabled'}>${esc(t('del'))}</button>` : ''}
          <button class="btn sm primary" id="qedit" ${editable ? '' : 'disabled'}>✎ ${esc(t('qeOpen'))}</button>
          <button class="btn sm ghost" id="json" ${editable ? '' : 'disabled'}>${esc(t('qeJsonAdv'))}</button>
          <span class="spacer"></span><span class="small soft" id="dirtyMark"></span>
          <button class="btn" id="save" ${editable && dirty ? '' : 'disabled'}>${esc(t('save'))}</button>
          ${src.reviewed && !dirty
            ? `<button class="btn" id="unrev" ${editable ? '' : 'disabled'}>${esc(t('unmarkReviewed'))}</button>`
            : `<button class="btn ok" id="rev" ${editable ? '' : 'disabled'}>✓ ${esc(t('markReviewed'))}</button>`}
        </div></div>`;
    }
    function draw() {
      main.innerHTML = `${header()}<div class="review"><div class="card qlist" id="qlist">${listHtml()}</div><div id="detail">${detailHtml()}</div></div>`;
      bind();
    }
    function setDirty(v) { dirty = v; const s = $('#save'); if (s) s.disabled = !v || saving; const m = $('#dirtyMark'); if (m) m.textContent = v ? '●' : ''; }
    function select(i) {
      if (i === idx) return;
      const go = () => { idx = i; work = clone(questions[idx]); dirty = false; history.replaceState(null, '', '#/draft/' + draft.draftId + '?q=' + questions[idx].id); draw(); window.scrollTo({ top: 0 }); };
      if (dirty) confirmBox(t('unsaved'), t('discard'), t('keep'), true).then((ok) => ok && go()); else go();
    }
    async function save(reviewed) {
      if (saving) return;
      saving = true; const err = $('#saveErr'); err.hidden = true;
      ['#save', '#rev', '#unrev'].forEach((s) => { const b = $(s); if (b) b.disabled = true; });
      try {
        let r;
        if (dirty) r = await api('t_updateQuestion', { draftId: draft.draftId, qid: questions[idx].id, question: work, reviewed });
        else r = await api('t_setReviewed', { draftId: draft.draftId, qid: questions[idx].id, reviewed: !!reviewed });
        if (r.question) questions[idx] = r.question; else questions[idx].reviewed = r.reviewed;
        draft = r.draft || draft;
        work = clone(questions[idx]); dirty = false; saving = false;
        toast(t('saved'));
        if (reviewed) { const nxt = questions.findIndex((q, i) => i > idx && !q.reviewed); if (nxt >= 0) { idx = nxt; work = clone(questions[idx]); } }
        history.replaceState(null, '', '#/draft/' + draft.draftId + '?q=' + questions[idx].id);
        draw(); if (pending) refetch();
      } catch (e) {
        saving = false;
        err.innerHTML = esc(e.message); err.hidden = false;
        ['#save', '#rev', '#unrev'].forEach((s) => { const b = $(s); if (b) b.disabled = false; }); setDirty(dirty);
      }
    }
    function bind() {
      $('#reload').onclick = async () => {
        if (dirty && !(await confirmBox(t('unsaved'), t('discard'), t('keep'), true))) return;
        dirty = false; clearInterval(pollTimer); viewDraft(draft.draftId);
      };
      const cp = $('#cpy2'); if (cp) cp.onclick = () => copyText(cmd);
      $$('[data-copycmd]').forEach((b) => { b.onclick = () => copyText(b.dataset.copycmd); });
      const ra = $('#rvAsk'); if (ra) ra.onclick = async () => {
        ra.disabled = true;
        try { await api('t_requestReview', { draftId: draft.draftId, qid: questions[idx].id }); questions[idx]._m = Object.assign({}, metaOf(questions[idx]), { reviewWanted: true }); if (!dirty) work = clone(questions[idx]); else work._m = questions[idx]._m; toast(t('rvAsked', { cmd: '處理 ' + draft.draftId }), 4000); draw(); }
        catch (e) { toast(e.message, 4000); ra.disabled = false; }
      };
      const dd = $('#delDraft'); if (dd) dd.onclick = () => deleteDraft(draft.draftId, questions.filter((q) => !q.bankedAs).length, () => { dirty = false; location.hash = '#/drafts'; });
      const ba = $('#bankAdd'); if (ba) ba.onclick = async () => {
        if (dirty && !(await confirmBox(t('unsaved'), t('discard'), t('keep'), true))) return;
        ba.disabled = true;
        try {
          const r = await api('t_bankAdd', { draftId: draft.draftId });
          draft = r.draft; r.added.forEach((a) => { const q = questions.find((x) => x.id === a.sourceQid); if (q) q.bankedAs = a.qid; });
          dirty = false; work = clone(questions[idx]);
          toast(t('bankAdded', { ids: r.added.map((a) => a.qid).join('、') }), 4000); draw();
        } catch (e) { toast(e.message, 4000); ba.disabled = false; }
      };
      $$('#qlist [data-i]').forEach((el) => {
        el.addEventListener('click', () => select(+el.dataset.i));
        el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(+el.dataset.i); } });
      });
      if (!questions.length) return;
      $('#prev').onclick = () => select(idx - 1);
      $('#next').onclick = () => select(idx + 1);
      bindGroupKey($('#detail'), work, () => { draw(); setDirty(true); });
      $$('[data-ans]').forEach((b) => b.addEventListener('click', () => {
        if (work.answer === b.dataset.ans) return;
        work.answer = b.dataset.ans; setDirty(true);
        $$('[data-ans]').forEach((x) => {
          const on = x.dataset.ans === work.answer; x.classList.toggle('correct', on);
          $('.hint', x).textContent = on ? '✓ ' + t('correct') : t('setAnswer');
        });
      }));
      $$('textarea[data-f]').forEach((ta) => ta.addEventListener('input', () => {
        const f = ta.dataset.f; work[f] = Object.assign({}, work[f], { [ta.dataset.l]: ta.value });
        if (!dirty) { setDirty(true); const rv = $('#unrev'); if (rv) { rv.outerHTML = `<button class="btn ok" id="rev">✓ ${esc(t('markReviewed'))}</button>`; $('#rev').onclick = () => save(true); } }
      }));
      $('#save').onclick = () => save(questions[idx].reviewed);
      const rv = $('#rev'); if (rv) rv.onclick = () => save(true);
      const un = $('#unrev'); if (un) un.onclick = () => save(false);
      $('#qedit').onclick = async () => {
        const tp = await getTopics().catch(() => null);
        const raw = clone(work); ['id', 'reviewed', 'criteriaVersion', 'warnings', 'bankedAs', '_m'].forEach((k) => delete raw[k]);
        const out = await questionEditor(raw, { rules: tp && tp.dms, title: questions[idx].id, group: topicGroup(tp, draft.topicId) });
        if (out) { const src = questions[idx]; work = Object.assign(out, { id: src.id, reviewed: src.reviewed, criteriaVersion: src.criteriaVersion, warnings: src.warnings, bankedAs: src.bankedAs, _m: src._m }); draw(); setDirty(true); toast(t('qeApplied')); }
      };
      $('#json').onclick = async () => {
        const raw = clone(work); ['id', 'reviewed', 'criteriaVersion', 'warnings', 'bankedAs', '_m'].forEach((k) => delete raw[k]);
        await modal(`<h2>${esc(t('editJson'))} · ${esc(questions[idx].id)}</h2>
          <textarea class="json" spellcheck="false">${esc(JSON.stringify(raw, null, 2))}</textarea>
          <div id="jerr" class="banner err" hidden></div>
          <div class="row" style="justify-content:flex-end"><button class="btn" data-close="">${esc(t('cancel'))}</button><button class="btn primary" id="japply">${esc(t('apply'))}</button></div>`,
        { wide: true, onMount: (el, close) => {
          $('#japply', el).onclick = () => {
            try {
              const v = JSON.parse($('textarea', el).value);
              work = Object.assign(v, { id: questions[idx].id, reviewed: questions[idx].reviewed, criteriaVersion: questions[idx].criteriaVersion, warnings: questions[idx].warnings, _m: questions[idx]._m });
              dirty = true; close('ok'); draw(); setDirty(true);
            } catch (e) { const j = $('#jerr', el); j.textContent = t('jsonBad') + e.message; j.hidden = false; }
          };
        } });
      };
      if ($('#del')) $('#del').onclick = async () => {
        const id = questions[idx].id;
        const v = await modal(`<h2>${esc(t('delConfirm', { id }))}</h2>
          <div class="row" style="justify-content:flex-end;flex-wrap:wrap"><button class="btn" data-close="">${esc(t('cancel'))}</button>
          <button class="btn" data-close="only">${esc(t('delOnly'))}</button><button class="btn brand" data-close="refill">${esc(t('delRefill'))}</button></div>`);
        if (!v) return;
        try {
          const r = await api('t_deleteQuestion', { draftId: draft.draftId, qid: id, refill: v === 'refill' });
          draft = r.draft; questions.splice(idx, 1); idx = Math.min(idx, questions.length - 1); dirty = false;
          work = questions.length ? clone(questions[Math.max(0, idx)]) : null; idx = Math.max(0, idx);
          if (r.command) { copyText(r.command); toast(t('delRefillDone', { cmd: r.command }), 6000); } else toast(t('delDone'));
          draw();
        } catch (e) { toast(e.message, 4000); }
      };
    }
    /** 即時監聽這份草稿：Agent 寫入新題目或狀態改變時自動重新載入（正在編輯時先不打擾） */
    let pending = false;
    async function refetch() {
      if (dirty || saving) { pending = true; return; }
      pending = false;
      try {
        const r = await api('t_getDraft', { draftId: draft.draftId });
        const curId = questions[idx] && questions[idx].id;
        draft = r.draft; questions = r.questions;
        idx = Math.max(0, questions.findIndex((q) => q.id === curId));
        work = questions.length ? clone(questions[idx]) : null; draw();
      } catch (_) { /* 下次再試 */ }
    }
    if (liveOff) { liveOff(); liveOff = null; }
    liveOff = DB().live.draft(draft.draftId, (d) => {
      if (!d) return;
      if (d.imported !== draft.imported || d.status !== draft.status || d.target !== draft.target || d.version !== draft.version) refetch();
    });
    work = questions.length ? clone(questions[idx]) : null;
    draw();
  }

  // ═════════════════════════ M4：發佈與作答 ═════════════════════════
  Object.assign(I18N.zh, {
    sessions: '測驗管理', newSession: '發佈新測驗', pickDraft: '考題（只列出可發佈的草稿）', noReady: '目前沒有「可發佈」的草稿，請先完成校對。',
    titleZh: '測驗名稱（中文）', titleEn: '測驗名稱（英文）', startAt: '開始', endAt: '結束', minutes: '作答時限（分鐘）', tz: '時間以你的電腦時區為準（台北 / 馬尼拉皆為 UTC+8）',
    assignees: '受測者 Email（每行一個，可從 Excel 貼上）', validN: '{a} 個有效帳號 · {b} 個格式錯誤', publish: '發佈並產生測驗連結', published: '測驗 {id} 已發佈',
    linkHint: '把連結傳給受測者；他們用公司 Google 帳號登入後就能作答。', copyLink: '複製連結', goSession: '查看進度', publishDraft: '發佈測驗',
    colSession: '測驗', colWindow: '期間', colMinutes: '時限', colSubmitted: '交卷', noSessions: '還沒有發佈的測驗。',
    s_scheduled: '尚未開始', s_open: '進行中', s_closed: '已結束', s_released: '成績已公布',
    a_not_started: '未開始', a_in_progress: '作答中', a_submitted: '已交卷', a_expired: '逾時未交', autoSub: '自動交卷',
    submittedN: '{a} / {b} 已交卷', archive: '封存', unarchive: '取消封存', archivedChip: '已封存', archivedDone: '已封存', unarchived: '已取消封存',
    archiveConfirm: '封存 {id}？測驗會從「測驗管理」與「閱卷發佈」列表隱藏（可用「顯示已封存」找回）；成績、歷史成績、專員的「我的測驗」都不受影響。',
    archShow: '顯示已封存的測驗（{n}）', archHide: '隱藏已封存的測驗（{n}）', sessDel: '刪除測驗', sessDelConfirm: '刪除 {id}「{t}」？場次、作答、分數、公布的成績都會刪除，專員的歷史成績也會消失，無法復原；題庫的使用次數與得分率會扣回。只用來清除測試測驗；正式測驗請用「封存」。', sessDelDone: '{id} 已刪除', remaining: '剩餘', previewAgent: '以專員畫面預覽', endNow: '提前結束測驗',
    endConfirm: '確定要提前結束 {id}？作答中的人會在 2 分鐘內由瀏覽器自動交卷。', ended: '測驗已結束', roster: '受測名單',
    colEmail: 'Email', colStarted: '開始作答', colSubmittedAt: '交卷時間', minUnit: '{n} 分鐘', qUnit: '{n} 題 · 100 分',
    myQuizzes: '我的測驗', window: '測驗期間', timeLimit: '作答時限', questionsLabel: '題數', startsWhen: '按下「開始作答」後開始計時',
    rulesTitle: '開始前請注意',
    rule1: '每題會顯示買賣家、聊聊、DRC、買家的申請內容與商品資訊。',
    rule2: 'DRC 是各方與蝦皮之間的溝通，不是買賣雙方的對話。',
    rule3: '交卷前可以回到任何一題修改答案。',
    rule4: '請使用同一台電腦與一般（非無痕）視窗，作答中不要關閉頁面。',
    rule5: '時間到會自動交卷。',
    startQuiz: '開始作答', startConfirm: '{n} 分鐘的計時會立即開始，且無法暫停。', continueQuiz: '繼續作答', viewQuiz: '查看',
    notOpenYet: '測驗尚未開始，開放時間：{t}', closedMsg: '這份測驗已結束。', expiredMsg: '作答時間已過，系統沒有收到你的答案。請聯絡講師。',
    answeredN: '已作答 {a} / {b}', left: '剩餘 {t}', finish: '交卷', question: '第 {n} 題', typeAName: '選擇', typeBName: '選擇 + 原因', typeCName: '文字作答', typeGName: '題組',
    pts: '{n} 分', yourReason: '你的判斷原因', yourAnswer: '你的答案', reasonPh: '說明你的判斷依據…', answerPh: '輸入你的答案…',
    submitTitle: '確定要交卷嗎？', unansweredN: '還有 {n} 題未作答。', allAnswered: '所有題目都已作答。', submitNote: '交卷後就不能再修改。', submitNow: '確定交卷',
    submitting: '交卷中…', doneTitle: '已交卷', doneMsg: '你的答案已送出（{t}）。成績公布後，可以在這裡查看分數與錯題。', autoDone: '時間到，系統已自動交卷。',
    backHome: '回到我的測驗', timeWarn5: '剩下 5 分鐘', timeWarn1: '剩下 1 分鐘', endedEarly: '講師已結束測驗，系統正在自動交卷。',
    retrying: '交卷失敗，15 秒後自動重試：', sandbox: '預覽模式：這是專員看到的畫面，作答不會送出。', sandboxDone: '預覽結束（未送出）。', leaveWarn: '作答尚未交卷，確定要離開嗎？',
    noQuiz: '目前沒有指派給你的測驗', opensAt: '開放時間', saveLocal: '答案會暫存在這台電腦的瀏覽器',
  });
  Object.assign(I18N.en, {
    sessions: 'Quiz Management', newSession: 'Publish a quiz', pickDraft: 'Questions (ready drafts only)', noReady: 'No ready drafts yet. Finish reviewing a draft first.',
    titleZh: 'Title (Chinese)', titleEn: 'Title (English)', startAt: 'Start', endAt: 'End', minutes: 'Time limit (minutes)', tz: 'Times use your computer’s time zone (Taipei / Manila are both UTC+8)',
    assignees: 'Emails (one per line, paste from Excel)', validN: '{a} valid · {b} invalid', publish: 'Publish and create link', published: 'Quiz {id} published',
    linkHint: 'Send this link to the assignees. They sign in with their company Google account to answer.', copyLink: 'Copy link', goSession: 'View progress', publishDraft: 'Publish quiz',
    colSession: 'Quiz', colWindow: 'Window', colMinutes: 'Limit', colSubmitted: 'Submitted', noSessions: 'No quizzes published yet.',
    s_scheduled: 'Scheduled', s_open: 'Open now', s_closed: 'Closed', s_released: 'Results released',
    a_not_started: 'Not started', a_in_progress: 'In progress', a_submitted: 'Submitted', a_expired: 'Not submitted', autoSub: 'Auto-submitted',
    submittedN: '{a} / {b} submitted', archive: 'Archive', unarchive: 'Unarchive', archivedChip: 'Archived', archivedDone: 'Archived', unarchived: 'Unarchived',
    archiveConfirm: 'Archive {id}? It is hidden from the Quizzes and Grading lists (use "Show archived" to find it). Results, history and agents\' My quizzes are not affected.',
    archShow: 'Show archived quizzes ({n})', archHide: 'Hide archived quizzes ({n})', sessDel: 'Delete quiz', sessDelConfirm: 'Delete {id} "{t}"? The quiz, attempts, scores and released results are deleted, agents lose it from their history, and this cannot be undone; bank usage and score rates are reverted. For test quizzes only; archive real quizzes instead.', sessDelDone: '{id} deleted', remaining: 'Remaining', previewAgent: 'Preview as agent', endNow: 'End quiz now',
    endConfirm: 'End {id} now? Anyone still answering will be auto-submitted by their browser within 2 minutes.', ended: 'Quiz ended', roster: 'Assignees',
    colEmail: 'Email', colStarted: 'Started', colSubmittedAt: 'Submitted at', minUnit: '{n} min', qUnit: '{n} questions · 100 points',
    myQuizzes: 'My quizzes', window: 'Exam window', timeLimit: 'Time limit', questionsLabel: 'Questions', startsWhen: 'Starts when you press Start',
    rulesTitle: 'Before you start',
    rule1: 'Each question shows the buyer and seller, the chat, DRC, the buyer’s request and the item details.',
    rule2: 'DRC is each party’s channel with Shopee, not a conversation between buyer and seller.',
    rule3: 'You can go back to any question and change your answer before you finish.',
    rule4: 'Use the same computer and a normal (not incognito) window. Do not close the page while answering.',
    rule5: 'When time runs out, your answers are submitted automatically.',
    startQuiz: 'Start exam', startConfirm: 'The {n}-minute timer starts now and cannot be paused.', continueQuiz: 'Continue', viewQuiz: 'View',
    notOpenYet: 'This quiz opens at {t}.', closedMsg: 'This quiz has closed.', expiredMsg: 'Time is up and no answers were received. Please contact your trainer.',
    answeredN: 'Answered {a} / {b}', left: '{t} left', finish: 'Finish exam', question: 'Question {n}', typeAName: 'Choice', typeBName: 'Choice + reason', typeCName: 'Written', typeGName: 'Question set',
    pts: '{n} points', yourReason: 'Your reason', yourAnswer: 'Your answer', reasonPh: 'Explain how you decided…', answerPh: 'Type your answer…',
    submitTitle: 'Submit your exam?', unansweredN: '{n} question(s) not answered.', allAnswered: 'All questions answered.', submitNote: 'You cannot change your answers after submitting.', submitNow: 'Submit',
    submitting: 'Submitting…', doneTitle: 'Submitted', doneMsg: 'Your answers were received ({t}). When results are released, your score and the questions you missed will appear here.', autoDone: 'Time ran out, so your answers were submitted automatically.',
    backHome: 'Back to my quizzes', timeWarn5: '5 minutes left', timeWarn1: '1 minute left', endedEarly: 'Your trainer ended the quiz. Submitting your answers…',
    retrying: 'Submit failed. Retrying in 15 seconds: ', sandbox: 'Preview mode: this is what agents see. Nothing will be submitted.', sandboxDone: 'Preview finished (nothing submitted).', leaveWarn: 'Your exam has not been submitted. Leave anyway?',
    noQuiz: 'No quiz assigned to you yet', opensAt: 'Opens at', saveLocal: 'Answers are saved in this browser',
  });
  const fmtDT = (ms) => { if (!ms) return ''; const d = new Date(ms), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };
  const fmtDur = (ms) => {
    if (ms <= 0) return '0:00';
    const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    if (h >= 24) return lang === 'zh' ? `${Math.floor(h / 24)} 天 ${h % 24} 小時` : `${Math.floor(h / 24)}d ${h % 24}h`;
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0');
  };
  const toLocalInput = (ms) => { const d = new Date(ms), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
  const sessChip = (st) => `<span class="chip ${st === 'open' ? 'ok' : st === 'scheduled' ? 'info' : st === 'released' ? 'brand' : ''}">${esc(t('s_' + st))}</span>`;
  const attChip = (a) => `<span class="chip ${a.status === 'submitted' ? 'ok' : a.status === 'in_progress' ? 'info' : a.status === 'expired' ? 'warn' : ''}">${esc(t('a_' + a.status))}${a.autoSubmitted ? ' · ' + esc(t('autoSub')) : ''}</span>`;
  const quizLink = (id) => location.origin + location.pathname + '#/s/' + id;
  const parseEmails = (txt) => {
    const parts = String(txt || '').split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
    const uniq = [...new Set(parts)];
    return { ok: uniq.filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)), bad: uniq.filter((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) };
  };

  // ───────── 講師：測驗場次 ─────────
  const M5_READY = true;    // 延長時間、退回重考
  /** 列表下方的「顯示已封存」切換 */
  function archToggle(n, on, cb) {
    return { html: n ? `<div class="row" style="padding:10px 14px"><span class="spacer"></span><button class="btn sm ghost" data-arch-tog>${esc(t(on ? 'archHide' : 'archShow', { n }))}</button></div>` : '',
      bind: (box) => { const b = $('[data-arch-tog]', box); if (b) b.onclick = cb; } };
  }
  async function viewSessions() {
    const params = new URLSearchParams(location.hash.split('?')[1] || '');
    const main = shell('sessions', `<div class="row"><h1>${esc(t('sessions'))}</h1><span class="spacer"></span>
        <button class="btn" id="refresh">${esc(t('refresh'))}</button><button class="btn brand" id="newBtn">+ ${esc(t('newSession'))}</button></div>
      <div id="createBox"></div><div id="doneBox"></div>
      <div class="card scroll-x" id="listBox"><div class="empty-state"><span class="spin"></span> ${esc(t('loading'))}</div></div>`);
    let showArch = params.get('archived') === '1';
    async function loadList() {
      try {
        const { sessions, archivedCount } = await api('t_listSessions', { includeArchived: showArch });
        const box = $('#listBox'); if (!box) return;
        const tog = archToggle(archivedCount, showArch, () => { showArch = !showArch; loadList(); });
        if (!sessions.length) { box.innerHTML = `<div class="empty-state">${esc(t('noSessions'))}</div>${tog.html}`; tog.bind(box); return; }
        box.innerHTML = `<table class="list"><thead><tr><th>${esc(t('colSession'))}</th><th>${esc(t('colWindow'))}</th><th class="hide-sm">${esc(t('colMinutes'))}</th><th>${esc(t('colSubmitted'))}</th><th>${esc(t('colStatus'))}</th><th></th></tr></thead><tbody>${
          sessions.map((s) => {
            const pct = s.assigned ? Math.round((s.submitted / s.assigned) * 100) : 0;
            return `<tr class="click" data-open="${esc(s.sessionId)}"><td><b>${esc(s.sessionId)}</b> ${esc(L(s.title))}<div class="small soft">${s.draftId && s.draftId !== 'BANK' ? esc(s.draftId) + ' · ' : ''}${esc(t('qUnit', { n: s.questionCount }))}</div></td>
              <td class="small">${esc(fmtDT(s.startAt))}<br>– ${esc(fmtDT(s.endAt))}</td><td class="hide-sm small">${esc(t('minUnit', { n: s.minutes }))}</td>
              <td><div class="bar ok"><i style="width:${pct}%"></i></div><div class="small muted">${esc(t('submittedN', { a: s.submitted, b: s.assigned }))}</div></td>
              <td>${sessChip(s.state)}${s.archived ? ` <span class="chip">${esc(t('archivedChip'))}</span>` : ''}</td><td style="text-align:right"><button class="btn sm">${esc(t('open'))}</button></td></tr>`;
          }).join('')}</tbody></table>${tog.html}`;
        tog.bind(box);
        $$('[data-open]', box).forEach((r) => r.addEventListener('click', () => { location.hash = '#/session/' + r.dataset.open; }));
      } catch (e) { showError(e, $('#listBox')); }
    }
    async function openCreate() {
      const box = $('#createBox');
      if (box.innerHTML) { box.innerHTML = ''; return; }
      composeForm(box, (r) => {
        box.innerHTML = '';
        const link = quizLink(r.sessionId);
        $('#doneBox').innerHTML = `<div class="card pad" style="display:flex;flex-direction:column;gap:10px"><div><b>${esc(t('published', { id: r.sessionId }))}</b> <span class="muted">${esc(t('linkHint'))}</span></div>
          <div class="cmd"><code style="font-size:15px;word-break:break-all">${esc(link)}</code><span class="spacer"></span><button class="btn sm" id="cpl">${esc(t('copyLink'))}</button><a class="btn sm" style="display:inline-grid;place-items:center;text-decoration:none" href="#/session/${esc(r.sessionId)}">${esc(t('goSession'))}</a></div></div>`;
        $('#cpl').onclick = () => copyText(link);
        loadList();
      });
    }
    $('#refresh').onclick = loadList;
    $('#newBtn').onclick = () => openCreate();
    loadList();
    if (params.get('new')) openCreate();
  }

  async function viewSession(id) {
    const main = shell('sessions', `<div class="empty-state"><span class="spin"></span> ${esc(t('loading'))}</div>`);
    async function load() {
      let d;
      try { d = await api('t_getSession', { sessionId: id }); } catch (e) { showError(e); return; }
      const s = d.session, link = quizLink(s.sessionId), offset = d.serverNow - Date.now();
      const sub = d.roster.filter((r) => r.status === 'submitted').length, inp = d.roster.filter((r) => r.status === 'in_progress').length, nst = d.roster.filter((r) => r.status === 'not_started').length;
      const rem = s.state === 'open' ? fmtDur(s.endAt - (Date.now() + offset)) : t('none');
      main.innerHTML = `<div class="row"><a href="#/sessions">← ${esc(t('sessions'))}</a><h1>${esc(s.sessionId)} ${esc(L(s.title))}</h1>${sessChip(s.state)}${s.archived ? ` <span class="chip">${esc(t('archivedChip'))}</span>` : ''}<span class="spacer"></span>
          <button class="btn" id="reload">${esc(t('refresh'))}</button><a class="btn" style="display:inline-grid;place-items:center;text-decoration:none" href="#/preview/${esc(s.sessionId)}">${esc(t('previewAgent'))}</a>
          ${M5_READY && s.state !== 'released' ? `<button class="btn" id="extend">${esc(t('extend'))}</button>` : ''}
          ${s.state === 'released' ? `<button class="btn" id="arch">${esc(t(s.archived ? 'unarchive' : 'archive'))}</button>` : ''}
          ${me.can.session ? `<button class="btn ghost danger" id="sessDel">${esc(t('sessDel'))}</button>` : ''}
          ${s.state === 'open' || s.state === 'scheduled' ? `<button class="btn danger" id="endNow">${esc(t('endNow'))}</button>` : `<a class="btn brand" style="display:inline-grid;place-items:center;text-decoration:none" href="#/grading/${esc(s.sessionId)}">${esc(t('goGrading'))}</a>`}</div>
        <div class="cmd"><code style="font-size:15px;word-break:break-all">${esc(link)}</code><span class="spacer"></span><button class="btn sm" id="cpl">${esc(t('copyLink'))}</button></div>
        <div class="stats">
          <div class="card pad"><div class="small soft">${esc(t('colWindow'))}</div><div><b>${esc(fmtDT(s.startAt))}</b><br>– <b>${esc(fmtDT(s.endAt))}</b></div></div>
          <div class="card pad"><div class="small soft">${esc(t('remaining'))}</div><div class="big">${esc(rem)}</div></div>
          <div class="card pad"><div class="small soft">${esc(t('timeLimit'))}</div><div class="big">${esc(t('minUnit', { n: s.minutes }))}</div><div class="small soft">${esc(t('qUnit', { n: s.questionCount }))}</div></div>
          <div class="card pad"><div class="small soft">${esc(t('colSubmitted'))}</div><div class="big">${sub} <span class="soft" style="font-size:16px">/ ${d.roster.length}</span></div><div class="small soft">${esc(t('a_in_progress'))} ${inp} · ${esc(t('a_not_started'))} ${nst}</div></div>
        </div>
        <div class="card scroll-x"><table class="list"><thead><tr><th>${esc(t('colEmail'))}</th><th>${esc(t('colStatus'))}</th><th>${esc(t('colStarted'))}</th><th>${esc(t('colSubmittedAt'))}</th><th></th></tr></thead><tbody>${
          d.roster.map((r) => `<tr><td>${esc(r.email)}</td><td>${attChip(r.status === 'not_started' && s.state === 'closed' ? { status: 'expired' } : r)}</td><td class="small muted">${esc(fmtDT(r.startedAt))}</td><td class="small muted">${esc(fmtDT(r.submittedAt))}</td>
            <td style="text-align:right">${M5_READY && r.status !== 'not_started' && s.state !== 'released' ? `<button class="btn sm ghost" data-ret="${esc(r.email)}">${esc(t('returnBtn'))}</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
      $('#cpl').onclick = () => copyText(link);
      $('#reload').onclick = load;
      const ex = $('#extend'); if (ex) ex.onclick = () => extendModal(s, load);
      $$('[data-ret]').forEach((b) => b.addEventListener('click', () => returnModal(s, b.dataset.ret, load)));
      const ar = $('#arch'); if (ar) ar.onclick = async () => {
        if (!s.archived && !(await confirmBox(t('archiveConfirm', { id: s.sessionId }), t('archive')))) return;
        try { await api('t_setArchived', { sessionId: s.sessionId, archived: !s.archived }); toast(t(s.archived ? 'unarchived' : 'archivedDone')); load(); } catch (e) { toast(e.message, 4000); }
      };
      const sd = $('#sessDel'); if (sd) sd.onclick = async () => {
        if (!(await confirmBox(t('sessDelConfirm', { id: s.sessionId, t: L(s.title) }), t('sessDel'), t('cancel'), true))) return;
        try { await api('tw_deleteSession', { sessionId: s.sessionId }); toast(t('sessDelDone', { id: s.sessionId })); location.hash = '#/sessions'; } catch (e) { toast(e.message, 5000); }
      };
      const en = $('#endNow'); if (en) en.onclick = async () => {
        if (!(await confirmBox(t('endConfirm', { id: s.sessionId }), t('endNow'), t('cancel'), true))) return;
        try { await api('t_endSession', { sessionId: s.sessionId }); toast(t('ended')); load(); } catch (e) { toast(e.message, 4000); }
      };
    }
    await load();
    pollTimer = setInterval(() => { if (!document.hidden) load(); }, 30000);
  }

  // ───────── 專員：我的測驗 ─────────
  async function viewMyQuizzes() {
    const main = shell('', `<div class="row"><h1>${esc(t('myQuizzes'))}</h1></div><div id="qz"><div class="empty-state"><span class="spin"></span> ${esc(t('loading'))}</div></div>`);
    let d;
    try { d = await api('s_list'); } catch (e) { showError(e, $('#qz')); return; }
    if (!d.sessions.length) { $('#qz').innerHTML = `<div class="card empty-state"><h2>${esc(t('noQuiz'))}</h2><p>${esc(t('agentHomeSub'))}</p></div>`; return; }
    $('#qz').innerHTML = d.sessions.map((s) => {
      const a = s.attempt;
      let btn = '';
      if (a.status === 'in_progress') btn = `<a class="btn brand" href="#/s/${esc(s.sessionId)}">${esc(t('continueQuiz'))}</a>`;
      else if (a.status === 'not_started' && s.state === 'open') btn = `<a class="btn brand" href="#/s/${esc(s.sessionId)}">${esc(t('startQuiz'))}</a>`;
      else if (a.score !== undefined && a.score !== null) btn = `<a class="btn brand" href="#/s/${esc(s.sessionId)}">${esc(t('viewResult'))}</a><span class="score" style="font-size:20px"><b>${r2(a.score)}</b><span> / 100</span></span>`;
      else btn = `<a class="btn" href="#/s/${esc(s.sessionId)}">${esc(t('viewQuiz'))}</a>`;
      return `<div class="card pad quizcard"><div class="row">${sessChip(s.state)}${a.status !== 'not_started' ? attChip(a) : ''}</div>
        <h2 style="margin-top:8px">${esc(L(s.title))}</h2>
        <div class="kv small" style="margin-top:8px"><span>${esc(t('window'))}</span><span>${esc(fmtDT(s.startAt))} – ${esc(fmtDT(s.endAt))}</span>
        <span>${esc(t('timeLimit'))}</span><span>${esc(t('minUnit', { n: s.minutes }))}</span><span>${esc(t('questionsLabel'))}</span><span>${esc(t('qUnit', { n: s.questionCount }))}</span></div>
        <div class="row" style="margin-top:12px">${btn.replace('class="btn', 'style="display:inline-grid;place-items:center;text-decoration:none" class="btn')}</div></div>`;
    }).join('');
  }

  // ───────── 專員：測驗入口 ─────────
  async function viewQuizEntry(id) {
    const main = shell('', `<div class="empty-state"><span class="spin"></span> ${esc(t('loading'))}</div>`);
    let d;
    if (/^S\d+$/i.test(id)) {   // V1 的測驗連結（#/s/S001）：搬到 V2 後編號改成 E###
      try {
        const l = await api('s_list'), hit = (l.sessions || []).find((x) => String(x.v1Id || '').toUpperCase() === id.toUpperCase());
        location.replace('#/' + (hit ? 's/' + hit.sessionId : '')); return;
      } catch (e) { showError(e); return; }
    }
    try { d = await api('s_get', { sessionId: id }); } catch (e) { showError(e); return; }
    const s = d.session, a = d.attempt, offset = d.serverNow - Date.now();
    if (a.status === 'in_progress') return runQuiz({ session: s, questions: d.questions, deadline: a.deadline, offset });
    if (a.status === 'submitted') return s.state === 'released' ? resultScreen(main, s.sessionId) : doneScreen(main, s, a, false, s.state === 'closed');
    const box = (inner) => { main.innerHTML = `<div class="card pad intro"><div class="row">${sessChip(s.state)}</div><h1 style="margin-top:8px">${esc(L(s.title))}</h1>${inner}</div>`; };
    if (a.status === 'expired') return box(`<div class="banner warn" style="margin-top:12px">${esc(t('expiredMsg'))}</div><div style="margin-top:12px"><a href="#/">${esc(t('backHome'))}</a></div>`);
    if (s.state === 'scheduled') return box(`<div class="banner info" style="margin-top:12px">${esc(t('notOpenYet', { t: fmtDT(s.startAt) }))}</div><div style="margin-top:12px"><a href="#/">${esc(t('backHome'))}</a></div>`);
    if (s.state !== 'open') return box(`<div class="banner warn" style="margin-top:12px">${esc(t('closedMsg'))}</div><div style="margin-top:12px"><a href="#/">${esc(t('backHome'))}</a></div>`);
    box(`<div class="introgrid">
        <div><div class="small soft">${esc(t('window'))}</div><b>${esc(fmtDT(s.startAt))} – ${esc(fmtDT(s.endAt))}</b><div class="small soft">${esc(t('tz'))}</div></div>
        <div><div class="small soft">${esc(t('timeLimit'))}</div><b>${esc(t('minUnit', { n: s.minutes }))}</b><div class="small soft">${esc(t('startsWhen'))}</div></div>
        <div><div class="small soft">${esc(t('questionsLabel'))}</div><b>${esc(t('qUnit', { n: s.questionCount }))}</b></div></div>
      <h2 style="margin-top:20px">${esc(t('rulesTitle'))}</h2>
      <ul class="rules">${[1, 2, 3, 4, 5].map((i) => `<li>${esc(t('rule' + i))}</li>`).join('')}</ul>
      <div class="row" style="margin-top:8px"><button class="btn brand" id="go" style="height:46px;padding:0 28px;font-size:16px">${esc(t('startQuiz'))}</button><span class="small muted">${esc(t('startConfirm', { n: s.minutes }))}</span></div>
      <div id="goErr" class="banner err" hidden style="margin-top:12px"></div>`);
    $('#go').onclick = async () => {
      $('#go').disabled = true;
      try {
        const r = await api('s_start', { sessionId: s.sessionId });
        if (r.attempt.status !== 'in_progress') return viewQuizEntry(id);
        runQuiz({ session: s, questions: r.questions, deadline: r.attempt.deadline, offset: r.serverNow - Date.now() });
      } catch (e) { $('#goErr').textContent = e.message; $('#goErr').hidden = false; $('#go').disabled = false; }
    };
  }
  function doneScreen(main, s, a, auto, closed) {
    main.innerHTML = `<div class="card pad intro" style="text-align:center;align-items:center">
      <div class="donemark">✓</div><h1>${esc(t('doneTitle'))}</h1><h2 class="muted" style="font-weight:500">${esc(L(s.title))}</h2>
      ${auto || a.autoSubmitted ? `<div class="banner info">${esc(t('autoDone'))}</div>` : ''}
      <p class="muted">${esc(t('doneMsg', { t: fmtDT(a.submittedAt) }))}</p>${closed ? `<div class="banner info">${esc(t('notReleasedYet'))}</div>` : ''}
      <a class="btn" style="display:inline-grid;place-items:center;text-decoration:none" href="#/">${esc(t('backHome'))}</a></div>`;
  }

  // ───────── 講師：以專員畫面預覽 ─────────
  async function viewPreview(id) {
    shell('sessions', `<div class="empty-state"><span class="spin"></span> ${esc(t('loading'))}</div>`);
    try {
      const d = await api('t_getSession', { sessionId: id });
      const qs = d.questions.map((q) => { const o = {}; ['qid', 'seq', 'type', 'points', 'prompt', 'buyer', 'seller', 'order', 'payment', 'logistics', 'chat', 'drc', 'request', 'options', 'group', 'cutoff'].forEach((k) => { if (q[k] !== undefined) o[k] = q[k]; }); return o; });
      runQuiz({ session: d.session, questions: qs, deadline: Date.now() + d.session.minutes * 60000, offset: 0, sandbox: true });
    } catch (e) { showError(e); }
  }

  // ───────── 作答 ─────────
  function runQuiz({ session, questions, deadline, offset, sandbox }) {
    const s = session, N = questions.length;
    const key = 'rrqp2:p:' + s.sessionId + ':' + (me ? me.email : '') + (sandbox ? ':preview' : '');
    let st = { answers: {}, idx: 0 };
    try { const v = JSON.parse(store.get(key) || 'null'); if (v && v.answers) st = v; } catch (_) { /* */ }
    const save = () => store.set(key, JSON.stringify(st));
    let submitted = false, submitting = false, warned5 = false, warned1 = false, tick = null, poll = null, retry = null;
    const now = () => Date.now() + offset;
    const answered = (q) => { const a = st.answers[q.qid] || {}; return q.type === 'G' ? (q.group || []).every((x) => (a.subs || {})[x.id]) : q.type === 'A' ? !!a.choice : q.type === 'B' ? !!a.choice && !!String(a.text || '').trim() : !!String(a.text || '').trim(); };
    const onBeforeUnload = (e) => { if (!submitted && !sandbox) { e.preventDefault(); e.returnValue = t('leaveWarn'); } };
    window.addEventListener('beforeunload', onBeforeUnload);
    leaveGuard = () => { if (submitted || sandbox) return cleanup(), true; const ok = window.confirm(t('leaveWarn')); if (ok) cleanup(); return ok; };
    function cleanup() { clearInterval(tick); clearInterval(poll); clearTimeout(retry); window.removeEventListener('beforeunload', onBeforeUnload); }

    app().innerHTML = `<header class="quizbar">
        <div class="brandmark"><span class="logo" aria-hidden="true">S</span><span class="hide-sm">RR AI Quiz Platform</span></div>
        <div class="qtitle">${esc(L(s.title))}</div>
        <span class="chip" id="qa"></span><span class="timer" id="timer" aria-live="off"></span>
        <span class="spacer"></span>${langSeg()}<button class="btn brand" id="finish">${esc(t('finish'))}</button></header>
      ${sandbox ? `<div class="banner info" style="border-radius:0;text-align:center">${esc(t('sandbox'))} <a href="#/session/${esc(s.sessionId)}">← ${esc(t('sessions'))}</a></div>` : ''}
      <main><nav class="qnav" id="qnav" aria-label="questions"></nav><div id="qarea"></div></main>`;
    $$('[data-lang]', app()).forEach((b) => b.addEventListener('click', () => { lang = b.dataset.lang; store.set('rrqp2:lang', lang); document.documentElement.lang = lang === 'zh' ? 'zh-Hant' : 'en'; cleanup(); leaveGuard = null; runQuiz({ session, questions, deadline, offset, sandbox }); }));
    $('#finish').onclick = () => confirmSubmit();

    function drawNav() {
      $('#qnav').innerHTML = questions.map((q, i) => `<button type="button" class="qn ${answered(q) ? 'done' : ''} ${i === st.idx ? 'on' : ''}" data-go="${i}" aria-label="${esc(t('question', { n: i + 1 }))}">${i + 1}</button>`).join('');
      $$('#qnav [data-go]').forEach((b) => b.addEventListener('click', () => go(+b.dataset.go)));
      $('#qa').textContent = t('answeredN', { a: questions.filter(answered).length, b: N });
    }
    function drawQ() {
      const q = questions[st.idx], a = st.answers[q.qid] || {};
      const { left, req } = caseHtml(q);
      const pts = (q.points && ((q.points.choice || 0) + (q.points.text || 0))) || '';
      const typeName = t('type' + q.type + 'Name');
      const opts = (q.options || []).map((o) => `<label class="ropt ${a.choice === o.id ? 'on' : ''}"><input type="radio" name="ch" value="${esc(o.id)}" ${a.choice === o.id ? 'checked' : ''}><b>${esc(String(o.id).toUpperCase())}.</b> ${esc(L(o.text))}</label>`).join('');
      $('#qarea').innerHTML = `<div class="card">
        <div class="dhead"><span class="id">${esc(t('question', { n: st.idx + 1 }))}</span><span class="chip">${esc(typeName)}${pts ? ' · ' + esc(t('pts', { n: Math.round(pts * 100) / 100 })) : ''}</span></div>
        <div class="qbody"><div>${left}</div><div>${req}
          <div class="answerbox"><div class="prompt">${esc(L(q.prompt))}</div>
            ${opts}
            ${q.type === 'G' ? groupHtml(q, 'quiz', a.subs || {}) : ''}
            ${q.type === 'B' ? `<label class="lab2" for="txt">${esc(t('yourReason'))}</label><textarea id="txt" rows="5" placeholder="${esc(t('reasonPh'))}">${esc(a.text || '')}</textarea>` : ''}
            ${q.type === 'C' ? `<label class="lab2" for="txt">${esc(t('yourAnswer'))}</label><textarea id="txt" rows="7" placeholder="${esc(t('answerPh'))}">${esc(a.text || '')}</textarea>` : ''}
            <div class="small soft">${esc(t('saveLocal'))}</div></div>
        </div></div>
        <div class="dfoot"><button class="btn" id="pv" ${st.idx === 0 ? 'disabled' : ''}>← ${esc(t('prev'))}</button><span class="spacer"></span>
          ${st.idx < N - 1 ? `<button class="btn primary" id="nx">${esc(t('next'))} →</button>` : `<button class="btn brand" id="fin2">${esc(t('finish'))}</button>`}</div></div>`;
      $$('input[name=ch]').forEach((r) => r.addEventListener('change', () => {
        st.answers[q.qid] = Object.assign({}, st.answers[q.qid], { choice: r.value }); save();
        $$('.ropt').forEach((l) => l.classList.toggle('on', $('input', l).checked)); drawNav();
      }));
      $$('input[data-sub]').forEach((r) => r.addEventListener('change', () => {
        const cur = st.answers[q.qid] || {};
        st.answers[q.qid] = Object.assign({}, cur, { subs: Object.assign({}, cur.subs, { [r.dataset.sub]: r.value }) }); save();
        $$(`input[name="${r.name}"]`).forEach((x) => x.parentElement.classList.toggle('on', x.checked)); drawNav();
      }));
      const tx = $('#txt'); if (tx) tx.addEventListener('input', () => { st.answers[q.qid] = Object.assign({}, st.answers[q.qid], { text: tx.value }); save(); drawNav(); });
      $('#pv').onclick = () => go(st.idx - 1);
      const nx = $('#nx'); if (nx) nx.onclick = () => go(st.idx + 1);
      const f2 = $('#fin2'); if (f2) f2.onclick = () => confirmSubmit();
    }
    function go(i) { if (i < 0 || i >= N) return; st.idx = i; save(); drawNav(); drawQ(); window.scrollTo({ top: 0 }); }
    function updateTimer() {
      const left = deadline - now(), el = $('#timer');
      if (!el) return;
      el.textContent = t('left', { t: fmtDur(left) });
      el.classList.toggle('warn', left <= 5 * 60000); el.classList.toggle('danger', left <= 60000);
      if (!sandbox && left <= 5 * 60000 && !warned5 && left > 60000) { warned5 = true; toast(t('timeWarn5'), 4000); }
      if (!sandbox && left <= 60000 && !warned1 && left > 0) { warned1 = true; toast(t('timeWarn1'), 4000); }
      if (left <= 0 && !submitted) { if (sandbox) { finishSandbox(); } else doSubmit(true); }
    }
    async function confirmSubmit() {
      const un = questions.filter((q) => !answered(q)).length;
      const ok = await confirmBox(`${t('submitTitle')}\n${un ? t('unansweredN', { n: un }) : t('allAnswered')} ${t('submitNote')}`, t('submitNow'), t('cancel'));
      if (ok) { if (sandbox) finishSandbox(); else doSubmit(false); }
    }
    function finishSandbox() { submitted = true; cleanup(); leaveGuard = null; app().querySelector('main').innerHTML = `<div class="card pad intro" style="text-align:center;align-items:center"><div class="donemark">✓</div><h1>${esc(t('sandboxDone'))}</h1><a class="btn" style="display:inline-grid;place-items:center;text-decoration:none" href="#/session/${esc(s.sessionId)}">← ${esc(t('sessions'))}</a></div>`; }
    async function doSubmit(auto) {
      if (submitting || submitted) return;
      submitting = true; $('#finish').disabled = true; $('#finish').textContent = t('submitting');
      try {
        const r = await api('s_submit', { sessionId: s.sessionId, answers: st.answers, auto: !!auto });
        submitted = true; cleanup(); leaveGuard = null;
        try { localStorage.removeItem(key); } catch (_) { /* */ }
        shell('', ''); doneScreen($('#main'), s, r.attempt, auto);
      } catch (e) {
        submitting = false; $('#finish').disabled = false; $('#finish').textContent = t('finish');
        if (/window has closed|超過交卷時間|already/.test(e.message)) { toast(e.message, 6000); return; }
        toast(t('retrying') + e.message, 6000);
        if (auto) retry = setTimeout(() => doSubmit(true), 15000);
      }
    }
    async function checkStatus() {
      try {
        const r = await api('s_status', { sessionId: s.sessionId });
        offset = r.serverNow - Date.now();
        if (r.attempt.status === 'submitted') { submitted = true; cleanup(); leaveGuard = null; shell('', ''); doneScreen($('#main'), s, r.attempt); return; }
        if (r.attempt.deadline && r.attempt.deadline < deadline) { deadline = r.attempt.deadline; if (deadline <= now()) { toast(t('endedEarly'), 5000); doSubmit(true); } }
      } catch (_) { /* 網路問題：下次再檢查 */ }
    }
    drawNav(); drawQ(); updateTimer(); window.scrollTo({ top: 0 });
    tick = setInterval(updateTimer, 1000);
    if (!sandbox) poll = setInterval(checkStatus, 120000);
  }

  // ═════════════════════════ M5：批改與成績 ═════════════════════════
  Object.assign(I18N.zh, {
    grading: '閱卷發佈', goGrading: '前往批改', gradeList: '選擇要批改的測驗', noGradable: '還沒有已結束的測驗。測驗結束（或提前結束）後就能批改。',
    gradeSummary: '{n} 人交卷 · B / C 題共 {t} 筆文字答案 · AI 已批改 {g} 筆', confirmedN: '已確認', copyGradeCmd: '複製批改指令',
    needAi: '還有 {n} 筆文字答案尚未由 AI 批改。請在 SeaTalk @RR AI Quiz Assistant 傳：', releaseBtn: '發佈成績', releaseLeft: '發佈成績（尚有 {n} 筆未確認）',
    releaseConfirm: '發佈後專員就能看到分數與錯題。還有 {n} 筆未確認，會直接使用 AI 分數。確定發佈？', releaseConfirm0: '發佈後專員就能看到分數與錯題。確定發佈？',
    released: '成績已公布', unrelease: '取消公布', confirmedBy: '{who} · {t}',
    resetAi: '重新批改本題未確認的分數', resetAiConfirm: '清除本題「還沒確認」的 AI 分數（已確認的不受影響），之後再傳一次批改指令，AI 會依目前的批改原則重新評分。確定嗎？', resetAiDone: '已清除 {n} 筆，指令已複製：{cmd}', unreleaseConfirm: '取消公布後專員就看不到成績，確定嗎？',
    overview: '總覽', lowN: '{n} 低信心', correctAns: '正解', ptsSplit: '選擇 {a} 分 + 原因 {b} 分', ptsText: '文字 {b} 分', modelAnswer2: '標準答案',
    colAgent: '專員', colChoice: '選擇', colReason: '原因', colAnswer: '答案', colAi: 'AI 判分', colTeacher: '講師確認',
    right: '對', wrong: '錯', noChoice: '未選', conf: '信心度 {n}%', lowConf: '低信心度 {n}%', notGraded: '尚未批改', accept: '接受', confirm: '確認',
    accepted: '已確認 · {n}', edit: '修改', unconfirm: '取消確認', addComment: '加評語', editComment: '評語', commentPh: '給專員的評語（成績公布後專員看得到）',
    acceptRest: '本題未標記的全部接受', acceptedN: '已接受 {n} 筆', thresholdNote: '低信心度門檻：{n}%（可在「主題設定 → 系統設定」調整）。標記不改變排列順序。',
    colChoicePts: '選擇', colTextPts: '文字', colTotal: '總分', colUnconfirmed: '未確認', notSubmitted: '未交卷',
    resultsOut: '成績已公布', yourScore: '你的分數', correctOf: '答對（選擇）', textPts: '原因與文字作答', timeUsed: '作答時間', minShort: '{n} 分鐘',
    toReview: '需要複習的題目（{n}）', allCorrect: '全部答對，做得好！', keyPoint: '判斷重點', yourAns: '你的選擇', yourReason2: '你的原因', yourText: '你的答案',
    correct2: '正解', trainerNote: '講師評語', explanation2: '解析', modelAnswer3: '參考答案', viewResult: '查看成績', notReleasedYet: '測驗已結束，成績尚未公布。公布後會顯示在這裡。',
  });
  Object.assign(I18N.en, {
    grading: 'Grading & Release', goGrading: 'Go to grading', gradeList: 'Choose a quiz to grade', noGradable: 'No closed quizzes yet. You can grade after a quiz ends (or is ended early).',
    gradeSummary: '{n} submitted · {t} written answers (B / C) · AI graded {g}', confirmedN: 'Confirmed', copyGradeCmd: 'Copy grading command',
    needAi: '{n} written answer(s) have not been graded by AI yet. Send this to @RR AI Quiz Assistant in SeaTalk:', releaseBtn: 'Release results', releaseLeft: 'Release results ({n} unconfirmed)',
    releaseConfirm: 'Agents will see their scores and missed questions. {n} answer(s) are unconfirmed and will use the AI score. Release now?', releaseConfirm0: 'Agents will see their scores and missed questions. Release now?',
    released: 'Results released', unrelease: 'Withdraw results', confirmedBy: '{who} · {t}',
    resetAi: 'Re-grade unconfirmed scores in this question', resetAiConfirm: 'Clear the AI scores you have not confirmed in this question (confirmed ones stay). Send the grading command again and the AI will re-grade with the current grading principles. Continue?', resetAiDone: 'Cleared {n}. Command copied: {cmd}', unreleaseConfirm: 'Agents will no longer see their results. Continue?',
    overview: 'Overview', lowN: '{n} low', correctAns: 'Answer', ptsSplit: 'Choice {a} + reason {b} points', ptsText: 'Written {b} points', modelAnswer2: 'Model answer',
    colAgent: 'Agent', colChoice: 'Choice', colReason: 'Reason', colAnswer: 'Answer', colAi: 'AI score', colTeacher: 'Trainer',
    right: 'correct', wrong: 'wrong', noChoice: 'none', conf: 'confidence {n}%', lowConf: 'Low confidence {n}%', notGraded: 'Not graded', accept: 'Accept', confirm: 'Confirm',
    accepted: 'Confirmed · {n}', edit: 'Edit', unconfirm: 'Unconfirm', addComment: 'Add note', editComment: 'Note', commentPh: 'Note for the agent (visible after results are released)',
    acceptRest: 'Accept all unflagged in this question', acceptedN: 'Accepted {n}', thresholdNote: 'Low-confidence threshold: {n}% (change it in Settings → System). Flags do not change the order.',
    colChoicePts: 'Choice', colTextPts: 'Written', colTotal: 'Total', colUnconfirmed: 'Unconfirmed', notSubmitted: 'Not submitted',
    resultsOut: 'Results released', yourScore: 'Your score', correctOf: 'Correct (choice)', textPts: 'Reasons & written', timeUsed: 'Time used', minShort: '{n} min',
    toReview: 'Questions to review ({n})', allCorrect: 'You got everything right. Well done!', keyPoint: 'Key point', yourAns: 'Your answer', yourReason2: 'Your reason', yourText: 'Your answer',
    correct2: 'Correct answer', trainerNote: 'Trainer note', explanation2: 'Explanation', modelAnswer3: 'Model answer', viewResult: 'View results', notReleasedYet: 'This quiz has ended. Results will appear here once your trainer releases them.',
  });
  const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const isText = (t) => t === 'B' || t === 'C';

  async function viewGradingList() {
    const main = shell('grading', `<div class="row"><h1>${esc(t('grading'))}</h1></div><div class="card scroll-x" id="gl"><div class="empty-state"><span class="spin"></span></div></div>`);
    let showArch = false;
    async function load() { try {
      const { sessions, archivedCount } = await api('t_listSessions', { includeArchived: showArch });
      const list = sessions.filter((s) => s.state === 'closed' || s.state === 'released');
      const tog = archToggle(archivedCount, showArch, () => { showArch = !showArch; load(); });
      if (!list.length) { $('#gl').innerHTML = `<div class="empty-state">${esc(t('noGradable'))}</div>${tog.html}`; tog.bind($('#gl')); return; }
      $('#gl').innerHTML = `<table class="list"><thead><tr><th>${esc(t('colSession'))}</th><th>${esc(t('colWindow'))}</th><th>${esc(t('colSubmitted'))}</th><th>${esc(t('colStatus'))}</th><th></th></tr></thead><tbody>${
        list.map((s) => `<tr class="click" data-open="${esc(s.sessionId)}"><td><b>${esc(s.sessionId)}</b> ${esc(L(s.title))}</td><td class="small">${esc(fmtDT(s.startAt))} – ${esc(fmtDT(s.endAt))}</td>
          <td class="small">${esc(t('submittedN', { a: s.submitted, b: s.assigned }))}</td><td>${sessChip(s.state)}${s.archived ? ` <span class="chip">${esc(t('archivedChip'))}</span>` : ''}</td><td style="text-align:right"><button class="btn sm">${esc(t('goGrading'))}</button></td></tr>`).join('')}</tbody></table>${tog.html}`;
      tog.bind($('#gl'));
      $$('[data-open]', $('#gl')).forEach((r) => r.addEventListener('click', () => { location.hash = '#/grading/' + r.dataset.open; }));
    } catch (e) { showError(e, $('#gl')); } }
    await load();
  }

  async function viewGrading(id) {
    const main = shell('grading', `<div class="empty-state"><span class="spin"></span> ${esc(t('loading'))}</div>`);
    let d;
    try { d = await api('t_grading', { sessionId: id }); } catch (e) { showError(e); return; }
    const params = new URLSearchParams(location.hash.split('?')[1] || '');
    const textQs = d.questions.filter((q) => isText(q.type));
    let tab = params.get('q') || (textQs[0] ? textQs[0].qid : 'overview');
    const th = d.threshold;
    const isLow = (a) => a.aiConfidence !== null && a.aiConfidence < th;
    const textAnswers = () => d.answers.filter((a) => { const q = d.questions.find((x) => x.qid === a.qid); return q && isText(q.type); });

    function header() {
      const all = textAnswers(), conf = all.filter((a) => a.teacherScore !== null).length, graded = all.filter((a) => a.aiScore !== null || a.teacherScore !== null).length;
      const sub = d.attempts.filter((a) => a.submittedAt).length, missing = all.length - graded, unconf = all.length - conf;
      const rel = d.session.released;
      return `<div class="row"><a href="#/grading">← ${esc(t('grading'))}</a><h1>${esc(d.session.sessionId)} ${esc(L(d.session.title))}</h1>${sessChip(d.session.state)}<span class="spacer"></span>
          <button class="btn" id="reload">${esc(t('refresh'))}</button>
          ${rel ? `<button class="btn" id="unrel">${esc(t('unrelease'))}</button>` : `<button class="btn ok" id="rel" ${missing ? 'disabled' : ''}>${esc(unconf ? t('releaseLeft', { n: unconf }) : t('releaseBtn'))}</button>`}</div>
        <div class="row small muted">${esc(t('gradeSummary', { n: sub, t: all.length, g: graded }))}<span class="spacer"></span>
          <span>${esc(t('confirmedN'))} <b style="font-size:18px;color:var(--ink)">${conf}</b> / ${all.length}</span><div class="bar ok" style="width:160px"><i style="width:${all.length ? Math.round((conf / all.length) * 100) : 0}%"></i></div></div>
        ${missing ? `<div class="banner info row"><span>${esc(t('needAi', { n: missing }))}</span><span class="cmd" style="padding:6px 12px"><code style="font-size:15px">${esc(d.command)}</code><button class="btn sm" id="cpg">${esc(t('copy'))}</button></span></div>` : ''}
        <div class="tabs" role="tablist">${textQs.map((q) => {
          const ans = d.answers.filter((a) => a.qid === q.qid), low = ans.filter(isLow).length;
          return `<button class="tab ${tab === q.qid ? 'on' : ''}" data-tab="${esc(q.qid)}" role="tab">Q${String(q.seq).padStart(2, '0')} ${esc(q.type)}${low ? ` <span class="chip warn" style="padding:0 6px">${esc(t('lowN', { n: low }))}</span>` : ''}</button>`;
        }).join('')}<button class="tab ${tab === 'overview' ? 'on' : ''}" data-tab="overview" role="tab">${esc(t('overview'))}</button></div>`;
    }
    function qPanel(q) {
      const opt = (q.options || []).find((o) => o.id === q.answer), p = q.points || {};
      const rows = d.answers.filter((a) => a.qid === q.qid);
      return `<div class="card pad gq">
          <div class="row"><h2>Q${String(q.seq).padStart(2, '0')} ${esc(t('correctAns'))}</h2>${opt ? `<span class="chip ok">${esc(String(opt.id).toUpperCase())} ${esc(L(opt.text))}</span>` : ''}
          <span class="soft small">· ${esc(q.type === 'B' ? t('ptsSplit', { a: r2(p.choice), b: r2(p.text) }) : t('ptsText', { b: r2(p.text) }))}</span></div>
          <div class="gref"><div><h4>${esc(t('modelAnswer2'))}</h4><div>${esc(L(q.modelAnswer))}</div></div><div><h4>${esc(t('rubric'))}</h4><div>${esc(L(q.rubric))}</div></div></div></div>
        <div class="card scroll-x"><table class="list gtable"><thead><tr><th>${esc(t('colAgent'))}</th>${q.type === 'B' ? `<th>${esc(t('colChoice'))}</th>` : ''}<th>${esc(q.type === 'B' ? t('colReason') : t('colAnswer'))}</th><th>${esc(t('colAi'))}</th><th>${esc(t('colTeacher'))}</th></tr></thead>
        <tbody>${rows.map((a) => rowHtml(q, a)).join('')}</tbody></table></div>
        <div class="row small muted"><span>${esc(t('thresholdNote', { n: Math.round(th * 100) }))}</span><span class="spacer"></span>${!d.session.released ? `<button class="btn ghost" id="resetAi" data-q="${esc(q.qid)}">${esc(t('resetAi'))}</button>` : ''}${d.session.state !== 'open' ? `<button class="btn" id="accAll" data-q="${esc(q.qid)}">${esc(t('acceptRest'))}</button>` : ''}</div>`;
    }
    function rowHtml(q, a) {
      const max = r2((q.points || {}).text), low = isLow(a);
      const choiceCell = q.type === 'B' ? `<td class="nowrap">${a.choice ? `<b>${esc(String(a.choice).toUpperCase())}</b> <span class="${a.choice === q.answer ? 'okc' : 'errc'}">${esc(a.choice === q.answer ? t('right') : t('wrong'))}</span>` : `<span class="soft">${esc(t('noChoice'))}</span>`}<div class="small soft">${r2(a.autoScore)} / ${r2((q.points || {}).choice)}</div></td>` : '';
      const ai = a.aiScore === null ? `<span class="soft">${esc(t('notGraded'))}</span>`
        : `${low ? `<span class="chip warn">${esc(t('lowConf', { n: Math.round(a.aiConfidence * 100) }))}</span><br>` : ''}<b style="font-size:18px">${r2(a.aiScore)}</b> <span class="soft">/ ${max}${!low ? ' · ' + esc(t('conf', { n: Math.round((a.aiConfidence || 0) * 100) })) : ''}</span><div class="small muted">${esc(a.aiReason || '')}</div>`;
      const cur = a.teacherScore !== null ? a.teacherScore : a.aiScore;
      const teacher = a.teacherScore !== null && !editing.has(a.aid)
        ? `<span class="chip ok">✓ ${esc(t('accepted', { n: r2(a.teacherScore) }))}</span> <button class="btn sm ghost" data-edit="${esc(a.aid)}">${esc(t('edit'))}</button>${a.teacherBy ? `<div class="small soft">${esc(t('confirmedBy', { who: a.teacherBy.split('@')[0], t: fmtDT(a.teacherAt) }))}</div>` : ''}`
        : `<div class="row" style="gap:6px;flex-wrap:nowrap"><input type="number" class="sc" data-sc="${esc(a.aid)}" min="0" max="${max}" step="0.5" value="${cur === null ? '' : r2(cur)}" aria-label="score"><span class="soft small">/ ${max}</span>
            <button class="btn sm ${a.aiScore !== null ? 'ok' : 'primary'}" data-acc="${esc(a.aid)}">${esc(a.teacherScore !== null || a.aiScore === null ? t('confirm') : t('accept'))}</button>
            ${a.teacherScore !== null ? `<button class="btn sm ghost" data-unc="${esc(a.aid)}">${esc(t('unconfirm'))}</button>` : ''}</div>`;
      return `<tr class="${low ? 'lowrow' : ''}" data-row="${esc(a.aid)}"><td class="small"><b>${esc(a.email.split('@')[0])}</b><div class="soft">@${esc(a.email.split('@')[1] || '')}</div></td>${choiceCell}
        <td class="ans">${a.text ? esc(a.text) : `<span class="soft">${esc(t('none'))}</span>`}</td><td style="min-width:200px">${ai}</td>
        <td style="min-width:220px">${teacher}
          <div style="margin-top:6px">${a.teacherComment ? `<div class="small note">💬 ${esc(a.teacherComment)}</div>` : ''}<button class="btn sm ghost" data-cm="${esc(a.aid)}">${esc(a.teacherComment ? t('editComment') : t('addComment'))}</button></div>
          <div class="cmbox" data-cmbox="${esc(a.aid)}" hidden><textarea rows="2" placeholder="${esc(t('commentPh'))}">${esc(a.teacherComment || '')}</textarea><button class="btn sm primary" data-cms="${esc(a.aid)}">${esc(t('save'))}</button></div></td></tr>`;
    }
    function overview() {
      const emails = [...new Set(d.attempts.map((a) => a.email))];
      return `<div class="card scroll-x"><table class="list"><thead><tr><th>${esc(t('colAgent'))}</th><th>${esc(t('colStatus'))}</th><th>${esc(t('colChoicePts'))}</th><th>${esc(t('colTextPts'))}</th><th>${esc(t('colTotal'))}</th><th>${esc(t('colUnconfirmed'))}</th></tr></thead><tbody>${
        emails.map((e) => {
          const at = d.attempts.find((a) => a.email === e), mine = d.answers.filter((a) => a.email === e);
          if (!at.submittedAt) return `<tr><td>${esc(e)}</td><td><span class="chip warn">${esc(t('notSubmitted'))}</span></td><td></td><td></td><td></td><td></td></tr>`;
          const ch = mine.reduce((s, a) => s + (a.autoScore || 0), 0), tx = mine.reduce((s, a) => s + (a.teacherScore !== null ? a.teacherScore : (a.aiScore || 0)), 0);
          const un = mine.filter((a) => { const q = d.questions.find((x) => x.qid === a.qid); return q && isText(q.type) && a.teacherScore === null; }).length;
          return `<tr><td>${esc(e)}</td><td><span class="chip ok">${esc(t('a_submitted'))}${at.autoSubmitted ? ' · ' + esc(t('autoSub')) : ''}</span></td><td>${r2(ch)}</td><td>${r2(tx)}</td><td><b>${r2(ch + tx)}</b> / 100</td><td>${un || ''}</td></tr>`;
        }).join('')}</tbody></table></div>`;
    }
    const editing = new Set();
    function draw() {
      const q = d.questions.find((x) => x.qid === tab);
      main.innerHTML = header() + (q ? qPanel(q) : overview());
      bind();
    }
    function patchAnswer(ans) { const i = d.answers.findIndex((a) => a.aid === ans.aid); if (i >= 0) d.answers[i] = ans; }
    async function setScore(aid, score, comment) {
      try {
        const payload = { sessionId: d.session.sessionId, aid };
        if (score !== undefined) payload.score = score;
        if (comment !== undefined) payload.comment = comment;
        const r = await api('t_setScore', payload);
        patchAnswer(r.answer); editing.delete(aid); draw();
      } catch (e) { toast(e.message, 4000); }
    }
    function bind() {
      $('#reload').onclick = () => viewGrading(d.session.sessionId);
      const cp = $('#cpg'); if (cp) cp.onclick = () => copyText(d.command);
      $$('[data-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; history.replaceState(null, '', '#/grading/' + d.session.sessionId + '?q=' + tab); draw(); }));
      const rel = $('#rel'); if (rel) rel.onclick = async () => {
        const un = textAnswers().filter((a) => a.teacherScore === null).length;
        if (!(await confirmBox(un ? t('releaseConfirm', { n: un }) : t('releaseConfirm0'), t('releaseBtn')))) return;
        try { await api('t_release', { sessionId: d.session.sessionId }); toast(t('released')); viewGrading(d.session.sessionId); } catch (e) { toast(e.message, 5000); }
      };
      const ur = $('#unrel'); if (ur) ur.onclick = async () => {
        if (!(await confirmBox(t('unreleaseConfirm'), t('unrelease'), t('cancel'), true))) return;
        try { await api('t_release', { sessionId: d.session.sessionId, release: false }); viewGrading(d.session.sessionId); } catch (e) { toast(e.message, 5000); }
      };
      $$('[data-acc]').forEach((b) => b.addEventListener('click', () => {
        const inp = $(`[data-sc="${b.dataset.acc}"]`), v = inp.value.trim();
        if (v === '' || isNaN(+v)) { inp.focus(); return; }
        setScore(b.dataset.acc, +v);
      }));
      $$('input.sc').forEach((inp) => inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $(`[data-acc="${inp.dataset.sc}"]`).click(); } }));
      $$('[data-unc]').forEach((b) => b.addEventListener('click', () => setScore(b.dataset.unc, null)));
      $$('[data-edit]').forEach((b) => b.addEventListener('click', () => { editing.add(b.dataset.edit); draw(); }));
      $$('[data-cm]').forEach((b) => b.addEventListener('click', () => { const box = $(`[data-cmbox="${b.dataset.cm}"]`); box.hidden = !box.hidden; if (!box.hidden) $('textarea', box).focus(); }));
      $$('[data-cms]').forEach((b) => b.addEventListener('click', () => setScore(b.dataset.cms, undefined, $('textarea', b.parentElement).value)));
      const ra = $('#resetAi'); if (ra) ra.onclick = async () => {
        if (!(await confirmBox(t('resetAiConfirm'), t('resetAi')))) return;
        try { const r = await api('t_resetAi', { sessionId: d.session.sessionId, qid: ra.dataset.q }); copyText(r.command); toast(t('resetAiDone', { n: r.cleared, cmd: r.command }), 6000); viewGrading(d.session.sessionId); } catch (e) { toast(e.message, 4000); }
      };
      const aa = $('#accAll'); if (aa) aa.onclick = async () => {
        try { const r = await api('t_acceptAll', { sessionId: d.session.sessionId, qid: aa.dataset.q }); r.answers.forEach(patchAnswer); toast(t('acceptedN', { n: r.accepted })); draw(); } catch (e) { toast(e.message, 4000); }
      };
    }
    draw();
    // 多位講師同時閱卷：其他人確認的分數即時更新（自己正在輸入時先不打擾，停手後再更新）
    if (DB().live && DB().live.grades) {
      let first = true, pend = false, timer = null;
      const refresh = async () => {
        if (editing.size || (document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName))) { pend = true; clearTimeout(timer); timer = setTimeout(refresh, 3000); return; }
        pend = false;
        try { d = await api('t_grading', { sessionId: d.session.sessionId }); if (location.hash.startsWith('#/grading/')) draw(); } catch (_) { /* 下次再試 */ }
      };
      liveOff = DB().live.grades(d.session.sessionId, () => { if (first) { first = false; return; } clearTimeout(timer); timer = setTimeout(refresh, 600); });
    }
  }

  // ───────── 專員：成績 ─────────
  async function resultScreen(main, id) {
    main.innerHTML = `<div class="empty-state"><span class="spin"></span></div>`;
    let r;
    try { r = await api('s_result', { sessionId: id }); } catch (e) { showError(e); return; }
    const bi = (v) => esc(L(v));
    main.innerHTML = `<div class="result">
      <div class="card pad"><div class="row"><span class="chip brand">${esc(t('resultsOut'))}</span></div>
        <h1 style="margin-top:8px">${esc(L(r.session.title))}</h1>
        <div class="scorebox"><div><div class="small soft">${esc(t('yourScore'))}</div><div class="score"><b>${r2(r.score)}</b><span> / ${r2(r.total)}</span></div></div>
          <div><div class="small soft">${esc(t('correctOf'))}</div><div class="big">${r.choiceOk} / ${r.choiceN}</div></div>
          <div><div class="small soft">${esc(t('textPts'))}</div><div class="big">${r2(r.textGot)} / ${r2(r.textMax)}</div></div>
          <div><div class="small soft">${esc(t('timeUsed'))}</div><div class="big">${esc(t('minShort', { n: Math.max(1, Math.round(r.timeUsed / 60000)) }))}</div></div></div>
        <div class="qdots">${r.all.map((x) => `<span class="qd ${x.got >= x.max - 1e-9 ? 'full' : x.got > 0 ? 'part' : 'zero'}" title="Q${x.seq}: ${r2(x.got)} / ${r2(x.max)}">${x.seq}</span>`).join('')}</div></div>
      <h2>${esc(r.review.length ? t('toReview', { n: r.review.length }) : t('allCorrect'))}</h2>
      ${r.review.map((x) => `<div class="card pad rv">
        <div class="row"><h2>${esc(t('question', { n: x.seq }))}</h2><span class="chip ${x.got > 0 ? 'warn' : ''}">${r2(x.got)} / ${r2(x.max)}</span>${x.point ? `<span class="soft small">${esc(t('keyPoint'))}：${bi(x.point)}</span>` : ''}</div>
        ${x.subs ? `<div class="small muted" style="margin:4px 0">${esc(t('grpOkN', { a: x.subOk, b: x.subN }))}</div><div class="grp">${x.subs.map((u, i) => `<div class="grp-sub"><div class="grp-q"><span class="grp-n">${i + 1}</span><b>${bi(u.text)}</b></div>
          <div class="rvgrid small"><span>${esc(t('grpMine'))}</span><span class="${u.ok ? 'okc' : 'errc'}">${u.mine ? bi(u.mine) : esc(t('noChoice'))} ${u.ok ? '✓' : '✕'}</span>${u.ok ? '' : `<span>${esc(t('grpKey'))}</span><span class="okc"><b>${u.correct ? bi(u.correct) : '—'}</b></span>`}</div></div>`).join('')}</div>` : ''}
        <div class="rvgrid">
          ${x.type !== 'C' && x.type !== 'G' ? `<span>${esc(t('yourAns'))}</span><span class="${x.choiceOk ? 'okc' : 'errc'}">${x.myChoice ? bi(x.myChoice) : esc(t('noChoice'))}</span>` : ''}
          ${x.type === 'B' ? `<span>${esc(t('yourReason2'))}</span><span>${esc(x.myText) || t('none')}</span>` : ''}
          ${x.type === 'C' ? `<span>${esc(t('yourText'))}</span><span>${esc(x.myText) || t('none')}</span>` : ''}
          ${x.correct ? `<span>${esc(t('correct2'))}</span><span class="okc"><b>${bi(x.correct)}</b></span>` : ''}
          ${x.modelAnswer ? `<span>${esc(t('modelAnswer3'))}</span><span>${bi(x.modelAnswer)}</span>` : ''}
          ${x.comment ? `<span>${esc(t('trainerNote'))}</span><span class="note">${esc(x.comment)}</span>` : ''}
          <span>${esc(t('explanation2'))}</span><span>${bi(x.explanation)}</span></div></div>`).join('')}
      <div><a href="#/">← ${esc(t('backHome'))}</a></div></div>`;
  }

  // ═════════════════════════ M6：成績、退回、補考 ═════════════════════════
  Object.assign(I18N.zh, {
    results: '歷史成績', bySession: '依測驗場次', byAgent: '依專員', avgScore: '平均分數', median: '中位數', highLow: '最高 / 最低', belowLine: '低於門檻 {n} 分',
    autoN: '自動交卷', peopleN: '{n} 人', qRates: '各題得分率', qRatesNote: 'A 題以答對率、B / C 題以得分率計算；低於 60% 以紅色標示。',
    colScore: '分數', colWrong: '錯題', needCoach: '需輔導', detail: '明細', exportCsv: '匯出 CSV', makeupForChecked: '為勾選者建立補考',
    showingN: '共 {n} 人 · 依分數由低到高', noResults: '還沒有已結束的測驗。', partial: '部分', makeupOf: '補考自 {id}',
    colTaken: '測驗次數', colAvg: '平均', colCoach: '需輔導次數', colLast: '最近一次', noAgents: '還沒有交卷紀錄。', history: '歷次成績',
    wrongPoints: '錯誤重點', notReleasedChip: '成績未公布',
    makeupTitle: '建立補考', makeupNote: '補考沿用原測驗的題目與配分，會建立一個新的測驗場次與連結。', create2: '建立補考', makeupDone: '補考 {id} 已建立',
    returnBtn: '退回', returnTitle: '退回 {email} 的作答？', returnNote: '原本的作答會另外保存但不再計分，專員可以在測驗開放期間重新作答。', returnReason: '原因（選填，例如網路中斷）', returnDone: '已退回',
    extend: '延長結束時間', extendTitle: '延長 {id} 的結束時間', newEnd: '新的結束時間', extendDone: '已延長', noneSel: '請先勾選專員',
    attemptDetail: '作答明細', choiceLabel: '選擇', textLabel: '文字', aiLabel: 'AI', teacherLabel: '講師', notAnswered: '未作答',
  });
  Object.assign(I18N.en, {
    results: 'Results History', bySession: 'By quiz', byAgent: 'By agent', avgScore: 'Average', median: 'Median', highLow: 'High / Low', belowLine: 'Below {n}',
    autoN: 'Auto-submitted', peopleN: '{n}', qRates: 'Score rate by question', qRatesNote: 'A: correct rate. B / C: share of points earned. Below 60% is shown in red.',
    colScore: 'Score', colWrong: 'Missed', needCoach: 'Needs coaching', detail: 'Details', exportCsv: 'Export CSV', makeupForChecked: 'Makeup for selected',
    showingN: '{n} people · lowest score first', noResults: 'No closed quizzes yet.', partial: 'partial', makeupOf: 'Makeup of {id}',
    colTaken: 'Quizzes', colAvg: 'Average', colCoach: 'Needs coaching', colLast: 'Latest', noAgents: 'No submissions yet.', history: 'History',
    wrongPoints: 'Missed points', notReleasedChip: 'Not released',
    makeupTitle: 'Create a makeup quiz', makeupNote: 'The makeup reuses the original questions and points, with a new session and link.', create2: 'Create makeup', makeupDone: 'Makeup {id} created',
    returnBtn: 'Return', returnTitle: 'Return the attempt of {email}?', returnNote: 'The original answers are kept on file but no longer count. The agent can answer again while the quiz is open.', returnReason: 'Reason (optional, e.g. connection lost)', returnDone: 'Returned',
    extend: 'Extend end time', extendTitle: 'Extend {id}', newEnd: 'New end time', extendDone: 'Extended', noneSel: 'Select agents first',
    attemptDetail: 'Answer details', choiceLabel: 'Choice', textLabel: 'Written', aiLabel: 'AI', teacherLabel: 'Trainer', notAnswered: 'Not answered',
  });
  const rateColor = (r) => (r === null ? 'var(--line2)' : r < 0.6 ? 'var(--err)' : r < 0.8 ? '#D97706' : 'var(--ok)');
  const wrongText = (w) => w.map((x) => 'Q' + String(x.seq).padStart(2, '0') + (x.partial ? `（${t('partial')}）` : '')).join('、');
  function downloadCsv(name, rows) {
    const csv = '﻿' + rows.map((r) => r.map((v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',')).join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  }

  async function viewResults() {
    const params = new URLSearchParams(location.hash.split('?')[1] || '');
    const tab = params.get('tab') === 'agent' ? 'agent' : 'session';
    const main = shell('results', `<div class="row"><h1>${esc(t('results'))}</h1></div>
      <div class="tabs"><a class="tab ${tab === 'session' ? 'on' : ''}" href="#/results">${esc(t('bySession'))}</a><a class="tab ${tab === 'agent' ? 'on' : ''}" href="#/results?tab=agent">${esc(t('byAgent'))}</a></div>
      <div class="card scroll-x" id="rl"><div class="empty-state"><span class="spin"></span></div></div>`);
    let d;
    try { d = await api('t_resultsIndex'); } catch (e) { showError(e, $('#rl')); return; }
    if (tab === 'session') {
      if (!d.sessions.length) { $('#rl').innerHTML = `<div class="empty-state">${esc(t('noResults'))}</div>`; return; }
      $('#rl').innerHTML = `<table class="list"><thead><tr><th>${esc(t('colSession'))}</th><th>${esc(t('colStatus'))}</th><th>${esc(t('colSubmitted'))}</th><th>${esc(t('avgScore'))}</th><th>${esc(t('belowLine', { n: d.coachLine }))}</th><th></th></tr></thead><tbody>${
        d.sessions.map((s) => `<tr class="click" data-open="${esc(s.sessionId)}"><td><b>${esc(s.sessionId)}</b> ${esc(L(s.title))}${s.parentSession ? `<div class="small soft">${esc(t('makeupOf', { id: s.parentSession }))}</div>` : ''}<div class="small soft">${esc(fmtDT(s.startAt))} – ${esc(fmtDT(s.endAt))}</div></td>
          <td>${sessChip(s.state)}</td><td class="small">${esc(t('submittedN', { a: s.submitted, b: s.assigned }))}</td><td><b>${s.avg === null ? t('none') : r2(s.avg)}</b></td>
          <td>${s.coaching ? `<span class="chip warn">${s.coaching}</span>` : '0'}</td><td style="text-align:right"><button class="btn sm">${esc(t('open'))}</button></td></tr>`).join('')}</tbody></table>`;
      $$('[data-open]', $('#rl')).forEach((r) => r.addEventListener('click', () => { location.hash = '#/results/' + r.dataset.open; }));
    } else {
      if (!d.agents.length) { $('#rl').innerHTML = `<div class="empty-state">${esc(t('noAgents'))}</div>`; return; }
      $('#rl').innerHTML = `<table class="list"><thead><tr><th>${esc(t('colAgent'))}</th><th>${esc(t('colTaken'))}</th><th>${esc(t('colAvg'))}</th><th>${esc(t('colCoach'))}</th><th>${esc(t('colLast'))}</th><th></th></tr></thead><tbody>${
        d.agents.map((a) => `<tr class="click" data-email="${esc(a.email)}"><td>${esc(a.email)}</td><td>${a.taken}</td><td><b>${r2(a.avg)}</b>${a.avg < d.coachLine ? ` <span class="chip warn">${esc(t('needCoach'))}</span>` : ''}</td>
          <td>${a.coaching || 0}</td><td class="small">${a.last ? `${esc(L(a.last.title))} · <b>${r2(a.last.score)}</b>` : ''}</td><td style="text-align:right"><button class="btn sm">${esc(t('history'))}</button></td></tr>`).join('')}</tbody></table>`;
      $$('[data-email]', $('#rl')).forEach((r) => r.addEventListener('click', () => { location.hash = '#/agent/' + encodeURIComponent(r.dataset.email); }));
    }
  }

  async function viewSessionResults(id) {
    const main = shell('results', `<div class="empty-state"><span class="spin"></span></div>`);
    let d;
    try { d = await api('t_results', { sessionId: id }); } catch (e) { showError(e); return; }
    const s = d.session, st = d.stats;
    const rows = d.rows.slice().sort((a, b) => (a.score === null ? -1 : b.score === null ? 1 : a.score - b.score));
    main.innerHTML = `<div class="row"><a href="#/results">← ${esc(t('results'))}</a><h1>${esc(s.sessionId)} ${esc(L(s.title))}</h1>${sessChip(s.state)}${s.parentSession ? `<span class="chip">${esc(t('makeupOf', { id: s.parentSession }))}</span>` : ''}<span class="spacer"></span>
        <button class="btn" id="csv">${esc(t('exportCsv'))}</button><button class="btn brand" id="mk">${esc(t('makeupForChecked'))}</button></div>
      ${s.released ? '' : `<div class="banner warn">${esc(t('notReleasedChip'))} · <a href="#/grading/${esc(s.sessionId)}">${esc(t('goGrading'))} →</a></div>`}
      <div class="stats five">
        <div class="card pad"><div class="small soft">${esc(t('avgScore'))}</div><div class="big">${st.avg === null ? t('none') : r2(st.avg)}</div></div>
        <div class="card pad"><div class="small soft">${esc(t('colSubmitted'))}</div><div class="big">${st.submitted} <span class="soft" style="font-size:16px">/ ${st.assigned}</span></div></div>
        <div class="card pad"><div class="small soft">${esc(t('belowLine', { n: d.coachLine }))}</div><div class="big" style="color:${st.coaching ? 'var(--err)' : 'inherit'}">${esc(t('peopleN', { n: st.coaching }))}</div></div>
        <div class="card pad"><div class="small soft">${esc(t('autoN'))}</div><div class="big">${esc(t('peopleN', { n: st.auto }))}</div></div>
        <div class="card pad"><div class="small soft">${esc(t('median'))} · ${esc(t('highLow'))}</div><div class="big">${st.median === null ? t('none') : r2(st.median)}</div><div class="small soft">${st.max === null ? '' : r2(st.max) + ' / ' + r2(st.min)}</div></div>
      </div>
      <div class="card pad"><h2>${esc(t('qRates'))}</h2>
        <div class="rates">${d.questions.map((q) => `<div class="rate" title="${esc(L(q.point))}"><div class="rbar"><i style="height:${q.rate === null ? 0 : Math.round(q.rate * 100)}%;background:${rateColor(q.rate)}"></i></div>
          <b>${q.rate === null ? t('none') : Math.round(q.rate * 100) + '%'}</b><span>Q${String(q.seq).padStart(2, '0')} ${esc(q.type)}</span></div>`).join('')}</div>
        <div class="small soft">${esc(t('qRatesNote'))}</div></div>
      <div class="card scroll-x"><table class="list"><thead><tr><th style="width:36px"><input type="checkbox" id="all" aria-label="select all"></th><th>${esc(t('colAgent'))}</th><th>${esc(t('colScore'))}</th><th>${esc(t('colWrong'))}</th><th>${esc(t('colSubmittedAt'))}</th><th></th></tr></thead><tbody>${
        rows.map((r) => `<tr><td><input type="checkbox" class="pick" value="${esc(r.email)}" ${r.status !== 'submitted' ? 'checked' : ''}></td><td>${esc(r.email)}</td>
          <td>${r.score === null ? attChip(r.status === 'not_started' && s.state !== 'open' ? { status: 'expired' } : r) : `<b style="font-size:18px">${r2(r.score)}</b>`}</td>
          <td class="small">${esc(wrongText(r.wrong)) || (r.score !== null ? '—' : '')}</td>
          <td class="small muted">${esc(fmtDT(r.submittedAt))}${r.autoSubmitted ? ' · ' + esc(t('autoSub')) : ''}</td>
          <td style="text-align:right;white-space:nowrap">${r.coaching ? `<span class="chip warn">${esc(t('needCoach'))}</span> ` : ''}${r.score !== null ? `<button class="btn sm" data-det="${esc(r.email)}">${esc(t('detail'))}</button>` : ''}</td></tr>`).join('')}</tbody></table>
        <div class="small soft" style="padding:10px 14px">${esc(t('showingN', { n: rows.length }))}</div></div>`;
    $('#all').addEventListener('change', (e) => $$('.pick').forEach((c) => { c.checked = e.target.checked; }));
    $$('[data-det]').forEach((b) => b.addEventListener('click', () => attemptModal(s.sessionId, b.dataset.det)));
    $('#csv').onclick = () => downloadCsv(`${s.sessionId}_results.csv`, [
      ['Email', 'Status', 'Score', 'Needs coaching', 'Missed', 'Started', 'Submitted', 'Auto-submitted'],
      ...rows.map((r) => [r.email, r.status, r.score ?? '', r.coaching ? 'Y' : '', wrongText(r.wrong), fmtDT(r.startedAt), fmtDT(r.submittedAt), r.autoSubmitted ? 'Y' : '']),
    ]);
    $('#mk').onclick = () => {
      const emails = $$('.pick:checked').map((c) => c.value);
      if (!emails.length) { toast(t('noneSel')); return; }
      makeupModal(s, emails);
    };
  }

  async function viewAgentHistory(email) {
    const main = shell('results', `<div class="empty-state"><span class="spin"></span></div>`);
    let d;
    try { d = await api('t_agentHistory', { email }); } catch (e) { showError(e); return; }
    main.innerHTML = `<div class="row"><a href="#/results?tab=agent">← ${esc(t('byAgent'))}</a><h1>${esc(d.email)}</h1></div>
      <div class="timeline">${d.items.map((it) => {
        const r = it.row, s = it.session;
        const pts = r && r.wrong ? [...new Set(r.wrong.map((w) => L(w.point)).filter(Boolean))] : [];
        return `<div class="card pad tl"><div class="row"><span class="small soft">${esc(fmtDT(s.startAt))}</span>${sessChip(s.state)}${s.parentSession ? `<span class="chip">${esc(t('makeupOf', { id: s.parentSession }))}</span>` : ''}</div>
          <div class="row" style="margin-top:4px"><h2>${esc(s.sessionId)} ${esc(L(s.title))}</h2><span class="spacer"></span>
            ${r && r.score !== null ? `<span class="tlscore ${r.coaching ? 'low' : ''}">${r2(r.score)}</span>` : attChip(r && r.status === 'not_started' && s.state !== 'open' ? { status: 'expired' } : (r || { status: 'not_started' }))}</div>
          ${pts.length ? `<div class="small" style="margin-top:6px"><span class="soft">${esc(t('wrongPoints'))}：</span>${pts.map((p) => `<span class="chip warn" style="margin:2px">${esc(p)}</span>`).join('')}</div>` : ''}
          ${r && r.score !== null ? `<div style="margin-top:8px"><button class="btn sm" data-det="${esc(s.sessionId)}">${esc(t('detail'))}</button> <a class="small" href="#/results/${esc(s.sessionId)}">${esc(t('bySession'))} →</a></div>` : ''}</div>`;
      }).join('')}</div>`;
    $$('[data-det]').forEach((b) => b.addEventListener('click', () => attemptModal(b.dataset.det, d.email)));
  }

  async function attemptModal(sid, email) {
    let d;
    try { d = await api('t_attemptDetail', { sessionId: sid, email }); } catch (e) { toast(e.message, 4000); return; }
    const body = d.questions.map((q) => {
      const a = d.answers.find((x) => x.qid === q.qid) || {};
      const p = q.points || {}, max = r2((p.choice || 0) + (p.text || 0));
      const ts = a.teacherScore != null ? a.teacherScore : a.aiScore;
      const got = r2((a.autoScore || 0) + (ts || 0));
      const opt = (id) => { const o = (q.options || []).find((x) => x.id === id); return o ? String(o.id).toUpperCase() + '. ' + L(o.text) : ''; };
      return `<div class="adq"><div class="row"><b>Q${String(q.seq).padStart(2, '0')} ${esc(q.type)}</b><span class="chip ${got >= max - 1e-9 ? 'ok' : got > 0 ? 'warn' : ''}">${got} / ${max}</span><span class="small soft">${esc(L(q.point))}</span></div>
        ${q.type === 'G' ? `<div class="small muted">${esc(t('grpOkN', { a: a.subOk || 0, b: a.subN || (q.group || []).length }))}</div>${groupHtml(q, 'result', a.subs || {})}` : ''}
        <div class="rvgrid small">
          ${q.type !== 'C' && q.type !== 'G' ? `<span>${esc(t('choiceLabel'))}</span><span class="${a.choice === q.answer ? 'okc' : 'errc'}">${esc(opt(a.choice) || t('notAnswered'))}${a.choice !== q.answer ? ` → ${esc(opt(q.answer))}` : ''}</span>` : ''}
          ${isText(q.type) ? `<span>${esc(t('textLabel'))}</span><span>${esc(a.text || t('notAnswered'))}</span>` : ''}
          ${isText(q.type) && a.aiScore != null ? `<span>${esc(t('aiLabel'))}</span><span>${r2(a.aiScore)} · ${esc(a.aiReason || '')}</span>` : ''}
          ${a.teacherScore != null || a.teacherComment ? `<span>${esc(t('teacherLabel'))}</span><span>${a.teacherScore != null ? r2(a.teacherScore) : ''} ${a.teacherComment ? '· ' + esc(a.teacherComment) : ''}</span>` : ''}
        </div></div>`;
    }).join('');
    await modal(`<div class="row"><h2>${esc(t('attemptDetail'))}</h2><span class="soft small">${esc(d.email)} · ${esc(L(d.session.title))}</span><span class="spacer"></span><button class="btn sm" data-close="">✕</button></div>${body}`, { wide: true });
  }

  function makeupModal(s, emails, done) {
    const start = new Date(); start.setMinutes(Math.ceil(start.getMinutes() / 5) * 5, 0, 0);
    const end = new Date(start.getTime() + 2 * 86400000); end.setHours(18, 0, 0, 0);
    return modal(`<h2>${esc(t('makeupTitle'))} · ${esc(s.sessionId)}</h2><div class="small muted">${esc(t('makeupNote'))}</div>
      <div class="form" style="grid-template-columns:120px 1fr">
        <label class="k">${esc(t('startAt'))}</label><input type="datetime-local" id="mk_s" value="${toLocalInput(start)}">
        <label class="k">${esc(t('endAt'))}</label><input type="datetime-local" id="mk_e" value="${toLocalInput(end)}">
        <label class="k">${esc(t('minutes'))}</label><input type="number" id="mk_m" min="1" max="300" value="${esc(s.minutes)}">
        <label class="k">${esc(t('assignees'))}</label><textarea id="mk_list" rows="5" style="width:100%;border:1px solid var(--line2);border-radius:8px;padding:8px">${esc(emails.join('\n'))}</textarea>
      </div><div id="mk_err" class="banner err" hidden></div>
      <div class="row" style="justify-content:flex-end"><button class="btn" data-close="">${esc(t('cancel'))}</button><button class="btn brand" id="mk_go">${esc(t('create2'))}</button></div>`,
    { onMount: (el, close) => {
      $('#mk_go', el).onclick = async () => {
        $('#mk_go', el).disabled = true;
        try {
          const r = await api('t_createMakeup', { sessionId: s.sessionId, assignees: parseEmails($('#mk_list', el).value).ok,
            startAt: new Date($('#mk_s', el).value).getTime(), endAt: new Date($('#mk_e', el).value).getTime(), minutes: +$('#mk_m', el).value });
          close('ok'); toast(t('makeupDone', { id: r.sessionId })); location.hash = '#/session/' + r.sessionId;
        } catch (e) { const er = $('#mk_err', el); er.textContent = e.message; er.hidden = false; $('#mk_go', el).disabled = false; }
      };
    } });
  }
  function extendModal(s, done) {
    const def = new Date(Math.max(Date.now(), s.endAt) + 86400000);
    return modal(`<h2>${esc(t('extendTitle', { id: s.sessionId }))}</h2>
      <div class="form" style="grid-template-columns:140px 1fr"><label class="k">${esc(t('newEnd'))}</label><input type="datetime-local" id="ex_e" value="${toLocalInput(def)}"></div>
      <div id="ex_err" class="banner err" hidden></div>
      <div class="row" style="justify-content:flex-end"><button class="btn" data-close="">${esc(t('cancel'))}</button><button class="btn primary" id="ex_go">${esc(t('extend'))}</button></div>`,
    { onMount: (el, close) => {
      $('#ex_go', el).onclick = async () => {
        try { await api('t_extendSession', { sessionId: s.sessionId, endAt: new Date($('#ex_e', el).value).getTime() }); close('ok'); toast(t('extendDone')); done && done(); }
        catch (e) { const er = $('#ex_err', el); er.textContent = e.message; er.hidden = false; }
      };
    } });
  }
  function returnModal(s, email, done) {
    return modal(`<h2>${esc(t('returnTitle', { email }))}</h2><div class="small muted">${esc(t('returnNote'))}</div>
      <input type="text" id="rt_r" placeholder="${esc(t('returnReason'))}" style="height:38px;border:1px solid var(--line2);border-radius:8px;padding:0 10px">
      <div class="row" style="justify-content:flex-end"><button class="btn" data-close="">${esc(t('cancel'))}</button><button class="btn brand" id="rt_go">${esc(t('returnBtn'))}</button></div>`,
    { onMount: (el, close) => {
      $('#rt_go', el).onclick = async () => {
        try { const r = await api('t_returnAttempt', { sessionId: s.sessionId, email, reason: $('#rt_r', el).value }); close('ok'); toast(t('returnDone') + (r.hint ? '：' + r.hint : ''), r.hint ? 7000 : 2600); done && done(); }
        catch (e) { toast(e.message, 4000); }
      };
    } });
  }

  // ═════════════════════════ 題庫 ═════════════════════════
  Object.assign(I18N.zh, {
    navBank: '可用題庫', bank: '可用題庫', delDraft: '刪除草稿', st_deleted: '已刪除', delDraftDone: '草稿 {id} 已刪除',
    delDraftAll: '刪除草稿 {id}？題目都已入庫，題庫與已發佈的測驗不受影響。', delDraftSome: '刪除草稿 {id}？還有 {n} 題尚未入庫，會一併移除（草稿紀錄仍保留）。',
    deletedNote: '這份草稿已刪除，只能檢視。', st_banked: '已入庫', addToBank: '加入題庫（{n} 題）', bankedAs: '已入庫為 {id}', bankAdded: '已加入題庫：{ids}',
    bankedNote: '這題已入庫為 {id}，之後請到題庫修改（草稿不再影響題庫）。', goBank: '前往題庫',
    bankEmpty: '題庫還沒有題目。到草稿頁校對完成後按「加入題庫」。', allTypes: '全部題型', allTags: '全部標籤', allStatus: '全部狀態', active: '啟用中', retired: '已停用',
    onlyOutdated: '只看需重新確認', searchPh: '搜尋題號、判斷重點…', colQid: '題號', colType: '題型', colPoint: '判斷重點', colTags: '標籤', colCriteria: '標準', colUsed: '使用', colRate: '平均得分率', colSource: '來源',
    usedN: '{n} 次', outdated: '需重新確認', bankTotal: '啟用中 {n} 題 · A {a} · B {b} · C {c}', retire: '停用', activate: '重新啟用', retiredDone: '已停用', activatedDone: '已啟用',
    bankStats: '使用 {u} 次 · 作答 {n} 筆 · 平均得分率 {r} · {s} 人做過', usedIn: '用過的測驗', version: '版本 v{n}', outdatedNote: '判斷標準已更新為 {v}，請確認這題是否仍正確；儲存後會標記為符合 {v}。',
    // 組卷
    compose: '組卷', composeHint: '先填受測者，再依題型配比自動抽題，可以換題、移除或手動加題。', prefTags: '偏好標籤', avoidSeen: '避開受測者做過的題目',
    autoPick: '自動抽題', manualAdd: '從題庫手動加題', pickedN: '已選 {n} 題 · A {a} · B {b} · C {c}', pickedNG: '已選 {n} 題（題組 {g}）', swap: '換一題', remove: '移除', seenByN: '{n} 人做過',
    shortageMsg: '題庫中符合條件的 {type} 題不夠，少 {n} 題（可用 {fresh} 題，含做過的共 {total} 題）。可以取消「避開做過的題目」，或建立新草稿補題。',
    bankDel: '刪除', bankDelSel: '刪除選取的 {n} 題', bankDelConfirm: '刪除 {ids}？刪除後無法復原。{used}',
    bankDelUsed: '其中 {n} 題用在已發佈的測驗：測驗的試卷與成績不受影響（試卷是發佈當下的副本）。', bankDelDone: '已刪除 {n} 題',
    noPick: '請先抽題或手動加題', addSelected: '加入選取的題目', noMore: '沒有可替換的題目', recheckSeen: '名單已變更，已重新計算做過的人數。',
  });
  Object.assign(I18N.en, {
    navBank: 'Bank', bank: 'Question Bank', delDraft: 'Delete draft', st_deleted: 'Deleted', delDraftDone: 'Draft {id} deleted',
    delDraftAll: 'Delete draft {id}? All questions are in the bank; the bank and published quizzes are not affected.', delDraftSome: 'Delete draft {id}? {n} question(s) are not in the bank and will be removed (the draft record is kept).',
    deletedNote: 'This draft was deleted and is read-only.', st_banked: 'In bank', addToBank: 'Add to bank ({n})', bankedAs: 'In bank as {id}', bankAdded: 'Added to bank: {ids}',
    bankedNote: 'This question is in the bank as {id}. Edit it in the bank from now on (the draft no longer affects it).', goBank: 'Open in bank',
    bankEmpty: 'The bank is empty. Review a draft and click "Add to bank".', allTypes: 'All types', allTags: 'All tags', allStatus: 'All statuses', active: 'Active', retired: 'Retired',
    onlyOutdated: 'Needs re-check only', searchPh: 'Search ID or key point…', colQid: 'ID', colType: 'Type', colPoint: 'Key point', colTags: 'Tags', colCriteria: 'Criteria', colUsed: 'Used', colRate: 'Avg rate', colSource: 'Source',
    usedN: '{n}×', outdated: 'Re-check', bankTotal: '{n} active · A {a} · B {b} · C {c}', retire: 'Retire', activate: 'Activate', retiredDone: 'Retired', activatedDone: 'Activated',
    bankStats: 'Used {u}× · {n} answers · avg rate {r} · taken by {s}', usedIn: 'Used in', version: 'v{n}', outdatedNote: 'The criteria are now {v}. Check this question still holds; saving marks it as {v}.',
    compose: 'Build the quiz', composeHint: 'Enter the assignees, then auto-pick by type mix. Swap, remove or add questions by hand.', prefTags: 'Preferred tags', avoidSeen: 'Avoid questions assignees have taken',
    autoPick: 'Auto-pick', manualAdd: 'Add from bank', pickedN: '{n} picked · A {a} · B {b} · C {c}', pickedNG: '{n} picked (question sets {g})', swap: 'Swap', remove: 'Remove', seenByN: 'taken by {n}',
    shortageMsg: 'Not enough type {type} questions: {n} short ({fresh} available, {total} including taken). Turn off "avoid taken" or create a new draft.',
    bankDel: 'Delete', bankDelSel: 'Delete {n} selected', bankDelConfirm: 'Delete {ids}? This cannot be undone. {used}',
    bankDelUsed: '{n} of them were used in published quizzes; those quizzes and results are not affected (each quiz keeps its own copy).', bankDelDone: '{n} deleted',
    noPick: 'Pick or add questions first', addSelected: 'Add selected', noMore: 'No other question available', recheckSeen: 'Assignees changed; recalculated who has taken each question.',
  });
  const rateTxt = (r) => (r === null || r === undefined ? '—' : Math.round(r * 100) + '%');
  const rateChip = (r) => (r === null || r === undefined ? '<span class="soft">—</span>' : `<span style="color:${rateColor(r)};font-weight:700">${rateTxt(r)}</span>`);

  async function viewBank() {
    const main = shell('bank', `<div class="row"><h1>${esc(t('bank'))}</h1><span class="spacer"></span><span class="small muted" id="bt"></span>${me.can.bankQ ? `<button class="btn ghost danger" id="bdel" hidden></button>` : ''}</div>
      <div class="card pad filters" id="bf"></div><div class="card scroll-x" id="bl"><div class="empty-state"><span class="spin"></span></div></div>`);
    let d;
    try { d = await api('t_bankList', {}); } catch (e) { showError(e, $('#bl')); return; }
    const act = d.questions.filter((q) => q.status === 'active');
    $('#bt').textContent = t('bankTotal', { n: act.length, a: act.filter((q) => q.type === 'A').length, b: act.filter((q) => q.type === 'B').length, c: act.filter((q) => q.type === 'C').length });
    const f = { type: '', tag: '', status: 'active', outdated: false, q: '' };
    $('#bf').innerHTML = `<select id="f_type"><option value="">${esc(t('allTypes'))}</option><option>A</option><option>B</option><option>C</option></select>
      <select id="f_tag"><option value="">${esc(t('allTags'))}</option>${d.tags.map((x) => `<option value="${esc(x.tagId)}">${esc(L(x.name))}</option>`).join('')}</select>
      <select id="f_status"><option value="active">${esc(t('active'))}</option><option value="retired">${esc(t('retired'))}</option><option value="">${esc(t('allStatus'))}</option></select>
      <label class="small"><input type="checkbox" id="f_out"> ${esc(t('onlyOutdated'))}</label>
      <input type="search" id="f_q" placeholder="${esc(t('searchPh'))}">`;
    const tagName = (id) => L((d.tags.concat(d.inactiveTags || []).find((x) => x.tagId === id) || {}).name) || id;
    function draw() {
      const q = f.q.toLowerCase();
      const list = d.questions.filter((x) => (!f.type || x.type === f.type) && (!f.tag || x.tags.includes(f.tag)) && (!f.status || x.status === f.status) && (!f.outdated || x.outdated)
        && (!q || x.qid.toLowerCase().includes(q) || (L(x.point) || '').toLowerCase().includes(q) || (x.point && (x.point.zh || '').includes(f.q))));
      if (!d.questions.length) { $('#bl').innerHTML = `<div class="empty-state">${esc(t('bankEmpty'))}</div>`; return; }
      const canDel = !!me.can.bankQ;
      $('#bl').innerHTML = `<table class="list"><thead><tr>${canDel ? `<th style="width:28px"><input type="checkbox" id="ball"></th>` : ''}<th>${esc(t('colQid'))}</th><th>${esc(t('colType'))}</th><th>${esc(t('correctAns'))}</th><th>${esc(t('colPoint'))}</th><th class="hide-sm">${esc(t('colTags'))}</th><th>${esc(t('colCriteria'))}</th><th>${esc(t('colUsed'))}</th><th>${esc(t('colRate'))}</th><th class="hide-sm">${esc(t('colSource'))}</th></tr></thead><tbody>${
        list.map((x) => `<tr class="click ${x.status === 'retired' ? 'dim' : ''}" data-q="${esc(x.qid)}">${canDel ? `<td data-nc><input type="checkbox" data-sel="${esc(x.qid)}" ${sel.has(x.qid) ? 'checked' : ''}></td>` : ''}<td><b>${esc(x.qid)}</b>${x.status === 'retired' ? ` <span class="chip">${esc(t('retired'))}</span>` : ''}</td><td><span class="chip">${esc(x.type)}</span></td>
          <td class="small">${x.answer ? esc(L(x.answer)) : '<span class="soft">—</span>'}</td><td>${esc(L(x.point))}</td>
          <td class="hide-sm small soft">${x.tags.map((g) => esc(tagName(g))).join('、')}</td>
          <td class="small">${esc(x.criteriaVersion)}${x.outdated ? ` <span class="chip warn">${esc(t('outdated'))}</span>` : ''}</td>
          <td class="small">${esc(t('usedN', { n: x.used }))}</td><td>${rateChip(x.avgRate)}</td><td class="hide-sm small soft">${esc(x.sourceQid || '')}</td></tr>`).join('')}</tbody></table>`;
      $$('[data-q]', $('#bl')).forEach((r) => r.addEventListener('click', (e) => { if (e.target.closest('[data-nc]')) return; location.hash = '#/bank/' + r.dataset.q; }));
      $$('[data-sel]', $('#bl')).forEach((c) => c.addEventListener('change', () => { if (c.checked) sel.add(c.dataset.sel); else sel.delete(c.dataset.sel); delBtn(); }));
      const all = $('#ball'); if (all) { all.checked = list.length > 0 && list.every((x) => sel.has(x.qid)); all.onchange = () => { list.forEach((x) => (all.checked ? sel.add(x.qid) : sel.delete(x.qid))); draw(); delBtn(); }; }
    }
    const sel = new Set();
    const delBtn = () => { const b = $('#bdel'); if (!b) return; b.hidden = !sel.size; b.textContent = t('bankDelSel', { n: sel.size }); };
    const bd = $('#bdel'); if (bd) bd.onclick = async () => {
      const ids = [...sel].sort(), used = ids.filter((q) => (d.questions.find((x) => x.qid === q) || {}).used).length;
      if (!(await confirmBox(t('bankDelConfirm', { ids: ids.join('、'), used: used ? t('bankDelUsed', { n: used }) : '' }), t('bankDel'), t('cancel'), true))) return;
      try { await api('tw_bankDelete', { qids: ids }); toast(t('bankDelDone', { n: ids.length })); viewBank(); } catch (e) { toast(e.message, 5000); }
    };
    $('#f_type').onchange = (e) => { f.type = e.target.value; draw(); };
    $('#f_tag').onchange = (e) => { f.tag = e.target.value; draw(); };
    $('#f_status').onchange = (e) => { f.status = e.target.value; draw(); };
    $('#f_out').onchange = (e) => { f.outdated = e.target.checked; draw(); };
    $('#f_q').oninput = (e) => { f.q = e.target.value.trim(); draw(); };
    draw();
  }

  async function viewBankItem(qid) {
    const main = shell('bank', `<div class="empty-state"><span class="spin"></span></div>`);
    let d;
    try { d = await api('t_bankGet', { qid }); } catch (e) { showError(e); return; }
    let work = clone(d.question), dirty = false;
    leaveGuard = () => !dirty || window.confirm(t('unsaved'));
    function bi(key, label, short) {
      const v = work[key] || {};
      return `<h4>${esc(label)}</h4><div class="bi"><div><div class="lab">中文</div><textarea class="${short ? 'short' : ''}" data-f="${key}" data-l="zh">${esc(v.zh || '')}</textarea></div>
        <div><div class="lab">English</div><textarea class="${short ? 'short' : ''}" data-f="${key}" data-l="en">${esc(v.en || '')}</textarea></div></div>`;
    }
    function draw() {
      const i = d.info, q = work, { left, req } = caseHtml(q);
      const opts = (q.options || []).map((o) => `<button type="button" class="opt ${o.id === q.answer ? 'correct' : ''}" data-ans="${esc(o.id)}"><b>${esc(o.id)}.</b> ${esc(L(o.text))}<span class="hint">${o.id === q.answer ? '✓ ' + esc(t('correct')) : esc(t('setAnswer'))}</span></button>`).join('');
      main.innerHTML = `<div class="row"><a href="#/bank">← ${esc(t('bank'))}</a><h1>${esc(i.qid)}</h1><span class="chip">Type ${esc(i.type)}</span>
          ${i.status === 'retired' ? `<span class="chip">${esc(t('retired'))}</span>` : `<span class="chip ok">${esc(t('active'))}</span>`}<span class="chip">${esc(t('version', { n: i.version }))} · ${esc(i.criteriaVersion)}</span>
          <span class="spacer"></span>${me.can.bankQ ? `<button class="btn ghost danger" id="bdel1">${esc(t('bankDel'))}</button>` : ''}<button class="btn" id="st">${esc(i.status === 'retired' ? t('activate') : t('retire'))}</button></div>
        <div class="small muted">${esc(t('bankStats', { u: i.used, n: i.answered, r: rateTxt(i.avgRate), s: i.seenTotal }))}${i.sourceQid ? ` · ${esc(t('colSource'))} <a href="#/draft/${esc(i.sourceDraft)}?q=${esc(i.sourceQid)}">${esc(i.sourceQid)}</a>` : ''}
          ${d.sessions.length ? ` · ${esc(t('usedIn'))}：${d.sessions.map((s) => `<a href="#/results/${esc(s.sessionId)}">${esc(s.sessionId)}</a>`).join('、')}` : ''}</div>
        ${i.outdated ? `<div class="banner warn">${esc(t('outdatedNote', { v: (d.currentVersion || '') }))}</div>` : ''}
        <div class="card detail">
          <div class="qbody"><div>${left}</div><div>${req}
            ${opts ? `<h4>${esc(t('options'))} <span class="soft">· ${esc(t('answerHint'))}</span></h4>${opts}` : ''}
            ${q.type === 'G' ? `<h4>${esc(t('grpTitle', { n: (q.group || []).length }))} <span class="soft">· ${esc(t('grpKeyHint'))}</span></h4>${groupHtml(q, 'key')}` : ''}
            ${bi('point', t('point'), true)}${q.type === 'B' || q.type === 'C' ? bi('modelAnswer', t('modelAnswer')) + bi('rubric', t('rubric')) : ''}${bi('explanation', t('explanation'))}
          </div></div>
          <div id="saveErr" class="banner err" style="border-radius:0" hidden></div>
          <div class="dfoot"><button class="btn sm" id="json">${esc(t('editJson'))}</button><span class="spacer"></span><span class="small soft" id="dm">${dirty ? '●' : ''}</span>
            <button class="btn primary" id="save" ${dirty ? '' : 'disabled'}>${esc(t('save'))}</button></div></div>`;
      bind();
    }
    function setDirty() { dirty = true; $('#save').disabled = false; $('#dm').textContent = '●'; }
    function bind() {
      $$('[data-ans]').forEach((b) => b.addEventListener('click', () => { work.answer = b.dataset.ans; dirty = true; draw(); }));
      bindGroupKey(main, work, () => { dirty = true; draw(); });
      $$('textarea[data-f]').forEach((ta) => ta.addEventListener('input', () => { work[ta.dataset.f] = Object.assign({}, work[ta.dataset.f], { [ta.dataset.l]: ta.value }); setDirty(); }));
      $('#save').onclick = async () => {
        $('#save').disabled = true; $('#saveErr').hidden = true;
        try { d = await api('t_bankUpdate', { qid: d.info.qid, question: work }); work = clone(d.question); dirty = false; toast(t('saved')); draw(); }
        catch (e) { $('#saveErr').textContent = e.message; $('#saveErr').hidden = false; $('#save').disabled = false; }
      };
      const b1 = $('#bdel1'); if (b1) b1.onclick = async () => {
        if (!(await confirmBox(t('bankDelConfirm', { ids: d.info.qid, used: d.info.used ? t('bankDelUsed', { n: 1 }) : '' }), t('bankDel'), t('cancel'), true))) return;
        try { await api('tw_bankDelete', { qids: [d.info.qid] }); dirty = false; leaveGuard = null; toast(t('bankDelDone', { n: 1 })); location.hash = '#/bank'; } catch (e) { toast(e.message, 5000); }
      };
      $('#st').onclick = async () => {
        const to = d.info.status === 'retired' ? 'active' : 'retired';
        try { await api('t_bankSetStatus', { qid: d.info.qid, status: to }); d.info.status = to; toast(to === 'retired' ? t('retiredDone') : t('activatedDone')); draw(); } catch (e) { toast(e.message, 4000); }
      };
      $('#json').onclick = () => {
        const raw = clone(work); delete raw.id;
        modal(`<h2>${esc(t('editJson'))} · ${esc(d.info.qid)}</h2><textarea class="json" spellcheck="false">${esc(JSON.stringify(raw, null, 2))}</textarea><div id="jerr" class="banner err" hidden></div>
          <div class="row" style="justify-content:flex-end"><button class="btn" data-close="">${esc(t('cancel'))}</button><button class="btn primary" id="japply">${esc(t('apply'))}</button></div>`,
        { wide: true, onMount: (el, close) => { $('#japply', el).onclick = () => { try { work = JSON.parse($('textarea', el).value); dirty = true; close('ok'); draw(); } catch (e) { const j = $('#jerr', el); j.textContent = t('jsonBad') + e.message; j.hidden = false; } }; } });
      };
    }
    draw();
  }

  /** 發佈測驗：從題庫組卷 */
  async function composeForm(box, onDone) {
    box.innerHTML = `<div class="card pad"><span class="spin"></span></div>`;
    let meta;
    try { meta = await api('t_bankList', {}); } catch (e) { showError(e, box); return; }
    if (!meta.questions.some((q) => q.status === 'active')) { box.innerHTML = `<div class="banner warn">${esc(t('bankEmpty'))}</div>`; return; }
    let picked = [], lastPick = null;
    const start = new Date(); start.setMinutes(Math.ceil(start.getMinutes() / 5) * 5, 0, 0);
    const end = new Date(start.getTime() + 2 * 86400000); end.setHours(18, 0, 0, 0);
    box.innerHTML = `<form class="card pad" id="sform" style="display:flex;flex-direction:column;gap:16px"><h2>${esc(t('newSession'))}</h2>
      <div class="form">
        <label class="k" for="s_emails">${esc(t('assignees'))}</label><div><textarea id="s_emails" rows="5" style="width:min(520px,100%);border:1px solid var(--line2);border-radius:8px;padding:8px 10px" placeholder="maria.santos@shopeemobile-external.com&#10;juan.reyes@shopeemobile-external.com"></textarea><div class="small" id="s_cnt"></div></div>
      </div>
      <div class="compose"><div class="row"><h2>${esc(t('compose'))}</h2><span class="small muted">${esc(t('composeHint'))}</span></div>
        <div class="form">
          <label class="k">${esc(t('topic'))}</label><select id="c_topic">${meta.topics.map((x) => `<option value="${esc(x.topicId)}">${esc(L(x.name))}</option>`).join('')}</select>
          <span class="k">${esc(t('prefTags'))}</span><div class="tags" id="c_tags"></div>
          <span class="k">${esc(t('mix'))}</span><div class="row">
            <span class="row" id="c_abc"><label class="small">${esc(t('typeA'))} <input type="number" id="c_A" min="0" max="50" value="3"></label>
            <label class="small">${esc(t('typeB'))} <input type="number" id="c_B" min="0" max="50" value="5"></label>
            <label class="small">${esc(t('typeC'))} <input type="number" id="c_C" min="0" max="50" value="2"></label></span>
            <label class="small" id="c_Gl" hidden>${esc(t('typeG'))} <input type="number" id="c_G" min="0" max="50" value="10"></label></div>
          <span class="k"></span><label class="small"><input type="checkbox" id="c_avoid" checked> ${esc(t('avoidSeen'))}</label>
        </div>
        <div class="row"><button type="button" class="btn primary" id="c_pick">${esc(t('autoPick'))}</button><button type="button" class="btn" id="c_add">${esc(t('manualAdd'))}</button><span class="small" id="c_sum"></span></div>
        <div id="c_short"></div><div id="c_list"></div></div>
      <div class="form">
        <label class="k" for="s_tzh">${esc(t('titleZh'))}</label><input type="text" id="s_tzh" maxlength="80" required>
        <label class="k" for="s_ten">${esc(t('titleEn'))}</label><input type="text" id="s_ten" maxlength="80" required placeholder="e.g. Agreement Check — Wrong Item Sent">
        <label class="k" for="s_start">${esc(t('startAt'))}</label><div><input type="datetime-local" id="s_start" value="${toLocalInput(start)}" required></div>
        <label class="k" for="s_end">${esc(t('endAt'))}</label><div><input type="datetime-local" id="s_end" value="${toLocalInput(end)}" required><div class="small soft">${esc(t('tz'))}</div></div>
        <label class="k" for="s_min">${esc(t('minutes'))}</label><div><input type="number" id="s_min" min="1" max="300" value="30" required></div>
      </div>
      <div id="s_err" class="banner err" hidden></div>
      <div class="row"><button type="submit" class="btn brand" id="s_go">${esc(t('publish'))}</button><button type="button" class="btn" id="s_cancel">${esc(t('cancel'))}</button></div></form>`;
    const tagName = (id) => L((meta.tags.concat(meta.inactiveTags || []).find((x) => x.tagId === id) || {}).name) || id;
    const drawTags = () => { const tid = $('#c_topic').value; $('#c_tags').innerHTML = meta.tags.filter((x) => x.topicId === tid).map((x) => `<label class="tag-opt"><input type="checkbox" value="${esc(x.tagId)}"> ${esc(L(x.name))}</label>`).join('');
      $$('#c_tags input').forEach((c) => c.addEventListener('change', () => c.parentElement.classList.toggle('on', c.checked))); };
    const cGroup = () => { const x = meta.topics.find((y) => y.topicId === $('#c_topic').value); return !!(x && x.group); };
    const drawMix = () => { const g = cGroup(); $('#c_abc').hidden = g; $('#c_Gl').hidden = !g; };
    drawTags(); drawMix(); $('#c_topic').onchange = () => { drawTags(); drawMix(); };
    const emails = () => parseEmails($('#s_emails').value);
    const opts = (extra) => Object.assign({ topicId: $('#c_topic').value, tags: $$('#c_tags input:checked').map((c) => c.value), assignees: emails().ok, avoidSeen: $('#c_avoid').checked }, extra);
    function drawList() {
      const cnt = { A: 0, B: 0, C: 0, G: 0 }; picked.forEach((q) => { cnt[q.type] = (cnt[q.type] || 0) + 1; });
      $('#c_sum').innerHTML = picked.length ? `<span class="chip ok">${esc(cnt.G ? t('pickedNG', { n: picked.length, g: cnt.G }) : t('pickedN', { n: picked.length, a: cnt.A, b: cnt.B, c: cnt.C }))}</span>` : '';
      $('#c_list').innerHTML = picked.length ? `<div class="scroll-x"><table class="list"><thead><tr><th>#</th><th>${esc(t('colQid'))}</th><th>${esc(t('colType'))}</th><th>${esc(t('colPoint'))}</th><th class="hide-sm">${esc(t('colTags'))}</th><th>${esc(t('colUsed'))}</th><th>${esc(t('colRate'))}</th><th></th></tr></thead><tbody>${
        picked.map((q, i) => `<tr><td class="soft">${i + 1}</td><td><a href="#/bank/${esc(q.qid)}" target="_blank" rel="noopener"><b>${esc(q.qid)}</b></a></td><td><span class="chip">${esc(q.type)}</span></td><td>${esc(L(q.point))}${q.seenBy ? ` <span class="chip warn">${esc(t('seenByN', { n: q.seenBy }))}</span>` : ''}</td>
          <td class="hide-sm small soft">${q.tags.map((g) => esc(tagName(g))).join('、')}</td><td class="small">${esc(t('usedN', { n: q.used }))}</td><td>${rateChip(q.avgRate)}</td>
          <td style="text-align:right;white-space:nowrap"><button type="button" class="btn sm" data-swap="${i}">${esc(t('swap'))}</button> <button type="button" class="btn sm ghost danger" data-rm="${i}">${esc(t('remove'))}</button></td></tr>`).join('')}</tbody></table></div>` : '';
      $$('[data-rm]').forEach((b) => b.addEventListener('click', () => { picked.splice(+b.dataset.rm, 1); drawList(); }));
      $$('[data-swap]').forEach((b) => b.addEventListener('click', async () => {
        const i = +b.dataset.swap, q = picked[i];
        try {
          const r = await api('t_bankPick', opts({ mix: { [q.type]: 1 }, exclude: picked.map((x) => x.qid) }));
          if (!r.picked.length) { toast(t('noMore')); return; }
          picked[i] = r.picked[0]; drawList();
        } catch (e) { toast(e.message, 4000); }
      }));
    }
    function shortageHtml(r) {
      return Object.keys(r.shortage || {}).map((k) => `<div class="banner warn">${esc(t('shortageMsg', { type: k, n: r.shortage[k], fresh: r.available[k].fresh, total: r.available[k].total }))}</div>`).join('');
    }
    $('#c_pick').onclick = async () => {
      const mix = cGroup() ? { G: +$('#c_G').value || 0 } : { A: +$('#c_A').value || 0, B: +$('#c_B').value || 0, C: +$('#c_C').value || 0 };
      try { const r = await api('t_bankPick', opts({ mix })); lastPick = r; picked = r.picked; $('#c_short').innerHTML = shortageHtml(r); drawList(); } catch (e) { toast(e.message, 4000); }
    };
    $('#c_add').onclick = async () => {
      let all;
      try { all = (await api('t_bankList', { assignees: emails().ok })).questions.filter((q) => q.status === 'active' && q.topicId === $('#c_topic').value && !picked.some((p) => p.qid === q.qid)); } catch (e) { toast(e.message, 4000); return; }
      modal(`<h2>${esc(t('manualAdd'))}</h2><div class="scroll-x" style="max-height:60vh;overflow:auto"><table class="list"><thead><tr><th></th><th>${esc(t('colQid'))}</th><th>${esc(t('colType'))}</th><th>${esc(t('colPoint'))}</th><th>${esc(t('colUsed'))}</th><th>${esc(t('colRate'))}</th></tr></thead><tbody>${
        all.map((q) => `<tr><td><input type="checkbox" value="${esc(q.qid)}"></td><td><b>${esc(q.qid)}</b></td><td><span class="chip">${esc(q.type)}</span></td><td>${esc(L(q.point))}${q.outdated ? ` <span class="chip warn">${esc(t('outdated'))}</span>` : ''}${q.seenBy ? ` <span class="chip warn">${esc(t('seenByN', { n: q.seenBy }))}</span>` : ''}</td><td class="small">${esc(t('usedN', { n: q.used }))}</td><td>${rateChip(q.avgRate)}</td></tr>`).join('')}</tbody></table></div>
        <div class="row" style="justify-content:flex-end"><button class="btn" data-close="">${esc(t('cancel'))}</button><button class="btn primary" id="m_add">${esc(t('addSelected'))}</button></div>`,
      { wide: true, onMount: (el, close) => { $('#m_add', el).onclick = () => { const ids = $$('input:checked', el).map((c) => c.value); picked = picked.concat(all.filter((q) => ids.includes(q.qid))); close('ok'); drawList(); }; } });
    };
    let recheck;
    const cnt = () => {
      const r = emails();
      $('#s_cnt').innerHTML = `<span class="chip ${r.bad.length ? 'warn' : r.ok.length ? 'ok' : ''}">${esc(t('validN', { a: r.ok.length, b: r.bad.length }))}</span>${r.bad.length ? ' <span class="small" style="color:var(--err)">' + r.bad.slice(0, 5).map(esc).join(', ') + '</span>' : ''}`;
      clearTimeout(recheck);
      if (picked.length) recheck = setTimeout(async () => {
        try { const L2 = (await api('t_bankList', { assignees: r.ok })).questions; picked = picked.map((p) => L2.find((x) => x.qid === p.qid) || p); drawList(); toast(t('recheckSeen')); } catch (_) { /* */ }
      }, 900);
    };
    $('#s_emails').addEventListener('input', cnt); cnt();
    $('#s_cancel').onclick = () => { box.innerHTML = ''; };
    $('#sform').addEventListener('submit', async (e) => {
      e.preventDefault();
      const er = $('#s_err'); er.hidden = true;
      const r = emails();
      if (!picked.length) { er.textContent = t('noPick'); er.hidden = false; return; }
      if (!r.ok.length || r.bad.length) { er.textContent = t('validN', { a: r.ok.length, b: r.bad.length }); er.hidden = false; return; }
      const btn = $('#s_go'); btn.disabled = true;
      try {
        const res = await api('t_createSession', { qids: picked.map((q) => q.qid), titleZh: $('#s_tzh').value.trim(), titleEn: $('#s_ten').value.trim(),
          startAt: new Date($('#s_start').value).getTime(), endAt: new Date($('#s_end').value).getTime(), minutes: +$('#s_min').value, assignees: r.ok });
        onDone(res);
      } catch (err) { er.textContent = err.message; er.hidden = false; btn.disabled = false; }
    });
  }

  /** 刪除草稿；unbanked=null 時先查詢還有幾題未入庫 */
  async function deleteDraft(id, unbanked, after) {
    let n = unbanked;
    if (n === null) { try { n = (await api('t_getDraft', { draftId: id })).questions.filter((q) => !q.bankedAs).length; } catch (e) { toast(e.message, 4000); return; } }
    if (!(await confirmBox(n ? t('delDraftSome', { id, n }) : t('delDraftAll', { id }), t('delDraft'), t('cancel'), true))) return;
    try { await api('t_deleteDraft', { draftId: id }); toast(t('delDraftDone', { id })); after && after(); } catch (e) { toast(e.message, 4000); }
  }

  // ═════════════════════════ 範例庫（M2，僅 TW 講師） ═════════════════════════
  Object.assign(I18N.zh, {
    library: '範例生成', libPending: '待審範例', libActive: '範例庫', libRequests: '範例申請', reqTitle: '申請範例', reqHint: '貼上 DMS 的 Return ID（一次最多 30 筆）。排程會自動抓取、去識別化並由 AI 建議分類，完成後出現在「待審範例」。',
    cutoffHelp: '每行一筆：Return ID，後面接判斷時點（台北時間，例如 2026-10-20 14:30，通常是案件判決前）。只保留這個時間「以前」的聊聊、DRC、物流，該分鐘內的訊息也會移除；同一分鐘內要保留較早的訊息時，可以填到秒（例如 14:30:20）。',
    noCutoff: '沒有填時間的案件不截斷（使用完整資料）', noCutoffShort: '不截斷', cutoffAtLabel: '判斷時點 {t} 以前', cutoffCount: '{n} 筆，{c} 筆有判斷時點', cutoffMissing: '{n} 筆沒有時間', cutoffBad: '無法解析的行',
    returnIds: 'Return ID', wantedTags: '預期分類（選填）', reqNote: '說明（選填）', reqNotePh: '例如：賣家只回 OK 貼圖', submitReq: '送出申請', reqAdded: '已送出 {n} 筆申請', reqDup: '已申請過而略過：{ids}',
    r_queued: '等待中', r_processing: '處理中', r_done: '已完成', r_failed: '失敗', r_cancelled: '已取消', r_deleted: '範例已刪除', retry: '重試',
    delSample: '刪除範例', delSampleNote: '刪除後無法復原。範例和它的申請紀錄會一起刪除，之後同一個 Return ID 可以重新申請。',
    delRequeue: '刪除後重新申請', delRequeueHint: '會用同樣的主題、預期分類與說明建立新申請，排程下次執行時重新抓取。', delNoRid: '這個範例沒有對應的申請（例如初始資料），刪除後無法自動重新申請。',
    delNeedCut: '請填判斷時點，或勾選「不截斷」', delDone: '已刪除 {id}', delRequeued: '已刪除 {id}，並建立新申請 {r}', colReq: '申請', colRid: 'Return ID', colBy: '申請人', colSample: '範例',
    libTopicTags: '主題與標籤', libTag: '標籤', libAll: '全部範例', libAllInTopic: '全部', libUntagged: '未分類', libSearchPh: '搜尋範例代碼、判斷重點、標籤…', libCount: '{n} / {all} 筆', libNoMatch: '沒有符合條件的範例。',
    addTagTitle: '新增標籤', tagNameZh: '中文名稱', tagNameZhPh: '例如：賣家反悔', tagNameEn: '英文名稱', tagNameEnPh: 'e.g. Seller changed mind', tagDesc: '說明（選填）', tagDescPh: '給 AI 參考的判斷說明，例如：賣家先同意後又改口', tagHint: '新標籤會立即出現在申請、範例審核與草稿的標籤選項中，AI 出題與分類也會參考。', add: '新增', tagNeedNames: '請填寫中文與英文名稱', tagAdded: '已新增標籤「{name}」',
    editTagTitle: '編輯標籤', editTagHint: '修改名稱或說明不會影響已使用這個標籤的範例與題目，所有地方會直接顯示新名稱。', tagSaved: '已儲存標籤「{name}」', tagInactive: '已停用',
    tagDisable: '停用標籤', tagEnable: '重新啟用', tagDisableConfirm: '停用「{name}」？停用後不會出現在申請、審核、草稿與抽題的標籤選項中，AI 也不會再使用；已標記的範例與題目會保留這個標籤，之後可以重新啟用。', tagDisabled: '已停用「{name}」', tagEnabled: '已重新啟用「{name}」',
    stuckHint: '處理中超過 15 分鐘，可能是排程中斷，按重試重新排入', reqDelHint: '已完成的申請連著範例，要移除請到範例頁「刪除範例」。', reqDelAll: '刪除所有失敗、已取消、範例已刪除的申請（{n} 筆）', reqDelConfirm: '刪除申請紀錄 {ids}？刪除後無法復原，同一個 Return ID 之後可以重新申請。', reqDelDone: '已刪除 {n} 筆申請',
    ridCleared: '（已清除）', noReq: '還沒有申請紀錄。', noPending: '目前沒有待審範例。', noActive: '範例庫還沒有範例。',
    sm_pending: '待審', sm_active: '已核准', sm_rejected: '已退回', sm_inactive: '已停用', colSampleId: '範例', colAnswer2: '正解', colStatus2: '狀態',
    aiSuggest: 'AI 建議', yourExpect: '申請時的預期', diffWarn: 'AI 建議的分類與申請時的預期不同，請特別確認。', applyAi: '套用 AI 建議',
    answer: '正解', agreedYes: '已達成協議', agreedNo: '未達成協議', changeHint: '變化提示（給 AI 出題時參考）', changeHintPh: '例如：可以換商品與數量，但保留賣家只用貼圖回應的關鍵',
    approve: '核准', reject: '退回', deactivate: '停用', reactivate: '重新啟用', rejectReason: '原因（選填）', approved: '已核准，AI 出題時會使用這個範例', rejected: '已退回', deactivated: '已停用',
    tagsNeeded: '請至少選一個標籤', reviewOnlyTw: '範例庫僅開放 TW 講師',
  });
  Object.assign(I18N.en, {
    library: 'Sample Builder', libPending: 'Pending review', libActive: 'Library', libRequests: 'Requests', reqTitle: 'Request samples', reqHint: 'Paste DMS Return IDs (up to 30). The scheduler fetches, de-identifies and AI-classifies them; results appear under "Pending review".',
    cutoffHelp: 'One per line: Return ID followed by the cutoff (Taipei time, e.g. 2026-10-20 14:30, usually just before the case was judged). Only chat, DRC and logistics before this time are kept, so messages within that minute are removed too; add seconds (e.g. 14:30:20) to keep earlier messages in the same minute.',
    noCutoff: 'Use the full data for lines without a time (no cutoff)', noCutoffShort: 'No cutoff', cutoffAtLabel: 'Up to {t}', cutoffCount: '{n} case(s), {c} with a cutoff', cutoffMissing: '{n} without a time', cutoffBad: 'Could not read',
    returnIds: 'Return IDs', wantedTags: 'Expected tags (optional)', reqNote: 'Note (optional)', reqNotePh: 'e.g. the seller only replied with an OK sticker', submitReq: 'Submit', reqAdded: '{n} request(s) submitted', reqDup: 'Skipped (already requested): {ids}',
    r_queued: 'Queued', r_processing: 'Processing', r_done: 'Done', r_failed: 'Failed', r_cancelled: 'Cancelled', r_deleted: 'Sample deleted', retry: 'Retry',
    delSample: 'Delete sample', delSampleNote: 'This cannot be undone. The sample and its request record are both removed, so the same Return ID can be requested again.',
    delRequeue: 'Request again after deleting', delRequeueHint: 'Creates a new request with the same topic, expected tags and note; the scheduler fetches it again on its next run.', delNoRid: 'This sample has no request (e.g. seed data), so it cannot be requested again automatically.',
    delNeedCut: 'Enter a cutoff or choose No cutoff', delDone: '{id} deleted', delRequeued: '{id} deleted; new request {r} created', colReq: 'Request', colRid: 'Return ID', colBy: 'Requested by', colSample: 'Sample',
    libTopicTags: 'Topics & tags', libTag: 'Tag', libAll: 'All samples', libAllInTopic: 'All', libUntagged: 'Untagged', libSearchPh: 'Search sample ID, key point, tag…', libCount: '{n} / {all}', libNoMatch: 'No matching samples.',
    addTagTitle: 'Add tag', tagNameZh: 'Chinese name', tagNameZhPh: '例如：賣家反悔', tagNameEn: 'English name', tagNameEnPh: 'e.g. Seller changed mind', tagDesc: 'Description (optional)', tagDescPh: 'Guidance for the AI, e.g. the seller agreed and then changed their mind', tagHint: 'The new tag appears right away in requests, sample review and drafts, and the AI uses it when generating and classifying.', add: 'Add', tagNeedNames: 'Enter both the Chinese and English names', tagAdded: 'Tag "{name}" added',
    editTagTitle: 'Edit tag', editTagHint: 'Renaming or changing the description does not affect samples or questions that use this tag; the new name shows everywhere.', tagSaved: 'Tag "{name}" saved', tagInactive: 'Disabled',
    tagDisable: 'Disable tag', tagEnable: 'Enable again', tagDisableConfirm: 'Disable "{name}"? It will no longer appear in tag options for requests, review, drafts or quiz picking, and the AI will stop using it. Samples and questions keep the tag, and you can enable it again later.', tagDisabled: '"{name}" disabled', tagEnabled: '"{name}" enabled again',
    stuckHint: 'Processing for over 15 minutes; the scheduler may have stopped. Retry to queue it again.', reqDelHint: 'Done requests are linked to a sample; delete the sample to remove them.', reqDelAll: 'Delete all failed, cancelled and sample-deleted ({n})', reqDelConfirm: 'Delete request record(s) {ids}? This cannot be undone; the Return ID can be requested again later.', reqDelDone: '{n} request(s) deleted',
    ridCleared: '(cleared)', noReq: 'No requests yet.', noPending: 'Nothing to review.', noActive: 'The library is empty.',
    sm_pending: 'Pending', sm_active: 'Approved', sm_rejected: 'Rejected', sm_inactive: 'Inactive', colSampleId: 'Sample', colAnswer2: 'Answer', colStatus2: 'Status',
    aiSuggest: 'AI suggestion', yourExpect: 'Expected at request', diffWarn: 'The AI suggestion differs from what was expected. Please check carefully.', applyAi: 'Apply AI suggestion',
    answer: 'Answer', agreedYes: 'Agreement reached', agreedNo: 'No agreement', changeHint: 'Variation hint (for AI question generation)', changeHintPh: 'e.g. change the product and quantity, but keep the seller replying only with a sticker',
    approve: 'Approve', reject: 'Reject', deactivate: 'Deactivate', reactivate: 'Reactivate', rejectReason: 'Reason (optional)', approved: 'Approved; AI generation will use this sample', rejected: 'Rejected', deactivated: 'Deactivated',
    tagsNeeded: 'Pick at least one tag', reviewOnlyTw: 'Only TW trainers can use the sample library',
  });
  const reqChip = (s) => `<span class="chip ${s === 'done' ? 'ok' : s === 'failed' ? 'warn' : s === 'processing' || s === 'queued' ? 'info' : ''}">${esc(t('r_' + s))}</span>`;
  const smChip = (s) => `<span class="chip ${s === 'active' ? 'ok' : s === 'pending' ? 'info' : 'warn'}">${esc(t('sm_' + s))}</span>`;
  let libMeta = null;
  async function getLibMeta() { if (!libMeta) { libMeta = await api('t_topics'); dmsRules = libMeta.dms || dmsRules; } return libMeta; }
  const libFilter = { topic: '', tag: '', q: '' };
  /** 新增標籤（TW 講師）：回傳新標籤或 null */
  function addTagDialog(meta, topicId, tag) {
    const edit = !!tag, inactive = edit && !!tag.inactive;
    return modal(`<h2>${esc(t(edit ? 'editTagTitle' : 'addTagTitle'))}${inactive ? ` <span class="chip warn">${esc(t('tagInactive'))}</span>` : ''}</h2>
      <form id="tf" class="form" style="margin-top:12px">
        <label class="k" for="tg_topic">${esc(t('topic'))}</label><select id="tg_topic" ${edit ? 'disabled' : ''}>${meta.topics.map((x) => `<option value="${esc(x.topicId)}" ${x.topicId === (edit ? tag.topicId : topicId) ? 'selected' : ''}>${esc(L(x.name))}</option>`).join('')}</select>
        <label class="k" for="tg_zh">${esc(t('tagNameZh'))}</label><input id="tg_zh" maxlength="20" required placeholder="${esc(t('tagNameZhPh'))}" value="${edit ? esc(tag.name.zh) : ''}">
        <label class="k" for="tg_en">${esc(t('tagNameEn'))}</label><input id="tg_en" maxlength="40" required placeholder="${esc(t('tagNameEnPh'))}" value="${edit ? esc(tag.name.en) : ''}">
        <label class="k" for="tg_desc">${esc(t('tagDesc'))}</label><textarea id="tg_desc" rows="2" maxlength="200" placeholder="${esc(t('tagDescPh'))}" style="border:1px solid var(--line2);border-radius:8px;padding:8px">${edit ? esc(tag.desc || '') : ''}</textarea>
      </form>
      <div class="small muted" style="margin-top:8px">${esc(t(edit ? 'editTagHint' : 'tagHint'))}</div>
      <div class="row" style="margin-top:12px">${edit ? `<button class="btn ${inactive ? '' : 'danger'}" id="tg_act" type="button">${esc(t(inactive ? 'tagEnable' : 'tagDisable'))}</button>` : ''}<span class="spacer"></span><button class="btn" data-close="">${esc(t('cancel'))}</button><button class="btn brand" id="tg_ok" type="button">${esc(t(edit ? 'save' : 'add'))}</button></div>`,
    { onMount: (el, close) => {
      $('#tg_zh', el).focus();
      const go = async () => {
        const zh = $('#tg_zh', el).value.trim(), en = $('#tg_en', el).value.trim();
        if (!zh || !en) { toast(t('tagNeedNames'), 3000); return; }
        const btn = $('#tg_ok', el); btn.disabled = true;
        try {
          const r = edit ? await api('tw_updateTag', { tagId: tag.tagId, nameZh: zh, nameEn: en, descZh: $('#tg_desc', el).value.trim() })
            : await api('tw_addTag', { topicId: $('#tg_topic', el).value, nameZh: zh, nameEn: en, descZh: $('#tg_desc', el).value.trim() });
          toast(t(edit ? 'tagSaved' : 'tagAdded', { name: zh })); close(r.tag);
        } catch (e) { toast(e.message, 4000); btn.disabled = false; }
      };
      $('#tg_ok', el).onclick = go;
      if (edit) $('#tg_act', el).onclick = async () => {
        if (!inactive && !(await confirmBox(t('tagDisableConfirm', { name: tag.name.zh }), t('tagDisable'), t('cancel'), true))) return;
        try { const r = await api('tw_updateTag', { tagId: tag.tagId, active: inactive }); toast(t(inactive ? 'tagEnabled' : 'tagDisabled', { name: tag.name.zh })); close(r.tag); }
        catch (e) { toast(e.message, 4000); }
      };
      $('#tf', el).addEventListener('submit', (e) => { e.preventDefault(); go(); });
    } });
  }

  async function viewLibrary() {
    if (me.role !== 'tw') { shell('library', `<div class="banner warn">${esc(t('reviewOnlyTw'))}</div>`); return; }
    const params = new URLSearchParams(location.hash.split('?')[1] || '');
    const tab = ['pending', 'active', 'requests'].includes(params.get('tab')) ? params.get('tab') : 'pending';
    const main = shell('library', `<div class="row"><h1>${esc(t('library'))}</h1><span class="spacer"></span><button class="btn" id="reload">${esc(t('refresh'))}</button></div>
      <div class="tabs"><a class="tab ${tab === 'pending' ? 'on' : ''}" href="#/library">${esc(t('libPending'))} <span id="pn"></span></a><a class="tab ${tab === 'active' ? 'on' : ''}" href="#/library?tab=active">${esc(t('libActive'))}</a><a class="tab ${tab === 'requests' ? 'on' : ''}" href="#/library?tab=requests">${esc(t('libRequests'))}</a></div>
      <div id="lb"><div class="empty-state"><span class="spin"></span></div></div>`);
    $('#reload').onclick = () => viewLibrary();
    if (liveOff) { liveOff(); liveOff = null; }
    let meta, d;
    try { [meta, d] = await Promise.all([getLibMeta(), tab === 'requests' ? api('tw_listRequests') : api('tw_listSamples')]); } catch (e) { showError(e, $('#lb')); return; }
    const tagName = (id) => L((meta.tags.concat(meta.inactiveTags || []).find((x) => x.tagId === id) || {}).name) || id;
    if (tab !== 'requests') {
      const pend = d.samples.filter((s) => s.status === 'pending');
      $('#pn').textContent = pend.length ? `(${pend.length})` : '';
      const all = tab === 'pending' ? pend : d.samples.filter((s) => s.status !== 'pending');
      // 範例索引有變動（例如排程送來新的待審範例）就自動重新整理；正在搜尋輸入時不打斷
      const liveSamples = (cur) => {
        if (!DB() || !DB().live) return;
        let last = JSON.stringify(cur);
        liveOff = DB().live.sampleIndex((rows) => {
          const j = JSON.stringify(rows); if (j === last) return; last = j;
          if (!/^#\/library(\?|$)/.test(location.hash)) return;
          if (document.activeElement && document.activeElement.id === 'lq') return;
          viewLibrary();
        });
      };
      if (!all.length) { $('#lb').innerHTML = `<div class="card empty-state">${esc(t(tab === 'pending' ? 'noPending' : 'noActive'))}</div>`; liveSamples(d.samples); return; }
      const f = libFilter;                        // 篩選條件在切換分頁 / 重新整理時保留
      $('#lb').innerHTML = `<div class="lib-grid"><aside class="card lib-side" id="ls"></aside>
        <div class="lib-main"><div class="lib-search"><input id="lq" type="search" placeholder="${esc(t('libSearchPh'))}" value="${esc(f.q)}" aria-label="${esc(t('libSearchPh'))}"><span class="small muted" id="lc"></span></div><div id="ll"></div></div></div>`;
      const inScope = (s) => !f.topic || s.topicId === f.topic;
      const drawSide = () => {
        $('#ls').innerHTML = `<div class="lib-side-hd"><b>${esc(t('libTopicTags'))}</b><button class="btn sm" id="addTag" type="button">＋ ${esc(t('libTag'))}</button></div>
          <button type="button" class="lib-row ${!f.topic ? 'on' : ''}" data-topic="" data-tag=""><span>${esc(t('libAll'))}</span><span class="n">${all.length}</span></button>
          ${meta.topics.map((tp) => {
            const mine = all.filter((s) => (s.topicId || 'agreement') === tp.topicId);
            const tags = meta.tags.filter((x) => x.topicId === tp.topicId);
            const untagged = mine.filter((s) => !s.tags.length).length;
            const off = (meta.inactiveTags || []).filter((x) => x.topicId === tp.topicId);
            const row = (tag, label, n, editable, dim) => `<div class="lib-item ${dim ? 'off' : ''}"><button type="button" class="lib-row ${f.topic === tp.topicId && f.tag === tag ? 'on' : ''}" data-topic="${esc(tp.topicId)}" data-tag="${esc(tag)}"><span>${esc(label)}</span><span class="n">${n}</span></button>${editable ? `<button type="button" class="lib-edit" data-edit="${esc(tag)}" title="${esc(t('editTagTitle'))}" aria-label="${esc(t('editTagTitle'))}：${esc(label)}">✎</button>` : ''}</div>`;
            return `<div class="lib-grp">${esc(L(tp.name))}</div>${row('', t('libAllInTopic'), mine.length)}
              ${tags.map((x) => row(x.tagId, L(x.name), mine.filter((s) => s.tags.includes(x.tagId)).length, true)).join('')}
              ${untagged ? row('-', t('libUntagged'), untagged) : ''}
              ${off.length ? `<div class="lib-sub">${esc(t('tagInactive'))}</div>` + off.map((x) => row(x.tagId, L(x.name), mine.filter((s) => s.tags.includes(x.tagId)).length, true, true)).join('') : ''}`;
          }).join('')}`;
        $$('#ls [data-topic]').forEach((b) => b.addEventListener('click', () => { f.topic = b.dataset.topic; f.tag = b.dataset.tag; drawSide(); drawList(); }));
        $$('#ls [data-edit]').forEach((b) => b.addEventListener('click', () => {
          const tg = meta.tags.find((x) => x.tagId === b.dataset.edit) || Object.assign({ inactive: true }, (meta.inactiveTags || []).find((x) => x.tagId === b.dataset.edit));
          addTagDialog(meta, tg.topicId, tg).then((r) => { if (r) { libMeta = null; topicsCache = null; viewLibrary(); } });
        }));
        $('#addTag').onclick = () => addTagDialog(meta, f.topic || (meta.topics[0] || {}).topicId).then((tg) => { if (tg) { libMeta = null; topicsCache = null; f.topic = tg.topicId; f.tag = tg.tagId; viewLibrary(); } });
      };
      const drawList = () => {
        const q = f.q.trim().toLowerCase();
        const list = all.filter((s) => inScope(s)
          && (!f.tag || (f.tag === '-' ? !s.tags.length : s.tags.includes(f.tag)))
          && (!q || [s.sampleId, s.pointZh, s.answer, s.changeHint, s.requestedBy, s.approvedBy, ...s.tags.map(tagName)].join(' ').toLowerCase().includes(q)));
        $('#lc').textContent = t('libCount', { n: list.length, all: all.length });
        if (!list.length) { $('#ll').innerHTML = `<div class="card empty-state">${esc(t('libNoMatch'))}</div>`; return; }
        $('#ll').innerHTML = `<div class="card scroll-x"><table class="list"><thead><tr><th>${esc(t('colSampleId'))}</th><th>${esc(t('colPoint'))}</th><th>${esc(t('colAnswer2'))}</th><th>${esc(t('colTags'))}</th>${tab === 'pending' ? `<th>${esc(t('yourExpect'))}</th>` : ''}<th>${esc(t('colStatus2'))}</th><th class="hide-sm">${esc(t('colBy'))}</th></tr></thead><tbody>${
          list.map((s) => {
            const diff = tab === 'pending' && s.wantedTags && s.wantedTags.length && !s.wantedTags.every((x) => s.tags.includes(x));
            return `<tr class="click" data-s="${esc(s.sampleId)}"><td><b>${esc(s.sampleId)}</b>${s.source === 'seed' ? ' <span class="chip">seed</span>' : ''}</td><td>${esc(s.pointZh)}</td><td class="small">${esc(s.answer)}</td>
              <td class="small">${s.tags.map((x) => `<span class="chip" style="margin:1px">${esc(tagName(x))}</span>`).join('')}</td>
              ${tab === 'pending' ? `<td class="small">${(s.wantedTags || []).map((x) => esc(tagName(x))).join('、')}${diff ? ' <span class="chip warn">≠</span>' : ''}</td>` : ''}
              <td>${smChip(s.status)}</td><td class="hide-sm small muted">${esc(s.requestedBy || s.approvedBy || '')}</td></tr>`;
          }).join('')}</tbody></table></div>`;
        $$('#ll [data-s]').forEach((r) => r.addEventListener('click', () => { location.hash = '#/library/' + r.dataset.s; }));
      };
      $('#lq').addEventListener('input', (e) => { f.q = e.target.value; drawList(); });
      drawSide(); drawList();
      liveSamples(d.samples);
      return;
    }
    // 申請
    const topicOpts = meta.topics.filter((x) => x.active).map((x) => `<option value="${esc(x.topicId)}">${esc(L(x.name))}</option>`).join('');
    $('#lb').innerHTML = `<form class="card pad" id="rf" style="display:flex;flex-direction:column;gap:14px"><h2>${esc(t('reqTitle'))}</h2><div class="small muted">${esc(t('reqHint'))}</div>
        <div class="form">
          <label class="k" for="r_ids">${esc(t('returnIds'))}</label><div><textarea id="r_ids" rows="5" class="mono" style="width:min(520px,100%);border:1px solid var(--line2);border-radius:8px;padding:8px" placeholder="246771802264043  2026-10-20 14:30&#10;2510150001234567  2026-10-18 09:05"></textarea>
            <div class="small muted" style="margin-top:4px;max-width:520px">${esc(t('cutoffHelp'))}</div>
            <label class="small" style="display:flex;gap:6px;align-items:center;margin-top:6px"><input type="checkbox" id="r_nocut"> ${esc(t('noCutoff'))}</label>
            <div id="r_prev" class="small" style="margin-top:6px"></div></div>
          <label class="k" for="r_topic">${esc(t('topic'))}</label><select id="r_topic">${topicOpts}</select>
          <span class="k">${esc(t('wantedTags'))}</span><div class="tags" id="r_tags"></div>
          <label class="k" for="r_note">${esc(t('reqNote'))}</label><input type="text" id="r_note" maxlength="200" placeholder="${esc(t('reqNotePh'))}">
        </div><div id="r_err" class="banner err" hidden></div>
        <div class="row"><button class="btn brand" type="submit" id="r_go">${esc(t('submitReq'))}</button></div></form>
      <div class="card scroll-x" id="rl"></div>`;
    const drawTags = () => { $('#r_tags').innerHTML = meta.tags.filter((x) => x.topicId === $('#r_topic').value).map((x) => `<label class="tag-opt"><input type="checkbox" value="${esc(x.tagId)}"> ${esc(L(x.name))}</label>`).join('');
      $$('#r_tags input').forEach((c) => c.addEventListener('change', () => c.parentElement.classList.toggle('on', c.checked))); };
    drawTags(); $('#r_topic').onchange = drawTags;
    /** 解析申請清單：每行「Return ID [日期 時間]」，時間為台北時間 */
    const parseReq = (txt) => {
      const items = [], bad = [];
      String(txt || '').split(/\n/).map((x) => x.trim()).filter(Boolean).forEach((line) => {
        const m = /^(\d{6,20})(?:[\s,;\t]+(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})[\sT]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?\s*$/.exec(line);
        if (!m) { bad.push(line); return; }
        let at = null;
        if (m[2]) {
          const p2 = (n) => String(n).padStart(2, '0');
          at = Date.parse(`${m[2]}-${p2(m[3])}-${p2(m[4])}T${p2(m[5])}:${m[6]}:${m[7] || '00'}+08:00`);
          if (!Number.isFinite(at)) { bad.push(line); return; }
        }
        items.push({ returnId: m[1], cutoffAt: at });
      });
      return { items, bad };
    };
    const fmtTW = (ms) => { const x = new Date(ms + 8 * 3600e3).toISOString().replace('T', ' '); return x.slice(17, 19) === '00' ? x.slice(0, 16) : x.slice(0, 19); };
    const preview = () => {
      const { items, bad } = parseReq($('#r_ids').value);
      const noT = items.filter((x) => x.cutoffAt === null).length;
      $('#r_prev').innerHTML = !items.length && !bad.length ? '' : `${items.length ? `<span class="chip">${esc(t('cutoffCount', { n: items.length, c: items.length - noT }))}</span>` : ''}
        ${noT ? ` <span class="chip ${$('#r_nocut').checked ? '' : 'warn'}">${esc(t('cutoffMissing', { n: noT }))}</span>` : ''}${bad.length ? `<div style="color:var(--err);margin-top:4px">${esc(t('cutoffBad'))}：${bad.map(esc).join('、')}</div>` : ''}`;
    };
    $('#r_ids').addEventListener('input', preview); $('#r_nocut').addEventListener('change', preview);
    function drawReqs(reqs) {
      if (!reqs.length) { $('#rl').innerHTML = `<div class="empty-state">${esc(t('noReq'))}</div>`; return; }
      $('#rl').innerHTML = `<table class="list"><thead><tr><th>${esc(t('colReq'))}</th><th>${esc(t('colRid'))}</th><th>${esc(t('colStatus2'))}</th><th>${esc(t('colWantedNote'))}</th><th class="hide-sm">${esc(t('colBy'))}</th><th>${esc(t('colSample'))}</th><th></th></tr></thead><tbody>${
        reqs.map((r) => `<tr><td><b>${esc(r.requestId)}</b><div class="small soft">${esc(fmtDT(r.requestedAt))}</div></td><td class="mono small">${r.returnId ? esc(r.returnId) : `<span class="soft">${esc(t('ridCleared'))}</span>`}<div class="soft" style="font-family:inherit">${r.cutoffAt ? esc(t('cutoffAtLabel', { t: fmtTW(r.cutoffAt) })) : r.noCutoff ? esc(t('noCutoffShort')) : ''}</div></td>
          <td>${reqChip(r.status)}${r.reason ? `<div class="small" style="color:var(--err)">${esc(r.reason)}</div>` : ''}</td><td class="small">${r.wantedTags.map((x) => esc(tagName(x))).join('、')}${r.note ? `<div class="soft">${esc(r.note)}</div>` : ''}</td>
          <td class="hide-sm small muted">${esc(r.requestedBy)}</td><td>${r.sampleId ? `<a href="#/library/${esc(r.sampleId)}">${esc(r.sampleId)}</a>` : ''}</td>
          <td style="text-align:right;white-space:nowrap">${(r.status === 'failed' || (r.status === 'processing' && Date.now() - (r.updatedAt || 0) > 15 * 60000)) && r.returnId ? `<button class="btn sm" data-retry="${esc(r.requestId)}" ${r.status === 'processing' ? `title="${esc(t('stuckHint'))}"` : ''}>${esc(t('retry'))}</button> ` : ''}${r.status === 'queued' || r.status === 'failed' ? `<button class="btn sm ghost danger" data-cancel="${esc(r.requestId)}">${esc(t('cancel'))}</button>` : ''}${me.can.request && ['queued', 'failed', 'cancelled', 'deleted'].includes(r.status) ? ` <button class="btn sm ghost danger" data-rdel="${esc(r.requestId)}">${esc(t('del'))}</button>` : ''}</td></tr>`).join('')}</tbody></table>
        ${me.can.request && reqs.some((r) => ['failed', 'cancelled', 'deleted'].includes(r.status)) ? `<div class="row" style="padding:10px 14px"><span class="small muted">${esc(t('reqDelHint'))}</span><span class="spacer"></span><button class="btn sm ghost danger" id="rdelAll">${esc(t('reqDelAll', { n: reqs.filter((r) => ['failed', 'cancelled', 'deleted'].includes(r.status)).length }))}</button></div>` : ''}`;
      $$('[data-retry]').forEach((b) => b.addEventListener('click', async () => { try { await api('tw_retryRequest', { requestId: b.dataset.retry }); viewLibrary(); } catch (e) { toast(e.message, 4000); } }));
      $$('[data-cancel]').forEach((b) => b.addEventListener('click', async () => { try { await api('tw_cancelRequest', { requestId: b.dataset.cancel }); viewLibrary(); } catch (e) { toast(e.message, 4000); } }));
      const delReqs = async (ids) => {
        if (!(await confirmBox(t('reqDelConfirm', { ids: ids.join('、') }), t('del'), t('cancel'), true))) return;
        try { await api('tw_deleteRequests', { requestIds: ids }); toast(t('reqDelDone', { n: ids.length })); viewLibrary(); } catch (e) { toast(e.message, 5000); }
      };
      $$('[data-rdel]').forEach((b) => b.addEventListener('click', () => delReqs([b.dataset.rdel])));
      const ra = $('#rdelAll'); if (ra) ra.onclick = () => delReqs(reqs.filter((r) => ['failed', 'cancelled', 'deleted'].includes(r.status)).map((r) => r.requestId));
    }
    drawReqs(d.requests);
    // 申請狀態有變動（排程處理中、完成、失敗）就自動更新列表
    if (DB() && DB().live) {
      let last = JSON.stringify(d.requests);
      liveOff = DB().live.requests((rows) => { const j = JSON.stringify(rows); if (j === last) return; last = j; if ($('#rl')) drawReqs(rows); });
    }
    $('#rf').addEventListener('submit', async (e) => {
      e.preventDefault(); $('#r_go').disabled = true; $('#r_err').hidden = true;
      try {
        const pr = parseReq($('#r_ids').value);
        if (pr.bad.length) throw new Error(t('cutoffBad') + '：' + pr.bad.join('、'));
        const r = await api('tw_requestSamples', { items: pr.items, noCutoff: $('#r_nocut').checked, topicId: $('#r_topic').value,
          wantedTags: $$('#r_tags input:checked').map((c) => c.value), note: $('#r_note').value.trim() });
        toast(t('reqAdded', { n: r.added }) + (r.duplicates.length ? '；' + t('reqDup', { ids: r.duplicates.join(', ') }) : ''), 5000);
        $('#r_ids').value = ''; $('#r_note').value = ''; $('#r_nocut').checked = false; preview(); $('#r_go').disabled = false;
        drawReqs((await api('tw_listRequests')).requests);
      } catch (err) { $('#r_err').textContent = err.message; $('#r_err').hidden = false; $('#r_go').disabled = false; }
    });
  }

  async function viewSample(id) {
    if (me.role !== 'tw') { shell('library', `<div class="banner warn">${esc(t('reviewOnlyTw'))}</div>`); return; }
    const main = shell('library', `<div class="empty-state"><span class="spin"></span></div>`);
    let meta, s;
    try { [meta, { sample: s }] = await Promise.all([getLibMeta(), api('tw_getSample', { sampleId: id })]); } catch (e) { showError(e); return; }
    let work = { tags: s.tags.slice(), changeHint: s.changeHint, question: clone(s.question) }, dirty = false, qDirty = false;
    leaveGuard = () => !dirty || window.confirm(t('unsaved'));
    const tagName = (x) => L((meta.tags.concat(meta.inactiveTags || []).find((y) => y.tagId === x) || {}).name) || x;
    /** 判斷重點與正解只存在題目內：表單直接改 work.question */
    const qPointZh = () => String((work.question.point && work.question.point.zh) || '');
    const qOptions = () => (work.question.options || []);
    function draw() {
      const sg = s.suggest, q = work.question, { left, req } = caseHtml(q), grp = topicGroup(meta, s.topicId);
      const diff = s.wantedTags && s.wantedTags.length && sg && !s.wantedTags.every((x) => (sg.tags || []).includes(x));
      const opts = (q.options || []).map((o) => `<div class="opt ${o.id === q.answer ? 'correct' : ''}"><b>${esc(o.id)}.</b> ${esc(L(o.text))}${o.id === q.answer ? `<span class="hint">✓ ${esc(t('correct'))}</span>` : ''}</div>`).join('');
      main.innerHTML = `<div class="row"><a href="#/library${s.status === 'pending' ? '' : '?tab=active'}">← ${esc(t('library'))}</a><h1>${esc(s.sampleId)}</h1>${smChip(s.status)}${s.source ? `<span class="chip">${esc(s.source)}</span>` : ''}
          <span class="spacer"></span><button class="btn sm ghost" id="json">${esc(t('qeJsonAdv'))}</button>${grp && q.type !== 'G' ? `<button class="btn brand" id="toG">${esc(t('grpConvert'))}</button>` : ''}<button class="btn" id="qedit">✎ ${esc(t('qeOpen'))}</button>
          ${me.can.sample ? `<button class="btn ghost danger" id="delS">${esc(t('delSample'))}</button>` : ''}
          ${s.status === 'active' ? `<button class="btn danger" id="rej">${esc(t('deactivate'))}</button>` : s.status === 'pending' ? `<button class="btn danger" id="rej">${esc(t('reject'))}</button>` : ''}
          <button class="btn" id="save" ${dirty ? '' : 'disabled'}>${esc(t('save'))}</button>
          ${s.status !== 'active' ? `<button class="btn ok" id="appr">${esc(s.status === 'pending' ? t('approve') : t('reactivate'))}</button>` : ''}</div>
        ${s.reviewNote ? `<div class="banner warn">${esc(s.reviewNote)}</div>` : ''}
        <div class="libgrid">
          <div class="card pad"><h4>${esc(t('yourExpect'))}</h4>${(s.wantedTags || []).length ? s.wantedTags.map((x) => `<span class="chip" style="margin:2px">${esc(tagName(x))}</span>`).join('') : '<span class="soft">—</span>'}
            ${s.note ? `<div class="small" style="margin-top:6px">${esc(s.note)}</div>` : ''}<div class="small soft" style="margin-top:6px">${esc(s.requestedBy || '')}</div></div>
          <div class="card pad"><h4>${esc(t('aiSuggest'))}</h4>${sg ? `${(sg.tags || []).map((x) => `<span class="chip info" style="margin:2px">${esc(tagName(x))}</span>`).join('')}
            <div style="margin-top:6px"><b>${esc(sg.answer || '')}</b> · ${esc(sg.pointZh || '')}</div><div class="small muted">${esc(sg.reason || '')}</div>
            <button class="btn sm" id="applyAi" style="margin-top:8px">${esc(t('applyAi'))}</button>` : '<span class="soft">—</span>'}</div>
        </div>
        ${diff ? `<div class="banner warn">${esc(t('diffWarn'))}</div>` : ''}
        ${(() => {   // 處理指令：英文待翻譯、待 AI 檢查、待分析判斷標準
          const m = metaOf(s), a = m.enPending.length, rv = needsReview(m), gp = sampleNeedsGap(s);
          return a || rv || gp ? cmdBox('處理 ' + s.sampleId, [a && t('wkEnF', { n: a }), rv && t('wkRv1'), gp && t('wkGap1')].filter(Boolean).join(' · ')) : '';
        })()}
        ${(() => { const m = metaOf(s); return m.enPending.length ? `<div class="card" style="overflow:hidden">${enPendingHtml(m)}</div>` : ''; })()}
        ${reviewHtml(metaOf(s), true, s.question)}
        ${s.criteriaGap ? `<div class="card pad gapcard"><div class="row"><b>💡 ${esc(t(s.criteriaGap.kind === 'ai_misread' ? 'gk_ai_misread' : 'gapTitle2'))}</b><span class="chip">${esc(t('gk_' + s.criteriaGap.kind))}</span><span class="small soft">${esc(t('gapFromTrainer'))}</span>
            ${s.criteriaGap.kind !== 'ai_misread' ? (s.gapState ? `<span class="chip ${s.gapState === 'added' ? 'ok' : ''}">${esc(t('gap_' + s.gapState))}</span><span class="spacer"></span><button class="btn sm ghost" id="gapReset">${esc(t('gapReset'))}</button>` : `<span class="spacer"></span><button class="btn sm ghost" id="gapIgnore">${esc(t('gapIgnore'))}</button><a class="btn sm brand" style="display:inline-flex;align-items:center;text-decoration:none" href="#/settings?tab=topic&topic=${esc(s.topicId)}&gap=${esc(s.sampleId)}">${esc(t('gapAdd'))}</a>`) : ''}</div>
          <div class="small" style="margin-top:6px">${esc(s.criteriaGap.situation)}</div>${s.criteriaGap.suggestion ? `<pre class="gapsug">${esc(s.criteriaGap.suggestion)}</pre>` : ''}</div>` : ''}
        ${sg && sg.criteriaGap && !(s.criteriaGap && s.criteriaGap.kind !== 'ai_misread') ? `<div class="card pad gapcard"><div class="row"><b>💡 ${esc(t('gapTitle'))}</b>${s.gapState ? `<span class="chip ${s.gapState === 'added' ? 'ok' : ''}">${esc(t('gap_' + s.gapState))}</span>` : ''}<span class="spacer"></span>
            ${s.gapState ? `<button class="btn sm ghost" id="gapReset">${esc(t('gapReset'))}</button>` : `<button class="btn sm ghost" id="gapIgnore">${esc(t('gapIgnore'))}</button><a class="btn sm brand" style="display:inline-flex;align-items:center;text-decoration:none" href="#/settings?tab=topic&topic=${esc(s.topicId)}&gap=${esc(s.sampleId)}">${esc(t('gapAdd'))}</a>`}</div>
          <div class="small" style="margin-top:6px">${esc(sg.criteriaGap.situation)}</div>${sg.criteriaGap.suggestion ? `<pre class="gapsug">${esc(sg.criteriaGap.suggestion)}</pre>` : ''}</div>` : ''}
        <div class="card pad libedit">
          <div class="form">
            <span class="k">${esc(t('colTags'))}</span><div class="tags" id="e_tags">${meta.tags.filter((x) => x.topicId === s.topicId).concat((meta.inactiveTags || []).filter((x) => work.tags.includes(x.tagId)).map((x) => Object.assign({}, x, { name: { zh: x.name.zh + '（' + t('tagInactive') + '）', en: x.name.en + ' (' + t('tagInactive') + ')' } }))).map((x) => `<label class="tag-opt ${work.tags.includes(x.tagId) ? 'on' : ''}"><input type="checkbox" value="${esc(x.tagId)}" ${work.tags.includes(x.tagId) ? 'checked' : ''}> ${esc(L(x.name))}</label>`).join('')}</div>
            <label class="k" for="e_point">${esc(t('point'))}</label><input type="text" id="e_point" value="${esc(qPointZh())}" maxlength="100">
            ${qOptions().length ? `<label class="k" for="e_ans">${esc(t('answer'))}</label><select id="e_ans"><option value=""></option>${qOptions().map((o) => `<option value="${esc(o.id)}" ${work.question.answer === o.id ? 'selected' : ''}>${esc(o.id + '. ' + L(o.text))}</option>`).join('')}</select>` : ''}
            <label class="k" for="e_hint">${esc(t('changeHint'))}</label><textarea id="e_hint" rows="2" style="width:100%;border:1px solid var(--line2);border-radius:8px;padding:8px" placeholder="${esc(t('changeHintPh'))}">${esc(work.changeHint)}</textarea>
          </div><div id="e_err" class="banner err" hidden></div></div>
        <div class="card detail"><div class="qbody"><div>${left}</div><div>${req}${opts ? `<h4>${esc(t('options'))}</h4>${opts}` : ''}
          ${q.type === 'G' ? `<h4>${esc(t('grpTitle', { n: (q.group || []).length }))} <span class="soft">· ${esc(t('grpKeyHint'))}</span></h4>${groupHtml(q, 'key')}` : ''}
          ${[['point', 'qPointIn'], ['modelAnswer', 'modelAnswer'], ['rubric', 'rubric'], ['explanation', 'explanation']].map(([k, lab]) => (q[k] && L(q[k]) ? `<h4>${esc(t(lab))}</h4><div class="box" style="white-space:pre-wrap">${esc(L(q[k]))}</div>` : '')).join('')}</div></div></div>`;
      bind();
    }
    function mark() { dirty = true; const b = $('#save'); if (b) b.disabled = false; }
    function bind() {
      $$('#e_tags input').forEach((c) => c.addEventListener('change', () => { c.parentElement.classList.toggle('on', c.checked); work.tags = $$('#e_tags input:checked').map((x) => x.value); mark(); }));
      $('#e_point').oninput = (e) => { work.question.point = Object.assign({ en: '' }, work.question.point, { zh: e.target.value }); qDirty = true; mark(); };
      const ea = $('#e_ans'); if (ea) ea.onchange = (e) => { work.question.answer = e.target.value; qDirty = true; mark(); };
      bindGroupKey(main, work.question, () => { qDirty = true; dirty = true; draw(); });
      const tg = $('#toG'); if (tg) tg.onclick = () => {
        const q = work.question, tpx = meta.topics.find((y) => y.topicId === s.topicId) || {};
        q.type = 'G'; q.group = clone(topicGroup(meta, s.topicId)); q.subAnswers = {};
        if (tpx.prompt && tpx.prompt.zh) q.prompt = clone(tpx.prompt);      // 問句改成主題的問句（題組用）
        ['options', 'answer', 'modelAnswer', 'rubric'].forEach((k) => delete q[k]);
        qDirty = true; dirty = true; draw(); toast(t('grpToG'), 5000);
      };
      $('#e_hint').oninput = (e) => { work.changeHint = e.target.value; mark(); };
      const ap = $('#applyAi'); if (ap) ap.onclick = () => {
        const sg = s.suggest; work.tags = (sg.tags || []).slice();
        if (sg.pointZh) work.question.point = Object.assign({ en: '' }, work.question.point, { zh: sg.pointZh });
        const o = qOptions().find((x) => x.text && x.text.zh === sg.answer); if (o) work.question.answer = o.id;
        if (work.question.type === 'G' && sg.subAnswers) work.question.subAnswers = Object.assign({}, sg.subAnswers);
        qDirty = true; dirty = true; draw();
      };
      $('#save').onclick = () => save();
      $('#qedit').onclick = async () => {
        const out = await questionEditor(work.question, { rules: meta.dms, title: s.sampleId, group: topicGroup(meta, s.topicId) });
        if (out) { work.question = out; qDirty = true; dirty = true; draw(); toast(t('qeApplied')); }
      };
      const appr = $('#appr'); if (appr) appr.onclick = async () => {
        if (!work.tags.length) { toast(t('tagsNeeded')); return; }
        if (dirty && !(await save())) return;
        try { await api('tw_approveSample', { sampleId: s.sampleId }); toast(t('approved'), 4000); viewSample(s.sampleId); } catch (e) { toast(e.message, 4000); }
      };
      const dS = $('#delS'); if (dS) dS.onclick = () => deleteSampleDialog();
      $$('[data-copycmd]').forEach((b) => { b.onclick = () => copyText(b.dataset.copycmd); });
      const ra = $('#rvAsk'); if (ra) ra.onclick = async () => {
        ra.disabled = true;
        try { await api('t_requestReview', { sampleId: s.sampleId }); s._m = Object.assign({}, metaOf(s), { reviewWanted: true }); toast(t('rvAsked', { cmd: '處理 ' + s.sampleId }), 4000); draw(); }
        catch (e) { toast(e.message, 4000); ra.disabled = false; }
      };
      const gi = $('#gapIgnore'); if (gi) gi.onclick = async () => { try { await api('tw_setGap', { sampleId: s.sampleId, state: 'dismissed' }); s.gapState = 'dismissed'; draw(); } catch (e) { toast(e.message, 4000); } };
      const gr = $('#gapReset'); if (gr) gr.onclick = async () => { try { await api('tw_setGap', { sampleId: s.sampleId, state: '' }); s.gapState = ''; draw(); } catch (e) { toast(e.message, 4000); } };
      const rj = $('#rej'); if (rj) rj.onclick = () => modal(`<h2>${esc(s.status === 'active' ? t('deactivate') : t('reject'))} ${esc(s.sampleId)}</h2>
          <input type="text" id="rj_r" placeholder="${esc(t('rejectReason'))}" style="height:38px;border:1px solid var(--line2);border-radius:8px;padding:0 10px">
          <div class="row" style="justify-content:flex-end"><button class="btn" data-close="">${esc(t('cancel'))}</button><button class="btn brand" id="rj_go">${esc(s.status === 'active' ? t('deactivate') : t('reject'))}</button></div>`,
        { onMount: (el, close) => { $('#rj_go', el).onclick = async () => { try { await api('tw_rejectSample', { sampleId: s.sampleId, reason: $('#rj_r', el).value }); close('ok'); dirty = false; toast(s.status === 'active' ? t('deactivated') : t('rejected')); viewSample(s.sampleId); } catch (e) { toast(e.message, 4000); } }; } });
      $('#json').onclick = () => modal(`<h2>${esc(t('editJson'))} · ${esc(s.sampleId)}</h2><textarea class="json" spellcheck="false">${esc(JSON.stringify(work.question, null, 2))}</textarea><div id="jerr" class="banner err" hidden></div>
          <div class="row" style="justify-content:flex-end"><button class="btn" data-close="">${esc(t('cancel'))}</button><button class="btn primary" id="japply">${esc(t('apply'))}</button></div>`,
        { wide: true, onMount: (el, close) => { $('#japply', el).onclick = () => { try { work.question = JSON.parse($('textarea', el).value); qDirty = true; dirty = true; close('ok'); draw(); } catch (e) { const j = $('#jerr', el); j.textContent = t('jsonBad') + e.message; j.hidden = false; } }; } });
    }
    /** 刪除範例；可勾選用新的判斷時點重新申請同一個 Return ID */
    function deleteSampleDialog() {
      const p2 = (n) => String(n).padStart(2, '0');
      const old = s.cutoffAt ? (() => { const x = new Date(s.cutoffAt + 8 * 3600e3).toISOString().replace('T', ' '); return x.slice(17, 19) === '00' ? x.slice(0, 16) : x.slice(0, 19); })() : '';
      const fld = 'height:36px;border:1px solid var(--line2);border-radius:8px;padding:0 10px';
      return modal(`<h2>${esc(t('delSample'))} ${esc(s.sampleId)}</h2>
        <div class="small" style="margin-top:8px">${esc(t('delSampleNote'))}</div>
        ${s.returnId ? `<label class="row" style="margin-top:14px;gap:8px"><input type="checkbox" id="ds_re" checked> <b>${esc(t('delRequeue'))}</b> <span class="mono small">${esc(s.returnId)}</span></label>
        <div id="ds_box" style="margin:8px 0 0 26px;display:flex;flex-direction:column;gap:6px">
          <div class="row" style="gap:8px"><span class="small">${esc(t('qeCutoff'))}</span><input id="ds_cut" class="mono" value="${esc(old)}" placeholder="2026-10-20 14:30" style="${fld};width:180px"></div>
          <label class="small row" style="gap:6px"><input type="checkbox" id="ds_none"> ${esc(t('noCutoffShort'))}</label>
          <div class="small muted">${esc(t('delRequeueHint'))}</div></div>` : `<div class="small muted" style="margin-top:10px">${esc(t('delNoRid'))}</div>`}
        <div id="ds_err" class="banner err" hidden style="margin-top:10px"></div>
        <div class="row" style="margin-top:16px"><span class="spacer"></span><button class="btn" data-close="">${esc(t('cancel'))}</button><button class="btn danger" id="ds_go">${esc(t('delSample'))}</button></div>`,
      { onMount: (el, close) => {
        const re = $('#ds_re', el); if (re) re.onchange = () => { $('#ds_box', el).style.display = re.checked ? 'flex' : 'none'; };
        $('#ds_go', el).onclick = async () => {
          const er = $('#ds_err', el); er.hidden = true;
          let requeue = null;
          if (re && re.checked) {
            const v = $('#ds_cut', el).value.trim(), none = $('#ds_none', el).checked;
            const m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})[\sT]+(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(v);
            if (v && !m) { er.textContent = t('cutoffBad') + '：' + v; er.hidden = false; return; }
            const at = m ? Date.parse(`${m[1]}-${p2(m[2])}-${p2(m[3])}T${p2(m[4])}:${m[5]}:${m[6] || '00'}+08:00`) : null;
            if (!at && !none) { er.textContent = t('delNeedCut'); er.hidden = false; return; }
            requeue = { cutoffAt: at, noCutoff: !at };
          }
          $('#ds_go', el).disabled = true;
          try {
            const r = await api('tw_deleteSample', { sampleId: s.sampleId, requeue });
            dirty = false; leaveGuard = null; close('ok');
            toast(r.requestId ? t('delRequeued', { id: s.sampleId, r: r.requestId }) : t('delDone', { id: s.sampleId }), 4500);
            location.hash = r.requestId ? '#/library?tab=requests' : '#/library';
          } catch (e) { er.textContent = e.message; er.hidden = false; $('#ds_go', el).disabled = false; }
        };
      } });
    }
    async function save() {
      $('#e_err').hidden = true;
      try {
        const payload = { sampleId: s.sampleId, tags: work.tags, changeHint: work.changeHint };
        if (qDirty) payload.question = work.question;
        const r = await api('tw_updateSample', payload);
        s = r.sample; work = { tags: s.tags.slice(), changeHint: s.changeHint, question: clone(s.question) }; dirty = false; qDirty = false;
        toast(t('saved')); draw(); return true;
      } catch (e) { $('#e_err').textContent = e.message; $('#e_err').hidden = false; return false; }
    }
    draw();
    if (liveOff) { liveOff(); liveOff = null; }
    if (DB().live && DB().live.sample) {
      let lastWork = s.workAt || 0;
      liveOff = DB().live.sample(s.sampleId, (d) => {
        if (!d || (d.workAt || 0) === lastWork) return;
        lastWork = d.workAt || 0;
        if (dirty || location.hash !== '#/library/' + s.sampleId) return;
        api('tw_getSample', { sampleId: s.sampleId }).then((r) => { s = r.sample; work = { tags: s.tags.slice(), changeHint: s.changeHint, question: clone(s.question) }; draw(); }).catch(() => null);
      });
    }
  }

  // ───────── 主題設定（TW 講師） ─────────
  Object.assign(I18N.zh, {
    colWantedNote: '預期分類 / 說明', settings: '主題設定', setTopic: '主題與判斷標準', setTags: '標籤', setOptions: '選項範本', setRoles: '講師名單', setSystem: '系統設定',
    seedTitle: '建立初始資料', seedHint: '第一次使用 V2 時，請選擇初始資料檔（rrqp_seed.json，放在 RR Quiz Platform\\firebase 資料夾，不在 GitHub 上）。會建立「協議判斷」主題、判斷標準、標籤、選項範本與系統設定，並把你加入講師名單。',
    seedPick: '選擇初始資料檔', seedRun: '建立初始資料', seedDone: '已建立：主題 {t} 個、標籤 {g} 個、選項範本 {o} 組', seedBad: '檔案不是有效的初始資料（JSON）',
    seedPreview: '主題 {t} 個、標籤 {g} 個、選項範本 {o} 組、系統設定 {s} 項',
    tName: '主題名稱', tPrompt: '題目問句', tDefaultSet: '預設選項範本', tCriteria: '判斷標準', tKeyFactors: '判斷關鍵（每行一個）', tRules: '出題規則（給 AI）', 
    tCriteriaNote: '修改判斷標準並儲存後，版本號會自動 +1；題庫中依舊版本出的題目會標示「需重新確認」。', tHistory: '舊版判斷標準', tNoHistory: '還沒有舊版本。',
    tSave: '儲存主題', tSaved: '主題已儲存', tBumped: '判斷標準已升為 {v}', tBumpConfirm: '判斷標準有修改，儲存後會從 {a} 升為 {b}，題庫中依 {a} 出的題目會標示「需重新確認」。確定儲存？',
    tUntil: '使用到 {t}', zhL: '中文', enL: 'English', none: '（無）', unsavedLeave: '有未儲存的修改，確定要離開嗎？',
    tagCol: '標籤', descCol: '說明', stateCol: '狀態', enabled: '啟用', editBtn: '編輯', addTagBtn: '＋ 新增標籤', noTags: '這個主題還沒有標籤。',
    optAdd: '新增選項範本', optEdit: '編輯選項範本', optName: '範本名稱', optItems: '選項', optAddRow: '＋ 新增選項', optDel: '刪除範本', optDelConfirm: '刪除選項範本「{n}」？已經使用這組選項的題目不受影響。', optSaved: '選項範本已儲存', optDeleted: '選項範本已刪除', optIsDefault: '預設',
    roleEmail: 'Email', roleRole: '身分', roleBy: '加入者', roleAdd: '新增講師', roleAdmin: '管理員', roleAdminHint: '管理員：TW 講師的全部功能，加上這個「管理」頁（講師名單、刪除權限、系統設定、V1 資料搬移），而且一律可以刪除。', roleTw: 'TW 講師', roleBpo: 'BPO 講師', roleOwner: '擁有者（固定是管理員，寫在權限規則裡）', roleRemove: '移除', roleRemoveConfirm: '把 {e} 從講師名單移除？之後他登入只會看到專員畫面。', roleAdded: '已加入 {e}', roleRemoved: '已移除 {e}',
    roleHint: '不在名單上的人用 Google 登入後都是專員，只看得到指派給自己的測驗。', sysKey: '項目', sysNote: '說明', sysValue: '數值', sysSaved: '已儲存', save: '儲存',
    setPerms: '刪除權限', setV1: 'V1 資料搬移', setReset: '重置資料',
    resetTitle: '重置資料（清除測試資料、編號從頭開始）', resetWarn: '會永久刪除下列所有資料，無法復原。編號（D、Q、E、S、R）全部從 001 重新開始，V1 資料搬移也可以重新執行。正式上線、匯入 V1 之前使用；上線後請勿使用。',
    resetResults: '公布的成績', resetSamples: '範例', resetRequests: '範例申請紀錄', resetKeep: '會保留：主題與判斷標準、標籤、選項範本、DMS 規則、系統設定、刪除權限、講師名單。',
    resetBtn: '重置資料', resetConfirm: '確定要刪除所有草稿、題庫、測驗、成績、範例與申請紀錄？無法復原。', resetRunning: '重置中…', resetDone: '已重置，編號從頭開始', adminHint: '只有管理員看得到這一頁',
    permPage: '頁面', permAction: '刪除項目', permAdminAlways: '管理員一律可以刪除', permTwOnly: '這個頁面只有 TW 講師能進', permSaved: '刪除權限已儲存',
    permHint: '勾選的身分會在該頁面看到刪除按鈕；沒勾的看不到，也無法透過其他方式刪除（由 Firebase 權限規則把關）。', permLast: '最後修改：{by}（{at}）',
    perm_bankQ: '刪除題庫題目', permd_bankQ: '已發佈的測驗保留試卷副本，成績不受影響；題目的統計會消失',
    perm_draft: '刪除草稿', permd_draft: '題庫與已發佈的測驗不受影響；未入庫的題目一併移除',
    perm_draftQ: '校對時刪除單題', permd_draftQ: '含「刪除並請 Agent 補一題」，屬於日常校對',
    perm_session: '刪除測驗', permd_session: '作答、分數、公布的成績一起刪除，專員的歷史成績也會消失；正式測驗請用「封存」',
    perm_sample: '刪除範例', permd_sample: '連同申請紀錄；同一個 Return ID 之後可以重新申請',
    perm_request: '刪除範例申請紀錄', permd_request: '只限等待中、失敗、已取消、範例已刪除的申請',
    v1Title: '從 V1 搬移資料', v1Hint: '在 V1 的 Apps Script 執行 exportForV2，把產生的 JSON 檔選進來。會先顯示預計匯入的內容，確認後才寫入。編號會重新配發（題庫 Q、範例 S、測驗 E），舊的 V1 測驗連結會自動導到新編號。只能匯入一次。',
    v1Pick: '選擇 V1 匯出檔', v1Plan: '預計匯入：題庫 {b} 題、範例 {s} 筆、測驗 {e} 場（作答 {a} 份，已公布成績 {r} 場）、新標籤 {g} 個',
    v1Done: '匯入完成：題庫 {b} 題、範例 {s} 筆、測驗 {e} 場（作答 {a} 份，已公布成績 {r} 場）、新標籤 {g} 個',
    v1Outdated: '{n} 題題庫的判斷標準版本和目前不同，題庫會標示「需重新確認」，自動抽題預設不會抽到，可在題庫逐題檢查後儲存。',
    v1Open: '這些測驗還沒結束：{list}。建議等 V1 測驗結束後再匯出、匯入。', v1Warn: '{n} 項需要注意（仍會匯入，之後到題庫或範例頁處理）',
    v1Map: '新舊編號對照', v1Run: '開始匯入', v1Running: '匯入中…', v1Confirm: '確定要把這些 V1 資料寫入 V2 嗎？只能匯入一次。', v1Toast: 'V1 資料已匯入',
    qPointIn: '判斷重點（題目內）', gapTitle: '判斷標準可能有缺口（AI 匯入時回報）', gapTitle2: '判斷標準可能有缺口', gapAdd: '加到判斷標準', gapIgnore: '忽略', gapReset: '改回待處理', gap_added: '已加入判斷標準', gap_dismissed: '已忽略',
    gapListTitle: '判斷標準建議（{n}）', gapListHint: 'AI 匯入範例時，發現以下情境在判斷標準中沒有明確條文。按「加入」會把建議條文接到判斷標準最後，請修改後再儲存。',
    gapAppend: '加入', gapAppended: '已加入，記得儲存', gapIgnored: '已忽略這條建議',
    tGrading: '批改原則（給 AI 批改用）', tGradingHint: 'AI 批改文字答案時優先依這裡的原則，其次才是每題的評分標準。例如：點出判斷關鍵就給滿分、不要求引用條文。',
    tImport: '匯入主題', tImportConfirm: '匯入主題「{n}」：標籤 {g} 個、選項範本 {o} 組。已經有這個主題時，下一步會問你要不要更新；已有的標籤不會被修改。確定匯入？', tImported: '已匯入主題 {n}',
    tAdd: '新增主題', tCopyFrom: '複製設定自', tAddHint: '會複製該主題的出題規則、判斷關鍵、題目問句與預設選項；判斷標準請在建立後填寫。標籤不會複製。', tAdded: '已新增主題「{n}」',
    tDisable: '停用主題', tEnable: '重新啟用', tDisableConfirm: '停用「{n}」？停用後不能用它建立草稿或申請範例；已有的範例、草稿與題目不受影響。', tDisabled: '主題已停用', tEnabled: '主題已啟用',
    tInactiveNote: '這個主題已停用：不能用它建立草稿或申請範例。', tReasonsMoved: '申退原因與允許的申請方案是 DMS 系統規則，所有主題共用，請到',
    setDms: 'DMS 規則', dmsReasons: '申退原因 × 允許的申請方案', dmsReasonsHint: '題目編輯器、AI 出題與範例匯入都會檢查：申請方案（與買家第一筆 DRC 提案）必須是該原因允許的方案。之後 DRC 協商的提案不受限制。',
    dmsZh: '中文（DMS 顯示）', dmsEn: '英文（DMS 顯示，題目使用這個）', dmsAliases: '舊名稱（以 ; 分隔）', dmsAliasPh: '例：Damaged Item', dmsAdd: '＋ 新增原因',
    dmsNotes: '其他 DMS 系統規則（文字，給 AI 出題與檢查參考）', dmsNotesHint: '無法用表格表示的規則，一行一條，例如「某情況下 DRC 不會出現某種選項」。', dmsSaved: 'DMS 規則已儲存',
    dmsDefault: '目前使用內建的預設規則（2025-Dec）。確認內容後按「儲存」，之後就以這裡為準。',
  });
  Object.assign(I18N.en, {
    colWantedNote: 'Expected tags / note', settings: 'Settings', setTopic: 'Topic & criteria', setTags: 'Tags', setOptions: 'Option sets', setRoles: 'Trainers', setSystem: 'System',
    seedTitle: 'Initialize data', seedHint: 'The first time you use V2, choose the seed file (rrqp_seed.json, in the RR Quiz Platform\\firebase folder, not on GitHub). It creates the Agreement Check topic, criteria, tags, option sets and system settings, and adds you as a trainer.',
    seedPick: 'Choose seed file', seedRun: 'Initialize', seedDone: 'Created {t} topic(s), {g} tags, {o} option sets', seedBad: 'This is not a valid seed file (JSON)',
    seedPreview: '{t} topic(s), {g} tags, {o} option sets, {s} settings',
    tName: 'Topic name', tPrompt: 'Question prompt', tDefaultSet: 'Default option set', tCriteria: 'Judgment criteria', tKeyFactors: 'Deciding factors (one per line)', tRules: 'Generation rules (for the AI)', 
    tCriteriaNote: 'Saving a change to the criteria bumps the version; bank questions written for the old version are marked Re-check.', tHistory: 'Previous criteria', tNoHistory: 'No previous versions yet.',
    tSave: 'Save topic', tSaved: 'Topic saved', tBumped: 'Criteria updated to {v}', tBumpConfirm: 'The criteria changed. Saving moves them from {a} to {b}, and bank questions written for {a} will be marked Re-check. Save?',
    tUntil: 'used until {t}', zhL: '中文', enL: 'English', none: '(none)', unsavedLeave: 'You have unsaved changes. Leave anyway?',
    tagCol: 'Tag', descCol: 'Description', stateCol: 'Status', enabled: 'Enabled', editBtn: 'Edit', addTagBtn: '＋ Add tag', noTags: 'This topic has no tags yet.',
    optAdd: 'Add option set', optEdit: 'Edit option set', optName: 'Name', optItems: 'Options', optAddRow: '＋ Add option', optDel: 'Delete set', optDelConfirm: 'Delete option set "{n}"? Questions that already use it are not affected.', optSaved: 'Option set saved', optDeleted: 'Option set deleted', optIsDefault: 'Default',
    roleEmail: 'Email', roleRole: 'Role', roleBy: 'Added by', roleAdd: 'Add trainer', roleAdmin: 'Admin', roleAdminHint: 'Admin: everything a TW trainer can do, plus this Admin page (trainers, delete permissions, system settings, V1 migration), and can always delete.', roleTw: 'TW trainer', roleBpo: 'BPO trainer', roleOwner: 'Owner (always admin, set in the rules)', roleRemove: 'Remove', roleRemoveConfirm: 'Remove {e} from trainers? They will only see the agent view.', roleAdded: '{e} added', roleRemoved: '{e} removed',
    roleHint: 'Anyone not on this list who signs in with Google is an agent and only sees quizzes assigned to them.', sysKey: 'Item', sysNote: 'Description', sysValue: 'Value', sysSaved: 'Saved', save: 'Save',
    setPerms: 'Delete permissions', setV1: 'V1 migration', setReset: 'Reset data',
    resetTitle: 'Reset data (remove test data, restart IDs)', resetWarn: 'Permanently deletes everything listed below. IDs (D, Q, E, S, R) restart from 001 and the V1 migration can run again. Use before going live and before importing V1; do not use after go-live.',
    resetResults: 'Released results', resetSamples: 'Samples', resetRequests: 'Sample requests', resetKeep: 'Kept: topics and criteria, tags, option sets, DMS rules, system settings, delete permissions, trainers.',
    resetBtn: 'Reset data', resetConfirm: 'Delete all drafts, bank questions, quizzes, results, samples and requests? This cannot be undone.', resetRunning: 'Resetting…', resetDone: 'Reset done; IDs restart from 001', adminHint: 'Only admins can see this page',
    permPage: 'Page', permAction: 'Delete action', permAdminAlways: 'Admins can always delete', permTwOnly: 'Only TW trainers can open this page', permSaved: 'Delete permissions saved',
    permHint: 'Ticked roles see the delete button on that page; others do not, and cannot delete any other way (enforced by the Firebase rules).', permLast: 'Last changed by {by} ({at})',
    perm_bankQ: 'Delete bank questions', permd_bankQ: 'Published quizzes keep their own copy; the question stats are lost',
    perm_draft: 'Delete drafts', permd_draft: 'The bank and published quizzes are not affected; questions not in the bank are removed',
    perm_draftQ: 'Delete a question while reviewing', permd_draftQ: 'Including "delete and let the agent add one"; part of normal review',
    perm_session: 'Delete quizzes', permd_session: 'Attempts, scores and released results are deleted, including agents\' history; archive real quizzes instead',
    perm_sample: 'Delete samples', permd_sample: 'Including the request record; the Return ID can be requested again',
    perm_request: 'Delete sample request records', permd_request: 'Queued, failed, cancelled or sample-deleted requests only',
    v1Title: 'Move data from V1', v1Hint: 'Run exportForV2 in the V1 Apps Script and pick the JSON file it creates. You will see what will be imported before anything is written. IDs are reassigned (bank Q, samples S, quizzes E); old V1 quiz links redirect automatically. One-time import.',
    v1Pick: 'Choose V1 export file', v1Plan: 'To import: {b} bank questions, {s} samples, {e} quizzes ({a} attempts, {r} with released results), {g} new tags',
    v1Done: 'Imported: {b} bank questions, {s} samples, {e} quizzes ({a} attempts, {r} with released results), {g} new tags',
    v1Outdated: '{n} bank question(s) use an older criteria version; they are marked "Re-check" and skipped by auto-pick until reviewed and saved.',
    v1Open: 'These quizzes have not ended: {list}. Export and import after they end.', v1Warn: '{n} item(s) need attention (still imported; fix them later in the bank or sample page)',
    v1Map: 'Old → new IDs', v1Run: 'Start import', v1Running: 'Importing…', v1Confirm: 'Write these V1 records into V2? This can only be done once.', v1Toast: 'V1 data imported',
    qPointIn: 'Key point (in the question)', gapTitle: 'Possible gap in the criteria (reported by AI on import)', gapTitle2: 'Possible gap in the criteria', gapAdd: 'Add to criteria', gapIgnore: 'Ignore', gapReset: 'Reopen', gap_added: 'Added to criteria', gap_dismissed: 'Ignored',
    gapListTitle: 'Criteria suggestions ({n})', gapListHint: 'When importing samples, the AI found these situations are not clearly covered by the criteria. Add appends the suggested rule to the end of the criteria; edit it before saving.',
    gapAppend: 'Add', gapAppended: 'Added — remember to save', gapIgnored: 'Suggestion ignored',
    tGrading: 'Grading principles (for AI grading)', tGradingHint: 'When grading written answers, the AI follows these principles first, then each question’s rubric. E.g. full marks for naming the deciding factor; no need to cite rule numbers.',
    tImport: 'Import topic', tImportConfirm: 'Import topic "{n}" with {g} tags and {o} option sets? If the topic already exists, you will be asked whether to update it. Existing tags are not changed.', tImported: 'Topic {n} imported',
    tAdd: 'Add topic', tCopyFrom: 'Copy settings from', tAddHint: "Copies the generation rules, deciding factors, prompt and default option set. Fill in the criteria after creating it. Tags are not copied.", tAdded: 'Topic "{n}" added',
    tDisable: 'Deactivate topic', tEnable: 'Reactivate', tDisableConfirm: 'Deactivate "{n}"? It can no longer be used for new drafts or sample requests. Existing samples, drafts and questions are not affected.', tDisabled: 'Topic deactivated', tEnabled: 'Topic reactivated',
    tInactiveNote: 'This topic is inactive: it cannot be used for new drafts or sample requests.', tReasonsMoved: 'Return reasons and allowed solutions are DMS system rules shared by all topics. Edit them in',
    setDms: 'DMS rules', dmsReasons: 'Return reason × allowed solutions', dmsReasonsHint: "Checked by the question editor, AI generation and sample import: the request solution (and the buyer's first DRC offer) must be allowed for the reason. Later DRC negotiation offers are not restricted.",
    dmsZh: 'Chinese (as in DMS)', dmsEn: 'English (as in DMS, used in questions)', dmsAliases: 'Old names (separate with ;)', dmsAliasPh: 'e.g. Damaged Item', dmsAdd: '＋ Add reason',
    dmsNotes: 'Other DMS system rules (text, for AI generation and checks)', dmsNotesHint: 'Rules that do not fit the table, one per line.', dmsSaved: 'DMS rules saved',
    dmsDefault: 'Using the built-in default rules (2025-Dec). Review them and press Save; from then on this page is the source of truth.',
  });

  async function viewSettings() {
    const params = new URLSearchParams(location.hash.split('?')[1] || '');
    if (['roles', 'system'].includes(params.get('tab'))) { location.replace(me.isAdmin ? '#/admin?tab=' + params.get('tab') : '#/settings'); return; }
    const TABS = ['topic', 'tags', 'options', 'dms'];
    const NAMES = { topic: 'setTopic', tags: 'setTags', options: 'setOptions', dms: 'setDms' };
    const tab = TABS.includes(params.get('tab')) ? params.get('tab') : 'topic';
    shell('settings', `<div class="row"><h1>${esc(t('settings'))}</h1></div><div id="sb"><div class="empty-state"><span class="spin"></span></div></div>`);
    let st;
    try { st = await api('tw_status'); } catch (e) { showError(e, $('#sb')); return; }
    if (!st.seeded) { renderSeed($('#sb')); return; }
    $('#sb').innerHTML = `<div class="tabs">${TABS.map((k) => `<a class="tab ${k === tab ? 'on' : ''}" href="#/settings?tab=${k}">${esc(t(NAMES[k]))}</a>`).join('')}</div><div id="sp" style="margin-top:14px"><div class="empty-state"><span class="spin"></span></div></div>`;
    const box = $('#sp');
    try {
      if (tab === 'topic') await setTopicTab(box);
      else if (tab === 'tags') await setTagsTab(box);
      else if (tab === 'options') await setOptionsTab(box);
      else await setDmsTab(box);
    } catch (e) { showError(e, box); }
  }

  function renderSeed(box) {
    let seed = null;
    box.innerHTML = `<div class="card pad" style="display:flex;flex-direction:column;gap:12px;max-width:720px"><h2>${esc(t('seedTitle'))}</h2>
      <div class="small muted">${esc(t('seedHint'))}</div>
      <label class="btn" style="align-self:flex-start;display:inline-flex;align-items:center">${esc(t('seedPick'))}<input type="file" id="sf" accept=".json,application/json" hidden></label>
      <div id="sv" class="small"></div>
      <div><button class="btn brand" id="sr" disabled>${esc(t('seedRun'))}</button></div></div>`;
    $('#sf').onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try {
        seed = JSON.parse(await f.text());
        if (!Array.isArray(seed.topics) || !seed.topics.length) throw new Error('bad');
        $('#sv').textContent = f.name + '：' + t('seedPreview', { t: seed.topics.length, g: (seed.tags || []).length, o: (seed.optionSets || []).length, s: Object.keys(seed.settings || {}).length });
        $('#sr').disabled = false;
      } catch (_) { seed = null; $('#sv').textContent = t('seedBad'); $('#sr').disabled = true; }
    };
    $('#sr').onclick = async () => {
      $('#sr').disabled = true;
      try {
        const r = await api('tw_seed', { seed });
        topicsCache = null; libMeta = null;
        toast(t('seedDone', { t: r.topics, g: r.tags, o: r.optionSets }), 4000);
        viewSettings();
      } catch (e) { toast(e.message, 5000); $('#sr').disabled = false; }
    };
  }

  const lines = (arr) => (arr || []).join('\n');
  const unlines = (s) => String(s || '').split('\n').map((x) => x.trim()).filter(Boolean);
  const ta = (id, rows, val, mono) => `<textarea id="${id}" rows="${rows}" class="${mono ? 'mono' : ''}" style="width:100%;border:1px solid var(--line2);border-radius:8px;padding:8px;font-size:14px;line-height:1.6">${esc(val)}</textarea>`;

  /** 設定頁的主題選擇列（主題與判斷標準、標籤共用）；選擇記在網址 ?topic= */
  function topicPicker(meta, cur, tab) {
    return `<div class="row topic-pick"><b class="small">${esc(t('topic'))}</b>${meta.topics.map((x) => `<a class="tp ${x.topicId === cur ? 'on' : ''} ${x.active ? '' : 'off'}" href="#/settings?tab=${tab}&topic=${esc(x.topicId)}">${esc(L(x.name))}${x.active ? '' : ` <span class="chip warn">${esc(t('tagInactive'))}</span>`}</a>`).join('')}
      ${tab === 'topic' ? `<span class="spacer"></span><label class="btn sm" style="display:inline-flex;align-items:center">${esc(t('tImport'))}<input type="file" id="tp_imp" accept=".json,application/json" hidden></label><button class="btn sm" id="tp_new" type="button">＋ ${esc(t('tAdd'))}</button>` : ''}</div>`;
  }
  const pickedTopic = (meta) => {
    const want = new URLSearchParams(location.hash.split('?')[1] || '').get('topic');
    return (meta.topics.find((x) => x.topicId === want) || meta.topics.find((x) => x.active) || meta.topics[0] || {}).topicId;
  };
  function addTopicDialog(meta) {
    return modal(`<h2>${esc(t('tAdd'))}</h2>
      <div class="form" style="margin-top:12px">
        <label class="k">${esc(t('tName'))}</label><div class="row"><input id="na_zh" placeholder="${esc(t('zhL'))}" maxlength="30" style="width:180px"><input id="na_en" placeholder="${esc(t('enL'))}" maxlength="40" style="width:200px"></div>
        <label class="k" for="na_src">${esc(t('tCopyFrom'))}</label><select id="na_src"><option value="">${esc(t('none'))}</option>${meta.topics.map((x) => `<option value="${esc(x.topicId)}">${esc(L(x.name))}</option>`).join('')}</select>
      </div>
      <div class="small muted" style="margin-top:8px">${esc(t('tAddHint'))}</div>
      <div class="row" style="margin-top:14px"><span class="spacer"></span><button class="btn" data-close="">${esc(t('cancel'))}</button><button class="btn brand" id="na_ok" type="button">${esc(t('add'))}</button></div>`,
    { onMount: (el, close) => {
      $('#na_zh', el).focus();
      $('#na_ok', el).onclick = async () => {
        const b = $('#na_ok', el); b.disabled = true;
        try { const r = await api('tw_addTopic', { name: { zh: $('#na_zh', el).value.trim(), en: $('#na_en', el).value.trim() }, copyFrom: $('#na_src', el).value }); toast(t('tAdded', { n: r.topic.name.zh })); close(r.topic); }
        catch (e) { toast(e.message, 4500); b.disabled = false; }
      };
    } });
  }

  async function setTopicTab(box) {
    const meta = await api('t_topics');
    const topicId = pickedTopic(meta);
    const [{ topic }, smp] = await Promise.all([api('tw_getTopic', { topicId }), api('tw_listSamples').catch(() => ({ samples: [] }))]);
    const gaps = smp.samples.filter((x) => x.topicId === topicId && x.gap && !x.gapState && x.status !== 'rejected');
    const added = new Set();          // 這次加入判斷標準的建議（儲存後標記為已加入）
    const sets = meta.optionSets;
    const active = topic.active !== false;
    box.innerHTML = `${topicPicker(meta, topicId, 'topic')}
      ${active ? '' : `<div class="banner warn">${esc(t('tInactiveNote'))}</div>`}
      <div class="card pad" style="display:flex;flex-direction:column;gap:16px">
      <div class="form">
        <label class="k">${esc(t('tName'))}</label><div class="row"><input type="text" id="tn_zh" value="${esc(topic.name && topic.name.zh)}" placeholder="${esc(t('zhL'))}" style="width:200px"><input type="text" id="tn_en" value="${esc(topic.name && topic.name.en)}" placeholder="${esc(t('enL'))}" style="width:220px"></div>
        <label class="k">${esc(t('tPrompt'))}</label><div style="display:flex;flex-direction:column;gap:6px;width:min(520px,100%)"><input type="text" id="tp_zh" value="${esc(topic.prompt && topic.prompt.zh)}" placeholder="${esc(t('zhL'))}" style="width:100%"><input type="text" id="tp_en" value="${esc(topic.prompt && topic.prompt.en)}" placeholder="${esc(t('enL'))}" style="width:100%"></div>
        <label class="k" for="t_set">${esc(t('tDefaultSet'))}</label><select id="t_set"><option value="">${esc(t('none'))}</option>${sets.map((o) => `<option value="${esc(o.setId)}" ${o.setId === topic.defaultOptionSet ? 'selected' : ''}>${esc(L(o.name))}</option>`).join('')}</select>
      </div>
      ${gaps.length ? `<div class="gapbox"><b>💡 ${esc(t('gapListTitle', { n: gaps.length }))}</b><div class="small muted" style="margin:2px 0 8px">${esc(t('gapListHint'))}</div>
        ${gaps.map((g) => `<div class="gaprow" data-gap="${esc(g.sampleId)}"><div class="row"><a href="#/library/${esc(g.sampleId)}"><b>${esc(g.sampleId)}</b></a><span class="small">${esc(g.gap)}</span><span class="spacer"></span>
          <button class="btn sm ghost" type="button" data-gi="${esc(g.sampleId)}">${esc(t('gapIgnore'))}</button><button class="btn sm" type="button" data-ga="${esc(g.sampleId)}">${esc(t('gapAppend'))}</button></div>
          ${g.gapSuggestion ? `<pre class="gapsug">${esc(g.gapSuggestion)}</pre>` : ''}</div>`).join('')}</div>` : ''}
      <div><div class="row" style="margin-bottom:6px"><b>${esc(t('tCriteria'))}</b><span class="chip info">${esc(topic.criteriaVersion || '')}</span></div><div class="small muted" style="margin-bottom:6px">${esc(t('tCriteriaNote'))}</div>${ta('t_crit', 14, topic.criteria || '')}</div>
      <div><b>${esc(t('tKeyFactors'))}</b>${ta('t_kf', 6, lines(topic.keyFactors))}</div>
      <div class="small muted">${esc(t('tReasonsMoved'))} <a href="#/settings?tab=dms">${esc(t('setDms'))} →</a></div>
      <div><b>${esc(t('tRules'))}</b>${ta('t_rules', 12, topic.rules || '')}</div>
      <div><b>${esc(t('tGrading'))}</b><div class="small muted" style="margin:2px 0 6px">${esc(t('tGradingHint'))}</div>${ta('t_grade', 7, topic.gradingGuide || (DB().gradingGuide || ''))}</div>
      <details><summary class="small">${esc(t('tHistory'))}（${(topic.history || []).length}）</summary>${(topic.history || []).length ? (topic.history || []).slice().reverse().map((h) => `<div style="margin-top:10px"><span class="chip">${esc(h.version)}</span> <span class="small muted">${esc(t('tUntil', { t: fmtDT(h.until) }))} · ${esc(h.by || '')}</span><pre class="small" style="white-space:pre-wrap;background:var(--chip);padding:10px;border-radius:8px">${esc(h.criteria)}</pre></div>`).join('') : `<div class="small muted" style="margin-top:8px">${esc(t('tNoHistory'))}</div>`}</details>
      <div class="row"><button class="btn brand" id="t_save" disabled>${esc(t('tSave'))}</button><span class="spacer"></span><button class="btn ${active ? 'danger' : ''}" id="t_act" type="button">${esc(t(active ? 'tDisable' : 'tEnable'))}</button></div></div>`;
    let dirty = false;
    const appendGap = (id) => {
      const g = gaps.find((x) => x.sampleId === id); if (!g || added.has(id)) return;
      const ta2 = $('#t_crit'); ta2.value = ta2.value.replace(/\s+$/, '') + '\n' + (g.gapSuggestion || g.gap);
      added.add(id); dirty = true; $('#t_save').disabled = false;
      const b = $(`[data-ga="${id}"]`, box); if (b) { b.textContent = t('gapAppended'); b.disabled = true; }
      ta2.scrollIntoView({ block: 'center' }); ta2.focus();
    };
    $$('[data-ga]', box).forEach((b) => b.addEventListener('click', () => appendGap(b.dataset.ga)));
    $$('[data-gi]', box).forEach((b) => b.addEventListener('click', async () => {
      try { await api('tw_setGap', { sampleId: b.dataset.gi, state: 'dismissed' }); const r = $(`[data-gap="${b.dataset.gi}"]`, box); if (r) r.remove(); added.delete(b.dataset.gi); toast(t('gapIgnored')); } catch (e) { toast(e.message, 4000); }
    }));
    const wantGap = new URLSearchParams(location.hash.split('?')[1] || '').get('gap');
    if (wantGap) setTimeout(() => appendGap(wantGap), 0);
    $('#tp_imp').onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      let data; try { data = JSON.parse(await f.text()); } catch (_) { toast(t('seedBad'), 4000); return; }
      const tp = data.topic || {};
      if (!(await confirmBox(t('tImportConfirm', { n: (tp.name && tp.name.zh) || tp.topicId || '?', g: (data.tags || []).length, o: (data.optionSets || []).length }), t('tImport')))) { e.target.value = ''; return; }
      try { const r = await api('tw_importTopic', { data }); topicsCache = null; libMeta = null; toast(t('tImported', { n: r.topicId }), 4000); location.hash = '#/settings?tab=topic&topic=' + r.topicId; }
      catch (err) { toast(err.message, 6000); e.target.value = ''; }
    };
    $('#tp_new').onclick = () => addTopicDialog(meta).then((tp) => { if (tp) { topicsCache = null; libMeta = null; dirty = false; leaveGuard = null; location.hash = '#/settings?tab=topic&topic=' + tp.topicId; } });
    $('#t_act').onclick = async () => {
      if (dirty && !window.confirm(t('unsavedLeave'))) return;
      if (active && !(await confirmBox(t('tDisableConfirm', { n: L(topic.name) }), t('tDisable'), t('cancel'), true))) return;
      try { await api('tw_saveTopic', { topicId, baseUpdatedAt: topic.updatedAt, patch: { active: !active } }); dirty = false; leaveGuard = null; topicsCache = null; libMeta = null; toast(t(active ? 'tDisabled' : 'tEnabled')); viewSettings(); }
      catch (e) { toast(e.message, 5000); }
    };
    const mark = () => { dirty = true; $('#t_save').disabled = false; };
    $$('input,textarea,select', box).forEach((el) => el.addEventListener('input', mark));
    leaveGuard = () => !dirty || window.confirm(t('unsavedLeave'));
    $('#t_save').onclick = async () => {
      const crit = $('#t_crit').value;
      if (crit.trim() !== String(topic.criteria || '').trim()) {
        const v = topic.criteriaVersion || '';
        const next = /^v\d+$/.test(v) ? 'v' + (Number(v.slice(1)) + 1) : 'v2';
        if (!(await confirmBox(t('tBumpConfirm', { a: v, b: next }), t('save')))) return;
      }
      $('#t_save').disabled = true;
      try {
        const r = await api('tw_saveTopic', { topicId, baseUpdatedAt: topic.updatedAt, patch: {
          name: { zh: $('#tn_zh').value.trim(), en: $('#tn_en').value.trim() },
          prompt: { zh: $('#tp_zh').value.trim(), en: $('#tp_en').value.trim() },
          defaultOptionSet: $('#t_set').value, criteria: crit, keyFactors: unlines($('#t_kf').value), rules: $('#t_rules').value, gradingGuide: $('#t_grade').value,
        } });
        if (added.size) await api('tw_setGap', { sampleIds: [...added], state: 'added' }).catch(() => null);
        dirty = false; leaveGuard = null; topicsCache = null; libMeta = null;
        toast(r.bumped ? t('tBumped', { v: r.bumped }) : t('tSaved'), 3500);
        const h = '#/settings?tab=topic&topic=' + topicId; if (location.hash !== h) location.hash = h; else viewSettings();
      } catch (e) { toast(e.message, 5000); $('#t_save').disabled = false; }
    };
  }

  async function setTagsTab(box) {
    const meta = await api('t_topics');
    const topicId = pickedTopic(meta);
    const rows = meta.tags.filter((x) => x.topicId === topicId).map((x) => Object.assign({ inactive: false }, x))
      .concat((meta.inactiveTags || []).filter((x) => x.topicId === topicId).map((x) => Object.assign({ inactive: true }, x)));
    box.innerHTML = `${topicPicker(meta, topicId, 'tags')}<div class="row" style="margin-bottom:10px"><span class="spacer"></span><button class="btn" id="tg_new">${esc(t('addTagBtn'))}</button></div>
      ${rows.length ? `<div class="card scroll-x"><table class="list"><thead><tr><th>${esc(t('tagCol'))}</th><th>${esc(t('descCol'))}</th><th>${esc(t('stateCol'))}</th><th></th></tr></thead><tbody>${rows.map((x) => `<tr><td><b>${esc(x.name.zh)}</b><div class="small muted">${esc(x.name.en)}</div></td><td class="small">${esc(x.desc || '')}</td><td>${x.inactive ? `<span class="chip warn">${esc(t('tagInactive'))}</span>` : `<span class="chip ok">${esc(t('enabled'))}</span>`}</td><td style="text-align:right"><button class="btn sm" data-tg="${esc(x.tagId)}">${esc(t('editBtn'))}</button></td></tr>`).join('')}</tbody></table></div>` : `<div class="card empty-state">${esc(t('noTags'))}</div>`}`;
    const done = (r) => { if (r) { topicsCache = null; libMeta = null; viewSettings(); } };
    $('#tg_new').onclick = () => addTagDialog(meta, topicId).then(done);
    $$('[data-tg]', box).forEach((b) => b.addEventListener('click', () => addTagDialog(meta, topicId, rows.find((x) => x.tagId === b.dataset.tg)).then(done)));
  }

  async function setOptionsTab(box) {
    const meta = await api('t_topics');
    const tops = await Promise.all(meta.topics.map((x) => api('tw_getTopic', { topicId: x.topicId })));
    const def = new Set(tops.map((r) => r.topic.defaultOptionSet));
    box.innerHTML = `<div class="row" style="margin-bottom:10px"><span class="spacer"></span><button class="btn" id="op_new">＋ ${esc(t('optAdd'))}</button></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px">${meta.optionSets.map((o) => `<div class="card pad" style="display:flex;flex-direction:column;gap:8px">
        <div class="row"><b>${esc(L(o.name))}</b>${def.has(o.setId) ? `<span class="chip info">${esc(t('optIsDefault'))}</span>` : ''}<span class="spacer"></span><button class="btn sm" data-op="${esc(o.setId)}">${esc(t('editBtn'))}</button></div>
        <ol class="small" style="margin:0;padding-left:20px">${o.options.map((x) => `<li>${esc(x.text.zh)} <span class="muted">/ ${esc(x.text.en)}</span></li>`).join('')}</ol></div>`).join('')}</div>`;
    const open = (o) => optionSetDialog(o, !!o && def.has(o.setId)).then((r) => { if (r) { topicsCache = null; libMeta = null; viewSettings(); } });
    $('#op_new').onclick = () => open(null);
    $$('[data-op]', box).forEach((b) => b.addEventListener('click', () => open(meta.optionSets.find((x) => x.setId === b.dataset.op))));
  }

  function optionSetDialog(set, isDefault) {
    const opts = set ? clone(set.options) : [{ text: { zh: '', en: '' } }, { text: { zh: '', en: '' } }];
    const inStyle = 'flex:1;min-width:120px;height:36px;border:1px solid var(--line2);border-radius:8px;padding:0 10px';
    return modal(`<h2>${esc(t(set ? 'optEdit' : 'optAdd'))}</h2>
      <div class="form" style="margin-top:12px"><label class="k">${esc(t('optName'))}</label><div class="row"><input id="os_zh" placeholder="${esc(t('zhL'))}" value="${esc(set ? set.name.zh : '')}" style="width:160px"><input id="os_en" placeholder="${esc(t('enL'))}" value="${esc(set ? set.name.en : '')}" style="width:180px"></div></div>
      <div style="margin-top:12px"><b class="small">${esc(t('optItems'))}</b><div id="os_rows" style="display:flex;flex-direction:column;gap:6px;margin-top:6px"></div><button class="btn sm" id="os_add" type="button" style="margin-top:8px">${esc(t('optAddRow'))}</button></div>
      <div class="row" style="margin-top:16px">${set && !isDefault ? `<button class="btn danger" id="os_del" type="button">${esc(t('optDel'))}</button>` : ''}<span class="spacer"></span><button class="btn" data-close="">${esc(t('cancel'))}</button><button class="btn brand" id="os_ok" type="button">${esc(t('save'))}</button></div>`,
    { wide: true, onMount: (el, close) => {
      const draw = () => {
        $('#os_rows', el).innerHTML = opts.map((o, i) => `<div class="row" style="gap:6px"><b class="mono" style="width:18px">${String.fromCharCode(97 + i)}.</b><input data-i="${i}" data-l="zh" value="${esc(o.text.zh)}" placeholder="${esc(t('zhL'))}" style="${inStyle}"><input data-i="${i}" data-l="en" value="${esc(o.text.en)}" placeholder="${esc(t('enL'))}" style="${inStyle}">${opts.length > 2 ? `<button class="btn sm ghost" data-rm="${i}" type="button" aria-label="remove">✕</button>` : ''}</div>`).join('');
        $$('[data-i]', el).forEach((inp) => inp.addEventListener('input', () => { opts[+inp.dataset.i].text[inp.dataset.l] = inp.value; }));
        $$('[data-rm]', el).forEach((b) => b.addEventListener('click', () => { opts.splice(+b.dataset.rm, 1); draw(); }));
      };
      draw();
      $('#os_add', el).onclick = () => { if (opts.length < 8) { opts.push({ text: { zh: '', en: '' } }); draw(); } };
      $('#os_ok', el).onclick = async () => {
        try { const r = await api('tw_saveOptionSet', { setId: set ? set.setId : '', name: { zh: $('#os_zh', el).value.trim(), en: $('#os_en', el).value.trim() }, options: opts }); toast(t('optSaved')); close(r); }
        catch (e) { toast(e.message, 4500); }
      };
      const del = $('#os_del', el);
      if (del) del.onclick = async () => {
        if (!(await confirmBox(t('optDelConfirm', { n: L(set.name) }), t('optDel'), t('cancel'), true))) return;
        try { await api('tw_deleteOptionSet', { setId: set.setId }); toast(t('optDeleted')); close({ deleted: true }); } catch (e) { toast(e.message, 4500); }
      };
    } });
  }

  async function setDmsTab(box) {
    const { dms } = await api('tw_getDms');
    const rows = clone(dms.reasons);
    const SOL = ['Return and Refund', 'Refund Only'];
    const cell = 'height:34px;border:1px solid var(--line2);border-radius:8px;padding:0 8px;width:100%;min-width:0';
    box.innerHTML = `${dms.saved ? '' : `<div class="banner info">${esc(t('dmsDefault'))}</div>`}
      <div class="card pad" style="display:flex;flex-direction:column;gap:12px">
        <div><b>${esc(t('dmsReasons'))}</b><div class="small muted" style="margin-top:4px">${esc(t('dmsReasonsHint'))}</div></div>
        <div class="scroll-x"><table class="list dms"><thead><tr><th>${esc(t('dmsZh'))}</th><th>${esc(t('dmsEn'))}</th><th style="text-align:center">Return and Refund</th><th style="text-align:center">Refund Only</th><th>${esc(t('dmsAliases'))}</th><th></th></tr></thead><tbody id="dm_rows"></tbody></table></div>
        <div><button class="btn sm" id="dm_add" type="button">${esc(t('dmsAdd'))}</button></div>
        <div><b>${esc(t('dmsNotes'))}</b><div class="small muted" style="margin:4px 0 6px">${esc(t('dmsNotesHint'))}</div>${ta('dm_notes', 6, dms.notes || '')}</div>
        <div class="row"><button class="btn brand" id="dm_save" ${dms.saved ? 'disabled' : ''}>${esc(t('save'))}</button></div></div>`;
    let dirty = !dms.saved;
    const mark = () => { dirty = true; $('#dm_save').disabled = false; };
    const draw = () => {
      $('#dm_rows').innerHTML = rows.map((r, i) => `<tr><td><input data-i="${i}" data-k="zh" value="${esc(r.zh)}" style="${cell};min-width:150px"></td><td><input data-i="${i}" data-k="en" value="${esc(r.en)}" style="${cell};min-width:330px"></td>
        ${SOL.map((x) => `<td style="text-align:center"><input type="checkbox" data-i="${i}" data-sol="${x}" ${r.solutions.includes(x) ? 'checked' : ''} aria-label="${esc(r.zh)} ${x}"></td>`).join('')}
        <td><input data-i="${i}" data-k="aliases" value="${esc((r.aliases || []).join('; '))}" placeholder="${esc(t('dmsAliasPh'))}" style="${cell};min-width:160px"></td>
        <td><button class="btn sm ghost danger" data-rm="${i}" type="button" aria-label="${esc(t('qeDel'))}">✕</button></td></tr>`).join('');
      $$('#dm_rows input[data-k]').forEach((el) => el.addEventListener('input', () => { const r = rows[+el.dataset.i]; if (el.dataset.k === 'aliases') r.aliases = el.value.split(';').map((x) => x.trim()).filter(Boolean); else r[el.dataset.k] = el.value; mark(); }));
      $$('#dm_rows input[data-sol]').forEach((el) => el.addEventListener('change', () => { const r = rows[+el.dataset.i]; r.solutions = SOL.filter((x) => (x === el.dataset.sol ? el.checked : r.solutions.includes(x))); mark(); }));
      $$('#dm_rows [data-rm]').forEach((b) => b.addEventListener('click', () => { rows.splice(+b.dataset.rm, 1); mark(); draw(); }));
    };
    draw();
    $('#dm_add').onclick = () => { rows.push({ zh: '', en: '', solutions: ['Return and Refund'], aliases: [] }); mark(); draw(); };
    $('#dm_notes').addEventListener('input', mark);
    leaveGuard = () => !dirty || !dms.saved || window.confirm(t('unsavedLeave'));
    $('#dm_save').onclick = async () => {
      $('#dm_save').disabled = true;
      try { const r = await api('tw_saveDms', { reasons: rows, notes: $('#dm_notes').value, baseUpdatedAt: dms.updatedAt }); dmsRules = r.dms; topicsCache = null; libMeta = null; dirty = false; leaveGuard = null; toast(t('dmsSaved')); viewSettings(); }
      catch (e) { toast(e.message, 5000); $('#dm_save').disabled = false; }
    };
  }

  async function setRolesTab(box) {
    const r = await api('tw_listRoles');
    const roleName = (x) => t(x === 'admin' ? 'roleAdmin' : x === 'tw' ? 'roleTw' : 'roleBpo');
    const fld = 'height:38px;border:1px solid var(--line2);border-radius:8px;padding:0 10px';
    box.innerHTML = `<div class="card pad" style="margin-bottom:12px"><form id="rf" class="row" style="gap:8px"><b>${esc(t('roleAdd'))}</b><input id="r_email" type="email" placeholder="name@shopee.com" required style="${fld};width:min(300px,100%)"><select id="r_role" style="${fld}"><option value="admin">${esc(t('roleAdmin'))}</option><option value="tw">${esc(t('roleTw'))}</option><option value="bpo" selected>${esc(t('roleBpo'))}</option></select><button class="btn brand" type="submit">${esc(t('add'))}</button></form><div class="small muted" style="margin-top:8px">${esc(t('roleHint'))}<br>${esc(t('roleAdminHint'))}</div></div>
      <div class="card scroll-x"><table class="list"><thead><tr><th>${esc(t('roleEmail'))}</th><th>${esc(t('roleRole'))}</th><th class="hide-sm">${esc(t('roleBy'))}</th><th></th></tr></thead><tbody>
      ${r.owner && !r.roles.some((x) => x.email === r.owner) ? `<tr><td>${esc(r.owner)}</td><td><span class="chip brand">${esc(t('roleOwner'))}</span></td><td class="hide-sm"></td><td></td></tr>` : ''}
      ${r.roles.map((x) => `<tr><td>${esc(x.email)}</td><td><span class="chip ${x.role === 'admin' ? 'warn' : x.role === 'tw' ? 'brand' : 'info'}">${esc(roleName(x.role))}</span>${x.email === r.owner ? ` <span class="chip">${esc(t('roleOwner'))}</span>` : ''}</td><td class="hide-sm small muted">${esc(x.addedBy)}</td><td style="text-align:right">${x.email === me.email ? '' : `<button class="btn sm danger" data-rm="${esc(x.email)}">${esc(t('roleRemove'))}</button>`}</td></tr>`).join('')}
      </tbody></table></div>`;
    $('#rf').addEventListener('submit', async (e) => {
      e.preventDefault();
      try { const x = await api('tw_setRole', { email: $('#r_email').value, role: $('#r_role').value }); toast(t('roleAdded', { e: x.email })); viewAdmin(); } catch (err) { toast(err.message, 4500); }
    });
    $$('[data-rm]', box).forEach((b) => b.addEventListener('click', async () => {
      if (!(await confirmBox(t('roleRemoveConfirm', { e: b.dataset.rm }), t('roleRemove'), t('cancel'), true))) return;
      try { await api('tw_removeRole', { email: b.dataset.rm }); toast(t('roleRemoved', { e: b.dataset.rm })); viewAdmin(); } catch (err) { toast(err.message, 4500); }
    }));
  }

  async function setSystemTab(box) {
    const r = await api('tw_getSettings');
    const keys = Object.keys(r.values);
    box.innerHTML = `<div class="card scroll-x"><table class="list"><thead><tr><th>${esc(t('sysKey'))}</th><th>${esc(t('sysNote'))}</th><th>${esc(t('sysValue'))}</th><th></th></tr></thead><tbody>${keys.map((k) => `<tr><td class="mono small">${esc(k)}</td><td class="small">${esc(r.values[k].note || '')}</td><td><input type="number" step="any" min="0" data-k="${esc(k)}" value="${esc(r.values[k].value)}" style="width:96px;height:34px;border:1px solid var(--line2);border-radius:8px;padding:0 8px"></td><td style="text-align:right"><button class="btn sm" data-sv="${esc(k)}">${esc(t('save'))}</button></td></tr>`).join('')}</tbody></table></div>`;
    $$('[data-sv]', box).forEach((b) => b.addEventListener('click', async () => {
      const k = b.dataset.sv, v = $(`[data-k="${k}"]`, box).value;
      try { await api('tw_saveSetting', { key: k, value: v }); toast(t('sysSaved')); } catch (e) { toast(e.message, 4500); }
    }));
  }

  // ───────── 管理（只有管理員）：講師名單、刪除權限、系統設定、V1 資料搬移 ─────────
  async function viewAdmin() {
    const params = new URLSearchParams(location.hash.split('?')[1] || '');
    const TABS = ['roles', 'perms', 'system', 'v1', 'reset'];
    const NAMES = { roles: 'setRoles', perms: 'setPerms', system: 'setSystem', v1: 'setV1', reset: 'setReset' };
    const tab = TABS.includes(params.get('tab')) ? params.get('tab') : 'roles';
    shell('admin', `<div class="row"><h1>${esc(t('navAdmin'))}</h1><span class="small muted">${esc(t('adminHint'))}</span></div>
      <div class="tabs">${TABS.map((k) => `<a class="tab ${k === tab ? 'on' : ''}" href="#/admin?tab=${k}">${esc(t(NAMES[k]))}</a>`).join('')}</div><div id="sp" style="margin-top:14px"><div class="empty-state"><span class="spin"></span></div></div>`);
    const box = $('#sp');
    try {
      if (tab === 'roles') await setRolesTab(box);
      else if (tab === 'perms') await setPermsTab(box);
      else if (tab === 'system') await setSystemTab(box);
      else if (tab === 'reset') await setResetTab(box);
      else setV1Tab(box);
    } catch (e) { showError(e, box); }
  }

  async function setPermsTab(box) {
    const r = await api('ad_getPerms');
    const perms = JSON.parse(JSON.stringify(r.perms));
    const PAGE = { bankQ: 'navBank', draft: 'navDrafts', draftQ: 'navDrafts', session: 'navSessions', sample: 'navLibrary', request: 'navLibrary' };
    const ROLES = ['admin', 'tw', 'bpo'], RN = { admin: 'roleAdmin', tw: 'roleTw', bpo: 'roleBpo' };
    const cell = (k, role) => {
      if (role === 'admin') return `<input type="checkbox" checked disabled title="${esc(t('permAdminAlways'))}">`;
      if (role === 'bpo' && r.twOnly.includes(k)) return `<span class="soft" title="${esc(t('permTwOnly'))}">—</span>`;
      return `<input type="checkbox" data-pk="${k}" data-pr="${role}" ${perms[k].includes(role) ? 'checked' : ''}>`;
    };
    box.innerHTML = `<div class="card scroll-x"><table class="list"><thead><tr><th>${esc(t('permPage'))}</th><th>${esc(t('permAction'))}</th>${ROLES.map((x) => `<th style="text-align:center">${esc(t(RN[x]))}</th>`).join('')}</tr></thead><tbody>
      ${r.keys.map((k) => `<tr><td class="small">${esc(t(PAGE[k]))}</td><td><b>${esc(t('perm_' + k))}</b><div class="small soft">${esc(t('permd_' + k))}</div></td>${ROLES.map((x) => `<td style="text-align:center">${cell(k, x)}</td>`).join('')}</tr>`).join('')}
      </tbody></table></div>
      <div class="row" style="margin-top:12px"><span class="small muted">${esc(t('permHint'))}${r.updatedBy ? ' · ' + esc(t('permLast', { by: r.updatedBy, at: fmtDT(r.updatedAt) })) : ''}</span><span class="spacer"></span><button class="btn brand" id="pm_save" disabled>${esc(t('save'))}</button></div>`;
    $$('[data-pk]', box).forEach((c) => c.addEventListener('change', () => {
      const a = perms[c.dataset.pk], role = c.dataset.pr;
      if (c.checked && !a.includes(role)) a.push(role); else if (!c.checked) perms[c.dataset.pk] = a.filter((x) => x !== role);
      $('#pm_save').disabled = false;
    }));
    $('#pm_save').onclick = async () => {
      $('#pm_save').disabled = true;
      try { await api('ad_savePerms', { perms }); me = await api('me'); toast(t('permSaved')); viewAdmin(); } catch (e) { toast(e.message, 5000); $('#pm_save').disabled = false; }
    };
  }

  async function setResetTab(box) {
    const r = await api('ad_resetData', { dryRun: true }), c = r.counts;
    box.innerHTML = `<div class="card pad" style="display:flex;flex-direction:column;gap:12px;max-width:820px"><h2>${esc(t('resetTitle'))}</h2>
      <div class="banner err">${esc(t('resetWarn'))}</div>
      <table class="list"><tbody>${[['drafts', 'navDrafts'], ['bank', 'navBank'], ['sessions', 'navSessions'], ['results', 'resetResults'], ['samples', 'resetSamples'], ['requests', 'resetRequests']].map(([k, l]) => `<tr><td>${esc(t(l))}</td><td style="text-align:right"><b>${c[k]}</b></td></tr>`).join('')}</tbody></table>
      <div class="small muted">${esc(t('resetKeep'))}</div>
      <div class="row" style="gap:8px"><input id="rs_in" placeholder="RESET" style="height:38px;border:1px solid var(--line2);border-radius:8px;padding:0 10px;width:160px"><button class="btn danger" id="rs_go" disabled>${esc(t('resetBtn'))}</button></div></div>`;
    $('#rs_in').oninput = () => { $('#rs_go').disabled = $('#rs_in').value.trim() !== 'RESET'; };
    $('#rs_go').onclick = async () => {
      if (!(await confirmBox(t('resetConfirm'), t('resetBtn'), t('cancel'), true))) return;
      $('#rs_go').disabled = true; $('#rs_go').innerHTML = `<span class="spin"></span> ${esc(t('resetRunning'))}`;
      try { await api('ad_resetData', { confirm: 'RESET' }); topicsCache = null; libMeta = null; toast(t('resetDone'), 5000); viewAdmin(); }
      catch (e) { toast(e.message, 8000); $('#rs_go').disabled = false; $('#rs_go').textContent = t('resetBtn'); }
    };
  }

  function setV1Tab(box) {
    box.innerHTML = `<div class="card pad" style="display:flex;flex-direction:column;gap:10px;max-width:820px"><h2>${esc(t('v1Title'))}</h2>
      <div class="small muted">${esc(t('v1Hint'))}</div>
      <div><label class="btn" style="display:inline-flex;align-items:center">${esc(t('v1Pick'))}<input type="file" id="v1f" accept=".json,application/json" hidden></label></div>
      <div id="v1v" class="small"></div></div>`;
    let v1data = null;
    const v1Sum = (r) => {
      const map = (o) => Object.entries(o || {}).map(([a, b]) => a + '→' + b).join('、');
      return `<div class="banner ${r.dryRun ? 'info' : 'ok'}">${esc(t(r.dryRun ? 'v1Plan' : 'v1Done', { b: r.bank, s: r.samples, e: r.sessions, a: r.attempts, r: r.released, g: r.tags }))}</div>
        ${r.outdated ? `<div class="small">${esc(t('v1Outdated', { n: r.outdated }))}</div>` : ''}
        ${(r.notClosed || []).length ? `<div class="banner warn">${esc(t('v1Open', { list: r.notClosed.join('、') }))}</div>` : ''}
        ${(r.warnings || []).length ? `<details><summary class="small">${esc(t('v1Warn', { n: r.warnings.length }))}</summary><ul class="small">${r.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></details>` : ''}
        ${r.dryRun ? '' : `<details><summary class="small">${esc(t('v1Map'))}</summary><div class="small mono" style="line-height:1.8">${esc(map(r.map.sessions))}<br>${esc(map(r.map.bank))}<br>${esc(map(r.map.samples))}</div></details>`}`;
    };
    $('#v1f').onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      $('#v1v').innerHTML = `<span class="spin"></span>`;
      try { v1data = JSON.parse(await f.text()); } catch (_) { $('#v1v').textContent = t('seedBad'); return; }
      try {
        const r = await api('tw_importV1', { data: v1data, dryRun: true });
        $('#v1v').innerHTML = `<div style="display:flex;flex-direction:column;gap:8px">${v1Sum(r)}<div><button class="btn brand" id="v1run">${esc(t('v1Run'))}</button></div></div>`;
        $('#v1run').onclick = async () => {
          if (!(await confirmBox(t('v1Confirm'), t('v1Run')))) return;
          $('#v1run').disabled = true; $('#v1run').innerHTML = `<span class="spin"></span> ${esc(t('v1Running'))}`;
          try { const r2_ = await api('tw_importV1', { data: v1data }); topicsCache = null; libMeta = null; $('#v1v').innerHTML = `<div style="display:flex;flex-direction:column;gap:8px">${v1Sum(r2_)}</div>`; toast(t('v1Toast'), 5000); }
          catch (err) { toast(err.message, 8000); $('#v1run').disabled = false; $('#v1run').textContent = t('v1Run'); }
        };
      } catch (err) { $('#v1v').innerHTML = `<div class="banner warn">${esc(err.message)}</div>`; }
      e.target.value = '';
    };
  }

  // ───────── start ─────────
  document.documentElement.lang = lang === 'zh' ? 'zh-Hant' : 'en';
  const start = () => {
    if (!DB() || DB().error) { authKnown = true; renderLogin(); return; }
    DB().onAuth((u) => {
      authKnown = true; me = null; auth = u ? { email: u.email } : null;
      if (!auth) { renderLogin(); return; }
      boot();
    });
  };
  route();
  if (window.RRQP_DB) start(); else window.addEventListener('rrqp-db-ready', start, { once: true });
})();
