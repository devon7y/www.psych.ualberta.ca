/**
 * BOSC Interactive Demo
 * Better OSCillation detection - Computational Memory Lab
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

  // Signal ground-truth regions (in seconds)
  // BURST1: a true sustained oscillation (rhythmic activity)
  // BURST2: a region of intermittent transient bursts — high power, no sustained rhythm
  //         (what a naive power measure flags as "oscillation" but BOSC correctly rejects)
  const BURST1 = [1.0, 3.5];  // 2.5 seconds, sustained
  const BURST2 = [5.65, 6.35]; // narrow region highlighting a single sharp transient
  // A monophasic Gaussian spike (no sinusoidal modulation) — broadband, visibly
  // non-rhythmic. Produces strong wavelet power at many frequencies for a brief
  // instant, but its duration is far below BOSC's 3-cycle threshold.
  const TRANSIENT_CENTERS = [6.0];   // seconds (absolute time)
  const TRANSIENT_SIGMA = 0.045;     // envelope std dev in seconds (spike width)
  const TRANSIENT_AMP_SCALE = 2.4;   // peak amplitude relative to oscAmp

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
    burstRegionTransient: "rgba(255, 183, 130, 0.18)",
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

    // Add the sustained oscillation burst (BURST1) with a Hann-window envelope
    addSustainedBurst(signal, BURST1[0], BURST1[1], oscAmp, oscFreq);

    // Add the intermittent transient bursts inside the BURST2 region
    addTransientBursts(signal, oscAmp, oscFreq);

    return signal;
  }

  // Hann-windowed sustained oscillation added in-place
  function addSustainedBurst(target, tStart, tEnd, oscAmp, oscFreq) {
    const iStart = Math.round(tStart * SR);
    const iEnd = Math.min(Math.round(tEnd * SR), N);
    const len = iEnd - iStart;
    for (let i = 0; i < len; i++) {
      const env = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (len - 1)));
      target[iStart + i] += oscAmp * env * Math.sin(2 * Math.PI * oscFreq * (i / SR));
    }
  }

  // Monophasic Gaussian spike(s) added in-place — a broadband transient event.
  // No sine modulation, so the spike visually reads as a single sharp peak.
  // It still contains power at the target frequency (wide-band Gaussian spectrum),
  // but its duration is far below BOSC's 3-cycle threshold.
  // The oscFreq parameter is intentionally unused (shape is purely envelope).
  function addTransientBursts(target, oscAmp, _oscFreq) {
    const halfWidth = Math.round(5 * TRANSIENT_SIGMA * SR);
    const twoSigma2 = 2 * TRANSIENT_SIGMA * TRANSIENT_SIGMA;
    const amp = TRANSIENT_AMP_SCALE * oscAmp;
    for (const t0 of TRANSIENT_CENTERS) {
      const i0 = Math.round(t0 * SR);
      const iLo = Math.max(0, i0 - halfWidth);
      const iHi = Math.min(N, i0 + halfWidth);
      for (let i = iLo; i < iHi; i++) {
        const dt = (i - i0) / SR;
        const env = Math.exp(-(dt * dt) / twoSigma2);
        target[i] += amp * env;
      }
    }
  }

  // Extract oscillation component from signal (for visual decomposition)
  function extractComponents(signal, params) {
    const { oscFreq, oscAmp } = params;
    const oscillation = new Float64Array(N);
    const background = new Float64Array(N);

    // Reconstruct the exact waveform that was added in generateSignal
    addSustainedBurst(oscillation, BURST1[0], BURST1[1], oscAmp, oscFreq);
    addTransientBursts(oscillation, oscAmp, oscFreq);

    // Background = signal minus oscillation
    for (let i = 0; i < N; i++) {
      background[i] = signal[i] - oscillation[i];
    }

    return { background, oscillation };
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
        burstRegionTransient: "rgba(255, 160, 90, 0.22)",
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

    // Draw burst regions (ground truth): green = rhythmic, pink = non-rhythmic
    if (step >= 1) {
      const regions = [
        { range: BURST1, color: c.burstRegion },
        { range: BURST2, color: c.burstRegionTransient },
      ];
      for (const { range: [tStart, tEnd], color } of regions) {
        const x1 = margin.left + (tStart / DURATION) * plotW;
        const x2 = margin.left + (tEnd / DURATION) * plotW;
        ctx.fillStyle = color;
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

    // Draw background-only trace at step 3 UNDER the signal. We display a circularly-
    // shifted copy of the oscillation-subtracted background, scaled down so it reads
    // as a faint, smaller-amplitude colored-noise reference line. It preserves the
    // 1/f spectral character (so it looks like spectra, not a smooth line) while
    // staying visually secondary to the blue signal.
    if (step === 3 && state.components) {
      const bg = state.components.background;
      const shift = Math.round(0.85 * SR); // 0.85 s circular shift
      const ampScale = 0.3;                // scale down amplitude — barely noticeable
      // Anchor the pink trace at the blue signal's starting y-value, so it sits along
      // the same baseline the signal begins at and stays there (with small colored-
      // noise wiggles) instead of following the signal's ups and downs.
      const bgCenterY = margin.top + plotH / 2 - ((signal[0] - mid) / padRange) * plotH - 0.2 * plotH;
      ctx.beginPath();
      ctx.strokeStyle = c.background1f;
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = 0.7;
      for (let i = 0; i < N; i++) {
        const j = (i + shift) % N;
        const x = margin.left + (i / N) * plotW;
        const y = bgCenterY - (ampScale * (bg[j] - mid) / padRange) * plotH;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.globalAlpha = 1.0;
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
      drawText(ctx, t + " s", x, margin.top + plotH + 14, {
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

    // Legend for burst regions — left-aligned block anchored so the longest label's
    // right edge sits against the plot's right axis. All swatches line up vertically.
    if (step >= 1 && step < 4) {
      const legendFont = '10px "Inter", sans-serif';
      const rightEdge = margin.left + plotW - 4;
      const swatchW = 12;
      const swatchGap = 4;
      ctx.font = legendFont;
      const widest = Math.max(
        ctx.measureText("Embedded rhythmic activity").width,
        ctx.measureText("Embedded non-rhythmic activity").width,
        step === 3 ? ctx.measureText("Background only (1/f)").width : 0
      );
      const startX = rightEdge - swatchW - swatchGap - widest;

      const drawLegendEntry = (label, y, swatchColor, textColor, asLine) => {
        if (asLine) {
          ctx.strokeStyle = swatchColor;
          ctx.globalAlpha = 0.4;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(startX, y);
          ctx.lineTo(startX + swatchW, y);
          ctx.stroke();
          ctx.globalAlpha = 1.0;
        } else {
          ctx.fillStyle = swatchColor;
          ctx.fillRect(startX, y - 6, swatchW, 12);
        }
        drawText(ctx, label, startX + swatchW + swatchGap, y, {
          font: legendFont,
          color: textColor,
        });
      };

      drawLegendEntry("Embedded rhythmic activity", margin.top + 11, c.burstRegion, c.axesLabel, false);
      drawLegendEntry("Embedded non-rhythmic activity", margin.top + 27, c.burstRegionTransient, c.axesLabel, false);
      if (step === 3) {
        drawLegendEntry("Background only (1/f)", margin.top + 43, c.background1f, c.background1f, true);
      }
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
    // Include threshold in range if showing, but only expand modestly
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

    // Threshold line (step 4+) — extends across full plot width
    if (step >= 4) {
      // Threshold = background * ptMultiplier, so in log space:
      // log10(threshold) = log10(bg) + log10(ptMultiplier)
      // This is a straight line parallel to the background fit, shifted up
      // Visual offset responds to PT slider: higher percentile = further from background
      // Map percentile range (0.80–0.99) to a visible but compact offset
      const ptPct = state.params.ptPercentile;
      const ptLogOffset = 0.03 + (ptPct - 0.80) * (0.15 / 0.19); // 0.80→0.03, 0.99→0.18
      const f0 = FREQUENCIES[0] * 0.8;
      const f1 = FREQUENCIES[FREQUENCIES.length - 1] * 1.2;
      const thP0 = bg.slope * Math.log10(f0) + bg.intercept + ptLogOffset;
      const thP1 = bg.slope * Math.log10(f1) + bg.intercept + ptLogOffset;

      // Fill region above threshold to top of plot
      ctx.fillStyle = c.thresholdFill;
      ctx.beginPath();
      ctx.moveTo(toX(Math.log10(f0)), toY(thP0));
      ctx.lineTo(toX(Math.log10(f1)), toY(thP1));
      ctx.lineTo(toX(Math.log10(f1)), margin.top);
      ctx.lineTo(toX(Math.log10(f0)), margin.top);
      ctx.closePath();
      ctx.fill();

      // Threshold line
      ctx.strokeStyle = c.threshold;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 2]);
      ctx.beginPath();
      ctx.moveTo(toX(Math.log10(f0)), toY(thP0));
      ctx.lineTo(toX(Math.log10(f1)), toY(thP1));
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

    // Legend — positioned at top-right to avoid covering the spectral lines
    const legendW = 150;
    const legendH = step >= 4 ? 46 : (step >= 3 ? 32 : 16);
    const legendX = margin.left + plotW - legendW - 4;
    let legendY = margin.top + 8;
    ctx.fillStyle = c.canvasBg;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(legendX - 4, legendY - 10, legendW + 8, legendH);
    ctx.globalAlpha = 1.0;
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
        drawThresholdsPanel(ctx, W, H, analysis);
      } else if (step === 3) {
        draw1fExplanation(ctx, W, H);
      } else if (step === 2 && analysis) {
        drawSpectrogram(ctx, W, H, analysis);
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

    // ---------------------------------------------------------------
    // Two stacked signal traces: Remembered (hit) vs Forgotten (miss)
    // Recreates the style of Whitten et al. / Caplan lab P_episode figure
    // ---------------------------------------------------------------
    drawPepisodeTraces(ctx, W, H, analysis);
  }

  // Seeded PRNG for reproducible example traces
  function pepRng(seed) {
    let s = seed | 0;
    return function () {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Generate a realistic-looking EEG snippet with controllable oscillation proportion
  function generatePepSignal(nSamples, sr, oscFreq, oscProportion, seed) {
    const rng = pepRng(seed);
    const sig = new Float64Array(nSamples);
    const detected = new Uint8Array(nSamples);

    // 1/f-ish background using summed sine waves at random phases
    const phases = [];
    for (let h = 0; h < 12; h++) phases.push(rng() * 6.28);
    for (let i = 0; i < nSamples; i++) {
      let v = 0;
      // Low-frequency drift
      v += 2.5 * Math.sin(2 * Math.PI * 0.8 * i / sr + phases[0]);
      v += 1.8 * Math.sin(2 * Math.PI * 2.1 * i / sr + phases[1]);
      v += 1.2 * Math.sin(2 * Math.PI * 3.5 * i / sr + phases[2]);
      // Higher freq components
      for (let h = 0; h < 6; h++) {
        const f = 7 + h * 5.1;
        v += (0.6 / (1 + h * 0.4)) * Math.sin(2 * Math.PI * f * i / sr + phases[3 + h]);
      }
      // White-ish noise
      v += (rng() - 0.5) * 1.5;
      sig[i] = v;
    }

    // Place oscillation bursts to fill exactly oscProportion of total time
    // For the "hit" case (high proportion): many bursts spread throughout
    // For the "miss" case (low proportion): one small burst near the end
    const totalOscSamples = Math.round(oscProportion * nSamples);

    if (oscProportion > 0.5) {
      // High detection: one contiguous detected block from the start
      // with only the tail portion undetected
      const phase = rng() * 6.28;
      for (let i = 0; i < totalOscSamples && i < nSamples; i++) {
        // Varying amplitude oscillation to look natural
        const ampMod = 3.5 + 3.5 * Math.sin(2 * Math.PI * 0.7 * i / sr + phase * 0.5);
        sig[i] += ampMod * Math.sin(2 * Math.PI * oscFreq * i / sr + phase);
        detected[i] = 1;
      }
    } else {
      // Low detection: place one small burst near the end of the signal
      const burstLen = Math.min(totalOscSamples, nSamples);
      const startPos = nSamples - burstLen - Math.round(0.02 * sr);
      const phase = rng() * 6.28;
      for (let i = 0; i < burstLen; i++) {
        const env = 0.5 * (1 - Math.cos(2 * Math.PI * i / (burstLen - 1)));
        sig[startPos + i] += 3.0 * env * Math.sin(2 * Math.PI * oscFreq * i / sr + phase);
        detected[startPos + i] = 1;
      }
    }

    return { signal: sig, detected: detected };
  }

  // Cache the example traces so they don't regenerate on every render
  let pepTraceCache = null;
  const PEP_CACHE_VER = 4; // bump to regenerate

  function getPepTraces() {
    if (pepTraceCache && pepTraceCache._ver === PEP_CACHE_VER) return pepTraceCache;
    const sr = 256;
    const durMs = 1500;
    const nSamples = Math.round(durMs / 1000 * sr);
    const hitData = generatePepSignal(nSamples, sr, 4, 0.90, 1009);
    const missData = generatePepSignal(nSamples, sr, 6.73, 0.09, 1059);
    pepTraceCache = {
      _ver: PEP_CACHE_VER,
      sr: sr,
      durMs: durMs,
      nSamples: nSamples,
      hit: hitData,
      miss: missData,
    };
    return pepTraceCache;
  }

  function drawPepisodeTraces(ctx, W, H, analysis) {
    const c = getCanvasColors();
    const traces = getPepTraces();
    const headerH = 18;
    const margin = { top: headerH + 4, right: 10, bottom: 8, left: 48 };
    const totalW = W - margin.left - margin.right;
    const panelGap = 14;
    const titleH = 14;
    const traceH = (H - margin.top - margin.bottom - panelGap - titleH * 2 - 12) / 2;

    // Section title
    drawText(ctx, "Examples from Paired-Associate Recognition Task Trials", W / 2, headerH / 2 + 2, {
      font: 'bold 10px "Inter", sans-serif', align: "center",
    });

    // Helper to draw one trace panel
    function drawTrace(data, label, pepValue, detColor, rx, ry, rw, rh) {
      const sig = data.signal;
      const det = data.detected;
      const n = traces.nSamples;

      // Find range
      let minV = Infinity, maxV = -Infinity;
      for (let i = 0; i < n; i++) {
        if (sig[i] < minV) minV = sig[i];
        if (sig[i] > maxV) maxV = sig[i];
      }
      const range = (maxV - minV) || 1;
      const mid = (maxV + minV) / 2;
      const pad = range * 0.1;

      // Title line
      const pepStr = "PEPISODE = " + pepValue.toFixed(2);
      drawText(ctx, label + ",  ", rx + 4, ry + 6, {
        font: '8px "Inter", sans-serif', color: c.axesLabel,
      });
      // Measure label width to place PEPISODE value
      ctx.font = '8px "Inter", sans-serif';
      const labelW = ctx.measureText(label + ",  ").width;
      drawText(ctx, pepStr, rx + 4 + labelW, ry + 6, {
        font: 'bold 9px "Inter", sans-serif', color: detColor,
      });

      const plotTop = ry + titleH;
      const plotH = rh - titleH - 14;
      const plotW = rw;

      // Grid lines
      ctx.strokeStyle = c.gridLine; ctx.lineWidth = 0.3;
      for (let ms = 150; ms <= traces.durMs; ms += 150) {
        const gx = rx + (ms / traces.durMs) * plotW;
        ctx.beginPath(); ctx.moveTo(gx, plotTop); ctx.lineTo(gx, plotTop + plotH); ctx.stroke();
      }

      // Zero line
      const zeroY = plotTop + plotH / 2 - ((-mid) / (range + 2 * pad)) * plotH;
      ctx.strokeStyle = c.gridLine; ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(rx, zeroY); ctx.lineTo(rx + plotW, zeroY);
      ctx.stroke();

      // Draw signal: non-detected in dim, detected in color
      // We draw in segments to switch colors
      function toY(v) {
        return plotTop + plotH / 2 - ((v - mid) / (range + 2 * pad)) * plotH;
      }
      function toX(i) {
        return rx + (i / n) * plotW;
      }

      // Draw signal as continuous line, switching color at detected boundaries
      // This avoids gaps at transition points
      let prevDet = det[0];
      ctx.strokeStyle = prevDet ? detColor : c.signal;
      ctx.lineWidth = prevDet ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(toX(0), toY(sig[0]));

      for (let i = 1; i < n; i++) {
        const x = toX(i), y = toY(sig[i]);
        const curDet = det[i];

        if (curDet !== prevDet) {
          // Draw up to this point with current color, ending at this sample
          ctx.lineTo(x, y);
          ctx.stroke();
          // Start new segment from this same point with new color
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.strokeStyle = curDet ? detColor : c.signal;
          ctx.lineWidth = curDet ? 1.5 : 1;
          prevDet = curDet;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();

      // Axes
      ctx.strokeStyle = c.axes; ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(rx, plotTop);
      ctx.lineTo(rx, plotTop + plotH);
      ctx.lineTo(rx + plotW, plotTop + plotH);
      ctx.stroke();

      // Y axis label
      ctx.save();
      ctx.translate(rx - 30, plotTop + plotH / 2);
      ctx.rotate(-Math.PI / 2);
      drawText(ctx, "Voltage [\u00B5V]", 0, 0, {
        align: "center", color: c.axesLabel, font: '7px "Inter", sans-serif',
      });
      ctx.restore();

      // Y ticks
      const vStep = Math.ceil(range / 4 / 5) * 5 || 5;
      for (let v = -vStep * 3; v <= vStep * 3; v += vStep) {
        const ty = toY(v);
        if (ty < plotTop || ty > plotTop + plotH) continue;
        drawText(ctx, v + "", rx - 4, ty, {
          align: "right", color: c.axesLabel, font: '7px "Inter", sans-serif',
        });
      }

      // X axis labels (ms)
      for (let ms = 150; ms <= traces.durMs; ms += 150) {
        const tx = rx + (ms / traces.durMs) * plotW;
        drawText(ctx, ms + "", tx, plotTop + plotH + 8, {
          align: "center", color: c.axesLabel, font: '7px "Inter", sans-serif',
        });
      }
    }

    // --- Top: Remembered (Hit) ---
    const topY = margin.top;
    drawTrace(
      traces.hit,
      "Electrode Fz, 4 Hz oscillations, Remembered Pair (Hit)",
      0.90,
      c.detected,
      margin.left, topY, totalW, traceH + titleH
    );

    // --- Bottom: Forgotten (Miss) ---
    const botY = topY + traceH + titleH + panelGap;
    drawTrace(
      traces.miss,
      "Electrode Fz, 6.73 Hz oscillations, Forgotten Pair (Miss)",
      0.09,
      c.background1f,
      margin.left, botY, totalW, traceH + titleH
    );

    // X axis title at very bottom
    drawText(ctx, "Time [ms]", margin.left + totalW / 2, H - 2, {
      align: "center", color: c.axesLabel, font: '8px "Inter", sans-serif',
    });
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
    drawText(ctx, "Without background correction", margin.left + 14, margin.top + 10, {
      font: '9px "Inter", sans-serif',
      color: c.background1f,
    });

    ctx.fillStyle = "rgba(76, 175, 80, 0.5)";
    ctx.fillRect(margin.left, margin.top + 19, 10, 10);
    drawText(ctx, "With background correction (BOSC)", margin.left + 14, margin.top + 24, {
      font: '9px "Inter", sans-serif',
      color: c.detected,
    });

    drawText(ctx, "False-positive rate (no real oscillation)", margin.left + plotW / 2, margin.top + plotH + 26, {
      align: "center",
      font: '9px "Inter", sans-serif',
      color: c.axesLabel,
    });
  }

  // Spectrogram (time-frequency heatmap) using wavelet power from BOSC analysis
  function drawSpectrogram(ctx, W, H, analysis) {
    const c = getCanvasColors();
    const margin = { top: 28, right: 15, bottom: 35, left: 50 };
    const plotW = W - margin.left - margin.right;
    const plotH = H - margin.top - margin.bottom;

    drawText(ctx, "Spectrogram (Wavelet Power)", margin.left + plotW / 2, 14, {
      font: 'bold 12px "Inter", sans-serif', align: "center",
    });

    const power = analysis.power; // power[freqIdx][timeIdx]
    const nFreqs = FREQUENCIES.length;

    // Find power range (use log scale)
    let logMin = Infinity, logMax = -Infinity;
    for (let fi = 0; fi < nFreqs; fi++) {
      for (let t = 0; t < N; t++) {
        const lp = Math.log10(power[fi][t] + 1e-20);
        if (lp < logMin) logMin = lp;
        if (lp > logMax) logMax = lp;
      }
    }
    const logRange = logMax - logMin || 1;

    // Draw heatmap: each frequency band gets a row, time across columns
    const cellH = plotH / nFreqs;
    const colW = plotW / N;

    // Use ImageData for performance if canvas is large enough
    for (let fi = 0; fi < nFreqs; fi++) {
      for (let t = 0; t < N; t += Math.max(1, Math.floor(N / plotW))) {
        const lp = Math.log10(power[fi][t] + 1e-20);
        const norm = (lp - logMin) / logRange; // 0..1

        // Color map: dark blue → cyan → yellow → red
        let r, g, b;
        if (norm < 0.25) {
          const p = norm / 0.25;
          r = Math.round(20 + p * 0);
          g = Math.round(25 + p * 80);
          b = Math.round(80 + p * 100);
        } else if (norm < 0.5) {
          const p = (norm - 0.25) / 0.25;
          r = Math.round(20 + p * 50);
          g = Math.round(105 + p * 100);
          b = Math.round(180 - p * 50);
        } else if (norm < 0.75) {
          const p = (norm - 0.5) / 0.25;
          r = Math.round(70 + p * 185);
          g = Math.round(205 - p * 50);
          b = Math.round(130 - p * 130);
        } else {
          const p = (norm - 0.75) / 0.25;
          r = 255;
          g = Math.round(155 - p * 115);
          b = Math.round(0 + p * 20);
        }

        ctx.fillStyle = "rgb(" + r + "," + g + "," + b + ")";
        // Freq axis: bottom = low freq (fi=0), top = high freq (fi=nFreqs-1)
        const y = margin.top + (nFreqs - 1 - fi) / nFreqs * plotH;
        const x = margin.left + (t / N) * plotW;
        const w = Math.ceil(colW * Math.max(1, Math.floor(N / plotW))) + 1;
        ctx.fillRect(x, y, w, Math.ceil(cellH) + 1);
      }
    }

    // Burst region outlines
    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    for (const [tStart, tEnd] of [BURST1, BURST2]) {
      const x1 = margin.left + (tStart / DURATION) * plotW;
      const x2 = margin.left + (tEnd / DURATION) * plotW;
      ctx.strokeRect(x1, margin.top, x2 - x1, plotH);
    }
    ctx.setLineDash([]);

    // Axes
    ctx.strokeStyle = c.axes; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(margin.left, margin.top);
    ctx.lineTo(margin.left, margin.top + plotH);
    ctx.lineTo(margin.left + plotW, margin.top + plotH);
    ctx.stroke();

    // X axis
    for (let t = 0; t <= DURATION; t += 2) {
      const x = margin.left + (t / DURATION) * plotW;
      drawText(ctx, t + " s", x, margin.top + plotH + 14, {
        align: "center", color: c.axesLabel, font: '10px "Inter", sans-serif',
      });
    }
    drawText(ctx, "Time", margin.left + plotW / 2, margin.top + plotH + 28, {
      align: "center", color: c.axesLabel, font: '10px "Inter", sans-serif',
    });

    // Y axis: frequency labels
    const labelFreqs = [2, 4, 8, 16, 32];
    for (const f of labelFreqs) {
      let closestFi = 0, closestDist = Infinity;
      for (let fi = 0; fi < nFreqs; fi++) {
        const d = Math.abs(FREQUENCIES[fi] - f);
        if (d < closestDist) { closestDist = d; closestFi = fi; }
      }
      const y = margin.top + (nFreqs - 1 - closestFi) / nFreqs * plotH + cellH / 2;
      drawText(ctx, f + "", margin.left - 8, y, {
        align: "right", color: c.axesLabel, font: '9px "Inter", sans-serif',
      });
    }
    ctx.save();
    ctx.translate(14, margin.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    drawText(ctx, "Frequency (Hz)", 0, 0, {
      align: "center", color: c.axesLabel, font: '10px "Inter", sans-serif',
    });
    ctx.restore();

    // Color bar legend (small, right side)
    const cbX = margin.left + plotW - 8;
    const cbW = 6;
    const cbH = plotH * 0.4;
    const cbY = margin.top + (plotH - cbH) / 2;
    for (let i = 0; i < cbH; i++) {
      const norm = 1 - i / cbH;
      let r, g, b2;
      if (norm < 0.25) {
        const p = norm / 0.25;
        r = Math.round(20); g = Math.round(25 + p * 80); b2 = Math.round(80 + p * 100);
      } else if (norm < 0.5) {
        const p = (norm - 0.25) / 0.25;
        r = Math.round(20 + p * 50); g = Math.round(105 + p * 100); b2 = Math.round(180 - p * 50);
      } else if (norm < 0.75) {
        const p = (norm - 0.5) / 0.25;
        r = Math.round(70 + p * 185); g = Math.round(205 - p * 50); b2 = Math.round(130 - p * 130);
      } else {
        const p = (norm - 0.75) / 0.25;
        r = 255; g = Math.round(155 - p * 115); b2 = Math.round(0 + p * 20);
      }
      ctx.fillStyle = "rgb(" + r + "," + g + "," + b2 + ")";
      ctx.fillRect(cbX, cbY + i, cbW, 1);
    }
    drawText(ctx, "High", cbX + cbW + 2, cbY + 4, {
      font: '7px "Inter", sans-serif', color: c.axesLabel,
    });
    drawText(ctx, "Low", cbX + cbW + 2, cbY + cbH - 2, {
      font: '7px "Inter", sans-serif', color: c.axesLabel,
    });
  }

  function drawBackgroundDecomposition(ctx, W, H) {
    const c = getCanvasColors();
    if (!state.signal || !state.components) {
      drawText(ctx, "Generate a signal first", W / 2, H / 2, { align: "center", color: c.axesLabel });
      return;
    }

    const bg = state.components.background;
    const osc = state.components.oscillation;
    const margin = { top: 14, right: 10, bottom: 8, left: 40 };
    const totalH = H - margin.top - margin.bottom;
    const plotH = totalH * 0.38;
    const gap = totalH * 0.12;
    const plotW = W - margin.left - margin.right;

    // Find ranges
    let bgMin = Infinity, bgMax = -Infinity;
    let oscMin = Infinity, oscMax = -Infinity;
    for (let i = 0; i < N; i++) {
      if (bg[i] < bgMin) bgMin = bg[i];
      if (bg[i] > bgMax) bgMax = bg[i];
      if (osc[i] < oscMin) oscMin = osc[i];
      if (osc[i] > oscMax) oscMax = osc[i];
    }
    const bgRange = (bgMax - bgMin) || 1;
    const bgMid = (bgMax + bgMin) / 2;
    const oscRange = (oscMax - oscMin) || 1;
    const oscMid = (oscMax + oscMin) / 2;

    // --- Top: Background (1/f noise) ---
    const bgTop = margin.top;
    drawText(ctx, "Background (1/f colored noise)", margin.left + plotW / 2, bgTop + 2, {
      font: 'bold 10px "Inter", sans-serif', align: "center", color: c.axesLabel,
    });

    // Burst regions
    ctx.fillStyle = "rgba(85, 102, 119, 0.08)";
    for (const [tStart, tEnd] of [BURST1, BURST2]) {
      const x1 = margin.left + (tStart / DURATION) * plotW;
      const x2 = margin.left + (tEnd / DURATION) * plotW;
      ctx.fillRect(x1, bgTop + 12, x2 - x1, plotH);
    }

    ctx.strokeStyle = c.signalDim;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < N; i++) {
      const x = margin.left + (i / N) * plotW;
      const y = bgTop + 12 + plotH / 2 - ((bg[i] - bgMid) / (bgRange * 1.1)) * plotH;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Axes
    ctx.strokeStyle = c.axes; ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(margin.left, bgTop + 12);
    ctx.lineTo(margin.left, bgTop + 12 + plotH);
    ctx.lineTo(margin.left + plotW, bgTop + 12 + plotH);
    ctx.stroke();

    // --- "+" sign between traces ---
    const plusY = bgTop + 12 + plotH + gap * 0.45;
    drawText(ctx, "+", W / 2, plusY, {
      font: 'bold 16px "Inter", sans-serif', align: "center", color: c.axesLabel,
    });

    // --- Bottom: Oscillation component ---
    const oscTop = bgTop + 12 + plotH + gap;
    drawText(ctx, "Oscillation component (embedded bursts)", margin.left + plotW / 2, oscTop + 2, {
      font: 'bold 10px "Inter", sans-serif', align: "center", color: c.detected,
    });

    // Burst regions
    ctx.fillStyle = c.burstRegion;
    for (const [tStart, tEnd] of [BURST1, BURST2]) {
      const x1 = margin.left + (tStart / DURATION) * plotW;
      const x2 = margin.left + (tEnd / DURATION) * plotW;
      ctx.fillRect(x1, oscTop + 12, x2 - x1, plotH);
    }

    ctx.strokeStyle = c.detected;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < N; i++) {
      const x = margin.left + (i / N) * plotW;
      const y = oscTop + 12 + plotH / 2 - ((osc[i] - oscMid) / (oscRange * 1.1 || bgRange * 1.1)) * plotH;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Axes
    ctx.strokeStyle = c.axes; ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(margin.left, oscTop + 12);
    ctx.lineTo(margin.left, oscTop + 12 + plotH);
    ctx.lineTo(margin.left + plotW, oscTop + 12 + plotH);
    ctx.stroke();

    // "= full signal" at bottom
    drawText(ctx, "= Full signal (shown left)", W / 2, oscTop + 12 + plotH + 12, {
      font: '10px "Inter", sans-serif', align: "center", color: c.axesLabel,
    });
  }

  // Compact chi-square explanation drawn within a sub-region
  function drawChi2Compact(ctx, rx, ry, rw, rh) {
    const c = getCanvasColors();
    const pad = { top: 16, right: 8, bottom: 18, left: 40 };
    const plotW = rw - pad.left - pad.right;
    const plotH = rh - pad.top - pad.bottom;

    drawText(ctx, "Power Threshold: \u03C7\u00B2(2) at 95th %ile", rx + rw / 2, ry + 8, {
      font: 'bold 10px "Inter", sans-serif', align: "center",
    });

    const xMax = 12, yMax = 0.55;
    function toX(v) { return rx + pad.left + (v / xMax) * plotW; }
    function toY(v) { return ry + pad.top + plotH - (v / yMax) * plotH; }

    const thresh95 = chi2Inv(0.95);
    ctx.fillStyle = c.chi2Fill;
    ctx.beginPath();
    ctx.moveTo(toX(thresh95), toY(0));
    for (let x = thresh95; x <= xMax; x += 0.2) ctx.lineTo(toX(x), toY(chi2Pdf(x)));
    ctx.lineTo(toX(xMax), toY(0));
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = c.chi2Line; ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let x = 0; x <= xMax; x += 0.2) {
      const px = toX(x), py = toY(chi2Pdf(x));
      if (x === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();

    ctx.strokeStyle = c.chi2Threshold; ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 2]);
    ctx.beginPath();
    ctx.moveTo(toX(thresh95), ry + pad.top);
    ctx.lineTo(toX(thresh95), ry + pad.top + plotH);
    ctx.stroke();
    ctx.setLineDash([]);

    drawText(ctx, "95th %ile \u2192 P\u1D40", toX(thresh95) + 3, ry + pad.top + 8, {
      font: '8px "Inter", sans-serif', color: c.chi2Threshold,
    });

    ctx.strokeStyle = c.axes; ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(rx + pad.left, ry + pad.top);
    ctx.lineTo(rx + pad.left, ry + pad.top + plotH);
    ctx.lineTo(rx + pad.left + plotW, ry + pad.top + plotH);
    ctx.stroke();

    drawText(ctx, "Power", rx + rw / 2, ry + pad.top + plotH + 10, {
      align: "center", color: c.axesLabel, font: '8px "Inter", sans-serif',
    });
  }

  // Draw three duration threshold example cases
  // Draw three duration threshold example cases (style after Whitten et al. Fig 1)
  // Interactive: responds to current dtCycles from the slider
  function drawDurationExamples(ctx, rx, ry, rw, rh, params) {
    const c = getCanvasColors();
    const freq = params.oscFreq || 10;
    const dtCycles = params.dtCycles || 3;

    // Case A: always has dtCycles + 1 cycles and strong power → detected
    // Case B: always has dtCycles - 1.5 cycles and strong power → too short
    // Case C: always has dtCycles + 2 cycles but weak power → too weak
    const aCycles = dtCycles + 1;
    const bCycles = Math.max(1, dtCycles - 1.5);
    const cCycles = dtCycles + 2;

    const cases = [
      { letter: "A", oscCycles: aCycles, aboveThresh: true,
        durPass: aCycles >= dtCycles, pwrPass: true },
      { letter: "B", oscCycles: bCycles, aboveThresh: true,
        durPass: bCycles >= dtCycles, pwrPass: true },
      { letter: "C", oscCycles: cCycles, aboveThresh: false,
        durPass: cCycles >= dtCycles, pwrPass: false },
    ];
    // Derive overall pass from both checks
    for (const cs of cases) cs.pass = cs.durPass && cs.pwrPass;

    const gap = 6;
    const panelW = (rw - gap * (cases.length + 1)) / cases.length;
    const panelTop = ry + 4;
    const panelH = rh - 8;

    for (let ci = 0; ci < cases.length; ci++) {
      const cs = cases[ci];
      const px = rx + gap + ci * (panelW + gap);
      const headerH = 18;
      const plotTop = panelTop + headerH;
      const plotH = panelH - headerH - 32;
      const plotW = panelW;
      const midY = plotTop + plotH * 0.5;

      // --- Header: letter + pass/fail label ---
      const letterColor = cs.pass ? c.detected : c.background1f;
      const subtitle = cs.pass ? "(Oscillatory)" : "(Non-oscillatory)";
      drawText(ctx, cs.letter, px + 4, panelTop + 7, {
        font: 'bold 11px "Inter", sans-serif', color: letterColor,
      });
      drawText(ctx, subtitle, px + 16, panelTop + 7, {
        font: '9px "Inter", sans-serif', color: c.axesLabel,
      });

      // --- Power threshold: two bold red dashed horizontal lines ---
      // Threshold height responds to ptPercentile (0.80–0.99)
      // Map percentile to visual threshold: higher percentile = stricter = lines further out
      const ptPct = params.ptPercentile || 0.95;
      const ptFrac = 0.15 + (ptPct - 0.80) * (0.35 / 0.19); // maps 0.80→0.15, 0.99→0.50
      const ptColor = c.background1f;
      const ptLineW = 2;
      const ptY_top = midY - plotH * ptFrac;
      const ptY_bot = midY + plotH * ptFrac;
      // Signal amplitude: "above" cases exceed threshold, "below" cases don't
      const amp = cs.aboveThresh ? plotH * (ptFrac + 0.10) : plotH * (ptFrac - 0.12);

      ctx.strokeStyle = ptColor;
      ctx.lineWidth = ptLineW;
      ctx.setLineDash([6, 3]);
      ctx.beginPath();
      ctx.moveTo(px, ptY_top);
      ctx.lineTo(px + plotW, ptY_top);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(px, ptY_bot);
      ctx.lineTo(px + plotW, ptY_bot);
      ctx.stroke();
      ctx.setLineDash([]);

      // Red double-arrow for power threshold (left side)
      const arrowX = px + 6;
      ctx.strokeStyle = ptColor; ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(arrowX, ptY_top + 2);
      ctx.lineTo(arrowX, ptY_bot - 2);
      ctx.stroke();
      // Arrow heads
      ctx.beginPath();
      ctx.moveTo(arrowX - 2.5, ptY_top + 5); ctx.lineTo(arrowX, ptY_top + 1); ctx.lineTo(arrowX + 2.5, ptY_top + 5);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(arrowX - 2.5, ptY_bot - 5); ctx.lineTo(arrowX, ptY_bot - 1); ctx.lineTo(arrowX + 2.5, ptY_bot - 5);
      ctx.stroke();
      // Label
      ctx.save();
      ctx.translate(arrowX - 4, midY);
      ctx.rotate(-Math.PI / 2);
      drawText(ctx, "Power", 0, 0, {
        font: '6px "Inter", sans-serif', align: "center", color: ptColor,
      });
      ctx.restore();

      // --- Duration threshold: two green dashed vertical lines ---
      const dtColor = c.detected;
      // Duration window spans the oscillation cycles (centered)
      const cycleDur = cs.oscCycles / freq; // seconds
      const totalDur = 6 / freq; // total visible window in seconds
      const dtStartFrac = 0.5 - (cycleDur / totalDur) / 2;
      const dtEndFrac = 0.5 + (cycleDur / totalDur) / 2;
      const dtX1 = px + 14 + dtStartFrac * (plotW - 18);
      const dtX2 = px + 14 + dtEndFrac * (plotW - 18);

      ctx.strokeStyle = dtColor;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 3]);
      ctx.beginPath();
      ctx.moveTo(dtX1, plotTop);
      ctx.lineTo(dtX1, plotTop + plotH);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(dtX2, plotTop);
      ctx.lineTo(dtX2, plotTop + plotH);
      ctx.stroke();
      ctx.setLineDash([]);

      // Green double-arrow for duration threshold (below signal)
      const darrowY = plotTop + plotH - 4;
      ctx.strokeStyle = dtColor; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(dtX1 + 2, darrowY);
      ctx.lineTo(dtX2 - 2, darrowY);
      ctx.stroke();
      // Arrow heads
      ctx.beginPath();
      ctx.moveTo(dtX1 + 5, darrowY - 2); ctx.lineTo(dtX1 + 1, darrowY); ctx.lineTo(dtX1 + 5, darrowY + 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(dtX2 - 5, darrowY - 2); ctx.lineTo(dtX2 - 1, darrowY); ctx.lineTo(dtX2 - 5, darrowY + 2);
      ctx.stroke();

      // Duration label below arrow
      drawText(ctx, "Duration", (dtX1 + dtX2) / 2, darrowY + 8, {
        font: '6px "Inter", sans-serif', align: "center", color: dtColor,
      });

      // --- Signal: sinusoid extending across the full panel ---
      const sigColor = cs.pass ? c.spectrum : c.spectrum;
      const totalSamples = Math.round(totalDur * 256);
      const burstStart = Math.round(dtStartFrac * totalSamples);
      const burstEnd = Math.round(dtEndFrac * totalSamples);

      ctx.strokeStyle = sigColor;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      let started = false;
      for (let s = 0; s < totalSamples; s++) {
        const t = s / 256;
        const inBurst = s >= burstStart && s < burstEnd;
        // Signal: full-amplitude sine inside burst, small noise outside
        let val;
        if (inBurst) {
          val = amp * Math.sin(2 * Math.PI * freq * t);
        } else {
          // Small wandering signal outside the burst
          val = plotH * 0.06 * Math.sin(2 * Math.PI * 1.5 * t + ci * 2)
              + plotH * 0.04 * Math.sin(2 * Math.PI * 4.2 * t + ci);
        }
        const sx = px + 14 + (s / totalSamples) * (plotW - 18);
        const sy = midY - val;
        if (!started) { ctx.moveTo(sx, sy); started = true; } else ctx.lineTo(sx, sy);
      }
      ctx.stroke();

      // --- Result labels at bottom: Duration check, Power check, then Detected/Not ---
      const lblX = px + 14;
      const lblBaseY = plotTop + plotH + 2;
      const lineH = 9;

      // Duration line
      const durIcon = cs.durPass ? "\u2713" : "\u2717";
      const durColor = cs.durPass ? c.detected : c.background1f;
      const durLabel = cs.durPass ? "Duration \u2713" : "Duration \u2717 too short";
      drawText(ctx, durLabel, lblX, lblBaseY, {
        font: '7px "Inter", sans-serif', color: durColor,
      });

      // Power line
      const pwrIcon = cs.pwrPass ? "\u2713" : "\u2717";
      const pwrColor = cs.pwrPass ? c.detected : c.background1f;
      const pwrLabel = cs.pwrPass ? "Power \u2713" : "Power \u2717 too weak";
      drawText(ctx, pwrLabel, lblX, lblBaseY + lineH, {
        font: '7px "Inter", sans-serif', color: pwrColor,
      });

      // Overall result
      const resultColor = cs.pass ? c.detected : c.background1f;
      const resultLabel = cs.pass ? "\u2713 Detected!" : "\u2717 Not Detected!";
      drawText(ctx, resultLabel, px + plotW / 2, lblBaseY + lineH * 2 + 2, {
        font: 'bold 8px "Inter", sans-serif', align: "center", color: resultColor,
      });
    }
  }

  // Combined thresholds panel: compact chi-square + duration examples
  function drawThresholdsPanel(ctx, W, H, analysis) {
    const c = getCanvasColors();
    const topH = H * 0.42;
    const botH = H * 0.52;
    const sepY = topH + H * 0.03;

    drawChi2Compact(ctx, 0, 0, W, topH);

    // Separator
    ctx.strokeStyle = c.gridLine; ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(10, sepY);
    ctx.lineTo(W - 10, sepY);
    ctx.stroke();

    drawDurationExamples(ctx, 0, sepY + 4, W, botH, state.params);
  }

  // =====================================================================
  // UI STATE & MANAGEMENT
  // =====================================================================

  let state = {
    step: 0, // 0 = start screen, 1-5 = steps
    seed: 42,
    params: {
      oscFreq: 7,
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
    '<strong>Step 1: The Signal.</strong> This is a simulated brain signal with 1/f\u1D43 colored-noise background (like real EEG). The first shaded region (~1\u20133.5&nbsp;s) contains a <em>sustained</em> oscillation at your chosen frequency \u2014 a real rhythm. The second shaded region (~6&nbsp;s) contains a single <em>sharp transient</em>: a brief, high-amplitude event (think of a movement artefact or an evoked spike). It inflates the power spectrum, but it isn\'t rhythmic \u2014 BOSC should reject it. In real data we wouldn\'t know which is which; that\'s what BOSC decides.',
    // Step 2: Power Spectrum
    '<strong>Step 2: The Power Spectrum.</strong> The power spectrum shows how much energy is at each frequency. Notice power naturally decreases with frequency (the 1/f shape). A naive approach would find "oscillations" everywhere at low frequencies simply because power is always higher there \u2014 a frequency bias.',
    // Step 3: Background Fit
    '<strong>Step 3: Fitting the Background.</strong> BOSC fits the 1/f background with a linear regression in log-log coordinates (red dashed line). The <span style="color:#ff6b6b">red trace</span> on the signal shows the background-only component (colored noise). The right panel decomposes the signal into background + oscillation. Anything rising above the fitted line is a candidate oscillation.',
    // Step 4: Thresholds
    '<strong>Step 4: Two Thresholds.</strong> BOSC applies a <em>power threshold</em> (P<sub>T</sub>) \u2014 the 95th percentile of the \u03C7\u00B2(2) distribution scaled to the background. It also requires a <em>duration threshold</em> (D<sub>T</sub>) of at least 3 complete cycles, rejecting brief transients. Signals must exceed <em>both</em> to be classified as oscillatory.',
    // Step 5: Detection / P_episode
    '<strong>Step 5: Detection / P<sub>episode</sub>.</strong> P<sub>episode</sub>(f) is the proportion of time BOSC detected oscillations at frequency f. The chart compares a "remembered" condition (with strong frontal midline theta, FMT) to a "forgotten" condition (less FMT). More detected oscillations in theta (4\u201310 Hz) for remembered trials reflects the role of theta in memory encoding. Adjust the sliders to explore!',
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

    // Decompose signal into background + oscillation components
    state.components = extractComponents(state.signal, state.params);

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
