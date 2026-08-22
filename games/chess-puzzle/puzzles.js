(function (root) {
  'use strict';

  // Lichess Puzzle Database(CC0)에서 테마와 난이도를 고려해 선별했다.
  root.CHESS_PUZZLES = [
    {
      id: '00sHx',
      fen: 'q3k1nr/1pp1nQpp/3p4/1P2p3/4P3/B1PP1b2/B5PP/5K2 b k - 0 17',
      moves: ['e8d7', 'a2e6', 'd7d8', 'f7f8'],
      rating: 1760,
      themes: ['메이트', '중반'],
      title: '대각선 위의 메이트',
      hint: '흑 킹이 옮긴 뒤, 긴 대각선을 다시 보세요.',
    },
    {
      id: '00sJ9',
      fen: 'r3r1k1/p4ppp/2p2n2/1p6/3P1qb1/2NQR3/PPB2PP1/R1B3K1 w - - 5 18',
      moves: ['e3g3', 'e8e1', 'g1h2', 'e1c1', 'a1c1', 'f4h6', 'h2g1', 'h6c1'],
      rating: 2671,
      themes: ['유인', '포크', '희생'],
      title: '백 랭크의 유인',
      hint: '먼저 상대의 수비를 한 칸으로 몰아넣으세요.',
    },
    {
      id: '00sJb',
      fen: 'Q1b2r1k/p2np2p/5bp1/q7/5P2/4B3/PPP3PP/2KR1B1R w - - 1 17',
      moves: ['d1d7', 'a5e1', 'd7d1', 'e1e3', 'c1b1', 'e3b6'],
      rating: 2235,
      themes: ['포크', '긴 수순'],
      title: '침입한 퀸',
      hint: '열린 d파일의 룩을 먼저 활용하세요.',
    },
    {
      id: '00sO1',
      fen: '1k1r4/pp3pp1/2p1p3/4b3/P3n1P1/8/KPP2PN1/3rBR1R b - - 2 31',
      moves: ['b8c7', 'e1a5', 'b7b6', 'f1d1'],
      rating: 998,
      themes: ['발견 공격', '전술'],
      title: '열린 길',
      hint: '상대의 킹과 뒤에 놓인 말을 함께 노리세요.',
    },
  ];
})(window);

