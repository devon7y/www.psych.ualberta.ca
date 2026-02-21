/**
 * Predicting Memory from Brain Activity: Classifier Demo
 * Computational Memory Lab — University of Alberta
 *
 * An interactive walkthrough of how EEG classifiers predict subsequent memory.
 * Based on: Chakravarty, Chen & Caplan (2020), J Neurophysiol 124:2060–2075.
 */
(function () {
  "use strict";

  var PRE = 0.2, POST = 1.2, SR = 250;
  var N = Math.round((PRE + POST) * SR);

  // ------------------------------------------------------------------
  // COLORS
  // ------------------------------------------------------------------
  var DARK = {
    canvasBg:    "#141924",
    text:        "#c8d8e8",
    textDim:     "#8899aa",
    axes:        "#556677",
    grid:        "rgba(60,75,95,0.5)",
    hits:        "#4CAF50",
    misses:      "#ff6b6b",
    regionLPC:   "rgba(91,143,217,0.18)",
    regionSW:    "rgba(80,200,120,0.14)",
    stimulus:    "#ff4444",
    electrode:   "#5b8fd9",
    headOutline: "#8899aa",
    clf:         "#a78bfa",
    threshold:   "#f5a623",
    auc1:        "#5b8fd9",
    auc2:        "#4CAF50",
  };
  var LIGHT = {
    canvasBg:    "#f7fafc",
    text:        "#2d3748",
    textDim:     "#4a5568",
    axes:        "#718096",
    grid:        "rgba(160,174,192,0.4)",
    hits:        "#2d8a3e",
    misses:      "#c0392b",
    regionLPC:   "rgba(74,144,226,0.15)",
    regionSW:    "rgba(45,170,90,0.13)",
    stimulus:    "#c0392b",
    electrode:   "#2a6bbf",
    headOutline: "#718096",
    clf:         "#7c3aed",
    threshold:   "#b07d00",
    auc1:        "#2a6bbf",
    auc2:        "#2d8a3e",
  };
  function C() {
    return document.documentElement.getAttribute("data-theme") === "light" ? LIGHT : DARK;
  }

  // ------------------------------------------------------------------
  // PRNG (Mulberry32)
  // ------------------------------------------------------------------
  function rng32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function randn(rng) {
    var u1 = rng(), u2 = rng();
    while (u1 === 0) u1 = rng();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  // ------------------------------------------------------------------
  // SIGNAL GENERATION
  // ------------------------------------------------------------------
  function gauss(t, c, w, a) {
    return a * Math.exp(-0.5 * Math.pow((t - c) / w, 2));
  }
  function hitTemplate(t) {
    var v = gauss(t, 0.10, 0.028, -0.7) + gauss(t, 0.20, 0.042, 0.55);
    v += gauss(t, 0.55, 0.10, 1.6);
    if (t > 0.70) v += 0.9 * (1 - Math.exp(-(t - 0.70) / 0.15)) * Math.exp(-(t - 0.70) / 0.9) + 0.35;
    return v;
  }
  function missTemplate(t) {
    var v = gauss(t, 0.10, 0.028, -0.7) + gauss(t, 0.20, 0.042, 0.55);
    v += gauss(t, 0.55, 0.10, 0.25);
    if (t > 0.70) v += 0.08 * (1 - Math.exp(-(t - 0.70) / 0.15)) * Math.exp(-(t - 0.70) / 0.9) - 0.08;
    return v;
  }
  function makeERP(fn, nT, seed) {
    var rng = rng32(seed), avg = new Float64Array(N);
    for (var tr = 0; tr < nT; tr++)
      for (var i = 0; i < N; i++)
        avg[i] += fn(i / SR - PRE) + randn(rng) * 3.2;
    for (var j = 0; j < N; j++) avg[j] /= nT;
    return avg;
  }

  // Normal CDF approximation (Abramowitz & Stegun 26.2.17)
  function normCDF(x) {
    var t2 = 1 / (1 + 0.2316419 * Math.abs(x));
    var p = t2 * (0.319381530 + t2 * (-0.356563782
          + t2 * (1.781477937 + t2 * (-1.821255978 + t2 * 1.330274429))));
    var cdf = 1 - (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * x * x) * p;
    return x >= 0 ? cdf : 1 - cdf;
  }

  // Analytic ROC from two equal-variance Gaussians
  function gaussROC(muH, muM, sigma, nPts) {
    nPts = nPts || 200;
    var lo = Math.min(muH, muM) - 4.5 * sigma;
    var hi = Math.max(muH, muM) + 4.5 * sigma;
    var pts = [];
    for (var i = 0; i <= nPts; i++) {
      var thr = hi - (hi - lo) * i / nPts;
      pts.push({
        tpr: 1 - normCDF((thr - muH) / sigma),
        fpr: 1 - normCDF((thr - muM) / sigma),
      });
    }
    return pts;
  }
  function aucFromROC(pts) {
    var a = 0;
    for (var i = 1; i < pts.length; i++)
      a += (pts[i].fpr - pts[i-1].fpr) * (pts[i].tpr + pts[i-1].tpr) / 2;
    return Math.abs(a);
  }

  // ------------------------------------------------------------------
  // DRAWING UTILITIES
  // ------------------------------------------------------------------
  function getEl(id) { return document.getElementById(id); }

  function setupCtx(canvas) {
    var ctx = canvas.getContext("2d");
    var dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var W = canvas.width / dpr, H = canvas.height / dpr;
    ctx.fillStyle = C().canvasBg;
    ctx.fillRect(0, 0, W, H);
    return { ctx: ctx, W: W, H: H };
  }

  function txt(ctx, s, x, y, o) {
    o = o || {};
    ctx.font         = o.font  || '11px "Inter", sans-serif';
    ctx.fillStyle    = o.color || C().text;
    ctx.textAlign    = o.align || "left";
    ctx.textBaseline = o.base  || "middle";
    ctx.fillText(s, x, y);
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // ERP waveform plot
  function drawERPPlot(ctx, W, H, waveforms, opts) {
    opts = opts || {};
    var mg = opts.margins || { top: 30, bottom: 26, left: 44, right: 14 };
    var tMin = opts.tMin !== undefined ? opts.tMin : -PRE;
    var tMax = opts.tMax !== undefined ? opts.tMax : POST;
    var yMin = opts.yMin !== undefined ? opts.yMin : -2.0;
    var yMax = opts.yMax !== undefined ? opts.yMax :  2.5;
    var regs = opts.regions || [];
    var c = C();
    var plotW = W - mg.left - mg.right, plotH = H - mg.top - mg.bottom;
    function toX(t) { return mg.left + (t - tMin) / (tMax - tMin) * plotW; }
    function toY(v) { return mg.top  + (yMax - v) / (yMax - yMin) * plotH; }

    if (opts.title) txt(ctx, opts.title, W / 2, mg.top / 2,
      { font: 'bold 12px "Inter", sans-serif', align: "center" });
    if (opts.electrode) txt(ctx, "Electrode " + opts.electrode, W - mg.right - 2, mg.top / 2,
      { font: '10px "Inter", sans-serif', align: "right", color: c.textDim });

    regs.forEach(function (reg) {
      ctx.fillStyle = reg.color;
      ctx.fillRect(toX(reg.t0), mg.top, toX(reg.t1) - toX(reg.t0), plotH);
    });

    ctx.lineWidth = 0.5; ctx.strokeStyle = c.grid;
    [-2, -1, 0, 1, 2].forEach(function (yv) {
      if (yv < yMin || yv > yMax) return;
      var gy = toY(yv);
      ctx.beginPath(); ctx.moveTo(mg.left, gy); ctx.lineTo(mg.left + plotW, gy); ctx.stroke();
      txt(ctx, yv === 0 ? "0" : (yv > 0 ? "+" + yv : "" + yv), mg.left - 3, gy,
        { font: '9px "Inter", sans-serif', align: "right", color: c.textDim });
    });

    [-0.2, 0, 0.2, 0.4, 0.6, 0.8, 1.0, 1.2].forEach(function (tv) {
      if (tv < tMin || tv > tMax) return;
      var tx = toX(tv);
      ctx.beginPath(); ctx.moveTo(tx, mg.top + plotH); ctx.lineTo(tx, mg.top + plotH + 3);
      ctx.strokeStyle = c.axes; ctx.lineWidth = 0.5; ctx.stroke();
      txt(ctx, Math.round(tv * 1000) + " ms", tx, mg.top + plotH + 12,
        { font: '8px "Inter", sans-serif', align: "center", color: c.textDim, base: "top" });
    });

    ctx.beginPath();
    ctx.moveTo(mg.left, mg.top); ctx.lineTo(mg.left, mg.top + plotH);
    ctx.lineTo(mg.left + plotW, mg.top + plotH);
    ctx.strokeStyle = c.axes; ctx.lineWidth = 1; ctx.stroke();

    ctx.beginPath(); ctx.moveTo(mg.left, toY(0)); ctx.lineTo(mg.left + plotW, toY(0));
    ctx.strokeStyle = c.axes; ctx.lineWidth = 0.8; ctx.stroke();

    var stimX = toX(0);
    ctx.save(); ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(stimX, mg.top); ctx.lineTo(stimX, mg.top + plotH);
    ctx.strokeStyle = c.stimulus; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
    txt(ctx, "Stimulus", stimX + 3, mg.top + 8,
      { font: '8px "Inter", sans-serif', color: c.stimulus });

    ctx.save(); ctx.translate(10, mg.top + plotH / 2); ctx.rotate(-Math.PI / 2);
    txt(ctx, "Voltage (\u03bcV)", 0, 0,
      { font: '9px "Inter", sans-serif', align: "center", color: c.textDim });
    ctx.restore();

    regs.forEach(function (rl) {
      if (!rl.label) return;
      var midX = (toX(rl.t0) + toX(rl.t1)) / 2;
      txt(ctx, rl.label, midX, mg.top + 10,
        { font: 'bold 8.5px "Inter", sans-serif', align: "center", color: rl.labelColor || c.text });
    });

    waveforms.forEach(function (wf) {
      if (!wf.data) return;
      ctx.save(); ctx.beginPath();
      ctx.strokeStyle = wf.color; ctx.lineWidth = wf.lineWidth || 2;
      if (wf.dash) ctx.setLineDash(wf.dash);
      var first = true;
      for (var si = 0; si < N; si++) {
        var st = si / SR - PRE;
        if (st < tMin || st > tMax) continue;
        var px = toX(st), py = toY(wf.data[si]);
        if (first) { ctx.moveTo(px, py); first = false; } else ctx.lineTo(px, py);
      }
      ctx.stroke(); ctx.restore();
    });

    if (!opts.hideLegend) {
      var legX = W - mg.right - 2, legY = mg.top + 6;
      waveforms.forEach(function (lw) {
        if (!lw.label) return;
        ctx.font = '8.5px "Inter", sans-serif';
        var tw = ctx.measureText(lw.label).width;
        var lineLen = 16, lineX = legX - tw - lineLen - 4;
        ctx.save(); ctx.beginPath(); ctx.strokeStyle = lw.color; ctx.lineWidth = 2;
        if (lw.dash) ctx.setLineDash(lw.dash);
        ctx.moveTo(lineX, legY); ctx.lineTo(lineX + lineLen, legY);
        ctx.stroke(); ctx.restore();
        txt(ctx, lw.label, lineX + lineLen + 2, legY,
          { font: '8.5px "Inter", sans-serif', color: lw.color, base: "middle" });
        legY += 15;
      });
    }
  }

  // Head diagram — 10-electrode layout
  var CLF_ELECS = [
    { id: "Fp1", rx: -0.30, ry: -0.85 }, { id: "Fp2", rx:  0.30, ry: -0.85 },
    { id: "F3",  rx: -0.50, ry: -0.45 }, { id: "Fz",  rx:  0.00, ry: -0.55 },
    { id: "F4",  rx:  0.50, ry: -0.45 }, { id: "C3",  rx: -0.55, ry:  0.00 },
    { id: "Cz",  rx:  0.00, ry:  0.00 }, { id: "C4",  rx:  0.55, ry:  0.00 },
    { id: "Pz",  rx:  0.00, ry:  0.50 }, { id: "Oz",  rx:  0.00, ry:  0.90 },
  ];
  function drawHead(ctx, W, H, highlights) {
    var c = C();
    var cx = W / 2, cy = H / 2 - 8, r = Math.min(W, H) * 0.30;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 2 * Math.PI);
    ctx.strokeStyle = c.headOutline; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - 7, cy - r + 8); ctx.lineTo(cx, cy - r - 10); ctx.lineTo(cx + 7, cy - r + 8);
    ctx.strokeStyle = c.headOutline; ctx.lineWidth = 1.5; ctx.stroke();
    [-1, 1].forEach(function (s) {
      ctx.beginPath(); ctx.ellipse(cx + s * (r + 5), cy, 5, 8, 0, 0, 2 * Math.PI);
      ctx.strokeStyle = c.headOutline; ctx.lineWidth = 1.5; ctx.stroke();
    });
    CLF_ELECS.forEach(function (e) {
      var ex = cx + (e.rx || 0) * r, ey = cy + (e.ry || 0) * r;
      var hl = highlights.indexOf(e.id) >= 0, rad = hl ? 7 : 4;
      ctx.beginPath(); ctx.arc(ex, ey, rad, 0, 2 * Math.PI);
      ctx.fillStyle   = hl ? c.electrode : c.electrode + "55";
      ctx.strokeStyle = hl ? "#fff" : c.headOutline;
      ctx.lineWidth = 1; ctx.fill(); ctx.stroke();
      if (hl) {
        var la = (e.rx || 0) < 0 ? "right" : "left";
        var lo = (e.rx || 0) < 0 ? ex - rad - 3 : ex + rad + 3;
        txt(ctx, e.id, lo, ey,
          { font: 'bold 9px "Inter", sans-serif', align: la, color: c.text });
      }
    });
  }

  // ROC plot
  function drawROCPlot(ctx, W, H, pts, opts) {
    opts = opts || {};
    var c = C();
    var mg = opts.margins || { top: 28, bottom: 36, left: 36, right: 8 };
    var plotW = W - mg.left - mg.right, plotH = H - mg.top - mg.bottom;
    function toX(v) { return mg.left + v * plotW; }
    function toY(v) { return mg.top + (1 - v) * plotH; }

    if (opts.title) txt(ctx, opts.title, W / 2, mg.top / 2,
      { font: 'bold 11px "Inter", sans-serif', align: "center" });

    ctx.lineWidth = 0.5; ctx.strokeStyle = c.grid;
    [0, 0.25, 0.5, 0.75, 1].forEach(function (v) {
      ctx.beginPath(); ctx.moveTo(mg.left, toY(v)); ctx.lineTo(mg.left + plotW, toY(v)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(toX(v), mg.top); ctx.lineTo(toX(v), mg.top + plotH); ctx.stroke();
      if (v > 0 && v < 1) {
        txt(ctx, v.toFixed(2), mg.left - 3, toY(v),
          { font: '8px "Inter", sans-serif', align: "right", color: c.textDim });
        txt(ctx, v.toFixed(2), toX(v), mg.top + plotH + 8,
          { font: '8px "Inter", sans-serif', align: "center", color: c.textDim, base: "top" });
      }
    });

    ctx.beginPath(); ctx.moveTo(mg.left, mg.top); ctx.lineTo(mg.left, mg.top + plotH);
    ctx.lineTo(mg.left + plotW, mg.top + plotH);
    ctx.strokeStyle = c.axes; ctx.lineWidth = 1; ctx.stroke();

    txt(ctx, "False Positive Rate", W / 2, H - 4,
      { font: '8.5px "Inter", sans-serif', align: "center", color: c.textDim, base: "bottom" });
    ctx.save(); ctx.translate(8, mg.top + plotH / 2); ctx.rotate(-Math.PI / 2);
    txt(ctx, "True Positive Rate", 0, 0,
      { font: '8.5px "Inter", sans-serif', align: "center", color: c.textDim });
    ctx.restore();

    ctx.save(); ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(toX(0), toY(0)); ctx.lineTo(toX(1), toY(1));
    ctx.strokeStyle = c.textDim + "88"; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
    txt(ctx, "Chance", toX(0.72), toY(0.72) - 7,
      { font: '8px "Inter", sans-serif', color: c.textDim, align: "center" });

    if (!pts || pts.length < 2) return;

    ctx.beginPath(); ctx.moveTo(toX(0), toY(0));
    pts.forEach(function (p) { ctx.lineTo(toX(p.fpr), toY(p.tpr)); });
    ctx.lineTo(toX(1), toY(0)); ctx.closePath();
    ctx.fillStyle = (opts.color || c.hits) + "25"; ctx.fill();

    ctx.beginPath(); ctx.moveTo(toX(pts[0].fpr), toY(pts[0].tpr));
    pts.forEach(function (p) { ctx.lineTo(toX(p.fpr), toY(p.tpr)); });
    ctx.strokeStyle = opts.color || c.hits; ctx.lineWidth = 2; ctx.stroke();

    if (opts.auc !== undefined)
      txt(ctx, "AUC = " + opts.auc.toFixed(3), mg.left + plotW - 2, mg.top + 10,
        { font: 'bold 10px "Inter", sans-serif', align: "right", color: opts.color || c.hits });

    if (opts.curPt) {
      ctx.beginPath(); ctx.arc(toX(opts.curPt.fpr), toY(opts.curPt.tpr), 5, 0, 2 * Math.PI);
      ctx.fillStyle = c.threshold; ctx.fill();
    }
  }

  // ------------------------------------------------------------------
  // STATE
  // ------------------------------------------------------------------
  var state = { step: 0, nTrials: 30, threshold: 1.5, data: null };

  function generateData() {
    state.data = {
      hit:  makeERP(hitTemplate,  state.nTrials, 8801),
      miss: makeERP(missTemplate, state.nTrials, 8802),
    };
  }

  // Gaussian params for classifier demo (representative single-participant example)
  var MU_HIT = 2.0, MU_MISS = 0.0, SIGMA_CLF = 5.0;

  // ------------------------------------------------------------------
  // STEP 1: WHY PREDICT MEMORY?
  // ------------------------------------------------------------------
  function drawStep1Main(canvas) {
    var r = setupCtx(canvas); var ctx = r.ctx, W = r.W, H = r.H, c = C();
    txt(ctx, "Can We Predict Whether a Memory Will Form?", W / 2, 16,
      { font: 'bold 13px "Inter", sans-serif', align: "center" });

    var stages = [
      { icon: "W",    label: "Study Word",  sub: "1500 ms",      col: "#5b8fd9" },
      { icon: "~",    label: "EEG Signal",  sub: "at Pz",        col: "#a78bfa" },
      { icon: "f(x)", label: "Features",    sub: "LPC & SW",     col: "#f5a623" },
      { icon: "C",    label: "Classifier",  sub: "LDA / SVM",    col: "#4CAF50" },
      { icon: "?",    label: "Prediction",  sub: "Hit or Miss?", col: "#ff6b6b" },
    ];
    var nS = stages.length, gap = 10, startX = 12;
    var stageW = Math.floor((W - startX * 2 - gap * (nS - 1)) / nS);
    var topH = Math.floor((H - 82) * 0.52), topY = 30;

    stages.forEach(function (s, i) {
      var bx = startX + i * (stageW + gap), cx2 = bx + stageW / 2;
      var iconR = Math.min(topH * 0.30, 28), iconCy = topY + topH * 0.40;
      ctx.beginPath(); ctx.arc(cx2, iconCy, iconR, 0, 2 * Math.PI);
      ctx.fillStyle = s.col + "22"; ctx.fill(); ctx.strokeStyle = s.col; ctx.lineWidth = 2; ctx.stroke();
      txt(ctx, s.icon, cx2, iconCy,
        { font: 'bold ' + Math.max(9, Math.round(iconR * 0.85)) + 'px "Inter", sans-serif',
          align: "center", color: s.col });
      txt(ctx, s.label, cx2, topY + topH + 12,
        { font: 'bold 9px "Inter", sans-serif', align: "center", color: s.col });
      txt(ctx, s.sub, cx2, topY + topH + 24,
        { font: '7.5px "Inter", sans-serif', align: "center", color: c.textDim });
      if (i < stages.length - 1) {
        var ax = bx + stageW + 2, ay = iconCy;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax + gap - 3, ay);
        ctx.strokeStyle = c.textDim; ctx.lineWidth = 1.2; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ax + gap - 5, ay - 3); ctx.lineTo(ax + gap - 1, ay); ctx.lineTo(ax + gap - 5, ay + 3);
        ctx.fillStyle = c.textDim; ctx.fill();
      }
    });

    var resultY = topY + topH + 42, bW = Math.floor((W - 28) / 2);
    [
      { x: 10,        col: c.hits,   label: "HIT Predicted",  desc: "Brain activity suggests this word will be remembered" },
      { x: 18 + bW,  col: c.misses, label: "MISS Predicted", desc: "Brain activity suggests this word will be forgotten" },
    ].forEach(function (b) {
      roundRect(ctx, b.x, resultY, bW, H - resultY - 10, 6);
      ctx.fillStyle = b.col + "18"; ctx.fill(); ctx.strokeStyle = b.col; ctx.lineWidth = 1.5; ctx.stroke();
      txt(ctx, b.label, b.x + bW / 2, resultY + 14,
        { font: 'bold 10px "Inter", sans-serif', align: "center", color: b.col });
      var words = b.desc.split(" "), line = "", lineY = resultY + 30;
      words.forEach(function (w) {
        ctx.font = '8.5px "Inter", sans-serif';
        var test = line + (line ? " " : "") + w;
        if (ctx.measureText(test).width > bW - 12 && line) {
          txt(ctx, line, b.x + bW / 2, lineY,
            { font: '8.5px "Inter", sans-serif', align: "center", color: c.text });
          line = w; lineY += 14;
        } else line = test;
      });
      if (line) txt(ctx, line, b.x + bW / 2, lineY,
        { font: '8.5px "Inter", sans-serif', align: "center", color: c.text });
    });
  }

  function drawStep1Left(canvas) {
    var r = setupCtx(canvas); var ctx = r.ctx, W = r.W, H = r.H, c = C();
    txt(ctx, "Why Does This Matter?", W / 2, 14,
      { font: 'bold 11px "Inter", sans-serif', align: "center" });
    var apps = [
      { label: "Adaptive Learning",   col: "#5b8fd9",
        lines: ["Track which study events", "form memories; re-study", "at-risk items automatically."] },
      { label: "Clinical Assessment", col: "#a78bfa",
        lines: ["Detect memory encoding", "deficits in early-stage", "Alzheimer\u2019s or MCI."] },
      { label: "Basic Science",       col: "#4CAF50",
        lines: ["Confirm SME is truly", "predictive, not just a", "post-hoc description."] },
    ];
    var rH = Math.floor((H - 28) / 3);
    apps.forEach(function (a, i) {
      var ry = 22 + i * rH;
      roundRect(ctx, 5, ry, W - 10, rH - 5, 4);
      ctx.fillStyle = a.col + "18"; ctx.fill(); ctx.strokeStyle = a.col; ctx.lineWidth = 1; ctx.stroke();
      txt(ctx, a.label, 11, ry + 13,
        { font: 'bold 9.5px "Inter", sans-serif', color: a.col });
      a.lines.forEach(function (l, li) {
        txt(ctx, l, 11, ry + 26 + li * 13,
          { font: '8.5px "Inter", sans-serif', color: c.text });
      });
    });
  }

  function drawStep1Right(canvas) {
    var r = setupCtx(canvas); var ctx = r.ctx, W = r.W, H = r.H, c = C();
    txt(ctx, "Chakravarty, Chen & Caplan (2020)", W / 2, 14,
      { font: 'bold 10px "Inter", sans-serif', align: "center", color: c.clf });
    var lines = [
      { t: "62 participants studied 225" },
      { t: "words with EEG recorded." },
      { t: "Each study trial was labeled" },
      { t: "Hit (remembered) or Miss." },
      { t: "" },
      { t: "Two classifier approaches:", bold: true },
      { t: "1. Univariate: LPC or SW" },
      { t: "   amplitude as one feature." },
      { t: "2. Multivariate: 120 features" },
      { t: "   (10 elecs \u00d7 12 time bins)." },
      { t: "" },
      { t: "Evaluation:", bold: true },
      { t: "10-fold cross-validation" },
      { t: "ROC curves + AUC" },
      { t: "(0.5 = chance, 1.0 = perfect)" },
      { t: "" },
      { t: "Key result:", bold: true },
      { t: "AUC \u2248 0.53 \u2014 small but" },
      { t: "significant above chance." },
    ];
    var ly = 30;
    lines.forEach(function (l) {
      if (!l.t) { ly += 4; return; }
      txt(ctx, l.t, 10, ly,
        { font: (l.bold ? "bold " : "") + '9px "Inter", sans-serif', color: c.text });
      ly += 13;
    });
  }

  // ------------------------------------------------------------------
  // STEP 2: THE SME SIGNAL
  // ------------------------------------------------------------------
  function drawStep2Main(canvas) {
    var r = setupCtx(canvas); var ctx = r.ctx, W = r.W, H = r.H;
    if (!state.data) return;
    var c = C();
    drawERPPlot(ctx, W, H, [
      { data: state.data.hit,  color: c.hits,   label: "Later Remembered (Hits)",  lineWidth: 2.2 },
      { data: state.data.miss, color: c.misses, label: "Later Forgotten (Misses)", lineWidth: 2.2, dash: [6, 3] },
    ], {
      title: "Study-Phase ERPs: SME at Electrode Pz", electrode: "Pz", yMin: -2, yMax: 2.5,
      regions: [
        { t0: 0.40, t1: 0.70, color: c.regionLPC, label: "LPC",       labelColor: "#5b8fd9" },
        { t0: 0.70, t1: 1.20, color: c.regionSW,  label: "Slow Wave", labelColor: "#4CAF50" },
      ],
    });
  }

  function drawStep2Left(canvas) {
    var r = setupCtx(canvas); var ctx = r.ctx, W = r.W, H = r.H, c = C();
    txt(ctx, "Electrode Pz", W / 2, 14,
      { font: 'bold 11px "Inter", sans-serif', align: "center" });
    drawHead(ctx, W, H - 22, ["Pz"]);
    txt(ctx, "Parietal midline \u2014 key SME electrode", W / 2, H - 8,
      { font: '8.5px "Inter", sans-serif', align: "center", color: c.textDim });
  }

  function drawStep2Right(canvas) {
    var r = setupCtx(canvas); var ctx = r.ctx, W = r.W, H = r.H, c = C();
    txt(ctx, "Two Classifier Features", W / 2, 14,
      { font: 'bold 11px "Inter", sans-serif', align: "center" });
    var feats = [
      { abbr: "LPC", name: "Late Positive Component", time: "400\u2013700 ms", col: "#5b8fd9",
        lines: ["Larger for hits (remembered).", "Reflects elaborative encoding", "and familiarity strength."] },
      { abbr: "SW",  name: "Slow Wave",               time: "700\u20131200 ms", col: "#4CAF50",
        lines: ["Sustained positivity for hits.", "Reflects context integration", "and deeper semantic encoding."] },
    ];
    var fh = Math.floor((H - 28) / 2);
    feats.forEach(function (f, i) {
      var fy = 22 + i * fh;
      roundRect(ctx, 5, fy, W - 10, fh - 5, 5);
      ctx.fillStyle = f.col + "18"; ctx.fill(); ctx.strokeStyle = f.col; ctx.lineWidth = 1; ctx.stroke();
      txt(ctx, f.abbr, 11, fy + 14,   { font: 'bold 14px "Inter", sans-serif', color: f.col });
      txt(ctx, f.name, 11, fy + 28,   { font: 'bold 8.5px "Inter", sans-serif', color: f.col });
      txt(ctx, f.time + " \u00b7 Pz", 11, fy + 40, { font: '8px "Inter", sans-serif', color: c.textDim });
      f.lines.forEach(function (l, li) {
        txt(ctx, l, 11, fy + 53 + li * 13,
          { font: '8.5px "Inter", sans-serif', color: c.text });
      });
    });
  }

  // ------------------------------------------------------------------
  // STEP 3: SINGLE TRIALS — THE CHALLENGE
  // ------------------------------------------------------------------
  function drawStep3Main(canvas) {
    var r = setupCtx(canvas); var ctx = r.ctx, W = r.W, H = r.H;
    if (!state.data) return;
    var c = C();
    drawERPPlot(ctx, W, H, [
      { data: state.data.hit,  color: c.hits,   label: "Hits ("   + state.nTrials + " trials avg)", lineWidth: 2.2 },
      { data: state.data.miss, color: c.misses, label: "Misses (" + state.nTrials + " trials avg)", lineWidth: 2.2, dash: [6, 3] },
    ], {
      title: "Effect of Averaging on Signal Clarity", electrode: "Pz", yMin: -2, yMax: 2.5,
      regions: [
        { t0: 0.40, t1: 0.70, color: c.regionLPC, label: "LPC", labelColor: "#5b8fd9" },
      ],
    });
  }

  function drawStep3Left(canvas) {
    var r = setupCtx(canvas); var ctx = r.ctx, W = r.W, H = r.H, c = C();
    txt(ctx, "LPC Amplitude: Single Trials", W / 2, 14,
      { font: 'bold 10.5px "Inter", sans-serif', align: "center" });
    // Analytic Gaussian histograms: realistic single-trial distributions
    var muH = 1.5, muM = 0.0, sigma = 5.5;
    var mg = { top: 24, bottom: 28, left: 28, right: 8 };
    var plotW = W - mg.left - mg.right, plotH = H - mg.top - mg.bottom;
    var xMin = -14, xMax = 16, nBins = 22;
    var binW = (xMax - xMin) / nBins;
    function pBin(mu, a, b) {
      return normCDF((b - mu) / sigma) - normCDF((a - mu) / sigma);
    }
    var maxP = 0;
    for (var bi = 0; bi < nBins; bi++) {
      var a = xMin + bi * binW, b = a + binW;
      maxP = Math.max(maxP, pBin(muH, a, b), pBin(muM, a, b));
    }
    function toX(v) { return mg.left + (v - xMin) / (xMax - xMin) * plotW; }
    function toY(p) { return mg.top + (1 - p / maxP) * plotH; }

    for (var bj = 0; bj < nBins; bj++) {
      var ba = xMin + bj * binW, bb = ba + binW;
      var bxPx = toX(ba), bwPx = toX(bb) - toX(ba) - 1;
      var pH = pBin(muH, ba, bb);
      ctx.fillStyle = c.hits + "55";
      ctx.fillRect(bxPx, toY(pH), bwPx, plotH - (toY(pH) - mg.top));
      ctx.strokeStyle = c.hits; ctx.lineWidth = 0.5;
      ctx.strokeRect(bxPx, toY(pH), bwPx, plotH - (toY(pH) - mg.top));
      var pM = pBin(muM, ba, bb);
      ctx.fillStyle = c.misses + "45";
      ctx.fillRect(bxPx, toY(pM), bwPx, plotH - (toY(pM) - mg.top));
      ctx.strokeStyle = c.misses; ctx.lineWidth = 0.5;
      ctx.strokeRect(bxPx, toY(pM), bwPx, plotH - (toY(pM) - mg.top));
    }

    ctx.beginPath(); ctx.moveTo(mg.left, mg.top); ctx.lineTo(mg.left, mg.top + plotH);
    ctx.lineTo(mg.left + plotW, mg.top + plotH); ctx.strokeStyle = c.axes; ctx.lineWidth = 1; ctx.stroke();
    [-10, -5, 0, 5, 10, 15].forEach(function (v) {
      if (v < xMin || v > xMax) return;
      var xx = toX(v);
      ctx.beginPath(); ctx.moveTo(xx, mg.top + plotH); ctx.lineTo(xx, mg.top + plotH + 3);
      ctx.strokeStyle = c.axes; ctx.lineWidth = 0.5; ctx.stroke();
      txt(ctx, v, xx, mg.top + plotH + 10,
        { font: '8px "Inter", sans-serif', align: "center", color: c.textDim, base: "top" });
    });
    txt(ctx, "LPC Amplitude (\u03bcV)", W / 2, H - 3,
      { font: '8px "Inter", sans-serif', align: "center", color: c.textDim, base: "bottom" });
    ctx.fillStyle = c.hits + "55";   ctx.fillRect(mg.left,      mg.top + 2, 10, 8);
    txt(ctx, "Hits",   mg.left + 13, mg.top + 6, { font: '8px "Inter", sans-serif', color: c.hits });
    ctx.fillStyle = c.misses + "45"; ctx.fillRect(mg.left + 40, mg.top + 2, 10, 8);
    txt(ctx, "Misses", mg.left + 53, mg.top + 6, { font: '8px "Inter", sans-serif', color: c.misses });
  }

  function drawStep3Right(canvas) {
    var r = setupCtx(canvas); var ctx = r.ctx, W = r.W, H = r.H, c = C();
    txt(ctx, "The Challenge", W / 2, 14,
      { font: 'bold 11px "Inter", sans-serif', align: "center" });
    var lines = [
      { t: "Trial averages (ERPs) reveal" },
      { t: "the SME. But classifiers must" },
      { t: "work on individual trials \u2014" },
      { t: "no averaging allowed." },
      { t: "" },
      { t: "Problem:", bold: true },
      { t: "Single-trial EEG amplitudes" },
      { t: "for hits and misses overlap" },
      { t: "massively (\u03c3 \u2248 5\u20136 \u03bcV," },
      { t: "\u0394\u03bc \u2248 1 \u03bcV). See histogram." },
      { t: "" },
      { t: "Use the slider below:", bold: true },
      { t: "Drag to average more trials." },
      { t: "N=1: indistinguishable" },
      { t: "N=30: SME starts to emerge" },
      { t: "N=200: clear LPC & SW" },
      { t: "" },
      { t: "Classifiers face the N=1" },
      { t: "challenge on every trial!" },
    ];
    var ly = 30;
    lines.forEach(function (l) {
      if (!l.t) { ly += 4; return; }
      txt(ctx, l.t, 10, ly,
        { font: (l.bold ? "bold " : "") + '9px "Inter", sans-serif', color: c.text });
      ly += 13;
    });
  }

  // ------------------------------------------------------------------
  // STEP 4: THE CLASSIFIER
  // ------------------------------------------------------------------
  function drawStep4Main(canvas) {
    var r = setupCtx(canvas); var ctx = r.ctx, W = r.W, H = r.H, c = C();
    var thr = state.threshold;
    var mg = { top: 32, bottom: 32, left: 16, right: 16 };
    var plotW = W - mg.left - mg.right, plotH = H - mg.top - mg.bottom;
    var xMin = -14, xMax = 16, nPts = 200;
    var baseY = mg.top + plotH;
    var maxPdf = 1 / (SIGMA_CLF * Math.sqrt(2 * Math.PI));
    function toX(v) { return mg.left + (v - xMin) / (xMax - xMin) * plotW; }
    function toY(p) { return mg.top + (1 - p) * plotH; }
    function pdfAt(x, mu) {
      return (1 / (SIGMA_CLF * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * Math.pow((x - mu) / SIGMA_CLF, 2));
    }

    txt(ctx, "Threshold Classifier: Overlapping LPC Amplitude Distributions", W / 2, mg.top / 2,
      { font: 'bold 11px "Inter", sans-serif', align: "center" });

    ctx.lineWidth = 0.4; ctx.strokeStyle = c.grid;
    [0.25, 0.5, 0.75, 1].forEach(function (p) {
      var gy = toY(p);
      ctx.beginPath(); ctx.moveTo(mg.left, gy); ctx.lineTo(mg.left + plotW, gy); ctx.stroke();
    });

    // Fill TP (hits above threshold) and FP (misses above threshold)
    [
      { mu: MU_HIT,  color: c.hits   + "35" },
      { mu: MU_MISS, color: c.misses + "30" },
    ].forEach(function (d) {
      if (thr >= xMax) return;
      ctx.beginPath(); ctx.moveTo(toX(Math.max(thr, xMin)), baseY);
      for (var pi = 0; pi <= nPts; pi++) {
        var xv = Math.max(thr, xMin) + (xMax - Math.max(thr, xMin)) * pi / nPts;
        ctx.lineTo(toX(xv), toY(pdfAt(xv, d.mu) / maxPdf));
      }
      ctx.lineTo(toX(xMax), baseY); ctx.closePath();
      ctx.fillStyle = d.color; ctx.fill();
    });

    // Draw Gaussians
    [{ mu: MU_HIT, col: c.hits }, { mu: MU_MISS, col: c.misses, dash: [6, 3] }].forEach(function (d) {
      ctx.save(); ctx.beginPath(); if (d.dash) ctx.setLineDash(d.dash);
      var first = true;
      for (var k = 0; k <= nPts; k++) {
        var xk = xMin + (xMax - xMin) * k / nPts;
        var px = toX(xk), py = toY(pdfAt(xk, d.mu) / maxPdf);
        if (first) { ctx.moveTo(px, py); first = false; } else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = d.col; ctx.lineWidth = 2.5; ctx.stroke(); ctx.restore();
    });

    // Threshold line
    var tx = toX(thr);
    ctx.save(); ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(tx, mg.top); ctx.lineTo(tx, baseY);
    ctx.strokeStyle = c.threshold; ctx.lineWidth = 2.5; ctx.stroke(); ctx.restore();
    txt(ctx, "\u03b8 = " + thr.toFixed(1) + " \u03bcV", tx + 4, mg.top + 10,
      { font: 'bold 9px "Inter", sans-serif', color: c.threshold });

    ctx.beginPath(); ctx.moveTo(mg.left, baseY); ctx.lineTo(mg.left + plotW, baseY);
    ctx.strokeStyle = c.axes; ctx.lineWidth = 1; ctx.stroke();
    [-10, -5, 0, 5, 10, 15].forEach(function (v) {
      if (v < xMin || v > xMax) return;
      var xx = toX(v);
      ctx.beginPath(); ctx.moveTo(xx, baseY); ctx.lineTo(xx, baseY + 3);
      ctx.strokeStyle = c.axes; ctx.lineWidth = 0.5; ctx.stroke();
      txt(ctx, v, xx, baseY + 12,
        { font: '8px "Inter", sans-serif', align: "center", color: c.textDim, base: "top" });
    });
    txt(ctx, "LPC Amplitude (\u03bcV)", W / 2, H - 3,
      { font: '8.5px "Inter", sans-serif', align: "center", color: c.textDim, base: "bottom" });

    var tpr = 1 - normCDF((thr - MU_HIT) / SIGMA_CLF);
    var fpr = 1 - normCDF((thr - MU_MISS) / SIGMA_CLF);
    txt(ctx, "Hits (later remembered)",  mg.left + 6, mg.top + 8,  { font: '8px "Inter", sans-serif', color: c.hits });
    txt(ctx, "Misses (later forgotten)", mg.left + 6, mg.top + 22, { font: '8px "Inter", sans-serif', color: c.misses });
    txt(ctx, "TPR = " + (tpr * 100).toFixed(1) + "%  |  FPR = " + (fpr * 100).toFixed(1) + "%",
      W / 2, baseY - 8,
      { font: 'bold 9px "Inter", sans-serif', align: "center", color: c.text });
  }

  function drawStep4Left(canvas) {
    var r = setupCtx(canvas); var ctx = r.ctx, W = r.W, H = r.H, c = C();
    var thr = state.threshold;
    var tpr = 1 - normCDF((thr - MU_HIT) / SIGMA_CLF);
    var fpr = 1 - normCDF((thr - MU_MISS) / SIGMA_CLF);
    var pts = gaussROC(MU_HIT, MU_MISS, SIGMA_CLF, 200);
    var auc = aucFromROC(pts);
    drawROCPlot(ctx, W, H, pts, {
      title: "ROC Curve",
      auc: auc,
      curPt: { tpr: tpr, fpr: fpr },
      color: c.hits,
      margins: { top: 28, bottom: 36, left: 36, right: 8 },
    });
  }

  function drawStep4Right(canvas) {
    var r = setupCtx(canvas); var ctx = r.ctx, W = r.W, H = r.H, c = C();
    txt(ctx, "How the Classifier Works", W / 2, 14,
      { font: 'bold 11px "Inter", sans-serif', align: "center" });
    var thr = state.threshold;
    var tpr = 1 - normCDF((thr - MU_HIT) / SIGMA_CLF);
    var fpr = 1 - normCDF((thr - MU_MISS) / SIGMA_CLF);
    var lines = [
      { t: "Rule: predict \u201cHit\u201d if" },
      { t: "LPC amplitude \u2265 \u03b8," },
      { t: "else predict \u201cMiss.\u201d" },
      { t: "" },
      { t: "At \u03b8 = " + thr.toFixed(1) + " \u03bcV:", bold: true },
      { t: "Hit rate (TPR): " + (tpr * 100).toFixed(1) + "%", col: c.hits },
      { t: "False alarm (FPR): " + (fpr * 100).toFixed(1) + "%", col: c.misses },
      { t: "" },
      { t: "Moving threshold:", bold: true },
      { t: "\u2191 \u03b8: fewer false alarms," },
      { t: "    miss more true hits" },
      { t: "\u2193 \u03b8: catch more true hits," },
      { t: "    more false alarms" },
      { t: "" },
      { t: "ROC curve (left):", bold: true },
      { t: "Each point = one threshold." },
      { t: "Gold dot = current \u03b8." },
      { t: "AUC = area under curve" },
      { t: "(0.5 = chance, 1.0 = perfect)" },
      { t: "" },
      { t: "Use the slider to explore!" },
    ];
    var ly = 30;
    lines.forEach(function (l) {
      if (!l.t) { ly += 4; return; }
      txt(ctx, l.t, 10, ly,
        { font: (l.bold ? "bold " : "") + '9px "Inter", sans-serif', color: l.col || c.text });
      ly += 13;
    });
  }

  // ------------------------------------------------------------------
  // STEP 5: ROC & AUC
  // ------------------------------------------------------------------
  function drawStep5Main(canvas) {
    var r = setupCtx(canvas); var ctx = r.ctx, W = r.W, H = r.H, c = C();
    var mg = { top: 32, bottom: 38, left: 46, right: 12 };
    var plotW = W - mg.left - mg.right, plotH = H - mg.top - mg.bottom;
    function toX(v) { return mg.left + v * plotW; }
    function toY(v) { return mg.top + (1 - v) * plotH; }

    // Univariate ROC (LPC, d'≈0.40)
    var pts1 = gaussROC(MU_HIT, MU_MISS, SIGMA_CLF, 200);
    var auc1 = aucFromROC(pts1);
    // Multivariate ROC (tighter σ, d'≈0.67) — simulated improvement with 120 features
    var pts2 = gaussROC(2.0, 0.0, 3.5, 200);
    var auc2 = aucFromROC(pts2);

    txt(ctx, "ROC Curves: Univariate vs. Multivariate Classifier", W / 2, mg.top / 2,
      { font: 'bold 11px "Inter", sans-serif', align: "center" });

    ctx.lineWidth = 0.5; ctx.strokeStyle = c.grid;
    [0, 0.25, 0.5, 0.75, 1].forEach(function (v) {
      ctx.beginPath(); ctx.moveTo(mg.left, toY(v)); ctx.lineTo(mg.left + plotW, toY(v)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(toX(v), mg.top); ctx.lineTo(toX(v), mg.top + plotH); ctx.stroke();
      if (v > 0 && v < 1) {
        txt(ctx, v.toFixed(2), mg.left - 3, toY(v),
          { font: '8px "Inter", sans-serif', align: "right", color: c.textDim });
        txt(ctx, v.toFixed(2), toX(v), mg.top + plotH + 8,
          { font: '8px "Inter", sans-serif', align: "center", color: c.textDim, base: "top" });
      }
    });

    ctx.beginPath(); ctx.moveTo(mg.left, mg.top); ctx.lineTo(mg.left, mg.top + plotH);
    ctx.lineTo(mg.left + plotW, mg.top + plotH); ctx.strokeStyle = c.axes; ctx.lineWidth = 1; ctx.stroke();
    txt(ctx, "False Positive Rate", W / 2, H - 4,
      { font: '8.5px "Inter", sans-serif', align: "center", color: c.textDim, base: "bottom" });
    ctx.save(); ctx.translate(10, mg.top + plotH / 2); ctx.rotate(-Math.PI / 2);
    txt(ctx, "True Positive Rate", 0, 0,
      { font: '8.5px "Inter", sans-serif', align: "center", color: c.textDim }); ctx.restore();

    ctx.save(); ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(toX(0), toY(0)); ctx.lineTo(toX(1), toY(1));
    ctx.strokeStyle = c.textDim + "88"; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();

    // Draw both ROC curves with fills
    [[pts1, c.auc1, auc1, "LPC only"], [pts2, c.auc2, auc2, "Multivariate"]].forEach(function (item, ii) {
      var pts = item[0], col = item[1], auc = item[2], lbl = item[3];
      ctx.beginPath(); ctx.moveTo(toX(0), toY(0));
      pts.forEach(function (p) { ctx.lineTo(toX(p.fpr), toY(p.tpr)); });
      ctx.lineTo(toX(1), toY(0)); ctx.closePath();
      ctx.fillStyle = col + "20"; ctx.fill();
      ctx.beginPath(); ctx.moveTo(toX(pts[0].fpr), toY(pts[0].tpr));
      pts.forEach(function (p) { ctx.lineTo(toX(p.fpr), toY(p.tpr)); });
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
      txt(ctx, lbl + ": AUC = " + auc.toFixed(3), mg.left + plotW - 2, mg.top + 10 + ii * 16,
        { font: 'bold 9.5px "Inter", sans-serif', align: "right", color: col });
    });
  }

  function drawStep5Left(canvas) {
    var r = setupCtx(canvas); var ctx = r.ctx, W = r.W, H = r.H, c = C();
    txt(ctx, "AUC Values from Paper", W / 2, 14,
      { font: 'bold 10.5px "Inter", sans-serif', align: "center" });

    // Actual mean AUC values from Chakravarty et al. (2020)
    var bars = [
      { label: "Chance", auc: 0.500, col: c.textDim },
      { label: "LPC",    auc: 0.530, col: c.auc1 },
      { label: "SW",     auc: 0.530, col: "#4CAF50" },
      { label: "LDA",    auc: 0.530, col: "#a78bfa" },
      { label: "SVM",    auc: 0.530, col: c.auc2 },
    ];
    var mg = { top: 24, bottom: 42, left: 32, right: 8 };
    var plotW = W - mg.left - mg.right, plotH = H - mg.top - mg.bottom;
    var bW = plotW / bars.length - 4, aucMin = 0.45, aucMax = 0.60;
    function toY(v) { return mg.top + (1 - (v - aucMin) / (aucMax - aucMin)) * plotH; }

    ctx.lineWidth = 0.5; ctx.strokeStyle = c.grid;
    [0.45, 0.50, 0.55, 0.60].forEach(function (v) {
      var gy = toY(v);
      ctx.beginPath(); ctx.moveTo(mg.left, gy); ctx.lineTo(mg.left + plotW, gy); ctx.stroke();
      txt(ctx, v.toFixed(2), mg.left - 3, gy,
        { font: '8px "Inter", sans-serif', align: "right", color: c.textDim });
    });
    ctx.save(); ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(mg.left, toY(0.5)); ctx.lineTo(mg.left + plotW, toY(0.5));
    ctx.strokeStyle = c.textDim + "99"; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();

    bars.forEach(function (b, i) {
      var bx = mg.left + i * (bW + 4), by = toY(b.auc), bh = mg.top + plotH - by;
      ctx.fillStyle = b.col + "80"; ctx.fillRect(bx, by, bW, bh);
      ctx.strokeStyle = b.col; ctx.lineWidth = 1; ctx.strokeRect(bx, by, bW, bh);
      txt(ctx, b.label, bx + bW / 2, mg.top + plotH + 10,
        { font: '8px "Inter", sans-serif', align: "center", color: c.textDim, base: "top" });
    });
    ctx.beginPath(); ctx.moveTo(mg.left, mg.top); ctx.lineTo(mg.left, mg.top + plotH);
    ctx.lineTo(mg.left + plotW, mg.top + plotH); ctx.strokeStyle = c.axes; ctx.lineWidth = 1; ctx.stroke();
    txt(ctx, "Mean AUC across 62 participants", W / 2, H - 2,
      { font: '7.5px "Inter", sans-serif', align: "center", color: c.textDim, base: "bottom" });
    txt(ctx, "Chakravarty et al. (2020)", W / 2, H - 12,
      { font: '7px "Inter", sans-serif', align: "center", color: c.textDim, base: "bottom" });
  }

  function drawStep5Right(canvas) {
    var r = setupCtx(canvas); var ctx = r.ctx, W = r.W, H = r.H, c = C();
    txt(ctx, "Interpreting AUC", W / 2, 14,
      { font: 'bold 11px "Inter", sans-serif', align: "center" });
    var lines = [
      { t: "AUC = Area Under ROC Curve" },
      { t: "Summarizes classifier quality:" },
      { t: "" },
      { t: "0.5 = chance (diagonal)", col: c.textDim },
      { t: "1.0 = perfect prediction", col: c.auc2 },
      { t: "" },
      { t: "Paper results:", bold: true },
      { t: "All methods avg AUC \u2248 0.53." },
      { t: "Significant, but small." },
      { t: "" },
      { t: "Why so small?", bold: true },
      { t: "Memory is multifactorial:" },
      { t: "\u2022 Inter-item interference" },
      { t: "\u2022 Serial position effects" },
      { t: "\u2022 Retrieval context match" },
      { t: "\u2022 Attention & strategy" },
      { t: "" },
      { t: "EEG at study captures only" },
      { t: "some of these factors." },
      { t: "" },
      { t: "Note: demo ROC curves show", col: c.textDim },
      { t: "a single-participant example.", col: c.textDim },
      { t: "Paper reports group averages.", col: c.textDim },
    ];
    var ly = 30;
    lines.forEach(function (l) {
      if (!l.t) { ly += 4; return; }
      txt(ctx, l.t, 10, ly,
        { font: (l.bold ? "bold " : "") + '9px "Inter", sans-serif', color: l.col || c.text });
      ly += 13;
    });
  }

  // ------------------------------------------------------------------
  // STEP 6: MULTIVARIATE CLASSIFICATION
  // ------------------------------------------------------------------
  function drawStep6Main(canvas) {
    var r = setupCtx(canvas); var ctx = r.ctx, W = r.W, H = r.H, c = C();
    txt(ctx, "LDA Feature Weights: 10 Electrodes \u00d7 12 Time Bins = 120 Features",
      W / 2, 14, { font: 'bold 11px "Inter", sans-serif', align: "center" });

    var nE = 10, nT = 12;
    var elecLabels = ["Fp1","Fp2","F3","Fz","F4","C3","Cz","C4","Pz","Oz"];
    var binLabels  = ["0","100","200","300","400","500","600","700","800","900","1000","1100"];
    var mg = { top: 26, bottom: 34, left: 34, right: 20 };
    var plotW = W - mg.left - mg.right, plotH = H - mg.top - mg.bottom;
    var cW = plotW / nT, cH = plotH / nE;

    // Simulate LDA feature weights calibrated to paper's topographic findings
    var rng = rng32(42);
    var weights = [];
    for (var ei = 0; ei < nE; ei++) {
      var row = [];
      for (var ti = 0; ti < nT; ti++) {
        var w = randn(rng) * 0.12;
        // Pz (index 8): LPC window (bins 4–6 = 400–700ms)
        if (ei === 8 && ti >= 4 && ti <= 6)  w += 0.55 + randn(rng) * 0.08;
        // Pz: slow wave (bins 7–11 = 700–1200ms)
        if (ei === 8 && ti >= 7 && ti <= 11) w += 0.30 + randn(rng) * 0.08;
        // Central (Cz, C3, C4)
        if ((ei === 5 || ei === 6 || ei === 7) && ti >= 4 && ti <= 8) w += 0.15 + randn(rng) * 0.06;
        // Fz: modest frontal contribution
        if (ei === 3 && ti >= 3 && ti <= 7)  w += 0.12 + randn(rng) * 0.06;
        row.push(w);
      }
      weights.push(row);
    }
    var maxW = 0;
    weights.forEach(function (row) { row.forEach(function (w) { maxW = Math.max(maxW, Math.abs(w)); }); });

    for (var ej = 0; ej < nE; ej++) {
      for (var tj = 0; tj < nT; tj++) {
        var norm = weights[ej][tj] / maxW;
        var alpha = 0.12 + Math.min(Math.abs(norm), 1) * 0.75;
        ctx.fillStyle = norm > 0
          ? "rgba(91,143,217," + alpha + ")"
          : "rgba(255,107,107," + alpha + ")";
        ctx.fillRect(mg.left + tj * cW, mg.top + ej * cH, cW - 1, cH - 1);
      }
      txt(ctx, elecLabels[ej], mg.left - 3, mg.top + ej * cH + cH / 2,
        { font: '8px "Inter", sans-serif', align: "right", color: c.textDim });
    }
    for (var tl = 0; tl < nT; tl += 2) {
      txt(ctx, binLabels[tl], mg.left + tl * cW + cW / 2, mg.top + plotH + 10,
        { font: '8px "Inter", sans-serif', align: "center", color: c.textDim, base: "top" });
    }
    txt(ctx, "Time post-stimulus (ms)", W / 2, H - 3,
      { font: '8.5px "Inter", sans-serif', align: "center", color: c.textDim, base: "bottom" });

    // Color scale legend
    var scX = W - mg.right + 3, scY = mg.top, scH = plotH, scW = 8;
    for (var si = 0; si <= scH; si++) {
      var sv = si / scH;
      var al = 0.12 + Math.abs(sv - 0.5) * 2 * 0.75;
      ctx.fillStyle = sv < 0.5
        ? "rgba(91,143,217," + al + ")"
        : "rgba(255,107,107," + al + ")";
      ctx.fillRect(scX, scY + si, scW, 1);
    }
    txt(ctx, "+", scX + scW / 2, scY - 5,
      { font: '8px "Inter", sans-serif', align: "center", color: "#5b8fd9" });
    txt(ctx, "\u2212", scX + scW / 2, scY + scH + 5,
      { font: '8px "Inter", sans-serif', align: "center", color: "#ff6b6b" });
  }

  function drawStep6Left(canvas) {
    var r = setupCtx(canvas); var ctx = r.ctx, W = r.W, H = r.H, c = C();
    txt(ctx, "10 Electrodes Selected", W / 2, 14,
      { font: 'bold 11px "Inter", sans-serif', align: "center" });
    drawHead(ctx, W, H - 32, ["Pz", "Fz", "Cz"]);
    txt(ctx, "Each \u00d7 12 time bins (0\u20131200 ms)", W / 2, H - 18,
      { font: '8px "Inter", sans-serif', align: "center", color: c.textDim });
    txt(ctx, "= 120 features per trial", W / 2, H - 6,
      { font: '8px "Inter", sans-serif', align: "center", color: c.textDim });
  }

  function drawStep6Right(canvas) {
    var r = setupCtx(canvas); var ctx = r.ctx, W = r.W, H = r.H, c = C();
    txt(ctx, "Multivariate Classification", W / 2, 14,
      { font: 'bold 11px "Inter", sans-serif', align: "center" });
    var lines = [
      { t: "LDA combines 120 features" },
      { t: "into one weighted score:" },
      { t: "score = \u03a3 w\u1d62 \u00d7 feature\u1d62" },
      { t: "" },
      { t: "Heatmap (left):", bold: true },
      { t: "Blue = positive (hit-predicting)" },
      { t: "Red = negative (miss-predicting)" },
      { t: "Strongest: Pz at 400\u2013700 ms" },
      { t: "(consistent with the LPC)." },
      { t: "" },
      { t: "Cross-validation:", bold: true },
      { t: "Trials split into 10 folds." },
      { t: "Train on 9, test on 1." },
      { t: "Repeat 10\u00d7 \u2014 prevents" },
      { t: "overfitting to training data." },
      { t: "" },
      { t: "Paper results:", bold: true },
      { t: "LDA avg AUC = 0.53", col: "#a78bfa" },
      { t: "SVM avg AUC = 0.53", col: c.auc2 },
      { t: "Both sign. above chance" },
      { t: "across 62 participants." },
    ];
    var ly = 30;
    lines.forEach(function (l) {
      if (!l.t) { ly += 4; return; }
      txt(ctx, l.t, 10, ly,
        { font: (l.bold ? "bold " : "") + '9px "Inter", sans-serif', color: l.col || c.text });
      ly += 13;
    });
  }

  // ------------------------------------------------------------------
  // STEP INFO TEXT
  // ------------------------------------------------------------------
  var STEP_INFO = [
    "",
    "<strong>Why Predict Memory?</strong> The subsequent memory effect (SME) identifies brain activity <em>associated</em> with later memory success. But does this make it truly <em>predictive</em>? Chakravarty, Chen &amp; Caplan (2020) applied machine learning classifiers to study-phase EEG to ask: can we predict, trial by trial, which words a participant will remember? This has major implications: adaptive learning systems that detect at-risk memories for re-study, clinical tools for diagnosing encoding deficits in Alzheimer&rsquo;s and MCI, and basic science tests of whether the SME reflects a genuine causal mechanism.",
    "<strong>The SME Signal.</strong> When study-phase ERPs are averaged over many trials and sorted by memory outcome, two features emerge at electrode Pz: the <em>Late Positive Component</em> (LPC, 400&ndash;700 ms) &mdash; larger for later-remembered items &mdash; and the <em>Slow Wave</em> (SW, 700&ndash;1200 ms) &mdash; a sustained positivity also larger for hits. These two time-window amplitudes serve as the univariate features that a simple threshold classifier uses to predict memory trial by trial.",
    "<strong>The Challenge: Single-Trial Noise.</strong> Trial-averaged ERPs can reveal clear hits&ndash;misses differences, but classifiers must work on individual trials. Single-trial EEG is dominated by neural noise unrelated to the target process. The LPC amplitude distributions for hits and misses overlap massively (&sigma; &approx; 5&ndash;6 &mu;V, &Delta;&mu; &approx; 1 &mu;V &mdash; see the histogram). Use the slider to explore how averaging improves signal-to-noise: with 1 trial the waveforms are indistinguishable; with 200 the SME is clear. Classifiers face the single-trial challenge.",
    "<strong>How Classification Works.</strong> A threshold classifier predicts &ldquo;Hit&rdquo; if the LPC amplitude exceeds threshold &theta;, otherwise &ldquo;Miss.&rdquo; Because hit and miss amplitude distributions overlap, varying &theta; creates a trade-off between True Positive Rate (TPR, fraction of hits correctly predicted) and False Positive Rate (FPR, fraction of misses incorrectly predicted). The ROC curve traces all (FPR, TPR) pairs as &theta; sweeps across all values. Use the slider to explore this trade-off and watch the gold dot move along the ROC curve.",
    "<strong>ROC Curves &amp; AUC.</strong> The Area Under the Curve (AUC) summarizes overall classifier quality: 0.5 = chance, 1.0 = perfect. Chakravarty et al. (2020) found mean AUC &approx; 0.53 for both LPC and SW &mdash; small but statistically significant across 62 participants. The bar chart shows actual paper values. The ROC curves in the main panel illustrate the concept of univariate vs. multivariate improvement for an individual participant example; group-level effects are modest but consistent.",
    "<strong>Multivariate Classification.</strong> Instead of one feature, LDA and SVM classifiers combine 120 features: mean voltage at 10 electrodes across 12 time bins (0&ndash;1200 ms). The heatmap shows simulated LDA feature weights calibrated to the paper&rsquo;s topographic findings: the largest positive weights (blue) appear at Pz in the LPC window (400&ndash;700 ms), consistent with the univariate SME. Cross-validation ensures generalizability by testing predictions on held-out data. LDA and SVM both achieved mean AUC &approx; 0.53 &mdash; modest but significant &mdash; with multivariate features providing a broader picture of memory-relevant neural activity.",
  ];

  // ------------------------------------------------------------------
  // CANVAS SIZING & RENDER
  // ------------------------------------------------------------------
  function getInnerW(el) {
    var s = window.getComputedStyle(el);
    return Math.max(0, el.clientWidth
      - (parseFloat(s.paddingLeft)  || 0)
      - (parseFloat(s.paddingRight) || 0));
  }

  function resizeCanvases() {
    var container = getEl("clf-container");
    if (!container) return;
    var cW  = getInnerW(container);
    var dpr = window.devicePixelRatio || 1;

    var main = getEl("clf-canvas-main");
    if (main) {
      var dW = Math.max(0, cW - 10);
      main.style.width  = dW + "px";
      main.style.height = "240px";
      main.width  = dW * dpr;
      main.height = 240 * dpr;
    }
    var left = getEl("clf-canvas-left"), right = getEl("clf-canvas-right");
    if (left && right) {
      var avail = Math.max(0, cW - 10 - 14);
      var half  = Math.floor(avail / 2), dH = 270;
      [left, right].forEach(function (cv) {
        cv.style.width  = half + "px";
        cv.style.height = dH + "px";
        cv.width  = half * dpr;
        cv.height = dH * dpr;
      });
    }
  }

  function render() {
    var step = state.step;
    var fns = [null,
      [drawStep1Main, drawStep1Left, drawStep1Right],
      [drawStep2Main, drawStep2Left, drawStep2Right],
      [drawStep3Main, drawStep3Left, drawStep3Right],
      [drawStep4Main, drawStep4Left, drawStep4Right],
      [drawStep5Main, drawStep5Left, drawStep5Right],
      [drawStep6Main, drawStep6Left, drawStep6Right],
    ];
    if (step < 1 || step > 6 || !fns[step]) return;
    var main = getEl("clf-canvas-main"), left = getEl("clf-canvas-left"), right = getEl("clf-canvas-right");
    if (main)  fns[step][0](main);
    if (left)  fns[step][1](left);
    if (right) fns[step][2](right);
  }

  function goToStep(step) {
    state.step = step;
    if (step >= 1 && !state.data) generateData();

    document.querySelectorAll(".clf-step-btn").forEach(function (btn) {
      btn.classList.toggle("active", parseInt(btn.dataset.step) === step);
    });

    var container = getEl("clf-container"),
        ss        = getEl("clf-start-screen"),
        viz       = getEl("clf-viz-area"),
        ctrl      = getEl("clf-controls-area");
    if (container) container.classList.toggle("clf-active", step >= 1);
    if (ss)   ss.style.display   = step === 0 ? "flex" : "none";
    if (viz)  viz.style.display  = step >= 1 ? "flex"  : "none";
    if (ctrl) ctrl.style.display = (step === 3 || step === 4) ? "flex" : "none";

    var triCtrl = getEl("clf-trials-control"),
        thrCtrl = getEl("clf-thresh-control");
    if (triCtrl) triCtrl.style.display = step === 3 ? "flex" : "none";
    if (thrCtrl) thrCtrl.style.display = step === 4 ? "flex" : "none";

    var infoEl = getEl("clf-info-text");
    if (infoEl) {
      infoEl.innerHTML     = STEP_INFO[step] || "";
      infoEl.style.display = step >= 1 ? "block" : "none";
    }
    resizeCanvases();
    render();
  }

  function setRangeFill(slider) {
    var min = parseFloat(slider.min || "0"), max = parseFloat(slider.max || "100"), val = parseFloat(slider.value || "0");
    var pct = max > min ? ((val - min) / (max - min)) * 100 : 0;
    slider.style.setProperty("--clf-range-fill", pct + "%");
  }

  // ------------------------------------------------------------------
  // INIT
  // ------------------------------------------------------------------
  function init() {
    if (!getEl("clf-container")) return;

    document.querySelectorAll(".clf-step-btn").forEach(function (btn) {
      btn.addEventListener("click", function () { goToStep(parseInt(btn.dataset.step)); });
    });

    var startBtn = getEl("clf-start-btn");
    if (startBtn) startBtn.addEventListener("click", function () { goToStep(1); });

    // Trials slider (step 3)
    var triSlider = getEl("clf-ntrials"), triVal = getEl("clf-ntrials-val");
    if (triSlider) {
      triSlider.addEventListener("input", function () {
        state.nTrials = parseInt(this.value);
        if (triVal) triVal.textContent = this.value;
        setRangeFill(triSlider);
        state.data = null;
        generateData();
        render();
      });
      setRangeFill(triSlider);
    }

    // Threshold slider (step 4)
    var thrSlider = getEl("clf-thresh"), thrVal = getEl("clf-thresh-val");
    if (thrSlider) {
      thrSlider.addEventListener("input", function () {
        state.threshold = parseFloat(this.value);
        if (thrVal) thrVal.textContent = parseFloat(this.value).toFixed(1);
        setRangeFill(thrSlider);
        render();
      });
      if (thrVal) thrVal.textContent = state.threshold.toFixed(1);
      setRangeFill(thrSlider);
    }

    window.addEventListener("resize", function () { resizeCanvases(); render(); });
    new MutationObserver(function () { render(); })
      .observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
