'use strict';

// 룬 문양. 레벨업 카드(DOM)와 전장의 마법진(캔버스)이 같은 그림을 쓰도록 경로를
// 한 곳에 둔다 — 캔버스는 Path2D로 같은 경로를 긋는다. 둘에 따로 그리면 한쪽만
// 고치는 일이 난다.
(function () {
  const PATHS = {
    fire: 'M12 3c1 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-4.5 3-6.5 1 2 2 3 3 3-1-3-.5-5 0-7.5z',
    water: 'M12 3c3 5 6 8 6 12a6 6 0 0 1-12 0c0-4 3-7 6-12z',
    wind: 'M3 9h11a3 3 0 1 0-3-3M3 14h15a3 3 0 1 1-3 3M3 19h7',
    earth: 'M2.5 20l6.5-11 4 6 3-4 5.5 9z',
    thunder: 'M13 2L5 13h6l-1 9 8-12h-6z',
    light: 'M9 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0M12 2v4M12 18v4M2 12h4M18 12h4M5 5l2.5 2.5M16.5 16.5L19 19M5 19l2.5-2.5M16.5 7.5L19 5',
    dark: 'M3 12c3.5-5.5 14.5-5.5 18 0-3.5 5.5-14.5 5.5-18 0zM10 12a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
    chain: 'M9 15l6-6M7.5 11.5l-2 2a3.5 3.5 0 0 0 5 5l2-2M16.5 12.5l2-2a3.5 3.5 0 0 0-5-5l-2 2',
    omni: 'M12 3v5M12 16v5M3 12h5M16 12h5M5.6 5.6l3.5 3.5M14.9 14.9l3.5 3.5M18.4 5.6l-3.5 3.5M9.1 14.9l-3.5 3.5',
    echo: 'M10 12a2 2 0 1 0 4 0a2 2 0 1 0-4 0M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2',
    anima: 'M3 5h18M6 5l2.5 7L11 5M13 5l2.5 7L18 5M12 14c1.8 2.4 3 3.8 3 5a3 3 0 0 1-6 0c0-1.2 1.2-2.6 3-5z',
    frost: 'M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5L12 7l2.5-2.5M9.5 19.5L12 17l2.5 2.5',
    heat: 'M10 13.5V5a2 2 0 0 1 4 0v8.5a4 4 0 1 1-4 0zM12 9.5v7M17.5 4.5c1 1.2 1 2.3 0 3.5M20 3.5c1.6 1.9 1.6 3.6 0 5.5',
    gravity: 'M10 12a2 2 0 1 0 4 0a2 2 0 1 0-4 0M3 3l5 5M8 4v4H4M21 3l-5 5M16 4v4h4M3 21l5-5M8 20v-4H4M21 21l-5-5M16 20v-4h4',
    gale: 'M3 7h9M2 12h12M4 17h7M14 4l6 3-6 3M15 14l5 3-5 3',
    resonance: 'M12 4v16M8 7.5v9M16 7.5v9M4 10.5v3M20 10.5v3',
    erase: 'M4 20h16M6 16l9-11 5 4-9 11H7z',
    heal: 'M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z',
    // 장비 부위
    staff: 'M5 21L15.5 8.5M14 4.5a3.2 3.2 0 1 0 5.5 3.2a3.2 3.2 0 0 0-5.5-3.2z',
    robe: 'M9 3h6l5 5-3 2.5V21H7V10.5L4 8z',
    ring: 'M12 21a6 6 0 1 0 0-12a6 6 0 1 0 0 12zM9 5.5L12 3l3 2.5-3 3z',
    amulet: 'M5 3l7 8 7-8M12 11a4.5 4.5 0 1 0 0 9a4.5 4.5 0 1 0 0-9z',
    belt: 'M3 9h18v6H3zM10 7.5h4v9h-4z',
    boots: 'M8 3h5v10l6 3v5H6V13z',
    // 로비의 탭
    moon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
    gear: 'M9 3h6l5 5-3 2.5V21H7V10.5L4 8zM12 3v6',
    bag: 'M5 8h14l-1.2 13H6.2zM9 8V6a3 3 0 0 1 6 0v2',
    forge: 'M12 20V6M6 12l6-6 6 6M5 21h14',
    shop: 'M4 10h16v10H4zM4 10l2-5h12l2 5M12 10v4',
    book: 'M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5zM5 19.5A1.5 1.5 0 0 0 6.5 21H19',
    skull: 'M12 3a8 8 0 0 0-8 8c0 3 1.6 5 4 6v3h8v-3c2.4-1 4-3 4-6a8 8 0 0 0-8-8zM8.5 11h2M13.5 11h2M11 20v-2.5M13 20v-2.5',
    pause: 'M8 5v14M16 5v14',
    coin: 'M12 21a9 9 0 1 0 0-18a9 9 0 1 0 0 18zM12 7v10M15 9.5h-4.5a1.5 1.5 0 0 0 0 3h3a1.5 1.5 0 0 1 0 3H9',
  };

  // 원소는 제 색을, 수식어는 모두 비전의 보라를 쓴다 — 전장에서 원소 넷과 강화를
  // 한눈에 가르려는 것이다.
  const COLORS = {
    fire: '#ff7a3d', water: '#4fb3ff', wind: '#6fe0ae', earth: '#d4a45e',
    thunder: '#ffd84a', light: '#fff1c4', dark: '#e05ab6',
    arcane: '#b99bff', heal: '#7fdc8a', leech: '#ff5470',
  };
  // 장비 등급의 색. 뱀서류가 흔히 쓰는 차례(회색·초록·파랑·보라·주황)를 따라, 처음 보는
  // 사람도 색만으로 무엇이 좋은지 알아본다.
  const RARITY = ['#9aa0a8', '#4fbf6a', '#4f8fe8', '#a46ae8', '#f09a2a'];

  const colorOf = (id) => COLORS[id] || COLORS.arcane;

  function svg(id, cls) {
    return '<svg class="' + (cls || 'glyph') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="' + PATHS[id] + '"/></svg>';
  }

  const cache = {};
  function path2d(id) {
    if (!cache[id]) cache[id] = new Path2D(PATHS[id]);
    return cache[id];
  }

  window.ArchmageIcons = { PATHS, COLORS, RARITY, colorOf, svg, path2d };
})();
