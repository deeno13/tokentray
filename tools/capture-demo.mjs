// Records the README demo GIFs from ui/ with the same mocked native bridge as the
// screenshots, so the clip carries representative sample data rather than anyone's real
// usage. Real pointer events drive the popup and the DevTools screencast captures the
// hover, pressed and motion frames, which an element.click() would not produce.
//
//   node tools/capture-demo.mjs [browser-executable-path] [ffmpeg-executable-path] [--keep-frames]
//
// Installs nothing, but assembling the frames needs ffmpeg on PATH. Native Acrylic
// cannot be captured this way, so the clip shows the opaque surface -- the same one the
// reduced-transparency accessibility fallback renders.
import {writeFile, mkdir, mkdtemp, rm, stat} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {connect, discard, evaluate, findBrowser, launch, sampleSnapshots, serve, settle, sleep} from './preview.mjs';

const WIDTH = 400;
const SCALE = 2;
const OUTPUT_WIDTH = 800;
const MEASURE_HEIGHT = 1400;
const SCHEMES = ['light', 'dark'];
const PROVIDER = '#providers [data-provider=claude]';
const START = {x: 424, y: 704};

const CURSOR_STYLE = `#demo-cursor { position: fixed; left: 0; top: 0; width: 24px; height: 24px; z-index: 2147483647;
  pointer-events: none; transition: transform 650ms cubic-bezier(.3,.7,.3,1); will-change: transform; }
#demo-cursor svg { width: 24px; height: 24px; display: block; filter: drop-shadow(0 1px 1.5px rgba(0,0,0,.45)); }
#demo-cursor path { fill: #fff; stroke: #1c1c22; stroke-width: 1.1; stroke-linejoin: round; paint-order: stroke; }`;

// A pointer overlay so the clip shows where the click lands.
const CURSOR_SCRIPT = `(() => {
  const el = document.createElement('div');
  el.id = 'demo-cursor';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5 3 5 19.4 9.4 15.6 12.1 21.2 14.7 20 12 14.4 17.3 14.4Z"/></svg>';
  document.body.append(el);
  window.__demoCursor = (x, y, ms) => {
    el.style.transitionDuration = ms + 'ms';
    el.style.transform = 'translate(' + (x - 5) + 'px,' + (y - 3) + 'px)';
  };
})()`;

// A refresh that re-reads every provider a moment after the notice, the way the monitor
// emits readings as they arrive.
function refreshScript(snapshots) {
  return `<script>(()=>{
  const base = window.__TAURI__.core.invoke.bind(window.__TAURI__.core);
  const snapshots = ${JSON.stringify(snapshots)};
  const emit = (id, reading) => {
    // Claude's readings arrive on the 'usage' event; every other provider uses its id.
    for (const listener of window.__listeners?.[id === 'claude' ? 'usage' : id] ?? []) listener({payload: reading});
  };
  window.__TAURI__.core.invoke = async (name, args) => {
    if (name !== 'refresh_usage') return base(name, args);
    setTimeout(() => {
      for (const reading of Object.values(snapshots)) {
        reading.fetched_at = Date.now();
        for (const window_ of reading.windows) {
          if (window_.used != null) window_.used = Math.min(0.99, window_.used + 0.02);
          if (window_.count != null) window_.count += 5;
        }
      }
      for (const [id, reading] of Object.entries(snapshots)) emit(id, reading);
    }, 600);
  };
})()</script>`;
}

function findFfmpeg(explicit) {
  if (explicit) return existsSync(explicit) ? explicit : null;
  if (process.env.FFMPEG && existsSync(process.env.FFMPEG)) return process.env.FFMPEG;
  const lookup = spawnSync(process.platform === 'win32' ? 'where.exe' : 'which', ['ffmpeg'], {encoding: 'utf8'});
  const first = lookup.status === 0 ? lookup.stdout.split(/\r?\n/).find(Boolean) : null;
  return first ? first.trim() : null;
}

