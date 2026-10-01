// --- СУЩЕСТВА И ПРЕДМЕТЫ ---
const PHYS = {
    G: 26,
    RUN: 4.3,
    CROUCH: 1.7,
    PUSH: 1.8,
    JUMP: 8.2,
    H: 0.95,
    H_CROUCH: 0.58,
    W: 0.42
};

// Поворот модели: через «лицом к камере», как в INSIDE
function faceAngle(face) { return face > 0 ? 0 : -Math.PI; }

// ================= ГЕРОЙ =================
class Player {
    constructor(game) {
        this.game = game;
        this.rig = makeImp();
        game.scene.add(this.rig.root);
        this.w = PHYS.W;
        this.h = PHYS.H;
        this.t = 0;
        this.reset(0, 0, 1);
    }

    reset(x, y, face = 1) {
        Object.assign(this, {
            x, y, vx: 0, vy: 0, face, grounded: true, crouch: false, grab: null,
            state: 'normal', coyote: 0, jumpBuf: 0, phase: 0, mantle: null, hidden: false,
            turn: faceAngle(face), pushDir: 0, deathKind: null, deathT: 0, leverT: 0, reach: 0,
            lastStep: 0, h: PHYS.H, fallFrom: y
        });
        this.rig.root.visible = true;
        this.rig.root.scale.set(1, 1, 1);
        this.rig.root.rotation.set(0, this.turn, 0);
    }

    get alive() { return this.state !== 'dead'; }
    get cx() { return this.x; }
    get cy() { return this.y + this.h / 2; }

    box() { return { x0: this.x - this.w / 2, x1: this.x + this.w / 2, y0: this.y, y1: this.y + this.h }; }

    update(dt, inp) {
        const world = this.game.world;
        this.t += dt;
        if (this.state === 'dead') { this.deathT += dt; return; }
        if (this.state === 'mantle') { this.updateMantle(dt); return; }

        const locked = this.state === 'cutscene' || this.state === 'lever';
        if (this.state === 'lever') {
            this.leverT -= dt;
            if (this.leverT <= 0) this.state = 'normal';
        }
        const ix = locked ? 0 : inp.x;

        // пригнуться / встать
        if (!locked && inp.down && this.grounded && !this.grab) this.crouch = true;
        else if (this.crouch) {
            const standBox = { x0: this.x - this.w / 2, x1: this.x + this.w / 2, y0: this.y + 0.02, y1: this.y + PHYS.H };
            if (!world.overlapsSolid(standBox)) this.crouch = false;
        }
        this.h = this.crouch ? PHYS.H_CROUCH : PHYS.H;

        // схватить ящик
        if (!locked && inp.actHeldAll && this.grounded && !this.crouch) {
            if (!this.grab) this.grab = this.findCrate();
        } else this.grab = null;
        if (this.grab && Math.abs(this.grab.y - this.y) > 0.12) this.grab = null;

        // рычаги и прочее взаимодействие
        if (!locked && inp.actPressed) this.game.level.interact?.(this);

        const speed = this.crouch ? PHYS.CROUCH : this.grab ? PHYS.PUSH : PHYS.RUN;
        const target = ix * speed;
        if (!this.grab && Math.abs(ix) > 0.05) this.face = sign(ix);
        if (this.grab) this.face = sign(this.grab.x - this.x);
        this.vx = damp(this.vx, target, this.grounded ? 18 : 7, dt);
        if (Math.abs(this.vx) < 0.01 && target === 0) this.vx = 0;

        // прыжок с «буфером» и «койотом» — прощает неточные нажатия на телефоне
        this.jumpBuf = (!locked && inp.jumpPressed) ? 0.15 : Math.max(0, this.jumpBuf - dt);
        this.coyote = this.grounded ? 0.1 : Math.max(0, this.coyote - dt);
        if (this.jumpBuf > 0 && this.coyote > 0 && !this.grab && !locked) {
            const standBox = { x0: this.x - this.w / 2, x1: this.x + this.w / 2, y0: this.y + 0.02, y1: this.y + PHYS.H + 0.1 };
            if (!world.overlapsSolid(standBox)) {
                this.crouch = false;
                this.h = PHYS.H;
                this.vy = PHYS.JUMP;
                this.grounded = false;
                this.coyote = 0;
                this.jumpBuf = 0;
                Sound.jump();
            }
        }

        this.vy = Math.max(this.vy - PHYS.G * dt, -24);

        // --- движение по X ---
        const dx = this.vx * dt;
        this.pushDir = 0;
        if (this.grab && dx !== 0) {
            const c = this.grab;
            const dir = sign(c.x - this.x);
            if (sign(dx) === dir) {
                const r = world.moveX(c, dx);
                c.sync();
                world.moveX(this, r.moved);
                this.pushDir = Math.abs(r.moved) > 0.0005 ? 1 : 0;
            } else {
                const r = world.moveX(this, dx);
                world.moveX(c, r.moved);
                c.sync();
                this.pushDir = Math.abs(r.moved) > 0.0005 ? -1 : 0;
            }
            if (this.pushDir && Math.random() < dt * 4) Sound.scrape();
        } else if (dx !== 0) {
            const r = world.moveX(this, dx);
            if (r.wall && !locked && Math.abs(ix) > 0.2 && sign(ix) === sign(dx)) this.tryMantle(r.wall, sign(dx));
            if (this.state === 'mantle') return;
        } else if (!locked && Math.abs(ix) > 0.2) {
            // стоим вплотную к стене и жмём в неё
            const wall = this.probeWall(sign(ix));
            if (wall) this.tryMantle(wall, sign(ix));
            if (this.state === 'mantle') return;
        }

        // --- движение по Y ---
        const wasGrounded = this.grounded;
        const r = world.moveY(this, this.vy * dt);
        if (r.landed) {
            if (!wasGrounded) {
                const fall = this.fallFrom - this.y;
                if (fall > 0.4) Sound.land(clamp(fall / 4, 0.3, 1));
                if (fall > 3) this.game.shake(0.12);
            }
            this.grounded = true;
            this.vy = 0;
        } else {
            if (wasGrounded) this.fallFrom = this.y;
            this.grounded = false;
            if (r.bonk) this.vy = Math.min(this.vy, 0);
        }
        if (this.grounded) this.fallFrom = this.y;

        // в прыжке тоже можно зацепиться за край
        if (!this.grounded && !locked && Math.abs(ix) > 0.2) {
            const wall = this.probeWall(sign(ix));
            if (wall) this.tryMantle(wall, sign(ix));
            if (this.state === 'mantle') return;
        }

        // опасности
        const b = this.box();
        for (const hz of world.hazards) {
            if (rectsOverlap(b, hz)) { this.game.killPlayer(hz.kind); return; }
        }
        if (this.y < -40) { this.game.killPlayer('fall'); return; }

        // спрятался ли в куче костей
        this.hidden = false;
        if (this.crouch) {
            for (const h of world.hides) {
                if (this.x > h.x0 + 0.05 && this.x < h.x1 - 0.05 && this.y >= h.y0 && this.y < h.y1) this.hidden = true;
            }
        }
    }

