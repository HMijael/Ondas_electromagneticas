/**
 * xray-physics-lab-3d
 * Web Audio API Acoustic Synthesizer for High-Voltage Radiological Instrumentation
 * Features: Rotor induction whistle, HV contactor click, 60/120Hz transformer hum,
 * and Geiger-Müller radiation clicks.
 */

export class LaboratoryAudioSynthesizer {
  constructor() {
    this.ctx = null;
    this.isMuted = true; // Default muted until user interacts to comply with browser autoplay policies
    this.isInitialized = false;

    // Audio nodes
    this.masterGain = null;
    this.rotorOsc = null;
    this.rotorGain = null;
    this.transformerOsc1 = null;
    this.transformerOsc2 = null;
    this.transformerGain = null;
    this.geigerGain = null;

    this.geigerNextClickTime = 0;
  }

  init() {
    if (this.isInitialized) return;

    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;

      this.ctx = new AudioContext();

      // Master Gain
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0.0 : 0.28, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      // 1. Rotor Induction Motor Whistle (High-frequency turbine whistle)
      this.rotorOsc = this.ctx.createOscillator();
      this.rotorOsc.type = 'triangle';
      this.rotorOsc.frequency.setValueAtTime(200, this.ctx.currentTime);

      this.rotorGain = this.ctx.createGain();
      this.rotorGain.gain.setValueAtTime(0.0, this.ctx.currentTime);
      this.rotorOsc.connect(this.rotorGain);
      this.rotorGain.connect(this.masterGain);
      this.rotorOsc.start();

      // 2. High Voltage Transformer Hum (60 Hz fundamental + 120 Hz harmonic ripple)
      this.transformerOsc1 = this.ctx.createOscillator();
      this.transformerOsc1.type = 'sawtooth';
      this.transformerOsc1.frequency.setValueAtTime(60.0, this.ctx.currentTime);

      this.transformerOsc2 = this.ctx.createOscillator();
      this.transformerOsc2.type = 'sine';
      this.transformerOsc2.frequency.setValueAtTime(120.0, this.ctx.currentTime);

      this.transformerGain = this.ctx.createGain();
      this.transformerGain.gain.setValueAtTime(0.0, this.ctx.currentTime);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(240, this.ctx.currentTime);

      this.transformerOsc1.connect(this.transformerGain);
      this.transformerOsc2.connect(this.transformerGain);
      this.transformerGain.connect(filter);
      filter.connect(this.masterGain);

      this.transformerOsc1.start();
      this.transformerOsc2.start();

      // 3. Geiger counter clicks gain
      this.geigerGain = this.ctx.createGain();
      this.geigerGain.gain.setValueAtTime(0.3, this.ctx.currentTime);
      this.geigerGain.connect(this.masterGain);

      this.isInitialized = true;
    } catch (err) {
      // AudioContext unavailable or blocked
      console.warn('AudioContext initialization deferred:', err);
    }
  }

  ensureContextRunning() {
    if (!this.ctx) {
      this.init();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  toggleMute() {
    this.ensureContextRunning();
    this.isMuted = !this.isMuted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.isMuted ? 0.0 : 0.28, this.ctx.currentTime, 0.05);
    }
    return !this.isMuted;
  }

  /**
   * High-voltage contactor solenoid 'CLACK' sound upon switching exposure.
   */
  playContactorClick(isClosing) {
    if (this.isMuted || !this.ctx || this.ctx.state !== 'running') return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'square';
      osc.frequency.setValueAtTime(isClosing ? 120 : 90, now);
      osc.frequency.exponentialRampToValueAtTime(30, now + 0.06);

      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now);
      osc.stop(now + 0.08);
    } catch (e) {}
  }

  /**
   * Generates a single crisp Geiger-Müller radiation discharge click.
   */
  triggerGeigerClick() {
    if (this.isMuted || !this.ctx || this.ctx.state !== 'running') return;

    try {
      const now = this.ctx.currentTime;
      const bufferSize = this.ctx.sampleRate * 0.003; // 3ms pulse
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);

      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
      }

      const source = this.ctx.createBufferSource();
      source.buffer = buffer;

      const clickGain = this.ctx.createGain();
      clickGain.gain.setValueAtTime(0.35, now);

      source.connect(clickGain);
      clickGain.connect(this.geigerGain);

      source.start(now);
    } catch (e) {}
  }

  /**
   * Per-frame audio synthesis update tied to tube physical parameters.
   */
  update(isExposing, currentRPM, intensityRatio) {
    if (!this.ctx || this.ctx.state !== 'running' || this.isMuted) return;

    const now = this.ctx.currentTime;

    // 1. Rotor whistle pitch proportional to RPM (0 to ~9600 RPM -> 150 Hz to 1250 Hz)
    if (this.rotorOsc && this.rotorGain) {
      const rpmRatio = Math.max(0, Math.min(1.0, currentRPM / 10000.0));
      const targetFreq = 160.0 + rpmRatio * 1150.0;
      const targetRotorVol = 0.02 + rpmRatio * 0.12;

      this.rotorOsc.frequency.setTargetAtTime(targetFreq, now, 0.1);
      this.rotorGain.gain.setTargetAtTime(targetRotorVol, now, 0.1);
    }

    // 2. Transformer electrical hum active only when X-ray exposure is ON
    if (this.transformerGain) {
      const targetHumVol = isExposing ? 0.08 : 0.0;
      this.transformerGain.gain.setTargetAtTime(targetHumVol, now, 0.05);
    }

    // 3. Geiger counter clicks rate proportional to filtered beam intensity
    if (isExposing && intensityRatio > 0.05) {
      if (now >= this.geigerNextClickTime) {
        this.triggerGeigerClick();
        // Poisson-like inter-arrival interval
        const clicksPerSec = 8.0 + intensityRatio * 35.0;
        const meanInterval = 1.0 / clicksPerSec;
        this.geigerNextClickTime = now + (-Math.log(Math.random() + 1e-6) * meanInterval);
      }
    }
  }
}
