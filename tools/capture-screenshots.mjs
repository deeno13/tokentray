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
import {writeFile, mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {connect, discard, evaluate, findBrowser, launch, sampleSnapshots, serve, settle} from './preview.mjs';

const SHOTS = [
  {name: 'overview-light', scheme: 'light'},
  {name: 'overview-dark', scheme: 'dark'},
  {name: 'stack-light', scheme: 'light', settings: {layout: 'stack'}},
  {name: 'detail-dark', scheme: 'dark', act: `document.querySelector('.provider[data-provider=claude]').click()`},
  {name: 'settings-light', scheme: 'light', act: `document.getElementById('settings').click()`},
];

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

const executable = findBrowser(process.argv[2]);
if (!executable) {
  console.error('No Chromium-based browser found. Pass one:\n  node tools/capture-screenshots.mjs "C:/path/to/msedge.exe"');
  process.exit(1);
}

const out = new URL('../docs/media/', import.meta.url);
await mkdir(out, {recursive: true});
const snapshots = sampleSnapshots();
const {child, profile, webSocketDebuggerUrl} = await launch(executable);
const cdp = connect(webSocketDebuggerUrl);
try {
  for (const shot of SHOTS) {
    const server = await serve({settings: shot.settings, snapshots});
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
