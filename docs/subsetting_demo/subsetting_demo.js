/**
 * Attentional Subsetting Theory Interactive Demo
 * Computational Memory Lab — University of Alberta
 *
 * Demonstrates how selective attention to feature subsets during encoding
 * explains recognition memory, list-strength effects, and production effects.
 *
 * References:
 *   Caplan (in press, JMP)
 *   Caplan & Guitard (2024)
 */
(function () {
  "use strict";

  // =====================================================================
  // CONFIG
  // =====================================================================
  const N_VIS = 16;   // Features shown visually per item
  const N_ITEMS = 5;  // Items in the study list
  // Visual subspaces (indices into N_VIS features)
  // Sizes reflect the paper: phonological and orthographic spaces are compact (~64 features
  // each in the model), semantic space is much larger (~512). Ratio here ≈ 2 : 2 : 12.
  const SUBSPACES = [
    { start: 0,  end: 2,  label: "Phon.",    hueBase: 10  },
    { start: 2,  end: 4,  label: "Orth.",    hueBase: 120 },
    { start: 4,  end: 16, label: "Semantic", hueBase: 210 },
  ];

  // =====================================================================
  // COLORS
  // =====================================================================
  const DARK = {
    canvasBg: "#141924",
    text:     "#c8d8e8",
    axes:     "#556677",
    label:    "#8899aa",
    grid:     "rgba(60,75,95,0.5)",
    unatt:    "#283a50",
    unattStr: "#4a6070",
    signal:   "#4CAF50",
    noise:    "#ff6b6b",
    memory:   "#f5a623",
    barS:     "#5b8fd9",
    barD:     "#e07b39",
    highlight:"#ffe066",
    subPhon:  "rgba(220,100,60,0.13)",
    subOrth:  "rgba(60,190,90,0.13)",
    subSem:   "rgba(70,130,255,0.13)",
    overlap:  "rgba(255,224,102,0.35)",
  };
  const LIGHT = Object.assign({}, DARK, {
    canvasBg: "#f7fafc",
    text:     "#2d3748",
    axes:     "#718096",
    label:    "#4a5568",
    grid:     "rgba(160,174,192,0.4)",
    unatt:    "#c4d0dc",
    unattStr: "#9aaabb",
    subPhon:  "rgba(200,80,40,0.09)",
    subOrth:  "rgba(40,160,70,0.09)",
    subSem:   "rgba(50,110,230,0.09)",
  });

  function C() {
    return document.documentElement.getAttribute("data-theme") === "light" ? LIGHT : DARK;
  }

  // =====================================================================
  // PRNG (Mulberry32 — seeded)
  // =====================================================================
  function rng32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(arr, rand) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // Generate N_ITEMS + 1 binary feature vectors (last one is lure)
  function genItems(seed) {
    const rand = rng32(seed);
    return Array.from({ length: N_ITEMS + 1 }, () =>
      Array.from({ length: N_VIS }, () => (rand() > 0.45 ? 1 : 0))
    );
  }

  // Generate item-specific attentional masks (Set of attended feature indices)
  function genMasks(seed, nC) {
    const rand = rng32(seed + 9999);
    return Array.from({ length: N_ITEMS }, () => {
      const idx = shuffle(Array.from({ length: N_VIS }, (_, k) => k), rand);
      return new Set(idx.slice(0, nC));
    });
  }

  // =====================================================================
  // MODEL EQUATIONS (Caplan, in press)
  // =====================================================================

  // d' for pure list with item-specific masking at test (Eq. 19)
  // nC: features encoded per item, L: list length, n: feature space size
  function dpPure(nC, L, n) {
    if (nC <= 0 || n <= 0 || L <= 0) return 0;
    const denom = 0.5 * (2 + (2 * L - 1) * (nC / n));
    return Math.sqrt(nC / Math.max(denom, 1e-9));
  }

  // d' for mixed list, probing condition X (nC_x features), other condition Y (nC_y)
  // Analogous to Eq. 19 but extended to two-condition mixed list:
  //   d' = sqrt(nC_x / (0.5 * (2 + (2*L_x - 1)*nC_x/n + 2*L_y*nC_y/n)))
  function dpMixed(nC_x, nC_y, L_x, L_y, n) {
    if (nC_x <= 0 || n <= 0) return 0;
    const denom = 0.5 * (2 + (2 * L_x - 1) * (nC_x / n) + 2 * L_y * (nC_y / n));
    return Math.sqrt(nC_x / Math.max(denom, 1e-9));
  }

  // Ratio-of-Ratios (Eq. 1): RoR ≈ 1 → null LSE; RoR > 1 → positive LSE; RoR < 1 → inverted LSE
  function computeRoR(nC_S, nC_D, L, n) {
    const hL = L / 2;
    const dpSP = dpPure(nC_S, L, n), dpDP = dpPure(nC_D, L, n);
    const dpSM = dpMixed(nC_S, nC_D, hL, hL, n);
    const dpDM = dpMixed(nC_D, nC_S, hL, hL, n);
    if (dpSP <= 0 || dpSM <= 0 || dpDP <= 0) return 1;
    return (dpDM / dpSM) / (dpDP / dpSP);
  }

  // =====================================================================
  // CANVAS UTILITIES
  // =====================================================================
  function setupCtx(canvas) {
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, W: canvas.width / dpr, H: canvas.height / dpr };
  }

  function clearCanvas(ctx, W, H) {
    ctx.fillStyle = C().canvasBg;
    ctx.fillRect(0, 0, W, H);
  }

  function txt(ctx, text, x, y, opts = {}) {
    const c = C();
    ctx.save();
    ctx.fillStyle = opts.color || c.text;
    ctx.font = opts.font || '11px "Inter",sans-serif';
    ctx.textAlign = opts.align || "left";
    ctx.textBaseline = opts.base || "middle";
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  // Hue for a feature index (matches SUBSPACES boundaries)
  function featureHue(f) {
    if (f < 2)  return 10 + f * 15;           // Phon. (f=0,1): warm orange-red
    if (f < 4)  return 110 + (f - 2) * 20;    // Orth. (f=2,3): yellow-green
    return 200 + (f - 4) * 10;                // Semantic (f=4-15): blue to purple
  }

  // Draw one feature dot
  // value: 1 = feature present (filled), 0 = feature absent (hollow outline), default 1
  function dot(ctx, x, y, r, f, attended, glowing, value = 1) {
    const c = C();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI);
    if (!attended) {
      ctx.fillStyle = c.unatt;
      ctx.fill();
      ctx.strokeStyle = c.unattStr;
      ctx.lineWidth = 0.5;
      ctx.stroke();
    } else if (value === 0) {
      // Attended but feature absent: hollow circle with muted outline
      const hue = featureHue(f);
      ctx.strokeStyle = `hsl(${hue},35%,42%)`;
      ctx.lineWidth = 1;
      ctx.stroke();
    } else {
      const hue = featureHue(f);
      ctx.fillStyle = `hsl(${hue},65%,60%)`;
      ctx.fill();
      if (glowing) {
        ctx.strokeStyle = C().highlight;
        ctx.lineWidth = 1.8;
        ctx.stroke();
      }
    }
  }

  // Draw a column of N_VIS feature dots for item[itemIdx]
  // mask: Set of attended feature indices (null = show all as attended)
  // glow: Set of features to highlight with border
  function drawColumn(ctx, items, itemIdx, mask, x, y0, r, rowH, glow) {
    const item = items[itemIdx];
    for (let f = 0; f < N_VIS; f++) {
      const cy = y0 + f * rowH + r;
      const att = !mask || mask.has(f);
      dot(ctx, x, cy, r, f, att, glow && glow.has(f), item[f]);
    }
  }

  // Draw subspace label bands behind the columns
  function drawSubspaceBands(ctx, x0, totalColsW, y0, rowH) {
    const c = C();
    for (const ss of SUBSPACES) {
      const sy = y0 + ss.start * rowH;
      const sh = (ss.end - ss.start) * rowH;
      ctx.fillStyle = ss.hueBase < 100 ? c.subPhon :
                      (ss.hueBase < 180 ? c.subOrth : c.subSem);
      ctx.fillRect(x0, sy, totalColsW, sh - 1);
      txt(ctx, ss.label, x0 - 4, sy + sh / 2, {
        font: '8px "Inter",sans-serif', align: "right", color: c.label
      });
    }
  }

  // =====================================================================
  // STEP 1: ITEM VECTORS
  // =====================================================================
  function drawStep1(canvas, state) {
    const { ctx, W, H } = setupCtx(canvas);
    const c = C();
    clearCanvas(ctx, W, H);
    const { items } = state;
    if (!items) return;

    const r = 4, gap = 1, rowH = r * 2 + gap;
    const colGap = 18, labelW = 44;
    const totalH = N_VIS * rowH;
    const colW = r * 2 + colGap;
    const startX = (W - labelW - N_ITEMS * colW + colGap) / 2 + labelW;
    const startY = Math.round((H - totalH) / 2) + 4;

    txt(ctx, "Items as feature vectors", W / 2, 12,
      { font: 'bold 12px "Inter",sans-serif', align: "center" });

    drawSubspaceBands(ctx, startX - labelW, labelW + N_ITEMS * colW, startY, rowH);

    for (let i = 0; i < N_ITEMS; i++) {
      const x = startX + i * colW + r;
      txt(ctx, "W" + (i + 1), x, startY - 9,
        { font: '9px "Inter",sans-serif', align: "center", color: c.label });
      drawColumn(ctx, items, i, null, x, startY, r, rowH, null);
    }

    // Right-side legend
    const legX = startX + N_ITEMS * colW + 22;
    const legItems = [
      { label: "Phonological", color: `hsl(${SUBSPACES[0].hueBase + 10},60%,58%)` },
      { label: "Orthographic", color: `hsl(${SUBSPACES[1].hueBase + 14},55%,55%)` },
      { label: "Semantic",     color: `hsl(${SUBSPACES[2].hueBase + 18},65%,58%)` },
    ];
    if (legX + 80 < W) {
      txt(ctx, "Subspaces:", legX, startY + 6,
        { font: 'bold 9px "Inter",sans-serif', color: c.label });
      legItems.forEach((li, k) => {
        const ly = startY + 20 + k * 16;
        ctx.beginPath();
        ctx.arc(legX + 5, ly, 4, 0, 2 * Math.PI);
        ctx.fillStyle = li.color; ctx.fill();
        txt(ctx, li.label, legX + 13, ly,
          { font: '9px "Inter",sans-serif', color: c.label });
      });
    }
  }

  // =====================================================================
  // STEP 2: ENCODING / ATTENTIONAL MASKING
  // =====================================================================
  function drawStep2(canvas, state) {
    const { ctx, W, H } = setupCtx(canvas);
    const c = C();
    clearCanvas(ctx, W, H);
    const { items, masks } = state;
    if (!items || !masks) return;

    const r = 4, gap = 1, rowH = r * 2 + gap;
    const colGap = 14, labelW = 44;
    const totalH = N_VIS * rowH;
    const colW = r * 2 + colGap;
    const memColX_offset = N_ITEMS * colW + 26;
    const startX = (W - labelW - memColX_offset - r * 2) / 2 + labelW;
    const startY = Math.round((H - totalH) / 2) + 4;

    txt(ctx, "Attentional masking: encoding only what attention notices", W / 2, 12,
      { font: 'bold 11px "Inter",sans-serif', align: "center" });

    drawSubspaceBands(ctx, startX - labelW, labelW + N_ITEMS * colW, startY, rowH);

    // Item columns with masks
    for (let i = 0; i < N_ITEMS; i++) {
      const x = startX + i * colW + r;
      txt(ctx, "W" + (i + 1), x, startY - 9,
        { font: '9px "Inter",sans-serif', align: "center", color: c.label });
      drawColumn(ctx, items, i, masks[i], x, startY, r, rowH, null);
    }

    // Arrow
    const arrowX = startX + N_ITEMS * colW + 6;
    const midY = startY + totalH / 2;
    ctx.save();
    ctx.strokeStyle = c.label; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(arrowX, midY); ctx.lineTo(arrowX + 14, midY); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(arrowX + 10, midY - 4); ctx.lineTo(arrowX + 14, midY); ctx.lineTo(arrowX + 10, midY + 4);
    ctx.stroke();
    ctx.restore();

    // Memory vector (union of attended features across items)
    const memX = arrowX + 22 + r;
    txt(ctx, "Memory", memX, startY - 9,
      { font: '9px "Inter",sans-serif', align: "center", color: c.memory });

    // Accumulate attended+present feature counts (m = Σ w_i ⊗ f_i: only value=1 features contribute)
    const memCount = new Array(N_VIS).fill(0);
    for (let i = 0; i < N_ITEMS; i++) {
      for (const f of masks[i]) {
        if (items[i][f] === 1) memCount[f]++;
      }
    }
    for (let f = 0; f < N_VIS; f++) {
      const cy = startY + f * rowH + r;
      if (memCount[f] > 0) {
        const hue = featureHue(f);
        const lt = 42 + Math.min(memCount[f] / N_ITEMS, 1) * 24;
        ctx.beginPath(); ctx.arc(memX, cy, r, 0, 2 * Math.PI);
        ctx.fillStyle = `hsl(${hue},68%,${lt}%)`;
        ctx.fill();
        ctx.strokeStyle = c.memory; ctx.lineWidth = 0.7; ctx.stroke();
      } else {
        ctx.beginPath(); ctx.arc(memX, cy, r, 0, 2 * Math.PI);
        ctx.fillStyle = c.unatt; ctx.fill();
        ctx.strokeStyle = c.unattStr; ctx.lineWidth = 0.5; ctx.stroke();
      }
    }

    // Legend: three dot states, horizontally centered at bottom
    const legY = H - 14;
    const legR = 4;
    const legendItems = [
      { draw: (x) => { ctx.beginPath(); ctx.arc(x, legY, legR, 0, 2*Math.PI); ctx.fillStyle = `hsl(30,65%,60%)`; ctx.fill(); }, label: "attended + present → encoded" },
      { draw: (x) => { ctx.beginPath(); ctx.arc(x, legY, legR, 0, 2*Math.PI); ctx.strokeStyle = `hsl(30,35%,42%)`; ctx.lineWidth = 1; ctx.stroke(); }, label: "attended + absent → not encoded" },
      { draw: (x) => { ctx.beginPath(); ctx.arc(x, legY, legR, 0, 2*Math.PI); ctx.fillStyle = c.unatt; ctx.fill(); ctx.strokeStyle = c.unattStr; ctx.lineWidth = 0.5; ctx.stroke(); }, label: "unnoticed by attention" },
    ];
    // Measure total width to centre the whole group
    const itemGap = 14;   // gap between dot and next dot
    const labelPad = 6;   // gap between dot and its label
    // Approximate label widths (9px font ≈ 5.5px/char)
    const charW = 5.5;
    const totalW = legendItems.reduce((acc, li, k) => {
      const lw = li.label.length * charW;
      return acc + legR * 2 + labelPad + lw + (k < legendItems.length - 1 ? itemGap : 0);
    }, 0);
    let lx = (W - totalW) / 2 + legR;
    legendItems.forEach(li => {
      li.draw(lx);
      txt(ctx, li.label, lx + legR + labelPad, legY,
        { font: '8px "Inter",sans-serif', color: c.label });
      const lw = li.label.length * charW;
      lx += legR * 2 + labelPad + lw + itemGap;
    });
  }

  // =====================================================================
  // STEP 3: RECOGNITION — PROBE MATCHING
  // Shows study items + memory on the left, then Target and Lure probe
  // columns simultaneously so both can be compared against the same memory.
  // =====================================================================
  function drawStep3(canvas, state) {
    const { ctx, W, H } = setupCtx(canvas);
    const c = C();
    clearCanvas(ctx, W, H);
    const { items, masks } = state;
    if (!items || !masks) return;

    const probeMask = masks[0]; // item-specific mask reiterated at test

    const r = 4, gap = 1, rowH = r * 2 + gap;
    const colGap = 14, labelW = 44;
    const totalH = N_VIS * rowH;
    const colW = r * 2 + colGap;
    const startY = Math.round((H - totalH) / 2) + 4;
    const midY = startY + totalH / 2;

    // Memory: accumulate attended+present features from all studied items
    const memCount = new Array(N_VIS).fill(0);
    for (let i = 0; i < N_ITEMS; i++) {
      for (const f of masks[i]) {
        if (items[i][f] === 1) memCount[f]++;
      }
    }

    // Gold-ring glow: attended AND present in probe AND stored in memory
    const targetGlow = new Set();
    const lureGlow   = new Set();
    for (const f of probeMask) {
      if (items[0][f]       === 1 && memCount[f] > 0) targetGlow.add(f);
      if (items[N_ITEMS][f] === 1 && memCount[f] > 0) lureGlow.add(f);
    }

    // Layout — centre the whole group in the canvas
    // Sections: [labelW] [5*colW] [26 arrow+gap] [r mem] [sepW] [r target] [sepW] [r lure] [statsGap] [statsWidth]
    const sepW = 62, statsGap = 16, statsWidth = 130;
    const totalW = labelW + 5 * colW + 26 + r + sepW + sepW + r + statsGap + statsWidth;
    const leftEdge = (W - totalW) / 2;
    const startX  = leftEdge + labelW;           // mirrors step-2 convention
    const memX    = startX + 5 * colW + 26 + r;  // centre of memory column dot
    const targetX = memX + sepW;
    const lureX   = targetX + sepW;
    const statsX  = lureX + r + statsGap;

    txt(ctx, "Recognition: target and lure vs. memory (gold ring = match)", W / 2, 12,
      { font: 'bold 11px "Inter",sans-serif', align: "center" });

    // Subspace bands behind study columns only
    drawSubspaceBands(ctx, startX - labelW, labelW + 5 * colW, startY, rowH);

    // Study columns with masks applied
    for (let i = 0; i < N_ITEMS; i++) {
      const x = startX + i * colW + r;
      txt(ctx, "W" + (i + 1), x, startY - 9,
        { font: '9px "Inter",sans-serif', align: "center", color: c.label });
      drawColumn(ctx, items, i, masks[i], x, startY, r, rowH, null);
    }

    // Arrow from W5 to memory
    const arrowX1 = startX + 4 * colW + r + 4;
    const arrowX2 = memX - r - 4;
    ctx.save();
    ctx.strokeStyle = c.label; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(arrowX1, midY); ctx.lineTo(arrowX2, midY); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(arrowX2 - 5, midY - 4); ctx.lineTo(arrowX2, midY); ctx.lineTo(arrowX2 - 5, midY + 4);
    ctx.stroke();
    ctx.restore();

    // Memory column (gold rings appear on probe columns, not here)
    txt(ctx, "Mem.", memX, startY - 9,
      { font: '9px "Inter",sans-serif', align: "center", color: c.memory });
    for (let f = 0; f < N_VIS; f++) {
      const cy = startY + f * rowH + r;
      if (memCount[f] > 0) {
        const hue = featureHue(f);
        ctx.beginPath(); ctx.arc(memX, cy, r, 0, 2 * Math.PI);
        ctx.fillStyle = `hsl(${hue},68%,${42 + Math.min(memCount[f] / N_ITEMS, 1) * 24}%)`;
        ctx.fill();
        ctx.strokeStyle = c.memory; ctx.lineWidth = 0.7; ctx.stroke();
      } else {
        ctx.beginPath(); ctx.arc(memX, cy, r, 0, 2 * Math.PI);
        ctx.fillStyle = c.unatt; ctx.fill();
        ctx.strokeStyle = c.unattStr; ctx.lineWidth = 0.5; ctx.stroke();
      }
    }

    // "vs." labels centred between adjacent columns
    txt(ctx, "vs.", (memX + targetX) / 2, startY - 9,
      { font: 'italic 9px "Inter",sans-serif', align: "center", color: c.label });
    txt(ctx, "vs.", (targetX + lureX) / 2, startY - 9,
      { font: 'italic 9px "Inter",sans-serif', align: "center", color: c.label });

    // Target probe column
    txt(ctx, "Target", targetX, startY - 9,
      { font: '9px "Inter",sans-serif', align: "center", color: c.signal });
    for (let f = 0; f < N_VIS; f++) {
      const cy = startY + f * rowH + r;
      const att = probeMask.has(f);
      dot(ctx, targetX, cy, r, f, att, att && targetGlow.has(f), items[0][f]);
    }

    // Lure probe column
    txt(ctx, "Lure", lureX, startY - 9,
      { font: '9px "Inter",sans-serif', align: "center", color: c.noise });
    for (let f = 0; f < N_VIS; f++) {
      const cy = startY + f * rowH + r;
      const att = probeMask.has(f);
      dot(ctx, lureX, cy, r, f, att, att && lureGlow.has(f), items[N_ITEMS][f]);
    }

    // Stats panel
    const dpVal = dpPure(state.params.nC, N_ITEMS, state.params.n);
    txt(ctx, "Target:", statsX, midY - 22,
      { font: '10px "Inter",sans-serif', color: c.label });
    txt(ctx, targetGlow.size + " matches", statsX + 48, midY - 22,
      { font: 'bold 10px "Inter",sans-serif', color: c.signal });
    txt(ctx, "Lure:", statsX, midY - 6,
      { font: '10px "Inter",sans-serif', color: c.label });
    txt(ctx, lureGlow.size + " matches", statsX + 48, midY - 6,
      { font: 'bold 10px "Inter",sans-serif', color: c.noise });
    txt(ctx, "d\u2019 \u2248 " + dpVal.toFixed(2), statsX, midY + 12,
      { font: 'bold 11px "Inter",sans-serif', color: c.text });
    txt(ctx, "(pure list)", statsX, midY + 26,
      { font: '9px "Inter",sans-serif', color: c.label });
  }

  // =====================================================================
  // STEP 4: SPARSENESS — CROSS-TALK
  // =====================================================================
  function drawStep4(canvas, state) {
    const { ctx, W, H } = setupCtx(canvas);
    const c = C();
    clearCanvas(ctx, W, H);
    const { params } = state;
    const n = params.n, nC = params.nC;

    txt(ctx, "Feature space size controls cross-talk between items", W / 2, 14,
      { font: 'bold 11px "Inter",sans-serif', align: "center" });

    // Two side-by-side Venn diagrams: sparse (n=300) and dense (n=nC*3)
    const n_sparse = Math.max(n, nC * 8);
    const n_dense  = Math.max(nC + 2, Math.round(nC * 2.5));
    const scenarios = [
      { label: "Sparse (large n)", n_eff: n_sparse, col: c.signal, fillA: "rgba(76,175,80,0.3)", fillB: "rgba(91,143,217,0.3)" },
      { label: "Dense (small n)",  n_eff: n_dense,  col: c.noise,  fillA: "rgba(255,107,107,0.3)", fillB: "rgba(240,160,60,0.3)" },
    ];

    const panelW = (W - 20) / 2;
    for (let s = 0; s < 2; s++) {
      const sc = scenarios[s];
      const px = 10 + s * panelW;
      const cx = px + panelW / 2;
      const cy = H / 2 + 12;
      // Cap maxR so three label lines (n / d' / cross-talk) fit below the circle
      const maxR = Math.min(panelW * 0.34, H / 2 - 56);

      // Feature-space circle
      ctx.beginPath(); ctx.arc(cx, cy, maxR, 0, 2 * Math.PI);
      ctx.fillStyle = "rgba(80,100,140,0.12)"; ctx.fill();
      ctx.strokeStyle = c.axes; ctx.lineWidth = 1; ctx.stroke();

      // Mask radius proportional to sqrt(nC/n_eff)
      const maskR = maxR * Math.sqrt(nC / sc.n_eff);
      const sep = maskR * 0.7; // separation between mask centres

      // Mask A
      ctx.beginPath(); ctx.arc(cx - sep, cy, maskR, 0, 2 * Math.PI);
      ctx.fillStyle = sc.fillA; ctx.fill();
      ctx.strokeStyle = sc.col; ctx.lineWidth = 1.2; ctx.stroke();

      // Mask B
      ctx.beginPath(); ctx.arc(cx + sep, cy, maskR, 0, 2 * Math.PI);
      ctx.fillStyle = sc.fillB; ctx.fill();
      ctx.strokeStyle = sc.col; ctx.lineWidth = 1.2; ctx.stroke();

      // Labels
      txt(ctx, sc.label, cx, cy - maxR - 14,
        { font: '9px "Inter",sans-serif', align: "center", color: sc.col });
      // Overlap % (centre of Venn circles)
      const overlapPct = Math.min(nC / sc.n_eff * 100, 100).toFixed(1);
      txt(ctx, "Overlap ≈ " + overlapPct + "%", cx, cy,
        { font: 'bold 9px "Inter",sans-serif', align: "center", color: c.text });

      // Three stacked labels below the circle (n / d' / cross-talk interpretation)
      const dp = dpPure(nC, N_ITEMS, sc.n_eff);
      const lb = cy + maxR;
      txt(ctx, "n = " + sc.n_eff, cx, lb + 13,
        { font: '10px "Inter",sans-serif', align: "center", color: c.label });
      txt(ctx, "d' = " + dp.toFixed(2), cx, lb + 27,
        { font: 'bold 10px "Inter",sans-serif', align: "center", color: sc.col });
      txt(ctx, s === 0 ? "Low cross-talk → null LSE" : "High cross-talk → positive LSE",
        cx, lb + 41,
        { font: '8px "Inter",sans-serif', align: "center", color: c.label });
    }
  }

  // =====================================================================
  // STEP 5: RESULTS — PURE VS MIXED
  // =====================================================================
  function drawStep5(canvas, state) {
    const { ctx, W, H } = setupCtx(canvas);
    const c = C();
    clearCanvas(ctx, W, H);
    const { params } = state;
    const { nC_S, nC_D, n } = params;
    const L = 10, hL = 5;

    txt(ctx, "Pure vs. Mixed List Predictions", W / 2, 14,
      { font: 'bold 12px "Inter",sans-serif', align: "center" });
    txt(ctx, `S: nC=${nC_S}  D: nC=${nC_D}  Space: n=${n}`,
      W / 2, 28, { font: '10px "Inter",sans-serif', align: "center", color: c.label });

    const dpSP = dpPure(nC_S, L, n), dpDP = dpPure(nC_D, L, n);
    const dpSM = dpMixed(nC_S, nC_D, hL, hL, n);
    const dpDM = dpMixed(nC_D, nC_S, hL, hL, n);
    const ror  = computeRoR(nC_S, nC_D, L, n);

    // 2×2 table
    const tX = W / 2 - 90, tY = 40;
    const cW = 78, cH = 30;
    const headers = ["Pure", "Mixed"];
    const rowLabels = ["S", "D"];
    const vals = [[dpSP, dpSM], [dpDP, dpDM]];
    const rowColors = [c.barS, c.barD];

    // Column headers
    headers.forEach((h, j) => {
      txt(ctx, h, tX + cW + j * cW + cW / 2, tY + 10,
        { font: 'bold 10px "Inter",sans-serif', align: "center" });
    });
    // Row headers + cells
    rowLabels.forEach((rl, i) => {
      txt(ctx, rl, tX + 22, tY + cH + i * cH + cH / 2,
        { font: 'bold 11px "Inter",sans-serif', align: "center", color: rowColors[i] });
      vals[i].forEach((v, j) => {
        const cx2 = tX + cW + j * cW, cy2 = tY + cH + i * cH;
        ctx.strokeStyle = c.axes; ctx.lineWidth = 0.7;
        ctx.strokeRect(cx2 + 2, cy2 + 2, cW - 4, cH - 4);
        txt(ctx, v.toFixed(2), cx2 + cW / 2, cy2 + cH / 2,
          { font: 'bold 12px "Inter",sans-serif', align: "center", color: rowColors[i] });
      });
    });

    // RoR  (RoR < 1 → positive LSE; RoR ≈ 1 → null LSE)
    const rorColor = ror > 1.05 ? c.noise : (ror < 0.95 ? c.signal : c.label);
    const rorLabel = ror > 1.05 ? "List-strength effect present" : (ror < 0.95 ? "Inverted list-strength effect" : "No list-strength effect");
    const rorY = tY + 3 * cH + 12;
    txt(ctx, "RoR = " + ror.toFixed(3), W / 2, rorY,
      { font: 'bold 14px "Inter",sans-serif', align: "center", color: rorColor });
    txt(ctx, rorLabel, W / 2, rorY + 17,
      { font: '11px "Inter",sans-serif', align: "center", color: rorColor });
    const explain = ror > 1.05
      ? "Compact feature space \u2192 strong (D) items crowd the list, hurting weak (S) items"
      : (ror < 0.95
        ? "Inverted: weak (S) items benefit more from mixed lists than strong (D) items"
        : "Large feature space \u2192 list composition barely affects memory");
    txt(ctx, explain, W / 2, rorY + 33,
      { font: '9px "Inter",sans-serif', align: "center", color: c.label });
  }

  // =====================================================================
  // CHART CANVAS
  // =====================================================================
  function drawChart(canvas, state) {
    const { ctx, W, H } = setupCtx(canvas);
    const c = C();
    clearCanvas(ctx, W, H);
    const step = state.step;

    if (step === 1) {
      drawChartConcept(ctx, W, H);
    } else if (step === 2) {
      drawChartFeatureCloud(ctx, W, H, state);
    } else if (step === 3) {
      drawChartDistributions(ctx, W, H, state);
    } else if (step >= 4) {
      drawChartDPrime(ctx, W, H, state);
    }
  }

  function drawChartConcept(ctx, W, H) {
    const c = C();
    txt(ctx, "Feature Subspaces", W / 2, 18,
      { font: 'bold 11px "Inter",sans-serif', align: "center" });
    const items2 = [
      { label: "Phonological (sounds, prosody)", hue: 22 },
      { label: "Orthographic (spelling, shape)", hue: 127 },
      { label: "Semantic (meaning, associations)", hue: 219 },
    ];
    items2.forEach((it, k) => {
      const y = 52 + k * 28;
      ctx.beginPath(); ctx.arc(W / 2 - 85, y, 7, 0, 2 * Math.PI);
      ctx.fillStyle = `hsl(${it.hue},65%,58%)`; ctx.fill();
      txt(ctx, it.label, W / 2 - 74, y,
        { font: '10px "Inter",sans-serif', color: c.label });
    });
    const lines = [
      "Each word activates many features across",
      "these subspaces. Attention selects only",
      "a small subset (nC) to encode in memory.",
    ];
    lines.forEach((l, k) => {
      txt(ctx, l, W / 2, 136 + k * 16,
        { font: '10px "Inter",sans-serif', align: "center", color: c.label });
    });
  }

  function drawChartFeatureCloud(ctx, W, H, state) {
    const c = C();
    const { nC, n } = state.params;
    txt(ctx, "Feature Space: " + n + " total, " + nC + " attended", W / 2, 18,
      { font: 'bold 11px "Inter",sans-serif', align: "center" });
    // Draw dots representing the n feature space, nC colored
    const r = 5, padH = 36, padV = 36;
    const aw = W - padH * 2, ah = H - padV * 2;
    const rand = rng32(77);
    const show = Math.min(n, 120);
    for (let i = 0; i < show; i++) {
      const x = padH + rand() * aw;
      const y = padV + rand() * ah;
      const att = i < nC;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI);
      if (att) {
        ctx.fillStyle = `hsl(${(i / nC) * 280 + 10},65%,60%)`;
        ctx.fill();
      } else {
        ctx.fillStyle = c.unatt; ctx.fill();
        ctx.strokeStyle = c.unattStr; ctx.lineWidth = 0.5; ctx.stroke();
      }
    }
    if (n > show) {
      txt(ctx, "…+" + (n - show) + " more features", W / 2, H - 14,
        { font: '9px "Inter",sans-serif', align: "center", color: c.label });
    }
  }

  function drawChartDistributions(ctx, W, H, state) {
    const c = C();
    const { nC, n } = state.params;
    const dp = dpPure(nC, N_ITEMS, n);
    const margin = { t: 32, r: 15, b: 38, l: 42 };
    const pW = W - margin.l - margin.r, pH = H - margin.t - margin.b;

    txt(ctx, "Signal vs. Noise Distributions", margin.l + pW / 2, 16,
      { font: 'bold 11px "Inter",sans-serif', align: "center" });

    const xMin = -3.5, xMax = dp + 3.5;
    function toX(v) { return margin.l + (v - xMin) / (xMax - xMin) * pW; }
    function gauss(x, mu) { return Math.exp(-0.5 * (x - mu) * (x - mu)) / Math.sqrt(2 * Math.PI); }
    const yMax = gauss(0, 0) * 1.15;
    function toY(v) { return margin.t + pH - v / yMax * pH; }

    const drawDist = (mu, color, fill) => {
      ctx.beginPath();
      let first = true;
      for (let x = xMin; x <= xMax; x += 0.06) {
        const px = toX(x), py = toY(gauss(x, mu));
        first ? (ctx.moveTo(px, py), first = false) : ctx.lineTo(px, py);
      }
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(toX(xMin), toY(0));
      for (let x = xMin; x <= xMax; x += 0.06) ctx.lineTo(toX(x), toY(gauss(x, mu)));
      ctx.lineTo(toX(xMax), toY(0)); ctx.closePath();
      ctx.fillStyle = fill; ctx.fill();
    };

    drawDist(0, c.noise, "rgba(255,107,107,0.2)");
    drawDist(dp, c.signal, "rgba(76,175,80,0.2)");

    // d' arrow
    const ya = margin.t + pH * 0.28;
    ctx.save(); ctx.strokeStyle = c.text; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(toX(0), ya); ctx.lineTo(toX(dp), ya); ctx.stroke();
    [[toX(0), 1], [toX(dp), -1]].forEach(([ax, dir]) => {
      ctx.beginPath();
      ctx.moveTo(ax + dir * 6, ya - 4); ctx.lineTo(ax, ya); ctx.lineTo(ax + dir * 6, ya + 4);
      ctx.stroke();
    });
    ctx.restore();
    txt(ctx, "d' = " + dp.toFixed(2), (toX(0) + toX(dp)) / 2, ya - 9,
      { font: 'bold 10px "Inter",sans-serif', align: "center" });

    txt(ctx, "Lures", toX(0), toY(gauss(0, 0)) - 8,
      { font: '9px "Inter",sans-serif', align: "center", color: c.noise });
    txt(ctx, "Targets", toX(dp), toY(gauss(dp, dp)) - 8,
      { font: '9px "Inter",sans-serif', align: "center", color: c.signal });

    // Axes
    ctx.strokeStyle = c.axes; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(margin.l, margin.t); ctx.lineTo(margin.l, margin.t + pH);
    ctx.lineTo(margin.l + pW, margin.t + pH); ctx.stroke();
    txt(ctx, "Matching strength", margin.l + pW / 2, margin.t + pH + 16,
      { font: '9px "Inter",sans-serif', align: "center", color: c.label });
  }

  function drawChartDPrime(ctx, W, H, state) {
    const c = C();
    const step = state.step;
    // D = deep/stronger (more features), S = shallow/weaker (fewer features)
    const nC_S = step >= 5 ? state.params.nC_S : Math.max(1, Math.floor(state.params.nC / 2));
    const nC_D = step >= 5 ? state.params.nC_D : state.params.nC;
    const n = state.params.n;
    const L = 10, hL = 5;

    const dpSP = dpPure(nC_S, L, n), dpDP = dpPure(nC_D, L, n);
    const dpSM = dpMixed(nC_S, nC_D, hL, hL, n);
    const dpDM = dpMixed(nC_D, nC_S, hL, hL, n);
    const ror  = computeRoR(nC_S, nC_D, L, n);

    const margin = { t: 48, r: 20, b: 52, l: 48 };
    const pW = W - margin.l - margin.r, pH = H - margin.t - margin.b;

    txt(ctx, "d\u2019 by Condition and List Type", margin.l + pW / 2, 16,
      { font: 'bold 11px "Inter",sans-serif', align: "center" });

    // Inline legend: S = strong (more features), D = weak (fewer features)
    const legY = 28;
    // S legend — left side of chart area
    ctx.save();
    ctx.beginPath(); ctx.arc(margin.l + 8, legY, 4, 0, 2 * Math.PI);
    ctx.fillStyle = c.barS; ctx.fill();
    ctx.restore();
    txt(ctx, "S = shallow (fewer features)", margin.l + 16, legY,
      { font: '9px "Inter",sans-serif', color: c.barS });
    // D legend — right side of chart area (well past end of S text)
    ctx.save();
    ctx.beginPath(); ctx.arc(margin.l + pW / 2 + 8, legY, 4, 0, 2 * Math.PI);
    ctx.fillStyle = c.barD; ctx.fill();
    ctx.restore();
    txt(ctx, "D = deep (more features)", margin.l + pW / 2 + 16, legY,
      { font: '9px "Inter",sans-serif', color: c.barD });

    const bars = [
      { label: "Pure-S", d: dpSP, color: c.barS },
      { label: "Mixed-S", d: dpSM, color: c.barS },
      { label: "Pure-D", d: dpDP, color: c.barD },
      { label: "Mixed-D", d: dpDM, color: c.barD },
    ];
    const maxD = Math.max(...bars.map(b => b.d), 1) * 1.2;
    const bW = (pW - (bars.length + 1) * 6) / bars.length;
    function toY(v) { return margin.t + pH - v / maxD * pH; }

    // Gridlines
    ctx.save();
    for (let d = 0; d <= Math.ceil(maxD); d++) {
      const gy = toY(d);
      ctx.strokeStyle = c.grid; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(margin.l, gy); ctx.lineTo(margin.l + pW, gy); ctx.stroke();
      if (d > 0) txt(ctx, String(d), margin.l - 5, gy,
        { font: '9px "Inter",sans-serif', align: "right", color: c.label });
    }
    ctx.restore();

    // Bars
    bars.forEach((bar, i) => {
      const bx = margin.l + 6 + i * (bW + 6);
      const by = toY(bar.d), bh = bar.d / maxD * pH;
      ctx.save();
      ctx.fillStyle = bar.color; ctx.globalAlpha = 0.75;
      ctx.fillRect(bx, by, bW, bh);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = bar.color; ctx.lineWidth = 1;
      ctx.strokeRect(bx, by, bW, bh);
      ctx.restore();
      txt(ctx, bar.d.toFixed(2), bx + bW / 2, by - 7,
        { font: '8px "Inter",sans-serif', align: "center", color: bar.color });
      txt(ctx, bar.label, bx + bW / 2, margin.t + pH + 14,
        { font: '9px "Inter",sans-serif', align: "center", color: c.label });
    });

    // Dashed lines connecting Pure→Mixed for same condition
    const pairs = [[0, 1, c.barS], [2, 3, c.barD]];
    pairs.forEach(([a, b, col]) => {
      const xa = margin.l + 6 + a * (bW + 6) + bW / 2;
      const xb = margin.l + 6 + b * (bW + 6) + bW / 2;
      ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(xa, toY(bars[a].d)); ctx.lineTo(xb, toY(bars[b].d));
      ctx.stroke(); ctx.restore();
    });

    // Axes
    ctx.strokeStyle = c.axes; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(margin.l, margin.t); ctx.lineTo(margin.l, margin.t + pH);
    ctx.lineTo(margin.l + pW, margin.t + pH); ctx.stroke();
    ctx.save(); ctx.translate(16, margin.t + pH / 2); ctx.rotate(-Math.PI / 2);
    txt(ctx, "d'", 0, 0, { font: '10px "Inter",sans-serif', align: "center", color: c.label });
    ctx.restore();

    // RoR annotation  (RoR < 1 → positive LSE; RoR ≈ 1 → null LSE)
    const rorColor = ror > 1.05 ? c.noise : (ror < 0.95 ? c.signal : c.label);
    const rorLabel = ror > 1.05 ? "List-strength effect present" : (ror < 0.95 ? "Inverted list-strength effect" : "No list-strength effect");
    txt(ctx, "RoR = " + ror.toFixed(3) + "  \u2192  " + rorLabel,
      margin.l + pW / 2, margin.t + pH + 38,
      { font: 'bold 10px "Inter",sans-serif', align: "center", color: rorColor });
  }

  // =====================================================================
  // RENDER ROUTER
  // =====================================================================
  function renderMain(canvas, state) {
    if (!canvas) return;
    if      (state.step === 1) drawStep1(canvas, state);
    else if (state.step === 2) drawStep2(canvas, state);
    else if (state.step === 3) drawStep3(canvas, state);
    else if (state.step === 4) drawStep4(canvas, state);
    else if (state.step === 5) drawStep5(canvas, state);
  }

  function render() {
    const mainCanvas  = document.getElementById("sub-canvas-main");
    const chartCanvas = document.getElementById("sub-canvas-chart");
    if (state.step >= 1) {
      renderMain(mainCanvas, state);
      drawChart(chartCanvas, state);
    }
  }

  // =====================================================================
  // STATE
  // =====================================================================
  let state = {
    step: 0,
    params: { nC: 6, n: 32, nC_S: 4, nC_D: 10 },
    items: null,
    masks: null,
    probeIsTarget: true,
    seed: 42,
  };

  const STEP_INFO = [
    "",
    "<strong>Step 1: Words as Feature Vectors.</strong> Each column (W1, W2, \u2026, W5) represents a different word from the study list \u2014 for example, W1 might be \u201cAPPLE\u201d, W2 might be \u201cTABLE\u201d, W3 might be \u201cBLUE\u201d, and so on. Every word carries many distinct properties at once: how it <em>sounds</em> (phonological features \u2014 vowels, consonants, stress), how it <em>looks</em> on the page (orthographic features \u2014 letter shapes, length), and what it <em>means</em> (semantic features \u2014 the concepts, images, and associations it evokes). Notice that the semantic band (blue\u2013purple) is much taller than the phonological and orthographic bands: the semantic feature space is far larger in the model (\u223c512 features vs. \u223c64 each for phonological and orthographic). Each filled circle represents a feature that is <em>present</em> for that word; a hollow circle shows a feature that is absent. The theory assumes our memory system stores words by tracking these individual features \u2014 not the word as a single unit. (In the mathematical model, features have continuous values rather than just on/off; the filled/hollow display here is a simplified but faithful representation.)",
    "<strong>Step 2: Selective Encoding.</strong> When studying a word, attention doesn\u2019t process every feature equally. Instead, it selects a small subset (the <em>attentional mask</em>) to attend to. Among those nC attended features: a <em>filled</em> colored circle means the feature is present in that word and gets encoded into memory; a <em>hollow</em> colored ring means the feature was attended, but happens to be absent in that particular word \u2014 so there is nothing to encode. Grey circles are features that go completely unnoticed by attention and are never encoded. As a result, the number of <em>filled</em> colored dots you see per column will often be less than nC \u2014 because some of the attended features simply aren\u2019t present in that word. Crucially, each word gets its own <em>unique</em> attentional subset, and the same features tend to be re-activated at test. Use the slider to control how many features (nC) are attended per word.",
    "<strong>Step 3: Recognizing a Word.</strong> At test, the same attentional mask re-activates: you \u2018re-look\u2019 at the attended features of the probe word. <em>Filled</em> colored circles are features that are present in the probe; <em>hollow</em> colored rings are features attention attended to but that are absent in this particular probe word. A <strong>gold ring</strong> marks a feature that is both present in the probe <em>and</em> stored in memory \u2014 a match. A <em>target</em> (word W1, which you actually studied) and a <em>lure</em> (a new, unstudied word) are shown side by side against the same memory trace. For the target, many attended features are present and match memory \u2014 high match count. For the lure, its features differ from what was studied, so fewer attended features match \u2014 low match count. That gap is captured by d\u2019 (discrimination sensitivity). Adjust nC to see how attending more features widens the separation.",
    "<strong>Step 4: Why Feature Space Size Matters.</strong> The critical quantity is the <em>sparseness ratio</em> nC/n \u2014 the fraction of all features that attention selects. When nC/n is tiny (large n, sparse subsetting), two words\u2019 attentional spotlights almost never overlap by chance: cross-talk between items is negligible and list composition barely matters. When nC/n is large (small n, dense subsetting), the spotlights frequently share features \u2014 one word\u2019s memory trace bleeds into another\u2019s and list composition matters a lot. The two Venn diagrams illustrate this: large outer circle = large feature space (sparse); small outer circle = compact feature space (dense). The bar chart shows d\u2019 for four conditions. <em>Pure-S / Pure-D</em>: lists where all items are encoded the same shallow (S) or deep (D) way. <em>Mixed-S / Mixed-D</em>: the same conditions when the list is mixed. Drag the Feature Space (n) slider from small to large to watch the RoR converge toward 1 \u2014 a null list-strength effect \u2014 as sparseness increases.",
    "<strong>Step 5: The List-Strength Effect.</strong> Does it hurt your memory for a word if other words in the same list were studied more intensively? In a <em>pure list</em>, all words are studied the same way. In a <em>mixed list</em>, some words are encoded more deeply (condition D \u2014 more features, e.g. a spoken/produced word) and some more shallowly (condition S \u2014 fewer features, e.g. a silently-read word). Note: in the papers, D = deep/stronger and S = shallow/weaker, matching the sliders here. The <em>Ratio-of-Ratios</em> RoR = [d\u2019(D mixed)/d\u2019(S mixed)] / [d\u2019(D pure)/d\u2019(S pure)] quantifies the effect. <strong>RoR \u2248 1</strong> \u2014 a <em>null list-strength effect</em>: list composition barely changes relative performance. This occurs when features come from a <em>large</em> subspace (semantic encoding), so attentional spotlights of different items rarely overlap and cross-talk is minimal. <strong>RoR > 1</strong> \u2014 a <em>positive list-strength effect</em>: deep (D) items benefit disproportionately in mixed lists. This is predicted when features come from a <em>compact</em> subspace, such as phonological features during production/vocalisation. Because nC/n<sub>phon</sub> is not small, different items\u2019 masks frequently share features, adding noise that hurts the weaker (S) items more. The key insight: production is not simply \u201cstronger\u201d encoding in the usual sense. Repetition and longer study time also encode more features but produce near-null list-strength effects because the extra features come from the large semantic subspace. Production\u2019s large positive list-strength effect arises specifically because its extra features are <em>phonological</em> \u2014 drawn from a compact space where cross-talk is unavoidable.",
  ];

  // =====================================================================
  // UI WIRING
  // =====================================================================
  function setRangeFill(slider) {
    if (!slider) return;
    const min = parseFloat(slider.min) || 0;
    const max = parseFloat(slider.max) || 100;
    const val = parseFloat(slider.value) || 0;
    const pct = max > min ? (val - min) / (max - min) * 100 : 0;
    slider.style.setProperty("--sub-range-fill", pct + "%");
  }

  function wireSlider(id, labelId, cb) {
    const el = document.getElementById(id), lbl = document.getElementById(labelId);
    if (!el) return;
    setRangeFill(el);
    el.addEventListener("input", function () {
      if (lbl) lbl.textContent = this.value;
      setRangeFill(this);
      cb(parseFloat(this.value));
    });
  }

  function resizeCanvases() {
    const container = document.getElementById("sub-container");
    if (!container) return;
    const cs = window.getComputedStyle(container);
    const w = Math.max(0, container.clientWidth
      - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0));
    const dpr = window.devicePixelRatio || 1;

    function size(id, dispH) {
      const cv = document.getElementById(id);
      if (!cv) return;
      const dw = Math.min(Math.max(w - 10, 0), 750);
      cv.style.width = dw + "px"; cv.style.height = dispH + "px";
      cv.width = dw * dpr; cv.height = dispH * dpr;
      cv.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    size("sub-canvas-main", 240);
    size("sub-canvas-chart", 250);
  }

  function goToStep(step) {
    state.step = step;
    if (step >= 1 && !state.items) state.items = genItems(state.seed);
    if (step >= 2) state.masks = genMasks(state.seed, state.params.nC);

    // Button states
    document.querySelectorAll(".sub-step-btn").forEach(b => {
      b.classList.toggle("active", parseInt(b.dataset.step) === step);
    });

    // Show/hide areas
    const show = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.style.display = v;
    };
    show("sub-start-screen", step === 0 ? "block" : "none");
    show("sub-viz-area", step >= 1 ? "block" : "none");
    show("sub-controls-area", step >= 1 ? "flex" : "none");
    show("sub-basic-controls", (step >= 2 && step <= 4) ? "flex" : "none");
    show("sub-probe-group", "none"); // both probes shown simultaneously in step 3
    show("sub-space-controls", step >= 4 ? "flex" : "none");
    show("sub-step5-controls", step === 5 ? "flex" : "none");

    const infoEl = document.getElementById("sub-info-text");
    if (infoEl) {
      infoEl.innerHTML = STEP_INFO[step] || "";
      infoEl.style.display = step >= 1 ? "block" : "none";
    }
    render();
  }

  function initDemo() {
    if (!document.getElementById("sub-container")) return;

    document.getElementById("sub-start-btn")?.addEventListener("click", () => goToStep(1));
    document.querySelectorAll(".sub-step-btn").forEach(b => {
      b.addEventListener("click", function () { goToStep(parseInt(this.dataset.step)); });
    });

    const probeBtn = document.getElementById("sub-probe-btn");
    if (probeBtn) {
      probeBtn.addEventListener("click", function () {
        state.probeIsTarget = !state.probeIsTarget;
        this.textContent = state.probeIsTarget ? "Show Lure" : "Show Target";
        render();
      });
    }

    wireSlider("sub-nC", "sub-nC-val", v => {
      state.params.nC = Math.round(v);
      if (state.items) state.masks = genMasks(state.seed, state.params.nC);
      render();
    });
    wireSlider("sub-n", "sub-n-val", v => { state.params.n = Math.round(v); render(); });
    wireSlider("sub-nC-S", "sub-nC-S-val", v => { state.params.nC_S = Math.round(v); render(); });
    wireSlider("sub-nC-D", "sub-nC-D-val", v => { state.params.nC_D = Math.round(v); render(); });

    resizeCanvases();
    window.addEventListener("resize", () => { resizeCanvases(); render(); });
    new MutationObserver(() => render()).observe(document.documentElement, {
      attributes: true, attributeFilter: ["data-theme"],
    });
    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initDemo);
  } else {
    initDemo();
  }
})();
