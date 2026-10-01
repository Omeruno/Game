// --- МОДЕЛИ ИЗ ПРИМИТИВОВ ---
// Всё собирается из сфер/цилиндров/конусов: тёмные силуэты читаются на светящемся фоне,
// как в INSIDE. Модели смотрят вдоль +X.

const MAT = {
    imp: new THREE.MeshLambertMaterial({ color: 0x1e0f0d }),
    demon: new THREE.MeshLambertMaterial({ color: 0x170b0a }),
    boss: new THREE.MeshLambertMaterial({ color: 0x1a0c0b }),
    horn: new THREE.MeshLambertMaterial({ color: 0x2b1d18 }),
    bone: new THREE.MeshLambertMaterial({ color: 0x4a3c33 }),
    wood: new THREE.MeshLambertMaterial({ color: 0x2c1b13 }),
    iron: new THREE.MeshLambertMaterial({ color: 0x1b1715 }),
    rock: new THREE.MeshLambertMaterial({ color: 0x1f1513 }),
    eye: new THREE.MeshBasicMaterial({ color: 0xffa22a }),
    eyeRed: new THREE.MeshBasicMaterial({ color: 0xff2a10 }),
    ember: new THREE.MeshBasicMaterial({ color: 0xff7a2a })
};

const TEX = {};
function initTextures() {
    TEX.glow = glowTexture('rgba(255,255,255,1)');
    TEX.fire = glowTexture('rgba(255,150,60,1)', 'rgba(255,60,0,0)');
    TEX.cyan = glowTexture('rgba(190,250,255,1)', 'rgba(60,200,255,0)');
    TEX.wing = wingTexture();
}

function glowSprite(tex, color, scale, opacity = 1) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex, color, transparent: true, opacity,
        blending: THREE.AdditiveBlending, depthWrite: false
    }));
    s.scale.set(scale, scale, 1);
    return s;
}

// Сегмент конечности: точка вращения сверху, «конец» — снизу
function limb(len, r0, r1, mat, seg = 6) {
    const pivot = new THREE.Group();
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, len, seg), mat);
    m.position.y = -len / 2;
    pivot.add(m);
    const end = new THREE.Group();
    end.position.y = -len;
    pivot.add(end);
    pivot.userData.end = end;
    return pivot;
}

function ellipsoid(rx, ry, rz, mat, seg = 12) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, seg, Math.max(6, seg * 0.66 | 0)), mat);
    m.scale.set(rx, ry, rz);
    return m;
}

function cone(r, h, mat, seg = 6) {
    return new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), mat);
}

// Универсальный гуманоид. Возвращает «скелет» для процедурной анимации.
function makeHumanoid(o) {
    const root = new THREE.Group();
    const hips = new THREE.Group();
    hips.position.y = o.hipY;
    root.add(hips);

    const legs = [];
    for (const side of [1, -1]) {
        const thigh = limb(o.thigh, o.legR, o.legR * 0.8, o.mat);
        thigh.position.set(0, 0, side * o.hipW);
        const shin = limb(o.shin, o.legR * 0.8, o.legR * 0.5, o.mat);
        thigh.userData.end.add(shin);
        const foot = ellipsoid(o.legR * 1.6, o.legR * 0.6, o.legR * 0.9, o.mat, 6);
        foot.position.set(o.legR, 0, 0);
        shin.userData.end.add(foot);
        hips.add(thigh);
        legs.push({ thigh, shin });
    }

    const body = new THREE.Group();
    hips.add(body);
    const torso = ellipsoid(o.torso[0], o.torso[1], o.torso[2], o.mat);
    torso.position.y = o.torso[1] * 0.85;
    body.add(torso);

    const arms = [];
    for (const side of [1, -1]) {
        const upper = limb(o.upperArm, o.armR, o.armR * 0.8, o.mat);
        upper.position.set(0, o.shoulderY, side * o.shoulderW);
        const fore = limb(o.forearm, o.armR * 0.8, o.armR * 0.55, o.mat);
        upper.userData.end.add(fore);
        const hand = ellipsoid(o.armR * 1.3, o.armR * 1.5, o.armR * 1.0, o.mat, 6);
        hand.position.y = -o.armR;
        fore.userData.end.add(hand);
        body.add(upper);
        arms.push({ upper, fore, hand });
    }

    const head = new THREE.Group();
    head.position.y = o.neckY;
    body.add(head);
    const skull = ellipsoid(o.headR * 1.12, o.headR, o.headR * 0.95, o.mat);
    head.add(skull);

    // рога
    for (const side of [1, -1]) {
        const h = cone(o.headR * 0.22, o.hornLen, MAT.horn);
        h.position.set(-o.headR * 0.1, o.headR * 0.75, side * o.headR * 0.5);
        h.rotation.z = o.hornTilt;
        h.rotation.x = -side * 0.35;
        head.add(h);
    }
    // глаза
    const eyes = [];
    for (const side of [1, -1]) {
        const e = new THREE.Mesh(new THREE.SphereGeometry(o.headR * 0.16, 6, 4), o.eyeMat || MAT.eye);
        e.position.set(o.headR * 0.85, o.headR * 0.12, side * o.headR * 0.45);
        head.add(e);
        eyes.push(e);
    }

    return { root, hips, body, torso, legs, arms, head, eyes, o };
}

