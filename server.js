// 경도 게임 서버: npm start (또는 node server.js)
// - 웹페이지 보내주기
// - 친구랑 하기: 방 만들기 / 코드로 들어가기 / 자동 참가
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Game, MAX_PLAYERS } from './public/shared/sim.js';
import { MAP_LIST } from './public/shared/map.js';

const PORT = Number(process.env.PORT) || 8080;
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};

const server = http.createServer((req, res) => {
  let url = decodeURIComponent(req.url.split('?')[0]);
  if (url.endsWith('/')) url += 'index.html';
  const file = path.normalize(path.join(ROOT, url));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('없는 페이지예요'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
});

// ================= 방 =================
const WAIT_TIME = 30;      // 30초 동안 아무도 안 들어오면 AI 채우고 시작
const END_WAIT = 7;        // 끝나고 7초 뒤 대기실로
const rooms = new Map();
const send = (c, msg) => { if (c.ws.readyState === 1) c.ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); };

function newCode() {
  let code;
  do code = String(1000 + Math.floor(Math.random() * 9000)); while (rooms.has(code));
  return code;
}

class Room {
  constructor(size, mapId, isPublic) {
    this.code = newCode();
    this.size = Math.max(4, Math.min(MAX_PLAYERS, size | 0 || 6));
    this.mapId = MAP_LIST.some((m) => m.id === mapId) ? mapId : 'school';
    this.isPublic = isPublic;
    this.clients = [];
    this.state = 'waiting';
    this.waitLeft = WAIT_TIME;
    this.game = null; this.endT = 0; this.infoT = 0;
    rooms.set(this.code, this);
  }
  add(c) {
    if (this.state !== 'waiting') return '지금 게임 중인 방이에요. 조금 뒤에 들어와요!';
    if (this.clients.length >= this.size) return '방이 꽉 찼어요';
    leaveRoom(c);
    this.clients.push(c); c.room = this;
    this.waitLeft = WAIT_TIME; // 누가 들어오면 다시 30초
    this.sendRoom();
    return null;
  }
  remove(c) {
    this.clients = this.clients.filter((x) => x !== c);
    c.room = null;
    if (this.game) this.game.setCtrl(c.id, 'ai'); // 나간 사람은 AI가 대신
    if (!this.clients.length) rooms.delete(this.code);
    else this.sendRoom();
  }
  sendRoom() {
    for (const c of this.clients) send(c, {
      t: 'room', code: this.code, size: this.size, map: this.mapId, isPublic: this.isPublic, state: this.state,
      waitLeft: Math.ceil(this.waitLeft),
      players: this.clients.map((x) => ({ name: x.name, host: x === this.clients[0], me: x === c, avatar: x.avatar })),
    });
  }
  start() {
    this.game = new Game({ size: this.size, mapId: this.mapId, humans: this.clients.map((c) => ({ hid: c.id, name: c.name, avatar: c.avatar })) });
    this.state = 'playing'; this.endT = 0;
    const meta = this.game.meta(), snap = this.game.snapshot();
    for (const c of this.clients) send(c, { t: 'start', you: this.game.agentIdOf(c.id), meta, map: this.mapId, snap });
  }
  tick(dt) {
    if (this.state === 'waiting') {
      this.waitLeft -= dt;
      if (this.clients.length >= this.size) this.waitLeft = Math.min(this.waitLeft, 3);
      this.infoT -= dt;
      if (this.infoT <= 0) { this.infoT = 1; this.sendRoom(); }
      if (this.waitLeft <= 0) this.start();
    } else {
      this.game.step(dt);
      const snap = this.game.snapshot();
      snap.t = 'snap';
      snap.ev = this.game.drainEvents().map((e) => ({ ...e }));
      const msg = JSON.stringify(snap);
      for (const c of this.clients) send(c, msg);
      if (this.game.phase === 'end') {
        this.endT += dt;
        if (this.endT > END_WAIT) { this.state = 'waiting'; this.game = null; this.waitLeft = WAIT_TIME; this.sendRoom(); }
      }
    }
  }
}

function leaveRoom(c) { if (c.room) c.room.remove(c); }

// ================= 접속 =================
const wss = new WebSocketServer({ server, path: '/ws' });
let nextId = 1;

wss.on('connection', (ws) => {
  const c = { id: 'c' + nextId++, ws, name: '친구', avatar: null, room: null };
  ws.on('message', (data) => {
    let m;
    try { m = JSON.parse(data); } catch { return; }
    const room = c.room;
    switch (m.t) {
      case 'hello':
        c.name = String(m.name || '친구').replace(/[<>]/g, '').trim().slice(0, 8) || '친구';
        c.avatar = typeof m.avatar === 'string' && m.avatar.startsWith('data:image/png;base64,') && m.avatar.length < 30000 ? m.avatar : null;
        break;
      case 'create': {
        leaveRoom(c);
        new Room(m.size, m.map, false).add(c);
        break;
      }
      case 'join': {
        const r = rooms.get(String(m.code || '').trim());
        if (!r || r === room) { if (!r) send(c, { t: 'err', msg: '그런 코드의 방이 없어요' }); break; }
        const err = r.add(c);
        if (err) send(c, { t: 'err', msg: err });
        break;
      }
      case 'auto': { // 자동 참가: 기다리는 공개방에 들어가고, 없으면 새로 만들어요
        if (room) break;
        const open = [...rooms.values()].filter((r) => r.isPublic && r.state === 'waiting' && r.clients.length < r.size)
          .sort((a, b) => b.clients.length - a.clients.length)[0];
        if (open) open.add(c);
        else new Room(16, MAP_LIST[Math.floor(Math.random() * MAP_LIST.length)].id, true).add(c);
        break;
      }
      case 'leave': leaveRoom(c); send(c, { t: 'left' }); break;
      case 'startNow': if (room && room.state === 'waiting' && room.clients[0] === c) room.start(); break;
      case 'pose': if (room && room.game) room.game.setPose(c.id, m); break;
      case 'act': if (room && room.game) room.game.action(c.id, m.a, { aim: m.aim, i: m.i }); break;
      case 'rescue': if (room && room.game) room.game.setRescue(c.id, m.on); break;
    }
  });
  ws.on('close', () => leaveRoom(c));
});

let last = Date.now();
setInterval(() => {
  const now = Date.now(), dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  for (const r of [...rooms.values()]) r.tick(dt);
}, 1000 / 30);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`컴퓨터: http://localhost:${PORT}`);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list) if (a.family === 'IPv4' && !a.internal) console.log(`휴대폰: http://${a.address}:${PORT}`);
  }
});