async function openPage(cdp, {url, scheme, height}) {
  const {targetId} = await cdp.send('Target.createTarget', {url: 'about:blank'});
  const {sessionId} = await cdp.send('Target.attachToTarget', {targetId, flatten: true});
  const call = (method, params) => cdp.send(method, params, sessionId);
  await call('Page.enable');
  await call('Runtime.enable');
  await call('Emulation.setEmulatedMedia', {features: [{name: 'prefers-color-scheme', value: scheme}]});
  await call('Emulation.setDeviceMetricsOverride', {width: WIDTH, height, deviceScaleFactor: SCALE, mobile: false});
  await call('Page.navigate', {url});
  await settle(call);
  return {targetId, sessionId, call};
}

// The popup sizes itself to its content, so the clip is recorded on a fixed canvas tall
// enough for its tallest moment: details open with a refresh notice above them.
async function measureCanvas(cdp, url) {
  const {targetId, call} = await openPage(cdp, {url, scheme: 'light', height: MEASURE_HEIGHT});
  try {
    await evaluate(call, `document.querySelector(${JSON.stringify(PROVIDER)}).click()`);
    await settle(call);
    await evaluate(call, `document.getElementById('refresh').click()`);
    await sleep(400);
    const height = await evaluate(call, `Math.ceil(document.querySelector('.flyout').getBoundingClientRect().bottom)`);
    if (height >= MEASURE_HEIGHT - 1) throw new Error(`The measured popup filled the ${MEASURE_HEIGHT}px measurement viewport; raise it.`);
    return height;
  } finally {
    await cdp.send('Target.closeTarget', {targetId});
  }
}

const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

async function record(cdp, {url, scheme, height, directory}) {
  const {targetId, sessionId, call} = await openPage(cdp, {url, scheme, height});
  const frames = [];
  const point = selector => evaluate(call, `(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
    return {x: r.x + r.width / 2, y: r.y + r.height / 2}; })()`);
  let cursor = {...START};
  const move = at => call('Input.dispatchMouseEvent', {type: 'mouseMoved', x: Math.round(at.x), y: Math.round(at.y), button: 'none'});
  const glide = async (to, ms) => {
    const from = cursor;
    cursor = to;
    await evaluate(call, `window.__demoCursor(${to.x}, ${to.y}, ${ms})`);
    const started = Date.now();
    for (;;) {
      const t = Math.min(1, (Date.now() - started) / ms);
      const k = ease(t);
      await move({x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k});
      if (t >= 1) break;
      await sleep(25);
    }
    await sleep(70);
  };
  const press = async at => {
    await call('Input.dispatchMouseEvent', {type: 'mousePressed', x: at.x, y: at.y, button: 'left', buttons: 1, clickCount: 1});
    await sleep(110);
    await call('Input.dispatchMouseEvent', {type: 'mouseReleased', x: at.x, y: at.y, button: 'left', buttons: 0, clickCount: 1});
  };
  const waitUntil = async (expression, timeout) => {
    const until = Date.now() + timeout;
    while (Date.now() < until && !await evaluate(call, expression)) await sleep(100);
    await sleep(250);
  };
  try {
    await evaluate(call, CURSOR_SCRIPT);
    await evaluate(call, `window.__demoCursor(${START.x}, ${START.y}, 0)`);
    cdp.on('Page.screencastFrame', (frame, session) => {
      if (session !== sessionId) return;
      frames.push({data: frame.data, timestamp: frame.metadata.timestamp});
      cdp.send('Page.screencastFrameAck', {sessionId: frame.sessionId}, session).catch(() => {});
    });
    await call('Page.startScreencast', {format: 'jpeg', quality: 90, maxWidth: WIDTH * SCALE, maxHeight: height * SCALE, everyNthFrame: 1});

    await sleep(600);
    await glide(await point(PROVIDER), 700);
    await sleep(450);
    await press(await point(PROVIDER));
    await sleep(1800);
    await glide(await point('#refresh'), 650);
    await sleep(350);
    await press(await point('#refresh'));
    await sleep(1900);
    await glide(await point(PROVIDER), 650);
    await sleep(350);
    await press(await point(PROVIDER));
    await waitUntil(`document.getElementById('notice').hidden`, 7000);
    await glide(START, 650);
    await sleep(1100);

    await call('Page.stopScreencast');
  } finally {
    await cdp.send('Target.closeTarget', {targetId});
  }
  if (frames.length < 10) throw new Error(`The screencast returned ${frames.length} frames; nothing to encode.`);

  const files = [];
  for (const [index, frame] of frames.entries()) {
    const file = join(directory, `frame-${String(index + 1).padStart(4, '0')}.jpg`);
    await writeFile(file, Buffer.from(frame.data, 'base64'));
    files.push(file.replace(/\\/g, '/'));
  }
  const last = files.at(-1);
  const durations = frames.map((frame, index) =>
    index === frames.length - 1 ? 1.4 : Math.max(0.02, Math.round((frames[index + 1].timestamp - frame.timestamp) * 100) / 100));
  const list = ['ffconcat version 1.0'];
  for (const [index, file] of files.entries()) list.push(`file '${file}'`, `duration ${durations[index]}`);
  list.push(`file '${last}'`);
  const listFile = join(directory, 'frames.ffconcat');
  await writeFile(listFile, list.join('\n') + '\n');
  return {listFile, seconds: durations.reduce((sum, value) => sum + value, 0), frames: frames.length};
}

