/**
 * xray-physics-lab-3d
 * Micro-Visualizador 3D de Onda Electromagnética & Radiación de Frenado (Bremsstrahlung)
 * 
 * Simula a escala atómica la desaceleración coulombiana del electrón contra el núcleo (+Ze)
 * y la radiación electromagnética transversal resultante:
 * - Campo Eléctrico E (Rojo Racing, vertical)
 * - Campo Magnético B (Azul Glaciar, horizontal, E ⊥ B)
 * - Vector de Poynting S = (E × B) / μ0 (dirección de propagación)
 * - Lóbulo angular relativista de radiación de Liénard-Wiechert
 * - Capas orbitales atómicas (K, L, M) y núcleo con brillo nuclear
 */

import * as THREE from 'three';
import { CONSTANTS, TARGET_MATERIALS } from '../physics/constants.js';

export class EMWaveInspector {
  constructor(canvasContainerId) {
    this.container = document.getElementById(canvasContainerId);
    if (!this.container) {
      console.warn(`EMWaveInspector: Container #${canvasContainerId} not found.`);
      return;
    }

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;

    // Componentes del modelo atómico y ondulatorio
    this.atomicGroup = new THREE.Group();
    this.nucleusMesh = null;
    this.orbitalGroup = new THREE.Group();
    this.electronMesh = null;
    this.electronTrail = null;
    this.emWaveGroup = new THREE.Group();
    this.eFieldLines = [];
    this.bFieldLines = [];
    this.eWaveMesh = null;
    this.bWaveMesh = null;
    this.poyntingArrow = null;
    this.larmorLobeMesh = null;
    this.photonWavePackets = [];

    // Estado físico interno
    this.kVp = 80;
    this.mA = 200;
    this.targetMat = TARGET_MATERIALS.W;
    this.isExposing = true;
    this.timeScale = 1.0;
    this.simTime = 0;

    // Modos de visualización
    this.viewMode = 'all'; // 'all', 'e_only', 'b_only', 'lobe_only'

    this.initScene();
    this.buildAtomicTarget();
    this.buildWaveArchitecture();
    this.buildRelativisticLobe();
  }

  initScene() {
    const width = (this.container && this.container.clientWidth > 50) ? this.container.clientWidth : 800;
    const height = (this.container && this.container.clientHeight > 50) ? this.container.clientHeight : 350;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x06090e); // Profundidad de cámara de vacío

    this.camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    this.camera.position.set(0, 3.5, 12);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({
      powerPreference: 'high-performance',
      antialias: true
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    this.container.appendChild(this.renderer.domElement);

    // Iluminación científica
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
    this.scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0x38bdf8, 2.0); // Luz fría Glaciar
    dirLight1.position.set(5, 10, 8);
    this.scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xef233c, 1.2); // Contraluz Rojo Racing
    dirLight2.position.set(-8, -4, -6);
    this.scene.add(dirLight2);

    // Controles de ratón nativos robustos
    this.setupControls(this.renderer.domElement);

