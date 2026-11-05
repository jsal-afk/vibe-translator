module.exports = ({ locked = false, labels = false, error = false, translationHold = false, alignmentHold = false, alignmentError = false, translationText = null, fast = false, fastPartial = false, wordPartial = false, inlineReasoning = false, unknownInlineAvailability = false, foreignMenu = false, ambiguousOwnership = false } = {}) => `<!doctype html><html><body>
<form data-chatgpt-composer><div id="prompt-textarea" role="textbox" contenteditable="true" style="min-height:50px"></div>
${inlineReasoning
  ? `<button type="button" id="inline-reasoning" data-composer-navigation-target="reasoning" data-selected-reasoning-effort="none" aria-haspopup="menu" ${ambiguousOwnership ? '' : 'aria-controls="picker"'} aria-expanded="false">Thinking effort 6 Instant</button>`
  : '<button type="button" data-tone="neutral" aria-haspopup="menu" aria-controls="picker" aria-expanded="false">Instant</button>'}
<button type="submit" data-testid="send-button">Send</button></form>
${inlineReasoning
  ? `<div id="picker" role="menu" aria-labelledby="inline-reasoning" hidden>
  <div role="menuitem" data-model-picker-view-toggle="true" aria-label="Select model">6 Instant</div>
  <div role="menuitem" tabindex="0" aria-label="Power" data-reasoning-slider="true" data-orientation="vertical" aria-keyshortcuts="ArrowLeft ArrowRight">
    <div data-menu-row-content="true"><div data-keyboard-focused="true" data-model-picker-power-slider style="height:30px;width:280px"></div></div>
  </div>
</div>`
  : `<div id="picker" role="menu" hidden>
  <div data-model-picker-view="simple"><div role="menuitemradio" aria-checked="true" hidden>GPT-5.6 Sol</div><div role="menuitemradio" aria-checked="false" hidden>GPT-6 Pro</div></div>
  <div role="menuitem" tabindex="0" aria-describedby="description"><span id="description">5.6 Sol Instant, 1 of 5</span>
  <div data-model-picker-power-slider style="height:30px;width:280px"></div></div>
</div>`}
${foreignMenu ? `<div id="foreign-menu" role="menu">
  <div role="menuitemradio" aria-checked="true">GPT-9 Model</div><div role="menuitemradio" aria-checked="false">Instant</div>
  <div data-model-picker-power-slider><span data-orientation="horizontal" aria-disabled="false" data-locked="false">
    <span data-selected="true" data-locked="false"></span><span data-selected="false" data-locked="false"></span>
    <span role="slider" aria-hidden="true" aria-valuemin="0" aria-valuemax="1" aria-valuenow="0"></span>
  </span></div>
</div>` : ''}
${ambiguousOwnership ? `<div id="picker-duplicate" role="menu" aria-labelledby="inline-reasoning">
  <div role="menuitemradio" aria-checked="true">Auto</div><div role="menuitemradio" aria-checked="false">Instant</div>
