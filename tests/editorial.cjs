const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
require('tsx/cjs');
const root = path.resolve(__dirname,'..');
const { buildConservativeEditTimeline, cleanSceneCuts } = require(path.join(root,'server/editing.ts'));
const { parseSilencedetectLog, detectSceneChanges } = require(path.join(root,'server/media.ts'));
const approx = (actual, expected, delta=0.05) => assert.ok(Math.abs(actual-expected)<delta, actual+' vs '+expected);
const pause = (start,end) => ({start,end,duration:end-start});

(async () => {
  const a=buildConservativeEditTimeline(12,[pause(3,4.1),pause(6,6.2),pause(8,10)]);
  assert.equal(a.removed.length,2);
  approx(a.removed[0].start,3.18);
  approx(a.removed[0].end,3.85);
  approx(a.removed[1].start,8.18);
  approx(a.removed[1].end,9.75);
  console.log('PASS pause cuts preserve speech margins and ignore brief breathers');

  const b=buildConservativeEditTimeline(10,[pause(0,2),pause(7,10)]);
  assert.equal(b.removed[0].start,0);
  assert.equal(b.removed.at(-1).end,10);
  approx(b.kept[0].start,1.75);
  approx(b.kept[0].end,7.18);
  console.log('PASS leading and trailing silence trimmed conservatively');

  const c=buildConservativeEditTimeline(6,[pause(1,2),pause(2.03,3.2),pause(3.2,4)]);
  assert.equal(c.removed.length,1);
  console.log('PASS nearby silences merged instead of choppy jump cuts');

  const d=buildConservativeEditTimeline(6,[pause(0,6)]);
  assert.equal(d.removed.length,0);
  assert.equal(d.kept.length,1);
  console.log('PASS all-silent clips retain a safe editable timeline');

  const e=buildConservativeEditTimeline(4,[pause(-8,0.1),pause(1,9),pause(NaN,3)]);
  assert.ok(e.kept.length>0);
  assert.ok(e.removed.every(p=>p.end<=4 && p.start>=0));
  console.log('PASS invalid/out-of-range detector results are clamped');

  const log='[silencedetect @ 0] silence_start: 1.2\n[silencedetect @ 0] silence_end: 2.4 | silence_duration: 1.2\n[silencedetect @ 0] silence_start: 4.3';
  const parsed=parseSilencedetectLog(log,5);
  assert.equal(parsed.length,2);
  approx(parsed[1].end,5);
  console.log('PASS silence parser includes trailing open silence');

  assert.deepEqual(cleanSceneCuts([2,2.1,1,4,NaN,9],10),[1,2,4,9]);
  console.log('PASS visual cut timestamps de-duplicated and bounded');

  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ai-edit-scenes-'));
  try {
    const video=path.join(dir,'cut.mp4');
    execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y',
      '-f','lavfi','-i','color=c=red:s=320x180:d=1.4:r=15',
      '-f','lavfi','-i','color=c=blue:s=320x180:d=1.4:r=15',
      '-filter_complex','[0:v][1:v]concat=n=2:v=1:a=0[v]',
      '-map','[v]','-c:v','libx264','-preset','ultrafast',video]);
    const result=await detectSceneChanges(video,2.8,2.8);
    assert.ok(result.timestamps.some(t=>Math.abs(t-1.4)<0.5),JSON.stringify(result));
    console.log('PASS FFmpeg detects an actual visual scene cut');
  } finally {fs.rmSync(dir,{recursive:true,force:true});}

  console.log('RESULT 8/8 EDITORIAL PASS');
})().catch(err=>{console.error(err);process.exitCode=1;});
