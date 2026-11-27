/* RR AI Training Platform — V3 DMS 考題測驗：組卷發佈、講師看作答與足跡、給分、公布；專員的測驗卡片與入口
 * 測驗管理 → 「DMS 考題測驗」分頁：window.RRQP_EXAM.sessions(box, ctx)
 * 單場：#/xsession/X001（講師）；專員作答：#/x/X001；我的測驗卡片：RRQP_EXAM.cards(ctx)
 * 作答畫面、足跡卡由 cases.js 提供（RRQP_CASES.take / footprint）；資料一律走 db.js 的 x_* 動作。
 */
(() => {
  'use strict';

  let X = null;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const L = (n) => (n && typeof n === 'object' ? n.zh || n.en || '' : String(n || ''));
  const p2 = (n) => String(n).padStart(2, '0');
  const fmtDT = (ms) => { if (!ms) return '-'; const d = new Date(ms); return `${d.getFullYear()}/${p2(d.getMonth() + 1)}/${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`; };
  const toLocal = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`; };
  const xLink = (id) => location.origin + location.pathname + '#/x/' + id;
  const REFRESH_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v5h-5"/></svg>';   // 和 app.js 同一個圖示
  // 專員看得到的字跟右上角「中文／EN」切換（2026-11-21 BPO）；中文、英文寫在同一處
  const U = (zh, en) => (document.documentElement.lang === 'en' ? en : zh);
  const MODE = (s) => (s.mode === 'practice' ? (s.review === 'unified' ? U('練習・統一檢討', 'Practice · reviewed together') : U('練習・隨時檢討', 'Practice · instant review')) : U('考試', 'Exam'));
  const STATE_ZH = { scheduled: '尚未開始', open: '進行中', closed: '已結束', released: '已公布成績' };
  const STATE_EN = { scheduled: 'Not started', open: 'Open', closed: 'Closed', released: 'Results released' };
  const ATT_ZH = { not_started: '未開始', in_progress: '作答中', submitted: '已交卷', expired: '逾時未交' };
  const ATT_EN = { not_started: 'Not started', in_progress: 'In progress', submitted: 'Submitted', expired: 'Expired' };
  const stChip = (st) => `<span class="chip ${st === 'open' ? 'ok' : st === 'scheduled' ? 'info' : st === 'released' ? 'brand' : ''}">${U(STATE_ZH, STATE_EN)[st] || esc(st)}</span>`;
  const atChip = (a) => `<span class="chip ${a.status === 'submitted' ? 'ok' : a.status === 'in_progress' ? 'info' : a.status === 'expired' ? 'warn' : ''}">${U(ATT_ZH, ATT_EN)[a.status] || esc(a.status)}${a.autoSubmitted ? U('・自動交卷', ' · auto-submitted') : ''}</span>`;

  // ═════════════════════════════ 測驗管理：列表＋新增 ═════════════════════════════
  async function sessions(box, ctx) {
    X = ctx;
    box.innerHTML = `<div class="row" style="margin-bottom:10px"><span class="small muted">從「可用題庫 → DMS 考題」挑已上架的案件組成一場測驗。</span><span class="spacer"></span>
      <button class="btn brand" id="xNew" type="button">＋ DMS 考題測驗</button></div><div id="xCreate"></div>
      <div class="card scroll-x" id="xList"><div class="empty-state"><span class="spin"></span></div></div>`;
    $('#xNew').onclick = () => { const c = $('#xCreate'); if (c.innerHTML) c.innerHTML = ''; else createForm(c); };
    if (/[?&]new=1/.test(location.hash)) createForm($('#xCreate'));
    let d;
    try { d = await X.api('x_list'); } catch (e) { X.showError(e, $('#xList')); return; }
    const list = $('#xList');
    if (!d.sessions.length) { list.innerHTML = '<div class="empty-state">還沒有 DMS 考題測驗</div>'; return; }
    list.innerHTML = `<table class="list"><thead><tr><th>測驗</th><th>類型</th><th>開放時間</th><th>作答時間</th><th>交卷</th><th>狀態</th></tr></thead><tbody>
      ${d.sessions.map((s) => `<tr class="click" data-x="${esc(s.sessionId)}"><td><b>${esc(s.sessionId)}</b> ${esc(s.title)}<div class="small soft">${s.caseCount} 個案件・${s.questionCount} 題</div></td>
        <td class="small">${MODE(s)}</td><td class="small">${fmtDT(s.startAt)}<br>– ${fmtDT(s.endAt)}</td><td class="small">${s.minutes} 分</td>
        <td class="small">${s.submitted} / ${s.assigned}</td><td>${stChip(s.state)}${s.answersOpen ? ' <span class="chip">已公布解答</span>' : ''}</td></tr>`).join('')}</tbody></table>`;
    $$('#xList [data-x]').forEach((tr) => tr.addEventListener('click', () => { location.hash = '#/xsession/' + tr.dataset.x; }));
  }

  // copyId：複製測驗（2026-11-27）——沿用名稱、類型、作答時間、案件順序與分數；開放時間、專員由講師重填。案件用題庫現在的版本，下架或不能用的不放進來
  async function createForm(box, copyId) {
    box.innerHTML = '<div class="card pad"><span class="spin"></span></div>';
    let d, src = null;
    try { [d, src] = await Promise.all([X.api('c_list'), copyId ? X.api('x_get', { sessionId: copyId }) : null]); } catch (e) { X.showError(e, box); return; }
    const all = d.cases.filter((c) => c.status === 'approved');
    const gName = (id) => (d.groups.find((x) => x.id === id) || {}).name || id;
    const tpName = (id) => L((d.topics.find((x) => x.topicId === id) || {}).name) || id;
    const st = { picked: [], seen: {}, f: { g: '', tp: '', q: '' }, w: {}, manual: false };   // w：案件分數；manual＝講師改過（之後增減案件不再自動均分）
    const start = Date.now(), end = start + 2 * 3600e3;
    box.innerHTML = `<form class="card pad" id="xf" style="display:flex;flex-direction:column;gap:14px;margin-bottom:14px" autocomplete="off">
      <h2>${src ? '複製 DMS 考題測驗' : '新增 DMS 考題測驗'}</h2><div id="x_copy" style="display:contents"></div>
      <div class="form">
        <label class="k" for="x_title">測驗名稱</label><input type="text" id="x_title" maxlength="80" placeholder="例如：11 月新人訓練・DMS 實戰練習" required>
        <span class="k">類型</span><div class="tags">
          <label class="tag-opt on"><input type="radio" name="x_mode" value="exam" checked> 考試（限時、講師批改後公布成績）</label>
          <label class="tag-opt"><input type="radio" name="x_mode" value="instant"> 練習・隨時檢討（交卷後馬上看詳解）</label>
          <label class="tag-opt"><input type="radio" name="x_mode" value="unified"> 練習・統一檢討（講師公布後才看得到詳解）</label></div>
        <label class="k" for="x_s">開放時間</label><div class="row"><input type="datetime-local" id="x_s" value="${toLocal(start)}"> – <input type="datetime-local" id="x_e" value="${toLocal(end)}"></div>
        <label class="k" for="x_min">作答時間</label><div class="row"><input type="number" id="x_min" min="1" max="600" value="30"> 分鐘<span class="small muted">（整場；從專員按「開始作答」起算，開放時間結束也會截止）</span></div>
        <label class="k" for="x_em">指派專員</label><div><textarea id="x_em" rows="4" style="width:min(520px,100%);border:1px solid var(--line2);border-radius:8px;padding:8px" placeholder="一行一個 email，或用逗號分隔"></textarea>
          <div class="small muted">要給 BPO 專員作答，請選標「TW＋BPO」、而且已經翻好英文的案件；標「TW」的案件只有中文。</div></div>
      </div>
      <div class="lib-grid" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr)">
        <div class="card pad"><div class="row" style="margin-bottom:8px"><b>可用的案件</b><span class="spacer"></span><span class="small muted" id="x_cnt"></span></div>
          <div class="row" style="margin-bottom:8px;gap:6px">
            <select id="x_g"><option value="">全部組別</option>${d.groups.map((g) => `<option value="${esc(g.id)}">${esc(g.name)}</option>`).join('')}</select>
            <select id="x_tp"><option value="">全部主題</option>${d.topics.map((x) => `<option value="${esc(x.topicId)}">${esc(L(x.name))}</option>`).join('')}</select>
            <input type="search" id="x_q" placeholder="搜尋" style="height:36px;border:1px solid var(--line2);border-radius:8px;padding:0 10px;min-width:120px"></div>
          <div class="xpick" id="x_pool"></div></div>
        <div class="card pad"><div class="row" style="margin-bottom:8px"><b>這場的案件</b><span class="spacer"></span><span class="small muted" id="x_sum"></span></div>
          <div class="xsel" id="x_sel"></div></div>
      </div>
      <div id="x_err" class="banner err" hidden></div>
      <div class="row"><button class="btn brand" type="submit" id="x_go">發佈測驗</button><button class="btn" type="button" id="x_cancel">取消</button></div></form>`;
    const modeOf = () => ($('input[name=x_mode]:checked') || {}).value || 'exam';
    const drawPool = () => {
      const exam = modeOf() === 'exam', q = st.f.q.trim().toLowerCase();
      const list = all.filter((c) => (!st.f.g || (c.groups || []).includes(st.f.g)) && (!st.f.tp || (c.topics || []).includes(st.f.tp))
        && (!q || [c.caseId, c.title].join(' ').toLowerCase().includes(q)));
      $('#x_cnt').textContent = `${list.length} 個`;
      $('#x_pool').innerHTML = list.length ? list.map((c) => {
        const no = exam && c.usage !== 'exam', on = st.picked.includes(c.caseId);
        return `<label class="row" style="padding:6px 0;border-bottom:1px solid var(--line);gap:8px;${no ? 'opacity:.5' : ''}">
          <input type="checkbox" data-c="${esc(c.caseId)}" ${on ? 'checked' : ''} ${no ? 'disabled' : ''}>
          <span style="flex:1"><b class="mono">${esc(c.caseId)}</b> ${esc(c.title)}${(c.sopStale || []).length ? '<div class="cql-sopline">SOP 調整檢查</div>' : ''}<div class="small soft">${(c.groups || []).map(gName).concat((c.topics || []).map(tpName)).map(esc).join('、')}・${c.questions} 題・${c.usage === 'exam' ? '考試用' : '練習用'}</div></span>
          ${window.RRQP_CASES.langChip(c)}${st.seen[c.caseId] ? `<span class="chip warn">${st.seen[c.caseId]} 人做過</span>` : ''}${no ? '<span class="small soft">練習用，不能放進考試</span>' : ''}</label>`;
      }).join('') : '<div class="empty-state">沒有符合的已上架案件</div>';
      $$('#x_pool [data-c]').forEach((cb) => cb.addEventListener('change', () => {
        const id = cb.dataset.c;
        st.picked = cb.checked ? st.picked.concat(id) : st.picked.filter((x) => x !== id);
        drawSel();
      }));
    };
    // 平均分配成整數，總和剛好 100（尾數給前面的案件）
    const evenW = () => {
      const ids = st.picked.filter((id) => ((all.find((c) => c.caseId === id) || {}).questions || 0) > 0), n = ids.length;
      st.w = {}; ids.forEach((id, i) => { st.w[id] = Math.floor(100 / n) + (i < 100 % n ? 1 : 0); });
    };
    const wSum = () => Math.round(st.picked.reduce((t, id) => t + (Number(st.w[id]) || 0), 0) * 100) / 100;
    const drawSum = () => {
      const rows = st.picked.map((id) => all.find((c) => c.caseId === id)).filter(Boolean), sum = wSum(), ok = Math.abs(sum - 100) < 0.05;
      // 練習不計分（2026-11-21 Chris）：不用設定案件分數，背後照平均分配送出
      if (modeOf() !== 'exam') { $('#x_sum').innerHTML = `${rows.length} 個案件・${rows.reduce((n, c) => n + c.questions, 0)} 題・<span class="soft">練習不計分，不用設定分數</span>`; return; }
      $('#x_sum').innerHTML = `${rows.length} 個案件・${rows.reduce((n, c) => n + c.questions, 0)} 題・案件分數合計 <b style="color:${ok || !rows.length ? 'inherit' : 'var(--bad,#dc2626)'}">${sum}</b> / 100 分
        ${rows.length ? '<button type="button" class="btn sm ghost" id="x_even">均分</button>' : ''}`;
      const ev = $('#x_even'); if (ev) ev.onclick = () => { st.manual = false; evenW(); drawSel(); };
    };
    const drawSel = () => {
      const rows = st.picked.map((id) => all.find((c) => c.caseId === id)).filter(Boolean), prac = modeOf() !== 'exam';
      if (prac) st.manual = false;
      if (!st.manual) evenW();
      st.picked.forEach((id) => { if (st.w[id] === undefined) st.w[id] = 0; });
      drawSum();
      $('#x_sel').innerHTML = rows.length ? rows.map((c, i) => `<div class="it"><b>案件 ${i + 1}</b><span class="mono">${esc(c.caseId)}</span><span style="flex:1">${esc(c.title)}</span>${window.RRQP_CASES.langChip(c)}
        ${prac ? '' : c.questions ? `<span class="row" style="gap:4px;white-space:nowrap"><input type="number" min="0" max="100" step="any" data-w="${esc(c.caseId)}" value="${st.w[c.caseId]}" style="width:64px;height:30px;border:1px solid var(--line2);border-radius:6px;padding:0 6px"> 分</span>` : '<span class="small soft">沒有作答題・0 分</span>'}
        <button type="button" class="btn sm ghost" data-u="${i}" ${i ? '' : 'disabled'}>↑</button><button type="button" class="btn sm ghost" data-d="${i}" ${i < rows.length - 1 ? '' : 'disabled'}>↓</button>
        <button type="button" class="btn sm ghost danger" data-x="${i}">✕</button></div>`).join('') : `<div class="small muted">從左邊勾選案件；專員作答時依這裡的順序。${prac ? '練習不計分，只看答對率與作答比對。' : '每個案件的分數預設平均分配，可以手動改，合計要 100 分；案件裡各題再依案件設定的百分比分配。'}</div>`;
      const mv = (i, dd) => { const a = st.picked.splice(i, 1)[0]; st.picked.splice(i + dd, 0, a); drawSel(); };
      $$('#x_sel [data-u]').forEach((b) => b.addEventListener('click', () => mv(+b.dataset.u, -1)));
      $$('#x_sel [data-d]').forEach((b) => b.addEventListener('click', () => mv(+b.dataset.d, 1)));
      $$('#x_sel [data-x]').forEach((b) => b.addEventListener('click', () => { st.picked.splice(+b.dataset.x, 1); drawSel(); drawPool(); }));
      $$('#x_sel [data-w]').forEach((inp) => inp.addEventListener('input', () => { st.manual = true; $('#x_err').hidden = true; $('#x_err').hidden = true; st.w[inp.dataset.w] = Number(inp.value) || 0; drawSum(); }));
    };
    const emails = () => $('#x_em').value.split(/[\s,;，、]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
    // 指派名單改了就查一次「做過幾人」（只提醒，不擋）
    $('#x_em').addEventListener('change', async () => {
      try { st.seen = (await X.api('x_seen', { emails: emails() })).seen; drawPool(); } catch (_) { /* 查不到就不顯示 */ }
    });
    $$('input[name=x_mode]').forEach((r) => r.addEventListener('change', () => {
      $$('input[name=x_mode]').forEach((x) => x.parentElement.classList.toggle('on', x.checked));
      if (modeOf() === 'exam') st.picked = st.picked.filter((id) => (all.find((c) => c.caseId === id) || {}).usage === 'exam');
      $('#x_min').value = modeOf() === 'exam' ? 30 : 60;
      drawPool(); drawSel();
    }));
    $('#x_g').onchange = (e) => { st.f.g = e.target.value; drawPool(); };
    $('#x_tp').onchange = (e) => { st.f.tp = e.target.value; drawPool(); };
    $('#x_q').oninput = (e) => { st.f.q = e.target.value; drawPool(); };
    $('#x_cancel').onclick = () => { box.innerHTML = ''; };
    if (src) {
      const s = src.session, m = s.mode === 'exam' ? 'exam' : s.review === 'unified' ? 'unified' : 'instant', out = [];
      $('#x_title').value = (s.title + '（複製）').slice(0, 80);
      $$('input[name=x_mode]').forEach((x) => { x.checked = x.value === m; x.parentElement.classList.toggle('on', x.checked); });
      $('#x_min').value = s.minutes;
      (src.key.cases || []).forEach((k) => {
        const c = all.find((x) => x.caseId === k.caseId), any = d.cases.find((x) => x.caseId === k.caseId);
        if (!c) { out.push(`${k.caseId} ${k.title || ''}（${any ? '已下架' : '已刪除'}）`); return; }
        if (m === 'exam' && c.usage !== 'exam') { out.push(`${k.caseId} ${c.title}（改成練習用，不能放進考試）`); return; }
        st.picked.push(c.caseId); st.w[c.caseId] = k.weight;
      });
      st.manual = !out.length;   // 案件都在：沿用原本的分數；有少案件：重新平均分配，講師再調整
      $('#x_copy').innerHTML = `<div class="banner info">從 <b>${esc(s.sessionId)}</b> 複製：已帶入名稱、類型、作答時間、案件與分數，請改名稱、填開放時間和指派專員。案件用題庫現在的內容；發佈前都可以增減案件。</div>
        ${out.length ? `<div class="banner warn">這些案件不能用，沒有放進來，請從左邊另外挑選：<br>${out.map(esc).join('<br>')}${m === 'exam' ? '<br>案件分數已重新平均分配。' : ''}</div>` : ''}`;
    }
    drawPool(); drawSel();
    $('#xf').addEventListener('submit', async (e) => {
      e.preventDefault();
      // 沒有英文的案件：BPO 專員會看到中文；講師確認後才發佈（不擋，只給 TW 專員時本來就不需要英文）
      const noEn = st.picked.map((id) => all.find((c) => c.caseId === id)).filter((c) => c && !(c.twOnly === false && c.tx === 'done'));
      if (noEn.length && !confirm(`這些案件沒有完整的英文，BPO 專員會看到中文：\n${noEn.map((c) => `${c.caseId} ${c.title || ''}（${c.twOnly !== false ? 'TW' : c.tx === 'partial' ? '有句子沒翻到' : '還沒翻好'}）`).join('\n')}\n\n只指派 TW 專員的話可以直接發佈。要繼續嗎？`)) return;
      // 英文對照（2026-11-24）：講師寫的字還有機器翻譯沒人確認；發佈後再改英文要重新發佈，所以先提醒（不擋）
      const unEn = st.picked.map((id) => all.find((c) => c.caseId === id)).filter((c) => c && c.twOnly === false && c.tx === 'done' && Number(c.txUn) > 0);
      if (unEn.length && !confirm(`這些案件講師寫的字（題目、選項、詳解…）還有英文沒確認：\n${unEn.map((c) => `${c.caseId} ${c.title || ''}（${c.txUn} 句）`).join('\n')}\n\n可以在案件的「⋯ → 英文對照」確認或修改；發佈後再改要重新發佈。要繼續發佈嗎？`)) return;
      const btn = $('#x_go'); btn.disabled = true; $('#x_err').hidden = true;
      const m = modeOf();
      try {
        const r = await X.api('x_create', { title: $('#x_title').value, mode: m === 'exam' ? 'exam' : 'practice', review: m === 'exam' ? '' : m,
          startAt: new Date($('#x_s').value).getTime(), endAt: new Date($('#x_e').value).getTime(), minutes: Number($('#x_min').value), assignees: emails(), caseIds: st.picked,
          weights: Object.fromEntries(st.picked.map((id) => [id, Number(st.w[id]) || 0])) });
        X.toast('已發佈 ' + r.sessionId);
        location.hash = '#/xsession/' + r.sessionId;
      } catch (err) { $('#x_err').textContent = err.message; $('#x_err').hidden = false; btn.disabled = false; }
    });
  }

  // ═════════════════════════════ 單場（講師） ═════════════════════════════
  async function session(id, ctx) {
    X = ctx;
    // TL（2026-11-25）：唯讀看作答明細（從成績頁進來），沒有任何操作按鈕、不能給分
    const ro = !!X.me.isTL;
    const main = X.shell(ro ? 'results' : 'sessions', '<div class="empty-state"><span class="spin"></span></div>');
    const qp = new URLSearchParams(location.hash.split('?')[1] || '');
    const want = qp.get('agent') || '';
    // 2026-11-24 Chris：分頁照測驗的階段排「考題內容｜作答進度｜閱卷批改｜成績與分析」；閱卷批改裡切換依題目／依專員
    //   沒指定分頁時跟著狀態：尚未開始→考題內容、進行中→作答進度、已結束／已公布→閱卷批改（成績與分析是另一頁，不自動跳）
    //   舊連結：?view=q＝依題目批改、?agent=…＝依專員看那位專員
    let view = qp.get('view') || '', by = qp.get('by') || '';
    if (view === 'q') { view = 'grade'; by = 'q'; }
    if (want && !view) view = 'grade';
    if (want) by = 'a';
    let d;
    try { d = await X.api('x_get', { sessionId: id }); } catch (e) { X.showError(e, main); return; }
    const s = d.session, sub = d.roster.filter((r) => r.status === 'submitted').length;
    const exam = s.mode === 'exam';
    if (!['content', 'progress', 'grade'].includes(view)) view = ro ? 'grade' : s.state === 'scheduled' ? 'content' : s.state === 'open' ? 'progress' : 'grade';
    if (by !== 'a') by = 'q';
    const href = (v, b) => `#/xsession/${esc(s.sessionId)}?view=${v}${b ? '&by=' + b : ''}`;
    main.innerHTML = `<div class="row">${ro ? `<a href="#/xresults/${esc(s.sessionId)}">← 成績與分析</a>` : '<a href="#/sessions">← 測驗管理</a>'}<h1>${esc(s.sessionId)} ${esc(s.title)}</h1><span class="chip">${MODE(s)}</span>${stChip(s.state)}
        ${s.answersOpen ? '<span class="chip ok">已公布解答</span>' : ''}<span class="spacer"></span>
        <button class="btn icon" id="xr" type="button" title="重新整理" aria-label="重新整理">${REFRESH_SVG}</button>
        ${ro ? `${s.released || !exam ? '' : '<span class="chip warn">尚未公布，分數可能還會調整</span>'}` : `${!s.released ? '<button class="btn" id="xAdd">加入專員</button><button class="btn" id="xMin">延長作答時間</button><button class="btn" id="xExt">延長結束時間</button>' : ''}
        ${s.state === 'open' || s.state === 'scheduled' ? '<button class="btn danger" id="xEnd">提前結束</button>' : ''}
        ${!exam && s.review === 'unified' ? `<button class="btn ${s.answersOpen ? '' : 'brand'}" id="xOpen">${s.answersOpen ? '收回解答' : '公布解答'}</button>` : ''}
        ${exam && s.state === 'closed' ? '<button class="btn brand" id="xRel">公布成績</button>' : ''}
        <a class="btn" href="#/sessions?copy=${esc(s.sessionId)}" title="用同樣的案件與設定建立新的測驗" style="display:inline-grid;place-items:center;text-decoration:none">複製</a>
        ${X.me.can && X.me.can.session ? '<button class="btn ghost danger" id="xDel">刪除</button>' : ''}`}</div>
      <div id="xPanel"></div>
      <div class="cmd" ${ro ? 'hidden' : ''}><code style="font-size:15px;word-break:break-all">${esc(xLink(s.sessionId))}</code><span class="spacer"></span><button class="btn sm" id="xCopy">複製專員連結</button></div>
      <div class="stats">
        <div class="card pad"><div class="small soft">開放時間</div><div><b>${fmtDT(s.startAt)}</b><br>– <b>${fmtDT(s.endAt)}</b></div></div>
        <div class="card pad"><div class="small soft">作答時間</div><div class="big">${s.minutes} 分</div><a class="small soft xs-lnk" href="${href('content')}" title="看考題內容">${s.caseCount} 個案件・${s.questionCount} 題${exam ? '・滿分 100 分' : ''}</a></div>
        <div class="card pad"><div class="small soft">交卷</div><div class="big">${sub} <span class="soft" style="font-size:16px">/ ${d.roster.length}</span></div></div>
      </div>
      <div class="tabs"><a class="tab ${view === 'content' ? 'on' : ''}" href="${href('content')}">考題內容</a><a class="tab ${view === 'progress' ? 'on' : ''}" href="${href('progress')}">作答進度</a>
        <a class="tab ${view === 'grade' ? 'on' : ''}" href="${href('grade', by)}">${exam && !ro ? '閱卷批改' : '作答明細'}</a><a class="tab" href="#/xresults/${esc(s.sessionId)}">成績與分析</a></div>
      ${view === 'content' ? `<div id="xcBox">${contentPanel(d)}</div>` : view === 'progress' ? `<div class="card scroll-x"><table class="list"><thead><tr><th>專員</th><th>狀態</th><th>開始</th><th>交卷</th><th>離開頁面</th><th></th></tr></thead><tbody>
        ${d.roster.map((r) => `<tr><td>${esc(r.email)} ${retakeChip(r.retakes)}</td><td>${atChip(r.status === 'not_started' && s.state === 'closed' ? { status: 'expired' } : r)}</td>
          <td class="small muted">${fmtDT(r.startedAt)}</td><td class="small muted">${fmtDT(r.submittedAt)}</td>
          <td class="small">${r.track ? esc(window.RRQP_CASES.leaveSummary(r.track)) : '-'}</td>
          <td style="text-align:right;white-space:nowrap">${r.extraMin ? `<span class="chip">加時 ${r.extraMin} 分</span> ` : ''}${ro ? '' : `${!s.released && (r.status === 'in_progress' || r.status === 'expired') && r.startedAt ? `<button class="btn sm ghost" data-add="${esc(r.email)}">加時</button> ` : ''}${r.status === 'not_started' && !s.released ? `<button class="btn sm ghost danger" data-rm="${esc(r.email)}">移除</button>` : ''}${exam && !s.released && X.me.can && X.me.can.retake && (r.status === 'submitted' || r.status === 'expired') ? `<button class="btn sm ghost" data-ret="${esc(r.email)}" title="原本的作答另外保存、不再計分，專員從頭重新作答">退回重考</button>` : ''}`}</td></tr>`).join('')}</tbody></table></div>`
      : `<div class="row" style="margin-bottom:10px"><span class="seg xs-seg"><a class="${by === 'q' ? 'on' : ''}" href="${href('grade', 'q')}">依題目</a><a class="${by === 'a' ? 'on' : ''}" href="${href('grade', 'a')}">依專員</a></span>
          <span class="small muted">${sub} / ${d.roster.length} 人交卷${exam ? gradeLeft(d) : ''}</span></div>
        ${by === 'a' ? `<div class="card scroll-x"><table class="list"><thead><tr><th>專員</th><th>狀態</th><th>交卷</th><th>${exam ? '成績' : '答對'}</th><th>離開頁面</th><th></th></tr></thead><tbody>
          ${d.roster.map((r) => `<tr class="${r.email === want ? 'sel' : ''}"><td>${esc(r.email)} ${retakeChip(r.retakes)}</td><td>${atChip(r.status === 'not_started' && s.state === 'closed' ? { status: 'expired' } : r)}</td>
            <td class="small muted">${fmtDT(r.submittedAt)}</td>
            <td class="small">${r.result ? (exam ? `<b>${r.result.score}</b> / ${r.result.total}<div class="soft">原始 ${r.result.raw} / ${r.result.rawTotal}</div>${r.result.pending ? `<div class="soft">${r.result.pending} 題簡答待給分</div>` : ''}` : mcRight(d.key, r)) : '-'}</td>
            <td class="small">${r.track ? esc(window.RRQP_CASES.leaveSummary(r.track)) : '-'}</td>
            <td style="text-align:right;white-space:nowrap">${r.status !== 'not_started' ? `<a class="btn sm" href="${href('grade', 'a')}&agent=${encodeURIComponent(r.email)}">${exam && !s.released && !ro ? '批改' : '查看作答'}</a>` : ''}</td></tr>`).join('')}</tbody></table></div>` : ''}`}
      <div id="xAgent" style="margin-top:14px"></div>`;
    $('#xr').onclick = () => session(id, ctx);
    if (ro) { $('#xr').onclick = () => session(id, ctx); if (view === 'content') bindContent(d); else if (view === 'grade') { if (by === 'q') questionPanel($('#xAgent'), d, false); else { const r = d.roster.find((x) => x.email === want); if (r) agentPanel($('#xAgent'), d, r, false); } } return; }
    $('#xCopy').onclick = () => navigator.clipboard.writeText(xLink(s.sessionId)).then(() => X.toast('已複製'));
    const act = (btn, fn) => { const b = $(btn); if (b) b.onclick = fn; };
    act('#xEnd', async () => { if (!(await X.confirmBox(`提前結束 ${s.sessionId}？作答中的專員會自動交卷。`, '提前結束', undefined, true))) return; await run('x_end'); });
    act('#xOpen', async () => { await run('x_openAnswers', { open: !s.answersOpen }); });
    act('#xRel', async () => {
      const pend = d.roster.filter((r) => r.result && r.result.pending).length;
      if (!(await X.confirmBox(`公布 ${s.sessionId} 的成績？${pend ? `\n還有 ${pend} 位專員的簡答題沒給分，沒給分的以 0 分計。` : ''}\n公布後專員看得到分數、正解與詳解。`, '公布成績'))) return;
      await run('x_release');
    });
    act('#xDel', async () => {
      if (!(await X.confirmBox(`刪除 ${s.sessionId}？作答、給分、成績都會刪除，不能復原。`, '刪除', undefined, true))) return;
      try { await X.api('x_delete', { sessionId: s.sessionId }); X.toast('已刪除'); location.hash = '#/sessions'; } catch (e) { X.toast(e.message, 5000); }
    });
    async function run(action, extra) {
      try { await X.api(action, Object.assign({ sessionId: s.sessionId }, extra || {})); X.toast('完成'); session(id, ctx); } catch (e) { X.toast(e.message, 6000); }
    }
    // 加入專員、延長結束時間：在上方展開一個小表單
    // 小表單放在頁面上方：從名單下面按按鈕時要捲上去，不然看起來像沒反應（2026-11-26 Chris 回報退回重考按了沒反應）
    //   同一顆按鈕再按一次＝收起來；按別顆＝換成新的表單
    const panel = (html, onOk) => {
      const p = $('#xPanel');
      if (p.innerHTML && p.dataset.html === html) { p.innerHTML = ''; p.dataset.html = ''; return; }
      p.dataset.html = html;
      p.innerHTML = `<div class="card pad" style="display:flex;flex-direction:column;gap:10px;margin-bottom:12px">${html}
        <div class="row"><button class="btn brand" id="xpOk">確定</button><button class="btn" id="xpNo">取消</button></div></div>`;
      p.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const first = p.querySelector('input, textarea');
      if (first) setTimeout(() => first.focus({ preventScroll: true }), 300);
      $('#xpNo').onclick = () => { p.innerHTML = ''; p.dataset.html = ''; };
      $('#xpOk').onclick = async () => { $('#xpOk').disabled = true; try { await onOk(); } catch (e) { X.toast(e.message, 6000); $('#xpOk').disabled = false; } };
    };
    act('#xAdd', () => panel(`<b>加入專員</b><textarea id="xpEm" rows="3" style="width:min(520px,100%);border:1px solid var(--line2);border-radius:8px;padding:8px" placeholder="一行一個 email，或用逗號分隔"></textarea>
      <div class="small muted">新加的專員照原本的開放時間（到 ${fmtDT(s.endAt)}）與作答時間 ${s.minutes} 分鐘作答；需要更多時間請一起延長結束時間。</div>`, async () => {
      const r = await X.api('x_addAssignees', { sessionId: s.sessionId, emails: $('#xpEm').value.split(/[\s,;，、]+/).filter(Boolean) });
      X.toast(`已加入 ${r.added.length} 位`); session(id, ctx);
    }));
    act('#xExt', () => panel(`<b>延長結束時間</b><div class="row">目前：${fmtDT(s.endAt)}　新的結束時間 <input type="datetime-local" id="xpEnd" value="${toLocal(Math.max(s.endAt, Date.now()) + 86400000)}"></div>
      <div class="small muted">${s.state === 'closed' ? '測驗已結束（或提前結束），延長後會重新開放，還沒交卷的人可以繼續作答。' : '還沒交卷的人可以作答到新的結束時間；每個人的作答時間仍是 ' + s.minutes + ' 分鐘。'}</div>`, async () => {
      await X.api('x_extend', { sessionId: s.sessionId, endAt: new Date($('#xpEnd').value).getTime() });
      X.toast('已延長'); session(id, ctx);
    }));
    const endHint = (over) => (over ? '。注意：有人的作答時間會超過整場結束時間，超過的部分不算，需要的話請再「延長結束時間」' : '');
    act('#xMin', () => panel(`<b>延長作答時間（整場）</b><div class="row">目前 ${s.minutes} 分鐘，改成 <input type="number" id="xpMin" min="${s.minutes + 1}" max="600" value="${s.minutes + 10}"> 分鐘</div>
      <div class="small muted">所有人一起適用：作答中的人畫面上的倒數會跟著變長（一分鐘內更新）；還沒開始的人用新的時間；已經交卷的人不會重新打開。</div>`, async () => {
      const r = await X.api('x_setMinutes', { sessionId: s.sessionId, minutes: Number($('#xpMin').value) });
      X.toast(`作答時間改成 ${r.minutes} 分鐘${endHint(r.overEnd)}`, r.overEnd ? 8000 : 3000); session(id, ctx);
    }));
    $$('[data-add]').forEach((b) => b.addEventListener('click', () => panel(`<b>個別加時：${esc(b.dataset.add)}</b><div class="row">多給 <input type="number" id="xpAdd" min="1" max="120" value="10"> 分鐘</div>
      <div class="small muted">例如當機、斷線。只加在這位專員身上；他的畫面一分鐘內會更新倒數。已經被自動交卷的人沒辦法再加時。</div>`, async () => {
      const r = await X.api('x_addTime', { sessionId: s.sessionId, email: b.dataset.add, minutes: Number($('#xpAdd').value) });
      X.toast(`已加時，這位專員累計多 ${r.extraMin} 分鐘${endHint(r.overEnd)}`, r.overEnd ? 8000 : 3000); session(id, ctx);
    })));
    // 退回重考（2026-11-26）：例如被誤交卷；原本的作答搬到 returned 保存
    $$('[data-ret]').forEach((b) => b.addEventListener('click', () => panel(`<b>退回重考：${esc(b.dataset.ret)}</b>
      <div class="row">原因 <input type="text" id="xpRet" maxlength="200" placeholder="例如：電腦時鐘不準被自動交卷" style="flex:1;min-width:260px"></div>
      <div class="small muted">原本的作答、足跡和分數會另外保存，不再計分；專員要從頭重新作答，重新計 ${s.minutes} 分鐘。測驗已結束的話，要先延長結束時間專員才進得去。</div>`, async () => {
      const reason = $('#xpRet').value.trim();
      if (!reason) throw new Error('請填退回原因');
      const r = await X.api('x_returnAttempt', { sessionId: s.sessionId, email: b.dataset.ret, reason });
      X.toast('已退回，專員可以重新作答' + (r.hint ? '。' + r.hint : ''), r.hint ? 8000 : 3000); session(id, ctx);
    })));
    $$('[data-rm]').forEach((b) => b.addEventListener('click', async () => {
      if (!(await X.confirmBox(`把 ${b.dataset.rm} 從這場測驗移除？`, '移除', undefined, true))) return;
      try { await X.api('x_removeAssignee', { sessionId: s.sessionId, email: b.dataset.rm }); X.toast('已移除'); session(id, ctx); } catch (e) { X.toast(e.message, 5000); }
    }));
    if (view === 'content') return bindContent(d);
    if (view !== 'grade') return;
    if (by === 'q') return questionPanel($('#xAgent'), d, exam && !s.released);
    const r = d.roster.find((x) => x.email === want);
    if (r) agentPanel($('#xAgent'), d, r, exam && !s.released);
  }
  // 退回重考紀錄（2026-11-26）：講師、TL 都看得到；滑過去看誰、何時、原因
  function retakeChip(list) {
    if (!list || !list.length) return '';
    return `<span class="chip warn" title="${esc(list.map((x) => `${fmtDT(x.at)}　${x.by}：${x.reason || '-'}`).join('\n'))}">退回重考 ${list.length} 次</span>`;
  }
  // ═════════════════════════════ 單場：考題內容（2026-11-24 Chris） ═════════════════════════════
  // 發佈後看這份考卷用了哪些題目：一題一列；同一案件有多題時，案件只寫在第一題。
  // 正解預設不顯示（避免投影、分享螢幕時洩題），勾「顯示正解」才出現。答對率和「成績與分析」同一個算法（db.js xResultsOf）：
  // 每位交卷專員這題的得分 ÷ 配分 的平均，沒給分的簡答不算；練習（配分 0）的選擇題用答對人數。
  const SHOW_ANS = {};
  const LET10 = 'ABCDEFGHIJ';
  function sopInfo(m, d) {
    let sp = {};
    try { sp = JSON.parse(m.sop || '{}'); } catch (_) { /* 舊資料 */ }
    const node = ((d.sops[sp.taskbot] || {}).nodes || {})[sp.start] || (sp.snap || {})[sp.start] || null;
    const name = node ? node.name || node.q || '' : '';
    return { sp, start: name ? `${name}（${sp.start}）` : sp.start || '-', steps: (sp.route || []).length, acts: (sp.acts || []).length };
  }
  function qRate(d, i, m) {
    const done = d.roster.filter((r) => r.status === 'submitted' && r.result);
    if (!done.length) return { txt: '—' };
    if (m.type === 'mc' && !(m.points > 0)) {
      const ok = done.filter((r) => MC().mcOk(m, (((r.answers || {})[i] || {}).mc || {})[m.id])).length;
      return { v: ok / done.length };
    }
    const got = done.map((r) => r.result.detail[i + ':' + m.id]).filter((v) => v !== null && v !== undefined);
    if (!got.length) return { txt: m.type === 'mc' ? '—' : '批改中' };
    if (!(m.points > 0)) return { txt: '—' };
    return { v: got.reduce((n, v) => n + v / m.points, 0) / got.length, wait: done.length - got.length };
  }
  // 閱卷批改上方的摘要：還有幾份要講師給分（自動判定的 SOP 不算）
  function gradeLeft(d) {
    const n = d.roster.reduce((t, r) => t + ((r.result && r.result.pending) || 0), 0);
    return n ? `・待給分 ${n} 份` : d.roster.some((r) => r.result) ? '・都給分了' : '';
  }
  function contentPanel(d) {
    const s = d.session, exam = s.mode === 'exam', show = !!SHOW_ANS[s.sessionId];
    const cases = d.key.cases || [];
    let no = 0;
    const rows = cases.map((kc, i) => kc.mods.map((m, qi) => {
      no++;
      const rt = qRate(d, i, m);
      const rate = rt.v === undefined ? `<span class="soft">${rt.txt}</span>`
        : `<span style="${rt.v < 0.5 ? 'color:var(--link);font-weight:700' : ''}">${Math.round(rt.v * 100)}%</span>${rt.wait ? `<div class="small soft" style="white-space:nowrap">${rt.wait} 人待給分</div>` : ''}`;
      let q = '', ans = '';
      if (m.type === 'sop') {
        const si = sopInfo(m, d);
        q = `SOP 路徑：從 ${esc(si.start)} 開始`;
        ans = `標準路線 ${si.steps} 步${si.acts ? `・操作 ${si.acts} 個` : ''}`;
      } else if (m.type === 'mc') {
        q = esc(m.q);
        ans = `正解 ${MC().mcKey(m).map((x) => `${LET10[x]}. ${esc(m.options[x] || '')}`).join('、') || '（沒有設定）'}`;
      } else {
        q = esc(m.q);
        ans = m.standard ? `<div class="xc-std">${esc(m.standard)}</div>` : '標準答案：（沒有填）';
      }
      // 2026-11-24 Chris：案件編號、案件標題各一欄，同一案件的題目合併成一格；題號用「案件-題」（和依題目批改、成績與分析一致）
      const n = kc.mods.length, caseCells = qi > 0 ? '' : `<td rowspan="${n}" class="xc-cid">${X.me.isTL ? `<b class="mono">${esc(kc.caseId)}</b>` : `<a href="#/case/${esc(kc.caseId)}" target="_blank" rel="noopener" title="在新分頁打開案件的「答案與詳解」（顯示的是案件目前的內容）"><b class="mono">${esc(kc.caseId)}</b></a>`}</td>
        <td rowspan="${n}" class="xc-case">${esc(kc.title || '')}<div class="small soft">${exam && kc.weight !== undefined ? `案件 ${kc.weight} 分・` : ''}${n} 題</div></td>`;
      return `<tr class="${qi === 0 && i > 0 ? 'xc-first' : ''}">${caseCells}<td class="xc-no">${i + 1}-${qi + 1}</td>
        <td><span class="chip">${QTYPE(m.type)}${MC().mcMulti(m) && m.type === 'mc' ? '・複選' : ''}</span></td>
        <td class="xc-q">${q}${show ? `<div class="small xc-ans">${ans}</div>` : ''}</td>
        ${exam ? `<td style="text-align:right">${m.points}</td>` : ''}<td style="text-align:right">${rate}</td></tr>`;
    }).join('')).join('');
    return `<div class="row" style="margin-bottom:8px"><span class="small muted">${cases.length} 個案件・${no} 題${exam ? '・滿分 100 分' : ''}</span><span class="spacer"></span>
        <label class="small" style="display:inline-flex;gap:6px;align-items:center;cursor:pointer"><input type="checkbox" id="xcAns" ${show ? 'checked' : ''}> 顯示正解</label></div>
      <div class="card scroll-x"><table class="list xc-t"><thead><tr><th style="width:84px">案件編號</th><th style="width:20%">案件標題</th><th style="width:56px">題號</th><th style="width:96px">題型</th><th>題目</th>${exam ? '<th style="width:60px;text-align:right">配分</th>' : ''}<th style="width:96px;text-align:right">答對率</th></tr></thead>
        <tbody>${rows}</tbody></table></div>
      <div class="small soft" style="margin-top:8px">點案件編號在新分頁打開「答案與詳解」（顯示案件目前的內容；發佈後案件若有修改，考卷仍是發佈當下的版本）。答對率在有人交卷後顯示，低於 50% 標橘色；簡答以已給分的人計算。</div>`;
  }
  function bindContent(d) {
    const cb = $('#xcAns');
    if (cb) cb.onchange = () => { SHOW_ANS[d.session.sessionId] = cb.checked; $('#xcBox').innerHTML = contentPanel(d); bindContent(d); };     // 只重畫這一塊，不重新讀資料
  }

  // SOP 路徑題（2026-11-21 第 3 步）：比對規則在 db.js sopGrade（路線不完整走在標準路線上就全錯；動作逐節點比對）
  //   自動判定（路線錯＝0、全對＝滿分）的不用給分；有文字要確認或操作有錯的才要講師給分
  const sopG = (m, a) => (window.RRQP_DB && window.RRQP_DB.sopGrade ? window.RRQP_DB.sopGrade(m.sop, ((a && a.sop) || {})[m.id]) : null);
  const QTYPE = (t) => (t === 'mc' ? '選擇題' : t === 'sop' ? 'SOP 路徑' : '簡答');
  // 選擇題（2026-11-23）：單選或複選；LET 字母、選項文字
  const MC = () => window.RRQP_DB;
  const mcTxt = (m, p, LET) => MC().mcKey({ answer: p }).map((x) => `${LET[x]}. ${esc(m.options[x] || '')}`).join('、');
  /** SOP 題給分欄的提示：自動判定的分數，或建議分數 */
  function sopPlaceholder(m, a) {
    const g = sopG(m, a);
    if (!g) return '';
    if (g.auto !== null) return `placeholder="自動 ${Math.round(g.auto * m.points * 100) / 100}"`;
    return g.suggest !== null ? `placeholder="建議 ${Math.round(g.suggest * m.points * 100) / 100}"` : 'placeholder="待給分"';
  }
  // 練習的「答對」：逐題判定，所有題型共用（db.js qRight）；還沒判定的（例如簡答）另外列
  const mcRight = (key, r) => {
    const x = window.RRQP_DB.xRight(key, r, null);
    return `${x.n ? `答對 ${x.ok} / ${x.n} 題` : '-'}${x.wait ? `<div class="soft">${x.wait} 題沒有自動判定</div>` : ''}`;
  };

  /** 單一專員：每個案件的作答、正解、足跡卡；考試可以給簡答分數 */
  function agentPanel(box, d, r, canGrade) {
    const LET = 'ABCDEFGHIJ';
    box.innerHTML = `<div class="card pad"><div class="row"><h2>${esc(r.email)}</h2><span class="small muted">${esc(window.RRQP_CASES.leaveSummary(r.track))}</span><span class="spacer"></span>
        ${canGrade ? '<button class="btn brand" id="xSave">儲存給分</button>' : ''}</div>
      ${(d.key.cases || []).map((kc, i) => {
        const a = r.answers[i] || {}, paper = JSON.parse((d.paper.cases[i] || {}).body || '{}');
        return `<div style="margin-top:16px"><h3>案件 ${i + 1}・<span class="mono">${esc(kc.caseId)}</span> ${esc(kc.title)}${kc.weight !== undefined ? ` <span class="small soft">（本案件 ${kc.weight} 分）</span>` : ''}</h3>
          <div class="lib-grid" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr);margin-top:8px">
            <div>${kc.mods.map((m, qi) => {
              if (m.type === 'mc') {
                const pick = (a.mc || {})[m.id], ok = MC().mcOk(m, pick), multi = MC().mcMulti(m);
                return `<div class="xq"><b>${qi + 1}. ${esc(m.q)}</b>${multi ? '（複選）' : ''}（${m.points} 分）<div>專員：<span class="${ok ? 'ok' : 'bad'}">${pick === undefined ? '沒作答' : mcTxt(m, pick, LET)}</span>
                  ${ok ? '✓' : `／正解 ${mcTxt(m, m.answer, LET)}`}</div></div>`;
              }
              const v = (r.scores || {})[i + ':' + m.id];
              return `<div class="xq"><b>${qi + 1}. ${esc(m.q)}</b>（${m.points} 分）
                ${m.type === 'sop' ? window.RRQP_CASES.sopReview(m.sop, (a.sop || {})[m.id], d.sops)
                  : `<div style="white-space:pre-wrap;background:var(--chip);border-radius:8px;padding:8px;margin:6px 0">${esc((a.short || {})[m.id] || '（沒作答）')}</div>`}
                ${m.type === 'sop' ? '' : `<div class="small soft">標準答案</div><div class="xstd">${esc(m.standard || '（沒有填）')}</div>`}
                ${canGrade ? `<div class="row" style="margin-top:6px">給分 <input class="sc" type="number" min="0" max="${m.points}" step="any" data-k="${i}:${esc(m.id)}" value="${v === null || v === undefined ? '' : v}" ${m.type === 'sop' ? sopPlaceholder(m, a) : ''}> / ${m.points}${m.type === 'sop' ? '<span class="small soft">（留空＝用自動判定）</span>' : ''}</div>`
                  : (v !== undefined && v !== null ? `<div class="small">得分 ${v} / ${m.points}</div>` : '')}
                ${aiTip((r.ai || {})[i + ':' + m.id], m.points, canGrade)}</div>`;
            }).join('')}</div>
            <div>${window.RRQP_CASES.footprint(paper, r.track, i, a, kc)}</div></div></div>`;
      }).join('')}</div>`;
    bindAiUse(box);
    const sv = $('#xSave', box);
    if (sv) sv.onclick = async () => {
      const scores = {};
      $$('input.sc', box).forEach((x) => { scores[x.dataset.k] = x.value === '' ? null : Number(x.value); });
      sv.disabled = true;
      try { await X.api('x_grade', { sessionId: d.session.sessionId, email: r.email, scores }); X.toast('已儲存給分'); session(d.session.sessionId, X); }
      catch (e) { X.toast(e.message, 5000); sv.disabled = false; }
    };
    box.scrollIntoView({ behavior: 'smooth' });
  }

  // ═════════════════════════════ 閱卷發佈、歷史成績 ═════════════════════════════
  // DMS 考試滿分固定 100（發佈時各案件配分合計 100），所以分數直接寫「分」（2026-11-27 原本寫 %，和名單的「64 / 100」看起來像兩種東西）
  const pctTxt = (v) => (v === null || v === undefined ? '-' : `${Math.round(v * 10) / 10} 分`);
  const numTxt = (v) => (v === null || v === undefined ? '-' : String(Math.round(v * 10) / 10));
  const rateTxt = (v) => (v === null || v === undefined ? '-' : `${Math.round(v * 100)}%`);
  const durTxt = (s) => `${Math.floor((s || 0) / 60)}:${String((s || 0) % 60).padStart(2, '0')}`;

  /** 閱卷發佈：已結束的 DMS 考題測驗 */
  async function gradingList(box, ctx) {
    X = ctx;
    let d;
    try { d = await X.api('x_list'); } catch (e) { X.showError(e, box); return; }
    const list = d.sessions.filter((s) => s.state === 'closed' || s.state === 'released');
    box.innerHTML = `<h2 style="margin:18px 0 8px">DMS 考題測驗</h2>${!list.length ? '<div class="card empty-state">還沒有已結束的 DMS 考題測驗</div>' : `<div class="card scroll-x"><table class="list"><thead><tr><th>測驗</th><th>類型</th><th>開放時間</th><th>交卷</th><th>狀態</th></tr></thead><tbody>
      ${list.map((s) => `<tr class="click" data-x="${esc(s.sessionId)}"><td><b>${esc(s.sessionId)}</b> ${esc(s.title)}</td><td class="small">${MODE(s)}</td>
        <td class="small">${fmtDT(s.startAt)} – ${fmtDT(s.endAt)}</td><td class="small">${s.submitted} / ${s.assigned}</td><td>${stChip(s.state)}</td></tr>`).join('')}</tbody></table></div>`}`;
    $$('[data-x]', box).forEach((tr) => tr.addEventListener('click', () => { location.hash = '#/xsession/' + tr.dataset.x + '?view=grade'; }));
  }

  /** 歷史成績・依測驗：DMS 考題測驗的摘要（d＝x_resultsIndex 的結果） */
  function resultsSessions(box, d) {
    box.innerHTML = `<h2 style="margin:18px 0 8px">DMS 考題測驗</h2>${!d.sessions.length ? '<div class="card empty-state">還沒有 DMS 考題測驗的成績</div>' : `<div class="card scroll-x"><table class="list"><thead><tr>
      <th>測驗</th><th>類型</th><th>狀態</th><th>交卷</th><th>平均</th><th>低於 ${d.coachLine} 分</th><th>需要留意</th></tr></thead><tbody>
      ${d.sessions.map((s) => `<tr class="click" data-x="${esc(s.sessionId)}"><td><b>${esc(s.sessionId)}</b> ${esc(s.title)}<div class="small soft">${fmtDT(s.startAt)}</div></td>
        <td class="small">${MODE(s)}</td><td>${stChip(s.state)}</td><td class="small">${s.submitted} / ${s.assigned}</td>
        <td><b>${s.mode === 'practice' ? `答對率 ${rateTxt(s.mcRate)}` : pctTxt(s.avg)}</b></td>
        <td>${s.mode === 'practice' ? '-' : s.coaching ? `<span class="cnt o" title="${s.coaching} 人">${s.coaching}</span>` : s.submitted ? '<span class="dotok">✓</span>' : '-'}</td><td>${s.flagged ? `<span class="cnt o" title="${s.flagged} 人">${s.flagged}</span>` : s.submitted ? '<span class="dotok">✓</span>' : '-'}</td></tr>`).join('')}</tbody></table></div>`}`;
    $$('[data-x]', box).forEach((tr) => tr.addEventListener('click', () => { location.hash = '#/xresults/' + tr.dataset.x; }));
  }

  /** 單場成績：每題答對率、名單（分數、錯在哪、足跡摘要）、匯出 CSV */
  async function results(id, ctx) {
    X = ctx;
    const main = X.shell('results', '<div class="empty-state"><span class="spin"></span></div>');
    let d;
    try { d = await X.api('x_results', { sessionId: id }); } catch (e) { X.showError(e, main); return; }
    const s = d.session, st = d.stats, practice = s.mode === 'practice';
    const rows = d.rows.slice().sort((a, b) => (a.pct === null ? -1 : b.pct === null ? 1 : a.pct - b.pct));
    main.innerHTML = `<div class="row"><a href="#/results">← 歷史成績</a><h1>${esc(s.sessionId)} ${esc(s.title)}</h1><span class="chip">${MODE(s)}</span>${stChip(s.state)}<span class="spacer"></span>
        <button class="btn icon" id="xRf" type="button" title="重新整理" aria-label="重新整理">${REFRESH_SVG}</button><a class="btn" href="#/xsession/${esc(s.sessionId)}?view=grade" style="display:inline-grid;place-items:center;text-decoration:none">${X.me.isTL ? '作答明細' : '批改／作答明細'}</a><button class="btn" id="xCsv">匯出 CSV</button></div>
      ${!practice && !s.released ? (X.me.isTL ? '<div class="banner warn">尚未公布：分數可能還會調整，專員也還看不到。</div>' : `<div class="banner warn">成績還沒公布，專員看不到。<a href="#/xsession/${esc(s.sessionId)}?view=grade">前往批改 →</a></div>`) : ''}
      <div class="stats five">
        <div class="card pad"><div class="small soft">${practice ? '平均答對率' : '平均'}</div><div class="big">${practice ? rateTxt(st.mcRate) : pctTxt(st.avg)}</div></div>
        <div class="card pad"><div class="small soft">交卷</div><div class="big">${st.submitted} <span class="soft" style="font-size:16px">/ ${st.assigned}</span></div></div>
        <div class="card pad"><div class="small soft">低於 ${d.coachLine} 分</div><div class="big" style="color:${st.coaching ? 'var(--err)' : 'inherit'}">${practice ? '-' : st.coaching + ' 人'}</div></div>
        <div class="card pad"><div class="small soft">需要留意</div><div class="big">${st.flagged} 人</div></div>
        <div class="card pad"><div class="small soft">中位數・最高／最低</div><div class="big">${practice ? '-' : pctTxt(st.median)}</div><div class="small soft">${practice || st.max === null ? '' : numTxt(st.max) + ' / ' + numTxt(st.min)}</div></div>
      </div>
      <div class="card pad"><h2>每題答對率</h2><div class="rates">${d.questions.map((q) => `<div class="rate" title="${esc(q.q)}"><div class="rbar"><i style="height:${q.rate === null ? 0 : Math.round(q.rate * 100)}%;background:${q.rate === null ? '#ccc' : q.rate >= 0.8 ? '#16a34a' : q.rate >= 0.5 ? '#d97706' : '#dc2626'}"></i></div>
        <b>${q.rate === null ? '-' : Math.round(q.rate * 100) + '%'}</b><span>案件${q.caseNo}-${q.no} ${QTYPE(q.type)}</span></div>`).join('')}</div>
        <div class="small soft">簡答題以已給分的人計算平均得分率；滑過長條可以看題目。</div></div>
      <div class="card scroll-x"><table class="list"><thead><tr><th>專員</th><th>${practice ? '答對率' : '分數'}</th><th>錯在哪</th><th>作答時間</th><th>離開頁面</th><th>需要留意</th><th></th></tr></thead><tbody>
        ${rows.map((r) => `<tr><td>${esc(r.email)}${r.extraMin ? ` <span class="chip">加時 ${r.extraMin} 分</span>` : ''} ${retakeChip(r.retakes)}</td>
          <td>${r.status !== 'submitted' ? atChip(r.status === 'not_started' && s.state !== 'open' ? { status: 'expired' } : r) : practice ? `<b>${rateTxt(r.mcRate)}</b>` : `<b style="font-size:18px">${r.score}</b> / ${r.total}<div class="small soft">原始 ${r.raw} / ${r.rawTotal}${r.pending ? `・${r.pending} 題待給分` : ''}</div>`}</td>
          <td class="small">${r.wrong.map((w) => esc(w.label) + (w.pending ? '（待給分）' : w.partial ? '（部分）' : '')).join('、') || (r.status === 'submitted' ? '—' : '')}</td>
          <td class="small">${r.status === 'submitted' ? durTxt(r.secs) : ''}</td><td class="small">${r.status === 'submitted' ? (r.leaves ? `${r.leaves} 次（${durTxt(r.leaveSecs)}）` : '0') : ''}</td>
          <td class="small">${r.flags.length ? `<span class="cnt o" title="${esc(r.flags.join('\n'))}">${r.flags.length}</span>` : ''}</td>
          <td style="text-align:right;white-space:nowrap">${r.coaching ? '<span class="chip warn">需輔導</span> ' : ''}${r.status === 'submitted' ? `<a class="btn sm" href="#/xsession/${esc(s.sessionId)}?view=grade&by=a&agent=${encodeURIComponent(r.email)}">明細</a>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
    $('#xRf').onclick = () => results(id, X);
    $('#xCsv').onclick = () => X.downloadCsv(`${s.sessionId}_results.csv`, [CSV_HEAD].concat(rows.map((r) => csvRow(Object.assign({ sessionId: s.sessionId, title: s.title, mode: s.mode, startAt: s.startAt }, r)))));
  }

  // 專員維度匯出（和 app.js 的變化題列合併）：一列＝某位專員的某一場
  const CSV_HEAD = ['專員', '測驗編號', '測驗名稱', '類型', '練習／考試', '開放時間', '狀態', '分數', '滿分', '百分比', '原始得分', '原始總分', '答對率', '需輔導', '錯在哪', '作答時間', '離開頁面次數', '離開總秒數', '需要留意', '交卷時間'];
  function csvRow(r) {
    const sub = r.status === 'submitted';
    return [r.email, r.sessionId, r.title, 'DMS 考題', r.mode === 'practice' ? '練習' : '考試', fmtDT(r.startAt), ATT_ZH[r.status] || r.status,
      sub && r.score !== null ? r.score : '', sub && r.total !== null ? r.total : '', sub && r.pct !== null ? r.pct : '', sub && r.raw != null ? r.raw : '', sub && r.rawTotal != null ? r.rawTotal : '', sub && r.mcRate !== null ? Math.round(r.mcRate * 100) + '%' : '',
      r.coaching ? 'Y' : '', r.wrong.map((w) => w.label + (w.pending ? '（待給分）' : w.partial ? '（部分）' : '')).join('、'),
      sub ? durTxt(r.secs) : '', sub ? r.leaves : '', sub ? r.leaveSecs : '', r.flags.join('；'), sub ? fmtDT(r.submittedAt) : ''];
  }

  /** AI 建議分數（批改 X001 寫進 grades.ai）；講師按「採用」才填進給分欄 */
  function aiTip(ai, max, canGrade) {
    if (!ai) return '';
    const low = Number(ai.confidence) < 0.7;
    return `<div class="small" style="margin-top:6px;padding:6px 8px;border-radius:8px;background:${low ? '#fef3c7' : '#eef2ff'}">
      AI 建議 <b>${ai.score} / ${max}</b>・信心度 ${Math.round(Number(ai.confidence) * 100)}%${low ? '（偏低，請細看）' : ''}　${esc(ai.reason || '')}
      ${canGrade ? ` <button class="btn sm aiUse" type="button" data-v="${esc(ai.score)}" data-c="${esc(ai.confidence)}">採用</button>` : ''}</div>`;
  }
  function bindAiUse(box) {
    $$('.aiUse', box).forEach((b) => b.addEventListener('click', () => {
      const inp = b.closest('.xq').querySelector('input.sc');
      if (inp) { inp.value = b.dataset.v; inp.dispatchEvent(new Event('input', { bubbles: true })); X.toast('已填入，記得按「儲存給分」'); }
    }));
  }

  /** 依題目：上方題目分頁，一次看一題所有人的答案（和 V2 閱卷一樣）；給分先記在 draft，切換題目不會不見，按「儲存給分」一次存 */
  let qTab = {};
  function questionPanel(box, d, canGrade) {
    const LET = 'ABCDEFGHIJ', sid = d.session.sessionId, done = d.roster.filter((r) => r.status === 'submitted');
    if (!done.length) { box.innerHTML = '<div class="card empty-state">還沒有人交卷</div>'; return; }
    const qs = (d.key.cases || []).flatMap((kc, i) => kc.mods.map((m, qi) => ({ k: i + ':' + m.id, i, qi, m, kc })));
    const qOf = (i, id) => qs.find((q) => q.i === i && q.m.id === id);
    const draft = {};                                             // { email: { k: 分數 } } 還沒儲存的給分
    const scoreOf = (r, k) => { const v = (draft[r.email] || {})[k]; return v !== undefined ? v : (r.scores || {})[k]; };
    const ansOf = (r, q) => ((r.answers[q.i] || {}).short || {})[q.m.id] || '';
    const pickOf = (r, i, id) => ((r.answers[i] || {}).mc || {})[id];
    const badge = (q) => {
      if (q.m.type !== 'short' && q.m.type !== 'sop') return '';
      // SOP：自動判定的（路線錯、全對）不用給分
      const left = done.filter((r) => { const v = scoreOf(r, q.k); return (v === undefined || v === null || v === '') && !(q.m.type === 'sop' && (sopG(q.m, r.answers[q.i]) || {}).auto != null); });
      const low = left.filter((r) => { const a = (r.ai || {})[q.k]; return a && Number(a.confidence) < 0.7; }).length;
      if (!left.length) return ' <span class="dotok" title="都給分了">✓</span>';
      return ` <span class="cnt g" title="待給分 ${left.length} 人">${left.length}</span>` + (low ? `<span class="cnt o" title="AI 低信心 ${low} 人">${low}</span>` : '');
    };
    function pickTxt(q, pick) {
      if (pick === undefined || pick === null) return '<span class="soft">沒作答</span>';
      const ok = MC().mcOk(q.m, pick);
      return `<span class="${ok ? 'okc' : 'errc'}">${mcTxt(q.m, pick, LET)}</span>`;
    }
    function mcView(q) {
      const picked = (r) => MC().mcKey({ answer: pickOf(r, q.i, q.m.id) });
      const cnt = q.m.options.map((_, oi) => done.filter((r) => picked(r).includes(oi)).length), none = done.filter((r) => !picked(r).length).length;
      const right = done.filter((r) => MC().mcOk(q.m, pickOf(r, q.i, q.m.id))).length;
      return `<div class="small soft" style="margin:4px 0 10px">${MC().mcMulti(q.m) ? '複選・' : ''}正解 <b>${mcTxt(q.m, q.m.answer, LET)}</b>　｜　答對 ${right} 人　｜　${q.m.options.map((_, oi) => `${LET[oi]} ${cnt[oi]} 人`).join('・')}・沒作答 ${none} 人</div>
        <div class="scroll-x"><table class="list" style="table-layout:fixed;min-width:480px"><colgroup><col style="width:40%"><col></colgroup><thead><tr><th>專員</th><th>選了</th></tr></thead><tbody>
        ${done.map((r) => `<tr><td>${esc(r.email)}</td><td>${pickTxt(q, pickOf(r, q.i, q.m.id))}</td></tr>`).join('')}</tbody></table></div>`;
    }
    function shortView(q) {
      const bound = q.m.bindTo && q.m.type !== 'sop' ? qOf(q.i, q.m.bindTo) : null;
      // 標準答案保留講師填的換行（2026-11-24：原本擠成一段）；太長就在框裡捲動
      return `<div class="small soft" style="margin:4px 0 ${q.m.type !== 'sop' && q.m.standard ? 0 : 10}px">${q.m.type === 'sop' ? '標準答案：講師設定的 SOP 路線（比對之後會做）' : `標準答案${q.m.standard ? '' : '：（沒有填）'}`}${bound ? `　｜　說明案件${q.i + 1}-${bound.qi + 1} 的選擇（正解 ${LET[bound.m.answer]}）` : ''}</div>${q.m.type !== 'sop' && q.m.standard ? `<div class="xstd">${esc(q.m.standard)}</div>` : ''}
        <div class="scroll-x"><table class="list xqt" style="table-layout:fixed;min-width:${bound ? 760 : 660}px"><colgroup><col style="width:20%">${bound ? '<col style="width:13%">' : ''}<col><col style="width:28%"><col style="width:${canGrade ? 120 : 80}px"></colgroup>
        <thead><tr><th>專員</th>${bound ? `<th>${q.i + 1}-${bound.qi + 1} 選了</th>` : ''}<th>答案</th><th>AI 建議</th><th>給分</th></tr></thead><tbody>
        ${done.map((r) => { const v = scoreOf(r, q.k); return `<tr class="xq"><td class="small" style="word-break:break-all">${esc(r.email)}</td>
          ${bound ? `<td class="small" data-l="${q.i + 1}-${bound.qi + 1} 選了">${pickTxt(bound, pickOf(r, q.i, bound.m.id))}</td>` : ''}
          <td style="white-space:pre-wrap;word-break:break-word">${ansOf(r, q) ? esc(ansOf(r, q)) : '<span class="soft">（沒作答）</span>'}${((r.ai || {})[q.k] || {}).zh ? `<div class="soft small" style="margin-top:4px">中文（AI 翻譯）：${esc(r.ai[q.k].zh)}</div>` : ''}</td>
          <td>${aiTip((r.ai || {})[q.k], q.m.points, canGrade) || '<span class="small soft">—</span>'}</td>
          <td style="white-space:nowrap" data-l="給分">${canGrade ? `<input class="sc" type="number" min="0" max="${q.m.points}" step="any" style="width:56px" data-e="${esc(r.email)}" data-k="${q.k}" value="${v === null || v === undefined ? '' : v}"> / ${q.m.points}`
            : (v !== null && v !== undefined ? `${v} / ${q.m.points}` : '<span class="soft">-</span>')}</td></tr>`; }).join('')}</tbody></table></div>`;
    }
    // SOP 題：一位專員一張卡（2026-11-21 改版：原本塞在表格一欄裡，比對被擠得很窄）
    function sopView(q) {
      const st = done.map((r) => ({ r, g: sopG(q.m, r.answers[q.i]) || {} }));
      const ok = st.filter((x) => x.g.routeOk).length, prac = d.session.mode === 'practice';
      const tag = (cls, t) => `<span class="xsop-tag ${cls}">${t}</span>`;
      return `<div class="small soft" style="margin:4px 0 10px">路線正確 ${ok} / ${done.length} 人。${prac ? '練習不計分，只看比對。' : '路線錯誤＝0 分、路線與操作全對＝滿分（自動判定，給分欄留空即可）；其他要講師給分。'}</div>
        ${st.map(({ r, g }) => { const v = scoreOf(r, q.k), ph = sopPlaceholder(q.m, r.answers[q.i]);
          const acts = !g.acts || (!g.acts.length && !(g.outside || []).length) ? '' : g.actsOk === true ? tag('ok', '操作正確') : g.actsOk === false ? tag('bad', '操作有錯') : tag('chk', '操作需確認');
          const sc = prac ? '' : canGrade ? `<span class="xsop-sc">給分 <input class="sc" type="number" min="0" max="${q.m.points}" step="any" style="width:70px" data-e="${esc(r.email)}" data-k="${q.k}" value="${v === null || v === undefined ? '' : v}" ${ph}> / ${q.m.points}</span>`
            : `<span class="xsop-sc">${v !== null && v !== undefined ? `${v} / ${q.m.points}` : g.auto != null ? `${Math.round(g.auto * q.m.points * 100) / 100} / ${q.m.points}（自動）` : '-'}</span>`;
          return `<div class="xsop"><div class="xsop-h"><b class="xsop-em">${esc(r.email)}</b>
              ${g.routeOk ? tag('ok', '路線正確') : tag('bad', `第 ${(g.diverge || 0) + 1} 步開始不同`)}${acts}${g.changes ? tag('', `改過答案 ${g.changes} 次`) : ''}
              <span class="spacer"></span>${sc}</div>
            <details class="xsop-d" ${st.length === 1 ? 'open' : ''}><summary class="small">看比對</summary>${window.RRQP_CASES.sopReview(q.m.sop, ((r.answers[q.i] || {}).sop || {})[q.m.id], d.sops)}</details></div>`; }).join('')}`;
    }
    function render() {
      let cur = qs.find((q) => q.k === qTab[sid]) || qs.find((q) => q.m.type === 'short') || qs[0];
      qTab[sid] = cur.k;
      box.innerHTML = `<div class="card pad">
        <div class="row"><h2>依題目${canGrade ? '批改' : '檢視'}</h2><span class="small muted">${done.length} 人交卷</span><span class="spacer"></span>
          ${canGrade ? `<button class="btn" id="xCmd" title="貼到 SeaTalk 的 @RRTP Assistant">複製批改指令</button>
            <span class="small">AI 信心度 ≥ <input id="xTh" type="number" min="0" max="1" step="0.05" value="0.85" style="width:64px"></span><button class="btn" id="xUseAll">全部採用</button>
            <button class="btn brand" id="xSaveQ">儲存給分</button>` : ''}</div>
        ${canGrade ? '<div class="small soft" style="margin-top:4px">AI 分數只是建議：採用後會填進給分欄，按「儲存給分」才算數（切換題目不會不見）。「全部採用」套用到所有題目，已經有分數的不會被覆蓋。</div>' : ''}
        ${qs.some((q) => q.m.type === 'short') ? '<div class="dotlegend"><span><span class="cnt g"></span> 待給分</span><span><span class="cnt o"></span> AI 低信心</span><span><span class="dotok">✓</span> 都給分了</span></div>' : ''}
        <div class="tabs xqtabs" role="tablist" style="margin-top:6px">${qs.map((q) => `<button class="tab ${q.k === cur.k ? 'on' : ''}" data-q="${q.k}" role="tab">${q.i + 1}-${q.qi + 1} ${QTYPE(q.m.type)}${badge(q)}</button>`).join('')}</div>
        <h3 style="margin-top:6px">案件 ${cur.i + 1}・第 ${cur.qi + 1} 題（${QTYPE(cur.m.type)}${d.session.mode === 'practice' ? '' : `，${cur.m.points} 分`}）<span class="small soft mono"> ${esc(cur.kc.caseId)}</span></h3>
        <div><b>${esc(cur.m.q)}</b></div>
        ${cur.m.type === 'mc' ? mcView(cur) : cur.m.type === 'sop' ? sopView(cur) : shortView(cur)}</div>`;
      $$('[data-q]', box).forEach((b) => b.addEventListener('click', () => { qTab[sid] = b.dataset.q; render(); }));
      $$('input.sc', box).forEach((x) => x.addEventListener('input', () => { (draft[x.dataset.e] || (draft[x.dataset.e] = {}))[x.dataset.k] = x.value === '' ? null : Number(x.value); }));
      bindAiUse(box);
      const cmd = $('#xCmd', box);
      if (cmd) cmd.onclick = async () => {
        const txt = '批改 ' + sid;
        try { await navigator.clipboard.writeText(txt); X.toast(`已複製「${txt}」，貼到 SeaTalk 的 @RRTP Assistant`); } catch (e) { X.toast(txt); }
      };
      const all = $('#xUseAll', box);
      if (all) all.onclick = () => {
        const th = Number($('#xTh', box).value) || 0;
        let n = 0;
        done.forEach((r) => Object.entries(r.ai || {}).forEach(([k, a]) => {
          const v = scoreOf(r, k);
          if ((v === undefined || v === null || v === '') && Number(a.confidence) >= th) { (draft[r.email] || (draft[r.email] = {}))[k] = Number(a.score); n++; }
        }));
        render();
        X.toast(n ? `已填入 ${n} 筆 AI 分數，確認後按「儲存給分」` : '沒有符合的 AI 分數（已有分數的不會覆蓋）');
      };
      const sv = $('#xSaveQ', box);
      if (sv) sv.onclick = async () => {
        const emails = Object.keys(draft);
        if (!emails.length) { X.toast('沒有要儲存的給分'); return; }
        const scores = {};
        emails.forEach((e) => { const r = done.find((x) => x.email === e); scores[e] = Object.assign({}, (r && r.scores) || {}, draft[e]); });
        sv.disabled = true;
        try {
          const res = await X.api('x_gradeMany', { sessionId: sid, scores });
          emails.forEach((e) => { const r = done.find((x) => x.email === e); if (r) r.scores = scores[e]; delete draft[e]; });
          X.toast(`已儲存 ${res.saved} 位專員的給分`); render();
        } catch (e) { X.toast(e.message, 5000); sv.disabled = false; }
      };
    }
    render();
    X.setLeaveGuard(() => !Object.keys(draft).length || window.confirm('還有給分沒儲存，確定要離開嗎？'));   // 回傳 true 表示可以離開
  }

  // ═════════════════════════════ 專員：我的測驗卡片、入口 ═════════════════════════════
  async function cards(ctx) {
    X = ctx;
    let d;
    try { d = await X.api('x_mine'); } catch (_) { return { html: '', count: 0 }; }
    const html = d.sessions.map((s) => {
      const a = s.attempt;
      const go = a.status === 'in_progress' || (a.status === 'not_started' && s.state === 'open');
      const btn = a.status === 'in_progress' ? U('繼續作答', 'Continue') : a.status === 'not_started' && s.state === 'open' ? U('開始作答', 'Start') : a.status === 'submitted' ? U('查看作答', 'View answers') : U('查看', 'View');
      return `<div class="card pad quizcard"><div class="row"><span class="chip brand">${U('DMS 考題', 'DMS quiz')}</span>${stChip(s.state)}${a.status !== 'not_started' ? atChip(a) : ''}</div>
        <h2 style="margin-top:8px">${esc(s.title)}</h2>
        <div class="kv small" style="margin-top:8px"><span>${U('類型', 'Type')}</span><span>${MODE(s)}</span><span>${U('開放時間', 'Open')}</span><span>${fmtDT(s.startAt)} – ${fmtDT(s.endAt)}</span>
          <span>${U('作答時間', 'Time limit')}</span><span>${U(`${s.minutes} 分鐘`, `${s.minutes} min`)}</span><span>${U('內容', 'Content')}</span><span>${U(`${s.caseCount} 個案件・${s.questionCount} 題`, `${s.caseCount} case(s) · ${s.questionCount} question(s)`)}</span></div>
        <div class="row" style="margin-top:12px"><a class="btn ${go ? 'brand' : ''}" style="display:inline-grid;place-items:center;text-decoration:none" href="#/x/${esc(s.sessionId)}">${btn}</a>
          ${s.score !== null && s.score !== undefined ? `<span class="score" style="font-size:20px"><b>${s.score}</b><span> / ${s.total}</span></span>` : ''}</div></div>`;
    }).join('');
    return { html, count: d.sessions.length };
  }

  async function entry(id, ctx) {
    X = ctx;
    const main = X.shell('', '<div class="empty-state"><span class="spin"></span></div>');
    let d;
    try { d = await X.api('x_open', { sessionId: id }); } catch (e) { X.showError(e, main); return; }
    const s = d.session, a = d.attempt;
    if (a.status === 'in_progress') return window.RRQP_CASES.take(main, d, X);
    if (a.status === 'submitted') {
      try { return window.RRQP_CASES.take(main, await X.api('x_result', { sessionId: id }), X, { result: true }); } catch (e) { X.showError(e, main); return; }
    }
    const msg = a.status === 'expired' ? U('作答時間已過，沒有交卷。', 'Time ran out before you submitted.') : s.state === 'scheduled' ? U(`測驗尚未開始，開放時間：${fmtDT(s.startAt)}`, `This quiz has not started yet. Opens: ${fmtDT(s.startAt)}`) : s.state !== 'open' ? U('測驗已結束。', 'This quiz has ended.') : '';
    main.innerHTML = `<div class="card pad" style="max-width:720px;margin:0 auto;display:flex;flex-direction:column;gap:12px">
      <div class="row"><span class="chip brand">${U('DMS 考題', 'DMS quiz')}</span><span class="chip">${MODE(s)}</span>${stChip(s.state)}</div>
      <h1>${esc(s.title)}</h1>
      <div class="kv small"><span>${U('開放時間', 'Open')}</span><span>${fmtDT(s.startAt)} – ${fmtDT(s.endAt)}</span><span>${U('作答時間', 'Time limit')}</span><span>${U(`${s.minutes} 分鐘（按「開始作答」起算）`, `${s.minutes} min (starts when you click Start)`)}</span>
        <span>${U('內容', 'Content')}</span><span>${U(`${s.caseCount} 個案件・${s.questionCount} 題`, `${s.caseCount} case(s) · ${s.questionCount} question(s)`)}</span></div>
      <div class="banner">${U('畫面和 DMS 一樣，右側「考題」分頁作答，上方可以切換案件。作答會自動儲存；作答過程會記錄瀏覽的區塊、開啟的照片與影片、離開考試頁面的時間，講師看得到。',
        'The screen works like DMS: answer in the Questions tab on the right, and switch cases at the top. Answers are saved automatically. Your activity (sections viewed, photos and videos opened, time away from the page) is recorded and visible to the trainer.')}</div>
      ${msg ? `<div class="banner warn">${esc(msg)}</div>` : `<div class="row"><button class="btn brand" id="xGo">${U('開始作答', 'Start')}</button></div>`}</div>`;
    const go = $('#xGo');
    if (go) go.onclick = async () => {
      go.disabled = true;
      try { window.RRQP_CASES.take(main, await X.api('x_start', { sessionId: id }), X); } catch (e) { X.toast(e.message, 5000); go.disabled = false; }
    };
  }

  window.RRQP_EXAM = { sessions, session, cards, entry, gradingList, resultsSessions, results, CSV_HEAD, csvRow,
    modeTxt: MODE, pctTxt, rateTxt, newForm: (box, ctx, copyId) => { X = ctx; return createForm(box, copyId); } };
})();
