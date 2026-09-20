// Shared harness for the README media tools. It serves ui/ over loopback with a
// mocked native bridge carrying one representative reading per provider, and drives
// an existing Chromium-based browser over the DevTools protocol. It installs
// nothing, so the generated media never contains anyone's real usage.
import {createServer} from 'node:http';
import {readFile, mkdtemp, rm} from 'node:fs/promises';
import {existsSync, readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join, extname} from 'node:path';

const UI = new URL('../ui/', import.meta.url);
const TYPES = {'.html': 'text/html', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png'};
const HOUR = 3600000;

export const SAMPLE_SETTINGS = {disabled: [], acrylic: true, start_minimized: true, ring_color: 'urgency', layout: 'grid', onboarded: true};

export const SAMPLE_ACCOUNTS = {
  codex: {email: 'sample.user@example.com', plan: 'ChatGPT Plus'},
  claude: {email: 'sample.user@example.com', plan: 'Claude Max'},
  cursor: {email: 'sample.user@example.com', plan: 'Pro'},
  copilot: {email: 'sample-user', plan: 'Copilot Pro'},
  opencode: {plan: 'Go'},
};

// One representative reading per provider: mostly comfortable, one close to its weekly
// cap so the urgency colours appear, one signed out, one derived activity count.
export function sampleSnapshots(now = Date.now()) {
  return {
    codex: {status: 'ok', fetched_at: now - 40000, windows: [
      {label: '5-hour session', used: 0.34, resets_at: now + 2.4 * HOUR},
      {label: 'Weekly limit', used: 0.51, resets_at: now + 71 * HOUR}]},
    claude: {status: 'ok', fetched_at: now - 40000, windows: [
      {label: '5-hour session', used: 0.72, resets_at: now + 1.1 * HOUR},
      {label: 'Weekly limit', used: 0.88, resets_at: now + 52 * HOUR}]},
    cursor: {status: 'ok', fetched_at: now - 50000, windows: [
      {label: 'Monthly included usage', used: 0.46, resets_at: now + 260 * HOUR}]},
    antigravity: {status: 'derived', fetched_at: now - 60000, windows: [
      {label: 'Recent activity', count: 184, resets_at: now + 4 * HOUR}]},
    glm: {status: 'ok', fetched_at: now - 60000, windows: [
      {label: '5-hour prompts', used: 0.19, resets_at: now + 3.6 * HOUR}]},
    grok: {status: 'ok', fetched_at: now - 60000, windows: [
      {label: 'Monthly credits', used: 0.63, resets_at: now + 190 * HOUR}]},
    opencode: {status: 'needsAuth', fetched_at: now - 60000, windows: []},
    copilot: {status: 'ok', fetched_at: now - 60000, windows: [
      {label: 'Premium requests', used: 0.28, resets_at: now + 300 * HOUR}]},
  };
}

export const BROWSER_CANDIDATES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
];

export function findBrowser(explicit) {
  return [explicit, ...BROWSER_CANDIDATES].filter(Boolean).find(path => existsSync(path));
}

export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Must be in place before app.mjs runs. Only the commands the popup issues on load,
// and during the interactions a tool performs, are answered. `inject` runs after the
// bridge so a tool can patch it, and `window.__listeners` lets a tool emit the same
// provider events the native app sends.
function bridge({settings, snapshots, accounts, inject}) {
  return `<script>(()=>{
  const settings=${JSON.stringify({...SAMPLE_SETTINGS, ...settings})};
  const snapshots=${JSON.stringify(snapshots ?? sampleSnapshots())};
  const accounts=${JSON.stringify(accounts ?? SAMPLE_ACCOUNTS)};
  window.__TAURI__={
    event:{async listen(name,listener){const map=window.__listeners||(window.__listeners={});(map[name]||(map[name]=[])).push(listener);return()=>{};}},
    core:{async invoke(name,args){
      if(name==='get_settings')return structuredClone(settings);
      if(name==='get_accounts')return structuredClone(accounts);
      if(name==='get_all')return structuredClone(snapshots);
      if(name==='get_startup')return false;
      if(name==='set_startup')return args.enabled;
      if(name==='set_material')return false;
      if(name==='save_settings'){Object.assign(settings,args.settings);return;}
    }},
  };
})()</script>${inject}`;
}

