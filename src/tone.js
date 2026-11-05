(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./i18n.js') : root.VibeI18n);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BaroTone = api;
})(globalThis, i18n => {
  const MAX_CONTEXT = 500;
  const presets = [
    { key: '', labelKey: 'tone.preset.none', instruction: '' },
    { key: 'professor', labelKey: 'tone.preset.professor', instruction: 'Respectful, concise email to a professor.' },
    { key: 'friend', labelKey: 'tone.preset.friend', instruction: 'Warm, relaxed message to a close friend.' },
    { key: 'team', labelKey: 'tone.preset.team', instruction: 'Friendly, clear, cooperative email to class project teammates.' },
    { key: 'casual-polite', labelKey: 'tone.preset.casualPolite', instruction: 'Casual but polite, approachable and respectful.' },
    { key: 'cofounder', labelKey: 'tone.preset.cofounder', instruction: 'Direct, relaxed, collegial message to a close cofounder.' },
    { key: 'business', labelKey: 'tone.preset.business', instruction: 'Formal, concise professional email.' },
  ];
  function validateTone(value = {}, translate = (key, args) => i18n.t('en', key, args)) {
    const tone = value.tone ?? '', context = value.context ?? '';
    if (typeof tone !== 'string' || !presets.some(preset => preset.key === tone)) throw new Error(translate('error.toneInvalid'));
    if (typeof context !== 'string' || context.length > MAX_CONTEXT) throw new Error(translate('error.contextTooLong', { count: MAX_CONTEXT }));
    return { tone, context: context.trim() };
  }
  function toneInstruction(value) {
    const { tone, context } = validateTone(value);
    if (!tone && !context) return '';
    const preset = presets.find(preset => preset.key === tone).instruction;
    return `Style: ${preset}${context ? `${preset ? ' ' : ''}Context: ${JSON.stringify(context).replace(/ /g, '\\u0020')}.` : ''} Adjust wording/register only; keep the translation task and facts unchanged.\n`;
  }
  return { MAX_CONTEXT, presets, validateTone, toneInstruction };
});
