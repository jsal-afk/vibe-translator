const { _electron: electron } = require('playwright-core');
const { electronLaunchOptions } = require('./runtime.cjs');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const root = path.resolve(__dirname, '..');
(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'baro-smoke-'));
  const screenshotPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-ui-smoke-')), 'ui-smoke.png');
  let desktop;
  try {
    desktop = await electron.launch({ ...electronLaunchOptions(), args: [root, `--user-data-dir=${profile}`], env: { ...process.env, BARO_SMOKE: '1' } });
    const page = await desktop.firstWindow(); await page.waitForSelector('#input');
    const isolatedPaths = await desktop.evaluate(({ app }) => ({ userData: app.getPath('userData'), sessionData: app.getPath('sessionData') }));
    assert.equal(path.resolve(isolatedPaths.userData), profile);
    assert.equal(path.resolve(isolatedPaths.sessionData), profile);
    await page.waitForFunction(() => document.documentElement.dataset.platform);
    const platform = await page.locator('html').getAttribute('data-platform');
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('connection-state', {
      connected: false, recovering: true, needsLogin: false, messageKey: 'connection.connecting', messageArgs: {}, efforts: [],
    }));
    await page.waitForFunction(() => $('connection-label').textContent === t('connection.connecting') && $('status').textContent === t('connection.connecting'));
    await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('connection-state', {
      connected: false, recovering: false, needsLogin: false, messageKey: 'error.reconnect', messageArgs: {}, efforts: [],
    }));
    await page.waitForFunction(() => $('connection-label').textContent === t('connection.disconnected') && $('status').textContent === t('error.reconnect'));
    await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('connection-state', {
      connected: true, model: 'GPT-5.6 Sol', messageKey: 'connection.connected', messageArgs: {}, selectedEffort: 'web-0',
      efforts: ['Instant','Medium','High','Extra High','Pro'].map((label, i) => ({ key: `web-${i}`, label })),
    }));
    await page.waitForFunction(() => $('connection-label').textContent === t('connection.connected') && $('status').textContent === t('status.ready'));
    assert.equal(await page.locator('#effort').inputValue(), 'web-0');
    assert.deepEqual(await page.locator('#effort option').evaluateAll(options => options.map(option => option.value)), ['web-0','web-1','web-2','web-3','web-4']);
    await page.locator('#target-language').fill('English');
    await page.locator('#input').fill('첫 문장.');
    await page.locator('#input').press('Shift+Enter');
    await page.keyboard.insertText('두 번째 문장.');
    assert.equal(await page.locator('#input').inputValue(), '첫 문장.\n두 번째 문장.');
    await page.waitForFunction(() => !document.getElementById('translate').disabled);
    const compositionPrevented = await page.evaluate(() => {
      const event = new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true });
      document.getElementById('input').dispatchEvent(event);
      return event.defaultPrevented;
    });
    assert.equal(compositionPrevented, false);
    assert.equal(await page.locator('#output').inputValue(), '');
    assert.equal(await page.locator('#translate').isDisabled(), false);
    await page.screenshot({ path: screenshotPath });
    await desktop.evaluate(({ ipcMain, BrowserWindow }) => {
      globalThis.__uiRequests = [];
      globalThis.__uiCancelled = [];
      ipcMain.removeHandler('translate');
      ipcMain.removeHandler('cancel');
      ipcMain.handle('cancel', (_event, request) => { globalThis.__uiCancelled.push(request.id); return true; });
      ipcMain.handle('translate', async (_event, request) => {
        globalThis.__uiRequests.push(request);
        const window = BrowserWindow.getAllWindows()[0];
        window.webContents.send('translation-progress', { id: request.id, phase: 'streaming', text: '첫 문장' });
        await new Promise(resolve => setTimeout(resolve, 200));
        window.webContents.send('translation-progress', { id: request.id, phase: 'translated', text: '오래된 결과' });
        window.webContents.send('translation-progress', { id: request.id, phase: 'aligning' });
        return { text: '오래된 결과' };
      });
    });
    await page.locator('#input').press('Enter');
    await page.waitForFunction(() => requestId !== null && busy);
    const cancelledRequest = await page.evaluate(() => requestId);
    await page.locator('#clear').click();
    await page.waitForTimeout(250);
    assert.deepEqual(await desktop.evaluate(() => globalThis.__uiCancelled), [cancelledRequest]);
    assert.equal(await desktop.evaluate(() => globalThis.__uiRequests.length), 1);
    assert.equal(await page.locator('#output').inputValue(), '');
    assert.equal(await page.evaluate(() => requestId), null);
    assert.equal(await page.evaluate(() => stageState), null);
    assert.equal(await page.locator('#target-language').inputValue(), 'English');
    const settingsEntry = platform === 'win32' ? '#connection-button' : '#settings-toggle';
    await page.locator(settingsEntry).click(); assert.equal(await page.locator('#settings').isVisible(), true);
    await page.locator('#pin').check(); assert.equal(await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isAlwaysOnTop()), true);
    await page.locator('#pin').uncheck(); await page.locator('#settings-close').click();
    await page.locator('#clear').click(); assert.equal(await page.locator('#input').inputValue(), '');
    assert.deepEqual(errors, []);
    process.stdout.write(`PASS: isolated app paths, target input, Shift+Enter, IME no-submit, immediate clear cancellation, settings controls and renderer errors. Screenshot: ${screenshotPath}\n`);
  } finally {
    if (desktop) {
      await desktop.close();
    }
    fs.rmSync(profile, { recursive: true, force: true });
  }
})().catch(e => { process.stderr.write(e.stack + '\n'); process.exitCode = 1; });
