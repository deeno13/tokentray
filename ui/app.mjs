import {PROVIDERS,percent,resetText,statusText,ageText,visibleWindows} from './model.mjs';
const native = !!window.__TAURI__;
const invoke = (name,args) => window.__TAURI__.core.invoke(name,args);
const $ = id => document.getElementById(id);
let snapshots = {}, filter = 'all';
let openIds = new Set(['codex','claude']);
function node(tag, className, text) { const n=document.createElement(tag); if(className)n.className=className; if(text!=null)n.textContent=text; return n; }
function notice(message) { $('notice').textContent=message; $('notice').hidden=!message; }
function render() {
  const fragment=document.createDocumentFragment(); let count=0;
  for(const provider of PROVIDERS) {
    const s=snapshots[provider.id], windows=visibleWindows(s); if(windows.length)count++;
    if(filter==='available'&&!windows.length)continue;
    const details=node('details',`provider ${provider.id}`); details.open=openIds.has(provider.id);
    details.addEventListener('toggle',()=>details.open?openIds.add(provider.id):openIds.delete(provider.id));
    const summary=node('summary'); const ring=node('span','ring');
    const ns='http://www.w3.org/2000/svg', svg=document.createElementNS(ns,'svg'); svg.setAttribute('viewBox','0 0 44 44');svg.setAttribute('aria-hidden','true');
    for(const type of ['track','fill']) { const c=document.createElementNS(ns,'circle');c.setAttribute('cx','22');c.setAttribute('cy','22');c.setAttribute('r','19');c.setAttribute('class',type);if(type==='fill'){const pct=percent(windows[0]);c.setAttribute('stroke-dasharray',`${Math.min(100,pct??0)*1.194} 119.4`);}svg.append(c); }
    ring.append(svg,node('span','mark',provider.mark));
    const title=node('div','provider-title');title.append(node('h3','',provider.name),node('span','provider-status',statusText(s)));
    const p=percent(windows[0]); const value=windows[0]?.count!=null?`~${windows[0].count}`:p==null?'—':`${p}%`;
    const metric=node('div','metric');metric.append(node('strong','',value),node('span','',windows[0]?.count!=null?'count':p==null?'no reading':'used'));
    if(p>=100)details.classList.add('exhausted');else if(p>=80)details.classList.add('near-limit');
    if(statusText(s)==='Stale')details.classList.add('stale');
    const chevron=node('span','chevron');chevron.setAttribute('aria-hidden','true');
    summary.append(ring,title,metric,chevron);details.append(summary);
    const body=node('div','provider-body');
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
    details.append(body);fragment.append(details);
  }
  if(!fragment.children.length)fragment.append(node('p','empty','No usage readings yet. Choose All agents for connection guidance.'));
  $('providers').replaceChildren(fragment); $('connected').textContent=`${count} with usage`;
}
async function material() {
  const dark=matchMedia('(prefers-color-scheme: dark)').matches;
  const allow=$('acrylic').checked&&!matchMedia('(forced-colors: active)').matches&&!matchMedia('(prefers-reduced-transparency: reduce)').matches;
  const applied=native ? await invoke('set_material',{enabled:allow,dark}).catch(()=>false) : false;
  document.documentElement.classList.toggle('native-acrylic',applied&&allow);
}
$('acrylic').addEventListener('change',material);
for(const query of ['(prefers-color-scheme: dark)','(forced-colors: active)','(prefers-reduced-transparency: reduce)'])matchMedia(query).addEventListener('change',material);
for(const id of ['all','available'])$(id).addEventListener('click',()=>{filter=id;for(const b of ['all','available']){$(b).classList.toggle('selected',b===id);$(b).setAttribute('aria-pressed',String(b===id));}render();});
async function hide() { if(native)await invoke('hide_popup').catch(()=>notice('Could not close popup. Use the tray menu to quit.'));else notice('Browser preview. The Windows app closes to its tray icon.'); }
$('close').addEventListener('click',hide);document.addEventListener('keydown',e=>{if(e.key==='Escape')hide();});
$('refresh').addEventListener('click',async()=>{
  if(!native){notice('Sample preview only. Live readings appear in the Windows app.');return;}
  $('refresh').disabled=true;
  try{await invoke('refresh_usage');notice('Refresh requested. Provider cooldowns still apply.');}catch{notice('Refresh failed. Try restarting TokenTray.');}
  setTimeout(()=>$('refresh').disabled=false,1500);
});
if(native){
  try {
    for(const p of PROVIDERS)await window.__TAURI__.event.listen(p.id==='claude'?'usage':p.id,e=>{snapshots[p.id]=e.payload;render();});
    await window.__TAURI__.event.listen('notice',e=>notice(e.payload));
    snapshots=await invoke('get_all');
  }catch{notice('Could not load usage. Restart TokenTray to reconnect.');}
}else{
  notice('Design preview · sample data · native Acrylic appears in the Windows app');
  snapshots=Object.fromEntries(PROVIDERS.map(p=>[p.id,{status:'needsAuth',windows:[],fetched_at:0}]));
  const now=Date.now();
  snapshots.codex={status:'ok',fetched_at:now,windows:[{label:'5-hour limit',used:0.38,resets_at:now+8160000},{label:'Weekly limit',used:0.62,resets_at:now+271200000}]};
  snapshots.claude={status:'ok',fetched_at:now,windows:[{label:'Current session',used:0.74,resets_at:now+3840000},{label:'Weekly (all models)',used:0.29,resets_at:now+435600000}]};
  snapshots.cursor={status:'stale',fetched_at:now-720000,windows:[{label:'Included usage',used:0.86,resets_at:now+864000000}]};
  snapshots.copilot={status:'ok',fetched_at:now,windows:[{label:'Premium requests',used:0.16,resets_at:now+1800000000}]};
}
render();material();setInterval(render,60000);
