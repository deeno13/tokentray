import {PROVIDERS,percent,resetText,shortResetText,statusText,ageText,visibleWindows,innerWindow,enabledProviders,POPUP_WIDTH,accountText,tileStatus,oldestRead,reportingCount,discovery,LAYOUTS,layoutId,RING_MODES,RING_ACCENTS,DEFAULT_ACCENT,RING_COLORS,ringMode,ringHex,accentHex,toneHex,providerSwatch} from './model.mjs';
const native = !!window.__TAURI__;
const invoke = (name,args) => window.__TAURI__.core.invoke(name,args);
const $ = id => document.getElementById(id);
const OUTER = 175.93, INNER = 131.95;
let accounts = {}, startupEnabled=false, startupAvailable=!native, settingsBusy=false;
let snapshots = {}, settings = {disabled:[],acrylic:true,start_minimized:true,ring_color:'urgency',layout:'grid'}, selected = null, page = 'overview';
function node(tag,className,text) { const n=document.createElement(tag);if(className)n.className=className;if(text!=null)n.textContent=text;return n; }
let noticeTimer=0;
function notice(message,transient) {
  clearTimeout(noticeTimer);noticeTimer=0;
  $('notice').textContent=message;$('notice').hidden=!message;
  if(message&&transient)noticeTimer=setTimeout(()=>notice(''),5000);
  resize();
}
function dark() { return matchMedia('(prefers-color-scheme: dark)').matches; }
function firstRun() { return settings.onboarded===false; }

// Keep click targets intact while background readings update. Switching layouts rebuilds
// the list once; readings after that reuse the same buttons.
const providerButtons=new Map();
let builtLayout=null, revealedProvider=null;
function enterPage(el,back) {
  el.classList.remove('enter-forward','enter-back');
  void el.offsetWidth;
  el.classList.add(back?'enter-back':'enter-forward');
}
function ns(tag) { return document.createElementNS('http://www.w3.org/2000/svg',tag); }
function ringSvg() {
  const svg=ns('svg');svg.setAttribute('viewBox','0 0 64 64');svg.setAttribute('aria-hidden','true');
  const circles={};
  for(const which of ['outer','inner'])for(const type of ['track','fill']) {
    const circle=ns('circle');circle.setAttribute('cx','32');circle.setAttribute('cy','32');
    circle.setAttribute('r',which==='outer'?'28':'21');circle.setAttribute('class',type+' '+which);
    circles[type+'-'+which]=circle;svg.append(circle);
  }
  return {svg,circles};
}
function selectProvider(id) { selected=selected===id?null:id;render(); }
function createTile(provider) {
  const button=node('button','provider '+provider.id);button.type='button';button.dataset.provider=provider.id;
  button.setAttribute('aria-controls','detail');
  const ring=node('span','ring'), value=node('strong','value'), {svg,circles}=ringSvg();
  ring.append(svg,value);
  const text=node('span','provider-text'), name=node('span','provider-name',provider.name), status=node('span','provider-status');
  text.append(name,status);button.append(ring,text);
  button.addEventListener('click',()=>selectProvider(provider.id));
  return {button,value,status,circles,svg};
}
function createRow(provider) {
  const button=node('button','provider-row '+provider.id);button.type='button';button.dataset.provider=provider.id;
  button.setAttribute('aria-controls','detail');
  const top=node('span','row-top'), name=node('span','provider-name',provider.name), value=node('strong','value');
  top.append(name,value);
  const outer=node('progress');outer.max=100;
  const meta=node('span','row-meta'), window_=node('span'), reset=node('span','reset');
  meta.append(window_,reset);
  const innerWrap=node('span','row-inner'), inner=node('progress'), secondary=node('span');
  inner.max=100;innerWrap.append(inner,secondary);
  button.append(top,outer,meta,innerWrap);
  button.addEventListener('click',()=>selectProvider(provider.id));
  return {button,value,outer,window:window_,reset,innerWrap,inner,secondary};
}

