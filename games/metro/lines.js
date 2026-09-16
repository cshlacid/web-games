'use strict';

// 노선과 열차. **노선은 구간 모음이 아니라 역들의 열이다.**
//
// 처음에는 확정된 구간을 그냥 배열에 쌓았는데, 그러면 "이 노선을 왕복하는 데 얼마나
// 걸리는가"를 물을 데가 없다. 열차도 배차간격도 급행도 전부 그 질문 위에 서 있어서,
// 역의 순서를 들고 있는 것이 자료의 중심이 되어야 했다.
//
// 화면을 모른다 — node에서 그대로 돈다.
(function () {

const Route = (typeof module !== 'undefined' && module.exports)
  ? require('./route.js')
  : window.MetroRoute;

const DWELL = 25;        // 역 한 곳에 서 있는 시간(초). 급행이 아낀 것이 이 시간이다
const TRAIN_COST = 22;   // 열차 한 대 값(억)
const MAX_TRAINS = 12;
const MAX_PATTERNS = 3;

let nextId = 1;

// 노선의 제어점 전부. 역에는 stop 표시를 달아 경로가 그 점을 정확히 지나게 한다 —
// 승강장이 선로 옆으로 밀려나면 안 된다.
function controlPoints(line) {
  const out = [];
  for (let i = 0; i < line.stations.length; i++) {
    const st = line.stations[i];
    out.push({ x: st.x, y: st.y, stop: true, station: i });
    const mids = line.mids[i];
    if (mids) for (const m of mids) out.push({ x: m.x, y: m.y });
  }
  if (line.loop) {
    const st = line.stations[0];
    out.push({ x: st.x, y: st.y, stop: true, station: 0 });
  }
  return out;
}

function create(from, to, mids = []) {
  return {
    id: nextId++,
    color: 0,
    stations: [from, to],
    mids: [mids.map((m) => ({ x: m.x, y: m.y }))],
    loop: false,
    patterns: [{ stops: [true, true], trains: 1, dir: 1 }],
  };
}

// 끝에 역을 하나 붙인 사본. 원본을 건드리지 않아 **끌고 있는 동안 시험 삼아 지어
// 보는 데** 그대로 쓴다.
function withExtension(line, station, mids = []) {
  const closing = station === line.stations[0];
  const next = {
    ...line,
    stations: closing ? line.stations.slice() : [...line.stations, station],
    mids: [...line.mids, mids.map((m) => ({ x: m.x, y: m.y }))],
    loop: closing,
    patterns: line.patterns.map((p) => ({
      ...p,
      stops: closing ? p.stops.slice() : [...p.stops, true],
    })),
  };
  return next;
}

// 왜 못 잇는지를 문장이 아니라 열쇠로 돌려준다. 이 파일이 한 언어에 묶이면 node
// 테스트가 브라우저 전역(사전)을 부르게 된다.
function whyNot(line, station) {
  if (line.loop) return 'closed';
  const last = line.stations[line.stations.length - 1];
  if (station === last) return 'same';
  if (station === line.stations[0]) return line.stations.length < 3 ? 'tooShort' : null;
  if (line.stations.includes(station)) return 'dup';
  return null;
}

// 경로를 짓고 노선에 캐시한다. 역이 어느 샘플에 앉았는지(anchors)가 정차 계획의
// 바탕이라 함께 들고 있는다.
function rebuild(line, classify) {
  const points = controlPoints(line);
  const path = Route.build(points);
  if (!path.ok) { line.path = null; line.fail = path; return path; }

  line.path = path;
  line.fail = null;
  line.anchors = [];
  for (let i = 0; i < points.length; i++) {
    if (points[i].stop) line.anchors.push({ station: points[i].station, at: path.anchors[i] });
  }
  if (classify) line.cost = Route.cost(path, classify);
  return path;
}

// 한 운행 패턴이 한 바퀴 도는 데 걸리는 시간과 그때의 배차간격.
//
// **왕복이 기본이고 순환선만 한 방향으로 돈다.** 왕복은 같은 길을 되짚어 오므로
// 주행시간이 두 배이고 정차도 두 번씩 한다.
function plan(line, pattern) {
  if (!line.path) return null;
  const stops = line.anchors.filter((a) => pattern.stops[a.station]).map((a) => a.at);
  const prof = Route.profile(line.path, Route.LIMITS, stops);
  const count = pattern.stops.filter(Boolean).length;
  const oneWay = prof.time;
  const cycle = line.loop
    ? oneWay + count * DWELL
    : (oneWay + count * DWELL) * 2;
  return {
    oneWay,
    cycle,
    stops: count,
    headway: pattern.trains > 0 ? cycle / pattern.trains : Infinity,
    length: line.path.length * (line.loop ? 1 : 2),
  };
}

// 한 주기의 시간표. **열차가 지금 어디 있는지 물으려면 시간 → 거리 표가 있어야 한다.**
// 속도 프로파일은 "이 지점에서 몇 m/s"만 알려 주므로, 그것을 시간으로 적분해 두고
// 정차 시간을 사이사이에 끼워 넣는다.
//
// 왕복은 같은 길을 되짚어 오므로 가는 쪽 표를 뒤집어 붙이면 그만이다. 순환선은
// 한 바퀴가 곧 주기이고, 마지막 샘플이 첫 역과 같은 자리라 거기서는 다시 서지 않는다.
function timetable(line, pattern) {
  if (!line.path) return null;
  const path = line.path;
  const marks = line.anchors.filter((a) => pattern.stops[a.station]);
  const halt = new Set(marks.map((a) => a.at));
  const prof = Route.profile(path, Route.LIMITS, [...halt]);
  const n = path.pts.length;

  const out = [];
  const stops = [];
  let t = 0;
  for (let i = 0; i < n; i++) {
    const last = i === n - 1;
    if (halt.has(i) && !(line.loop && last)) {
      stops.push({ at: i, arrive: t, depart: t + DWELL });
      out.push({ t, s: path.s[i] });
      t += DWELL;
      out.push({ t, s: path.s[i] });
    } else {
      out.push({ t, s: path.s[i] });
    }
    if (!last) {
      const ds = path.s[i + 1] - path.s[i];
      const sum = prof.v[i] + prof.v[i + 1];
      if (sum > 0) t += 2 * ds / sum;
    }
  }

  const half = t;
  const legs = out.slice();
  if (!line.loop) {
    // 돌아오는 길. 시간은 이어 붙이고 거리는 그대로 되짚는다.
    for (let i = out.length - 1; i >= 0; i--) {
      legs.push({ t: half + (half - out[i].t), s: out[i].s });
    }
  }

  // 역마다 station 번호를 달아 둔다. 수요가 "이 역에서 저 역까지 몇 초인가"를 묻는다.
  marks.forEach((a, k) => { if (stops[k]) stops[k].station = a.station; });

  return { cycle: line.loop ? half : half * 2, half, marks: legs, stops, loop: !!line.loop };
}

// 주기 안의 어느 시각에 열차가 놓인 자리. 표를 시간으로 훑어 거리를 보간하고,
// 그 거리를 다시 경로 위 좌표로 옮긴다.
function at(line, table, time) {
  const marks = table.marks;
  const t = ((time % table.cycle) + table.cycle) % table.cycle;
  let lo = 0;
  let hi = marks.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (marks[mid].t <= t) lo = mid; else hi = mid;
  }
  const a = marks[lo];
  const b = marks[hi];
  const k = b.t > a.t ? (t - a.t) / (b.t - a.t) : 0;
  const s = a.s + (b.s - a.s) * k;
  return pointAt(line.path, s);
}

function pointAt(path, s) {
  const arr = path.s;
  let lo = 0;
  let hi = arr.length - 1;
  if (s <= 0) return path.pts[0];
  if (s >= arr[hi]) return path.pts[hi];
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] <= s) lo = mid; else hi = mid;
  }
  const k = (s - arr[lo]) / (arr[hi] - arr[lo] || 1);
  return {
    x: path.pts[lo].x + (path.pts[hi].x - path.pts[lo].x) * k,
    y: path.pts[lo].y + (path.pts[hi].y - path.pts[lo].y) * k,
  };
}

