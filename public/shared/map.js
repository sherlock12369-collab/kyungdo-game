// 맵 데이터 + 길찾기 — 브라우저(그리기)와 서버(충돌·AI)가 같이 써요
export const R = 0.45;      // 캐릭터 몸 크기
export const BODY = 1.8;    // 캐릭터 키 (부딪힘용)
export const STEP = 0.45;   // 계단처럼 그냥 걸어서 올라가는 높이

export const MAP_LIST = [
  { id: 'school', name: '🏫 학교' },
  { id: 'playground', name: '🎠 놀이터' },
  { id: 'apartment', name: '🏢 아파트' },
];

const cache = {};
export function getMap(id) {
  if (!BUILDERS[id]) id = 'school';
  return cache[id] || (cache[id] = makeMap(id));
}

function makeMap(id) {
  const m = { id, pieces: [], obstacles: [], hideZones: [], indoors: [], stairs: [], lowCam: [], levels: [0], sky: 0x9fd4ff };
  // 상자: 그림 + 부딪힘. o.y = 바닥 높이, o.lvl/o.grp = 건물 몇 층 (안에 들어가면 위층 숨기기)
  const box = (x1, x2, z1, z2, h, color, o = {}) => {
    const y = o.y || 0;
    m.pieces.push({ k: 'box', x1, x2, z1, z2, y, h, color, tex: o.tex || null, lvl: o.lvl ?? null, grp: o.grp || null });
    if (o.solid !== false) m.obstacles.push({ x1, x2, z1, z2, y0: y, h: y + h, border: !!o.border });
  };
  const solid = (x1, x2, z1, z2, h, y0 = 0) => m.obstacles.push({ x1, x2, z1, z2, y0, h });
  const hide = (x, z, r, kind, y = 0) => m.hideZones.push({ x, z, r, kind, y });
  const put = (p) => m.pieces.push(p);
  BUILDERS[id]({ box, solid, hide, put, m });
  finish(m);
  return m;
}

// ================= 공통 소품 =================
function ground(H, color) { H.put({ k: 'plane', x1: -120, x2: 120, z1: -120, z2: 120, y: 0, color }); }

function boundary(H, color = 0x2e7d4f) {
  const b = H.m.bounds, o = { border: true };
  H.box(b.x1 - 1, b.x2 + 1, b.z1 - 1, b.z1, 2.2, color, o);
  H.box(b.x1 - 1, b.x2 + 1, b.z2, b.z2 + 1, 2.2, color, o);
  H.box(b.x1 - 1, b.x1, b.z1, b.z2, 2.2, color, o);
  H.box(b.x2, b.x2 + 1, b.z1, b.z2, 2.2, color, o);
}

function jail(H) {
  const J = H.m.jail, F = 0.15;
  H.put({ k: 'jail' });
  H.solid(J.x1 - F, J.x2 + F, J.z1 - F, J.z1 + F, 2.6);
  H.solid(J.x1 - F, J.x2 + F, J.z2 - F, J.z2 + F, 2.6);
  H.solid(J.x1 - F, J.x1 + F, J.z1, J.z2, 2.6);
  H.solid(J.x2 - F, J.x2 + F, J.z1, J.z2, 2.6);
}

function tree(H, x, z) { H.put({ k: 'tree', x, z }); H.solid(x - 0.4, x + 0.4, z - 0.4, z + 0.4, 5); }
function bush(H, x, z) { H.put({ k: 'bush', x, z }); H.hide(x, z, 1.3, 'bush'); }
// 숨는 상자 (청소도구함, 옷장, 분리수거함…)
function locker(H, x, z, color = 0x748ffc, o = {}) {
  H.put({ k: 'locker', x, z, color, by: o.y || 0, lvl: o.lvl ?? null, grp: o.grp || null });
  H.hide(x, z, 0.6, 'locker', o.y || 0);
}
function curtain(H, x, z, o = {}) {
  H.put({ k: 'curtain', x, z, by: o.y || 0, lvl: o.lvl ?? null, grp: o.grp || null, color: o.color });
  H.hide(x, z, 0.65, 'curtain', o.y || 0);
}
function sign(H, text, x, y, z, size = 1, o = {}) { H.put({ k: 'sign', text, x, y, z, size, lvl: o.lvl ?? null, grp: o.grp || null }); }
function bench(H, x1, x2, z1, z2) { H.box(x1, x2, z1, z2, 0.5, 0xa0522d); }

function tunnel(H, x1, x2, z, color = 0xf76707) {
  H.put({ k: 'tunnel', x1, x2, z, color });
  H.solid(x1, x2, z - 1.05, z - 0.95, 1.9);
  H.solid(x1, x2, z + 0.95, z + 1.05, 1.9);
  const n = Math.max(1, Math.round((x2 - x1) / 3));
  for (let i = 0; i < n; i++) H.hide(x1 + (x2 - x1) * (i + 0.5) / n, z, 1.0, 'tunnel');
}

function swing(H, x1, x2, z) {
  H.put({ k: 'swing', x1, x2, z });
  for (const x of [x1, x2]) for (const dz of [-1, 1]) H.solid(x - 0.1, x + 0.1, z + dz - 0.1, z + dz + 0.1, 2.8);
}

function jungle(H, x, z, s) {
  H.put({ k: 'jungle', x, z, s });
  for (const [px, pz] of [[x, z], [x + s, z], [x, z + s], [x + s, z + s]]) H.solid(px - 0.1, px + 0.1, pz - 0.1, pz + 0.1, 3);
  H.box(x + s / 2 - 1, x + s / 2 + 1, z + s / 2 - 1, z + s / 2 + 1, 0.12, 0xfcc419, { y: 1.08 });
}

// 미끄럼틀 탑: 점프해서 한 칸씩 올라가요
function slideTower(H, x, z) {
  H.box(x, x + 2, z, z + 2, 0.6, 0x4dabf7);
  H.box(x + 2, x + 4, z, z + 2, 1.2, 0x339af0);
  H.box(x + 4, x + 6, z, z + 2, 1.8, 0x228be6);
  H.box(x + 6, x + 9, z - 0.5, z + 2.5, 2.4, 0x1c7ed6);
  H.put({ k: 'slide', x: x + 7.5, z1: z + 2.5, z2: z + 8.5, h: 2.4 });
}

function seesaw(H, x1, x2, z) {
  H.box(x1, x2, z - 0.25, z + 0.25, 0.5, 0xff922b);
  H.box((x1 + x2) / 2 - 0.3, (x1 + x2) / 2 + 0.3, z - 0.4, z + 0.4, 0.3, 0x495057, { solid: false });
}

function car(H, x, z1, color) {
  H.box(x - 0.95, x + 0.95, z1, z1 + 4.2, 1.0, color);
  H.box(x - 0.85, x + 0.85, z1 + 1.1, z1 + 3.1, 0.6, 0xa5d8ff, { y: 1.0 });
}

// ================= 🏫 학교 (3층 + 옥상) =================
const FL = 4.2; // 한 층 높이

