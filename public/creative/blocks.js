// 🧱 블럭 종류 + 블럭 그림 (컴퓨터가 점을 하나하나 찍어서 만들어요)
import * as THREE from 'three';

const T = 16; // 그림 한 장 크기 (16x16 점)

// 같은 그림이 매번 똑같이 나오게 하는 주사위
function dice(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 10000) / 10000; };
}
const rgb = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];

// ----- 그림 그리는 도구 -----
function painter(img, r) {
  const px = (x, y, c, k = 1, a = 255) => {
    const [R, G, B] = rgb(c), i = (y * T + x) * 4;
    img[i] = Math.min(255, R * k); img[i + 1] = Math.min(255, G * k); img[i + 2] = Math.min(255, B * k); img[i + 3] = a;
  };
  return {
    r, px,
    noise(c, v, a = 255) { for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) px(x, y, c, 1 + (r() - 0.5) * 2 * v, a); },
    rect(x0, y0, w, h, c, k = 1, a = 255) { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (x >= 0 && y >= 0 && x < T && y < T) px(x, y, c, k, a); },
    frame(c, k = 1) { for (let i = 0; i < T; i++) { px(i, 0, c, k); px(i, T - 1, c, k); px(0, i, c, k); px(T - 1, i, c, k); } },
    spots(c, n, v = 0.1) { for (let i = 0; i < n; i++) px(Math.floor(r() * T), Math.floor(r() * T), c, 1 + (r() - 0.5) * v); },
  };
}

