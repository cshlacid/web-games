'use strict';

// Lichess Puzzle Database(CC0)에서 문제를 골라 puzzles/ 아래에 굽는 오프라인
// 도구. 배포되는 사이트에는 끼지 않는다.
//
// 전에는 여기서 엔진끼리 두게 하고 실수가 난 자리를 캤다. 그건 lichess를 받아
// 올 수 없던 동안의 대체재였고, 자료가 생긴 지금은 쓸 이유가 없다 — 사람이 실제로
// 둔 판이고, 사람이 매긴 난이도(레이팅)와 검증된 수순이 붙어 있다. Stockfish
// 의존도 그와 함께 사라졌다.
//
// 자료 파일은 저장소에 없다. 받아서 이 폴더에 두고 돌린다:
//   https://database.lichess.org/lichess_db_puzzle.csv.zst
//   node games/chess-puzzle/bake.js pick
//
// 610만 개를 전부 훑는데 1분이 채 안 걸리므로 표본을 뜨지 않고 다 본다.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const L = require('./logic.js');

const SOURCE = path.join(__dirname, 'lichess_db_puzzle.csv.zst');
const OUT_DIR = path.join(__dirname, 'puzzles');

// 난이도당 개수와 한 덩이의 크기. 화면은 덩이 단위로 받아 가므로, 이 값이
// 첫 화면에서 내려받는 양을 정한다.
const PER_LEVEL = 300;
const CHUNK_SIZE = 50;

// --- 자료 읽기 ---

/**
 * pzstd로 묶인 파일이라 건너뛰기 프레임(0x184D2A50)이 압축 프레임 앞마다 끼어
 * 있고, node의 zstd 스트림은 그걸 만나면 멈춘다. 그래서 프레임을 직접 끊어
 * 하나씩 푼다. 프레임 경계가 줄 한가운데일 수 있어 남는 조각을 이어 붙인다.
 */
function* rows(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.statSync(file).size;
    const header = Buffer.alloc(12);
    let offset = 0;
    let rest = '';
    let first = true;

    while (offset < size) {
      fs.readSync(fd, header, 0, 12, offset);
      if (header.readUInt32LE(0) !== 0x184d2a50) {
        throw new Error(`${offset}바이트에서 예상치 못한 프레임을 만났다`);
      }
      const length = header.readUInt32LE(8);
      const frame = Buffer.alloc(length);
      fs.readSync(fd, frame, 0, length, offset + 12);
      offset += 12 + length;

      const lines = (rest + zlib.zstdDecompressSync(frame).toString('utf8')).split('\n');
      rest = lines.pop();
      for (const line of lines) {
        if (first) { first = false; continue; }  // 머리글
        if (line) yield line;
      }
    }
    if (rest) yield rest;
  } finally {
    fs.closeSync(fd);
  }
}

/** PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags,DailyDate */
function parseRow(line) {
  const c = line.split(',');
  if (c.length < 8) return null;
  return {
    id: c[0],
    fen: c[1],
    moves: c[2].split(' '),
    rating: Number(c[3]),
    deviation: Number(c[4]),
    popularity: Number(c[5]),
    plays: Number(c[6]),
    themes: c[7] ? c[7].split(' ') : [],
  };
}

// --- 고르는 기준 ---

/**
 * 난이도는 lichess 레이팅으로 가른다. 사람 수천 명이 풀어서 매겨진 값이라
 * 판에서 읽어낸 어떤 지표보다 "사람이 느끼는 어려움"에 가깝다.
 *
 * 구간 사이를 띄운 이유: 경계에 붙은 문제는 옆 등급과 사실상 구분되지 않는데,
 * 그걸 담으면 "쉬움"의 끝과 "보통"의 시작이 같은 난이도가 된다.
 *
 * 수순 길이도 함께 막는다. 레이팅이 낮아도 열 수짜리 수순은 화면에서 지친다.
 */