function school(H) {
  const { box, put, m } = H;
  m.bounds = { x1: -50, x2: 50, z1: -40, z2: 40 };
  m.jail = { x1: -46, x2: -37, z1: 4, z2: 14 };
  m.policeSpawn = { x1: -35, x2: -31, z1: 5, z2: 13 };
  m.robberSpawn = { x1: -10, x2: 46, z1: -20, z2: 36 };
  m.levels = [0, FL, FL * 2, FL * 3];
  ground(H, 0x7cc456);
  put({ k: 'plane', x1: -25, x2: 25, z1: -15, z2: 20, y: 0.01, color: 0xdcbc86 });
  put({ k: 'lines', x: 0, z: 2.5, len: 35 });
  boundary(H);
  jail(H);

  const S = { x1: -32, x2: 32, z1: -40, z2: -24 }, W = 0.3, WH = 4, wall = 0xeadcbc, CZ = -28;
  m.indoors.push({ id: 'school', ...S });
  const FLOORS = [
    [['📚 도서관', 'lib'], ['1-1반', 'class'], ['🔬 과학실', 'sci'], ['2-1반', 'class'], ['🎵 음악실', 'music']],
    [['3-1반', 'class'], ['4-1반', 'class'], ['💻 컴퓨터실', 'computer'], ['5-1반', 'class'], ['🎨 미술실', 'art']],
    [['6-1반', 'class'], ['🏫 교무실', 'office'], ['🩹 보건실', 'nurse'], ['6-2반', 'class'], ['📢 방송실', 'broadcast']],
  ];
  const EAST_DOOR = [null, [-35, -33], [-27, -25]]; // 바깥 계단에서 들어가는 문
  const xs = [-32, -19, -6, 6, 19, 32];

  for (let L = 0; L < 3; L++) {
    const b = L * FL;
    const o = (extra = {}) => ({ ...extra, y: b + (extra.y || 0), lvl: L, grp: 'school' });
    put({ k: 'plane', x1: S.x1, x2: S.x2, z1: S.z1, z2: CZ, y: b + 0.02, color: 0xc8a273, lvl: L, grp: 'school' });
    put({ k: 'plane', x1: S.x1, x2: S.x2, z1: CZ, z2: S.z2, y: b + 0.03, color: 0xcfd5db, lvl: L, grp: 'school' });
    // 바깥벽
    box(S.x1, S.x1 + W, S.z1, S.z2, WH, wall, o({ tex: 'win' }));
    box(S.x1 + W, S.x2 - W, S.z1, S.z1 + W, WH, wall, o({ tex: 'win' }));
    const ed = EAST_DOOR[L];
    if (!ed) box(S.x2 - W, S.x2, S.z1, S.z2, WH, wall, o({ tex: 'win' }));
    else {
      box(S.x2 - W, S.x2, S.z1, ed[0], WH, wall, o({ tex: 'win' }));
      box(S.x2 - W, S.x2, ed[1], S.z2, WH, wall, o({ tex: 'win' }));
      box(S.x2 - W, S.x2, ed[0], ed[1], 1, wall, o({ y: WH - 1, solid: false }));
    }
    // 앞벽 (1층은 현관문 3개)
    const doors = L === 0 ? [[-27, -24.6], [-1.6, 1.6], [24.6, 27]] : [];
    let x = S.x1;
    for (const [a, c] of doors) {
      box(x, a, S.z2 - W, S.z2, WH, wall, o({ tex: 'win' }));
      box(a, c, S.z2 - W, S.z2, 1, wall, o({ y: WH - 1, solid: false }));
      x = c;
    }
    box(x, S.x2, S.z2 - W, S.z2, WH, wall, o({ tex: 'win' }));
    // 교실들
    FLOORS[L].forEach(([name, kind], i) => {
      const a = xs[i], c2 = xs[i + 1], c = (a + c2) / 2;
      const a2 = i === 0 ? a + W : a, b2 = i === 4 ? c2 - W : c2;
      box(a2, c - 1.3, CZ - W, CZ, WH, wall, o());
      box(c + 1.3, b2, CZ - W, CZ, WH, wall, o());
      box(c - 1.3, c + 1.3, CZ - W, CZ, 1, wall, o({ y: WH - 1, solid: false }));
      if (i < 4) box(c2 - W / 2, c2 + W / 2, S.z1 + W, CZ - W, WH, wall, o());
      sign(H, name, c, b + 3.4, CZ + 0.25, 0.8, { lvl: L, grp: 'school' });
      const xa = i === 0 ? a2 : a + W / 2, xb = i === 4 ? b2 : c2 - W / 2;
      furnish(H, kind, xa, xb, S.z1 + W, c, o);
    });
    // 위층 바닥 (= 이 층 천장)
    box(S.x1, S.x2, S.z1, S.z2, 0.2, L === 2 ? 0x8d6e63 : 0xbfae8f, { y: b + 4.0, lvl: L + 1, grp: 'school' });
  }
  sign(H, '경도초등학교', 0, 10.6, S.z2 + 0.4, 2.2, { lvl: 2, grp: 'school' });

  // ----- 옥상 -----
  const RY = FL * 3, ro = (extra = {}) => ({ ...extra, y: RY + (extra.y || 0), lvl: 3, grp: 'school' });
  box(S.x1, S.x2, S.z1, S.z1 + 0.3, 1, 0x9e9e9e, ro());
  box(S.x1, S.x2, S.z2 - 0.3, S.z2, 1, 0x9e9e9e, ro());
  box(S.x1, S.x1 + 0.3, S.z1, S.z2, 1, 0x9e9e9e, ro());
  box(S.x2 - 0.3, S.x2, S.z1, -35, 1, 0x9e9e9e, ro());
  box(S.x2 - 0.3, S.x2, -33, S.z2, 1, 0x9e9e9e, ro());
  box(-22, -17, -38, -34, 3, 0x74c0fc, ro());          // 물탱크
  box(-6, -2, -37, -35, 1.4, 0xced4da, ro());          // 실외기
  box(6, 10, -37, -35, 1.4, 0xced4da, ro());
  box(16, 20, -30, -27, 1.6, 0xadb5bd, ro());
  locker(H, 27, -38.5, 0x868e96, { y: RY, lvl: 3, grp: 'school' });
  sign(H, '🔭 옥상', 30, RY + 2.4, -34, 0.9, { lvl: 3, grp: 'school' });

  // ----- 바깥 계단 (1층 → 2층 → 3층 → 옥상) -----
  const stepC = 0x90a4ae;
  for (let i = 1; i <= 12; i++) {
    const r = 0.35 * i;
    box(32.3, 34.3, -27 - 0.5 * i, -27 - 0.5 * (i - 1), 0.35, stepC, { y: r - 0.35 });
    box(34.3, 36.3, -33 + 0.5 * (i - 1), -33 + 0.5 * i, 0.35, stepC, { y: FL + r - 0.35 });
    box(32.3, 34.3, -27 - 0.5 * i, -27 - 0.5 * (i - 1), 0.35, stepC, { y: FL * 2 + r - 0.35 });
  }
  box(32, 36.3, -35, -33, 0.2, 0x78909c, { y: FL - 0.2 });
  box(32, 36.3, -27, -25, 0.2, 0x78909c, { y: FL * 2 - 0.2 });
  box(32, 36.3, -35, -33, 0.2, 0x78909c, { y: FL * 3 - 0.2 });
  box(36.3, 36.45, -35, -25, 9.6, 0x546e7a, { y: FL });       // 난간
  box(32, 36.45, -35.15, -35, 9.6, 0x546e7a, { y: FL });
  box(32, 36.45, -25, -24.85, 1, 0x546e7a, { y: FL * 2 });
  sign(H, '⬆ 계단', 34.3, 3, -24.3, 0.8);
  m.stairs.push(
    { a: { x: 33.3, z: -26.2, lv: 0 }, b: { x: 33.3, z: -34, lv: 1 } },
    { a: { x: 35.3, z: -34, lv: 1 }, b: { x: 35.3, z: -26, lv: 2 } },
    { a: { x: 33.3, z: -26, lv: 2 }, b: { x: 33.3, z: -34, lv: 3 } },
  );

  // ----- 운동장 주변 -----
  box(-5, 5, -19, -16.5, 1.2, 0xb8b0a0);
  sign(H, '구령대', 0, 2.2, -16.4, 0.7);
  box(-30, -22, -21.5, -20, 0.6, 0x8b5e3c, { tex: 'flower' });
  box(22, 30, -21.5, -20, 0.6, 0x8b5e3c, { tex: 'flower' });
  box(-48, -38, -38, -30, 4.5, 0x9fb7c9);
  box(-48.4, -37.6, -38.4, -29.6, 0.4, 0x3f8f5a, { y: 4.5, solid: false });
  sign(H, '체육창고', -43, 5.6, -29.5, 0.9);
  box(-48, -40, -21, -15, 2.6, 0x6c7a89);
  box(-48.3, -39.7, -21.3, -14.7, 0.25, 0x4a90c2, { y: 2.6, solid: false });
  box(8, 14, 27, 29.5, 2.6, 0xe8772e);
  box(-14, -8, 26, 28.5, 2.6, 0x3a7bd5);
  box(17, 19.5, -6, 0, 2.6, 0x3aa356);
  bench(H, -28, -25, 33.5, 34.1);
  bench(H, 26, 29, 33.5, 34.1);
  box(23.8, 24.2, -11.2, -10.8, 3.2, 0x495057);
  box(23.2, 24.8, -10.8, -10.65, 1.1, 0xffffff, { y: 3, solid: false });
  for (const bx of [-4, 0, 4]) box(bx - 0.12, bx + 0.12, 29.4, 29.64, 2.2, 0x868e96);
  put({ k: 'bars', x1: -4, x2: 4, z: 29.52 });

  // ----- 놀이터 -----
  put({ k: 'plane', x1: 28, x2: 48, z1: 6, z2: 38, y: 0.012, color: 0xe6c891 });
  sign(H, '놀이터', 38, 4.2, 6.2, 1);
  jungle(H, 30, 9, 5);
  slideTower(H, 37, 9);
  tunnel(H, 30, 36.5, 24);
  swing(H, 39, 47, 22);
  seesaw(H, 39, 45, 31.25);

  for (const [bx, bz] of [[-34, 34], [-2, 36], [22, 36], [47, -6], [47, -16], [-47, 24], [-47, 33], [36, -20], [-36, -20], [12, -20.5], [42, -31]]) bush(H, bx, bz);
  for (const [tx, tz] of [[-42, 36], [-20, 36], [-10, 37], [8, 37], [16, 35.5], [-48, 18], [-26, 24], [47, 2], [26, -17], [-26, -17], [40, -37], [45, -24]]) tree(H, tx, tz);
}

