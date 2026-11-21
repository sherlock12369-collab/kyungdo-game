import { CFG, Game, stepBody, policeCount, sniperCount, MAX_PLAYERS, EMOTES } from './shared/sim.js';
import { getMap, MAP_LIST } from './shared/map.js';
import { World, AgentView } from './render.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const world = new World();
let M = getMap('school');
world.setMap(M);

// ================= 저장된 설정 =================
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* 저장 안 되는 브라우저 */ } },
};
const settings = {
  players: clamp(+store.get('kd_players', 6) || 6, 4, MAX_PLAYERS),
  mapId: store.get('kd_map', 'school'),
  name: store.get('kd_name', '') || '친구' + Math.floor(10 + Math.random() * 90),
  avatar: store.get('kd_avatar', '') || null,
};

// ================= 혼자(AI랑) / 친구랑 =================
class LocalSession {
  constructor() {
    this.local = true;
    this.game = new Game({ size: settings.players, mapId: settings.mapId, humans: [{ hid: 'me', name: settings.name, avatar: settings.avatar }] });
    this.mapId = this.game.mapId;
    this.myId = this.game.agentIdOf('me');
    this.meta = this.game.meta();
    this.snap = this.game.snapshot();
    this.events = [];
  }
  pose(p) { this.game.setPose('me', p); }
  act(name, data) { this.game.action('me', name, data); }
  rescue(on) { this.game.setRescue('me', on); }
  update(dt) { this.game.step(dt); this.snap = this.game.snapshot(); this.events.push(...this.game.drainEvents()); }
}

class NetSession {
  constructor(m) {
    this.local = false;
    this.mapId = m.map; this.myId = m.you; this.meta = m.meta; this.snap = m.snap;
    this.events = []; this.poseT = 0;
  }
  pose(p, dt) {
    this.poseT -= dt;
    if (this.poseT > 0) return;
    this.poseT = net.poseEvery || 0.05;
    net.send({ t: 'pose', x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), yaw: +p.yaw.toFixed(2), ms: +p.ms.toFixed(2), vx: +p.vx.toFixed(1), vz: +p.vz.toFixed(1), tp: p.tp });
  }
  act(name, data = {}) { net.send({ t: 'act', a: name, ...data }); }
  rescue(on) { net.send({ t: 'rescue', on }); }
  update() {}
}

// 친구랑 하기: 기본은 Supabase (방장 폰이 게임을 돌려요). 주소 뒤에 ?ws 붙이면 예전처럼 이 컴퓨터 서버(node server.js)를 써요
const wsNet = {
  ws: null, queue: [],
  connect() {
    if (this.ws) return;
    const ws = this.ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
    ws.onopen = () => { for (const m of this.queue) ws.send(JSON.stringify(m)); this.queue = []; };
    ws.onmessage = (e) => onNet(JSON.parse(e.data));
    ws.onclose = () => {
      this.ws = null; this.queue = [];
      if ((session && !session.local) || screen === 'room') { endGameView(); showScreen('lobby'); msg('서버랑 연결이 끊겼어요 😢'); }
    };
  },
  send(m) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m));
    else { this.queue.push(m); this.connect(); }
  },
};

function netLost(text) {
  if ((session && !session.local) || screen === 'room') { endGameView(); showScreen('lobby'); msg(text); }
}
// Supabase는 "친구랑 하기"를 처음 누를 때 불러와요 (못 불러와도 혼자 하기는 돼요)
function lazySupaNet() {
  let real = null, loading = null, queue = [];
  return {
    poseEvery: 1 / 8,
    send(m) {
      if (real) return real.send(m);
      queue.push(m);
      if (!loading) loading = import('./supanet.js').then((mod) => {
        real = mod.createSupaNet((x) => onNet(x), netLost);
        for (const x of queue) real.send(x);
        queue = [];
      }, () => { loading = null; queue = []; msg('인터넷이 안 돼서 친구랑 하기를 못 열었어요 😢'); });
    },
  };
}
const net = new URLSearchParams(location.search).has('ws') ? wsNet : lazySupaNet();

function onNet(m) {
  if (m.t === 'room') {
    if (m.state === 'playing') return;
    if (session && !session.local) endGameView();
    showRoom(m);
  } else if (m.t === 'start') {
    startSession(new NetSession(m));
  } else if (m.t === 'snap') {
    if (session && !session.local) { session.snap = m; session.events.push(...m.ev); }
  } else if (m.t === 'err') {
    msg(m.msg);
  } else if (m.t === 'left') {
    if (screen === 'room') showScreen('lobby');
  }
}

// ================= 화면 바꾸기 =================
let screen = 'lobby';
function showScreen(name) {
  screen = name;
  $('lobby').classList.toggle('hidden', name !== 'lobby');
  $('room').classList.toggle('hidden', name !== 'room');
  $('avatar').classList.toggle('hidden', name !== 'avatar');
  $('hud').classList.toggle('hidden', name !== 'game');
  if (name !== 'game') $('result').classList.add('hidden');
  document.body.classList.toggle('playing', name === 'game');
}

