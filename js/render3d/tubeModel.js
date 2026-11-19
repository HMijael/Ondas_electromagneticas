/**
 * xray-physics-lab-3d
 * High-Fidelity 3D Radiological Engineering Model: Rotating Anode X-Ray Tube
 * Photorealistic PBR Materials, Borosilicate Pyrex Glass, Helical Cathode Filaments,
 * Thermal Blackbody Focal Track, Copper Induction Rotor & Lead Collimator.
 */

import * as THREE from 'three';

export class XRayTubeModel {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'XRayTubeAssembly';
    this.scene.add(this.group);

    // Subsystems references for animation and isolation toggles
    this.subsystems = {
      glassEnvelope: null,
      cathodeAssembly: null,
      filamentFine: null,
      filamentBroad: null,
      spaceChargeCloud: null,
      anodeAssembly: null,
      anodeRotor: null,
      anodeDisc: null,
      focalTrackGlow: null,
      focalPointLight: null,
      statorWindings: null,
      electricFieldLines: null,
      collimatorAndFilters: null,
      alFilterMesh: null,
      cuFilterMesh: null,
      datumGrid: null
    };

    // PBR Physical Materials
    this.materials = {
      glass: null,
      kovarSeal: null,
      cathodeNickel: null,
      ceramicInsulator: null,
      filamentFineEmissive: null,
      filamentBroadEmissive: null,
      spaceCharge: null,
      targetTungsten: null,
      targetGraphiteBack: null,
      focalTrack: null,
      molyStem: null,
      copperRotor: null,
      bearingSteel: null,
      statorHousing: null,
      statorCoil: null,
      collimatorLead: null,
      alFilter: null,
      cuFilter: null,
      fieldLine: null
    };

    this.currentAnodeAngleDeg = 12.0;
    this.rotorAngle = 0.0;
    this.targetRPM = 9600.0;
    this.currentRPM = 0.0;

