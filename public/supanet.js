// 친구랑 하기 (Supabase 버전)
// - 따로 게임 서버가 없어요. 방을 만든 사람(방장) 폰이 게임을 돌려요 👑
// - Supabase는 폰끼리 메시지만 전해 줘요 (편지 배달부 📮)
// - 방장 → 모두: 채널 "kd1-r<코드>"   /   친구 → 방장: 채널 "kd1-r<코드>-<내 id>" (다른 친구는 안 받아서 메시지가 적어요)
// - 무료 Supabase는 1초에 메시지 100개 정도까지라서, 1초에 8번만 보내요
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm';
import { Game, MAX_PLAYERS } from './shared/sim.js';
import { MAP_LIST } from './shared/map.js';

// 패밀리그 Supabase (anon 키는 누가 봐도 괜찮은 공개 키예요)
const SB_URL = 'https://zfxyjfyzuuduorzimnvl.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpmeHlqZnl6dXVkdW9yemltbnZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM0OTA4OTQsImV4cCI6MjA5OTA2Njg5NH0.TnlW60b-HZ5WdW6z2Ea04B5KRDFccUOhbMOijOY9wN0';

const P = 'kd1-';
const WAIT_TIME = 30;     // 30초 동안 아무도 안 들어오면 AI 채우고 시작
const END_WAIT = 7;       // 끝나고 7초 뒤 대기실로
const SNAP_EVERY = 1 / 8; // 방장이 친구들한테 보내는 횟수 (1초에 8번)
export const POSE_EVERY = 1 / 8;
const HOST_LOST_MS = 6000;  // 방장 소식이 6초 없으면 끊긴 거예요
const GUEST_LOST_MS = 10000;

const now = () => performance.now();
const cleanName = (n) => String(n || '친구').replace(/[<>]/g, '').trim().slice(0, 8) || '친구';
const okAvatar = (a) => (typeof a === 'string' && a.startsWith('data:image/png;base64,') && a.length < 30000 ? a : null);

