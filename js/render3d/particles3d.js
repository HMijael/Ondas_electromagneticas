/**
 * xray-physics-lab-3d
 * 3D Particle Dynamics: Accelerated Relativistic Electrons,
 * Transverse Electromagnetic Wave Packets (E perp B),
 * Haz Útil Colimado & Radiación Dispersa Omnidireccional (4π esterorradianes / Fuga)
 */

import * as THREE from 'three';
import { photonEnergyToColor } from '../physics/anode.js';
import { calculateBeerLambertTransmission } from '../physics/filter.js';

export class ParticleAndWaveSimulation {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'ParticleAndWaveSimulation';
    this.scene.add(this.group);

    // Simulation configuration
    this.maxElectrons = 300;
    this.maxWavePackets = 75;
    this.maxScatterQuanta = 120;
    this.timeScale = 1.0;
    this.isExposing = true;

    // Subsystem visibility flags
    this.showElectrons = true;
    this.showWaves = true;       // Haz útil colimado (hacia filtros/detector)
    this.showScatter = true;     // Radiación dispersa y de fuga (omnidireccional 4π)
    this.scatterMode = 'all';    // 'all', 'useful', 'scatter'
    this.showVectorInspector = false;

    // Electron particle system
    this.electrons = [];
    this.electronMesh = null;

    // Transverse EM wave packets (Útil + Dispersión)
    this.wavePackets = [];
    this.waveGroup = new THREE.Group();
    this.waveGroup.name = 'EMWavePackets';
    this.group.add(this.waveGroup);

    // Scattered photon quanta particles (rápida dispersión 4π en impactos)
    this.scatterQuantaMesh = null;
    this.scatterQuantaPool = [];

    // Vector inspection group (E perp B)
    this.vectorInspectorGroup = new THREE.Group();
    this.vectorInspectorGroup.name = 'VectorInspector_E_perp_B';
    this.group.add(this.vectorInspectorGroup);

