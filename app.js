/* RR Quiz Platform — 前端（M3：登入、講師後台草稿與校對） */
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
        <span title="${esc(t('soon'))}">${esc(t('navSessions'))}</span>
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
    if (me.isTeacher && page === 'draft' && arg) return viewDraft(decodeURIComponent(arg));
    if (me.isTeacher && (page === 'drafts' || page === '')) return viewDrafts();
    return viewAgentHome();
  }
  window.addEventListener('hashchange', () => {
    if (leaveGuard && !leaveGuard()) return;
    leaveGuard = null; route();
  });

  // ───────── 專員首頁（M4 前的佔位） ─────────
  function viewAgentHome() {
    shell('', `<div class="card empty-state"><h2>${esc(t('agentHome'))}</h2><p>${esc(t('agentHomeSub'))}</p></div>`);
  }

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
          ? `<button class="btn" id="unready">${esc(t('unready'))}</button>`
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

  // ───────── start ─────────
  document.documentElement.lang = lang === 'zh' ? 'zh-Hant' : 'en';
  auth = PREVIEW ? null : loadToken();
  route();
})();
