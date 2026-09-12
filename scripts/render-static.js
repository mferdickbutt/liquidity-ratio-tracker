#!/usr/bin/env node
/**
 * Bake computed liquidity ratios into index.html so first paint needs no JavaScript.
 *
 * Usage: node scripts/render-static.js
 */
"use strict";

var fs = require("fs");
var path = require("path");
var Liquidity = require("../js/liquidity.js");

var ROOT = path.resolve(__dirname, "..");
var DATA_PATH = path.join(ROOT, "data", "liquidity.json");
var OUT_PATH = path.join(ROOT, "index.html");

function esc(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function monthLabel(ym) {
  if (!ym || typeof ym !== "string" || ym.length < 7) return ym || "—";
  var parts = ym.split("-");
  var year = Number(parts[0]);
  var month = Number(parts[1]);
  if (!year || !month) return ym;
  return new Date(year, month - 1, 1).toLocaleString("en-US", {
    month: "short",
    year: "numeric",
  });
}

function money(n, currency) {
  if (n === null || n === undefined) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(n);
  } catch (err) {
    return String(n);
  }
}

function ratioText(n, digits) {
  var formatted = Liquidity.formatRatio(n, digits == null ? 2 : digits);
  return formatted === null ? "—" : formatted;
}

function signedRatio(n, digits) {
  if (n === null || n === undefined) return "—";
  var d = digits == null ? 4 : digits;
  var abs = Math.abs(n).toFixed(d);
  if (n > 0) return "+" + abs;
  if (n < 0) return "−" + abs;
  return abs;
}

function trendHtml(mom) {
  if (!mom) return '<span class="trend na">MoM n/a</span>';
  var arrow = mom.direction === "up" ? "↑" : mom.direction === "down" ? "↓" : "→";
  var cls = mom.flat ? "flat" : mom.improving ? "improving" : "worsening";
  var delta = mom.flat ? "0.0000" : signedRatio(mom.delta, 4);
  var word = mom.flat ? "unchanged" : mom.improving ? "improving" : "worsening";
  var pct =
    mom.pct === null || mom.pct === undefined
      ? ""
      : " · " +
        (mom.pct > 0 ? "+" : mom.pct < 0 ? "−" : "") +
        Math.abs(mom.pct * 100).toFixed(1) +
        "%";
  return (
    '<span class="trend ' +
    cls +
    '">' +
    arrow +
    " " +
    esc(delta) +
    pct +
    " MoM (" +
    word +
    ")</span>"
  );
}

function pill(vs) {
  if (!vs) return '<span class="pill">no target</span>';
  var cls = vs.meeting ? "meeting" : "missing";
  var word = vs.meeting ? "meeting" : "missing";
  return '<span class="pill ' + cls + '">' + word + " target</span>";
}

function sparkline(months) {
  var width = 1040;
  var height = 64;
  var values = months.map(function (m) {
    return m.currentRatio;
  });
  var usable = values.filter(function (v) {
    return v !== null;
  });
  if (usable.length < 2) return "";
  var min = Math.min.apply(null, usable);
  var max = Math.max.apply(null, usable);
  var span = max - min || 1;
  var coords = [];
  for (var i = 0; i < values.length; i++) {
    var v = values[i];
    if (v === null) continue;
    var x = (i / (values.length - 1)) * width;
    var y = height - ((v - min) / span) * (height - 8) - 4;
    coords.push(x.toFixed(1) + "," + y.toFixed(1));
  }
  var last = months[months.length - 1];
  var first = months[0];
  return (
    '<div class="spark" id="liquidity-sparkline">' +
    '<p class="note">Current ratio trend (' +
    esc(monthLabel(first.month)) +
    " → " +
    esc(monthLabel(last.month)) +
    ")</p>" +
    '<svg viewBox="0 0 ' +
    width +
    " " +
    height +
    '" role="img" aria-label="Current ratio sparkline from ' +
    esc(ratioText(first.currentRatio)) +
    " to " +
    esc(ratioText(last.currentRatio)) +
    '">' +
    '<polyline fill="none" stroke="#1d4e89" stroke-width="3" points="' +
    coords.join(" ") +
    '" />' +
    "</svg></div>"
  );
}

function cardHtml(latest, key, title, name, valueHtml) {
  var mom = latest.mom ? latest.mom[key] : null;
  var vs = latest.vsTarget ? latest.vsTarget[key] : null;
  return (
    '<article class="card" id="card-' +
    key +
    '">' +
    '<p class="label">' +
    esc(title) +
    "</p>" +
    '<p class="name">' +
    esc(name) +
    "</p>" +
    '<p class="metric-value" data-metric="' +
    key +
    '">' +
    valueHtml +
    "</p>" +
    '<div class="meta">' +
    trendHtml(mom) +
    pill(vs) +
    "</div></article>"
  );
}

