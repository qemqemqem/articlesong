// Play queue: songs that finish generating while another song plays wait in order and auto-advance.
// Usage: node tests/playqueue.test.js
const { makeEnv, runner } = require('./helpers/background-env');
const { check, done } = runner();
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const playQueue = env => env.requests().filter(r => r.status === 'COMPLETE' && r.playQueuePos != null)
  .sort((a, b) => a.playQueuePos - b.playQueuePos).map(r => r.articleTitle);
const playing = env => env.requests().filter(r => r.status === 'PLAYING').map(r => r.articleTitle);
const end = (env, title) => env.send({ action: 'audioEnded', requestId: env.byTitle(title).id });

// A plays; B, C, D finish generating meanwhile
async function threeWaiting(opts) {
  const env = makeEnv(opts); await env.settle(20);
  await env.create('A'); await env.settle(250);
  await env.create('B', 'pop'); await env.create('C', 'meme'); await env.create('D', 'cute');
  await env.settle(900);
  return env;
}

(async () => {
  // 1. Finished songs queue behind the playing one, in finish order
  {
    const env = await threeWaiting();
    check('only the first song plays', eq(playing(env), ['A']), JSON.stringify(playing(env)));
    check('the others wait in the play queue in order', eq(playQueue(env), ['B', 'C', 'D']), JSON.stringify(playQueue(env)));
    check('the player was only started for A', eq(env.playAudioCalls, [env.byTitle('A').id]));

    // 2. Natural end advances automatically
    await end(env, 'A'); await env.settle(60);
    check('when A ends, B starts by itself', eq(playing(env), ['B']) && eq(playQueue(env), ['C', 'D']), JSON.stringify([playing(env), playQueue(env)]));
    check('B was sent to the player', env.playAudioCalls.length === 2 && env.playAudioCalls[1] === env.byTitle('B').id);
    check('B left the queue', env.byTitle('B').playQueuePos == null);
    await end(env, 'B'); await env.settle(60);
    await end(env, 'C'); await env.settle(60);
    check('queue drains in order', eq(playing(env), ['D']) && eq(playQueue(env), []));
    await end(env, 'D'); await env.settle(60);
    check('after the last song nothing plays and nothing breaks', eq(playing(env), []));
  }

  // 3. Reorder, remove, clear
  {
    const env = await threeWaiting();
    await env.send({ action: 'reorderPlayQueue', orderedIds: [env.byTitle('D').id, env.byTitle('B').id] });
    check('reorder moves listed songs to the front', eq(playQueue(env), ['D', 'B', 'C']), JSON.stringify(playQueue(env)));
    await env.send({ action: 'reorderPlayQueue', orderedIds: ['nope', env.byTitle('A').id, env.byTitle('C').id] });
    check('unknown and playing ids are ignored', eq(playQueue(env), ['C', 'D', 'B']) && eq(playing(env), ['A']), JSON.stringify([playQueue(env), playing(env)]));
    const pos = env.requests().filter(r => r.playQueuePos != null).map(r => r.playQueuePos).sort();
    check('positions stay contiguous', eq(pos, [0, 1, 2]));

    await env.send({ action: 'removeFromPlayQueue', requestId: env.byTitle('C').id });
    check('remove takes a song out but keeps it as a ready song', eq(playQueue(env), ['D', 'B']) && env.byTitle('C').status === 'COMPLETE' && !!env.byTitle('C').audioUrl, JSON.stringify(playQueue(env)));
    await end(env, 'A'); await env.settle(60);
    check('advance follows the arranged order', eq(playing(env), ['D']), JSON.stringify(playing(env)));
    await env.send({ action: 'clearPlayQueue' });
    check('clear empties the play queue', eq(playQueue(env), []));
    await end(env, 'D'); await env.settle(60);
    check('nothing auto-starts after clearing', eq(playing(env), []));
  }

  // 4. Skip to next / stop / play now
  {
    const env = await threeWaiting();
    await env.send({ action: 'stopPlaying', requestId: env.byTitle('A').id }); await env.settle(60);
    check('Stop stops without advancing', eq(playing(env), []) && eq(playQueue(env), ['B', 'C', 'D']), JSON.stringify([playing(env), playQueue(env)]));

    await env.send({ action: 'playAgain', requestId: env.byTitle('C').id }); await env.settle(60);
    check('Play now jumps a queued song to the front of playback', eq(playing(env), ['C']) && eq(playQueue(env), ['B', 'D']), JSON.stringify([playing(env), playQueue(env)]));

    const skip = await env.send({ action: 'playNext' }); await env.settle(60);
    check('Next skips the current song and starts the next in queue', skip.success && eq(playing(env), ['B']) && env.byTitle('C').status === 'COMPLETE' && eq(playQueue(env), ['D']), JSON.stringify([playing(env), playQueue(env)]));
    check('a skipped song is not re-queued', env.byTitle('C').playQueuePos == null);
    await env.send({ action: 'playNext' }); await env.settle(60);
    const last = await env.send({ action: 'playNext' }); await env.settle(60);
    check('Next with an empty queue just stops', last.success && eq(playing(env), []));
  }

  // 5. Nothing playing: a finished song plays immediately and is never queued
  {
    const env = makeEnv(); await env.settle(20);
    await env.create('A'); await env.settle(300);
    check('first finished song plays right away', eq(playing(env), ['A']) && eq(playQueue(env), []));
  }

  // 6. A stale 'ended' (song already stopped) must not advance the queue
  {
    const env = await threeWaiting();
    await env.send({ action: 'stopPlaying', requestId: env.byTitle('A').id }); await env.settle(30);
    await end(env, 'A'); await env.settle(60);
    check('late ended event for a stopped song does nothing', eq(playing(env), []) && eq(playQueue(env), ['B', 'C', 'D']));
  }

  // 7. Background player (PDF tab): the queue advances there too
  {
    const env = makeEnv(); env.tabMode = 'none'; env.fakePdfText(); await env.settle(20);
    await env.create('A', 'musical', { url: 'a.pdf' }); await env.settle(300);
    await env.create('B', 'pop', { url: 'a.pdf' }); await env.settle(500);
    check('background player: second song waits', eq(playing(env), ['A']) && eq(playQueue(env), ['B']), JSON.stringify([playing(env), playQueue(env)]));
    env.audios[0].finish(); await env.settle(60);
    check('background player: next song starts when the first ends', eq(playing(env), ['B']) && env.audios.length === 2 && env.byTitle('B').playerKind === 'background', JSON.stringify([playing(env), env.audios.length]));
  }

  // 8. If the next song cannot start, it says why and the rest stay queued
  {
    const env = makeEnv(); env.tabMode = 'none'; env.fakePdfText(); await env.settle(20);
    await env.create('A', 'musical', { url: 'a.pdf' }); await env.settle(300);
    await env.create('B', 'pop', { url: 'a.pdf' }); await env.create('C', 'meme', { url: 'a.pdf' }); await env.settle(700);
    env.backgroundAudioMode = 'blocked';
    env.audios[0].finish(); await env.settle(60);
    check('failed advance leaves a note on the song and keeps the rest queued', env.byTitle('B').status === 'COMPLETE' && /Could not start playback/.test(env.byTitle('B').playbackNote || '') && eq(playQueue(env), ['C']), JSON.stringify([env.byTitle('B').status, env.byTitle('B').playbackNote, playQueue(env)]));
  }

  // 9. Restart: the play queue is cleared (nothing may autoplay without the user)
  {
    const t = Date.now();
    const mk = (id, pos) => ({ id, status: 'COMPLETE', playQueuePos: pos, audioUrl: 'x', articleTitle: id, articleUrl: id, articleText: 'x', songStyle: { id: 'musical', name: 'musical' }, progress: {}, timestamps: { created: t, started: t, completed: t }, dedupeKey: id });
    const env = makeEnv({ local: { requests: [mk('x', 0), mk('y', 1)] } }); await env.settle(60);
    check('play queue is cleared after a restart; songs stay available', eq(playQueue(env), []) && env.byTitle('x').status === 'COMPLETE');
  }
  done();
})();
