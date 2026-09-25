'use strict';

// KenKen의 규칙 모델. 화면을 만지지 않는다 — node로 규칙만 돌려 보기 위해서다.
//
// n×n 판의 행과 열마다 1~n이 한 번씩 들어간다. 판은 케이지로 나뉘고, 케이지마다 연산과
// 목표 수가 있다 — 케이지의 숫자를 그 연산으로 셈하면 목표 수가 나와야 한다. 뺄셈과
// 나눗셈 케이지는 두 칸이고 순서는 상관없다(큰 수에서 작은 수를). 케이지 안에서 숫자가
// 겹쳐도 되지만, 같은 행·열이면 행·열 규칙에 걸린다.
// 칸 번호는 r * n + c 다.
(function () {

// 케이지 번호를 한 글자로 적는 문자. 8×8에도 케이지가 예순넷을 넘을 수 없다.
const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_';

// 연산. `=`은 한 칸짜리 케이지(숫자가 그대로 주어진다).
const OPS = ['+', '-', '*', '/', '='];

function holds(op, target, values) {
  if (op === '=') return values[0] === target;
  if (op === '+') return values.reduce((s, v) => s + v, 0) === target;
  if (op === '*') return values.reduce((s, v) => s * v, 1) === target;
  const [a, b] = values;
  if (op === '-') return Math.abs(a - b) === target;
  return Math.max(a, b) === target * Math.min(a, b);
}

// 판 자료 한 줄: 칸마다 케이지 번호 글자, `|`, 케이지마다 연산과 목표 수를 `,`로 이은 것.
//   예) '0012...|+5,-1,*24,...'
function parse(size, code) {
  const [ids, specs] = code.split('|');
  const cageOf = Int32Array.from(ids, (ch) => ALPHABET.indexOf(ch));
  const cages = specs.split(',').map((spec) => ({ op: spec[0], target: Number(spec.slice(1)), cells: [] }));
  cageOf.forEach((id, i) => cages[id].cells.push(i));
  return { size, cageOf, cages };
}

function encode(puzzle) {
  const ids = Array.from(puzzle.cageOf, (id) => ALPHABET[id]).join('');
  return `${ids}|${puzzle.cages.map((cage) => cage.op + cage.target).join(',')}`;
}

// 지금 판의 상태. 화면은 이것으로 겹친 숫자와 틀린 케이지를 칠하고 `solved`로 끝을 가린다.
//
// **답이 하나뿐인 판이라 규칙에 맞으면 곧 정답이다.**
function inspect(puzzle, values) {
  const n = puzzle.size;
  const dup = new Set();
  for (let k = 0; k < n; k++) {
    for (const line of [
      Array.from({ length: n }, (_, c) => k * n + c),
      Array.from({ length: n }, (_, r) => r * n + k),
    ]) {
      const seen = new Map();
      for (const i of line) {
        const v = values[i];
        if (!v) continue;
        if (seen.has(v)) { dup.add(i); dup.add(seen.get(v)); } else seen.set(v, i);
      }
    }
  }
  const wrong = [];
  const done = [];
  puzzle.cages.forEach((cage, id) => {
    const got = cage.cells.map((i) => values[i]);
    if (got.some((v) => !v)) return;
    (holds(cage.op, cage.target, got) ? done : wrong).push(id);
  });
  const full = values.every((v) => v > 0);
  const solved = full && dup.size === 0 && wrong.length === 0;
  return { dup: [...dup].sort((a, b) => a - b), wrong, done, solved };
}

// 케이지에 들어갈 수 있는 숫자 조합. 케이지의 셈과 모양(같은 행·열의 두 칸은 같은 숫자일
// 수 없다)만 본다 — 다른 칸의 숫자로 거르면 조합표가 힌트가 된다. 케이지 안에 이미 넣은
// 숫자와 맞게 놓을 수 없는 조합은 `live: false`다.
// 결과: [{ digits: [작은 수부터], live }]
function combos(puzzle, id, values) {
  const n = puzzle.size;
  const { op, target, cells } = puzzle.cages[id];
  const found = new Map();
  const pick = [];
  (function rec(x) {
    if (x === cells.length) {
      if (!holds(op, target, pick)) return;
      const key = pick.slice().sort((a, b) => a - b).join('');
      const live = cells.every((i, y) => !values[i] || values[i] === pick[y]);
      found.set(key, found.get(key) || live);
      return;
    }
    for (let d = 1; d <= n; d++) {
      const clash = cells.slice(0, x).some((j, y) => pick[y] === d
        && (Math.floor(j / n) === Math.floor(cells[x] / n) || j % n === cells[x] % n));
      if (clash) continue;
      pick.push(d);
      rec(x + 1);
      pick.pop();
    }
  })(0);
  return [...found.keys()].sort().map((key) => ({ digits: [...key].map(Number), live: found.get(key) }));
}

const api = { ALPHABET, OPS, holds, parse, encode, inspect, combos };

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.KenKenRules = api;

})();
