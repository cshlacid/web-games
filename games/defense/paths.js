'use strict';

// 적이 어디로 가는가. 이 게임의 중심이 여기 있다.
//
// **비용의 단위를 초로 통일한다.** 빈 칸에 들어가는 값은 한 칸을 걷는 시간이고,
// 지키는 이가 선 칸에 들어가는 값은 거기에 그를 부수는 시간을 더한 것이다. 둘을
// 같은 자로 재면 "돌아갈까 뚫을까"를 따로 짤 필요가 없다 — 길이 열려 있으면
// 돌아가는 쪽이 싸고, 완전히 막으면 뚫는 쪽이 유일한 길이라 한 번의 최단 경로에서
// 저절로 갈린다. "가장 약한 놈부터 부순다"도 덤으로 따라온다. 체력이 낮은 칸이
// 곧 싼 칸이기 때문이다.
//
// 그래서 이 게임에는 "완전 봉쇄 금지" 규칙이 없다. 미로형이 늘 달고 다니는
// 예외 처리가 통째로 빠진 자리다.
(function () {

const node = typeof module !== 'undefined' && module.exports;
const M = node ? require('./mapgen.js') : window.DefenseMap;
const DIRS = M.DIRS;

// 칸 번호는 판의 폭으로 직접 센다. 생성기의 idx는 규격 판(8칸)에 묶여 있어
// 테스트가 손으로 만든 작은 판에서는 맞지 않는다.
const at = (map, x, y) => y * map.w + x;

// 출구에서 거꾸로 한 번 풀어 모든 칸의 남은 시간을 적어 둔다. 적마다 길을 찾으면
// 마릿수만큼 무거워지는데, 이렇게 두면 적은 이웃 넷을 비교하기만 하면 되어
// 계산이 적 수와 무관해진다. 다시 푸는 것은 배치가 바뀔 때뿐이다.
//
// units: 칸 번호마다 null 또는 { hp } — 규칙 쪽이 만들어 넘긴다.
// profile: { speed 칸/초, siege 초당 피해, bias 부수는 시간에 곱하는 성향 }
function field(map, units, profile) {
  const n = map.w * map.h;
  const move = 1 / profile.speed;
  const bias = profile.bias == null ? 1 : profile.bias;
  const cost = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    if (map.walls[i]) { cost[i] = Infinity; continue; }
    const u = units && units[i];
    if (!u) { cost[i] = move; continue; }
    cost[i] = profile.siege > 0 ? move + (u.hp / profile.siege) * bias : Infinity;
  }

  const dist = new Float64Array(n).fill(Infinity);
  const done = new Uint8Array(n);
  const start = at(map, map.exit.x, map.exit.y);
  dist[start] = 0;
  // 힙을 쓰지 않는다. 칸이 88개뿐이라 최소값을 훑는 편이 빠르고, 무엇보다
  // 동점일 때 고르는 순서가 흔들리지 않아 판이 그대로 재현된다.
  for (let round = 0; round < n; round++) {
    let v = -1;
    let best = Infinity;
    for (let i = 0; i < n; i++) {
      if (done[i] || dist[i] >= best) continue;
      best = dist[i];
      v = i;
    }
    if (v < 0) break;
    done[v] = 1;
    if (!Number.isFinite(cost[v])) continue;
    const x = v % map.w;
    const y = (v - x) / map.w;
    // a에서 v로 넘어오는 값이 cost[v]다 — 들어가는 칸의 값이므로 거꾸로 풀어도
    // 같은 식을 쓴다.
    const cand = dist[v] + cost[v];
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= map.w || ny >= map.h) continue;
      const a = at(map, nx, ny);
      if (done[a] || map.walls[a]) continue;
      if (cand < dist[a]) dist[a] = cand;
    }
  }

  return { dist, cost };
}

// 이 칸에서 다음에 밟을 칸. 동점이면 DIRS 차례대로 골라 매번 같은 길이 나온다.
//
// **남은 시간이 가장 짧은 이웃이 아니라 `들어가는 값 + 남은 시간`이 가장 작은
// 이웃을 고른다.** 앞의 것으로 골랐더니 지키는 이가 선 칸이 늘 최선으로 보였다 —
// 그 칸에서부터 재면 출구가 가깝기 때문이다. 부수는 값은 그 칸에 들어갈 때
// 치르는 것이라 고를 때 같이 세야 한다.
function step(map, f, x, y) {
  let best = Infinity;
  let pick = null;
  for (const [dx, dy] of DIRS) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= map.w || ny >= map.h) continue;
    const a = at(map, nx, ny);
    if (map.walls[a]) continue;
    const cand = f.dist[a] + f.cost[a];
    if (cand < best) { best = cand; pick = { x: nx, y: ny }; }
  }
  return Number.isFinite(best) ? pick : null;
}

// 화면이 점선으로 그릴 길. 되짚는 일이 없도록 밟은 칸을 표시하며 간다.
function route(map, f, from) {
  const path = [{ x: from.x, y: from.y }];
  const seen = new Uint8Array(map.w * map.h);
  seen[at(map, from.x, from.y)] = 1;
  let cur = from;
  while (!(cur.x === map.exit.x && cur.y === map.exit.y)) {
    const nxt = step(map, f, cur.x, cur.y);
    if (!nxt) break;
    const a = at(map, nxt.x, nxt.y);
    if (seen[a]) break;
    seen[a] = 1;
    path.push(nxt);
    cur = nxt;
  }
  return path;
}

// 벽만으로 길이 끊겼는가. 지키는 이는 부수고 지나가므로 여기에 걸리지 않는다 —
// 이것이 참이면 판을 잘못 만든 것이다.
function sealed(map, f) {
  return !Number.isFinite(f.dist[at(map, map.entry.x, map.entry.y)]);
}

const Paths = { field, step, route, sealed, at };

if (typeof module !== 'undefined' && module.exports) module.exports = Paths;
if (typeof window !== 'undefined') window.DefensePaths = Paths;

})();
