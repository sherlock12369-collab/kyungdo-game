// 🧱 블럭 크리에이티브: 화면, 조작, 몸 움직이기, 친구랑 같이
import * as THREE from 'three';
import { BLOCKS, ID, blockIcon } from './blocks.js';
import { VoxelWorld, SX, SY, SZ, GROUND } from './voxel.js';
import { AgentView } from '../render.js';
import { BLUEPRINTS, build, dirFromYaw } from './blueprints.js';
import { Vehicle, VTYPES, VCOLORS } from './vehicles.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* 저장 안 되는 브라우저 */ } },
};
const SAVE_KEY = 'kd_cr_world_v1', VEH_KEY = 'kd_cr_veh_v1';
const myName = store.get('kd_name', '') || '친구' + Math.floor(10 + Math.random() * 90);
const isPC = !matchMedia('(pointer: coarse)').matches && !location.search.includes('touch');
if (isPC) document.body.classList.add('pc');

// ================= 3D 화면 =================
const renderer = new THREE.WebGLRenderer({ canvas: $('view'), antialias: !isPC ? false : true });
renderer.setPixelRatio(Math.min(devicePixelRatio, isPC ? 2 : 1.5));
const scene = new THREE.Scene();
const SKY = 0x9fd4ff;
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, isPC ? 45 : 35, isPC ? 95 : 75);
scene.add(new THREE.HemisphereLight(0xffffff, 0x667755, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(30, 60, 20); scene.add(sun);
const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 200);
camera.rotation.order = 'YXZ';
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

const world = new VoxelWorld(scene);
// 세상 가장자리 아래 바닥 (끝 너머가 하늘만 보이지 않게)
{
  const g = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshBasicMaterial({ color: 0x4f8f34 }));
  g.rotation.x = -Math.PI / 2; g.position.set(SX / 2, GROUND - 1.05, SZ / 2); scene.add(g);
}
// 바라보는 블럭 테두리
const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004)), new THREE.LineBasicMaterial({ color: 0x000000 }));
outline.visible = false; scene.add(outline);

// ================= 나 =================
const P = { x: SX / 2 + 0.5, y: GROUND, z: SZ / 2 + 0.5, vx: 0, vy: 0, vz: 0, ground: false, fly: false, ms: 0 };
let yaw = 0, pitch = -0.2, third = false;
const HW = 0.3, HH = 1.8, EYE = 1.62;
const meView = new AgentView(scene, { id: 1, team: 'robber', name: myName, avatar: store.get('kd_avatar', '') || null, gun: null }, true);
meView.mesh.scale.setScalar(0.62);

// ================= 아이템칸 9개 =================
let hot = [ID.grass, ID.dirt, ID.stone, ID.planks, ID.log, ID.brick, ID.glass, ID.leaves, ID.red];
try { const h = JSON.parse(store.get('kd_cr_hot', 'null')); if (Array.isArray(h) && h.length === 9 && h.every((i) => BLOCKS[i] && BLOCKS[i].palette)) hot = h; } catch { /* 처음 */ }
let sel = 0;
function drawHotbar() {
  const hb = $('hotbar'); hb.innerHTML = '';
  hot.forEach((id, i) => {
    const b = document.createElement('button');
    b.className = 'slot' + (i === sel ? ' sel' : '');
    b.appendChild(blockIcon(id, 32));
    const n = document.createElement('span'); n.className = 'n'; n.textContent = i + 1; b.appendChild(n);
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); select(i); });
    hb.appendChild(b);
  });
}
let nameT;
function select(i) {
  sel = (i + 9) % 9; drawHotbar();
  const el = $('blockName'); el.textContent = BLOCKS[hot[sel]].name; el.style.opacity = 1;
  clearTimeout(nameT); nameT = setTimeout(() => { el.style.opacity = 0; }, 1200);
}
function setHot(id) { hot[sel] = id; store.set('kd_cr_hot', JSON.stringify(hot)); select(sel); }
drawHotbar();

