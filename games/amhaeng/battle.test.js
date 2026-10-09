'use strict';

// 실행: node games/amhaeng/battle.test.js
const B = require('./battle.js');

let passed = 0;
let failed = 0;

function check(name, ok) {
  if (ok) passed++;
  else { failed++; console.log(`실패: ${name}`); }
}

// 빈 싸움 하나를 만들고 적을 손으로 놓는다.
function setup(foes, tiles = ['sword', 'bow'], hero = 3, extra = {}) {
  const s = B.create({ waves: [], hp: 8, maxHp: 8, tiles: tiles.map((id) => ({ id })), ...extra });
  s.hero.pos = hero;
  s.over = null;
  for (const [kind, pos, face] of foes) {
    const f = { uid: s.nextUid++, kind, pos, face, hp: 0, maxHp: 0, wind: null, stun: 0, summonIn: 99 };
    f.hp = f.maxHp = require('./data.js').ENEMIES[kind].hp;
    s.foes.push(f);
  }
  return s;
}

{
  const s = setup([['bandit', 4, -1]]);
  check('적이 닿으면 준비한다', B.act(s, { type: 'wait' }) && s.foes[0].wind && s.foes[0].wind.left === 2);
  check('위험한 칸이 보인다', B.danger(s).get(3).left === 2);
  B.act(s, { type: 'wait' });
  B.act(s, { type: 'move', dir: -1 });
  check('비키면 헛친다', s.hero.hp === 8 && !s.foes[0].wind);
}
{
  const s = setup([['bandit', 4, -1]]);
  B.act(s, { type: 'wait' });
  B.act(s, { type: 'wait' });
  B.act(s, { type: 'wait' });
  check('안 비키면 맞는다', s.hero.hp === 7);
}
{
  const s = setup([['bandit', 4, -1]]);
  check('쌓기는 한 수', B.act(s, { type: 'queue', index: 0 }) && s.queue.length === 1);
  check('같은 패는 두 번 못 쌓는다', !B.canQueue(s, 0));
  check('미리보기: 앞 칸', B.preview(s).cells.has(4));
  B.act(s, { type: 'unleash' });
  check('환도는 2 피해', s.foes[0].hp === 1);
  check('쓴 패는 기다린다', s.tiles[0].cd === 2 && !B.canQueue(s, 0));
}
{
  // 등 뒤의 적은 못 친다 — 바라보는 쪽으로만.
  const s = setup([['bandit', 2, 1]]);
  B.act(s, { type: 'queue', index: 0 });
  B.act(s, { type: 'unleash' });
  check('뒤는 못 친다', s.foes[0].hp === 3);
}
{
  // 각궁은 앞쪽 처음 만나는 적.
  const s = setup([['bandit', 5, -1], ['archer', 6, -1]]);
  B.act(s, { type: 'queue', index: 1 });
  B.act(s, { type: 'unleash' });
  check('활은 가까운 적부터', s.foes.find((f) => f.kind === 'bandit').hp === 2 && s.foes.find((f) => f.kind === 'archer').hp === 2);
}
{
  // 적의 공격은 제 편도 맞힌다: 창 산적이 앞의 산적 너머 어사를 노릴 때.
  const s = setup([['spearman', 1, 1], ['bandit', 2, 1]], ['sword'], 3);
  for (let k = 0; k < 3; k++) B.act(s, { type: 'wait' });
  const bandit = s.foes.find((f) => f.kind === 'bandit');
  check('제 편을 친다', bandit.hp === 2);
}
{
  // 방패: 앞에서 오는 피해 -1.
  const s = setup([['guard', 4, -1]]);
  B.act(s, { type: 'queue', index: 0 });
  B.act(s, { type: 'unleash' });
  check('방패가 줄인다', s.foes[0].hp === 3);
}
{
  // 축지법: 넘어가서 돌아선다. 이어 쌓은 환도는 그 적을 등 뒤에서 친다(방패 무시).
  const s = setup([['guard', 4, -1]], ['dash', 'sword']);
  B.act(s, { type: 'queue', index: 0 });
  B.act(s, { type: 'queue', index: 1 });
  check('미리보기에 축지법 뒤 자리가 들어간다', B.preview(s).hero.pos === 5 && B.preview(s).cells.has(4));
  B.act(s, { type: 'unleash' });
  check('넘어가 돌아선다', s.hero.pos === 5 && s.hero.face === -1);
  check('등 뒤라 방패가 안 막는다', s.foes[0].hp === 2);
}
{
  // 택견: 밀어내고, 막히면 둘 다 아프다.
  const s = setup([['bandit', 4, -1], ['bandit', 5, -1]], ['kick']);
  B.act(s, { type: 'queue', index: 0 });
  B.act(s, { type: 'unleash' });
  check('막히면 둘 다 1 피해', s.foes.every((f) => f.hp === 2));
}
{
  // 부적: 묶인 적은 준비가 멈춘다.
  const s = setup([['bandit', 4, -1]], ['charm']);
  B.act(s, { type: 'wait' });
  B.act(s, { type: 'queue', index: 0 });
  B.act(s, { type: 'unleash' });
  const left = s.foes[0].wind.left;
  B.act(s, { type: 'wait' });
  check('묶이면 준비가 멈춘다', s.foes[0].wind.left === left);
  check('묶인 동안 안 맞는다', s.hero.hp === 8);
}
{
  // 두루마기: 첫 공격 하나를 막는다.
  const s = setup([['bandit', 4, -1]], ['sword'], 3, { blessings: ['robe'] });
  for (let k = 0; k < 3; k++) B.act(s, { type: 'wait' });
  check('두루마기가 막는다', s.hero.hp === 8 && !s.hero.ward);
}
{
  // 물귀신은 끌어당긴다.
  const s = setup([['mulgwisin', 0, 1]], ['sword'], 4);
  for (let k = 0; k < 3; k++) B.act(s, { type: 'wait' });
  check('끌려간다', s.hero.pos === 1 && s.hero.hp === 7);
}
{
  // 구미호는 닿지 않으면 등 뒤로 간다.
  const s = setup([['gumiho', 0, 1]], ['sword'], 4);
  B.act(s, { type: 'wait' });
  check('등 뒤로 옮긴다', s.foes[0].pos === 3 && s.foes[0].face === 1);
}
{
  // 우두머리는 곁에 졸개가 넉넉하면 부르지 않는다.
  const s = setup([['chief', 0, 1], ['bandit', 6, -1]], ['sword'], 3);
  s.foes[0].summonIn = 1;
  B.act(s, { type: 'wait' });
  check('졸개가 차 있으면 안 부른다', s.foes.length === 2);
  s.foes.splice(1, 1);
  B.act(s, { type: 'wait' });
  check('자리가 나면 부른다', s.foes.length === 2);
}
{
  // 끝: 적과 남은 물결이 없으면 이긴다.
  const s = B.create({ waves: [[0, 'bandit']], hp: 8, maxHp: 8, tiles: [{ id: 'sword', lv: 2 }] });
  s.foes[0].pos = s.hero.pos + 1;
  B.act(s, { type: 'queue', index: 0 });
  B.act(s, { type: 'unleash' });
  check('벼린 환도로 한 번에', s.over === 'win');
  check('할 수 없는 수는 거절', !B.act(s, { type: 'wait' }));
}
{
  // 같은 판, 같은 수 → 같은 결과.
  const play = () => {
    const s = B.create({ waves: [[0, 'bandit'], [2, 'spearman'], [4, 'archer']], hp: 8, maxHp: 8, tiles: [{ id: 'sword' }, { id: 'bow' }] });
    const moves = ['wait', 'queue', 'unleash', 'turn', 'wait', 'queue', 'unleash', 'wait'];
    moves.forEach((m, k) => B.act(s, m === 'queue' ? { type: 'queue', index: k % 2 } : { type: m }));
    return JSON.stringify([s.hero, s.foes]);
  };
  check('싸움에는 운이 없다', play() === play());
}

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);
