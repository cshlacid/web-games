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
    water: { kind: 'lance', dmg: 14, cd: 1.15, dur: 0, size: 9, speed: 400, count: 1, pierce: 3 },
    // 몸 둘레를 돈다. 칼날이 몸 가까이에만 있어 쉬는 틈이 길면 무리가 바로 붙는다 —
    // 처음 값(유지 3초·쿨타임 2.4초)은 다른 원소보다 뚜렷이 약해 쉬는 틈을 줄였다.
    wind: { kind: 'orbit', dmg: 14, cd: 1.6, dur: 3.6, size: 13, speed: 3.6, count: 2, pierce: 0 },
    // 적이 몰린 자리에 깔린다. 느리지만 머무는 동안 계속 긁는다.
    // 지대는 쉬는 틈에 무리가 그대로 걸어 들어온다. 유지를 쿨타임보다 길게 두어 거의 늘 깔려 있게 한다.
    earth: { kind: 'zone', dmg: 12, cd: 2.0, dur: 3.0, size: 52, speed: 0, count: 1, pierce: 0 },
  };

  // 같은 원소를 구멍에 여럿 새기면 마법 자체가 바뀐다(단계). 등급처럼 수치만 오르면
  // 물+물+물이 물+수식어+수식어에 등급을 올린 것보다 약해 보여, 구멍을 같은 원소로
  // 채울 까닭이 없었다. 2단계는 원래 형태에 새 동작을 얹고, 3단계부터는 다른 마법이
  // 된다. **9서클까지 2·3·5·7·9단계에서 바뀌고**, 그 사이(4·6·8)는 앞 단계의 형태에
  // 피해만 는다 — 한 칸 올릴 때마다 모양이 바뀌면 다음 단계를 기다리는 맛이 없다.
  //
  // rain은 사거리 안의 적 위로 일정 간격마다 무언가가 떨어지는 것(sub가 무엇인지),
  // aura는 마법사 둘레를 계속 치는 것이다. screen이면 화면 전체에 미친다.
  const TIERS = {
    fire: {
      // 터지며 파편이 흩어져 둘레에서 한 번 더 터진다.
      2: { cluster: true },
      // 하늘에서 떨어진다. 적이 있는 자리 여러 곳을 한꺼번에 친다.
      3: { kind: 'meteor', dmg: 44, cd: 2.4, size: 62, count: 2 },
      5: { kind: 'rain', sub: 'meteor', dmg: 48, cd: 4, dur: 3, size: 58, count: 2, every: 0.35, delay: 0.5 },
      7: { kind: 'aura', dmg: 26, cd: 5, dur: 4, size: 150, every: 0.3, burn: 12 },
      9: { kind: 'aura', dmg: 60, cd: 6, dur: 4, size: 470, every: 0.5, burn: 20, screen: true },
    },
    water: {
      // 맞힌 자리에서 냉기가 퍼져 둘레를 얼린다.
      2: { nova: true },
      // 넓은 물결이 밀고 나가며 닿는 것을 모두 밀어낸다.
      3: { kind: 'wave', dmg: 30, cd: 2.2, size: 64, speed: 250, count: 1, pierce: 0 },
      5: { kind: 'rain', sub: 'ice', dmg: 40, cd: 3.6, dur: 3, size: 44, count: 3, every: 0.3, delay: 0.3, freeze: true },
      7: { kind: 'wave', ring: true, dmg: 40, cd: 3, size: 70, speed: 230, count: 12 },
      9: { kind: 'aura', dmg: 50, cd: 6, dur: 3, size: 470, every: 0.6, freeze: true, screen: true },
    },
    wind: {
      // 칼날이 도는 반경이 크게 들고 난다.
      2: { pulse: true },
      // 회오리가 스스로 적을 찾아다니며 빨아들인다.
      3: { kind: 'tornado', dmg: 20, cd: 2.4, dur: 4, size: 44, speed: 150, count: 2 },
      5: { kind: 'rain', sub: 'bolt', dmg: 34, cd: 3, dur: 3, size: 26, count: 3, every: 0.2, delay: 0.12 },
      7: { kind: 'aura', dmg: 22, cd: 4.5, dur: 4, size: 170, every: 0.25, pull: true },
      9: { kind: 'rain', sub: 'bolt', dmg: 70, cd: 5, dur: 4, size: 32, count: 6, every: 0.15, delay: 0.1, screen: true },
    },
    earth: {
      // 지대가 긁을 때마다 바깥으로 충격파가 번진다.
      2: { shock: true },
      // 발밑부터 넓게 땅이 흔들려 둘레를 한꺼번에 치고 묶는다.
      3: { kind: 'quake', dmg: 30, cd: 3.8, dur: 1.6, size: 170, count: 1 },
      5: { kind: 'rain', sub: 'rock', dmg: 90, cd: 4, dur: 3, size: 72, count: 1, every: 0.45, delay: 0.6, knock: 80 },
      7: { kind: 'aura', dmg: 34, cd: 4.5, dur: 4, size: 120, every: 0.35, knock: 60 },
      9: { kind: 'quake', dmg: 80, cd: 6, dur: 2.5, size: 470, screen: true },
    },
  };
  const TIER_STEPS = [9, 7, 5, 3, 2, 1];
  const formTierOf = (n) => TIER_STEPS.find((t) => t <= n);
  // 형태가 바뀌지 않는 단계(4·6·8, 그리고 9 넘게)에서 한 칸마다 더 붙는 피해.
  const TIER_DMG = 0.8;

  // 특수 조합. 이 원소 수를 **정확히** 맞추면 규칙으로 만든 마법 대신 이름 있는 마법이
  // 된다. 모든 조합에 두지 않은 것은 찾는 재미를 남기려는 것이다 — 714가지 중 58가지.
  // 형태는 form 원소의 tier단계를 빌리고, 나머지 원소는 성질 대신 접목(graft)으로 붙는다.
  //   불 접목: 맞힌 자리에 불길이 남는다   물 접목: 얼려 묶는다
  //   바람 접목: 맞힌 자리로 빨아들인다    땅 접목: 돌 파편이 튄다
  // 두 원소는 1:1부터 4:4까지 단계를 1·3·5·7로 올리고, 세 원소는 1:1:1·2:2:2·3:3:3에서
  // 3·5·9단계를, 네 원소는 1:1:1:1과 2:2:2:2에 따로 둔다.
  const RECIPES = {};
  const PAIRS = [
    ['fire', 'water', 'fire'], ['fire', 'wind', 'wind'], ['fire', 'earth', 'earth'],
    ['water', 'wind', 'water'], ['water', 'earth', 'earth'], ['wind', 'earth', 'wind'],
  ];
  for (const [a, b, form] of PAIRS) {
    [1, 3, 5, 7].forEach((tier, i) => {
      const n = i + 1;
      const counts = { fire: 0, water: 0, wind: 0, earth: 0 };
      counts[a] = n; counts[b] = n;
      RECIPES[keyOf(counts)] = { form, tier, grafts: [form === a ? b : a] };
    });
  }
  const TRIOS = [
    [['fire', 'water', 'wind'], 'wind'], [['fire', 'water', 'earth'], 'earth'],
    [['fire', 'wind', 'earth'], 'fire'], [['water', 'wind', 'earth'], 'water'],
  ];
  for (const [els, form] of TRIOS) {
    [3, 5, 9].forEach((tier, i) => {
      const counts = { fire: 0, water: 0, wind: 0, earth: 0 };
      for (const el of els) counts[el] = i + 1;
      RECIPES[keyOf(counts)] = { form, tier, grafts: els.filter((el) => el !== form) };
    });
  }
  // 원소의 조화: 넷이 서로를 북돋는 칼날. 원소 폭주: 화면을 태우며 모든 접목이 붙는다.
  RECIPES['fire1-water1-wind1-earth1'] = { form: 'wind', tier: 2, grafts: ['fire', 'water', 'earth'] };
  RECIPES['fire2-water2-wind2-earth2'] = { form: 'fire', tier: 9, grafts: ['water', 'wind', 'earth'] };
  // 이름 있는 마법은 찾아낸 값을 치러 규칙으로 만든 같은 단계보다 조금 더 세다.
  const RECIPE_DMG = 1.25;

  // 이름 있는 마법: 특수 조합과, 같은 원소만으로 형태가 바뀌는 단계. 마도서가 따로 센다.
  const isSpecial = (key) => !!RECIPES[key] || /^(fire|water|wind|earth)([2357]|9)$/.test(key);

  function applyGraft(s, el) {
    if (el === 'fire') { s.ignite = true; s.burn += 8; }
    else if (el === 'water') s.freeze = true;
    else if (el === 'wind') s.vortex = true;
    else if (el === 'earth') { s.shatter = true; s.knock += 30; }
  }

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
    else if (s.primary === 'earth') { s.size *= 1 + Math.min(1, 0.15 * n); s.dur *= 1 + 0.3 * n; s.dmg *= 1 + 0.35 * n; }
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
    const key = keyOf(counts);
    const recipe = RECIPES[key] || null;
    const formEl = recipe ? recipe.form : primary;
    const form = recipe ? recipe.tier : formTierOf(counts[primary]);
    const f = FORMS[formEl];
    const s = {
      key, primary: formEl, counts, recipe: !!recipe, form,
      kind: f.kind, dmg: f.dmg, cd: f.cd, dur: f.dur, size: f.size, speed: f.speed,
      count: f.count, pierce: f.pierce,
      slow: 0, burn: 0, knock: f.knock || 0, chain: 0, omni: 0, echo: 0, leech: 0,
      mods: {}, runes: runes.length, tier: counts[formEl],
    };
    if (form >= 2) Object.assign(s, TIERS[formEl][form]);
    // 2단계는 형태를 빌리지 않고 동작만 얹으므로 피해를 따로 올려 준다.
    if (form === 2) s.dmg *= 1.6;
    if (!recipe && counts[primary] > form) s.dmg *= 1 + TIER_DMG * (counts[primary] - form);
    // 룬마다 수(구멍에 넣은 개수)와 등급을 모은다. 구멍에 더 넣은 주원소는 단계를
    // 올리는 것에 더해 등급과 똑같이 강화로도 센다 — 같은 원소로 구멍을 채우는 쪽이
    // 수식어를 넣고 등급을 올리는 쪽보다 분명히 강해야 한다.
    const level = {};
    let grade = 0;
    let formGrade = 0;
    for (const r of runes) {
      level[r.id] = (level[r.id] || 0) + 1 + (r.grade || 0);
      grade += r.grade || 0;
      // 특수 조합은 한 마법이라 어느 원소 룬을 강화해도 그 마법이 강해진다.
      if (r.id === formEl || (recipe && isElement(r.id))) formGrade += r.grade || 0;
      if (isModifier(r.id)) s.mods[r.id] = (s.mods[r.id] || 0) + 1 + (r.grade || 0);
    }
    if (recipe) {
      for (const el of recipe.grafts) applyGraft(s, el);
      s.dmg *= RECIPE_DMG;
    } else {
      for (const el of ELEMENTS) if (el !== primary) applyTrait(s, el, level[el] || 0);
    }
    empower(s, counts[formEl] - 1 + formGrade);
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

  const api = { ELEMENTS, MODIFIERS, ALL, FORMS, TIERS, RECIPES, formTierOf, isSpecial, isElement, isModifier, compose, keyOf, countElements, primaryOf, comboCount, allKeys };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.ArchmageRunes = api;
})();