    // Upgrade a OrbitControls si está disponible
    import('three/addons/controls/OrbitControls.js').then((module) => {
      if (module && module.OrbitControls) {
        this.controls = new module.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.minDistance = 3.0;
        this.controls.maxDistance = 25.0;
        this.controls.target.set(0, 0, 0);
      }
    }).catch(() => {});
  }

  setupControls(domElement) {
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
      if (!isDragging || this.controls) return;
      const deltaX = e.clientX - prevMouseX;
      const deltaY = e.clientY - prevMouseY;
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;

      this.camera.position.x += deltaX * 0.015;
      this.camera.position.y -= deltaY * 0.015;
      this.camera.lookAt(0, 0, 0);
    });

    domElement.addEventListener('wheel', (e) => {
      if (this.controls) return;
      e.preventDefault();
      const zoomFactor = e.deltaY > 0 ? 1.08 : 0.92;
      this.camera.position.multiplyScalar(zoomFactor);
      this.camera.position.clampLength(3.0, 25.0);
    }, { passive: false });
  }

  buildAtomicTarget() {
    this.atomicGroup = new THREE.Group();
    this.atomicGroup.position.set(-2.8, 0, 0);

    // 1. Núcleo Atómico (+Ze) con brillo radiante
    const nucleusGeo = new THREE.SphereGeometry(0.55, 32, 32);
    const nucleusMat = new THREE.MeshStandardMaterial({
      color: 0xffb703,
      emissive: 0xd97706,
      emissiveIntensity: 0.85,
      roughness: 0.25,
      metalness: 0.8
    });
    this.nucleusMesh = new THREE.Mesh(nucleusGeo, nucleusMat);
    this.atomicGroup.add(this.nucleusMesh);

    // Halo nuclear luminoso
    const haloGeo = new THREE.SphereGeometry(0.72, 24, 24);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0xfbbf24,
      transparent: true,
      opacity: 0.18,
      wireframe: true
    });
    this.atomicGroup.add(new THREE.Mesh(haloGeo, haloMat));

    // 2. Capas Electrónicas Orbitales (K: n=1, L: n=2, M: n=3)
    const orbitRadii = [1.15, 1.85, 2.65];
    const orbitColors = [0x38bdf8, 0x0ea5e9, 0x0284c7];

    orbitRadii.forEach((r, idx) => {
      const ringGeo = new THREE.RingGeometry(r - 0.015, r + 0.015, 64);
      const ringMat = new THREE.MeshBasicMaterial({
        color: orbitColors[idx],
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.35
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.rotation.x = Math.PI / 2 + (idx * 0.2);
      ringMesh.rotation.y = idx * 0.3;
      this.orbitalGroup.add(ringMesh);

      // Pequeños electrones orbitales girando
      const eOrbGeo = new THREE.SphereGeometry(0.06, 12, 12);
      const eOrbMat = new THREE.MeshBasicMaterial({ color: 0x7dd3fc });
      const eOrb1 = new THREE.Mesh(eOrbGeo, eOrbMat);
      eOrb1.position.set(r, 0, 0);
      ringMesh.add(eOrb1);
    });

    this.atomicGroup.add(this.orbitalGroup);
    this.scene.add(this.atomicGroup);

    // 3. Electrón Incidente de Alta Energía (Azul cian relativista)
    const eGeo = new THREE.SphereGeometry(0.12, 16, 16);
    const eMat = new THREE.MeshStandardMaterial({
      color: 0x00f0ff,
      emissive: 0x00f0ff,
      emissiveIntensity: 1.5,
      roughness: 0.1
    });
    this.electronMesh = new THREE.Mesh(eGeo, eMat);
    this.scene.add(this.electronMesh);

    // Trayectoria hiperbólica de dispersión coulombiana
    const curvePoints = [];
    for (let t = -4; t <= 4; t += 0.1) {
      // Trayectoria hiperbólica que bordea el núcleo
      const x = -2.8 + (t < 0 ? t * 1.5 : Math.cos(0.8) * t * 1.5);
      const y = t < 0 ? 0.8 / (1 + Math.exp(-t)) : 0.8 + Math.sin(0.8) * t * 0.9;
      const z = Math.sin(t * 0.5) * 0.3;
      curvePoints.push(new THREE.Vector3(x, y, z));
    }
    const trailGeo = new THREE.BufferGeometry().setFromPoints(curvePoints);
    const trailMat = new THREE.LineDashedMaterial({
      color: 0x38bdf8,
      dashSize: 0.2,
      gapSize: 0.1,
      transparent: true,
      opacity: 0.5
    });
    this.electronTrail = new THREE.Line(trailGeo, trailMat);
    this.electronTrail.computeLineDistances();
    this.scene.add(this.electronTrail);
  }

  buildWaveArchitecture() {
    this.emWaveGroup = new THREE.Group();
    this.emWaveGroup.position.set(-1.8, 0.8, 0); // Eje originado en la colisión

    // Longitud total del tren de ondas
    this.waveLength = 8.5;
    this.numWaveSegments = 240;

    // 1. Eje de Propagación z (Línea central)
    const axisGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(this.waveLength, 0, 0)
    ]);
    const axisMat = new THREE.LineBasicMaterial({
      color: 0x94a3b8,
      transparent: true,
      opacity: 0.4
    });
    const axisLine = new THREE.Line(axisGeo, axisMat);
    this.emWaveGroup.add(axisLine);

    // 2. Línea Senoidal del Campo Eléctrico E (Plano Y, Rojo Racing)
    const ePoints = [];
    for (let i = 0; i <= this.numWaveSegments; i++) {
      const x = (i / this.numWaveSegments) * this.waveLength;
      ePoints.push(new THREE.Vector3(x, 0, 0));
    }
    this.eWaveGeo = new THREE.BufferGeometry().setFromPoints(ePoints);
    this.eWaveMat = new THREE.LineBasicMaterial({
      color: 0xef233c, // Rojo Racing
      linewidth: 3
    });
    this.eWaveMesh = new THREE.Line(this.eWaveGeo, this.eWaveMat);
    this.emWaveGroup.add(this.eWaveMesh);

    // 3. Línea Senoidal del Campo Magnético B (Plano Z, Azul Glaciar)
    const bPoints = [];
    for (let i = 0; i <= this.numWaveSegments; i++) {
      const x = (i / this.numWaveSegments) * this.waveLength;
      bPoints.push(new THREE.Vector3(x, 0, 0));
    }
    this.bWaveGeo = new THREE.BufferGeometry().setFromPoints(bPoints);
    this.bWaveMat = new THREE.LineBasicMaterial({
      color: 0x0ea5e9, // Azul Glaciar
      linewidth: 3
    });
    this.bWaveMesh = new THREE.Line(this.bWaveGeo, this.bWaveMat);
    this.emWaveGroup.add(this.bWaveMesh);

    // 4. Pares de Flechas Vectoriales E y B a lo largo de la onda
    this.vectorSampleCount = 18;
    this.eFieldArrows = [];
    this.bFieldArrows = [];

    for (let i = 0; i < this.vectorSampleCount; i++) {
      // Flecha Campo Eléctrico (Vertical, Rojo Racing)
      const arrowE = new THREE.ArrowHelper(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(0, 0, 0),
        0.8,
        0xef233c,
        0.18,
        0.09
      );
      this.emWaveGroup.add(arrowE);
      this.eFieldArrows.push(arrowE);

      // Flecha Campo Magnético (Horizontal, Azul Glaciar)
      const arrowB = new THREE.ArrowHelper(
        new THREE.Vector3(0, 0, 1),
        new THREE.Vector3(0, 0, 0),
        0.8,
        0x0ea5e9,
        0.18,
        0.09
      );
      this.emWaveGroup.add(arrowB);
      this.bFieldArrows.push(arrowB);
    }

    // 5. Vector de Poynting S = (E × B) / μ0 (Dirección de propagación)
    this.poyntingArrow = new THREE.ArrowHelper(
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(this.waveLength + 0.1, 0, 0),
      1.4,
      0xffb703, // Dorado energético
      0.35,
      0.18
    );
    this.emWaveGroup.add(this.poyntingArrow);

    this.scene.add(this.emWaveGroup);
  }

  buildRelativisticLobe() {
    // Lóbulo 3D de radiación angular de Larmor / Liénard-Wiechert
    // dP/dΩ ∝ sin²θ / (1 - β cos θ)⁵
    const lobeGeo = new THREE.SphereGeometry(1.6, 32, 16);
    const lobeMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.22,
      wireframe: true,
      emissive: 0x0284c7,
      emissiveIntensity: 0.35,
      side: THREE.DoubleSide
    });
    this.larmorLobeMesh = new THREE.Mesh(lobeGeo, lobeMat);
    this.larmorLobeMesh.position.set(-1.8, 0.8, 0);
    this.scene.add(this.larmorLobeMesh);
  }

  updatePhysicsParameters(physicsState, isExposing, timeScale = 1.0) {
    if (!physicsState) return;

    try {
      this.kVp = physicsState.field ? physicsState.field.kVp : (physicsState.kVp || 80);
      this.mA = physicsState.cathode ? physicsState.cathode.actualMA : (physicsState.mA || 200);
      this.targetMat = physicsState.targetMat || (physicsState.anode ? physicsState.anode.targetMaterial : TARGET_MATERIALS.W);
      this.isExposing = isExposing;
      this.timeScale = timeScale;

      // Actualizar color/identidad del núcleo según el blanco metálico
      if (this.nucleusMesh && this.targetMat) {
        if (this.targetMat.symbol === 'W') {
          this.nucleusMesh.material.color.setHex(0xffb703); // Tungsteno (Z=74)
        } else if (this.targetMat.symbol === 'Mo') {
          this.nucleusMesh.material.color.setHex(0x38bdf8); // Molibdeno (Z=42)
        } else if (this.targetMat.symbol === 'Rh') {
          this.nucleusMesh.material.color.setHex(0xa855f7); // Rodio (Z=45)
        }
      }

      // Actualizar deformación del lóbulo relativista según β = v/c
      if (this.larmorLobeMesh && (physicsState.field || physicsState.kinematics)) {
        const fieldData = physicsState.field || physicsState.kinematics;
        const beta = fieldData.beta || 0.5;
        // El "beaming" relativista alarga el lóbulo en la dirección hacia adelante
        const forwardStretch = 1.0 + beta * 1.8;
        const transverseNarrow = Math.max(0.4, 1.0 - beta * 0.5);
        this.larmorLobeMesh.scale.set(forwardStretch, transverseNarrow, transverseNarrow);
        this.larmorLobeMesh.visible = (this.viewMode === 'all' || this.viewMode === 'lobe_only') && this.isExposing;
      }

      this.updateHUDReadout(physicsState);
    } catch (err) {
      console.warn('EMWaveInspector.updatePhysicsParameters non-fatal error:', err);
    }
  }

  updateHUDReadout(p) {
    try {
      const lambdaMinEl = document.getElementById('micro-hud-lambda');
      const freqMaxEl = document.getElementById('micro-hud-freq');
      const energyEl = document.getElementById('micro-hud-energy');
      const betaEl = document.getElementById('micro-hud-beta');
      const larmorPowEl = document.getElementById('micro-hud-larmor');

      const fieldData = p.field || p.kinematics;

      const lambdaMin = fieldData?.lambdaMinPM ?? fieldData?.duaneHuntCutoff?.lambdaMinPicometers ?? (1239.84 / Math.max(1, this.kVp));
      const nuMax = fieldData?.nuMaxEHz ?? fieldData?.duaneHuntCutoff?.frequencyMaxEHz ?? ((this.kVp * 1e3 * 1.602176634e-19) / 6.62607015e-34 / 1e18);

      if (lambdaMinEl) {
        lambdaMinEl.innerText = `λmin = ${Number(lambdaMin).toFixed(2)} pm`;
      }
      if (freqMaxEl) {
        freqMaxEl.innerText = `νmax = ${Number(nuMax).toFixed(3)} EHz`;
      }
      if (energyEl) {
        energyEl.innerText = `${this.kVp} keV`;
      }
      if (betaEl && fieldData) {
        const beta = fieldData.beta !== undefined ? fieldData.beta : 0.5024;
        betaEl.innerText = `β = ${Number(beta).toFixed(4)} (${(beta * 100).toFixed(1)}% c)`;
      }
      if (larmorPowEl) {
        const eff = p.anode?.efficiency || p.anode?.energyBalance || p.energyBalance;
        const pow = eff?.xrayRadiantPowerWatts ?? eff?.xrayPowerWatts ?? 85.3;
        larmorPowEl.innerText = `${Number(pow).toFixed(1)} W`;
      }
    } catch (err) {
      console.warn('EMWaveInspector.updateHUDReadout non-fatal error:', err);
    }
  }

  setViewMode(mode) {
    this.viewMode = mode;
    if (this.eWaveMesh) this.eWaveMesh.visible = (mode === 'all' || mode === 'e_only');
    if (this.bWaveMesh) this.bWaveMesh.visible = (mode === 'all' || mode === 'b_only');
    if (this.poyntingArrow) this.poyntingArrow.visible = (mode === 'all');
    if (this.larmorLobeMesh) this.larmorLobeMesh.visible = (mode === 'all' || mode === 'lobe_only');

    this.eFieldArrows.forEach(a => a.visible = (mode === 'all' || mode === 'e_only'));
    this.bFieldArrows.forEach(a => a.visible = (mode === 'all' || mode === 'b_only'));
  }

  update(deltaSec) {
    if (!this.renderer || !this.scene || !this.camera) return;

    if (this.controls && this.controls.update) {
      this.controls.update();
    }

    const effDelta = deltaSec * this.timeScale;
    this.simTime += effDelta;

    // 1. Rotación lenta de los orbitales atómicos
    if (this.orbitalGroup) {
      this.orbitalGroup.rotation.y += effDelta * 0.8;
      this.orbitalGroup.rotation.z += effDelta * 0.3;
    }

    // 2. Animación del Electrón Incidente y Desaceleración
    if (this.electronMesh && this.isExposing) {
      // Ciclo de llegada y frenado
      const cycle = (this.simTime * 2.2) % 3.0;
      if (cycle < 1.4) {
        // Fase de acercamiento hiperbólico
        const t = -4.0 + (cycle / 1.4) * 4.0;
        this.electronMesh.position.x = -2.8 + t * 1.2;
        this.electronMesh.position.y = 0.8 / (1 + Math.exp(-t));
        this.electronMesh.position.z = Math.sin(t * 0.6) * 0.25;
        this.electronMesh.scale.setScalar(1.0);
      } else {
        // Fase de desviación frenada con menor velocidad
        const t = ((cycle - 1.4) / 1.6) * 3.5;
        this.electronMesh.position.x = -2.8 + Math.cos(0.7) * t * 1.1;
        this.electronMesh.position.y = 0.8 + Math.sin(0.7) * t * 0.7;
        this.electronMesh.position.z = Math.sin(t * 0.4) * 0.3;
        // Brillo pulsante tras el impacto
        const pulse = 1.0 + Math.sin(cycle * 12) * 0.3;
        this.electronMesh.scale.setScalar(pulse);
      }
      this.electronMesh.visible = true;
    } else if (this.electronMesh) {
      this.electronMesh.visible = false;
    }

    // 3. Ondulación Senoidal Transversal de E y B
    if (this.isExposing) {
      // Frecuencia visual ajustada proporcional a la energía en keV
      const waveFreqK = 3.5 + (this.kVp / 150) * 4.5;
      const speedPhase = this.simTime * (8.0 + (this.kVp / 150) * 12.0);
      const amplitude = 1.1;

      // Actualizar geometría de la onda E (Vertical)
      if (this.eWaveGeo) {
        const posAttr = this.eWaveGeo.attributes.position;
        for (let i = 0; i <= this.numWaveSegments; i++) {
          const x = (i / this.numWaveSegments) * this.waveLength;
          const y = Math.sin(x * waveFreqK - speedPhase) * amplitude;
          posAttr.setXYZ(i, x, y, 0);
        }
        posAttr.needsUpdate = true;
      }

      // Actualizar geometría de la onda B (Horizontal, en fase con E)
      if (this.bWaveGeo) {
        const posAttr = this.bWaveGeo.attributes.position;
        for (let i = 0; i <= this.numWaveSegments; i++) {
          const x = (i / this.numWaveSegments) * this.waveLength;
          const z = Math.sin(x * waveFreqK - speedPhase) * amplitude;
          posAttr.setXYZ(i, x, 0, z);
        }
        posAttr.needsUpdate = true;
      }

      // Actualizar flechas vectoriales E y B discretas
      for (let i = 0; i < this.vectorSampleCount; i++) {
        const u = (i + 0.5) / this.vectorSampleCount;
        const x = u * this.waveLength;
        const val = Math.sin(x * waveFreqK - speedPhase) * amplitude;

        // Flecha E
        const arrowE = this.eFieldArrows[i];
        if (arrowE) {
          arrowE.position.set(x, 0, 0);
          const dirY = val >= 0 ? 1 : -1;
          const len = Math.max(0.08, Math.abs(val));
          arrowE.setDirection(new THREE.Vector3(0, dirY, 0));
          arrowE.setLength(len, Math.min(len * 0.35, 0.2), Math.min(len * 0.2, 0.1));
        }

        // Flecha B
        const arrowB = this.bFieldArrows[i];
        if (arrowB) {
          arrowB.position.set(x, 0, 0);
          const dirZ = val >= 0 ? 1 : -1;
          const len = Math.max(0.08, Math.abs(val));
          arrowB.setDirection(new THREE.Vector3(0, 0, dirZ));
          arrowB.setLength(len, Math.min(len * 0.35, 0.2), Math.min(len * 0.2, 0.1));
        }
      }

      if (this.emWaveGroup) this.emWaveGroup.visible = true;
    } else {
      if (this.emWaveGroup) this.emWaveGroup.visible = false;
    }

    // Renderizado WebGL
    try {
      this.renderer.render(this.scene, this.camera);
    } catch (e) {
      console.error('EMWaveInspector Render Error:', e);
    }
  }

  resize() {
    if (!this.container || !this.renderer || !this.camera) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width === 0 || height === 0) return;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }
}