// Шаг/бег: phase — фаза цикла, amt — 0..1 сила движения
function poseWalk(rig, phase, amt, stride = 0.75) {
    const s = Math.sin(phase), c = Math.cos(phase);
    rig.legs[0].thigh.rotation.z = s * stride * amt;
    rig.legs[1].thigh.rotation.z = -s * stride * amt;
    rig.legs[0].shin.rotation.z = -Math.max(0, -c) * 1.1 * amt - 0.1;
    rig.legs[1].shin.rotation.z = -Math.max(0, c) * 1.1 * amt - 0.1;
    rig.arms[0].upper.rotation.z = -s * 0.7 * amt;
    rig.arms[1].upper.rotation.z = s * 0.7 * amt;
    rig.arms[0].fore.rotation.z = 0.4 + 0.3 * amt;
    rig.arms[1].fore.rotation.z = 0.4 + 0.3 * amt;
}

// --- БЕСЁНОК (главный герой) ---
function makeImp() {
    const rig = makeHumanoid({
        mat: MAT.imp, hipY: 0.44, hipW: 0.075, thigh: 0.23, shin: 0.23, legR: 0.045,
        torso: [0.14, 0.19, 0.12], shoulderY: 0.3, shoulderW: 0.13, upperArm: 0.19, forearm: 0.18,
        armR: 0.035, neckY: 0.45, headR: 0.14, hornLen: 0.16, hornTilt: -0.55
    });
    // заострённые уши
    for (const side of [1, -1]) {
        const ear = cone(0.03, 0.14, MAT.imp, 4);
        ear.position.set(-0.03, 0.02, side * 0.13);
        ear.rotation.x = side * 1.2;
        ear.rotation.z = 0.5;
        rig.head.add(ear);
    }
    // слабое свечение глаз — видно даже в темноте
    for (const e of rig.eyes) {
        const g = glowSprite(TEX.fire, 0xffaa44, 0.12, 0.9);
        e.add(g);
    }

    // хвост из сегментов
    const tail = [];
    let parent = rig.hips;
    for (let i = 0; i < 8; i++) {
        const seg = limb(0.075, 0.026 - i * 0.002, 0.024 - i * 0.002, MAT.imp, 5);
        if (i === 0) seg.position.set(-0.1, 0.05, 0);
        parent.add(seg);
        tail.push(seg);
        parent = seg.userData.end;
    }
    const tip = cone(0.045, 0.1, MAT.imp, 4);
    tip.rotation.z = Math.PI;
    tip.position.y = -0.03;
    tip.scale.z = 0.4;
    parent.add(tip);
    rig.tail = tail;

    // обрубки крыльев — бывший слуга, крылья ему подрезали
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(-0.08, 0.2);
    shape.lineTo(-0.2, 0.14);
    shape.lineTo(-0.16, 0.06);
    shape.lineTo(-0.24, 0.02);
    shape.lineTo(-0.12, -0.02);
    shape.lineTo(0, 0);
    const wg = new THREE.ShapeGeometry(shape);
    const wmat = new THREE.MeshLambertMaterial({ color: 0x241210, side: THREE.DoubleSide });
    rig.wings = [];
    for (const side of [1, -1]) {
        const w = new THREE.Mesh(wg, wmat);
        const piv = new THREE.Group();
        piv.position.set(-0.08, 0.28, side * 0.05);
        piv.add(w);
        piv.rotation.y = side * 0.6;
        rig.body.add(piv);
        rig.wings.push(piv);
    }
    return rig;
}

