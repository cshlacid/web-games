'use strict';

// 슬리더링크의 규칙 모델. 화면을 만지지 않는다 — node로 규칙만 돌려 보기 위해서다.
//
// 판은 rows×cols 칸이고 점은 (rows+1)×(cols+1)개다. 사람이 긋는 것은 **변**(점과 점
// 사이)이라 상태도 변마다 둔다: 비어 있음·선·X. X는 "여기는 선이 아니다"라는 메모이고
// 판정에는 쓰이지 않는다.
//
// 변 번호는 가로변을 먼저, 세로변을 그다음에 매긴다.
//   가로변 (r, c): r = 0..rows, c = 0..cols-1 → r * cols + c
//   세로변 (r, c): r = 0..rows-1, c = 0..cols → H + r * (cols + 1) + c
// 점 (r, c)는 r * (cols + 1) + c 다.
(function () {

const EMPTY = 0;
const LINE = 1;
const CROSS = 2;

const cache = new Map();

// 판 크기마다 한 번만 만드는 이웃 표. 풀이기가 변 하나를 볼 때마다 좌표를 다시
// 계산하면 생성(판 하나에 풀이 수백 번)이 눈에 띄게 느려진다.
function geometry(rows, cols) {
  const key = `${rows}x${cols}`;
  if (cache.has(key)) return cache.get(key);

  const H = (rows + 1) * cols;
  const edgeCount = H + rows * (cols + 1);
  const vertexCount = (rows + 1) * (cols + 1);
  const vid = (r, c) => r * (cols + 1) + c;
  const hid = (r, c) => r * cols + c;
  const vtid = (r, c) => H + r * (cols + 1) + c;

  const edgeVerts = [];
  const edgeCells = [];
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c < cols; c++) {
      edgeVerts[hid(r, c)] = [vid(r, c), vid(r, c + 1)];
      edgeCells[hid(r, c)] = [r > 0 ? (r - 1) * cols + c : -1, r < rows ? r * cols + c : -1].filter((x) => x >= 0);
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c <= cols; c++) {
      edgeVerts[vtid(r, c)] = [vid(r, c), vid(r + 1, c)];
      edgeCells[vtid(r, c)] = [c > 0 ? r * cols + c - 1 : -1, c < cols ? r * cols + c : -1].filter((x) => x >= 0);
    }
  }

  // 칸의 네 변: 위·아래·왼쪽·오른쪽.
  const cellEdges = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cellEdges.push([hid(r, c), hid(r + 1, c), vtid(r, c), vtid(r, c + 1)]);
    }
  }

  const vertexEdges = Array.from({ length: vertexCount }, () => []);
  edgeVerts.forEach(([a, b], e) => { vertexEdges[a].push(e); vertexEdges[b].push(e); });

  const geo = { rows, cols, H, edgeCount, vertexCount, cellCount: rows * cols,
    edgeVerts, edgeCells, cellEdges, vertexEdges, vid, hid, vtid };
  cache.set(key, geo);
  return geo;
}

// 판 자료 한 줄: 칸마다 숫자 0~3이나 `.`(숫자 없음).
function parse(rows, cols, code) {
  const clues = new Int8Array(rows * cols);
  for (let i = 0; i < rows * cols; i++) clues[i] = code[i] === '.' ? -1 : Number(code[i]);
  return { rows, cols, clues };
}

function encode(clues) {
  return Array.from(clues, (k) => (k < 0 ? '.' : String(k))).join('');
}

// 칸 집합의 둘레. 생성기는 칸을 키워 고리를 만들고, 그 둘레가 곧 정답 선이다.
function outline(geo, inside) {
  const edges = new Uint8Array(geo.edgeCount);
  for (let e = 0; e < geo.edgeCount; e++) {
    const cells = geo.edgeCells[e];
    const a = cells.length > 0 && inside[cells[0]] ? 1 : 0;
    const b = cells.length > 1 && inside[cells[1]] ? 1 : 0;
    // 판 가장자리의 변은 칸이 하나뿐이다. 바깥은 늘 안이 아니다.
    edges[e] = (cells.length === 1 ? a : a ^ b) ? LINE : EMPTY;
  }
  return edges;
}

function countLines(geo, edges, list) {
  let n = 0;
  for (const e of list) if (edges[e] === LINE) n++;
  return n;
}

// 칸마다 둘레의 선 수. 숫자 칸을 채울 때 쓴다.
function clueCounts(geo, edges) {
  return geo.cellEdges.map((list) => countLines(geo, edges, list));
}

// 지금 판의 상태. 화면은 이것으로 숫자와 점을 칠하고, `solved`로 끝을 가린다.
//
// **답이 하나뿐인 판이므로 규칙에 맞는 고리가 곧 정답이다.** 정답과 맞춰 보지 않고
// 규칙만 본다 — 그래야 정답을 몰라도 판정이 돈다.
function inspect(puzzle, edges) {
  const geo = geometry(puzzle.rows, puzzle.cols);
  const over = [];
  const done = [];
  let cluesOk = true;
  for (let cell = 0; cell < geo.cellCount; cell++) {
    const k = puzzle.clues[cell];
    if (k < 0) continue;
    const n = countLines(geo, edges, geo.cellEdges[cell]);
    if (n > k) over.push(cell);
    if (n === k) done.push(cell);
    else cluesOk = false;
  }

  // 점에 선이 셋 넘게 닿으면 갈림길이다. 하나만 닿은 점은 아직 긋는 중일 수 있어
  // 잘못으로 치지 않는다.
  const branch = [];
  let degreesOk = true;
  let lineCount = 0;
  for (let v = 0; v < geo.vertexCount; v++) {
    const d = countLines(geo, edges, geo.vertexEdges[v]);
    if (d > 2) branch.push(v);
    if (d !== 0 && d !== 2) degreesOk = false;
  }
  for (let e = 0; e < geo.edgeCount; e++) if (edges[e] === LINE) lineCount++;

  let loops = 0;
  if (degreesOk && lineCount) loops = components(geo, edges);
  const solved = cluesOk && degreesOk && lineCount > 0 && loops === 1;
  return { over, done, branch, solved };
}

// 선으로 이어진 덩어리의 수.
function components(geo, edges) {
  const seen = new Uint8Array(geo.vertexCount);
  let count = 0;
  for (let e = 0; e < geo.edgeCount; e++) {
    if (edges[e] !== LINE) continue;
    const start = geo.edgeVerts[e][0];
    if (seen[start]) continue;
    count++;
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const v = stack.pop();
      for (const f of geo.vertexEdges[v]) {
        if (edges[f] !== LINE) continue;
        for (const w of geo.edgeVerts[f]) {
          if (!seen[w]) { seen[w] = 1; stack.push(w); }
        }
      }
    }
  }
  return count;
}

const api = { EMPTY, LINE, CROSS, geometry, parse, encode, outline, clueCounts, inspect, components };

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.SlitherRules = api;

})();
