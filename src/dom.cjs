const upstream = require('../vendor/chatgpt-session.cjs');
const selectors = {
  composer: upstream.CHATGPT_COMPOSER_SELECTOR,
  modelControl: upstream.CHATGPT_EFFORT_CONTROL_SELECTOR,
  effortMenu: upstream.CHATGPT_EFFORT_MENU_SELECTOR,
  sliderContainer: upstream.CHATGPT_EFFORT_SLIDER_CONTAINER_SELECTOR,
  stop: upstream.CHATGPT_STOP_BUTTON_SELECTOR,
  assistant: upstream.CHATGPT_ASSISTANT_TURN_SELECTOR,
  user: upstream.CHATGPT_USER_TURN_SELECTOR,
  completion: upstream.CHATGPT_COMPLETION_ACTION_SELECTOR,
  send: upstream.CHATGPT_SEND_BUTTON_SELECTOR,
};
// Runs only in this app's isolated ChatGPT browser. No page text is treated as code.
function createDOMAPI(S) {
  const visible = e => e instanceof HTMLElement && e.getClientRects().length > 0
    && !e.closest('[hidden], [aria-hidden="true"]') && getComputedStyle(e).visibility !== 'hidden';
  const all = (selector, scope = document) => [...scope.querySelectorAll(selector)].filter(visible);
  const unique = elements => elements.length === 1 ? elements[0] : null;
  const label = e => (e?.innerText || e?.getAttribute('aria-label') || e?.textContent || '').replace(/\s+/g, ' ').trim();
  const composer = () => unique(all(S.composer));
  const form = () => composer()?.closest('form');
  const control = () => unique(all(S.modelControl, form() || document))
    || unique(all('button[data-testid="model-switcher-dropdown-button"]'));
  const menuAssociation = () => {
    const owner = control();
    if (!owner) return null;
    const id = owner.getAttribute('aria-controls');
    if (id) return { element: document.getElementById(id) };
    if (!owner.id) return null;
    const labelled = [...document.querySelectorAll('[role="menu"][aria-labelledby]')]
      .filter(e => e.getAttribute('aria-labelledby').split(/\s+/).includes(owner.id));
    return labelled.length ? { element: labelled.length === 1 ? labelled[0] : null } : null;
  };
  const menu = () => {
    const association = menuAssociation();
    if (association) return association.element && visible(association.element) ? association.element : null;
    return unique(all(S.effortMenu));
  };
  const effortScope = () => {
    const association = menuAssociation();
    if (association) return association.element && visible(association.element) ? association.element : null;
    return menu() || document;
  };
  const modelEvidence = () => {
    // Read selected model controls only; translation contents can never prove model identity.
    const scope = effortScope();
    const selected = scope ? [...scope.querySelectorAll('[role="menuitemradio"][aria-checked="true"]')] : [];
    const modelRows = selected.filter(e => /\b(?:GPT|Luna|Sol|Astra)\b/i.test(e.textContent || '')
      || e.hasAttribute('data-model-slug') || e.hasAttribute('data-model-id'));
    if (modelRows.length === 1) return label(modelRows[0]);
    const container = scope && unique(all(S.sliderContainer, scope));
    const slider = container?.querySelector('[role="slider"]');
    const owner = slider?.closest('[role="menuitem"]');
    const description = (owner?.getAttribute('aria-describedby') || '').split(/\s+/)
      .map(id => document.getElementById(id)?.textContent || '').find(s => /\b(?:GPT|Sol|Astra|Luna)\b/i.test(s));
    return description?.split(/[,，]/)[0].trim() || 'ChatGPT 웹';
  };
  const sliderState = () => {
    const scope = effortScope();
    if (!scope) return null;
    const container = unique(all(S.sliderContainer, scope));
    if (!container) return null;
    const slider = unique([...container.querySelectorAll('[role="slider"]')]);
    if (!slider) return null;
    const read = name => /^-?\d+$/.test(slider.getAttribute(name) || '') ? Number(slider.getAttribute(name)) : NaN;
    const min = read('aria-valuemin'), max = read('aria-valuemax'), value = read('aria-valuenow');
    if (![min, max, value].every(Number.isSafeInteger) || max - min > 7 || value < min || value > max) return null;
    const ticks = [...container.querySelectorAll('[data-selected]')];
    if (ticks.length !== max - min + 1) return null;
    const inlineReasoning = !!container.closest('[data-reasoning-slider="true"]');
    const track = unique([...container.querySelectorAll('[data-orientation="horizontal"][aria-disabled]')]);
    const reasoningRow = inlineReasoning ? container.closest('[data-reasoning-slider="true"]') : null;
    const disabled = slider.getAttribute('aria-disabled') === 'true'
      || track?.getAttribute('aria-disabled') === 'true'
      || track?.getAttribute('data-locked') === 'true'
      || reasoningRow?.getAttribute('aria-disabled') === 'true';
    const options = ticks.map((tick, index) => {
      const labels = [tick.getAttribute('aria-label'), tick.getAttribute('data-label'), tick.textContent]
        .filter(Boolean).map(s => s.replace(/\s+/g, ' ').trim());
      const key = `web-${index}`;
      const locked = tick.getAttribute('data-locked');
      const unlocked = locked === 'false'
        || locked === null && (inlineReasoning
          ? track?.getAttribute('aria-disabled') === 'false' && track?.getAttribute('data-locked') === 'false'
          : container.hasAttribute('data-model-picker-power-slider')
            && container.querySelector('[data-orientation="horizontal"][aria-disabled="false"]') !== null);
      return { key, label: labels[0] || '', index: min + index, enabled: !disabled && unlocked };
    });
    return { min, max, value, options, selected: options.find(o => o.index === value)?.key || null,
      requiresCaptionVerification: inlineReasoning };
  };
  const effortOptions = () => {
    const state = sliderState();
    if (state) return state.options.filter(o => o.key && o.enabled);
    const m = menu();
    if (m) {
      const radios = all('[role="menuitemradio"]', m)
        .filter(e => !/\b(?:GPT|Sol|Astra|Luna|Latest)\b/i.test(label(e)))
        .map((e, index) => ({ key: `web-${index}`, label: label(e), enabled: e.getAttribute('aria-disabled') !== 'true' && !e.disabled }));
      const options = radios.filter(o => o.key && o.enabled);
      if (options.length) return options;
    }
    const think = all('button[aria-pressed]', form() || document).filter(e => /^(Think|생각하기)$/i.test(label(e)));
    if (think.length === 1) return [{ key: 'standard', label: '기본', enabled: true }, { key: 'think', label: 'Think', enabled: true }];
    // Absence of verified controls is unknown, never a fabricated default effort.
    return [];
  };
  const selectedEffort = () => sliderState()?.selected
    || (() => { const scope = effortScope(); if (!scope) return null;
      const radios = all('[role="menuitemradio"]', scope)
        .filter(e => !/\b(?:GPT|Sol|Astra|Luna|Latest)\b/i.test(label(e)));
      const index = radios.findIndex(e => e.getAttribute('aria-checked') === 'true'); return index < 0 ? null : `web-${index}`; })()
    || (() => { const think = all('button[aria-pressed]', form() || document).filter(e => /^(Think|생각하기)$/i.test(label(e)));
      if (think.length === 1) return think[0].getAttribute('aria-pressed') === 'true' ? 'think' : 'standard';
      return null; })();
  const draftMatches = (element, expected) => {
    const target = expected.replace(/\r\n/g, '\n').trim();
    const actual = (element?.innerText || element?.textContent || '').replace(/\r\n/g, '\n').trim();
    const paragraphs = element ? [...element.childNodes] : [];
    if (paragraphs.length && paragraphs.every(node => node instanceof HTMLElement && node.tagName === 'P')) {
      const nodeText = node => node.nodeType === Node.TEXT_NODE ? node.textContent
        : node instanceof HTMLElement && node.tagName === 'BR' ? '\n'
          : [...node.childNodes].map(nodeText).join('');
      const canonical = paragraphs.map(p => p.childNodes.length === 1 && p.firstChild?.nodeName === 'BR' ? '' : nodeText(p)).join('\n').trim();
      if (canonical === target) return true;
    }
    // Lexical paragraph blocks have two layout line breaks in innerText for
    // each single input newline. Accept that exact projection, preserving all
    // source characters and rejecting unrelated edits or a stale draft.
    return actual === target || actual === target.replace(/\n/g, '\n\n');
  };
  return {
    inspect() { return { composerReady: !!composer(), model: modelEvidence(), selectedEffort: selectedEffort(),
      efforts: effortOptions(), slider: sliderState(), menuOpen: !!menu(), controlReady: !!control(), controlLabel: label(control()) }; },
    openModel() {
      if (menu()) return true;
      const e = control(); if (!e) return false;
      e.click(); return true;
    },
    pointerModel() {
      const e = control(); if (!e) return false;
      e.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, buttons: 1, pointerType: 'mouse', isPrimary: true })); return true;
    },
    expandModel() {
      const m = menu(); if (!m) return false;
      const toggle = unique(all('[data-model-picker-view-toggle="true"], [role="menuitem"][aria-expanded="false"]', m));
      if (toggle) { toggle.click(); return true; } return false;
    },
    chooseEffort(key) {
      const state = sliderState();
      if (state) {
        const target = state.options.find(o => o.key === key && o.enabled);
        if (!target) return { ok: false };
        const scope = effortScope();
        const container = scope && unique(all(S.sliderContainer, scope));
        const slider = container && unique([...container.querySelectorAll('[role="slider"]')]);
        if (!slider) return { ok: false };
        const owner = slider.closest('[role="menuitem"]') || slider;
        owner.focus(); return { ok: true, arrow: target.index > state.value ? 'Right' : 'Left', distance: Math.abs(target.index - state.value) };
      }
      const m = menu();
      const options = m && all('[role="menuitemradio"]', m).filter(e => !/\b(?:GPT|Sol|Astra|Luna|Latest)\b/i.test(label(e)));
      const option = options?.[Number(key.replace('web-', ''))];
      if (option?.getAttribute('aria-disabled') === 'true') return { ok: false };
      if (option) { option.click(); return { ok: true, distance: 0 }; }
      const think = unique(all('button[aria-pressed]', form() || document).filter(e => /^(Think|생각하기)$/i.test(label(e))));
      if (think && ['standard', 'think'].includes(key)) {
        if ((think.getAttribute('aria-pressed') === 'true') !== (key === 'think')) think.click();
        return { ok: true, distance: 0 };
      }
      return { ok: false };
    },
    focusComposer() {
      const e = composer(); if (!e || e.textContent?.trim()) return false;
      e.focus(); return true;
    },
    draftStatus(expected) {
      const e = composer(), f = form();
      const actual = (e?.innerText || e?.textContent || '').replace(/\r\n/g, '\n').trim();
      const button = f && unique(all(S.send, f));
      return { chars: actual.length, matches: draftMatches(e, expected),
        submitters: f ? all(S.send, f).length : 0, enabled: !!button && !button.disabled && button.getAttribute('aria-disabled') !== 'true' };
    },
    send(expected) {
      const e = composer(), f = form();
      if (!e || !f || !draftMatches(e, expected)) return false;
      const button = unique(all(S.send, f));
      if (!button || button.disabled || button.getAttribute('aria-disabled') === 'true') return false;
      button.click(); return true;
    },
    stop() { const e = unique(all(S.stop)); if (e) e.click(); return !!e; },
    response() {
      const roots = all(S.assistant);
      const root = roots.at(-1);
      if (!root) return { text: '', complete: false, users: all(S.user).length };
      // Select final answer blocks, excluding cot/reasoning and commentary blocks.
      const blocks = all('[data-message-author-role="assistant"] .markdown, [data-conversation-role="assistant"] .markdown, .markdown, [data-markdown-text-style]', root)
        .filter(e => !e.closest('[data-testid*="cot"], [data-testid*="thought"], [data-testid*="reason"], [data-message-channel="analysis"], [data-message-channel="commentary"], [data-conversation-role="commentary"]'));
      const firstStatus = all('[data-streaming-response-status]', root)[0];
      const answers = blocks.filter(e => !e.closest('[data-streaming-response-status]')
        && !(firstStatus && (e.compareDocumentPosition(firstStatus) & Node.DOCUMENT_POSITION_FOLLOWING)));
      const top = answers.filter(e => !answers.some(other => other !== e && other.contains(e)));
      const text = top.map(e => e.innerText).join('\n\n').trim();
      const codes = top.flatMap(e => [...e.querySelectorAll('pre code')]);
      const protocol = codes.length === 1 && codes[0].textContent.trim().startsWith('{') ? codes[0].textContent : null;
      const html = top.map(e => {
        const clone = e.cloneNode(true);
        clone.querySelectorAll('button, script, style, svg, [aria-hidden="true"], .sr-only, [data-code-block-preview-pane]').forEach(e => e.remove());
        clone.querySelectorAll('pre, [data-markdown-copy="code-block"]').forEach(block => {
          const codes = block.querySelectorAll('code');
          if (codes.length === 1) {
            const code = codes[0].cloneNode(true), pre = document.createElement('pre');
            pre.append(code); block.replaceWith(pre);
          }
        });
        return clone.innerHTML;
      }).join('\n');
      const last = top.at(-1);
      const completion = last && all(S.completion, root).some(e => !last.contains(e)
        && !!(last.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING));
      const stops = all(S.stop).length;
      const errorNodes = all('[role="alert"], [data-testid="conversation-turn-error"]', root);
      const dialogs = all('[role="dialog"]').filter(e => /(?:limit|quota|too many|한도|제한)/i.test(e.innerText));
      return { text, html, protocol, complete: !!completion && !stops, users: all(S.user).length,
        error: [...errorNodes, ...dialogs].map(e => e.innerText.trim()).filter(Boolean).join('\n').slice(0, 700) };
    },
  };
}
function installScript() {
  return `globalThis.__lunaTranslate = (${createDOMAPI.toString()})(${JSON.stringify(selectors)});`;
}
module.exports = { createDOMAPI, selectors, installScript };
