import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import http from 'node:http';
import { spawn } from 'node:child_process';
test('local server serves only public assets and refuses uploads and foreign hosts', async () => {
  const probe=net.createServer(); await new Promise(r=>probe.listen(0,'127.0.0.1',r)); const port=probe.address().port; await new Promise(r=>probe.close(r));
  const child=spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:String(port)},stdio:['ignore','pipe','pipe']});
  try {
    await new Promise((resolve,reject)=>{ const timer=setTimeout(()=>reject(new Error('Server startup timed out')),5000); child.once('error',reject); child.stdout.once('data',()=>{clearTimeout(timer);resolve();}); });
    const base=`http://127.0.0.1:${port}`;
    for(const path of ['/','/app.js','/core.js','/investigation.js','/workbench.js','/collector']) assert.equal((await fetch(base+path)).status,200);
    const page=await fetch(base); assert.ok(page.headers.get('content-security-policy').includes("connect-src 'self'"));
    for(const path of ['/package.json','/.git/config','/captures/validation-0.2.json','/%2e%2e/README.md']) assert.equal((await fetch(base+path)).status,404);
    assert.equal((await fetch(base,{method:'POST',body:'private input'})).status,405);
    const status=await new Promise((resolve,reject)=>{http.get(base,{headers:{Host:'attacker.invalid'}},res=>{res.resume();resolve(res.statusCode);}).once('error',reject);});
    assert.equal(status,403);
  } finally { child.kill(); await new Promise(resolve=>{if(child.exitCode!==null)resolve();else child.once('exit',resolve);}); }
});
