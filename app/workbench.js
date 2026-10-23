import { CATEGORIES, escapeHtml as e } from './core.js';
import { investigate } from './investigation.js';
let controller;
export function disposeWorkbench() { controller?.abort(); }
export function renderWorkbench(container, snapshots, review, prefs, onReview, onProfile = () => {}) {
  disposeWorkbench(); controller = new AbortController();
  const available = snapshots.map((s, i) => ({ s, i })).filter(x => x.s);
  if (!available.length) { onProfile(null); container.innerHTML = '<section class="empty"><h2>Start with the snapshot you have.</h2><p>Import any capture in the sidebar to investigate an installed application. No before snapshot is required.</p><button id="empty-demo" class="button primary">Explore the example ↗</button></section>'; return null; }
  if (!snapshots[prefs.slot]) prefs.slot = snapshots[1] ? 1 : available[0].i;
  const snapshot = snapshots[prefs.slot];
  const options = snapshot.sections.apps.items.filter(i => `${i.name} ${i.fields.Publisher ?? ''}`.toLowerCase().includes((prefs.search ?? '').toLowerCase())).sort((a, b) => a.name.localeCompare(b.name));
  if (!options.some(a => a.id === prefs.appId)) prefs.appId = options[0]?.id;
  const profile = investigate(snapshot, prefs.appId);
  const selected = profile?.related.find(r => r.key === prefs.selected) ?? profile?.related[0];
  prefs.selected = selected?.key;
  container.innerHTML = `<section class="investigation-controls"><label>Evidence capture<select id="investigation-capture">${available.map(({s, i}) => `<option value="${i}" ${i === prefs.slot ? 'selected' : ''}>${e(s.label)} · ${e(new Date(s.capturedAt).toLocaleString())}</option>`).join('')}</select></label><label>Find an application<input id="application-search" type="search" placeholder="Name or publisher" value="${e(prefs.search ?? '')}"></label><label>Application (${options.length} matching)<select id="application-choice">${options.slice(0, 200).map(a => `<option value="${e(a.id)}" ${a.id === prefs.appId ? 'selected' : ''}>${e(a.name)}</option>`).join('')}</select></label></section>${renderTargetHealth(snapshot,prefs)}${options.length > 200 ? '<p class="muted">Showing the first 200 matching applications. Narrow the search to find another.</p>' : ''}${profile ? `<section class="investigation-heading"><div><div class="eyebrow">SINGLE-CAPTURE INVESTIGATION ${snapshot.machine.id === 'fictional-workstation' ? '<span class="demo-tag">FICTIONAL EXAMPLE</span>' : ''}</div><h2>${e(profile.application.name)}</h2><p>${e(profile.application.fields.Publisher || 'Publisher not recorded')} · ${e(profile.application.fields.Version || 'Version not recorded')}</p></div><div><strong>${profile.related.length}</strong><span>potentially related records</span></div></section><p class="callout">Connections explain a matching heuristic. They do not establish ownership, installation timing, maliciousness or safe removal.</p><details class="coverage"><summary>Capture coverage and application registration</summary><div class="coverage-grid">${Object.entries(snapshot.sections).map(([k,s]) => `<div><strong>${e(CATEGORIES[k])}: ${e(s.status)}</strong>${s.warnings.map(w => `<p>${e(w)}</p>`).join('')}</div>`).join('')}</div><pre class="registration">${e(JSON.stringify(profile.application, null, 2))}</pre></details><div class="footprint-map" aria-label="Application footprint map"><div class="map-hub"><span class="eyebrow">APPLICATION REGISTRATION</span><strong>${e(profile.application.name)}</strong><code>${e(profile.application.fields.InstallLocation || 'No registered install folder')}</code></div><div class="map-lanes">${Object.keys(CATEGORIES).filter(k => k !== 'apps').map(k => {
    const rows = profile.related.filter(r => r.category === k);
    return `<section class="map-lane"><h3>${e(CATEGORIES[k])}<span>${rows.length}</span></h3>${rows.slice(0, 12).map(r => `<button data-footprint="${e(r.key)}" class="map-node ${r.key === selected?.key ? 'active' : ''}" aria-pressed="${r.key === selected?.key}"><strong>${e(r.item.name)}</strong><small>${e(r.confidence)} match${r.item.targets.some(t => t.status === 'missing') ? ' · missing target' : ''}</small></button>`).join('') || '<p>No matching records observed.</p>'}${rows.length > 12 ? `<p>${rows.length - 12} more matches. Use the full evidence selector below.</p>` : ''}</section>`;
  }).join('')}</div></div><section class="footprint-detail"><label>All matched evidence<select id="footprint-choice"><option value="">Choose a record</option>${profile.related.map(r => `<option value="${e(r.key)}" ${r.key === selected?.key ? 'selected' : ''}>${e(CATEGORIES[r.category])} / ${e(r.item.name)}</option>`).join('')}</select></label><div id="footprint-evidence">${selected ? renderEvidence(selected, snapshot, review) : '<p class="muted">No heuristic matches were found. This does not establish that the app has no other components.</p>'}</div></section>` : '<section class="empty"><h2>No matching application registrations.</h2><p>Try another name or capture. Portable apps and Store packages may have no uninstall registration in this scope.</p></section>'}`;
  function redraw() { return renderWorkbench(container, snapshots, review, prefs, onReview, onProfile); }
  container.addEventListener('change', event => {
    const target = event.target;
    if (target.id === 'investigation-capture') { prefs.slot = Number(target.value); prefs.search = ''; prefs.appId = null; redraw(); }
    if (target.id === 'application-choice') { prefs.appId = target.value; prefs.selected = null; redraw(); }
    if (target.id === 'footprint-choice') { prefs.selected = target.value; redraw(); }
    if (target.id === 'health-filter') { prefs.health = target.value; prefs.healthOpen = true; redraw(); }
    if (target.id === 'evidence-decision' && selected) { setDecision(target.value, null); }
  }, { signal: controller.signal });
  container.addEventListener('input', event => {
    const target = event.target;
    if (target.id === 'application-search') { const position = target.selectionStart; prefs.search = target.value; redraw(); const input = container.querySelector('#application-search'); input.focus(); if (position !== null) { try { input.setSelectionRange(position, position); } catch {} } }
    if (target.id === 'evidence-reason' && selected) setDecision(null, target.value);
  }, { signal: controller.signal });
  container.addEventListener('click', event => { const button = event.target.closest('[data-footprint]'); if (button) { prefs.selected = button.dataset.footprint; redraw(); container.querySelector('#footprint-evidence')?.scrollIntoView({ block: 'nearest', behavior: 'instant' }); } }, { signal: controller.signal });
  function setDecision(status, reason) {
    const key = `${snapshot.id}|${selected.key}`;
    const previous = review.decisions[key] ?? { status: 'unreviewed', reason: '' };
    review.decisions[key] = { status: status ?? previous.status, reason: reason ?? previous.reason };
    onReview();
  }
  onProfile(profile);
  return { snapshot, profile };
}
function renderTargetHealth(snapshot,prefs) {
  const all = Object.entries(snapshot.sections).flatMap(([category,s])=>s.items.flatMap(item=>item.targets.map(target=>({category,item,target}))));
  const status = prefs.health ?? 'missing';
  const rows = all.filter(r=>r.target.status===status);
  return `<details class="target-health" ${prefs.healthOpen ? 'open' : ''}><summary>Executable target observations · ${all.filter(r=>r.target.status==='missing').length} missing / ${all.length} recorded</summary><p>All records in this capture, independent of the selected app. These are capture-time observations; scripts and arguments are not inspected.</p><label>Target status <select id="health-filter">${['missing','exists','unresolved','inaccessible'].map(k=>`<option value="${k}" ${k===status?'selected':''}>${k}</option>`).join('')}</select></label>${rows.slice(0,200).map(r=>`<div class="health-row"><strong>${e(r.item.name)} · ${e(CATEGORIES[r.category])}</strong><code>${e(r.target.path || r.target.input)}</code><p>${e(r.target.reason)}</p><code>Source: ${e(r.item.source)} / ID: ${e(r.item.id)}</code></div>`).join('') || '<p>No observations with this status. Older captures or captures without -CheckTargets contain no target checks.</p>'}${rows.length>200?`<p>Showing 200 of ${rows.length} matching observations. Full observations remain in the snapshot JSON.</p>`:''}</details>`;
}
function renderEvidence(row, snapshot, review) {
  const decision = review.decisions[`${snapshot.id}|${row.key}`] ?? { status: 'unreviewed', reason: '' };
  return `<div class="eyebrow">WHY THIS CONNECTION EXISTS <span>${e(row.confidence.toUpperCase())} MATCH</span></div><h2>${e(row.item.name)}</h2>${row.reasons.map(r => `<div class="match-reason"><strong>${e(r.strength)} evidence</strong><p>${e(r.basis)}</p><code>${e(r.value)}</code></div>`).join('')}<h3>Executable targets at capture time</h3>${row.item.targets.length ? row.item.targets.map(t => `<div class="target-observation ${e(t.status)}"><strong>${e(t.status.toUpperCase())}</strong><code>${e(t.path || t.input)}</code><p>${e(t.reason)}</p></div>`).join('') : '<p class="muted">No target observations recorded. Capture with -CheckTargets to check supported local executable paths. This does not inspect script arguments or payloads.</p>'}<details class="raw"><summary>Recorded source, fields and targets</summary><pre>${e(JSON.stringify(row.item, null, 2))}</pre></details><div class="decision-editor"><h3>Your review (separate from collected evidence)</h3><label>Decision<select id="evidence-decision">${[['unreviewed','Not reviewed'],['investigate','Investigate further'],['keep','Keep / expected'],['unrelated','Likely unrelated']].map(([k,v]) => `<option value="${k}" ${decision.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label><label>Reason<textarea id="evidence-reason" maxlength="5000" rows="3">${e(decision.reason)}</textarea></label></div>`;
}
