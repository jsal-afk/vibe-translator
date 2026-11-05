const { _electron: electron } = require('playwright-core');
const { electronLaunchOptions } = require('./runtime.cjs');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { decodeAlignment, sourceIndex } = require('../src/alignment.js');
const root = path.resolve(__dirname, '..');
(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'baro-links-'));
  const screenshotPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-linked-ui-')), 'linked-ui.png');
  let desktop;
  try {
    desktop = await electron.launch({ ...electronLaunchOptions(), args: [root, `--user-data-dir=${profile}`], env: { ...process.env, BARO_SMOKE: '1' } });
    const page = await desktop.firstWindow(); await page.waitForSelector('#input');
    const isolatedPaths = await desktop.evaluate(({ app }) => ({ userData: app.getPath('userData'), sessionData: app.getPath('sessionData') }));
    assert.equal(path.resolve(isolatedPaths.userData), profile);
    assert.equal(path.resolve(isolatedPaths.sessionData), profile);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const source = 'I really agree.\n\nPlease send the document.';
    const targetText = '정말 동의합니다.\n\n문서를 보내 주세요.';
    const sourceEntries = sourceIndex(source), targetEntries = sourceIndex(targetText);
    const sourceWords = sourceEntries.flatMap(entry => entry.w);
    const targetWords = targetEntries.flatMap(entry => entry.w);
    const wordId = (words, prefix) => words.find(([, text]) => text.startsWith(prefix))?.[0];
    const raw = JSON.stringify({
      sourceLanguage: 'English',
      groups: sourceEntries.map((entry, index) => [[entry.s], [targetEntries[index].s]]),
      links: [[[wordId(sourceWords, 'really')], [wordId(targetWords, '정말')]]],
    });
    const decoded = decodeAlignment(raw, source, targetText);
    const state = { connected: true, recovering: false, needsLogin: false, efforts: [{ key: 'web-0', label: 'Instant' }, { key: 'web-1', label: 'Medium' }], messageKey: 'connection.connected', messageArgs: {} };
    await desktop.evaluate(({ ipcMain, BrowserWindow }, { decoded, state, targetText }) => {
      globalThis.__linkRequests = [];
      globalThis.__cancelledLinks = [];
      ipcMain.removeHandler('translate');
      ipcMain.removeHandler('cancel');
      ipcMain.handle('cancel', (_event, request) => { globalThis.__cancelledLinks.push(request.id); return true; });
      ipcMain.handle('translate', async (_event, request) => {
        globalThis.__linkRequests.push(request);
        const window = BrowserWindow.getAllWindows()[0];
        await new Promise(resolve => setTimeout(resolve, 120));
        window.webContents.send('connection-state', state);
        window.webContents.send('translation-progress', { id: request.id, phase: 'streaming', text: targetText.slice(0, 8) });
        window.webContents.send('translation-progress', { id: request.id, phase: 'translated', text: targetText, sourceLanguage: decoded.sourceLanguage, seconds: 0.1, cached: false });
        window.webContents.send('translation-progress', { id: request.id, phase: 'aligning' });
        window.webContents.send('translation-progress', {
          id: request.id, phase: 'alignment', sourceLanguage: decoded.sourceLanguage,
          groups: decoded.groups, links: decoded.links, sourceWords: decoded.sourceWords,
        });
        return { text: targetText, ...decoded, sourceLanguage: decoded.sourceLanguage, seconds: 0.1, cached: false };
      });
      BrowserWindow.getAllWindows()[0].webContents.send('connection-state', state);
    }, { decoded, state, targetText });
    await page.locator('#target-language').fill('Korean');
    await page.locator('#input').fill(source); await page.locator('#input').press('Enter');
    await page.waitForFunction(() => !busy && requestId === null && !!document.getElementById('result-state').textContent);
    assert.equal(await page.locator('#output').inputValue(), targetText);
    await page.locator('#input').evaluate(node => { node.focus(); node.setSelectionRange(2, 8); });
    await page.waitForFunction(() => document.querySelector('.result-editor mark')?.textContent === '정말', null, {polling:50,timeout:3000}).catch(async error => { console.log('SELECTION DEBUG', await page.evaluate(() => ({active:document.activeElement.id, start:$('input').selectionStart,end:$('input').selectionEnd,alignment:currentAlignment,marks:[...document.querySelectorAll('mark')].map(n=>n.textContent),frame:linkedEditors.selectionFrame,source:$('input').value,target:$('output').value,original:linkedEditors.source,expected:linkedEditors.target}))); throw error; });
    assert.equal(await page.locator('.result-editor mark').textContent(), '정말');
    assert.equal(await page.locator('#output').evaluate(node => node.scrollTop), 0);
    const wordRect = await page.locator('.source-editor .link-mirror').evaluate(node => {
      const range = document.createRange(); range.setStart(node.firstChild, 2); range.setEnd(node.firstChild, 8);
      const rect = range.getBoundingClientRect(); return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    });
    await page.locator('#input').evaluate(node => node.setSelectionRange(0, 0));
    await page.mouse.move(wordRect.x + 1, wordRect.y + wordRect.height / 2);
    await page.mouse.down(); await page.mouse.move(wordRect.x + wordRect.width - 1, wordRect.y + wordRect.height / 2, { steps: 6 }); await page.mouse.up();
    await page.waitForFunction(() => document.querySelector('.result-editor mark')?.textContent === '정말', null, {polling:50,timeout:3000}).catch(async error => { console.log('SELECTION DEBUG', await page.evaluate(() => ({active:document.activeElement.id, start:$('input').selectionStart,end:$('input').selectionEnd,alignment:currentAlignment,marks:[...document.querySelectorAll('mark')].map(n=>n.textContent),frame:linkedEditors.selectionFrame,source:$('input').value,target:$('output').value,original:linkedEditors.source,expected:linkedEditors.target}))); throw error; });
    await page.screenshot({ path: screenshotPath });
    await page.locator('#input').evaluate(node => node.setSelectionRange(0, 15));
    await page.waitForFunction(() => document.querySelector('.result-editor mark')?.textContent.trim() === '정말 동의합니다.');
    await page.locator('#swap').click();
    assert.equal(await page.locator('#input').inputValue(), targetText);
    assert.equal(await page.locator('#target-language').inputValue(), 'English');
    await page.locator('#input').evaluate(node => { node.focus(); node.setSelectionRange(0, 2); });
    await page.waitForFunction(() => document.querySelector('.result-editor mark')?.textContent === 'really');
    await page.locator('#input').fill(targetText + '!');
    assert.equal(await page.locator('.link-mirror mark').count(), 0);
    // Recoverable disconnection keeps Enter usable; key repeat never duplicates.
    await desktop.evaluate(({ BrowserWindow }, state) => BrowserWindow.getAllWindows()[0].webContents.send('connection-state', {
      ...state, connected: false, recovering: true, messageKey: 'connection.connecting', messageArgs: {},
    }), state);
    await page.locator('#target-language').fill('Korean');
    await page.locator('#input').fill(source);
    assert.equal(await page.locator('#translate').isEnabled(), true);
    await page.locator('#input').press('Enter'); await page.locator('#input').press('Enter');
    await page.waitForFunction(() => !busy && requestId === null && !!document.getElementById('result-state').textContent);
    assert.equal(await desktop.evaluate(() => globalThis.__linkRequests.length), 2);
    assert.equal(await desktop.evaluate(() => globalThis.__linkRequests.at(-1).targetLanguage), 'Korean');
    // Full text remains visible and editable while background alignment is pending.
    await desktop.evaluate(({ ipcMain, BrowserWindow }, { decoded, targetText }) => {
      globalThis.__cancelledLinks = [];
      globalThis.__finishMappingById = {};
      ipcMain.removeHandler('translate');
      ipcMain.removeHandler('cancel');
      ipcMain.handle('cancel', (_event, request) => {
        globalThis.__cancelledLinks.push(request.id);
        globalThis.__finishMappingById[request.id]?.();
        return true;
      });
      ipcMain.handle('translate', async (_event, request) => {
        globalThis.__linkRequests.push(request);
        const window = BrowserWindow.getAllWindows()[0];
        const alignment = {
          sourceLanguage: decoded.sourceLanguage,
          groups: decoded.groups, links: decoded.links, sourceWords: decoded.sourceWords,
        };
        window.webContents.send('translation-progress', {
          id: request.id, phase: 'translated', text: targetText,
          sourceLanguage: decoded.sourceLanguage, seconds: 0.2, cached: false,
        });
        window.webContents.send('translation-progress', { id: request.id, phase: 'aligning' });
        await new Promise(resolve => {
          const finish = () => {
            window.webContents.send('translation-progress', { id: request.id, phase: 'alignment', ...alignment });
            delete globalThis.__finishMappingById[request.id];
            resolve();
          };
          globalThis.__finishMappingById[request.id] = finish;
          globalThis.__finishMapping = finish;
        });
        return { text: targetText, ...alignment, seconds: 0.2, cached: false };
      });
    }, { decoded, targetText });
    await page.locator('#input').fill(source); await page.locator('#input').press('Enter');
    await page.waitForFunction(() => !busy && mappingPending && !!$('result-state').textContent);
    assert.equal(await page.evaluate(() => $('stage-indicator').textContent), await page.evaluate(() => t('stage.aligning')));
    assert.equal(await page.locator('#output').inputValue(), targetText);
    assert.equal(await page.locator('#clear').isEnabled(), true);
    assert.equal(await page.locator('#translate-label').textContent(), await page.evaluate(() => t('action.translate')));
    const stageScreenshotPath = path.join(path.dirname(screenshotPath), 'linked-ui-aligning.png');
    await page.screenshot({ path: stageScreenshotPath });
    assert.equal(await page.locator('#swap').isEnabled(), true);
    const activeId = await page.evaluate(() => requestId);
    await page.locator('#input').fill('편집한 새로운 원문');
    await page.waitForTimeout(100);
    assert.deepEqual(await desktop.evaluate(() => globalThis.__cancelledLinks), [activeId]);
    assert.equal(await page.locator('#output').inputValue(), targetText);
    await page.waitForFunction(() => !mappingPending);
    assert.equal(await page.locator('#input').inputValue(), '편집한 새로운 원문');
    assert.equal(await page.locator('.link-mirror mark').count(), 0);
    await page.locator('#target-language').fill('Korean');
    await page.locator('#input').fill(source); await page.locator('#input').press('Enter');
    await page.waitForFunction(() => mappingPending && requestId !== null);
    const oldMappingId = await page.evaluate(() => requestId);
    assert.equal(await page.locator('#translate-label').textContent(), await page.evaluate(() => t('action.translate')));
    await page.locator('#tone').selectOption('professor');
    await page.locator('#target-language').fill('Japanese');
    await page.locator('#target-language').blur();
    await page.locator('#translate').click();
    await page.waitForFunction(id => mappingPending && requestId !== null && requestId !== id, oldMappingId);
    await page.waitForTimeout(50);
    const nextRequest = await desktop.evaluate(() => globalThis.__linkRequests.at(-1));
    assert.deepEqual(await desktop.evaluate(() => globalThis.__cancelledLinks), [activeId, oldMappingId]);
    assert.equal(nextRequest.targetLanguage, 'Japanese');
    assert.equal(nextRequest.tone, 'professor');
    const followupId = await page.evaluate(() => requestId);
    await desktop.evaluate((_electron, id) => new Promise((resolve, reject) => {
      let attempts = 0;
      const waitForMapping = () => {
        if (typeof globalThis.__finishMappingById[id] === 'function') resolve();
        else if (++attempts > 100) reject(new Error('Mapping fixture did not become cancellable.'));
        else setTimeout(waitForMapping, 10);
      };
      waitForMapping();
    }), followupId);
    await desktop.evaluate((_electron, id) => globalThis.__finishMappingById[id](), followupId);
    await page.waitForFunction(() => requestId === null && stageState === 'done');
    // Unequal line wraps and different content heights, in both directions.
    await page.evaluate(() => {
      document.getElementById('input').value = ('A long source sentence with enough words to wrap over multiple visual lines. '.repeat(4) + '\n').repeat(80);
      document.getElementById('output').value = ('짧은 번역문입니다.\n').repeat(140);
      updateInput(); linkedEditors.refresh();
    });
    const ratios = () => page.evaluate(() => ['input', 'output'].map(id => { const e = document.getElementById(id); return { top: e.scrollTop, max: e.scrollHeight - e.clientHeight, ratio: e.scrollTop / (e.scrollHeight - e.clientHeight) }; }));
    assert.ok((await ratios()).every(value => value.max > 1000));
    for (const [id, ratio] of [['input', 0.41], ['output', 0], ['input', 1], ['output', 0.25], ['output', 1], ['input', 0]]) {
      await page.locator('#' + id).evaluate((node, ratio) => { node.scrollTop = ratio * (node.scrollHeight - node.clientHeight); }, ratio);
      await page.waitForFunction(ratio => ['input', 'output'].every(id => { const e = document.getElementById(id); return Math.abs(e.scrollTop / (e.scrollHeight - e.clientHeight) - ratio) < 0.002; }), ratio);
      const values = await ratios();
      assert.ok(Math.abs(values[0].ratio - values[1].ratio) < 0.002);
      if (ratio === 0) assert.ok(values.every(value => value.top === 0));
      if (ratio === 1) assert.ok(values.every(value => Math.abs(value.top - value.max) <= 1));
    }
    const geometry = await page.evaluate(() => ['input', 'output'].map(id => {
      const e = document.getElementById(id), mirror = e.parentElement.querySelector('.link-mirror');
      return { textHeight: e.scrollHeight, mirrorHeight: mirror.getBoundingClientRect().height };
    }));
    assert.ok(geometry.every(value => Math.abs(value.textHeight - value.mirrorHeight) <= 1), JSON.stringify(geometry));
    await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(650, 530));
    await page.waitForFunction(() => innerWidth === 650);
    await page.locator('#output').evaluate(node => { node.scrollTop = node.scrollHeight; });
    await page.waitForFunction(() => ['input', 'output'].every(id => { const e = document.getElementById(id); return Math.abs(e.scrollTop - (e.scrollHeight - e.clientHeight)) <= 1; }));
    assert.deepEqual(errors, []);
    process.stdout.write(`PASS: alignment/swap, recovery, mapping cancellation and one-click target/tone retry, scrolling/min-width. Stage screenshot: ${stageScreenshotPath}; completed UI: ${screenshotPath}\n`);
  } finally {
    if (desktop) await desktop.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
})().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