let msgTimer;
function msg(text) {
  $('msg').textContent = text;
  clearTimeout(msgTimer);
  msgTimer = setTimeout(() => { $('msg').textContent = ''; }, 4000);
}

// ================= 게임 시작 / 끝 =================
let session = null, views = new Map(), metaById = new Map(), me = null, endEv = null;
let camYaw = 0, camPitch = 0.42, camSnap = true, insidePitch = 0.42;
const CAM_D = 7.5;

function startSession(sess) {
  endGameView();
  session = sess;
  M = getMap(sess.mapId);
  world.setMap(M);
  metaById = new Map(sess.meta.map((a) => [a.id, a]));
  views = new Map(sess.meta.map((a) => [a.id, new AgentView(world.scene, a, a.id === sess.myId)]));
  const mine = metaById.get(sess.myId), row = sess.snap.a.find((r) => r[0] === sess.myId);
  me = {
    id: sess.myId, team: mine.team, jailer: mine.jailer, gun: mine.gun, ctrl: 'human',
    x: row[1], y: row[2], z: row[3], vy: 0, yaw: row[4], ms: 0, vx: 0, vz: 0, tp: row[9], grounded: true,
    jailed: false, stun: 0, frozen: true, sprintLeft: 0, sprintUsed: false, gunCd: 0, hidden: false, scoped: false,
  };
  setScope(false);
  $('emoteBar').classList.add('hidden');
  const B = M.bounds;
  camYaw = Math.atan2(me.x - (B.x1 + B.x2) / 2, me.z - (B.z1 + B.z2) / 2);
  camPitch = 0.42; camSnap = true; endEv = null;
  input.jx = input.jy = 0; input.rescueHeld = false; input.jumpBuf = 0;

  const badge = $('roleBadge');
  badge.className = me.team;
  badge.textContent = (me.team === 'police' ? '👮 경찰' : '🦹 도둑') + (me.jailer ? ' · 🔒 감옥 지킴이' : '') + (me.gun === 'sniper' ? ' · 🔭 스나이퍼' : me.gun ? ' · 🔫 리볼버' : '');
  const police = me.team === 'police';
  $('catchBtn').classList.toggle('hidden', !police);
  $('gunBtn').classList.toggle('hidden', !police);
  $('sprintBtn').classList.toggle('hidden', police);
  $('rescueBtn').classList.toggle('hidden', police);
  hudCache = {};
  showScreen('game');
  $('result').classList.add('hidden');
  const jailer = sess.meta.find((a) => a.jailer);
  if (me.jailer) toast('🔒 감옥 지킴이로 뽑혔어요! (나가도 되지만 욕먹어요 ㅋㅋ)', 4000);
  else if (me.gun === 'sniper') toast('🔭 스나이퍼예요! 옥상에 올라가서 조준경으로 쏴요!', 4000);
  else if (police) toast(`👮 경찰이에요! 도둑을 잡아요!${jailer ? ` (감옥 지킴이: ${jailer.name})` : ''}`, 3500);
  else toast('🦹 도둑이에요! 3분 동안 도망쳐요!', 3500);
}

function endGameView() {
  setScope(false);
  for (const v of views.values()) v.dispose();
  views.clear();
  world.updateShots([]);
  world.setInside(null);
  session = null; me = null;
}

function quitToLobby() {
  if ((session && !session.local) || screen === 'room') net.send({ t: 'leave' });
  endGameView();
  showScreen('lobby');
}

const nameOf = (id) => (me && id === me.id ? '나' : metaById.get(id)?.name || '?');

function handleEvent(e) {
  if (e.e === 'go') toast(me.team === 'police' ? `🚨 경찰은 ${CFG.policeWait}초 뒤에 출발해요!` : `🦹 도망쳐요! 경찰은 ${CFG.policeWait}초 뒤에 출발해요`, 2500);
  else if (e.e === 'caught') {
    if (e.who === me.id) toast('🚨 잡혔어요! 감옥에서 친구를 기다려요', 3000);
    else if (e.by === me.id) toast(`👮 ${nameOf(e.who)} 잡았다!`);
    else toast(`🚨 ${nameOf(e.who)} 잡혔어요!`, 1500);
  } else if (e.e === 'freed') {
    if (e.who === me.id) toast(`🎉 ${nameOf(e.by)}이(가) 구해줬어요! 도망쳐요!`, 2500);
    else if (e.by === me.id) toast(`🤝 ${nameOf(e.who)} 구출 성공!`);
    else toast(`🤝 ${nameOf(e.by)}이(가) ${nameOf(e.who)} 구출!`, 1500);
  } else if (e.e === 'hit') {
    if (e.who === me.id) toast('💫 총 맞았어요! 2초 기절', 2000);
    else if (e.by === me.id) toast(`🎯 명중! ${nameOf(e.who)} 기절!`, 1500);
  } else if (e.e === 'sprint') {
    if (e.who === me.id) toast('🏃💨 5초 달리기!', 1200);
  } else if (e.e === 'end') {
    endEv = e;
    const s = session;
    setTimeout(() => { if (session === s) showResult(); }, 900);
  }
}

