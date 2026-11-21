// 3D 그리기: 맵, 캐릭터, 총알
import * as THREE from 'three';

const matCache = {};
export const M = (c) => matCache[c] || (matCache[c] = new THREE.MeshLambertMaterial({ color: c }));

export function canvasTex(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function makeCanvas(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  return c;
}
const hex = (c) => '#' + c.toString(16).padStart(6, '0');

export function labelSprite(text, color = '#fff', size = 40, scale = 1) {
  const font = `bold ${size}px system-ui, "Malgun Gothic", "Apple SD Gothic Neo", sans-serif`;
  const probe = document.createElement('canvas').getContext('2d');
  probe.font = font;
  const w = Math.ceil(probe.measureText(text).width) + 24, h = size + 20;
  const c = makeCanvas(w, h, (g) => {
    g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,.75)'; g.strokeText(text, w / 2, h / 2);
    g.fillStyle = color; g.fillText(text, w / 2, h / 2);
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex(c), transparent: true }));
  const k = 0.012 * scale;
  s.scale.set(w * k, h * k, 1);
  return s;
}

// ----- 무늬 텍스처 -----
const TEX = {};
function texBase(name) {
  if (TEX[name]) return TEX[name];
  let c;
  if (name === 'win') c = makeCanvas(128, 128, (g) => {
    g.fillStyle = '#eadcbc'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#fff'; g.fillRect(20, 28, 88, 64);
    g.fillStyle = '#7ec3ef'; g.fillRect(25, 33, 78, 54);
    g.fillStyle = '#fff'; g.fillRect(62, 33, 4, 54);
  });
  else if (name === 'upper') c = makeCanvas(128, 256, (g) => {
    g.fillStyle = '#eadcbc'; g.fillRect(0, 0, 128, 256);
    g.fillStyle = '#d6c39c'; g.fillRect(0, 126, 128, 4);
    for (const y of [30, 158]) {
      g.fillStyle = '#fff'; g.fillRect(20, y, 88, 66);
      g.fillStyle = '#7ec3ef'; g.fillRect(25, y + 5, 78, 56);
      g.fillStyle = '#fff'; g.fillRect(62, y + 5, 4, 56);
    }
  });
  else if (name === 'apt') c = makeCanvas(128, 128, (g) => {
    // 하얀 외벽 + 회색 세로 줄 + 유리 베란다
    g.fillStyle = '#f5f6f7'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#5f6b75'; g.fillRect(0, 0, 10, 128); g.fillRect(118, 0, 10, 128);
    g.fillStyle = '#2f5d73'; g.fillRect(18, 14, 92, 76);
    g.fillStyle = '#7fb3c9'; g.fillRect(22, 18, 40, 68); g.fillRect(66, 18, 40, 68);
    g.fillStyle = 'rgba(255,255,255,.75)'; g.fillRect(16, 90, 96, 4);
    g.fillStyle = 'rgba(160,200,215,.55)'; g.fillRect(18, 94, 92, 20);
    g.fillStyle = '#dfe3e6'; g.fillRect(0, 122, 128, 6);
  });
  else if (name === 'villaLow') c = makeCanvas(128, 128, (g) => {
    // 크림색 아래층: 흰 창틀 창문 + 작은 난간
    g.fillStyle = '#efe4cf'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#d9cbb0'; g.fillRect(0, 120, 128, 8);
    g.fillStyle = '#ffffff'; g.fillRect(20, 26, 88, 70);
    g.fillStyle = '#5b7fa3'; g.fillRect(25, 31, 37, 60); g.fillRect(66, 31, 37, 60);
    g.fillStyle = '#3f4b5a'; g.fillRect(16, 84, 96, 4);
    for (let x = 20; x < 110; x += 8) g.fillRect(x, 84, 2, 14);
  });
  else if (name === 'villaUp') c = makeCanvas(128, 128, (g) => {
    // 남색·회색 위층
    g.fillStyle = '#46546a'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#3a4659'; g.fillRect(0, 0, 8, 128); g.fillRect(120, 0, 8, 128);
    g.fillStyle = '#ffffff'; g.fillRect(24, 22, 80, 74);
    g.fillStyle = '#8fb3d1'; g.fillRect(29, 27, 33, 64); g.fillRect(66, 27, 33, 64);
    g.fillStyle = '#e9ecef'; g.fillRect(18, 100, 92, 5);
  });
  else if (name === 'crown') c = makeCanvas(128, 64, (g) => {
    g.fillStyle = '#37474f'; g.fillRect(0, 0, 128, 64);
    g.fillStyle = '#b0bec5'; for (let x = 6; x < 128; x += 16) g.fillRect(x, 8, 4, 48);
    g.fillStyle = '#ffd54f'; g.fillRect(0, 58, 128, 3);
  });
  else if (name === 'books') c = makeCanvas(128, 128, (g) => {
    g.fillStyle = '#6b4226'; g.fillRect(0, 0, 128, 128);
    const cols = ['#e03131', '#1971c2', '#2f9e44', '#f08c00', '#7048e8', '#f8f9fa'];
    for (let row = 0; row < 3; row++) for (let x = 4; x < 124; x += 9) {
      g.fillStyle = cols[(x + row * 3) % cols.length]; g.fillRect(x, row * 42 + 6, 7, 32 + (x % 3) * 2);
    }
  });
  else if (name === 'hedge') c = makeCanvas(64, 64, (g) => {
    g.fillStyle = '#2b8a3e'; g.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 90; i++) { g.fillStyle = Math.random() < 0.5 ? '#37b24d' : '#2f6b2f'; g.fillRect(Math.random() * 64, Math.random() * 64, 5, 5); }
  });
  else if (name === 'flower') c = makeCanvas(64, 64, (g) => {
    g.fillStyle = '#5c940d'; g.fillRect(0, 0, 64, 64);
    const cols = ['#ff6b6b', '#ffd43b', '#f783ac', '#ffffff'];
    for (let i = 0; i < 30; i++) { g.fillStyle = cols[i % 4]; g.beginPath(); g.arc(Math.random() * 64, Math.random() * 64, 3, 0, 7); g.fill(); }
  });
  else if (name === 'balls') c = makeCanvas(64, 64, (g) => {
    g.fillStyle = '#74c0fc'; g.fillRect(0, 0, 64, 64);
    const cols = ['#ff6b6b', '#ffd43b', '#69db7c', '#4dabf7', '#da77f2'];
    for (let i = 0; i < 40; i++) { g.fillStyle = cols[i % 5]; g.beginPath(); g.arc(Math.random() * 64, Math.random() * 64, 5, 0, 7); g.fill(); }
  });
  else if (name === 'snacks') c = makeCanvas(128, 64, (g) => {
    g.fillStyle = '#868e96'; g.fillRect(0, 0, 128, 64);
    const cols = ['#ff6b6b', '#ffd43b', '#69db7c', '#4dabf7', '#f783ac', '#ff922b'];
    for (let row = 0; row < 2; row++) for (let x = 3; x < 125; x += 10) { g.fillStyle = cols[(x / 10 + row * 2 | 0) % 6]; g.fillRect(x, row * 32 + 5, 8, 22); }
  });
  else if (name === 'shop') c = makeCanvas(128, 128, (g) => {
    g.fillStyle = '#dee2e6'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#a5d8ff'; g.fillRect(8, 20, 112, 100);
    g.fillStyle = '#fff'; g.fillRect(62, 20, 4, 100);
  });
  TEX[name] = canvasTex(c);
  return TEX[name];
}
function tex(name, rx, ry) {
  const t = texBase(name).clone();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.needsUpdate = true;
  return new THREE.MeshLambertMaterial({ map: t });
}