const [browserPath, ffmpegPath] = process.argv.slice(2).filter(argument => !argument.startsWith('--'));
const browser = findBrowser(browserPath);
if (!browser) {
  console.error('No Chromium-based browser found. Pass one:\n  node tools/capture-demo.mjs "C:/path/to/msedge.exe"');
  process.exit(1);
}
const ffmpeg = findFfmpeg(ffmpegPath);
if (!ffmpeg) {
  console.error('ffmpeg was not found. Install it or pass one:\n  node tools/capture-demo.mjs "C:/path/to/msedge.exe" "C:/path/to/ffmpeg.exe"');
  process.exit(1);
}

const out = new URL('../docs/media/', import.meta.url);
await mkdir(out, {recursive: true});
const work = await mkdtemp(join(tmpdir(), 'tokentray-demo-'));
const snapshots = sampleSnapshots();
const server = await serve({snapshots, inject: refreshScript(snapshots), css: CURSOR_STYLE});
const url = `http://127.0.0.1:${server.address().port}/`;
const {child, profile, webSocketDebuggerUrl} = await launch(browser, [`--force-device-scale-factor=${SCALE}`]);
const cdp = connect(webSocketDebuggerUrl);
try {
  const height = await measureCanvas(cdp, url);
  console.log('canvas', `${WIDTH * SCALE}x${height * SCALE}`);
  for (const scheme of SCHEMES) {
    const directory = join(work, scheme);
    await mkdir(directory, {recursive: true});
    const clip = await record(cdp, {url, scheme, height, directory});
    const file = fileURLToPath(new URL(`demo-${scheme}.gif`, out));
    const result = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', clip.listFile,
      '-fps_mode', 'vfr', '-filter_complex',
      `[0:v]scale=${OUTPUT_WIDTH}:-2:flags=lanczos,split[palette][frames];[palette]palettegen=max_colors=256:stats_mode=diff[colors];[frames][colors]paletteuse=dither=sierra2_4a:diff_mode=rectangle`,
      '-loop', '0', file], {encoding: 'utf8'});
    if (result.status !== 0) throw new Error(`ffmpeg failed for ${scheme}:\n${result.stderr}`);
    console.log('wrote', file, `(${clip.frames} frames, ${clip.seconds.toFixed(1)}s, ${((await stat(file)).size / 1024).toFixed(0)} KB)`);
  }
} finally {
  cdp.close();
  child.kill();
  await discard(profile);
  server.close();
  if (process.argv.includes('--keep-frames')) console.log('frames kept in', work);
  else await rm(work, {recursive: true, force: true});
}
