import {PROVIDERS,percent,resetText,statusText,ageText,visibleWindows,enabledProviders} from './model.mjs';
const native = !!window.__TAURI__;
const invoke = (name,args) => window.__TAURI__.core.invoke(name,args);
const $ = id => document.getElementById(id);
let snapshots = {}, settings = {disabled:[],acrylic:true}, selected = null, settingsOpen = false;
function node(tag, className, text) { const n=document.createElement(tag); if(className)n.className=className; if(text!=null)n.textContent=text; return n; }
function notice(message) { $('notice').textContent=message; $('notice').hidden=!message; }
function render() {
  const providers=enabledProviders(settings);
  if(!providers.some(p=>p.id===selected))selected=null;
  const fragment=document.createDocumentFragment();
  for(const provider of providers) {
    const s=snapshots[provider.id], windows=visibleWindows(s), p=percent(windows[0]);
    const button=node('button', 'provider '+provider.id); button.type='button';
    button.setAttribute('aria-expanded',String(selected===provider.id));button.setAttribute('aria-controls','detail');
    const value=windows[0]?.count!=null?'~'+windows[0].count:p==null?'—':p+'%';
    button.setAttribute('aria-label',provider.name+': '+(p==null?statusText(s):value+' used, '+statusText(s))+'. Show details');
    const ring=node('span','ring');
    const ns='http://www.w3.org/2000/svg', svg=document.createElementNS(ns,'svg'); svg.setAttribute('viewBox','0 0 64 64');svg.setAttribute('aria-hidden','true');
    for(const type of ['track','fill']) { const c=document.createElementNS(ns,'circle');c.setAttribute('cx','32');c.setAttribute('cy','32');c.setAttribute('r','28');c.setAttribute('class',type);if(type==='fill')c.setAttribute('stroke-dasharray',Math.min(100,p??0)*1.7593+' 175.93');svg.append(c); }
    ring.append(svg,node('strong','value',value));
    button.append(ring,node('span','provider-name',provider.name),node('span','provider-status',p==null?statusText(s):statusText(s)==='Updated'?'used':statusText(s)));
    button.addEventListener('click',()=>{selected=selected===provider.id?null:provider.id;render();resize();});
    fragment.append(button);
  }
  if(!providers.length)fragment.append(node('p','empty','No providers enabled. Choose providers in Settings.'));
  const focused=document.activeElement?.dataset?.provider;
  [...fragment.children].forEach((el,i)=>{if(providers[i])el.dataset.provider=providers[i].id;});
  $('providers').replaceChildren(fragment);
  if(focused)$('providers').querySelector('[data-provider="'+focused+'"]')?.focus();
  $('detail').replaceChildren();$('detail').hidden=!selected;
  if(selected) {
    const provider=PROVIDERS.find(p=>p.id===selected), s=snapshots[selected], windows=visibleWindows(s);
    const body=node('div','provider-body'); body.append(node('h2','',provider.name),node('p','guidance',statusText(s)));
    if(!windows.length)body.append(node('p','guidance',provider.help));
    for(const w of windows) {
      const row=node('div','window');const line=node('div','window-heading');const p=percent(w);
      line.append(node('span','',w.label),node('strong','',w.count!=null?`~${w.count} counted`:p==null?'Unavailable':`${p}% used`));row.append(line);
      if(p!=null) { const progress=node('progress');progress.max=100;progress.value=Math.min(100,p);progress.setAttribute('aria-label',`${provider.name}, ${w.label}: ${p}% used`);row.append(progress); }
      const reset=node('span','reset',w.count!=null?'Derived activity · no quota percentage':resetText(w.resets_at));
      if(w.resets_at)reset.title=new Date(w.resets_at).toLocaleString();row.append(reset);body.append(row);
    }
    if(s?.note && s.note!=='Codex app-server')body.append(node('p','guidance',s.note));
    body.append(node('div','source',`${provider.source} · ${ageText(s?.fetched_at)}`));

    $('detail').className=provider.id; $('detail').append(body);
  }
}
function resize() { if(native)invoke('resize_popup',{height:settingsOpen?560:selected?480:260}).catch(()=>{}); }
function showSettings(open) {
  settingsOpen=open; $('settings-page').hidden=!open; $('overview').hidden=open;
  $('settings').setAttribute('aria-expanded',String(open));resize();
  if(open)$('back').focus();else $('settings').focus();
}
async function persist(next) {
  if(native)await invoke('save_settings',{settings:next});else localStorage.setItem('tokentray-settings',JSON.stringify(next));
  settings=next;render();resize();
}
function renderSettings() {
  $('provider-settings').replaceChildren();
  for(const provider of PROVIDERS) {
    const label=node('label','setting');const input=node('input');input.type='checkbox';input.checked=!settings.disabled.includes(provider.id);
    input.addEventListener('change',async()=>{
      document.querySelectorAll('#settings-page input').forEach(el=>el.disabled=true);
      const disabled=new Set(settings.disabled);if(input.checked)disabled.delete(provider.id);else disabled.add(provider.id);
      try { await persist({...settings,disabled:[...disabled]});notice(''); } catch { input.checked=!input.checked;notice('Could not save settings. Try again.'); }
      document.querySelectorAll('#settings-page input').forEach(el=>el.disabled=false);
    });
    label.append(node('span','',provider.name),input);$('provider-settings').append(label);
  }
  $('acrylic').checked=settings.acrylic;
}
async function material() {
  const dark=matchMedia('(prefers-color-scheme: dark)').matches;
  const allow=settings.acrylic&&!matchMedia('(forced-colors: active)').matches&&!matchMedia('(prefers-reduced-transparency: reduce)').matches;
  const applied=native ? await invoke('set_material',{enabled:allow,dark}).catch(()=>false) : false;
  document.documentElement.classList.toggle('native-acrylic',applied&&allow);
}
$('acrylic').addEventListener('change',async()=>{const input=$('acrylic');document.querySelectorAll('#settings-page input').forEach(el=>el.disabled=true);try{await persist({...settings,acrylic:input.checked});await material();}catch{input.checked=settings.acrylic;notice('Could not save appearance. Try again.');}finally{document.querySelectorAll('#settings-page input').forEach(el=>el.disabled=false); }});
for(const query of ['(prefers-color-scheme: dark)','(forced-colors: active)','(prefers-reduced-transparency: reduce)'])matchMedia(query).addEventListener('change',material);
$('settings').addEventListener('click',()=>showSettings(!settingsOpen));$('back').addEventListener('click',()=>showSettings(false));
async function hide() { if(native)await invoke('hide_popup').catch(()=>notice('Could not close popup. Use the tray menu to quit.'));else notice('Browser preview. The Windows app closes to its tray icon.'); }
$('close').addEventListener('click',hide);
document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(settingsOpen)showSettings(false);else if(selected){selected=null;render();resize();}else hide();}});
$('refresh').addEventListener('click',async()=>{
  if(!native){notice('Sample preview only. Live readings appear in the Windows app.');return;}
  $('refresh').disabled=true;
  try{await invoke('refresh_usage');notice('Refresh requested. Provider cooldowns still apply.');}catch{notice('Refresh failed. Try restarting TokenTray.');}
  setTimeout(()=>$('refresh').disabled=false,1500);
});
if(native){
  try {
    settings=await invoke('get_settings');
    for(const p of PROVIDERS)await window.__TAURI__.event.listen(p.id==='claude'?'usage':p.id,e=>{snapshots[p.id]=e.payload;render();});
    await window.__TAURI__.event.listen('notice',e=>notice(e.payload));
    snapshots=await invoke('get_all');
  }catch{notice('Could not load usage or settings. Restart TokenTray to reconnect.');}
}else{
  try{const saved=JSON.parse(localStorage.getItem('tokentray-settings'));if(saved&&Array.isArray(saved.disabled))settings={disabled:saved.disabled,acrylic:saved.acrylic!==false};}catch{}
  $('preview').hidden=false;
  snapshots=Object.fromEntries(PROVIDERS.map(p=>[p.id,{status:'needsAuth',windows:[],fetched_at:0}]));
  const now=Date.now();
  snapshots.codex={status:'ok',fetched_at:now,windows:[{label:'5-hour limit',used:0.38,resets_at:now+8160000},{label:'Weekly limit',used:0.62,resets_at:now+271200000}]};
  snapshots.claude={status:'ok',fetched_at:now,windows:[{label:'Current session',used:0.74,resets_at:now+3840000},{label:'Weekly (all models)',used:0.29,resets_at:now+435600000}]};
  snapshots.cursor={status:'stale',fetched_at:now-720000,windows:[{label:'Included usage',used:0.86,resets_at:now+864000000}]};
  snapshots.copilot={status:'ok',fetched_at:now,windows:[{label:'Premium requests',used:0.16,resets_at:now+1800000000}]};
}
renderSettings();render();material();setInterval(render,60000);