function showResult() {
  const e = endEv, win = e.winner === me.team;
  const mine = e.stats.find((s) => s[0] === me.id) || [0, 0, 0, 0];
  $('resTitle').textContent = e.winner === 'robber' ? '🦹 도둑 승리!' : '🚓 경찰 승리!';
  $('resSub').textContent = win ? '🎉 우리 팀이 이겼어요!' : '😭 아쉽다! 다시 해볼까요?';
  $('resStats').innerHTML = `잡힌 도둑 ${e.jailed}명 · 남은 도둑 ${e.total - e.jailed}명<br>` +
    (me.team === 'police' ? `내가 잡은 도둑: ${mine[1]}명 · 총 명중: ${mine[3]}번` : `내가 구해준 친구: ${mine[2]}명`) +
    (session.local ? '' : '<br>⏳ 잠시 후 대기실로 돌아가요');
  $('againBtn').classList.toggle('hidden', !session.local);
  $('homeBtn').textContent = session.local ? '🏠 처음으로' : '🚪 나가기';
  $('result').classList.remove('hidden');
}

// ================= 매 프레임 =================
function gameFrame(dt, t) {
  const s = session.snap;
  const row = s.a.find((r) => r[0] === me.id);
  if (row) {
    const f = row[6];
    me.jailed = !!(f & 1); me.hidden = !!(f & 8); me.sprintUsed = !!(f & 64);
    me.sprintLeft = row[7]; me.gunCd = row[8]; me.stun = row[10];
    if (row[9] !== me.tp) { me.tp = row[9]; me.x = row[1]; me.y = row[2]; me.z = row[3]; me.vy = 0; camSnap = true; }
  }
  me.frozen = s.ph !== 'play' || (me.team === 'police' && s.pw > 0);
  if (me.scoped && s.ph === 'end') setScope(false);

  // 내 캐릭터 움직이기 (조준경 볼 때는 못 움직여요)
  const k = input.keys;
  let jx = me.scoped ? 0 : input.jx, jy = me.scoped ? 0 : input.jy;
  if (k.KeyW || k.ArrowUp) jy += 1;
  if (k.KeyS || k.ArrowDown) jy -= 1;
  if (k.KeyA || k.ArrowLeft) jx -= 1;
  if (k.KeyD || k.ArrowRight) jx += 1;
  if (me.scoped) { jx = 0; jy = 0; if (k.KeyQ) aimYaw += dt * 0.8; if (k.KeyE) aimYaw -= dt * 0.8; }
  else {
    if (k.KeyQ) camYaw += dt * 2.2;
    if (k.KeyE) camYaw -= dt * 2.2;
  }
  const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw), rx = -fz, rz = fx;
  stepBody(M, me, rx * jx + fx * jy, rz * jx + fz * jy, input.jumpBuf > 0 && !me.scoped, dt);
  if (me.scoped) me.yaw = aimYaw;
  input.jumpBuf = me.vy > 0 ? 0 : Math.max(0, input.jumpBuf - dt);
  if (input.rescueHeld !== input.rescueSent) { input.rescueSent = input.rescueHeld; session.rescue(input.rescueHeld); }

  session.pose(me, dt);
  session.update(dt);
  if (!session) return;
  for (const e of session.events.splice(0)) handleEvent(e);

  const snap = session.snap;
  for (const r of snap.a) {
    const v = views.get(r[0]);
    if (!v) continue;
    if (r[0] === me.id) v.apply([r[0], me.x, me.y, me.z, me.yaw, me.ms, r[6]], dt, true);
    else v.apply(r, dt, session.local);
    // 경찰은 진짜 눈으로 보이는 도둑만 보여요 (카메라 올려서 벽 너머 보기 금지)
    if (me.team === 'police' && v.meta.team === 'robber' && v.s) {
      v.sightT = (v.sightT || 0) - dt;
      if (v.sightT <= 0) {
        v.sightT = 0.15 + Math.random() * 0.1;
        const s = v.s, dd = Math.hypot(s.x - me.x, s.z - me.z);
        v.occluded = dd > 3 && (dd > 80 || !M.sightClear(me.x, me.y + 1.6, me.z, s.x, s.y + 1.2, s.z) && !M.sightClear(me.x, me.y + 1.6, me.z, s.x, s.y + 2.1, s.z));
      }
    } else v.occluded = false;
    v.update(dt, t, me.team, me, v.occluded);
    v.setEmote(r[11] ?? -1, EMOTES);
  }
  world.updateShots(snap.s);
  world.setInside(M.indoorAt(me.x, me.z), myLevel());
  if (me.scoped) updateScopeCamera(); else updateCamera(dt);
  updateHud(dt, snap);
}

