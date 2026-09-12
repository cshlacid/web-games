'use strict';

// 실행: node games/defense/paths.test.js
const M = require('./mapgen.js');
const P = require('./paths.js');

let passed = 0;
let failed = 0;

function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed++;
  else { failed++; console.log(`실패: ${name}\n  결과 ${a}\n  기대 ${e}`); }
}

function mapOf(rows) {
  const h = rows.length;
  const w = rows[0].length;
  const walls = [];
  let entry = null;
  let exit = null;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = rows[y][x];
      walls.push(c === '#' ? 1 : 0);
      if (c === 'I') entry = { x, y };
      if (c === 'O') exit = { x, y };
    }
  }
  return { w, h, walls, entry, exit };
}

const empty = (map) => new Array(map.w * map.h).fill(null);
const put = (map, units, x, y, hp) => { units[P.at(map, x, y)] = { hp }; return units; };
const timeAt = (map, f, p) => f.dist[P.at(map, p.x, p.y)];

const NORMAL = { speed: 1, siege: 10, bias: 1 };
const SIEGE = { speed: 1, siege: 10, bias: 0.4 };

// 왼쪽은 네 칸, 오른쪽으로 돌면 열두 칸. 지키는 이를 왼쪽 목에 세워 두고
// 체력만 바꾸면 "돌아갈까 뚫을까"가 그대로 갈린다.
const detour = mapOf([
  'I....',
  '.###.',
  '.###.',
  '.###.',
  'O....',
]);

const bare = P.field(detour, empty(detour), NORMAL);
check('빈 판에서는 짧은 쪽으로 간다', timeAt(detour, bare, detour.entry), 4);
check('길은 출구에서 끝난다', P.route(detour, bare, detour.entry).length, 5);
check('벽만으로는 막히지 않았다', P.sealed(detour, bare), false);

const tough = P.field(detour, put(detour, empty(detour), 0, 1, 100), NORMAL);
check('부수는 데 오래 걸리면 돌아간다', timeAt(detour, tough, detour.entry), 12);
check('돌아간 길은 지키는 칸을 밟지 않는다',
  P.route(detour, tough, detour.entry).some((c) => c.x === 0 && c.y === 1), false);

const frail = P.field(detour, put(detour, empty(detour), 0, 1, 50), NORMAL);
check('약하면 돌아가지 않고 뚫는다', timeAt(detour, frail, detour.entry), 9);
check('뚫는 길은 그 칸을 밟는다',
  P.route(detour, frail, detour.entry).some((c) => c.x === 0 && c.y === 1), true);

const siege = P.field(detour, put(detour, empty(detour), 0, 1, 100), SIEGE);
check('공성형은 같은 자리를 뚫는다', timeAt(detour, siege, detour.entry), 8);

check('치우면 길이 되돌아온다',
  timeAt(detour, P.field(detour, empty(detour), NORMAL), detour.entry), 4);

// 통로 둘. 어느 쪽을 뚫는지는 체력이 정한다.
const twin = mapOf([
  'I....',
  '#.#.#',
  '....O',
]);
const both = empty(twin);
put(twin, both, 1, 1, 100);
put(twin, both, 3, 1, 20);
const pick = P.field(twin, both, NORMAL);
check('양쪽이 막히면 약한 쪽을 뚫는다', timeAt(twin, pick, twin.entry), 8);
check('약한 쪽을 밟는다',
  P.route(twin, pick, twin.entry).some((c) => c.x === 3 && c.y === 1), true);

// 부술 힘이 없는 적에게는 지키는 이가 벽과 같다.
const meek = P.field(twin, both, { speed: 1, siege: 0, bias: 1 });
check('부술 수 없으면 길이 끊긴다', P.sealed(twin, meek), true);

const walled = mapOf(['I..', '###', '..O']);
check('벽으로만 끊긴 판', P.sealed(walled, P.field(walled, empty(walled), NORMAL)), true);

// 속도는 시간에 그대로 곱해진다 — 비용의 단위가 초라는 것을 여기서 본다.
const fast = P.field(detour, empty(detour), { speed: 2, siege: 10, bias: 1 });
check('빠른 적은 같은 길을 절반 시간에 간다', timeAt(detour, fast, detour.entry), 2);

check('같은 입력이면 같은 결과',
  Array.from(P.field(detour, empty(detour), NORMAL).dist),
  Array.from(bare.dist));

// 생성된 판은 모두 갈 수 있어야 한다. 여기가 무너지면 그 스테이지는 시작하자마자
// 끝난다.
let stuck = 0;
let short = 0;
for (let s = 1; s <= 50; s++) {
  const m = M.build(s);
  const f = P.field(m, empty(m), NORMAL);
  if (P.sealed(m, f)) stuck++;
  const r = P.route(m, f, m.entry);
  const last = r[r.length - 1];
  if (last.x !== m.exit.x || last.y !== m.exit.y) stuck++;
  // 입구에서 출구까지 열 칸도 안 되면 세울 자리가 없다.
  if (r.length < 11) short++;
}
check('50판 모두 출구까지 간다', stuck, 0);
check('길이 너무 짧은 판은 없다', short, 0);

console.log(`${passed}개 통과, ${failed}개 실패`);
if (failed) process.exit(1);
