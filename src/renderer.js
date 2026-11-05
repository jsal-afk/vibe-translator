const $ = id => document.getElementById(id);
const api = window.luna;
const I18n = window.VibeI18n;
const Targets = window.VibeTargets;
const LanguagePolicy = window.VibeLanguagePolicy;
const linkedEditors = new LinkedEditors($('input'), $('output'));
const autocomplete = {};
let uiLanguage = 'en', uiLanguageExplicit = false, systemLanguage = 'en';
let currentAlignment = null, alignedSource = null, alignedTarget = null, currentSourceLanguage = null, mappingPending = false;
let connection = { connected: false, efforts: [] };
let busy = false, requestId = null, isWindows = false, preferences = { targetLanguage: 'auto', effort: 'web-0', alwaysOnTop: false, tone: '', context: '' };
let targetDialogMode = null, targetBeforeDialog = 'auto', initialized = false;
let currentStatus = { key: 'status.initial', args: undefined, error: false, raw: null };
let resultStateKey = null, resultMetaKind = null, resultSeconds = 0;
let stageState = null, activeRequestText = null, loginPrompted = false;

const t = (key, args) => I18n.t(uiLanguage, key, args);
function renderStatus() {
  $('status').textContent = currentStatus.raw === null ? t(currentStatus.key, currentStatus.args) : currentStatus.raw;
  $('status').classList.toggle('error', currentStatus.error);
}
function renderStage() {
  const indicator = $('stage-indicator');
  indicator.hidden = !stageState;
  indicator.textContent = stageState ? t(`stage.${stageState}`) : '';
}
function setStage(value) {
  stageState = value;
  renderStage();
}
function renderResultDetails() {
  $('result-state').textContent = resultStateKey ? t(resultStateKey) : '';
  $('result-meta').textContent = resultMetaKind === 'cached' ? t('result.cached') : resultMetaKind === 'duration'
    ? t('result.duration', { seconds: new Intl.NumberFormat(uiLanguage, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(resultSeconds) }) : '';
}
function setResultState(key) { resultStateKey = key; renderResultDetails(); }
function setResultMeta(kind, seconds = 0) { resultMetaKind = kind; resultSeconds = seconds; renderResultDetails(); }
function renderCharacterCount() {
  $('character-count').textContent = t('input.characters', { count: $('input').value.length, max: 24000 });
}
function status(key, error = false, args) {
  currentStatus = { key, args, error, raw: null };
  renderStatus();
}
function rawStatus(text, error = false) {
  currentStatus = { key: null, args: undefined, error, raw: String(text || '') };
  renderStatus();
}
function messageText(value) {
  return value?.messageKey ? t(value.messageKey, value.messageArgs) : value?.message || '';
}
function errorText(value) {
  return value?.errorKey ? t(value.errorKey, value.errorArgs) : value?.error || value?.message || '';
}
function errorStatus(value, cancelled = false) {
  const key = value?.errorKey || value?.messageKey;
  if (key) status(key, !cancelled, value.errorArgs || value.messageArgs);
  else rawStatus(errorText(value) || value?.message || value, !cancelled);
}
function applyStaticTranslations() {
  for (const element of document.querySelectorAll('[data-i18n]')) element.textContent = t(element.dataset.i18n);
  for (const element of document.querySelectorAll('[data-i18n-placeholder]')) element.placeholder = t(element.dataset.i18nPlaceholder);
  for (const element of document.querySelectorAll('[data-i18n-title]')) element.title = t(element.dataset.i18nTitle);
  for (const element of document.querySelectorAll('[data-i18n-aria-label]')) element.setAttribute('aria-label', t(element.dataset.i18nAriaLabel));
  document.documentElement.lang = uiLanguage;
  document.title = t('app.name');
  $('app-name').textContent = t('app.name');
  const selected = $('ui-language').value;
  $('ui-language').replaceChildren();
  for (const locale of LanguagePolicy.uiLocales) {
    const option = document.createElement('option');
    option.value = locale; option.textContent = t(`uiLanguage.name.${locale}`);
    $('ui-language').append(option);
  }
  $('ui-language').value = selected || uiLanguage;
  $('tone').replaceChildren();
  for (const preset of BaroTone.presets) {
    const option = document.createElement('option');
    option.value = preset.key; option.textContent = t(preset.labelKey);
    $('tone').append(option);
  }
  const tone = preferences.tone || '';
  $('tone').value = BaroTone.presets.some(preset => preset.key === tone) ? tone : '';
  if ($('target-language').value) setMainTarget(targetValue($('target-language')));
  renderResultDetails(); renderCharacterCount(); renderStatus(); renderStage();
}
function targetValue(field) {
  const value = field.value.trim();
  if (!value || value === t('target.auto')) return 'auto';
  const translatedName = Targets.entries.find(entry => entry.key && value === t(entry.key));
  return translatedName ? translatedName.target : Targets.canonicalize(value);
}
function targetLabel(value) {
  if (value === 'auto') return t('target.auto');
  const entry = Targets.entries.find(item => item.target === value);
  return entry?.key ? t(entry.key) : value;
}
function setMainTarget(value) { $('target-language').value = targetLabel(value); }
function syncPreferenceTarget() {
  preferences.targetLanguage = targetValue($('target-language'));
}
function refreshControls() {
  const activeRequest = requestId !== null, canStop = activeRequest && busy;
  $('translate').disabled = !activeRequest && (!initialized || connection.needsLogin || connection.loggedOut || !$('input').value.trim());
  $('translate').classList.toggle('busy', canStop);
  $('translate-label').textContent = t(canStop ? 'action.stop' : 'action.translate');
  $('target-language').disabled = busy || !initialized;
  $('ui-language').disabled = !initialized;
  $('tone').disabled = busy || !initialized; $('tone-context').disabled = busy || !initialized;
  $('effort').disabled = busy || !connection.efforts?.length;
  $('logout').disabled = activeRequest;
  $('swap').disabled = busy || !$('output').value;
  $('copy').disabled = !$('output').value;
}
function renderConnection(value, useMinimum = false) {
  connection = value || { connected: false, efforts: [] };
  const recovering = !connection.connected && Boolean(connection.recovering);
  $('connection-dot').classList.toggle('connected', connection.connected);
  $('connection-dot').classList.toggle('connecting', recovering);
  $('connection-label').textContent = t(connection.connected ? 'connection.connected' : recovering ? 'connection.connecting' : 'connection.disconnected');
  $('connection-detail').textContent = messageText(connection);
  if (connection.connected || connection.loggedOut) loginPrompted = false;
  else if (connection.needsLogin && !loginPrompted) {
    loginPrompted = true;
    void api.invoke('show-login', { loginOnly: true }).catch(error => {
      if (!requestId) rawStatus(errorText(error) || error.message, true);
    });
  }
  const previous = $('effort').value || preferences.effort;
  $('effort').replaceChildren();
  const efforts = Array.isArray(connection.efforts) ? connection.efforts : [];
  const options = efforts.length ? efforts : [{ key: 'web-0', label: t('reasoning.placeholder') }];
  for (const option of options) {
    const element = document.createElement('option'); element.value = option.key;
    // Keep ChatGPT's reasoning labels verbatim; they are web-provided names.
    element.textContent = option.label; $('effort').append(element);
  }
  if (!useMinimum && options.some(option => option.key === previous)) $('effort').value = previous;
  if (useMinimum) $('effort').value = options[0].key;
  if (!requestId && !resultStateKey && !stageState) {
    if (connection.connected) status('status.ready');
    else if (connection.messageKey) status(connection.messageKey);
    else if (connection.message) rawStatus(connection.message, Boolean(connection.error));
    else status(connection.recovering ? 'connection.connecting' : connection.needsLogin ? 'status.initial' : 'connection.disconnected');
  }
  refreshControls();
}
function updateInput() {
  const text = $('input').value;
  if (requestId && text !== activeRequestText) {
    const id = requestId;
    const translationReady = mappingPending || resultStateKey === 'result.complete';
    requestId = null; activeRequestText = null; busy = false; mappingPending = false;
    void cancelRequest(id);
    if (!translationReady) {
      $('output').value = ''; setResultMeta(null); setResultState(null);
      currentAlignment = null; alignedSource = alignedTarget = null; currentSourceLanguage = null; linkedEditors.clear();
      setStage(null); status(connection.connected ? 'status.ready' : 'status.initial');
    } else {
      setStage($('output').value ? 'done' : null);
    }
  }
  if (alignedSource !== null && text !== alignedSource) {
    currentAlignment = null; alignedSource = alignedTarget = null; currentSourceLanguage = null; linkedEditors.clear();
    if (text.trim() && $('output').value) {
      setResultState('result.sourceChanged'); setResultMeta(null);
      status('status.pleaseTranslateAgain');
    }
  }
  if (!text.trim()) {
    const hadResult = $('output').value || $('result-meta').textContent || $('result-state').textContent;
    $('output').value = ''; setResultMeta(null); setResultState(null);
    currentAlignment = null; alignedSource = alignedTarget = null; currentSourceLanguage = null;
    requestId = null; activeRequestText = null; busy = false; mappingPending = false; linkedEditors.clear();
    setStage(null);
    if (hadResult) status(connection.connected ? 'status.ready' : 'status.initial');
  }
  renderCharacterCount();
  linkedEditors.refresh();
  refreshControls();
}
async function savePreferences() {
  syncPreferenceTarget();
  preferences = {
    targetLanguage: preferences.targetLanguage,
    effort: $('effort').value || preferences.effort,
    alwaysOnTop: $('pin').checked,
    tone: $('tone').value,
    context: $('tone-context').value.trim(),
  };
  try {
    const saved = await api.invoke('preferences', { ...preferences, uiLanguage: uiLanguageExplicit ? uiLanguage : null });
    preferences = { ...preferences, ...saved };
    uiLanguage = saved.uiLanguage; uiLanguageExplicit = saved.uiLanguageExplicit;
    applyStaticTranslations();
    setMainTarget(preferences.targetLanguage);
    renderConnection(connection);
  } catch (error) { rawStatus(errorText(error) || error.message, true); }
}
function updateAutocomplete(state) {
  const raw = state.field.value.trim();
  const query = raw === t('target.auto') ? 'auto' : raw;
  state.items = query ? Targets.suggestions(query, t) : [];
  state.active = -1;
  state.list.replaceChildren();
  for (const [index, item] of state.items.entries()) {
    const option = document.createElement('li');
    option.id = `${state.list.id}-option-${index}`;
    option.setAttribute('role', 'option'); option.setAttribute('aria-selected', 'false');
    option.textContent = item.label;
    option.addEventListener('mousedown', event => event.preventDefault());
    option.addEventListener('click', () => chooseSuggestion(state, item));
    state.list.append(option);
  }
  if (query && !state.items.length) {
    const empty = document.createElement('li');
    empty.className = 'suggestion-empty'; empty.setAttribute('role', 'presentation');
    empty.textContent = t('target.noSuggestions'); state.list.append(empty);
  }
  state.open = Boolean(query);
  state.list.hidden = !state.open;
  state.field.setAttribute('aria-expanded', String(state.open));
  state.field.removeAttribute('aria-activedescendant');
}
function closeAutocomplete(state) {
  state.open = false; state.active = -1; state.list.hidden = true;
  state.field.setAttribute('aria-expanded', 'false');
  state.field.removeAttribute('aria-activedescendant');
}
function chooseSuggestion(state, item) {
  state.field.value = item.label;
  closeAutocomplete(state);
  if (state.field.id === 'target-language') {
    preferences.targetLanguage = item.value;
    void savePreferences();
  } else $('target-language').value = item.label;
}
function moveSuggestion(state, delta) {
  if (!state.items.length) return;
  state.open = true; state.list.hidden = false;
  state.active = (state.active + delta + state.items.length) % state.items.length;
  for (const [index, option] of [...state.list.querySelectorAll('[role="option"]')].entries()) {
    option.setAttribute('aria-selected', String(index === state.active));
  }
  state.field.setAttribute('aria-expanded', 'true');
  state.field.setAttribute('aria-activedescendant', `${state.list.id}-option-${state.active}`);
}
function setupAutocomplete(fieldId, listId) {
  const state = { field: $(fieldId), list: $(listId), items: [], active: -1, open: false };
  autocomplete[fieldId] = state;
  state.field.addEventListener('focus', () => updateAutocomplete(state));
  state.field.addEventListener('input', () => {
    updateAutocomplete(state);
    if (fieldId === 'target-language') syncPreferenceTarget();
    else $('target-language').value = state.field.value;
  });
  state.field.addEventListener('change', () => {
    if (fieldId === 'target-language') void savePreferences();
  });
  state.field.addEventListener('blur', () => closeAutocomplete(state));
  state.field.addEventListener('keydown', event => {
    if (event.isComposing || event.keyCode === 229) return;
    if (event.key === 'ArrowDown') { moveSuggestion(state, 1); event.preventDefault(); return; }
    if (event.key === 'ArrowUp') { moveSuggestion(state, -1); event.preventDefault(); return; }
    if (event.key === 'Escape') {
      if (state.open) { closeAutocomplete(state); event.preventDefault(); event.stopPropagation(); }
      else if (fieldId === 'dialog-target-language') { closeTargetDialog(false); event.preventDefault(); event.stopPropagation(); }
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault(); event.stopPropagation();
      if (state.open && state.items.length) chooseSuggestion(state, state.items[state.active < 0 ? 0 : state.active]);
      else if (fieldId === 'dialog-target-language') acceptTargetDialog();
    }
  });
}
function openTargetDialog(mode) {
  targetDialogMode = mode;
  targetBeforeDialog = targetValue($('target-language'));
  const reverse = mode === 'reverse';
  $('target-dialog-title').textContent = t(reverse ? 'target.reverseTitle' : 'target.dialogTitle');
  $('target-dialog-description').textContent = t(reverse ? 'target.reverseDescription' : 'target.dialogDescription');
  const label = t(reverse ? 'target.reverseTitle' : 'target.label');
  $('dialog-target-label').textContent = label;
  $('dialog-target-language').setAttribute('aria-label', label);
  $('target-dialog-accept').textContent = t(reverse ? 'target.reverseAccept' : 'target.accept');
  $('dialog-target-language').value = '';
  closeAutocomplete(autocomplete['dialog-target-language']);
  $('target-dialog').showModal();
  $('dialog-target-language').focus();
}
function closeTargetDialog(committed) {
  if (!committed) setMainTarget(targetBeforeDialog);
  if ($('target-dialog').open) $('target-dialog').close();
  targetDialogMode = null;
}
function acceptTargetDialog() {
  if (!targetDialogMode) return;
  const target = targetValue($('dialog-target-language'));
  if (target === 'auto') { status('status.targetRequired', true); return; }
  const mode = targetDialogMode;
  closeTargetDialog(true);
  if (mode === 'translate') {
    preferences.targetLanguage = target;
    setMainTarget(target);
    void savePreferences().then(() => translate());
  } else void performSwap(target, targetBeforeDialog);
}
function outputLanguageForAutoSwap(target, sourceLanguage) {
  if (target !== 'auto') return target;
  if (LanguagePolicy.isEnglishSystemLanguage(systemLanguage)) return 'English';
  const sourceName = Targets.canonicalize(sourceLanguage || '').replace(/\s*\([^)]*\)/g, '').toLowerCase();
  const systemBase = Targets.canonicalize(LanguagePolicy.baseLanguageName(systemLanguage)).replace(/\s*\([^)]*\)/g, '').toLowerCase();
  return sourceName === systemBase ? 'English' : LanguagePolicy.languageName(systemLanguage);
}
async function performSwap(reverseTarget, oldTarget = null) {
  if (busy || !$('output').value) return;
  if ($('output').value.length > 24000) { status('error.outputTooLong', true, { count: 24000 }); return; }
  const oldInput = $('input').value, oldOutput = $('output').value;
  const previousTarget = oldTarget ?? targetValue($('target-language'));
  const nextSourceLanguage = outputLanguageForAutoSwap(previousTarget, currentSourceLanguage || reverseTarget);
  if (requestId && mappingPending) {
    const id = requestId;
    requestId = null; activeRequestText = null; mappingPending = false;
    void cancelRequest(id);
    setStage('done');
  }
  const reversed = BaroAlignment.invert(currentAlignment, oldOutput);
  $('input').value = oldOutput; $('output').value = oldInput;
  currentSourceLanguage = nextSourceLanguage;
  preferences.targetLanguage = reverseTarget;
  setMainTarget(reverseTarget);
  currentAlignment = reversed; alignedSource = reversed ? $('input').value : null; alignedTarget = reversed ? $('output').value : null;
  linkedEditors.setAlignment(reversed, alignedSource, alignedTarget);
  $('input').scrollTop = 0; $('output').scrollTop = 0; linkedEditors.refresh();
  requestId = null; activeRequestText = null; busy = false; mappingPending = false;
  setResultMeta(null); setResultState(null);
  updateInput();
  status(connection.connected ? 'status.ready' : 'status.initial');
  $('input').focus();
  await savePreferences();
}
async function swap() {
  if (busy || !$('output').value) return;
  if ($('output').value.length > 24000) { status('error.outputTooLong', true, { count: 24000 }); return; }
  if (!currentSourceLanguage) { openTargetDialog('reverse'); return; }
  await performSwap(currentSourceLanguage);
}
function cancelRequest(id) {
  void api.invoke('cancel', { id }).catch(error => {
    if (!requestId) rawStatus(errorText(error) || error.message, true);
  });
}
async function translate() {
  if (requestId && busy) {
    const id = requestId, translationReady = mappingPending || resultStateKey === 'result.complete';
    requestId = null; activeRequestText = null; busy = false; mappingPending = false;
    void cancelRequest(id);
    if (translationReady) {
      setStage('done'); status('status.alignmentCancelled');
    } else {
      if ($('output').value) setResultState('result.incomplete');
      setStage(null); status('status.cancelling');
    }
    refreshControls();
    return;
  }
  if (requestId) {
    const id = requestId;
    requestId = null; activeRequestText = null; mappingPending = false;
    void cancelRequest(id);
  }
  if (!initialized) return;
  const text = $('input').value;
  if (connection.needsLogin || connection.loggedOut || !text.trim()) return;
  const targetLanguage = targetValue($('target-language'));
  preferences.targetLanguage = targetLanguage;
  if (LanguagePolicy.targetSelectionRequired(text, targetLanguage, systemLanguage)) {
    openTargetDialog('translate'); return;
  }
  mappingPending = false; currentAlignment = null; alignedSource = alignedTarget = null; currentSourceLanguage = null; linkedEditors.clear();
  const id = crypto.randomUUID();
  requestId = id; activeRequestText = text; busy = true;
  setStage('translating');
  refreshControls();
  $('output').value = ''; setResultMeta(null); setResultState(null); linkedEditors.refresh();
  status('status.translating');
  try {
    const result = await api.invoke('translate', {
      id, text, targetLanguage, effort: $('effort').value || preferences.effort,
      tone: $('tone').value, context: $('tone-context').value.trim(),
    });
    if (id !== requestId) return;
    if (result.requiresTarget) {
      busy = false; mappingPending = false; setStage(null); refreshControls(); openTargetDialog('translate'); return;
    }
    if (result.error) {
      errorStatus(result, result.cancelled);
      setStage(null);
      setResultState($('output').value ? 'result.incomplete' : null);
    } else {
      if (typeof result.text === 'string' && $('output').value !== result.text) applyTranslation(result);
      const alignment = Array.isArray(result.groups) || Array.isArray(result.links) || Array.isArray(result.sourceWords) ? result : null;
      if (alignment) applyAlignment({ ...alignment, sourceLanguage: result.sourceLanguage || alignment.sourceLanguage });
      if (result.alignmentErrorKey) {
        mappingPending = false; setStage('done');
        status(result.alignmentErrorKey, result.alignmentErrorKey === 'status.alignmentFailed');
      } else if (typeof result.text === 'string') {
        mappingPending = false; setStage('done');
        if (!alignment) status('status.success');
      }
    }
  } catch (error) {
    if (id !== requestId) return;
    errorStatus(error);
    setStage(null);
    setResultState($('output').value ? 'result.incomplete' : null);
  } finally {
    if (id === requestId) {
      busy = false; mappingPending = false; activeRequestText = null; requestId = null;
      if (resultStateKey === 'result.complete') setStage('done');
      else if (resultStateKey !== 'result.incomplete') setStage(null);
      refreshControls();
    }
  }
}
function applyTranslation(result) {
  $('output').value = result.text;
  if (typeof result.sourceLanguage === 'string' && result.sourceLanguage.trim()) currentSourceLanguage = result.sourceLanguage;
  currentAlignment = null;
  alignedSource = activeRequestText ?? $('input').value;
  alignedTarget = result.text;
  linkedEditors.clear(); linkedEditors.refresh();
  setResultMeta(result.cached ? 'cached' : 'duration', result.seconds || 0);
  setResultState('result.complete'); status('status.success');
  refreshControls();
}
function applyAlignment(result) {
  if (typeof result.sourceLanguage === 'string' && result.sourceLanguage.trim()) currentSourceLanguage = result.sourceLanguage;
  const previous = currentAlignment || {};
  currentAlignment = {
    links: Array.isArray(result.links) ? result.links : previous.links || [],
    groups: Array.isArray(result.groups) ? result.groups : previous.groups || [],
    sourceWords: Array.isArray(result.sourceWords) ? result.sourceWords : previous.sourceWords || [],
  };
  alignedSource = activeRequestText ?? $('input').value;
  alignedTarget = $('output').value;
  linkedEditors.setAlignment(currentAlignment, alignedSource, alignedTarget);
  mappingPending = false; setStage('done'); refreshControls();
}
function toggleSettings(show) { $('settings').hidden = show === undefined ? !$('settings').hidden : !show; }
async function paste(text) {
  try {
    const value = text ?? await api.invoke('clipboard-read');
    if (value.length > 24000) { status('error.clipboardTooLong', true, { count: 24000 }); return; }
    $('input').value = value; updateInput(); $('input').focus();
  } catch (error) { rawStatus(error.message, true); }
}
async function copy() {
  if (!$('output').value) return;
  try {
    await api.invoke('clipboard-write', $('output').value);
    status(resultStateKey === 'result.incomplete' ? 'status.copiedIncomplete' : 'status.copied');
  } catch (error) { rawStatus(error.message, true); }
}

