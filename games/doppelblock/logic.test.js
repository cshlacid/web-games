'use strict';

// 실행: node games/doppelblock/logic.test.js
const R = require('./rules.js');

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

const B = R.BLOCK;

// --- 상수 ---
check('6×6은 1~4를 쓴다', R.digitCount(6), 4);
check('7×7은 1~5를 쓴다', R.digitCount(7), 5);
check('6×6 한 줄의 숫자 합', R.lineTotal(6), 10);
check('7×7 한 줄의 숫자 합', R.lineTotal(7), 15);
check('9×9 한 줄의 숫자 합', R.lineTotal(9), 28);

// --- 단서 읽기 ---
check('검은 칸이 붙어 있으면 0', R.clueOf([1, B, B, 2, 4, 3]), 0);
check('양 끝이 검은 칸이면 최대', R.clueOf([B, 1, 2, 4, 3, B]), 10);
check('사이의 숫자만 더한다', R.clueOf([1, B, 2, 4, B, 3]), 6);
check('바깥 숫자는 세지 않는다', R.clueOf([3, 4, B, 1, B, 2]), 1);
check('검은 칸이 둘이 아니면 null', R.clueOf([1, 2, 3, 4, 5, 6]), null);

// --- 배치 목록 ---
// 검은 칸 두 자리를 고르는 경우 × 나머지에 숫자를 늘어놓는 경우
const factorial = (k) => (k <= 1 ? 1 : k * factorial(k - 1));
const pairs = (k) => (k * (k - 1)) / 2;
check('6×6 배치 수', R.arrangementsBySize(6).all.length, pairs(6) * factorial(4));
check('7×7 배치 수', R.arrangementsBySize(7).all.length, pairs(7) * factorial(5));
check('배치는 모두 검은 칸 2개', R.arrangementsBySize(6).all.every(
  (line) => [...line].filter((v) => v === B).length === 2), true);
check('단서별로 나뉘어 있다', R.arrangementsForClue(6, 10).every(
  (line) => R.clueOf([...line]) === 10), true);
check('단서 10은 양 끝 배치뿐', R.arrangementsForClue(6, 10).every(
  (line) => line[0] === B && line[5] === B), true);
check('범위 밖 단서는 빈 목록', R.arrangementsForClue(6, 11).length, 0);

// --- 검증기 ---
const good = R.randomSolution(6, () => 0.42);
const goodClues = R.cluesOf(6, good);
check('만들어진 완성판은 규칙을 지킨다', R.validate(6, good, goodClues.rowClues, goodClues.colClues), null);

const brokenClue = { ...goodClues, rowClues: [...goodClues.rowClues] };
brokenClue.rowClues[0] = (brokenClue.rowClues[0] + 1) % 11;
check('단서가 어긋나면 잡아낸다',
  R.validate(6, good, brokenClue.rowClues, goodClues.colClues) !== null, true);

const brokenGrid = good.slice();
brokenGrid[0] = brokenGrid[0] === B ? 1 : B;
check('검은 칸 수가 틀리면 잡아낸다',
  R.validate(6, brokenGrid, goodClues.rowClues, goodClues.colClues) !== null, true);

// --- 완성판 무작위 생성 ---
let allValid = true;
for (let i = 0; i < 20; i++) {
  const grid = R.randomSolution(6);
  const clues = R.cluesOf(6, grid);
  if (R.validate(6, grid, clues.rowClues, clues.colClues)) allValid = false;
}
check('무작위 완성판 20개가 모두 규칙을 지킨다', allValid, true);

// --- 솔버 왕복 ---
// 정답에서 단서를 읽어 다시 풀면 원래 정답이 해 안에 있어야 한다. 6×6은 해가
// 100개 가까이 나오는 판도 있어서 상한을 넉넉히 준다 — 상한에 걸려 못 찾는 것을
// 솔버 결함으로 오해하지 않도록.
let roundTrip = true;
let uniqueMismatch = 0;
let noSolution = 0;
for (let i = 0; i < 12; i++) {
  const grid = R.randomSolution(6);
  const { rowClues, colClues } = R.cluesOf(6, grid);
  const found = R.solve(6, rowClues, colClues, 5000);
  if (found.length === 0) noSolution++;
  if (!found.some((s) => String(s) === String(grid))) roundTrip = false;
  // 해가 하나뿐이라면 그것은 반드시 원래 정답이어야 한다. 이 불변식은 상한과
  // 무관하게 성립한다.
  if (found.length === 1 && String(found[0]) !== String(grid)) uniqueMismatch++;
}
check('풀어낸 해에 원래 정답이 들어 있다', roundTrip, true);
check('정답에서 뽑은 단서는 항상 풀린다', noSolution, 0);
check('해가 하나면 그것이 원래 정답', uniqueMismatch, 0);

