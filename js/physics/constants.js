/**
 * xray-physics-lab-3d
 * Universal Physical Constants and Anode Target Database
 */

export const CONSTANTS = {
  // Planck constant (J*s and eV*s)
  H_JOULE: 6.62607015e-34,
  H_EV: 4.135667696e-15,

  // Speed of light in vacuum (m/s)
  C: 2.99792458e8,

  // Elementary charge (Coulombs)
  E_CHARGE: 1.602176634e-19,

  // Electron rest mass (kg and keV/c^2)
  M_E_KG: 9.1093837e-31,
  M_E_KEV: 510.99895,

  // Boltzmann constant (J/K and eV/K)
  K_B_JOULE: 1.380649e-23,
  K_B_EV: 8.617333262e-5,

  // Vacuum permittivity (F/m)
  EPSILON_0: 8.8541878128e-12,

  // Richardson constant for pure metals A_0 = (4*pi*m*k^2*e)/h^3 (A / (m^2 * K^2))
  RICHARDSON_A0: 1.20173e6,

  // Product h*c in pm*keV (Duane-Hunt conversion constant: lambda_min [pm] = HC_PM_KEV / V [kV])
  HC_PM_KEV: 1239.841984,

  // Standard high-voltage generator factor for Heat Units (HU = kVp * mA * s)
  HU_PER_JOULE: 1.0,

  // Anode-Cathode spacing in tube (m)
  GAP_DISTANCE: 0.018 // 18 mm typical medical diagnostic tube gap
};

export const TARGET_MATERIALS = {
  W: {
    symbol: 'W',
    name: 'Tungsteno (Wolframio)',
    atomicNumber: 74,
    atomicMass: 183.84,
    workFunctionEV: 4.54, // phi [eV]
    richardsonA: 6.0e5, // A / (m^2 * K^2) for polycrystalline W
    kEdgeEnergyKEV: 69.5, // K-shell binding energy [keV]
    characteristicPeaks: [
      { id: 'K_alpha1', name: 'Kα1', energyKEV: 59.3, relativeIntensity: 1.00, fwhmKEV: 0.65 },
      { id: 'K_alpha2', name: 'Kα2', energyKEV: 57.9, relativeIntensity: 0.52, fwhmKEV: 0.65 },
      { id: 'K_beta1',  name: 'Kβ1', energyKEV: 67.2, relativeIntensity: 0.28, fwhmKEV: 0.70 }
    ],
    meltingPointK: 3695,
    densityG_CM3: 19.25,
    thermalConductivityW_MK: 173,
    colorHex: '#d1d5db',
    clinicalApplication: 'Radiología General, Tomografía Computarizada (TC), Fluoroscopia'
  },
  Mo: {
    symbol: 'Mo',
    name: 'Molibdeno',
    atomicNumber: 42,
    atomicMass: 95.95,
    workFunctionEV: 4.60,
    richardsonA: 5.5e5,
    kEdgeEnergyKEV: 20.0,
    characteristicPeaks: [
      { id: 'K_alpha', name: 'Kα', energyKEV: 17.5, relativeIntensity: 1.00, fwhmKEV: 0.45 },
      { id: 'K_beta',  name: 'Kβ', energyKEV: 19.6, relativeIntensity: 0.22, fwhmKEV: 0.50 }
    ],
    meltingPointK: 2896,
    densityG_CM3: 10.28,
    thermalConductivityW_MK: 138,
    colorHex: '#94a3b8',
    clinicalApplication: 'Mamografía digital de bajo kVp (tejido blando / alto contraste)'
  },
  Rh: {
    symbol: 'Rh',
    name: 'Rodio',
    atomicNumber: 45,
    atomicMass: 102.91,
    workFunctionEV: 4.98,
    richardsonA: 4.8e5,
    kEdgeEnergyKEV: 23.2,
    characteristicPeaks: [
      { id: 'K_alpha', name: 'Kα', energyKEV: 20.2, relativeIntensity: 1.00, fwhmKEV: 0.48 },
      { id: 'K_beta',  name: 'Kβ', energyKEV: 22.7, relativeIntensity: 0.20, fwhmKEV: 0.52 }
    ],
    meltingPointK: 2237,
    densityG_CM3: 12.41,
    thermalConductivityW_MK: 150,
    colorHex: '#e2e8f0',
    clinicalApplication: 'Mamografía de mamas densas (mayor penetración espectral)'
  }
};
