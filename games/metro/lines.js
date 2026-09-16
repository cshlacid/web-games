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
  controlPoints, create, withExtension, whyNot, rebuild, plan,
  expressPattern, canToggle, trainsOf,
  reset() { nextId = 1; },
};

if (typeof module !== 'undefined' && module.exports) module.exports = Lines;
if (typeof window !== 'undefined') window.MetroLines = Lines;

})();
