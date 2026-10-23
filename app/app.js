import { CATEGORIES, MAX_BYTES, parseSnapshot, compare, residuals, escapeHtml as e, explanation, reportHtml } from './core.js';
import { demoSnapshots } from './demo.js';
import { investigate, emptyReview, packageInvestigation, parseInvestigation, reviewHtml, investigationReport } from './investigation.js';
import { renderWorkbench, disposeWorkbench } from './workbench.js';
const prefs = { slot: 1, appId: null, selected: null, search: '' };
let review = emptyReview();
const slots = ['Before install', 'After install', 'After uninstall'];
const state = { snapshots: [null, null, null], mode: 'install', category: 'all', kind: 'all', search: '', selected: null, result: null, page: 0, group: 'changes' };
const versions = [0, 0, 0];
const $ = id => document.getElementById(id);
const date = v => new Date(v).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
function notify(message, error = false) { $('notice').hidden = false; $('notice').textContent = message; $('notice').classList.toggle('error', error); }
function download(content, filename, mime) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function renderSlots() {
  $('snapshots').innerHTML = slots.map((label, i) => {
    const s = state.snapshots[i], count = s && Object.values(s.sections).reduce((a, b) => a + b.items.length, 0);
    const partial = s && Object.values(s.sections).some(section => ['partial','failed'].includes(section.status));
    return `<section class="snapshot ${s ? 'loaded' : ''}"><div class="snapshot-heading"><span class="step-number">0${i + 1}</span><h3>${label}</h3>${s ? '<span class="loaded-dot" aria-label="Loaded"></span>' : ''}</div>${s ? `<strong class="snapshot-label">${e(s.label)}</strong><p class="snapshot-meta">${e(date(s.capturedAt))} · ${count} records</p><span class="capture-status">${partial ? 'Partial coverage' : 'Collected scope complete'}</span><div class="slot-actions"><label class="file-button" for="file-${i}">Replace</label><button class="text-button" data-save="${i}" aria-label="Save ${label} snapshot">Save</button><button class="text-button" data-clear="${i}" aria-label="Clear ${label} snapshot">Clear</button></div>` : `<p class="snapshot-meta">${i === 2 ? 'Optional · reveals residual candidates' : 'Import a collector JSON snapshot'}</p><label class="import-button" for="file-${i}"><span aria-hidden="true">＋</span> Choose snapshot</label>`}<input class="file-input" id="file-${i}" data-slot="${i}" type="file" accept=".json,application/json" aria-label="Import ${label} snapshot"></section>`;
  }).join('');
}
function activeSnapshots() { return state.mode === 'residual' ? state.snapshots : state.mode === 'uninstall' ? state.snapshots.slice(1) : state.snapshots.slice(0, 2); }
function compute() {
  state.result = null;
  if (state.mode === 'investigate') return;
  const snapshots = activeSnapshots();
  if (snapshots.some(s => !s)) return;
  try { state.result = state.mode === 'residual' ? residuals(...snapshots) : compare(...snapshots); }
  catch (error) { notify(error.message, true); }
}
function resetFilters() { state.category = 'all'; state.kind = 'all'; state.search = ''; state.selected = null; state.page = 0; state.group = 'changes'; }
function renderComparison() {
  disposeWorkbench();
  if (state.mode === 'investigate') {
    const current = renderWorkbench($('comparison'), state.snapshots, review, prefs, markReview, profile => { $('export').disabled = !profile; });
    $('export').disabled = !current?.profile;
    return;
  }
  compute(); $('export').disabled = !state.result;
  const r = state.result;
  if (!r) {
    $('comparison').innerHTML = `<section class="empty"><div class="empty-diagram" aria-hidden="true"><span>01<br><small>BEFORE</small></span><b>→</b><span>02<br><small>AFTER</small></span></div><h2>A before. An after. The whole difference.</h2><p>${state.mode === 'residual' ? 'Load all three snapshots to see which install-period changes remain after uninstall.' : state.mode === 'uninstall' ? 'Load after-install and after-uninstall snapshots to compare the uninstall period.' : 'Load before-install and after-install snapshots, or explore a fictional install and uninstall.'}</p><button class="button primary" id="empty-demo">Explore the example ↗</button><p class="empty-note">Four configuration sources · No uploads · No automatic cleanup</p></section>`;
    return;
  }
  const partial = r.coverage.filter(c => !c.complete);
  const counts = Object.fromEntries(['added', 'removed', 'changed', 'unconfirmed'].map(kind => [kind, r.changes.filter(c => c.kind === kind).length]));
  const snapshots = activeSnapshots();
  const demo = snapshots.every(s => s.machine.id === 'fictional-workstation');
  const description = state.mode === 'residual' ? 'install-period changes still differ from baseline' : 'configuration changes observed between captures';
  $('comparison').innerHTML = `<section class="summary"><div class="summary-count"><strong>${r.changes.length}</strong><span>${state.mode === 'residual' ? 'residual candidates' : 'changes to review'}</span></div><div class="summary-context"><h2>${state.mode === 'residual' ? (r.changes.length ? 'Some changes remain after uninstall.' : 'No confirmed residual candidates.') : state.mode === 'uninstall' ? 'The uninstall, in detail.' : 'A clearer view of the footprint.'}</h2><p>${r.changes.length} ${description}. ${state.mode === 'residual' ? `${r.reverted.length} returned to baseline; ${r.unresolved.length} need more evidence.` : `${r.unchanged} records are unchanged.`}</p><div class="summary-tags">${demo ? '<span class="demo-tag">FICTIONAL EXAMPLE</span>' : ''}<span>${e(snapshots[0].machine.name)}</span><span>${e(date(snapshots[0].capturedAt))} → ${e(date(snapshots.at(-1).capturedAt))}</span></div></div></section>
  <details class="coverage ${partial.length ? 'incomplete' : ''}"><summary><span>${partial.length ? `${partial.length} sources have incomplete coverage` : `All ${r.coverage.length} collected sources report complete coverage`}</span><span>Inspect coverage +</span></summary><p>Complete means the collector finished its declared scope. It does not cover every Windows persistence mechanism or prove a consistent point-in-time snapshot.</p><div class="coverage-grid">${r.coverage.map(c => `<div><strong>${e(c.title)}</strong><p>Before: ${e(c.before)}${c.installed ? ` · Installed: ${e(c.installed)}` : ''} · After: ${e(c.after)}</p>${c.warnings.map(w => `<p class="coverage-warning">${e(w)}</p>`).join('')}</div>`).join('')}</div></details>
  ${state.mode === 'residual' ? `<div class="result-groups" role="group" aria-label="Evidence groups">${[['changes', 'Residual candidates', r.changes.length], ['reverted', 'Returned to baseline', r.reverted.length], ['unresolved', 'Incomplete evidence', r.unresolved.length], ['laterChanges', 'Other later changes', r.laterChanges.length]].map(([key, title, count]) => `<button data-group="${key}" aria-pressed="${state.group === key}">${title} <span>${count}</span></button>`).join('')}</div>` : `<div class="change-counts"><span><b>＋ ${counts.added}</b> added</span><span><b>− ${counts.removed}</b> removed</span><span><b>~ ${counts.changed}</b> changed</span>${counts.unconfirmed ? `<span><b>? ${counts.unconfirmed}</b> unconfirmed</span>` : ''}</div>`}
  <section class="explorer" aria-label="Change explorer"><div class="toolbar"><div class="categories" role="group" aria-label="Category filter">${[['all', 'All sources'], ...Object.entries(CATEGORIES)].map(([key, title]) => `<button data-category="${key}" aria-pressed="${state.category === key}">${title}</button>`).join('')}</div><div class="search-row"><label class="search-label"><span aria-hidden="true">⌕</span><input id="search" type="search" placeholder="Search names, paths, commands…" aria-label="Search changes" value="${e(state.search)}"></label><label class="kind-filter"><span class="sr-only">Change type</span><select id="kind"><option value="all">All change types</option>${['added','removed','changed','unconfirmed','residual','reverted'].map(k => `<option ${state.kind === k ? 'selected' : ''} value="${k}">${k[0].toUpperCase() + k.slice(1)}</option>`).join('')}</select></label></div></div><div class="explorer-body"><div class="results-pane"><div id="result-heading" class="results-heading"></div><div id="results"></div><div id="pagination" class="pagination"></div></div><aside id="detail" class="detail-pane" aria-label="Selected change evidence"></aside></div></section>`;
  renderResults();
}
function getRows() {
  const items = state.result[state.group] ?? [];
  const term = state.search.toLocaleLowerCase();
  return items.filter(c => (state.category === 'all' || c.category === state.category) && (state.kind === 'all' || c.kind === state.kind) && (!term || JSON.stringify([c.name, c.id, c.before, c.after, c.installed]).toLocaleLowerCase().includes(term)));
}
function renderResults() {
  if (!state.result || !$('results')) return;
  const rows = getRows(), pageSize = 40;
  state.page = Math.min(state.page, Math.max(0, Math.ceil(rows.length / pageSize) - 1));
  const visible = rows.slice(state.page * pageSize, (state.page + 1) * pageSize);
  if (!visible.some(c => c.key === state.selected)) state.selected = visible[0]?.key ?? null;
  $('result-heading').textContent = `${rows.length} ${rows.length === 1 ? 'record' : 'records'}${state.search || state.category !== 'all' || state.kind !== 'all' ? ' matching filters' : ' in this view'}`;
  $('results').innerHTML = visible.map(c => `<button class="change-row ${state.selected === c.key ? 'selected' : ''}" data-record="${e(c.key)}" aria-pressed="${state.selected === c.key}"><span class="kind-marker ${c.kind}" aria-hidden="true">${({ added: '+', removed: '−', changed: '~', residual: '↳', reverted: '✓', unconfirmed: '?' })[c.kind]}</span><span class="record-name"><strong>${e(c.name || '(unnamed entry)')}</strong><small>${e(CATEGORIES[c.category])} · ${e(c.kind)}</small></span><span class="row-arrow" aria-hidden="true">→</span></button>`).join('') || '<div class="no-results"><h3>No matching changes.</h3><p>Try another source, change type or search.</p><button id="reset-filters" class="button quiet">Clear filters</button></div>';
  $('pagination').innerHTML = rows.length > pageSize ? `<button class="button quiet" data-page="-1" ${state.page === 0 ? 'disabled' : ''}>Previous</button><span>${state.page + 1} / ${Math.ceil(rows.length / pageSize)}</span><button class="button quiet" data-page="1" ${(state.page + 1) * pageSize >= rows.length ? 'disabled' : ''}>Next</button>` : '';
  renderDetail(rows.find(c => c.key === state.selected));
}
function renderDetail(c) {
  if (!c) { $('detail').innerHTML = '<div class="detail-empty">Select a change to inspect its evidence.</div>'; return; }
  const item = c.after ?? c.installed ?? c.before;
  const captures = activeSnapshots();
  const evidenceCapture = c.after ? captures.at(-1) : c.installed ? captures[1] : captures[0];
  const decisionKey = `${evidenceCapture.id}|${c.key}`;
  const decision = review.decisions[decisionKey] ?? { status: 'unreviewed', reason: '' };
  $('detail').innerHTML = `<div class="eyebrow">RECORDED EVIDENCE <span>${e(c.kind.toUpperCase())}</span></div><h2>${e(c.name)}</h2><p class="explanation">${e(explanation(c))}</p><dl class="evidence-meta"><dt>Source</dt><dd>${e(item?.source)}</dd><dt>Stable identity</dt><dd>${e(c.id)}</dd></dl><h3>${state.mode === 'residual' ? 'Baseline → after uninstall' : 'Before → after'}</h3>${c.deltas.length ? c.deltas.map(d => `<div class="field-diff"><h4>${e(d.field)}</h4><div class="before-value"><span>BEFORE</span><code>${e(d.before ?? '(absent)')}</code></div><div class="after-value"><span>AFTER</span><code>${e(d.after ?? '(absent)')}</code></div></div>`).join('') : '<p class="muted">No difference from baseline in the recorded fields.</p>'}<details class="raw"><summary>Full record evidence</summary><pre>${e(JSON.stringify({ before: c.before, installed: c.installed, after: c.after }, null, 2))}</pre></details><div class="decision-editor" data-decision-key="${e(decisionKey)}"><h3>Your review</h3><label>Decision<select id="comparison-decision">${[['unreviewed','Not reviewed'],['investigate','Investigate further'],['keep','Keep / expected'],['unrelated','Likely unrelated']].map(([k,v]) => `<option value="${k}" ${decision.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label><label>Reason<textarea id="comparison-reason" maxlength="5000" rows="3">${e(decision.reason)}</textarea></label></div><div class="detail-caution">Review the source and publisher before taking action. This tool does not establish whether an entry is safe to remove.</div>`;
}
function markReview() { $('review-status').textContent = 'In tab memory · export the investigation to save'; }
function pruneReview() {
  const ids = new Set(state.snapshots.filter(Boolean).map(s => s.id));
  for (const id of Object.keys(review.contexts)) if (!ids.has(id)) delete review.contexts[id];
  const keys = new Set();
  for (const s of state.snapshots.filter(Boolean)) for (const [c, section] of Object.entries(s.sections)) for (const i of section.items) keys.add(`${s.id}|${c}:${i.id}`);
  for (const key of Object.keys(review.decisions)) if (!keys.has(key)) delete review.decisions[key];
}
function renderNotes() {
  $('review-title').value = review.title; $('review-notes').value = review.notes;
  $('capture-contexts').innerHTML = state.snapshots.map((s, i) => s ? `<label>${e(slots[i])}: capture context<textarea data-context="${e(s.id)}" maxlength="5000" rows="2" placeholder="Reboot, Windows update, other installers…">${e(review.contexts[s.id] ?? '')}</textarea></label>` : '').join('');
}
function render() { pruneReview(); renderSlots(); renderComparison(); renderNotes(); }
function loadDemo() { versions.forEach((_, i) => versions[i]++); state.snapshots = demoSnapshots().map(s => parseSnapshot(JSON.stringify(s))); review = emptyReview(); prefs.appId = null; prefs.search = ''; resetFilters(); $('notice').hidden = true; render(); notify('Fictional AsterDesk example loaded. No information from this computer was collected.'); }
$('demo').addEventListener('click', loadDemo);
$('guide-open').addEventListener('click', () => $('guide').showModal());
$('guide-close').addEventListener('click', () => $('guide').close());
$('snapshots').addEventListener('change', async event => {
  const input = event.target;
  if (!input.matches('[data-slot]')) return;
  const i = Number(input.dataset.slot), file = input.files?.[0], version = ++versions[i];
  if (!file) return;
  try {
    if (file.size > MAX_BYTES) throw new Error('Choose a snapshot smaller than 25 MB.');
    notify(`Reading ${file.name}…`);
    const snapshot = parseSnapshot(await file.text());
    if (versions[i] !== version) return;
    state.snapshots[i] = snapshot; resetFilters(); $('notice').hidden = true; render();
    if (state.result || activeSnapshots().some(s => !s)) notify(`${slots[i]} loaded. ${snapshot.machine.name} · ${snapshot.label}`);
  } catch (error) { if (versions[i] === version) notify(error.message, true); input.value = ''; }
});
$('snapshots').addEventListener('click', event => {
  const clear = event.target.closest('[data-clear]'), save = event.target.closest('[data-save]');
  if (clear) { const i = Number(clear.dataset.clear); versions[i]++; state.snapshots[i] = null; resetFilters(); $('notice').hidden = true; render(); }
  if (save) { const i = Number(save.dataset.save); download(JSON.stringify(state.snapshots[i], null, 2), ['before.json', 'installed.json', 'uninstalled.json'][i], 'application/json'); }
});
document.querySelector('.mode-tabs').addEventListener('click', event => {
  const button = event.target.closest('[data-mode]'); if (!button) return;
  state.mode = button.dataset.mode; resetFilters(); $('notice').hidden = true;
  document.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
  renderComparison();
});
$('comparison').addEventListener('click', event => {
  const button = event.target.closest('button'); if (!button) return;
  if (button.id === 'empty-demo') { loadDemo(); return; }
  if (button.id === 'reset-filters') { resetFilters(); renderComparison(); return; }
  if (button.dataset.category) { state.category = button.dataset.category; state.page = 0; document.querySelectorAll('[data-category]').forEach(b => b.setAttribute('aria-pressed', String(b === button))); renderResults(); }
  if (button.dataset.group) { resetFilters(); state.group = button.dataset.group; renderComparison(); }
  if (button.dataset.record) { state.selected = button.dataset.record; renderResults(); }
  if (button.dataset.page) { state.page += Number(button.dataset.page); renderResults(); }
});
$('comparison').addEventListener('input', event => { if (event.target.id === 'search') { state.search = event.target.value; state.page = 0; renderResults(); } if (event.target.id === 'comparison-reason') updateComparisonDecision(event.target, 'reason'); });
$('comparison').addEventListener('change', event => { if (event.target.id === 'kind') { state.kind = event.target.value; state.page = 0; renderResults(); } if (event.target.id === 'comparison-decision') updateComparisonDecision(event.target, 'status'); });
function updateComparisonDecision(target, field) { const key = target.closest('[data-decision-key]').dataset.decisionKey; review.decisions[key] = { status: 'unreviewed', reason: '', ...review.decisions[key], [field]: target.value }; markReview(); }
$('review-panel').addEventListener('input', event => { const target = event.target; if (target.id === 'review-title') review.title = target.value; if (target.id === 'review-notes') review.notes = target.value; if (target.dataset.context) review.contexts[target.dataset.context] = target.value; markReview(); });
$('package-save').addEventListener('click', () => { try { pruneReview(); download(packageInvestigation(state.snapshots, review), 'kingaftermath-investigation.json', 'application/json'); notify('Investigation exported with captures, contexts, notes and review decisions.'); } catch (error) { notify(error.message, true); } });
$('package-open').addEventListener('change', async event => {
  const file = event.target.files?.[0]; if (!file) return;
  try { if (file.size > MAX_BYTES * 3 + 2000000) throw new Error('Investigation package exceeds 77 MB.'); const restored = parseInvestigation(await file.text()); versions.forEach((_,i) => versions[i]++); state.snapshots = restored.snapshots; review = restored.review; resetFilters(); render(); notify('Unsigned investigation restored. Review its provenance before trusting the evidence.'); }
  catch (error) { notify(error.message, true); }
  finally { event.target.value = ''; }
});
$('export').addEventListener('click', () => {
  let html;
  if (state.mode === 'investigate') { const s = state.snapshots[prefs.slot], profile = s && investigate(s, prefs.appId); if (profile) html = investigationReport(s, profile, review); }
  else if (state.result) html = reportHtml(state.result, activeSnapshots(), state.mode).replace('<footer>', reviewHtml(review, state.snapshots) + '<footer>');
  if (html) { download(html, `kingaftermath-${state.mode}-${new Date().toISOString().slice(0, 10)}.html`, 'text/html'); notify('Full evidence report exported with operator notes and decisions. Review private paths before sharing.'); }
});
render();
