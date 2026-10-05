// Song recipe tests: prompts.js template plumbing + the JSON export the Android app consumes.
// Usage: node tests/recipe.test.js
const fs = require('fs'), os = require('os'), path = require('path'), { execFileSync } = require('child_process');
const prompts = require('../add-on/prompts.js');
const { loadPrompts, goldenCases } = require('../tools/export-recipe.js');

let failures = 0;
const check = (name, ok, extra = '') => { console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : extra); if (!ok) failures++; };
const throws = fn => { try { fn(); return false; } catch { return true; } };

const article = 'Honeybees dance to tell each other where the flowers are. '.repeat(10);
const meme = prompts.DEFAULT_STYLES.find(s => s.id === 'meme');

check('renderTemplate fills placeholders in one pass',
  prompts.renderTemplate('{{A}}-{{B}}', { A: '{{B}}', B: '$&' }) === '{{B}}-$&');
check('renderTemplate throws on a missing variable', throws(() => prompts.renderTemplate('{{NOPE}}', {})));

check('style tags prompt names the style instead of [object Object]',
  prompts.getStyleTagsPrompt('la', meme).includes('Song style requested: Meme') &&
  !prompts.getStyleTagsPrompt('la', meme).includes('[object Object]'));
check('style tags prompt adds the meme note for a style object',
  prompts.getStyleTagsPrompt('la', meme).includes('Special note: This is intended as a humorous'));
check('style tags prompt has no note for musical',
  !prompts.getStyleTagsPrompt('la', prompts.DEFAULT_STYLES[1]).includes('Special note'));

const suno = prompts.buildSunoLyricsPrompt(article, meme);
check('suno lyrics prompt fits the 200-char API limit', suno.length <= 200, suno.length);
check('suno lyrics prompt keeps the style', suno.startsWith('Style: Meme. A song about: Honeybees'), suno);

check('built-in styles use curated fallback tags',
  prompts.getFallbackStyleTags(meme) === prompts.SONG_RECIPE.fallbackStyleTags.meme);
check('custom styles fall back to their description',
  prompts.getFallbackStyleTags({ id: 'x', name: 'X', description: 'Style: dreamy shoegaze' }) === 'dreamy shoegaze');

check('straight style still returns null lyrics prompt', prompts.getLyricsPrompt(article, 'straight') === null);

// Every placeholder used in a template is one the renderers supply
const KNOWN = new Set(['STYLE_DESCRIPTION', 'ARTICLE_TEXT', 'LYRICS', 'STYLE_NAME', 'STYLE_NOTE', 'ARTICLE_EXCERPT']);
const r = prompts.SONG_RECIPE;
const used = [r.lyricsPromptTemplate, r.styleTagsPromptTemplate, r.sunoLyricsPromptTemplate, r.customFallbackStyleTagsTemplate]
  .flatMap(t => [...t.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]));
check('templates only use known placeholders', used.every(u => KNOWN.has(u)), used.filter(u => !KNOWN.has(u)));

// Export CLI round-trip
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recipe-'));
execFileSync(process.execPath, [path.join(__dirname, '../tools/export-recipe.js'),
  '--recipe', path.join(dir, 'r.json'), '--goldens', path.join(dir, 'g.json')]);
const exported = JSON.parse(fs.readFileSync(path.join(dir, 'r.json'), 'utf8'));
check('exported recipe matches SONG_RECIPE', JSON.stringify(exported) === JSON.stringify(r));
const goldens = JSON.parse(fs.readFileSync(path.join(dir, 'g.json'), 'utf8'));
check('goldens cover every default style', r.defaultStyles.every(s => goldens.cases.some(c => c.style.id === s.id)));
check('goldens are deterministic', JSON.stringify(goldens) === JSON.stringify(goldenCases(loadPrompts())));
fs.rmSync(dir, { recursive: true });

console.log(failures ? `\n${failures} FAILED` : '\nAll recipe tests passed');
process.exit(failures ? 1 : 0);
