import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseSnapshot, compare, residuals, reportHtml } from '../app/core.js';
const args = process.argv.slice(2);
const flag = args.indexOf('--out');
const output = flag >= 0 ? args[flag + 1] : null;
if (flag >= 0) args.splice(flag, 2);
if (![2, 3].includes(args.length) || !output) {
  console.error('Usage: npm run compare -- before.json installed.json [uninstalled.json] --out reports/comparison.html');
  process.exitCode = 1;
} else {
  try {
    const snapshots = [];
    for (const path of args) {
      const { stat } = await import('node:fs/promises');
      if ((await stat(path)).size > 25 * 1024 * 1024) throw new Error('Snapshot exceeds 25 MB.');
      snapshots.push(parseSnapshot(await readFile(path, 'utf8')));
    }
    if (args.some(path => resolve(path).toLowerCase() === resolve(output).toLowerCase())) throw new Error('The report must not overwrite a source snapshot.');
    const result = snapshots.length === 3 ? residuals(...snapshots) : compare(...snapshots);
    await mkdir(dirname(resolve(output)), { recursive: true });
    await writeFile(output, reportHtml(result, snapshots, snapshots.length === 3 ? 'residual' : 'install'), { flag: 'wx' });
    console.log(`Saved ${result.changes.length} records to review: ${resolve(output)}`);
  } catch (err) { console.error(err.message); process.exitCode = 1; }
}
