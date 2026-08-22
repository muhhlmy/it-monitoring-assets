import fs from 'fs';
const data = JSON.parse(fs.readFileSync('./qa-reports/lighthouse-login.json', 'utf8'));
const cats = data.categories;
const audit = data.audits;
const scores = {};
for (const [k, v] of Object.entries(cats)) {
  scores[k] = Math.round((v.score || 0) * 100);
}
const perf = {
  scores,
  fcp: audit['first-contentful-paint']?.displayValue,
  lcp: audit['largest-contentful-paint']?.displayValue,
  tbt: audit['total-blocking-time']?.displayValue,
  cls: audit['cumulative-layout-shift']?.displayValue,
  tti: audit['interactive']?.displayValue,
  speedIndex: audit['speed-index']?.displayValue,
  opportunities: Object.values(audit)
    .filter(a => a.details?.type === 'opportunity' && (a.score||1) < 0.9)
    .map(a => ({ id: a.id, title: a.title, savingsMs: a.details?.overallSavingsMs }))
    .slice(0, 10),
  failures: Object.values(audit)
    .filter(a => a.score !== null && a.score < 0.5 && a.score !== undefined)
    .map(a => ({ id: a.id, title: a.title, score: Math.round((a.score||0)*100) }))
    .slice(0, 10)
};
console.log(JSON.stringify(perf, null, 2));
