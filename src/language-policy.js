(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VibeLanguagePolicy = api;
})(globalThis, () => {
  const uiLocales = ['ko', 'en', 'zh-CN', 'ja', 'es', 'fr', 'de', 'zh-TW'];
  const latinProfiles = {
    en: new Set(['the', 'and', 'this', 'that', 'with', 'from', 'please', 'your', 'you', 'to', 'of', 'in', 'is', 'are', 'was', 'were', 'we', 'it', 'for', 'as', 'at', 'because', 'they', 'have', 'need', 'would', 'will', 'can', 'could', 'should', 'send', 'submit', 'after', 'before', 'meeting', 'document', 'message', 'hello', 'thanks', 'thank', 'about', 'what', 'when', 'where', 'how', 'there', 'their', 'not', 'but', 'or', 'by', 'on', 'be', 'has', 'had', 'do', 'does', 'did', 'my', 'name', 'i', 'love', 'today', 'résumé', 'our', 'all', 'just', 'more', 'than', 'then', 'if', 'we', 'they']),
    es: new Set(['el', 'la', 'de', 'que', 'y', 'en', 'un', 'una', 'es', 'los', 'las', 'por', 'para', 'con', 'como', 'está', 'hola', 'muy', 'este', 'esta', 'quiero', 'puedo', 'gracias', 'pero', 'del', 'mi', 'no', 'me', 'qué', 'cómo', 'usted', 'nosotros']),
    fr: new Set(['le', 'la', 'les', 'des', 'et', 'un', 'une', 'est', 'que', 'vous', 'avec', 'pour', 'je', 'nous', 'pas', 'ce', 'bonjour', 'merci', 'comment', 'allez', 'suis', 'dans', 'sur', 'mais', 'mon', 'votre', 'voudrais', 'parler']),
    de: new Set(['der', 'die', 'das', 'und', 'ist', 'mit', 'ich', 'nicht', 'ein', 'eine', 'zu', 'von', 'dass', 'wie', 'guten', 'bitte', 'danke', 'haben', 'wir', 'sie', 'es', 'für', 'den', 'dem', 'auf', 'morgen', 'können', 'möchte']),
    it: new Set(['il', 'lo', 'gli', 'che', 'e', 'di', 'un', 'una', 'per', 'sono', 'con', 'ciao', 'come', 'stai', 'vorrei', 'grazie', 'non', 'questa', 'questo', 'molto', 'buongiorno', 'parlare']),
    pt: new Set(['o', 'a', 'os', 'as', 'de', 'que', 'e', 'um', 'uma', 'é', 'em', 'você', 'com', 'para', 'olá', 'como', 'não', 'muito', 'obrigado', 'gostaria', 'está', 'bom', 'dia', 'por', 'favor']),
    nl: new Set(['de', 'het', 'een', 'en', 'is', 'in', 'van', 'ik', 'je', 'met', 'wat', 'hoe', 'goedemorgen', 'bedankt', 'morgen', 'voor', 'niet', 'dit', 'dat', 'zijn', 'als', 'we']),
    id: new Set(['dan', 'yang', 'untuk', 'ini', 'dengan', 'saya', 'adalah', 'tidak', 'halo', 'bagaimana', 'terima', 'kasih', 'selamat', 'pagi', 'kamu', 'akan', 'dari', 'pada']),
  };

  function systemLanguage(tag) {
    if (typeof tag !== 'string' || !tag.trim()) return 'en';
    try { return new Intl.Locale(tag.trim()).toString(); } catch { return tag.trim().replaceAll('_', '-'); }
  }
  function languageCode(tag) {
    try { return new Intl.Locale(systemLanguage(tag)).language.toLowerCase(); }
    catch { return systemLanguage(tag).split('-')[0].toLowerCase(); }
  }
  function isEnglishSystemLanguage(tag) { return languageCode(tag) === 'en'; }
  function uiLanguageForSystemLanguage(tag) {
    try {
      const locale = new Intl.Locale(systemLanguage(tag));
      if (locale.language === 'zh') return locale.script === 'Hant' || ['TW', 'HK', 'MO'].includes(locale.region) ? 'zh-TW' : 'zh-CN';
      return uiLocales.includes(locale.language) ? locale.language : 'en';
    } catch { return 'en'; }
  }
  function languageName(tag) {
    try { return new Intl.DisplayNames(['en'], { type: 'language' }).of(systemLanguage(tag)) || languageCode(tag); }
    catch { return languageCode(tag); }
  }
  function baseLanguageName(tag) {
    try { return new Intl.DisplayNames(['en'], { type: 'language' }).of(languageCode(tag)) || languageName(tag); }
    catch { return languageName(tag); }
  }
  function detectEnglishInput(text) {
    if (typeof text !== 'string' || !text.trim()) return 'uncertain';
    let letterCount = 0, nonLatinCount = 0;
    const normalized = text.normalize('NFKC');
    for (const character of normalized) {
      if (!/\p{L}/u.test(character)) continue;
      letterCount++;
      if (!/\p{Script=Latin}/u.test(character)) nonLatinCount++;
    }
    if (!letterCount) return 'uncertain';

    const words = normalized.toLowerCase().match(/[\p{L}\p{M}]+/gu) || [];
    const scores = Object.fromEntries(Object.keys(latinProfiles).map(code => [code, 0]));
    for (const word of words) for (const [code, profile] of Object.entries(latinProfiles)) if (profile.has(word)) scores[code]++;
    const english = scores.en;
    const other = Math.max(...Object.entries(scores).filter(([code]) => code !== 'en').map(([, score]) => score));

    if (nonLatinCount >= 3 && nonLatinCount / letterCount >= 0.28) {
      if (english >= 2 && english / words.length >= 0.5) return 'uncertain';
      if (other >= 2 && other >= english + 1) return 'nonEnglish';
      return 'nonEnglish';
    }
    // Non-Latin names or quotes in otherwise English prose make source-language
    // detection ambiguous; accented Latin letters alone are not evidence.
    if (nonLatinCount > 0 && english >= 2) return 'uncertain';
    if (words.length < 4) return 'uncertain';
    if (other >= 2 && other >= english + 1) return 'nonEnglish';
    if (other > 0 && words.length < 8) return 'uncertain';
    if (words.length >= 5 && english >= 2 && english / words.length >= 0.25 && english >= other * 1.35 + 0.5) return 'english';
    if (other >= 3 && english === 0) return 'nonEnglish';
    return 'uncertain';
  }
  function targetSelectionRequired(text, targetLanguage, systemLocale) {
    if (targetLanguage !== 'auto' || !isEnglishSystemLanguage(systemLocale)) return null;
    const classification = detectEnglishInput(text);
    return classification === 'nonEnglish' ? null : classification;
  }
  return { uiLocales, systemLanguage, languageCode, isEnglishSystemLanguage, uiLanguageForSystemLanguage, languageName, baseLanguageName, detectEnglishInput, targetSelectionRequired };
});