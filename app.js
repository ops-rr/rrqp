/* RR Quiz Platform — 前端（M3 講師草稿與校對、M4 發佈與作答） */
(() => {
  'use strict';
  const CFG = window.RRQP_CONFIG || {};
  const PREVIEW = !!window.RRQP_MOCK;
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
  let lang = store.get('rrqp:lang') === 'en' ? 'en' : 'zh';
  const I18N = {
    zh: {
      appSub: 'RR 部門線上測驗平台', signIn: '請使用公司 Google 帳號登入', signOut: '登出', teacherPortal: '講師後台',
      reLogin: '登入已失效，請重新登入', noConfig: '尚未設定 config.js（SCRIPT_URL / CLIENT_ID）', loading: '載入中…',
      navLibrary: '範例庫', navDrafts: '草稿', navSessions: '測驗場次', navGrading: '批改', navResults: '成績', soon: '即將推出',
      drafts: '草稿', newDraft: '建立草稿', name: '草稿名稱', topic: '主題', tags: '重點標籤', tagsHint: '不選代表涵蓋全部', target: '題數',
      mix: '題型配比', typeA: 'A 選擇', typeB: 'B 選擇＋原因', typeC: 'C 文字', mixSum: '合計 {n} 題', create: '建立', cancel: '取消',
      created: '草稿 {id} 已建立', cmdHint: '複製下面的指令，到 SeaTalk @RR Quiz Assistant 貼上，Agent 會開始生成題目。',
      copy: '複製', copied: '已複製', open: '開啟', copyCmd: '複製指令', refresh: '重新整理',
      colDraft: '草稿', colTopic: '主題', colProgress: '進度', colStatus: '狀態', colBy: '建立者', colUpdated: '更新時間',
      st_generating: '生成中', st_draft: '待校對', st_ready: '可發佈', generated: '已生成 {a} / {b}', reviewedN: '已校對 {a} / {b}',
      noDrafts: '還沒有草稿。按「建立草稿」開始。', back: '← 草稿',
      genBanner: 'Agent 正在生成題目（{a} / {b}）。若尚未開始，請到 SeaTalk @RR Quiz Assistant 貼上：',
      genAuto: '此頁每 15 秒自動更新。', markReady: '標記為可發佈', unready: '退回校對', readyDone: '草稿已標記為可發佈',
      readyNeed: '還有 {n} 題未校對', prev: '上一題', next: '下一題', save: '儲存', saved: '已儲存', saving: '儲存中…',
      markReviewed: '確認並標記已校對', unmarkReviewed: '取消已校對', reviewedTag: '已校對', notReviewed: '未校對',
      editJson: '編輯 JSON', apply: '套用', jsonBad: 'JSON 格式錯誤：', del: '刪除', delRefill: '刪除並請 Agent 補一題', delOnly: '刪除，題數減 1',
      delConfirm: '確定刪除 {id}？', delRefillDone: '已刪除。請到 SeaTalk 再傳一次「{cmd}」補題。', delDone: '已刪除',
      unsaved: '這題有未儲存的修改，要放棄嗎？', discard: '放棄修改', keep: '繼續編輯',
      answerHint: '點選項可改正解', correct: '正解', setAnswer: '設為正解',
      prompt: '題目', buyer: '買家', seller: '賣家', chat: '聊聊', drc: 'DRC', drcBuyer: '買家 → 蝦皮', drcSeller: '賣家 → 蝦皮',
      request: '退貨退款申請', solution: '方案', amount: '金額', reason: '原因', remark: '備註', reqItems: '申退商品', orderItems: '訂單商品',
      item: '商品', variation: '規格', qty: '數量', price: '單價', subtotal: '小計', payment: '付款', method: '方式', status: '狀態', logistics: '物流',
      options: '選項', point: '判斷重點', explanation: '解析', modelAnswer: '參考答案', rubric: '評分標準', warnings: '系統提醒',
      agentHome: '目前沒有指派給你的測驗', agentHomeSub: '講師發佈測驗後，你會在這裡看到測驗連結。', none: '—',
      errTitle: '發生錯誤', sticker: '貼圖', criteria: '判斷標準',
    },
    en: {
      appSub: 'RR online quiz platform', signIn: 'Sign in with your company Google account', signOut: 'Sign out', teacherPortal: 'Trainer Console',
      reLogin: 'Your session expired. Please sign in again.', noConfig: 'config.js is not set (SCRIPT_URL / CLIENT_ID)', loading: 'Loading…',
      navLibrary: 'Samples', navDrafts: 'Drafts', navSessions: 'Sessions', navGrading: 'Grading', navResults: 'Results', soon: 'Coming soon',
      drafts: 'Drafts', newDraft: 'New draft', name: 'Draft name', topic: 'Topic', tags: 'Focus tags', tagsHint: 'Leave empty to cover all', target: 'Questions',
      mix: 'Type mix', typeA: 'A Choice', typeB: 'B Choice + reason', typeC: 'C Written', mixSum: 'Total {n}', create: 'Create', cancel: 'Cancel',
      created: 'Draft {id} created', cmdHint: 'Copy this command and send it to @RR Quiz Assistant in SeaTalk to start generating.',
      copy: 'Copy', copied: 'Copied', open: 'Open', copyCmd: 'Copy command', refresh: 'Refresh',
      colDraft: 'Draft', colTopic: 'Topic', colProgress: 'Progress', colStatus: 'Status', colBy: 'Created by', colUpdated: 'Updated',
      st_generating: 'Generating', st_draft: 'In review', st_ready: 'Ready', generated: 'Generated {a} / {b}', reviewedN: 'Reviewed {a} / {b}',
      noDrafts: 'No drafts yet. Click "New draft" to start.', back: '← Drafts',
      genBanner: 'The agent is generating questions ({a} / {b}). If it has not started, send this to @RR Quiz Assistant in SeaTalk:',
      genAuto: 'This page refreshes every 15 seconds.', markReady: 'Mark as ready', unready: 'Back to review', readyDone: 'Draft marked as ready',
      readyNeed: '{n} question(s) not reviewed', prev: 'Previous', next: 'Next', save: 'Save', saved: 'Saved', saving: 'Saving…',
      markReviewed: 'Confirm & mark reviewed', unmarkReviewed: 'Unmark reviewed', reviewedTag: 'Reviewed', notReviewed: 'Not reviewed',
      editJson: 'Edit JSON', apply: 'Apply', jsonBad: 'Invalid JSON: ', del: 'Delete', delRefill: 'Delete and let the agent add one', delOnly: 'Delete, reduce count by 1',
      delConfirm: 'Delete {id}?', delRefillDone: 'Deleted. Send "{cmd}" in SeaTalk again to add a replacement.', delDone: 'Deleted',
      unsaved: 'This question has unsaved changes. Discard them?', discard: 'Discard', keep: 'Keep editing',
      answerHint: 'Click an option to change the answer', correct: 'Answer', setAnswer: 'Set as answer',
      prompt: 'Question', buyer: 'Buyer', seller: 'Seller', chat: 'Chat', drc: 'DRC', drcBuyer: 'Buyer → Shopee', drcSeller: 'Seller → Shopee',
      request: 'Return / refund request', solution: 'Solution', amount: 'Amount', reason: 'Reason', remark: 'Remark', reqItems: 'Requested items', orderItems: 'Order items',
      item: 'Item', variation: 'Variation', qty: 'Qty', price: 'Price', subtotal: 'Subtotal', payment: 'Payment', method: 'Method', status: 'Status', logistics: 'Logistics',
      options: 'Options', point: 'Key point', explanation: 'Explanation', modelAnswer: 'Model answer', rubric: 'Rubric', warnings: 'System notes',
      agentHome: 'No quiz assigned to you yet', agentHomeSub: 'When your trainer publishes a quiz, the link will appear here.', none: '—',
      errTitle: 'Something went wrong', sticker: 'Sticker', criteria: 'Criteria',
    },
  };
  const t = (k, vars) => String((I18N[lang][k] ?? I18N.zh[k] ?? k)).replace(/\{(\w+)\}/g, (_, v) => (vars && vars[v] !== undefined ? vars[v] : ''));
  const L = (v) => (v == null ? '' : typeof v === 'object' ? (v[lang] ?? v.zh ?? v.en ?? '') : String(v));
  function setLang(l) { if (leaveGuard && !leaveGuard()) return; leaveGuard = null; lang = l; store.set('rrqp:lang', l); document.documentElement.lang = l === 'zh' ? 'zh-Hant' : 'en'; route(); }

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

  // ───────── auth ─────────
  const TOKEN_KEY = 'rrqp:idToken';
  let auth = null, me = null;
  function decodeJwt(tok) {
    const p = tok.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(atob(p).split('').map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')));
  }
  function loadToken() {
    const tok = sess.get(TOKEN_KEY);
    if (!tok) return null;
    try { const p = decodeJwt(tok); if (p.exp * 1000 > Date.now() + 60000) return { idToken: tok, email: p.email, exp: p.exp * 1000 }; } catch (_) { /* */ }
    sess.del(TOKEN_KEY); return null;
  }
  function signOut() {
    sess.del(TOKEN_KEY); auth = null; me = null;
    try { window.google?.accounts?.id?.disableAutoSelect(); } catch (_) { /* */ }
    location.hash = ''; route();
  }
  function expired() { sess.del(TOKEN_KEY); auth = null; me = null; renderLogin(t('reLogin')); }

  // ───────── API ─────────
  async function api(action, payload = {}) {
    if (PREVIEW) return window.RRQP_MOCK.call(action, payload);
    if (!auth || auth.exp < Date.now() + 30000) { expired(); throw new Error(t('reLogin')); }
    const res = await fetch(CFG.SCRIPT_URL, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ action, idToken: auth.idToken }, payload)),
    });
    const data = await res.json();
    if (!data.ok) {
      if (/登入已失效|Sign-in expired|Not signed in/.test(data.error || '')) { expired(); }
      const err = new Error(data.error || 'Request failed'); err.data = data; throw err;
    }
    return data;
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
        <span title="${esc(t('soon'))}">${esc(t('navLibrary'))}</span>
        <a href="#/drafts" class="${active === 'drafts' ? 'on' : ''}">${esc(t('navDrafts'))}</a>
        <a href="#/sessions" class="${active === 'sessions' ? 'on' : ''}">${esc(t('navSessions'))}</a>
        <span title="${esc(t('soon'))}">${esc(t('navGrading'))}</span>
        <span title="${esc(t('soon'))}">${esc(t('navResults'))}</span></nav>` : '';
    app().innerHTML = `<header class="top">
        <div class="brandmark"><span class="logo" aria-hidden="true">S</span><span>RR Quiz Platform</span>${teacher ? `<span>${esc(t('teacherPortal'))}</span>` : ''}</div>
        ${nav}
        <div class="right">${langSeg()}<span class="muted hide-sm">${esc(me ? me.email : '')}</span><button class="btn sm ghost" data-signout>${esc(t('signOut'))}</button></div>
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
        <h1>RR Quiz Platform</h1>
        <div class="muted">${esc(t('appSub'))}</div>
        ${msg ? `<div class="banner warn" style="width:100%">${esc(msg)}</div>` : ''}
        <div class="small muted" style="margin-top:8px">${esc(t('signIn'))}</div>
        <div id="gsi"></div>
        <div id="loginErr" class="banner err" hidden></div>
        <div style="margin-top:8px">${langSeg()}</div>
      </div></div>`;
    bindCommon(app());
    if (PREVIEW) { $('#gsi').innerHTML = `<button class="btn brand" id="pv">Preview sign-in</button>`; $('#pv').onclick = () => { auth = { email: 'preview@shopee.com' }; boot(); }; return; }
    if (!CFG.CLIENT_ID || /請貼上|YOUR_/.test(CFG.CLIENT_ID) || /請貼上/.test(CFG.SCRIPT_URL || '')) { const e = $('#loginErr'); e.textContent = t('noConfig'); e.hidden = false; return; }
    const init = () => {
      if (!window.google?.accounts?.id) return setTimeout(init, 150);
      google.accounts.id.initialize({
        client_id: CFG.CLIENT_ID, auto_select: true, cancel_on_tap_outside: false,
        callback: (resp) => {
          const p = decodeJwt(resp.credential);
          sess.set(TOKEN_KEY, resp.credential);
          auth = { idToken: resp.credential, email: p.email, exp: p.exp * 1000 };
          boot();
        },
      });
      google.accounts.id.renderButton($('#gsi'), { theme: 'outline', size: 'large', text: 'signin_with', locale: lang === 'zh' ? 'zh-TW' : 'en' });
    };
    init();
  }

  async function boot() {
    app().innerHTML = `<div class="login"><div class="muted"><span class="spin"></span> ${esc(t('loading'))}</div></div>`;
    try {
      me = await api('me');
      if (!me.isTeacher && !store.get('rrqp:lang')) { lang = 'en'; document.documentElement.lang = 'en'; } // 專員預設英文
      if (!location.hash || location.hash === '#/') location.hash = me.isTeacher ? '#/drafts' : '#/';
      route();
    } catch (e) {
      if (!auth) return;
      sess.del(TOKEN_KEY); auth = null; renderLogin(e.message);
    }
  }

  // ───────── router ─────────
  let pollTimer = null;
  let leaveGuard = null; // 回傳 true 表示可以離開
  function route() {
    clearInterval(pollTimer); pollTimer = null;
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
    if (me.isTeacher && (page === 'drafts' || page === '')) return viewDrafts();
    return viewMyQuizzes();
  }
  window.addEventListener('hashchange', () => {
    if (leaveGuard && !leaveGuard()) return;
    leaveGuard = null; route();
  });

  // ───────── 草稿列表 ─────────
  let topicsCache = null;
  async function getTopics() { if (!topicsCache) topicsCache = await api('t_topics'); return topicsCache; }
  const statusChip = (s) => `<span class="chip ${s === 'ready' ? 'ok' : s === 'generating' ? 'info' : 'warn'}">${s === 'generating' ? '<span class="spin" style="width:10px;height:10px;border-width:1.5px"></span> ' : ''}${esc(t('st_' + s))}</span>`;
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
    async function loadList(silent) {
      try {
        const [{ drafts }, tp] = await Promise.all([api('t_listDrafts'), getTopics()]);
        topics = tp;
        const topicName = (id) => L((topics.topics.find((x) => x.topicId === id) || {}).name) || id;
        const box = $('#listBox'); if (!box) return;
        if (!drafts.length) { box.innerHTML = `<div class="empty-state">${esc(t('noDrafts'))}</div>`; return; }
        box.innerHTML = `<table class="list"><thead><tr><th>${esc(t('colDraft'))}</th><th>${esc(t('colTopic'))}</th><th>${esc(t('colProgress'))}</th><th>${esc(t('colStatus'))}</th><th class="hide-sm">${esc(t('colBy'))}</th><th class="hide-sm">${esc(t('colUpdated'))}</th><th></th></tr></thead><tbody>${
          drafts.map((d) => `<tr class="click" data-open="${esc(d.draftId)}">
            <td><b>${esc(d.draftId)}</b> ${esc(d.name)}<div class="small soft">${d.tags.map(esc).join(' · ')}</div></td>
            <td>${esc(topicName(d.topicId))}</td><td>${progressCell(d)}</td><td>${statusChip(d.status)}</td>
            <td class="hide-sm small muted">${esc(d.createdBy)}</td><td class="hide-sm small muted">${esc(fmtTime(d.updatedAt))}</td>
            <td style="text-align:right">${d.status === 'generating' ? `<button class="btn sm" data-copy="生成考題 ${esc(d.draftId)}">${esc(t('copyCmd'))}</button>` : `<button class="btn sm">${esc(t('open'))}</button>`}</td></tr>`).join('')
        }</tbody></table>`;
        $$('[data-copy]', box).forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); copyText(b.dataset.copy); }));
        $$('[data-open]', box).forEach((r) => r.addEventListener('click', () => { location.hash = '#/draft/' + r.dataset.open; }));
        clearInterval(pollTimer); pollTimer = null;
        if (drafts.some((d) => d.status === 'generating')) pollTimer = setInterval(() => { if (!document.hidden) loadList(true); }, 15000);
      } catch (e) { if (!silent) showError(e, $('#listBox')); }
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
      const topicOpts = tp.topics.map((x) => `<option value="${esc(x.topicId)}">${esc(L(x.name))}</option>`).join('');
      box.innerHTML = `<form class="card pad" id="cform" style="display:flex;flex-direction:column;gap:16px">
        <h2>${esc(t('newDraft'))}</h2>
        <div class="form">
          <label class="k" for="f_name">${esc(t('name'))}</label><input type="text" id="f_name" required maxlength="60" placeholder="${lang === 'zh' ? '例：寄錯商品-第1梯' : 'e.g. Wrong item - Batch 1'}">
          <label class="k" for="f_topic">${esc(t('topic'))}</label><select id="f_topic">${topicOpts}</select>
          <span class="k">${esc(t('tags'))}</span><div><div class="tags" id="f_tags"></div><div class="small soft" style="margin-top:4px">${esc(t('tagsHint'))}</div></div>
          <label class="k" for="f_target">${esc(t('target'))}</label><div class="row"><input type="number" id="f_target" min="1" max="50" value="10"></div>
          <span class="k">${esc(t('mix'))}</span><div class="row">
            <label class="small">${esc(t('typeA'))} <input type="number" id="f_A" min="0" max="50" value="3"></label>
            <label class="small">${esc(t('typeB'))} <input type="number" id="f_B" min="0" max="50" value="5"></label>
            <label class="small">${esc(t('typeC'))} <input type="number" id="f_C" min="0" max="50" value="2"></label>
            <span class="small" id="f_sum"></span></div>
        </div>
        <div id="f_err" class="banner err" hidden></div>
        <div class="row"><button type="submit" class="btn brand" id="f_go">${esc(t('create'))}</button><button type="button" class="btn" id="f_cancel">${esc(t('cancel'))}</button></div>
      </form>`;
      const drawTags = () => {
        const tid = $('#f_topic').value;
        $('#f_tags').innerHTML = tp.tags.filter((x) => x.topicId === tid).map((x) => `<label class="tag-opt"><input type="checkbox" value="${esc(x.tagId)}"> ${esc(L(x.name))}</label>`).join('');
        $$('#f_tags input').forEach((c) => c.addEventListener('change', () => c.parentElement.classList.toggle('on', c.checked)));
      };
      const sum = () => {
        const n = +$('#f_target').value || 0, s = (+$('#f_A').value || 0) + (+$('#f_B').value || 0) + (+$('#f_C').value || 0);
        $('#f_sum').innerHTML = s === n ? `<span class="chip ok">${esc(t('mixSum', { n: s }))} ✓</span>` : `<span class="chip warn">${esc(t('mixSum', { n: s }))} ≠ ${n}</span>`;
        $('#f_go').disabled = s !== n || n < 1 || n > 50;
      };
      $('#f_target').addEventListener('input', () => { // 題數改變時自動調整 B
        const n = +$('#f_target').value || 0; const a = +$('#f_A').value || 0, c = +$('#f_C').value || 0;
        $('#f_B').value = Math.max(0, n - a - c); sum();
      });
      ['#f_A', '#f_B', '#f_C'].forEach((s) => $(s).addEventListener('input', sum));
      $('#f_topic').addEventListener('change', drawTags);
      $('#f_cancel').onclick = () => { box.innerHTML = ''; };
      drawTags(); sum(); $('#f_name').focus();
      $('#cform').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = $('#f_go'); btn.disabled = true; $('#f_err').hidden = true;
        try {
          const r = await api('t_createDraft', {
            name: $('#f_name').value.trim(), topicId: $('#f_topic').value, target: +$('#f_target').value,
            tags: $$('#f_tags input:checked').map((c) => c.value),
            mix: { A: +$('#f_A').value || 0, B: +$('#f_B').value || 0, C: +$('#f_C').value || 0 },
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
  /** 題目情境（左欄 + 右欄的申請資訊）；講師與專員共用 */
  function caseHtml(q) {
    const r = q.request || {};
    const left = `<div class="prompt">${esc(L(q.prompt))}</div>
      <div class="parties">${esc(t('buyer'))} ${esc(q.buyer?.username)} (${esc(q.buyer?.id)}) · ${esc(t('seller'))} ${esc(q.seller?.username)} (${esc(q.seller?.id)})</div>
      ${q.order ? `<h4>${esc(t('orderItems'))}</h4>${itemTable(q.order.items)}` : ''}
      ${q.payment ? `<h4>${esc(t('payment'))}</h4><div class="box kv"><span>${esc(t('method'))}</span><span>${esc(L(q.payment.method))}</span><span>${esc(t('status'))}</span><span>${esc(L(q.payment.status))}</span></div>` : ''}
      ${q.logistics ? `<h4>${esc(t('logistics'))} · ${esc(L(q.logistics.carrier))}</h4><div class="box">${(q.logistics.events || []).map((e) => `<span class="soft">${esc(e.t)}</span> ${esc(L(e.status))}`).join('<br>')}</div>` : ''}
      <h4>${esc(t('chat'))}</h4><div class="chat">${(q.chat || []).map(chatMsg).join('')}</div>
      <h4>${esc(t('drc'))}</h4><div class="drc"><div class="box"><b class="small">${esc(t('drcBuyer'))}</b>${drcItems(q.drc?.buyer)}</div><div class="box"><b class="small">${esc(t('drcSeller'))}</b>${drcItems(q.drc?.seller)}</div></div>`;
    const req = `<h4>${esc(t('request'))}</h4>
      <div class="box kv"><span>${esc(t('solution'))}</span><span><b>${esc(r.solution)}</b></span><span>${esc(t('amount'))}</span><span><b>$${esc(r.amount)}</b></span>
      <span>${esc(t('reason'))}</span><span>${esc(r.reason)}</span><span>${esc(t('remark'))}</span><span>${esc(L(r.remark))}</span></div>
      ${r.items ? `<h4>${esc(t('reqItems'))}</h4>${itemTable(r.items)}` : ''}`;
    return { left, req };
  }

  // ───────── 草稿校對 ─────────
  async function viewDraft(draftId) {
    const main = shell('drafts', `<div class="empty-state"><span class="spin"></span> ${esc(t('loading'))}</div>`);
    let data;
    try { data = await api('t_getDraft', { draftId }); } catch (e) { showError(e); return; }
    let { draft, questions } = data;
    const params = new URLSearchParams((location.hash.split('?')[1]) || '');
    let idx = Math.max(0, questions.findIndex((q) => q.id === params.get('q')));
    let work = null, dirty = false, saving = false;
    const cmd = '生成考題 ' + draft.draftId;
    leaveGuard = () => !dirty || window.confirm(t('unsaved'));

    function header() {
      const all = questions.length, rev = questions.filter((q) => q.reviewed).length;
      const canReady = draft.status === 'draft' && all > 0 && rev === all;
      return `<div class="row"><a href="#/drafts">${esc(t('back'))}</a>
        <h1>${esc(draft.draftId)} ${esc(draft.name)}</h1>${statusChip(draft.status)}
        <span class="chip">${esc(t('reviewedN', { a: rev, b: all }))}</span>
        <span class="spacer"></span>
        <button class="btn" id="reload">${esc(t('refresh'))}</button>
        ${draft.status === 'ready'
          ? `<button class="btn" id="unready">${esc(t('unready'))}</button><a class="btn brand" style="display:inline-grid;place-items:center;text-decoration:none" href="#/sessions?new=${esc(draft.draftId)}">${esc(t('publishDraft'))}</a>`
          : `<button class="btn ok" id="ready" ${canReady ? '' : 'disabled'} title="${canReady ? '' : esc(t('readyNeed', { n: all - rev }))}">${esc(t('markReady'))}</button>`}
      </div>
      ${draft.status === 'generating' ? `<div class="banner info row"><span>${esc(t('genBanner', { a: draft.imported, b: draft.target }))}</span>
        <span class="cmd" style="padding:6px 12px"><code style="font-size:15px">${esc(cmd)}</code><button class="btn sm" id="cpy2">${esc(t('copy'))}</button></span><span class="small">${esc(t('genAuto'))}</span></div>` : ''}`;
    }
    function listHtml() {
      return questions.map((q, i) => {
        const opt = (q.options || []).find((o) => o.id === q.answer);
        return `<div class="qitem ${i === idx ? 'on' : ''}" data-i="${i}" role="button" tabindex="0">
          <span class="dot ${q.reviewed ? 'on' : ''}" title="${esc(q.reviewed ? t('reviewedTag') : t('notReviewed'))}">${q.reviewed ? '✓' : ''}</span>
          <span class="id">${esc(q.id.split('-').pop())}</span><span class="chip" style="padding:0 7px">${esc(q.type)}</span>
          <span class="ans">${esc(opt ? L(opt.text) : L(q.point))}</span>${q.warnings && q.warnings.length ? '<span class="wmark" title="warnings">⚠</span>' : ''}</div>`;
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
      const editable = draft.status !== 'generating';
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
        ${src.warnings && src.warnings.length ? `<div class="banner warn" style="border-radius:0;border-width:0 0 1px"><b>${esc(t('warnings'))}</b><br>${src.warnings.map(esc).join('<br>')}</div>` : ''}
        <div class="qbody"><div>${left}</div><div>${req}
          ${opts ? `<h4>${esc(t('options'))} <span class="soft">· ${esc(t('answerHint'))}</span></h4>${opts}` : ''}
          ${biField('point', t('point'), true)}
          ${q.type !== 'A' ? biField('modelAnswer', t('modelAnswer')) + biField('rubric', t('rubric')) : ''}
          ${biField('explanation', t('explanation'))}
        </div></div>
        <div id="saveErr" class="banner err" style="border-radius:0" hidden></div>
        <div class="dfoot">
          <button class="btn sm danger" id="del" ${editable ? '' : 'disabled'}>${esc(t('del'))}</button>
          <button class="btn sm" id="json" ${editable ? '' : 'disabled'}>${esc(t('editJson'))}</button>
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
        draw();
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
      const rd = $('#ready'); if (rd) rd.onclick = async () => {
        try { const r = await api('t_markReady', { draftId: draft.draftId }); draft = r.draft; toast(t('readyDone')); draw(); } catch (e) { toast(e.message, 4000); }
      };
      const ur = $('#unready'); if (ur) ur.onclick = async () => {
        try { const r = await api('t_markReady', { draftId: draft.draftId, ready: false }); draft = r.draft; draw(); } catch (e) { toast(e.message, 4000); }
      };
      $$('#qlist [data-i]').forEach((el) => {
        el.addEventListener('click', () => select(+el.dataset.i));
        el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(+el.dataset.i); } });
      });
      if (!questions.length) return;
      $('#prev').onclick = () => select(idx - 1);
      $('#next').onclick = () => select(idx + 1);
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
      $('#json').onclick = async () => {
        const raw = clone(work); ['id', 'reviewed', 'criteriaVersion', 'warnings'].forEach((k) => delete raw[k]);
        await modal(`<h2>${esc(t('editJson'))} · ${esc(questions[idx].id)}</h2>
          <textarea class="json" spellcheck="false">${esc(JSON.stringify(raw, null, 2))}</textarea>
          <div id="jerr" class="banner err" hidden></div>
          <div class="row" style="justify-content:flex-end"><button class="btn" data-close="">${esc(t('cancel'))}</button><button class="btn primary" id="japply">${esc(t('apply'))}</button></div>`,
        { wide: true, onMount: (el, close) => {
          $('#japply', el).onclick = () => {
            try {
              const v = JSON.parse($('textarea', el).value);
              work = Object.assign(v, { id: questions[idx].id, reviewed: questions[idx].reviewed, criteriaVersion: questions[idx].criteriaVersion, warnings: questions[idx].warnings });
              dirty = true; close('ok'); draw(); setDirty(true);
            } catch (e) { const j = $('#jerr', el); j.textContent = t('jsonBad') + e.message; j.hidden = false; }
          };
        } });
      };
      $('#del').onclick = async () => {
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
          draw(); if (draft.status === 'generating') startPoll();
        } catch (e) { toast(e.message, 4000); }
      };
    }
    function startPoll() {
      clearInterval(pollTimer);
      pollTimer = setInterval(async () => {
        if (document.hidden || dirty) return;
        try {
          const r = await api('t_getDraft', { draftId: draft.draftId });
          const changed = r.questions.length !== questions.length || r.draft.status !== draft.status;
          draft = r.draft; questions = r.questions;
          if (changed) { idx = Math.min(idx, Math.max(0, questions.length - 1)); work = questions.length ? clone(questions[idx]) : null; draw(); }
          if (draft.status !== 'generating') { clearInterval(pollTimer); pollTimer = null; }
        } catch (_) { /* 下次再試 */ }
      }, 15000);
    }
    work = questions.length ? clone(questions[idx]) : null;
    draw();
    if (draft.status === 'generating') startPoll();
  }

  // ═════════════════════════ M4：發佈與作答 ═════════════════════════
  Object.assign(I18N.zh, {
    sessions: '測驗場次', newSession: '發佈新測驗', pickDraft: '考題（只列出可發佈的草稿）', noReady: '目前沒有「可發佈」的草稿，請先完成校對。',
    titleZh: '測驗名稱（中文）', titleEn: '測驗名稱（英文）', startAt: '開始', endAt: '結束', minutes: '作答時限（分鐘）', tz: '時間以你的電腦時區為準（台北 / 馬尼拉皆為 UTC+8）',
    assignees: '受測者 Email（每行一個，可從 Excel 貼上）', validN: '{a} 個有效帳號 · {b} 個格式錯誤', publish: '發佈並產生測驗連結', published: '測驗 {id} 已發佈',
    linkHint: '把連結傳給受測者；他們用公司 Google 帳號登入後就能作答。', copyLink: '複製連結', goSession: '查看進度', publishDraft: '發佈測驗',
    colSession: '測驗', colWindow: '期間', colMinutes: '時限', colSubmitted: '交卷', noSessions: '還沒有發佈的測驗。',
    s_scheduled: '尚未開始', s_open: '進行中', s_closed: '已結束', s_released: '成績已公布',
    a_not_started: '未開始', a_in_progress: '作答中', a_submitted: '已交卷', a_expired: '逾時未交', autoSub: '自動交卷',
    submittedN: '{a} / {b} 已交卷', remaining: '剩餘', previewAgent: '以專員畫面預覽', endNow: '提前結束測驗',
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
    answeredN: '已作答 {a} / {b}', left: '剩餘 {t}', finish: '交卷', question: '第 {n} 題', typeAName: '選擇', typeBName: '選擇 + 原因', typeCName: '文字作答',
    pts: '{n} 分', yourReason: '你的判斷原因', yourAnswer: '你的答案', reasonPh: '說明你的判斷依據…', answerPh: '輸入你的答案…',
    submitTitle: '確定要交卷嗎？', unansweredN: '還有 {n} 題未作答。', allAnswered: '所有題目都已作答。', submitNote: '交卷後就不能再修改。', submitNow: '確定交卷',
    submitting: '交卷中…', doneTitle: '已交卷', doneMsg: '你的答案已送出（{t}）。成績公布後，可以在這裡查看分數與錯題。', autoDone: '時間到，系統已自動交卷。',
    backHome: '回到我的測驗', timeWarn5: '剩下 5 分鐘', timeWarn1: '剩下 1 分鐘', endedEarly: '講師已結束測驗，系統正在自動交卷。',
    retrying: '交卷失敗，15 秒後自動重試：', sandbox: '預覽模式：這是專員看到的畫面，作答不會送出。', sandboxDone: '預覽結束（未送出）。', leaveWarn: '作答尚未交卷，確定要離開嗎？',
    noQuiz: '目前沒有指派給你的測驗', opensAt: '開放時間', saveLocal: '答案會暫存在這台電腦的瀏覽器',
  });
  Object.assign(I18N.en, {
    sessions: 'Sessions', newSession: 'Publish a quiz', pickDraft: 'Questions (ready drafts only)', noReady: 'No ready drafts yet. Finish reviewing a draft first.',
    titleZh: 'Title (Chinese)', titleEn: 'Title (English)', startAt: 'Start', endAt: 'End', minutes: 'Time limit (minutes)', tz: 'Times use your computer’s time zone (Taipei / Manila are both UTC+8)',
    assignees: 'Emails (one per line, paste from Excel)', validN: '{a} valid · {b} invalid', publish: 'Publish and create link', published: 'Quiz {id} published',
    linkHint: 'Send this link to the assignees. They sign in with their company Google account to answer.', copyLink: 'Copy link', goSession: 'View progress', publishDraft: 'Publish quiz',
    colSession: 'Quiz', colWindow: 'Window', colMinutes: 'Limit', colSubmitted: 'Submitted', noSessions: 'No quizzes published yet.',
    s_scheduled: 'Scheduled', s_open: 'Open now', s_closed: 'Closed', s_released: 'Results released',
    a_not_started: 'Not started', a_in_progress: 'In progress', a_submitted: 'Submitted', a_expired: 'Not submitted', autoSub: 'Auto-submitted',
    submittedN: '{a} / {b} submitted', remaining: 'Remaining', previewAgent: 'Preview as agent', endNow: 'End quiz now',
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
    answeredN: 'Answered {a} / {b}', left: '{t} left', finish: 'Finish exam', question: 'Question {n}', typeAName: 'Choice', typeBName: 'Choice + reason', typeCName: 'Written',
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
  async function viewSessions() {
    const params = new URLSearchParams(location.hash.split('?')[1] || '');
    const main = shell('sessions', `<div class="row"><h1>${esc(t('sessions'))}</h1><span class="spacer"></span>
        <button class="btn" id="refresh">${esc(t('refresh'))}</button><button class="btn brand" id="newBtn">+ ${esc(t('newSession'))}</button></div>
      <div id="createBox"></div><div id="doneBox"></div>
      <div class="card scroll-x" id="listBox"><div class="empty-state"><span class="spin"></span> ${esc(t('loading'))}</div></div>`);
    async function loadList() {
      try {
        const { sessions } = await api('t_listSessions');
        const box = $('#listBox'); if (!box) return;
        if (!sessions.length) { box.innerHTML = `<div class="empty-state">${esc(t('noSessions'))}</div>`; return; }
        box.innerHTML = `<table class="list"><thead><tr><th>${esc(t('colSession'))}</th><th>${esc(t('colWindow'))}</th><th class="hide-sm">${esc(t('colMinutes'))}</th><th>${esc(t('colSubmitted'))}</th><th>${esc(t('colStatus'))}</th><th></th></tr></thead><tbody>${
          sessions.map((s) => {
            const pct = s.assigned ? Math.round((s.submitted / s.assigned) * 100) : 0;
            return `<tr class="click" data-open="${esc(s.sessionId)}"><td><b>${esc(s.sessionId)}</b> ${esc(L(s.title))}<div class="small soft">${esc(s.draftId)} · ${esc(t('qUnit', { n: s.questionCount }))}</div></td>
              <td class="small">${esc(fmtDT(s.startAt))}<br>– ${esc(fmtDT(s.endAt))}</td><td class="hide-sm small">${esc(t('minUnit', { n: s.minutes }))}</td>
              <td><div class="bar ok"><i style="width:${pct}%"></i></div><div class="small muted">${esc(t('submittedN', { a: s.submitted, b: s.assigned }))}</div></td>
              <td>${sessChip(s.state)}</td><td style="text-align:right"><button class="btn sm">${esc(t('open'))}</button></td></tr>`;
          }).join('')}</tbody></table>`;
        $$('[data-open]', box).forEach((r) => r.addEventListener('click', () => { location.hash = '#/session/' + r.dataset.open; }));
      } catch (e) { showError(e, $('#listBox')); }
    }
    async function openCreate(preset) {
      const box = $('#createBox');
      if (box.innerHTML && !preset) { box.innerHTML = ''; return; }
      box.innerHTML = `<div class="card pad"><span class="spin"></span></div>`;
      let drafts;
      try { drafts = (await api('t_listDrafts')).drafts.filter((d) => d.status === 'ready'); } catch (e) { showError(e, box); return; }
      if (!drafts.length) { box.innerHTML = `<div class="banner warn">${esc(t('noReady'))}</div>`; return; }
      const start = new Date(); start.setMinutes(Math.ceil(start.getMinutes() / 5) * 5, 0, 0);
      const end = new Date(start.getTime() + 2 * 86400000); end.setHours(18, 0, 0, 0);
      box.innerHTML = `<form class="card pad" id="sform" style="display:flex;flex-direction:column;gap:16px"><h2>${esc(t('newSession'))}</h2>
        <div class="form">
          <label class="k" for="s_draft">${esc(t('pickDraft'))}</label><select id="s_draft">${drafts.map((d) => `<option value="${esc(d.draftId)}" data-name="${esc(d.name)}">${esc(d.draftId)} ${esc(d.name)}（${esc(t('qUnit', { n: d.imported }))}）</option>`).join('')}</select>
          <label class="k" for="s_tzh">${esc(t('titleZh'))}</label><input type="text" id="s_tzh" maxlength="80" required>
          <label class="k" for="s_ten">${esc(t('titleEn'))}</label><input type="text" id="s_ten" maxlength="80" required placeholder="e.g. Agreement Check — Wrong Item Sent">
          <label class="k" for="s_start">${esc(t('startAt'))}</label><div><input type="datetime-local" id="s_start" value="${toLocalInput(start)}" required></div>
          <label class="k" for="s_end">${esc(t('endAt'))}</label><div><input type="datetime-local" id="s_end" value="${toLocalInput(end)}" required><div class="small soft">${esc(t('tz'))}</div></div>
          <label class="k" for="s_min">${esc(t('minutes'))}</label><div><input type="number" id="s_min" min="1" max="300" value="30" required></div>
          <label class="k" for="s_emails">${esc(t('assignees'))}</label><div><textarea id="s_emails" rows="6" style="width:min(520px,100%);border:1px solid var(--line2);border-radius:8px;padding:8px 10px" placeholder="maria.santos@shopeemobile-external.com&#10;juan.reyes@shopeemobile-external.com"></textarea><div class="small" id="s_cnt"></div></div>
        </div>
        <div id="s_err" class="banner err" hidden></div>
        <div class="row"><button type="submit" class="btn brand" id="s_go">${esc(t('publish'))}</button><button type="button" class="btn" id="s_cancel">${esc(t('cancel'))}</button></div></form>`;
      const sel = $('#s_draft');
      if (preset && drafts.some((d) => d.draftId === preset)) sel.value = preset;
      const fillTitle = () => { const o = sel.selectedOptions[0]; $('#s_tzh').value = o ? o.dataset.name : ''; };
      sel.addEventListener('change', fillTitle); fillTitle();
      const cnt = () => {
        const r = parseEmails($('#s_emails').value);
        $('#s_cnt').innerHTML = `<span class="chip ${r.bad.length ? 'warn' : r.ok.length ? 'ok' : ''}">${esc(t('validN', { a: r.ok.length, b: r.bad.length }))}</span>${r.bad.length ? ' <span class="small" style="color:var(--err)">' + r.bad.slice(0, 5).map(esc).join(', ') + '</span>' : ''}`;
        $('#s_go').disabled = !r.ok.length || r.bad.length > 0;
      };
      $('#s_emails').addEventListener('input', cnt); cnt();
      $('#s_cancel').onclick = () => { box.innerHTML = ''; };
      $('#sform').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = $('#s_go'); btn.disabled = true; $('#s_err').hidden = true;
        try {
          const r = await api('t_createSession', {
            draftId: sel.value, titleZh: $('#s_tzh').value.trim(), titleEn: $('#s_ten').value.trim(),
            startAt: new Date($('#s_start').value).getTime(), endAt: new Date($('#s_end').value).getTime(), minutes: +$('#s_min').value,
            assignees: parseEmails($('#s_emails').value).ok,
          });
          box.innerHTML = '';
          const link = quizLink(r.sessionId);
          $('#doneBox').innerHTML = `<div class="card pad" style="display:flex;flex-direction:column;gap:10px"><div><b>${esc(t('published', { id: r.sessionId }))}</b> <span class="muted">${esc(t('linkHint'))}</span></div>
            <div class="cmd"><code style="font-size:15px;word-break:break-all">${esc(link)}</code><span class="spacer"></span><button class="btn sm" id="cpl">${esc(t('copyLink'))}</button><a class="btn sm" style="display:inline-grid;place-items:center;text-decoration:none" href="#/session/${esc(r.sessionId)}">${esc(t('goSession'))}</a></div></div>`;
          $('#cpl').onclick = () => copyText(link);
          history.replaceState(null, '', '#/sessions');
          loadList();
        } catch (err) { $('#s_err').textContent = err.message; $('#s_err').hidden = false; btn.disabled = false; }
      });
    }
    $('#refresh').onclick = loadList;
    $('#newBtn').onclick = () => openCreate();
    loadList();
    if (params.get('new')) openCreate(params.get('new'));
  }

  async function viewSession(id) {
    const main = shell('sessions', `<div class="empty-state"><span class="spin"></span> ${esc(t('loading'))}</div>`);
    async function load() {
      let d;
      try { d = await api('t_getSession', { sessionId: id }); } catch (e) { showError(e); return; }
      const s = d.session, link = quizLink(s.sessionId), offset = d.serverNow - Date.now();
      const sub = d.roster.filter((r) => r.status === 'submitted').length, inp = d.roster.filter((r) => r.status === 'in_progress').length, nst = d.roster.filter((r) => r.status === 'not_started').length;
      const rem = s.state === 'open' ? fmtDur(s.endAt - (Date.now() + offset)) : t('none');
      main.innerHTML = `<div class="row"><a href="#/sessions">← ${esc(t('sessions'))}</a><h1>${esc(s.sessionId)} ${esc(L(s.title))}</h1>${sessChip(s.state)}<span class="spacer"></span>
          <button class="btn" id="reload">${esc(t('refresh'))}</button><a class="btn" style="display:inline-grid;place-items:center;text-decoration:none" href="#/preview/${esc(s.sessionId)}">${esc(t('previewAgent'))}</a>
          ${s.state === 'open' || s.state === 'scheduled' ? `<button class="btn danger" id="endNow">${esc(t('endNow'))}</button>` : ''}</div>
        <div class="cmd"><code style="font-size:15px;word-break:break-all">${esc(link)}</code><span class="spacer"></span><button class="btn sm" id="cpl">${esc(t('copyLink'))}</button></div>
        <div class="stats">
          <div class="card pad"><div class="small soft">${esc(t('colWindow'))}</div><div><b>${esc(fmtDT(s.startAt))}</b><br>– <b>${esc(fmtDT(s.endAt))}</b></div></div>
          <div class="card pad"><div class="small soft">${esc(t('remaining'))}</div><div class="big">${esc(rem)}</div></div>
          <div class="card pad"><div class="small soft">${esc(t('timeLimit'))}</div><div class="big">${esc(t('minUnit', { n: s.minutes }))}</div><div class="small soft">${esc(t('qUnit', { n: s.questionCount }))}</div></div>
          <div class="card pad"><div class="small soft">${esc(t('colSubmitted'))}</div><div class="big">${sub} <span class="soft" style="font-size:16px">/ ${d.roster.length}</span></div><div class="small soft">${esc(t('a_in_progress'))} ${inp} · ${esc(t('a_not_started'))} ${nst}</div></div>
        </div>
        <div class="card scroll-x"><table class="list"><thead><tr><th>${esc(t('colEmail'))}</th><th>${esc(t('colStatus'))}</th><th>${esc(t('colStarted'))}</th><th>${esc(t('colSubmittedAt'))}</th></tr></thead><tbody>${
          d.roster.map((r) => `<tr><td>${esc(r.email)}</td><td>${attChip(r)}</td><td class="small muted">${esc(fmtDT(r.startedAt))}</td><td class="small muted">${esc(fmtDT(r.submittedAt))}</td></tr>`).join('')}</tbody></table></div>`;
      $('#cpl').onclick = () => copyText(link);
      $('#reload').onclick = load;
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
    try { d = await api('s_get', { sessionId: id }); } catch (e) { showError(e); return; }
    const s = d.session, a = d.attempt, offset = d.serverNow - Date.now();
    if (a.status === 'in_progress') return runQuiz({ session: s, questions: d.questions, deadline: a.deadline, offset });
    if (a.status === 'submitted') return doneScreen(main, s, a);
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
  function doneScreen(main, s, a, auto) {
    main.innerHTML = `<div class="card pad intro" style="text-align:center;align-items:center">
      <div class="donemark">✓</div><h1>${esc(t('doneTitle'))}</h1><h2 class="muted" style="font-weight:500">${esc(L(s.title))}</h2>
      ${auto || a.autoSubmitted ? `<div class="banner info">${esc(t('autoDone'))}</div>` : ''}
      <p class="muted">${esc(t('doneMsg', { t: fmtDT(a.submittedAt) }))}</p>
      <a class="btn" style="display:inline-grid;place-items:center;text-decoration:none" href="#/">${esc(t('backHome'))}</a></div>`;
  }

  // ───────── 講師：以專員畫面預覽 ─────────
  async function viewPreview(id) {
    shell('sessions', `<div class="empty-state"><span class="spin"></span> ${esc(t('loading'))}</div>`);
    try {
      const d = await api('t_getSession', { sessionId: id });
      const qs = d.questions.map((q) => { const o = {}; ['qid', 'seq', 'type', 'points', 'prompt', 'buyer', 'seller', 'order', 'payment', 'logistics', 'chat', 'drc', 'request', 'options'].forEach((k) => { if (q[k] !== undefined) o[k] = q[k]; }); return o; });
      runQuiz({ session: d.session, questions: qs, deadline: Date.now() + d.session.minutes * 60000, offset: 0, sandbox: true });
    } catch (e) { showError(e); }
  }

  // ───────── 作答 ─────────
  function runQuiz({ session, questions, deadline, offset, sandbox }) {
    const s = session, N = questions.length;
    const key = 'rrqp:p:' + s.sessionId + ':' + (me ? me.email : '') + (sandbox ? ':preview' : '');
    let st = { answers: {}, idx: 0 };
    try { const v = JSON.parse(store.get(key) || 'null'); if (v && v.answers) st = v; } catch (_) { /* */ }
    const save = () => store.set(key, JSON.stringify(st));
    let submitted = false, submitting = false, warned5 = false, warned1 = false, tick = null, poll = null, retry = null;
    const now = () => Date.now() + offset;
    const answered = (q) => { const a = st.answers[q.qid] || {}; return q.type === 'A' ? !!a.choice : q.type === 'B' ? !!a.choice && !!String(a.text || '').trim() : !!String(a.text || '').trim(); };
    const onBeforeUnload = (e) => { if (!submitted && !sandbox) { e.preventDefault(); e.returnValue = t('leaveWarn'); } };
    window.addEventListener('beforeunload', onBeforeUnload);
    leaveGuard = () => { if (submitted || sandbox) return cleanup(), true; const ok = window.confirm(t('leaveWarn')); if (ok) cleanup(); return ok; };
    function cleanup() { clearInterval(tick); clearInterval(poll); clearTimeout(retry); window.removeEventListener('beforeunload', onBeforeUnload); }

    app().innerHTML = `<header class="quizbar">
        <div class="brandmark"><span class="logo" aria-hidden="true">S</span><span class="hide-sm">RR Quiz Platform</span></div>
        <div class="qtitle">${esc(L(s.title))}</div>
        <span class="chip" id="qa"></span><span class="timer" id="timer" aria-live="off"></span>
        <span class="spacer"></span>${langSeg()}<button class="btn brand" id="finish">${esc(t('finish'))}</button></header>
      ${sandbox ? `<div class="banner info" style="border-radius:0;text-align:center">${esc(t('sandbox'))} <a href="#/session/${esc(s.sessionId)}">← ${esc(t('sessions'))}</a></div>` : ''}
      <main><nav class="qnav" id="qnav" aria-label="questions"></nav><div id="qarea"></div></main>`;
    $$('[data-lang]', app()).forEach((b) => b.addEventListener('click', () => { lang = b.dataset.lang; store.set('rrqp:lang', lang); document.documentElement.lang = lang === 'zh' ? 'zh-Hant' : 'en'; cleanup(); leaveGuard = null; runQuiz({ session, questions, deadline, offset, sandbox }); }));
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

  // ───────── start ─────────
  document.documentElement.lang = lang === 'zh' ? 'zh-Hant' : 'en';
  auth = PREVIEW ? null : loadToken();
  route();
})();
