'use strict';

// 퍼즐을 캐서 puzzles.js를 굽는 오프라인 도구. 배포되는 사이트에는 끼지 않는다.
//
// 왜 만들었나: lichess 퍼즐 데이터베이스(CC0)를 받아 올 수 있으면 그걸 쓰는
// 것이 낫다. 하지만 이 환경에서는 lichess가 막혀 있어 네 문제를 손으로 옮긴
// 것이 전부였다. 그래서 직접 만든다.
//
// 어떻게 만드나: 엔진끼리 두게 하고, 실수가 나온 자리를 골라낸다. lichess가
// 사람의 대국에서 하는 일과 같고, 다른 점은 실수를 사람이 아니라 낮은 깊이로
// 두는 엔진이 낸다는 것뿐이다. 조건은 둘이다 — 실수 직전에는 팽팽했을 것,
// 실수 뒤에는 한 수만이 결정적일 것. 둘 다여야 "찾아낼 것이 있는" 문제가 된다.
//
// 엔진을 둘 쓴다. Stockfish는 자리를 만들고 값을 매기고, 저장소의 logic.js는
// 그 결과를 규칙으로 다시 검증한다 — 메이트는 완전 탐색으로 증명하고, 정답이
// 유일한지도 여기서 본다. 엔진 말만 믿으면 화면에서 못 푸는 판이 섞인다.
//
// 실행 (Stockfish는 저장소 밖에 설치한다 — 저장소에는 패키지 매니저를 두지 않는다):
//   npm i stockfish --prefix /tmp/sf
//   export STOCKFISH=/tmp/sf/node_modules/stockfish/index.js
//   node games/chess-puzzle/bake.js mine 20 12345 /tmp/w1.json   # 코어 수만큼 씨앗을 달리해 동시에
//   node games/chess-puzzle/bake.js write /tmp/w*.json           # 합쳐서 puzzles.js로
//
// mine의 넷째 인자는 두는 깊이다(기본 4). 이 값이 난이도를 가른다 — 얕게 두면
// 실수가 커서 벌주는 수가 눈에 띄고, 깊게 두면 실수가 미묘해서 벌주는 수도 잘
// 안 보인다. 어려운 문제가 더 필요하면 7~8로 올려 한 번 더 캔다.

const fs = require('fs');
const path = require('path');
const L = require('./logic.js');

const ENGINE = process.env.STOCKFISH;
const OUT = path.join(__dirname, 'puzzles.js');

// --- Stockfish 창구 ---

function openEngine() {
  if (!ENGINE) throw new Error('STOCKFISH 환경변수에 엔진 경로를 주세요 (위 주석 참고)');
  const initEngine = require(ENGINE);
  return new Promise((resolve, reject) => {
    const engine = initEngine('lite-single', (err) => { if (err) reject(err); });
    const waiters = [];
    let buffer = [];
    engine.listener = (line) => {
      buffer.push(line);
      for (let i = waiters.length - 1; i >= 0; i--) {
        if (waiters[i].re.test(line)) { waiters[i].resolve(line); waiters.splice(i, 1); }
      }
    };
    const send = (cmd) => engine.sendCommand(cmd);
    const until = (re, ms = 120000) => new Promise((res, rej) => {
      const waiter = { re, resolve: res };
      waiters.push(waiter);
      setTimeout(() => {
        const i = waiters.indexOf(waiter);
        if (i >= 0) { waiters.splice(i, 1); rej(new Error('시간 초과: ' + re)); }
      }, ms);
    });

    const api = {
      async setup() {
        send('uci');
        await until(/^uciok/);
        send('setoption name Threads value 1');
        send('setoption name Hash value 128');
        send('ucinewgame');
        send('isready');
        await until(/^readyok/);
      },
      /** 한 자리를 분석해 상위 수와 점수를 돌려준다. */
      async analyse(fen, depth, multipv = 2) {
        send(`setoption name MultiPV value ${multipv}`);
        send('isready');
        await until(/^readyok/);
        buffer = [];
        send(`position fen ${fen}`);
        send(`go depth ${depth}`);
        const done = await until(/^bestmove/);

        // 마지막으로 끝낸 깊이의 info만 본다. 앞선 깊이의 것이 섞이면 순위가 뒤집힌다.
        const byRank = new Map();
        for (const info of buffer) {
          if (!/^info .*\bmultipv \d+/.test(info) || !/\bpv\b/.test(info)) continue;
          const depthAt = Number((info.match(/\bdepth (\d+)/) || [])[1]);
          const rank = Number((info.match(/\bmultipv (\d+)/) || [])[1]);
          const cp = info.match(/\bscore cp (-?\d+)/);
          const mate = info.match(/\bscore mate (-?\d+)/);
          const pv = (info.match(/\bpv (.+)$/) || [])[1];
          if (!rank || !pv) continue;
          const prev = byRank.get(rank);
          if (prev && prev.depth > depthAt) continue;
          byRank.set(rank, {
            depth: depthAt,
            cp: cp ? Number(cp[1]) : null,
            mate: mate ? Number(mate[1]) : null,
            pv: pv.split(' '),
          });
        }
        return {
          best: done.split(' ')[1],
          lines: [...byRank.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v),
        };
      },
      quit() { try { send('quit'); } catch { /* 무시 */ } },
    };

    // sendCommand가 생겨야 말이 통한다.
    const boot = setInterval(() => {
      if (typeof engine.sendCommand === 'function') { clearInterval(boot); resolve(api); }
    }, 30);
    setTimeout(() => { clearInterval(boot); reject(new Error('엔진이 뜨지 않음')); }, 60000);
  });
}

