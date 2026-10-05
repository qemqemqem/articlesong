#!/usr/bin/env node
// Export the song recipe (prompts + styles) from add-on/prompts.js for the Android app.
//
//   node tools/export-recipe.js --recipe <file.json> [--goldens <file.json>]
//
// --recipe   SONG_RECIPE as JSON (bundled into the APK as an asset)
// --goldens  prompts.js's own renders of GOLDEN_CASES, which the Android unit tests compare
//            against so the Kotlin port of the template-filling logic can't drift.
//
// Run by the Gradle build (android/app/build.gradle.kts); no npm dependencies.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PROMPTS_FILE = path.join(__dirname, '..', 'add-on', 'prompts.js');

function loadPrompts() {
  const ctx = { console, JSON };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(PROMPTS_FILE, 'utf8'), ctx, { filename: 'prompts.js' });
  const get = name => vm.runInContext(name, ctx);
  return {
    recipe: get('SONG_RECIPE'),
    getLyricsPrompt: get('getLyricsPrompt'),
    getStyleTagsPrompt: get('getStyleTagsPrompt'),
    buildSunoLyricsPrompt: get('buildSunoLyricsPrompt'),
    getFallbackStyleTags: get('getFallbackStyleTags')
  };
}

// Inputs chosen to trip up a naive port: regex replacement tokens, literal placeholders,
// non-ASCII whitespace, CRLF, emoji (UTF-16 surrogate pairs) straddling the 200-char cut.
const ARTICLES = {
  plain: 'Honeybees dance to tell each other where the flowers are.',
  long: 'Honeybees   dance\r\n\tto tell each other where the flowers are. '.repeat(8),
  tricky: '  $& $1 {{STYLE_NAME}} {{ARTICLE_TEXT}} non breaking  em-space 🐝🌼 '.repeat(5)
};
const CUSTOM_STYLES = [
  { id: 'sea_shanty', name: 'Sea Shanty', description: 'Style: rowdy sea shanty, call and response, stomping rhythm' },
  { id: 'lullaby', name: 'Lullaby', description: 'A soft lullaby with gentle repetition' }
];
const LYRICS = '[Verse]\nThe hive is humming $& with {{LYRICS}} news\n\n[Chorus]\nDance, dance 🐝';

function goldenCases(p) {
  const styles = [...p.recipe.defaultStyles, ...CUSTOM_STYLES];
  const cases = [];
  for (const style of styles) {
    for (const [articleName, article] of Object.entries(ARTICLES)) {
      cases.push({
        style,
        article: articleName,
        lyricsPrompt: p.getLyricsPrompt(article, style),
        sunoLyricsPrompt: p.buildSunoLyricsPrompt(article, style)
      });
    }
    cases.push({
      style,
      styleTagsPrompt: p.getStyleTagsPrompt(LYRICS, style),
      fallbackStyleTags: p.getFallbackStyleTags(style)
    });
  }
  return { articles: ARTICLES, lyrics: LYRICS, cases };
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

function main(argv) {
  const arg = flag => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : null;
  };
  const recipeOut = arg('--recipe');
  const goldensOut = arg('--goldens');
  if (!recipeOut && !goldensOut) {
    console.error('usage: export-recipe.js --recipe <file> [--goldens <file>]');
    process.exit(2);
  }
  const prompts = loadPrompts();
  if (recipeOut) writeJson(recipeOut, prompts.recipe);
  if (goldensOut) writeJson(goldensOut, goldenCases(prompts));
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { loadPrompts, goldenCases };
