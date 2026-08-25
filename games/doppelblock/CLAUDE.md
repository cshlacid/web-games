# 더블블록

저장소 전체에 걸리는 규칙은 루트 `CLAUDE.md`에 있다. 여기에는 이 게임에만
해당하는 것만 적는다.

## 명령

```bash
node games/doppelblock/logic.test.js      # 규칙·완전 탐색 테스트
node games/doppelblock/solver.test.js     # 논리 기법·힌트 테스트
node games/doppelblock/generator.test.js  # 생성기·난이도 테스트

node games/doppelblock/bake.js 8 45 12345 >> /tmp/eight.txt  # 큰 판 미리 굽기
```

## 큰 판을 미리 굽는 이유

**판을 만든다.** 무작위로 뽑아 매겨 보고 버리는데, 8×8은 논리로 풀리는 판이
0.04%뿐이라 한 판에 18초가 든다. 게임 안에서 만들기에는 너무 무거워서 미리
구워 둔다.

씨앗을 달리해 코어 수만큼 동시에 돌리고 결과를 합치므로, **합칠 때 중복을 다시
걸러낸다** — 프로세스 안에서만 중복을 보기 때문이다.
