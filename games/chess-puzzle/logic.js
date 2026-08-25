'use strict';

// 체스 규칙과 퍼즐 진행. 화면은 건드리지 않는다 — node로 규칙을 검증하기 위해서다.
//
// 말의 배치는 `{ e4: 'P' }` 꼴의 칸 이름 맵으로 들고 다닌다. 비트보드가 빠르지만
// 여기서 필요한 것은 한 판에 몇 번의 수 생성이지 초당 수백만 노드가 아니고,
// 화면과 테스트가 칸 이름으로 말하는 편이 훨씬 읽기 쉽다.
(function (root) {

const FILES = 'abcdefgh';

const WHITE = 'w';
const BLACK = 'b';

const isWhite = (piece) => piece === piece.toUpperCase();
const colorOf = (piece) => (isWhite(piece) ? WHITE : BLACK);
const other = (color) => (color === WHITE ? BLACK : WHITE);

const squareOf = (x, y) => FILES[x] + (y + 1);
const fileOf = (square) => FILES.indexOf(square[0]);
const rankOf = (square) => Number(square[1]) - 1;
const onBoard = (x, y) => x >= 0 && x < 8 && y >= 0 && y < 8;

// 방향 벡터. 나이트를 뺀 나머지는 "한 칸씩 미끄러지는" 같은 규칙을 공유한다.
const DIAGONAL = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const STRAIGHT = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const KNIGHT = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];

const PROMOTIONS = ['q', 'r', 'b', 'n'];

/**
 * FEN을 읽는다. 뒤쪽 칸(캐슬링 권리·앙파상·시계)까지 챙기는 이유는, 이것이
 * 빠지면 그 판에서만 가능한 수를 만들어낼 수 없기 때문이다. 퍼즐 정답이
 * 캐슬링이나 앙파상인 경우가 실제로 있다.
 */
function parseFen(fen) {
  const fields = fen.trim().split(/\s+/);
  const board = {};

  fields[0].split('/').forEach((row, rowIndex) => {
    let x = 0;
    for (const char of row) {
      if (/\d/.test(char)) x += Number(char);
      else { board[squareOf(x, 7 - rowIndex)] = char; x += 1; }
    }
  });

  return {
    board,
    turn: fields[1] === BLACK ? BLACK : WHITE,
    castling: fields[2] && fields[2] !== '-' ? fields[2] : '',
    ep: fields[3] && fields[3] !== '-' ? fields[3] : null,
    halfmove: Number(fields[4] || 0),
    fullmove: Number(fields[5] || 1),
  };
}

function toFen(position) {
  const rows = [];
  for (let y = 7; y >= 0; y--) {
    let row = '';
    let gap = 0;
    for (let x = 0; x < 8; x++) {
      const piece = position.board[squareOf(x, y)];
      if (piece) { if (gap) { row += gap; gap = 0; } row += piece; }
      else gap += 1;
    }
    rows.push(row + (gap || ''));
  }
  return [
    rows.join('/'),
    position.turn,
    position.castling || '-',
    position.ep || '-',
    position.halfmove,
    position.fullmove,
  ].join(' ');
}

function moveParts(uci) {
  return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || null };
}

const moveToUci = (move) => `${move.from}${move.to}${move.promotion || ''}`;

/** 그 색이 이 칸을 공격하고 있는가. 체크 판정과 캐슬링 판정이 함께 쓴다. */
function attacksSquare(board, square, byColor) {
  const tx = fileOf(square);
  const ty = rankOf(square);

  // 폰은 "잡는 방향"만 공격이다. 앞으로 가는 것은 공격이 아니다.
  const pawnDir = byColor === WHITE ? -1 : 1;
  for (const dx of [-1, 1]) {
    const x = tx + dx;
    const y = ty + pawnDir;
    if (!onBoard(x, y)) continue;
    const piece = board[squareOf(x, y)];
    if (piece && colorOf(piece) === byColor && piece.toLowerCase() === 'p') return true;
  }

  for (const [dx, dy] of KNIGHT) {
    const x = tx + dx;
    const y = ty + dy;
    if (!onBoard(x, y)) continue;
    const piece = board[squareOf(x, y)];
    if (piece && colorOf(piece) === byColor && piece.toLowerCase() === 'n') return true;
  }

  for (const [dx, dy] of [...DIAGONAL, ...STRAIGHT]) {
    const diagonal = dx !== 0 && dy !== 0;
    for (let step = 1; step < 8; step++) {
      const x = tx + dx * step;
      const y = ty + dy * step;
      if (!onBoard(x, y)) break;
      const piece = board[squareOf(x, y)];
      if (!piece) continue;
      if (colorOf(piece) === byColor) {
        const kind = piece.toLowerCase();
        if (kind === 'q') return true;
        if (diagonal && kind === 'b') return true;
        if (!diagonal && kind === 'r') return true;
        if (step === 1 && kind === 'k') return true;
      }
      break; // 말에 막히면 그 방향은 여기서 끝이다.
    }
  }

  return false;
}