// 블럭 고르는 창
{
  const grid = $('grid');
  BLOCKS.forEach((b, id) => {
    if (!b || !b.palette) return;
    const btn = document.createElement('button');
    btn.appendChild(blockIcon(id, 40));
    btn.appendChild(document.createTextNode(b.name));
    btn.addEventListener('click', () => { setHot(id); openPicker(false); });
    grid.appendChild(btn);
  });
}
function openPicker(on) {
  $('picker').classList.toggle('hidden', !on);
  if (on && document.pointerLockElement) document.exitPointerLock();
}
$('pickBtn').addEventListener('click', () => openPicker(true));
$('pickClose').addEventListener('click', () => openPicker(false));

let toastT;
function toast(t) { const el = $('toast'); el.textContent = t; el.style.opacity = 1; clearTimeout(toastT); toastT = setTimeout(() => { el.style.opacity = 0; }, 2200); }

// ================= 저장 / 친구 =================
let room = null, isHost = false, playing = false, pending = [], saveT = null;
function saveSoon() {
  if (room && !isHost) return; // 친구 방에서는 방장이 저장해요
  clearTimeout(saveT);
  saveT = setTimeout(saveNow, 1500);
}
function saveNow() {
  clearTimeout(saveT); saveT = null;
  if (!room || isHost) { store.set(SAVE_KEY, JSON.stringify(world.diffList())); store.set(VEH_KEY, JSON.stringify(vehList())); }
}
function loadSaved() {
  try { const l = JSON.parse(store.get(SAVE_KEY, '[]')); world.loadDiff(Array.isArray(l) ? l : []); } catch { world.reset(); }
  try { loadVehs(JSON.parse(store.get(VEH_KEY, '[]'))); } catch { loadVehs([]); }
}
addEventListener('beforeunload', () => { if (playing) saveNow(); if (room) room.leave(); });
addEventListener('pagehide', () => { if (playing) saveNow(); });

// 블럭 바꾸기 (내가 바꾼 것은 친구한테도 보내요)
function edit(x, y, z, id) {
  if (!world.set(x, y, z, id)) return false;
  pending.push(world.idx(x, y, z), id);
  saveSoon();
  return true;
}

// 다른 친구 모습
const others = new Map();
const hashId = (s) => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return 2 + (h % 1000); };
function onPose(m) {
  if (m.t === 'gone') {
    const o = others.get(m.id); if (o) { scene.remove(o.view.mesh); others.delete(m.id); }
    for (const [, v] of vehicles) if (v.rider === m.id) { v.rider = null; v.tgt = null; }
    return;
  }
  let o = others.get(m.id);
  if (!o) {
    const view = new AgentView(scene, { id: hashId(m.id), team: 'robber', name: m.n, avatar: null, gun: null }, false);
    view.mesh.scale.setScalar(0.62);
    o = { view, row: null }; others.set(m.id, o);
  }
  o.row = [0, m.x, m.y, m.z, m.yaw, m.ms, 0];
}
function onEdits(b) { for (let k = 0; k + 1 < b.length; k += 2) if (world.setIdx(b[k], b[k + 1])) saveSoon(); }

async function startRoom(code, host) {
  const { makeRoom } = await import('./cnet.js');
  room = makeRoom({
    code, host, name: myName, onPose, onEdits,
    onWorld: (list, vs) => { world.loadDiff(list); loadVehs(vs || []); spawn(); },
    onVeh, getVehs: vehList,
    onLost: (t) => { quit(); msg(t); },
    getWorld: () => world.diffList(),
  });
  isHost = host;
  if (host) await room.ready; else await room.join();
}

function msg(t) { $('msg').textContent = t; }

