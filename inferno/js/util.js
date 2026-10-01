// --- ОБЩИЕ ПОМОЩНИКИ ---
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const smooth = t => t * t * (3 - 2 * t);
const rand = (a, b) => a + Math.random() * (b - a);
const sign = v => (v < 0 ? -1 : 1);

// Детерминированный генератор — чтобы фон уровня всегда был одинаковым
function makeRng(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function rectsOverlap(a, b) {
    return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
}

function pointInRect(x, y, r) {
    return x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
}

// --- ПРОЦЕДУРНЫЕ ТЕКСТУРЫ ---
function glowTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)', size = 128) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grd.addColorStop(0, inner);
    grd.addColorStop(0.25, inner.replace(/[\d.]+\)$/, '0.55)'));
    grd.addColorStop(1, outer);
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
    const t = new THREE.CanvasTexture(c);
    return t;
}

function lavaTexture() {
    const s = 128;
    const c = document.createElement('canvas');
    c.width = c.height = s;
    const g = c.getContext('2d');
    g.fillStyle = '#c2300c';
    g.fillRect(0, 0, s, s);
    const rng = makeRng(7);
    for (let i = 0; i < 140; i++) {
        const x = rng() * s, y = rng() * s, r = 4 + rng() * 16;
        const grd = g.createRadialGradient(x, y, 0, x, y, r);
        const hot = rng() > 0.55;
        grd.addColorStop(0, hot ? 'rgba(255,214,90,0.9)' : 'rgba(60,8,2,0.75)');
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grd;
        // рисуем с повтором по краям, чтобы текстура тайлилась
        for (const ox of [-s, 0, s]) for (const oy of [-s, 0, s]) {
            g.beginPath();
            g.arc(x + ox, y + oy, r, 0, Math.PI * 2);
            g.fill();
        }
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
}

function wingTexture() {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 128;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 40, 2, 32, 64, 60);
    grd.addColorStop(0, 'rgba(230,255,255,0.95)');
    grd.addColorStop(0.5, 'rgba(120,230,255,0.45)');
    grd.addColorStop(1, 'rgba(80,200,255,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.ellipse(32, 64, 26, 60, 0, 0, Math.PI * 2);
    g.fill();
    return new THREE.CanvasTexture(c);
}

// --- СОХРАНЕНИЕ (может быть недоступно — тогда просто играем без него) ---
const Save = {
    key: 'otstupnik.save.v1',
    load() {
        try {
            const raw = localStorage.getItem(this.key);
            return raw ? JSON.parse(raw) : null;
        } catch (e) { return null; }
    },
    write(data) {
        try { localStorage.setItem(this.key, JSON.stringify(data)); } catch (e) { /* без сохранений */ }
    },
    clear() {
        try { localStorage.removeItem(this.key); } catch (e) { /* без сохранений */ }
    }
};
