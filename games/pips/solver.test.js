'use strict';

// 실행: node games/pips/solver.test.js
const R = require('./rules.js');
const S = require('./solver.js');
const G = require('./generator.js');

let passed = 0;
let failed = 0;

function check(name, ok) {
  if (ok) passed++;
  else { failed++; console.log(`실패: ${name}`); }
}

const pairOf = (placed) => placed.map((p) => [p.a, p.b].sort((x, y) => x - y).join('-')).join(',');

// 구역 조건 판정.
{
  const bit = S.bit;
  const r = (kind, target) => ({ kind, target, cells: [0, 1] });
  const m = (a, b) => (c) => (c === 0 ? a : b);
  check('합: 범위 안', S.regionOk(r('sum', 7), m(bit(3) | bit(1), bit(4))));
  check('합: 못 미침', !S.regionOk(r('sum', 9), m(bit(3), bit(4) | bit(5))));
  check('작다', S.regionOk(r('lt', 2), m(bit(0) | bit(6), bit(1))) && !S.regionOk(r('lt', 1), m(bit(1), bit(0))));
  check('크다', S.regionOk(r('gt', 10), m(bit(6), bit(5))) && !S.regionOk(r('gt', 11), m(bit(6), bit(5))));
  check('같음', S.regionOk(r('eq'), m(bit(2) | bit(3), bit(3))) && !S.regionOk(r('eq'), m(bit(2), bit(3))));
  check('다름', S.regionOk(r('ne'), m(bit(2), bit(2) | bit(4))) && !S.regionOk(r('ne'), m(bit(2), bit(2))));
}

// 한 구역 안에 통째로 든 도미노는 뒤집어도 답이다 — 자리로 세면 하나.
{
  const p = R.parse('2x1|00|25|7');
  const all = S.search(p, 5);
  check('뒤집기만 다른 답은 하나로 센다', all.length === 1);
  const solved = S.solve(p);
  check('풀린다', solved.solved);
  check('반대 방향도 규칙에 맞다', R.inspect(p, [{ a: 1, b: 0 }]).solved);
}

// 방향이 묶인 경우: 한 줄 네 칸, 가운데 두 칸이 합 5인 구역이고 도미노 12·43이 양쪽에 눕는다.
// 1+4와 2+3만 5라 두 도미노의 방향을 따로따로 고르면 안 되고 함께 맞춰야 한다.
{
  const p = R.parse('4x1|011#|1243|<3,5');
  const all = S.search(p, 10);
  check('짝이 맞는 방향을 함께 고른다', all.length === 1 && R.inspect(p, all[0]).solved);
  check('풀이기도 규칙에 맞는 답', R.inspect(p, S.solve(p).placed).solved);
}

// 구워 둔 판: 풀이기가 푼 답은 규칙에 맞고, 끝까지 뒤져도 자리가 같은 답뿐이다.
for (const level of Object.keys(G.PUZZLES)) {
  G.PUZZLES[level].slice(0, 12).forEach((code, id) => {
    const p = R.parse(code);
    const solved = S.solve(p, { trial: true, limit: Infinity });
    check(`${level} ${id}번: 풀린다`, solved.solved);
    const all = S.search(p, 2);
    check(`${level} ${id}번: 도미노 자리가 하나뿐`, all.length === 1 && pairOf(all[0]) === pairOf(solved.placed));
  });
}

// 힌트: 빈 판에서 시작해 힌트만 따라가면 끝까지 풀리고, 놓는 것마다 답과 같은 자리다.
for (const level of Object.keys(G.PUZZLES)) {
  const p = R.parse(G.PUZZLES[level][0]);
  const sol = S.solve(p, { trial: true, limit: Infinity }).placed;
  const placed = p.tiles.map(() => null);
  let ok = true;
  for (let k = 0; k < p.tiles.length; k++) {
    const step = S.hint(p, placed);
    if (!step) { ok = false; break; }
    const same = [step.a, step.b].sort((x, y) => x - y).join() === [sol[step.t].a, sol[step.t].b].sort((x, y) => x - y).join();
    if (!same || placed[step.t]) { ok = false; break; }
    placed[step.t] = { a: step.a, b: step.b };
  }
  check(`${level}: 힌트만으로 끝까지`, ok && R.inspect(p, placed).solved);
  check(`${level}: 다 풀린 판에는 힌트가 없다`, S.hint(p, placed) === null);
}

// 쉬움의 첫 힌트는 가정 없이 나온다.
{
  const p = R.parse(G.PUZZLES.easy[0]);
  const step = S.hint(p, p.tiles.map(() => null));
  check('쉬움 첫 힌트의 까닭', step && (step.why.code === 'cell' || step.why.code === 'tile'));
}

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);
