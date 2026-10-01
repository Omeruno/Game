// --- УПРАВЛЕНИЕ: клавиатура + сенсорный стик и кнопки ---
const Input = {
    x: 0,            // -1..1, горизонталь
    down: false,     // пригнуться
    jumpHeld: false,
    actHeld: false,
    jumpPressed: false, // срабатывает один кадр
    actPressed: false,
    keys: {},
    stick: { id: null, ox: 0, oy: 0, dx: 0, dy: 0 },
    touchMode: false,
    enabled: true,

    init() {
        window.addEventListener('keydown', e => {
            if (e.repeat) return;
            this.keys[e.code] = true;
            if (['Space', 'ArrowUp', 'KeyW'].includes(e.code)) this.jumpPressed = true;
            if (['KeyE', 'ShiftLeft', 'ShiftRight', 'KeyJ', 'KeyF'].includes(e.code)) this.actPressed = true;
            if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
        });
        window.addEventListener('keyup', e => { this.keys[e.code] = false; });
        window.addEventListener('blur', () => { this.keys = {}; });

        const touch = document.getElementById('touch');
        const zone = document.getElementById('stick-zone');
        const base = document.getElementById('stick-base');
        const knob = document.getElementById('stick-knob');
        const R = 46;

        const placeStick = () => {
            const s = this.stick;
            base.style.transform = `translate(${s.ox - 60}px, ${s.oy - 60}px)`;
            const len = Math.hypot(s.dx, s.dy);
            const k = len > R ? R / len : 1;
            knob.style.transform = `translate(${s.ox + s.dx * k - 26}px, ${s.oy + s.dy * k - 26}px)`;
        };

        zone.addEventListener('pointerdown', e => {
            if (this.stick.id !== null) return;
            this.touchMode = true;
            this.stick.id = e.pointerId;
            this.stick.ox = e.clientX;
            this.stick.oy = e.clientY;
            this.stick.dx = this.stick.dy = 0;
            zone.setPointerCapture(e.pointerId);
            touch.classList.add('stick-on');
            placeStick();
            e.preventDefault();
        });
        zone.addEventListener('pointermove', e => {
            if (e.pointerId !== this.stick.id) return;
            this.stick.dx = e.clientX - this.stick.ox;
            this.stick.dy = e.clientY - this.stick.oy;
            // стик «догоняет» палец, если тот ушёл далеко
            const len = Math.hypot(this.stick.dx, this.stick.dy);
            if (len > R * 1.6) {
                const k = (len - R * 1.6) / len;
                this.stick.ox += this.stick.dx * k;
                this.stick.oy += this.stick.dy * k;
                this.stick.dx = e.clientX - this.stick.ox;
                this.stick.dy = e.clientY - this.stick.oy;
            }
            placeStick();
        });
        const endStick = e => {
            if (e.pointerId !== this.stick.id) return;
            this.stick.id = null;
            this.stick.dx = this.stick.dy = 0;
            touch.classList.remove('stick-on');
        };
        zone.addEventListener('pointerup', endStick);
        zone.addEventListener('pointercancel', endStick);

        const bindBtn = (id, onDown, onUp) => {
            const el = document.getElementById(id);
            const active = new Set();
            el.addEventListener('pointerdown', e => {
                this.touchMode = true;
                active.add(e.pointerId);
                el.setPointerCapture(e.pointerId);
                el.classList.add('pressed');
                onDown();
                e.preventDefault();
            });
            const up = e => {
                if (!active.delete(e.pointerId)) return;
                if (active.size === 0) {
                    el.classList.remove('pressed');
                    onUp();
                }
            };
            el.addEventListener('pointerup', up);
            el.addEventListener('pointercancel', up);
        };
        bindBtn('btn-jump', () => { this.jumpHeld = true; this.jumpPressed = true; }, () => { this.jumpHeld = false; });
        bindBtn('btn-act', () => { this.actHeld = true; this.actPressed = true; }, () => { this.actHeld = false; });

        // долгий тап не должен вызывать меню/выделение
        document.addEventListener('contextmenu', e => e.preventDefault());
    },

    update() {
        const k = this.keys;
        let x = 0;
        if (k.ArrowLeft || k.KeyA) x -= 1;
        if (k.ArrowRight || k.KeyD) x += 1;
        let down = !!(k.ArrowDown || k.KeyS || k.ControlLeft);
        const kbJump = !!(k.Space || k.ArrowUp || k.KeyW);
        const kbAct = !!(k.KeyE || k.ShiftLeft || k.ShiftRight || k.KeyJ || k.KeyF);

        if (this.stick.id !== null) {
            const dx = this.stick.dx;
            if (Math.abs(dx) > 10) x = clamp((dx - sign(dx) * 10) / 30, -1, 1);
            if (this.stick.dy > 30 && Math.abs(this.stick.dy) > Math.abs(dx) * 0.8) down = true;
        }
        this.x = this.enabled ? x : 0;
        this.down = this.enabled && down;
        this.jumpHeldAll = this.enabled && (this.jumpHeld || kbJump);
        this.actHeldAll = this.enabled && (this.actHeld || kbAct);
        if (!this.enabled) { this.jumpPressed = false; this.actPressed = false; }
    },

    // вызывается в конце кадра
    consume() {
        this.jumpPressed = false;
        this.actPressed = false;
    }
};
