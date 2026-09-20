export const PROVIDERS = [
  {id:'codex',name:'Codex',mark:'CX',source:'Codex app-server',help:'Sign in to the native Codex CLI with your ChatGPT account.'},
  {id:'claude',name:'Claude Code',mark:'CL',source:'Claude usage endpoint',help:'Sign in with Claude Code. TokenTray reads the Windows session already on this PC.'},
  {id:'cursor',name:'Cursor',mark:'CU',source:'Cursor usage endpoint',help:'Install Cursor and sign in to your account.'},
  {id:'antigravity',name:'Antigravity',mark:'AG',source:'Local bridge / quota API',help:'Open Antigravity and sign in. Some accounts expose only an activity count.'},
  {id:'glm',name:'GLM',mark:'GL',source:'Z.ai Coding Plan',help:'Connect your Z.ai plan in Claude Code, ZCode, or OpenCode.'},
  {id:'grok',name:'Grok',mark:'GR',source:'Grok Build billing',help:'Sign in with Grok CLI using an xAI account.'},
  {id:'opencode',name:'OpenCode',mark:'OC',source:'OpenCode Go plan',help:'Connect the OpenCode Go plan in OpenCode. Other provider keys do not represent Go usage.'},
  {id:'copilot',name:'GitHub Copilot',mark:'GH',source:'Copilot quota endpoint',help:'Sign in with GitHub CLI (gh auth login) to an account with Copilot.'},
];
export function percent(w) { return w && w.count == null && Number.isFinite(w.used) && w.used >= 0 ? Math.round(w.used * 100) : null; }
export function resetText(at, now=Date.now()) {
  if (!Number.isFinite(at) || at <= 0) return 'Reset unavailable';
  if (at <= now) return 'awaiting refresh';
  const minutes = Math.ceil((at-now)/60000);
  if (minutes < 60) return `Resets in ${minutes}m`;
  const hours = Math.floor(minutes/60), rest = minutes%60;
  if (hours < 24) return `Resets in ${hours}h${rest ? ` ${rest}m` : ''}`;
  return `Resets in ${Math.floor(hours/24)}d${hours%24 ? ` ${hours%24}h` : ''}`;
}

// A grid tile has one short line under the provider name, so its countdown drops the
// "Resets in" lead and the trailing unit once the wait is measured in days.
export function shortResetText(at, now=Date.now()) {
  if (!Number.isFinite(at) || at <= 0) return null;
  if (at <= now) return 'due';
  const minutes = Math.ceil((at-now)/60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes/60), rest = minutes%60;
  if (hours < 24) return `${hours}h${rest ? ` ${rest}m` : ''}`;
  return `${Math.floor(hours/24)}d`;
}
export function statusText(s, now=Date.now()) {
  if (!s || !s.status) return 'Checking';
  if (s.status === 'ok' && s.fetched_at && now-s.fetched_at > 360000) return 'Stale';
  return ({ok:'Updated',stale:'Stale',needsAuth:'Sign-in needed',absent:'Not connected',unavailable:'Unavailable',error:'Connection error',backoff:'Cooling down',derived:'Activity count'})[s.status] || 'Unavailable';
}
export function ageText(at, now=Date.now()) { if (!at) return 'Not read yet'; const m=Math.max(0,Math.floor((now-at)/60000)); return m<1?'Just now': m<60?`${m}m ago`:`${Math.floor(m/60)}h ago`; }

// The cooldown deadline outlives the note that announced it, so the details panel
// counts the remaining time down from backoff_until instead of repeating frozen text.
export function cooldownText(s, now=Date.now()) {
  if (!['backoff','stale'].includes(s?.status)) return null;
  if (!Number.isFinite(s?.backoff_until) || s.backoff_until <= now) return null;
  const secs = Math.ceil((s.backoff_until - now)/1000);
  const wait = secs < 60 ? `${secs}s` : shortResetText(s.backoff_until, now);
  return `Rate limited, retrying in ${wait}`;
}
export function visibleWindows(s) { return ['needsAuth','absent'].includes(s?.status) ? [] : (s?.windows || []); }

// The provider ring pairs the first allowance window (outer) with the next percentage-bearing
// window (inner), e.g. a weekly limit beside a 5-hour limit. One window keeps a single ring.
export function innerWindow(windows) { return (windows || []).slice(1).find(w => percent(w) != null) ?? null; }

export function enabledProviders(settings) { const disabled=new Set(settings?.disabled ?? []);return PROVIDERS.filter(p=>!disabled.has(p.id)); }

// A tile carries one short line: the next reset while a reading holds, otherwise the reason
// it does not. 'warn' and 'bad' tint that line so the grid shows what needs a look.
export function tileStatus(s, now=Date.now()) {
  const status = s?.status;
  if (!status) return {text:'Checking', tone:'muted'};
  if (status === 'needsAuth') return {text:'Sign in', tone:'muted'};
  if (status === 'absent') return {text:'Not found', tone:'muted'};
  if (status === 'error') return {text:'Cannot reach', tone:'bad'};
  if (status === 'backoff') return {text:'Cooling down', tone:'muted'};
  if (status === 'unavailable') return {text:'Unavailable', tone:'muted'};
  if (status === 'derived') return {text:'Activity count', tone:'muted'};
  if (status === 'stale' || (s.fetched_at && now-s.fetched_at > 360000)) {
    return {text: s.fetched_at ? ageText(s.fetched_at, now).replace(' ago', ' old') : 'Stale', tone:'warn'};
  }
  return {text: shortResetText(visibleWindows(s)[0]?.resets_at, now) ?? '', tone:'muted'};
}

