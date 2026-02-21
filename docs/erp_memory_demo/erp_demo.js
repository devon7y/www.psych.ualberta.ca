/**
 * ERP Effects in Memory: SME, RSE, and Old/New Effect
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
  // ERP TEMPLATE GENERATION
  // =====================================================================
  // Gaussian bump: amp * exp(-0.5 * ((t - center) / width)^2)
  function gauss(t, center, width, amp) {
    return amp * Math.exp(-0.5 * Math.pow((t - center) / width, 2));
  }

  // Returns a function(t_sec) -> voltage (μV), t relative to stimulus onset
  function makeTemplate(type) {
    return function (t) {
      var v = 0;
      // Early sensory components (shared across all conditions)
      v += gauss(t, 0.10, 0.028, -0.7); // N1
      v += gauss(t, 0.20, 0.042, 0.55); // P2

      if (type === "sme_hit") {
        v += gauss(t, 0.55, 0.10,  1.6);  // LPC large for hits
        if (t > 0.70) v += 0.9 * (1 - Math.exp(-(t - 0.70) / 0.15))
                               * Math.exp(-(t - 0.70) / 0.9) + 0.35; // Slow Wave

      } else if (type === "sme_miss") {
        v += gauss(t, 0.55, 0.10,  0.25); // LPC small for misses
        if (t > 0.70) v += 0.08 * (1 - Math.exp(-(t - 0.70) / 0.15))
                               * Math.exp(-(t - 0.70) / 0.9) - 0.08; // little SW

      } else if (type === "one_hit_fz") {
        v += gauss(t, 0.40, 0.085, 0.80); // FN400: hits more positive
        v += gauss(t, 0.70, 0.12,  0.40);

      } else if (type === "one_cr_fz") {
        v += gauss(t, 0.40, 0.085, -0.42); // FN400: CRs more negative
        v += gauss(t, 0.70, 0.12,   0.05);

      } else if (type === "one_hit_pz") {
        v += gauss(t, 0.65, 0.12,  0.90); // Left Parietal Positivity
        if (t > 0.50 && t < 1.05) v += 0.38;

      } else if (type === "one_cr_pz") {
        v += gauss(t, 0.65, 0.12,  0.06);

      } else if (type === "rse_hit_fz") {
        v += gauss(t, 0.40, 0.085, 0.85); // RSE-FN400
        v += gauss(t, 0.70, 0.12,  0.50);

      } else if (type === "rse_miss_fz") {
        v += gauss(t, 0.40, 0.085, -0.28);
        v += gauss(t, 0.70, 0.12,   0.10);

      } else if (type === "rse_hit_pz") {
        v += gauss(t, 0.65, 0.12,  0.85); // RSE-LPP
        if (t > 0.50 && t < 1.05) v += 0.32;

      } else if (type === "rse_miss_pz") {
        v += gauss(t, 0.65, 0.12,  0.12);
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

  function diffWave(a, b) {
    var d = new Float64Array(N);
    for (var i = 0; i < N; i++) d[i] = a[i] - b[i];
    return d;
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
  // regions: [{t0, t1, color, label, labelColor}]
  function drawERPPlot(ctx, W, H, waveforms, opts) {
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

    // Title
    if (opts.title) {
      txt(ctx, opts.title, W / 2, mg.top / 2, {
        font: 'bold 12px "Inter", sans-serif', align: "center"
      });
    }
    // Electrode label (top-right)
    if (opts.electrode) {
      txt(ctx, "Electrode " + opts.electrode, W - mg.right - 2, mg.top / 2, {
        font: '10px "Inter", sans-serif', align: "right", color: c.textDim
      });
    }

    // Highlighted regions (drawn first, under waveforms)
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

    // Time-tick labels and marks
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

    // Baseline (0 μV)
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

    // Region labels (inside highlight band, at top)
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

    // Legend (top-right area, skip if hideLegend)
    if (!opts.hideLegend) {
      var legX = W - mg.right - 2;
      var legY = mg.top + 6;
      for (var li = 0; li < waveforms.length; li++) {
        var lw = waveforms[li];
        if (!lw.label) continue;
        // Measure text width to right-align properly
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

    // Head circle
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

  // Standard electrode set for this demo
  var ELECTRODES = [
    { id: "Fz", rx:  0.00, ry: -0.55 },
    { id: "Cz", rx:  0.00, ry:  0.00 },
    { id: "Pz", rx:  0.00, ry:  0.50 },
    { id: "P3", rx: -0.38, ry:  0.52 },
  ];

  // =====================================================================
  // STATE
  // =====================================================================
  var state = {
    step:    0,
    nTrials: 30,
    data:    null,
  };

  function generateData() {
    var n = state.nTrials;
    state.data = {
      sme_hit:     makeERP(makeTemplate("sme_hit"),     n, 1001),
      sme_miss:    makeERP(makeTemplate("sme_miss"),    n, 2001),
      one_hit_fz:  makeERP(makeTemplate("one_hit_fz"), n, 3001),
      one_cr_fz:   makeERP(makeTemplate("one_cr_fz"),  n, 4001),
      one_hit_pz:  makeERP(makeTemplate("one_hit_pz"), n, 5001),
      one_cr_pz:   makeERP(makeTemplate("one_cr_pz"),  n, 6001),
      rse_hit_fz:  makeERP(makeTemplate("rse_hit_fz"), n, 7001),
      rse_miss_fz: makeERP(makeTemplate("rse_miss_fz"),n, 8001),
      rse_hit_pz:  makeERP(makeTemplate("rse_hit_pz"), n, 9001),
      rse_miss_pz: makeERP(makeTemplate("rse_miss_pz"),n, 10001),
    };
  }

  // =====================================================================
  // STEP 1: THE EXPERIMENT
  // =====================================================================
  function drawStep1Main(canvas) {
    var r = setupCtx(canvas); var ctx = r.ctx, W = r.W, H = r.H;
    var c = C();

    txt(ctx, "The Recognition Memory Experiment", W / 2, 16, {
      font: 'bold 13px "Inter", sans-serif', align: "center"
    });

    var phases = [
      { label: "Study Phase", words: ["CHAPTER", "ARTIST", "MOTOR"],
        color: "#5b8fd9", note: "25 words · 1500 ms each\nEEG recorded" },
      { label: "Distractor Task", words: ["5+6\u22123=?", "9\u22125+2=?", "4+7\u22121=?"],
        color: "#f5a623", note: "5 equations\nPrevents rehearsal" },
      { label: "Test Phase", words: ["CHAPTER", "MERCY", "ARTIST"],
        color: "#4CAF50", note: "50 probes\n25 old + 25 new\nEEG recorded" },
    ];

    var gap    = 14;
    var boxW   = Math.floor((W - 30 - gap * 2) / 3);
    var boxH   = H - 46;
    var startX = 15;
    var boxY   = 32;

    for (var i = 0; i < phases.length; i++) {
      var ph = phases[i];
      var bx = startX + i * (boxW + gap);

      // Box border
      roundRect(ctx, bx, boxY, boxW, boxH, 7);
      ctx.fillStyle   = c.canvasBg;
      ctx.fill();
      ctx.strokeStyle = ph.color;
      ctx.lineWidth   = 1.8;
      ctx.stroke();

      // Phase label bar
      ctx.fillStyle = ph.color + "33";
      ctx.fillRect(bx + 1, boxY + 1, boxW - 2, 22);
      txt(ctx, ph.label, bx + boxW / 2, boxY + 12, {
        font: 'bold 10.5px "Inter", sans-serif', align: "center", color: ph.color
      });

      // Words
      var wy = boxY + 38;
      for (var w = 0; w < ph.words.length; w++) {
        txt(ctx, ph.words[w], bx + boxW / 2, wy + w * 28, {
          font: '10px "Times New Roman", serif', align: "center"
        });
      }

      // Notes
      var noteLines = ph.note.split("\n");
      for (var nl = 0; nl < noteLines.length; nl++) {
        txt(ctx, noteLines[nl], bx + boxW / 2, boxY + boxH - 20 + nl * 13, {
          font: '8px "Inter", sans-serif', align: "center", color: c.textDim
        });
      }

      // Arrow
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

    txt(ctx, "Three ERP Effects", W / 2, 16, {
      font: 'bold 12px "Inter", sans-serif', align: "center"
    });

    var effects = [
      { abbr: "SME", name: "Subsequent Memory Effect",
        phase: "Study phase", color: c.hits,
        lines: ["Brain activity during study", "differs between items later",
                "remembered vs. forgotten."] },
      { abbr: "ONE", name: "Old/New Effect",
        phase: "Test phase", color: "#5b8fd9",
        lines: ["Brain activity during test", "differs between correctly",
                "identified old vs. new items."] },
      { abbr: "RSE", name: "Retrieval Success Effect",
        phase: "Test phase", color: c.diff,
        lines: ["Brain activity during test", "differs between hits (correct)",
                "and misses (incorrect) on old items."] },
    ];

    var rowH = Math.floor((H - 36) / 3);
    for (var i = 0; i < effects.length; i++) {
      var e  = effects[i];
      var ry = 32 + i * rowH;

      roundRect(ctx, 6, ry, W - 12, rowH - 6, 5);
      ctx.fillStyle = e.color + "18"; ctx.fill();
      ctx.strokeStyle = e.color; ctx.lineWidth = 1; ctx.stroke();

      txt(ctx, e.abbr, 16, ry + 14, {
        font: 'bold 14px "Inter", sans-serif', color: e.color
      });
      txt(ctx, e.name, 16, ry + 30, {
        font: 'bold 8.5px "Inter", sans-serif', color: e.color
      });
      txt(ctx, "(" + e.phase + ")", 16, ry + 42, {
        font: 'italic 8px "Inter", sans-serif', color: c.textDim
      });
      for (var li = 0; li < e.lines.length; li++) {
        txt(ctx, e.lines[li], 16, ry + 56 + li * 13, {
          font: '8.5px "Inter", sans-serif', color: c.text
        });
      }
    }
  }

  function drawStep1Right(canvas) {
    var r = setupCtx(canvas); var ctx = r.ctx, W = r.W, H = r.H;
    var c = C();

    txt(ctx, "EEG Electrode Locations", W / 2, 16, {
      font: 'bold 12px "Inter", sans-serif', align: "center"
    });

    drawHeadDiagram(ctx, W, H - 60, ELECTRODES, "");

    var notes = [
      { label: "Fz", desc: "Frontal midline \u2014 FN400 (ONE, RSE)", color: "#5b8fd9" },
      { label: "Pz", desc: "Parietal midline \u2014 LPC & Slow Wave (SME)", color: c.hits },
      { label: "P3", desc: "Left parietal \u2014 LPP (ONE, RSE)", color: c.diff },
    ];
    var ny = H - 52;
    for (var ni = 0; ni < notes.length; ni++) {
      var dotX = 14;
      ctx.beginPath(); ctx.arc(dotX, ny + ni * 16, 4, 0, 2 * Math.PI);
      ctx.fillStyle = notes[ni].color; ctx.fill();
      txt(ctx, notes[ni].label + ": " + notes[ni].desc, dotX + 10, ny + ni * 16, {
        font: '8.5px "Inter", sans-serif', color: c.textDim
      });
    }
  }

  // =====================================================================
  // STEP 2: STUDY ERPs (raw, no highlight)
  // =====================================================================
  function drawStep2Main(canvas) {
    var r = setupCtx(canvas); var ctx = r.ctx, W = r.W, H = r.H;
    if (!state.data) return;
    var c = C();
    drawERPPlot(ctx, W, H, [
      { data: state.data.sme_hit,  color: c.hits,   label: "Later Remembered (Hits)",   lineWidth: 2.2 },
      { data: state.data.sme_miss, color: c.misses, label: "Later Forgotten (Misses)",   lineWidth: 2.2, dash: [6, 3] },
    ], { title: "Study-Phase ERPs", electrode: "Pz", yMin: -2, yMax: 2.5 });
  }

  function drawStep2Left(canvas) {
    var r = setupCtx(canvas); var ctx = r.ctx, W = r.W, H = r.H;
    var c = C();
    txt(ctx, "Electrode Pz", W / 2, 14, {
      font: 'bold 11px "Inter", sans-serif', align: "center"
    });
    drawHeadDiagram(ctx, W, H - 20, ELECTRODES, "Pz");
    txt(ctx, "Active: Pz (parietal midline)", W / 2, H - 8, {
      font: '8.5px "Inter", sans-serif', align: "center", color: c.textDim
    });
  }

  function drawStep2Right(canvas) {
    var r = setupCtx(canvas); var ctx = r.ctx, W = r.W, H = r.H;
    var c = C();

    txt(ctx, "Subsequent Memory Effect", W / 2, 16, {
      font: 'bold 11px "Inter", sans-serif', align: "center", color: c.hits
    });

    var lines = [
      { t: "During the study phase, EEG" },
      { t: "is recorded as each word" },
      { t: "appears on screen." },
      { t: "" },
      { t: "After the test, we sort the" },
      { t: "study trials by outcome:" },
      { t: "" },
      { t: "Hits", bold: true, color: c.hits },
      { t: "Items later correctly" },
      { t: "recognized as \u201Cold\u201D." },
      { t: "" },
      { t: "Misses", bold: true, color: c.misses },
      { t: "Items later incorrectly" },
      { t: "called \u201Cnew\u201D (forgotten)." },
      { t: "" },
      { t: "Notice the waveforms" },
      { t: "diverge after ~400 ms!" },
    ];

    var ly = 36;
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i];
      if (!l.t) { ly += 5; continue; }
      txt(ctx, l.t, 12, ly, {
        font: (l.bold ? "bold " : "") + '9.5px "Inter", sans-serif',
        color: l.color || c.text
      });
      ly += 14;
    }
  }

  // =====================================================================
  // STEP 3: SME HIGHLIGHTED
  // =====================================================================
  function drawStep3Main(canvas) {
    var r = setupCtx(canvas); var ctx = r.ctx, W = r.W, H = r.H;
    if (!state.data) return;
    var c = C();
    drawERPPlot(ctx, W, H, [
      { data: state.data.sme_hit,  color: c.hits,   label: "Hits",         lineWidth: 2.2 },
      { data: state.data.sme_miss, color: c.misses, label: "Misses",        lineWidth: 2.2, dash: [6, 3] },
      { data: diffWave(state.data.sme_hit, state.data.sme_miss),
        color: c.diff, label: "Hits \u2212 Misses (SME)", lineWidth: 1.8, dash: [3, 2] },
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
      font: 'bold 11px "Inter", sans-serif', align: "center"
    });
    drawHeadDiagram(ctx, W, H - 20, ELECTRODES, "Pz");
    txt(ctx, "Active: Pz (parietal midline)", W / 2, H - 8, {
      font: '8.5px "Inter", sans-serif', align: "center", color: c.textDim
    });
  }

  function drawStep3Right(canvas) {
    var r = setupCtx(canvas); var ctx = r.ctx, W = r.W, H = r.H;
    var c = C();

    txt(ctx, "SME Components at Pz", W / 2, 14, {
      font: 'bold 11px "Inter", sans-serif', align: "center"
    });

    var items = [
      { label: "Late Positive Component (LPC)", color: "#5b8fd9",
        time: "400\u2013700 ms", site: "Pz",
        lines: ["Larger for hits.", "Linked to familiarity and",
                "early recollection processes."] },
      { label: "Slow Wave", color: "#4CAF50",
        time: "700\u20131200 ms", site: "Pz",
        lines: ["Sustained positivity for hits.", "Linked to elaborative",
                "encoding and context retrieval."] },
      { label: "Difference Wave (SME)", color: c.diff,
        time: "400\u20131200 ms", site: "Pz",
        lines: ["Hits \u2212 Misses: shows which EEG", "activity predicts later",
                "memory success."] },
    ];

    var y = 30;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var boxH = 78;
      roundRect(ctx, 5, y, W - 10, boxH, 5);
      ctx.fillStyle = it.color + "18"; ctx.fill();
      ctx.strokeStyle = it.color; ctx.lineWidth = 1; ctx.stroke();

      txt(ctx, it.label, 13, y + 13, {
        font: 'bold 9px "Inter", sans-serif', color: it.color
      });
      txt(ctx, it.time + "  \u00B7  " + it.site, 13, y + 25, {
        font: '8px "Inter", sans-serif', color: c.textDim
      });
      for (var li = 0; li < it.lines.length; li++) {
        txt(ctx, it.lines[li], 13, y + 38 + li * 13, {
          font: '8.5px "Inter", sans-serif', color: c.text
        });
      }
      y += boxH + 6;
    }
  }

  // =====================================================================
  // STEP 4: TEST ERPs — OLD/NEW (raw, no highlight)
  // =====================================================================
  function drawStep4Main(canvas) {
    var r = setupCtx(canvas); var ctx = r.ctx, W = r.W, H = r.H;
    if (!state.data) return;
    var c = C();
    drawERPPlot(ctx, W, H, [
      { data: state.data.one_hit_fz, color: c.hits,     label: "Hits (Old)",              lineWidth: 2.2 },
      { data: state.data.one_cr_fz,  color: c.newItems, label: "Correct Rejections (New)", lineWidth: 2.2, dash: [6, 3] },
    ], { title: "Test-Phase ERPs: Old vs. New", electrode: "Fz", yMin: -2, yMax: 2.5 });
  }

  function drawStep4Left(canvas) {
    var r = setupCtx(canvas); var ctx = r.ctx, W = r.W, H = r.H;
    if (!state.data) return;
    var c = C();
    drawERPPlot(ctx, W, H, [
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

    txt(ctx, "Old/New Effect", W / 2, 16, {
      font: 'bold 11px "Inter", sans-serif', align: "center", color: "#5b8fd9"
    });

    var lines = [
      { t: "During the test phase, each" },
      { t: "probe is either old (studied)" },
      { t: "or new (unstudied)." },
      { t: "" },
      { t: "We compare ERPs for:" },
      { t: "" },
      { t: "Hits", bold: true, color: c.hits },
      { t: "Old items correctly called" },
      { t: "\u201Cold\u201D (recognized)." },
      { t: "" },
      { t: "Correct Rejections (CRs)", bold: true, color: c.newItems },
      { t: "New items correctly called" },
      { t: "\u201Cnew\u201D (rejected)." },
      { t: "" },
      { t: "Top: Fz (frontal)" },
      { t: "Bottom: Pz (parietal)" },
      { t: "" },
      { t: "Two effects emerge in" },
      { t: "different time windows!" },
    ];

    var ly = 34;
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i];
      if (!l.t) { ly += 5; continue; }
      txt(ctx, l.t, 12, ly, {
        font: (l.bold ? "bold " : "") + '9.5px "Inter", sans-serif',
        color: l.color || c.text
      });
      ly += 14;
    }
  }

  // =====================================================================
  // STEP 5: OLD/NEW EFFECT HIGHLIGHTED
  // =====================================================================
  function drawStep5Main(canvas) {
    var r = setupCtx(canvas); var ctx = r.ctx, W = r.W, H = r.H;
    if (!state.data) return;
    var c = C();
    drawERPPlot(ctx, W, H, [
      { data: state.data.one_hit_fz, color: c.hits,     label: "Hits",             lineWidth: 2.2 },
      { data: state.data.one_cr_fz,  color: c.newItems, label: "Correct Rejections",lineWidth: 2.2, dash: [6, 3] },
      { data: diffWave(state.data.one_hit_fz, state.data.one_cr_fz),
        color: c.diff, label: "Hits \u2212 CRs (ONE)", lineWidth: 1.8, dash: [3, 2] },
    ], {
      title: "Old/New Effect — FN400 at Fz", electrode: "Fz",
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
    drawERPPlot(ctx, W, H, [
      { data: state.data.one_hit_pz, color: c.hits,     label: "Hits",             lineWidth: 2.2 },
      { data: state.data.one_cr_pz,  color: c.newItems, label: "Correct Rejections",lineWidth: 2.2, dash: [6, 3] },
      { data: diffWave(state.data.one_hit_pz, state.data.one_cr_pz),
        color: c.diff, label: "Hits \u2212 CRs (ONE)", lineWidth: 1.8, dash: [3, 2] },
    ], {
      title: "Old/New Effect — LPP at Pz", electrode: "Pz",
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

    txt(ctx, "Old/New Effect Components", W / 2, 14, {
      font: 'bold 11px "Inter", sans-serif', align: "center"
    });

    var items = [
      { label: "FN400", color: "#e07b39",
        time: "300\u2013500 ms", site: "Fz (frontal)",
        lines: ["Old items more positive.", "Reflects familiarity \u2014 the",
                "automatic sense of having", "seen an item before."] },
      { label: "Left Parietal Positivity (LPP)", color: "#5b8fd9",
        time: "500\u2013800 ms", site: "Pz / P3 (parietal)",
        lines: ["Old items more positive.", "Reflects recollection \u2014",
                "retrieval of contextual detail", "from the study episode."] },
    ];

    var y = 30;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var boxH = 88;
      roundRect(ctx, 5, y, W - 10, boxH, 5);
      ctx.fillStyle = it.color + "18"; ctx.fill();
      ctx.strokeStyle = it.color; ctx.lineWidth = 1; ctx.stroke();

      txt(ctx, it.label, 13, y + 13, {
        font: 'bold 9px "Inter", sans-serif', color: it.color
      });
      txt(ctx, it.time + "  \u00B7  " + it.site, 13, y + 25, {
        font: '8px "Inter", sans-serif', color: c.textDim
      });
      for (var li = 0; li < it.lines.length; li++) {
        txt(ctx, it.lines[li], 13, y + 38 + li * 13, {
          font: '8.5px "Inter", sans-serif', color: c.text
        });
      }
      y += boxH + 8;
    }

    txt(ctx, "FN400 = familiarity, LPP = recollection", W / 2, r.H - 10, {
      font: 'italic 8.5px "Inter", sans-serif', align: "center", color: c.textDim
    });
  }

  // =====================================================================
  // STEP 6: RETRIEVAL SUCCESS EFFECT
  // =====================================================================
  function drawStep6Main(canvas) {
    var r = setupCtx(canvas); var ctx = r.ctx, W = r.W, H = r.H;
    if (!state.data) return;
    var c = C();
    drawERPPlot(ctx, W, H, [
      { data: state.data.rse_hit_fz,  color: c.hits,   label: "Hits (recognized)",    lineWidth: 2.2 },
      { data: state.data.rse_miss_fz, color: c.misses, label: "Misses (forgotten)",    lineWidth: 2.2, dash: [6, 3] },
      { data: diffWave(state.data.rse_hit_fz, state.data.rse_miss_fz),
        color: c.diff, label: "Hits \u2212 Misses (RSE)", lineWidth: 1.8, dash: [3, 2] },
    ], {
      title: "Retrieval Success Effect — FN400 at Fz", electrode: "Fz",
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
    drawERPPlot(ctx, W, H, [
      { data: state.data.rse_hit_pz,  color: c.hits,   label: "Hits",              lineWidth: 2.2 },
      { data: state.data.rse_miss_pz, color: c.misses, label: "Misses",             lineWidth: 2.2, dash: [6, 3] },
      { data: diffWave(state.data.rse_hit_pz, state.data.rse_miss_pz),
        color: c.diff, label: "Hits \u2212 Misses (RSE)", lineWidth: 1.8, dash: [3, 2] },
    ], {
      title: "Retrieval Success Effect — LPP at Pz", electrode: "Pz",
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

    txt(ctx, "Retrieval Success Effect", W / 2, 16, {
      font: 'bold 11px "Inter", sans-serif', align: "center", color: c.diff
    });

    var lines = [
      { t: "The RSE uses only old items" },
      { t: "at test, split by outcome:" },
      { t: "" },
      { t: "Hits", bold: true, color: c.hits },
      { t: "Old items correctly called" },
      { t: "\u201Cold\u201D \u2014 successful retrieval." },
      { t: "" },
      { t: "Misses", bold: true, color: c.misses },
      { t: "Old items incorrectly called" },
      { t: "\u201Cnew\u201D \u2014 retrieval failure." },
      { t: "" },
      { t: "Same FN400 and LPP" },
      { t: "components as the ONE," },
      { t: "confirming they track actual" },
      { t: "retrieval success \u2014 not just" },
      { t: "old-vs-new status." },
      { t: "" },
      { t: "SME LPC \u2194 RSE FN400:", bold: true, color: c.diff },
      { t: "Correlated across participants," },
      { t: "suggesting encoding and" },
      { t: "retrieval share processes." },
    ];

    var ly = 34;
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i];
      if (!l.t) { ly += 5; continue; }
      txt(ctx, l.t, 12, ly, {
        font: (l.bold ? "bold " : "") + '9.5px "Inter", sans-serif',
        color: l.color || c.text
      });
      ly += 14;
    }
  }

  // =====================================================================
  // STEP INFO TEXT
  // =====================================================================
  var STEP_INFO = [
    "",
    "<strong>Step 1: The Experiment.</strong> Participants study a list of words while EEG is recorded. After a brief distractor task (mental arithmetic, to prevent rehearsal), they complete a recognition test: each probe is either an old (studied) word or a new (unstudied) word, and participants judge whether each probe is \u201Cold\u201D or \u201Cnew.\u201D Three key ERP effects emerge \u2014 one at study (SME) and two at test (ONE and RSE) \u2014 each isolating a different aspect of memory function.",
    "<strong>Step 2: Study-Phase ERPs.</strong> While participants study each word, ERPs are recorded at electrode Pz. After the test, study trials are sorted by memory outcome into \u201Chits\u201D (later correctly recognized) and \u201Cmisses\u201D (later forgotten). The two waveforms start similarly but diverge after ~400 ms \u2014 this divergence during encoding predicts later memory success. Use the slider below to see how more trials clarify the effect.",
    "<strong>Step 3: Subsequent Memory Effect (SME).</strong> The SME is the difference in study-phase brain activity between items later remembered vs. forgotten. Two components stand out at electrode Pz: the <em>Late Positive Component (LPC)</em> at 400\u2013700 ms, associated with familiarity and early recollection; and the <em>Slow Wave</em> at 700\u20131200 ms, a sustained positivity linked to elaborative encoding. The yellow difference wave (Hits \u2212 Misses) isolates the effect. Chen et al. (2014) showed that the LPC at study correlates with the FN400 at test across participants, suggesting these components may tap overlapping processes.",
    "<strong>Step 4: Test-Phase ERPs \u2014 Old/New Effect.</strong> During the test phase, ERPs are recorded as participants judge each probe as old or new. By comparing correctly identified old items (hits) with correctly identified new items (correct rejections), we isolate brain activity related to successful recognition. Two components emerge: the FN400 at frontal electrode Fz and the Left Parietal Positivity at parietal electrode Pz.",
    "<strong>Step 5: Old/New Effect (ONE) Components.</strong> The ONE has two canonical components: the <em>FN400</em> (300\u2013500 ms, Fz) is enhanced for old items and is thought to reflect <em>familiarity</em> \u2014 a fast, strength-based signal that an item has been encountered before; the <em>Left Parietal Positivity (LPP)</em> (500\u2013800 ms, Pz/P3) is also enhanced for old items and is thought to reflect <em>recollection</em> \u2014 the conscious retrieval of specific contextual details from the study episode. These two components are widely interpreted within dual-process theory.",
    "<strong>Step 6: Retrieval Success Effect (RSE).</strong> The RSE contrasts hits vs. misses among old items only \u2014 isolating successful retrieval independent of old-vs-new status. The same FN400 and Left Parietal Positivity appear, confirming that these components genuinely track retrieval success. Importantly, Chen et al. (2014) found that the LPC at study (SME) and the FN400 at test (RSE) are correlated across participants \u2014 suggesting that effective encoding (indexed by a larger LPC) predicts effective familiarity-based retrieval (indexed by a larger FN400).",
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
      var dH    = 270;
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

    window.addEventListener("resize", function () { resizeCanvases(); render(); });

    // Re-render when theme toggles
    new MutationObserver(function () { render(); })
      .observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
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
