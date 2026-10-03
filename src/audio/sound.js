/* Audio Synthesizer Engine */
    class SoundEngine {
      constructor() {
        this.ctx = null;
        this.muted = false;
      }

      init() {
        if (!this.ctx) {
          const AudioContext = window.AudioContext || window.webkitAudioContext;
          if (AudioContext) this.ctx = new AudioContext();
        }
        if (this.ctx && this.ctx.state === 'suspended') {
          this.ctx.resume();
        }
      }

      playSlash() {
        if (this.muted || !this.ctx) return;
        try {
          const now = this.ctx.currentTime;
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          const filter = this.ctx.createBiquadFilter();

          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(550, now);
          osc.frequency.exponentialRampToValueAtTime(90, now + 0.16);

          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(3200, now);
          filter.frequency.exponentialRampToValueAtTime(350, now + 0.16);

          gain.gain.setValueAtTime(0.3, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.16);

          osc.connect(filter);
          filter.connect(gain);
          gain.connect(this.ctx.destination);

          osc.start(now);
          osc.stop(now + 0.17);
        } catch(e) {}
      }

      playLaserShot() {
        if (this.muted || !this.ctx) return;
        try {
          const now = this.ctx.currentTime;
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();

          osc.type = 'sine';
          osc.frequency.setValueAtTime(880, now);
          osc.frequency.exponentialRampToValueAtTime(220, now + 0.12);

          gain.gain.setValueAtTime(0.25, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);

          osc.connect(gain);
          gain.connect(this.ctx.destination);

          osc.start(now);
          osc.stop(now + 0.13);
        } catch(e) {}
      }

      playMagicSpark() {
        if (this.muted || !this.ctx) return;
        try {
          const now = this.ctx.currentTime;
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();

          osc.type = 'triangle';
          osc.frequency.setValueAtTime(1200, now);
          osc.frequency.exponentialRampToValueAtTime(400, now + 0.18);

          gain.gain.setValueAtTime(0.2, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.18);

          osc.connect(gain);
          gain.connect(this.ctx.destination);

          osc.start(now);
          osc.stop(now + 0.19);
        } catch(e) {}
      }

      playCountdownBeep(isFinal) {
        if (this.muted || !this.ctx) return;
        try {
          const now = this.ctx.currentTime;
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = isFinal ? 'triangle' : 'sine';
          osc.frequency.setValueAtTime(isFinal ? 880 : 440, now);
          if (isFinal) {
            osc.frequency.exponentialRampToValueAtTime(1320, now + 0.22);
            gain.gain.setValueAtTime(0.35, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
            osc.start(now);
            osc.stop(now + 0.32);
          } else {
            gain.gain.setValueAtTime(0.25, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.16);
            osc.start(now);
            osc.stop(now + 0.17);
          }
          osc.connect(gain);
          gain.connect(this.ctx.destination);
        } catch(e) {}
      }

      playHit() {
        if (this.muted || !this.ctx) return;
        try {
          const now = this.ctx.currentTime;
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();

          osc.type = 'triangle';
          osc.frequency.setValueAtTime(180, now);
          osc.frequency.exponentialRampToValueAtTime(45, now + 0.14);

          gain.gain.setValueAtTime(0.45, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.14);

          osc.connect(gain);
          gain.connect(this.ctx.destination);

          osc.start(now);
          osc.stop(now + 0.15);
        } catch(e) {}
      }

      playPickup() {
        if (this.muted || !this.ctx) return;
        try {
          const now = this.ctx.currentTime;
          [659.25, 880, 1046.5].forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + idx * 0.04);
            gain.gain.setValueAtTime(0.2, now + idx * 0.04);
            gain.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.04 + 0.12);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now + idx * 0.04);
            osc.stop(now + idx * 0.04 + 0.13);
          });
        } catch(e) {}
      }

      playAnvilStrike() {
        if (this.muted || !this.ctx) return;
        try {
          const now = this.ctx.currentTime;
          [900, 1800, 2700].forEach((freq) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(freq, now);
            gain.gain.setValueAtTime(0.18, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now);
            osc.stop(now + 0.45);
          });

          const sub = this.ctx.createOscillator();
          const subGain = this.ctx.createGain();
          sub.type = 'sine';
          sub.frequency.setValueAtTime(140, now);
          sub.frequency.exponentialRampToValueAtTime(30, now + 0.35);
          subGain.gain.setValueAtTime(0.6, now);
          subGain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
          sub.connect(subGain);
          subGain.connect(this.ctx.destination);
          sub.start(now);
          sub.stop(now + 0.36);
        } catch(e) {}
      }

      playDash() {
        if (this.muted || !this.ctx) return;
        try {
          const now = this.ctx.currentTime;
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(350, now);
          osc.frequency.linearRampToValueAtTime(750, now + 0.09);
          osc.frequency.linearRampToValueAtTime(120, now + 0.2);
          gain.gain.setValueAtTime(0.3, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(now);
          osc.stop(now + 0.22);
        } catch(e) {}
      }

      playNova() {
        if (this.muted || !this.ctx) return;
        try {
          const now = this.ctx.currentTime;
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(120, now);
          osc.frequency.exponentialRampToValueAtTime(1100, now + 0.25);
          osc.frequency.exponentialRampToValueAtTime(50, now + 0.6);
          gain.gain.setValueAtTime(0.5, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.65);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(now);
          osc.stop(now + 0.66);
        } catch(e) {}
      }

      playReviveChime() {
        if (this.muted || !this.ctx) return;
        try {
          const now = this.ctx.currentTime;
          [440, 554.37, 659.25, 880].forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + idx * 0.07);
            gain.gain.setValueAtTime(0.3, now + idx * 0.07);
            gain.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.07 + 0.3);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now + idx * 0.07);
            osc.stop(now + idx * 0.07 + 0.32);
          });
        } catch(e) {}
      }

      playFanfare() {
        if (this.muted || !this.ctx) return;
        try {
          const now = this.ctx.currentTime;
          [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, now + idx * 0.08);
            gain.gain.setValueAtTime(0.25, now + idx * 0.08);
            gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.45);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now + idx * 0.08);
            osc.stop(now + idx * 0.08 + 0.5);
          });
        } catch(e) {}
      }
    }

    const sound = new SoundEngine();


export { SoundEngine, sound };
window.sound = sound;

