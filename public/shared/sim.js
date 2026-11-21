// 게임 규칙 + AI — 브라우저(AI랑 하기)와 서버(친구랑 하기)가 같이 써요
import { R, BODY, STEP, getMap } from './map.js';

export const CFG = {
  time: 180,          // 한 판 3분
  catchRange: 2.2,    // 잡기 거리
  catchUp: 2.6,       // 위에 올라간 도둑도 막대로 닿는 높이
  rescueRange: 2.0,   // 풀기(손 터치) 거리
  policeSpeed: 5.2,
  robberSpeed: 5.0,
  sprintSpeed: 8.5,
  sprintTime: 5,      // 5초 달리기
  aiPolice: 0.8,      // AI 경찰은 사람보다 느리게
  aiRobber: 0.95,
  invuln: 2.5,        // 풀려난 뒤 잠깐 안 잡힘
  gravity: 26,
  jumpV: 8.6,         // 점프 (약 1.4m)
  gunCd: 3,           // 총 쿨타임 3초
  stunTime: 2,        // 총 맞으면 2초 기절
  policeWait: 5,      // 경찰은 5초 뒤에 출발
  // 🔫 리볼버: 가까이, 자동 조준 / 🔫AK: 걸으면서 0.5초에 1발, 100발 쏘면 10초 장전 (AK는 못 잡아요)
  revolver: { speed: 40, life: 0.4, assist: 0.45, range: 15 },
  ak: { speed: 55, life: 0.45, assist: 0.22, range: 24, fireCd: 0.5, mag: 100, reload: 10 },
};

export const NAMES = ['민준', '서연', '하준', '지우', '도윤', '서윤', '시우', '하은', '주원', '지호', '예준', '수아', '유찬', '채원', '은우', '지안',
  '이준', '다은', '선우', '예린', '건우', '소율', '우진', '하린', '현우', '지아', '준서', '서아', '연우', '윤서', '정우', '아린', '승민', '가은'];
export const MAX_PLAYERS = 30;
export const EMOTES = ['👋', '😂', '😱', '🙏', '😎', '💢'];

// 인원별 경찰 수 (7명은 8명이랑 같음). 10명 넘으면 3명 중 1명이 경찰
export function policeCount(n) { return n <= 4 ? 1 : n <= 6 ? 2 : n <= 8 ? 3 : n <= 10 ? 4 : Math.round(n / 3); }
// AK: 경찰 4명마다 1명 (경찰 1명이면 없음)
export function akCount(pc) { return pc < 2 ? 0 : Math.max(1, Math.floor(pc / 4)); }

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
export function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// ================= 몸 움직이기 (점프, 계단, 층) =================
export function speedOf(a) {
  let s = a.team === 'police' ? CFG.policeSpeed : CFG.robberSpeed;
  if (a.sprintLeft > 0) s = CFG.sprintSpeed;
  if (a.ctrl === 'ai') s *= a.team === 'police' ? CFG.aiPolice : CFG.aiRobber;
  return s;
}

export function collide(M, a) {
  const feet = a.y + (a.grounded ? STEP : 0.05), head = a.y + BODY;
  for (const o of M.obstacles) {
    if (o.h <= feet || o.y0 >= head) continue; // 발 밑이거나 머리 위면 안 부딪혀요
    const cx = clamp(a.x, o.x1, o.x2), cz = clamp(a.z, o.z1, o.z2);
    const dx = a.x - cx, dz = a.z - cz, d2 = dx * dx + dz * dz;
    if (d2 >= R * R) continue;
    if (d2 > 1e-8) {
      const d = Math.sqrt(d2), k = (R - d) / d;
      a.x += dx * k; a.z += dz * k;
    } else {
      const l = a.x - o.x1, r = o.x2 - a.x, t = a.z - o.z1, b = o.z2 - a.z, m = Math.min(l, r, t, b);
      if (m === l) a.x = o.x1 - R; else if (m === r) a.x = o.x2 + R; else if (m === t) a.z = o.z1 - R; else a.z = o.z2 + R;
    }
  }
  const B = M.bounds;
  a.x = clamp(a.x, B.x1 + R, B.x2 - R);
  a.z = clamp(a.z, B.z1 + R, B.z2 - R);
  if (a.jailed) {
    a.x = clamp(a.x, M.jailIn.x1, M.jailIn.x2);
    a.z = clamp(a.z, M.jailIn.z1, M.jailIn.z2);
  }
}

