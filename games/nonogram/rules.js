'use strict';

// 노노그램의 규칙. 화면을 만지지 않는다 — node로 규칙만 돌려 보기 위해서다.
//
// 칸의 상태는 셋이다: 0 비움(아직 모름), 1 칠함, 2 아님(X). **아님 표시는 사람이 쓰는
// 메모일 뿐 판정에는 들어가지 않는다** — 다 풀렸는지는 칠한 칸만 보고 가린다.
(function () {

const EMPTY = 0;
const FILL = 1;
const MARK = 2;

// 한 줄에서 이어진 칠한 칸의 길이를 차례로 센다. 힌트 숫자가 바로 이것이다.
function cluesOf(line) {
  const out = [];
  let run = 0;
  for (const cell of line) {
    if (cell === FILL) { run++; continue; }
    if (run) out.push(run);
    run = 0;
  }
  if (run) out.push(run);
  return out.length ? out : [0];
}

function rowOf(cells, w, r) {
  return cells.slice(r * w, r * w + w);
}

function colOf(cells, w, h, c) {
  const out = [];
  for (let r = 0; r < h; r++) out.push(cells[r * w + c]);
  return out;
}

// 정답 그림에서 힌트를 뽑는다. 판은 이 힌트만으로 풀린다.
function cluesFrom(answer, w, h) {
  const rows = [];
  const cols = [];
  for (let r = 0; r < h; r++) rows.push(cluesOf(rowOf(answer, w, r)));
  for (let c = 0; c < w; c++) cols.push(cluesOf(colOf(answer, w, h, c)));
  return { rows, cols };
}

function puzzleFrom(answer, w, h, name) {
  const { rows, cols } = cluesFrom(answer, w, h);
  return { w, h, rows, cols, answer: answer.slice(), name: name || '' };
}

const newState = (puzzle) => new Array(puzzle.w * puzzle.h).fill(EMPTY);

const same = (a, b) => a.length === b.length && a.every((n, i) => n === b[i]);

// 그 줄이 힌트대로 채워졌는가. 아님 표시는 세지 않는다.
function lineDone(line, clues) {
  return same(cluesOf(line), clues);
}

function rowDone(puzzle, cells, r) {
  return lineDone(rowOf(cells, puzzle.w, r), puzzle.rows[r]);
}

function colDone(puzzle, cells, c) {
  return lineDone(colOf(cells, puzzle.w, puzzle.h, c), puzzle.cols[c]);
}

// 모든 줄이 힌트에 맞으면 끝이다. **정답과 한 칸씩 대 보지 않는다** — 답이 하나뿐인
// 판만 내보내므로 힌트를 다 맞춘 배치는 곧 정답이고, 이렇게 해야 "정답을 따라 그리는"
// 것이 아니라 "규칙을 만족시키는" 놀이가 된다.
function isDone(puzzle, cells) {
  for (let r = 0; r < puzzle.h; r++) if (!rowDone(puzzle, cells, r)) return false;
  for (let c = 0; c < puzzle.w; c++) if (!colDone(puzzle, cells, c)) return false;
  return true;
}

// 정답에는 없는데 칠한 칸. 힌트를 줄 때 이것부터 치운다.
function wrongCells(puzzle, cells) {
  const out = [];
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] === FILL && puzzle.answer[i] !== FILL) out.push(i);
  }
  return out;
}

const Rules = {
  EMPTY, FILL, MARK,
  cluesOf, rowOf, colOf, cluesFrom, puzzleFrom, newState,
  lineDone, rowDone, colDone, isDone, wrongCells,
};

if (typeof module !== 'undefined' && module.exports) module.exports = Rules;
if (typeof window !== 'undefined') window.NonoRules = Rules;

})();
