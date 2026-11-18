/* RR AI Quiz Platform — V3 DMS 考題測驗：組卷發佈、講師看作答與足跡、給分、公布；專員的測驗卡片與入口
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
  const MODE = (s) => (s.mode === 'practice' ? (s.review === 'unified' ? '練習・統一檢討' : '練習・隨時檢討') : '考試');
  const STATE = { scheduled: '尚未開始', open: '進行中', closed: '已結束', released: '已公布成績' };
  const ATT = { not_started: '未開始', in_progress: '作答中', submitted: '已交卷', expired: '逾時未交' };
  const stChip = (st) => `<span class="chip ${st === 'open' ? 'ok' : st === 'scheduled' ? 'info' : st === 'released' ? 'brand' : ''}">${STATE[st] || esc(st)}</span>`;
  const atChip = (a) => `<span class="chip ${a.status === 'submitted' ? 'ok' : a.status === 'in_progress' ? 'info' : a.status === 'expired' ? 'warn' : ''}">${ATT[a.status] || esc(a.status)}${a.autoSubmitted ? '・自動交卷' : ''}</span>`;

  // ═════════════════════════════ 測驗管理：列表＋新增 ═════════════════════════════
  async function sessions(box, ctx) {
    X = ctx;
    box.innerHTML = `<div class="row" style="margin-bottom:10px"><span class="small muted">從「可用題庫 → DMS 考題」挑已核准的案件組成一場測驗。</span><span class="spacer"></span>
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

  async function createForm(box) {
    box.innerHTML = '<div class="card pad"><span class="spin"></span></div>';
    let d;
    try { d = await X.api('c_list'); } catch (e) { X.showError(e, box); return; }
    const all = d.cases.filter((c) => c.status === 'approved');
    const gName = (id) => (d.groups.find((x) => x.id === id) || {}).name || id;
    const tpName = (id) => L((d.topics.find((x) => x.topicId === id) || {}).name) || id;
    const st = { picked: [], seen: {}, f: { g: '', tp: '', q: '' } };
    const start = Date.now(), end = start + 2 * 3600e3;
    box.innerHTML = `<form class="card pad" id="xf" style="display:flex;flex-direction:column;gap:14px;margin-bottom:14px" autocomplete="off">
      <h2>新增 DMS 考題測驗</h2>
      <div class="form">
        <label class="k" for="x_title">測驗名稱</label><input type="text" id="x_title" maxlength="80" placeholder="例如：11 月新人訓練・DMS 實戰練習" required>
        <span class="k">類型</span><div class="tags">
          <label class="tag-opt on"><input type="radio" name="x_mode" value="exam" checked> 考試（限時、講師批改後公布成績）</label>
          <label class="tag-opt"><input type="radio" name="x_mode" value="instant"> 練習・隨時檢討（交卷後馬上看詳解）</label>
          <label class="tag-opt"><input type="radio" name="x_mode" value="unified"> 練習・統一檢討（講師公布後才看得到詳解）</label></div>
        <label class="k" for="x_s">開放時間</label><div class="row"><input type="datetime-local" id="x_s" value="${toLocal(start)}"> – <input type="datetime-local" id="x_e" value="${toLocal(end)}"></div>
        <label class="k" for="x_min">作答時間</label><div class="row"><input type="number" id="x_min" min="1" max="600" value="30"> 分鐘<span class="small muted">（整場；從專員按「開始作答」起算，開放時間結束也會截止）</span></div>
        <label class="k" for="x_em">指派專員</label><div><textarea id="x_em" rows="4" style="width:min(520px,100%);border:1px solid var(--line2);border-radius:8px;padding:8px" placeholder="一行一個 email，或用逗號分隔"></textarea>
          <div class="small muted">DMS 考題目前只有中文，請指派 TW 專員。</div></div>
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
          <span style="flex:1"><b class="mono">${esc(c.caseId)}</b> ${esc(c.title)}<div class="small soft">${(c.groups || []).map(gName).concat((c.topics || []).map(tpName)).map(esc).join('、')}・${c.questions} 題／${c.points} 分・${c.usage === 'exam' ? '考試用' : '練習用'}</div></span>
          ${st.seen[c.caseId] ? `<span class="chip warn">${st.seen[c.caseId]} 人做過</span>` : ''}${no ? '<span class="small soft">練習用，不能放進考試</span>' : ''}</label>`;
      }).join('') : '<div class="empty-state">沒有符合的已核准案件</div>';
      $$('#x_pool [data-c]').forEach((cb) => cb.addEventListener('change', () => {
        const id = cb.dataset.c;
        st.picked = cb.checked ? st.picked.concat(id) : st.picked.filter((x) => x !== id);
        drawSel();
      }));
    };
    const drawSel = () => {
      const rows = st.picked.map((id) => all.find((c) => c.caseId === id)).filter(Boolean);
      $('#x_sum').textContent = `${rows.length} 個案件・${rows.reduce((n, c) => n + c.questions, 0)} 題・${rows.reduce((n, c) => n + c.points, 0)} 分`;
      $('#x_sel').innerHTML = rows.length ? rows.map((c, i) => `<div class="it"><b>案件 ${i + 1}</b><span class="mono">${esc(c.caseId)}</span><span style="flex:1">${esc(c.title)}</span>
        <button type="button" class="btn sm ghost" data-u="${i}" ${i ? '' : 'disabled'}>↑</button><button type="button" class="btn sm ghost" data-d="${i}" ${i < rows.length - 1 ? '' : 'disabled'}>↓</button>
        <button type="button" class="btn sm ghost danger" data-x="${i}">✕</button></div>`).join('') : '<div class="small muted">從左邊勾選案件；專員作答時依這裡的順序。</div>';
      const mv = (i, dd) => { const a = st.picked.splice(i, 1)[0]; st.picked.splice(i + dd, 0, a); drawSel(); };
      $$('#x_sel [data-u]').forEach((b) => b.addEventListener('click', () => mv(+b.dataset.u, -1)));
      $$('#x_sel [data-d]').forEach((b) => b.addEventListener('click', () => mv(+b.dataset.d, 1)));
      $$('#x_sel [data-x]').forEach((b) => b.addEventListener('click', () => { st.picked.splice(+b.dataset.x, 1); drawSel(); drawPool(); }));
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
    drawPool(); drawSel();
    $('#xf').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('#x_go'); btn.disabled = true; $('#x_err').hidden = true;
      const m = modeOf();
      try {
        const r = await X.api('x_create', { title: $('#x_title').value, mode: m === 'exam' ? 'exam' : 'practice', review: m === 'exam' ? '' : m,
          startAt: new Date($('#x_s').value).getTime(), endAt: new Date($('#x_e').value).getTime(), minutes: Number($('#x_min').value), assignees: emails(), caseIds: st.picked });
        X.toast('已發佈 ' + r.sessionId);
        location.hash = '#/xsession/' + r.sessionId;
      } catch (err) { $('#x_err').textContent = err.message; $('#x_err').hidden = false; btn.disabled = false; }
    });
  }

  // ═════════════════════════════ 單場（講師） ═════════════════════════════
  async function session(id, ctx) {
    X = ctx;
    const main = X.shell('sessions', '<div class="empty-state"><span class="spin"></span></div>');
    const want = new URLSearchParams(location.hash.split('?')[1] || '').get('agent') || '';
    let d;
    try { d = await X.api('x_get', { sessionId: id }); } catch (e) { X.showError(e, main); return; }
    const s = d.session, sub = d.roster.filter((r) => r.status === 'submitted').length;
    const exam = s.mode === 'exam';
    main.innerHTML = `<div class="row"><a href="#/sessions?tab=cases">← 測驗管理</a><h1>${esc(s.sessionId)} ${esc(s.title)}</h1><span class="chip">${MODE(s)}</span>${stChip(s.state)}
        ${s.answersOpen ? '<span class="chip ok">已公布解答</span>' : ''}<span class="spacer"></span>
        <button class="btn" id="xr">重新整理</button>
        ${!s.released ? '<button class="btn" id="xAdd">加入專員</button><button class="btn" id="xMin">延長作答時間</button><button class="btn" id="xExt">延長結束時間</button>' : ''}
        ${s.state === 'open' || s.state === 'scheduled' ? '<button class="btn danger" id="xEnd">提前結束</button>' : ''}
        ${!exam && s.review === 'unified' ? `<button class="btn ${s.answersOpen ? '' : 'brand'}" id="xOpen">${s.answersOpen ? '收回解答' : '公布解答'}</button>` : ''}
        ${exam && s.state === 'closed' ? '<button class="btn brand" id="xRel">公布成績</button>' : ''}
        ${X.me.can && X.me.can.session ? '<button class="btn ghost danger" id="xDel">刪除</button>' : ''}</div>
      <div id="xPanel"></div>
      <div class="cmd"><code style="font-size:15px;word-break:break-all">${esc(xLink(s.sessionId))}</code><span class="spacer"></span><button class="btn sm" id="xCopy">複製專員連結</button></div>
      <div class="stats">
        <div class="card pad"><div class="small soft">開放時間</div><div><b>${fmtDT(s.startAt)}</b><br>– <b>${fmtDT(s.endAt)}</b></div></div>
        <div class="card pad"><div class="small soft">作答時間</div><div class="big">${s.minutes} 分</div><div class="small soft">${s.caseCount} 個案件・${s.questionCount} 題・${s.points} 分</div></div>
        <div class="card pad"><div class="small soft">交卷</div><div class="big">${sub} <span class="soft" style="font-size:16px">/ ${d.roster.length}</span></div></div>
      </div>
      <div class="card scroll-x"><table class="list"><thead><tr><th>專員</th><th>狀態</th><th>開始</th><th>交卷</th><th>${exam ? '成績' : '單選題'}</th><th>離開頁面</th><th></th></tr></thead><tbody>
        ${d.roster.map((r) => `<tr class="${r.email === want ? 'sel' : ''}"><td>${esc(r.email)}</td><td>${atChip(r.status === 'not_started' && s.state === 'closed' ? { status: 'expired' } : r)}</td>
          <td class="small muted">${fmtDT(r.startedAt)}</td><td class="small muted">${fmtDT(r.submittedAt)}</td>
          <td class="small">${r.result ? (exam ? `<b>${r.result.score}</b> / ${r.result.total}${r.result.pending ? `<div class="soft">${r.result.pending} 題簡答待給分</div>` : ''}` : mcRight(d.key, r)) : '-'}</td>
          <td class="small">${r.track ? esc(window.RRQP_CASES.leaveSummary(r.track)) : '-'}</td>
          <td style="text-align:right;white-space:nowrap">${r.extraMin ? `<span class="chip">加時 ${r.extraMin} 分</span> ` : ''}${!s.released && (r.status === 'in_progress' || r.status === 'expired') && r.startedAt ? `<button class="btn sm ghost" data-add="${esc(r.email)}">加時</button> ` : ''}${r.status !== 'not_started' ? `<a class="btn sm" href="#/xsession/${esc(s.sessionId)}?agent=${encodeURIComponent(r.email)}">查看作答</a>`
            : !s.released ? `<button class="btn sm ghost danger" data-rm="${esc(r.email)}">移除</button>` : ''}</td></tr>`).join('')}</tbody></table></div>
      <div id="xAgent" style="margin-top:14px"></div>`;
    $('#xr').onclick = () => session(id, ctx);
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
      try { await X.api('x_delete', { sessionId: s.sessionId }); X.toast('已刪除'); location.hash = '#/sessions?tab=cases'; } catch (e) { X.toast(e.message, 5000); }
    });
    async function run(action, extra) {
      try { await X.api(action, Object.assign({ sessionId: s.sessionId }, extra || {})); X.toast('完成'); session(id, ctx); } catch (e) { X.toast(e.message, 6000); }
    }
    // 加入專員、延長結束時間：在上方展開一個小表單
    const panel = (html, onOk) => {
      const p = $('#xPanel');
      if (p.innerHTML) { p.innerHTML = ''; return; }
      p.innerHTML = `<div class="card pad" style="display:flex;flex-direction:column;gap:10px;margin-bottom:12px">${html}
        <div class="row"><button class="btn brand" id="xpOk">確定</button><button class="btn" id="xpNo">取消</button></div></div>`;
      $('#xpNo').onclick = () => { p.innerHTML = ''; };
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
    $$('[data-rm]').forEach((b) => b.addEventListener('click', async () => {
      if (!(await X.confirmBox(`把 ${b.dataset.rm} 從這場測驗移除？`, '移除', undefined, true))) return;
      try { await X.api('x_removeAssignee', { sessionId: s.sessionId, email: b.dataset.rm }); X.toast('已移除'); session(id, ctx); } catch (e) { X.toast(e.message, 5000); }
    }));
    const r = d.roster.find((x) => x.email === want);
    if (r) agentPanel($('#xAgent'), d, r, exam && !s.released);
  }
  const mcRight = (key, r) => {
    let ok = 0, n = 0;
    (key.cases || []).forEach((kc, i) => kc.mods.filter((m) => m.type === 'mc').forEach((m) => { n++; if (((r.answers[i] || {}).mc || {})[m.id] === m.answer) ok++; }));
    return `答對 ${ok} / ${n}`;
  };

  /** 單一專員：每個案件的作答、正解、足跡卡；考試可以給簡答分數 */
  function agentPanel(box, d, r, canGrade) {
    const LET = 'ABCDEFGH';
    box.innerHTML = `<div class="card pad"><div class="row"><h2>${esc(r.email)}</h2><span class="small muted">${esc(window.RRQP_CASES.leaveSummary(r.track))}</span><span class="spacer"></span>
        ${canGrade ? '<button class="btn brand" id="xSave">儲存給分</button>' : ''}</div>
      ${(d.key.cases || []).map((kc, i) => {
        const a = r.answers[i] || {}, paper = JSON.parse((d.paper.cases[i] || {}).body || '{}');
        return `<div style="margin-top:16px"><h3>案件 ${i + 1}・<span class="mono">${esc(kc.caseId)}</span> ${esc(kc.title)}</h3>
          <div class="lib-grid" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr);margin-top:8px">
            <div>${kc.mods.map((m, qi) => {
              if (m.type === 'mc') {
                const pick = (a.mc || {})[m.id], ok = pick === m.answer;
                return `<div class="xq"><b>${qi + 1}. ${esc(m.q)}</b>（${m.points} 分）<div>專員：<span class="${ok ? 'ok' : 'bad'}">${pick === undefined ? '沒作答' : LET[pick] + '. ' + esc(m.options[pick] || '')}</span>
                  ${ok ? '✓' : `／正解 ${LET[m.answer]}. ${esc(m.options[m.answer] || '')}`}</div></div>`;
              }
              const v = (r.scores || {})[i + ':' + m.id];
              return `<div class="xq"><b>${qi + 1}. ${esc(m.q)}</b>（${m.points} 分）
                <div style="white-space:pre-wrap;background:var(--chip);border-radius:8px;padding:8px;margin:6px 0">${esc((a.short || {})[m.id] || '（沒作答）')}</div>
                <div class="small soft">標準答案：${esc(m.standard)}</div>
                ${canGrade ? `<div class="row" style="margin-top:6px">給分 <input class="sc" type="number" min="0" max="${m.points}" step="0.5" data-k="${i}:${esc(m.id)}" value="${v === null || v === undefined ? '' : v}"> / ${m.points}</div>`
                  : (v !== undefined && v !== null ? `<div class="small">得分 ${v} / ${m.points}</div>` : '')}</div>`;
            }).join('')}</div>
            <div>${window.RRQP_CASES.footprint(paper, r.track, i, a, kc)}</div></div></div>`;
      }).join('')}</div>`;
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

  // ═════════════════════════════ 專員：我的測驗卡片、入口 ═════════════════════════════
  async function cards(ctx) {
    X = ctx;
    let d;
    try { d = await X.api('x_mine'); } catch (_) { return { html: '', count: 0 }; }
    const html = d.sessions.map((s) => {
      const a = s.attempt;
      const btn = a.status === 'in_progress' ? '繼續作答' : a.status === 'not_started' && s.state === 'open' ? '開始作答' : a.status === 'submitted' ? '查看作答' : '查看';
      return `<div class="card pad quizcard"><div class="row"><span class="chip brand">DMS 考題</span>${stChip(s.state)}${a.status !== 'not_started' ? atChip(a) : ''}</div>
        <h2 style="margin-top:8px">${esc(s.title)}</h2>
        <div class="kv small" style="margin-top:8px"><span>類型</span><span>${MODE(s)}</span><span>開放時間</span><span>${fmtDT(s.startAt)} – ${fmtDT(s.endAt)}</span>
          <span>作答時間</span><span>${s.minutes} 分鐘</span><span>內容</span><span>${s.caseCount} 個案件・${s.questionCount} 題</span></div>
        <div class="row" style="margin-top:12px"><a class="btn ${btn.includes('作答') && a.status !== 'submitted' ? 'brand' : ''}" style="display:inline-grid;place-items:center;text-decoration:none" href="#/x/${esc(s.sessionId)}">${btn}</a>
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
    const msg = a.status === 'expired' ? '作答時間已過，沒有交卷。' : s.state === 'scheduled' ? `測驗尚未開始，開放時間：${fmtDT(s.startAt)}` : s.state !== 'open' ? '測驗已結束。' : '';
    main.innerHTML = `<div class="card pad" style="max-width:720px;margin:0 auto;display:flex;flex-direction:column;gap:12px">
      <div class="row"><span class="chip brand">DMS 考題</span><span class="chip">${MODE(s)}</span>${stChip(s.state)}</div>
      <h1>${esc(s.title)}</h1>
      <div class="kv small"><span>開放時間</span><span>${fmtDT(s.startAt)} – ${fmtDT(s.endAt)}</span><span>作答時間</span><span>${s.minutes} 分鐘（按「開始作答」起算）</span>
        <span>內容</span><span>${s.caseCount} 個案件・${s.questionCount} 題</span></div>
      <div class="banner">畫面和 DMS 一樣，右側「考題」分頁作答，上方可以切換案件。作答會自動儲存；作答過程會記錄瀏覽的區塊、開啟的照片與影片、離開考試頁面的時間，講師看得到。</div>
      ${msg ? `<div class="banner warn">${esc(msg)}</div>` : '<div class="row"><button class="btn brand" id="xGo">開始作答</button></div>'}</div>`;
    const go = $('#xGo');
    if (go) go.onclick = async () => {
      go.disabled = true;
      try { window.RRQP_CASES.take(main, await X.api('x_start', { sessionId: id }), X); } catch (e) { X.toast(e.message, 5000); go.disabled = false; }
    };
  }

  window.RRQP_EXAM = { sessions, session, cards, entry };
})();
