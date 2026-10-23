import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseSnapshot, compare, residuals, reportHtml } from '../app/core.js';
import { demoSnapshots } from '../app/demo.js';
import { investigate, emptyReview, normalizeReview, packageInvestigation, parseInvestigation, reviewHtml, investigationReport } from '../app/investigation.js';
const snapshots = () => demoSnapshots().map(s => parseSnapshot(JSON.stringify(s)));
const clone = value => JSON.parse(JSON.stringify(value));
test('demo preserves nine install changes, four residuals and five reverted records', () => {
  const [a,b,c] = snapshots();
  assert.equal(compare(a,b).changes.length, 9);
  assert.equal(residuals(a,b,c).changes.length, 4);
  assert.equal(residuals(a,b,c).reverted.length, 5);
});
test('parser accepts UTF-8 BOM and old snapshots without tracked files', () => {
  const raw = demoSnapshots()[0]; raw.version=1; delete raw.sections.files; delete raw.tracking;
  const s = parseSnapshot('\uFEFF' + JSON.stringify(raw));
  assert.equal(s.sections.files.status, 'not-collected');
});
test('parser rejects duplicate case-insensitive IDs, wrong shapes and failed sources with evidence', () => {
  const a = demoSnapshots()[0]; a.sections.apps.items.push({...a.sections.apps.items[0], id: a.sections.apps.items[0].id.toUpperCase()});
  assert.throws(() => parseSnapshot(JSON.stringify(a)), /duplicate/);
  const b = demoSnapshots()[0]; b.sections.tasks.status = 'failed';
  assert.throws(() => parseSnapshot(JSON.stringify(b)), /cannot contain/);
  assert.throws(() => parseSnapshot('{'), /valid JSON/);
  const c = demoSnapshots()[0]; c.sections.apps.items[0].fields.Version = 1;
  assert.throws(() => parseSnapshot(JSON.stringify(c)), /Invalid field value/);
});
test('machine, user, collector, timestamps and folder scope cannot be mixed', () => {
  for (const field of ['id','userId','scope']) { const [a,b] = snapshots(); b.machine[field] = 'other'; assert.throws(() => compare(a,b), /same computer/); }
  const [a,b] = snapshots(); b.collector = 'other'; assert.throws(() => compare(a,b));
  const [c,d] = snapshots(); d.capturedAt = c.capturedAt; assert.throws(() => compare(c,d), /chronological/);
  const [f,g] = snapshots(); g.tracking = ['C:\\Other']; assert.throws(() => compare(f,g), /tracked folders/);
});
test('partial coverage yields unconfirmed presence changes and no confirmed residuals in that source', () => {
  const [a,b,c] = snapshots(); b.sections.startup.status = 'partial';
  assert.ok(compare(a,b).changes.filter(r=>r.category==='startup').every(r=>r.kind==='unconfirmed'));
  const r = residuals(a,b,c);
  assert.equal(r.changes.filter(r=>r.category==='startup').length, 0);
  assert.equal(r.unresolved.filter(r=>r.category==='startup').length, 2);
});
test('unchanged records, field ordering and runtime target metadata do not create changes', () => {
  const [a] = snapshots(); const b = clone(a); b.id='new'; b.capturedAt='2026-10-23T20:00:00Z';
  b.sections.services.items[0].targets = [{input:'x',path:'',status:'missing',reason:'capture time'}];
  b.sections.services.items[0].fields = Object.fromEntries(Object.entries(b.sections.services.items[0].fields).reverse());
  assert.equal(compare(a,b).changes.length, 0);
});
test('tracked-file additions, size/hash changes and removal are represented', () => {
  const [a,b,c] = snapshots();
  for (const s of [a,b,c]) { s.sections.files={status:'complete',warnings:[],items:[]}; s.tracking=['c:\\fixture']; }
  const file = {id:'c:\\fixture\\x',name:'x',source:'c:\\fixture',fields:{Size:'4',SHA256:'abc'},targets:[]};
  b.sections.files.items.push(file); c.sections.files.items.push({...file,fields:{Size:'5',SHA256:'def'}});
  assert.equal(compare(a,b).changes.filter(r=>r.category==='files')[0].kind,'added');
  assert.equal(compare(b,c).changes.filter(r=>r.category==='files')[0].kind,'changed');
  assert.equal(residuals(a,b,c).changes.filter(r=>r.category==='files')[0].kind,'residual');
});
test('single-capture investigation explains strong paths and weak names, excluding sibling folders', () => {
  const [,b] = snapshots(); const app = b.sections.apps.items.find(a=>a.name==='AsterDesk');
  b.sections.services.items.push({id:'sibling',name:'Unrelated',source:'CIM',fields:{Executable:'C:\\Program Files\\AsterDeskEvil\\bad.exe'},targets:[]});
  const p = investigate(b,app.id);
  assert.ok(p.related.some(r=>r.confidence==='strong'));
  assert.ok(p.related.some(r=>r.confidence==='weak'));
  assert.ok(!p.related.some(r=>r.item.id==='sibling'));
  assert.ok(p.related.every(r=>r.reasons.length));
  assert.equal(investigate(b,'missing'),null);
});
test('reports escape malicious values, preserve evidence and prohibit scripts', () => {
  const [a,b] = snapshots(); b.sections.apps.items[1].name='<script>alert(1)</script>';
  const html=reportHtml(compare(a,b),[a,b],'install');
  assert.ok(html.includes('&lt;script&gt;')); assert.ok(!html.includes('<script>'));
  assert.ok(html.includes("default-src 'none'")); assert.ok(html.includes('Complete recorded evidence'));
  const review=emptyReview(); review.notes='<img src=x onerror=alert(1)>';
  assert.ok(reviewHtml(review,[b]).includes('&lt;img'));
  const profile=investigate(b,b.sections.apps.items[1].id);
  assert.ok(!investigationReport(b,profile,review).includes('<img src=x'));
});
test('investigation package round-trips contexts and evidence-bound decisions', () => {
  const s=snapshots(), review=emptyReview(); review.title='Example'; review.notes='Rebooted'; review.contexts[s[1].id]='No other installer';
  review.decisions[`${s[1].id}|services:${s[1].sections.services.items[0].id}`]={status:'investigate',reason:'Ask operator'};
  const restored=parseInvestigation(packageInvestigation(s,review));
  assert.equal(restored.review.notes,review.notes); assert.equal(Object.keys(restored.review.decisions).length,1);
  const bad=JSON.parse(packageInvestigation(s,review)); bad.review.decisions.orphan={status:'keep',reason:''};
  assert.throws(()=>parseInvestigation(JSON.stringify(bad)),/missing/);
  assert.throws(()=>normalizeReview({...emptyReview(),contexts:[]}),/contexts/);
});
test('review text limits and invalid statuses are rejected', () => {
  assert.throws(()=>normalizeReview({...emptyReview(),notes:'x'.repeat(20001)}),/oversized/);
  assert.throws(()=>normalizeReview({...emptyReview(),decisions:{a:{status:'delete',reason:''}}}),/decision/);
});
test('CLI writes a real report and refuses overwrite or malformed inputs', async () => {
  const dir=await mkdtemp(join(tmpdir(),'kingaftermath-'));
  try {
    const paths=[]; for (const [i,s] of snapshots().entries()) { const path=join(dir,`${i}.json`); await writeFile(path,JSON.stringify(s)); paths.push(path); }
    const output=join(dir,'report.html'); const run=()=>spawnSync(process.execPath,['scripts/compare.mjs',...paths,'--out',output],{encoding:'utf8'});
    assert.equal(run().status,0); assert.ok((await readFile(output,'utf8')).includes('After the uninstall'));
    assert.notEqual(run().status,0);
    const bad=join(dir,'bad.json'); await writeFile(bad,'{}');
    assert.notEqual(spawnSync(process.execPath,['scripts/compare.mjs',bad,paths[1],'--out',join(dir,'bad.html')]).status,0);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
