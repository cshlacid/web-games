'use strict';

// 브라우저에서는 클래식 스크립트가 전역 렉시컬 스코프를 공유한다. 파일마다
// 최상위에 같은 이름을 선언하면 다른 파일과 충돌해 페이지 전체가 죽는다
// (solver.js와 generator.js가 둘 다 const R을 두고 있었다). IIFE로 가둔다.
(function () {

// Doppelblock(= Smashed Sums)의 규칙 모델과 완전 탐색 솔버.
//
// 규칙: N×N 격자에서 모든 행과 열에 검은 칸이 정확히 두 개씩 들어가고, 나머지
// 칸은 1..N-2를 행마다 열마다 한 번씩 채운다. 격자 밖 단서는 그 줄에서 검은 칸
// 두 개 "사이"에 있는 숫자들의 합이다.
//
// 여기서는 추측해도 된다 — 사람이 푸는 과정이 아니라 정답과 해의 개수를 알아내는
// 검증용이다. 사람이 쓰는 논리 추론은 별도 파일에서 다룬다.

const UNKNOWN = -1;
const BLOCK = 0;

const digitCount = (n) => n - 2;
// 한 줄의 숫자 합은 항상 고정이다. 단서의 상한이자, 단서가 이 값이면 검은 칸이
// 양 끝이라는 뜻이 되는 중요한 상수.
const lineTotal = (n) => (digitCount(n) * (digitCount(n) + 1)) / 2;

/** 완성된 한 줄에서 단서 값을 읽는다. 검은 칸이 둘이 아니면 규칙 위반. */
function clueOf(line) {
  const blocks = [];
  for (let i = 0; i < line.length; i++) if (line[i] === BLOCK) blocks.push(i);
  if (blocks.length !== 2) return null;
  let sum = 0;
  for (let i = blocks[0] + 1; i < blocks[1]; i++) sum += line[i];
  return sum;
}

const rowOf = (grid, n, r) => Array.from({ length: n }, (_, c) => grid[r * n + c]);
const colOf = (grid, n, c) => Array.from({ length: n }, (_, r) => grid[r * n + c]);

// 한 줄에 들어갈 수 있는 모든 배치를 단서별로 미리 만들어 둔다. 줄마다 다시
// 세울 필요가 없고, 탐색은 이 목록을 훑기만 하면 된다.
const arrangementCache = new Map();

function arrangementsBySize(n) {
  if (arrangementCache.has(n)) return arrangementCache.get(n);

  const digits = digitCount(n);
  const byClue = new Map();
  const all = [];

  const permute = (rest, acc, emit) => {
    if (rest.length === 0) { emit(acc); return; }
    for (let i = 0; i < rest.length; i++) {
      acc.push(rest[i]);
      permute(rest.slice(0, i).concat(rest.slice(i + 1)), acc, emit);
      acc.pop();
    }
  };

  const pool = Array.from({ length: digits }, (_, i) => i + 1);
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      const slots = [];
      for (let i = 0; i < n; i++) if (i !== a && i !== b) slots.push(i);
      permute(pool, [], (order) => {
        const line = new Int8Array(n);
        line[a] = BLOCK;
        line[b] = BLOCK;
        slots.forEach((slot, i) => { line[slot] = order[i]; });
        const clue = clueOf(line);
        if (!byClue.has(clue)) byClue.set(clue, []);
        byClue.get(clue).push(line);
        all.push(line);
      });
    }
  }

  const result = { byClue, all };
  arrangementCache.set(n, result);
  return result;
}

const arrangementsForClue = (n, clue) => arrangementsBySize(n).byClue.get(clue) || [];

/**
 * 행 단위로 훑으며 푼다. 열 쪽 제약은 행을 놓는 즉시 본다.
 *
 * 가지치기 두 가지가 속도를 좌우한다. 열의 첫 검은 칸이 놓인 뒤로 쌓이는 숫자
 * 합이 그 열의 단서를 넘으면 더 볼 것도 없고, 두 번째 검은 칸이 놓이는 순간
 * 그 열의 합은 확정되므로 바로 맞춰 본다. 끝까지 가서야 걸러내면 7×7부터
 * 탐색이 감당이 안 된다.
 */
