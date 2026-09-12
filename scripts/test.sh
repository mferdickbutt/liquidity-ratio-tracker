#!/usr/bin/env bash
# Liquidity ratio tracker tests: metric edge cases + static first-paint HTML.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

passed=0
failed=0

pass() {
  echo "PASS: $1"
  passed=$((passed + 1))
}

fail() {
  echo "FAIL: $1"
  failed=$((failed + 1))
}

node_ok() {
  local name="$1"
  local code="$2"
  if node -e "$code"; then
    pass "$name"
  else
    fail "$name"
  fi
}

# --- Metric engine ---

node_ok "current ratio is current assets / current liabilities" '
const L = require("./js/liquidity.js");
const v = L.currentRatio(6120000, 2900000);
if (Math.abs(v - 6120000 / 2900000) > 1e-12) { console.error(v); process.exit(1); }
'

node_ok "quick ratio is (current assets - inventory) / current liabilities" '
const L = require("./js/liquidity.js");
const v = L.quickRatio(6120000, 2550000, 2900000);
if (Math.abs(v - (6120000 - 2550000) / 2900000) > 1e-12) { console.error(v); process.exit(1); }
'

node_ok "cash ratio is cash / current liabilities" '
const L = require("./js/liquidity.js");
const v = L.cashRatio(1050000, 2900000);
if (Math.abs(v - 1050000 / 2900000) > 1e-12) { console.error(v); process.exit(1); }
'

node_ok "zero current liabilities yields null ratios not Infinity" '
const L = require("./js/liquidity.js");
if (L.currentRatio(500000, 0) !== null) process.exit(1);
if (L.quickRatio(500000, 100000, 0) !== null) process.exit(1);
if (L.cashRatio(80000, 0) !== null) process.exit(1);
const row = L.computeRow({ month: "2024-01", currentAssets: 500000, inventory: 100000, cash: 80000, currentLiabilities: 0 });
if (row.currentRatio !== null || row.quickRatio !== null || row.cashRatio !== null) process.exit(1);
if (Number.isNaN(row.currentRatio) || row.currentRatio === Infinity) process.exit(1);
if (Number.isNaN(row.quickRatio) || row.quickRatio === Infinity) process.exit(1);
if (Number.isNaN(row.cashRatio) || row.cashRatio === Infinity) process.exit(1);
'

node_ok "zero cash yields cash ratio 0 not null" '
const L = require("./js/liquidity.js");
const v = L.cashRatio(0, 400000);
if (v !== 0) { console.error(v); process.exit(1); }
if (v === null || Number.isNaN(v) || v === Infinity) process.exit(1);
'

node_ok "zero inventory yields quick ratio equal to current ratio" '
const L = require("./js/liquidity.js");
const current = L.currentRatio(500, 200);
const quick = L.quickRatio(500, 0, 200);
if (current !== 2.5 || quick !== 2.5) process.exit(1);
'

node_ok "null inputs return null not NaN" '
const L = require("./js/liquidity.js");
if (L.currentRatio(null, 1) !== null) process.exit(1);
if (L.currentRatio(1, null) !== null) process.exit(1);
if (L.currentRatio(undefined, undefined) !== null) process.exit(1);
if (L.quickRatio(null, 1, 1) !== null) process.exit(1);
if (L.quickRatio(1, null, 1) !== null) process.exit(1);
if (L.quickRatio(1, 1, null) !== null) process.exit(1);
if (L.cashRatio(null, 1) !== null) process.exit(1);
if (L.cashRatio(1, null) !== null) process.exit(1);
const row = L.computeRow({ month: "2024-01", currentAssets: null, inventory: null, cash: null, currentLiabilities: null });
if (row.currentRatio !== null || row.quickRatio !== null || row.cashRatio !== null) process.exit(1);
if (Number.isNaN(row.currentRatio) || row.currentRatio === Infinity) process.exit(1);
if (L.computeRow(null).currentRatio !== null) process.exit(1);
'

node_ok "empty series returns empty months and null latest" '
const L = require("./js/liquidity.js");
const r = L.computeTracker({ company: "T", months: [] });
if (r.months.length !== 0 || r.latest !== null || r.best !== null || r.worst !== null) process.exit(1);
if (r.averageCurrentRatio !== null || r.monthCount !== 0) process.exit(1);
'

node_ok "null dataset is safe" '
const L = require("./js/liquidity.js");
const r = L.computeTracker(null);
if (!r || r.months.length !== 0 || r.latest !== null) process.exit(1);
if (r.monthCount !== 0) process.exit(1);
'

