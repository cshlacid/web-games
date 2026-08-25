'use strict';

(function (root) {
  // bake.js가 만든다. 직접 고치지 않는다.
  root.CHESS_PUZZLE_INDEX = {
    version: '2026-08-25',
    chunkSize: 50,
    levels: {
      easy: { count: 300, rating: [600, 1199] },
      medium: { count: 300, rating: [1400, 1899] },
      hard: { count: 300, rating: [2000, 2600] },
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
