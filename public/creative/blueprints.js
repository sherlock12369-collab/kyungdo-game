// 📖 설명서: 미리 만들어 둔 건물 그림 + 자동으로 짓기
// 건물 안의 위치: x = 옆(왼쪽 -, 오른쪽 +), y = 위 (0 = 땅 바로 위 칸), z = 앞으로 (0 = 나랑 제일 가까운 줄)
// 문이나 앞쪽은 z = 0 쪽에 있어요 (나를 보고 있어요).
import { ID } from './blocks.js';
import { SX, SY, SZ } from './voxel.js';

// 블럭 모으는 도구 (나중에 쓴 블럭이 먼저 쓴 블럭을 덮어요, 0 = 빈칸으로 파내기)
function plan() {
  const m = new Map();
  const k = (x, y, z) => x + ',' + y + ',' + z;
  const p = {
    put(x, y, z, id) { m.set(k(x, y, z), [x, y, z, id]); },
    box(x0, y0, z0, x1, y1, z1, id) {
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
        for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++)
          for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) p.put(x, y, z, id);
    },
    // 속이 빈 벽 (위아래 뚜껑 없음)
    walls(x0, y0, z0, x1, y1, z1, id) {
      for (let y = y0; y <= y1; y++)
        for (let z = z0; z <= z1; z++)
          for (let x = x0; x <= x1; x++) if (x === x0 || x === x1 || z === z0 || z === z1) p.put(x, y, z, id);
    },
    has: (x, y, z) => m.has(k(x, y, z)),
    list: () => [...m.values()],
  };
  return p;
}

// ---------------- 🏠 집 ----------------
function house() {
  const p = plan();
  p.box(-3, -1, 0, 3, -1, 6, ID.cobble);          // 바닥 (땅 속에)
  p.box(-2, -1, 1, 2, -1, 5, ID.planks);           // 나무 바닥
  p.walls(-3, 0, 0, 3, 3, 6, ID.planks);           // 벽
  for (const x of [-3, 3]) for (const z of [0, 6]) p.box(x, 0, z, x, 3, z, ID.log); // 기둥
  p.box(-3, 0, 0, 3, 0, 6, ID.cobble); p.box(-2, 0, 1, 2, 0, 5, 0); // 아래쪽 돌 줄
  p.box(-3, 3, 0, 3, 3, 6, ID.log); p.box(-2, 3, 1, 2, 3, 5, 0);   // 위쪽 통나무 줄
  p.box(-2, 0, 1, 2, 3, 5, 0);                     // 안은 비워요
  // 창문
  p.box(-2, 1, 0, -1, 2, 0, ID.glass); p.box(1, 1, 0, 2, 2, 0, ID.glass);
  for (const x of [-3, 3]) { p.box(x, 1, 2, x, 2, 2, ID.glass); p.box(x, 1, 4, x, 2, 4, ID.glass); }
  p.box(-1, 1, 6, 1, 2, 6, ID.glass);
  // 문 (구멍)
  p.box(0, 0, 0, 0, 2, 0, 0);
  p.put(0, 3, -1, ID.lamp);                        // 문 위 등불
  // 지붕 (계단 모양 벽돌)
  for (let i = 0; i <= 4; i++) {
    const y = 4 + i, w = 4 - i;
    for (let z = -1; z <= 7; z++) {
      if (w > 0) { p.put(-w, y, z, ID.brick); p.put(w, y, z, ID.brick); }
      else p.put(0, y, z, ID.red);               // 꼭대기 줄
    }
    for (const z of [0, 6]) for (let x = -w + 1; x <= w - 1; x++) p.put(x, y, z, ID.planks); // 앞뒤 세모 벽
  }
  p.put(0, 5, 0, ID.glass);                         // 다락방 창문
  // 안: 등불, 책장, 침대
  p.put(0, 4, 3, ID.lamp);
  p.box(-2, 0, 5, -1, 1, 5, ID.books);
  p.put(2, 0, 4, ID.red); p.put(2, 0, 5, ID.white);
  // 앞마당 길
  p.box(0, -1, -3, 0, -1, -1, ID.gravel);
  return p.list();
}

