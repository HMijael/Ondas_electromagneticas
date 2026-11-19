/**
 * xray-physics-lab-3d
 * Anode Physics: Bremsstrahlung, Characteristic Radiation, Heel Effect & Thermodynamics
 */

import { CONSTANTS, TARGET_MATERIALS } from './constants.js';

export class AnodeThermodynamics {
  constructor() {
    this.accumulatedHU = 0.0;
    this.maxHUCapacity = 350000.0; // Typical rotating anode rating (350 kHU)
    this.baseTempK = 300.0;
    this.currentFocalTrackTempK = 300.0;
    this.coolingRatePerSec = 0.035; // Natural radiation/conduction cooling constant
  }

  /**
   * Updates heat units and focal track temperature over delta time.
   * @param {boolean} isExposing - Whether high voltage is active
   * @param {number} kVp - Peak kilovoltage
   * @param {number} actualMA - Actual tube current in mA
   * @param {number} deltaSeconds - Time step
   * @returns {Object} Current thermal state
   */
  update(isExposing, kVp, actualMA, deltaSeconds) {
    if (isExposing && kVp > 0 && actualMA > 0) {
      // Heat generation rate in HU/s = kVp * mA (for constant potential / high frequency)
      const huRate = kVp * actualMA;
      this.accumulatedHU += huRate * deltaSeconds;
    }

    // Cooling according to exponential dissipation: d(HU)/dt = -k * HU
    const coolingLoss = this.accumulatedHU * (1.0 - Math.exp(-this.coolingRatePerSec * deltaSeconds));
    this.accumulatedHU = Math.max(0.0, this.accumulatedHU - coolingLoss);

    // Temperature mapping: ambient (300K) up to near melting point (~3100K at 100% capacity)
    const capacityRatio = Math.min(1.0, this.accumulatedHU / this.maxHUCapacity);
    this.currentFocalTrackTempK = this.baseTempK + capacityRatio * 2600.0;

    // Thermal warning flags
    const isThermalWarning = capacityRatio >= 0.75;
    const isThermalCritical = capacityRatio >= 0.92;

    return {
      accumulatedHU: this.accumulatedHU,
      maxHUCapacity: this.maxHUCapacity,
      capacityRatio,
      capacityPercent: capacityRatio * 100.0,
      currentFocalTrackTempK: this.currentFocalTrackTempK,
      isThermalWarning,
      isThermalCritical,
      heatLoadWatts: isExposing ? kVp * actualMA : 0
    };
  }

  reset() {
    this.accumulatedHU = 0.0;
    this.currentFocalTrackTempK = this.baseTempK;
  }
}

/**
 * Calculates theoretical Larmor power radiated during electron-nucleus Coulomb deceleration.
 * Non-relativistic: P = e^2 * a^2 / (6 * pi * epsilon_0 * c^3)
 * Relativistic Lienard generalization: P = (e^2 * gamma^6 / (6 * pi * epsilon_0 * c^3)) * a_perp^2
 * @param {number} Z - Atomic number of target
 * @param {number} kineticEnergyKEV - Electron energy in keV
 * @returns {Object} Radiative deceleration metrics
 */
export function calculateLarmorDeceleration(Z, kineticEnergyKEV) {
  const gamma = 1.0 + (kineticEnergyKEV / CONSTANTS.M_E_KEV);
  // Characteristic close-encounter distance: r ~ 2 * 10^-14 m
  const rImpactM = 2.0e-14;
  // Acceleration in nuclear Coulomb field: a = (Z * e^2) / (4 * pi * eps_0 * m_e * r^2)
  const coulombConst = 1.0 / (4.0 * Math.PI * CONSTANTS.EPSILON_0);
  const aCoulomb = (Z * Math.pow(CONSTANTS.E_CHARGE, 2) * coulombConst) / (CONSTANTS.M_E_KG * Math.pow(rImpactM, 2));

  // Non-relativistic Larmor power
  const larmorNumerator = Math.pow(CONSTANTS.E_CHARGE, 2) * Math.pow(aCoulomb, 2);
  const larmorDenominator = 6.0 * Math.PI * CONSTANTS.EPSILON_0 * Math.pow(CONSTANTS.C, 3);
  const larmorPowerWatts = larmorNumerator / larmorDenominator;

  // Relativistic Lienard power
  const lienardPowerWatts = larmorPowerWatts * Math.pow(gamma, 6);

  return {
    coulombAccelerationM_S2: aCoulomb,
    larmorPowerWatts,
    lienardPowerWatts,
    impactRadiusM: rImpactM
  };
}