export function stepBody(M, a, mx, mz, jump, dt) {
  if (a.stun > 0 || a.frozen) { mx = 0; mz = 0; jump = false; }
  let len = Math.hypot(mx, mz);
  if (len > 1) { mx /= len; mz /= len; len = 1; }
  const sp = speedOf(a);
  a.x += mx * sp * dt; a.z += mz * sp * dt;
  collide(M, a);
  a.vx = mx * sp; a.vz = mz * sp;
  a.ms = len * sp;
  if (len > 0.05) a.yaw += angleDiff(a.yaw, Math.atan2(mx, mz)) * Math.min(1, dt * 12);
  // 계단 한 칸은 그냥 올라가요
  let g = M.groundAt(a.x, a.z, a.y + (a.grounded ? STEP : 0.06));
  if (a.grounded && g > a.y) a.y = g;
  if (jump && a.grounded) { a.vy = CFG.jumpV; a.grounded = false; }
  a.vy -= CFG.gravity * dt;
  const ny = a.y + a.vy * dt;
  const ceil = M.ceilAt(a.x, a.z, a.y + BODY);
  if (ny + BODY > ceil && a.vy > 0) { a.vy = 0; } else a.y = ny;
  g = M.groundAt(a.x, a.z, Math.max(a.y, g));
  if (a.y <= g) { a.y = g; a.vy = 0; a.grounded = true; } else a.grounded = a.y - g < 0.02;
}

function makeAgent(id, name, team, ctrl, hid = null, avatar = null) {
  return {
    id, name, team, ctrl, hid, avatar, gun: null,
    x: 0, y: 0, z: 0, vy: 0, yaw: 0, ms: 0, vx: 0, vz: 0, grounded: true, lv: 0,
    jailed: false, invuln: 0, stun: 0, hidden: false, isJailer: false, frozen: true,
    sprintLeft: 0, sprintUsed: false, rescueT: 0, rescueHeld: false, swingT: 0, catchCd: 0, gunCd: 0, ammo: 0, akPend: null, shootT: 0, tp: 0,
    emote: -1, emoteT: 0,
    catches: 0, rescues: 0, hits: 0,
    thinkT: Math.random() * 0.5, mode: 'wander', goal: null, target: null, seen: false, lastSeen: null, rescueTarget: null, hideT: 0,
    path: null, pathI: 0, pathAge: 0, navT: 0, navGoal: null, direct: false, patrolI: 0, stuckT: 0,
  };
}

// ================= 게임 한 판 =================
export class Game {
  // humans: [{ hid, name, avatar }]  — 경찰/도둑은 랜덤
  constructor({ size = 6, humans = [], mapId = 'school' }) {
    this.M = getMap(mapId);
    this.mapId = this.M.id;
    this.size = size = clamp(size, 4, MAX_PLAYERS);
    const pc = policeCount(size);
    const left = { police: pc, robber: size - pc };
    const pick = () => {
      const t = Math.random() * (left.police + left.robber) < left.police ? 'police' : 'robber';
      left[t]--; return t;
    };
    this.agents = [];
    let id = 1;
    for (const h of humans.slice(0, size)) this.agents.push(makeAgent(id++, h.name, pick(), 'human', h.hid, h.avatar));
    const names = shuffle(NAMES.filter((n) => !humans.some((h) => h.name === n)));
    while (left.police > 0) { left.police--; this.agents.push(makeAgent(id++, names.pop() || 'AI', 'police', 'ai')); }
    while (left.robber > 0) { left.robber--; this.agents.push(makeAgent(id++, names.pop() || 'AI', 'robber', 'ai')); }
    this.police = this.agents.filter((a) => a.team === 'police');
    this.robbers = this.agents.filter((a) => a.team === 'robber');

    const M = this.M;
    for (const a of this.police) { const p = M.randomFreePoint(M.policeSpawn); a.x = p.x; a.z = p.z; a.yaw = Math.PI / 2; }
    for (const a of this.robbers) { const p = M.randomFreePoint(M.robberSpawn); a.x = p.x; a.z = p.z; a.yaw = rand(0, Math.PI * 2); }

    // 감옥 지킴이 1명 (경찰 2명 이상일 때), AK는 경찰 4명마다 1명 (지킴이 말고), 나머지는 리볼버
    const cops = shuffle(this.police.slice());
    if (cops.length >= 2) cops[0].isJailer = true;
    for (const c of cops) c.gun = 'revolver';
    for (let i = 0; i < akCount(cops.length); i++) { cops[1 + i].gun = 'ak'; cops[1 + i].ammo = CFG.ak.mag; }

    this.phase = 'countdown'; this.count = 3; this.timeLeft = CFG.time;
    this.t = 0; this.playT = 0; this.winner = null;
    this.shots = []; this.shotId = 1; this.events = [];
  }

  byHid(hid) { return this.agents.find((a) => a.hid === hid); }
  agentIdOf(hid) { const a = this.byHid(hid); return a ? a.id : null; }
  meta() { return this.agents.map((a) => ({ id: a.id, name: a.name, team: a.team, jailer: a.isJailer, gun: a.gun, human: a.ctrl === 'human', avatar: a.avatar })); }
  drainEvents() { const e = this.events; this.events = []; return e; }

