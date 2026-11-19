/**
 * xray-physics-lab-3d
 * Cathode Physics: Thermionic Emission & Space Charge Limitation
 */

import { CONSTANTS, TARGET_MATERIALS } from './constants.js';

export const FOCAL_SPOTS = {
  fine: {
    label: 'Foco Fino (0.6 mm)',
    widthMM: 0.6,
    lengthMM: 2.2,
    emitterAreaM2: 1.32e-6,
    maxRecommendedMA: 200,
    spatialResolutionLpMm: 12.5,
    description: 'Alta resolución espacial anatómica (extremidades, mamografía, óseo fino)'
  },
  broad: {
    label: 'Foco Grueso (1.2 mm)',
    widthMM: 1.2,
    lengthMM: 5.0,
    emitterAreaM2: 6.0e-6,
    maxRecommendedMA: 600,
    spatialResolutionLpMm: 5.5,
    description: 'Alto flujo de fotones para exposiciones ultracortas (tórax, abdomen, pacientes corpulentos)'
  }
};

/**
 * Calculates thermionic current density via Richardson-Dushman Law.
 * J = A * T^2 * exp(-phi / (k_B * T))
 * @param {number} tempK - Filament temperature in Kelvin (typically 2100 - 2750 K)
 * @param {number} workFunctionEV - Cathode work function in eV (Tungsten: 4.54 eV)
 * @param {number} richardsonA - Richardson constant (A / (m^2 * K^2))
 * @returns {number} Current density J in A/m^2
 */
export function calculateRichardsonDushman(tempK, workFunctionEV = 4.54, richardsonA = 6.0e5) {
  if (tempK <= 300) return 0;
  const phiJoules = workFunctionEV * CONSTANTS.E_CHARGE;
  const exponent = -phiJoules / (CONSTANTS.K_B_JOULE * tempK);
  // Clamp exponent to prevent underflow
  if (exponent < -80) return 0;
  return richardsonA * Math.pow(tempK, 2) * Math.exp(exponent);
}

/**
 * Estimates filament temperature T [K] required to supply target emission current.
 * Inverts Richardson-Dushman empirically for diagnostic tungsten filaments.
 * @param {number} targetCurrentMA - Desired tube current in mA (10 - 600 mA)
 * @param {string} focalSpotKey - 'fine' or 'broad'
 * @returns {number} Filament temperature in Kelvin
 */
export function estimateFilamentTemperature(targetCurrentMA, focalSpotKey = 'fine') {
  const spot = FOCAL_SPOTS[focalSpotKey] || FOCAL_SPOTS.fine;
  const targetCurrentA = (targetCurrentMA * 1e-3);
  const targetJ = targetCurrentA / spot.emitterAreaM2;

  // Binary search for temperature matching target current density
  let lowT = 1800;
  let highT = 3200;
  for (let i = 0; i < 24; i++) {
    const midT = 0.5 * (lowT + highT);
    const jMid = calculateRichardsonDushman(midT, 4.54, 6.0e5);
    if (jMid < targetJ) {
      lowT = midT;
    } else {
      highT = midT;
    }
  }
  return 0.5 * (lowT + highT);
}

/**
 * Calculates Child-Langmuir Space Charge limit:
 * J_sc = (4/9) * epsilon_0 * sqrt(2*e / m_e) * (V^(3/2) / d^2)
 * @param {number} kVp - Tube peak kilovoltage (20 - 150 kV)
 * @param {number} gapM - Anode-cathode spacing (m)
 * @returns {number} Maximum space-charge limited current density J_sc in A/m^2
 */
export function calculateChildLangmuir(kVp, gapM = CONSTANTS.GAP_DISTANCE) {
  const voltageV = Math.max(1, kVp * 1e3);
  const perveanceConst = (4 / 9) * CONSTANTS.EPSILON_0 * Math.sqrt((2 * CONSTANTS.E_CHARGE) / CONSTANTS.M_E_KG);
  const jSc = perveanceConst * Math.pow(voltageV, 1.5) / Math.pow(gapM, 2);
  return jSc;
}

