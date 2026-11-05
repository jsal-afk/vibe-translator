const { BrowserWindow, session } = require('electron');
const { readChatGptAuthSession } = require('../vendor/chatgpt-auth-session.cjs');
const { configureChatGptAnnouncementDismissal } = require('../vendor/browser-announcements.cjs');
const { installScript } = require('./dom.cjs');
const markdown = require('../vendor/markdown.cjs');
const { buildTranslationPrompt, buildAlignmentPrompt, validateRequest, TranslationCache } = require('./core.cjs');
const { decodeAlignment } = require('./alignment.js');
const fs = require('node:fs');
const LanguagePolicy = require('./language-policy.js');
const I18n = require('./i18n.js');
const CHAT = 'https://chatgpt.com/?temporary-chat=true';
const AUTH_HOSTS = new Set(['chatgpt.com', 'auth.openai.com', 'auth0.openai.com', 'login.openai.com',
  'accounts.openai.com', 'accounts.google.com', 'login.microsoftonline.com', 'appleid.apple.com', 'idmsa.apple.com']);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const permitted = url => { try { const u = new URL(url); return u.protocol === 'https:' && AUTH_HOSTS.has(u.hostname); } catch { return false; } };
function humanVerificationTitle(contents, title) {
  if (!contents || contents.isDestroyed?.()) return false;
  try {
    const value = title === undefined ? contents.getTitle?.() : title;
    return permitted(contents.getURL?.()) && /^just a moment(?:\.{1,3}|…)?$/i.test((value || '').trim());
  } catch { return false; }
}
class ChatBrowser {
  constructor(onState, { systemLanguage = 'en', localize = (key, args) => I18n.t('en', key, args) } = {}) {
    this.onState = onState; this.systemLanguage = systemLanguage; this.localize = localize;
    this.cache = new TranslationCache(); this.busy = false; this.catalogue = [];
    this.tickets = new Map(); this.turnTail = Promise.resolve(); this.activeTicket = null; this.lastLoginCheck = 0; this.loginRetryTimer = null; this.loggingOut = false;
    this.authWindows = new Set(); this.loadingPage = null;
    this.state = { connected: false, needsLogin: false, recovering: false, loggedOut: false,
      messageKey: 'connection.loginRequired', message: this.t('connection.loginRequired'), efforts: [], model: null };
  }
  t(key, args) { return this.localize(key, args); }
  error(key, args, code) {
    const error = new Error(this.t(key, args));
    error.messageKey = key; error.messageArgs = args;
    if (code) error.code = code;
    return error;
  }
  setTranslator(localize) {
    this.localize = localize;
    if (this.state.messageKey) this.state.message = this.t(this.state.messageKey, this.state.messageArgs);
    this.window?.setTitle(`${this.t('app.name')} · ${this.t('settings.title')}`);
    this.onState(this.state);
  }
  publish(patch) {
    const state = { ...this.state, ...patch };
    if (Object.hasOwn(patch, 'message') && !Object.hasOwn(patch, 'messageKey')) {
      delete state.messageKey; delete state.messageArgs;
    }
    if (state.messageKey) state.message = this.t(state.messageKey, state.messageArgs);
    this.state = state; this.onState(this.state); return this.state;
  }
  trace(stage, detail = {}) {
    if (process.env.BARO_DIAGNOSTICS) fs.appendFileSync(process.env.BARO_DIAGNOSTICS,
      JSON.stringify({ time: new Date().toISOString(), stage, ...detail }) + '\n', { mode: 0o600 });
  }
  create() {
    if (this.window && !this.window.isDestroyed()) return this.window;
    this.session = session.fromPartition('persist:luna-translate-chatgpt');
    this.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    this.window = new BrowserWindow({ width: 1080, height: 800, show: false, title: `${this.t('app.name')} · ${this.t('settings.title')}`,
      backgroundColor: '#ffffff', autoHideMenuBar: true,
      webPreferences: { session: this.session, contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
    this.window.on('close', event => { if (!this.quitting) { event.preventDefault(); this.window.hide(); } });
    this.window.on('focus', () => this.pageChanged());
    this.window.webContents.debugger.attach('1.3');
    this.window.webContents.setWindowOpenHandler(({ url }) => permitted(url)
      ? { action: 'allow', overrideBrowserWindowOptions: { webPreferences: { session: this.session, nodeIntegration: false, contextIsolation: true, sandbox: true } } }
      : { action: 'deny' });
    this.window.webContents.on('will-navigate', (event, url) => { if (!permitted(url)) event.preventDefault(); });
    this.window.webContents.on('did-create-window', child => {
      this.authWindows.add(child);
      child.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      child.webContents.on('will-navigate', (event, url) => { if (!permitted(url)) event.preventDefault(); });
      child.webContents.on('did-navigate', () => this.pageChanged());
      child.webContents.on('page-title-updated', (_event, title) => this.pageChanged(child.webContents, title));
      child.on('closed', () => { this.authWindows.delete(child); this.pageChanged(); });
    });
    this.window.webContents.on('did-navigate', () => this.pageChanged());
    this.window.webContents.on('page-title-updated', (_event, title) => this.pageChanged(this.window.webContents, title));
    this.window.webContents.on('did-finish-load', () => {
      if (this.window.webContents.getURL().startsWith('https://chatgpt.com/')) {
        this.window.webContents.executeJavaScript(`(${configureChatGptAnnouncementDismissal.toString()})(true)`).catch(() => {});
        this.pageChanged();
      }
    });
    return this.window;
  }
  async initialize() { return this.ensureReady({ force: true, minimum: true }); }
  hasVisibleAuthWindow() {
    for (const child of this.authWindows) if (!child.isDestroyed() && child.isVisible()) return true;
    return false;
  }
  hasInteractiveWindow() {
    return Boolean(this.window && !this.window.isDestroyed() && this.window.isVisible?.()) || this.hasVisibleAuthWindow();
  }
  hasHumanVerification(source, title) {
    const main = this.window && !this.window.isDestroyed() && this.window.webContents;
    if (main && humanVerificationTitle(main, source === main ? title : undefined)) return true;
    for (const child of this.authWindows) {
      if (!child.isDestroyed() && humanVerificationTitle(child.webContents, source === child.webContents ? title : undefined)) return true;
    }
    return false;
  }
  requireNoHumanVerification() {
    if (this.hasHumanVerification()) throw this.error('error.humanVerificationRequired', undefined, 'LOGIN');
  }
  loadPage({ allowVisible = false } = {}) {
    if (this.loadingPage) return this.loadingPage;
    const window = this.window, contents = window.webContents;
    const url = contents.getURL?.() || '';
    const blank = !url || url === 'about:blank';
    if (this.hasVisibleAuthWindow() || contents.isLoadingMainFrame?.()
      || (!allowVisible && window.isVisible?.() && !blank)) return Promise.resolve(false);
    let timer, resumeAfterNavigation = false;
    const navigation = Promise.resolve(window.loadURL(CHAT));
    const load = Promise.race([navigation, new Promise((_, reject) => {
      timer = setTimeout(() => {
        if (!this.hasInteractiveWindow()) contents.stop?.();
        else resumeAfterNavigation = true;
        reject(this.error('error.connectionTimedOut'));
      }, 15000);
    })]).then(() => true).finally(() => clearTimeout(timer));
    this.loadingPage = load;
    const settled = () => {
      if (this.loadingPage === load) this.loadingPage = null;
      if (!resumeAfterNavigation) return;
      if (this.connecting) void this.connecting.finally(() => this.pageChanged()).catch(() => {});
      else this.pageChanged();
    };
    navigation.then(settled, settled);
    return load;
  }
  pageChanged(source, title) {
    if (this.loggingOut || this.quitting || this.state.loggedOut) return;
    if (this.hasHumanVerification(source, title)) {
      if (!this.state.needsLogin || this.state.messageKey !== 'error.humanVerificationRequired' || this.state.recovering) {
        this.publish({ connected: false, needsLogin: true, recovering: false, loggedOut: false, model: null, efforts: [],
          messageKey: 'error.humanVerificationRequired' });
      }
      return;
    }
    if (this.state.needsLogin && this.connecting) void this.connecting.finally(() => this.pageChanged()).catch(() => {});
    else if (this.state.needsLogin) this.checkLoginCompletion();
    else if (!this.state.connected) this.touch();
  }
  touch(effort) {
    if (this.quitting || this.state.loggedOut || this.state.needsLogin || this.busy) return;
    void this.ensureReady({ effort }).catch(() => {});
  }
  show() {
    if (this.state.loggedOut) this.publish({ connected: false, needsLogin: true, loggedOut: false, messageKey: 'connection.connecting' });
    const w = this.create();
    w.show(); w.focus();
    if (!w.webContents.getURL() || w.webContents.getURL() === 'about:blank') void this.loadPage().catch(() => {});
    if (this.state.needsLogin) {
      if (this.loginRetryTimer) { clearTimeout(this.loginRetryTimer); this.loginRetryTimer = null; }
      this.lastLoginCheck = Date.now();
      void this.ensureReady({ force: true, minimum: true, loginRetry: true }).catch(() => {});
    } else if (!this.state.connected && !this.busy) void this.ensureReady({ force: true, minimum: true }).catch(() => {});
  }
  checkLoginCompletion() {
    if (!this.state.needsLogin || this.state.loggedOut || this.quitting || this.busy) return;
    const remaining = 4000 - (Date.now() - this.lastLoginCheck);
    if (remaining > 0) {
      if (!this.loginRetryTimer) {
        this.loginRetryTimer = setTimeout(() => { this.loginRetryTimer = null; this.checkLoginCompletion(); }, remaining);
        this.loginRetryTimer.unref?.();
      }
      return;
    }
    this.lastLoginCheck = Date.now();
    void this.ensureReady({ force: true, minimum: true, loginRetry: true }).catch(() => {});
  }
  async key(keyCode) {
    const keys = { Right: { key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 },
      Left: { key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 },
      Escape: { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 } };
    const fields = keys[keyCode];
    await this.window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', ...fields });
    await this.window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', ...fields });
  }
  async call(method, argument) {
    if (new URL(this.window.webContents.getURL()).origin !== 'https://chatgpt.com') throw this.error('error.loginInChatGPT');
    return this.window.webContents.executeJavaScript(`${installScript()}; globalThis.__lunaTranslate[${JSON.stringify(method)}](${JSON.stringify(argument ?? null)})`, true);
  }
  async waitFor(fn, timeout = 10000) {
    const end = Date.now() + timeout;
    do { if (this.activeTicket?.cancelled) throw this.error('error.cancelled'); const value = await fn(); if (value) return value; await sleep(100); } while (Date.now() < end);
    throw this.error('error.screenTimedOut');
  }
  async authenticate() {
    const auth = await readChatGptAuthSession((url, options) => this.session.fetch(url, options), 'https://chatgpt.com', 5000);
    this.requireNoHumanVerification();
    if (!auth.sessionAuthenticated) {
      const error = this.error(auth.sessionCheckError ? 'error.network' : 'error.loginRequired', undefined, auth.sessionCheckError ? 'NETWORK' : 'LOGIN');
      if (error.code === 'LOGIN') this.cache.clear();
      if (error.code === 'LOGIN') this.publish({ connected: false, needsLogin: true, model: null, efforts: [], messageKey: error.messageKey, messageArgs: error.messageArgs });
      throw error;
    }
    this.lastSessionCheck = Date.now();
  }
  async inspectModel() {
    this.trace('inspect-start');
    await this.waitFor(async () => { this.requireNoHumanVerification(); return (await this.call('inspect')).composerReady; }, 20000);
    let clickedAt = 0, pointerSent = false;
    // Composer hydration can precede model controls. Open the picker once it
    // appears instead of timing out while observing a still-closed late picker.
    return this.waitFor(async () => {
      this.requireNoHumanVerification();
      const current = await this.call('inspect');
      if (current.efforts.length) { this.trace('inspect-ready', { options: current.efforts.length, selected: current.selectedEffort }); return current; }
      if (current.controlReady && !current.menuOpen && !clickedAt) {
        await this.call('openModel'); clickedAt = Date.now();
      } else if (clickedAt && !current.menuOpen && !pointerSent && Date.now() - clickedAt > 1500) {
        await this.call('pointerModel'); pointerSent = true;
      }
      return null;
    }, 10000);
  }
  async discoverOptions(snapshot) {
    const result = [];
    // The web's slider ticks can be textless. Commit each available value and read
    // the real closed-picker caption rather than inventing API reasoning labels.
    for (const option of snapshot.efforts) {
      if (option.label && !snapshot.slider?.requiresCaptionVerification) { result.push({ key: option.key, label: option.label }); continue; }
      await this.moveEffort(option.key);
      await this.key('Escape'); await sleep(180);
      const caption = (await this.call('inspect')).controlLabel;
      if (!caption || /^(Thinking effort|생각하는 정도|추론 강도)$/i.test(caption)) throw this.error('error.reasoningControlMissing');
      result.push({ key: option.key, label: caption });
      await this.call('openModel'); await this.waitFor(async () => (await this.call('inspect')).menuOpen, 3000);
    }
    if (!result.length) throw this.error('error.noReasoningOptions');
    this.catalogue = result;
    return result;
  }
  ensureReady(options = {}) {
    if (this.connecting) return this.connecting;
    if (this.state.loggedOut) return Promise.resolve(this.state);
    if (this.state.needsLogin && !options.loginRetry) return Promise.resolve(this.state);
    if (!options.force && this.state.connected && Date.now() - (this.lastReadyAt || 0) < 60000 && !this.warming && !this.hasHumanVerification()) return Promise.resolve(this.state);
    this.connecting = this.doRecover(options).finally(() => { this.connecting = null; });
    return this.connecting;
  }
  async doRecover({ force = false, reload = false, minimum = false, effort } = {}) {
    this.publish({ recovering: true, loggedOut: false, messageKey: 'connection.connecting' });
    let error, pageReloaded = false;
    try {
      this.create();
      this.requireNoHumanVerification();
      if (this.warming) await this.warming;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          if (this.activeTicket?.cancelled) throw this.error('error.cancelled');
          this.requireNoHumanVerification();
          if (force || !this.state.connected || !this.lastSessionCheck || Date.now() - this.lastSessionCheck > 300000) await this.authenticate();
          this.requireNoHumanVerification();
          if (this.loadingPage) await this.loadingPage;
          this.requireNoHumanVerification();
          let ready;
          try { ready = await this.call('inspect'); } catch {}
          this.requireNoHumanVerification();
          if (!pageReloaded && (reload || attempt || !ready?.composerReady)) {
            pageReloaded = await this.loadPage();
            this.requireNoHumanVerification();
          }
          const snapshot = await this.inspectModel();
          const sameOptions = snapshot.model === this.state.model && this.catalogue.length === snapshot.efforts.length && this.catalogue.every(o => snapshot.efforts.some(v => v.key === o.key));
          const efforts = sameOptions && !minimum ? this.catalogue : await this.discoverOptions(snapshot);
          const chosen = minimum ? efforts[0].key : effort || this.state.selectedEffort || efforts[0].key;
          if (!efforts.some(o => o.key === chosen)) throw this.error('error.reasoningUnavailable', undefined, 'EFFORT');
          await this.setEffort(chosen);
          this.requireNoHumanVerification();
          this.lastReadyAt = Date.now();
          return this.publish({ connected: true, needsLogin: false, recovering: false, model: this.activeModel || snapshot.model,
            efforts, selectedEffort: chosen, messageKey: 'connection.connected' });
        } catch (caught) {
          error = this.hasHumanVerification() ? this.error('error.humanVerificationRequired', undefined, 'LOGIN') : caught;
          if (error.code === 'LOGIN' || error.code === 'EFFORT' || this.activeTicket?.cancelled || this.quitting) break;
          if (!attempt) {
            if (error.code === 'NETWORK' && !pageReloaded) { try { pageReloaded = await this.loadPage(); } catch {} }
            await sleep(250);
          }
        }
      }
      return this.publish({ connected: false, recovering: false, needsLogin: error?.code === 'LOGIN',
        ...(error?.code === 'LOGIN' ? { model: null, efforts: [] } : {}),
        message: error?.message || this.t('error.reconnect'), messageKey: error?.messageKey, messageArgs: error?.messageArgs });
    } catch (caught) {
      const error = this.hasHumanVerification() ? this.error('error.humanVerificationRequired', undefined, 'LOGIN') : caught;
      return this.publish({ connected: false, recovering: false, needsLogin: error.code === 'LOGIN', message: error.message,
        ...(error.code === 'LOGIN' ? { model: null, efforts: [] } : {}), messageKey: error.messageKey, messageArgs: error.messageArgs });
    }
  }
  async moveEffort(effort) {
    const chosen = await this.call('chooseEffort', effort);
    if (!chosen.ok) throw this.error('error.reasoningUnavailableAccount', undefined, 'EFFORT');
    let before = (await this.call('inspect')).slider?.value;
    for (let i = 0; i < chosen.distance; i++) {
      await this.key(chosen.arrow);
      const next = await this.waitFor(async () => { const value = (await this.call('inspect')).slider?.value; return value !== before ? { value } : null; }, 3000);
      if (next.value !== before + (chosen.arrow === 'Right' ? 1 : -1)) throw this.error('error.reasoningSelectionUnconfirmed');
      before = next.value;
    }
    await sleep(100);
    return this.waitFor(async () => { const current = await this.call('inspect'); return current.selectedEffort === effort ? current : null; }, 3000);
  }
  async setEffort(effort) {
    let snapshot = await this.moveEffort(effort);
    await this.key('Escape'); await sleep(150);
    if (snapshot.controlReady) {
      await this.call('openModel'); snapshot = await this.waitFor(async () => { const current = await this.call('inspect'); return current.menuOpen ? current : null; }, 3000);
      if (snapshot.selectedEffort !== effort) throw this.error('error.reasoningNotSelected', undefined, 'EFFORT');
      await this.key('Escape'); await sleep(100);
    }
    this.activeModel = snapshot.model;
  }
  prewarm() {
    if (this.quitting || this.warming || this.connecting || this.state.loggedOut || this.state.needsLogin || this.hasInteractiveWindow()) return this.warming;
    this.warming = this.loadPage().then(loaded => loaded && this.waitFor(async () => (await this.call('inspect')).composerReady, 12000))
      .catch(() => { this.lastReadyAt = 0; })
      .finally(() => { this.warming = null; });
    return this.warming;
  }
  async prepareRequest(request) {
    if (this.connecting) await this.connecting;
    if (this.warming) await this.warming;
    const state = await this.ensureReady({ effort: request.effort });
    if (!state.connected) throw Object.assign(new Error(state.message), { code: 'RECOVERY' });
    let initial;
    try { initial = await this.call('response'); } catch {}
    if ((!initial || initial.users || initial.text) && !await this.loadPage({ allowVisible: true })) throw this.error('error.reconnect', undefined, 'RECOVERY');
    const snapshot = await this.inspectModel();
    if (!snapshot.efforts.some(o => o.key === request.effort)) throw this.error('error.reasoningUnavailable', undefined, 'EFFORT');
    await this.setEffort(request.effort);
    return snapshot;
  }
  translate(raw, progress = () => {}) {
    const request = validateRequest(raw, this.systemLanguage, this.t.bind(this));
    const targetRequired = LanguagePolicy.targetSelectionRequired(request.text, request.targetLanguage, this.systemLanguage);
    if (targetRequired) return Promise.resolve({ requiresTarget: targetRequired });
    const ticket = { id: raw?.id ?? Symbol('translation'), cancelled: false, sent: false, translationReady: false, stage: 'queued' };
    this.tickets.set(ticket.id, ticket);
    if (this.activeTicket?.translationReady) void this.cancel(this.activeTicket.id);
    const job = this.turnTail.then(() => this.runTicket(ticket, request, progress));
    const settled = job.finally(() => this.tickets.delete(ticket.id));
    this.turnTail = settled.catch(() => {});
    return settled;
  }
  async sendPrompt(ticket, prompt, progress, baselineText, stage) {
    if (ticket.cancelled) throw this.error('error.cancelled');
    const focused = await this.call('focusComposer');
    if (ticket.cancelled) throw this.error('error.cancelled');
    if (!focused) throw this.error('error.composerNotReady');
    await this.window.webContents.debugger.sendCommand('Input.insertText', { text: prompt });
    if (ticket.cancelled) throw this.error('error.cancelled');
    const draft = await this.call('draftStatus', prompt);
    if (ticket.cancelled) throw this.error('error.cancelled');
    this.trace('draft-inserted', draft);
    await this.waitFor(async () => {
      if (ticket.cancelled) throw this.error('error.cancelled');
      ticket.sendInFlight = true;
      try {
        const sent = await this.call('send', prompt);
        if (sent) ticket.sent = true;
        return sent;
      } finally { ticket.sendInFlight = false; }
    }, 5000);
    if (ticket.cancelled) {
      if (ticket.sent) await this.call('stop').catch(() => {});
      throw this.error('error.cancelled');
    }
    ticket.stage = stage;
    this.trace('prompt-sent', { stage });
    let lastText = baselineText, completeText = '', completedSince = 0, lastHtml = null, convertedHtml = '';
    const deadline = Date.now() + 300000;
    while (Date.now() < deadline) {
      if (ticket.cancelled) throw this.error('error.cancelled');
      const result = await this.call('response');
      if (ticket.cancelled) throw this.error('error.cancelled');
      let text;
      if (stage === 'translation') {
        const html = result.html || '';
        if (html !== lastHtml) { lastHtml = html; convertedHtml = html ? markdown(html) : ''; }
        text = convertedHtml || result.text || '';
      } else text = result.protocol || result.text || (result.html ? markdown(result.html) : '');
      if (result.error) throw this.error('error.chatGPTPrefix', { error: result.error });
      if (text.length > 500000) throw Object.assign(new Error(), { code: 'RESPONSE_TOO_LONG' });
      if (text !== lastText) {
        lastText = text; completeText = ''; completedSince = 0;
        if (stage === 'translation' && result.users && text) {
          progress({ phase: 'streaming', text, messageKey: 'status.translating', message: this.t('status.translating') });
        }
      }
      if (result.users && text && text !== baselineText && result.complete) {
        if (completeText !== text) { completeText = text; completedSince = Date.now(); }
        if (Date.now() - completedSince >= 300) return { text, protocol: stage === 'alignment' ? result.protocol || text : text };
      } else { completedSince = 0; completeText = ''; }
      await sleep(120);
    }
    throw this.error('error.translationTimedOut');
  }
  async runTicket(ticket, request, progress) {
    if (ticket.cancelled) throw this.error('error.cancelled');
    this.busy = true; this.activeTicket = ticket; this.translationReady = false;
    const started = Date.now();
    let readyResult, readySeconds = 0, cacheRequest, usedCachedText = false;
    try {
      progress({ phase: 'prepare', messageKey: 'status.preparing', message: this.t('status.preparing') });
      this.trace('translate-start');
      let snapshot;
      try { snapshot = await this.prepareRequest(request); }
      catch (error) {
        if (ticket.cancelled || ['EFFORT', 'RECOVERY'].includes(error.code) || this.state.needsLogin || this.state.loggedOut) throw error;
        // Recovery is allowed only before a prompt has been inserted or sent.
        const state = await this.ensureReady({ force: true, reload: true, effort: request.effort });
        if (!state.connected) throw this.error('error.reconnect', undefined, 'RECOVERY');
        snapshot = await this.prepareRequest(request);
      }
      if (ticket.cancelled) throw this.error('error.cancelled');
      const option = snapshot.efforts.find(o => o.key === request.effort);
      const signature = `${snapshot.model}|${option.label || (await this.call('inspect')).controlLabel}`;
      cacheRequest = { ...request, signature };
      const cached = this.cache.get(cacheRequest);
      if (cached !== undefined) {
        usedCachedText = true;
        readyResult = { text: cached.text, sourceLanguage: cached.sourceLanguage || '' };
        readySeconds = cached.seconds || 0;
        ticket.translationReady = this.translationReady = true;
        progress({ phase: 'translated', text: readyResult.text, seconds: 0, cached: true,
          sourceLanguage: readyResult.sourceLanguage || undefined });
        if (Array.isArray(cached.groups) && Array.isArray(cached.links) && Array.isArray(cached.sourceWords)) {
          const alignment = { groups: cached.groups, links: cached.links, sourceWords: cached.sourceWords, sourceLanguage: cached.sourceLanguage || '' };
          progress({ phase: 'alignment', ...alignment });
          return { ...cached, cached: true, seconds: 0, model: this.activeModel };
        }
      } else {
        let baseline = await this.call('response');
        if (baseline.users || baseline.text || !await this.call('focusComposer')) {
          if (!await this.loadPage({ allowVisible: true })) throw this.error('error.composerNotReady');
          await this.inspectModel(); await this.setEffort(request.effort);
          baseline = await this.call('response');
          if (baseline.users || baseline.text || !await this.call('focusComposer')) throw this.error('error.composerNotReady');
        }
        ticket.stage = 'translation';
        const prompt = buildTranslationPrompt(request);
        const translated = await this.sendPrompt(ticket, prompt, progress, baseline.text || '', 'translation');
        if (ticket.cancelled) throw this.error('error.cancelled');
        if (!translated.text.trim()) throw this.error('error.translationUnreadable');
        readyResult = { text: translated.text };
        readySeconds = (Date.now() - started) / 1000;
        ticket.translationReady = this.translationReady = true;
        this.cache.set(cacheRequest, { ...readyResult, seconds: readySeconds });
        progress({ phase: 'translated', text: readyResult.text, seconds: readySeconds, cached: false,
          messageKey: 'status.success', message: this.t('status.success') });
      }
      if (ticket.cancelled) throw this.error('error.cancelled');
      progress({ phase: 'aligning' });
      ticket.stage = 'alignment'; ticket.sent = false;
      let baseline;
      try { baseline = await this.call('response'); }
      catch { baseline = { text: '' }; }
      if (!await this.call('focusComposer')) throw this.error('error.composerNotReady');
      const prompt = buildAlignmentPrompt(request.text, readyResult.text);
      const aligned = await this.sendPrompt(ticket, prompt, progress, baseline.text || '', 'alignment');
      if (ticket.cancelled) throw this.error('error.cancelled');
      const alignment = decodeAlignment(aligned.protocol, request.text, readyResult.text);
      if (alignment.invalid || !alignment.complete) throw Object.assign(new Error(), { code: 'ALIGNMENT_INVALID' });
      readyResult = { ...readyResult, ...alignment };
      const result = { ...readyResult, cached: usedCachedText, seconds: usedCachedText ? 0 : readySeconds, model: this.activeModel };
      this.cache.set(cacheRequest, result);
      this.trace('completed', { seconds: result.seconds, cached: result.cached });
      progress({ phase: 'alignment', groups: alignment.groups, links: alignment.links,
        sourceWords: alignment.sourceWords, sourceLanguage: alignment.sourceLanguage });
      return result;
    } catch (caught) {
      const error = caught.code === 'RESPONSE_TOO_LONG' ? this.error('error.responseTooLong', { count: 500000 }) : caught;
      this.trace('failed', { code: error.code || 'ERROR', stage: ticket.stage });
      if (this.window && !this.window.isDestroyed() && ticket.sent) await this.call('stop').catch(() => {});
      if (readyResult) {
        const alignmentErrorKey = ticket.cancelled ? 'status.alignmentCancelled' : 'status.alignmentFailed';
        progress({ phase: 'alignment-error', alignmentErrorKey });
        return { ...readyResult, cached: usedCachedText, seconds: usedCachedText ? 0 : readySeconds,
          model: this.activeModel, alignmentErrorKey };
      }
      if (!ticket.cancelled) {
        this.lastReadyAt = 0;
        this.publish({ message: error.message, messageKey: error.messageKey, messageArgs: error.messageArgs });
      }
      throw error;
    } finally {
      this.busy = false; this.translationReady = false;
      if (this.activeTicket === ticket) this.activeTicket = null;
      if (!this.quitting && !this.loggingOut && this.window && !this.window.isDestroyed() && this.tickets.size <= 1) this.prewarm();
    }
  }
  async cancel(id) {
    const targets = id === undefined ? [...this.tickets.values()] : [this.tickets.get(id)].filter(Boolean);
    for (const ticket of targets) ticket.cancelled = true;
    const active = this.activeTicket;
    if (active && (id === undefined || active.id === id) && (active.sent || active.sendInFlight) && this.window && !this.window.isDestroyed()) {
      await this.call('stop').catch(() => {});
    }
    if (id === undefined) await this.turnTail.catch(() => {});
  }
  async logout() {
    this.loggingOut = true;
    try {
      await this.cancel();
      this.cache.clear(); await this.session.clearStorageData(); await this.session.clearCache();
      await this.window.loadURL(CHAT);
      return this.publish({ connected: false, loggedOut: true, needsLogin: true, model: null, efforts: [], messageKey: 'connection.logoutComplete', message: this.t('connection.logoutComplete') });
    } finally { this.loggingOut = false; }
  }
  close() { this.quitting = true; this.window?.destroy(); }
}
module.exports = { ChatBrowser, permitted };
