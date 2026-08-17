'use strict';

(function () {
  const L = window.Game2048Logic;
  const BEST_KEY = 'web-games.2048.best';
  const MOVE_MS = 110; // style.css의 .tile transition과 맞춰야 한다.

  const el = {
    cells: document.getElementById('cells'),
    tiles: document.getElementById('tiles'),
    score: document.getElementById('score'),
    gain: document.getElementById('gain'),
    best: document.getElementById('best'),
    board: document.getElementById('board'),
    newGame: document.getElementById('new-game'),
    overlay: document.getElementById('overlay'),
    overlayText: document.getElementById('overlay-text'),
    overlayActions: document.getElementById('overlay-actions'),
  };

  for (let i = 0; i < L.SIZE * L.SIZE; i++) el.cells.appendChild(document.createElement('div'));

  // 사파리의 프라이빗 모드처럼 localStorage 접근 자체가 예외를 던지는 환경이
  // 있다. 최고 점수 때문에 게임이 멈추면 안 되므로 조용히 포기한다.
  const store = {
    get() {
      try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch { return 0; }
    },
    set(value) {
      try { localStorage.setItem(BEST_KEY, String(value)); } catch { /* 무시 */ }
    },
  };

  const state = {
    grid: L.createGrid(),
    nodes: new Map(), // 타일 id -> DOM 노드
    nextId: 1,
    score: 0,
    best: store.get(),
    status: 'playing', // playing | won | over
    busy: false,
  };

  function animMs() {
    return matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : MOVE_MS;
  }

  function styleTile(node, value) {
    const digits = String(value).length;
    node.className = 'tile';
    if (digits >= 3) node.classList.add(`d${Math.min(digits, 5)}`);
    node.classList.add(value > 2048 ? 'vsuper' : `v${value}`);
    node.textContent = value;
  }

  function place(node, r, c) {
    node.style.setProperty('--row', r);
    node.style.setProperty('--col', c);
  }

  function addTile(tile, r, c, spawnAnim) {
    const node = document.createElement('div');
    styleTile(node, tile.value);
    place(node, r, c);
    if (spawnAnim) node.classList.add('spawn');
    el.tiles.appendChild(node);
    state.nodes.set(tile.id, node);
  }

  function spawnTile(animate) {
    const spawned = L.spawn(state.grid, state.nextId++, Math.random);
    if (spawned) addTile(spawned.tile, spawned.r, spawned.c, animate);
  }

  function setScore(gained) {
    state.score += gained;
    el.score.textContent = state.score;
    if (state.score > state.best) {
      state.best = state.score;
      el.best.textContent = state.best;
      store.set(state.best);
    }
    if (gained > 0) {
      el.gain.textContent = `+${gained}`;
      el.gain.classList.remove('run');
      void el.gain.offsetWidth; // 애니메이션을 다시 트리거하려면 리플로우가 필요하다.
      el.gain.classList.add('run');
    }
  }

  function showOverlay(text, actions) {
    el.overlayText.textContent = text;
    el.overlayActions.replaceChildren();
    for (const action of actions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn';
      button.textContent = action.label;
      button.addEventListener('click', action.run);
      el.overlayActions.appendChild(button);
    }
    el.overlay.hidden = false;
  }

  function hideOverlay() {
    el.overlay.hidden = true;
  }

  function newGame() {
    hideOverlay();
    el.tiles.replaceChildren();
    state.nodes.clear();
    state.grid = L.createGrid();
    state.nextId = 1;
    state.score = 0;
    state.status = 'playing';
    state.busy = false;
    el.score.textContent = '0';
    el.best.textContent = state.best;
    spawnTile(true);
    spawnTile(true);
  }

  function move(direction) {
    if (state.busy || state.status === 'over') return;

    const result = L.move(state.grid, direction);
    if (!result.moved) return;

    state.busy = true;

    // 1단계: 살아남는 타일과 흡수되는 타일을 모두 목적지로 보낸다.
    // 값 갱신을 여기서 하면 이동 중에 숫자가 바뀌어 보이므로 뒤로 미룬다.
    for (const m of result.movements) {
      const node = state.nodes.get(m.id);
      if (node) place(node, m.to.r, m.to.c);
    }
    for (const a of result.absorbed) {
      const node = state.nodes.get(a.id);
      if (node) place(node, a.to.r, a.to.c);
    }

    setTimeout(() => {
      // 2단계: 흡수된 타일을 지우고, 합쳐진 타일의 값을 올린다.
      for (const a of result.absorbed) {
        const node = state.nodes.get(a.id);
        if (node) node.remove();
        state.nodes.delete(a.id);
      }

      state.grid = result.grid;
      for (let r = 0; r < L.SIZE; r++) {
        for (let c = 0; c < L.SIZE; c++) {
          const tile = state.grid[r][c];
          if (!tile) continue;
          const node = state.nodes.get(tile.id);
          if (!node) continue;
          if (result.mergedIds.includes(tile.id)) {
            styleTile(node, tile.value);
            place(node, r, c);
            node.classList.add('pop');
          }
        }
      }

      setScore(result.gained);
      spawnTile(true);
      state.busy = false;

      if (state.status === 'playing' && L.hasWon(state.grid)) {
        state.status = 'won';
        showOverlay('2048 달성!', [
          { label: '계속하기', run: hideOverlay },
          { label: '새 게임', run: newGame },
        ]);
        return;
      }
      if (!L.canMove(state.grid)) {
        state.status = 'over';
        showOverlay('게임 오버', [{ label: '다시 하기', run: newGame }]);
      }
    }, animMs());
  }

  const KEYS = {
    ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
    a: 'left', d: 'right', w: 'up', s: 'down',
  };

  window.addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const direction = KEYS[event.key] || KEYS[event.key.toLowerCase()];
    if (!direction) return;
    event.preventDefault(); // 방향키로 페이지가 스크롤되지 않게 한다.
    move(direction);
  });

  let touch = null;
  el.board.addEventListener('touchstart', (event) => {
    const point = event.changedTouches[0];
    touch = { x: point.clientX, y: point.clientY };
  }, { passive: true });

  el.board.addEventListener('touchend', (event) => {
    if (!touch) return;
    const point = event.changedTouches[0];
    const dx = point.clientX - touch.x;
    const dy = point.clientY - touch.y;
    touch = null;
    // 손가락이 흔들린 정도를 방향으로 오인하지 않도록 최소 거리를 둔다.
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 'right' : 'left');
    else move(dy > 0 ? 'down' : 'up');
  }, { passive: true });

  el.newGame.addEventListener('click', newGame);

  newGame();
})();