export function createSupaNet(onNet, onLost) {
  const sb = createClient(SB_URL, SB_KEY, { realtime: { params: { eventsPerSecond: 40 } } });
  const myId = 'c' + Math.random().toString(36).slice(2, 10);
  const meInfo = { name: '친구', avatar: null };
  const avatars = new Map();
  let host = null, guest = null, lobbyP = null, lobby = null;

  // ----- 받은 메시지를 게임 화면이 알아듣는 모양으로 바꿔서 넘겨줘요 -----
  function deliver(m) {
    if (m.t === 'av') { avatars.set(m.cid, m.avatar); return; }
    if (m.t === 'room') {
      m = { ...m, players: m.players.map((p) => ({ ...p, me: p.cid === myId, avatar: avatars.get(p.cid) || null })) };
    } else if (m.t === 'start') {
      const cidOf = new Map(Object.entries(m.yous).map(([cid, id]) => [id, cid]));
      m = { ...m, you: m.yous[myId], meta: m.meta.map((a) => ({ ...a, avatar: avatars.get(cidOf.get(a.id)) || null })) };
    }
    onNet(m);
  }

  function subscribe(ch) {
    return new Promise((res, rej) => {
      ch.subscribe((st) => {
        if (st === 'SUBSCRIBED') res(ch);
        else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') rej(new Error(st));
      });
    });
  }

  // ----- 로비: 지금 있는 방 목록 (자동 참가 / 코드 겹치지 않게) -----
  function getLobby() {
    if (lobbyP) return lobbyP;
    lobby = sb.channel(P + 'lobby', { config: { presence: { key: myId } } });
    lobbyP = new Promise((res, rej) => {
      let done = false;
      const ok = () => { if (!done) { done = true; res(lobby); } };
      lobby.on('presence', { event: 'sync' }, ok);
      subscribe(lobby).then(() => setTimeout(ok, 1500), (e) => { done = true; lobbyP = null; sb.removeChannel(lobby); rej(e); });
    });
    return lobbyP;
  }
  const lobbyRooms = () => Object.values(lobby.presenceState()).flat().filter((p) => p.code && p.host !== myId);

  async function newCode() {
    await getLobby();
    const used = new Set(lobbyRooms().map((r) => r.code));
    let code;
    do code = String(1000 + Math.floor(Math.random() * 9000)); while (used.has(code));
    return code;
  }

  // ================= 내가 방장일 때 =================
  class HostRoom {
    constructor(size, mapId, isPublic, code) {
      this.code = code;
      this.size = Math.max(4, Math.min(MAX_PLAYERS, size | 0 || 6));
      this.mapId = MAP_LIST.some((m) => m.id === mapId) ? mapId : 'school';
      this.isPublic = isPublic;
      this.self = { id: myId, name: meInfo.name, avatar: meInfo.avatar };
      this.clients = [this.self];
      avatars.set(myId, meInfo.avatar);
      this.state = 'waiting'; this.waitLeft = WAIT_TIME;
      this.game = null; this.endT = 0; this.infoT = 0; this.snapT = 0; this.evBuf = [];
      this.ups = new Map();
      this.ready = false; this.queue = [];
      this.down = sb.channel(P + 'r' + code);
      this.down.on('broadcast', { event: 'j' }, ({ payload }) => this.onJoin(payload || {}));
      subscribe(this.down).then(() => { this.ready = true; for (const p of this.queue) this.rawSend(p); this.queue = []; },
        () => { if (host === this) { leaveAll(); onLost('Supabase에 연결이 안 돼요 😢 조금 뒤에 다시 해 봐요'); } });
      this.last = now();
      this.timer = setInterval(() => this.tick(), 1000 / 30);
      this.announce();
      this.sendRoom();
    }
    rawSend(payload) { this.down.send({ type: 'broadcast', event: 'm', payload }); }
    bcast(payload) {
      if (this.clients.length < 2 && payload.m.t !== 'closed') return; // 친구가 없으면 안 보내요 (메시지 아끼기)
      if (this.ready) this.rawSend(payload); else this.queue.push(payload);
    }
    toAll(m) { deliver(m); this.bcast({ m }); }
    to(cid, m) { this.bcast({ to: cid, m }); }
    announce() {
      if (lobby) lobby.track({ code: this.code, host: myId, pub: this.isPublic, n: this.clients.length, size: this.size, st: this.state }).catch(() => {});
    }
    onJoin({ cid, name, avatar }) {
      if (!cid || cid === myId) return;
      const old = this.clients.find((c) => c.id === cid);
      if (old) { old.seen = now(); return this.sendRoom(); }
      if (this.state !== 'waiting') return this.to(cid, { t: 'err', bye: true, msg: '지금 게임 중인 방이에요. 조금 뒤에 들어와요!' });
      if (this.clients.length >= this.size) return this.to(cid, { t: 'err', bye: true, msg: '방이 꽉 찼어요' });
      const c = { id: cid, name: cleanName(name), avatar: okAvatar(avatar), seen: now() };
      this.clients.push(c);
      avatars.set(cid, c.avatar);
      const up = sb.channel(P + 'r' + this.code + '-' + cid);
      up.on('broadcast', { event: 'u' }, ({ payload }) => { c.seen = now(); if (payload) this.handle(c, payload); });
      up.subscribe();
      this.ups.set(cid, up);
      this.waitLeft = WAIT_TIME; // 누가 들어오면 다시 30초
      for (const x of this.clients) if (x.avatar) this.bcast({ m: { t: 'av', cid: x.id, avatar: x.avatar } });
      this.sendRoom();
      this.announce();
    }
    handle(c, m) {
      switch (m.t) {
        case 'leave': if (c !== this.self) this.remove(c); break;
        case 'pose': if (this.game) this.game.setPose(c.id, m); break;
        case 'act': if (this.game) this.game.action(c.id, m.a, { aim: m.aim, i: m.i }); break;
        case 'rescue': if (this.game) this.game.setRescue(c.id, m.on); break;
      }
    }
    remove(c) {
      this.clients = this.clients.filter((x) => x !== c);
      const up = this.ups.get(c.id);
      if (up) { sb.removeChannel(up); this.ups.delete(c.id); }
      if (this.game) this.game.setCtrl(c.id, 'ai'); // 나간 사람은 AI가 대신
      this.sendRoom();
      this.announce();
    }
    sendRoom() {
      this.toAll({
        t: 'room', code: this.code, size: this.size, map: this.mapId, isPublic: this.isPublic, state: this.state,
        waitLeft: Math.ceil(this.waitLeft),
        players: this.clients.map((x) => ({ cid: x.id, name: x.name, host: x === this.self })),
      });
    }
    start() {
      this.game = new Game({ size: this.size, mapId: this.mapId, humans: this.clients.map((c) => ({ hid: c.id, name: c.name, avatar: c.avatar })) });
      this.state = 'playing'; this.endT = 0; this.snapT = 0; this.evBuf = [];
      const yous = Object.fromEntries(this.clients.map((c) => [c.id, this.game.agentIdOf(c.id)]));
      const meta = this.game.meta().map(({ avatar, ...a }) => a); // 얼굴 그림은 따로 보냈어요 (메시지가 너무 커지지 않게)
      this.toAll({ t: 'start', yous, meta, map: this.mapId, snap: this.game.snapshot() });
      this.announce();
    }
    tick() {
      const t = now(), dt = Math.min((t - this.last) / 1000, 0.1);
      this.last = t;
      for (const c of this.clients) if (c !== this.self && t - c.seen > GUEST_LOST_MS) this.remove(c);
      if (this.state === 'waiting') {
        this.waitLeft -= dt;
        if (this.clients.length >= this.size) this.waitLeft = Math.min(this.waitLeft, 3);
        this.infoT -= dt;
        if (this.infoT <= 0) { this.infoT = 1; this.sendRoom(); }
        if (this.waitLeft <= 0) this.start();
        return;
      }
      this.game.step(dt);
      const snap = this.game.snapshot();
      const ev = this.game.drainEvents().map((e) => ({ ...e }));
      deliver({ ...snap, t: 'snap', ev }); // 내 화면은 매번
      this.evBuf.push(...ev);
      this.snapT -= dt;
      if (this.snapT <= 0) { // 친구들은 1초에 8번
        this.snapT = SNAP_EVERY;
        this.bcast({ m: { ...snap, t: 'snap', ev: this.evBuf } });
        this.evBuf = [];
      }
      if (this.game.phase === 'end') {
        this.endT += dt;
        if (this.endT > END_WAIT) {
          this.state = 'waiting'; this.game = null; this.waitLeft = WAIT_TIME;
          this.sendRoom(); this.announce();
        }
      }
    }
    close() {
      clearInterval(this.timer);
      if (this.clients.length > 1 && this.ready) this.rawSend({ m: { t: 'closed' } });
      for (const up of this.ups.values()) sb.removeChannel(up);
      const down = this.down;
      setTimeout(() => sb.removeChannel(down), 300); // "방 닫았어요"가 먼저 나가게
      if (lobby) lobby.untrack().catch(() => {});
    }
  }

  // ================= 내가 친구 방에 들어갈 때 =================
  function joinRoom(code, failMsg = '그런 코드의 방이 없어요') {
    leaveAll();
    const g = { code, joined: false, lastT: now(), timers: [] };
    guest = g;
    g.down = sb.channel(P + 'r' + code);
    g.up = sb.channel(P + 'r' + code + '-' + myId);
    g.down.on('broadcast', { event: 'm' }, ({ payload }) => {
      if (guest !== g || !payload || !payload.m) return;
      if (payload.to && payload.to !== myId) return;
      const m = payload.m;
      if (m.t === 'av') return deliver(m);
      if (m.t === 'closed') { if (g.joined) { leaveAll(); onLost('방장이 나갔어요 😢'); } return; }
      if (m.t === 'err') { leaveAll(); return deliver(m); }
      if (m.t === 'room') {
        const inRoom = m.players.some((p) => p.cid === myId);
        if (!inRoom) { if (g.joined) { leaveAll(); onLost('방에서 나가졌어요 😢'); } return; }
        g.joined = true;
      }
      if (!g.joined) return;
      g.lastT = now();
      deliver(m);
    });
    const ask = () => g.down.send({ type: 'broadcast', event: 'j', payload: { cid: myId, name: meInfo.name, avatar: meInfo.avatar } });
    Promise.all([subscribe(g.up), subscribe(g.down)]).then(() => {
      if (guest !== g) return;
      ask();
      const t0 = now();
      g.timers.push(setInterval(() => {
        if (guest !== g) return;
        if (!g.joined) {
          if (now() - t0 > 6000) { leaveAll(); onNet({ t: 'err', msg: failMsg }); } else ask();
          return;
        }
        if (now() - g.lastT > HOST_LOST_MS) { leaveAll(); onLost('방장이랑 연결이 끊겼어요 😢'); return; }
        g.up.send({ type: 'broadcast', event: 'u', payload: { t: 'ping' } });
      }, 1500));
    }, () => { if (guest === g) { leaveAll(); onNet({ t: 'err', msg: 'Supabase에 연결이 안 돼요 😢 조금 뒤에 다시 해 봐요' }); } });
  }

  function leaveAll() {
    if (host) { host.close(); host = null; }
    if (guest) {
      const g = guest; guest = null;
      for (const t of g.timers) clearInterval(t);
      if (g.joined) g.up.send({ type: 'broadcast', event: 'u', payload: { t: 'leave' } });
      setTimeout(() => { sb.removeChannel(g.up); sb.removeChannel(g.down); }, 300);
    }
  }

  async function createRoom(size, map, isPublic) {
    leaveAll();
    try {
      const code = await newCode();
      host = new HostRoom(size, map, isPublic, code);
    } catch { onNet({ t: 'err', msg: 'Supabase에 연결이 안 돼요 😢 조금 뒤에 다시 해 봐요' }); }
  }

  async function autoJoin() {
    try { await getLobby(); } catch { return onNet({ t: 'err', msg: 'Supabase에 연결이 안 돼요 😢 조금 뒤에 다시 해 봐요' }); }
    const open = lobbyRooms().filter((r) => r.pub && r.st === 'waiting' && r.n < r.size).sort((a, b) => b.n - a.n)[0];
    if (open) joinRoom(open.code, '방에 못 들어갔어요. 다시 눌러 봐요!');
    else createRoom(16, MAP_LIST[Math.floor(Math.random() * MAP_LIST.length)].id, true);
  }

  addEventListener('pagehide', () => leaveAll());

  return {
    poseEvery: POSE_EVERY,
    send(m) {
      switch (m.t) {
        case 'hello': meInfo.name = cleanName(m.name); meInfo.avatar = okAvatar(m.avatar); break;
        case 'create': createRoom(m.size, m.map, false); break;
        case 'join': {
          const code = String(m.code || '').trim();
          if (host && host.code === code) break;
          joinRoom(code);
          break;
        }
        case 'auto': if (!host && !guest) autoJoin(); break;
        case 'leave': leaveAll(); onNet({ t: 'left' }); break;
        case 'startNow': if (host && host.state === 'waiting') host.start(); break;
        case 'pose': case 'act': case 'rescue':
          if (host) host.handle(host.self, m);
          else if (guest && guest.joined) guest.up.send({ type: 'broadcast', event: 'u', payload: m });
          break;
      }
    },
  };
}
