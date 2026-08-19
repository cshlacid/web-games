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
for (const name of ['eliminate', 'blockPairs', 'blocksPlaced', 'hiddenSingle', 'lineArrangements']) {
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

  // 빈 판에서 힌트만 반복하면 끝까지 채워져야 한다. 힌트는 후보를 좁히기만
  // 하는 단계도 돌려주므로, 화면이 하듯 연필 표시에 받아 적어야 진행한다.
  const board = new Int8Array(25).fill(R.UNKNOWN);
  const marks = new Uint16Array(25);
  let guard = 0;
  while (guard++ < 400) {
    const step = S.nextHint(5, rowClues, colClues, board, marks);
    if (!step) break;
    if (step.kind === 'narrow') {
      for (const { cell, mask } of step.cells) {
        // 좁혀 준 후보에 정답이 남아 있지 않으면 힌트가 거짓말을 한 것이다.
        if (!(mask & S.bitOf(solution[cell]))) hintWrong++;
        marks[cell] = mask;
      }
      continue;
    }
    if (step.value !== solution[step.cell]) hintWrong++;
    board[step.cell] = step.value;
    marks[step.cell] = 0;
  }
  if (board.some((v) => v === R.UNKNOWN)) hintMissing++;
  else hintFinished++;
}
check('힌트가 정답과 어긋나지 않는다', hintWrong, 0);
check('힌트만 반복하면 끝까지 채워진다', hintMissing, 0);
check('힌트로 완성한 판이 있다', hintFinished > 0, true);

// 힌트에는 근거 설명이 붙어야 한다. 논리로 안 풀리는 판에서는 힌트가 없는 것이
// 정상이므로, 풀리는 판을 골라서 확인한다.
let sampleClues = null;
for (let i = 0; i < 200 && !sampleClues; i++) {
  const sample = R.randomSolution(5);
  const clues = R.cluesOf(5, sample);
  if (S.solveLogically(5, clues.rowClues, clues.colClues).solved) sampleClues = clues;
}
check('설명 확인용 판을 찾았다', sampleClues !== null, true);
const firstHint = S.nextHint(5, sampleClues.rowClues, sampleClues.colClues, new Int8Array(25).fill(R.UNKNOWN));
check('힌트에 근거가 붙는다', typeof (firstHint && firstHint.detail), 'string');
check('힌트에 기법 이름이 붙는다', S.TECHNIQUE_NAMES.includes(firstHint && firstHint.technique), true);

// 아래 판은 힌트가 "배치가 5가지 남았다"는 한 문장으로 추론 네 단계를 건너뛰어
// 읽어도 모르겠다는 말을 들은 실제 판이다. 첫 힌트는 사슬의 첫 고리인 가로 2줄
// (합 9 → 2+3+4뿐 → 사이가 3칸)이어야 한다.
const chainRows = [7, 9, 4, 2, 2, 2];
const chainCols = [7, 0, 0, 7, 6, 4];
const chainEmpty = new Int8Array(36).fill(R.UNKNOWN);
const chainFirst = S.nextHint(6, chainRows, chainCols, chainEmpty, new Uint16Array(36));
check('긴 사슬에서는 확정 대신 후보 좁히기부터 준다', chainFirst.kind, 'narrow');
check('첫 힌트가 사슬의 첫 고리를 짚는다', `${chainFirst.line.kind}${chainFirst.line.index}`, 'row1');
check('좁히기 힌트가 칸을 짚는다', chainFirst.cells.length > 0, true);
check('좁히기 힌트에 빠지는 값이 적힌다', chainFirst.detail.includes('빠집니다'), true);

// 받아 적은 뒤 같은 말을 또 하면 힌트를 눌러도 제자리인 것처럼 보인다.
const chainMarks = new Uint16Array(36);
for (const { cell, mask } of chainFirst.cells) chainMarks[cell] = mask;
const chainSecond = S.nextHint(6, chainRows, chainCols, chainEmpty, chainMarks);
check('적어 둔 후보와 같은 힌트를 다시 주지 않는다',
  JSON.stringify(chainSecond) !== JSON.stringify(chainFirst), true);

// 좁히기만 하는 단계가 섞여도 힌트만으로 끝까지 가야 한다.
{
  const board = new Int8Array(36).fill(R.UNKNOWN);
  const marks = new Uint16Array(36);
  let guard = 0;
  while (guard++ < 1000) {
    const step = S.nextHint(6, chainRows, chainCols, board, marks);
    if (!step) break;
    if (step.kind === 'narrow') {
      for (const { cell, mask } of step.cells) marks[cell] = mask;
      continue;
    }
    board[step.cell] = step.value;
    marks[step.cell] = 0;
  }
  check('6×6 판도 힌트만으로 끝까지 채워진다', board.some((v) => v === R.UNKNOWN), false);
  check('완성된 판이 규칙에 맞는다', R.validate(6, board, chainRows, chainCols), null);
}

// --- 모순된 판 ---
const contradictory = S.solveLogically(4, [3, 3, 3, 3], [0, 0, 0, 0]);
check('모순된 단서는 풀리지 않는다', contradictory.solved, false);

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);
