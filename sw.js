'use strict';

// 오프라인 실행을 위한 서비스 워커. **네트워크가 먼저다.** 온라인이면 워커가 없을 때와
// 똑같이 서버에서 받고, 받기에 실패했을 때만 담아 둔 사본을 준다. 캐시를 먼저 주면
// 낡은 파일이 남아 배포 표시로 "폰에 새 판이 닿았는지" 가릴 수 없게 된다 — 서비스
// 워커를 한동안 두지 않은 이유가 그것이었다.
//
// 사본은 첫 방문에 사이트 전체를 담는다. 들어가 본 게임만 담으면 오프라인에서 처음
// 여는 게임이 안 뜬다. 목록은 shared/offline-bake.js가 굽는다.

const CACHE = 'web-games-offline';

// <files>
const FILES = {
  "games/2048/audio.js": '7f395c87f388',
  "games/2048/index.html": 'd86d6d8269b8',
  "games/2048/logic.js": 'f66086db634c',
  "games/2048/main.js": 'b413f3d8a138',
  "games/2048/strings.js": 'a8caa6180746',
  "games/2048/style.css": '48e7769c4efa',
  "games/archmage/art.js": 'e0c1e29d26db',
  "games/archmage/audio.js": '56183e874a49',
  "games/archmage/gear.js": '14b0df7f9802',
  "games/archmage/icons.js": 'dd2527d26590',
  "games/archmage/index.html": 'f7814a01fbb0',
  "games/archmage/mage.png": 'b431f897b418',
  "games/archmage/main.js": 'd22c7dad032e',
  "games/archmage/meta.js": '5b2734602a9e',
  "games/archmage/runes.js": '01d2400c4d13',
  "games/archmage/sim.js": '115d296b41ca',
  "games/archmage/strings.js": 'fe89b9aa05e4',
  "games/archmage/style.css": '98f66201335e',
  "games/chess-puzzle/audio.js": 'ddb0b25ec82f',
  "games/chess-puzzle/data.js": '45e08ff437f2',
  "games/chess-puzzle/index.html": '9fdafcaa8c94',
  "games/chess-puzzle/logic.js": '62b53d7f74d0',
  "games/chess-puzzle/main.js": '5c6b8fa173b3',
  "games/chess-puzzle/pieces.js": '3955841dbe22',
  "games/chess-puzzle/puzzles/easy-00.js": 'ccaf819511ba',
  "games/chess-puzzle/puzzles/easy-01.js": '898bb519e33e',
  "games/chess-puzzle/puzzles/easy-02.js": 'a0b9040cdad4',
  "games/chess-puzzle/puzzles/easy-03.js": 'aa600094d2d5',
  "games/chess-puzzle/puzzles/easy-04.js": '227038826506',
  "games/chess-puzzle/puzzles/easy-05.js": '6e104951bcaf',
  "games/chess-puzzle/puzzles/hard-00.js": 'd46fa8469413',
  "games/chess-puzzle/puzzles/hard-01.js": '212f38f19aa5',
  "games/chess-puzzle/puzzles/hard-02.js": '7bc9a0f3d8a9',
  "games/chess-puzzle/puzzles/hard-03.js": 'c2c28a486f0b',
  "games/chess-puzzle/puzzles/hard-04.js": 'a827e58b73a1',
  "games/chess-puzzle/puzzles/hard-05.js": '8c734e406201',
  "games/chess-puzzle/puzzles/index.js": '9cbe711f7b74',
  "games/chess-puzzle/puzzles/medium-00.js": '01725903c5e1',
  "games/chess-puzzle/puzzles/medium-01.js": '7e9f5f302af2',
  "games/chess-puzzle/puzzles/medium-02.js": '32695368269c',
  "games/chess-puzzle/puzzles/medium-03.js": '047f2d75672f',
  "games/chess-puzzle/puzzles/medium-04.js": 'b9ad9d8834ff',
  "games/chess-puzzle/puzzles/medium-05.js": 'f5a4a0043f4e',
  "games/chess-puzzle/strings.js": 'e4da594f370e',
  "games/chess-puzzle/style.css": 'b83d6f2ca9e5',
  "games/conquest/ai.js": '80f3b04bd190',
  "games/conquest/audio.js": '5e7cb52b5672',
  "games/conquest/index.html": 'cfdf77f25d33',
  "games/conquest/logic.js": 'eec49d800c6c',
  "games/conquest/main.js": '5196d4119481',
  "games/conquest/mapgen.js": 'be65a7ae32e2',
  "games/conquest/strings.js": '64ea6f9dc22d',
  "games/conquest/style.css": '5a13b61fa336',
  "games/defense/ai.js": '1b4058689e4f',
  "games/defense/art.js": '836c727a49bf',
  "games/defense/audio.js": 'cdc3f87e71ec',
  "games/defense/data.js": '3ffc9fa7ba8d',
  "games/defense/goals.js": '71fbffa5ac1f',
  "games/defense/index.html": '1110de35992b',
  "games/defense/main.js": '3d1eb634751f',
  "games/defense/mapgen.js": '900f94212880',
  "games/defense/meta.js": '0af1b0f12478',
  "games/defense/paths.js": '2fb5146b4407',
  "games/defense/rules.js": 'a8a97971ce87',
  "games/defense/sprites.js": 'f76e6d1cbc1e',
  "games/defense/strings.js": '3671c00899fc',
  "games/defense/style.css": '9e18878aee92',
  "games/defense/units.png": '09065a937832',
  "games/defense/waves.js": '3286c5ddd73f',
  "games/dicewars/ai.js": 'c1fc55999e3b',
  "games/dicewars/audio.js": 'd11ef8afcce7',
  "games/dicewars/index.html": '1ec93bc044e4',
  "games/dicewars/main.js": '621c32460347',
  "games/dicewars/mapgen.js": 'a5a7a74245fb',
  "games/dicewars/odds.js": 'afc284dd1d0d',
  "games/dicewars/rules.js": 'd19f09b2c010',
  "games/dicewars/strings.js": '32a74876ce4c',
  "games/dicewars/style.css": 'e9489e322c32',
  "games/doppelblock/audio.js": '07d332989066',
  "games/doppelblock/generator.js": '9e3d94cf6db4',
  "games/doppelblock/index.html": '12f46603f37f',
  "games/doppelblock/main.js": 'e378fd20bd1b',
  "games/doppelblock/puzzles.js": 'c3d3fa573ade',
  "games/doppelblock/rules.js": '5ff68793cea9',
  "games/doppelblock/solver.js": '5b8a0452ef58',
  "games/doppelblock/strings.js": 'b6f2b26eee2d',
  "games/doppelblock/style.css": '016c8d5e8a2b',
  "games/hashi/audio.js": '3e3fd63b85ff',
  "games/hashi/generator.js": 'f4b9bda0d9a4',
  "games/hashi/index.html": '7c2db8de7033',
  "games/hashi/main.js": '2193580fcb5a',
  "games/hashi/rules.js": 'de54b204839b',
  "games/hashi/solver.js": '715c8dc5ea12',
  "games/hashi/strings.js": '526c0388c370',
  "games/hashi/style.css": '81251d22b801',
  "games/healer/achievements.js": '76441a7c125f',
  "games/healer/ai.js": 'dd00cb604917',
  "games/healer/archer.png": '0aa8f03c39f9',
  "games/healer/audio.js": '177e7d6b9bd5',
  "games/healer/bard.png": '7160b4b73c9a',
  "games/healer/chief.png": '2745dbaa924e',
  "games/healer/data.js": 'b6569a8218c8',
  "games/healer/ghoul.png": '850a301fd942',
  "games/healer/goblin.png": 'e4eb226e9221',
  "games/healer/hero.png": 'ff295a81e0dd',
  "games/healer/hexer.png": '5881b814ca4a',
  "games/healer/hire.js": 'aedea063189b',
  "games/healer/i18n-data.js": '68cc58c089e3',
  "games/healer/icons.js": '55cd5a2e7a75',
  "games/healer/index.html": '6d8251cf693e',
  "games/healer/items.js": '1a609544d598',
  "games/healer/logic.js": '16758f7cc3bc',
  "games/healer/loot.js": '5f27d9dff06e',
  "games/healer/mage.png": '7daa7727d4d4',
  "games/healer/main.js": 'c96ca1f1f404',
  "games/healer/ogre.png": '8aca8f6677b8',
  "games/healer/orc.png": '10117baefac3',
  "games/healer/paladin.png": 'df5da705adfe',
  "games/healer/priest.png": 'fe4f6c8e1119',
  "games/healer/progress.js": '29dd4f38a380',
  "games/healer/quests.js": '5e5b5b513941',
  "games/healer/reputation.js": 'd1fc798ac6ba',
  "games/healer/rogue.png": '270514d5d831',
  "games/healer/roster.js": '57a0d898f8d4',
  "games/healer/scenes.js": 'ad8f987c0eeb',
  "games/healer/shaman.png": 'e405510dde23',
  "games/healer/shop.js": 'd4109e29c431',
  "games/healer/sprites.js": '27416b1e1474',
  "games/healer/strings.js": '1fbf98a8b3a5',
  "games/healer/style.css": 'e83bfe29ace5',
  "games/healer/tank.png": '26b8b36b0bee',
  "games/healer/warrior.png": 'f4bd12987666',
  "games/healer/zombie.png": 'a70e3427a4c8',
  "games/idioms/audio.js": 'bd429f0da0ec',
  "games/idioms/generator.js": '45b30ac52afe',
  "games/idioms/index.html": 'cd94b8292d04',
  "games/idioms/main.js": '971cc22d7653',
  "games/idioms/rules.js": '8241e8d94a00',
  "games/idioms/solver.js": '83095bf2a489',
  "games/idioms/strings.js": 'a29a703b53ba',
  "games/idioms/style.css": '454905d5a16a',
  "games/idioms/words.js": '27ebf570addf',
  "games/kenken/audio.js": 'e11161a1313d',
  "games/kenken/generator.js": '57241bd75417',
  "games/kenken/index.html": '1f69883aecc8',
  "games/kenken/main.js": '7b3cbe62214b',
  "games/kenken/puzzles.js": 'fe281c1bf6b3',
  "games/kenken/rules.js": '700bde94f935',
  "games/kenken/solver.js": '9b3766da92b2',
  "games/kenken/strings.js": '8bd4e56b3ac7',
  "games/kenken/style.css": 'e570c34fa20d',
  "games/kkodle/audio.js": '52d0c6d5e0f4',
  "games/kkodle/hangul.js": 'dfa1844ce8cc',
  "games/kkodle/index.html": '2bceef518a2d',
  "games/kkodle/logic.js": '4c4fd95d76e4',
  "games/kkodle/main.js": '0b625b45e5ee',
  "games/kkodle/strings.js": 'db721a464db6',
  "games/kkodle/style.css": '8b0b3999d062',
  "games/kkodle/words.js": 'e1426d701033',
  "games/lightup/audio.js": '5936c87a0dde',
  "games/lightup/generator.js": 'b5d30d06e97a',
  "games/lightup/index.html": '602ae3877af2',
  "games/lightup/main.js": 'a93f024cad29',
  "games/lightup/puzzles.js": 'afe06c069e13',
  "games/lightup/rules.js": '3b936b0bfbc2',
  "games/lightup/solver.js": 'b6065407b828',
  "games/lightup/strings.js": 'e4a5bafa889d',
  "games/lightup/style.css": 'ddb82dcdc1b3',
  "games/metro/audio.js": 'c555aa50b470',
  "games/metro/citygen.js": '043ad214f90f',
  "games/metro/demand.js": 'c7f81b302088',
  "games/metro/geom.js": '99acf070879f',
  "games/metro/index.html": 'aa0f61213301',
  "games/metro/lines.js": '451a0a6902b8',
  "games/metro/main.js": 'c3e7e444d397',
  "games/metro/route.js": 'fbc0d21e4227',
  "games/metro/save.js": '0980e8d2e31c',
  "games/metro/strings.js": 'c914e32606f1',
  "games/metro/style.css": '927eb3809162',
  "games/nonogram/audio.js": '7622b6c8af59',
  "games/nonogram/generator.js": '06dae3ab395e',
  "games/nonogram/index.html": '8c16e79fe6ff',
  "games/nonogram/main.js": 'd39f0ce98c45',
  "games/nonogram/pictures.js": '68e870c8b255',
  "games/nonogram/rules.js": '916a931022c4',
  "games/nonogram/solver.js": '0854808cc4f2',
  "games/nonogram/strings.js": 'a29357f498c1',
  "games/nonogram/style.css": '82e54ea2c163',
  "games/nurikabe/audio.js": '81027dad5c44',
  "games/nurikabe/generator.js": '9008855fc62f',
  "games/nurikabe/index.html": '3f28eb97d6ff',
  "games/nurikabe/main.js": 'd99012d81ab3',
  "games/nurikabe/puzzles.js": 'b5cb4535ae77',
  "games/nurikabe/rules.js": 'f4a0acca4b6f',
  "games/nurikabe/solver.js": '4e209b2c34e5',
  "games/nurikabe/strings.js": '7bfccd91bc4e',
  "games/nurikabe/style.css": '9dd3c219ab6b',
  "games/patches/audio.js": 'f6a89b5c2cd0',
  "games/patches/generator.js": '095d30eed4b8',
  "games/patches/icons.js": 'f17e3af5182b',
  "games/patches/index.html": 'ec9696bf729f',
  "games/patches/main.js": '1e5da4ef7f0c',
  "games/patches/rules.js": '195c232c6109',
  "games/patches/solver.js": 'a6e6a1bbb622',
  "games/patches/strings.js": '9d33dcd8517c',
  "games/patches/style.css": '6374db51a742',
  "games/pips/audio.js": '6103f234d661',
  "games/pips/generator.js": '35bbc55e8b60',
  "games/pips/index.html": '82a5be3265d1',
  "games/pips/main.js": '1d0aad51f1a0',
  "games/pips/puzzles.js": '7d0b2b7d948c',
  "games/pips/rules.js": '34abe58f7db5',
  "games/pips/solver.js": '6601f8dc320c',
  "games/pips/strings.js": 'c0d452b42e93',
  "games/pips/style.css": '0f2900a10a51',
  "games/queens/audio.js": 'e6ea7ce87f95',
  "games/queens/doubles.js": 'a4b8d2b72124',
  "games/queens/generator.js": '621130883454',
  "games/queens/icons.js": 'dfe714142cbf',
  "games/queens/index.html": '30bb941278ec',
  "games/queens/main.js": '7fb8f2dcd291',
  "games/queens/rules.js": 'df56ca14bc0d',
  "games/queens/solver.js": 'e14f14a73ba7',
  "games/queens/strings.js": 'b95c0039d885',
  "games/queens/style.css": '853391681296',
  "games/roadworks/audio.js": '3477d3aea1e0',
  "games/roadworks/geom.js": '3a3306c40a49',
  "games/roadworks/grow.js": '653bf8af1482',
  "games/roadworks/icons.js": '1efa648d2634',
  "games/roadworks/index.html": 'd1c5aa0e07d1',
  "games/roadworks/main.js": '7a113b81f5bf',
  "games/roadworks/mapgen.js": 'eb11c555f662',
  "games/roadworks/mission.js": 'f913aa41fe14',
  "games/roadworks/network.js": '5419453db0b1',
  "games/roadworks/strings.js": '2ccf29fbf313',
  "games/roadworks/style.css": '01e88ca3d0a6',
  "games/roadworks/terrain.js": 'b3c2e4446b2b',
  "games/roadworks/traffic.js": 'e939eb659743',
  "games/rushhour/audio.js": '1ca75ce0df98',
  "games/rushhour/generator.js": '7caa353ce7c5',
  "games/rushhour/index.html": '7b1d0909a8e7',
  "games/rushhour/main.js": '0c0cc5dabf6f',
  "games/rushhour/puzzles.js": '7ebcc4812526',
  "games/rushhour/rules.js": '69532977be6e',
  "games/rushhour/solver.js": '8b2582a72a71',
  "games/rushhour/strings.js": 'ac5ea650e63d',
  "games/rushhour/style.css": '7e67f30b022b',
  "games/slitherlink/audio.js": 'c1f0b2239584',
  "games/slitherlink/generator.js": 'c35d5a7f9fef',
  "games/slitherlink/index.html": '41a45c4112f9',
  "games/slitherlink/main.js": '976e8d4e4fcf',
  "games/slitherlink/puzzles.js": '3a4abcfecd6d',
  "games/slitherlink/rules.js": 'c3e4eab73a4b',
  "games/slitherlink/solver.js": '00fd4926b12d',
  "games/slitherlink/strings.js": '927b727ed745',
  "games/slitherlink/style.css": '56875ab963d9',
  "games/sokoban/audio.js": '4faf807604d6',
  "games/sokoban/index.html": 'e73b2845863f',
  "games/sokoban/levels.js": '6f85ec9468aa',
  "games/sokoban/main.js": 'ca765e2879b4',
  "games/sokoban/rules.js": '569ce425d725',
  "games/sokoban/strings.js": '8fe9b111e6aa',
  "games/sokoban/style.css": '4e4efb53d77b',
  "games/sudoku/audio.js": '33781b2dd773',
  "games/sudoku/generator.js": '49b1ee82742d',
  "games/sudoku/index.html": 'e70bb22208fc',
  "games/sudoku/main.js": '1e08d13f0c0d',
  "games/sudoku/solver.js": '3a837766eea0',
  "games/sudoku/strings.js": 'c8d9791506a1',
  "games/sudoku/style.css": '06c817608c5d',
  "games/tango/audio.js": '313b90f25c1a',
  "games/tango/generator.js": 'f47d81841ccd',
  "games/tango/icons.js": '3d5c67aa3d7b',
  "games/tango/index.html": 'e1e9d148a377',
  "games/tango/main.js": '1a0d04a4f5a9',
  "games/tango/rules.js": 'e3dadd0a3e60',
  "games/tango/solver.js": 'a74c1a63edbc',
  "games/tango/strings.js": '1d393aae822a',
  "games/tango/style.css": 'a273d1d73ee0',
  "games/whodunit/audio.js": 'd6c9963fc52c',
  "games/whodunit/generator.js": '48cf72608f02',
  "games/whodunit/index.html": 'b0c5049c248f',
  "games/whodunit/main.js": '1ba4894dce9b',
  "games/whodunit/puzzles.js": '8553d0062a26',
  "games/whodunit/rules.js": 'c1d237701f3d',
  "games/whodunit/solver.js": 'aaf6659daf94',
  "games/whodunit/strings.js": '9648f23c1dea',
  "games/whodunit/style.css": '9d25dfb0942e',
  "games/yacht/ai.js": '693b91c6639b',
  "games/yacht/audio.js": '98745e0a8764',
  "games/yacht/index.html": 'cd10b0956445',
  "games/yacht/main.js": 'bb86185925f3',
  "games/yacht/rules.js": 'c607195580e8',
  "games/yacht/strings.js": 'd7f16a8699f0',
  "games/yacht/style.css": '66c3bb9f5c15',
  "games/zip/audio.js": '542d25f0f599',
  "games/zip/generator.js": '18b017472469',
  "games/zip/index.html": '13e8ca60d0af',
  "games/zip/main.js": '297014c88bd8',
  "games/zip/rules.js": '14f69b2d3e8f',
  "games/zip/solver.js": 'c09390b84613',
  "games/zip/strings.js": '14f2d5774e8b',
  "games/zip/style.css": '93cb55c4e21f',
  "hub.css": 'fb911a0c27a5',
  "hub.js": '6a4f0c8c427a',
  "icons/icon-180.png": 'ce2fa86771c1',
  "icons/icon-192.png": 'a039c60184af',
  "icons/icon-512.png": 'ae1f8f0c2214',
  "index.html": 'ee0c70f343ba',
  "manifest.json": '44ddd1ef817a',
  "shared/analytics.js": '2a72c96709d8',
  "shared/audio.js": 'd7a4a52b6f41',
  "shared/base.css": '06f8e08aec21',
  "shared/base.js": '2fd411070da4',
  "shared/daily-ui.js": '801468e4567e',
  "shared/daily.css": '9481db8196a5',
  "shared/daily.js": '8a75dc5a9c75',
  "shared/i18n.js": 'a25726dfe10f',
  "shared/icons.js": '4147c742c073',
  "shared/offline.js": '08cca255c9c0',
  "shared/result.css": 'cc7aa07ee289',
  "shared/sheet.css": 'c2f7290c234a',
  "shared/sheet.js": '5da86869bb2c',
  "shared/snap.js": 'ee7ca5dc616c',
  "shared/strings.js": '4de52a48e09e',
  "strings.js": 'a745488e5557',
};
// </files>

