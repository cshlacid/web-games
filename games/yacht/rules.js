'use strict';

// 야추의 규칙. 화면을 만지지 않는다 — node로 규칙만 돌려 보기 위해서다.
//
// **주사위 굴림은 밖에서 넣어 준다**(`next`). 규칙 안에서 `Math.random`을 부르면 같은
// 판을 다시 돌려 볼 수 없어, 이상한 점수가 나왔을 때 확인할 방법이 없다.
(function () {

const DICE = 5;
const ROLLS = 3;
const BONUS_AT = 63;
const BONUS = 35;

// 점수 칸. 위 여섯 칸은 눈의 개수로, 아래 여섯 칸은 모양으로 매긴다.
const CATEGORIES = [
  { key: 'ones', label: '1', face: 1, upper: true },
  { key: 'twos', label: '2', face: 2, upper: true },
  { key: 'threes', label: '3', face: 3, upper: true },
  { key: 'fours', label: '4', face: 4, upper: true },
  { key: 'fives', label: '5', face: 5, upper: true },
  { key: 'sixes', label: '6', face: 6, upper: true },
  { key: 'choice', label: '초이스', note: '다섯 눈의 합' },
  { key: 'four', label: '4다이스', note: '같은 눈 넷 이상이면 합' },
  { key: 'full', label: '풀하우스', note: '셋 + 둘이면 합' },
  { key: 'small', label: 'S.스트레이트', note: '넉 줄이면 15' },
  { key: 'large', label: 'L.스트레이트', note: '닷 줄이면 30' },
  { key: 'yacht', label: '야추', note: '다섯이 같으면 50' },
];

function counts(dice) {
  const out = [0, 0, 0, 0, 0, 0, 0];
  for (const die of dice) if (die >= 1 && die <= 6) out[die]++;
  return out;
}

const sum = (dice) => dice.reduce((n, die) => n + die, 0);

// 연달아 몇 개까지 이어지는가. 스트레이트 두 칸이 같은 계산을 쓴다.
function runLength(dice) {
  const has = counts(dice);
  let best = 0;
  let run = 0;
  for (let face = 1; face <= 6; face++) {
    run = has[face] ? run + 1 : 0;
    if (run > best) best = run;
  }
  return best;
}

function scoreOf(key, dice) {
  const has = counts(dice);
  const cat = CATEGORIES.find((one) => one.key === key);
  if (!cat) return 0;
  if (cat.upper) return has[cat.face] * cat.face;

  const most = Math.max(...has.slice(1));
  switch (key) {
    case 'choice': return sum(dice);
    case 'four': return most >= 4 ? sum(dice) : 0;
    // 다섯이 같은 것도 풀하우스로 친다 — 셋과 둘을 이미 품고 있다.
    case 'full': {
      const three = has.findIndex((n, face) => face > 0 && n >= 3);
      if (three < 0) return 0;
      const two = has.findIndex((n, face) => face > 0 && (face === three ? n >= 5 : n >= 2));
      return two > 0 ? sum(dice) : 0;
    }
    case 'small': return runLength(dice) >= 4 ? 15 : 0;
    case 'large': return runLength(dice) >= 5 ? 30 : 0;
    case 'yacht': return most >= 5 ? 50 : 0;
    default: return 0;
  }
}

// 사람은 늘 1번 자리다. 2~4번은 상대가 맡는다.
function newGame(players = 2) {
  const count = Math.max(2, Math.min(4, players));
  return {
    players: count,
    turn: 1,
    round: 1,
    rollsLeft: ROLLS,
    dice: new Array(DICE).fill(0),
    keep: new Array(DICE).fill(false),
    // 자리 번호를 그대로 쓰려고 0번은 비워 둔다.
    sheets: Array.from({ length: count + 1 }, (_, i) => (i ? {} : null)),
    done: false,
  };
}

const sheetOf = (game, player) => game.sheets[player || game.turn] || {};

// 잡아 두지 않은 주사위만 다시 굴린다. 굴린 눈을 돌려주므로 화면은 이것만 보고 그린다.
function roll(game, next) {
  if (game.done || game.rollsLeft <= 0) return null;
  for (let i = 0; i < DICE; i++) {
    if (game.keep[i] && game.dice[i]) continue;
    game.dice[i] = 1 + Math.floor(next() * 6);
  }
  game.rollsLeft--;
  return game.dice.slice();
}

// 굴리기 전에는 잡을 것이 없다.
function toggleKeep(game, i) {
  if (game.done || !game.dice[i] || game.rollsLeft === ROLLS) return false;
  game.keep[i] = !game.keep[i];
  return game.keep[i];
}

const filled = (game, key, player) => sheetOf(game, player)[key] !== undefined;

function open(game, player) {
  return CATEGORIES.filter((cat) => !filled(game, cat.key, player)).map((cat) => cat.key);
}

// 한 칸에 적는다. **한 번이라도 굴린 뒤에만 적을 수 있다** — 굴리지 않고 적으면 0점
// 칸을 공짜로 지우는 길이 되어 판이 시시해진다.
function pick(game, key) {
  if (game.done || game.rollsLeft === ROLLS || filled(game, key)) return null;
  if (!CATEGORIES.some((cat) => cat.key === key)) return null;
  const player = game.turn;
  const got = scoreOf(key, game.dice);
  game.sheets[player][key] = got;
  const out = { player, key, score: got, total: total(game, player) };

  // 모두가 열두 칸을 채우면 끝난다. 마지막 자리가 적기 전에는 끝나지 않으므로 **차례
  // 수는 누구에게나 같다** — 먼저 두는 쪽이 한 번 더 적는 일이 없다.
  if (game.sheets.every((sheet, i) => !i || Object.keys(sheet).length === CATEGORIES.length)) {
    game.done = true;
    return out;
  }

  game.turn = player < game.players ? player + 1 : 1;
  if (game.turn === 1) game.round++;
  game.rollsLeft = ROLLS;
  game.keep = new Array(DICE).fill(false);
  game.dice = new Array(DICE).fill(0);
  return out;
}

function upperSum(game, player) {
  const sheet = sheetOf(game, player);
  return CATEGORIES.filter((cat) => cat.upper)
    .reduce((n, cat) => n + (sheet[cat.key] || 0), 0);
}

const bonus = (game, player) => (upperSum(game, player) >= BONUS_AT ? BONUS : 0);

function total(game, player) {
  const sheet = sheetOf(game, player);
  const written = CATEGORIES.reduce((n, cat) => n + (sheet[cat.key] || 0), 0);
  return written + bonus(game, player);
}

// 자리를 점수 순으로 세운다. 같으면 번호가 앞선 쪽을 앞에 둔다.
function standings(game) {
  const list = [];
  for (let player = 1; player <= game.players; player++) {
    list.push({ player, total: total(game, player) });
  }
  return list.sort((a, b) => b.total - a.total || a.player - b.player);
}

const Rules = {
  DICE, ROLLS, BONUS_AT, BONUS, CATEGORIES,
  counts, runLength, scoreOf, newGame, sheetOf, roll, toggleKeep, open, pick,
  upperSum, bonus, total, standings,
};

if (typeof module !== 'undefined' && module.exports) module.exports = Rules;
if (typeof window !== 'undefined') window.YachtRules = Rules;

})();