const PAINT = {
  grass_top: (p) => { p.noise(0x5fae3c, 0.16); p.spots(0x4a9a2c, 30); },
  dirt: (p) => { p.noise(0x8b5a2b, 0.18); p.spots(0x6e4420, 18); p.spots(0xa0703c, 10); },
  grass_side: (p) => {
    PAINT.dirt(p);
    for (let x = 0; x < T; x++) { const h = 3 + Math.floor(p.r() * 3); for (let y = 0; y < h; y++) p.px(x, y, 0x5fae3c, 1 + (p.r() - 0.5) * 0.3); }
  },
  stone: (p) => { p.noise(0x8c8c8c, 0.1); for (let i = 0; i < 6; i++) p.rect(Math.floor(p.r() * 14), Math.floor(p.r() * 15), 2 + Math.floor(p.r() * 3), 1, 0x737373); },
  cobble: (p) => {
    p.noise(0x5e5e5e, 0.1);
    for (let i = 0; i < 9; i++) {
      const cx = Math.floor(p.r() * T), cy = Math.floor(p.r() * T), rad = 2 + p.r() * 2.2, k = 0.85 + p.r() * 0.45;
      for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) if ((x - cx) ** 2 + (y - cy) ** 2 < rad * rad) p.px(x, y, 0x9a9a9a, k * (1 + (p.r() - 0.5) * 0.12));
    }
  },
  log_side: (p) => { p.noise(0x6b4a2b, 0.1); for (let x = 0; x < T; x += 3) for (let y = 0; y < T; y++) if (p.r() < 0.8) p.px(x + (p.r() < 0.3 ? 1 : 0), y, 0x4e3420, 1); },
  log_top: (p) => {
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      p.px(x, y, d > 6.5 ? 0x5a3d22 : Math.floor(d) % 2 ? 0xb88d55 : 0xa47944, 1 + (p.r() - 0.5) * 0.1);
    }
  },
  planks: (p) => {
    p.noise(0xb8894f, 0.08);
    for (let row = 0; row < 4; row++) {
      p.rect(0, row * 4 + 3, T, 1, 0x7a5530);
      const seam = (row * 7 + 3) % T; p.rect(seam, row * 4, 1, 3, 0x8a6238);
    }
  },
  brick: (p) => {
    p.noise(0xa94b3b, 0.12);
    for (let row = 0; row < 4; row++) {
      p.rect(0, row * 4 + 3, T, 1, 0xcfc6b8, 1);
      for (let x = (row % 2) * 4; x < T; x += 8) p.rect(x, row * 4, 1, 3, 0xcfc6b8, 1);
    }
  },
  glass: (p) => {
    p.rect(0, 0, T, T, 0xcfefff, 1, 40);
    p.frame(0xe8f7ff);
    for (let i = 3; i < 8; i++) p.px(i, 11 - i, 0xffffff, 1, 200);
    for (let i = 9; i < 12; i++) p.px(i, 20 - i, 0xffffff, 1, 200);
  },
  sand: (p) => { p.noise(0xe2d08f, 0.07); p.spots(0xc9b674, 20); },
  gravel: (p) => { p.noise(0x8a817c, 0.2); p.spots(0x5c5552, 30); p.spots(0xb0a7a2, 20); },
  leaves: (p) => {
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      if (p.r() < 0.18) p.px(x, y, 0x000000, 1, 0); else p.px(x, y, 0x3f8f2f, 0.75 + p.r() * 0.5);
    }
  },
  snow: (p) => { p.noise(0xf4f8ff, 0.04); },
  ice: (p) => { p.noise(0x9fd2ff, 0.06, 190); for (let i = 0; i < 4; i++) { const y = Math.floor(p.r() * T); p.rect(Math.floor(p.r() * 8), y, 6, 1, 0xe6f5ff, 1, 220); } },
  water: (p) => { p.noise(0x2f6fd8, 0.1, 160); for (let i = 0; i < 5; i++) p.rect(Math.floor(p.r() * 12), Math.floor(p.r() * T), 4, 1, 0x6fa3ff, 1, 170); },
  iron: (p) => { p.noise(0xd6d9dc, 0.04); p.frame(0xa9adb2); for (const [x, y] of [[2, 2], [13, 2], [2, 13], [13, 13]]) p.px(x, y, 0x8a8f95); p.rect(1, 7, 14, 1, 0xbcc0c4); },
  gold: (p) => { p.noise(0xf2c94c, 0.06); p.frame(0xc99a22); p.rect(3, 3, 4, 1, 0xfff1b0); p.rect(3, 4, 1, 3, 0xfff1b0); },
  gem: (p) => { p.noise(0x4fd8c8, 0.06); p.frame(0x23a091); p.rect(3, 3, 3, 1, 0xd9fffa); p.rect(3, 4, 1, 2, 0xd9fffa); p.rect(8, 8, 4, 4, 0x34bfb0); },
  coal: (p) => { PAINT.stone(p); for (let i = 0; i < 6; i++) p.rect(Math.floor(p.r() * 13), Math.floor(p.r() * 13), 2 + Math.floor(p.r() * 2), 2, 0x1e1e1e); },
  books: (p) => {
    p.noise(0xb8894f, 0.06); p.rect(0, 0, T, 1, 0x7a5530); p.rect(0, 7, T, 2, 0x7a5530); p.rect(0, 15, T, 1, 0x7a5530);
    const C = [0xc0392b, 0x2e86c1, 0x27ae60, 0xf1c40f, 0x8e44ad, 0xe67e22];
    for (const y0 of [1, 9]) for (let x = 1; x < 15; x += 2) p.rect(x, y0 + (p.r() < 0.3 ? 1 : 0), 2, 6, C[Math.floor(p.r() * C.length)]);
  },
  lamp: (p) => {
    p.noise(0xffd66b, 0.08); p.frame(0x6b4a2b);
    p.rect(7, 1, 2, 14, 0x6b4a2b); p.rect(1, 7, 14, 2, 0x6b4a2b);
    p.rect(3, 3, 2, 2, 0xfff6c8); p.rect(10, 10, 2, 2, 0xfff6c8);
  },
  marble: (p) => {
    p.noise(0xf0eeea, 0.03);
    let y = 3; for (let x = 0; x < T; x++) { y += Math.floor(p.r() * 3) - 1; p.px(x, (y + T) % T, 0xb5b0a8); }
    y = 11; for (let x = 0; x < T; x++) { y += Math.floor(p.r() * 3) - 1; p.px(x, (y + T) % T, 0xc8c3bb); }
  },
  cactus_side: (p) => { p.noise(0x4e9a3a, 0.08); for (const x of [1, 5, 10, 14]) p.rect(x, 0, 1, T, 0x3a7a2a); for (let i = 0; i < 8; i++) p.px(Math.floor(p.r() * T), Math.floor(p.r() * T), 0xe8e2b8); },
  cactus_top: (p) => { p.noise(0x5aa846, 0.08); p.frame(0x3a7a2a); p.rect(6, 6, 4, 4, 0x6dbf55); },
  bedrock: (p) => { p.noise(0x3a3a3a, 0.35); p.spots(0x111111, 40); },
  rail: (p) => {
    p.rect(0, 0, T, T, 0, 1, 0);
    for (let y = 1; y < T; y += 4) p.rect(1, y, 14, 2, 0x8a6238);
    p.rect(3, 0, 2, T, 0xb0b4b8); p.rect(11, 0, 2, T, 0xb0b4b8);
  },
  wool: (p, c) => { p.noise(c, 0.06); for (let y = 1; y < T; y += 4) for (let x = (y % 8 === 1 ? 1 : 3); x < T; x += 4) p.px(x, y, c, 0.88); },
};