// ================= 시작 / 끝 =================
function spawn() {
  const x = Math.floor(SX / 2), z = Math.floor(SZ / 2);
  let y = SY - 1; while (y > 0 && !world.solidAt(x, y - 1, z)) y--;
  while (y < SY - 2 && (world.solidAt(x, y, z) || world.solidAt(x, y + 1, z))) y++;
  Object.assign(P, { x: x + 0.5, y, z: z + 0.5, vx: 0, vy: 0, vz: 0, fly: false });
  yaw = 0; pitch = -0.2;
}
function enterGame(info) {
  playing = true;
  $('menu').classList.add('hidden'); $('hud').classList.remove('hidden');
  infoText = info; world.rebuild(1000); select(sel); setFly(false);
  last = performance.now();
}
let infoText = '';
$('soloBtn').addEventListener('click', () => { room = null; isHost = false; loadSaved(); spawn(); enterGame('🧑 혼자 짓기'); });
$('hostBtn').addEventListener('click', async () => {
  msg('방 만드는 중… ⏳');
  const code = String(1000 + Math.floor(Math.random() * 9000));
  loadSaved(); spawn();
  try { await startRoom(code, true); } catch { room = null; msg('인터넷이 안 돼서 방을 못 만들었어요 😢'); return; }
  msg(''); enterGame('🏠 방 ' + code); roomCode = code;
});
let roomCode = '';
$('joinBtn').addEventListener('click', async () => {
  const code = $('codeIn').value.trim();
  if (!/^\d{4}$/.test(code)) { msg('코드 숫자 4개를 써 주세요'); return; }
  msg('들어가는 중… ⏳');
  try { await startRoom(code, false); } catch (e) {
    if (room) room.leave(); room = null;
    msg(e && e.message === 'noroom' ? '그 코드의 방이 없어요 🤔' : '인터넷이 안 돼서 못 들어갔어요 😢'); return;
  }
  msg(''); roomCode = code; enterGame('👫 방 ' + code);
});
let resetArmed = false;
$('resetBtn').addEventListener('click', () => {
  if (!resetArmed) { resetArmed = true; $('resetBtn').textContent = '⚠️ 정말요? 한 번 더 누르면 다 지워져요'; setTimeout(() => { resetArmed = false; $('resetBtn').textContent = '🌱 새 세상 (지은 거 다 지우기)'; }, 4000); return; }
  resetArmed = false; store.set(SAVE_KEY, '[]'); world.reset(); $('resetBtn').textContent = '🌱 새 세상 (지은 거 다 지우기)'; msg('새 세상이 됐어요 🌱');
});
function quit() {
  if (!playing) return;
  if (riding) unride();
  saveNow(); playing = false;
  if (room) { room.leave(); room = null; }
  for (const [, o] of others) scene.remove(o.view.mesh);
  others.clear();
  if (document.pointerLockElement) document.exitPointerLock();
  $('menu').classList.remove('hidden'); $('hud').classList.add('hidden'); openPicker(false); openBp(false);
}
$('quitBtn').addEventListener('click', () => { quit(); msg(''); });

// ================= 조작 =================
const keys = {};
let joy = { x: 0, y: 0 }, jumpHeld = false, downHeld = false, breakHeld = false, placeHeld = false, lastJumpTap = 0;
function setFly(on) {
  P.fly = on; if (on) P.vy = 0;
  $('flyBtn').classList.toggle('flying', on);
  $('flyBtn').innerHTML = on ? '<span class="ic">🚶</span><br>걷기' : '<span class="ic">✈️</span><br>날기';
  $('downBtn').classList.toggle('hidden', !on);
  $('jumpBtn').innerHTML = on ? '<span class="ic">⬆</span><br>올라가기' : '<span class="ic">🦘</span><br>점프';
}
function jumpTap() {
  const t = performance.now();
  if (t - lastJumpTap < 300) { setFly(!P.fly); lastJumpTap = 0; } else lastJumpTap = t;
}

addEventListener('keydown', (e) => {
  if (!playing || e.target.tagName === 'INPUT') return;
  const k = e.code;
  if (!keys[k]) {
    if (k === 'Space') jumpTap();
    if (k === 'KeyF') setFly(!P.fly);
    if (k === 'KeyV') third = !third;
    if (k === 'KeyE') openPicker($('picker').classList.contains('hidden'));
    if (k === 'KeyR') rideToggle();
    if (k === 'KeyC') openVp(!vpOpen());
    if (/^Digit[1-9]$/.test(k)) select(+k.slice(5) - 1);
  }
  keys[k] = true;
  if (k === 'Space') e.preventDefault();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });

