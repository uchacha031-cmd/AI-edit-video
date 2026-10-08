const assert = require('node:assert/strict');
require('tsx/cjs');
const { validateMediaBytes, downloadPreviewMedia } = require('../src/utils/mediaDownload.ts');
const mp4 = new Uint8Array(64);
for (const [i, ch] of [...'ftyp'].entries()) mp4[4 + i] = ch.charCodeAt(0);
validateMediaBytes(mp4, 'mp4', 'video/mp4', 64);
console.log('PASS MP4 ftyp and expected size');
assert.throws(() => validateMediaBytes(new TextEncoder().encode('<!doctype html><title>Cookie check</title>'), 'mp4', 'text/html'), /HTML/);
console.log('PASS reject HTML authentication response');
assert.throws(() => validateMediaBytes(new TextEncoder().encode('   <html><body>login</body>'), 'mp4', 'application/octet-stream'), /cookie|MP4/i);
console.log('PASS detect disguised HTML without HTML content type');
assert.throws(() => validateMediaBytes(mp4, 'mp4', 'video/mp4', 7_100_000), /đủ dữ liệu/);
console.log('PASS reject truncated MP4');
const srt = new TextEncoder().encode('1\n00:00:00,000 --> 00:00:01,000\nXin chào\n');
validateMediaBytes(srt, 'srt', 'text/plain');
console.log('PASS valid SRT');
assert.throws(() => validateMediaBytes(new TextEncoder().encode('<!doctype html>'), 'srt', 'text/html'), /HTML/);
console.log('PASS reject HTML masquerading as SRT');
assert.throws(() => validateMediaBytes(new TextEncoder().encode('Hello world'), 'srt', 'text/plain'), /SRT/);
console.log('PASS reject malformed subtitle content');
(async () => {
  const oldFetch = global.fetch;
  global.fetch = async () => new Response('<!doctype html><title>Cookie check</title>',
    { status: 200, headers: { 'content-type': 'text/html' } });
  try {
    await assert.rejects(() => downloadPreviewMedia('/api/media/render/fake.mp4', 'fake.mp4', 'mp4', 7_100_000), /HTML/);
    console.log('PASS downloader blocks 200-OK login page instead of saving .mp4.html');
  } finally { global.fetch = oldFetch; }
  console.log('RESULT 8/8 DOWNLOAD PASS');
})().catch(e => { console.error(e); process.exitCode = 1; });