node_ok "never emits NaN or Infinity on sample data" '
const L = require("./js/liquidity.js");
const data = require("./data/liquidity.json");
const r = L.computeTracker(data);
function walk(obj) {
  if (obj === null || obj === undefined) return;
  if (typeof obj === "number") {
    if (!Number.isFinite(obj)) process.exit(1);
    return;
  }
  if (Array.isArray(obj)) {
    for (const item of obj) walk(item);
    return;
  }
  if (typeof obj === "object") {
    for (const key of Object.keys(obj)) walk(obj[key]);
  }
}
walk(r);
if (r.monthCount < 15) process.exit(1);
const latest = r.latest;
if (Math.abs(latest.currentRatio - latest.currentAssets / latest.currentLiabilities) > 1e-12) process.exit(1);
if (Math.abs(latest.quickRatio - (latest.currentAssets - latest.inventory) / latest.currentLiabilities) > 1e-12) process.exit(1);
if (Math.abs(latest.cashRatio - latest.cash / latest.currentLiabilities) > 1e-12) process.exit(1);
'

node_ok "MoM is null on first month and signed after" '
const L = require("./js/liquidity.js");
const data = require("./data/liquidity.json");
const r = L.computeTracker(data);
if (r.months[0].mom.currentRatio !== null) process.exit(1);
if (r.months[0].mom.quickRatio !== null) process.exit(1);
if (r.months[0].mom.cashRatio !== null) process.exit(1);
const second = r.months[1];
if (!second.mom.currentRatio || typeof second.mom.currentRatio.delta !== "number") process.exit(1);
if (!Number.isFinite(second.mom.currentRatio.delta)) process.exit(1);
const expected = Math.round((second.currentRatio - r.months[0].currentRatio) * 10000) / 10000;
if (second.mom.currentRatio.delta !== expected) process.exit(1);
'

node_ok "momTrend null previous or current returns null" '
const L = require("./js/liquidity.js");
if (L.momTrend(null, 1, true) !== null) process.exit(1);
if (L.momTrend(1, null, true) !== null) process.exit(1);
if (L.momTrend(null, null, true) !== null) process.exit(1);
const t = L.momTrend(2.11, 2.08, true, 4);
if (!t || t.improving !== true || t.direction !== "up") process.exit(1);
const z = L.momTrend(10, 0, true);
if (!z || z.delta !== 10 || z.pct !== null) process.exit(1);
'

node_ok "target comparison meeting and missing" '
const L = require("./js/liquidity.js");
const meet = L.vsTarget(2.11, 1.8, true);
if (!meet || meet.meeting !== true) process.exit(1);
const miss = L.vsTarget(1.5, 1.8, true);
if (!miss || miss.meeting !== false) process.exit(1);
if (L.vsTarget(null, 1, true) !== null) process.exit(1);
if (L.vsTarget(1, 0, true).pct !== null) process.exit(1);
const data = require("./data/liquidity.json");
const r = L.computeTracker(data);
if (r.latest.vsTarget.currentRatio == null) process.exit(1);
if (r.latest.vsTarget.quickRatio == null) process.exit(1);
if (r.latest.vsTarget.cashRatio == null) process.exit(1);
'

node_ok "sample data has at least 15 months with required inputs and targets" '
const data = require("./data/liquidity.json");
if (!Array.isArray(data.months) || data.months.length < 15) process.exit(1);
if (data.targets == null) process.exit(1);
if (data.targets.currentRatio == null || data.targets.quickRatio == null || data.targets.cashRatio == null) process.exit(1);
for (const row of data.months) {
  if (!row.month || row.currentAssets == null || row.inventory == null) process.exit(1);
  if (row.cash == null || row.currentLiabilities == null) process.exit(1);
}
const r = require("./js/liquidity.js").computeTracker(data);
if (!r.best || !r.worst || r.best.currentRatio < r.worst.currentRatio) process.exit(1);
'

# --- Static HTML first paint ---

if [[ ! -f index.html ]]; then
  fail "index.html exists"
else
  pass "index.html exists"
fi

if grep -qi "Loading" index.html; then
  fail "static HTML has no Loading shell"
else
  pass "static HTML has no Loading shell"
fi

if grep -qi "current ratio" index.html && grep -qi "quick ratio" index.html && grep -qi "cash ratio" index.html; then
  pass "static HTML contains current / quick / cash ratio content"
else
  fail "static HTML contains current / quick / cash ratio content"
fi

if [[ -f .nojekyll ]]; then
  pass ".nojekyll exists for GitHub Pages"
else
  fail ".nojekyll exists for GitHub Pages"
fi