function kingSquare(board, color) {
  const king = color === WHITE ? 'K' : 'k';
  for (const square of Object.keys(board)) if (board[square] === king) return square;
  return null;
}

function inCheck(position, color = position.turn) {
  const square = kingSquare(position.board, color);
  // 퍼즐 데이터가 깨져 킹이 없을 수 있다. 그때는 체크가 아니라고 본다 —
  // 여기서 예외를 던지면 판 전체가 그려지지 않는다.
  return square ? attacksSquare(position.board, square, other(color)) : false;
}

/**
 * 자기 킹이 잡히는지는 보지 않은 수들. 합법 수는 이걸 걸러 만든다.
 *
 * 핀·체크 회피를 규칙으로 따로 구현하지 않고 "두어 보고 킹이 잡히면 버린다"로
 * 가는 이유는, 그 규칙들이 서로 얽혀서 (핀된 말의 앙파상 같은) 예외를 놓치기
 * 쉽기 때문이다. 이 게임의 규모에서는 속도가 문제되지 않는다.
 */
function pseudoMoves(position, from) {
  const piece = position.board[from];
  if (!piece) return [];

  const color = colorOf(piece);
  const kind = piece.toLowerCase();
  const x = fileOf(from);
  const y = rankOf(from);
  const moves = [];

  const add = (tx, ty) => {
    if (!onBoard(tx, ty)) return false;
    const target = position.board[squareOf(tx, ty)];
    if (target && colorOf(target) === color) return false;
    moves.push({ from, to: squareOf(tx, ty) });
    return !target; // 잡았으면 그 방향은 더 못 간다.
  };

  const slide = (dirs) => {
    for (const [dx, dy] of dirs) {
      for (let step = 1; step < 8; step++) {
        if (!add(x + dx * step, y + dy * step)) break;
      }
    }
  };

  if (kind === 'p') {
    const dir = color === WHITE ? 1 : -1;
    const startRank = color === WHITE ? 1 : 6;
    const lastRank = color === WHITE ? 7 : 0;

    const pushTo = (ty) => {
      if (!onBoard(x, ty) || position.board[squareOf(x, ty)]) return false;
      if (ty === lastRank) {
        for (const promotion of PROMOTIONS) moves.push({ from, to: squareOf(x, ty), promotion });
      } else {
        moves.push({ from, to: squareOf(x, ty) });
      }
      return true;
    };

    if (pushTo(y + dir) && y === startRank) pushTo(y + dir * 2);

    for (const dx of [-1, 1]) {
      const tx = x + dx;
      const ty = y + dir;
      if (!onBoard(tx, ty)) continue;
      const to = squareOf(tx, ty);
      const target = position.board[to];
      const captures = (target && colorOf(target) !== color) || to === position.ep;
      if (!captures) continue;
      if (ty === lastRank) {
        for (const promotion of PROMOTIONS) moves.push({ from, to, promotion });
      } else {
        moves.push({ from, to });
      }
    }
    return moves;
  }

  if (kind === 'n') {
    for (const [dx, dy] of KNIGHT) add(x + dx, y + dy);
    return moves;
  }

  if (kind === 'b') { slide(DIAGONAL); return moves; }
  if (kind === 'r') { slide(STRAIGHT); return moves; }
  if (kind === 'q') { slide([...DIAGONAL, ...STRAIGHT]); return moves; }

  for (const [dx, dy] of [...DIAGONAL, ...STRAIGHT]) add(x + dx, y + dy);

  // 캐슬링. 권리 문자가 남아 있어도 룩이 잡혔거나 사이가 막혔으면 못 한다.
  // 지나가는 칸이 공격받아도 안 되므로 세 칸을 모두 본다.
  const rank = color === WHITE ? '1' : '8';
  const rights = color === WHITE ? { short: 'K', long: 'Q' } : { short: 'k', long: 'q' };
  const rook = color === WHITE ? 'R' : 'r';
  if (from === `e${rank}` && !attacksSquare(position.board, from, other(color))) {
    const free = (...squares) => squares.every((square) => !position.board[square]);
    const safe = (...squares) => squares.every((square) => !attacksSquare(position.board, square, other(color)));

    if (position.castling.includes(rights.short) && position.board[`h${rank}`] === rook
      && free(`f${rank}`, `g${rank}`) && safe(`f${rank}`, `g${rank}`)) {
      moves.push({ from, to: `g${rank}` });
    }
    if (position.castling.includes(rights.long) && position.board[`a${rank}`] === rook
      && free(`b${rank}`, `c${rank}`, `d${rank}`) && safe(`c${rank}`, `d${rank}`)) {
      moves.push({ from, to: `c${rank}` });
    }
  }

  return moves;
}

