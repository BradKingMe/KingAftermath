import { parseSnapshot, MAX_BYTES, CATEGORIES, escapeHtml as e } from './core.js';
const plain = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const normalize = v => String(v ?? '').replaceAll('/', '\\').replace(/[\\]+$/, '').toLowerCase();
const quoteRegex = v => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function investigate(snapshot, appId) {
  const application = snapshot.sections.apps.items.find(i => i.id === appId);
  if (!application) return null;
  const folder = normalize(String(application.fields.InstallLocation ?? '').replace(/^"|"$/g, ''));
  const safeFolder = /^[a-z]:\\.+/.test(folder) && folder.split('\\').length > 2;
  const name = application.name.replace(/\s+\d+(?:\.\d+)*.*$/, '').trim().toLowerCase();
  const namePattern = name.length >= 4 ? new RegExp(`(^|[^a-z0-9])${quoteRegex(name)}([^a-z0-9]|$)`, 'i') : null;
  const publisher = application.fields.Publisher?.trim().toLowerCase();
  const related = [];
  for (const category of Object.keys(CATEGORIES).filter(k => k !== 'apps')) {
    for (const item of snapshot.sections[category].items) {
      const reasons = [];
      const texts = [item.source, ...Object.values(item.fields), ...(item.targets ?? []).map(t => t.path)].map(normalize);
      if (safeFolder && texts.some(t => t.includes(folder + '\\') || t === folder || t.includes('"' + folder + '"'))) reasons.push({ strength: 'strong', basis: 'Recorded path is inside the application’s registered install folder.', value: application.fields.InstallLocation });
      if (publisher && publisher.length >= 4 && item.fields.Publisher?.trim().toLowerCase() === publisher) reasons.push({ strength: 'medium', basis: 'Exact recorded publisher match; this publisher can own multiple products.', value: application.fields.Publisher });
      if (namePattern?.test(item.name)) reasons.push({ strength: 'weak', basis: 'Display name contains the application name. Names alone can be misleading.', value: application.name });
      if (reasons.length) related.push({ key: `${category}:${item.id}`, category, item, confidence: reasons.some(r => r.strength === 'strong') ? 'strong' : reasons.some(r => r.strength === 'medium') ? 'medium' : 'weak', reasons });
    }
  }
  return { application, related, snapshotId: snapshot.id, missing: related.flatMap(r => r.item.targets ?? []).filter(t => t.status === 'missing').length };
}
export function emptyReview() { return { title: '', notes: '', contexts: Object.create(null), decisions: Object.create(null) }; }
export function normalizeReview(raw) {
  if (!plain(raw)) throw new Error('Invalid investigation review.');
  const text = (v, limit) => { if (typeof v !== 'string' || v.length > limit || v.includes('\0')) throw new Error('Invalid or oversized review text.'); return v; };
  const review = { title: text(raw.title, 200), notes: text(raw.notes, 20000), contexts: Object.create(null), decisions: Object.create(null) };
  const contexts = raw.contexts ?? {};
  if (!plain(contexts) || Object.keys(contexts).length > 3) throw new Error('Invalid capture contexts.');
  for (const [key, value] of Object.entries(contexts)) {
    review.contexts[text(key, 200)] = text(value, 5000);
  }
  if (!plain(raw.decisions) || Object.keys(raw.decisions).length > 10000) throw new Error('Invalid decisions.');
  for (const [key, value] of Object.entries(raw.decisions)) {
    if (!plain(value) || !['unreviewed','keep','investigate','unrelated'].includes(value.status)) throw new Error('Invalid review decision.');
    review.decisions[text(key, 4500)] = { status: value.status, reason: text(value.reason, 5000) };
  }
  return review;
}
export function packageInvestigation(snapshots, review) {
  const text = JSON.stringify({ format: 'kingaftermath.investigation', version: 1, exportedAt: new Date().toISOString(), snapshots, review: normalizeReview(review) }, null, 2);
  if (new TextEncoder().encode(text).length > MAX_BYTES * 3 + 2000000) throw new Error('Investigation package exceeds the 77 MB restore limit. Export individual captures and a report instead.');
  return text;
}
export function parseInvestigation(text) {
  if (new TextEncoder().encode(text).length > MAX_BYTES * 3 + 2000000) throw new Error('Investigation package exceeds 77 MB.');
  const raw = JSON.parse(text.replace(/^\uFEFF/, ''));
  if (!plain(raw) || raw.format !== 'kingaftermath.investigation' || raw.version !== 1 || !Array.isArray(raw.snapshots) || raw.snapshots.length !== 3) throw new Error('Choose a KingAftermath investigation package.');
  const snapshots = raw.snapshots.map(s => s === null ? null : parseSnapshot(JSON.stringify(s)));
  const review = normalizeReview(raw.review);
  const ids = new Set(snapshots.filter(Boolean).map(s => s.id));
  for (const id of Object.keys(review.contexts)) if (!ids.has(id)) throw new Error('A context refers to a missing capture.');
  const valid = new Set();
  for (const s of snapshots.filter(Boolean)) for (const [category, section] of Object.entries(s.sections)) for (const item of section.items) valid.add(`${s.id}|${category}:${item.id}`);
  for (const key of Object.keys(review.decisions)) if (!valid.has(key)) throw new Error('A decision refers to evidence missing from this package.');
  return { snapshots, review };
}
export function reviewHtml(review, snapshots) {
  return `<section><h2>Investigation notes</h2><h3>${e(review.title || 'Untitled investigation')}</h3><pre>${e(review.notes || 'No notes recorded.')}</pre>${snapshots.filter(Boolean).map(s => `<h3>${e(s.label)} — capture context</h3><pre>${e(review.contexts[s.id] || 'No context recorded.')}</pre>`).join('')}<h3>Operator review decisions</h3>${Object.entries(review.decisions).map(([key, d]) => `<p><code>${e(key)}</code> — <strong>${e(d.status)}</strong></p><pre>${e(d.reason)}</pre>`).join('') || '<p>No decisions recorded.</p>'}<p>Notes and decisions are operator assertions, separate from collected evidence. Packages are unsigned.</p></section>`;
}
export function investigationReport(snapshot, profile, review) {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>KingAftermath application investigation</title><style>body{font:16px/1.6 system-ui;max-width:1000px;margin:40px auto;padding:20px;color:#173236}article,section{border-top:1px solid #ccc;margin-top:20px;padding-top:16px}pre,code{white-space:pre-wrap;overflow-wrap:anywhere}aside{padding:16px;background:#e9f3ef}</style><h1>${e(profile.application.name)} — observed footprint</h1><p>${e(snapshot.machine.name)} · ${e(snapshot.capturedAt)} · Capture ${e(snapshot.id)}</p><aside>Relationships are heuristics, not proof of ownership. A single snapshot cannot establish when an entry appeared. Missing targets reflect capture-time observations, not safe-removal advice.</aside><h2>Application registration</h2><pre>${e(JSON.stringify(profile.application, null, 2))}</pre><h2>Coverage</h2>${Object.entries(snapshot.sections).map(([k, s]) => `<p>${e(CATEGORIES[k])}: ${e(s.status)} ${e(s.warnings.join('; '))}</p>`).join('')}<h2>Potentially related records (${profile.related.length})</h2>${profile.related.map(r => `<article><h3>${e(r.item.name)} — ${e(CATEGORIES[r.category])}</h3><p>${e(r.confidence)} match</p>${r.reasons.map(reason => `<p>${e(reason.basis)} <code>${e(reason.value)}</code></p>`).join('')}<pre>${e(JSON.stringify(r.item, null, 2))}</pre></article>`).join('')}${reviewHtml(review, [snapshot])}<footer>KingAftermath 0.2.0 · No cleanup actions performed.</footer></html>`;
}