// The header reports the oldest reading on screen, so one lagging provider stays visible
// without opening its details.
export function oldestRead(providers, snapshots) {
  const times = (providers ?? []).map(p => snapshots?.[p.id]?.fetched_at).filter(at => Number.isFinite(at) && at > 0);
  return times.length ? Math.min(...times) : null;
}

export const LAYOUTS = [
  {id:'grid', name:'Grid'},
  {id:'stack', name:'Stack'},
];
export function layoutId(id) { return LAYOUTS.some(l => l.id === id) ? id : 'grid'; }

// Ring color is one stored value with three modes. 'urgency' colors a reading by how close
// it is to its limit, 'provider' keeps each brand's own accent, and any accent id paints
// every ring that single hue.
export const RING_MODES = [
  {id:'urgency', name:'Urgency'},
  {id:'accent', name:'One accent'},
  {id:'provider', name:'Per provider'},
];
export const RING_ACCENTS = [
  {id:'teal',name:'Teal',light:'#006d77',dark:'#6edbd5'},
  {id:'blue',name:'Blue',light:'#1f6feb',dark:'#58a6ff'},
  {id:'violet',name:'Violet',light:'#7c3aed',dark:'#a78bfa'},
  {id:'rose',name:'Rose',light:'#be185d',dark:'#f472b6'},
  {id:'amber',name:'Amber',light:'#b45309',dark:'#fbbf24'},
  {id:'green',name:'Green',light:'#15803d',dark:'#4ade80'},
];
export const DEFAULT_ACCENT = 'teal';
export const RING_COLORS = ['urgency', 'provider', ...RING_ACCENTS.map(a => a.id)];
export function ringMode(id) { return id === 'provider' ? 'provider' : RING_ACCENTS.some(a => a.id === id) ? 'accent' : 'urgency'; }

// Urgency thresholds, paired light and dark so the tint stays legible in both schemes.
export const TONES = {
  ok:   {light:'#147055', dark:'#5fd3ae'},
  warn: {light:'#8a5a12', dark:'#e8b46a'},
  bad:  {light:'#a8352e', dark:'#f0857c'},
};
export function toneName(p) { return p >= 85 ? 'bad' : p >= 60 ? 'warn' : 'ok'; }
export function toneHex(p, dark) { return Number.isFinite(p) ? TONES[toneName(p)][dark ? 'dark' : 'light'] : null; }
export function accentHex(id, dark) {
  const option = RING_ACCENTS.find(a => a.id === id);
  return option ? (dark ? option.dark : option.light) : null;
}

// Resolves the stroke for one reading. A null result leaves the ring on the provider's own
// accent, which CSS already supplies.
export function ringHex(id, p, dark) {
  const mode = ringMode(id);
  if (mode === 'provider') return null;
  if (mode === 'accent') return accentHex(id, dark);
  return toneHex(p, dark);
}
const PROVIDER_ACCENTS={light:['#006d77','#a95735','#585b83','#446dc0','#966900','#697180','#656c59','#7957aa'],dark:['#6edbd5','#e5a084','#bbb9ef','#98b4ed','#d6bd7f','#d4d8e3','#b4c3a2','#c4a5f0']};
export function providerSwatch(dark) { return `conic-gradient(${(dark?PROVIDER_ACCENTS.dark:PROVIDER_ACCENTS.light).join(',')})`; }

// Keep navigation and provider changes from moving the header's click targets.
export const POPUP_WIDTH = 400;
export function accountText(account,snapshot,disabled=false){
  const state=disabled?'Paused':statusText(snapshot);
  if(['needsAuth','absent'].includes(snapshot?.status))return state;
  // A borrowed credential may carry no address at all (OpenCode's Go key is
  // account-wide): report what the source has instead of a missing account.
  const identity=account?.email||(account?.username?'@'+account.username:null);
  const plan=account?.plan?account.plan+' plan':'Plan not reported';
  const parts=[identity,plan];
  if(state!=='Updated')parts.push(state);
  return parts.filter(Boolean).join(' · ');
}

// Settings counts what is switched on against what is actually reporting a number.
export function reportingCount(providers, snapshots) {
  return (providers ?? []).filter(p => percent(visibleWindows(snapshots?.[p.id])[0]) != null).length;
}

// First run lists what this PC already has a session for, reading the same snapshots the
// overview does. TokenTray signs in to nothing on its own.
export function discovery(snapshots) {
  return PROVIDERS.map(p => {
    const status = snapshots?.[p.id]?.status;
    const found = !!status && !['needsAuth','absent'].includes(status);
    return {id:p.id, name:p.name, found, state: found ? 'Signed in' : status === 'needsAuth' ? 'Sign in needed' : 'Not found'};
  });
}
