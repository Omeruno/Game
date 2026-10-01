// =====================================================================
//  КРУГ I · ЛИМБ
//  Побег из клетки → ящик и уступ → тёмная пещера (фея светит) →
//  похищение феи → охотники с фонарями → погоня адского пса →
//  арена Привратника → провал в Круг II
// =====================================================================
CIRCLES[1] = function (game) {
    const W = () => game.world;
    const L = {
        numeral: 'Круг I',
        name: 'Лимб',
        subtitle: 'Здесь ждут те, кому некуда идти',
        bounds: [-20, 250],
        flags: {},
        story: [
            'Триста лет я сторожил врата Лимба.',
            'Фея пообещала мне свободу — в обмен на ключ.',
            'Я отдал ключ. Теперь весь Ад знает, кто я.'
        ],
        endTitle: 'Круг I пройден',
        endText: 'Привратник пал. Где-то внизу, в Круге Похоти, мерцает голубой свет. Она ещё жива.',
        next: { circle: 2, label: 'Круг II · Похоть (скоро)' },
        theme: {
            seed: 11,
            fog: 0x2a110d, fogNear: 17, fogFar: 88,
            skyTop: 0x070304, skyGlow: 0xc2451c,
            ridge: [0x120706, 0x1c0a08, 0x260d0a, 0x30120e],
            ground: 0x251713, edge: 0x1f1411,
            noForeground: [[190, 240], [-12, 4]],
            baseY: 0,
            hemiSky: 0x8a5a4e, hemiGround: 0x140707, hemi: 0.85,
            key: 0xff6a35, keyI: 1.2,
            fill: 0x6a6488, fillI: 0.35,
            lostLight: 0.22
        },
        checkpoints: [
            { x: -4, y: 0 },
            { x: 24, y: 1.6 },
            { x: 54, y: 0.5 },
            { x: 90, y: 0.5 },
            { x: 146, y: 2.6 },
            { x: 184, y: 6.3 },
            { x: 200, y: 0 }
        ],
        triggers: [],
        hints: []
    };

    let crate, guards = [], hound, boss, wheels = [], levers = [], reaper, collapse;
    const ARENA = { x0: 196, x1: 236, y: 0 };

    L.build = function () {
        const w = W();
        // --- земля и стены ---
        w.solid(-26, -20, -10, 30);                // левая стена
        w.solid(-10, -20, 14, 0);
        w.solid(6, 0, 7.2, 0.45, { noLip: true });  // камень-ступенька
        w.lava(14, 16.2, -0.9);
        w.solid(16.2, -20, 22, 0);
        w.solid(22, -20, 22.5, 1.95, { noLip: true }); // бортик — ящик не упадёт вниз
        w.solid(22.5, -20, 38, 1.6);
        w.solid(38, -20, 52, 4.7);                  // высокий уступ
        w.solid(52, -20, 60, 0.5);
        w.lava(60, 62, -0.5);
        w.solid(62, -20, 67, 0.5);
        w.lava(67, 69.2, -0.5);
        w.solid(69.2, -20, 144, 0.5);
        // свод пещеры и низкий лаз
        w.solid(55, 3.6, 80, 30, { noLip: true });
        w.solid(73, 1.15, 77, 3.6, { noLip: true });
        w.darkZone(55, 80, 0.88);
        // участок охотников → уступ
        w.solid(144, -20, 158, 2.6);
        w.solid(152.5, 2.6, 153.5, 3.05, { noLip: true });
        w.lava(158, 160.2, 1.6);
        w.solid(160.2, -20, 166, 2.6);
        w.solid(166, -20, 172, 4.0);
        w.lava(172, 174.2, 3.0);
        w.solid(174.2, -20, 180, 4.0);
        w.solid(180, -20, 196, 6.3);                // обрыв, куда пёс не залезет
        // арена Привратника
        w.solid(ARENA.x0, -20, 210, 0);
        collapse = w.solid(210, -20, 222, 0, { noLip: true });
        w.solid(222, -20, ARENA.x1, 0);
        w.solid(ARENA.x1, -20, 250, 30);
        // дыра под ареной открывается после победы — там пропасть
        const abyss = glowSprite(TEX.fire, 0xff4010, 14, 0.0);
        abyss.position.set(216, -6, -1);
        w.root.add(abyss);
        L.abyss = abyss;

        w.brazier(199, 0);
        w.brazier(233, 0);
        w.brazier(216, 0, -4);
        w.brazier(-6, 0);
        w.brazier(88, 0.5);
        w.brazier(147.5, 2.6);

        // кучи костей — укрытия
        for (const [a, b] of [[97, 98.6], [105.2, 106.8], [111.6, 113.2], [118.6, 120.2], [128.4, 130], [134, 135.6]]) w.hide(a, b, 0.5);

        // --- декорации: клетка, из которой сбежал герой, арка псарни, ворота ---
        const cage = new THREE.Group();
        for (let i = 0; i < 7; i++) {
            const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.4, 5), MAT.iron);
            bar.position.set(-8.6 + i * 0.35, 1.2, -0.6 + (i % 2) * 0.1);
            bar.rotation.z = i === 3 ? 0.5 : 0; // выломанный прут
            cage.add(bar);
        }
        const roof = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.12, 1.4), MAT.iron);
        roof.position.set(-7.6, 2.4, -0.6);
        cage.add(roof);
        w.root.add(cage);

        const arch = new THREE.Group();
        for (const dx of [-1.1, 1.1]) {
            const pil = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3.2, 0.6), MAT.rock);
            pil.position.set(144.6 + dx, 2.6 + 1.6, -1.6);
            arch.add(pil);
        }
        const lintel = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.5, 0.7), MAT.rock);
        lintel.position.set(144.6, 6.0, -1.6);
        arch.add(lintel);
        const hole = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 3.2), new THREE.MeshBasicMaterial({ color: 0x000000 }));
        hole.position.set(144.6, 4.2, -1.9);
        arch.add(hole);
        w.root.add(arch);

        // гигантские врата Лимба на фоне арены
        const gate = new THREE.Group();
        for (let i = 0; i < 9; i++) {
            const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 22, 6), MAT.iron);
            bar.position.set(207 + i * 2.3, 9, -9);
            gate.add(bar);
        }
        for (const y of [3, 12, 19]) {
            const beam = new THREE.Mesh(new THREE.BoxGeometry(22, 0.6, 0.5), MAT.iron);
            beam.position.set(216, y, -9);
            gate.add(beam);
        }
        w.root.add(gate);

        // --- объекты ---
        crate = new Crate(game, 29, 1.6, 1);
        game.crates.push(crate);

        guards = [
            new Hunter(game, { x: 100, y: 0.5, patrol: [100, 112], face: 1 }),
            new Hunter(game, { x: 125, y: 0.5, turnEvery: 3.2, face: -1 })
        ];
        hound = new Hound(game, 144.8, 2.6);
        reaper = new Reaper(game);

        boss = new Gatekeeper(game, { x: 231, y: 0, minX: ARENA.x0 + 3, maxX: ARENA.x1 - 2.5 });
        // рычаг стоит сбоку от колеса: заманивай Привратника с другой стороны
        for (const [x, side] of [[205, -1], [216, 1], [227, -1]]) {
            const wh = new SpikeWheel(game, x, ARENA.y);
            const lv = new Lever(game, x + side * 3.5, ARENA.y, () => wh.drop());
            wh.lever = lv;
            wheels.push(wh);
            levers.push(lv);
        }

        Object.assign(L, { crate, guards, hound, boss, wheels, levers });

        // --- триггеры ---
        L.triggers = [
            { x: 3, fn: () => game.say('Держись ближе к моему свету.', 'fairy', 3.2) },
            { x: 57, fn: () => game.say('Здесь темно. Я посвечу.', 'fairy', 2.8) },
            { x: 85, fn: () => game.run(kidnap()) },
            { x: 151, fn: () => { hound.wake(); game.shake(0.25); } },
            { x: 199, cond: () => game.player.grounded && game.player.y < 1, fn: () => game.run(bossIntro()) }
        ];

        L.hints = [
            { x0: -10, x1: 6, touch: 'Стик слева — идти · ▲ — прыжок', kb: '← → — идти · Пробел — прыжок' },
            { x0: 17, x1: 22.4, touch: 'Прыгни к краю — бесёнок подтянется сам', kb: 'Прыгни к краю — бесёнок подтянется сам' },
            {
                x0: 25, x1: 38, cond: () => crate.x < 37 && game.player.y < 2.5,
                touch: 'Зажми ✋ у ящика — толкай или тяни', kb: 'Зажми E у ящика — толкай или тяни'
            },
            { x0: 69, x1: 76, touch: 'Стик вниз — пригнуться', kb: '↓ — пригнуться' },
            { x0: 91, x1: 99, touch: 'Пригнись в костях — охотник тебя не заметит', kb: 'Пригнись (↓) в костях — охотник тебя не заметит' },
            {
                x0: 196, x1: 236, cond: () => L.flags.bossActive && boss.hp === 3,
                touch: 'Заведи его под колесо и дёрни рычаг ✋', kb: 'Заведи его под колесо и дёрни рычаг (E)'
            }
        ];
    };

    // --- сброс к чекпоинту ---
    L.reset = function (cp) {
        L.flags.fairyGone = cp >= 3;
        L.flags.bossActive = false;
        L.flags.bossDead = false;
        game.fairy.setGone(L.flags.fairyGone);
        if (!L.flags.fairyGone) game.fairy.place(game.player.x - 0.8, game.player.y + 1.5);
        game.fairy.hint = null;
        game.fairy.power = 1;
        reaper.m.root.visible = false;
        game.player.reach = 0;
        // ящик: после уступа он уже не нужен — оставляем у стены
        if (cp <= 1) crate.place(29, 1.6); else crate.place(37.5, 1.6);
        for (const g of guards) g.reset();
        hound.reset();
        boss.reset();
        for (const wh of wheels) wh.reset();
        for (const lv of levers) lv.ready = true;
        collapse.active = true;
        collapse.mesh.visible = true;
        collapse.mesh.position.y = -10;
        L.abyss.material.opacity = 0;
        game.ui['boss-marks'].classList.remove('show');
        if (cp === 6) game.run(bossResume());
    };

    L.onStart = function () {
        game.say('Беги. Они уже знают, что ты сделал.', 'fairy', 3.4);
    };

    L.interact = function (p) {
        for (const lv of levers) if (lv.near(p) && lv.pull(p)) return;
    };
    L.canInteract = p => levers.some(lv => lv.ready && lv.near(p) && L.flags.bossActive);

    L.danger = () =>
        guards.some(g => g.state === 'chase' || g.state === 'alert') ||
        hound.state === 'run' || (L.flags.bossActive && !L.flags.bossDead);

    L.update = function (dt) {
        for (const g of guards) if (Math.abs(g.x - game.player.x) < 30) g.update(dt);
        hound.update(dt);
        boss.update(dt);
        for (const wh of wheels) wh.update(dt);
        for (const lv of levers) lv.update(dt);
        // после победы — шагни в пропасть
        if (L.flags.bossDead && game.player.y < -3 && game.state === 'play') {
            game.state = 'falling';
            game.fadeTo(1, 1.2);
            setTimeout(() => game.finishCircle(), 1300);
        }
    };

    L.animate = function (dt) {
        reaper.update(dt);
        // фея подсказывает, где ящик
        const p = game.player;
        if (!L.flags.fairyGone && game.fairy.state !== 'carried') {
            if (p.x > 25 && p.x < 38 && crate.x < 37 && p.y < 2.5) game.fairy.hint = { x: crate.x, y: crate.y + 1.7 };
            else game.fairy.hint = null;
        }
        if (L.flags.bossDead && collapse.mesh.visible) {
            collapse.mesh.position.y = damp(collapse.mesh.position.y, -40, 0.8, dt);
            L.abyss.material.opacity = damp(L.abyss.material.opacity, 0.85, 1, dt);
        }
    };

    L.cameraZone = function (p) {
        if (p.x > ARENA.x0 + 1 && p.y < 4) return { x: clamp(p.x, ARENA.x0 + 9, ARENA.x1 - 9), y: 4.2, dist: 19 };
        return null;
    };

    L.onWheelLand = function (wh) {
        game.dust(wh.x, ARENA.y, 1.6);
        if (boss.state !== 'dormant' && boss.state !== 'dying' && boss.state !== 'dead' && Math.abs(boss.x - wh.x) < 2.3) boss.hurt();
    };

    L.onBossHurt = function (b) {
        const marks = game.ui['boss-marks'].children;
        for (let i = 0; i < marks.length; i++) marks[i].classList.toggle('lost', i >= b.hp);
        if (b.hp === 2) game.say('Он не прощает предателей. Но и ты не прощай.', 'fairy-far', 3.2);
    };

    L.onBossDead = function () {
        L.flags.bossDead = true;
        Sound.crack();
        game.shake(0.8);
        game.ui['boss-marks'].classList.remove('show');
        boss.rig.root.visible = false;
        game.run((function* () {
            yield 0.6;
            collapse.active = false;
            game.dust(213, 0, 2);
            game.dust(219, 0, 2);
            Sound.crack();
            game.shake(0.6);
            yield 1.2;
            game.say('…ниже… я здесь…', 'fairy-far', 3.5);
        })());
    };

    // --- СЦЕНА: похищение феи ---
    function* kidnap() {
        const p = game.player, f = game.fairy;
        p.state = 'cutscene';
        f.hint = { x: p.x + 2.4, y: p.y + 2.1 };
        game.camOverride = { dist: game.baseDist() + 3 };
        yield 0.9;
        Sound.wings();
        game.shake(0.2);
        reaper.m.root.visible = true;
        const a = new THREE.Vector3(p.x - 9, p.y + 10, -7);
        const b = new THREE.Vector3();
        reaper.pos.copy(a);
        yield* game.tween(1.3, k => {
            b.set(f.pos.x - 0.2, f.pos.y + 1.1, f.pos.z);
            reaper.pos.lerpVectors(a, b, smooth(k));
        });
        f.state = 'carried';
        f.hint = null;
        Sound.sting();
        game.say('Нет! Пусти!', 'fairy', 2.2);
        p.reach = 1;
        // взмывает вверх и уходит по дуге вниз, за дальние скалы
        const c = reaper.pos.clone();
        const m = new THREE.Vector3(p.x + 7, p.y + 6, -14);
        const d = new THREE.Vector3(p.x + 26, p.y - 9, -55);
        yield* game.tween(3.8, k => {
            const e = k * k * (1.6 - 0.6 * k);
            reaper.pos.set(0, 0, 0)
                .addScaledVector(c, (1 - e) * (1 - e))
                .addScaledVector(m, 2 * e * (1 - e))
                .addScaledVector(d, e * e);
            f.pos.copy(reaper.pos).add(new THREE.Vector3(0.2, -1.25, 0));
            f.power = 1 - k * 0.4;
            game.camOverride.x = lerp(p.x + 1, p.x + 4, k);
        });
        game.say('Найди меня… внизу…', 'fairy-far', 3.2);
        yield 1.2;
        reaper.m.root.visible = false;
        f.setGone(true);
        L.flags.fairyGone = true;
        p.reach = 0;
        game.camOverride = null;
        yield 0.6;
        p.state = 'normal';
    }

    // --- СЦЕНА: Привратник ---
    function* bossIntro() {
        const p = game.player;
        p.state = 'cutscene';
        yield 0.5;
        Sound.roar(0.6);
        game.shake(0.7);
        boss.awaken();
        yield 1.4;
        game.showCard('Страж', 'Привратник Лимба', 'Он помнит, кто отдал ключ', 3.2);
        yield 1.4;
        Sound.roar(0.8);
        startFight();
        p.state = 'normal';
    }

    function* bossResume() {
        yield 0.4;
        boss.awaken();
        boss.t = 2.0;
        yield 0.8;
        startFight();
    }

    function startFight() {
        L.flags.bossActive = true;
        const m = game.ui['boss-marks'];
        for (const el of m.children) el.classList.remove('lost');
        m.classList.add('show');
    }

    return L;
};