</div>` : ''}
<div id="conversation"></div>
<script>(()=>{
let value=0, sends=0; window.sends=0; window.prompts=[]; window.stageSends={translation:0,alignment:0}; window.closedEffortSelections=[];
const names=['Instant','Medium','High','Extra High','Pro'], control=document.querySelector(${inlineReasoning}?'#inline-reasoning':'[aria-haspopup]'),menu=document.querySelector('#picker');
function render(){
 const host=document.querySelector('#picker [data-model-picker-power-slider]');
 if(${inlineReasoning}){
  host.innerHTML='<span data-orientation="horizontal" aria-disabled="false"'+(${unknownInlineAvailability}?'':' data-locked="false"')+'>'
   +names.map((name,i)=>'<span data-selected="'+(i<=value)+'"></span>').join('')
   +'<span role="slider" aria-hidden="true" aria-valuemin="0" aria-valuemax="4" aria-orientation="horizontal" aria-valuenow="'+value+'"></span></span>';
  document.querySelector('#picker [data-model-picker-view-toggle="true"]').textContent='6 '+names[value];
  control.setAttribute('data-selected-reasoning-effort',value===0?'none':value===1?'medium':'step-'+value);
 }else{
  host.innerHTML='<span data-orientation="horizontal" aria-disabled="false">'
   + names.map((name,i)=>'<span data-selected="'+(i<=value)+'" data-locked="'+(${locked}&&i===4)+'" '+(${labels}?'aria-label="'+name+'"':'')+'></span>').join('')
   +'<span role="slider" aria-hidden="true" aria-valuemin="0" aria-valuemax="4" aria-valuenow="'+value+'"></span></span>';
  document.querySelector('#description').textContent='5.6 Sol '+names[value]+', '+(value+1)+' of 5';
 }
}
control.onclick=()=>{menu.hidden=false;control.setAttribute('aria-expanded','true');if(!${inlineReasoning})control.textContent='Thinking effort';render();};
document.addEventListener('keydown',event=>{
 if(event.key==='Escape'){
  menu.hidden=true;control.setAttribute('aria-expanded','false');control.textContent=(${inlineReasoning}?'Thinking effort 6 '+names[value]:names[value]);
  if(${inlineReasoning})window.closedEffortSelections.push({value:document.querySelector('#picker [role="slider"]').getAttribute('aria-valuenow'),selected:control.getAttribute('data-selected-reasoning-effort'),caption:control.textContent});
 }
 if((event.key==='ArrowRight'||event.key==='ArrowLeft')&&!menu.hidden){value=Math.max(0,Math.min(${inlineReasoning}?4:(${locked}?3:4),value+(event.key==='ArrowRight'?1:-1)));render();event.preventDefault();}
});
document.querySelector('form').onsubmit=event=>{
 event.preventDefault();window.sends++;const submittedPrompt=document.querySelector('#prompt-textarea').innerText;window.lastPrompt=submittedPrompt;window.prompts.push(submittedPrompt);document.querySelector('#prompt-textarea').innerText='';
 const translationMatch=submittedPrompt.match(/(?:^|\\n)VIBE_TRANSLATION_DATA_JSON:\\n([\\s\\S]*?)\\nEND_VIBE_TRANSLATION_DATA_JSON(?:\\n|$)/);
 const alignmentMatch=submittedPrompt.match(/(?:^|\\n)VIBE_ALIGNMENT_DATA_JSON:\\n([\\s\\S]*?)\\nEND_VIBE_ALIGNMENT_DATA_JSON(?:\\n|$)/);
 const isAlignment=Boolean(alignmentMatch);
 window.stageSends[isAlignment?'alignment':'translation']++;
 const stop=document.createElement('button');stop.setAttribute('data-testid','stop-button');stop.type='button';stop.textContent='Stop';document.querySelector('form').append(stop);
 stop.onclick=()=>stop.remove();
 document.querySelector('#conversation').innerHTML='<div data-testid="conversation-turn-1" data-turn="user">Source</div><div data-testid="conversation-turn-2" data-turn="assistant"><div data-testid="cot-v5-summary"><div class="markdown">Secret reasoning should stay hidden</div></div><div class="markdown" id="answer"></div></div>';
 const answer=document.querySelector('#answer');
 const finish=(content,code=false)=>{
  if(code){answer.innerHTML='<span>json</span><pre><code></code></pre>';answer.querySelector('code').textContent=content;}
  else answer.textContent=content;
  stop.remove();const copy=document.createElement('button');copy.setAttribute('data-testid','copy-turn-action-button');copy.textContent='Copy';document.querySelector('[data-turn="assistant"]').append(copy);
 };
 if(${error}&&!isAlignment){answer.innerHTML='<div role="alert">Usage limit reached</div>';stop.remove();return;}
 if(isAlignment){
  if(${alignmentHold})return;
  const data=JSON.parse(alignmentMatch[1]),sourceSentences=data.sourceIndex.map(item=>item[0]),targetSentences=data.targetIndex.map(item=>item[0]);
  const sourceWords=data.sourceIndex.flatMap(item=>item[1].map(word=>word[0])),targetWords=data.targetIndex.flatMap(item=>item[1].map(word=>word[0]));
  const groups=[];
  if(sourceSentences.length&&targetSentences.length){
   const paired=Math.min(sourceSentences.length,targetSentences.length);
   for(let i=0;i<paired;i++)groups.push([[sourceSentences[i]],[targetSentences[i]]]);
   if(sourceSentences.length>paired)groups[groups.length-1][0].push(...sourceSentences.slice(paired));
   if(targetSentences.length>paired)groups[groups.length-1][1].push(...targetSentences.slice(paired));
  }
  const mapping=${alignmentError}
   ?{sourceLanguage:'English',groups:[[[999999],[999999]]],links:[]}
   :{sourceLanguage:'English',groups,links:sourceWords.flatMap((word,index)=>targetWords[index]===undefined?[]:[[[word],[targetWords[index]]]])};
  if(${wordPartial}){answer.innerHTML='<span>json</span><pre><code></code></pre>';answer.querySelector('code').textContent='{\"sourceLanguage\":\"English\",\"groups\":[';return;}
  setTimeout(()=>finish(JSON.stringify(mapping),true),${fast}?50:300);return;
 }
 if(!translationMatch)throw new Error('Translation data marker missing from fixture prompt.');
 const translatedText=${JSON.stringify(translationText ?? '안녕하세요. 다음 단계로 진행하겠습니다.\\n\\n-   다음 항목')};
 if(${translationHold}){if(${fastPartial})answer.textContent=translatedText.slice(0,Math.max(1,Math.floor(translatedText.length/2)));return;}
 if(${fastPartial})setTimeout(()=>{answer.textContent=translatedText.slice(0,Math.max(1,Math.floor(translatedText.length/2)));},25);
 setTimeout(()=>finish(translatedText),${fast}?75:300);
};
render();})();
</script></body></html>`;