export async function serve({settings = {}, snapshots, accounts, inject = '', css = ''} = {}) {
  const injection = bridge({settings, snapshots, accounts, inject});
  const server = createServer(async (req, res) => {
    let path = req.url.split('?')[0];
    if (path === '/') path = '/index.html';
    try {
      let body = await readFile(new URL('.' + path, UI));
      // The native window fixes the popup width; a browser has to be told.
      if (path === '/index.html') body = Buffer.from(String(body).replace('</head>',
        `${injection}${css ? `<style>${css}</style>` : ''}<style>html,body{width:400px}</style></head>`));
      res.writeHead(200, {'Content-Type': TYPES[extname(path)] ?? 'application/octet-stream'});
      res.end(body);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return server;
}

// The browser holds its profile lock for a moment after it is asked to exit.
export async function discard(profile) {
  for (let attempt = 0; attempt < 20; attempt++) {
    try { await rm(profile, {recursive: true, force: true}); return; } catch { await sleep(150); }
  }
}

export async function launch(executable, extraFlags = []) {
  const profile = await mkdtemp(join(tmpdir(), 'tokentray-preview-'));
  const child = spawn(executable, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--no-default-browser-check', '--force-color-profile=srgb',
    `--user-data-dir=${profile}`, '--remote-debugging-port=0', ...extraFlags, 'about:blank',
  ], {stdio: 'ignore', windowsHide: true});

  const portFile = join(profile, 'DevToolsActivePort');
  for (let attempt = 0; attempt < 100; attempt++) {
    await sleep(100);
    try {
      const port = readFileSync(portFile, 'utf8').split('\n')[0].trim();
      if (port) {
        const {webSocketDebuggerUrl} = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
        return {child, profile, webSocketDebuggerUrl};
      }
    } catch { /* not listening yet */ }
  }
  child.kill();
  await discard(profile);
  throw new Error('The browser never reported a DevTools port.');
}

export function connect(url) {
  const socket = new WebSocket(url);
  const pending = new Map();
  const handlers = new Map();
  let id = 0;
  const open = new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, {once: true});
    socket.addEventListener('error', () => reject(new Error('DevTools socket failed')), {once: true});
  });
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method) {
      for (const handler of handlers.get(message.method) ?? []) handler(message.params, message.sessionId);
      return;
    }
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    if (message.error) entry.reject(new Error(message.error.message)); else entry.resolve(message.result);
  });
  const send = async (method, params = {}, sessionId) => {
    await open;
    const message = {id: ++id, method, params, ...(sessionId ? {sessionId} : {})};
    return new Promise((resolve, reject) => {
      pending.set(message.id, {resolve, reject});
      socket.send(JSON.stringify(message));
    });
  };
  const on = (method, handler) => {
    if (!handlers.has(method)) handlers.set(method, []);
    handlers.get(method).push(handler);
  };
  return {send, on, close: () => socket.close()};
}

export async function evaluate(call, expression) {
  const {result} = await call('Runtime.evaluate', {expression, returnByValue: true});
  return result.value;
}

export async function settle(call) {
  // Readings arrive over the mocked bridge and page entry animates, so wait for the
  // layout to stop moving rather than guessing a delay.
  let previous = null;
  for (let attempt = 0; attempt < 40; attempt++) {
    await sleep(100);
    const current = await evaluate(call,
      'document.documentElement.getBoundingClientRect().height + ":" + document.querySelectorAll(".provider,.provider-row,.window").length');
    if (current === previous) return;
    previous = current;
  }
}
