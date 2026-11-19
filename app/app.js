// LEONIDA LEDGER v4 — boot + event wiring.
async function boot() {
  const res = await fetch('data/trophies.json');
  DATA = await res.json();
  loadState();
  document.documentElement.dataset.theme = state.theme;

  document.getElementById('theme-toggle').addEventListener('click', () => {
    state.theme = state.theme === 'light' ? 'dark' : 'light';
    saveState(); renderAll();
  });
  document.getElementById('spoiler-toggle').addEventListener('click', () => {
    state.spoilers = !state.spoilers;
    saveState(); renderAll();
  });
  document.getElementById('export-btn').addEventListener('click', exportProgress);
  document.getElementById('import-input').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      importProgress(await file.text());
      renderAll();
    } catch (err) {
      alert('Import failed: that file is not a LEONIDA LEDGER progress export.');
    }
    e.target.value = '';
  });
  document.getElementById('reset-btn').addEventListener('click', () => {
    if (!confirm('Reset all progress, counters and settings?')) return;
    const keepTheme = state.theme;
    state = defaultState();
    state.theme = keepTheme;
    saveState(); renderAll();
  });
  document.querySelectorAll('.tab').forEach(b => {
    b.addEventListener('click', () => { state.tab = b.dataset.tab; saveState(); renderAll(); });
  });
  document.getElementById('grade-select').addEventListener('change', (e) => {
    state.grade = e.target.value; saveState(); renderAll();
  });
  document.getElementById('sort-select').addEventListener('change', (e) => {
    state.sort = e.target.value; saveState(); renderAll();
  });
  document.getElementById('search-input').addEventListener('input', (e) => {
    state.search = e.target.value; renderAll();
    // keep focus in the search box after re-render
    const box = document.getElementById('search-input');
    box.focus();
    box.setSelectionRange(box.value.length, box.value.length);
  });
  // Press / anywhere to jump to search (unless already typing in a field).
  document.addEventListener('keydown', (e) => {
    if (e.key !== '/' || e.target.matches('input, textarea, select')) return;
    e.preventDefault();
    document.getElementById('search-input').focus();
  });

  // restore toolbar controls from state
  document.getElementById('grade-select').value = state.grade;
  document.getElementById('sort-select').value = state.sort;
  document.getElementById('search-input').value = state.search;
  document.getElementById('foot-note').textContent =
    'LEONIDA LEDGER v4 · ' + DATA.trophies.length + ' trophies · ' + DATA.sources.length + ' sources · ' +
    'difficulty + time on ' + DATA.trophies.filter(t => t.timeMin !== null).length + '/55 trophies';

  renderAll();
  saveState();
}

boot().catch((err) => {
  document.body.insertAdjacentHTML('beforeend', '<p>Failed to load the trophy data: ' + String(err) + '</p>');
});