function myLevel() {
  const lv = M.levelOf(me.y);
  return lv >= 0 ? lv : Math.floor(me.y / 4.2);
}

// maxY: 건물 안에서는 숨겨진 위층에 카메라가 안 막혀요
function camBlocked(x, y, z, maxY = Infinity) {
  if (y < 0.2) return true;
  for (const o of M.obstacles) if (o.y0 < maxY && o.h > y && o.y0 < y && x > o.x1 - 0.2 && x < o.x2 + 0.2 && z > o.z1 - 0.2 && z < o.z2 + 0.2) return true;
  return false;
}

// 🔭 스나이퍼 조준경
let aimYaw = 0, aimPitch = 0;
function setScope(on) {
  if (me) me.scoped = on;
  $('scope').classList.toggle('hidden', !on);
  $('scopeBtns').classList.toggle('hidden', !on);
  $('joyBase').classList.toggle('hidden', on);
  hudCache['actions.hidden'] = undefined;
  if (on) { aimYaw = camYaw + Math.PI; aimPitch = -0.05; resetJoy(); }
  world.camera.fov = on ? 20 : 60;
  world.camera.updateProjectionMatrix();
  if (!on) camSnap = true;
}
function updateScopeCamera() {
  const cam = world.camera, ey = me.y + 1.75;
  cam.position.set(me.x + Math.sin(aimYaw) * 0.3, ey, me.z + Math.cos(aimYaw) * 0.3);
  cam.lookAt(cam.position.x + Math.sin(aimYaw) * Math.cos(aimPitch), ey + Math.sin(aimPitch), cam.position.z + Math.cos(aimYaw) * Math.cos(aimPitch));
}

function updateCamera(dt) {
  const cam = world.camera, tx = me.x, ty = me.y + 1.6, tz = me.z;
  // 건물 안에서는 위에서 내려다봐요 (지붕은 숨겨져요)
  const inside = !!M.indoorAt(me.x, me.z);
  insidePitch += ((inside ? Math.max(camPitch, 1.0) : camPitch) - insidePitch) * Math.min(1, dt * 6);
  // 미로 안에서는 카메라를 거의 수평으로 (울타리 너머 못 봐요)
  const pitch = Number.isFinite(M.lowCamAt(me.x, me.z)) ? Math.min(insidePitch, 0.05) : insidePitch;
  const cx = Math.sin(camYaw) * Math.cos(pitch), cy = Math.sin(pitch), cz = Math.cos(camYaw) * Math.cos(pitch);
  const maxY = inside ? me.y + 3.5 : Infinity;
  let d = 0.5;
  for (; d < CAM_D; d += 0.25) if (camBlocked(tx + cx * d, ty + cy * d, tz + cz * d, maxY)) { d -= 0.3; break; }
  d = Math.max(d, 1.0);
  const px = tx + cx * d, pz = tz + cz * d;
  const py = Math.min(ty + cy * d, me.y + M.lowCamAt(me.x, me.z)); // 미로 안에서는 낮게
  if (camSnap) { cam.position.set(px, py, pz); camSnap = false; }
  else {
    const k = 1 - Math.exp(-dt * 14);
    cam.position.x += (px - cam.position.x) * k; cam.position.y += (py - cam.position.y) * k; cam.position.z += (pz - cam.position.z) * k;
  }
  cam.lookAt(tx, ty, tz);
}

// ================= 화면 표시 =================
let hudCache = {}, mapT = 0;
function setText(id, v, html = false) {
  if (hudCache[id] === v) return;
  hudCache[id] = v;
  if (html) $(id).innerHTML = v; else $(id).textContent = v;
}
function setClass(id, cls, on) {
  const key = id + '.' + cls;
  if (hudCache[key] === on) return;
  hudCache[key] = on;
  $(id).classList.toggle(cls, on);
}

