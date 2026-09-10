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

function newGame() {
  return {
    round: 1,
    rollsLeft: ROLLS,
    dice: new Array(DICE).fill(0),
    keep: new Array(DICE).fill(false),
    sheet: {},
    done: false,
  };
}

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

const filled = (game, key) => game.sheet[key] !== undefined;

function open(game) {
  return CATEGORIES.filter((cat) => !filled(game, cat.key)).map((cat) => cat.key);
}

// 한 칸에 적는다. **한 번이라도 굴린 뒤에만 적을 수 있다** — 굴리지 않고 적으면 0점
// 칸을 공짜로 지우는 길이 되어 판이 시시해진다.
function pick(game, key) {
  if (game.done || game.rollsLeft === ROLLS || filled(game, key)) return null;
  if (!CATEGORIES.some((cat) => cat.key === key)) return null;
  const got = scoreOf(key, game.dice);
  game.sheet[key] = got;

  if (open(game).length === 0) {
    game.done = true;
    return { key, score: got, total: total(game) };
  }
  game.round++;
  game.rollsLeft = ROLLS;
  game.keep = new Array(DICE).fill(false);
  game.dice = new Array(DICE).fill(0);
  return { key, score: got, total: total(game) };
}

function upperSum(game) {
  return CATEGORIES.filter((cat) => cat.upper)
    .reduce((n, cat) => n + (game.sheet[cat.key] || 0), 0);
}

const bonus = (game) => (upperSum(game) >= BONUS_AT ? BONUS : 0);

function total(game) {
  const written = CATEGORIES.reduce((n, cat) => n + (game.sheet[cat.key] || 0), 0);
  return written + bonus(game);
}

const Rules = {
  DICE, ROLLS, BONUS_AT, BONUS, CATEGORIES,
  counts, runLength, scoreOf, newGame, roll, toggleKeep, open, pick,
  upperSum, bonus, total,
};

if (typeof module !== 'undefined' && module.exports) module.exports = Rules;
if (typeof window !== 'undefined') window.YachtRules = Rules;

})();
