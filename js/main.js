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
import { FocusingCupSimulator } from './render3d/focusingCupSimulator.js';
import { AtomicXRayInteractionSimulator } from './render3d/atomicInteractionSimulator.js';
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
    this.simulationResults = [];

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
    this.cupSimulator = null;
    this.atomicSimulator = null;
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
      this.initFocusingCupSimulator();
    } catch (err) {
      console.error('initFocusingCupSimulator error:', err);
    }

    try {
      this.initAtomicSimulator();
    } catch (err) {
      console.error('initAtomicSimulator error:', err);
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
      this.initSimulationResults();
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
    } catch (err) { }

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

  initFocusingCupSimulator() {
    try {
      const el = document.getElementById('canvas-focusing-cup-container');
      if (el) {
        this.cupSimulator = new FocusingCupSimulator('canvas-focusing-cup-container');

        // Botones de Modos de Visualización (Equipotenciales, Fuerza, Corte Sagital, Corte Copa 3D)
        const btnEquipot = document.getElementById('btn-cup-equipot');
        const btnForce = document.getElementById('btn-cup-force');
        const btnSagittal = document.getElementById('btn-cup-sagittal');
        const btnCutaway = document.getElementById('btn-cup-cutaway');

        if (btnEquipot) {
          btnEquipot.addEventListener('click', () => {
            btnEquipot.classList.toggle('active');
            this.cupSimulator.toggleEquipotentials(btnEquipot.classList.contains('active'));
          });
        }

        if (btnForce) {
          btnForce.addEventListener('click', () => {
            btnForce.classList.toggle('active');
            this.cupSimulator.toggleForceVectors(btnForce.classList.contains('active'));
          });
        }

        if (btnSagittal) {
          btnSagittal.addEventListener('click', () => {
            btnSagittal.classList.toggle('active');
            this.cupSimulator.toggleSagittalPlane(btnSagittal.classList.contains('active'));
          });
        }

        if (btnCutaway) {
          btnCutaway.addEventListener('click', () => {
            btnCutaway.classList.toggle('active');
            this.cupSimulator.toggleCutaway(btnCutaway.classList.contains('active'));
          });
        }

        // Presets de Régimen de Polarización (Normal, Grid-bias, Dispersión)
        const btnNormal = document.getElementById('btn-bias-normal');
        const btnGrid = document.getElementById('btn-bias-grid');
        const btnUnfocused = document.getElementById('btn-bias-unfocused');
        const sliderBias = document.getElementById('slider-cup-bias');
        const dispBiasVal = document.getElementById('disp-cup-bias-val');

        const setBiasPreset = (mode, btnActive, val) => {
          if (this.cupSimulator) this.cupSimulator.setBiasMode(mode);
          [btnNormal, btnGrid, btnUnfocused].forEach(b => { if (b) b.classList.remove('active'); });
          if (btnActive) btnActive.classList.add('active');
          if (sliderBias) sliderBias.value = val;
          if (dispBiasVal) dispBiasVal.innerText = (val >= 0 ? `+${val} V` : `${val} V`);
        };

        if (btnNormal) btnNormal.addEventListener('click', () => setBiasPreset('normal', btnNormal, 0));
        if (btnGrid) btnGrid.addEventListener('click', () => setBiasPreset('grid', btnGrid, -250));
        if (btnUnfocused) btnUnfocused.addEventListener('click', () => setBiasPreset('unfocused', btnUnfocused, 120));

        if (sliderBias) {
          sliderBias.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            if (dispBiasVal) dispBiasVal.innerText = (val >= 0 ? `+${val} V` : `${val} V`);
            if (this.cupSimulator) this.cupSimulator.setBiasVoltage(val);
            [btnNormal, btnGrid, btnUnfocused].forEach(b => { if (b) b.classList.remove('active'); });
            if (val < -50 && btnGrid) btnGrid.classList.add('active');
            else if (val > 50 && btnUnfocused) btnUnfocused.classList.add('active');
            else if (Math.abs(val) <= 50 && btnNormal) btnNormal.classList.add('active');
          });
        }

        // Selector de Filamento (Foco Fino 0.6 mm vs Foco Grueso 1.2 mm)
        const btnFine = document.getElementById('btn-cup-focal-fine');
        const btnBroad = document.getElementById('btn-cup-focal-broad');

        const setFocalMode = (mode, btnActive) => {
          if (this.cupSimulator) this.cupSimulator.setFocalSpotMode(mode);
          [btnFine, btnBroad].forEach(b => { if (b) b.classList.remove('active'); });
          if (btnActive) btnActive.classList.add('active');
          this.state.focalSpotKey = mode;
          this.computePhysics();
          this.updateHUD();
          this.updateEquations();
        };

        if (btnFine) btnFine.addEventListener('click', () => setFocalMode('fine', btnFine));
        if (btnBroad) btnBroad.addEventListener('click', () => setFocalMode('broad', btnBroad));
      }
    } catch (err) {
      console.error('FocusingCupSimulator Init Error:', err);
    }
  }

  initAtomicSimulator() {
    try {
      const el = document.getElementById('canvas-atomic-interaction-container');
      if (el) {
        this.atomicSimulator = new AtomicXRayInteractionSimulator('canvas-atomic-interaction-container');

        // Modos: Automático, Frenado (Brems), Kα, Kβ
        const btnAuto = document.getElementById('btn-atom-mode-auto');
        const btnBrems = document.getElementById('btn-atom-mode-brems');
        const btnKalpha = document.getElementById('btn-atom-mode-kalpha');
        const btnKbeta = document.getElementById('btn-atom-mode-kbeta');

        const setAtomMode = (mode, activeBtn) => {
          if (this.atomicSimulator) this.atomicSimulator.setSimMode(mode);
          [btnAuto, btnBrems, btnKalpha, btnKbeta].forEach(b => { if (b) b.classList.remove('active'); });
          if (activeBtn) activeBtn.classList.add('active');
        };

        if (btnAuto) btnAuto.addEventListener('click', () => setAtomMode('auto', btnAuto));
        if (btnBrems) btnBrems.addEventListener('click', () => {
          setAtomMode('brems', btnBrems);
          if (this.atomicSimulator) this.atomicSimulator.triggerBremsstrahlungEvent(0.5);
        });
        if (btnKalpha) btnKalpha.addEventListener('click', () => {
          setAtomMode('kalpha', btnKalpha);
          if (this.atomicSimulator) this.atomicSimulator.triggerCharacteristicEvent('K_alpha');
        });
        if (btnKbeta) btnKbeta.addEventListener('click', () => {
          setAtomMode('kbeta', btnKbeta);
          if (this.atomicSimulator) this.atomicSimulator.triggerCharacteristicEvent('K_beta');
        });

        // Disparadores manuales
        const btnTrigBrems = document.getElementById('btn-atom-trigger-brems');
        const btnTrigKalpha = document.getElementById('btn-atom-trigger-kalpha');
        const btnTrigKbeta = document.getElementById('btn-atom-trigger-kbeta');

        if (btnTrigBrems) btnTrigBrems.addEventListener('click', () => {
          if (this.atomicSimulator) this.atomicSimulator.triggerBremsstrahlungEvent(0.35 + Math.random() * 0.4);
        });
        if (btnTrigKalpha) btnTrigKalpha.addEventListener('click', () => {
          if (this.atomicSimulator) this.atomicSimulator.triggerCharacteristicEvent('K_alpha');
        });
        if (btnTrigKbeta) btnTrigKbeta.addEventListener('click', () => {
          if (this.atomicSimulator) this.atomicSimulator.triggerCharacteristicEvent('K_beta');
        });

        // Selector de material del blanco
        const btnMatW = document.getElementById('btn-atom-mat-w');
        const btnMatMo = document.getElementById('btn-atom-mat-mo');
        const btnMatRh = document.getElementById('btn-atom-mat-rh');

        const setAtomMat = (matKey, activeBtn) => {
          if (this.atomicSimulator) this.atomicSimulator.setTargetMaterial(matKey);
          [btnMatW, btnMatMo, btnMatRh].forEach(b => { if (b) b.classList.remove('active'); });
          if (activeBtn) activeBtn.classList.add('active');
          this.state.targetMatKey = matKey;
          this.computePhysics();
          this.updateHUD();
          this.updateEquations();
        };

        if (btnMatW) btnMatW.addEventListener('click', () => setAtomMat('W', btnMatW));
        if (btnMatMo) btnMatMo.addEventListener('click', () => setAtomMat('Mo', btnMatMo));
        if (btnMatRh) btnMatRh.addEventListener('click', () => setAtomMat('Rh', btnMatRh));
      }
    } catch (err) {
      console.error('AtomicSimulator Init Error:', err);
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

    // Update Independent 3D Focusing Cup Potential Simulator
    if (this.cupSimulator) {
      this.cupSimulator.updatePhysicsParameters(this.currentPhysics, this.state.isExposing, this.state.timeScale, this.state.focalSpotKey);
    }

    // Update Independent 3D Atomic Interaction Simulator (Bremsstrahlung vs Característica)
    if (this.atomicSimulator) {
      this.atomicSimulator.updatePhysicsParameters(this.currentPhysics, this.state.isExposing, this.state.timeScale);
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

    // Useful vs Scatter radiation distribution
    const usefulPercent = 1.0 + (p.kVp / 150.0) * 0.8;
    const scatterPercent = 100.0 - usefulPercent;
    this.setDOMText('hud-scatter-ratio', `Útil: ~${usefulPercent.toFixed(1)}% | Fuga/Disp: ~${scatterPercent.toFixed(1)}%`);

    // Exposure State Banner & LEDs
    const expBanner = document.getElementById('exposure-status-banner');
    const ledIndicator = document.getElementById('exposure-led');
    if (expBanner && ledIndicator) {
      if (this.state.isExposing) {
        expBanner.innerText = 'ALTA TENSIÓN CONECTADA';
        expBanner.className = 'exposure-banner exposure-banner-active';
        ledIndicator.className = 'status-led led-active';
      } else {
        expBanner.innerText = 'CIRCUITO EN REPOSO';
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
        audioBtn.innerText = isAudioActive ? ' AUDIO: ACTIVO' : ' AUDIO: SILENCIADO';
        audioBtn.className = isAudioActive ? 'btn-lab-util btn-audio-active' : 'btn-lab-util';
      });
    }

    // 2.5 Panel de Control Desplegable y Pantalla Completa
    this.initSidebarToggle();
    this.initFullscreenControls();

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

    const checkScatter = document.getElementById('toggle-scatter');

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
    if (checkScatter) {
      checkScatter.addEventListener('change', (e) => {
        if (this.particleSim) this.particleSim.setToggles({ showScatter: e.target.checked });
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

    // Botones de Modo de Radiación 3D (Haz + Dispersión, Solo Haz Útil, Solo Dispersión)
    const btnWavesAll = document.getElementById('btn-waves-all');
    const btnWavesUseful = document.getElementById('btn-waves-useful');
    const btnWavesScatter = document.getElementById('btn-waves-scatter');

    const setWavesMode = (mode, activeBtn) => {
      if (this.particleSim) {
        this.particleSim.setToggles({ scatterMode: mode });
      }
      [btnWavesAll, btnWavesUseful, btnWavesScatter].forEach(b => { if (b) b.classList.remove('active'); });
      if (activeBtn) activeBtn.classList.add('active');
      if (checkWaves) checkWaves.checked = (mode === 'all' || mode === 'useful');
      if (checkScatter) checkScatter.checked = (mode === 'all' || mode === 'scatter');
    };

    if (btnWavesAll) btnWavesAll.addEventListener('click', () => setWavesMode('all', btnWavesAll));
    if (btnWavesUseful) btnWavesUseful.addEventListener('click', () => setWavesMode('useful', btnWavesUseful));
    if (btnWavesScatter) btnWavesScatter.addEventListener('click', () => setWavesMode('scatter', btnWavesScatter));
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

  /**
   * PESTAÑA: RESULTADOS DE SIMULACIÓN
   * Registro multivariable de los 14 parámetros físicos de simulación activa.
   */
  initSimulationResults() {
    const logBtn = document.getElementById('btn-sim-log');
    const exportCsvBtn = document.getElementById('btn-sim-export-csv');
    const clearBtn = document.getElementById('btn-sim-clear');

    if (logBtn) {
      logBtn.addEventListener('click', () => this.recordSimulationResult());
    }
    if (exportCsvBtn) {
      exportCsvBtn.addEventListener('click', () => this.exportSimulationResultsCSV());
    }
    if (clearBtn) {
      clearBtn.addEventListener('click', () => this.clearSimulationResults());
    }

    // Cargar automáticamente resultados persistidos desde LocalStorage
    this.loadSimulationResultsFromStorage();
  }

  loadSimulationResultsFromStorage() {
    try {
      const saved = localStorage.getItem('xray_lab_sim_results');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.simulationResults = parsed;
          this.renderSimulationResultsTable();
        }
      }
    } catch (err) {
      console.warn('Error al recuperar resultados de LocalStorage:', err);
    }
  }

  saveSimulationResultsToStorage() {
    try {
      localStorage.setItem('xray_lab_sim_results', JSON.stringify(this.simulationResults));
    } catch (err) {
      console.warn('Error al guardar resultados en LocalStorage:', err);
    }
  }

  recordSimulationResult() {
    const p = this.currentPhysics;
    if (!p) return;

    // 1. Integración de componentes espectrales: Bremsstrahlung vs Característica
    let sumBrems = 0;
    let sumChar = 0;
    if (p.rawSpectrum && Array.isArray(p.rawSpectrum)) {
      for (const pt of p.rawSpectrum) {
        sumBrems += (pt.bremsstrahlung || 0);
        sumChar += (pt.characteristic || 0);
      }
    }
    const sumTot = sumBrems + sumChar;
    const bremsPct = sumTot > 0 ? (sumBrems / sumTot) * 100 : 100;
    const charPct = sumTot > 0 ? (sumChar / sumTot) * 100 : 0;
    const totalXrayW = p.energyBalance.xrayRadiantPowerWatts ?? 0;
    const bremsW = (totalXrayW * (bremsPct / 100)).toFixed(1);
    const charW = (totalXrayW * (charPct / 100)).toFixed(1);

    // 2. Termodinámica instantánea del ánodo
    const thermal = this.anodeThermo.update(this.state.isExposing, p.kVp, p.cathode.actualMA, 0.0);

    // 3. Flujo de electrones por segundo (I = q / t => N = I / e)
    const eFluxNum = (p.cathode.actualMA * 1e-3) / 1.602176634e-19;
    const electronFluxStr = `${eFluxNum.toExponential(2)} e⁻/s`;

    // 4. Parámetros cinemáticos y cuánticos
    const vKmS = p.kinematics.velocityKm_S.toLocaleString(undefined, { maximumFractionDigits: 0 });
    const rpmVal = this.tubeModel ? this.tubeModel.getCurrentRPM().toLocaleString() : '9,600';
    const canIonizeK = p.kVp >= p.targetMat.kEdgeEnergyKEV;

    const entry = {
      hora: new Date().toLocaleTimeString(),
      kVp: p.kVp,
      mA: p.cathode.actualMA.toFixed(0),
      target: `${p.targetMat.symbol} (Z=${p.targetMat.atomicNumber})`,
      targetSymbol: p.targetMat.symbol,
      rpm: `${rpmVal} RPM`,
      electronFlux: electronFluxStr,
      beta: `β = ${p.kinematics.beta.toFixed(4)} (${(p.kinematics.beta * 100).toFixed(1)}% c)`,
      speed: `${vKmS} km/s (γ=${p.kinematics.gamma.toFixed(3)})`,
      duaneHunt: `${p.kinematics.lambdaMinPM.toFixed(2)} pm`,
      rxFrenado: `${bremsPct.toFixed(1)}% (~${bremsW} W)`,
      rxCaracteristico: charPct > 0
        ? `${charPct.toFixed(1)}% (~${charW} W)`
        : `0% (${canIonizeK ? '0 W' : 'Sub-umbral'})`,
      hasCharacteristic: charPct > 0,
      larmorPower: `${Number(p.energyBalance.xrayRadiantPowerWatts ?? 85.3).toFixed(1)} W`,
      efficiency: `${p.energyBalance.efficiencyPercent.toFixed(3)}%`,
      anodeHeat: `${Math.round(thermal.accumulatedHU).toLocaleString()} HU (${thermal.capacityPercent.toFixed(1)}%)`,
      isThermalWarning: thermal.isThermalWarning,

      // Valores numéricos en bruto para exportación CSV
      betaRaw: p.kinematics.beta.toFixed(5),
      speedKmSRaw: Math.round(p.kinematics.velocityKm_S),
      gammaRaw: p.kinematics.gamma.toFixed(4),
      duaneHuntRaw: p.kinematics.lambdaMinPM.toFixed(3),
      bremsPctRaw: bremsPct.toFixed(2),
      charPctRaw: charPct.toFixed(2),
      larmorPowerRaw: (p.energyBalance.xrayRadiantPowerWatts ?? 85.3).toFixed(2),
      efficiencyRaw: p.energyBalance.efficiencyPercent.toFixed(4),
      huAccumRaw: Math.round(thermal.accumulatedHU),
      huCapacityPctRaw: thermal.capacityPercent.toFixed(2)
    };

    this.simulationResults.unshift(entry);
    this.saveSimulationResultsToStorage();
    this.renderSimulationResultsTable();
  }

  renderSimulationResultsTable() {
    const tbody = document.getElementById('sim-results-table-body');
    const countBadge = document.getElementById('sim-count-badge');
    const lastTimeBadge = document.getElementById('sim-last-time');
    const lastMechBadge = document.getElementById('sim-last-mechanism');
    const avgPowerBadge = document.getElementById('sim-avg-power');

    if (countBadge) countBadge.innerText = this.simulationResults.length;

    if (!tbody) return;

    if (this.simulationResults.length === 0) {
      tbody.innerHTML = '<tr><td colspan="15" class="text-center text-muted">No se han registrado resultados de simulación aún. Pulse "Registrar Medición Actual" para capturar los 14 parámetros físicos simultáneamente.</td></tr>';
      if (lastTimeBadge) lastTimeBadge.innerText = '--:--:--';
      if (avgPowerBadge) avgPowerBadge.innerText = '-- W';
      return;
    }

    const latest = this.simulationResults[0];
    if (lastTimeBadge) lastTimeBadge.innerText = latest.hora;
    if (lastMechBadge) {
      lastMechBadge.innerText = latest.hasCharacteristic ? 'Bremsstrahlung + Característica (Kα/Kβ)' : 'Solo Bremsstrahlung (Continuo)';
      lastMechBadge.style.color = latest.hasCharacteristic ? '#a855f7' : '#f59e0b';
    }
    if (avgPowerBadge) {
      const sumPower = this.simulationResults.reduce((acc, r) => acc + (parseFloat(r.larmorPowerRaw) || 0), 0);
      const avgP = (sumPower / this.simulationResults.length).toFixed(1);
      avgPowerBadge.innerText = `${avgP} W`;
    }

    let rowsHtml = '';
    this.simulationResults.forEach((item, index) => {
      const rowNum = this.simulationResults.length - index;
      rowsHtml += `
        <tr>
          <td><span class="badge" style="background: rgba(12,74,110,0.12); color: var(--glacier-800); font-weight:800;">#${rowNum}</span></td>
          <td><strong>${item.hora}</strong></td>
          <td><strong style="color: var(--glacier-700);">${item.kVp} kVp</strong></td>
          <td>${item.mA} mA</td>
          <td><span class="badge badge-target" style="font-weight:700;">${item.target}</span></td>
          <td><span class="badge" style="background: rgba(245,158,11,0.15); color: #d97706; font-weight:700;">${item.rpm}</span></td>
          <td style="font-family: var(--font-mono); color: var(--glacier-600);">${item.electronFlux}</td>
          <td class="text-accent" style="font-weight:700;">${item.beta}</td>
          <td>${item.speed}</td>
          <td style="color: var(--racing-red); font-weight:800;">${item.duaneHunt}</td>
          <td style="color: #d97706; font-weight:700;">${item.rxFrenado}</td>
          <td style="${item.hasCharacteristic ? 'color: #9333ea; font-weight:700;' : 'color: var(--glacier-text-muted);'}">${item.rxCaracteristico}</td>
          <td style="color: #b45309; font-weight:700;">${item.larmorPower}</td>
          <td><span class="badge badge-ok" style="font-weight:800;">${item.efficiency}</span></td>
          <td><span class="badge ${item.isThermalWarning ? 'badge-warn' : 'badge-ok'}" style="font-weight:700;">${item.anodeHeat}</span></td>
        </tr>
      `;
    });
    tbody.innerHTML = rowsHtml;
  }

  exportSimulationResultsCSV() {
    if (this.simulationResults.length === 0) {
      alert('No hay resultados de simulación registrados aún. Pulse "Registrar Medición Actual" primero.');
      return;
    }

    const headers = [
      'N_Secuencia',
      'Hora',
      'kVp',
      'mA',
      'Blanco_Anodo',
      'RPM_Anodo',
      'Flujo_Electrones_e_s',
      'Velocidad_Relativista_Beta',
      'Rapidez_Electrones_km_s',
      'Factor_Lorentz_Gamma',
      'Limite_Duane_Hunt_pm',
      'RX_Frenado_Bremsstrahlung_Pct',
      'RX_Caracteristicos_Pct',
      'Potencia_Larmor_W',
      'Eficiencia_Radiacion_Pct',
      'Carga_Termica_HU',
      'Carga_Termica_Capacidad_Pct'
    ];

    const csvRows = [headers.join(',')];

    this.simulationResults.forEach((item, index) => {
      const rowNum = this.simulationResults.length - index;
      const row = [
        rowNum,
        `"${item.hora}"`,
        item.kVp,
        item.mA,
        `"${item.target}"`,
        `"${item.rpm}"`,
        `"${item.electronFlux}"`,
        `"${item.betaRaw}"`,
        `"${item.speedKmSRaw}"`,
        `"${item.gammaRaw}"`,
        `"${item.duaneHuntRaw}"`,
        `"${item.bremsPctRaw}"`,
        `"${item.charPctRaw}"`,
        `"${item.larmorPowerRaw}"`,
        `"${item.efficiencyRaw}"`,
        `"${item.huAccumRaw}"`,
        `"${item.huCapacityPctRaw}"`
      ];
      csvRows.push(row.join(','));
    });

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `resultados_simulacion_rayos_x_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  clearSimulationResults() {
    this.simulationResults = [];
    try {
      localStorage.removeItem('xray_lab_sim_results');
    } catch (err) { }
    this.renderSimulationResultsTable();
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

    if (this.cupSimulator) {
      this.cupSimulator.resize();
    }

    if (this.atomicSimulator) {
      this.atomicSimulator.resize();
    }
  }

  /**
   * Alterna el despliegue del Panel de Control lateral para permitir que los
   * modelos 3D y el osciloscopio ocupen el 100% del ancho disponible.
   */
  toggleSidebar(forceState) {
    const mainLayout = document.querySelector('.lab-main-layout');
    const toggleBtn = document.getElementById('btn-toggle-sidebar');
    if (!mainLayout) return;

    const isCurrentlyCollapsed = mainLayout.classList.contains('sidebar-collapsed');
    const willCollapse = (forceState !== undefined) ? forceState : !isCurrentlyCollapsed;

    if (willCollapse) {
      mainLayout.classList.add('sidebar-collapsed');
      document.body.classList.add('sidebar-is-collapsed');
      if (toggleBtn) {
        toggleBtn.innerHTML = '◨ MOSTRAR PANEL';
        toggleBtn.classList.add('active-collapsed');
        toggleBtn.title = 'Desplegar Panel de Control Radiológico';
      }
    } else {
      mainLayout.classList.remove('sidebar-collapsed');
      document.body.classList.remove('sidebar-is-collapsed');
      if (toggleBtn) {
        toggleBtn.innerHTML = '◧ OCULTAR PANEL';
        toggleBtn.classList.remove('active-collapsed');
        toggleBtn.title = 'Ocultar Panel de Control para ampliar los modelos 3D al 100%';
      }
    }

    // Reajustar dimensiones de todos los renderers WebGL y Canvas 2D
    this.handleWindowResize();
    window.dispatchEvent(new Event('resize'));
    setTimeout(() => {
      this.handleWindowResize();
      window.dispatchEvent(new Event('resize'));
    }, 60);
    setTimeout(() => {
      this.handleWindowResize();
      window.dispatchEvent(new Event('resize'));
    }, 320);
  }

  initSidebarToggle() {
    const toggleBtn = document.getElementById('btn-toggle-sidebar');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => this.toggleSidebar());
    }

    const collapseRackBtn = document.getElementById('btn-collapse-rack');
    if (collapseRackBtn) {
      collapseRackBtn.addEventListener('click', () => this.toggleSidebar(true));
    }

    const floatingOpenBtn = document.getElementById('btn-floating-open-rack');
    if (floatingOpenBtn) {
      floatingOpenBtn.addEventListener('click', () => this.toggleSidebar(false));
    }
  }

  initFullscreenControls() {
    // 1. Alternador global de pantalla completa para el laboratorio
    const fsLabBtn = document.getElementById('btn-fullscreen-lab');
    if (fsLabBtn) {
      fsLabBtn.addEventListener('click', () => {
        const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
        if (!fsEl) {
          const el = document.documentElement;
          if (el.requestFullscreen) {
            el.requestFullscreen().catch(err => console.warn('Fullscreen err:', err));
          } else if (el.webkitRequestFullscreen) {
            el.webkitRequestFullscreen();
          }
        } else {
          if (document.exitFullscreen) {
            document.exitFullscreen().catch(err => console.warn('Exit fullscreen err:', err));
          } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
          }
        }
      });
    }

    // 2. Botones individuales de pantalla completa por tarjeta
    const cardFsButtons = document.querySelectorAll('.btn-card-fullscreen');
    cardFsButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const card = btn.closest('.viewport-card, .oscilloscope-card');
        if (!card) return;

        const currentFs = document.fullscreenElement || document.webkitFullscreenElement;
        if (currentFs === card) {
          if (document.exitFullscreen) {
            document.exitFullscreen().catch(err => console.warn('Exit card fullscreen:', err));
          } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
          }
        } else {
          if (card.requestFullscreen) {
            card.requestFullscreen().catch(err => console.warn('Card requestFullscreen:', err));
          } else if (card.webkitRequestFullscreen) {
            card.webkitRequestFullscreen();
          }
        }
      });
    });

    // 3. Listener centralizado de cambio de pantalla completa
    const onFullscreenChange = () => {
      const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
      const isFs = !!fsEl;

      if (fsLabBtn) {
        if (isFs && fsEl === document.documentElement) {
          fsLabBtn.innerHTML = '🗗 SALIR PANTALLA';
          fsLabBtn.classList.add('active');
          fsLabBtn.title = 'Salir del modo pantalla completa';
        } else {
          fsLabBtn.innerHTML = '⛶ PANTALLA COMPLETA';
          fsLabBtn.classList.remove('active');
          fsLabBtn.title = 'Alternar modo pantalla completa en el laboratorio';
        }
      }

      // Actualizar iconos de botones de tarjeta
      document.querySelectorAll('.btn-card-fullscreen').forEach(btn => {
        const card = btn.closest('.viewport-card, .oscilloscope-card');
        if (isFs && fsEl === card) {
          btn.innerHTML = '🗗';
          btn.title = 'Restaurar tamaño normal';
        } else {
          btn.innerHTML = '⛶';
          btn.title = 'Pantalla completa para este modelo';
        }
      });

      // Recalcular dimensiones para WebGL y Canvas 2D
      setTimeout(() => {
        this.handleWindowResize();
        window.dispatchEvent(new Event('resize'));
      }, 80);
      setTimeout(() => {
        this.handleWindowResize();
        window.dispatchEvent(new Event('resize'));
      }, 300);
    };

    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);
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
    } catch (e) { }

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
    } catch (e) { }

    // 3. 3D Tube Model Update (Anode Rotation, Filament Glow, Thermal Focal Track)
    try {
      if (this.tubeModel && this.currentPhysics) {
        this.tubeModel.update(this.currentPhysics, effDelta, this.state.isExposing);
      }
    } catch (e) { }

    // 4. Particles & Transverse Sinusoidal EM Waves Update
    try {
      if (this.particleSim && this.currentPhysics) {
        this.particleSim.update(this.currentPhysics, deltaSec, this.state.isExposing);
      }
    } catch (e) { }

    // 4b. Independent Microscopic EM Wave 3D Model Update
    try {
      if (this.emInspector) {
        this.emInspector.update(deltaSec);
      }
    } catch (e) { }

    // 4c. Focusing Cup Potential & Electrostatic Lens Simulator Update
    try {
      if (this.cupSimulator) {
        this.cupSimulator.update(deltaSec);
      }
    } catch (e) { }

    // 4d. Atomic X-Ray Interaction Simulator (Bremsstrahlung & Característica)
    try {
      if (this.atomicSimulator) {
        this.atomicSimulator.update(deltaSec);
      }
    } catch (e) { }

    // 5. Audio Synthesizer Update
    try {
      if (this.labSynth && this.tubeModel && this.currentPhysics) {
        const rpm = this.tubeModel.getCurrentRPM();
        const intensityRatio = (this.currentPhysics.filtration.totalFilteredIntensity / 1000.0);
        this.labSynth.update(this.state.isExposing, rpm, intensityRatio);
      }
    } catch (e) { }

    // 6. Live HUD Refresh (Digital Readouts & HU Meter Bar)
    try {
      this.updateHUD();
    } catch (e) { }

    // 7. Equations Update (Safe Throttled Update)
    if (timestamp - this.lastEquationUpdate > 2000) {
      this.lastEquationUpdate = timestamp;
      try {
        this.updateEquations();
      } catch (e) { }
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
