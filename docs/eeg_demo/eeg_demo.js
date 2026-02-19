/**
 * EEG Interactive Demo
 * How EEG Works: ERPs & Oscillations - Computational Memory Lab
 * University of Alberta
 */
(function () {
  "use strict";

  // =====================================================================
  // CONFIGURATION
  // =====================================================================
  const SR = 256;
  const EPOCH_PRE = 0.2;
  const EPOCH_POST = 0.8;
  const EPOCH_DUR = EPOCH_PRE + EPOCH_POST;
  const EPOCH_LEN = Math.round(EPOCH_DUR * SR);
  const MAX_TRIALS = 200;
  const CONTINUOUS_DUR = 16;
  const CONTINUOUS_N = SR * CONTINUOUS_DUR;
  const DISPLAY_SECS = 4;
  const OSC_DUR = 4;
  const OSC_N = SR * OSC_DUR;
  const BLINK_DUR = 0.45;
  const BLINK_ENTRY_LEAD = 0.05;
  const BLINK_FIXED_NOISE_LEVEL = 2.0;
  const STEP1_TRACE_SHIFT_RATE = 0.8;

  const CHANNELS = ["Fz", "F3", "F4", "Cz", "Pz", "Oz"];
  const BLINK_CHANNEL_GAIN = [3.8, 3.4, 3.2, 2.0, 1.2, 0.7];

  // Electrode positions used in topographic head diagram (no F3/F4)
  const ELECTRODE_POS = {
    Fz:  { x: 0,     y: -0.45 },
    Cz:  { x: 0,     y: 0 },
    Pz:  { x: 0,     y: 0.40 },
    Oz:  { x: 0,     y: 0.70 },
  };
  const ELECTRODE_ORDER = ["Fz", "Cz", "Pz", "Oz"];

  const BANDS = {
    delta: { lo: 1,  hi: 4,  color: "#e74c3c", label: "Delta (1-4 Hz)",  nComp: 3, amp: 8.0 },
    theta: { lo: 4,  hi: 8,  color: "#f39c12", label: "Theta (4-8 Hz)",  nComp: 4, amp: 5.0 },
    alpha: { lo: 8,  hi: 13, color: "#2ecc71", label: "Alpha (8-13 Hz)", nComp: 5, amp: 4.0 },
    beta:  { lo: 13, hi: 30, color: "#3498db", label: "Beta (13-30 Hz)", nComp: 6, amp: 2.0 },
  };
  const BAND_ORDER = ["delta", "theta", "alpha", "beta"];

  const COLORS = {
    canvasBg: "#141924",
    text: "#c8d8e8",
    textDim: "#8899aa",
    axes: "#556677",
    axesLabel: "#8899aa",
    gridLine: "rgba(60, 75, 95, 0.5)",
    signal: "#a8c8e8",
    signalDim: "#4a6a8a",
    erp: "#4CAF50",
    erpTrue: "#4CAF50",
    erpAvg: "#5b8fd9",
    n1: "#ff6b6b",
    p2: "#5b8fd9",
    p3: "#f5a623",
    stimulus: "#ff4444",
    electrode: "#5b8fd9",
    electrodeFill: "rgba(91, 143, 217, 0.7)",
    headOutline: "#8899aa",
    trialTrace: "rgba(168, 200, 232, 0.3)",
    noise: "#ff6b6b",
    sqrtCurve: "#f5a623",
    scalp: "#c8a882",
    skull: "#e0d5c8",
    csf: "#7cb3f1",
    cortex: "#d4a0a0",
    neuron: "#ff9800",
  };

  // =====================================================================
  // MATH UTILITIES
  // =====================================================================

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function randn(rng) {
    var u1 = rng(), u2 = rng();
    while (u1 === 0) u1 = rng();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  function fft(re, im) {
    var n = re.length;
    for (var i = 1, j = 0; i < n; i++) {
      var bit = n >> 1;
      while (j & bit) { j ^= bit; bit >>= 1; }
      j ^= bit;
      if (i < j) {
        var tmp = re[i]; re[i] = re[j]; re[j] = tmp;
        tmp = im[i]; im[i] = im[j]; im[j] = tmp;
      }
    }
    for (var len = 2; len <= n; len *= 2) {
      var ang = (-2 * Math.PI) / len;
      var wRe = Math.cos(ang), wIm = Math.sin(ang);
      for (var ii = 0; ii < n; ii += len) {
        var curRe = 1, curIm = 0;
        for (var jj = 0; jj < len / 2; jj++) {
          var idx1 = ii + jj, idx2 = ii + jj + len / 2;
          var uRe = re[idx1], uIm = im[idx1];
          var vRe = re[idx2] * curRe - im[idx2] * curIm;
          var vIm = re[idx2] * curIm + im[idx2] * curRe;
          re[idx1] = uRe + vRe; im[idx1] = uIm + vIm;
          re[idx2] = uRe - vRe; im[idx2] = uIm - vIm;
          var newCurRe = curRe * wRe - curIm * wIm;
          curIm = curRe * wIm + curIm * wRe;
          curRe = newCurRe;
        }
      }
    }
  }

  function ifft(re, im) {
    var n = re.length;
    for (var i = 0; i < n; i++) im[i] = -im[i];
    fft(re, im);
    for (var j = 0; j < n; j++) { re[j] /= n; im[j] = -im[j] / n; }
  }

  // =====================================================================
  // SIGNAL GENERATION
  // =====================================================================

  function generatePinkNoise(nSamples, sr, alpha, seed) {
    var rng = mulberry32(seed);
    var len = 1;
    while (len < nSamples * 2) len *= 2;
    var re = new Float64Array(len);
    var im = new Float64Array(len);
    for (var i = 0; i < nSamples; i++) re[i] = randn(rng);
    fft(re, im);
    re[0] = 0; im[0] = 0;
    for (var k = 1; k < len; k++) {
      var freq = k <= len / 2 ? k : len - k;
      var scale = Math.pow(freq, -alpha / 2);
      re[k] *= scale; im[k] *= scale;
    }
    ifft(re, im);
    var signal = new Float64Array(nSamples);
    var rms = 0;
    for (var si = 0; si < nSamples; si++) { signal[si] = re[si]; rms += signal[si] * signal[si]; }
    rms = Math.sqrt(rms / nSamples);
    if (rms > 0) for (var si2 = 0; si2 < nSamples; si2++) signal[si2] /= rms;
    return signal;
  }

  function blinkWaveform(tSec) {
    if (tSec < 0 || tSec > BLINK_DUR) return 0;
    var main = Math.exp(-0.5 * Math.pow((tSec - 0.13) / 0.045, 2));
    var rebound = Math.exp(-0.5 * Math.pow((tSec - 0.25) / 0.06, 2));
    return main - 0.45 * rebound;
  }

  function getBlinkArtifact(absSample, chIdx) {
    if (!state.blinkEvents || state.blinkEvents.length === 0) return 0;
    var gain = BLINK_CHANNEL_GAIN[chIdx] || 0;
    if (gain <= 0) return 0;
    var sum = 0;
    for (var i = 0; i < state.blinkEvents.length; i++) {
      var evt = state.blinkEvents[i];
      var tSec = (absSample - evt.startSample) / SR;
      if (tSec < 0 || tSec > BLINK_DUR) continue;
      sum += evt.strength * gain * blinkWaveform(tSec);
    }
    return sum;
  }

  function erpTemplate(tSec) {
    if (tSec < -0.05) return 0;
    var n1 = -5.0 * Math.exp(-0.5 * Math.pow((tSec - 0.100) / 0.025, 2));
    var p2 =  4.0 * Math.exp(-0.5 * Math.pow((tSec - 0.200) / 0.035, 2));
    var p3 =  7.0 * Math.exp(-0.5 * Math.pow((tSec - 0.350) / 0.060, 2));
    return n1 + p2 + p3;
  }

  function generateERPTemplate() {
    var template = new Float64Array(EPOCH_LEN);
    for (var i = 0; i < EPOCH_LEN; i++) {
      template[i] = erpTemplate((i / SR) - EPOCH_PRE);
    }
    return template;
  }

  function generateTrials(noiseLevel, seed) {
    var template = generateERPTemplate();
    var trials = [];
    for (var tr = 0; tr < MAX_TRIALS; tr++) {
      var noise = generatePinkNoise(EPOCH_LEN, SR, 1.5, seed + tr * 7919);
      var trial = new Float64Array(EPOCH_LEN);
      for (var i = 0; i < EPOCH_LEN; i++) {
        trial[i] = template[i] + noiseLevel * 15.0 * noise[i];
      }
      trials.push(trial);
    }
    return { trials: trials, template: template };
  }

  function buildCumSum(trials) {
    var cumSum = [];
    cumSum[0] = new Float64Array(trials[0]);
    for (var i = 1; i < trials.length; i++) {
      cumSum[i] = new Float64Array(EPOCH_LEN);
      for (var s = 0; s < EPOCH_LEN; s++) cumSum[i][s] = cumSum[i - 1][s] + trials[i][s];
    }
    return cumSum;
  }

  function getAverage(cumSum, n) {
    var avg = new Float64Array(EPOCH_LEN);
    var idx = Math.min(n, cumSum.length) - 1;
    for (var s = 0; s < EPOCH_LEN; s++) avg[s] = cumSum[idx][s] / n;
    return avg;
  }

  // bandPowers: {delta, theta, alpha, beta}
  function generateBands(bandPowers, seed) {
    var rng = mulberry32(seed);
    var bands = {};
    for (var bi = 0; bi < BAND_ORDER.length; bi++) {
      var name = BAND_ORDER[bi];
      var b = BANDS[name];
      var signal = new Float64Array(OSC_N);
      var amp = (bandPowers[name] !== undefined ? bandPowers[name] : 1.0) * b.amp;
      for (var c = 0; c < b.nComp; c++) {
        var freq = b.lo + rng() * (b.hi - b.lo);
        var phase = rng() * 2 * Math.PI;
        var a = amp * (0.5 + rng() * 0.5) / b.nComp;
        for (var i = 0; i < OSC_N; i++) signal[i] += a * Math.sin(2 * Math.PI * freq * (i / SR) + phase);
      }
      bands[name] = signal;
    }
    var composite = new Float64Array(OSC_N);
    var noise = generatePinkNoise(OSC_N, SR, 1.5, seed + 99999);
    for (var j = 0; j < OSC_N; j++) {
      var sum = 0;
      for (var bj = 0; bj < BAND_ORDER.length; bj++) sum += bands[BAND_ORDER[bj]][j];
      composite[j] = sum + 1.5 * noise[j];
    }
    return { bands: bands, composite: composite };
  }

  function computeSpectrum(signal) {
    var n = signal.length;
    var fftLen = 1;
    while (fftLen < n) fftLen *= 2;
    var re = new Float64Array(fftLen);
    var im = new Float64Array(fftLen);
    for (var i = 0; i < n; i++) {
      var w = 0.5 * (1 - Math.cos(2 * Math.PI * i / (n - 1)));
      re[i] = signal[i] * w;
    }
    fft(re, im);
    var nFreqs = Math.floor(fftLen / 2);
    var freqs = new Float64Array(nFreqs);
    var power = new Float64Array(nFreqs);
    for (var k = 1; k < nFreqs; k++) {
      freqs[k] = k * SR / fftLen;
      power[k] = (re[k] * re[k] + im[k] * im[k]) / (fftLen * fftLen);
    }
    return { freqs: freqs, power: power };
  }

  function computeSpectrogram(signal, winSamples, hopSamples) {
    var nFrames = Math.floor((signal.length - winSamples) / hopSamples) + 1;
    var fftLen = 1;
    while (fftLen < winSamples) fftLen *= 2;
    var nFreqs = Math.floor(fftLen / 2);
    var spec = [];
    for (var f = 0; f < nFrames; f++) {
      var start = f * hopSamples;
      var re = new Float64Array(fftLen);
      var im = new Float64Array(fftLen);
      for (var i = 0; i < winSamples; i++) {
        var w = 0.5 * (1 - Math.cos(2 * Math.PI * i / (winSamples - 1)));
        re[i] = signal[start + i] * w;
      }
      fft(re, im);
      var framePower = new Float64Array(nFreqs);
      for (var k = 0; k < nFreqs; k++) framePower[k] = re[k] * re[k] + im[k] * im[k];
      spec.push(framePower);
    }
    var freqBins = new Float64Array(nFreqs);
    for (var k2 = 0; k2 < nFreqs; k2++) freqBins[k2] = k2 * SR / fftLen;
    return { spec: spec, freqBins: freqBins, nFreqs: nFreqs, nFrames: nFrames };
  }

  // =====================================================================
  // CANVAS UTILITIES
  // =====================================================================

  function getCanvasColors() {
    var isLight = document.documentElement.getAttribute("data-theme") === "light";
    if (isLight) {
      return {
        ...COLORS,
        canvasBg: "#f7fafc",
        text: "#2d3748",
        textDim: "#718096",
        axes: "#718096",
        axesLabel: "#4a5568",
        gridLine: "rgba(160, 174, 192, 0.4)",
        signal: "#2c5282",
        signalDim: "#a0aec0",
        headOutline: "#4a5568",
        electrode: "#4a90e2",
        electrodeFill: "rgba(74, 144, 226, 0.7)",
        trialTrace: "rgba(44, 82, 130, 0.3)",
        scalp: "#d4a977",
        skull: "#e8ddd0",
        csf: "#5a9bd5",
        cortex: "#c48888",
        neuron: "#e67e22",
      };
    }
    return COLORS;
  }

  function hexToRgb(hex) {
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    return [r, g, b];
  }

  function clearCanvas(ctx, w, h) {
    ctx.fillStyle = getCanvasColors().canvasBg;
    ctx.fillRect(0, 0, w, h);
  }

  function drawText(ctx, text, x, y, opts) {
    opts = opts || {};
    var c = getCanvasColors();
    ctx.fillStyle = opts.color || c.text;
    ctx.font = opts.font || '11px "Inter", sans-serif';
    ctx.textAlign = opts.align || "left";
    ctx.textBaseline = opts.baseline || "middle";
    ctx.fillText(text, x, y);
  }

  // =====================================================================
  // STEP 1: THE SCALP
  // =====================================================================

  function drawStep1Main(canvas) {
    var ctx = canvas.getContext("2d");
    var dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var W = canvas.width / dpr, H = canvas.height / dpr;
    clearCanvas(ctx, W, H);
    var c = getCanvasColors();

    var cx = W * 0.35, cy = H * 0.52;
    var rx = Math.min(W * 0.23, H * 0.42);
    var ry = rx * 1.12;

    drawText(ctx, "EEG: Electrodes on the Scalp", W / 2, 16, {
      font: 'bold 13px "Inter", sans-serif', align: "center"
    });

    // --- Draw EEG traces INSIDE the head (clipped to ellipse) ---
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
    ctx.clip();

    var electrodeRadius = 5;
    var traceAmp = ry * 0.09; // amplitude of each trace
    for (var ei = 0; ei < ELECTRODE_ORDER.length; ei++) {
      var eName = ELECTRODE_ORDER[ei];
      var ePos = ELECTRODE_POS[eName];
      var ey = cy + ePos.y * ry;

      if (!state.sparkBuffers || !state.sparkBuffers[eName]) continue;
      var buf = state.sparkBuffers[eName];

      ctx.beginPath();
      ctx.strokeStyle = c.electrode;
      ctx.lineWidth = 1.2;
      ctx.globalAlpha = 0.8;
      for (var si = 0; si < buf.length; si++) {
        var px = (cx - rx) + (si / (buf.length - 1)) * rx * 2;
        var py = ey + buf[si] * traceAmp;
        if (si === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Gradient fade on right edge
    var bgRgb = hexToRgb(c.canvasBg);
    var bgStr = bgRgb[0] + "," + bgRgb[1] + "," + bgRgb[2];
    var fadeW = rx * 0.22;
    var grad = ctx.createLinearGradient(cx + rx - fadeW, 0, cx + rx + 2, 0);
    grad.addColorStop(0, "rgba(" + bgStr + ",0)");
    grad.addColorStop(1, "rgba(" + bgStr + ",1)");
    ctx.fillStyle = grad;
    ctx.fillRect(cx + rx - fadeW, cy - ry, fadeW + 4, ry * 2);

    ctx.restore();

    // --- Head outline (drawn on top) ---
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
    ctx.strokeStyle = c.headOutline;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Nose (top)
    var noseY = cy - ry;
    ctx.beginPath();
    ctx.moveTo(cx - 8, noseY);
    ctx.lineTo(cx, noseY - 12);
    ctx.lineTo(cx + 8, noseY);
    ctx.strokeStyle = c.headOutline;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Ears
    ctx.beginPath(); ctx.ellipse(cx - rx - 4, cy, 5, 12, 0, 0, 2 * Math.PI);
    ctx.strokeStyle = c.headOutline; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(cx + rx + 4, cy, 5, 12, 0, 0, 2 * Math.PI);
    ctx.stroke();

    // --- Electrode dots and labels ---
    for (var ei2 = 0; ei2 < ELECTRODE_ORDER.length; ei2++) {
      var eName2 = ELECTRODE_ORDER[ei2];
      var ePos2 = ELECTRODE_POS[eName2];
      var ex2 = cx + ePos2.x * rx;
      var ey2 = cy + ePos2.y * ry;

      ctx.beginPath();
      ctx.arc(ex2, ey2, electrodeRadius, 0, 2 * Math.PI);
      ctx.fillStyle = c.electrodeFill;
      ctx.fill();
      ctx.strokeStyle = c.electrode;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Label to the left of center electrodes
      drawText(ctx, eName2, ex2 - electrodeRadius - 5, ey2, {
        font: 'bold 9px "Inter", sans-serif',
        align: "right",
        color: c.electrode
      });
    }

    // --- Right side explanation text ---
    var textX = W * 0.63;
    var textY = H * 0.20;
    var lineH = 17;

    ctx.font = '11px "Inter", sans-serif';
    ctx.fillStyle = c.text;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    var lines = [
      "Electrodes pick up tiny",
      "voltage fluctuations (~\u00B5V)",
      "from millions of neurons.",
      "",
      "Signal path:",
      "cortex \u2192 CSF \u2192 skull \u2192 scalp",
      "\u2192 electrode",
      "",
      "Each wavy line shows the",
      "live voltage at that site."
    ];
    for (var li = 0; li < lines.length; li++) {
      ctx.fillText(lines[li], textX, textY + li * lineH);
    }
  }

  function drawStep1Left(canvas) {
    var ctx = canvas.getContext("2d");
    var dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var W = canvas.width / dpr, H = canvas.height / dpr;
    clearCanvas(ctx, W, H);
    var c = getCanvasColors();

    drawText(ctx, "Signal Path: Cortex to Scalp", W / 2, 14, {
      font: 'bold 12px "Inter", sans-serif', align: "center"
    });

    // Center the layer diagram + explanation block vertically in the panel.
    var layerX = 22, layerW = W - 44;
    var layers = [
      { name: "Electrode", color: c.electrode, h: 20 },
      { name: "Scalp", color: c.scalp, h: 30 },
      { name: "Skull", color: c.skull, h: 34 },
      { name: "CSF", color: c.csf, h: 18 },
      { name: "Cortex", color: c.cortex, h: 44 },
    ];
    var explanText = [
      "Pyramidal neurons generate currents",
      "that travel through tissue layers to",
      "be detected at the scalp electrode."
    ];
    var layerTotalH = 0;
    for (var lh = 0; lh < layers.length; lh++) layerTotalH += layers[lh].h;
    var blockH = layerTotalH + 12 + explanText.length * 16;
    var startY = Math.max(24, Math.round((H - blockH) / 2));

    var y = startY;
    for (var i = 0; i < layers.length; i++) {
      var l = layers[i];
      ctx.fillStyle = l.color;
      ctx.globalAlpha = 0.65;
      ctx.fillRect(layerX, y, layerW, l.h);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = c.axes;
      ctx.lineWidth = 0.5;
      ctx.strokeRect(layerX, y, layerW, l.h);
      drawText(ctx, l.name, layerX + layerW / 2, y + l.h / 2, {
        font: '11px "Inter", sans-serif', align: "center", color: c.text
      });
      y += l.h;
    }

    // Neurons inside cortex
    var cortexTop = y - 44;
    for (var ni = 0; ni < 10; ni++) {
      var nx = layerX + 14 + ni * (layerW - 28) / 9;
      var ny = cortexTop + 44 - 6;
      ctx.beginPath();
      ctx.moveTo(nx, ny); ctx.lineTo(nx, ny - 26);
      ctx.strokeStyle = c.neuron; ctx.lineWidth = 1.8; ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(nx - 4, ny); ctx.lineTo(nx + 4, ny); ctx.lineTo(nx, ny - 7);
      ctx.closePath(); ctx.fillStyle = c.neuron; ctx.fill();
    }

    // Arrow showing current flow upward
    var arrowX = W / 2;
    var arrowTop = startY + 8;
    var arrowBot = cortexTop + 10;
    ctx.beginPath();
    ctx.setLineDash([5, 4]);
    ctx.moveTo(arrowX, arrowBot); ctx.lineTo(arrowX, arrowTop);
    ctx.strokeStyle = c.electrode; ctx.lineWidth = 1.8; ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(arrowX - 6, arrowTop + 9);
    ctx.lineTo(arrowX, arrowTop - 1);
    ctx.lineTo(arrowX + 6, arrowTop + 9);
    ctx.strokeStyle = c.electrode; ctx.lineWidth = 1.8; ctx.stroke();

    // Bottom text (larger)
    var botY = y + 12;
    ctx.font = '11px "Inter", sans-serif';
    ctx.fillStyle = c.textDim;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (var ti = 0; ti < explanText.length; ti++) {
      ctx.fillText(explanText[ti], W / 2, botY + ti * 16);
    }
  }

  function drawStep1Right(canvas) {
    var ctx = canvas.getContext("2d");
    var dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var W = canvas.width / dpr, H = canvas.height / dpr;
    clearCanvas(ctx, W, H);
    var c = getCanvasColors();

    drawText(ctx, "Summing Many Neurons", W / 2, 14, {
      font: 'bold 12px "Inter", sans-serif', align: "center"
    });

    var rng = mulberry32(123);
    var traceW = W - 30;
    var nTraces = 7;
    var traceH = 11;
    var startY = 34;
    var spacing = Math.floor((H * 0.50) / nTraces);

    for (var ti = 0; ti < nTraces; ti++) {
      var by = startY + ti * spacing;
      ctx.beginPath();
      ctx.strokeStyle = c.neuron;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 1.2;
      var freq = 4 + rng() * 18;
      var phase = rng() * Math.PI * 2;
      for (var xi = 0; xi < 70; xi++) {
        var px = 15 + (xi / 69) * traceW;
        var t = xi / 70 * 2;
        var py = by + Math.sin(2 * Math.PI * freq * t + phase) * traceH * (0.5 + rng() * 0.5);
        if (xi === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    var arrowY = startY + nTraces * spacing + 8;
    drawText(ctx, "\u2193  Sum  \u2193", W / 2, arrowY, {
      font: 'bold 12px "Inter", sans-serif', align: "center", color: c.electrode
    });

    // Summed signal
    var sumY = arrowY + 20;
    ctx.beginPath();
    ctx.strokeStyle = c.signal;
    ctx.lineWidth = 2;
    var rng2 = mulberry32(456);
    for (var xi2 = 0; xi2 < 90; xi2++) {
      var px2 = 15 + (xi2 / 89) * traceW;
      var t2 = xi2 / 90 * 2;
      var val = 1.0 * Math.sin(2 * Math.PI * 10 * t2 + 0.3)
              + 0.5 * Math.sin(2 * Math.PI * 6 * t2 + 1.2)
              + 0.3 * randn(rng2) * 0.3;
      var py2 = sumY + val * 11;
      if (xi2 === 0) ctx.moveTo(px2, py2); else ctx.lineTo(px2, py2);
    }
    ctx.stroke();

    drawText(ctx, "= Scalp EEG signal (\u00B5V)", W / 2, sumY + 26, {
      font: '11px "Inter", sans-serif', align: "center", color: c.textDim
    });

    // Explanation at bottom
    var explY = sumY + 46;
    var expl = [
      "Many neurons fire together in",
      "synchrony (population activity),",
      "producing a measurable voltage."
    ];
    ctx.font = '10px "Inter", sans-serif';
    ctx.fillStyle = c.textDim;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (var li = 0; li < expl.length; li++) {
      ctx.fillText(expl[li], W / 2, explY + li * 15);
    }
  }

  // =====================================================================
  // STEP 2: RAW EEG
  // =====================================================================

  function drawStep2Main(canvas) {
    var ctx = canvas.getContext("2d");
    var dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var W = canvas.width / dpr, H = canvas.height / dpr;
    clearCanvas(ctx, W, H);
    var c = getCanvasColors();

    if (!state.channels) return;

    var margins = { top: 28, bottom: 10, left: 36, right: 10 };
    var plotW = W - margins.left - margins.right;
    var plotH = H - margins.top - margins.bottom;
    var nCh = CHANNELS.length;
    var chH = plotH / nCh;

    drawText(ctx, "Multi-Channel EEG Recording", W / 2, 14, {
      font: 'bold 13px "Inter", sans-serif', align: "center"
    });

    var samplesVisible = Math.floor(DISPLAY_SECS * SR);
    var offset = state.scrollOffset;
    // Scale background EEG with noise slider, while blink stays fixed.
    var ampScale = state.params.noiseLevel;

    for (var ch = 0; ch < nCh; ch++) {
      var chSignal = state.channels[ch];
      var baseY = margins.top + ch * chH + chH / 2;

      drawText(ctx, CHANNELS[ch], margins.left - 4, baseY, {
        font: '9px "Inter", sans-serif', align: "right", color: c.axesLabel
      });

      ctx.beginPath();
      ctx.moveTo(margins.left, baseY);
      ctx.lineTo(margins.left + plotW, baseY);
      ctx.strokeStyle = c.gridLine;
      ctx.lineWidth = 0.5;
      ctx.stroke();

      ctx.beginPath();
      ctx.strokeStyle = c.signal;
      ctx.lineWidth = 1;
      var noiseAmp = chH * 0.38 * ampScale;
      var blinkAmp = chH * 0.38 * BLINK_FIXED_NOISE_LEVEL;
      for (var si = 0; si < samplesVisible; si++) {
        var absSample = state.rawAbsSample + si;
        var idx = (offset + si) % CONTINUOUS_N;
        var blink = getBlinkArtifact(absSample, ch);
        var px = margins.left + (si / samplesVisible) * plotW;
        var py = baseY - chSignal[idx] * noiseAmp - blink * blinkAmp;
        if (si === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  }

  function drawStep2Left(canvas) {
    var ctx = canvas.getContext("2d");
    var dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var W = canvas.width / dpr, H = canvas.height / dpr;
    clearCanvas(ctx, W, H);
    var c = getCanvasColors();

    drawText(ctx, "Zoomed: Channel Cz", W / 2, 16, {
      font: 'bold 12px "Inter", sans-serif', align: "center"
    });

    if (!state.channels) return;
    var chIdx = 3; // Cz
    var chSignal = state.channels[chIdx];
    var margins = { top: 35, bottom: 40, left: 20, right: 20 };
    var plotW = W - margins.left - margins.right;
    var plotH = H - margins.top - margins.bottom;
    var baseY = margins.top + plotH / 2;
    var mainSamplesVisible = Math.floor(DISPLAY_SECS * SR);
    // Show the start/left side of the main 4-second window (first ~75%) for earlier blink visibility.
    var samplesShow = Math.floor(mainSamplesVisible * 0.75);
    var offset = state.scrollOffset;
    var ampScale = state.params.noiseLevel;

    var noiseAmp = plotH * 0.38 * ampScale;
    var blinkAmp = plotH * 0.38 * BLINK_FIXED_NOISE_LEVEL;
    ctx.beginPath();
    ctx.strokeStyle = c.signal;
    ctx.lineWidth = 1.5;
    for (var si = 0; si < samplesShow; si++) {
      var absSample = state.rawAbsSample + si;
      var idx = (offset + si) % CONTINUOUS_N;
      var blink = getBlinkArtifact(absSample, chIdx);
      var px = margins.left + (si / samplesShow) * plotW;
      var py = baseY - chSignal[idx] * noiseAmp - blink * blinkAmp;
      if (si === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Scale bars
    var sbX = margins.left + plotW - 60;
    var sbY = margins.top + plotH - 10;
    var tScale = 0.2 * SR / samplesShow * plotW;
    ctx.beginPath();
    ctx.moveTo(sbX, sbY); ctx.lineTo(sbX + tScale, sbY);
    ctx.strokeStyle = c.text; ctx.lineWidth = 2; ctx.stroke();
    drawText(ctx, "200 ms", sbX + tScale / 2, sbY + 12, {
      font: '9px "Inter", sans-serif', align: "center", color: c.textDim
    });

    var aScale = plotH * 0.15;
    ctx.beginPath();
    ctx.moveTo(sbX, sbY); ctx.lineTo(sbX, sbY - aScale);
    ctx.strokeStyle = c.text; ctx.lineWidth = 2; ctx.stroke();
    drawText(ctx, "50 \u00B5V", sbX - 8, sbY - aScale / 2, {
      font: '9px "Inter", sans-serif', align: "right", color: c.textDim
    });
  }

  function drawStep2Right(canvas) {
    var ctx = canvas.getContext("2d");
    var dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var W = canvas.width / dpr, H = canvas.height / dpr;
    clearCanvas(ctx, W, H);
    var c = getCanvasColors();

    drawText(ctx, "What's in the Signal?", W / 2, 16, {
      font: 'bold 12px "Inter", sans-serif', align: "center"
    });

    var items = [
      { label: "Neural signals", color: c.erp, desc: "Brain responses" },
      { label: "Eye blinks (EOG)", color: "#f39c12", desc: "Large artifacts" },
      { label: "Muscle (EMG)", color: "#e74c3c", desc: "High-frequency" },
      { label: "Electrical noise", color: "#8899aa", desc: "50/60 Hz line" },
    ];

    // Push content toward the left so the panel does not feel right-heavy.
    var startY = 36;
    var rowH = Math.floor((H - startY - 34) / items.length);
    var contentLeft = 8;
    var contentRight = 10;
    var contentW = W - contentLeft - contentRight;
    var traceX = contentLeft;
    var traceW = Math.max(86, contentW * 0.42);
    var labelX = traceX + traceW + 8;

    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var by = startY + i * rowH;
      var rng = mulberry32(200 + i * 1000);

      ctx.beginPath();
      ctx.strokeStyle = item.color;
      ctx.lineWidth = 1.4;
      for (var xi = 0; xi < 60; xi++) {
        var px = traceX + (xi / 59) * traceW;
        var t = xi / 60;
        var val = 0;
        if (i === 0) val = Math.sin(2 * Math.PI * 10 * t * 2) * 0.6 + randn(rng) * 0.2;
        else if (i === 1) val = (t > 0.38 && t < 0.62) ? Math.exp(-Math.pow((t - 0.5) / 0.06, 2)) * 2.2 : randn(rng) * 0.08;
        else if (i === 2) val = randn(rng) * 0.55;
        else val = Math.sin(2 * Math.PI * 60 * t * 2) * 0.35;
        var py = by + rowH / 2 - val * 11;
        if (xi === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();

      drawText(ctx, item.label, labelX, by + rowH / 2 - 7, {
        font: 'bold 10px "Inter", sans-serif', color: item.color
      });
      drawText(ctx, item.desc, labelX, by + rowH / 2 + 8, {
        font: '9px "Inter", sans-serif', color: c.textDim
      });
    }

    // Bottom summary - moved up a bit, larger font
    drawText(ctx, "Raw EEG = mixture of all sources", W / 2, H - 14, {
      font: 'bold 11px "Inter", sans-serif', align: "center", color: c.textDim
    });
  }

  // =====================================================================
  // STEP 3: SINGLE TRIALS (INTERACTIVE)
  // =====================================================================

  function drawStep3Main(canvas) {
    var ctx = canvas.getContext("2d");
    var dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var W = canvas.width / dpr, H = canvas.height / dpr;
    clearCanvas(ctx, W, H);
    var c = getCanvasColors();

    if (!state.trials) return;

    var n = state.params.s3Trials;
    var margins = { top: 28, bottom: 22, left: 45, right: 15 };
    var plotW = W - margins.left - margins.right;
    var plotH = H - margins.top - margins.bottom;
    var baseY = margins.top + plotH / 2;
    var yScale = plotH / 120;

    drawText(ctx, n + " Trial" + (n > 1 ? "s" : "") + " (Overlaid)", W / 2, 14, {
      font: 'bold 13px "Inter", sans-serif', align: "center"
    });

    function toX(s) { return margins.left + (s / EPOCH_LEN) * plotW; }
    function toY(v) { return baseY - v * yScale; }

    var stimX = toX(Math.round(EPOCH_PRE * SR));
    ctx.beginPath();
    ctx.moveTo(stimX, margins.top); ctx.lineTo(stimX, margins.top + plotH);
    ctx.strokeStyle = c.stimulus; ctx.lineWidth = 2; ctx.stroke();
    drawText(ctx, "Stimulus", stimX + 4, margins.top + 8, {
      font: '9px "Inter", sans-serif', color: c.stimulus
    });

    ctx.beginPath();
    ctx.moveTo(margins.left, baseY); ctx.lineTo(margins.left + plotW, baseY);
    ctx.strokeStyle = c.gridLine; ctx.lineWidth = 0.5; ctx.stroke();

    // All N overlaid trials
    var trAlpha = Math.max(0.08, 0.4 / Math.sqrt(n));
    for (var tr = 0; tr < n; tr++) {
      ctx.beginPath();
      ctx.strokeStyle = c.trialTrace;
      ctx.globalAlpha = trAlpha * 3;
      ctx.lineWidth = 1;
      for (var si = 0; si < EPOCH_LEN; si++) {
        var px = toX(si), py = toY(state.trials[tr][si]);
        if (si === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Show averaged waveform on top in green
    if (state.cumSum) {
      var avg = getAverage(state.cumSum, n);
      ctx.beginPath();
      ctx.strokeStyle = c.erpTrue;
      ctx.lineWidth = 2;
      for (var si2 = 0; si2 < EPOCH_LEN; si2++) {
        var px2 = toX(si2), py2 = toY(avg[si2]);
        if (si2 === 0) ctx.moveTo(px2, py2); else ctx.lineTo(px2, py2);
      }
      ctx.stroke();
    }

    // Time labels
    var timeTicks = [-0.2, 0, 0.2, 0.4, 0.6, 0.8];
    for (var ti = 0; ti < timeTicks.length; ti++) {
      var t = timeTicks[ti];
      var tx = toX(Math.round((t + EPOCH_PRE) * SR));
      drawText(ctx, (t * 1000).toFixed(0), tx, margins.top + plotH + 10, {
        font: '9px "Inter", sans-serif', align: "center", color: c.axesLabel
      });
    }
    drawText(ctx, "Time (ms)", margins.left + plotW / 2, H - 3, {
      font: '9px "Inter", sans-serif', align: "center", color: c.axesLabel
    });
    ctx.save();
    ctx.translate(10, margins.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    drawText(ctx, "Voltage (\u00B5V)", 0, 0, {
      font: '9px "Inter", sans-serif', align: "center", color: c.axesLabel
    });
    ctx.restore();
  }

  function drawStep3Left(canvas) {
    var ctx = canvas.getContext("2d");
    var dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var W = canvas.width / dpr, H = canvas.height / dpr;
    clearCanvas(ctx, W, H);
    var c = getCanvasColors();

    var n = state.params.s3Trials;
    drawText(ctx, "Recovered True Signal (N = " + n + ")", W / 2, 16, {
      font: 'bold 12px "Inter", sans-serif', align: "center"
    });

    if (!state.cumSum || !state.erpTemplate) return;

    var margins = { top: 32, bottom: 30, left: 30, right: 15 };
    var plotW = W - margins.left - margins.right;
    var plotH = H - margins.top - margins.bottom;
    var baseY = margins.top + plotH / 2;
    var yScale = plotH / 120;

    function toX(s) { return margins.left + (s / EPOCH_LEN) * plotW; }
    function toY(v) { return baseY - v * yScale; }

    var stimX = toX(Math.round(EPOCH_PRE * SR));
    ctx.beginPath();
    ctx.moveTo(stimX, margins.top); ctx.lineTo(stimX, margins.top + plotH);
    ctx.strokeStyle = c.stimulus; ctx.lineWidth = 1.5; ctx.stroke();

    // Averaged estimate of the true ERP: becomes cleaner as N increases.
    var avg = getAverage(state.cumSum, n);
    ctx.beginPath();
    ctx.strokeStyle = c.erpTrue;
    ctx.lineWidth = 2.5;
    for (var si2 = 0; si2 < EPOCH_LEN; si2++) {
      var px2 = toX(si2), py2 = toY(avg[si2]);
      if (si2 === 0) ctx.moveTo(px2, py2); else ctx.lineTo(px2, py2);
    }
    ctx.stroke();

    drawText(ctx, "More trials \u2192 cleaner estimate of the true ERP", margins.left + plotW / 2, margins.top + plotH + 12, {
      font: '10px "Inter", sans-serif', align: "center", color: c.textDim
    });
  }

  function drawStep3Right(canvas) {
    var ctx = canvas.getContext("2d");
    var dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var W = canvas.width / dpr, H = canvas.height / dpr;
    clearCanvas(ctx, W, H);
    var c = getCanvasColors();

    var n = state.params.s3Trials;
    drawText(ctx, "Signal-to-Noise Ratio", W / 2, 16, {
      font: 'bold 12px "Inter", sans-serif', align: "center"
    });

    // SNR improves with sqrt(N)
    var snr1 = 5.0 / 15.0; // single trial
    var snrN = snr1 * Math.sqrt(n);

    var midX = W / 2;
    var barW = 44;
    var barMaxH = H * 0.44;
    var barY = H * 0.72;
    var refNoise = 15;

    // Signal bar (fixed height = max, stays constant)
    var sigH = barMaxH * (5 / refNoise);
    var sigX = midX - 60;
    ctx.fillStyle = c.erpTrue;
    ctx.globalAlpha = 0.75;
    ctx.fillRect(sigX, barY - sigH, barW, sigH);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = c.erpTrue; ctx.lineWidth = 1;
    ctx.strokeRect(sigX, barY - sigH, barW, sigH);
    drawText(ctx, "Signal", sigX + barW / 2, barY + 14, {
      font: '10px "Inter", sans-serif', align: "center", color: c.erpTrue
    });
    drawText(ctx, "5 \u00B5V", sigX + barW / 2, barY - sigH - 12, {
      font: '10px "Inter", sans-serif', align: "center", color: c.erpTrue
    });

    // Noise bar (shrinks with sqrt(N))
    var noiseH = barMaxH * Math.min(1.0, 1.0 / Math.sqrt(n));
    var noiseX = midX + 18;
    ctx.fillStyle = c.noise;
    ctx.globalAlpha = 0.45;
    ctx.fillRect(noiseX, barY - noiseH, barW, noiseH);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = c.noise; ctx.lineWidth = 1;
    ctx.strokeRect(noiseX, barY - noiseH, barW, noiseH);
    var noiseLabel = (15 / Math.sqrt(n)).toFixed(1);
    drawText(ctx, "Noise", noiseX + barW / 2, barY + 14, {
      font: '10px "Inter", sans-serif', align: "center", color: c.noise
    });
    drawText(ctx, noiseLabel + " \u00B5V", noiseX + barW / 2, barY - noiseH - 12, {
      font: '10px "Inter", sans-serif', align: "center", color: c.noise
    });

    // Baseline reference line
    ctx.beginPath();
    ctx.moveTo(sigX - 10, barY); ctx.lineTo(noiseX + barW + 10, barY);
    ctx.strokeStyle = c.axes; ctx.lineWidth = 1; ctx.stroke();

    // SNR and explanation
    drawText(ctx, "SNR \u2248 " + snrN.toFixed(2), midX, barY + 36, {
      font: 'bold 14px "Inter", sans-serif', align: "center", color: c.sqrtCurve
    });

    var msg = n === 1 ? "Signal buried in noise!" : "SNR \u221D \u221A" + n + " = " + Math.sqrt(n).toFixed(1) + "x better";
    drawText(ctx, msg, midX, barY + 56, {
      font: '10px "Inter", sans-serif', align: "center", color: c.textDim
    });
  }

  // =====================================================================
  // STEP 4: ERPs
  // =====================================================================

  function drawStep4Main(canvas) {
    var ctx = canvas.getContext("2d");
    var dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var W = canvas.width / dpr, H = canvas.height / dpr;
    clearCanvas(ctx, W, H);
    var c = getCanvasColors();

    if (!state.cumSum) return;

    var nTrials = state.params.nTrials;
    var avg = getAverage(state.cumSum, nTrials);
    var margins = { top: 28, bottom: 22, left: 45, right: 15 };
    var plotW = W - margins.left - margins.right;
    var plotH = H - margins.top - margins.bottom;
    var baseY = margins.top + plotH / 2;
    var yScale = plotH / 50;

    drawText(ctx, "Averaged ERP (" + nTrials + " trial" + (nTrials > 1 ? "s" : "") + ")", W / 2, 14, {
      font: 'bold 13px "Inter", sans-serif', align: "center"
    });

    function toX(s) { return margins.left + (s / EPOCH_LEN) * plotW; }
    function toY(v) { return baseY - v * yScale; }

    var stimSample = Math.round(EPOCH_PRE * SR);
    var stimX = toX(stimSample);
    ctx.beginPath();
    ctx.moveTo(stimX, margins.top); ctx.lineTo(stimX, margins.top + plotH);
    ctx.strokeStyle = c.stimulus; ctx.lineWidth = 1.5; ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(margins.left, baseY); ctx.lineTo(margins.left + plotW, baseY);
    ctx.strokeStyle = c.gridLine; ctx.lineWidth = 0.5; ctx.stroke();

    if (nTrials >= 20) {
      var n1s = toX(Math.round((0.080 + EPOCH_PRE) * SR));
      var n1e = toX(Math.round((0.130 + EPOCH_PRE) * SR));
      ctx.fillStyle = "rgba(255, 107, 107, 0.1)";
      ctx.fillRect(n1s, margins.top, n1e - n1s, plotH);

      var p2s = toX(Math.round((0.160 + EPOCH_PRE) * SR));
      var p2e = toX(Math.round((0.250 + EPOCH_PRE) * SR));
      ctx.fillStyle = "rgba(91, 143, 217, 0.1)";
      ctx.fillRect(p2s, margins.top, p2e - p2s, plotH);

      var p3s = toX(Math.round((0.280 + EPOCH_PRE) * SR));
      var p3e = toX(Math.round((0.430 + EPOCH_PRE) * SR));
      ctx.fillStyle = "rgba(245, 166, 35, 0.1)";
      ctx.fillRect(p3s, margins.top, p3e - p3s, plotH);
    }

    ctx.beginPath(); ctx.setLineDash([4, 3]);
    ctx.strokeStyle = c.erpTrue; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.6;
    for (var si = 0; si < EPOCH_LEN; si++) {
      var px = toX(si), py = toY(state.erpTemplate[si]);
      if (si === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;

    ctx.beginPath();
    ctx.strokeStyle = c.erpAvg; ctx.lineWidth = 2.5;
    for (var si2 = 0; si2 < EPOCH_LEN; si2++) {
      var px2 = toX(si2), py2 = toY(avg[si2]);
      if (si2 === 0) ctx.moveTo(px2, py2); else ctx.lineTo(px2, py2);
    }
    ctx.stroke();

    if (nTrials >= 20) {
      var n1S = Math.round((0.100 + EPOCH_PRE) * SR);
      var p2S = Math.round((0.200 + EPOCH_PRE) * SR);
      var p3S = Math.round((0.350 + EPOCH_PRE) * SR);
      drawText(ctx, "N1", toX(n1S), toY(avg[n1S]) + 14, {
        font: 'bold 11px "Inter", sans-serif', align: "center", color: c.n1
      });
      drawText(ctx, "P2", toX(p2S), toY(avg[p2S]) - 12, {
        font: 'bold 11px "Inter", sans-serif', align: "center", color: c.p2
      });
      drawText(ctx, "P3", toX(p3S), toY(avg[p3S]) - 12, {
        font: 'bold 11px "Inter", sans-serif', align: "center", color: c.p3
      });
    }

    var timeTicks = [-0.2, 0, 0.2, 0.4, 0.6, 0.8];
    for (var ti = 0; ti < timeTicks.length; ti++) {
      var t = timeTicks[ti];
      var tx = toX(Math.round((t + EPOCH_PRE) * SR));
      drawText(ctx, (t * 1000).toFixed(0), tx, margins.top + plotH + 10, {
        font: '9px "Inter", sans-serif', align: "center", color: c.axesLabel
      });
    }
    drawText(ctx, "Time (ms)", margins.left + plotW / 2, H - 3, {
      font: '9px "Inter", sans-serif', align: "center", color: c.axesLabel
    });
    ctx.save();
    ctx.translate(10, margins.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    drawText(ctx, "\u00B5V", 0, 0, {
      font: '9px "Inter", sans-serif', align: "center", color: c.axesLabel
    });
    ctx.restore();
  }

  function drawStep4Left(canvas) {
    var ctx = canvas.getContext("2d");
    var dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var W = canvas.width / dpr, H = canvas.height / dpr;
    clearCanvas(ctx, W, H);
    var c = getCanvasColors();

    drawText(ctx, "\u221AN Improvement Law", W / 2, 16, {
      font: 'bold 12px "Inter", sans-serif', align: "center"
    });

    var margins = { top: 35, bottom: 35, left: 45, right: 15 };
    var plotW = W - margins.left - margins.right;
    var plotH = H - margins.top - margins.bottom;

    var maxN = MAX_TRIALS;
    var baseSNR = 5 / (15 * state.params.noiseLevel);
    var maxSNR = baseSNR * Math.sqrt(maxN);

    function toX(n) { return margins.left + (n / maxN) * plotW; }
    function toY(snr) { return margins.top + plotH - (snr / maxSNR) * plotH; }

    ctx.beginPath();
    ctx.strokeStyle = c.gridLine; ctx.lineWidth = 0.5;
    var gridNs = [1, 50, 100, 150, 200];
    for (var gi = 0; gi < gridNs.length; gi++) {
      var gx = toX(gridNs[gi]);
      ctx.moveTo(gx, margins.top); ctx.lineTo(gx, margins.top + plotH);
    }
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(margins.left, margins.top);
    ctx.lineTo(margins.left, margins.top + plotH);
    ctx.lineTo(margins.left + plotW, margins.top + plotH);
    ctx.strokeStyle = c.axes; ctx.lineWidth = 1; ctx.stroke();

    ctx.beginPath();
    ctx.strokeStyle = c.sqrtCurve; ctx.lineWidth = 2;
    for (var n = 1; n <= maxN; n++) {
      var snr = baseSNR * Math.sqrt(n);
      var px = toX(n), py = toY(snr);
      if (n === 1) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();

    var curN = state.params.nTrials;
    var curSNR = baseSNR * Math.sqrt(curN);
    var mx = toX(curN), my = toY(curSNR);

    ctx.beginPath(); ctx.setLineDash([3, 3]);
    ctx.moveTo(mx, margins.top + plotH); ctx.lineTo(mx, my);
    ctx.strokeStyle = c.erpAvg; ctx.lineWidth = 1; ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(mx, my, 5, 0, 2 * Math.PI);
    ctx.fillStyle = c.erpAvg; ctx.fill();
    drawText(ctx, "SNR = " + curSNR.toFixed(1), mx + 8, my - 10, {
      font: 'bold 10px "Inter", sans-serif', color: c.erpAvg
    });

    drawText(ctx, "Number of Trials", margins.left + plotW / 2, H - 8, {
      font: '9px "Inter", sans-serif', align: "center", color: c.axesLabel
    });
    ctx.save();
    ctx.translate(12, margins.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    drawText(ctx, "SNR", 0, 0, {
      font: '9px "Inter", sans-serif', align: "center", color: c.axesLabel
    });
    ctx.restore();

    for (var xi = 0; xi < gridNs.length; xi++) {
      drawText(ctx, gridNs[xi].toString(), toX(gridNs[xi]), margins.top + plotH + 12, {
        font: '8px "Inter", sans-serif', align: "center", color: c.axesLabel
      });
    }
    drawText(ctx, "SNR \u221D \u221AN", margins.left + plotW / 2, margins.top + 10, {
      font: 'bold 11px "Inter", sans-serif', align: "center", color: c.sqrtCurve
    });
  }

  function drawStep4Right(canvas) {
    var ctx = canvas.getContext("2d");
    var dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var W = canvas.width / dpr, H = canvas.height / dpr;
    clearCanvas(ctx, W, H);
    var c = getCanvasColors();

    drawText(ctx, "Why Averaging Works", W / 2, 16, {
      font: 'bold 12px "Inter", sans-serif', align: "center"
    });

    if (!state.trials) return;

    var nTrials = state.params.nTrials;
    var nShow = nTrials;
    var traceAlpha = Math.max(0.012, 0.15 / Math.sqrt(nShow + 2));

    var margins = { top: 28, left: 10, right: 10 };
    var halfW = (W - margins.left - margins.right) / 2 - 8;
    var traceAreaH = H * 0.31;
    var avgAreaH = 28;

    var topY = margins.top + 12;

    // LEFT PANEL: Noise
    var noiseX = margins.left;
    drawText(ctx, "Noise only", noiseX + halfW / 2, margins.top, {
      font: 'bold 10px "Inter", sans-serif', align: "center", color: c.noise
    });

    for (var tr = 0; tr < nShow; tr++) {
      ctx.beginPath();
      ctx.strokeStyle = c.noise;
      ctx.globalAlpha = traceAlpha;
      ctx.lineWidth = 0.8;
      for (var si = 0; si < EPOCH_LEN; si += 2) {
        var px = noiseX + (si / EPOCH_LEN) * halfW;
        var noiseVal = state.trials[tr][si] - state.erpTemplate[si];
        var py = topY + traceAreaH / 2 - noiseVal * 0.7;
        if (si === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Average of noise
    var avgNoiseY = topY + traceAreaH + 8;
    drawText(ctx, "\u2193 Average", noiseX + halfW / 2, avgNoiseY, {
      font: '9px "Inter", sans-serif', align: "center", color: c.textDim
    });
    avgNoiseY += 12;

    ctx.beginPath();
    ctx.strokeStyle = c.noise; ctx.lineWidth = 2.5;
    var noiseAvg = new Float64Array(EPOCH_LEN);
    for (var si2 = 0; si2 < EPOCH_LEN; si2++) {
      for (var tr2 = 0; tr2 < nShow; tr2++) noiseAvg[si2] += state.trials[tr2][si2] - state.erpTemplate[si2];
      noiseAvg[si2] /= nShow;
    }
    for (var si3 = 0; si3 < EPOCH_LEN; si3 += 2) {
      var px3 = noiseX + (si3 / EPOCH_LEN) * halfW;
      var py3 = avgNoiseY + avgAreaH / 2 - noiseAvg[si3] * 0.7;
      if (si3 === 0) ctx.moveTo(px3, py3); else ctx.lineTo(px3, py3);
    }
    ctx.stroke();

    // Elaborate noise explanation
    var noiseTextY = avgNoiseY + avgAreaH + 8;
    drawText(ctx, "\u2248 0 \u00B5V — cancels out!", noiseX + halfW / 2, noiseTextY, {
      font: 'bold 10px "Inter", sans-serif', align: "center", color: c.noise
    });
    var noiseExpl = [
      "Noise is random and",
      "uncorrelated across trials.",
      "Averaging N trials shrinks",
      "noise amplitude by \u221AN."
    ];
    ctx.font = '9px "Inter", sans-serif';
    ctx.fillStyle = c.textDim;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (var li = 0; li < noiseExpl.length; li++) {
      ctx.fillText(noiseExpl[li], noiseX + halfW / 2, noiseTextY + 12 + li * 12);
    }

    // RIGHT PANEL: Signal + noise
    var sigX = margins.left + halfW + 16;
    drawText(ctx, "Signal + Noise", sigX + halfW / 2, margins.top, {
      font: 'bold 10px "Inter", sans-serif', align: "center", color: c.erpAvg
    });

    for (var tr3 = 0; tr3 < nShow; tr3++) {
      ctx.beginPath();
      ctx.strokeStyle = c.erpAvg;
      ctx.globalAlpha = traceAlpha;
      ctx.lineWidth = 0.8;
      for (var si4 = 0; si4 < EPOCH_LEN; si4 += 2) {
        var px4 = sigX + (si4 / EPOCH_LEN) * halfW;
        var py4 = topY + traceAreaH / 2 - state.trials[tr3][si4] * 0.7;
        if (si4 === 0) ctx.moveTo(px4, py4); else ctx.lineTo(px4, py4);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    var avgSigY = topY + traceAreaH + 8;
    drawText(ctx, "\u2193 Average", sigX + halfW / 2, avgSigY, {
      font: '9px "Inter", sans-serif', align: "center", color: c.textDim
    });
    avgSigY += 12;

    if (state.cumSum) {
      var avg = getAverage(state.cumSum, nShow);
      ctx.beginPath();
      ctx.strokeStyle = c.erpAvg; ctx.lineWidth = 2.5;
      for (var si5 = 0; si5 < EPOCH_LEN; si5 += 2) {
        var px5 = sigX + (si5 / EPOCH_LEN) * halfW;
        var py5 = avgSigY + avgAreaH / 2 - avg[si5] * 0.7;
        if (si5 === 0) ctx.moveTo(px5, py5); else ctx.lineTo(px5, py5);
      }
      ctx.stroke();

      // True ERP dashed
      ctx.beginPath(); ctx.setLineDash([3, 2]);
      ctx.strokeStyle = c.erpTrue; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.55;
      for (var si6 = 0; si6 < EPOCH_LEN; si6 += 2) {
        var px6 = sigX + (si6 / EPOCH_LEN) * halfW;
        var py6 = avgSigY + avgAreaH / 2 - state.erpTemplate[si6] * 0.7;
        if (si6 === 0) ctx.moveTo(px6, py6); else ctx.lineTo(px6, py6);
      }
      ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    }

    // Elaborate signal explanation
    var sigTextY = avgSigY + avgAreaH + 8;
    drawText(ctx, "\u2248 True ERP — emerges!", sigX + halfW / 2, sigTextY, {
      font: 'bold 10px "Inter", sans-serif', align: "center", color: c.erpTrue
    });
    var sigExpl = [
      "Brain response is consistent",
      "across trials (same stimulus).",
      "Signal survives averaging",
      "and becomes visible."
    ];
    ctx.font = '9px "Inter", sans-serif';
    ctx.fillStyle = c.textDim;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (var li2 = 0; li2 < sigExpl.length; li2++) {
      ctx.fillText(sigExpl[li2], sigX + halfW / 2, sigTextY + 12 + li2 * 12);
    }
  }

  // =====================================================================
  // STEP 5: OSCILLATIONS
  // =====================================================================

  function drawStep5Main(canvas) {
    var ctx = canvas.getContext("2d");
    var dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var W = canvas.width / dpr, H = canvas.height / dpr;
    clearCanvas(ctx, W, H);
    var c = getCanvasColors();

    if (!state.bandData) return;

    var margins = { top: 10, bottom: 8, left: 58, right: 10 };
    var plotW = W - margins.left - margins.right;
    var totalH = H - margins.top - margins.bottom;
    var nRows = 5;
    var rowH = totalH / nRows;
    var samplesShow = Math.min(OSC_N, SR * 2);
    var selected = state.params.selectedBand;

    function drawTrace(signal, yCenter, amp, color, lineW, alpha) {
      ctx.beginPath();
      ctx.strokeStyle = color; ctx.lineWidth = lineW; ctx.globalAlpha = alpha;
      for (var si = 0; si < samplesShow; si++) {
        var px = margins.left + (si / samplesShow) * plotW;
        var py = yCenter - signal[si] * amp;
        if (si === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke(); ctx.globalAlpha = 1;
    }

    var compY = margins.top + rowH / 2;
    drawText(ctx, "Composite", margins.left - 4, compY, {
      font: 'bold 9px "Inter", sans-serif', align: "right", color: c.text
    });
    drawTrace(state.bandData.composite, compY, rowH * 0.07, c.signal, 1.5, 1);

    ctx.beginPath();
    ctx.moveTo(margins.left, margins.top + rowH); ctx.lineTo(margins.left + plotW, margins.top + rowH);
    ctx.strokeStyle = c.gridLine; ctx.lineWidth = 0.5; ctx.stroke();

    for (var bi = 0; bi < BAND_ORDER.length; bi++) {
      var bName = BAND_ORDER[bi];
      var band = BANDS[bName];
      var by = margins.top + (bi + 1) * rowH + rowH / 2;
      var isSelected = bName === selected;

      drawText(ctx, band.label.split(" ")[0], margins.left - 4, by, {
        font: (isSelected ? "bold " : "") + '9px "Inter", sans-serif',
        align: "right",
        color: isSelected ? band.color : c.textDim
      });

      drawTrace(state.bandData.bands[bName], by, rowH * 0.13, band.color, isSelected ? 2 : 1, isSelected ? 1 : 0.3);

      if (bi < BAND_ORDER.length - 1) {
        ctx.beginPath();
        ctx.moveTo(margins.left, margins.top + (bi + 2) * rowH);
        ctx.lineTo(margins.left + plotW, margins.top + (bi + 2) * rowH);
        ctx.strokeStyle = c.gridLine; ctx.lineWidth = 0.3; ctx.stroke();
      }
    }
  }

  function drawStep5Left(canvas) {
    var ctx = canvas.getContext("2d");
    var dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var W = canvas.width / dpr, H = canvas.height / dpr;
    clearCanvas(ctx, W, H);
    var c = getCanvasColors();

    drawText(ctx, "Power Spectrum", W / 2, 16, {
      font: 'bold 12px "Inter", sans-serif', align: "center"
    });

    if (!state.bandData) return;

    var spec = computeSpectrum(state.bandData.composite);
    var margins = { top: 35, bottom: 30, left: 40, right: 15 };
    var plotW = W - margins.left - margins.right;
    var plotH = H - margins.top - margins.bottom;
    var minFreq = 1, maxFreq = 35;

    var maxPow = 0;
    for (var k = 0; k < spec.freqs.length; k++) {
      if (spec.freqs[k] >= minFreq && spec.freqs[k] <= maxFreq && spec.power[k] > maxPow) maxPow = spec.power[k];
    }

    function toX(f) { return margins.left + ((f - minFreq) / (maxFreq - minFreq)) * plotW; }
    function toY(p) { return margins.top + plotH - (p / maxPow) * plotH; }

    var selected = state.params.selectedBand;
    var selBand = BANDS[selected];
    ctx.fillStyle = selBand.color; ctx.globalAlpha = 0.15;
    ctx.fillRect(toX(selBand.lo), margins.top, toX(selBand.hi) - toX(selBand.lo), plotH);
    ctx.globalAlpha = 1;

    ctx.beginPath();
    ctx.moveTo(margins.left, margins.top); ctx.lineTo(margins.left, margins.top + plotH);
    ctx.lineTo(margins.left + plotW, margins.top + plotH);
    ctx.strokeStyle = c.axes; ctx.lineWidth = 1; ctx.stroke();

    ctx.beginPath();
    ctx.strokeStyle = c.signal; ctx.lineWidth = 1.5;
    var started = false;
    for (var k2 = 0; k2 < spec.freqs.length; k2++) {
      if (spec.freqs[k2] < minFreq || spec.freqs[k2] > maxFreq) continue;
      var px = toX(spec.freqs[k2]), py = toY(spec.power[k2]);
      if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py);
    }
    ctx.stroke();

    var fTicks = [1, 5, 10, 15, 20, 25, 30, 35];
    for (var fi = 0; fi < fTicks.length; fi++) {
      drawText(ctx, fTicks[fi].toString(), toX(fTicks[fi]), margins.top + plotH + 12, {
        font: '8px "Inter", sans-serif', align: "center", color: c.axesLabel
      });
    }
    drawText(ctx, "Frequency (Hz)", margins.left + plotW / 2, H - 6, {
      font: '9px "Inter", sans-serif', align: "center", color: c.axesLabel
    });
    ctx.save();
    ctx.translate(12, margins.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    drawText(ctx, "Power", 0, 0, { font: '9px "Inter", sans-serif', align: "center", color: c.axesLabel });
    ctx.restore();

    drawText(ctx, selBand.label, toX((selBand.lo + selBand.hi) / 2), margins.top + 12, {
      font: 'bold 10px "Inter", sans-serif', align: "center", color: selBand.color
    });
  }

  function drawStep5Right(canvas) {
    var ctx = canvas.getContext("2d");
    var dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var W = canvas.width / dpr, H = canvas.height / dpr;
    clearCanvas(ctx, W, H);
    var c = getCanvasColors();

    drawText(ctx, "Time-Frequency (Spectrogram)", W / 2, 16, {
      font: 'bold 12px "Inter", sans-serif', align: "center"
    });

    if (!state.bandData) return;

    var winSamples = 128, hopSamples = 16;
    var sg = computeSpectrogram(state.bandData.composite, winSamples, hopSamples);

    var margins = { top: 32, bottom: 30, left: 38, right: 15 };
    var plotW = W - margins.left - margins.right;
    var plotH = H - margins.top - margins.bottom;
    var minFreq = 1, maxFreq = 35;

    var minFi = 0, maxFi = sg.nFreqs;
    for (var k = 0; k < sg.nFreqs; k++) {
      if (sg.freqBins[k] >= minFreq && minFi === 0) minFi = k;
      if (sg.freqBins[k] <= maxFreq) maxFi = k;
    }

    var logMin = Infinity, logMax = -Infinity;
    for (var fi = minFi; fi <= maxFi; fi++) {
      for (var ti = 0; ti < sg.nFrames; ti++) {
        var lp = Math.log10(sg.spec[ti][fi] + 1e-10);
        if (lp < logMin) logMin = lp;
        if (lp > logMax) logMax = lp;
      }
    }

    var cellW = Math.ceil(plotW / sg.nFrames) + 1;
    var nFreqBins = maxFi - minFi + 1;
    var cellH = Math.ceil(plotH / nFreqBins) + 1;

    for (var ti2 = 0; ti2 < sg.nFrames; ti2++) {
      var px = margins.left + (ti2 / sg.nFrames) * plotW;
      for (var fi2 = minFi; fi2 <= maxFi; fi2++) {
        var lp2 = Math.log10(sg.spec[ti2][fi2] + 1e-10);
        var norm = Math.max(0, Math.min(1, (lp2 - logMin) / (logMax - logMin + 1e-10)));
        var r, g, b;
        if (norm < 0.5) {
          r = Math.round(68 + norm * 2 * (49 - 68 + 100));
          g = Math.round(1 + norm * 2 * 104);
          b = Math.round(84 + norm * 2 * 88);
        } else {
          r = Math.round(68 + norm * (253 - 68));
          g = Math.round(1 + norm * (231 - 1));
          b = Math.round(84 + (1 - norm) * (170 - 84));
        }
        ctx.fillStyle = "rgb(" + r + "," + g + "," + b + ")";
        var py = margins.top + plotH - ((fi2 - minFi) / nFreqBins) * plotH;
        ctx.fillRect(px, py - cellH, cellW, cellH);
      }
    }

    // Band markers - high-contrast dotted guides so each band is easy to locate.
    var selected = state.params.selectedBand;
    for (var bi = 0; bi < BAND_ORDER.length; bi++) {
      var bName = BAND_ORDER[bi];
      var band = BANDS[bName];
      var isSelected = bName === selected;
      var yTop = margins.top + plotH - ((band.hi - minFreq) / (maxFreq - minFreq)) * plotH;
      var yBot = margins.top + plotH - ((band.lo - minFreq) / (maxFreq - minFreq)) * plotH;
      yTop = Math.max(margins.top, Math.min(margins.top + plotH, yTop));
      yBot = Math.max(margins.top, Math.min(margins.top + plotH, yBot));

      ctx.fillStyle = band.color;
      ctx.globalAlpha = isSelected ? 0.12 : 0.05;
      ctx.fillRect(margins.left, yTop, plotW, yBot - yTop);
      ctx.globalAlpha = 1;

      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = isSelected ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.65)";
      ctx.lineWidth = isSelected ? 2.4 : 1.8;
      ctx.beginPath();
      ctx.moveTo(margins.left, yTop); ctx.lineTo(margins.left + plotW, yTop);
      ctx.moveTo(margins.left, yBot); ctx.lineTo(margins.left + plotW, yBot);
      ctx.stroke();

      ctx.strokeStyle = band.color;
      ctx.lineWidth = isSelected ? 1.8 : 1.2;
      ctx.beginPath();
      ctx.moveTo(margins.left, yTop); ctx.lineTo(margins.left + plotW, yTop);
      ctx.moveTo(margins.left, yBot); ctx.lineTo(margins.left + plotW, yBot);
      ctx.stroke();
      ctx.setLineDash([]);

      drawText(ctx, bName.charAt(0).toUpperCase() + bName.slice(1), margins.left + plotW - 4, yTop + 8, {
        font: (isSelected ? "bold " : "") + '8px "Inter", sans-serif',
        align: "right",
        color: isSelected ? band.color : "rgba(230,235,240,0.9)"
      });
    }

    // Axis labels
    var tTicks = [0, 1, 2, 3, 4];
    for (var tti = 0; tti < tTicks.length; tti++) {
      var ttFrac = tTicks[tti] / OSC_DUR;
      var ttx = margins.left + ttFrac * plotW;
      if (ttx > margins.left + plotW + 2) continue;
      drawText(ctx, tTicks[tti] + "s", ttx, margins.top + plotH + 12, {
        font: '8px "Inter", sans-serif', align: "center", color: c.axesLabel
      });
    }
    drawText(ctx, "Time", margins.left + plotW / 2, H - 6, {
      font: '9px "Inter", sans-serif', align: "center", color: c.axesLabel
    });

    var fTicks = [5, 10, 15, 20, 25, 30];
    for (var fti = 0; fti < fTicks.length; fti++) {
      var fy = margins.top + plotH - ((fTicks[fti] - minFreq) / (maxFreq - minFreq)) * plotH;
      drawText(ctx, fTicks[fti].toString(), margins.left - 5, fy, {
        font: '8px "Inter", sans-serif', align: "right", color: c.axesLabel
      });
    }
    ctx.save();
    ctx.translate(8, margins.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    drawText(ctx, "Hz", 0, 0, { font: '9px "Inter", sans-serif', align: "center", color: c.axesLabel });
    ctx.restore();
  }

  // =====================================================================
  // STEP 6: ERPs vs OSCILLATIONS
  // =====================================================================

  function drawStep6Main(canvas) {
    var ctx = canvas.getContext("2d");
    var dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var W = canvas.width / dpr, H = canvas.height / dpr;
    clearCanvas(ctx, W, H);
    var c = getCanvasColors();

    var halfW = (W - 20) / 2;
    var margins = { top: 28, bottom: 18, left: 30, right: 8 };

    drawText(ctx, "Two Complementary Approaches", W / 2, 14, {
      font: 'bold 13px "Inter", sans-serif', align: "center"
    });

    // LEFT: ERP view (always shown)
    var erpX = 5;
    drawText(ctx, "ERPs: Time-Locked Averaging", erpX + halfW / 2, margins.top, {
      font: 'bold 10px "Inter", sans-serif', align: "center", color: c.erpAvg
    });

    if (state.cumSum) {
      var plotTop = margins.top + 12;
      var plotH = H - plotTop - margins.bottom;
      var baseY = plotTop + plotH / 2;
      var yScale = plotH / 40;
      var avg = getAverage(state.cumSum, 100);

      var stimS = Math.round(EPOCH_PRE * SR);
      var stimPx = erpX + margins.left + (stimS / EPOCH_LEN) * (halfW - margins.left - margins.right);
      ctx.beginPath();
      ctx.moveTo(stimPx, plotTop); ctx.lineTo(stimPx, plotTop + plotH);
      ctx.strokeStyle = c.stimulus; ctx.lineWidth = 1; ctx.stroke();

      ctx.beginPath();
      ctx.strokeStyle = c.erpAvg; ctx.lineWidth = 2;
      for (var si = 0; si < EPOCH_LEN; si++) {
        var px = erpX + margins.left + (si / EPOCH_LEN) * (halfW - margins.left - margins.right);
        var py = baseY - avg[si] * yScale;
        if (si === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();

      var n1S = Math.round((0.100 + EPOCH_PRE) * SR);
      var p3S = Math.round((0.350 + EPOCH_PRE) * SR);
      drawText(ctx, "N1", erpX + margins.left + (n1S / EPOCH_LEN) * (halfW - margins.left - margins.right), baseY - avg[n1S] * yScale + 12, {
        font: 'bold 9px "Inter", sans-serif', align: "center", color: c.n1
      });
      drawText(ctx, "P3", erpX + margins.left + (p3S / EPOCH_LEN) * (halfW - margins.left - margins.right), baseY - avg[p3S] * yScale - 10, {
        font: 'bold 9px "Inter", sans-serif', align: "center", color: c.p3
      });
    }

    // Divider
    var divX = W / 2;
    ctx.beginPath();
    ctx.moveTo(divX, margins.top - 5); ctx.lineTo(divX, H - margins.bottom);
    ctx.strokeStyle = c.gridLine; ctx.lineWidth = 1; ctx.stroke();
    drawText(ctx, "vs", divX, H / 2, {
      font: 'bold 12px "Inter", sans-serif', align: "center", color: c.textDim
    });

    // RIGHT: Oscillation view (always shown)
    var oscX = W / 2 + 5;
    drawText(ctx, "Oscillations: Frequency Bands", oscX + halfW / 2, margins.top, {
      font: 'bold 10px "Inter", sans-serif', align: "center", color: BANDS.alpha.color
    });

    if (state.bandData) {
      var bandPlotTop = margins.top + 14;
      var bandPlotH = (H - bandPlotTop - margins.bottom) / 4;
      var showN = Math.min(OSC_N, SR * 2);

      for (var bi = 0; bi < BAND_ORDER.length; bi++) {
        var bName = BAND_ORDER[bi];
        var band = BANDS[bName];
        var by = bandPlotTop + bi * bandPlotH + bandPlotH / 2;

        drawText(ctx, bName.charAt(0).toUpperCase() + bName.slice(1), oscX + 2, by, {
          font: '8px "Inter", sans-serif', color: band.color
        });

        ctx.beginPath();
        ctx.strokeStyle = band.color; ctx.lineWidth = 1.2;
        for (var si2 = 0; si2 < showN; si2 += 2) {
          var px2 = oscX + 42 + (si2 / showN) * (halfW - 47);
          var py2 = by - state.bandData.bands[bName][si2] * bandPlotH * 0.12;
          if (si2 === 0) ctx.moveTo(px2, py2); else ctx.lineTo(px2, py2);
        }
        ctx.stroke();
      }
    }
  }

  function drawStep6Left(canvas) {
    var ctx = canvas.getContext("2d");
    var dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var W = canvas.width / dpr, H = canvas.height / dpr;
    clearCanvas(ctx, W, H);
    var c = getCanvasColors();

    drawText(ctx, "Comparing the Two Approaches", W / 2, 16, {
      font: 'bold 12px "Inter", sans-serif', align: "center"
    });

    var startY = 38;
    var tableW = W - 34;
    var startX = (W - tableW) / 2;
    var colW = tableW / 3;
    var headers = ["", "ERPs", "Oscillations"];
    var rows = [
      ["Focus:", "Time-locked events", "Ongoing rhythms"],
      ["Method:", "Trial averaging", "Freq. decomposition"],
      ["Reveals:", "Response timing", "Brain state"],
      ["Question:", "\"When does the", "\"What cognitive"],
      ["", "brain respond?\"", "state is active?\""],
    ];

    for (var hi = 0; hi < headers.length; hi++) {
      var hx = startX + (hi + 0.5) * colW;
      drawText(ctx, headers[hi], hx, startY, {
        font: 'bold 11px "Inter", sans-serif',
        align: "center",
        color: hi === 1 ? c.erpAvg : hi === 2 ? BANDS.alpha.color : c.text
      });
    }

    ctx.beginPath();
    ctx.moveTo(startX, startY + 11); ctx.lineTo(startX + tableW, startY + 11);
    ctx.strokeStyle = c.gridLine; ctx.lineWidth = 0.5; ctx.stroke();

    for (var ri = 0; ri < rows.length; ri++) {
      var ry = startY + 28 + ri * 24;
      for (var ci = 0; ci < rows[ri].length; ci++) {
        var rx = startX + (ci + 0.5) * colW;
        drawText(ctx, rows[ri][ci], rx, ry, {
          font: (ci === 0 ? "bold " : "") + '10.5px "Inter", sans-serif',
          align: "center",
          color: ci === 0 ? c.textDim : c.text
        });
      }
    }

    drawText(ctx, "Both approaches are complementary \u2014", W / 2, H - 36, {
      font: '11px "Inter", sans-serif', align: "center", color: c.textDim
    });
    drawText(ctx, "modern EEG research uses both!", W / 2, H - 20, {
      font: 'bold 11px "Inter", sans-serif', align: "center", color: c.electrode
    });
  }

  function drawStep6Right(canvas) {
    var ctx = canvas.getContext("2d");
    var dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var W = canvas.width / dpr, H = canvas.height / dpr;
    clearCanvas(ctx, W, H);
    var c = getCanvasColors();

    drawText(ctx, "Event-Related Spectral Changes", W / 2, 16, {
      font: 'bold 12px "Inter", sans-serif', align: "center"
    });

    var margins = { top: 35, bottom: 30, left: 38, right: 15 };
    var plotW = W - margins.left - margins.right;
    var plotH = H - margins.top - margins.bottom;
    var nTimeSteps = 40, nFreqSteps = 20;
    var minFreq = 2, maxFreq = 30;
    var stimTimeIdx = Math.floor(nTimeSteps * 0.3);

    for (var ti = 0; ti < nTimeSteps; ti++) {
      for (var fi = 0; fi < nFreqSteps; fi++) {
        var freq = minFreq + (fi / nFreqSteps) * (maxFreq - minFreq);
        var tRel = (ti - stimTimeIdx) / nTimeSteps;
        var basePow = 1.0 / (1 + freq * 0.1);
        var alphaDist = Math.abs(freq - 10) / 3;
        var alphaPow = 0.5 * Math.exp(-alphaDist * alphaDist);
        var suppress = 0;
        if (tRel > 0 && tRel < 0.5) suppress = 0.4 * Math.exp(-Math.pow((tRel - 0.2) / 0.12, 2));
        var thetaDist = Math.abs(freq - 6) / 2;
        var thetaBoost = 0;
        if (tRel > 0 && tRel < 0.4) thetaBoost = 0.3 * Math.exp(-thetaDist * thetaDist) * Math.exp(-Math.pow((tRel - 0.15) / 0.1, 2));
        var power = basePow + alphaPow - suppress * alphaPow + thetaBoost;
        var norm = Math.min(1, Math.max(0, power / 1.2));
        var r, g, b;
        if (norm < 0.5) {
          r = Math.round(norm * 2 * 200); g = Math.round(norm * 2 * 150); b = Math.round(120 + norm * 2 * 80);
        } else {
          r = Math.round(200 + (norm - 0.5) * 2 * 55);
          g = Math.round(150 - (norm - 0.5) * 2 * 100);
          b = Math.round(200 - (norm - 0.5) * 2 * 150);
        }
        var px = margins.left + (ti / nTimeSteps) * plotW;
        var py = margins.top + plotH - (fi / nFreqSteps) * plotH;
        var cw = Math.ceil(plotW / nTimeSteps) + 1;
        var ch = Math.ceil(plotH / nFreqSteps) + 1;
        ctx.fillStyle = "rgb(" + r + "," + g + "," + b + ")";
        ctx.fillRect(px, py - ch, cw, ch);
      }
    }

    // Stimulus line
    var stimPx = margins.left + (stimTimeIdx / nTimeSteps) * plotW;
    ctx.beginPath();
    ctx.moveTo(stimPx, margins.top); ctx.lineTo(stimPx, margins.top + plotH);
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]); ctx.stroke();
    ctx.setLineDash([]);
    drawText(ctx, "Stim", stimPx + 3, margins.top + 9, { font: '9px "Inter", sans-serif', color: "#fff" });

    // Annotations - larger text
    var alphaY = margins.top + plotH - ((10 - minFreq) / (maxFreq - minFreq)) * plotH;
    drawText(ctx, "\u2190 Alpha drops", margins.left + plotW - 4, alphaY - 4, {
      font: 'bold 11px "Inter", sans-serif', align: "right", color: "#ffbbbb"
    });
    drawText(ctx, "(cortex less inhibited)", margins.left + plotW - 4, alphaY + 10, {
      font: '9px "Inter", sans-serif', align: "right", color: "#ffbbbb"
    });

    var thetaY = margins.top + plotH - ((6 - minFreq) / (maxFreq - minFreq)) * plotH;
    drawText(ctx, "\u2190 Theta rises", margins.left + plotW - 4, thetaY - 4, {
      font: 'bold 11px "Inter", sans-serif', align: "right", color: "#bbffbb"
    });
    drawText(ctx, "(memory encoding active)", margins.left + plotW - 4, thetaY + 10, {
      font: '9px "Inter", sans-serif', align: "right", color: "#bbffbb"
    });

    // Axis labels
    drawText(ctx, "Time", margins.left + plotW / 2, H - 8, {
      font: '9px "Inter", sans-serif', align: "center", color: c.axesLabel
    });
    ctx.save();
    ctx.translate(10, margins.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    drawText(ctx, "Frequency (Hz)", 0, 0, { font: '9px "Inter", sans-serif', align: "center", color: c.axesLabel });
    ctx.restore();

    var fTicks2 = [5, 10, 15, 20, 25];
    for (var fti = 0; fti < fTicks2.length; fti++) {
      var fy = margins.top + plotH - ((fTicks2[fti] - minFreq) / (maxFreq - minFreq)) * plotH;
      drawText(ctx, fTicks2[fti].toString(), margins.left - 4, fy, {
        font: '8px "Inter", sans-serif', align: "right", color: c.axesLabel
      });
    }
  }

  // =====================================================================
  // UI STATE
  // =====================================================================

  var state = {
    step: 0,
    seed: 42,
    params: {
      noiseLevel: 1.0,
      nTrials: 1,
      s3Trials: 1,
      selectedBand: "alpha",
      bandPowers: { delta: 1.0, theta: 1.0, alpha: 2.0, beta: 1.0 },
    },
    channels: null,
    trials: null,
    erpTemplate: null,
    cumSum: null,
    bandData: null,
    scrollOffset: 0,
    rawAbsSample: 0,
    blinkEvents: [],
    step1ShiftAccumulator: 0,
    step1ShiftIndex: 0,
    animFrameId: null,
    sparkBuffers: null,
  };

  var STEP_INFO = [
    "",
    '<strong>Step 1: What is EEG?</strong> Electroencephalography (EEG) measures tiny voltage fluctuations on the scalp using electrodes. These voltages reflect the summed electrical activity of <em>millions</em> of neurons in the brain. Because signals must pass through cortex, cerebrospinal fluid, skull, and scalp, what we record is a blurred, noisy mixture of many neural sources. The signal is typically on the order of microvolts (\u00B5V).',
    '<strong>Step 2: Raw EEG.</strong> Raw EEG from multiple electrodes shows a complex, noisy signal \u2014 a mixture of neural activity, muscle artifacts (EMG), eye movements (EOG), and electrical noise. Each channel records a slightly different mix depending on electrode placement. Notice the characteristic shape: lower frequencies have larger amplitudes (the \u201C1/f\u201D pattern). From raw EEG alone, individual cognitive events are not visible. Use the noise slider to amplify or reduce the apparent noise level.',
    '<strong>Step 3: Single Trials.</strong> When we present a stimulus, the brain produces a response. But any single trial is dominated by noise \u2014 the ongoing EEG is much larger than the evoked response. Use the slider to add more trials: the overlaid traces converge and the averaged signal (green line) gradually emerges. The signal-to-noise ratio improves by \u221AN \u2014 averaging 9 trials gives 3\u00D7 better SNR.',
    '<strong>Step 4: Event-Related Potentials.</strong> An ERP is the brain\'s average response to a repeated event. By averaging many trials, random noise cancels out while the consistent brain response remains. The SNR improves by \u221AN. <em>Drag the slider</em> to watch the ERP emerge! Classic components: <strong>N1</strong> (~100ms, early sensory processing), <strong>P2</strong> (~200ms, stimulus evaluation), <strong>P3</strong> (~350ms, attention & memory updating). Named by polarity (N=negative, P=positive) and approximate latency.',
    '<strong>Step 5: Brain Oscillations.</strong> EEG contains rhythmic activity at different frequencies. Power is the signal energy at a frequency, so higher power means a stronger rhythm. <strong>Delta</strong> (1\u20134 Hz) dominates deep sleep; <strong>Theta</strong> (4\u20138 Hz) is linked to memory encoding; <strong>Alpha</strong> (8\u201313 Hz) appears during relaxed wakefulness; <strong>Beta</strong> (13\u201330 Hz) is associated with active processing. Adjust the power sliders to change each band\'s amplitude and watch the spectrum change.',
    '<strong>Step 6: ERPs vs. Oscillations \u2014 Two Windows into the Brain.</strong> ERPs and oscillations are complementary. <em>ERPs</em> use time-locked averaging to reveal the brain\'s response to events \u2014 \u201Cwhen and how does the brain respond?\u201D <em>Oscillations</em> use frequency decomposition to reveal rhythmic brain states \u2014 \u201Cwhat cognitive state is the brain currently in?\u201D Modern EEG research examines both: a stimulus can produce an ERP <em>and</em> cause oscillatory changes (e.g., alpha suppression = cortex becomes less inhibited; theta rise = memory encoding active), visible in time-frequency analysis.',
  ];

  function getEl(id) { return document.getElementById(id); }

  function setRangeFill(slider) {
    if (!slider) return;
    var min = parseFloat(slider.min || "0");
    var max = parseFloat(slider.max || "100");
    var val = parseFloat(slider.value || "0");
    var pct = max > min ? ((val - min) / (max - min)) * 100 : 0;
    slider.style.setProperty("--eeg-range-fill", pct + "%");
  }

  function getInnerWidth(el) {
    var styles = window.getComputedStyle(el);
    return Math.max(0, el.clientWidth - (parseFloat(styles.paddingLeft) || 0) - (parseFloat(styles.paddingRight) || 0));
  }

  function resizeCanvases() {
    var container = getEl("eeg-container");
    if (!container) return;
    var containerW = getInnerWidth(container);
    var dpr = window.devicePixelRatio || 1;

    var mainCanvas = getEl("eeg-canvas-main");
    if (mainCanvas) {
      var displayW = Math.max(0, containerW - 10);
      mainCanvas.style.width = displayW + "px";
      mainCanvas.style.height = "230px";
      mainCanvas.width = displayW * dpr;
      mainCanvas.height = 230 * dpr;
    }

    var leftCanvas = getEl("eeg-canvas-left");
    var rightCanvas = getEl("eeg-canvas-right");
    if (leftCanvas && rightCanvas) {
      var availW = Math.max(0, containerW - 10 - 14);
      var halfW = Math.floor(availW / 2);
      var dH = 300;
      for (var i = 0; i < 2; i++) {
        var cv = i === 0 ? leftCanvas : rightCanvas;
        cv.style.width = halfW + "px";
        cv.style.height = dH + "px";
        cv.width = halfW * dpr;
        cv.height = dH * dpr;
      }
    }
  }

  // =====================================================================
  // DATA GENERATION
  // =====================================================================

  function generateData() {
    state.scrollOffset = 0;
    state.rawAbsSample = 0;
    state.blinkEvents = [];
    state.step1ShiftAccumulator = 0;
    state.step1ShiftIndex = 0;

    state.channels = [];
    for (var ch = 0; ch < CHANNELS.length; ch++) {
      state.channels.push(generatePinkNoise(CONTINUOUS_N, SR, 1.5, state.seed + ch * 1000));
    }

    state.sparkBuffers = {};
    for (var name in ELECTRODE_POS) {
      state.sparkBuffers[name] = new Float64Array(80);
      var rng = mulberry32(state.seed + name.charCodeAt(0) * 100);
      for (var i = 0; i < 80; i++) state.sparkBuffers[name][i] = randn(rng) * 0.5;
    }

    var trialData = generateTrials(state.params.noiseLevel, state.seed + 50000);
    state.trials = trialData.trials;
    state.erpTemplate = trialData.template;
    state.cumSum = buildCumSum(state.trials);

    state.bandData = generateBands(state.params.bandPowers, state.seed + 90000);
  }

  function regenerateTrials() {
    var trialData = generateTrials(state.params.noiseLevel, state.seed + 50000);
    state.trials = trialData.trials;
    state.erpTemplate = trialData.template;
    state.cumSum = buildCumSum(state.trials);
    render();
  }

  function regenerateBands() {
    state.bandData = generateBands(state.params.bandPowers, state.seed + 90000);
    render();
  }

  function triggerBlinkArtifact() {
    if (!state.channels) return;
    var samplesVisible = Math.floor(DISPLAY_SECS * SR);
    state.blinkEvents.push({
      // Start just off the right edge so the blink enters from the live boundary.
      startSample: state.rawAbsSample + samplesVisible + Math.round(BLINK_ENTRY_LEAD * SR),
      strength: 1.0,
    });
    render();
  }

  // =====================================================================
  // ANIMATION
  // =====================================================================

  function startAnimation() {
    if (state.animFrameId) return;
    var lastTime = 0;
    function loop(timestamp) {
      var dt = timestamp - lastTime;
      lastTime = timestamp;

      if (state.step === 1) {
        state.step1ShiftAccumulator += (dt / (1000 / 60)) * STEP1_TRACE_SHIFT_RATE;
        while (state.step1ShiftAccumulator >= 1) {
          state.step1ShiftIndex += 1;
          for (var name in state.sparkBuffers) {
            var buf = state.sparkBuffers[name];
            var rng = mulberry32(state.seed + state.step1ShiftIndex * 131 + name.charCodeAt(0) * 137);
            for (var i = 0; i < buf.length - 1; i++) buf[i] = buf[i + 1];
            // Smooth random walk for the trace
            buf[buf.length - 1] = buf[buf.length - 2] * 0.85 + randn(rng) * 0.5;
          }
          state.step1ShiftAccumulator -= 1;
        }
        drawStep1Main(getEl("eeg-canvas-main"));
      } else if (state.step === 2) {
        var advanceSamples = Math.max(1, Math.round(SR * dt / 1000));
        state.scrollOffset = (state.scrollOffset + advanceSamples) % CONTINUOUS_N;
        state.rawAbsSample += advanceSamples;
        if (state.blinkEvents.length > 0) {
          var maxAgeSamples = Math.round((DISPLAY_SECS + BLINK_DUR) * SR);
          state.blinkEvents = state.blinkEvents.filter(function (evt) {
            return (state.rawAbsSample - evt.startSample) < maxAgeSamples;
          });
        }
        drawStep2Main(getEl("eeg-canvas-main"));
        drawStep2Left(getEl("eeg-canvas-left"));
      }
      state.animFrameId = requestAnimationFrame(loop);
    }
    state.animFrameId = requestAnimationFrame(loop);
  }

  function stopAnimation() {
    if (state.animFrameId) {
      cancelAnimationFrame(state.animFrameId);
      state.animFrameId = null;
    }
  }

  // =====================================================================
  // RENDER & NAVIGATION
  // =====================================================================

  function render() {
    var mainCanvas = getEl("eeg-canvas-main");
    var leftCanvas = getEl("eeg-canvas-left");
    var rightCanvas = getEl("eeg-canvas-right");

    if (state.step === 1) {
      if (mainCanvas) drawStep1Main(mainCanvas);
      if (leftCanvas) drawStep1Left(leftCanvas);
      if (rightCanvas) drawStep1Right(rightCanvas);
    } else if (state.step === 2) {
      if (mainCanvas) drawStep2Main(mainCanvas);
      if (leftCanvas) drawStep2Left(leftCanvas);
      if (rightCanvas) drawStep2Right(rightCanvas);
    } else if (state.step === 3) {
      if (mainCanvas) drawStep3Main(mainCanvas);
      if (leftCanvas) drawStep3Left(leftCanvas);
      if (rightCanvas) drawStep3Right(rightCanvas);
    } else if (state.step === 4) {
      if (mainCanvas) drawStep4Main(mainCanvas);
      if (leftCanvas) drawStep4Left(leftCanvas);
      if (rightCanvas) drawStep4Right(rightCanvas);
    } else if (state.step === 5) {
      if (mainCanvas) drawStep5Main(mainCanvas);
      if (leftCanvas) drawStep5Left(leftCanvas);
      if (rightCanvas) drawStep5Right(rightCanvas);
    } else if (state.step === 6) {
      if (mainCanvas) drawStep6Main(mainCanvas);
      if (leftCanvas) drawStep6Left(leftCanvas);
      if (rightCanvas) drawStep6Right(rightCanvas);
    }
  }

  function goToStep(step) {
    stopAnimation();
    state.step = step;

    if (step >= 1 && !state.channels) generateData();

    var btns = document.querySelectorAll(".eeg-step-btn");
    btns.forEach(function (btn) {
      btn.classList.toggle("active", parseInt(btn.dataset.step) === step);
    });

    var container = getEl("eeg-container");
    var startScreen = getEl("eeg-start-screen");
    var vizArea = getEl("eeg-viz-area");
    var controlsArea = getEl("eeg-controls-area");

    if (container) container.classList.toggle("eeg-active", step >= 1);
    if (startScreen) startScreen.style.display = step === 0 ? "flex" : "none";
    if (vizArea) vizArea.style.display = step >= 1 ? "flex" : "none";
    if (controlsArea) controlsArea.style.display = step >= 1 ? "flex" : "none";

    var noiseCtrl = getEl("eeg-noise-control");
    var blinkCtrl = getEl("eeg-blink-control");
    var s3TrialsCtrl = getEl("eeg-s3trials-control");
    var trialsCtrl = getEl("eeg-trials-control");
    var bandCtrls = getEl("eeg-band-controls");
    var bandPowerCtrls = getEl("eeg-band-power-controls");

    if (noiseCtrl) noiseCtrl.style.display = (step === 2 || step === 4 || step === 6) ? "flex" : "none";
    if (blinkCtrl) blinkCtrl.style.display = step === 2 ? "flex" : "none";
    if (s3TrialsCtrl) s3TrialsCtrl.style.display = step === 3 ? "flex" : "none";
    if (trialsCtrl) trialsCtrl.style.display = step === 4 ? "flex" : "none";
    if (bandCtrls) bandCtrls.style.display = step === 5 ? "flex" : "none";
    if (bandPowerCtrls) bandPowerCtrls.style.display = (step === 5 || step === 6) ? "flex" : "none";

    var infoEl = getEl("eeg-info-text");
    if (infoEl && STEP_INFO[step]) {
      infoEl.innerHTML = STEP_INFO[step];
      infoEl.style.display = step >= 1 ? "block" : "none";
    }

    resizeCanvases();
    render();

    if (step === 1 || step === 2) startAnimation();
  }

  function wireSlider(sliderId, labelId, callback) {
    var slider = getEl(sliderId);
    var label = getEl(labelId);
    if (!slider) return;
    setRangeFill(slider);
    slider.addEventListener("input", function () {
      if (label) label.textContent = this.value;
      setRangeFill(this);
      callback(this.value);
    });
  }

  function syncTrialCounts(n, source) {
    var val = Math.max(1, Math.min(MAX_TRIALS, parseInt(n, 10) || 1));
    state.params.s3Trials = val;
    state.params.nTrials = val;

    var s3Slider = getEl("eeg-s3trials");
    var s3Label = getEl("eeg-s3trials-val");
    var nSlider = getEl("eeg-ntrials");
    var nLabel = getEl("eeg-ntrials-val");

    if (s3Slider && source !== "s3") {
      s3Slider.value = String(val);
      setRangeFill(s3Slider);
    }
    if (nSlider && source !== "n4") {
      nSlider.value = String(val);
      setRangeFill(nSlider);
    }
    if (s3Label) s3Label.textContent = String(val);
    if (nLabel) nLabel.textContent = String(val);
  }

  function initDemo() {
    var container = getEl("eeg-container");
    if (!container) return;

    container.querySelectorAll(".eeg-step-btn").forEach(function (btn) {
      btn.addEventListener("click", function () { goToStep(parseInt(this.dataset.step)); });
    });

    var startBtn = getEl("eeg-start-btn");
    if (startBtn) startBtn.addEventListener("click", function () { goToStep(1); });
    var blinkBtn = getEl("eeg-blink-btn");
    if (blinkBtn) blinkBtn.addEventListener("click", triggerBlinkArtifact);

    // Noise slider (steps 2, 4, 6)
    wireSlider("eeg-noise", "eeg-noise-val", function (v) {
      state.params.noiseLevel = parseFloat(v);
      regenerateTrials();
    });

    // Step 3 trials slider
    wireSlider("eeg-s3trials", "eeg-s3trials-val", function (v) {
      syncTrialCounts(v, "s3");
      render();
    });

    // Step 4 trials slider
    wireSlider("eeg-ntrials", "eeg-ntrials-val", function (v) {
      syncTrialCounts(v, "n4");
      render();
    });

    // Per-band power sliders
    wireSlider("eeg-delta", "eeg-delta-val", function (v) {
      state.params.bandPowers.delta = parseFloat(v);
      regenerateBands();
    });
    wireSlider("eeg-theta", "eeg-theta-val", function (v) {
      state.params.bandPowers.theta = parseFloat(v);
      regenerateBands();
    });
    wireSlider("eeg-alpha", "eeg-alpha-val", function (v) {
      state.params.bandPowers.alpha = parseFloat(v);
      regenerateBands();
    });
    wireSlider("eeg-beta", "eeg-beta-val", function (v) {
      state.params.bandPowers.beta = parseFloat(v);
      regenerateBands();
    });

    // Band selector buttons
    var bandBtns = container.querySelectorAll(".eeg-band-btn");
    bandBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        bandBtns.forEach(function (b) { b.classList.remove("active"); });
        this.classList.add("active");
        state.params.selectedBand = this.dataset.band;
        render();
      });
    });

    resizeCanvases();
    window.addEventListener("resize", function () { resizeCanvases(); render(); });

    var observer = new MutationObserver(function () { render(); });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    syncTrialCounts(state.params.nTrials);
    render();
  }

  // =====================================================================
  // INITIALIZATION
  // =====================================================================

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initDemo);
  } else {
    initDemo();
  }
})();
