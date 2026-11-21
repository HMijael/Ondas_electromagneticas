/**
 * xray-physics-lab-3d
 * Simulador 3D de Interacción Atómica en el Blanco:
 * Radiación de Frenado (Bremsstrahlung) vs. Radiación Característica (Ionización K, L, M)
 * 
 * Sincronizado en tiempo real con el haz catódico del tubo:
 * - Bombardeo continuo de electrones de alta densidad (proporcional a los mA del tubo).
 * - Deflexión coulombiana continua e ionizaciones estocásticas a 60 FPS.
 * - Secuencias didácticas paso a paso para eventos destacados (Bremsstrahlung, Kα, Kβ).
 */

import * as THREE from 'three';
import { CONSTANTS, TARGET_MATERIALS } from '../physics/constants.js';

export class AtomicXRayInteractionSimulator {
  constructor(canvasContainerId) {
    this.container = document.getElementById(canvasContainerId);
    if (!this.container) {
      console.warn(`AtomicXRayInteractionSimulator: Container #${canvasContainerId} not found.`);
      return;
    }

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;

    // Grupos principales
    this.atomGroup = new THREE.Group();
    this.nucleusGroup = new THREE.Group();
    this.orbitalGroup = new THREE.Group();
    this.electronMeshGroup = new THREE.Group();
    this.photonGroup = new THREE.Group();
    this.beamGroup = new THREE.Group();

    // Estado físico del átomo blanco y haz incidente
    this.targetMatKey = 'W';
    this.targetMat = TARGET_MATERIALS.W;
    this.kVp = 80;
    this.mA = 200;
    this.beta = 0.5024;
    this.isExposing = true;
    this.timeScale = 1.0;
    this.simTime = 0;

    // Haz continuo de electrones incidentes (sincronizado con la emisión del tubo)
    this.maxBeamElectrons = 200;
    this.beamMesh = null;
    this.beamElectrons = [];

    // Nube de cuantos de fotones emitidos por el bombardeo continuo
    this.maxPhotonSpray = 90;
    this.photonSprayMesh = null;
    this.photonSprayPool = [];

    // Modos de simulación didáctica
    this.simMode = 'auto'; // 'auto', 'brems', 'kalpha', 'kbeta'
    this.autoTimer = 0;
    this.currentEvent = null; // Evento destacado individual paso a paso

    // Parámetros orbitales escalados
    this.orbitalShells = {
      K: { radius: 1.45, color: 0x38bdf8, electrons: [], label: 'Capa K (n=1)' },
      L: { radius: 2.65, color: 0x10b981, electrons: [], label: 'Capa L (n=2)' },
      M: { radius: 3.85, color: 0xf59e0b, electrons: [], label: 'Capa M (n=3)' }
    };

    // Objeto para vacante orbital y destellos
    this.vacancyMesh = null;
    this.impactFlashMesh = null;

    this.initScene();
    this.buildAtomicArchitecture();
    this.buildIncidentBeamSystem();
    this.buildPhotonSpraySystem();
    this.buildVacancyIndicator();
    this.buildImpactFlash();
    this.updateHUD();
  }

  initScene() {
    const width = (this.container && this.container.clientWidth > 50) ? this.container.clientWidth : 800;
    const height = (this.container && this.container.clientHeight > 50) ? this.container.clientHeight : 420;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05080e);