    probeWall(dir) {
        const b = this.box();
        b.x0 += dir * 0.03; b.x1 += dir * 0.03; b.y0 += 0.01;
        return this.game.world.overlapsSolid(b);
    }

    findCrate() {
        for (const c of this.game.crates) {
            if (Math.abs(c.y - this.y) > 0.08) continue;
            const gapR = c.x0 - (this.x + this.w / 2);
            const gapL = (this.x - this.w / 2) - c.x1;
            if (gapR > -0.05 && gapR < 0.22 && this.face > 0) return c;
            if (gapL > -0.05 && gapL < 0.22 && this.face < 0) return c;
        }
        return null;
    }

    tryMantle(wall, dir) {
        const world = this.game.world;
        const top = wall.y1;
        if (top <= this.y + 0.02) return;
        const hands = this.y + PHYS.H + 0.4;
        const canStep = this.grounded && top - this.y <= 0.55;
        const canClimb = !this.grounded && hands >= top && this.vy < 6;
        if (!canStep && !canClimb) return;
        const nx = dir > 0 ? Math.max(wall.x0 + this.w / 2 + 0.06, this.x) : Math.min(wall.x1 - this.w / 2 - 0.06, this.x);
        const space = { x0: nx - this.w / 2, x1: nx + this.w / 2, y0: top + 0.01, y1: top + PHYS.H_CROUCH };
        if (world.overlapsSolid(space)) return;
        // проход между краем и потолком
        const path = { x0: Math.min(this.x, nx) - this.w / 2, x1: Math.max(this.x, nx) + this.w / 2, y0: top + 0.01, y1: top + PHYS.H_CROUCH };
        if (world.overlapsSolid(path, wall)) return;
        this.state = 'mantle';
        this.grab = null;
        this.crouch = false;
        this.h = PHYS.H;
        this.mantle = { t: 0, dur: canStep ? 0.16 : 0.42, x0: this.x, y0: this.y, x1: nx, y1: top, step: canStep };
        this.vx = 0;
        this.vy = 0;
        if (!canStep) Sound.scrape();
    }

    updateMantle(dt) {
        const m = this.mantle;
        m.t += dt;
        const k = clamp(m.t / m.dur, 0, 1);
        if (k < 0.65) {
            const a = smooth(k / 0.65);
            this.y = lerp(m.y0, m.y1, a);
            this.x = lerp(m.x0, m.x1, a * 0.25);
        } else {
            this.y = m.y1;
            this.x = lerp(m.x0, m.x1, 0.25 + 0.75 * smooth((k - 0.65) / 0.35));
        }
        if (k >= 1) {
            this.x = m.x1;
            this.y = m.y1;
            this.state = 'normal';
            this.grounded = true;
            this.fallFrom = this.y;
            this.mantle = null;
            // если над головой низкий потолок — сразу пригнуться
            const standBox = { x0: this.x - this.w / 2, x1: this.x + this.w / 2, y0: this.y + 0.02, y1: this.y + PHYS.H };
            if (this.game.world.overlapsSolid(standBox)) { this.crouch = true; this.h = PHYS.H_CROUCH; }
        }
    }

