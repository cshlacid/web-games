'use strict';

// 누리카베의 규칙 모델. 화면을 만지지 않는다 — node로 규칙만 돌려 보기 위해서다.
//
// 판은 rows×cols 칸이고 몇 칸에 숫자가 있다. 칸마다 바다(검정)나 섬(흰색)이 되고,
//   - 섬 하나에는 숫자가 정확히 하나 있고, 섬의 칸 수가 그 숫자다.
//   - 바다는 모두 이어져 있다.
//   - 바다가 2×2로 뭉친 자리는 없다.
// 칸 번호는 r * cols + c 다.
(function () {

// 사람이 찍는 표시. 점은 "여기는 섬"이라는 메모라 판정에는 쓰이지 않는다 — 바다가
// 아닌 칸은 모두 섬으로 본다.
const EMPTY = 0;
const SEA = 1;
const DOT = 2;

const cache = new Map();

function neighborsTable(rows, cols) {
  const key = `${rows}x${cols}`;
  if (cache.has(key)) return cache.get(key);
  const table = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const near = [];
      if (r > 0) near.push((r - 1) * cols + c);
      if (r < rows - 1) near.push((r + 1) * cols + c);
      if (c > 0) near.push(r * cols + c - 1);
      if (c < cols - 1) near.push(r * cols + c + 1);
      table.push(near);
    }
  }
  cache.set(key, table);
  return table;
}

// 2×2 묶음의 왼쪽 위 칸들. 판정과 풀이가 둘 다 이 묶음을 훑는다.
function squares(rows, cols) {
  const out = [];
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c;
      out.push([a, a + 1, a + cols, a + cols + 1]);
    }
  }
  return out;
}

// 판 자료 한 줄: 칸마다 숫자 1~9나 `.`(숫자 없음).
function parse(rows, cols, code) {
  const clues = new Int8Array(rows * cols);
  for (let i = 0; i < rows * cols; i++) clues[i] = code[i] === '.' ? 0 : Number(code[i]);
  return { rows, cols, clues };
}

function encode(clues) {
  return Array.from(clues, (k) => (k ? String(k) : '.')).join('');
}

// 조건에 맞는 칸끼리 이어진 덩어리들.
function groups(puzzle, keep) {
  const n = puzzle.rows * puzzle.cols;
  const near = neighborsTable(puzzle.rows, puzzle.cols);
  const id = new Int32Array(n).fill(-1);
  const list = [];
  for (let start = 0; start < n; start++) {
    if (id[start] >= 0 || !keep(start)) continue;
    const cells = [start];
    id[start] = list.length;
    for (let i = 0; i < cells.length; i++) {
      for (const other of near[cells[i]]) {
        if (id[other] < 0 && keep(other)) { id[other] = list.length; cells.push(other); }
      }
    }
    list.push(cells);
  }
  return { id, list };
}

// 지금 판의 상태. 화면은 이것으로 잘못된 자리를 칠하고 `solved`로 끝을 가린다.
//
// **답이 하나뿐인 판이라 규칙에 맞으면 곧 정답이다.** 바다가 아닌 칸을 모두 섬으로 보고
// 규칙만 본다. 그래서 점을 하나도 찍지 않고 바다만 칠해도 끝난다.
function inspect(puzzle, marks) {
  const { rows, cols, clues } = puzzle;
  const isSea = (i) => marks[i] === SEA && !clues[i];

  const pools = new Set();
  for (const sq of squares(rows, cols)) {
    if (sq.every(isSea)) for (const i of sq) pools.add(i);
  }

  // 섬(바다가 아닌 칸의 덩어리)의 숫자를 칠한다.
  //   - 숫자 하나에 칸 수가 맞으면 다 된 섬이다.
  //   - 숫자 하나인데 칸 수가 모자라면 바다가 너무 조였다 — 틀렸다.
  //   - 칸 수가 넘치거나 숫자가 여럿인 덩어리는 아직 칠하는 중일 수 있어 말하지 않는다.
  //     처음 판은 판 전체가 숫자 여럿을 품은 덩어리 하나다. 다만 빈칸 없이 점만으로 채운
  //     덩어리에 숫자가 여럿이면 더 나눌 수 없으니 틀렸다.
  const land = groups(puzzle, (i) => !isSea(i));
  const done = [];
  const wrong = [];
  let landOk = true;
  for (const cells of land.list) {
    const numbered = cells.filter((i) => clues[i]);
    if (numbered.length !== 1 || clues[numbered[0]] !== cells.length) landOk = false;
    if (numbered.length === 1) {
      if (clues[numbered[0]] === cells.length) done.push(numbered[0]);
      else if (clues[numbered[0]] > cells.length) wrong.push(numbered[0]);
    } else if (numbered.length > 1 && cells.every((i) => clues[i] || marks[i] === DOT)) {
      wrong.push(...numbered);
    }
  }
  done.sort((a, b) => a - b);
  wrong.sort((a, b) => a - b);

  const sea = groups(puzzle, isSea);
  const solved = landOk && pools.size === 0 && sea.list.length === 1;
  return { pools: [...pools].sort((a, b) => a - b), done, wrong, solved };
}

const api = { EMPTY, SEA, DOT, neighborsTable, squares, parse, encode, groups, inspect };

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.NurikabeRules = api;

})();
