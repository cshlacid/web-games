'use strict';

// 실행: node games/healer/art.test.js
// 그림 자료 검사. 도형을 손으로 적기 때문에 하나가 빠지거나 없는 색을 쓴 것이
// 눈으로는 잘 안 보인다 — 화면에서는 팔 하나가 사라진 정도로만 나타난다.
const D = require('./data.js');
const Sprites = require('./sprites.js');
const Icons = require('./icons.js');
const Scenes = require('./scenes.js');
const L = require('./logic.js');

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

// --- 그림 자료 ----------------------------------------------------------
//
// 도형을 손으로 적던 때에는 도형 하나가 빠지거나 팔레트에 없는 색을 쓴 것을
// 여기서 봤다. **지금은 전부 구운 그림 파일이라 그 검사가 통째로 사라졌다** —
// 자료를 손으로 적는 자리가 없어졌기 때문이고, 대신 시트가 서로 어긋나지
// 않는지(칸·프레임 수·크기 사다리)를 본다.
{
  // 열일곱 전부가 시안을 구운 그림 파일이다. 도형은 하나도 남지 않았다.
  check('그림 파일 열일곱', Object.keys(Sprites.SHEETS).length, 17);

  // **한 그림을 두 시트가 나눠 쓰지 않는다.** 성기사가 제 시안이 없어 수호자
  // 것을 빌리던 동안에는 여기에 그 한 쌍을 못 박아 두었다 — 편성 화면에서 둘을
  // 이름으로만 갈라야 했기 때문이다. 시안이 오면서 그 자리가 없어졌고, 다시
  // 빌리는 일이 생기면 여기서 걸린다.
  const byFile = {};
  for (const [kind, sheet] of Object.entries(Sprites.SHEETS)) {
    (byFile[sheet.src] = byFile[sheet.src] || []).push(kind);
  }
  check('그림을 나눠 쓰는 시트가 없다',
    Object.values(byFile).filter((list) => list.length > 1), []);

  // **시트가 저마다 성립해야 한다.** 칸·줄·프레임 수가 어긋나면 화면에서는
  // 엉뚱한 칸이 잘려 나오거나 프레임이 사라진다.
  for (const [kind, sheet] of Object.entries(Sprites.SHEETS)) {
    check(`${kind}: 칸 크기가 적혀 있다`, sheet.cell.w > 0 && sheet.cell.h > 0, true);
    const over = Object.entries(sheet.clips)
      .filter(([, clip]) => clip.frames > sheet.cols || clip.row >= sheet.rows)
      .map(([name]) => name);
    check(`${kind}: 프레임이 격자 안에 들어간다`, over, []);
    const bad = Object.entries(sheet.crops)
      .filter(([, c]) => c.x < 0 || c.y < 0 || c.x + c.w > 1.001 || c.y + c.h > 1.001)
      .map(([name]) => name);
    check(`${kind}: 잘라 내는 자리가 칸 안이다`, bad, []);
  }

  // **계열마다 제 그림이 있어야 한다.** 궁수와 마법사가 같은 그림을 쓰던 때에는
  // 편성 화면에서 이름을 읽어야 어느 쪽인지 알 수 있었고, 전장에서는 아예
  // 구별할 수 없었다.
  const specs = new Set(Object.values(D.COMPANIONS).map((def) => def.spec));
  const shared = [];
  for (const spec of specs) {
    const pics = new Set(Object.values(D.COMPANIONS)
      .filter((def) => def.spec === spec).map((def) => def.sprite));
    if (pics.size !== 1) shared.push(`${spec}: ${[...pics].join('/')}`);
  }
  check('한 계열은 한 그림을 쓴다', shared, []);

  const byPic = {};
  for (const def of Object.values(D.COMPANIONS)) {
    (byPic[def.sprite] = byPic[def.sprite] || new Set()).add(def.spec);
  }
  check('한 그림을 두 계열이 나눠 쓰지 않는다',
    Object.entries(byPic).filter(([, set]) => set.size > 1).map(([pic]) => pic), []);

  // **적은 등급 순으로 커야 한다.** 상자 폭으로 견주던 검사를 여기로 옮겼다 —
  // 그쪽은 무기가 좌우로 흔들리는 폭까지 재서, 지팡이를 든 쪽이 덩치와 무관하게
  // 넓게 나온다. 지금은 인물 키로 잰다: 그림 파일은 `box`에서 칸의 빈자리를 덜어
  // 낸 값(시안끼리 맞춘 인물 키 76px), 도형은 상자 높이 그대로다.
  const personH = (kind) => {
    const sheet = Sprites.SHEETS[kind];
    return sheet ? (sheet.box * 76) / sheet.cell.h : Sprites.size(kind).h;
  };
  const ladder = ['goblin', 'orc', 'ogre', 'chief'];
  check('적은 등급 순으로 커진다',
    ladder.every((kind, i) => i === 0 || personH(kind) > personH(ladder[i - 1])), true);
  // 같은 종족·같은 등급인 둘은 키가 같아야 한다. 크기로 읽히는 것은 등급이지
  // 계열이 아니다.
  check('오크 전사와 오크 주술사는 키가 같다',
    Math.abs(personH('orc') - personH('hexer')) < 0.5, true);
  // 좀비는 사람 크기의 시체라 고블린보다 크지만, 잡졸이므로 정예를 넘지 않는다.
  check('좀비는 고블린보다 크고 오크보다 작다',
    personH('goblin') < personH('zombie') && personH('zombie') < personH('orc'), true);
  // 구울은 좀비를 갈아 끼우는 자리라 조금 크다. 같은 잡졸이므로 정예는 넘지 않는다.
  check('구울은 좀비보다 크고 오크보다 작다',
    personH('zombie') < personH('ghoul') && personH('ghoul') < personH('orc'), true);
}

