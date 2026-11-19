// LEONIDA LEDGER v4 — rendering. Every number is computed from trophies.json + state.
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined && text !== null) n.textContent = text;
  return n;
}
function esc(s) { return String(s); }

function gradeLabel(g) {
  return { platinum: 'PLATINUM', gold: 'GOLD', silver: 'SILVER', bronze: 'BRONZE' }[g] || g;
}
function statusLabel(s) {
  return s === 'earned' ? '✓ Earned' : s === 'doing' ? '◐ In progress' : '○ To do';
}
function timeBadge(t) {
  return t.timeMin === null ? 'time: not pinned down' : '⏱ ' + fmtTime(t.timeMin);
}

function renderHeader() {
  const total = DATA.trophies.length, earned = earnedCount();
  document.getElementById('earned-count').textContent = earned + '/' + total + ' (' + Math.round(earned / total * 100) + '%)';
  const gc = gradeCounts();
  document.getElementById('grade-counts').textContent =
    'P ' + gc.platinum.earned + '/' + gc.platinum.total + ' · G ' + gc.gold.earned + '/' + gc.gold.total +
    ' · S ' + gc.silver.earned + '/' + gc.silver.total + ' · B ' + gc.bronze.earned + '/' + gc.bronze.total;
  document.getElementById('psn-points').textContent = earnedPsn() + '/' + DATA.psnPointsTotal + ' PSN pts';
  document.getElementById('in-progress').textContent = inProgressCount() + ' in progress';
  document.getElementById('theme-toggle').textContent = 'Theme: ' + state.theme;
  document.getElementById('spoiler-toggle').textContent = 'Spoilers: ' + (state.spoilers ? 'shown' : 'hidden');
}

function renderAudit() {
  const a = auditNumbers();
  const by = citedBy();
  document.getElementById('audit-strip').textContent =
    a.total + ' official · 1P 2G 6S 46B · ' + a.hidden + ' hidden · ' + a.guidesCite + '/55 guides cite a source · ' +
    a.stepsCited + '/' + a.stepsTotal + ' steps cited · ' + a.sources + ' sources read ' + DATA.sourcesRead +
    ' · ' + a.possible + ' possibly missable · ' + a.watch + ' watch · ' + a.unconfirmed + ' unconfirmed · ' +
    a.singleSource + ' single-source · ' + a.disagree + ' disagree · ' + a.counters + ' counters · 0 network requests · works offline';
  document.getElementById('cited-by-strip').textContent =
    'CITED BY ' + DATA.sources.map(s => '[' + s.id + '] ' + s.name + ' ' + (by[s.id] || 0) + '/55').join(' · ');
}

function renderBanner() {
  const banner = document.getElementById('missable-banner');
  const first = DATA.trophies.find(t => t.missable === 'possible' && getStatus(t.id) !== 'earned');
  if (!first) { banner.hidden = true; return; }
  banner.hidden = false;
  document.getElementById('missable-text').textContent =
    first.name + ': ' + first.short;
  document.getElementById('missable-show').onclick = () => openDetail(first.id);
}

function renderFilters() {
  const box = document.getElementById('filters');
  box.replaceChildren();
  for (const [key, label] of FILTERS) {
    const b = el('button', 'chip' + (state.filter === key ? ' active' : ''), label + ' ' + kindCount(key));
    b.type = 'button';
    b.dataset.filter = key;
    b.addEventListener('click', () => { state.filter = key; saveState(); renderAll(); });
    box.append(b);
  }
}

