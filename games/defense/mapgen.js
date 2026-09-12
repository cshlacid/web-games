'use strict';

// 판의 땅. 스테이지 번호 하나로 다시 만들어진다 — 이상한 판을 만나면 번호만
// 들고 와 node에서 그대로 열 수 있다.
//
// **벽은 하나씩 놓고, 놓을 때마다 빈 칸이 전부 하나로 이어져 있는지 본다.**
// 다 놓고 검사해서 틀리면 버리는 방식은 씨드마다 시도 횟수가 달라져 재현이
// 흔들리고, 고립된 빈 구역(적이 지나지 않아 아무도 세우지 않는 자리)도 그대로
// 남는다. 하나씩 보면 둘 다 처음부터 생기지 않는다.
(function () {

// 폰 세로 화면에서 칸이 40px 근처로 나오는 크기. 더 넓히면 칸이 작아져
// 캐릭터가 안 보이고, 더 좁히면 돌아가는 길이 생기지 않아 미로가 성립하지 않는다.
const W = 8;
const H = 11;

const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

function createRng(seed) {
  let a = (seed >>> 0) || 1;
  return function next() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const idx = (x, y) => y * W + x;

// **판마다 성격이 있다.** 예전에는 벽 수가 12~20 하나뿐이라 어느 판이나 트인
// 벌판이었고, 그러면 편성이 판을 안 본다 — 사거리가 긴 자를 여섯 세우는 것이
// 늘 맞는 답이 된다. 벽 수를 세 갈래로 벌려 **막을 수 있는 판과 없는 판**을
// 만든다. 재 보면 길 칸 중 좁은 목(이웃한 빈 칸이 둘 이하)의 비율이 들판 12%,
// 벌판 19%, 미로 42%다.
//
// 경로 길이로 가르려던 것은 포기했다. 8×11에서는 최단 경로가 어차피 열 칸이
// 넘고 벽을 아무리 채워도 평균 14에서 18로 갈 뿐이라, 길이로는 판이 안 갈린다.
const SHAPES = [
  { id: 'plain', walls: [6, 10] },
  { id: 'rough', walls: [13, 19] },
  { id: 'maze', walls: [28, 34] },
];

// 벌판이 절반이고 양 끝이 4분의 1씩이다. 극단이 자주 나오면 그것이 기본값처럼
// 느껴져 성격이 없어진다.
const shapeAt = (roll) => (roll < 0.25 ? SHAPES[0] : (roll < 0.75 ? SHAPES[1] : SHAPES[2]));

// 벽이 아닌 칸이 전부 하나로 이어져 있는가. 입구와 출구가 이어지는지만 보면
// 판 구석에 적도 나도 쓸 일 없는 빈 구역이 남는다.
function whole(walls) {
  let start = -1;
  let open = 0;
  for (let i = 0; i < walls.length; i++) {
    if (!walls[i]) { open++; if (start < 0) start = i; }
  }
  if (start < 0) return false;
  const seen = new Uint8Array(walls.length);
  const queue = [start];
  seen[start] = 1;
  let found = 1;
  while (queue.length) {
    const c = queue.pop();
    const x = c % W;
    const y = (c - x) / W;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const n = idx(nx, ny);
      if (walls[n] || seen[n]) continue;
      seen[n] = 1;
      found++;
      queue.push(n);
    }
  }
  return found === open;
}

function build(stage) {
  const next = createRng(Math.imul(stage + 1, 0x9E3779B1));
  const walls = new Array(W * H).fill(0);
  const entry = { x: Math.floor(next() * W), y: 0 };
  const exit = { x: Math.floor(next() * W), y: H - 1 };
  const keep = new Set([idx(entry.x, entry.y), idx(exit.x, exit.y)]);

  // **처음 두 판은 늘 벌판이다.** 배우는 구간에서 미로가 나오면 좁은 목을 막는
  // 것이 기본값처럼 보이는데, 그것은 판마다 갈리는 성격이지 이 게임의 기본이 아니다.
  const shape = stage <= 2 ? SHAPES[1] : shapeAt(next());
  const target = shape.walls[0] + Math.floor(next() * (shape.walls[1] - shape.walls[0] + 1));
  let placed = 0;
  // 시도 상한. 남은 자리가 전부 연결을 끊는 판이면 목표를 못 채우는데, 벽이
  // 몇 개 모자란 판은 그냥 넓은 판이라 버릴 이유가 없다.
  for (let guard = 0; guard < 900 && placed < target; guard++) {
    let c;
    // 이미 놓인 벽에 붙여 키우면 바위 덩어리처럼 보인다. 매번 아무 데나
    // 흩뿌리면 판 전체가 점묘가 되어 돌아갈 길이 너무 많아진다.
    if (placed > 0 && next() < 0.6) {
      const grown = [];
      for (let i = 0; i < walls.length; i++) {
        if (!walls[i]) continue;
        const x = i % W;
        const y = (i - x) / W;
        for (const [dx, dy] of DIRS) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const n = idx(nx, ny);
          if (!walls[n] && !keep.has(n)) grown.push(n);
        }
      }
      if (!grown.length) continue;
      c = grown[Math.floor(next() * grown.length)];
    } else {
      c = Math.floor(next() * walls.length);
    }
    if (walls[c] || keep.has(c)) continue;
    walls[c] = 1;
    if (whole(walls)) placed++;
    else walls[c] = 0;
  }

  return { stage, w: W, h: H, walls, entry, exit, shape: shape.id };
}

// 판이 규격을 지키는가. 생성기를 고칠 때 테스트가 보는 자리다.
function wellFormed(map) {
  if (!map || map.w !== W || map.h !== H) return false;
  if (!Array.isArray(map.walls) || map.walls.length !== W * H) return false;
  if (!map.entry || !map.exit) return false;
  if (map.entry.y !== 0 || map.exit.y !== H - 1) return false;
  if (map.entry.x < 0 || map.entry.x >= W) return false;
  if (map.exit.x < 0 || map.exit.x >= W) return false;
  if (map.walls[idx(map.entry.x, map.entry.y)]) return false;
  if (map.walls[idx(map.exit.x, map.exit.y)]) return false;
  if (!SHAPES.some((v) => v.id === map.shape)) return false;
  return whole(map.walls);
}

const MapGen = { W, H, DIRS, SHAPES, shapeAt, idx, build, wellFormed, whole, createRng };

if (typeof module !== 'undefined' && module.exports) module.exports = MapGen;
if (typeof window !== 'undefined') window.DefenseMap = MapGen;

})();
