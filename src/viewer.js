import * as THREE from 'three';
import { COLORS, GATE_TRAVEL_MM, PAUSE_DURATION, DEFAULT_SPEED } from './config.js';

// ======= CONSTANTS =======
const SCALE = 1 / 100;
const GATE_TRAVEL = GATE_TRAVEL_MM * SCALE;
const MODEL_CX = -2335.496750014483 * SCALE;
const MODEL_CY = 586.616847699513 * SCALE;
const MODEL_CZ = 1300.0307286626528 * SCALE;

// Centering offset (mm) — applied to group positions as OFF * SCALE
const OFF = {
  x: -MODEL_CX / SCALE,   //  2335.496750014483
  y: -MODEL_CY / SCALE,   //  -586.616847699513
  z: -MODEL_CZ / SCALE,   // -1300.0307286626528
};

// ======= MODULE-LEVEL STATE =======
let gateOffset = 0;
let animPlaying = false;
let animDir = 1;
let animSpeed = DEFAULT_SPEED;
let animMode = 'loop';
let animPhase = 0;    // 0..1 linear progress of current leg
let animPause = 0;    // seconds remaining in endpoint pause

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}
let displayMode = 'shaded';
let theta = -0.3, phi = 1.1, radius = 180;
let panX = 0, panY = 0;
let isDrag = false, isRight = false, lx = 0, ly = 0;
let lt = 0;
let draggingSlider = false;

