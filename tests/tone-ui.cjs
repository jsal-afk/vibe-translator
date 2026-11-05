const {_electron:electron}=require('playwright-core');const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const { electronLaunchOptions } = require('./runtime.cjs');
const {decodeAlignment,sourceIndex}=require('../src/alignment.js');
const root=path.resolve(__dirname,'..');
(async()=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'baro-tone-'));let desktop;
 const screenshotPath=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'vibe-tone-ui-')),'tone-ui.png');
 try{
  desktop=await electron.launch({...electronLaunchOptions(),args:[root,`--user-data-dir=${profile}`],env:{...process.env,BARO_SMOKE:'1'}});
  const page=await desktop.firstWindow();await page.waitForSelector('#tone-context');const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const isolatedPaths=await desktop.evaluate(({app})=>({userData:app.getPath('userData'),sessionData:app.getPath('sessionData')}));
  assert.equal(path.resolve(isolatedPaths.userData),profile);
  assert.equal(path.resolve(isolatedPaths.sessionData),profile);
  await desktop.evaluate(({ipcMain,BrowserWindow})=>{
   globalThis.__toneRequests=[];ipcMain.removeHandler('translate');
   ipcMain.handle('translate',async(_event,request)=>{
    globalThis.__toneRequests.push(request);const window=BrowserWindow.getAllWindows()[0];
    window.webContents.send('translation-progress',{id:request.id,phase:'streaming',text:'PMF'});
    window.webContents.send('translation-progress',{id:request.id,phase:'translated',text:'PMF(제품·시장 적합성)를 확인했습니다.',sourceLanguage:'English',seconds:0.1,cached:false});
    window.webContents.send('translation-progress',{id:request.id,phase:'aligning'});
    await new Promise(resolve=>setTimeout(resolve,120));
    window.webContents.send('translation-progress',{id:request.id,phase:'alignment',sourceLanguage:'English',groups:[],links:[],sourceWords:[]});
    return{text:'PMF(제품·시장 적합성)를 확인했습니다.',sourceLanguage:'English',alignment:{groups:[],links:[],sourceWords:[]},seconds:0.1,cached:false};
   });
   BrowserWindow.getAllWindows()[0].webContents.send('connection-state',{connected:true,messageKey:'connection.connected',messageArgs:{},efforts:[{key:'web-0',label:'Instant'}]});
  });
  await page.locator('#tone').selectOption('professor');await page.locator('#tone-context').fill('마감 연장을 정중하게 부탁하는 이메일');
  await page.locator('#tone-context').blur();
  await page.locator('#target-language').fill('Korean');
  await page.locator('#input').fill('Please extend the deadline.');await page.locator('#input').press('Enter');
  await page.waitForFunction(()=>mappingPending&&$('output').value==='PMF(제품·시장 적합성)를 확인했습니다.'&&stageState==='aligning');
  assert.equal(await page.locator('#output').inputValue(),'PMF(제품·시장 적합성)를 확인했습니다.');
  await page.waitForFunction(()=>requestId===null&&stageState==='done');
  assert.equal(await desktop.evaluate(()=>globalThis.__toneRequests[0].tone),'professor');
  assert.equal(await desktop.evaluate(()=>globalThis.__toneRequests[0].context),'마감 연장을 정중하게 부탁하는 이메일');
  assert.equal(await desktop.evaluate(()=>globalThis.__toneRequests[0].targetLanguage),'Korean');
  const stored=JSON.parse(fs.readFileSync(path.join(profile,'preferences.json'),'utf8'));assert.equal(stored.tone,'professor');assert.equal(stored.context,'마감 연장을 정중하게 부탁하는 이메일');assert.equal(stored.targetLanguage,'Korean');
  await page.reload();await page.waitForFunction(()=>$('tone').value==='professor');assert.equal(await page.locator('#tone-context').inputValue(),stored.context);
  await desktop.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.send('connection-state',{connected:true,messageKey:'connection.connected',messageArgs:{},efforts:[{key:'web-0',label:'Instant'}]}));
  await page.locator('#tone').selectOption('cofounder');await page.locator('#tone-context').fill('친한 공동창업자에게 투자 상황 공유');await page.locator('#tone-context').blur();
  await page.locator('#input').fill('We hit PMF.');
  await page.evaluate(()=>{$('output').value='PMF(제품·시장 적합성)를 확인했어.';refreshControls();});
  await page.screenshot({path:screenshotPath,scale:'css'});
  // Full translation appears before alignment; a late mapping updates the existing selection.
  const source='Hello world.',translated='안녕 세상.';
  const sourceEntries=sourceIndex(source),targetEntries=sourceIndex(translated);
  const sourceWord=sourceEntries.flatMap(entry=>entry.w).find(([,text])=>text.startsWith('Hello'))[0];
  const targetWord=targetEntries.flatMap(entry=>entry.w).find(([,text])=>text.startsWith('안녕'))[0];
  const alignment=decodeAlignment(JSON.stringify({
   sourceLanguage:'English',
   groups:[[[sourceEntries[0].s],[targetEntries[0].s]]],
   links:[[[sourceWord],[targetWord]]],
  }),source,translated);
  await page.locator('#input').fill(source);
  await page.evaluate(()=>{requestId='alignment-test';activeRequestText=$('input').value;busy=true;mappingPending=false;setStage('translating');refreshControls();});
  await desktop.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.send('translation-progress',{
   id:'alignment-test',phase:'streaming',text:'안녕',messageKey:'status.translating',messageArgs:{},
  }));
  await page.waitForFunction(()=>$('output').value==='안녕');
  await desktop.evaluate(({BrowserWindow},translated)=>BrowserWindow.getAllWindows()[0].webContents.send('translation-progress',{
   id:'alignment-test',phase:'translated',text:translated,sourceLanguage:'English',seconds:0.1,cached:false,
  }),translated);
  await desktop.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.send('translation-progress',{id:'alignment-test',phase:'aligning'}));
  await page.waitForFunction(()=>mappingPending&&$('output').value==='안녕 세상.'&&stageState==='aligning');
  await page.locator('#input').evaluate(node=>{node.focus();node.setSelectionRange(0,5);});
  await desktop.evaluate(({BrowserWindow},alignment)=>BrowserWindow.getAllWindows()[0].webContents.send('translation-progress',{
   id:'alignment-test',phase:'alignment',...alignment,
  }),alignment);
  await page.waitForFunction(()=>document.querySelector('.result-editor mark')?.textContent==='안녕'&&stageState==='done');
  await page.evaluate(()=>{mappingPending=false;});
  // New streaming text does not scroll a selection out of view.
  await page.evaluate(()=>{
   $('input').value=('First sentence.\n').repeat(100);$('output').value=('첫 문장.\n').repeat(100);
   currentAlignment=null;alignedSource=alignedTarget=null;linkedEditors.clear();
   requestId='scroll-test';activeRequestText=$('input').value;busy=true;mappingPending=false;setStage('translating');
   $('input').scrollTop=0;$('output').scrollTop=0;$('input').focus();$('input').setSelectionRange(0,5);
  });
  const text=await page.locator('#output').inputValue();
  await desktop.evaluate(({BrowserWindow},text)=>BrowserWindow.getAllWindows()[0].webContents.send('translation-progress',{id:'scroll-test',phase:'streaming',text:text+'새 문장.',messageKey:'status.translating',messageArgs:{}}),text);
  await page.waitForFunction(()=>$('output').value.endsWith('새 문장.'));
  assert.equal(await page.locator('#input').evaluate(n=>n.scrollTop),0);assert.equal(await page.locator('#output').evaluate(n=>n.scrollTop),0);
  await desktop.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(650,530));
  await page.waitForFunction(()=>innerWidth===650);
  assert.equal(await page.locator('#tone-context').isVisible(),true);
  const layout=await page.locator('#tone-context').boundingBox();assert.ok(layout.x+layout.width<=650);
  assert.deepEqual(errors,[]);
  console.log(`PASS: tone/context persistence, two-stage result, late alignment, scrolling and minimum-width layout. Screenshot: ${screenshotPath}`);
 }finally{if(desktop)await desktop.close();fs.rmSync(profile,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