// 컴퓨터: 마우스
const canvas = $('view'), touchEl = $('touch');
touchEl.addEventListener('mousedown', (e) => {
  if (!isPC || !playing) return;
  if (!document.pointerLockElement) { canvas.requestPointerLock(); return; }
});
document.addEventListener('mousedown', (e) => {
  if (!document.pointerLockElement || !playing) return;
  if (e.button === 0) { breakHeld = true; doBreak(); repT = 0.3; }
  if (e.button === 2) { placeHeld = true; doPlace(); repT = 0.3; }
  if (e.button === 1) { e.preventDefault(); doPick(); }
});
document.addEventListener('mouseup', (e) => { if (e.button === 0) breakHeld = false; if (e.button === 2) placeHeld = false; });
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('mousemove', (e) => {
  if (!document.pointerLockElement) return;
  yaw -= e.movementX * 0.0024; pitch = clamp(pitch - e.movementY * 0.0024, -1.55, 1.55);
});
addEventListener('wheel', (e) => { if (playing && document.pointerLockElement) select(sel + Math.sign(e.deltaY)); }, { passive: true });

// 손가락: 왼쪽 = 걷기, 오른쪽 = 둘러보기
const joyBase = $('joyBase'), joyKnob = $('joyKnob');
let joyId = null, joyO = null, camId = null, camL = null;
touchEl.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse') return;
  e.preventDefault();
  if (e.clientX < innerWidth * 0.4 && joyId === null) {
    joyId = e.pointerId; joyO = { x: e.clientX, y: e.clientY };
    joyBase.style.left = e.clientX + 'px'; joyBase.style.top = e.clientY + 'px'; joyBase.classList.add('active');
  } else if (camId === null) { camId = e.pointerId; camL = { x: e.clientX, y: e.clientY }; }
  touchEl.setPointerCapture(e.pointerId);
});
touchEl.addEventListener('pointermove', (e) => {
  if (e.pointerId === joyId) {
    let dx = e.clientX - joyO.x, dy = e.clientY - joyO.y;
    const d = Math.hypot(dx, dy), m = 55;
    if (d > m) { dx *= m / d; dy *= m / d; }
    joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
    joy = { x: dx / m, y: dy / m };
  } else if (e.pointerId === camId) {
    yaw -= (e.clientX - camL.x) * 0.006; pitch = clamp(pitch - (e.clientY - camL.y) * 0.006, -1.55, 1.55);
    camL = { x: e.clientX, y: e.clientY };
  }
});
const touchEnd = (e) => {
  if (e.pointerId === joyId) { joyId = null; joy = { x: 0, y: 0 }; joyKnob.style.transform = ''; joyBase.classList.remove('active'); }
  if (e.pointerId === camId) camId = null;
};
touchEl.addEventListener('pointerup', touchEnd);
touchEl.addEventListener('pointercancel', touchEnd);

function holdBtn(el, down, up) {
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); el.classList.add('on'); down(); });
  const end = () => { el.classList.remove('on'); up && up(); };
  for (const t of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(t, end);
}
let repT = 0;
holdBtn($('breakBtn'), () => { breakHeld = true; doBreak(); repT = 0.3; }, () => { breakHeld = false; });
holdBtn($('placeBtn'), () => { placeHeld = true; doPlace(); repT = 0.3; }, () => { placeHeld = false; });
holdBtn($('jumpBtn'), () => { jumpHeld = true; jumpTap(); }, () => { jumpHeld = false; });
holdBtn($('downBtn'), () => { downHeld = true; }, () => { downHeld = false; });
holdBtn($('flyBtn'), () => setFly(!P.fly));
$('viewBtn').addEventListener('click', () => { third = !third; });
// 📱 폰은 전체 화면이 훨씬 넓어요
$('fsBtn').addEventListener('click', () => {
  const d = document, el = d.documentElement;
  if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
  else (el.requestFullscreen || el.webkitRequestFullscreen || (() => {})).call(el);
});

// ================= 블럭 놓기 / 부수기 =================
const eye = () => new THREE.Vector3(P.x, P.y + EYE, P.z);
const lookDir = () => new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
let target = null;
function aim() { target = world.raycast(eye(), lookDir(), 6); }
function doBreak() {
  aim();
  if (!target || BLOCKS[target.id].hard === Infinity) return;
  edit(target.x, target.y, target.z, 0);
}
function bodyHits(x, y, z, b) { // 이 칸이 몸이랑 겹쳐요?
  return x + 1 > b.x - HW && x < b.x + HW && z + 1 > b.z - HW && z < b.z + HW && y + 1 > b.y && y < b.y + HH;
}
function doPlace() {
  aim();
  if (!target) return;
  const x = target.x + target.n[0], y = target.y + target.n[1], z = target.z + target.n[2];
  if (!world.inside(x, y, z) || y === 0) return;
  const cur = world.get(x, y, z);
  if (cur && cur !== ID.water) return;
  const id = hot[sel];
  if (BLOCKS[id].solid) {
    if (bodyHits(x, y, z, P)) return;
    for (const [, o] of others) if (o.view.s && bodyHits(x, y, z, o.view.s)) return;
  }
  edit(x, y, z, id);
}
function doPick() { aim(); if (target && BLOCKS[target.id].palette) setHot(target.id); }

