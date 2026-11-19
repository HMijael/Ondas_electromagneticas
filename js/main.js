/**
 * xray-physics-lab-3d
 * Main Laboratory Orchestrator
 * Rigorous Medical Physics & Senior WebGL / Three.js Graphics Integration
 */

import * as THREE from 'three';
import { CONSTANTS, TARGET_MATERIALS } from './physics/constants.js';
import { evaluateCathodeState, FOCAL_SPOTS } from './physics/cathode.js';
import { calculateElectronKinematics } from './physics/field.js';
import { AnodeThermodynamics, calculateEnergyEfficiency, generateRawSpectrum } from './physics/anode.js';
import { filterSpectrum } from './physics/filter.js';
import { generateLiveEquations, renderEquationsToDOM } from './physics/equations.js';
import { XRayTubeModel } from './render3d/tubeModel.js';
import { ParticleAndWaveSimulation } from './render3d/particles3d.js';
import { EMWaveInspector } from './render3d/emWaveInspector.js';
import { SpectrumOscilloscope } from './render2d/spectrumChart.js';
import { LaboratoryAudioSynthesizer } from './audio/labSynth.js';

// OrbitControls will be dynamically imported inside init3DScene without blocking module evaluation
let OrbitControlsClass = null;

class XRayPhysicsLabApp {
  constructor() {
    // 1. Initial State - Mandatory Immediate Active Boot (80 kVp, 200 mA, Tungsten, Exposure ON)
    this.state = {
      isExposing: true,
      kVp: 80,
      mA: 200,
      focalSpotKey: 'fine',
      targetMatKey: 'W',
      anodeAngle: 12.0,
      alFilterMM: 2.5,
      cuFilterMM: 0.0,
      timeScale: 1.0,
      isDarkroomMode: false,
      xAxisUnit: 'energy' // 'energy' or 'wavelength'
    };

    // Subsystem visibility states
    this.subsystemVisibility = {
      glass: true,
      stator: true,
      eField: true,
      electrons: true,
      waves: true,
      vectorInspector: false
    };

    // Experimental measurement logbook
    this.logbook = [];

    // Core physics engines
    this.anodeThermo = new AnodeThermodynamics();
    this.labSynth = new LaboratoryAudioSynthesizer();

    // Graphics handles
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.controls = null;
    this.tubeModel = null;
    this.particleSim = null;
    this.emInspector = null;
    this.oscilloscope = null;

    // Timing
    this.clock = new THREE.Clock();
    this.lastEquationUpdate = 0;

    this.init();
  }

  async init() {
    try {
      this.init3DScene();
    } catch (err) {
      console.error('init3DScene error:', err);
    }

    try {
      this.initEMInspector();
    } catch (err) {
      console.error('initEMInspector error:', err);
    }

    try {
      this.initOscilloscope();
    } catch (err) {
      console.error('initOscilloscope error:', err);
    }

    try {
      this.initDOMControls();
      this.initTabNavigation();
      this.initSubsystemCheckboxes();
      this.initLogbook();
    } catch (err) {
      console.error('initDOMControls error:', err);
    }

    // Trigger initial physics evaluation and display
    try {
      this.computePhysics();
      this.updateHUD();
      this.updateEquations();
    } catch (err) {
      console.error('computePhysics error:', err);
    }

    // Start animation loop - 100% Guaranteed to run
    try {
      window.requestAnimationFrame((time) => this.renderLoop(time));
    } catch (err) {
      console.error('requestAnimationFrame error:', err);
    }

    // Handle window resize
    try {
      window.addEventListener('resize', () => this.handleWindowResize());
    } catch (err) {}

    console.log('X-Ray Physics Lab 3D initialized successfully.');
  }