// One reading, resolved once per provider so the grid, the stack and the details agree.
function readingOf(provider,now) {
  const s=snapshots[provider.id], windows=visibleWindows(s), p=percent(windows[0]);
  const inner=innerWindow(windows), ip=percent(inner);
  const status=s?.status;
  const signedOut=['needsAuth','absent'].includes(status);
  const unreachable=['error','unavailable','backoff'].includes(status);
  const stale=!signedOut&&!unreachable&&(status==='stale'||(!!s?.fetched_at&&now-s.fetched_at>360000));
  const state=signedOut?'signin':unreachable?'error':stale?'stale':p==null?'empty':'ok';
  const hex=state==='error'?toneHex(100,dark()):state==='stale'?null:ringHex(settings.ring_color,p,dark());
  const innerHex=state==='ok'?ringHex(settings.ring_color,ip,dark()):null;
  const value=windows[0]?.count!=null?'~'+windows[0].count:p==null?'—':p+'%';
  return {s,windows,p,inner,ip,state,hex,innerHex,value,tile:tileStatus(s,now),status:statusText(s,now)};
}
function describe(provider,r) {
  const parts=[];
  if(r.p!=null)parts.push(r.windows[0].label+' '+r.p+'%');else if(r.windows[0]?.count!=null)parts.push(r.windows[0].label+' ~'+r.windows[0].count);
  if(r.ip!=null)parts.push(r.inner.label+' '+r.ip+'%');
  return provider.name+': '+(parts.length?parts.join(', ')+', '+r.status:r.status)+'. '+(selected===provider.id?'Hide':'Show')+' details';
}
function paint(element,hex,property='--ring-color') {
  if(hex)element.style.setProperty(property,hex);else element.style.removeProperty(property);
}
function renderOverview(providers,now) {
  const layout=layoutId(settings.layout), list=$('providers');
  if(builtLayout!==layout){providerButtons.clear();list.replaceChildren();builtLayout=layout;}
  list.dataset.layout=layout;
  const enabled=new Set(providers.map(p=>p.id));
  for(const child of [...list.children])if(!child.dataset.provider||!enabled.has(child.dataset.provider))child.remove();
  for(const [position,provider] of providers.entries()) {
    const r=readingOf(provider,now);
    if(!providerButtons.has(provider.id))providerButtons.set(provider.id,layout==='grid'?createTile(provider):createRow(provider));
    const entry=providerButtons.get(provider.id), {button}=entry;
    button.setAttribute('aria-expanded',String(selected===provider.id));
    button.setAttribute('aria-label',describe(provider,r));
    button.dataset.state=r.state;
    entry.value.textContent=r.value;
    paint(button,r.hex);paint(button,r.innerHex,'--inner-color');
    if(layout==='grid') {
      entry.status.textContent=r.tile.text;entry.status.dataset.tone=r.tile.tone;
      entry.svg.classList.toggle('single',r.ip==null);
      entry.circles['fill-outer'].setAttribute('stroke-dasharray',Math.min(100,r.p??0)*(OUTER/100)+' '+OUTER);
      entry.circles['fill-inner'].setAttribute('stroke-dasharray',Math.min(100,r.ip??0)*(INNER/100)+' '+INNER);
    } else {
      entry.outer.value=Math.min(100,r.p??0);entry.outer.setAttribute('aria-label',provider.name+', '+(r.windows[0]?.label??'no allowance')+': '+r.value);
      entry.window.textContent=r.windows[0]?.label??r.tile.text;
      entry.reset.textContent=r.windows[0]?r.windows[0].count!=null?'Activity only':resetText(r.windows[0].resets_at,now):'';
      entry.innerWrap.hidden=r.ip==null;
      if(r.ip!=null){entry.inner.value=Math.min(100,r.ip);entry.inner.setAttribute('aria-label',provider.name+', '+r.inner.label+': '+r.ip+'%');
        entry.secondary.textContent=r.inner.label+' '+r.ip+'% · '+(shortResetText(r.inner.resets_at,now)??'reset unavailable');}
    }
    if(list.children[position]!==button)list.insertBefore(button,list.children[position]??null);
  }
  if(!providers.length&&!list.querySelector('.empty')) {
    const empty=node('div','empty');
    empty.append(node('span','empty-mark'),node('span','empty-title','Nothing to watch yet'),
      node('p','','Pick the tools TokenTray should keep an eye on. It only reads sessions you are already signed in to.'));
    const choose=node('button',null,'Choose providers');choose.type='button';
    choose.addEventListener('click',()=>showPage('settings'));
    empty.append(choose);list.append(empty);
  }
}
function renderDetail(now) {
  $('detail').replaceChildren();$('detail').hidden=!selected;
  if(!selected)return;
  const provider=PROVIDERS.find(p=>p.id===selected), r=readingOf(provider,now);
  const body=node('div','provider-body'), heading=node('div','detail-heading');
  heading.append(node('span','detail-name',provider.name),node('span','detail-account',accountText(accounts[selected],r.s)));
  body.append(heading);
  if(['needsAuth','absent'].includes(r.s?.status))body.append(node('p','guidance',provider.help));
  for(const w of r.windows) {
    const row=node('div','window'), line=node('div','window-heading'), p=percent(w);
    const amount=node('strong','',w.count!=null?`~${w.count}`:p==null?'—':`${p}%`);
    paint(amount,ringHex(settings.ring_color,p,dark()));
    line.append(node('span','',w.label),amount);row.append(line);
    if(p!=null) {
      const progress=node('progress');progress.max=100;progress.value=Math.min(100,p);
      progress.setAttribute('aria-label',`${provider.name}, ${w.label}: ${p}%`);
      paint(progress,ringHex(settings.ring_color,p,dark()));row.append(progress);
    }
    const when=Number.isFinite(w.resets_at)&&w.resets_at>0?new Date(w.resets_at):null;
    const reset=node('span','reset',w.count!=null?'Activity only':resetText(w.resets_at,now)+(when?' · '+when.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):''));
    if(when)reset.title=when.toLocaleString();row.append(reset);body.append(row);
  }
  if(r.s?.note&&r.s.note!=='Codex app-server')body.append(node('p','guidance',r.s.note));
  body.append(node('div','source',`${provider.source} · ${ageText(r.s?.fetched_at,now)}`));
  if(selected!==revealedProvider)body.classList.add('detail-enter');
  $('detail').className=provider.id;$('detail').append(body);
}
function render() {
  const now=Date.now(), providers=enabledProviders(settings);
  if(!providers.some(p=>p.id===selected))selected=null;
  renderOverview(providers,now);
  renderDetail(now);
  revealedProvider=selected;
  const oldest=oldestRead(providers,snapshots);
  $('freshness').textContent=oldest?'read '+ageText(oldest,now):'';
  $('freshness').hidden=!oldest;
  updateAccounts();
  $('provider-count').textContent=`${providers.length} on · ${reportingCount(providers,snapshots)} reporting`;
  if(firstRun())renderDiscovery();
  resize();
}
function renderDiscovery() {
  const list=$('discovery-list');list.replaceChildren();
  for(const entry of discovery(snapshots)) {
    const row=node('div','discovery-row');
    row.append(node('span','discovery-name',entry.name),node('span','discovery-state',entry.state));
    row.dataset.found=String(entry.found);list.append(row);
  }
}
let resizeFrame=0, resizing=false, resizeAgain=false, lastSize='';
function resize() {
  if(resizeFrame)return;
  resizeFrame=requestAnimationFrame(async()=>{
    resizeFrame=0;
    if(resizing){resizeAgain=true;return;}
    const width=POPUP_WIDTH;
    document.documentElement.style.setProperty('--popup-width',width+'px');
    const content=$(page==='overview'?'overview':page==='settings'?'settings-page':'first-run');
    const header=$('first-run').hidden?document.querySelector('header').getBoundingClientRect().height:0;
    const notices=['notice','preview'].reduce((sum,id)=>sum+($(id).hidden?0:$(id).getBoundingClientRect().height),0);
    const height=Math.ceil(header+notices+content.scrollHeight+2);
    const key=width+':'+height;
    if(!native||key===lastSize)return;
    resizing=true;
    try{await invoke('resize_popup',{width,height});lastSize=key;}catch{lastSize=key;notice('Could not resize popup. Reopen TokenTray.');}
    finally{resizing=false;if(resizeAgain){resizeAgain=false;resize();}}
  });
}
function updateAccounts() {
  for(const provider of PROVIDERS){const el=$('account-'+provider.id);if(el)el.textContent=accountText(accounts[provider.id],snapshots[provider.id],settings.disabled.includes(provider.id));}
}

