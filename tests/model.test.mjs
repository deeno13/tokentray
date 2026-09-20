import {test} from 'node:test';import assert from 'node:assert/strict';
import {percent,resetText,statusText,visibleWindows,PROVIDERS} from '../ui/model.mjs';
test('all eight requested providers are distinct',()=>{assert.equal(PROVIDERS.length,8);assert.equal(new Set(PROVIDERS.map(p=>p.id)).size,8)});
test('unknown quota differs from reported zero and activity count',()=>{assert.equal(percent({}),null);assert.equal(percent({used:0}),0);assert.equal(percent({used:0,count:12}),null);assert.equal(percent({used:1.2}),120)});
test('reset countdown never silently invents a reset',()=>{assert.match(resetText(null,1),/unavailable/);assert.match(resetText(1,2),/awaiting refresh/);assert.equal(resetText(3600001,1),'Resets in 1h')});
test('old successful readings become visibly stale',()=>assert.equal(statusText({status:'ok',fetched_at:1},400000),'Stale'));
test('signed-out accounts never display prior account readings',()=>assert.deepEqual(visibleWindows({status:'needsAuth',windows:[{used:.2}]}),[]));

import {innerWindow} from '../ui/model.mjs';
test('inner ring takes the next percentage window and skips activity counts',()=>{assert.equal(innerWindow([{used:.1},{used:.2}]).used,.2);assert.equal(innerWindow([{used:.1}]),null);assert.equal(innerWindow([{used:.1},{count:5},{used:.3}]).used,.3);assert.equal(innerWindow([]),null);assert.equal(innerWindow(),null);});

import {enabledProviders} from '../ui/model.mjs';
test('provider settings hide disabled entries and preserve provider order',()=>{assert.deepEqual(enabledProviders({disabled:['codex','grok','unknown']}).map(p=>p.id),['claude','cursor','antigravity','glm','opencode','copilot']);assert.equal(enabledProviders({disabled:PROVIDERS.map(p=>p.id)}).length,0);assert.equal(enabledProviders().length,8);});

import {accountText} from '../ui/model.mjs';
test('settings show identity and plan while hiding signed-out identity',()=>{const a={email:'alex@example.com',plan:'plus'};assert.match(accountText(a,{status:'ok'}),/alex@example.com.*plus plan/);assert.doesNotMatch(accountText(a,{status:'needsAuth'}),/alex@example.com/);assert.equal(accountText({email:'alex@example.com'},{status:'ok'}),'alex@example.com');assert.equal(accountText(null,{status:'ok'}),'Updated');assert.match(accountText({username:'alex'},{status:'ok'},true),/@alex.*Paused/);});
test('a credential with no address reports its plan without an account placeholder',()=>{assert.equal(accountText({plan:'Go'},{status:'ok'}),'Go plan');assert.doesNotMatch(accountText({plan:'Go'},{status:'stale'}),/Account not reported/);assert.equal(accountText({plan:'Go'},{status:'stale'}),'Go plan · Stale');});

