'use strict';

// 왕관이 둘인 판을 굽는다. 사이트는 이 파일을 부르지 않는다 — 구운 결과(`doubles.js`)만
// 싣는다. 왜 굽는지는 generator.js의 "왕관이 둘인 판"에 있다.
//
//   node games/queens/bake.js > games/queens/doubles.js
(function () {

const G = require('./generator.js');
const S = require('./solver.js');

const COUNT = 60;

const out = {};
const started = Date.now();
for (const size of G.DOUBLE_SIZES) {
  const list = [];
  for (let seed = 1; list.length < COUNT; seed++) {
    const puzzle = G.generateDouble(size, { seed: size * 10000 + seed });
    if (!puzzle) continue;
    // 긴 가정이 필요한 판은 버린다(solver.js의 SHORT_TRIAL). 10×10은 열에 하나꼴로 남는다.
    if (S.longestTrial(puzzle) > S.SHORT_TRIAL) continue;
    const code = G.encodeDouble(puzzle);
    if (!list.includes(code)) list.push(code);
  }
  out[size] = list;
  process.stderr.write(`${size}×${size}: ${list.length}판 (${((Date.now() - started) / 1000).toFixed(1)}초)\n`);
}

const body = Object.keys(out).map((size) => {
  const rows = out[size].map((code) => `    '${code}',`).join('\n');
  return `  ${size}: [\n${rows}\n  ],`;
}).join('\n');

process.stdout.write(`'use strict';

// 구워 둔 왕관 둘짜리 판. 손으로 고치지 않는다 — \`node games/queens/bake.js\`로 다시 굽는다.
// 한 줄은 칸마다 영역 번호, ':', 논리 풀이가 왕관을 놓은 순서(칸 번호 두 자리씩)다.
(function () {

const DOUBLES = {
${body}
};

const api = { DOUBLES };

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.QueensDoubles = api;

})();
`);

})();