// --- 자료가 가리키는 그림이 실제로 있는가 -------------------------------
{
  const kinds = new Set(Object.keys(Sprites.SHEETS));
  const used = [D.HERO, ...Object.values(D.COMPANIONS), ...Object.values(D.ENEMIES)];
  const missing = used.filter((def) => !kinds.has(def.sprite)).map((def) => def.name);
  check('모든 유닛의 그림이 있다', missing, []);

  // **대신 그릴 것이 없다.** 도형 렌더러를 걷어내면서 모르는 이름은 빈 상자가
  // 되므로, 위의 검사가 그만큼 더 중요해졌다 — 자료에 적힌 이름이 곧 파일이다.
  check('모르는 이름에는 시트가 없다', Sprites.sheet('없는그림'), null);
}

// **정의에 적힌 그림 이름과 계열 이름은 같지 않다.** 계열에서 그림을 지어내던
// 때에는 고블린(계열 `grunt`)이 전사로, 주인공(계열 `priest`)이 사제로 그려졌다.
// 계열에서 그림을 만드는 것은 계열을 바꾼 동료뿐이므로, 그때 나올 이름이 전부
// 실제로 있는 그림인지 여기서 본다.
{
  const D2 = require('./data.js');
  const kinds = new Set(Object.keys(Sprites.SHEETS));
  const swap = [];
  for (const list of Object.values(D2.SPEC_CHOICES)) {
    for (const spec of list) {
      for (const at of [spec, D2.specAt(spec, D2.SPEC_UP_LEVEL)]) {
        if (!kinds.has(D2.spriteFor(at))) swap.push(at);
      }
    }
  }
  check('계열을 바꿔도 나올 그림이 다 있다', swap, []);
}

