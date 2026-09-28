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

  // 형태를 정한 첫 룬을 뺀 원소 룬 하나하나가 더하는 성질. 주원소를 더 넣어도 붙으므로
  // 불만 셋이면 불의 성질이 두 번 붙는다 — 순수 마법이 따로 규칙 없이 강해지는 길이다.
  function applyTrait(s, el) {
    if (el === 'fire') { s.dmg *= 1.25; s.size *= 1.1; s.burn += 5; }
    else if (el === 'water') { s.slow = Math.min(0.7, s.slow + 0.25); s.pierce += 1; }
    else if (el === 'wind') { s.count += 1; s.cd *= 0.88; }
    else if (el === 'earth') { s.size *= 1.22; s.dur *= 1.3; s.knock += 40; }
  }

  // 같은 룬을 겹쳤을 때의 강화. 1서클은 구멍이 하나라 판 안의 성장이 거의 이것뿐이다 —
  // 성질 하나만 붙였더니 적이 안 죽고 쌓여 피곤하기만 했다. 그래서 한 번 겹칠 때마다
  // 피해·쿨타임에 형태별로 개수·관통·유지까지 함께 올려 한 단계가 두 배를 넘게 한다.
  // 곱으로 쌓으면 열 번 겹쳤을 때 수천 배가 되어 사도가 한 방에 녹았다. 그래서 겹친
  // 횟수 n을 모아 마지막에 한 번, 대부분 더하기로 건다.
  const MAX_EXTRA = 10;
  function empower(s, n) {
    if (!n) return;
    s.dmg *= 1 + 0.5 * n;
    s.cd *= Math.pow(0.9, n);
    s.count += Math.min(n, MAX_EXTRA);
    if (s.kind === 'bolt') { s.pierce += n; s.size *= 1 + Math.min(0.5, 0.05 * n); }
    else if (s.kind === 'lance') s.pierce += 2 * n;
    else { s.dur *= 1 + 0.15 * n; s.size *= 1 + Math.min(0.5, 0.05 * n); }
  }

  // 수식어. 같은 것이 겹치면 같은 효과가 한 번 더 걸린다.
  function applyModifier(s, mod) {
    if (mod === 'chain') s.chain += 2;
    else if (mod === 'omni') s.omni += 1;
    else if (mod === 'echo') s.echo += 1;
    else if (mod === 'focus') { s.dmg *= 1.5; s.size *= 0.8; }
    else if (mod === 'magna') { s.size *= 1.35; s.dmg *= 1.1; s.cd *= 1.1; }
    // 흡혈. 맞힌 피해의 일부로 생명력을 되찾는다(한도는 sim.js의 LEECH_RATE).
    else if (mod === 'anima') s.leech += 0.05;
    else if (mod === 'chrono') { s.cd *= 0.8; s.dur *= 1.3; }
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
      mods: {}, runes: runes.length,
    };
    // 주원소를 구멍에 더 넣은 것도 같은 룬을 겹친 것이라 등급과 똑같이 강해진다.
    // 그러지 않으면 구멍을 써서 넣는 쪽이 칸을 안 쓰는 등급보다 약해진다.
    let stacks = counts[primary] - 1;
    for (const el of ELEMENTS) {
      for (let i = el === primary ? 1 : 0; i < counts[el]; i++) applyTrait(s, el);
    }
    for (const r of runes) {
      if (!isModifier(r.id)) continue;
      s.mods[r.id] = (s.mods[r.id] || 0) + 1;
      applyModifier(s, r.id);
    }
    // 같은 룬을 다시 얻어 올린 등급. 칸을 쓰지 않는 대신 겹친 것으로 세어 크게
    // 강해진다. 수식어의 등급은 그 수식어가 한 번 더 걸린다.
    let grade = 0;
    for (const r of runes) {
      const g = r.grade || 0;
      grade += g;
      stacks += g;
      if (isModifier(r.id)) for (let i = 0; i < g; i++) applyModifier(s, r.id);
    }
    empower(s, stacks);
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

  const api = { ELEMENTS, MODIFIERS, ALL, FORMS, isElement, isModifier, compose, keyOf, countElements, primaryOf, comboCount, allKeys };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.ArchmageRunes = api;
})();
