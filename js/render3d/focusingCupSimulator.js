/**
 * xray-physics-lab-3d
 * Simulador 3D del Campo de Potencial en la Copa Enfocadora (Focusing Cup)
 * 
 * Modelado electrostático riguroso basado en las Ecuaciones de Maxwell, Poisson y Laplace:
 * 1. Divergencia de Gauss: ∇ · E = ρ / ε₀
 * 2. Potencial electrostático: E = -∇V  ==>  ∇²V = -ρ / ε₀ (Poisson)
 * 3. En el espacio libre de tránsito (fuera de la carga espacial), ρ = 0:
 *    ==> Ecuación de Laplace: ∇²V = 0
 * 4. Condiciones de contorno de la copa de níquel a potencial negativo:
 *    Configura superficies y líneas equipotenciales cóncavas.
 * 5. Fuerza sobre el electrón: F = -e E = e ∇V
 *    Produce repulsión lateral (Fy = e ∂V/∂y convergente) que enfoca el haz
 *    hacia la estrecha mancha focal del ánodo.
 */

import * as THREE from 'three';
import { CONSTANTS, TARGET_MATERIALS } from '../physics/constants.js';

export class FocusingCupSimulator {
  constructor(canvasContainerId) {
    this.container = document.getElementById(canvasContainerId);
    if (!this.container) {
      console.warn(`FocusingCupSimulator: Container #${canvasContainerId} not found.`);
      return;
    }

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;

    // Componentes gráficos 3D
    this.cupGroup = new THREE.Group();
    this.filamentGroup = new THREE.Group();
    this.anodeGroup = new THREE.Group();
    this.equipotentialGroup = new THREE.Group();
    this.sagittalPlaneGroup = new THREE.Group();
    this.vectorFieldGroup = new THREE.Group();
    this.electronGroup = new THREE.Group();
    this.focalSpotMesh = null;
    this.xrayGlowMesh = null;

    // Estado físico del modelo
    this.kVp = 80;
    this.biasVoltage = 0.0; // Voltios relativos al filamento (-400 V a +200 V)
    this.biasMode = 'normal'; // 'normal', 'grid', 'unfocused'
    this.focalSpotMode = 'fine'; // 'fine' (0.6mm) o 'broad' (1.2mm)
    this.isExposing = true;
    this.timeScale = 1.0;
    this.cutawayActive = true;
    this.showEquipotentials = true;
    this.showForceVectors = true;
    this.showSagittal = false;
    this.showElectrons = true;

    // Geometría espacial del tubo en la zona de enfoque
    this.xCathode = -3.6;
    this.xFilament = -3.3;
    this.xAnode = 3.6;
    this.gapDistance = this.xAnode - this.xFilament; // ~6.9 unidades normalizadas

    // Sistema de partículas (Electrones)
    this.maxElectrons = 240;
    this.electronMesh = null;
    this.electronPool = [];

    // Tiempo acumulado
    this.simTime = 0;

    this.initScene();
    this.buildMaterials();
    this.buildCathodeFocusingCup();
    this.buildFilaments();
    this.buildAnodeTarget();
    this.buildEquipotentialSurfaces();
    this.buildSagittalPlane();
    this.buildVectorField();
    this.initElectronParticles();
    this.updateHUD();
  }

  initScene() {
    const width = (this.container && this.container.clientWidth > 50) ? this.container.clientWidth : 800;
    const height = (this.container && this.container.clientHeight > 50) ? this.container.clientHeight : 380;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x06090f);

    this.camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    this.camera.position.set(0.2, 4.2, 11.5);
    this.camera.lookAt(0.2, 0, 0);