function furnish(H, kind, xa, xb, za, c, o) {
  const { box } = H;
  const lk = (x, z, col) => locker(H, x, z, col, o());
  const board = () => box(c - 3.5, c + 3.5, za, za + 0.1, 1.4, 0x2f5d3a, o({ y: 1.1, solid: false }));
  const desks = (col = 0xc8955a, chair = 0x5c7cfa) => {
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
      const x = xa + 2.4 + i * 2.6, z = za + 3.8 + j * 2.3;
      box(x - 0.45, x + 0.45, z - 0.3, z + 0.3, 0.75, col, o());
      box(x - 0.25, x + 0.25, z + 0.45, z + 0.85, 0.45, chair, o({ solid: false }));
    }
  };
  if (kind === 'class') {
    board(); box(c - 1, c + 1, za + 1.4, za + 2.1, 0.9, 0x8b5a2b, o()); desks(); lk(xb - 0.7, za + 0.6);
  } else if (kind === 'lib') {
    for (const z of [za + 2.5, za + 5, za + 7.5]) box(xa + 1.5, xb - 2.2, z, z + 0.6, 2.2, 0x8b5a2b, o({ tex: 'books' }));
    lk(xb - 0.7, za + 0.6, 0x8b5a2b);
  } else if (kind === 'sci') {
    board();
    for (const [dx, z] of [[-2.8, za + 3.5], [2.8, za + 3.5], [-2.8, za + 7], [2.8, za + 7]]) box(c + dx - 1.1, c + dx + 1.1, z - 0.6, z + 0.6, 0.9, 0xdee2e6, o());
    lk(xa + 0.7, za + 0.6, 0x868e96);
  } else if (kind === 'music') {
    box(xa + 1, xa + 3, za + 1, za + 2.4, 1.1, 0x111111, o());
    box(c + 1, c + 2.4, za + 1, za + 2.2, 1.0, 0xc92a2a, o());
    for (const x of [xb - 1, xb - 2.6]) curtain(H, x, za + 0.6, o());
  } else if (kind === 'computer') {
    board();
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
      const x = xa + 2.4 + i * 2.6, z = za + 3.8 + j * 2.3;
      box(x - 0.5, x + 0.5, z - 0.35, z + 0.35, 0.75, 0xdee2e6, o());
      box(x - 0.3, x + 0.3, z - 0.3, z - 0.25, 0.45, 0x212529, o({ y: 0.75, solid: false }));
    }
    lk(xb - 0.7, za + 0.6, 0x495057);
  } else if (kind === 'art') {
    for (const [dx, z] of [[-3, za + 4], [3, za + 4], [-3, za + 7.5], [3, za + 7.5]]) box(c + dx - 1.2, c + dx + 1.2, z - 0.7, z + 0.7, 0.8, 0xffe8cc, o());
    for (const x of [xa + 1.5, xa + 3.5, xb - 3.5]) box(x - 0.4, x + 0.4, za + 1, za + 1.2, 1.6, 0x8b5a2b, o({ y: 0.4, solid: false }));
    lk(xb - 0.7, za + 0.6, 0xf783ac);
  } else if (kind === 'office') {
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
      const x = xa + 3 + i * 3.5, z = za + 4 + j * 3.2;
      box(x - 1, x + 1, z - 0.5, z + 0.5, 0.78, 0x6d4c41, o());
    }
    box(xa + 0.3, xb - 3, za, za + 0.6, 2, 0x8d6e63, o({ tex: 'books' }));
    lk(xb - 0.7, za + 0.6, 0x5c7cfa);
  } else if (kind === 'nurse') {
    for (const x of [xa + 2, xa + 5, xa + 8]) {
      box(x - 0.6, x + 0.6, za + 1, za + 3.2, 0.6, 0xf8f9fa, o());
      curtain(H, x + 1.3, za + 3.6, { ...o(), color: 0xa5d8ff });
    }
    box(xb - 2, xb - 0.5, za + 6, za + 7, 0.9, 0xffffff, o());
  } else if (kind === 'broadcast') {
    box(c - 2.5, c + 2.5, za + 2, za + 3, 0.85, 0x343a40, o());
    box(c - 2, c + 2, za + 0.3, za + 0.8, 1.8, 0x495057, o());
    lk(xb - 0.7, za + 0.6, 0x343a40); lk(xa + 0.7, za + 0.6, 0x343a40);
  }
}