function updateHud(dt, s) {
  const sec = Math.ceil(s.tl);
  setText('timer', `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`);
  setClass('timer', 'hurry', sec <= 15);
  let total = 0, jailed = 0;
  for (const r of s.a) if (metaById.get(r[0])?.team === 'robber') { total++; if (r[6] & 1) jailed++; }
  setText('counts', `🦹 남은 도둑 ${total - jailed} · 🔒 감옥 ${jailed}`);

  let st = '';
  if (me.stun > 0) st = '💫 기절!';
  else if (me.hidden) st = '🌿 숨는 중 (경찰한테 안 보여요)';
  setText('status', st);

  let cd = '';
  if (s.ph === 'countdown') cd = String(Math.ceil(s.cnt));
  else if (s.ph === 'play' && s.pw > CFG.policeWait - 0.8) cd = '시작!';
  setText('countdown', cd);

  let center = '';
  if (me.jailed && s.ph !== 'end') center = '🔒 잡혔어요! 철창 가까이 가서 손을 내밀고 친구를 기다려요';
  else if (me.team === 'police' && s.ph === 'play' && s.pw > 0) center = `⏳ 경찰은 ${Math.ceil(s.pw)}초 뒤에 출발!`;
  setText('centerMsg', center);
  setClass('centerMsg', 'hidden', !center);

  setClass('actions', 'hidden', me.jailed || me.scoped);
  if (me.team === 'robber') {
    let html;
    if (me.sprintLeft > 0) html = `<span class="ic">🏃</span><br>${me.sprintLeft.toFixed(1)}초`;
    else if (me.sprintUsed) html = '<span class="ic">😮‍💨</span><br>다 썼어요';
    else html = '<span class="ic">🏃</span><br>5초 달리기';
    setText('sprintBtn', html, true);
    $('sprintBtn').disabled = me.sprintUsed && me.sprintLeft <= 0;
    setClass('sprintBtn', 'running', me.sprintLeft > 0);
  } else {
    const sn = me.gun === 'sniper';
    setText('gunBtn', !sn && me.gunCd > 0 ? `<span class="ic">🔫</span><br>${me.gunCd.toFixed(1)}` : sn ? '<span class="ic">🔭</span><br>조준' : '<span class="ic">🔫</span><br>총', true);
    setClass('gunBtn', 'cool', !sn && me.gunCd > 0);
    if (me.scoped) {
      setText('fireBtn', me.gunCd > 0 ? `<span class="ic">⏳</span><br>${me.gunCd.toFixed(1)}` : '<span class="ic">🎯</span><br>쏘기', true);
      $('fireBtn').disabled = me.gunCd > 0 || me.frozen;
    }
  }

  mapT -= dt;
  if (mapT <= 0) { mapT = 0.1; drawMinimap(s); }
}

function drawMinimap(s) {
  const c = $('minimap'), g = c.getContext('2d'), W = c.width, H = c.height, B = M.bounds;
  const sx = W / (B.x2 - B.x1), sz = H / (B.z2 - B.z1);
  const X = (x) => (x - B.x1) * sx, Z = (z) => (z - B.z1) * sz;
  g.clearRect(0, 0, W, H);
  g.fillStyle = 'rgba(30,80,30,.6)'; g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(255,255,255,.5)';
  for (const o of M.obstacles) if (!o.border) g.fillRect(X(o.x1), Z(o.z1), Math.max(1.5, (o.x2 - o.x1) * sx), Math.max(1.5, (o.z2 - o.z1) * sz));
  g.fillStyle = 'rgba(80,220,100,.8)';
  for (const h of M.hideZones) { g.beginPath(); g.arc(X(h.x), Z(h.z), 3, 0, 7); g.fill(); }
  const J = M.jail;
  g.strokeStyle = '#ffb020'; g.lineWidth = 4; g.strokeRect(X(J.x1), Z(J.z1), (J.x2 - J.x1) * sx, (J.z2 - J.z1) * sz);
  for (const r of s.a) {
    if (r[0] === me.id) continue;
    const team = metaById.get(r[0])?.team, jailed = r[6] & 1;
    if (team !== me.team && !jailed) continue; // 상대 팀은 안 보여요
    g.fillStyle = jailed ? '#adb5bd' : team === 'police' ? '#4d8dff' : '#ff5a5a';
    g.beginPath(); g.arc(X(r[1]), Z(r[3]), 6, 0, Math.PI * 2); g.fill();
  }
  const px = X(me.x), pz = Z(me.z), a = me.yaw;
  g.fillStyle = '#ffe14d'; g.strokeStyle = '#000'; g.lineWidth = 2;
  g.beginPath();
  g.moveTo(px + Math.sin(a) * 11, pz + Math.cos(a) * 11);
  g.lineTo(px + Math.sin(a + 2.5) * 8, pz + Math.cos(a + 2.5) * 8);
  g.lineTo(px + Math.sin(a - 2.5) * 8, pz + Math.cos(a - 2.5) * 8);
  g.closePath(); g.fill(); g.stroke();
}

