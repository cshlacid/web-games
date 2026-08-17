'use strict';

const SIZE = 4;
const WIN_VALUE = 2048;

// 격자의 각 칸은 {id, value} 또는 빈 칸이면 null.
// id를 두는 이유: 렌더러가 값이 같은 타일을 구분해 DOM 노드를 재사용하고,
// 이동 애니메이션을 이어 붙일 수 있어야 한다. 값만으로는 어느 타일이 어디서
// 왔는지 알 수 없다.

function createGrid() {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
}

function emptyCells(grid) {
  const cells = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (!grid[r][c]) cells.push({ r, c });
    }
  }
  return cells;
}

// 새 타일은 10% 확률로 4. 원작의 확률을 그대로 따른다.
function randomValue() {
  return Math.random() < 0.9 ? 2 : 4;
}

function spawn(grid, id, rng = Math.random) {
  const cells = emptyCells(grid);
  if (cells.length === 0) return null;
  const { r, c } = cells[Math.floor(rng() * cells.length)];
  const tile = { id, value: randomValue() };
  grid[r][c] = tile;
  return { r, c, tile };
}

// 각 방향마다 "벽에 가까운 칸부터" 순서로 정렬된 줄 4개를 만든다.
// 이 순서로 훑으면 방향에 관계없이 압축 로직 하나만 있으면 된다.
function lines(direction) {
  const result = [];
  for (let i = 0; i < SIZE; i++) {
    const line = [];
    for (let j = 0; j < SIZE; j++) {
      if (direction === 'left') line.push({ r: i, c: j });
      else if (direction === 'right') line.push({ r: i, c: SIZE - 1 - j });
      else if (direction === 'up') line.push({ r: j, c: i });
      else line.push({ r: SIZE - 1 - j, c: i });
    }
    result.push(line);
  }
  return result;
}

/**
 * 한 번의 이동을 계산한다. 입력 격자는 건드리지 않는다.
 *
 * 반환하는 movements/absorbed는 렌더러 전용이다. 결과 격자만으로는 타일이
 * 어디서 왔는지 복원할 수 없어서, 이동 애니메이션에 필요한 정보를 여기서
 * 함께 내보낸다.
 */
function move(grid, direction) {
  const next = createGrid();
  const movements = []; // 살아남은 타일: {id, from, to}
  const absorbed = []; // 합쳐지며 사라지는 타일: 목적지까지 이동시킨 뒤 제거한다
  const mergedIds = []; // 값이 두 배가 된 타일: 팝 애니메이션 대상
  let gained = 0;
  let moved = false;

  for (const line of lines(direction)) {
    const packed = [];
    for (const pos of line) {
      const tile = grid[pos.r][pos.c];
      if (tile) packed.push({ tile, from: pos });
    }

    const out = [];
    for (let i = 0; i < packed.length; i++) {
      const current = packed[i];
      const nextOne = packed[i + 1];
      // 한 번의 이동에서 같은 타일이 두 번 합쳐지지 않아야 하므로,
      // 짝을 지으면 i를 2 늘려 다음 쌍으로 건너뛴다. [2,2,2] -> [4,2].
      if (nextOne && nextOne.tile.value === current.tile.value) {
        out.push({ keep: current, eaten: nextOne, value: current.tile.value * 2 });
        i++;
      } else {
        out.push({ keep: current, eaten: null, value: current.tile.value });
      }
    }

    out.forEach((entry, index) => {
      const to = line[index];
      const tile = { id: entry.keep.tile.id, value: entry.value };
      next[to.r][to.c] = tile;

      const from = entry.keep.from;
      if (from.r !== to.r || from.c !== to.c) moved = true;
      movements.push({ id: tile.id, from, to });

      if (entry.eaten) {
        moved = true;
        gained += entry.value;
        mergedIds.push(tile.id);
        absorbed.push({ id: entry.eaten.tile.id, from: entry.eaten.from, to });
      }
    });
  }

  return { grid: next, movements, absorbed, mergedIds, gained, moved };
}

function canMove(grid) {
  if (emptyCells(grid).length > 0) return true;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const value = grid[r][c].value;
      if (c + 1 < SIZE && grid[r][c + 1].value === value) return true;
      if (r + 1 < SIZE && grid[r + 1][c].value === value) return true;
    }
  }
  return false;
}

function hasWon(grid) {
  return grid.some((row) => row.some((tile) => tile && tile.value >= WIN_VALUE));
}

const Logic = { SIZE, WIN_VALUE, createGrid, emptyCells, spawn, move, canMove, hasWon };

// 브라우저에서는 전역으로, node에서는 모듈로 쓴다. 후자는 로직만 떼어
// 테스트하기 위한 통로다.
if (typeof module !== 'undefined' && module.exports) module.exports = Logic;
if (typeof window !== 'undefined') window.Game2048Logic = Logic;