// ================= 몸 움직이기 (부딪히기, 중력, 날기) =================
function collides(x, y, z) {
  for (let X = Math.floor(x - HW); X <= Math.floor(x + HW - 1e-6); X++)
    for (let Y = Math.floor(y); Y <= Math.floor(y + HH - 1e-6); Y++)
      for (let Z = Math.floor(z - HW); Z <= Math.floor(z + HW - 1e-6); Z++)
        if (world.solidAt(X, Y, Z)) return true;
  return false;
}
function moveAxis(ax, amt) {
  if (!amt) return false;
  const n = Math.ceil(Math.abs(amt) / 0.3), s = amt / n;
  for (let i = 0; i < n; i++) {
    P[ax] += s;
    if (!collides(P.x, P.y, P.z)) continue;
    if (ax === 'y') P.y = s < 0 ? Math.floor(P.y) + 1 : Math.floor(P.y + HH) - HH - 0.001;
    else P[ax] = s > 0 ? Math.floor(P[ax] + HW) - HW - 0.001 : Math.floor(P[ax] - HW) + 1 + HW + 0.001;
    return true;
  }
  return false;
}
function physics(dt) {
  // 블럭 안에 갇히면 위로 빼 줘요
  for (let k = 0; k < SY && collides(P.x, P.y, P.z); k++) P.y = Math.floor(P.y) + 1;
  let fw = -joy.y, st = joy.x;
  if (keys.KeyW || keys.ArrowUp) fw += 1; if (keys.KeyS || keys.ArrowDown) fw -= 1;
  if (keys.KeyD || keys.ArrowRight) st += 1; if (keys.KeyA || keys.ArrowLeft) st -= 1;
  const len = Math.hypot(fw, st); if (len > 1) { fw /= len; st /= len; }
  const inWater = world.get(Math.floor(P.x), Math.floor(P.y + 0.4), Math.floor(P.z)) === ID.water;
  const speed = P.fly ? 10 : inWater ? 2.6 : 4.6;
  const sn = Math.sin(yaw), cs = Math.cos(yaw);
  P.vx = (-sn * fw + cs * st) * speed;
  P.vz = (-cs * fw - sn * st) * speed;
  const up = jumpHeld || keys.Space, down = downHeld || keys.ShiftLeft || keys.ShiftRight;
  if (P.fly) P.vy = ((up ? 1 : 0) - (down ? 1 : 0)) * 9;
  else if (inWater) { P.vy = up ? 3.2 : Math.max(P.vy - 9 * dt, -2.5); }
  else {
    P.vy = Math.max(P.vy - 28 * dt, -40);
    if (up && P.ground) P.vy = 8.6;
  }
  const hx = moveAxis('x', P.vx * dt), hz = moveAxis('z', P.vz * dt);
  // 한 칸짜리 턱은 자동 점프
  if ((hx || hz) && P.ground && !P.fly && len > 0.3) {
    const ox = P.x + Math.sign(P.vx) * 0.35 * (hx ? 1 : 0), oz = P.z + Math.sign(P.vz) * 0.35 * (hz ? 1 : 0);
    if (!collides(ox, P.y + 1.05, oz)) P.vy = 8.6;
  }
  const fallV = P.vy;
  const hy = moveAxis('y', P.vy * dt);
  P.ground = hy && P.vy < 0;
  if (hy) { if (P.ground && P.fly && down) setFly(false); P.vy = 0; }
  // 젤리 위에 떨어지면 통통 튀어요
  if (P.ground && !P.fly && fallV < -4 && world.get(Math.floor(P.x), Math.floor(P.y - 0.5), Math.floor(P.z)) === ID.jelly) { P.vy = Math.min(16, -fallV * 0.85); P.ground = false; }
  if (P.y < -10) spawn();
  P.ms = Math.hypot(P.vx, P.vz);
}

