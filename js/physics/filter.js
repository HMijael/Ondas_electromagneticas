/**
 * xray-physics-lab-3d
 * Beam Filtration, Beer-Lambert Attenuation & Half-Value Layer (HVL)
 */

import { generateRawSpectrum } from './anode.js';

export const FILTER_MATERIALS = {
  glass: {
    name: 'Vidrio Borosilicato + Aceite (Filtración Inherente)',
    densityG_CM3: 2.23,
    atomicNumberZ: 11.5, // Effective Z
    defaultThicknessMM: 1.0
  },
  aluminum: {
    name: 'Aluminio (Al)',
    symbol: 'Al',
    atomicNumberZ: 13,
    densityG_CM3: 2.70,
    kEdgeKEV: 1.56, // Far below diagnostic range
    minMM: 0.0,
    maxMM: 5.0,
    stepMM: 0.5,
    defaultMM: 2.5
  },
  copper: {
    name: 'Cobre (Cu)',
    symbol: 'Cu',
    atomicNumberZ: 29,
    densityG_CM3: 8.96,
    kEdgeKEV: 8.98, // Visible in low-kV range
    minMM: 0.0,
    maxMM: 0.5,
    stepMM: 0.05,
    defaultMM: 0.1
  }
};

/**
 * Calculates linear attenuation coefficient mu(E) in cm^-1 for Aluminum.
 * Parametric fit to NIST XCOM standard photon cross sections (10 - 150 keV).
 * @param {number} energyKEV - Photon energy in keV
 * @returns {number} mu in cm^-1
 */
export function getAluminumMu(energyKEV) {
  const e = Math.max(3.0, energyKEV);
  // Photoelectric contribution: mu_pe ~ C_pe / E^3.05
  // Compton scattering contribution: mu_c ~ C_c / (1 + 0.0028 * E)
  const density = 2.70; // g/cm^3
  const massPhotoelectric = 5200.0 * Math.pow(e, -3.12);
  const massCompton = 0.19 / (1.0 + 0.0018 * e);
  const massMu = massPhotoelectric + massCompton; // cm^2/g
  return massMu * density; // cm^-1
}

/**
 * Calculates linear attenuation coefficient mu(E) in cm^-1 for Copper.
 * Incorporates K-edge step discontinuity at 8.98 keV.
 * @param {number} energyKEV - Photon energy in keV
 * @returns {number} mu in cm^-1
 */
export function getCopperMu(energyKEV) {
  const e = Math.max(3.0, energyKEV);
  const density = 8.96; // g/cm^3

  let massPhotoelectric;
  if (e < 8.98) {
    // Below K-edge (L-shell absorption)
    massPhotoelectric = 8500.0 * Math.pow(e, -2.85);
  } else {
    // Above K-edge: significant jump factor (~7.5x)
    massPhotoelectric = 58000.0 * Math.pow(e, -2.85);
  }
  const massCompton = 0.18 / (1.0 + 0.0016 * e);
  const massMu = massPhotoelectric + massCompton; // cm^2/g
  return massMu * density; // cm^-1
}

/**
 * Calculates linear attenuation coefficient mu(E) in cm^-1 for Borosilicate Glass (Inherent tube envelope).
 * @param {number} energyKEV - Photon energy in keV
 * @returns {number} mu in cm^-1
 */
export function getGlassMu(energyKEV) {
  const e = Math.max(3.0, energyKEV);
  const density = 2.23; // g/cm^3
  const massPhotoelectric = 3400.0 * Math.pow(e, -3.15);
  const massCompton = 0.19 / (1.0 + 0.002 * e);
  return (massPhotoelectric + massCompton) * density;
}

/**
 * Calculates transmission factor T(E) = I(E) / I_0(E) = exp(-sum(mu_i * x_i))
 * according to the Beer-Lambert Exponential Law.
 * @param {number} energyKEV - Energy in keV
 * @param {number} alThicknessMM - Added Aluminum thickness in mm
 * @param {number} cuThicknessMM - Added Copper thickness in mm
 * @param {number} glassThicknessMM - Inherent glass envelope thickness in mm (default 1.0 mm)
 * @returns {number} Transmission fraction (0.0 to 1.0)
 */
