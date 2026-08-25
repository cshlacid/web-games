'use strict';

// 캐릭터 그림. 저장소에 이미지 파일을 들이지 않는다는 규칙을 따라 직접 그렸다.
//
// 24×34 좌표계에 그리고, 색은 CSS가 준다. 여기서 색을 정하면 아군/적, 밝은/어두운
// 테마마다 그림을 여러 벌 그려야 한다. 실루엣만으로 직업이 구분돼야 하는 것이
// 이 크기에서 가장 중요하다 — 전투 중에는 이름표를 읽을 틈이 없다.
(function (root) {

// 다섯 그림이 같은 몸통을 쓴다. 직업을 가르는 것은 머리 위와 손에 든 것뿐이다.
const BODY = '<path class="fill" d="M12 11c3.2 0 5.4 2.1 5.4 5.2v9.6c0 1.5-1 2.4-2.4 2.4H9c-1.4 0-2.4-.9-2.4-2.4v-9.6C6.6 13.1 8.8 11 12 11z"/>';
const HEAD = '<circle class="fill" cx="12" cy="6.4" r="4.2"/>';

const SPRITES = {
  // 주인공: 후광. 화면에서 내 캐릭터를 한눈에 찾아야 해서 유일하게 머리 위에 원이 있다.
  hero: [
    '<circle class="line" cx="12" cy="2.6" r="3.1" stroke-width="1.2"/>',
    HEAD, BODY,
    '<path class="fill" d="M19 9.5h1.8v18H19z"/>',
    '<circle class="fill" cx="19.9" cy="8.2" r="2.4"/>',
  ],
  // 탱커: 몸 앞을 가리는 방패. 폭이 넓어야 "막는 쪽"으로 읽힌다.
  tank: [
    HEAD, BODY,
    '<path class="fill" d="M2.6 12.4c2.6 0 5-.7 6.6-1.8v9.2c0 3.4-3.2 5.6-6.6 7-3.4-1.4-6.6-3.6-6.6-7v-9.2c1.6 1.1 4 1.8 6.6 1.8z" transform="translate(4.4 1)"/>',
  ],
  // 근접 딜러: 위로 세운 검. 아래로 늘어뜨리면 방패와 실루엣이 비슷해진다.
  melee: [
    HEAD, BODY,
    '<path class="fill" d="M18.6 4.2h1.9v15.4h-1.9z"/>',
    '<path class="fill" d="M16.2 18.4h6.7v1.9h-6.7z"/>',
  ],
  // 원거리 딜러: 활. 곡선 하나로 다른 넷과 확실히 갈린다.
  ranged: [
    HEAD, BODY,
    '<path class="line" d="M19.4 8.6c2.6 3 2.6 8.4 0 11.4" stroke-width="1.6" fill="none"/>',
    '<path class="line" d="M19.4 8.6 19.4 20" stroke-width="0.9"/>',
  ],
  // 힐러 동료: 지팡이 끝의 구슬.
  healer: [
    HEAD, BODY,
    '<path class="fill" d="M18.8 10h1.6v17.6h-1.6z"/>',
    '<circle class="line" cx="19.6" cy="7.6" r="2.8" stroke-width="1.3" fill="none"/>',
  ],
  // 고블린: 작고 귀가 뾰족하다. 크기 차이가 위협의 크기를 알려 준다.
  goblin: [
    '<circle class="fill" cx="12" cy="9.6" r="3.6"/>',
    '<path class="fill" d="M8.6 8.2 4.8 5.6l2.6 4.6zM15.4 8.2l3.8-2.6-2.6 4.6z"/>',
    '<path class="fill" d="M12 13.2c2.6 0 4.4 1.7 4.4 4.2v7.8c0 1.3-.8 2-2 2h-4.8c-1.2 0-2-.7-2-2v-7.8c0-2.5 1.8-4.2 4.4-4.2z"/>',
  ],
  // 주술사: 후드와 지팡이. 뾰족한 머리가 뒤에서 던지는 쪽이라는 표시다.
  shaman: [
    '<path class="fill" d="M12 2.2c3 2 4.6 5.2 4.6 8.6H7.4c0-3.4 1.6-6.6 4.6-8.6z"/>',
    '<path class="fill" d="M12 12c3.2 0 5 2 5 5v8.6c0 1.5-1 2.4-2.4 2.4H9.4c-1.4 0-2.4-.9-2.4-2.4V17c0-3 1.8-5 5-5z"/>',
    '<path class="fill" d="M3.4 8h1.6v19.6H3.4z"/>',
    '<path class="line" d="m4.2 8-2.4-3.4 4.8 0z" stroke-width="1"/>',
  ],
  // 오크: 어깨가 넓고 아래턱 송곳니가 보인다. 고블린보다 확실히 커야 한다.
  orc: [
    '<circle class="fill" cx="12" cy="7" r="4.8"/>',
    '<path class="fill" d="M9.4 10.4 8.6 13l1.8-1.2zM14.6 10.4l.8 2.6-1.8-1.2z"/>',
    '<path class="fill" d="M12 12.6c4 0 6.6 2.4 6.6 6v7.2c0 1.5-1 2.4-2.6 2.4H8c-1.6 0-2.6-.9-2.6-2.4v-7.2c0-3.6 2.6-6 6.6-6z"/>',
  ],
  // 우두머리: 오크에 뿔투구를 얹었다. 같은 무리의 우두머리라는 것이 보여야 한다.
  boss: [
    '<path class="fill" d="M5.4 4.2 2 1.4l1.2 5.2zM18.6 4.2 22 1.4l-1.2 5.2z"/>',
    '<circle class="fill" cx="12" cy="7.6" r="5.4"/>',
    '<path class="fill" d="M9 11.4 8 14.6l2.2-1.5zM15 11.4l1 3.2-2.2-1.5z"/>',
    '<path class="fill" d="M12 13.6c4.6 0 7.4 2.6 7.4 6.6v6.2c0 1.6-1 2.6-2.8 2.6H7.4c-1.8 0-2.8-1-2.8-2.6v-6.2c0-4 2.8-6.6 7.4-6.6z"/>',
  ],
};

function svg(kind) {
  const parts = SPRITES[kind] || SPRITES.melee;
  return `<svg class="sprite" viewBox="0 0 24 34" aria-hidden="true">${parts.join('')}</svg>`;
}

const api = { svg, SPRITES };

if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.HealerSprites = api;

})(typeof window !== 'undefined' ? window : globalThis);
