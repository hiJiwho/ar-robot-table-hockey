/**
 * Web Audio API synthesizer for AR Table Hockey.
 * Generates all sound effects dynamically without relying on external media files.
 */

let audioCtx: AudioContext | null = null;
let masterGainNode: GainNode | null = null;
let isMuted = false;
let masterVolume = 0.85;

function getAudioContext(): { ctx: AudioContext; destination: AudioNode } | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
      masterGainNode = audioCtx.createGain();
      masterGainNode.gain.value = isMuted ? 0 : masterVolume;
      masterGainNode.connect(audioCtx.destination);
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  if (!audioCtx || !masterGainNode) return null;
  masterGainNode.gain.value = isMuted ? 0 : masterVolume;
  return { ctx: audioCtx, destination: masterGainNode };
}

// Helper to create a brief burst of shaped white noise for physical impact texture
function createNoiseBuffer(ctx: AudioContext, duration = 0.05): AudioBuffer {
  const bufferSize = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const output = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    output[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

export const soundManager = {
  setMuted(muted: boolean) {
    isMuted = muted;
    if (masterGainNode) {
      masterGainNode.gain.value = isMuted ? 0 : masterVolume;
    }
  },

  isMuted() {
    return isMuted;
  },

  setVolume(vol: number) {
    masterVolume = Math.max(0, Math.min(1, vol));
    if (masterGainNode && !isMuted) {
      masterGainNode.gain.value = masterVolume;
    }
  },

  getVolume() {
    return masterVolume;
  },

  // [REQ 2] 벽면 바운스: 실제 에어하키 알루미늄/아크릴 레일에 퍽이 "딱- 탁!" 튕기는 소리
  playWallBounce(intensity = 1) {
    if (isMuted) return;
    const audio = getAudioContext();
    if (!audio) return;
    const { ctx, destination } = audio;

    const now = ctx.currentTime;
    const clampedIntensity = Math.min(1.8, Math.max(0.4, intensity));

    // 1. High-frequency click/snap (Plastic rail contact)
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(480 * clampedIntensity, now);
    osc.frequency.exponentialRampToValueAtTime(160, now + 0.05);

    oscGain.gain.setValueAtTime(0.35 * clampedIntensity, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    osc.connect(oscGain);
    oscGain.connect(destination);
    osc.start(now);
    osc.stop(now + 0.05);

    // 2. High-speed noise pop
    try {
      const noise = ctx.createBufferSource();
      noise.buffer = createNoiseBuffer(ctx, 0.03);
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1400, now);
      filter.Q.setValueAtTime(3.0, now);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.22 * clampedIntensity, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(destination);
      noise.start(now);
      noise.stop(now + 0.03);
    } catch {}
  },

  // [REQ 2] 패들(콕) 타격음: 묵직하고 시원한 에어하키 스트라이커 스매시 "퍽-딱!"
  playRobotHit(intensity = 1) {
    if (isMuted) return;
    const audio = getAudioContext();
    if (!audio) return;
    const { ctx, destination } = audio;

    const now = ctx.currentTime;
    const clampedIntensity = Math.min(2.0, Math.max(0.5, intensity));

    // 1. Sub Bass Punch (몸으로 느껴지는 타격감)
    const kick = ctx.createOscillator();
    const kickGain = ctx.createGain();
    kick.type = 'sine';
    kick.frequency.setValueAtTime(320 * clampedIntensity, now);
    kick.frequency.exponentialRampToValueAtTime(50, now + 0.11);
    kickGain.gain.setValueAtTime(0.45 * clampedIntensity, now);
    kickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
    kick.connect(kickGain);
    kickGain.connect(destination);
    kick.start(now);
    kick.stop(now + 0.11);

    // 2. Crisp Plastic Knock (스트라이커 플라스틱 맞닿는 찰진 소리)
    const snap = ctx.createOscillator();
    const snapGain = ctx.createGain();
    snap.type = 'sawtooth';
    snap.frequency.setValueAtTime(920, now);
    snap.frequency.exponentialRampToValueAtTime(280, now + 0.04);
    snapGain.gain.setValueAtTime(0.3 * clampedIntensity, now);
    snapGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    snap.connect(snapGain);
    snapGain.connect(destination);
    snap.start(now);
    snap.stop(now + 0.04);

    // 3. Slap noise transient
    try {
      const noise = ctx.createBufferSource();
      noise.buffer = createNoiseBuffer(ctx, 0.035);
      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(1800, now);
      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.28 * clampedIntensity, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(destination);
      noise.start(now);
      noise.stop(now + 0.035);
    } catch {}
  },

  // [REQ] 핀볼 범퍼/장애물 튕김음: 통통 튀는 경쾌한 핀볼 팝 "통-! 핑-!"
  playBumperHit(intensity = 1, combo = 1) {
    if (isMuted) return;
    const audio = getAudioContext();
    if (!audio) return;
    const { ctx, destination } = audio;

    const now = ctx.currentTime;
    const clampedIntensity = Math.min(2.0, Math.max(0.5, intensity));
    const comboMult = 1 + Math.min(8, combo - 1) * 0.08;

    // 1. High Pop Sine (Chirp)
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    const startFreq = 880 * clampedIntensity * comboMult;
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(320 * comboMult, now + 0.12);

    gain.gain.setValueAtTime(0.38, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(gain);
    gain.connect(destination);
    osc.start(now);
    osc.stop(now + 0.12);

    // 2. Harmonic Ping Ring
    const ping = ctx.createOscillator();
    const pingGain = ctx.createGain();
    ping.type = 'triangle';
    ping.frequency.setValueAtTime(1760 * comboMult, now);
    ping.frequency.exponentialRampToValueAtTime(1200 * comboMult, now + 0.2);
    pingGain.gain.setValueAtTime(0.25, now);
    pingGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    ping.connect(pingGain);
    pingGain.connect(destination);
    ping.start(now);
    ping.stop(now + 0.2);
  },

  // 터보 부스터 패드 사운드 (급가속 쉬이익-!)
  playBoostPad() {
    if (isMuted) return;
    const audio = getAudioContext();
    if (!audio) return;
    const { ctx, destination } = audio;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(280, now);
    osc.frequency.exponentialRampToValueAtTime(1320, now + 0.18);

    gain.gain.setValueAtTime(0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    osc.connect(gain);
    gain.connect(destination);
    osc.start(now);
    osc.stop(now + 0.2);
  },

  // 보너스 링 통과 (슈퍼골 x2 충전 사운드!)
  playPowerUp() {
    if (isMuted) return;
    const audio = getAudioContext();
    if (!audio) return;
    const { ctx, destination } = audio;

    const now = ctx.currentTime;
    const freqs = [587.33, 880, 1174.66, 1760]; // D5, A5, D6, A6
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = now + i * 0.045;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, t);
      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      osc.connect(gain);
      gain.connect(destination);
      osc.start(t);
      osc.stop(t + 0.22);
    });
  },

  // Metallic post ping when hitting near goal post
  playGoalPost() {
    if (isMuted) return;
    const audio = getAudioContext();
    if (!audio) return;
    const { ctx, destination } = audio;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(2150, now);
    osc.frequency.exponentialRampToValueAtTime(1920, now + 0.35);
    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc.connect(gain);
    gain.connect(destination);
    osc.start(now);
    osc.stop(now + 0.35);
  },

  // High speed sonic smash sound
  playHighSpeedSmash() {
    if (isMuted) return;
    const audio = getAudioContext();
    if (!audio) return;
    const { ctx, destination } = audio;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(680, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.22);
    gain.gain.setValueAtTime(0.45, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    osc.connect(gain);
    gain.connect(destination);
    osc.start(now);
    osc.stop(now + 0.22);
  },

  // [REQ 2] 골인 효과음: 경기장 에어혼(Goal Horn) + 웅장한 아케이드 팡파르
  playGoal() {
    if (isMuted) return;
    const audio = getAudioContext();
    if (!audio) return;
    const { ctx, destination } = audio;

    const now = ctx.currentTime;

    // 1. Stadium Goal Horn (경기장 에어혼 듀얼 톱니파 화음)
    [233.08, 293.66, 349.23].forEach((freq) => {
      const horn = ctx.createOscillator();
      const hornGain = ctx.createGain();
      horn.type = 'sawtooth';
      horn.frequency.setValueAtTime(freq, now);
      hornGain.gain.setValueAtTime(0.18, now);
      hornGain.gain.setValueAtTime(0.18, now + 0.45);
      hornGain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
      horn.connect(hornGain);
      hornGain.connect(destination);
      horn.start(now);
      horn.stop(now + 0.65);
    });

    // 2. Victory Arpeggio Chime
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5]; // C5, E5, G5, C6, E6
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const startTime = now + 0.15 + idx * 0.07;
      const duration = 0.38;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.24, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

      osc.connect(gain);
      gain.connect(destination);

      osc.start(startTime);
      osc.stop(startTime + duration);
    });
  },

  // [REQ 2] 심판 호각 소리: 리얼 폭스40(Fox 40) 스타일 스포츠 휘슬 (듀얼 FM 톤 + 공기 호흡음)
  playWhistle() {
    if (isMuted) return;
    const audio = getAudioContext();
    if (!audio) return;
    const { ctx, destination } = audio;

    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'sine';
    osc2.type = 'triangle';
    osc1.frequency.setValueAtTime(2620, now);
    osc2.frequency.setValueAtTime(2880, now);

    // Fast modulation / pea flutter
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.setValueAtTime(32, now);
    lfoGain.gain.setValueAtTime(140, now);
    lfo.connect(osc1.frequency);
    lfo.connect(osc2.frequency);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.26, now + 0.02);
    gain.gain.setValueAtTime(0.26, now + 0.28);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(destination);

    // Breath air noise
    try {
      const breath = ctx.createBufferSource();
      breath.buffer = createNoiseBuffer(ctx, 0.4);
      const bFilter = ctx.createBiquadFilter();
      bFilter.type = 'bandpass';
      bFilter.frequency.setValueAtTime(3000, now);
      bFilter.Q.setValueAtTime(4.0, now);
      const bGain = ctx.createGain();
      bGain.gain.setValueAtTime(0.12, now);
      bGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      breath.connect(bFilter);
      bFilter.connect(bGain);
      bGain.connect(destination);
      breath.start(now);
      breath.stop(now + 0.4);
    } catch {}

    lfo.start(now);
    osc1.start(now);
    osc2.start(now);
    lfo.stop(now + 0.42);
    osc1.stop(now + 0.42);
    osc2.stop(now + 0.42);
  },

  // Countdown beep (3, 2, 1, GO)
  playCountdown(isFinal = false) {
    if (isMuted) return;
    const audio = getAudioContext();
    if (!audio) return;
    const { ctx, destination } = audio;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = isFinal ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(isFinal ? 920 : 520, now);

    const duration = isFinal ? 0.38 : 0.16;
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(destination);

    osc.start(now);
    osc.stop(now + duration);
  },

  // [REQ 2] 타임오버 / 게임종료 버저: 실제 스타디움 아레나 버저(Buzzer)
  playGameOver() {
    if (isMuted) return;
    const audio = getAudioContext();
    if (!audio) return;
    const { ctx, destination } = audio;

    const now = ctx.currentTime;
    // Dual Detuned Sawtooth for thick hockey arena buzzer sound
    [164.81, 166.0].forEach((freq) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0.28, now);
      gain.gain.setValueAtTime(0.28, now + 0.7);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);

      osc.connect(gain);
      gain.connect(destination);

      osc.start(now);
      osc.stop(now + 0.9);
    });
  },
};
