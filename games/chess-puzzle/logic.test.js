'use strict';

// 실행: node games/chess-puzzle/logic.test.js
const fs = require('fs');
const path = require('path');
const L = require('./logic.js');

global.window = global;

// 화면은 덩이를 script 태그로 하나씩 받아 가지만, 여기서는 전부 풀어 봐야
// 하므로 다 읽는다. 덩이 파일이 콜백 없이 자기 자신을 표에 등록하는 구조라
// require만으로도 브라우저와 같은 자료가 모인다.
const PUZZLE_DIR = path.join(__dirname, 'puzzles');
require(path.join(PUZZLE_DIR, 'index.js'));
for (const file of fs.readdirSync(PUZZLE_DIR).sort()) {
  if (file !== 'index.js' && file.endsWith('.js')) require(path.join(PUZZLE_DIR, file));
}

let passed = 0;
let failed = 0;

function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
  } else {
    failed++;
    console.log(`실패: ${name}\n  결과 ${a}\n  기대 ${e}`);
  }
}

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const uciOf = (position, from) => L.legalMoves(position, from).map(L.moveToUci).sort();

// --- FEN 읽고 쓰기 ---
{
  const position = L.parseFen(START);
  check('시작 위치의 말 수', Object.keys(position.board).length, 32);
  check('a1은 백 룩', position.board.a1, 'R');
  check('e8은 흑 킹', position.board.e8, 'k');
  check('차례', position.turn, 'w');
  check('캐슬링 권리', position.castling, 'KQkq');
  check('앙파상 칸 없음', position.ep, null);
  // 뒤쪽 칸까지 제대로 읽는지는 되쓰기로 확인하는 것이 가장 확실하다.
  check('FEN 왕복', L.toFen(position), START);
  check('앙파상 FEN 왕복',
    L.toFen(L.parseFen('rnbqkbnr/pp1ppppp/8/8/2pP4/8/PPP1PPPP/RNBQKBNR b KQkq d3 0 3')),
    'rnbqkbnr/pp1ppppp/8/8/2pP4/8/PPP1PPPP/RNBQKBNR b KQkq d3 0 3');
}

// --- 말별 이동 규칙 ---
{
  const position = L.parseFen(START);
  check('시작 위치의 합법 수는 20가지', L.legalMoves(position).length, 20);
  check('폰은 한 칸 또는 두 칸', uciOf(position, 'e2'), ['e2e3', 'e2e4']);
  check('나이트는 말을 넘는다', uciOf(position, 'b1'), ['b1a3', 'b1c3']);
  check('막힌 비숍은 갈 곳이 없다', uciOf(position, 'c1'), []);
}

{
  // 빈 판 한가운데의 각 말. 갈 수 있는 칸 수는 규칙이 정하는 고정값이다.
  // 킹은 d4의 가로·세로·대각선 어디에도 걸리지 않는 a8과 h1에 둔다 — 여기에
  // 걸치면 막혀서 개수가 줄고, 그러면 규칙이 아니라 자리를 재게 된다.
  const put = (piece, square) => {
    const position = L.parseFen('k7/8/8/8/8/8/8/7K w - - 0 1');
    position.board[square] = piece;
    return position;
  };
  check('나이트 d4', L.legalMoves(put('N', 'd4'), 'd4').length, 8);
  check('비숍 d4', L.legalMoves(put('B', 'd4'), 'd4').length, 13);
  check('룩 d4', L.legalMoves(put('R', 'd4'), 'd4').length, 14);
  check('퀸 d4', L.legalMoves(put('Q', 'd4'), 'd4').length, 27);
}

