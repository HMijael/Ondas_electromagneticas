/**
 * xray-physics-lab-3d
 * 3D Particle Dynamics: Accelerated Relativistic Electrons &
 * Transverse Electromagnetic Wave Packets (E perp B)
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
    this.maxWavePackets = 40;
    this.timeScale = 1.0; // 1.0 = real-time, 0.1 = slow-mo, 0.0 = pause
    this.isExposing = true;

    // Subsystem visibility flags
    this.showElectrons = true;
    this.showWaves = true;
    this.showVectorInspector = false;

    // Electron particle system
    this.electrons = [];
    this.electronMesh = null;

    // Transverse EM wave packets
    this.wavePackets = [];
    this.waveGroup = new THREE.Group();
    this.waveGroup.name = 'EMWavePackets';
    this.group.add(this.waveGroup);

    // Vector inspection group (E perp B)
    this.vectorInspectorGroup = new THREE.Group();
    this.vectorInspectorGroup.name = 'VectorInspector_E_perp_B';
    this.group.add(this.vectorInspectorGroup);

    this.initElectronSystem();
    this.initWaveSystem();
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

    // Pool of electron states
    const dummy = new THREE.Object3D();
    for (let i = 0; i < this.maxElectrons; i++) {
      this.electrons.push({
        active: false,
        progress: Math.random(), // 0.0 at cathode to 1.0 at anode
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
   */
  initWaveSystem() {
    for (let i = 0; i < this.maxWavePackets; i++) {
      const wave = this.createTransverseWaveMesh();
      wave.visible = false;
      this.waveGroup.add(wave);
      this.wavePackets.push({
        mesh: wave,
        active: false,
        energyKEV: 60,
        wavelengthPM: 20,
        speed: 4.8,
        progress: 0.0, // 0 at target disc (Y ~ 0) to 1.0 at detector (Y ~ -10)
        startX: 1.5 + (Math.random() - 0.5) * 0.3,
        startY: 0.0,
        startZ: (Math.random() - 0.5) * 0.3,
        absorbed: false,
        attenuationChecked: false
      });
    }
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
   */
  spawnWavePacket(kVp, targetMat) {
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
      // Bremsstrahlung distribution: weighted towards low-to-medium energy
      energy = 5.0 + Math.pow(Math.random(), 1.5) * (maxE - 5.0);
    }

    packet.active = true;
    packet.progress = 0.0;
    packet.energyKEV = energy;
    packet.wavelengthPM = 1239.84 / energy;
    packet.absorbed = false;
    packet.attenuationChecked = false;

    // Color based on photon energy
    const color = photonEnergyToColor(energy, kVp);
    packet.mesh.material.color.setRGB(color.r, color.g, color.b);
    packet.mesh.visible = this.showWaves;
  }

  /**
   * Main per-frame physics update for particles and electromagnetic wave packets.
   */
  update(state, deltaSec, isExposing) {
    this.isExposing = isExposing;
    const effectiveDelta = deltaSec * this.timeScale;

    this.updateElectrons(state, effectiveDelta);
    this.updateWavePackets(state, effectiveDelta);
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
    // Focal spot spread width
    const spreadY = focalSpot.widthMM * 0.4;
    const spreadZ = focalSpot.lengthMM * 0.3;

    // Electron velocity scaling tied to relativistic beta (v / c)
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

          // Impact can generate X-ray wave packet
          if (this.showWaves && Math.random() < 0.22) {
            this.spawnWavePacket(state.kVp, state.targetMat);
          }
        }

        // Electrostatic acceleration: u = progress^2 (accelerating as x increases)
        const u = e.progress * e.progress;
        const currentX = e.startX + (e.targetX - e.startX) * u;
        // Focusing cup electrostatics pinch electrons toward axis
        const pinch = 1.0 - 0.6 * u;
        const currentY = e.startY * pinch;
        const currentZ = e.startZ * pinch;

        dummy.position.set(currentX, currentY, currentZ);
        // Elongate particle in velocity direction as speed increases
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
   * Updates transverse sinusoidal wave packets propagating downward through filters.
   */
  updateWavePackets(state, deltaSec) {
    const dummyVec = new THREE.Vector3();
    const packetLength = 1.6;
    const propagationSpeed = 3.6;

    for (let i = 0; i < this.maxWavePackets; i++) {
      const p = this.wavePackets[i];
      if (!p.active) continue;

      p.progress += deltaSec * propagationSpeed;

      // Filter encounter zone: Y between -4.5 and -5.5
      const currentY = p.startY - p.progress * 2.0;

      if (!p.attenuationChecked && currentY < -4.8) {
        p.attenuationChecked = true;
        // Test transmission through Aluminum & Copper filters using Beer-Lambert law
        const transmission = calculateBeerLambertTransmission(
          p.energyKEV,
          state.filtration.alMM,
          state.filtration.cuMM,
          1.0
        );

        if (Math.random() > transmission) {
          // Low energy photon is absorbed by filter plate!
          p.absorbed = true;
        }
      }

      if (p.absorbed) {
        // Fade out quickly at filter plane
        p.mesh.material.opacity = Math.max(0.0, p.mesh.material.opacity - deltaSec * 8.0);
        if (p.mesh.material.opacity <= 0.05) {
          p.active = false;
          p.mesh.visible = false;
          p.mesh.material.opacity = 0.95;
          continue;
        }
      }

      if (p.progress >= 4.8) {
        // Exited detection zone
        p.active = false;
        p.mesh.visible = false;
        p.mesh.material.opacity = 0.95;
        continue;
      }

      // Re-generate sinusoidal transverse wave points for this packet
      // Spatial frequency scales with photon energy E (high E = tight spatial oscillations)
      const spatialFreq = 8.0 + (p.energyKEV / state.kVp) * 16.0;
      const amplitude = 0.18;
      const posAttr = p.mesh.geometry.attributes.position;
      const numPts = posAttr.count;

      for (let j = 0; j < numPts; j++) {
        const t = j / (numPts - 1);
        const yLocal = -t * packetLength;
        const envelope = Math.sin(t * Math.PI); // Envelope window taper
        const xOffset = Math.sin(t * spatialFreq + p.progress * 18.0) * amplitude * envelope;
        const zOffset = 0; // Polarized transverse wave

        posAttr.setXYZ(j, p.startX + xOffset, currentY + yLocal, p.startZ + zOffset);
      }
      posAttr.needsUpdate = true;
      p.mesh.visible = this.showWaves;
    }
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
      const bMagnitude = eMagnitude; // In phase for electromagnetic wave in vacuum!

      // E-field oscillates along X axis (red)
      const eDirX = eMagnitude >= 0 ? 1 : -1;
      eItem.helper.setDirection(new THREE.Vector3(eDirX, 0, 0));
      eItem.helper.setLength(Math.max(0.05, Math.abs(eMagnitude)), 0.15, 0.08);

      // B-field oscillates along Z axis (blue, perpendicular to E and k)
      const bDirZ = bMagnitude >= 0 ? 1 : -1;
      bItem.helper.setDirection(new THREE.Vector3(0, 0, bDirZ));
      bItem.helper.setLength(Math.max(0.05, Math.abs(bMagnitude)), 0.15, 0.08);
    }
  }

  setTimeScale(scale) {
    this.timeScale = Math.max(0.0, Math.min(2.0, scale));
  }

  setToggles({ showElectrons, showWaves, showVectorInspector }) {
    if (typeof showElectrons === 'boolean') this.showElectrons = showElectrons;
    if (typeof showWaves === 'boolean') this.showWaves = showWaves;
    if (typeof showVectorInspector === 'boolean') {
      this.showVectorInspector = showVectorInspector;
      this.vectorInspectorGroup.visible = showVectorInspector;
    }
  }
}