// ================= 월드 (장면 + 카메라) =================
export class World {
  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.domElement.id = 'view';
    document.body.prepend(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 400);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x6b8f4e, 1.7));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(30, 50, 20);
    this.scene.add(sun);
    this.mapGroup = null; this.mapId = null; this.grpPieces = []; this.inside = '';
    this.shotGeo = new THREE.SphereGeometry(0.14, 8, 6);
    this.shotMat = new THREE.MeshBasicMaterial({ color: 0xffd43b });
    this.shots = new Map();
    addEventListener('resize', () => {
      this.renderer.setSize(innerWidth, innerHeight);
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
    });
  }

  setMap(map) {
    if (this.mapId === map.id) return;
    if (this.mapGroup) {
      this.scene.remove(this.mapGroup);
      this.mapGroup.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    }
    this.mapId = map.id; this.grpPieces = []; this.inside = '';
    this.scene.background = new THREE.Color(map.sky);
    this.scene.fog = new THREE.Fog(map.sky, 70, 180);
    const g = this.mapGroup = new THREE.Group();
    for (const p of map.pieces) {
      const obj = buildPiece(p, map);
      if (!obj) continue;
      if (p.by) obj.position.y += p.by;
      g.add(obj);
      if (p.grp) this.grpPieces.push({ obj, grp: p.grp, lvl: p.lvl || 0 });
    }
    this.scene.add(g);
  }

  // 건물 안에 들어가면 내가 있는 층보다 위는 숨겨요 (위에서 내려다보기)
  setInside(grp, lv = 0) {
    const key = grp ? grp + ':' + lv : '';
    if (this.inside === key) return;
    this.inside = key;
    for (const p of this.grpPieces) p.obj.visible = !(grp && p.grp === grp && p.lvl > lv);
  }

  updateShots(list) {
    const alive = new Set();
    for (const [id, x, y, z] of list) {
      alive.add(id);
      let m = this.shots.get(id);
      if (!m) { m = new THREE.Mesh(this.shotGeo, this.shotMat); this.scene.add(m); this.shots.set(id, m); }
      m.position.set(x, y, z);
    }
    for (const [id, m] of this.shots) if (!alive.has(id)) { this.scene.remove(m); this.shots.delete(id); }
  }

  render() { this.renderer.render(this.scene, this.camera); }
}

