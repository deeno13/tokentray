import {test} from 'node:test';import assert from 'node:assert/strict';
import {percent,resetText,statusText,visibleWindows,PROVIDERS} from '../ui/model.mjs';
test('all eight requested providers are distinct',()=>{assert.equal(PROVIDERS.length,8);assert.equal(new Set(PROVIDERS.map(p=>p.id)).size,8)});
test('unknown quota differs from reported zero and activity count',()=>{assert.equal(percent({}),null);assert.equal(percent({used:0}),0);assert.equal(percent({used:0,count:12}),null);assert.equal(percent({used:1.2}),120)});
test('reset countdown never silently invents a reset',()=>{assert.match(resetText(null,1),/unavailable/);assert.match(resetText(1,2),/awaiting refresh/);assert.equal(resetText(3600001,1),'Resets in 1h')});
test('old successful readings become visibly stale',()=>assert.equal(statusText({status:'ok',fetched_at:1},400000),'Stale'));
test('signed-out accounts never display prior account readings',()=>assert.deepEqual(visibleWindows({status:'needsAuth',windows:[{used:.2}]}),[]));