// A radiogroup of labelled buttons with roving focus, shared by the layout and ring modes.
function segmented(container,options,current,pick) {
  container.replaceChildren();
  const buttons=options.map(option=>{
    const button=node('button');button.type='button';button.dataset.value=option.id;
    button.setAttribute('role','radio');button.setAttribute('aria-label',option.name);
    if(option.swatch)button.append(option.swatch());
    button.append(node('span',null,option.name));
    button.addEventListener('click',()=>{if(!settingsBusy&&option.id!==current())pick(option.id);});
    container.append(button);return button;
  });
  container.addEventListener('keydown',event=>{
    const delta={ArrowRight:1,ArrowDown:1,ArrowLeft:-1,ArrowUp:-1}[event.key];
    if(delta==null&&event.key!=='Home'&&event.key!=='End')return;
    event.preventDefault();
    const at=buttons.findIndex(button=>button.dataset.value===current());
    const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(at+delta+buttons.length)%buttons.length;
    buttons[next].focus();buttons[next].click();
  });
  return buttons;
}
function syncGroup(container,active) {
  for(const button of container.querySelectorAll('[data-value],[data-ring]')) {
    const on=(button.dataset.value??button.dataset.ring)===active;
    button.setAttribute('aria-checked',String(on));button.tabIndex=on?0:-1;
  }
}
function pickRingMode(mode) {
  if(mode==='accent')saveSettings({ring_color:RING_ACCENTS.some(a=>a.id===settings.ring_color)?settings.ring_color:DEFAULT_ACCENT},'Could not save ring color. Try again.');
  else saveSettings({ring_color:mode},'Could not save ring color. Try again.');
}
function showPage(next) {
  if(page===next)return;
  const back=next==='overview';
  page=next;
  $('overview').hidden=next!=='overview';$('settings-page').hidden=next!=='settings';$('first-run').hidden=next!=='first-run';
  document.querySelector('header').hidden=next==='first-run';
  enterPage($(next==='overview'?'overview':next==='settings'?'settings-page':'first-run'),back);
  $('settings').setAttribute('aria-expanded',String(next==='settings'));resize();
  if(next==='settings')$('back').focus();else if(back)$('settings').focus();
}
async function persist(next) {
  if(native)await invoke('save_settings',{settings:next});else localStorage.setItem('tokentray-settings',JSON.stringify(next));
  settings=next;
  if(!firstRun()&&page==='first-run'){page='overview';$('first-run').hidden=true;$('overview').hidden=false;document.querySelector('header').hidden=false;}
  render();
}
function setSettingsBusy(busy) {
  settingsBusy=busy;
  document.querySelectorAll('#settings-page input,.segmented button,#ring-swatches button').forEach(el=>el.disabled=busy);
  $('startup').disabled=busy||!startupAvailable;
  $('settings-page').setAttribute('aria-busy',String(busy));
}
function syncSettingsControls() {
  for(const provider of PROVIDERS){const input=$('toggle-'+provider.id);if(input)input.checked=!settings.disabled.includes(provider.id);}
  $('acrylic').checked=settings.acrylic;
  $('start-minimized').checked=settings.start_minimized!==false;
  $('startup').checked=startupEnabled;
  syncGroup($('layout-modes'),layoutId(settings.layout));
  const mode=ringMode(settings.ring_color);
  syncGroup($('ring-modes'),mode);
  $('ring-swatches').hidden=mode!=='accent';
  syncGroup($('ring-swatches'),settings.ring_color);
  for(const swatch of $('ring-swatches').querySelectorAll('[data-ring]'))swatch.style.background=accentHex(swatch.dataset.ring,dark());
}
async function changeSettings(action,errorMessage) {
  if(settingsBusy){syncSettingsControls();return;}
  const focused=document.activeElement;
  setSettingsBusy(true);
  try{await action();}catch{notice(errorMessage);}
  finally{
    syncSettingsControls();setSettingsBusy(false);
    if(page==='settings'&&focused?.isConnected&&!focused.disabled&&(document.activeElement===document.body||document.activeElement===focused))focused.focus({preventScroll:true});
  }
}
function saveSettings(patch,errorMessage,afterSave) {
  return changeSettings(async()=>{await persist({...settings,...patch});if(afterSave)await afterSave();notice('');},errorMessage);
}
function renderSettings() {
  segmented($('layout-modes'),LAYOUTS.map(l=>({...l,swatch:()=>layoutGlyph(l.id)})),()=>layoutId(settings.layout),
    id=>saveSettings({layout:id},'Could not save layout. Try again.'));
  segmented($('ring-modes'),RING_MODES.map(m=>({...m,swatch:()=>ringGlyph(m.id)})),()=>ringMode(settings.ring_color),pickRingMode);
  const swatches=$('ring-swatches');swatches.replaceChildren();
  const buttons=RING_ACCENTS.map(option=>{
    const swatch=node('button');swatch.type='button';swatch.dataset.ring=option.id;
    swatch.setAttribute('role','radio');swatch.setAttribute('aria-label',option.name);swatch.title=option.name;
    swatch.addEventListener('click',()=>{if(!settingsBusy&&settings.ring_color!==option.id)saveSettings({ring_color:option.id},'Could not save ring color. Try again.');});
    swatches.append(swatch);return swatch;
  });
  swatches.addEventListener('keydown',event=>{
    const delta={ArrowRight:1,ArrowDown:1,ArrowLeft:-1,ArrowUp:-1}[event.key];
    if(delta==null&&event.key!=='Home'&&event.key!=='End')return;
    event.preventDefault();
    const at=buttons.findIndex(button=>button.dataset.ring===settings.ring_color);
    const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(at+delta+buttons.length)%buttons.length;
    buttons[next].focus();buttons[next].click();
  });
  $('provider-settings').replaceChildren();
  for(const provider of PROVIDERS) {
    const label=node('label','setting'), input=node('input');input.type='checkbox';input.id='toggle-'+provider.id;
    input.addEventListener('change',()=>{
      const disabled=new Set(settings.disabled);if(input.checked)disabled.delete(provider.id);else disabled.add(provider.id);
      saveSettings({disabled:[...disabled]},'Could not save settings. Try again.');
    });
    const copy=node('span','setting-copy'), name=node('span','setting-name',provider.name), meta=node('span','account-details');
    meta.id='account-'+provider.id;input.setAttribute('aria-label',provider.name);input.setAttribute('aria-describedby',meta.id);
    copy.append(name,meta);label.append(copy,input);$('provider-settings').append(label);
  }
  syncSettingsControls();setSettingsBusy(false);
}
function layoutGlyph(id) {
  const svg=ns('svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.setAttribute('class','glyph');
  if(id==='grid')for(const [cx,cy] of [[7.5,7.5],[16.5,7.5],[7.5,16.5],[16.5,16.5]]) {
    const circle=ns('circle');circle.setAttribute('cx',cx);circle.setAttribute('cy',cy);circle.setAttribute('r','3.2');svg.append(circle);
  } else { const path=ns('path');path.setAttribute('d','M4 7h16M4 12h16M4 17h10');svg.append(path); }
  return svg;
}
function ringGlyph(mode) {
  const wrap=node('span','mode-swatch');
  if(mode==='urgency')for(const tone of ['ok','warn','bad']) {
    const dot=node('span','dot');dot.style.background=toneHex(tone==='ok'?0:tone==='warn'?70:95,dark());wrap.append(dot);
  } else {
    const dot=node('span','dot');
    dot.style.background=mode==='accent'?accentHex(RING_ACCENTS.some(a=>a.id===settings.ring_color)?settings.ring_color:DEFAULT_ACCENT,dark()):providerSwatch(dark());
    wrap.append(dot);
  }
  return wrap;
}
async function material() {
  const allow=settings.acrylic&&!matchMedia('(forced-colors: active)').matches&&!matchMedia('(prefers-reduced-transparency: reduce)').matches;
  const applied=native?await invoke('set_material',{enabled:allow,dark:dark()}).catch(()=>false):false;
  document.documentElement.classList.toggle('native-acrylic',applied&&allow);
}
$('startup').addEventListener('change',()=>{
  const enabled=$('startup').checked;
  changeSettings(async()=>{startupEnabled=native?await invoke('set_startup',{enabled}):enabled;notice(native?'':'Preview only. Windows startup was not changed.',true);},'Could not change Windows startup. Try again.');
});
$('start-minimized').addEventListener('change',()=>saveSettings({start_minimized:$('start-minimized').checked},'Could not save launch preference. Try again.'));
$('acrylic').addEventListener('change',()=>saveSettings({acrylic:$('acrylic').checked},'Could not save appearance. Try again.',material));
$('start-monitoring').addEventListener('click',()=>saveSettings({onboarded:true},'Could not save setup. Try again.'));
for(const query of ['(prefers-color-scheme: dark)','(forced-colors: active)','(prefers-reduced-transparency: reduce)'])matchMedia(query).addEventListener('change',()=>{renderSettings();render();material();});
$('settings').addEventListener('click',()=>showPage(page==='settings'?'overview':'settings'));
$('back').addEventListener('click',()=>showPage('overview'));
let hiding=false;
async function hide() {
  if(hiding)return;
  if(!native){notice('Browser preview. The Windows app closes to its tray icon.',true);return;}
  hiding=true;
  try{await invoke('hide_popup');}catch{notice('Could not close popup. Use the tray menu to quit.');}finally{hiding=false;}
}
$('close').addEventListener('click',hide);
$('settings-close').addEventListener('click',hide);
document.addEventListener('keydown',e=>{
  if(e.key!=='Escape'||e.defaultPrevented||e.isComposing)return;
  e.preventDefault();
  if(e.repeat)return;
  if(page==='settings')showPage('overview');
  else if(page==='overview'&&selected){const button=providerButtons.get(selected)?.button;selected=null;render();button?.focus({preventScroll:true});}
  else hide();
});
$('refresh').addEventListener('click',async()=>{
  if($('refresh').disabled)return;
  if(!native){notice('Sample preview only. Live readings appear in the Windows app.',true);return;}
  $('refresh').disabled=true;$('refresh').setAttribute('aria-busy','true');
  try{await invoke('refresh_usage');notice('Refresh requested. Provider cooldowns still apply.',true);}catch{notice('Refresh failed. Try restarting TokenTray.');}
  setTimeout(()=>{$('refresh').disabled=false;$('refresh').setAttribute('aria-busy','false');},1500);
});
if(native){
  setSettingsBusy(true);
  try {
    settings=await invoke('get_settings');
    await window.__TAURI__.event.listen('startup-changed',e=>{startupEnabled=e.payload;$('startup').checked=startupEnabled;});
    try{startupEnabled=await invoke('get_startup');startupAvailable=true;}catch{notice('Could not read Windows startup settings.');}
    await window.__TAURI__.event.listen('accounts',e=>{accounts=e.payload;updateAccounts();resize();});
    accounts=await invoke('get_accounts');
    for(const p of PROVIDERS)await window.__TAURI__.event.listen(p.id==='claude'?'usage':p.id,e=>{snapshots[p.id]=e.payload;render();});
    await window.__TAURI__.event.listen('notice',e=>notice(e.payload));
    await window.__TAURI__.event.listen('open-settings',()=>showPage('settings'));
    snapshots=await invoke('get_all');
  }catch{notice('Could not load usage or settings. Restart TokenTray to reconnect.');}
}else{
  try{const saved=JSON.parse(localStorage.getItem('tokentray-settings'));if(saved&&Array.isArray(saved.disabled))settings={disabled:saved.disabled,acrylic:saved.acrylic!==false,start_minimized:saved.start_minimized!==false,ring_color:RING_COLORS.includes(saved.ring_color)?saved.ring_color:'urgency',layout:layoutId(saved.layout),onboarded:saved.onboarded};}catch{}
  $('preview').hidden=false;
  snapshots=Object.fromEntries(PROVIDERS.map(p=>[p.id,{status:'needsAuth',windows:[],fetched_at:0}]));
  accounts={codex:{email:'alex@example.com',plan:'plus'},claude:{email:'alex@example.com',plan:'max'},copilot:{username:'alex-dev',plan:'individual'}};
  const now=Date.now();
  snapshots.codex={status:'ok',fetched_at:now,windows:[{label:'5-hour limit',used:0.38,resets_at:now+8160000},{label:'Weekly limit',used:0.62,resets_at:now+271200000}]};
  snapshots.claude={status:'ok',fetched_at:now,windows:[{label:'Current session',used:0.74,resets_at:now+3840000},{label:'Weekly (all models)',used:0.29,resets_at:now+435600000}]};
  snapshots.cursor={status:'stale',fetched_at:now-840000,windows:[{label:'Included usage',used:0.86,resets_at:now+864000000}]};
  snapshots.copilot={status:'ok',fetched_at:now,windows:[{label:'Premium requests',used:0.16,resets_at:now+1800000000}]};
}
if(firstRun()){page='first-run';$('overview').hidden=true;$('first-run').hidden=false;document.querySelector('header').hidden=true;}
const sizeObserver=new ResizeObserver(resize);for(const el of [document.querySelector('header'),$('providers'),$('detail'),$('settings-page'),$('first-run'),$('notice')])sizeObserver.observe(el);
window.addEventListener('resize',resize);
renderSettings();render();material();setInterval(render,60000);
