// 👫 크리에이티브 친구랑 하기 (Supabase)
// - 모두 채널 "kd1-c<코드>" 하나에서 이야기해요
// - 'p' 내 위치 (1초에 8번), 'e' 블럭 바꾼 것, 'hi' 들어왔어요, 'w' 방장이 보내주는 세상
// - 방장 컴퓨터가 세상을 저장해요 💾
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm';
import { SB_URL, SB_KEY } from '../sbconfig.js';

const PART = 6000;  // 세상 보낼 때 한 번에 숫자 6000개씩

export function makeRoom({ code, host, name, onPose, onEdits, onWorld, onLost, getWorld }) {
  const sb = createClient(SB_URL, SB_KEY, { realtime: { params: { eventsPerSecond: 40 } } });
  const myId = 'c' + Math.random().toString(36).slice(2, 10);
  const ch = sb.channel('kd1-c' + code, { config: { broadcast: { self: false } } });
  const people = new Map();   // id → { name, last, host }
  let hostLast = performance.now(), parts = null, closed = false;

  const send = (m) => { if (!closed) ch.send({ type: 'broadcast', event: 'm', payload: m }); };

  ch.on('broadcast', { event: 'm' }, ({ payload: m }) => {
    if (!m || closed) return;
    if (m.t === 'p') {
      people.set(m.id, { name: m.n, last: performance.now(), host: !!m.h });
      if (m.h) hostLast = performance.now();
      onPose(m);
    } else if (m.t === 'e') {
      onEdits(m.b);
    } else if (m.t === 'hi' && host) {
      const list = getWorld(), n = Math.max(1, Math.ceil(list.length / PART));
      for (let i = 0; i < n; i++) send({ t: 'w', to: m.id, i, n, d: list.slice(i * PART, (i + 1) * PART) });
    } else if (m.t === 'w' && !host && m.to === myId) {
      if (!parts) parts = new Array(m.n);
      parts[m.i] = m.d;
      if (parts.every((x) => x)) { onWorld(parts.flat()); parts = null; }
    } else if (m.t === 'bye') {
      people.delete(m.id);
      onPose({ t: 'gone', id: m.id });
      if (m.h && !host) { closed = true; onLost('방장이 나갔어요 👋'); }
    }
  });

  const ready = new Promise((res, rej) => {
    ch.subscribe((st) => {
      if (st === 'SUBSCRIBED') res();
      else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') rej(new Error(st));
    });
  });

  // 들어가기: 방장한테 세상을 달라고 해요 (5초 안에 대답 없으면 없는 방)
  async function join() {
    await ready;
    return new Promise((res, rej) => {
      let tries = 0;
      const ask = () => {
        if (closed) return;
        if (++tries > 3) { rej(new Error('noroom')); return; }
        send({ t: 'hi', id: myId, n: name });
        timer = setTimeout(ask, 2500);
      };
      let timer;
      const prev = onWorld;
      onWorld = (list) => { clearTimeout(timer); onWorld = prev; prev(list); res(); };
      ask();
    });
  }

  // 오래 소식 없는 친구는 지워요, 방장이 없어지면 알려줘요
  const tick = setInterval(() => {
    const t = performance.now();
    for (const [id, p] of people) if (t - p.last > 6000) { people.delete(id); onPose({ t: 'gone', id }); }
    if (!host && t - hostLast > 9000 && !closed) { closed = true; onLost('방장이랑 연결이 끊겼어요 😢'); }
  }, 1000);

  return {
    myId, ready, join, people,
    pose(p) { send({ t: 'p', id: myId, n: name, h: host ? 1 : 0, ...p }); },
    edits(b) { if (b.length) send({ t: 'e', b }); },
    leave() {
      if (closed) return;
      send({ t: 'bye', id: myId, h: host ? 1 : 0 });
      closed = true; clearInterval(tick);
      setTimeout(() => sb.removeChannel(ch), 300);
    },
    count() { return people.size + 1; },
  };
}