const LEVELS = [
  { name: 'easy', min: 600, max: 1199, maxMoves: 4 },
  { name: 'medium', min: 1400, max: 1899, maxMoves: 6 },
  { name: 'hard', min: 2000, max: 2600, maxMoves: 8 },
];

/**
 * 자료의 품질 지표. 셋 다 넘긴 것이 130만 개라 이 정도로 좁혀도 고를 것은 남는다.
 * - popularity: 푼 사람들이 문제에 준 찬반. 낮은 것은 억지스러운 문제다.
 * - plays: 적게 풀린 문제는 레이팅이 아직 자리를 못 잡았다.
 * - deviation: 레이팅이 얼마나 흔들리는지. 난이도로 가를 것이라 직접 걸린다.
 */
const passesQuality = (row) => row.popularity >= 90 && row.plays >= 1000 && row.deviation <= 80;

/**
 * 주제 하나를 골라 그 문제의 대표로 삼는다. 좁은 것부터 본다 — smotheredMate는
 * 언제나 mate이기도 하므로, 순서를 뒤집으면 모든 메이트가 한 칸에 쌓인다.
 *
 * 이 대표 주제로 칸을 나눠 돌아가며 뽑는다. 그냥 인기순으로만 뽑으면 300개가
 * 메이트와 포크로 채워진다 — 자료에서 그 둘이 압도적으로 많기 때문이다.
 */
const PRIMARY = [
  'smotheredMate', 'backRankMate', 'doubleCheck', 'discoveredCheck', 'discoveredAttack',
  'skewer', 'pin', 'fork', 'deflection', 'attraction', 'clearance', 'interference',
  'intermezzo', 'capturingDefender', 'xRayAttack', 'trappedPiece', 'zugzwang',
  'enPassant', 'underPromotion', 'promotion', 'advancedPawn', 'sacrifice',
  'mateIn1', 'mateIn2', 'mateIn3', 'quietMove', 'defensiveMove', 'hangingPiece',
  'attackingF2F7', 'exposedKing', 'kingsideAttack', 'queensideAttack',
  'pawnEndgame', 'rookEndgame', 'mate',
];

function primaryOf(row) {
  const set = new Set(row.themes);
  return PRIMARY.find((theme) => set.has(theme)) || '기타';
}

// --- 주제와 설명 ---

// 화면에 그대로 나가는 이름이라, 판을 보고 확인할 수 있는 것만 옮긴다. 여기
// 없는 주제는 버린다 — 뜻이 애매한 이름을 지어 붙이면 판과 어긋난 설명이 된다.
const THEME_KO = {
  smotheredMate: '질식 메이트',
  backRankMate: '백 랭크 메이트',
  doubleCheck: '더블 체크',
  discoveredCheck: '발견 체크',
  discoveredAttack: '발견 공격',
  skewer: '스큐어',
  pin: '핀',
  fork: '포크',
  deflection: '수비 이탈',
  attraction: '유인',
  clearance: '길 비우기',
  interference: '차단',
  intermezzo: '중간 수',
  capturingDefender: '수비 말 잡기',
  xRayAttack: '엑스레이 공격',
  trappedPiece: '갇힌 말',
  zugzwang: '추크츠방',
  enPassant: '앙파상',
  castling: '캐슬링',
  underPromotion: '낮은 승격',
  promotion: '승격',
  advancedPawn: '전진한 폰',
  sacrifice: '희생',
  mateIn1: '한 수 메이트',
  mateIn2: '두 수 메이트',
  mateIn3: '세 수 메이트',
  mateIn4: '긴 메이트',
  mateIn5: '긴 메이트',
  mate: '메이트',
  quietMove: '조용한 수',
  defensiveMove: '수비수',
  hangingPiece: '지켜지지 않은 말',
  attackingF2F7: '약한 칸 공격',
  exposedKing: '드러난 킹',
  kingsideAttack: '킹사이드 공격',
  queensideAttack: '퀸사이드 공격',
  pawnEndgame: '폰 종반',
  rookEndgame: '룩 종반',
  bishopEndgame: '비숍 종반',
  knightEndgame: '나이트 종반',
  queenEndgame: '퀸 종반',
  opening: '오프닝',
  middlegame: '중반',
  endgame: '종반',
};

