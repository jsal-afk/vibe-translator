const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { _electron: electron } = require('playwright-core');
const { electronLaunchOptions } = require('./runtime.cjs');
const LanguagePolicy = require('../src/language-policy.js');
const root = path.resolve(__dirname, '..');

async function launch(profile) {
  const desktop = await electron.launch({ ...electronLaunchOptions(), args: [root, `--user-data-dir=${profile}`], env: { ...process.env, BARO_SMOKE: '1' } });
  const page = await desktop.firstWindow();
  await page.waitForFunction(() => document.getElementById('target-language') && !document.getElementById('target-language').disabled);
  return { desktop, page };
}
async function state(page) { return page.evaluate(() => window.luna.invoke('state')); }
async function settingsEntry(page) {
  return await page.locator('html').getAttribute('data-platform') === 'win32' ? '#connection-button' : '#settings-toggle';
}
async function installTranslationStub(desktop) {
  await desktop.evaluate(({ ipcMain }) => {
    globalThis.__vibeTestRequests = [];
    ipcMain.removeHandler('translate');
    ipcMain.handle('translate', (_event, request) => {
      const count = globalThis.__vibeTestRequests.push(request);
      // Deliberately omit sourceLanguage to exercise the user-supplied reverse-target path.
      return { text: `Distinct translated output ${count}.`, links: [], groups: [], sourceWords: [], cached: false, seconds: 0.125 };
    });
  });
}