// ================= 🚗 탈것 =================
const vehicles = new Map();
let riding = null, vehSaveT = 0;
const myRid = () => (room ? room.myId : 'me');
const vehList = () => [...vehicles.values()].map((v) => v.state(0));
function addVehicle(type, x, y, z, vy, send, id, color) {
  id = id || 'v' + Math.random().toString(36).slice(2, 8);
  if (vehicles.has(id)) return vehicles.get(id);
  const v = new Vehicle(scene, id, type, x, y, z, vy, color ?? VCOLORS[Math.floor(Math.random() * VCOLORS.length)]);
  vehicles.set(id, v);
  if (send && room) room.veh(v.state(0));
  saveSoon();
  return v;
}
function delVehicle(id, send) {
  const v = vehicles.get(id); if (!v) return;
  if (riding === v) unride();
  v.remove(); vehicles.delete(id);
  if (send && room) room.vehDel(id);
  saveSoon();
}
function loadVehs(list) {
  riding = null;
  for (const [, v] of vehicles) v.remove();
  vehicles.clear();
  if (Array.isArray(list)) for (const s of list) if (Array.isArray(s) && VTYPES[s[1]]) addVehicle(s[1], s[2], s[3], s[4], s[5], false, s[0], s[6]);
}
function onVeh(m) {
  if (m.t === 'vx') { delVehicle(m.id, false); return; }
  const s = m.s; if (!Array.isArray(s) || !VTYPES[s[1]]) return;
  let v = vehicles.get(s[0]);
  if (!v) v = addVehicle(s[1], s[2], s[3], s[4], s[5], false, s[0], s[6]);
  if (v === riding) return;               // 내가 운전 중이면 내 게 맞아요
  if (s[7]) { v.rider = s[7]; v.netSet(s); }
  else { v.rider = null; v.tgt = null; Object.assign(v, { x: s[2], y: s[3], z: s[4], yaw: s[5], rail: null }); v.place(); saveSoon(); }
}
// 내 앞 3칸 땅 위에 탈것 꺼내기
function spawnVehicle(type) {
  openVp(false);
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw), d = type === 'car' ? 4 : 3;
  let x = P.x + fx * d, z = P.z + fz * d;
  if (type === 'cart') { // 가까운 레일을 찾아서 올려요
    let best = null;
    for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) for (let dy = -2; dy <= 2; dy++) {
      const X = Math.floor(x) + dx, Y = Math.floor(P.y) + dy, Z = Math.floor(z) + dz;
      if (world.get(X, Y, Z) !== ID.rail) continue;
      const dist = Math.hypot(X + 0.5 - x, Z + 0.5 - z) + Math.abs(dy) * 0.5;
      if (!best || dist < best.dist) best = { X, Y, Z, dist };
    }
    if (best) { const v = addVehicle('cart', best.X + 0.5, best.Y + 0.04, best.Z + 0.5, yaw, true); toast('🛒 레일 위에 놓았어요! 타 보세요'); return v; }
    toast('🛤️ 레일이 없어요! 📖 설명서 → 레일 길, 또는 레일 블럭을 깔아 주세요');
  }
  const cx = clamp(Math.floor(x), 1, SX - 2), cz = clamp(Math.floor(z), 1, SZ - 2);
  let y = clamp(Math.floor(P.y) + 3, 1, SY - 2);
  while (y > 1 && !world.solidAt(cx, y - 1, cz)) y--;
  const v = addVehicle(type, x, y + 0.001, z, yaw, true);
  if (type !== 'cart') toast(VTYPES[type].icon + ' ' + VTYPES[type].name + ' 나왔어요! 가까이 가서 타기');
  return v;
}
function nearestVehicle(max = 3.2) {
  let best = null, bd = max;
  for (const [, v] of vehicles) {
    const d = Math.hypot(v.x - P.x, v.z - P.z) + Math.max(0, Math.abs(v.y - P.y) - 1);
    if (d < bd && (!v.rider || v.rider === myRid())) { best = v; bd = d; }
  }
  return best;
}
function ride(v) {
  riding = v; v.rider = myRid(); v.tgt = null; v.v = 0;
  if (P.fly) setFly(false);
  document.body.classList.add('riding');
  if (room) room.veh(v.state(myRid()));
  toast(VTYPES[v.type].icon + (isPC ? ' W/S 앞뒤, A/D 핸들, R 내리기' : ' 왼쪽 손가락으로 운전해요'));
}
function unride() {
  const v = riding; if (!v) return;
  riding = null; v.rider = null; v.v = 0;
  const p = v.exitSpot(collides);
  Object.assign(P, { x: p.x, y: p.y, z: p.z, vx: 0, vy: 0, vz: 0 });
  document.body.classList.remove('riding');
  if (room) room.veh(v.state(0));
  saveSoon();
}
function rideToggle() { if (riding) unride(); else { const v = nearestVehicle(); if (v) ride(v); } }
function vehTick(dt, paused) {
  for (const [, v] of vehicles) {
    if (v === riding) {
      let fw = -joy.y, st = joy.x;
      if (!paused) {
        if (keys.KeyW || keys.ArrowUp) fw += 1; if (keys.KeyS || keys.ArrowDown) fw -= 1;
        if (keys.KeyD || keys.ArrowRight) st += 1; if (keys.KeyA || keys.ArrowLeft) st -= 1;
      } else { fw = 0; st = 0; }
      v.drive(world, dt, clamp(fw, -1, 1), clamp(st, -1, 1));
    } else if (v.rider) v.follow(dt);
    else v.idle(world, dt);
  }
  if (riding) {
    const s = riding.seat();
    P.x = s.x; P.y = s.y; P.z = s.z; P.ms = 0; P.vy = 0;
    yaw = angTo(yaw, riding.yaw, Math.min(1, dt * 3)); // 카메라가 탈것 뒤로 따라가요
    if ((vehSaveT -= dt) <= 0) { vehSaveT = 2; saveSoon(); }
  }
  // 타기 버튼
  const near = riding ? null : nearestVehicle();
  const rb = $('rideBtn');
  rb.classList.toggle('hidden', !riding && !near);
  if (riding) rb.textContent = '🚶 내리기' + (isPC ? ' (R)' : '');
  else if (near) rb.textContent = VTYPES[near.type].icon + ' 타기' + (isPC ? ' (R)' : '');
}
function angTo(a, b, k) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * k; }
const vpOpen = () => !$('vPanel').classList.contains('hidden');
function openVp(on) { $('vPanel').classList.toggle('hidden', !on); if (on && document.pointerLockElement) document.exitPointerLock(); }
for (const type of Object.keys(VTYPES)) {
  const b = document.createElement('button');
  b.innerHTML = '<span class="ic">' + VTYPES[type].icon + '</span>' + VTYPES[type].name;
  b.addEventListener('click', () => spawnVehicle(type));
  $('vGrid').appendChild(b);
}
{
  const b = document.createElement('button');
  b.innerHTML = '<span class="ic">🛤️</span>레일 블럭 받기';
  b.addEventListener('click', () => { setHot(ID.rail); openVp(false); toast('🛤️ 레일을 손에 들었어요! 땅에 깔아 보세요'); });
  $('vGrid').appendChild(b);
  const c = document.createElement('button');
  c.innerHTML = '<span class="ic">🧹</span>가까운 탈것 치우기';
  c.addEventListener('click', () => {
    openVp(false);
    const v = riding || nearestVehicle(6);
    if (v) { delVehicle(v.id, true); toast('🧹 치웠어요'); } else toast('가까이에 탈것이 없어요');
  });
  $('vGrid').appendChild(c);
}
$('vBtn').addEventListener('click', () => openVp(true));
$('vClose').addEventListener('click', () => openVp(false));
$('rideBtn').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); rideToggle(); });