// ================= 🎠 놀이터 =================
const MAZE = ['##.######', '#...#...#', '#.#.#.#.#', '#.#...#.#', '#.#####.#', '#...#...#', '###.#.#.#', '#.....#..', '#########'];

function maze(H, x0, z0, c = 2.4) {
  const open = (i, j) => MAZE[j] && MAZE[j][i] === '.';
  MAZE.forEach((row, j) => [...row].forEach((ch, i) => {
    if (ch === '#') H.box(x0 + i * c, x0 + (i + 1) * c, z0 + j * c, z0 + (j + 1) * c, 2.2, 0x2f7d32, { tex: 'hedge' });
    else if (i > 0 && j > 0 && i < row.length - 1 && j < MAZE.length - 1) {
      const n = [open(i + 1, j), open(i - 1, j), open(i, j + 1), open(i, j - 1)].filter(Boolean).length;
      if (n === 1) bush(H, x0 + (i + 0.5) * c, z0 + (j + 0.5) * c);
    }
  }));
  sign(H, '🌳 미로', x0 + 2.5 * c, 3.4, z0 - 0.3, 1);
  // 미로 안에서는 카메라가 울타리(2.2m)보다 높이 못 올라가요
  H.m.lowCam.push({ x1: x0, x2: x0 + MAZE[0].length * c, z1: z0, z2: z0 + MAZE.length * c, maxY: 2.0 });
}

function playground(H) {
  const { box, put, m } = H;
  m.bounds = { x1: -40, x2: 40, z1: -35, z2: 35 };
  m.jail = { x1: -37, x2: -28, z1: -5, z2: 5 };
  m.policeSpawn = { x1: -26, x2: -22, z1: -4, z2: 4 };
  m.robberSpawn = { x1: -5, x2: 38, z1: -33, z2: 33 };
  m.sky = 0xa5d8ff;
  ground(H, 0x86c95a);
  put({ k: 'plane', x1: -20, x2: 8, z1: -32, z2: -8, y: 0.01, color: 0xe6c891 });
  put({ k: 'plane', x1: -20, x2: 12, z1: 16, z2: 32, y: 0.01, color: 0xe6c891 });
  boundary(H, 0x8b5e3c);
  jail(H);

  const P = { x1: 10, x2: 22, z1: -32, z2: -22 }, W = 0.3, hw = 3, wc = 0xffe066;
  const g = { grp: 'house', lvl: 0 };
  m.indoors.push({ id: 'house', ...P });
  put({ k: 'plane', ...P, y: 0.02, color: 0xffc9c9 });
  box(P.x1, P.x1 + W, P.z1, -28.2, hw, wc, g);
  box(P.x1, P.x1 + W, -25.8, P.z2, hw, wc, g);
  box(P.x1, P.x1 + W, -28.2, -25.8, 0.8, wc, { ...g, y: hw - 0.8, solid: false });
  box(P.x2 - W, P.x2, P.z1, P.z2, hw, wc, g);
  box(P.x1 + W, P.x2 - W, P.z1, P.z1 + W, hw, wc, g);
  box(P.x1, 14.8, P.z2 - W, P.z2, hw, wc, { ...g, tex: 'win' });
  box(17.2, P.x2, P.z2 - W, P.z2, hw, wc, { ...g, tex: 'win' });
  box(14.8, 17.2, P.z2 - W, P.z2, 0.8, wc, { ...g, y: hw - 0.8, solid: false });
  box(P.x1 - 0.4, P.x2 + 0.4, P.z1 - 0.4, P.z2 + 0.4, 0.5, 0xe03131, { y: hw, solid: false, lvl: 1, grp: 'house' });
  box(P.x1 + 1, P.x2 - 1, P.z1 + 1, P.z2 - 1, 0.9, 0xc92a2a, { y: hw + 0.5, solid: false, lvl: 1, grp: 'house' });
  sign(H, '🏠 놀이집', 16, 4.8, P.z2 + 0.4, 1, { lvl: 1, grp: 'house' });
  locker(H, P.x1 + 0.9, P.z1 + 0.9, 0xf08c00);
  locker(H, P.x2 - 0.9, P.z1 + 0.9, 0x4dabf7);
  box(13, 16, -29.5, -27, 0.5, 0x74c0fc, { tex: 'balls' });
  box(18, 20.5, -27, -25.5, 0.7, 0xd9480f);

  slideTower(H, -12, -18);
  jungle(H, -14, 8, 5);
  tunnel(H, -6, 0.5, -28);
  tunnel(H, 18, 24.5, 30, 0x37b24d);
  swing(H, -18, -10, 26);
  seesaw(H, -4, 2, 20);
  seesaw(H, 4, 10, 20);
  put({ k: 'merry', x: -2, z: 4, r: 2.2 });
  H.solid(-3.6, -0.4, 2.4, 5.6, 0.4);
  maze(H, 12, 4);
  box(30, 38, -33, -26, 3.5, 0x99c1de);
  sign(H, '🚻 화장실', 34, 4.4, -25.8, 0.9);
  bench(H, -25, -22, 30, 30.6);
  bench(H, 25, 28, -14, -13.4);
  for (const [bx, bz] of [[-30, 25], [-35, 15], [-20, -30], [36, -15], [36, -5], [2, -8], [-25, 15], [5, 32], [38, 30]]) bush(H, bx, bz);
  for (const [tx, tz] of [[-38, -30], [-38, 30], [0, -33], [8, 33], [-30, 33], [38, 0], [26, -20], [-20, 0]]) tree(H, tx, tz);
}

