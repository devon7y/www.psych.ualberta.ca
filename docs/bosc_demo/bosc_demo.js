/**
 * BOSC Interactive Demo
 * Better OSCillation Detection - Computational Memory Lab
 * University of Alberta
 *
 * Implements a browser-based interactive demonstration of the BOSC method
 * for detecting oscillatory episodes in neural signals.
 *
 * References:
 *   Caplan et al. (2001) J Neurophysiol
 *   Whitten et al. (2011) NeuroImage
 *   Hughes et al. (2012) Hippocampus
 *   Pawluk et al. (2025) J Neurosci Methods
 */
(function () {
  "use strict";

  // =====================================================================
  // CONFIGURATION
  // =====================================================================
  const SR = 256; // Sample rate (Hz)
  const DURATION = 8; // Signal duration (seconds)
  const N = SR * DURATION; // 2048 samples (power of 2)
  const FFT_N = 4096; // FFT size for convolution (next power of 2)
  const WAVELET_CYCLES = 6; // Morlet wavelet width

  // Analyzed frequencies: 2^(n/4), n=4..20 => 2 Hz to 32 Hz, 17 steps
  const FREQUENCIES = [];
  for (let n = 4; n <= 20; n++) {
    FREQUENCIES.push(Math.pow(2, n / 4));
  }

  // Burst locations (in seconds) - two oscillation bursts
  const BURST1 = [1.0, 3.5]; // 2.5 seconds
  const BURST2 = [5.0, 7.0]; // 2.0 seconds

  // Colors
  const COLORS = {
    signal: "#a8c8e8",
    signalDim: "#4a6a8a",
    detected: "#4CAF50",
    detectedGlow: "rgba(76, 175, 80, 0.3)",
    background1f: "#ff6b6b",
    spectrum: "#5b8fd9",
    spectrumFill: "rgba(91, 143, 217, 0.2)",
    threshold: "#ff9800",
    thresholdFill: "rgba(255, 152, 0, 0.15)",
    pepisodeBg: "#3a4254",
    pepisodeBar: "#5b8fd9",
    pepisodePeak: "#4CAF50",
    axes: "#556677",
    axesLabel: "#8899aa",
    text: "#c8d8e8",
    gridLine: "rgba(60, 75, 95, 0.5)",
    burstRegion: "rgba(76, 175, 80, 0.08)",
    canvasBg: "#141924",
    chi2Fill: "rgba(255, 107, 107, 0.3)",
    chi2Line: "#ff6b6b",
    chi2Threshold: "#ff9800",
  };

  // =====================================================================
  // MATH UTILITIES
  // =====================================================================

  // Seeded PRNG (Mulberry32)
  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Box-Muller for Gaussian random
  function randn(rng) {
    let u1 = rng(),
      u2 = rng();
    while (u1 === 0) u1 = rng();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  // Cooley-Tukey radix-2 FFT (in-place)
  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      while (j & bit) {
        j ^= bit;
        bit >>= 1;
      }
      j ^= bit;
      if (i < j) {
        let tmp = re[i]; re[i] = re[j]; re[j] = tmp;
        tmp = im[i]; im[i] = im[j]; im[j] = tmp;
      }
    }
    for (let len = 2; len <= n; len *= 2) {
      const ang = (-2 * Math.PI) / len;
      const wRe = Math.cos(ang),
        wIm = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let curRe = 1,
          curIm = 0;
        for (let j = 0; j < len / 2; j++) {
          const idx1 = i + j,
            idx2 = i + j + len / 2;
          const uRe = re[idx1],
            uIm = im[idx1];
          const vRe = re[idx2] * curRe - im[idx2] * curIm;
          const vIm = re[idx2] * curIm + im[idx2] * curRe;
          re[idx1] = uRe + vRe;
          im[idx1] = uIm + vIm;
          re[idx2] = uRe - vRe;
          im[idx2] = uIm - vIm;
          const newCurRe = curRe * wRe - curIm * wIm;
          curIm = curRe * wIm + curIm * wRe;
          curRe = newCurRe;
        }
      }
    }
  }

  function ifft(re, im) {
    const n = re.length;
    for (let i = 0; i < n; i++) im[i] = -im[i];
    fft(re, im);
    for (let i = 0; i < n; i++) {
      re[i] /= n;
      im[i] = -im[i] / n;
    }
  }

  // Chi-square(2) inverse CDF: F^{-1}(p) = -2 * ln(1-p)
  function chi2Inv(p) {
    return -2 * Math.log(1 - p);
  }

  // Chi-square(2) PDF: f(x) = 0.5 * exp(-x/2)
  function chi2Pdf(x) {
    return x >= 0 ? 0.5 * Math.exp(-x / 2) : 0;
  }

  // Linear regression: y = slope*x + intercept
  function linearRegression(x, y) {
    const n = x.length;
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let i = 0; i < n; i++) {
      sx += x[i];
      sy += y[i];
      sxx += x[i] * x[i];
      sxy += x[i] * y[i];
    }
    const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
    const intercept = (sy - slope * sx) / n;
    return { slope, intercept };
  }

  // =====================================================================
  // SIGNAL GENERATION
  // =====================================================================

  function generateSignal(params) {
    const { oscFreq, oscAmp, alpha, seed } = params;
    const rng = mulberry32(seed);

    // Generate white noise
    const noiseRe = new Float64Array(FFT_N);
    const noiseIm = new Float64Array(FFT_N);
    for (let i = 0; i < N; i++) noiseRe[i] = randn(rng);

    // FFT
    fft(noiseRe, noiseIm);

    // Apply 1/f^(alpha/2) scaling
    noiseRe[0] = 0;
    noiseIm[0] = 0;
    for (let k = 1; k < FFT_N; k++) {
      const freq = k <= FFT_N / 2 ? k : FFT_N - k;
      const scale = Math.pow(freq, -alpha / 2);
      noiseRe[k] *= scale;
      noiseIm[k] *= scale;
    }

    // IFFT
    ifft(noiseRe, noiseIm);

    // Extract and normalize the noise signal
    const signal = new Float64Array(N);
    let rms = 0;
    for (let i = 0; i < N; i++) {
      signal[i] = noiseRe[i];
      rms += signal[i] * signal[i];
    }
    rms = Math.sqrt(rms / N);
    for (let i = 0; i < N; i++) signal[i] /= rms;

    // Add oscillation bursts with Hann window envelopes
    const bursts = [BURST1, BURST2];
    for (const [tStart, tEnd] of bursts) {
      const iStart = Math.round(tStart * SR);
      const iEnd = Math.min(Math.round(tEnd * SR), N);
      const len = iEnd - iStart;
      for (let i = 0; i < len; i++) {
        // Hann window envelope
        const env = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (len - 1)));
        signal[iStart + i] += oscAmp * env * Math.sin(2 * Math.PI * oscFreq * (i / SR));
      }
    }

    return signal;
  }

  // =====================================================================
  // BOSC ANALYSIS
  // =====================================================================

  function computeWaveletPower(signal, frequencies) {
    // Pre-compute signal FFT (zero-padded to FFT_N)
    const sigRe = new Float64Array(FFT_N);
    const sigIm = new Float64Array(FFT_N);
    for (let i = 0; i < N; i++) sigRe[i] = signal[i];
    fft(sigRe, sigIm);

    // For each frequency, compute Morlet wavelet power
    const power = []; // power[freqIdx][timeIdx]

    for (let fi = 0; fi < frequencies.length; fi++) {
      const f = frequencies[fi];
      const sigmaT = WAVELET_CYCLES / (2 * Math.PI * f);

      // Create Morlet wavelet in time domain
      const halfLen = Math.ceil(3 * sigmaT * SR);
      const wavLen = 2 * halfLen + 1;

      const wavRe = new Float64Array(FFT_N);
      const wavIm = new Float64Array(FFT_N);

      let normSq = 0;
      for (let i = 0; i < wavLen; i++) {
        const t = (i - halfLen) / SR;
        const envelope = Math.exp((-t * t) / (2 * sigmaT * sigmaT));
        const re = envelope * Math.cos(2 * Math.PI * f * t);
        const im = envelope * Math.sin(2 * Math.PI * f * t);
        wavRe[i] = re;
        wavIm[i] = im;
        normSq += re * re + im * im;
      }
      // Normalize wavelet
      const norm = Math.sqrt(normSq);
      for (let i = 0; i < wavLen; i++) {
        wavRe[i] /= norm;
        wavIm[i] /= norm;
      }

      // FFT of wavelet
      fft(wavRe, wavIm);

      // Multiply in frequency domain (convolution)
      const resRe = new Float64Array(FFT_N);
      const resIm = new Float64Array(FFT_N);
      for (let k = 0; k < FFT_N; k++) {
        resRe[k] = sigRe[k] * wavRe[k] - sigIm[k] * wavIm[k];
        resIm[k] = sigRe[k] * wavIm[k] + sigIm[k] * wavRe[k];
      }

      // IFFT
      ifft(resRe, resIm);

      // Power = |coefficient|^2, with shift to align
      const p = new Float64Array(N);
      for (let i = 0; i < N; i++) {
        const idx = (i + halfLen) % FFT_N;
        p[i] = resRe[idx] * resRe[idx] + resIm[idx] * resIm[idx];
      }
      power.push(p);
    }

    return power;
  }

  function fitBackground(frequencies, power) {
    // Compute mean power at each frequency (log of individual values, then mean)
    const meanPower = [];
    for (let fi = 0; fi < frequencies.length; fi++) {
      let sum = 0;
      for (let t = 0; t < N; t++) {
        sum += Math.log10(power[fi][t]);
      }
      meanPower.push(Math.pow(10, sum / N));
    }

    // Linear regression in log10-log10 space
    const logF = frequencies.map((f) => Math.log10(f));
    const logP = meanPower.map((p) => Math.log10(p));
    const { slope, intercept } = linearRegression(logF, logP);

    // Background power estimate at each frequency
    const bgPower = frequencies.map(
      (f) => Math.pow(10, slope * Math.log10(f) + intercept)
    );

    return { slope, intercept, meanPower, bgPower };
  }

  function boscDetect(power, frequencies, bgPower, ptPercentile, dtCycles) {
    const ptMultiplier = chi2Inv(ptPercentile) / 2; // Scale factor for threshold
    const detected = []; // detected[freqIdx][timeIdx] = 0 or 1
    const pepisode = [];
    const thresholds = [];

    for (let fi = 0; fi < frequencies.length; fi++) {
      const f = frequencies[fi];
      const pt = bgPower[fi] * ptMultiplier;
      thresholds.push(pt);
      const dtSamples = Math.round((dtCycles / f) * SR);

      // Find samples exceeding power threshold
      const aboveThresh = new Uint8Array(N);
      for (let t = 0; t < N; t++) {
        aboveThresh[t] = power[fi][t] > pt ? 1 : 0;
      }

      // Apply duration threshold: find runs of above-threshold
      const det = new Uint8Array(N);
      let runStart = -1;
      for (let t = 0; t <= N; t++) {
        if (t < N && aboveThresh[t]) {
          if (runStart < 0) runStart = t;
        } else {
          if (runStart >= 0) {
            const runLen = t - runStart;
            if (runLen >= dtSamples) {
              for (let k = runStart; k < t; k++) det[k] = 1;
            }
            runStart = -1;
          }
        }
      }

      detected.push(det);

      // P_episode: proportion of time oscillation is detected
      let detCount = 0;
      for (let t = 0; t < N; t++) detCount += det[t];
      pepisode.push(detCount / N);
    }

    return { detected, pepisode, thresholds };
  }

  // Full BOSC analysis pipeline
  function runBOSC(signal, params) {
    const power = computeWaveletPower(signal, FREQUENCIES);
    const bg = fitBackground(FREQUENCIES, power);
    const detection = boscDetect(
      power,
      FREQUENCIES,
      bg.bgPower,
      params.ptPercentile,
      params.dtCycles
    );

    // Composite detection at the target frequency (closest to oscFreq)
    let targetFi = 0;
    let minDist = Infinity;
    for (let fi = 0; fi < FREQUENCIES.length; fi++) {
      const d = Math.abs(FREQUENCIES[fi] - params.oscFreq);
      if (d < minDist) {
        minDist = d;
        targetFi = fi;
      }
    }

    return {
      power,
      bg,
      detection,
      targetFi,
      targetFreq: FREQUENCIES[targetFi],
    };
  }

  // =====================================================================
  // CANVAS DRAWING UTILITIES
  // =====================================================================

  function getCanvasColors() {
    const isLight = document.documentElement.getAttribute("data-theme") === "light";
    if (isLight) {
      return {
        ...COLORS,
        signal: "#2c5282",
        signalDim: "#a0aec0",
        axes: "#718096",
        axesLabel: "#4a5568",
        text: "#2d3748",
        gridLine: "rgba(160, 174, 192, 0.4)",
        canvasBg: "#f7fafc",
        pepisodeBg: "#e2e8f0",
        burstRegion: "rgba(76, 175, 80, 0.1)",
      };
    }
    return COLORS;
  }

  function clearCanvas(ctx, w, h) {
    const c = getCanvasColors();
    ctx.fillStyle = c.canvasBg;
    ctx.fillRect(0, 0, w, h);
  }

  function drawText(ctx, text, x, y, opts = {}) {
    const c = getCanvasColors();
    ctx.fillStyle = opts.color || c.text;
    ctx.font = opts.font || '11px "Inter", sans-serif';
    ctx.textAlign = opts.align || "left";
    ctx.textBaseline = opts.baseline || "middle";
    ctx.fillText(text, x, y);
  }

  function getFontSizePx(font) {
    const match = /(\d+(?:\.\d+)?)px/.exec(font);
    return match ? parseFloat(match[1]) : 11;
  }

  function withFontSize(font, sizePx) {
    if (/\d+(?:\.\d+)?px/.test(font)) {
      return font.replace(/(\d+(?:\.\d+)?)px/, sizePx + "px");
    }
    return sizePx + "px " + font;
  }

  function drawInlineText(ctx, runs, x, y, opts = {}) {
    const c = getCanvasColors();
    const color = opts.color || c.text;
    const align = opts.align || "left";
    const baseline = opts.baseline || "middle";
    const defaultFont = opts.font || '11px "Inter", sans-serif';

    let totalWidth = 0;
    for (const run of runs) {
      const text = run.text || "";
      if (!text) continue;
      ctx.font = run.font || defaultFont;
      totalWidth += ctx.measureText(text).width;
    }

    let startX = x;
    if (align === "center") startX = x - totalWidth / 2;
    else if (align === "right") startX = x - totalWidth;

    ctx.fillStyle = color;
    ctx.textAlign = "left";
    ctx.textBaseline = baseline;

    let cursorX = startX;
    for (const run of runs) {
      const text = run.text || "";
      if (!text) continue;
      ctx.font = run.font || defaultFont;
      const dy = run.dy || 0;
      ctx.fillText(text, cursorX, y + dy);
      cursorX += ctx.measureText(text).width;
    }
  }

  // =====================================================================
  // VISUALIZATION: SIGNAL TRACE
  // =====================================================================

  function drawSignalTrace(canvas, signal, analysis, step) {
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = canvas.width / dpr,
      H = canvas.height / dpr;
    const c = getCanvasColors();
    clearCanvas(ctx, W, H);

    const margin = { top: 30, right: 15, bottom: 35, left: 50 };
    const plotW = W - margin.left - margin.right;
    const plotH = H - margin.top - margin.bottom;

    // Title
    drawText(ctx, step >= 4 ? "Signal with Detected Oscillations" : "Simulated EEG Signal", margin.left + plotW / 2, 14, {
      font: 'bold 12px "Inter", sans-serif',
      align: "center",
    });

    // Find signal range
    let minVal = Infinity,
      maxVal = -Infinity;
    for (let i = 0; i < N; i++) {
      if (signal[i] < minVal) minVal = signal[i];
      if (signal[i] > maxVal) maxVal = signal[i];
    }
    const range = maxVal - minVal || 1;
    const padRange = range * 1.1;
    const mid = (maxVal + minVal) / 2;

    // Draw burst regions (ground truth)
    if (step >= 1) {
      ctx.fillStyle = c.burstRegion;
      for (const [tStart, tEnd] of [BURST1, BURST2]) {
        const x1 = margin.left + (tStart / DURATION) * plotW;
        const x2 = margin.left + (tEnd / DURATION) * plotW;
        ctx.fillRect(x1, margin.top, x2 - x1, plotH);
      }
    }

    // Draw grid
    ctx.strokeStyle = c.gridLine;
    ctx.lineWidth = 0.5;
    for (let t = 0; t <= DURATION; t++) {
      const x = margin.left + (t / DURATION) * plotW;
      ctx.beginPath();
      ctx.moveTo(x, margin.top);
      ctx.lineTo(x, margin.top + plotH);
      ctx.stroke();
    }

    // Draw detected oscillation highlights (step 4+)
    if (step >= 4 && analysis) {
      const det = analysis.detection.detected[analysis.targetFi];
      ctx.fillStyle = c.detectedGlow;
      let inRun = false,
        runStart = 0;
      for (let i = 0; i <= N; i++) {
        if (i < N && det[i]) {
          if (!inRun) {
            runStart = i;
            inRun = true;
          }
        } else if (inRun) {
          const x1 = margin.left + (runStart / N) * plotW;
          const x2 = margin.left + (i / N) * plotW;
          ctx.fillRect(x1, margin.top, x2 - x1, plotH);
          inRun = false;
        }
      }
    }

    // Draw signal trace
    ctx.beginPath();
    ctx.strokeStyle = step >= 4 ? c.signalDim : c.signal;
    ctx.lineWidth = 1;
    for (let i = 0; i < N; i++) {
      const x = margin.left + (i / N) * plotW;
      const y = margin.top + plotH / 2 - ((signal[i] - mid) / padRange) * plotH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Draw detected portions in green (step 4+)
    if (step >= 4 && analysis) {
      const det = analysis.detection.detected[analysis.targetFi];
      ctx.beginPath();
      ctx.strokeStyle = c.detected;
      ctx.lineWidth = 1.5;
      let drawing = false;
      for (let i = 0; i < N; i++) {
        const x = margin.left + (i / N) * plotW;
        const y = margin.top + plotH / 2 - ((signal[i] - mid) / padRange) * plotH;
        if (det[i]) {
          if (!drawing) {
            ctx.moveTo(x, y);
            drawing = true;
          } else {
            ctx.lineTo(x, y);
          }
        } else {
          if (drawing) {
            ctx.stroke();
            ctx.beginPath();
            drawing = false;
          }
        }
      }
      if (drawing) ctx.stroke();
    }

    // Axes
    ctx.strokeStyle = c.axes;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(margin.left, margin.top);
    ctx.lineTo(margin.left, margin.top + plotH);
    ctx.lineTo(margin.left + plotW, margin.top + plotH);
    ctx.stroke();

    // X axis labels
    for (let t = 0; t <= DURATION; t += 2) {
      const x = margin.left + (t / DURATION) * plotW;
      drawText(ctx, t + "s", x, margin.top + plotH + 14, {
        align: "center",
        color: c.axesLabel,
        font: '10px "Inter", sans-serif',
      });
    }
    drawText(ctx, "Time", margin.left + plotW / 2, margin.top + plotH + 28, {
      align: "center",
      color: c.axesLabel,
      font: '10px "Inter", sans-serif',
    });

    // Y axis label
    ctx.save();
    ctx.translate(14, margin.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    drawText(ctx, "Voltage", 0, 0, {
      align: "center",
      color: c.axesLabel,
      font: '10px "Inter", sans-serif',
    });
    ctx.restore();

    // Legend for burst regions
    if (step >= 1 && step < 4) {
      ctx.fillStyle = c.burstRegion;
      ctx.fillRect(margin.left + plotW - 175, margin.top + 5, 12, 12);
      drawText(ctx, "Embedded oscillations", margin.left + plotW - 160, margin.top + 11, {
        font: '10px "Inter", sans-serif',
        color: c.axesLabel,
      });
    }

    // P_episode annotation (step 5)
    if (step >= 5 && analysis) {
      const pep = analysis.detection.pepisode[analysis.targetFi];
      const baseFont = 'bold 11px "Inter", sans-serif';
      const baseSize = getFontSizePx(baseFont);
      const subFont = withFontSize(baseFont, Math.max(7, Math.round(baseSize * 0.75)));
      const subDy = Math.max(2, baseSize * 0.35);
      drawInlineText(
        ctx,
        [
          { text: "P", font: baseFont },
          { text: "episode", font: subFont, dy: subDy },
          { text: "(" + analysis.targetFreq.toFixed(1) + " Hz) = " + pep.toFixed(2), font: baseFont },
        ],
        margin.left + plotW - 10,
        margin.top + 14,
        {
          font: baseFont,
          align: "right",
          color: c.detected,
        }
      );
    }
  }

  // =====================================================================
  // VISUALIZATION: POWER SPECTRUM
  // =====================================================================

  function drawPowerSpectrum(canvas, analysis, step) {
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = canvas.width / dpr,
      H = canvas.height / dpr;
    const c = getCanvasColors();
    clearCanvas(ctx, W, H);

    if (!analysis || step < 2) {
      drawText(ctx, "Complete Step 1 to see the power spectrum", W / 2, H / 2, {
        align: "center",
        color: c.axesLabel,
      });
      return;
    }

    const margin = { top: 30, right: 15, bottom: 35, left: 55 };
    const plotW = W - margin.left - margin.right;
    const plotH = H - margin.top - margin.bottom;

    // Title
    drawText(ctx, step >= 3 ? "Power Spectrum with Background Fit" : "Power Spectrum (log-log)", margin.left + plotW / 2, 14, {
      font: 'bold 12px "Inter", sans-serif',
      align: "center",
    });

    const { bg, detection } = analysis;
    const meanPower = bg.meanPower;

    // Compute plot ranges (log scale)
    const fMin = Math.log10(FREQUENCIES[0] * 0.85);
    const fMax = Math.log10(FREQUENCIES[FREQUENCIES.length - 1] * 1.15);
    let pMin = Infinity,
      pMax = -Infinity;
    for (let fi = 0; fi < FREQUENCIES.length; fi++) {
      const lp = Math.log10(meanPower[fi]);
      if (lp < pMin) pMin = lp;
      if (lp > pMax) pMax = lp;
    }
    // Include threshold in range if showing
    if (step >= 4) {
      for (let fi = 0; fi < FREQUENCIES.length; fi++) {
        const lt = Math.log10(detection.thresholds[fi]);
        if (lt > pMax) pMax = lt;
      }
    }
    const pPad = (pMax - pMin) * 0.15;
    pMin -= pPad;
    pMax += pPad;

    function toX(logF) {
      return margin.left + ((logF - fMin) / (fMax - fMin)) * plotW;
    }
    function toY(logP) {
      return margin.top + plotH - ((logP - pMin) / (pMax - pMin)) * plotH;
    }

    // Grid lines
    ctx.strokeStyle = c.gridLine;
    ctx.lineWidth = 0.5;
    const gridFreqs = [2, 4, 8, 16, 32];
    for (const f of gridFreqs) {
      const x = toX(Math.log10(f));
      if (x >= margin.left && x <= margin.left + plotW) {
        ctx.beginPath();
        ctx.moveTo(x, margin.top);
        ctx.lineTo(x, margin.top + plotH);
        ctx.stroke();
      }
    }

    // Background fit region (step 3+)
    if (step >= 3) {
      // Draw 1/f background fit line
      ctx.strokeStyle = c.background1f;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 3]);
      ctx.beginPath();
      const f0 = FREQUENCIES[0] * 0.8;
      const f1 = FREQUENCIES[FREQUENCIES.length - 1] * 1.2;
      const bgP0 = bg.slope * Math.log10(f0) + bg.intercept;
      const bgP1 = bg.slope * Math.log10(f1) + bg.intercept;
      ctx.moveTo(toX(Math.log10(f0)), toY(bgP0));
      ctx.lineTo(toX(Math.log10(f1)), toY(bgP1));
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Threshold line (step 4+)
    if (step >= 4) {
      // Fill region above threshold
      ctx.fillStyle = c.thresholdFill;
      ctx.beginPath();
      for (let fi = 0; fi < FREQUENCIES.length; fi++) {
        const x = toX(Math.log10(FREQUENCIES[fi]));
        const y = toY(Math.log10(detection.thresholds[fi]));
        if (fi === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      // Close to top of plot
      ctx.lineTo(toX(Math.log10(FREQUENCIES[FREQUENCIES.length - 1])), margin.top);
      ctx.lineTo(toX(Math.log10(FREQUENCIES[0])), margin.top);
      ctx.closePath();
      ctx.fill();

      // Threshold line
      ctx.strokeStyle = c.threshold;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 2]);
      ctx.beginPath();
      for (let fi = 0; fi < FREQUENCIES.length; fi++) {
        const x = toX(Math.log10(FREQUENCIES[fi]));
        const y = toY(Math.log10(detection.thresholds[fi]));
        if (fi === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Power spectrum (mean power as points + line)
    ctx.strokeStyle = c.spectrum;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let fi = 0; fi < FREQUENCIES.length; fi++) {
      const x = toX(Math.log10(FREQUENCIES[fi]));
      const y = toY(Math.log10(meanPower[fi]));
      if (fi === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Points
    for (let fi = 0; fi < FREQUENCIES.length; fi++) {
      const x = toX(Math.log10(FREQUENCIES[fi]));
      const y = toY(Math.log10(meanPower[fi]));
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, 2 * Math.PI);
      ctx.fillStyle = c.spectrum;
      ctx.fill();
    }

    // Axes
    ctx.strokeStyle = c.axes;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(margin.left, margin.top);
    ctx.lineTo(margin.left, margin.top + plotH);
    ctx.lineTo(margin.left + plotW, margin.top + plotH);
    ctx.stroke();

    // X axis labels (log scale)
    for (const f of gridFreqs) {
      const x = toX(Math.log10(f));
      if (x >= margin.left - 5 && x <= margin.left + plotW + 5) {
        drawText(ctx, f + "", x, margin.top + plotH + 14, {
          align: "center",
          color: c.axesLabel,
          font: '10px "Inter", sans-serif',
        });
      }
    }
    drawText(ctx, "Frequency (Hz)", margin.left + plotW / 2, margin.top + plotH + 28, {
      align: "center",
      color: c.axesLabel,
      font: '10px "Inter", sans-serif',
    });

    // Y axis label
    ctx.save();
    ctx.translate(14, margin.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    drawText(ctx, "Log Power (dB)", 0, 0, {
      align: "center",
      color: c.axesLabel,
      font: '10px "Inter", sans-serif',
    });
    ctx.restore();

    // Legend
    let legendY = margin.top + 8;
    const legendX = margin.left + 8;
    ctx.fillStyle = c.spectrum;
    ctx.fillRect(legendX, legendY - 4, 14, 3);
    drawText(ctx, "Power spectrum", legendX + 18, legendY, {
      font: '9px "Inter", sans-serif',
      color: c.axesLabel,
    });

    if (step >= 3) {
      legendY += 14;
      ctx.strokeStyle = c.background1f;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 2]);
      ctx.beginPath();
      ctx.moveTo(legendX, legendY);
      ctx.lineTo(legendX + 14, legendY);
      ctx.stroke();
      ctx.setLineDash([]);
      drawText(ctx, "1/f background fit", legendX + 18, legendY, {
        font: '9px "Inter", sans-serif',
        color: c.axesLabel,
      });
    }

    if (step >= 4) {
      legendY += 14;
      ctx.strokeStyle = c.threshold;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 2]);
      ctx.beginPath();
      ctx.moveTo(legendX, legendY);
      ctx.lineTo(legendX + 14, legendY);
      ctx.stroke();
      ctx.setLineDash([]);
      const baseFont = '9px "Inter", sans-serif';
      const baseSize = getFontSizePx(baseFont);
      const subFont = withFontSize(baseFont, Math.max(7, Math.round(baseSize * 0.75)));
      const subDy = Math.max(2, baseSize * 0.35);
      drawInlineText(
        ctx,
        [
          { text: "Power threshold (P", font: baseFont },
          { text: "T", font: subFont, dy: subDy },
          { text: ")", font: baseFont },
        ],
        legendX + 18,
        legendY,
        {
          font: baseFont,
          color: c.axesLabel,
        }
      );
    }

    // Slope annotation
    if (step >= 3) {
      drawText(
        ctx,
        "slope = " + bg.slope.toFixed(2),
        margin.left + plotW - 5,
        margin.top + plotH - 8,
        {
          font: '10px "Inter", sans-serif',
          align: "right",
          color: c.background1f,
        }
      );
    }
  }

  // =====================================================================
  // VISUALIZATION: P_EPISODE
  // =====================================================================

  function drawPepisode(canvas, analysis, step) {
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = canvas.width / dpr,
      H = canvas.height / dpr;
    const c = getCanvasColors();
    clearCanvas(ctx, W, H);

    if (!analysis || step < 5) {
      // Before step 5, show the chi-square explanation (step 4) or placeholder
      if (step === 4 && analysis) {
        drawChi2Explanation(ctx, W, H, analysis);
      } else if (step === 3) {
        drawBackgroundExplanation(ctx, W, H);
      } else if (step === 2) {
        draw1fExplanation(ctx, W, H);
      } else {
        drawText(ctx, "Progress through steps to see results", W / 2, H / 2, {
          align: "center",
          color: c.axesLabel,
        });
      }
      return;
    }

    const margin = { top: 30, right: 15, bottom: 35, left: 55 };
    const plotW = W - margin.left - margin.right;
    const plotH = H - margin.top - margin.bottom;

    {
      const baseFont = 'bold 12px "Inter", sans-serif';
      const baseSize = getFontSizePx(baseFont);
      const subFont = withFontSize(baseFont, Math.max(8, Math.round(baseSize * 0.75)));
      const subDy = Math.max(2, baseSize * 0.35);
      drawInlineText(
        ctx,
        [
          { text: "P", font: baseFont },
          { text: "episode", font: subFont, dy: subDy },
          { text: ": Proportion of Oscillation Time", font: baseFont },
        ],
        margin.left + plotW / 2,
        14,
        {
          font: baseFont,
          align: "center",
        }
      );
    }

    const pepisode = analysis.detection.pepisode;

    // Bar chart
    const barW = plotW / FREQUENCIES.length * 0.7;
    const gap = plotW / FREQUENCIES.length * 0.3;

    for (let fi = 0; fi < FREQUENCIES.length; fi++) {
      const x = margin.left + (fi / FREQUENCIES.length) * plotW + gap / 2;
      const barH = pepisode[fi] * plotH;
      const y = margin.top + plotH - barH;

      // Color bars: highlight the target frequency
      const isTarget = fi === analysis.targetFi;
      ctx.fillStyle = isTarget ? c.pepisodePeak : c.pepisodeBar;
      ctx.globalAlpha = isTarget ? 1.0 : 0.6;
      ctx.fillRect(x, y, barW, barH);
      ctx.globalAlpha = 1.0;

      // Bar outline
      ctx.strokeStyle = isTarget ? c.detected : c.spectrum;
      ctx.lineWidth = isTarget ? 2 : 0.5;
      ctx.strokeRect(x, y, barW, barH);
    }

    // Horizontal line at expected false-positive rate (5% for 95th percentile)
    const baselineY = margin.top + plotH - 0.05 * plotH;
    ctx.strokeStyle = c.threshold;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(margin.left, baselineY);
    ctx.lineTo(margin.left + plotW, baselineY);
    ctx.stroke();
    ctx.setLineDash([]);
    drawText(ctx, "5% baseline", margin.left + plotW - 5, baselineY - 6, {
      font: '9px "Inter", sans-serif',
      align: "right",
      color: c.threshold,
    });

    // Axes
    ctx.strokeStyle = c.axes;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(margin.left, margin.top);
    ctx.lineTo(margin.left, margin.top + plotH);
    ctx.lineTo(margin.left + plotW, margin.top + plotH);
    ctx.stroke();

    // X axis labels
    const labelFreqs = [2, 4, 8, 16, 32];
    for (const f of labelFreqs) {
      let closestFi = 0;
      let closestDist = Infinity;
      for (let fi = 0; fi < FREQUENCIES.length; fi++) {
        const d = Math.abs(FREQUENCIES[fi] - f);
        if (d < closestDist) {
          closestDist = d;
          closestFi = fi;
        }
      }
      const x = margin.left + (closestFi / FREQUENCIES.length) * plotW + (barW + gap) / 2;
      drawText(ctx, f + "", x, margin.top + plotH + 14, {
        align: "center",
        color: c.axesLabel,
        font: '10px "Inter", sans-serif',
      });
    }
    drawText(ctx, "Frequency (Hz)", margin.left + plotW / 2, margin.top + plotH + 28, {
      align: "center",
      color: c.axesLabel,
      font: '10px "Inter", sans-serif',
    });

    // Y axis labels
    for (let p = 0; p <= 1; p += 0.25) {
      const y = margin.top + plotH - p * plotH;
      drawText(ctx, p.toFixed(2), margin.left - 8, y, {
        align: "right",
        color: c.axesLabel,
        font: '9px "Inter", sans-serif',
      });
      if (p > 0 && p < 1) {
        ctx.strokeStyle = c.gridLine;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(margin.left, y);
        ctx.lineTo(margin.left + plotW, y);
        ctx.stroke();
      }
    }

    // Y axis label
    ctx.save();
    ctx.translate(14, margin.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    {
      const baseFont = '10px "Inter", sans-serif';
      const baseSize = getFontSizePx(baseFont);
      const subFont = withFontSize(baseFont, Math.max(7, Math.round(baseSize * 0.75)));
      const subDy = Math.max(2, baseSize * 0.35);
      drawInlineText(
        ctx,
        [
          { text: "P", font: baseFont },
          { text: "episode", font: subFont, dy: subDy },
        ],
        0,
        0,
        {
          font: baseFont,
          align: "center",
          color: c.axesLabel,
        }
      );
    }
    ctx.restore();
  }

  // =====================================================================
  // INFO PANEL DRAWINGS (for steps 2-4 right panel)
  // =====================================================================

  function draw1fExplanation(ctx, W, H) {
    const c = getCanvasColors();
    const margin = { top: 25, right: 15, bottom: 30, left: 50 };
    const plotW = W - margin.left - margin.right;
    const plotH = H - margin.top - margin.bottom;

    drawText(ctx, "Why 1/f Background Matters", margin.left + plotW / 2, 14, {
      font: 'bold 12px "Inter", sans-serif',
      align: "center",
    });

    // Draw two scenarios
    const groupW = plotW / 4;
    const sidePad = Math.min(10, groupW * 0.15);
    const innerGap = Math.min(6, groupW * 0.1);
    const barW = Math.max(2, (groupW - 2 * sidePad - innerGap) / 2);
    const frequencies = [2, 4, 8, 16];
    const naive = [0.85, 0.6, 0.2, 0.05]; // Naive: biased by 1/f
    const bosc = [0.05, 0.05, 0.05, 0.05]; // BOSC: unbiased baseline

    for (let i = 0; i < 4; i++) {
      // Naive bar
      const groupStart = margin.left + i * groupW;
      const x1 = groupStart + sidePad;
      const h1 = naive[i] * plotH * 0.8;
      ctx.fillStyle = "rgba(255, 107, 107, 0.5)";
      ctx.fillRect(x1, margin.top + plotH - h1, barW, h1);

      // BOSC bar
      const x2 = x1 + barW + innerGap;
      const h2 = bosc[i] * plotH * 0.8;
      ctx.fillStyle = "rgba(76, 175, 80, 0.5)";
      ctx.fillRect(x2, margin.top + plotH - h2, barW, h2);

      // Frequency label
      drawText(ctx, frequencies[i] + " Hz", groupStart + groupW / 2, margin.top + plotH + 12, {
        align: "center",
        color: c.axesLabel,
        font: '9px "Inter", sans-serif',
      });
    }

    // Legend
    ctx.fillStyle = "rgba(255, 107, 107, 0.5)";
    ctx.fillRect(margin.left, margin.top + 5, 10, 10);
    drawText(ctx, "Naive (biased)", margin.left + 14, margin.top + 10, {
      font: '9px "Inter", sans-serif',
      color: c.background1f,
    });

    ctx.fillStyle = "rgba(76, 175, 80, 0.5)";
    ctx.fillRect(margin.left + 100, margin.top + 5, 10, 10);
    drawText(ctx, "BOSC (unbiased)", margin.left + 114, margin.top + 10, {
      font: '9px "Inter", sans-serif',
      color: c.detected,
    });

    drawText(ctx, "False-positive rate (no real oscillation)", margin.left + plotW / 2, margin.top + plotH + 26, {
      align: "center",
      font: '9px "Inter", sans-serif',
      color: c.axesLabel,
    });
  }

  function drawBackgroundExplanation(ctx, W, H) {
    const c = getCanvasColors();

    drawText(ctx, "The 1/f Background Spectrum", W / 2, 20, {
      font: 'bold 12px "Inter", sans-serif',
      align: "center",
    });

    const lines = [
      "Brain signals have a characteristic shape:",
      "power decreases as frequency increases,",
      "following a 1/f\u1D43 pattern (colored noise).",
      "",
      "In log-log coordinates, this becomes a",
      "straight line. BOSC fits this line to",
      "estimate the non-oscillatory background.",
      "",
      "Anything significantly above this line",
      "is a candidate for a real oscillation.",
    ];

    for (let i = 0; i < lines.length; i++) {
      drawText(ctx, lines[i], W / 2, 48 + i * 16, {
        font: '11px "Inter", sans-serif',
        align: "center",
        color: c.axesLabel,
      });
    }
  }

  function drawChi2Explanation(ctx, W, H, analysis) {
    const c = getCanvasColors();
    const margin = { top: 28, right: 15, bottom: 30, left: 55 };
    const plotW = W - margin.left - margin.right;
    const plotH = H - margin.top - margin.bottom;

    drawText(ctx, "Power Threshold from \u03C7\u00B2(2) Distribution", margin.left + plotW / 2, 14, {
      font: 'bold 11px "Inter", sans-serif',
      align: "center",
    });

    // Draw chi-square(2) PDF
    const xMax = 12;
    const yMax = 0.55;

    function toX(val) {
      return margin.left + (val / xMax) * plotW;
    }
    function toY(val) {
      return margin.top + plotH - (val / yMax) * plotH;
    }

    // Fill area above threshold
    const thresh95 = chi2Inv(0.95);
    ctx.fillStyle = c.chi2Fill;
    ctx.beginPath();
    ctx.moveTo(toX(thresh95), toY(0));
    for (let x = thresh95; x <= xMax; x += 0.1) {
      ctx.lineTo(toX(x), toY(chi2Pdf(x)));
    }
    ctx.lineTo(toX(xMax), toY(0));
    ctx.closePath();
    ctx.fill();

    // PDF curve
    ctx.strokeStyle = c.chi2Line;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x <= xMax; x += 0.1) {
      const px = toX(x),
        py = toY(chi2Pdf(x));
      if (x === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Threshold line
    ctx.strokeStyle = c.chi2Threshold;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 2]);
    ctx.beginPath();
    ctx.moveTo(toX(thresh95), margin.top);
    ctx.lineTo(toX(thresh95), margin.top + plotH);
    ctx.stroke();
    ctx.setLineDash([]);

    // Label
    drawText(ctx, "95th %ile", toX(thresh95) + 4, margin.top + 10, {
      font: '9px "Inter", sans-serif',
      color: c.chi2Threshold,
    });

    {
      const baseFont = 'bold 9px "Inter", sans-serif';
      const baseSize = getFontSizePx(baseFont);
      const subFont = withFontSize(baseFont, Math.max(7, Math.round(baseSize * 0.75)));
      const subDy = Math.max(2, baseSize * 0.35);
      drawInlineText(
        ctx,
        [
          { text: "P", font: baseFont },
          { text: "T", font: subFont, dy: subDy },
        ],
        toX(thresh95) + 4,
        margin.top + 22,
        {
          font: baseFont,
          color: c.chi2Threshold,
        }
      );
    }

    // Axes
    ctx.strokeStyle = c.axes;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(margin.left, margin.top);
    ctx.lineTo(margin.left, margin.top + plotH);
    ctx.lineTo(margin.left + plotW, margin.top + plotH);
    ctx.stroke();

    // Labels
    drawText(ctx, "Power", margin.left + plotW / 2, margin.top + plotH + 14, {
      align: "center",
      color: c.axesLabel,
      font: '10px "Inter", sans-serif',
    });
    drawText(ctx, "\u03C7\u00B2(2) distribution", margin.left + plotW / 2, margin.top + plotH + 26, {
      align: "center",
      font: '9px "Inter", sans-serif',
      color: c.axesLabel,
    });

    ctx.save();
    ctx.translate(16, margin.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    drawText(ctx, "Probability", 0, 0, {
      align: "center",
      color: c.axesLabel,
      font: '10px "Inter", sans-serif',
    });
    ctx.restore();
  }

  // =====================================================================
  // UI STATE & MANAGEMENT
  // =====================================================================

  let state = {
    step: 0, // 0 = start screen, 1-5 = steps
    seed: 42,
    params: {
      oscFreq: 10,
      oscAmp: 2.0,
      alpha: 1.5,
      ptPercentile: 0.95,
      dtCycles: 3,
    },
    signal: null,
    analysis: null,
  };

  const STEP_INFO = [
    // Step 0: Start
    "",
    // Step 1: Signal
    '<strong>Step 1: The Signal.</strong> This is a simulated brain signal with 1/f\u1D43 colored-noise background (like real EEG). We embedded oscillation bursts at your chosen frequency in the shaded regions. In real data, we wouldn\'t know where oscillations are \u2014 that\'s what BOSC finds.',
    // Step 2: Power Spectrum
    '<strong>Step 2: The Power Spectrum.</strong> The power spectrum shows how much energy is at each frequency. Notice power naturally decreases with frequency (the 1/f shape). A naive approach would find "oscillations" everywhere at low frequencies simply because power is always higher there \u2014 a frequency bias.',
    // Step 3: Background Fit
    '<strong>Step 3: Fitting the Background.</strong> BOSC fits the 1/f background with a linear regression in log-log coordinates (red dashed line). This models what the signal would look like with <em>no</em> oscillations \u2014 just colored noise. The peak rising above this line is a candidate oscillation.',
    // Step 4: Thresholds
    '<strong>Step 4: Two Thresholds.</strong> BOSC applies a <em>power threshold</em> (P<sub>T</sub>) derived from the 95th percentile of the \u03C7\u00B2(2) distribution scaled to the background estimate. It also requires a <em>duration threshold</em> (D<sub>T</sub>) of at least 3 complete cycles \u2014 rejecting brief transients that aren\'t truly rhythmic.',
    // Step 5: Detection
    '<strong>Step 5: BOSC Detection.</strong> Segments where <em>both</em> thresholds are exceeded are tagged as oscillatory (green). P<sub>episode</sub> shows the proportion of time oscillations are detected at each frequency. Notice how non-oscillatory frequencies stay near the 5% false-positive baseline \u2014 BOSC removes the frequency bias. Adjust the sliders to explore!',
  ];

  function getEl(id) {
    return document.getElementById(id);
  }

  function setRangeFill(slider) {
    if (!slider) return;
    const min = parseFloat(slider.min || "0");
    const max = parseFloat(slider.max || "100");
    const val = parseFloat(slider.value || "0");
    const pct = max > min ? ((val - min) / (max - min)) * 100 : 0;
    slider.style.setProperty("--bosc-range-fill", pct + "%");
  }

  function initDemo() {
    const container = getEl("bosc-container");
    if (!container) return;

    // Wire up step buttons
    const stepBtns = container.querySelectorAll(".bosc-step-btn");
    stepBtns.forEach((btn) => {
      btn.addEventListener("click", function () {
        const s = parseInt(this.dataset.step);
        goToStep(s);
      });
    });

    // Wire up start button
    const startBtn = getEl("bosc-start-btn");
    if (startBtn) {
      startBtn.addEventListener("click", function () {
        goToStep(1);
      });
    }

    // Wire up new signal button
    const newBtn = getEl("bosc-new-signal-btn");
    if (newBtn) {
      newBtn.addEventListener("click", function () {
        state.seed = Math.floor(Math.random() * 100000);
        regenerate();
      });
    }

    // Wire up sliders
    wireSlider("bosc-freq", "bosc-freq-val", function (v) {
      state.params.oscFreq = parseFloat(v);
      regenerate();
    });
    wireSlider("bosc-amp", "bosc-amp-val", function (v) {
      state.params.oscAmp = parseFloat(v);
      regenerate();
    });
    wireSlider("bosc-pt", "bosc-pt-val", function (v) {
      state.params.ptPercentile = parseFloat(v) / 100;
      redetect();
    });
    wireSlider("bosc-dt", "bosc-dt-val", function (v) {
      state.params.dtCycles = parseInt(v);
      redetect();
    });

    // Set initial canvas sizes based on container
    resizeCanvases();
    window.addEventListener("resize", function () {
      resizeCanvases();
      render();
    });

    // Listen for theme changes
    const observer = new MutationObserver(function () {
      render();
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    render();
  }

  function wireSlider(sliderId, labelId, callback) {
    const slider = getEl(sliderId);
    const label = getEl(labelId);
    if (!slider) return;
    setRangeFill(slider);
    slider.addEventListener("input", function () {
      if (label) label.textContent = this.value;
      setRangeFill(this);
      callback(this.value);
    });
  }

  function getInnerWidth(el) {
    const styles = window.getComputedStyle(el);
    const paddingLeft = parseFloat(styles.paddingLeft) || 0;
    const paddingRight = parseFloat(styles.paddingRight) || 0;
    return Math.max(0, el.clientWidth - paddingLeft - paddingRight);
  }

  function resizeCanvases() {
    const container = getEl("bosc-container");
    if (!container) return;
    const containerW = getInnerWidth(container);
    const mainCanvas = getEl("bosc-canvas-main");
    const specCanvas = getEl("bosc-canvas-spectrum");
    const pepCanvas = getEl("bosc-canvas-pepisode");

    if (mainCanvas) {
      const dpr = window.devicePixelRatio || 1;
      const displayW = Math.max(0, containerW - 10);
      const displayH = 220;
      mainCanvas.style.width = displayW + "px";
      mainCanvas.style.height = displayH + "px";
      mainCanvas.width = displayW * dpr;
      mainCanvas.height = displayH * dpr;
      mainCanvas.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    if (specCanvas && pepCanvas) {
      const dpr = window.devicePixelRatio || 1;
      const availableW = Math.max(0, containerW - 10 - 14);
      const halfW = Math.floor(availableW / 2);
      const displayH = 260;
      for (const cv of [specCanvas, pepCanvas]) {
        cv.style.width = halfW + "px";
        cv.style.height = displayH + "px";
        cv.width = halfW * dpr;
        cv.height = displayH * dpr;
        cv.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    }
  }

  function goToStep(step) {
    state.step = step;

    // Generate signal on first step if needed
    if (step >= 1 && !state.signal) {
      regenerate();
      return; // regenerate calls render
    }

    // Update button states
    const btns = document.querySelectorAll(".bosc-step-btn");
    btns.forEach((btn) => {
      const s = parseInt(btn.dataset.step);
      btn.classList.toggle("active", s === step);
    });

    // Show/hide start screen
    const container = getEl("bosc-container");
    const startScreen = getEl("bosc-start-screen");
    const vizArea = getEl("bosc-viz-area");
    const controlsArea = getEl("bosc-controls-area");
    if (container) container.classList.toggle("bosc-active", step >= 1);
    if (startScreen) startScreen.style.display = step === 0 ? "block" : "none";
    if (vizArea) vizArea.style.display = step >= 1 ? "block" : "none";
    if (controlsArea) controlsArea.style.display = step >= 1 ? "flex" : "none";

    // Show/hide advanced controls
    const advControls = getEl("bosc-advanced-controls");
    if (advControls) advControls.style.display = step >= 4 ? "flex" : "none";

    // Update info text
    const infoEl = getEl("bosc-info-text");
    if (infoEl && STEP_INFO[step]) {
      infoEl.innerHTML = STEP_INFO[step];
      infoEl.style.display = step >= 1 ? "block" : "none";
    }

    render();
  }

  function regenerate() {
    state.signal = generateSignal({
      oscFreq: state.params.oscFreq,
      oscAmp: state.params.oscAmp,
      alpha: state.params.alpha,
      seed: state.seed,
    });

    // Run BOSC analysis
    state.analysis = runBOSC(state.signal, state.params);

    // If we haven't started yet, go to step 1
    if (state.step < 1) {
      goToStep(1);
    } else {
      render();
    }
  }

  function redetect() {
    if (!state.analysis) return;
    // Re-run just the detection with new thresholds
    state.analysis.detection = boscDetect(
      state.analysis.power,
      FREQUENCIES,
      state.analysis.bg.bgPower,
      state.params.ptPercentile,
      state.params.dtCycles
    );

    // Update targetFi
    let targetFi = 0,
      minDist = Infinity;
    for (let fi = 0; fi < FREQUENCIES.length; fi++) {
      const d = Math.abs(FREQUENCIES[fi] - state.params.oscFreq);
      if (d < minDist) {
        minDist = d;
        targetFi = fi;
      }
    }
    state.analysis.targetFi = targetFi;
    state.analysis.targetFreq = FREQUENCIES[targetFi];

    render();
  }

  function render() {
    const mainCanvas = getEl("bosc-canvas-main");
    const specCanvas = getEl("bosc-canvas-spectrum");
    const pepCanvas = getEl("bosc-canvas-pepisode");

    if (state.step >= 1 && state.signal && mainCanvas) {
      drawSignalTrace(mainCanvas, state.signal, state.analysis, state.step);
    }
    if (specCanvas) {
      drawPowerSpectrum(specCanvas, state.analysis, state.step);
    }
    if (pepCanvas) {
      drawPepisode(pepCanvas, state.analysis, state.step);
    }
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
