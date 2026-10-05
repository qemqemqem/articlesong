// Credit balance and key checks the popup and settings page ask the background for.
// Usage: node tests/credits.test.js
const { makeEnv, runner } = require('./helpers/background-env');
const { check, done } = runner();

(async () => {
  {
    const env = makeEnv(); env.credits = 1234;
    await env.settle(20);
    const r = await env.send({ action: 'getSunoCredits' });
    check('balance for the saved SunoAPI key', r.success === true && r.credits === 1234, JSON.stringify(r));
    check('asked the credit endpoint', env.fetchLog.some(u => u.endsWith('/api/v1/generate/credit')));
  }
  {
    const env = makeEnv();
    await env.settle(20);
    const r = await env.send({ action: 'testSunoKey', key: ' bad ' });
    check('a rejected SunoAPI key fails with the status', r.success === false && /401/.test(r.error), JSON.stringify(r));
    const ok = await env.send({ action: 'testSunoKey', key: 'good-key-123' });
    check('a working SunoAPI key reports its balance', ok.success === true && ok.credits === 500, JSON.stringify(ok));
  }
  {
    const env = makeEnv({ sync: { suno_api_key: '' } });
    await env.settle(20);
    const r = await env.send({ action: 'getSunoCredits' });
    check('no saved key: clear error, no request', r.success === false && /No SunoAPI key/.test(r.error) && !env.fetchLog.some(u => u.includes('/credit')), JSON.stringify(r));
  }
  {
    const env = makeEnv();
    await env.settle(20);
    const r = await env.send({ action: 'testAnthropicKey', key: 'sk-ant-test' });
    check('Anthropic key check names the model lyrics will use', r.success === true && r.model === 'claude-opus-5-5', JSON.stringify(r));
  }
  done();
})();