// ----- 블럭 목록 (번호 = 블럭 id, 0은 빈칸) -----
// pass: 'o' 보통, 'c' 구멍 뚫린 것(나뭇잎), 't' 투명(유리, 물, 얼음)
const L = [];
const add = (key, name, tex, o = {}) => { L.push({ key, name, tex, pass: o.pass || 'o', solid: o.solid !== false, hard: o.hard ?? 1, palette: o.palette !== false }); return L.length; };
L.push(null);
export const ID = {};
const def = (key, name, tex, o) => { ID[key] = add(key, name, tex, o) - 1; };
def('grass', '풀', { top: 'grass_top', side: 'grass_side', bottom: 'dirt' }, { hard: 0.6 });
def('dirt', '흙', 'dirt', { hard: 0.5 });
def('stone', '돌', 'stone', { hard: 1.5 });
def('cobble', '조약돌', 'cobble', { hard: 2 });
def('log', '통나무', { top: 'log_top', side: 'log_side', bottom: 'log_top' }, { hard: 2 });
def('planks', '판자', 'planks', { hard: 2 });
def('brick', '벽돌', 'brick', { hard: 2 });
def('glass', '유리', 'glass', { pass: 't', hard: 0.3 });
def('sand', '모래', 'sand', { hard: 0.5 });
def('gravel', '자갈', 'gravel', { hard: 0.6 });
def('leaves', '나뭇잎', 'leaves', { pass: 'c', hard: 0.2 });
def('snow', '눈', 'snow', { hard: 0.3 });
def('ice', '얼음', 'ice', { pass: 't', hard: 0.5 });
def('water', '물', 'water', { pass: 't', solid: false, hard: 0.1 });
def('iron', '철 블럭', 'iron', { hard: 4 });
def('gold', '금 블럭', 'gold', { hard: 3 });
def('gem', '보석 블럭', 'gem', { hard: 5 });
def('coal', '석탄 돌', 'coal', { hard: 2 });
def('books', '책장', { top: 'planks', side: 'books', bottom: 'planks' }, { hard: 1.5 });
def('lamp', '등불', 'lamp', { hard: 0.5 });
def('marble', '대리석', 'marble', { hard: 2 });
def('cactus', '선인장', { top: 'cactus_top', side: 'cactus_side', bottom: 'cactus_top' }, { hard: 0.4 });
const COLORS = [
  ['white', '하양', 0xf2f2f2], ['black', '검정', 0x2a2a2e], ['red', '빨강', 0xd63a3a], ['orange', '주황', 0xf08a24],
  ['yellow', '노랑', 0xf5d33b], ['lime', '연두', 0x8fd13f], ['green', '초록', 0x3a8a3a], ['sky', '하늘', 0x6cc4f0],
  ['blue', '파랑', 0x3554c9], ['purple', '보라', 0x8a44c4], ['pink', '분홍', 0xf28cb8], ['brown', '갈색', 0x7a5232],
];
for (const [k, n, c] of COLORS) def(k, n + ' 블럭', { wool: c }, { hard: 0.8 });
def('bedrock', '바닥돌', 'bedrock', { palette: false, hard: Infinity });
export const BLOCKS = L;

// ----- 그림들을 한 장(아틀라스)에 모아요 -----
const tiles = [], tileIdx = new Map();
function tileOf(t) {
  const key = typeof t === 'string' ? t : 'wool' + t.wool;
  if (!tileIdx.has(key)) { tileIdx.set(key, tiles.length); tiles.push(t); }
  return tileIdx.get(key);
}
for (const b of L) {
  if (!b) continue;
  const t = b.tex;
  if (typeof t === 'string' || t.wool) { const i = tileOf(t); b.faces = { top: i, side: i, bottom: i }; }
  else b.faces = { top: tileOf(t.top), side: tileOf(t.side), bottom: tileOf(t.bottom) };
}
tileOf('rail');
export const AC = 8, AR = Math.ceil(tiles.length / AC);
export const atlasCanvas = document.createElement('canvas');
atlasCanvas.width = AC * T; atlasCanvas.height = AR * T;
{
  const g = atlasCanvas.getContext('2d');
  tiles.forEach((t, i) => {
    const id = g.createImageData(T, T), p = painter(id.data, dice(1000 + i * 7919));
    if (typeof t === 'string') PAINT[t](p); else PAINT.wool(p, t.wool);
    g.putImageData(id, (i % AC) * T, Math.floor(i / AC) * T);
  });
}
export const atlas = new THREE.CanvasTexture(atlasCanvas);
atlas.magFilter = THREE.NearestFilter; atlas.minFilter = THREE.NearestFilter; atlas.generateMipmaps = false;
atlas.colorSpace = THREE.SRGBColorSpace;

// 그림 한 장의 uv 자리 (가장자리가 번지지 않게 조금 안쪽)
export function tileUV(i) {
  const e = 0.02 / T, c = i % AC, r = Math.floor(i / AC);
  return [c / AC + e, 1 - (r + 1) / AR + e, (c + 1) / AC - e, 1 - r / AR - e];
}
export const RAIL_TILE = tileIdx.get('rail');

// 블럭 고르는 창에 쓰는 작은 그림 (옆면)
export function blockIcon(id, size = 40) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  const b = L[id], i = b.faces.side;
  g.drawImage(atlasCanvas, (i % AC) * T, Math.floor(i / AC) * T, T, T, 0, 0, size, size);
  return c;
}
