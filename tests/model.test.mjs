import {test} from 'node:test';import assert from 'node:assert/strict';
import {percent,resetText,statusText,visibleWindows,PROVIDERS} from '../ui/model.mjs';
test('all eight requested providers are distinct',()=>{assert.equal(PROVIDERS.length,8);assert.equal(new Set(PROVIDERS.map(p=>p.id)).size,8)});
test('unknown quota differs from reported zero and activity count',()=>{assert.equal(percent({}),null);assert.equal(percent({used:0}),0);assert.equal(percent({used:0,count:12}),null);assert.equal(percent({used:1.2}),120)});
test('reset countdown never silently invents a reset',()=>{assert.match(resetText(null,1),/unavailable/);assert.match(resetText(1,2),/awaiting refresh/);assert.equal(resetText(3600001,1),'Resets in 1h')});
test('old successful readings become visibly stale',()=>assert.equal(statusText({status:'ok',fetched_at:1},400000),'Stale'));
test('signed-out accounts never display prior account readings',()=>assert.deepEqual(visibleWindows({status:'needsAuth',windows:[{used:.2}]}),[]));

import {enabledProviders} from '../ui/model.mjs';
test('provider settings hide disabled entries and preserve provider order',()=>{assert.deepEqual(enabledProviders({disabled:['codex','grok','unknown']}).map(p=>p.id),['claude','cursor','antigravity','glm','opencode','copilot']);assert.equal(enabledProviders({disabled:PROVIDERS.map(p=>p.id)}).length,0);assert.equal(enabledProviders().length,8);});

import {accountText} from '../ui/model.mjs';
test('settings show identity and plan while hiding signed-out identity',()=>{const a={email:'alex@example.com',plan:'plus'};assert.match(accountText(a,{status:'ok'}),/alex@example.com.*plus plan/);assert.doesNotMatch(accountText(a,{status:'needsAuth'}),/alex@example.com/);assert.match(accountText(null,{status:'ok'}),/Plan not reported/);assert.match(accountText({username:'alex'},{status:'ok'},true),/@alex.*Paused/);});

import {RING_COLORS,ringHex,providerSwatch} from '../ui/model.mjs';
test('ring color options keep provider default first with distinct presets',()=>{assert.equal(RING_COLORS[0].id,'provider');assert.equal(new Set(RING_COLORS.map(c=>c.id)).size,RING_COLORS.length);assert.ok(RING_COLORS.length>=4);assert.deepEqual([RING_COLORS[0].light,RING_COLORS[0].dark],[null,null]);for(const c of RING_COLORS.slice(1)){assert.match(c.light,/^#[0-9a-f]{6}$/i);assert.match(c.dark,/^#[0-9a-f]{6}$/i);}});
test('ring hex resolves per scheme and unknown ids fall back to provider',()=>{assert.equal(ringHex('teal',false),'#006d77');assert.equal(ringHex('teal',true),'#6edbd5');assert.equal(ringHex(undefined,true),null);assert.equal(ringHex('hot-pink',false),null);});
test('provider swatch is a two-scheme gradient of brand accents',()=>{assert.match(providerSwatch(false),/^conic-gradient\(/);assert.notEqual(providerSwatch(false),providerSwatch(true));});
