/* Shared text positions. Model output is data, never HTML. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BaroAlignment = api;
})(globalThis, () => {
  function segmentSource(text) {
    const sentences = [], words = [];
    const sentenceBreaker = new Intl.Segmenter('und', { granularity: 'sentence' });
    const wordBreaker = new Intl.Segmenter('und', { granularity: 'word' });
    for (const line of text.matchAll(/[^\r\n]+/g)) {
      for (const unit of sentenceBreaker.segment(line[0])) {
        if (!unit.segment.trim()) continue;
        const start = line.index + unit.index, end = start + unit.segment.length;
        const sentence = { id: sentences.length + 1, start, end };
        sentences.push(sentence);
        for (const word of wordBreaker.segment(unit.segment)) {
          if (!word.isWordLike && !/\p{Extended_Pictographic}/u.test(word.segment)) continue;
          words.push({ id: words.length + 1, sentence: sentence.id,
            start: start + word.index, end: start + word.index + word.segment.length });
        }
      }
    }
    return { sentences, words };
  }
  function sourceIndex(text, source = segmentSource(text)) {
    const words = new Map(source.sentences.map(s => [s.id, []]));
    for (const word of source.words) words.get(word.sentence).push([word.id, text.slice(word.start, word.end)]);
    return source.sentences.map(s => ({ s: s.id, text: text.slice(s.start, s.end), w: words.get(s.id) }));
  }
  function mergeRanges(ranges) {
    const sorted = ranges.filter(r => r && Number.isInteger(r.start) && Number.isInteger(r.end) && r.end > r.start)
      .map(r => ({ start: r.start, end: r.end })).sort((a, b) => a.start - b.start);
    const result = [];
    for (const range of sorted) {
      const last = result.at(-1);
      if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
      else result.push(range);
    }
    return result;
  }
  function protocolBody(raw) { return raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''); }
  function decodeAlignment(raw, sourceText, targetText) {
    let data;
    try { data = JSON.parse(protocolBody(raw)); } catch { return { invalid: true }; }
    const source = segmentSource(sourceText), target = segmentSource(targetText);
    if (!data || !Array.isArray(data.groups) || !Array.isArray(data.links)
      || data.groups.length > 24000 || data.links.length > 50000 || !source.sentences.length || !target.sentences.length) {
      return { invalid: true };
    }
    const sourceSentences = new Map(source.sentences.map(sentence => [sentence.id, sentence]));
    const targetSentences = new Map(target.sentences.map(sentence => [sentence.id, sentence]));
    const sourceWords = new Map(source.words.map(word => [word.id, word]));
    const targetWords = new Map(target.words.map(word => [word.id, word]));
    const normalizeIds = (ids, lookup) => Array.isArray(ids) && ids.length > 0 && ids.length <= 24000
      && ids.every(id => Number.isInteger(id) && lookup.has(id)) && new Set(ids).size === ids.length ? ids : null;
    const groups = [], sourceGroup = new Map(), targetGroup = new Map();
    for (let index = 0; index < data.groups.length; index++) {
      const entry = data.groups[index];
      if (!Array.isArray(entry) || entry.length !== 2) return { invalid: true };
      const sources = normalizeIds(entry[0], sourceSentences), targets = normalizeIds(entry[1], targetSentences);
      if (!sources || !targets || sources.some(id => sourceGroup.has(id)) || targets.some(id => targetGroup.has(id))) return { invalid: true };
      for (const id of sources) sourceGroup.set(id, index);
      for (const id of targets) targetGroup.set(id, index);
      groups.push({ source: mergeRanges(sources.map(id => sourceSentences.get(id))),
        target: mergeRanges(targets.map(id => targetSentences.get(id))) });
    }
    if (source.sentences.some(sentence => !sourceGroup.has(sentence.id))
      || target.sentences.some(sentence => !targetGroup.has(sentence.id))) return { invalid: true };
    const links = [];
    for (const entry of data.links) {
      if (!Array.isArray(entry) || entry.length !== 2) continue;
      const sources = normalizeIds(entry[0], sourceWords), targets = normalizeIds(entry[1], targetWords);
      if (!sources || !targets) continue;
      let groupIndex;
      const sameSourceGroup = sources.every(id => {
        const current = sourceGroup.get(sourceWords.get(id).sentence);
        if (groupIndex === undefined) groupIndex = current;
        return current !== undefined && current === groupIndex;
      });
      if (!sameSourceGroup || !targets.every(id => targetGroup.get(targetWords.get(id).sentence) === groupIndex)) continue;
      links.push({ source: mergeRanges(sources.map(id => sourceWords.get(id))),
        target: mergeRanges(targets.map(id => targetWords.get(id))) });
    }
    const sourceLanguage = typeof data.sourceLanguage === 'string' && data.sourceLanguage.length <= 120
      ? data.sourceLanguage.trim() : '';
    return { groups, links, sourceWords: source.words, sourceLanguage, structured: true, complete: true };
  }
  function matchingRanges(alignment, start, end, reverse = false) {
    if (!alignment || start === end) return [];
    const from = reverse ? 'target' : 'source', to = reverse ? 'source' : 'target';
    const intersects = ranges => ranges.some(r => r.start < end && r.end > start);
    const fine = alignment.links.filter(link => intersects(link[from]));
    const result = fine.flatMap(link => link[to]);
    const coverage = mergeRanges(fine.flatMap(link => link[from]));
    for (const group of alignment.groups.filter(group => intersects(group[from]))) {
      if (group[from].every(range => start <= range.start && end >= range.end)) { result.push(...group[to]); continue; }
      const selected = group[from].map(r => ({ start: Math.max(start, r.start), end: Math.min(end, r.end) })).filter(r => r.end > r.start);
      const missingWord = !reverse && alignment.sourceWords?.some(w => selected.some(r => w.start < r.end && w.end > r.start)
        && !coverage.some(c => c.start <= w.start && c.end >= w.end));
      if (!fine.some(link => link[from].some(r => group[from].some(g => g.start < r.end && g.end > r.start))) || missingWord) result.push(...group[to]);
    }
    return mergeRanges(result);
  }
  function invert(alignment, sourceText) {
    if (!alignment) return null;
    const flip = link => ({ source: link.target, target: link.source });
    return { links: alignment.links.map(flip), groups: alignment.groups.map(flip), sourceWords: segmentSource(sourceText).words };
  }
  return { segmentSource, sourceIndex, mergeRanges, decodeAlignment, matchingRanges, invert };
});
