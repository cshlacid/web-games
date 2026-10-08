'use strict';

// 범인 찾기의 규칙 모델. 화면을 만지지 않는다 — node로 규칙만 돌려 보기 위해서다.
//
// 4열 5행에 스무 명이 있고, 저마다 무고하거나 범인이다. 정체가 밝혀진 사람은 단서를 하나씩
// 말하고, 단서는 모두 참이다. 단서로 정체가 정해지는 사람만 밝힐 수 있다.
//
// 사람 번호는 위에서 아래, 왼쪽에서 오른쪽으로 0~19. 정체는 20비트 하나로 들고(1이 범인),
// 단서는 "어떤 무리 안에 범인(또는 무고)이 몇"처럼 비트 무리 위의 셈으로 판정한다.
(function () {

const W = 4;
const H = 5;
const N = W * H;
const FULL = (1 << N) - 1;
const JOBS = 8;

const rowOf = (i) => Math.floor(i / W);
const colOf = (i) => i % W;

function popcount(x) {
  let n = 0;
  for (let m = x; m; m &= m - 1) n++;
  return n;
}

function bits(mask) {
  const out = [];
  for (let i = 0; i < N; i++) if (mask & (1 << i)) out.push(i);
  return out;
}

const maskOf = (cells) => cells.reduce((m, i) => m | (1 << i), 0);
const all = Array.from({ length: N }, (_, i) => i);

// 무리. 글자 하나에 사람·줄·직업 번호가 붙는다.
//   N 이웃(대각선 포함)  R 행  C 열  A 위쪽  B 아래쪽  L 왼쪽  G 오른쪽  J 직업  E 가장자리  K 모서리
function setMask(set, puzzle) {
  const { kind, arg } = set;
  if (kind === 'R') return maskOf(all.filter((i) => rowOf(i) === arg));
  if (kind === 'C') return maskOf(all.filter((i) => colOf(i) === arg));
  if (kind === 'J') return maskOf(all.filter((i) => puzzle.jobs[i] === arg));
  if (kind === 'E') return maskOf(all.filter((i) => rowOf(i) === 0 || rowOf(i) === H - 1 || colOf(i) === 0 || colOf(i) === W - 1));
  if (kind === 'K') return maskOf([0, W - 1, N - W, N - 1]);
  const r = rowOf(arg);
  const c = colOf(arg);
  if (kind === 'N') {
    return maskOf(all.filter((i) => i !== arg && Math.abs(rowOf(i) - r) <= 1 && Math.abs(colOf(i) - c) <= 1));
  }
  if (kind === 'A') return maskOf(all.filter((i) => colOf(i) === c && rowOf(i) < r));
  if (kind === 'B') return maskOf(all.filter((i) => colOf(i) === c && rowOf(i) > r));
  if (kind === 'L') return maskOf(all.filter((i) => rowOf(i) === r && colOf(i) < c));
  return maskOf(all.filter((i) => rowOf(i) === r && colOf(i) > c));
}

// 단서 한 줄. 첫 글자가 갈래다.
//   =무리 쪽 수      그 무리의 범인(c)·무고(i)가 정확히 몇
//   >무리 무리 쪽    앞 무리에 그쪽이 더 많다
//   ~무리 무리 쪽    두 무리에 그쪽이 같은 수
//   %무리 쪽 홀짝    그쪽의 수가 홀수(1)·짝수(0)
//   &무리 쪽         그쪽이 줄 위에서 끊김 없이 이어져 있다(무리는 행이나 열)
//   예) '=N5c2' — 5번의 이웃 중 범인이 정확히 둘
function parseClue(code) {
  let k = 1;
  const readSet = () => {
    const kind = code[k++];
    let digits = '';
    while (k < code.length && code[k] >= '0' && code[k] <= '9') digits += code[k++];
    return { kind, arg: digits ? Number(digits) : 0 };
  };
  const type = code[0];
  const sets = [readSet()];
  if (type === '>' || type === '~') sets.push(readSet());
  const side = code[k++];
  const rest = code.slice(k);
  return { type, sets, side, n: rest ? Number(rest) : 0 };
}

function setCode(set) {
  return set.kind === 'E' || set.kind === 'K' ? set.kind : `${set.kind}${set.arg}`;
}

function encodeClue(clue) {
  const tail = clue.type === '=' || clue.type === '%' ? String(clue.n) : '';
  return `${clue.type}${clue.sets.map(setCode).join('')}${clue.side}${tail}`;
}

// 판 자료 한 줄: `이름|직업|정체|처음 밝힌 사람|단서;단서;...`
//   이름은 이름 목록의 번호를 36진 한 글자씩, 직업은 숫자 한 글자씩, 정체는 0(무고)·1(범인).
function parse(code) {
  const [names, jobs, truth, start, clues] = code.split('|');
  const puzzle = {
    names: Array.from(names, (ch) => parseInt(ch, 36)),
    jobs: Array.from(jobs, Number),
    truth: maskOf(all.filter((i) => truth[i] === '1')),
    start: Number(start),
    clues: clues.split(';').map(parseClue),
  };
  puzzle.clues.forEach((clue) => attach(clue, puzzle));
  return puzzle;
}

function encode(puzzle) {
  return [
    puzzle.names.map((n) => n.toString(36)).join(''),
    puzzle.jobs.join(''),
    all.map((i) => ((puzzle.truth >> i) & 1)).join(''),
    puzzle.start,
    puzzle.clues.map(encodeClue).join(';'),
  ].join('|');
}

// 단서에 무리의 비트와, 판정에 닿는 사람(`scope`)을 붙여 둔다. 판정이 수천 번 돌아 미리 셈한다.
function attach(clue, puzzle) {
  clue.masks = clue.sets.map((set) => setMask(set, puzzle));
  clue.scope = clue.masks.reduce((m, x) => m | x, 0);
  return clue;
}

const sideCount = (mask, side, crim) => popcount(mask & (side === 'c' ? crim : ~crim & FULL));

// 줄(행·열) 위의 그쪽 사람들이 끊김 없이 이어져 있는가. 하나도 없거나 하나면 이어진 것으로 본다.
function connected(mask, side, crim) {
  const on = bits(mask).map((i) => (side === 'c' ? (crim >> i) & 1 : 1 - ((crim >> i) & 1)));
  const first = on.indexOf(1);
  if (first < 0) return true;
  const last = on.lastIndexOf(1);
  return on.slice(first, last + 1).every(Boolean);
}

// 정체 전부(crim)가 주어졌을 때 단서가 참인가.
function holds(clue, crim) {
  const [a, b] = clue.masks;
  if (clue.type === '=') return sideCount(a, clue.side, crim) === clue.n;
  if (clue.type === '>') return sideCount(a, clue.side, crim) > sideCount(b, clue.side, crim);
  if (clue.type === '~') return sideCount(a, clue.side, crim) === sideCount(b, clue.side, crim);
  if (clue.type === '%') return sideCount(a, clue.side, crim) % 2 === clue.n;
  return connected(a, clue.side, crim);
}

// 일부만 정해졌을 때 단서가 아직 성립할 수 있는가. known은 정해진 사람, crim은 그중 범인.
// 셈 단서는 남은 사람을 모두 한쪽으로 몰았을 때의 범위로 가리고, 나머지는 다 정해진 뒤에만 본다.
function possible(clue, known, crim) {
  const open = clue.scope & ~known;
  if (!open) return holds(clue, crim);
  const range = (mask) => {
    const fixed = sideCount(mask & known, clue.side, crim);
    return [fixed, fixed + popcount(mask & open)];
  };
  const [a, b] = clue.masks;
  if (clue.type === '=') {
    const [lo, hi] = range(a);
    return lo <= clue.n && clue.n <= hi;
  }
  if (clue.type === '>' || clue.type === '~') {
    const [alo, ahi] = range(a);
    const [blo, bhi] = range(b);
    // 두 무리가 겹치면 범위만으로는 가를 수 없어 늘 될 수 있는 것으로 본다(겹치는 단서는 굽지 않는다).
    if (clue.type === '>') return ahi > blo;
    return ahi >= blo && bhi >= alo;
  }
  return true;
}

const api = { W, H, N, FULL, JOBS, rowOf, colOf, popcount, bits, maskOf, setMask, parseClue, encodeClue, parse, encode, attach, holds, possible };

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.WhodunitRules = api;

})();