// --- 캐슬링 ---
{
  const ready = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';
  check('양쪽 캐슬링이 다 가능하다',
    uciOf(L.parseFen(ready), 'e1').includes('e1g1') && uciOf(L.parseFen(ready), 'e1').includes('e1c1'), true);

  const done = L.applyMove(L.parseFen(ready), 'e1g1');
  check('캐슬링하면 룩도 함께 옮겨진다', [done.board.g1, done.board.f1, done.board.e1, done.board.h1],
    ['K', 'R', undefined, undefined]);
  check('캐슬링하면 그 색의 권리가 사라진다', done.castling, 'kq');

  // 룩이 제자리에서 잡히는 경우. 권리 문자만 보고 두면 없는 룩으로 캐슬링한다.
  const rookTaken = L.applyMove(L.parseFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1'), 'a1a8');
  check('제자리 룩이 잡히면 그 권리도 사라진다', rookTaken.castling, 'Kk');

  check('지나가는 칸이 공격받으면 캐슬링 불가',
    uciOf(L.parseFen('4k3/8/8/8/8/8/5q2/R3K2R w KQ - 0 1'), 'e1').includes('e1g1'), false);
  check('체크 중에는 캐슬링 불가',
    uciOf(L.parseFen('4k3/8/8/8/8/8/4q3/R3K2R w KQ - 0 1'), 'e1').includes('e1g1'), false);
  check('사이가 막히면 캐슬링 불가',
    uciOf(L.parseFen('4k3/8/8/8/8/8/8/R3KB1R w KQ - 0 1'), 'e1').includes('e1g1'), false);
}

// --- 앙파상 ---
{
  const position = L.parseFen('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1');
  check('앙파상 수가 생긴다', uciOf(position, 'e5').includes('e5d6'), true);
  const after = L.applyMove(position, 'e5d6');
  check('앙파상은 옆 칸의 폰을 잡는다', [after.board.d6, after.board.d5], ['P', undefined]);

  const twoStep = L.applyMove(L.parseFen(START), 'e2e4');
  check('두 칸 전진은 앙파상 칸을 남긴다', twoStep.ep, 'e3');
  check('한 칸 전진은 남기지 않는다', L.applyMove(L.parseFen(START), 'e2e3').ep, null);
}

// --- 프로모션 ---
{
  const position = L.parseFen('8/4P3/8/8/8/8/8/K6k w - - 0 1');
  check('프로모션은 네 가지', uciOf(position, 'e7'), ['e7e8b', 'e7e8n', 'e7e8q', 'e7e8r']);
  check('고른 말로 바뀐다', L.applyMove(position, 'e7e8n').board.e8, 'N');
  check('흑은 소문자로 바뀐다',
    L.applyMove(L.parseFen('K6k/8/8/8/8/8/4p3/8 b - - 0 1'), 'e2e1q').board.e1, 'q');
}

// --- 체크·메이트·스테일메이트 ---
{
  check('체크', L.positionStatus(L.parseFen('4k3/8/8/8/8/8/8/4K1R1 b - - 0 1')), 'normal');
  check('룩이 같은 파일에 서면 체크', L.positionStatus(L.parseFen('4k3/8/8/8/8/8/8/4R1K1 b - - 0 1')), 'check');
  check('백 랭크 메이트', L.positionStatus(L.parseFen('R5k1/5ppp/8/8/8/8/8/6K1 b - - 0 1')), 'checkmate');
  check('스테일메이트', L.positionStatus(L.parseFen('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1')), 'stalemate');

  // 핀된 말은 움직이면 자기 킹이 잡힌다.
  check('핀된 나이트는 못 움직인다', uciOf(L.parseFen('4r2k/8/8/8/8/4N3/8/4K3 w - - 0 1'), 'e3'), []);
  // 체크 중에는 체크를 푸는 수만 남는다.
  // e파일로 체크를 받은 킹. e2로는 여전히 룩의 시선 안이라 못 간다.
  check('체크 중에는 푸는 수만',
    L.legalMoves(L.parseFen('4r2k/8/8/8/8/8/8/4K3 w - - 0 1')).map(L.moveToUci).sort(),
    ['e1d1', 'e1d2', 'e1f1', 'e1f2']);
}

// --- perft ---
// 수 생성기가 맞는지 확인하는 표준 방법이다. 규칙 하나라도 어긋나면 개수가
// 어긋나므로, 캐슬링·앙파상·프로모션·핀을 한꺼번에 잡아낸다. 깊이는 테스트가
// 몇 초 안에 끝나는 선에서 골랐다 — Kiwipete는 예외 규칙이 가장 많이 얽혀
// 있어 깊이를 하나 더 준다.
{
  const perft = (position, depth) => {
    if (depth === 0) return 1;
    let total = 0;
    for (const move of L.legalMoves(position)) {
      total += perft(L.applyMove(position, L.moveToUci(move)), depth - 1);
    }
    return total;
  };
  const cases = [
    ['시작 위치', START, [20, 400, 8902]],
    ['Kiwipete', 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039, 97862]],
    ['앙파상·룩 끝내기', '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812]],
    ['프로모션 많은 자리', 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467]],
  ];
  for (const [name, fen, want] of cases) {
    const position = L.parseFen(fen);
    check(`perft ${name}`, want.map((_, i) => perft(position, i + 1)), want);
  }
}

