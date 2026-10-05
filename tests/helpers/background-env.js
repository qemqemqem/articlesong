// Loads the real background scripts into a vm with a stubbed browser and a fake network.
// Network behaviour is controllable from tests: env.hold freezes generation; env.releaseAll() resumes it.
const fs = require('fs'), path = require('path'), vm = require('vm');

function makeEnv({ local = {}, sync = {}, settings = {}, failAnthropicFor = () => false } = {}) {
  const store = {
    sync: { suno_api_key: 'k'.repeat(20), anthropic_api_key: 'sk-ant-test', ...sync },
    local: { ...local, settings: { ...(local.settings || {}), ...settings } }
  };
  const listeners = [];
  const env = { generatedLyrics: [], rewritePrompts: [], sunoBanned: [], sunoRejectAt: 'poll', sunoFailStatus: null, rejected: {}, tabState: { paused: false, currentTime: 3, duration: 100 }, tabLatency: 0, failStatus: 0, tabMode: 'ok', playAudioReply: { success: true }, backgroundAudioMode: 'ok', audios: [], injected: 0, hold: false, held: [], generated: [], playAudioCalls: [], fetchLog: [], broadcasts: [], store };
  const area = name => ({
    get: async k => (Array.isArray(k) ? Object.fromEntries(k.map(x => [x, store[name][x]])) : { [k]: store[name][k] }),
    set: async o => Object.assign(store[name], JSON.parse(JSON.stringify(o))),
    remove: async k => { delete store[name][k]; }
  });
  let taskCounter = 0;
  const ctx = {
    console: { log() {}, info() {}, warn() {}, error() {}, debug() {} },
    setTimeout, clearTimeout, setInterval, clearInterval, AbortController, URL, Promise, Blob: globalThis.Blob,
    Audio: class FakeAudio {
      constructor(url) { this.src = url; this.paused = true; this.ended = false; this.currentTime = 0; this.duration = 100; this.listeners = {}; env.audios.push(this); }
      addEventListener(type, fn) { this.listeners[type] = fn; }
      play() {
        if (env.backgroundAudioMode === 'blocked') return Promise.reject(new Error('NotAllowedError: autoplay blocked'));
        this.paused = false; return Promise.resolve();
      }
      pause() { this.paused = true; }
      finish() { this.ended = true; this.listeners.ended && this.listeners.ended(); }
    },
    document: { createElement: () => ({}), head: { appendChild() {} } },
    browser: {
      storage: { sync: area('sync'), local: area('local'), onChanged: { addListener() {} } },
      runtime: {
        getURL: p => p, openOptionsPage() {}, onMessage: { addListener: f => listeners.push(f) },
        sendMessage: msg => { env.broadcasts.push(msg); return env.onBroadcast ? env.onBroadcast(msg) : Promise.resolve(); }
      },
      tabs: {
        sendMessage: async (id, m) => {
          const hasScript = env.tabMode === 'ok' || (env.tabMode === 'inject' && env.injected >= 3);
          if (!hasScript) throw new Error('Could not establish connection. Receiving end does not exist.');
          if (m.action === 'getText') return { text: env.pageText !== undefined ? env.pageText : 'Article body about honeybees. '.repeat(20) };
          if (m.action === 'playAudio') { env.playAudioCalls.push(m.requestId); return env.playAudioReply; }
          if (m.action === 'checkAudioStatus') {
            if (env.failStatus > 0) { env.failStatus--; throw new Error('Could not establish connection. Receiving end does not exist.'); }
            const snapshot = { isPlaying: true, isPaused: env.tabState.paused, currentTime: env.tabState.currentTime, duration: env.tabState.duration };
            env.tabState.currentTime += 0.5; // the song advances every time we look
            if (env.tabLatency) await new Promise(r => setTimeout(r, env.tabLatency)); // reply is delivered late, like a busy tab
            return snapshot;
          }
          if (m.action === 'togglePlayPause') {
            env.tabControl = env.tabControl || []; env.tabControl.push(m.action);
            env.tabState.paused = m.playing === undefined ? !env.tabState.paused : !m.playing;
            return { success: true, isPlaying: !env.tabState.paused };
          }
          if (m.action === 'seekAudio') {
            env.tabControl = env.tabControl || []; env.tabControl.push(m.action);
            env.tabState.currentTime = m.time !== undefined ? m.time : env.tabState.currentTime + m.delta;
            return { success: true, currentTime: env.tabState.currentTime };
          }
          if (m.action === 'stopAudio') { env.tabControl = env.tabControl || []; env.tabControl.push(m.action); return { status: 'Audio stopped' }; }
          return { status: 'ready' };
        },
        executeScript: async () => { if (env.tabMode === 'none') throw new Error('Missing host permission'); env.injected++; },
        query: async () => [{ id: 1 }]
      },
      menus: { create() {}, onClicked: { addListener() {} } },
      browserAction: { setBadgeText() {}, setBadgeBackgroundColor() {} },
      notifications: { create() {} },
      downloads: { download: async () => 1 }
    },
    fetch: (url, opts = {}) => new Promise((resolve, reject) => {
      env.fetchLog.push(url);
      const json = (status, body) => resolve({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
      if (url.includes('/v1/models')) return json(200, { data: [{ id: 'claude-opus-5-5' }] });
      if (url.includes('/generate/credit')) {
        if (opts.headers?.Authorization === 'Bearer bad') return json(401, { code: 401, msg: 'Unauthorized' });
        return json(200, { code: 200, data: env.credits ?? 500 });
      }
      if (url.includes('/v1/messages')) {
        const body = JSON.parse(opts.body);
        const respond = () => {
          if (failAnthropicFor(body)) return json(400, { error: { message: 'boom' } });
          const prompt = String(body.messages[0].content);
          let text;
          if (prompt.includes('rejected by the music generator')) {
            env.rewritePrompts.push(prompt);
            text = env.rewriteReply ? env.rewriteReply(prompt, env.rewritePrompts.length) : 'Clean lyrics about busy bees';
          } else if (String(body.system || '').includes('music style consultant')) {
            text = 'Folk, Warm';
          } else {
            text = env.lyricsReply || 'la la la';
          }
          return json(200, { content: [{ type: 'text', text }] });
        };
        opts.signal?.addEventListener('abort', () => reject(Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' })));
        if (env.hold) env.held.push(respond); else respond();
        return;
      }
      if (url.endsWith('/api/v1/generate')) {
        const body = JSON.parse(opts.body);
        const taskId = `t${++taskCounter}`;
        env.generated.push(body.title);
        env.generatedLyrics.push(body.prompt);
        env.tasks = env.tasks || {};
        env.tasks[taskId] = body.title;
        const hit = env.sunoBanned.find(w => (body.prompt + ' ' + body.style).toLowerCase().includes(w.toLowerCase()));
        const reason = hit && `Your lyrics contain producer tag ${hit} - we don't reference specific artists on Our, please change your lyrics and try again.`;
        if (hit && env.sunoRejectAt === 'post') return json(200, { code: 400, msg: reason });
        if (hit) env.rejected[taskId] = reason;
        return json(200, { code: 200, data: { taskId } });
      }
      if (url.includes('/generate/record-info')) {
        const taskId = new URL(url).searchParams.get('taskId');
        if (env.rejected[taskId]) return json(200, { code: 200, data: { status: 'SENSITIVE_WORD_ERROR', errorCode: 400, errorMessage: env.rejected[taskId] } });
        if (env.sunoFailStatus) return json(200, { code: 200, data: { status: env.sunoFailStatus, errorMessage: 'audio generation failed' } });
        return json(200, { code: 200, data: { status: 'SUCCESS', response: { sunoData: [{
          audio_url: `https://cdn/${taskId}.mp3`, stream_audio_url: `https://cdn/${taskId}-s.mp3`,
          title: `Song ${env.tasks[taskId]}`, prompt: 'lyrics', duration: 100
        }] } } });
      }
      return json(404, { error: 'unexpected ' + url });
    })
  };
  vm.createContext(ctx);
  ['logger.js', 'prompts.js', 'claude.js', 'pdf.js', 'background.js'].forEach(f =>
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../../add-on', f), 'utf8'), ctx, { filename: f }));
  vm.runInContext('SUNO_POLL_MS = 15', ctx);

  env.ctx = ctx;
  env.fakePdfText = () => vm.runInContext("PdfText.fromUrl = async () => 'Pdf article text. '.repeat(40)", ctx);
  env.send = msg => new Promise(resolve => {
    const keep = listeners[0](msg, {}, resolve);
    if (keep !== true) resolve(undefined);
  });
  env.requests = () => vm.runInContext('allRequests', ctx);
  env.byTitle = title => env.requests().find(r => r.articleTitle === title);
  env.statuses = () => Object.fromEntries(env.requests().map(r => [r.articleTitle, r.status]));
  env.queueTitles = () => env.requests().filter(r => r.status === 'QUEUED').sort((a, b) => a.queuePos - b.queuePos).map(r => r.articleTitle);
  env.releaseAll = () => { env.hold = false; env.held.splice(0).forEach(f => f()); };
  env.create = (title, style = 'musical', extra = {}) => env.send({
    action: 'createSong', tabId: 1, tabUrl: `https://x.org/${extra.url || title}`, tabTitle: title,
    songStyle: { id: style, name: style }, ...extra
  });
  env.settle = (ms = 150) => new Promise(r => setTimeout(r, ms));
  return env;
}

// tiny test runner shared by the suites
function runner() {
  let failures = 0;
  return {
    check(name, ok, extra = '') {
      console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : extra);
      if (!ok) failures++;
    },
    done() { console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED'); process.exit(failures ? 1 : 0); }
  };
}

module.exports = { makeEnv, runner };