function mesh(geo, mat, x, y, z) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; }

function buildPiece(p, map) {
  switch (p.k) {
    case 'plane': {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(p.x2 - p.x1, p.z2 - p.z1), M(p.color));
      m.rotation.x = -Math.PI / 2; m.position.set((p.x1 + p.x2) / 2, p.y, (p.z1 + p.z2) / 2);
      return m;
    }
    case 'box': {
      const w = p.x2 - p.x1, d = p.z2 - p.z1;
      let mat = M(p.color);
      if (p.tex === 'win') { const f = tex('win', Math.max(1, Math.round(w / 4)), 1); mat = [M(p.color), M(p.color), M(p.color), M(p.color), f, f]; }
      else if (p.tex === 'upper') { const f = tex('upper', Math.round(w / 4), 1); mat = [M(p.color), M(p.color), M(0x9a6b4f), M(p.color), f, f]; }
      else if (p.tex === 'apt') { mat = [tex('apt', Math.round(d / 4), Math.round(p.h / 3)), tex('apt', Math.round(d / 4), Math.round(p.h / 3)), M(0xadb5bd), M(0xadb5bd), tex('apt', Math.round(w / 4), Math.round(p.h / 3)), tex('apt', Math.round(w / 4), Math.round(p.h / 3))]; }
      else if (p.tex === 'villaLow' || p.tex === 'villaUp') {
        const fl = Math.max(1, Math.round(p.h / 3));
        mat = [tex(p.tex, Math.max(1, Math.round(d / 4)), fl), tex(p.tex, Math.max(1, Math.round(d / 4)), fl), M(p.tex === 'villaLow' ? 0x7a9a5a : 0x4a4f57), M(0x888888), tex(p.tex, Math.max(1, Math.round(w / 4)), fl), tex(p.tex, Math.max(1, Math.round(w / 4)), fl)];
      }
      else if (p.tex === 'crown') { const f = tex('crown', Math.round(w / 4), 1), s = tex('crown', Math.round(d / 4), 1); mat = [s, s, M(0x263238), M(0x263238), f, f]; }
      else if (p.tex === 'books') { const f = tex('books', Math.max(1, Math.round(w / 2)), 1); mat = [M(p.color), M(p.color), M(p.color), M(p.color), f, f]; }
      else if (p.tex === 'snacks') { const f = tex('snacks', Math.max(1, Math.round(w / 2)), 1); mat = [M(p.color), M(p.color), M(p.color), M(p.color), f, f]; }
      else if (p.tex === 'shop') { const f = tex('shop', Math.max(1, Math.round(w / 3)), 1); mat = [M(p.color), M(p.color), M(p.color), M(p.color), f, f]; }
      else if (p.tex) mat = tex(p.tex, Math.max(1, Math.round(w / 2)), 1);
      return mesh(new THREE.BoxGeometry(w, p.h, d), mat, (p.x1 + p.x2) / 2, p.y + p.h / 2, (p.z1 + p.z2) / 2);
    }
    case 'lines': {
      const g = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.RingGeometry(5, 5.25, 48), M(0xffffff));
      ring.rotation.x = -Math.PI / 2; ring.position.set(p.x, 0.02, p.z); g.add(ring);
      const mid = new THREE.Mesh(new THREE.PlaneGeometry(0.25, p.len), M(0xffffff));
      mid.rotation.x = -Math.PI / 2; mid.position.set(p.x, 0.02, p.z); g.add(mid);
      return g;
    }
    case 'parking': {
      const g = new THREE.Group();
      for (let x = p.x1; x <= p.x2; x += 4.8) for (const z of [p.z1 + 2.2, p.z2 - 2.2]) {
        const l = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 4.4), M(0xffffff));
        l.rotation.x = -Math.PI / 2; l.position.set(x, 0.02, z); g.add(l);
      }
      return g;
    }
    case 'tree': {
      const g = new THREE.Group();
      g.add(mesh(new THREE.CylinderGeometry(0.3, 0.35, 2.2, 8), M(0x8a5a33), p.x, 1.1, p.z));
      g.add(mesh(new THREE.IcosahedronGeometry(1.8, 0), new THREE.MeshLambertMaterial({ color: p.color || 0x3f9b3a, flatShading: true }), p.x, 3.4, p.z));
      return g;
    }
    case 'roof': { // 경사 지붕 (사방으로 기울어진 모양)
      const w = p.x2 - p.x1, d = p.z2 - p.z1;
      const r = new THREE.Mesh(new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1), new THREE.MeshLambertMaterial({ color: p.color || 0x4a4f57, flatShading: true }));
      r.rotation.y = Math.PI / 4;
      const g = new THREE.Group(); g.add(r);
      g.scale.set(w, p.h, d);
      g.position.set((p.x1 + p.x2) / 2, p.y + p.h / 2, (p.z1 + p.z2) / 2);
      return g;
    }
    case 'pond': {
      const g = new THREE.Group();
      const rim = new THREE.Mesh(new THREE.CircleGeometry(1, 32), M(0xb7a98f));
      rim.rotation.x = -Math.PI / 2; rim.scale.set(p.rx + 0.6, p.rz + 0.6, 1); rim.position.set(p.x, 0.02, p.z); g.add(rim);
      const water = new THREE.Mesh(new THREE.CircleGeometry(1, 32), new THREE.MeshLambertMaterial({ color: 0x4dabf7, transparent: true, opacity: 0.85 }));
      water.rotation.x = -Math.PI / 2; water.scale.set(p.rx, p.rz, 1); water.position.set(p.x, 0.04, p.z); g.add(water);
      return g;
    }
    case 'plaza': {
      const g = new THREE.Group();
      const base = new THREE.Mesh(new THREE.CircleGeometry(p.r, 40), M(0xd8d2c4));
      base.rotation.x = -Math.PI / 2; base.position.set(p.x, 0.025, p.z); g.add(base);
      for (const [a, b, col] of [[p.r * 0.35, p.r * 0.45, 0x9c8f78], [p.r * 0.7, p.r * 0.78, 0x9c8f78], [0, p.r * 0.15, 0xc0a36e]]) {
        const ring = new THREE.Mesh(new THREE.RingGeometry(a, b, 40), M(col));
        ring.rotation.x = -Math.PI / 2; ring.position.set(p.x, 0.03, p.z); g.add(ring);
      }
      return g;
    }
    case 'mountain':
      return mesh(new THREE.ConeGeometry(p.r, p.h, 7), new THREE.MeshLambertMaterial({ color: p.color || 0x6d8f7a, flatShading: true }), p.x, p.h / 2 - 1, p.z);
    case 'bush': {
      const g = new THREE.Group(), mat = new THREE.MeshLambertMaterial({ color: 0x2f9e44, flatShading: true });
      for (const [dx, dy, dz, r] of [[0, 1.0, 0, 1.15], [0.6, 0.8, 0.4, 0.9], [-0.6, 0.8, -0.3, 0.9], [0.2, 0.7, -0.7, 0.8], [-0.3, 0.7, 0.7, 0.8]]) g.add(mesh(new THREE.IcosahedronGeometry(r, 0), mat, p.x + dx, dy, p.z + dz));
      return g;
    }
    case 'locker': {
      const g = new THREE.Group();
      g.add(mesh(new THREE.BoxGeometry(1.15, 2.1, 1.15), M(p.color), p.x, 1.05, p.z));
      g.add(mesh(new THREE.BoxGeometry(0.5, 0.06, 1.17), M(0x222222), p.x, 1.7, p.z));
      return g;
    }
    case 'curtain':
      return mesh(new THREE.BoxGeometry(1.4, 3.2, 1.1), M(0xc92a2a), p.x, 1.6, p.z);
    case 'tunnel': {
      const len = p.x2 - p.x1;
      const t = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, len, 16, 1, true), new THREE.MeshLambertMaterial({ color: p.color, side: THREE.DoubleSide }));
      t.rotation.z = Math.PI / 2; t.position.set((p.x1 + p.x2) / 2, 0.95, p.z);
      return t;
    }
    case 'swing': {
      const g = new THREE.Group(), post = M(0x1c7ed6);
      for (const x of [p.x1, p.x2]) for (const dz of [-1, 1]) {
        const m = mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.9, 6), post, x, 1.4, p.z + dz * 0.95);
        m.rotation.x = dz * 0.33; g.add(m);
      }
      const top = mesh(new THREE.CylinderGeometry(0.08, 0.08, p.x2 - p.x1, 6), post, (p.x1 + p.x2) / 2, 2.75, p.z);
      top.rotation.z = Math.PI / 2; g.add(top);
      const n = Math.max(2, Math.floor((p.x2 - p.x1) / 2.6));
      for (let i = 0; i < n; i++) {
        const x = p.x1 + (p.x2 - p.x1) * (i + 0.5) / n;
        g.add(mesh(new THREE.BoxGeometry(0.7, 0.08, 0.35), M(0xfab005), x, 0.6, p.z));
        for (const dx of [-0.3, 0.3]) g.add(mesh(new THREE.BoxGeometry(0.03, 2.1, 0.03), M(0x868e96), x + dx, 1.7, p.z));
      }
      return g;
    }
    case 'jungle': {
      const g = new THREE.Group(), a = M(0xe03131), b = M(0xfcc419), n = 3, st = p.s / n;
      for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) g.add(mesh(new THREE.BoxGeometry(0.13, 3, 0.13), (i + j) % 2 ? a : b, p.x + i * st, 1.5, p.z + j * st));
      for (let h = 1; h <= 3; h++) for (let i = 0; i <= n; i++) {
        g.add(mesh(new THREE.BoxGeometry(p.s, 0.1, 0.1), b, p.x + p.s / 2, h, p.z + i * st));
        g.add(mesh(new THREE.BoxGeometry(0.1, 0.1, p.s), a, p.x + i * st, h, p.z + p.s / 2));
      }
      return g;
    }
    case 'slide': {
      const len = p.z2 - p.z1, ang = Math.atan2(p.h, len);
      const s = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.15, Math.hypot(len, p.h)), M(0xffd43b));
      s.position.set(p.x, p.h / 2, (p.z1 + p.z2) / 2); s.rotation.x = ang;
      return s;
    }
    case 'bars': {
      const g = new THREE.Group();
      for (const [x, h] of [[(p.x1 * 3 + p.x2) / 4, 1.6], [(p.x1 + p.x2 * 3) / 4, 2.1]]) {
        const b = mesh(new THREE.CylinderGeometry(0.05, 0.05, (p.x2 - p.x1) / 2, 6), M(0xced4da), x, h, p.z);
        b.rotation.z = Math.PI / 2; g.add(b);
      }
      return g;
    }
    case 'merry': {
      const g = new THREE.Group();
      g.add(mesh(new THREE.CylinderGeometry(p.r, p.r, 0.4, 20), M(0xf03e3e), p.x, 0.2, p.z));
      g.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.6, 6), M(0xfab005), p.x, 1.2, p.z));
      return g;
    }
    case 'pavilion': {
      const g = new THREE.Group(), cx = (p.x1 + p.x2) / 2, cz = (p.z1 + p.z2) / 2;
      for (const [x, z] of [[p.x1, p.z1], [p.x2, p.z1], [p.x1, p.z2], [p.x2, p.z2]]) g.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 3.2, 8), M(0x8b4513), x, 1.6, z));
      const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.hypot(p.x2 - p.x1, p.z2 - p.z1) / 2 + 0.8, 1.8, 4), M(0x5c3d2e));
      roof.position.set(cx, 4.1, cz); roof.rotation.y = Math.PI / 4; g.add(roof);
      return g;
    }
    case 'arrow': { // 바닥 화살표 (ang 방향을 가리켜요)
      const s = new THREE.Shape();
      s.moveTo(-0.9, -0.28); s.lineTo(0.15, -0.28); s.lineTo(0.15, -0.6); s.lineTo(0.95, 0);
      s.lineTo(0.15, 0.6); s.lineTo(0.15, 0.28); s.lineTo(-0.9, 0.28); s.closePath();
      const a = new THREE.Mesh(new THREE.ShapeGeometry(s), M(p.color || 0xffd43b));
      a.rotation.x = -Math.PI / 2;
      const g = new THREE.Group(); g.add(a);
      g.position.set(p.x, p.y || 0.05, p.z); g.rotation.y = p.ang || 0;
      return g;
    }
    case 'sign': {
      const s = labelSprite(p.text, '#fff8d6', 52, p.size || 1);
      s.position.set(p.x, p.y, p.z);
      return s;
    }
    case 'jail': return buildJail(map);
  }
  return null;
}

