'use strict';

// 브라우저 없이 규칙·기법·생성기를 검증한다. 실행: node games/sudoku/logic.test.js
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

const technique = (name) => S.TECHNIQUES.find((t) => t.name === name).run;
const cands = (state, index) => {
  const out = [];
  for (let d = 1; d <= 9; d++) if (state.cands[index] & S.bitOf(d)) out.push(d);
  return out;
};

// --- 판 다루기 ---

const SOLVED =
  '534678912672195348198342567859761423426853791713924856961537284287419635345286179';

check('문자열 왕복', S.toString(S.fromString(SOLVED)), SOLVED);
check('완성판 인식', S.isComplete(S.fromString(SOLVED)), true);

const one = S.emptyState();
S.assign(one, 0, 5);
check('배치한 값', one.values[0], 5);
check('같은 행 동료에서 후보 제거', cands(one, 1).includes(5), false);
check('같은 박스 동료에서 후보 제거', cands(one, 10).includes(5), false);
check('무관한 칸은 그대로', cands(one, 40).includes(5), true);

// 단서끼리 충돌하면 시작부터 모순
check('같은 행에 같은 숫자', S.fromString('55' + '.'.repeat(79)).broken, true);

// --- 기법 하나하나가 의도한 추론을 하는가 ---

// 행 0에서 1이 들어갈 자리를 한 칸만 남기면 그 칸으로 확정돼야 한다.
const hs = S.emptyState();
for (let i = 1; i < 9; i++) S.eliminate(hs, i, 1);
check('숨은 단수', technique('hiddenSingle')(hs) && hs.values[0], 1);

// 행 0의 두 칸을 {1,2}로 묶으면 같은 행 나머지에서 1,2가 빠져야 한다.
const np = S.emptyState();
for (const i of [0, 1]) for (let d = 3; d <= 9; d++) S.eliminate(np, i, d);
check('드러난 쌍이 발동', technique('nakedPair')(np), true);
check('같은 행에서 제거됨', cands(np, 5).some((d) => d === 1 || d === 2), false);
check('다른 행은 그대로', cands(np, 45).includes(1), true);

// 박스 0에서 5의 자리가 행 0에만 남으면, 행 0의 박스 밖에서 5가 빠져야 한다.
const pt = S.emptyState();
for (const i of [9, 10, 11, 18, 19, 20]) S.eliminate(pt, i, 5);
check('가리키기가 발동', technique('pointing')(pt), true);
check('같은 행 박스 밖에서 제거', cands(pt, 5).includes(5), false);
check('박스 안 행 0은 그대로', cands(pt, 0).includes(5), true);

// 행 0에서 5의 자리가 박스 0에만 남으면, 박스 0의 다른 행에서 5가 빠져야 한다.
const cl = S.emptyState();
for (let i = 3; i < 9; i++) S.eliminate(cl, i, 5);
check('주장하기가 발동', technique('claiming')(cl), true);
check('같은 박스 다른 행에서 제거', cands(cl, 9).includes(5), false);

// 행 0과 1에서 5의 자리가 같은 두 칼럼뿐이면, 그 칼럼의 다른 행에서 5가 빠진다.
const xw = S.emptyState();
for (const row of [0, 1]) {
  for (let c = 0; c < 9; c++) {
    if (c === 2 || c === 5) continue;
    S.eliminate(xw, row * 9 + c, 5);
  }
}
check('X-Wing이 발동', technique('xWing')(xw), true);
check('해당 칼럼 다른 행에서 제거', cands(xw, 9 * 4 + 2).includes(5), false);
check('무관한 칼럼은 그대로', cands(xw, 9 * 4 + 3).includes(5), true);

// --- 해 개수 세기 ---

check('완성판의 해는 하나', S.countSolutions(SOLVED), 1);
check('빈 판은 여러 개(2에서 중단)', S.countSolutions('.'.repeat(81)), 2);
check('모순된 판의 해는 0', S.countSolutions('55' + '.'.repeat(79)), 0);