    die(kind) {
        this.state = 'dead';
        this.deathKind = kind;
        this.deathT = 0;
        this.grab = null;
        this.deathY = this.y;
    }

    animate(dt) {
        const R = this.rig;
        R.root.position.set(this.x, this.y, 0);
        this.turn = damp(this.turn, faceAngle(this.face), 14, dt);
        R.root.rotation.y = this.turn;

        if (this.state === 'dead') {
            const t = this.deathT;
            if (this.deathKind === 'lava') {
                R.root.position.y = this.deathY - t * 1.2;
                R.body.rotation.z = -0.8;
                R.arms[0].upper.rotation.z = 2.8;
                R.arms[1].upper.rotation.z = 2.4;
            } else if (this.deathKind === 'crushed') {
                R.root.scale.set(1.3, Math.max(0.12, 1 - t * 8), 1.3);
            } else {
                R.body.rotation.z = lerp(R.body.rotation.z, 1.3, clamp(t * 4, 0, 1));
                R.hips.position.y = lerp(0.44, 0.12, clamp(t * 4, 0, 1));
            }
            return;
        }
        R.root.scale.set(1, 1, 1);

        const spd = Math.abs(this.vx) / PHYS.RUN;
        const amt = clamp(spd * 1.25, 0, 1);
        if (this.grounded) {
            const before = Math.sin(this.phase);
            this.phase += Math.abs(this.vx) * dt * 3.4;
            const after = Math.sin(this.phase);
            if (amt > 0.25 && sign(before) !== sign(after)) Sound.step();
        }
        let hipY = 0.44 + Math.abs(Math.sin(this.phase)) * 0.035 * amt;
        let lean = -0.18 * amt;
        R.head.rotation.z = 0.1 * amt;

        if (this.state === 'mantle') {
            const k = this.mantle.t / this.mantle.dur;
            R.arms[0].upper.rotation.z = R.arms[1].upper.rotation.z = lerp(2.9, 1.2, k);
            R.arms[0].fore.rotation.z = R.arms[1].fore.rotation.z = 0.2;
            R.legs[0].thigh.rotation.z = 1.1 * (1 - k) + 0.2;
            R.legs[1].thigh.rotation.z = 0.4 * (1 - k);
            R.legs[0].shin.rotation.z = R.legs[1].shin.rotation.z = -1.4 * (1 - k);
            lean = -0.5;
        } else if (!this.grounded) {
            const up = this.vy > 0;
            R.legs[0].thigh.rotation.z = up ? 0.9 : 0.5;
            R.legs[1].thigh.rotation.z = up ? -0.2 : 0.1;
            R.legs[0].shin.rotation.z = -1.0;
            R.legs[1].shin.rotation.z = -0.6;
            R.arms[0].upper.rotation.z = up ? 2.4 : 1.6 + Math.sin(this.t * 14) * 0.3;
            R.arms[1].upper.rotation.z = up ? 1.6 : 2.2 + Math.cos(this.t * 14) * 0.3;
            R.arms[0].fore.rotation.z = R.arms[1].fore.rotation.z = 0.3;
            lean = -0.1;
        } else if (this.grab) {
            poseWalk(R, this.phase, amt * 0.8, 0.5);
            const push = this.pushDir >= 0;
            lean = push ? -0.55 : 0.2;
            R.arms[0].upper.rotation.z = R.arms[1].upper.rotation.z = push ? 1.35 : 1.15;
            R.arms[0].fore.rotation.z = R.arms[1].fore.rotation.z = push ? 0.25 : 0.1;
            hipY -= 0.04;
        } else if (this.crouch) {
            poseWalk(R, this.phase, amt, 0.35);
            R.legs[0].thigh.rotation.z += 1.25;
            R.legs[1].thigh.rotation.z += 1.25;
            R.legs[0].shin.rotation.z = R.legs[1].shin.rotation.z = -2.1;
            hipY = 0.2;
            lean = -0.65;
            R.head.rotation.z = 0.55;
        } else {
            poseWalk(R, this.phase, amt);
            if (amt < 0.05) {
                // дыхание и нервное оглядывание
                const b = Math.sin(this.t * 2.2);
                R.arms[0].upper.rotation.z = 0.08 + b * 0.04;
                R.arms[1].upper.rotation.z = -0.05 - b * 0.04;
                R.head.rotation.z = Math.sin(this.t * 0.7) * 0.08;
                lean = -0.04 + b * 0.02;
            }
        }
        if (this.reach > 0) {
            // тянется к фее
            R.arms[0].upper.rotation.z = lerp(R.arms[0].upper.rotation.z, 2.5, this.reach);
            R.arms[0].fore.rotation.z = lerp(R.arms[0].fore.rotation.z, 0.1, this.reach);
            R.head.rotation.z = lerp(R.head.rotation.z, 0.6, this.reach);
        }
        R.hips.position.y = damp(R.hips.position.y, hipY, 20, dt);
        R.body.rotation.z = damp(R.body.rotation.z, lean, 12, dt);

        // хвост и крылышки
        for (let i = 0; i < R.tail.length; i++) {
            const base = i === 0 ? -1.25 - spd * 0.3 : -0.2 + spd * 0.06;
            R.tail[i].rotation.z = base + Math.sin(this.t * (3 + spd * 5) - i * 0.7) * (0.1 + spd * 0.1);
        }
        const fl = Math.sin(this.t * (this.grounded ? 3 : 22)) * (this.grounded ? 0.1 : 0.4);
        R.wings[0].rotation.y = 0.6 + fl;
        R.wings[1].rotation.y = -0.6 - fl;
    }
}

