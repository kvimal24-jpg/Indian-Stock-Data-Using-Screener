const fs = require('fs');
const path = require('path');

console.log('Starting split process...');

// Read master data
const raw = fs.readFileSync('master_data.json', 'utf8');
const master = JSON.parse(raw);
const tickers = Object.keys(master);
console.log(`Found ${tickers.length} companies`);

// Make docs/data directory
fs.mkdirSync('docs/data', { recursive: true });

// ─── SCORING ENGINE ─────────────────────────────────────────────
function parseNum(v) {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  return parseFloat(String(v).replace('%','').replace(',','')) || null;
}

function avg(arr) {
  const clean = arr.filter(v => v != null && !isNaN(v));
  if (!clean.length) return null;
  return clean.reduce((a, b) => a + b, 0) / clean.length;
}

function lastN(obj, n) {
  if (!obj) return [];
  return Object.values(obj).slice(-n).map(parseNum);
}

function parseCAGR(s) {
  if (!s) return null;
  return parseFloat(String(s).replace('%', '')) || null;
}

function computeScores(co) {
  const pl  = co.profitLoss?.data || {};
  const bs  = co.balanceSheet?.data || {};
  const cf  = co.cashFlow?.data || {};
  const ra  = co.ratios?.data || {};
  const qs  = co.quarters?.data || {};
  const sh  = co.shareholding?.data || {};
  const cag = co.CAGRs || {};
  const isBank = !!qs['Gross NPA %'];

  // ── Q-SCORE ────────────────────────────────────────────────────
  // Component A: ROE / ROCE consistency (max 35)
  const roeVals = lastN(ra['ROE %'], 8);
  const roAvg = avg(roeVals);
  const baseline = isBank ? 14 : 15; // bank ROE 14%+, mfg ROCE 15%+
  let compA = 0;
  if (roAvg != null) {
    compA = Math.min(35, Math.max(0, (roAvg / baseline) * 20));
    // Consistency bonus: count years > threshold
    const goodYears = roeVals.filter(v => v != null && v >= baseline - 3).length;
    compA += (goodYears / Math.max(roeVals.length, 1)) * 15;
    compA = Math.min(35, compA);
  }

  // Component B: Earnings never declining (max 25)
  const npArr = Object.values(pl['Net Profit'] || {}).map(parseNum).filter(v => v != null);
  let posGrowthYears = 0;
  for (let i = 1; i < npArr.length; i++) {
    if (npArr[i] > npArr[i-1]) posGrowthYears++;
  }
  const totalYears = Math.max(npArr.length - 1, 1);
  const compB = Math.min(25, (posGrowthYears / totalYears) * 25);

  // Component C: Cash Flow Integrity (max 20)
  const cfoArr = lastN(cf['Cash from Operating Activity'], 5);
  const npLast5 = lastN(pl['Net Profit'], 5);
  let cfii = null;
  if (cfoArr.length && npLast5.length) {
    const ratios = cfoArr.map((c, i) => {
      const n = npLast5[i];
      return (c != null && n != null && n !== 0) ? c / n : null;
    }).filter(v => v != null);
    cfii = avg(ratios);
  }
  const compC = cfii != null ? Math.min(20, Math.max(0, cfii * 16)) : 10;

  // Component D: Sector-specific quality (max 20)
  let compD = 0;
  if (isBank) {
    const gnpa = lastN(qs['Gross NPA %'], 4);
    const gnpaLatest = gnpa[gnpa.length - 1];
    const gnpaEarliest = gnpa[0];
    if (gnpaLatest != null) {
      if (gnpaLatest < 1.5) compD += 10;
      else if (gnpaLatest < 3) compD += 6;
      else compD += 2;
      if (gnpaEarliest != null && gnpaLatest < gnpaEarliest) compD += 5; // improving
      else if (gnpaEarliest != null && gnpaLatest === gnpaEarliest) compD += 2;
    }
    if (roAvg != null && roAvg >= 12) compD += 5;
  } else {
    const opmArr = lastN(qs['OPM %'] || pl['OPM %'] || {}, 8);
    const opmAvg = avg(opmArr);
    if (opmAvg != null) {
      if (opmAvg >= 25) compD += 10;
      else if (opmAvg >= 15) compD += 7;
      else if (opmAvg >= 8) compD += 4;
    }
    const roceArr = lastN(ra['ROCE %'], 5);
    const roceAvg = avg(roceArr);
    if (roceAvg != null) {
      if (roceAvg >= 25) compD += 10;
      else if (roceAvg >= 15) compD += 6;
      else compD += 3;
    }
  }

  const qScore = Math.round(Math.min(100, compA + compB + compC + compD));

  // ── V-SCORE ────────────────────────────────────────────────────
  const pcagr5 = parseCAGR(cag['Compounded Profit Growth']?.['5 Years']);
  const pricagr5 = parseCAGR(cag['Stock Price CAGR']?.['5 Years']);
  const pcagr3 = parseCAGR(cag['Compounded Profit Growth']?.['3 Years']);
  const pricagr3 = parseCAGR(cag['Stock Price CAGR']?.['3 Years']);
  const pricagr1 = parseCAGR(cag['Stock Price CAGR']?.['1 Year']);

  // EV-MED: profit CAGR outrunning price CAGR = undervaluation signal
  let evmed = null;
  if (pcagr5 != null && pricagr5 != null) evmed = pcagr5 - pricagr5;
  else if (pcagr3 != null && pricagr3 != null) evmed = pcagr3 - pricagr3;

  let compVA = 0; // EV-MED (max 50)
  if (evmed != null) {
    compVA = Math.min(50, Math.max(0, evmed * 2 + 20));
  }

  let compVB = 0; // Price pain signal (max 30)
  if (pricagr1 != null) {
    if (pricagr1 < -20) compVB = 30;
    else if (pricagr1 < -10) compVB = 20;
    else if (pricagr1 < 0) compVB = 12;
    else if (pricagr1 < 10) compVB = 6;
  }

  let compVC = 0; // Earnings CAGR quality (max 20)
  if (pcagr5 != null) {
    if (pcagr5 >= 20) compVC = 20;
    else if (pcagr5 >= 15) compVC = 15;
    else if (pcagr5 >= 10) compVC = 10;
    else if (pcagr5 > 0) compVC = 5;
  }

  const vScore = Math.round(Math.min(100, compVA + compVB + compVC));

  // ── M-SCORE ────────────────────────────────────────────────────
  // FII trend (max 40)
  const fiiVals = Object.entries(sh['FIIs'] || {})
    .filter(([k]) => k && k.trim())
    .map(([, v]) => parseNum(v))
    .filter(v => v != null);
  let compMA = 20; // neutral
  if (fiiVals.length >= 4) {
    const recent4 = fiiVals.slice(-4);
    const fiiDelta = recent4[recent4.length-1] - recent4[0];
    if (fiiDelta > 3) compMA = 40;
    else if (fiiDelta > 1) compMA = 32;
    else if (fiiDelta > 0) compMA = 24;
    else if (fiiDelta > -1) compMA = 16;
    else if (fiiDelta > -3) compMA = 8;
    else compMA = 2;
  }

  // EPS quarterly momentum (max 35)
  const qEPS = lastN(qs['EPS in Rs'], 8);
  let compMB = 17;
  if (qEPS.length >= 5) {
    const latestEPS = qEPS[qEPS.length-1];
    const prevYearEPS = qEPS[qEPS.length-5];
    if (latestEPS != null && prevYearEPS != null && prevYearEPS !== 0) {
      const yoy = (latestEPS - prevYearEPS) / Math.abs(prevYearEPS) * 100;
      if (yoy > 20) compMB = 35;
      else if (yoy > 12) compMB = 28;
      else if (yoy > 6) compMB = 22;
      else if (yoy > 0) compMB = 15;
      else compMB = 5;
    }
  }

  // Price CAGR alignment (max 25)
  let compMC = 12;
  if (pricagr1 != null) {
    if (pricagr1 > 15) compMC = 25;
    else if (pricagr1 > 5) compMC = 20;
    else if (pricagr1 > 0) compMC = 15;
    else if (pricagr1 > -10) compMC = 8;
    else compMC = 3;
  }

  const mScore = Math.round(Math.min(100, compMA + compMB + compMC));

  // ── CCS & SIGNAL ───────────────────────────────────────────────
  const ccs = Math.round(qScore * 0.45 + vScore * 0.35 + mScore * 0.20);

  let signal = 'AVOID';
  if (qScore < 35) signal = 'AVOID';
  else if (ccs >= 68 && qScore >= 60 && vScore >= 55) signal = 'BUY';
  else if (ccs >= 55 && qScore >= 50) signal = 'HOLD';
  else if (ccs >= 42) signal = 'WATCH';

  const evmedStr = evmed != null ? (evmed >= 0 ? '+' : '') + Math.round(evmed) : null;

  return { qScore, vScore, mScore, ccs, signal, evmed: evmedStr, isBank, cfii: cfii ? Math.round(cfii * 100) / 100 : null };
}

