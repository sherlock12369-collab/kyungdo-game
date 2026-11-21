// 🚗 탈것: 🛒 레일 카트 (레일 따라 달려요), 🏎️ 고카트 (작고 빨라요), 🚙 자동차 (크고 더 빨라요)
// 앞쪽 = -z (사람이랑 같아요). yaw 0 = -z 쪽을 봐요.
import * as THREE from 'three';
import { ID } from './blocks.js';
import { SY } from './voxel.js';

export const VTYPES = {
  cart: { icon: '🛒', name: '레일 카트', max: 14, acc: 7, hw: 0.45, off: 0.2, hh: 0.9, seat: [0, 0.22, 0], turn: 2 },
  kart: { icon: '🏎️', name: '고카트', max: 13, acc: 10, hw: 0.55, off: 0.4, hh: 0.8, seat: [0, 0.12, 0.25], turn: 2.6 },
  car: { icon: '🚙', name: '자동차', max: 18, acc: 6.5, hw: 0.85, off: 0.8, hh: 1.3, seat: [-0.38, 0.3, 0.15], turn: 1.8 },
};
export const VCOLORS = [0xe03131, 0x1971c2, 0xf59f00, 0x2f9e44, 0x9c36b5, 0xf06595, 0x15aabf, 0xf8f9fa];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const DIRS = [[0, 1], [1, 0], [0, -1], [-1, 0]];      // 0:+z 1:+x 2:-z 3:-x
const yawOfDir = (d) => Math.atan2(-DIRS[d][0], -DIRS[d][1]);
const dirOfYaw = (yaw) => { const fx = -Math.sin(yaw), fz = -Math.cos(yaw); return Math.abs(fx) > Math.abs(fz) ? (fx > 0 ? 1 : 3) : (fz > 0 ? 0 : 2); };
const angLerp = (a, b, k) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * k; };