// ================= ФЕЯ =================
class Fairy {
    constructor(game) {
        this.game = game;
        this.m = makeFairy();
        game.scene.add(this.m.root);
        this.light = new THREE.PointLight(0x8fe8ff, 0, 11, 1.6);
        game.scene.add(this.light);
        this.pos = new THREE.Vector3();
        this.state = 'follow'; // follow | hint | carried | gone
        this.hint = null;
        this.t = 0;
        this.power = 1;
        this.trail = [];
        for (let i = 0; i < 10; i++) {
            const s = glowSprite(TEX.cyan, 0x9fefff, 0.18, 0);
            game.scene.add(s);
            this.trail.push({ s, life: 0 });
        }
        this.trailT = 0;
    }

    place(x, y) { this.pos.set(x, y, 0.3); }

    setGone(gone) {
        this.state = gone ? 'gone' : 'follow';
        this.m.root.visible = !gone;
        if (gone) for (const p of this.trail) p.s.material.opacity = 0;
    }

    update(dt, player) {
        this.t += dt;
        const R = this.m;
        if (this.state === 'gone') { this.light.intensity = 0; return; }
        if (this.state === 'follow' || this.state === 'hint') {
            let tx, ty;
            if (this.hint) { tx = this.hint.x; ty = this.hint.y + Math.sin(this.t * 2) * 0.12; }
            else {
                tx = player.x - player.face * 0.75 + Math.sin(this.t * 0.9) * 0.25;
                ty = player.y + 1.45 + Math.sin(this.t * 1.7) * 0.15;
            }
            const k = this.hint ? 2.2 : 3.2;
            this.pos.x = damp(this.pos.x, tx, k, dt);
            this.pos.y = damp(this.pos.y, ty, k, dt);
            this.pos.z = damp(this.pos.z, 0.35, 3, dt);
        }
        R.root.position.copy(this.pos);
        const flap = Math.sin(this.t * 34) * 0.7;
        R.wings[0].rotation.y = 0.4 + flap;
        R.wings[1].rotation.y = -0.4 - flap;
        const flick = 1 + Math.sin(this.t * 9) * 0.05 + Math.sin(this.t * 23) * 0.04;
        R.halo.scale.setScalar(0.7 * flick);
        R.aura.material.opacity = 0.33 * this.power;
        this.light.position.copy(this.pos);
        this.light.intensity = 2.0 * flick * this.power;

        // искрящийся шлейф
        this.trailT -= dt;
        if (this.trailT <= 0) {
            this.trailT = 0.06;
            const p = this.trail.find(q => q.life <= 0);
            if (p) { p.life = 1; p.s.position.copy(this.pos).add(new THREE.Vector3(rand(-0.05, 0.05), rand(-0.05, 0.05), 0)); }
        }
        for (const p of this.trail) {
            if (p.life <= 0) { p.s.material.opacity = 0; continue; }
            p.life -= dt * 1.6;
            p.s.position.y -= dt * 0.25;
            p.s.material.opacity = Math.max(0, p.life) * 0.8 * this.power;
            p.s.scale.setScalar(0.06 + p.life * 0.14);
        }
    }
}

// ================= ЯЩИК =================
class Crate {
    constructor(game, x, y, size = 1) {
        this.game = game;
        this.w = this.h = size;
        this.home = { x, y };
        this.dynamic = true;
        this.active = true;
        this.self = this;
        this.kind = 'crate';
        this.mesh = makeCrate(size);
        game.world.root.add(this.mesh);
        game.world.solids.push(this);
        this.place(x, y);
    }
    place(x, y) { this.x = x; this.y = y; this.vy = 0; this.sync(); }
    sync() {
        this.x0 = this.x - this.w / 2; this.x1 = this.x + this.w / 2;
        this.y0 = this.y; this.y1 = this.y + this.h;
        this.mesh.position.set(this.x, this.y, 0);
    }
    update(dt) {
        this.vy = Math.max(this.vy - PHYS.G * dt, -24);
        const r = this.game.world.moveY(this, this.vy * dt);
        if (r.landed) {
            if (this.vy < -6) { Sound.land(1); this.game.shake(0.1); }
            this.vy = 0;
        }
        this.sync();
    }
}