let toastTimer;
function toast(text, ms = 2200) {
  const t = $('toast');
  t.textContent = text; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

// ================= 조작 (터치 / 키보드) =================
const input = { jx: 0, jy: 0, keys: {}, rescueHeld: false, rescueSent: false, jumpBuf: 0 };
const touchEl = $('touch'), joyBase = $('joyBase'), joyKnob = $('joyKnob');
const JOY_R = 55;
let joyId = null, camId = null, joyO = { x: 0, y: 0 }, camL = { x: 0, y: 0 };

function resetJoy() {
  joyId = null; input.jx = input.jy = 0;
  joyBase.style.left = joyBase.style.top = '';
  joyKnob.style.transform = '';
  joyBase.classList.remove('active');
}
touchEl.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  if (me && me.scoped) { // 조준경: 어디를 드래그해도 조준
    if (camId === null) { camId = e.pointerId; camL = { x: e.clientX, y: e.clientY }; touchEl.setPointerCapture(e.pointerId); }
    return;
  }
  if (e.clientX < innerWidth * 0.45 && joyId === null) {
    joyId = e.pointerId; joyO = { x: e.clientX, y: e.clientY };
    joyBase.style.left = e.clientX + 'px'; joyBase.style.top = e.clientY + 'px';
    joyBase.classList.add('active');
  } else if (camId === null) {
    camId = e.pointerId; camL = { x: e.clientX, y: e.clientY };
  }
  touchEl.setPointerCapture(e.pointerId);
});
touchEl.addEventListener('pointermove', (e) => {
  if (e.pointerId === joyId) {
    let dx = e.clientX - joyO.x, dy = e.clientY - joyO.y;
    const len = Math.hypot(dx, dy);
    if (len > JOY_R) { dx *= JOY_R / len; dy *= JOY_R / len; }
    input.jx = dx / JOY_R; input.jy = -dy / JOY_R;
    joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
  } else if (e.pointerId === camId && me && me.scoped) {
    aimYaw -= (e.clientX - camL.x) * 0.0022;
    aimPitch = clamp(aimPitch - (e.clientY - camL.y) * 0.0022, -1.3, 1.0);
    camL = { x: e.clientX, y: e.clientY };
  } else if (e.pointerId === camId) {
    camYaw -= (e.clientX - camL.x) * 0.006;
    camPitch = clamp(camPitch + (e.clientY - camL.y) * 0.004, 0.12, 1.1);
    camL = { x: e.clientX, y: e.clientY };
  }
});
const touchEnd = (e) => {
  if (e.pointerId === joyId) resetJoy();
  if (e.pointerId === camId) camId = null;
};
touchEl.addEventListener('pointerup', touchEnd);
touchEl.addEventListener('pointercancel', touchEnd);

function bindBtn(id, down, up) {
  const b = $(id);
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); b.classList.add('on'); down && down(); });
  const end = () => { b.classList.remove('on'); up && up(); };
  for (const t of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(t, end);
}
const inGame = () => session && me;
bindBtn('catchBtn', () => { if (inGame()) session.act('catch'); });
function gunPress() {
  if (!inGame() || me.team !== 'police') return;
  if (me.gun === 'sniper') { if (me.scoped) fire(); else setScope(true); }
  else session.act('shoot');
}
function fire() { if (inGame() && me.scoped) session.act('shoot', { aim: { yaw: aimYaw, pitch: aimPitch } }); }
bindBtn('gunBtn', gunPress);
bindBtn('fireBtn', fire);
bindBtn('unscopeBtn', () => setScope(false));
$('emoteBtn').addEventListener('click', () => $('emoteBar').classList.toggle('hidden'));
EMOTES.forEach((em, i) => {
  const b = document.createElement('button');
  b.textContent = em;
  b.addEventListener('click', () => { if (inGame()) session.act('emote', { i }); $('emoteBar').classList.add('hidden'); });
  $('emoteBar').appendChild(b);
});
bindBtn('sprintBtn', () => { if (inGame()) session.act('sprint'); });
bindBtn('jumpBtn', () => { input.jumpBuf = 0.15; });
bindBtn('rescueBtn', () => { input.rescueHeld = true; }, () => { input.rescueHeld = false; });

addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  input.keys[e.code] = true;
  if (!inGame()) return;
  if (e.code === 'Space') { e.preventDefault(); input.jumpBuf = 0.15; }
  if (e.code === 'KeyJ') { if (me.team === 'police') session.act('catch'); else input.rescueHeld = true; }
  if (e.code === 'KeyK') gunPress();
  if (e.code === 'Escape' && me.scoped) setScope(false);
  if (e.code.startsWith('Digit')) { const i = +e.code.slice(5) - 1; if (i >= 0 && i < EMOTES.length) session.act('emote', { i }); }
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') session.act('sprint');
});
addEventListener('keyup', (e) => {
  input.keys[e.code] = false;
  if (e.code === 'KeyJ') input.rescueHeld = false;
});
addEventListener('blur', () => { input.keys = {}; input.rescueHeld = false; resetJoy(); camId = null; });
document.addEventListener('contextmenu', (e) => e.preventDefault());

