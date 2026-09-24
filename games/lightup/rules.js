'use strict';

// Light Up의 규칙 모델. 화면을 만지지 않는다 — node로 규칙만 돌려 보기 위해서다.
//
// 판은 rows×cols 칸이고 칸은 흰 칸이거나 벽이다. 벽에는 숫자(0~4)가 있을 수 있다.
//   - 흰 칸에 전구를 놓는다. 전구는 상하좌우로 벽이나 판 끝까지 빛을 뻗는다.
//   - 모든 흰 칸이 빛을 받아야 한다.
//   - 전구끼리 서로 비추면 안 된다.
//   - 벽의 숫자는 그 벽에 맞닿은 전구 수다.
// 칸 번호는 r * cols + c 다.
(function () {

// 사람이 흰 칸에 찍는 표시. X는 "여기는 전구가 아니다"라는 메모라 판정에 쓰이지 않는다.
const EMPTY = 0;
const BULB = 1;
const CROSS = 2;

// 판 자료의 벽. 숫자 없는 벽은 -1, 흰 칸은 -2다.
const WALL = -1;
const OPEN = -2;

const cache = new Map();

// 칸마다 이웃(상하좌우)과, 흰 칸이면 거기서 보이는 흰 칸들. 빛이 닿는 칸과 서로 비추는
// 칸이 같으니 한 번 만들어 둔다.
function geometry(puzzle) {
  const { rows, cols, cells } = puzzle;
  const key = `${rows}x${cols}:${Array.from(cells, (v) => (v === OPEN ? '.' : '#')).join('')}`;
  if (cache.has(key)) return cache.get(key);
  const n = rows * cols;
  const near = [];
  const sight = [];
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const around = [];
    if (r > 0) around.push(i - cols);
    if (r < rows - 1) around.push(i + cols);
    if (c > 0) around.push(i - 1);
    if (c < cols - 1) around.push(i + 1);
    near.push(around);
    const seen = [];
    if (cells[i] === OPEN) {
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        for (let rr = r + dr, cc = c + dc; rr >= 0 && cc >= 0 && rr < rows && cc < cols; rr += dr, cc += dc) {
          const j = rr * cols + cc;
          if (cells[j] !== OPEN) break;
          seen.push(j);
        }
      }
    }
    sight.push(seen);
  }
  const geo = { n, near, sight };
  if (cache.size > 64) cache.clear();
  cache.set(key, geo);
  return geo;
}

// 판 자료 한 줄: `.` 흰 칸, `#` 숫자 없는 벽, `0`~`4` 숫자 벽.
function parse(rows, cols, code) {
  const cells = new Int8Array(rows * cols);
  for (let i = 0; i < rows * cols; i++) {
    const ch = code[i];
    cells[i] = ch === '.' ? OPEN : ch === '#' ? WALL : Number(ch);
  }
  return { rows, cols, cells };
}

function encode(cells) {
  return Array.from(cells, (v) => (v === OPEN ? '.' : v === WALL ? '#' : String(v))).join('');
}

// 지금 판의 상태. 화면은 이것으로 빛과 잘못된 자리를 칠하고 `solved`로 끝을 가린다.
//
// **답이 하나뿐인 판이라 규칙에 맞으면 곧 정답이다.** X는 보지 않는다.
function inspect(puzzle, marks) {
  const { cells } = puzzle;
  const geo = geometry(puzzle);
  const lit = new Uint8Array(geo.n);
  const clash = new Set();
  for (let i = 0; i < geo.n; i++) {
    if (cells[i] !== OPEN || marks[i] !== BULB) continue;
    lit[i] = 1;
    for (const j of geo.sight[i]) {
      lit[j] = 1;
      if (marks[j] === BULB) { clash.add(i); clash.add(j); }
    }
  }

  const over = [];
  const done = [];
  let numbersOk = true;
  for (let i = 0; i < geo.n; i++) {
    if (cells[i] < 0) continue;
    const bulbs = geo.near[i].filter((j) => cells[j] === OPEN && marks[j] === BULB).length;
    if (bulbs > cells[i]) over.push(i);
    if (bulbs === cells[i]) done.push(i);
    else numbersOk = false;
  }

  let allLit = true;
  for (let i = 0; i < geo.n; i++) if (cells[i] === OPEN && !lit[i]) allLit = false;
  const solved = allLit && numbersOk && clash.size === 0;
  return { lit, clash: [...clash].sort((a, b) => a - b), over, done, solved };
}

const api = { EMPTY, BULB, CROSS, WALL, OPEN, geometry, parse, encode, inspect };

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.LightUpRules = api;

})();