// ================= РЫЧАГ =================
class Lever {
    constructor(game, x, y, onPull) {
        this.game = game;
        this.x = x; this.y = y;
        this.onPull = onPull;
        this.m = makeLever();
        this.m.root.position.set(x, y, -0.45);
        game.world.root.add(this.m.root);
        this.ready = true;
        this.angle = 0.6;
    }
    near(p) { return Math.abs(p.x - this.x) < 0.85 && Math.abs(p.y - this.y) < 0.5; }
    pull(p) {
        if (!this.ready) return false;
        this.ready = false;
        p.state = 'lever';
        p.leverT = 0.35;
        p.face = sign(this.x - p.x) || p.face;
        Sound.lever();
        this.onPull(this);
        return true;
    }
    update(dt) {
        this.angle = damp(this.angle, this.ready ? 0.6 : -0.6, 10, dt);
        this.m.stick.rotation.z = this.angle;
        this.m.glow.material.opacity = this.ready ? 0.6 + Math.sin(performance.now() / 300) * 0.25 : 0.1;
    }
}

// ================= КОЛЕСО С ШИПАМИ (ловушка для босса) =================
class SpikeWheel {
    constructor(game, x, floorY) {
        this.game = game;
        this.x = x;
        this.floorY = floorY;
        this.topY = floorY + 8.6;
        this.bottomY = floorY + 1.5;
        this.mesh = makeSpikeWheel();
        game.world.root.add(this.mesh);
        this.reset();
    }
    reset() {
        this.y = this.topY;
        this.state = 'up';
        this.t = 0;
        this.vy = 0;
        this.lever && (this.lever.ready = true);
    }
    drop() {
        if (this.state !== 'up') return;
        this.state = 'arming';
        this.t = 0.4;
        Sound.chain();
    }
    update(dt) {
        const p = this.game.player;
        if (this.state === 'arming') {
            this.t -= dt;
            if (this.t <= 0) { this.state = 'drop'; this.vy = 0; }
        } else if (this.state === 'drop') {
            this.vy -= 45 * dt;
            this.y += this.vy * dt;
            if (p.alive && Math.abs(p.x - this.x) < 1.15 && p.y + p.h > this.y - 1.5 && p.y < this.y) this.game.killPlayer('crushed');
            if (this.y <= this.bottomY) {
                this.y = this.bottomY;
                this.state = 'down';
                this.t = 2.0;
                Sound.slam();
                this.game.shake(0.45);
                this.game.level.onWheelLand?.(this);
            }
        } else if (this.state === 'down') {
            this.t -= dt;
            if (this.t <= 0) { this.state = 'rise'; Sound.chain(); }
        } else if (this.state === 'rise') {
            this.y += dt * 3.5;
            if (this.y >= this.topY) {
                this.y = this.topY;
                this.state = 'up';
                if (this.lever) this.lever.ready = true;
            }
        }
        const jitter = this.state === 'arming' ? (Math.random() - 0.5) * 0.08 : 0;
        this.mesh.position.set(this.x + jitter, this.y, -0.2);
        this.mesh.rotation.y += dt * (this.state === 'drop' ? 4 : 0.3);
    }
}

// ================= ОХОТНИК С ФОНАРЁМ =================
class Hunter {
    constructor(game, o) {
        this.game = game;
        this.rig = makeHunter();
        game.scene.add(this.rig.root);
        this.o = o;
        this.w = 0.7;
        this.h = 2.2;
        this.light = { pos: new THREE.Vector3(), color: 0xff9a40, intensity: 2.4, dist: 8 };
        game.lightSources.push(this.light);
        this.reset();
    }
    reset() {
        const o = this.o;
        Object.assign(this, {
            x: o.x, y: o.y, vx: 0, vy: 0, face: o.face || 1, state: 'patrol', t: 0, phase: 0,
            turn: faceAngle(o.face || 1), giveUp: 0, tgt: o.patrol ? o.patrol[1] : o.x, look: 0
        });
        this.rig.beam.material.color.set(0xffa040);
        this.rig.beam.material.opacity = 0.07;
        this.animate(0);
    }

    sees(p) {
        if (!p.alive || p.hidden) return false;
        const ex = this.x + this.face * 0.3, ey = this.y + 1.35;
        const dx = p.x - ex, dy = p.cy - ey;
        if (Math.abs(p.x - this.x) < 0.9 && Math.abs(p.y - this.y) < 1.2) return true; // столкнулись нос к носу
        if (dx * this.face < 0.2 || Math.abs(dx) > 6.6) return false;
        if (Math.abs(dy) > Math.abs(dx) * 0.36 + 0.7) return false;
        return this.game.world.lineClear(ex, ey, p.x, p.cy);
    }