    this.camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    this.camera.position.set(0, 3.2, 11.8);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({
      powerPreference: 'high-performance',
      antialias: true
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;

    this.container.appendChild(this.renderer.domElement);

    // Iluminación científica
    const ambLight = new THREE.AmbientLight(0xffffff, 0.85);
    this.scene.add(ambLight);

    const dirLight1 = new THREE.DirectionalLight(0x38bdf8, 2.0);
    dirLight1.position.set(5, 8, 7);
    this.scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xef233c, 1.4);
    dirLight2.position.set(-7, -4, -5);
    this.scene.add(dirLight2);

    // Controles de ratón robustos
    this.setupControls(this.renderer.domElement);

    // Dynamic OrbitControls
    import('three/addons/controls/OrbitControls.js').then((module) => {
      if (module && module.OrbitControls) {
        this.controls = new module.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.minDistance = 3.5;
        this.controls.maxDistance = 25.0;
        this.controls.target.set(0, 0, 0);
      }
    }).catch(() => {});

    this.scene.add(this.atomGroup);
    this.scene.add(this.beamGroup);
    this.scene.add(this.photonGroup);
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

      this.camera.position.x += deltaX * 0.012;
      this.camera.position.y -= deltaY * 0.012;
      this.camera.lookAt(0, 0, 0);
    });

    domElement.addEventListener('wheel', (e) => {
      if (this.controls) return;
      e.preventDefault();
      const zoomFactor = e.deltaY > 0 ? 1.08 : 0.92;
      this.camera.position.multiplyScalar(zoomFactor);
      this.camera.position.clampLength(3.5, 25.0);
    }, { passive: false });
  }

  /**
   * Construye el Átomo Cuántico con Núcleo y Capas Electrónicas (K, L, M).
   */
  buildAtomicArchitecture() {
    this.atomGroup.clear();
    this.nucleusGroup = new THREE.Group();
    this.orbitalGroup = new THREE.Group();
    this.electronMeshGroup = new THREE.Group();

    // 1. NÚCLEO ATÓMICO (+Ze)
    const nucleusRadius = 0.62;
    const nucleusGeom = new THREE.SphereGeometry(nucleusRadius, 32, 32);
    const nucleusMat = new THREE.MeshStandardMaterial({
      color: 0xffb703,
      emissive: 0xd97706,
      emissiveIntensity: 1.2,
      roughness: 0.25,
      metalness: 0.8
    });
    const nucleusMesh = new THREE.Mesh(nucleusGeom, nucleusMat);
    this.nucleusGroup.add(nucleusMesh);

    // Halo nuclear electromagnético
    const haloGeom = new THREE.SphereGeometry(nucleusRadius * 1.35, 24, 24);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0xfbbf24,
      transparent: true,
      opacity: 0.18,
      wireframe: true
    });
    this.nucleusGroup.add(new THREE.Mesh(haloGeom, haloMat));
    this.atomGroup.add(this.nucleusGroup);

    // 2. CAPAS ORBITALES (K, L, M)
    Object.keys(this.orbitalShells).forEach((key) => {
      const shell = this.orbitalShells[key];
      shell.electrons = [];

      // Anillo de trayectoria orbital
      const ringGeom = new THREE.RingGeometry(shell.radius - 0.02, shell.radius + 0.02, 64);
      const ringMat = new THREE.MeshBasicMaterial({
        color: shell.color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.45
      });
      const ringMesh = new THREE.Mesh(ringGeom, ringMat);
      this.orbitalGroup.add(ringMesh);

      // Anillo inclinado ortogonal para sensación 3D
      const ringTiltGeom = new THREE.RingGeometry(shell.radius - 0.015, shell.radius + 0.015, 64);
      ringTiltGeom.rotateX(Math.PI / 3);
      const ringTiltMesh = new THREE.Mesh(ringTiltGeom, ringMat);
      this.orbitalGroup.add(ringTiltMesh);

      // Electrones ligados orbitantes
      const numElectrons = (key === 'K') ? 2 : ((key === 'L') ? 4 : 4);
      for (let i = 0; i < numElectrons; i++) {
        const eGeom = new THREE.SphereGeometry(0.08, 12, 12);
        const eMat = new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          transparent: true,
          opacity: 0.95
        });
        const eMesh = new THREE.Mesh(eGeom, eMat);
        this.electronMeshGroup.add(eMesh);

        shell.electrons.push({
          mesh: eMesh,
          angle: (i / numElectrons) * Math.PI * 2,
          speed: 1.4 / Math.sqrt(shell.radius),
          radius: shell.radius,
          tiltAngle: (i % 2 === 0) ? 0 : Math.PI / 3,
          isEjected: false,
          isDropping: false
        });
      }
    });

    this.atomGroup.add(this.orbitalGroup);
    this.atomGroup.add(this.electronMeshGroup);
  }

  /**
   * Inicializa el Haz Incidente Continuo de Electrones (InstancedMesh).
   * Densidad y flujo directamente relacionados con los mA de emisión del tubo.
   */
  buildIncidentBeamSystem() {
    this.beamGroup.clear();
    this.beamElectrons = [];

    const geom = new THREE.SphereGeometry(0.065, 8, 8);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending
    });

    this.beamMesh = new THREE.InstancedMesh(geom, mat, this.maxBeamElectrons);
    this.beamMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.beamGroup.add(this.beamMesh);

    const dummy = new THREE.Object3D();
    for (let i = 0; i < this.maxBeamElectrons; i++) {
      this.beamElectrons.push({
        progress: Math.random(),
        speed: 0.8 + Math.random() * 0.4,
        y0: (Math.random() - 0.5) * 4.4,
        z0: (Math.random() - 0.5) * 2.8,
        vy: 0,
        vz: 0,
        interactionChecked: false
      });
      dummy.position.set(-999, -999, -999);
      dummy.updateMatrix();
      this.beamMesh.setMatrixAt(i, dummy.matrix);
    }
    this.beamMesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * Inicializa el sistema de cuantos de fotones emitidos por el haz continuo.
   */
  buildPhotonSpraySystem() {
    const geom = new THREE.SphereGeometry(0.045, 6, 6);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending
    });

    this.photonSprayMesh = new THREE.InstancedMesh(geom, mat, this.maxPhotonSpray);
    this.photonSprayMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.beamGroup.add(this.photonSprayMesh);

    const dummy = new THREE.Object3D();
    for (let i = 0; i < this.maxPhotonSpray; i++) {
      this.photonSprayPool.push({
        active: false,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 0.45
      });
      dummy.position.set(-999, -999, -999);
      dummy.updateMatrix();
      this.photonSprayMesh.setMatrixAt(i, dummy.matrix);
    }
    this.photonSprayMesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * Indicador visual de Vacante en la Capa K.
   */
  buildVacancyIndicator() {
    const geom = new THREE.RingGeometry(0.06, 0.16, 24);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xef233c,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9
    });
    this.vacancyMesh = new THREE.Mesh(geom, mat);
    this.vacancyMesh.visible = false;
    this.atomGroup.add(this.vacancyMesh);
  }

  /**
   * Destello de impacto cuántico.
   */
  buildImpactFlash() {
    const geom = new THREE.SphereGeometry(0.3, 16, 16);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending
    });
    this.impactFlashMesh = new THREE.Mesh(geom, mat);
    this.atomGroup.add(this.impactFlashMesh);
  }

  createPhotonWaveMesh(colorHex, numPoints = 48) {
    const points = [];
    for (let i = 0; i < numPoints; i++) {
      points.push(new THREE.Vector3(0, 0, 0));
    }
    const geom = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({
      color: colorHex,
      linewidth: 2,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending
    });
    return new THREE.Line(geom, mat);
  }

  /**
   * Dispara una interacción didáctica de Radiación de Frenado (Bremsstrahlung).
   */
  triggerBremsstrahlungEvent(bFactor = 0.5) {
    const b = 0.45 + bFactor * 1.6;
    const initialEnergy = this.kVp;
    const photonEnergy = Math.max(5, initialEnergy * (0.85 / (1.0 + b * 1.2)));

    const electronMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 14, 14),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
    );
    this.scene.add(electronMesh);

    const photonColor = 0xf59e0b;
    const photonMesh = this.createPhotonWaveMesh(photonColor);
    photonMesh.visible = false;
    this.photonGroup.add(photonMesh);

    this.currentEvent = {
      type: 'bremsstrahlung',
      stage: 'approach',
      progress: 0.0,
      b: b,
      electronMesh: electronMesh,
      photonMesh: photonMesh,
      initialEnergy: initialEnergy,
      photonEnergy: photonEnergy,
      finalEnergy: initialEnergy - photonEnergy,
      photonSpawned: false,
      photonProgress: 0.0,
      deflectAngle: Math.atan2(1.2, b)
    };

    this.updateHUD();
  }

  /**
   * Dispara una interacción didáctica de Radiación Característica.
   */
  triggerCharacteristicEvent(type = 'K_alpha') {
    const bindingEnergyK = this.targetMat.kEdgeEnergyKEV;
    const canIonize = (this.kVp >= bindingEnergyK);

    const electronMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 14, 14),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
    );
    this.scene.add(electronMesh);

    const kShell = this.orbitalShells.K;
    const targetKIndex = 0;
    const targetKElectron = kShell.electrons[targetKIndex];

    const transitionShellKey = (type === 'K_beta') ? 'M' : 'L';
    const transitionShell = this.orbitalShells[transitionShellKey];
    const donorElectron = transitionShell.electrons[0];

    let photonEnergy = 59.3;
    if (this.targetMat.characteristicPeaks.length > 0) {
      const peak = this.targetMat.characteristicPeaks.find(p => p.id.includes(type === 'K_beta' ? 'beta' : 'alpha')) || this.targetMat.characteristicPeaks[0];
      photonEnergy = peak.energyKEV;
    }

    const photonColor = (type === 'K_beta') ? 0xa855f7 : 0xef233c;
    const photonMesh = this.createPhotonWaveMesh(photonColor);
    photonMesh.visible = false;
    this.photonGroup.add(photonMesh);

    this.currentEvent = {
      type: 'characteristic',
      subType: type,
      stage: 'approach',
      progress: 0.0,
      canIonize: canIonize,
      electronMesh: electronMesh,
      targetKElectron: targetKElectron,
      donorElectron: donorElectron,
      photonMesh: photonMesh,
      photonEnergy: photonEnergy,
      bindingEnergyK: bindingEnergyK,
      photonSpawned: false,
      photonProgress: 0.0,
      vacancyPos: new THREE.Vector3(),
      ejectedElectron: null,
      quantumJumpProgress: 0.0
    };

    this.updateHUD();
  }

  /**
   * Actualiza la simulación WebGL a 60 FPS.
   */
  update(deltaSec) {
    if (!this.renderer || !this.scene || !this.camera) return;

    if (this.controls) {
      this.controls.update();
    }

    const dt = Math.min(deltaSec, 0.05) * this.timeScale;
    this.simTime += dt;

    // 1. Animar electrones orbitales en capas de Bohr
    this.animateOrbitalElectrons(dt);

    // 2. Animar el Haz Continuo de electrones incidentes (sincronizado con mA)
    this.updateIncidentBeam(dt);

    // 3. Animar cuantos de fotones dispersos del bombardeo continuo
    this.updatePhotonSpray(dt);

    // 4. Animar el evento didáctico destacado (si hay alguno activo)
    if (this.currentEvent) {
      this.updateActiveEvent(dt);
    } else if (this.simMode === 'auto' && this.isExposing) {
      this.autoTimer += dt;
      if (this.autoTimer >= 3.2) {
        this.autoTimer = 0;
        const roll = Math.random();
        if (roll < 0.55) {
          this.triggerBremsstrahlungEvent(Math.random());
        } else if (roll < 0.85) {
          this.triggerCharacteristicEvent('K_alpha');
        } else {
          this.triggerCharacteristicEvent('K_beta');
        }
      }
    }

    // 5. Destellos e indicadores
    if (this.vacancyMesh && this.vacancyMesh.visible) {
      this.vacancyMesh.rotation.z += dt * 4.0;
      this.vacancyMesh.scale.setScalar(1.0 + 0.2 * Math.sin(this.simTime * 12.0));
    }

    if (this.impactFlashMesh && this.impactFlashMesh.material.opacity > 0.01) {
      this.impactFlashMesh.material.opacity -= dt * 4.5;
    }

    this.renderer.render(this.scene, this.camera);
  }

  animateOrbitalElectrons(dt) {
    Object.keys(this.orbitalShells).forEach(key => {
      const shell = this.orbitalShells[key];
      shell.electrons.forEach(e => {
        if (!e.isEjected && !e.isDropping) {
          e.angle += e.speed * dt;
          const x = Math.cos(e.angle) * e.radius;
          const y = Math.sin(e.angle) * e.radius * Math.cos(e.tiltAngle);
          const z = Math.sin(e.angle) * e.radius * Math.sin(e.tiltAngle);
          e.mesh.position.set(x, y, z);
        }
      });
    });
  }

  /**
   * ACTUALIZA EL HAZ CONTINUO DE ELECTRONES INCIDENTES
   * Relacionado directamente con la corriente del tubo (mA) y la velocidad beta (kVp).
   */
  updateIncidentBeam(dt) {
    if (!this.beamMesh) return;

    if (!this.isExposing) {
      // Standby: sin haz de electrones
      const dummy = new THREE.Object3D();
      dummy.position.set(-999, -999, -999);
      dummy.updateMatrix();
      for (let i = 0; i < this.maxBeamElectrons; i++) {
        this.beamMesh.setMatrixAt(i, dummy.matrix);
      }
      this.beamMesh.instanceMatrix.needsUpdate = true;
      return;
    }

    // Número de electrones simultáneos proporcional a la corriente mA del tubo
    const activeCount = Math.floor(Math.min(
      this.maxBeamElectrons,
      Math.max(25, (this.mA / 250.0) * this.maxBeamElectrons)
    ));

    // Velocidad de avance del haz proporcional a la cinemática relativista beta = v/c
    const beamSpeed = (3.4 + this.beta * 5.2) * this.timeScale;
    const dummy = new THREE.Object3D();

    for (let i = 0; i < this.maxBeamElectrons; i++) {
      if (i >= activeCount) {
        dummy.position.set(-999, -999, -999);
        dummy.updateMatrix();
        this.beamMesh.setMatrixAt(i, dummy.matrix);
        continue;
      }

      const e = this.beamElectrons[i];
      e.progress += dt * beamSpeed * 0.14 * e.speed;

      if (e.progress >= 1.0) {
        e.progress = 0.0;
        e.y0 = (Math.random() - 0.5) * 4.4;
        e.z0 = (Math.random() - 0.5) * 2.8;
        e.vy = 0;
        e.vz = 0;
        e.interactionChecked = false;
      }

      // Posición longitudinal de entrada desde la izquierda (X = -7.5 a +7.5)
      const x = -7.5 + e.progress * 15.0;

      // Interacción electrostática con el núcleo (+Ze) en la zona de paso central
      let y = e.y0;
      let z = e.z0;

      if (x > -3.2 && x < 4.0) {
        const r2 = x * x + y * y + z * z;
        const r = Math.sqrt(r2);
        // Atracción nuclear coulombiana F = k·Z / r²
        const coulombForce = 0.18 / Math.max(0.45, r2);

        if (x > -1.5) {
          e.vy += -Math.sign(y) * coulombForce * dt * 3.5;
          e.vz += -Math.sign(z) * coulombForce * dt * 2.5;
        }

        y += e.vy * Math.max(0, x + 1.5);
        z += e.vz * Math.max(0, x + 1.5);

        // Desencadenar micro-destellos de emisión continua de Bremsstrahlung al rozar el núcleo
        if (Math.abs(x) < 0.4 && !e.interactionChecked) {
          e.interactionChecked = true;
          if (r < 1.1) {
            this.emitPhotonSpray(x, y, z, 0xf59e0b); // Bremsstrahlung spark
          } else if (r < 2.2 && Math.random() < 0.25 && this.kVp >= this.targetMat.kEdgeEnergyKEV) {
            this.emitPhotonSpray(x, y, z, 0xef233c); // Micro Characteristic spark
          }
        }
      }

      dummy.position.set(x, y, z);
      // Elongación en dirección de avance
      dummy.scale.set(1.4, 0.85, 0.85);
      dummy.updateMatrix();
      this.beamMesh.setMatrixAt(i, dummy.matrix);
    }

    this.beamMesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * Emite un destello de fotón disperso del bombardeo continuo.
   */
  emitPhotonSpray(x, y, z, colorHex) {
    const q = this.photonSprayPool.find(p => !p.active);
    if (!q) return;

    q.active = true;
    q.x = x;
    q.y = y;
    q.z = z;

    // Dispersión en ángulo hacia adelante y lateral
    const angle = Math.random() * Math.PI * 2;
    const speed = 4.5 + Math.random() * 3.0;
    q.vx = (0.4 + Math.random() * 0.8) * speed;
    q.vy = Math.cos(angle) * speed;
    q.vz = Math.sin(angle) * speed;
    q.life = 0.35 + Math.random() * 0.2;
    q.maxLife = q.life;
  }

  /**
   * Actualiza los fotones generados por el haz continuo.
   */
  updatePhotonSpray(dt) {
    if (!this.photonSprayMesh) return;
    const dummy = new THREE.Object3D();

    for (let i = 0; i < this.maxPhotonSpray; i++) {
      const q = this.photonSprayPool[i];
      if (!q.active || !this.isExposing) {
        dummy.position.set(-999, -999, -999);
        dummy.updateMatrix();
        this.photonSprayMesh.setMatrixAt(i, dummy.matrix);
        continue;
      }

      q.life -= dt;
      if (q.life <= 0) {
        q.active = false;
        dummy.position.set(-999, -999, -999);
        dummy.updateMatrix();
        this.photonSprayMesh.setMatrixAt(i, dummy.matrix);
        continue;
      }

      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.z += q.vz * dt;

      const scale = Math.max(0.1, q.life / q.maxLife);
      dummy.position.set(q.x, q.y, q.z);
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();
      this.photonSprayMesh.setMatrixAt(i, dummy.matrix);
    }

    this.photonSprayMesh.instanceMatrix.needsUpdate = true;
  }

  updateActiveEvent(dt) {
    const ev = this.currentEvent;
    if (!ev) return;

    if (ev.type === 'bremsstrahlung') {
      this.updateBremsstrahlungStep(ev, dt);
    } else if (ev.type === 'characteristic') {
      this.updateCharacteristicStep(ev, dt);
    }
  }

  updateBremsstrahlungStep(ev, dt) {
    ev.progress += dt * 2.8;
    const xIn = -6.0 + ev.progress * 4.8;
    const b = ev.b;

    if (ev.progress < 1.0) {
      const distToNucleus = Math.sqrt(xIn * xIn + b * b);
      const deflectionY = (b > 0) ? (b - 0.45 / Math.max(0.6, distToNucleus)) : (b + 0.45 / Math.max(0.6, distToNucleus));
      ev.electronMesh.position.set(xIn, deflectionY, 0);

      if (xIn >= -0.2 && !ev.photonSpawned) {
        ev.photonSpawned = true;
        ev.photonMesh.visible = true;
        ev.photonOrigin = ev.electronMesh.position.clone();
        ev.photonDir = new THREE.Vector3(1.2, -0.6 * Math.sign(b), 0).normalize();

        if (this.impactFlashMesh) {
          this.impactFlashMesh.position.copy(ev.electronMesh.position);
          this.impactFlashMesh.material.opacity = 0.9;
        }
      }
    } else if (ev.progress < 2.4) {
      const vx = Math.cos(ev.deflectAngle) * 3.8;
      const vy = Math.sin(ev.deflectAngle) * 3.8 * Math.sign(b);
      ev.electronMesh.position.x += vx * dt;
      ev.electronMesh.position.y += vy * dt;

      if (ev.photonSpawned) {
        ev.photonProgress += dt * 4.8;
        this.updateWavePoints(ev.photonMesh, ev.photonOrigin, ev.photonDir, ev.photonProgress, ev.photonEnergy, 1.4);
      }
    } else {
      this.scene.remove(ev.electronMesh);
      this.photonGroup.remove(ev.photonMesh);
      this.currentEvent = null;
    }
  }

  updateCharacteristicStep(ev, dt) {
    ev.progress += dt * 2.6;

    if (ev.stage === 'approach') {
      const targetPos = ev.targetKElectron.mesh.position;
      const startX = -6.0;
      const u = Math.min(1.0, ev.progress);
      const curX = startX + (targetPos.x - startX) * u;
      const curY = targetPos.y * u;
      const curZ = targetPos.z * u;
      ev.electronMesh.position.set(curX, curY, curZ);

      if (u >= 0.98) {
        if (ev.canIonize) {
          ev.stage = 'ejection';
          ev.progress = 0.0;
          ev.vacancyPos.copy(targetPos);

          this.vacancyMesh.position.copy(targetPos);
          this.vacancyMesh.visible = true;

          ev.targetKElectron.isEjected = true;
          ev.ejectedMesh = ev.targetKElectron.mesh;
          ev.ejectDir = new THREE.Vector3(1.0, 0.8, 0.3).normalize();
          ev.incidentScatterDir = new THREE.Vector3(0.8, -0.9, -0.4).normalize();

          if (this.impactFlashMesh) {
            this.impactFlashMesh.position.copy(targetPos);
            this.impactFlashMesh.material.opacity = 1.0;
          }
        } else {
          ev.stage = 'rebound';
          ev.progress = 0.0;
        }
      }
    } else if (ev.stage === 'ejection') {
      ev.progress += dt * 3.5;
      ev.ejectedMesh.position.addScaledVector(ev.ejectDir, dt * 5.0);
      ev.electronMesh.position.addScaledVector(ev.incidentScatterDir, dt * 4.5);

      if (ev.progress > 0.6) {
        ev.stage = 'cascade';
        ev.progress = 0.0;
        ev.donorElectron.isDropping = true;
        ev.donorStartPos = ev.donorElectron.mesh.position.clone();
      }
    } else if (ev.stage === 'cascade') {
      ev.quantumJumpProgress += dt * 3.2;
      const q = Math.min(1.0, ev.quantumJumpProgress);
      ev.donorElectron.mesh.position.lerpVectors(ev.donorStartPos, ev.vacancyPos, q);

      if (q >= 1.0) {
        ev.stage = 'emission';
        ev.progress = 0.0;
        this.vacancyMesh.visible = false;
        ev.donorElectron.isDropping = false;
        ev.donorElectron.radius = this.orbitalShells.K.radius;

        ev.photonSpawned = true;
        ev.photonMesh.visible = true;
        ev.photonOrigin = ev.vacancyPos.clone();
        ev.photonDir = new THREE.Vector3(0.2, 1.0, 0.5).normalize();

        if (this.impactFlashMesh) {
          this.impactFlashMesh.position.copy(ev.vacancyPos);
          this.impactFlashMesh.material.opacity = 1.0;
        }
      }
    } else if (ev.stage === 'emission') {
      ev.photonProgress += dt * 4.6;
      this.updateWavePoints(ev.photonMesh, ev.photonOrigin, ev.photonDir, ev.photonProgress, ev.photonEnergy, 1.6);

      if (ev.photonProgress >= 6.5) {
        this.scene.remove(ev.electronMesh);
        this.photonGroup.remove(ev.photonMesh);
        this.buildAtomicArchitecture();
        this.currentEvent = null;
      }
    } else if (ev.stage === 'rebound') {
      ev.progress += dt * 3.0;
      ev.electronMesh.position.x -= dt * 4.5;
      ev.electronMesh.position.y += dt * 2.5;

      if (ev.progress >= 1.5) {
        this.scene.remove(ev.electronMesh);
        this.currentEvent = null;
      }
    }
  }

  updateWavePoints(lineMesh, origin, dir, progress, energyKEV, packetLength = 1.5) {
    const posAttr = lineMesh.geometry.attributes.position;
    const numPts = posAttr.count;

    const e1 = new THREE.Vector3();
    if (Math.abs(dir.y) < 0.9) {
      e1.set(0, 1, 0).cross(dir).normalize();
    } else {
      e1.set(1, 0, 0).cross(dir).normalize();
    }

    const spatialFreq = 10.0 + (energyKEV / 80.0) * 14.0;
    const amplitude = 0.16;

    for (let j = 0; j < numPts; j++) {
      const t = j / (numPts - 1);
      const s = progress - t * packetLength;
      const envelope = Math.sin(t * Math.PI);
      const osc = Math.sin(t * spatialFreq + progress * 20.0) * amplitude * envelope;

      const px = origin.x + dir.x * s + e1.x * osc;
      const py = origin.y + dir.y * s + e1.y * osc;
      const pz = origin.z + dir.z * s + e1.z * osc;
      posAttr.setXYZ(j, px, py, pz);
    }
    posAttr.needsUpdate = true;
  }

  setSimMode(mode) {
    this.simMode = mode;
    this.currentEvent = null;
    this.buildAtomicArchitecture();
    this.updateHUD();
  }

  setTargetMaterial(matKey) {
    if (TARGET_MATERIALS[matKey]) {
      this.targetMatKey = matKey;
      this.targetMat = TARGET_MATERIALS[matKey];
      this.buildAtomicArchitecture();
      this.updateHUD();
    }
  }

  /**
   * Actualiza parámetros físicos acoplados con el estado general del laboratorio.
   */
  updatePhysicsParameters(physicsState, isExposing, timeScale = 1.0) {
    if (physicsState) {
      if (typeof physicsState === 'object') {
        this.kVp = physicsState.kVp || this.kVp;
        if (physicsState.targetMatKey && TARGET_MATERIALS[physicsState.targetMatKey]) {
          this.setTargetMaterial(physicsState.targetMatKey);
        }
        if (physicsState.cathode && typeof physicsState.cathode.actualMA === 'number') {
          this.mA = physicsState.cathode.actualMA;
        }
        if (physicsState.kinematics && typeof physicsState.kinematics.beta === 'number') {
          this.beta = physicsState.kinematics.beta;
        }
      } else if (typeof physicsState === 'number') {
        this.kVp = physicsState;
      }
    }
    if (typeof isExposing === 'boolean') {
      this.isExposing = isExposing;
    }
    this.timeScale = timeScale;
    this.updateHUD();
  }

  updateHUD() {
    const elMechanism = document.getElementById('atom-hud-mechanism');
    const elPhoton = document.getElementById('atom-hud-photon');
    const elThreshold = document.getElementById('atom-hud-threshold');
    const elShell = document.getElementById('atom-hud-shell');
    const elLambda = document.getElementById('atom-hud-debroglie');
    const elFlux = document.getElementById('atom-hud-flux');

    const kEdge = this.targetMat.kEdgeEnergyKEV;
    const isOverThreshold = (this.kVp >= kEdge);

    if (elThreshold) {
      if (isOverThreshold) {
        elThreshold.innerText = `UMBRAL CAPA K: ${this.kVp} keV ≥ ${kEdge} keV (IONIZABLE)`;
        elThreshold.className = 'hud-value hud-green';
      } else {
        elThreshold.innerText = `UMBRAL CAPA K: ${this.kVp} keV < ${kEdge} keV (BLOQUEADO)`;
        elThreshold.className = 'hud-value hud-red';
      }
    }

    if (elShell) {
      elShell.innerText = `BLANCO: ${this.targetMat.name} (Z=${this.targetMat.atomicNumber}, EK=${kEdge} keV)`;
    }

    if (elLambda) {
      const lambdaMinPM = (CONSTANTS.HC_PM_KEV / this.kVp).toFixed(2);
      elLambda.innerText = `λmin DUANE-HUNT: ${lambdaMinPM} pm`;
    }

    if (elFlux) {
      const activeCount = this.isExposing ? Math.floor(Math.min(this.maxBeamElectrons, Math.max(25, (this.mA / 250.0) * this.maxBeamElectrons))) : 0;
      const electronRateExp = (this.mA * 1e-3 / 1.602e-19);
      const rateStr = (electronRateExp / 1e16).toFixed(2);
      elFlux.innerText = `${activeCount} e⁻ en haz (~${rateStr}×10¹⁶ e⁻/s a ${this.mA.toFixed(0)} mA)`;
      elFlux.className = this.isExposing ? 'hud-value hud-green' : 'hud-value hud-amber';
    }

    if (elMechanism && elPhoton) {
      if (!this.currentEvent) {
        elMechanism.innerText = `HAZ INCIDENTE: ${this.mA.toFixed(0)} mA (${this.isExposing ? 'BOMBARDEO ACTIVO' : 'STANDBY'})`;
        elMechanism.className = this.isExposing ? 'hud-value hud-cyan' : 'hud-value hud-amber';
        elPhoton.innerText = this.isExposing ? 'FOTONES: FRENADO CONTINUO & FLUORESCENCIA' : 'FOTÓN: NINGUNO';
        elPhoton.className = 'hud-value hud-gold';
      } else if (this.currentEvent.type === 'bremsstrahlung') {
        elMechanism.innerText = 'MECANISMO: RADIACIÓN DE FRENADO (BREMSSTRAHLUNG)';
        elMechanism.className = 'hud-value hud-amber';
        elPhoton.innerText = `FOTÓN CONTINUO: hν = ${this.currentEvent.photonEnergy.toFixed(1)} keV (ΔE Coulomb)`;
        elPhoton.className = 'hud-value hud-amber';
      } else if (this.currentEvent.type === 'characteristic') {
        const sub = this.currentEvent.subType === 'K_beta' ? 'Kβ (M → K)' : 'Kα (L → K)';
        elMechanism.innerText = `MECANISMO: RAYOS X CARACTERÍSTICOS [${sub}]`;
        elMechanism.className = 'hud-value hud-purple';
        elPhoton.innerText = `FOTÓN DISCRETO: hν = ${this.currentEvent.photonEnergy.toFixed(1)} keV (${this.targetMat.symbol}-${sub})`;
        elPhoton.className = 'hud-value hud-red';
      }
    }
  }

  resize() {
    if (!this.container || !this.renderer || !this.camera) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width > 50 && height > 50) {
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);
    }
  }
}
