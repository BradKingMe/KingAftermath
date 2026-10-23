export const CATEGORIES = { apps: 'Applications', startup: 'Startup entries', services: 'Services', tasks: 'Scheduled tasks', files: 'Tracked files' };
export const MAX_BYTES = 25 * 1024 * 1024;
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
function string(v, name, max = 32768) {
  if (typeof v !== 'string' || v.length > max || /\u0000/.test(v)) throw new Error(`Invalid ${name}. Expected text up to ${max} characters.`);
  return v;
}
export function parseSnapshot(text) {
  if (new TextEncoder().encode(text).length > MAX_BYTES) throw new Error('Snapshot exceeds the 25 MB limit.');
  let raw;
  try { raw = JSON.parse(text.replace(/^\uFEFF/, '')); } catch { throw new Error('This file is not valid JSON.'); }
  if (!object(raw) || raw.format !== 'kingaftermath.snapshot' || ![1, 2].includes(raw.version)) throw new Error('Use a KingAftermath snapshot, format version 1 or 2.');
  const id = string(raw.id, 'capture ID', 200);
  if (!id) throw new Error('Capture ID is missing.');
  const capturedAt = string(raw.capturedAt, 'capture timestamp', 100);
  if (!/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(capturedAt) || !Number.isFinite(Date.parse(capturedAt))) throw new Error('Capture timestamp must include a timezone.');
  if (!object(raw.machine)) throw new Error('Machine identity is missing.');
  const machine = {};
  for (const key of ['id', 'userId', 'name', 'os', 'scope']) machine[key] = string(raw.machine[key], `machine ${key}`, 500);
  if (!machine.id || !machine.userId || !machine.scope) throw new Error('Machine, user and collection scope IDs are required.');
  if (!object(raw.sections)) throw new Error('Snapshot sections are missing.');
  const sections = {};
  for (const key of Object.keys(CATEGORIES)) {
    const section = raw.sections[key] ?? (key === 'files' ? { status: 'not-collected', warnings: [], items: [] } : null);
    if (!object(section) || !['complete', 'partial', 'failed', ...(key === 'files' ? ['not-collected'] : [])].includes(section.status)) throw new Error(`${CATEGORIES[key]} coverage is missing or invalid.`);
    if (!Array.isArray(section.items) || section.items.length > 20000) throw new Error(`${CATEGORIES[key]} must contain at most 20,000 records.`);
    if (!Array.isArray(section.warnings) || section.warnings.length > 100) throw new Error(`Invalid ${key} warnings.`);
    const warnings = section.warnings.map(w => string(w, 'coverage warning', 2000));
    if (['failed', 'not-collected'].includes(section.status) && section.items.length) throw new Error(`A failed or uncollected ${key} section cannot contain records; use partial coverage.`);
    const ids = new Set();
    const items = section.items.map(item => {
      if (!object(item) || !object(item.fields)) throw new Error(`Invalid ${key} record.`);
      const id = string(item.id, 'record ID', 4096).toLowerCase();
      if (!id || ids.has(id)) throw new Error(`Missing or duplicate record ID in ${CATEGORIES[key]}.`);
      ids.add(id);
      const fields = Object.create(null);
      if (Object.keys(item.fields).length > 30) throw new Error('A record has too many fields.');
      for (const k of Object.keys(item.fields).sort()) {
        string(k, 'field name', 100);
        fields[k] = string(item.fields[k], 'field value');
      }
      const targets = item.targets ?? [];
      if (!Array.isArray(targets) || targets.length > 50) throw new Error('Invalid target observations.');
      return { id, name: string(item.name, 'record name', 2000), source: string(item.source, 'record source', 4096), fields, targets: targets.map(t => {
        if (!object(t) || !['exists','missing','unresolved','inaccessible'].includes(t.status)) throw new Error('Invalid target status.');
        return { input: string(t.input, 'target input'), path: string(t.path, 'target path', 4096), status: t.status, reason: string(t.reason, 'target reason', 2000) };
      }) };
    });
    sections[key] = { status: section.status, warnings, items };
  }
  const tracking = raw.tracking ?? [];
  if (!Array.isArray(tracking) || tracking.length > 10) throw new Error('At most ten tracked folders are supported.');
  return { format: raw.format, version: raw.version, id, capturedAt, label: string(raw.label, 'label', 200), collector: string(raw.collector, 'collector', 100), machine, tracking: tracking.map(p => string(p, 'tracked folder', 4096)).sort(), sections };
}
function canonical(item) { return JSON.stringify([item.name, item.source, Object.entries(item.fields).sort(([a], [b]) => a.localeCompare(b))]); }
function deltas(a, b) {
  const pairs = [['Name', a?.name, b?.name], ['Source', a?.source, b?.source]];
  for (const key of new Set([...Object.keys(a?.fields ?? {}), ...Object.keys(b?.fields ?? {})])) pairs.push([key, a?.fields[key], b?.fields[key]]);
  return pairs.filter(([, before, after]) => before !== after).map(([field, before, after]) => ({ field, before: before ?? null, after: after ?? null }));
}
export function assertCompatible(snapshots) {
  const base = snapshots[0];
  if (new Set(snapshots.map(s => s.id)).size !== snapshots.length) throw new Error('Each comparison slot needs a different capture.');
  for (let i = 1; i < snapshots.length; i++) {
    const s = snapshots[i];
    if (s.machine.id !== base.machine.id || s.machine.userId !== base.machine.userId || s.machine.scope !== base.machine.scope || s.collector !== base.collector || JSON.stringify(s.tracking) !== JSON.stringify(base.tracking)) throw new Error('Use captures from the same computer, Windows user, collector version and collection scope, including tracked folders.');
    if (s.id === snapshots[i - 1].id || Date.parse(s.capturedAt) <= Date.parse(snapshots[i - 1].capturedAt)) throw new Error('Choose different captures in chronological order: before, installed, uninstalled.');
  }
}
export function compare(before, after) {
  assertCompatible([before, after]);
  const changes = [], coverage = [];
  let unchanged = 0;
  for (const [category, title] of Object.entries(CATEGORIES)) {
    const a = before.sections[category], b = after.sections[category];
    if (a.status === 'not-collected' && b.status === 'not-collected') continue;
    const complete = a.status === 'complete' && b.status === 'complete';
    coverage.push({ category, title, before: a.status, after: b.status, complete, warnings: [...a.warnings, ...b.warnings] });
    const left = new Map(a.items.map(i => [i.id, i]));
    const right = new Map(b.items.map(i => [i.id, i]));
    for (const id of new Set([...left.keys(), ...right.keys()])) {
      const previous = left.get(id), current = right.get(id);
      if (previous && current && canonical(previous) === canonical(current)) { unchanged++; continue; }
      const kind = previous && current ? 'changed' : complete ? (current ? 'added' : 'removed') : 'unconfirmed';
      changes.push({ key: `${category}:${id}`, category, id, name: (current ?? previous).name, kind, before: previous ?? null, after: current ?? null, deltas: deltas(previous, current), complete });
    }
  }
  changes.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  return { changes, coverage, unchanged };
}
export function residuals(before, installed, uninstalled) {
  assertCompatible([before, installed, uninstalled]);
  const install = compare(before, installed), final = compare(before, uninstalled);
  const finalMap = new Map(final.changes.map(c => [c.key, c]));
  const finalItems = Object.fromEntries(Object.keys(CATEGORIES).map(k => [k, new Map(uninstalled.sections[k].items.map(i => [i.id, i]))]));
  const installKeys = new Set(install.changes.map(c => c.key));
  const candidates = [], reverted = [], unresolved = [];
  for (const change of install.changes) {
    const last = finalMap.get(change.key);
    const complete = [before, installed, uninstalled].every(s => s.sections[change.category].status === 'complete');
    const finalItem = finalItems[change.category].get(change.id);
    const row = { ...change, installed: change.after, after: finalItem ?? null, deltas: deltas(change.before, finalItem), complete };
    if (!complete) { unresolved.push({ ...row, kind: 'unconfirmed' }); continue; }
    if (!last) { reverted.push({ ...row, kind: 'reverted' }); continue; }
    // A new record absent at baseline and still present after uninstall is a residual candidate.
    // A pre-existing record still different from baseline is also a candidate, including removals.
    candidates.push({ ...row, kind: 'residual' });
  }
  return { changes: candidates, reverted, unresolved, coverage: install.coverage.map(c => ({ ...c, after: uninstalled.sections[c.category].status, installed: installed.sections[c.category].status, warnings: [...c.warnings, ...uninstalled.sections[c.category].warnings], complete: [before, installed, uninstalled].every(s => s.sections[c.category].status === 'complete') })), unchanged: 0, laterChanges: final.changes.filter(c => !installKeys.has(c.key)) };
}
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function explanation(change) {
  const what = { apps: 'An installed-application registry record', startup: 'An automatic startup entry', services: 'A Windows service configuration', tasks: 'A scheduled task configuration', files: 'A file in an explicitly tracked folder' }[change.category];
  const action = { added: 'appeared between these captures.', removed: 'was no longer observed in the later capture.', changed: 'has different recorded settings.', residual: 'still differs from the pre-install baseline.', reverted: 'matches the pre-install baseline again.', unconfirmed: 'was observed in only part of an incomplete comparison.' }[change.kind];
  return `${what} ${action} ${change.kind === 'residual' ? 'This is a residual candidate, not proof that an installer owns it.' : 'Timing alone does not establish which program caused this change.'}`;
}
export function reportHtml(result, snapshots, mode) {
  const e = escapeHtml;
  const groups = [['Changes to review', result.changes], ['Returned to baseline', result.reverted ?? []], ['Incomplete evidence', result.unresolved ?? []], ['Other later changes', result.laterChanges ?? []]];
  const rows = groups.map(([title, items]) => `<section><h2>${title} (${items.length})</h2>${items.map(c => `<article><h3>${e(c.name)} <small>${e(c.kind)} · ${e(CATEGORIES[c.category])}</small></h3><p>${e(explanation(c))}</p><p>Identity: <code>${e(c.id)}</code></p><p>Source: <code>${e((c.after ?? c.installed ?? c.before)?.source)}</code></p><table><thead><tr><th>Field</th><th>Before</th><th>After</th></tr></thead><tbody>${c.deltas.map(d => `<tr><th>${e(d.field)}</th><td>${e(d.before ?? '(absent)')}</td><td>${e(d.after ?? '(absent)')}</td></tr>`).join('')}</tbody></table><details><summary>Complete recorded evidence</summary><pre>${e(JSON.stringify({ before: c.before, installed: c.installed, after: c.after }, null, 2))}</pre></details></article>`).join('') || '<p>No records in this group.</p>'}</section>`).join('');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>KingAftermath comparison report</title><style>body{font:16px/1.6 system-ui,sans-serif;max-width:1100px;margin:40px auto;padding:0 24px;color:#172b30}h1{font-size:36px}small{display:block;font-size:14px;font-weight:400}article{border-top:1px solid #ccd5d6;padding:12px 0 28px}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{text-align:left;vertical-align:top;padding:9px;border:1px solid #ccd5d6;overflow-wrap:anywhere}pre,code{white-space:pre-wrap;overflow-wrap:anywhere}aside{background:#eef5f4;padding:18px}@media print{details{display:block}article{break-inside:avoid}}</style><header><p>KINGAFTERMATH / EVIDENCE REPORT</p><h1>${e(mode === 'residual' ? 'After the uninstall' : 'What changed')}</h1><p>Generated ${e(new Date().toISOString())} · ${e(snapshots[0].machine.name)}</p><aside>Observed configuration changes are not proof of installer ownership, maliciousness or safe removal. Missing evidence is never treated as confirmed removal. This report may contain private paths and command arguments.</aside></header><h2>Captures</h2>${snapshots.map(s => `<p><strong>${e(s.label)}</strong> · ${e(s.capturedAt)} · ID ${e(s.id)}</p>`).join('')}<h2>Collection coverage</h2>${result.coverage.map(c => `<p>${e(c.title)}: before ${e(c.before)}${c.installed ? ` / installed ${e(c.installed)}` : ''} / after ${e(c.after)}${c.warnings.length ? ` — ${e(c.warnings.join('; '))}` : ''}</p>`).join('')}${rows}<footer>KingAftermath 0.2.0 · Snapshot formats 1/2 · No cleanup actions performed.</footer></html>`;
}