function signedText(formatFn, n) {
  if (n === null || n === undefined) return "—";
  var text = formatFn(Math.abs(n));
  if (n > 0) return "+" + text;
  if (n < 0) return "−" + text;
  return text;
}

function targetCard(label, vs, formatFn) {
  if (!vs) {
    return (
      '<article class="target-card"><p class="label">' +
      esc(label) +
      '</p><p class="values">—</p></article>'
    );
  }
  return (
    '<article class="target-card" data-target="' +
    esc(label) +
    '">' +
    '<p class="label">' +
    esc(label) +
    "</p>" +
    '<p class="values">' +
    esc(formatFn(vs.value)) +
    " vs " +
    esc(formatFn(vs.target)) +
    " (" +
    esc(signedText(formatFn, vs.delta)) +
    ")</p>" +
    pill(vs) +
    "</article>"
  );
}

function momShort(mom) {
  if (!mom) return '<span class="trend na">n/a</span>';
  var arrow = mom.direction === "up" ? "↑" : mom.direction === "down" ? "↓" : "→";
  var cls = mom.flat ? "flat" : mom.improving ? "improving" : "worsening";
  var delta = mom.flat ? "0.00" : signedRatio(mom.delta, 2);
  return '<span class="trend ' + cls + '">' + arrow + " " + esc(delta) + "</span>";
}

function monthTable(report) {
  var currency = report.currency || "USD";
  var head =
    "<thead><tr>" +
    "<th>Month</th>" +
    "<th>Current assets</th><th>Inventory</th><th>Cash</th><th>Current liabilities</th>" +
    "<th>Current ratio</th><th>Current MoM</th><th>Current vs target</th>" +
    "<th>Quick ratio</th><th>Quick MoM</th><th>Quick vs target</th>" +
    "<th>Cash ratio</th><th>Cash MoM</th><th>Cash vs target</th>" +
    "</tr></thead>";
  var rows = report.months.map(function (row) {
    var vsCurrent = row.vsTarget && row.vsTarget.currentRatio;
    var missClass = vsCurrent && vsCurrent.meeting === false ? ' class="miss"' : "";
    return (
      '<tr data-month="' +
      esc(row.month || "") +
      '"' +
      missClass +
      ">" +
      "<td>" +
      esc(monthLabel(row.month)) +
      ' <span class="note">(' +
      esc(row.month || "") +
      ")</span></td>" +
      "<td>" +
      esc(money(row.currentAssets, currency)) +
      "</td>" +
      "<td>" +
      esc(money(row.inventory, currency)) +
      "</td>" +
      "<td>" +
      esc(money(row.cash, currency)) +
      "</td>" +
      "<td>" +
      esc(money(row.currentLiabilities, currency)) +
      "</td>" +
      '<td data-current-ratio="' +
      esc(ratioText(row.currentRatio)) +
      '">' +
      esc(ratioText(row.currentRatio)) +
      "</td>" +
      "<td>" +
      momShort(row.mom && row.mom.currentRatio) +
      "</td>" +
      "<td>" +
      pill(vsCurrent) +
      "</td>" +
      '<td data-quick-ratio="' +
      esc(ratioText(row.quickRatio)) +
      '">' +
      esc(ratioText(row.quickRatio)) +
      "</td>" +
      "<td>" +
      momShort(row.mom && row.mom.quickRatio) +
      "</td>" +
      "<td>" +
      pill(row.vsTarget && row.vsTarget.quickRatio) +
      "</td>" +
      '<td data-cash-ratio="' +
      esc(ratioText(row.cashRatio)) +
      '">' +
      esc(ratioText(row.cashRatio)) +
      "</td>" +
      "<td>" +
      momShort(row.mom && row.mom.cashRatio) +
      "</td>" +
      "<td>" +
      pill(row.vsTarget && row.vsTarget.cashRatio) +
      "</td>" +
      "</tr>"
    );
  });
  return (
    '<div class="table-wrap"><table id="monthly-liquidity">' +
    head +
    "<tbody>" +
    rows.join("") +
    "</tbody></table></div>"
  );
}