// ================= 모양 만들기 =================
const mats = new Map();
const mat = (c, basic) => { const k = c + (basic ? 'b' : ''); if (!mats.has(k)) mats.set(k, basic ? new THREE.MeshBasicMaterial({ color: c }) : new THREE.MeshLambertMaterial({ color: c })); return mats.get(k); };
function box(g, w, h, d, c, x, y, z, basic) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c, basic)); m.position.set(x, y, z); g.add(m); return m; }
function wheel(g, r, w, x, y, z, list) {
  const piv = new THREE.Group(); piv.position.set(x, y, z);
  const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 14), mat(0x222226)); t.rotation.z = Math.PI / 2; piv.add(t);
  const hub = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, r * 0.5, r * 1.3), mat(0xbfc4c9)); piv.add(hub); // 빙글빙글 보이게
  g.add(piv); list.push({ piv, r });
}
function makeMesh(type, color) {
  const g = new THREE.Group(), wheels = [];
  if (type === 'cart') {
    box(g, 0.9, 0.08, 1.3, 0x6b6f75, 0, 0.26, 0);                       // 바닥
    for (const s of [-1, 1]) { box(g, 0.08, 0.5, 1.3, color, s * 0.45, 0.5, 0); box(g, 0.9, 0.5, 0.08, color, 0, 0.5, s * 0.65); }
    for (const s of [-1, 1]) box(g, 0.98, 0.07, 0.07, 0x8a8f96, 0, 0.76, s * 0.65); // 테두리
    for (const x of [-0.3, 0.3]) for (const z of [-0.42, 0.42]) wheel(g, 0.16, 0.08, x, 0.16, z, wheels);
  } else if (type === 'kart') {
    box(g, 1.0, 0.14, 1.8, 0x333338, 0, 0.2, 0);                        // 바닥판
    box(g, 0.8, 0.22, 0.7, color, 0, 0.36, -0.6);                       // 앞 코
    box(g, 1.3, 0.12, 0.18, color, 0, 0.26, -1.0);                      // 앞 범퍼
    box(g, 0.6, 0.5, 0.12, color, 0, 0.55, 0.62);                       // 등받이
    box(g, 0.6, 0.1, 0.5, 0x222226, 0, 0.32, 0.38);                     // 의자
    box(g, 1.4, 0.1, 0.24, color, 0, 0.85, 0.85);                       // 뒤 날개
    for (const s of [-1, 1]) box(g, 0.06, 0.5, 0.06, 0x333338, s * 0.5, 0.6, 0.85);
    box(g, 0.05, 0.05, 0.45, 0x333338, 0, 0.5, -0.08).rotation.x = -0.6; // 핸들 막대
    box(g, 0.36, 0.06, 0.06, 0x111111, 0, 0.62, -0.25);                 // 핸들
    for (const x of [-0.62, 0.62]) for (const z of [-0.68, 0.7]) wheel(g, z < 0 ? 0.22 : 0.27, 0.24, x, z < 0 ? 0.22 : 0.27, z, wheels);
  } else {
    box(g, 1.7, 0.5, 3.3, color, 0, 0.62, 0);                           // 몸통
    box(g, 1.6, 0.18, 1.1, color, 0, 0.95, -1.05);                      // 보닛
    box(g, 1.6, 0.18, 0.8, color, 0, 0.95, 1.25);                       // 트렁크
    for (const s of [-1, 1]) box(g, 0.1, 0.3, 1.4, color, s * 0.8, 1.0, 0.1); // 옆문 위
    box(g, 1.5, 0.45, 0.06, 0xbfe6ff, 0, 1.25, -0.48).rotation.x = -0.35; // 앞 유리
    for (const x of [-0.38, 0.38]) { box(g, 0.6, 0.12, 0.6, 0x3a3a40, x, 0.92, 0.15); box(g, 0.6, 0.5, 0.12, 0x3a3a40, x, 1.15, 0.5); } // 의자
    box(g, 0.06, 0.06, 0.3, 0x333338, -0.38, 1.1, -0.3).rotation.x = -0.7;
    box(g, 0.34, 0.34, 0.05, 0x111111, -0.38, 1.18, -0.4).rotation.x = -0.4; // 핸들
    for (const x of [-0.6, 0.6]) { box(g, 0.34, 0.16, 0.05, 0xfff3b0, x, 0.72, -1.66, true); box(g, 0.3, 0.14, 0.05, 0xff3030, x, 0.74, 1.66, true); } // 불빛
    box(g, 1.75, 0.14, 0.12, 0xbfc4c9, 0, 0.4, -1.68); box(g, 1.75, 0.14, 0.12, 0xbfc4c9, 0, 0.4, 1.68); // 범퍼
    for (const x of [-0.85, 0.85]) for (const z of [-1.1, 1.1]) wheel(g, 0.38, 0.3, x, 0.38, z, wheels);
  }
  return { g, wheels };
}

// ================= 탈것 하나 =================
export class Vehicle {
  constructor(scene, id, type, x, y, z, yaw, color) {
    Object.assign(this, { scene, id, type, x, y, z, yaw, color, v: 0, vy: 0, rider: null, rail: null, tgt: null, ground: false });
    const { g, wheels } = makeMesh(type, color);
    this.mesh = g; this.wheels = wheels; this.vis = { y, yaw };
    scene.add(g); this.place();
  }
  get T() { return VTYPES[this.type]; }
  remove() { this.scene.remove(this.mesh); }
  state(rider) { return [this.id, this.type, +this.x.toFixed(2), +this.y.toFixed(2), +this.z.toFixed(2), +this.yaw.toFixed(3), this.color, rider || 0, +this.v.toFixed(1)]; }