// 4×4는 숫자가 1,2뿐이라 손으로 확인할 수 있다.
check('4×4는 1~2를 쓴다', R.digitCount(4), 2);
check('4×4 한 줄 합', R.lineTotal(4), 3);
const tiny = R.solve(4, [3, 3, 3, 3], [3, 3, 3, 3], 10);
check('4×4에서 모든 줄이 최대 단서면 검은 칸은 전부 양 끝',
  tiny.every((s) => [0, 3, 4, 7, 8, 11, 12, 15].every((i) => s[i] === B)), true);

// --- 해 개수 ---
check('풀 수 없는 단서', R.countSolutions(6, [99, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0]), 0);
const many = R.countSolutions(4, [0, 0, 0, 0], [0, 0, 0, 0], 5);
check('느슨한 단서는 해가 여럿', many > 1, true);

// --- 빠른 솔버가 정말 맞는가 ---
// 열 쪽 가지치기가 해를 빠뜨리거나 없는 해를 만들어내면 여기서 걸린다.
// 참조 솔버는 일부러 단순하게 짠다: 검은 칸 개수만 보고, 나머지는 끝에서 전부 검사.
function referenceSolve(n, rowClues, colClues, limit = 50) {
  const grid = new Int8Array(n * n);
  const out = [];
  const colBlocks = new Int8Array(n);
  const go = (r) => {
    if (out.length >= limit) return;
    if (r === n) {
      if (!R.validate(n, grid, rowClues, colClues)) out.push(grid.slice());
      return;
    }
    for (const line of R.arrangementsForClue(n, rowClues[r])) {
      let ok = true;
      for (let c = 0; c < n; c++) if (line[c] === B && colBlocks[c] >= 2) { ok = false; break; }
      if (!ok) continue;
      for (let c = 0; c < n; c++) { grid[r * n + c] = line[c]; if (line[c] === B) colBlocks[c]++; }
      go(r + 1);
      for (let c = 0; c < n; c++) if (line[c] === B) colBlocks[c]--;
      if (out.length >= limit) return;
    }
  };
  go(0);
  return out;
}

// 6×6은 참조 솔버가 너무 느려 테스트에 넣지 않는다. 가지치기 코드에 크기별
// 분기가 없으므로 작은 판에서 맞으면 큰 판에서도 같은 논리가 돈다.
let mismatch = 0;
let invalidSolution = 0;
for (const n of [4, 5]) {
  for (let i = 0; i < 40; i++) {
    const grid = R.randomSolution(n);
    const { rowClues, colClues } = R.cluesOf(n, grid);
    const fast = R.solve(n, rowClues, colClues, 50);
    if (fast.length !== referenceSolve(n, rowClues, colClues, 50).length) mismatch++;
    for (const found of fast) {
      if (R.validate(n, found, rowClues, colClues)) invalidSolution++;
    }
  }
}
check('참조 솔버와 해의 개수가 같다', mismatch, 0);
check('솔버가 내놓은 해는 모두 규칙을 지킨다', invalidSolution, 0);

// 6×6에서도 내놓은 해 자체는 규칙을 지켜야 한다(개수 대조는 생략).
let invalidBig = 0;
for (let i = 0; i < 15; i++) {
  const grid = R.randomSolution(6);
  const { rowClues, colClues } = R.cluesOf(6, grid);
  for (const found of R.solve(6, rowClues, colClues, 10)) {
    if (R.validate(6, found, rowClues, colClues)) invalidBig++;
  }
}
check('6×6에서도 해가 모두 규칙을 지킨다', invalidBig, 0);

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);