    update(dt) {
        const p = this.game.player;
        const world = this.game.world;
        this.t += dt;
        let speed = 0;

        if ((this.state === 'patrol' || this.state === 'wait' || this.state === 'return') && this.sees(p)) {
            this.state = 'alert';
            this.t = 0;
            this.face = sign(p.x - this.x);
            Sound.roar(1.2);
            this.game.shake(0.15);
            this.rig.beam.material.color.set(0xff2a10);
            this.rig.beam.material.opacity = 0.16;
            this.game.alarm = 1;
        }

        switch (this.state) {
            case 'patrol': {
                if (this.o.patrol) {
                    const d = this.tgt - this.x;
                    this.face = sign(d);
                    speed = 1.1;
                    if (Math.abs(d) < 0.1) {
                        this.state = 'wait';
                        this.t = 0;
                    }
                } else if (this.o.turnEvery && this.t > this.o.turnEvery) {
                    this.t = 0;
                    this.face *= -1;
                }
                break;
            }
            case 'wait':
                this.look = Math.sin(this.t * 2.5) * 0.25;
                if (this.t > 1.6) {
                    const [a, b] = this.o.patrol;
                    this.tgt = Math.abs(this.tgt - a) < 0.2 ? b : a;
                    this.state = 'patrol';
                    this.look = 0;
                }
                break;
            case 'alert':
                if (this.t > 0.5) this.state = 'chase';
                break;
            case 'chase': {
                const dx = p.x - this.x;
                this.face = sign(dx);
                speed = 4.9;
                if (p.alive && Math.abs(dx) < 0.75 && p.y - this.y < 1.3 && p.y - this.y > -0.8) {
                    this.game.killPlayer('caught');
                    this.state = 'feast';
                    this.t = 0;
                }
                if (p.y - this.y > 1.4 || !p.alive) this.giveUp += dt; else this.giveUp = 0;
                if (this.giveUp > 2.2) { this.state = 'return'; this.calm(); }
                break;
            }
            case 'feast':
                break;
            case 'return': {
                const home = this.o.patrol ? this.o.patrol[0] : this.o.x;
                const d = home - this.x;
                this.face = sign(d);
                speed = 1.6;
                if (Math.abs(d) < 0.1) {
                    this.state = 'patrol';
                    this.t = 0;
                    this.tgt = this.o.patrol ? this.o.patrol[1] : this.o.x;
                    if (!this.o.patrol) this.face = this.o.face || 1;
                }
                break;
            }
        }

        // физика — охотники не умеют карабкаться
        this.vx = damp(this.vx, this.face * speed, 10, dt);
        world.moveX(this, this.vx * dt);
        this.vy = Math.max(this.vy - PHYS.G * dt, -24);
        const r = world.moveY(this, this.vy * dt);
        if (r.landed) this.vy = 0;
        if (this.state === 'patrol' && this.o.patrol) {
            const [a, b] = this.o.patrol;
            this.x = clamp(this.x, Math.min(a, b) - 0.2, Math.max(a, b) + 0.2);
        }

        this.animate(dt);
    }

    calm() {
        this.rig.beam.material.color.set(0xffa040);
        this.rig.beam.material.opacity = 0.07;
    }

    animate(dt) {
        const R = this.rig;
        R.root.position.set(this.x, this.y, -0.15);
        this.turn = damp(this.turn, faceAngle(this.face), this.state === 'chase' ? 12 : 5, dt);
        R.root.rotation.y = this.turn;
        const amt = clamp(Math.abs(this.vx) / 2.5, 0, 1);
        this.phase += Math.abs(this.vx) * dt * 1.9;
        poseWalk(R, this.phase, amt, 0.55);
        // рука с фонарём вытянута вперёд
        R.arms[0].upper.rotation.z = 1.1 + Math.sin(this.phase) * 0.08;
        R.arms[0].fore.rotation.z = 0.4;
        if (this.state === 'chase' || this.state === 'alert') {
            R.arms[1].upper.rotation.z = 1.9 + Math.sin(this.t * 10) * 0.3;
            R.body.rotation.z = -0.6;
        } else {
            R.body.rotation.z = damp(R.body.rotation.z, -0.35, 5, dt);
        }
        R.head.rotation.y = this.look;
        R.beam.rotation.z = -0.08 + Math.sin(this.t * 1.3) * 0.03;
        R.beam.rotation.y = this.look;
        R.lantern.getWorldPosition(this.light.pos);
        this.light.intensity = 2.2 + Math.sin(this.t * 13) * 0.25;
    }
}