/**
 * 수를 둔 판. 앙파상으로 잡히는 폰과 캐슬링의 룩처럼 "출발-도착" 두 칸만으로는
 * 표현되지 않는 이동이 있어서, 여기서 함께 옮긴다.
 */
function applyMove(position, uci) {
  const { from, to, promotion } = moveParts(uci);
  const piece = position.board[from];
  if (!piece) throw new Error(`출발 칸에 말이 없습니다: ${from}`);

  const color = colorOf(piece);
  const kind = piece.toLowerCase();
  const board = { ...position.board };
  const captured = board[to];

  delete board[from];
  board[to] = promotion
    ? (color === WHITE ? promotion.toUpperCase() : promotion.toLowerCase())
    : piece;

  // 앙파상은 도착 칸이 비어 있고, 잡히는 폰은 그 옆 칸에 있다.
  let enPassant = false;
  if (kind === 'p' && to === position.ep && !captured) {
    enPassant = true;
    delete board[squareOf(fileOf(to), rankOf(from))];
  }

  if (kind === 'k' && Math.abs(fileOf(to) - fileOf(from)) === 2) {
    const rank = from[1];
    const rookFrom = fileOf(to) === 6 ? `h${rank}` : `a${rank}`;
    const rookTo = fileOf(to) === 6 ? `f${rank}` : `d${rank}`;
    board[rookTo] = board[rookFrom];
    delete board[rookFrom];
  }

  // 캐슬링 권리는 킹이 움직이거나, 룩이 제자리를 떠나거나, 제자리에서 잡히면
  // 사라진다. 세 번째를 빠뜨리기 쉬운데 그러면 없는 룩으로 캐슬링하게 된다.
  let castling = position.castling;
  const drop = (letters) => { for (const letter of letters) castling = castling.replace(letter, ''); };
  if (kind === 'k') drop(color === WHITE ? 'KQ' : 'kq');
  for (const [square, letter] of [['a1', 'Q'], ['h1', 'K'], ['a8', 'q'], ['h8', 'k']]) {
    if (from === square || to === square) drop(letter);
  }

  const twoStep = kind === 'p' && Math.abs(rankOf(to) - rankOf(from)) === 2;

  return {
    board,
    turn: other(color),
    castling,
    ep: twoStep ? squareOf(fileOf(from), (rankOf(from) + rankOf(to)) / 2) : null,
    halfmove: (kind === 'p' || captured || enPassant) ? 0 : position.halfmove + 1,
    fullmove: position.fullmove + (color === BLACK ? 1 : 0),
  };
}