// --- ОХОТНИК С ФОНАРЁМ ---
function makeHunter() {
    const rig = makeHumanoid({
        mat: MAT.demon, hipY: 1.0, hipW: 0.16, thigh: 0.52, shin: 0.52, legR: 0.09,
        torso: [0.3, 0.46, 0.24], shoulderY: 0.75, shoulderW: 0.3, upperArm: 0.55, forearm: 0.55,
        armR: 0.075, neckY: 0.98, headR: 0.2, hornLen: 0.55, hornTilt: -0.9, eyeMat: MAT.eyeRed
    });
    rig.body.rotation.z = -0.35; // сутулый
    rig.head.rotation.z = 0.3;
    // горб с шипами
    for (let i = 0; i < 4; i++) {
        const sp = cone(0.05, 0.22, MAT.horn, 4);
        sp.position.set(-0.22 - i * 0.02, 0.5 + i * 0.13, 0);
        sp.rotation.z = 1.1;
        rig.body.add(sp);
    }
    // фонарь в передней руке
    const lantern = new THREE.Group();
    const cage = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.26, 0.18), MAT.iron);
    lantern.add(cage);
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffc06a }));
    flame.position.x = 0.05;
    lantern.add(flame);
    lantern.add(glowSprite(TEX.fire, 0xffa050, 1.4, 0.9));
    lantern.position.y = -0.22;
    rig.arms[0].fore.userData.end.add(lantern);
    rig.lantern = lantern;
    rig.flame = flame;

    // световой конус — им он смотрит
    const coneGeo = new THREE.ConeGeometry(2.2, 6.5, 24, 1, true);
    coneGeo.translate(0, -3.25, 0);
    coneGeo.rotateZ(Math.PI / 2); // вершина в нуле, раскрывается вдоль +X
    const coneMat = new THREE.MeshBasicMaterial({
        color: 0xffa040, transparent: true, opacity: 0.07,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
    });
    const beam = new THREE.Mesh(coneGeo, coneMat);
    beam.position.set(0.25, 1.35, 0);
    beam.rotation.z = -0.08;
    rig.root.add(beam);
    rig.beam = beam;
    return rig;
}

// --- АДСКИЙ ПЁС ---
function makeHound() {
    const root = new THREE.Group();
    const body = new THREE.Group();
    body.position.y = 0.58;
    root.add(body);
    const torso = ellipsoid(0.5, 0.2, 0.18, MAT.demon);
    body.add(torso);
    const chest = ellipsoid(0.24, 0.26, 0.2, MAT.demon);
    chest.position.set(0.28, 0.04, 0);
    body.add(chest);
    const head = new THREE.Group();
    head.position.set(0.55, 0.14, 0);
    body.add(head);
    head.add(ellipsoid(0.17, 0.14, 0.13, MAT.demon));
    const snout = cone(0.09, 0.26, MAT.demon, 5);
    snout.rotation.z = -Math.PI / 2;
    snout.position.set(0.2, -0.04, 0);
    head.add(snout);
    for (const side of [1, -1]) {
        const ear = cone(0.05, 0.18, MAT.horn, 4);
        ear.position.set(-0.04, 0.15, side * 0.07);
        ear.rotation.z = 0.5;
        head.add(ear);
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), MAT.eyeRed);
        eye.position.set(0.1, 0.04, side * 0.08);
        head.add(eye);
        eye.add(glowSprite(TEX.fire, 0xff3010, 0.18, 0.9));
    }
    for (let i = 0; i < 5; i++) {
        const sp = cone(0.035, 0.18, MAT.horn, 4);
        sp.position.set(0.25 - i * 0.13, 0.2, 0);
        sp.rotation.z = 0.5;
        body.add(sp);
    }
    const legs = [];
    for (const [lx, lz] of [[0.32, 0.11], [0.32, -0.11], [-0.32, 0.11], [-0.32, -0.11]]) {
        const up = limb(0.28, 0.06, 0.045, MAT.demon);
        up.position.set(lx, -0.05, lz);
        const lo = limb(0.26, 0.045, 0.03, MAT.demon);
        up.userData.end.add(lo);
        body.add(up);
        legs.push({ up, lo, front: lx > 0 });
    }
    const tail = limb(0.4, 0.04, 0.015, MAT.demon, 4);
    tail.position.set(-0.45, 0.05, 0);
    tail.rotation.z = -2.2;
    body.add(tail);
    return { root, body, head, legs, tail };
}

