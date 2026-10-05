// Live end-to-end check of the Claude path (requires ANTHROPIC_API_KEY; costs a few cents).
// Usage: ANTHROPIC_API_KEY=sk-ant-... node tests/live-claude.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const key = process.env.ANTHROPIC_API_KEY;
if (!key) { console.error('ANTHROPIC_API_KEY not set'); process.exit(1); }

const store = {};
const ctx = {
  console, fetch, setTimeout, AbortController, URL, Blob: globalThis.Blob,
  browser: { storage: { local: {
    get: async k => ({ [k]: store[k] }),
    set: async o => Object.assign(store, o)
  } } },
  Logger: { info() {}, success: m => console.log('  ✓', m), warn: m => console.log('  !', m), error: console.error, debug() {} },
  settings: { claudeModel: '' }
};
vm.createContext(ctx);
const load = f => vm.runInContext(fs.readFileSync(path.join(__dirname, '../add-on', f), 'utf8'), ctx, { filename: f });
['prompts.js', 'claude.js'].forEach(load);
const get = expr => vm.runInContext(expr, ctx);

let failures = 0;
async function step(name, fn) {
  process.stdout.write(`${name}\n`);
  try { await fn(); console.log('  PASS'); }
  catch (e) { failures++; console.log('  FAIL:', e.message); }
}
const assert = (c, m) => { if (!c) throw new Error(m); };

(async () => {
  const C = get('ClaudeClient');
  const style = { id: 'musical', name: 'Musical', description: '' };
  const article = 'Honeybees communicate the location of food through a waggle dance. The angle of the dance relative to vertical encodes direction relative to the sun, and its duration encodes distance.';

  await step('1. auto-resolve model via /v1/models', async () => {
    const id = await C.resolveModel(key);
    console.log('  model:', id);
    assert(/^claude-/.test(id), 'bad model id');
    assert(store.claudeModelCache.id === id, 'not cached');
  });

  await step('2. stale pinned model self-heals (the original 404 bug)', async () => {
    ctx.settings.claudeModel = 'claude-opus-4-1-20250805-retired';
    const text = await C.complete({ apiKey: key, system: 'Reply with one word.', prompt: 'Say hello.', maxTokens: 200 });
    ctx.settings.claudeModel = '';
    assert(text.length > 0, 'empty text');
  });

  await step('3. lyrics call (real prompt, extended thinking)', async () => {
    const lyrics = await C.complete({
      apiKey: key, system: get('LYRICS_SYSTEM_PROMPT'),
      prompt: get('getLyricsPrompt')(article, style),
      maxTokens: 16000, thinkingBudget: 8192
    });
    console.log('  ' + lyrics.slice(0, 80).replace(/\n/g, ' ') + '…');
    assert(lyrics.length > 50, 'lyrics too short');
    store.lyrics = lyrics;
  });

  await step('4. style-tags call (real prompt, extended thinking)', async () => {
    const tags = await C.complete({
      apiKey: key, system: get('STYLE_SYSTEM_PROMPT'),
      prompt: get('getStyleTagsPrompt')(store.lyrics, style),
      maxTokens: 8000, thinkingBudget: 4096
    });
    console.log('  tags:', tags.slice(0, 120));
    assert(tags.length > 3, 'tags empty');
  });

  await step('5. bad API key surfaces 401 (fail fast)', async () => {
    try { await C.complete({ apiKey: 'sk-ant-bad', system: 's', prompt: 'p', maxTokens: 10 }); }
    catch (e) { assert(e.status === 401, `expected 401, got ${e.status}`); return; }
    throw new Error('expected failure');
  });

  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})();
