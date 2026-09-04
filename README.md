# web-games

브라우저에서 바로 하는 미니 게임 모음.

**▶ [플레이하기](https://cshlacid.github.io/web-games/)**

## 게임

| 게임 | 설명 | 스택 |
|---|---|---|
| [2048](games/2048/) | 같은 숫자를 밀어 붙여 2048을 만든다 | 순수 HTML/CSS/JS |
| [꼬들](games/kkodle/) | 두 글자 한글 단어를 여섯 번 안에 맞힌다 | 순수 HTML/CSS/JS |
| [스도쿠](games/sudoku/) | 힌트만으로 풀리는 판만 나온다 | 순수 HTML/CSS/JS |
| [더블블록](games/doppelblock/) | 검은 칸 사이 숫자의 합을 맞힌다 | 순수 HTML/CSS/JS |
| [체스 퍼즐](games/chess-puzzle/) | 가장 강한 수를 찾아 전술을 푼다 | 순수 HTML/CSS/JS |
| [한붓그리기](games/zip/) | 숫자를 순서대로 밟아 모든 칸을 한 번에 지난다 | 순수 HTML/CSS/JS |
| [왕관 놓기](games/queens/) | 행·열·색마다 왕관을 하나씩 놓는다 | 순수 HTML/CSS/JS |
| [Patches](games/patches/) | 격자를 직사각형 조각으로 남김없이 나눈다 | 순수 HTML/CSS/JS |
| [힐러](games/healer/) | 파티에서 힐러 하나만 맡는다 | 순수 HTML/CSS/JS |

## 로컬에서 실행

빌드 단계가 없다. 저장소를 받아서 정적 서버로 열면 된다.

```bash
python3 -m http.server 8000
# http://localhost:8000
```

게임 하나만 확인할 때는 해당 폴더의 `index.html`을 브라우저로 직접 열어도 된다.

## 테스트

```bash
node games/2048/logic.test.js
node games/kkodle/logic.test.js
node games/sudoku/logic.test.js
node games/doppelblock/logic.test.js
node games/doppelblock/solver.test.js
node games/doppelblock/generator.test.js
node games/chess-puzzle/logic.test.js
node games/chess-puzzle/data.test.js
node games/zip/rules.test.js
node games/zip/solver.test.js
node games/zip/generator.test.js
node games/queens/rules.test.js
node games/queens/solver.test.js
node games/queens/generator.test.js
node games/patches/rules.test.js
node games/patches/solver.test.js
node games/patches/generator.test.js
node games/healer/logic.test.js
node games/healer/ai.test.js
node games/healer/attrs.test.js
node games/healer/items.test.js
node games/healer/roster.test.js
node games/healer/progress.test.js
node games/healer/quests.test.js
node games/healer/shop.test.js
node games/healer/flow.test.js
node games/healer/loot.test.js
node games/healer/art.test.js
```

## 구조

게임 하나가 `games/<이름>/` 폴더 하나에 담기고, 서로 독립적이다. 스택은 게임마다
다를 수 있다. 루트 `index.html`이 게임 목록 페이지다.

기여·작업 규칙은 [CLAUDE.md](CLAUDE.md) 참고.
