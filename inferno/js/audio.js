// --- ПРОЦЕДУРНЫЙ ЗВУК (WebAudio, без файлов) ---
const Sound = {
    ctx: null,
    master: null,
    muted: false,
    heart: null,
    noiseBuf: null,

    init() {
        if (this.ctx) {
            if (this.ctx.state === 'suspended') this.ctx.resume();
            return;
        }
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.8;
        this.master.connect(this.ctx.destination);

        const len = this.ctx.sampleRate * 2;
        this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

        this.startAmbience();
    },

    setMuted(m) {
        this.muted = m;
        if (this.master) this.master.gain.value = m ? 0 : 0.8;
    },

    // Гул преисподней: два расстроенных низких тона + ветер
    startAmbience() {
        const c = this.ctx;
        const drone = c.createGain();
        drone.gain.value = 0.07;
        const lp = c.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 180;
        lp.connect(drone);
        drone.connect(this.master);
        for (const f of [41.2, 41.7, 61.7]) {
            const o = c.createOscillator();
            o.type = 'sawtooth';
            o.frequency.value = f;
            o.connect(lp);
            o.start();
        }
        const lfo = c.createOscillator();
        lfo.frequency.value = 0.07;
        const lfoGain = c.createGain();
        lfoGain.gain.value = 70;
        lfo.connect(lfoGain);
        lfoGain.connect(lp.frequency);
        lfo.start();

        const wind = c.createBufferSource();
        wind.buffer = this.noiseBuf;
        wind.loop = true;
        const bp = c.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 400;
        bp.Q.value = 0.6;
        const wg = c.createGain();
        wg.gain.value = 0.035;
        wind.connect(bp);
        bp.connect(wg);
        wg.connect(this.master);
        wind.start();
        const lfo2 = c.createOscillator();
        lfo2.frequency.value = 0.11;
        const l2g = c.createGain();
        l2g.gain.value = 250;
        lfo2.connect(l2g);
        l2g.connect(bp.frequency);
        lfo2.start();
    },

    noise(dur, freq, gain, type = 'lowpass', q = 1) {
        if (!this.ctx) return;
        const c = this.ctx, t = c.currentTime;
        const src = c.createBufferSource();
        src.buffer = this.noiseBuf;
        const f = c.createBiquadFilter();
        f.type = type;
        f.frequency.value = freq;
        f.Q.value = q;
        const g = c.createGain();
        g.gain.setValueAtTime(gain, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        src.connect(f); f.connect(g); g.connect(this.master);
        src.start(t, Math.random() * 1.5);
        src.stop(t + dur + 0.05);
    },

    tone(freq, dur, gain, type = 'sine', slideTo = null, delay = 0) {
        if (!this.ctx) return;
        const c = this.ctx, t = c.currentTime + delay;
        const o = c.createOscillator();
        o.type = type;
        o.frequency.setValueAtTime(freq, t);
        if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g); g.connect(this.master);
        o.start(t);
        o.stop(t + dur + 0.05);
    },

    step() { this.noise(0.08, 900, 0.09, 'bandpass', 1.4); },
    jump() { this.noise(0.12, 600, 0.06, 'bandpass', 0.8); },
    land(k = 1) {
        this.noise(0.18, 300, 0.12 * k);
        this.tone(70, 0.15, 0.08 * k, 'sine', 40);
    },
    scrape() { this.noise(0.25, 250, 0.05, 'bandpass', 3); },
    chime() {
        const notes = [1318, 1568, 1976, 2349];
        for (let i = 0; i < 3; i++) {
            this.tone(notes[(Math.random() * notes.length) | 0], 0.9, 0.025, 'sine', null, i * 0.09);
        }
    },
    roar(k = 1) {
        this.tone(140 * k, 1.1, 0.16, 'sawtooth', 45);
        this.tone(95 * k, 1.2, 0.12, 'square', 35);
        this.noise(1.0, 500, 0.12, 'bandpass', 0.7);
    },
    growl() {
        this.tone(80, 0.6, 0.12, 'sawtooth', 60);
        this.noise(0.6, 300, 0.08, 'bandpass', 2);
    },
    slam() {
        this.noise(0.9, 160, 0.5);
        this.tone(55, 0.8, 0.4, 'sine', 25);
    },
    crack() {
        this.noise(0.4, 2500, 0.18, 'highpass');
        this.noise(1.2, 120, 0.4);
    },
    lever() {
        this.tone(220, 0.15, 0.06, 'square', 110);
        this.noise(0.2, 1500, 0.07, 'bandpass', 4);
    },
    chain() {
        for (let i = 0; i < 6; i++) this.tone(1800 + Math.random() * 900, 0.08, 0.03, 'triangle', null, i * 0.07);
    },
    death() {
        this.tone(110, 1.2, 0.2, 'sine', 30);
        this.noise(0.7, 400, 0.18);
    },
    burn() {
        this.noise(1.0, 3000, 0.12, 'highpass');
        this.tone(200, 0.6, 0.1, 'sawtooth', 60);
    },
    wings() {
        for (let i = 0; i < 4; i++) setTimeout(() => this.noise(0.25, 250, 0.2), i * 300);
    },
    sting() {
        this.tone(73, 2.5, 0.12, 'sawtooth', 70);
        this.tone(77.8, 2.5, 0.1, 'sawtooth', 74);
    },

    // Сердцебиение во время погони
    setHeart(on) {
        if (!this.ctx) return;
        if (on && !this.heart) {
            this.heart = setInterval(() => {
                this.tone(55, 0.18, 0.22, 'sine', 35);
                this.tone(52, 0.2, 0.18, 'sine', 33, 0.22);
            }, 760);
        } else if (!on && this.heart) {
            clearInterval(this.heart);
            this.heart = null;
        }
    }
};
