// 🌍 블럭 세상: 어디에 무슨 블럭이 있는지 기억하고, 3D로 그려요
import * as THREE from 'three';
import { BLOCKS, ID, atlas, tileUV } from './blocks.js';

export const SX = 96, SY = 48, SZ = 96, CS = 16; // 세상 크기, 조각(청크) 크기
export const GROUND = 4;                           // 땅 위 높이 (여기에 서요)

// 처음 평평한 땅: 0층 바닥돌, 1~2층 흙, 3층 풀
export function baseBlock(y) { return y === 0 ? ID.bedrock : y < GROUND - 1 ? ID.dirt : y === GROUND - 1 ? ID.grass : 0; }

// 면: 바깥에서 봤을 때 왼쪽아래, 오른쪽아래, 오른쪽위, 왼쪽위 / 밝기
const FACES = [
  { d: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], f: 'side', sh: 0.8 },
  { d: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], f: 'side', sh: 0.8 },
  { d: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], f: 'top', sh: 1 },
  { d: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], f: 'bottom', sh: 0.55 },
  { d: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], f: 'front', sh: 0.9 },
  { d: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], f: 'side', sh: 0.7 },
];

const MATS = {
  o: new THREE.MeshBasicMaterial({ map: atlas, vertexColors: true }),
  c: new THREE.MeshBasicMaterial({ map: atlas, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide }),
  t: new THREE.MeshBasicMaterial({ map: atlas, vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide }),
};

export class VoxelWorld {
  constructor(scene) {
    this.scene = scene;
    this.d = new Uint8Array(SX * SY * SZ);
    this.diff = new Map();      // 처음 땅이랑 달라진 칸만 (저장, 친구한테 보내기)
    this.chunks = new Map();
    this.dirty = new Set();
    this.reset();
  }
  idx(x, y, z) { return (y * SZ + z) * SX + x; }
  inside(x, y, z) { return x >= 0 && y >= 0 && z >= 0 && x < SX && y < SY && z < SZ; }
  get(x, y, z) { return this.inside(x, y, z) ? this.d[this.idx(x, y, z)] : 0; }

  reset() {
    for (let y = 0; y < SY; y++) {
      const b = baseBlock(y), o = y * SZ * SX;
      this.d.fill(b, o, o + SZ * SX);
    }
    this.diff.clear();
    for (let cx = 0; cx < SX / CS; cx++) for (let cz = 0; cz < SZ / CS; cz++) this.dirty.add(cx + ',' + cz);
  }

  // 블럭 바꾸기 (바뀌었으면 true)
  set(x, y, z, id) {
    if (!this.inside(x, y, z) || y === 0) return false;
    const i = this.idx(x, y, z);
    if (this.d[i] === id) return false;
    this.d[i] = id;
    if (id === baseBlock(y)) this.diff.delete(i); else this.diff.set(i, id);
    const cx = Math.floor(x / CS), cz = Math.floor(z / CS);
    this.dirty.add(cx + ',' + cz);
    if (x % CS === 0 && cx > 0) this.dirty.add(cx - 1 + ',' + cz);
    if (x % CS === CS - 1) this.dirty.add(cx + 1 + ',' + cz);
    if (z % CS === 0 && cz > 0) this.dirty.add(cx + ',' + (cz - 1));
    if (z % CS === CS - 1) this.dirty.add(cx + ',' + (cz + 1));
    return true;
  }
  setIdx(i, id) {
    const x = i % SX, z = Math.floor(i / SX) % SZ, y = Math.floor(i / (SX * SZ));
    return this.set(x, y, z, id);
  }
  // [칸번호, 블럭, 칸번호, 블럭, ...]
  diffList() { const a = []; for (const [i, id] of this.diff) a.push(i, id); return a; }
  loadDiff(list) { this.reset(); for (let k = 0; k + 1 < list.length; k += 2) this.setIdx(list[k], list[k + 1]); }

  // 부딪히는 블럭? (세상 밖 옆쪽은 보이지 않는 벽)
  solidAt(x, y, z) {
    if (x < 0 || z < 0 || x >= SX || z >= SZ || y < 0) return true;
    if (y >= SY) return false;
    const id = this.d[this.idx(x, y, z)];
    return id !== 0 && BLOCKS[id].solid;
  }

  // ----- 그리기 -----
  rebuild(max = 4) {
    let n = 0;
    for (const key of this.dirty) {
      this.dirty.delete(key);
      const [cx, cz] = key.split(',').map(Number);
      if (cx < 0 || cz < 0 || cx >= SX / CS || cz >= SZ / CS) continue;
      this.buildChunk(cx, cz);
      if (++n >= max) break;
    }
  }