// --- 그림 파일로 그리는 유닛 --------------------------------------------
//
// 주인공만 시안을 그대로 쓴다. 도형과 달리 자료를 눈으로 훑어 틀린 곳을 찾을 수
// 없으므로, 격자와 프레임 수가 서로 맞는지를 여기서 본다.
{
  const fs = require('fs');
  for (const [kind, s] of Object.entries(Sprites.SHEETS)) {
    check(`${kind}: 그림 파일이 있다`, fs.existsSync(`${__dirname}/${s.src}`), true);
    check(`${kind}: 격자가 적혀 있다`, s.cols > 0 && s.rows > 0 && s.cell.w > 0 && s.cell.h > 0, true);

    // 줄 번호가 격자를 넘으면 엉뚱한 칸이 나온다. 화면에서는 반쯤 잘린 인물로 보인다.
    const bad = Object.entries(s.clips)
      .filter(([, c]) => c.row >= s.rows || c.frames > s.cols || c.frames < 1)
      .map(([name]) => name);
    check(`${kind}: 모든 동작이 격자 안에 있다`, bad, []);

    // 줄이 겹치면 두 동작이 같은 그림을 쓴다.
    const rows = Object.values(s.clips).map((c) => c.row);
    check(`${kind}: 동작마다 제 줄을 쓴다`, new Set(rows).size, rows.length);

    // 서 있는 자세만 한 장이고 나머지는 여러 장이다. 한 장짜리 걷기는 걷지 않는다.
    check(`${kind}: 걷기는 여러 장이다`,
      s.clips.walkRight.frames > 1 && s.clips.walkLeft.frames > 1, true);
    check(`${kind}: 좌우 걷기가 따로 있다`,
      s.clips.walkRight.row !== s.clips.walkLeft.row, true);
    // 공격은 한 번만 돈다. 반복하면 때리지 않는 동안에도 계속 휘두른다.
    check(`${kind}: 공격은 한 번만 돈다`, Boolean(s.clips.attack.once), true);

    // 잘라 쓰는 자리가 칸 밖으로 나가면 옆 칸이 딸려 들어온다 — 초상화에
    // 남의 지팡이가 걸린다.
    const outside = Object.entries(s.crops)
      .filter(([, c]) => c.w <= 0 || c.h <= 0 || c.x < 0 || c.y < 0
        || c.x + c.w > 1 || c.y + c.h > 1)
      .map(([name]) => name);
    check(`${kind}: 자르는 자리가 칸 안이다`, outside, []);

    // 전장은 칸을 통째로 쓴다. 여기를 좁히면 걷기·공격에서 뻗은 팔이 잘린다.
    check(`${kind}: 전장은 칸 전체다`,
      [s.crops.full.x, s.crops.full.y, s.crops.full.w, s.crops.full.h], [0, 0, 1, 1]);

    // 초상화는 머리만 보여 준다. 전신보다 좁고 짧지 않으면 얼굴이 아니라 사람이
    // 들어가 있는 것이다.
    check(`${kind}: 초상화가 전신보다 좁다`,
      s.crops.head.w < s.crops.list.w && s.crops.head.h < s.crops.list.h, true);
    // 머리는 칸 위쪽에 있다. 아래 절반까지 잡으면 몸통이 따라 들어온다. 문턱이
    // 반이 아니라 0.7인 것은 SD 비율이라 머리가 키의 삼분의 일을 넘기 때문이다.
    check(`${kind}: 초상화가 칸 위쪽이다`, s.crops.head.y + s.crops.head.h <= 0.7, true);

    // 상자는 칸의 가로세로비에서 나온다. 여기가 어긋나면 인물이 납작해진다.
    const box = Sprites.size(kind);
    check(`${kind}: 상자가 칸의 비율이다`,
      Math.abs(box.w / box.h - s.cell.w / s.cell.h) < 0.01, true);
  }
}

// --- 상자 밖으로 나가지 않는다 ------------------------------------------
//

// --- 스킬도 눈으로 갈린다 -----------------------------------------------
//
// 아이콘이 "어떤 스킬인가"를, 색이 "무엇을 하는가"를 알린다. 둘 중 하나만으로는
// 서른 몇 개를 훑을 수 없다.
{
  const all = Object.values(D.UNIT_SKILLS);
  check('모든 스킬에 아이콘이 있다',
    all.filter((def) => !def.icon).map((def) => def.id), []);
  check('주인공 스킬도 마찬가지',
    Object.values(D.PLAYER_SKILLS).filter((def) => !def.icon).map((def) => def.id), []);

  // 한 계열 안에서 아이콘이 겹치면 넷을 훑는 뜻이 없다.
  const clash = [];
  for (const [spec, list] of Object.entries(D.SPEC_SKILLS)) {
    const icons = list.map((id) => D.UNIT_SKILLS[id].icon);
    if (new Set(icons).size !== icons.length) clash.push(spec);
  }
  check('한 계열 안에서 아이콘이 겹치지 않는다', clash, []);

  // 계열끼리도 겹치지 않아야 "마법사가 쓴 것"과 "궁수가 쓴 것"이 갈린다.
  const icons = all.map((def) => def.icon);
  const dupes = icons.filter((icon, i) => icons.indexOf(icon) !== i);
  check('스킬끼리 아이콘이 겹치지 않는다', [...new Set(dupes)], []);

  // 색은 종류에서 온다. 적어 두지 않은 종류가 있으면 그 스킬만 공격 색이 된다.
  const kinds = new Set(all.concat(Object.values(D.PLAYER_SKILLS)).map((def) => def.kind));
  check('모든 종류에 색이 정해져 있다',
    [...kinds].filter((kind) => !D.SKILL_KINDS[kind]), []);
  check('회복과 공격의 색이 다르다',
    D.skillKind({ kind: 'heal' }).css === D.skillKind({ kind: 'damage' }).css, false);
  check('도발은 또 다른 색이다',
    new Set(['heal', 'damage', 'taunt', 'mana'].map((k) => D.skillKind({ kind: k }).css)).size, 4);
}

