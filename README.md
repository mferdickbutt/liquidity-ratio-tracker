# Liquidity ratio trend tracker

Public monthly liquidity dashboard for **Northwind Components**. **First paint is the metrics and table** — `index.html` is generated with current ratio, quick ratio, cash ratio, MoM change, and target comparison already in the markup. JavaScript only adds a `js-enhanced` class.

Sample series: **18 months** (Jan 2025–Jun 2026).

## Formulas

Unsafe math returns `null` (never `NaN` or `Infinity`). Zero current liabilities is a zero denominator.

| Metric | Formula | Notes |
| --- | --- | --- |
| **Current ratio** | `currentAssets / currentLiabilities` | Ability to cover short-term obligations with all current assets. Higher is better (floor). |
| **Quick ratio** | `(currentAssets − inventory) / currentLiabilities` | Acid-test: current assets excluding inventory. Higher is better (floor). |
| **Cash ratio** | `cash / currentLiabilities` | Strictest liquidity screen. Higher is better (floor). |
| **MoM** | `this month − prior month` | First month is `n/a`. Percent change uses `Δ / \|prior\|`; prior of `0` → percent `null`. Rising ratios are treated as improving. |
| **vs target** | `value − target` | All three ratios are floors (meeting when `value ≥ target`). |

Zero-denominator and missing-input cases:

- zero current liabilities → current, quick, and cash ratios `null` (never `Infinity`)
- zero cash, positive liabilities → cash ratio `0`
- zero inventory, positive liabilities → quick ratio equals current ratio
- null / empty / non-finite inputs → `null`
- empty series / null dataset → empty months, `latest = null`

`js/liquidity.js` is a pure browser + Node module (`Liquidity` global, or `require('./js/liquidity.js')`).

## Data schema

`data/liquidity.json` (`liquidity-ratio/v1`):

- `months[]` — `{ month, currentAssets, inventory, cash, currentLiabilities }`
- `targets.currentRatio` — liquidity floor
- `targets.quickRatio` — acid-test floor
- `targets.cashRatio` — cash floor
- `targetPolarity` — `floor` or `ceiling` per metric (sample uses floors)

Sample floors: current **1.80**, quick **1.00**, cash **0.25**.

## How to re-render

After editing `data/liquidity.json` or `js/liquidity.js`:

```bash
node scripts/render-static.js
```

That rewrites `index.html` (summary cards, target comparison, best/worst, sparkline, monthly table). Do not hand-edit the baked numbers. `.nojekyll` is present so GitHub Pages will serve the site as static files.

```bash
bash scripts/test.sh
```

Tests cover zero current liabilities / null / empty fixtures, plus a static-HTML first-paint check (`curl -sL` of local `index.html`, not a Loading-only shell).

## Files

- `data/liquidity.json` — 18 months of balances and targets
- `js/liquidity.js` — browser + Node module for ratios, MoM, targets
- `js/enhance.js` — optional class flag only; does not supply numbers
- `scripts/render-static.js` — static HTML baker
- `index.html` — first-paint snapshot
- `css/style.css` — minimal layout
- `.nojekyll` — serve as plain files on GitHub Pages

## Suggested next improvements

- Replace the sample JSON with a live pull from the GL (cash, inventory, other current assets, and current liabilities roll-forwards).
- Split the quick ratio into cash + receivables vs inventory, and show days inventory outstanding beside the dip months.
- Industry peer bands (manufacturing current-ratio 1.5–2.5) next to the internal floors.
- Alert when cash ratio breaches the floor for two consecutive months (as in Jul and Dec 2025 in the sample).
- Multi-entity consolidation with intercompany eliminations, not only Northwind Components.