// ---------------- 🌳 나무 ----------------
function tree() {
  const p = plan();
  const cz = 3;
  for (let y = 3; y <= 8; y++) {
    const r = y <= 4 ? 2.6 : y <= 6 ? 2.9 : y === 7 ? 2 : 1.2;
    for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
      const d = Math.hypot(dx, dz);
      if (d <= r && !(d > r - 0.6 && ((dx * 7 + dz * 3 + y) % 3 === 0))) p.put(dx, y, cz + dz, ID.leaves);
    }
  }
  p.box(0, 0, cz, 0, 6, cz, ID.log);              // 줄기
  p.put(1, 0, cz, ID.log); p.put(-1, 0, cz + 1, ID.log); // 뿌리
  p.put(2, 4, cz, ID.log); p.put(-2, 5, cz - 1, ID.log); // 가지
  p.put(1, 2, cz - 1, ID.red); p.put(-1, 3, cz + 2, ID.red); p.put(2, 3, cz + 2, ID.red); // 사과
  return p.list();
}

// ---------------- 🗼 탑 (안에 빙글빙글 계단) ----------------
function tower() {
  const p = plan();
  const H = 14, cz = 2;                               // 벽 높이, 가운데 z
  p.box(-2, -1, 0, 2, -1, 4, ID.cobble);
  p.walls(-2, 0, 0, 2, H, 4, ID.stone);
  for (const x of [-2, 2]) for (const z of [0, 4]) p.box(x, 0, z, x, H, z, ID.cobble);
  p.box(-1, 0, 1, 1, H, 3, 0);                        // 속 비우기
  p.box(0, 0, cz, 0, H - 1, cz, ID.cobble);           // 가운데 기둥
  // 계단: 가운데 기둥을 빙 둘러서 한 칸씩 올라가요 (문 앞 칸부터)
  const ring = [[0, 1], [1, 1], [1, 2], [1, 3], [0, 3], [-1, 3], [-1, 2], [-1, 1]];
  for (let y = 0; y < H; y++) { const [x, z] = ring[y % 8]; p.put(x, y, z, ID.planks); }
  // 꼭대기 바닥 (계단 올라오는 곳은 구멍)
  const last = H - 1;
  for (const [x, z] of ring) {
    const i = ring.findIndex((c) => c[0] === x && c[1] === z);
    const hole = [last, last - 1, last - 2, last - 3].some((s) => s % 8 === i);
    if (!hole) p.put(x, H, z, ID.planks);
  }
  p.put(0, H, cz, ID.planks);
  // 문, 창문
  p.box(0, 0, 0, 0, 1, 0, 0);
  for (const y of [4, 8, 11]) { p.put(0, y, 0, ID.glass); p.put(0, y, 4, ID.glass); p.put(-2, y, cz, ID.glass); p.put(2, y, cz, ID.glass); }
  // 꼭대기 울타리 (뾰족뾰족)
  for (let z = 0; z <= 4; z++) for (let x = -2; x <= 2; x++) {
    if (x !== -2 && x !== 2 && z !== 0 && z !== 4) continue;
    if ((x + z) % 2 === 0) p.put(x, H + 1, z, ID.stone);
  }
  for (const x of [-2, 2]) for (const z of [0, 4]) { p.put(x, H + 1, z, ID.cobble); p.put(x, H + 2, z, ID.lamp); }
  // 깃발
  p.box(0, H + 1, cz + 2, 0, H + 4, cz + 2, ID.log);
  p.box(1, H + 3, cz + 2, 2, H + 4, cz + 2, ID.blue);
  return p.list();
}

// ---------------- 🌉 다리 (연못 위 무지개 모양) ----------------
function bridge() {
  const p = plan();
  const L = 15, prof = [0, 1, 1, 2, 2, 3, 3, 3, 3, 3, 2, 2, 1, 1, 0];
  // 연못
  for (let z = 2; z <= L - 3; z++) for (let x = -5; x <= 5; x++) {
    const edge = x === -5 || x === 5 || z === 2 || z === L - 3;
    if (edge) { p.put(x, -1, z, ID.sand); continue; }
    p.put(x, -1, z, ID.water); p.put(x, -2, z, ID.water); p.put(x, -3, z, ID.sand);
  }
  for (let z = 0; z < L; z++) {
    const h = prof[z];
    p.box(-1, h - 1, z, 1, h - 1, z, ID.planks);    // 다리 바닥
    if (h >= 2) p.box(-1, h - 2, z, 1, h - 2, z, 0); // 밑은 비워요
    for (const x of [-2, 2]) {
      p.put(x, h - 1, z, ID.log);                    // 옆 테두리
      if (z % 2 === 0) p.put(x, h, z, ID.log);       // 난간 기둥
      else p.put(x, h, z, ID.planks);
    }
  }
  for (const x of [-2, 2]) for (const z of [0, L - 1]) p.put(x, prof[z] + 1, z, ID.lamp);
  p.put(-2, prof[7] + 1, 7, ID.lamp); p.put(2, prof[7] + 1, 7, ID.lamp);
  // 다리 받침 기둥
  for (const z of [4, 10]) for (const x of [-2, 2]) p.box(x, -3, z, x, prof[z] - 2, z, ID.cobble);
  return p.list();
}

