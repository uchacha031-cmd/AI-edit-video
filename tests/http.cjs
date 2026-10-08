// HTTP integration smoke tests against the actual Express server.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const cwd = path.resolve(__dirname, '..');
const child = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
  cwd, env: { ...process.env, NODE_ENV: 'development', GEMINI_API_KEY: '' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
child.stderr.on('data', b => { logs += b.toString(); });
child.stdout.on('data', b => { logs += b.toString(); });
const base = 'http://127.0.0.1:3000';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function waitReady() {
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error('Server exited unexpectedly: ' + logs.slice(-1500));
    try {
      const response = await fetch(base + '/api/health');
      if (response.ok) return;
    } catch {}
    await sleep(150);
  }
  throw new Error('Server did not become ready: ' + logs.slice(-1500));
}
(async () => {
  await waitReady();
  const health = await fetch(base + '/api/health');
  const data = await health.json();
  assert.equal(health.status, 200);
  assert.equal(data.success, true);
  assert.equal(data.geminiConfigured, false);
  console.log('PASS HTTP health and safe Gemini configuration status');
  const invalidSample = await fetch(base + '/api/sample', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({type:'../../path'})
  });
  assert.equal(invalidSample.status, 400);
  console.log('PASS HTTP rejects invalid sample names');
  const badMedia = await fetch(base + '/api/media/upload/secret.env');
  assert.equal(badMedia.status, 404);
  console.log('PASS HTTP rejects unrecognized media filenames');
  // Encode path separators so URL normalization cannot rewrite the test route.
  const badRender = await fetch(base + '/api/render-progress/%2E%2E%2Fsecret');
  assert.equal(badRender.status, 400);
  const badId = await fetch(base + '/api/render-progress/invalid');
  assert.equal(badId.status, 400);
  console.log('PASS HTTP rejects unrecognized render IDs');
  const missingApi = await fetch(base + '/api/nonexistent');
  assert.equal(missingApi.status, 404);
  assert.match(missingApi.headers.get('content-type') || '',/json/);
  console.log('PASS HTTP API 404 returns JSON, not HTML');
  console.log('RESULT 5/5 API PASS');
})().catch(e => { console.error('FAIL HTTP smoke:', e); console.error(logs.slice(-1200)); process.exitCode = 1; }).finally(() => child.kill('SIGTERM'));