/**
 * Calculates overall X-Ray production efficiency and thermal partition.
 * Efficiency eta ~ 9e-10 * Z * V_0 [V]
 * @param {number} Z - Target atomic number (e.g. 74 for W)
 * @param {number} kVp - Kilovoltage (20 - 150)
 * @param {number} mA - Tube current in mA
 * @returns {Object} Energy balance breakdown
 */
export function calculateEnergyEfficiency(Z, kVp, mA) {
  const voltageV = kVp * 1e3;
  // Empirical radiological efficiency constant ~ 9.0e-10 V^-1
  const efficiency = Math.min(0.05, 9.0e-10 * Z * voltageV);
  const efficiencyPercent = efficiency * 100.0;
  const heatFractionPercent = (1.0 - efficiency) * 100.0;

  const totalElectricalPowerWatts = (voltageV * (mA * 1e-3));
  const xrayRadiantPowerWatts = totalElectricalPowerWatts * efficiency;
  const thermalPowerWatts = totalElectricalPowerWatts - xrayRadiantPowerWatts;

  return {
    efficiency,
    efficiencyPercent,
    heatFractionPercent,
    totalElectricalPowerWatts,
    xrayRadiantPowerWatts,
    thermalPowerWatts
  };
}

/**
 * Evaluates the Anode Heel Effect across the X-ray fan beam.
 * Computes intensity profile variation between cathode side (positive angle) and anode side (negative angle).
 * @param {number} anodeAngleDeg - Bevel angle of the anode (7 - 17 degrees)
 * @param {number} targetZ - Target atomic number
 * @param {number} fieldAngleDeg - Angle from central ray (-15 deg towards cathode, +15 deg towards anode)
 * @returns {number} Normalized intensity factor I(theta) / I_central
 */
export function calculateAnodeHeelFactor(anodeAngleDeg, targetZ = 74, fieldAngleDeg = 0) {
  const thetaTargetRad = (anodeAngleDeg * Math.PI) / 180.0;
  const thetaBeamRad = (fieldAngleDeg * Math.PI) / 180.0;

  // Effective emergence angle: alpha = thetaTarget - fieldAngle
  const alphaRad = thetaTargetRad - thetaBeamRad;
  if (alphaRad <= 0.05) return 0.05; // Critical grazing angle cutoff

  // Tungsten self-absorption path length: path = d_mean / sin(alpha)
  const pathFactor = 1.0 / Math.sin(alphaRad);
  const centralPathFactor = 1.0 / Math.sin(thetaTargetRad);

  // Absorption coefficient scaling constant
  const kHeel = 0.065 * (targetZ / 74.0);
  const attenuationDelta = kHeel * (pathFactor - centralPathFactor);

  return Math.max(0.05, Math.min(1.8, Math.exp(-attenuationDelta)));
}

/**
 * Computes the raw emitted X-ray energy spectrum (Bremsstrahlung continuum + characteristic emission)
 * before external tube filtration.
 * @param {Object} params - { kVp, mA, targetMatKey, numBins, anodeAngleDeg }
 * @returns {Array<{ energyKEV: number, wavelengthPM: number, frequencyEHz: number, intensity: number }>}
 */
