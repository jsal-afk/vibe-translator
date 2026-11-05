const {test}=require('node:test');
const assert=require('node:assert/strict');
const {validateRequest,TranslationCache}=require('../src/core.cjs');
const {presets}=require('../src/tone.js');
const base={text:'We hit PMF and are raising on a SAFE.',targetLanguage:'Korean',effort:'web-0'};
test('presets and freeform situation validate within the target-only request contract',()=>{
 for(const preset of presets.filter(p=>p.key)) {
  const request=validateRequest({...base,tone:preset.key});
  assert.equal(request.tone,preset.key);
  assert.equal(request.targetLanguage,'Korean');
 }
 const context='친한 공동창업자에게 보내는 짧은 투자 조건 설명';
 const request=validateRequest({...base,tone:'casual-polite',context});
 assert.equal(request.context,context);
});
test('tone preferences are validated and cache is separated by tone and situation',()=>{
 for(const patch of [{tone:'unknown'},{tone:{}},{context:5},{context:'x'.repeat(501)}]) assert.throws(()=>validateRequest({...base,...patch}));
 assert.equal(validateRequest({...base,context:'  친구에게  '}).context,'친구에게');
 const cache=new TranslationCache(),plain=validateRequest(base);
 cache.set(plain,'original style');
 assert.equal(cache.get(validateRequest({...base,tone:'professor'})),undefined);
 assert.equal(cache.get(validateRequest({...base,context:'친구에게'})),undefined);
 assert.equal(cache.get(validateRequest({...base,context:'  '})),'original style');
});
