'use strict';

// 실행: node games/healer/art.test.js
// 그림 자료 검사. 픽셀을 글자로 찍기 때문에 한 칸이 밀리거나 없는 색을 쓴 것이
// 눈으로는 잘 안 보인다 — 화면에서는 팔 하나가 사라진 정도로만 나타난다.
const D = require('./data.js');
const Sprites = require('./sprites.js');
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

// --- 픽셀 자료 ----------------------------------------------------------
{
  for (const [kind, rows] of Object.entries(Sprites.SPRITES)) {
    const width = rows[0].length;
    const ragged = rows.map((row, i) => (row.length === width ? null : i)).filter((i) => i !== null);
    check(`${kind}: 모든 줄의 길이가 같다`, ragged, []);

    const unknown = new Set();
    for (const row of rows) {
      for (const ch of row) if (ch !== '.' && !Sprites.PALETTE[ch]) unknown.add(ch);
    }
    check(`${kind}: 팔레트에 있는 색만 쓴다`, [...unknown], []);

    // 가장자리에 여유 한 칸을 두지 않으면 테두리가 잘린다. 렌더러가 그만큼
    // 넓혀 그리므로 실제 크기는 자료보다 2칸 크다.
    check(`${kind}: 크기를 밖에서도 같은 값으로 본다`,
      Sprites.size(kind), { w: width + 2, h: rows.length + 2 });
  }

  check('그림 아홉 개', Object.keys(Sprites.SPRITES).length, 9);
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
  check('테두리 몫으로 한 칸씩 넓다', markup.includes('viewBox="-1 -1 18 22"'), true);
  check('픽셀이 뭉개지지 않게 그린다', markup.includes('shape-rendering="crispEdges"'), true);
  check('같은 그림을 다시 만들지 않는다', Sprites.svg('hero') === markup, true);

  // 얇은 선은 테두리를 두르지 않는다. 활시위 색이 세 칸으로 부풀면 활이
  // 막대로 보인다.
  const bowRow = Sprites.SPRITES.ranged.find((row) => row.includes('i'));
  check('활시위는 한 칸짜리 선이다', bowRow.split('i').length - 1, 1);
}

// --- 배경 --------------------------------------------------------------
{
  for (const quest of D.QUESTS) {
    check(`${quest.name}: 장소가 정해져 있다`, Boolean(Scenes.SCENES[quest.scene]), true);
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
