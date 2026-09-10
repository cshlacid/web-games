'use strict';

// 공격이 이길 확률 표. 주사위 a개의 합이 d개의 합보다 **크면** 공격이 이긴다(같으면
// 방어 승).
//
// **이 표가 이 게임의 전부다.** 사람에게는 "이 공격 62%"로 보여 주고, 판단기는 이
// 값으로만 결정한다. 어림으로 대신하면 둘이 서로 다른 게임을 하게 된다.
//
// 값은 불러올 때 한 번 정확히 계산한다(1~8개, 64칸). 주사위 여덟 개라도 합의 분포는
// 마흔여덟 칸짜리 배열이라 접었다 펴는 데 1밀리초가 걸리지 않는다 — 미리 적어 둔
// 숫자를 들고 다니는 것보다 맞는지 눈으로 볼 수 있는 쪽이 낫다.
(function () {

const MAX_DICE = 8;

// 주사위 n개의 합 분포. dist[n][s] = 합이 s일 확률.
function distributions() {
  const dist = [[1]];
  for (let n = 1; n <= MAX_DICE; n++) {
    const prev = dist[n - 1];
    const next = new Array(prev.length + 6).fill(0);
    for (let s = 0; s < prev.length; s++) {
      if (!prev[s]) continue;
      for (let face = 1; face <= 6; face++) next[s + face] += prev[s] / 6;
    }
    dist.push(next);
  }
  return dist;
}

function buildTable() {
  const dist = distributions();
  const table = [];
  for (let a = 0; a <= MAX_DICE; a++) {
    table.push(new Array(MAX_DICE + 1).fill(0));
  }
  for (let a = 1; a <= MAX_DICE; a++) {
    const attack = dist[a];
    for (let d = 1; d <= MAX_DICE; d++) {
      const defend = dist[d];
      // 방어 쪽 합이 s보다 작을 누적 확률을 s를 올리며 함께 밀어 준다.
      let under = 0;
      let cursor = 0;
      let win = 0;
      for (let s = 0; s < attack.length; s++) {
        while (cursor < s && cursor < defend.length) { under += defend[cursor]; cursor++; }
        if (attack[s]) win += attack[s] * under;
      }
      table[a][d] = win;
    }
  }
  return table;
}

const TABLE = buildTable();

// a개로 d개를 칠 때 이길 확률.
function odds(a, d) {
  const x = Math.min(MAX_DICE, Math.max(0, Math.floor(a)));
  const y = Math.min(MAX_DICE, Math.max(0, Math.floor(d)));
  if (x < 1 || y < 1) return 0;
  return TABLE[x][y];
}

// 사람에게 보여 줄 백분율.
function percent(a, d) {
  return Math.round(odds(a, d) * 100);
}

const Odds = { MAX_DICE, TABLE, odds, percent };

if (typeof module !== 'undefined' && module.exports) module.exports = Odds;
if (typeof window !== 'undefined') window.DiceOdds = Odds;

})();