  init3DScene() {
    const canvasContainer = document.getElementById('viewport-3d-container');
    if (!canvasContainer) {
      console.error('viewport-3d-container element not found');
      return;
    }
    const width = (canvasContainer.clientWidth > 50) ? canvasContainer.clientWidth : 800;
    const height = (canvasContainer.clientHeight > 50) ? canvasContainer.clientHeight : 500;

    // Three.js Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x070a0e);

    // Camera
    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    this.camera.position.set(0, 1.8, 14.5);

    // WebGL Renderer
    this.renderer = new THREE.WebGLRenderer({
      powerPreference: 'high-performance',
      antialias: true
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    // Remove any fallback 2D canvas if present so WebGL takes over cleanly
    const standaloneCanvas = canvasContainer.querySelector('.standalone-3d-canvas');
    if (standaloneCanvas) {
      standaloneCanvas.remove();
    }
    canvasContainer.appendChild(this.renderer.domElement);

    // Lighting Setup - High-Fidelity Medical Physics Studio Rig
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.1);
    this.scene.add(ambientLight);

    // Primary Cool Key Light
    const dirLight1 = new THREE.DirectionalLight(0xffffff, 2.2);
    dirLight1.position.set(8, 14, 12);
    this.scene.add(dirLight1);

    // Cyan Electric Rim Light (Emphasizes glass contours and high-voltage aesthetic)
    const dirLight2 = new THREE.DirectionalLight(0x00f0ff, 1.5);
    dirLight2.position.set(-12, -4, -8);
    this.scene.add(dirLight2);

    // Warm Specular Light focused on Anode Target Disc and Copper Rotor
    const dirLight3 = new THREE.DirectionalLight(0xfef08a, 1.3);
    dirLight3.position.set(6, 4, 8);
    this.scene.add(dirLight3);

    const pointLightTarget = new THREE.PointLight(0xffedd5, 1.5, 16);
    pointLightTarget.position.set(1.5, 0, 1.5);
    this.scene.add(pointLightTarget);

    // Immediate robust fallback controls so interaction works instantly
    this.setupFallbackControls(this.renderer.domElement);

    // Asynchronously upgrade to OrbitControls without blocking scene startup
    import('three/addons/controls/OrbitControls.js').then((module) => {
      if (module && module.OrbitControls) {
        this.controls = new module.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.minDistance = 4.0;
        this.controls.maxDistance = 35.0;
        this.controls.target.set(0, -0.6, 0);
      }
    }).catch(() => {
      // Native fallback controls remain active
    });

    // 3D Tube Model & Particle/Wave Simulation
    this.tubeModel = new XRayTubeModel(this.scene);
    this.tubeModel.setAnodeAngle(this.state.anodeAngle);
    this.tubeModel.setFilterThickness(this.state.alFilterMM, this.state.cuFilterMM);

    this.particleSim = new ParticleAndWaveSimulation(this.scene);
  }

  setupFallbackControls(domElement) {
    let isDragging = false;
    let prevMouseX = 0;
    let prevMouseY = 0;

    domElement.addEventListener('mousedown', (e) => {
      isDragging = true;
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;
    });

    window.addEventListener('mouseup', () => { isDragging = false; });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const deltaX = e.clientX - prevMouseX;
      const deltaY = e.clientY - prevMouseY;
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;

      this.camera.position.x += deltaX * 0.02;
      this.camera.position.y -= deltaY * 0.02;
      this.camera.lookAt(0, -0.6, 0);
    });

