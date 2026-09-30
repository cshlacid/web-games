'use strict';

// node shared/offline.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { served, manifest, isFresh } = require('./offline-bake.js');

const ROOT = path.join(__dirname, '..');

assert.ok(isFresh(), 'sw.js 목록이 낡았다 — node shared/offline-bake.js');

const files = manifest();
assert.ok(files['index.html'], '목록 페이지가 빠졌다');
assert.ok(files['manifest.json'], 'manifest.json이 빠졌다');
for (const f of ['CLAUDE.md', 'CNAME', 'sw.js', 'shared/daily.test.js', 'games/queens/bake.js']) {
  assert.ok(!served(f), f + '는 담지 않는다');
}

// 목록 페이지에서 들어갈 수 있는 게임은 모두 오프라인으로도 떠야 한다.
const hub = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const games = [...hub.matchAll(/href="(games\/[^"]+?)\/?"/g)].map((m) => m[1]);
assert.ok(games.length > 0);
for (const g of games) assert.ok(files[g + '/index.html'], g + '이 목록에 없다');

// 모든 페이지가 워커를 등록해야 그 페이지에서 처음 들어온 사람도 사본을 받는다.
for (const f of Object.keys(files).filter((f) => f.endsWith('.html'))) {
  const html = fs.readFileSync(path.join(ROOT, f), 'utf8');
  assert.ok(/src="[./]*shared\/offline\.js"/.test(html), f + '에 shared/offline.js가 없다');
}

console.log('offline: ok');
