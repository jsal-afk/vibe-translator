"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// ../../work/upstream/src/chatgpt-session.ts
var chatgpt_session_exports = {};
__export(chatgpt_session_exports, {
  CHATGPT_ASSISTANT_TURN_SELECTOR: () => CHATGPT_ASSISTANT_TURN_SELECTOR,
  CHATGPT_COMPLETION_ACTION_SELECTOR: () => CHATGPT_COMPLETION_ACTION_SELECTOR,
  CHATGPT_COMPOSER_SELECTOR: () => CHATGPT_COMPOSER_SELECTOR,
  CHATGPT_EFFORT_CONTROL_SELECTOR: () => CHATGPT_EFFORT_CONTROL_SELECTOR,
  CHATGPT_EFFORT_ITEM_SELECTOR: () => CHATGPT_EFFORT_ITEM_SELECTOR,
  CHATGPT_EFFORT_MENU_SELECTOR: () => CHATGPT_EFFORT_MENU_SELECTOR,
  CHATGPT_EFFORT_SLIDER_CONTAINER_SELECTOR: () => CHATGPT_EFFORT_SLIDER_CONTAINER_SELECTOR,
  CHATGPT_EFFORT_SLIDER_MAX_OPTIONS: () => CHATGPT_EFFORT_SLIDER_MAX_OPTIONS,
  CHATGPT_EFFORT_SLIDER_SELECTOR: () => CHATGPT_EFFORT_SLIDER_SELECTOR,
  CHATGPT_SAVED_CHAT_URL: () => CHATGPT_SAVED_CHAT_URL,
  CHATGPT_SEND_BUTTON_SELECTOR: () => CHATGPT_SEND_BUTTON_SELECTOR,
  CHATGPT_STOP_BUTTON_SELECTOR: () => CHATGPT_STOP_BUTTON_SELECTOR,
  CHATGPT_TEMPORARY_CHAT_URL: () => CHATGPT_TEMPORARY_CHAT_URL,
  CHATGPT_USER_TURN_SELECTOR: () => CHATGPT_USER_TURN_SELECTOR,
  activateChatGptEffortMenu: () => activateChatGptEffortMenu,
  assertAuthenticatedChatGptPage: () => assertAuthenticatedChatGptPage,
  assertNewChatPage: () => assertNewChatPage,
  assertTemporaryChatPage: () => assertTemporaryChatPage,
  chatGptAssistantTurnSelector: () => chatGptAssistantTurnSelector,
  chatGptEffortMenuForControl: () => chatGptEffortMenuForControl,
  chatGptEffortSlider: () => chatGptEffortSlider,
  chatGptNewChatUrl: () => chatGptNewChatUrl,
  detectChatGptAccountCapabilities: () => detectChatGptAccountCapabilities,
  parseChatGptEffortSliderState: () => parseChatGptEffortSliderState,
  readChatGptEffortSnapshot: () => readChatGptEffortSnapshot
});
module.exports = __toCommonJS(chatgpt_session_exports);
var CHATGPT_TEMPORARY_CHAT_URL = "https://chatgpt.com/?temporary-chat=true";
var CHATGPT_SAVED_CHAT_URL = "https://chatgpt.com/";
function chatGptNewChatUrl(useSavedChats = false) {
  return useSavedChats ? CHATGPT_SAVED_CHAT_URL : CHATGPT_TEMPORARY_CHAT_URL;
}
var CHATGPT_COMPOSER_SELECTOR = [
  '[data-testid="prompt-textarea"]',
  "#prompt-textarea",
  '[contenteditable="true"][data-lexical-editor="true"]',
  'form[data-chatgpt-composer] [data-composer-markdown][contenteditable="true"][role="textbox"]'
].join(", ");
var CHATGPT_EFFORT_CONTROL_SELECTOR = [
  'button[aria-haspopup="menu"][data-tone="neutral"]',
  'button[data-testid="model-switcher-dropdown-button"][aria-haspopup="menu"]',
  'button[data-composer-navigation-target="reasoning"][data-selected-reasoning-effort][aria-haspopup="menu"]',
  'button[data-codex-intelligence-trigger="true"][data-composer-navigation-target="reasoning"][aria-haspopup="menu"]'
].join(", ");
var CHATGPT_EFFORT_MENU_SELECTOR = [
  '[data-testid="composer-intelligence-picker-content"]:has([role="menuitemradio"], [data-model-reasoning-effort-slider])',
  '[role="menu"]:has([role="menuitemradio"], [data-model-reasoning-effort-slider])',
  '[role="group"]:has([role="menuitemradio"], [data-model-reasoning-effort-slider])',
  '[role="menu"]:has([data-model-picker-power-slider])'
].join(", ");
var CHATGPT_EFFORT_ITEM_SELECTOR = '[role="menuitemradio"]';
var CHATGPT_EFFORT_SLIDER_CONTAINER_SELECTOR = "[data-model-reasoning-effort-slider], [data-model-picker-power-slider]";
var CHATGPT_EFFORT_SLIDER_SELECTOR = '[data-model-reasoning-effort-slider] [role="slider"], [data-model-picker-power-slider] [role="slider"]';
var CHATGPT_EFFORT_SLIDER_MAX_OPTIONS = 5;
var CHATGPT_SEND_BUTTON_SELECTOR = '[data-testid="send-button"], button[type="submit"]';
var CHATGPT_STOP_BUTTON_SELECTOR = '[data-testid="stop-button"], form[data-chatgpt-composer] button[type="button"][aria-label="Stop"]';
var CHATGPT_COMPLETION_ACTION_SELECTOR = 'button[data-testid="copy-turn-action-button"], [data-turn-key] .turn-action-controls button';
var CHATGPT_ASSISTANT_TURN_SELECTOR = [
  '[data-testid^="conversation-turn-"][data-turn="assistant"]:not([data-turn-key] *)',
  '[data-testid^="conversation-turn-"][data-message-author-role="assistant"]:not([data-turn-key] *)',
  '[data-testid^="conversation-turn-"]:has([data-message-author-role="assistant"]):not([data-turn-key] *)',
  '[data-turn-key]:has([data-conversation-role="assistant"], [data-chatgpt-agent-turn-start])'
].join(", ");
var CHATGPT_USER_TURN_SELECTOR = [
  '[data-testid^="conversation-turn-"][data-turn="user"]:not([data-turn-key] *)',
  '[data-testid^="conversation-turn-"][data-message-author-role="user"]:not([data-turn-key] *)',
  '[data-testid^="conversation-turn-"]:has([data-message-author-role="user"]):not([data-turn-key] *)',
  "[data-turn-key]:has([data-user-message-bubble])"
].join(", ");
function chatGptAssistantTurnSelector(identity) {
  const prefix = "group:assistant:";
  return identity.startsWith(prefix) ? `[data-turn-key=${JSON.stringify(identity.slice(prefix.length))}]:has([data-conversation-role="assistant"], [data-chatgpt-agent-turn-start])` : `[data-turn-id=${JSON.stringify(identity)}]`;
}
function chatGptEffortSlider(page) {
  const sliderContainer = page.locator(CHATGPT_EFFORT_SLIDER_CONTAINER_SELECTOR).filter({ visible: true });
  return { sliderContainer, slider: sliderContainer.locator('[role="slider"]') };
}
function effortMenuSelectorForId(menuId) {
  return `[id=${JSON.stringify(menuId)}]`;
}
async function chatGptEffortMenuForControl(page, control) {
  const menuId = await control.getAttribute("aria-controls").catch(() => null);
  if (menuId) return page.locator(effortMenuSelectorForId(menuId));
  const controlId = await control.getAttribute("id").catch(() => null);
  if (controlId) return page.locator(`[role="menu"][aria-labelledby~=${JSON.stringify(controlId)}]`).filter({ visible: true });
  return page.locator(CHATGPT_EFFORT_MENU_SELECTOR).filter({ visible: true });
}
async function visibleEffortSurface(page, control) {
  const expanded = await control.getAttribute("aria-expanded").catch(() => null);
  const state = await control.getAttribute("data-state").catch(() => null);
  if (expanded === "false" || state === "closed") return void 0;
  const menu = await chatGptEffortMenuForControl(page, control);
  const surface = chatGptEffortSlider(page);
  if (await menu.isVisible().catch(() => false) || await surface.sliderContainer.isVisible().catch(() => false)) {
    return { menu, ...surface };
  }
  return void 0;
}
async function waitForEffortSurface(page, control, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  do {
    const surface = await visibleEffortSurface(page, control);
    if (surface) return surface;
    if (Date.now() >= deadline) return void 0;
    await new Promise((resolveSleep) => setTimeout(resolveSleep, 50));
  } while (true);
}
async function clearGhostEffortState(page, control) {
  const expanded = await control.getAttribute("aria-expanded").catch(() => null);
  const state = await control.getAttribute("data-state").catch(() => null);
  if (expanded === "true" || state === "open") {
    await page.keyboard.press("Escape").catch(() => {
    });
  }
}
async function activateChatGptEffortMenu(page, control, options = {}) {
  const openSurface = await visibleEffortSurface(page, control);
  if (openSurface) return { method: "already-open", ...openSurface };
  const settleMs = options.settleMs ?? 3e3;
  await clearGhostEffortState(page, control);
  await control.click({ force: true, timeout: Math.max(1, settleMs) });
  const clickedSurface = await waitForEffortSurface(page, control, settleMs);
  if (clickedSurface) return { method: "click", ...clickedSurface };
  await clearGhostEffortState(page, control);
  await control.dispatchEvent("pointerdown", {
    button: 0,
    buttons: 1,
    pointerType: "mouse",
    isPrimary: true
  });
  const pointerSurface = await waitForEffortSurface(page, control, settleMs);
  if (pointerSurface) return { method: "pointerdown", ...pointerSurface };
  throw new Error(
    "ChatGPT effort control did not expose its owned menu or structural slider after click and primary pointerdown"
  );
}
function safeIntegerAttribute(value) {
  if (value === null || !/^-?\d+$/.test(value)) return void 0;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : void 0;
}
function parseChatGptEffortSliderState(rawMin, rawMax, rawValue) {
  const min = safeIntegerAttribute(rawMin);
  const max = safeIntegerAttribute(rawMax);
  const value = safeIntegerAttribute(rawValue);
  if (min === void 0 || max === void 0 || value === void 0) return void 0;
  const optionCount = max - min + 1;
  if (optionCount < 1 || optionCount > CHATGPT_EFFORT_SLIDER_MAX_OPTIONS) return void 0;
  if (value < min || value > max) return void 0;
  return { min, max, value };
}
async function readChatGptEffortSnapshot(sliderContainer, timeoutMs = 1e3) {
  const deadline = Date.now() + timeoutMs;
  do {
    const snapshot = await sliderContainer.evaluate((container) => {
      const sliders = container.querySelectorAll('[role="slider"]');
      const slider = sliders.length === 1 ? sliders[0] : void 0;
      const power = container.hasAttribute("data-model-picker-power-slider") && Boolean(container.querySelector('[data-orientation="horizontal"][aria-disabled="false"]'));
      return {
        min: slider?.getAttribute("aria-valuemin") ?? null,
        max: slider?.getAttribute("aria-valuemax") ?? null,
        value: slider?.getAttribute("aria-valuenow") ?? null,
        locks: Array.from(container.querySelectorAll("[data-selected]"), (tick) => tick.getAttribute("data-locked") ?? (power ? "false" : null))
      };
    });
    const state = parseChatGptEffortSliderState(snapshot.min, snapshot.max, snapshot.value);
    if (!state) throw new Error("ChatGPT effort slider exposed an invalid ARIA range");
    if (snapshot.locks.some((lock) => lock !== "true" && lock !== "false")) break;
    if (snapshot.locks.length === state.max - state.min + 1) {
      return { ...state, available: snapshot.locks.map((lock) => lock === "false") };
    }
    if (Date.now() >= deadline) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  } while (true);
  throw new Error("ChatGPT effort availability could not be verified from its slider ticks");
}
async function anyVisible(locator) {
  const count = await locator.count();
  for (let index = 0; index < count; index += 1) {
    if (await locator.nth(index).isVisible().catch(() => false)) return true;
  }
  return false;
}
async function assertAuthenticatedChatGptPage(page) {
  const composer = page.locator(
    CHATGPT_COMPOSER_SELECTOR
  );
  if (!await anyVisible(composer)) {
    throw new Error("ChatGPT authentication could not be verified: no visible composer is present");
  }
}
async function assertTemporaryChatPage(page) {
  await assertNewChatPage(page);
}
async function assertNewChatPage(page, useSavedChats = false) {
  const url = new URL(page.url());
  const expected = new URL(chatGptNewChatUrl(useSavedChats));
  if (url.origin !== expected.origin || url.pathname !== expected.pathname || url.searchParams.get("temporary-chat") === "true" === useSavedChats) {
    throw new Error(`ChatGPT left the requested new ${useSavedChats ? "saved" : "Temporary"} Chat surface (${page.url()})`);
  }
}
async function detectChatGptAccountCapabilities(page, options = {}) {
  const composers = page.locator(CHATGPT_COMPOSER_SELECTOR).filter({ visible: true });
  const composer = composers;
  const composerForm = composer.locator("xpath=ancestor::form[1]");
  const effortButton = composerForm.locator(CHATGPT_EFFORT_CONTROL_SELECTOR).filter({ visible: true });
  const deadline = Date.now() + (options.selectorTimeoutMs ?? 3e4);
  const stableAbsenceMs = options.stableAbsenceMs ?? 3e3;
  let absenceSince;
  let presenceObservations = 0;
  while (true) {
    const effortVisible = await effortButton.isVisible();
    if (effortVisible) {
      presenceObservations += 1;
      absenceSince = void 0;
      if (presenceObservations >= 2) break;
      await new Promise((resolveSleep) => setTimeout(resolveSleep, 100));
      continue;
    }
    presenceObservations = 0;
    const composerReady = await composers.count().then((count) => count === 1).catch(() => false);
    const formReady = await composerForm.count().then((count) => count === 1).catch(() => false);
    const documentReady = await page.evaluate(() => document.readyState === "complete").catch(() => false);
    if (composerReady && formReady && documentReady) {
      absenceSince ??= Date.now();
    } else {
      absenceSince = void 0;
    }
    if (Date.now() >= deadline) {
      if (absenceSince !== void 0 && Date.now() - absenceSince >= stableAbsenceMs) {
        return { solAvailable: false, extraHighAvailable: false, proAvailable: false };
      }
      throw new Error("ChatGPT account capability probe did not reach a stable composer state");
    }
    await new Promise((resolveSleep) => setTimeout(resolveSleep, 100));
  }
  const menu = page.locator(CHATGPT_EFFORT_MENU_SELECTOR).last();
  const menuVisible = await menu.isVisible().catch(() => false);
  const menuExpanded = await effortButton.getAttribute("aria-expanded").catch(() => null);
  if (!menuVisible && menuExpanded !== "true") await effortButton.press("Enter");
  try {
    const { sliderContainer, slider } = chatGptEffortSlider(page);
    const timeout = options.selectorTimeoutMs ?? 7e4;
    await sliderContainer.waitFor({ state: "visible", timeout });
    await slider.waitFor({ state: "attached", timeout });
    const { available } = await readChatGptEffortSnapshot(sliderContainer);
    return { solAvailable: true, extraHighAvailable: available[3] === true, proAvailable: available[4] === true };
  } finally {
    await page.keyboard.press("Escape").catch(() => {
    });
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  CHATGPT_ASSISTANT_TURN_SELECTOR,
  CHATGPT_COMPLETION_ACTION_SELECTOR,
  CHATGPT_COMPOSER_SELECTOR,
  CHATGPT_EFFORT_CONTROL_SELECTOR,
  CHATGPT_EFFORT_ITEM_SELECTOR,
  CHATGPT_EFFORT_MENU_SELECTOR,
  CHATGPT_EFFORT_SLIDER_CONTAINER_SELECTOR,
  CHATGPT_EFFORT_SLIDER_MAX_OPTIONS,
  CHATGPT_EFFORT_SLIDER_SELECTOR,
  CHATGPT_SAVED_CHAT_URL,
  CHATGPT_SEND_BUTTON_SELECTOR,
  CHATGPT_STOP_BUTTON_SELECTOR,
  CHATGPT_TEMPORARY_CHAT_URL,
  CHATGPT_USER_TURN_SELECTOR,
  activateChatGptEffortMenu,
  assertAuthenticatedChatGptPage,
  assertNewChatPage,
  assertTemporaryChatPage,
  chatGptAssistantTurnSelector,
  chatGptEffortMenuForControl,
  chatGptEffortSlider,
  chatGptNewChatUrl,
  detectChatGptAccountCapabilities,
  parseChatGptEffortSliderState,
  readChatGptEffortSnapshot
});
