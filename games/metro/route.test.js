'use strict';

// 실행: node games/metro/route.test.js
const R = require('./route.js');

let passed = 0;
let failed = 0;

function ok(name, cond, extra = '') {
  if (cond) passed++;
  else { failed++; console.log(`실패: ${name}${extra ? `\n  ${extra}` : ''}`); }
}

function near(name, actual, expected, tol) {
  ok(name, Math.abs(actual - expected) <= tol, `결과 ${actual}, 기대 ${expected} ±${tol}`);
}

const L = R.LIMITS;

// 가감속만 있는 직선 구간의 소요시간은 손으로 풀 수 있다. 스윕이 그 값과 맞는지
// 본다 — 이 하나가 맞으면 프로파일 전체의 뼈대가 맞는 것이다.
function straightTime(d, v, a, b) {
  const need = v * v / (2 * a) + v * v / (2 * b);
  if (d >= need) return v / a + v / b + (d - need) / v;
  const peak = Math.sqrt(2 * d * a * b / (a + b));
  return peak / a + peak / b;
}

// --- 직선 ---
{
  const path = R.build([{ x: 0, y: 0 }, { x: 1200, y: 0 }]);
  ok('직선은 다듬을 모서리가 없다', path.ok && path.corners.length === 0);
  near('길이는 두 점 사이 거리', path.length, 1200, 0.5);

  const p = R.profile(path);
  near('최고속에 닿는 구간', p.peak, L.V_MAX, 0.2);
  near('소요시간이 해석해와 맞는다', p.time, straightTime(1200, L.V_MAX, L.ACCEL, L.DECEL), 0.6);
  ok('양 끝에서는 서 있다', p.v[0] === 0 && p.v[p.v.length - 1] === 0);
}

// 짧은 구간은 최고속에 닿지 못한다. 역을 촘촘히 놓으면 느려진다는 성질이 여기서 나온다.
{
  const path = R.build([{ x: 0, y: 0 }, { x: 300, y: 0 }]);
  const p = R.profile(path);
  ok('짧으면 최고속에 못 닿는다', p.peak < L.V_MAX - 1, `peak ${p.peak}`);
  near('짧은 구간의 소요시간', p.time, straightTime(300, L.V_MAX, L.ACCEL, L.DECEL), 0.4);
}

// --- 모서리 다듬기 ---
{
  const a = { x: 0, y: 0 }, c = { x: 1000, y: 0 }, b = { x: 1000, y: 1000 };
  const f = R.fillet(a, c, b, L);
  ok('직각 모서리는 다듬을 수 있다', f.ok && !f.straight);
  near('접점까지의 거리가 반경과 맞는다', Math.hypot(f.t1.x - f.o.x, f.t1.y - f.o.y), f.r, 1e-6);
  near('반대쪽 접점도 마찬가지', Math.hypot(f.t2.x - f.o.x, f.t2.y - f.o.y), f.r, 1e-6);
  near('호의 중심각은 꺾인 각과 같다', Math.abs(f.delta), Math.PI / 2, 1e-6);
  near('직각에서는 접선 길이가 곧 반경', f.t, f.r, 1e-6);
  ok('팔의 45%까지만 쓴다', f.r <= 0.45 * 1000 + 1e-6, `r ${f.r}`);
}

{
  // 거의 곧은 모서리는 호를 끼우지 않는다. 끼워도 안 보이는데 수치만 불안정해진다.
  const f = R.fillet({ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 2000, y: 1 }, L);
  ok('거의 직선인 모서리는 그냥 지나간다', f.ok && f.straight);
}

{
  // 팔이 짧으면 넣을 수 있는 반경이 최소 곡선반경 아래로 떨어진다.
  const f = R.fillet({ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 200 }, L);
  ok('급한 꺾임은 건설 불가', !f.ok && f.reason === 'sharp', JSON.stringify(f));

  const path = R.build([{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 200 }]);
  ok('경로 전체도 불가로 떨어진다', !path.ok && path.reason === 'sharp');
}

