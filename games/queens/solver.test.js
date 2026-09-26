'use strict';

// 실행: node games/queens/solver.test.js
const R = require('./rules.js');
const S = require('./solver.js');
const G = require('./generator.js');

let passed = 0;
let failed = 0;

function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
  } else {
    failed++;
    console.log(`실패: ${name}\n  결과 ${a}\n  기대 ${e}`);
  }
}

const rng = G.mulberry32(20260904);

// 솔버는 "행마다 왕관이 하나"라는 규칙을 탐색 순서로 삼아 행을 내려가며 훑는다.
// 그 지름길이 해를 빠뜨리지 않는지 보려면 같은 지름길을 쓰지 않는 대조가 필요하다.
// 여기서는 영역마다 칸을 하나씩 고르는 모든 조합을 그대로 세어 맞춰 본다.
function bruteCount(puzzle, limit) {
  const size = puzzle.size;
  const byRegion = Array.from({ length: size }, () => []);
  puzzle.regions.forEach((id, cell) => byRegion[id].push(cell));

  let count = 0;
  const picked = [];
  function step(id) {
    if (count >= limit) return;
    if (id === size) { count++; return; }
    for (const cell of byRegion[id]) {
      const clash = picked.some((other) => {
        const sameRow = Math.floor(other / size) === Math.floor(cell / size);
        const sameCol = other % size === cell % size;
        return sameRow || sameCol || R.adjacent(size, other, cell);
      });
      if (clash) continue;
      picked.push(cell);
      step(id + 1);
      picked.pop();
      if (count >= limit) return;
    }
  }
  step(0);
  return count;
}

// 대조에는 영역이 이어져 있을 필요가 없다. 솔버는 영역 번호만 보므로 아무렇게나
// 흩뿌린 배치가 오히려 더 다양한 판을 만들어 준다.
function scatter(size) {
  const regions = new Int32Array(size * size);
  for (let i = 0; i < regions.length; i++) regions[i] = Math.floor(rng() * size);
  for (let id = 0; id < size; id++) regions[Math.floor(rng() * regions.length)] = id;
  return { size, regions: Array.from(regions) };
}

let mismatched = 0;
let logicWrong = 0;
for (let i = 0; i < 400; i++) {
  const puzzle = scatter(5);
  const mine = S.solve(puzzle, { limit: 8 }).count;
  if (mine !== bruteCount(puzzle, 8)) mismatched++;
  // 논리 풀이가 끝까지 갔다면 그 판은 반드시 해가 하나다. 규칙을 하나라도 잘못
  // 적으면 해가 여럿인 판을 "풀었다"고 말하게 되는데, 그게 가장 위험한 오류다.
  const logic = S.logicSolve(puzzle);
  if (logic.solved && mine !== 1) logicWrong++;
}
check('완전 탐색과 대조가 일치한다', mismatched, 0);
check('논리만으로 풀린 판은 해가 하나다', logicWrong, 0);

// --- 해가 나온 자리 검증 ---
let checkedPlacement = false;
for (let i = 0; i < 200 && !checkedPlacement; i++) {
  const puzzle = scatter(5);
  const res = S.solve(puzzle, { limit: 1 });
  if (!res.count) continue;
  const cells = res.solutions[0].map((c, r) => r * 5 + c);
  check('솔버가 내놓은 배치는 규칙을 지킨다', R.validate(puzzle, cells).done, true);
  checkedPlacement = true;
}
check('검증할 해를 찾았다', checkedPlacement, true);

// --- 해가 없는 판 ---
// 영역을 세로 띠로 두면 영역 제약이 열 제약과 같아져, 인접 금지 때문에 3×3은
// 답이 없다. 가운데 열에 왕관을 놓을 자리가 남지 않는다.
check('답이 없는 판은 0을 돌려준다',
  S.solve({ size: 3, regions: [0, 1, 2, 0, 1, 2, 0, 1, 2] }, { limit: 2 }).count, 0);

// --- 무작위 배치 ---
const spread = [];
for (let i = 0; i < 200; i++) {
  const size = 8;
  const pick = S.randomArrangement(size, rng);
  const cols = new Set(pick);
  const touching = pick.some((c, r) => r > 0 && Math.abs(c - pick[r - 1]) <= 1);
  spread.push(cols.size === size && !touching);
}
check('무작위 배치는 열이 겹치지도 위아래로 닿지도 않는다', spread.every(Boolean), true);

// --- 왕관이 둘인 판 ---
check('한 행의 두 열 조합은 서로 붙지 않는다',
  S.rowCombos(8, 2).every((combo) => combo.cols[1] - combo.cols[0] >= 2), true);
check('8칸 행의 두 열 조합 수', S.rowCombos(8, 2).length, 21);

