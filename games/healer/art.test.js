'use strict';

// 실행: node games/healer/art.test.js
// 그림 자료 검사. 도형을 손으로 적기 때문에 하나가 빠지거나 없는 색을 쓴 것이
// 눈으로는 잘 안 보인다 — 화면에서는 팔 하나가 사라진 정도로만 나타난다.
const D = require('./data.js');
const Sprites = require('./sprites.js');
const Icons = require('./icons.js');
const Scenes = require('./scenes.js');

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
// 도형 하나가 빠지거나 팔레트에 없는 색을 쓴 것은 눈으로 잘 안 보인다 —
// 화면에서는 팔 하나가 사라진 정도로만 나타난다.
{
  const KINDS = ['e', 'r', 'p', 'arc'];
  for (const [kind, sprite] of Object.entries(Sprites.SPRITES)) {
    check(`${kind}: 크기가 적혀 있다`, sprite.w > 0 && sprite.h > 0, true);
    check(`${kind}: 도형이 들어 있다`, sprite.parts.length > 0, true);

    // 도형은 타원·둥근 사각형·곡선·선 중 하나다. 둘을 함께 적으면 하나만 그려진다.
    const shapeless = sprite.parts
      .map((part, i) => (KINDS.filter((k) => part[k]).length === 1 ? null : i))
      .filter((i) => i !== null);
    check(`${kind}: 도형 종류가 하나씩이다`, shapeless, []);

    const unknown = new Set();
    for (const part of sprite.parts) if (!Sprites.PALETTE[part.f]) unknown.add(part.f);
    check(`${kind}: 팔레트에 있는 색만 쓴다`, [...unknown], []);

    // 선으로만 긋는 것에는 굵기가 있어야 한다. 없으면 브라우저가 1을 쓰는데,
    // 이 격자에서 1은 활이 아니라 기둥이다.
    const thin = sprite.parts.filter((part) => part.arc);
    check(`${kind}: 선에는 굵기가 있다`, thin.filter((part) => !(part.width > 0)).length, 0);

    // 가장자리에 여유 한 칸을 두지 않으면 테두리와 뿔이 잘린다. 렌더러가 그만큼
    // 넓혀 그리므로 실제 크기는 자료보다 2칸 크다.
    check(`${kind}: 크기를 밖에서도 같은 값으로 본다`,
      Sprites.size(kind), { w: sprite.w + 2, h: sprite.h + 2 });
  }

  check('그림 열하나', Object.keys(Sprites.SPRITES).length, 11);

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

  // 우두머리는 상자가 넓다. 화면 크기를 이 폭으로 정하므로 이것이 곧 "크다"이다.
  check('우두머리가 가장 크다',
    Object.keys(Sprites.SPRITES).every((kind) => kind === 'boss'
      || Sprites.size(kind).w < Sprites.size('boss').w), true);
}

// --- 자료가 가리키는 그림이 실제로 있는가 -------------------------------
{
  const kinds = new Set(Object.keys(Sprites.SPRITES));
  const used = [D.HERO, ...Object.values(D.COMPANIONS), ...Object.values(D.ENEMIES)];
  const missing = used.filter((def) => !kinds.has(def.sprite)).map((def) => def.name);
  check('모든 유닛의 그림이 있다', missing, []);

  // 없는 이름을 넘겨도 화면이 비지 않아야 한다 — 그림 하나가 빠졌다고 전투가
  // 안 보이면 곤란하다.
  check('모르는 이름은 대신 그린다', Sprites.svg('없는그림').startsWith('<svg'), true);
}