// 좁은 것을 앞에 둔다. 세 개까지만 보여 주므로 순서가 곧 무엇이 잘리는지다.
// 판 단계(오프닝·중반·종반)는 전술이 아니라 배경이라 맨 뒤에 둔다.
const THEME_ORDER = [...PRIMARY, 'mateIn4', 'mateIn5', 'castling',
  'bishopEndgame', 'knightEndgame', 'queenEndgame', 'opening', 'middlegame', 'endgame'];

function themesOf(row) {
  const set = new Set(row.themes);
  const out = [];
  for (const theme of THEME_ORDER) {
    if (!set.has(theme) || !THEME_KO[theme]) continue;
    const name = THEME_KO[theme];
    if (!out.includes(name)) out.push(name);   // mateIn4와 mateIn5가 같은 이름을 쓴다
    if (out.length === 3) break;
  }
  return out.length ? out : ['전술'];
}

const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };

// 말 이름과 조사. 받침이 없는 이름은 나이트뿐이다.
const PIECE = { p: '폰', n: '나이트', b: '비숍', r: '룩', q: '퀸', k: '킹' };
const subject = (kind) => PIECE[kind] + (kind === 'n' ? '가' : '이');
const object = (kind) => PIECE[kind] + (kind === 'n' ? '를' : '을');

/**
 * 정답 수가 판에서 무엇을 하는지 읽는다. 제목과 힌트는 여기서 읽은 사실과
 * lichess가 붙인 주제로만 만든다 — 그럴듯한 이름을 지어내면 판과 어긋난다.
 */
function readMove(puzzle) {
  const position = L.startPuzzle(puzzle).position;
  const uci = puzzle.moves[1];
  const to = uci.slice(2, 4);
  const piece = position.board[uci.slice(0, 2)];
  const captured = position.board[to];
  const next = L.applyMove(position, uci);
  const status = L.positionStatus(next);

  const targets = L.pseudoMoves(next, to)
    .map((move) => next.board[move.to])
    .filter((p) => p && L.colorOf(p) !== L.colorOf(piece) && VALUE[p.toLowerCase()] >= 3);

  return {
    kind: piece.toLowerCase(),
    tookKind: captured ? captured.toLowerCase() : null,
    capture: captured ? VALUE[captured.toLowerCase()] : 0,
    check: status === 'check' || status === 'checkmate',
    mate: status === 'checkmate',
    promotion: Boolean(uci[4]),
    fork: targets.length >= 2,
    // 잡은 것보다 비싼 말을 잡히는 자리에 놓는 수는 눈으로는 손해로 보인다.
    sacrifice: L.attacksSquare(next.board, to, next.turn)
      && VALUE[piece.toLowerCase()] > (captured ? VALUE[captured.toLowerCase()] : 0),
  };
}