/**
 * Evaluates the complete operational cathode state, identifying whether the tube is
 * space-charge limited or temperature-saturated, and computes actual delivered current.
 * @param {Object} params - { kVp, mA, focalSpotKey, targetMatKey }
 * @returns {Object} Comprehensive cathode metrics
 */
export function evaluateCathodeState({ kVp = 80, mA = 200, focalSpotKey = 'fine', targetMatKey = 'W' }) {
  const spot = FOCAL_SPOTS[focalSpotKey] || FOCAL_SPOTS.fine;
  const tempK = estimateFilamentTemperature(mA, focalSpotKey);
  const jThermionic = calculateRichardsonDushman(tempK, 4.54, 6.0e5);
  const jSpaceCharge = calculateChildLangmuir(kVp, CONSTANTS.GAP_DISTANCE);

  // Transition smoothing: smooth minimum between space charge and temperature saturation
  // J_eff = (J_th^(-p) + J_sc^(-p))^(-1/p) with p = 4
  const p = 4.0;
  const jEff = Math.pow(Math.pow(jThermionic, -p) + Math.pow(jSpaceCharge, -p), -1 / p);
  const actualCurrentA = jEff * spot.emitterAreaM2;
  const actualCurrentMA = actualCurrentA * 1e3;

  // Space charge ratio: > 0.85 means heavily space-charge limited
  const spaceChargeRatio = Math.min(1.0, jThermionic / (jSpaceCharge + 1e-9));
  const isSpaceChargeLimited = jSpaceCharge < jThermionic * 0.95;

  // Space charge cloud density (higher when space charge limitation prevents extraction)
  const spaceChargeCloudDensity = Math.min(1.0, Math.max(0.0, (jThermionic - jEff) / (jThermionic + 1e-6)));

  // Blackbody radiation color for tungsten filament
  const filamentColor = getBlackbodyRGB(tempK);

  // Filament heating power (approx P = I_fil * V_fil, typically 30 - 70 W)
  const filamentWatts = 25.0 + (tempK - 2000) * 0.06;

  return {
    requestedMA: mA,
    actualMA: actualCurrentMA,
    filamentTempK: tempK,
    jThermionic,
    jSpaceCharge,
    jEff,
    isSpaceChargeLimited,
    regimeLabel: isSpaceChargeLimited ? 'Régimen de Carga Espacial (Ley de Child-Langmuir)' : 'Saturación por Temperatura (Richardson-Dushman)',
    spaceChargeCloudDensity,
    filamentWatts,
    filamentColor,
    focalSpot: spot
  };
}

/**
 * Calculates Planck blackbody incandescent RGB for filament visualization.
 * Approximated through Tanner Helland Planckian locus fit.
 * @param {number} tempK - Temperature in Kelvin (1500 - 3200 K)
 * @returns {{ r: number, g: number, b: number, hex: string, css: string }}
 */
export function getBlackbodyRGB(tempK) {
  const t = Math.max(1000, Math.min(4000, tempK)) / 100;
  let r, g, b;

  // Red
  if (t <= 66) {
    r = 255;
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
    r = Math.max(0, Math.min(255, r));
  }

  // Green
  if (t <= 66) {
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
    g = Math.max(0, Math.min(255, g));
  } else {
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    g = Math.max(0, Math.min(255, g));
  }

  // Blue
  if (t >= 66) {
    b = 255;
  } else if (t <= 19) {
    b = 0;
  } else {
    b = 138.5177312231 * Math.log(t - 10) - 305.0447927307;
    b = Math.max(0, Math.min(255, b));
  }

  const red = Math.round(r);
  const green = Math.round(g);
  const blue = Math.round(b);
  const hex = `#${((1 << 24) + (red << 16) + (green << 8) + blue).toString(16).slice(1)}`;

  return {
    r: red / 255,
    g: green / 255,
    b: blue / 255,
    hex,
    css: `rgb(${red}, ${green}, ${blue})`
  };
}