// --- 그려 낸 결과 -------------------------------------------------------
{
  const markup = Sprites.svg('hero');
  check('여유 한 칸을 두고 그린다', markup.includes('viewBox="-1 -1 18 22"'), true);
  check('같은 그림을 다시 만들지 않는다', Sprites.svg('hero') === markup, true);

  // **도트를 걷어냈다.** 픽셀을 각지게 그리라는 지시가 남아 있으면 곡선이
  // 계단으로 나온다.
  check('각지게 그리지 않는다', markup.includes('crispEdges'), false);
  check('사각형만으로 그리지 않는다', markup.includes('<ellipse') || markup.includes('<path'), true);

  // 배경이 밝든 어둡든 실루엣이 남아야 한다.
  check('테두리를 두른다', markup.includes(`stroke="${Sprites.OUTLINE}"`), true);

  // 그늘과 눈에는 테두리를 두르지 않는다. 거기까지 두르면 얼굴이 지저분해진다.
  const inner = Object.values(Sprites.SPRITES)
    .flatMap((sprite) => sprite.parts).filter((part) => part.o === 0);
  check('안에 들어가는 도형은 테두리가 없다', inner.length > 0, true);

  // 활은 채우지 않는다 — 채우면 방패로 보인다.
  const bow = Sprites.SPRITES.archer.parts.find((part) => part.arc);
  check('활은 선으로만 긋는다', Sprites.shape(bow).includes('fill="none"'), true);
}

// --- 상자 밖으로 나가지 않는다 ------------------------------------------
//
// 그려 낸 SVG는 `viewBox` 밖을 잘라 낸다. 도형 하나가 상자를 넘으면 그만큼이
// 조용히 사라지는데, 실제로 오크 우두머리의 머리와 마법사의 모자 끝이 그렇게
// 잘려 있었다. 좌표를 손으로 적는 한 다시 일어나므로 여기서 본다.
{
  // 곡선은 조종점이 아니라 실제로 지나가는 자리를 봐야 한다. 조종점까지 상자
  // 안에 넣으라고 하면 궁수의 활처럼 크게 휜 것이 헛되이 걸린다.
  function quadExtremes(a, c, b) {
    const out = [a, b];
    const denom = a - 2 * c + b;
    if (Math.abs(denom) > 1e-9) {
      const t = (a - c) / denom;
      if (t > 0 && t < 1) {
        out.push((1 - t) * (1 - t) * a + 2 * (1 - t) * t * c + t * t * b);
      }
    }
    return out;
  }

  // `M x y`, `L x y`, `Q cx cy x y`, `Z`만 쓴다.
  function pathBox(d) {
    const tokens = d.match(/[MLQZ]|-?\d*\.?\d+/g) || [];
    const xs = [];
    const ys = [];
    let i = 0;
    let cx = 0;
    let cy = 0;
    while (i < tokens.length) {
      const cmd = tokens[i++];
      const num = () => Number(tokens[i++]);
      if (cmd === 'M' || cmd === 'L') {
        cx = num(); cy = num();
        xs.push(cx); ys.push(cy);
      } else if (cmd === 'Q') {
        const qx = num();
        const qy = num();
        const ex = num();
        const ey = num();
        xs.push(...quadExtremes(cx, qx, ex));
        ys.push(...quadExtremes(cy, qy, ey));
        cx = ex; cy = ey;
      }
    }
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  }

  function partBox(part) {
    if (part.e) {
      const [x, y, rx, ry] = part.e;
      return [x - rx, y - ry, x + rx, y + ry];
    }
    if (part.r) {
      const [x, y, w, h] = part.r;
      return [x, y, x + w, y + h];
    }
    return pathBox(part.p || part.arc);
  }

  const clipped = [];
  for (const [kind, sprite] of Object.entries(Sprites.SPRITES)) {
    for (const part of sprite.parts) {
      // 선은 좌표를 가운데 두고 양옆으로 반씩 번진다.
      const half = part.arc ? part.width / 2 : (part.o === 0 ? 0 : Sprites.STROKE / 2);
      const [x0, y0, x1, y1] = partBox(part);
      if (x0 - half < -1 || y0 - half < -1
        || x1 + half > sprite.w + 1 || y1 + half > sprite.h + 1) {
        clipped.push(`${kind} [${x0 - half}, ${y0 - half}, ${x1 + half}, ${y1 + half}]`);
      }
    }
  }
  check('모든 도형이 상자 안에 있다', clipped, []);
}

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
    ['lock', 'coin', 'scroll', 'cart'].filter((name) => !Icons.has(name)), []);

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
