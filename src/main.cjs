const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, globalShortcut, clipboard, shell, powerMonitor } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { ChatBrowser } = require('./browser.cjs');
const I18n = require('./i18n.js');
const LanguagePolicy = require('./language-policy.js');
const Targets = require('./target-language.js');

// Electron derives the macOS cookie-encryption keychain service and account
// from the internal app name. Keep the established identity across rebranding.
const internalAppName = 'Baro Translate';
app.setName(internalAppName);

// Keep the established profile for cookies/preferences. Isolated test launches
// explicitly opt into their own profile through Chromium's user-data-dir switch.
const profileOverride = app.commandLine.getSwitchValue('user-data-dir');
const profilePath = profileOverride ? path.resolve(profileOverride) : path.join(app.getPath('appData'), internalAppName);
fs.mkdirSync(profilePath, { recursive: true, mode: 0o700 });
app.setPath('userData', profilePath);
app.setPath('sessionData', profilePath);
if (!app.requestSingleInstanceLock()) app.quit();
const isMac = process.platform === 'darwin';
const isWindows = process.platform === 'win32';
if (isWindows) app.setAppUserModelId('local.baro.translate');
let mainWindow, browser, tray, quitting = false, authenticationWindowShown = false;
let systemLanguage = 'en', uiLanguage = 'en', uiLanguageExplicit = false;
let preferences = { targetLanguage: 'auto', effort: 'web-0', alwaysOnTop: false, tone: '', context: '' };
const settingsPath = () => path.join(app.getPath('userData'), 'preferences.json');
const t = (key, args) => I18n.t(uiLanguage, key, args);
const emit = (channel, payload) => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload); };
function savedPreferences() {
  const value = { ...preferences };
  if (uiLanguageExplicit) value.uiLanguage = uiLanguage;
  return value;
}
function writePreferences() {
  fs.writeFileSync(settingsPath(), JSON.stringify(savedPreferences()), { mode: 0o600 });
}
function loadPreferences() {
  let saved = {};
  try {
    const value = JSON.parse(fs.readFileSync(settingsPath(), 'utf8'));
    if (value && typeof value === 'object' && !Array.isArray(value)) saved = value;
  } catch {}
  const migratedDirection = saved.direction === 'ko-en' ? 'English' : saved.direction === 'en-ko' ? 'Korean' : 'auto';
  preferences = {
    targetLanguage: typeof saved.targetLanguage === 'string' ? Targets.canonicalize(saved.targetLanguage)
      : Object.hasOwn(saved, 'direction') ? migratedDirection : 'auto',
    effort: typeof saved.effort === 'string' ? saved.effort : 'web-0',
    alwaysOnTop: saved.alwaysOnTop === true,
    tone: typeof saved.tone === 'string' ? saved.tone : '',
    context: typeof saved.context === 'string' ? saved.context : '',
  };
  uiLanguageExplicit = I18n.locales.includes(saved.uiLanguage);
  uiLanguage = uiLanguageExplicit ? saved.uiLanguage : LanguagePolicy.uiLanguageForSystemLanguage(systemLanguage);
  const { validateTone } = require('./tone.js');
  try { Object.assign(preferences, validateTone(preferences, t)); }
  catch { preferences.tone = ''; preferences.context = ''; }
  if (Object.hasOwn(saved, 'direction')) writePreferences();
}
function settingsSnapshot() { return { ...preferences, uiLanguage, uiLanguageExplicit }; }
function showMain() { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus(); }
function toggleMain() { if (mainWindow.isVisible() && mainWindow.isFocused()) mainWindow.hide(); else showMain(); }
function showChatGPT() {
  if (!browser) return;
  authenticationWindowShown = false;
  browser.show();
}
function showLogin(loginOnly = false) {
  if (!browser) return;
  authenticationWindowShown = loginOnly && Boolean(browser.state.needsLogin || browser.state.loggedOut);
  browser.show();
}
function fromApp(event) {
  if (event.sender !== mainWindow?.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) throw new Error(t('error.invalidRequest'));
}
function buildApplicationMenu() {
  const template = [
    { label: t('menu.app'), submenu: [
      { label: t('menu.about'), role: 'about' }, { type: 'separator' },
      ...(isMac ? [
        { label: t('menu.hide'), role: 'hide' }, { label: t('menu.hideOthers'), role: 'hideOthers' },
        { label: t('menu.unhide'), role: 'unhide' }, { type: 'separator' },
      ] : []),
      { label: t('menu.quit'), role: 'quit' },
    ] },
    { label: t('menu.edit'), submenu: [
      { label: t('menu.undo'), role: 'undo' }, { label: t('menu.redo'), role: 'redo' }, { type: 'separator' },
      { label: t('menu.cut'), role: 'cut' }, { label: t('menu.copy'), role: 'copy' },
      { label: t('menu.paste'), role: 'paste' }, { label: t('menu.selectAll'), role: 'selectAll' },
    ] },
    { label: t('menu.window'), submenu: [
      { label: t('menu.minimize'), role: 'minimize' }, { label: t('menu.zoom'), role: 'zoom' },
      { label: t('menu.openMain'), click: showMain }, { label: t('menu.openChatGPT'), click: showChatGPT },
    ] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  app.setAboutPanelOptions({ applicationName: t('app.name'), applicationVersion: app.getVersion(),
    copyright: 'ChatGPT web connection adapted from miuuyy/codex-chatgpt-web (MIT).' });
  if (tray) {
    tray.setToolTip(t('app.name'));
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: t('menu.openMain'), click: showMain },
      { label: t('menu.openChatGPT'), click: showChatGPT },
      { type: 'separator' }, { label: t('menu.quit'), role: 'quit' },
    ]));
  }
}
function createWindow() {
  mainWindow = new BrowserWindow({ width: 790, height: 660, minWidth: 650, minHeight: 530, show: false,
    title: t('app.name'), titleBarStyle: isMac ? 'hiddenInset' : 'default', backgroundColor: '#f6f5f2',
    autoHideMenuBar: !isMac,
    icon: isWindows ? path.join(__dirname, '../assets/icon.iconset/icon_256x256.png') : undefined,
    alwaysOnTop: preferences.alwaysOnTop,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false } });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.once('ready-to-show', () => { if (process.env.BARO_SMOKE !== '1') showMain(); });
  mainWindow.on('focus', () => { if (process.env.BARO_SMOKE !== '1') browser?.touch(preferences.effort); });
  mainWindow.on('close', event => { if (!quitting) { event.preventDefault(); mainWindow.hide(); } });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', event => event.preventDefault());
}
app.on('second-instance', () => { if (mainWindow) showMain(); });
app.on('activate', () => { if (mainWindow) showMain(); });
app.on('before-quit', () => { quitting = true; globalShortcut.unregisterAll(); tray?.destroy(); browser?.close(); });
app.whenReady().then(async () => {
  try { systemLanguage = LanguagePolicy.systemLanguage(app.getPreferredSystemLanguages()?.[0] || Intl.DateTimeFormat().resolvedOptions().locale); }
  catch { systemLanguage = 'en'; }
  loadPreferences();
  const translator = (key, args) => t(key, args);
  createWindow();
  browser = new ChatBrowser(state => {
    if (state.connected && authenticationWindowShown) {
      authenticationWindowShown = false;
      if (browser?.window && !browser.window.isDestroyed()) browser.window.hide();
      showMain();
    }
    emit('connection-state', state);
  }, { systemLanguage, localize: translator });
  buildApplicationMenu();
  if (isWindows) {
    tray = new Tray(nativeImage.createFromPath(path.join(__dirname, '../assets/icon.iconset/icon_32x32.png')));
    tray.on('click', showMain);
    buildApplicationMenu();
  }
  ipcMain.handle('state', event => {
    fromApp(event);
    return { connection: browser.state, preferences: settingsSnapshot(), uiLanguage, uiLanguageExplicit,
      systemLanguage, platform: process.platform,
      shortcuts: { toggle: shortcutReady, paste: pasteShortcutReady } };
  });
  ipcMain.handle('show-login', (event, options) => { fromApp(event); showLogin(options?.loginOnly === true); });
  ipcMain.handle('ensure-ready', event => { fromApp(event); return browser.busy ? browser.state : browser.ensureReady({ effort: preferences.effort }); });
  ipcMain.handle('translate', async (event, request) => {
    fromApp(event);
    if (typeof request?.id !== 'string' || request.id.length > 100) return { error: t('error.invalidRequestId'), errorKey: 'error.invalidRequestId' };
    try { return await browser.translate(request, delta => emit('translation-progress', { ...delta, id: request.id })); }
    catch (error) {
      return { error: error.message, errorKey: error.messageKey, errorArgs: error.messageArgs, cancelled: error.messageKey === 'error.cancelled' };
    }
  });
  ipcMain.handle('cancel', (event, request) => { fromApp(event); return browser.cancel(request?.id); });
  ipcMain.handle('clipboard-read', event => { fromApp(event); return clipboard.readText(); });
  ipcMain.handle('clipboard-write', (event, text) => { fromApp(event); if (typeof text === 'string' && text.length <= 500000) clipboard.writeText(text); });
  ipcMain.handle('preferences', (event, value) => {
    fromApp(event);
    const { validateRequest } = require('./core.cjs');
    const clean = validateRequest({ text: 'preferences', targetLanguage: value.targetLanguage, effort: value.effort,
      tone: value.tone, context: value.context }, systemLanguage, t);
    preferences = { targetLanguage: clean.targetLanguage, effort: clean.effort, alwaysOnTop: value.alwaysOnTop === true,
      tone: clean.tone, context: clean.context };
    if (value.uiLanguage === null) {
      uiLanguageExplicit = false; uiLanguage = LanguagePolicy.uiLanguageForSystemLanguage(systemLanguage);
    } else if (I18n.locales.includes(value.uiLanguage)) {
      uiLanguageExplicit = true; uiLanguage = value.uiLanguage;
    } else throw new Error(t('error.invalidRequest'));
    mainWindow.setAlwaysOnTop(preferences.alwaysOnTop);
    writePreferences();
    browser.setTranslator(translator);
    mainWindow.setTitle(t('app.name'));
    buildApplicationMenu();
    return settingsSnapshot();
  });
  ipcMain.handle('logout', event => {
    fromApp(event);
    if (browser.busy || browser.connecting) return { ...browser.state, messageKey: 'error.logoutBusy', message: t('error.logoutBusy') };
    return browser.logout();
  });
  ipcMain.handle('open-source', event => { fromApp(event); return shell.openExternal('https://github.com/jsal-afk/vibe-translator'); });
  const shortcutReady = process.env.BARO_SMOKE === '1' || globalShortcut.register('Alt+Shift+L', toggleMain);
  const pasteShortcutReady = process.env.BARO_SMOKE === '1' || globalShortcut.register('Alt+Shift+T', () => { showMain(); emit('clipboard-import', clipboard.readText()); });
  if (process.env.BARO_SMOKE !== '1') void browser.initialize();
  powerMonitor.on('resume', () => {
    browser.lastReadyAt = 0; browser.lastSessionCheck = 0; browser.touch(preferences.effort);
  });
});
