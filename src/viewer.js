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
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);

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
  const slatsGroup = new THREE.Group(); // MOBILE — yellow slat panels
  const gateGroup  = new THREE.Group(); // MOBILE — border frame around slats
  const frameGroup = new THREE.Group(); // FIXED
  const mechGroup  = new THREE.Group(); // FIXED (left + right mechanism)
  const motorGroup = new THREE.Group(); // MOBILE (on gate)
  scene.add(slatsGroup, gateGroup, frameGroup, mechGroup, motorGroup);

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

  // Helper: split a mesh's triangles into two groups and add each to its own scene group
  function splitMeshByColor(meshData, classifyFn) {
    const pos = new Float32Array(meshData.p);
    const nrm = new Float32Array(meshData.n);
    const indices = meshData.i;
    const slatIdx = [], frameIdx = [];
    for (let f = 0; f < indices.length; f += 3) {
      const i0 = indices[f], i1 = indices[f + 1], i2 = indices[f + 2];
      if (classifyFn(pos, i0, i1, i2)) {
        frameIdx.push(i0, i1, i2);   // grey → gateGroup (border frame)
      } else {
        slatIdx.push(i0, i1, i2);    // yellow → slatsGroup
      }
    }
    // Yellow slat faces → slatsGroup
    if (slatIdx.length > 0) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal',   new THREE.BufferAttribute(nrm, 3));
      geo.setIndex(slatIdx);
      const mesh = new THREE.Mesh(geo, mats.gate);
      mesh.castShadow = true; mesh.receiveShadow = true;
      slatsGroup.add(mesh);
      slatsGroup.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), edgeMat));
    }
    // Grey border faces → gateGroup
    if (frameIdx.length > 0) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
      geo.setAttribute('normal',   new THREE.BufferAttribute(new Float32Array(nrm), 3));
      geo.setIndex(frameIdx);
      const mesh = new THREE.Mesh(geo, mats.gateBorder);
      mesh.castShadow = true; mesh.receiveShadow = true;
      gateGroup.add(mesh);
      gateGroup.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), edgeMat));
    }
  }

  // Frame slats: left + top portions are border (grey), rest are slats (yellow)
  {
    const tempGeo = new THREE.BufferGeometry();
    const pos = new Float32Array(MODEL.frame_slats.p);
    tempGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    tempGeo.computeBoundingBox();
    const bb = tempGeo.boundingBox;
    const xLeft = bb.min.x + 300;
    const yTop  = bb.max.y - 200;
    splitMeshByColor(MODEL.frame_slats, (p, i0, i1, i2) => {
      const x0 = p[i0*3], x1 = p[i1*3], x2 = p[i2*3];
      const y0 = p[i0*3+1], y1 = p[i1*3+1], y2 = p[i2*3+1];
      const isLeft = x0 <= xLeft && x1 <= xLeft && x2 <= xLeft;
      const isTop  = y0 >= yTop  && y1 >= yTop  && y2 >= yTop;
      return isLeft || isTop;
    });
  }
  // Frame border: right portion + top portion are slats (yellow), rest is border (grey)
  {
    const tempGeo = new THREE.BufferGeometry();
    const pos = new Float32Array(MODEL.frame_border.p);
    tempGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    tempGeo.computeBoundingBox();
    const bb = tempGeo.boundingBox;
    const xRight = bb.max.x - 400;
    const yTop   = bb.max.y - 200;
    splitMeshByColor(MODEL.frame_border, (p, i0, i1, i2) => {
      const x0 = p[i0*3], x1 = p[i1*3], x2 = p[i2*3];
      const y0 = p[i0*3+1], y1 = p[i1*3+1], y2 = p[i2*3+1];
      const isRight = x0 >= xRight && x1 >= xRight && x2 >= xRight;
      const isTop   = y0 >= yTop   && y1 >= yTop   && y2 >= yTop;
      // returns true → grey/gateGroup, so negate for right + top portions
      return !(isRight || isTop);
    });
  }
  addMeshToGroup(frameGroup, MODEL.gate,         mats.frame);      // diagonal structure = fixed frame
  addMeshToGroup(mechGroup,  MODEL.left_mech,  mats.mech);
  addMeshToGroup(mechGroup,  MODEL.right_mech, mats.mech);
  addMeshToGroup(motorGroup, MODEL.motor,      mats.motor);

  [slatsGroup, gateGroup, frameGroup, mechGroup, motorGroup].forEach(g => {
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
    slatsGroup.position.set(OFF.x * SCALE + xShift, OFF.y * SCALE, OFF.z * SCALE);
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
  const layerMap = { lSlats: slatsGroup, lGate: gateGroup, lFrame: frameGroup, lMech: mechGroup, lMotor: motorGroup };
  Object.entries(layerMap).forEach(([id, group]) => {
    document.getElementById(id).addEventListener('click', function () {
      this.classList.toggle('on');
      group.visible = this.classList.contains('on');
    });
  });

  // ======= INSPECT / PICK MODE =======
  let pickMode = false;
  const raycaster = new THREE.Raycaster();
  const pickMouse = new THREE.Vector2();
  let pickHighlight = null;
  let pickedMesh = null;
  const pickHighlightMat = new THREE.MeshBasicMaterial({
    color: 0xff3333, side: THREE.DoubleSide,
    transparent: true, opacity: 0.65, depthTest: false
  });

  const groupNameMap = new Map([
    [slatsGroup, 'Slats'], [gateGroup, 'Gate'], [frameGroup, 'Frame'],
    [mechGroup, 'Drive Units'], [motorGroup, 'Motor']
  ]);
  const groupByKey = { slats: slatsGroup, gate: gateGroup, frame: frameGroup, mech: mechGroup, motor: motorGroup };

  document.getElementById('btnPick').addEventListener('click', function () {
    pickMode = !pickMode;
    this.classList.toggle('active', pickMode);
    canvas.style.cursor = pickMode ? 'crosshair' : '';
    if (!pickMode) {
      document.getElementById('pickInfo').style.display = 'none';
      if (pickHighlight) { scene.remove(pickHighlight); pickHighlight = null; }
      pickedMesh = null;
    }
  });

  // Track mousedown position to distinguish click from drag
  let pickDownX = 0, pickDownY = 0;
  canvas.addEventListener('mousedown', e => { pickDownX = e.clientX; pickDownY = e.clientY; }, true);

  canvas.addEventListener('click', e => {
    if (!pickMode) return;
    if (Math.abs(e.clientX - pickDownX) > 4 || Math.abs(e.clientY - pickDownY) > 4) return;

    const rect = canvas.getBoundingClientRect();
    pickMouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pickMouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(pickMouse, camera);

    const allMeshes = [];
    [slatsGroup, gateGroup, frameGroup, mechGroup, motorGroup].forEach(g => {
      if (!g.visible) return;
      g.traverse(o => { if (o.isMesh) allMeshes.push(o); });
    });

    const hits = raycaster.intersectObjects(allMeshes);

    // Clear previous highlight
    if (pickHighlight) { scene.remove(pickHighlight); pickHighlight = null; }

    if (hits.length === 0) {
      document.getElementById('pickInfo').style.display = 'none';
      pickedMesh = null;
      return;
    }

    const hit = hits[0];
    const mesh = hit.object;
    const faceIdx = hit.faceIndex;
    pickedMesh = mesh;

    // Determine layer
    let layerName = 'Unknown';
    for (const [group, name] of groupNameMap) {
      if (mesh.parent === group) { layerName = name; break; }
    }

    // Get face vertex positions (in original mm coordinates from geometry)
    const geo = mesh.geometry;
    const posAttr = geo.getAttribute('position');
    const index = geo.getIndex();
    const i0 = index.getX(faceIdx * 3);
    const i1 = index.getX(faceIdx * 3 + 1);
    const i2 = index.getX(faceIdx * 3 + 2);
    const cx = (posAttr.getX(i0) + posAttr.getX(i1) + posAttr.getX(i2)) / 3;
    const cy = (posAttr.getY(i0) + posAttr.getY(i1) + posAttr.getY(i2)) / 3;
    const cz = (posAttr.getZ(i0) + posAttr.getZ(i1) + posAttr.getZ(i2)) / 3;

    // Show info panel
    const panel = document.getElementById('pickInfo');
    panel.style.display = 'block';
    document.getElementById('pickLayer').textContent = layerName;
    document.getElementById('pickFace').textContent = faceIdx;
    document.getElementById('pickX').textContent = cx.toFixed(1);
    document.getElementById('pickY').textContent = cy.toFixed(1);
    document.getElementById('pickZ').textContent = cz.toFixed(1);
    document.getElementById('pickReassign').value = '';

    // Highlight the picked face
    const hlGeo = new THREE.BufferGeometry();
    const hlPos = new Float32Array([
      posAttr.getX(i0), posAttr.getY(i0), posAttr.getZ(i0),
      posAttr.getX(i1), posAttr.getY(i1), posAttr.getZ(i1),
      posAttr.getX(i2), posAttr.getY(i2), posAttr.getZ(i2),
    ]);
    hlGeo.setAttribute('position', new THREE.BufferAttribute(hlPos, 3));
    hlGeo.setIndex([0, 1, 2]);
    pickHighlight = new THREE.Mesh(hlGeo, pickHighlightMat);
    pickHighlight.scale.setScalar(SCALE);
    pickHighlight.position.copy(mesh.parent.position);
    pickHighlight.renderOrder = 999;
    scene.add(pickHighlight);
  });

  // Close button
  document.getElementById('pickClose').addEventListener('click', () => {
    document.getElementById('pickInfo').style.display = 'none';
    if (pickHighlight) { scene.remove(pickHighlight); pickHighlight = null; }
    pickedMesh = null;
  });

  // Reassign: move entire mesh to a different group
  document.getElementById('pickReassign').addEventListener('change', function () {
    if (!this.value || !pickedMesh) return;
    const targetGroup = groupByKey[this.value];
    if (!targetGroup || pickedMesh.parent === targetGroup) return;
    const mesh = pickedMesh;
    const oldGroup = mesh.parent;
    // Move mesh and its edge lines (next sibling) to new group
    const siblings = [...oldGroup.children];
    const idx = siblings.indexOf(mesh);
    oldGroup.remove(mesh);
    targetGroup.add(mesh);
    // Move associated edge lines if they follow the mesh
    if (idx >= 0 && idx < siblings.length - 1 && siblings[idx + 1].isLineSegments) {
      const edges = siblings[idx + 1];
      oldGroup.remove(edges);
      targetGroup.add(edges);
    }
    // Update material to match target group
    if (targetGroup === slatsGroup) mesh.material = mats.gate;
    else if (targetGroup === gateGroup) mesh.material = mats.gateBorder;
    else if (targetGroup === frameGroup) mesh.material = mats.frame;
    else if (targetGroup === mechGroup) mesh.material = mats.mech;
    else if (targetGroup === motorGroup) mesh.material = mats.motor;
    // Update display
    let layerName = 'Unknown';
    for (const [g, n] of groupNameMap) { if (targetGroup === g) { layerName = n; break; } }
    document.getElementById('pickLayer').textContent = layerName;
    this.value = '';
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

  // Viewport controls: zoom, rotate, pan
  const STEP_ROTATE = 0.15;   // radians per click
  const STEP_PAN    = 3;      // scene-units per click
  const ZOOM_FACTOR = 0.8;    // multiply/divide radius

  function holdAction(btn, fn) {
    let timer = null;
    const start = () => { fn(); timer = setInterval(fn, 100); };
    const stop  = () => clearInterval(timer);
    btn.addEventListener('mousedown', start);
    btn.addEventListener('mouseup', stop);
    btn.addEventListener('mouseleave', stop);
    btn.addEventListener('touchstart', e => { e.preventDefault(); start(); }, { passive: false });
    btn.addEventListener('touchend', stop);
    btn.addEventListener('touchcancel', stop);
  }

  holdAction(document.getElementById('vcZoomIn'),  () => { radius = Math.max(5, radius * ZOOM_FACTOR); updateCam(); });
  holdAction(document.getElementById('vcZoomOut'), () => { radius = Math.min(3000, radius / ZOOM_FACTOR); updateCam(); });

  holdAction(document.getElementById('vcRotL'), () => { theta += STEP_ROTATE; updateCam(); });
  holdAction(document.getElementById('vcRotR'), () => { theta -= STEP_ROTATE; updateCam(); });
  holdAction(document.getElementById('vcRotU'), () => { phi = Math.max(0.05, phi - STEP_ROTATE); updateCam(); });
  holdAction(document.getElementById('vcRotD'), () => { phi = Math.min(Math.PI - 0.05, phi + STEP_ROTATE); updateCam(); });

  holdAction(document.getElementById('vcPanL'), () => { panX += STEP_PAN; updateCam(); });
  holdAction(document.getElementById('vcPanR'), () => { panX -= STEP_PAN; updateCam(); });
  holdAction(document.getElementById('vcPanU'), () => { panY += STEP_PAN; updateCam(); });
  holdAction(document.getElementById('vcPanD'), () => { panY -= STEP_PAN; updateCam(); });

  document.getElementById('vcReset').addEventListener('click', () => {
    radius = 180; panX = 0; panY = 0; theta = -0.3; phi = 1.1; updateCam();
  });

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

  // Sidebar: lighting controls
  const LIGHT_DIST = 150; // distance of key light from origin
  function updateKeyLightPos() {
    const az = parseFloat(document.getElementById('rangeLightAzimuth').value) * Math.PI / 180;
    const el = parseFloat(document.getElementById('rangeLightElevation').value) * Math.PI / 180;
    keyLight.position.set(
      LIGHT_DIST * Math.cos(el) * Math.sin(az),
      LIGHT_DIST * Math.sin(el),
      LIGHT_DIST * Math.cos(el) * Math.cos(az)
    );
  }
  document.getElementById('rangeLightIntensity').addEventListener('input', function () {
    const v = this.value / 10;
    keyLight.intensity = v;
    document.getElementById('valLightIntensity').textContent = v.toFixed(1);
  });
  document.getElementById('rangeLightAzimuth').addEventListener('input', function () {
    document.getElementById('valLightAzimuth').textContent = this.value + '°';
    updateKeyLightPos();
  });
  document.getElementById('rangeLightElevation').addEventListener('input', function () {
    document.getElementById('valLightElevation').textContent = this.value + '°';
    updateKeyLightPos();
  });
  document.getElementById('rangeLightAmbient').addEventListener('input', function () {
    const v = this.value / 10;
    ambientLight.intensity = v;
    document.getElementById('valLightAmbient').textContent = v.toFixed(1);
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