// 대조: 가지치기(영역이 마지막 행에서 다 찼는지, 열을 남은 행으로 채울 수 있는지)
// 없이 행을 내려가며 모든 조합을 세어 맞춰 본다.
function bruteMulti(puzzle, limit) {
  const { size, regions } = puzzle;
  const combos = S.rowCombos(size, 2);
  const col = new Int32Array(size);
  const reg = new Int32Array(size);
  let count = 0;
  (function row(r, prev) {
    if (count >= limit) return;
    if (r === size) {
      if (col.every((v) => v === 2) && reg.every((v) => v === 2)) count++;
      return;
    }
    for (const combo of combos) {
      if (prev & (combo.mask | (combo.mask << 1) | (combo.mask >> 1))) continue;
      for (const c of combo.cols) { col[c]++; reg[regions[r * size + c]]++; }
      if (combo.cols.every((c) => col[c] <= 2 && reg[regions[r * size + c]] <= 2)) row(r + 1, combo.mask);
      for (const c of combo.cols) { col[c]--; reg[regions[r * size + c]]--; }
    }
  })(0, 0);
  return count;
}

// 대안해를 깨기 전의 판(해가 여럿인 판이 흔하다)으로 센다.
let multiMismatch = 0;
let multiLogicWrong = 0;
let multiChecked = 0;
for (let i = 0; multiChecked < 12 && i < 200; i++) {
  const solution = S.randomArrangementMulti(8, 2, rng);
  if (!solution) continue;
  const grown = G.growPairs(8, R.solutionCells({ size: 8, solution }), rng, 16);
  if (!grown) continue;
  multiChecked++;
  const puzzle = { size: 8, stars: 2, regions: Array.from(grown.regions) };
  const mine = S.solve(puzzle, { limit: 8 }).count;
  const theirs = bruteMulti(puzzle, 8);
  if (mine !== theirs) multiMismatch++;
  // 논리 풀이가 끝까지 갔다면 해는 하나여야 한다.
  if (S.logicSolve(puzzle).solved && theirs !== 1) multiLogicWrong++;
}
check('둘인 판: 대조할 판을 만들었다', multiChecked, 12);
check('둘인 판: 완전 탐색이 대조와 같은 수를 센다', multiMismatch, 0);
check('둘인 판: 논리 풀이가 끝낸 판은 해가 하나다', multiLogicWrong, 0);

{
  const puzzle = G.decodeDouble(8, require('./doubles.js').DOUBLES[8][0]);
  const logic = S.logicSolve(puzzle);
  const answer = R.solutionCells(puzzle).sort((a2, b2) => a2 - b2);
  check('둘인 판: 논리 풀이가 끝까지 간다', logic.solved, true);
  check('둘인 판: 논리 풀이가 놓은 자리가 정답이다', logic.order.slice().sort((a2, b2) => a2 - b2), answer);
}
check('7×7에는 둘씩 놓는 배치가 없다', S.randomArrangementMulti(7, 2, rng), null);

// --- 힌트 ---

// 힌트만 눌러 가도 끝까지 가고, 왕관은 늘 정답 자리에, X는 늘 정답이 아닌 자리에 놓는다.
// 사람이 아무 데나 놓아 둔 왕관과 X에서 시작해도 같다. 둘씩 판도 같다.
{
  let wrong = 0;
  let stuck = 0;
  const puzzles = [G.generate(8, { seed: 5 }), G.pickDouble(8, -1, () => 0), G.pickDouble(10, -1, () => 0.5)];
  for (const puzzle of puzzles) {
    const answer = R.solutionCells(puzzle);
    const inAnswer = new Set(answer);
    const from = { crowns: answer.filter((_, i) => i % 3 === 1), marks: [] };
    for (let cell = 0; cell < puzzle.size * puzzle.size; cell += 5) {
      if (!inAnswer.has(cell)) from.marks.push(cell);
    }
    while (from.crowns.length < answer.length) {
      const step = S.step(puzzle, from);
      if (!step) { stuck++; break; }
      for (const cell of step.crowns || []) { if (!inAnswer.has(cell)) wrong++; from.crowns.push(cell); }
      for (const cell of step.marks || []) { if (inAnswer.has(cell)) wrong++; from.marks.push(cell); }
    }
  }
  check('힌트는 놓아 둔 것에서 이어 끝까지 간다', stuck, 0);
  check('힌트는 틀린 것을 짚지 않는다', wrong, 0);
}

{
  // 한 번에 한 걸음이다 — 가정이 필요한 자리에서는 X 하나만 찍고, 그 가정은 짧다.
  // 구워 둔 10×10 앞의 몇 판을 힌트로만 풀어 본다.
  const D = require('./doubles.js').DOUBLES;
  let trials = 0;
  let wide = 0;
  let long = 0;
  for (const code of D[10].slice(0, 3)) {
    const puzzle = G.decodeDouble(10, code);
    const from = { crowns: [], marks: [] };
    while (from.crowns.length < 20) {
      const step = S.step(puzzle, from);
      if (!step) break;
      if (step.why.code === 'trial') {
        trials++;
        if (step.marks.length !== 1) wide++;
        if (step.why.steps > S.SHORT_TRIAL) long++;
      }
      if (step.crowns) from.crowns.push(...step.crowns);
      else from.marks.push(...step.marks);
    }
  }
  check('가정이 필요한 자리가 있다', trials > 0, true);
  check('가정은 X 하나만 찍는다', wide, 0);
  check('가정은 짧다', long, 0);
}

console.log(`\n${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);