// --- 퍼즐 진행 ---
{
  const puzzle = {
    fen: 'q3k1nr/1pp1nQpp/3p4/1P2p3/4P3/B1PP1b2/B5PP/5K2 b k - 0 17',
    moves: ['e8d7', 'a2e6', 'd7d8', 'f7f8'],
  };
  check('상대의 실수를 먼저 둔 판에서 시작한다', L.startPuzzle(puzzle).position.board.d7, 'k');
  check('플레이어 색', L.startPuzzle(puzzle).color, 'w');
  check('직전 수가 기록된다', L.startPuzzle(puzzle).lastMove, { from: 'e8', to: 'd7', promotion: null });

  const state = L.startPuzzle(puzzle);
  check('다음 정답 수', L.expectedMove(state), 'a2e6');

  const illegal = L.attemptMove(state, 'a2', 'a4');
  check('규칙에 어긋나는 수는 오답 이전에 막힌다', illegal.reason, 'illegal');
  check('막힌 수는 실수로 세지 않는다', illegal.state.mistakes, 0);

  const wrong = L.attemptMove(state, 'a2', 'b1');
  check('규칙에는 맞지만 정답이 아닌 수', wrong.reason, 'wrong');
  check('오답은 실수로 센다', wrong.state.mistakes, 1);

  const right = L.attemptMove(state, 'a2', 'e6');
  check('정답 수', right.correct, true);
  check('정답을 두면 상대 응수 차례', right.state.status, 'replying');
  const replied = L.playReply(right.state);
  check('응수 뒤 다시 내 차례', replied.status, 'playing');
  check('응수도 직전 수로 기록된다', replied.lastMove.to, 'd8');
  check('마지막 수를 두면 풀림', L.attemptMove(replied, 'f7', 'f8').state.status, 'solved');
}

// 메이트가 여럿인 자리에서 정답이 아닌 메이트를 거절하면 규칙이 틀린 셈이 된다.
{
  // 킹이 h8로 피한 뒤 Ra8도 Qb8도 백 랭크 메이트다.
  const state = L.startPuzzle({
    fen: '6k1/5ppp/8/8/8/8/8/RQ4K1 b - - 0 1',
    moves: ['g8h8', 'a1a8'],
  });
  const other = L.attemptMove(state, 'b1', 'b8');
  check('다른 메이트도 정답으로 받는다', other.correct, true);
  check('그 수로도 풀린 것으로 본다', other.state.status, 'solved');
}

// --- 담겨 있는 퍼즐 ---
// Lichess Puzzle Database에서 고른 자료다. 저쪽에서 이미 검증된 수순이지만
// 우리 엔진이 못 따라가면 화면에서도 못 푸므로, 담긴 것을 하나도 빼지 않고
// 전부 풀어 본다.
const INDEX = global.CHESS_PUZZLE_INDEX;
const CHUNKS = global.CHESS_PUZZLE_CHUNKS || {};
const LEVELS = Object.keys(INDEX.levels);