  snapshot() {
    const r2 = (v) => Math.round(v * 100) / 100;
    return {
      ph: this.phase, cnt: r2(this.count), tl: r2(this.timeLeft),
      pw: this.phase === 'play' ? r2(Math.max(0, CFG.policeWait - this.playT)) : CFG.policeWait,
      a: this.agents.map((a) => [a.id, r2(a.x), r2(a.y), r2(a.z), r2(a.yaw), r2(a.ms),
        (a.jailed ? 1 : 0) | (a.invuln > 0 ? 2 : 0) | (a.stun > 0 ? 4 : 0) | (a.hidden ? 8 : 0) | (a.rescueT > 0 ? 16 : 0) |
        (a.swingT > 0 ? 32 : 0) | (a.sprintUsed ? 64 : 0) | (a.shootT > 0 ? 128 : 0) | (a.isJailer ? 256 : 0),
        r2(a.sprintLeft), r2(a.gunCd), a.tp, r2(a.stun), a.emoteT > 0 ? a.emote : -1, a.gun === 'ak' ? a.ammo : -1]),
      s: this.shots.map((s) => [s.id, r2(s.x), r2(s.y), r2(s.z)]),
    };
  }

  // ----- 사람이 보내는 것 -----
  setPose(hid, p) {
    const a = this.byHid(hid);
    if (!a || a.ctrl !== 'human' || p.tp !== a.tp) return;
    a.yaw = +p.yaw || 0;
    if (a.stun > 0 || a.frozen) { a.ms = 0; return; }
    const nx = +p.x, ny = +p.y, nz = +p.z;
    if (!Number.isFinite(nx) || !Number.isFinite(ny) || !Number.isFinite(nz)) return;
    a.vx = clamp(+p.vx || 0, -10, 10); a.vz = clamp(+p.vz || 0, -10, 10);
    a.x = nx; a.y = clamp(ny, 0, 20); a.z = nz; a.ms = clamp(+p.ms || 0, 0, 10);
    if (a.jailed) collide(this.M, a);
  }
  action(hid, name, data = {}) {
    const a = this.byHid(hid);
    if (!a) return;
    if (name === 'emote') { const i = data.i | 0; if (i >= 0 && i < EMOTES.length) { a.emote = i; a.emoteT = 2.5; } return; }
    if (this.phase !== 'play' || a.ctrl !== 'human') return;
    if (name === 'catch' && a.team === 'police') this.tryCatch(a);
    else if (name === 'shoot' && a.team === 'police') this.shoot(a, data.aim);
    else if (name === 'sprint') this.startSprint(a);
  }
  setRescue(hid, on) { const a = this.byHid(hid); if (a) a.rescueHeld = !!on; }
  setCtrl(hid, ctrl) { const a = this.byHid(hid); if (a) { a.ctrl = ctrl; a.rescueHeld = false; a.path = null; } }

  // ----- 한 번에 dt초씩 진행 -----
  step(dt) {
    this.t += dt;
    if (this.phase === 'countdown') {
      this.count -= dt;
      if (this.count <= 0) { this.phase = 'play'; this.events.push({ e: 'go' }); }
    } else if (this.phase === 'play') {
      this.playT += dt;
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) { this.timeLeft = 0; this.end(this.robbers.some((r) => !r.jailed) ? 'robber' : 'police'); }
    }
    for (const a of this.agents) {
      a.sprintLeft = Math.max(0, a.sprintLeft - dt);
      a.invuln = Math.max(0, a.invuln - dt);
      a.stun = Math.max(0, a.stun - dt);
      a.rescueT = Math.max(0, a.rescueT - dt);
      a.swingT = Math.max(0, a.swingT - dt);
      a.catchCd = Math.max(0, a.catchCd - dt);
      a.gunCd = Math.max(0, a.gunCd - dt);
      a.shootT = Math.max(0, a.shootT - dt);
      a.emoteT = Math.max(0, a.emoteT - dt);
      a.frozen = this.phase !== 'play' || (a.team === 'police' && this.playT < CFG.policeWait);
      if (a.gun === 'ak' && a.gunCd <= 0) {
        if (a.ammo <= 0) a.ammo = CFG.ak.mag; // 장전 끝!
        if (a.akPend) { const aim = a.akPend; a.akPend = null; if (this.phase === 'play') this.shoot(a, aim); }
      }
      const lv = this.M.levelOf(a.y);
      if (lv >= 0 && a.grounded) a.lv = lv;
    }
    if (this.phase !== 'play') { for (const a of this.agents) if (a.ctrl === 'ai') a.ms = 0; return; }