// ================= 🏢 아파트 (효성 해링턴코트 느낌: 낮은 계단식 빌라 + 공원) =================
// 빌라 한 동: 크림색 아래층 2개 + 뒤로 물러난 남색 위층 2개 + 경사 지붕 + 앞쪽 옥상 정원
// front = +1 이면 앞(정원)이 +z 쪽, -1 이면 -z 쪽
function villa(H, x1, x2, z1, z2, name, front = 1, o = {}) {
  const base = o.base ?? 0, low = 6, up = 6, depth = z2 - z1;
  const solid = o.solid !== false, extra = { lvl: o.lvl ?? null, grp: o.grp || null };
  if (o.skipLow !== true) H.box(x1, x2, z1, z2, low, 0xefe4cf, { ...extra, y: base, tex: 'villaLow', solid });
  // 위층은 뒤쪽 절반만 (앞은 옥상 정원)
  const uz1 = front > 0 ? z1 : z1 + depth * 0.45, uz2 = front > 0 ? z2 - depth * 0.45 : z2;
  H.box(x1 + 0.6, x2 - 0.6, uz1, uz2, up, 0x46546a, { ...extra, y: base + low, tex: 'villaUp', solid: false });
  H.put({ k: 'roof', x1: x1 + 0.2, x2: x2 - 0.2, z1: uz1 - 0.4, z2: uz2 + 0.4, y: base + low + up, h: 2.4, color: 0x4a4f57, ...extra });
  // 옥상 정원
  const gz1 = front > 0 ? uz2 : z1, gz2 = front > 0 ? z2 : uz1;
  H.put({ k: 'plane', x1: x1 + 0.2, x2: x2 - 0.2, z1: gz1 + 0.2, z2: gz2 - 0.2, y: base + low + 0.03, color: 0x6aa84f, ...extra });
  for (let x = x1 + 2; x < x2 - 1; x += 4) H.put({ k: 'bush', x, z: (gz1 + gz2) / 2, by: base + low - 0.3, ...extra });
  sign(H, name, (x1 + x2) / 2, base + low + up + 3, front > 0 ? z2 + 0.4 : z1 - 0.4, 2.2, extra);
}

// 집 한 채 (sx: -1 왼쪽, +1 오른쪽). u = 로비 벽에서 바깥쪽으로 거리
function home(H, sx, z1, z2, name) {
  const { box } = H, W = 0.3, WH = 4, g = { grp: 'apt', lvl: 0 };
  const X = (u1, u2) => (sx < 0 ? [-(3 + u2), -(3 + u1)] : [3 + u1, 3 + u2]);
  const B = (u1, u2, za, zb, h, col, o = {}) => { const [a, b] = X(u1, u2); box(a, b, za, zb, h, col, { ...g, ...o }); };
  const wall = 0xf8f9fa, inner = 0xfff4e6;
  // 바깥벽
  B(10.7, 11, z1, z2, WH, wall, { tex: 'win' });
  B(0.3, 10.7, z1, z1 + W, WH, wall);
  B(0.3, 10.7, z2 - W, z2, WH, wall, { tex: 'win' });
  // 바닥
  { const [a, b] = X(0.3, 10.7); H.put({ k: 'plane', x1: a, x2: b, z1, z2, y: 0.025, color: 0xd7b98e, grp: 'apt', lvl: 0 }); }
  // 방 (안쪽 깊은 곳) + 방문
  const zr = z1 + 6;
  B(5.5, 7.5, zr - W, zr, WH, inner); B(9.7, 10.7, zr - W, zr, WH, inner);
  B(7.5, 9.7, zr - W, zr, 1, inner, { y: WH - 1, solid: false });
  B(5.5, 5.8, z1 + W, zr - W, WH, inner);
  // 화장실 + 문
  const zb = z1 + 3.5;
  B(0.3, 2, zb - W, zb, WH, inner); B(4.2, 5.5, zb - W, zb, WH, inner);
  B(2, 4.2, zb - W, zb, 1, inner, { y: WH - 1, solid: false });
  // 가구
  B(8, 10.5, z1 + 0.5, z1 + 2.7, 0.55, 0xf783ac);                 // 침대
  B(9.9, 10.6, zr - 2.2, zr - 1, 0.75, 0x8d6e63);                // 책상
  { const [a, b] = X(6.3, 6.3); locker(H, (a + b) / 2, z1 + 0.95, 0x8d6e63, g); } // 옷장
  B(0.6, 2.4, z1 + 0.5, z1 + 2.4, 0.6, 0xffffff);                 // 욕조
  { const [a, b] = X(4.6, 4.6); curtain(H, (a + b) / 2, z1 + 1.0, { ...g, color: 0x99e9f2 }); } // 샤워커튼
  B(0.6, 4.5, zb + 0.3, zb + 1.0, 0.9, 0xdee2e6);                 // 주방
  B(4.6, 5.4, zb + 0.3, zb + 1.1, 1.9, 0xced4da);                 // 냉장고
  B(2, 4, z2 - 2, z2 - 1, 0.75, 0xa1887f);                        // 식탁
  B(6.5, 10, z2 - 1.6, z2 - 0.8, 0.5, 0x5c7cfa);                  // 소파
  B(6.5, 10, zr + 0.3, zr + 0.6, 0.6, 0x343a40);                  // TV장
  B(7, 9.5, zr + 0.35, zr + 0.45, 1.1, 0x111111, { y: 0.6, solid: false }); // TV
  const [a, b] = X(0, 0.3);
  sign(H, name, sx < 0 ? a - 0.3 : b + 0.3, 3.2, (z1 + z2) / 2 + 1.2, 0.7, g);
}

