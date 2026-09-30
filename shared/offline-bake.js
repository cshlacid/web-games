'use strict';

// `sw.js`의 담을 파일 목록을 다시 굽는다: node shared/offline-bake.js
//
// 목록은 파일마다 내용 해시를 든다. 해시가 곧 캐시 열쇠라, 새 워커는 바뀐 파일만 다시
// 받고 오프라인 사본은 늘 한 배포의 파일끼리만 모인다 — 게임 파일은 옛것인데 shared/는
// 새것인 식으로 섞이면 오프라인에서만 깨진다. 배포 표시가 든 index.html도 목록에
// 있으므로 머지할 때마다 다시 굽게 되고, 빠뜨리면 offline.test.js가 잡는다.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SW = path.join(ROOT, 'sw.js');

// 사이트가 부르지 않는 개발용 파일. 담아도 깨지지는 않지만 폰 저장 공간만 먹는다.
function served(file) {
  if (/(^|\/)\./.test(file)) return false;
  if (file === 'CNAME' || file === 'sw.js') return false;
  if (/\.md$/.test(file) || /\.test\.js$/.test(file) || /\.zst$/.test(file)) return false;
  if (/(^|\/)bake\.js$/.test(file) || file.startsWith('shared/offline-bake')) return false;
  return true;
}

// 아직 add하지 않은 새 파일도 넣되 .gitignore에 걸린 것(굽는 원본)은 뺀다.
function listFiles() {
  const out = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'],
    { cwd: ROOT, encoding: 'utf8' });
  return out.split('\n').filter(Boolean)
    .filter((f) => fs.existsSync(path.join(ROOT, f)))
    .filter(served).sort();
}

function hash(file) {
  const buf = fs.readFileSync(path.join(ROOT, file));
  return crypto.createHash('sha1').update(buf).digest('hex').slice(0, 12);
}

function manifest() {
  const files = {};
  for (const f of listFiles()) files[f] = hash(f);
  return files;
}

const START = '// <files>';
const END = '// </files>';

function render(files) {
  const lines = Object.keys(files).map((f) => `  ${JSON.stringify(f)}: '${files[f]}',`);
  return `${START}\nconst FILES = {\n${lines.join('\n')}\n};\n${END}`;
}

function current() {
  const src = fs.readFileSync(SW, 'utf8');
  const a = src.indexOf(START);
  const b = src.indexOf(END);
  if (a < 0 || b < 0) throw new Error('sw.js에 목록 표시가 없다');
  return { src, a, b: b + END.length };
}

function bake() {
  const { src, a, b } = current();
  const next = src.slice(0, a) + render(manifest()) + src.slice(b);
  if (next !== src) fs.writeFileSync(SW, next);
  return next !== src;
}

function isFresh() {
  const { src, a, b } = current();
  return src.slice(a, b) === render(manifest());
}

if (require.main === module) {
  console.log(bake() ? 'sw.js 목록을 새로 구웠다' : 'sw.js 목록이 이미 최신이다');
}

module.exports = { served, manifest, isFresh };