node_ok "static HTML contains computed latest metric numbers" '
const fs = require("fs");
const L = require("./js/liquidity.js");
const data = require("./data/liquidity.json");
const html = fs.readFileSync("index.html", "utf8");
const r = L.computeTracker(data);
const current = L.formatRatio(r.latest.currentRatio, 2);
const quick = L.formatRatio(r.latest.quickRatio, 2);
const cash = L.formatRatio(r.latest.cashRatio, 2);
if (!current || !html.includes(current)) { console.error("missing current", current); process.exit(1); }
if (!quick || !html.includes(quick)) { console.error("missing quick", quick); process.exit(1); }
if (!cash || !html.includes(cash)) { console.error("missing cash", cash); process.exit(1); }
if (!html.includes("data-metric=\"currentRatio\"")) process.exit(1);
if (!html.includes("data-metric=\"quickRatio\"")) process.exit(1);
if (!html.includes("data-metric=\"cashRatio\"")) process.exit(1);
if (!html.includes("<table")) process.exit(1);
if (!html.includes("id=\"monthly-liquidity\"")) process.exit(1);
if (html.toLowerCase().includes("loading")) process.exit(1);
'

node_ok "static HTML has a row for every sample month" '
const fs = require("fs");
const L = require("./js/liquidity.js");
const data = require("./data/liquidity.json");
const html = fs.readFileSync("index.html", "utf8");
const r = L.computeTracker(data);
if (r.months.length < 15) process.exit(1);
for (const row of r.months) {
  if (!html.includes("data-month=\"" + row.month + "\"")) { console.error("missing month", row.month); process.exit(1); }
}
if (!html.includes("target-comparison")) process.exit(1);
if (!html.includes("Best current ratio") || !html.includes("Worst current ratio")) process.exit(1);
'

# curl first-paint (no JS execution)
PORT=8767
python3 -m http.server "$PORT" --bind 127.0.0.1 >/tmp/liquidity-http.log 2>&1 &
HTTP_PID=$!
cleanup() { kill "$HTTP_PID" 2>/dev/null || true; }
trap cleanup EXIT

ready=0
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if curl -sf "http://127.0.0.1:${PORT}/" >/dev/null; then
    ready=1
    break
  fi
  sleep 0.2
done

if [[ "$ready" -ne 1 ]]; then
  fail "local HTTP server started for curl"
else
  pass "local HTTP server started for curl"
  HTML="$(curl -sL "http://127.0.0.1:${PORT}/")"
  if echo "$HTML" | grep -qi "current ratio" && echo "$HTML" | grep -qi "quick ratio" && echo "$HTML" | grep -qi "cash ratio"; then
    pass "curl first-paint contains current / quick / cash ratio content"
  else
    fail "curl first-paint contains current / quick / cash ratio content"
  fi
  LATEST_CURRENT="$(node -e 'const L=require("./js/liquidity.js"); const r=L.computeTracker(require("./data/liquidity.json")); process.stdout.write(L.formatRatio(r.latest.currentRatio,2));')"
  LATEST_QUICK="$(node -e 'const L=require("./js/liquidity.js"); const r=L.computeTracker(require("./data/liquidity.json")); process.stdout.write(L.formatRatio(r.latest.quickRatio,2));')"
  LATEST_CASH="$(node -e 'const L=require("./js/liquidity.js"); const r=L.computeTracker(require("./data/liquidity.json")); process.stdout.write(L.formatRatio(r.latest.cashRatio,2));')"
  if echo "$HTML" | grep -q "$LATEST_CURRENT" && echo "$HTML" | grep -q "$LATEST_QUICK" && echo "$HTML" | grep -q "$LATEST_CASH"; then
    pass "curl first-paint contains latest current / quick / cash ratio numbers"
  else
    fail "curl first-paint contains latest current / quick / cash ratio numbers"
  fi
  if echo "$HTML" | grep -q "data-month="; then
    pass "curl first-paint contains monthly table rows"
  else
    fail "curl first-paint contains monthly table rows"
  fi
  if echo "$HTML" | grep -qi "Loading"; then
    fail "curl first-paint has no Loading shell"
  else
    pass "curl first-paint has no Loading shell"
  fi
  MONTH_ROWS="$(printf '%s' "$HTML" | grep -o 'data-month=' | wc -l | tr -d ' ')"
  if [[ "$MONTH_ROWS" -ge 15 ]]; then
    pass "curl first-paint has at least 15 month rows"
  else
    fail "curl first-paint has at least 15 month rows"
  fi
fi

echo "Summary: ${passed} passed, ${failed} failed"
if [[ "$failed" -ne 0 ]]; then
  exit 1
fi
exit 0
