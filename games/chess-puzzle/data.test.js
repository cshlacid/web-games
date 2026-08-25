'use strict';

// 실행: node games/chess-puzzle/data.test.js
//
// data.js는 script 태그를 꽂아 덩이를 받아 오므로 브라우저 없이는 그대로 돌지
// 않는다. 그렇다고 검증을 안 하면 "언제 무엇을 받는가"라는 새 규칙이 아무
// 확인도 없이 배포된다. 그래서 script 태그가 하는 일만 흉내 내는 껍데기를
// 두고, 나머지는 진짜 data.js와 진짜 자료 파일로 돌린다.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passed = 0;
let failed = 0;

function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed++;
  else { failed++; console.log(`실패: ${name}\n  결과 ${a}\n  기대 ${e}`); }
}

const HERE = __dirname;

/** 진짜 브라우저 대신 쓸 최소한의 창. 받은 파일 목록을 남겨 무엇을 언제 받았는지 본다. */
function makeWindow() {
  const requested = [];
  const context = { requested };
  context.window = context;
  context.globalThis = context;

  context.document = {
    head: {
      appendChild(script) {
        requested.push(script.src);
        const file = path.join(HERE, script.src);
        // 브라우저는 받고 나서 실행하고, 그다음에 load를 쏜다. 없는 파일이면
        // error다. 진짜와 같은 순서여야 onload에서 자료를 읽는 것이 통한다.
        setTimeout(() => {
          if (!fs.existsSync(file)) { script.fire('error'); return; }
          vm.runInContext(fs.readFileSync(file, 'utf8'), context, script.src);
          script.fire('load');
        }, 0);
      },
    },
    createElement() {
      const handlers = {};
      return {
        src: '',
        addEventListener(type, fn) { handlers[type] = fn; },
        fire(type) { if (handlers[type]) handlers[type](); },
      };
    },
  };

  vm.createContext(context);
  const run = (file) => vm.runInContext(fs.readFileSync(path.join(HERE, file), 'utf8'), context, file);
  run('puzzles/index.js');
  run('data.js');
  return context;
}

(async () => {
  // --- 목차만으로는 아무것도 받지 않는다 ---
  {
    const win = makeWindow();
    check('목차만 읽은 뒤에는 받은 것이 없다', win.requested, []);
    check('난이도가 셋이다', win.ChessPuzzleData.levelNames, ['easy', 'medium', 'hard']);
    check('아직 첫 문제도 손에 없다', win.ChessPuzzleData.get('easy', 0), null);
  }

  // --- 필요한 덩이만 받는다 ---
  {
    const win = makeWindow();
    const Data = win.ChessPuzzleData;
    const size = win.CHESS_PUZZLE_INDEX.chunkSize;

    const first = await Data.load('easy', 0);
    check('첫 문제를 받으면 첫 덩이 하나만 받는다', win.requested, ['puzzles/easy-00.js']);
    check('받은 문제에 수순이 있다', Array.isArray(first.moves) && first.moves.length >= 2, true);

    await Data.load('easy', size - 1);
    check('같은 덩이 안이면 다시 받지 않는다', win.requested.length, 1);
    check('덩이 안의 마지막 문제도 손에 있다', Data.get('easy', size - 1) !== null, true);

    await Data.load('easy', size);
    check('덩이 경계를 넘으면 다음 덩이를 받는다',
      win.requested, ['puzzles/easy-00.js', 'puzzles/easy-01.js']);

    await Data.load('hard', 0);
    check('난이도를 바꾸면 그 난이도의 덩이를 받는다',
      win.requested[2], 'puzzles/hard-00.js');
  }

  // --- 같은 덩이를 두 번 받지 않는다 ---
  {
    const win = makeWindow();
    const Data = win.ChessPuzzleData;
    // 도착하기 전에 두 번 부르는 경우다. 요청을 캐 두지 않으면 여기서 같은
    // 파일을 두 번 받는다.
    const [a, b] = await Promise.all([Data.load('medium', 0), Data.load('medium', 1)]);
    check('동시에 불러도 한 번만 받는다', win.requested.length, 1);
    check('둘 다 제대로 돌아온다', a.id !== b.id && Boolean(a.id) && Boolean(b.id), true);

    Data.prefetch('medium', 0);
    check('이미 있는 덩이는 미리 받지 않는다', win.requested.length, 1);
  }

  // --- 미리 받아 두면 기다리지 않는다 ---
  {
    const win = makeWindow();
    const Data = win.ChessPuzzleData;
    const size = win.CHESS_PUZZLE_INDEX.chunkSize;

    await Data.load('easy', size - 1);
    check('미리 받기 전에는 다음 덩이가 없다', Data.get('easy', size), null);
    Data.prefetch('easy', size);
    await new Promise((resolve) => setTimeout(resolve, 5));
    // get이 값을 준다는 것은 화면이 기다림 없이 바로 그릴 수 있다는 뜻이다.
    check('미리 받아 두면 다음 문제가 기다림 없이 나온다', Data.get('easy', size) !== null, true);

    Data.prefetch('easy', win.CHESS_PUZZLE_INDEX.levels.easy.count);
    check('없는 번호는 미리 받지 않는다', win.requested.length, 2);
  }

  // --- 못 받았을 때 ---
  {
    const win = makeWindow();
    const Data = win.ChessPuzzleData;
    // 목차가 실제 파일보다 많다고 말하는 상황. 연결이 끊긴 것과 같은 경로다.
    const count = win.CHESS_PUZZLE_INDEX.levels.easy.count;
    win.CHESS_PUZZLE_INDEX.levels.easy.count = count + win.CHESS_PUZZLE_INDEX.chunkSize;
    const missing = count;

    let failedOnce = false;
    try { await Data.load('easy', missing); } catch { failedOnce = true; }
    check('없는 덩이는 실패로 알린다', failedOnce, true);

    // 실패를 캐 두면 다시 눌러도 같은 실패가 그대로 돌아온다. 다시 받으러
    // 나가는지를 요청 수로 본다.
    try { await Data.load('easy', missing); } catch { /* 또 실패한다 */ }
    check('실패한 덩이는 다시 받으러 나간다', win.requested.length, 2);
  }

  console.log(`${passed}개 통과, ${failed}개 실패`);
  process.exit(failed ? 1 : 0);
})();