/** 실제로 둘 수 있는 수. from을 주면 그 칸의 수만. */
function legalMoves(position, from) {
  const squares = from ? [from] : Object.keys(position.board);
  const moves = [];
  for (const square of squares) {
    const piece = position.board[square];
    if (!piece || colorOf(piece) !== position.turn) continue;
    for (const move of pseudoMoves(position, square)) {
      const next = applyMove(position, moveToUci(move));
      if (!inCheck(next, position.turn)) moves.push(move);
    }
  }
  return moves;
}

const isLegal = (position, uci) => legalMoves(position, uci.slice(0, 2)).some((m) => moveToUci(m) === uci);

/** 지금 판의 상태. 화면이 "체크", "메이트"를 말할 근거다. */
function positionStatus(position) {
  const check = inCheck(position);
  if (legalMoves(position).length > 0) return check ? 'check' : 'normal';
  return check ? 'checkmate' : 'stalemate';
}

// --- 퍼즐 진행 ---
//
// Lichess 퍼즐의 moves[0]은 상대가 둔 실수다. 그 수를 먼저 두고 나서 플레이어
// 차례가 되므로, 시작 판은 FEN 그대로가 아니라 한 수 진행한 뒤의 판이다.

function playerColor(puzzle) {
  return parseFen(puzzle.fen).turn === WHITE ? BLACK : WHITE;
}

function startPuzzle(puzzle) {
  const beforeBlunder = parseFen(puzzle.fen);
  const first = puzzle.moves[0];
  return {
    puzzle,
    position: applyMove(beforeBlunder, first),
    color: playerColor(puzzle),
    solutionIndex: 1,
    status: 'playing',
    mistakes: 0,
    lastMove: moveParts(first),
  };
}

function expectedMove(state) {
  return state.puzzle.moves[state.solutionIndex] || null;
}

/**
 * 정답 수와 대조한다. 규칙에 맞는 수인지도 함께 보는데, 화면이 이미 막고 있어도
 * 여기서 다시 보는 이유는 이 파일만 쓰는 쪽(테스트·다른 화면)이 있을 수 있어서다.
 *
 * 마지막 수에서는 메이트라면 정답이 아니어도 받아 준다. 메이트가 둘 이상인
 * 자리가 실제로 있고, 그때 "메이트인데 오답"이라고 하면 규칙이 틀린 셈이 된다.
 */
function attemptMove(state, from, to, promotion) {
  if (state.status !== 'playing') return { state, correct: false, reason: 'finished' };

  const played = `${from}${to}${promotion || ''}`;
  if (!isLegal(state.position, played)) {
    return { state, correct: false, reason: 'illegal' };
  }

  const expected = expectedMove(state);
  const isLast = state.solutionIndex === state.puzzle.moves.length - 1;
  let accepted = played === expected;
  if (!accepted && isLast && positionStatus(applyMove(state.position, played)) === 'checkmate') {
    accepted = true;
  }

  if (!accepted) {
    return { state: { ...state, mistakes: state.mistakes + 1 }, correct: false, reason: 'wrong' };
  }

  const position = applyMove(state.position, played);
  const solutionIndex = state.solutionIndex + 1;
  // 메이트로 끝냈다면 남은 수순이 있어도 거기서 끝이다.
  const done = solutionIndex >= state.puzzle.moves.length || positionStatus(position) === 'checkmate';
  const status = done ? 'solved' : 'replying';
  return {
    state: { ...state, position, solutionIndex, status, lastMove: moveParts(played) },
    correct: true,
    reason: status,
  };
}

function playReply(state) {
  if (state.status !== 'replying') return state;
  const reply = expectedMove(state);
  const position = applyMove(state.position, reply);
  const solutionIndex = state.solutionIndex + 1;
  return {
    ...state,
    position,
    solutionIndex,
    status: solutionIndex >= state.puzzle.moves.length ? 'solved' : 'playing',
    lastMove: moveParts(reply),
  };
}

const api = {
  FILES, WHITE, BLACK,
  colorOf, other, squareOf, fileOf, rankOf,
  parseFen, toFen, moveParts, moveToUci,
  attacksSquare, kingSquare, inCheck,
  pseudoMoves, legalMoves, isLegal, applyMove, positionStatus,
  playerColor, startPuzzle, expectedMove, attemptMove, playReply,
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.ChessPuzzleLogic = api;

})(typeof window !== 'undefined' ? window : globalThis);
