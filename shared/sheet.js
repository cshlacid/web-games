'use strict';

// 도움말을 담는 바텀시트. 여섯 게임이 같은 도움말 단추를 들고 있어 뽑아냈다.
//
// 게임의 HTML은 그대로 두고 여기서 껍데기를 씌운다. 껍데기(가림막·손잡이·겹판)를
// 여섯 파일에 복사해 두면 한 곳만 고치는 일이 나고, 도움말 내용은 게임마다
// 다르지만 껍데기는 하나도 다르지 않다.
//
// 닫는 길을 셋 둔다: 손잡이나 본문을 아래로 밀기, 가림막 누르기, Esc.
(function (root) {

// 이만큼 끌어내렸으면 손을 뗐을 때 닫는다. 더 짧으면 읽으려고 살짝 건드린
// 것에도 닫히고, 더 길면 작은 화면에서 끝까지 끌 자리가 없다.
const CLOSE_DISTANCE = 96;
// 짧게 튕겼을 때. 거리가 모자라도 아래로 빠르게 던졌으면 닫는 뜻으로 본다.
const CLOSE_VELOCITY = 0.55;  // px/ms
// CSS의 전환 시간과 맞춘다. transitionend를 놓치는 경우가 있어 시간으로도 끊는다.
const SLIDE_MS = 240;
// 스크롤과 끌기를 가르는 문턱. 이만큼 아래로 움직이기 전에는 아직 판단하지 않는다.
const DRAG_START = 6;

function bind(options) {
  const sheet = options.sheet;
  const opener = options.opener || null;
  const closer = options.closer || null;
  const onOpen = options.onOpen || null;
  const onClose = options.onClose || null;

  const layer = document.createElement('div');
  layer.className = 'sheet-layer';
  layer.hidden = true;
  layer.setAttribute('role', 'dialog');
  layer.setAttribute('aria-modal', 'true');

  const scrim = document.createElement('div');
  scrim.className = 'sheet-scrim';

  const panel = document.createElement('div');
  panel.className = 'sheet-panel';
  panel.tabIndex = -1;

  const grip = document.createElement('div');
  grip.className = 'sheet-grip';
  grip.setAttribute('aria-hidden', 'true');

  const body = document.createElement('div');
  body.className = 'sheet-body';

  sheet.parentNode.insertBefore(layer, sheet);
  body.appendChild(sheet);
  panel.append(grip, body);
  layer.append(scrim, panel);
  // 여닫는 것은 이제 껍데기다. 안에 든 시트는 늘 보이는 상태로 둔다.
  sheet.hidden = false;

  let open = false;
  let closeTimer = null;

  function setOpen(next) {
    if (next === open) return;
    open = next;
    if (opener) opener.setAttribute('aria-pressed', String(open));

    if (open) {
      clearTimeout(closeTimer);
      layer.hidden = false;
      // hidden을 막 벗은 요소에 바로 클래스를 주면 브라우저가 두 변화를 한 번에
      // 처리해 올라오는 모습이 없다. 위치를 한 번 읽어 강제로 끊는다.
      void layer.offsetHeight;
      layer.classList.add('open');
      body.scrollTop = 0;
      panel.focus({ preventScroll: true });
      if (onOpen) onOpen();
    } else {
      layer.classList.remove('open');
      closeTimer = setTimeout(() => { layer.hidden = true; }, SLIDE_MS);
      if (opener) opener.focus({ preventScroll: true });
      if (onClose) onClose();
    }
  }

  if (opener) opener.addEventListener('click', () => setOpen(!open));
  if (closer) closer.addEventListener('click', () => setOpen(false));
  scrim.addEventListener('click', () => setOpen(false));

  // 시트가 열려 있는 동안 Esc는 시트의 것이다. 게임이 Esc에 걸어 둔 다른 일
  // (선택 해제 같은 것)이 같은 눌림에 함께 일어나면 안 되므로 캡처 단계에서
  // 가로채 멈춘다.
  document.addEventListener('keydown', (event) => {
    if (!open || event.key !== 'Escape') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    setOpen(false);
  }, true);

  // --- 아래로 밀어 닫기 ---

  let startY = 0;
  let lastY = 0;
  let lastAt = 0;
  let dragging = false;
  let watching = false;
  let fromGrip = false;
  let pointerId = null;

  function move(dy) {
    panel.style.transform = `translateY(${dy}px)`;
    scrim.style.opacity = String(Math.max(0, 1 - dy / (panel.offsetHeight || 1)));
  }

  function release() {
    layer.classList.remove('dragging');
    panel.style.transform = '';
    scrim.style.opacity = '';
    dragging = false;
    watching = false;
    pointerId = null;
  }

  panel.addEventListener('pointerdown', (event) => {
    if (!open || event.button > 0) return;
    // 단추 위에서 시작한 누름은 단추의 것이다.
    if (event.target.closest('button, a, input, select, textarea')) return;
    watching = true;
    fromGrip = grip.contains(event.target);
    startY = lastY = event.clientY;
    lastAt = event.timeStamp;
    pointerId = event.pointerId;
  });

  panel.addEventListener('pointermove', (event) => {
    if (!watching || event.pointerId !== pointerId) return;
    const dy = event.clientY - startY;
    if (!dragging) {
      // 본문에서는 위쪽 끝에 닿아 있을 때만 끌기로 친다. 그렇지 않으면 읽으려고
      // 스크롤하는 동작이 매번 시트를 닫는다.
      if (dy < DRAG_START) return;
      if (!fromGrip && body.scrollTop > 0) { watching = false; return; }
      dragging = true;
      layer.classList.add('dragging');
      panel.setPointerCapture(event.pointerId);
    }
    lastY = event.clientY;
    lastAt = event.timeStamp;
    move(Math.max(0, dy));
  });

  function finish(event) {
    if (!watching || event.pointerId !== pointerId) return;
    if (!dragging) { watching = false; pointerId = null; return; }
    const dy = Math.max(0, event.clientY - startY);
    const gap = event.timeStamp - lastAt;
    const speed = gap > 0 ? (event.clientY - lastY) / gap : 0;
    release();
    if (dy > CLOSE_DISTANCE || speed > CLOSE_VELOCITY) setOpen(false);
  }

  panel.addEventListener('pointerup', finish);
  panel.addEventListener('pointercancel', (event) => {
    if (event.pointerId === pointerId) release();
  });

  return {
    open: () => setOpen(true),
    close: () => setOpen(false),
    toggle: () => setOpen(!open),
    isOpen: () => open,
    layer,
    panel,
  };
}

const api = { bind, CLOSE_DISTANCE, CLOSE_VELOCITY, SLIDE_MS };

if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.SharedSheet = api;

})(typeof window !== 'undefined' ? window : globalThis);
