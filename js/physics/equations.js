/**
 * xray-physics-lab-3d
 * Live Electromagnetic Equations Formatter
 * Generates both KaTeX LaTeX representations and robust semantic HTML fallbacks
 * with real-time parameter substitution.
 */

/**
 * Generates formatted equation blocks with live numerical substitutions.
 * @param {Object} state - Current system physics state
 * @returns {Array<Object>} List of equation cards with titles, latex, and html representations
 */
export function generateLiveEquations(state) {
  const {
    cathode,
    kinematics,
    anode,
    filtration,
    targetMat,
    kVp,
    mA,
    anodeAngle
  } = state;

  const tempK = cathode.filamentTempK.toFixed(0);
  const phiEV = targetMat.workFunctionEV.toFixed(2);
  const jThMA = (cathode.jThermionic * 1e-4).toFixed(2); // mA/cm^2
  const jScMA = (cathode.jSpaceCharge * 1e-4).toFixed(2); // mA/cm^2
  const vVolts = (kVp * 1e3).toLocaleString();
  const gammaStr = kinematics.gamma.toFixed(4);
  const betaStr = kinematics.beta.toFixed(4);
  const vKmS = kinematics.velocityKm_S.toLocaleString(undefined, { maximumFractionDigits: 0 });
  const lambdaMinPM = kinematics.lambdaMinPM.toFixed(2);
  const nuMaxEHz = kinematics.nuMaxEHz.toFixed(3);
  const zNum = targetMat.atomicNumber;
  const etaPercent = anode.energyBalance.efficiencyPercent.toFixed(3);
  const heatWatts = anode.energyBalance.thermalPowerWatts.toFixed(0);
  const alMM = filtration.alMM.toFixed(1);
  const cuMM = filtration.cuMM.toFixed(2);
  const meanEKEV = filtration.filteredMeanEnergyKEV.toFixed(2);
  const deltaEKEV = filtration.beamHardeningDeltaKEV.toFixed(2);
  const hvlMM = filtration.hvlMMAl.toFixed(2);

  const equations = [
    {
      id: 'child_langmuir',
      title: '2. Límite de Carga Espacial (Ley de Child-Langmuir)',
      category: 'Cátodo & Campo E',
      latex: `J_{\\text{sc}} = \\frac{4}{9}\\varepsilon_0 \\sqrt{\\frac{2e}{m_e}} \\frac{V^{3/2}}{d^2} = (2.33\\times 10^{-6}) \\frac{(${vVolts}\\text{ V})^{3/2}}{(0.018\\text{ m})^2} = \\mathbf{${jScMA}\\text{ mA/cm}^2}`,
      html: `
        <div class="eq-formula"><em>J</em><sub>sc</sub> = (4/9) · <em>&epsilon;</em><sub>0</sub> · &radic;(2<em>e</em>/<em>m</em><sub>e</sub>) · <em>V</em><sup>3/2</sup> / <em>d</em><sup>2</sup></div>
        <div class="eq-subst">
          = (2.33×10<sup>−6</sup>) · (${vVolts} V)<sup>1.5</sup> / (0.018 m)<sup>2</sup>
          = <strong class="text-accent">${jScMA} mA/cm²</strong>
        </div>
        <div class="eq-caption">
          Régimen actual: <span class="badge ${cathode.isSpaceChargeLimited ? 'badge-warn' : 'badge-ok'}">${cathode.regimeLabel}</span>
        </div>
      `
    },
    {
      id: 'relativistic',
      title: '3. Aceleración Electrostática y Cinemática Relativista',
      category: 'Campo E & Electrones',
      latex: `\\gamma = 1 + \\frac{e V}{m_e c^2} = 1 + \\frac{${kVp}\\text{ keV}}{511.0\\text{ keV}} = \\mathbf{${gammaStr}}, \\quad \\beta = \\frac{v}{c} = \\sqrt{1 - \\frac{1}{\\gamma^2}} = \\mathbf{${betaStr}} \\implies v = \\mathbf{${vKmS}\\text{ km/s}}`,
      html: `
        <div class="eq-formula">
          <em>&gamma;</em> = 1 + <em>eV</em> / (<em>m</em><sub>e</sub><em>c</em><sup>2</sup>) = 1 + ${kVp} keV / 511.0 keV = <strong>${gammaStr}</strong><br>
          <em>&beta;</em> = <em>v</em> / <em>c</em> = &radic;(1 − 1/<em>&gamma;</em><sup>2</sup>) = <strong>${betaStr}</strong>
          &implies; <em>v</em> = <strong class="text-accent">${vKmS} km/s</strong> (${(kinematics.beta * 100).toFixed(1)}% de <em>c</em>)
        </div>
        <div class="eq-caption">La masa inercial del electrón se incrementa un ${( (kinematics.gamma - 1) * 100 ).toFixed(1)}% sobre su masa en reposo.</div>
      `
    },
    {
      id: 'larmor',
      title: '4. Radiación por Frenado Brusco (Potencia de Larmor / Liénard)',
      category: 'Ánodo & Electrodinámica',
      latex: `P = \\frac{e^2 a^2 \\gamma^6}{6\\pi\\varepsilon_0 c^3}, \\quad \\eta \\approx 9\\times 10^{-10} \\cdot Z \\cdot V = 9\\times 10^{-10} \\cdot (${zNum}) \\cdot (${vVolts}) = \\mathbf{${etaPercent}\\%}`,
      html: `
        <div class="eq-formula">
          <em>P</em> = <em>e</em><sup>2</sup> · <em>a</em><sup>2</sup> · <em>&gamma;</em><sup>6</sup> / (6&pi;<em>&epsilon;</em><sub>0</sub><em>c</em><sup>3</sup>)
          &emsp;|&emsp; <em>&eta;</em> &approx; 9×10<sup>−10</sup> · <em>Z</em> · <em>V</em> = <strong class="text-accent">${etaPercent}%</strong>
        </div>
        <div class="eq-subst">
          Potencia Eléctrica Total: <strong>${(kVp * mA / 1000).toFixed(1)} kW</strong> | Radiación X: <strong>${anode.energyBalance.xrayRadiantPowerWatts.toFixed(1)} W</strong> | Calor en Ánodo: <strong class="text-danger">${heatWatts} W</strong> (${anode.energyBalance.heatFractionPercent.toFixed(2)}%)
        </div>
        <div class="eq-caption">Frenado en el campo coulombiano del núcleo de ${targetMat.name} (Z = ${zNum}). Prácticamente toda la energía cinética se disipa térmicamente.</div>
      `
    },
    {
      id: 'duane_hunt',
      title: '5. Límite Cuántico de Duane-Hunt & Ley de Planck',
      category: 'Ondas EM & Cuántica',
      latex: `\\lambda_{\\min} = \\frac{h c}{e V_0} = \\frac{1239.84\\text{ pm}\\cdot\\text{keV}}{${kVp}\\text{ keV}} = \\mathbf{${lambdaMinPM}\\text{ pm}}, \\quad \\nu_{\\max} = \\frac{e V_0}{h} = \\mathbf{${nuMaxEHz}\\text{ EHz}}`,
      html: `
        <div class="eq-formula">
          <em>&lambda;</em><sub>min</sub> = <em>h</em>·<em>c</em> / (<em>e</em>·<em>V</em><sub>0</sub>) = 1239.84 pm·keV / ${kVp} keV = <strong class="text-accent">${lambdaMinPM} pm</strong> (0.${lambdaMinPM.replace('.', '')} &Aring;)<br>
          <em>&nu;</em><sub>max</sub> = <em>e</em>·<em>V</em><sub>0</sub> / <em>h</em> = <strong class="text-accent">${nuMaxEHz} EHz</strong> (10<sup>18</sup> Hz)
        </div>
        <div class="eq-caption">Longitud de onda de corte mínima: ningún fotón de Bremsstrahlung puede poseer una energía mayor que la energía cinética total del electrón incidente.</div>
      `
    }
  ];

  return equations;
}

