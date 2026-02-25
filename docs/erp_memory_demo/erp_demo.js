/**
 * ERP Effects in Item Memory: SME, RSE, and Old/New Effect
 * Computational Memory Lab — University of Alberta
 *
 * Demonstrates three ERP effects from recognition memory research:
 *   - Subsequent Memory Effect (SME): study-phase ERPs differ for later-
 *     remembered vs. later-forgotten items (LPC & Slow Wave at Pz).
 *   - Old/New Effect (ONE): test-phase ERPs differ for correctly identified
 *     old vs. new items (FN400 at Fz, Left Parietal Positivity at Pz).
 *   - Retrieval Success Effect (RSE): test-phase ERPs differ for hits vs.
 *     misses among old items (same components as ONE).
 *
 * Waveform shapes calibrated to data from:
 *   Chen, Lithgow, Hemmerich & Caplan (2014), Exp Brain Res
 *   Chen & Caplan (2017), J Cogn Neurosci
 */
(function () {
  "use strict";

  // =====================================================================
  // SIGNAL PARAMETERS
  // =====================================================================
  var PRE  = 0.2;   // 200 ms pre-stimulus baseline
  var POST = 1.2;   // 1200 ms post-stimulus
  var DUR  = PRE + POST;
  var SR   = 250;   // samples/second
  var N    = Math.round(DUR * SR);

  // =====================================================================
  // COLORS
  // =====================================================================
  var DARK = {
    canvasBg:    "#141924",
    text:        "#c8d8e8",
    textDim:     "#8899aa",
    axes:        "#556677",
    grid:        "rgba(60,75,95,0.5)",
    hits:        "#4CAF50",
    misses:      "#ff6b6b",
    newItems:    "#e07b39",
    diff:        "#f5a623",
    regionLPC:   "rgba(91,143,217,0.18)",
    regionSW:    "rgba(80,200,120,0.14)",
    regionFN400: "rgba(240,120,80,0.18)",
    regionLPP:   "rgba(91,143,217,0.18)",
    stimulus:    "#ff4444",
    electrode:   "#5b8fd9",
    headOutline: "#8899aa",
  };

  var LIGHT = {
    canvasBg:    "#f7fafc",
    text:        "#2d3748",
    textDim:     "#4a5568",
    axes:        "#718096",
    grid:        "rgba(160,174,192,0.4)",
    hits:        "#2d8a3e",
    misses:      "#c0392b",
    newItems:    "#b85c1a",
    diff:        "#b07d00",
    regionLPC:   "rgba(74,144,226,0.15)",
    regionSW:    "rgba(45,170,90,0.13)",
    regionFN400: "rgba(200,80,50,0.15)",
    regionLPP:   "rgba(74,144,226,0.15)",
    stimulus:    "#c0392b",
    electrode:   "#2a6bbf",
    headOutline: "#718096",
  };

  function C() {
    return document.documentElement.getAttribute("data-theme") === "light"
      ? LIGHT : DARK;
  }

  // =====================================================================
  // PRNG (Mulberry32)
  // =====================================================================
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

  // =====================================================================
  // ERP TEMPLATE GENERATION (with magnitude scaling)
  // =====================================================================
  function gauss(t, center, width, amp) {
    return amp * Math.exp(-0.5 * Math.pow((t - center) / width, 2));
  }

  // Compute the slow wave component value at time t
  function slowWave(t, amp, offset) {
    if (t <= 0.70) return 0;
    return amp * (1 - Math.exp(-(t - 0.70) / 0.15))
               * Math.exp(-(t - 0.70) / 0.9) + offset;
  }

  // Returns a function(t_sec) -> voltage (uV), with magnitude-scaled effects.
  // mag=1 is the original calibrated effect size; mag=0 means no effect
  // (both conditions identical); mag=2 doubles the effect.
  function makeTemplate(type, mag) {
    if (mag === undefined) mag = 1;
    return function (t) {
      var v = 0;
      // Early sensory components (shared across all conditions)
      v += gauss(t, 0.10, 0.028, -0.7); // N1
      v += gauss(t, 0.20, 0.042, 0.55); // P2

      if (type === "sme_hit") {
        // LPC: original hit=1.6, miss=0.25 -> mid=0.925, half-diff=0.675
        v += gauss(t, 0.55, 0.10, 0.925 + mag * 0.675);
        // Slow wave: blend between hit and miss
        var swH = slowWave(t, 0.9, 0.35);
        var swM = slowWave(t, 0.08, -0.08);
        var swMid = (swH + swM) / 2;
        v += swMid + mag * (swH - swM) / 2;

      } else if (type === "sme_miss") {
        v += gauss(t, 0.55, 0.10, 0.925 - mag * 0.675);
        var swH2 = slowWave(t, 0.9, 0.35);
        var swM2 = slowWave(t, 0.08, -0.08);
        var swMid2 = (swH2 + swM2) / 2;
        v += swMid2 - mag * (swH2 - swM2) / 2;

      } else if (type === "one_hit_fz") {
        // FN400: hit=0.80, cr=-0.42 -> mid=0.19, half-diff=0.61
        v += gauss(t, 0.40, 0.085, 0.19 + mag * 0.61);
        // Late: hit=0.40, cr=0.05 -> mid=0.225, half-diff=0.175
        v += gauss(t, 0.70, 0.12, 0.225 + mag * 0.175);

      } else if (type === "one_cr_fz") {
        v += gauss(t, 0.40, 0.085, 0.19 - mag * 0.61);
        v += gauss(t, 0.70, 0.12, 0.225 - mag * 0.175);

      } else if (type === "one_hit_pz") {
        // LPP: hit=0.90, cr=0.06 -> mid=0.48, half-diff=0.42
        v += gauss(t, 0.65, 0.12, 0.48 + mag * 0.42);
        // Sustained: hit=0.38, cr=0 -> mid=0.19, half-diff=0.19
        if (t > 0.50 && t < 1.05) v += 0.19 + mag * 0.19;

      } else if (type === "one_cr_pz") {
        v += gauss(t, 0.65, 0.12, 0.48 - mag * 0.42);
        if (t > 0.50 && t < 1.05) v += 0.19 - mag * 0.19;

      } else if (type === "rse_hit_fz") {
        // RSE-FN400: hit=0.85, miss=-0.28 -> mid=0.285, half-diff=0.565
        v += gauss(t, 0.40, 0.085, 0.285 + mag * 0.565);
        // Late: hit=0.50, miss=0.10 -> mid=0.30, half-diff=0.20
        v += gauss(t, 0.70, 0.12, 0.30 + mag * 0.20);

      } else if (type === "rse_miss_fz") {
        v += gauss(t, 0.40, 0.085, 0.285 - mag * 0.565);
        v += gauss(t, 0.70, 0.12, 0.30 - mag * 0.20);

      } else if (type === "rse_hit_pz") {
        // RSE-LPP: hit=0.85, miss=0.12 -> mid=0.485, half-diff=0.365
        v += gauss(t, 0.65, 0.12, 0.485 + mag * 0.365);
        // Sustained: hit=0.32, miss=0 -> mid=0.16, half-diff=0.16
        if (t > 0.50 && t < 1.05) v += 0.16 + mag * 0.16;

      } else if (type === "rse_miss_pz") {
        v += gauss(t, 0.65, 0.12, 0.485 - mag * 0.365);
        if (t > 0.50 && t < 1.05) v += 0.16 - mag * 0.16;
      }
      return v;
    };
  }

  // Generate an averaged ERP from nTrials noisy trials
  function makeERP(templateFn, nTrials, seed) {
    var rand = rng32(seed);
    var avg = new Float64Array(N);
    for (var tr = 0; tr < nTrials; tr++) {
      for (var i = 0; i < N; i++) {
        var t = i / SR - PRE;
        avg[i] += templateFn(t) + randn(rand) * 3.2;
      }
    }
    for (var j = 0; j < N; j++) avg[j] /= nTrials;
    return avg;
  }

  // =====================================================================
  // DRAWING UTILITIES
  // =====================================================================
  function setupCtx(canvas) {
    var ctx = canvas.getContext("2d");
    var dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var W = canvas.width / dpr, H = canvas.height / dpr;
    ctx.fillStyle = C().canvasBg;
    ctx.fillRect(0, 0, W, H);
    return { ctx: ctx, W: W, H: H };
  }

  function txt(ctx, text, x, y, opts) {
    opts = opts || {};
    ctx.font        = opts.font    || '11px "Inter", sans-serif';
    ctx.fillStyle   = opts.color   || C().text;
    ctx.textAlign   = opts.align   || "left";
    ctx.textBaseline= opts.base    || "middle";
    ctx.fillText(text, x, y);
  }

  // Word-wrapping text draw. Returns the y position after the last line.
  function drawWrapped(ctx, text, x, y, maxWidth, lineHeight, opts) {
    opts = opts || {};
    ctx.font = opts.font || '11px "Inter", sans-serif';
    ctx.fillStyle = opts.color || C().text;
    ctx.textAlign = opts.align || "left";
    ctx.textBaseline = opts.base || "top";

    var words = text.split(" ");
    var line = "";
    var currentY = y;

    for (var i = 0; i < words.length; i++) {
      var testLine = line + (line ? " " : "") + words[i];
      if (ctx.measureText(testLine).width > maxWidth && line) {
        ctx.fillText(line, x, currentY);
        line = words[i];
        currentY += lineHeight;
      } else {
        line = testLine;
      }
    }
    if (line) {
      ctx.fillText(line, x, currentY);
      currentY += lineHeight;
    }
    return currentY;
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y,     x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x,     y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y,         x + r, y);
    ctx.closePath();
  }

  // Draw an ERP waveform plot.
  // waveforms: [{data, color, label, lineWidth, dash}]
  // opts: {title, electrode, margins, tMin, tMax, yMin, yMax, regions, hideLegend}
  function drawERPPlot(canvas, ctx, W, H, waveforms, opts) {
    opts    = opts    || {};
    var mg  = opts.margins  || { top: 30, bottom: 26, left: 44, right: 14 };
    var tMin = opts.tMin !== undefined ? opts.tMin : -PRE;
    var tMax = opts.tMax !== undefined ? opts.tMax : POST;
    var yMin = opts.yMin !== undefined ? opts.yMin : -2.0;
    var yMax = opts.yMax !== undefined ? opts.yMax :  2.5;
    var regions  = opts.regions  || [];
    var c = C();

    var plotW = W - mg.left - mg.right;
    var plotH = H - mg.top  - mg.bottom;

    function toX(t) { return mg.left + (t - tMin) / (tMax - tMin) * plotW; }
    function toY(v) { return mg.top  + (yMax - v) / (yMax - yMin) * plotH; }

    // Store mapping on canvas for tooltip
    canvas._erpPlot = {
      mg: mg, tMin: tMin, tMax: tMax, yMin: yMin, yMax: yMax,
      plotW: plotW, plotH: plotH, waveforms: waveforms, toX: toX, toY: toY
    };

    // Title
    if (opts.title) {
      txt(ctx, opts.title, W / 2, mg.top / 2, {
        font: 'bold 12px "Inter", sans-serif', align: "center"
      });
    }
    // Electrode label
    if (opts.electrode) {
      txt(ctx, "Electrode " + opts.electrode, W - mg.right - 2, mg.top / 2, {
        font: '10px "Inter", sans-serif', align: "right", color: c.textDim
      });
    }

    // Highlighted regions
    for (var ri = 0; ri < regions.length; ri++) {
      var reg = regions[ri];
      var rx = toX(reg.t0), rw = toX(reg.t1) - rx;
      ctx.fillStyle = reg.color;
      ctx.fillRect(rx, mg.top, rw, plotH);
    }

    // Horizontal grid lines + y-tick labels
    var yTicks = [-2, -1, 0, 1, 2];
    ctx.lineWidth = 0.5; ctx.strokeStyle = c.grid;
    for (var yi = 0; yi < yTicks.length; yi++) {
      var yv = yTicks[yi];
      if (yv < yMin || yv > yMax) continue;
      var gy = toY(yv);
      ctx.beginPath(); ctx.moveTo(mg.left, gy); ctx.lineTo(mg.left + plotW, gy); ctx.stroke();
      txt(ctx, yv === 0 ? "0" : (yv > 0 ? "+" + yv : "" + yv), mg.left - 3, gy, {
        font: '9px "Inter", sans-serif', align: "right", color: c.textDim
      });
    }

    // Time-tick labels
    var tTicks = [-0.2, 0, 0.2, 0.4, 0.6, 0.8, 1.0, 1.2];
    for (var ti = 0; ti < tTicks.length; ti++) {
      var tv = tTicks[ti];
      if (tv < tMin || tv > tMax) continue;
      var tx = toX(tv);
      ctx.beginPath(); ctx.moveTo(tx, mg.top + plotH); ctx.lineTo(tx, mg.top + plotH + 3);
      ctx.strokeStyle = c.axes; ctx.lineWidth = 0.5; ctx.stroke();
      txt(ctx, Math.round(tv * 1000) + " ms", tx, mg.top + plotH + 12, {
        font: '8px "Inter", sans-serif', align: "center", color: c.textDim, base: "top"
      });
    }

    // Axes
    ctx.beginPath();
    ctx.moveTo(mg.left, mg.top); ctx.lineTo(mg.left, mg.top + plotH);
    ctx.lineTo(mg.left + plotW, mg.top + plotH);
    ctx.strokeStyle = c.axes; ctx.lineWidth = 1; ctx.stroke();

    // Baseline (0 uV)
    var baseY = toY(0);
    ctx.beginPath(); ctx.moveTo(mg.left, baseY); ctx.lineTo(mg.left + plotW, baseY);
    ctx.strokeStyle = c.axes; ctx.lineWidth = 0.8; ctx.stroke();

    // Stimulus onset line
    var stimX = toX(0);
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(stimX, mg.top); ctx.lineTo(stimX, mg.top + plotH);
    ctx.strokeStyle = c.stimulus; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();
    txt(ctx, "Stimulus", stimX + 3, mg.top + 8, {
      font: '8px "Inter", sans-serif', color: c.stimulus
    });

    // Y-axis label
    ctx.save();
    ctx.translate(10, mg.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    txt(ctx, "Voltage (\u03bcV)", 0, 0, {
      font: '9px "Inter", sans-serif', align: "center", color: c.textDim
    });
    ctx.restore();

    // Region labels
    for (var rli = 0; rli < regions.length; rli++) {
      var rl = regions[rli];
      if (!rl.label) continue;
      var midX = (toX(rl.t0) + toX(rl.t1)) / 2;
      txt(ctx, rl.label, midX, mg.top + 10, {
        font: 'bold 8.5px "Inter", sans-serif', align: "center",
        color: rl.labelColor || c.text
      });
    }

    // Waveforms
    for (var wi = 0; wi < waveforms.length; wi++) {
      var wf = waveforms[wi];
      if (!wf.data) continue;
      ctx.save();
      ctx.beginPath();
      ctx.strokeStyle = wf.color;
      ctx.lineWidth = wf.lineWidth || 2;
      if (wf.dash) ctx.setLineDash(wf.dash);
      var firstPt = true;
      for (var si = 0; si < N; si++) {
        var st = si / SR - PRE;
        if (st < tMin || st > tMax) continue;
        var px = toX(st), py = toY(wf.data[si]);
        if (firstPt) { ctx.moveTo(px, py); firstPt = false; } else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.restore();
    }

    // Legend
    if (!opts.hideLegend) {
      var legX = W - mg.right - 2;
      var legY = mg.top + 6;
      for (var li = 0; li < waveforms.length; li++) {
        var lw = waveforms[li];
        if (!lw.label) continue;
        ctx.font = '8.5px "Inter", sans-serif';
        var tw = ctx.measureText(lw.label).width;
        var lineLen = 16;
        var lineX = legX - tw - lineLen - 4;
        ctx.save();
        ctx.beginPath();
        ctx.strokeStyle = lw.color; ctx.lineWidth = 2;
        if (lw.dash) ctx.setLineDash(lw.dash);
        ctx.moveTo(lineX, legY); ctx.lineTo(lineX + lineLen, legY);
        ctx.stroke();
        ctx.restore();
        txt(ctx, lw.label, lineX + lineLen + 2, legY, {
          font: '8.5px "Inter", sans-serif', color: lw.color, base: "middle"
        });
        legY += 15;
      }
    }
  }

  // =====================================================================
  // HEAD DIAGRAM
  // =====================================================================
  function drawHeadDiagram(ctx, W, H, electrodes, highlightId) {
    var c = C();
    var cx = W / 2, cy = H / 2 - 8;
    var r  = Math.min(W, H) * 0.30;

    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 2 * Math.PI);
    ctx.strokeStyle = c.headOutline; ctx.lineWidth = 2; ctx.stroke();

    // Nose
    ctx.beginPath();
    ctx.moveTo(cx - 7, cy - r + 8);
    ctx.lineTo(cx,     cy - r - 10);
    ctx.lineTo(cx + 7, cy - r + 8);
    ctx.strokeStyle = c.headOutline; ctx.lineWidth = 1.5; ctx.stroke();

    // Ears
    for (var s = -1; s <= 1; s += 2) {
      ctx.beginPath();
      ctx.ellipse(cx + s * (r + 5), cy, 5, 8, 0, 0, 2 * Math.PI);
      ctx.strokeStyle = c.headOutline; ctx.lineWidth = 1.5; ctx.stroke();
    }

    // Electrodes
    for (var ei = 0; ei < electrodes.length; ei++) {
      var e   = electrodes[ei];
      var ex  = cx + (e.rx || 0) * r;
      var ey  = cy + (e.ry || 0) * r;
      var hl  = (e.id === highlightId);
      var rad = hl ? 8 : 5;

      ctx.beginPath(); ctx.arc(ex, ey, rad, 0, 2 * Math.PI);
      ctx.fillStyle   = hl ? c.electrode : c.electrode + "88";
      ctx.strokeStyle = hl ? "#fff" : c.headOutline;
      ctx.lineWidth   = 1;
      ctx.fill(); ctx.stroke();

      var labelAlign = e.rx < 0 ? "right" : "left";
      var labelOff   = e.rx < 0 ? ex - rad - 3 : ex + rad + 3;
      txt(ctx, e.id, labelOff, ey, {
        font:  (hl ? "bold " : "") + '10px "Inter", sans-serif',
        align: labelAlign,
        color: hl ? c.text : c.textDim
      });
    }
  }

  var ELECTRODES = [
    { id: "Fz", rx:  0.00, ry: -0.55 },
    { id: "Cz", rx:  0.00, ry:  0.00 },
    { id: "Pz", rx:  0.00, ry:  0.50 },
    { id: "P3", rx: -0.38, ry:  0.52 },
  ];

  // =====================================================================
  // COMPONENT CARD DRAWING UTILITY
  // =====================================================================
  // Draws a rounded card with a colored border, label, time/site, and
  // word-wrapped description. Returns the y after the card.
  function drawComponentCard(ctx, x, y, w, item, c) {
    var pad = 12;
    var innerW = w - pad * 2;
    var descFont = '11.5px "Inter", sans-serif';
    var descLH = 16;

    // Measure content height first
    var testY = 0;
    testY += 18; // label
    testY += 16; // time/site
    testY += 4;  // gap
    // Estimate wrapped text height
    ctx.font = descFont;
    var descLines = 0;
    var words = item.desc.split(" ");
    var line = "";
    for (var i = 0; i < words.length; i++) {
      var test = line + (line ? " " : "") + words[i];
      if (ctx.measureText(test).width > innerW && line) {
        descLines++;
        line = words[i];
      } else {
        line = test;
      }
    }
    if (line) descLines++;
    testY += descLines * descLH;
    testY += 10; // bottom pad

    var boxH = testY;

    roundRect(ctx, x, y, w, boxH, 5);
    ctx.fillStyle = item.color + "18"; ctx.fill();
    ctx.strokeStyle = item.color; ctx.lineWidth = 1; ctx.stroke();

    var ty = y + pad;
    txt(ctx, item.label, x + pad, ty, {
      font: 'bold 12px "Inter", sans-serif', color: item.color, base: "top"
    });
    ty += 18;
    txt(ctx, item.time + "  \u00B7  " + item.site, x + pad, ty, {
      font: '10px "Inter", sans-serif', color: c.textDim, base: "top"
    });
    ty += 16 + 4;
    ty = drawWrapped(ctx, item.desc, x + pad, ty, innerW, descLH, {
      font: descFont, color: c.text
    });

    return y + boxH + 8;
  }

  // =====================================================================
  // STATE
  // =====================================================================
  var state = {
    step:      0,
    nTrials:   30,
    magnitude: 1.0,
    data:      null,
  };

  function generateData() {
    var n = state.nTrials;
    var m = state.magnitude;
    state.data = {
      sme_hit:     makeERP(makeTemplate("sme_hit", m),     n, 1001),
      sme_miss:    makeERP(makeTemplate("sme_miss", m),    n, 2001),
      one_hit_fz:  makeERP(makeTemplate("one_hit_fz", m), n, 3001),
      one_cr_fz:   makeERP(makeTemplate("one_cr_fz", m),  n, 4001),
      one_hit_pz:  makeERP(makeTemplate("one_hit_pz", m), n, 5001),
      one_cr_pz:   makeERP(makeTemplate("one_cr_pz", m),  n, 6001),
      rse_hit_fz:  makeERP(makeTemplate("rse_hit_fz", m), n, 7001),
      rse_miss_fz: makeERP(makeTemplate("rse_miss_fz", m),n, 8001),
      rse_hit_pz:  makeERP(makeTemplate("rse_hit_pz", m), n, 9001),
      rse_miss_pz: makeERP(makeTemplate("rse_miss_pz", m),n, 10001),
    };
  }

  // =====================================================================
  // STEP 1: THE EXPERIMENT
  // =====================================================================
  function drawStep1Main(canvas) {
    var r = setupCtx(canvas); var ctx = r.ctx, W = r.W, H = r.H;
    var c = C();

    txt(ctx, "The Recognition Memory Experiment", W / 2, 18, {
      font: 'bold 14px "Inter", sans-serif', align: "center"
    });

    var phases = [
      { label: "Study Phase",
        words: ["CHAPTER", "ARTIST", "MOTOR"],
        color: "#5b8fd9",
        note: "25 words \u00B7 1500 ms each\nEEG recorded" },
      { label: "Distractor Task",
        words: ["5+6\u22123=?", "9\u22125+2=?", "4+7\u22121=?"],
        color: "#f5a623",
        note: "5 equations\nPrevents rehearsal" },
      { label: "Test Phase",
        words: ["CHAPTER", "MERCY", "ARTIST"],
        color: "#4CAF50",
        note: "50 probes\n25 old + 25 new\nEEG recorded" },
    ];

    var gap    = 16;
    var boxW   = Math.floor((W - 30 - gap * 2) / 3);
    var boxH   = H - 50;
    var startX = 15;
    var boxY   = 36;

    for (var i = 0; i < phases.length; i++) {
      var ph = phases[i];
      var bx = startX + i * (boxW + gap);

      // Box
      roundRect(ctx, bx, boxY, boxW, boxH, 7);
      ctx.fillStyle = c.canvasBg; ctx.fill();
      ctx.strokeStyle = ph.color; ctx.lineWidth = 1.8; ctx.stroke();

      // Phase label bar
      ctx.fillStyle = ph.color + "33";
      ctx.fillRect(bx + 1, boxY + 1, boxW - 2, 26);
      txt(ctx, ph.label, bx + boxW / 2, boxY + 14, {
        font: 'bold 12px "Inter", sans-serif', align: "center", color: ph.color
      });

      // Words - centered vertically in box
      var wordAreaTop = boxY + 36;
      var wordAreaBot = boxY + boxH - 45;
      var wordSpacing = Math.min(34, (wordAreaBot - wordAreaTop) / (ph.words.length - 1 || 1));
      var wordStartY = wordAreaTop + (wordAreaBot - wordAreaTop - wordSpacing * (ph.words.length - 1)) / 2;
      for (var w = 0; w < ph.words.length; w++) {
        txt(ctx, ph.words[w], bx + boxW / 2, wordStartY + w * wordSpacing, {
          font: '13px "Times New Roman", serif', align: "center"
        });
      }

      // Notes
      var noteLines = ph.note.split("\n");
      var noteStartY = boxY + boxH - 8 - (noteLines.length - 1) * 14;
      for (var nl = 0; nl < noteLines.length; nl++) {
        txt(ctx, noteLines[nl], bx + boxW / 2, noteStartY + nl * 14, {
          font: '9.5px "Inter", sans-serif', align: "center", color: c.textDim
        });
      }

      // Arrow between phases
      if (i < 2) {
        var ax  = bx + boxW + 3;
        var ay  = boxY + boxH / 2;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax + gap - 6, ay);
        ctx.strokeStyle = c.textDim; ctx.lineWidth = 1.4; ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(ax + gap - 6, ay - 4);
        ctx.lineTo(ax + gap - 2, ay);
        ctx.lineTo(ax + gap - 6, ay + 4);
        ctx.fillStyle = c.textDim; ctx.fill();
      }
    }
  }

  function drawStep1Left(canvas) {
    var r = setupCtx(canvas); var ctx = r.ctx, W = r.W, H = r.H;
    var c = C();

    txt(ctx, "Three ERP Effects", W / 2, 18, {
      font: 'bold 13px "Inter", sans-serif', align: "center"
    });

    var effects = [
      { abbr: "SME", name: "Subsequent Memory Effect", color: c.hits,
        desc: "Brain activity during study differs between items later remembered vs. forgotten." },
      { abbr: "ONE", name: "Old/New Effect", color: "#5b8fd9",
        desc: "Brain activity during test differs between correctly identified old vs. new items." },
      { abbr: "RSE", name: "Retrieval Success Effect", color: c.diff,
        desc: "Brain activity during test differs between hits (correct) and misses (incorrect) on old items." },
    ];

    var pad = 10;
    var cardW = W - 12;
    var innerW = cardW - pad * 2;
    var descFont = '11px "Inter", sans-serif';
    var descLH = 15;

    // Pre-measure each card's height (no phase line)
    var cardHeights = [];
    for (var mi = 0; mi < effects.length; mi++) {
      var ch = 8 + 18 + 14 + 4; // top-pad + abbr + name + gap
      ctx.font = descFont;
      var dLines = 0;
      var dWords = effects[mi].desc.split(" ");
      var dLine = "";
      for (var di = 0; di < dWords.length; di++) {
        var dt = dLine + (dLine ? " " : "") + dWords[di];
        if (ctx.measureText(dt).width > innerW && dLine) { dLines++; dLine = dWords[di]; }
        else { dLine = dt; }
      }
      if (dLine) dLines++;
      ch += dLines * descLH + 8;
      cardHeights.push(ch);
    }

    // Distribute with available space
    var totalH = 0;
    for (var th = 0; th < cardHeights.length; th++) totalH += cardHeights[th];
    var gap2 = Math.max(4, Math.floor((H - 38 - totalH) / effects.length));

    var ry = 34;
    for (var i = 0; i < effects.length; i++) {
      var e  = effects[i];
      var rH = cardHeights[i];

      roundRect(ctx, 6, ry, cardW, rH, 5);
      ctx.fillStyle = e.color + "18"; ctx.fill();
      ctx.strokeStyle = e.color; ctx.lineWidth = 1; ctx.stroke();

      var ty = ry + 8;
      txt(ctx, e.abbr, pad + 6, ty, {
        font: 'bold 16px "Inter", sans-serif', color: e.color, base: "top"
      });
      ty += 18;
      txt(ctx, e.name, pad + 6, ty, {
        font: 'bold 11px "Inter", sans-serif', color: e.color, base: "top"
      });
      ty += 18;
      drawWrapped(ctx, e.desc, pad + 6, ty, innerW, descLH, {
        font: descFont, color: c.text
      });

      ry += rH + gap2;
    }
  }

  function drawStep1Right(canvas) {
    var r = setupCtx(canvas); var ctx = r.ctx, W = r.W, H = r.H;
    var c = C();

    txt(ctx, "EEG Electrode Locations", W / 2, 18, {
      font: 'bold 13px "Inter", sans-serif', align: "center"
    });

    drawHeadDiagram(ctx, W, H - 68, ELECTRODES, "");

    var notes = [
      { label: "Fz", desc: "Frontal midline \u2014 FN400 (ONE, RSE)", color: "#5b8fd9" },
      { label: "Pz", desc: "Parietal midline \u2014 LPC & Slow Wave (SME)", color: c.hits },
      { label: "P3", desc: "Left parietal \u2014 LPP (ONE, RSE)", color: c.diff },
    ];
    var ny = H - 60;
    for (var ni = 0; ni < notes.length; ni++) {
      var dotX = 14;
      ctx.beginPath(); ctx.arc(dotX, ny + ni * 20, 5, 0, 2 * Math.PI);
      ctx.fillStyle = notes[ni].color; ctx.fill();
      txt(ctx, notes[ni].label + ": " + notes[ni].desc, dotX + 12, ny + ni * 20, {
        font: '10.5px "Inter", sans-serif', color: c.textDim
      });
    }
  }

  // =====================================================================
  // STEP 2: STUDY ERPs
  // =====================================================================
  function drawStep2Main(canvas) {
    var r = setupCtx(canvas); var ctx = r.ctx, W = r.W, H = r.H;
    if (!state.data) return;
    var c = C();
    drawERPPlot(canvas, ctx, W, H, [
      { data: state.data.sme_hit,  color: c.hits,   label: "Later Remembered (Hits)",   lineWidth: 2.2 },
      { data: state.data.sme_miss, color: c.misses, label: "Later Forgotten (Misses)",   lineWidth: 2.2, dash: [6, 3] },
    ], { title: "Study-Phase ERPs", electrode: "Pz", yMin: -2, yMax: 2.5 });
  }

  function drawStep2Left(canvas) {
    var r = setupCtx(canvas); var ctx = r.ctx, W = r.W, H = r.H;
    var c = C();
    txt(ctx, "Electrode Pz", W / 2, 14, {
      font: 'bold 12px "Inter", sans-serif', align: "center"
    });
    drawHeadDiagram(ctx, W, H - 20, ELECTRODES, "Pz");
    txt(ctx, "Active: Pz (parietal midline)", W / 2, H - 8, {
      font: '9px "Inter", sans-serif', align: "center", color: c.textDim
    });
  }

  function drawStep2Right(canvas) {
    var r = setupCtx(canvas); var ctx = r.ctx, W = r.W, H = r.H;
    var c = C();
    var pad = 14;
    var maxW = W - pad * 2;

    txt(ctx, "Subsequent Memory Effect", W / 2, 18, {
      font: 'bold 13px "Inter", sans-serif', align: "center", color: c.hits
    });

    var y = 40;
    y = drawWrapped(ctx, "During the study phase, EEG is recorded as each word appears on screen. After the test, we sort the study trials by outcome:", pad, y, maxW, 17, {
      font: '12px "Inter", sans-serif', color: c.text
    });
    y += 8;
    txt(ctx, "Hits", pad, y, { font: 'bold 13px "Inter", sans-serif', color: c.hits, base: "top" });
    y += 18;
    y = drawWrapped(ctx, "Items later correctly recognized as \u201Cold.\u201D", pad, y, maxW, 17, {
      font: '12px "Inter", sans-serif', color: c.text
    });
    y += 6;
    txt(ctx, "Misses", pad, y, { font: 'bold 13px "Inter", sans-serif', color: c.misses, base: "top" });
    y += 18;
    y = drawWrapped(ctx, "Items later incorrectly called \u201Cnew\u201D (forgotten).", pad, y, maxW, 17, {
      font: '12px "Inter", sans-serif', color: c.text
    });
    y += 8;
    drawWrapped(ctx, "Notice the waveforms diverge after ~400 ms \u2014 this divergence during encoding predicts later memory success.", pad, y, maxW, 17, {
      font: '12px "Inter", sans-serif', color: c.text
    });
  }

  // =====================================================================
  // STEP 3: SME HIGHLIGHTED
  // =====================================================================
  function drawStep3Main(canvas) {
    var r = setupCtx(canvas); var ctx = r.ctx, W = r.W, H = r.H;
    if (!state.data) return;
    var c = C();
    drawERPPlot(canvas, ctx, W, H, [
      { data: state.data.sme_hit,  color: c.hits,   label: "Hits",  lineWidth: 2.2 },
      { data: state.data.sme_miss, color: c.misses, label: "Misses", lineWidth: 2.2, dash: [6, 3] },
    ], {
      title: "Subsequent Memory Effect (SME)", electrode: "Pz",
      yMin: -2, yMax: 2.5,
      regions: [
        { t0: 0.40, t1: 0.70, color: c.regionLPC,  label: "LPC",       labelColor: "#5b8fd9" },
        { t0: 0.70, t1: 1.20, color: c.regionSW,   label: "Slow Wave", labelColor: "#4CAF50" },
      ],
    });
  }

  function drawStep3Left(canvas) {
    var r = setupCtx(canvas); var ctx = r.ctx, W = r.W, H = r.H;
    var c = C();
    txt(ctx, "Electrode Pz", W / 2, 14, {
      font: 'bold 12px "Inter", sans-serif', align: "center"
    });
    drawHeadDiagram(ctx, W, H - 20, ELECTRODES, "Pz");
    txt(ctx, "Active: Pz (parietal midline)", W / 2, H - 8, {
      font: '9px "Inter", sans-serif', align: "center", color: c.textDim
    });
  }

  function drawStep3Right(canvas) {
    var r = setupCtx(canvas); var ctx = r.ctx, W = r.W, H = r.H;
    var c = C();
    var pad = 10;
    var cardW = W - pad * 2;

    txt(ctx, "SME Components at Pz", W / 2, 16, {
      font: 'bold 13px "Inter", sans-serif', align: "center"
    });

    var items = [
      { label: "Late Positive Component (LPC)", color: "#5b8fd9",
        time: "400\u2013700 ms", site: "Pz",
        desc: "Larger for hits. Linked to familiarity and early recollection processes." },
      { label: "Slow Wave", color: "#4CAF50",
        time: "700\u20131200 ms", site: "Pz",
        desc: "Sustained positivity for hits. Linked to elaborative encoding and context retrieval." },
    ];

    var y = 34;
    for (var i = 0; i < items.length; i++) {
      y = drawComponentCard(ctx, pad, y, cardW, items[i], c);
    }
  }

  // =====================================================================
  // STEP 4: TEST ERPs (raw, both ONE and RSE introduced)
  // =====================================================================
  function drawStep4Main(canvas) {
    var r = setupCtx(canvas); var ctx = r.ctx, W = r.W, H = r.H;
    if (!state.data) return;
    var c = C();
    drawERPPlot(canvas, ctx, W, H, [
      { data: state.data.one_hit_fz, color: c.hits,     label: "Hits (Old)",              lineWidth: 2.2 },
      { data: state.data.one_cr_fz,  color: c.newItems, label: "Correct Rejections (New)", lineWidth: 2.2, dash: [6, 3] },
    ], { title: "Test-Phase ERPs: Old vs. New", electrode: "Fz", yMin: -2, yMax: 2.5 });
  }

  function drawStep4Left(canvas) {
    var r = setupCtx(canvas); var ctx = r.ctx, W = r.W, H = r.H;
    if (!state.data) return;
    var c = C();
    drawERPPlot(canvas, ctx, W, H, [
      { data: state.data.one_hit_pz, color: c.hits,     label: "Hits (Old)",              lineWidth: 2.2 },
      { data: state.data.one_cr_pz,  color: c.newItems, label: "Correct Rejections (New)", lineWidth: 2.2, dash: [6, 3] },
    ], {
      title: "Test-Phase ERPs: Old vs. New", electrode: "Pz",
      margins: { top: 30, bottom: 26, left: 40, right: 10 },
      yMin: -2, yMax: 2.5,
    });
  }

  function drawStep4Right(canvas) {
    var r = setupCtx(canvas); var ctx = r.ctx, W = r.W, H = r.H;
    var c = C();
    var pad = 14;
    var maxW = W - pad * 2;

    txt(ctx, "Test-Phase ERP Effects", W / 2, 18, {
      font: 'bold 13px "Inter", sans-serif', align: "center", color: "#5b8fd9"
    });

    var y = 40;
    y = drawWrapped(ctx, "During the test phase, each probe is either old (studied) or new (unstudied). ERPs recorded at test reveal two distinct effects:", pad, y, maxW, 17, {
      font: '12px "Inter", sans-serif', color: c.text
    });
    y += 8;

    txt(ctx, "Old/New Effect (ONE)", pad, y, { font: 'bold 12px "Inter", sans-serif', color: "#5b8fd9", base: "top" });
    y += 18;
    y = drawWrapped(ctx, "Compares hits (old items called \u201Cold\u201D) with correct rejections (new items called \u201Cnew\u201D). Isolates brain activity related to successful recognition.", pad, y, maxW, 17, {
      font: '12px "Inter", sans-serif', color: c.text
    });
    y += 6;

    txt(ctx, "Retrieval Success Effect (RSE)", pad, y, { font: 'bold 12px "Inter", sans-serif', color: c.diff, base: "top" });
    y += 18;
    y = drawWrapped(ctx, "Compares hits with misses (old items called \u201Cnew\u201D) among old items only. Isolates successful retrieval independent of old-vs-new status.", pad, y, maxW, 17, {
      font: '12px "Inter", sans-serif', color: c.text
    });
    y += 8;

    drawWrapped(ctx, "Both effects reveal the same two components \u2014 the FN400 at frontal electrode Fz and the Left Parietal Positivity at parietal electrode Pz \u2014 emerging in different time windows.", pad, y, maxW, 17, {
      font: '12px "Inter", sans-serif', color: c.text
    });
  }

  // =====================================================================
  // STEP 5: OLD/NEW EFFECT HIGHLIGHTED
  // =====================================================================
  function drawStep5Main(canvas) {
    var r = setupCtx(canvas); var ctx = r.ctx, W = r.W, H = r.H;
    if (!state.data) return;
    var c = C();
    drawERPPlot(canvas, ctx, W, H, [
      { data: state.data.one_hit_fz, color: c.hits,     label: "Hits",              lineWidth: 2.2 },
      { data: state.data.one_cr_fz,  color: c.newItems, label: "Correct Rejections", lineWidth: 2.2, dash: [6, 3] },
    ], {
      title: "Old/New Effect \u2014 FN400 at Fz", electrode: "Fz",
      yMin: -2, yMax: 2.5,
      regions: [
        { t0: 0.30, t1: 0.50, color: c.regionFN400, label: "FN400", labelColor: "#e07b39" },
      ],
    });
  }

  function drawStep5Left(canvas) {
    var r = setupCtx(canvas); var ctx = r.ctx, W = r.W, H = r.H;
    if (!state.data) return;
    var c = C();
    drawERPPlot(canvas, ctx, W, H, [
      { data: state.data.one_hit_pz, color: c.hits,     label: "Hits",              lineWidth: 2.2 },
      { data: state.data.one_cr_pz,  color: c.newItems, label: "Correct Rejections", lineWidth: 2.2, dash: [6, 3] },
    ], {
      title: "Old/New Effect \u2014 LPP at Pz", electrode: "Pz",
      margins: { top: 30, bottom: 26, left: 40, right: 10 },
      yMin: -2, yMax: 2.5,
      regions: [
        { t0: 0.50, t1: 0.80, color: c.regionLPP, label: "Left Parietal Positivity", labelColor: "#5b8fd9" },
      ],
    });
  }

  function drawStep5Right(canvas) {
    var r = setupCtx(canvas); var ctx = r.ctx, W = r.W, H = r.H;
    var c = C();
    var pad = 10;
    var cardW = W - pad * 2;

    txt(ctx, "Old/New Effect Components", W / 2, 16, {
      font: 'bold 13px "Inter", sans-serif', align: "center"
    });

    var items = [
      { label: "FN400", color: "#e07b39",
        time: "300\u2013500 ms", site: "Fz (frontal)",
        desc: "Old items more positive. Reflects familiarity \u2014 the automatic sense of having seen an item before." },
      { label: "Left Parietal Positivity (LPP)", color: "#5b8fd9",
        time: "500\u2013800 ms", site: "Pz / P3 (parietal)",
        desc: "Old items more positive. Reflects recollection \u2014 retrieval of contextual detail from the study episode." },
    ];

    var y = 34;
    for (var i = 0; i < items.length; i++) {
      y = drawComponentCard(ctx, pad, y, cardW, items[i], c);
    }

    txt(ctx, "FN400 = familiarity, LPP = recollection", W / 2, H - 10, {
      font: 'italic 10.5px "Inter", sans-serif', align: "center", color: c.textDim
    });
  }

  // =====================================================================
  // STEP 6: RETRIEVAL SUCCESS EFFECT (same layout as Step 5)
  // =====================================================================
  function drawStep6Main(canvas) {
    var r = setupCtx(canvas); var ctx = r.ctx, W = r.W, H = r.H;
    if (!state.data) return;
    var c = C();
    drawERPPlot(canvas, ctx, W, H, [
      { data: state.data.rse_hit_fz,  color: c.hits,   label: "Hits (recognized)",  lineWidth: 2.2 },
      { data: state.data.rse_miss_fz, color: c.misses, label: "Misses (forgotten)", lineWidth: 2.2, dash: [6, 3] },
    ], {
      title: "Retrieval Success Effect \u2014 FN400 at Fz", electrode: "Fz",
      yMin: -2, yMax: 2.5,
      regions: [
        { t0: 0.30, t1: 0.50, color: c.regionFN400, label: "FN400", labelColor: "#e07b39" },
      ],
    });
  }

  function drawStep6Left(canvas) {
    var r = setupCtx(canvas); var ctx = r.ctx, W = r.W, H = r.H;
    if (!state.data) return;
    var c = C();
    drawERPPlot(canvas, ctx, W, H, [
      { data: state.data.rse_hit_pz,  color: c.hits,   label: "Hits",   lineWidth: 2.2 },
      { data: state.data.rse_miss_pz, color: c.misses, label: "Misses", lineWidth: 2.2, dash: [6, 3] },
    ], {
      title: "Retrieval Success Effect \u2014 LPP at Pz", electrode: "Pz",
      margins: { top: 30, bottom: 26, left: 40, right: 10 },
      yMin: -2, yMax: 2.5,
      regions: [
        { t0: 0.50, t1: 0.80, color: c.regionLPP, label: "Left Parietal Positivity", labelColor: "#5b8fd9" },
      ],
    });
  }

  function drawStep6Right(canvas) {
    var r = setupCtx(canvas); var ctx = r.ctx, W = r.W, H = r.H;
    var c = C();
    var pad = 10;
    var cardW = W - pad * 2;

    txt(ctx, "Retrieval Success Effect Components", W / 2, 16, {
      font: 'bold 13px "Inter", sans-serif', align: "center"
    });

    var items = [
      { label: "FN400", color: "#e07b39",
        time: "300\u2013500 ms", site: "Fz (frontal)",
        desc: "Hits more positive than misses. Same component as the ONE, confirming it tracks actual retrieval success, not just old-vs-new status." },
      { label: "Left Parietal Positivity (LPP)", color: "#5b8fd9",
        time: "500\u2013800 ms", site: "Pz / P3 (parietal)",
        desc: "Hits more positive than misses. Tracks recollection of contextual details. Chen et al. (2014) found the LPC at study (SME) correlates with the FN400 at test (RSE), linking encoding and retrieval." },
    ];

    var y = 34;
    for (var i = 0; i < items.length; i++) {
      y = drawComponentCard(ctx, pad, y, cardW, items[i], c);
    }

    txt(ctx, "SME LPC \u2194 RSE FN400: encoding predicts retrieval", W / 2, H - 10, {
      font: 'italic 10.5px "Inter", sans-serif', align: "center", color: c.diff
    });
  }

  // =====================================================================
  // STEP INFO TEXT
  // =====================================================================
  var STEP_INFO = [
    "",
    "<strong>Step 1: The Experiment.</strong> Participants study a list of words while EEG is recorded from scalp electrodes. After a brief distractor task (mental arithmetic, to prevent rehearsal), they complete a recognition test: each probe is either an old (studied) word or a new (unstudied) word, and participants judge whether each probe is \u201Cold\u201D or \u201Cnew.\u201D By sorting trials based on behavioral outcomes, we can identify three ERP effects \u2014 one at study (SME) and two at test (ONE and RSE) \u2014 each isolating a different aspect of how the brain encodes and retrieves memories.",
    "<strong>Step 2: Study-Phase ERPs.</strong> While participants study each word, ERPs are recorded at electrodes such as Pz. After the test, study trials are sorted by memory outcome into \u201Chits\u201D (later correctly recognized) and \u201Cmisses\u201D (later forgotten). The two waveforms start similarly \u2014 reflecting shared perceptual processing \u2014 but diverge after ~400 ms. This divergence during encoding predicts later memory success: whatever the brain is doing differently for remembered items is visible in the ERP before the memory is ever tested. Use the sliders to see how trial averaging reduces noise and how effect magnitude shapes the difference.",
    "<strong>Step 3: Subsequent Memory Effect (SME).</strong> The SME is the difference in study-phase brain activity between items later remembered vs. forgotten. Two components stand out at electrode Pz: the <em>Late Positive Component (LPC)</em> at 400\u2013700 ms, associated with familiarity and early recollection; and the <em>Slow Wave</em> at 700\u20131200 ms, a sustained positivity linked to elaborative encoding. Chen et al. (2014) showed that the LPC at study correlates with the FN400 at test across participants, suggesting these components may tap overlapping memory processes.",
    "<strong>Step 4: Test-Phase ERPs.</strong> During the test phase, ERPs are recorded as participants judge each probe as old or new. Two contrasts reveal different aspects of memory retrieval. The <em>Old/New Effect</em> compares correctly identified old items (hits) with correctly identified new items (correct rejections), isolating brain activity related to successful recognition. The <em>Retrieval Success Effect</em> compares hits with misses among old items only, isolating successful retrieval independent of old-vs-new status. Both contrasts reveal the same two components \u2014 the FN400 (frontal) and Left Parietal Positivity (parietal) \u2014 but from different analytical perspectives.",
    "<strong>Step 5: Old/New Effect (ONE) Components.</strong> The ONE has two canonical components: the <em>FN400</em> (300\u2013500 ms, Fz) is enhanced for old items and is thought to reflect <em>familiarity</em> \u2014 a fast, strength-based signal that an item has been encountered before; the <em>Left Parietal Positivity (LPP)</em> (500\u2013800 ms, Pz/P3) is also enhanced for old items and is thought to reflect <em>recollection</em> \u2014 the conscious retrieval of specific contextual details from the study episode. These two components are widely interpreted within dual-process theory, which holds that recognition memory relies on two qualitatively different processes.",
    "<strong>Step 6: Retrieval Success Effect (RSE).</strong> The RSE contrasts hits vs. misses among old items only \u2014 isolating successful retrieval independent of old-vs-new status. The same FN400 and Left Parietal Positivity appear, confirming that these components genuinely track retrieval success rather than simply reflecting item novelty. Importantly, Chen et al. (2014) found that the LPC at study (SME) and the FN400 at test (RSE) are correlated across participants \u2014 suggesting that effective encoding (indexed by a larger LPC) predicts effective familiarity-based retrieval (indexed by a larger FN400), linking the neural signatures of encoding and retrieval.",
  ];

  // =====================================================================
  // CANVAS SIZING & RENDER
  // =====================================================================
  function getEl(id) { return document.getElementById(id); }

  function getInnerW(el) {
    var s = window.getComputedStyle(el);
    return Math.max(0, el.clientWidth - (parseFloat(s.paddingLeft) || 0)
                                      - (parseFloat(s.paddingRight) || 0));
  }

  function resizeCanvases() {
    var container = getEl("erp-container");
    if (!container) return;
    var cW  = getInnerW(container);
    var dpr = window.devicePixelRatio || 1;

    var main = getEl("erp-canvas-main");
    if (main) {
      var dW = Math.max(0, cW - 10);
      main.style.width  = dW + "px";
      main.style.height = "240px";
      main.width  = dW * dpr;
      main.height = 240 * dpr;
    }

    var left  = getEl("erp-canvas-left");
    var right = getEl("erp-canvas-right");
    if (left && right) {
      var avail = Math.max(0, cW - 10 - 14);
      var half  = Math.floor(avail / 2);
      var dH = 270;
      [left, right].forEach(function (cv) {
        cv.style.width  = half + "px";
        cv.style.height = dH + "px";
        cv.width  = half * dpr;
        cv.height = dH * dpr;
      });
    }
  }

  function render() {
    var main  = getEl("erp-canvas-main");
    var left  = getEl("erp-canvas-left");
    var right = getEl("erp-canvas-right");
    var step  = state.step;

    if (step === 1) {
      if (main)  drawStep1Main(main);
      if (left)  drawStep1Left(left);
      if (right) drawStep1Right(right);
    } else if (step === 2) {
      if (main)  drawStep2Main(main);
      if (left)  drawStep2Left(left);
      if (right) drawStep2Right(right);
    } else if (step === 3) {
      if (main)  drawStep3Main(main);
      if (left)  drawStep3Left(left);
      if (right) drawStep3Right(right);
    } else if (step === 4) {
      if (main)  drawStep4Main(main);
      if (left)  drawStep4Left(left);
      if (right) drawStep4Right(right);
    } else if (step === 5) {
      if (main)  drawStep5Main(main);
      if (left)  drawStep5Left(left);
      if (right) drawStep5Right(right);
    } else if (step === 6) {
      if (main)  drawStep6Main(main);
      if (left)  drawStep6Left(left);
      if (right) drawStep6Right(right);
    }
  }

  // =====================================================================
  // HOVER TOOLTIP
  // =====================================================================
  function setupTooltip(canvas) {
    var tooltip = document.createElement("div");
    tooltip.style.cssText = "position:absolute;pointer-events:none;display:none;" +
      "background:rgba(20,25,36,0.92);color:#c8d8e8;padding:6px 10px;" +
      "border-radius:4px;font:10px 'Inter',sans-serif;z-index:100;" +
      "border:1px solid #3a4254;white-space:nowrap;";
    canvas.parentElement.style.position = "relative";
    canvas.parentElement.appendChild(tooltip);

    canvas.addEventListener("mousemove", function (e) {
      var plot = canvas._erpPlot;
      if (!plot || !plot.waveforms || !plot.waveforms.length) {
        tooltip.style.display = "none";
        return;
      }

      var rect = canvas.getBoundingClientRect();
      var mx = e.clientX - rect.left;
      var my = e.clientY - rect.top;
      var mg = plot.mg;

      // Check if mouse is within plot area
      if (mx < mg.left || mx > mg.left + plot.plotW ||
          my < mg.top  || my > mg.top + plot.plotH) {
        tooltip.style.display = "none";
        return;
      }

      // Convert pixel to time
      var t = plot.tMin + (mx - mg.left) / plot.plotW * (plot.tMax - plot.tMin);
      var tMs = Math.round(t * 1000);

      // Find sample index
      var sampleIdx = Math.round((t + PRE) * SR);
      if (sampleIdx < 0 || sampleIdx >= N) {
        tooltip.style.display = "none";
        return;
      }

      // Build tooltip text
      var lines = ["<b>" + tMs + " ms</b>"];
      for (var i = 0; i < plot.waveforms.length; i++) {
        var wf = plot.waveforms[i];
        if (!wf.data || !wf.label) continue;
        var val = wf.data[sampleIdx].toFixed(2);
        lines.push('<span style="color:' + wf.color + '">\u25CF ' + wf.label + ": " + val + " \u03bcV</span>");
      }

      tooltip.innerHTML = lines.join("<br>");
      tooltip.style.display = "block";

      // Position tooltip
      var tipX = mx + 12;
      var tipY = my - 10;
      if (tipX + tooltip.offsetWidth > rect.width - 5) {
        tipX = mx - tooltip.offsetWidth - 12;
      }
      tooltip.style.left = tipX + "px";
      tooltip.style.top  = tipY + "px";

      // Draw crosshair
      render(); // Redraw base first
      var dpr = window.devicePixelRatio || 1;
      var ctx = canvas.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.save();
      ctx.setLineDash([2, 3]);
      ctx.strokeStyle = "rgba(200,216,232,0.3)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(mx, mg.top);
      ctx.lineTo(mx, mg.top + plot.plotH);
      ctx.stroke();
      ctx.restore();

      // Draw dots on each waveform at this time point
      for (var j = 0; j < plot.waveforms.length; j++) {
        var wf2 = plot.waveforms[j];
        if (!wf2.data) continue;
        var py = plot.toY(wf2.data[sampleIdx]);
        ctx.beginPath();
        ctx.arc(mx, py, 4, 0, 2 * Math.PI);
        ctx.fillStyle = wf2.color;
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    });

    canvas.addEventListener("mouseleave", function () {
      tooltip.style.display = "none";
      render(); // Remove crosshair
    });
  }

  // =====================================================================
  // NAVIGATION
  // =====================================================================
  function goToStep(step) {
    state.step = step;
    if (step >= 1 && !state.data) generateData();

    document.querySelectorAll(".erp-step-btn").forEach(function (btn) {
      btn.classList.toggle("active", parseInt(btn.dataset.step) === step);
    });

    var container    = getEl("erp-container");
    var startScreen  = getEl("erp-start-screen");
    var vizArea      = getEl("erp-viz-area");
    var controlsArea = getEl("erp-controls-area");

    if (container)    container.classList.toggle("erp-active", step >= 1);
    if (startScreen)  startScreen.style.display  = step === 0 ? "flex" : "none";
    if (vizArea)      vizArea.style.display       = step >= 1 ? "flex" : "none";
    if (controlsArea) controlsArea.style.display  = step >= 1 ? "flex" : "none";

    var infoEl = getEl("erp-info-text");
    if (infoEl) {
      infoEl.innerHTML    = STEP_INFO[step] || "";
      infoEl.style.display = step >= 1 ? "block" : "none";
    }

    var nCtrl = getEl("erp-ntrials-control");
    if (nCtrl) nCtrl.style.display = step >= 2 ? "flex" : "none";

    var magCtrl = getEl("erp-magnitude-control");
    if (magCtrl) magCtrl.style.display = step >= 2 ? "flex" : "none";

    resizeCanvases();
    render();
  }

  // =====================================================================
  // INIT
  // =====================================================================
  function init() {
    if (!getEl("erp-container")) return;

    document.querySelectorAll(".erp-step-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        goToStep(parseInt(btn.dataset.step));
      });
    });

    var startBtn = getEl("erp-start-btn");
    if (startBtn) startBtn.addEventListener("click", function () { goToStep(1); });

    // Trials slider
    var slider = getEl("erp-ntrials");
    var valEl  = getEl("erp-ntrials-val");
    if (slider) {
      slider.addEventListener("input", function () {
        state.nTrials = parseInt(this.value);
        if (valEl) valEl.textContent = this.value;
        setRangeFill(slider);
        state.data = null;
        generateData();
        render();
      });
      setRangeFill(slider);
    }

    // Magnitude slider
    var magSlider = getEl("erp-magnitude");
    var magValEl  = getEl("erp-magnitude-val");
    if (magSlider) {
      magSlider.addEventListener("input", function () {
        state.magnitude = parseFloat(this.value);
        if (magValEl) magValEl.textContent = parseFloat(this.value).toFixed(1);
        setRangeFill(magSlider);
        state.data = null;
        generateData();
        render();
      });
      setRangeFill(magSlider);
    }

    window.addEventListener("resize", function () { resizeCanvases(); render(); });

    // Re-render when theme toggles
    new MutationObserver(function () { render(); })
      .observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    // Setup tooltips on ERP plot canvases
    var mainCanvas = getEl("erp-canvas-main");
    var leftCanvas = getEl("erp-canvas-left");
    if (mainCanvas) setupTooltip(mainCanvas);
    if (leftCanvas) setupTooltip(leftCanvas);
  }

  function setRangeFill(slider) {
    var min = parseFloat(slider.min || "0");
    var max = parseFloat(slider.max || "100");
    var val = parseFloat(slider.value || "0");
    var pct = max > min ? ((val - min) / (max - min)) * 100 : 0;
    slider.style.setProperty("--erp-range-fill", pct + "%");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
