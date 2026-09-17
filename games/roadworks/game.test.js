'use strict';

// 실행: node games/roadworks/game.test.js
const G = require('./game.js');
const L = require('./levels.js');

let passed = 0;
let failed = 0;

function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
  } else {
    failed++;
    console.log(`실패: ${name}\n  결과 ${a}\n  기대 ${e}`);
  }
}

const city = () => G.create(L.CITY);
const at = (x, y) => y * L.CITY.w + x;

// 판에서 쓰는 자리들. 글자판을 세지 않고 읽히도록 이름을 붙여 둔다.
const CENTER = at(4, 4);   // 가운데 교차로
const ARM = at(4, 2);      // 북쪽 큰길
const LAND = at(3, 3);     // 빈 땅
const BLOCK = at(2, 1);    // 건물
const HOME = at(3, 0);

// --- 개입 판정 ---

{
  const s = city();
  check('빈 땅에는 도로를 놓는다', G.check(s, 'road', LAND).ok, true);
  check('건물 자리에는 못 놓는다', G.check(s, 'road', BLOCK).reason, 'spot');
  check('집도 못 부순다', G.check(s, 'road', HOME).reason, 'spot');
  check('이미 있는 도로에는 못 놓는다', G.check(s, 'road', CENTER).reason, 'spot');

  check('도로는 넓힐 수 있다', G.check(s, 'widen', ARM).ok, true);
  check('빈 땅은 넓힐 수 없다', G.check(s, 'widen', LAND).reason, 'spot');

  check('교차로에는 신호를 세운다', G.check(s, 'signal', CENTER).ok, true);
  check('곧은 길에는 신호를 못 세운다', G.check(s, 'signal', ARM).reason, 'crossing');
  check('신호가 없으면 조정할 것도 없다', G.check(s, 'split', CENTER).reason, 'nosignal');
}

{
  const s = city();
  const budget = s.budget;
  check('도로를 놓으면 예산이 준다',
    [G.apply(s, 'road', LAND).ok, budget - s.budget], [true, G.COST.road]);
  check('놓은 자리는 도로가 된다', s.net.tiles[LAND].kind, 'road');
  check('새로 난 길임을 남긴다', s.net.tiles[LAND].built, true);

  check('두 번 넓힐 수는 없다',
    [G.apply(s, 'widen', ARM).ok, G.check(s, 'widen', ARM).reason], [true, 'lanes']);
  check('넓힌 도로는 2차로', s.net.tiles[ARM].lanes, 2);

  s.budget = 0;
  check('예산이 모자라면 못 한다', G.check(s, 'road', at(3, 2)).reason, 'money');
}

{
  const s = city();
  G.apply(s, 'signal', CENTER);
  check('신호는 반반으로 시작한다', s.net.tiles[CENTER].signal, G.SPLITS[0]);
  check('이미 선 곳에 또 세우지 않는다', G.check(s, 'signal', CENTER).reason, 'signaled');
  G.apply(s, 'split', CENTER);
  check('조정은 배분을 돌린다', s.net.tiles[CENTER].signal, G.SPLITS[1]);
  G.apply(s, 'split', CENTER);
  G.apply(s, 'split', CENTER);
  check('끝까지 돌면 처음으로', s.net.tiles[CENTER].signal, G.SPLITS[0]);
}

// --- 민원 ---

{
  const s = city();
  check('시작부터 가운데가 막혀 있다',
    s.complaints.map((c) => [c.type, G.label(s.net, c.tile)]), [['jam', 'E5']]);
}

{
  // 정체가 한 구간을 통째로 덮어도 민원은 하나다. 고칠 곳이 하나이기 때문이다.
  const s = city();
  s.complaints = [];   // 시작 판의 민원이 이미 E5에 붙어 있다
  const line = [at(4, 2), at(4, 3), at(4, 4)];
  for (const i of line) s.sim.ratio[i] = 1.1;
  s.sim.ratio[at(4, 3)] = 1.5;
  const jams = G.violations(s).filter((c) => c.type === 'jam');
  check('잇닿은 정체는 한 건으로 묶는다', jams.length, 1);
  check('가장 나쁜 칸에 세운다', G.label(s.net, jams[0].tile), 'E4');

  // 이미 민원이 붙은 칸이 그 덩어리에 있으면 대표를 옮기지 않는다 — 옮기면 옛
  // 민원이 사라진 것으로 세어져 나빠진 것이 해결로 기록된다.
  s.complaints = [{ key: `jam:${at(4, 2)}`, type: 'jam', tile: at(4, 2), week: 1 }];
  const again = G.violations(s).filter((c) => c.type === 'jam');
  check('붙어 있던 자리를 지킨다', G.label(s.net, again[0].tile), 'E3');
}

{
  // **고치면 사라진다.** 민원은 사건이 아니라 상태라는 것이 여기서 드러난다.
  const s = city();
  const before = s.complaints.length;
  G.apply(s, 'signal', CENTER);
  G.apply(s, 'split', CENTER);
  G.apply(s, 'widen', CENTER);
  G.sync(s);
  check('막힌 곳을 풀면 민원이 빠진다', [before, s.complaints.length, s.solved], [1, 0, 1]);
}

{
  // 공사 민원. 한 주에 몰아서 갈아엎으면 그 자체가 민원이 된다.
  const s = city();
  s.budget = 500;
  for (const spot of [at(3, 3), at(5, 3), at(3, 5), at(5, 5)]) G.apply(s, 'road', spot);
  check('공사한 건수를 센다', s.works, 4);
  G.apply(s, 'signal', CENTER);
  G.apply(s, 'split', CENTER);
  check('신호 시간 조정은 공사가 아니다', s.works, 5);
  G.nextWeek(s);
  check('몰아서 하면 공사 민원', s.complaints.some((c) => c.type === 'works'), true);
  check('셈은 새 주에 비운다', s.works, 0);
  G.nextWeek(s);
  check('얌전한 주에는 풀린다', s.complaints.some((c) => c.type === 'works'), false);
}

{
  // 정체가 번져 대표 칸이 옮겨 가더라도 옛 민원이 "해결"로 세어지면 안 된다.
  const s = city();
  const solved = s.solved;
  for (let k = 0; k < 5; k++) G.nextWeek(s);
  check('나빠지는 동안 해결은 늘지 않는다', s.solved, solved);
  check('가운데 민원은 그대로 붙어 있다',
    s.complaints.some((c) => c.type === 'jam' && G.label(s.net, c.tile) === 'E5'), true);
}

{
  // 손대지 않으면 반드시 무너진다. 그것이 이 판의 시계다.
  const s = city();
  let weeks = 0;
  while (!s.over && weeks < 60) { G.nextWeek(s); weeks++; }
  check('방치하면 게임오버', s.over, true);
  check('그래도 열 주 남짓은 버틴다', weeks >= 6 && weeks <= 20, true);
  check('끝난 판에는 손대지 못한다', G.apply(s, 'road', LAND).reason, 'over');
  check('끝난 판은 주가 넘어가지 않는다', G.nextWeek(s), null);
}

{
  // 사라진 민원은 해결로 세고 목록에서 뺀다.
  const s = city();
  s.complaints.push({ key: 'delay:99', type: 'delay', tile: 0, week: 1 });
  const report = G.sync(s);
  check('없어진 조건은 해결로 센다', [report.gone.length, s.solved], [1, 1]);
  check('목록에서도 빠진다', s.complaints.some((c) => c.key === 'delay:99'), false);
}

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);