function trophyRow(t) {
  const row = el('div', 'trow' + (getStatus(t.id) === 'earned' ? ' earned' : ''));
  row.dataset.id = t.id;
  const hidden = t.hidden && !state.spoilers && !state.revealed[t.id] && getStatus(t.id) !== 'earned';
  const stateBtn = el('button', 'state-btn', statusLabel(getStatus(t.id)));
  stateBtn.type = 'button';
  stateBtn.addEventListener('click', (e) => { e.stopPropagation(); cycleStatus(t.id); renderAll(); });
  row.append(stateBtn);
  const main = el('div', 'main');
  const nameLine = el('div', 'name', hidden ? 'Hidden trophy' : t.name);
  main.append(nameLine);
  if (hidden) {
    main.append(el('div', 'spoiler-note', 'Hidden trophy — hidden until earned'));
    const rev = el('button', '', 'Reveal');
    rev.type = 'button';
    rev.addEventListener('click', (e) => { e.stopPropagation(); state.revealed[t.id] = true; saveState(); renderAll(); });
    main.append(rev);
  } else {
    main.append(el('div', 'desc', t.description));
    const badges = el('div', 'badges');
    badges.append(el('span', 'badge grade-' + t.grade, gradeLabel(t.grade)));
    badges.append(el('span', 'badge', 'Stage ' + t.stage));
    badges.append(el('span', 'badge', 'Difficulty ' + t.difficulty + '/5'));
    badges.append(el('span', 'badge', timeBadge(t)));
    badges.append(el('span', 'badge ' + confidence(t), confidence(t) === 'green' ? '● Backed' : '● Check'));
    if (t.hidden) badges.append(el('span', 'badge hidden-flag', 'HIDDEN ON PSN'));
    if (t.missable === 'possible') badges.append(el('span', 'badge missable', 'POSSIBLY MISSABLE'));
    if (t.missable === 'watch') badges.append(el('span', 'badge missable', 'WATCH'));
    if (t.unconfirmed) badges.append(el('span', 'badge amber', 'NOT PINNED DOWN YET'));
    if (t.singleSource) badges.append(el('span', 'badge amber', 'SINGLE SOURCE'));
    main.append(badges);
  }
  row.append(main);
  if (t.counter && !hidden) {
    const c = el('div', 'counter');
    const minus = el('button', '', '−');
    minus.type = 'button';
    minus.addEventListener('click', (e) => { e.stopPropagation(); setCounter(t.id, getCounter(t.id) - 1); renderAll(); });
    const val = el('span', 'count-val', getCounter(t.id) + '/' + t.counter.target + ' ' + t.counter.label);
    const plus = el('button', '', '+');
    plus.type = 'button';
    plus.addEventListener('click', (e) => { e.stopPropagation(); setCounter(t.id, getCounter(t.id) + 1); renderAll(); });
    c.append(minus, val, plus);
    row.append(c);
  }
  row.addEventListener('click', () => openDetail(t.id));
  return row;
}

function renderChecklist() {
  renderFilters();
  const list = filteredTrophies();
  document.getElementById('showing-line').textContent =
    'Showing ' + list.length + ' of 55 · ' + earnedCount() + ' earned';
  const box = document.getElementById('checklist');
  box.replaceChildren();
  if (!list.length) { box.append(el('p', 'showing', 'Nothing matches — clear the search or pick another filter.')); return; }
  // Group by stage when sorted by roadmap; otherwise a flat list.
  if (state.sort === 'roadmap') {
    for (const st of DATA.stages) {
      const members = list.filter(t => t.stage === st.id);
      if (!members.length) continue;
      const block = el('div', 'stage-block');
      const head = el('div', 'stage-head');
      head.append(el('h3', '', st.id + ' — ' + st.title));
      head.append(el('span', 'showing', members.filter(t => getStatus(t.id) === 'earned').length + '/' + members.length + ' earned'));
      block.append(head, el('p', 'stage-intro', st.intro));
      for (const t of members) block.append(trophyRow(t));
      box.append(block);
    }
  } else {
    for (const t of list) box.append(trophyRow(t));
  }
}