// 정차역 하나에서 다른 정차역까지 걸리는 시간. 왕복 노선은 어느 쪽으로 가나 같고,
// 순환선은 한 방향뿐이라 지나쳤으면 한 바퀴를 돌아야 한다.
function rideTime(table, fromStation, toStation) {
  const p = table.stops.findIndex((s) => s.station === fromStation);
  const q = table.stops.findIndex((s) => s.station === toStation);
  if (p < 0 || q < 0 || p === q) return null;
  // 왕복은 어느 쪽으로 가나 같은 시간이다. 그냥 빼면 정차 시간이 한쪽에만 붙어
  // 되돌아오는 길이 정차 두 번만큼 길어진다 — 늘 앞선 역에서 출발해 뒤선 역에
  // 도착하는 것으로 계산한다.
  if (!table.loop) {
    const lo = Math.min(p, q);
    const hi = Math.max(p, q);
    return table.stops[hi].arrive - table.stops[lo].depart;
  }
  const gap = table.stops[q].arrive - table.stops[p].depart;
  return gap >= 0 ? gap : gap + table.cycle;
}

// 급행은 **양 끝만 남기고 시작한다.** 거기서 세울 역을 도로 켜는 편이, 다 켜 둔
// 것에서 하나씩 끄는 것보다 "급행을 만든다"는 뜻에 맞다.
function expressPattern(line) {
  const stops = line.stations.map((_, i) => i === 0 || i === line.stations.length - 1);
  if (line.loop) stops[0] = true;
  return { stops, trains: 1, dir: 1 };
}

// 양 끝은 끌 수 없다. 종착역에 서지 않는 열차는 성립하지 않는다.
function canToggle(line, index) {
  if (line.loop) return index !== 0;
  return index !== 0 && index !== line.stations.length - 1;
}

function trainsOf(line) {
  return line.patterns.reduce((sum, p) => sum + p.trains, 0);
}

const Lines = {
  DWELL, TRAIN_COST, MAX_TRAINS, MAX_PATTERNS,
  controlPoints, create, withExtension, whyNot, rebuild, plan, timetable, at, pointAt, rideTime,
  expressPattern, canToggle, trainsOf,
  reset() { nextId = 1; },
};

if (typeof module !== 'undefined' && module.exports) module.exports = Lines;
if (typeof window !== 'undefined') window.MetroLines = Lines;

})();