export function generateRawSpectrum({ kVp = 80, mA = 200, targetMatKey = 'W', numBins = 240, anodeAngleDeg = 12 }) {
  const mat = TARGET_MATERIALS[targetMatKey] || TARGET_MATERIALS.W;
  const maxE = Math.max(5, kVp);
  const minE = 1.0; // keV
  const stepE = (maxE - minE) / numBins;

  const points = [];
  const currentRatio = mA / 100.0; // Linear scaling with mA
  const kramersConstant = 1.0;

  // Characteristic emission excitation threshold: maxE must exceed K-edge energy
  const canExciteKShell = maxE > mat.kEdgeEnergyKEV;
  // Characteristic peak overall scaling: ~ (kVp - E_k)^1.63
  const charScaling = canExciteKShell ? Math.pow(maxE - mat.kEdgeEnergyKEV, 1.63) * 0.08 * currentRatio : 0;

  for (let i = 0; i <= numBins; i++) {
    const energyKEV = minE + i * stepE;
    if (energyKEV > maxE) break;

    // 1. Continuous Bremsstrahlung (Kramers' Law): I_c(E) = C * Z * (E_max - E)
    let bremsstrahlung = kramersConstant * mat.atomicNumber * (maxE - energyKEV) * currentRatio;

    // Target self-absorption factor for low energy photons within target depth
    // Attenuation scales roughly as ~ (1 / E^2.8)
    const selfAbsCoeff = 12.0 * Math.pow(mat.atomicNumber / 74.0, 2) / Math.pow(energyKEV, 2.6);
    const selfAbsPath = 1.0 / Math.sin((anodeAngleDeg * Math.PI) / 180.0);
    const selfTransmission = Math.exp(-Math.min(25.0, selfAbsCoeff * selfAbsPath * 0.08));
    bremsstrahlung *= selfTransmission;

    // 2. Discrete Characteristic Peaks
    let characteristic = 0;
    if (canExciteKShell && mat.characteristicPeaks) {
      for (const peak of mat.characteristicPeaks) {
        // Gaussian line profile: G(E) = I_0 * exp(-(E - E_peak)^2 / (2 * sigma^2))
        const sigma = peak.fwhmKEV / 2.35482; // FWHM = 2 * sqrt(2 * ln(2)) * sigma
        const diff = energyKEV - peak.energyKEV;
        const lineShape = Math.exp(-(diff * diff) / (2.0 * sigma * sigma));
        characteristic += charScaling * peak.relativeIntensity * lineShape;
      }
    }

    const totalIntensity = Math.max(0.0, bremsstrahlung + characteristic);

    // Associated EM wave parameters:
    // E = h * nu  =>  nu = E / h
    const energyJoules = energyKEV * 1e3 * CONSTANTS.E_CHARGE;
    const frequencyHz = energyJoules / CONSTANTS.H_JOULE;
    const frequencyEHz = frequencyHz / 1e18; // ExaHertz (10^18 Hz)
    const wavelengthPM = CONSTANTS.HC_PM_KEV / energyKEV; // Picometers (10^-12 m)

    points.push({
      energyKEV,
      wavelengthPM,
      frequencyEHz,
      frequencyHz,
      bremsstrahlung,
      characteristic,
      intensity: totalIntensity
    });
  }

  return points;
}

/**
 * Maps photon energy [keV] to realistic aesthetic color representation for 3D electromagnetic waves.
 * Violet/Cyan = High energy (penetrating, short wavelength)
 * Green/Yellow = Medium energy
 * Orange/Red = Low energy (soft, easily absorbed)
 * @param {number} energyKEV
 * @param {number} maxKEV
 * @returns {{ r: number, g: number, b: number, hex: string }}
 */
export function photonEnergyToColor(energyKEV, maxKEV = 100) {
  const norm = Math.max(0.0, Math.min(1.0, (energyKEV - 10) / (maxKEV - 10)));
  let r = 0, g = 0, b = 0;

  if (norm < 0.25) {
    // Low energy: Red to Orange
    const t = norm / 0.25;
    r = 1.0;
    g = 0.2 + 0.6 * t;
    b = 0.05;
  } else if (norm < 0.5) {
    // Medium-low: Orange to Green
    const t = (norm - 0.25) / 0.25;
    r = 1.0 - 0.8 * t;
    g = 0.8 + 0.2 * t;
    b = 0.1;
  } else if (norm < 0.75) {
    // Medium-high: Green to Cyan
    const t = (norm - 0.5) / 0.25;
    r = 0.2 - 0.2 * t;
    g = 1.0;
    b = 0.1 + 0.9 * t;
  } else {
    // High energy: Cyan to Violet/White
    const t = (norm - 0.75) / 0.25;
    r = 0.3 * t + 0.2;
    g = 1.0 - 0.4 * t;
    b = 1.0;
  }

  const red = Math.round(r * 255);
  const green = Math.round(g * 255);
  const blue = Math.round(b * 255);
  const hex = `#${((1 << 24) + (red << 16) + (green << 8) + blue).toString(16).slice(1)}`;

  return { r, g, b, hex };
}
