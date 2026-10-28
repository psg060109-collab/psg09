// 효과음. 소리 파일 없이 Web Audio로 그 자리에서 합성한다 (8비트 게임기 느낌).
// 브라우저는 사용자가 한 번 누르기 전에는 소리를 못 내므로, 첫 키 입력·탭 때 unlock()을 부른다.
const MUTE_KEY = 'bulpan-muted';

function loadMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function createAudio() {
  let ac = null;
  let master = null;
  let noiseBuf = null;
  let muted = loadMuted();
  let beat = 0; // 다음 심장 소리까지 남은 시간

  function unlock() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        ac = new AC();
      } catch {
        return;
      }
      master = ac.createGain();
      master.gain.value = muted ? 0 : 0.45;
      master.connect(ac.destination);
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ac.state === 'suspended') ac.resume().catch(() => {});
  }

  const ready = () => ac && !muted && ac.state === 'running';

  // 짧은 음 하나: 주파수 freq(Hz)에서 to까지 미끄러지며 dur초 동안
  function tone(freq, dur, { type = 'square', vol = 0.15, at = 0, to = freq } = {}) {
    const t = ac.currentTime + at;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to !== freq) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  // 지글지글·탁 같은 잡음
  function noise(dur, { vol = 0.1, at = 0, type = 'highpass', freq = 3000 } = {}) {
    const t = ac.currentTime + at;
    const s = ac.createBufferSource();
    s.buffer = noiseBuf;
    const f = ac.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(master);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.02);
  }

  const notes = (list, { type = 'square', vol = 0.12, gap = 0.09, len = 0.12 } = {}) =>
    list.forEach((f, k) => tone(f, len, { type, vol, at: k * gap }));

  const SOUNDS = {
    place: () => noise(0.35, { vol: 0.09, freq: 2500 }),
    eat: () => {
      tone(520, 0.06, { vol: 0.1 });
      tone(390, 0.07, { vol: 0.1, at: 0.07 });
    },
    // 콤보가 이어질수록 한 음씩 높아진다
    perfect: (combo = 1) => {
      const k = 2 ** ((2 * Math.min(combo - 1, 6)) / 12);
      notes([523 * k, 659 * k, 784 * k, 1047 * k], { type: 'triangle', vol: 0.16, gap: 0.05, len: 0.1 });
    },
    fumble: () => tone(140, 0.16, { type: 'sawtooth', vol: 0.12, to: 90 }),
    penalty: () => {
      tone(150, 0.12, { type: 'sawtooth', vol: 0.14, to: 100 });
      tone(100, 0.2, { type: 'sawtooth', vol: 0.14, at: 0.12, to: 60 });
    },
    chiliHit: () => tone(900, 0.5, { type: 'square', vol: 0.1, to: 160 }),
    chiliGive: () => tone(300, 0.25, { type: 'square', vol: 0.1, to: 1200 }),
    golden: () => notes([1319, 1568, 2093, 2637], { type: 'triangle', vol: 0.1, gap: 0.06, len: 0.14 }),
    fever: () => notes([523, 659, 784, 1047, 784, 1047], { vol: 0.12, gap: 0.08, len: 0.11 }),
    beep: () => tone(440, 0.12, { vol: 0.12 }),
    go: () => tone(880, 0.3, { vol: 0.14 }),
    win: () => notes([523, 659, 784, 1047, 1319, 1568], { vol: 0.13, gap: 0.11, len: 0.18 }),
    lose: () => notes([392, 370, 349, 262], { type: 'sawtooth', vol: 0.1, gap: 0.28, len: 0.34 }),
    heart: () => {
      tone(70, 0.12, { type: 'sine', vol: 0.5, to: 45 });
      tone(62, 0.14, { type: 'sine', vol: 0.4, at: 0.16, to: 40 });
    },
  };

  function play(name, ...args) {
    if (!ready() || !SOUNDS[name]) return;
    try {
      SOUNDS[name](...args);
    } catch {
      // 소리는 게임 진행과 무관하니 실패해도 넘어간다
    }
  }

  // 위기 심장 소리: danger 0(안전)~1(거의 0)일 때 매 틱 부른다. 위험할수록 빨리 뛴다
  function heartbeat(dt, danger) {
    if (danger <= 0) {
      beat = 0;
      return;
    }
    beat -= dt;
    if (beat > 0) return;
    play('heart');
    beat = 0.95 - 0.5 * danger;
  }

  function setMuted(v) {
    muted = v;
    if (master) master.gain.value = v ? 0 : 0.45;
    try {
      localStorage.setItem(MUTE_KEY, v ? '1' : '0');
    } catch {
      // 저장이 막혀 있어도 이번 세션 동안은 유지
    }
  }

  return {
    unlock,
    play,
    heartbeat,
    get muted() {
      return muted;
    },
    toggle() {
      setMuted(!muted);
      return muted;
    },
  };
}

// 게임 이벤트 → 효과음. 내 행동(0번)은 다 들리고, CPU는 나에게 영향이 있는 것만 들린다
export function soundsFor(audio, events) {
  for (const ev of events) {
    const me = ev.player === 0;
    switch (ev.type) {
      case 'place':
        if (me) audio.play('place');
        break;
      case 'eat':
        if (me && !ev.perfect) audio.play('eat');
        break;
      case 'grillEat':
        if (me && ev.perfect) audio.play('perfect', ev.combo);
        break;
      case 'fail':
        if (me && ev.loss) audio.play('penalty');
        else if (me && ['empty', 'full', 'none', 'raw', 'burnt'].includes(ev.reason)) audio.play('fumble');
        break;
      case 'chili':
        audio.play(ev.target === 0 ? 'chiliHit' : 'chiliGive');
        break;
      case 'special':
        if (ev.kind === 'golden') audio.play('golden');
        break;
      case 'feverStart':
        audio.play('fever');
        break;
    }
  }
}