// 메이트를 하나의 점수로 눕힌다. 수가 짧을수록 높다 — 같은 수로 메이트하는 수가
// 둘이면 차이가 0이 되어, 아래의 "한 수만 이긴다" 검사가 그대로 걸러 준다.
const cpOf = (line) => (line.mate !== null
  ? (line.mate > 0 ? 100000 - line.mate * 100 : -100000 - line.mate * 100)
  : line.cp);

const mulberry32 = (seed) => {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// --- 우리 엔진으로 메이트를 증명한다 ---

/** 지금 두는 쪽이 n수 안에 강제로 메이트할 수 있는가. 완전 탐색이라 증명이 된다. */
function canForceMate(position, n) {
  if (n <= 0) return false;
  for (const move of L.legalMoves(position)) {
    const next = L.applyMove(position, L.moveToUci(move));
    if (L.positionStatus(next) === 'checkmate') return true;
    if (n === 1) continue;
    const replies = L.legalMoves(next);
    if (replies.length === 0) continue; // 스테일메이트는 메이트가 아니다
    if (replies.every((r) => canForceMate(L.applyMove(next, L.moveToUci(r)), n - 1))) return true;
  }
  return false;
}

/** n수 메이트를 만드는 첫 수들. 하나뿐이어야 정답이 갈린다. */
function mateMoves(position, n) {
  const found = [];
  for (const move of L.legalMoves(position)) {
    const uci = L.moveToUci(move);
    const next = L.applyMove(position, uci);
    if (L.positionStatus(next) === 'checkmate') { found.push(uci); continue; }
    if (n === 1) continue;
    const replies = L.legalMoves(next);
    if (replies.length === 0) continue;
    if (replies.every((r) => canForceMate(L.applyMove(next, L.moveToUci(r)), n - 1))) found.push(uci);
  }
  return found;
}

// --- 캐기 ---

/** 엔진끼리 한 판. 최선수만 두면 실수가 없고, 실수가 없으면 퍼즐도 없다. */
async function playGame(sf, { plyLimit, playDepth, openingPlies, blunderRate, blunderSpread, rng }) {
  let position = L.parseFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  const trail = [];

  for (let ply = 0; ply < plyLimit; ply++) {
    const status = L.positionStatus(position);
    if (status === 'checkmate' || status === 'stalemate') break;
    const fen = L.toFen(position);

    // 흔들 때는 넓게 본다. 차선수 정도로는 판이 안 기울어서, 결정적인 자리가
    // 나와도 그것을 벌줄 수 있는 수가 여럿이 된다 — 그러면 정답이 유일하지 않다.
    const wobble = ply < openingPlies || rng() < blunderRate;
    const { lines } = await sf.analyse(fen, playDepth, wobble ? blunderSpread : 1);
    if (!lines.length) break;
    const uci = (wobble ? lines[Math.floor(rng() * lines.length)] : lines[0]).pv[0];
    if (!uci || !L.isLegal(position, uci)) break;

    trail.push({ fen, uci });
    position = L.applyMove(position, uci);
  }
  return trail;
}

/** 한 판을 훑어 퍼즐이 될 자리를 찾는다. */
async function minePuzzles(sf, trail, { depth, minEdge, maxBefore, minWin }) {
  const cache = new Map();
  const evalAt = async (fen, multipv) => {
    const key = `${fen}|${multipv}`;
    if (!cache.has(key)) cache.set(key, await sf.analyse(fen, depth, multipv));
    return cache.get(key);
  };

  const out = [];
  for (let i = 0; i < trail.length - 1; i++) {
    const before = trail[i];     // 실수를 두기 직전
    const after = trail[i + 1];  // 실수를 둔 뒤, 푸는 쪽 차례

    const beforeEval = await evalAt(before.fen, 1);
    if (!beforeEval.lines.length) continue;
    // 이미 한쪽이 크게 유리했다면 "실수를 벌준다"는 이야기가 성립하지 않는다.
    if (Math.abs(cpOf(beforeEval.lines[0])) > maxBefore) continue;

    const position = L.parseFen(after.fen);
    if (L.legalMoves(position).length < 2) continue; // 외길수는 문제가 아니다

    const solved = await evalAt(after.fen, 3);
    if (solved.lines.length < 2) continue;
    const bestCp = cpOf(solved.lines[0]);
    const secondCp = cpOf(solved.lines[1]);
    const isMate = solved.lines[0].mate !== null && solved.lines[0].mate > 0;
    if (!isMate && bestCp < minWin) continue;
    if (bestCp - secondCp < minEdge) continue;

    const answer = solved.lines[0].pv[0];
    if (!answer || !L.isLegal(position, answer)) continue;

    let solution;
    let mateIn = null;
    if (isMate && solved.lines[0].mate === 2) {
      // 두 수 메이트만 수순을 끝까지 담는다. 우리 엔진이 증명할 수 있는 깊이다.
      const winners = mateMoves(position, 2);
      if (winners.length !== 1 || winners[0] !== answer) continue;
      const reply = solved.lines[0].pv[1];
      const afterAnswer = L.applyMove(position, answer);
      if (!reply || !L.isLegal(afterAnswer, reply)) continue;
      const afterReply = L.applyMove(afterAnswer, reply);
      const finish = L.legalMoves(afterReply).map(L.moveToUci)
        .find((m) => L.positionStatus(L.applyMove(afterReply, m)) === 'checkmate');
      if (!finish) continue;
      mateIn = 2;
      solution = [answer, reply, finish];
    } else {
      // 나머지는 한 수짜리로 둔다. 수순을 길게 가져가면 상대의 응수가 유일하지
      // 않은 구간이 생겨, 플레이어가 다른 좋은 수를 두고도 오답 판정을 받는다.
      solution = [answer];
      if (isMate) mateIn = solved.lines[0].mate;
    }

    out.push({
      fen: before.fen,
      moves: [before.uci, ...solution],
      mateIn,
      edge: bestCp - secondCp,
    });
  }
  return out;
}

/** 담기 전에 저장소 규칙으로 한 번 더 푼다. 여기서 걸리면 화면에서도 못 푼다. */
function playable(puzzle) {
  let state = L.startPuzzle(puzzle);
  for (let i = 1; i < puzzle.moves.length; i++) {
    if (state.status === 'replying') state = L.playReply(state);
    if (state.status !== 'playing') return false;
    const move = puzzle.moves[i];
    const result = L.attemptMove(state, move.slice(0, 2), move.slice(2, 4), move[4]);
    if (!result.correct) return false;
    state = result.state;
  }
  return state.status === 'solved';
}

async function mine(minutes, seed, out, playDepth = 4) {
  const sf = await openEngine();
  await sf.setup();
  const rng = mulberry32(seed);
  const found = [];
  const seen = new Set();
  const deadline = Date.now() + minutes * 60000;
  let games = 0;

  while (Date.now() < deadline) {
    const trail = await playGame(sf, {
      plyLimit: 70, playDepth, openingPlies: 10, blunderRate: 0.3, blunderSpread: 8, rng,
    });
    games++;
    for (const puzzle of await minePuzzles(sf, trail, { depth: 12, minEdge: 250, maxBefore: 200, minWin: 200 })) {
      const key = `${puzzle.fen}|${puzzle.moves.join(' ')}`;
      if (seen.has(key) || !playable(puzzle)) continue;
      seen.add(key);
      found.push(puzzle);
      fs.writeFileSync(out, JSON.stringify(found));
    }
    if (games % 10 === 0) console.error(`씨앗 ${seed}(깊이 ${playDepth}): ${games}판, ${found.length}개`);
  }
  console.error(`씨앗 ${seed}(깊이 ${playDepth}): 완료 ${games}판, ${found.length}개`);
  sf.quit();
}

// --- 난이도 매기기 ---

const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
const DEPTHS = [4, 6, 8, 10];

/**
 * 정답 수가 판에서 무엇을 하는지. 제목과 주제는 여기서 읽은 사실로만 만든다 —
 * 그럴듯한 이름을 지어내면 판과 어긋난 설명이 붙는다.
 */
function readMove(puzzle) {
  const position = L.startPuzzle(puzzle).position;
  const uci = puzzle.moves[1];
  const to = uci.slice(2, 4);
  const piece = position.board[uci.slice(0, 2)];
  const captured = position.board[to];
  const next = L.applyMove(position, uci);
  const status = L.positionStatus(next);

  // 옮긴 자리에서 이 말이 노리는 적의 큰 말들. 둘 이상이면 포크다.
  const targets = L.pseudoMoves(next, to)
    .map((m) => next.board[m.to])
    .filter((p) => p && L.colorOf(p) !== L.colorOf(piece) && VALUE[p.toLowerCase()] >= 3);

  return {
    kind: piece.toLowerCase(),
    tookKind: captured ? captured.toLowerCase() : null,
    capture: captured ? VALUE[captured.toLowerCase()] : 0,
    check: status === 'check' || status === 'checkmate',
    mate: status === 'checkmate',
    promotion: Boolean(uci[4]),
    fork: targets.length >= 2,
    solverMoves: Math.ceil((puzzle.moves.length - 1) / 2),
    // 잡은 것보다 비싼 말을 잡히는 자리에 놓는 수는 눈으로는 손해로 보인다.
    sacrifice: L.attacksSquare(next.board, to, next.turn)
      && VALUE[piece.toLowerCase()] > (captured ? VALUE[captured.toLowerCase()] : 0),
  };
}

/**
 * 난이도 점수. 하나로만 가르면 어느 쪽이든 어긋난다 — 수순이 짧아도 조용한
 * 수는 안 보이고, 수순이 길어도 외길이면 쉽다. 그래서 여러 가지를 섞는다.
 *
 * 무게가 가장 큰 항은 "몇 수 앞을 봐야 보이는가"다. 깊이 4에서 이미 최선수로
 * 꼽히는 수는 눈에 띄고, 깊이 10까지 가야 나오는 수는 잘 안 보인다. 사람이
 * 느끼는 어려움에 가장 가까워서 실측해 보고 넣었다.
 *
 * "비슷해 보이는 수의 개수"를 쓰려다 뺐다. 캐는 조건이 차선수와 250cp 이상
 * 벌어질 것을 요구하므로 그 값은 언제나 0이 되어 아무것도 가르지 못한다.
 */
function score(puzzle, facts) {
  let value = 0;
  value += (facts.solverMoves - 1) * 40;                   // 수순이 길수록
  value += Math.max(0, (puzzle.foundDepth || 4) - 4) * 6;  // 깊이 봐야 보일수록
  if (!facts.capture && !facts.check) value += 25;         // 잡지도 체크도 아닌 조용한 수
  if (facts.sacrifice) value += 30;                        // 손해처럼 보이는 수
  value += (1 - Math.min(puzzle.edge, 800) / 800) * 15;    // 차선수와 벌어진 폭이 좁을수록
  if (puzzle.mateIn === 1) value -= 20;                    // 한 수 메이트는 가장 눈에 띈다
  return Math.round(value);
}

/**
 * 그 문제를 "어떻게 푸는가". 좌표가 아니라 방법으로 묶는다 — 같은 수를 다른
 * 판에서 두는 것은 다른 문제지만, 다른 판에서 같은 방법을 되풀이하는 것은
 * 같은 문제다.
 *
 * 엔진끼리 둔 판에서 캐면 이 쏠림이 심하다. 222개를 매겨 보니 "비숍으로 퀸을
 * 잡는 한 수"에만 16개가 몰려 있었다. 판은 전부 달라서 판으로는 걸러지지
 * 않는다 — 실제로 시작 FEN·플레이어가 보는 판·말 배치 어느 기준으로도 겹치는
 * 것이 하나도 없었다.
 */
function methodOf(facts) {
  return [facts.kind, facts.tookKind || '-', facts.check, facts.mate, facts.fork, facts.solverMoves].join('|');
}

/**
 * 점수를 세 단계로 가르는 경계.
 *
 * 삼분위로 자르려다 말았다. 점수가 0~19에 절반 넘게 뭉쳐 있어 삼분위를 그대로
 * 쓰면 경계가 9와 11이 되고, 1점 차이로 난이도가 갈린다. 대신 분포에서 실제로
 * 벌어지는 자리를 골랐다 — 실측 217개 기준으로 107/64/50으로 나뉜다.
 * 다시 구울 때는 write가 찍어 주는 분포를 보고 고친다.
 */
const LEVEL_AT = { easy: 10, medium: 35 };
const levelOf = (value) => (value < LEVEL_AT.easy ? 'easy' : value < LEVEL_AT.medium ? 'medium' : 'hard');

// 말 이름과 조사. 제목이 열두 가지뿐이면 이백 개에 붙였을 때 같은 말만
// 되풀이된다. 움직이는 말을 넣으면 사실을 더 담으면서 종류도 늘어난다.
// 받침이 없는 이름은 나이트뿐이다.
const PIECE = { p: '폰', n: '나이트', b: '비숍', r: '룩', q: '퀸', k: '킹' };
const subject = (kind) => PIECE[kind] + (kind === 'n' ? '가' : '이');
const object = (kind) => PIECE[kind] + (kind === 'n' ? '를' : '을');

function themesOf(puzzle, facts) {
  const out = [];
  if (facts.sacrifice) out.push('희생');
  if (puzzle.mateIn === 1) out.push('한 수 메이트');
  else if (puzzle.mateIn) out.push('메이트');
  if (facts.fork) out.push('포크');
  if (facts.promotion) out.push('승격');
  if (facts.capture >= 5) out.push('큰 말 잡기');
  else if (facts.capture) out.push('잡기');
  if (!facts.capture && !facts.check) out.push('조용한 수');
  else if (facts.check && !facts.mate) out.push('체크');
  if (facts.solverMoves > 1) out.push('긴 수순');
  return out.length ? out : ['전술'];
}

function titleOf(puzzle, facts) {
  if (puzzle.mateIn === 1) return `${subject(facts.kind)} 끝낸다`;
  if (puzzle.mateIn) return '메이트로 가는 길';
  if (facts.sacrifice) return `${object(facts.kind)} 내준다`;
  if (facts.fork) return `${subject(facts.kind)} 둘을 노린다`;
  if (facts.promotion) return '끝까지 간 폰';
  if (facts.tookKind && facts.capture >= 5) return `${subject(facts.tookKind)} 놓여 있다`;
  if (facts.tookKind) return `${subject(facts.tookKind)} 지켜지지 않았다`;
  if (!facts.check) return '조용한 한 수';
  return `${subject(facts.kind)} 몰아붙인다`;
}

function hintOf(puzzle, facts) {
  if (puzzle.mateIn === 1) return '한 번에 끝낼 수 있습니다.';
  if (facts.sacrifice) return '손해처럼 보이는 수를 한 번 따져 보세요.';
  if (puzzle.mateIn) return '피할 곳을 좁혀 가면 메이트가 보입니다.';
  if (facts.fork) return '한 수로 두 개를 동시에 노릴 수 있습니다.';
  if (facts.promotion) return '폰이 끝 줄에 닿습니다.';
  if (facts.capture) return '지켜지지 않은 말이 있습니다.';
  if (facts.check) return '체크를 걸어 상대를 몰아 보세요.';
  return '잡지도 체크하지도 않는 수입니다.';
}

// 원래 담겨 있던 네 문제. 사람이 둔 대국에서 나온 것이고 lichess 레이팅이
// 붙어 있어, 점수 대신 그 레이팅으로 난이도를 준다.
const SEEDED = [
  { id: '00sO1', level: 'easy', rating: 998,
    fen: '1k1r4/pp3pp1/2p1p3/4b3/P3n1P1/8/KPP2PN1/3rBR1R b - - 2 31',
    moves: ['b8c7', 'e1a5', 'b7b6', 'f1d1'],
    themes: ['발견 공격', '전술'], title: '열린 길',
    hint: '상대의 킹과 뒤에 놓인 말을 함께 노리세요.' },
  { id: '00sHx', level: 'medium', rating: 1760,
    fen: 'q3k1nr/1pp1nQpp/3p4/1P2p3/4P3/B1PP1b2/B5PP/5K2 b k - 0 17',
    moves: ['e8d7', 'a2e6', 'd7d8', 'f7f8'],
    themes: ['메이트', '중반'], title: '대각선 위의 메이트',
    hint: '흑 킹이 옮긴 뒤, 긴 대각선을 다시 보세요.' },
  { id: '00sJb', level: 'medium', rating: 2235,
    fen: 'Q1b2r1k/p2np2p/5bp1/q7/5P2/4B3/PPP3PP/2KR1B1R w - - 1 17',
    moves: ['d1d7', 'a5e1', 'd7d1', 'e1e3', 'c1b1', 'e3b6'],
    themes: ['포크', '긴 수순'], title: '침입한 퀸',
    hint: '열린 d파일의 룩을 먼저 활용하세요.' },
  { id: '00sJ9', level: 'hard', rating: 2671,
    fen: 'r3r1k1/p4ppp/2p2n2/1p6/3P1qb1/2NQR3/PPB2PP1/R1B3K1 w - - 5 18',
    moves: ['e3g3', 'e8e1', 'g1h2', 'e1c1', 'a1c1', 'f4h6', 'h2g1', 'h6c1'],
    themes: ['유인', '포크', '희생'], title: '백 랭크의 유인',
    hint: '먼저 상대의 수비를 한 칸으로 몰아넣으세요.' },
];

async function write(files) {
  const raw = [];
  for (const file of files) raw.push(...JSON.parse(fs.readFileSync(file, 'utf8')));

  // 워커들은 서로를 못 보므로 합칠 때 중복을 다시 걸러야 한다.
  const seen = new Set();
  const unique = raw.filter((puzzle) => {
    const key = `${puzzle.fen}|${puzzle.moves.join(' ')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return playable(puzzle);
  });

  // 얕은 깊이로도 보이는 수인지 잰다. 난이도 점수의 가장 큰 항이라 여기서 채운다.
  const sf = await openEngine();
  await sf.setup();
  for (const puzzle of unique) {
    const solverFen = L.toFen(L.applyMove(L.parseFen(puzzle.fen), puzzle.moves[0]));
    puzzle.foundDepth = DEPTHS[DEPTHS.length - 1] + 2;
    for (const depth of DEPTHS) {
      const { best } = await sf.analyse(solverFen, depth, 1);
      if (best === puzzle.moves[1]) { puzzle.foundDepth = depth; break; }
    }
  }
  sf.quit();

  const scored = unique.map((puzzle) => {
    const facts = readMove(puzzle);
    const value = score(puzzle, facts);
    return { puzzle, facts, value, method: methodOf(facts) };
  });

  // 방법이 같으면 하나만 남긴다. 무리 안에서는 점수가 가장 높은 것을 고른다 —
  // 어느 것을 골라도 방법은 같으니, 가장 눈에 안 띄는 판이 문제로서 낫다.
  const best = new Map();
  for (const item of scored) {
    const kept = best.get(item.method);
    if (!kept || item.value > kept.value) best.set(item.method, item);
  }

  // 원래 있던 넷은 사람이 둔 판이라 무조건 남기고, 방법이 겹치는 만들어 낸
  // 문제를 대신 버린다.
  for (const puzzle of SEEDED) best.delete(methodOf(readMove(puzzle)));

  const made = [...best.values()]
    .sort((a, b) => a.value - b.value)
    .map(({ puzzle, facts, value }, i) => ({
      id: `g${i.toString(36)}`,
      level: levelOf(value),
      fen: puzzle.fen,
      moves: puzzle.moves,
      themes: themesOf(puzzle, facts),
      title: titleOf(puzzle, facts),
      hint: hintOf(puzzle, facts),
      value,
    }));

  const all = [...SEEDED, ...made];
  const counts = {};
  for (const puzzle of all) counts[puzzle.level] = (counts[puzzle.level] || 0) + 1;
  const values = made.map((p) => p.value).sort((a, b) => a - b);
  console.error(`캐낸 것 ${raw.length}개 → 풀리는 ${unique.length}개 → 방법이 겹치지 않는 ${made.length}개 + 원래 ${SEEDED.length}개`);
  if (values.length) {
    const q = (f) => values[Math.floor(values.length * f)];
    console.error(`점수: 최소 ${values[0]}, 1/3 ${q(1 / 3)}, 중앙 ${q(0.5)}, 2/3 ${q(2 / 3)}, 최대 ${values[values.length - 1]}`);
  }
  console.error('난이도별:', JSON.stringify(counts));

  const body = all.map((p) => `    {
      id: '${p.id}',
      level: '${p.level}',
      fen: '${p.fen}',
      moves: [${p.moves.map((m) => `'${m}'`).join(', ')}],${p.rating ? `\n      rating: ${p.rating},` : ''}
      themes: [${p.themes.map((t) => `'${t}'`).join(', ')}],
      title: '${p.title}',
      hint: '${p.hint}',
    },`).join('\n');

  fs.writeFileSync(OUT, `'use strict';

(function (root) {

  // 문제 자료. 앞의 넷은 Lichess Puzzle Database(CC0)에서 골랐고, 나머지는
  // bake.js가 만들었다 — 엔진끼리 둔 판에서 "한 수만 이기는" 자리를 캐낸 것이다.
  //
  // level은 캘 때 매긴 점수로 갈랐다. 몇 수 앞을 봐야 보이는지, 수순이 얼마나
  // 긴지, 잡지도 체크하지도 않는 수인지, 손해처럼 보이는 수인지를 섞는다.
  // 원래 있던 넷은 사람이 둔 판이라 lichess 레이팅을 그대로 썼다.
  //
  // 푸는 방법이 겹치는 것은 하나만 남겼다. 판은 전부 다르지만, 다른 판에서
  // 같은 방법을 되풀이하면 같은 문제를 다시 푸는 것과 다르지 않다.
  //
  // 제목과 주제는 판에서 읽어낸 사실로만 붙인다 — 그럴듯한 이름을 지어내면
  // 판과 어긋난 설명이 달린다.
  root.CHESS_PUZZLES = [
${body}
  ];
})(typeof window !== 'undefined' ? window : globalThis);
`);
  console.error(`${OUT} 에 ${all.length}개 썼다`);
}

// --- 실행 ---

const [command, ...args] = process.argv.slice(2);
if (command === 'mine' && (args.length === 3 || args.length === 4)) {
  mine(Number(args[0]), Number(args[1]), args[2], args[3] ? Number(args[3]) : undefined)
    .catch((e) => { console.error(e); process.exit(1); });
} else if (command === 'write' && args.length > 0) {
  write(args).catch((e) => { console.error(e); process.exit(1); });
} else {
  console.error('사용: node games/chess-puzzle/bake.js mine <분> <씨앗> <출력.json> [두는깊이]');
  console.error('      node games/chess-puzzle/bake.js write <입력.json...>');
  process.exit(1);
}
