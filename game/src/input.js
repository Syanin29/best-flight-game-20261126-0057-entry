// Canyon Courier — keyboard + mouse input. One job: turn devices into one action snapshot.
// Keys (layout-independent event.code): W/S throttle, arrows or A/D pitch+roll, Q/E rudder,
// Space air brake, F drop cargo, C camera, P/Esc pause, R restart, T weather, M mute, 1/2 aircraft.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_VIEW = 4;
export const ACTION_RESTART = 8;
export const ACTION_DROP = 16;
export const ACTION_WEATHER = 32;
export const ACTION_MUTE = 64;

export function createInput(canvas) {
  const keys = new Set();
  const pressed = new Set();
  let lookDX = 0;
  let lookDY = 0;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  function onKeyDown(event) {
    if (event.repeat) return;
    keys.add(event.code);
    pressed.add(event.code);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
      event.preventDefault();
    }
  }
  function onKeyUp(event) {
    keys.delete(event.code);
  }
  function onBlur() {
    keys.clear();
  }
  function onPointerDown(event) {
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  }
  function onPointerMove(event) {
    if (!dragging) return;
    lookDX += event.clientX - lastX;
    lookDY += event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
  }
  function onPointerUp() {
    dragging = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);

  function held(code) {
    return keys.has(code);
  }

  // Continuous axes, read every fixed step. Pitch: ArrowUp noses down (stick forward).
  function axes() {
    const throttle = (held('KeyW') ? 1 : 0) - (held('KeyS') ? 1 : 0);
    const pitch = (held('ArrowDown') ? 1 : 0) - (held('ArrowUp') ? 1 : 0);
    const roll = (held('ArrowLeft') || held('KeyA') ? 1 : 0) - (held('ArrowRight') || held('KeyD') ? 1 : 0);
    const rudder = (held('KeyQ') ? 1 : 0) - (held('KeyE') ? 1 : 0);
    return {
      throttle,
      pitch,
      roll,
      rudder,
      brake: held('Space'),
      lookDX: 0,
      lookDY: 0,
    };
  }

  // Edge-triggered actions, consumed once per frame.
  function takeActions() {
    let out = 0;
    if (pressed.has('Enter') || pressed.has('Space')) out |= ACTION_CONFIRM;
    if (pressed.has('KeyP') || pressed.has('Escape')) out |= ACTION_PAUSE;
    if (pressed.has('KeyC')) out |= ACTION_VIEW;
    if (pressed.has('KeyR')) out |= ACTION_RESTART;
    if (pressed.has('KeyF')) out |= ACTION_DROP;
    if (pressed.has('KeyT')) out |= ACTION_WEATHER;
    if (pressed.has('KeyM')) out |= ACTION_MUTE;
    pressed.clear();
    return out;
  }

  // Mouse-look delta since the last read, in pixels.
  function takeLook() {
    const out = { dx: lookDX, dy: lookDY };
    lookDX = 0;
    lookDY = 0;
    return out;
  }

  function aircraftChoice() {
    if (pressed.has('Digit1')) return 'bush';
    if (pressed.has('Digit2')) return 'swift';
    return null;
  }

  function destroy() {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointercancel', onPointerUp);
  }

  return { axes, takeActions, takeLook, aircraftChoice, held, destroy };
}