function solve(n, rowClues, colClues, limit = 2) {
  const grid = new Int8Array(n * n).fill(UNKNOWN);
  const colBlocks = new Int8Array(n);
  const colMask = new Int32Array(n);   // 열에 이미 쓰인 숫자(비트)
  const colSum = new Int32Array(n);    // 첫 검은 칸 이후로 쌓인 합
  const digits = digitCount(n);
  const fullMask = (1 << digits) - 1;
  const solutions = [];

  const place = (r) => {
    if (solutions.length >= limit) return;
    if (r === n) {
      for (let c = 0; c < n; c++) {
        if (colBlocks[c] !== 2 || colMask[c] !== fullMask) return;
      }
      solutions.push(grid.slice());
      return;
    }

    const remaining = n - r - 1;
    for (const line of arrangementsForClue(n, rowClues[r])) {
      let ok = true;
      for (let c = 0; c < n && ok; c++) {
        const v = line[c];
        if (v === BLOCK) {
          if (colBlocks[c] >= 2) ok = false;
        } else {
          if (colMask[c] & (1 << (v - 1))) ok = false;
          // 남은 행보다 채워야 할 검은 칸이 많으면 이 가지는 끝이다.
          else if (2 - colBlocks[c] > remaining) ok = false;
          // 첫 검은 칸 뒤에 쌓인 합이 단서를 넘으면 되돌릴 방법이 없다.
          else if (colBlocks[c] === 1 && colSum[c] + v > colClues[c]) ok = false;
        }
      }
      if (!ok) continue;

      const savedSum = [];
      for (let c = 0; c < n; c++) {
        const v = line[c];
        grid[r * n + c] = v;
        savedSum.push(colSum[c]);
        if (v === BLOCK) colBlocks[c]++;
        else {
          colMask[c] |= 1 << (v - 1);
          if (colBlocks[c] === 1) colSum[c] += v;
        }
      }

      // 두 번째 검은 칸이 놓인 열은 이 시점에 합이 확정된다.
      let settled = true;
      for (let c = 0; c < n && settled; c++) {
        if (line[c] === BLOCK && colBlocks[c] === 2 && colSum[c] !== colClues[c]) settled = false;
      }
      if (settled) place(r + 1);

      for (let c = 0; c < n; c++) {
        const v = line[c];
        grid[r * n + c] = UNKNOWN;
        colSum[c] = savedSum[c];
        if (v === BLOCK) colBlocks[c]--;
        else colMask[c] &= ~(1 << (v - 1));
      }
      if (solutions.length >= limit) return;
    }
  };

  place(0);
  return solutions;
}

const countSolutions = (n, rowClues, colClues, limit = 2) =>
  solve(n, rowClues, colClues, limit).length;

/** 완성된 격자가 규칙과 단서를 모두 지키는지. 어긋난 이유를 문자열로 돌려준다. */
function validate(n, grid, rowClues, colClues) {
  const digits = digitCount(n);
  for (let i = 0; i < n; i++) {
    for (const [kind, line, clue] of [
      ['행', rowOf(grid, n, i), rowClues[i]],
      ['열', colOf(grid, n, i), colClues[i]],
    ]) {
      const blocks = line.filter((v) => v === BLOCK).length;
      if (blocks !== 2) return `${i}번 ${kind}: 검은 칸이 ${blocks}개`;
      const seen = new Set(line.filter((v) => v !== BLOCK));
      if (seen.size !== digits) return `${i}번 ${kind}: 숫자가 중복되거나 빠짐`;
      for (const v of seen) if (v < 1 || v > digits) return `${i}번 ${kind}: 범위 밖 숫자 ${v}`;
      if (clueOf(line) !== clue) return `${i}번 ${kind}: 단서 ${clue}와 합 ${clueOf(line)}이 다름`;
    }
  }
  return null;
}

/** 완성된 격자에서 단서를 읽어낸다. 생성기가 정답을 먼저 만들고 쓰는 경로. */
function cluesOf(n, grid) {
  const rowClues = [];
  const colClues = [];
  for (let i = 0; i < n; i++) {
    rowClues.push(clueOf(rowOf(grid, n, i)));
    colClues.push(clueOf(colOf(grid, n, i)));
  }
  return { rowClues, colClues };
}

function shuffle(items, rng) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** 단서 없이 규칙만 지키는 완성판 하나. 생성기의 출발점이다. */
function randomSolution(n, rng = Math.random) {
  const grid = new Int8Array(n * n).fill(UNKNOWN);
  const colBlocks = new Int8Array(n);
  const colDigits = Array.from({ length: n }, () => new Set());
  const pool = arrangementsBySize(n).all;

  const place = (r) => {
    if (r === n) return colBlocks.every((v) => v === 2);

    const remainingRows = n - r;
    for (const line of shuffle(pool, rng)) {
      let ok = true;
      for (let c = 0; c < n && ok; c++) {
        const v = line[c];
        if (v === BLOCK) { if (colBlocks[c] >= 2) ok = false; }
        else if (colDigits[c].has(v)) ok = false;
        else if (2 - colBlocks[c] > remainingRows - 1) ok = false;
      }
      if (!ok) continue;

      for (let c = 0; c < n; c++) {
        const v = line[c];
        grid[r * n + c] = v;
        if (v === BLOCK) colBlocks[c]++;
        else colDigits[c].add(v);
      }
      if (place(r + 1)) return true;
      for (let c = 0; c < n; c++) {
        const v = line[c];
        grid[r * n + c] = UNKNOWN;
        if (v === BLOCK) colBlocks[c]--;
        else colDigits[c].delete(v);
      }
    }
    return false;
  };

  if (!place(0)) throw new Error(`${n}×${n} 완성판 생성 실패`);
  return grid;
}

const Rules = {
  UNKNOWN, BLOCK,
  digitCount, lineTotal, clueOf, cluesOf, rowOf, colOf,
  arrangementsBySize, arrangementsForClue,
  solve, countSolutions, validate, randomSolution, shuffle,
};

if (typeof module !== 'undefined' && module.exports) module.exports = Rules;
if (typeof window !== 'undefined') window.DoppelRules = Rules;

})();