// ---------------- 🛒 카트 ----------------
function cart() {
  const p = plan();
  p.box(-1, 1, 1, 1, 1, 5, ID.iron);                  // 바닥
  p.walls(-1, 2, 1, 1, 2, 5, ID.red);                 // 옆
  for (const x of [-1, 1]) for (const z of [1, 5]) p.put(x, 2, z, ID.yellow); // 모서리
  p.put(0, 2, 3, ID.gold); p.put(0, 2, 2, ID.gem); p.put(0, 2, 4, ID.gold); // 보물!
  for (const x of [-2, 2]) for (const z of [2, 4]) p.put(x, 0, z, ID.black); // 바퀴
  p.box(-1, 0, 2, 1, 0, 2, ID.iron); p.box(-1, 0, 4, 1, 0, 4, ID.iron);     // 바퀴 축
  p.put(-1, 2, 0, ID.iron); p.put(1, 2, 0, ID.iron);  // 손잡이
  p.put(-1, 3, -1, ID.iron); p.put(1, 3, -1, ID.iron); p.put(0, 3, -1, ID.brown); // 손잡이 막대
  return p.list();
}

// ---------------- 🏰 성 ----------------
function castle() {
  const p = plan();
  const W = 7, D = 14, WH = 5, TH = 8;                // 반 너비, 깊이, 벽 높이, 탑 높이
  p.box(-W, -1, 0, W, -1, D, ID.cobble);
  p.box(-W + 1, -1, 1, W - 1, -1, D - 1, ID.grass);   // 마당
  p.walls(-W, 0, 0, W, WH - 1, D, ID.stone);
  // 벽 위 뾰족뾰족
  for (let z = 0; z <= D; z++) for (let x = -W; x <= W; x++) {
    if (x !== -W && x !== W && z !== 0 && z !== D) continue;
    if ((x + z) % 2 === 0) p.put(x, WH, z, ID.stone);
  }
  // 모서리 탑
  for (const cx of [-W, W]) for (const cz of [0, D]) {
    p.box(cx - 1, 0, cz - 1, cx + 1, TH - 1, cz + 1, ID.cobble);
    p.box(cx - 1, TH, cz - 1, cx + 1, TH, cz + 1, ID.stone);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.put(cx + dx, TH + 1, cz + dz, ID.stone);
    p.put(cx, TH + 1, cz, ID.lamp);
    for (const y of [3, 6]) { p.put(cx, y, cz - 1, ID.glass); p.put(cx, y, cz + 1, ID.glass); }
  }
  // 문 (3칸 넓이)
  p.box(-1, 0, 0, 1, 2, 0, 0);
  p.put(-1, 3, 0, ID.cobble); p.put(0, 3, 0, ID.cobble); p.put(1, 3, 0, ID.cobble);
  p.put(-2, 2, -1, ID.lamp); p.put(2, 2, -1, ID.lamp);
  p.box(-1, -1, -3, 1, -1, -1, ID.gravel);           // 길
  p.box(0, -1, 1, 0, -1, 7, ID.gravel);
  // 가운데 큰 집 (왕 집)
  const kz0 = 8, kz1 = 12;
  p.box(-3, 0, kz0, 3, 6, kz1, ID.brick);
  p.box(-2, 0, kz0 + 1, 2, 5, kz1 - 1, 0);
  p.box(0, 0, kz0, 0, 2, kz0, 0);                     // 문
  for (const x of [-2, 2]) p.box(x, 2, kz0, x, 3, kz0, ID.glass);
  p.box(-1, 5, kz0, 1, 5, kz0, ID.glass);
  p.box(-3, 7, kz0, 3, 7, kz1, ID.marble);            // 지붕
  for (let z = kz0; z <= kz1; z++) for (let x = -3; x <= 3; x++) if ((x === -3 || x === 3 || z === kz0 || z === kz1) && (x + z) % 2 === 0) p.put(x, 8, z, ID.marble);
  p.put(0, 4, kz0 + 2, ID.lamp);
  p.put(0, 0, kz1 - 1, ID.gold);                      // 왕 의자
  p.put(0, 1, kz1 - 1, ID.gold);
  // 깃발
  p.box(0, 8, kz0 + 2, 0, 12, kz0 + 2, ID.log);
  p.box(1, 11, kz0 + 2, 3, 12, kz0 + 2, ID.red);
  p.put(2, 11, kz0 + 2, ID.yellow);
  return p.list();
}

