(function (root) {
  'use strict';

  const FILES = 'abcdefgh';

  function parseFen(fen) {
    const fields = fen.trim().split(/\s+/);
    const rows = fields[0].split('/');
    const board = {};

    rows.forEach((row, rowIndex) => {
      let fileIndex = 0;
      for (const char of row) {
        if (/\d/.test(char)) {
          fileIndex += Number(char);
        } else {
          board[FILES[fileIndex] + (8 - rowIndex)] = char;
          fileIndex += 1;
        }
      }
    });

    return { board, turn: fields[1] || 'w' };
  }

  function moveParts(uci) {
    return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || null };
  }

  function applyMove(position, uci) {
    const next = { board: { ...position.board }, turn: position.turn === 'w' ? 'b' : 'w' };
    const { from, to, promotion } = moveParts(uci);
    const piece = next.board[from];

    if (!piece) throw new Error(`출발 칸에 말이 없습니다: ${from}`);

    delete next.board[from];
    next.board[to] = promotion ? (piece === piece.toUpperCase() ? promotion.toUpperCase() : promotion) : piece;

    if (piece.toLowerCase() === 'k' && Math.abs(FILES.indexOf(from[0]) - FILES.indexOf(to[0])) === 2) {
      const rank = from[1];
      const rookFrom = to[0] === 'g' ? `h${rank}` : `a${rank}`;
      const rookTo = to[0] === 'g' ? `f${rank}` : `d${rank}`;
      next.board[rookTo] = next.board[rookFrom];
      delete next.board[rookFrom];
    }

    return next;
  }

  function startPuzzle(puzzle) {
    const beforeBlunder = parseFen(puzzle.fen);
    const position = applyMove(beforeBlunder, puzzle.moves[0]);
    return { puzzle, position, solutionIndex: 1, status: 'playing', mistakes: 0 };
  }

  function expectedMove(state) {
    return state.puzzle.moves[state.solutionIndex] || null;
  }

  function attemptMove(state, from, to, promotion) {
    if (state.status !== 'playing') return { state, correct: false, reason: 'finished' };

    const expected = expectedMove(state);
    const played = `${from}${to}${promotion || ''}`;
    if (played !== expected) {
      return { state: { ...state, mistakes: state.mistakes + 1 }, correct: false, reason: 'wrong' };
    }

    const position = applyMove(state.position, expected);
    const solutionIndex = state.solutionIndex + 1;
    const status = solutionIndex >= state.puzzle.moves.length ? 'solved' : 'replying';
    return { state: { ...state, position, solutionIndex, status }, correct: true, reason: status };
  }

  function playReply(state) {
    if (state.status !== 'replying') return state;
    const reply = expectedMove(state);
    const position = applyMove(state.position, reply);
    const solutionIndex = state.solutionIndex + 1;
    return { ...state, position, solutionIndex, status: solutionIndex >= state.puzzle.moves.length ? 'solved' : 'playing' };
  }

  const api = { parseFen, moveParts, applyMove, startPuzzle, expectedMove, attemptMove, playReply };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ChessPuzzleLogic = api;
})(typeof window !== 'undefined' ? window : globalThis);