export function initViewer(MODEL) {

  // ======= THREE.JS SETUP =======
  const canvas = document.getElementById('c');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.background);
  scene.fog = new THREE.FogExp2(COLORS.background, 0.003);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 5000);

  // ======= LIGHTING =======
  scene.add(new THREE.AmbientLight(0xffffff, 0.5));

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.8);
  keyLight.position.set(50, 120, 80);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(4096, 4096);
  keyLight.shadow.camera.near = 1;
  keyLight.shadow.camera.far = 1000;
  keyLight.shadow.camera.left = -200;
  keyLight.shadow.camera.right = 200;
  keyLight.shadow.camera.top = 100;
  keyLight.shadow.camera.bottom = -100;
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0x4060bb, 0.4);
  fillLight.position.set(-60, 30, -40);
  scene.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0xffffee, 0.2);
  rimLight.position.set(0, -20, 100);
  scene.add(rimLight);

  // ======= MATERIALS =======
  const mats = {
    gate:        new THREE.MeshStandardMaterial({ color: COLORS.gateSlats,  metalness: 0.4, roughness: 0.35, side: THREE.DoubleSide }),
    gateBorder:  new THREE.MeshStandardMaterial({ color: COLORS.gateBorder, metalness: 0.5, roughness: 0.3,  side: THREE.DoubleSide }),
    frame:       new THREE.MeshStandardMaterial({ color: COLORS.frame,      metalness: 0.4, roughness: 0.35, side: THREE.DoubleSide }),
    mech:        new THREE.MeshStandardMaterial({ color: COLORS.mech,       metalness: 0.6, roughness: 0.3,  side: THREE.DoubleSide }),
    motor:       new THREE.MeshStandardMaterial({ color: COLORS.motor,      metalness: 0.5, roughness: 0.3,  side: THREE.DoubleSide }),
  };
  const edgeMat = new THREE.LineBasicMaterial({ color: COLORS.edges, transparent: true, opacity: 0.35 });

  // ======= GROUPS =======
  const gateGroup  = new THREE.Group(); // MOBILE
  const frameGroup = new THREE.Group(); // FIXED
  const mechGroup  = new THREE.Group(); // FIXED (left + right mechanism)
  const motorGroup = new THREE.Group(); // MOBILE (on gate)
  scene.add(gateGroup, frameGroup, mechGroup, motorGroup);

  // ======= GEOMETRY BUILDER =======
  function addMeshToGroup(group, meshData, mat) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(meshData.p);
    const nrm = new Float32Array(meshData.n);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal',   new THREE.BufferAttribute(nrm, 3));
    geo.setIndex(meshData.i);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    const eGeo = new THREE.EdgesGeometry(geo, 25);
    const lines = new THREE.LineSegments(eGeo, edgeMat);
    group.add(lines);
  }

  addMeshToGroup(gateGroup,  MODEL.frame_slats,  mats.gate);       // repeating slat panels
  addMeshToGroup(gateGroup,  MODEL.frame_border, mats.gateBorder); // thick outer border
  addMeshToGroup(frameGroup, MODEL.gate,         mats.frame);      // diagonal structure = fixed frame
  addMeshToGroup(mechGroup,  MODEL.left_mech,  mats.mech);
  addMeshToGroup(mechGroup,  MODEL.right_mech, mats.mech);
  addMeshToGroup(motorGroup, MODEL.motor,      mats.motor);

  [gateGroup, frameGroup, mechGroup, motorGroup].forEach(g => {
    g.scale.setScalar(SCALE);
    g.position.set(OFF.x * SCALE, OFF.y * SCALE, OFF.z * SCALE);
  });
  motorGroup.visible = false;

  // ======= GRID & GROUND =======
  const gridHelper = new THREE.GridHelper(400, 40, 0x1a1a2e, 0x12121a);
  gridHelper.position.y = -MODEL_CY; // MODEL_CY is already in scene units
  scene.add(gridHelper);

  const groundGeo = new THREE.PlaneGeometry(400, 200);
  const groundMat = new THREE.ShadowMaterial({ opacity: 0.25 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = gridHelper.position.y;
  ground.receiveShadow = true;
  scene.add(ground);

  // ======= DOM REFS =======
  const track     = document.getElementById('gSliderTrack');
  const thumb     = document.getElementById('gThumb');
  const sliderFill = document.getElementById('gSliderFill');

  // ======= SLIDER UI =======
  function updateSliderUI(t) {
    const tw = track.clientWidth - 12 - 18;
    const px = 6 + t * tw;
    thumb.style.left = px + 'px';
    sliderFill.style.width = (px + 9) + 'px';
  }

  // ======= GATE OFFSET =======
  function setGateOffset(t) {
    t = Math.max(0, Math.min(1, t));
    gateOffset = t;
    const xShift = -t * GATE_TRAVEL;
    gateGroup.position.set(OFF.x * SCALE + xShift, OFF.y * SCALE, OFF.z * SCALE);
    motorGroup.position.set(OFF.x * SCALE + xShift, OFF.y * SCALE, OFF.z * SCALE);

    const xMM = -t * GATE_TRAVEL_MM / 1000; // negative: gate moves left (−x direction)
    const pct = Math.round(t * 100);
    const statusText = t < 0.05 ? 'CLOSED' : t > 0.95 ? 'OPEN' : 'MOVING';

    document.getElementById('hudX').textContent     = xMM.toFixed(2);
    document.getElementById('hudPct').textContent   = pct + '%';
    document.getElementById('sbX').textContent      = xMM.toFixed(2) + ' m';
    document.getElementById('sbPct').textContent    = pct + '%';
    document.getElementById('sbStatus').textContent = statusText;
    document.getElementById('statOpen').textContent = statusText;
    updateSliderUI(t);
  }

  // ======= CAMERA =======
  function updateCam() {
    camera.position.set(
      panX + radius * Math.sin(phi) * Math.sin(theta),
      panY + radius * Math.cos(phi),
      radius * Math.sin(phi) * Math.cos(theta)
    );
    camera.lookAt(panX, panY, 0);
  }

  // ======= RESIZE =======
  function resize() {
    const vp = document.getElementById('vp');
    const w = vp.clientWidth, h = vp.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    updateSliderUI(gateOffset);
  }

  // ======= DISPLAY MODE =======
  function setMode(mode) {
    displayMode = mode;
    ['btnShaded', 'btnWire', 'btnXray'].forEach(id =>
      document.getElementById(id)?.classList.remove('active'));
    document.getElementById({ shaded: 'btnShaded', wire: 'btnWire', xray: 'btnXray' }[mode])?.classList.add('active');
    document.getElementById('hudMode').textContent = { shaded: 'Shaded', wire: 'Wireframe', xray: 'X-Ray' }[mode];
    ['sb1', 'sb2', 'sb3'].forEach(id =>
      document.getElementById(id)?.classList.remove('active'));
    document.getElementById({ shaded: 'sb1', wire: 'sb2', xray: 'sb3' }[mode])?.classList.add('active');

    Object.values(mats).forEach(m => {
      if (mode === 'wire') {
        m.wireframe = true; m.transparent = false; m.opacity = 1;
      } else if (mode === 'xray') {
        m.wireframe = false; m.transparent = true; m.opacity = 0.3; m.depthWrite = false;
      } else {
        m.wireframe = false; m.transparent = false; m.opacity = 1; m.depthWrite = true;
      }
    });
  }

  // ======= EVENT LISTENERS =======

  // Toolbar: display mode
  document.getElementById('btnShaded').addEventListener('click', () => setMode('shaded'));
  document.getElementById('btnWire').addEventListener('click',   () => setMode('wire'));
  document.getElementById('btnXray').addEventListener('click',   () => setMode('xray'));

  // Sidebar: display mode (mirrors toolbar)
  document.getElementById('sb1').addEventListener('click', () => setMode('shaded'));
  document.getElementById('sb2').addEventListener('click', () => setMode('wire'));
  document.getElementById('sb3').addEventListener('click', () => setMode('xray'));

  // Toolbar: views
  document.getElementById('btnFitAll').addEventListener('click', () => {
    radius = 180; panX = 0; panY = 0; theta = -0.3; phi = 1.1; updateCam();
  });
  document.getElementById('btnViewTop').addEventListener('click', () => {
    theta = 0; phi = 0.01; panX = 0; panY = 0; updateCam();
  });
  document.getElementById('btnViewFront').addEventListener('click', () => {
    theta = 0; phi = Math.PI / 2; panX = 0; panY = 0; updateCam();
  });
  document.getElementById('btnViewIso').addEventListener('click', () => {
    theta = -0.3; phi = 1.1; panX = 0; panY = 0; updateCam();
  });

  // Toolbar: toggle helpers
  function setGridVisible(show) {
    gridHelper.visible = show;
    document.getElementById('btnGrid').classList.toggle('active', show);
    const sbGrid = document.getElementById('sbGrid');
    sbGrid.classList.toggle('active', show);
    sbGrid.textContent = show ? 'Visible' : 'Hidden';
  }
  document.getElementById('btnGrid').addEventListener('click', () => setGridVisible(!gridHelper.visible));
  document.getElementById('sbGrid').addEventListener('click', () => setGridVisible(!gridHelper.visible));
  document.getElementById('btnEdges').addEventListener('click', function () {
    const show = !this.classList.contains('active');
    scene.traverse(o => { if (o.isLineSegments) o.visible = show; });
    this.classList.toggle('active', show);
  });
  document.getElementById('btnGround').addEventListener('click', function () {
    ground.visible = !ground.visible;
    this.classList.toggle('active', ground.visible);
  });

  // Play button
  document.getElementById('playBtn').addEventListener('click', function () {
    animPlaying = !animPlaying;
    if (animPlaying) {
      // Set direction based on mode, then derive phase from current gate position
      if (animMode === 'open')  animDir =  1;
      if (animMode === 'close') animDir = -1;
      animPhase = animDir === 1 ? gateOffset : 1 - gateOffset;
      animPause = 0;
    }
    this.textContent = animPlaying ? '⏸ Pause' : '▶ Animate';
    this.classList.toggle('playing', animPlaying);
  });

  // Layer toggles
  const layerMap = { lGate: gateGroup, lFrame: frameGroup, lMech: mechGroup, lMotor: motorGroup };
  Object.entries(layerMap).forEach(([id, group]) => {
    document.getElementById(id).addEventListener('click', function () {
      this.classList.toggle('on');
      group.visible = this.classList.contains('on');
    });
  });

  // Gate slider: drag
  thumb.addEventListener('mousedown', e => { draggingSlider = true; e.stopPropagation(); });
  window.addEventListener('mouseup', () => { draggingSlider = false; });
  window.addEventListener('mousemove', e => {
    if (!draggingSlider) return;
    const rect = track.getBoundingClientRect();
    const t = Math.max(0, Math.min(1, (e.clientX - rect.left - 15) / (rect.width - 30)));
    setGateOffset(t);
  });
  track.addEventListener('click', e => {
    const rect = track.getBoundingClientRect();
    const t = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setGateOffset(t);
  });

  // Camera: mouse
  canvas.addEventListener('mousedown', e => {
    isDrag = true; isRight = e.button === 2; lx = e.clientX; ly = e.clientY;
  });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('mouseup', () => isDrag = false);
  window.addEventListener('mousemove', e => {
    if (!isDrag) return;
    const dx = e.clientX - lx, dy = e.clientY - ly;
    lx = e.clientX; ly = e.clientY;
    if (isRight) {
      panX -= dx * radius * 0.0008; panY += dy * radius * 0.0008;
    } else {
      theta -= dx * 0.007;
      phi = Math.max(0.05, Math.min(Math.PI - 0.05, phi + dy * 0.007));
    }
    updateCam();
  });
  canvas.addEventListener('wheel', e => {
    radius = Math.max(5, Math.min(3000, radius * (1 + e.deltaY * 0.001)));
    updateCam();
  }, { passive: true });

  // Camera: touch
  canvas.addEventListener('touchstart', e => {
    if (e.touches.length === 1) {
      isDrag = true; isRight = false;
      lx = e.touches[0].clientX; ly = e.touches[0].clientY;
    } else if (e.touches.length === 2) {
      lt = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
    }
  });
  canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    if (e.touches.length === 1 && isDrag) {
      const dx = e.touches[0].clientX - lx, dy = e.touches[0].clientY - ly;
      lx = e.touches[0].clientX; ly = e.touches[0].clientY;
      theta -= dx * 0.007;
      phi = Math.max(0.05, Math.min(Math.PI - 0.05, phi + dy * 0.007));
      updateCam();
    } else if (e.touches.length === 2) {
      const d = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      radius = Math.max(5, radius * (lt / d));
      lt = d;
      updateCam();
    }
  }, { passive: false });
  canvas.addEventListener('touchend', () => isDrag = false);

  // Sidebar: color pickers
  document.getElementById('colorGate').addEventListener('input',       e => mats.gate.color.set(e.target.value));
  document.getElementById('colorGateBorder').addEventListener('input', e => mats.gateBorder.color.set(e.target.value));
  document.getElementById('colorFrame').addEventListener('input',      e => mats.frame.color.set(e.target.value));
  document.getElementById('colorMech').addEventListener('input',       e => mats.mech.color.set(e.target.value));
  document.getElementById('colorBg').addEventListener('input',   e => { scene.background = new THREE.Color(e.target.value); });

  // Sidebar: metalness & roughness
  document.getElementById('rangeMetalness').addEventListener('input', function () {
    Object.values(mats).forEach(m => m.metalness = this.value / 100);
    document.getElementById('valMetalness').textContent = this.value;
  });
  document.getElementById('rangeRoughness').addEventListener('input', function () {
    Object.values(mats).forEach(m => m.roughness = this.value / 100);
    document.getElementById('valRoughness').textContent = this.value;
  });

  // Sidebar: animation speed & mode
  document.getElementById('rangeSpeed').addEventListener('input', function () {
    animSpeed = this.value / 10;
    document.getElementById('valSpeed').textContent = this.value;
  });
  document.getElementById('selectAnimMode').addEventListener('change', function () {
    animMode = this.value;
  });

  // ======= INIT =======
  // Set color picker defaults from config
  document.getElementById('colorGate').value       = COLORS.gateSlats;
  document.getElementById('colorGateBorder').value = COLORS.gateBorder;
  document.getElementById('colorFrame').value      = COLORS.frame;
  document.getElementById('colorMech').value       = COLORS.mech;
  document.getElementById('colorBg').value         = COLORS.background;

  resize();
  new ResizeObserver(resize).observe(document.getElementById('vp'));
  setGateOffset(0);
  updateCam();

  // ======= RENDER LOOP =======
  let last = 0;
  function animate(ts) {
    requestAnimationFrame(animate);
    const dt = Math.min((ts - last) / 1000, 0.05);
    last = ts;

    if (animPlaying) {
      if (animPause > 0) {
        // Holding at endpoint — count down then start the return leg
        animPause -= dt;
      } else {
        animPhase = Math.min(1, animPhase + animSpeed * dt * 0.5);
        const eased = easeInOut(animPhase);
        const t = animDir === 1 ? eased : 1 - eased;
        setGateOffset(t);

        if (animPhase >= 1) {
          // Reached end of this leg
          setGateOffset(animDir === 1 ? 1 : 0); // snap exactly to endpoint
          if (animMode === 'loop') {
            animPause = PAUSE_DURATION;
            animDir = -animDir; // reverse for return leg
            animPhase = 0;
          } else {
            animPlaying = false;
            const btn = document.getElementById('playBtn');
            btn.textContent = '▶ Animate'; btn.classList.remove('playing');
          }
        }
      }
    }

    renderer.render(scene, camera);
  }
  animate(0);
}
