'use strict';

// 룬과 마법의 조합. 화면을 모르는 순수 로직이라 node로 모든 조합을 검사한다.
//
// 마법진 하나에 새긴 룬 묶음이 곧 그 마법진의 마법이다. **순서는 따지지 않는다** —
// 순서까지 따지면 9서클에서 조합이 26만 가지로 불어나 사람이 기억할 수 없다.
// 원소 넷으로 순서 없이 고르면 1~9서클 합쳐 714가지이고, 이것을 하나씩 설계할 수는
// 없으므로 **규칙으로 만든다**: 가장 많은 원소가 형태를, 나머지 원소가 성질을,
// 수식어가 강화를 정한다.
(function () {
  const ELEMENTS = ['fire', 'water', 'wind', 'earth'];
  const MODIFIERS = ['chain', 'omni', 'echo', 'focus', 'magna', 'anima', 'chrono'];
  const ALL = ELEMENTS.concat(MODIFIERS);

  // 주원소가 정하는 형태. 값은 1서클 기초 마법의 것이다.
  // cd는 쿨타임, dur는 시전 유지 시간(0이면 한 번 쏘고 끝).
  const FORMS = {
    // 가장 가까운 적에게 날아가 터진다.
    fire: { kind: 'bolt', dmg: 16, cd: 1.2, dur: 0, size: 30, speed: 250, count: 1, pierce: 0 },
    // 곧게 꿰뚫는다. 줄 선 적을 한 번에 잡는 대신 터지지 않는다.
    water: { kind: 'lance', dmg: 11, cd: 1.3, dur: 0, size: 9, speed: 400, count: 1, pierce: 2 },
    // 몸 둘레를 돈다. 피하는 손과 공격이 한 몸이라 초반에 가장 믿을 만하다.
    wind: { kind: 'orbit', dmg: 10, cd: 2.4, dur: 3.0, size: 11, speed: 3.4, count: 2, pierce: 0 },
    // 적이 몰린 자리에 깔린다. 느리지만 머무는 동안 계속 긁는다.
    earth: { kind: 'zone', dmg: 9, cd: 3.4, dur: 2.4, size: 46, speed: 0, count: 1, pierce: 0 },
  };

  // 같은 원소를 구멍에 여럿 새기면 마법 자체가 바뀐다(단계). 등급처럼 수치만 오르면
  // 물+물+물이 물+수식어+수식어에 등급을 올린 것보다 약해 보여, 구멍을 같은 원소로
  // 채울 까닭이 없었다. 2단계는 원래 형태에 새 동작을 얹고, 3단계부터는 다른 마법이 된다.
  const TIERS = {
    fire: {
      // 터지며 파편이 흩어져 둘레에서 한 번 더 터진다.
      2: { cluster: true },
      // 하늘에서 떨어진다. 적이 있는 자리 여러 곳을 한꺼번에 친다.
      3: { kind: 'meteor', dmg: 44, cd: 2.4, size: 62, count: 2 },
    },
    water: {
      // 맞힌 자리에서 냉기가 퍼져 둘레를 얼린다.
      2: { nova: true },
      // 넓은 물결이 밀고 나가며 닿는 것을 모두 밀어낸다.
      3: { kind: 'wave', dmg: 28, cd: 2.2, size: 64, speed: 250, count: 1, pierce: 0 },
    },
    wind: {
      // 칼날이 도는 반경이 크게 들고 난다.
      2: { pulse: true },
      // 회오리가 스스로 적을 찾아다니며 빨아들인다.
      3: { kind: 'tornado', dmg: 15, cd: 3.0, dur: 3.6, size: 40, speed: 95, count: 2 },
    },
    earth: {
      // 지대가 긁을 때마다 바깥으로 충격파가 번진다.
      2: { shock: true },
      // 발밑부터 넓게 땅이 흔들려 둘레를 한꺼번에 치고 묶는다.
      3: { kind: 'quake', dmg: 30, cd: 3.8, dur: 1.6, size: 170, count: 1 },
    },
  };
  // 단계가 오를 때마다 피해가 이만큼 더 붙는다. 3단계 넘게는 형태가 그대로이고 이것만 는다.
  const TIER_DMG = 0.8;

  // 둘째 이하 원소가 더하는 성질. t는 그 원소 룬의 수에 등급을 더한 것이다.
  function applyTrait(s, el, t) {
    if (!t) return;
    if (el === 'fire') { s.dmg *= 1 + 0.25 * t; s.size *= 1 + 0.1 * t; s.burn += 5 * t; }
    else if (el === 'water') { s.slow = Math.min(0.7, 0.25 * t); s.pierce += t; }
    else if (el === 'wind') { s.count += t; s.cd /= 1 + 0.12 * t; }
    else if (el === 'earth') { s.size *= 1 + 0.22 * t; s.dur *= 1 + 0.3 * t; s.knock += 40 * t; }
  }

  // 주원소를 겹쳤을 때(구멍에 더 넣거나 등급을 올렸을 때)의 강화. **그 원소가 원래
  // 하던 일만 키운다** — 불은 탄 수와 폭발, 물은 창 수와 관통, 바람은 칼날 수와 유지,
  // 땅은 지대의 넓이와 유지. 모든 형태에 관통·쿨타임까지 얹었더니 불이 관통하며 연달아
  // 터져 난이도가 무너졌다.
  //
  // 곱으로 쌓으면 열 번 겹쳤을 때 수천 배가 된다. 겹친 횟수 n을 모아 더하기로 건다.
  const MAX_EXTRA = 10;
  function empower(s, n) {
    if (!n) return;
    const more = Math.min(n, MAX_EXTRA);
    if (s.primary === 'fire') { s.count += more; s.dmg *= 1 + 0.35 * n; s.size *= 1 + Math.min(0.8, 0.12 * n); }
    else if (s.primary === 'water') { s.count += more; s.pierce += n; s.dmg *= 1 + 0.3 * n; }
    else if (s.primary === 'wind') { s.count += more; s.dur *= 1 + 0.15 * n; s.dmg *= 1 + 0.3 * n; }
    else if (s.primary === 'earth') { s.size *= 1 + Math.min(1, 0.15 * n); s.dur *= 1 + 0.2 * n; s.dmg *= 1 + 0.35 * n; }
  }

  // 수식어. l은 그 수식어 룬의 수에 등급을 더한 것이고, 오르면 **그 수식어의 효과만**
  // 커진다. 원소의 강화와 섞지 않는다.
  function applyModifier(s, mod, l) {
    if (!l) return;
    if (mod === 'chain') s.chain += 2 * l;
    else if (mod === 'omni') s.omni += l;
    else if (mod === 'echo') s.echo += Math.min(l, 4);
    else if (mod === 'focus') { s.dmg *= 1 + 0.5 * l; s.size *= 0.8; }
    else if (mod === 'magna') { s.size *= 1 + 0.3 * l; s.dmg *= 1 + 0.1 * l; s.cd *= 1.1; }
    // 흡혈. 맞힌 피해의 일부로 생명력을 되찾는다(한도는 sim.js의 LEECH_RATE).
    else if (mod === 'anima') s.leech += 0.05 * l;
    else if (mod === 'chrono') { s.cd /= 1 + 0.25 * l; s.dur *= 1 + 0.3 * l; }
  }

  const isElement = (id) => ELEMENTS.indexOf(id) >= 0;
  const isModifier = (id) => MODIFIERS.indexOf(id) >= 0;

  function countElements(runes) {
    const counts = { fire: 0, water: 0, wind: 0, earth: 0 };
    for (const r of runes) if (isElement(r.id)) counts[r.id] += 1;
    return counts;
  }

  // 마도서의 열쇠. 수식어는 마법을 바꾸는 것이 아니라 강화하는 것이라 넣지 않는다 —
  // 넣으면 발견할 것이 만 가지를 넘어 기록이 안내 구실을 못 한다.
  function keyOf(counts) {
    const parts = [];
    for (const el of ELEMENTS) if (counts[el]) parts.push(el + counts[el]);
    return parts.join('-');
  }

  // 같은 수로 비기면 ELEMENTS 차례로 가른다. 먼저 새긴 쪽으로 가르면 같은 묶음이
  // 새긴 순서에 따라 다른 마법이 되어, "순서를 따지지 않는다"가 깨진다.
  function primaryOf(counts) {
    let best = null;
    for (const el of ELEMENTS) if (counts[el] && (!best || counts[el] > counts[best])) best = el;
    return best;
  }

  // 룬 묶음 → 마법. 원소가 하나도 없으면 null(시전하지 않는다).
  function compose(runes) {
    const counts = countElements(runes);
    const primary = primaryOf(counts);
    if (!primary) return null;
    const f = FORMS[primary];
    const s = {
      key: keyOf(counts), primary, counts,
      kind: f.kind, dmg: f.dmg, cd: f.cd, dur: f.dur, size: f.size, speed: f.speed,
      count: f.count, pierce: f.pierce,
      slow: 0, burn: 0, knock: 0, chain: 0, omni: 0, echo: 0, leech: 0,
      mods: {}, runes: runes.length, tier: counts[primary],
    };
    const tiers = TIERS[primary];
    if (s.tier >= 2) Object.assign(s, tiers[Math.min(3, s.tier)]);
    s.dmg *= 1 + TIER_DMG * (s.tier - (s.tier >= 3 ? 3 : 1));
    // 룬마다 수(구멍에 넣은 개수)와 등급을 모은다. 구멍에 더 넣은 주원소는 단계를
    // 올리는 것에 더해 등급과 똑같이 강화로도 센다 — 같은 원소로 구멍을 채우는 쪽이
    // 수식어를 넣고 등급을 올리는 쪽보다 분명히 강해야 한다.
    const level = {};
    let grade = 0;
    let primaryGrade = 0;
    for (const r of runes) {
      level[r.id] = (level[r.id] || 0) + 1 + (r.grade || 0);
      grade += r.grade || 0;
      if (r.id === primary) primaryGrade += r.grade || 0;
      if (isModifier(r.id)) s.mods[r.id] = (s.mods[r.id] || 0) + 1 + (r.grade || 0);
    }
    for (const el of ELEMENTS) if (el !== primary) applyTrait(s, el, level[el] || 0);
    empower(s, s.tier - 1 + primaryGrade);
    for (const mod of MODIFIERS) applyModifier(s, mod, level[mod] || 0);
    s.grade = grade;
    s.cd = Math.max(0.25, s.cd);
    return s;
  }

  // 서클 n에서 나올 수 있는 원소 조합의 수(1~n개를 순서 없이). 마도서의 분모다.
  function comboCount(circle) {
    let total = 0;
    for (let k = 1; k <= circle; k++) total += choose(k + ELEMENTS.length - 1, ELEMENTS.length - 1);
    return total;
  }

  function choose(n, k) {
    let r = 1;
    for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
    return Math.round(r);
  }

  // 서클 n에서 만들 수 있는 모든 원소 조합의 열쇠.
  function allKeys(circle) {
    const out = [];
    const counts = { fire: 0, water: 0, wind: 0, earth: 0 };
    (function walk(i, left) {
      if (i === ELEMENTS.length) {
        const key = keyOf(counts);
        if (key) out.push(key);
        return;
      }
      for (let c = 0; c <= left; c++) {
        counts[ELEMENTS[i]] = c;
        walk(i + 1, left - c);
      }
      counts[ELEMENTS[i]] = 0;
    })(0, circle);
    return out;
  }

  const api = { ELEMENTS, MODIFIERS, ALL, FORMS, TIERS, isElement, isModifier, compose, keyOf, countElements, primaryOf, comboCount, allKeys };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.ArchmageRunes = api;
})();
