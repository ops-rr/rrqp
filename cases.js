/* RR AI Quiz Platform — V3 DMS 考題：案件清單與案件編輯（#/case/Cxxx）
 * 清單畫在「案件匯入 → 未上架 DMS 考題」與「可用題庫 → DMS 考題」：app.js 呼叫 window.RRQP_CASES.list(box, status, ctx)；
 * 編輯頁：app.js 的 route() 呼叫 window.RRQP_CASES.route('case', caseId, ctx)。資料一律走 db.js 的 api（c_* 動作）。
 * 案件編輯的畫面沿用 dev/case-quiz 原型：中間 DMS 區塊、右側 考題／Operation History／Chat History／Discuss。
 * 畫面上的按鈕呼叫 window.CQ.xxx(...)。
 */
(() => {
  'use strict';

  let X = null;          // app.js 傳進來的共用工具：me、api、shell、toast、confirmBox、setLeaveGuard、setLive、DB
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const LETTERS = 'ABCDEFGHIJ';
  // 選擇題（2026-11-23）：answer 一個數字＝單選，兩個以上的清單＝複選；複選要和正解完全一樣才給分（規則同 db.js 的 mcOk）
  const mcKey = (md) => (Array.isArray(md.answer) ? [...new Set(md.answer)].sort((a, b) => a - b) : Number.isInteger(md.answer) ? [md.answer] : []);
  const mcMulti = (md) => !!md.multi || mcKey(md).length > 1;
  const mcPicks = (p) => (Array.isArray(p) ? [...new Set(p)].sort((a, b) => a - b) : Number.isInteger(p) ? [p] : []);
  const mcOk = (md, p) => { const k = mcKey(md), q = mcPicks(p); return k.length > 0 && k.length === q.length && k.every((x, i) => x === q[i]); };
  let OPTSETS = null;    // 選項範本（主題設定裡的），編輯選擇題時才讀
  // 復原／重做（2026-11-23）：每次修改前的內容存在記憶體（最多 50 步），不另外讀寫 Firebase；復原後照一般修改自動存檔
  let HIST = { undo: [], redo: [], last: '' };
  const histSnap = () => JSON.stringify({ c: MAIN, t: CUR ? CUR.title : '' });

  // ───────── 案件編輯的狀態 ─────────
  let CUR = null;        // { caseId, status, title, rev, notes, private, canEdit, canDelete }
  let MAIN = null;       // 案件內容（存檔送這份）
  let C = null;          // 畫面正在顯示的案件：本次＝MAIN；切到前一次申退時，換成那一筆的 blocks／ops／drc（考題、設定仍是 MAIN 的）
  let VIEW = -1;         // -1 = 本次申退；0、1… = 前幾次申退
  let A = null;          // 專員預覽的作答（只在這個畫面，不存）
  let mode = 'edit';     // edit = 講師編輯；agent = 專員預覽
  let sideTab = 'quiz';
  let drcRoom = 'buyer';
  let lbScale = 1;
  let dirty = false, saving = false, saveTimer = null, saveErr = '';

  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function src(path) { return /^(data|blob):/.test(String(path)) ? esc(path) : esc(encodeURI(path)); }
  // 2026-11-23 Chris：已上架的案件不能直接改，要先「下架修改」
  const canMod = () => !!(CUR && CUR.canEdit && CUR.status !== 'approved');
  const isEdit = () => mode === 'edit' && canMod();
  const fmtTime = (ms) => (ms ? new Date(ms).toLocaleString('sv-SE').slice(0, 16) : '-');

  // 黏在上方的高度：V2 頂部列＋案件工具列（左側導覽、右側面板從這裡開始）
  function cqTop() {
    const h = $('header.top'), bar = $('#cqBar'), st = $('#cqSettings');
    return (h ? h.offsetHeight : 0) + (bar ? bar.offsetHeight : 0) + (st ? st.offsetHeight : 0);
  }
  function layout() {
    const root = $('#cq');
    if (!root) return;
    const h = $('header.top');
    root.style.setProperty('--cqH', (h ? h.offsetHeight : 0) + 'px');
    const bar = $('#cqBar');
    root.style.setProperty('--cqBarH', (bar ? bar.offsetHeight : 0) + 'px');   // 黃底設定列凍結在工具列下方
    root.style.setProperty('--cqTop', (cqTop() + 12) + 'px');
  }

  // ═════════════════════════════ 案件清單 ═════════════════════════════
  const STATUS = { pending: '未上架', approved: '已上架' };

  // DMS 畫面的中文／英文：跟網站右上角的「中文／EN」一起切換。匯入時存了 i18n（英文 → 中文），中文時查表，查不到就顯示英文。
  // 頁籤、篩選、角色這些 DMS 前端寫死的英文，DMS 切成中文也不變，所以不翻（2026-11-19 Chris 對過）。編輯中的欄位一律顯示原文（避免把中文存回去）。
  // 三種 DMS 語言：中文＝zh-hant；EN＝DMS 給 TW BPO 的「en-tw bpo」用語（i18n.bpo 只存和一般英文不同的）；兩者都查不到＝一般英文（原文）
  const dmsLang = () => (document.documentElement.lang === 'en' ? 'en' : 'zh');
  function T(s) {
    if (s == null) return s;
    const m = (MAIN && MAIN.i18n) || {};
    if (dmsLang() === 'en') return (m.bpo && m.bpo[s]) || s;
    return (m.zh && m.zh[s]) || (m.ui && m.ui[s]) || s;
  }
  // Operation History 的欄位名稱：DMS 有的翻、有的維持英文（Present pending reason、Remark…），所以另外一張表
  function TL(s) {
    const m = (MAIN && MAIN.i18n) || {};
    if (dmsLang() === 'en') return (m.bpo && m.bpo[s]) || s;
    return (m.opzh && m.opzh[s]) || s;
  }
  // 作答畫面的介面文字（2026-11-21 BPO）：跟右上角「中文／EN」一起切換；中文、英文寫在同一處，只用在專員看得到的地方
  const U = (zh, en) => (dmsLang() === 'en' ? en : zh);
  // BPO 翻譯（2026-11-21）：使用者打的中文（聊聊、Discuss、Operation History、Remark 類欄位），匯入時用 DMS 的翻譯服務翻好存在 i18n.tx。
  // EN 時照 DMS：英文、下面灰字原文、再下一行藍色「Hide Original」（原文預設顯示，2026-11-21 Chris 對過 DMS 畫面）；沒有翻譯就照原本的 T()。回傳 HTML。
  function TX(s) {
    const m = (MAIN && MAIN.i18n) || {}, en = s && dmsLang() === 'en' && m.tx && m.tx[s];
    if (!en) return esc(T(s));
    return `<span class="tx">${esc(en)}<span class="tx-src">${esc(s)}</span><a class="tx-o" onclick="CQ.txOrig(this)">Hide Original</a></span>`;
  }
  // SOP 節點的字：排程翻好存在 SOP 的 tx；EN 時換成英文（只用在顯示，比對答案一律用節點編號）
  function ST(s) {
    if (!s || dmsLang() !== 'en') return s;
    const p = (EX ? EX.sops : SOPS) || {};
    for (const k in p) { const t = p[k] && p[k].tx; if (t && t[s]) return t[s]; }
    return s;
  }
  // 使用對象標籤（2026-11-22 Chris）：TW／TW＋BPO（＋翻譯狀態）；案件清單、編輯畫面、發佈表單共用。c：{ twOnly, tx, txMissed, status }
  function langChip(c, compact) {
    if (c.twOnly !== false) return '<span class="chip">TW</span>';
    // 清單用：標籤只寫 TW＋BPO，翻譯狀態放在下面一行小字（避免欄位太寬把標題擠成直排）
    if (compact) {
      const n = Number(c.txMissed) || 0;
      const st = c.tx === 'done' ? '' : c.tx === 'queued' ? '翻譯中' : c.tx === 'partial' ? `${n} 句沒翻到` : c.status === 'approved' ? '尚未翻譯' : '上架後翻譯';
      return `<span class="chip ${c.tx === 'done' ? 'ok' : c.tx === 'queued' ? 'info' : 'warn'}">TW＋BPO</span>${st ? `<div class="small soft" style="margin-top:2px">${st}</div>` : ''}`;
    }
    const n = Number(c.txMissed) || 0;
    if (c.tx === 'done') return '<span class="chip ok">TW＋BPO</span>';
    if (c.tx === 'queued') return '<span class="chip info" title="排程翻譯完成後，BPO 專員才看得到英文">TW＋BPO・翻譯中</span>';
    if (c.tx === 'partial') return `<span class="chip warn" title="這些句子 BPO 專員會看到中文">TW＋BPO・${n} 句沒翻到</span>`;
    return `<span class="chip warn" title="上架時有新的中文才送翻譯">TW＋BPO・${c.status === 'approved' ? '尚未翻譯' : '上架後翻譯'}</span>`;
  }
  // 講師寫的字（題目、選項、情境說明）：EN 時只顯示英文；詳解、參考答案用 TX（附原文）
  function TE(s) {
    const m = (MAIN && MAIN.i18n) || {}, en = s && dmsLang() === 'en' && m.tx && m.tx[s];
    return esc(en || s);
  }
  // SOP 節點的 HTML（問題、訊息，含講義連結；2026-11-21 Chris：保留）：只留格式標籤與 http(s) 連結，其他標籤拿掉、保留文字
  const SAFE_TAGS = new Set(['P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'OL', 'UL', 'LI', 'A', 'SPAN', 'DIV', 'BLOCKQUOTE', 'CODE', 'H1', 'H2', 'H3', 'H4']);
  function safeHtml(html) {
    const tpl = document.createElement('template');
    tpl.innerHTML = String(html || '');
    const walk = (el) => [...el.children].forEach((c) => {
      if (/^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|TEMPLATE|NOSCRIPT)$/.test(c.tagName)) { c.remove(); return; }    // 連內容一起刪
      const href = c.tagName === 'A' ? c.getAttribute('href') || '' : '';
      const bullet = c.tagName === 'OL' && !!c.querySelector(':scope > li[data-list="bullet"]');           // SOP Tool 的項目符號清單
      walk(c);
      if (!SAFE_TAGS.has(c.tagName)) { c.replaceWith(...c.childNodes); return; }
      [...c.attributes].forEach((a) => c.removeAttribute(a.name));
      if (c.tagName === 'A' && /^https?:\/\//i.test(href)) { c.setAttribute('href', href); c.setAttribute('target', '_blank'); c.setAttribute('rel', 'noopener noreferrer'); }
      if (bullet) c.dataset.bullet = '1';
    });
    walk(tpl.content);
    return tpl.innerHTML;
  }
  const filt = { tab: 'pending', q: '', usage: '', lang: '', kind: '', id: '' };     // kind：group / topic / tag；lang：tw / bpo（使用對象）
  const backOf = (status) => (status === 'approved' ? '#/bank?tab=cases' : '#/library?tab=cases');
  const L = (n) => (n && typeof n === 'object' ? n.zh || n.en || '' : String(n || ''));

  /** 案件清單畫進 box：status = pending（案件匯入 → 未上架 DMS 考題）或 approved（可用題庫 → DMS 考題） */
  async function list(box, status, ctx) {
    if (EX) { clearInterval(EX.tick); EX = null; }
    X = ctx; CUR = null; MAIN = null; C = null;
    filt.tab = status === 'approved' ? 'approved' : 'pending';
    let d;
    try { d = await X.api('c_list'); } catch (e) { X.showError(e, box); return; }
    drawCases(d, box);
    // 索引有變動（排程送來新案件、別的講師核准）就重畫；正在輸入搜尋時不打斷
    if (X.DB() && X.DB().live && X.DB().live.caseIndex) {
      let first = true;
      X.setLive(X.DB().live.caseIndex(() => {
        if (first) { first = false; return; }
        if (!document.body.contains(box)) return;
        if (document.activeElement && document.activeElement.id === 'cqQ') return;
        X.api('c_list').then((x) => drawCases(x, box)).catch(() => {});
      }));
    }
  }

  function drawCases(d, box) {
    const pend = d.cases.filter((c) => c.status !== 'approved'), appr = d.cases.filter((c) => c.status === 'approved');
    if ($('#cqNP')) $('#cqNP').innerHTML = pend.length ? `<span class="cnt g" title="未上架 ${pend.length}">${pend.length}</span>` : '';
    if ($('#cqNA')) $('#cqNA').textContent = appr.length ? `(${appr.length})` : '';
    const all = filt.tab === 'approved' ? appr : pend;
    if (!box || !document.body.contains(box)) return;
    if (!all.length) {
      box.innerHTML = `<div class="card empty-state">${filt.tab === 'approved' ? '還沒有上架的 DMS 考題' : '沒有未上架的 DMS 考題。到「申請匯入」勾選「DMS 考題」申請。'}</div>`;
      return;
    }
    const gName = (id) => (d.groups.find((x) => x.id === id) || {}).name || id;
    const tpName = (id) => L((d.topics.find((x) => x.topicId === id) || {}).name) || id;
    const tgName = (id) => L((d.tags.find((x) => x.tagId === id) || {}).name) || id;
    box.innerHTML = `<div class="lib-grid"><aside class="card lib-side" id="cqSideF"></aside>
      <div class="lib-main"><div class="cql-filter">
        <input type="search" id="cqQ" placeholder="搜尋案件編號、標題、Return ID、講師" value="${esc(filt.q)}">
        <select id="cqU"><option value="">練習＋考試</option><option value="practice" ${filt.usage === 'practice' ? 'selected' : ''}>練習用</option><option value="exam" ${filt.usage === 'exam' ? 'selected' : ''}>考試用</option></select>
        <select id="cqL"><option value="">全部對象</option><option value="tw" ${filt.lang === 'tw' ? 'selected' : ''}>TW</option><option value="bpo" ${filt.lang === 'bpo' ? 'selected' : ''}>TW＋BPO</option></select>
        <span class="small muted" id="cqC"></span></div><div id="cqRows"></div></div></div>`;
    const inF = (c) => !filt.kind || (filt.kind === 'none' ? !(c.groups || []).length
      : (filt.kind === 'group' ? c.groups : filt.kind === 'topic' ? c.topics : c.tags || []).includes(filt.id));
    const drawSide = () => {
      const row = (kind, id, label, n, sub) => `<button type="button" class="lib-row ${filt.kind === kind && filt.id === id ? 'on' : ''}" data-k="${kind}" data-id="${esc(id)}" ${sub ? 'style="padding-left:22px"' : ''}><span>${esc(label)}</span><span class="n">${n}</span></button>`;
      const used = (key) => [...new Set(all.flatMap((c) => c[key] || []))];
      const noGroup = all.filter((c) => !(c.groups || []).length).length;
      $('#cqSideF').innerHTML = `<div class="lib-side-hd"><b>分類</b></div>${row('', '', '全部', all.length)}
        <div class="lib-grp">組別</div>
        ${d.groups.filter((g) => g.active || used('groups').includes(g.id)).map((g) => row('group', g.id, g.name, all.filter((c) => (c.groups || []).includes(g.id)).length)).join('')}
        ${noGroup ? row('none', '', '（還沒分組）', noGroup) : ''}
        <div class="lib-grp">主題與標籤</div>
        ${d.topics.filter((tp) => tp.active || used('topics').includes(tp.topicId)).map((tp) => row('topic', tp.topicId, L(tp.name), all.filter((c) => (c.topics || []).includes(tp.topicId)).length)
          + d.tags.filter((tg) => tg.topicId === tp.topicId && used('tags').includes(tg.tagId)).map((tg) => row('tag', tg.tagId, L(tg.name), all.filter((c) => (c.tags || []).includes(tg.tagId)).length, true)).join('')).join('')}`;
      $$('#cqSideF [data-k]').forEach((b) => b.addEventListener('click', () => { filt.kind = b.dataset.k; filt.id = b.dataset.id; drawSide(); draw(); }));
    };
    const draw = () => {
      const q = filt.q.trim().toLowerCase();
      const pend = filt.tab !== 'approved';      // 可用題庫只列已核准的：不顯示匯入提醒與狀態
      const list = all.filter((c) => inF(c) && (!filt.usage || c.usage === filt.usage) && (!filt.lang || (filt.lang === 'bpo') === (c.twOnly === false))
        && (!q || [c.caseId, c.title, c.returnId, c.updatedBy, c.approvedBy, c.requestedBy].join(' ').toLowerCase().includes(q)));
      $('#cqC').textContent = `${list.length} / ${all.length} 筆`;
      $('#cqRows').innerHTML = !list.length ? '<div class="card empty-state">沒有符合的案件</div>' : `<div class="card scroll-x"><table class="list cql-tb"><thead><tr>
          <th>案件</th><th class="t">標題</th><th>分類</th><th>用途</th><th>對象</th><th>作答題</th>${d.canEdit ? '<th>Return ID</th>' : ''}${pend ? '<th>匯入提醒</th>' : ''}<th>最後修改</th>${pend ? '<th>狀態</th>' : ''}</tr></thead><tbody>
        ${list.map((c) => `<tr class="click" data-id="${esc(c.caseId)}"><td class="mono">${esc(c.caseId)}${c.copyOf ? `<div class="soft small" style="white-space:nowrap">複製自 ${esc(c.copyOf)}</div>` : ''}</td>
          <td class="t">${c.title ? esc(c.title) : '<span class="soft">（未命名）</span>'}</td>
          <td class="small">${(c.groups || []).map((x) => `<span class="chip">${esc(gName(x))}</span>`).join(' ')}
            <div class="soft">${(c.topics || []).map(tpName).concat((c.tags || []).map(tgName)).map(esc).join('、')}</div></td>
          <td style="white-space:nowrap">${c.usage === 'exam' ? '考試' : '練習'}</td><td style="white-space:nowrap">${langChip(c, true)}</td><td style="white-space:nowrap">${c.questions} 題</td>
          ${d.canEdit ? `<td class="mono small">${esc(c.returnId || '-')}</td>` : ''}
          ${pend ? `<td>${c.notes ? `<span class="chip warn">${c.notes}</span>` : '-'}</td>` : ''}
          <td class="small"><span style="white-space:nowrap">${esc(fmtTime(c.updatedAt))}</span><div class="soft">${esc(String(c.updatedBy || '').replace(/@.*/, ''))}</div></td>
          ${pend ? `<td><span class="chip ${c.status === 'approved' ? 'ok' : 'warn'}">${STATUS[c.status] || c.status}</span></td>` : ''}</tr>`).join('')}
        </tbody></table></div>`;
      $$('#cqRows tr[data-id]').forEach((tr) => tr.addEventListener('click', () => { location.hash = '#/case/' + encodeURIComponent(tr.dataset.id); }));
    };
    $('#cqQ').oninput = (e) => { filt.q = e.target.value; draw(); };
    $('#cqU').onchange = (e) => { filt.usage = e.target.value; draw(); };
    $('#cqL').onchange = (e) => { filt.lang = e.target.value; draw(); };
    drawSide();
    draw();
  }

  // ═════════════════════════════ 案件編輯 ═════════════════════════════
  async function viewCase(id) {
    if (EX) { clearInterval(EX.tick); EX = null; }
    let main = X.shell(X.me.role === 'tw' ? 'library' : 'bank', '<div class="empty-state"><span class="spin"></span> 讀取案件…</div>');
    let d;
    try { d = await X.api('c_get', { caseId: id }); } catch (e) { X.showError(e, main); return; }
    if (d.status === 'approved' || X.me.role !== 'tw') main = X.shell('bank', '');      // 導覽列亮在案件所在的頁面
    CUR = { caseId: d.caseId, copyOf: d.copyOf || '', status: d.status, title: d.title, rev: d.rev, notes: d.notes, priv: d.private || {}, canEdit: d.canEdit, canDelete: d.canDelete,
      tx: Object.assign({ state: '', missed: [] }, d.tx),
      updatedAt: d.updatedAt, updatedBy: d.updatedBy, approvedBy: d.approvedBy, groups: d.groups || [], topics: d.topics || [], tags: d.tags || [] };
    C = d.case;
    C.meta = Object.assign({ usage: 'practice', twOnly: true, mask: { id: true, account: true } }, C.meta || {});
    delete C.meta.timeLimit;       // 作答時間改在組卷發佈時依整場設定（舊案件的欄位存檔時拿掉）
    C.meta.mask = Object.assign({ id: true, account: true }, C.meta.mask);
    ['groups', 'topics', 'tags'].forEach((k) => { if (!Array.isArray(C.meta[k])) C.meta[k] = []; });
    // Return ID、帳號只有 TW 講師讀得到（存在 private）；其他講師看到 ***
    C.meta.rid = CUR.priv.rid || '';
    C.meta.accounts = CUR.priv.accounts || { buyer: '***', seller: '***' };
    (C.prev || []).forEach((p, i) => { p.rid = (CUR.priv.prevIds || [])[i] || ''; });
    C.modules = C.modules || [];
    CUR.pctFixed = pctNormalize(C.modules);       // 舊案件的配分是分數：照原本比例換成百分比（有修改或核准時才寫回）
    C.ops = C.ops || []; C.chat = C.chat || []; C.drc = C.drc || { buyer: [], seller: [] };
    C.prev = (C.prev || []).map((p) => Object.assign({ blocks: [], ops: [], drc: { buyer: [], seller: [] } }, p));
    MAIN = C; VIEW = -1;
    A = newAnswer();
    mode = canMod() ? 'edit' : 'agent';
    HIST = { undo: [], redo: [], last: histSnap() };
    SET_OPEN = null; ALERT_OPEN = ''; MORE_OPEN = false;
    sideTab = 'quiz'; sideDrawn = ''; dirty = false; saving = false; saveErr = '';
    PII_SEEN = new Set(); PII_I = -1; LEAK_I = -1; MS_OPEN = ''; OPEN.imp = false; ACTIVE_SOP = ''; ACT_HINT = ''; ACT_MODAL = null;
    main.classList.add('cq-full');
    main.innerHTML = `<div class="cq ${isEdit() ? 'edit' : ''}" id="cq">
      <div class="cq-bar" id="cqBar"></div>
      <div id="cqSettings"></div>
      <div id="cqViews"></div>
      <div class="wrap" id="cqWrap">
        <nav class="cq-nav" id="cqNav"></nav>
        <div class="main" id="cqMain"></div>
        <div class="side"><div class="ctabs" id="cqTabs"></div><div id="cqSide"></div></div>
      </div>
      <div class="cq-actbar" id="cqActs" style="display:none"></div>
      <div id="cqActModal"></div>
      <div id="cqWm"></div>
      <div id="cqLb" onclick="CQ.closeLightbox(event)"><img id="cqLbImg" alt=""><div class="tip" id="cqLbTip"></div></div>
      <div id="cqPop"></div></div>`;
    $('#cqLb').addEventListener('wheel', (e) => {
      e.preventDefault();
      lbScale = Math.min(5, Math.max(1, lbScale * (e.deltaY < 0 ? 1.15 : 0.87)));
      $('#cqLbImg').style.transform = `scale(${lbScale})`;
    }, { passive: false });
    X.setLeaveGuard(() => !dirty || confirm('還有修改正在儲存或儲存失敗，確定離開？'));
    renderAll();
    if (CUR.version && C.version && CUR.version !== C.version) X.toast('案件格式版本不同，部分欄位可能顯示不完整');
  }

  function renderAll() {
    try {
      const root = $('#cq');
      if (!root) return;
      root.classList.toggle('edit', isEdit());
      renderBar();
      renderSettings();
      renderViews();
      renderNav();
      renderMain();
      renderSide();
      renderWatermark();
      layout();
      markNav();
    } catch (e) {
      console.error(e);
      const m = $('#cqMain');
      if (m) m.insertAdjacentHTML('afterbegin', `<div class="cq-err">畫面發生錯誤：${esc(e.message)}<br>請重新整理；還是一樣的話，把這段訊息截圖給 Chris。</div>`);
    }
  }

  // ───────── 工具列：返回、案件編號、標題、模式、儲存狀態、核准、刪除 ─────────
  // 2026-11-23 Chris 選的版面（參考 Notion／Google 文件）：上方小字路徑；大字標題（點了才編輯）＋狀態＋儲存狀態；
  // 右邊只有復原／重做圖示、編輯／預覽切換、一個主要按鈕，少用的（複製、Return ID、刪除）收進「⋯」選單
  const ICON_UNDO = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14l-4-4 4-4"/><path d="M5 10h11a4 4 0 1 1 0 8h-1"/></svg>';
  const ICON_REDO = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 14l4-4-4-4"/><path d="M19 10h-11a4 4 0 1 0 0 8h1"/></svg>';
  let MORE_OPEN = false;
  function renderBar() {
    if (EX) return exBar();
    const st = CUR.status === 'approved', bar = $('#cqBar');
    bar.className = 'cq-bar cqh';
    const sv = saveErr ? `<span class="sv err" title="${esc(saveErr)}">儲存失敗：${esc(saveErr.slice(0, 60))} ${/剛修改過/.test(saveErr) ? '<button class="cbtn" onclick="location.reload()">重新整理（放棄這次修改）</button>' : '<button class="cbtn" onclick="CQ.saveNow()">重試</button>'}</span>`
      : saving ? `<span class="sv">${U('儲存中…', 'Saving…')}</span>`
      : dirty ? '<span class="sv dirty">有修改，稍後自動儲存</span>'
      : `<span class="sv">已儲存 ${esc(fmtTime(CUR.updatedAt))}</span>`;
    const tl = String(CUR.title || '');
    const title = canMod()
      ? `<input type="text" class="cqh-title" id="cqTitle" size="${Math.min(60, Math.max(16, tl.length * 2 + 2))}" placeholder="輸入案件標題（專員看不到）" title="案件標題：只有講師看得到" value="${esc(tl)}" onchange="CQ.setTitle(this.value)">`
      : `<span class="cqh-title ro">${esc(tl || '（未命名）')}</span>`;
    const rid = (C.meta || {}).rid || '';
    const menu = [
      CUR.canEdit ? '<button onclick="CQ.copy()" title="同一筆 DMS 案件再做一份考題（新案件未上架）">複製成新案件</button>' : '',
      rid ? `<button class="rid" onclick="CQ.copyRid()" title="點一下複製">Return ID ${esc(rid)}${(CUR.priv.prevIds || []).length ? `<br>前幾次申退：${esc(CUR.priv.prevIds.join(', '))}` : ''}</button>` : '',
      CUR.canDelete ? '<button class="del" onclick="CQ.del()">刪除案件</button>' : '',
    ].join('');
    bar.innerHTML = `<div class="cqh-crumb"><a href="${backOf(CUR.status)}">${st ? '可用題庫' : '未上架 DMS 考題'}</a> ／ <b>${esc(CUR.caseId)}</b>${CUR.copyOf ? `<span>・複製自 <a href="#/case/${esc(CUR.copyOf)}">${esc(CUR.copyOf)}</a></span>` : ''}</div>
      <div class="cqh-row">${title}<span class="chipc ${st ? 'ok' : ''}">${STATUS[CUR.status] || esc(CUR.status)}</span>${txChip()}${canMod() ? sv : ''}
        <span style="flex:1"></span>
        ${canMod() ? `<button class="cqh-ib" onclick="CQ.undo()" ${HIST.undo.length ? '' : 'disabled'} title="復原（Ctrl+Z）" aria-label="復原">${ICON_UNDO}</button><button class="cqh-ib" onclick="CQ.redo()" ${HIST.redo.length ? '' : 'disabled'} title="重做（Ctrl+Y）" aria-label="重做">${ICON_REDO}</button>
          <span class="seg"><button class="${isEdit() ? 'on' : ''}" onclick="CQ.setMode('edit')">編輯</button><button class="${!isEdit() ? 'on' : ''}" onclick="CQ.setMode('agent')">專員預覽</button></span>` : ''}
        ${CUR.canEdit ? (st ? '<button class="cbtn ok" onclick="CQ.unapprove()" title="從可用題庫拿掉，改完再上架；已發佈的測驗不受影響">下架修改</button>' : '<button class="cbtn ok" onclick="CQ.approve()">上架到題庫</button>') : ''}
        ${menu ? `<span class="cqh-more"><button class="cbtn" onclick="event.stopPropagation();CQ.moreToggle()" aria-label="更多動作" title="更多動作">⋯</button>${MORE_OPEN ? `<div class="cqh-menu" onclick="event.stopPropagation()">${menu}</div>` : ''}</span>` : ''}</div>`;
  }
  function moreToggle() { MORE_OPEN = !MORE_OPEN; renderBar(); }
  document.addEventListener('click', () => { if (MORE_OPEN) { MORE_OPEN = false; if ($('#cqBar') && CUR && !EX) renderBar(); } });
  function copyRid() { const r = (C.meta || {}).rid || ''; MORE_OPEN = false; renderBar(); if (r) navigator.clipboard.writeText(r).then(() => X.toast('已複製 Return ID')); }

  // 編輯畫面的翻譯狀態；有句子沒翻到時，滑過去列出來
  function txChip() {
    const ms = (CUR.tx || {}).missed || [], h = langChip({ twOnly: C.meta.twOnly, tx: (CUR.tx || {}).state, txMissed: ms.length, status: CUR.status });
    return ms.length && CUR.tx.state === 'partial' ? h.replace(/title="[^"]*"/, `title="${esc('這些句子 BPO 專員會看到中文：\n' + ms.join('\n'))}"`) : h;
  }

  // ───────── 復原／重做 ─────────
  function histGo(from, to) {
    if (!canMod() || !from.length) return;
    to.push(HIST.last);
    const o = JSON.parse(from.pop());
    MAIN = C = o.c; CUR.title = o.t; VIEW = -1; HIST.last = JSON.stringify(o);
    dirty = true; clearTimeout(saveTimer); saveTimer = setTimeout(doSave, 1200);
    sideDrawn = ''; renderAll();
  }
  const undo = () => histGo(HIST.undo, HIST.redo), redo = () => histGo(HIST.redo, HIST.undo);
  // Ctrl+Z／Ctrl+Y（Ctrl+Shift+Z）：游標在輸入框裡時交給瀏覽器（輸入框自己的復原）
  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || !CUR || EX || !isEdit() || !$('#cqBar')) return;
    const t = e.target, typing = t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);
    const k = e.key.toLowerCase();
    if (typing || !(k === 'z' || k === 'y')) return;
    e.preventDefault();
    if (k === 'y' || e.shiftKey) redo(); else undo();
  });

  // ───────── 本次／前幾次申退切換（方案 A：整頁切換，考題固定在右側） ─────────
  function prevLabel(i) {
    const name = MAIN.prev.length === 1 ? U('前一次申退', 'Previous request') : U(`前 ${i + 1} 次申退`, `Request -${i + 1}`);
    const rid = MAIN.prev[i].rid;
    const showRid = isEdit() ? rid : (MAIN.meta.mask.id ? '***' : rid);
    return name + (showRid ? `（${esc(showRid)}）` : '');
  }
  function renderViews() {
    const box = $('#cqViews');
    // 黃色識別條先依目前狀態設定：沒有前次申退的案件會提早結束，2026-11-23 修正（原本從有前次申退的案件切過來，黃條會留著）
    $('#cqWrap').classList.toggle('prev', VIEW >= 0);
    if (!MAIN.prev.length) { box.innerHTML = ''; box.className = ''; return; }
    box.className = 'views' + (VIEW >= 0 ? ' prev' : '');
    box.innerHTML = `<button class="${VIEW < 0 ? 'on' : ''}" onclick="CQ.view(-1)">${U('本次申退', 'Current request')}</button>
      ${MAIN.prev.map((p, i) => `<button class="${VIEW === i ? 'on' : ''}" onclick="CQ.view(${i})">${prevLabel(i)}</button>`).join('')}
      <span class="hint">${VIEW >= 0 ? U('正在看前一次申退的資料；右側「考題」仍是本次案件的題目', "You're viewing a previous request; the Questions tab still belongs to the current case")
        : U('可以切換查看同一筆訂單之前的申退', 'You can switch to earlier return requests for the same order')}</span>`;
  }
  function setView(i) {
    VIEW = i;
    C = i < 0 ? MAIN : { blocks: MAIN.prev[i].blocks, ops: MAIN.prev[i].ops, drc: MAIN.prev[i].drc,
      chat: MAIN.chat, meta: MAIN.meta, modules: MAIN.modules, prev: MAIN.prev, version: MAIN.version };
    renderAll();
    window.scrollTo({ top: 0 });
  }

  function setTitle(v) { CUR.title = String(v || '').trim(); saveCase(); }
  function setMode(m) {
    mode = m;
    if (!isEdit()) A = newAnswer();
    renderAll();
  }

  // ───────── 講師設定列（2026-11-19 改版）：左邊條件（用途、遮蔽、分類下拉），右邊三個提醒框（寬度＝右側面板，上下切齊） ─────────
  function renderSettings() {
    const box = $('#cqSettings');
    if (EX) return exNotice(box);
    if (!isEdit()) {
      box.className = 'pv';
      box.innerHTML = `<span>${canMod() ? '專員預覽：已套用遮蔽與隱藏，畫面和專員作答時相同。' : CUR.canEdit ? '已上架：這裡是專員看到的畫面，要修改請按右上角「下架修改」。' : '只有 TW 講師可以編輯案件；這裡是專員看到的畫面。'}作答不會記錄。</span>
        <span style="flex:1"></span>${A.submitted ? '<button onclick="CQ.retry()">重新作答</button>' : '<button class="solid" onclick="CQ.submitAnswer()">交卷看結果</button>'}`;
      return;
    }
    box.className = 'ed2';
    const m = C.meta;
    const groups = CUR.groups.filter((g) => g.active || m.groups.includes(g.id)).map((g) => [g.id, g.name]);
    const topics = CUR.topics.filter((x) => x.active || m.topics.includes(x.topicId)).map((x) => [x.topicId, L(x.name)]);
    const tags = CUR.tags.filter((x) => m.topics.includes(x.topicId) && (x.active || m.tags.includes(x.tagId))).map((x) => [x.tagId, L(x.name)]);
    // 平常只顯示一行摘要；還沒選組別或主題時預設展開（剛匯入要先設定）
    if (SET_OPEN === null) SET_OPEN = !m.groups.length || !m.topics.length;
    const nm = (list, id) => (list.find((x) => x[0] === id) || [id, id])[1];
    const cls = [m.groups.map((id) => nm(groups, id)).join('、'), m.topics.map((id) => nm(topics, id)).join('、'), m.tags.map((id) => nm(tags, id)).join('、')].filter(Boolean);
    const mask = [m.mask.id ? '編號' : '', m.mask.account ? '帳號' : ''].filter(Boolean);
    const sum = `<div class="cqs-sum"><span class="k">設定</span><span>${m.usage === 'exam' ? '考試用' : '練習用'}・${m.twOnly === false ? 'TW＋BPO' : 'TW'}・${mask.length ? '遮蔽' + mask.join('、') : '不遮蔽'}</span>
        <span class="k">｜分類</span><span>${cls.length ? esc(cls.join(' › ')) : '<span class="bad">還沒選組別、主題</span>'}</span>
        <a class="cqs-link" onclick="CQ.setToggle()">${SET_OPEN ? '收起設定 ▴' : '編輯設定 ▾'}</a>
        <span style="flex:1"></span><span id="cqAl" class="cqa">${alertBoxes()}</span></div>`;
    if (!SET_OPEN) { box.innerHTML = sum + alertPop(); layout(); return; }
    box.innerHTML = sum + alertPop() + `<div class="cond">
        <div class="r1">
          <label>用途 <select style="width:auto" onchange="CQ.setMeta('usage',this.value)">
            <option value="practice" ${m.usage === 'practice' ? 'selected' : ''}>練習用</option>
            <option value="exam" ${m.usage === 'exam' ? 'selected' : ''}>考試用</option></select></label>
          <label>使用對象 <select style="width:auto" onchange="CQ.setMeta('twOnly',this.value==='tw')" title="TW＋BPO：上架時有新的中文就翻成英文，翻好後 BPO 專員也能用">
            <option value="tw" ${m.twOnly !== false ? 'selected' : ''}>TW</option>
            <option value="bpo" ${m.twOnly === false ? 'selected' : ''}>TW＋BPO（上架時翻成英文）</option></select></label>
          <label title="User ID、Shop ID、物流單號、Transaction ID"><input type="checkbox" ${m.mask.id ? 'checked' : ''} onchange="CQ.setMask('id',this.checked)"> 遮蔽編號</label>
          <label><input type="checkbox" ${m.mask.account ? 'checked' : ''} onchange="CQ.setMask('account',this.checked)"> 遮蔽帳號</label>
        </div>
        <label>組別</label>${msBox('groups', groups, '請選擇')}
        <label>主題</label>${msBox('topics', topics, '請選擇')}
        <label>標籤</label>${msBox('tags', tags, m.topics.length ? (tags.length ? '請選擇' : '這個主題還沒有標籤') : '先選主題')}
      </div>`;
    layout();
  }
  let SET_OPEN = null;      // 設定展開：null＝依案件決定（還沒分類就展開）
  function setToggle() { SET_OPEN = !SET_OPEN; renderSettings(); }

  // 分類下拉（可複選，參考 DMS 的 Request Type）：選到的變成小標籤，× 可以拿掉；點開後勾選不會關，點外面才關
  let MS_OPEN = '';
  function msBox(key, opts, ph) {
    const on = C.meta[key] || [];
    const name = (id) => (opts.find((o) => o[0] === id) || [id, id])[1];
    const chips = on.length ? on.map((id) => `<span class="mschip">${esc(name(id))}<b onclick="event.stopPropagation();CQ.toggleCls('${key}','${esc(id)}')">×</b></span>`).join('')
      : `<span class="msph">${esc(ph)}</span>`;
    const list = opts.map(([id, nm]) => `<div class="${on.includes(id) ? 'sel' : ''}" onclick="event.stopPropagation();CQ.toggleCls('${key}','${esc(id)}')">${esc(nm)}</div>`).join('');
    return `<div class="ms ${MS_OPEN === key ? 'open' : ''}" onclick="event.stopPropagation();CQ.msOpen('${key}')">${chips}${opts.length ? `<div class="dd">${list}</div>` : ''}</div>`;
  }
  function msOpen(key) { MS_OPEN = MS_OPEN === key ? '' : key; renderSettings(); }
  document.addEventListener('click', () => { if (MS_OPEN) { MS_OPEN = ''; if ($('#cqSettings')) renderSettings(); } });
  function toggleCls(key, id) {
    const a = C.meta[key] || (C.meta[key] = []);
    const i = a.indexOf(id);
    if (i >= 0) a.splice(i, 1); else a.push(id);
    // 取消主題時，一併拿掉這個主題底下的標籤
    if (key === 'topics' && i >= 0) C.meta.tags = C.meta.tags.filter((tg) => { const x = CUR.tags.find((y) => y.tagId === tg); return !x || C.meta.topics.includes(x.topicId); });
    saveCase(); renderSettings(); layout();
  }

  // ───────── 三個提醒框：個資檢查、可能洩漏結果、匯入提醒（點整個框逐處跳轉） ─────────
  const PII_NOTE = /^已自動遮蔽自由文字裡的個資/;
  let PII_SEEN = new Set(), PII_I = -1, LEAK_I = -1;
  function piiInfo() {
    const spots = MAIN.pii || [];
    const note = (CUR.notes || []).map((n) => n.text || n).find((n) => PII_NOTE.test(n)) || '';
    // 各類處數：新匯入的看位置清單，舊案件從匯入提醒那句話讀
    const cnt = {};
    if (spots.length) spots.forEach((p) => { cnt[p.k] = (cnt[p.k] || 0) + 1; });
    else (note.match(/（(.*?)）/) || ['', ''])[1].split('、').forEach((x) => { const r = x.match(/^(.+) (\d+) 處$/); if (r) cnt[r[1]] = +r[2]; });
    const total = Object.values(cnt).reduce((a, b) => a + b, 0);
    return { spots, cnt, total, old: total > 0 && !spots.length };
  }
  const piiDone = () => { const p = piiInfo(); return !p.total || (p.old ? PII_SEEN.has(0) : PII_SEEN.size >= p.spots.length); };
  function alertBoxes() {
    const p = piiInfo(), done = piiDone();
    const kinds = Object.entries(p.cnt).map(([k, v]) => `${k} ${v}`).join('、');
    const piiS = !p.total ? '沒有自動遮蔽的內容，仍請留意姓名等個資'
      : PII_I >= 0 && !p.old ? `第 ${PII_I + 1} / ${p.spots.length} 處：${esc(p.spots[PII_I].k)}${done ? '（都看過了）' : ''}`
      : done ? `已遮蔽${esc(kinds)}，都看過了` : `已遮蔽${esc(kinds)}，請確認有無遺漏`;
    const leaks = findLeaks();
    const leakS = !leaks.length ? '沒有標記為可能洩漏的內容'
      : LEAK_I >= 0 ? `第 ${LEAK_I + 1} / ${leaks.length} 處：${esc(leaks[LEAK_I].label)}` : '專員看得到，請確認不會透露答案';
    const chk = (X.DB().caseCheck || (() => ({ errors: [], warns: [] })))(MAIN, CUR.title);
    const notes = (CUR.notes || []).map((n) => n.text || n).filter((n) => !PII_NOTE.test(n));
    const items = [...chk.errors.map((x) => ['err', '上架前要完成：' + x]), ...chk.warns.map((x) => ['warn', x]), ...notes.map((x) => ['note', x])];
    const impS = chk.errors.length ? `<span class="bad">上架前要完成：${esc(chk.errors[0])}</span>` : items.length ? esc(items[0][1]) : '沒有提醒';
    ALERT = { p, done, piiS, leaks, leakS, items, chk };
    const piiLeft = p.old ? 1 : p.spots.length - PII_SEEN.size;
    const chip = (k, cls, txt, title) => `<button class="cqa-c ${cls} ${ALERT_OPEN === k ? 'on' : ''}" onclick="event.stopPropagation();CQ.alertOpen('${k}')" title="${esc(title)}">${txt}</button>`;
    return chip('pii', !p.total || done ? 'ok' : 'bd', !p.total ? '個資檢查 0' : done ? '個資檢查 已看完' : `個資檢查 還有 ${piiLeft} 處沒看`, '自動遮蔽的個資；上架前要逐處看過')
      + chip('leak', leaks.length ? 'wn' : 'nt', `可能洩漏 ${leaks.length}`, '專員看得到、可能透露答案的內容')
      + chip('imp', chk.errors.length ? 'bd' : 'nt', `匯入提醒 ${items.length}`, '上架前要完成的項目與匯入時的提醒');
  }
  // 點標籤：個資、洩漏逐處跳到畫面上的位置；下方小視窗顯示第幾處與說明
  let ALERT = {}, ALERT_OPEN = '';
  function alertOpen(k) {
    if (k === 'imp') { ALERT_OPEN = ALERT_OPEN === 'imp' ? '' : 'imp'; return refreshAlerts(); }
    ALERT_OPEN = k;
    if (k === 'pii') piiNext(); else leakNext();
    refreshAlerts();
  }
  function alertPop() {
    const a = ALERT;
    if (!ALERT_OPEN || !a.p) return '';
    const nav = (k) => `<div class="cqa-nav"><button class="cbtn" onclick="CQ.alertStep('${k}',-1)">上一處</button><button class="cbtn" onclick="CQ.alertStep('${k}',1)">下一處</button><span style="flex:1"></span><a class="cqs-link" onclick="CQ.alertClose()">收起</a></div>`;
    const close = '<div class="cqa-nav"><span style="flex:1"></span><a class="cqs-link" onclick="CQ.alertClose()">收起</a></div>';
    let h = '';
    if (ALERT_OPEN === 'pii') h = `<div class="h">個資檢查</div><div class="q">${a.piiS}</div>${!a.p.total ? close : a.p.old ? '<div class="q">舊版匯入沒有位置資料，重新匯入後可以逐處跳轉</div>' + close : nav('pii')}`;
    if (ALERT_OPEN === 'leak') h = `<div class="h">可能洩漏結果</div><div class="q">${a.leakS}</div>${a.leaks.length ? nav('leak') : close}`;
    if (ALERT_OPEN === 'imp') h = `<div class="h">匯入提醒</div>${a.items.length ? `<ul>${a.items.map(([k, x]) => `<li class="${k}">${esc(x)}</li>`).join('')}</ul>` : '<div class="q">沒有提醒</div>'}${close}`;
    return `<div class="cqa-pop" id="cqAlPop" onclick="event.stopPropagation()">${h}</div>`;
  }
  function alertStep(k, d) { if (k === 'pii') piiNext(d); else leakNext(d); refreshAlerts(); }
  function alertClose() { ALERT_OPEN = ''; refreshAlerts(); }
  function refreshAlerts() {
    const b = $('#cqAl');
    if (!b) return;
    b.innerHTML = alertBoxes();
    const old = $('#cqAlPop'), html = alertPop();
    if (old) old.outerHTML = html || '';
    else if (html) $('#cqSettings .cqs-sum').insertAdjacentHTML('afterend', html);
    layout();
  }
  function piiNext(d) {
    const p = piiInfo();
    if (!p.total) return;
    if (p.old) { PII_SEEN.add(0); return; }
    PII_I = PII_I < 0 ? 0 : (PII_I + (d || 1) + p.spots.length) % p.spots.length;
    PII_SEEN.add(PII_I);
    const sp = p.spots[PII_I];
    jumpTo(sp.go);
    setTimeout(() => flashMask(sp.go, sp.ctx), 350);
  }
  // 在跳轉到的區塊裡找到這一處 ***（用前面幾個字比對），閃一下標紅
  function flashMask(go, ctx) {
    const root = go.startsWith('blk-') ? document.getElementById(go) : $('#cqSide');
    if (!root) return;
    const els = [...root.querySelectorAll('*')].filter((e) => ![...e.children].some((c) => c.textContent.includes('***')) && e.textContent.includes('***'));
    const key = String(ctx || '').replace(/\s+/g, '');
    const hit = els.find((e) => e.textContent.replace(/\s+/g, '').includes(key + '***')) || els[0];
    if (!hit) return;
    hit.scrollIntoView({ block: 'center', behavior: 'smooth' });
    hit.classList.remove('pii-flash'); void hit.offsetWidth; hit.classList.add('pii-flash');
  }
  function leakNext(d) {
    const leaks = findLeaks();
    if (!leaks.length) return;
    LEAK_I = LEAK_I < 0 ? 0 : (LEAK_I + (d || 1) + leaks.length) % leaks.length;
    jumpTo(leaks[LEAK_I].go);
  }
  function impToggle(e) {
    if (e.target.closest('ul')) return;
    OPEN.imp = !OPEN.imp; refreshAlerts();
  }
  const OPEN = {};
  function setMeta(k, v) { C.meta[k] = v; saveCase(); renderAll(); }
  function setMask(k, v) { C.meta.mask[k] = v; saveCase(); renderAll(); }

  // ───────── 儲存：改了就排程，停 1.2 秒後送出；同時只送一次 ─────────
  function saveCase() {
    if (!canMod()) return;
    const now = histSnap();
    if (now !== HIST.last) {
      HIST.undo.push(HIST.last);
      if (HIST.undo.length > 50) HIST.undo.shift();
      HIST.redo = []; HIST.last = now;
    }
    dirty = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(doSave, 1200);
    if ($('#cqBar')) renderBar();
  }
  async function doSave() {
    clearTimeout(saveTimer);
    if (!dirty || !CUR) return true;
    if (saving) { saveTimer = setTimeout(doSave, 600); return false; }
    saving = true; dirty = false; saveErr = '';
    renderBar();
    const caseId = CUR.caseId;
    try {
      const r = await X.api('c_save', { caseId, rev: CUR.rev, title: CUR.title, case: MAIN });
      if (!CUR || CUR.caseId !== caseId) return true;
      CUR.rev = r.rev; CUR.updatedAt = Date.now(); CUR.pctFixed = false;
      if (r.demoted) X.toast('案件內容不符合上架條件，已移到未上架', 5000);
      CUR.status = r.status; CUR.tx.state = r.txState || '';
      if (!$('#cqSettings').contains(document.activeElement)) renderSettings();
    } catch (e) {
      dirty = true; saveErr = e.message || String(e);
    }
    saving = false;
    if ($('#cqBar')) { renderBar(); layout(); }
    return !saveErr && !dirty;
  }
  async function saveNow() { saveErr = ''; dirty = true; return doSave(); }

  async function approve() {
    if (dirty || saving || CUR.pctFixed) { if (!(await saveNow())) return X.toast('請先處理儲存失敗的問題', 5000); }
    const chk = X.DB().caseCheck(MAIN, CUR.title);
    if (chk.errors.length) { renderSettings(); layout(); return X.toast('還不能上架：' + chk.errors.join('；'), 6000); }
    if (!piiDone()) { refreshAlerts(); return X.toast('還不能上架：個資檢查還沒逐處看完，請點右上角「個資檢查」框', 6000); }
    const leaks = findLeaks();
    // 明細在案件頁上方的「可能洩漏結果」按鈕裡，這裡只提醒處數
    if (leaks.length && !(await X.confirmBox(`專員看得到、可能洩漏結果的內容共 ${leaks.length} 處，若沒問題請點選上架`, '上架到題庫'))) return;
    try {
      const r = await X.api('c_approve', { caseId: CUR.caseId, rev: CUR.rev });
      CUR.status = r.status; CUR.tx.state = r.txState || '';
      mode = 'agent';
      X.toast(r.txState === 'queued' ? '已上架，有新的中文要翻成英文（排程翻好後 BPO 專員才能用）' : '已上架', 5000); renderAll();
    } catch (e) { X.toast(e.message, 6000); }
  }
  async function unapprove() {
    if (!(await X.confirmBox('下架修改？案件會從可用題庫拿掉、回到「未上架 DMS 考題」，改完再上架。已發佈的測驗不受影響。', '下架修改'))) return;
    try { const r = await X.api('c_unapprove', { caseId: CUR.caseId }); CUR.status = r.status; CUR.tx.state = r.txState || ''; mode = 'edit'; renderAll(); } catch (e) { X.toast(e.message, 6000); }
  }
  async function copy() {
    if (dirty || saving) { if (!(await saveNow())) return X.toast('請先處理儲存失敗的問題', 5000); }
    if (!(await X.confirmBox(`複製 ${CUR.caseId} 成新的案件？\n案件內容、考題、補充資訊圖片都會複製一份，新案件是「未上架」，改好後要再核准。兩個案件之後各改各的，互不影響。`, '複製'))) return;
    try {
      const r = await X.api('c_copy', { caseId: CUR.caseId });
      X.toast('已複製成 ' + r.caseId);
      location.hash = '#/case/' + encodeURIComponent(r.caseId);
    } catch (e) { X.toast(e.message, 6000); }
  }
  async function del() {
    if (!(await X.confirmBox(`刪除案件 ${CUR.caseId}？考題、補充資訊圖片、申請紀錄會一起刪除，不能復原。`, '刪除', undefined, true))) return;
    try {
      clearTimeout(saveTimer); dirty = false;
      await X.api('c_delete', { caseId: CUR.caseId });
      X.toast('已刪除 ' + CUR.caseId);
      location.hash = backOf(CUR.status);
    } catch (e) { X.toast(e.message, 6000); }
  }

  // ───────── 補充資訊圖片：案件裡存 v3img:Ixxxxx，畫面讀出來轉成 blob 網址 ─────────
  const IMG = {};        // ref → blob 網址 | 'loading' | 'error'
  const IMG_WAIT = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#eee"/><text x="20" y="25" font-size="10" text-anchor="middle" fill="#999">…</text></svg>');
  function imgSrc(ref) {
    if (!/^v3img:/.test(String(ref))) return ref;
    const v = IMG[ref];
    if (v && v !== 'loading' && v !== 'error') return v;
    if (!v) {
      IMG[ref] = 'loading';
      (EX ? X.api('x_img', { sessionId: EX.sid, ref }) : X.api('c_imgGet', { ref })).then((r) => fetch(r.dataUrl)).then((res) => res.blob())
        .then((blob) => { IMG[ref] = URL.createObjectURL(blob); if ($('#cq')) renderSide(); })
        .catch(() => { IMG[ref] = 'error'; });
    }
    return IMG_WAIT;
  }
  const readAsDataUrl = (blob) => new Promise((ok, bad) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = bad; r.readAsDataURL(blob); });
  const loadImage = (file) => new Promise((ok, bad) => { const img = new Image(); img.onload = () => ok(img); img.onerror = () => bad(new Error('讀不到這張圖片')); img.src = URL.createObjectURL(file); });
  // 原檔 6MB 內、長邊 4000px 內就原檔上傳（維持畫質）；太大才縮到長邊 2400px 的 JPG
  async function addImageFile(file, i) {
    const md = C.modules[i];
    if (!md || !file) return;
    try {
      X.toast('上傳圖片中…', 8000);
      const img = await loadImage(file);
      let dataUrl;
      if (file.size <= 6e6 && Math.max(img.width, img.height) <= 4000 && /^image\/(png|jpeg|gif|webp)$/.test(file.type)) {
        dataUrl = await readAsDataUrl(file);
      } else {
        const scale = Math.min(1, 2400 / Math.max(img.width, img.height));
        const cv = document.createElement('canvas');
        cv.width = Math.round(img.width * scale); cv.height = Math.round(img.height * scale);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        dataUrl = cv.toDataURL('image/jpeg', 0.92);
      }
      URL.revokeObjectURL(img.src);
      const r = await X.api('c_imgPut', { caseId: CUR.caseId, dataUrl });
      IMG[r.ref] = URL.createObjectURL(await (await fetch(dataUrl)).blob());
      md.images.push(r.ref);
      saveCase(); renderSide();
      X.toast('圖片已上傳');
    } catch (e) { X.toast('圖片上傳失敗：' + e.message, 6000); }
  }

  function newAnswer() {
    return { mc: {}, short: {}, sop: {}, submitted: false, startAt: Date.now(), leaves: 0, leaveMs: 0 };
  }
  function saveAnswer() { if (EX && !EX.readOnly) EX.dirtyAns = true; }   // 專員預覽不記錄；測驗中排程自動儲存

  // ═════════════════════════════ 以下沿用原型（DMS 版面與講師編輯） ═════════════════════════════
  // 找出專員看得到、標記為可能洩漏結果的內容
  function findLeaks() {
    const out = [];
    C.blocks.forEach(b => {
      (b.fields || []).forEach(fd => { if (fd.leak && !fd.hidden) out.push({ label: fd.k, go: 'blk-' + b.id }); });
      (b.timeline || []).forEach(n => { if (n.leak) out.push({ label: 'Timeline：' + n.k, go: 'blk-' + b.id }); });
      (b.cards || []).forEach(cd => cd.rows.forEach(r => { if (r[2] === 'leak') out.push({ label: r[0], go: 'blk-' + b.id }); }));
    });
    const opLeak = C.ops.filter(n => n.leak && !n.hidden).length;
    if (opLeak) out.push({ label: `Operation History 判決／結案節點 ${opLeak} 個`, go: 'ops' });
    ['buyer', 'seller'].forEach(room => {
      const n = C.drc[room].filter(m => m.from === 'shopee').length;
      if (n) out.push({ label: `DRC ${room === 'buyer' ? 'With Buyer' : 'With Seller'} 的 Shopee Agent 訊息 ${n} 則`, go: 'drc-' + room });
    });
    return out;
  }
  function jumpTo(go) {
    if (go === 'ops' || go === 'chat') { sideTab = go; renderSide(); return; }
    if (go.startsWith('drc-')) { sideTab = 'drc'; drcRoom = go.slice(4); renderSide(); return; }
    const el = document.getElementById(go);
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - cqTop() - 10, behavior: 'smooth' });
  }

  // ===== 左側導覽 =====
  let navClosed = false;
  function renderNav() {
    const nav = document.getElementById('cqNav');
    nav.classList.toggle('closed', navClosed);
    nav.innerHTML = `<button class="fold" onclick="CQ.toggleNav()" title="${navClosed ? U('展開', 'Expand') : U('收合', 'Collapse')}">${navClosed ? '»' : '«'}</button>` +
      C.blocks.map(b => `<a id="nav-${b.id}" href="#blk-${b.id}" onclick="event.preventDefault();CQ.jumpTo('blk-${b.id}')">${esc(T(b.title))}</a>`).join('');
    markNav();
  }

  // 捲動時，目前看到的區塊在導覽上變紅
  function markNav() {
    const top = cqTop() + 20;
    let cur = C.blocks[0] && C.blocks[0].id;
    C.blocks.forEach(b => {
      const el = document.getElementById('blk-' + b.id);
      if (el && el.getBoundingClientRect().top - top <= 20) cur = b.id;
    });
    document.querySelectorAll('#cqNav a').forEach(a => a.classList.toggle('on', a.id === 'nav-' + cur));
  }

  // ===== 中間：DMS 區塊 =====
  function renderMain() {
    document.getElementById('cqMain').innerHTML = C.blocks.map((b, bi) => `
      <div class="blk" id="blk-${b.id}">
        <h2>${esc(T(b.title))}${(b.titleTags || []).map((tg) => ` <span class="tag" style="font-size:13px;font-weight:400;vertical-align:middle;${tg.style ? esc(`color:${tg.style.color};background:${tg.style.background};border-color:${tg.style.borderColor}`) : ''}">${esc(T(tg.text))}</span>`).join('')}${VIEW >= 0 ? ' <span class="prevtag">前一次申退</span>' : ''}</h2>
        ${b.fields ? `<div class="grid${b.id === 'general' ? ' g4' : ''}">${b.fields.map((fd, fi) => fieldHtml(bi, fi, fd)).join('')}</div>` : ''}
        ${isEdit() && b.fields ? `<button class="addfd" onclick="CQ.addField(${bi})">＋ 新增欄位</button>` : ''}
        ${b.timeline ? timelineHtml(bi, b.timeline) : ''}
        ${(b.tables || []).map((t, ti) => tableHtml(bi, ti, t)).join('')}
        ${b.cards ? `<div class="cards">${b.cards.map((cd, ci) => cardHtml(bi, ci, cd)).join('')}</div>` : ''}
      </div>`).join('');
  }

  // Timeline：橫向節點，講師可改文字與時間、刪除節點
  function timelineHtml(bi, nodes) {
    if (!nodes.length) return '<div class="hint">（沒有節點）</div>';
    const items = nodes.map((n, i) => {
      if (!isEdit()) return `<div class="tln"><div>${esc(T(n.k))}</div><div class="t">${esc(n.t)}</div></div>`;
      return `<div class="tln">
        <div><span contenteditable data-set="tl" data-b="${bi}" data-i="${i}" data-k="k">${esc(n.k)}</span></div>
        <div class="t"><span contenteditable data-set="tl" data-b="${bi}" data-i="${i}" data-k="t">${esc(n.t)}</span></div>
        ${n.leak ? '<span class="leak">可能洩漏結果</span>' : ''}
        <div class="ectl"><button class="del" onclick="CQ.delTl(${bi},${i})">✕</button>
        <button onclick="CQ.cutTl(${bi},${i})" title="刪除這個節點之後的所有節點">之後全刪</button></div></div>`;
    }).join('');
    return `<div class="tlh">${items}</div>${isEdit() ? `<button class="addfd" onclick="CQ.addTl(${bi})">＋ 新增節點</button>` : ''}`;
  }
  function delTl(bi, i) { C.blocks[bi].timeline.splice(i, 1); saveCase(); renderAll(); }
  function cutTl(bi, i) {
    const list = C.blocks[bi].timeline, n = list.length - i - 1;
    if (!n) return alert('這已經是最後一個節點');
    if (!confirm(`刪除這個節點之後的 ${n} 個節點？`)) return;
    list.splice(i + 1); saveCase(); renderAll();
  }
  function addTl(bi) {
    const k = prompt('節點名稱（例如 Return Processing）');
    if (!k) return;
    const t = prompt('時間（YYYY-MM-DD HH:mm +0800）', '');
    C.blocks[bi].timeline.push({ k, t: t || '-' }); saveCase(); renderMain();
  }

  function isMasked(kind) { return kind && C.meta.mask[kind]; }

  function fieldHtml(bi, fi, fd) {
    // 對專員隱藏的欄位留一個空格，其他欄位維持 DMS 的位置
    if ((fd.hidden && !isEdit()) || fd.blank) return '<div class="fd"></div>';
    const cls = 'fd' + (fd.wide ? ' wide' : '') + (fd.hidden ? ' hid' : '');
    const label = `<span class="k">${esc(T(fd.k))}${fd.help ? '<i class="help">?</i>' : ''} :</span>`;
    let val;
    if (fd.media) {
      val = mediaHtml(fd.media, isEdit() ? `CQ.delMedia(${bi},${fi},IDX)` : '');
    } else if (fd.masked) {
      val = `***<i class="eye"></i>`;
    } else if (isMasked(fd.mask) && !isEdit()) {
      val = '***';
    } else {
      const text = isEdit()
        ? `<span contenteditable data-set="field" data-b="${bi}" data-f="${fi}">${esc(fd.v)}</span>`
        : TX(fd.v);
      val = `<span class="pw ${fd.link ? 'link' : ''}">${text}</span>`;
      if (fd.tags) val += ' ' + fd.tags.map((t, i) => tagHtml(t, fd.tagColor, i, fd, bi, fi)).join('');
      if (fd.popup) val += `<span class="vd" onclick="CQ.showFieldPop(event,${bi},${fi})">${esc(T('View Detail'))}</span>`;
      // 第二行起（例如 Proof Status 的 Due time、CS Case New Updates 的其他項目）：文字，或 [名稱, 時間]
      (fd.lines || []).forEach((ln) => { val += `<div class="dt-line">${Array.isArray(ln) ? esc(T(ln[0])) + ' ' + esc(ln[1]) : esc(T(ln))}</div>`; });
      if (isEdit() && isMasked(fd.mask)) val += `<span class="leak" style="background:#f1f5f9;color:#64748b;border-color:#cbd5e1">專員看到 ***</span>`;
    }
    let ctl = '';
    if (isEdit()) {
      ctl = `<span class="ectl">
        ${fd.tags ? `<button onclick="CQ.editTags(${bi},${fi})">標籤</button>` : ''}
        <button onclick="CQ.toggleHidden(${bi},${fi})">${fd.hidden ? '顯示給專員' : '隱藏'}</button>
        <button class="del" onclick="CQ.delField(${bi},${fi})">✕</button></span>`;
      if (fd.leak) ctl += `<span class="leak">可能洩漏結果</span>`;
    }
    return `<div class="${cls}">${label}<span class="v">${val}${ctl}</span></div>`;
  }

  // tag 顏色：講師選的（fd.tagColors）＞排程照 DMS 規則給的（fd.tagStyle）＞舊的 tagColor 名稱
  // 講師編輯模式點 tag 換下一個顏色；換回「系統預設」就用 DMS 的顏色
  const TAG_PALETTE = {
    gray: { name: '灰', color: 'rgb(111, 120, 138)', background: 'rgb(229, 230, 233)', borderColor: 'rgb(203, 205, 212)' },
    blue: { name: '藍', color: 'rgb(38, 115, 221)', background: 'rgb(229, 238, 251)', borderColor: 'rgb(185, 210, 244)' },
    red: { name: '紅', color: '#ff2a00', background: '#ffe0e0', borderColor: '#f9c6bb' },
    orange: { name: '橘', color: 'rgb(240, 115, 0)', background: 'rgb(253, 238, 224)', borderColor: 'rgb(250, 210, 173)' },
    green: { name: '綠', color: '#13a08a', background: '#e6f7f4', borderColor: '#9bdccf' },
    gold: { name: '金', color: '#cc8b23', background: '#fff2e0', borderColor: '#f4ddb9' },
  };
  const TAG_ORDER = ['', 'gray', 'blue', 'red', 'orange', 'green', 'gold'];
  function tagHtml(t, color, i, fd, bi, fi) {
    const pick = fd && (fd.tagColors || [])[i];
    const st = pick && TAG_PALETTE[pick] ? TAG_PALETTE[pick] : fd && (fd.tagStyle || [])[i];
    let c = color === 'blue' ? 'blue' : '';
    if (color === 'mix') c = i === 0 ? 'blue' : 'orange';
    if (color === 'teal') c = 'teal';
    if (t === 'Shopee Integrated') c = 'teal';
    const css = [];
    if (st) css.push(`color:${st.color}`, `background:${st.background}`, `border-color:${st.borderColor}`);
    const canPick = fd && bi !== undefined && isEdit();
    if (canPick) css.push('cursor:pointer');
    const attrs = (css.length ? ` style="${esc(css.join(';'))}"` : '')
      + (canPick ? ` onclick="CQ.cycleTag(${bi},${fi},${i})" title="點一下換顏色（目前：${pick ? TAG_PALETTE[pick].name : '系統預設'}）"` : '');
    return `<span class="tag ${st ? '' : c}"${attrs}>${esc(T(t))}</span>`;
  }
  function cycleTag(bi, fi, i) {
    const fd = C.blocks[bi].fields[fi];
    const cols = fd.tagColors = (fd.tagColors || []).slice();
    while (cols.length <= i) cols.push('');
    cols[i] = TAG_ORDER[(TAG_ORDER.indexOf(cols[i] || '') + 1) % TAG_ORDER.length];
    if (cols.every((x) => !x)) delete fd.tagColors;
    saveCase(); renderMain();
  }

  function mediaHtml(list, delTpl) {
    if (!list.length) return '<span class="ph">（沒有附件）</span>';
    return `<div class="thumbs">${list.map((m, i) => m.type === 'file' ? `
      <a class="thumb dt-file" href="${src(m.url)}" target="_blank" rel="noreferrer" title="另開分頁（需要公司內網／VPN）">📄</a>` : `
      <div class="thumb ${m.type === 'video' ? 'video' : ''}" onclick="CQ.openLightbox('${src(m.src)}','${m.type}','${m.url ? src(m.url) : ''}','${mediaKey(m)}')">
        ${m.src ? `<img src="${src(m.src)}" alt="">` : ''}
        ${delTpl ? `<button class="x" onclick="event.stopPropagation();${delTpl.replace('IDX', i)}">✕</button>` : ''}
      </div>`).join('')}</div>`;
  }

  function tableHtml(bi, ti, t) {
    const head = t.cols.map(c => `<th>${esc(T(c))}</th>`).join('') + (isEdit() ? '<th></th>' : '');
    const rows = t.rows.map((r, ri) => `<tr>${r.map((cell, ci) => `<td>${cellHtml(bi, ti, ri, ci, cell)}</td>`).join('')}
      ${isEdit() ? `<td><span class="ectl"><button class="del" onclick="CQ.delRow(${bi},${ti},${ri})">✕ 刪除列</button></span></td>` : ''}</tr>`).join('');
    return `${t.title ? `<div class="tbltitle">${esc(T(t.title))}</div>` : ''}
      <div class="tblwrap"><table><tr>${head}</tr>${rows}</table></div>`;
  }

  // 商品名稱的連結：蝦皮前台商品頁 https://shopee.tw/product/<商店ID>/<商品ID>
  // 新匯入的案件排程已經存好 url；舊案件從同一列的 Product ID 欄（或「Product ID: …」那行）＋ Seller Info 的 Shop ID 組
  function productUrl(bi, ti, ri, p) {
    if (p.url) return p.url;
    const t = C.blocks[bi].tables[ti];
    const col = t.cols.indexOf('Product ID');
    const fromCol = col >= 0 ? t.rows[ri][col] : '';
    const fromExtra = ((p.extra || []).map((x) => /^Product ID: (\d+)$/.exec(x)).find(Boolean) || [])[1];
    const item = String(fromExtra || (typeof fromCol === 'string' ? fromCol : '') || '');
    const seller = C.blocks.find((b) => b.id === 'sellerInfo');
    const shopFd = seller && (seller.fields || []).find((fd) => fd.k === 'Shop ID');
    const shop = String((shopFd && shopFd.v) || '');
    return /^\d+$/.test(item) && /^\d+$/.test(shop) ? `https://shopee.tw/product/${shop}/${item}` : '';
  }
  function cellHtml(bi, ti, ri, ci, cell) {
    const path = `data-set="cell" data-b="${bi}" data-t="${ti}" data-r="${ri}" data-c="${ci}"`;
    if (typeof cell === 'string') {
      return isEdit() ? `<span contenteditable ${path}>${esc(cell)}</span>` : esc(T(cell));
    }
    if (cell.product) {
      const p = cell.product;
      const url = productUrl(bi, ti, ri, p);
      const name = isEdit() ? `<span contenteditable data-set="prod" data-b="${bi}" data-t="${ti}" data-r="${ri}" data-c="${ci}" data-k="name">${esc(p.name)}</span>`
        : url ? `<a class="dt-prod" href="${esc(url)}" target="_blank" rel="noreferrer">${esc(p.name)}</a>` : esc(p.name);
      // Order Detail 的「Product ID: …」連到 DMS 商品資訊頁（要登入 DMS、公司內網）
      const extra = (p.extra || []).map((x) => {
        const m = /^Product ID: (\d+)$/.exec(x);
        return `<div class="var">${m ? `Product ID: <a class="dt-prod" href="https://dms.cs.shopee.tw/portal/info/product/${m[1]}" target="_blank" rel="noreferrer">${m[1]}</a>` : esc(x)}</div>`;
      }).join('');
      return `<div class="prod"><img src="${src(p.thumb)}" alt="" onclick="CQ.openLightbox('${src(p.thumb)}','image')">
        <div><div>${name}
        <b>X${p.qty}</b></div><div class="var">Variation: ${esc(p.variation)}</div>${extra}</div></div>`;
    }
    if (cell.media) return mediaHtml(cell.media, '');
    let text = (isMasked(cell.mask) && !isEdit()) ? '***' : esc(T(cell.text));
    if (isEdit()) text = `<span contenteditable ${path}>${esc(cell.text)}</span>`;
    let html = text;
    if (cell.track) html += `<span class="vd" onclick="CQ.showTrack(event,${bi},${ti},${ri},${ci})">View Detail</span>`;
    if (cell.tags) html += '<br>' + cell.tags.map(t => tagHtml(t)).join('');
    return html;
  }

  function cardHtml(bi, ci, cd) {
    let inSub = false;
    const rows = cd.rows.map((r, ri) => {
      if (r[2] === 'h') { inSub = true; return `<div class="r h"><span>${esc(T(r[0]))}</span></div>`; }
      const leak = isEdit() && r[2] === 'leak' ? '<span class="leak">可能洩漏結果</span>' : '';
      const val = isEdit()
        ? `<span contenteditable data-set="card" data-b="${bi}" data-c="${ci}" data-r="${ri}">${esc(r[1])}</span>
           <span class="ectl"><button class="del" onclick="CQ.delCardRow(${bi},${ci},${ri})">✕</button></span>`
        : esc(T(r[1]));
      return `<div class="r ${inSub ? 'sub' : ''}"><span>${esc(T(r[0]))}:${leak}</span><span>${val}</span></div>`;
    }).join('');
    return `<div class="pcard"><h4>${esc(T(cd.title))}</h4>${rows}</div>`;
  }

  // ===== 物流軌跡彈窗 =====
  function showTrack(ev, bi, ti, ri, ci) {
    const cell = C.blocks[bi].tables[ti].rows[ri][ci];
    showPop(ev, 'Logistics tracking', `<div class="tl">${cell.track.map(t => `<div>${esc(t[0])}<span>${esc(t[1])}</span></div>`).join('')}</div>`);
  }
  function showFieldPop(ev, bi, fi) {
    const p = C.blocks[bi].fields[fi].popup;
    const rows = p.rows.map(r => r[1] == null
      ? `<div style="font-weight:600;color:var(--ink);margin:10px 0 4px">${esc(T(r[0]))}</div>`
      : `<div style="display:flex;justify-content:space-between;padding:3px 0"><span>${esc(T(r[0]))}:</span><span>${esc(T(r[1]))}</span></div>`).join('');
    showPop(ev, T(p.title), rows);
  }
  function showPop(ev, title, html) {
    ev.stopPropagation();
    const pop = document.getElementById('cqPop');
    pop.innerHTML = `<h4>${esc(title)}</h4>${html}`;
    pop.classList.add('on');
    const r = ev.target.getBoundingClientRect();
    const h = pop.offsetHeight;
    pop.style.left = Math.max(10, Math.min(window.innerWidth - 480, r.left - 200)) + 'px';
    pop.style.top = (r.top - h - 10 > 60 ? r.top - h - 10 : r.bottom + 10) + 'px';
  }

  // ===== 講師編輯：DMS 欄位 =====
  function onFocusOut(e) {
    const el = e.target;
    if (!el.dataset || !el.dataset.set) return;
    const d = el.dataset, v = el.innerText.trim();
    const b = d.b != null ? C.blocks[+d.b] : null;
    if (d.set === 'field') b.fields[+d.f].v = v;
    if (d.set === 'cell') {
      const row = b.tables[+d.t].rows[+d.r];
      if (typeof row[+d.c] === 'string') row[+d.c] = v; else row[+d.c].text = v;
    }
    if (d.set === 'prod') b.tables[+d.t].rows[+d.r][+d.c].product.name = v;
    if (d.set === 'card') b.cards[+d.c].rows[+d.r][1] = v;
    if (d.set === 'tl') b.timeline[+d.i][d.k] = v;
    if (d.set === 'opkv') C.ops[+d.i].kv[+d.k][1] = v;
    if (d.set === 'msg') msgList(d.room)[+d.i].text = v;
    saveCase();
  }
  function addField(bi) {
    const k = prompt('欄位名稱（例如 Order Type）');
    if (!k) return;
    C.blocks[bi].fields.push({ k, v: '-' });
    saveCase(); renderMain();
  }
  function delField(bi, fi) {
    if (!confirm(`刪除欄位「${C.blocks[bi].fields[fi].k}」？`)) return;
    C.blocks[bi].fields.splice(fi, 1); saveCase(); renderAll();
  }
  function toggleHidden(bi, fi) {
    const fd = C.blocks[bi].fields[fi];
    fd.hidden = !fd.hidden; saveCase(); renderAll();
  }
  function editTags(bi, fi) {
    const fd = C.blocks[bi].fields[fi];
    const v = prompt('標籤，用逗號分隔', fd.tags.join(', '));
    if (v == null) return;
    fd.tags = v.split(',').map(s => s.trim()).filter(Boolean);
    saveCase(); renderMain();
  }
  function delMedia(bi, fi, i) {
    C.blocks[bi].fields[fi].media.splice(i, 1); saveCase(); renderMain();
  }
  function delRow(bi, ti, ri) {
    C.blocks[bi].tables[ti].rows.splice(ri, 1); saveCase(); renderMain();
  }
  function delCardRow(bi, ci, ri) {
    C.blocks[bi].cards[ci].rows.splice(ri, 1); saveCase(); renderAll();
  }
  // ===== 右側面板 =====
  // 2026-11-20：同一個分頁重畫時保留捲動位置（講師改正解、配分等會重畫考題分頁，以前會跳回最上面）
  let sideDrawn = '';
  function renderSide() {
    const tabs = [['quiz', U('考題', 'Questions')], ['ops', 'Operation History'], ['chat', 'Chat History'], ['drc', 'Discuss']];
    document.getElementById('cqTabs').innerHTML = tabs.map(t =>
      `<button class="${sideTab === t[0] ? 'on' : ''}" onclick="CQ.tab('${t[0]}')">${t[1]}</button>`).join('');
    const body = document.getElementById('cqSide');
    const key = sideTab + (sideTab === 'drc' ? drcRoom : '');
    const oldPane = body.querySelector('.pane');
    const keep = key === sideDrawn && oldPane ? oldPane.scrollTop : null;
    drawSide(body);
    sideDrawn = key;
    const newPane = body.querySelector('.pane');
    if (keep !== null && newPane) newPane.scrollTop = keep;
    renderActbar();
  }
  function drawSide(body) {
    if (sideTab === 'ops') body.innerHTML = opsHtml();
    if (sideTab === 'chat') body.innerHTML = `<div class="pane">${msgsHtml('chat')}</div>`;
    if (sideTab === 'drc') {
      body.innerHTML = `<div class="subtabs">
        <button class="${drcRoom === 'buyer' ? 'on' : ''}" onclick="CQ.room('buyer')">With Buyer</button>
        <button class="${drcRoom === 'seller' ? 'on' : ''}" onclick="CQ.room('seller')">With Seller</button></div>
        <div class="pane">${msgsHtml('drc-' + drcRoom)}</div>`;
    }
    if (sideTab === 'quiz') body.innerHTML = `<div class="pane" id="cqQuizPane">${isEdit() ? quizEditHtml() : quizAgentHtml()}</div>`;
  }

  function msgList(room) { return room === 'chat' ? C.chat : C.drc[room.slice(4)]; }

  // 聊聊、Discuss 的頭像與系統訊息圖示：DMS 畫面上的原圖（2026-11-19 Chris 從 DMS 複製的 data URI，不連外部網址）
  // Discuss 的買家、賣家共用同一個人像（DMS 檔名 ic_buyer_seller_default）
  const ICON_CHAT_BUYER = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACQAAAAkCAYAAADhAJiYAAAABmJLR0QA/wD/AP+gvaeTAAAEmElEQVRYhbWYXWwUVRTHf6c7C9sKpaUULVIIUNKSIGlMYwTcWlLCRxViY6gE3+TFBKsx8c346pvGFA0xvPhkJJVXm2qhyrK1SIkmTUobQyxFtNjWQhG2dDtzfJiZ3dnv6ddJbjZn7p37/+25954zM8ICTfuO12AGDoO5H6UOdCuw1u60ZkDHEIaxrKuY0i3NXbcWMr/4guhtMgiWv4GlZxD2goIq4Dby+X2IfMG90gvS1mkuGUgjrUeADtCdPsTz+SNY1rvSfPn7RQHpwLESZoMdqJ5ehHg+/zyh2Huy7+eYbyCNtm4E6cLS55cNRtWdHdABDLNFGiMTBYE02roR5QpK7SLF/PojBK1wOlRRCszAsRKQrhQY1UzxpcMAWsucfKe9TaGcQMSCHSnLtHgxfz5WA+b8Z16ExJJp9LVDWNK9sjCea15faJHmaFcCSHubDIzyIdyj7U4WLAUJ2DdacYg/WLiYP3+Y6c27pa3TNAAIlJ3MgEFh+1tQUm278RkY/Gg5xLP5dawfOwF8Y+8h0TOpg5023gNjF+Cfn+xohapWAsZx5R0bpe94Dab8nndwIAR7PoZ7l2Cyz+l3xomzDRORJTlH4lchNg5qegC8es5Ay9phYMrhgv9k/jE8GoVnjkDVK/a+kiLnN70Znj7PIR75FP68mAsGQAgEDhWhut9XWGeGHaH0lg6UBQYg9lc+GLcvbKDsQtLDmMWfuQmbW1NFb39tRw7spXN1BKj9AIo32b45C9M38sPY99UZiFVdEAZsYTMGwXVJqLI9UPysEw1xQJ09FVyXFJq6BuaT/DAAyhYDWOuvSFp2lCr2YSf4AKxvyFyybPV6IlIYxrZSY0FF8/4gbAgnxe98C//9YQ8RYPXTsPNM2r+2YCrqBwYAA6yHQIWv1H9/MHVDr6qA4tnk/lldkanwYBDm7vvlmTGAO6hWFIQBmJuE2F14apsdoaqj2U+U1yYifmFAGDNQhoD6gjCJ0zYMa3bAI3ep0mC8CdKchfG8T6zpdtMAjYKeyg3juRYsg41N8O8ADH5YoDQsxuSqgSndBCxFVXJP7vg1b0NwLYQqof4TkieqAMSv7ztlI68pce0ukuauWyj9vrL147sw/RvEH/qH8W9ROdo/aj9+qPV55vtWFrjRr/Ik0CXbWXAfYSfLL4CO5IZxm8CmV2Hrm3YmzgdTugu2n4ayej8wQ0xXX0wASVuniUl7ini2SKypgcqX7JJR2ZgbBmDz6zbUlhOFcSyr3X2rTZxZOXjpB+B8Qjzbssz+bdcz1WRRzWVuWnAzeW47J4d/uZzg8PZo395iHq+6gmhDzrpWFIKiVRAvlH0FVm+AuSm7fGS3axihJjnw42xWIAC9Eq4kTgTVWucKmTlqWWwYIx6WAzcmvRczcr40RiZ4Qhjk+grCXCMebEyHyQoEIC2RCUrmXwa+XAGYcxihJmnJfK8HP59jel48iHIWqFsiyBCW1e7dwNksT5m2TQ729zBdvRuVU0CUhYVKgasIJ4n2P1cIBnx+QUtR6H5hG4HAIVTDwC5gK+4nPZhBuI0yjEiEuHbL0f7Rhcz/P0zoQdxmBX7MAAAAAElFTkSuQmCC';
  const ICON_CHAT_SELLER = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACQAAAAkCAYAAADhAJiYAAAABmJLR0QA/wD/AP+gvaeTAAAFEElEQVRYw72YXUwcVRSAz52fBVwWFiq01SApbS0kWH+i8S+rTbRgqq9U45OJ8SdU24T4YH3iwbe+GKwxhsTExBgVX7SxK21iE1uaqq2+WApNKEq1UgVhd9kuXXbu8ZzZndmZ3Z1hFsSbXO7Mzp17vjnn3HPPQUCVrf/LxI4cQi8iPIoAnSihnXqE7gENSNIwgwZOAIgzIoejH70QnapmfRFk0uAp1GaXks+S0APUHyYAMAG4y9IRXc8k4FmUyntGuOGzkf3CWDdQ/9eJpySKIRK00xuiMgyPsjhnkq4PfvFK9MSagF4+du0WVakfosVerCSoShga0Zo3rGTSh0YG2jKBgV4dTbWCAXGQeF8gGBYmg8DYz87rUts3cjDy96pADEPO+B29uGsjYBwancwKPRYvgVJKzcSaWQ+My+E9YXgUuzQjd3zP4HStJxD7jGkmXDuMxBKf8gOWeH843PhORZP1H1/skVIZ9f3q9cJU2gTS7PvibzbHbSAzzqRT4yRoZyVBtZqAwb1haAkrsJY2m5Aw8GkK0stYGRhhItLR1M1xypRwPZ18zguGx45m1YaZS0v48FwG0CHwkwvLMLNQjHknJ7Pw8+85+35LowJ3tqpeMNw6U1cW+mwfkhyBfWy9pb6omStzBpydXnFtT76fWZD2/aXZHFy4uuLS0m1NqheM5TyvmUB8NtGEh/xsvjlSBGINtdT7m+5Wes7zXEBRxRuGG8IjPUcWtymFg9LHAdGlIY4x7WRCZ4vWCQiHijprI+GlAW4rA3nBFHSkGLJHQ0GntuGMHSVBjcZrSQndW/NvPdNdU7bS20/Xu+5j20Nmd7Y//pF+MJaWYhrBdFWOOcWt/fEPGZiey0FvVw2/ZC+KhT9YvrA98uVXPy3DqYtZfxhWkYBOjSa1+cFYR8Hl6wbEOtAUYP5mgVkfA1iu5QLUOO24nLF6eKCpdzBQxA/GuubZIYpHriMBnGCiDMaaBxg4ZDVoQWB4ZCcNqZYwATnaDcsrRW2BAyKk0fZVGDAPKYQITMQaSpHATX4wlgZ0Vdhm+GUmB5f/LNrB6Vc7NqtwV5tmm7cKniQDXSWYTf5pKWso/+WW4Ae263Bvuw6WRdDhS6Qce9tXA0TTZmiX4Ti9c4//6Z6nCDk0NJ+RMJ/CvJnpp1od4PZm1TSTxCIMXyoBgWjuJY3wxwjqeT8YC9apoYUlCVN/5WyHra9TYFurZj+XWPyQ4BaDM5rI4ihyVJcgvBIsWXDqGmuX0fXdZK7d1J3O7NRK/v28RgOajISJUYXrJoI4VyF5cqejaAcv0wQqnSYad9p5upoPCWbXhQleoxc6XQc02dg3h5t+LZz24mglGKfp2F8yWQzimC7oLIWH+SUMop53bfP2fY6qkkxcdOXSVgboAK0hp26sKzWrv6DEjUAfMk4J2m5O0Gxl9g0v7iWCE14wZYFTrg4TuHxG5Yn44ei3riR/5KXoSRI47JeGbAQMLfO+BVNWdYgb6UMk6Lz8/2C+v7mcGPAtFPuGUi1ZWDnNddNGwlCb0DUtduyNhjnPusw0HVWSWdBjJPzHjdSMkPpjpTAVgbhxeVuLS49T8vZB0N1Ujc+QmfbE3yqv6wNF9d4jc09StcQxonOdLOO0m153OvCa/2HFcSo1tbCf9HmAq4MqjifW6xidSUcfvNk8Mjgo5H/yHzRnM0sVqg44Iae3u+induoRK5+hBX/jSpSeneaziY+Datb/FwNHedzntXtAAAAAAElFTkSuQmCC';
  const ICON_DRC_AGENT = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADwAAAA8CAYAAAA6/NlyAAAAAXNSR0IArs4c6QAACQdJREFUaAXlW39wVMUd/+6+d7nkkhx3obSIv1CqETFJSRCmVjqlo9ZBcxhpsFRspaWdzjhWHTodHOoQR6lFB2sHRzp2/KMlSGsUk1DpiLZoEQanTSApP6SUBikFbG1yuUsuubv33va7C+/m5X682/fuUmKzM2/evt3vfr/fz9vvfve7u+8RGKcUbZ47TY9rX2JAawGMamBwLSNkKoqrJAAVjEGcEBYFRiIMWB+hcIwxchQIey/Y3nuIYOV4qIayi5ciTXXXGhr7BiOsEQHWoMau+CPYfwGwtyiFrX7PdbtIW5teLC1dKWQVzlpa6GD3a0sNBo9g+eetdUXKn6NAXqIVnuf827o+LpRnQYDDS+ruMQxjHSoxu1BF8rcnw0izmSh0fbD9YDg/fXYKV4AjodpqtLEXGGNfzs52/Eq5uTMgq6s6e1rdSHEMeCBU9y10QpvR6ZS4EVisNgi8I+CtWkHa3hlywlMaMB+r4e7tT2OvrnYiYDxpCYFeUNVQcPuBD2XlSAFmoS9UDkBkG3reO2QZ/6/ouIkrhDb5Ow7uk5GZF/DA3XOvZJr+BjA2R4bhxaBBEHFG6CqZcW0L+ELP7seevf5iAHEiE3tap4TcMaWj5027djRXJY5VEoZo6ycBLMeA+ioGY7/mwU8uTLw8J+DBu+qeRCYhu8YTrQ71DWia0cHuXeDPpVtWkw431i0zwPhNrkZuyok/CN7Gr0PJgkVAp18GTNPAOPU3SLy7E+JvbQfA5yKmncGGpY2kpcVI55kBONxYexVSHUIj8aUTu332IEjfQ08ArTj/4pmO4KgCOO4ES/10HwytfwiMf550KyKzHaWPVnX0/CS9IgPwQKi2o5imrNbfDBWPbQKiKJB4fzeMbtsMet8xAEUFteZG8K36ISiXXw1GBCe+7zcD68d1Q1ESiUGpZ3ZVW9cpK7sxY3hwyecWFxMseMug/IHHBNiR1udhGHtR//sH3MOgCSdBO7APIquXQ2L/H4Ciyfu+u8aqW4F55iOjyWfTmYwBbDD98XSCQp7Lln8P6LRLINn1Hoy+8mJ2VqMjMPzTtWAMfAwlN90CnnkLs9O5KMV19tL+UH2ttWkKcPiuutvwxc+zVhaUV1Xw3r6MTxcQ+8UGe1Yjw8AtgCdv4wp7Wse12qPWJinAhm4UNUZWq+uA+MrBOPsPMM58aJWZNZ/s2iPK1Rp85/iyipXQSTX3NzdcYfITgIdDc2egw7zFLCzGnc44L0M/cUSKHev/tzBronrEMJBqJEGEFqZAPHmvSSq8dHhJ7Q8Mgz1jFsre/Zu2A/30jOzkqDjxeHC+TQIk8ZJJ3lIguK/D4qO4As2YQgWHxLtvQOyFJ2S4WWmOVu34iwiPhe1gSNZkrZXN8wCCoJJ2ifcY8MtBsuNJp013wClFOptvWvg7e49Rdl9tOQFyY6rKQYbFRxxQF4eUxWKuGBlAFvGGNDIIC9HOnXXBBZFsxJ1wVxqnZPKtLecJQ2UBWNUZ1DtvfqEFzqGyiek6JHbvgCQGG8aZU0BKy4BecrmYdz0NC/MODVMOG3X3ktFZNXAeKnrnah74uEmywo3oIAz9aJUIKUnVNFCumAUMTSuxdxck3m4HEqgC3wPrxMIinx4M52x3icxkzc0lKmKtdscAI0TJtz28cY0AW/adNeBdfI8INblMvohI/PF3EO9oBeHcJBRxO4z49DSknZil4oHGdJcdDDLCDZxfte69UPLFxVCKy0NrIriA8C5qFJe13DZfgN/QdH06buqzClsBdpUSXlo/e0pwoFd+1o6TdJ17k+YiWCWPtCqlpaURspH8TkuZMVOsfZM4XkUQksbD6WMhgPFgTwB2KjNFLzOGaXAqeO9cLpaF0bXfBv3kX1Pt3WRkhpEdXx5pRfGaakeUq45JTktlK8+vS+KdrbjI/yqocxqgZNGdUHLzV3CB4WxEybzkXPoSMKIYuJKhXAT5ymWF890OvrNR+dwrUHLr3aDhgiL2/OMQXnkrjPzqZ1LOz9SlEJPG09soZQTOmswc3x16TPXq66D8wRYIbHkHfI+sB+Wyq2D01Zcg8nAz6OdOS4kvBLCqKOcoRiCuB5XbWJrg1g+fjvwbXwY+NxsINoa7HnyzIG+ScJTZePCN+gp11gmKMnBHzV0q1IFwqXxu9t7eDNrRA6Af682riPseZifxS4IEVQh055WSg0B2DOdonipWa+aLPN/XskssEcd1sruvH9B2ujhv6p8Ce7C7JVfoaepIeGkOQuPbsjZJ78OdTEw0+CkbKvlQNhsTCnS3kEG29A7j7t6fshHlK5Pp4djPfwzRh5fB8KYWsYVj5cnHbHz3b2H09V8CxQWFcs0N1uqMPIu5XTjgywQmAIsdDzx1ex13PW7KkJCnQAZw2X0PgvGfjyCBxyn8opfOBPWaOSLq0o8fAeOj00AqA1C+ekNqUZFLbAE+4yjf7eB8BWAPU15OEG0DvvDULmYuodZymcCDTz2Vz7SCdrgLEr/vAO34YUjsexvtE4V95lLwNt0PpU3fBBqQiH0kV2dWHUWekC1mmQBc3nngTH9jDWoBt5kVMneZHuZ8+BmS54Z54pLhm4vGjYfm0xHzeraaPFM9ShW60SyUvqPTKsaCQFYew40Epwm9c5v1fCkFONDesws74s+OGKJZaoeEt3fUzC1xsme/i6bqU9ZGKcC8kBJlnbVSJh978SnhlGRoC6FJ7HlT+AAnPNCcX63q7B4TzWBkOTa5Oi4t84F6fX3q/Hcsx8Ke+NRl4PmxOHV0xCr7cWkG4PE4EHekZ7GIcxyIjzFpLiuwo7cP931WFkvuReKzMzi36elssjN62CTCnn7SALbWfP4E3T8I+n0LyNb3I9l0zgkYxw7Br2Xb8R7K1nAilqGTClMPnT/ltYPHc+mXYdImITZmAahcgZ94HzHLJvKdBxgYIn/NDizXPydgXkk690aJqi7GUOkwf56oCc00jp8U35/vKzyuf06TtoL7f/q41LaHTdC8p4P1S0MYiWV8FWPSXIw76oOfDyvzZb+k5TpK9bAVzKT5QNwKelL9AmAFPml+8rCCnlS/8ViB8/yk+FErHbT5PFF/xfsvf9ijyjBpdlYAAAAASUVORK5CYII=';
  const ICON_DRC_PERSON = 'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyB3aWR0aD0iMjBweCIgaGVpZ2h0PSIyMHB4IiB2aWV3Qm94PSIwIDAgMjAgMjAiIHZlcnNpb249IjEuMSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB4bWxuczp4bGluaz0iaHR0cDovL3d3dy53My5vcmcvMTk5OS94bGluayI+CiAgICA8IS0tIEdlbmVyYXRvcjogU2tldGNoIDUyLjMgKDY3Mjk3KSAtIGh0dHA6Ly93d3cuYm9oZW1pYW5jb2RpbmcuY29tL3NrZXRjaCAtLT4KICAgIDx0aXRsZT5pY19idXllcl9zZWxsZXJfZGVmYXVsdDwvdGl0bGU+CiAgICA8ZGVzYz5DcmVhdGVkIHdpdGggU2tldGNoLjwvZGVzYz4KICAgIDxnIGlkPSJbVUktRGVzaWduLVNwZWNzXS1VbmlxdWUtU2NyZWVucyIgc3Ryb2tlPSJub25lIiBzdHJva2Utd2lkdGg9IjEiIGZpbGw9Im5vbmUiIGZpbGwtcnVsZT0iZXZlbm9kZCI+CiAgICAgICAgPGcgaWQ9Imljb25zIiB0cmFuc2Zvcm09InRyYW5zbGF0ZSgtNzIuMDAwMDAwLCAtNDkuMDAwMDAwKSIgZmlsbC1ydWxlPSJub256ZXJvIj4KICAgICAgICAgICAgPGcgaWQ9ImljX2J1eWVyX3NlbGxlcl9kZWZhdWx0IiB0cmFuc2Zvcm09InRyYW5zbGF0ZSg3Mi4wMDAwMDAsIDQ5LjAwMDAwMCkiPgogICAgICAgICAgICAgICAgPGVsbGlwc2UgaWQ9Ik92YWwiIGZpbGw9IiNDRkQ4REQiIGN4PSI5Ljk2NTUxNzI0IiBjeT0iMTAiIHJ4PSI5Ljk2NTUxNzI0IiByeT0iMTAiPjwvZWxsaXBzZT4KICAgICAgICAgICAgICAgIDxwYXRoIGQ9Ik0xMCwxMCBDOC44NTczNDE5LDEwIDcuOTMxMDM0NDgsOS4wNzM2OTI1OSA3LjkzMTAzNDQ4LDcuOTMxMDM0NDggQzcuOTMxMDM0NDgsNi43ODgzNzYzOCA4Ljg1NzM0MTksNS44NjIwNjg5NyAxMCw1Ljg2MjA2ODk3IEMxMS4xNDI2NTgxLDUuODYyMDY4OTcgMTIuMDY4OTY1NSw2Ljc4ODM3NjM4IDEyLjA2ODk2NTUsNy45MzEwMzQ0OCBDMTIuMDY4OTY1NSw5LjA3MzY5MjU5IDExLjE0MjY1ODEsMTAgMTAsMTAgWiBNNS44NjIwNjg5NywxMi40MTM3OTMxIEM2LjgyNjg5MDg5LDExLjU3MzcwNjIgOC4zMjE4MTUwNCwxMS4wMzQ0ODI4IDEwLDExLjAzNDQ4MjggQzExLjY3ODE4NSwxMS4wMzQ0ODI4IDEzLjE3MzEwOTEsMTEuNTczNzA2MiAxNC4xMzc5MzEsMTIuNDEzNzkzMSBMMTQuMTM3OTMxLDE0LjEzNzkzMSBMNS44NjIwNjg5NywxNC4xMzc5MzEgTDUuODYyMDY4OTcsMTIuNDEzNzkzMSBaIiBpZD0iQ29tYmluZWQtU2hhcGUiIGZpbGw9IiM2MjdDOEIiPjwvcGF0aD4KICAgICAgICAgICAgPC9nPgogICAgICAgIDwvZz4KICAgIDwvZz4KPC9zdmc+';
  const ICON_SYS_INFO = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTUiIGhlaWdodD0iMTQiIHZpZXdCb3g9IjAgMCAxNSAxNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KICA8cGF0aCBmaWxsLXJ1bGU9ImV2ZW5vZGQiIGNsaXAtcnVsZT0iZXZlbm9kZCIgZD0iTTE0LjU5NjMgN0MxNC41OTYzIDEwLjg2NiAxMS4zMzc1IDE0IDcuMzE3NjcgMTRDMy4yOTc4MSAxNCAwLjAzOTA2MjUgMTAuODY2IDAuMDM5MDYyNSA3QzAuMDM5MDYyNSAzLjEzNDAxIDMuMjk3ODEgMCA3LjMxNzY3IDBDMTEuMzM3NSAwIDE0LjU5NjMgMy4xMzQwMSAxNC41OTYzIDdaTTYuNTg5NzEgNi42NzgwNkM2LjU4OTcxIDYuMjc2MDcgNi45MTU1OCA1Ljk1MDIgNy4zMTc1NyA1Ljk1MDJDNy43MTk1NiA1Ljk1MDIgOC4wNDU0MyA2LjI3NjA3IDguMDQ1NDMgNi42NzgwNlY5Ljc3MjM0QzguMDQ1NDMgMTAuMTc0MyA3LjcxOTU2IDEwLjUwMDIgNy4zMTc1NyAxMC41MDAyQzYuOTE1NTggMTAuNTAwMiA2LjU4OTcxIDEwLjE3NDMgNi41ODk3MSA5Ljc3MjM0VjYuNjc4MDZaTTcuMjg5NzEgMy41QzYuOTAzMTEgMy41IDYuNTg5NzEgMy44MTM0IDYuNTg5NzEgNC4yQzYuNTg5NzEgNC41ODY2IDYuOTAzMTEgNC45IDcuMjg5NzEgNC45SDcuMzQ1NDNDNy43MzIwMyA0LjkgOC4wNDU0MyA0LjU4NjYgOC4wNDU0MyA0LjJDOC4wNDU0MyAzLjgxMzQgNy43MzIwMyAzLjUgNy4zNDU0MyAzLjVINy4yODk3MVoiIGZpbGw9IiMyNjczREQiLz4KICA8bWFzayBpZD0ibWFzazAiIG1hc2stdHlwZT0iYWxwaGEiIG1hc2tVbml0cz0idXNlclNwYWNlT25Vc2UiIHg9IjAiIHk9IjAiIHdpZHRoPSIxNSIgaGVpZ2h0PSIxNCI+CiAgICA8cGF0aCBmaWxsLXJ1bGU9ImV2ZW5vZGQiIGNsaXAtcnVsZT0iZXZlbm9kZCIgZD0iTTE0LjU5NjMgN0MxNC41OTYzIDEwLjg2NiAxMS4zMzc1IDE0IDcuMzE3NjcgMTRDMy4yOTc4MSAxNCAwLjAzOTA2MjUgMTAuODY2IDAuMDM5MDYyNSA3QzAuMDM5MDYyNSAzLjEzNDAxIDMuMjk3ODEgMCA3LjMxNzY3IDBDMTEuMzM3NSAwIDE0LjU5NjMgMy4xMzQwMSAxNC41OTYzIDdaTTYuNTg5NzEgNi42NzgwNkM2LjU4OTcxIDYuMjc2MDcgNi45MTU1OCA1Ljk1MDIgNy4zMTc1NyA1Ljk1MDJDNy43MTk1NiA1Ljk1MDIgOC4wNDU0MyA2LjI3NjA3IDguMDQ1NDMgNi42NzgwNlY5Ljc3MjM0QzguMDQ1NDMgMTAuMTc0MyA3LjcxOTU2IDEwLjUwMDIgNy4zMTc1NyAxMC41MDAyQzYuOTE1NTggMTAuNTAwMiA2LjU4OTcxIDEwLjE3NDMgNi41ODk3MSA5Ljc3MjM0VjYuNjc4MDZaTTcuMjg5NzEgMy41QzYuOTAzMTEgMy41IDYuNTg5NzEgMy44MTM0IDYuNTg5NzEgNC4yQzYuNTg5NzEgNC41ODY2IDYuOTAzMTEgNC45IDcuMjg5NzEgNC45SDcuMzQ1NDNDNy43MzIwMyA0LjkgOC4wNDU0MyA0LjU4NjYgOC4wNDU0MyA0LjJDOC4wNDU0MyAzLjgxMzQgNy43MzIwMyAzLjUgNy4zNDU0MyAzLjVINy4yODk3MVoiIGZpbGw9IndoaXRlIi8+CiAgPC9tYXNrPgogIDxnIG1hc2s9InVybCgjbWFzazApIj4KICA8L2c+Cjwvc3ZnPgo=';
  function msgsHtml(room) {
    const list = msgList(room);
    if (!list.length) return `<div class="nomore">No Discuss History</div>`;
    const isChat = room === 'chat';
    return list.map((m, i) => {
      const ctl = isEdit() ? `<span class="ectl">
        <button class="del" onclick="CQ.delMsg('${room}',${i})">✕</button>
        <button onclick="CQ.cutAfter('${room}',${i})" title="刪除這則之後的所有訊息">之後全刪</button></span>` : '';
      if (m.type === 'system') {
        // DMS：系統訊息下面可以有買家說明（note，粗體）和照片影片（已上傳證明）
        // DMS 順序：系統文字 → 照片影片 → 說明（242584941223071 對過：提案下面先附件、再「未收到貨」）
        return `<div class="sys pw"><img class="sysic" src="${ICON_SYS_INFO}" alt=""> System Info: ${esc(T(m.text))}${
          m.media && m.media.length ? `<div style="margin-top:6px">${mediaHtml(m.media, '')}</div>` : ''}${
          m.note ? `<div style="font-weight:600;margin-top:4px">${TX(m.note)}</div>` : ''}<div class="mt">${esc(m.time)} ${ctl}</div></div>`;
      }
      const masked = C.meta.mask.account && !isEdit();
      const who = m.from === 'buyer' ? 'Buyer' : 'Seller';
      const name = m.from === 'shopee' ? (dmsLang() === 'zh' ? '蝦皮專員' : 'Shopee Agent')      // DMS 中文畫面寫「蝦皮專員」
        : (masked ? '***' : esc(C.meta.accounts[m.from])) + (isChat ? ` (${who})` : `(${who})`);
      const avSrc = m.from === 'shopee' ? ICON_DRC_AGENT : !isChat ? ICON_DRC_PERSON : m.from === 'buyer' ? ICON_CHAT_BUYER : ICON_CHAT_SELLER;
      const av = `<img src="${avSrc}" alt="">`;
      let content;
      if (m.type === 'text') {
        content = isEdit() ? `<span class="pw" contenteditable data-set="msg" data-room="${room}" data-i="${i}">${esc(m.text)}</span>` : `<span class="pw">${TX(m.text)}</span>`;
      } else if (m.type === 'video' && m.url) {
        content = `<video controls preload="metadata" width="220" height="220" src="${esc(m.url)}" data-mk="${mediaKey(m)}"></video>
          <div class="hint">${U('影片無法播放時，請確認已連上公司內網／VPN', 'If the video does not play, check that you are on the company network / VPN')}</div>`;
      } else if (m.type === 'image' || m.type === 'video') {
        content = `<div class="${m.type === 'video' ? 'thumb video' : ''}" style="${m.type === 'video' ? 'width:120px;height:120px' : ''}" onclick="CQ.openLightbox('${src(m.src)}','${m.type}','','${mediaKey(m)}')"><img src="${src(m.src)}" alt=""></div>`;
      } else {
        content = `<span class="ph">[${esc(m.desc)}]</span>`;
      }
      const leak = isEdit() && m.from === 'shopee' ? '<span class="leak">可能洩漏結果</span>' : '';
      return `<div class="cmsg"><div class="av ${m.from}">${av}</div><div class="mb">
        <div class="mname">${name}${leak}</div><div class="bub">${content}</div>
        <div class="mt">${esc(m.time)} ${ctl}</div></div></div>`;
    }).join('') + (isChat ? `<div class="nomore">No more message</div>` : '');
  }
  function delMsg(room, i) { msgList(room).splice(i, 1); saveCase(); renderSide(); renderSettings(); }
  function cutAfter(room, i) {
    const list = msgList(room);
    const n = list.length - i - 1;
    if (!n) return alert('這已經是最後一則');
    if (!confirm(`刪除這則之後的 ${n} 則訊息？（用來設定判斷時點）`)) return;
    list.splice(i + 1); saveCase(); renderSide(); renderSettings();
  }

  // ===== Operation History =====
  let opFilter = 'all';
  const OP_FILTERS = [['all', 'All'], ['bs', 'Buyer/Seller'], ['agent', 'Human Agent'], ['ai', 'AI']];

  function opsHtml() {
    const chips = OP_FILTERS.map(f => `<button class="${opFilter === f[0] ? 'on' : ''}" onclick="CQ.filter('${f[0]}')">${f[0] === 'all' ? '' : ''}${f[1]}</button>`).join('');
    const list = C.ops.map((n, i) => ({ n, i }))
      .filter(x => isEdit() || !x.n.hidden)
      .filter(x => opFilter === 'all' || x.n.cat === opFilter);
    const rows = list.map(x => opHtml(x.n, x.i)).join('') || `<div class="nomore" style="padding:20px">No Data</div>`;
    return `<div class="opf">Node Filter ${chips}</div>
      <div class="pane"><div class="optable"><div class="oh"><div class="c1">Operation Time</div><div>Operation Details</div></div>${rows}</div></div>`;
  }

  const ICON_USER = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#999" stroke-width="1.3"><circle cx="8" cy="5.5" r="3"/><path d="M2.5 14.5c.6-3 2.8-4.5 5.5-4.5s4.9 1.5 5.5 4.5"/></svg>';
  const ICON_CLOCK = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#999" stroke-width="1.3"><circle cx="8" cy="8" r="6.3"/><path d="M8 4.5V8l2.5 1.5"/></svg>';

  // Operation History 身分標籤的色條：照 DMS（__federation_expose_OperationHistory）——買家黃、賣家藍、AI 客服紅、其他（System、各種專員）灰
  // 新匯入的有角色代碼 rc；舊案件沒有，就看英文角色名稱
  const OP_ROLE_COLOR = { 3: 'rgb(255, 187, 56)', 4: 'rgb(72, 136, 238)', 14: 'rgb(238, 77, 45)' };
  const OP_ROLE_BY_NAME = { Buyer: 3, Seller: 4, 'DMS AI': 14 };
  const opRoleColor = (n) => OP_ROLE_COLOR[n.rc !== undefined ? n.rc : OP_ROLE_BY_NAME[n.role]] || 'rgb(138, 148, 166)';
  function opHtml(n, i) {
    // 操作者是同事的 email 時，專員看到 ***
    let op = n.op;
    if (op && !isEdit() && (op.includes('@') || (C.meta.mask.account && n.cat === 'bs'))) op = '***';
    const timeParts = String(n.time).split(' ');
    const time = esc(timeParts[0]) + (timeParts.length > 1 ? '<br>' + esc(timeParts.slice(1).join(' ')) : '');
    const kv = n.kv.map((k, ki) => {
      let v = (k[2] === 'id' && isMasked('id') && !isEdit()) ? '***' : k[1];
      if (isEdit()) v = `<span contenteditable data-set="opkv" data-i="${i}" data-k="${ki}">${esc(k[1])}</span>`;
      else v = TX(v);
      return `<div class="ckv">${k[0] ? esc(TL(k[0])) + ': ' : ''}${v}</div>`;     // 欄位名稱只翻 DMS 會翻的（i18n.opzh）
    }).join('');
    const media = n.media ? `<div style="margin-bottom:12px">${mediaHtml(n.media, isEdit() ? `CQ.delOpMedia(${i},IDX)` : '')}</div>` : '';
    const ctl = isEdit() ? `<div class="ectl" style="margin:0">
        <button onclick="CQ.toggleOp(${i})">${n.hidden ? '顯示給專員' : '隱藏'}</button>
        <button class="del" onclick="CQ.delOp(${i})">✕</button>
        <button onclick="CQ.cutOp(${i})" title="刪除這個節點之後的所有節點">之後全刪</button></div>
        ${n.leak ? '<span class="leak">可能洩漏結果</span>' : ''}${n.hidden ? '<span class="leak" style="background:#f1f5f9;color:#64748b;border-color:#cbd5e1">專員看不到</span>' : ''}` : '';
    return `<div class="op ${n.hidden ? 'hid' : ''}">
      <div class="ol"><span class="role ${n.cat}" style="border-left-color:${opRoleColor(n)}">${esc(n.role)}</span>
        ${op ? `<div class="ln">${ICON_USER}<span>${esc(op)}</span></div>` : ''}
        <div class="ln">${ICON_CLOCK}<span>${time}</span></div></div>
      <div class="or"><div class="act">${esc(T(n.action))}</div>${kv}${media}${ctl}</div></div>`;
  }
  function toggleOp(i) { C.ops[i].hidden = !C.ops[i].hidden; saveCase(); renderSide(); renderSettings(); }
  function delOp(i) { C.ops.splice(i, 1); saveCase(); renderSide(); renderSettings(); }
  function cutOp(i) {
    const n = C.ops.length - i - 1;
    if (!n) return alert('這已經是最後一個節點');
    if (!confirm(`刪除這個節點之後的 ${n} 個節點？`)) return;
    C.ops.splice(i + 1); saveCase(); renderSide(); renderSettings();
  }
  function delOpMedia(i, k) { C.ops[i].media.splice(k, 1); saveCase(); renderSide(); }

  // ===== 考題分頁：專員作答 =====
  function qNumbers() {
    // 只有作答類模組（單選、簡答）有題號
    const map = {}; let n = 0;
    C.modules.forEach(md => { if (isQ(md)) map[md.id] = ++n; });
    return map;
  }

  function quizAgentHtml() {
    const qn = qNumbers();
    let html = EX ? exResultHtml() : A.submitted ? resultHtml() : '';
    C.modules.forEach(md => {
      if (md.type === 'note') {
        html += `<div class="mod note"><div class="mh">${U('情境說明', 'Scenario')}</div><div style="white-space:pre-wrap">${TE(md.text)}</div></div>`;
      }
      if (md.type === 'image' && md.images.length) {
        html += `<div class="mod"><div class="mh">${U('補充資訊', 'Additional information')}</div>${mediaHtml(md.images.map(s => ({ type: 'image', src: imgSrc(s), k: s })), '')}
          <div class="hint">${U('點圖片可放大', 'Click an image to enlarge')}</div></div>`;
      }
      if (md.type === 'mc') html += mcAgentHtml(md, qn[md.id]);
      if (md.type === 'sop') html += sopAgentHtml(md, C.modules.indexOf(md), qn[md.id]);
      if (md.type === 'short') {
        const bind = md.bindTo && qn[md.bindTo] ? `<div class="hint">${U(`說明第 ${qn[md.bindTo]} 題的選擇`, `Explain your answer to question ${qn[md.bindTo]}`)}</div>` : '';
        html += `<div class="mod qmod"><div class="mh">${qn[md.id]}. ${TE(md.q)}<span class="sp"></span><span class="pts">${ptsLabel(md)}</span></div>${bind}
          <textarea ${A.submitted ? 'disabled' : ''} oninput="CQ.shortAns('${md.id}',this.value)" onpaste="CQ.paste('${md.id}',event)">${esc(A.short[md.id] || '')}</textarea>
          ${A.submitted && reveal() && md.standard ? `<div class="explain"><b>${U('參考答案：', 'Reference answer: ')}</b>${TX(md.standard)}</div>` : ''}${exShortScore(md)}</div>`;
      }
    });
    return html || `<div class="hint">${U('講師還沒有設定考題', 'No questions have been set yet')}</div>`;
  }

  function mcAgentHtml(md, no) {
    const picks = mcPicks(A.mc[md.id]), key = mcKey(md), multi = mcMulti(md);
    const showAns = A.submitted && reveal();
    const opts = md.options.map((o, i) => {
      let cls = 'copt' + (multi ? ' multi' : '');
      if (picks.includes(i)) cls += ' sel';
      if (showAns && key.includes(i)) cls += ' right';
      if (showAns && picks.includes(i) && !key.includes(i)) cls += ' wrong';
      const en = dmsLang() === 'en' && (md.optionsEn || [])[i];        // 套用選項範本的選項：用範本裡人寫的英文
      return `<div class="${cls}" onclick="CQ.pickMc('${md.id}',${i},${multi ? 1 : 0})"><span class="l">${LETTERS[i]}</span><span>${en ? esc(en) : TE(o)}</span></div>`;
    }).join('');
    return `<div class="mod qmod"><div class="mh">${no}. ${TE(md.q)}${multi ? `<span class="mc-multi">${U('複選', 'Multiple answers')}</span>` : ''}<span class="sp"></span><span class="pts">${ptsLabel(md)}</span></div>
      ${multi && !A.submitted ? `<div class="hint">${U('選出所有正確的選項，全部選對才給分', 'Select all correct options; points are given only when all are correct')}</div>` : ''}${opts}
      ${showAns && md.explain ? `<div class="explain"><b>${U('詳解：', 'Explanation: ')}</b>${TX(md.explain)}</div>` : ''}</div>`;
  }

  function pickMc(id, i, multi) {
    if (A.submitted) return;
    if (multi) {
      const v = mcPicks(A.mc[id]);
      const next = v.includes(i) ? v.filter((x) => x !== i) : v.concat(i).sort((a, b) => a - b);
      if (next.length) A.mc[id] = next; else delete A.mc[id];
    } else A.mc[id] = i;
    exEdit(id); saveAnswer(); renderSide();
  }
  // 專員預覽：練習用顯示正解；測驗：依測驗設定（隨時檢討、公布解答、公布成績）
  const reveal = () => (EX ? EX.reveal : C.meta.usage === 'practice');

  function submitAnswer(auto) {
    if (A.submitted) return;
    if (!auto && !confirm('確定交卷？交卷後不能再修改。')) return;
    A.submitted = true; A.submitAt = Date.now(); saveAnswer();
    sideTab = 'quiz'; renderAll();
  }
  function retry() {
    if (!confirm('清除作答重新開始？')) return;
    A = newAnswer(); saveAnswer(); renderAll();
  }

  function resultHtml() {
    let got = 0, mcTotal = 0, shortTotal = 0, sopTotal = 0, sopGot = 0, sopWait = 0;
    const notes = [];
    C.modules.forEach(md => {
      if (md.type === 'mc') { mcTotal += md.points; if (mcOk(md, A.mc[md.id])) got += md.points; }
      if (md.type === 'sop' && window.RRQP_DB && window.RRQP_DB.sopGrade) {
        sopTotal += md.points;
        const g = window.RRQP_DB.sopGrade(sopPreviewKey(md), agSt(md));
        if (g.auto === null) sopWait += md.points; else sopGot += g.auto * md.points;
      }
      if (md.type === 'short') {
        shortTotal += md.points;
        const bound = C.modules.find(x => x.id === md.bindTo);
        if (bound && !mcOk(bound, A.mc[bound.id])) notes.push('有簡答題綁定的選擇題答錯，依預設規則該簡答 0 分（講師可調整）');
      }
    });
    const secs = Math.round(A.leaveMs / 1000);
    const isPractice = C.meta.usage === 'practice';
    return `<div class="cres">
      ${mcTotal ? `<div>選擇題答對 <b class="big">${got}%</b> / ${mcTotal}%（佔本案件）</div>` : ''}
      ${sopTotal ? `<div>SOP 路徑自動判定 <b class="big">${Math.round(sopGot * 100) / 100}%</b> / ${sopTotal}%（佔本案件）${sopWait ? `，另有 ${sopWait}% 要講師給分` : ''}</div>` : ''}
      ${shortTotal ? `<div>簡答題 ${shortTotal}%：待 AI 預評分，再由講師確認</div>` : ''}
      ${notes.map(n => `<div class="hint">${esc(n)}</div>`).join('')}
      <div class="hint">作答期間離開考試頁面 ${A.leaves} 次，共 ${secs} 秒（講師看得到）</div>
      <div class="hint">${isPractice ? '練習模式：下方顯示正解與詳解，成績不計入。' : '考試模式：成績公布前只顯示自己的分數。'}</div></div>`;
  }

  // ===== 考題分頁：講師編輯 =====
  const TYPE_NAME = { note: '情境說明', image: '補充資訊', mc: '選擇題', short: '簡答題', sop: 'SOP 路徑' };

  const pctInput = (md, i) => `<div class="lbl">配分（佔本案件）</div><div class="erow" style="align-items:center"><input type="number" min="0" max="100" step="1" value="${md.points}" style="width:90px" onchange="CQ.setMod(${i},'points',+this.value)"> %</div>`;

  function quizEditHtml() {
    const qn = qNumbers();
    const mcList = C.modules.filter(m => m.type === 'mc');
    let html = '<div class="hint" style="margin-bottom:10px">模組由上往下顯示給專員。可以插入多個、調整順序。</div>';
    if (C.modules.some(isQ)) {
      const sum = pctSum(C.modules), ok = Math.abs(sum - 100) < 0.01;
      html += `<div class="hint" style="margin-bottom:10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <span>作答題配分合計 <b style="color:${ok ? 'var(--ok,#16a34a)' : 'var(--bad,#dc2626)'}">${sum}%</b>${ok ? '' : '（要剛好 100% 才能上架）'}</span>
        <button class="mbtn" onclick="CQ.evenPct()">平均分配</button>
        <span>配分是這題佔本案件的比例；案件在整份試卷佔幾分，組卷發佈時再設定。</span></div>`;
    }
    C.modules.forEach((md, i) => {
      const head = `<div class="mh">${qn[md.id] ? qn[md.id] + '. ' : ''}${TYPE_NAME[md.type]}${md.type === 'mc' && mcMulti(md) ? '<span class="mc-multi">複選</span>' : ''}<span class="sp"></span>
        <button class="mbtn" onclick="CQ.moveMod(${i},-1)">↑</button><button class="mbtn" onclick="CQ.moveMod(${i},1)">↓</button>
        <button class="mbtn del" onclick="CQ.delMod(${i})">✕</button></div>`;
      let body = '';
      if (md.type === 'note') {
        body = `<textarea onchange="CQ.setMod(${i},'text',this.value)">${esc(md.text)}</textarea>`;
      }
      if (md.type === 'image') {
        body = `${mediaHtml(md.images.map(s => ({ type: 'image', src: imgSrc(s), k: s })), `CQ.delImg(${i},IDX)`)}
          <div style="display:flex;gap:8px;margin-top:8px;align-items:stretch">
            <button class="mbtn" style="padding:8px 14px;font-size:13px;border-color:var(--brand);color:var(--brand)" onclick="CQ.pickImg(${i})">上傳補充資訊圖片</button>
            <div class="drop" tabindex="0" style="flex:1;padding:8px" onclick="this.focus()" onpaste="CQ.pasteImg(event,${i})">或點這裡後按 Ctrl+V 貼上截圖</div></div>
          <div class="hint">圖片原檔拆段存進 Firestore（太大才壓縮）。上傳前請確認圖片裡的帳號與浮水印。</div>`;
      }
      if (md.type === 'mc') {
        if (OPTSETS === null) { OPTSETS = 'loading'; X.api('c_optionSets').then((r) => { OPTSETS = r.sets || []; renderSide(); }).catch(() => { OPTSETS = []; }); }
        const key = mcKey(md), sets = Array.isArray(OPTSETS) ? OPTSETS : [];
        body = `<div class="lbl">題目</div><input type="text" value="${esc(md.q)}" onchange="CQ.setMod(${i},'q',this.value)">
          <div class="lbl" style="display:flex;align-items:center;gap:8px">選項（勾選正解；勾兩個以上就是複選題，要全部選對才給分）<span class="sp" style="flex:1"></span>
            ${sets.length ? `<select style="width:auto" onchange="CQ.applySet(${i},this.value);this.value=''"><option value="">套用選項範本…</option>${sets.map((x) => `<option value="${esc(x.setId)}">${esc((x.name || {}).zh || x.setId)}（${(x.options || []).length} 個）</option>`).join('')}</select>` : ''}</div>
          ${md.options.map((o, oi) => `<div class="erow"><input type="checkbox" ${key.includes(oi) ? 'checked' : ''} onchange="CQ.togAns(${i},${oi},this.checked)" title="正解">
            <b style="width:14px">${LETTERS[oi]}</b><input type="text" value="${esc(o)}" onchange="CQ.setOpt(${i},${oi},this.value)">
            <button class="mbtn del" onclick="CQ.delOpt(${i},${oi})">✕</button></div>`).join('')}
          ${md.options.length < 10 ? `<button class="mbtn" onclick="CQ.addOpt(${i})">＋ 新增選項</button>` : ''}
          ${(md.optionsEn || []).some(Boolean) ? `<div class="hint">選項套用自範本${(() => { const x = (Array.isArray(OPTSETS) ? OPTSETS : []).find((y) => y.setId === md.optSet); return x ? `「${esc((x.name || {}).zh || x.setId)}」` : ''; })()}：BPO 專員看到的英文直接用範本的；改了文字的選項會改成翻譯。</div>` : ''}
          ${pctInput(md, i)}
          <div class="lbl">詳解（練習模式交卷後顯示）</div><textarea onchange="CQ.setMod(${i},'explain',this.value)">${esc(md.explain || '')}</textarea>`;
      }
      if (md.type === 'short') {
        body = `<div class="lbl">題目</div><input type="text" value="${esc(md.q)}" onchange="CQ.setMod(${i},'q',this.value)">
          <div class="lbl">綁定選擇題（選錯時這題預設 0 分）</div>
          <select onchange="CQ.setMod(${i},'bindTo',this.value)"><option value="">不綁定</option>
            ${mcList.map(m => `<option value="${m.id}" ${md.bindTo === m.id ? 'selected' : ''}>第 ${qn[m.id]} 題：${esc(m.q)}</option>`).join('')}</select>
          <div class="lbl">標準答案（AI 預評分依據）</div><textarea onchange="CQ.setMod(${i},'standard',this.value)">${esc(md.standard || '')}</textarea>
          ${pctInput(md, i)}`;
      }
      if (md.type === 'sop') body = sopEditHtml(md, i) + pctInput(md, i);
      html += `<div class="mod ${md.type === 'note' ? 'note' : isQ(md) ? 'qmod' : ''}">${head}${body}</div>`;
    });
    html += `<div class="addbar"><span class="hint" style="width:100%;margin:0">＋ 插入模組</span>
      ${Object.keys(TYPE_NAME).map(t => `<button onclick="CQ.addMod('${t}')">${TYPE_NAME[t]}</button>`).join('')}</div>`;
    return html;
  }

  // ───────── 配分：題目佔本案件的百分比（加起來 100）；案件在試卷佔幾分由組卷時設定 ─────────
  const isQ = (m) => m.type === 'mc' || m.type === 'short' || m.type === 'sop';
  const pctSum = (mods) => Math.round(mods.filter(isQ).reduce((t, m) => t + (Number(m.points) || 0), 0) * 100) / 100;
  /** 加總不是 100 就照比例換算成整數百分比（最大餘數法，總和剛好 100）；全部 0 就平均分配 */
  function pctNormalize(mods, force) {
    const qs = mods.filter(isQ);
    if (!qs.length || (!force && Math.abs(pctSum(mods) - 100) < 0.01)) return false;
    const tot = qs.reduce((t, m) => t + Math.max(0, Number(m.points) || 0), 0);
    const raw = qs.map((m) => (force || !tot ? 100 / qs.length : Math.max(0, Number(m.points) || 0) / tot * 100));
    const fl = raw.map(Math.floor); let left = 100 - fl.reduce((t, x) => t + x, 0);
    raw.map((x, i) => [x - fl[i], i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left > 0) { fl[i]++; left--; } });
    qs.forEach((m, i) => { m.points = fl[i]; });
    return true;
  }
  /** 題目分數的顯示：測驗中是實際分數（發佈時已換算），其他地方是百分比 */
  const ptsLabel = (md) => (EX ? U(`${md.points} 分`, `${md.points} pts`) : `${md.points}%`);
  function evenPct() { pctNormalize(C.modules, true); saveCase(); renderSide(); }

  function newId() { return 'm' + Date.now().toString(36); }
  function addMod(type) {
    const md = { id: newId(), type };
    if (type === 'note') md.text = '';
    if (type === 'image') md.images = [];
    if (type === 'mc') Object.assign(md, { q: '請選擇正確的', options: ['', '', '', ''], answer: 0, points: Math.max(0, 100 - pctSum(C.modules)), explain: '' });
    if (type === 'short') Object.assign(md, { q: '請說明你選擇這個答案的理由', standard: '', bindTo: '', points: Math.max(0, 100 - pctSum(C.modules)) });
    if (type === 'sop') Object.assign(md, { taskbot: '', sopName: '', flowId: '', version: '', start: '', answer: [], snap: {}, acts: [], cur: null, hint: C.meta.usage === 'practice', points: Math.max(0, 100 - pctSum(C.modules)) });
    C.modules.push(md); saveCase(); renderSide();
    const pane = document.getElementById('cqQuizPane'); pane.scrollTop = pane.scrollHeight;
  }
  function setMod(i, k, v) { C.modules[i][k] = v; saveCase(); if (k === 'answer' || k === 'bindTo' || k === 'q' || k === 'points') renderSide(); }
  function moveMod(i, d) {
    const j = i + d;
    if (j < 0 || j >= C.modules.length) return;
    [C.modules[i], C.modules[j]] = [C.modules[j], C.modules[i]];
    saveCase(); renderSide();
  }
  function delMod(i) {
    if (!confirm(`刪除「${TYPE_NAME[C.modules[i].type]}」模組？`)) return;
    const id = C.modules[i].id;
    C.modules.splice(i, 1);
    C.modules.forEach(m => { if (m.bindTo === id) m.bindTo = ''; });
    saveCase(); renderSide();
  }
  // 選項改了文字，範本的英文就不算數了（改走翻譯）
  function setOpt(i, oi, v) { const md = C.modules[i]; md.options[oi] = v; if (md.optionsEn) md.optionsEn[oi] = ''; saveCase(); renderSide(); }
  function addOpt(i) { const md = C.modules[i]; md.options.push(''); if (md.optionsEn) md.optionsEn.push(''); saveCase(); renderSide(); }
  function delOpt(i, oi) {
    const md = C.modules[i];
    if (md.options.length <= 2) return alert('至少要 2 個選項');
    md.options.splice(oi, 1);
    if (md.optionsEn) md.optionsEn.splice(oi, 1);
    setKey(md, mcKey(md).filter((x) => x !== oi).map((x) => (x > oi ? x - 1 : x)));
    saveCase(); renderSide();
  }
  // 正解：一個存數字（單選），兩個以上存清單（複選）
  function setKey(md, k) { md.answer = k.length > 1 ? k : k.length ? k[0] : null; }
  function togAns(i, oi, on) {
    const md = C.modules[i], k = mcKey(md).filter((x) => x !== oi);
    setKey(md, on ? k.concat(oi).sort((a, b) => a - b) : k);
    saveCase(); renderSide();
  }
  function applySet(i, setId) {
    const md = C.modules[i], set = (Array.isArray(OPTSETS) ? OPTSETS : []).find((x) => x.setId === setId);
    if (!set) return;
    if (md.options.some((o) => String(o || '').trim()) && !confirm(`用「${(set.name || {}).zh || setId}」取代目前的選項？正解要重新勾選。`)) return;
    md.options = set.options.map((o) => (o.text || {}).zh || '');
    md.optionsEn = set.options.map((o) => (o.text || {}).en || '');
    md.optSet = setId; setKey(md, []);
    saveCase(); renderSide();
  }
  function delImg(i, k) { C.modules[i].images.splice(k, 1); saveCase(); renderSide(); }

  // 補充資訊圖片：貼上或選檔，縮到最長邊 2400px 後存起來
  function pasteImg(ev, i) {
    const item = [...ev.clipboardData.items].find(x => x.type.startsWith('image/'));
    if (!item) return alert('剪貼簿裡沒有圖片');
    ev.preventDefault();
    addImageFile(item.getAsFile(), i);
  }
  function pickImg(i) {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true;
    inp.onchange = () => { [...inp.files].forEach(f => addImageFile(f, i)); };
    inp.click();
  }
  // ═════════════════════════════════════════════════════════════
  // SOP 路徑題組（2026-11-20 第 1a 步：講師選 SOP、選起點、在仿 DMS 的 SOP 面板走一次＝標準答案）
  //   md = { type:'sop', taskbot, sopName, flowId, version, start, answer:[{n:節點, pick:選項或分支序號}], snap:{節點快照}, points }
  //   answer 存路線（發佈給專員時會被拿掉）；snap 存路線上每個節點出題當時的內容（SOP 改版時比對用）
  //   SOP 來源：排程 rrqp_sop.py 每天從 DMS SOP Tool 抓上線版 → sopFlows/{taskbot}
  // ═════════════════════════════════════════════════════════════
  const SOPS = {};                 // taskbot → 整份 SOP（講師畫面快取）
  let SOP_LIST = null;             // 上線中的 SOP 清單
  const SOP_LOADING = {};
  const SOP_PICKSTART = {};        // 模組 id → 正在選起點
  // DMS Pending Reason 視窗的 Pending by（value 與 SOP pending 節點的 pending_by 相同；dev/dms-ui/pending_by.json）
  const PENDING_BY = { 4: 'Buyer for Evidence', 5: 'Seller for Evidence', 6: 'BD Team', 7: 'CB Team', 8: 'Logistic Investigation', 9: 'Agent', 10: 'Warehouse',
    12: 'Buyer and Seller for Evidence', 13: 'Buyer for Return Shipping Proof', 14: 'Item Return to Seller/Warehouse', 15: 'Other Shopee Teams', 16: 'Escalate to Supervisor',
    17: 'POD Requested to 3PL', 18: 'Awaiting POD Recognition', 21: 'Pending legal/police investigation',
    29: 'Reassignment – Dispute cancellation with new return request, reassign to Dispute', 30: 'Reassignment – Keyword/aging case, escalate to L2',
    31: '(TW use)Reassignment – Routed to Flow C', 32: 'Reassignment – Special mall seller', 33: '(TW use)Reassignment – Routed to Flow A',
    34: '(TW use)Reassignment – Routed to Flow B', 35: '(TW Pause use) A', 36: '(TW Pause use) B', 37: '(TW Pause use) C', 46: 'Pending for Seller Return' };
  const SOP_TYPE = { manual: '專員選', system: '系統判讀', pending: 'Pending', note: 'Note and Reminder', message: '訊息', validate: 'Validate Proof', judge: '判決', end: '結束' };

  function sopLoadList() {
    if (SOP_LIST || SOP_LOADING.list) return;
    SOP_LOADING.list = true;
    X.api('c_sopList').then((r) => { SOP_LIST = r.items || []; renderSide(); sopLoadAll(); })
      .catch((e) => { SOP_LIST = []; X.toast('讀取 SOP 清單失敗：' + e.message, 6000); })
      .finally(() => { SOP_LOADING.list = false; });
  }
  /** 搜尋起點要用：所有上線中的 SOP 都載入（每個講師一次，約 47 份） */
  function sopLoadAll() {
    if (!SOP_LIST) { sopLoadList(); return; }
    if (SOP_LOADING.all) return;
    const todo = SOP_LIST.map((x) => x.taskbot).filter((tb) => !SOPS[tb]);
    if (!todo.length) return;
    SOP_LOADING.all = true;
    let k = 0;
    const next = () => {
      if (k >= todo.length) return Promise.resolve();
      const tb = todo[k++];
      return X.api('c_sopGet', { taskbot: tb }).then((r) => { SOPS[tb] = r.sop; }).catch(() => {}).then(next);
    };
    Promise.all([next(), next(), next(), next()]).then(() => {
      SOP_LOADING.all = false;
      // 載完重畫：保留講師已經輸入的關鍵字
      const q = document.querySelector('[id^="sopq-"]'), val = q ? q.value : '', id = q ? q.id : '';
      renderSide();
      const q2 = id && document.getElementById(id);
      if (q2 && val) { q2.value = val; q2.focus(); const i = C.modules.findIndex((m) => 'sopq-' + m.id === id); if (i >= 0) sopSearch(i, val); }
    });
  }
  function sopLoad(tb) {
    if (!tb || SOPS[tb] || SOP_LOADING[tb]) return;
    SOP_LOADING[tb] = true;
    X.api('c_sopGet', { taskbot: tb }).then((r) => { SOPS[tb] = r.sop; renderSide(); })
      .catch((e) => X.toast(`讀取 ${tb} 失敗：` + e.message, 6000))
      .finally(() => { SOP_LOADING[tb] = false; });
  }

  // 下一個節點：manual 選項、system 分支、其他節點只有一條路（pick 0）
  function sopNext(node, pick) {
    if (!node) return null;
    if (node.type === 'manual') return ((node.options || [])[pick] || {}).to || null;
    if (node.type === 'system') return ((node.branches || [])[pick] || {}).to || null;
    return node.to || null;
  }
  // 2026-11-20：路線可以跨 SOP（例如 SOP1 跳到 SOP60_Node380）：節點編號開頭就是它屬於哪個 SOP
  const sopTbOf = (nid) => (String(nid || '').match(/^(SOP\d+)_/) || [])[1] || '';
  const sopNode = (nid) => { const sp = SOPS[sopTbOf(nid)]; return sp ? sp.nodes[nid] : null; };
  /** 照標準答案從起點走一次：回傳每一步（含節點），以及目前停在哪個節點、是不是終點 */
  function sopWalk(md) {
    const steps = [];
    let nid = md.start;
    for (const st of md.answer || []) {
      if (md.stop && nid === md.stop) break;           // 講師設定的結束點（分段考）
      if (st.n !== nid) break;                         // 路線和 SOP 對不上（改版）→ 停在這
      const node = sopNode(nid);
      if (!node) break;
      steps.push({ n: nid, pick: st.pick, node, clicked: st.clicked || [], rec: st.rec || 0 });
      nid = sopNext(node, st.pick);
    }
    const node = nid ? sopNode(nid) : null;
    const tb = sopTbOf(nid);
    // 跳到還沒載入的 SOP：先載入（loading）；不在上線清單裡的 SOP 才當成終點（jump）
    const loading = nid && !node && tb && !SOPS[tb] && (!SOP_LIST || SOP_LIST.some((x) => x.taskbot === tb));
    if (loading) sopLoad(tb);
    const end = !nid ? 'dead' : md.stop && nid === md.stop ? 'stop' : loading ? 'loading' : !node && tb && !SOPS[tb] ? 'jump' : !node ? 'missing' : node.type === 'judge' || node.type === 'end' ? 'final' : '';
    return { steps, cur: nid, node, end, broken: steps.length < (md.answer || []).length };
  }
  const sopPickLabel = (node, pick) => ST(node.type === 'manual' ? ((node.options || [])[pick] || {}).label || '' : node.type === 'system' ? ((node.branches || [])[pick] || {}).label || '' : '');
  const sopNodeTitle = (node) => ST(node.type === 'manual' ? (node.question || node.name) : node.name);
  /** 動作節點（Pending、Note and Reminder）要做的事：給講師確認，1b 再做成底部操作列 */
  function sopActionHtml(node) {
    let h = '';
    (node.pending || []).forEach((p) => {
      h += `<div class="sop-act">Pending Reason：<b>${esc(PENDING_BY[p.pending_by] || (p.pending_by ? 'Pending by ' + p.pending_by : '（沒有指定 Pending by）'))}</b>${p.remark ? `<div class="sop-rmk">Remark 範本：${esc(p.remark)}</div>` : ''}</div>`;
    });
    (node.note || []).forEach((p) => {
      const rm = remindOf(p.remind_me);
      h += `<div class="sop-act">Note and Reminder：更新真實退貨原因${p.real_return_reason ? '（' + esc(p.real_return_reason) + '）' : ''}${rm === null ? '' : `｜Remind me：${rm ? 'Yes' : 'No'}`}${String(p.remark || '').trim() ? `<div class="sop-rmk">Remark 範本：${esc(p.remark)}</div>` : ''}</div>`;
    });
    if (node.codes && node.codes.length) h += `<div class="sop-act">代碼：${node.codes.map(esc).join('、')}</div>`;
    return h;
  }

  function sopEditHtml(md, i) {
    // 2026-11-20（Chris）：不用先選 SOP，講師直接搜尋節點（所有上線 SOP）指定起點
    if (!md.start || !md.taskbot || SOP_PICKSTART[md.id]) {
      sopLoadAll();
      const n = Object.keys(SOPS).length, tot = SOP_LIST ? SOP_LIST.length : 0;
      return `<div class="lbl">指定起點（搜尋所有上線中的 SOP）</div>
        <div class="erow"><div class="sop-sbox"><input type="search" id="sopq-${md.id}" placeholder="例如：是否已逾鑑賞期、215、SOP1_F140_Node215" oninput="CQ.sopSearch(${i},this.value)">
          <div class="sop-res" id="sopres-${md.id}"></div></div>
          ${md.start ? `<button class="mbtn" onclick="CQ.sopCancelStart(${i})">取消</button>` : ''}</div>
        <div class="hint">輸入節點名稱、問題，或節點編號（215、Node215、SOP1_F140_Node215）；輸入 SOP1 可以從那個 SOP 的開頭開始。${
          !SOP_LIST ? '　載入 SOP 清單…' : n < tot ? `　已載入 ${n} / ${tot} 個 SOP…` : ''}</div>`;
    }
    const sop = SOPS[md.taskbot];
    if (!sop) { sopLoad(md.taskbot); return `<div class="hint">載入 ${esc(md.taskbot)}…</div>`; }
    let h = '';
    // 用到的每個 SOP 都比對版本（路線可能跨 SOP）
    const flows = md.flows || (md.flowId ? { [md.taskbot]: md.flowId } : {});
    const diff = Object.entries(flows).filter(([tb, f]) => SOPS[tb] && SOPS[tb].flowId !== f);
    if (diff.length) h += `<div class="sop-warn">${diff.map(([tb, f]) => `這題用的是 ${esc(f)}，目前上線版是 ${esc(SOPS[tb].flowId)}`).join('；')}。路線若和新版不同會在下面標出；改版自動比對之後會做。</div>`;
    const w = sopWalk(md, sop);
    const st = sop.nodes[md.start];
    h += `<div class="sop-start"><span>起點：<b>${esc(st ? (st.name || sopNodeTitle(st)) : md.start)}</b>
      <span class="sop-id">${esc(md.taskbot)}｜${esc(sop.taskbotName || md.sopName)}｜${esc(sopPointId(sop, md.start))}</span></span>
      <button class="mbtn" onclick="CQ.sopPickStart(${i})">更換起點</button></div>`;
    if (w.broken) h += `<div class="sop-warn">標準答案第 ${w.steps.length + 1} 步之後和目前的 SOP 對不上（節點被改或刪除），請從最上面的節點重新選。</div>`;
    if (w.end === 'loading') h += `<div class="hint">載入 ${esc(sopTbOf(w.cur))}…</div>`;
    else if (w.end) h += `<div class="sop-okbar">標準答案設定完成（共 ${w.steps.length} 步）${w.end === 'jump' ? `：跳到的 ${esc(sopTbOf(w.cur))} 不在上線中的 SOP，當成終點` : w.end === 'dead' ? '：這個選項在 SOP 裡沒有下一步，當成終點' : w.end === 'missing' ? '：找不到下一個節點，當成終點' : w.end === 'stop' ? '：這一段在這裡結束' : ''}</div>`;
    h += `<label class="sop-hintset"><input type="checkbox" ${md.hint ? 'checked' : ''} onchange="CQ.setMod(${i},'hint',this.checked)">
      專員點 SOP 動作按鈕後，底部對應的功能亮起提示（練習用建議開、考試用建議關）</label>`;
    const outside = (md.acts || []).filter((a) => !a.link);
    h += `<div class="hint">點了 SOP 卡片上的按鈕之後，在底部操作列做的操作（可以好幾個）都記在那個節點，示範的順序就是正解。</div>`;
    if (outside.length) h += `<div class="sop-outside"><b>SOP 以外的操作</b>（沒有先點 SOP 卡片上的按鈕，或是點完之後又選了其他節點）${outside.map((a) => actLine(md, a, i)).join('')}</div>`;
    return h + sopCardsHtml(md, i, sop, w);
  }

  // ───────── 仿 DMS 右側 SOP 面板（__federation_expose_Sop：sop-item 卡片、最新的在最上面、舊的收合成一列） ─────────
  const SOP_ICON_SYS = '<svg class="sopic" width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1.456 7.188H.5V8.37c0 .553.428 1.004.956 1.004h4.066v.813H4.086a.49.49 0 0 0-.478.5c0 .276.214.5.478.5h3.826a.49.49 0 0 0 .479-.5.49.49 0 0 0-.479-.5H6.479v-.813h4.065c.527 0 .956-.45.956-1.005V7.188H1.457ZM10.544.5H1.456C.929.5.5.951.5 1.505v4.683h11V1.505C11.5.951 11.072.5 10.544.5Z" fill="#2673DD"/></svg>';
  const SOP_ICON_AGENT = '<svg class="sopic" width="16" height="16" viewBox="0 0 16 16"><path fill="#5c7" d="M7.78 1.006c-1.738.102-3.17 1.52-3.287 3.257C4.36 6.31 5.969 8.018 7.985 8.018a3.507 3.507 0 0 0 3.508-3.506c.014-2.016-1.68-3.623-3.712-3.506zM8 9.157c-2.338 0-7 1.169-7 3.506v1.753c0 .321.263.584.585.584h12.83a.586.586 0 0 0 .585-.584v-1.768c0-2.322-4.662-3.491-7-3.491z"/></svg>';   // DMS 原圖（Chris 2026-11-20）
  const SOP_ICON_TODO = '<svg class="sopic" width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="6" fill="none" stroke="#ee4d2d" stroke-width="1.4"/><path d="M7 3.8V7l2.2 1.4" fill="none" stroke="#ee4d2d" stroke-width="1.4" stroke-linecap="round"/></svg>';
  const SOP_ICON_TO = '<svg class="sopic" width="16" height="16" viewBox="0 0 16 16" fill="none"><path fill-rule="evenodd" clip-rule="evenodd" d="M9.424 13.163a.5.5 0 0 1-.707-.707l4.458-4.458H1.618a.5.5 0 1 1 0-1h11.557L8.716 2.54a.5.5 0 0 1 .708-.707l5.311 5.312a.5.5 0 0 1 .058.638l-.058.069-5.311 5.312Z" fill="#758196"/></svg>';   // DMS 原圖（Chris 2026-11-20）
  const SOP_ICON_UP = '<svg class="sopic" width="16" height="16" viewBox="0 0 32 32"><path fill="#0a1f44" transform="rotate(-90 16 16)" d="M9 5c0-.6.4-1 1-1 .2 0 .5.1.7.3l12 11c.2.2.3.5.3.7 0 .3-.1.5-.3.7l-12 11c-.4.4-1 .3-1.4-.1-.4-.4-.3-1 .1-1.4L20.5 16 9.3 5.7C9.1 5.5 9 5.3 9 5z"/></svg>';   // DMS 原圖（Chris 2026-11-20）
  const SOP_ICON_RIGHT = '<svg class="sopic" width="16" height="16" viewBox="0 0 32 32"><path fill="#0a1f44" d="M9 5c0-.6.4-1 1-1 .2 0 .5.1.7.3l12 11c.2.2.3.5.3.7 0 .3-.1.5-.3.7l-12 11c-.4.4-1 .3-1.4-.1-.4-.4-.3-1 .1-1.4L20.5 16 9.3 5.7C9.1 5.5 9 5.3 9 5z"/></svg>';   // DMS 原圖（Chris 2026-11-20）
  const SOP_ICON_COPY = '<svg class="sopic-copy" width="10" height="10" viewBox="0 0 10 10"><path fill="#2673dd" d="M6.04 5 5 3.96 7.24 1.72 5.52 0H9.7c.17 0 .3.13.3.3v4.18L8.28 2.76 6.04 5ZM1.43 1.43v7.14h7.14V4.29L10 5.71V9.4c0 .33-.27.6-.6.6H.6A.6.6 0 0 1 0 9.4V.6C0 .27.27 0 .6 0h3.69l1.43 1.43H1.43Z"/></svg>';
  const SOP_BTN = { pending: 'Pending Reason', note: 'Note And Reminder', validate: 'Validate Proof', message: 'Done' };
  const SOP_OPEN = {};             // 模組 id → { 節點: true/false }（講師自己展開、收合的）
  /** DMS 的 Node Point ID：SOP71_F17_Node556 */
  // 測驗中沒有整份 SOP，版本從題目記的 flows 推；其他時候用講師畫面載入的上線版
  const sopPool = () => (EX ? EX.sops || {} : SOPS);
  const sopPointId = (sop, nid) => String(nid).replace(/^(SOP\d+)_/, (m0, tb) => `${tb}_${String(((sopPool()[tb] || sop) || {}).flowId || '').split('_')[1] || ''}_`);

  function sopCardsHtml(md, i, sop, w) {
    // 卡片照順序由上往下（跟 DMS 一樣：最上面是起點，最新的在最下面；2026-11-20 Chris）
    // 專員作答（2026-11-21）：系統判讀節點自動帶過、預設收合、不能選；判決／結束只顯示「已到終點」；不顯示 SOP 綁定的動作內容（DMS 卡片上也沒有）
    const ag = !isEdit(), lock = ag && A.submitted;
    const items = w.steps.map((x, k) => ({ k, n: x.n, node: x.node, pick: x.pick, clicked: x.clicked, rec: x.rec, done: true }));
    if (w.cur && (w.node || w.end === 'stop')) items.push({ k: w.steps.length, n: w.cur, node: w.end === 'stop' ? { type: 'stop' } : w.node, pick: null, done: !!w.end });
    const open = SOP_OPEN[md.id] || {};
    return '<div class="sop-panel">' + items.map((it, idx) => {
      const node = it.node, isSys = node.type === 'system', isPick = node.type === 'manual' || isSys;
      const isFinal = ['final', 'judge', 'end', 'stop'].includes(node.type), isStop = node.type === 'stop';
      // 跟 DMS 一樣：只打開目前這張（最下面），選過的收起來；自己點開的照自己的（選下一步時重設）
      // 專員：收合時顯示問題（跟 DMS 一樣，DMS 卡片不顯示節點名稱；節點名稱常是 SOP 內部用語，翻譯服務也翻不出來）
      const exp = it.n in open ? open[it.n] : idx === items.length - 1;
      // 專員看不到系統判讀走了哪個分支（2026-11-21：走錯路線後的系統節點只能走 Default，顯示出來專員就知道自己走錯）
      const stopTxt = ag ? U('這一段作答完成', 'This section is complete') : '這一段在這裡結束';
      const ans = it.pick === null ? '-' : isPick ? sopPickLabel(node, it.pick) : isStop ? stopTxt : isFinal ? (ag ? U('已到終點', 'End of flow') : node.name) : (SOP_BTN[node.type] || '');
      const title = isStop ? stopTxt : ag && isFinal ? U('已到終點', 'End of flow') : ST(node.type === 'manual' ? (node.question || node.name) : node.name);
      let body = '';
      if (exp) {
        const qh = node.type === 'manual' && node.qhtml && !isStop && !(ag && isFinal);
        body = qh ? `<div class="sopi-title sopi-html">${safeHtml(ST(node.qhtml))}</div>` : `<div class="sopi-title">${esc(title)}</div>`;
        if (isPick) {
          const opts = isSys ? (node.branches || []).map((b) => ST(b.label) || (b.default ? 'Default' : '')) : (node.options || []).map((o) => ST(o.label));
          const can = !lock;
          body += `<div class="sopi-opts">${opts.map((lab, oi) => `<label class="sopr ${it.pick === oi ? 'on' : ''} ${isSys && !ag ? 'sopr-sys' : ''}">
              <input type="radio" name="sop${md.id}_${it.k}" ${it.pick === oi ? 'checked' : ''} ${can ? `onclick="CQ.${ag ? 'agPick' : 'sopPickAt'}(${i},${it.k},${oi})"` : 'disabled'}><span>${esc(lab)}</span></label>`).join('')}</div>`;
          // 系統判讀的條件不顯示（2026-11-20 Chris：不需要）
        } else if (isStop && !ag) {
          body += `<div class="sopi-text">這一段只考到這裡，從這個節點（${esc(it.n)}）開始不出題。</div><button class="mbtn" onclick="CQ.sopStop(${i},'')">取消結束點，繼續往下設定</button>`;
        } else if (ag && isFinal) {
          body += `<div class="sopi-text">${isStop ? U('這一段的題目做完了。', 'You have finished this section. ') : U('流程走到終點。', 'You have reached the end of the flow. ')}${A.submitted ? '' : U('要改答案的話，點上面的節點重新選。', 'To change an answer, click a node above and choose again.')}</div>`;
        } else {
          if (node.thtml) body += `<div class="sopi-text sopi-html">${safeHtml(ST(node.thtml))}</div>`;
          else if (node.text) body += `<div class="sopi-text">${esc(ST(node.text))}</div>`;
          const act = ag ? '' : sopActionHtml(node);
          if (act) body += `<div class="sopi-note">${act}</div>`;
          if (node.type === 'judge' && node.judge && node.judge.judging_reason) body += `<div class="sopi-note">判決理由：${esc(node.judge.judging_reason)}</div>`;
          body += sopBtnsHtml(md, i, node, it);
        }
        // 講師：目前還沒選的節點（專員、系統、動作節點都可以）可以設成這一段的結束點（2026-11-21 修：原本只有動作節點有）
        if (!ag && !it.done && !isFinal) body += `<button class="mbtn sop-stopbtn" onclick="CQ.sopStop(${i},'${esc(it.n)}')" title="分段考：這一段只考到這裡，這個節點之後不出題">在這裡結束這一段（這個節點不考）</button>`;
        // 專員畫面的終點不顯示節點編號（被截斷的終點其實是系統節點，查得到編號就會露餡）
        if (!(ag && isFinal)) body += `<div class="sopi-bottom"><span class="sopi-pid" title="Node Point ID">${esc(sopPointId(sop, it.n))}</span><span onclick="CQ.sopCopy('${esc(sopPointId(sop, it.n))}')">${SOP_ICON_COPY}</span></div>`;
      }
      return `<div class="sopi ${exp ? 'shadow' : ''} ${idx === items.length - 1 ? 'sopi-last' : ''}">
        <div class="sopi-head" onclick="CQ.sopToggle(${i},'${esc(it.n)}',${exp ? 0 : 1})">
          <div class="sopi-left">${it.done ? '' : SOP_ICON_TODO}${isSys ? SOP_ICON_SYS : SOP_ICON_AGENT}
            ${exp ? '' : `<span class="sopi-ell w200">${esc(ag && node.type === 'manual' ? title : ST(node.name) || title)}</span>${SOP_ICON_TO}<span class="sopi-ell w120">${esc(ans)}</span>`}${!ag && it.rec ? '<span class="sop-rec" title="系統節點依案件處理時的 SOP 紀錄自動選擇，講師可以改">依案件紀錄</span>' : ''}</div>
          ${exp ? SOP_ICON_UP : SOP_ICON_RIGHT}</div>${body}</div>`;
    }).join('') + (w.end === 'jump' ? `<div class="sopi"><div class="sopi-title">${U(`跳到 ${esc(w.cur)}（這個 SOP 沒有上線，當成終點）`, `Jumps to ${esc(w.cur)} (this SOP is not live; treated as the end)`)}</div></div>` : '') + '</div>';
  }
  // ═════════════════════════════════════════════════════════════
  // SOP 動作按鈕＋底部仿 DMS 操作列（2026-11-20 第 1b 步）
  //   SOP 卡片的動作按鈕：點了變色打勾＝點過；節點的按鈕都點過就往下一步（Chris 的做法）
  //   實際操作在畫面底部的仿 DMS 操作列做，送出後記在 md.acts：
  //     { seq, kind, fields, link:{n 節點, b 第幾顆按鈕, k 第幾步} 或 null（SOP 以外的操作）, at: 當時走到第幾步 }
  //   講師示範＝標準答案；專員作答、批改在第 2、3 步
  // ═════════════════════════════════════════════════════════════
  // Real Return Reason 下拉選單（2026-11-24 Chris 提供，DMS 的選項）：存英文
  const RRR = [
    ['包裹未送達／無法取件', 'Parcel not delivered'],
    ['收到完全不同的商品', 'Seller sent wrong item (e.g wrong size, model)'],
    ['其它(商品須以原包裝退還)', 'I want to return item in original/ sealed condition'],
    ['商品缺件／賣家通知缺貨', 'Missing part of the order'],
    ['實品與賣場描述／圖片有落差', 'Product does not meet expectations'],
    ['商品有仿品疑慮', 'Counterfeit product'],
    ['商品外表瑕疵／毀損', 'Damaged Item'],
    ['商品功能有問題', 'Product is defective or does not work'],
    ['只收到破壞袋、外箱', 'Empty parcel'],
  ];
  const rrrNorm = (v) => String(v == null ? '' : v).replace(/\s+/g, '').toLowerCase();
  /** SOP 預設值（可能是中文、英文或「中文 / 英文」）對到選項；對不到就原樣 */
  function rrrMatch(v) {
    const s = rrrNorm(v);
    if (!s) return '';
    const r = RRR.find(([zh, en]) => [zh, en, zh + '/' + en].some((x) => rrrNorm(x) === s)) || RRR.find(([zh, en]) => s.includes(rrrNorm(en)) || s.includes(rrrNorm(zh)));
    return r ? r[1] : String(v).trim();
  }
  // Potential Fraud 的原因（2026-11-24 Chris 提供）：勾 Buyer 出現 Buyer Reason、勾 Seller 出現 Seller Reason，各自一個選單
  //   存 id（之後補英文翻譯不影響已存的答案）；en 還沒給的先用 zh
  const FRAUD_REASON = {
    buyer: [
      ['b1', '(Reg) Provided fake/tampered evidence 影片、照片證據造假'],
      ['b2', '(Reg) Returned empty/ fraudulent parcel 買家退回空包/垃圾/非賣場商品(涉及詐欺，非單純寄錯)'],
      ['b3', '(Local)有使用行為導致毀損(商品損毀)'],
      ['b4', '(Local)賠償金額大於300 之換貨/補寄/補運費/補折扣碼/雙方已有協議金額'],
      ['b5', '(Reg) Provided irrelevant evidence 申退提交空白/模糊/不相關證據'],
      ['b6', '(Local)買家未妥善包裝導致商品毀損(物流毀損/外盒使用/包裝不完整/包裝退回錯誤)'],
      ['b7', '(Local)例外商品/個人衛生用品拆封/虛擬點數已儲值使用'],
      ['b8', '(Local)退回商品缺件'],
      ['b9', '(Local)SPX智取店買家惡意未寄回'],
      ['b10', '(Local)買家寄回非賣場商品(無涉及詐欺)'],
      ['b11', '(Local)買家蓄意將商品留於店到店/智取櫃中 / 買家智取店誤取聯繫後逾期未歸還'],
    ],
    seller: [
      ['s1', '(Reg) Provided fake/tampered evidence 影片、照片證據造假'],
      ['s2', '(Reg) Sent empty/fraudulent parcel 賣家寄出空包/垃圾/非賣場商品(涉及詐欺，非單純寄錯/貼錯標)'],
      ['s3', '(Reg) Seller cheats buyer by intentionally giving wrong instruction 引導買家不正確的退貨方式 引導買家不正確的退貨方式'],
      ['s4', '(Local) Service Recovry Seller 個案服務補償的賣家'],
      ['s5', '(Local)規避延遲出貨的賣家 (賣家未準時出貨，先用其他通知或贈品代替出貨)'],
    ],
  };
  const FRAUD_EN = {        // id → 英文（2026-11-24 Chris 提供）
    b1: '(Reg) Provided fake/tampered evidence: videos and photos are falsified.',
    b2: '(Reg) Returned empty/fraudulent parcel. The buyer Returned an empty package/garbage/non-Shop item (涉及詐欺，非單純寄錯)',
    b3: '(Local) Damage caused by use (product damage)',
    b4: '(Local) Compensation amount greater than 300 — exchange/reshipment/reimbursement of shipping fees/reimbursement of discount codes — amount already agreed upon by both parties.',
    b5: '(Reg) Provided irrelevant evidence. The submitted refund application contains blank, blurry, or irrelevant evidence.',
    b6: '(Local) Buyer failed to properly package the item, causing damage (shipping damage / outer box used / packaging incomplete / returned with incorrect packaging).',
    b7: '(Local) Exception item / personal hygiene product unsealed / virtual points already credited and used',
    b8: '(Local) Returned item missing parts',
    b9: '(Local) SPX Locker Store: Buyer maliciously failed to return the item.',
    b10: '(Local) Buyer returned a non-Shop item (not related to fraud)',
    b11: '(Local) The buyer intentionally left the item in a Shopee Xpress locker/locker store. After being contacted, the buyer failed to return it within the deadline.',
    s1: '(Reg) Provided fake/tampered evidence: videos and photos are falsified.',
    s2: '(Reg) Sent empty/fraudulent parcel. Seller shipped an empty package/garbage/non-Shop item (涉及詐欺，非僅僅寄錯或貼錯標籤)',
    s3: '(Reg) Seller cheats buyer by intentionally giving wrong instructions, guiding the buyer to an incorrect return method.',
    s4: '(Local) Service Recovry Seller — Seller responsible for case Service compensation',
    s5: '(Local) Avoid sellers who delay shipping (seller did not ship on time; instead used other notifications or free gifts to substitute for the shipment)',
  };
  const fraudTxt = (id) => { const r = [...FRAUD_REASON.buyer, ...FRAUD_REASON.seller].find((x) => x[0] === id); return r ? U(r[1], FRAUD_EN[id] || r[1]) : ''; };
  const ACT_KINDS = { note: 'Note and Reminder', proofBuyer: 'Request Proof from Buyer', proofSeller: 'Request Proof from Seller', pending: 'Pending Reason', caseDone: 'Case Done', fraud: 'Potential Fraud' };
  let ACTIVE_SOP = '';               // 最近操作的 SOP 題組（底部操作記到這一題）
  let ACT_HINT = '';                 // 底部要亮起提示的功能
  let ACT_MODAL = null;              // { kind, f: 欄位 }
  function btnKind(t) {
    const x = String(t || '').toLowerCase();
    if (x.includes('pending')) return 'pending';
    if (x.includes('proof') && x.includes('buyer')) return 'proofBuyer';
    if (x.includes('proof') && x.includes('seller')) return 'proofSeller';
    if (x.includes('fraud')) return 'fraud';
    if (x.includes('note')) return 'note';
    if (x.includes('judge')) return 'judge';
    if (x.includes('case done')) return 'caseDone';
    return 'note';                   // 其他按鈕（Remark…）一律比照 Note And Reminder（Chris 11-21）
  }
  /** SOP 按鈕預設的 Remind me（true / 1 / 'yes'…）；沒設定＝null，畫面預設 No */
  const remindOf = (v) => v === undefined || v === null || v === '' ? null : v === true || v === 1 || /^(1|true|yes|y)$/i.test(String(v).trim());
  /** 節點綁定的動作按鈕（SOP 資料裡的按鈕；按鈕文字決定是哪個功能，SOP 設定的類型有時候是錯的） */
  function sopButtons(node) {
    const raw = node.pending || node.note || node.buttons || [];
    const fin = node.type === 'judge' || node.type === 'end' || node.type === 'final';   // 判決節點的按鈕只顯示、不用點
    let out = raw.map((b) => ({ kind: fin ? 'judge' : btnKind(b.button_text), text: b.button_text || '',
      bind: { pendingBy: b.pending_by || null, remark: String(b.remark || '').trim(), realReason: b.real_return_reason || '', remindMe: remindOf(b.remind_me) } }));
    if (!out.length && node.type === 'pending') out = [{ kind: 'pending', text: 'Pending Reason', bind: {} }];
    if (!out.length && node.type === 'note') out = [{ kind: 'note', text: 'Note And Reminder', bind: {} }];
    return out;
  }
  const reqButtons = (node) => sopButtons(node).filter((b) => ACT_KINDS[b.kind]);
  function sopBtnsHtml(md, i, node, it) {
    const ag = !isEdit(), st = sopState(md), lock = ag && A.submitted;
    const all = sopButtons(node), req = reqButtons(node);
    const clicked = it.done ? (it.clicked && it.clicked.length ? it.clicked : req.map((_, k) => k)) : (st.cur && st.cur.n === it.n ? st.cur.clicked : []);
    let h = '';
    let r = -1;
    all.forEach((b) => {
      if (!ACT_KINDS[b.kind]) { h += `<button class="sopi-btn" disabled title="判決不用操作，走到這裡就結束">${esc(ST(b.text))}</button>`; return; }
      r++;
      const on = clicked.includes(r);
      h += `<button class="sopi-btn ${on ? 'clicked' : ''}" ${it.done || on || lock ? 'disabled' : ''} onclick="CQ.${ag ? 'agBtn' : 'sopBtn'}(${i},${r})">${on ? '✓ ' : ''}${esc(ST(b.text))}</button>`;
    });
    if (!req.length && !it.done && !lock && !['judge', 'end', 'final'].includes(node.type)) h += `<button class="sopi-btn" onclick="CQ.${ag ? `agPick(${i},${it.k},0)` : `sopPick(${i},0)`}">${esc(SOP_BTN[node.type] || 'Done')}</button>`;
    const acts = (st.acts || []).filter((a) => a.link && a.link.n === it.n);
    if (acts.length) h += `<div class="sop-acts">${acts.map((a, n) => actLine(md, a, i, n + 1)).join('')}</div>`;
    else if (req.length && clicked.length) h += `<div class="sop-acts none">${U('還沒有在底部操作列做對應的操作', 'Complete the matching action in the action bar at the bottom')}</div>`;
    return h;
  }
  function actSummary(a) {
    const f = a.fields || {};
    if (a.kind === 'pending') return `Pending by：${PENDING_BY[f.pendingBy] || '-'}`;
    if (a.kind === 'proofBuyer' || a.kind === 'proofSeller') return `${U('模板', 'Template')}：${f.template || '-'}｜${f.deadline === 'flexible' ? 'Flexible' : 'Fixed'} ${f.days || 1} day｜${f.timeType === 'working' ? 'Working Days' : 'Calendar Days'}${f.excludeHolidays ? '（Exclude Holidays）' : ''}｜Email：${f.email ? 'Yes' : 'No'}`;
    if (a.kind === 'note') return `Real Return Reason：${f.realReason || '-'}｜Remind me：${f.remindMe ? 'Yes' : 'No'}`;
    if (a.kind === 'fraud') return [f.buyer ? `Buyer Reason：${fraudTxt(f.buyerReason) || f.buyerReasonText || '-'}` : '', f.seller ? `Seller Reason：${fraudTxt(f.sellerReason) || f.sellerReasonText || '-'}` : ''].filter(Boolean).join('｜') || 'User Type：-';
    return '';
  }
  function actLine(md, a, i, no) {
    const f = a.fields || {};
    const items = (f.items || []).length ? `<div class="sop-rmk">${U('證據項目', 'Evidence items')}：${f.items.map((x, k) => `${k + 1}. ${esc(x.hint)}${x.req ? '' : '（Optional）'}`).join('　')}</div>` : '';
    const ck = f.checklist ? `<div class="sop-rmk">Checklist：${esc(f.checklist)}</div>` : '';
    return `<div class="sop-act-line"><div class="sop-act-txt"><b>${no ? no + '. ' : ''}${esc(ACT_KINDS[a.kind] || a.kind)}</b> ${esc(actSummary(a))}${ck}${items}${f.remark ? `<div class="sop-rmk">${a.kind === 'fraud' ? 'Description' : 'Remark'}：${esc(f.remark)}</div>` : ''}</div>
      ${isEdit() ? `<button class="mbtn del" title="刪除這筆操作紀錄" onclick="CQ.actDel(${i},${a.seq})">✕</button>` : ''}</div>`;
  }
  function sopBtn(i, r) {
    const md = C.modules[i], sop = SOPS[md.taskbot];
    const w = sopWalk(md, sop);
    if (!w.node || w.end) return;
    const req = reqButtons(w.node);
    if (!md.cur || md.cur.n !== w.cur) md.cur = { n: w.cur, clicked: [] };
    if (!md.cur.clicked.includes(r)) md.cur.clicked.push(r);
    ACTIVE_SOP = md.id;
    ACT_HINT = md.hint ? req[r].kind : '';
    if (req.every((_, k) => md.cur.clicked.includes(k))) {     // 按鈕都點過 → 這一步完成，接下一個節點
      md.answer = w.steps.map(stepOut).concat([{ n: w.cur, pick: 0, clicked: md.cur.clicked.slice() }]);
      md.cur = null;
    }
    delete SOP_OPEN[md.id]; sopAutoSys(md); sopSnap(md, sop); saveCase(); renderSide(); sopScrollLast();
  }
  function actDel(i, seq) {
    const md = C.modules[i];
    md.acts = (md.acts || []).filter((a) => a.seq !== seq);
    saveCase(); renderSide();
  }

  // ───────── 底部仿 DMS 操作列（DMS-SOP-UI 截圖：More、Agreement、Case Done、Potential Fraud、Note and Reminder、Request Proof…、Validate Proof、Pending Reason） ─────────
  const sopMods = () => ((C && C.modules) || []).filter((m) => m.type === 'sop');
  function renderActbar() {
    const bar = document.getElementById('cqActs');
    if (!bar) return;
    // 講師編輯：示範操作；專員作答（測驗、講師預覽）：交卷前都可以操作
    const show = sopMods().length > 0 && VIEW < 0 && (isEdit() ? !EX : !(A && A.submitted));
    bar.style.display = show ? '' : 'none';
    document.getElementById('cq').classList.toggle('has-acts', show);
    if (!show) { ACT_MODAL = null; renderActModal(); return; }
    const soon = (t) => `<button class="actb soon" title="${U('第二期才做', 'Not available yet')}">${t}</button>`;
    const b = (k, t) => `<button class="actb ${ACT_HINT === k ? 'hint' : ''} ${ACT_MODAL && ACT_MODAL.kind === k ? 'on' : ''}" onclick="CQ.actOpen('${k}')">${t}</button>`;
    bar.innerHTML = soon('More ⌄') + soon('Agreement') + b('caseDone', 'Case Done') + b('fraud', 'Potential Fraud') + b('note', 'Note and Reminder')
      + b('proofBuyer', 'Request Proof from Buyer') + b('proofSeller', 'Request Proof from Seller') + soon('Validate Proof ⌄') + b('pending', 'Pending Reason');
    renderActModal();
  }
  /** 這次操作要記到哪一題：最近操作的 SOP 題組，沒有就第一個還沒走完的 */
  function actTarget() {
    const mods = sopMods();
    return mods.find((m) => m.id === ACTIVE_SOP) || mods.find((m) => m.start && (isEdit() ? SOPS[m.taskbot] && !sopWalk(m).end : !agWalk(m).end)) || mods[0];
  }
  /** 這次操作記到 SOP 哪個節點（2026-11-21 Chris：一顆按鈕可能要做好幾個操作，例如「向賣家索取證明」＝發賣家證據卡＋Pending 等賣家回應＋Case Done）
   *  規則：目前節點點過按鈕 → 記在目前節點；不然往回找最近一個點過按鈕的節點，中間只經過系統判讀節點才算（選過其他節點就算 SOP 以外的操作）
   *  同一個節點底下的操作照做的順序排，講師示範的順序就是正解；b＝同類的按鈕（帶綁定欄位用），沒有同類就用最後點的那顆 */
  function actLinkFor(md, kind) {
    if (!md.start || (isEdit() && !SOPS[md.taskbot])) return null;
    const w = sopW(md), st = sopState(md);
    const pick = (n, node, clicked, k) => {
      const req = reqButtons(node);
      const same = clicked.filter((b) => req[b] && req[b].kind === kind);
      const b = same.length ? same[same.length - 1] : clicked[clicked.length - 1];
      return { n, b, k, bind: same.length ? req[b].bind : {} };
    };
    if (st.cur && st.cur.n === w.cur && w.node && st.cur.clicked.length) return pick(w.cur, w.node, st.cur.clicked, w.steps.length);
    for (let k = w.steps.length - 1; k >= 0; k--) {
      const x = w.steps[k];
      if ((x.clicked || []).length && reqButtons(x.node).length) return pick(x.n, x.node, x.clicked, k);
      if (x.node.type !== 'system') break;
    }
    return null;
  }
  function actOpen(kind) {
    const md = actTarget();
    const link = md ? actLinkFor(md, kind) : null;
    // SOP 有綁定的欄位先帶好（可以改）：只有講師示範時帶；專員作答（測驗、講師預覽）不帶，要自己填（2026-11-24 Chris）
    const bind = (isEdit() && !EX && link && link.bind) || {};
    const f = { pendingBy: bind.pendingBy || null, remark: bind.remark || '', template: '', deadline: 'fixed', days: 1, timeType: 'calendar', excludeHolidays: false, email: false,
      realReason: rrrMatch(bind.realReason), remindMe: bind.remindMe === true, buyer: false, seller: false, buyerReason: '', sellerReason: '', checklist: '', items: [{ hint: '', req: true }] };
    ACT_MODAL = { kind, f };
    renderActbar();
  }
  function actSet(k, v) { if (ACT_MODAL) ACT_MODAL.f[k] = v; }
  /** Potential Fraud：改 User Type 要重畫（出現／收起對應的原因選單）；取消勾選就清掉那一類的原因 */
  function fraudUser(k, v) {
    if (!ACT_MODAL) return;
    ACT_MODAL.f[k] = v;
    if (!v) ACT_MODAL.f[k + 'Reason'] = '';
    renderActModal();
  }
  /** Evidence Module（要索取的證據項目）：改內容不重畫（輸入框才不會跳掉）；新增、刪除才重畫 */
  function actItem(k, key, v) { if (ACT_MODAL && ACT_MODAL.f.items[k]) ACT_MODAL.f.items[k][key] = v; }
  function actItemAdd() { if (!ACT_MODAL) return; if (ACT_MODAL.f.items.length >= 10) return X.toast('最多 10 個證據項目'); ACT_MODAL.f.items.push({ hint: '', req: true }); renderActModal(); }
  function actItemDel(k) { if (!ACT_MODAL) return; ACT_MODAL.f.items.splice(k, 1); renderActModal(); }
  function actClose() { ACT_MODAL = null; renderActbar(); }
  function actConfirm() {
    const m = ACT_MODAL;
    if (!m) return;
    const f = m.f;
    if (m.kind === 'pending' && !f.pendingBy) return X.toast(U('請選擇 Pending by', 'Please select Pending by'));
    if ((m.kind === 'proofBuyer' || m.kind === 'proofSeller') && !String(f.template).trim()) return X.toast(U('請填寫 Evidence checklist template（模板名稱）', 'Please fill in Evidence checklist template'));
    if ((m.kind === 'proofBuyer' || m.kind === 'proofSeller') && !f.items.some((x) => String(x.hint).trim())) return X.toast(U('請至少填一個 Evidence Module（要索取的證據項目）', 'Please fill in at least one Evidence Module'));
    if (m.kind === 'fraud' && !f.buyer && !f.seller) return X.toast(U('請選擇 User Type', 'Please select User Type'));
    if (m.kind === 'fraud' && f.buyer && !f.buyerReason) return X.toast(U('請選擇 Buyer Reason', 'Please select Buyer Reason'));
    if (m.kind === 'fraud' && f.seller && !f.sellerReason) return X.toast(U('請選擇 Seller Reason', 'Please select Seller Reason'));
    if (m.kind === 'note' && !String(f.realReason).trim()) return X.toast(U('請填寫 Real Return Reason', 'Please fill in Real Return Reason'));
    const md = actTarget();
    if (!md) { ACT_MODAL = null; renderActbar(); return; }
    const link = actLinkFor(md, m.kind), st = sopState(md);
    const fields = m.kind === 'pending' ? { pendingBy: Number(f.pendingBy), remark: String(f.remark).trim() }
      : m.kind === 'note' ? { realReason: String(f.realReason).trim(), remindMe: !!f.remindMe, remark: String(f.remark).trim() }
      : m.kind === 'fraud' ? Object.assign({ buyer: !!f.buyer, seller: !!f.seller, remark: String(f.remark).trim() },
        f.buyer ? { buyerReason: f.buyerReason, buyerReasonText: (FRAUD_REASON.buyer.find((x) => x[0] === f.buyerReason) || [])[1] || '' } : {},
        f.seller ? { sellerReason: f.sellerReason, sellerReasonText: (FRAUD_REASON.seller.find((x) => x[0] === f.sellerReason) || [])[1] || '' } : {})
      : m.kind === 'caseDone' ? {}
      : { template: String(f.template).trim(), deadline: f.deadline, days: Number(f.days) || 1, timeType: f.timeType, excludeHolidays: !!f.excludeHolidays, email: !!f.email, remark: String(f.remark).trim(),
        checklist: String(f.checklist).trim(), items: f.items.filter((x) => String(x.hint).trim()).map((x) => ({ hint: String(x.hint).trim(), req: !!x.req })) };
    st.acts = st.acts || [];
    st.actSeq = (st.actSeq || 0) + 1;
    const ac = { seq: st.actSeq, kind: m.kind, fields, link: link ? { n: link.n, b: link.b, k: link.k } : null, at: md.start ? sopW(md).steps.length : 0 };
    if (EX) ac.t = exNowSec();                 // 專員作答：記下做這個操作的時間（開始作答後第幾秒）
    st.acts.push(ac);
    if (ACT_HINT === m.kind) ACT_HINT = '';
    ACT_MODAL = null;
    if (isEdit()) saveCase(); else { exEdit(md.id); saveAnswer(); }
    renderSide();
    X.toast(link ? U(`已記錄：${ACT_KINDS[m.kind]}（SOP 第 ${link.k + 1} 步）`, `Recorded: ${ACT_KINDS[m.kind]} (SOP step ${link.k + 1})`)
      : U(`已記錄：${ACT_KINDS[m.kind]}（SOP 以外的操作）`, `Recorded: ${ACT_KINDS[m.kind]} (outside the SOP)`));
  }
  function renderActModal() {
    const box = document.getElementById('cqActModal');
    if (!box) return;
    const m = ACT_MODAL;
    if (!m) { box.innerHTML = ''; box.className = ''; return; }
    const f = m.f, title = ACT_KINDS[m.kind];
    const radio = (name, val, cur, label, set) => `<label class="am-r"><input type="radio" name="am_${name}" ${cur === val ? 'checked' : ''} onchange="CQ.actSet('${set}',${typeof val === 'string' ? `'${val}'` : val})"> ${label}</label>`;
    const remark = (max) => `<div class="am-l">Remark</div><textarea maxlength="${max}" placeholder="Enter keywords to search templates" oninput="CQ.actSet('remark',this.value)">${esc(f.remark)}</textarea>
      <div class="am-c">${U(`上限 ${max} 字`, `Max ${max} characters`)}</div>`;
    if (m.kind === 'caseDone') {
      box.className = 'am-center';
      box.innerHTML = `<div class="am"><div class="am-h">Case Done<span class="am-x" onclick="CQ.actClose()">×</span></div>
        <div class="am-b">Are you ready to move on to the next case? This case will be removed from your task list.</div>
        <div class="am-f"><button class="am-btn" onclick="CQ.actClose()">Back</button><button class="am-btn pri" onclick="CQ.actConfirm()">Confirm</button></div></div>`;
      return;
    }
    let body;
    if (m.kind === 'pending') {
      body = `<div class="am-l"><i>*</i> Pending by</div><div class="am-grid">${Object.entries(PENDING_BY).map(([v, t]) => radio('pb', Number(v), Number(f.pendingBy), esc(t), 'pendingBy')).join('')}</div>` + remark(500);
    } else if (m.kind === 'fraud') {
      // DMS-SOP-UI-13：User Type（Buyer／Seller 複選）＋ Description（上限 1000 字）；Description 存在 remark
      // 勾 Buyer 出現 Buyer Reason、勾 Seller 出現 Seller Reason（DMS 截圖 2026-11-24）
      const ck = (k, label) => `<label class="am-r"><input type="checkbox" ${f[k] ? 'checked' : ''} onchange="CQ.fraudUser('${k}',this.checked)"> ${label}</label>`;
      const sel = (k, label) => !f[k] ? '' : `<div class="am-l"><i>*</i> ${label}</div><select class="am-rrr" onchange="CQ.actSet('${k}Reason',this.value)"><option value="" ${f[k + 'Reason'] ? '' : 'selected'}>Please select</option>${
        FRAUD_REASON[k].map(([id]) => `<option value="${id}" ${f[k + 'Reason'] === id ? 'selected' : ''}>${esc(fraudTxt(id))}</option>`).join('')}</select>`;
      body = `<div class="am-l"><i>*</i> User Type</div><div class="am-row">${ck('buyer', 'Buyer')}${ck('seller', 'Seller')}</div>` + sel('buyer', 'Buyer Reason') + sel('seller', 'Seller Reason')
        + remark(1000).replace('<div class="am-l">Remark</div>', '<div class="am-l">Description</div>');
    } else if (m.kind === 'note') {
      body = `<div class="am-l"><i>*</i> Real Return Reason</div><select class="am-rrr" onchange="CQ.actSet('realReason',this.value)"><option value="" ${f.realReason ? '' : 'selected'}>Please select</option>${
          RRR.map(([zh, en]) => `<option value="${esc(en)}" ${f.realReason === en ? 'selected' : ''}>${esc(zh + ' / ' + en)}</option>`).join('')}${
          f.realReason && !RRR.some((r) => r[1] === f.realReason) ? `<option value="${esc(f.realReason)}" selected>${esc(f.realReason)}</option>` : ''}</select>
        <div class="am-l"><i>*</i> Remind me</div><div class="am-row">${radio('rm', true, f.remindMe, 'Yes', 'remindMe')}${radio('rm', false, f.remindMe, 'No', 'remindMe')}</div>` + remark(1000);
    } else {
      body = `<div class="am-l"><i>*</i> Evidence checklist template</div><input type="text" value="${esc(f.template)}" placeholder="${U('輸入模板名稱，例如 8.1_退貨_商品缺件_低風險賣家_出貨證明', 'Template name, e.g. 8.1_退貨_商品缺件_低風險賣家_出貨證明')}" oninput="CQ.actSet('template',this.value)">
        <div class="am-hint">${U('DMS 選了模板會自動帶出下面兩格；這裡要自己填（索取的證據項目要計分）', 'In DMS the template fills in the two fields below; here you fill them in yourself (the evidence items are graded)')}</div>
        <div class="am-l"><i>*</i> Set evidence deadline</div><div class="am-row">${radio('dl', 'fixed', f.deadline, 'Fixed time', 'deadline')}${radio('dl', 'flexible', f.deadline, 'Flexible time', 'deadline')}</div>
        <select onchange="CQ.actSet('days',+this.value)">${[1, 2, 3, 4, 5, 6, 7].map((d) => `<option value="${d}" ${Number(f.days) === d ? 'selected' : ''}>${d} day${d > 1 ? 's' : ''}</option>`).join('')}</select>
        <div class="am-l"><i>*</i> Proof Time Type</div><div class="am-row">${radio('tt', 'calendar', f.timeType, 'Calendar Days', 'timeType')}${radio('tt', 'working', f.timeType, 'Working Days', 'timeType')}
          <label class="am-r"><input type="checkbox" ${f.excludeHolidays ? 'checked' : ''} onchange="CQ.actSet('excludeHolidays',this.checked)"> Exclude Holidays</label></div>
        <div class="am-l">Checklist contents</div><textarea maxlength="1000" placeholder="${U('例如 為協助蝦皮審核，請提供相關證明。', 'e.g. To help Shopee review your case, please provide proof.')}" oninput="CQ.actSet('checklist',this.value)">${esc(f.checklist)}</textarea>
        <div class="am-l"><i>*</i> Evidence Module</div>
        <table class="am-ev"><thead><tr><th>No.</th><th>Hint Text</th><th>If Required</th><th></th></tr></thead><tbody>
          ${f.items.map((x, k) => `<tr><td>${k + 1}</td><td><input type="text" value="${esc(x.hint)}" placeholder="${U('要索取的證據，例如 可看出正確的商品在良好狀況下依照包裝規範出貨的照片', 'Evidence to request, e.g. photos showing the correct item was shipped in good condition and properly packed')}" oninput="CQ.actItem(${k},'hint',this.value)"></td>
            <td><select onchange="CQ.actItem(${k},'req',this.value==='1')"><option value="1" ${x.req ? 'selected' : ''}>Required</option><option value="0" ${x.req ? '' : 'selected'}>Optional</option></select></td>
            <td>${f.items.length > 1 ? `<span class="am-x" title="${U('刪除', 'Delete')}" onclick="CQ.actItemDel(${k})">×</span>` : ''}</td></tr>`).join('')}</tbody></table>
        <div class="am-add" onclick="CQ.actItemAdd()">⊕ Add Evidence Module</div>
        <div class="am-l"><i>*</i> Email Notification</div><div class="am-row">${radio('em', true, f.email, 'Yes', 'email')}${radio('em', false, f.email, 'No', 'email')}</div>` + remark(1500);
    }
    box.className = 'am-side';
    box.innerHTML = `<div class="am"><div class="am-h">${title}<span class="am-x" onclick="CQ.actClose()">×</span></div><div class="am-b">${body}</div>
      <div class="am-f"><button class="am-btn" onclick="CQ.actClose()">Close</button><button class="am-btn pri" onclick="CQ.actConfirm()">Confirm</button></div></div>`;
  }

  // ═════════════════════════════════════════════════════════════
  // SOP 路徑題組：專員作答（2026-11-21 第 2 步；Chris 最後定案）
  //   專員照 SOP 自由往下走，沒有固定路線；系統節點也由專員自己選（分類規則本來就要懂，也才能發現 SOP 設錯）
  //   講師的標準路線只用來批改：不完整走在標準路線上就算錯（第 3 步）
  //   作答存在 A.sop[模組 id] = { route:[{n, pick, clicked, t, chg, hist}], acts, cur:{n, clicked}, actSeq }，route＝專員走過的每一步（照順序）
  //   可以往前改：改了之後下面的路線重走，那個節點記一次修改（chg、hist）
  //   SOP：測驗中用發佈時做的專員版（EX.sops，判決只標終點）；講師用「專員預覽」時用講師畫面載入的上線版
  //   講師設了結束點：專員走滿 md.stopAfter 步就結束（「這一段作答完成」，走對走錯都一樣）
  // ═════════════════════════════════════════════════════════════
  function agSt(md, a) {
    a = a || A;
    a.sop = a.sop || {};
    return a.sop[md.id] || (a.sop[md.id] = { route: [], acts: [], cur: null, actSeq: 0 });
  }
  /** 講師編輯：題目本身（標準答案）；專員作答：自己的作答 */
  const sopState = (md) => (isEdit() ? md : agSt(md));
  const sopW = (md) => (isEdit() ? sopWalk(md) : agWalk(md));
  /** 結束點：測驗中用發佈時算好的步數；講師預覽時照標準答案算 */
  function agStopAfter(md) {
    if (EX) return Number(md.stopAfter) || 0;
    if (!md.stop) return 0;
    const w = sopWalk(md);
    return w.end === 'stop' ? w.steps.length : 0;
  }
  /** 照專員的作答從起點走：steps 每一步帶 r（對應 route 第幾筆） */
  function agWalk(md, st) {
    st = st || agSt(md);
    const pool = EX ? EX.sops : SOPS, steps = [];
    if (EX && !EX.sops) return { steps, cur: md.start, node: null, end: 'loading' };
    const limit = agStopAfter(md);
    let nid = md.start, r = 0;
    while (nid && r < 400) {
      if (limit && steps.length >= limit) return { steps, cur: nid, node: { type: 'stop' }, end: 'final' };
      const tb = sopTbOf(nid);
      if (!pool[tb]) {
        if (!EX && (!SOP_LIST || SOP_LIST.some((x) => x.taskbot === tb))) { sopLoad(tb); return { steps, cur: nid, node: null, end: 'loading' }; }
        break;
      }
      const node = pool[tb].nodes[nid];
      if (!node || ['judge', 'end', 'final'].includes(node.type)) break;
      const s = st.route[r];
      if (!s || s.n !== nid) return { steps, cur: nid, node, end: '' };
      steps.push({ n: nid, node, pick: s.pick, clicked: s.clicked || [], r });
      r++;
      nid = sopNext(node, s.pick);
    }
    const node = nid && pool[sopTbOf(nid)] ? pool[sopTbOf(nid)].nodes[nid] || null : null;
    // 判決、結束、跳到沒上線的 SOP、選項沒有下一步：都只顯示「已到終點」
    return { steps, cur: nid, node: { type: 'final' }, end: 'final' };
  }
  /** 專員在第 k 步選 opt：還沒答的＝往下一步；答過的＝改答案（下面的路線重走，記一次修改；已經做過的操作不收回，跟 DMS 一樣） */
  function agPick(i, k, opt) {
    const md = C.modules[i];
    if (A.submitted) return;
    const st = agSt(md), w = agWalk(md);
    const t = EX ? exNowSec() : 0;
    if (k < w.steps.length) {
      const s = w.steps[k];
      if (s.pick === opt) return;
      if (k < w.steps.length - 1 || w.end) { if (!confirm(U('確定要重新選擇這個節點？之後的節點會重新走。', 'Choose this node again? The nodes after it will be reset.'))) { renderSide(); return; } }
      const e = st.route[s.r], hist = (e.hist && e.hist.length ? e.hist : [[e.pick, e.t || 0]]).concat([[opt, t]]);
      st.route = st.route.slice(0, s.r).concat([Object.assign({}, e, { pick: opt, clicked: [], chg: (e.chg || 0) + 1, hist })]);
    } else {
      if (!w.node || w.end) return;
      st.route = st.route.slice(0, w.steps.length).concat([{ n: w.cur, pick: opt, clicked: [], t }]);
    }
    st.cur = null; ACTIVE_SOP = md.id;
    delete SOP_OPEN[md.id]; exEdit(md.id); saveAnswer(); renderSide(); sopScrollLast();
  }
  /** 專員點 SOP 卡片上的動作按鈕：變色打勾；按鈕都點過就往下一步 */
  function agBtn(i, r) {
    const md = C.modules[i];
    if (A.submitted) return;
    const st = agSt(md), w = agWalk(md);
    if (!w.node || w.end) return;
    const req = reqButtons(w.node);
    if (!req[r]) return;
    if (!st.cur || st.cur.n !== w.cur) st.cur = { n: w.cur, clicked: [] };
    if (!st.cur.clicked.includes(r)) st.cur.clicked.push(r);
    ACTIVE_SOP = md.id;
    ACT_HINT = md.hint ? req[r].kind : '';
    if (req.every((_, k) => st.cur.clicked.includes(k))) {
      st.route = st.route.slice(0, w.steps.length).concat([{ n: w.cur, pick: 0, clicked: st.cur.clicked.slice(), t: EX ? exNowSec() : 0 }]);
      st.cur = null;
    }
    delete SOP_OPEN[md.id]; exEdit(md.id); saveAnswer(); renderSide(); sopScrollLast();
  }
  // ───────── 第 3 步：批改比對畫面（講師批改、專員公布解答後共用） ─────────
  //   比對規則在 db.js sopGrade：路線不是完整走在標準路線上就全錯；動作逐節點比對種類、順序、欄位
  const sopParse = (v) => { if (!v) return null; if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch (_) { return null; } };
  const OKMARK = (ok) => (ok === true ? `<span class="sop-chk ok">${U('對', 'Correct')}</span>` : ok === false ? `<span class="sop-chk ng">${U('錯', 'Wrong')}</span>` : `<span class="sop-chk">${U('需確認', 'To review')}</span>`);
  /** keySopRaw：解答（key 的 sop）；ansRaw：專員作答；pool：這場測驗的 SOP 專員版（顯示節點名稱） */
  function sopReviewHtml(keySopRaw, ansRaw, pool, opt = {}) {
    const DB = window.RRQP_DB;
    if (!DB || !DB.sopGrade) return '';
    const k = sopParse(keySopRaw) || {}, a = sopParse(ansRaw) || {}, g = DB.sopGrade(k, a);
    const nodeOf = (n) => (k.snap || {})[n] || ((pool || {})[sopTbOf(n)] || { nodes: {} }).nodes[n] || null;
    const label = (st) => {
      const n = nodeOf(st.n);
      if (!n) return `<span class="mono">${esc(st.n)}</span>`;
      const name = n.name || n.question || st.n;
      const pick = n.type === 'manual' || n.type === 'system' ? sopPickLabel(n, st.pick || 0) : (sopButtons(n).filter((b) => ACT_KINDS[b.kind]).map((b) => ST(b.text)).join(U('、', ', ')) || SOP_BTN[n.type] || U('完成', 'Done'));
      return `${n.type === 'system' ? `<span class="sop-tag">${U('系統', 'System')}</span>` : ''}${esc(ST(name))} → <b>${esc(pick)}</b>`;
    };
    // 路線最後到哪個判決（解答裡有判決名稱）
    const endOf = (route) => {
      const last = route[route.length - 1];
      if (!last) return '';
      const n = nodeOf(last.n), to = n ? sopNext(n, last.pick || 0) : null, tn = to && nodeOf(to);
      const f = to && ((k.finals || {})[to] || (tn && (tn.type === 'judge' || tn.type === 'end') ? tn : null));
      return f ? `${U('終點', 'End')}：${esc(ST(f.name))}` : '';
    };
    const std = (k.route || []).slice(0, k.stopAfter || undefined), mine = a.route || [];
    const rows = Array.from({ length: Math.max(std.length, mine.length) }, (_, i) => {
      const cls = g.diverge < 0 || i < g.diverge ? '' : i === g.diverge ? 'sop-rv-bad' : 'sop-rv-after';
      const chg = mine[i] && mine[i].chg ? `<span class="sop-chg" title="${U('這一步改過答案', 'Answer changed at this step')}">${U(`改過 ${mine[i].chg} 次`, `changed ${mine[i].chg}×`)}</span>` : '';
      return `<tr class="${cls}"><td>${i + 1}</td><td>${std[i] ? label(std[i]) : `<span class="soft">${U('（標準答案到這裡結束）', '(standard answer ends here)')}</span>`}</td><td>${mine[i] ? label(mine[i]) + chg : `<span class="soft">${U('（沒有作答）', '(no answer)')}</span>`}</td></tr>`;
    }).join('');
    const head = g.routeOk ? `<span class="sop-ok">${U('路線正確', 'Route correct')}</span>` : `<span class="sop-ng">${U(`路線從第 ${g.diverge + 1} 步開始不同`, `Route differs from step ${g.diverge + 1}`)}</span>${mine.length < std.length && g.diverge === mine.length ? U('（沒有走完）', ' (not finished)') : ''}`;
    // 操作比對：每個操作一張小表（欄位｜標準｜專員｜結果），2026-11-21 Chris：原本一長句＋再列一次差異，太亂
    const actName = (x) => (x ? `${esc(ACT_KINDS[x.kind] || x.kind)}${actSummary(x) ? '：' + esc(actSummary(x)) : ''}` : '<span class="soft">—</span>');
    const fv = (f, x) => { const v = x == null || x === '' ? '' : f.name === 'Pending by' ? PENDING_BY[x] || x : typeof x === 'boolean' ? (x ? 'Yes' : 'No') : x; return v === '' ? '<span class="soft">—</span>' : esc(String(v)); };
    const opHtml = (p) => {
      const kind = esc(ACT_KINDS[(p.exp || p.got).kind] || (p.exp || p.got).kind);
      if (!p.fields) {
        const diff = p.exp && p.got ? U(`：標準是 ${esc(ACT_KINDS[p.exp.kind] || '')}，專員做了 ${esc(ACT_KINDS[p.got.kind] || '')}`, `: expected ${esc(ACT_KINDS[p.exp.kind] || '')}, done ${esc(ACT_KINDS[p.got.kind] || '')}`) : '';
        return `<div class="sop-rv-op"><div class="sop-rv-opk">${OKMARK(p.ok)}<span>${kind}</span><span class="sop-ng">${esc(p.note || '')}${diff}</span></div></div>`;
      }
      if (!p.fields.length) return `<div class="sop-rv-op"><div class="sop-rv-opk">${OKMARK(p.ok)}<span>${kind}</span></div></div>`;
      return `<div class="sop-rv-op"><div class="sop-rv-opk">${OKMARK(p.ok)}<span>${kind}</span></div>
        <table class="sop-rv-ft"><thead><tr><th>${U('欄位', 'Field')}</th><th>${U('標準', 'Expected')}</th><th>${U('專員', 'Agent')}</th></tr></thead><tbody>
        ${p.fields.map((f) => `<tr class="${f.ok === false ? 'bad' : f.ok === null ? 'chk' : ''}"><td>${esc(f.name)}</td><td>${fv(f, f.exp)}</td><td>${fv(f, f.got)}</td></tr>`).join('')}</tbody></table></div>`;
    };
    const acts = g.acts.map((x) => {
      const n = nodeOf(x.n), name = n ? n.name || n.question : x.n;
      return `<div class="sop-rv-act"><div class="sop-rv-node">${U(`第 ${x.i + 1} 步`, `Step ${x.i + 1}`)}　${esc(ST(name))}</div>${x.pairs.map(opHtml).join('')}</div>`;
    }).join('');
    const outside = g.outside.length ? `<div class="sop-rv-act"><div class="sop-rv-node">${U('標準路線以外的操作', 'Actions outside the standard route')} ${OKMARK(null)}</div>${g.outside.map((x) => `<div class="sop-rv-op">${actName(x)}</div>`).join('')}</div>` : '';
    const auto = g.auto === 1 ? '自動判定：滿分（路線與操作都正確）' : g.auto === 0 ? `自動判定：0 分（${g.mineLen || (a.acts || []).length ? '路線錯誤' : '沒有作答'}）` : `需要講師給分${g.actsOk === false ? '（操作有錯，建議 0 分）' : '（有文字需要確認）'}`;
    return `<div class="sop-rv">
      <div class="sop-rv-head">${head}${g.changes ? `<span class="sop-chg">${U(`改過答案共 ${g.changes} 次`, `Answers changed ${g.changes}×`)}</span>` : ''}${opt.teacher ? `<span class="sop-rv-auto">${auto}</span>` : ''}</div>
      <table class="sop-rv-t"><thead><tr><th>${U('步', 'Step')}</th><th>${U('標準答案', 'Standard answer')}${std.length ? `<div class="soft">${endOf(std)}</div>` : ''}</th><th>${opt.teacher ? U('專員', 'Agent') : U('你的作答', 'Your answer')}<div class="soft">${g.routeOk ? '' : endOf(mine)}</div></th></tr></thead><tbody>${rows}</tbody></table>
      ${acts || outside ? `<div class="sop-rv-sub">${U('操作比對', 'Action comparison')}<span class="sop-rv-legend"><i class="bad"></i>${U('錯', 'Wrong')}　<i class="chk"></i>${U('需確認', 'To review')}</span></div>${acts}${outside}` : ''}</div>`;
  }

  const sopPreviewKey = (md) => ({ route: md.answer || [], acts: md.acts || [], snap: md.snap || {}, stopAfter: agStopAfter(md), finals: {} });
  function sopAgentHtml(md, i, no) {
    let h = `<div class="mod qmod"><div class="mh">${no}. ${U('SOP 路徑', 'SOP path')}<span class="sp"></span><span class="pts">${ptsLabel(md)}</span></div>`;
    if (!md.start) return h + `<div class="hint">${U('這題沒有設定 SOP。', 'No SOP has been set for this question.')}</div></div>`;
    if (!EX) sopLoadList();
    if (A.submitted && EX && EX.reveal && md.keySop) h += sopReviewHtml(md.keySop, agSt(md), EX.sops);
    // 講師「專員預覽」交卷後：用題目本身的標準答案做同一份比對（含自動判定），講師試走就能看到會怎麼判（2026-11-21 Chris）
    if (A.submitted && !EX) h += sopReviewHtml(sopPreviewKey(md), agSt(md), SOPS, { teacher: true });
    const w = agWalk(md);
    if (w.end === 'loading') return h + `<div class="hint">${U('載入 SOP…', 'Loading SOP…')}</div></div>`;
    const st = agSt(md);
    if (!A.submitted) h += `<div class="hint">${U('照 SOP 一步步往下選，系統判斷的節點也要依案件資料自己選。選完可以回頭改（改答案會留下紀錄）。遇到要操作的節點，先點卡片上的按鈕，再到畫面底部的操作列完成操作。',
      'Follow the SOP step by step. For system nodes, choose the branch yourself based on the case details. You can go back and change an answer (changes are recorded). When a node needs an action, click the button on the card, then complete the action in the action bar at the bottom.')}</div>`;
    if (w.end) h += `<div class="sop-okbar">${w.node && w.node.type === 'stop' ? U('這一段作答完成', 'This section is complete') : U('已到終點', 'End of flow')}${A.submitted ? '' : U('（要改答案的話，點上面的節點重新選）', ' (to change an answer, click a node above and choose again)')}</div>`;
    const outside = (st.acts || []).filter((a) => !a.link);
    if (outside.length) h += `<div class="sop-outside"><b>${U('不是從 SOP 卡片按鈕開始的操作', 'Actions not started from an SOP card button')}</b>${outside.map((a) => actLine(md, a, i)).join('')}</div>`;
    return h + sopCardsHtml(md, i, null, w) + '</div>';
  }

  // 系統節點自動選擇（2026-11-21）：匯入時從 DMS /sop/query 存下案件處理時系統節點的判斷結果（private/raw 的 sopSys：{節點: 分支名稱}）
  //   講師走標準答案走到系統節點時，紀錄裡有就直接選好、往下走，標「依案件紀錄」；講師可以重選
  const stepOut = (x) => Object.assign({ n: x.n, pick: x.pick, clicked: x.clicked }, x.rec ? { rec: 1 } : {});
  function sopAutoSys(md) {
    const rec = (CUR && CUR.priv && CUR.priv.sopSys) || {};
    for (let g = 0; g < 60; g++) {
      const w = sopWalk(md);
      if (w.end || !w.node || w.node.type !== 'system' || !rec[w.cur]) return;
      const want = String(rec[w.cur]).trim();
      const k = (w.node.branches || []).findIndex((b) => String(b.label || (b.default ? 'Default' : '')).trim() === want);
      if (k < 0) return;
      md.answer = w.steps.map(stepOut).concat([{ n: w.cur, pick: k, rec: 1 }]);
    }
  }
  /** 講師設定這一段的結束點（nid 空白＝取消） */
  function sopStop(i, nid) {
    const md = C.modules[i];
    md.stop = nid || '';
    md.cur = null;
    saveCase(); renderSide(); sopScrollLast();
  }

  /** 選完一步後，把最新的卡片捲到看得到的地方 */
  function sopScrollLast() { setTimeout(() => { const el = document.querySelector('#cqQuizPane .sopi-last'); if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, 30); }
  function sopToggle(i, nid, v) { const id = C.modules[i].id; (SOP_OPEN[id] = SOP_OPEN[id] || {})[nid] = !!v; renderSide(); }
  function sopCopy(t) { try { navigator.clipboard.writeText(t); X.toast(U('已複製 ', 'Copied ') + t); } catch (_) { /* 複製失敗不影響 */ } }
  /** 在第 k 步選 opt：k 是已走過的步驟就像 DMS「重新選擇這個節點」，之後的節點一起更新 */
  function sopPickAt(i, k, opt) {
    const md = C.modules[i], sop = SOPS[md.taskbot];
    const w = sopWalk(md, sop);
    if (k < w.steps.length) {
      if (w.steps[k].pick === opt) return;
      if (k < w.steps.length - 1 || w.end) { if (!confirm(U('確定要重新選擇這個節點？之後的節點會一起更新。', 'Choose this node again? The nodes after it will be updated.'))) { renderSide(); return; } }
      md.answer = w.steps.slice(0, k).map(stepOut).concat([{ n: w.steps[k].n, pick: opt }]);
      md.acts = (md.acts || []).filter((a) => !a.link || a.link.k < k);      // 被重選掉的節點，它的操作紀錄一起拿掉
      md.stop = '';                                                          // 路線變了，結束點重設
    } else {
      md.answer = w.steps.map(stepOut).concat([{ n: w.cur, pick: opt }]);
    }
    md.cur = null; ACTIVE_SOP = md.id;
    delete SOP_OPEN[md.id]; sopAutoSys(md); sopSnap(md, sop); saveCase(); renderSide(); sopScrollLast();
  }

  /** 路線上每個節點出題當時的內容（之後 SOP 改版時逐一比對） */
  function sopSnap(md, sop) {
    const w = sopWalk(md, sop), snap = {};
    w.steps.forEach((x) => { snap[x.n] = x.node; });
    if (w.cur && w.node) snap[w.cur] = w.node;
    md.snap = snap; md.flowId = sop.flowId; md.version = sop.version || ''; md.sopName = sop.taskbotName || '';
    // 路線用到的每個 SOP 與版本（改版比對用）
    const flows = { [sop.taskbot]: sop.flowId };
    Object.keys(snap).forEach((nid) => { const tb = sopTbOf(nid); if (SOPS[tb]) flows[tb] = SOPS[tb].flowId; });
    md.flows = flows;
  }
  function sopSet(i, tb) {
    const md = C.modules[i];
    Object.assign(md, { taskbot: tb, sopName: '', flowId: '', version: '', start: '', answer: [], snap: {}, acts: [], cur: null });
    SOP_PICKSTART[md.id] = true; saveCase(); renderSide();
  }
  function sopReset(i) {
    if ((C.modules[i].answer || []).length && !confirm('更換 SOP 會清掉目前設定的路線，確定？')) return;
    sopSet(i, '');
  }
  function sopSearch(i, q) {
    const md = C.modules[i], box = document.getElementById('sopres-' + md.id);
    if (!box) return;
    const k = String(q || '').trim().toLowerCase();
    if (!k) { box.innerHTML = ''; box.classList.remove('on'); return; }
    box.classList.add('on');
    // 節點編號：215、node215、sop1_node215、sop1_f140_node215（DMS 卡片上的 ID）都可以；SOP1＝那個 SOP 的開頭
    const m = k.match(/^(?:(sop\d+)_(?:f\d+_)?)?(?:node)?(\d+)$/);
    const tbOnly = (k.match(/^(sop\d+)$/) || [])[1];
    const hits = [];
    Object.values(SOPS).forEach((sop) => {
      const tb = sop.taskbot.toLowerCase();
      if (tbOnly && tb === tbOnly && sop.nodes[sop.root]) hits.push({ sop, id: sop.root, score: 0, root: true });
      Object.entries(sop.nodes).forEach(([id, n]) => {
        if (n.type === 'judge' || n.type === 'end') return;            // 判決、結束節點不能當起點
        const num = (id.match(/_Node(\d+)$/i) || [])[1];
        if (m && num === m[2] && (!m[1] || m[1] === tb)) { hits.push({ sop, id, score: 1 }); return; }
        // 純數字也比對文字（例如 15天），但編號完全相同的排在最前面
        if ((!m || /^\d+$/.test(k)) && !tbOnly && ((n.name || '') + ' ' + (n.question || '')).toLowerCase().includes(k)) hits.push({ sop, id, score: 2 });
      });
    });
    hits.sort((a, b) => a.score - b.score);
    // 呈現方式照 DMS SOP Tool 的節點搜尋：上面是節點文字、下面「ID: SOPx_Fy_NodeZ」
    box.innerHTML = hits.length ? hits.slice(0, 40).map((x) => { const n = x.sop.nodes[x.id]; return `<div class="sop-hit" onclick="CQ.sopStart(${i},'${esc(x.id)}','${esc(x.sop.taskbot)}')">
        <div class="sop-hit-t">${x.root ? '（SOP 開頭）' : ''}${esc(sopNodeTitle(n))}</div>
        <div class="sop-hit-id">ID: <span>${esc(sopPointId(x.sop, x.id))}</span>　${esc(x.sop.taskbotName || '')}</div></div>`; }).join('')
      : `<div class="sop-hit-none">找不到符合的節點${SOP_LIST && Object.keys(SOPS).length < SOP_LIST.length ? '（SOP 還在載入，等一下再試）' : ''}</div>`;
  }
  function sopStart(i, nid, tb) {
    const md = C.modules[i];
    tb = tb || md.taskbot;
    const sop = SOPS[tb];
    if (!sop) return;
    if (md.start && (md.start !== nid || md.taskbot !== tb) && (md.answer || []).length && !confirm('更換起點會清掉目前設定的路線，確定？')) return;
    if (md.start !== nid || md.taskbot !== tb) { md.answer = []; md.acts = []; md.cur = null; md.stop = ''; }
    md.taskbot = tb; md.start = nid; delete SOP_PICKSTART[md.id];
    delete SOP_OPEN[md.id]; sopAutoSys(md); sopSnap(md, sop); saveCase(); renderSide(); sopScrollLast();
  }
  function sopPickStart(i) { SOP_PICKSTART[C.modules[i].id] = true; renderSide(); }
  function sopCancelStart(i) { delete SOP_PICKSTART[C.modules[i].id]; renderSide(); }
  function sopPick(i, k) {
    const md = C.modules[i], sop = SOPS[md.taskbot];
    const w = sopWalk(md, sop);
    md.answer = w.steps.map(stepOut).concat([{ n: w.cur, pick: k }]);   // 對不上的舊路線一併丟掉
    md.cur = null; ACTIVE_SOP = md.id;
    delete SOP_OPEN[md.id]; sopAutoSys(md); sopSnap(md, sop); saveCase(); renderSide(); sopScrollLast();
  }
  function sopBack(i, k) {
    const md = C.modules[i], sop = SOPS[md.taskbot];
    md.answer = (md.answer || []).slice(0, k);
    sopSnap(md, sop); saveCase(); renderSide();
  }

  // ===== 燈箱（滾輪縮放） =====
  function openLightbox(url, type, videoUrl, mk) {
    lbScale = 1;
    exMedia(mk, 0);
    const img = document.getElementById('cqLbImg');
    const old = document.getElementById('cqLbVideo');
    if (old) old.remove();
    if (type === 'video' && videoUrl) {
      // 有影片網址就直接播放（需要公司內網／VPN）
      img.style.display = 'none';
      img.insertAdjacentHTML('afterend', `<video id="cqLbVideo" controls autoplay src="${videoUrl}" data-mk="${esc(mk || '')}" style="max-width:92vw;max-height:84vh;background:#000"></video>`);
      document.getElementById('cqLbTip').textContent = '影片無法播放時，請確認已連上公司內網／VPN；點背景關閉';
    } else {
      img.style.display = '';
      img.src = url; img.style.transform = '';
      document.getElementById('cqLbTip').textContent = type === 'video'
        ? '影片：這段只有封面（沒有影片網址）'
        : '滾輪縮放，點背景關閉';
    }
    document.getElementById('cqLb').classList.add('on');
  }
  function closeLightbox(ev) {
    if (ev.target.id === 'cqLbImg' || ev.target.id === 'cqLbVideo') return;
    const v = document.getElementById('cqLbVideo');
    if (v) v.remove();
    document.getElementById('cqLb').classList.remove('on');
  }


  // ═════════════════════════════ 專員作答（DMS 考題測驗） ═════════════════════════════
  // 作答足跡 track：{ c: {案件序: { t 秒, b: {區塊: 秒}, s: {右側分頁: 秒}, p: {前幾次申退: 秒}, m: {媒體: [打開, 最高播放%, 播放秒]} } },
  //                   lv: [[離開時間點秒, 離開秒數]], ed: {'案件序:題': [作答時間點秒]}, ps: {'案件序:題': [貼上次數, 字數]} }
  let EX = null;
  const SAVE_MS = 30000;            // 自動儲存：有變動才存，最多 30 秒一次（切換案件、離開頁面、交卷時另外存）
  const hashStr = (s) => { let h = 5381; s = String(s || ''); for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(36); };
  const mediaKey = (m) => 'm' + hashStr(m.k || m.src || m.url || '');

  /** 案件裡所有照片、影片（算「打開 3 / 5」的分母）：{key, type, where} */
  function mediaOf(c) {
    const out = [], seen = new Set();
    const walk = (o, where) => {
      if (!o || typeof o !== 'object') return;
      if (Array.isArray(o)) { o.forEach((x) => walk(x, where)); return; }
      if ((o.type === 'image' || o.type === 'video') && typeof (o.src || o.url) === 'string' && (o.src || o.url)) {
        const k = mediaKey(o);
        if (!seen.has(k)) { seen.add(k); out.push({ key: k, type: o.type, where }); }
      }
      Object.keys(o).forEach((x) => { if (x !== 'src' && x !== 'url') walk(o[x], where); });
    };
    (c.blocks || []).forEach((b) => walk(b, b.title));
    walk(c.chat, 'Chat History');
    walk((c.drc || {}).buyer, 'Discuss 買家'); walk((c.drc || {}).seller, 'Discuss 賣家');
    walk(c.ops, 'Operation History');
    (c.modules || []).forEach((md) => (md.images || []).forEach((r) => { const k = mediaKey({ k: r }); if (!seen.has(k)) { seen.add(k); out.push({ key: k, type: 'image', where: '補充資訊' }); } }));
    (c.prev || []).forEach((p, i) => walk(p, (c.prev.length > 1 ? `前 ${i + 1} 次申退` : '前一次申退')));
    return out;
  }
  function normCase(c) {
    c.meta = Object.assign({ usage: 'exam', mask: { id: true, account: true }, accounts: { buyer: '***', seller: '***' } }, c.meta || {});
    c.meta.mask = Object.assign({ id: true, account: true }, c.meta.mask);
    c.blocks = c.blocks || []; c.modules = c.modules || []; c.ops = c.ops || []; c.chat = c.chat || []; c.drc = c.drc || { buyer: [], seller: [] };
    c.prev = (c.prev || []).map((p) => Object.assign({ blocks: [], ops: [], drc: { buyer: [], seller: [] } }, p));
    return c;
  }

  /** 作答畫面：d 來自 x_open / x_start（作答中）或 x_result（交卷後）；opt.result = 交卷後檢視 */
  function take(main, d, ctx, opt = {}) {
    X = ctx; CUR = null;
    const cases = (d.paper.cases || []).map((x) => normCase(JSON.parse(x.body)));
    if (d.key) (d.key.cases || []).forEach((kc, i) => (kc.mods || []).forEach((k) => {      // 公布後：把正解、參考答案、詳解放回題目
      const md = (cases[i] || { modules: [] }).modules.find((x) => x.id === k.id);
      if (md) Object.assign(md, { answer: k.answer, standard: k.standard, explain: k.explain }, k.sop ? { keySop: k.sop } : {});
    }));
    if (d.key) (d.key.cases || []).forEach((kc, i) => {       // 詳解、參考答案的英文（在解答卷，公布後才拿得到）
      let tx = {};
      try { tx = JSON.parse(kc.tx || '{}'); } catch (_) { /* 舊的解答卷沒有 */ }
      if (cases[i] && Object.keys(tx).length) cases[i].i18n = Object.assign({}, cases[i].i18n, { tx: Object.assign({}, (cases[i].i18n || {}).tx, tx) });
    });
    const readOnly = !!opt.result;
    if (EX && EX.tick) clearInterval(EX.tick);
    EX = { sid: d.session.sessionId, session: d.session, cases, idx: 0, readOnly, reveal: readOnly && !!d.key, result: d.result || null,
      ans: cases.map((_, i) => { const a = (d.answers || {})[i] || {}; return Object.assign(newAnswer(), { mc: a.mc || {}, short: a.short || {}, sop: sopAnsOut(a.sop), submitted: readOnly }); }),
      track: Object.assign({ c: {}, lv: [], ed: {}, ps: {} }, d.track || {}), sops: null,
      offset: (d.serverNow || Date.now()) - Date.now(), startedAt: (d.attempt || {}).startedAt || Date.now(), deadline: (d.attempt || {}).deadline || 0,
      dirtyAns: false, dirtyTrack: false, lastSave: Date.now(), saving: false, saveErr: '', awayAt: null, submitting: false };
    mode = 'agent'; sideTab = 'quiz'; VIEW = -1;
    main.classList.add('cq-full');
    main.innerHTML = `<div class="cq" id="cq">
      <div class="cq-bar" id="cqBar"></div>
      <div id="cqSettings"></div>
      <div id="cqViews"></div>
      <div class="wrap" id="cqWrap">
        <nav class="cq-nav" id="cqNav"></nav>
        <div class="main" id="cqMain"></div>
        <div class="side"><div class="ctabs" id="cqTabs"></div><div id="cqSide"></div></div>
      </div>
      <div class="cq-actbar" id="cqActs" style="display:none"></div>
      <div id="cqActModal"></div>
      <div id="cqWm"></div>
      <div id="cqLb" onclick="CQ.closeLightbox(event)"><img id="cqLbImg" alt=""><div class="tip" id="cqLbTip"></div></div>
      <div id="cqPop"></div></div>`;
    $('#cqLb').addEventListener('wheel', (e) => {
      e.preventDefault();
      lbScale = Math.min(5, Math.max(1, lbScale * (e.deltaY < 0 ? 1.15 : 0.87)));
      $('#cqLbImg').style.transform = `scale(${lbScale})`;
    }, { passive: false });
    ACTIVE_SOP = ''; ACT_HINT = ''; ACT_MODAL = null;
    // SOP 路徑題組：讀發佈時做的專員版（載完重畫）
    if (cases.some((c) => c.modules.some((m) => m.type === 'sop'))) {
      const ex = EX;
      X.api('x_sops', { sessionId: ex.sid }).then((r) => { ex.sops = r.sops || {}; }).catch((e) => { ex.sops = {}; X.toast(U('讀取 SOP 失敗：', 'Failed to load SOP: ') + e.message, 6000); })
        .then(() => { if (EX === ex && $('#cq')) { renderSide(); exBar(); } });
    }
    exShow(0);
    if (!readOnly) {
      EX.tick = setInterval(exTick, 1000);
      X.setLeaveGuard(() => { exSave(true); return true; });
    }
  }
  // SOP 作答存成 JSON 字串（db.js xSopAnsIn），讀回來時轉回物件
  const sopAnsOut = (v) => Object.fromEntries(Object.entries(v || {}).map(([k, x]) => { if (typeof x === 'string') { try { x = JSON.parse(x); } catch (_) { x = {}; } } return [k, Object.assign({ route: [], acts: [], cur: null, actSeq: 0 }, x)]; }));
  const exNowSec = () => Math.max(0, Math.round((Date.now() + EX.offset - EX.startedAt) / 1000));
  const exCase = () => {
    const c = EX.track.c[EX.idx] || (EX.track.c[EX.idx] = {});
    ['b', 's', 'p', 'm'].forEach((k) => { if (!c[k]) c[k] = {}; });
    if (!c.t) c.t = 0;
    return c;
  };
  function exShow(i) {
    EX.idx = i; MAIN = C = EX.cases[i]; VIEW = -1; A = EX.ans[i]; sideDrawn = '';
    renderAll();
    window.scrollTo({ top: 0 });
  }
  function exSwitch(i) {
    if (!EX || i === EX.idx) return;
    if (!EX.readOnly) exSave(true);
    exShow(i);
  }
  const answeredAll = (i) => EX.cases[i].modules.every((m) => (m.type === 'mc' ? mcPicks(EX.ans[i].mc[m.id]).length > 0 : m.type === 'short' ? String(EX.ans[i].short[m.id] || '').trim()
    : m.type === 'sop' ? !EX.sops || !m.start || !!agWalk(m, agSt(m, EX.ans[i])).end : true));
  function exBar() {
    const s = EX.session, left = EX.deadline ? Math.max(0, EX.deadline - (Date.now() + EX.offset)) : 0;
    const mm = Math.floor(left / 60000), ss = Math.floor((left % 60000) / 1000);
    const sv = EX.saveErr ? `<span class="sv err">${esc(EX.saveErr.slice(0, 40))}</span>` : EX.saving ? `<span class="sv">${U('儲存中…', 'Saving…')}</span>`
      : `<span class="sv">${U('已自動儲存', 'Saved')} ${new Date(EX.lastSave).toLocaleTimeString('sv-SE').slice(0, 5)}</span>`;
    $('#cqBar').innerHTML = `<a class="cbtn" href="${X.me.isTeacher ? '#/mine' : '#/'}">← ${U('我的測驗', 'My quizzes')}</a><span class="cid">${esc(s.sessionId)}</span><b>${esc(s.title)}</b>
      <span class="chipc ${EX.readOnly ? 'ok' : ''}">${s.mode === 'practice' ? U('練習', 'Practice') : U('考試', 'Exam')}${EX.readOnly ? U('・已交卷', ' · Submitted') : ''}</span>
      <span class="exnav">${EX.cases.map((_, i) => `<button class="${i === EX.idx ? 'on' : ''}" onclick="CQ.exCase(${i})">${U('案件', 'Case')} ${i + 1}${!EX.readOnly && answeredAll(i) ? ' ✓' : ''}</button>`).join('')}</span>
      <span style="flex:1"></span>
      ${EX.readOnly ? (EX.result ? `<span class="exscore">${U('成績', 'Score')} <b>${EX.result.score}</b> / ${EX.result.total}</span>` : '')
        : `${sv}<span class="extimer ${left < 300000 ? 'warn' : ''}" id="cqTimer">${U('剩餘', 'Time left')} ${mm}:${String(ss).padStart(2, '0')}</span>
           <button class="cbtn ok" onclick="CQ.exSubmit()">${U('交卷', 'Submit')}</button>`}`;
  }
  function exNotice(box) {
    box.className = 'pv';
    const s = EX.session;
    box.innerHTML = EX.readOnly
      ? `<span>${EX.reveal ? U('已顯示正解與詳解。', 'Answers and explanations are shown.') : s.mode === 'practice' ? U('講師公布解答後，這裡會顯示正解與詳解。', 'Answers and explanations will appear here after the trainer releases them.') : U('講師公布成績後，這裡會顯示分數與正解。', 'Your score and the answers will appear here after the trainer releases the results.')}</span>`
      : `<span>${U('作答過程會記錄：瀏覽的區塊與分頁、開啟的照片與影片、離開考試頁面的時間（講師看得到）。作答會自動儲存。', 'Your activity is recorded: sections and tabs you view, photos and videos you open, and time spent away from the quiz page (visible to the trainer). Answers are saved automatically.')}</span>`;
  }
  function exResultHtml() {
    if (!EX.readOnly) return '';
    if (!EX.reveal) return `<div class="cres"><div>${U('已交卷', 'Submitted')}</div><div class="hint">${EX.session.mode === 'practice' ? U('等講師公布解答', 'Waiting for the trainer to release the answers') : U('等講師公布成績', 'Waiting for the trainer to release the results')}</div></div>`;
    // 逐題判定，所有題型共用 db.js 的 qRight（2026-11-21：原本只算單選，只有 SOP 題時顯示 0 / 0）
    const DB = window.RRQP_DB, det = (EX.result && EX.result.detail) || {}, qs = C.modules.filter((m) => ['mc', 'sop', 'short'].includes(m.type));
    let ok = 0, n = 0, wait = 0;
    qs.forEach((m) => {
      const km = Object.assign({}, m, { sop: m.keySop }), a = { mc: A.mc, sop: { [m.id]: m.type === 'sop' ? agSt(m) : null } };
      const g = det[EX.idx + ':' + m.id], sc = g === null || g === undefined ? undefined : g;
      const v = DB && DB.qRight ? DB.qRight(km, a, m.type === 'mc' ? undefined : sc) : null;
      if (v === null) wait++; else { n++; if (v) ok++; }
    });
    return `<div class="cres">${n ? `<div>${U('這個案件答對', 'Correct in this case:')} <b class="big">${ok}</b> / ${n} ${U('題', '')}</div>` : ''}
      ${wait ? `<div class="hint">${U(`${wait} 題沒有自動判定`, `${wait} not auto-graded`)}${qs.some((m) => m.type === 'short') ? U('（簡答題請對照下方的參考答案）', ' (compare your short answers with the reference answers below)') : ''}</div>` : ''}
      ${qs.some((m) => m.type === 'sop') ? `<div class="hint">${U('SOP 題請看下方的比對：標準答案和你的作答逐步並排，紅底是開始走錯的那一步。', 'For SOP questions, see the comparison below: the standard answer and your answer side by side; the red row is where your route first differs.')}</div>` : ''}</div>`;
  }
  function exShortScore(md) {
    if (!EX || !EX.result || !EX.result.detail) return '';
    const v = EX.result.detail[EX.idx + ':' + md.id];
    return v === null || v === undefined ? '' : `<div class="hint">${U('得分', 'Score')} ${v} / ${md.points}</div>`;
  }

  // ── 足跡 ──
  function exTick() {
    if (EX && !$('#cq')) { clearInterval(EX.tick); const ex = EX; exSave(true).finally(() => { if (EX === ex) EX = null; }); return; }
    if (!EX || EX.readOnly) return;
    const nowS = exNowSec();
    const away = document.hidden || !document.hasFocus();
    if (away) { if (EX.awayAt === null) { EX.awayAt = nowS; exSave(true); } }
    else {
      if (EX.awayAt !== null) {
        const dur = nowS - EX.awayAt;
        if (dur >= 2 && EX.track.lv.length < 200) EX.track.lv.push([EX.awayAt, dur]);
        EX.awayAt = null;
      }
      const tc = exCase();
      tc.t++;
      if (VIEW >= 0) tc.p[VIEW] = (tc.p[VIEW] || 0) + 1;
      else {
        const top = cqTop(), h = window.innerHeight;
        $$('#cqMain .blk').forEach((el) => {
          const r = el.getBoundingClientRect(), vis = Math.min(r.bottom, h) - Math.max(r.top, top);
          if (vis >= Math.min(150, r.height * 0.5)) { const id = el.id.slice(4); tc.b[id] = (tc.b[id] || 0) + 1; }
        });
      }
      const tab = sideTab === 'drc' ? 'drc-' + drcRoom : sideTab;
      tc.s[tab] = (tc.s[tab] || 0) + 1;
      EX.dirtyTrack = true;
    }
    // 計時：到時間先問伺服器（講師可能延長了作答時間或幫你加時），真的到了才自動交卷
    if (EX.deadline && Date.now() + EX.offset >= EX.deadline) { exDeadline(); return; }
    const tm = $('#cqTimer');
    if (tm) {
      const left = Math.max(0, EX.deadline - (Date.now() + EX.offset));
      tm.textContent = `${U('剩餘', 'Time left')} ${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}`;
      tm.classList.toggle('warn', left < 300000);
    }
    if ((EX.dirtyAns || EX.dirtyTrack) && Date.now() - EX.lastSave >= SAVE_MS) exSave();
    if (nowS % 60 === 0) X.api('x_status', { sessionId: EX.sid }).then(exSync).catch(() => {});
  }
  /** 伺服器的最新狀態：截止時間可能被延長；講師提前結束就自動交卷 */
  function exSync(r) {
    if (!EX || EX.readOnly) return;
    EX.offset = r.serverNow - Date.now();
    if (r.attempt.status === 'in_progress' && r.attempt.deadline) {
      if (r.attempt.deadline > EX.deadline + 1000) X.toast(U('作答時間已延長', 'Your time has been extended'), 4000);
      EX.deadline = r.attempt.deadline;
    }
    if (r.state === 'closed' && r.attempt.status === 'in_progress') exSubmit(true);     // 講師提前結束
  }
  async function exDeadline() {
    if (EX.checking) return;
    EX.checking = true;
    try {
      const r = await X.api('x_status', { sessionId: EX.sid });
      EX.checking = false;
      if (r.attempt.status === 'in_progress' && r.attempt.deadline > r.serverNow + 2000) { exSync(r); return; }
    } catch (_) { EX.checking = false; }
    exSubmit(true);
  }
  function exEdit(id) {
    if (!EX || EX.readOnly) return;
    const k = EX.idx + ':' + id, list = EX.track.ed[k] || (EX.track.ed[k] = []), t = exNowSec();
    if (!list.length || t - list[list.length - 1] >= 10) { if (list.length < 30) list.push(t); else list[29] = t; }
  }
  function exPaste(id, ev) {
    if (!EX || EX.readOnly) return;
    const txt = (ev.clipboardData || window.clipboardData).getData('text') || '';
    const k = EX.idx + ':' + id, p = EX.track.ps[k] || (EX.track.ps[k] = [0, 0]);
    p[0]++; p[1] += txt.length; EX.dirtyTrack = true;
  }
  /** 照片、影片：打開記 1；影片另外記最高播放百分比與播放秒數 */
  function exMedia(mk, pct, secs) {
    if (!EX || EX.readOnly || !mk) return;
    const tc = exCase(), m = tc.m[mk] || (tc.m[mk] = [0, 0, 0]);
    m[0] = 1;
    if (pct) m[1] = Math.max(m[1], Math.min(100, Math.round(pct)));
    if (secs) m[2] += secs;
    EX.dirtyTrack = true;
  }
  const vidLast = new WeakMap();
  document.addEventListener('timeupdate', (e) => {
    const v = e.target, mk = v && v.dataset && v.dataset.mk;
    if (!EX || !mk || !v.duration) return;
    const last = vidLast.get(v) || 0, d = v.currentTime - last;
    vidLast.set(v, v.currentTime);
    exMedia(mk, (v.currentTime / v.duration) * 100, d > 0 && d < 2 ? d : 0);
  }, true);
  document.addEventListener('play', (e) => { const mk = e.target && e.target.dataset && e.target.dataset.mk; if (mk) exMedia(mk, 0); }, true);
  document.addEventListener('visibilitychange', () => { if (document.hidden && EX && !EX.readOnly) exSave(true); });

  const exAnswersOut = () => { const o = {}; EX.ans.forEach((a, i) => { o[i] = { mc: a.mc, short: a.short, sop: a.sop || {} }; }); return o; };
  function exTrackOut() {   // 播放秒數四捨五入，資料小一點
    const t = JSON.parse(JSON.stringify(EX.track));
    Object.values(t.c || {}).forEach((c) => Object.values(c.m || {}).forEach((m) => { m[2] = Math.round(m[2]); }));
    return t;
  }
  async function exSave(force) {
    if (!EX || EX.readOnly || EX.saving || EX.submitting) return;
    if (!force && !(EX.dirtyAns || EX.dirtyTrack)) return;
    const ex = EX;            // 儲存途中換頁時 EX 會被清成 null，後面一律用這份
    ex.saving = true; ex.dirtyAns = false; ex.dirtyTrack = false;
    try { await X.api('x_save', { sessionId: ex.sid, answers: exAnswersOut(), track: exTrackOut() }); ex.lastSave = Date.now(); ex.saveErr = ''; }
    catch (e) { ex.dirtyAns = true; ex.saveErr = e.message || String(e); }
    ex.saving = false;
    if ($('#cqBar') && EX === ex) exBar();
  }
  async function exSubmit(auto) {
    if (!EX || EX.readOnly || EX.submitting) return;
    if (!auto) {
      const miss = EX.cases.map((_, i) => i).filter((i) => !answeredAll(i)).map((i) => U('案件 ', 'Case ') + (i + 1));
      if (!confirm((miss.length ? U(`還有沒作答完的題目：${miss.join('、')}\n`, `Unanswered questions remain: ${miss.join(', ')}\n`) : '') + U('確定交卷？交卷後不能再修改。', 'Submit now? You cannot change your answers after submitting.'))) return;
    }
    EX.submitting = true;
    clearInterval(EX.tick);
    try {
      await X.api('x_submit', { sessionId: EX.sid, answers: exAnswersOut(), track: exTrackOut(), auto: !!auto });
    } catch (e) {
      EX.submitting = false;
      if (!/已交卷|closed|window/i.test(e.message)) { EX.tick = setInterval(exTick, 1000); X.toast(U('交卷失敗：', 'Submit failed: ') + e.message, 6000); return; }
    }
    X.setLeaveGuard(null);
    X.toast(auto ? U('時間到，已自動交卷', "Time's up. Your answers were submitted automatically.") : U('已交卷', 'Submitted'));
    const sid = EX.sid;
    try { take(document.getElementById('main'), await X.api('x_result', { sessionId: sid }), X, { result: true }); }
    catch (e) { location.hash = X.me.isTeacher ? '#/mine' : '#/'; }
  }

  // ═════════════════════════════ 講師看作答足跡 ═════════════════════════════
  const BLOCK_NAME = (c, id) => ((c.blocks || []).find((b) => b.id === id) || {}).title || id;
  const TAB_NAME = { quiz: '考題', ops: 'Operation History', chat: 'Chat History', 'drc-buyer': 'Discuss 買家', 'drc-seller': 'Discuss 賣家' };
  const fmtS = (s) => (s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `0:${String(s).padStart(2, '0')}`);
  /** 單一專員、單一案件的足跡卡：paperCase＝專員版案件 JSON、track＝整份作答的足跡、i＝案件序、ans＝這個案件的作答、keyCase＝解答 */
  function footprint(paperCase, track, i, ans, keyCase) {
    const c = normCase(JSON.parse(JSON.stringify(paperCase))), t = (track && track.c && track.c[i]) || {};
    const b = t.b || {}, sTab = t.s || {}, pv = t.p || {}, md = t.m || {};
    const media = mediaOf(c), imgs = media.filter((x) => x.type === 'image'), vids = media.filter((x) => x.type === 'video');
    const opened = (x) => md[x.key] && md[x.key][0];
    const chip = (label, sec) => `<span class="fpc ${sec >= 2 ? 'ok' : ''}">${esc(label)} ${sec >= 2 ? fmtS(sec) : '沒看'}</span>`;
    const blocks = c.blocks.map((x) => chip(x.title, b[x.id] || 0)).join('');
    const tabs = ['ops', 'chat', 'drc-buyer', 'drc-seller'].map((k) => chip(TAB_NAME[k], sTab[k] || 0)).join('')
      + c.prev.map((_, j) => chip(c.prev.length > 1 ? `前 ${j + 1} 次申退` : '前一次申退', pv[j] || 0)).join('');
    // 影片：打開過的逐段列；沒打開的依位置合併成一行
    const notOpen = {};
    vids.filter((v) => !md[v.key]).forEach((v) => { notOpen[v.where] = (notOpen[v.where] || 0) + 1; });
    const vidRows = vids.filter((v) => md[v.key]).map((v) => { const m = md[v.key]; return `<li>${esc(v.where)}：${m[1] >= 80 ? `看完（${m[1]}%）` : `看了 ${m[1]}%`}</li>`; }).join('')
      + (Object.keys(notOpen).length ? `<li class="soft">沒打開：${Object.entries(notOpen).map(([w, n]) => `${esc(w)} ${n} 段`).join('、')}</li>` : '');
    const flags = window.RRQP_DB && window.RRQP_DB.xFlags ? window.RRQP_DB.xFlags(track, i, ans, keyCase) : [];   // 需要留意（和成績頁、匯出共用）
    return `<div class="fp">
      <div class="fpm"><div><b>${fmtS(t.t || 0)}</b><span>這個案件花的時間</span></div>
        <div><b>${imgs.filter(opened).length} / ${imgs.length}</b><span>照片打開</span></div>
        <div><b>${vids.filter(opened).length} / ${vids.length}</b><span>影片打開</span></div></div>
      ${flags.length ? `<div class="fpflag">需要留意：${flags.map(esc).join('；')}</div>` : ''}
      <div class="fpl">中間的 DMS 區塊</div><div class="fpr">${blocks}</div>
      <div class="fpl">右側分頁</div><div class="fpr">${tabs}</div>
      ${vids.length ? `<div class="fpl">影片</div><ul class="fpv">${vidRows}</ul>` : ''}</div>`;
  }
  /** 整份作答：離開頁面摘要 */
  function leaveSummary(track) {
    const lv = (track && track.lv) || [];
    return lv.length ? `離開頁面 ${lv.length} 次，共 ${fmtS(lv.reduce((n, x) => n + x[1], 0))}` : '沒有離開頁面';
  }

  // ===== 浮水印：登入者 email＋時間 =====
  function renderWatermark() {
    const now = new Date().toLocaleString('sv-SE').slice(0, 16);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="460" height="230"><g transform="rotate(-20 230 115)" font-family="Arial" font-size="15" fill="#000">
      <text x="30" y="104">${esc(X.me.email)}/${now}</text><text x="70" y="130">CONFIDENTIAL © SEA LIMITED</text></g></svg>`;
    $('#cqWm').style.background = `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
  }

  // ===== 全域事件：只在案件頁有作用 =====
  window.addEventListener('scroll', () => { if ($('#cqNav')) markNav(); }, { passive: true });
  window.addEventListener('resize', () => { if ($('#cq')) layout(); });
  document.addEventListener('click', (e) => {
    const pop = $('#cqPop');
    if (pop && pop.classList.contains('on') && !pop.contains(e.target)) pop.classList.remove('on');
  });
  document.addEventListener('focusout', (e) => { if ($('#cq') && isEdit()) onFocusOut(e); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('#cqLb')) $('#cqLb').classList.remove('on'); });
  window.addEventListener('beforeunload', (e) => { if ($('#cq') && (dirty || saving)) { e.preventDefault(); e.returnValue = ''; } });

  // ===== 畫面按鈕呼叫的函式 =====
  window.CQ = {
    txOrig(a) { const src = a.previousElementSibling; src.hidden = !src.hidden; a.textContent = src.hidden ? 'Show Original' : 'Hide Original'; },
    dtToggle: (k, v) => { OPEN[k] = v; }, toggleCls, msOpen, piiNext, leakNext, impToggle, sopSet, sopReset, sopSearch, sopStart, sopPickStart, sopCancelStart, sopPick, sopBack, sopPickAt, sopToggle, sopCopy, sopBtn, agPick, agBtn, sopStop, actDel, actOpen, actSet, fraudUser, actItem, actItemAdd, actItemDel, actClose, actConfirm, view: setView, setMode, setTitle, setMeta, setMask, saveNow, approve, unapprove, copy, del, evenPct,
    jumpTo, toggleNav: () => { navClosed = !navClosed; renderNav(); layout(); },
    tab: (t) => { sideTab = t; renderSide(); }, room: (r) => { drcRoom = r; renderSide(); }, filter: (f) => { opFilter = f; renderSide(); },
    addField, delTl, cutTl, addTl, delMedia, showFieldPop, editTags, toggleHidden, delField, openLightbox, closeLightbox,
    delRow, showTrack, delCardRow, delMsg, cutAfter, toggleOp, delOp, cutOp, delOpMedia,
    pickMc, togAns, applySet, undo, redo, moreToggle, copyRid, setToggle, alertOpen, alertStep, alertClose, shortAns: (id, v) => { A.short[id] = v; exEdit(id); saveAnswer(); }, submitAnswer, retry,
    paste: (id, ev) => exPaste(id, ev), exCase: (i) => exSwitch(i), exSubmit: () => exSubmit(false),
    addMod, moveMod, delMod, setMod, cycleTag, setOpt, addOpt, delOpt, delImg, pickImg, pasteImg,
  };

  // ===== 入口（app.js 的 route 呼叫） =====
  function route(page, arg, ctx) {
    X = ctx;
    return viewCase(arg);
  }
  // 網站切換語言時：作答中只重畫 DMS 畫面（app.js 的 setLang 會先問 examActive）
  const examActive = () => !!(EX && !EX.readOnly && $('#cq'));
  window.RRQP_CASES = { langChip, route, list, take, footprint, leaveSummary, mediaOf, examActive, relang: () => renderAll(), sopReview: (k, a, pool) => sopReviewHtml(k, a, pool, { teacher: true }) };
})();