// ─── INDEX BUILD ────────────────────────────────────────────────
const index = {};
let processed = 0;

for (const ticker of tickers) {
  try {
    const co = master[ticker];
    const scores = computeScores(co);
    const cag = co.CAGRs || {};
    const pl  = co.profitLoss?.data || {};
    const ra  = co.ratios?.data || {};
    const qs  = co.quarters?.data || {};

    // Detect sector
    let sector = 'Equity';
    const name = (co.CompanyName || '').toLowerCase();
    if (scores.isBank) {
      const hasDep = !!(co.balanceSheet?.data?.['Deposits']);
      sector = hasDep ? 'Banking' : 'NBFC';
    } else if (name.includes('software') || name.includes('tech') || name.includes('infosy') || name.includes('wipro') || name.includes('hcl')) {
      sector = 'IT Services';
    } else if (name.includes('pharma') || name.includes('lab') || name.includes('cipla') || name.includes('sun')) {
      sector = 'Pharma';
    } else if (name.includes('airtel') || name.includes('jio') || name.includes('telecom')) {
      sector = 'Telecom';
    } else if (name.includes('reliance') || name.includes('adani')) {
      sector = 'Conglomerate';
    }

    // Lightweight index entry
    const npVals = Object.values(pl['Net Profit'] || {});
    const latestNP = npVals.length ? parseFloat(npVals[npVals.length-1]) : null;
    const roeVals = Object.values(ra['ROE %'] || {});
    const latestROE = roeVals.length ? parseFloat(roeVals[roeVals.length-1]) : null;
    const latestQEPS = (() => {
      const arr = Object.values(qs['EPS in Rs'] || {});
      return arr.length ? parseFloat(arr[arr.length-1]) : null;
    })();
    const gnpa = scores.isBank ? (() => {
      const arr = Object.values(qs['Gross NPA %'] || {});
      return arr.length ? parseFloat(arr[arr.length-1]) : null;
    })() : null;

    index[ticker] = {
      id: ticker,
      name: co.CompanyName || ticker,
      sector,
      ...scores,
      pcagr5: parseFloat(String(cag['Compounded Profit Growth']?.['5 Years'] || '0').replace('%','')),
      scagr5: parseFloat(String(cag['Compounded Sales Growth']?.['5 Years'] || '0').replace('%','')),
      pricagr1: parseFloat(String(cag['Stock Price CAGR']?.['1 Year'] || '0').replace('%','')),
      roe: latestROE,
      latestNP,
      latestQEPS,
      gnpa,
      pros: (co.analysis?.pros || []).slice(0, 2),
      cons: (co.analysis?.cons || []).slice(0, 2),
    };

    // Write individual company file
    fs.writeFileSync(
      path.join('docs/data', ticker + '.json'),
      JSON.stringify({ ...co, _scores: scores, _sector: sector }),
      'utf8'
    );

    processed++;
    if (processed % 100 === 0) console.log(`  Processed ${processed}/${tickers.length}...`);

  } catch (e) {
    console.warn(`  Warning: Failed to process ${ticker}: ${e.message}`);
  }
}

// Write index
fs.writeFileSync('docs/data/index.json', JSON.stringify(index), 'utf8');
console.log(`Done. ${processed} companies split. Index: ${(fs.statSync('docs/data/index.json').size/1024).toFixed(0)} KB`);