// --- 아이콘도 도형으로 그린다 -------------------------------------------
//
// 예전에는 이모지 한 글자였다. 글꼴이 그리는 그림이라 기기마다 모양과 크기와
// 색이 달랐고, 무엇보다 제 색을 들고 와서 "색이 무엇을 하는가를 알린다"는
// 규칙을 깼다. 지금은 `icons.js`가 경로로 그리고 색은 놓인 자리가 정한다.
{
  const tables = {
    UNIT_SKILLS: D.UNIT_SKILLS, PLAYER_SKILLS: D.PLAYER_SKILLS,
    GEAR: D.GEAR, MATERIALS: D.MATERIALS, POTIONS: D.POTIONS,
  };
  const missing = [];
  for (const [name, table] of Object.entries(tables)) {
    for (const def of Object.values(table)) {
      if (!Icons.has(def.icon)) missing.push(`${name}.${def.id}`);
    }
  }
  check('적어 둔 아이콘이 전부 그려져 있다', missing, []);

  // 화면이 이름만 보고 부르는 것들. 자료에 없으므로 여기서 따로 챙긴다.
  check('화면이 쓰는 아이콘도 있다',
    ['lock', 'coin', 'scroll', 'cart', 'crest', 'trust', 'gift']
      .filter((name) => !Icons.has(name)), []);

  // 초상화에 붙는 상태 표시. 하나라도 빠지면 그 자리만 대신 그린 동그라미가 되어
  // 지속 피해와 기절이 같은 그림으로 보인다.
  check('상태 표시 아이콘이 전부 그려져 있다',
    Object.values(L.STATUS_KINDS).map((st) => st.icon).filter((name) => !Icons.has(name)), []);
  const statusIcons = Object.values(L.STATUS_KINDS).map((st) => st.icon);
  check('상태끼리 같은 그림을 쓰지 않는다',
    statusIcons.filter((name, i) => statusIcons.indexOf(name) !== i), []);

  // 이모지가 남아 있으면 그 자리만 글꼴이 그린다.
  const emoji = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u;
  const stray = [];
  for (const [name, table] of Object.entries(tables)) {
    for (const def of Object.values(table)) {
      if (emoji.test(def.icon)) stray.push(`${name}.${def.id}`);
    }
  }
  check('이모지가 남아 있지 않다', stray, []);

  // 색은 아이콘이 아니라 놓인 자리가 정한다. 경로에 색을 박아 두면 스킬 종류
  // 색이 걸리지 않는다.
  const painted = Object.keys(Icons.ICONS)
    .filter((name) => /(fill|stroke)="(?!none|currentColor)/.test(Icons.svg(name)));
  check('아이콘은 제 색을 갖지 않는다', painted, []);

  // 24칸 격자를 넘으면 그만큼 잘린다. 도형 그림과 같은 이유다.
  const outside = [];
  for (const [name, parts] of Object.entries(Icons.ICONS)) {
    for (const part of parts) {
      const nums = (part.c || (part.d.match(/-?\d*\.?\d+/g) || []).map(Number));
      if (nums.some((n) => n < -1 || n > Icons.BOX + 1)) outside.push(name);
    }
  }
  check('아이콘이 격자를 크게 벗어나지 않는다', [...new Set(outside)], []);

  // 모르는 이름이 와도 화면이 비면 안 된다 — 아이콘 하나가 빠졌다고 스킬을
  // 못 누르게 되면 곤란하다.
  check('모르는 이름은 대신 그린다', Icons.svg('없는아이콘').startsWith('<svg'), true);
  check('같은 아이콘을 다시 만들지 않는다', Icons.svg('mend') === Icons.svg('mend'), true);
}

// --- 배경 --------------------------------------------------------------
{
  for (const region of Object.values(D.REGIONS)) {
    check(`${region.name}: 장소가 정해져 있다`, Boolean(Scenes.SCENES[region.scene]), true);
  }

  for (const id of Object.keys(Scenes.SCENES)) {
    const markup = Scenes.svg(id, 3);
    check(`${id}: 전장 격자와 같은 좌표계로 그린다`,
      markup.includes(`viewBox="0 0 ${D.FIELD.w} ${D.FIELD.h}"`), true);
    // 화면 비율이 격자와 같아 늘여도 되지만, 한 픽셀 어긋날 때 여백을 남기지
    // 않으려면 비율 유지를 꺼야 한다.
    check(`${id}: 전장을 빈틈없이 채운다`, markup.includes('preserveAspectRatio="none"'), true);
    check(`${id}: 같은 씨앗이면 같은 배경`, Scenes.svg(id, 3), markup);
    check(`${id}: 씨앗이 다르면 달라진다`, Scenes.svg(id, 4) === markup, false);
  }

  // 벽과 바닥의 경계가 유닛이 서는 자리보다 위에 있어야 뒤쪽 유닛이 벽에
  // 붙어 선 것처럼 보이지 않는다.
  check('지평선이 유닛 위쪽 한계보다 높다', Scenes.HORIZON < 15, true);
}

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);