function buildJail(map) {
  const J = map.jail, F = map.FENCE, C = map.jailC, g = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(J.x2 - J.x1, J.z2 - J.z1), M(0x9aa1a8));
  floor.rotation.x = -Math.PI / 2; floor.position.set(C.x, 0.03, C.z); g.add(floor);
  const spots = [];
  for (let x = J.x1; x <= J.x2 + 0.01; x += 0.45) spots.push([x, J.z1], [x, J.z2]);
  for (let z = J.z1 + 0.45; z < J.z2 - 0.01; z += 0.45) spots.push([J.x1, z], [J.x2, z]);
  const bars = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 6), M(0x4a5059), spots.length);
  const mtx = new THREE.Matrix4();
  spots.forEach(([x, z], i) => { mtx.makeTranslation(x, 1.3, z); bars.setMatrixAt(i, mtx); });
  g.add(bars);
  const rail = M(0x343a40);
  for (const y of [0.08, 2.6]) {
    g.add(mesh(new THREE.BoxGeometry(J.x2 - J.x1 + 2 * F, 0.15, 2 * F), rail, C.x, y, J.z1));
    g.add(mesh(new THREE.BoxGeometry(J.x2 - J.x1 + 2 * F, 0.15, 2 * F), rail, C.x, y, J.z2));
    g.add(mesh(new THREE.BoxGeometry(2 * F, 0.15, J.z2 - J.z1), rail, J.x1, y, C.z));
    g.add(mesh(new THREE.BoxGeometry(2 * F, 0.15, J.z2 - J.z1), rail, J.x2, y, C.z));
  }
  const sign = labelSprite('🚨 감옥', '#ffd43b', 60, 1.1);
  sign.position.set(C.x, 5, C.z); g.add(sign);
  return g;
}