test('isolated Electron target, autocomplete, UI locale and missing-metadata swap behavior', { timeout: 60000 }, async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-language-ui-'));
  let desktop;
  const pageErrors = [];
  try {
    ({ desktop } = await launch(profile));
    const page = await desktop.firstWindow();
    page.on('pageerror', error => pageErrors.push(error.message));
    const actualPaths = await desktop.evaluate(({ app }) => ({ userData: app.getPath('userData'), sessionData: app.getPath('sessionData') }));
    assert.equal(path.resolve(actualPaths.userData), profile);
    assert.equal(path.resolve(actualPaths.sessionData), profile);

    const initial = await state(page);
    await installTranslationStub(desktop);
    assert.equal(initial.preferences.targetLanguage, 'auto');
    assert.equal(initial.uiLanguageExplicit, false);

    await page.locator(await settingsEntry(page)).click();
    const uiLanguage = initial.uiLanguage === 'ja' ? 'fr' : 'ja';
    await page.locator('#ui-language').selectOption(uiLanguage);
    await page.waitForFunction(async code => document.documentElement.lang === code && (await window.luna.invoke('state')).uiLanguage === code, uiLanguage);
    const localized = await state(page);
    assert.equal(localized.systemLanguage, initial.systemLanguage);
    assert.equal(localized.uiLanguageExplicit, true);
    await page.locator('#settings-close').click();

    await page.locator('#target-language').fill('CHinese');
    await page.locator('#target-suggestions').waitFor({ state: 'visible' });
    await page.locator('#target-language').press('ArrowDown');
    await page.locator('#target-language').press('Escape');
    assert.equal(await page.locator('#target-suggestions').isHidden(), true);
    const imePrevented = await page.locator('#target-language').evaluate(element => {
      const event = new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true });
      element.dispatchEvent(event); return event.defaultPrevented;
    });
    assert.equal(imePrevented, false);
    await page.locator('#target-language').fill('kor');
    await page.locator('#target-language').press('Enter');
    await page.waitForFunction(async () => (await window.luna.invoke('state')).preferences.targetLanguage === 'Korean');
    assert.equal(await desktop.evaluate(() => globalThis.__vibeTestRequests?.length || 0), 0, 'accepting an autocomplete suggestion must not translate');

    let autoLabel = 'auto';
    await page.locator('#target-language').fill(autoLabel);
    await page.locator('#target-language').press('Enter');
    await page.locator('#input').click();
    await page.waitForFunction(async () => (await window.luna.invoke('state')).preferences.targetLanguage === 'auto');

    const source = 'Please send the revised document after the meeting.';
    const naturalTarget = 'polite Japanese for a senior colleague';
    await page.locator('#input').fill(source);
    if (LanguagePolicy.isEnglishSystemLanguage(initial.systemLanguage)) {
      await page.locator('#translate').click();
      await page.waitForFunction(() => document.getElementById('target-dialog').open);
      assert.equal(await desktop.evaluate(() => globalThis.__vibeTestRequests.length), 0, 'EnglishOS automatic request is blocked before IPC');
      await page.locator('#dialog-target-language').fill('kor');
      await page.locator('#dialog-target-language').press('Enter');
      assert.equal(await page.locator('#target-dialog').evaluate(dialog => dialog.open), true);
      assert.equal(await desktop.evaluate(() => globalThis.__vibeTestRequests.length), 0, 'selecting a dialog suggestion only accepts that suggestion');
      await page.locator('#dialog-target-language').fill(naturalTarget);
      await page.locator('#dialog-target-language').press('Escape');
      assert.equal(await page.locator('#target-language').inputValue(), naturalTarget, 'dialog choice is visible in the main target field');
      await page.locator('#target-dialog-accept').click();
    } else {
      await page.locator('#target-language').fill(naturalTarget);
      await page.locator('#translate').click();
    }
    await page.waitForFunction(() => document.getElementById('output').value === 'Distinct translated output 1.' && document.getElementById('result-state').textContent);
    const firstRequest = await desktop.evaluate(() => globalThis.__vibeTestRequests[0]);
    assert.equal(firstRequest.text, source);
    assert.equal(firstRequest.targetLanguage, naturalTarget);
    assert.equal((await state(page)).systemLanguage, initial.systemLanguage);
    await page.locator(await settingsEntry(page)).click();
    const localeWithResult = uiLanguage === 'fr' ? 'ja' : 'fr';
    await page.locator('#ui-language').selectOption(localeWithResult);
    await page.waitForFunction(async code => document.documentElement.lang === code && (await window.luna.invoke('state')).uiLanguage === code, localeWithResult);
    autoLabel = 'auto';
    await page.locator('#settings-close').click();

    const beforeCancel = {
      input: await page.locator('#input').inputValue(),
      output: await page.locator('#output').inputValue(),
      target: await page.locator('#target-language').inputValue(),
    };
    await page.locator('#swap').click();
    await page.waitForFunction(() => document.getElementById('target-dialog').open);
    await page.locator('#target-dialog-cancel').click();
    assert.equal(await page.locator('#input').inputValue(), beforeCancel.input);
    assert.equal(await page.locator('#output').inputValue(), beforeCancel.output);
    assert.equal(await page.locator('#target-language').inputValue(), beforeCancel.target);
    assert.equal(await desktop.evaluate(() => globalThis.__vibeTestRequests.length), 1, 'canceling reverse target selection sends no request');

    await page.locator('#swap').click();
    await page.waitForFunction(() => document.getElementById('target-dialog').open);
    await page.locator('#dialog-target-language').fill('English');
    await page.locator('#dialog-target-language').press('Escape');
    await page.locator('#target-dialog-accept').click();
    await page.waitForFunction(({ input, output }) => document.getElementById('input').value === input && document.getElementById('output').value === output,
      { input: beforeCancel.output, output: beforeCancel.input });
    assert.equal((await state(page)).preferences.targetLanguage, 'English');
    await page.locator('#swap').click();
    await page.waitForFunction(({ input, output }) => document.getElementById('input').value === input && document.getElementById('output').value === output,
      { input: beforeCancel.input, output: beforeCancel.output });
    assert.equal(await page.locator('#target-language').inputValue(), naturalTarget);
    assert.equal(await desktop.evaluate(() => globalThis.__vibeTestRequests.length), 1, 'both fallback and consecutive swaps are local-only');

    if (LanguagePolicy.isEnglishSystemLanguage(initial.systemLanguage)) {
      const beforeForwardCancel = { input: await page.locator('#input').inputValue(), output: await page.locator('#output').inputValue() };
      await page.locator('#target-language').fill(autoLabel);
      await page.locator('#target-language').press('Enter');
      await page.locator('#input').click();
      await page.waitForFunction(async () => (await window.luna.invoke('state')).preferences.targetLanguage === 'auto');
      await page.locator('#translate').click();
      await page.waitForFunction(() => document.getElementById('target-dialog').open);
      assert.equal(await desktop.evaluate(() => globalThis.__vibeTestRequests.length), 1);
      await page.locator('#target-dialog-cancel').click();
      assert.equal(await page.locator('#input').inputValue(), beforeForwardCancel.input);
      assert.equal(await page.locator('#output').inputValue(), beforeForwardCancel.output);
    }

    const finalState = await state(page);
    assert.equal(finalState.systemLanguage, initial.systemLanguage);
    assert.equal(finalState.uiLanguageExplicit, true);

    await desktop.close(); desktop = null;
    ({ desktop } = await launch(profile));
    const reopened = await desktop.firstWindow();
    const persisted = await state(reopened);
    assert.equal(persisted.systemLanguage, initial.systemLanguage);
    assert.equal(persisted.uiLanguage, localeWithResult);
    assert.equal(persisted.uiLanguageExplicit, true);
    assert.deepEqual(pageErrors, []);
  } finally {
    if (desktop) await desktop.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
});

test('isolated one-time direction preference migration preserves saved tone and context', { timeout: 60000 }, async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-pref-migration-'));
  let desktop;
  try {
    fs.writeFileSync(path.join(profile, 'preferences.json'), JSON.stringify({ direction: 'en-ko', effort: 'web-0', alwaysOnTop: true, tone: 'friend', context: 'Warm, concise note.' }));
    ({ desktop } = await launch(profile));
    const page = await desktop.firstWindow();
    const actualPaths = await desktop.evaluate(({ app }) => ({ userData: app.getPath('userData'), sessionData: app.getPath('sessionData') }));
    assert.equal(path.resolve(actualPaths.userData), profile);
    assert.equal(path.resolve(actualPaths.sessionData), profile);
    const migrated = await state(page);
    assert.equal(migrated.preferences.targetLanguage, 'Korean');
    assert.equal(migrated.preferences.tone, 'friend');
    assert.equal(migrated.preferences.context, 'Warm, concise note.');
    assert.equal(migrated.preferences.alwaysOnTop, true);
    assert.equal(migrated.uiLanguageExplicit, false);
    const saved = JSON.parse(fs.readFileSync(path.join(profile, 'preferences.json'), 'utf8'));
    assert.equal(Object.hasOwn(saved, 'direction'), false);
    assert.equal(saved.targetLanguage, 'Korean');
  } finally {
    if (desktop) await desktop.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
});
