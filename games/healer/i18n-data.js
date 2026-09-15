// 자료의 이름·설명을 고른 언어로 갈아 끼운다.
//
// 다른 게임처럼 자료에서 문장을 걷어 내고 화면이 꺼내 쓰게 하려면 `.name`을 읽는
// 자리 백오십 곳을 모두 고쳐야 한다. 여기서는 반대로, 화면을 그리기 전에 표를 한
// 번 훑어 제자리에 번역을 써 넣는다 — 읽는 쪽은 그대로 두고 자료만 갈린다.
// 한국어는 자료에 그대로 남아 사전이 없는 자리의 바탕이 되고, node 테스트도
// 이 파일을 부르지 않으므로 예전과 똑같이 돈다.
(function () {
  const D = window.HealerData;
  if (!D || SharedI18n.lang === 'ko') return;

  const FIELDS = ['name', 'desc', 'role', 'effect', 'note', 'type', 'line'];

  function apply(prefix, table) {
    if (!table) return;
    const entries = Array.isArray(table) ? table.entries() : Object.entries(table);
    for (const [key, value] of entries) {
      if (!value || typeof value !== 'object') continue;
      const id = value.id != null ? value.id : key;
      for (const field of FIELDS) {
        if (typeof value[field] !== 'string') continue;
        const text = SharedI18n.t(`${prefix}.${id}.${field}`);
        if (text !== null) value[field] = text;
      }
    }
  }

  apply('healer.skill', D.UNIT_SKILLS);
  apply('healer.pskill', D.PLAYER_SKILLS);
  apply('healer.companion', D.COMPANIONS);
  apply('healer.kind', D.SKILL_KINDS);
  apply('healer.stat', D.STATS);
  apply('healer.gear', D.GEAR);
  apply('healer.job', D.HERO_JOBS);
  apply('healer.trait', D.TRAITS);
  apply('healer.attr', D.ATTRS);
  apply('healer.enemy', D.ENEMIES);
  apply('healer.race', D.RACES);
  apply('healer.role', D.JOBS);
  apply('healer.tier', D.TIERS);
  apply('healer.feel', D.TRUST_FEEL);
  apply('healer.region', D.REGIONS);
  apply('healer.slot', D.SLOTS);
  apply('healer.material', D.MATERIALS);
  apply('healer.rank', D.RANKS);
  apply('healer.potion', D.POTIONS);
  apply('healer.trust', D.TRUST.stages);
  apply('healer.rep', D.REPUTATION.stages);

  // 분배 방식은 loot.js가 들고 있다.
  if (window.HealerLoot) apply('hl.method', window.HealerLoot.METHODS);

  // 이름 풀. 새로 뽑는 동료부터 고른 언어로 나온다 — 이미 명부에 있는 동료의
  // 이름은 저장본의 신원이라 그대로 둔다.
  for (const [spec, list] of Object.entries(D.NAMES.title)) {
    list.forEach((_, i) => {
      const text = SharedI18n.t(`healer.title.${spec}.${i}`);
      if (text !== null) list[i] = text;
    });
  }
  D.NAMES.given.forEach((_, i) => {
    const text = SharedI18n.t(`healer.given.${i}`);
    if (text !== null) D.NAMES.given[i] = text;
  });

  const hero = SharedI18n.t('healer.hero.name');
  if (hero !== null) D.HERO.name = hero;
})();
