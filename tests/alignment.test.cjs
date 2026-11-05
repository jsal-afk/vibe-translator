const { test } = require('node:test');
const assert = require('node:assert/strict');
const { segmentSource, sourceIndex, decodeAlignment, matchingRanges, invert } = require('../src/alignment.js');
const source = 'I really agree.\n\nI agree too.';
const target = 'Really agree.\n\nI agree too.';
const mapping = {
  sourceLanguage: 'English',
  groups: [[[1], [1]], [[2], [2]]],
  links: [[[2], [1]], [[3], [2]], [[5], [4]]],
};

test('locale-neutral ICU segmentation preserves multilingual sentence and word boundaries', () => {
  const cases = [
    ['I love Tokyo. Next stop Osaka.', ['Tokyo', 'Osaka']],
    ['我喜欢北京。明天见。', ['北京', '明天']],
    ['私は東京に行きます。次は大阪です。', ['東京', '大阪']],
    ['مرحبا بالعالم. كيف حالك؟', ['مرحبا', 'بالعالم', 'كيف', 'حالك']],
    ['สวัสดีครับ วันนี้อากาศดี. ขอบคุณครับ', ['สวัสดี', 'อากาศ', 'ขอบคุณ']],
  ];
  for (const [text, expectedWords] of cases) {
    const indexed = sourceIndex(text), segments = segmentSource(text);
    assert.equal(segments.sentences.length, 2, text);
    const actualWords = indexed.flatMap(sentence => sentence.w.map(([, word]) => word));
    for (const word of expectedWords) assert.ok(actualWords.includes(word), `${text}: missing ${word}`);
    assert.deepEqual(segments.words.map(word => word.id), segments.words.map((_, index) => index + 1));
    for (const word of segments.words) assert.equal(text.slice(word.start, word.end), actualWords[word.id - 1]);
  }
});

test('source offsets keep repeated words, paragraph positions and UTF-16 emoji consistent', () => {
  assert.deepEqual(sourceIndex(source).map(sentence => sentence.w), [
    [[1, 'I'], [2, 'really'], [3, 'agree']],
    [[4, 'I'], [5, 'agree'], [6, 'too']],
  ]);
  const text = '안녕 👩‍💻!\nHello.';
  for (const word of segmentSource(text).words) assert.ok(text.slice(word.start, word.end).length);
  assert.equal(segmentSource(text).sentences[1].start, text.indexOf('Hello'));
});

test('validated sentence and word ID mapping keeps exact UTF-16 ranges through inversion', () => {
  const result = decodeAlignment(JSON.stringify(mapping), source, target);
  assert.equal(result.invalid, undefined); assert.equal(result.complete, true);
  assert.equal(result.sourceLanguage, 'English');
  assert.deepEqual(matchingRanges(result, 2, 8), [{ start: 0, end: 6 }]);
  const secondAgree = source.lastIndexOf('agree');
  assert.deepEqual(matchingRanges(result, secondAgree, secondAgree + 5), [{ start: 17, end: 22 }]);
  const reversed = invert(result, target);
  assert.deepEqual(matchingRanges(reversed, 0, 3), [{ start: 2, end: 8 }]);
});
test('many-to-many links within one sentence group remain valid', () => {
  const result = decodeAlignment(JSON.stringify({
    groups: [[[1, 2], [1, 2]]],
    links: [[[2, 5], [1, 4]]],
  }), source, target);
  assert.equal(result.invalid, undefined);
  assert.equal(result.groups.length, 1);
  assert.equal(result.links.length, 1);
});

test('a word link spanning separate sentence groups cannot cross-highlight an unrelated target', () => {
  const from = 'Alpha one. Beta two.', to = 'Uno alpha. Dos beta.';
  const result = decodeAlignment(JSON.stringify({
    groups: [[[1], [1]], [[2], [2]]],
    links: [[[1], [2]], [[3], [4]], [[1, 3], [2]]],
  }), from, to);
  assert.equal(result.invalid, undefined);
  assert.equal(result.links.length, 2);
  const beta = from.indexOf('Beta');
  const ranges = matchingRanges(result, beta, beta + 'Beta'.length);
  assert.deepEqual(ranges, [{ start: to.indexOf('beta'), end: to.indexOf('beta') + 'beta'.length }]);
});

test('alignment accepts missing source-language metadata without delaying complete mappings', () => {
  const { sourceLanguage, ...withoutLanguage } = mapping;
  const result = decodeAlignment(JSON.stringify(withoutLanguage), source, target);
  assert.equal(result.complete, true); assert.equal(result.sourceLanguage, '');
  assert.equal(result.links.length, mapping.links.length);
});

test('invalid sentence coverage is rejected and invalid word links are omitted', () => {
  const missing = decodeAlignment(JSON.stringify({ ...mapping, groups: [[[1], [1]]] }), source, target);
  assert.equal(missing.invalid, true);
  const invalidLink = decodeAlignment(JSON.stringify({ ...mapping, links: [[[999], [1]]] }), source, target);
  assert.equal(invalidLink.invalid, undefined); assert.equal(invalidLink.links.length, 0);
  assert.deepEqual(matchingRanges(invalidLink, 2, 8), [{ start: 0, end: 13 }]);
  const outOfRange = decodeAlignment(JSON.stringify({ ...mapping, groups: [[[1], [999]], [[2], [2]]] }), source, target);
  assert.equal(outOfRange.invalid, true);
});