// 한 가지 푸는 방법이 차지해도 되는 몫. 실측하고 정했다 — 지금 자료에서 가장
// 많은 것이 "폰으로 잡지도 체크도 아닌 두 수"로 4.1%다. 다시 구웠을 때 그 쏠림이
// 눈에 띄게 나빠지면 걸리도록 6%로 잡는다.
const METHOD_SHARE_AT = 0.06;

// 목차가 말하는 자리마다 실제 문제가 있는지 본다. 화면은 목차를 믿고 번호를
// 세므로, 여기가 어긋나면 문제 번호를 넘기다 빈 자리를 만난다.
const ALL = [];
{
  const ids = new Set();
  let duplicated = 0;
  let missing = 0;
  const counts = {};

  for (const level of LEVELS) {
    const count = INDEX.levels[level].count;
    counts[level] = 0;
    for (let n = 0; n * INDEX.chunkSize < count; n++) {
      const name = `${level}-${String(n).padStart(2, '0')}`;
      const chunk = CHUNKS[name];
      if (!chunk) { missing++; continue; }
      const expected = Math.min(INDEX.chunkSize, count - n * INDEX.chunkSize);
      if (chunk.length !== expected) missing++;
      for (const puzzle of chunk) {
        if (ids.has(puzzle.id)) duplicated++;
        ids.add(puzzle.id);
        counts[level]++;
        ALL.push({ level, puzzle });
      }
    }
    check(`${level}: 목차의 개수만큼 담겨 있다`, counts[level], count);
    // 비어 있는 난이도가 있으면 골라도 아무것도 안 나온다.
    check(`${level}: 문제가 있다`, count > 0, true);
  }

  check('문제 아이디가 겹치지 않는다', duplicated, 0);
  check('빠지거나 크기가 어긋난 덩이가 없다', missing, 0);
  check('목차에 버전이 있다', typeof INDEX.version === 'string' && INDEX.version.length > 0, true);
  console.log(`  담긴 문제 ${ALL.length}개 — ${LEVELS.map((l) => `${l} ${counts[l]}`).join(', ')}`);

  // 판이 달라도 푸는 방법이 같으면 같은 문제를 다시 푸는 것과 다르지 않다.
  // 엔진끼리 둔 판에서 캘 때는 이 쏠림이 심해서 — "비숍으로 퀸을 잡는 한 수"
  // 하나에 열여섯 개가 몰렸다 — 겹치는 것을 아예 하나만 남겼었다.
  //
  // 지금은 그 잣대를 그대로 쓸 수 없다. 이 열쇠는 움직인 말과 잡은 말, 체크·
  // 포크·메이트 여부만 보는 기계적인 근사라서 가짓수가 몇백 개뿐인데, 문제는
  // 900개다. 하나만 남기면 900개를 담을 수가 없다. 그래서 "겹치지 않는다"를
  // **한 방법에 지나치게 몰리지 않는다**로 바꿔 지킨다.
  const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
  const methods = new Map();
  for (const { puzzle } of ALL) {
    const position = L.startPuzzle(puzzle).position;
    const uci = puzzle.moves[1];
    const to = uci.slice(2, 4);
    const piece = position.board[uci.slice(0, 2)];
    const took = position.board[to];
    const next = L.applyMove(position, uci);
    const status = L.positionStatus(next);
    const targets = L.pseudoMoves(next, to)
      .map((m) => next.board[m.to])
      .filter((p) => p && L.colorOf(p) !== L.colorOf(piece) && VALUE[p.toLowerCase()] >= 3);
    const key = [
      piece.toLowerCase(), took ? took.toLowerCase() : '-',
      status === 'check' || status === 'checkmate', status === 'checkmate',
      targets.length >= 2, Math.ceil((puzzle.moves.length - 1) / 2),
    ].join('|');
    if (!methods.has(key)) methods.set(key, []);
    methods.get(key).push(puzzle.id);
  }
  const crowded = [...methods.entries()].sort((a, b) => b[1].length - a[1].length);
  const share = crowded[0][1].length / ALL.length;
  check('한 가지 방법에 몰려 있지 않다', share <= METHOD_SHARE_AT, true);
  console.log(`  푸는 방법 ${methods.size}가지 — 가장 많은 것이 `
    + `${crowded[0][1].length}개(${(share * 100).toFixed(1)}%, ${crowded[0][0]})`);
}

