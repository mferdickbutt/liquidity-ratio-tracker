/**
 * Liquidity ratio trend metrics.
 * Works in the browser (global Liquidity) and in Node (module.exports).
 *
 *   Current ratio = current assets / current liabilities
 *   Quick ratio   = (current assets − inventory) / current liabilities
 *   Cash ratio    = cash / current liabilities
 *
 * Unsafe inputs (null/empty, non-finite, zero current liabilities) return null.
 * Never returns NaN or Infinity.
 */
(function (global, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    global.Liquidity = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var DEFAULT_POLARITY = {
    currentRatio: true,
    quickRatio: true,
    cashRatio: true,
  };

  var METRIC_KEYS = ["currentRatio", "quickRatio", "cashRatio"];

  function toNum(value) {
    if (value === null || value === undefined || value === "") return null;
    if (typeof value === "string" && value.trim() === "") return null;
    var n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n)) return null;
    return n;
  }

  function finiteOrNull(n) {
    if (n === null || n === undefined) return null;
    if (!Number.isFinite(n)) return null;
    return n;
  }

  function ratio(numer, denom) {
    var n = toNum(numer);
    var d = toNum(denom);
    if (n === null || d === null || d === 0) return null;
    return finiteOrNull(n / d);
  }

  function currentRatio(currentAssets, currentLiabilities) {
    return ratio(currentAssets, currentLiabilities);
  }

  function quickRatio(currentAssets, inventory, currentLiabilities) {
    var assets = toNum(currentAssets);
    var inv = toNum(inventory);
    var liabilities = toNum(currentLiabilities);
    if (assets === null || inv === null || liabilities === null || liabilities === 0) {
      return null;
    }
    return finiteOrNull((assets - inv) / liabilities);
  }

  function cashRatio(cash, currentLiabilities) {
    return ratio(cash, currentLiabilities);
  }

  function emptyRow() {
    return {
      month: null,
      currentAssets: null,
      inventory: null,
      cash: null,
      currentLiabilities: null,
      currentRatio: null,
      quickRatio: null,
      cashRatio: null,
      mom: {
        currentRatio: null,
        quickRatio: null,
        cashRatio: null,
      },
      vsTarget: {
        currentRatio: null,
        quickRatio: null,
        cashRatio: null,
      },
    };
  }

  function computeRow(input) {
    if (!input || typeof input !== "object") {
      return emptyRow();
    }
    var assets = toNum(input.currentAssets);
    var inv = toNum(input.inventory);
    var cash = toNum(input.cash);
    var liabilities = toNum(input.currentLiabilities);
    var row = emptyRow();
    row.month = input.month == null ? null : String(input.month);
    row.currentAssets = assets;
    row.inventory = inv;
    row.cash = cash;
    row.currentLiabilities = liabilities;
    row.currentRatio = currentRatio(assets, liabilities);
    row.quickRatio = quickRatio(assets, inv, liabilities);
    row.cashRatio = cashRatio(cash, liabilities);
    return row;
  }

  function momTrend(current, previous, higherIsBetter, roundDigits) {
    var c = toNum(current);
    var p = toNum(previous);
    if (c === null || p === null) return null;
    var delta = c - p;
    if (!Number.isFinite(delta)) return null;
    var digits = roundDigits == null ? 4 : roundDigits;
    var factor = Math.pow(10, digits);
    var rounded = Math.round(delta * factor) / factor;
    if (!Number.isFinite(rounded)) return null;
    if (rounded === 0) rounded = 0;
    var direction = rounded > 0 ? "up" : rounded < 0 ? "down" : "flat";
    var improving = false;
    if (direction !== "flat" && higherIsBetter != null) {
      improving = higherIsBetter ? rounded > 0 : rounded < 0;
    }
    var pct = p === 0 ? null : finiteOrNull(delta / Math.abs(p));
    return {
      delta: rounded,
      pct: pct,
      direction: direction,
      improving: improving,
      flat: direction === "flat",
    };
  }

  function vsTarget(value, target, higherIsBetter) {
    var v = toNum(value);
    var t = toNum(target);
    if (v === null || t === null) return null;
    var delta = finiteOrNull(v - t);
    if (delta === null) return null;
    var pct = t === 0 ? null : finiteOrNull(delta / Math.abs(t));
    var betterHigh = higherIsBetter !== false;
    var meeting = betterHigh ? v >= t : v <= t;
    return {
      value: v,
      target: t,
      delta: delta,
      pct: pct,
      meeting: meeting,
      higherIsBetter: betterHigh,
    };
  }

  function polarityFromDataset(dataset) {
    var out = {
      currentRatio: DEFAULT_POLARITY.currentRatio,
      quickRatio: DEFAULT_POLARITY.quickRatio,
      cashRatio: DEFAULT_POLARITY.cashRatio,
    };
    var raw = dataset && dataset.targetPolarity;
    if (!raw || typeof raw !== "object") return out;
    for (var i = 0; i < METRIC_KEYS.length; i++) {
      var key = METRIC_KEYS[i];
      var flag = raw[key];
      if (flag === "floor" || flag === true) out[key] = true;
      else if (flag === "ceiling" || flag === false) out[key] = false;
    }
    return out;
  }

  function attachMom(months, polarity) {
    for (var i = 0; i < months.length; i++) {
      var row = months[i];
      var prev = i === 0 ? null : months[i - 1];
      row.mom = {
        currentRatio: momTrend(
          row.currentRatio,
          prev ? prev.currentRatio : null,
          polarity.currentRatio,
          4
        ),
        quickRatio: momTrend(
          row.quickRatio,
          prev ? prev.quickRatio : null,
          polarity.quickRatio,
          4
        ),
        cashRatio: momTrend(
          row.cashRatio,
          prev ? prev.cashRatio : null,
          polarity.cashRatio,
          4
        ),
      };
    }
  }

  function attachTargets(months, targets, polarity) {
    var t = targets && typeof targets === "object" ? targets : {};
    for (var i = 0; i < months.length; i++) {
      var row = months[i];
      row.vsTarget = {
        currentRatio: vsTarget(row.currentRatio, t.currentRatio, polarity.currentRatio),
        quickRatio: vsTarget(row.quickRatio, t.quickRatio, polarity.quickRatio),
        cashRatio: vsTarget(row.cashRatio, t.cashRatio, polarity.cashRatio),
      };
    }
  }

  function extrema(months, key) {
    var best = null;
    var worst = null;
    for (var i = 0; i < months.length; i++) {
      var row = months[i];
      var v = toNum(row[key]);
      if (v === null) continue;
      if (!best || v > toNum(best[key])) best = row;
      if (!worst || v < toNum(worst[key])) worst = row;
    }
    return { best: best, worst: worst };
  }

  function mean(months, key) {
    var sum = 0;
    var count = 0;
    for (var i = 0; i < months.length; i++) {
      var v = toNum(months[i][key]);
      if (v === null) continue;
      sum += v;
      count += 1;
    }
    if (count === 0) return null;
    return finiteOrNull(sum / count);
  }

  function emptyResult() {
    return {
      company: null,
      currency: null,
      period: "month",
      conventions: null,
      targets: {
        currentRatio: null,
        quickRatio: null,
        cashRatio: null,
      },
      polarity: {
        currentRatio: DEFAULT_POLARITY.currentRatio,
        quickRatio: DEFAULT_POLARITY.quickRatio,
        cashRatio: DEFAULT_POLARITY.cashRatio,
      },
      months: [],
      latest: null,
      previous: null,
      best: null,
      worst: null,
      averageCurrentRatio: null,
      averageQuickRatio: null,
      averageCashRatio: null,
      monthCount: 0,
    };
  }

  function computeTracker(dataset) {
    if (!dataset || typeof dataset !== "object") {
      return emptyResult();
    }
    var polarity = polarityFromDataset(dataset);
    var targetsIn = dataset.targets && typeof dataset.targets === "object" ? dataset.targets : {};
    var targets = {
      currentRatio: toNum(targetsIn.currentRatio),
      quickRatio: toNum(targetsIn.quickRatio),
      cashRatio: toNum(targetsIn.cashRatio),
    };
    var rawMonths = Array.isArray(dataset.months) ? dataset.months : [];
    var months = [];
    for (var i = 0; i < rawMonths.length; i++) {
      if (!rawMonths[i] || typeof rawMonths[i] !== "object") continue;
      months.push(computeRow(rawMonths[i]));
    }
    months.sort(function (a, b) {
      var am = a.month || "";
      var bm = b.month || "";
      if (am < bm) return -1;
      if (am > bm) return 1;
      return 0;
    });
    attachMom(months, polarity);
    attachTargets(months, targets, polarity);
    var ext = extrema(months, "currentRatio");
    var result = emptyResult();
    result.company = dataset.company == null ? null : String(dataset.company);
    result.currency = dataset.currency == null ? null : String(dataset.currency);
    result.period = dataset.period == null ? "month" : String(dataset.period);
    result.conventions =
      dataset.conventions && typeof dataset.conventions === "object"
        ? dataset.conventions
        : null;
    result.targets = targets;
    result.polarity = polarity;
    result.months = months;
    result.latest = months.length ? months[months.length - 1] : null;
    result.previous = months.length > 1 ? months[months.length - 2] : null;
    result.best = ext.best;
    result.worst = ext.worst;
    result.averageCurrentRatio = mean(months, "currentRatio");
    result.averageQuickRatio = mean(months, "quickRatio");
    result.averageCashRatio = mean(months, "cashRatio");
    result.monthCount = months.length;
    return result;
  }

  function formatRatio(value, digits) {
    var n = toNum(value);
    if (n === null) return null;
    var d = digits == null ? 2 : digits;
    return n.toFixed(d);
  }

  function formatPct(value, digits) {
    var n = toNum(value);
    if (n === null) return null;
    var d = digits == null ? 1 : digits;
    return (n * 100).toFixed(d);
  }

  return {
    toNum: toNum,
    currentRatio: currentRatio,
    quickRatio: quickRatio,
    cashRatio: cashRatio,
    ratio: ratio,
    computeRow: computeRow,
    momTrend: momTrend,
    vsTarget: vsTarget,
    computeTracker: computeTracker,
    formatRatio: formatRatio,
    formatPct: formatPct,
    DEFAULT_POLARITY: DEFAULT_POLARITY,
  };
});