// ================= 📖 설명서 (자동으로 짓기) =================
const bpOpen = () => !$('bpPanel').classList.contains('hidden');
function openBp(on) {
  $('bpPanel').classList.toggle('hidden', !on);
  if (on && document.pointerLockElement) document.exitPointerLock();
}
function buildBlueprint(bp) {
  const dir = dirFromYaw(yaw), f = [[0, 1], [1, 0], [0, -1], [-1, 0]][dir];
  const ox = Math.floor(P.x) + f[0] * 3, oz = Math.floor(P.z) + f[1] * 3; // 내 앞 3칸
  let oy = clamp(Math.floor(P.y) + 1, 1, SY - 1);               // 그 자리 땅 높이 찾기
  while (oy > 1 && !world.solidAt(ox, oy - 1, oz)) oy--;
  toast(bp.icon + ' ' + bp.name + ' 짓는 중… 🔨');
  return build(bp, ox, oy, oz, dir, edit, 40, () => {
    toast(bp.icon + ' ' + bp.name + ' 완성! 🎉');
    if (bp.key === 'track') addVehicle('cart', ox + 0.5, oy + 0.04, oz + 0.5, yaw, true); // 레일 길에는 카트도 하나 줘요
  });
}
for (const bp of BLUEPRINTS) {
  const b = document.createElement('button');
  b.innerHTML = '<span class="ic">' + bp.icon + '</span>' + bp.name;
  b.addEventListener('click', () => { openBp(false); buildBlueprint(bp); });
  $('bpGrid').appendChild(b);
}
$('bpBtn').addEventListener('click', () => openBp(true));
$('bpClose').addEventListener('click', () => openBp(false));
addEventListener('keydown', (e) => { if (playing && e.code === 'KeyB' && e.target.tagName !== 'INPUT') openBp(!bpOpen()); });

