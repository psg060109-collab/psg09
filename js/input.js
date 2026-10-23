// 키 배치. event.code를 쓰므로 한/영 상태와 관계없이 동작한다.
export const KEYMAP = [
  {
    plates: ['KeyQ', 'KeyW', 'KeyE', 'KeyR'],
    grill: ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyZ', 'KeyX', 'KeyC', 'KeyV'],
  },
  {
    plates: ['KeyU', 'KeyI', 'KeyO', 'KeyP'],
    grill: ['KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'KeyM', 'Comma', 'Period', 'Slash'],
  },
];

const LABEL = { Semicolon: ';', Comma: ',', Period: '.', Slash: '/' };
export function keyLabel(code) {
  return LABEL[code] || code.replace('Key', '');
}

const LOOKUP = new Map();
KEYMAP.forEach((m, player) => {
  m.plates.forEach((code, index) => LOOKUP.set(code, { player, kind: 'plate', index }));
  m.grill.forEach((code, index) => LOOKUP.set(code, { player, kind: 'grill', index }));
});

export function lookup(code) {
  return LOOKUP.get(code) || null;
}

export const GAME_CODES = [...LOOKUP.keys()];

// onKey(code, action|null, event)는 반복 입력이 아닌 keydown마다 한 번 불린다.
export function attachInput(target, onKey) {
  const held = new Set();
  target.addEventListener('keydown', (e) => {
    const action = lookup(e.code);
    if (action || e.code === 'Space' || e.code === 'Escape' || e.code === 'Tab' || e.code === 'Backspace') e.preventDefault();
    held.add(e.code);
    if (e.repeat) return;
    onKey(e.code, action, e);
  });
  target.addEventListener('keyup', (e) => held.delete(e.code));
  target.addEventListener('blur', () => held.clear());
  return { held };
}