{
  // 완만한 모서리는 반경 상한에 걸린다. 605m부터 이미 최고속이라 더 키울 이유가 없다.
  const f = R.fillet({ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 8000, y: 600 }, L);
  near('반경은 상한에서 멈춘다', f.r, L.R_MAX, 1e-6);
  near('상한 반경에서는 최고속 그대로', f.vlim, L.V_MAX, 1e-6);
}

// --- 곡선이 실제로 느리게 만드는가 ---
{
  const straight = R.build([{ x: 0, y: 0 }, { x: 2000, y: 0 }]);
  const bent = R.build([{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 1000 }]);
  ok('굽은 경로가 만들어진다', bent.ok);

  const ps = R.profile(straight);
  const pb = R.profile(bent);
  near('직선은 최고속으로 달린다', ps.peak, L.V_MAX, 0.2);
  const arcLim = Math.min(...bent.nodeLim);
  ok('곡선 구간에 제한속도가 걸린다', arcLim < L.V_MAX - 1, `제한 ${arcLim}`);
  near('곡선에 들어설 때는 이미 그 속도까지 줄어 있다',
    pb.v[bent.nodeLim.indexOf(arcLim)], arcLim, 0.2);

  // 같은 길이로 환산해도 굽은 쪽이 느리다. 길어져서가 아니라 곡선 때문이라는 뜻이다.
  ok('길이를 맞춰도 굽은 쪽이 느리다',
    pb.time / bent.length > ps.time / straight.length,
    `${pb.time / bent.length} vs ${ps.time / straight.length}`);

  // 다듬은 경로는 찍은 점을 그대로 잇는 것보다 짧다 — 모서리를 잘라 내므로.
  const corner = 1000 + 1000;
  ok('모서리를 자른 만큼 짧다', bent.length < corner, `${bent.length} vs ${corner}`);
}

// --- 프로파일의 성질 ---
{
  const path = R.build([
    { x: 0, y: 0 }, { x: 900, y: 120 }, { x: 1500, y: 800 }, { x: 2200, y: 900 },
  ]);
  ok('중간점 셋짜리 경로가 선다', path.ok);
  const p = R.profile(path);

  let overLimit = 0;
  let infeasible = 0;
  for (let i = 0; i < p.v.length; i++) {
    if (p.v[i] > path.nodeLim[i] + 1e-6) overLimit++;
    if (i + 1 < p.v.length) {
      const ds = path.s[i + 1] - path.s[i];
      const up = p.v[i + 1] * p.v[i + 1] - p.v[i] * p.v[i];
      if (up > 2 * L.ACCEL * ds + 1e-6) infeasible++;
      if (-up > 2 * L.DECEL * ds + 1e-6) infeasible++;
    }
  }
  ok('어디서도 제한속도를 넘지 않는다', overLimit === 0, `${overLimit}곳`);
  ok('가속·감속 한계를 지킨다', infeasible === 0, `${infeasible}곳`);
}

// --- 건설비 ---
{
  // 가운데 200m만 건물인 가짜 도시. 나머지는 도로.
  const path = R.build([{ x: 0, y: 0 }, { x: 1000, y: 0 }]);
  const c = R.cost(path, (x) => (x >= 400 && x < 600 ? 'building' : 'road'));
  near('건물 밑 길이', c.lengths.building, 200, R.LIMITS.DS + 0.1);
  near('도로 밑 길이', c.lengths.road, 800, R.LIMITS.DS + 0.1);
  near('값은 길이 × 단가',
    c.cost, c.lengths.building * R.UNIT_COST.building + c.lengths.road * R.UNIT_COST.road, 1e-9);
  ok('건물 구간은 한 토막으로 묶인다', c.runs.length === 1, JSON.stringify(c.runs));

  const allRoad = R.cost(path, () => 'road');
  ok('건물을 피하면 싸다', allRoad.cost < c.cost);
  ok('피하면 붉게 칠할 토막이 없다', allRoad.runs.length === 0);
}

// --- 그리는 선과 재는 값이 같은 자료에서 나온다 ---
{
  const path = R.build([{ x: 0, y: 0 }, { x: 800, y: 200 }, { x: 1400, y: 900 }]);
  const d = R.svgPath(path.pts);
  ok('경로 문자열의 꼭짓점 수가 샘플 수와 같다',
    d.split(/[ML]/).length - 1 === path.pts.length);
}

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);