// ================= 그리기 =================
let last = performance.now(), poseT = 0, flushT = 0, t = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
  world.rebuild(4);
  if (playing) {
    const paused = !$('picker').classList.contains('hidden') || bpOpen() || vpOpen(); // 창 열려 있으면 안 움직여요
    vehTick(dt, paused);
    if (!paused && !riding) physics(dt);
    // 꾹 누르면 계속 놓기/부수기
    if (breakHeld || placeHeld) { repT -= dt; if (repT <= 0) { repT = 0.22; if (breakHeld) doBreak(); else doPlace(); } }
    aim();
    outline.visible = !!target;
    if (target) outline.position.set(target.x + 0.5, target.y + 0.5, target.z + 0.5);

    // 카메라
    const e = eye(), d = lookDir();
    camera.rotation.set(pitch, yaw, 0);
    if (third || riding) {
      const far = riding ? (riding.type === 'car' ? 6.5 : 5) : 4.5;
      const hit = world.raycast(e, d.clone().negate(), far);
      const dist = hit ? Math.max(0.3, hit.t - 0.25) : far;
      camera.position.copy(e).addScaledVector(d, -dist);
    } else camera.position.copy(e);
    meView.apply([0, P.x, P.y, P.z, (riding ? riding.yaw : yaw) + Math.PI, riding ? 0 : P.ms, 0], dt, true);
    meView.update(dt, t, 'robber', { x: P.x, z: P.z, scoped: false });
    meView.mesh.visible = third || !!riding;
    meView.label.visible = false;

    for (const [, o] of others) if (o.row) { o.view.apply(o.row, dt); o.view.update(dt, t, 'robber', { x: P.x, z: P.z, scoped: false }); }

    if (room) {
      poseT -= dt; flushT -= dt;
      if (poseT <= 0 && riding) room.veh(riding.state(room.myId));
      if (poseT <= 0) { poseT = 1 / 8; room.pose({ x: +P.x.toFixed(2), y: +P.y.toFixed(2), z: +P.z.toFixed(2), yaw: +(yaw + Math.PI).toFixed(2), ms: +P.ms.toFixed(1) }); }
      if (flushT <= 0) { flushT = 1 / 8; room.edits(pending); pending = []; }
      $('info').textContent = infoText + ' · 👥 ' + room.count() + '명';
    } else { pending = []; $('info').textContent = infoText; }
  }
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

// 메뉴 뒤에 보이는 풍경
loadSaved(); world.rebuild(1000);
camera.position.set(SX / 2 - 20, GROUND + 14, SZ / 2 + 26); camera.lookAt(SX / 2, GROUND, SZ / 2);
window.__cr = { world, P, vehicles, spawnVehicle, rideToggle, get riding() { return riding; }, keys, get target() { return target; }, edit, setFly, select, buildBlueprint, BLUEPRINTS, setYaw: (v) => { yaw = v; }, setPitch: (v) => { pitch = v; } };
