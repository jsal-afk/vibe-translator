(function (root, factory) {
  const messages = typeof module === 'object' && module.exports ? require('./messages.js') : root.VibeMessages;
  const api = factory(messages);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VibeI18n = api;
})(globalThis, messages => {
  const locales = ['ko', 'en', 'zh-CN', 'ja', 'es', 'fr', 'de', 'zh-TW'];
  function locale(value) { return locales.includes(value) ? value : 'en'; }
  function t(language, key, values = {}) {
    const selected = locale(language), message = messages?.[selected]?.[key] ?? messages?.en?.[key] ?? key;
    const params = { ...values };
    if (typeof params.count === 'number') params.count = new Intl.NumberFormat(selected).format(params.count);
    return String(message).replace(/\{([a-zA-Z][\w]*)\}/g, (match, name) => Object.hasOwn(params, name) ? String(params[name]) : match);
  }
  return { locales, locale, t };
});