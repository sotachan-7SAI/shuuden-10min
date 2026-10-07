'use strict';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pad = (n) => String(n).padStart(2, '0');
let SID = '', ST = null, P = null;
const url = (name) => (window.SHARE_BASE || `/novels/${SID}/`) + name;
const storyUrl = (id) => window.SHARE_STORY || ('/api/novel/story?id=' + encodeURIComponent(id));

let idleEl = null, curEl = null, pre = {}, zTop = 10;
const POOL = [];
let made = 0;
const SHARE = window.SHARE_ID || '';
function newVideo() { made++; const v = document.createElement('video'); v.playsInline = true; v.setAttribute('playsinline', ''); v.preload = 'auto'; return v; }
function unlock() {
  while (made < 8) POOL.push(newVideo());
  for (const v of POOL) {
    try {
      v.muted = true; v.src = url('idle_1.mp4');
      const p = v.play();
      if (p) p.then(() => { if (!v.dataset.use) v.pause(); }).catch(() => {});
    } catch (e) {}
  }
}
function free(el) {
  if (!el) return;
  try { el.pause(); } catch (e) {}
  el.onended = el.onerror = el.oncanplay = el.onplaying = null;
  el.remove(); el.removeAttribute('poster'); delete el.dataset.use;
  if (!POOL.includes(el)) POOL.push(el);
}
function mk(name, loop) {
  const v = POOL.pop() || newVideo();
  v.dataset.use = '1';
  v.onended = v.onerror = v.oncanplay = v.onplaying = null;
  v.removeAttribute('poster');
  v.loop = !!loop; v.muted = !!loop;
  v.style.opacity = 0; v.style.zIndex = '';
  v.src = url(name);
  $('stage').appendChild(v);
  v.load();
  return v;
}
function preload(name) { if (!pre[name]) pre[name] = mk(name, false); }
function clearStage() { [...$('stage').children].forEach(free); idleEl = curEl = null; pre = {}; }
function needTap(el) {
  $('tap').hidden = false;
  $('tap').onclick = () => { $('tap').hidden = true; el.play().catch(() => {}); };
}
const actOf = (t) => { let a = 0; ST.acts.forEach((ac, i) => { if (t >= ac.from) a = i; }); return a; };
async function setAct(a, quiet) {
  if (P.act === a) return;
  const first = P.act < 0;
  if (!first) { $('fade').style.opacity = 1; await sleep(480); }
  if (curEl) { free(curEl); curEl = null; }
  if (idleEl) free(idleEl);
  idleEl = mk(`idle_${a + 1}.mp4`, true);
  idleEl.poster = url(`home_${a + 1}.png`);
  idleEl.style.opacity = 1; idleEl.style.zIndex = 1;
  idleEl.play().catch(() => {});
  $('bgblur').style.backgroundImage = `url("${url(`home_${a + 1}.png`)}")`;
  P.act = a;
  if (!first) {
    if (ST.acts[a].narr && !quiet) { narr(ST.acts[a].narr); await sleep(1500); }
    $('fade').style.opacity = 0; await sleep(300);
  }
}
function playTalk(name, line) {
  return new Promise((res) => {
    const el = pre[name] || mk(name, false);
    delete pre[name];
    const prev = curEl;
    curEl = el;
    el.style.zIndex = ++zTop;
    let started = false;
    const show = () => {
      if (started) return;
      started = true;
      el.style.opacity = 1;
      setLine(line);
      if (prev) setTimeout(() => free(prev), 150);
    };
    el.onplaying = show;
    el.onended = () => res();
    el.onerror = () => { show(); setTimeout(res, 2500); };
    const p = el.play();
    if (p) p.catch((e) => { if (e && e.name === 'NotAllowedError') { show(); needTap(el); } });
    setTimeout(show, 3000);
  });
}
function toIdle() {
  if (!idleEl) return;
  try { idleEl.currentTime = 0; } catch (e) {}
  idleEl.play().catch(() => {});
  const el = curEl;
  curEl = null;
  if (el) setTimeout(() => free(el), 120);
}

let typeTimer = null;
function setLine(text) {
  clearInterval(typeTimer);
  let n = 0;
  $('line').textContent = '';
  typeTimer = setInterval(() => { $('line').textContent = text.slice(0, ++n); if (n >= text.length) clearInterval(typeTimer); }, 60);
}
function narr(t) { $('narr').textContent = t || ''; }

