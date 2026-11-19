// LEONIDA LEDGER v4 — state, persistence, and computed data. No network requests.
const STORE_KEY = 'leonida-ledger-v4';
const PSN_POINTS = { platinum: 300, gold: 90, silver: 30, bronze: 15 };

let DATA = null; // loaded trophies.json

function defaultState() {
  return {
    status: {},       // trophy id -> 'todo' | 'doing' | 'earned'
    counters: {},     // trophy id -> number
    revealed: {},     // trophy id -> true (spoiler revealed per row)
    theme: 'light',
    spoilers: false,  // false = hidden trophies concealed
    tab: 'checklist',
    filter: 'all',
    grade: 'all',
    sort: 'roadmap',
    search: '',
    detailId: null,
    savedAt: null,
  };
}

let state = defaultState();

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') state = Object.assign(defaultState(), parsed);
  } catch (e) { /* corrupt save: start fresh */ }
}

function saveState() {
  state.savedAt = new Date().toISOString();
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* storage full/blocked */ }
  const stamp = document.getElementById('saved-stamp');
  if (stamp) {
    const d = new Date(state.savedAt);
    stamp.textContent = 'Saved in this browser ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
}

function getStatus(id) { return state.status[id] || 'todo'; }
function setStatus(id, s) { state.status[id] = s; saveState(); }
function cycleStatus(id) {
  const cur = getStatus(id);
  setStatus(id, cur === 'todo' ? 'doing' : cur === 'doing' ? 'earned' : 'todo');
}
function getCounter(id) { return state.counters[id] || 0; }
function setCounter(id, v) {
  const t = trophyById(id);
  const max = t && t.counter ? t.counter.target : 0;
  state.counters[id] = Math.max(0, Math.min(max, v));
  saveState();
}

function trophyById(id) { return DATA.trophies.find(t => t.id === id); }
function sourceById(id) { return DATA.sources.find(s => s.id === id); }

function earnedList() { return DATA.trophies.filter(t => getStatus(t.id) === 'earned'); }
function earnedCount() { return earnedList().length; }
function earnedPsn() { return earnedList().reduce((a, t) => a + t.psnPoints, 0); }
function inProgressCount() { return DATA.trophies.filter(t => getStatus(t.id) === 'doing').length; }

function gradeCounts() {
  const out = {};
  for (const g of ['platinum', 'gold', 'silver', 'bronze']) {
    out[g] = {
      earned: DATA.trophies.filter(t => t.grade === g && getStatus(t.id) === 'earned').length,
      total: DATA.trophies.filter(t => t.grade === g).length,
    };
  }
  return out;
}

// --- computed audit data (never hardcoded) ---
function citedSteps() {
  let total = 0, cited = 0;
  for (const t of DATA.trophies) for (const s of t.steps) { total++; if (s.cites && s.cites.length) cited++; }
  return { total, cited };
}
function citedBy() {
  const out = {};
  for (const s of DATA.sources) out[s.id] = 0;
  for (const t of DATA.trophies) for (const id of t.sources) out[id] = (out[id] || 0) + 1;
  return out;
}
function stepsCiting() {
  const out = {};
  for (const s of DATA.sources) out[s.id] = 0;
  for (const t of DATA.trophies) for (const st of t.steps) for (const id of st.cites) out[id] = (out[id] || 0) + 1;
  return out;
}
function auditNumbers() {
  const cs = citedSteps();
  return {
    total: DATA.trophies.length,
    hidden: DATA.trophies.filter(t => t.hidden).length,
    guidesCite: DATA.trophies.filter(t => t.sources.length > 0).length,
    stepsCited: cs.cited, stepsTotal: cs.total,
    sources: DATA.sources.length,
    possible: DATA.trophies.filter(t => t.missable === 'possible').length,
    watch: DATA.trophies.filter(t => t.missable === 'watch').length,
    unconfirmed: DATA.trophies.filter(t => t.unconfirmed).length,
    singleSource: DATA.trophies.filter(t => t.singleSource).length,
    disagree: DATA.trophies.reduce((a, t) => a + t.disagreements.length, 0),
    counters: DATA.trophies.filter(t => t.counter).length,
  };
}
function confidence(t) {
  // Green: more than one source behind it, no disagreement, method pinned down.
  // Amber: a single source, an unconfirmed method, or a source disagreement.
  if (t.sources.length < 2 || t.disagreements.length > 0 || t.unconfirmed) return 'amber';
  return 'green';
}
function confidenceCounts() {
  let green = 0, amber = 0;
  for (const t of DATA.trophies) (confidence(t) === 'green' ? green++ : amber++);
  return { green, amber };
}

