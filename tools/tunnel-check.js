// 인터넷 주소로 게임 페이지랑 친구랑 하기(웹소켓)가 되는지 확인: node tools/tunnel-check.js <주소>
import WebSocket from 'ws';

const base = process.argv[2];
const page = await fetch(base + '/');
console.log('page', page.status, (await page.text()).includes('경도') ? 'ok' : 'wrong page');
const ws = new WebSocket(base.replace('https://', 'wss://') + '/ws');
ws.on('open', () => { ws.send(JSON.stringify({ t: 'hello', name: '테스트' })); ws.send(JSON.stringify({ t: 'create', size: 4, map: 'school' })); });
ws.on('message', (d) => {
  const m = JSON.parse(d);
  if (m.t === 'room') { console.log('room created', m.code, m.players.length + '/' + m.size); ws.send(JSON.stringify({ t: 'leave' })); ws.close(); }
});
ws.on('error', (e) => { console.log('ws error', e.message); process.exit(1); });
setTimeout(() => { console.log('timeout'); process.exit(1); }, 15000);