// --- ПРИВРАТНИК ЛИМБА (босс) ---
function makeGatekeeper() {
    const rig = makeHumanoid({
        mat: MAT.boss, hipY: 1.6, hipW: 0.4, thigh: 0.9, shin: 0.85, legR: 0.22,
        torso: [0.85, 1.1, 0.7], shoulderY: 1.75, shoulderW: 0.95, upperArm: 1.3, forearm: 1.35,
        armR: 0.24, neckY: 2.2, headR: 0.42, hornLen: 1.3, hornTilt: -1.0, eyeMat: MAT.eyeRed
    });
    rig.body.rotation.z = -0.25;
    // огромные кулаки
    for (const a of rig.arms) {
        const fist = ellipsoid(0.42, 0.5, 0.4, MAT.boss, 8);
        fist.position.y = -0.4;
        a.fore.userData.end.add(fist);
        a.fist = fist;
        const glow = glowSprite(TEX.fire, 0xff4a1a, 2.4, 0);
        glow.position.y = -0.4;
        a.fore.userData.end.add(glow);
        a.glow = glow;
    }
    // третий глаз и цепи на шее
    const eye3 = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), MAT.eyeRed);
    eye3.position.set(0.38, 0.32, 0);
    rig.head.add(eye3);
    for (const e of [...rig.eyes, eye3]) e.add(glowSprite(TEX.fire, 0xff3a10, 0.7, 1));
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.09, 6, 14), MAT.iron);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 1.95;
    rig.body.add(collar);
    // каменные наросты на спине
    for (let i = 0; i < 6; i++) {
        const sp = cone(0.18, 0.8, MAT.horn, 5);
        sp.position.set(-0.6, 0.6 + i * 0.28, (i % 2 ? 1 : -1) * 0.25);
        sp.rotation.z = 1.2;
        rig.body.add(sp);
    }
    return rig;
}

// --- ЛОВЧИЙ: крылатый демон, похищающий фею ---
function makeReaper() {
    const root = new THREE.Group();
    const body = ellipsoid(0.32, 0.75, 0.28, MAT.demon);
    root.add(body);
    const head = ellipsoid(0.2, 0.22, 0.18, MAT.demon);
    head.position.set(0.15, 0.85, 0);
    root.add(head);
    for (const side of [1, -1]) {
        const h = cone(0.05, 0.6, MAT.horn, 5);
        h.position.set(0.05, 1.1, side * 0.1);
        h.rotation.z = -1.1;
        root.add(h);
        const e = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), MAT.eyeRed);
        e.position.set(0.32, 0.88, side * 0.08);
        e.add(glowSprite(TEX.fire, 0xff3010, 0.3, 1));
        root.add(e);
    }
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(0.6, 2.9);
    shape.lineTo(-0.1, 2.3);
    shape.lineTo(-0.3, 2.6);
    shape.lineTo(-0.6, 1.8);
    shape.lineTo(-0.9, 2.0);
    shape.lineTo(-1.0, 1.0);
    shape.lineTo(-1.3, 0.9);
    shape.lineTo(-0.6, 0.0);
    const wg = new THREE.ShapeGeometry(shape);
    wg.rotateX(Math.PI / 2); // размах вдоль Z
    const wmat = new THREE.MeshLambertMaterial({ color: 0x150a09, side: THREE.DoubleSide });
    const wings = [];
    for (const side of [1, -1]) {
        const piv = new THREE.Group();
        piv.position.set(0, 0.45, side * 0.15);
        const w = new THREE.Mesh(wg, wmat);
        w.scale.z = side;
        piv.add(w);
        root.add(piv);
        wings.push(piv);
    }
    const claws = [];
    for (const side of [1, -1]) {
        const l = limb(0.7, 0.07, 0.04, MAT.demon);
        l.position.set(0, -0.6, side * 0.12);
        l.rotation.z = 0.5;
        root.add(l);
        claws.push(l);
    }
    return { root, wings, claws };
}

