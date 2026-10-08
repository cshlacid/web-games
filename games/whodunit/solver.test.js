'use strict';

// 실행: node games/whodunit/solver.test.js
const R = require('./rules.js');
const S = require('./solver.js');
const G = require('./generator.js');

let passed = 0;
let failed = 0;

function check(name, ok) {
  if (ok) passed++;
  else { failed++; console.log(`실패: ${name}`); }
}

const jobs = '00000000000000000000';
const make = (truth, start, clues) => R.parse(`0123456789abcdefghij|${jobs}|${truth}|${start}|${clues.join(';')}`);
const filler = Array(20).fill('=Ec0');

// 0번이 "0행에 범인 없음"이라고 말하면 0행 나머지 셋은 무고로 정해진다.
{
  const clues = filler.slice();
  clues[0] = '=R0c0';
  const p = make('00001000000000000000', 0, clues);
  const step = S.apply(p.clues[0], 1, 0);
  check('단서 하나로 정해진다', (step.known & 0b1110) === 0b1110 && (step.crim & 0b1110) === 0);
  check('정해진 사람은 yes', S.decided(p, 1, 1, 0) === 'yes');
  check('정해졌는데 반대면 no', S.decided(p, 1, 1, 1) === 'no');
  check('단서가 안 닿으면 open', S.decided(p, 1, 4, 1) === 'open' && S.decided(p, 1, 4, 0) === 'open');
  const h = S.hint(p, 1);
  check('힌트는 단서 하나로 정해지는 사람', h && h.why.code === 'clue' && h.why.from === 0 && h.value === 0 && [1, 2, 3].includes(h.cell));
}

// "0행에 범인 하나"만으로는 남은 셋 중 누구인지 모른다.
{
  const clues = filler.slice();
  clues[0] = '=R0c1';
  const p = make('00010000000000000000', 0, clues);
  check('범인 하나인 줄에서 아직 모르는 사람은 open', S.decided(p, 1, 3, 1) === 'open');
}

// 구워 둔 판: 처음 사람에서 시작해 논리로 정해지는 사람을 모두 밝혀 나가면 끝까지 간다.
function play(p, trial) {
  let revealed = 1 << p.start;
  for (;;) {
    const d = S.deduce(p, revealed, { trial });
    if (d.known === revealed) return revealed;
    // 논리로 정한 정체는 언제나 참이어야 한다.
    if ((d.crim & d.known) !== (p.truth & d.known)) return -1;
    revealed = d.known;
  }
}

for (const level of Object.keys(G.PUZZLES)) {
  G.PUZZLES[level].slice(0, 15).forEach((code, id) => {
    const p = R.parse(code);
    check(`${level} ${id}번: 끝까지 밝혀진다`, play(p, level !== 'easy') === R.FULL);
  });
}

// 힌트만으로 끝까지: 놓는 것마다 참이고, 한 번에 0.2초를 넘지 않는다.
for (const level of Object.keys(G.PUZZLES)) {
  const p = R.parse(G.PUZZLES[level][0]);
  let revealed = 1 << p.start;
  let ok = true;
  let slow = 0;
  for (let k = 0; k < 20 && revealed !== R.FULL; k++) {
    const t0 = Date.now();
    const step = S.hint(p, revealed);
    slow = Math.max(slow, Date.now() - t0);
    if (!step || ((p.truth >> step.cell) & 1) !== step.value || revealed & (1 << step.cell)) { ok = false; break; }
    revealed |= 1 << step.cell;
  }
  check(`${level}: 힌트만으로 끝까지`, ok && revealed === R.FULL);
  check(`${level}: 힌트 한 번이 0.2초 안쪽 (${slow}ms)`, slow < 200);
}

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);
