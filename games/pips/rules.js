'use strict';

// Pips의 규칙 모델. 화면을 만지지 않는다 — node로 규칙만 돌려 보기 위해서다.
//
// 모양이 고르지 않은 판에 주어진 도미노를 빠짐없이 놓는다. 판의 칸 일부는 구역으로 묶이고,
// 구역마다 조건이 있다 — 눈의 합이 몇(`sum`), 몇보다 작음(`lt`), 큼(`gt`), 전부 같음(`eq`),
// 전부 다름(`ne`). 구역에 들지 않은 칸은 아무 눈이나 된다. 도미노 하나가 두 구역에 걸쳐도 된다.
//
// 칸 번호는 판에 있는 칸만 위에서 아래, 왼쪽에서 오른쪽으로 센 것이다(구멍은 번호가 없다).
// 놓은 도미노는 `{ a, b }` — 도미노의 앞 눈이 a 칸에, 뒤 눈이 b 칸에 간다.
(function () {

// 구역 번호를 한 글자로 적는 문자. `.`은 구멍, `#`은 구역에 들지 않은 칸이다.
const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const KINDS = { '<': 'lt', '>': 'gt', '=': 'eq', '!': 'ne' };
const MAX_PIP = 6;

// 판 자료 한 줄: `너비x높이|칸|도미노|구역 조건`.
//   칸은 줄을 이어 한 줄로 적고, 도미노는 눈 두 개씩, 조건은 `,`로 잇는다(숫자만 있으면 합).
//   예) '3x2|00.1#2|0532|5,=,>2' — 구멍 하나, 조건 없는 칸 하나, 구역 셋(합 5, 같음, 2보다 큼)
function parse(code) {
  const [size, grid, pips, specs] = code.split('|');
  const [w, h] = size.split('x').map(Number);
  const index = new Int16Array(w * h).fill(-1);
  const pos = [];
  const regionOf = [];
  for (let g = 0; g < w * h; g++) {
    const ch = grid[g];
    if (ch === '.') continue;
    index[g] = pos.length;
    pos.push(g);
    regionOf.push(ch === '#' ? -1 : ALPHABET.indexOf(ch));
  }
  const regions = (specs ? specs.split(',') : []).map((spec) => (
    KINDS[spec[0]]
      ? { kind: KINDS[spec[0]], target: Number(spec.slice(1)) || 0, cells: [] }
      : { kind: 'sum', target: Number(spec), cells: [] }));
  regionOf.forEach((id, c) => { if (id >= 0) regions[id].cells.push(c); });
  const tiles = [];
  for (let k = 0; k < pips.length; k += 2) tiles.push([Number(pips[k]), Number(pips[k + 1])]);
  const adj = pos.map((g) => {
    const r = Math.floor(g / w);
    const col = g % w;
    const out = [];
    if (r > 0 && index[g - w] >= 0) out.push(index[g - w]);
    if (col > 0 && index[g - 1] >= 0) out.push(index[g - 1]);
    if (col < w - 1 && index[g + 1] >= 0) out.push(index[g + 1]);
    if (r < h - 1 && index[g + w] >= 0) out.push(index[g + w]);
    return out;
  });
  return { w, h, pos, index, regionOf: Int8Array.from(regionOf), regions, tiles, adj };
}

function specOf(region) {
  if (region.kind === 'sum') return String(region.target);
  if (region.kind === 'lt') return `<${region.target}`;
  if (region.kind === 'gt') return `>${region.target}`;
  return region.kind === 'eq' ? '=' : '!';
}

function encode(puzzle) {
  const { w, h, index, regionOf } = puzzle;
  let grid = '';
  for (let g = 0; g < w * h; g++) {
    const c = index[g];
    grid += c < 0 ? '.' : regionOf[c] < 0 ? '#' : ALPHABET[regionOf[c]];
  }
  const pips = puzzle.tiles.map(([x, y]) => `${x}${y}`).join('');
  return `${w}x${h}|${grid}|${pips}|${puzzle.regions.map(specOf).join(',')}`;
}

// 칸마다의 눈. 빈 칸은 -1.
function valuesOf(puzzle, placed) {
  const values = new Int8Array(puzzle.pos.length).fill(-1);
  placed.forEach((p, t) => {
    if (!p) return;
    values[p.a] = puzzle.tiles[t][0];
    values[p.b] = puzzle.tiles[t][1];
  });
  return values;
}

// 구역 하나가 지금 어떤가: 'done'(다 채웠고 맞음), 'wrong', 그 밖에는 null.
// 다 채우기 전에도 이미 어긋난 것이 분명하면 틀렸다고 한다 — 같아야 할 눈이 갈렸거나,
// 합이 벌써 넘친 것. 아직 채울 수 있는 것을 미리 알려 주면 그것이 힌트가 된다.
function regionState(region, values) {
  const got = region.cells.map((c) => values[c]).filter((v) => v >= 0);
  const sum = got.reduce((s, v) => s + v, 0);
  const full = got.length === region.cells.length;
  let broken = false;
  if (region.kind === 'eq') broken = got.some((v) => v !== got[0]);
  else if (region.kind === 'ne') broken = new Set(got).size !== got.length;
  else if (region.kind === 'sum') broken = sum > region.target || (full && sum !== region.target);
  else if (region.kind === 'lt') broken = sum >= region.target;
  else if (region.kind === 'gt') broken = full && sum <= region.target;
  if (broken) return 'wrong';
  return full ? 'done' : null;
}

// 지금 판의 상태. 화면은 이것으로 구역 조건을 칠하고 `solved`로 끝을 가린다.
// 정해 둔 답과 맞추지 않고 규칙으로 가린다 — 규칙에 맞게 다 놓았으면 그것이 답이다.
function inspect(puzzle, placed) {
  const values = valuesOf(puzzle, placed);
  const wrong = [];
  const done = [];
  puzzle.regions.forEach((region, id) => {
    const state = regionState(region, values);
    if (state === 'wrong') wrong.push(id);
    else if (state === 'done') done.push(id);
  });
  const full = placed.every(Boolean);
  return { values, wrong, done, solved: full && wrong.length === 0 };
}

// 도미노를 a·b 칸에 놓을 수 있는가: 두 칸이 이웃이고 비어 있어야 한다.
function fits(puzzle, placed, a, b, skip = -1) {
  if (a < 0 || b < 0 || !puzzle.adj[a].includes(b)) return false;
  return placed.every((p, t) => t === skip || !p || (p.a !== a && p.a !== b && p.b !== a && p.b !== b));
}

const api = { ALPHABET, MAX_PIP, parse, encode, specOf, valuesOf, regionState, inspect, fits };

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.PipsRules = api;

})();