async function turn(t) {
  const T = ST.turns[t - 1];
  P.turn = t;
  await setAct(actOf(t));
  $('clk').textContent = T.clock || '';
  narr(T.narr);
  preload(`r${pad(t)}a.mp4`); preload(`r${pad(t)}b.mp4`);
  await playTalk(`s${pad(t)}.mp4`, T.line);
  if (P.dead) return;
  toIdle();
  $('choices').innerHTML = T.choices.map((c, k) => `<button data-k="${k}"><b>${'AB'[k]}</b>${esc(c.text)}</button>`).join('');
}
function endingIndex() {
  const order = ST.endings.map((e, i) => [e.min, i]).sort((a, b) => b[0] - a[0]);
  for (const [min, i] of order) if (P.score >= min) return i;
  return order[order.length - 1][1];
}
async function choose(k) {
  const t = P.turn, T = ST.turns[t - 1], c = T.choices[k];
  $('choices').innerHTML = '';
  narr('');
  P.score += c.score; P.picks.push(k);
  const other = `r${pad(t)}${'ab'[1 - k]}.mp4`;
  if (pre[other]) { free(pre[other]); delete pre[other]; }
  if (t < ST.turns.length) preload(`s${pad(t + 1)}.mp4`); else preload(`e${endingIndex() + 1}.mp4`);
  await playTalk(`r${pad(t)}${'ab'[k]}.mp4`, c.reply);
  if (P.dead) return;
  if (t < ST.turns.length) return turn(t + 1);
  const i = endingIndex(), E = ST.endings[i];
  if (ST.end_clock) $('clk').textContent = ST.end_clock;
  narr(E.narr);
  await sleep(600);
  await playTalk(`e${i + 1}.mp4`, E.line);
  if (P.dead) return;
  toIdle();
  await sleep(1400);
  showEnd(i);
}
$('choices').onclick = (e) => { const b = e.target.closest('button'); if (b && P && !P.dead) choose(+b.dataset.k); };
document.addEventListener('keydown', (e) => {
  if (!P || P.dead || !$('choices').children.length) return;
  const k = { a: 0, b: 1, ArrowLeft: 0, ArrowRight: 1, 1: 0, 2: 1 }[e.key];
  if (k != null) choose(k);
});

let scoreTimer = null;
function showEnd(i) {
  const E = ST.endings[i];
  $('e_name').textContent = E.name;
  const max = ST.max || 1, pct = Math.round(100 * P.score / max);
  const rank = pct >= 90 ? 'S' : pct >= 75 ? 'A' : pct >= 55 ? 'B' : pct >= 35 ? 'C' : 'D';
  const marks = ST.turns.map((T, n) => {
    const got = T.choices[P.picks[n]].score, top = Math.max(...T.choices.map((c) => c.score));
    return got >= top ? 2 : (got > 0 ? 1 : 0);
  });
  $('e_max').textContent = max;
  $('e_rank').textContent = rank; $('e_rank').classList.remove('in');
  $('e_marks').innerHTML = marks.map((m, n) => `<span class="m${m}">${'×○◎'[m]}<small>${n + 1}</small></span>`).join('');
  let best = null, fresh = false;
  try {
    const key = 'novel_best_' + SID, old = parseInt(localStorage.getItem(key), 10);
    fresh = isNaN(old) || P.score > old;
    best = fresh ? P.score : old;
    if (fresh) localStorage.setItem(key, String(P.score));
  } catch (e) {}
  $('e_sub').textContent = `100点満点で ${pct}点 ／ いちばんいい答えを選べた回 ${marks.filter((m) => m === 2).length} / ${ST.turns.length}`
    + (best == null ? '' : (fresh ? ' ／ 自己ベスト！' : ` ／ これまでの最高 ${best}点`));
  const up = ST.endings.filter((e) => e.min > P.score).sort((a, b) => a.min - b.min)[0];
  $('e_next').textContent = up ? `「${up.name}」まで、あと ${up.min - P.score}点` : 'いちばん上のエンドです';
  clearInterval(scoreTimer);
  let shown = 0;
  $('e_score').textContent = 0;
  scoreTimer = setInterval(() => {
    if (shown < P.score) $('e_score').textContent = ++shown;
    if (shown >= P.score) { clearInterval(scoreTimer); $('e_rank').classList.add('in'); }
  }, Math.max(30, Math.round(900 / Math.max(1, P.score))));
  $('e_epi').textContent = E.epilogue || '';
  $('e_rec').innerHTML = ST.turns.map((T, n) => {
    const k = P.picks[n], c = T.choices[k], o = T.choices[1 - k];
    return `<div class="t"><span class="pt">${esc(T.clock)}</span> 彼女「${esc(T.line)}」<br><span class="you">あなた「${esc(c.text)}」</span><span class="pt">＋${c.score}</span><br>`
      + `彼女「${esc(c.reply)}」<br><span class="ura">（本音）${esc(c.inner)}</span><br><span class="other">選ばなかったほう:「${esc(o.text)}」（＋${o.score}）</span></div>`;
  }).join('');
  $('end').style.display = 'block'; $('end').scrollTop = 0;
}
function start() {
  clearStage();
  unlock();
  $('tap').hidden = true;
  P = { turn: 0, score: 0, picks: [], act: -1, dead: false };
  $('open').style.display = 'none'; $('end').style.display = 'none'; $('list').style.display = 'none';
  $('box').hidden = false; $('clock').hidden = false; $('quit').hidden = false;
  $('name').textContent = ST.char; $('line').textContent = ''; $('choices').innerHTML = ''; narr('');
  $('clk').textContent = ''; $('clkNote').textContent = ST.clock_note || '';
  turn(1);
}
function quit() {
  if (P) P.dead = true;
  clearInterval(typeTimer);
  clearStage();
  $('box').hidden = true; $('clock').hidden = true; $('quit').hidden = true; $('tap').hidden = true;
  $('end').style.display = 'none';
  if (SHARE) { $('open').style.display = 'block'; return; }
  $('open').style.display = 'none'; $('list').style.display = 'block';
  drawList();
}
$('go').onclick = start;
$('again').onclick = start;
$('back').onclick = quit;
$('quit').onclick = quit;

