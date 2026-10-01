// --- ИГРА: цикл, камера, свет, сценарии, интерфейс ---
const CIRCLES = {}; // заполняется файлами из js/levels/

class Game {
    constructor() {
        initTextures();
        this.canvas = document.getElementById('view');
        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 400);
        this.cam = { x: 0, y: 0, dist: 14, look: 0 };
        this.shakeAmt = 0;
        this.scripts = [];
        this.dt = 0;
        this.time = 0;
        this.state = 'title';
        this.lightSources = [];
        this.stats = { deaths: 0, time: 0 };
        this.camOverride = null;
        this.ui = {};
        for (const id of ['title', 'hud', 'fade', 'flash', 'card', 'card-num', 'card-name', 'card-sub', 'subtitle', 'hint',
            'pause', 'end', 'end-title', 'end-text', 'end-stats', 'boss-marks', 'rotate', 'btn-act', 'story']) {
            this.ui[id] = document.getElementById(id);
        }

        // Свет: мягкий «небесный», контровой от бездны, холодная заливка спереди
        this.hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 1);
        this.key = new THREE.DirectionalLight(0xffffff, 1);
        this.key.position.set(6, 3, -10);
        this.fill = new THREE.DirectionalLight(0xffffff, 0.3);
        this.fill.position.set(-3, 6, 10);
        this.scene.add(this.hemi, this.key, this.fill);
        // Пул точечных источников: число не меняется — шейдеры не перекомпилируются
        this.pool = [];
        for (let i = 0; i < 4; i++) {
            const l = new THREE.PointLight(0xff6a20, 0, 8, 1.6);
            this.scene.add(l);
            this.pool.push(l);
        }

        this.dustParts = [];
        for (let i = 0; i < 24; i++) {
            const s = glowSprite(TEX.glow, 0x6a4a40, 1, 0);
            s.material.blending = THREE.NormalBlending;
            this.scene.add(s);
            this.dustParts.push({ s, life: 0, vx: 0, vy: 0 });
        }

        Input.init();
        this.bindUI();
        window.addEventListener('resize', () => this.resize());
        this.resize();

        const save = Save.load();
        this.save = save;
        document.getElementById('btn-continue').hidden = !(save && save.circle);

        this.loadCircle(1, 0);
        this.state = 'title';
        this.player.state = 'cutscene';
        this.last = performance.now();
        requestAnimationFrame(t => this.frame(t));
    }

    // ---------- уровни ----------
    loadCircle(n, cp) {
        if (this.world) {
            this.scene.remove(this.world.root);
            if (this.world.sky) this.scene.remove(this.world.sky);
            this.scene.remove(this.world.embers, this.world.ash);
            for (const o of this.dynamicObjects || []) this.scene.remove(o);
        }
        // всё, что добавляется в сцену с этого момента, принадлежит уровню
        const before = new Set(this.scene.children);
        this.lightSources = [];
        this.crates = [];
        this.scripts = this.scripts.filter(s => s.keep);
        this.circle = n;
        this.level = CIRCLES[n](this);
        const th = this.level.theme;
        this.scene.fog = new THREE.Fog(th.fog, th.fogNear, th.fogFar);
        this.renderer.setClearColor(th.fog);
        this.hemi.color.set(th.hemiSky);
        this.hemi.groundColor.set(th.hemiGround);
        this.key.color.set(th.key);
        this.fill.color.set(th.fill);

        this.world = new World(this.scene, th);
        this.player = new Player(this);
        this.fairy = new Fairy(this);
        this.level.build();
        this.world.buildBackdrop(this.level.bounds[0], this.level.bounds[1]);
        this.world.buildParticles();
        this.dynamicObjects = this.scene.children.filter(o => !before.has(o) && o !== this.world.root && o !== this.world.sky);
        this.respawn(cp, true);
    }

    respawn(cp, instant = false) {
        this.cpIndex = cp;
        const c = this.level.checkpoints[cp];
        this.player.reset(c.x, c.y, c.face || 1);
        this.scripts = this.scripts.filter(s => s.keep);
        this.camOverride = null;
        Input.enabled = true;
        this.level.reset(cp);
        for (const t of this.level.triggers) t.fired = t.x <= c.x + 0.01 && !t.always;
        this.snapCamera();
        this.ui.subtitle.classList.remove('show');
    }

    checkpointReached(i) {
        if (i <= this.cpIndex) return;
        this.cpIndex = i;
        this.writeSave();
    }

    writeSave() {
        Save.write({ circle: this.circle, cp: this.cpIndex, deaths: this.stats.deaths, time: Math.round(this.stats.time) });
    }

    // ---------- сценарии на генераторах ----------
    // keep — сценарий переживает возрождение (например, сама анимация смерти)
    run(gen, keep = false) { this.scripts.push({ it: gen, wait: 0, until: null, keep }); }

    updateScripts(dt) {
        for (const s of this.scripts.slice()) {
            if (s.wait > 0) { s.wait -= dt; continue; }
            if (s.until && !s.until()) continue;
            s.until = null;
            const r = s.it.next();
            if (r.done) {
                const i = this.scripts.indexOf(s);
                if (i >= 0) this.scripts.splice(i, 1);
                continue;
            }
            if (typeof r.value === 'number') s.wait = r.value;
            else if (typeof r.value === 'function') s.until = r.value;
        }
    }

    *tween(dur, fn) {
        let t = 0;
        while (t < dur) {
            t += this.dt;
            fn(clamp(t / dur, 0, 1));
            yield 0;
        }
    }

    // ---------- события ----------
    killPlayer(kind) {
        const p = this.player;
        if (!p.alive || this.state !== 'play') return;
        p.die(kind);
        this.stats.deaths++;
        Sound.death();
        if (kind === 'lava') { Sound.burn(); this.flash('#ff5a1a', 0.6); }
        if (kind === 'crushed') { this.flash('#3a0000', 0.7); }
        if (kind === 'caught' || kind === 'mauled') { this.flash('#000000', 0.9); Sound.growl(); }
        this.shake(0.4);
        try { navigator.vibrate && navigator.vibrate(120); } catch (e) { /* нет вибрации */ }
        this.run((function* (g) {
            yield 1.0;
            g.fadeTo(1, 0.45);
            yield 0.6;
            g.respawn(g.cpIndex);
            yield 0.15;
            g.fadeTo(0, 0.6);
        })(this), true);
    }

    shake(a) { this.shakeAmt = Math.max(this.shakeAmt, a); }

    dust(x, y, power = 1) {
        let n = 0;
        for (const d of this.dustParts) {
            if (d.life > 0) continue;
            d.life = 1;
            d.s.position.set(x + rand(-0.6, 0.6) * power, y + 0.2, rand(-0.5, 0.8));
            d.vx = rand(-2, 2) * power;
            d.vy = rand(0.5, 2.2) * power;
            d.size = rand(0.6, 1.4) * power;
            if (++n > 10) break;
        }
    }

    flash(color, amount) {
        const f = this.ui.flash;
        f.style.transition = 'none';
        f.style.background = color;
        f.style.opacity = amount;
        void f.offsetWidth;
        f.style.transition = 'opacity 0.9s ease-out';
        f.style.opacity = 0;
    }

    fadeTo(v, dur) {
        const f = this.ui.fade;
        f.style.transition = `opacity ${dur}s ease`;
        f.style.opacity = v;
    }

    showCard(num, name, sub, dur = 3.6) {
        this.ui['card-num'].textContent = num;
        this.ui['card-name'].textContent = name;
        this.ui['card-sub'].textContent = sub || '';
        this.ui.card.classList.add('show');
        clearTimeout(this.cardTimer);
        this.cardTimer = setTimeout(() => this.ui.card.classList.remove('show'), dur * 1000);
    }

    say(text, who = 'fairy', dur = 3) {
        const el = this.ui.subtitle;
        el.textContent = text;
        el.dataset.who = who;
        el.classList.add('show');
        clearTimeout(this.sayTimer);
        this.sayTimer = setTimeout(() => el.classList.remove('show'), dur * 1000);
    }

    // ---------- камера ----------
    baseDist() {
        const aspect = this.camera.aspect;
        const halfW = 6.6; // сколько метров видно по бокам от героя
        const t = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
        return clamp(halfW / (t * aspect), 10.5, 30);
    }

    cameraGoal() {
        const p = this.player;
        let g = { x: p.x + this.cam.look, y: p.y + 1.9, dist: this.baseDist() };
        const z = this.level.cameraZone?.(p);
        if (z) {
            g.x = z.x ?? g.x;
            g.y = z.y ?? g.y;
            g.dist = Math.max(g.dist, z.dist ?? 0);
        }
        if (this.camOverride) Object.assign(g, this.camOverride);
        return g;
    }

    snapCamera() {
        this.cam.look = this.player.face * 1.1;
        const g = this.cameraGoal();
        Object.assign(this.cam, { x: g.x, y: g.y, dist: g.dist });
        this.placeCamera(0);
    }

    updateCamera(dt) {
        const p = this.player;
        if (p.alive) this.cam.look = damp(this.cam.look, p.face * 1.1 + p.vx * 0.15, 1.6, dt);
        const g = this.cameraGoal();
        this.cam.x = damp(this.cam.x, g.x, 3.2, dt);
        this.cam.y = damp(this.cam.y, g.y, 2.6, dt);
        this.cam.dist = damp(this.cam.dist, g.dist, 1.8, dt);
        this.placeCamera(dt);
    }

    placeCamera(dt) {
        this.shakeAmt = Math.max(0, this.shakeAmt - dt * 1.2);
        const s = this.shakeAmt * this.shakeAmt;
        const sx = (Math.random() - 0.5) * s * 1.4, sy = (Math.random() - 0.5) * s * 1.4;
        // лёгкое «дыхание» ручной камеры
        const bx = Math.sin(this.time * 0.37) * 0.06, by = Math.sin(this.time * 0.29) * 0.05;
        this.camera.position.set(this.cam.x + sx + bx, this.cam.y + 1.5 + sy + by, this.cam.dist);
        this.camera.lookAt(this.cam.x + bx * 0.5, this.cam.y + by * 0.5, 0);
    }

    // ---------- свет ----------
    updateLights() {
        const th = this.level.theme;
        const k = clamp(this.world.darkness(this.player.x) + (this.level.flags?.fairyGone ? th.lostLight || 0 : 0), 0, 0.95);
        this.hemi.intensity = th.hemi * (1 - k);
        this.key.intensity = th.keyI * (1 - k * 0.7);
        this.fill.intensity = th.fillI * (1 - k * 0.8);
        const cx = this.cam.x;
        const all = this.world.lightSources.concat(this.lightSources).filter(l => l.intensity > 0);
        all.sort((a, b) => Math.abs(a.pos.x - cx) - Math.abs(b.pos.x - cx));
        for (let i = 0; i < this.pool.length; i++) {
            const l = this.pool[i], s = all[i];
            if (!s || Math.abs(s.pos.x - cx) > 26) { l.intensity = 0; continue; }
            l.position.copy(s.pos);
            l.color.set(s.color);
            l.distance = s.dist;
            const f = s.flicker ? 1 + Math.sin(this.time * 6 + s.pos.x) * 0.12 + Math.sin(this.time * 17 + s.pos.x * 3) * 0.06 : 1;
            l.intensity = s.intensity * f;
        }
    }

    // ---------- цикл ----------
    frame(now) {
        requestAnimationFrame(t => this.frame(t));
        let dt = Math.min(0.05, (now - this.last) / 1000);
        this.last = now;
        if (this.state === 'paused') { this.renderer.render(this.scene, this.camera); return; }
        this.time += dt;
        this.dt = dt;
        Input.update();

        if (this.state === 'play') this.stats.time += dt;
        // физика мелкими шагами — стабильно даже при 30 fps
        const steps = Math.ceil(dt / (1 / 90));
        const h = dt / steps;
        for (let i = 0; i < steps; i++) this.step(h, i === 0);
        this.animate(dt);
        Input.consume();
        this.renderer.render(this.scene, this.camera);
    }

    step(dt, first) {
        const inp = first ? Input : Object.assign({}, Input, { jumpPressed: false, actPressed: false });
        this.player.update(dt, inp);
        for (const c of this.crates) c.update(dt);
        this.level.update?.(dt);
    }

    animate(dt) {
        this.updateScripts(dt);
        const p = this.player;
        if (this.state === 'play' && p.alive) {
            // триггеры и чекпоинты
            for (const t of this.level.triggers) {
                if (!t.fired && p.x >= t.x && (t.cond ? t.cond() : true)) { t.fired = true; t.fn(); }
            }
            const cps = this.level.checkpoints;
            for (let i = this.cpIndex + 1; i < cps.length; i++) {
                if (p.x >= cps[i].x && Math.abs(p.y - cps[i].y) < 3 && p.grounded) this.checkpointReached(i);
            }
            this.updateHint();
        }
        p.animate(dt);
        this.fairy.update(dt, p);
        this.level.animate?.(dt);
        this.world.update(dt, this.cam.x);
        this.world.updateParticles(dt, this.cam.x, this.cam.y);
        for (const d of this.dustParts) {
            if (d.life <= 0) { d.s.material.opacity = 0; continue; }
            d.life -= dt * 0.9;
            d.s.position.x += d.vx * dt;
            d.s.position.y += d.vy * dt;
            d.vy *= 0.97;
            d.s.scale.setScalar(d.size * (1.6 - d.life));
            d.s.material.opacity = Math.max(0, d.life) * 0.5;
        }
        this.updateCamera(dt);
        this.updateLights();

        // кнопка «взять» подсвечивается, когда рядом есть что схватить
        const ready = this.state === 'play' && p.alive && (p.findCrate() || this.level.canInteract?.(p));
        this.ui['btn-act'].classList.toggle('ready', !!ready);
        Sound.setHeart(this.state === 'play' && !!this.level.danger?.());
    }

    updateHint() {
        const p = this.player;
        let text = '';
        for (const h of this.level.hints) {
            if (p.x >= h.x0 && p.x <= h.x1 && (!h.cond || h.cond())) {
                text = Input.touchMode || document.body.classList.contains('touch') ? h.touch : h.kb;
                break;
            }
        }
        if (text !== this.hintText) {
            this.hintText = text;
            const el = this.ui.hint;
            if (text) { el.textContent = text; el.classList.add('show'); }
            else el.classList.remove('show');
        }
    }

    resize() {
        const w = window.innerWidth, h = window.innerHeight;
        this.renderer.setSize(w, h, false);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        const portrait = h > w * 1.1;
        this.ui.rotate.classList.toggle('show', portrait && this.state === 'title' && document.body.classList.contains('touch'));
    }

    // ---------- меню ----------
    bindUI() {
        const $ = id => document.getElementById(id);
        const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
        if (coarse) document.body.classList.add('touch');
        window.addEventListener('pointerdown', e => {
            if (e.pointerType === 'touch') document.body.classList.add('touch');
        }, { capture: true });

        $('btn-new').addEventListener('click', () => this.startNew());
        $('btn-continue').addEventListener('click', () => this.continueGame());
        $('btn-pause').addEventListener('click', () => this.pause(true));
        $('btn-resume').addEventListener('click', () => this.pause(false));
        $('btn-retry').addEventListener('click', () => {
            this.pause(false);
            this.fadeTo(1, 0.2);
            setTimeout(() => { this.respawn(this.cpIndex); this.fadeTo(0, 0.5); }, 250);
        });
        $('btn-sound').addEventListener('click', e => {
            Sound.setMuted(!Sound.muted);
            e.currentTarget.textContent = Sound.muted ? 'Звук: выкл' : 'Звук: вкл';
        });
        $('btn-menu').addEventListener('click', () => this.toMenu());
        $('btn-again').addEventListener('click', () => { this.ui.end.classList.remove('show'); this.startNew(); });
        $('btn-end-menu').addEventListener('click', () => { this.ui.end.classList.remove('show'); this.toMenu(); });
        window.addEventListener('keydown', e => {
            if (e.code === 'Escape' || e.code === 'KeyP') {
                if (this.state === 'play') this.pause(true);
                else if (this.state === 'paused') this.pause(false);
            }
        });
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this.state === 'play') this.pause(true);
        });
    }

    tryFullscreen() {
        if (!document.body.classList.contains('touch')) return;
        try {
            const el = document.documentElement;
            const p = el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : null;
            if (p && p.then) p.then(() => {
                try { screen.orientation.lock('landscape').catch(() => {}); } catch (e) { /* не поддерживается */ }
            }).catch(() => {});
        } catch (e) { /* полноэкранный режим недоступен */ }
    }

    startNew() {
        Sound.init();
        this.tryFullscreen();
        this.stats = { deaths: 0, time: 0 };
        Save.clear();
        this.ui.rotate.classList.remove('show');
        this.ui.title.classList.add('hidden');
        this.state = 'story';
        this.run(this.storyIntro(), true);
    }

    continueGame() {
        Sound.init();
        this.tryFullscreen();
        const s = this.save || Save.load();
        if (!s) return this.startNew();
        this.stats = { deaths: s.deaths || 0, time: s.time || 0 };
        this.ui.rotate.classList.remove('show');
        this.ui.title.classList.add('hidden');
        this.fadeTo(1, 0.3);
        setTimeout(() => {
            this.loadCircle(s.circle || 1, s.cp || 0);
            this.beginPlay();
            this.fadeTo(0, 0.8);
            this.showCard(this.level.numeral, this.level.name, this.level.subtitle);
        }, 350);
    }

    *storyIntro() {
        const st = this.ui.story;
        this.fadeTo(1, 0.6);
        yield 0.7;
        st.classList.add('show');
        for (const line of this.level.story) {
            st.textContent = line;
            st.classList.add('on');
            yield 2.9;
            st.classList.remove('on');
            yield 0.8;
        }
        st.classList.remove('show');
        this.loadCircle(1, 0);
        this.beginPlay();
        this.player.state = 'cutscene';
        this.fadeTo(0, 2.2);
        yield 0.8;
        this.showCard(this.level.numeral, this.level.name, this.level.subtitle, 4);
        yield 1.4;
        this.player.state = 'normal';
        this.level.onStart?.();
    }

    beginPlay() {
        this.state = 'play';
        this.ui.hud.classList.add('show');
        this.writeSave();
    }

    pause(on) {
        if (on && this.state === 'play') {
            this.state = 'paused';
            this.ui.pause.classList.add('show');
            Sound.setHeart(false);
            if (Sound.ctx) Sound.ctx.suspend();
        } else if (!on && this.state === 'paused') {
            this.state = 'play';
            this.ui.pause.classList.remove('show');
            if (Sound.ctx) Sound.ctx.resume();
            this.last = performance.now();
        }
    }

    toMenu() {
        this.writeSave();
        this.ui.pause.classList.remove('show');
        this.ui.hud.classList.remove('show');
        if (Sound.ctx) Sound.ctx.resume();
        Sound.setHeart(false);
        this.state = 'title';
        this.loadCircle(1, 0);
        this.player.state = 'cutscene';
        this.save = Save.load();
        document.getElementById('btn-continue').hidden = !(this.save && this.save.circle);
        this.ui.title.classList.remove('hidden');
        this.fadeTo(0, 0.5);
    }

    finishCircle() {
        this.state = 'end';
        Sound.setHeart(false);
        this.ui.hud.classList.remove('show');
        const L = this.level;
        const next = L.next || {};
        this.ui['end-title'].textContent = L.endTitle;
        this.ui['end-text'].textContent = L.endText;
        const m = Math.floor(this.stats.time / 60), s = Math.floor(this.stats.time % 60);
        this.ui['end-stats'].innerHTML =
            `<div><dt>Время</dt><dd>${m}:${String(s).padStart(2, '0')}</dd></div>` +
            `<div><dt>Смертей</dt><dd>${this.stats.deaths}</dd></div>` +
            `<div><dt>Дальше</dt><dd>${next.label || '—'}</dd></div>`;
        this.ui.end.classList.add('show');
        Save.write({ circle: next.circle && CIRCLES[next.circle] ? next.circle : this.circle, cp: 0, deaths: this.stats.deaths, time: Math.round(this.stats.time), cleared: this.circle });
    }
}

window.addEventListener('load', () => {
    if (!window.THREE) {
        document.getElementById('no-webgl').hidden = false;
        return;
    }
    try {
        window.game = new Game();
    } catch (e) {
        console.error(e);
        document.getElementById('no-webgl').hidden = false;
    }
});