for (const { level, puzzle } of ALL) {
  const label = `${puzzle.id}(${puzzle.title})`;
  check(`${label}: 수순이 짝수가 아니다`, puzzle.moves.length % 2, 0);

  let state = L.startPuzzle(puzzle);
  let illegal = null;
  let guard = 0;
  while (state.status !== 'solved' && guard++ < 40) {
    if (state.status === 'replying') { state = L.playReply(state); continue; }
    const move = L.expectedMove(state);
    if (!move) { illegal = '다음 수가 없음'; break; }
    if (!L.isLegal(state.position, move)) { illegal = `규칙 위반: ${move}`; break; }
    const result = L.attemptMove(state, move.slice(0, 2), move.slice(2, 4), move[4]);
    if (!result.correct) { illegal = `정답 수가 거부됨: ${move}`; break; }
    state = result.state;
  }
  check(`${label}: 정답 수순이 규칙에 맞는다`, illegal, null);
  check(`${label}: 끝까지 풀린다`, state.status, 'solved');
  check(`${label}: 힌트가 있다`, typeof puzzle.hint === 'string' && puzzle.hint.length > 0, true);
  check(`${label}: 제목과 주제가 있다`,
    Boolean(puzzle.title) && Array.isArray(puzzle.themes) && puzzle.themes.length > 0, true);
  // 난이도를 레이팅으로 가르므로, 담긴 덩이와 레이팅이 어긋나면 잘못 담긴 것이다.
  const [minRating, maxRating] = INDEX.levels[level].rating;
  check(`${label}: 레이팅 ${puzzle.rating}이 ${level} 구간 안에 있다`,
    puzzle.rating >= minRating && puzzle.rating <= maxRating, true);

  // 다 푼 뒤 되짚어 보여 주는 수순. 푸는 데 쓰지 않지만 판 위에서 그대로
  // 두어 보이므로, 규칙에 어긋나면 그 자리에서 화면이 멈춘다.
  if (Array.isArray(puzzle.line) && puzzle.line.length) {
    let after = state.position;
    let broken = null;
    for (const move of puzzle.line) {
      if (!L.isLegal(after, move)) { broken = move; break; }
      after = L.applyMove(after, move);
    }
    check(`${label}: 이어지는 수순이 규칙에 맞는다`, broken, null);
  }
  check(`${label}: 왜 이기는지가 적혀 있다`,
    typeof puzzle.why === 'string' && puzzle.why.length > 0, true);

  // 첫 수가 유일한 정답이어야 한다. 다른 수도 똑같이 좋으면, 그것을 둔
  // 플레이어가 오답 판정을 받는다.
  const first = L.startPuzzle(puzzle);
  const answer = puzzle.moves[1];
  const otherMates = L.legalMoves(first.position)
    .map(L.moveToUci)
    .filter((m) => m !== answer)
    .filter((m) => L.positionStatus(L.applyMove(first.position, m)) === 'checkmate');
  // 메이트가 여럿이면 규칙상 다 정답으로 받아 주므로 문제는 아니다. 다만
  // 한 수 메이트 문제에서는 그 사실을 알고 있어야 한다.
  check(`${label}: 다른 메이트가 있으면 그것도 정답으로 받는다`,
    otherMates.length === 0 || L.attemptMove(first, otherMates[0].slice(0, 2), otherMates[0].slice(2, 4)).correct,
    true);
}

console.log(`${passed}개 통과, ${failed}개 실패`);
process.exit(failed ? 1 : 0);