// ================= 캐릭터 (로블록스/마크 느낌) =================
const stripeMat = (() => {
  const t = canvasTex(makeCanvas(32, 32, (g) => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, 32, 32);
    g.fillStyle = '#222'; g.fillRect(0, 0, 32, 8); g.fillRect(0, 16, 32, 8);
  }));
  t.magFilter = THREE.NearestFilter; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 2);
  return new THREE.MeshLambertMaterial({ map: t });
})();
const GEO = {
  body: new THREE.BoxGeometry(0.9, 1.0, 0.5),
  head: new THREE.BoxGeometry(0.7, 0.7, 0.7),
  arm: new THREE.BoxGeometry(0.3, 0.8, 0.3),
  hand: new THREE.BoxGeometry(0.28, 0.2, 0.28),
  leg: new THREE.BoxGeometry(0.4, 1.0, 0.45),
  eye: new THREE.BoxGeometry(0.1, 0.12, 0.02),
  shadow: new THREE.CircleGeometry(0.6, 20),
  star: new THREE.OctahedronGeometry(0.13, 0),
};
const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false });
const SKINS = [0xf2c9a0, 0xe0ac7e, 0xc68e5d, 0xf5d5b8];

function makeCharacter(team, skin, faceTex, gunType) {
  const root = new THREE.Group();
  const police = team === 'police';
  const shirt = police ? M(0x2f5fd0) : stripeMat;
  const pants = M(police ? 0x1b2a55 : 0x343a40);
  const skinM = M(skin);
  root.add(mesh(GEO.body, shirt, 0, 1.5, 0));
  const headMat = faceTex ? [skinM, skinM, skinM, skinM, new THREE.MeshLambertMaterial({ map: faceTex }), skinM] : skinM;
  root.add(mesh(GEO.head, headMat, 0, 2.35, 0));

  if (police) {
    root.add(mesh(new THREE.BoxGeometry(0.76, 0.22, 0.76), M(0x1b2a55), 0, 2.8, 0));
    root.add(mesh(new THREE.BoxGeometry(0.76, 0.06, 0.3), M(0x111a33), 0, 2.72, 0.48));
    root.add(mesh(new THREE.BoxGeometry(0.18, 0.15, 0.02), M(0xffd43b), 0, 2.82, 0.39));
    root.add(mesh(new THREE.BoxGeometry(0.16, 0.16, 0.02), M(0xffd43b), 0.22, 1.75, 0.26));
    if (!faceTex) for (const x of [-0.15, 0.15]) root.add(mesh(GEO.eye, M(0x111111), x, 2.38, 0.36));
  } else {
    root.add(mesh(new THREE.BoxGeometry(0.74, 0.26, 0.74), M(0x2b2b2b), 0, 2.78, 0));
    if (!faceTex) {
      root.add(mesh(new THREE.BoxGeometry(0.72, 0.2, 0.72), M(0x111111), 0, 2.42, 0));
      for (const x of [-0.15, 0.15]) root.add(mesh(GEO.eye, M(0xffffff), x, 2.42, 0.37));
    }
  }

  const limb = (x, y, geo, mat, len, handMat) => {
    const pivot = new THREE.Group(); pivot.position.set(x, y, 0);
    pivot.add(mesh(geo, mat, 0, -len / 2 + 0.05, 0));
    if (handMat) pivot.add(mesh(GEO.hand, handMat, 0, -len - 0.03, 0));
    root.add(pivot);
    return pivot;
  };
  const armL = limb(0.6, 1.95, GEO.arm, shirt, 0.8, skinM);
  const armR = limb(-0.6, 1.95, GEO.arm, shirt, 0.8, skinM);
  const legL = limb(0.22, 1.0, GEO.leg, pants, 1.0);
  const legR = limb(-0.22, 1.0, GEO.leg, pants, 1.0);

  if (police) {
    const baton = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.9, 8), M(0x111111), 0, -0.85, 0.4);
    baton.rotation.x = Math.PI / 2; armR.add(baton);
    const gun = new THREE.Group();
    if (gunType === 'sniper') { // 🔭 긴 저격총 + 조준경
      gun.add(mesh(new THREE.BoxGeometry(0.12, 0.14, 1.5), M(0x3b2f2f), 0, 0, 0.45));
      gun.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.45, 8), M(0x111111), 0, 0.14, 0.35).rotateX(Math.PI / 2));
      gun.add(mesh(new THREE.BoxGeometry(0.12, 0.25, 0.3), M(0x5d4037), 0, -0.12, -0.25));
    } else { // 🔫 리볼버
      gun.add(mesh(new THREE.BoxGeometry(0.14, 0.18, 0.5), M(0x868e96), 0, 0, 0.15));
      gun.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.16, 8), M(0x495057), 0, 0.02, 0.02).rotateX(Math.PI / 2));
      gun.add(mesh(new THREE.BoxGeometry(0.12, 0.25, 0.14), M(0x5d4037), 0, -0.15, -0.02));
    }
    gun.position.set(0, -0.9, 0.05); armL.add(gun);
  }

  const sh = new THREE.Mesh(GEO.shadow, shadowMat);
  sh.rotation.x = -Math.PI / 2; sh.position.y = 0.03; root.add(sh);

  const stars = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const s = mesh(GEO.star, M(0xffd43b), Math.cos(i * 2.09) * 0.5, 0, Math.sin(i * 2.09) * 0.5);
    stars.add(s);
  }
  stars.position.y = 3.15; stars.visible = false; root.add(stars);

  root.scale.setScalar(0.8);
  return { root, armL, armR, legL, legR, stars };
}

