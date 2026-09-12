'use strict';

// 시트를 굽는다. **사이트에는 들어가지 않는다** — 그림 자료(`art.js`)를 브라우저로
// 그려 `units.png` 한 장으로 떨어뜨리는 도구이고, 헤드리스 브라우저가 있어야 돈다.
//
// 실행: NODE_PATH=<playwright가 있는 곳> node games/defense/bake.js
(async () => {
  const path = require('path');
  const { chromium } = require('playwright');
  const art = require('./art.js');
  const rows = Math.ceil(art.ORDER.length / art.COLS);
  const cells = art.ORDER.map((k) => `<div class="c">${art.FIGURES[k]}</div>`).join('');
  const html = `<!doctype html><meta charset="utf-8"><style>
    html,body{margin:0;background:transparent}
    .g{display:grid;grid-template-columns:repeat(${art.COLS},${art.CELL}px);width:${art.COLS * art.CELL}px}
    .c{width:${art.CELL}px;height:${art.CELL}px}
    svg{display:block}
  </style><div class="g">${cells}</div>`;

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: art.COLS * art.CELL, height: rows * art.CELL },
  });
  await page.setContent(html);
  const out = path.join(__dirname, 'units.png');
  // 투명한 바탕으로 잘라야 판 위에 얹었을 때 칸 색이 비친다.
  await page.locator('.g').screenshot({ path: out, omitBackground: true });
  await browser.close();
  console.log(`${out} — ${art.COLS * art.CELL}x${rows * art.CELL}, ${art.ORDER.length}칸`);
})();
