(function () {
  'use strict';

  const { startPuzzle, attemptMove, playReply, expectedMove } = window.ChessPuzzleLogic;
  const pieces = {
    P: '♙', N: '♘', B: '♗', R: '♖', Q: '♕', K: '♔',
    p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚',
  };
  const boardElement = document.querySelector('#board');
  const messageElement = document.querySelector('#message');
  const nextButton = document.querySelector('#next');
  const hintButton = document.querySelector('#hint');
  const soundToggle = document.querySelector('#sound-toggle');
  let puzzleIndex = 0;
  let state;
  let selectedSquare = null;
  let audioContext = null;

  function tone(frequency, duration) {
    if (!soundToggle.checked) return;
    audioContext ||= new AudioContext();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.06, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + duration);
  }

  function squareName(fileIndex, rankIndex) {
    return 'abcdefgh'[fileIndex] + (8 - rankIndex);
  }

  function renderBoard() {
    boardElement.innerHTML = '';
    for (let rankIndex = 0; rankIndex < 8; rankIndex += 1) {
      for (let fileIndex = 0; fileIndex < 8; fileIndex += 1) {
        const square = squareName(fileIndex, rankIndex);
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `square ${(rankIndex + fileIndex) % 2 === 0 ? 'light' : 'dark'}`;
        button.dataset.square = square;
        button.setAttribute('role', 'gridcell');
        button.setAttribute('aria-label', square);
        button.textContent = pieces[state.position.board[square]] || '';
        if (square === selectedSquare) button.classList.add('selected');
        button.addEventListener('click', () => selectSquare(square));
        boardElement.append(button);
      }
    }
  }

  function setMessage(text, kind) {
    messageElement.textContent = text;
    messageElement.dataset.kind = kind || '';
  }

  function renderInfo() {
    const puzzle = state.puzzle;
    document.querySelector('#count').textContent = `문제 ${puzzleIndex + 1} / ${window.CHESS_PUZZLES.length}`;
    document.querySelector('#rating').textContent = `난이도 ${puzzle.rating}`;
    document.querySelector('#title').textContent = puzzle.title;
    document.querySelector('#themes').textContent = puzzle.themes.join(' · ');
  }

  function loadPuzzle(index) {
    puzzleIndex = index % window.CHESS_PUZZLES.length;
    state = startPuzzle(window.CHESS_PUZZLES[puzzleIndex]);
    selectedSquare = null;
    nextButton.hidden = true;
    renderInfo();
    renderBoard();
    setMessage('당신의 차례입니다. 최선의 수를 찾아보세요.');
  }

  function selectSquare(square) {
    if (state.status !== 'playing') return;
    const piece = state.position.board[square];
    if (!selectedSquare) {
      if (!piece) return;
      selectedSquare = square;
      renderBoard();
      return;
    }
    if (selectedSquare === square) {
      selectedSquare = null;
      renderBoard();
      return;
    }
    if (piece && ((piece === piece.toUpperCase()) === (state.position.turn === 'w'))) {
      selectedSquare = square;
      renderBoard();
      return;
    }
    const result = attemptMove(state, selectedSquare, square);
    selectedSquare = null;
    state = result.state;
    renderBoard();

    if (!result.correct) {
      tone(180, 0.18);
      setMessage('그 수는 아닙니다. 다시 생각해 보세요.', 'wrong');
      return;
    }

    tone(660, 0.12);
    if (state.status === 'solved') {
      setMessage('정답입니다! 퍼즐을 풀었습니다.', 'solved');
      nextButton.hidden = false;
      tone(880, 0.2);
      return;
    }

    setMessage('상대가 최선으로 응수합니다…');
    window.setTimeout(() => {
      state = playReply(state);
      renderBoard();
      if (state.status === 'solved') {
        setMessage('정답입니다! 퍼즐을 풀었습니다.', 'solved');
        nextButton.hidden = false;
        tone(880, 0.2);
      } else {
        setMessage('계속해서 가장 강한 수를 두세요.');
      }
    }, 520);
  }

  hintButton.addEventListener('click', () => {
    const move = expectedMove(state);
    if (!move || state.status !== 'playing') return;
    selectedSquare = move.slice(0, 2);
    renderBoard();
    setMessage(`${state.puzzle.hint} 출발 칸을 표시했습니다.`, 'hint');
  });
  nextButton.addEventListener('click', () => loadPuzzle(puzzleIndex + 1));
  loadPuzzle(0);
})();