export function faceTexture(dataUrl) {
  if (!dataUrl) return null;
  const img = new Image();
  const t = new THREE.Texture(img);
  t.colorSpace = THREE.SRGBColorSpace;
  img.onload = () => { t.needsUpdate = true; };
  img.src = dataUrl;
  return t;
}

export class AgentView {
  constructor(scene, meta, isMe) {
    this.scene = scene; this.meta = meta; this.isMe = isMe;
    this.face = faceTexture(meta.avatar);
    const c = makeCharacter(meta.team, SKINS[meta.id % SKINS.length], this.face, meta.gun);
    Object.assign(this, c);
    this.mesh = c.root;
    this.s = null; this.anim = Math.random() * 6;
    const label = (isMe ? '나' : meta.name) + (meta.jailer ? ' 🔒' : '') + (meta.gun === 'sniper' ? ' 🔭' : '');
    this.label = labelSprite(label, isMe ? '#ffe14d' : meta.team === 'police' ? '#a5d8ff' : '#ffffff');
    this.label.position.y = 3.65;
    if (meta.team === 'police' && !isMe) { // 경찰 이름표는 벽 뒤에서도 보여요
      this.label.material.depthTest = false;
      this.label.renderOrder = 999;
    }
    this.mesh.add(this.label);
    this.emoteIdx = -1; this.emoteSprite = null;
    scene.add(this.mesh);
  }
  setEmote(idx, emotes) {
    if (idx === this.emoteIdx) return;
    this.emoteIdx = idx;
    if (this.emoteSprite) { this.mesh.remove(this.emoteSprite); this.emoteSprite.material.map.dispose(); this.emoteSprite.material.dispose(); this.emoteSprite = null; }
    if (idx >= 0) {
      this.emoteSprite = labelSprite(emotes[idx], '#fff', 90, 1.4);
      this.emoteSprite.position.y = 4.9;
      this.mesh.add(this.emoteSprite);
    }
  }
  // row: [id,x,y,z,yaw,ms,flags,sprintLeft,gunCd,tp,stun]
  apply(row, dt, snap) {
    const [, x, y, z, yaw, ms, flags] = row;
    if (!this.s || snap) this.s = { x, y, z, yaw, ms };
    else {
      const k = 1 - Math.exp(-dt * 15), s = this.s;
      if (Math.hypot(x - s.x, z - s.z) > 4) { s.x = x; s.z = z; s.y = y; }
      s.x += (x - s.x) * k; s.y += (y - s.y) * k; s.z += (z - s.z) * k;
      let d = yaw - s.yaw; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      s.yaw += d * k; s.ms = ms;
    }
    this.flags = flags;
  }
  update(dt, t, viewerTeam, viewer, occluded = false) {
    const s = this.s, f = this.flags || 0;
    if (!s) return;
    const jailed = f & 1, invuln = f & 2, stun = f & 4, hidden = f & 8, rescue = f & 16, swing = f & 32, shoot = f & 128;
    const sp = stun ? 0 : s.ms;
    this.anim += dt * sp * 2.4;
    const amp = Math.min(1, sp / 3) * 0.9, w = Math.sin(this.anim) * amp;
    this.legL.rotation.x = w; this.legR.rotation.x = -w; this.armL.rotation.x = -w; this.armR.rotation.x = w;
    if (jailed) { this.armR.rotation.x = -1.5 + Math.sin(t * 5) * 0.15; this.armL.rotation.x = -1.4 + Math.cos(t * 5) * 0.15; }
    if (rescue) { this.armR.rotation.x = -1.55; this.armL.rotation.x = -1.55; }
    if (swing) this.armR.rotation.x = -0.5 - 2.3 * ((t * 7) % 1);
    if (shoot) this.armL.rotation.x = -1.57;
    this.mesh.position.set(s.x, s.y + Math.abs(Math.sin(this.anim)) * 0.08 * amp, s.z);
    this.mesh.rotation.y = s.yaw;
    this.mesh.rotation.z = stun ? Math.sin(t * 8) * 0.12 : 0;
    this.stars.visible = !!stun;
    if (stun) this.stars.rotation.y = t * 6;
    // 숨은 도둑은 경찰한테 안 보여요 (아주 가까우면 보임)
    let visible = true;
    if (hidden && !this.isMe && viewerTeam === 'police' && Math.hypot(s.x - viewer.x, s.z - viewer.z) > 2.5) visible = false;
    if (invuln && Math.floor(t * 10) % 2) visible = false;
    if (this.isMe && viewer.scoped) visible = false;
    if (occluded) visible = false;
    this.mesh.visible = visible;
    this.label.visible = !(hidden && !this.isMe); // 숨으면 이름표도 숨어요
  }
  dispose() {
    this.setEmote(-1);
    this.scene.remove(this.mesh);
    this.label.material.map.dispose(); this.label.material.dispose();
    if (this.face) this.face.dispose();
  }
}

export { hex };