// ---------------- ⛲ 분수 ----------------
function fountain() {
  const p = plan();
  const cz = 4;
  for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) {
    const d = Math.max(Math.abs(dx), Math.abs(dz));
    if (d === 4) { p.put(dx, -1, cz + dz, ID.gravel); continue; }     // 둘레 길
    if (d === 3) { p.put(dx, -1, cz + dz, ID.marble); p.put(dx, 0, cz + dz, ID.marble); continue; } // 테두리
    p.put(dx, -1, cz + dz, ID.sky);                   // 물 밑바닥
    p.put(dx, 0, cz + dz, ID.water);
  }
  for (const dx of [-3, 3]) for (const dz of [-3, 3]) p.put(dx, 1, cz + dz, ID.lamp);
  p.box(0, 0, cz, 0, 2, cz, ID.marble);              // 가운데 기둥
  p.box(-1, 3, cz - 1, 1, 3, cz + 1, ID.marble);     // 위 그릇
  for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) p.put(dx, 4, cz + dz, ID.marble);
  p.put(0, 4, cz, ID.water); p.put(0, 5, cz, ID.water); p.put(0, 6, cz, ID.water); // 솟는 물
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { p.put(dx, 4, cz + dz, ID.water); p.put(dx * 2, 2, cz + dz * 2, ID.water); p.put(dx * 2, 1, cz + dz * 2, ID.water); }
  for (const [dx, dz] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) p.put(dx, 1, cz + dz, ID.water);
  return p.list();
}

export const BLUEPRINTS = [
  { key: 'house', icon: '🏠', name: '집', make: house },
  { key: 'tree', icon: '🌳', name: '나무', make: tree },
  { key: 'tower', icon: '🗼', name: '탑', make: tower },
  { key: 'bridge', icon: '🌉', name: '다리', make: bridge },
  { key: 'cart', icon: '🛒', name: '카트', make: cart },
  { key: 'castle', icon: '🏰', name: '성', make: castle },
  { key: 'fountain', icon: '⛲', name: '분수', make: fountain },
];

// 바라보는 방향(yaw) → 앞쪽 방향 0:+z 1:+x 2:-z 3:-x
export function dirFromYaw(yaw) {
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  if (Math.abs(fx) > Math.abs(fz)) return fx > 0 ? 1 : 3;
  return fz > 0 ? 0 : 2;
}
const FWD = [[0, 1], [1, 0], [0, -1], [-1, 0]];

// 짓기: 한 화면마다 조금씩 (perFrame개) 놓아서 천천히 올라가요. 그만두려면 .stop()
export function build(bp, ox, oy, oz, dir, editFn, perFrame = 40, onDone) {
  const [fx, fz] = FWD[((dir % 4) + 4) % 4];
  const rx = -fz, rz = fx;                         // 오른쪽 방향
  const list = bp.make().map(([x, y, z, id]) => [ox + x * rx + z * fx, oy + y, oz + x * rz + z * fz, id])
    .filter(([x, y, z]) => x >= 0 && z >= 0 && x < SX && z < SZ && y >= 1 && y < SY);
  // 아래부터, 가까운 쪽부터. 파내는 칸(0)은 같은 층에서 먼저
  list.sort((a, b) => a[1] - b[1] || (a[3] === 0 ? 0 : 1) - (b[3] === 0 ? 0 : 1));
  let i = 0, stopped = false;
  const step = () => {
    if (stopped) return;
    for (let n = 0; n < perFrame && i < list.length; i++) if (editFn(list[i][0], list[i][1], list[i][2], list[i][3])) n++;
    if (i < list.length) requestAnimationFrame(step);
    else if (onDone) onDone();
  };
  requestAnimationFrame(step);
  return { stop() { stopped = true; }, get left() { return list.length - i; }, total: list.length };
}