    for (const a of this.agents) {
      if (a.ctrl === 'ai') (a.team === 'police' ? this.thinkPolice : this.thinkRobber).call(this, a, dt);
      else if (a.rescueHeld && !a.jailed && a.stun <= 0) a.rescueT = Math.max(a.rescueT, 0.25);
    }
    this.updateShots(dt);
    for (const r of this.robbers) if (!r.jailed && r.rescueT > 0 && r.stun <= 0) this.tryRescue(r);
    this.separate();
    for (const r of this.robbers) r.hidden = !r.jailed && this.M.hideZones.some((h) => Math.abs(h.y - r.y) < 1 && Math.hypot(h.x - r.x, h.z - r.z) < h.r);
    if (this.phase === 'play' && this.robbers.every((r) => r.jailed)) this.end('police');
  }

  end(winner) {
    if (this.phase === 'end') return;
    this.phase = 'end'; this.winner = winner;
    this.events.push({ e: 'end', winner, stats: this.agents.map((a) => [a.id, a.catches, a.rescues, a.hits]), jailed: this.robbers.filter((r) => r.jailed).length, total: this.robbers.length });
  }

  // ----- 규칙 -----
  jailRobber(r, by) {
    r.jailed = true; r.sprintLeft = 0; r.rescueT = 0; r.stun = 0; r.path = null; r.mode = 'jail'; r.tp++;
    const J = this.M.jailIn;
    r.x = rand(J.x1, J.x2); r.z = rand(J.z1, J.z2); r.y = 0; r.vy = 0; r.grounded = true; r.lv = 0;
    by.catches++;
    this.events.push({ e: 'caught', who: r.id, by: by.id });
  }

  tryCatch(p) {
    if (p.catchCd > 0 || p.jailed || p.frozen || p.gun === 'ak') return; // AK 경찰은 못 잡아요
    p.catchCd = 0.7; p.swingT = 0.3;
    let best = null, bd = CFG.catchRange;
    for (const r of this.robbers) {
      if (r.jailed || r.invuln > 0 || Math.abs(r.y - p.y) > CFG.catchUp) continue;
      const d = dist(p, r);
      if (d < bd) { bd = d; best = r; }
    }
    if (best) this.jailRobber(best, p);
  }

  tryRescue(r) {
    const C = this.M.jailC;
    for (const j of this.robbers) {
      if (!j.jailed || dist(r, j) > CFG.rescueRange || r.y > 1) continue;
      j.jailed = false; j.invuln = CFG.invuln; j.mode = 'flee'; j.thinkT = 0; j.goal = null; j.tp++;
      const dx = r.x - C.x, dz = r.z - C.z, d = Math.hypot(dx, dz) || 1;
      j.x = r.x + dx / d * 0.9; j.z = r.z + dz / d * 0.9; j.y = r.y;
      collide(this.M, j);
      r.rescues++;
      this.events.push({ e: 'freed', who: j.id, by: r.id });
    }
  }

  startSprint(a) {
    if (a.team !== 'robber' || a.sprintUsed || a.jailed || a.stun > 0) return;
    a.sprintUsed = true; a.sprintLeft = CFG.sprintTime;
    this.events.push({ e: 'sprint', who: a.id });
  }

  // 🔫 총. 리볼버: 앞쪽 도둑 자동 조준 / AK: aim.yaw 쪽으로 (근처 도둑한테 살짝 자동 조준)
  shoot(a, aim) {
    if (a.frozen || a.jailed || !a.gun) return;
    const ak = a.gun === 'ak';
    if (ak && a.ammo <= 0) return; // 장전 중
    if (a.gunCd > 0) {
      // AK: 조금 일찍 누른 건 기억했다가 바로 쏴요 (인터넷이 느려도 0.5초에 1발)
      if (ak && a.gunCd <= 0.35) a.akPend = { yaw: aim && Number.isFinite(+aim.yaw) ? +aim.yaw : a.yaw };
      return;
    }
    const G = CFG[a.gun] || CFG.revolver, M = this.M, sy = a.y + 1.4;
    if (ak) {
      a.ammo--; a.shootT = 0.7;
      a.gunCd = a.ammo <= 0 ? CFG.ak.reload : CFG.ak.fireCd;
      if (a.ammo <= 0) this.events.push({ e: 'reload', who: a.id });
    } else { a.gunCd = CFG.gunCd; a.shootT = 0.25; }
    let dx, dy, dz;
    if (ak) {
      const ay = aim && Number.isFinite(+aim.yaw) ? +aim.yaw : a.yaw;
      let best = null, bs = 1e9;
      for (const r of this.robbers) {
        if (r.jailed || r.invuln > 0 || r.hidden || Math.abs(r.y - a.y) > 4) continue;
        const ex = r.x - a.x, ez = r.z - a.z, d = Math.hypot(ex, ez);
        if (d > G.range || d < 0.3) continue;
        const diff = Math.abs(angleDiff(ay, Math.atan2(ex, ez)));
        if (diff > G.assist || !M.los(a.x, a.z, r.x, r.z, Math.max(0, a.lv))) continue;
        const s = diff * 10 + d * 0.1 + (r.stun > 0 ? 5 : 0);
        if (s < bs) { bs = s; best = r; }
      }
      const yaw = best ? Math.atan2(best.x - a.x, best.z - a.z) : ay;
      const pitch = best ? Math.atan2(best.y + 1.1 - sy, dist(a, best)) : 0;
      dx = Math.sin(yaw) * Math.cos(pitch); dy = Math.sin(pitch); dz = Math.cos(yaw) * Math.cos(pitch);
      a.yaw = yaw;
    } else if (aim && Number.isFinite(+aim.yaw) && Number.isFinite(+aim.pitch)) {
      const yaw = +aim.yaw, pitch = clamp(+aim.pitch, -1.5, 1.5);
      dx = Math.sin(yaw) * Math.cos(pitch); dy = Math.sin(pitch); dz = Math.cos(yaw) * Math.cos(pitch);
      a.yaw = yaw;
    } else {
      // 앞쪽 가까운 도둑 자동 조준
      let best = null, bs = 1e9;
      for (const r of this.robbers) {
        if (r.jailed || r.invuln > 0 || r.hidden || Math.abs(r.y - a.y) > 3) continue;
        const ex = r.x - a.x, ez = r.z - a.z, d = Math.hypot(ex, ez);
        if (d > G.range || d < 0.3) continue;
        const diff = Math.abs(angleDiff(a.yaw, Math.atan2(ex, ez)));
        if (diff > G.assist + (a.ctrl === 'ai' ? 0.3 : 0) || !M.los(a.x, a.z, r.x, r.z, Math.max(0, a.lv))) continue;
        const s = diff * 10 + d * 0.1;
        if (s < bs) { bs = s; best = r; }
      }
      const yaw = best ? Math.atan2(best.x - a.x, best.z - a.z) : a.yaw;
      const d = best ? dist(a, best) : 10;
      const pitch = best ? Math.atan2(best.y + 1.1 - sy, d) : 0;
      dx = Math.sin(yaw) * Math.cos(pitch); dy = Math.sin(pitch); dz = Math.cos(yaw) * Math.cos(pitch);
      a.yaw = yaw;
    }
    this.shots.push({ id: this.shotId++, x: a.x + dx * 0.5, y: sy, z: a.z + dz * 0.5, vx: dx * G.speed, vy: dy * G.speed, vz: dz * G.speed, life: G.life, by: a });
    this.events.push({ e: 'shoot', by: a.id, gun: a.gun });
  }

  updateShots(dt) {
    const M = this.M;
    this.shots = this.shots.filter((s) => {
      const n = Math.max(2, Math.ceil(Math.hypot(s.vx, s.vy, s.vz) * dt / 0.35));
      for (let k = 0; k < n; k++) {
        s.x += s.vx * dt / n; s.y += s.vy * dt / n; s.z += s.vz * dt / n; s.life -= dt / n;
        if (s.life <= 0 || s.y < 0 || M.solidAt(s.x, s.z, s.y)) return false;
        for (const r of this.robbers) {
          if (r.jailed || r.invuln > 0 || r.stun > 0) continue;
          if (Math.hypot(r.x - s.x, r.z - s.z) < 0.6 && s.y > r.y && s.y < r.y + 2.3) {
            r.stun = CFG.stunTime; r.sprintLeft = 0; s.by.hits++;
            this.events.push({ e: 'hit', who: r.id, by: s.by.id });
            return false;
          }
        }
      }
      return true;
    });
  }

  separate() {
    const A = this.agents, R2 = R * 2;
    for (let i = 0; i < A.length; i++) for (let j = i + 1; j < A.length; j++) {
      const a = A[i], b = A[j];
      if (a.jailed !== b.jailed || Math.abs(a.y - b.y) > 1) continue;
      const aAI = a.ctrl === 'ai', bAI = b.ctrl === 'ai';
      if (!aAI && !bAI) continue;
      const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
      if (d >= R2 || d < 1e-4) continue;
      const k = (R2 - d) / d;
      if (aAI && bAI) { a.x -= dx * k / 2; a.z -= dz * k / 2; b.x += dx * k / 2; b.z += dz * k / 2; collide(this.M, a); collide(this.M, b); }
      else if (aAI) { a.x -= dx * k; a.z -= dz * k; collide(this.M, a); }
      else { b.x += dx * k; b.z += dz * k; collide(this.M, b); }
    }
  }

  // ================= AI =================
  // 목표(tx, tz, 층 tlv)까지 길 찾아 가기. 도착하면 true
  goTo(a, tx, tz, tlv, dt, stopDist = 0.4) {
    const M = this.M, dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz);
    const alv = a.lv;
    if (d < stopDist && alv === tlv) { stepBody(M, a, 0, 0, false, dt); return true; }
    a.navT -= dt; a.pathAge += dt;
    const goalMoved = !a.navGoal || a.navGoal.lv !== tlv || Math.hypot(a.navGoal.x - tx, a.navGoal.z - tz) > 1.5;
    if (a.navT <= 0 || goalMoved) {
      a.navT = rand(0.25, 0.4);
      if (goalMoved) a.navGoal = { x: tx, z: tz, lv: tlv };
      const onStairs = a.path && a.path[a.pathI] && a.path[a.pathI].stair;
      if (!onStairs && alv === tlv && M.levelOf(a.y) === alv && M.los(a.x, a.z, tx, tz, alv)) { a.direct = true; a.path = null; }
      else if (!onStairs) {
        a.direct = false;
        if (!a.path || goalMoved || a.pathAge > 1.5) { a.path = M.findPath(a.x, a.z, alv, tx, tz, tlv); a.pathI = 0; a.pathAge = 0; }
      }
    }
    let mx = dx / d, mz = dz / d;
    if (!a.direct && a.path && a.pathI < a.path.length) {
      let p = a.path[a.pathI], px = p.x - a.x, pz = p.z - a.z, pd = Math.hypot(px, pz);
      if (pd < 0.6 && a.pathI < a.path.length - 1) {
        a.pathI++; p = a.path[a.pathI]; px = p.x - a.x; pz = p.z - a.z; pd = Math.hypot(px, pz);
      }
      if (pd > 0.01) { mx = px / pd; mz = pz / pd; }
    }
    const bx = a.x, bz = a.z;
    stepBody(M, a, mx, mz, false, dt);
    // 막혀서 못 가면 길 다시 찾기
    if (Math.hypot(a.x - bx, a.z - bz) < speedOf(a) * dt * 0.2) { a.stuckT += dt; if (a.stuckT > 0.8) { a.stuckT = 0; a.path = null; a.navT = 0; a.direct = false; } }
    else a.stuckT = 0;
    return false;
  }

  canSee(p, r) {
    if (r.jailed || Math.abs(p.y - r.y) > 2) return false;
    const d = dist(p, r);
    if (d < 2.5) return true;
    if (r.hidden || d > 30) return false;
    return this.M.los(p.x, p.z, r.x, r.z, Math.max(0, p.lv));
  }

  nearestPolice(a) {
    let p = null, d = 1e9;
    for (const o of this.police) { if (Math.abs(o.y - a.y) > 2.5) continue; const k = dist(a, o); if (k < d) { d = k; p = o; } }
    return { p, d };
  }

  // ----- AI 도둑 -----
  fleePoint(a) {
    const M = this.M, B = M.bounds, lv = a.lv;
    let best = null, bs = -1e9;
    for (let k = 0; k < 14; k++) {
      const ang = Math.random() * Math.PI * 2, r = rand(7, 16);
      const x = a.x + Math.cos(ang) * r, z = a.z + Math.sin(ang) * r;
      if (x < B.x1 + 1 || x > B.x2 - 1 || z < B.z1 + 1 || z > B.z2 - 1 || M.blockedAt(x, z, lv)) continue;
      let minD = 1e9, toward = 0;
      for (const p of this.police) {
        minD = Math.min(minD, Math.hypot(p.x - x, p.z - z));
        const ex = p.x - a.x, ez = p.z - a.z, ed = Math.hypot(ex, ez) || 1;
        if (ed < 14) toward = Math.max(toward, (Math.cos(ang) * ex + Math.sin(ang) * ez) / ed);
      }
      const s = minD - toward * 10 + Math.random() * 2;
      if (s > bs) { bs = s; best = { x, z, lv }; }
    }
    return best || M.randomFreePoint(null, lv);
  }

  wanderPoint() {
    let best = null, bs = -1e9;
    for (let k = 0; k < 5; k++) {
      const p = this.M.randomAnyLevel();
      let minD = 1e9;
      for (const o of this.police) minD = Math.min(minD, Math.hypot(o.x - p.x, o.z - p.z));
      const s = Math.min(minD, 25) + Math.random() * 8;
      if (s > bs) { bs = s; best = p; }
    }
    return best;
  }

  freeHideZone(a) {
    let best = null, bs = -1e9;
    for (const h of this.M.hideZones) {
      if (!h.ok) continue;
      if (this.robbers.some((r) => r !== a && !r.jailed && Math.abs(r.y - h.y) < 1 && Math.hypot(r.x - h.x, r.z - h.z) < h.r + 0.5)) continue;
      let minD = 1e9;
      for (const o of this.police) minD = Math.min(minD, Math.hypot(o.x - h.x, o.z - h.z) + Math.abs(o.y - h.y) * 3);
      const s = Math.min(minD, 30) - Math.hypot(a.x - h.x, a.z - h.z) * 0.4 + Math.random() * 10;
      if (s > bs) { bs = s; best = h; }
    }
    return best;
  }

  closestToJail(a) {
    const C = this.M.jailC;
    let best = null, bd = 1e9;
    for (const r of this.robbers) {
      if (r.jailed || r.ctrl !== 'ai') continue;
      const d = Math.hypot(r.x - C.x, r.z - C.z) + r.y * 4;
      if (d < bd) { bd = d; best = r; }
    }
    return best === a;
  }

  outsidePoint(x, z) {
    const J = this.M.jail, off = this.M.FENCE + R + 0.15;
    const dl = x - J.x1, dr = J.x2 - x, dt = z - J.z1, db = J.z2 - z, m = Math.min(dl, dr, dt, db);
    if (m === dr) return { x: J.x2 + off, z };
    if (m === dl) return { x: J.x1 - off, z };
    if (m === dt) return { x, z: J.z1 - off };
    return { x, z: J.z2 + off };
  }

  thinkRobber(a, dt) {
    const M = this.M;
    if (a.jailed) { // 구하러 오는 친구 쪽 철창으로 가서 손 내밀기
      let near = null, nd = 1e9;
      for (const r of this.robbers) if (!r.jailed && r.y < 1) { const d = dist(a, r); if (d < nd) { nd = d; near = r; } }
      if (!near || nd > 30) { stepBody(M, a, 0, 0, false, dt); return; }
      const J = M.jailIn, tx = clamp(near.x, J.x1, J.x2), tz = clamp(near.z, J.z1, J.z2);
      const dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz);
      if (d > 0.3) stepBody(M, a, dx / d, dz / d, false, dt);
      else { stepBody(M, a, 0, 0, false, dt); a.yaw += angleDiff(a.yaw, Math.atan2(near.x - a.x, near.z - a.z)) * Math.min(1, dt * 8); }
      return;
    }
    if (a.stun > 0) { stepBody(M, a, 0, 0, false, dt); return; }

    const { p: cop, d: cd } = this.nearestPolice(a);
    const urgent = cd < 3.5 && a.mode !== 'flee';
    a.thinkT -= dt;
    if (a.mode === 'hide') a.hideT -= dt;
    if (a.thinkT <= 0 || urgent) {
      a.thinkT = rand(0.4, 0.7);
      const reach = a.mode === 'rescue' ? 5 : 10;
      const threat = cop && !cop.frozen && (cd < 3.5 || (cd < reach && !a.hidden && M.los(a.x, a.z, cop.x, cop.z, a.lv)));
      if (threat) {
        if (a.mode !== 'flee' || !a.goal || Math.random() < 0.5) a.goal = this.fleePoint(a);
        a.mode = 'flee';
        if (cd < 3.2 && !a.sprintUsed && Math.random() < 0.6) this.startSprint(a);
      } else {
        const jailed = this.robbers.filter((r) => r.jailed);
        if (jailed.length && (a.mode === 'rescue' || this.closestToJail(a) || Math.random() < 0.08)) {
          a.mode = 'rescue';
          let best = null, bd = 1e9;
          for (const j of jailed) { const d = dist(a, j); if (d < bd) { bd = d; best = j; } }
          a.rescueTarget = best;
        } else if (a.mode === 'hide') {
          if (a.hideT <= 0) { a.mode = 'wander'; a.goal = null; }
        } else if ((a.mode !== 'wander' && a.mode !== 'tohide') || !a.goal || (Math.hypot(a.goal.x - a.x, a.goal.z - a.z) < 1 && a.goal.lv === a.lv)) {
          const hz = Math.random() < 0.6 ? this.freeHideZone(a) : null;
          if (hz) { a.mode = 'tohide'; a.goal = { x: hz.x, z: hz.z, lv: hz.lv }; }
          else { a.mode = 'wander'; a.goal = this.wanderPoint(); }
        }
      }
    }
    if (a.mode === 'rescue') {
      const t = a.rescueTarget;
      if (!t || !t.jailed) { a.mode = 'wander'; a.goal = null; a.thinkT = 0; stepBody(M, a, 0, 0, false, dt); return; }
      const op = this.outsidePoint(t.x, t.z);
      this.goTo(a, op.x, op.z, 0, dt, 0.3);
      if (dist(a, t) < CFG.rescueRange - 0.15 && a.y < 1) a.rescueT = 0.4;
    } else if (a.mode === 'hide') {
      stepBody(M, a, 0, 0, false, dt);
    } else if (a.goal) {
      if (this.goTo(a, a.goal.x, a.goal.z, a.goal.lv || 0, dt, a.mode === 'tohide' ? 0.3 : 0.4)) {
        if (a.mode === 'tohide') { a.mode = 'hide'; a.hideT = rand(10, 25); }
        else if (a.mode === 'flee') a.thinkT = 0;
      }
    } else stepBody(M, a, 0, 0, false, dt);
  }

  // ----- AI 경찰 -----
  chase(a, t, dt) {
    const lead = Math.min(dist(a, t) / 10, 0.6), M = this.M;
    const akSee = a.gun === 'ak' && t.lv === a.lv && Math.abs(t.y - a.y) < 3 && M.los(a.x, a.z, t.x, t.z, Math.max(0, a.lv));
    if (akSee && dist(a, t) < 6) { // AK 경찰은 너무 가까이 안 가요 (거리 두고 쏘기)
      stepBody(M, a, 0, 0, false, dt);
      a.yaw += angleDiff(a.yaw, Math.atan2(t.x - a.x, t.z - a.z)) * Math.min(1, dt * 10);
    } else this.goTo(a, t.x + t.vx * lead, t.z + t.vz * lead, t.lv, dt, 0.2);
    const d = dist(a, t), G = CFG[a.gun] || CFG.revolver;
    if (a.gun === 'ak') { // AK는 못 잡으니까 다다다 쏴요 (0.5초에 1발, 기절한 도둑은 안 쏴요)
      if (akSee && a.gunCd <= 0 && a.ammo > 0 && d < G.range - 2 && t.stun <= 0 && !t.jailed && t.invuln <= 0)
        this.shoot(a, { yaw: Math.atan2(t.x - a.x, t.z - a.z) });
      return;
    }
    if (d < CFG.catchRange * 0.75 && t.invuln <= 0 && !t.jailed) this.tryCatch(a);
    else if (a.gun && a.gunCd <= 0 && d > 4 && d < Math.min(G.range, 28) && t.stun <= 0 && Math.random() < dt * 0.15) {
      a.yaw = Math.atan2(t.x - a.x, t.z - a.z);
      this.shoot(a);
    }
  }

  thinkPolice(a, dt) {
    const M = this.M;
    if (a.frozen) { stepBody(M, a, 0, 0, false, dt); return; }
    if (a.isJailer) {
      let threat = null, td = 11;
      for (const r of this.robbers) {
        if (r.jailed || r.invuln > 0) continue;
        const d = Math.hypot(r.x - M.jailC.x, r.z - M.jailC.z);
        if (d < td && this.canSee(a, r)) { td = d; threat = r; }
      }
      if (threat) return this.chase(a, threat, dt);
      if (!M.patrol.length) return stepBody(M, a, 0, 0, false, dt);
      const p = M.patrol[a.patrolI % M.patrol.length];
      if (this.goTo(a, p[0], p[1], 0, dt, 0.6)) a.patrolI++;
      return;
    }
    a.thinkT -= dt;
    if (a.thinkT <= 0) {
      a.thinkT = 0.4;
      let best = null, bs = 1e9;
      for (const r of this.robbers) {
        if (r.invuln > 0 || !this.canSee(a, r)) continue;
        let s = dist(a, r);
        for (const o of this.police) if (o !== a && o.target === r) s += 8;
        if (r === a.target) s -= 3;
        if (s < bs) { bs = s; best = r; }
      }
      if (best) { a.target = best; a.seen = true; a.lastSeen = { x: best.x, z: best.z, lv: best.lv }; a.mode = 'chase'; }
      else { a.seen = false; if (a.mode === 'chase') a.mode = a.lastSeen ? 'investigate' : 'search'; }
    }
    if (a.mode === 'chase' && a.target && a.seen && !a.target.jailed) this.chase(a, a.target, dt);
    else if (a.mode === 'investigate' && a.lastSeen) {
      if (this.goTo(a, a.lastSeen.x, a.lastSeen.z, a.lastSeen.lv, dt, 0.8)) { a.mode = 'search'; a.goal = null; }
    } else {
      a.mode = 'search';
      if (!a.goal || this.goTo(a, a.goal.x, a.goal.z, a.goal.lv || 0, dt, 0.8)) {
        const zones = M.hideZones.filter((h) => h.ok);
        if (Math.random() < 0.35 && zones.length) { const h = zones[Math.floor(Math.random() * zones.length)]; a.goal = { x: h.x, z: h.z, lv: h.lv }; }
        else a.goal = M.randomAnyLevel();
      }
    }
  }
}
