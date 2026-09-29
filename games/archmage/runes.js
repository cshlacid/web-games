'use strict';

// 룬과 마법의 조합. 화면을 모르는 순수 로직이라 node로 모든 조합을 검사한다.
//
// 마법진 하나에 새긴 룬 묶음에서 **마법 하나**와 **덧붙는 효과**가 나온다.
//   1. 새긴 원소 룬으로 만들 수 있는 마법(같은 원소만의 마법, 특수 조합) 가운데 룬을
//      가장 많이 쓰는 것이 발동한다. 같은 수가 여럿이면 먼저 새긴 룬을 쓰는 쪽이다.
//   2. 그 마법에 들지 못하고 남은 원소 룬은 원소마다 정해진 효과를 더한다(불 스플래시,
//      물 둔화, 바람 넉백, 땅 발묶기). 여럿이면 더하기로 쌓인다.
//   3. 수식어는 마법을 강화한다. 원소 상성이 있는 수식어는 어울리는 원소에서 보너스를,
//      상극 원소에서는 오히려 약화를 준다.
// 처음에는 가장 많은 원소가 형태, 나머지 원소가 성질을 정했다. 규칙은 짧았지만 무엇이
// 나갈지 예측하기 어려웠다 — 지금은 "발동 마법 + 덧붙는 효과"로 한 줄에 읽힌다.
(function () {
  const ELEMENTS = ['fire', 'water', 'wind', 'earth'];
  // 앞 넷은 원소와 상관없이 같은 효과, 뒤 다섯은 원소 상성이 있다. 집중·거대·시간은
  // 뺐다 — 피해·범위·쿨타임을 올리는 것뿐이라 고를 때 생각할 거리가 없었다.
  const MODIFIERS = ['chain', 'omni', 'echo', 'anima', 'frost', 'heat', 'gravity', 'gale', 'resonance'];
  // 수식어의 [어울리는 원소, 상극 원소]. 마법의 형태를 정한 원소로 가른다.
  const AFFINITY = { frost: ['water', 'fire'], heat: ['fire', 'water'], gravity: ['earth', 'wind'], gale: ['wind', 'earth'] };
  const SYNERGY_DMG = 1.2;
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
      3: { kind: 'meteor', dmg: 62, cd: 2.2, size: 64, count: 2 },
      5: { kind: 'rain', sub: 'meteor', dmg: 48, cd: 4, dur: 3, size: 58, count: 2, every: 0.35, delay: 0.5 },
      7: { kind: 'aura', dmg: 26, cd: 5, dur: 4, size: 150, every: 0.3, burn: 12 },
      9: { kind: 'aura', dmg: 110, cd: 5, dur: 4, size: 470, every: 0.5, burn: 20, screen: true },
    },
    water: {
      // 맞힌 자리에서 냉기가 퍼져 둘레를 얼린다.
      2: { nova: true },
      // 넓은 물결이 밀고 나가며 닿는 것을 모두 밀어낸다.
      3: { kind: 'wave', dmg: 48, cd: 2.0, size: 66, speed: 250, count: 1, pierce: 0 },
      5: { kind: 'rain', sub: 'ice', dmg: 55, cd: 3.6, dur: 3, size: 44, count: 3, every: 0.3, delay: 0.3, freeze: true },
      7: { kind: 'wave', ring: true, dmg: 64, cd: 2.6, size: 70, speed: 230, count: 12 },
      9: { kind: 'aura', dmg: 90, cd: 5, dur: 3.5, size: 470, every: 0.5, freeze: true, screen: true },
    },
    wind: {
      // 칼날이 도는 반경이 크게 들고 난다.
      2: { pulse: true },
      // 회오리가 스스로 적을 찾아다니며 빨아들인다.
      3: { kind: 'tornado', dmg: 20, cd: 2.4, dur: 4, size: 44, speed: 150, count: 2 },
      5: { kind: 'rain', sub: 'bolt', dmg: 45, cd: 3, dur: 3, size: 26, count: 3, every: 0.2, delay: 0.12 },
      7: { kind: 'aura', dmg: 22, cd: 4.5, dur: 4, size: 170, every: 0.25, pull: true },
      9: { kind: 'rain', sub: 'bolt', dmg: 70, cd: 5, dur: 4, size: 32, count: 4, every: 0.2, delay: 0.1, screen: true },
    },
    earth: {
      // 지대가 긁을 때마다 바깥으로 충격파가 번진다.
      2: { shock: true },
      // 발밑부터 넓게 땅이 흔들려 둘레를 한꺼번에 치고 묶는다.
      3: { kind: 'quake', dmg: 24, cd: 3.8, dur: 1.6, size: 170, count: 1 },
      5: { kind: 'rain', sub: 'rock', dmg: 90, cd: 4, dur: 3, size: 72, count: 1, every: 0.45, delay: 0.6, knock: 80 },
      7: { kind: 'aura', dmg: 90, cd: 4, dur: 4, size: 130, every: 0.3, knock: 60 },
      9: { kind: 'quake', dmg: 80, cd: 6, dur: 2.5, size: 470, screen: true },
    },
  };
  const TIER_STEPS = [9, 7, 5, 3, 2, 1];
  const formTierOf = (n) => TIER_STEPS.find((t) => t <= n);
  // 형태가 바뀌지 않는 단계(4·6·8, 그리고 9 넘게)에서 한 칸마다 더 붙는 피해.
  const TIER_DMG = 0.8;

  // 특수 조합. 이 원소 수를 **정확히** 맞춘 룬들로 이름 있는 마법이 된다. 더 많은 룬을 쓰는
  // 마법이 없으면 이것이 발동한다. 모든 조합에 두지 않은 것은 찾는 재미를 남기려는 것이다.
  // 형태는 form 원소의 tier단계를 빌리고, 나머지 원소는 성질 대신 접목(graft)으로 붙는다.
  //   불 접목: 맞힌 자리에 불길이 남는다   물 접목: 얼려 묶는다
  //   바람 접목: 맞힌 자리로 빨아들인다    땅 접목: 돌 파편이 튀고 발을 묶는다
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
      // 불+바람+땅은 불 형태에 빨아들임과 파편이 겹쳐, 같은 룬 수의 다른 조합보다 두 배 넘게
      // 셌다. 몫을 줄여 맞춘다.
      const dmg = form === 'fire' ? 0.7 : 1;
      RECIPES[keyOf(counts)] = { form, tier, grafts: els.filter((el) => el !== form), dmg };
    });
  }
  // 원소의 조화: 넷이 서로를 북돋는 칼날. 원소 폭주: 화면을 태우며 모든 접목이 붙는다.
  // 네 원소는 한 형태를 빌리지 않고 **네 원소의 마법을 한꺼번에** 쓴다(harmony). 칼날 하나에
  // 접목 셋을 붙였을 때는 같은 네 룬의 다른 조합보다 네 배 가까이 약했다.
  // 원소의 조화는 넷의 2단계, 원소 폭주는 넷의 3단계다.
  RECIPES['fire1-water1-wind1-earth1'] = { form: 'all', tier: 2, grafts: [] };
  RECIPES['fire2-water2-wind2-earth2'] = { form: 'all', tier: 3, grafts: [] };
  // 이름 있는 마법은 찾아낸 값을 치러 규칙으로 만든 같은 단계보다 조금 더 세다.
  const RECIPE_DMG = 1.25;

  // 이름 있는 마법: 특수 조합과, 같은 원소만으로 형태가 바뀌는 단계. 마도서가 따로 센다.
  const isSpecial = (key) => !!RECIPES[key] || /^(fire|water|wind|earth)([2357]|9)$/.test(key);

  function applyGraft(s, el) {
    if (el === 'fire') { s.ignite = true; s.burn += 8; }
    else if (el === 'water') s.freeze = true;
    else if (el === 'wind') s.vortex = true;
    // 땅은 무게다. 파편은 맞히는 형태에서만 튀므로, 둘레를 도는 형태에서도 느껴지게 피해를 얹는다.
    else if (el === 'earth') { s.shatter = true; s.root = Math.min(0.6, s.root + 0.3); s.rootDur = Math.max(s.rootDur, 0.8); s.dmg *= 1.3; }
  }

  // 마법에 들지 못하고 남은 원소 룬의 효과. t는 남은 그 원소 룬의 수에 등급을 더한 것이고
  // 더하기로 쌓인다. 원소마다 성격을 한 가지씩만 준다 — 불은 번지고, 물은 느리게 하고,
  // 바람은 밀어내고, 땅은 붙잡는다.
  function applyExtra(s, el, t) {
    if (!t) return;
    if (el === 'fire') s.splash += t;
    else if (el === 'water') s.slow = Math.min(0.7, s.slow + 0.25 * t);
    else if (el === 'wind') s.knock += 40 * t;
    else if (el === 'earth') { s.root = Math.min(0.6, s.root + 0.2 * t); s.rootDur = Math.max(s.rootDur, Math.min(1.2, 0.5 + 0.1 * t)); }
  }

  // 주원소를 겹쳤을 때(구멍에 더 넣거나 등급을 올렸을 때)의 강화. **그 원소가 원래
  // 하던 일만 키운다** — 불은 탄 수와 폭발, 물은 창 수와 관통, 바람은 칼날 수와 유지,
  // 땅은 지대의 넓이와 유지. 모든 형태에 관통·쿨타임까지 얹었더니 불이 관통하며 연달아
  // 터져 난이도가 무너졌다.
  //
  // 곱으로 쌓으면 열 번 겹쳤을 때 수천 배가 된다. 겹친 횟수 n을 모아 더하기로 건다.
  const MAX_EXTRA = 10;
  // 유지 시간은 1.5배 넘게 늘지 않는다 — 땅 아홉의 지진이 8초 넘게 이어져 다른 9단계의 세
  // 배를 냈다. 쏟아지는 것(rain)은 한 번에 떨어지는 수를 절반만 늘린다 — 번개 아홉이 한 번에
  // 열넷씩 떨어져 다른 9단계의 네 배를 냈다.
  function empower(s, n) {
    if (!n) return;
    const more = s.kind === 'rain' ? Math.min(Math.floor(n / 2), 6) : Math.min(n, MAX_EXTRA);
    const longer = (k) => 1 + Math.min(1.5, k * n);
    if (s.primary === 'fire') { s.count += more; s.dmg *= 1 + 0.35 * n; s.size *= 1 + Math.min(0.8, 0.12 * n); }
    else if (s.primary === 'water') { s.count += more; s.pierce += n; s.dmg *= 1 + 0.3 * n; }
    else if (s.primary === 'wind') { s.count += more; s.dur *= longer(0.15); s.dmg *= 1 + 0.3 * n; }
    else if (s.primary === 'earth') { s.size *= 1 + Math.min(1, 0.15 * n); s.dur *= longer(0.3); s.dmg *= 1 + 0.35 * n; }
  }

  // 수식어. l은 그 수식어 룬의 수에 등급을 더한 것이고, 오르면 **그 수식어의 효과만**
  // 커진다. 원소의 강화와 섞지 않는다. 상성은 마법의 형태를 정한 원소(primary)로 가른다 —
  // 불 형태의 마법에 냉각을 걸면 불길이 식는다. pure는 원소 룬이 모두 한 원소일 때 그 수다.
  function applyModifier(s, mod, l, pure) {
    if (!l) return;
    const aff = AFFINITY[mod];
    const likes = !!aff && s.primary === aff[0];
    const hates = !!aff && s.primary === aff[1];
    // 상성이면 효과에 더해 피해도 오른다 — 고를 때 "어울린다"가 곧 "세진다"로 읽혀야 한다.
    if (likes) { s.synergy.push(mod); s.dmg *= SYNERGY_DMG; }
    if (hates) s.clash.push(mod);
    if (mod === 'chain') s.chain += 2 * l;
    else if (mod === 'omni') s.omni += l;
    else if (mod === 'echo') s.echo += Math.min(l, 4);
    // 흡혈. 맞힌 피해의 일부로 생명력을 되찾는다(한도는 sim.js의 LEECH_RATE).
    else if (mod === 'anima') s.leech += 0.05 * l;
    else if (mod === 'frost') {
      s.slow = Math.min(0.8, s.slow + 0.15 + 0.1 * l);
      if (likes) { s.freezeChance = Math.min(0.6, 0.15 + 0.1 * l); s.pierce += l; }
      if (hates) { s.dmg *= 0.75; s.burn *= 0.5; }
    } else if (mod === 'heat') {
      // 물 위에서는 증기로 흩어져 화상이 붙지 않고 힘만 빠진다.
      if (hates) s.dmg *= 0.85;
      else s.burn += 6 * l;
      if (likes) { s.burn += 6 * l; s.size *= 1 + 0.12 * l; s.splashBoost += l; }
    } else if (mod === 'gravity') {
      // 바람의 밀어냄과 서로 상쇄된다.
      if (hates) { s.knock *= 0.5; s.dmg *= 0.9; }
      else s.vortex = true;
      if (likes) { s.root = Math.min(0.6, s.root + 0.15 + 0.1 * l); s.rootDur = Math.max(s.rootDur, 0.9); }
    } else if (mod === 'gale') {
      s.speed *= 1 + 0.25 * l;
      s.cd /= 1 + 0.08 * l;
      // 넉백은 주지 않는다. 칼날에서 밀어내면 둘레를 도는 칼날이 헛돌았다.
      if (likes) s.count += 1;
      if (hates) { s.root *= 0.5; s.dmg *= 0.9; }
    } else if (mod === 'resonance') {
      // 한 원소만 새긴 마법진에서만 울린다. 섞이면 아무 일도 없다.
      if (pure) { s.dmg *= 1 + 0.2 * pure * l; s.synergy.push(mod); }
      else s.clash.push(mod);
    }
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

  function primaryOf(counts) {
    let best = null;
    for (const el of ELEMENTS) if (counts[el] && (!best || counts[el] > counts[best])) best = el;
    return best;
  }

  // 새긴 원소 룬으로 만들 수 있는 마법인가: 한 원소만이거나 특수 조합.
  function isSkill(counts) {
    let kinds = 0;
    for (const el of ELEMENTS) if (counts[el]) kinds += 1;
    return kinds === 1 || !!RECIPES[keyOf(counts)];
  }

  // 발동할 마법에 쓰일 룬을 고른다. 원소 룬의 모든 부분 묶음 가운데 마법이 되는 것에서
  // 룬을 가장 많이 쓰는 것, 같으면 먼저 새긴 룬을 쓰는 것(새긴 차례를 앞에서부터 견준다).
  // 한 마법진의 룬은 아홉 개까지라 부분 묶음은 511개뿐이다.
  function pickSkill(els) {
    let best = 0, bestIdx = null;
    for (let mask = 1; mask < 1 << els.length; mask++) {
      const counts = { fire: 0, water: 0, wind: 0, earth: 0 };
      const idx = [];
      for (let i = 0; i < els.length; i++) if (mask & (1 << i)) { counts[els[i].id] += 1; idx.push(i); }
      if (!isSkill(counts)) continue;
      if (bestIdx && (idx.length < bestIdx.length || (idx.length === bestIdx.length && !earlier(idx, bestIdx)))) continue;
      best = mask; bestIdx = idx;
    }
    return best;
  }
  function earlier(a, b) {
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i];
    return false;
  }

  // 룬 묶음 → 마법. 룬의 차례는 새긴 차례다. 원소가 하나도 없으면 null(시전하지 않는다).
  function compose(runes) {
    const els = runes.filter((r) => isElement(r.id));
    if (!els.length) return null;
    const mask = pickSkill(els);
    const skill = [], extra = {};
    els.forEach((r, i) => {
      if (mask & (1 << i)) skill.push(r);
      else extra[r.id] = (extra[r.id] || 0) + 1 + (r.grade || 0);
    });
    const mods = runes.filter((r) => isModifier(r.id));
    // 공명이 울리는 한 원소 마법진: 원소 룬이 모두 같은 원소일 때 그 수.
    const pure = els.every((r) => r.id === els[0].id) ? els.length : 0;
    return build(skill, extra, mods, pure, runes.length);
  }

  // 발동할 마법(skill)에 남은 원소의 효과(extra)와 수식어(mods)를 얹는다.
  function build(skill, extra, mods, pure, total) {
    const counts = countElements(skill);
    const primary = primaryOf(counts);
    const key = keyOf(counts);
    const recipe = RECIPES[key] || null;
    if (recipe && recipe.form === 'all') return harmony(skill, extra, mods, key, recipe, total);
    const formEl = recipe ? recipe.form : primary;
    const form = recipe ? recipe.tier : formTierOf(counts[primary]);
    const f = FORMS[formEl];
    const s = {
      key, primary: formEl, counts, extra, recipe: !!recipe, form,
      kind: f.kind, dmg: f.dmg, cd: f.cd, dur: f.dur, size: f.size, speed: f.speed,
      count: f.count, pierce: f.pierce,
      slow: 0, burn: 0, knock: f.knock || 0, chain: 0, omni: 0, echo: 0, leech: 0,
      splash: 0, splashBoost: 0, root: 0, rootDur: 0, freezeChance: 0,
      mods: {}, synergy: [], clash: [], runes: total, tier: counts[formEl],
    };
    if (form >= 2) Object.assign(s, TIERS[formEl][form]);
    // 2단계는 형태를 빌리지 않고 동작만 얹으므로 피해를 따로 올려 준다.
    if (form === 2) s.dmg *= 1.6;
    if (!recipe && counts[primary] > form) s.dmg *= 1 + TIER_DMG * (counts[primary] - form);
    // 마법에 든 원소 룬의 등급은 모두 그 마법의 강화로 센다. 특수 조합은 한 마법이라
    // 어느 원소 룬을 올려도 강해진다 — 형태 원소만 세었더니 용암 지대의 불을 올린 것이 헛것이었다.
    let grade = 0;
    for (const r of skill) grade += r.grade || 0;
    const level = {};
    for (const r of mods) level[r.id] = (level[r.id] || 0) + 1 + (r.grade || 0);
    Object.assign(s.mods, level);
    if (recipe) {
      for (const el of recipe.grafts) applyGraft(s, el);
      s.dmg *= RECIPE_DMG * (recipe.dmg || 1);
      // 1단계 형태를 빌리는 1:1 조합은 같은 두 룬의 순수 마법(2단계)이 받는 몫도 받는다.
      if (recipe.tier === 1) s.dmg *= 1.6;
    }
    // 마법에 든 원소 룬은 모두 강화로 센다. 특수 조합에서 형태 원소만 세었을 때는 1:1
    // 조합이 같은 두 룬의 순수 마법보다 여섯 배 약했다.
    empower(s, skill.length - 1 + grade);
    for (const el of ELEMENTS) applyExtra(s, el, extra[el] || 0);
    for (const mod of MODIFIERS) applyModifier(s, mod, level[mod] || 0, pure);
    s.grade = grade;
    s.cd = Math.max(0.25, s.cd);
    return s;
  }

  // 네 원소를 같은 수로 새긴 마법. 네 원소 각각의 tier단계 마법을 따로 만들어 한꺼번에
  // 쓴다. 남은 원소와 수식어는 넷 모두에 걸리고(수식어 상성도 넷이 제각각 받는다), 원소 룬의
  // 등급은 넷에 고르게 나눈다.
  function harmony(skill, extra, mods, key, recipe, total) {
    let grades = 0;
    for (const r of skill) grades += r.grade || 0;
    const parts = ELEMENTS.map((el) => {
      const own = [];
      // 넷으로 나뉘는 대신 원소마다 한 칸씩 더 겹친 것으로 친다.
      for (let i = 0; i < recipe.tier; i++) own.push({ id: el, grade: i === 0 ? grades + recipe.tier - 1 : 0 });
      const part = build(own, extra, mods, 0, total);
      part.dmg *= RECIPE_DMG;
      return part;
    });
    const s = {
      key, primary: 'arcane', counts: countElements(skill), extra, recipe: true, form: recipe.tier, kind: 'harmony', parts,
      dmg: 0, cd: 0, dur: 0, size: 0, speed: 0, count: parts.length, pierce: 0,
      slow: 0, burn: 0, knock: 0, chain: 0, omni: 0, echo: 0, leech: 0,
      splash: 0, splashBoost: 0, root: 0, rootDur: 0, freezeChance: 0,
      mods: {}, synergy: [], clash: [], runes: total, tier: recipe.tier, grade: grades,
    };
    for (const p of parts) { s.dmg += p.dmg; s.cd = Math.max(s.cd, p.cd); s.dur = Math.max(s.dur, p.dur); }
    for (const r of mods) s.mods[r.id] = (s.mods[r.id] || 0) + 1 + (r.grade || 0);
    return s;
  }

  // 서클 n에서 발동할 수 있는 마법의 열쇠: 한 원소만의 마법(1~n개)과 룬 n개 이하의 특수
  // 조합. 마도서의 분모다. 남은 원소 룬은 효과만 더하므로 열쇠에 들지 않는다.
  function allKeys(circle) {
    const out = [];
    for (const el of ELEMENTS) for (let n = 1; n <= circle; n++) out.push(el + n);
    for (const key in RECIPES) {
      let n = 0;
      for (const part of key.split('-')) n += Number(part.replace(/\D/g, ''));
      if (n <= circle) out.push(key);
    }
    return out;
  }

  const api = { ELEMENTS, MODIFIERS, AFFINITY, ALL, FORMS, TIERS, RECIPES, formTierOf, isSpecial, isElement, isModifier, compose, keyOf, countElements, allKeys };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.ArchmageRunes = api;
})();