function render(dataset) {
  var report = Liquidity.computeTracker(dataset);
  if (!report.latest) {
    throw new Error("No months to render");
  }
  var latest = report.latest;

  var cards =
    cardHtml(
      latest,
      "currentRatio",
      "Current ratio",
      "Current assets / current liabilities",
      esc(ratioText(latest.currentRatio))
    ) +
    cardHtml(
      latest,
      "quickRatio",
      "Quick ratio",
      "(Current assets − inventory) / current liabilities",
      esc(ratioText(latest.quickRatio))
    ) +
    cardHtml(
      latest,
      "cashRatio",
      "Cash ratio",
      "Cash / current liabilities",
      esc(ratioText(latest.cashRatio))
    );

  var targets =
    '<div class="target-grid" id="target-comparison">' +
    targetCard("Current ratio vs floor", latest.vsTarget.currentRatio, function (n) {
      return ratioText(n);
    }) +
    targetCard("Quick ratio vs floor", latest.vsTarget.quickRatio, function (n) {
      return ratioText(n);
    }) +
    targetCard("Cash ratio vs floor", latest.vsTarget.cashRatio, function (n) {
      return ratioText(n);
    }) +
    "</div>";

  var best = report.best;
  var worst = report.worst;
  var extremaHtml =
    '<div class="extrema" id="ratio-extrema">' +
    "<article><h3>Best current ratio</h3><p>" +
    (best
      ? esc(monthLabel(best.month)) +
        " (" +
        esc(best.month) +
        "): " +
        esc(ratioText(best.currentRatio))
      : "—") +
    "</p></article>" +
    "<article><h3>Worst current ratio</h3><p>" +
    (worst
      ? esc(monthLabel(worst.month)) +
        " (" +
        esc(worst.month) +
        "): " +
        esc(ratioText(worst.currentRatio))
      : "—") +
    "</p></article></div>";

  var avgLine =
    "Averages across " +
    report.monthCount +
    " months: current " +
    ratioText(report.averageCurrentRatio) +
    ", quick " +
    ratioText(report.averageQuickRatio) +
    ", cash " +
    ratioText(report.averageCashRatio) +
    ". All three targets are floors (meeting when ratio ≥ target).";

  return (
    "<!DOCTYPE html>\n" +
    '<html lang="en">\n' +
    "<head>\n" +
    '  <meta charset="utf-8" />\n' +
    '  <meta name="viewport" content="width=device-width, initial-scale=1" />\n' +
    "  <title>Liquidity ratio tracker — " +
    esc(report.company || "Tracker") +
    "</title>\n" +
    '  <link rel="stylesheet" href="css/style.css" />\n' +
    "</head>\n" +
    "<body>\n" +
    '  <header class="hero">\n' +
    '    <div class="wrap">\n' +
    '      <p class="kicker">Liquidity</p>\n' +
    "      <h1>Liquidity ratio trend tracker</h1>\n" +
    '      <p class="sub">' +
    esc(report.company || "Sample company") +
    " · " +
    String(report.monthCount) +
    " months of current assets, inventory, cash, and current liabilities. Current ratio, quick ratio, cash ratio, MoM change, and target comparison are baked into this HTML for first paint without JavaScript.</p>\n" +
    '      <div class="formula-strip" aria-label="Formulas">\n' +
    "        <code>current ratio = current assets / current liabilities</code>\n" +
    "        <code>quick ratio = (current assets − inventory) / current liabilities</code>\n" +
    "        <code>cash ratio = cash / current liabilities</code>\n" +
    "      </div>\n" +
    "    </div>\n" +
    "  </header>\n" +
    '  <main class="wrap">\n' +
    '    <section class="section" id="latest">\n' +
    "      <h2>Latest month · " +
    esc(monthLabel(latest.month)) +
    " (" +
    esc(latest.month) +
    ") — current, quick, and cash ratios</h2>\n" +
    '      <p class="note">' +
    esc(avgLine) +
    "</p>\n" +
    '      <div class="cards">' +
    cards +
    "</div>\n" +
    targets +
    extremaHtml +
    sparkline(report.months) +
    "    </section>\n" +
    '    <section class="section" id="monthly">\n' +
    "      <h2>Monthly current, quick, and cash ratios</h2>\n" +
    '      <p class="note">Rows are calendar months. MoM is this month’s ratio minus the prior month. A missing current-ratio target means the month is below the floor of ' +
    esc(ratioText(report.targets.currentRatio)) +
    ".</p>\n" +
    monthTable(report) +
    "    </section>\n" +
    "  </main>\n" +
    '  <footer class="wrap">\n' +
    "    <p>Static snapshot generated from <code>data/liquidity.json</code> via <code>node scripts/render-static.js</code>. JavaScript only enhances; it does not supply these numbers.</p>\n" +
    "  </footer>\n" +
    '  <script src="js/liquidity.js" defer></script>\n' +
    '  <script src="js/enhance.js" defer></script>\n' +
    "</body>\n" +
    "</html>\n"
  );
}

function main() {
  var raw = fs.readFileSync(DATA_PATH, "utf8");
  var dataset = JSON.parse(raw);
  var html = render(dataset);
  fs.writeFileSync(OUT_PATH, html);
  var report = Liquidity.computeTracker(dataset);
  process.stdout.write(
    "Wrote " +
      path.relative(ROOT, OUT_PATH) +
      " (" +
      report.monthCount +
      " months, latest current " +
      ratioText(report.latest.currentRatio) +
      " / quick " +
      ratioText(report.latest.quickRatio) +
      " / cash " +
      ratioText(report.latest.cashRatio) +
      ")\n"
  );
}

main();