// --- ФЕЯ ---
function makeFairy() {
    const root = new THREE.Group();
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), new THREE.MeshBasicMaterial({ color: 0xeaffff }));
    root.add(core);
    const halo = glowSprite(TEX.cyan, 0xbff6ff, 0.7, 1);
    root.add(halo);
    const aura = glowSprite(TEX.cyan, 0x5fd8ff, 3.2, 0.35);
    root.add(aura);
    const wmat = new THREE.MeshBasicMaterial({
        map: TEX.wing, transparent: true, blending: THREE.AdditiveBlending,
        depthWrite: false, side: THREE.DoubleSide
    });
    const wings = [];
    for (const side of [1, -1]) {
        const piv = new THREE.Group();
        const w = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.3), wmat);
        w.position.set(-0.04, 0.12, 0);
        w.rotation.z = 0.5;
        piv.add(w);
        piv.rotation.y = side * 0.5;
        root.add(piv);
        wings.push(piv);
    }
    return { root, core, halo, aura, wings };
}

// --- ПРЕДМЕТЫ ---
function makeCrate(size) {
    const g = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), MAT.wood);
    box.position.y = size / 2;
    g.add(box);
    for (const y of [0.12, size - 0.12]) {
        const band = new THREE.Mesh(new THREE.BoxGeometry(size + 0.03, 0.08, size + 0.03), MAT.iron);
        band.position.y = y;
        g.add(band);
    }
    // череп-клеймо на боку
    const skull = ellipsoid(0.11, 0.12, 0.04, MAT.bone, 8);
    skull.position.set(0, size * 0.55, size / 2 + 0.01);
    g.add(skull);
    return g;
}

function makeLever() {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.2, 0.4), MAT.iron);
    base.position.y = 0.1;
    g.add(base);
    const stick = new THREE.Group();
    stick.position.y = 0.18;
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.85, 6), MAT.iron);
    rod.position.y = 0.42;
    stick.add(rod);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff7a30 }));
    knob.position.y = 0.86;
    stick.add(knob);
    const glow = glowSprite(TEX.fire, 0xff8a40, 0.9, 0.8);
    glow.position.y = 0.86;
    stick.add(glow);
    stick.rotation.z = 0.6;
    g.add(stick);
    return { root: g, stick, glow };
}

function makeSpikeWheel() {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.1, 6, 18), MAT.iron);
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 0.5, 8), MAT.iron);
    g.add(hub);
    for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const sp = cone(0.12, 0.9, MAT.iron, 5);
        sp.rotation.z = Math.PI;
        sp.position.set(Math.cos(a) * 1.0, -0.5, Math.sin(a) * 1.0);
        g.add(sp);
        if (i % 2 === 0) {
            const f = glowSprite(TEX.fire, 0xff8a30, 0.8, 0.9);
            f.position.set(Math.cos(a) * 1.0, 0.25, Math.sin(a) * 1.0);
            g.add(f);
        }
    }
    const big = cone(0.3, 1.4, MAT.iron, 6);
    big.rotation.z = Math.PI;
    big.position.y = -0.8;
    g.add(big);
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 20, 4), MAT.iron);
    chain.position.y = 10.2;
    g.add(chain);
    return g;
}

function makeBonePile(width, rng) {
    const g = new THREE.Group();
    const n = Math.round(width * 9);
    const boneGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.5, 5);
    for (let i = 0; i < n; i++) {
        const b = new THREE.Mesh(boneGeo, MAT.bone);
        const t = rng();
        const h = Math.sin(t * Math.PI) * 0.55;
        b.position.set((t - 0.5) * width, rng() * h + 0.05, (rng() - 0.5) * 0.35);
        b.rotation.set(rng() * 3, rng() * 3, rng() * 3);
        g.add(b);
    }
    for (let i = 0; i < Math.max(2, n / 4); i++) {
        const s = ellipsoid(0.12, 0.13, 0.11, MAT.bone, 8);
        const t = rng() * 0.8 + 0.1;
        s.position.set((t - 0.5) * width, Math.sin(t * Math.PI) * 0.5 + 0.1, 0.12);
        g.add(s);
    }
    const mound = ellipsoid(width * 0.55, 0.5, 0.35, MAT.bone, 10);
    mound.position.y = 0.05;
    g.add(mound);
    return g;
}
