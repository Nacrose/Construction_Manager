"use client";

class CyberAudioEngine {
  private ctx: AudioContext | null = null;
  private ambientRainGain: GainNode | null = null;
  private ambientNoiseSource: AudioBufferSourceNode | null = null;
  private isInitialized = false;

  private init() {
    if (this.isInitialized && this.ctx) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.isInitialized = true;
    } catch {
      /* AudioContext not permitted or supported */
    }
  }

  // Mechanical cyber terminal key click sound
  playKeyClick(volume = 0.25) {
    this.init();
    if (!this.ctx) return;
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      // Sharp mechanical transient click
      osc.type = "sine";
      osc.frequency.setValueAtTime(1400 + Math.random() * 600, now);
      osc.frequency.exponentialRampToValueAtTime(120, now + 0.025);

      filter.type = "highpass";
      filter.frequency.setValueAtTime(600, now);

      gain.gain.setValueAtTime(volume * 0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.04);
    } catch {
      /* ignore */
    }
  }

  // Tactile switch click on button/toggle
  playTactileClick(volume = 0.2) {
    this.init();
    if (!this.ctx) return;
    if (this.ctx.state === "suspended") this.ctx.resume();

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.exponentialRampToValueAtTime(200, now + 0.018);

      gain.gain.setValueAtTime(volume * 0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.02);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.022);
    } catch {
      /* ignore */
    }
  }

  // Smooth futuristic cell save confirmation
  playCellSave(volume = 0.25) {
    this.init();
    if (!this.ctx) return;
    if (this.ctx.state === "suspended") this.ctx.resume();

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.setValueAtTime(659.25, now + 0.04); // E5

      gain.gain.setValueAtTime(volume * 0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.11);
    } catch {
      /* ignore */
    }
  }

  // Terminal command execution chime
  playCommandChime(volume = 0.3) {
    this.init();
    if (!this.ctx) return;
    if (this.ctx.state === "suspended") this.ctx.resume();

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = "triangle";
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.08);

      gain.gain.setValueAtTime(volume * 0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.16);
    } catch {
      /* ignore */
    }
  }

  // Thunder rumble on lightning
  playThunder(volume = 0.35) {
    this.init();
    if (!this.ctx) return;
    if (this.ctx.state === "suspended") this.ctx.resume();

    try {
      const now = this.ctx.currentTime;
      const bufferSize = this.ctx.sampleRate * 2.0;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = buffer.getChannelData(0);

      // Low frequency noise generator
      let lastOut = 0.0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        output[i] = (lastOut + 0.02 * white) / 1.02;
        lastOut = output[i];
        output[i] *= 3.5;
      }

      const whiteNoise = this.ctx.createBufferSource();
      whiteNoise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(140, now);
      filter.frequency.linearRampToValueAtTime(60, now + 1.8);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(volume * 0.6, now + 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.9);

      whiteNoise.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      whiteNoise.start(now);
      whiteNoise.stop(now + 2.0);
    } catch {
      /* ignore */
    }
  }

  // Ambient rain white noise stream
  startAmbientRain(volume = 0.25) {
    this.init();
    if (!this.ctx) return;
    if (this.ctx.state === "suspended") this.ctx.resume();
    if (this.ambientNoiseSource) return; // already running

    try {
      const now = this.ctx.currentTime;
      const bufferSize = this.ctx.sampleRate * 4.0;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);

      // Pinkish rain noise
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        data[i] = (b0 + b1 + b2 + white * 0.5362) * 0.11;
      }

      this.ambientNoiseSource = this.ctx.createBufferSource();
      this.ambientNoiseSource.buffer = buffer;
      this.ambientNoiseSource.loop = true;

      const filter = this.ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(1200, now);

      this.ambientRainGain = this.ctx.createGain();
      this.ambientRainGain.gain.setValueAtTime(0.001, now);
      this.ambientRainGain.gain.linearRampToValueAtTime(volume * 0.35, now + 1.2);

      this.ambientNoiseSource.connect(filter);
      filter.connect(this.ambientRainGain);
      this.ambientRainGain.connect(this.ctx.destination);

      this.ambientNoiseSource.start(now);
    } catch {
      /* ignore */
    }
  }

  setAmbientRainVolume(volume: number) {
    if (!this.ambientRainGain || !this.ctx) return;
    this.ambientRainGain.gain.setValueAtTime(Math.max(0.0001, volume * 0.35), this.ctx.currentTime);
  }

  stopAmbientRain() {
    if (!this.ambientNoiseSource || !this.ambientRainGain || !this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      this.ambientRainGain.gain.linearRampToValueAtTime(0.001, now + 0.8);
      setTimeout(() => {
        if (this.ambientNoiseSource) {
          try { this.ambientNoiseSource.stop(); } catch {}
          this.ambientNoiseSource.disconnect();
          this.ambientNoiseSource = null;
          this.ambientRainGain = null;
        }
      }, 900);
    } catch {
      this.ambientNoiseSource = null;
      this.ambientRainGain = null;
    }
  }
}

export const cyberAudio = new CyberAudioEngine();
