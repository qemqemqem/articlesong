// Queue behaviour of the real background scripts (fake network, stubbed browser).
// Usage: node tests/queue.test.js
const { makeEnv, runner } = require('./helpers/background-env');
const { check, done } = runner();
const canon = v => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort()) : x));
const eq = (a, b) => canon(a) === canon(b);

(async () => {
  // 1. Limit of one: first runs, the rest queue with positions
  {
    const env = makeEnv(); env.hold = true; await env.settle(20);
    const [a, b, c] = [await env.create('A'), await env.create('B', 'pop'), await env.create('C', 'meme')];
    check('first song starts immediately', a.success && a.queued === false, JSON.stringify(a));
    check('second is queued at #1', b.queued === true && b.position === 1, JSON.stringify(b));
    check('third is queued at #2', c.queued === true && c.position === 2, JSON.stringify(c));
    check('statuses: one running, two queued', eq(env.statuses(), { A: 'LYRICS', B: 'QUEUED', C: 'QUEUED' }) , JSON.stringify(env.statuses()));
    check('queued songs made no network calls yet', env.fetchLog.filter(u => u.includes('/messages')).length === 1);

    // 2. FIFO + no talking over the song that is playing
    env.releaseAll(); await env.settle(500);
    check('generation order is FIFO', eq(env.generated, ['A', 'B', 'C']), JSON.stringify(env.generated));
    check('first song is playing', env.statuses().A === 'PLAYING', JSON.stringify(env.statuses()));
    check('later songs wait ready instead of interrupting', env.statuses().B === 'COMPLETE' && env.statuses().C === 'COMPLETE', JSON.stringify(env.statuses()));
    check('only the first song was sent to the player', eq(env.playAudioCalls, [env.byTitle('A').id]), JSON.stringify(env.playAudioCalls));
    check('ready songs still have audio', !!env.byTitle('B').audioUrl);
  }

  // 3. Reorder
  {
    const env = makeEnv(); env.hold = true; await env.settle(20);
    await env.create('A'); await env.create('B', 'pop'); await env.create('C', 'meme'); await env.create('D', 'cute');
    check('initial queue order', eq(env.queueTitles(), ['B', 'C', 'D']), JSON.stringify(env.queueTitles()));
    await env.send({ action: 'reorderQueue', orderedIds: [env.byTitle('D').id, env.byTitle('C').id] });
    check('listed songs move to the front, rest follow', eq(env.queueTitles(), ['D', 'C', 'B']), JSON.stringify(env.queueTitles()));
    const pos = env.requests().filter(r => r.status === 'QUEUED').map(r => r.queuePos).sort();
    check('positions are contiguous from 0', eq(pos, [0, 1, 2]), JSON.stringify(pos));
    await env.send({ action: 'reorderQueue', orderedIds: ['nope', env.byTitle('A').id, env.byTitle('B').id] });
    check('unknown and running ids are ignored', eq(env.queueTitles(), ['B', 'D', 'C']) && env.statuses().A === 'LYRICS', JSON.stringify([env.queueTitles(), env.statuses()]));
    await env.send({ action: 'reorderQueue', orderedIds: [env.byTitle('C').id, env.byTitle('D').id, env.byTitle('B').id] });
    env.releaseAll(); await env.settle(600);
    check('generation follows the rearranged order', eq(env.generated, ['A', 'C', 'D', 'B']), JSON.stringify(env.generated));
  }

  // 4. Cancel queued / running
  {
    const env = makeEnv(); env.hold = true; await env.settle(20);
    await env.create('A'); await env.create('B', 'pop'); await env.create('C', 'meme');
    await env.send({ action: 'cancelRequest', requestId: env.byTitle('B').id });
    check('cancelling a queued song marks it CANCELLED', env.statuses().B === 'CANCELLED');
    check('remaining queue is intact', eq(env.queueTitles(), ['C']));
    check('a queued song cannot be dismissed', (await env.send({ action: 'removeRequest', requestId: env.byTitle('C').id })).success === false);
    await env.send({ action: 'cancelRequest', requestId: env.byTitle('A').id });
    await env.settle(30);
    check('cancelling the running song starts the next one', env.statuses().C !== 'QUEUED' && env.statuses().A === 'CANCELLED', JSON.stringify(env.statuses()));
    env.releaseAll(); await env.settle(300);
    check('cancelled songs never reached Suno', eq(env.generated, ['C']), JSON.stringify(env.generated));
  }

  // 5. Failure frees the slot
  {
    const env = makeEnv({ failAnthropicFor: () => env.failing }); env.hold = true; await env.settle(20);
    env.failing = true;
    await env.create('A'); await env.create('B', 'pop');
    env.failing = true; env.releaseAll(); await env.settle(100); // A: anthropic 500 -> FAILED, B starts and also fails
    env.failing = false;
    check('failed song is FAILED and the queue moved on', env.statuses().A === 'FAILED' && env.statuses().B !== 'QUEUED', JSON.stringify(env.statuses()));
  }

  // 6. Concurrency setting
  {
    const env = makeEnv({ settings: { maxConcurrent: 2 } }); env.hold = true; await env.settle(20);
    await env.create('A'); await env.create('B', 'pop'); await env.create('C', 'meme');
    check('maxConcurrent=2 runs two at once', eq(env.statuses(), { A: 'LYRICS', B: 'LYRICS', C: 'QUEUED' }), JSON.stringify(env.statuses()));
  }

  // 7. Queue cap and duplicates
  {
    const env = makeEnv(); env.hold = true; await env.settle(20);
    await env.create('A');
    let last;
    for (let i = 0; i < 26; i++) last = await env.create(`Q${i}`, 'pop');
    check('queue is capped at 25', last.success === false && /queue is full/i.test(last.error) && env.queueTitles().length === 25, JSON.stringify([last, env.queueTitles().length]));
  }
  {
    const env = makeEnv(); env.hold = true; await env.settle(20);
    await env.create('A'); await env.create('B', 'pop');
    const dup = await env.create('B', 'pop');
    check('duplicate of a queued song is rejected', dup.duplicate === true, JSON.stringify(dup));
    await env.send({ action: 'clearQueue' });
    check('clearQueue cancels queued songs only', eq(env.statuses(), { A: 'LYRICS', B: 'CANCELLED' }), JSON.stringify(env.statuses()));
    const again = await env.create('B', 'pop');
    check('a cancelled song can be queued again', again.success === true, JSON.stringify(again));
  }

  // 8. Browser restart recovery
  {
    const t = Date.now();
    const mk = (id, status, extra = {}) => ({ id, status, articleTitle: id, articleUrl: `https://x.org/${id}`, articleText: 'text '.repeat(30), songStyle: { id: 'musical', name: 'musical' }, tabId: 1, progress: {}, timestamps: { created: t, started: null, completed: null }, dedupeKey: id, ...extra });
    const env = makeEnv({ local: { requests: [mk('stuck', 'LYRICS'), mk('listening', 'PLAYING'), mk('waiting1', 'QUEUED', { queuePos: 1 }), mk('waiting0', 'QUEUED', { queuePos: 0 })] } });
    env.hold = true; await env.settle(60);
    const s = env.statuses();
    check('interrupted song is failed with a retry hint', s.stuck === 'FAILED' && /Retry/.test(env.byTitle('stuck').error), JSON.stringify(s));
    check('playing song becomes complete', s.listening === 'COMPLETE');
    check('queue survives restart and resumes in order', s.waiting0 === 'RECEIVED' || s.waiting0 === 'LYRICS', JSON.stringify(s));
    check('later queued song still waits', s.waiting1 === 'QUEUED');
  }

  done();
})();