let listTimer = null;
async function drawList() {
  clearTimeout(listTimer);
  let d;
  try { d = await (await fetch('/api/novel/list')).json(); } catch (e) { $('stories').innerHTML = '<p>⚠ サーバーにつながりません</p>'; return; }
  $('stories').innerHTML = d.stories.map((s) => `
    <div class="story"><h2>${esc(s.title)}</h2><div class="meta">ヒロイン: ${esc(s.char)}　／　動画 ${s.have} / ${s.total} 本${s.ready ? '（そろっています）' : ''}</div>
      <div class="bar"><i style="width:${s.total ? Math.round(100 * s.have / s.total) : 0}%"></i></div>
      <div class="btns">
        <button class="on" data-play="${esc(s.id)}" ${s.ready ? '' : 'disabled'}>▶ あそぶ</button>
        ${s.ready ? '' : `<button data-build="${esc(s.id)}" ${d.job.id ? 'disabled' : ''}>${s.have ? '続きを作る' : '動画を作る（10〜15分）'}</button>`}
        ${s.building ? '<button data-stop="1">止める</button>' : ''}
        <span style="color:var(--sub);font-size:13px">${esc(s.building ? '作っています: ' + s.note : (s.error ? '⚠ ' + s.error : ''))}</span>
      </div></div>`).join('') || '<p>まだ話がありません</p>';
  $('newGo').disabled = !!d.job.id;
  $('newMsg').textContent = d.job.id && !d.stories.some((s) => s.building) ? d.job.note : (d.job.id ? '' : (d.job.error ? '⚠ ' + d.job.error : ''));
  if (d.job.id && $('list').style.display !== 'none') listTimer = setTimeout(drawList, 3000);
}
(async () => {
  if (SHARE) return;
  try {
    const cs = await (await fetch('/api/chars')).json();
    $('newChar').innerHTML = cs.map((c) => `<option value="${esc(c.name)}">${esc(c.label || c.name)}${c.custom ? ' ★' : ''}</option>`).join('');
  } catch (e) {}
})();
$('newGo').onclick = async () => {
  const r = await (await fetch('/api/novel/new', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ char: $('newChar').value }) })).json();
  $('newMsg').textContent = r.error ? '⚠ ' + r.error : '話を書いています…';
  setTimeout(drawList, 1500);
};
$('stories').onclick = async (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.play) {
    SID = b.dataset.play;
    ST = await (await fetch('/api/novel/story?id=' + encodeURIComponent(SID))).json();
    $('intro').textContent = ST.title + '\n\n' + ST.intro;
    $('list').style.display = 'none'; $('open').style.display = 'block';
  } else if (b.dataset.build) {
    await fetch('/api/novel/build', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: b.dataset.build }) });
    drawList();
  } else if (b.dataset.stop) {
    await fetch('/api/novel/stop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    drawList();
  }
};
if (SHARE) { $('list').style.display = 'none'; $('back').hidden = true; } else drawList();
(async () => {
  const id = SHARE || new URLSearchParams(location.search).get('id');
  if (!id) return;
  try {
    const s = await (await fetch(storyUrl(id))).json();
    if (!s || !s.ready) throw new Error('not ready');
    SID = id; ST = s;
    $('intro').textContent = ST.title + '\n\n' + ST.intro;
    $('list').style.display = 'none'; $('open').style.display = 'block';
  } catch (e) {
    if (SHARE) { $('intro').textContent = 'いまは遊べません。少しあとで、もう一度ひらいてください。'; $('go').hidden = true; $('open').style.display = 'block'; }
  }
})();