  buildChunk(cx, cz) {
    const key = cx + ',' + cz;
    const old = this.chunks.get(key);
    if (old) for (const m of old) { this.scene.remove(m); m.geometry.dispose(); }
    const buf = { o: mk(), c: mk(), t: mk() };
    for (let y = 0; y < SY; y++) for (let z = cz * CS; z < cz * CS + CS; z++) for (let x = cx * CS; x < cx * CS + CS; x++) {
      const id = this.d[this.idx(x, y, z)];
      if (!id) continue;
      const b = BLOCKS[id];
      if (b.flat) { this.flatQuad(buf[b.pass], b, x, y, z); continue; }
      for (const F of FACES) {
        const nx = x + F.d[0], ny = y + F.d[1], nz = z + F.d[2];
        if (ny < 0) continue;
        const n = this.get(nx, ny, nz);
        if (n) {
          const nb = BLOCKS[n];
          if (nb.pass === 'o') continue;              // 옆이 꽉 찬 블럭이면 안 보여요
          if (n === id && b.pass !== 'c') continue;   // 유리끼리, 물끼리 붙은 면은 안 그려요
        }
        const B = buf[b.pass], [u0, v0, u1, v1] = tileUV(b.faces[F.f]);
        const base = B.p.length / 3;
        const uv = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
        F.c.forEach((c, k) => {
          B.p.push(x + c[0], y + c[1], z + c[2]);
          B.u.push(uv[k][0], uv[k][1]);
          B.c.push(F.sh, F.sh, F.sh);
        });
        B.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
    const meshes = [];
    for (const pass of ['o', 'c', 't']) {
      const B = buf[pass];
      if (!B.i.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(B.p, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(B.u, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(B.c, 3));
      g.setIndex(B.i);
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, MATS[pass]);
      if (pass === 't') m.renderOrder = 1;
      this.scene.add(m); meshes.push(m);
    }
    this.chunks.set(key, meshes);
  }

  // 🛤️ 레일: 바닥에 붙은 얇은 그림 한 장. 옆(x)에 레일이 이어지면 옆으로 돌려요
  flatQuad(B, b, x, y, z) {
    const isR = (X, Z) => [0, 1, -1].some((dy) => this.get(X, y + dy, Z) === ID.rail);
    const alongX = (isR(x - 1, z) || isR(x + 1, z)) && !(isR(x, z - 1) || isR(x, z + 1));
    const [u0, v0, u1, v1] = tileUV(b.faces.top), h = 0.04;
    const uv = alongX ? [[u1, v0], [u1, v1], [u0, v1], [u0, v0]] : [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
    const base = B.p.length / 3;
    [[0, h, 1], [1, h, 1], [1, h, 0], [0, h, 0]].forEach((c, k) => {
      B.p.push(x + c[0], y + c[1], z + c[2]); B.u.push(uv[k][0], uv[k][1]); B.c.push(1, 1, 1);
    });
    B.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  // 눈에서 바라보는 쪽으로 처음 닿는 블럭 찾기 (DDA)
  raycast(o, d, max) {
    let x = Math.floor(o.x), y = Math.floor(o.y), z = Math.floor(o.z);
    const sx = Math.sign(d.x), sy = Math.sign(d.y), sz = Math.sign(d.z);
    const next = (p, s, dd, c) => (dd === 0 ? Infinity : s > 0 ? (c + 1 - p) / dd : (p - c) / -dd);
    let tx = next(o.x, sx, d.x, x), ty = next(o.y, sy, d.y, y), tz = next(o.z, sz, d.z, z);
    const dx = d.x ? Math.abs(1 / d.x) : Infinity, dy = d.y ? Math.abs(1 / d.y) : Infinity, dz = d.z ? Math.abs(1 / d.z) : Infinity;
    let n = [0, 0, 0], t = 0;
    while (t <= max) {
      const id = this.get(x, y, z);
      if (id && id !== ID.water) return { x, y, z, n, id, t };
      if (tx < ty && tx < tz) { x += sx; t = tx; tx += dx; n = [-sx, 0, 0]; }
      else if (ty < tz) { y += sy; t = ty; ty += dy; n = [0, -sy, 0]; }
      else { z += sz; t = tz; tz += dz; n = [0, 0, -sz]; }
      if (y < 0 || y >= SY + 2) break;
    }
    return null;
  }
}

function mk() { return { p: [], u: [], c: [], i: [] }; }
