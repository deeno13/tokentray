// Optional real-browser checks, separate from the dependency-free node:test gate.
// Requires an existing Playwright install and Chromium browser; installs nothing.
// node tests/browser-smoke.mjs [playwright-package-path] [browser-executable-path]
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {PROVIDERS} from '../ui/model.mjs';

const {chromium}=createRequire(import.meta.url)(process.argv[2]||'playwright');
const files=new Map([
  ['/', ['index.html','text/html']],
  ['/app.mjs', ['app.mjs','text/javascript']],
  ['/model.mjs', ['model.mjs','text/javascript']],
  ['/style.css', ['style.css','text/css']],
]);
const server=createServer(async(req,res)=>{
  const asset=files.get(req.url);
  if(!asset){res.writeHead(404);res.end();return;}
  try{
    const body=await readFile(new URL('../ui/'+asset[0],import.meta.url));
    res.writeHead(200,{'Content-Type':asset[1]});res.end(body);
  }catch{res.writeHead(500);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
const artifacts=new URL('../ui-test-results/',import.meta.url);
await mkdir(artifacts,{recursive:true});
const errors=[];

async function openFixture(count,viewport={width:400,height:800},colorScheme='light',resizeFeedback=false){
  const context=await browser.newContext({viewport,colorScheme});
  const page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  if(resizeFeedback)await page.exposeFunction('applyNativeResize',async({width,height})=>{
    await page.setViewportSize({width:Math.round(width),height:Math.min(620,Math.round(height))});
  });
  await page.addInitScript(({ids,count})=>{
    const events=new Map();
    const now=Date.now();
    const snapshots=Object.fromEntries(ids.map(id=>[id,{
      status:id==='claude'?'needsAuth':'ok',fetched_at:now,
      windows:[{label:'Current session',used:0.38,resets_at:now+3600000},{label:'Weekly limit',used:0.62,resets_at:now+432000000}],
    }]));
    window.smoke={
      calls:[],settings:{disabled:ids.slice(count),acrylic:true,start_minimized:true,ring_color:'urgency',layout:'grid',onboarded:true},
      failSave:false,deferRefresh:false,deferHide:false,
      emit(name,payload){for(const listener of events.get(name)||[])listener({payload});},
    };
    window.__TAURI__={
      event:{async listen(name,listener){if(!events.has(name))events.set(name,[]);events.get(name).push(listener);return ()=>{};}},
      core:{async invoke(name,args){
        const state=window.smoke;state.calls.push({name,args});
        if(name==='get_settings')return structuredClone(state.settings);
        if(name==='get_startup')return false;
        if(name==='get_accounts')return {codex:{email:'a-very-long-synthetic-account-name-for-wrapping-checks@example.invalid',plan:'Synthetic plan'}};
        if(name==='get_all')return snapshots;
        if(name==='set_material')return false;
        if(name==='resize_popup'&&window.applyNativeResize)return window.applyNativeResize(args);
        if(name==='save_settings'){
          if(state.failSave){state.failSave=false;throw Error('Synthetic settings failure');}
          state.settings=structuredClone(args.settings);return;
        }
        if(name==='set_startup')return args.enabled;
        if(name==='refresh_usage'&&state.deferRefresh)return new Promise(resolve=>state.finishRefresh=resolve);
        if(name==='hide_popup'&&state.deferHide)return new Promise(resolve=>state.finishHide=resolve);
      }},
    };
  },{ids:PROVIDERS.map(p=>p.id),count});
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(count=>document.querySelectorAll('.provider').length===count
    &&window.smoke.calls.some(call=>call.name==='resize_popup'),count);
  return {context,page};
}

async function settleResizes(page){
  // Require the request count and applied viewport to stay quiet across many frames.
  await page.evaluate(()=>delete window.smoke.settle);
  await page.waitForFunction(()=>{
    const calls=window.smoke.calls.filter(call=>call.name==='resize_popup');
    const latest=calls.at(-1)?.args;
    if(!latest||innerWidth!==latest.width||innerHeight!==Math.min(620,latest.height))return false;
    const settle=window.smoke.settle;
    if(!settle||settle.count!==calls.length){window.smoke.settle={count:calls.length,since:performance.now()};return false;}
    return performance.now()-settle.since>=200;
  },null,{timeout:5000});
  return page.evaluate(()=>({height:innerHeight,calls:window.smoke.calls.filter(call=>call.name==='resize_popup').length}));
}

async function checkGeometry(page,count,width){
  const layout=await page.evaluate(()=>{
    const rect=element=>{const r=element.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
    return {
      flyout:rect(document.querySelector('.flyout')),
      buttons:[...document.querySelectorAll('.actions button')].map(rect),
      providers:[...document.querySelectorAll('.provider')].map(rect),
      overflow:[document.documentElement,document.querySelector('.flyout'),document.getElementById('overview')]
        .map(element=>element.scrollWidth>element.clientWidth+1),
      resizeWidths:window.smoke.calls.filter(call=>call.name==='resize_popup').map(call=>call.args.width),
    };
  });
  assert.equal(layout.flyout.width,Math.min(400,width));
  assert.ok(layout.buttons.every(button=>button.width===30&&button.height===30),'header controls are 30px square');
  assert.ok(layout.overflow.every(value=>!value),'overview has no horizontal overflow');
  assert.ok(layout.resizeWidths.every(value=>value===400),'every native resize preserves the logical width');
  assert.equal(layout.providers.length,count);
  if(count===8&&width===400){
    assert.equal(new Set(layout.providers.map(provider=>provider.y)).size,2,'eight providers wrap into two rows');
    assert.equal(new Set(layout.providers.map(provider=>provider.x)).size,4,'provider rows have four columns');
    assert.ok(Math.max(...layout.providers.map(p=>p.height))-Math.min(...layout.providers.map(p=>p.height))<=1,'provider click targets have consistent heights');
  }
}

try{
  browser=await chromium.launch({headless:true,...(process.argv[3]?{executablePath:process.argv[3]}:{channel:'msedge'})});
  for(const scenario of [
    {name:'empty-light',count:0,width:400,height:800,scheme:'light'},
    {name:'single-light',count:1,width:400,height:800,scheme:'light'},
    {name:'all-light',count:8,width:400,height:800,scheme:'light'},
    {name:'all-dark',count:8,width:400,height:800,scheme:'dark'},
    {name:'narrow-light',count:8,width:320,height:360,scheme:'light'},
    {name:'short-dark',count:8,width:400,height:240,scheme:'dark'},
  ]){
    const {context,page}=await openFixture(scenario.count,{width:scenario.width,height:scenario.height},scenario.scheme);
    await checkGeometry(page,scenario.count,scenario.width);
    await page.screenshot({path:fileURLToPath(new URL(scenario.name+'.png',artifacts))});
    if(scenario.count){
      await page.locator('.provider').first().click();
      await page.waitForFunction(()=>!document.getElementById('detail').hidden);
      await checkGeometry(page,scenario.count,scenario.width);
      await page.locator('.provider').first().click();
      assert.equal(await page.locator('#detail').isVisible(),false);
    }
    await page.locator('#settings').click();
    assert.equal(await page.locator('#settings-page').isVisible(),true);
    assert.equal(await page.evaluate(()=>document.activeElement.id),'back');
    const settingsGeometry=await page.locator('#settings-page').evaluate(element=>({
      overflow:element.scrollWidth>element.clientWidth+1,
      heights:[...element.querySelectorAll('.setting')].map(row=>row.getBoundingClientRect().height),
    }));
    assert.equal(settingsGeometry.overflow,false,'long synthetic account text wraps within settings');
    assert.ok(settingsGeometry.heights.every(height=>height>=32),'settings rows provide at least 32px targets');
    await page.screenshot({path:fileURLToPath(new URL(scenario.name+'-settings.png',artifacts))});
    // Scrolling to the final setting must keep the header close button available.
    await page.locator('#acrylic').scrollIntoViewIfNeeded();
    const header=await page.locator('header').boundingBox();
    assert.ok(header.y>=0&&header.y+header.height<=scenario.height);
    await page.locator('#back').click();
    assert.equal(await page.locator('#overview').isVisible(),true);
    assert.equal(await page.evaluate(()=>document.activeElement.id),'settings');
    await context.close();
    console.log(`PASS ${scenario.name}: layout, provider toggles, settings, long account, scrolling`);
  }

  const {context,page}=await openFixture(8);
  const codex=page.locator('[data-provider="codex"]');
  assert.equal(await codex.evaluate(element=>element.querySelectorAll('.fill').length),2,'two windows render inner and outer ring fills');
  assert.equal(await codex.evaluate(element=>element.querySelector('svg').classList.contains('single')),false,'two windows show both rings');
  await codex.focus();
  await codex.evaluate(element=>window.smoke.originalProvider=element);
  const bounds=await codex.boundingBox();
  await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);
  await page.mouse.down();
  await page.evaluate(()=>window.smoke.emit('codex',{
    status:'ok',fetched_at:Date.now(),windows:[{label:'Current session',used:0.57,resets_at:Date.now()+3600000}],
  }));
  assert.equal(await codex.evaluate(element=>element===window.smoke.originalProvider),true,'background updates preserve the exact click target');
  await page.mouse.up();
  await page.waitForFunction(()=>!document.getElementById('detail').hidden);
  assert.equal(await codex.evaluate(element=>element===document.activeElement),true,'background updates preserve focus');
  assert.match(await codex.innerText(),/57%/);
  assert.equal(await codex.evaluate(element=>element.querySelector('svg').classList.contains('single')),true,'a single window hides the inner ring');
  await page.locator('#settings').click();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#overview').isVisible(),true);
  assert.equal(await page.locator('#detail').isVisible(),true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#detail').isVisible(),false);
  await page.evaluate(()=>{window.smoke.deferHide=true;document.getElementById('close').click();document.getElementById('close').click();});
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(()=>window.smoke.calls.filter(call=>call.name==='hide_popup').length),1,'rapid closes share one pending request');
  await page.evaluate(()=>window.smoke.finishHide());

  await page.evaluate(()=>{window.smoke.deferRefresh=true;document.getElementById('refresh').click();document.getElementById('refresh').click();});
  assert.equal(await page.evaluate(()=>window.smoke.calls.filter(call=>call.name==='refresh_usage').length),1,'rapid refreshes share one pending request');
  await page.evaluate(()=>window.smoke.finishRefresh());
  await page.locator('#settings').click();
  const codexSetting=page.locator('#provider-settings input[aria-label="Codex"]');
  await page.evaluate(()=>window.smoke.failSave=true);
  await codexSetting.click();
  await page.waitForFunction(()=>{const input=document.querySelector('#provider-settings input[aria-label="Codex"]');return !input.disabled&&input.checked;});
  assert.equal(await codexSetting.evaluate(element=>element===document.activeElement),true,'failed settings saves restore focus');
  assert.match(await page.locator('#notice').innerText(),/Could not save/);
  assert.equal(await page.evaluate(()=>window.smoke.settings.disabled.includes('codex')),false,'failed saves preserve stored preference');
  await codexSetting.click();
  await page.waitForFunction(()=>window.smoke.settings.disabled.includes('codex'));
  assert.equal(await page.locator('[data-provider="codex"]').count(),0,'successful save updates enabled providers');
  const ringOf=id=>page.locator('[data-provider="'+id+'"]').evaluate(element=>element.style.getPropertyValue('--ring-color'));
  assert.equal(await page.locator('#ring-modes button').count(),3,'ring color offers urgency, one accent and per provider');
  assert.equal(await page.locator('#ring-modes [data-value="urgency"]').getAttribute('aria-checked'),'true','urgency starts selected');
  assert.equal(await page.locator('#ring-swatches').isVisible(),false,'accent swatches stay hidden outside the accent mode');
  assert.equal(await ringOf('claude'),'#8a5a12','urgency warns on a 62% reading in the light scheme');
  await page.locator('#ring-modes [data-value="accent"]').click();
  await page.waitForFunction(()=>window.smoke.settings.ring_color==='teal');
  assert.equal(await page.locator('#ring-swatches button').count(),6,'the accent mode reveals six presets');
  assert.equal(await page.locator('#ring-swatches [data-ring="teal"]').getAttribute('aria-checked'),'true','the accent mode selects a concrete hue');
  assert.equal(await ringOf('claude'),'#006d77','one accent paints every ring the same hue');
  await page.locator('#ring-swatches [data-ring="rose"]').click();
  await page.waitForFunction(()=>window.smoke.settings.ring_color==='rose');
  assert.equal(await ringOf('claude'),'#be185d','picking a preset repaints the rings');
  await page.locator('#ring-modes [data-value="provider"]').click();
  await page.waitForFunction(()=>window.smoke.settings.ring_color==='provider');
  assert.equal(await page.locator('#ring-swatches').isVisible(),false,'leaving the accent mode hides its swatches');
  assert.equal(await ringOf('claude'),'','provider colors clear the ring override');
  await page.locator('#back').click();
  const gridBox=await page.locator('[data-provider="claude"]').boundingBox();
  await page.locator('#settings').click();
  await page.locator('#layout-modes [data-value="stack"]').click();
  await page.waitForFunction(()=>window.smoke.settings.layout==='stack');
  await page.locator('#back').click();
  assert.equal(await page.locator('.provider-row').count(),7,'the stack layout renders one row per enabled provider');
  assert.equal(await page.locator('.provider').count(),0,'switching layouts replaces the grid tiles');
  const stackBox=await page.locator('[data-provider="claude"]').boundingBox();
  assert.ok(stackBox.width>gridBox.width,'stack rows span the popup width');
  await page.locator('[data-provider="claude"]').click();
  await page.waitForFunction(()=>!document.getElementById('detail').hidden);
  assert.match(await page.locator('#detail').innerText(),/Current session/);
  await context.close();
  console.log('PASS live updates between pointerdown/up, DOM/focus stability, Escape, refresh/close single flight, failed/successful setting saves, ring color modes, stack layout');
  const feedback=await openFixture(8,{width:400,height:620},'light',true);
  const baseline=await settleResizes(feedback.page);
  let detailHeight;
  for(let cycle=0;cycle<3;cycle++){
    await feedback.page.locator('[data-provider="codex"]').click();
    const detail=await settleResizes(feedback.page);
    assert.ok(detail.height>baseline.height,'opening details grows the viewport');
    detailHeight??=detail.height;
    assert.equal(detail.height,detailHeight,'detail height is stable across repeated cycles');
    await feedback.page.locator('#settings').click();
    const settings=await settleResizes(feedback.page);
    assert.equal(settings.height,620,'settings are clamped to the synthetic work area');
    assert.ok(await feedback.page.locator('#settings-page').evaluate(element=>element.scrollHeight>element.clientHeight),'clamped settings scroll');
    await feedback.page.locator('#acrylic').scrollIntoViewIfNeeded();
    assert.ok(await feedback.page.locator('#settings-page').evaluate(element=>element.scrollTop>0));
    await feedback.page.locator('#back').click();
    assert.equal((await settleResizes(feedback.page)).height,detailHeight,'back restores the prior detail height');
    await feedback.page.keyboard.press('Escape');
    assert.equal((await settleResizes(feedback.page)).height,baseline.height,'collapsing returns to the exact overview height');
  }
  const settled=await settleResizes(feedback.page);
  assert.ok(settled.calls-baseline.calls<=24,'twelve view transitions have at most two resize requests each');
  await checkGeometry(feedback.page,8,400);
  await feedback.context.close();
  console.log('PASS resize feedback: 3 grow/shrink cycles, overview '+baseline.height+'px, detail '+detailHeight+'px, settings clamped to 620px, '+(settled.calls-baseline.calls)+' resize requests for 12 transitions');

  const contrast=await openFixture(8);
  await contrast.page.emulateMedia({forcedColors:'active'});
  await contrast.page.keyboard.press('Tab');
  const focus=await contrast.page.locator(':focus').evaluate(element=>{
    const style=getComputedStyle(element);return {visible:element.matches(':focus-visible'),width:parseFloat(style.outlineWidth),style:style.outlineStyle};
  });
  assert.ok(focus.visible&&focus.width>=2&&focus.style!=='none','forced-colors keyboard focus remains visible');
  await contrast.page.locator('#settings').click();
  const checkbox=contrast.page.locator('#start-minimized');
  const checkboxStyle=await checkbox.evaluate(element=>({appearance:getComputedStyle(element).appearance,before:getComputedStyle(element,'::before').display,rect:{width:element.clientWidth,height:element.clientHeight}}));
  assert.equal(checkboxStyle.appearance,'auto','forced-colors uses a native checkbox');
  assert.equal(checkboxStyle.before,'none','the custom switch thumb is hidden in forced colors');
  assert.ok(checkboxStyle.rect.width>=22&&checkboxStyle.rect.height>=22,'the forced-colors checkbox remains visible');
  await checkbox.focus();
  await contrast.page.keyboard.press('Space');
  await contrast.page.waitForFunction(()=>window.smoke.settings.start_minimized===false);
  assert.equal(await checkbox.isChecked(),false,'forced-colors checkbox remains keyboard operable');
  await contrast.context.close();
  assert.deepEqual(errors,[],'all browser scenarios are free of uncaught page errors');
  console.log('PASS forced colors: visible keyboard focus, native checkbox, keyboard toggle');
  console.log('PASS 9 browser scenarios; no uncaught page errors.');
  console.log('Browser checks use a synthetic Tauri bridge; they do not verify native window placement.');
}finally{
  await browser?.close();
  await new Promise(resolve=>server.close(resolve));
}
