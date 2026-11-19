/**
 * xray-physics-lab-3d
 * 2D Digital Tektronix-Style Oscilloscope & Energy/Wavelength Spectrum Analyzer
 */

import { TARGET_MATERIALS } from '../physics/constants.js';

export class SpectrumOscilloscope {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');

    // Display configuration
    this.xAxisMode = 'energy'; // 'energy' (keV) or 'wavelength' (pm / EHz)
    this.hoverData = null;
    this.currentSpectrum = null;
    this.currentKVp = 80;
    this.currentTargetMat = TARGET_MATERIALS.W;

    this.initEvents();
    this.resize();
  }

  initEvents() {
    this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    this.canvas.addEventListener('mouseleave', () => {
      this.hoverData = null;
      this.draw();
    });
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.width = rect.width || 600;
    this.height = rect.height || 260;

    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.ctx.scale(dpr, dpr);

    this.draw();
  }

  setXAxisMode(mode) {
    if (mode === 'energy' || mode === 'wavelength') {
      this.xAxisMode = mode;
      this.draw();
    }
  }

  updateData(spectrumData, kVp, targetMat) {
    this.currentSpectrum = spectrumData;
    this.currentKVp = kVp;
    this.currentTargetMat = targetMat;
    this.draw();
  }

  handleMouseMove(e) {
    if (!this.currentSpectrum || !this.currentSpectrum.bins || this.currentSpectrum.bins.length === 0) return;

    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const padLeft = 55;
    const padRight = 30;
    const padTop = 30;
    const padBottom = 40;
    const plotWidth = this.width - padLeft - padRight;
    const plotHeight = this.height - padTop - padBottom;

    if (mouseX >= padLeft && mouseX <= this.width - padRight && mouseY >= padTop && mouseY <= this.height - padBottom) {
      const u = (mouseX - padLeft) / plotWidth;
      const bins = this.currentSpectrum.bins;

      let binIndex;
      if (this.xAxisMode === 'energy') {
        const energy = 1.0 + u * (this.currentKVp - 1.0);
        binIndex = Math.min(bins.length - 1, Math.max(0, Math.floor((energy / this.currentKVp) * bins.length)));
      } else {
        // Wavelength: reversed scale or mapping
        binIndex = Math.min(bins.length - 1, Math.max(0, Math.floor(u * bins.length)));
      }

      const bin = bins[binIndex];
      this.hoverData = {
        canvasX: mouseX,
        canvasY: mouseY,
        bin
      };
    } else {
      this.hoverData = null;
    }

    this.draw();
  }

  draw() {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    ctx.clearRect(0, 0, w, h);

    // Dark CRT background with subtle gradient
    const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
    bgGrad.addColorStop(0, '#070b10');
    bgGrad.addColorStop(1, '#0c1218');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    const padLeft = 55;
    const padRight = 30;
    const padTop = 32;
    const padBottom = 40;
    const plotWidth = w - padLeft - padRight;
    const plotHeight = h - padTop - padBottom;

    // Draw Tektronix Grid Reticle
    this.drawReticle(ctx, padLeft, padTop, plotWidth, plotHeight);

    if (!this.currentSpectrum || !this.currentSpectrum.bins || this.currentSpectrum.bins.length === 0) {
      // Draw Standby message
      ctx.fillStyle = '#64748b';
      ctx.font = '12px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('EMISIÓN EN ESPERA (STANDBY) - PULSAR EXPOSICIÓN', w / 2, h / 2);
      return;
    }

    const bins = this.currentSpectrum.bins;

    // Find max intensity for auto-scaling
    let maxIntensity = 1.0;
    for (const b of bins) {
      if (b.rawIntensity > maxIntensity) maxIntensity = b.rawIntensity;
    }
    maxIntensity *= 1.15; // 15% headroom

    // Draw Raw Spectrum (Cyan dashed trace)
    this.drawTrace(ctx, bins, padLeft, padTop, plotWidth, plotHeight, maxIntensity, 'raw');

    // Draw Filtered Spectrum (Solid neon green filled area)
    this.drawTrace(ctx, bins, padLeft, padTop, plotWidth, plotHeight, maxIntensity, 'filtered');

    // Annotations: Characteristic peaks, Duane-Hunt cutoff, mean energy
    this.drawAnnotations(ctx, bins, padLeft, padTop, plotWidth, plotHeight, maxIntensity);

    // Draw Axes labels and units
    this.drawAxes(ctx, padLeft, padTop, plotWidth, plotHeight, maxIntensity);

    // Draw Interactive Cursor Crosshair & Tooltip
    if (this.hoverData) {
      this.drawCrosshair(ctx, this.hoverData, padLeft, padTop, plotWidth, plotHeight, maxIntensity);
    }
  }

  drawReticle(ctx, left, top, width, height) {
    ctx.save();
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);

    const numDivsX = 10;
    const numDivsY = 6;

    for (let i = 0; i <= numDivsX; i++) {
      const x = left + (i / numDivsX) * width;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, top + height);
      ctx.stroke();
    }

    for (let j = 0; j <= numDivsY; j++) {
      const y = top + (j / numDivsY) * height;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(left + width, y);
      ctx.stroke();
    }

    // Border frame
    ctx.setLineDash([]);
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(left, top, width, height);

    ctx.restore();
  }

  drawTrace(ctx, bins, left, top, width, height, maxIntensity, type) {
    ctx.save();
    ctx.beginPath();

    const isRaw = type === 'raw';

    for (let i = 0; i < bins.length; i++) {
      const bin = bins[i];
      const intensity = isRaw ? bin.rawIntensity : bin.filteredIntensity;

      let u;
      if (this.xAxisMode === 'energy') {
        u = bin.energyKEV / this.currentKVp;
      } else {
        // Wavelength scale
        const minLam = 1239.84 / this.currentKVp;
        const maxLam = 120.0;
        u = (bin.wavelengthPM - minLam) / (maxLam - minLam);
      }
      u = Math.max(0, Math.min(1, u));

      const x = left + u * width;
      const y = top + height - (intensity / maxIntensity) * height;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    if (isRaw) {
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.65)'; // Sky blue cyan
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
    } else {
      // Filtered trace with soft glowing gradient fill underneath
      ctx.lineTo(left + width, top + height);
      ctx.lineTo(left, top + height);
      ctx.closePath();

      const grad = ctx.createLinearGradient(0, top, 0, top + height);
      grad.addColorStop(0, 'rgba(16, 185, 129, 0.45)');
      grad.addColorStop(0.7, 'rgba(16, 185, 129, 0.12)');
      grad.addColorStop(1, 'rgba(16, 185, 129, 0.0)');
      ctx.fillStyle = grad;
      ctx.fill();

      // Stroke line
      ctx.strokeStyle = '#10b981'; // Phosphor green
      ctx.lineWidth = 2.2;
      ctx.shadowColor = '#10b981';
      ctx.shadowBlur = 6;
      ctx.stroke();
    }

    ctx.restore();
  }

  drawAnnotations(ctx, bins, left, top, width, height, maxIntensity) {
    ctx.save();

    // 1. Duane-Hunt Cutoff (E_max = kVp)
    if (this.xAxisMode === 'energy') {
      const xMax = left + width;
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(xMax, top);
      ctx.lineTo(xMax, top + height);
      ctx.stroke();

      ctx.fillStyle = '#ef4444';
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`Límite Duane-Hunt (kVp=${this.currentKVp})`, xMax - 6, top + 14);
    }

    // 2. Mean Transmitted Energy Marker E_bar
    if (this.currentSpectrum.filteredMeanEnergyKEV && this.xAxisMode === 'energy') {
      const uMean = this.currentSpectrum.filteredMeanEnergyKEV / this.currentKVp;
      const xMean = left + uMean * width;

      ctx.strokeStyle = '#f59e0b'; // Amber
      ctx.lineWidth = 1.5;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(xMean, top);
      ctx.lineTo(xMean, top + height);
      ctx.stroke();

      ctx.fillStyle = '#f59e0b';
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`Ē=${this.currentSpectrum.filteredMeanEnergyKEV.toFixed(1)} keV`, xMean + 4, top + 26);
    }

    // 3. Characteristic Peaks Annotation
    if (this.xAxisMode === 'energy' && this.currentTargetMat.characteristicPeaks) {
      for (const peak of this.currentTargetMat.characteristicPeaks) {
        if (peak.energyKEV <= this.currentKVp) {
          const uPeak = peak.energyKEV / this.currentKVp;
          const xPeak = left + uPeak * width;

          ctx.fillStyle = '#38bdf8';
          ctx.font = '9px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.fillText(peak.name, xPeak, top + 12);
        }
      }
    }

    ctx.restore();
  }

  drawAxes(ctx, left, top, width, height, maxIntensity) {
    ctx.save();
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px "JetBrains Mono", monospace';

    // X-axis divisions
    const numX = 5;
    for (let i = 0; i <= numX; i++) {
      const u = i / numX;
      const x = left + u * width;
      let label;

      if (this.xAxisMode === 'energy') {
        const val = Math.round(u * this.currentKVp);
        label = `${val}`;
      } else {
        const minLam = 1239.84 / this.currentKVp;
        const val = (minLam + u * (120 - minLam)).toFixed(0);
        label = `${val}`;
      }

      ctx.textAlign = 'center';
      ctx.fillText(label, x, top + height + 16);
    }

    // X-axis title
    ctx.textAlign = 'center';
    ctx.fillStyle = '#cbd5e1';
    if (this.xAxisMode === 'energy') {
      ctx.fillText('Energía del Fotón E (keV)', left + width / 2, top + height + 32);
    } else {
      ctx.fillText('Longitud de Onda λ (pm)  |  Frecuencia ν (EHz = 10¹⁸ Hz)', left + width / 2, top + height + 32);
    }

    // Y-axis label
    ctx.save();
    ctx.translate(14, top + height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('Intensidad Relativa I (Fotones/keV)', 0, 0);
    ctx.restore();

    // Legend in upper right
    ctx.textAlign = 'right';
    ctx.font = '10px "JetBrains Mono", monospace';

    // Raw legend
    ctx.fillStyle = 'rgba(56, 189, 248, 0.9)';
    ctx.fillText('--- Espectro Crudo (Bremsstrahlung + Característica)', left + width - 8, top - 14);

    // Filtered legend
    ctx.fillStyle = '#10b981';
    ctx.fillText('— Haz Transmitido Filtrado (Al + Cu)', left + width - 8, top - 2);

    ctx.restore();
  }

  drawCrosshair(ctx, hover, left, top, width, height, maxIntensity) {
    ctx.save();
    const bin = hover.bin;

    // Crosshair line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);

    ctx.beginPath();
    ctx.moveTo(hover.canvasX, top);
    ctx.lineTo(hover.canvasX, top + height);
    ctx.stroke();

    // Tooltip box
    const tipW = 190;
    const tipH = 74;
    let tipX = hover.canvasX + 12;
    if (tipX + tipW > left + width) tipX = hover.canvasX - tipW - 12;
    let tipY = hover.canvasY - 30;
    if (tipY < top) tipY = top + 8;

    ctx.fillStyle = 'rgba(10, 14, 18, 0.94)';
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([]);
    ctx.fillRect(tipX, tipY, tipW, tipH);
    ctx.strokeRect(tipX, tipY, tipW, tipH);

    ctx.fillStyle = '#f8fafc';
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';

    ctx.fillText(`Energía: ${bin.energyKEV.toFixed(2)} keV`, tipX + 8, tipY + 16);
    ctx.fillText(`Long. Onda λ: ${bin.wavelengthPM.toFixed(2)} pm`, tipX + 8, tipY + 32);
    ctx.fillText(`Frecuencia ν: ${bin.frequencyEHz.toFixed(3)} EHz`, tipX + 8, tipY + 48);
    const transPct = (bin.transmission * 100).toFixed(1);
    ctx.fillStyle = bin.transmission > 0.5 ? '#10b981' : '#f59e0b';
    ctx.fillText(`Transmisión Filtro: ${transPct}%`, tipX + 8, tipY + 64);

    ctx.restore();
  }
}