setupAutocomplete('target-language', 'target-suggestions');
setupAutocomplete('dialog-target-language', 'dialog-target-suggestions');
$('input').addEventListener('input', updateInput);
$('translate').addEventListener('click', () => void translate());
$('effort').addEventListener('change', () => void savePreferences());
$('pin').addEventListener('change', () => void savePreferences());
$('tone').addEventListener('change', () => void savePreferences());
$('tone-context').addEventListener('change', () => void savePreferences());
$('ui-language').addEventListener('change', async () => {
  const target = targetValue($('target-language'));
  uiLanguage = $('ui-language').value; uiLanguageExplicit = true;
  applyStaticTranslations(); setMainTarget(target);
  await savePreferences();
});
$('copy').addEventListener('click', () => void copy());
$('paste').addEventListener('click', () => void paste());
$('clear').addEventListener('click', () => { $('input').value = ''; updateInput(); $('input').focus(); });
$('swap').addEventListener('click', () => void swap());
$('settings-toggle').addEventListener('click', () => toggleSettings());
$('connection-button').addEventListener('click', () => toggleSettings(true));
$('settings-close').addEventListener('click', () => toggleSettings(false));
$('login').addEventListener('click', () => api.invoke('show-login'));
$('logout').addEventListener('click', async () => {
  try { renderConnection(await api.invoke('logout')); toggleSettings(true); }
  catch (error) { errorStatus(error); }
});
$('target-dialog-accept').addEventListener('click', acceptTargetDialog);
$('target-dialog-cancel').addEventListener('click', () => closeTargetDialog(false));
$('target-dialog').addEventListener('cancel', event => { event.preventDefault(); closeTargetDialog(false); });
document.addEventListener('keydown', event => {
  if (event.isComposing || event.keyCode === 229) return;
  if (event.target === $('input') && event.key === 'Enter') {
    if (event.shiftKey) return;
    event.preventDefault();
    if (!busy && !event.repeat) void translate();
    return;
  }
  const shortcutModifier = isWindows ? event.ctrlKey : event.metaKey;
  if (shortcutModifier && event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void translate(); }
  if (shortcutModifier && event.shiftKey && event.key.toLowerCase() === 'c') { event.preventDefault(); void copy(); }
  if (event.key === 'Escape' && !$('settings').hidden && !$('target-dialog').open) toggleSettings(false);
});
api.on('connection-state', value => renderConnection(value));
api.on('translation-progress', value => {
  if (value.id !== requestId) return;
  if (typeof value.sourceLanguage === 'string' && value.sourceLanguage.trim()) currentSourceLanguage = value.sourceLanguage;
  if (value.phase === 'streaming') {
    busy = true; setStage('translating');
    if (typeof value.text === 'string') {
      const output = $('output'), active = document.activeElement;
      const selecting = [$('input'), output].includes(active) && active.selectionStart !== active.selectionEnd;
      const follow = !selecting && output.scrollHeight - output.clientHeight - output.scrollTop <= 2;
      output.value = value.text; linkedEditors.refresh(); refreshControls();
      if (follow) { output.scrollTop = output.scrollHeight; linkedEditors.scroll(output); }
    }
    return;
  }
  if (value.phase === 'translated') {
    busy = false; mappingPending = true; applyTranslation(value); setStage('aligning'); refreshControls(); return;
  }
  if (value.phase === 'aligning') {
    busy = false; mappingPending = true; setStage('aligning'); refreshControls(); return;
  }
  if (value.phase === 'alignment') {
    applyAlignment(value); status('status.success');
    requestId = null; activeRequestText = null; busy = false; mappingPending = false; refreshControls(); return;
  }
  if (value.phase === 'alignment-error') {
    busy = false; mappingPending = false; setStage($('output').value ? 'done' : null);
    status(value.alignmentErrorKey || 'status.alignmentFailed', value.alignmentErrorKey === 'status.alignmentFailed');
    requestId = null; activeRequestText = null; refreshControls(); return;
  }
  if (mappingPending) return;
  if (value.text !== undefined) {
    const output = $('output'), active = document.activeElement;
    const selecting = [$('input'), output].includes(active) && active.selectionStart !== active.selectionEnd;
    const follow = !selecting && output.scrollHeight - output.clientHeight - output.scrollTop <= 2;
    output.value = value.text; linkedEditors.refresh();
    if (follow) { output.scrollTop = output.scrollHeight; linkedEditors.scroll(output); }
    refreshControls();
  }
  if (value.messageKey) status(value.messageKey, false, value.messageArgs);
  else if (value.message) rawStatus(value.message);
});
api.on('clipboard-import', value => { void paste(value); });
api.invoke('state').then(value => {
  isWindows = value.platform === 'win32';
  systemLanguage = LanguagePolicy.systemLanguage(value.systemLanguage);
  uiLanguage = value.uiLanguage;
  uiLanguageExplicit = value.uiLanguageExplicit;
  initialized = true;
  document.documentElement.dataset.platform = value.platform;
  $('copy-shortcut').textContent = isWindows ? 'Ctrl+Shift+C' : '⌘ ⇧ C';
  $('toggle-shortcut').textContent = isWindows ? 'Alt+Shift+L' : '⌥ ⇧ L';
  $('paste-shortcut').textContent = isWindows ? 'Alt+Shift+T' : '⌥ ⇧ T';
  preferences = value.preferences;
  $('pin').checked = preferences.alwaysOnTop;
  $('tone-context').value = preferences.context || '';
  applyStaticTranslations(); setMainTarget(preferences.targetLanguage);
  // Each launch starts with the verified minimum web reasoning option.
  renderConnection(value.connection, true);
  updateInput();
  if (!value.shortcuts.toggle || !value.shortcuts.paste) {
    status(isWindows ? 'status.shortcutConflictWindows' : 'status.shortcutConflictMac');
  }
});
window.addEventListener('online', () => { void api.invoke('ensure-ready').catch(() => {}); });