  // 앉는 자리 (세상 위치)
  seat() {
    const [sx, sy, sz] = this.T.seat, c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    return { x: this.x + sx * c + sz * s, y: this.vis.y + sy, z: this.z - sx * s + sz * c };
  }
  // 내릴 자리 (옆에 빈칸 찾기)
  exitSpot(collides) {
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw), d = this.T.hw + 0.7;
    for (const [lx, lz] of [[-d, 0], [d, 0], [0, -this.T.off - this.T.hw - 0.7], [0, this.T.off + this.T.hw + 0.7]]) {
      const x = this.x + lx * c + lz * s, z = this.z - lx * s + lz * c;
      for (const dy of [0, 1, -1]) if (!collides(x, this.y + dy + 0.01, z) && collides(x, this.y + dy - 0.5, z)) return { x, y: this.y + dy + 0.01, z };
    }
    return { x: this.x, y: this.y + this.T.hh + 0.1, z: this.z };
  }

  // ----- 부딪히기 (앞뒤 두 칸 상자) -----
  hit(world, x, y, z, yaw = this.yaw) {
    const { hw, hh, off } = this.T, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    for (const k of [-1, 0, 1]) {
      const cx = x + fx * off * k, cz = z + fz * off * k;
      for (let X = Math.floor(cx - hw); X <= Math.floor(cx + hw - 1e-6); X++)
        for (let Y = Math.floor(y + 0.05); Y <= Math.floor(y + hh - 1e-6); Y++)
          for (let Z = Math.floor(cz - hw); Z <= Math.floor(cz + hw - 1e-6); Z++)
            if (world.solidAt(X, Y, Z)) return true;
    }
    return false;
  }

  // ----- 운전하기 (fw: 앞뒤 -1~1, st: 왼오 -1~1) -----
  drive(world, dt, fw, st) {
    if (this.type === 'cart' && this.railStep(world, dt, fw, st)) return;
    const T = this.T, max = this.type === 'cart' ? 3 : T.max;
    if (fw) this.v += fw * T.acc * dt * (this.v * fw < 0 ? 2.2 : 1);
    else this.v -= Math.sign(this.v) * Math.min(Math.abs(this.v), 5 * dt);
    const water = world.get(Math.floor(this.x), Math.floor(this.y + 0.3), Math.floor(this.z)) === ID.water;
    const cap = water ? 2.5 : max;
    this.v = clamp(this.v, -cap * 0.45, cap);
    this.physics(world, dt, st);
  }
  // 아무도 안 타면: 떨어지기만 해요
  idle(world, dt) {
    if (this.rail && world.get(this.rail.a[0], this.rail.a[1], this.rail.a[2]) === ID.rail) { this.v = 0; this.place(); return; }
    this.rail = null; this.v = 0; this.physics(world, dt, 0);
  }
  physics(world, dt, st) {
    const T = this.T;
    // 핸들 돌리기 (움직일 때만)
    if (st) {
      const ny = this.yaw - st * T.turn * dt * clamp(this.v / 4, -1, 1);
      if (!this.hit(world, this.x, this.y, this.z, ny)) this.yaw = ny;
    }
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const mx = fx * this.v * dt, mz = fz * this.v * dt;
    for (const [ax, amt] of [['x', mx], ['z', mz]]) {
      if (!amt) continue;
      const n = Math.ceil(Math.abs(amt) / 0.25), s = amt / n;
      for (let i = 0; i < n; i++) {
        const nx = ax === 'x' ? this.x + s : this.x, nz = ax === 'z' ? this.z + s : this.z;
        if (!this.hit(world, nx, this.y, nz)) { this.x = nx; this.z = nz; continue; }
        // 한 칸 턱은 올라가요
        if (this.ground && !this.hit(world, nx, this.y + 1.01, nz)) { this.y = Math.floor(this.y + 0.05) + 1.001; this.x = nx; this.z = nz; continue; }
        this.v *= 0.35; break;
      }
    }
    this.vy = Math.max(this.vy - 28 * dt, -40);
    const dy = this.vy * dt, n = Math.ceil(Math.abs(dy) / 0.3) || 1;
    this.ground = false;
    for (let i = 0; i < n; i++) {
      const ny = this.y + dy / n;
      if (!this.hit(world, this.x, ny, this.z)) { this.y = ny; continue; }
      if (this.vy < 0) { this.y = Math.floor(ny + 0.05) + 1.001; this.ground = true; }
      this.vy = 0; break;
    }
    if (this.y < -10) { this.y = SY - 2; this.vy = 0; }
    this.spin(this.v * dt);
    this.place();
  }

  // ----- 🛤️ 레일 따라가기 -----
  isRail(world, c) { return world.get(c[0], c[1], c[2]) === ID.rail; }
  // c 칸에서 d 쪽으로 갈 다음 레일 (pref: -1 왼쪽 먼저, 1 오른쪽 먼저)
  nextRail(world, c, d, pref) {
    const L = (d + 1) % 4, R = (d + 3) % 4;
    const order = pref < 0 ? [L, d, R] : pref > 0 ? [R, d, L] : [d, L, R];
    for (const dd of order) for (const dy of [0, 1, -1]) {
      const n = [c[0] + DIRS[dd][0], c[1] + dy, c[2] + DIRS[dd][1]];
      if (this.isRail(world, n)) return { c: n, d: dd };
    }
    return null;
  }
  railStep(world, dt, fw, st) {
    let r = this.rail;
    if (r && (!this.isRail(world, r.a) || !this.isRail(world, r.b))) r = this.rail = null;
    if (!r) { // 레일 위에 올라가 있으면 붙어요
      const c = [Math.floor(this.x), Math.floor(this.y + 0.3), Math.floor(this.z)];
      if (!this.isRail(world, c)) return false;
      let d = dirOfYaw(this.yaw), n = this.nextRail(world, c, d, 0);
      if (!n) return false;
      r = this.rail = { a: c, b: n.c, d: n.d, t: 0 };
      this.v = 0;
    }
    const pref = st > 0.3 ? 1 : st < -0.3 ? -1 : 0;
    if (fw) this.v += fw * this.T.acc * dt * (this.v * fw < 0 ? 2.2 : 1);
    else this.v -= Math.sign(this.v) * Math.min(Math.abs(this.v), 1.2 * dt); // 레일은 잘 굴러가요
    this.v += (r.a[1] - r.b[1]) * 5 * dt;                                    // 내리막은 빨라져요
    this.v = clamp(this.v, -this.T.max * 0.6, this.T.max);
    r.t += this.v * dt;
    let guard = 8;
    while (r.t > 1 && guard--) {
      const n = this.nextRail(world, r.b, r.d, pref);
      if (!n) { r.t = 1; this.v = 0; break; }
      r.a = r.b; r.b = n.c; r.d = n.d; r.t -= 1;
    }
    while (r.t < 0 && guard--) {
      const n = this.nextRail(world, r.a, (r.d + 2) % 4, -pref);
      if (!n) { r.t = 0; this.v = 0; break; }
      r.b = r.a; r.a = n.c; r.d = (n.d + 2) % 4; r.t += 1;
    }
    const k = r.t;
    this.x = r.a[0] + 0.5 + (r.b[0] - r.a[0]) * k;
    this.z = r.a[2] + 0.5 + (r.b[2] - r.a[2]) * k;
    this.y = r.a[1] + (r.b[1] - r.a[1]) * k + 0.04;
    this.yaw = angLerp(this.yaw, yawOfDir(r.d), Math.min(1, dt * 12));
    this.vy = 0;
    this.spin(this.v * dt);
    this.place();
    return true;
  }

  // ----- 친구 탈것: 받은 자리로 부드럽게 -----
  netSet(s) { this.tgt = { x: s[2], y: s[3], z: s[4], yaw: s[5], v: s[8] || 0 }; }
  follow(dt) {
    const t = this.tgt; if (!t) return;
    const k = Math.min(1, dt * 10), ox = this.x, oz = this.z;
    this.x += (t.x - this.x) * k; this.y += (t.y - this.y) * k; this.z += (t.z - this.z) * k;
    this.yaw = angLerp(this.yaw, t.yaw, k); this.v = t.v;
    this.spin(Math.hypot(this.x - ox, this.z - oz) * Math.sign(t.v || 1));
    this.place();
  }

  spin(dist) { for (const w of this.wheels) w.piv.rotation.x -= dist / w.r; }
  place() {
    this.vis.y += (this.y - this.vis.y) * 0.35;           // 턱 올라갈 때 부드럽게
    if (Math.abs(this.y - this.vis.y) < 0.01) this.vis.y = this.y;
    this.mesh.position.set(this.x, this.vis.y, this.z);
    this.mesh.rotation.y = this.yaw;
    // 오르막/내리막 기울기
    const r = this.rail;
    this.mesh.rotation.order = 'YXZ';
    this.mesh.rotation.x = r && r.a[1] !== r.b[1] ? (r.b[1] - r.a[1]) * 0.7 : 0;
  }
}

export { yawOfDir, dirOfYaw };