// 대표 주제로 붙일 수 있는 제목·힌트. lichess가 붙인 주제도 판에서 읽어낸
// 사실이므로, 판을 직접 본 것과 같은 자격으로 쓴다.
const BY_THEME = {
  smotheredMate: ['빠져나갈 곳이 없다', '킹의 도망 칸을 자기 말이 막고 있습니다.'],
  backRankMate: ['맨 끝 줄', '킹이 폰 뒤에 갇혀 있습니다.'],
  doubleCheck: ['두 곳에서 동시에', '두 말이 함께 체크를 겁니다. 막을 수 없습니다.'],
  discoveredCheck: ['비켜서면 체크', '한 말이 비켜서면 뒤의 말이 체크를 겁니다.'],
  discoveredAttack: ['열린 길', '한 말이 비켜서면 뒤의 말이 노리는 것이 드러납니다.'],
  skewer: ['앞의 말을 밀어낸다', '값진 말을 먼저 겨누면 뒤의 말이 남습니다.'],
  pin: ['묶인 말', '움직이면 뒤가 드러나는 말이 있습니다.'],
  deflection: ['수비를 떼어낸다', '무언가를 지키고 있는 말을 다른 곳으로 부르세요.'],
  attraction: ['불러들인다', '상대 말을 원하는 칸으로 끌어내 보세요.'],
  clearance: ['길을 비운다', '내 말이 내 길을 막고 있습니다.'],
  interference: ['사이를 끊는다', '지키는 말과 지켜지는 말 사이를 막아 보세요.'],
  intermezzo: ['그전에 한 수', '되잡기 전에 먼저 끼워 넣을 수가 있습니다.'],
  capturingDefender: ['지키는 말을 잡는다', '무언가를 지키고 있는 말부터 없애 보세요.'],
  xRayAttack: ['말을 꿰뚫어', '내 말 너머까지 이어지는 줄을 보세요.'],
  trappedPiece: ['갈 곳이 없다', '도망갈 칸이 없는 말이 있습니다.'],
  zugzwang: ['둘 수가 없다', '상대는 무엇을 두든 나빠집니다.'],
  enPassant: ['지나쳐 잡는다', '방금 두 칸 나온 폰을 앙파상으로 잡을 수 있습니다.'],
  underPromotion: ['퀸이 아니다', '퀸 말고 다른 말로 승격해 보세요.'],
  advancedPawn: ['끝줄이 가깝다', '깊이 들어간 폰을 보세요.'],
  quietMove: ['조용한 한 수', '잡지도 체크하지도 않는 수입니다.'],
  defensiveMove: ['먼저 막는다', '공격보다 지키는 수가 필요한 자리입니다.'],
  hangingPiece: ['그냥 놓여 있다', '아무도 지키지 않는 말이 있습니다.'],
};

function titleOf(puzzle, facts) {
  if (puzzle.primary === 'mateIn1') return `${subject(facts.kind)} 끝낸다`;
  if (BY_THEME[puzzle.primary]) return BY_THEME[puzzle.primary][0];
  if (puzzle.primary.startsWith('mateIn') || puzzle.primary === 'mate') return '메이트로 가는 길';
  if (facts.sacrifice) return `${object(facts.kind)} 내준다`;
  if (facts.fork) return `${subject(facts.kind)} 둘을 노린다`;
  if (facts.promotion) return '끝까지 간 폰';
  if (facts.tookKind && facts.capture >= 5) return `${subject(facts.tookKind)} 놓여 있다`;
  if (facts.tookKind) return `${subject(facts.tookKind)} 지켜지지 않았다`;
  if (!facts.check) return '조용한 한 수';
  return `${subject(facts.kind)} 몰아붙인다`;
}

function hintOf(puzzle, facts) {
  if (puzzle.primary === 'mateIn1') return '한 번에 끝낼 수 있습니다.';
  if (BY_THEME[puzzle.primary]) return BY_THEME[puzzle.primary][1];
  if (puzzle.primary.startsWith('mateIn') || puzzle.primary === 'mate') {
    return '피할 곳을 좁혀 가면 메이트가 보입니다.';
  }
  if (facts.sacrifice) return '손해처럼 보이는 수를 한 번 따져 보세요.';
  if (facts.fork) return '한 수로 두 개를 동시에 노릴 수 있습니다.';
  if (facts.promotion) return '폰이 끝 줄에 닿습니다.';
  if (facts.capture) return '지켜지지 않은 말이 있습니다.';
  if (facts.check) return '체크를 걸어 상대를 몰아 보세요.';
  return '잡지도 체크하지도 않는 수입니다.';
}

// --- 담기 전 검증 ---

/**
 * 저장소의 규칙 엔진으로 직접 풀어 본다. lichess가 검증한 수순이라도 우리
 * 엔진이 못 따라가면 화면에서도 못 푼다 — 캐슬링·앙파상·승격이 그런 자리다.
 */
