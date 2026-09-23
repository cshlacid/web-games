'use strict';

// 소코반 규칙. 판을 읽고, 한 걸음을 옮기고, 끝났는지 본다. DOM을 만지지 않는다.
//
// 칸은 `y * w + x` 숫자 하나로 적는다. 상자는 배열의 자리가 곧 그 상자의 번호라서
// 상자를 밀어도 순서를 바꾸지 않는다 — 화면이 상자 요소를 번호로 잡아 두고 자리만
// 옮기기 때문이다.
(function () {

const DIRS = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};

// 이보다 넓고 높이보다 너비가 큰 판은 세워서 보여 준다(`upright`).
const WIDE = 12;

function rows(text) {
  const lines = text.split('|');
  const w = Math.max(...lines.map((line) => line.length));
  return lines.map((line) => line.padEnd(w, ' '));
}

// 시계 방향으로 한 번 돌린다. 돌려도 같은 판이다 — 벽·상자·목표의 관계가 그대로라
// 풀리는 판은 돌려도 풀린다.
function rotate(text) {
  const grid = rows(text);
  const h = grid.length;
  const w = grid[0].length;
  const out = [];
  for (let x = 0; x < w; x++) {
    let line = '';
    for (let y = h - 1; y >= 0; y--) line += grid[y][x];
    out.push(line.replace(/\s+$/, ''));
  }
  return out.join('|');
}

// 폰은 세로로 길다. 가로로 긴 판을 그대로 두면 칸이 손톱만 해지므로 세워 둔다
// (Microban 마지막 판은 31×18이라 눕혀 두면 칸이 11px이다).
function upright(text) {
  const grid = rows(text);
  return grid[0].length > WIDE && grid[0].length > grid.length ? rotate(text) : text;
}

function parse(text) {
  const grid = rows(text);
  const h = grid.length;
  const w = grid[0].length;
  const walls = new Uint8Array(w * h);
  const goals = new Uint8Array(w * h);
  const boxes = [];
  let player = -1;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const at = y * w + x;
      const ch = grid[y][x];
      if (ch === '#') walls[at] = 1;
      if (ch === '.' || ch === '*' || ch === '+') goals[at] = 1;
      if (ch === '$' || ch === '*') boxes.push(at);
      if (ch === '@' || ch === '+') player = at;
    }
  }

  // 안쪽 바닥. 사람이 선 자리에서 벽에 막힐 때까지 번진 곳이다 — 벽 바깥의 빈칸은
  // 판이 아니므로 그리지 않는다. 상자는 밀 수 있으니 막는 것으로 치지 않는다.
  const floor = new Uint8Array(w * h);
  const queue = [player];
  floor[player] = 1;
  while (queue.length) {
    const at = queue.pop();
    for (const key in DIRS) {
      const next = neighbor(w, h, at, DIRS[key]);
      if (next < 0 || walls[next] || floor[next]) continue;
      floor[next] = 1;
      queue.push(next);
    }
  }

  return { w, h, walls, goals, floor, start: { player, boxes } };
}

function neighbor(w, h, at, dir) {
  const x = (at % w) + dir[0];
  const y = Math.floor(at / w) + dir[1];
  if (x < 0 || y < 0 || x >= w || y >= h) return -1;
  return y * w + x;
}

function copy(state) {
  return { player: state.player, boxes: state.boxes.slice() };
}

// 한 걸음. 막히면 null, 가면 새 상태와 민 상자의 번호(안 밀었으면 -1)를 돌려준다.
function step(level, state, dirName) {
  const dir = DIRS[dirName];
  const next = neighbor(level.w, level.h, state.player, dir);
  if (next < 0 || level.walls[next]) return null;
  const box = state.boxes.indexOf(next);
  if (box < 0) {
    const out = copy(state);
    out.player = next;
    return { state: out, box: -1 };
  }
  // 상자는 하나만 민다. 너머가 벽이거나 다른 상자면 못 간다.
  const beyond = neighbor(level.w, level.h, next, dir);
  if (beyond < 0 || level.walls[beyond] || state.boxes.includes(beyond)) return null;
  const out = copy(state);
  out.player = next;
  out.boxes[box] = beyond;
  return { state: out, box };
}

function isDone(level, state) {
  return state.boxes.every((at) => level.goals[at]);
}

// 상자를 건드리지 않고 target까지 걷는 가장 짧은 길. 방향 이름의 배열이고, 갈 수
// 없으면 null이다. 누른 칸까지 알아서 걸어가게 하는 데 쓴다.
function path(level, state, target) {
  if (target === state.player) return [];
  if (target < 0 || level.walls[target] || state.boxes.includes(target)) return null;
  const from = new Int32Array(level.w * level.h).fill(-1);
  const how = new Array(level.w * level.h);
  from[state.player] = state.player;
  const queue = [state.player];
  for (let head = 0; head < queue.length; head++) {
    const at = queue[head];
    for (const key in DIRS) {
      const next = neighbor(level.w, level.h, at, DIRS[key]);
      if (next < 0 || from[next] >= 0 || level.walls[next] || state.boxes.includes(next)) continue;
      from[next] = at;
      how[next] = key;
      if (next === target) {
        const out = [];
        for (let back = target; back !== state.player; back = from[back]) out.push(how[back]);
        return out.reverse();
      }
      queue.push(next);
    }
  }
  return null;
}

// 두 칸이 한 줄로 붙어 있으면 그 방향. 누른 칸이 사람 바로 옆이면 걷거나 미는 한
// 걸음으로 읽는다.
function dirBetween(level, from, to) {
  for (const key in DIRS) {
    if (neighbor(level.w, level.h, from, DIRS[key]) === to) return key;
  }
  return null;
}

const api = { DIRS, WIDE, rows, rotate, upright, parse, step, isDone, path, dirBetween };

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.SokobanRules = api;

})();
