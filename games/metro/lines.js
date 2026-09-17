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
const Geom = (typeof module !== 'undefined' && module.exports)
  ? require('./geom.js')
  : window.MetroGeom;

const DWELL = 25;        // 역 한 곳에 서 있는 시간(초). 급행이 아낀 것이 이 시간이다
const TRAIN_COST = 22;   // 열차 한 대 값(억)
const MAX_TRAINS = 12;
const MAX_PATTERNS = 3;
const MIN_GAP = 110;     // 선로 위 두 열차 사이의 최소 간격(초). 복복선은 없다

// **열차는 량으로 이루어진다.** 열차를 더 사면 배차가 좁아지지만 선로 간격에서 막히는데
// (`MIN_GAP`), 그때 남는 길이 **한 대를 길게 만드는 것**이다. 값은 열차 한 대보다 싸고,
// 대신 배차는 전혀 나아지지 않는다 — 기다리는 시간은 그대로고 실어 나르는 양만 는다.
const CAR_CAPACITY = 240;   // 한 량이 싣는 사람
const CARS = { min: 2, max: 5, base: 3 };
// 한 량 값(억). 열차 한 대 값(22억, 기본 세 량)보다 **수송력당으로는 싸게** 둔다 —
// 대신 배차는 전혀 나아지지 않으므로, 선로 간격에 막힌 뒤에나 쓸 수가 있다.
const CAR_COST = 6;

// **량은 열차마다 따로다.** 한 패턴에 한 값으로 두었더니 한 대를 늘리면 그 운행의
// 열차가 전부 길어졌는데, 그러면 "이 열차가 터지니 이 열차를 늘린다"가 성립하지 않는다.
// 패턴이 열차별 량수를 배열로 들고, 적히지 않은 자리는 기본값으로 본다.
const carList = (pattern, dir) => (dir < 0 ? pattern.backCars : pattern.cars);

function carsAt(pattern, dir, k) {
  const arr = pattern && carList(pattern, dir);
  const n = arr && arr[k];
  return n || CARS.base;
}

function setCarAt(pattern, dir, k, cars) {
  const key = dir < 0 ? 'backCars' : 'cars';
  if (!Array.isArray(pattern[key])) pattern[key] = [];
  pattern[key][k] = cars;
}

function trainCount(pattern, dir) {
  return dir < 0 ? (pattern.back || 0) : pattern.trains;
}

// 그 방향 열차들이 함께 싣는 사람. 열차마다 길이가 다르므로 합으로 센다.
function seatsOf(pattern, dir = 1) {
  let sum = 0;
  for (let k = 0; k < trainCount(pattern, dir); k++) sum += carsAt(pattern, dir, k);
  return sum * CAR_CAPACITY;
}

// 분당 수송력. **주기 동안 그 자리를 지나가는 좌석 전부**다 — 열차마다 길이가 달라
// "한 대 × 배차간격"으로는 셀 수가 없다. 대수가 같고 길이도 같으면 예전 식과 같은 값이다.
function capacityOf(pattern, cycle, dir = 1) {
  if (!cycle || !Number.isFinite(cycle)) return 0;
  return seatsOf(pattern, dir) * 60 / cycle;
}

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
    patterns: [{ stops: [true, true], trains: 1, back: 0, cars: [], backCars: [] }],
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