function playable(puzzle) {
  if (puzzle.moves.length < 2 || puzzle.moves.length % 2 !== 0) return false;
  let state;
  try {
    state = L.startPuzzle(puzzle);
  } catch {
    return false;
  }
  let guard = 0;
  while (state.status !== 'solved' && guard++ < 40) {
    if (state.status === 'replying') { state = L.playReply(state); continue; }
    const move = L.expectedMove(state);
    if (!move || !L.isLegal(state.position, move)) return false;
    const result = L.attemptMove(state, move.slice(0, 2), move.slice(2, 4), move[4]);
    if (!result.correct) return false;
    state = result.state;
  }
  return state.status === 'solved';
}

// --- 고르기 ---

/**
 * 대표 주제별로 상위 몇 개만 들고 훑는다. 610만 줄을 다 담아 두면 메모리가
 * 감당이 안 되고, 어차피 주제마다 필요한 것은 열 개 남짓이다.
 */
const KEEP_PER_THEME = 60;

/** 잘 검증된 것이 앞이다. 많이 풀린 문제일수록 레이팅과 주제가 믿을 만하다. */
const better = (a, b) => b.plays - a.plays || (a.id < b.id ? -1 : 1);

function collect() {
  const buckets = new Map();   // `${level} ${primary}` → 후보 배열
  let scanned = 0;
  let qualified = 0;

  for (const line of rows(SOURCE)) {
    scanned++;
    const row = parseRow(line);
    if (!row || !passesQuality(row)) continue;

    const level = LEVELS.find((l) => row.rating >= l.min && row.rating <= l.max
      && row.moves.length <= l.maxMoves && row.moves.length >= 2);
    if (!level) continue;
    qualified++;

    row.primary = primaryOf(row);
    const key = `${level.name} ${row.primary}`;
    let bucket = buckets.get(key);
    if (!bucket) { bucket = []; buckets.set(key, bucket); }

    // 정렬된 상태를 유지하며 꼬리를 잘라 낸다. 전부 모았다가 정렬하는 것보다
    // 메모리가 훨씬 덜 든다.
    if (bucket.length === KEEP_PER_THEME && better(row, bucket[bucket.length - 1]) > 0) continue;
    bucket.push(row);
    bucket.sort(better);
    if (bucket.length > KEEP_PER_THEME) bucket.pop();
  }

  return { buckets, scanned, qualified };
}

/** 주제 칸을 돌아가며 하나씩 뽑는다. 한 주제가 목록을 뒤덮지 않게 하는 장치다. */
function pickLevel(buckets, level) {
  const names = PRIMARY.concat('기타').filter((theme) => buckets.has(`${level} ${theme}`));
  const cursors = new Map(names.map((theme) => [theme, 0]));
  const picked = [];
  const rejected = [];

  let moved = true;
  while (picked.length < PER_LEVEL && moved) {
    moved = false;
    for (const theme of names) {
      if (picked.length >= PER_LEVEL) break;
      const bucket = buckets.get(`${level} ${theme}`);
      let at = cursors.get(theme);
      // 그 주제에서 실제로 풀리는 것이 나올 때까지 내려간다.
      while (at < bucket.length && !playable(bucket[at])) { rejected.push(bucket[at]); at++; }
      if (at >= bucket.length) { cursors.set(theme, at); continue; }
      picked.push(bucket[at]);
      cursors.set(theme, at + 1);
      moved = true;
    }
  }
  return { picked, rejected };
}

// --- 쓰기 ---

const quote = (text) => `'${String(text).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

const chunkNameOf = (level, n) => `${level}-${String(n).padStart(2, '0')}`;

const WRAP = (body) => `'use strict';