// ================= 전체화면 =================
const canFullscreen = !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
function goFullscreen() {
  const el = document.documentElement;
  try {
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      const p = el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : el.webkitRequestFullscreen();
      if (p && p.then) p.then(() => window.screen.orientation?.lock?.('landscape').catch(() => {})).catch(() => {});
    }
  } catch { /* 전체화면 안 되는 기기 */ }
}
if (!canFullscreen) $('fsBtn').classList.add('hidden');
if (/iPhone|iPod/.test(navigator.userAgent) && !navigator.standalone) $('iosTip').classList.remove('hidden');
$('fsBtn').addEventListener('click', () => {
  if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  else goFullscreen();
});
$('quitBtn').addEventListener('click', quitToLobby);
$('rotate').addEventListener('click', () => document.body.classList.add('rot-ok'));

// ================= 시작 화면 =================
function refreshLobby() {
  $('countVal').textContent = settings.players + '명';
  const p = policeCount(settings.players);
  const sn = sniperCount(p);
  $('teamInfo').textContent = `👮 경찰 ${p}명${sn > 1 ? ` (🔭 ${sn}명)` : ''} · 🦹 도둑 ${settings.players - p}명`;
  document.querySelectorAll('[data-map]').forEach((b) => b.classList.toggle('sel', b.dataset.map === settings.mapId));
  store.set('kd_players', settings.players); store.set('kd_map', settings.mapId);
  drawAvatarPreview();
}
for (const m of MAP_LIST) {
  const b = document.createElement('button');
  b.className = 'chip'; b.dataset.map = m.id; b.textContent = m.name;
  b.addEventListener('click', () => { settings.mapId = m.id; world.setMap(getMap(m.id)); refreshLobby(); });
  $('mapChips').appendChild(b);
}
$('nameIn').value = settings.name;
$('nameIn').addEventListener('input', () => {
  settings.name = $('nameIn').value.trim().slice(0, 8) || '친구';
  store.set('kd_name', settings.name);
});
$('minus').addEventListener('click', () => { settings.players = Math.max(4, settings.players - 1); refreshLobby(); });
$('plus').addEventListener('click', () => { settings.players = Math.min(MAX_PLAYERS, settings.players + 1); refreshLobby(); });
$('startBtn').addEventListener('click', () => { goFullscreen(); startSession(new LocalSession()); });
$('againBtn').addEventListener('click', () => startSession(new LocalSession()));
$('homeBtn').addEventListener('click', quitToLobby);

const hello = () => net.send({ t: 'hello', name: settings.name, avatar: settings.avatar });
$('createBtn').addEventListener('click', () => { hello(); net.send({ t: 'create', size: settings.players, map: settings.mapId }); });
$('autoBtn').addEventListener('click', () => { hello(); net.send({ t: 'auto' }); });
$('joinBtn').addEventListener('click', () => {
  const code = $('codeIn').value.trim();
  if (!/^\d{4}$/.test(code)) return msg('코드 숫자 4개를 넣어주세요');
  hello(); net.send({ t: 'join', code });
});
$('codeIn').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('joinBtn').click(); });

// ----- 대기실 -----
function showRoom(m) {
  if (screen !== 'room') { showScreen('room'); goFullscreen(); }
  $('roomCode').textContent = m.code;
  const mapName = MAP_LIST.find((x) => x.id === m.map)?.name || '';
  $('roomInfo').textContent = `${mapName} · ${m.players.length}/${m.size}명${m.isPublic ? ' · 🎲 자동 참가 방' : ''}`;
  const box = $('roomPlayers');
  box.innerHTML = '';
  for (const p of m.players) {
    const d = document.createElement('div');
    d.className = 'pl' + (p.me ? ' me' : '');
    if (p.avatar) { const img = document.createElement('img'); img.src = p.avatar; d.appendChild(img); }
    d.appendChild(document.createTextNode((p.host ? '👑 ' : '') + p.name + (p.me ? ' (나)' : '')));
    box.appendChild(d);
  }
  for (let i = m.players.length; i < m.size; i++) {
    const d = document.createElement('div'); d.className = 'pl ai'; d.textContent = '🤖 빈자리'; box.appendChild(d);
  }
  $('roomWait').textContent = m.players.length >= m.size ? '꽉 찼어요! 곧 시작해요 🎉' : `⏳ ${m.waitLeft}초 동안 아무도 안 들어오면 빈자리는 AI로 채우고 시작해요`;
  const host = m.players.find((p) => p.me)?.host;
  $('startNowBtn').classList.toggle('hidden', !host);
}
$('startNowBtn').addEventListener('click', () => net.send({ t: 'startNow' }));
$('leaveBtn').addEventListener('click', quitToLobby);

// ================= 아바타 그리기 =================
const av = $('avCanvas'), avg = av.getContext('2d');
const COLORS = ['#000000', '#ffffff', '#f2c9a0', '#c68e5d', '#8b5a2b', '#e03131', '#f783ac', '#fab005', '#40c057', '#228be6', '#7950f2', '#495057'];
let avColor = '#000000', avSize = 8, avLast = null;

