import {PROVIDERS,percent,resetText,statusText,ageText,visibleWindows,enabledProviders,POPUP_WIDTH,accountText} from './model.mjs';
const native = !!window.__TAURI__;
const invoke = (name,args) => window.__TAURI__.core.invoke(name,args);
const $ = id => document.getElementById(id);
let accounts = {}, startupEnabled=false, startupAvailable=!native, settingsBusy=false;
let snapshots = {}, settings = {disabled:[],acrylic:true,start_minimized:true}, selected = null, settingsOpen = false;
function node(tag,className,text) { const n=document.createElement(tag);if(className)n.className=className;if(text!=null)n.textContent=text;return n; }
function notice(message) { $('notice').textContent=message;$('notice').hidden=!message;resize(); }

// Keep click targets intact while background readings update.
const providerButtons=new Map();
let revealedProvider=null;
function enterPage(el,back) {
  el.classList.remove('enter-forward','enter-back');
  void el.offsetWidth;
  el.classList.add(back?'enter-back':'enter-forward');
}
function createProviderButton(provider) {
  const button=node('button','provider '+provider.id);button.type='button';button.dataset.provider=provider.id;
  button.setAttribute('aria-controls','detail');
  const ring=node('span','ring'), value=node('strong','value');
  const ns='http://www.w3.org/2000/svg', svg=document.createElementNS(ns,'svg');
  svg.setAttribute('viewBox','0 0 64 64');svg.setAttribute('aria-hidden','true');
  let fill;
  for(const type of ['track','fill']) {
    const circle=document.createElementNS(ns,'circle');circle.setAttribute('cx','32');circle.setAttribute('cy','32');circle.setAttribute('r','28');circle.setAttribute('class',type);
    if(type==='fill')fill=circle;svg.append(circle);
  }
  ring.append(svg,value);
  const status=node('span','provider-status');button.append(ring,node('span','provider-name',provider.name),status);
  button.addEventListener('click',()=>{selected=selected===provider.id?null:provider.id;render();});
  return {button,value,status,fill};
}
function render() {
  const providers=enabledProviders(settings);
  if(!providers.some(p=>p.id===selected))selected=null;
  const list=$('providers'), enabled=new Set(providers.map(p=>p.id));
  for(const child of [...list.children])if(!enabled.has(child.dataset.provider))child.remove();
  for(const [position,provider] of providers.entries()) {
    const s=snapshots[provider.id], windows=visibleWindows(s), p=percent(windows[0]);
    if(!providerButtons.has(provider.id))providerButtons.set(provider.id,createProviderButton(provider));
    const entry=providerButtons.get(provider.id), {button}=entry;
    button.setAttribute('aria-expanded',String(selected===provider.id));
    const value=windows[0]?.count!=null?'~'+windows[0].count:p==null?'—':p+'%';
    const st=statusText(s);
    button.setAttribute('aria-label',provider.name+': '+(p==null&&windows[0]?.count==null?st:value+', '+st)+'. '+(selected===provider.id?'Hide':'Show')+' details');
    entry.value.textContent=value;entry.status.textContent=st;
    entry.fill.setAttribute('stroke-dasharray',Math.min(100,p??0)*1.7593+' 175.93');
    if(list.children[position]!==button)list.insertBefore(button,list.children[position]??null);
  }
  if(!providers.length)list.append(node('p','empty','No providers enabled. Choose providers in Settings.'));
  $('detail').replaceChildren();$('detail').hidden=!selected;
  if(selected) {
    const provider=PROVIDERS.find(p=>p.id===selected), s=snapshots[selected], windows=visibleWindows(s);
    const body=node('div','provider-body');body.append(node('h2','',provider.name));
    if(statusText(s)!=='Updated')body.append(node('p','guidance',statusText(s)));
    if(!windows.length)body.append(node('p','guidance',provider.help));
    for(const w of windows) {
      const row=node('div','window'), line=node('div','window-heading'), p=percent(w);
      line.append(node('span','',w.label),node('strong','',w.count!=null?`~${w.count}`:p==null?'—':`${p}%`));row.append(line);
      if(p!=null) { const progress=node('progress');progress.max=100;progress.value=Math.min(100,p);progress.setAttribute('aria-label',`${provider.name}, ${w.label}: ${p}%`);row.append(progress); }
      const reset=node('span','reset',w.count!=null?'Activity only':resetText(w.resets_at));
      if(w.resets_at)reset.title=new Date(w.resets_at).toLocaleString();row.append(reset);body.append(row);
    }
    if(s?.note&&s.note!=='Codex app-server')body.append(node('p','guidance',s.note));
    body.append(node('div','source',`${provider.source} · ${ageText(s?.fetched_at)}`));
    if(selected!==revealedProvider)body.classList.add('detail-enter');
    $('detail').className=provider.id;$('detail').append(body);
  }
  revealedProvider=selected;
  updateAccounts();resize();
}
let resizeFrame=0, resizing=false, resizeAgain=false, lastSize='';
function resize() {
  if(resizeFrame)return;
  resizeFrame=requestAnimationFrame(async()=>{
    resizeFrame=0;
    if(resizing){resizeAgain=true;return;}
    const width=POPUP_WIDTH;
    document.documentElement.style.setProperty('--popup-width',width+'px');
    const content=settingsOpen?$('settings-page'):$('overview');
    const header=document.querySelector('header').getBoundingClientRect().height;
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
function showSettings(open) {
  if(settingsOpen===open)return;
  settingsOpen=open;$('settings-page').hidden=!open;$('overview').hidden=open;
  enterPage(open?$('settings-page'):$('overview'),!open);
  $('settings').setAttribute('aria-expanded',String(open));resize();
  if(open)$('back').focus();else $('settings').focus();
}
async function persist(next) {
  if(native)await invoke('save_settings',{settings:next});else localStorage.setItem('tokentray-settings',JSON.stringify(next));
  settings=next;render();
}
function setSettingsBusy(busy) {
  settingsBusy=busy;
  document.querySelectorAll('#settings-page input').forEach(el=>el.disabled=busy);
  $('startup').disabled=busy||!startupAvailable;
  $('settings-page').setAttribute('aria-busy',String(busy));
}
function syncSettingsControls() {
  for(const provider of PROVIDERS){const input=$('toggle-'+provider.id);if(input)input.checked=!settings.disabled.includes(provider.id);}
  $('acrylic').checked=settings.acrylic;
  $('start-minimized').checked=settings.start_minimized!==false;
  $('startup').checked=startupEnabled;
}
async function changeSettings(action,errorMessage) {
  if(settingsBusy){syncSettingsControls();return;}
  const focused=document.activeElement;
  setSettingsBusy(true);
  try{await action();}catch{notice(errorMessage);}
  finally{
    syncSettingsControls();setSettingsBusy(false);
    if(settingsOpen&&focused?.isConnected&&!focused.disabled&&(document.activeElement===document.body||document.activeElement===focused))focused.focus({preventScroll:true});
  }
}
function saveSettings(patch,errorMessage,afterSave) {
  return changeSettings(async()=>{await persist({...settings,...patch});if(afterSave)await afterSave();notice('');},errorMessage);
}
function renderSettings() {
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
async function material() {
  const dark=matchMedia('(prefers-color-scheme: dark)').matches;
  const allow=settings.acrylic&&!matchMedia('(forced-colors: active)').matches&&!matchMedia('(prefers-reduced-transparency: reduce)').matches;
  const applied=native?await invoke('set_material',{enabled:allow,dark}).catch(()=>false):false;
  document.documentElement.classList.toggle('native-acrylic',applied&&allow);
}
$('startup').addEventListener('change',()=>{
  const enabled=$('startup').checked;
  changeSettings(async()=>{startupEnabled=native?await invoke('set_startup',{enabled}):enabled;notice(native?'':'Preview only. Windows startup was not changed.');},'Could not change Windows startup. Try again.');
});
$('start-minimized').addEventListener('change',()=>saveSettings({start_minimized:$('start-minimized').checked},'Could not save launch preference. Try again.'));
$('acrylic').addEventListener('change',()=>saveSettings({acrylic:$('acrylic').checked},'Could not save appearance. Try again.',material));
for(const query of ['(prefers-color-scheme: dark)','(forced-colors: active)','(prefers-reduced-transparency: reduce)'])matchMedia(query).addEventListener('change',material);
$('settings').addEventListener('click',()=>showSettings(!settingsOpen));$('back').addEventListener('click',()=>showSettings(false));
let hiding=false;
async function hide() {
  if(hiding)return;
  if(!native){notice('Browser preview. The Windows app closes to its tray icon.');return;}
  hiding=true;
  try{await invoke('hide_popup');}catch{notice('Could not close popup. Use the tray menu to quit.');}finally{hiding=false;}
}
$('close').addEventListener('click',hide);
document.addEventListener('keydown',e=>{
  if(e.key!=='Escape'||e.defaultPrevented||e.isComposing)return;
  e.preventDefault();
  if(e.repeat)return;
  if(settingsOpen)showSettings(false);
  else if(selected){const button=providerButtons.get(selected)?.button;selected=null;render();button?.focus({preventScroll:true});}
  else hide();
});
$('refresh').addEventListener('click',async()=>{
  if($('refresh').disabled)return;
  if(!native){notice('Sample preview only. Live readings appear in the Windows app.');return;}
  $('refresh').disabled=true;$('refresh').setAttribute('aria-busy','true');
  try{await invoke('refresh_usage');notice('Refresh requested. Provider cooldowns still apply.');}catch{notice('Refresh failed. Try restarting TokenTray.');}
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
    snapshots=await invoke('get_all');
  }catch{notice('Could not load usage or settings. Restart TokenTray to reconnect.');}
}else{
  try{const saved=JSON.parse(localStorage.getItem('tokentray-settings'));if(saved&&Array.isArray(saved.disabled))settings={disabled:saved.disabled,acrylic:saved.acrylic!==false,start_minimized:saved.start_minimized!==false};}catch{}
  $('preview').hidden=false;
  snapshots=Object.fromEntries(PROVIDERS.map(p=>[p.id,{status:'needsAuth',windows:[],fetched_at:0}]));
  accounts={codex:{email:'alex@example.com',plan:'plus'},claude:{email:'alex@example.com',plan:'max'},copilot:{username:'alex-dev',plan:'individual'}};
  const now=Date.now();
  snapshots.codex={status:'ok',fetched_at:now,windows:[{label:'5-hour limit',used:0.38,resets_at:now+8160000},{label:'Weekly limit',used:0.62,resets_at:now+271200000}]};
  snapshots.claude={status:'ok',fetched_at:now,windows:[{label:'Current session',used:0.74,resets_at:now+3840000},{label:'Weekly (all models)',used:0.29,resets_at:now+435600000}]};
  snapshots.cursor={status:'stale',fetched_at:now-720000,windows:[{label:'Included usage',used:0.86,resets_at:now+864000000}]};
  snapshots.copilot={status:'ok',fetched_at:now,windows:[{label:'Premium requests',used:0.16,resets_at:now+1800000000}]};
}
const sizeObserver=new ResizeObserver(resize);for(const el of [document.querySelector('header'),$('providers'),$('detail'),$('settings-page'),$('notice')])sizeObserver.observe(el);
window.addEventListener('resize',resize);
renderSettings();render();material();setInterval(render,60000);