    domElement.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.camera.position.z += e.deltaY * 0.01;
      this.camera.position.z = Math.max(4.0, Math.min(30.0, this.camera.position.z));
    });
  }

  initOscilloscope() {
    const canvas = document.getElementById('spectrum-oscilloscope-canvas');
    if (canvas) {
      this.oscilloscope = new SpectrumOscilloscope(canvas);
    }
  }

  initEMInspector() {
    try {
      const el = document.getElementById('canvas-em-wave-inspector');
      if (el) {
        this.emInspector = new EMWaveInspector('canvas-em-wave-inspector');

        // Controles de modos de visualización (E, B, S, Lóbulo)
        const btnAll = document.getElementById('btn-micro-all');
        const btnE = document.getElementById('btn-micro-e');
        const btnB = document.getElementById('btn-micro-b');
        const btnLobe = document.getElementById('btn-micro-lobe');

        const setMode = (mode, activeBtn) => {
          if (this.emInspector) this.emInspector.setViewMode(mode);
          [btnAll, btnE, btnB, btnLobe].forEach(b => { if (b) b.classList.remove('active'); });
          if (activeBtn) activeBtn.classList.add('active');
        };

        if (btnAll) btnAll.addEventListener('click', () => setMode('all', btnAll));
        if (btnE) btnE.addEventListener('click', () => setMode('e_only', btnE));
        if (btnB) btnB.addEventListener('click', () => setMode('b_only', btnB));
        if (btnLobe) btnLobe.addEventListener('click', () => setMode('lobe_only', btnLobe));
      }
    } catch (err) {
      console.error('EMWaveInspector Init Error:', err);
    }
  }

  /**
   * Evaluates comprehensive coupled radiological physics.
   */
  computePhysics() {
    const { kVp, mA, focalSpotKey, targetMatKey, anodeAngle, alFilterMM, cuFilterMM } = this.state;
    const targetMat = TARGET_MATERIALS[targetMatKey] || TARGET_MATERIALS.W;

    // 1. Cathode thermionic and space-charge physics
    const cathode = evaluateCathodeState({ kVp, mA, focalSpotKey, targetMatKey });

    // 2. Relativistic kinematics and Duane-Hunt boundary
    const kinematics = calculateElectronKinematics(kVp, CONSTANTS.GAP_DISTANCE);

    // 3. Efficiency and Energy Balance
    const energyBalance = calculateEnergyEfficiency(targetMat.atomicNumber, kVp, cathode.actualMA);

    // 4. Raw continuous and characteristic spectrum
    const rawSpectrum = generateRawSpectrum({
      kVp,
      mA: cathode.actualMA,
      targetMatKey,
      numBins: 240,
      anodeAngleDeg: anodeAngle
    });

    // 5. Attenuation and Beam Hardening via Beer-Lambert Law
    const filtration = filterSpectrum(rawSpectrum, {
      alMM: alFilterMM,
      cuMM: cuFilterMM,
      glassMM: 1.0
    });

    this.currentPhysics = {
      cathode,
      field: kinematics,
      kinematics,
      energyBalance,
      rawSpectrum,
      filtration,
      targetMat,
      focalSpot: FOCAL_SPOTS[focalSpotKey],
      focalSpotKey,
      anode: {
        thermal: this.anodeThermo.update(this.state.isExposing, kVp, cathode.actualMA, 0.0),
        energyBalance,
        targetMaterial: targetMat,
        efficiency: energyBalance
      },
      kVp,
      mA,
      anodeAngle
    };

    // Update 2D Oscilloscope
    if (this.oscilloscope) {
      this.oscilloscope.updateData(filtration, kVp, targetMat);
    }

    // Update Independent 3D EM Wave Inspector
    if (this.emInspector) {
      this.emInspector.updatePhysicsParameters(this.currentPhysics, this.state.isExposing, this.state.timeScale);
    }
  }

  /**
   * Updates all digital instruments, LEDs, and status meters in the UI.
   */
  updateHUD() {
    const p = this.currentPhysics;
    if (!p) return;

    // Digital Displays
    this.setDOMText('hud-kvp', `${p.kVp} kVp`);
    this.setDOMText('hud-ma', `${p.cathode.actualMA.toFixed(0)} mA`);
    this.setDOMText('hud-rpm', `${this.tubeModel ? this.tubeModel.getCurrentRPM() : 0} RPM`);
    this.setDOMText('hud-target', `${p.targetMat.symbol} (${p.targetMat.atomicNumber})`);

    // Relativistic Beta & Velocity
    const vKmS = p.kinematics.velocityKm_S.toLocaleString(undefined, { maximumFractionDigits: 0 });
    this.setDOMText('hud-beta', `β = ${p.kinematics.beta.toFixed(4)} (${(p.kinematics.beta * 100).toFixed(1)}% c)`);
    this.setDOMText('hud-speed', `${vKmS} km/s (γ = ${p.kinematics.gamma.toFixed(3)})`);

    // Duane-Hunt cutoff & Beam properties
    this.setDOMText('hud-lambda-min', `${p.kinematics.lambdaMinPM.toFixed(2)} pm`);
    this.setDOMText('hud-mean-e', `${p.filtration.filteredMeanEnergyKEV.toFixed(1)} keV (+${p.filtration.beamHardeningDeltaKEV.toFixed(1)})`);
    this.setDOMText('hud-hvl', `${p.filtration.hvlMMAl.toFixed(2)} mm Al`);

    // Heat Units & Thermal capacity
    const thermal = this.anodeThermo.update(this.state.isExposing, p.kVp, p.cathode.actualMA, 0.0);
    this.setDOMText('hud-hu', `${Math.round(thermal.accumulatedHU).toLocaleString()} HU`);
    this.setDOMText('hud-hu-pct', `${thermal.capacityPercent.toFixed(1)}%`);

    const huBar = document.getElementById('hu-bar-fill');
    if (huBar) {
      huBar.style.width = `${Math.min(100, thermal.capacityPercent)}%`;
      if (thermal.isThermalCritical) {
        huBar.style.backgroundColor = '#ef4444';
      } else if (thermal.isThermalWarning) {
        huBar.style.backgroundColor = '#f59e0b';
      } else {
        huBar.style.backgroundColor = '#10b981';
      }
    }

    // Power & Efficiency
    this.setDOMText('hud-power', `${(p.energyBalance.totalElectricalPowerWatts / 1000).toFixed(2)} kW`);
    this.setDOMText('hud-efficiency', `η = ${p.energyBalance.efficiencyPercent.toFixed(3)}% (Calor: ${p.energyBalance.heatFractionPercent.toFixed(2)}%)`);

    // Exposure State Banner & LEDs
    const expBanner = document.getElementById('exposure-status-banner');
    const ledIndicator = document.getElementById('exposure-led');
    if (expBanner && ledIndicator) {
      if (this.state.isExposing) {
        expBanner.innerText = 'X-RAY EXPOSURE ACTIVE (ALTA TENSIÓN CONECTADA)';
        expBanner.className = 'exposure-banner exposure-banner-active';
        ledIndicator.className = 'status-led led-active';
      } else {
        expBanner.innerText = 'STANDBY (CIRCUITO EN REPOSO)';
        expBanner.className = 'exposure-banner exposure-banner-standby';
        ledIndicator.className = 'status-led led-standby';
      }
    }
  }

  updateEquations() {
    if (!this.currentPhysics) return;
    const equationsContainer = document.getElementById('equations-container');
    if (equationsContainer) {
      const equations = generateLiveEquations(this.currentPhysics);
      renderEquationsToDOM(equationsContainer, equations);
    }
  }

  setDOMText(id, text) {
    const el = document.getElementById(id);
    if (el) el.innerText = text;
  }

  /**
   * Wires all sliders, steppers, toggles and buttons.
   */
  initDOMControls() {
    // 1. Main Exposure Toggle Switch
    const expBtn = document.getElementById('btn-toggle-exposure');
    if (expBtn) {
      expBtn.addEventListener('click', () => {
        this.state.isExposing = !this.state.isExposing;
        this.labSynth.playContactorClick(this.state.isExposing);
        expBtn.innerText = this.state.isExposing ? 'DETENER EXPOSICIÓN (STANDBY)' : 'ACTIVAR EXPOSICIÓN (X-RAY ON)';
        expBtn.className = this.state.isExposing ? 'btn-exposure btn-exposure-active' : 'btn-exposure btn-exposure-standby';
        this.computePhysics();
        this.updateHUD();
      });
    }

    // 2. Audio Mute Button
    const audioBtn = document.getElementById('btn-toggle-audio');
    if (audioBtn) {
      audioBtn.addEventListener('click', () => {
        const isAudioActive = this.labSynth.toggleMute();
        audioBtn.innerText = isAudioActive ? '🔊 AUDIO LAB: ACTIVO' : '🔇 AUDIO LAB: SILENCIADO';
        audioBtn.className = isAudioActive ? 'btn-lab-util btn-audio-active' : 'btn-lab-util';
      });
    }

    // 3. kVp Controls (20 to 150)
    this.bindRangeWithSteppers({
      sliderId: 'slider-kvp',
      displayId: 'display-kvp-val',
      btnMinusId: 'btn-kvp-minus',
      btnPlusId: 'btn-kvp-plus',
      min: 20,
      max: 150,
      step: 1,
      getter: () => this.state.kVp,
      setter: (v) => { this.state.kVp = v; }
    });

    // 4. mA Controls (10 to 600)
    this.bindRangeWithSteppers({
      sliderId: 'slider-ma',
      displayId: 'display-ma-val',
      btnMinusId: 'btn-ma-minus',
      btnPlusId: 'btn-ma-plus',
      min: 10,
      max: 600,
      step: 10,
      getter: () => this.state.mA,
      setter: (v) => { this.state.mA = v; }
    });

    // 5. Anode Angle Controls (7 to 17 degrees)
    this.bindRangeWithSteppers({
      sliderId: 'slider-angle',
      displayId: 'display-angle-val',
      btnMinusId: 'btn-angle-minus',
      btnPlusId: 'btn-angle-plus',
      min: 7,
      max: 17,
      step: 1,
      unit: '°',
      getter: () => this.state.anodeAngle,
      setter: (v) => {
        this.state.anodeAngle = v;
        if (this.tubeModel) this.tubeModel.setAnodeAngle(v);
      }
    });

    // 6. Aluminum Filter Controls (0.0 to 5.0 mm)
    this.bindRangeWithSteppers({
      sliderId: 'slider-al',
      displayId: 'display-al-val',
      btnMinusId: 'btn-al-minus',
      btnPlusId: 'btn-al-plus',
      min: 0.0,
      max: 5.0,
      step: 0.5,
      decimals: 1,
      unit: ' mm',
      getter: () => this.state.alFilterMM,
      setter: (v) => {
        this.state.alFilterMM = v;
        if (this.tubeModel) this.tubeModel.setFilterThickness(this.state.alFilterMM, this.state.cuFilterMM);
      }
    });

    // 7. Copper Filter Controls (0.0 to 0.5 mm)
    this.bindRangeWithSteppers({
      sliderId: 'slider-cu',
      displayId: 'display-cu-val',
      btnMinusId: 'btn-cu-minus',
      btnPlusId: 'btn-cu-plus',
      min: 0.0,
      max: 0.5,
      step: 0.05,
      decimals: 2,
      unit: ' mm',
      getter: () => this.state.cuFilterMM,
      setter: (v) => {
        this.state.cuFilterMM = v;
        if (this.tubeModel) this.tubeModel.setFilterThickness(this.state.alFilterMM, this.state.cuFilterMM);
      }
    });

    // 8. Target Material Selector
    const targetSelect = document.getElementById('select-target-mat');
    if (targetSelect) {
      targetSelect.addEventListener('change', (e) => {
        this.state.targetMatKey = e.target.value;
        this.computePhysics();
        this.updateHUD();
        this.updateEquations();
      });
    }

    // 9. Focal Spot Selector (Fine 0.6 mm vs Broad 1.2 mm)
    const focalRadios = document.querySelectorAll('input[name="focal-spot"]');
    focalRadios.forEach(radio => {
      radio.addEventListener('change', (e) => {
        if (e.target.checked) {
          this.state.focalSpotKey = e.target.value;
          this.computePhysics();
          this.updateHUD();
          this.updateEquations();
        }
      });
    });

    // 10. Time Scale Controls (Real-Time 1.0, Slow-Mo 0.1, Pause 0.0)
    const timeRadios = document.querySelectorAll('input[name="time-scale"]');
    timeRadios.forEach(radio => {
      radio.addEventListener('change', (e) => {
        if (e.target.checked) {
          const scale = parseFloat(e.target.value);
          this.state.timeScale = scale;
          if (this.particleSim) this.particleSim.setTimeScale(scale);
        }
      });
    });

    // 11. Oscilloscope Unit Mode Toggle (keV vs pm / EHz)
    const btnUnitKeV = document.getElementById('btn-scope-kev');
    const btnUnitPm = document.getElementById('btn-scope-pm');
    if (btnUnitKeV && btnUnitPm) {
      btnUnitKeV.addEventListener('click', () => {
        btnUnitKeV.classList.add('active');
        btnUnitPm.classList.remove('active');
        if (this.oscilloscope) this.oscilloscope.setXAxisMode('energy');
      });
      btnUnitPm.addEventListener('click', () => {
        btnUnitPm.classList.add('active');
        btnUnitKeV.classList.remove('active');
        if (this.oscilloscope) this.oscilloscope.setXAxisMode('wavelength');
      });
    }

    // 12. Reset Thermal Heat Units Button
    const resetHuBtn = document.getElementById('btn-reset-hu');
    if (resetHuBtn) {
      resetHuBtn.addEventListener('click', () => {
        this.anodeThermo.reset();
        this.computePhysics();
        this.updateHUD();
      });
    }
  }

  bindRangeWithSteppers({ sliderId, displayId, btnMinusId, btnPlusId, min, max, step, decimals = 0, unit = '', getter, setter }) {
    const slider = document.getElementById(sliderId);
    const display = document.getElementById(displayId);
    const btnMinus = document.getElementById(btnMinusId);
    const btnPlus = document.getElementById(btnPlusId);

    const updateValue = (val) => {
      let clamped = Math.max(min, Math.min(max, val));
      clamped = parseFloat(clamped.toFixed(decimals));
      setter(clamped);
      if (slider) slider.value = clamped;
      if (display) display.innerText = `${clamped}${unit}`;
      this.computePhysics();
      this.updateHUD();
      this.updateEquations();
    };

    if (slider) {
      slider.addEventListener('input', (e) => updateValue(parseFloat(e.target.value)));
    }
    if (btnMinus) {
      btnMinus.addEventListener('click', () => updateValue(getter() - step));
    }
    if (btnPlus) {
      btnPlus.addEventListener('click', () => updateValue(getter() + step));
    }
  }

  initTabNavigation() {
    const tabButtons = document.querySelectorAll('.lab-tab-btn');
    const tabPanels = document.querySelectorAll('.lab-tab-panel');

    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-tab');
        tabButtons.forEach(b => b.classList.remove('active'));
        tabPanels.forEach(p => p.classList.remove('active'));

        btn.classList.add('active');
        const activePanel = document.getElementById(`tab-${targetTab}`);
        if (activePanel) activePanel.classList.add('active');
      });
    });
  }

  initSubsystemCheckboxes() {
    const checkGlass = document.getElementById('toggle-glass');
    const checkStator = document.getElementById('toggle-stator');
    const checkField = document.getElementById('toggle-efield');
    const checkElectrons = document.getElementById('toggle-electrons');
    const checkWaves = document.getElementById('toggle-waves');
    const checkVectors = document.getElementById('toggle-vectors');
    const checkDarkroom = document.getElementById('toggle-darkroom');

    if (checkGlass) {
      checkGlass.addEventListener('change', (e) => {
        if (this.tubeModel) this.tubeModel.setSubsystemVisibility('glassEnvelope', e.target.checked);
      });
    }
    if (checkStator) {
      checkStator.addEventListener('change', (e) => {
        if (this.tubeModel) this.tubeModel.setSubsystemVisibility('statorWindings', e.target.checked);
      });
    }
    if (checkField) {
      checkField.addEventListener('change', (e) => {
        if (this.tubeModel) this.tubeModel.setSubsystemVisibility('electricFieldLines', e.target.checked);
      });
    }
    if (checkElectrons) {
      checkElectrons.addEventListener('change', (e) => {
        if (this.particleSim) this.particleSim.setToggles({ showElectrons: e.target.checked });
      });
    }
    if (checkWaves) {
      checkWaves.addEventListener('change', (e) => {
        if (this.particleSim) this.particleSim.setToggles({ showWaves: e.target.checked });
      });
    }
    if (checkVectors) {
      checkVectors.addEventListener('change', (e) => {
        if (this.particleSim) this.particleSim.setToggles({ showVectorInspector: e.target.checked });
      });
    }
    if (checkDarkroom) {
      checkDarkroom.addEventListener('change', (e) => {
        this.state.isDarkroomMode = e.target.checked;
        if (this.scene) {
          this.scene.background = new THREE.Color(e.target.checked ? 0x010204 : 0x070a0e);
        }
      });
    }
  }

  initLogbook() {
    const logBtn = document.getElementById('btn-log-measurement');
    const exportCsvBtn = document.getElementById('btn-export-csv');
    const clearBtn = document.getElementById('btn-clear-logbook');

    if (logBtn) {
      logBtn.addEventListener('click', () => this.recordMeasurement());
    }
    if (exportCsvBtn) {
      exportCsvBtn.addEventListener('click', () => this.exportLogbookCSV());
    }
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        this.logbook = [];
        this.renderLogbookTable();
      });
    }
  }

  recordMeasurement() {
    const p = this.currentPhysics;
    if (!p) return;

    const entry = {
      timestamp: new Date().toLocaleTimeString(),
      kVp: p.kVp,
      mA: p.cathode.actualMA.toFixed(0),
      target: p.targetMat.symbol,
      anodeAngle: `${p.anodeAngle}°`,
      alFilter: `${p.filtration.alMM.toFixed(1)} mm`,
      cuFilter: `${p.filtration.cuMM.toFixed(2)} mm`,
      lambdaMin: `${p.kinematics.lambdaMinPM.toFixed(2)} pm`,
      meanEnergy: `${p.filtration.filteredMeanEnergyKEV.toFixed(1)} keV`,
      hvl: `${p.filtration.hvlMMAl.toFixed(2)} mm Al`,
      efficiency: `${p.energyBalance.efficiencyPercent.toFixed(3)}%`
    };

    this.logbook.unshift(entry);
    this.renderLogbookTable();
  }

  renderLogbookTable() {
    const tbody = document.getElementById('logbook-table-body');
    if (!tbody) return;

    if (this.logbook.length === 0) {
      tbody.innerHTML = '<tr><td colspan="11" class="text-center text-muted">No se han registrado mediciones aún. Pulse "Registrar Medición".</td></tr>';
      return;
    }

    let rowsHtml = '';
    for (const item of this.logbook) {
      rowsHtml += `
        <tr>
          <td>${item.timestamp}</td>
          <td><strong>${item.kVp}</strong></td>
          <td>${item.mA}</td>
          <td><span class="badge badge-target">${item.target}</span></td>
          <td>${item.anodeAngle}</td>
          <td>${item.alFilter}</td>
          <td>${item.cuFilter}</td>
          <td class="text-accent">${item.lambdaMin}</td>
          <td>${item.meanEnergy}</td>
          <td><strong class="text-success">${item.hvl}</strong></td>
          <td>${item.efficiency}</td>
        </tr>
      `;
    }
    tbody.innerHTML = rowsHtml;
  }

  exportLogbookCSV() {
    if (this.logbook.length === 0) {
      alert('El cuaderno está vacío. Registre mediciones primero.');
      return;
    }

    const headers = ['Hora', 'kVp', 'mA', 'Blanco', 'Angulo_Anodo', 'Filtro_Al_mm', 'Filtro_Cu_mm', 'Lambda_Min_pm', 'Energia_Media_keV', 'HVL_mm_Al', 'Eficiencia'];
    const csvRows = [headers.join(',')];

    for (const item of this.logbook) {
      const row = [
        `"${item.timestamp}"`,
        item.kVp,
        item.mA,
        `"${item.target}"`,
        `"${item.anodeAngle}"`,
        `"${item.alFilter}"`,
        `"${item.cuFilter}"`,
        `"${item.lambdaMin}"`,
        `"${item.meanEnergy}"`,
        `"${item.hvl}"`,
        `"${item.efficiency}"`
      ];
      csvRows.push(row.join(','));
    }

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mediciones_tubo_rayos_x_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  handleWindowResize() {
    const container = document.getElementById('viewport-3d-container');
    if (!container || !this.renderer || !this.camera) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);

    if (this.oscilloscope) {
      this.oscilloscope.resize();
    }

    if (this.emInspector) {
      this.emInspector.resize();
    }
  }

  /**
   * Main WebGL Animation Loop (60 FPS)
   */
  renderLoop(timestamp) {
    window.requestAnimationFrame((time) => this.renderLoop(time));

    const deltaSec = Math.min(0.066, this.clock.getDelta());
    const effDelta = deltaSec * this.state.timeScale;

    // 1. Controls Update
    try {
      if (this.controls && this.controls.update) {
        this.controls.update();
      }
    } catch (e) {}

    // 2. Physics & Thermodynamics Update
    try {
      if (this.currentPhysics && this.currentPhysics.cathode) {
        this.currentPhysics.anode.thermal = this.anodeThermo.update(
          this.state.isExposing,
          this.state.kVp,
          this.currentPhysics.cathode.actualMA,
          effDelta
        );
      }
    } catch (e) {}

    // 3. 3D Tube Model Update (Anode Rotation, Filament Glow, Thermal Focal Track)
    try {
      if (this.tubeModel && this.currentPhysics) {
        this.tubeModel.update(this.currentPhysics, effDelta, this.state.isExposing);
      }
    } catch (e) {}

    // 4. Particles & Transverse Sinusoidal EM Waves Update
    try {
      if (this.particleSim && this.currentPhysics) {
        this.particleSim.update(this.currentPhysics, deltaSec, this.state.isExposing);
      }
    } catch (e) {}

    // 4b. Independent Microscopic EM Wave 3D Model Update
    try {
      if (this.emInspector) {
        this.emInspector.update(deltaSec);
      }
    } catch (e) {}

    // 5. Audio Synthesizer Update
    try {
      if (this.labSynth && this.tubeModel && this.currentPhysics) {
        const rpm = this.tubeModel.getCurrentRPM();
        const intensityRatio = (this.currentPhysics.filtration.totalFilteredIntensity / 1000.0);
        this.labSynth.update(this.state.isExposing, rpm, intensityRatio);
      }
    } catch (e) {}

    // 6. Live HUD Refresh (Digital Readouts & HU Meter Bar)
    try {
      this.updateHUD();
    } catch (e) {}

    // 7. Equations Update (Safe Throttled Update)
    if (timestamp - this.lastEquationUpdate > 2000) {
      this.lastEquationUpdate = timestamp;
      try {
        this.updateEquations();
      } catch (e) {}
    }

    // 8. CRITICAL: 3D WebGL Rendering
    try {
      if (this.renderer && this.scene && this.camera) {
        this.renderer.render(this.scene, this.camera);
      }
    } catch (renderErr) {
      console.error('WebGL Render Error:', renderErr);
    }
  }
}

// Robust global bootstrap: handles both pre-load and post-load scenarios
function bootstrapApp() {
  if (!window.xRayLab) {
    window.xRayLab = new XRayPhysicsLabApp();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrapApp);
} else {
  // DOM is already ready and interactive
  bootstrapApp();
}
