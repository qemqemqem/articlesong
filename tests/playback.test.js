// Playback routing: tab player vs background-page fallback, Play Again, controls.
// Usage: node tests/playback.test.js
const { makeEnv, runner } = require('./helpers/background-env');
const { check, done } = runner();

async function finishedSong(env, title = 'A', url) {
  await env.create(title, 'musical', url ? { url } : {});
  await env.settle(300);
  return env.byTitle(title);
}

(async () => {
  // 1. Normal page: plays in the tab
  {
    const env = makeEnv(); await env.settle(20);
    const r = await finishedSong(env);
    check('plays in the tab when a content script exists', r.status === 'PLAYING' && r.playerKind === 'tab', JSON.stringify([r.status, r.playerKind]));
    check('no background audio used', env.audios.length === 0);
  }

  // 2. Tab opened before the add-on updated: script gets injected, then plays in the tab
  {
    const env = makeEnv(); env.tabMode = 'inject'; await env.settle(20);
    const r = await finishedSong(env);
    check('injects the content script into stale tabs', env.injected === 3 && r.playerKind === 'tab' && r.status === 'PLAYING', JSON.stringify([env.injected, r.playerKind, r.status]));
  }

  // 3. PDF viewer / privileged page: no content script possible -> background player
  {
    const env = makeEnv(); env.tabMode = 'none'; env.fakePdfText(); await env.settle(20);
    const r = await finishedSong(env, 'A', 'paper.pdf');
    check('falls back to the background player', r.status === 'PLAYING' && r.playerKind === 'background', JSON.stringify([r.status, r.playerKind, r.playbackNote]));
    check('background Audio got the song url', env.audios.length === 1 && /cdn/.test(env.audios[0].src));
    const st = await env.send({ action: 'validatePlaying', requestId: r.id });
    check('validatePlaying reports background state', st.isPlaying === true && st.duration === 100, JSON.stringify(st));
    const t = await env.send({ action: 'togglePlayPause', requestId: r.id });
    check('pause works in background', t.success && t.isPlaying === false && env.audios[0].paused === true, JSON.stringify(t));
    const t2 = await env.send({ action: 'togglePlayPause', requestId: r.id });
    check('resume works in background', t2.success && t2.isPlaying === true && env.audios[0].paused === false);
    await env.send({ action: 'seekAudio', requestId: r.id, time: 42 });
    check('seek to time', env.audios[0].currentTime === 42);
    await env.send({ action: 'seekAudio', requestId: r.id, delta: -100 });
    check('seek clamps at 0', env.audios[0].currentTime === 0);
    await env.send({ action: 'seekAudio', requestId: r.id, delta: 500 });
    check('seek clamps at duration', env.audios[0].currentTime === 100);
    env.audios[0].finish();
    check('song ending marks it COMPLETE', env.byTitle('A').status === 'COMPLETE');

    // Play Again on a COMPLETE song
    const pa = await env.send({ action: 'playAgain', requestId: r.id });
    check('Play Again succeeds', pa.success === true, JSON.stringify(pa));
    check('Play Again puts the song back in PLAYING', env.byTitle('A').status === 'PLAYING');
    check('Play Again made a fresh Audio', env.audios.length === 2);
    await env.send({ action: 'stopPlaying', requestId: r.id });
    check('stop pauses background audio and completes', env.audios[1].paused && env.byTitle('A').status === 'COMPLETE');
  }

  // 4. Play Again when playback is blocked: clear error instead of silence
  {
    const env = makeEnv(); env.tabMode = 'none'; env.fakePdfText(); await env.settle(20);
    env.backgroundAudioMode = 'blocked';
    const r = await finishedSong(env, 'A', 'paper.pdf');
    check('failed autoplay leaves song COMPLETE with an explanation', r.status === 'COMPLETE' && /Could not start playback/.test(r.playbackNote || ''), JSON.stringify([r.status, r.playbackNote]));
    const pa = await env.send({ action: 'playAgain', requestId: r.id });
    check('Play Again reports the failure', pa.success === false && /autoplay blocked/.test(pa.error), JSON.stringify(pa));
    check('and the song is not stuck PLAYING', env.byTitle('A').status === 'COMPLETE');
    env.backgroundAudioMode = 'ok';
    const pa2 = await env.send({ action: 'playAgain', requestId: r.id });
    check('Play Again works once playback is allowed', pa2.success === true && env.byTitle('A').status === 'PLAYING' && !env.byTitle('A').playbackNote);
  }

  // 5. Page rejects the audio (CSP): fall back to background
  {
    const env = makeEnv(); env.playAudioReply = { success: false, error: 'NotSupportedError (blocked by page CSP)' }; await env.settle(20);
    const r = await finishedSong(env);
    check('CSP-blocked tab falls back to background', r.status === 'PLAYING' && r.playerKind === 'background', JSON.stringify([r.status, r.playerKind, r.playbackNote]));
  }

  // 6. Play Again on one song stops the other; controls go to the right place
  {
    const env = makeEnv(); env.hold = false; await env.settle(20);
    await env.create('A'); await env.settle(300);
    await env.create('B', 'pop'); await env.settle(300);
    check('B waits ready while A plays', env.statuses().A === 'PLAYING' && env.statuses().B === 'COMPLETE', JSON.stringify(env.statuses()));
    const pa = await env.send({ action: 'playAgain', requestId: env.byTitle('B').id });
    check('Play Again on B stops A and plays B', pa.success && env.statuses().A === 'COMPLETE' && env.statuses().B === 'PLAYING', JSON.stringify(env.statuses()));
    await env.send({ action: 'togglePlayPause', requestId: env.byTitle('B').id });
    check('tab controls are used for tab playback', (env.tabControl || []).includes('togglePlayPause'));
  }

  // 7. Controls refuse songs that aren't playing
  {
    const env = makeEnv(); await env.settle(20);
    const r = await finishedSong(env);
    await env.send({ action: 'stopPlaying', requestId: r.id });
    const t = await env.send({ action: 'togglePlayPause', requestId: r.id });
    check('toggle on a stopped song is rejected', t.success === false);
    const v = await env.send({ action: 'validatePlaying', requestId: r.id });
    check('validate on a stopped song says not playing', v.isPlaying === false);
  }
  done();
})();