// ================= АДСКИЙ ПЁС =================
class Hound {
    constructor(game, x, y) {
        this.game = game;
        this.rig = makeHound();
        game.scene.add(this.rig.root);
        this.home = { x, y };
        this.w = 0.9;
        this.h = 0.75;
        this.reset();
    }
    reset() {
        Object.assign(this, { x: this.home.x, y: this.home.y, vx: 0, vy: 0, face: 1, state: 'sleep', t: 0, phase: 0, stuck: 0, grounded: true });
        this.rig.root.visible = false;
    }
    wake() {
        if (this.state !== 'sleep') return;
        this.state = 'run';
        this.rig.root.visible = true;
        Sound.growl();
        setTimeout(() => Sound.growl(), 500);
    }
    update(dt) {
        if (this.state === 'sleep' || this.state === 'gone') return;
        const p = this.game.player;
        const world = this.game.world;
        this.t += dt;
        let target = 0;
        if (this.state === 'run') {
            const dx = p.x - this.x;
            this.face = sign(dx);
            target = 4.05 * this.face;
            if (this.grounded) {
                // впереди стена — прыгаем, если не слишком высоко
                const probe = { x0: this.x + this.face * 0.5 - 0.1, x1: this.x + this.face * 0.5 + 0.1 + this.face * 0.4, y0: this.y + 0.1, y1: this.y + 0.6 };
                if (probe.x0 > probe.x1) [probe.x0, probe.x1] = [probe.x1, probe.x0];
                const wall = world.overlapsSolid(probe);
                if (wall && wall.y1 - this.y <= 1.6) { this.vy = 9.6; this.grounded = false; }
                // впереди яма — перепрыгиваем
                const g = world.groundBelow(this.x + this.face * 0.75, this.y + 0.05);
                if (!g || g.y1 < this.y - 0.4) { this.vy = 8; this.grounded = false; }
            }
            if (p.alive && Math.abs(dx) < 0.65 && Math.abs(p.y - this.y) < 0.8) {
                this.game.killPlayer('mauled');
                this.state = 'feast';
            }
            if (p.y - this.y > 1.7) this.stuck += dt; else this.stuck = 0;
            if (this.stuck > 2.4) { this.state = 'leave'; this.t = 0; Sound.growl(); }
        } else if (this.state === 'leave') {
            this.face = -1;
            target = -3;
            if (this.t > 3) { this.state = 'gone'; this.rig.root.visible = false; }
        }
        this.vx = damp(this.vx, target, 8, dt);
        world.moveX(this, this.vx * dt);
        this.vy = Math.max(this.vy - PHYS.G * dt, -24);
        const r = world.moveY(this, this.vy * dt);
        if (r.landed) { this.vy = 0; this.grounded = true; } else this.grounded = false;
        for (const hz of world.hazards) {
            if (rectsOverlap({ x0: this.x - 0.3, x1: this.x + 0.3, y0: this.y, y1: this.y + 0.5 }, hz)) {
                this.state = 'gone';
                this.rig.root.visible = false;
                Sound.burn();
            }
        }
        this.animate(dt);
    }
    animate(dt) {
        const R = this.rig;
        R.root.position.set(this.x, this.y, -0.1);
        R.root.rotation.y = faceAngle(this.face);
        const amt = clamp(Math.abs(this.vx) / 4, 0, 1);
        this.phase += dt * (4 + 12 * amt);
        for (const l of R.legs) {
            const ph = this.phase + (l.front ? 0 : Math.PI * 0.8);
            l.up.rotation.z = Math.sin(ph) * 0.9 * amt;
            l.lo.rotation.z = (l.front ? 0.6 : -0.6) * Math.max(0, Math.cos(ph)) * amt;
        }
        R.body.rotation.z = this.grounded ? Math.sin(this.phase) * 0.12 * amt : clamp(this.vy * 0.05, -0.4, 0.4);
        R.body.position.y = 0.58 + Math.abs(Math.sin(this.phase)) * 0.08 * amt;
        R.tail.rotation.z = -2.2 + Math.sin(this.phase * 0.5) * 0.3;
        R.head.rotation.z = this.state === 'leave' ? -0.3 : Math.sin(this.t * 7) * 0.08;
    }
}

// ================= ПРИВРАТНИК ЛИМБА (босс) =================
class Gatekeeper {
    constructor(game, o) {
        this.game = game;
        this.o = o; // {x, y, minX, maxX}
        this.rig = makeGatekeeper();
        game.scene.add(this.rig.root);
        this.w = 2.0;
        this.h = 5;
        this.eyeLight = { pos: new THREE.Vector3(), color: 0xff3a10, intensity: 0, dist: 10 };
        game.lightSources.push(this.eyeLight);
        this.reset();
    }
    reset() {
        Object.assign(this, {
            x: this.o.x, y: this.o.y, face: -1, hp: 3, state: 'dormant', t: 0, phase: 0, cool: 1.5,
            impactX: 0, rise: 0, turn: faceAngle(-1), hurtT: 0
        });
        this.rig.root.visible = false;
        this.rig.root.rotation.set(0, this.turn, 0);
        for (const a of this.rig.arms) a.glow.material.opacity = 0;
    }
    get reach() { return 2.3; }

    awaken() {
        this.state = 'rising';
        this.t = 0;
        this.rig.root.visible = true;
    }

    hurt() {
        if (this.state === 'dying' || this.state === 'dead') return;
        this.hp--;
        this.hurtT = 1;
        Sound.roar(0.7);
        this.game.shake(0.5);
        for (const a of this.rig.arms) a.glow.material.opacity = 0;
        if (this.hp <= 0) { this.state = 'dying'; this.t = 0; }
        else { this.state = 'stagger'; this.t = 0; }
        this.game.level.onBossHurt?.(this);
    }

