// Skylark Archipelago — input: keyboard and mouse, nothing else.
// One job: turn keys and clicks into the small state the flight model reads.

export function makeInput() {
  return {
    keys: new Set(),
    pitch: 0, // -1..1, up positive
    bank: 0, // -1..1, right positive
    throttleUp: false,
    throttleDown: false,
    gearToggle: false,
    pressed: new Set(), // keys pressed since the last frame (edge-triggered)
    mouseX: 0,
    mouseY: 0,
    clicked: false, // a click waiting to be consumed by the menu
  };
}

const PITCH_KEYS = { ArrowUp: 1, KeyW: 0 }; // W is throttle up, arrows pitch
const THROTTLE_KEYS = { KeyW: 1, KeyS: -1 };

export function attachInput(input, canvas) {
  window.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
      e.preventDefault();
    }
    if (!e.repeat) {
      input.keys.add(e.code);
      input.pressed.add(e.code);
      if (e.code === 'KeyG') input.gearToggle = true;
    }
  });
  window.addEventListener('keyup', (e) => {
    input.keys.delete(e.code);
  });
  window.addEventListener('blur', () => {
    input.keys.clear();
  });
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    input.mouseX = e.clientX - rect.left;
    input.mouseY = e.clientY - rect.top;
  });
  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    input.mouseX = e.clientX - rect.left;
    input.mouseY = e.clientY - rect.top;
    input.clicked = true;
  });
}

// Read the held keys into the per-frame control state.
export function pollInput(input) {
  const k = input.keys;
  const pitchUp = (k.has('ArrowUp') ? 1 : 0) + (k.has('KeyI') ? 1 : 0);
  const pitchDown = (k.has('ArrowDown') ? 1 : 0) + (k.has('KeyK') ? 1 : 0);
  const bankLeft = (k.has('ArrowLeft') ? 1 : 0) + (k.has('KeyJ') ? 1 : 0);
  const bankRight = (k.has('ArrowRight') ? 1 : 0) + (k.has('KeyL') ? 1 : 0);
  input.pitch = Math.max(-1, Math.min(1, pitchUp - pitchDown));
  input.bank = Math.max(-1, Math.min(1, bankRight - bankLeft));
  input.throttleUp = k.has('KeyW') || k.has('ShiftLeft') || k.has('ShiftRight');
  input.throttleDown = k.has('KeyS') || k.has('ControlLeft') || k.has('ControlRight');
  void PITCH_KEYS;
  void THROTTLE_KEYS;
}

export function consumeClick(input) {
  const c = input.clicked;
  input.clicked = false;
  return c;
}

export function consumePress(input, code) {
  const hit = input.pressed.has(code);
  if (hit) input.pressed.delete(code);
  return hit;
}

export function endFrameInput(input) {
  input.pressed.clear();
}