function isQuickWin(t) {
  return t.timeMin !== null && t.timeMin <= 15 && t.difficulty <= 2 && getStatus(t.id) !== 'earned';
}
function kindCount(kind) {
  if (kind === 'all') return DATA.trophies.length;
  if (kind === 'todo') return DATA.trophies.filter(t => getStatus(t.id) === 'todo').length;
  if (kind === 'earned') return earnedCount();
  if (kind === 'quick') return DATA.trophies.filter(isQuickWin).length;
  if (kind === 'online') return 0; // every trophy is offline; the filter shows that honestly
  return DATA.trophies.filter(t => t.kinds.includes(kind)).length;
}
const FILTERS = [
  ['all', 'All 55'], ['story', 'Story'], ['missable', 'Missable'], ['collectibles', 'Collectibles'],
  ['activities', 'Activities'], ['online', 'Online'], ['side', 'Side'], ['feats', 'Feats'],
  ['crime', 'Crime'], ['riddles', 'Riddles'], ['money', 'Money'], ['mystery', 'Mystery'],
  ['unconfirmed', 'Unconfirmed'], ['todo', 'To do'], ['earned', 'Earned'], ['quick', 'Quick wins'],
];

function filteredTrophies() {
  let list = DATA.trophies.slice();
  const f = state.filter;
  if (f === 'todo') list = list.filter(t => getStatus(t.id) === 'todo');
  else if (f === 'earned') list = list.filter(t => getStatus(t.id) === 'earned');
  else if (f === 'quick') list = list.filter(isQuickWin);
  else if (f === 'online') list = [];
  else if (f !== 'all') list = list.filter(t => t.kinds.includes(f));
  if (state.grade !== 'all') list = list.filter(t => t.grade === state.grade);
  if (state.search.trim()) {
    const q = state.search.trim().toLowerCase();
    list = list.filter(t => (t.name + ' ' + t.description + ' ' + t.short).toLowerCase().includes(q));
  }
  const gradeRank = { platinum: 0, gold: 1, silver: 2, bronze: 3 };
  if (state.sort === 'grade') list.sort((a, b) => gradeRank[a.grade] - gradeRank[b.grade] || a.roadmapOrder - b.roadmapOrder);
  else if (state.sort === 'az') list.sort((a, b) => a.name.localeCompare(b.name));
  else if (state.sort === 'difficulty') list.sort((a, b) => a.difficulty - b.difficulty || a.roadmapOrder - b.roadmapOrder);
  else list.sort((a, b) => a.roadmapOrder - b.roadmapOrder);
  return list;
}

function nextUp() {
  // Missable risk first, then roadmap order, then shortest time.
  const open = DATA.trophies.filter(t => getStatus(t.id) !== 'earned');
  const risk = t => t.missable === 'possible' ? 0 : t.missable === 'watch' ? 1 : 2;
  open.sort((a, b) => risk(a) - risk(b) || a.roadmapOrder - b.roadmapOrder || (a.timeMin ?? 99999) - (b.timeMin ?? 99999));
  return open.slice(0, 8);
}
function nextUpWhy(t) {
  if (t.missable === 'possible') return 'Possibly missable — closes after Chapter 1, do it now';
  if (t.missable === 'watch') return 'Watch item — side chain, do it before moving on';
  if (t.id === 25) return 'Do Race Against Yago the moment it appears — it is time-sensitive';
  if (t.timeMin !== null && t.timeMin <= 15) return 'Quick win — about ' + t.timeMin + ' min';
  return 'Roadmap order #' + t.roadmapOrder + (t.timeMin !== null ? ' · about ' + fmtTime(t.timeMin) : '');
}

function fmtTime(min) {
  if (min === null || min === undefined) return 'no time yet';
  if (min < 60) return min + ' min';
  const h = Math.floor(min / 60), m = min % 60;
  return m ? h + ' h ' + m + ' min' : h + ' h';
}

function exportProgress() {
  const payload = { app: 'leonida-ledger-v4', exportedAt: new Date().toISOString(), status: state.status, counters: state.counters };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'leonida-ledger-progress.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function importProgress(text) {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object') throw new Error('not an object');
  if (parsed.app && parsed.app !== 'leonida-ledger-v4') throw new Error('not a LEONIDA LEDGER export');
  if (parsed.status) {
    for (const [k, v] of Object.entries(parsed.status)) {
      const id = Number(k);
      if (trophyById(id) && ['todo', 'doing', 'earned'].includes(v)) state.status[id] = v;
    }
  }
  if (parsed.counters) {
    for (const [k, v] of Object.entries(parsed.counters)) {
      const id = Number(k);
      const t = trophyById(id);
      if (t && t.counter && Number.isFinite(Number(v))) state.counters[id] = Math.max(0, Math.min(t.counter.target, Number(v)));
    }
  }
  saveState();
}
