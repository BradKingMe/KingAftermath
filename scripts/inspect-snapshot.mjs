import { readFile } from 'node:fs/promises';
import { parseSnapshot } from '../app/core.js';
try {
  const s=parseSnapshot(await readFile(process.argv[2],'utf8'));
  console.log(JSON.stringify({validated:true,counts:Object.fromEntries(Object.entries(s.sections).map(([k,v])=>[k,{count:v.items.length,status:v.status}]))}));
} catch (error) { console.error(error.message); process.exitCode=1; }