/**
 * Safely renders LaTeX into a DOM container using KaTeX if available,
 * otherwise sets formatted HTML fallback.
 * @param {HTMLElement} containerElement
 * @param {Array<Object>} equations
 */
export function renderEquationsToDOM(containerElement, equations) {
  if (!containerElement) return;

  const hasKaTeX = typeof window !== 'undefined' && typeof window.katex !== 'undefined';

  let fullHtml = '';
  for (const eq of equations) {
    fullHtml += `
      <div class="equation-card" data-eq-id="${eq.id}">
        <div class="eq-header">
          <span class="eq-title">${eq.title}</span>
          <span class="eq-category-tag">${eq.category}</span>
        </div>
        <div class="eq-body" id="eq-body-${eq.id}">
          ${eq.html}
        </div>
      </div>
    `;
  }
  containerElement.innerHTML = fullHtml;

  // Attempt KaTeX enhancement if loaded
  if (hasKaTeX) {
    for (const eq of equations) {
      try {
        const bodyEl = containerElement.querySelector(`#eq-body-${eq.id} .eq-formula`);
        if (bodyEl) {
          window.katex.render(eq.latex, bodyEl, {
            throwOnError: false,
            displayMode: true
          });
        }
      } catch (err) {
        // Graceful fallback to pure HTML
      }
    }
  }
}