    this.buildAssembly();
  }

  buildAssembly() {
    this.initMaterials();
    this.buildGlassEnvelope();
    this.buildCathodeAssembly();
    this.buildRotatingAnodeAssembly();
    this.buildStatorWindings();
    this.buildElectricFieldLines();
    this.buildCollimatorAndFilters();
    this.buildDatumFloorGrid();

    // Center the assembly
    this.group.position.set(0, 0, 0);
  }

  initMaterials() {
    // 1. Borosilicate Pyrex Glass with realistic gloss and crystal transparency
    this.materials.glass = new THREE.MeshPhysicalMaterial({
      color: 0xbae6fd, // Soft cyan/blue tint
      transparent: true,
      opacity: 0.22, // High transparency so all internal components are 100% visible!
      roughness: 0.08,
      metalness: 0.05,
      clearcoat: 1.0, // Glossy reflective glass surface
      clearcoatRoughness: 0.06,
      side: THREE.FrontSide, // FrontSide avoids overlapping backface sorting artifacts!
      depthWrite: false
    });

    // 2. Kovar Glass-to-Metal Seal rings (Amber/Brown oxide metal)
    this.materials.kovarSeal = new THREE.MeshStandardMaterial({
      color: 0x78350f,
      roughness: 0.35,
      metalness: 0.85
    });

    // 3. Cathode Focusing Cup (Precision CNC Milled Nickel)
    this.materials.cathodeNickel = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 0.22,
      metalness: 0.92
    });

    // 4. White Porcelain Ceramic Standoff Insulators
    this.materials.ceramicInsulator = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.15,
      metalness: 0.05
    });

    // 5. Filament Incandescent Materials
    this.materials.filamentFineEmissive = new THREE.MeshStandardMaterial({
      color: 0xffaa33,
      emissive: 0xff7700,
      emissiveIntensity: 2.8,
      roughness: 0.25,
      metalness: 0.85
    });

    this.materials.filamentBroadEmissive = new THREE.MeshStandardMaterial({
      color: 0xffaa33,
      emissive: 0xff7700,
      emissiveIntensity: 2.8,
      roughness: 0.25,
      metalness: 0.85
    });

    // 6. Space Charge Cloud (Cyan volumetric haze)
    this.materials.spaceCharge = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false
    });

    // 7. Tungsten-Rhenium Anode Target (Brushed Heavy Metal)
    this.materials.targetTungsten = new THREE.MeshStandardMaterial({
      color: 0xd1d5db,
      roughness: 0.28,
      metalness: 0.94
    });

    // 8. Graphite Heat Sink Backplate
    this.materials.targetGraphiteBack = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.7,
      metalness: 0.3
    });

    // 9. Focal Track Thermal Glow
    this.materials.focalTrack = new THREE.MeshStandardMaterial({
      color: 0x334155,
      emissive: 0xff2200,
      emissiveIntensity: 0.0,
      roughness: 0.35,
      metalness: 0.8
    });

    // 10. Molybdenum Stem (Low Thermal Conductivity)
    this.materials.molyStem = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      roughness: 0.4,
      metalness: 0.88
    });

    // 11. Solid Copper Induction Rotor
    this.materials.copperRotor = new THREE.MeshStandardMaterial({
      color: 0xb45309,
      roughness: 0.2,
      metalness: 0.95
    });

    // 12. Steel Ceramic Bearings
    this.materials.bearingSteel = new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.15,
      metalness: 0.95
    });

    // 13. Stator Housing & Induction Windings
    this.materials.statorHousing = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.55,
      metalness: 0.6
    });

    this.materials.statorCoil = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      roughness: 0.25,
      metalness: 0.9
    });

    // 14. Lead Collimator Housing
    this.materials.collimatorLead = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.6,
      metalness: 0.75
    });

    // 15. Aluminum Filter
    this.materials.alFilter = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.25,
      metalness: 0.85,
      transparent: true,
      opacity: 0.88
    });

    // 16. Copper Filter
    this.materials.cuFilter = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      roughness: 0.2,
      metalness: 0.92,
      transparent: true,
      opacity: 0.88
    });

    // 17. Electric Field Line Material
    this.materials.fieldLine = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending
    });
  }

  buildGlassEnvelope() {
    const envGroup = new THREE.Group();
    envGroup.name = 'GlassEnvelope';

    // Central vacuum chamber (Cylindrical barrel with smooth contoured ends)
    const centralGeom = new THREE.CylinderGeometry(4.3, 4.3, 11.4, 36, 1, true);
    centralGeom.rotateZ(Math.PI / 2);
    const centralMesh = new THREE.Mesh(centralGeom, this.materials.glass);
    envGroup.add(centralMesh);

    // Left neck (Cathode side)
    const leftNeckGeom = new THREE.CylinderGeometry(2.7, 4.3, 6.8, 32, 1, true);
    leftNeckGeom.rotateZ(Math.PI / 2);
    const leftNeckMesh = new THREE.Mesh(leftNeckGeom, this.materials.glass);
    leftNeckMesh.position.set(-9.1, 0, 0);
    envGroup.add(leftNeckMesh);

    // Left hemisphere dome
    const leftCapGeom = new THREE.SphereGeometry(2.7, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    leftCapGeom.rotateZ(Math.PI / 2);
    const leftCapMesh = new THREE.Mesh(leftCapGeom, this.materials.glass);
    leftCapMesh.position.set(-12.5, 0, 0);
    envGroup.add(leftCapMesh);

    // Right neck (Anode Rotor Sleeve)
    const rightNeckGeom = new THREE.CylinderGeometry(3.3, 4.3, 9.5, 32, 1, true);
    rightNeckGeom.rotateZ(-Math.PI / 2);
    const rightNeckMesh = new THREE.Mesh(rightNeckGeom, this.materials.glass);
    rightNeckMesh.position.set(10.4, 0, 0);
    envGroup.add(rightNeckMesh);

    // Right hemisphere dome
    const rightCapGeom = new THREE.SphereGeometry(3.3, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    rightCapGeom.rotateZ(-Math.PI / 2);
    const rightCapMesh = new THREE.Mesh(rightCapGeom, this.materials.glass);
    rightCapMesh.position.set(15.1, 0, 0);
    envGroup.add(rightCapMesh);

    // Kovar Seal Rings (Glass-to-metal vacuum joints)
    const kovarLeftGeom = new THREE.TorusGeometry(2.75, 0.14, 12, 32);
    kovarLeftGeom.rotateY(Math.PI / 2);
    const kovarLeftMesh = new THREE.Mesh(kovarLeftGeom, this.materials.kovarSeal);
    kovarLeftMesh.position.set(-11.5, 0, 0);
    envGroup.add(kovarLeftMesh);

    const kovarRightGeom = new THREE.TorusGeometry(3.35, 0.16, 12, 32);
    kovarRightGeom.rotateY(Math.PI / 2);
    const kovarRightMesh = new THREE.Mesh(kovarRightGeom, this.materials.kovarSeal);
    kovarRightMesh.position.set(14.0, 0, 0);
    envGroup.add(kovarRightMesh);

    // X-Ray Exit Window Collar (Bottom window)
    const winCollarGeom = new THREE.CylinderGeometry(2.0, 2.2, 1.4, 32);
    const winCollarMesh = new THREE.Mesh(winCollarGeom, this.materials.collimatorLead);
    winCollarMesh.position.set(0.6, -4.2, 0);
    envGroup.add(winCollarMesh);

    // Thin Beryllium Output Window Disc
    const beWindowGeom = new THREE.CylinderGeometry(1.9, 1.9, 0.18, 32);
    const beWindowMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.25, metalness: 0.9 });
    const beWindowMesh = new THREE.Mesh(beWindowGeom, beWindowMat);
    beWindowMesh.position.set(0.6, -4.8, 0);
    envGroup.add(beWindowMesh);

    this.group.add(envGroup);
    this.subsystems.glassEnvelope = envGroup;
  }

  buildCathodeAssembly() {
    const cathodeGroup = new THREE.Group();
    cathodeGroup.name = 'CathodeAssembly';
    cathodeGroup.position.set(-5.6, 0, 0);

    // High Voltage Mounting Stem
    const stemGeom = new THREE.CylinderGeometry(1.5, 1.5, 5.2, 24);
    stemGeom.rotateZ(Math.PI / 2);
    const stemMesh = new THREE.Mesh(stemGeom, this.materials.cathodeNickel);
    stemMesh.position.set(-2.6, 0, 0);
    cathodeGroup.add(stemMesh);

    // Ceramic Insulator Standoff Ribs
    for (let i = 0; i < 3; i++) {
      const ringGeom = new THREE.TorusGeometry(1.7, 0.22, 16, 32);
      ringGeom.rotateY(Math.PI / 2);
      const ringMesh = new THREE.Mesh(ringGeom, this.materials.ceramicInsulator);
      ringMesh.position.set(-1.6 - i * 1.25, 0, 0);
      cathodeGroup.add(ringMesh);
    }

    // Machined Nickel Focusing Cup Block
    const cupGeom = new THREE.BoxGeometry(1.9, 2.6, 3.0);
    const cupMesh = new THREE.Mesh(cupGeom, this.materials.cathodeNickel);
    cupMesh.position.set(0.9, 0, 0);
    cathodeGroup.add(cupMesh);

    // Focusing Cavity Recess
    const cavityGeom = new THREE.BoxGeometry(0.9, 1.5, 2.2);
    const cavityMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6, metalness: 0.5 });
    const cavityMesh = new THREE.Mesh(cavityGeom, cavityMat);
    cavityMesh.position.set(1.5, 0, 0);
    cathodeGroup.add(cavityMesh);

    // Dual 3D Helical Tungsten Wire Filaments
    this.subsystems.filamentFine = this.buildCoiledWire(0.12, 1.1, 7, -0.45);
    this.subsystems.filamentBroad = this.buildCoiledWire(0.22, 1.5, 9, 0.45);

    cathodeGroup.add(this.subsystems.filamentFine);
    cathodeGroup.add(this.subsystems.filamentBroad);

    // Space Charge Cloud (Glowing ellipsoid sheath)
    const cloudGeom = new THREE.SphereGeometry(1.15, 24, 18);
    cloudGeom.scale(0.85, 1.3, 1.7);
    const cloudMesh = new THREE.Mesh(cloudGeom, this.materials.spaceCharge);
    cloudMesh.position.set(2.2, 0, 0);
    cathodeGroup.add(cloudMesh);
    this.subsystems.spaceChargeCloud = cloudMesh;

    this.group.add(cathodeGroup);
    this.subsystems.cathodeAssembly = cathodeGroup;
  }

  buildCoiledWire(wireRadius, coilLength, turns, zOffset) {
    const points = [];
    const samples = turns * 22;
    const coilRadius = 0.28;

    for (let i = 0; i <= samples; i++) {
      const u = i / samples;
      const angle = u * Math.PI * 2 * turns;
      const x = 1.35 + u * coilLength;
      const y = Math.sin(angle) * coilRadius;
      const z = zOffset + Math.cos(angle) * coilRadius;
      points.push(new THREE.Vector3(x, y, z));
    }

    const curve = new THREE.CatmullRomCurve3(points);
    const tubeGeom = new THREE.TubeGeometry(curve, 72, wireRadius, 8, false);
    const isFine = zOffset < 0;
    const mat = isFine ? this.materials.filamentFineEmissive : this.materials.filamentBroadEmissive;
    const mesh = new THREE.Mesh(tubeGeom, mat);
    mesh.name = isFine ? 'FilamentFine' : 'FilamentBroad';
    return mesh;
  }

  buildRotatingAnodeAssembly() {
    const anodeGroup = new THREE.Group();
    anodeGroup.name = 'RotatingAnodeAssembly';

    // Rotor subassembly rotates around X-axis
    const rotorGroup = new THREE.Group();
    rotorGroup.name = 'AnodeRotorSubassembly';

    // 1. Compound Target Disc (Tungsten-Rhenium Beveled Track + Graphite Backplate)
    const discOuterRadius = 3.65;
    const discThickness = 1.15;
    const bevelAngleRad = (this.currentAnodeAngleDeg * Math.PI) / 180.0;
    const frontRadius = discOuterRadius;
    const backRadius = discOuterRadius - Math.sin(bevelAngleRad) * discThickness * 1.55;

    // Beveled Tungsten Target Face
    const discGeom = new THREE.CylinderGeometry(frontRadius, backRadius, discThickness, 48);
    discGeom.rotateZ(Math.PI / 2);
    const discMesh = new THREE.Mesh(discGeom, this.materials.targetTungsten);
    discMesh.position.set(2.0, 0, 0);
    rotorGroup.add(discMesh);
    this.subsystems.anodeDisc = discMesh;

    // Graphite Thermal Backplate
    const graphiteGeom = new THREE.CylinderGeometry(backRadius * 0.98, backRadius * 0.92, 0.45, 48);
    graphiteGeom.rotateZ(Math.PI / 2);
    const graphiteMesh = new THREE.Mesh(graphiteGeom, this.materials.targetGraphiteBack);
    graphiteMesh.position.set(2.7, 0, 0);
    rotorGroup.add(graphiteMesh);

    // 2. Focal Track Glow Ring (Thermal impact ring on beveled face)
    const trackRadius = discOuterRadius * 0.88;
    const trackGeom = new THREE.TorusGeometry(trackRadius, 0.18, 16, 48);
    trackGeom.rotateY(Math.PI / 2);
    const trackMesh = new THREE.Mesh(trackGeom, this.materials.focalTrack);
    trackMesh.position.set(1.48, 0, 0);
    rotorGroup.add(trackMesh);
    this.subsystems.focalTrackGlow = trackMesh;

    // Dynamic Point Light at the focal impact spot (radiates blackbody heat inside tube!)
    const focalLight = new THREE.PointLight(0xff6600, 0.0, 10);
    focalLight.position.set(1.5, -0.2, 0);
    rotorGroup.add(focalLight);
    this.subsystems.focalPointLight = focalLight;

    // 3. Molybdenum Stem (High thermal resistance barrier)
    const stemGeom = new THREE.CylinderGeometry(0.38, 0.38, 4.4, 24);
    stemGeom.rotateZ(Math.PI / 2);
    const stemMesh = new THREE.Mesh(stemGeom, this.materials.molyStem);
    stemMesh.position.set(4.8, 0, 0);
    rotorGroup.add(stemMesh);

    // 4. Solid Copper Rotor Sleeve (Induction motor rotor)
    const rotorGeom = new THREE.CylinderGeometry(1.85, 1.85, 6.4, 32);
    rotorGeom.rotateZ(Math.PI / 2);
    const rotorMesh = new THREE.Mesh(rotorGeom, this.materials.copperRotor);
    rotorMesh.position.set(9.8, 0, 0);
    rotorGroup.add(rotorMesh);

    // Longitudinal induction grooves on copper rotor
    for (let k = 0; k < 8; k++) {
      const gAngle = (k / 8) * Math.PI * 2;
      const grooveGeom = new THREE.BoxGeometry(6.2, 0.08, 0.08);
      const grooveMesh = new THREE.Mesh(grooveGeom, this.materials.bearingSteel);
      grooveMesh.position.set(9.8, Math.sin(gAngle) * 1.86, Math.cos(gAngle) * 1.86);
      rotorGroup.add(grooveMesh);
    }

    // High-temperature ceramic/steel ball bearings
    for (let b = 0; b < 2; b++) {
      const bearingGeom = new THREE.CylinderGeometry(1.9, 1.9, 0.6, 28);
      bearingGeom.rotateZ(Math.PI / 2);
      const bearingMesh = new THREE.Mesh(bearingGeom, this.materials.bearingSteel);
      bearingMesh.position.set(7.6 + b * 4.4, 0, 0);
      rotorGroup.add(bearingMesh);
    }

    anodeGroup.add(rotorGroup);
    this.subsystems.anodeRotor = rotorGroup;

    this.group.add(anodeGroup);
    this.subsystems.anodeAssembly = anodeGroup;
  }

  buildStatorWindings() {
    const statorGroup = new THREE.Group();
    statorGroup.name = 'StatorWindings';
    statorGroup.position.set(9.8, 0, 0);

    // Outer Cast Aluminum/Steel Stator Housing Collar
    const housingGeom = new THREE.CylinderGeometry(4.4, 4.4, 6.0, 36, 1, true);
    housingGeom.rotateZ(Math.PI / 2);
    const housingMesh = new THREE.Mesh(housingGeom, this.materials.statorHousing);
    statorGroup.add(housingMesh);

    // Multi-phase Copper Induction Coils
    for (let i = 0; i < 4; i++) {
      const coilGeom = new THREE.TorusGeometry(4.1, 0.28, 16, 36);
      coilGeom.rotateY(Math.PI / 2);
      const coilMesh = new THREE.Mesh(coilGeom, this.materials.statorCoil);
      coilMesh.position.set(-2.1 + i * 1.4, 0, 0);
      statorGroup.add(coilMesh);
    }

    this.group.add(statorGroup);
    this.subsystems.statorWindings = statorGroup;
  }

  buildElectricFieldLines() {
    const fieldGroup = new THREE.Group();
    fieldGroup.name = 'ElectricFieldLines';

    const numLines = 18;
    const startX = -3.8;
    const endX = 1.45;

    for (let i = 0; i < numLines; i++) {
      const angle = (i / numLines) * Math.PI * 2;
      const rCathode = 0.9 + 0.3 * Math.sin(i * 3);
      const rAnode = 2.45;

      const p0 = new THREE.Vector3(startX, Math.sin(angle) * rCathode, Math.cos(angle) * rCathode);
      const p1 = new THREE.Vector3((startX + endX) * 0.45, Math.sin(angle) * (rCathode * 1.35), Math.cos(angle) * (rCathode * 1.35));
      const p2 = new THREE.Vector3((startX + endX) * 0.75, Math.sin(angle) * (rAnode * 0.85), Math.cos(angle) * (rAnode * 0.85));
      const p3 = new THREE.Vector3(endX, Math.sin(angle) * rAnode, Math.cos(angle) * rAnode);

      const curve = new THREE.CubicBezierCurve3(p0, p1, p2, p3);
      const geom = new THREE.BufferGeometry().setFromPoints(curve.getPoints(24));
      const line = new THREE.Line(geom, this.materials.fieldLine);
      fieldGroup.add(line);
    }

    this.group.add(fieldGroup);
    this.subsystems.electricFieldLines = fieldGroup;
  }

  buildCollimatorAndFilters() {
    const colGroup = new THREE.Group();
    colGroup.name = 'CollimatorAndFilters';
    colGroup.position.set(0.6, -5.4, 0);

    // Lead Collimator Shutter Box
    const boxGeom = new THREE.BoxGeometry(4.2, 1.4, 4.2);
    const boxMesh = new THREE.Mesh(boxGeom, this.materials.collimatorLead);
    colGroup.add(boxMesh);

    // Output Aperture Slot
    const apGeom = new THREE.CylinderGeometry(1.25, 1.45, 1.6, 28);
    const apMat = new THREE.MeshBasicMaterial({ color: 0x05080c });
    const apMesh = new THREE.Mesh(apGeom, apMat);
    colGroup.add(apMesh);

    // Aluminum Filter Slab (Scales with alMM)
    const alGeom = new THREE.BoxGeometry(2.8, 0.35, 2.8);
    const alMesh = new THREE.Mesh(alGeom, this.materials.alFilter);
    alMesh.position.set(0, -1.05, 0);
    colGroup.add(alMesh);
    this.subsystems.alFilterMesh = alMesh;

    // Copper Filter Slab (Scales with cuMM)
    const cuGeom = new THREE.BoxGeometry(2.6, 0.18, 2.6);
    const cuMesh = new THREE.Mesh(cuGeom, this.materials.cuFilter);
    cuMesh.position.set(0, -1.45, 0);
    colGroup.add(cuMesh);
    this.subsystems.cuFilterMesh = cuMesh;

    this.group.add(colGroup);
    this.subsystems.collimatorAndFilters = colGroup;
  }

  buildDatumFloorGrid() {
    const gridGroup = new THREE.Group();
    gridGroup.name = 'DatumFloorGrid';
    gridGroup.position.set(0.6, -8.5, 0);

    // Circular crosshair reticle on detector plane
    const ringGeom = new THREE.RingGeometry(0.2, 4.5, 36);
    ringGeom.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x1e293b,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.6
    });
    const ringMesh = new THREE.Mesh(ringGeom, ringMat);
    gridGroup.add(ringMesh);

    // Crosshair axes
    const crossMat = new THREE.LineBasicMaterial({ color: 0x334155, transparent: true, opacity: 0.7 });
    const pX = [new THREE.Vector3(-5, 0, 0), new THREE.Vector3(5, 0, 0)];
    const pZ = [new THREE.Vector3(0, 0, -5), new THREE.Vector3(0, 0, 5)];
    gridGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pX), crossMat));
    gridGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pZ), crossMat));

    this.group.add(gridGroup);
    this.subsystems.datumGrid = gridGroup;
  }

  setAnodeAngle(angleDeg) {
    this.currentAnodeAngleDeg = Math.max(7.0, Math.min(17.0, angleDeg));
    if (this.subsystems.anodeDisc) {
      const discOuterRadius = 3.65;
      const discThickness = 1.15;
      const bevelAngleRad = (this.currentAnodeAngleDeg * Math.PI) / 180.0;
      const frontRadius = discOuterRadius;
      const backRadius = discOuterRadius - Math.sin(bevelAngleRad) * discThickness * 1.55;

      this.subsystems.anodeDisc.geometry.dispose();
      const newGeom = new THREE.CylinderGeometry(frontRadius, backRadius, discThickness, 48);
      newGeom.rotateZ(Math.PI / 2);
      this.subsystems.anodeDisc.geometry = newGeom;
    }
  }

  setFilterThickness(alMM, cuMM) {
    if (this.subsystems.alFilterMesh) {
      if (alMM <= 0.05) {
        this.subsystems.alFilterMesh.visible = false;
      } else {
        this.subsystems.alFilterMesh.visible = true;
        this.subsystems.alFilterMesh.scale.set(1.0, Math.max(0.2, alMM / 2.5), 1.0);
      }
    }
    if (this.subsystems.cuFilterMesh) {
      if (cuMM <= 0.01) {
        this.subsystems.cuFilterMesh.visible = false;
      } else {
        this.subsystems.cuFilterMesh.visible = true;
        this.subsystems.cuFilterMesh.scale.set(1.0, Math.max(0.2, cuMM / 0.1), 1.0);
      }
    }
  }

  setSubsystemVisibility(key, isVisible) {
    if (this.subsystems[key]) {
      this.subsystems[key].visible = isVisible;
    }
  }

  update(state, deltaSec, isExposing) {
    // 1. Anode Rotor Induction Motor Rotation
    if (isExposing) {
      this.currentRPM = Math.min(this.targetRPM, this.currentRPM + 3500.0 * deltaSec);
    } else {
      this.currentRPM = Math.max(0.0, this.currentRPM - 1400.0 * deltaSec);
    }

    const radPerSec = (this.currentRPM * 2 * Math.PI) / 60.0;
    this.rotorAngle += radPerSec * deltaSec;
    if (this.subsystems.anodeRotor) {
      this.subsystems.anodeRotor.rotation.x = this.rotorAngle;
    }

    // 2. Filament Incandescence (Planck Blackbody)
    const filamentRGB = state.cathode ? state.cathode.filamentColor : { r: 1.0, g: 0.7, b: 0.2 };
    const emissiveIntensity = isExposing ? (1.5 + (state.mA / 200.0) * 2.5) : 0.4;
    const isFine = (state.focalSpotKey || 'fine') === 'fine';

    const activeMat = isFine ? this.materials.filamentFineEmissive : this.materials.filamentBroadEmissive;
    const inactiveMat = isFine ? this.materials.filamentBroadEmissive : this.materials.filamentFineEmissive;

    if (activeMat && activeMat.emissive) {
      activeMat.emissive.setRGB(filamentRGB.r, filamentRGB.g, filamentRGB.b);
      activeMat.emissiveIntensity = emissiveIntensity;
    }
    if (inactiveMat && inactiveMat.emissive) {
      inactiveMat.emissive.setRGB(0.5, 0.15, 0.0);
      inactiveMat.emissiveIntensity = 0.2;
    }

    // 3. Space Charge Cloud Pulsation
    if (this.materials.spaceCharge) {
      const baseOpacity = state.cathode ? (state.cathode.spaceChargeCloudDensity * 0.7) : 0.4;
      this.materials.spaceCharge.opacity = Math.max(0.08, baseOpacity + 0.08 * Math.sin(Date.now() * 0.008));
    }

    // 4. Focal Track Thermal Heating & Point Light
    const thermalRatio = (state.anode && state.anode.thermal) ? state.anode.thermal.capacityRatio : 0.0;
    if (this.materials.focalTrack) {
      if (thermalRatio < 0.12) {
        this.materials.focalTrack.emissiveIntensity = 0.0;
        if (this.subsystems.focalPointLight) this.subsystems.focalPointLight.intensity = 0.0;
      } else {
        const glow = Math.min(6.5, (thermalRatio - 0.12) * 7.0);
        this.materials.focalTrack.emissiveIntensity = glow;

        if (thermalRatio < 0.45) {
          this.materials.focalTrack.emissive.setRGB(1.0, 0.15, 0.0); // Dull Red
        } else if (thermalRatio < 0.75) {
          this.materials.focalTrack.emissive.setRGB(1.0, 0.6, 0.1);  // Amber-Orange
        } else {
          this.materials.focalTrack.emissive.setRGB(1.0, 0.95, 0.65); // Incandescent Yellow-White
        }

        if (this.subsystems.focalPointLight) {
          this.subsystems.focalPointLight.intensity = glow * 0.6;
        }
      }
    }
  }

  getCurrentRPM() {
    return Math.round(this.currentRPM);
  }
}
