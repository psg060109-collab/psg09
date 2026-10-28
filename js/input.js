// 키 배치 (사람은 왼쪽 자리 하나, 오른쪽은 CPU).
//  Q W E R          : 접시 (밥 먹기 · 고기 올리기 · 버섯 올리기 · 상추 먹기)
//  Shift + Q W E R  : 불판 윗줄 1~4번 칸 먹기
//  Shift + U I O P  : 불판 아랫줄 5~8번 칸 먹기
// event.code를 쓰므로 한/영 상태와 관계없이 동작한다.
export const KEYMAP = {
  foods: ['KeyQ', 'KeyW', 'KeyE', 'KeyR'],
  slots: ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyU', 'KeyI', 'KeyO', 'KeyP'],
};

const LABEL = { Semicolon: ';', Comma: ',', Period: '.', Slash: '/' };
export function keyLabel(code) {
  return LABEL[code] || code.replace('Key', '');
}

export function lookup(code, shift = false) {
  if (shift) {
    const index = KEYMAP.slots.indexOf(code);
    return index >= 0 ? { kind: 'slot', index } : null;
  }
  const index = KEYMAP.foods.indexOf(code);
  return index >= 0 ? { kind: 'plate', index } : null;
}

export const GAME_CODES = [...new Set([...KEYMAP.foods, ...KEYMAP.slots])];

// onKey(code, action|null, event)는 반복 입력이 아닌 keydown마다 한 번 불린다.
export function attachInput(target, onKey) {
  const held = new Set();
  target.addEventListener('keydown', (e) => {
    // 이름 입력창에 글자를 칠 때는 게임 키로 쓰지 않는다
    if (e.target && e.target.tagName === 'INPUT') return;
    const action = lookup(e.code, e.shiftKey);
    if (action || GAME_CODES.includes(e.code) || ['Space', 'Escape', 'Tab', 'Backspace', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    held.add(e.code);
    if (e.repeat) return;
    onKey(e.code, action, e);
  });
  target.addEventListener('keyup', (e) => held.delete(e.code));
  target.addEventListener('blur', () => held.clear());
  return { held };
}