function apartment(H) {
  const { box, put, m } = H;
  m.bounds = { x1: -50, x2: 50, z1: -45, z2: 45 };
  m.jail = { x1: -47, x2: -38, z1: -6, z2: 4 };
  m.policeSpawn = { x1: -36, x2: -32, z1: -5, z2: 3 };
  m.robberSpawn = { x1: -20, x2: 48, z1: -30, z2: 30 };
  m.sky = 0xb3d9ff;
  ground(H, 0x8fbf6a);
  put({ k: 'plane', x1: -50, x2: 50, z1: -27, z2: -20, y: 0.01, color: 0x5c636a });
  put({ k: 'plane', x1: -26, x2: 26, z1: -20, z2: 0, y: 0.01, color: 0x6c757d });
  put({ k: 'plane', x1: 22, x2: 28, z1: -20, z2: 45, y: 0.012, color: 0x5c636a });
  boundary(H, 0x495057);
  jail(H);

  // 101동: 1층 로비와 집 2채에 들어갈 수 있어요
  const T = { x1: -14, x2: 14, z1: -42, z2: -30 }, W = 0.3, WH = 4, g = { grp: 'apt', lvl: 0 };
  m.indoors.push({ id: 'apt', ...T });
  put({ k: 'plane', x1: -3, x2: 3, z1: T.z1, z2: T.z2, y: 0.025, color: 0xe9ecef, grp: 'apt', lvl: 0 });
  for (const sx of [-1, 1]) {
    const x = sx * 3;
    box(x - W / 2, x + W / 2, T.z1, -34.4, WH, 0xdee2e6, g);
    box(x - W / 2, x + W / 2, -32.2, T.z2, WH, 0xdee2e6, g);
    box(x - W / 2, x + W / 2, -34.4, -32.2, 1, 0xdee2e6, { ...g, y: WH - 1, solid: false });
  }
  box(-3, 3, T.z1, T.z1 + W, WH, 0xdee2e6, g);
  box(-3, -1.5, T.z2 - W, T.z2, WH, 0x90a4ae, g);
  box(1.5, 3, T.z2 - W, T.z2, WH, 0x90a4ae, g);
  box(-1.5, 1.5, T.z2 - W, T.z2, 1, 0x90a4ae, { ...g, y: WH - 1, solid: false });
  box(-1.2, 1.2, T.z1 + W, T.z1 + 0.5, 2.4, 0xb0bec5, { ...g, solid: false }); // 엘리베이터
  box(1.6, 2.8, T.z1 + 0.3, T.z1 + 0.7, 1.6, 0x78909c, g);                    // 우편함
  home(H, -1, T.z1, T.z2, '101호');
  home(H, 1, T.z1, T.z2, '102호');
  // 2층부터 위는 밖에서만 보여요 (빌라 모양)
  box(T.x1, T.x2, T.z1, T.z2, 2, 0xefe4cf, { y: 4, solid: false, tex: 'villaLow', lvl: 1, grp: 'apt' });
  villa(H, T.x1, T.x2, T.z1, T.z2, '101동', 1, { base: 0, skipLow: true, solid: false, lvl: 1, grp: 'apt' });
  box(-4, 4, T.z2, T.z2 + 3, 0.4, 0x46546a, { y: 3.6, solid: false });       // 현관 지붕
  sign(H, '🚪 로비', 0, 4.6, T.z2 + 3.2, 0.8);

  // 계단식 빌라들
  villa(H, -48, -36, -43, -31, '102동');
  villa(H, -34, -22, -43, -31, '103동');
  villa(H, 22, 34, -43, -31, '104동');
  villa(H, 36, 48, -43, -31, '105동');
  villa(H, -48, -34, 32, 44, '106동', -1);
  villa(H, 30, 48, 32, 44, '107동', -1);

  // 공원: 연못, 동그란 광장, 벚꽃
  put({ k: 'pond', x: -20.5, z: 27, rx: 3.5, rz: 2.6 });
  H.solid(-23.5, -17.5, 25, 29, 0.5); // 연못은 걸어서 못 들어가요 (점프는 돼요)
  put({ k: 'plaza', x: -4, z: 23.5, r: 3.6 });
  for (const [tx, tz] of [[-27, 24], [-14, 26], [-9, 28], [-30, 18], [8, 4], [20, 4], [-36, 10]]) { put({ k: 'tree', x: tx, z: tz, color: 0xf8b4d9 }); H.solid(tx - 0.4, tx + 0.4, tz - 0.4, tz + 0.4, 5); }
  // 뒤쪽 산
  for (const [mx, mz, r, h, col] of [[-140, -150, 70, 55, 0x7e9c8a], [-40, -170, 80, 70, 0x6d8f7a], [70, -160, 75, 60, 0x7e9c8a], [160, -120, 60, 45, 0x86a392], [-160, 60, 60, 40, 0x86a392]]) put({ k: 'mountain', x: mx, z: mz, r, h, color: col });

  // 편의점
  const P = { x1: -12, x2: 6, z1: 30, z2: 42 }, sw = 0xdee2e6, s = { grp: 'store', lvl: 0 };
  m.indoors.push({ id: 'store', ...P });
  put({ k: 'plane', ...P, y: 0.02, color: 0xf8f9fa, grp: 'store', lvl: 0 });
  box(P.x1, -5.2, P.z1, P.z1 + W, WH, sw, { ...s, tex: 'shop' });
  box(-2.8, P.x2, P.z1, P.z1 + W, WH, sw, { ...s, tex: 'shop' });
  box(-5.2, -2.8, P.z1, P.z1 + W, 1, sw, { ...s, y: WH - 1, solid: false });
  box(P.x1, P.x1 + W, P.z1, P.z2, WH, sw, s);
  box(P.x2 - W, P.x2, P.z1, 34, WH, sw, s);
  box(P.x2 - W, P.x2, 36.4, P.z2, WH, sw, s);
  box(P.x2 - W, P.x2, 34, 36.4, 1, sw, { ...s, y: WH - 1, solid: false });
  box(P.x1, P.x2, P.z2 - W, P.z2, WH, sw, s);
  box(P.x1 - 0.3, P.x2 + 0.3, P.z1 - 0.3, P.z2 + 0.3, 0.5, 0x2b8a3e, { y: WH, solid: false, lvl: 1, grp: 'store' });
  sign(H, '🏪 편의점', -3, 4.9, P.z1 - 0.4, 1.2, { lvl: 1, grp: 'store' });
  for (const z of [33.5, 36]) box(-10, -2, z, z + 0.6, 1.6, 0xfab005, { ...s, tex: 'snacks' });
  box(2, 5, 31.5, 32.3, 1.1, 0x495057, s);
  box(-11.7, -10.3, 37, 41.7, 2, 0xa5d8ff, s);
  box(-0.5, 0.2, 38.5, P.z2 - W, WH, sw, s);
  box(0.2, 1.2, 38.2, 38.5, WH, sw, s);
  box(3.6, P.x2 - W, 38.2, 38.5, WH, sw, s);
  box(1.2, 3.6, 38.2, 38.5, 1, sw, { ...s, y: WH - 1, solid: false });
  box(0.6, 2.2, 39.5, 41.4, 1.2, 0xc8955a, s);
  locker(H, 4.9, 40.9, 0xc8955a, s);

  // 주차장
  const colors = [0xe03131, 0x1971c2, 0xf8f9fa, 0x212529, 0xfab005, 0x2f9e44, 0xadb5bd];
  let ci = 0;
  for (let i = 0; i < 10; i++) {
    const x = -22 + i * 4.8;
    if (i !== 3 && i !== 7) car(H, x, -18.5, colors[ci++ % colors.length]);
    if (i !== 1 && i !== 5 && i !== 8) car(H, x, -6.5, colors[ci++ % colors.length]);
  }
  put({ k: 'parking', x1: -24.4, x2: 24, z1: -18.8, z2: -1.8 });

  box(-30, -26, 8, 12, 3, 0xced4da);
  sign(H, '경비실', -28, 3.7, 12.4, 0.8);
  box(30, 38, -8, -7.7, 1.5, 0x868e96);
  for (const [bx, col] of [[31.5, 0x2f9e44], [34, 0x1971c2], [36.5, 0xfab005]]) locker(H, bx, -7, col);
  sign(H, '♻️ 분리수거', 34, 2.6, -7.6, 0.8);
  put({ k: 'pavilion', x1: -16, x2: -8, z1: 14, z2: 22 });
  for (const [px, pz] of [[-16, 14], [-8, 14], [-16, 22], [-8, 22]]) H.solid(px - 0.2, px + 0.2, pz - 0.2, pz + 0.2, 3.2);
  H.solid(-16.5, -7.5, 13.5, 22.5, 5, 3.2); // 정자 지붕 (카메라가 지붕 속으로 안 들어가게)
  bench(H, -14, -10, 17.7, 18.3);

  put({ k: 'plane', x1: 0, x2: 20, z1: 8, z2: 26, y: 0.012, color: 0xe6c891 });
  slideTower(H, 2, 10);
  swing(H, 11, 18, 22);
  tunnel(H, 12, 18, 14);

  for (const [bx, bz] of [[-45, 20], [-45, 28], [-20, 8], [-20, 40], [12, 40], [48, 10], [48, 0], [-35, -15], [10, 2], [20, -29]]) bush(H, bx, bz);
  for (const [tx, tz] of [[-30, -16], [-30, 0], [30, -16], [30, 0], [-40, 25], [15, 30], [35, 20], [45, 25], [-5, 15], [-20, -29], [17, -29]]) tree(H, tx, tz);
}

