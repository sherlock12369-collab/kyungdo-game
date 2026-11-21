// 진행도 바꾸기: node tools/prog.js "<지금 하는 일>" [체크할 글자 일부...]
const fs = require('fs'), f = __dirname + '/../public/progress.json';
const p = JSON.parse(fs.readFileSync(f, 'utf8'));
const [now, ...done] = process.argv.slice(2);
if (now) p.now = now;
for (const s of p.stages) for (const i of s.items) if (done.some((d) => i.text.includes(d))) i.done = true;
fs.writeFileSync(f, JSON.stringify(p, null, 2));
