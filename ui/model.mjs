export const PROVIDERS = [
  {id:'codex',name:'Codex',mark:'CX',source:'Codex app-server',help:'Sign in to the native Codex CLI with your ChatGPT account.'},
  {id:'claude',name:'Claude Code',mark:'CL',source:'Claude usage endpoint',help:'Sign in with Claude Code. TokenTray reads its existing Windows session.'},
  {id:'cursor',name:'Cursor',mark:'CU',source:'Cursor usage endpoint',help:'Install Cursor and sign in to your account.'},
  {id:'antigravity',name:'Antigravity',mark:'AG',source:'Local bridge / quota API',help:'Open Antigravity and sign in. Some accounts expose only an activity count.'},
  {id:'glm',name:'GLM',mark:'GL',source:'Z.ai Coding Plan',help:'Connect your Z.ai plan in Claude Code, ZCode, or OpenCode.'},
  {id:'grok',name:'Grok',mark:'GR',source:'Grok Build billing',help:'Sign in with Grok CLI using an xAI account.'},
  {id:'opencode',name:'OpenCode',mark:'OC',source:'OpenCode Go plan',help:'Connect the OpenCode Go plan in OpenCode. Other provider keys do not represent Go usage.'},
  {id:'copilot',name:'GitHub Copilot',mark:'GH',source:'Copilot quota endpoint',help:'Sign in with GitHub CLI (gh auth login) to an account with Copilot.'},
];
export function percent(w) { return w && w.count == null && Number.isFinite(w.used) && w.used >= 0 ? Math.round(w.used * 100) : null; }
export function resetText(at, now=Date.now()) {
  if (!Number.isFinite(at) || at <= 0) return 'Reset time unavailable';
  if (at <= now) return 'Reset due · awaiting refresh';
  const minutes = Math.ceil((at-now)/60000);
  if (minutes < 60) return `Resets in ${minutes}m`;
  const hours = Math.floor(minutes/60), rest = minutes%60;
  if (hours < 24) return `Resets in ${hours}h${rest ? ` ${rest}m` : ''}`;
  return `Resets in ${Math.floor(hours/24)}d${hours%24 ? ` ${hours%24}h` : ''}`;
}
export function statusText(s, now=Date.now()) {
  if (!s || !s.status) return 'Checking';
  if (s.status === 'ok' && s.fetched_at && now-s.fetched_at > 360000) return 'Stale';
  return ({ok:'Updated',stale:'Stale',needsAuth:'Sign-in needed',absent:'Not connected',unavailable:'Unavailable',error:'Connection error',backoff:'Cooling down',derived:'Activity count'})[s.status] || 'Unavailable';
}
export function ageText(at, now=Date.now()) { if (!at) return 'Not read yet'; const m=Math.max(0,Math.floor((now-at)/60000)); return m<1?'Updated just now': m<60?`Updated ${m}m ago`:`Updated ${Math.floor(m/60)}h ago`; }
export function visibleWindows(s) { return ['needsAuth','absent'].includes(s?.status) ? [] : (s?.windows || []); }

export function enabledProviders(settings) { const disabled=new Set(settings?.disabled ?? []);return PROVIDERS.filter(p=>!disabled.has(p.id)); }
