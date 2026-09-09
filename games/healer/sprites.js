'use strict';

// 캐릭터 그림. **전부 사람이 그린 시안을 구운 그림 파일이다**(`SHEETS`).
//
// 예전에는 저장소에 이미지를 들이지 않으려고 SVG 도형으로 직접 그렸고, 시안이
// 오는 대로 하나씩 갈아 끼웠다. 고블린 주술사를 마지막으로 도형이 하나도 남지
// 않아 **도형 렌더러를 통째로 걷어냈다** — 자료가 없는 렌더러는 살아 있는 것처럼
// 보이기만 하고, 화면이 분기를 한 번 놓치면 빈 그림이 나온다. 도형으로 돌아갈
// 일이 생기면 git 이력에서 꺼낸다.
(function (root) {

const SHEETS = {
  hero: {
    src: 'hero.png',
    cell: { w: 98, h: 89 },
    cols: 8, rows: 4,
    // **칸을 화면에서 몇 칸 높이로 그릴지.** 다른 그림은 상자가 곧 인물이지만
    // 이 시트는 공격에서 지팡이를 높이 들어 칸 위쪽이 비어 있다 — 22로 두면
    // 인물이 17칸으로 그려져 동료보다 작아 보인다.
    box: 25,
    clips: {
      idle:      { row: 0, frames: 8, fps: 6 },
      walkLeft:  { row: 1, frames: 7, fps: 10 },
      walkRight: { row: 2, frames: 7, fps: 10 },
      attack:    { row: 3, frames: 7, fps: 12, once: 1 },
    },
    // 화면마다 칸의 어디를 보여 줄지(칸 안의 비율). 전장은 칸 전체, 편성 목록은
    // 서 있는 인물, 초상화는 머리만이다.
    // **대기 줄만 뒤집어 구웠다.** 시안의 대기는 정면이고 지팡이를 왼손에 들어
    // 왼쪽을 보는 것으로 읽혔다. 걷기는 좌우가 따로 있고 공격은 오른쪽으로
    // 휘두르므로, 서 있을 때만 적 반대쪽을 보고 있었다.
    crops: {
      full: { x: 0, y: 0, w: 1, h: 1 },
      list: { x: 0.18, y: 0.10, w: 0.68, h: 0.90 },
      head: { x: 0.25, y: 0.08, w: 0.48, h: 0.57 },
    },
  },

  // 수호자. 주인공 다음으로 받은 시안이다. 걷기가 여덟 장이라 주인공(일곱 장)과
  // 프레임 수가 다르지만, 줄마다 몇 장인지는 여기 적혀 있으므로 화면은 모른다.
  tank: {
    src: 'tank.png',
    cell: { w: 92, h: 91 },
    cols: 8, rows: 4,
    // 인물의 키를 주인공과 같은 76픽셀로 맞춰 구웠다. 칸 높이가 달라 상자도
    // 다른 값이어야 화면에서 둘의 키가 같다.
    box: 26,
    clips: {
      idle:      { row: 0, frames: 8, fps: 6 },
      walkLeft:  { row: 1, frames: 8, fps: 10 },
      walkRight: { row: 2, frames: 8, fps: 10 },
      attack:    { row: 3, frames: 8, fps: 12, once: 1 },
    },
    // 주인공과 같은 이유로 대기 줄만 뒤집어 구웠다.
    crops: {
      full: { x: 0, y: 0, w: 1, h: 1 },
      list: { x: 0.15, y: 0.06, w: 0.78, h: 0.92 },
      head: { x: 0.30, y: 0.09, w: 0.44, h: 0.42 },
    },
  },

  // 고블린. 아홉 번째로 받은 시안이자 **처음 받은 적 시안이다.** 그래서 대기와
  // 공격을 뒤집지 않았다 — 적은 파티를 마주 보므로 왼쪽이 맞는 방향이고, 시안이
  // 이미 그쪽을 본다. 걷기는 아군과 같이 왼쪽이 원본, 오른쪽이 뒤집은 것이다.
  //
  // **`box`가 아군보다 크다**(30). 공격에서 도끼를 머리 위로 넘겨 칸이 세로로
  // 길어졌기 때문이고, 그만큼 키워야 화면에서 예전 도형(22칸)과 같은 키가 된다.
  goblin: {
    src: 'goblin.png',
    cell: { w: 98, h: 107 },
    cols: 8, rows: 4,
    box: 30,
    clips: {
      idle:      { row: 0, frames: 8, fps: 6 },
      walkLeft:  { row: 1, frames: 8, fps: 10 },
      walkRight: { row: 2, frames: 8, fps: 10 },
      attack:    { row: 3, frames: 8, fps: 12, once: 1 },
    },
    crops: {
      full: { x: 0, y: 0, w: 1, h: 1 },
      list: { x: 0.07, y: 0.18, w: 0.84, h: 0.80 },
      head: { x: 0.28, y: 0.19, w: 0.50, h: 0.40 },
    },
  },

  // 오크 전사. 열 번째 시안이고 두 번째 적이다. 칸 테두리가 줄마다 세로로 꽉
  // 차 있어 칸 자리를 인물 사이가 아니라 그 선에서 잡았다 — 공격의 붉은 참격이
  // 칸 끝까지 뻗어, 인물 사이의 한가운데로 자르면 참격이 중간에서 잘렸다.
  //
  // **고블린보다 크다**(인물 키가 화면에서 23.6칸, 고블린은 21.3칸). 적의 `box`는
  // 예전 도형과 키를 맞추는 것이 원칙인데 여기서는 그러지 않았다 — 오크 도형은
  // 19.2칸이라 그 값을 지키면 잡졸인 고블린보다 정예인 오크가 작다. 등급이 위협을
  // 정한다는 규칙이 화면에서 먼저 읽히는 자리라, 이쪽을 택했다.
  orc: {
    src: 'orc.png',
    cell: { w: 92, h: 90 },
    cols: 8, rows: 4,
    box: 28,
    clips: {
      idle:      { row: 0, frames: 8, fps: 6 },
      walkLeft:  { row: 1, frames: 8, fps: 10 },
      walkRight: { row: 2, frames: 8, fps: 10 },
      attack:    { row: 3, frames: 8, fps: 12, once: 1 },
    },
    crops: {
      full: { x: 0, y: 0, w: 1, h: 1 },
      list: { x: 0.02, y: 0.02, w: 0.96, h: 0.96 },
      head: { x: 0.19, y: 0.02, w: 0.44, h: 0.46 },
    },
  },

  // 오우거 전사. 열한 번째 시안이고 세 번째 적이다. **오크보다 크다**(인물 키가
  // 화면에서 26.0칸, 오크 23.6칸·고블린 21.3칸). 잡졸→정예→더 무거운 정예로
  // 이어지는 순서를 크기가 그대로 보여 주는 자리다.
  //
  // 칸이 세로로 긴 것은 공격에서 곤봉을 머리 위로 들어 올려서다 — `box`가 34인데
  // 인물이 26인 차이가 그 빈자리다.
  ogre: {
    src: 'ogre.png',
    cell: { w: 98, h: 99 },
    cols: 8, rows: 4,
    box: 34,
    clips: {
      idle:      { row: 0, frames: 8, fps: 6 },
      walkLeft:  { row: 1, frames: 8, fps: 10 },
      walkRight: { row: 2, frames: 8, fps: 10 },
      attack:    { row: 3, frames: 8, fps: 12, once: 1 },
    },
    crops: {
      full: { x: 0, y: 0, w: 1, h: 1 },
      list: { x: 0.08, y: 0.15, w: 0.84, h: 0.84 },
      head: { x: 0.24, y: 0.16, w: 0.44, h: 0.40 },
    },
  },

  // 오크 주술사. 열두 번째 시안이고 네 번째 적이다. **오크 전사와 키를 맞춘다**
  // (인물 23.6칸) — 같은 종족·같은 등급이라 나란히 섰을 때 둘의 크기가 갈릴
  // 이유가 없다. 크기로 읽히는 것은 등급이지 계열이 아니다.
  //
  // **공격이 일곱 장이다.** 여덟째 장은 인물 없이 보라색 마법만 날아가는 장이라
  // 버렸다 — 그대로 두면 때릴 때마다 한 프레임 인물이 사라진다.
  //
  // **고블린 주술사와 그림이 갈렸다.** 둘은 같은 주술사 계열인데 그림 하나를
  // 나눠 쓰고 있었다. 시안이 온 쪽만 그림 파일로 가고 고블린 쪽은 도형에 남는다 —
  // 계열이 아니라 그 개체가 무엇인지가 그림을 정한다.
  hexer: {
    src: 'hexer.png',
    cell: { w: 93, h: 99 },
    cols: 8, rows: 4,
    box: 31,
    clips: {
      idle:      { row: 0, frames: 8, fps: 6 },
      walkLeft:  { row: 1, frames: 8, fps: 10 },
      walkRight: { row: 2, frames: 8, fps: 10 },
      attack:    { row: 3, frames: 7, fps: 12, once: 1 },
    },
    crops: {
      full: { x: 0, y: 0, w: 1, h: 1 },
      list: { x: 0.08, y: 0.02, w: 0.84, h: 0.96 },
      head: { x: 0.34, y: 0.24, w: 0.44, h: 0.40 },
    },
  },

  // 오크 우두머리. 열세 번째 시안이고 마지막 적이다. **모든 그림 중 가장 크다**
  // (인물 28.9칸). 고블린 21.3 → 오크 23.6 → 오우거 26.0 → 우두머리 28.9로,
  // 등급이 크기로 읽힌다 — 고블린만 시안으로 갔던 동안에는 이 순서가 뒤집혀
  // 있었고(도형 우두머리가 21.5칸), 그것을 여기서 되돌린다.
  //
  // 칸이 가로로 넓은 것은(117) 공격에서 도끼를 좌우로 크게 휘둘러서다. 화면
  // 상자도 그만큼 넓지만 인물이 넓은 것은 아니다 — 상자의 절반쯤이 빈자리다.
  chief: {
    src: 'chief.png',
    cell: { w: 117, h: 100 },
    cols: 8, rows: 4,
    box: 38,
    clips: {
      idle:      { row: 0, frames: 8, fps: 6 },
      walkLeft:  { row: 1, frames: 8, fps: 10 },
      walkRight: { row: 2, frames: 8, fps: 10 },
      attack:    { row: 3, frames: 8, fps: 12, once: 1 },
    },
    crops: {
      full: { x: 0, y: 0, w: 1, h: 1 },
      list: { x: 0.10, y: 0.06, w: 0.80, h: 0.94 },
      head: { x: 0.31, y: 0.09, w: 0.34, h: 0.38 },
    },
  },

  // 고블린 주술사. 열네 번째 시안이고 **마지막 도형을 갈아 끼운 자리다.**
  // 고블린 척후병과 키를 맞춘다(인물 21.5칸) — 같은 종족·같은 등급이다.
  //
  // 공격이 일곱 장이다. 여덟째 장은 인물 없이 보라색 해골 불꽃만 남은 장이라
  // 버렸다(오크 주술사와 같다).
  shaman: {
    src: 'shaman.png',
    cell: { w: 95, h: 92 },
    cols: 8, rows: 4,
    box: 26,
    clips: {
      idle:      { row: 0, frames: 8, fps: 6 },
      walkLeft:  { row: 1, frames: 8, fps: 10 },
      walkRight: { row: 2, frames: 8, fps: 10 },
      attack:    { row: 3, frames: 7, fps: 12, once: 1 },
    },
    crops: {
      full: { x: 0, y: 0, w: 1, h: 1 },
      list: { x: 0.08, y: 0.06, w: 0.84, h: 0.94 },
      head: { x: 0.28, y: 0.23, w: 0.40, h: 0.40 },
    },
  },

  // 성기사. **시안을 한 번 갈아 끼웠다** — 처음 것은 다른 캐릭터와 화풍이 맞지
  // 않았다(투구 없는 맨머리에 채색이 밝았다). 지금 것은 투구를 쓰고 있어 얼굴이
  // 보이지 않으므로, **방향은 면갑의 창살과 깃털로 읽는다** — 창살이 앞, 깃털이
  // 뒤다.
  //
  // **세 줄이 다 오른쪽을 보는 시안이라 대기와 공격을 그대로 구웠다.** 아군이
  // 보아야 할 방향이 오른쪽이라 뒤집을 것이 없었고, 걷기만 왼쪽을 만들어 붙였다 —
  // 앞 시안과 정반대다(그쪽은 걷기가 왼쪽이었다).
  paladin: {
    src: 'paladin.png',
    cell: { w: 124, h: 103 },
    cols: 8, rows: 4,
    box: 29,
    clips: {
      idle:      { row: 0, frames: 8, fps: 6 },
      walkLeft:  { row: 1, frames: 8, fps: 10 },
      walkRight: { row: 2, frames: 8, fps: 10 },
      attack:    { row: 3, frames: 8, fps: 12, once: 1 },
    },
    crops: {
      full: { x: 0, y: 0, w: 1, h: 1 },
      list: { x: 0.18, y: 0.18, w: 0.60, h: 0.79 },
      head: { x: 0.36, y: 0.17, w: 0.30, h: 0.36 },
    },
  },

  // 구울. 좀비의 상위 대체다(`ENEMY_UP`). **좀비보다 조금 크다**(인물 23.2칸,
  // 좀비 22.1) — 같은 잡졸이라 정예인 오크(23.6)는 넘지 않는다. 웅크린 자세라
  // 실제 키는 더 커 보이지 않지만, 한 자리를 두 적이 번갈아 채우므로 바뀐 것이
  // 크기로도 읽혀야 한다.
  ghoul: {
    src: 'ghoul.png',
    cell: { w: 97, h: 105 },
    cols: 8, rows: 4,
    box: 32,
    clips: {
      idle:      { row: 0, frames: 8, fps: 6 },
      walkLeft:  { row: 1, frames: 8, fps: 10 },
      walkRight: { row: 2, frames: 8, fps: 10 },
      attack:    { row: 3, frames: 8, fps: 12, once: 1 },
    },
    crops: {
      full: { x: 0, y: 0, w: 1, h: 1 },
      list: { x: 0.15, y: 0.20, w: 0.68, h: 0.80 },
      head: { x: 0.30, y: 0.22, w: 0.34, h: 0.32 },
    },
  },

  // 좀비. 언데드 계열의 첫 적이다. **잡졸인데 고블린보다 크다**(인물 22.1칸,
  // 고블린 21.3·고블린 주술사 21.5). 사람 크기의 시체라 그렇고, 정예인 오크
  // (23.6)보다는 작아 등급 순서는 지켜진다.
  zombie: {
    src: 'zombie.png',
    cell: { w: 99, h: 103 },
    cols: 8, rows: 4,
    box: 30,
    clips: {
      idle:      { row: 0, frames: 8, fps: 6 },
      walkLeft:  { row: 1, frames: 8, fps: 10 },
      walkRight: { row: 2, frames: 8, fps: 10 },
      attack:    { row: 3, frames: 8, fps: 12, once: 1 },
    },
    crops: {
      full: { x: 0, y: 0, w: 1, h: 1 },
      list: { x: 0.15, y: 0.17, w: 0.68, h: 0.83 },
      head: { x: 0.34, y: 0.17, w: 0.38, h: 0.34 },
    },
  },

  // 전사. 여덟 번째로 받은 시안이다. 공격의 붉은 참격이 옆으로 길지만 칸이 다른
  // 시트와 비슷한 것은, 이 시안의 인물이 그만큼 야무지게 서 있기 때문이다.
  warrior: {
    src: 'warrior.png',
    cell: { w: 93, h: 90 },
    cols: 8, rows: 4,
    box: 25,
    clips: {
      idle:      { row: 0, frames: 8, fps: 6 },
      walkLeft:  { row: 1, frames: 8, fps: 10 },
      walkRight: { row: 2, frames: 8, fps: 10 },
      attack:    { row: 3, frames: 8, fps: 12, once: 1 },
    },
    // 앞의 일곱과 같은 이유로 대기 줄만 뒤집어 구웠다.
    crops: {
      full: { x: 0, y: 0, w: 1, h: 1 },
      list: { x: 0.21, y: 0.05, w: 0.60, h: 0.92 },
      head: { x: 0.28, y: 0.06, w: 0.46, h: 0.49 },
    },
  },

  // 사제. 일곱 번째로 받은 시안이다. **주인공과 나란히 서는 그림이라** 둘이 다
  // 흰 로브인데, 주인공은 크림색에 금 장식이고 이쪽은 흰 두건에 푸른 띠다 —
  // 도형이던 때에 색과 머리로 갈랐던 것과 같은 자리다.
  priest: {
    src: 'priest.png',
    cell: { w: 102, h: 89 },
    cols: 8, rows: 4,
    box: 25,
    clips: {
      idle:      { row: 0, frames: 8, fps: 6 },
      walkLeft:  { row: 1, frames: 8, fps: 10 },
      walkRight: { row: 2, frames: 8, fps: 10 },
      attack:    { row: 3, frames: 8, fps: 12, once: 1 },
    },
    // 앞의 여섯과 같은 이유로 대기 줄만 뒤집어 구웠다. 걷기는 시안이 왼쪽만 있어
    // 오른쪽을 뒤집어 만들었다.
    crops: {
      full: { x: 0, y: 0, w: 1, h: 1 },
      list: { x: 0.20, y: 0.04, w: 0.62, h: 0.93 },
      head: { x: 0.28, y: 0.05, w: 0.44, h: 0.50 },
    },
  },

  // 음유시인. 여섯 번째로 받은 시안이다. 공격의 금빛 음표가 옆으로 퍼져 칸이
  // 가로세로 다 넉넉하다 — 마법사·도적과 같은 자리다.
  bard: {
    src: 'bard.png',
    cell: { w: 102, h: 95 },
    cols: 8, rows: 4,
    box: 27,
    clips: {
      idle:      { row: 0, frames: 8, fps: 6 },
      walkLeft:  { row: 1, frames: 8, fps: 10 },
      walkRight: { row: 2, frames: 8, fps: 10 },
      attack:    { row: 3, frames: 8, fps: 12, once: 1 },
    },
    // 앞의 다섯과 같은 이유로 대기 줄만 뒤집어 구웠다. 걷기는 시안이 왼쪽만 있어
    // 오른쪽을 뒤집어 만들었다.
    crops: {
      full: { x: 0, y: 0, w: 1, h: 1 },
      list: { x: 0.23, y: 0.11, w: 0.54, h: 0.88 },
      head: { x: 0.26, y: 0.10, w: 0.50, h: 0.47 },
    },
  },

  // 도적. 다섯 번째로 받은 시안이다. 공격의 붉은 참격이 옆으로 길어 **칸이 가로로
  // 넓다**(101) — 마법사의 푸른 빛과 같은 자리다.
  rogue: {
    src: 'rogue.png',
    cell: { w: 101, h: 88 },
    cols: 8, rows: 4,
    box: 25,
    clips: {
      idle:      { row: 0, frames: 8, fps: 6 },
      walkLeft:  { row: 1, frames: 8, fps: 10 },
      walkRight: { row: 2, frames: 8, fps: 10 },
      attack:    { row: 3, frames: 8, fps: 12, once: 1 },
    },
    // 앞의 넷과 같은 이유로 대기 줄만 뒤집어 구웠다. 걷기는 시안이 왼쪽만 있어
    // 오른쪽을 뒤집어 만들었다 — 마법사와 같고 궁수와 반대다.
    crops: {
      full: { x: 0, y: 0, w: 1, h: 1 },
      list: { x: 0.22, y: 0.06, w: 0.60, h: 0.92 },
      head: { x: 0.28, y: 0.06, w: 0.44, h: 0.48 },
    },
  },

  // 마법사. 네 번째로 받은 시안이다. 이 시안은 **공격에 마법 효과가 함께 그려져
  // 있어** 칸이 세로로 길다(96) — 효과를 빼려고 하면 옷의 남색과 갈리지 않아 몸에
  // 구멍이 나고, 넣어도 궁수의 화살처럼 멀리 날아가지는 않는다. `box`가 27인 것이
  // 그 몫이다: 칸이 커진 만큼 키워야 화면에서 넷의 키가 같다.
  mage: {
    src: 'mage.png',
    cell: { w: 84, h: 96 },
    cols: 8, rows: 4,
    box: 27,
    clips: {
      idle:      { row: 0, frames: 8, fps: 6 },
      walkLeft:  { row: 1, frames: 8, fps: 10 },
      walkRight: { row: 2, frames: 8, fps: 10 },
      // **빛만 남은 장은 버렸다.** 인물이 없어 공격할 때마다 마법사가 한 프레임
      // 사라졌다 — 주인공 시안에서도 같은 자리를 버렸다.
      attack:    { row: 3, frames: 7, fps: 12, once: 1 },
    },
    // 앞의 셋과 같은 이유로 대기 줄만 뒤집어 구웠다. 걷기는 시안이 왼쪽만 있어
    // 오른쪽을 뒤집어 만들었다 — 궁수와 반대다.
    crops: {
      full: { x: 0, y: 0, w: 1, h: 1 },
      list: { x: 0.13, y: 0.14, w: 0.80, h: 0.84 },
      head: { x: 0.24, y: 0.15, w: 0.52, h: 0.50 },
    },
  },

  // 궁수. 세 번째로 받은 시안이다. 줄이 셋뿐이라(대기·이동·공격) 걷기는 한쪽을
  // 뒤집어 만든다 — 시안이 어느 쪽으로 걷는지는 시안마다 보고 정한다.
  archer: {
    src: 'archer.png',
    cell: { w: 84, h: 87 },
    cols: 8, rows: 4,
    // 인물의 키를 앞의 둘과 같은 76픽셀로 맞춰 구웠다. 칸 높이가 다르므로 상자도
    // 다른 값이어야 화면에서 셋의 키가 같다.
    box: 25,
    clips: {
      idle:      { row: 0, frames: 8, fps: 6 },
      walkLeft:  { row: 1, frames: 8, fps: 10 },
      walkRight: { row: 2, frames: 8, fps: 10 },
      attack:    { row: 3, frames: 8, fps: 12, once: 1 },
    },
    // 앞의 둘과 같은 이유로 대기 줄만 뒤집어 구웠다. 시안의 대기는 활을 왼손에
    // 들어 왼쪽을 보는 것으로 읽히는데, 공격은 오른쪽으로 쏜다. 걷기도 다른
    // 시트와 같이 시안이 왼쪽으로 걸어, 오른쪽 줄만 뒤집어 만들었다.
    crops: {
      full: { x: 0, y: 0, w: 1, h: 1 },
      list: { x: 0.15, y: 0.04, w: 0.70, h: 0.94 },
      head: { x: 0.28, y: 0.05, w: 0.44, h: 0.47 },
    },
  },
};

const sheet = (kind) => SHEETS[kind] || null;

// 칸의 가로세로비를 그대로 화면 상자로 쓰고, 높이는 시트가 정한다(`box`) —
// 칸 위쪽이 비어 있는 시트는 칸 높이를 그대로 쓰면 인물이 작게 그려진다.
// **밖에서도 알아야 한다**: 우두머리를 크게 구운 것이 곧 크게 보이는 것이라는
// 규칙을 main.js가 이 값으로 지킨다.
function size(kind) {
  const s = SHEETS[kind];
  if (!s) return { w: 22, h: 22 };
  const h = s.box || 22;
  return { w: Math.round((h * s.cell.w) / s.cell.h * 10) / 10, h };
}

const api = { size, sheet, SHEETS };

if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.HealerSprites = api;

})(typeof window !== 'undefined' ? window : globalThis);
