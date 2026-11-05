(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VibeTargets = api;
})(globalThis, () => {
  const entries = [
    { key: 'target.language.ko', target: 'Korean', aliases: ['Korean', 'ko', 'kor', '한국어', '한국말', 'hanguk', 'hankuk', 'korea', 'Korean language'] },
    { key: 'target.language.en', target: 'English', aliases: ['English', 'en', 'eng', '영어', '英语', '英語', 'anglais', 'englisch', 'inglés', 'ingles'] },
    { key: 'target.language.zh-CN', target: 'Chinese (Simplified)', aliases: ['Chinese (Simplified)', 'Simplified Chinese', 'Simplified', 'zh-CN', 'zh-Hans', 'zh-CHS', '简体中文', '简体字'] },
    { key: 'target.language.zh-TW', target: 'Chinese (Traditional)', aliases: ['Chinese (Traditional)', 'Traditional Chinese', 'Traditional', 'zh-TW', 'zh-Hant', 'zh-CHT', '繁體中文', '繁体中文'] },
    { key: 'target.language.zh', target: 'Chinese', aliases: ['Chinese', 'zh', 'zho', 'chi', '中文', '汉语', '漢語'] },
    { key: 'target.language.mandarin', target: 'Mandarin Chinese', aliases: ['Mandarin', 'Mandarine', 'Mandarin Chinese', 'cmn', 'putonghua', '普通话', '普通話', '国语', '國語'] },
    { key: 'target.language.ja', target: 'Japanese', aliases: ['Japanese', 'ja', 'jpn', '日本語', 'nihongo'] },
    { key: 'target.language.es', target: 'Spanish', aliases: ['Spanish', 'es', 'spa', 'Español', 'Espanol', 'Castilian', 'Castellano'] },
    { key: 'target.language.fr', target: 'French', aliases: ['French', 'fr', 'fra', 'fre', 'Français', 'Francais'] },
    { key: 'target.language.de', target: 'German', aliases: ['German', 'de', 'deu', 'ger', 'Deutsch'] },
  ];
  const normalize = value => value.normalize('NFKC').trim().toLowerCase();
  const index = new Map();
  for (const entry of entries) for (const alias of entry.aliases) index.set(normalize(alias), entry);
  function localizedName(entry, translate) { return translate ? translate(entry.key) : entry.target; }
  function bcp47Entry(value) {
    if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(value)) return null;
    let locale;
    try { locale = new Intl.Locale(value); } catch { return null; }
    if (locale.language === 'zh') {
      if (locale.script === 'Hant' || ['TW', 'HK', 'MO'].includes(locale.region)) return entries[3];
      if (locale.script === 'Hans' || ['CN', 'SG'].includes(locale.region)) return entries[2];
      return entries[4];
    }
    const entry = entries.find(item => item.aliases.some(alias => alias.length <= 3 && normalize(alias) === locale.language));
    if (entry && locale.toString() === locale.language) return entry;
    const name = new Intl.DisplayNames(['en'], { type: 'language' }).of(locale.toString());
    return name && name.toLowerCase() !== locale.toString().toLowerCase() ? { key: null, target: name, aliases: [value] } : entry;
  }
  function canonicalize(value) {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    if (!trimmed || normalize(trimmed) === 'auto') return 'auto';
    const entry = index.get(normalize(trimmed)) || bcp47Entry(trimmed);
    return entry ? entry.target : trimmed;
  }
  function suggestions(query, translate, limit = 8) {
    const trimmed = typeof query === 'string' ? query.trim() : '';
    if (!trimmed) return [];
    const needle = normalize(trimmed);
    const results = [];
    if ('auto'.startsWith(needle)) results.push({ value: 'auto', label: translate ? translate('target.auto') : 'Auto' });
    const exact = index.get(needle) || bcp47Entry(trimmed);
    const unique = new Map();
    for (const entry of entries) {
      const name = localizedName(entry, translate), aliases = [...entry.aliases, name, entry.target];
      if (aliases.some(alias => normalize(alias).startsWith(needle))) unique.set(entry.target, { value: entry.target, label: name });
    }
    if (exact) {
      const name = exact.key ? localizedName(exact, translate) : exact.target;
      unique.set(exact.target, { value: exact.target, label: name });
      results.unshift(unique.get(exact.target));
      unique.delete(exact.target);
    }
    results.push(...unique.values());
    return results.slice(0, limit);
  }
  return { canonicalize, suggestions, entries: entries.map(({ key, target }) => ({ key, target })) };
});