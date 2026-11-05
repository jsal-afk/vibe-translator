const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { _electron: electron } = require('playwright-core');
const { electronLaunchOptions } = require('./runtime.cjs');
const fixture = require('./fixture.cjs');
const { installScript } = require('../src/dom.cjs');
const sourcePath = path.resolve(__dirname, '../src/browser.cjs');
const source = fs.readFileSync(sourcePath, 'utf8');
const scopedRequire = require('node:module').createRequire(sourcePath);
const sandbox = { require: name => name === 'electron' ? {} : scopedRequire(name), module: { exports: {} }, setTimeout, clearTimeout, URL, Date, process: { env: {} } };
vm.runInNewContext(source, sandbox, { filename: sourcePath });
const { ChatBrowser } = sandbox.module.exports;
const root = path.resolve(__dirname, '..');
let electronApp, appPage, profile;
after(async () => {
  if (electronApp) await electronApp.close();
  if (profile) fs.rmSync(profile, { recursive: true, force: true });
});
async function ensureApp() {
  if (electronApp) return;
  profile = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-browser-test-'));
  electronApp = await electron.launch({ ...electronLaunchOptions(), args: [root, `--user-data-dir=${profile}`],
    env: { ...process.env, BARO_SMOKE: '1' } });
  const context = electronApp.context();
  appPage = await electronApp.firstWindow();
  await appPage.waitForSelector('#target-language');
  assert.equal(appPage.context(), context);
  assert.equal(await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some(window => window.isVisible())), false);
  const actualPaths = await electronApp.evaluate(({ app }) => ({ userData: app.getPath('userData'), sessionData: app.getPath('sessionData') }));
  assert.equal(path.resolve(actualPaths.userData), profile);
  assert.equal(path.resolve(actualPaths.sessionData), profile);
  await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.removeAllListeners('will-navigate'));
  await appPage.goto('about:blank');
}
async function setup(options = {}, systemLanguage = 'en') {
  await ensureApp();
  await appPage.setContent(fixture(options));
  const page = appPage;
  const bot = new ChatBrowser(() => {}, { systemLanguage }); bot.state.connected = true; bot.state.selectedEffort = 'web-0';
  bot.window = { isDestroyed: () => false, loadURL: async () => { await page.setContent(fixture(options)); bot.loads = (bot.loads || 0) + 1; },
    webContents: { debugger: { sendCommand: async (_command, { text }) => { await page.keyboard.insertText(text); } } } };
  bot.session = { fetch: async () => new Response(JSON.stringify({ user: { id: 'fixture' } }), { headers: { 'content-type': 'application/json' } }) };
  bot.create = () => bot.window;
  bot.call = async (method, argument) => page.evaluate(`${installScript()}; globalThis.__lunaTranslate[${JSON.stringify(method)}](${JSON.stringify(argument ?? null)})`);
  bot.key = key => { bot.pendingKey = page.keyboard.press(key === 'Right' ? 'ArrowRight' : key === 'Left' ? 'ArrowLeft' : key); };
  const realCall = bot.call; bot.call = async (...args) => { if (bot.pendingKey) { await bot.pendingKey; bot.pendingKey = null; } return realCall(...args); };
  bot.prewarm = () => { bot.prewarmCount = (bot.prewarmCount || 0) + 1; };
  return { bot, page, options, close: async () => {} };
}
test('EnglishOS automatic requests are stopped before send for English and ambiguous mixed input', async () => {
  const f = await setup({ labels: true }, 'en-US');
  try {
    for (const [text, expected] of [
      ['Please send the revised document after the meeting.', 'english'],
      ['My name is 山田太郎.', 'uncertain'],
      ['I love 東京ディズニーランド', 'uncertain'],
      ['Submit your résumé today.', 'uncertain'],
    ]) {
      const result = await f.bot.translate({ text, targetLanguage: 'auto', effort: 'web-0' }, () => {});
      assert.equal(result.requiresTarget, expected, text);
      assert.equal(f.bot.busy, false);
    }
    assert.equal(await f.page.evaluate(() => window.sends), 0);
    const nonEnglish = await f.bot.translate({ text: '회의 내용을 확인한 뒤 수정된 문서를 보내주세요.', targetLanguage: 'auto', effort: 'web-0' }, () => {});
    assert.ok(nonEnglish.text.trim());
    assert.deepEqual(await f.page.evaluate(() => window.stageSends), { translation: 1, alignment: 1 });
    assert.equal(await f.page.evaluate(() => window.sends), 2, 'one translation and one alignment request, without a classifier send');
  } finally { await f.close(); }
});
test('textless slider discovers the exact web captions and defaults to the minimum', async () => {
  const f = await setup();
  try {
    const state = await f.bot.ensureReady({ force: true, minimum: true }); assert.equal(state.connected, true, state.message);
    assert.deepEqual(Array.from(state.efforts, e => e.label), ['Instant','Medium','High','Extra High','Pro']);
    assert.equal(state.selectedEffort, 'web-0');
    await f.bot.call('openModel'); assert.equal((await f.bot.call('inspect')).slider.value, 0);
    assert.equal(await f.page.evaluate(() => window.sends), 0);
    assert.equal(await f.page.locator('[role="menuitemradio"][aria-checked="true"]').textContent(), 'GPT-5.6 Sol');
  } finally { await f.close(); }
});
test('locked web options are excluded', async () => {
  const f = await setup({ locked: true, labels: true });
  try { const state = await f.bot.ensureReady({ force: true, minimum: true }); assert.equal(state.connected, true, state.message);
    assert.deepEqual(Array.from(state.efforts, e => e.label), ['Instant','Medium','High','Extra High']);
  } finally { await f.close(); }
});
test('inline reasoning picker verifies native captions within its owned menu', async () => {
  const f = await setup({ inlineReasoning: true, foreignMenu: true });
  try {
    const closed = await f.bot.call('inspect');
    assert.equal(closed.controlReady, true); assert.equal(closed.menuOpen, false);
    assert.equal(closed.slider, null); assert.equal(closed.selectedEffort, null);
    assert.deepEqual(Array.from(closed.efforts), []); assert.notEqual(closed.model, 'GPT-9 Model');
    const state = await f.bot.ensureReady({ force: true, minimum: true }); assert.equal(state.connected, true, state.message);
    assert.notEqual(state.model, 'GPT-9 Model'); assert.equal(state.selectedEffort, 'web-0');
    assert.deepEqual(Array.from(state.efforts, e => e.label), [
      'Thinking effort 6 Instant', 'Thinking effort 6 Medium', 'Thinking effort 6 High',
      'Thinking effort 6 Extra High', 'Thinking effort 6 Pro',
    ]);
    assert.deepEqual(await f.page.evaluate(() => window.closedEffortSelections.slice(0, 5).map(({ value, caption }) => [value, caption])), [
      ['0', 'Thinking effort 6 Instant'], ['1', 'Thinking effort 6 Medium'], ['2', 'Thinking effort 6 High'],
      ['3', 'Thinking effort 6 Extra High'], ['4', 'Thinking effort 6 Pro'],
    ]);
    assert.deepEqual(await f.page.evaluate(() => ({
      nativeEffort: document.querySelector('#inline-reasoning').getAttribute('data-selected-reasoning-effort'),
      modelHeader: document.querySelector('#picker [data-model-picker-view-toggle="true"]').textContent,
      otherModel: document.querySelector('#foreign-menu [role="menuitemradio"][aria-checked="true"]').textContent,
      sends: window.sends,
    })), { nativeEffort: 'none', modelHeader: '6 Instant', otherModel: 'GPT-9 Model', sends: 0 });
  } finally { await f.close(); }
});
test('inline slider without native unlocked evidence stays unavailable', async () => {
  const f = await setup({ inlineReasoning: true, unknownInlineAvailability: true });
  try {
    await f.bot.call('openModel');
    const snapshot = await f.bot.call('inspect');
    assert.equal(snapshot.menuOpen, true);
    assert.equal(snapshot.slider.options.some(option => option.enabled), false);
    assert.deepEqual(Array.from(snapshot.efforts), []);
  } finally { await f.close(); }
});
test('ambiguous labelled menu ownership fails closed instead of using visible model rows', async () => {
  const f = await setup({ inlineReasoning: true, ambiguousOwnership: true });
  try {
    const snapshot = await f.bot.call('inspect');
    assert.equal(snapshot.controlReady, true); assert.equal(snapshot.menuOpen, false);
    assert.equal(snapshot.selectedEffort, null);
    assert.deepEqual(Array.from(snapshot.efforts), []);
  } finally { await f.close(); }
});
test('Lexical paragraph drafts preserve blank lines and reject altered content before sending', async () => {
  const f = await setup({ labels: true });
  try {
    await f.page.evaluate(() => { document.querySelector('#prompt-textarea').innerHTML = '<p>Translate exactly.</p><p><br></p><p>First paragraph.</p><p>Second paragraph.</p>'; });
    const prompt = 'Translate exactly.\n\nFirst paragraph.\nSecond paragraph.';
    assert.equal((await f.bot.call('draftStatus', prompt)).matches, true);
    assert.equal(await f.bot.call('send', prompt.replace('First', 'Changed')), false);
    assert.equal(await f.page.evaluate(() => window.sends), 0);
    assert.equal(await f.bot.call('send', prompt), true);
    assert.equal(await f.page.evaluate(() => window.sends), 1);
  } finally { await f.close(); }
});
test('warm translation publishes full text before alignment and prewarms for the next turn', async () => {
  const f = await setup({ labels: true });
  try {
    const progress = [];
    const result = await f.bot.translate({ text: 'Hello. I will proceed to the next step.\n- Next item', targetLanguage: 'Korean', effort: 'web-0' }, x => progress.push(x));
    assert.ok(result.text.trim());
    assert.equal(await f.page.evaluate(() => window.sends), 2);
    assert.deepEqual(await f.page.evaluate(() => window.stageSends), { translation: 1, alignment: 1 });
    assert.equal(f.bot.loads || 0, 0, 'warm input should not reload before sending');
    assert.equal(f.bot.prewarmCount, 1);
    assert.ok(progress.some(x => x.phase === 'streaming')); assert.ok(!result.text.includes('Secret reasoning'));
  } finally { await f.close(); }
});
test('usage limit never becomes a successful translation or cache entry', async () => {
  const f = await setup({ labels: true, error: true });
  try {
    await assert.rejects(f.bot.translate({ text: 'hi', targetLanguage: 'Korean', effort: 'web-0' }, () => {}), /Usage limit/);
    assert.equal(f.bot.cache.items.size, 0); assert.equal(f.bot.busy, false);
    assert.equal(await f.page.evaluate(() => window.sends), 1);
  } finally { await f.close(); }
});
test('stage-one cancellation stops the turn without caching an incomplete translation', async () => {
  const f = await setup({ labels: true, translationHold: true });
  try {
    const work = f.bot.translate({ id: 'stage-one-cancel', text: 'hi', targetLanguage: 'Korean', effort: 'web-0' }, () => {});
    await f.page.waitForFunction(() => window.stageSends.translation === 1);
    await f.bot.cancel('stage-one-cancel');
    await assert.rejects(work, error => error.messageKey === 'error.cancelled');
    assert.equal(f.bot.cache.items.size, 0);
    assert.deepEqual(await f.page.evaluate(() => window.stageSends), { translation: 1, alignment: 0 });
  } finally { await f.close(); }
});
test('transient idle session failure recovers once, preserves effort, and coalesces focus checks', async () => {
  const f = await setup({ labels: true });
  try {
    let checks = 0;
    f.bot.state.connected = false; f.bot.state.selectedEffort = 'web-2';
    f.bot.session.fetch = async () => {
      checks++;
      if (!f.bot.loads) throw new Error('session refresh requires a page reload');
      return new Response(JSON.stringify({ user: { id: 'fixture' } }), { headers: { 'content-type': 'application/json' } });
    };
    const a = f.bot.ensureReady({ effort: 'web-2' }), b = f.bot.ensureReady({ effort: 'web-2' });
    assert.equal(a, b);
    const state = await a;
    assert.equal(state.connected, true, state.message); assert.equal(state.needsLogin, false);
    assert.equal(state.selectedEffort, 'web-2'); assert.equal(checks, 2); assert.equal(f.bot.loads, 1);
    assert.equal(await f.page.evaluate(() => window.sends), 0);
    await f.bot.translate({ text: 'hello', targetLanguage: 'Korean', effort: 'web-2' }, () => {});
    assert.equal(await f.page.evaluate(() => window.sends), 2);
    assert.equal((await f.bot.call('inspect')).controlLabel, 'High');
  } finally { await f.close(); }
});
test('visible sign-in windows survive automatic recovery and reconnect after manual navigation', async () => {
  const f = await setup({ labels: true, fast: true });
  try {
    let checks = 0, stops = 0, visible = true;
    f.bot.state.connected = false;
    f.bot.window.isVisible = () => visible;
    f.bot.window.webContents.getURL = () => 'https://chatgpt.com/';
    f.bot.window.webContents.stop = () => { stops++; };
    f.bot.session.fetch = async () => {
      if (++checks === 1) throw new Error('temporary session failure');
      return new Response(JSON.stringify({ user: { id: 'fixture' } }), { headers: { 'content-type': 'application/json' } });
    };
    const waitFor = f.bot.waitFor.bind(f.bot);
    f.bot.waitFor = (fn, timeout) => waitFor(fn, timeout === 20000 ? 150 : timeout);
    await f.page.setContent('<main id="pending-sign-in"></main>');
    const pending = await f.bot.ensureReady({ force: true, minimum: true });
    assert.equal(pending.connected, false);
    assert.equal(checks, 2);
    assert.equal(f.bot.loads || 0, 0);
    assert.equal(stops, 0);
    assert.ok(await f.page.locator('#pending-sign-in').count());

    await f.page.setContent(fixture(f.options));
    f.bot.pageChanged();
    const connected = await f.bot.connecting;
    assert.equal(connected.connected, true, connected.message);
    assert.equal(f.bot.loads || 0, 0);
    assert.equal(await f.page.evaluate(() => window.sends), 0);

    visible = false;
    f.bot.authWindows.add({ isDestroyed: () => false, isVisible: () => true });
    assert.equal(await f.bot.loadPage(), false);
    ChatBrowser.prototype.prewarm.call(f.bot);
    assert.equal(f.bot.loads || 0, 0);
  } finally { await f.close(); }
});
test('a provider verification title requests manual interaction and resumes when the title clears', async () => {
  const f = await setup({ labels: true, fast: true });
  try {
    let title = 'Just a moment...', checks = 0;
    const contents = f.bot.window.webContents;
    contents.getURL = () => 'https://chatgpt.com/';
    contents.getTitle = () => title;
    f.bot.state.connected = false;
    f.bot.session.fetch = async () => {
      checks++;
      return new Response(JSON.stringify({ user: { id: 'fixture' } }), { headers: { 'content-type': 'application/json' } });
    };
    const cacheRequest = { text: 'previous translation' };
    f.bot.cache.set(cacheRequest, 'preserved');
    const initial = f.bot.initialize();
    assert.equal(f.bot.state.needsLogin, true);
    assert.equal(f.bot.state.connected, false);
    assert.equal(f.bot.state.loggedOut, false);
    assert.equal(f.bot.state.messageKey, 'error.humanVerificationRequired');
    assert.equal(checks, 0);
    assert.equal(f.bot.loads || 0, 0);

    title = 'ChatGPT';
    f.bot.pageChanged(contents, title);
    await initial;
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.ok(f.bot.connecting);
    const resumed = await f.bot.connecting;
    assert.equal(resumed.connected, true, resumed.message);
    assert.equal(f.bot.cache.get(cacheRequest), 'preserved');
    assert.equal(f.bot.loads || 0, 0);
    assert.equal(await f.page.evaluate(() => window.sends), 0);

    let childURL = 'https://example.invalid/';
    const childContents = { getURL: () => childURL, getTitle: () => 'Just a moment...' };
    const child = { isDestroyed: () => false, isVisible: () => true, webContents: childContents };
    f.bot.authWindows.add(child);
    f.bot.pageChanged(childContents, 'Just a moment...');
    assert.equal(f.bot.state.connected, true);
    childURL = 'https://auth.openai.com/';
    f.bot.pageChanged(childContents, 'Just a moment...');
    assert.equal(f.bot.state.connected, false);
    assert.equal(f.bot.state.needsLogin, true);
    assert.equal(f.bot.state.messageKey, 'error.humanVerificationRequired');
    f.bot.authWindows.delete(child);
    f.bot.lastLoginCheck = 0;
    f.bot.pageChanged();
    assert.equal((await f.bot.connecting).connected, true);
    assert.equal(await f.page.evaluate(() => window.sends), 0);
  } finally { f.bot.quitting = true; await f.close(); }
});
test('a provider verification page found after loading is exposed without a second reload', async () => {
  const f = await setup({ labels: true });
  try {
    let title = 'ChatGPT', checks = 0, loads = 0;
    f.bot.state.connected = false;
    f.bot.window.webContents.getURL = () => 'https://chatgpt.com/';
    f.bot.window.webContents.getTitle = () => title;
    f.bot.session.fetch = async () => {
      checks++;
      return new Response(JSON.stringify({ user: { id: 'fixture' } }), { headers: { 'content-type': 'application/json' } });
    };
    f.bot.window.loadURL = async () => { loads++; title = 'Just a moment...'; };
    await f.page.setContent('<main></main>');
    const blocked = await f.bot.initialize();
    assert.equal(blocked.connected, false);
    assert.equal(blocked.needsLogin, true);
    assert.equal(blocked.loggedOut, false);
    assert.equal(blocked.messageKey, 'error.humanVerificationRequired');
    assert.equal(checks, 1);
    assert.equal(loads, 1);
  } finally { f.bot.quitting = true; await f.close(); }
});
test('verification appearing during session or composer checks preserves data and does not reload', async () => {
  for (const phase of ['session', 'composer']) {
    const f = await setup({ labels: true });
    try {
      let title = 'ChatGPT', loads = 0, finishSession;
      const contents = f.bot.window.webContents;
      contents.getURL = () => 'https://chatgpt.com/';
      contents.getTitle = () => title;
      f.bot.state.connected = false;
      f.bot.window.loadURL = async () => { loads++; };
      const request = { text: 'previous translation' };
      f.bot.cache.set(request, 'preserved');
      if (phase === 'session') {
        f.bot.session.fetch = () => new Promise(resolve => { finishSession = resolve; });
      } else {
        const call = f.bot.call;
        f.bot.call = async (method, argument) => {
          if (method !== 'inspect') return call(method, argument);
          title = 'Just a moment...';
          f.bot.pageChanged(contents, title);
          return { composerReady: false };
        };
      }
      const pending = f.bot.initialize();
      if (phase === 'session') {
        title = 'Just a moment...';
        f.bot.pageChanged(contents, title);
        finishSession(new Response('{}', { status: 401, headers: { 'content-type': 'application/json' } }));
      }
      const blocked = await pending;
      assert.equal(blocked.connected, false, phase);
      assert.equal(blocked.needsLogin, true, phase);
      assert.equal(blocked.messageKey, 'error.humanVerificationRequired', phase);
      assert.equal(f.bot.cache.get(request), 'preserved', phase);
      assert.equal(loads, 0, phase);
      assert.equal(await f.page.evaluate(() => window.sends), 0, phase);
    } finally { f.bot.quitting = true; await f.close(); }
  }
});
test('automatic recovery loads a missing composer at most once per attempt sequence', async () => {
  const f = await setup({ labels: true });
  try {
    f.bot.state.connected = false;
    f.bot.window.loadURL = async () => { f.bot.loads = (f.bot.loads || 0) + 1; await f.page.setContent('<main></main>'); };
    const waitFor = f.bot.waitFor.bind(f.bot);
    f.bot.waitFor = (fn, timeout) => waitFor(fn, timeout === 20000 ? 150 : timeout);
    await f.page.setContent('<main></main>');
    const state = await f.bot.ensureReady({ force: true, minimum: true });
    assert.equal(state.connected, false);
    assert.equal(f.bot.loads, 1);
  } finally { await f.close(); }
});
test('initial page loads are shared and a timeout never stops an interactive window', async () => {
  const originalSetTimeout = sandbox.setTimeout;
  try {
    for (const interactive of ['main', 'auth-child']) {
      let visible = false, loads = 0, stops = 0, deadline, finishNavigation;
      sandbox.setTimeout = (fn, ms) => {
        if (ms === 15000) { deadline = fn; return 0; }
        return originalSetTimeout(fn, ms);
      };
      const bot = new ChatBrowser(() => {});
      bot.state.connected = true;
      bot.window = {
        isDestroyed: () => false, isVisible: () => visible,
        show: () => { visible = true; }, focus: () => {},
        loadURL: () => { loads++; return new Promise(resolve => { finishNavigation = resolve; }); },
        webContents: { getURL: () => '', stop: () => { stops++; } },
      };
      bot.create = () => bot.window;
      bot.show(); bot.show();
      assert.equal(loads, 1);
      const pending = bot.loadingPage;
      if (interactive === 'auth-child') {
        visible = false;
        bot.authWindows.add({ isDestroyed: () => false, isVisible: () => true });
      }
      deadline();
      await assert.rejects(pending, error => error.messageKey === 'error.connectionTimedOut');
      assert.equal(stops, 0, interactive);
      finishNavigation();
      await Promise.resolve();
    }
  } finally { sandbox.setTimeout = originalSetTimeout; }
});
test('an interactive navigation that outlives its timeout reconnects on settlement without another reload', async () => {
  const f = await setup({ labels: true, fast: true });
  const originalSetTimeout = sandbox.setTimeout;
  try {
    let deadline, finishNavigation, loads = 0, stops = 0, loaded = false;
    sandbox.setTimeout = (fn, ms) => {
      if (ms === 15000) { deadline = fn; return 0; }
      return originalSetTimeout(fn, ms);
    };
    f.bot.state.connected = false;
    f.bot.window.isVisible = () => true;
    f.bot.window.webContents.getURL = () => loaded ? 'https://chatgpt.com/' : '';
    f.bot.window.webContents.stop = () => { stops++; };
    f.bot.window.loadURL = () => { loads++; return new Promise(resolve => { finishNavigation = resolve; }); };
    const initial = f.bot.loadPage();
    deadline();
    await assert.rejects(initial, error => error.messageKey === 'error.connectionTimedOut');

    // A page event can precede settlement of Electron's original loadURL promise.
    f.bot.pageChanged();
    const first = await f.bot.connecting;
    assert.equal(first.connected, false);
    assert.equal(loads, 1);
    loaded = true;
    finishNavigation();
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.ok(f.bot.connecting);
    const resumed = await f.bot.connecting;
    assert.equal(resumed.connected, true, resumed.message);
    assert.equal(loads, 1);
    assert.equal(stops, 0);
    assert.equal(await f.page.evaluate(() => window.sends), 0);
  } finally { f.bot.quitting = true; sandbox.setTimeout = originalSetTimeout; await f.close(); }
});
test('submission during focus recovery waits for both serialized web stages', async () => {
  const f = await setup({ labels: true });
  try {
    const recovery = f.bot.ensureReady({ force: true, effort: 'web-1' });
    await f.bot.translate({ text: 'hello', targetLanguage: 'Korean', effort: 'web-1' }, () => {});
    assert.equal(await f.page.evaluate(() => window.sends), 2);
  } finally { await f.close(); }
});
test('expired authentication asks for login, and logout prevents automatic reconnect', async () => {
  const f = await setup({ labels: true });
  try {
    let checks = 0;
    f.bot.session.fetch = async () => { checks++; return new Response('{}', { status: 401, headers: { 'content-type': 'application/json' } }); };
    const state = await f.bot.ensureReady({ force: true });
    assert.equal(state.connected, false); assert.equal(state.needsLogin, true); assert.equal(checks, 1);
    await f.bot.ensureReady({ force: true }); assert.equal(checks, 1);
    await assert.rejects(f.bot.translate({ text: 'hello', targetLanguage: 'Korean', effort: 'web-0' }, () => {}), error => error.code === 'RECOVERY' && Boolean(error.message));
    assert.equal(await f.page.evaluate(() => window.sends), 0);
    f.bot.state = { ...f.bot.state, loggedOut: true, needsLogin: false };
    await f.bot.ensureReady({ force: true }); assert.equal(checks, 1);
  } finally { await f.close(); }
});
test('a response failure after sending is never automatically resubmitted', async () => {
  const f = await setup({ labels: true });
  try {
    const call = f.bot.call;
    f.bot.call = async (method, argument) => {
      if (method === 'response' && await f.page.evaluate(() => window.sends > 0)) throw new Error('connection dropped after send');
      return call(method, argument);
    };
    await assert.rejects(f.bot.translate({ text: 'hello', targetLanguage: 'Korean', effort: 'web-0' }, () => {}), /dropped/);
    assert.equal(await f.page.evaluate(() => window.sends), 1); assert.equal(f.bot.cache.items.size, 0);
  } finally { await f.close(); }
});
test('cancellation while preparing the composer prevents the pending prompt send', async () => {
  const f = await setup({ labels: true });
  try {
    const original = f.bot.window.webContents.debugger.sendCommand;
    let started, release;
    const insertStarted = new Promise(resolve => { started = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    f.bot.window.webContents.debugger.sendCommand = async (command, args) => {
      if (command === 'Input.insertText') { started(); await gate; }
      return original(command, args);
    };
    const work = f.bot.translate({ id: 'cancel-before-send', text: 'Hello.', targetLanguage: 'Korean', effort: 'web-0' }, () => {});
    await insertStarted;
    await f.bot.cancel('cancel-before-send');
    release();
    await assert.rejects(work, error => error.messageKey === 'error.cancelled');
    assert.equal(await f.page.evaluate(() => window.sends), 0);
    assert.equal(f.bot.cache.items.size, 0);
  } finally { await f.close(); }
});
test('cancellation during the asynchronous send attempt stops the in-flight web turn', async () => {
  const f = await setup({ labels: true });
  try {
    const original = f.bot.call;
    let started, release, stopCalls = 0;
    const sendStarted = new Promise(resolve => { started = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    f.bot.call = async (method, argument) => {
      if (method === 'send') { started(); await gate; }
      if (method === 'stop') stopCalls++;
      return original(method, argument);
    };
    const work = f.bot.translate({ id: 'cancel-send-race', text: 'Hello.', targetLanguage: 'Korean', effort: 'web-0' }, () => {});
    await sendStarted;
    const cancelling = f.bot.cancel('cancel-send-race');
    release();
    await cancelling;
    await assert.rejects(work, error => error.messageKey === 'error.cancelled');
    assert.equal(await f.page.evaluate(() => window.sends), 1);
    assert.equal(await f.page.evaluate(() => window.stageSends.alignment), 0);
    assert.ok(stopCalls >= 2);
  } finally { await f.close(); }
});
test('translation finishes before alignment, then emits validated ranges in exactly two sends', async () => {
  const f = await setup({ labels: true, fast: true });
  try {
    const progress = [], request = { id: 'two-stage', text: 'Hello world.', targetLanguage: 'Korean', effort: 'web-0' };
    let translated;
    const work = f.bot.translate(request, event => {
      progress.push(event);
      if (event.phase === 'translated') translated = { event, busy: f.bot.busy, ready: f.bot.translationReady };
    });
    await f.page.waitForFunction(() => window.stageSends.alignment === 1);
    assert.ok(translated?.event.text.trim());
    assert.equal(translated.busy, true); assert.equal(translated.ready, true);
    assert.ok(progress.findIndex(event => event.phase === 'translated') < progress.findIndex(event => event.phase === 'aligning'));
    const result = await work;
    assert.equal(result.text, translated.event.text);
    assert.equal(result.sourceLanguage, 'English');
    assert.ok(result.groups.length); assert.ok(result.links.length);
    assert.deepEqual(await f.page.evaluate(() => window.stageSends), { translation: 1, alignment: 1 });
    assert.equal(await f.page.evaluate(() => window.sends), 2);
    assert.equal(progress.at(-1).phase, 'alignment');
    assert.ok(progress.filter(event => event.phase === 'aligning' || event.phase === 'alignment').every(event => !Object.hasOwn(event, 'text')));
    assert.equal(f.bot.prewarmCount, 1);
  } finally { await f.close(); }
});

test('translation-only output retains multiple code and JSON blocks without parsing them as alignment', async () => {
  const translationText = 'Example A:\n```json\n{"key":"value"}\n```\nExample B:\n```js\nconst value = 1;\n```';
  const f = await setup({ labels: true, fast: true, translationText });
  try {
    const result = await f.bot.translate({ text: 'Show two examples.', targetLanguage: 'Korean', effort: 'web-0' }, () => {});
    assert.ok(result.text.includes('{"key":"value"}'));
    assert.ok(result.text.includes('const value = 1;'));
    assert.equal(await f.page.evaluate(() => window.sends), 2);
  } finally { await f.close(); }
});

test('complete cached mappings make zero sends', async () => {
  const f = await setup({ labels: true, fast: true });
  try {
    const request = { text: 'Hello world.', targetLanguage: 'Korean', effort: 'web-0' };
    const first = await f.bot.translate(request, () => {});
    assert.ok(first.groups.length);
    await f.bot.loadPage();
    const cached = await f.bot.translate(request, () => {});
    assert.equal(cached.cached, true); assert.equal(cached.text, first.text);
    assert.deepEqual(await f.page.evaluate(() => window.stageSends), { translation: 0, alignment: 0 });
    assert.equal(await f.page.evaluate(() => window.sends), 0);
  } finally { await f.close(); }
});

test('alignment-only failure preserves cached translation and a later explicit request sends only alignment', async () => {
  const f = await setup({ labels: true, fast: true, alignmentError: true });
  try {
    const request = { text: 'Hello world.', targetLanguage: 'Korean', effort: 'web-0' };
    const events = [];
    const failed = await f.bot.translate(request, event => events.push(event));
    assert.ok(failed.text.trim());
    assert.equal(failed.alignmentErrorKey, 'status.alignmentFailed');
    assert.equal(events.at(-1).phase, 'alignment-error');
    assert.deepEqual(await f.page.evaluate(() => window.stageSends), { translation: 1, alignment: 1 });
    f.options.alignmentError = false;
    await f.bot.loadPage();
    const retriedAlignment = await f.bot.translate(request, () => {});
    assert.equal(retriedAlignment.text, failed.text);
    assert.equal(retriedAlignment.cached, true);
    assert.deepEqual(await f.page.evaluate(() => window.stageSends), { translation: 0, alignment: 1 });
  } finally { await f.close(); }
});

test('cancelling alignment retains the completed text and stops without a third send', async () => {
  const f = await setup({ labels: true, fast: true, alignmentHold: true });
  try {
    const progress = [], request = { id: 'alignment-cancel', text: 'Hello world.', targetLanguage: 'Korean', effort: 'web-0' };
    const work = f.bot.translate(request, event => progress.push(event));
    await f.page.waitForFunction(() => window.stageSends.alignment === 1);
    await f.bot.cancel(request.id);
    const result = await work;
    assert.ok(result.text.trim());
    assert.equal(result.alignmentErrorKey, 'status.alignmentCancelled');
    assert.ok(progress.some(event => event.phase === 'translated'));
    assert.deepEqual(await f.page.evaluate(() => window.stageSends), { translation: 1, alignment: 1 });
    assert.equal(await f.page.evaluate(() => window.sends), 2);
  } finally { await f.close(); }
});

test('queued translation cancellation drains the old turn and preserves text for the next mapping-only run', async () => {
  const f = await setup({ labels: true, fast: true, alignmentHold: true });
  try {
    const request = { text: 'Hello world.', targetLanguage: 'Korean', effort: 'web-0' };
    const first = f.bot.translate({ ...request, id: 'first' }, () => {});
    await f.page.waitForFunction(() => window.stageSends.alignment === 1);
    const queued = f.bot.translate({ ...request, id: 'queued' }, () => {});
    await f.bot.cancel('queued');
    const firstResult = await first;
    assert.equal(firstResult.alignmentErrorKey, 'status.alignmentCancelled');
    await assert.rejects(queued, error => error.messageKey === 'error.cancelled');
    assert.deepEqual(await f.page.evaluate(() => window.stageSends), { translation: 1, alignment: 1 });
    f.options.alignmentHold = false;
    await f.bot.loadPage();
    const next = await f.bot.translate({ ...request, id: 'next' }, () => {});
    assert.equal(next.text, firstResult.text);
    assert.deepEqual(await f.page.evaluate(() => window.stageSends), { translation: 0, alignment: 1 });
  } finally { await f.close(); }
});

test('startup connects and explicit ChatGPT open resumes login after logout without a translation probe', async () => {
  const f = await setup({ labels: true });
  try {
    f.bot.state.connected = false;
    const initial = await f.bot.initialize();
    assert.equal(initial.connected, true, initial.message);
    assert.equal(await f.page.evaluate(() => window.sends), 0);

    f.bot.window.show = () => {};
    f.bot.window.focus = () => {};
    f.bot.window.webContents.getURL = () => 'https://chatgpt.com/';
    f.bot.session.clearStorageData = async () => {};
    f.bot.session.clearCache = async () => {};
    await f.bot.logout();
    assert.equal(f.bot.state.loggedOut, true);
    f.bot.checkLoginCompletion();
    assert.equal(f.bot.connecting, null, 'logout remains idle until the user explicitly opens ChatGPT');
    assert.equal(await f.page.evaluate(() => window.sends), 0);

    let authChecks = 0;
    f.bot.session.fetch = async () => { authChecks++; return new Response('{"user":null}', { headers: { 'content-type': 'application/json' } }); };
    f.bot.show();
    await f.bot.connecting;
    assert.equal(authChecks, 1, 'explicit open immediately resumes the pending login check');
    assert.equal(f.bot.state.loggedOut, false);
    assert.equal(f.bot.state.needsLogin, true);
    assert.equal(await f.page.evaluate(() => window.sends), 0);

    f.bot.session.fetch = async () => { authChecks++; return new Response(JSON.stringify({ user: { id: 'fixture' } }), { headers: { 'content-type': 'application/json' } }); };
    f.bot.lastLoginCheck = 0;
    f.bot.checkLoginCompletion();
    await f.bot.connecting;
    assert.equal(f.bot.state.connected, true);
    assert.equal(authChecks, 2);
    assert.equal(await f.page.evaluate(() => window.sends), 0);
  } finally { await f.close(); }
});
