// Suno content-moderation rejections: detect, rewrite the offending words away, retry.
// Usage: node tests/rejection.test.js
const { makeEnv, runner } = require('./helpers/background-env');
const { check, done } = runner();
const vm = require('vm');

async function run(env, title = 'A', style = 'musical') {
  await env.settle(20);
  const r = await env.create(title, style);
  await env.settle(900);
  return { r, req: env.byTitle(title) };
}
const has = (text, w) => new RegExp(w.split('').join('[\\s\\-]*'), 'i').test(text);

(async () => {
  // 1. Rejected while polling -> Claude rewrites with an explicit ban -> second try succeeds
  {
    const env = makeEnv(); env.lyricsReply = 'Verse: ninetythree busy bees\nChorus: la la'; env.sunoBanned = ['ninetythree'];
    const { req } = await run(env);
    check('song succeeds after one rewrite', req.status === 'PLAYING', JSON.stringify([req.status, req.error]));
    check('Suno was tried twice', env.generatedLyrics.length === 2, String(env.generatedLyrics.length));
    check('first attempt contained the banned word', has(env.generatedLyrics[0], 'ninetythree'));
    check('second attempt is clean', !has(env.generatedLyrics[1], 'ninetythree'), env.generatedLyrics[1]);
    check('Claude got the explicit instruction naming the word', env.rewritePrompts.length === 1 && /ninetythree/.test(env.rewritePrompts[0]) && /do not use/i.test(env.rewritePrompts[0]), env.rewritePrompts[0]);
    check('rewrite prompt includes Suno\'s reason and the lyrics to fix', /producer tag/.test(env.rewritePrompts[0]) && /busy bees/.test(env.rewritePrompts[0]));
    check('request records the rewrite', req.rewrites === 1 && /ninetythree/.test(req.rewriteNote || ''), JSON.stringify([req.rewrites, req.rewriteNote]));
    check('stored lyrics are the corrected ones', !has(req.lyrics, 'ninetythree'));
  }

  // 2. Claude ignores the instruction -> the word is scrubbed programmatically anyway
  {
    const env = makeEnv(); env.lyricsReply = 'ninetythree bees'; env.rewriteReply = () => 'Still singing about Ninety-Three bees'; env.sunoBanned = ['ninetythree'];
    const { req } = await run(env);
    check('hard scrub guarantees the word is gone even if Claude repeats it', req.status === 'PLAYING' && !has(env.generatedLyrics[1], 'ninetythree'), JSON.stringify([req.status, env.generatedLyrics[1]]));
  }

  // 3. "Use page text as lyrics": there is no Claude rewrite of the user's own text, only a scrub
  {
    const env = makeEnv(); env.sunoBanned = ['ninetythree'];
    env.pageText = 'The ninetythree bees danced in the warm sun and told each other where the flowers were. '.repeat(4);
    const { req } = await run(env, 'S', 'straight');
    check('straight lyrics: retried with the word removed, no Claude rewrite', req.status === 'PLAYING' && env.rewritePrompts.length === 0 && !has(env.generatedLyrics[1], 'ninetythree'), JSON.stringify([req.status, req.error, env.rewritePrompts.length]));
  }

  // 4. Keeps failing with new words: bounded retries, then a clear failure
  {
    const env = makeEnv(); env.lyricsReply = 'ninetythree'; env.sunoBanned = ['ninetythree', 'alphaword', 'betaword', 'gammaword'];
    env.rewriteReply = (p, n) => ['alphaword here', 'betaword here', 'gammaword here'][n - 1];
    const { req } = await run(env);
    check('gives up after bounded attempts', req.status === 'FAILED' && env.generatedLyrics.length === 3, JSON.stringify([req.status, env.generatedLyrics.length]));
    check('failure message says it was rejected and how many tries', /rejected/i.test(req.error) && /3/.test(req.error), req.error);
    check('banned words accumulate across rewrites', /ninetythree/.test(env.rewritePrompts[1]) && /alphaword/.test(env.rewritePrompts[1]), env.rewritePrompts[1]);
  }

  // 5. Rejection reported by the generate call itself (not the poll)
  {
    const env = makeEnv(); env.lyricsReply = 'ninetythree'; env.sunoBanned = ['ninetythree']; env.sunoRejectAt = 'post';
    const { req } = await run(env);
    check('rejection at submit time is handled the same way', req.status === 'PLAYING' && env.generatedLyrics.length === 2, JSON.stringify([req.status, req.error, env.generatedLyrics.length]));
  }

  // 6. Unrelated failures are not retried
  {
    const env = makeEnv(); env.sunoFailStatus = 'GENERATE_AUDIO_FAILED';
    const { req } = await run(env);
    check('non-content failures fail immediately', req.status === 'FAILED' && env.generatedLyrics.length === 1 && env.rewritePrompts.length === 0, JSON.stringify([req.status, env.generatedLyrics.length]));
  }

  // 7. Parsing of Suno's wording
  {
    const env = makeEnv(); await env.settle(20);
    const parse = m => vm.runInContext(`parseSunoRejection(${JSON.stringify(m)})`, env.ctx);
    const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    check('parses "producer tag X"', eq(parse("Your lyrics contain producer tag ninetythree - we don't reference specific artists on Our, please change your lyrics and try again."), ['ninetythree']));
    check('parses quoted words', eq(parse('Your lyrics contain the word "Taylor Swift", which is not allowed'), ['taylor swift']));
    check('no words for a vague message', eq(parse('SENSITIVE_WORD_ERROR'), []));
    check('scrub handles spacing/hyphen variants', vm.runInContext(`scrubWords("Ninety-Three bees and ninety three more, NINETYTHREE!", ["ninetythree"])`, env.ctx).toLowerCase().indexOf('ninety') === -1);
  }
  done();
})();
