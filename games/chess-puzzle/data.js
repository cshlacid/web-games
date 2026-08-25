'use strict';

// 문제 자료를 덩이 단위로 받아 오는 창구. 전체는 900개 300KB인데, 한 번에 다
// 받으면 첫 문제 하나를 보려고 899개를 기다리게 된다. 그래서 목차만 미리 받고
// 나머지는 그 문제가 나올 때 받는다.
//
// fetch가 아니라 script 태그를 꽂는다. 이 사이트는 파일을 받아서 그대로 열어도
// 돌아가야 하는데, file:// 에서는 fetch가 CORS에 막히고 script 태그는 막히지
// 않는다. 덩이 파일이 자기 자신을 표에 등록하고, 여기서는 onload 뒤에 그 표를
// 읽는다 — 콜백을 주고받지 않으므로 node에서 require 한 번으로도 같은 자료가
// 읽히고, 그 덕에 테스트가 브라우저 없이 돈다.
(function (root) {
  const index = root.CHESS_PUZZLE_INDEX;
  const chunkSize = index.chunkSize;
  const pending = new Map();   // 덩이 이름 → 받는 중이거나 끝난 Promise

  const chunkNumber = (position) => Math.floor(position / chunkSize);
  const chunkName = (level, position) => `${level}-${String(chunkNumber(position)).padStart(2, '0')}`;

  const chunkOf = (name) => (root.CHESS_PUZZLE_CHUNKS || {})[name] || null;

  function fetchChunk(name) {
    if (chunkOf(name)) return Promise.resolve(chunkOf(name));
    if (pending.has(name)) return pending.get(name);

    const promise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `puzzles/${name}.js`;
      script.addEventListener('load', () => {
        const chunk = chunkOf(name);
        if (chunk) resolve(chunk);
        else reject(new Error(`${name}: 파일은 받았는데 자료가 없다`));
      });
      script.addEventListener('error', () => reject(new Error(`${name}: 받지 못했다`)));
      document.head.appendChild(script);
    });

    // 실패한 것을 남겨 두면 다시 눌러도 같은 실패가 그대로 돌아온다.
    pending.set(name, promise);
    promise.catch(() => pending.delete(name));
    return promise;
  }

  const api = {
    version: index.version,
    levels: index.levels,
    levelNames: Object.keys(index.levels),

    /** 이미 받아 둔 문제만 돌려준다. 없으면 null — 기다림이 필요하다는 뜻이다. */
    get(level, position) {
      const chunk = chunkOf(chunkName(level, position));
      return chunk ? chunk[position % chunkSize] || null : null;
    },

    async load(level, position) {
      const chunk = await fetchChunk(chunkName(level, position));
      const puzzle = chunk[position % chunkSize];
      if (!puzzle) throw new Error(`${level} ${position}번 문제가 덩이에 없다`);
      return puzzle;
    },

    /**
     * 그 문제가 든 덩이를 미리 받아 둔다. "다음 문제"를 눌렀을 때 덩이 경계에서만
     * 기다리게 되는 것을 없애려는 것이다. 실패는 무시한다 — 정말 필요해지는
     * 순간 load가 다시 받는다.
     */
    prefetch(level, position) {
      if (position < 0 || position >= index.levels[level].count) return;
      fetchChunk(chunkName(level, position)).catch(() => { /* 무시 */ });
    },
  };

  root.ChessPuzzleData = api;
})(typeof window !== 'undefined' ? window : globalThis);