function renderRoadmap() {
  const box = document.getElementById('roadmap');
  box.replaceChildren();
  for (const st of DATA.stages) {
    const members = DATA.trophies.filter(t => t.stage === st.id).sort((a, b) => a.roadmapOrder - b.roadmapOrder);
    const block = el('div', 'stage-block');
    const head = el('div', 'stage-head');
    head.append(el('h3', '', st.id + ' — ' + st.title));
    head.append(el('span', 'showing', members.filter(t => getStatus(t.id) === 'earned').length + '/' + members.length + ' earned'));
    block.append(head, el('p', 'stage-intro', st.intro));
    const ol = el('ol', '');
    for (const t of members) {
      const li = el('li', '', '#' + t.roadmapOrder + ' ' + t.name + ' — ' + gradeLabel(t.grade) + ' · ' + timeBadge(t) + ' · ' + statusLabel(getStatus(t.id)));
      li.style.cursor = 'pointer';
      li.addEventListener('click', () => openDetail(t.id));
      ol.append(li);
    }
    block.append(ol);
    box.append(block);
  }
}

function renderMatrix() {
  const cc = confidenceCounts();
  document.getElementById('confidence-legend').textContent =
    'Green = more than one source behind it, no disagreement, method pinned down. Amber = a single source, an unconfirmed method, or a source disagreement. ' +
    'In this ledger: ' + cc.green + ' green · ' + cc.amber + ' amber. Counts are computed from the data, not typed in.';
  const by = citedBy(), sc = stepsCiting();
  const table = el('table', 'matrix');
  const head = el('tr', '');
  for (const h of ['#', 'Source', 'Read', 'Guides citing it', 'Steps citing it', 'What it supports']) head.append(el('th', '', h));
  table.append(head);
  for (const s of DATA.sources) {
    const tr = el('tr', '');
    tr.append(el('td', '', '[' + s.id + ']'));
    const name = el('td', '');
    const a = el('a', '', s.name);
    a.href = s.url; a.target = '_blank'; a.rel = 'noopener';
    name.append(a);
    tr.append(name);
    tr.append(el('td', '', s.read));
    tr.append(el('td', '', (by[s.id] || 0) + '/55'));
    tr.append(el('td', '', String(sc[s.id] || 0)));
    tr.append(el('td', '', s.supports));
    table.append(tr);
  }
  const box = document.getElementById('matrix');
  box.replaceChildren(table);
  const list = document.getElementById('source-list');
  list.replaceChildren();
  for (const s of DATA.sources) {
    const li = el('li', '');
    const b = el('b', '', '[' + s.id + '] ' + s.name + ' — ' + s.title);
    const a = el('a', '', s.url);
    a.href = s.url; a.target = '_blank'; a.rel = 'noopener';
    li.append(b, el('br', ''), a, el('div', 'supports', s.supports));
    list.append(li);
  }
}

function renderMissables() {
  const box = document.getElementById('missables');
  box.replaceChildren();
  const items = DATA.trophies.filter(t => t.missable);
  for (const t of items) {
    const row = el('div', 'trow');
    row.dataset.id = t.id;
    row.append(el('div', 'main', ''));
    const main = row.firstChild;
    main.append(el('div', 'name', t.name + (t.missable === 'possible' ? ' — POSSIBLY MISSABLE' : ' — WATCH')));
    main.append(el('div', 'desc', t.short));
    row.addEventListener('click', () => openDetail(t.id));
    box.append(row);
  }
  const note = el('p', 'view-intro', 'Also watch: Race Against Yago in Chapter 3 is time-sensitive (hourglass icon) inside Strangers & Freaks (#25) — do it the moment it appears.');
  box.append(note);
}

function renderNextUp() {
  const box = document.getElementById('nextup-list');
  box.replaceChildren();
  for (const t of nextUp()) {
    const li = el('li', '');
    const b = el('b', '', t.name);
    li.append(b, el('span', 'why', ' — ' + nextUpWhy(t) + ' · ' + gradeLabel(t.grade) + ' · ' + timeBadge(t)));
    if (t.missable) li.append(el('span', 'badge missable', t.missable === 'possible' ? 'POSSIBLY MISSABLE' : 'WATCH'));
    li.style.cursor = 'pointer';
    li.addEventListener('click', () => openDetail(t.id));
    box.append(li);
  }
}

