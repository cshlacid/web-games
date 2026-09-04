'use strict';

// 실행: node games/zip/generator.test.js
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

const boards = [];
for (const size of G.SIZES) {
  for (let i = 0; i < 2; i++) {
    const puzzle = G.generate(size, { seed: 20260904 + i * 97 + size });
    boards.push({ size, puzzle });
  }
}

check('모든 크기에서 판이 나온다', boards.every(({ puzzle }) => puzzle !== null), true);

for (const { size, puzzle } of boards) {
  const tag = `${size}×${size}`;
  check(`${tag} 판의 모양이 성하다`, R.wellFormed(puzzle), true);
  check(`${tag} 정답이 규칙을 지킨다`, R.validate(puzzle, puzzle.solution).done, true);
  check(`${tag} 답이 하나뿐이다`, S.countSolutions(puzzle, { limit: 2 }).count, 1);
  check(`${tag} 1은 정답 경로의 시작에 있다`, puzzle.hints[0], puzzle.solution[0]);
  check(`${tag} 마지막 숫자는 정답 경로의 끝에 있다`,
    puzzle.hints[puzzle.hints.length - 1], puzzle.solution[puzzle.solution.length - 1]);

  const [min, max] = G.WALLS_BY_SIZE[size];
  check(`${tag} 벽 개수가 정해진 범위 안이다`,
    puzzle.walls.length >= min && puzzle.walls.length <= max, true);

  // 벽이 정답 경로 위에 서면 판 자체가 풀리지 않는다. 위의 정답 검증이 이미
  // 걸러 주지만, 벽을 뽑는 자리를 고칠 때 바로 짚이도록 따로 본다.
  const used = new Set();
  for (let i = 1; i < puzzle.solution.length; i++) {
    used.add(R.edgeKey(puzzle.solution[i - 1], puzzle.solution[i]));
  }
  check(`${tag} 벽이 정답 경로를 가로막지 않는다`,
    puzzle.walls.some((edge) => used.has(edge)), false);
}

// --- 숫자 개수 ---
{
  const counts = boards.map(({ puzzle }) => puzzle.hints.length);
  check('숫자는 둘보다 많다', counts.every((c) => c > 2), true);
  check('숫자가 칸의 절반을 넘지 않는다',
    boards.every(({ size, puzzle }) => puzzle.hints.length < size * size / 2), true);
}

// --- 재현성 ---
{
  const a = G.generate(6, { seed: 4242 });
  const b = G.generate(6, { seed: 4242 });
  check('같은 씨앗은 같은 판을 낸다', a, b);
}

// --- 크기 ---
{
  let threw = false;
  try { G.generate(4, { seed: 1 }); } catch { threw = true; }
  check('없는 크기는 거절한다', threw, true);
}

console.log(`\n${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);
