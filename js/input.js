// 키 배치. 음식 하나에 키 하나 (밥 · 고기 · 버섯 · 상추). 사람은 1P 하나뿐, 2P는 CPU.
// event.code를 쓰므로 한/영 상태와 관계없이 동작한다.
export const KEYMAP = [{ foods: ['KeyQ', 'KeyW', 'KeyE', 'KeyR'] }];

const LABEL = { Semicolon: ';', Comma: ',', Period: '.', Slash: '/' };
export function keyLabel(code) {
  return LABEL[code] || code.replace('Key', '');
}

const LOOKUP = new Map();
KEYMAP.forEach((m, player) => {
  m.foods.forEach((code, index) => LOOKUP.set(code, { player, index }));
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
    if (action || ['Space', 'Escape', 'Tab', 'Backspace', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    held.add(e.code);
    if (e.repeat) return;
    onKey(e.code, action, e);
  });
  target.addEventListener('keyup', (e) => held.delete(e.code));
  target.addEventListener('blur', () => held.clear());
  return { held };
}