const BUILDERS = { school, playground, apartment };

// ================= 길찾기 / 충돌 도우미 =================
function finish(m) {
  const J = m.jail, F = 0.15, B = m.bounds, CELL = 0.5, L = m.levels;
  m.FENCE = F;
  m.jailIn = { x1: J.x1 + F + R, x2: J.x2 - F - R, z1: J.z1 + F + R, z2: J.z2 - F - R };
  m.jailC = { x: (J.x1 + J.x2) / 2, z: (J.z1 + J.z2) / 2 };
  const obs = m.obstacles;

  // 높이 y1~y2 사이에 막힌 게 있는지
  m.pointBlocked = (x, z, mg, y1 = STEP, y2 = BODY) => {
    for (const o of obs) if (o.h > y1 && o.y0 < y2 && x > o.x1 - mg && x < o.x2 + mg && z > o.z1 - mg && z < o.z2 + mg) return true;
    return false;
  };
  m.solidAt = (x, z, y) => {
    for (const o of obs) if (y >= o.y0 && y <= o.h && x > o.x1 && x < o.x2 && z > o.z1 && z < o.z2) return true;
    return false;
  };
  m.inJail = (x, z, mg = 0) => x > J.x1 - mg && x < J.x2 + mg && z > J.z1 - mg && z < J.z2 + mg;
  // 발 밑 높이: y보다 낮은 바닥 중 제일 높은 것
  m.groundAt = (x, z, y) => {
    let g = 0; const r = R * 0.6;
    for (const o of obs) if (o.h <= y + 0.06 && o.h > g && x > o.x1 - r && x < o.x2 + r && z > o.z1 - r && z < o.z2 + r) g = o.h;
    return g;
  };
  // 머리 위 천장
  m.ceilAt = (x, z, y) => {
    let c = Infinity; const r = R * 0.6;
    for (const o of obs) if (o.y0 >= y - 0.01 && o.y0 < c && x > o.x1 - r && x < o.x2 + r && z > o.z1 - r && z < o.z2 + r) c = o.y0;
    return c;
  };
  m.indoorAt = (x, z) => {
    for (const d of m.indoors) if (x > d.x1 && x < d.x2 && z > d.z1 && z < d.z2) return d.id;
    return null;
  };
  m.lowCamAt = (x, z) => {
    for (const d of m.lowCam) if (x > d.x1 && x < d.x2 && z > d.z1 && z < d.z2) return d.maxY;
    return Infinity;
  };
  // 눈에서 눈까지 진짜로 보이는지 (3D, 벽·울타리·바닥에 막히면 false)
  m.sightClear = (x1, y1, z1, x2, y2, z2) => {
    const d = Math.hypot(x2 - x1, y2 - y1, z2 - z1), n = Math.ceil(d / 0.5);
    for (let k = 1; k < n; k++) {
      const t = k / n;
      if (m.solidAt(x1 + (x2 - x1) * t, z1 + (z2 - z1) * t, y1 + (y2 - y1) * t)) return false;
    }
    return true;
  };
  m.levelOf = (y) => {
    for (let i = 0; i < L.length; i++) if (Math.abs(y - L[i]) < 1) return i;
    return -1;
  };

  const GW = Math.round((B.x2 - B.x1) / CELL), GH = Math.round((B.z2 - B.z1) / CELL);
  const grids = L.map((Ly, lv) => {
    const grid = new Uint8Array(GW * GH);
    for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
      const x = B.x1 + (i + 0.5) * CELL, z = B.z1 + (j + 0.5) * CELL;
      let bad = m.pointBlocked(x, z, R + 0.02, Ly + STEP, Ly + BODY);
      if (lv === 0) bad = bad || m.inJail(x, z, 0.2);
      else if (!bad) for (const [dx, dz] of [[0, 0], [0.3, 0.3], [-0.3, 0.3], [0.3, -0.3], [-0.3, -0.3]]) {
        if (Math.abs(m.groundAt(x + dx, z + dz, Ly + 0.1) - Ly) > 0.1) { bad = true; break; }
      }
      grid[j * GW + i] = bad ? 1 : 0;
    }
    return grid;
  });
  const clampI = (v, a, b) => Math.max(a, Math.min(b, v));
  const cellOf = (x, z) => clampI(Math.floor((z - B.z1) / CELL), 0, GH - 1) * GW + clampI(Math.floor((x - B.x1) / CELL), 0, GW - 1);

  // 갈 수 없는 칸(막힌 방 안 등)은 막힌 칸으로 표시해서 AI가 헛걸음 안 하게
  {
    const seenC = grids.map(() => new Uint8Array(GW * GH));
    const queue = [];
    const add = (lv, c) => { if (c >= 0 && !grids[lv][c] && !seenC[lv][c]) { seenC[lv][c] = 1; queue.push(lv, c); } };
    const sp = m.policeSpawn;
    add(0, cellOf((sp.x1 + sp.x2) / 2, (sp.z1 + sp.z2) / 2));
    for (let q = 0; q < queue.length; q += 2) {
      const lv = queue[q], c = queue[q + 1], ci = c % GW, cj = (c - ci) / GW;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const i = ci + di, j = cj + dj;
        if (i >= 0 && j >= 0 && i < GW && j < GH) add(lv, j * GW + i);
      }
      for (const s of m.stairs) {
        const ca = cellOf(s.a.x, s.a.z), cb = cellOf(s.b.x, s.b.z);
        if (lv === s.a.lv && c === ca) add(s.b.lv, cb);
        if (lv === s.b.lv && c === cb) add(s.a.lv, ca);
      }
    }
    grids.forEach((g, lv) => { for (let c = 0; c < g.length; c++) if (!seenC[lv][c]) g[c] = 1; });
  }
  const cellX = (c) => B.x1 + ((c % GW) + 0.5) * CELL;
  const cellZ = (c) => B.z1 + (Math.floor(c / GW) + 0.5) * CELL;
  m.blockedAt = (x, z, lv = 0) => grids[lv][cellOf(x, z)] === 1;

  const nearestFree = (grid, c) => {
    if (!grid[c]) return c;
    const ci = c % GW, cj = Math.floor(c / GW);
    for (let r = 1; r < 12; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (Math.abs(di) !== r && Math.abs(dj) !== r) continue;
      const i = ci + di, j = cj + dj;
      if (i < 0 || j < 0 || i >= GW || j >= GH) continue;
      if (!grid[j * GW + i]) return j * GW + i;
    }
    return -1;
  };

  m.los = (x1, z1, x2, z2, lv = 0) => {
    const Ly = L[lv] || 0, d = Math.hypot(x2 - x1, z2 - z1), n = Math.ceil(d / 0.5);
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      if (m.pointBlocked(x1 + (x2 - x1) * t, z1 + (z2 - z1) * t, R - 0.08, Ly + STEP, Ly + BODY)) return false;
    }
    return true;
  };

  const gScore = new Float32Array(GW * GH), came = new Int32Array(GW * GH);
  const seen = new Uint32Array(GW * GH), closed = new Uint32Array(GW * GH);
  let sid = 0;
  const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
  const push = (h, f, c) => {
    h.push([f, c]); let i = h.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (h[p][0] <= h[i][0]) break; [h[p], h[i]] = [h[i], h[p]]; i = p; }
  };
  const pop = (h) => {
    const top = h[0], last = h.pop();
    if (h.length) {
      h[0] = last; let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let mm = i;
        if (l < h.length && h[l][0] < h[mm][0]) mm = l;
        if (r < h.length && h[r][0] < h[mm][0]) mm = r;
        if (mm === i) break;
        [h[mm], h[i]] = [h[i], h[mm]]; i = mm;
      }
    }
    return top[1];
  };

  // 한 층 안에서 길찾기
  const gridPath = (lv, sx, sz, tx, tz) => {
    const grid = grids[lv];
    const s = nearestFree(grid, cellOf(sx, sz)), t = nearestFree(grid, cellOf(tx, tz));
    if (s < 0 || t < 0) return null;
    sid++;
    const ti = t % GW, tj = Math.floor(t / GW);
    const h = (c) => { const dx = Math.abs(c % GW - ti), dz = Math.abs(Math.floor(c / GW) - tj); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
    const heap = [];
    gScore[s] = 0; seen[s] = sid; came[s] = -1;
    push(heap, h(s), s);
    let steps = 0;
    while (heap.length && steps++ < 40000) {
      const c = pop(heap);
      if (c === t) break;
      if (closed[c] === sid) continue;
      closed[c] = sid;
      const ci = c % GW, cj = (c - ci) / GW;
      for (const [di, dj, cost] of DIRS) {
        const i = ci + di, j = cj + dj;
        if (i < 0 || j < 0 || i >= GW || j >= GH) continue;
        const n = j * GW + i;
        if (grid[n]) continue;
        if (di && dj && (grid[cj * GW + i] || grid[j * GW + ci])) continue;
        const g = gScore[c] + cost;
        if (seen[n] !== sid || g < gScore[n]) { seen[n] = sid; gScore[n] = g; came[n] = c; push(heap, g + h(n), n); }
      }
    }
    if (seen[t] !== sid) return null;
    const cells = [];
    for (let c = t; c !== -1; c = came[c]) cells.push(c);
    cells.reverse();
    const pts = cells.map((c) => ({ x: cellX(c), z: cellZ(c), lv }));
    if (t === cellOf(tx, tz)) pts[pts.length - 1] = { x: tx, z: tz, lv };
    const out = [];
    let i = 0, cur = { x: sx, z: sz };
    while (i < pts.length - 1) {
      let j = Math.min(pts.length - 1, i + 24);
      while (j > i + 1 && !m.los(cur.x, cur.z, pts[j].x, pts[j].z, lv)) j--;
      out.push(pts[j]); cur = pts[j]; i = j;
    }
    if (!out.length) out.push(pts[pts.length - 1]);
    return out;
  };

  // 층이 다르면 계단을 거쳐서 가요
  m.findPath = (sx, sz, slv, tx, tz, tlv) => {
    if (slv < 0) slv = 0;
    if (tlv < 0) tlv = 0;
    if (slv === tlv) return gridPath(slv, sx, sz, tx, tz);
    const out = [];
    let cx = sx, cz = sz, lv = slv;
    while (lv !== tlv) {
      const up = tlv > lv;
      const st = m.stairs.find((s) => (up ? s.a.lv === lv : s.b.lv === lv));
      if (!st) return null;
      const from = up ? st.a : st.b, to = up ? st.b : st.a;
      const p = gridPath(lv, cx, cz, from.x, from.z);
      if (!p) return null;
      out.push(...p, { x: from.x, z: from.z, lv }, { x: to.x, z: to.z, lv: to.lv, stair: true });
      cx = to.x; cz = to.z; lv = to.lv;
    }
    const last = gridPath(lv, cx, cz, tx, tz);
    if (!last) return null;
    out.push(...last);
    return out;
  };

  m.randomFreePoint = (rc = null, lv = 0) => {
    rc = rc || { x1: B.x1 + 1, x2: B.x2 - 1, z1: B.z1 + 1, z2: B.z2 - 1 };
    for (let k = 0; k < 150; k++) {
      const x = rc.x1 + Math.random() * (rc.x2 - rc.x1), z = rc.z1 + Math.random() * (rc.z2 - rc.z1);
      if (!grids[lv][cellOf(x, z)]) return { x, z, lv };
    }
    return lv === 0 ? { x: (B.x1 + B.x2) / 2, z: (B.z1 + B.z2) / 2, lv: 0 } : m.randomFreePoint(rc, 0);
  };
  // 위층 건물 안쪽에서 고르기
  m.randomAnyLevel = () => {
    if (L.length === 1 || Math.random() < 0.55) return m.randomFreePoint();
    const lv = 1 + Math.floor(Math.random() * (L.length - 1));
    const d = m.indoors[0];
    return m.randomFreePoint(lv === L.length - 1 ? { x1: d.x1 - 1, x2: d.x2 + 6, z1: d.z1, z2: d.z2 } : { x1: d.x1, x2: d.x2 + 6, z1: d.z1, z2: d.z2 }, lv);
  };

  const o = F + R + 0.9;
  const ring = [[J.x2 + o, J.z1 - o], [J.x2 + o, m.jailC.z], [J.x2 + o, J.z2 + o], [m.jailC.x, J.z2 + o], [J.x1 - o, J.z2 + o], [J.x1 - o, m.jailC.z], [J.x1 - o, J.z1 - o], [m.jailC.x, J.z1 - o]];
  m.patrol = ring.filter(([x, z]) => x > B.x1 + 1 && x < B.x2 - 1 && z > B.z1 + 1 && z < B.z2 - 1 && !m.blockedAt(x, z));
  for (const hz of m.hideZones) {
    hz.lv = Math.max(0, m.levelOf(hz.y));
    hz.ok = nearestFree(grids[hz.lv], cellOf(hz.x, hz.z)) >= 0;
  }
}