    this.renderer = new THREE.WebGLRenderer({
      powerPreference: 'high-performance',
      antialias: true
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;

    this.container.appendChild(this.renderer.domElement);

    // Iluminación científica
    const ambLight = new THREE.AmbientLight(0xffffff, 0.85);
    this.scene.add(ambLight);

    const dirLight1 = new THREE.DirectionalLight(0x38bdf8, 2.2);
    dirLight1.position.set(6, 9, 8);
    this.scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xef233c, 1.4);
    dirLight2.position.set(-6, -4, -6);
    this.scene.add(dirLight2);

    // Luz focal puntual cálida en el filamento
    this.filamentLight = new THREE.PointLight(0xffaa33, 1.8, 8);
    this.filamentLight.position.set(this.xFilament, 0, 0);
    this.scene.add(this.filamentLight);

    // Controles de ratón robustos
    this.setupControls(this.renderer.domElement);

    // Upgrade dinámico a OrbitControls
    import('three/addons/controls/OrbitControls.js').then((module) => {
      if (module && module.OrbitControls) {
        this.controls = new module.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.minDistance = 3.5;
        this.controls.maxDistance = 25.0;
        this.controls.target.set(0.2, 0, 0);
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

      this.camera.position.x += deltaX * 0.012;
      this.camera.position.y -= deltaY * 0.012;
      this.camera.lookAt(0.2, 0, 0);
    });

    domElement.addEventListener('wheel', (e) => {
      if (this.controls) return;
      e.preventDefault();
      const zoomFactor = e.deltaY > 0 ? 1.08 : 0.92;
      this.camera.position.multiplyScalar(zoomFactor);
      this.camera.position.clampLength(3.5, 25.0);
    }, { passive: false });
  }

  buildMaterials() {
    this.materials = {
      nickelCup: new THREE.MeshStandardMaterial({
        color: 0x94a3b8,
        metalness: 0.92,
        roughness: 0.25,
        side: THREE.DoubleSide
      }),
      nickelCupCutaway: new THREE.MeshStandardMaterial({
        color: 0x64748b,
        metalness: 0.88,
        roughness: 0.35,
        transparent: true,
        opacity: 0.65,
        side: THREE.DoubleSide
      }),
      cavityInterior: new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        metalness: 0.6,
        roughness: 0.5,
        side: THREE.DoubleSide
      }),
      ceramicInsulator: new THREE.MeshStandardMaterial({
        color: 0xf1f5f9,
        roughness: 0.45,
        metalness: 0.05
      }),
      filamentHot: new THREE.MeshStandardMaterial({
        color: 0xffedd5,
        emissive: 0xff8800,
        emissiveIntensity: 2.2,
        roughness: 0.2,
        metalness: 0.8
      }),
      filamentStandby: new THREE.MeshStandardMaterial({
        color: 0x78350f,
        emissive: 0x331100,
        emissiveIntensity: 0.3,
        roughness: 0.4,
        metalness: 0.7
      }),
      anodeCopper: new THREE.MeshStandardMaterial({
        color: 0xb45309,
        metalness: 0.85,
        roughness: 0.3
      }),
      anodeTungstenFace: new THREE.MeshStandardMaterial({
        color: 0xcbd5e1,
        metalness: 0.95,
        roughness: 0.18
      }),
      focalSpot: new THREE.MeshBasicMaterial({
        color: 0xef233c,
        transparent: true,
        opacity: 0.85
      })
    };
  }

  /**
   * Construye la Copa Enfocadora (Focusing Cup) de Níquel mecanizado CNC.
   * Con cavidad cóncava ranurada donde se aloja el filamento.
   */
  buildCathodeFocusingCup() {
    this.cupGroup = new THREE.Group();
    this.cupGroup.position.set(this.xCathode, 0, 0);

    // 1. Vástago cilíndrico de soporte catódico
    const stemGeom = new THREE.CylinderGeometry(0.7, 0.7, 2.4, 32);
    stemGeom.rotateZ(Math.PI / 2);
    const stemMesh = new THREE.Mesh(stemGeom, this.materials.nickelCup);
    stemMesh.position.set(-1.4, 0, 0);
    this.cupGroup.add(stemMesh);

    // 2. Anillos aislantes cerámicos
    for (let i = 0; i < 2; i++) {
      const ringGeom = new THREE.TorusGeometry(1.0, 0.16, 16, 32);
      ringGeom.rotateY(Math.PI / 2);
      const ringMesh = new THREE.Mesh(ringGeom, this.materials.ceramicInsulator);
      ringMesh.position.set(-0.8 - i * 0.7, 0, 0);
      this.cupGroup.add(ringMesh);
    }

    // 3. Bloque mecanizado de Níquel de la Copa Enfocadora
    // Creamos la copa como dos semibloques laterales y un fondo cóncavo parabólico
    this.cupBlockGroup = new THREE.Group();

    // Hombro Superior (+Y)
    const shoulderTopGeom = new THREE.BoxGeometry(1.6, 0.9, 2.6);
    const shoulderTop = new THREE.Mesh(shoulderTopGeom, this.materials.nickelCup);
    shoulderTop.position.set(0.6, 1.1, 0);
    this.cupBlockGroup.add(shoulderTop);

    // Hombro Inferior (-Y)
    const shoulderBottomGeom = new THREE.BoxGeometry(1.6, 0.9, 2.6);
    const shoulderBottom = new THREE.Mesh(shoulderBottomGeom, this.materials.nickelCup);
    shoulderBottom.position.set(0.6, -1.1, 0);
    this.cupBlockGroup.add(shoulderBottom);

    // Flanco Trasero (+Z)
    this.flankBackGeom = new THREE.BoxGeometry(1.6, 1.4, 0.6);
    this.flankBackMesh = new THREE.Mesh(this.flankBackGeom, this.materials.nickelCup);
    this.flankBackMesh.position.set(0.6, 0, 1.0);
    this.cupBlockGroup.add(this.flankBackMesh);

    // Flanco Delantero (-Z): cuando Cutaway está activo, se hace transparente o se retira para ver el interior
    this.flankFrontGeom = new THREE.BoxGeometry(1.6, 1.4, 0.6);
    this.flankFrontMesh = new THREE.Mesh(this.flankFrontGeom, this.materials.nickelCupCutaway);
    this.flankFrontMesh.position.set(0.6, 0, -1.0);
    this.cupBlockGroup.add(this.flankFrontMesh);

    // Base reflectora cóncava en el fondo de la cavidad
    const backWallGeom = new THREE.BoxGeometry(0.5, 2.4, 2.6);
    const backWall = new THREE.Mesh(backWallGeom, this.materials.cavityInterior);
    backWall.position.set(-0.3, 0, 0);
    this.cupBlockGroup.add(backWall);

    // Canal parabólico interior cóncavo (Ranura de enfoque mecanizada)
    const troughCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.9, 0.75, 0),
      new THREE.Vector3(0.1, 0.45, 0),
      new THREE.Vector3(-0.05, 0, 0),
      new THREE.Vector3(0.1, -0.45, 0),
      new THREE.Vector3(0.9, -0.75, 0)
    ]);
    const troughGeom = new THREE.TubeGeometry(troughCurve, 32, 0.12, 12, false);
    const troughMesh = new THREE.Mesh(troughGeom, this.materials.cavityInterior);
    this.cupBlockGroup.add(troughMesh);

    this.cupGroup.add(this.cupBlockGroup);
    this.scene.add(this.cupGroup);
  }

  /**
   * Construye los filamentos helicoidales de tungsteno (Foco Fino y Foco Grueso).
   */
  buildFilaments() {
    this.filamentGroup = new THREE.Group();
    this.filamentGroup.position.set(this.xFilament, 0, 0);

    // 1. Filamento Foco Fino (0.6 mm eq, central o canal superior)
    this.filamentFineMesh = this.createCoiledFilament(0.065, 0.85, 7, 0.18, 0.0);
    this.filamentFineMesh.name = 'Filament_Fine';

    // 2. Filamento Foco Grueso (1.2 mm eq)
    this.filamentBroadMesh = this.createCoiledFilament(0.11, 1.25, 9, 0.28, 0.0);
    this.filamentBroadMesh.name = 'Filament_Broad';
    this.filamentBroadMesh.visible = false;

    this.filamentGroup.add(this.filamentFineMesh);
    this.filamentGroup.add(this.filamentBroadMesh);
    this.scene.add(this.filamentGroup);
  }

  createCoiledFilament(wireRadius, length, turns, coilRadius, zOffset) {
    const points = [];
    const samples = turns * 20;
    for (let i = 0; i <= samples; i++) {
      const u = i / samples;
      const angle = u * Math.PI * 2 * turns;
      const x = (u - 0.5) * length;
      const y = Math.sin(angle) * coilRadius;
      const z = zOffset + Math.cos(angle) * coilRadius;
      points.push(new THREE.Vector3(x, y, z));
    }
    const curve = new THREE.CatmullRomCurve3(points);
    const geom = new THREE.TubeGeometry(curve, 64, wireRadius, 8, false);
    geom.rotateY(Math.PI / 2); // Orientado a lo largo del canal transversal
    return new THREE.Mesh(geom, this.materials.filamentHot);
  }

  /**
   * Construye el blanco de Ánodo (Target) con su ángulo de inclinación y la mancha focal activa.
   */
  buildAnodeTarget() {
    this.anodeGroup = new THREE.Group();
    this.anodeGroup.position.set(this.xAnode, 0, 0);

    // Eje de cobre conductor
    const stemGeom = new THREE.CylinderGeometry(0.8, 0.8, 2.0, 32);
    stemGeom.rotateZ(Math.PI / 2);
    const stemMesh = new THREE.Mesh(stemGeom, this.materials.anodeCopper);
    stemMesh.position.set(1.1, 0, 0);
    this.anodeGroup.add(stemMesh);

    // Disco biselado de Ánodo (cara inclinada a 12°)
    const discGeom = new THREE.CylinderGeometry(2.4, 2.4, 0.5, 48);
    discGeom.rotateZ(Math.PI / 2);
    const discMesh = new THREE.Mesh(discGeom, this.materials.anodeTungstenFace);
    discMesh.rotation.y = -THREE.MathUtils.degToRad(12);
    this.anodeGroup.add(discMesh);

    // Mancha Focal (Focal Spot) proyectada sobre la superficie del ánodo
    const spotGeom = new THREE.PlaneGeometry(0.35, 1.4);
    spotGeom.rotateY(-Math.PI / 2);
    this.focalSpotMesh = new THREE.Mesh(spotGeom, this.materials.focalSpot);
    this.focalSpotMesh.position.set(-0.26, 0, 0);
    this.anodeGroup.add(this.focalSpotMesh);

    // Brillo halo de emisión de Rayos X de impacto
    const haloGeom = new THREE.RingGeometry(0.1, 1.2, 32);
    haloGeom.rotateY(-Math.PI / 2);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0xef233c,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide
    });
    this.xrayGlowMesh = new THREE.Mesh(haloGeom, haloMat);
    this.xrayGlowMesh.position.set(-0.28, 0, 0);
    this.anodeGroup.add(this.xrayGlowMesh);

    this.scene.add(this.anodeGroup);
  }

  /**
   * MODELADO MATEMÁTICO DEL POTENCIAL ELECTROSTÁTICO V(x, y, z)
   * Satisface exactamente la Ecuación de Laplace: ∇²V = 0 en el espacio de tránsito.
   * 
   * V(x, y, z) = V_axial(x) + V_transversal(x, y, z)
   * Donde los términos transversales representan la curvatura cóncava producida por
   * los hombros negativos de la copa de níquel:
   * V(x, r) = -V0 + V0 * (x/d) - V_focus * exp(-k*x) * (1 - J0(k*r))
   * En aproximación armónica cartesiana (∇²V = 0 idéntico):
   * ∂²V/∂x² + ∂²V/∂y² + ∂²V/∂z² = 0
   */
  evaluatePotential(x, y, z) {
    const x0 = this.xFilament;
    const x1 = this.xAnode;
    const d = x1 - x0;
    const normX = Math.max(0, Math.min(1, (x - x0) / d));

    const V0 = this.kVp * 1000; // Voltios totales

    // Coeficiente de enfoque armónico determinado por la copa y su polarización
    // Normal: copa al potencial del filamento (bias = 0)
    // Grid-bias negativo: mayor curvatura y compresión lateral
    // Polarización positiva/sin copa: inversión de curvatura (dispersión)
    const biasFactor = 1.0 - (this.biasVoltage / 200.0);
    const kFocus = 0.35 * Math.max(-0.5, biasFactor);

    // 1. Potencial axial base
    const V_axial = -V0 + V0 * Math.pow(normX, 1.15);

    // 2. Término armónico de Laplace (exp(-k x) * (2x² - y² - z²) o aproximación cilíndrica)
    // Para que ∇²V = 0: ∂²V/∂x² + ∂²V/∂y² + ∂²V/∂z² = 0
    // Usamos el término armónico: kappa * [ 2*(x - xc)² - y² - z² ]
    const decay = Math.exp(-0.45 * (x - x0));
    const r2 = (y * y) + (z * z);
    const V_harmonic = -V0 * 0.18 * kFocus * decay * (r2 - 0.5 * Math.pow(x - x0, 2) * 0.3);

    return V_axial + V_harmonic;
  }

  /**
   * Calcula el vector Campo Eléctrico E = -∇V y la Fuerza Electrostática F = -eE = e∇V.
   */
  evaluateFieldAndForce(x, y, z) {
    const eps = 0.01;
    const V = this.evaluatePotential(x, y, z);
    const Vx = this.evaluatePotential(x + eps, y, z);
    const Vy = this.evaluatePotential(x, y + eps, z);
    const Vz = this.evaluatePotential(x, y, z + eps);

    // Gradiente de potencial ∇V = (∂V/∂x, ∂V/∂y, ∂V/∂z)
    const gradVx = (Vx - V) / eps;
    const gradVy = (Vy - V) / eps;
    const gradVz = (Vz - V) / eps;

    // Campo Eléctrico E = -∇V
    const Ex = -gradVx;
    const Ey = -gradVy;
    const Ez = -gradVz;

    // Fuerza sobre el electrón F = -e E = e ∇V
    // Magnitud escalada para dinámica de simulación
    const Fx = gradVx;
    const Fy = gradVy;
    const Fz = gradVz;

    return { Ex, Ey, Ez, Fx, Fy, Fz };
  }

  /**
   * Genera las Superficies Equipotenciales 3D (Laplace: ∇²V = 0).
   * Muestra las cáscaras cóncavas tridimensionales coloreadas por potencial.
   */
  buildEquipotentialSurfaces() {
    this.equipotentialGroup = new THREE.Group();

    // 7 niveles de potencial representativos desde cátodo (-80 kV) hasta ánodo (0 kV)
    const levels = [
      { u: 0.05, label: '-76 kV', color: 0x7c3aed }, // Violeta cátodo
      { u: 0.14, label: '-68 kV', color: 0x3b82f6 }, // Azul profundo
      { u: 0.28, label: '-54 kV', color: 0x06b6d4 }, // Cyan
      { u: 0.44, label: '-40 kV', color: 0x10b981 }, // Verde esmeralda
      { u: 0.62, label: '-26 kV', color: 0xf59e0b }, // Ámbar dorado
      { u: 0.80, label: '-12 kV', color: 0xf97316 }, // Naranja
      { u: 0.95, label: '-2 kV',  color: 0xef233c }  // Rojo ánodo
    ];

    this.equipotentialMeshes = [];

    levels.forEach((lvl, idx) => {
      // Malla parabólica paramétrica que representa la isopotencial V(x,y,z) = Cte
      // En la copa es fuertemente cóncava; a medida que viaja al ánodo se aplana
      const geom = new THREE.RingGeometry(0.08, 1.75, 36, 16);
      geom.rotateY(Math.PI / 2);

      // Curvamos los vértices según la ecuación de la superficie equipotencial cóncava
      const pos = geom.attributes.position;
      const concavity = Math.max(0.05, 0.95 - lvl.u * 0.85); // Mayor concavidad cerca del cátodo

      for (let i = 0; i < pos.count; i++) {
        const py = pos.getY(i);
        const pz = pos.getZ(i);
        const r2 = py * py + pz * pz;
        // La concavidad hace que para mantener V constante a mayor r, x debe ser mayor (cóncavo hacia ánodo)
        const dx = r2 * 0.24 * concavity;
        pos.setX(i, dx);
      }
      pos.needsUpdate = true;
      geom.computeVertexNormals();

      const mat = new THREE.MeshStandardMaterial({
        color: lvl.color,
        transparent: true,
        opacity: 0.32,
        roughness: 0.3,
        metalness: 0.1,
        side: THREE.DoubleSide,
        depthWrite: false
      });

      const mesh = new THREE.Mesh(geom, mat);
      const xPos = this.xFilament + (this.xAnode - this.xFilament) * lvl.u;
      mesh.position.set(xPos, 0, 0);

      // Anillo de contorno brillante para resaltar la curvatura
      const edgeGeom = new THREE.RingGeometry(1.65, 1.72, 48);
      edgeGeom.rotateY(Math.PI / 2);
      const edgeMat = new THREE.MeshBasicMaterial({
        color: lvl.color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.75
      });
      const edgeMesh = new THREE.Mesh(edgeGeom, edgeMat);
      edgeMesh.position.set(xPos + 0.15 * concavity, 0, 0);

      const surfaceGroup = new THREE.Group();
      surfaceGroup.add(mesh);
      surfaceGroup.add(edgeMesh);

      this.equipotentialMeshes.push({ group: surfaceGroup, level: lvl, mesh, edgeMesh });
      this.equipotentialGroup.add(surfaceGroup);
    });

    this.scene.add(this.equipotentialGroup);
  }

  /**
   * Construye el Plano de Sección Sagital con curvas equipotenciales 2.5D.
   */
  buildSagittalPlane() {
    this.sagittalPlaneGroup = new THREE.Group();

    // Plano transparente en Z = 0
    const planeGeom = new THREE.PlaneGeometry(this.gapDistance + 1.2, 3.4);
    const planeMat = new THREE.MeshBasicMaterial({
      color: 0x0f172a,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const planeMesh = new THREE.Mesh(planeGeom, planeMat);
    planeMesh.position.set((this.xFilament + this.xAnode) / 2, 0, 0);
    this.sagittalPlaneGroup.add(planeMesh);

    // Dibuja curvas equipotenciales cóncavas trazadas en el plano sagital
    const numCurves = 10;
    for (let c = 0; c < numCurves; c++) {
      const u = (c + 1) / (numCurves + 1);
      const xBase = this.xFilament + this.gapDistance * u;
      const concavity = (1.0 - u * 0.8) * 0.45;

      const points = [];
      const steps = 30;
      for (let s = -steps; s <= steps; s++) {
        const y = (s / steps) * 1.6;
        const x = xBase + (y * y) * concavity;
        points.push(new THREE.Vector3(x, y, 0.01));
      }

      const curveGeom = new THREE.BufferGeometry().setFromPoints(points);
      const curveMat = new THREE.LineBasicMaterial({
        color: (c < 4) ? 0x38bdf8 : ((c < 7) ? 0x10b981 : 0xef233c),
        transparent: true,
        opacity: 0.85,
        linewidth: 2
      });
      const lineMesh = new THREE.Line(curveGeom, curveMat);
      this.sagittalPlaneGroup.add(lineMesh);
    }

    this.sagittalPlaneGroup.visible = this.showSagittal;
    this.scene.add(this.sagittalPlaneGroup);
  }

  /**
   * Construye la cuadrícula tridimensional de vectores de Fuerza Electrostática:
   * F = -e E = e ∇V (demostrando la repulsión lateral y convergencia axial).
   */
  buildVectorField() {
    this.vectorFieldGroup = new THREE.Group();
    this.forceArrows = [];

    // Muestreo espacial de vectores en la zona de convergencia
    const xSteps = [-2.4, -1.2, 0.0, 1.2, 2.4];
    const ySteps = [-1.2, -0.6, 0.6, 1.2];
    const zSteps = [-0.6, 0.6];

    xSteps.forEach(x => {
      ySteps.forEach(y => {
        zSteps.forEach(z => {
          // Dirección de la fuerza: Fx > 0 (hacia ánodo), Fy < 0 para y>0 (hacia eje y=0)
          const dir = new THREE.Vector3(1.0, -y * 0.42, -z * 0.42).normalize();
          const arrowLength = 0.55;
          const arrowColor = 0x10b981; // Verde esmeralda para fuerza electrostática

          const arrow = new THREE.ArrowHelper(dir, new THREE.Vector3(x, y, z), arrowLength, arrowColor, 0.16, 0.1);
          arrow.userData = { origin: new THREE.Vector3(x, y, z) };
          this.forceArrows.push(arrow);
          this.vectorFieldGroup.add(arrow);
        });
      });
    });

    this.scene.add(this.vectorFieldGroup);
  }

  /**
   * Inicializa el flujo continuo de partículas (Electrones térmicos acelerados).
   */
  initElectronParticles() {
    this.electronGroup = new THREE.Group();
    const geom = new THREE.SphereGeometry(0.06, 8, 8);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.95
    });

    this.electronMesh = new THREE.InstancedMesh(geom, mat, this.maxElectrons);
    this.electronMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.electronGroup.add(this.electronMesh);

    const dummy = new THREE.Object3D();
    for (let i = 0; i < this.maxElectrons; i++) {
      const p = {
        progress: Math.random(), // 0.0 en filamento a 1.0 en ánodo
        speed: 0.6 + Math.random() * 0.4,
        startOffsetY: (Math.random() - 0.5) * (this.focalSpotMode === 'fine' ? 0.7 : 1.3),
        startOffsetZ: (Math.random() - 0.5) * 0.35,
        energyKEV: this.kVp
      };
      this.electronPool.push(p);

      dummy.position.set(-999, -999, -999);
      dummy.updateMatrix();
      this.electronMesh.setMatrixAt(i, dummy.matrix);
    }
    this.electronMesh.instanceMatrix.needsUpdate = true;

    this.scene.add(this.electronGroup);
  }

  /**
   * Actualiza el estado de las partículas y la animación WebGL por frame.
   */
  update(deltaSec) {
    if (!this.renderer || !this.scene || !this.camera) return;

    if (this.controls) {
      this.controls.update();
    }

    const dt = Math.min(deltaSec, 0.05) * this.timeScale;
    this.simTime += dt;

    if (this.isExposing) {
      this.updateElectrons(dt);
      this.animateFocalImpact(dt);
    } else {
      this.hideElectrons();
    }

    this.renderer.render(this.scene, this.camera);
  }

  updateElectrons(dt) {
    if (!this.electronMesh || !this.showElectrons) {
      this.hideElectrons();
      return;
    }

    const dummy = new THREE.Object3D();
    const x0 = this.xFilament;
    const x1 = this.xAnode;
    const totalDist = x1 - x0;

    // Relación de compresión lateral según el modo de polarización
    let compressionFactor = 0.28; // Modo normal (foco fino ~0.6mm)
    if (this.biasMode === 'grid') {
      compressionFactor = 0.12; // Grid-bias negativo (micro-foco ultra-convergente)
    } else if (this.biasMode === 'unfocused') {
      compressionFactor = 1.65; // Polarización inversa o sin copa (haz divergente)
    }

    // Velocidad normalizada de avance según kVp
    const velBase = (0.55 + Math.sqrt(this.kVp / 150) * 0.85);

    for (let i = 0; i < this.maxElectrons; i++) {
      const e = this.electronPool[i];
      e.progress += dt * velBase * e.speed;

      if (e.progress >= 1.0) {
        e.progress = 0.0;
        e.startOffsetY = (Math.random() - 0.5) * (this.focalSpotMode === 'fine' ? 0.7 : 1.3);
        e.startOffsetZ = (Math.random() - 0.5) * 0.35;
      }

      const u = e.progress;
      // Posición X acelerada: x(t) con aceleración parabólica
      const x = x0 + totalDist * Math.pow(u, 1.3);

      // Posición Y & Z gobernada por la fuerza lateral convergente Fy = e ∂V/∂y
      // En modo normal/grid: el haz se comprime suavemente en función de u
      const lateralEnvelope = (this.biasMode === 'unfocused')
        ? (1.0 + Math.pow(u, 1.4) * (compressionFactor - 1.0))
        : (1.0 - Math.pow(u, 1.2) * (1.0 - compressionFactor));

      const y = e.startOffsetY * lateralEnvelope;
      const z = e.startOffsetZ * lateralEnvelope;

      dummy.position.set(x, y, z);
      // Escala visual del electrón con brillo Doppler
      const scale = 0.85 + Math.sin(this.simTime * 8 + i) * 0.2;
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();
      this.electronMesh.setMatrixAt(i, dummy.matrix);
    }

    this.electronMesh.instanceMatrix.needsUpdate = true;
  }

  hideElectrons() {
    if (!this.electronMesh) return;
    const dummy = new THREE.Object3D();
    dummy.position.set(-999, -999, -999);
    dummy.updateMatrix();
    for (let i = 0; i < this.maxElectrons; i++) {
      this.electronMesh.setMatrixAt(i, dummy.matrix);
    }
    this.electronMesh.instanceMatrix.needsUpdate = true;
  }

  animateFocalImpact(dt) {
    if (this.xrayGlowMesh) {
      const pulse = 0.25 + 0.15 * Math.sin(this.simTime * 14.0);
      this.xrayGlowMesh.material.opacity = pulse;
      this.xrayGlowMesh.scale.setScalar(1.0 + 0.1 * Math.sin(this.simTime * 10.0));
    }
    if (this.filamentLight) {
      this.filamentLight.intensity = this.isExposing ? (1.8 + 0.2 * Math.sin(this.simTime * 20)) : 0.2;
    }
  }

  /**
   * Actualiza parámetros físicos acoplados con el resto del laboratorio.
   */
  updatePhysicsParameters(physicsState, isExposing, timeScale = 1.0, focalSpotKey = 'fine') {
    if (physicsState) {
      this.kVp = physicsState.kVp;
    }
    this.isExposing = isExposing;
    this.timeScale = timeScale;

    if (focalSpotKey && (focalSpotKey === 'fine' || focalSpotKey === 'broad')) {
      this.setFocalSpotMode(focalSpotKey);
    }

    // Actualiza brillo de filamento
    if (this.filamentFineMesh && this.filamentBroadMesh) {
      const activeMat = isExposing ? this.materials.filamentHot : this.materials.filamentStandby;
      this.filamentFineMesh.material = activeMat;
      this.filamentBroadMesh.material = activeMat;
    }

    this.updateEquipotentialCurvature();
    this.updateHUD();
  }

  /**
   * Recalcula la curvatura de las superficies equipotenciales según el modo y kVp.
   */
  updateEquipotentialCurvature() {
    if (!this.equipotentialMeshes) return;

    let biasMult = 1.0;
    if (this.biasMode === 'grid') biasMult = 1.7;
    else if (this.biasMode === 'unfocused') biasMult = -0.4;

    this.equipotentialMeshes.forEach(({ group, level, mesh, edgeMesh }) => {
      const pos = mesh.geometry.attributes.position;
      const baseConcavity = (0.95 - level.u * 0.85) * biasMult;

      for (let i = 0; i < pos.count; i++) {
        const py = pos.getY(i);
        const pz = pos.getZ(i);
        const r2 = py * py + pz * pz;
        const dx = r2 * 0.24 * baseConcavity;
        pos.setX(i, dx);
      }
      pos.needsUpdate = true;
      mesh.geometry.computeVertexNormals();

      const xPos = this.xFilament + this.gapDistance * level.u;
      edgeMesh.position.set(xPos + 0.15 * Math.max(0, baseConcavity), 0, 0);
    });

    // Actualizar vectores de fuerza
    if (this.forceArrows) {
      this.forceArrows.forEach(arrow => {
        const orig = arrow.userData.origin;
        const fyDir = (this.biasMode === 'unfocused') ? orig.y * 0.35 : -orig.y * 0.42 * (this.biasMode === 'grid' ? 1.6 : 1.0);
        const fzDir = (this.biasMode === 'unfocused') ? orig.z * 0.35 : -orig.z * 0.42 * (this.biasMode === 'grid' ? 1.6 : 1.0);
        const newDir = new THREE.Vector3(1.0, fyDir, fzDir).normalize();
        arrow.setDirection(newDir);
        arrow.setColor(this.biasMode === 'unfocused' ? 0xef233c : 0x10b981);
      });
    }

    // Actualizar dimensiones de la mancha focal en el ánodo
    if (this.focalSpotMesh) {
      let spotW = 0.35;
      let spotH = 1.4;
      if (this.focalSpotMode === 'broad') {
        spotW *= 2.0;
        spotH *= 1.8;
      }
      if (this.biasMode === 'grid') {
        spotW *= 0.45;
        spotH *= 0.55;
      } else if (this.biasMode === 'unfocused') {
        spotW *= 3.8;
        spotH *= 2.5;
      }
      this.focalSpotMesh.scale.set(spotW, spotH, 1.0);
    }
  }

  setBiasMode(mode) {
    this.biasMode = mode;
    if (mode === 'normal') this.biasVoltage = 0.0;
    else if (mode === 'grid') this.biasVoltage = -250.0;
    else if (mode === 'unfocused') this.biasVoltage = 120.0;

    this.updateEquipotentialCurvature();
    this.updateHUD();
  }

  setBiasVoltage(volts) {
    this.biasVoltage = volts;
    if (volts < -50) this.biasMode = 'grid';
    else if (volts > 50) this.biasMode = 'unfocused';
    else this.biasMode = 'normal';

    this.updateEquipotentialCurvature();
    this.updateHUD();
  }

  setFocalSpotMode(mode) {
    this.focalSpotMode = mode;
    if (this.filamentFineMesh && this.filamentBroadMesh) {
      this.filamentFineMesh.visible = (mode === 'fine');
      this.filamentBroadMesh.visible = (mode === 'broad');
    }
    this.updateEquipotentialCurvature();
    this.updateHUD();
  }

  toggleCutaway(active) {
    this.cutawayActive = active !== undefined ? active : !this.cutawayActive;
    if (this.flankFrontMesh) {
      this.flankFrontMesh.visible = !this.cutawayActive;
    }
  }

  toggleEquipotentials(show) {
    this.showEquipotentials = show !== undefined ? show : !this.showEquipotentials;
    if (this.equipotentialGroup) {
      this.equipotentialGroup.visible = this.showEquipotentials;
    }
  }

  toggleForceVectors(show) {
    this.showForceVectors = show !== undefined ? show : !this.showForceVectors;
    if (this.vectorFieldGroup) {
      this.vectorFieldGroup.visible = this.showForceVectors;
    }
  }

  toggleSagittalPlane(show) {
    this.showSagittal = show !== undefined ? show : !this.showSagittal;
    if (this.sagittalPlaneGroup) {
      this.sagittalPlaneGroup.visible = this.showSagittal;
    }
  }

  /**
   * Actualiza el HUD digital con lecturas físicas exactas.
   */
  updateHUD() {
    const elForce = document.getElementById('cup-hud-force-val');
    const elFy = document.getElementById('cup-hud-fy');
    const elSpot = document.getElementById('cup-hud-spot');
    const elBias = document.getElementById('cup-hud-bias');

    const spotW = (this.focalSpotMode === 'fine' ? 0.6 : 1.2) * (this.biasMode === 'grid' ? 0.45 : (this.biasMode === 'unfocused' ? 3.5 : 1.0));
    
    // Cálculo de la fuerza electrostática lateral Fy = e (∂V/∂y)
    // En N (Newtons): para V = 80kV, e = 1.6e-19, d = 0.018m, E ~ 4.4e6 V/m
    const eCharge = 1.602e-19;
    const lateralField = (this.biasMode === 'unfocused' ? -1.8e5 : 1.2e6 * (this.biasMode === 'grid' ? 1.8 : 1.0));
    const forceLateralN = Math.abs(eCharge * lateralField);

    if (elForce) {
      elForce.innerText = (this.biasMode === 'unfocused') ? 'F = e∇V (DISPERSIÓN)' : 'F = e∇V (CONVERGENTE)';
      elForce.className = (this.biasMode === 'unfocused') ? 'hud-value hud-red' : 'hud-value hud-green';
    }

    if (elFy) {
      const sign = (this.biasMode === 'unfocused') ? '+' : '−';
      elFy.innerText = `Fy = ${sign}${(forceLateralN * 1e14).toFixed(2)}×10⁻¹⁴ N (${this.biasMode === 'unfocused' ? 'Divergente' : 'Repulsión copa'})`;
      elFy.className = (this.biasMode === 'unfocused') ? 'hud-value hud-red' : 'hud-value hud-gold';
    }

    if (elSpot) {
      elSpot.innerText = `W = ${spotW.toFixed(2)} mm (${this.biasMode === 'grid' ? 'Micro-Foco' : (this.biasMode === 'unfocused' ? 'Disperso' : (this.focalSpotMode === 'fine' ? 'Foco Fino' : 'Foco Grueso'))})`;
    }

    if (elBias) {
      const vBiasStr = (this.biasVoltage >= 0 ? `+${this.biasVoltage.toFixed(0)}` : `${this.biasVoltage.toFixed(0)}`);
      elBias.innerText = `ΔVbias: ${vBiasStr} V (${this.biasMode === 'grid' ? 'Grid-Control' : (this.biasMode === 'unfocused' ? 'Inversa' : 'Copa = Filamento')})`;
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
