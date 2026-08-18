'use strict';

// 실행: node games/doppelblock/solver.test.js
const R = require('./rules.js');
const S = require('./solver.js');

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

// --- 조합 계산 ---
// Sumaddle 앱이 8×8 단서 7에서 보여주는 조합 패널과 같은 값이 나와야 한다.
check('8×8 단서 7의 조합', S.clueCombinations(8, 7),
  [{ between: 2, sets: [[1, 6], [2, 5], [3, 4]] }, { between: 3, sets: [[1, 2, 4]] }]);
check('6×6 단서 0은 사이가 0칸', S.clueCombinations(6, 0), [{ between: 0, sets: [[]] }]);
check('6×6 최대 단서는 숫자 전부', S.clueCombinations(6, 10), [{ between: 4, sets: [[1, 2, 3, 4]] }]);
check('범위 밖 단서는 조합 없음', S.clueCombinations(6, 11), []);

// --- 기법이 정답을 지우지 않는가 (건전성) ---
// 하나라도 지우면 그 판은 논리로 풀 수 없게 되거나 엉뚱한 답이 나온다.
function dropsSolution(n, rowClues, colClues, solution) {
  const result = S.solveLogically(n, rowClues, colClues);
  for (let i = 0; i < n * n; i++) {
    if (!(result.state.cands[i] & S.bitOf(solution[i]))) return i;
  }
  return -1;
}

for (const [n, count] of [[4, 60], [5, 40], [6, 25]]) {
  let unsound = 0;
  let wrongAnswer = 0;
  let solvedButNotUnique = 0;
  let solvedCount = 0;
  for (let i = 0; i < count; i++) {
    const solution = R.randomSolution(n);
    const { rowClues, colClues } = R.cluesOf(n, solution);

    if (dropsSolution(n, rowClues, colClues, solution) >= 0) unsound++;

    const result = S.solveLogically(n, rowClues, colClues);
    if (!result.solved) continue;
    solvedCount++;
    if (String(result.grid) !== String(solution)) wrongAnswer++;
    // 논리 추론에는 분기가 없으므로 끝까지 풀렸다면 해는 유일해야 한다.
    if (R.countSolutions(n, rowClues, colClues, 2) !== 1) solvedButNotUnique++;
  }
  check(`${n}×${n}: 어떤 기법도 정답 후보를 지우지 않는다`, unsound, 0);
  check(`${n}×${n}: 논리로 낸 답은 실제 정답과 같다`, wrongAnswer, 0);
  check(`${n}×${n}: 논리로 풀리면 해가 유일하다`, solvedButNotUnique, 0);
  check(`${n}×${n}: 논리로 풀린 판이 있다`, solvedCount > 0, true);
}

// --- 기법들이 실제로 쓰이는가 ---
// 아무도 발동하지 않는 기법이 있다면 죽은 코드이거나 조건이 잘못된 것이다.
const fired = new Set();
for (let i = 0; i < 120; i++) {
  const solution = R.randomSolution(5);
  const { rowClues, colClues } = R.cluesOf(5, solution);
  for (const name of S.solveLogically(5, rowClues, colClues).used) fired.add(name);
}
for (const name of ['blocksPlaced', 'blocksForced', 'hiddenSingle', 'lineArrangements']) {
  check(`${name} 기법이 쓰인다`, fired.has(name), true);
}

// maxClue는 단서가 최대값인 줄이 있어야 하므로 따로 만들어 확인한다.
const maxRow = S.createState(4, [3, 0, 0, 0], [0, 0, 0, 0]);
const maxTech = S.TECHNIQUES.find((t) => t.name === 'maxClue');
check('maxClue가 발동한다', maxTech.run(maxRow) !== null, true);
check('maxClue는 양 끝을 검은 칸으로', [maxRow.cands[0], maxRow.cands[3]], [S.BLOCK_BIT, S.BLOCK_BIT]);
check('maxClue는 가운데에서 검은 칸을 뺀다', (maxRow.cands[1] & S.BLOCK_BIT) === 0, true);

// --- 힌트 ---
let hintWrong = 0;
let hintMissing = 0;
let hintFinished = 0;
for (let i = 0; i < 20; i++) {
  const solution = R.randomSolution(5);
  const { rowClues, colClues } = R.cluesOf(5, solution);
  if (!S.solveLogically(5, rowClues, colClues).solved) continue;

  // 빈 판에서 힌트만 반복하면 끝까지 채워져야 한다.
  const board = new Int8Array(25).fill(R.UNKNOWN);
  let guard = 0;
  while (guard++ < 60) {
    const step = S.nextStep(5, rowClues, colClues, board);
    if (!step) break;
    if (step.value !== solution[step.cell]) hintWrong++;
    board[step.cell] = step.value;
  }
  if (board.some((v) => v === R.UNKNOWN)) hintMissing++;
  else hintFinished++;
}
check('힌트가 정답과 다른 값을 짚지 않는다', hintWrong, 0);
check('힌트만 반복하면 끝까지 채워진다', hintMissing, 0);
check('힌트로 완성한 판이 있다', hintFinished > 0, true);

// 힌트에는 근거 설명이 붙어야 한다.
const sample = R.randomSolution(5);
const sampleClues = R.cluesOf(5, sample);
const firstHint = S.nextStep(5, sampleClues.rowClues, sampleClues.colClues, new Int8Array(25).fill(R.UNKNOWN));
check('힌트에 근거가 붙는다', typeof (firstHint && firstHint.detail), 'string');
check('힌트에 기법 이름이 붙는다', S.TECHNIQUE_NAMES.includes(firstHint && firstHint.technique), true);

// --- 모순된 판 ---
const contradictory = S.solveLogically(4, [3, 3, 3, 3], [0, 0, 0, 0]);
check('모순된 단서는 풀리지 않는다', contradictory.solved, false);

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);