export function calculateBeerLambertTransmission(energyKEV, alThicknessMM, cuThicknessMM, glassThicknessMM = 1.0) {
  // Convert mm to cm (1 mm = 0.1 cm)
  const xGlassCm = glassThicknessMM * 0.1;
  const xAlCm = alThicknessMM * 0.1;
  const xCuCm = cuThicknessMM * 0.1;

  const muGlass = getGlassMu(energyKEV);
  const muAl = getAluminumMu(energyKEV);
  const muCu = getCopperMu(energyKEV);

  const totalOpticalDepth = (muGlass * xGlassCm) + (muAl * xAlCm) + (muCu * xCuCm);
  if (totalOpticalDepth > 40.0) return 0.0;
  return Math.exp(-totalOpticalDepth);
}

/**
 * Applies filtration to raw spectrum and computes beam hardening metrics,
 * including mean energy, transmission ratio, and Half-Value Layer (HVL).
 * @param {Array} rawSpectrum - Output of generateRawSpectrum()
 * @param {Object} filterParams - { alMM, cuMM, glassMM }
 * @returns {Object} Filtered spectrum and dosimetry metrics
 */
export function filterSpectrum(rawSpectrum, { alMM = 2.5, cuMM = 0.0, glassMM = 1.0 }) {
  let totalRawIntensity = 0.0;
  let totalFilteredIntensity = 0.0;
  let rawWeightedEnergy = 0.0;
  let filteredWeightedEnergy = 0.0;

  const filteredSpectrum = rawSpectrum.map(bin => {
    const transmission = calculateBeerLambertTransmission(bin.energyKEV, alMM, cuMM, glassMM);
    const filteredIntensity = bin.intensity * transmission;

    totalRawIntensity += bin.intensity;
    totalFilteredIntensity += filteredIntensity;
    rawWeightedEnergy += bin.energyKEV * bin.intensity;
    filteredWeightedEnergy += bin.energyKEV * filteredIntensity;

    return {
      energyKEV: bin.energyKEV,
      wavelengthPM: bin.wavelengthPM,
      frequencyEHz: bin.frequencyEHz,
      rawIntensity: bin.intensity,
      filteredIntensity,
      transmission
    };
  });

  const rawMeanEnergyKEV = totalRawIntensity > 0 ? (rawWeightedEnergy / totalRawIntensity) : 0;
  const filteredMeanEnergyKEV = totalFilteredIntensity > 0 ? (filteredWeightedEnergy / totalFilteredIntensity) : 0;
  const beamHardeningDeltaKEV = filteredMeanEnergyKEV - rawMeanEnergyKEV;
  const overallTransmissionFraction = totalRawIntensity > 0 ? (totalFilteredIntensity / totalRawIntensity) : 0;
  const skinDoseReductionPercent = (1.0 - overallTransmissionFraction) * 100.0;

  // Calculate Half-Value Layer (HVL in mm Al) for the current filtered beam
  const hvlMMAl = calculateHVL(filteredSpectrum);

  return {
    bins: filteredSpectrum,
    totalRawIntensity,
    totalFilteredIntensity,
    overallTransmissionFraction,
    skinDoseReductionPercent,
    rawMeanEnergyKEV,
    filteredMeanEnergyKEV,
    beamHardeningDeltaKEV,
    hvlMMAl,
    alMM,
    cuMM,
    glassMM
  };
}

/**
 * Numerically computes the First Half-Value Layer (HVL_1 in mm Al)
 * for an arbitrary filtered spectrum.
 * @param {Array} spectrum - Array of spectral bins with { energyKEV, filteredIntensity }
 * @returns {number} HVL in mm of Aluminum
 */
export function calculateHVL(spectrum) {
  let initialTotal = 0;
  for (const bin of spectrum) {
    initialTotal += bin.filteredIntensity;
  }
  if (initialTotal <= 1e-9) return 0;

  const targetHalf = 0.5 * initialTotal;

  // Bisection search for additional mm Al required to reach 50%
  let lowAl = 0.01;
  let highAl = 15.0;

  for (let iter = 0; iter < 20; iter++) {
    const midAl = 0.5 * (lowAl + highAl);
    let testTotal = 0;
    const xCm = midAl * 0.1;

    for (const bin of spectrum) {
      const muAl = getAluminumMu(bin.energyKEV);
      testTotal += bin.filteredIntensity * Math.exp(-muAl * xCm);
    }

    if (testTotal > targetHalf) {
      lowAl = midAl;
    } else {
      highAl = midAl;
    }
  }

  return 0.5 * (lowAl + highAl);
}
