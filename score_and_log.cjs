/**
 * score_and_log.cjs
 * Runs after split.cjs every day.
 * 1. Reads docs/data/index.json (today's scores)
 * 2. Reads docs/history.json (yesterday's state)
 * 3. Detects signal changes → logs transitions
 * 4. Writes updated docs/history.json
 */

const fs = require('fs');
const path = require('path');

const CALL_THRESHOLDS = {
  signal: 'BUY',
  minQScore: 60,
  minCCS: 65,
  minEVMED: 5,
  maxGNPA: 3.0,
};

const indexPath = path.join('docs', 'data', 'index.json');
if (!fs.existsSync(indexPath)) {
  console.error('index.json not found. Run split.cjs first.');
  process.exit(1);
}

const today = new Date().toISOString().split('T')[0];
const todayIndex = JSON.parse(fs.readFileSync(indexPath, 'utf8'));

const historyPath = path.join('docs', 'history.json');
let history = { lastUpdated: null, previousSignals: {}, activeCalls: [], closedCalls: [], dailySnapshots: [] };

if (fs.existsSync(historyPath)) {
  try { history = JSON.parse(fs.readFileSync(historyPath, 'utf8')); }
  catch(e) { console.warn('Could not parse history.json, starting fresh.'); }
}

const prevActiveCalls = history.activeCalls || [];

function meetsCallThreshold(co) {
  if (co.signal !== CALL_THRESHOLDS.signal) return false;
  if (co.qScore < CALL_THRESHOLDS.minQScore) return false;
  if (co.ccs < CALL_THRESHOLDS.minCCS) return false;
  const evmed = co.evmed ? parseInt(String(co.evmed).replace('+','')) : null;
  if (evmed === null || evmed < CALL_THRESHOLDS.minEVMED) return false;
  if (co.isBank && co.gnpa != null && co.gnpa > CALL_THRESHOLDS.maxGNPA) return false;
  return true;
}

const todayCallIds = new Set(Object.values(todayIndex).filter(meetsCallThreshold).map(co => co.id));
const prevCallIds = new Set(prevActiveCalls.map(c => c.id));
const newlyEntered = [];
const newlyExited = [];

for (const id of todayCallIds) {
  if (!prevCallIds.has(id)) {
    const co = todayIndex[id];
    newlyEntered.push({
      id, name: co.name, sector: co.sector, entryDate: today,
      entryScores: { qScore: co.qScore, vScore: co.vScore, mScore: co.mScore, ccs: co.ccs, evmed: co.evmed, signal: co.signal },
      priceCagr1Y: co.pricagr1 || null, isBank: co.isBank, gnpa: co.gnpa || null, roe: co.roe || null,
    });
    console.log(`  NEW CALL: ${co.name} (${id}) — CCS:${co.ccs} Q:${co.qScore} EV-MED:${co.evmed}`);
  }
}

function deriveExitReason(entry, exitCo) {
  if (!exitCo || !exitCo.signal) return 'Data unavailable';
  if (exitCo.signal === 'AVOID') return 'Quality deteriorated — signal moved to AVOID';
  if (exitCo.signal === 'HOLD') return 'Fully valued — price caught up with earnings (signal: HOLD)';
  if (exitCo.signal === 'WATCH') return 'Momentum faded or quality declined (signal: WATCH)';
  return `Signal changed to ${exitCo.signal}`;
}

for (const id of prevCallIds) {
  if (!todayCallIds.has(id)) {
    const co = todayIndex[id] || {};
    const entry = prevActiveCalls.find(c => c.id === id) || {};
    newlyExited.push({
      id, name: co.name || entry.name, sector: co.sector || entry.sector,
      entryDate: entry.entryDate || '—', exitDate: today,
      entryScores: entry.entryScores || {},
      exitScores: { qScore: co.qScore, vScore: co.vScore, mScore: co.mScore, ccs: co.ccs, evmed: co.evmed, signal: co.signal },
      exitReason: deriveExitReason(entry, co),
      priceCagr1YAtExit: co.pricagr1 || null,
    });
    console.log(`  CLOSED: ${co.name||id} — moved to ${co.signal} on ${today}`);
  }
}

const updatedActiveCalls = [...prevActiveCalls.filter(c => todayCallIds.has(c.id)), ...newlyEntered];
const updatedClosedCalls = [...(history.closedCalls || []), ...newlyExited];

const buyCount = Object.values(todayIndex).filter(c => c.signal === 'BUY').length;
const holdCount = Object.values(todayIndex).filter(c => c.signal === 'HOLD').length;
const watchCount = Object.values(todayIndex).filter(c => c.signal === 'WATCH').length;
const avoidCount = Object.values(todayIndex).filter(c => c.signal === 'AVOID').length;
const avgCCS = Math.round(Object.values(todayIndex).reduce((s, c) => s + c.ccs, 0) / Object.values(todayIndex).length);

const snapshots = [...(history.dailySnapshots || []).slice(-89), {
  date: today, totalCompanies: Object.keys(todayIndex).length,
  buy: buyCount, hold: holdCount, watch: watchCount, avoid: avoidCount,
  avgCCS, activeCalls: updatedActiveCalls.length,
}];

const newPrevSignals = {};
for (const [id, co] of Object.entries(todayIndex)) newPrevSignals[id] = co.signal;

fs.writeFileSync(historyPath, JSON.stringify({
  lastUpdated: today,
  previousSignals: newPrevSignals,
  activeCalls: updatedActiveCalls,
  closedCalls: updatedClosedCalls,
  dailySnapshots: snapshots,
  stats: {
    totalCallsEver: updatedActiveCalls.length + updatedClosedCalls.length,
    currentActiveCalls: updatedActiveCalls.length,
    closedCalls: updatedClosedCalls.length,
    vindicatedCalls: updatedClosedCalls.filter(c => c.priceCagr1YAtExit != null && c.priceCagr1YAtExit > 0).length,
  },
}, null, 2), 'utf8');

console.log(`\nDaily summary — ${today}`);
console.log(`  Universe: ${Object.keys(todayIndex).length} companies`);
console.log(`  BUY: ${buyCount} | HOLD: ${holdCount} | WATCH: ${watchCount} | AVOID: ${avoidCount}`);
console.log(`  Active calls: ${updatedActiveCalls.length} | Closed all-time: ${updatedClosedCalls.length}`);
console.log(`  New entries: ${newlyEntered.length} | New exits: ${newlyExited.length}`);
console.log(`\nhistory.json written`);