(function (root) {
${body}
})(typeof window !== 'undefined' ? window : globalThis);
`;

function writeChunk(level, n, puzzles) {
  const name = chunkNameOf(level, n);
  const body = puzzles.map((p) => `    {
      id: ${quote(p.id)},
      fen: ${quote(p.fen)},
      moves: [${p.moves.map(quote).join(', ')}],
      rating: ${p.rating},
      themes: [${p.themes.map(quote).join(', ')}],
      title: ${quote(p.title)},
      hint: ${quote(p.hint)},
    },`).join('\n');

  // 화면 쪽 적재기는 script 태그를 꽂고 onload에서 이 표를 읽는다. 등록 함수를
  // 부르지 않는 이유는, 이러면 node에서도 require 한 번으로 같은 자료를 볼 수
  // 있어 테스트가 브라우저 없이 돈다는 것이다.
  fs.writeFileSync(path.join(OUT_DIR, `${name}.js`), WRAP(`  const chunks = root.CHESS_PUZZLE_CHUNKS || (root.CHESS_PUZZLE_CHUNKS = {});
  chunks[${quote(name)}] = [
${body}
  ];`));
}

function writeIndex(counts) {
  const levels = LEVELS.map((l) => `      ${l.name}: { count: ${counts[l.name]}, rating: [${l.min}, ${l.max}] },`).join('\n');

  // version은 자료가 바뀐 것을 화면에 알리는 표시다. 다시 구우면 아이디 목록이
  // 통째로 달라지는데, 화면은 덩이를 다 받아 보기 전에는 그것을 알 수 없다 —
  // 저장된 진행 기록을 언제 버려야 하는지 이 값으로 판단한다.
  fs.writeFileSync(path.join(OUT_DIR, 'index.js'), WRAP(`  // bake.js가 만든다. 직접 고치지 않는다.
  root.CHESS_PUZZLE_INDEX = {
    version: ${quote(new Date().toISOString().slice(0, 10))},
    chunkSize: ${CHUNK_SIZE},
    levels: {
${levels}
    },
  };`));
}

function build() {
  if (!fs.existsSync(SOURCE)) {
    throw new Error(`${SOURCE} 가 없다. 위 주석의 주소에서 받아 이 폴더에 둔다.`);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const file of fs.readdirSync(OUT_DIR)) {
    if (file.endsWith('.js')) fs.unlinkSync(path.join(OUT_DIR, file));
  }

  const started = Date.now();
  const { buckets, scanned, qualified } = collect();
  console.error(`훑은 줄 ${scanned}개 → 기준을 넘긴 ${qualified}개 (${((Date.now() - started) / 1000).toFixed(1)}초)`);

  const counts = {};
  for (const level of LEVELS) {
    const { picked, rejected } = pickLevel(buckets, level.name);
    counts[level.name] = picked.length;

    for (const row of picked) {
      const facts = readMove(row);
      row.themes = themesOf(row);
      row.title = titleOf(row, facts);
      row.hint = hintOf(row, facts);
    }

    for (let n = 0; n * CHUNK_SIZE < picked.length; n++) {
      writeChunk(level.name, n, picked.slice(n * CHUNK_SIZE, (n + 1) * CHUNK_SIZE));
    }

    const themes = new Set(picked.map((p) => p.primary));
    const ratings = picked.map((p) => p.rating).sort((a, b) => a - b);
    console.error(`${level.name}: ${picked.length}개, 주제 ${themes.size}가지, `
      + `레이팅 ${ratings[0]}~${ratings[ratings.length - 1]}, `
      + `우리 엔진이 못 푼 것 ${rejected.length}개`);
  }

  writeIndex(counts);
  const files = fs.readdirSync(OUT_DIR);
  const bytes = files.reduce((sum, f) => sum + fs.statSync(path.join(OUT_DIR, f)).size, 0);
  console.error(`${OUT_DIR} 에 ${files.length}개 파일, 합계 ${(bytes / 1024).toFixed(0)}KB`);
}

// --- 실행 ---

if (process.argv[2] === 'pick') {
  try {
    build();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
} else {
  console.error('사용: node games/chess-puzzle/bake.js pick');
  process.exit(1);
}
