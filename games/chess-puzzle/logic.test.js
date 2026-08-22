'use strict';

const assert = require('assert');
const { parseFen, applyMove, startPuzzle, expectedMove, attemptMove, playReply } = require('./logic.js');
global.window = global;
require('./puzzles.js');

const puzzle = {
  fen: 'q3k1nr/1pp1nQpp/3p4/1P2p3/4P3/B1PP1b2/B5PP/5K2 b k - 0 17',
  moves: ['e8d7', 'a2e6', 'd7d8', 'f7f8'],
};

{
  const position = parseFen('8/8/8/8/8/8/4K3/7k w - - 0 1');
  assert.strictEqual(position.board.e2, 'K');
  assert.strictEqual(position.board.h1, 'k');
  assert.strictEqual(position.turn, 'w');
}

{
  const position = applyMove(parseFen('8/8/8/8/8/8/4K3/7k w - - 0 1'), 'e2e3');
  assert.strictEqual(position.board.e3, 'K');
  assert.strictEqual(position.board.e2, undefined);
  assert.strictEqual(position.turn, 'b');
}

{
  let state = startPuzzle(puzzle);
  assert.strictEqual(expectedMove(state), 'a2e6');
  const wrong = attemptMove(state, 'a2', 'a3');
  assert.strictEqual(wrong.correct, false);
  assert.strictEqual(wrong.state.mistakes, 1);
  const right = attemptMove(state, 'a2', 'e6');
  assert.strictEqual(right.correct, true);
  assert.strictEqual(right.state.status, 'replying');
  state = playReply(right.state);
  assert.strictEqual(state.status, 'playing');
  assert.strictEqual(expectedMove(state), 'f7f8');
  state = attemptMove(state, 'f7', 'f8').state;
  assert.strictEqual(state.status, 'solved');
}

for (const item of global.CHESS_PUZZLES) {
  let state = startPuzzle(item);
  while (state.status !== 'solved') {
    if (state.status === 'replying') {
      state = playReply(state);
      continue;
    }
    const move = expectedMove(state);
    assert.ok(move, `${item.id}에 다음 수가 없습니다`);
    const result = attemptMove(state, move.slice(0, 2), move.slice(2, 4), move[4]);
    assert.ok(result.correct, `${item.id}의 정답 수를 적용하지 못했습니다`);
    state = result.state;
  }
}

console.log('chess-puzzle logic tests passed');