    update(dt) {
        if (this.state === 'dormant' || this.state === 'dead') return;
        const p = this.game.player;
        this.t += dt;
        this.cool -= dt;
        this.hurtT = Math.max(0, this.hurtT - dt * 1.5);
        const dx = p.x - this.x;
        const rage = 3 - this.hp; // злее с каждым ударом
        const R = this.rig;

        switch (this.state) {
            case 'rising':
                this.rise = clamp(this.t / 2.2, 0, 1);
                if (this.t > 2.6) { this.state = 'walk'; this.t = 0; }
                break;
            case 'walk': {
                this.face = sign(dx);
                const dist = Math.abs(dx);
                if (dist > this.reach - 0.4) {
                    this.x += this.face * (1.35 + rage * 0.35) * dt;
                    this.phase += dt * (2.2 + rage * 0.6);
                }
                if (dist < this.reach + 1.2 && this.cool <= 0 && p.alive) {
                    this.state = 'windup';
                    this.t = 0;
                    this.hit = false;
                    Sound.growl();
                }
                break;
            }
            case 'windup': {
                const dur = 0.95 - rage * 0.15;
                this.face = sign(dx) || this.face;
                R.arms[0].glow.material.opacity = clamp(this.t / dur, 0, 1) * 0.9;
                if (this.t > dur) {
                    this.state = 'slam';
                    this.t = 0;
                    this.impactX = this.x + this.face * this.reach;
                }
                break;
            }
            case 'slam':
                if (this.t > 0.12 && !this.hit) {
                    this.hit = true;
                    Sound.slam();
                    this.game.shake(0.55);
                    this.game.dust(this.impactX, this.y, 1.4);
                    if (p.alive && Math.abs(p.x - this.impactX) < 1.35 && p.y - this.y < 1.4) this.game.killPlayer('crushed');
                }
                if (this.t > 0.9) {
                    this.state = 'walk';
                    this.t = 0;
                    this.hit = false;
                    this.cool = 1.1 - rage * 0.25;
                    R.arms[0].glow.material.opacity = 0;
                }
                break;
            case 'stagger':
                if (this.t > 1.6) { this.state = 'walk'; this.t = 0; this.cool = 0.8; }
                break;
            case 'dying':
                if (this.t > 3.2) { this.state = 'dead'; this.game.level.onBossDead?.(this); }
                break;
        }
        this.x = clamp(this.x, this.o.minX, this.o.maxX);
        this.animate(dt);
    }

    animate(dt) {
        const R = this.rig;
        let y = this.y;
        if (this.state === 'rising') y = this.y - (1 - smooth(this.rise)) * 6;
        R.root.position.set(this.x, y, -0.7);
        this.turn = damp(this.turn, faceAngle(this.face), 3, dt);
        R.root.rotation.y = this.turn;

        poseWalk(R, this.phase, this.state === 'walk' ? 0.6 : 0, 0.45);
        let lean = -0.25;
        const a0 = R.arms[0], a1 = R.arms[1];
        a1.upper.rotation.z = 0.3 + Math.sin(this.phase) * 0.2;
        a1.fore.rotation.z = 0.5;
        if (this.state === 'windup') {
            const k = smooth(clamp(this.t / 0.6, 0, 1));
            a0.upper.rotation.z = lerp(0.3, 3.0, k);
            a0.fore.rotation.z = lerp(0.5, 0.9, k);
            lean = lerp(-0.25, 0.15, k);
        } else if (this.state === 'slam') {
            const k = smooth(clamp(this.t / 0.12, 0, 1));
            a0.upper.rotation.z = lerp(3.0, 0.75, k);
            a0.fore.rotation.z = lerp(0.9, 0.35, k);
            lean = lerp(0.15, -0.75, k);
        } else if (this.state === 'stagger') {
            lean = 0.35 + Math.sin(this.t * 12) * 0.05 * (1 - this.t / 1.6);
            a0.upper.rotation.z = a1.upper.rotation.z = 2.2;
            R.head.rotation.z = 0.6;
        } else if (this.state === 'dying') {
            const k = smooth(clamp(this.t / 2.5, 0, 1));
            lean = lerp(0.3, -1.4, k);
            R.hips.position.y = lerp(1.6, 0.7, k);
            a0.upper.rotation.z = lerp(2.2, 0.2, k);
            a1.upper.rotation.z = lerp(2.2, 0.4, k);
        } else if (this.state === 'rising') {
            a0.upper.rotation.z = a1.upper.rotation.z = 2.6 * this.rise;
            R.head.rotation.z = 0.5 * this.rise;
        } else {
            a0.upper.rotation.z = 0.3 - Math.sin(this.phase) * 0.2;
            a0.fore.rotation.z = 0.5;
            R.head.rotation.z = 0.15;
        }
        if (this.state !== 'dying') R.hips.position.y = 1.6;
        R.body.rotation.z = damp(R.body.rotation.z, lean, this.state === 'slam' ? 40 : 8, dt);
        R.head.getWorldPosition(this.eyeLight.pos);
        this.eyeLight.intensity = this.state === 'dying' ? Math.max(0, 3 - this.t) : 2.5 + this.hurtT * 4;
    }
}

// ================= ЛОВЧИЙ (сценарное существо) =================
class Reaper {
    constructor(game) {
        this.game = game;
        this.m = makeReaper();
        this.m.root.visible = false;
        this.m.root.rotation.y = -0.5;
        game.scene.add(this.m.root);
        this.pos = new THREE.Vector3();
        this.t = 0;
    }
    update(dt) {
        if (!this.m.root.visible) return;
        this.t += dt;
        const f = Math.sin(this.t * 7);
        this.m.wings[0].rotation.x = -0.3 + f * 0.9;
        this.m.wings[1].rotation.x = 0.3 - f * 0.9;
        this.m.root.position.copy(this.pos);
    }
}