function defaultFace(g, s) {
  g.fillStyle = '#f2c9a0'; g.fillRect(0, 0, s, s);
  g.fillStyle = '#222'; g.fillRect(s * 0.24, s * 0.36, s * 0.14, s * 0.16); g.fillRect(s * 0.62, s * 0.36, s * 0.14, s * 0.16);
  g.fillStyle = '#c0504d'; g.fillRect(s * 0.36, s * 0.7, s * 0.28, s * 0.06);
}
function drawAvatarPreview() {
  const c = $('avatarPrev'), g = c.getContext('2d');
  if (!settings.avatar) return defaultFace(g, 64);
  const img = new Image();
  img.onload = () => { g.clearRect(0, 0, 64, 64); g.drawImage(img, 0, 0, 64, 64); };
  img.src = settings.avatar;
}
for (const col of COLORS) {
  const b = document.createElement('button');
  b.className = 'sw' + (col === avColor ? ' sel' : ''); b.style.background = col;
  b.addEventListener('click', () => {
    avColor = col;
    document.querySelectorAll('.sw').forEach((x) => x.classList.toggle('sel', x === b));
  });
  $('palette').appendChild(b);
}
document.querySelectorAll('[data-size]').forEach((b) => b.addEventListener('click', () => {
  avSize = +b.dataset.size;
  document.querySelectorAll('[data-size]').forEach((x) => x.classList.toggle('sel', x === b));
}));
const avPos = (e) => { const r = av.getBoundingClientRect(); return { x: (e.clientX - r.left) * av.width / r.width, y: (e.clientY - r.top) * av.height / r.height }; };
av.addEventListener('pointerdown', (e) => { e.preventDefault(); av.setPointerCapture(e.pointerId); avLast = avPos(e); avDraw(avLast); });
av.addEventListener('pointermove', (e) => { if (avLast) { const p = avPos(e); avDraw(p); avLast = p; } });
for (const t of ['pointerup', 'pointercancel']) av.addEventListener(t, () => { avLast = null; });
function avDraw(p) {
  avg.strokeStyle = avColor; avg.lineWidth = avSize; avg.lineCap = 'round'; avg.lineJoin = 'round';
  avg.beginPath(); avg.moveTo(avLast.x, avLast.y); avg.lineTo(p.x + 0.01, p.y); avg.stroke();
}
// 아무것도 없는 빈 화면부터 시작해요
$('avatarBtn').addEventListener('click', () => { avg.clearRect(0, 0, 256, 256); showScreen('avatar'); });
$('avClear').addEventListener('click', () => avg.clearRect(0, 0, 256, 256));
$('avPhoto').addEventListener('click', () => $('avFile').click());
$('avFile').addEventListener('change', () => {
  const f = $('avFile').files[0];
  if (!f) return;
  const img = new Image();
  img.onload = () => {
    const s = Math.min(img.width, img.height);
    avg.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 256, 256);
    URL.revokeObjectURL(img.src);
  };
  img.src = URL.createObjectURL(f);
  $('avFile').value = '';
});
$('avSave').addEventListener('click', () => {
  const px = avg.getImageData(0, 0, 256, 256).data;
  let empty = true;
  for (let i = 3; i < px.length; i += 16) if (px[i] > 0) { empty = false; break; }
  if (empty) { settings.avatar = null; store.set('kd_avatar', ''); refreshLobby(); return showScreen('lobby'); }
  const small = document.createElement('canvas'); small.width = small.height = 64;
  const sg = small.getContext('2d');
  sg.fillStyle = '#f2c9a0'; sg.fillRect(0, 0, 64, 64); // 빈 곳은 피부색
  sg.drawImage(av, 0, 0, 64, 64);
  settings.avatar = small.toDataURL('image/png');
  store.set('kd_avatar', settings.avatar);
  refreshLobby(); showScreen('lobby');
});
$('avRemove').addEventListener('click', () => { settings.avatar = null; store.set('kd_avatar', ''); refreshLobby(); showScreen('lobby'); });
$('avCancel').addEventListener('click', () => showScreen('lobby'));

if (MAP_LIST.some((m) => m.id === settings.mapId)) world.setMap(getMap(settings.mapId));
refreshLobby();

// ================= 돌리기 =================
let lastT = performance.now(), lobbyT = 0, clockT = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min((now - lastT) / 1000, 0.05);
  lastT = now; clockT += dt;
  if (session && me) gameFrame(dt, clockT);
  else { // 시작 화면 뒤에서 맵 빙글빙글
    lobbyT += dt * 0.06;
    const B = getMap(world.mapId).bounds, cx = (B.x1 + B.x2) / 2, cz = (B.z1 + B.z2) / 2;
    world.camera.position.set(cx + Math.cos(lobbyT) * 60, 36, cz + Math.sin(lobbyT) * 50);
    world.camera.lookAt(cx, 0, cz);
  }
  world.render();
}
requestAnimationFrame(loop);

// 테스트용
window.__game = { get session() { return session; }, get me() { return me; }, settings, CFG, net };