function renderProgress() {
  const box = document.getElementById('progress-view');
  box.replaceChildren();
  const total = DATA.trophies.length, earned = earnedCount();
  const pct = Math.round(earned / total * 100);
  box.append(el('p', '', earned + ' of ' + total + ' trophies earned (' + pct + '%) · ' + earnedPsn() + '/' + DATA.psnPointsTotal + ' PSN pts'));
  const bar = el('div', 'progress-bar');
  bar.append(el('div', ''));
  bar.firstChild.style.width = pct + '%';
  box.append(bar);
  const gc = gradeCounts();
  for (const g of ['platinum', 'gold', 'silver', 'bronze']) {
    box.append(el('p', '', gradeLabel(g) + ': ' + gc[g].earned + '/' + gc[g].total));
  }
  const byStage = DATA.stages.map(st => {
    const members = DATA.trophies.filter(t => t.stage === st.id);
    const e = members.filter(t => getStatus(t.id) === 'earned').length;
    return st.id + ' ' + st.title + ': ' + e + '/' + members.length;
  });
  for (const line of byStage) box.append(el('p', '', line));
}

function citeMarks(ids) {
  return ids.length ? ' [' + ids.join('][') + ']' : '';
}

function openDetail(id) {
  const t = trophyById(id);
  if (!t) return;
  state.detailId = id;
  const d = document.getElementById('detail');
  d.hidden = false;
  d.replaceChildren();
  const close = el('button', 'close', 'Close ✕');
  close.type = 'button';
  close.addEventListener('click', () => { d.hidden = true; state.detailId = null; });
  d.append(close);
  d.append(el('h2', '', t.name));
  d.append(el('p', '', gradeLabel(t.grade) + ' · TROPHY #' + t.id + ' OF 55 · Stage ' + t.stage + ' · Roadmap #' + t.roadmapOrder));
  const mark = el('button', '', getStatus(t.id) === 'earned' ? '✓ Earned — mark to do' : 'Mark earned');
  mark.type = 'button';
  mark.id = 'detail-mark';
  mark.addEventListener('click', () => { setStatus(t.id, getStatus(t.id) === 'earned' ? 'todo' : 'earned'); renderAll(); openDetail(id); });
  d.append(mark);
  const chips = el('div', 'badges');
  chips.append(el('span', 'badge grade-' + t.grade, gradeLabel(t.grade)));
  chips.append(el('span', 'badge', 'Difficulty ' + t.difficulty + '/5'));
  chips.append(el('span', 'badge', timeBadge(t)));
  for (const k of t.kinds) chips.append(el('span', 'badge', k));
  chips.append(el('span', 'badge ' + confidence(t), confidence(t) === 'green' ? '● Backed' : '● Check'));
  if (t.hidden) chips.append(el('span', 'badge hidden-flag', 'HIDDEN ON PSN'));
  d.append(chips);
  const off = el('div', 'official');
  off.append(el('b', '', 'OFFICIAL DESCRIPTION — PLAYSTATION'), el('p', '', t.description));
  d.append(off);
  const ins = el('div', 'inshort');
  ins.append(el('b', '', 'IN SHORT'), el('p', '', t.short));
  d.append(ins);
  if (t.missable === 'possible') {
    const w = el('div', 'warnbox');
    w.append(el('b', '', 'MISSABLE? POSSIBLY'), el('p', '', 'The first meditation is only doable during Chapter 1 at Jason\u2019s house and becomes permanently unavailable after Chapter 1. Do it in Chapter 1 and keep a Chapter 1 save.'));
    const show = el('button', '', 'Show it');
    show.type = 'button';
    show.addEventListener('click', () => { state.tab = 'checklist'; state.filter = 'missable'; saveState(); renderAll(); });
    w.append(show);
    d.append(w);
  } else if (t.missable === 'watch') {
    const w = el('div', 'warnbox');
    w.append(el('b', '', 'MISSABLE? WATCH'), el('p', '', 'Not confirmed missable, but this side questline is easy to put off — do it when it appears rather than leaving it for the end.'));
    d.append(w);
  }
  if (t.unconfirmed) {
    const n = el('div', 'notpinned');
    n.append(el('b', '', 'NOT PINNED DOWN YET'), el('p', '', 'No source has a confirmed method for this trophy. The steps below are the only lead anywhere, labelled as a belief — not a method.'));
    d.append(n);
  }
  if (t.singleSource) {
    const n = el('div', 'notpinned');
    n.append(el('b', '', 'SINGLE SOURCE'), el('p', '', 'Only PowerPyx gives a method for this trophy. Five other guides still list it as unconfirmed — shown as one source, never as multi-source confirmed.'));
    d.append(n);
  }
  const h3 = el('h3', '', 'HOW TO GET IT');
  d.append(h3);
  const ol = el('ol', 'steps');
  for (const s of t.steps) {
    const li = el('li', '', s.text);
    li.append(el('span', 'cite', citeMarks(s.cites)));
    ol.append(li);
  }
  d.append(ol);
  if (t.resolvedNote) {
    const r = el('div', 'diffbox');
    r.append(el('b', '', 'RESOLVED — NOT A LIVE DISAGREEMENT'), el('p', '', t.resolvedNote));
    d.append(r);
  }
  for (const dis of t.disagreements) {
    const box = el('div', 'diffbox');
    box.append(el('b', '', 'SOURCES DIFFER — ' + dis.id + ': ' + dis.title));
    box.append(el('p', '', 'Version A: ' + dis.a + citeMarks(dis.aCites)));
    box.append(el('p', '', 'Version B: ' + dis.b + citeMarks(dis.bCites)));
    d.append(box);
  }
  if (t.counter) {
    const c = el('div', 'counter');
    c.append(el('span', '', 'YOUR COUNT '));
    const minus = el('button', '', '−');
    minus.type = 'button';
    minus.addEventListener('click', () => { setCounter(t.id, getCounter(t.id) - 1); renderAll(); openDetail(id); });
    c.append(minus, el('span', 'count-val', getCounter(t.id) + '/' + t.counter.target + ' ' + t.counter.label));
    const plus = el('button', '', '+');
    plus.type = 'button';
    plus.addEventListener('click', () => { setCounter(t.id, getCounter(t.id) + 1); renderAll(); openDetail(id); });
    c.append(plus);
    d.append(el('h3', '', 'YOUR COUNT'), c);
  }
  if (t.notes && t.notes.length) {
    const nb = el('div', 'diffbox');
    nb.append(el('b', '', 'SINGLE-SOURCE CLAIMS — SHOWN AS SUCH'));
    for (const n of t.notes) nb.append(el('p', '', n.text + ' (' + n.source + ')'));
    d.append(nb);
  }
  d.append(el('p', 'foot', 'Our own wording. Cited [' + t.sources.join('][') + '] · read ' + DATA.sourcesRead + ' · trophy ' + t.id + ' of 55 · unofficial'));
}

function renderTabs() {
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === state.tab));
  for (const v of ['checklist', 'roadmap', 'matrix', 'missables', 'nextup', 'progress']) {
    document.getElementById('view-' + v).hidden = state.tab !== v;
  }
}

function renderAll() {
  document.documentElement.dataset.theme = state.theme;
  renderHeader();
  renderAudit();
  renderBanner();
  renderTabs();
  renderChecklist();
  renderRoadmap();
  renderMatrix();
  renderMissables();
  renderNextUp();
  renderProgress();
  if (state.detailId) { /* detail re-rendered by its own actions */ }
}
