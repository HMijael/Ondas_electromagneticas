/**
 * xray-physics-lab-3d
 * Electrostatic Field, Relativistic Kinematics & Duane-Hunt Cutoff
 */

import { CONSTANTS } from './constants.js';

/**
 * Calculates complete relativistic and electrostatic dynamics of electrons
 * accelerating from cathode to anode.
 * @param {number} kVp - Peak tube kilovoltage (20 - 150 kVp)
 * @param {number} gapM - Gap distance between cathode filament and anode target (m)
 * @returns {Object} Complete kinematics and quantum boundary parameters
 */
export function calculateElectronKinematics(kVp, gapM = CONSTANTS.GAP_DISTANCE) {
  const voltageV = Math.max(1, kVp * 1e3);
  const kineticEnergyKEV = kVp;
  const kineticEnergyJoules = voltageV * CONSTANTS.E_CHARGE;

  // Average electrostatic field vector magnitude |E| = V / d
  const electricFieldV_M = voltageV / gapM;
  const electricFieldKV_CM = electricFieldV_M / 1e5;

  // Lorentz factor: gamma = 1 + T / (m_e * c^2)
  const gamma = 1.0 + (kineticEnergyKEV / CONSTANTS.M_E_KEV);

  // Relativistic velocity fraction beta = v / c
  const beta = Math.sqrt(Math.max(0, 1.0 - (1.0 / (gamma * gamma))));
  const velocityM_S = beta * CONSTANTS.C;
  const velocityKm_S = velocityM_S / 1000.0;
  const velocityPercentC = beta * 100.0;

  // Non-relativistic classical velocity for scientific comparison
  const classicalVelocityM_S = Math.sqrt((2.0 * kineticEnergyJoules) / CONSTANTS.M_E_KG);
  const classicalVelocityKm_S = classicalVelocityM_S / 1000.0;
  const relativisticErrorPercent = ((classicalVelocityM_S - velocityM_S) / velocityM_S) * 100.0;

  // Relativistic momentum p = gamma * m_e * v (kg * m / s)
  const momentumKgM_S = gamma * CONSTANTS.M_E_KG * velocityM_S;

  // De Broglie wavelength of accelerated electron: lambda_dB = h / p
  const deBroglieWavelengthM = CONSTANTS.H_JOULE / momentumKgM_S;
  const deBroglieWavelengthPM = deBroglieWavelengthM * 1e12; // picometers

  // Duane-Hunt Quantum Boundary Limit:
  // E_max = h * nu_max = h * c / lambda_min = e * V_0
  const maxPhotonEnergyKEV = kineticEnergyKEV;
  const maxPhotonEnergyJoules = kineticEnergyJoules;

  // Duane-Hunt cutoff frequency: nu_max = E / h (Hz and EHz = 10^18 Hz)
  const nuMaxHz = kineticEnergyJoules / CONSTANTS.H_JOULE;
  const nuMaxEHz = nuMaxHz / 1e18; // ExaHertz

  // Duane-Hunt minimum wavelength: lambda_min = hc / (e * V_0)
  const lambdaMinPM = CONSTANTS.HC_PM_KEV / kineticEnergyKEV; // picometers
  const lambdaMinAngstrom = lambdaMinPM / 100.0; // Angstroms

  // Average transit time from cathode to anode across the gap
  // For uniform field E, relativistic transit time: t = (c / a_0) * sqrt(gamma^2 - 1)
  // where a_0 = e * E / m_e
  const a0 = (CONSTANTS.E_CHARGE * electricFieldV_M) / CONSTANTS.M_E_KG;
  const transitTimeSeconds = (CONSTANTS.C / a0) * Math.sqrt(Math.max(0, gamma * gamma - 1.0));
  const transitTimeNanoseconds = transitTimeSeconds * 1e9;

  return {
    kVp,
    voltageV,
    gapM,
    electricFieldV_M,
    electricFieldKV_CM,
    kineticEnergyKEV,
    kineticEnergyJoules,
    gamma,
    beta,
    velocityM_S,
    velocityKm_S,
    velocityPercentC,
    classicalVelocityKm_S,
    relativisticErrorPercent,
    momentumKgM_S,
    deBroglieWavelengthPM,
    maxPhotonEnergyKEV,
    maxPhotonEnergyJoules,
    nuMaxHz,
    nuMaxEHz,
    lambdaMinPM,
    lambdaMinAngstrom,
    transitTimeNanoseconds
  };
}