// 해시를 열쇠에 넣는다. 바뀐 파일만 다시 받게 되고, 주소가 새로우니 브라우저와 CDN의
// HTTP 캐시가 옛 내용을 돌려주지도 않는다(Pages는 쿼리를 무시하고 같은 파일을 준다).
function keyOf(file) {
  return new URL(file + '?v=' + FILES[file], self.registration.scope).href;
}

function fileOf(url) {
  const scope = self.registration.scope;
  const u = new URL(url);
  const bare = u.origin + u.pathname;
  if (!bare.startsWith(scope)) return null;
  let rel = decodeURIComponent(bare.slice(scope.length));
  if (rel === '' || rel.endsWith('/')) rel += 'index.html';
  return Object.prototype.hasOwnProperty.call(FILES, rel) ? rel : null;
}

async function each(items, width, fn) {
  let next = 0;
  async function worker() {
    while (next < items.length) await fn(items[next++]);
  }
  await Promise.all(Array.from({ length: width }, worker));
}

// 하나라도 못 받으면 설치를 통째로 실패시킨다. 반쯤 담긴 새 목록으로 넘어가느니
// 이전 워커와 그 사본을 그대로 두는 편이 낫고, 브라우저가 다음 방문에 다시 시도한다.
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const have = new Set((await cache.keys()).map((r) => r.url));
    const todo = Object.keys(FILES).filter((f) => !have.has(keyOf(f)));
    await each(todo, 6, async (file) => {
      const res = await fetch(keyOf(file), { cache: 'no-cache' });
      if (!res.ok) throw new Error(file + ' ' + res.status);
      await cache.put(keyOf(file), res);
    });
    // 네트워크가 먼저라 새 워커가 바로 넘겨받아도 열린 페이지가 받는 파일은 그대로다.
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name !== CACHE) await caches.delete(name);
    }
    const cache = await caches.open(CACHE);
    const want = new Set(Object.keys(FILES).map(keyOf));
    for (const req of await cache.keys()) {
      if (!want.has(req.url)) await cache.delete(req);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const file = fileOf(req.url);
  if (!file) return;
  event.respondWith(fetch(req).catch(async (err) => {
    const hit = await caches.match(keyOf(file), { cacheName: CACHE });
    if (hit) return hit;
    throw err;
  }));
});
