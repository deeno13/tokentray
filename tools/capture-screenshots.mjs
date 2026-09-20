// Regenerates the README screenshots from ui/ with a mocked native bridge, so the
// images carry representative sample data rather than anyone's real usage.
//
//   node tools/capture-screenshots.mjs [browser-executable-path]
//
// Installs nothing: serves ui/ over loopback and drives an existing Chromium-based
// browser over the DevTools protocol, which is what lets a screenshot pick its colour
// scheme and crop to the rendered height. Native Acrylic cannot be captured this way,
// so these show the opaque surface -- the same one the reduced-transparency
// accessibility fallback renders.
import {createServer} from 'node:http';
import {readFile, writeFile, mkdir, mkdtemp, rm} from 'node:fs/promises';
import {existsSync, readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join, extname} from 'node:path';
import {fileURLToPath} from 'node:url';

const CANDIDATES = [
  process.argv[2],
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].filter(Boolean);

const HOUR = 3600000;
const now = Date.now();
// One representative reading per provider: mostly comfortable, one close to its weekly
// cap so the urgency colours appear, one signed out, one derived activity count.
const SNAPSHOTS = {
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

const ACCOUNTS = {
  codex: {email: 'sample.user@example.com', plan: 'ChatGPT Plus'},
  claude: {email: 'sample.user@example.com', plan: 'Claude Max'},
  cursor: {email: 'sample.user@example.com', plan: 'Pro'},
  copilot: {email: 'sample-user', plan: 'Copilot Pro'},
  opencode: {plan: 'Go'},
};

const SETTINGS = {disabled: [], acrylic: true, start_minimized: true, ring_color: 'urgency', layout: 'grid', onboarded: true};

const SHOTS = [
  {name: 'overview-light', scheme: 'light'},
  {name: 'overview-dark', scheme: 'dark'},
  {name: 'stack-light', scheme: 'light', settings: {layout: 'stack'}},
  {name: 'detail-dark', scheme: 'dark', act: `document.querySelector('.provider[data-provider=claude]').click()`},
  {name: 'settings-light', scheme: 'light', act: `document.getElementById('settings').click()`},
];

// --- static server -------------------------------------------------------------

const UI = new URL('../ui/', import.meta.url);
const TYPES = {'.html': 'text/html', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png'};

function bridge(settings) {
  // Must be in place before app.mjs runs. Only the commands the popup issues on load,
  // and during the interactions these shots perform, are answered.
  return `<script>(()=>{
  const settings=${JSON.stringify({...SETTINGS, ...settings})};
  const snapshots=${JSON.stringify(SNAPSHOTS)};
  const accounts=${JSON.stringify(ACCOUNTS)};
  window.__TAURI__={
    event:{async listen(){return()=>{};}},
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
})()</script>`;
}

async function serve(settings) {
  const injection = bridge(settings);
  const server = createServer(async (req, res) => {
    let path = req.url.split('?')[0];
    if (path === '/') path = '/index.html';
    try {
      let body = await readFile(new URL('.' + path, UI));
      // The native window fixes the popup width; a browser has to be told.
      if (path === '/index.html') body = Buffer.from(
        String(body).replace('</head>', `${injection}<style>html,body{width:400px}</style></head>`));
      res.writeHead(200, {'Content-Type': TYPES[extname(path)] ?? 'application/octet-stream'});
      res.end(body);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return server;
}

// --- devtools protocol ---------------------------------------------------------

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// The browser holds its profile lock for a moment after it is asked to exit.
async function discard(profile) {
  for (let attempt = 0; attempt < 20; attempt++) {
    try { await rm(profile, {recursive: true, force: true}); return; } catch { await sleep(150); }
  }
}

async function launch(executable) {
  const profile = await mkdtemp(join(tmpdir(), 'tokentray-shot-'));
  const child = spawn(executable, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--no-default-browser-check', '--force-color-profile=srgb',
    `--user-data-dir=${profile}`, '--remote-debugging-port=0', 'about:blank',
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

function connect(url) {
  const socket = new WebSocket(url);
  const pending = new Map();
  let id = 0;
  const open = new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, {once: true});
    socket.addEventListener('error', () => reject(new Error('DevTools socket failed')), {once: true});
  });
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
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
  return {send, close: () => socket.close()};
}

async function capture(cdp, {url, scheme, act, width, scale}) {
  const {targetId} = await cdp.send('Target.createTarget', {url: 'about:blank'});
  const {sessionId} = await cdp.send('Target.attachToTarget', {targetId, flatten: true});
  const call = (method, params) => cdp.send(method, params, sessionId);
  try {
    await call('Page.enable');
    await call('Runtime.enable');
    await call('Emulation.setEmulatedMedia', {features: [{name: 'prefers-color-scheme', value: scheme}]});
    await call('Emulation.setDeviceMetricsOverride', {width, height: 900, deviceScaleFactor: scale, mobile: false});
    await call('Page.navigate', {url});
    await settle(call);
    if (act) {
      await call('Runtime.evaluate', {expression: act, awaitPromise: true});
      // A synthetic click leaves a focus ring that a real pointer user would not see.
      await call('Runtime.evaluate', {expression: 'document.activeElement?.blur()'});
      await settle(call);
    }
    // Crop to what the popup actually rendered, the way the native window sizes itself.
    const height = await evaluate(call, 'Math.ceil(document.documentElement.getBoundingClientRect().height)');
    const {data} = await call('Page.captureScreenshot', {
      format: 'png', captureBeyondViewport: true, clip: {x: 0, y: 0, width, height, scale},
    });
    return Buffer.from(data, 'base64');
  } finally {
    await cdp.send('Target.closeTarget', {targetId});
  }
}

async function evaluate(call, expression) {
  const {result} = await call('Runtime.evaluate', {expression, returnByValue: true});
  return result.value;
}

async function settle(call) {
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

// --- run -----------------------------------------------------------------------

const executable = CANDIDATES.find(path => existsSync(path));
if (!executable) {
  console.error('No Chromium-based browser found. Pass one:\n  node tools/capture-screenshots.mjs "C:/path/to/msedge.exe"');
  process.exit(1);
}

const out = new URL('../docs/media/', import.meta.url);
await mkdir(out, {recursive: true});
const {child, profile, webSocketDebuggerUrl} = await launch(executable);
const cdp = connect(webSocketDebuggerUrl);
try {
  for (const shot of SHOTS) {
    const server = await serve(shot.settings);
    const url = `http://127.0.0.1:${server.address().port}/`;
    try {
      const png = await capture(cdp, {...shot, url, width: 400, scale: 2});
      const file = fileURLToPath(new URL(`${shot.name}.png`, out));
      await writeFile(file, png);
      console.log('wrote', file, `(${png.length} bytes)`);
    } finally { server.close(); }
  }
} finally {
  cdp.close();
  child.kill();
  await discard(profile);
}