import {RING_MODES,RING_ACCENTS,RING_COLORS,DEFAULT_ACCENT,ringMode,ringHex,accentHex,toneHex,toneName,providerSwatch} from '../ui/model.mjs';
test('ring color offers three modes and stores one value per mode',()=>{assert.deepEqual(RING_MODES.map(m=>m.id),['urgency','accent','provider']);assert.ok(RING_ACCENTS.some(a=>a.id===DEFAULT_ACCENT));assert.equal(new Set(RING_COLORS).size,RING_COLORS.length);for(const a of RING_ACCENTS){assert.match(a.light,/^#[0-9a-f]{6}$/i);assert.match(a.dark,/^#[0-9a-f]{6}$/i);assert.ok(RING_COLORS.includes(a.id));}});
test('a stored ring color resolves to exactly one mode',()=>{assert.equal(ringMode('urgency'),'urgency');assert.equal(ringMode('provider'),'provider');assert.equal(ringMode('teal'),'accent');assert.equal(ringMode(undefined),'urgency');assert.equal(ringMode('hot-pink'),'urgency');});
test('urgency tones escalate at 60% and 85% and never invent a tone for a missing reading',()=>{assert.equal(toneName(0),'ok');assert.equal(toneName(59),'ok');assert.equal(toneName(60),'warn');assert.equal(toneName(84),'warn');assert.equal(toneName(85),'bad');assert.equal(toneHex(null,true),null);assert.notEqual(toneHex(90,true),toneHex(90,false));});
test('ring hex follows the mode and leaves provider colors to CSS',()=>{assert.equal(ringHex('teal',90,false),'#006d77');assert.equal(ringHex('teal',90,true),'#6edbd5');assert.equal(ringHex('provider',90,true),null);assert.equal(ringHex('urgency',90,true),'#f0857c');assert.equal(ringHex('urgency',10,true),'#5fd3ae');assert.equal(ringHex('urgency',null,true),null);assert.equal(accentHex('provider',true),null);});
test('provider swatch is a two-scheme gradient of brand accents',()=>{assert.match(providerSwatch(false),/^conic-gradient\(/);assert.notEqual(providerSwatch(false),providerSwatch(true));});

import {shortResetText,tileStatus,oldestRead,layoutId,LAYOUTS,reportingCount,discovery,cooldownText} from '../ui/model.mjs';
test('a cooldown counts down from its deadline instead of repeating frozen text',()=>{const now=1e12;
  assert.equal(cooldownText({status:'backoff',backoff_until:now+3600000},now),'Rate limited, retrying in 1h');
  assert.equal(cooldownText({status:'backoff',backoff_until:now+30000},now),'Rate limited, retrying in 30s');
  assert.equal(cooldownText({status:'stale',backoff_until:now+90000},now),'Rate limited, retrying in 2m');
  assert.equal(cooldownText({status:'backoff',backoff_until:now-1},now),null);
  assert.equal(cooldownText({status:'ok',backoff_until:now+3600000},now),null);
  assert.equal(cooldownText({status:'backoff'},now),null);assert.equal(cooldownText(undefined,now),null);});
test('short countdown drops the lead-in and the hour once a reset is days away',()=>{const now=1e12;assert.equal(shortResetText(now+45*60000,now),'45m');assert.equal(shortResetText(now+3840000,now),'1h 4m');assert.equal(shortResetText(now+7200000,now),'2h');assert.equal(shortResetText(now+1800000000,now),'20d');assert.equal(shortResetText(null,now),null);assert.equal(shortResetText(now-1,now),'due');});
test('a tile reports the next reset, or the reason there is no reading',()=>{const now=1e12;
  assert.deepEqual(tileStatus({status:'ok',fetched_at:now,windows:[{used:.2,resets_at:now+3840000}]},now),{text:'1h 4m',tone:'muted'});
  assert.deepEqual(tileStatus({status:'needsAuth',fetched_at:now},now),{text:'Sign in',tone:'muted'});
  assert.deepEqual(tileStatus({status:'error',fetched_at:now},now),{text:'Cannot reach',tone:'bad'});
  assert.deepEqual(tileStatus({status:'ok',fetched_at:now-840000,windows:[]},now),{text:'14m old',tone:'warn'});
  assert.deepEqual(tileStatus(undefined,now),{text:'Checking',tone:'muted'});});
test('the header reports the oldest reading, not the newest',()=>{const now=1e12;const snapshots={a:{fetched_at:now},b:{fetched_at:now-840000}};
  assert.equal(oldestRead([{id:'a'},{id:'b'}],snapshots),now-840000);
  assert.equal(oldestRead([{id:'a'}],snapshots),now);
  assert.equal(oldestRead([{id:'c'}],snapshots),null);
  assert.equal(oldestRead([],snapshots),null);});
test('layout falls back to the grid for unknown values',()=>{assert.deepEqual(LAYOUTS.map(l=>l.id),['grid','stack']);assert.equal(layoutId('stack'),'stack');assert.equal(layoutId('carousel'),'grid');assert.equal(layoutId(undefined),'grid');});
test('settings count only providers actually reporting a percentage',()=>{const snapshots={codex:{status:'ok',windows:[{used:.4}]},claude:{status:'needsAuth',windows:[{used:.9}]},cursor:{status:'ok',windows:[{count:12}]}};
  assert.equal(reportingCount([{id:'codex'},{id:'claude'},{id:'cursor'}],snapshots),1);assert.equal(reportingCount([],snapshots),0);});
test('first run reports a found session for every provider that is not signed out',()=>{const found=discovery({codex:{status:'ok'},claude:{status:'needsAuth'}});
  assert.equal(found.length,PROVIDERS.length);
  assert.deepEqual(found.find(f=>f.id==='codex'),{id:'codex',name:'Codex',found:true,state:'Signed in'});
  assert.equal(found.find(f=>f.id==='claude').state,'Sign in needed');
  assert.equal(found.find(f=>f.id==='grok').state,'Not found');
  assert.ok(found.every(f=>f.found===(f.state==='Signed in')));});
