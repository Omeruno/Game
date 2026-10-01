// --- МИР: геометрия уровня, физика, фон, частицы, свет ---
class World {
    constructor(scene, theme) {
        this.scene = scene;
        this.theme = theme;
        this.root = new THREE.Group();
        scene.add(this.root);
        this.solids = [];     // статичные и подвижные прямоугольники {x0,y0,x1,y1,active}
        this.hazards = [];    // лава и т.п.
        this.hides = [];      // укрытия (кучи костей)
        this.dark = [];       // тёмные зоны {x0,x1,k}
        this.lightSources = []; // {pos, color, intensity, dist}
        this.lavaMats = [];
        this.time = 0;
        this.rng = makeRng(theme.seed || 1);
        this.groundMat = new THREE.MeshLambertMaterial({ color: theme.ground });
        this.edgeMat = new THREE.MeshLambertMaterial({ color: theme.edge });
    }

    // Сплошной блок. Передняя грань на z=+1.2, уходит вглубь до z=-4.5
    solid(x0, y0, x1, y1, opts = {}) {
        const s = { x0, y0, x1, y1, active: true, kind: opts.kind || 'rock' };
        this.solids.push(s);
        if (!opts.invisible) {
            const zf = opts.zFront ?? 1.2, zb = opts.zBack ?? -4.5;
            const geo = new THREE.BoxGeometry(x1 - x0, y1 - y0, zf - zb);
            const m = new THREE.Mesh(geo, opts.mat || this.groundMat);
            m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (zf + zb) / 2);
            this.root.add(m);
            s.mesh = m;
            // неровная кромка сверху — чтобы край не был идеальной линией
            if (!opts.noLip && y1 - y0 > 0.3) this.lip(x0, x1, y1, zf, zb);
        }
        return s;
    }

    // жаровня: свет и огонь на заднем плане
    brazier(x, y, z = -2.2) {
        const g = new THREE.Group();
        const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.2, 0.4, 8), MAT.iron);
        bowl.position.y = 1.3;
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.12, 1.2, 5), MAT.iron);
        leg.position.y = 0.6;
        const fire = glowSprite(TEX.fire, 0xff8a3a, 1.8, 0.95);
        fire.position.y = 1.75;
        g.add(bowl, leg, fire);
        g.position.set(x, y, z);
        this.root.add(g);
        this.lightSources.push({ pos: new THREE.Vector3(x, y + 2, z + 1.5), color: 0xff7a30, intensity: 2.6, dist: 12, flicker: true });
    }

    lip(x0, x1, y, zf, zb) {
        const n = Math.max(1, Math.round((x1 - x0) / 1.4));
        for (let i = 0; i < n; i++) {
            const w = (x1 - x0) / n;
            const r = this.rng;
            const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.35 + r() * 0.35, 0), this.edgeMat);
            rock.position.set(x0 + w * (i + 0.5) + (r() - 0.5) * w * 0.5, y - 0.18, zb + 0.6 + r() * (zf - zb - 1.4));
            rock.scale.set(1.4, 0.45, 1.1);
            rock.rotation.set(r(), r() * 3, r());
            this.root.add(rock);
        }
    }

    lava(x0, x1, surfaceY) {
        this.hazards.push({ x0, x1, y0: -50, y1: surfaceY + 0.25, kind: 'lava' });
        const tex = lavaTexture();
        tex.repeat.set((x1 - x0) / 3, 2);
        const mat = new THREE.MeshBasicMaterial({ map: tex, color: 0xffffff });
        this.lavaMats.push(mat);
        const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0 + 0.2, 6), mat);
        m.rotation.x = -Math.PI / 2;
        m.position.set((x0 + x1) / 2, surfaceY, -1.6);
        this.root.add(m);
        const glow = glowSprite(TEX.fire, 0xff5a1a, (x1 - x0) * 2.2, 0.55);
        glow.position.set((x0 + x1) / 2, surfaceY + 0.6, 0.5);
        this.root.add(glow);
        this.lightSources.push({
            pos: new THREE.Vector3((x0 + x1) / 2, surfaceY + 1.2, 0.8),
            color: 0xff5a20, intensity: 2.2, dist: 9, flicker: true
        });
        // дно ямы чтобы не было видно пустоты
        const bottom = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 3, 6), this.groundMat);
        bottom.position.set((x0 + x1) / 2, surfaceY - 1.6, -1.6);
        this.root.add(bottom);
    }

    hide(x0, x1, y) {
        this.hides.push({ x0, x1, y0: y - 0.1, y1: y + 0.9 });
        const pile = makeBonePile(x1 - x0, this.rng);
        pile.position.set((x0 + x1) / 2, y, 0.55);
        this.root.add(pile);
    }

    darkZone(x0, x1, k) { this.dark.push({ x0, x1, k }); }

    darkness(x) {
        let k = 0;
        for (const z of this.dark) {
            const fade = 3;
            const inside = Math.min(x - z.x0, z.x1 - x);
            if (inside > -fade) k = Math.max(k, z.k * clamp((inside + fade) / fade, 0, 1));
        }
        return k;
    }

    // --- ФИЗИКА: тело {x (центр), y (низ), w, h} ---
    overlapsSolid(box, ignore) {
        for (const s of this.solids) {
            if (!s.active || s === ignore) continue;
            if (rectsOverlap(box, s)) return s;
        }
        return null;
    }

    // Двигает тело по X, возвращает фактическое смещение и стену
    moveX(b, dx, extra = []) {
        if (dx === 0) return { moved: 0, wall: null };
        const box = { x0: b.x - b.w / 2 + dx, x1: b.x + b.w / 2 + dx, y0: b.y + 0.001, y1: b.y + b.h };
        let wall = null;
        let nx = b.x + dx;
        for (const s of this.solids.concat(extra)) {
            if (!s.active || s === b.self) continue;
            if (!rectsOverlap(box, s)) continue;
            if (dx > 0) {
                const lim = s.x0 - b.w / 2;
                if (lim < nx) { nx = lim; wall = s; }
            } else {
                const lim = s.x1 + b.w / 2;
                if (lim > nx) { nx = lim; wall = s; }
            }
        }
        // не отталкиваем назад, если уже стояли вплотную
        if (dx > 0) nx = Math.max(nx, Math.min(b.x, b.x + dx));
        else nx = Math.min(nx, Math.max(b.x, b.x + dx));
        const moved = nx - b.x;
        b.x = nx;
        return { moved, wall };
    }

    moveY(b, dy, extra = []) {
        const box = { x0: b.x - b.w / 2 + 0.002, x1: b.x + b.w / 2 - 0.002, y0: b.y + dy, y1: b.y + b.h + dy };
        let ny = b.y + dy;
        let hit = null;
        for (const s of this.solids.concat(extra)) {
            if (!s.active || s === b.self) continue;
            if (!rectsOverlap(box, s)) continue;
            if (dy < 0) {
                if (s.y1 > ny) { ny = s.y1; hit = s; }
            } else {
                const lim = s.y0 - b.h;
                if (lim < ny) { ny = lim; hit = s; }
            }
        }
        b.y = ny;
        return { hit, landed: dy < 0 && !!hit, bonk: dy > 0 && !!hit };
    }

    groundBelow(x, y, extra = []) {
        let best = null;
        for (const s of this.solids.concat(extra)) {
            if (!s.active) continue;
            if (x >= s.x0 && x <= s.x1 && s.y1 <= y + 0.05 && (!best || s.y1 > best.y1)) best = s;
        }
        return best;
    }

    // Линия видимости: true, если между точками нет стен
    lineClear(ax, ay, bx, by) {
        const n = 14;
        for (let i = 1; i < n; i++) {
            const t = i / n;
            const x = lerp(ax, bx, t), y = lerp(ay, by, t);
            for (const s of this.solids) {
                if (s.active && !s.dynamic && pointInRect(x, y, s)) return false;
            }
        }
        return true;
    }

    // --- ФОН ---
    buildBackdrop(x0, x1) {
        const th = this.theme;
        const r = makeRng((th.seed || 1) * 31);

        // небо-градиент: свечение бездны снизу
        const skyMat = new THREE.ShaderMaterial({
            uniforms: {
                top: { value: new THREE.Color(th.skyTop) },
                mid: { value: new THREE.Color(th.fog) },
                low: { value: new THREE.Color(th.skyGlow) }
            },
            vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
            fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 low; varying vec2 vUv;
                void main(){ float y = vUv.y;
                  vec3 c = mix(low, mid, smoothstep(0.0, 0.42, y));
                  c = mix(c, top, smoothstep(0.42, 0.95, y));
                  gl_FragColor = vec4(c, 1.0); }`,
            depthWrite: false
        });
        this.sky = new THREE.Mesh(new THREE.PlaneGeometry(900, 260), skyMat);
        this.sky.position.set(0, 10, -170);
        this.sky.renderOrder = -10;
        this.scene.add(this.sky);

        // гряды скал на разной глубине
        const layers = [
            { z: -14, h: 5, amp: 4, color: th.ridge[0], step: 2.2 },
            { z: -30, h: 9, amp: 8, color: th.ridge[1], step: 3.5 },
            { z: -55, h: 16, amp: 14, color: th.ridge[2], step: 6 },
            { z: -95, h: 26, amp: 22, color: th.ridge[3], step: 10 }
        ];
        for (const L of layers) {
            const shape = new THREE.Shape();
            const ax = x0 - 80 + L.z, bx = x1 + 80 - L.z;
            const base = th.baseY - 25;
            shape.moveTo(ax, base);
            for (let x = ax; x <= bx; x += L.step) {
                const spike = r() > 0.85 ? r() * L.amp * 1.4 : 0;
                shape.lineTo(x, th.baseY + L.h * 0.3 + r() * L.amp + spike);
            }
            shape.lineTo(bx, base);
            const m = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: L.color }));
            m.position.z = L.z;
            this.root.add(m);
        }

        // шпили-башни вдали
        for (let i = 0; i < 26; i++) {
            const x = lerp(x0 - 30, x1 + 30, r());
            const z = -35 - r() * 70;
            const h = 18 + r() * 40;
            const sp = new THREE.Mesh(new THREE.ConeGeometry(1 + r() * 2.5, h, 5), new THREE.MeshBasicMaterial({ color: th.ridge[2] }));
            sp.position.set(x, th.baseY + h / 2 - 4, z);
            this.root.add(sp);
        }

        // свисающие цепи
        const linkGeo = new THREE.TorusGeometry(0.22, 0.06, 4, 8);
        const chainCount = Math.round((x1 - x0) / 9);
        const linksPer = 40;
        const links = new THREE.InstancedMesh(linkGeo, MAT.iron, chainCount * linksPer);
        const dummy = new THREE.Object3D();
        let k = 0;
        for (let c = 0; c < chainCount; c++) {
            const x = lerp(x0, x1, r());
            const z = -6 - r() * 18;
            const topY = th.baseY + 26;
            const len = 10 + r() * 25;
            for (let i = 0; i < linksPer; i++) {
                const y = topY - (i / linksPer) * len;
                dummy.position.set(x, y, z);
                dummy.rotation.set(0, i % 2 ? Math.PI / 2 : 0, Math.PI / 2);
                dummy.updateMatrix();
                links.setMatrixAt(k++, dummy.matrix);
            }
        }
        this.root.add(links);

        // мелкий мусор и камни на земле позади линии игры
        const rockGeo = new THREE.DodecahedronGeometry(0.3, 0);
        const rocks = new THREE.InstancedMesh(rockGeo, MAT.rock, 220);
        let n = 0;
        for (const s of this.solids) {
            if (s.x1 - s.x0 < 1.5 || s.kind !== 'rock' || n >= 220) continue;
            const count = Math.min(220 - n, Math.round((s.x1 - s.x0) / 1.2));
            for (let i = 0; i < count; i++) {
                const sc = 0.3 + r() * 1.3;
                dummy.position.set(lerp(s.x0 + 0.3, s.x1 - 0.3, r()), s.y1 + 0.05 * sc, -0.8 - r() * 3.2);
                dummy.rotation.set(r() * 3, r() * 3, r() * 3);
                dummy.scale.set(sc, sc * 0.6, sc);
                dummy.updateMatrix();
                rocks.setMatrixAt(n++, dummy.matrix);
            }
        }
        rocks.count = n;
        this.root.add(rocks);

        // передний план — тёмные сталагмиты между камерой и героем
        const fgMat = new THREE.MeshBasicMaterial({ color: 0x050202 });
        for (let x = x0 + 8; x < x1; x += 11 + r() * 14) {
            if ((th.noForeground || []).some(([a, b]) => x > a && x < b)) continue;
            const h = 1.6 + r() * 2;
            const g = this.groundBelow(x, 50);
            const by = g ? g.y1 : th.baseY;
            const m = new THREE.Mesh(new THREE.ConeGeometry(0.4 + r() * 0.5, h, 5), fgMat);
            m.position.set(x, by - 2.2 + h / 2, 3.4 + r() * 1.2);
            m.rotation.z = (r() - 0.5) * 0.3;
            this.root.add(m);
        }
    }

    // Частицы: пепел и угли поднимаются из бездны
    buildParticles() {
        const mk = (count, color, size, opacity) => {
            const geo = new THREE.BufferGeometry();
            const pos = new Float32Array(count * 3);
            const seed = new Float32Array(count);
            for (let i = 0; i < count; i++) {
                pos[i * 3] = rand(-20, 20);
                pos[i * 3 + 1] = rand(-6, 14);
                pos[i * 3 + 2] = rand(-12, 4);
                seed[i] = Math.random() * 100;
            }
            geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
            const mat = new THREE.PointsMaterial({
                color, size, map: TEX.glow, transparent: true, opacity,
                blending: THREE.AdditiveBlending, depthWrite: false
            });
            const p = new THREE.Points(geo, mat);
            p.frustumCulled = false;
            p.userData.seed = seed;
            this.scene.add(p);
            return p;
        };
        this.embers = mk(170, 0xff7a2a, 0.12, 0.9);
        this.ash = mk(260, 0x8a6a60, 0.07, 0.5);
    }

    updateParticles(dt, cx, cy) {
        const upd = (p, vy, sway) => {
            const a = p.geometry.attributes.position.array;
            const seed = p.userData.seed;
            for (let i = 0; i < seed.length; i++) {
                const j = i * 3;
                a[j + 1] += vy * dt * (0.6 + (seed[i] % 1) * 0.8);
                a[j] += Math.sin(this.time * 0.8 + seed[i]) * sway * dt;
                if (a[j + 1] > cy + 12) a[j + 1] = cy - 6;
                if (a[j + 1] < cy - 6) a[j + 1] = cy + 12;
                if (a[j] < cx - 22) a[j] += 44;
                if (a[j] > cx + 22) a[j] -= 44;
            }
            p.geometry.attributes.position.needsUpdate = true;
        };
        upd(this.embers, 1.3, 0.7);
        upd(this.ash, -0.5, 0.9);
    }

    update(dt, cx) {
        this.time += dt;
        for (const m of this.lavaMats) {
            m.map.offset.x += dt * 0.05;
            m.map.offset.y += dt * 0.02;
            const f = 0.85 + Math.sin(this.time * 3.1) * 0.08 + Math.sin(this.time * 7.3) * 0.05;
            m.color.setRGB(f, f, f);
        }
        if (this.sky) this.sky.position.x = cx;
    }
}
