/** Reproducible smoke tests: npm install && npm test (requires ffmpeg and ffprobe). */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
// Register tsx to load the project's TypeScript modules directly.
require('tsx/cjs');

const root = path.resolve(__dirname, '..');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-cut-smoke-'));
const previous = process.cwd();

async function main() {
  process.chdir(work);
  const { SERVER_CONFIG, ensureStorageDirectories } = require(path.join(root,'server/config.ts'));
  const { extractMediaMetadata } = require(path.join(root,'server/media.ts'));
  const { validateAndSanitizeEditPlan } = require(path.join(root,'server/validator.ts'));
  const { renderEditPlan, cancelRender, generateSrtContent } = require(path.join(root,'server/renderer.ts'));
  await ensureStorageDirectories();
  const testSrt = generateSrtContent([
    {id:'s1',start:0.5,end:2.5,text:'Caption across a cut'}
  ], [{sourceStart:0,sourceEnd:1}, {sourceStart:2,sourceEnd:3}]);
  assert.match(testSrt,/00:00:00,500 --> 00:00:01,000/);
  assert.match(testSrt,/00:00:01,000 --> 00:00:01,500/);
  assert.equal((testSrt.match(/Caption across a cut/g)||[]).length,2);
  console.log('PASS subtitle cues split across a removed section');

  const srcFile=path.join(SERVER_CONFIG.SAMPLES_DIR, 'sample_no_audio.mp4');
  execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','testsrc2=s=320x180:r=24','-t','3','-c:v','libx264','-pix_fmt','yuv420p',srcFile]);
  const meta=await extractMediaMetadata(srcFile);
  assert.equal(meta.hasAudio,false);
  const rawPlan={
    project:{title:'Smoke test', targetDuration:2.5, preset:'Clean Minimal'},
    segments:[
      {id:'outro',sourceStart:2,sourceEnd:2.8,keep:true,role:'outro',reason:'reverse'},
      {id:'intro',sourceStart:0,sourceEnd:1.0,keep:true,role:'core',reason:'reverse'}
    ],
    subtitles:[{id:'s',start:0,end:1,text:'Test caption'}],
    crop:{aspectRatio:'16:9',focalPoint:{x:.5,y:.5}},
    audio:{normalize:false,removeSilence:false},
    export:{aspectRatio:'16:9',resolution:'720p'},
    effects:{colorFilter:'none'},
  };
  const validated=validateAndSanitizeEditPlan(rawPlan,meta);
  assert.equal(validated.valid,true,JSON.stringify(validated.errors));
  assert.equal(validated.sanitizedPlan.segments[0].id,'outro');
  assert.equal(validated.sanitizedPlan.segments[1].id,'intro');
  console.log('PASS editor segment order preserved in validated plan');
  const invalidPlan=structuredClone(rawPlan);
  invalidPlan.segments[0].sourceEnd='NaN';
  const sanitized=validateAndSanitizeEditPlan(invalidPlan,meta);
  assert.equal(sanitized.sanitizedPlan.segments.some(s=>s.id==='outro'),false);
  console.log('PASS invalid timestamp rejected');

  const runId='render_smoke_test_1234567';
  const out=await renderEditPlan(srcFile,validated.sanitizedPlan,runId,{burnSubtitles:false});
  assert.equal(out.success,true);
  assert.ok(fs.existsSync(path.join(SERVER_CONFIG.RENDER_DIR,out.filename)));
  assert.ok(Math.abs(out.duration - 1.8)<0.3, 'Unexpected output duration ' + out.duration);
  console.log('PASS FFmpeg MP4 render ('+out.duration.toFixed(2)+'s, '+out.sizeBytes+' bytes, no audio)');

  const withSub=await renderEditPlan(srcFile,validated.sanitizedPlan,'render_subtitle_test_12345',{burnSubtitles:true});
  assert.equal(withSub.success,true);
  assert.ok(fs.statSync(path.join(SERVER_CONFIG.RENDER_DIR,withSub.filename)).size>50000);
  console.log('PASS FFmpeg burned subtitles into MP4');

  const audioFile=path.join(SERVER_CONFIG.SAMPLES_DIR, 'sample_talking_head.mp4');
  execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','testsrc2=s=320x180:r=24',
    '-f','lavfi','-i','sine=frequency=440:sample_rate=44100','-t','3','-c:v','libx264','-c:a','aac','-pix_fmt','yuv420p',audioFile]);
  const withAudio=await renderEditPlan(audioFile, validated.sanitizedPlan, 'render_audio_test_12345',{burnSubtitles:false});
  assert.equal(withAudio.success,true);
  assert.equal((await extractMediaMetadata(path.join(SERVER_CONFIG.RENDER_DIR,withAudio.filename))).hasAudio,true);
  console.log('PASS FFmpeg preserves audio stream');

  cancelRender('render_cancel_preflight_123');
  await assert.rejects(()=>renderEditPlan(srcFile,validated.sanitizedPlan,'render_cancel_preflight_123',{burnSubtitles:false}),/cancelled/);
  console.log('PASS render cancellation before FFmpeg begins');
  const inflightId='render_cancel_inflight_123';
  const inflightRender=renderEditPlan(srcFile,validated.sanitizedPlan,inflightId,{burnSubtitles:false});
  setTimeout(()=>cancelRender(inflightId), 35);
  await assert.rejects(()=>inflightRender,/cancelled/);
  console.log('PASS render cancellation while FFmpeg is running');
  console.log('RESULT 8/8 PASS');
}
main().catch(e=>{console.error('FAIL',e); process.exitCode=1;}).finally(()=>{process.chdir(previous); fs.rmSync(work,{recursive:true,force:true});});