// 같은 밴드의 두 행 × 서로 다른 스택의 두 칼럼이 이루는 직사각형에서 값이 a,b/b,a면
// 둘을 맞바꿔도 규칙을 어기지 않는다. 이런 판은 유일해가 아니다.
function makeAmbiguous(solved) {
  const arr = [...solved];
  for (let r1 = 0; r1 < 9; r1++) for (let r2 = r1 + 1; r2 < 9; r2++) {
    if (((r1 / 3) | 0) !== ((r2 / 3) | 0)) continue;
    for (let c1 = 0; c1 < 9; c1++) for (let c2 = c1 + 1; c2 < 9; c2++) {
      if (((c1 / 3) | 0) === ((c2 / 3) | 0)) continue;
      const a = arr[r1 * 9 + c1], b = arr[r1 * 9 + c2];
      if (arr[r2 * 9 + c1] === b && arr[r2 * 9 + c2] === a && a !== b) {
        const out = [...arr];
        for (const i of [r1 * 9 + c1, r1 * 9 + c2, r2 * 9 + c1, r2 * 9 + c2]) out[i] = '.';
        return out.join('');
      }
    }
  }
  return null;
}
const ambiguous = makeAmbiguous(SOLVED);
check('두 해짜리 판을 만들었는가', ambiguous !== null, true);
check('두 해짜리 판의 해는 2', S.countSolutions(ambiguous), 2);
// 논리 기법은 추측하지 않으므로 이런 판을 끝까지 풀 수 없어야 한다.
check('논리만으로는 못 푼다', S.solveLogically(ambiguous).solved, false);

// --- 허용 기법 제한이 실제로 걸리는가 ---

const needsPointing = G.generate('medium', { seed: 2026 });
check('보통 난이도는 허용 기법으로 풀린다',
  S.solveLogically(needsPointing.puzzle, G.LEVELS.medium.allowed).solved, true);

// --- 생성기 ---

// 기법이 건전한지 보는 핵심 불변식: 어떤 기법도 정답의 숫자를 후보에서 지우면 안 된다.
// 하나라도 지우면 그 판은 논리로 풀 수 없게 되거나 엉뚱한 답이 나온다.
function neverDropsSolution(puzzle, solution, allowed) {
  const result = S.solveLogically(puzzle, allowed);
  for (let i = 0; i < S.CELLS; i++) {
    const digit = Number(solution[i]);
    if (result.state.values[i]) {
      if (result.state.values[i] !== digit) return `칸 ${i}: ${result.state.values[i]} != ${digit}`;
    } else if (!(result.state.cands[i] & S.bitOf(digit))) {
      return `칸 ${i}: 정답 후보 ${digit}이 지워짐`;
    }
  }
  return null;
}

for (const [level, count] of [['easy', 20], ['medium', 10], ['hard', 5]]) {
  const config = G.LEVELS[level];
  let notLogical = 0, notUnique = 0, mismatch = 0, unsound = null, belowFloor = 0;

  for (let i = 0; i < count; i++) {
    const made = G.generate(level, { seed: i * 7919 + 31 });

    if (!S.solveLogically(made.puzzle, config.allowed).solved) notLogical++;
    if (S.countSolutions(made.puzzle) !== 1) notUnique++;
    if (made.givens < config.minGivens) belowFloor++;
    for (let k = 0; k < S.CELLS; k++) {
      if (made.puzzle[k] !== '.' && made.puzzle[k] !== made.solution[k]) mismatch++;
    }
    unsound = unsound || neverDropsSolution(made.puzzle, made.solution, config.allowed);
  }

  check(`${level}: 힌트만으로 끝까지 풀린다`, notLogical, 0);
  check(`${level}: 해가 유일하다`, notUnique, 0);
  check(`${level}: 단서가 정답과 일치한다`, mismatch, 0);
  check(`${level}: 단서 하한을 지킨다`, belowFloor, 0);
  check(`${level}: 어떤 기법도 정답 후보를 지우지 않는다`, unsound, null);
}

// 같은 씨앗이면 같은 판이 나와야 재현이 된다.
check('씨앗이 같으면 같은 판',
  G.generate('easy', { seed: 99 }).puzzle, G.generate('easy', { seed: 99 }).puzzle);
check('씨앗이 다르면 다른 판',
  G.generate('easy', { seed: 1 }).puzzle !== G.generate('easy', { seed: 2 }).puzzle, true);

// 완성판 자체가 규칙에 맞는지
const full = G.fullGrid(G.mulberry32(7));
check('완성판은 81칸', full.length, 81);
check('완성판에 빈 칸 없음', full.includes('.'), false);
check('완성판은 규칙에 맞음', S.isComplete(S.fromString(full)), true);

// 난이도가 실제로 갈리는지 (쉬움은 단수만으로 풀려야 한다)
const easy = G.generate('easy', { seed: 555 });
check('쉬움은 단수만으로 풀린다',
  S.solveLogically(easy.puzzle, ['nakedSingle', 'hiddenSingle']).solved, true);
check('쉬움은 단서가 넉넉하다', easy.givens >= G.LEVELS.easy.minGivens, true);

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);