// 이미 깔린 선 밑에 역을 놓았을 때 **그 노선에 끼워 넣은 사본**. 없으면 null.
//
// 노선을 끝에서만 늘릴 수 있으면, 지나가는 선 아래에 놓은 역은 쓸 방법이 없다 —
// 노선을 지우고 처음부터 다시 긋는 것 말고는. 선로는 이미 그 위를 지나고 있으므로
// 새로 뚫을 것이 없고, 끼워 넣기만 하면 된다.
//
// 어디에 끼울지는 **그려진 경로**로 찾는다. 제어점을 잇는 꺾은선이 아니라 눈에 보이는
// 선이라야 "이 선 위에 놓았다"는 플레이어의 판단과 어긋나지 않는다.
function withInsertion(line, station, tol) {
  if (!line.path || !line.anchors || line.stations.includes(station)) return null;

  const near = Geom.nearestOnPolyline(station.x, station.y, line.path.pts);
  if (near.d > tol) return null;

  // 그 샘플을 앞뒤로 감싸는 두 정차역. 순환선은 마지막 마디가 0번 역으로 돌아온다.
  let seg = -1;
  for (let i = 0; i + 1 < line.anchors.length; i++) {
    if (line.anchors[i].at <= near.index && near.index <= line.anchors[i + 1].at) { seg = i; break; }
  }
  if (seg < 0) return null;

  // 그 마디의 중간점들을 새 역의 앞뒤로 가른다. 가르지 않고 한쪽에 몰면 선이 역을
  // 지나쳤다가 되돌아온다.
  const mids = (line.mids[seg] || []).map((m) => ({ x: m.x, y: m.y }));
  const ends = [line.stations[seg], ...mids, line.stations[(seg + 1) % line.stations.length]];
  const cut = Geom.nearestOnPolyline(station.x, station.y, ends).index - 1;

  const stations = line.stations.slice();
  stations.splice(seg + 1, 0, station);
  const nextMids = line.mids.map((m) => m.map((q) => ({ x: q.x, y: q.y })));
  nextMids.splice(seg, 1, mids.slice(0, cut), mids.slice(cut));

  const next = {
    ...line,
    stations,
    mids: nextMids,
    // **급행은 양 옆에 다 서는 경우에만 새 역에도 선다.** 통과하던 구간 한가운데에
    // 역이 생겼다고 급행이 말없이 서기 시작하면, 플레이어가 짠 패턴이 뒤집힌다.
    patterns: line.patterns.map((p) => {
      const stops = p.stops.slice();
      stops.splice(seg + 1, 0, !!(p.stops[seg] && p.stops[(seg + 1) % p.stops.length]));
      return { ...p, stops };
    }),
  };
  return { seg, d: near.d, line: next };
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

// **선로가 하나뿐이다.** 복복선이 아니라, 한 노선 위의 모든 열차가 같은 길을 쓴다.
// 여기서 두 가지 제약이 나온다.
//
// ① **선로 간격.** 열차를 아무리 사도 서로 붙어 갈 수는 없다. 노선 위 열차 간격이
//    최소 간격보다 좁아지면 그만큼 다 같이 느려진다 — 그래서 열차를 사는 데 적정선이
//    생기고, 그 위로는 돈만 나간다.
//
// ② **급행은 역에서만 추월한다.** 앞서가는 완행을 따라잡으면 그 뒤에 붙어 갈 수밖에
//    없고, 완행이 역에 선 사이에만 지나칠 수 있다. 그래서 급행이 완행보다 아낄 수
//    있는 시간은 **통과역 수 × 완행 배차간격**을 넘지 못한다. 완행이 안 다니면
//    막을 것이 없어 이 제약도 없다.
//
// 둘 중 엄한 쪽을 따른다. 지금 숫자로는 대개 ①이 먼저 걸린다.
function holdFactor(line, pattern) {
  return Math.max(trackFactor(line), overtakeFactor(line, pattern));
}

function trackFactor(line) {
  const total = trackTrains(line);
  if (total <= 1) return 1;
  const slow = slowest(line);
  if (!slow) return 1;
  const cycle = (runTime(line, slow) + slow.stops.filter(Boolean).length * DWELL)
    * (line.loop ? 1 : 2);
  const gap = cycle / total;
  return gap < MIN_GAP ? MIN_GAP / gap : 1;
}

function overtakeFactor(line, pattern) {
  const mine = pattern.stops.filter(Boolean).length;
  let local = null;
  for (const other of line.patterns) {
    if (other === pattern || other.trains <= 0) continue;
    const stops = other.stops.filter(Boolean).length;
    if (stops <= mine) continue;
    if (!local || stops > local.stops.filter(Boolean).length) local = other;
  }
  if (!local) return 1;

  const free = runTime(line, pattern);
  const slow = runTime(line, local);
  if (free <= 0 || slow <= free) return 1;

  const passes = local.stops.filter(Boolean).length - mine;
  const localCycle = (slow + local.stops.filter(Boolean).length * DWELL) * (line.loop ? 1 : 2);
  const allowed = passes * (localCycle / local.trains);
  return Math.max(free, slow - allowed) / free;
}

// 가장 많이 서는 패턴. 선로를 가장 오래 차지하는 것이라 간격의 기준이 된다.
function slowest(line) {
  let best = null;
  for (const p of line.patterns) {
    if (p.trains <= 0) continue;
    if (!best || p.stops.filter(Boolean).length > best.stops.filter(Boolean).length) best = p;
  }
  return best || line.patterns[0];
}

// 제약을 빼고 순수하게 달리는 데 걸리는 시간.
function runTime(line, pattern) {
  if (!line.path) return 0;
  const stops = line.anchors.filter((a) => pattern.stops[a.station]).map((a) => a.at);
  const prof = Route.profile(line.path, Route.LIMITS, stops);
  // 다니는 구간만 센다. 종착역 밖으로는 아예 가지 않는다.
  const span = spanOf(line, pattern);
  if (span.from === 0 && span.to === line.path.pts.length - 1) return prof.time;
  let time = 0;
  for (let i = span.from; i < span.to; i++) {
    const sum = prof.v[i] + prof.v[i + 1];
    if (sum > 0) time += 2 * (line.path.s[i + 1] - line.path.s[i]) / sum;
  }
  return time;
}

// 한 운행 패턴이 한 바퀴 도는 데 걸리는 시간과 그때의 배차간격.
//
// **왕복이 기본이고 순환선만 한 방향으로 돈다.** 왕복은 같은 길을 되짚어 오므로
// 주행시간이 두 배이고 정차도 두 번씩 한다.
function plan(line, pattern) {
  if (!line.path) return null;
  const count = pattern.stops.filter(Boolean).length;
  // **막히면 서 있는 시간도 같이 늘어난다.** 앞차에 걸린 열차는 역에서도 기다리게
  // 되고, 주행만 늘리면 배차간격이 최소 간격 아래로 내려가 규칙이 무의미해진다.
  const hold = holdFactor(line, pattern);
  const oneWay = runTime(line, pattern) * hold;
  const cycle = (oneWay + count * DWELL * hold) * (line.loop ? 1 : 2);
  return {
    oneWay,
    cycle,
    hold,
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
  // 다니는 구간 밖은 표에 넣지 않는다 — 그 밖으로는 열차가 가지 않는다.
  const span = spanOf(line, pattern);
  // 앞차에 막혀 늦어지는 몫. 실제로는 따라잡는 지점에서 몰려 생기지만, 화면에서
  // 읽히는 차이가 없어 고르게 늘려 둔다.
  const hold = holdFactor(line, pattern);

  const out = [];
  const stops = [];
  let t = 0;
  for (let i = span.from; i <= span.to; i++) {
    const last = i === span.to;
    if (halt.has(i) && !(line.loop && last)) {
      stops.push({ at: i, arrive: t, depart: t + DWELL * hold });
      out.push({ t, s: path.s[i] });
      t += DWELL * hold;
      out.push({ t, s: path.s[i] });
    } else {
      out.push({ t, s: path.s[i] });
    }
    if (!last) {
      const ds = path.s[i + 1] - path.s[i];
      const sum = prof.v[i] + prof.v[i + 1];
      if (sum > 0) t += 2 * ds / sum * hold;
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
  const spot = pointAt(line.path, s);
  // 서 있는 동안은 시간만 가고 거리가 그대로다. 화면이 그것을 달리 그린다 —
  // 열차가 역에 선다는 것이 보이지 않으면 정차 시간도 가감속도 숫자로만 남는다.
  spot.halted = b.t > a.t && Math.abs(b.s - a.s) < 1e-6;
  spot.s = s;
  // **지금 향하는 쪽.** 서 있는 동안에는 곧 떠날 쪽을 본다 — 종점에 선 열차가 들고
  // 있는 것은 방금 싣고 온 몫이 아니라 되돌아가며 실을 몫이다. 순환선은 한 방향뿐이라
  // 표 끝에서 s가 0으로 돌아가는 것을 뒤로 가는 것으로 읽으면 안 된다.
  spot.dir = 1;
  if (!table.loop) {
    let j = hi;
    while (j < marks.length && Math.abs(marks[j].s - a.s) < 1e-6) j++;
    if (j < marks.length && marks[j].s < a.s) spot.dir = -1;
  }
  return spot;
}

// 향하는 쪽까지 함께 돌려준다. 열차를 네모로 그리려면 어느 쪽으로 누워야 하는지를
// 알아야 하고, 그것은 그 자리 선로의 방향이다.
function pointAt(path, s) {
  const arr = path.s;
  const last = arr.length - 1;
  let lo = 0;
  let hi = last;
  if (s <= 0) lo = 0;
  else if (s >= arr[last]) lo = last - 1;
  else {
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid] <= s) lo = mid; else hi = mid;
    }
  }
  const a = path.pts[lo];
  const b = path.pts[lo + 1] || a;
  const span = arr[lo + 1] != null ? arr[lo + 1] - arr[lo] : 0;
  const k = span > 0 ? clamp((s - arr[lo]) / span, 0, 1) : 0;
  return {
    x: a.x + (b.x - a.x) * k,
    y: a.y + (b.y - a.y) * k,
    ang: Math.atan2(b.y - a.y, b.x - a.x),
  };
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

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
  return { stops, trains: 1, back: 0, cars: [], backCars: [] };
}

// **어느 역이든 끌 수 있다. 둘만 남으면 된다.** 전에는 양 끝을 잠가 두었는데("종착역에
// 서지 않는 열차는 성립하지 않는다"), 그러면 **바깥 몇 정거장만 빼고 도는 구간 운행**을
// 만들 수가 없다. 지금은 켜 둔 역 중 **첫 역과 마지막 역이 그 운행의 종착역**이고,
// 그 밖은 아예 가지 않는다.
function canToggle(line, index, pattern = line.patterns[0]) {
  if (!pattern) return false;
  if (!pattern.stops[index]) return true;   // 꺼져 있는 것은 언제든 켤 수 있다
  return pattern.stops.filter(Boolean).length > 2;
}

// 그 운행이 실제로 다니는 구간. 켜 둔 역 중 처음과 끝의 샘플 번호다. 순환선은 한 바퀴가
// 곧 주기라 잘라 낼 자리가 없어 경로 전체를 쓴다.
function spanOf(line, pattern) {
  const last = line.path ? line.path.pts.length - 1 : 0;
  if (!line.path || !line.anchors) return { from: 0, to: last };
  const marks = line.anchors.filter((a) => pattern.stops[a.station] && a.at >= 0);
  if (line.loop || marks.length < 2) return { from: 0, to: last };
  return { from: marks[0].at, to: marks[marks.length - 1].at };
}

// **이 선로 위를 도는 열차**. 순환선의 역방향은 제 선로를 따로 쓰므로 여기 안 든다.
function trackTrains(line) {
  return line.patterns.reduce((sum, p) => sum + p.trains, 0);
}

// **산 열차 전부.** 값을 치르고 돌려받는 쪽은 방향을 가리지 않는다.
function trainsOf(line) {
  return line.patterns.reduce(
    (sum, p) => sum + p.trains + (line.loop ? (p.back || 0) : 0), 0);
}

// 순환선을 반대로 도는 쪽. **마주 오는 열차가 한 선로에 있을 수 없으므로, 두 방향을
// 함께 굴리는 순환선은 복선으로 본다** — 그래서 간격 제약(`MIN_GAP`)도 추월 제약도
// 방향마다 따로 걸린다. 자료로는 **역 순서를 뒤집은 또 하나의 순환선**이라, 시간표도
// 수요도 혼잡도 이미 있는 코드가 그대로 돈다.
//
// 뒤집어도 0번 역이 맨 앞이다. 순환선은 어디서 시작하든 같은 고리이고, 그래야 역
// 번호가 양쪽에서 같은 것을 가리킨다.
function reverse(line) {
  if (!line.loop) return null;
  const n = line.stations.length;
  const order = [0];
  for (let i = n - 1; i >= 1; i--) order.push(i);

  // mids[i]는 i번 역과 그다음 역 사이다. 뒤집으면 k번 마디가 원래 (n-1-k)번 마디를
  // 거꾸로 지나는 것이 된다.
  const mids = [];
  for (let k = 0; k < n; k++) {
    const src = line.mids[n - 1 - k] || [];
    mids.push(src.slice().reverse().map((m) => ({ x: m.x, y: m.y })));
  }

  return {
    ...line,
    stations: order.map((i) => line.stations[i]),
    mids,
    order,
    path: null,
    anchors: null,
    patterns: line.patterns.map((p) => ({
      ...p,
      stops: order.map((i) => p.stops[i]),
      trains: p.back || 0,
      back: 0,
      // 뒤집힌 노선에서는 역방향 열차가 곧 그 노선의 열차다. 량수도 같이 옮긴다.
      cars: Array.isArray(p.backCars) ? p.backCars.slice() : [],
      backCars: [],
    })),
  };
}

const Lines = {
  DWELL, TRAIN_COST, MAX_TRAINS, MAX_PATTERNS, CAR_CAPACITY, CARS, CAR_COST,
  carsAt, setCarAt, seatsOf, capacityOf, trainCount,
  controlPoints, create, withExtension, withInsertion, whyNot, rebuild, plan, timetable, at, pointAt, rideTime,
  holdFactor, trackFactor, overtakeFactor, runTime, MIN_GAP,
  expressPattern, canToggle, spanOf, trainsOf, trackTrains, reverse,
  reset() { nextId = 1; },
};

if (typeof module !== 'undefined' && module.exports) module.exports = Lines;
if (typeof window !== 'undefined') window.MetroLines = Lines;

})();
