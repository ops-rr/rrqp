/* RR AI Quiz Platform — V3 DMS 考題：案件清單與案件編輯（#/case/Cxxx）
 * 清單畫在「案件匯入 → 待審 DMS 考題」與「可用題庫 → DMS 考題」：app.js 呼叫 window.RRQP_CASES.list(box, status, ctx)；
 * 編輯頁：app.js 的 route() 呼叫 window.RRQP_CASES.route('case', caseId, ctx)。資料一律走 db.js 的 api（c_* 動作）。
 * 案件編輯的畫面沿用 dev/case-quiz 原型：中間 DMS 區塊、右側 考題／Operation History／Chat History／Discuss。
 * 畫面上的按鈕呼叫 window.CQ.xxx(...)。
 */
(() => {
  'use strict';

  let X = null;          // app.js 傳進來的共用工具：me、api、shell、toast、confirmBox、setLeaveGuard、setLive、DB
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const LETTERS = 'ABCDEFGH';

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
  const isEdit = () => mode === 'edit' && !!(CUR && CUR.canEdit);
  const fmtTime = (ms) => (ms ? new Date(ms).toLocaleString('sv-SE').slice(0, 16) : '-');

  // 黏在上方的高度：V2 頂部列＋案件工具列（左側導覽、右側面板從這裡開始）
  function cqTop() {
    const h = $('header.top'), bar = $('#cqBar');
    return (h ? h.offsetHeight : 0) + (bar ? bar.offsetHeight : 0);
  }
  function layout() {
    const root = $('#cq');
    if (!root) return;
    const h = $('header.top');
    root.style.setProperty('--cqH', (h ? h.offsetHeight : 0) + 'px');
    root.style.setProperty('--cqTop', (cqTop() + 12) + 'px');
  }

  // ═════════════════════════════ 案件清單 ═════════════════════════════
  const STATUS = { pending: '待審', approved: '已核准' };
  const filt = { tab: 'pending', q: '', usage: '', kind: '', id: '' };     // kind：group / topic / tag
  const backOf = (status) => (status === 'approved' ? '#/bank?tab=cases' : '#/library?tab=cases');
  const L = (n) => (n && typeof n === 'object' ? n.zh || n.en || '' : String(n || ''));

  /** 案件清單畫進 box：status = pending（案件匯入 → 待審 DMS 考題）或 approved（可用題庫 → DMS 考題） */
  async function list(box, status, ctx) {
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
    if ($('#cqNP')) $('#cqNP').textContent = pend.length ? `(${pend.length})` : '';
    if ($('#cqNA')) $('#cqNA').textContent = appr.length ? `(${appr.length})` : '';
    const all = filt.tab === 'approved' ? appr : pend;
    if (!box || !document.body.contains(box)) return;
    if (!all.length) {
      box.innerHTML = `<div class="card empty-state">${filt.tab === 'approved' ? '還沒有核准的 DMS 考題' : '沒有待審的 DMS 考題。到「申請匯入」勾選「DMS 考題」申請。'}</div>`;
      return;
    }
    const gName = (id) => (d.groups.find((x) => x.id === id) || {}).name || id;
    const tpName = (id) => L((d.topics.find((x) => x.topicId === id) || {}).name) || id;
    const tgName = (id) => L((d.tags.find((x) => x.tagId === id) || {}).name) || id;
    box.innerHTML = `<div class="lib-grid"><aside class="card lib-side" id="cqSideF"></aside>
      <div class="lib-main"><div class="cql-filter">
        <input type="search" id="cqQ" placeholder="搜尋案件編號、標題、Return ID、講師" value="${esc(filt.q)}">
        <select id="cqU"><option value="">練習＋考試</option><option value="practice" ${filt.usage === 'practice' ? 'selected' : ''}>練習用</option><option value="exam" ${filt.usage === 'exam' ? 'selected' : ''}>考試用</option></select>
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
      const list = all.filter((c) => inF(c) && (!filt.usage || c.usage === filt.usage)
        && (!q || [c.caseId, c.title, c.returnId, c.updatedBy, c.approvedBy, c.requestedBy].join(' ').toLowerCase().includes(q)));
      $('#cqC').textContent = `${list.length} / ${all.length} 筆`;
      $('#cqRows').innerHTML = !list.length ? '<div class="card empty-state">沒有符合的案件</div>' : `<div class="card scroll-x"><table class="list"><thead><tr>
          <th>案件</th><th>標題</th><th>分類</th><th>用途</th><th>作答題</th>${d.canEdit ? '<th>Return ID</th>' : ''}${pend ? '<th>匯入提醒</th>' : ''}<th>最後修改</th>${pend ? '<th>狀態</th>' : ''}</tr></thead><tbody>
        ${list.map((c) => `<tr class="click" data-id="${esc(c.caseId)}"><td class="mono">${esc(c.caseId)}</td>
          <td>${c.title ? esc(c.title) : '<span class="soft">（未命名）</span>'}${c.twOnly ? ' <span class="chip">只限 TW</span>' : ''}</td>
          <td class="small">${(c.groups || []).map((x) => `<span class="chip">${esc(gName(x))}</span>`).join(' ')}
            <div class="soft">${(c.topics || []).map(tpName).concat((c.tags || []).map(tgName)).map(esc).join('、')}</div></td>
          <td>${c.usage === 'exam' ? '考試' : '練習'}</td><td>${c.questions} 題／${c.points} 分</td>
          ${d.canEdit ? `<td class="mono small">${esc(c.returnId || '-')}</td>` : ''}
          ${pend ? `<td>${c.notes ? `<span class="chip warn">${c.notes}</span>` : '-'}</td>` : ''}
          <td class="small">${esc(fmtTime(c.updatedAt))}<div class="soft">${esc(c.updatedBy || '')}</div></td>
          ${pend ? `<td><span class="chip ${c.status === 'approved' ? 'ok' : 'warn'}">${STATUS[c.status] || c.status}</span></td>` : ''}</tr>`).join('')}
        </tbody></table></div>`;
      $$('#cqRows tr[data-id]').forEach((tr) => tr.addEventListener('click', () => { location.hash = '#/case/' + encodeURIComponent(tr.dataset.id); }));
    };
    $('#cqQ').oninput = (e) => { filt.q = e.target.value; draw(); };
    $('#cqU').onchange = (e) => { filt.usage = e.target.value; draw(); };
    drawSide();
    draw();
  }

  // ═════════════════════════════ 案件編輯 ═════════════════════════════
  async function viewCase(id) {
    let main = X.shell(X.me.role === 'tw' ? 'library' : 'bank', '<div class="empty-state"><span class="spin"></span> 讀取案件…</div>');
    let d;
    try { d = await X.api('c_get', { caseId: id }); } catch (e) { X.showError(e, main); return; }
    if (d.status === 'approved' || X.me.role !== 'tw') main = X.shell('bank', '');      // 導覽列亮在案件所在的頁面
    CUR = { caseId: d.caseId, status: d.status, title: d.title, rev: d.rev, notes: d.notes, priv: d.private || {}, canEdit: d.canEdit, canDelete: d.canDelete,
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
    C.ops = C.ops || []; C.chat = C.chat || []; C.drc = C.drc || { buyer: [], seller: [] };
    C.prev = (C.prev || []).map((p) => Object.assign({ blocks: [], ops: [], drc: { buyer: [], seller: [] } }, p));
    MAIN = C; VIEW = -1;
    A = newAnswer();
    mode = CUR.canEdit ? 'edit' : 'agent';
    sideTab = 'quiz'; dirty = false; saving = false; saveErr = '';
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
  function renderBar() {
    const st = CUR.status === 'approved';
    const sv = saveErr ? `<span class="sv err" title="${esc(saveErr)}">⚠ 儲存失敗：${esc(saveErr.slice(0, 60))} ${/剛修改過/.test(saveErr) ? '<button class="cbtn" onclick="location.reload()">重新整理（放棄這次修改）</button>' : '<button class="cbtn" onclick="CQ.saveNow()">重試</button>'}</span>`
      : saving ? '<span class="sv">儲存中…</span>'
      : dirty ? '<span class="sv dirty">有修改，稍後自動儲存</span>'
      : `<span class="sv">已儲存 ${esc(fmtTime(CUR.updatedAt))}</span>`;
    $('#cqBar').innerHTML = `<a class="cbtn" href="${backOf(CUR.status)}">← ${st ? '可用題庫' : '待審 DMS 考題'}</a>
      <span class="cid">${esc(CUR.caseId)}</span><span class="chipc ${st ? 'ok' : ''}">${STATUS[CUR.status] || esc(CUR.status)}</span>
      ${CUR.canEdit ? `<input type="text" class="ttl" id="cqTitle" placeholder="案件標題（專員看不到；例如：商品瑕疵＋賣家聊聊承諾補寄）" value="${esc(CUR.title)}" onchange="CQ.setTitle(this.value)">`
        : `<b style="flex:1">${esc(CUR.title || '（未命名）')}</b>`}
      ${CUR.canEdit ? `<span class="seg"><button class="${isEdit() ? 'on' : ''}" onclick="CQ.setMode('edit')">講師編輯</button><button class="${!isEdit() ? 'on' : ''}" onclick="CQ.setMode('agent')">專員預覽</button></span>` : ''}
      <span style="flex:1"></span>
      ${CUR.canEdit ? sv : ''}
      ${CUR.canEdit ? (st ? '<button class="cbtn" onclick="CQ.unapprove()">退回待審</button>' : '<button class="cbtn ok" onclick="CQ.approve()">核准</button>') : ''}
      ${CUR.canDelete ? '<button class="cbtn del" onclick="CQ.del()">刪除</button>' : ''}`;
  }

  // ───────── 本次／前幾次申退切換（方案 A：整頁切換，考題固定在右側） ─────────
  function prevLabel(i) {
    const name = MAIN.prev.length === 1 ? '前一次申退' : `前 ${i + 1} 次申退`;
    const rid = MAIN.prev[i].rid;
    const showRid = isEdit() ? rid : (MAIN.meta.mask.id ? '***' : rid);
    return name + (showRid ? `（${esc(showRid)}）` : '');
  }
  function renderViews() {
    const box = $('#cqViews');
    if (!MAIN.prev.length) { box.innerHTML = ''; box.className = ''; return; }
    box.className = 'views' + (VIEW >= 0 ? ' prev' : '');
    box.innerHTML = `<button class="${VIEW < 0 ? 'on' : ''}" onclick="CQ.view(-1)">本次申退</button>
      ${MAIN.prev.map((p, i) => `<button class="${VIEW === i ? 'on' : ''}" onclick="CQ.view(${i})">${prevLabel(i)}</button>`).join('')}
      <span class="hint">${VIEW >= 0 ? '正在看前一次申退的資料；右側「考題」仍是本次案件的題目' : '可以切換查看同一筆訂單之前的申退'}</span>`;
    $('#cqWrap').classList.toggle('prev', VIEW >= 0);
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

  // ───────── 講師設定列：用途、時間、遮蔽、Return ID、匯入提醒、核准前檢查 ─────────
  function renderSettings() {
    const box = $('#cqSettings');
    if (!isEdit()) {
      box.className = 'pv';
      box.innerHTML = `<span>${CUR.canEdit ? '專員預覽：已套用遮蔽與隱藏，畫面和專員作答時相同。' : '只有 TW 講師可以編輯案件；這裡是專員看到的畫面。'}作答不會記錄。</span>
        <span style="flex:1"></span>${A.submitted ? '<button onclick="CQ.retry()">重新作答</button>' : '<button class="solid" onclick="CQ.submitAnswer()">交卷看結果</button>'}`;
      return;
    }
    box.className = '';
    const m = C.meta;
    const chk = (X.DB().caseCheck || (() => ({ errors: [], warns: [] })))(MAIN, CUR.title);
    const leaks = findLeaks();
    const prev = (CUR.priv.prevIds || []).join(', ');
    box.innerHTML = `
      <span class="rid">Return ID：${esc(m.rid || '-')}${prev ? `（前幾次申退：${esc(prev)}）` : ''}</span>
      <label>用途 <select style="width:auto" onchange="CQ.setMeta('usage',this.value)">
        <option value="practice" ${m.usage === 'practice' ? 'selected' : ''}>練習用</option>
        <option value="exam" ${m.usage === 'exam' ? 'selected' : ''}>考試用</option></select></label>
      <label><input type="checkbox" ${m.twOnly ? 'checked' : ''} onchange="CQ.setMeta('twOnly',this.checked)"> 只限 TW（不送翻譯）</label>
      <label><input type="checkbox" ${m.mask.id ? 'checked' : ''} onchange="CQ.setMask('id',this.checked)"> 遮蔽編號（User ID、Shop ID、物流單號、Transaction ID）</label>
      <label><input type="checkbox" ${m.mask.account ? 'checked' : ''} onchange="CQ.setMask('account',this.checked)"> 遮蔽帳號</label>
      <div class="cls">${clsRow('組別', 'groups', CUR.groups.filter((g) => g.active || m.groups.includes(g.id)).map((g) => [g.id, g.name]))}
        ${clsRow('主題', 'topics', CUR.topics.filter((x) => x.active || m.topics.includes(x.topicId)).map((x) => [x.topicId, L(x.name)]))}
        ${m.topics.length ? clsRow('標籤', 'tags', CUR.tags.filter((x) => m.topics.includes(x.topicId) && (x.active || m.tags.includes(x.tagId))).map((x) => [x.tagId, L(x.name)]), '這個主題還沒有標籤，可到「主題設定 → 標籤」新增') : ''}</div>
      <span class="dts">
        ${dt('note', '匯入提醒', (CUR.notes || []).map((n) => n.text || n))}
        ${dt('err', '核准前要完成', chk.errors)}
        ${dt('warn', '提醒', chk.warns)}
        ${dt('leak', '專員看得到、可能洩漏結果', leaks.map((x) => `<a onclick="CQ.jumpTo('${x.go}')">${esc(x.label)}</a>`), true)}
      </span>`;
  }
  // 分類：組別、主題、標籤（可複選；點一下切換）
  function clsRow(label, key, opts, empty) {
    const on = C.meta[key] || [];
    return `<span class="clsr"><b>${label}</b>${opts.length ? opts.map(([id, name]) => `<button type="button" class="${on.includes(id) ? 'on' : ''}" onclick="CQ.toggleCls('${key}','${esc(id)}')">${esc(name)}</button>`).join('')
      : `<span class="hint">${esc(empty || '（沒有可選的項目）')}</span>`}</span>`;
  }
  function toggleCls(key, id) {
    const a = C.meta[key] || (C.meta[key] = []);
    const i = a.indexOf(id);
    if (i >= 0) a.splice(i, 1); else a.push(id);
    // 取消主題時，一併拿掉這個主題底下的標籤
    if (key === 'topics' && i >= 0) C.meta.tags = C.meta.tags.filter((tg) => { const x = CUR.tags.find((y) => y.tagId === tg); return !x || C.meta.topics.includes(x.topicId); });
    saveCase(); renderSettings(); layout();
  }
  // 設定列的下拉清單（點開才看內容，平常只顯示數量）
  function dt(kind, label, items, raw) {
    if (!items.length) return '';
    return `<details class="dt ${kind}" ${OPEN[kind] ? 'open' : ''} ontoggle="CQ.dtToggle('${kind}',this.open)"><summary>${label} ${items.length}</summary>
      <ul>${items.map((x) => `<li>${raw ? x : esc(x)}</li>`).join('')}</ul></details>`;
  }
  const OPEN = {};
  function setMeta(k, v) { C.meta[k] = v; saveCase(); renderAll(); }
  function setMask(k, v) { C.meta.mask[k] = v; saveCase(); renderAll(); }

  // ───────── 儲存：改了就排程，停 1.2 秒後送出；同時只送一次 ─────────
  function saveCase() {
    if (!CUR || !CUR.canEdit) return;
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
      CUR.rev = r.rev; CUR.updatedAt = Date.now();
      if (r.demoted) X.toast('案件內容不符合核准條件，已退回待審', 5000);
      CUR.status = r.status;
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
    if (dirty || saving) { if (!(await saveNow())) return X.toast('請先處理儲存失敗的問題', 5000); }
    const chk = X.DB().caseCheck(MAIN, CUR.title);
    if (chk.errors.length) { renderSettings(); layout(); return X.toast('還不能核准：' + chk.errors.join('；'), 6000); }
    const leaks = findLeaks();
    if (leaks.length && !(await X.confirmBox('專員看得到這些可能洩漏結果的內容：\n' + leaks.map((x) => '・' + x.label).join('\n') + '\n\n確定都是要給專員看的？', '核准'))) return;
    try {
      const r = await X.api('c_approve', { caseId: CUR.caseId, rev: CUR.rev });
      CUR.status = r.status; X.toast('已核准'); renderAll();
    } catch (e) { X.toast(e.message, 6000); }
  }
  async function unapprove() {
    if (!(await X.confirmBox('退回待審？退回後不能用來組卷，直到再次核准。', '退回待審'))) return;
    try { const r = await X.api('c_unapprove', { caseId: CUR.caseId }); CUR.status = r.status; renderAll(); } catch (e) { X.toast(e.message, 6000); }
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
      X.api('c_imgGet', { ref }).then((r) => fetch(r.dataUrl)).then((res) => res.blob())
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
    return { mc: {}, short: {}, submitted: false, startAt: Date.now(), leaves: 0, leaveMs: 0 };
  }
  function saveAnswer() { /* 專員預覽不記錄作答 */ }

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
    if (go === 'ops') { sideTab = 'ops'; renderSide(); return; }
    if (go.startsWith('drc-')) { sideTab = 'drc'; drcRoom = go.slice(4); renderSide(); return; }
    const el = document.getElementById(go);
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - cqTop() - 10, behavior: 'smooth' });
  }

  // ===== 左側導覽 =====
  let navClosed = false;
  function renderNav() {
    const nav = document.getElementById('cqNav');
    nav.classList.toggle('closed', navClosed);
    nav.innerHTML = `<button class="fold" onclick="CQ.toggleNav()" title="${navClosed ? '展開' : '收合'}">${navClosed ? '»' : '«'}</button>` +
      C.blocks.map(b => `<a id="nav-${b.id}" href="#blk-${b.id}" onclick="event.preventDefault();CQ.jumpTo('blk-${b.id}')">${esc(b.title)}</a>`).join('');
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
        <h2>${esc(b.title)}${VIEW >= 0 ? ' <span class="prevtag">前一次申退</span>' : ''}</h2>
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
      if (!isEdit()) return `<div class="tln"><div>${esc(n.k)}</div><div class="t">${esc(n.t)}</div></div>`;
      return `<div class="tln">
        <div><span contenteditable data-set="tl" data-b="${bi}" data-i="${i}" data-k="k">${esc(n.k)}</span></div>
        <div class="t"><span contenteditable data-set="tl" data-b="${bi}" data-i="${i}" data-k="t">${esc(n.t)}</span></div>
        ${n.leak ? '<span class="leak">可能洩漏結果</span>' : ''}
        <div class="ectl"><button class="del" onclick="CQ.delTl(${bi},${i})">✕</button>
        <button onclick="CQ.cutTl(${bi},${i})" title="刪除這個節點之後的所有節點">✂ 之後全刪</button></div></div>`;
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
    const label = `<span class="k">${esc(fd.k)}${fd.help ? '<i class="help">?</i>' : ''} :</span>`;
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
        : esc(fd.v);
      val = `<span class="pw ${fd.link ? 'link' : ''}">${text}</span>`;
      if (fd.tags) val += ' ' + fd.tags.map((t, i) => tagHtml(t, fd.tagColor, i)).join('');
      if (fd.popup) val += `<span class="vd" onclick="CQ.showFieldPop(event,${bi},${fi})">View Detail</span>`;
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

  function tagHtml(t, color, i) {
    let c = color === 'blue' ? 'blue' : '';
    if (color === 'mix') c = i === 0 ? 'blue' : 'orange';
    if (color === 'teal') c = 'teal';
    if (t === 'Shopee Integrated') c = 'teal';
    return `<span class="tag ${c}">${esc(t)}</span>`;
  }

  function mediaHtml(list, delTpl) {
    if (!list.length) return '<span class="ph">（沒有附件）</span>';
    return `<div class="thumbs">${list.map((m, i) => `
      <div class="thumb ${m.type === 'video' ? 'video' : ''}" onclick="CQ.openLightbox('${src(m.src)}','${m.type}','${m.url ? src(m.url) : ''}')">
        <img src="${src(m.src)}" alt="">
        ${delTpl ? `<button class="x" onclick="event.stopPropagation();${delTpl.replace('IDX', i)}">✕</button>` : ''}
      </div>`).join('')}</div>`;
  }

  function tableHtml(bi, ti, t) {
    const head = t.cols.map(c => `<th>${esc(c)}</th>`).join('') + (isEdit() ? '<th></th>' : '');
    const rows = t.rows.map((r, ri) => `<tr>${r.map((cell, ci) => `<td>${cellHtml(bi, ti, ri, ci, cell)}</td>`).join('')}
      ${isEdit() ? `<td><span class="ectl"><button class="del" onclick="CQ.delRow(${bi},${ti},${ri})">✕ 刪除列</button></span></td>` : ''}</tr>`).join('');
    return `${t.title ? `<div class="tbltitle">${esc(t.title)}</div>` : ''}
      <div class="tblwrap"><table><tr>${head}</tr>${rows}</table></div>`;
  }

  function cellHtml(bi, ti, ri, ci, cell) {
    const path = `data-set="cell" data-b="${bi}" data-t="${ti}" data-r="${ri}" data-c="${ci}"`;
    if (typeof cell === 'string') {
      return isEdit() ? `<span contenteditable ${path}>${esc(cell)}</span>` : esc(cell);
    }
    if (cell.product) {
      const p = cell.product;
      return `<div class="prod"><img src="${src(p.thumb)}" alt="" onclick="CQ.openLightbox('${src(p.thumb)}','image')">
        <div><div>${isEdit() ? `<span contenteditable data-set="prod" data-b="${bi}" data-t="${ti}" data-r="${ri}" data-c="${ci}" data-k="name">${esc(p.name)}</span>` : esc(p.name)}
        <b>X${p.qty}</b></div><div class="var">Variation: ${esc(p.variation)}</div>${(p.extra || []).map(x => `<div class="var">${esc(x)}</div>`).join('')}</div></div>`;
    }
    let text = (isMasked(cell.mask) && !isEdit()) ? '***' : esc(cell.text);
    if (isEdit()) text = `<span contenteditable ${path}>${esc(cell.text)}</span>`;
    let html = text;
    if (cell.track) html += `<span class="vd" onclick="CQ.showTrack(event,${bi},${ti},${ri},${ci})">View Detail</span>`;
    if (cell.tags) html += '<br>' + cell.tags.map(t => tagHtml(t)).join('');
    return html;
  }

  function cardHtml(bi, ci, cd) {
    let inSub = false;
    const rows = cd.rows.map((r, ri) => {
      if (r[2] === 'h') { inSub = true; return `<div class="r h"><span>${esc(r[0])}</span></div>`; }
      const leak = isEdit() && r[2] === 'leak' ? '<span class="leak">可能洩漏結果</span>' : '';
      const val = isEdit()
        ? `<span contenteditable data-set="card" data-b="${bi}" data-c="${ci}" data-r="${ri}">${esc(r[1])}</span>
           <span class="ectl"><button class="del" onclick="CQ.delCardRow(${bi},${ci},${ri})">✕</button></span>`
        : esc(r[1]);
      return `<div class="r ${inSub ? 'sub' : ''}"><span>${esc(r[0])}:${leak}</span><span>${val}</span></div>`;
    }).join('');
    return `<div class="pcard"><h4>${esc(cd.title)}</h4>${rows}</div>`;
  }

  // ===== 物流軌跡彈窗 =====
  function showTrack(ev, bi, ti, ri, ci) {
    const cell = C.blocks[bi].tables[ti].rows[ri][ci];
    showPop(ev, 'Logistics tracking', `<div class="tl">${cell.track.map(t => `<div>${esc(t[0])}<span>${esc(t[1])}</span></div>`).join('')}</div>`);
  }
  function showFieldPop(ev, bi, fi) {
    const p = C.blocks[bi].fields[fi].popup;
    const rows = p.rows.map(r => r[1] == null
      ? `<div style="font-weight:600;color:var(--ink);margin:10px 0 4px">${esc(r[0])}</div>`
      : `<div style="display:flex;justify-content:space-between;padding:3px 0"><span>${esc(r[0])}:</span><span>${esc(r[1])}</span></div>`).join('');
    showPop(ev, p.title, rows);
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
  function renderSide() {
    const tabs = [['quiz', '考題'], ['ops', 'Operation History'], ['chat', 'Chat History'], ['drc', 'Discuss']];
    document.getElementById('cqTabs').innerHTML = tabs.map(t =>
      `<button class="${sideTab === t[0] ? 'on' : ''}" onclick="CQ.tab('${t[0]}')">${t[1]}</button>`).join('');
    const body = document.getElementById('cqSide');
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

  function msgsHtml(room) {
    const list = msgList(room);
    if (!list.length) return '<div class="nomore">No Discuss History</div>';
    const isChat = room === 'chat';
    return list.map((m, i) => {
      const ctl = isEdit() ? `<span class="ectl">
        <button class="del" onclick="CQ.delMsg('${room}',${i})">✕</button>
        <button onclick="CQ.cutAfter('${room}',${i})" title="刪除這則之後的所有訊息">✂ 之後全刪</button></span>` : '';
      if (m.type === 'system') {
        return `<div class="sys pw">ⓘ System Info: ${esc(m.text)}<div class="mt">${esc(m.time)} ${ctl}</div></div>`;
      }
      const masked = C.meta.mask.account && !isEdit();
      const name = m.from === 'shopee' ? 'Shopee Agent'
        : (masked ? '***' : esc(C.meta.accounts[m.from])) + (isChat ? ` (${m.from === 'buyer' ? 'Buyer' : 'Seller'})` : `(${m.from === 'buyer' ? 'Buyer' : 'Seller'})`);
      const av = m.from === 'buyer' ? '🛒' : m.from === 'seller' ? '▤' : 'S';
      let content;
      if (m.type === 'text') {
        content = isEdit() ? `<span class="pw" contenteditable data-set="msg" data-room="${room}" data-i="${i}">${esc(m.text)}</span>` : `<span class="pw">${esc(m.text)}</span>`;
      } else if (m.type === 'video' && m.url) {
        content = `<video controls preload="metadata" width="220" height="220" src="${esc(m.url)}"></video>
          <div class="hint">影片無法播放時，請確認已連上公司內網／VPN</div>`;
      } else if (m.type === 'image' || m.type === 'video') {
        content = `<div class="${m.type === 'video' ? 'thumb video' : ''}" style="${m.type === 'video' ? 'width:120px;height:120px' : ''}" onclick="CQ.openLightbox('${src(m.src)}','${m.type}')"><img src="${src(m.src)}" alt=""></div>`;
      } else {
        content = `<span class="ph">[${esc(m.desc)}]</span>`;
      }
      const leak = isEdit() && m.from === 'shopee' ? '<span class="leak">可能洩漏結果</span>' : '';
      return `<div class="cmsg"><div class="av ${m.from}">${av}</div><div class="mb">
        <div class="mname">${name}${leak}</div><div class="bub">${content}</div>
        <div class="mt">${esc(m.time)} ${ctl}</div></div></div>`;
    }).join('') + (isChat ? '<div class="nomore">No more message</div>' : '');
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
    const chips = OP_FILTERS.map(f => `<button class="${opFilter === f[0] ? 'on' : ''}" onclick="CQ.filter('${f[0]}')">${f[0] === 'all' ? '<span style="color:#1aa260">✔</span> ' : ''}${f[1]}</button>`).join('');
    const list = C.ops.map((n, i) => ({ n, i }))
      .filter(x => isEdit() || !x.n.hidden)
      .filter(x => opFilter === 'all' || x.n.cat === opFilter);
    const rows = list.map(x => opHtml(x.n, x.i)).join('') || '<div class="nomore" style="padding:20px">No Data</div>';
    return `<div class="opf">Node Filter ${chips}</div>
      <div class="pane"><div class="optable"><div class="oh"><div class="c1">Operation Time</div><div>Operation Details</div></div>${rows}</div></div>`;
  }

  const ICON_USER = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#999" stroke-width="1.3"><circle cx="8" cy="5.5" r="3"/><path d="M2.5 14.5c.6-3 2.8-4.5 5.5-4.5s4.9 1.5 5.5 4.5"/></svg>';
  const ICON_CLOCK = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#999" stroke-width="1.3"><circle cx="8" cy="8" r="6.3"/><path d="M8 4.5V8l2.5 1.5"/></svg>';

  function opHtml(n, i) {
    // 操作者是同事的 email 時，專員看到 ***
    let op = n.op;
    if (op && !isEdit() && (op.includes('@') || (C.meta.mask.account && n.cat === 'bs'))) op = '***';
    const timeParts = String(n.time).split(' ');
    const time = esc(timeParts[0]) + (timeParts.length > 1 ? '<br>' + esc(timeParts.slice(1).join(' ')) : '');
    const kv = n.kv.map((k, ki) => {
      let v = (k[2] === 'id' && isMasked('id') && !isEdit()) ? '***' : k[1];
      if (isEdit()) v = `<span contenteditable data-set="opkv" data-i="${i}" data-k="${ki}">${esc(k[1])}</span>`;
      else v = esc(v);
      return `<div class="ckv">${k[0] ? esc(k[0]) + ': ' : ''}${v}</div>`;
    }).join('');
    const media = n.media ? `<div style="margin-bottom:12px">${mediaHtml(n.media, isEdit() ? `CQ.delOpMedia(${i},IDX)` : '')}</div>` : '';
    const ctl = isEdit() ? `<div class="ectl" style="margin:0">
        <button onclick="CQ.toggleOp(${i})">${n.hidden ? '顯示給專員' : '隱藏'}</button>
        <button class="del" onclick="CQ.delOp(${i})">✕</button>
        <button onclick="CQ.cutOp(${i})" title="刪除這個節點之後的所有節點">✂ 之後全刪</button></div>
        ${n.leak ? '<span class="leak">可能洩漏結果</span>' : ''}${n.hidden ? '<span class="leak" style="background:#f1f5f9;color:#64748b;border-color:#cbd5e1">專員看不到</span>' : ''}` : '';
    return `<div class="op ${n.hidden ? 'hid' : ''}">
      <div class="ol"><span class="role ${n.cat}">${esc(n.role)}</span>
        ${op ? `<div class="ln">${ICON_USER}<span>${esc(op)}</span></div>` : ''}
        <div class="ln">${ICON_CLOCK}<span>${time}</span></div></div>
      <div class="or"><div class="act">${esc(n.action)}</div>${kv}${media}${ctl}</div></div>`;
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
    C.modules.forEach(md => { if (md.type === 'mc' || md.type === 'short') map[md.id] = ++n; });
    return map;
  }

  function quizAgentHtml() {
    const qn = qNumbers();
    let html = A.submitted ? resultHtml() : '';
    C.modules.forEach(md => {
      if (md.type === 'note') {
        html += `<div class="mod note"><div class="mh">情境說明</div><div style="white-space:pre-wrap">${esc(md.text)}</div></div>`;
      }
      if (md.type === 'image' && md.images.length) {
        html += `<div class="mod"><div class="mh">補充資訊</div>${mediaHtml(md.images.map(s => ({ type: 'image', src: imgSrc(s) })), '')}
          <div class="hint">點圖片可放大</div></div>`;
      }
      if (md.type === 'mc') html += mcAgentHtml(md, qn[md.id]);
      if (md.type === 'short') {
        const bind = md.bindTo && qn[md.bindTo] ? `<div class="hint">說明第 ${qn[md.bindTo]} 題的選擇</div>` : '';
        html += `<div class="mod"><div class="mh">${qn[md.id]}. ${esc(md.q)}<span class="sp"></span><span class="pts">${md.points} 分</span></div>${bind}
          <textarea ${A.submitted ? 'disabled' : ''} oninput="CQ.shortAns('${md.id}',this.value)">${esc(A.short[md.id] || '')}</textarea>
          ${A.submitted && C.meta.usage === 'practice' ? `<div class="explain"><b>參考答案：</b>${esc(md.standard)}</div>` : ''}</div>`;
      }
    });
    return html || '<div class="hint">講師還沒有設定考題</div>';
  }

  function mcAgentHtml(md, no) {
    const pick = A.mc[md.id];
    const showAns = A.submitted && C.meta.usage === 'practice';
    const opts = md.options.map((o, i) => {
      let cls = 'copt';
      if (pick === i) cls += ' sel';
      if (showAns && i === md.answer) cls += ' right';
      if (showAns && pick === i && i !== md.answer) cls += ' wrong';
      return `<div class="${cls}" onclick="CQ.pickMc('${md.id}',${i})"><span class="l">${LETTERS[i]}</span><span>${esc(o)}</span></div>`;
    }).join('');
    return `<div class="mod"><div class="mh">${no}. ${esc(md.q)}<span class="sp"></span><span class="pts">${md.points} 分</span></div>${opts}
      ${showAns && md.explain ? `<div class="explain"><b>詳解：</b>${esc(md.explain)}</div>` : ''}</div>`;
  }

  function pickMc(id, i) {
    if (A.submitted) return;
    A.mc[id] = i; saveAnswer(); renderSide();
  }

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
    let got = 0, mcTotal = 0, shortTotal = 0;
    const notes = [];
    C.modules.forEach(md => {
      if (md.type === 'mc') { mcTotal += md.points; if (A.mc[md.id] === md.answer) got += md.points; }
      if (md.type === 'short') {
        shortTotal += md.points;
        const bound = C.modules.find(x => x.id === md.bindTo);
        if (bound && A.mc[bound.id] !== bound.answer) notes.push('有簡答題綁定的單選題答錯，依預設規則該簡答 0 分（講師可調整）');
      }
    });
    const secs = Math.round(A.leaveMs / 1000);
    const isPractice = C.meta.usage === 'practice';
    return `<div class="cres">
      <div>單選題得分 <b class="big">${got}</b> / ${mcTotal}</div>
      ${shortTotal ? `<div>簡答題 ${shortTotal} 分：待 AI 預評分，再由講師確認</div>` : ''}
      ${notes.map(n => `<div class="hint">${esc(n)}</div>`).join('')}
      <div class="hint">作答期間離開考試頁面 ${A.leaves} 次，共 ${secs} 秒（講師看得到）</div>
      <div class="hint">${isPractice ? '練習模式：下方顯示正解與詳解，成績不計入。' : '考試模式：成績公布前只顯示自己的分數。'}</div></div>`;
  }

  // ===== 考題分頁：講師編輯 =====
  const TYPE_NAME = { note: '情境說明', image: '補充資訊', mc: '單選題', short: '簡答題' };

  function quizEditHtml() {
    const qn = qNumbers();
    const mcList = C.modules.filter(m => m.type === 'mc');
    let html = '<div class="hint" style="margin-bottom:10px">模組由上往下顯示給專員。可以插入多個、調整順序。</div>';
    C.modules.forEach((md, i) => {
      const head = `<div class="mh">${qn[md.id] ? qn[md.id] + '. ' : ''}${TYPE_NAME[md.type]}<span class="sp"></span>
        <button class="mbtn" onclick="CQ.moveMod(${i},-1)">↑</button><button class="mbtn" onclick="CQ.moveMod(${i},1)">↓</button>
        <button class="mbtn del" onclick="CQ.delMod(${i})">✕</button></div>`;
      let body = '';
      if (md.type === 'note') {
        body = `<textarea onchange="CQ.setMod(${i},'text',this.value)">${esc(md.text)}</textarea>`;
      }
      if (md.type === 'image') {
        body = `${mediaHtml(md.images.map(s => ({ type: 'image', src: imgSrc(s) })), `CQ.delImg(${i},IDX)`)}
          <div style="display:flex;gap:8px;margin-top:8px;align-items:stretch">
            <button class="mbtn" style="padding:8px 14px;font-size:13px;border-color:var(--brand);color:var(--brand)" onclick="CQ.pickImg(${i})">⬆ 上傳補充資訊圖片</button>
            <div class="drop" tabindex="0" style="flex:1;padding:8px" onclick="this.focus()" onpaste="CQ.pasteImg(event,${i})">或點這裡後按 Ctrl+V 貼上截圖</div></div>
          <div class="hint">圖片原檔拆段存進 Firestore（太大才壓縮）。上傳前請確認圖片裡的帳號與浮水印。</div>`;
      }
      if (md.type === 'mc') {
        body = `<div class="lbl">題目</div><input type="text" value="${esc(md.q)}" onchange="CQ.setMod(${i},'q',this.value)">
          <div class="lbl">選項（點圓圈設定正解）</div>
          ${md.options.map((o, oi) => `<div class="erow"><input type="radio" name="ans${md.id}" ${md.answer === oi ? 'checked' : ''} onchange="CQ.setMod(${i},'answer',${oi})">
            <b style="width:14px">${LETTERS[oi]}</b><input type="text" value="${esc(o)}" onchange="CQ.setOpt(${i},${oi},this.value)">
            <button class="mbtn del" onclick="CQ.delOpt(${i},${oi})">✕</button></div>`).join('')}
          ${md.options.length < 8 ? `<button class="mbtn" onclick="CQ.addOpt(${i})">＋ 新增選項</button>` : ''}
          <div class="lbl">配分</div><input type="number" value="${md.points}" style="width:90px" onchange="CQ.setMod(${i},'points',+this.value)">
          <div class="lbl">詳解（練習模式交卷後顯示）</div><textarea onchange="CQ.setMod(${i},'explain',this.value)">${esc(md.explain || '')}</textarea>`;
      }
      if (md.type === 'short') {
        body = `<div class="lbl">題目</div><input type="text" value="${esc(md.q)}" onchange="CQ.setMod(${i},'q',this.value)">
          <div class="lbl">綁定單選題（選錯時這題預設 0 分）</div>
          <select onchange="CQ.setMod(${i},'bindTo',this.value)"><option value="">不綁定</option>
            ${mcList.map(m => `<option value="${m.id}" ${md.bindTo === m.id ? 'selected' : ''}>第 ${qn[m.id]} 題：${esc(m.q)}</option>`).join('')}</select>
          <div class="lbl">標準答案（AI 預評分依據）</div><textarea onchange="CQ.setMod(${i},'standard',this.value)">${esc(md.standard || '')}</textarea>
          <div class="lbl">配分</div><input type="number" value="${md.points}" style="width:90px" onchange="CQ.setMod(${i},'points',+this.value)">`;
      }
      html += `<div class="mod ${md.type === 'note' ? 'note' : ''}">${head}${body}</div>`;
    });
    html += `<div class="addbar"><span class="hint" style="width:100%;margin:0">＋ 插入模組</span>
      ${Object.keys(TYPE_NAME).map(t => `<button onclick="CQ.addMod('${t}')">${TYPE_NAME[t]}</button>`).join('')}</div>`;
    return html;
  }

  function newId() { return 'm' + Date.now().toString(36); }
  function addMod(type) {
    const md = { id: newId(), type };
    if (type === 'note') md.text = '';
    if (type === 'image') md.images = [];
    if (type === 'mc') Object.assign(md, { q: '請選擇正確的', options: ['', '', '', ''], answer: 0, points: 5, explain: '' });
    if (type === 'short') Object.assign(md, { q: '請說明你選擇這個答案的理由', standard: '', bindTo: '', points: 5 });
    C.modules.push(md); saveCase(); renderSide();
    const pane = document.getElementById('cqQuizPane'); pane.scrollTop = pane.scrollHeight;
  }
  function setMod(i, k, v) { C.modules[i][k] = v; saveCase(); if (k === 'answer' || k === 'bindTo' || k === 'q') renderSide(); }
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
  function setOpt(i, oi, v) { C.modules[i].options[oi] = v; saveCase(); }
  function addOpt(i) { C.modules[i].options.push(''); saveCase(); renderSide(); }
  function delOpt(i, oi) {
    const md = C.modules[i];
    if (md.options.length <= 2) return alert('至少要 2 個選項');
    md.options.splice(oi, 1);
    if (md.answer >= md.options.length) md.answer = 0;
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
  // ===== 燈箱（滾輪縮放） =====
  function openLightbox(url, type, videoUrl) {
    lbScale = 1;
    const img = document.getElementById('cqLbImg');
    const old = document.getElementById('cqLbVideo');
    if (old) old.remove();
    if (type === 'video' && videoUrl) {
      // 有影片網址就直接播放（需要公司內網／VPN）
      img.style.display = 'none';
      img.insertAdjacentHTML('afterend', `<video id="cqLbVideo" controls autoplay src="${videoUrl}" style="max-width:92vw;max-height:84vh;background:#000"></video>`);
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

  // ===== 浮水印：登入者 email＋時間 =====
  function renderWatermark() {
    const now = new Date().toLocaleString('sv-SE').slice(0, 16);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="200"><g transform="rotate(-20 210 100)" font-family="Arial" font-size="16" fill="#000">
      <text x="20" y="90">${esc(X.me.email)}/${now}</text><text x="60" y="118">CONFIDENTIAL © SEA LIMITED</text></g></svg>`;
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
    dtToggle: (k, v) => { OPEN[k] = v; }, toggleCls, view: setView, setMode, setTitle, setMeta, setMask, saveNow, approve, unapprove, del,
    jumpTo, toggleNav: () => { navClosed = !navClosed; renderNav(); layout(); },
    tab: (t) => { sideTab = t; renderSide(); }, room: (r) => { drcRoom = r; renderSide(); }, filter: (f) => { opFilter = f; renderSide(); },
    addField, delTl, cutTl, addTl, delMedia, showFieldPop, editTags, toggleHidden, delField, openLightbox, closeLightbox,
    delRow, showTrack, delCardRow, delMsg, cutAfter, toggleOp, delOp, cutOp, delOpMedia,
    pickMc, shortAns: (id, v) => { A.short[id] = v; }, submitAnswer, retry,
    addMod, moveMod, delMod, setMod, setOpt, addOpt, delOpt, delImg, pickImg, pasteImg,
  };

  // ===== 入口（app.js 的 route 呼叫） =====
  function route(page, arg, ctx) {
    X = ctx;
    return viewCase(arg);
  }
  window.RRQP_CASES = { route, list };
})();