    this.initElectronSystem();
    this.initWaveSystem();
    this.initScatterQuantaSystem();
    this.initVectorInspector();
  }

  /**
   * Initializes electron stream using instanced meshes for optimal 60fps WebGL performance.
   */
  initElectronSystem() {
    const geom = new THREE.SphereGeometry(0.08, 8, 8);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending
    });

    this.electronMesh = new THREE.InstancedMesh(geom, mat, this.maxElectrons);
    this.electronMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.electronMesh);

    const dummy = new THREE.Object3D();
    for (let i = 0; i < this.maxElectrons; i++) {
      this.electrons.push({
        active: false,
        progress: Math.random(),
        speed: 1.0,
        startX: -4.0,
        startY: (Math.random() - 0.5) * 0.4,
        startZ: (Math.random() - 0.5) * 0.4,
        targetX: 1.5,
        targetY: 0.0,
        targetZ: 0.0
      });
      dummy.position.set(0, -999, 0);
      dummy.updateMatrix();
      this.electronMesh.setMatrixAt(i, dummy.matrix);
    }
    this.electronMesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * Initializes the 3D transverse sinusoidal wave-packet pool.
   * Admite paquetes para el Haz Útil y para Radiación Dispersa en cualquier dirección 3D.
   */
  initWaveSystem() {
    for (let i = 0; i < this.maxWavePackets; i++) {
      const wave = this.createTransverseWaveMesh();
      wave.visible = false;
      this.waveGroup.add(wave);
      this.wavePackets.push({
        mesh: wave,
        active: false,
        isScatter: false,
        energyKEV: 60,
        wavelengthPM: 20,
        speed: 4.8,
        progress: 0.0,
        maxRange: 5.5,
        startX: 1.5,
        startY: 0.0,
        startZ: 0.0,
        dir: new THREE.Vector3(0, -1, 0),
        e1: new THREE.Vector3(1, 0, 0),
        e2: new THREE.Vector3(0, 0, 1),
        absorbed: false,
        attenuationChecked: false
      });
    }
  }

  /**
   * Inicializa la nube de cuantos de fotones dispersos (destellos rápidos omnidireccionales).
   */
  initScatterQuantaSystem() {
    const geom = new THREE.SphereGeometry(0.045, 6, 6);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending
    });

    this.scatterQuantaMesh = new THREE.InstancedMesh(geom, mat, this.maxScatterQuanta);
    this.scatterQuantaMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.scatterQuantaMesh);

    const dummy = new THREE.Object3D();
    for (let i = 0; i < this.maxScatterQuanta; i++) {
      this.scatterQuantaPool.push({
        active: false,
        x: 1.5,
        y: 0.0,
        z: 0.0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 1.0,
        colorHex: 0xf59e0b
      });
      dummy.position.set(0, -999, 0);
      dummy.updateMatrix();
      this.scatterQuantaMesh.setMatrixAt(i, dummy.matrix);
    }
    this.scatterQuantaMesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * Constructs a 3D transverse sinusoidal electromagnetic wave curve.
   */
  createTransverseWaveMesh() {
    const numPoints = 64;
    const points = [];
    for (let i = 0; i < numPoints; i++) {
      points.push(new THREE.Vector3(0, 0, 0));
    }
    const geom = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({
      color: 0x00f0ff,
      linewidth: 2,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending
    });
    return new THREE.Line(geom, mat);
  }

  /**
   * Calcula base ortonormal (dir, e1, e2) para propagación transversal arbitraria en 3D.
   */
  computeOrthonormalBasis(dir, e1, e2) {
    if (Math.abs(dir.y) < 0.92) {
      e1.set(0, 1, 0).cross(dir).normalize();
    } else {
      e1.set(1, 0, 0).cross(dir).normalize();
    }
    e2.copy(dir).cross(e1).normalize();
  }

  /**
   * Initializes detailed E perp B Vector visualizer for an isolated photon wave.
   */
  initVectorInspector() {
    this.vectorInspectorGroup.visible = false;

    // Propagation axis (k vector)
    const kGeom = new THREE.CylinderGeometry(0.04, 0.04, 4.0, 16);
    const kMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const kMesh = new THREE.Mesh(kGeom, kMat);
    kMesh.position.set(0, -2.0, 0);
    this.vectorInspectorGroup.add(kMesh);

    // Group of oscillating E (electric, red) and B (magnetic, blue) arrows
    this.eArrows = [];
    this.bArrows = [];
    const numArrows = 9;

    for (let i = 0; i < numArrows; i++) {
      const yPos = -0.4 - i * 0.4;

      // E vector arrow (oscillates along X axis)
      const eArrow = new THREE.ArrowHelper(
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(0, yPos, 0),
        0.8,
        0xef4444, // Red for E-field
        0.2,
        0.12
      );
      this.vectorInspectorGroup.add(eArrow);
      this.eArrows.push({ helper: eArrow, yPos, basePhase: i * 0.7 });

      // B vector arrow (oscillates along Z axis, perpendicular to E and k)
      const bArrow = new THREE.ArrowHelper(
        new THREE.Vector3(0, 0, 1),
        new THREE.Vector3(0, yPos, 0),
        0.8,
        0x3b82f6, // Blue for B-field
        0.2,
        0.12
      );
      this.vectorInspectorGroup.add(bArrow);
      this.bArrows.push({ helper: bArrow, yPos, basePhase: i * 0.7 });
    }

    // Place inspection station just below tube exit
    this.vectorInspectorGroup.position.set(0.6, -2.5, 0);
  }

  /**
   * Spawns a new transverse wave packet at the anode focal spot.
   * @param {number} kVp - Kilovoltaje pico del tubo
   * @param {Object} targetMat - Material del blanco (W, Mo, Rh)
   * @param {boolean} isScatter - true para fotón disperso omnidireccional, false para haz útil
   */
  spawnWavePacket(kVp, targetMat, isScatter = false) {
    const packet = this.wavePackets.find(p => !p.active);
    if (!packet) return;

    // Sample photon energy from Bremsstrahlung & Characteristic spectrum distribution
    const maxE = kVp;
    let energy;
    const roll = Math.random();

    // 25% chance of characteristic spike if kVp > kEdge
    if (kVp > targetMat.kEdgeEnergyKEV && roll < 0.25 && targetMat.characteristicPeaks.length > 0) {
      const peak = targetMat.characteristicPeaks[Math.floor(Math.random() * targetMat.characteristicPeaks.length)];
      energy = peak.energyKEV;
    } else {
      energy = 5.0 + Math.pow(Math.random(), 1.5) * (maxE - 5.0);
    }

    packet.active = true;
    packet.progress = 0.0;
    packet.energyKEV = energy;
    packet.wavelengthPM = 1239.84 / energy;
    packet.absorbed = false;
    packet.attenuationChecked = false;
    packet.startX = 1.5 + (Math.random() - 0.5) * 0.18;
    packet.startY = (Math.random() - 0.5) * 0.18;
    packet.startZ = (Math.random() - 0.5) * 0.18;
    packet.isScatter = isScatter;

    if (!isScatter) {
      // 1. HAZ ÚTIL (CONO COLIMADO HACIA LA VENTANA INFERIOR -Y)
      const theta = Math.random() * 0.24; // Ángulo semi-apertura del colimador (~13°)
      const phi = Math.random() * Math.PI * 2;
      packet.dir.set(
        Math.sin(theta) * Math.cos(phi) * 0.5,
        -Math.cos(theta),
        Math.sin(theta) * Math.sin(phi) * 0.5
      ).normalize();
      packet.maxRange = 5.5;
      packet.speed = 4.2;

      const color = photonEnergyToColor(energy, kVp);
      packet.mesh.material.color.setRGB(color.r, color.g, color.b);
      packet.mesh.visible = this.showWaves;
    } else {
      // 2. RADIACIÓN DISPERSA & DE FUGA (OMNIDIRECCIONAL EN 4π ESTERORRADIANES)
      // Se emite en todas direcciones: hacia arriba, hacia atrás, hacia los lados
      const phi = Math.random() * Math.PI * 2;
      const cosTheta = Math.random() * 2.0 - 1.0;
      const sinTheta = Math.sqrt(Math.max(0, 1.0 - cosTheta * cosTheta));

      packet.dir.set(
        sinTheta * Math.cos(phi),
        cosTheta,
        sinTheta * Math.sin(phi)
      ).normalize();

      // Si casualmente apunta directo abajo en el cono útil, desviarlo para representar dispersión pura
      if (packet.dir.y < -0.92 && Math.abs(packet.dir.x) < 0.22 && Math.abs(packet.dir.z) < 0.22) {
        packet.dir.y = Math.abs(packet.dir.y) * 0.7; // Hacia arriba o lateral
        packet.dir.normalize();
      }

      // Rango de viaje hasta chocar contra la envoltura de vidrio o blindaje plomado
      packet.maxRange = 2.4 + Math.random() * 1.4;
      packet.speed = 3.6 + Math.random() * 1.8;

      // Colores vivos distintivos para dispersión (Ámbar, Naranja, Fucsia, Púrpura)
      const scatterPalette = [0xf59e0b, 0xf97316, 0xec4899, 0xa855f7, 0xf43f5e];
      const sColor = scatterPalette[Math.floor(Math.random() * scatterPalette.length)];
      packet.mesh.material.color.setHex(sColor);
      packet.mesh.visible = this.showScatter;
    }

    this.computeOrthonormalBasis(packet.dir, packet.e1, packet.e2);
  }

  /**
   * Dispara una ráfaga de cuantos dispersos de alta velocidad en 4π.
   */
  emitScatterQuantaBurst(kVp) {
    const burstCount = 2 + Math.floor(Math.random() * 3);
    let launched = 0;

    for (let i = 0; i < this.maxScatterQuanta && launched < burstCount; i++) {
      const q = this.scatterQuantaPool[i];
      if (q.active) continue;

      q.active = true;
      q.x = 1.5 + (Math.random() - 0.5) * 0.15;
      q.y = (Math.random() - 0.5) * 0.15;
      q.z = (Math.random() - 0.5) * 0.15;

      const phi = Math.random() * Math.PI * 2;
      const cosTheta = Math.random() * 2.0 - 1.0;
      const sinTheta = Math.sqrt(Math.max(0, 1.0 - cosTheta * cosTheta));
      const speed = 4.0 + Math.random() * 4.5;

      q.vx = sinTheta * Math.cos(phi) * speed;
      q.vy = cosTheta * speed;
      q.vz = sinTheta * Math.sin(phi) * speed;

      q.life = 0.5 + Math.random() * 0.45;
      q.maxLife = q.life;
      launched++;
    }
  }

  /**
   * Main per-frame physics update for particles and electromagnetic wave packets.
   */
  update(state, deltaSec, isExposing) {
    this.isExposing = isExposing;
    const effectiveDelta = deltaSec * this.timeScale;

    this.updateElectrons(state, effectiveDelta);
    this.updateWavePackets(state, effectiveDelta);
    this.updateScatterQuanta(effectiveDelta);
    this.updateVectorInspector(effectiveDelta);
  }

  /**
   * Updates electron trajectories accelerating under electrostatic potential.
   */
  updateElectrons(state, deltaSec) {
    if (!this.electronMesh) return;
    this.electronMesh.visible = this.showElectrons && this.isExposing;

    const dummy = new THREE.Object3D();
    const focalSpot = state.focalSpot;
    const spreadY = focalSpot.widthMM * 0.4;
    const spreadZ = focalSpot.lengthMM * 0.3;
    const betaSpeed = (0.8 + state.kinematics.beta * 2.8);

    for (let i = 0; i < this.maxElectrons; i++) {
      const e = this.electrons[i];

      if (this.isExposing) {
        e.progress += deltaSec * betaSpeed * 0.85;

        if (e.progress >= 1.0) {
          // Impact on anode focal track!
          e.progress = 0.0;
          e.startY = (Math.random() - 0.5) * spreadY;
          e.startZ = (Math.random() - 0.5) * spreadZ;
          e.targetY = (Math.random() - 0.5) * spreadY * 0.8;
          e.targetZ = (Math.random() - 0.5) * spreadZ * 0.8;

          // 1. Emisión de Haz Útil (hacia el detector inferior)
          if (this.showWaves && Math.random() < 0.22) {
            this.spawnWavePacket(state.kVp, state.targetMat, false);
          }

          // 2. Emisión de Radiación Dispersa & Fuga (omnidireccional en 4π)
          if (this.showScatter && Math.random() < 0.38) {
            this.spawnWavePacket(state.kVp, state.targetMat, true);
          }

          // 3. Cuantos de destello de dispersión
          if (this.showScatter && Math.random() < 0.45) {
            this.emitScatterQuantaBurst(state.kVp);
          }
        }

        const u = e.progress * e.progress;
        const currentX = e.startX + (e.targetX - e.startX) * u;
        const pinch = 1.0 - 0.6 * u;
        const currentY = e.startY * pinch;
        const currentZ = e.startZ * pinch;

        dummy.position.set(currentX, currentY, currentZ);
        dummy.scale.set(1.0 + state.kinematics.beta * 2.5, 1.0, 1.0);
      } else {
        dummy.position.set(0, -999, 0);
      }

      dummy.updateMatrix();
      this.electronMesh.setMatrixAt(i, dummy.matrix);
    }
    this.electronMesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * Updates transverse sinusoidal wave packets (Haz Útil y Radiación Dispersa 3D).
   */
  updateWavePackets(state, deltaSec) {
    const packetLength = 1.5;

    for (let i = 0; i < this.maxWavePackets; i++) {
      const p = this.wavePackets[i];
      if (!p.active) continue;

      // Comprobar visibilidad según el modo activo
      const shouldShow = (p.isScatter && this.showScatter) || (!p.isScatter && this.showWaves);
      if (!shouldShow || !this.isExposing) {
        p.mesh.visible = false;
        continue;
      }

      p.progress += deltaSec * p.speed;

      // Posición frontal del paquete a lo largo de su rayo 3D
      const leadX = p.startX + p.dir.x * p.progress;
      const leadY = p.startY + p.dir.y * p.progress;
      const leadZ = p.startZ + p.dir.z * p.progress;

      if (!p.isScatter) {
        // HAZ ÚTIL: Encuentro con la placa de filtro de Aluminio y Cobre (Y entre -4.5 y -5.5)
        if (!p.attenuationChecked && leadY < -4.8) {
          p.attenuationChecked = true;
          const transmission = calculateBeerLambertTransmission(
            p.energyKEV,
            state.filtration.alMM,
            state.filtration.cuMM,
            1.0
          );
          if (Math.random() > transmission) {
            p.absorbed = true;
          }
        }

        if (p.absorbed) {
          p.mesh.material.opacity = Math.max(0.0, p.mesh.material.opacity - deltaSec * 8.0);
          if (p.mesh.material.opacity <= 0.05) {
            p.active = false;
            p.mesh.visible = false;
            p.mesh.material.opacity = 0.95;
            continue;
          }
        }
      } else {
        // RADIACIÓN DISPERSA: Atenuación / absorción al alcanzar la pared de la carcasa o vidrio
        if (p.progress >= (p.maxRange - 0.7)) {
          const fade = Math.max(0.0, (p.maxRange - p.progress) / 0.7);
          p.mesh.material.opacity = fade * 0.85;
        }
      }

      // Si superó el alcance máximo
      if (p.progress >= p.maxRange) {
        p.active = false;
        p.mesh.visible = false;
        p.mesh.material.opacity = 0.95;
        continue;
      }

      // Reconstrucción de la curva senoidal transversal en el espacio 3D
      const spatialFreq = 8.0 + (p.energyKEV / state.kVp) * 16.0;
      const amplitude = p.isScatter ? 0.14 : 0.18;
      const posAttr = p.mesh.geometry.attributes.position;
      const numPts = posAttr.count;

      for (let j = 0; j < numPts; j++) {
        const t = j / (numPts - 1);
        const s = p.progress - t * packetLength;
        const envelope = Math.sin(t * Math.PI);
        const osc = Math.sin(t * spatialFreq + p.progress * 18.0) * amplitude * envelope;

        // P = P0 + dir * s + e1 * osc
        const px = p.startX + p.dir.x * s + p.e1.x * osc;
        const py = p.startY + p.dir.y * s + p.e1.y * osc;
        const pz = p.startZ + p.dir.z * s + p.e1.z * osc;

        posAttr.setXYZ(j, px, py, pz);
      }
      posAttr.needsUpdate = true;
      p.mesh.visible = true;
    }
  }

  /**
   * Actualiza la nube de destellos de cuantos de fotones dispersos.
   */
  updateScatterQuanta(deltaSec) {
    if (!this.scatterQuantaMesh) return;
    const isVisible = this.showScatter && this.isExposing;
    this.scatterQuantaMesh.visible = isVisible;
    if (!isVisible) return;

    const dummy = new THREE.Object3D();

    for (let i = 0; i < this.maxScatterQuanta; i++) {
      const q = this.scatterQuantaPool[i];
      if (!q.active) {
        dummy.position.set(0, -999, 0);
        dummy.updateMatrix();
        this.scatterQuantaMesh.setMatrixAt(i, dummy.matrix);
        continue;
      }

      q.life -= deltaSec;
      if (q.life <= 0) {
        q.active = false;
        dummy.position.set(0, -999, 0);
        dummy.updateMatrix();
        this.scatterQuantaMesh.setMatrixAt(i, dummy.matrix);
        continue;
      }

      q.x += q.vx * deltaSec;
      q.y += q.vy * deltaSec;
      q.z += q.vz * deltaSec;

      // Desvanecimiento por vida útil
      const scale = Math.max(0.1, q.life / q.maxLife);
      dummy.position.set(q.x, q.y, q.z);
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();
      this.scatterQuantaMesh.setMatrixAt(i, dummy.matrix);
    }

    this.scatterQuantaMesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * Animates the E perp B oscillating vector inspection arrows.
   */
  updateVectorInspector(deltaSec) {
    if (!this.showVectorInspector || !this.vectorInspectorGroup.visible) return;

    const time = Date.now() * 0.005;
    const frequency = 4.0;

    for (let i = 0; i < this.eArrows.length; i++) {
      const eItem = this.eArrows[i];
      const bItem = this.bArrows[i];

      const phase = time * frequency - eItem.basePhase;
      const eMagnitude = Math.sin(phase) * 1.2;
      const bMagnitude = eMagnitude;

      const eDirX = eMagnitude >= 0 ? 1 : -1;
      eItem.helper.setDirection(new THREE.Vector3(eDirX, 0, 0));
      eItem.helper.setLength(Math.max(0.05, Math.abs(eMagnitude)), 0.15, 0.08);

      const bDirZ = bMagnitude >= 0 ? 1 : -1;
      bItem.helper.setDirection(new THREE.Vector3(0, 0, bDirZ));
      bItem.helper.setLength(Math.max(0.05, Math.abs(bMagnitude)), 0.15, 0.08);
    }
  }

  setTimeScale(scale) {
    this.timeScale = Math.max(0.0, Math.min(2.0, scale));
  }

  /**
   * Configura las opciones de visibilidad de las capas y modos de radiación.
   */
  setToggles({ showElectrons, showWaves, showScatter, scatterMode, showVectorInspector }) {
    if (typeof showElectrons === 'boolean') this.showElectrons = showElectrons;
    if (typeof showWaves === 'boolean') this.showWaves = showWaves;
    if (typeof showScatter === 'boolean') this.showScatter = showScatter;

    if (scatterMode) {
      this.scatterMode = scatterMode;
      if (scatterMode === 'all') {
        this.showWaves = true;
        this.showScatter = true;
      } else if (scatterMode === 'useful') {
        this.showWaves = true;
        this.showScatter = false;
      } else if (scatterMode === 'scatter') {
        this.showWaves = false;
        this.showScatter = true;
      }
    }

    if (typeof showVectorInspector === 'boolean') {
      this.showVectorInspector = showVectorInspector;
      this.vectorInspectorGroup.visible = showVectorInspector;
    }
  }
}
