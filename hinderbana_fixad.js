// 3D-äventyr med tredjepersonskamera, Fortnite-stil musstyrning: klicka i
// rutan för att låsa muspekaren, rör sedan musen fritt för att vrida
// kameran. Gubbens kropp vrider sig alltid mjukt mot musens/kamerans
// riktning, oavsett om du rör dig eller inte. En knapp låter dig invertera
// den vertikala muskänslan live.
//
// FIX: Hela scriptet är nu inslaget i en async IIFE, se botten av filen.
// Anledningen till felet "Unexpected identifier" var att raden
// `await import('three')` stod direkt på toppnivå. `await` är bara
// tillåtet i en `async`-funktion (eller i en riktig ES-modul), så när
// filen kördes som ett vanligt script kraschade parsern direkt på den
// raden — och det gav i sin tur förvirrande följdfel längre ner.
(async function () {

const THREE = await import('three');

el.style.position = 'relative';
el.style.background = '#8ec6e6';
el.tabIndex = 0;

let width = el.clientWidth || 300;
let height = el.clientHeight || 220;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 200);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(width, height, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
el.appendChild(renderer.domElement);
renderer.domElement.style.touchAction = 'none';
renderer.domElement.style.cursor = 'pointer';

// --- Himmel (gradient-dome) och dis ---
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  uniforms: {
    topColor: { value: new THREE.Color(0x5b95d6) },
    bottomColor: { value: new THREE.Color(0xdbe9f4) },
    offset: { value: 8 }, exponent: { value: 0.6 }
  },
  vertexShader: `varying vec3 vWorldPosition;
    void main() {
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorldPosition = wp.xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: `uniform vec3 topColor; uniform vec3 bottomColor;
    uniform float offset; uniform float exponent;
    varying vec3 vWorldPosition;
    void main() {
      float h = normalize(vWorldPosition + vec3(0.0, offset, 0.0)).y;
      gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
    }`
});
scene.add(new THREE.Mesh(new THREE.SphereGeometry(130, 40, 20), skyMat));
scene.fog = new THREE.Fog(0xcfe6f2, 24, 58);

// --- Ljus ---
scene.add(new THREE.HemisphereLight(0x9fd8ff, 0x315b35, 0.9));
const fillLight = new THREE.DirectionalLight(0xb8d9ff, 0.45);
fillLight.position.set(-8, 7, -10);
scene.add(fillLight);
const sun = new THREE.DirectionalLight(0xfff2dc, 2.0);
sun.position.set(9, 14, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -14; sun.shadow.camera.right = 14;
sun.shadow.camera.top = 14; sun.shadow.camera.bottom = -14;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 40;
sun.shadow.bias = -0.0015;
scene.add(sun);

// --- Gräsmark ---
const FIELD_HALF = 18;
function makeGrassTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#3f7d3f'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 3500; i++) {
    const x = Math.random() * 256, y = Math.random() * 256;
    const v = 30 + Math.random() * 60;
    g.fillStyle = 'rgba(' + (30 + v * 0.3) + ',' + (100 + v) + ',' + (40 + v * 0.3) + ',0.5)';
    g.fillRect(x, y, 1.6, 1.6);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(15, 15);
  return tex;
}
const grassTexture = makeGrassTexture();
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(FIELD_HALF * 2.35, FIELD_HALF * 2.35),
  new THREE.MeshStandardMaterial({
    map: grassTexture,
    roughness: 0.92,
    metalness: 0,
    color: 0x9bcf72
  })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// --- Gubben ---
const player = new THREE.Group();
const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2B5FD9, roughness: 0.7 });
const skinMat = new THREE.MeshStandardMaterial({ color: 0xF2C29B, roughness: 0.8 });
const limbMat = new THREE.MeshStandardMaterial({ color: 0xD9453B, roughness: 0.7 });
const legMat = new THREE.MeshStandardMaterial({ color: 0x1C2B36, roughness: 0.8 });

const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.3), bodyMat);
torso.position.y = 0.75; torso.castShadow = true;
player.add(torso);

const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 16), skinMat);
head.position.y = 1.18; head.castShadow = true;
player.add(head);

const nose = new THREE.Mesh(
  new THREE.ConeGeometry(0.05, 0.14, 8),
  new THREE.MeshStandardMaterial({ color: 0xE8A33D, roughness: 0.6 })
);
nose.rotation.x = Math.PI / 2;
nose.position.set(0, 1.18, 0.24);
nose.castShadow = true;
player.add(nose);

const armGeo = new THREE.BoxGeometry(0.12, 0.45, 0.12);
const armL = new THREE.Mesh(armGeo, limbMat); armL.position.set(-0.32, 0.75, 0); armL.castShadow = true;
const armR = new THREE.Mesh(armGeo, limbMat); armR.position.set(0.32, 0.75, 0); armR.castShadow = true;
player.add(armL, armR);

const legGeo = new THREE.BoxGeometry(0.16, 0.5, 0.16);
const legL = new THREE.Mesh(legGeo, legMat); legL.position.set(-0.14, 0.25, 0); legL.castShadow = true;
const legR = new THREE.Mesh(legGeo, legMat); legR.position.set(0.14, 0.25, 0); legR.castShadow = true;
player.add(legL, legR);

const eyeMat = new THREE.MeshStandardMaterial({ color: 0x17202a, roughness: 0.35 });
const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 10), eyeMat);
const eyeR = eyeL.clone();
eyeL.position.set(-0.08, 1.22, 0.205);
eyeR.position.set(0.08, 1.22, 0.205);
player.add(eyeL, eyeR);

const shoeMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.65 });
const shoeL = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.11, 0.27), shoeMat);
const shoeR = shoeL.clone();
shoeL.position.set(-0.14, 0.06, 0.06);
shoeR.position.set(0.14, 0.06, 0.06);
player.add(shoeL, shoeR);

const backpackMat = new THREE.MeshStandardMaterial({ color: 0x263b63, roughness: 0.8 });
const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.38, 0.14), backpackMat);
backpack.position.set(0, 0.78, -0.19);
backpack.castShadow = true;
player.add(backpack);

player.position.set(0, 0, 4);
scene.add(player);

// --- Hinder: låga hinder går att hoppa upp på ---
const obstacles = [];

function addTree(x, z) {
  const g = new THREE.Group();
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6B4226, roughness: 0.9 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x26734d, roughness: 0.85 });

  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 1.15, 10), trunkMat);
  trunk.position.y = 0.575;
  trunk.castShadow = true;
  trunk.receiveShadow = true;

  const leaves = new THREE.Mesh(new THREE.ConeGeometry(0.78, 1.45, 12), leafMat);
  leaves.position.y = 1.55;
  leaves.castShadow = true;

  g.add(trunk, leaves);
  g.position.set(x, 0, z);
  scene.add(g);

  // Träd är för höga för att hoppa upp på.
  obstacles.push({ x, z, r: 0.58, height: 1.15, climbable: false });
}

function addRock(x, z, scale = 1) {
  const rock = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.5 * scale, 1),
    new THREE.MeshStandardMaterial({ color: 0x77838b, flatShading: true, roughness: 0.9 })
  );
  rock.position.set(x, 0.28 * scale, z);
  rock.rotation.set(Math.random(), Math.random(), Math.random());
  rock.scale.y = 0.7;
  rock.castShadow = true;
  rock.receiveShadow = true;
  scene.add(rock);

  obstacles.push({
    x, z,
    r: 0.48 * scale,
    height: 0.55 * scale,
    climbable: scale <= 1.15
  });
}

function addCrate(x, z, size = 0.8) {
  const crateMat = new THREE.MeshStandardMaterial({ color: 0xB5792E, roughness: 0.72 });
  const crate = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), crateMat);
  crate.position.set(x, size / 2, z);
  crate.castShadow = true;
  crate.receiveShadow = true;

  // En ljus kant gör höjden tydligare visuellt.
  const edgeMat = new THREE.MeshStandardMaterial({ color: 0xD7A64A, roughness: 0.65 });
  const edge = new THREE.Mesh(new THREE.BoxGeometry(size * 1.01, 0.045, size * 1.01), edgeMat);
  edge.position.y = size / 2 + 0.01;
  crate.add(edge);

  scene.add(crate);
  obstacles.push({
    x, z,
    r: size * 0.57,
    height: size,
    climbable: size <= 0.95
  });
}

function addLog(x, z, rotation = 0) {
  const logMat = new THREE.MeshStandardMaterial({ color: 0x80552e, roughness: 0.86 });
  const log = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 1.8, 12), logMat);
  log.rotation.z = Math.PI / 2;
  log.rotation.y = rotation;
  log.position.set(x, 0.28, z);
  log.castShadow = true;
  log.receiveShadow = true;
  scene.add(log);

  obstacles.push({ x, z, r: 0.7, height: 0.56, climbable: true });
}

function addPlatform(x, z, w, d, h = 0.55) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x3f6d50, roughness: 0.82 });
  const platform = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  platform.position.set(x, h / 2, z);
  platform.castShadow = true;
  platform.receiveShadow = true;
  scene.add(platform);

  // En tunn träkant ger plattformen en tydligare siluett.
  const topMat = new THREE.MeshStandardMaterial({ color: 0x76a85b, roughness: 0.78 });
  const top = new THREE.Mesh(new THREE.BoxGeometry(w * 0.98, 0.07, d * 0.98), topMat);
  top.position.y = h / 2 + 0.035;
  platform.add(top);

  obstacles.push({
    x, z,
    r: Math.max(w, d) * 0.52,
    width: w,
    depth: d,
    height: h,
    climbable: h <= 0.8
  });
}

addTree(-4.5, -2.2);
addTree(3.8, -5.2);
addTree(6.2, 5.8);

addRock(-2.4, 3.0, 1.0);
addRock(5.2, 1.2, 0.9);
addRock(-6.1, -0.8, 1.15);
addRock(6.5, -4.8, 0.85);

addCrate(1.0, -3.0, 0.82);
addCrate(-5.0, -5.0, 0.9);
addCrate(2.9, 4.0, 0.75);
addCrate(-1.0, -6.0, 0.65);

addLog(-3.7, -5.0, 0.25);
addLog(4.6, -1.8, -0.35);

addPlatform(0.8, 0.0, 1.8, 1.25, 0.62);
addPlatform(-4.0, 5.0, 1.6, 1.2, 0.7);


function addBush(x, z, scale = 1) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x3d8a4f, roughness: 0.88 });
  const a = new THREE.Mesh(new THREE.SphereGeometry(0.48 * scale, 10, 8), mat);
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.38 * scale, 10, 8), mat);
  const c = new THREE.Mesh(new THREE.SphereGeometry(0.42 * scale, 10, 8), mat);
  a.position.set(-0.3 * scale, 0.38 * scale, 0);
  b.position.set(0.25 * scale, 0.34 * scale, 0.08 * scale);
  c.position.set(0, 0.52 * scale, -0.12 * scale);
  g.add(a, b, c);
  g.position.set(x, 0, z);
  g.castShadow = true;
  scene.add(g);
}

function addFence(x, z, length = 2.8, rotation = 0) {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x8d6237, roughness: 0.9 });
  const postGeo = new THREE.BoxGeometry(0.13, 0.9, 0.13);
  const railGeo = new THREE.BoxGeometry(length, 0.12, 0.12);

  for (const px of [-length / 2, 0, length / 2]) {
    const post = new THREE.Mesh(postGeo, wood);
    post.position.set(px, 0.45, 0);
    post.castShadow = true;
    g.add(post);
  }
  const rail1 = new THREE.Mesh(railGeo, wood);
  rail1.position.y = 0.58;
  const rail2 = new THREE.Mesh(railGeo, wood);
  rail2.position.y = 0.28;
  rail1.castShadow = rail2.castShadow = true;
  g.add(rail1, rail2);

  g.position.set(x, 0, z);
  g.rotation.y = rotation;
  scene.add(g);
}

function addSteppingStones(points) {
  points.forEach(([x, z, s]) => addRock(x, z, s || 0.65));
}

// En större, varierad bana med tydliga landmärken.
addPlatform(9.5, 7.0, 2.4, 2.0, 0.72);
addPlatform(12.5, 9.2, 2.0, 1.7, 0.58);
addPlatform(15.0, 6.8, 2.6, 2.2, 0.76);

addPlatform(-10.0, 7.0, 2.5, 1.9, 0.68);
addPlatform(-13.0, 4.4, 2.0, 1.6, 0.55);
addPlatform(-15.0, 1.0, 2.7, 2.1, 0.74);

addLog(8.0, -8.0, 0.25);
addLog(11.0, -5.8, -0.55);
addLog(-9.0, -8.2, -0.35);
addLog(-13.0, -7.0, 0.2);

addCrate(6.5, 2.8, 0.85);
addCrate(8.0, 3.8, 0.65);
addCrate(-7.0, 2.5, 0.8);
addCrate(-8.2, 1.3, 0.65);
addCrate(3.5, 10.0, 0.72);
addCrate(-4.0, 10.5, 0.78);

addSteppingStones([
  [5.0, 7.5, 0.65], [6.4, 8.7, 0.7], [7.8, 9.8, 0.62],
  [-5.0, 7.2, 0.62], [-6.5, 8.5, 0.72], [-8.0, 9.6, 0.65],
  [4.5, -10.0, 0.7], [6.0, -11.0, 0.62],
  [-5.0, -10.2, 0.68], [-6.7, -11.3, 0.62]
]);

[
  [-10, -3, 1.1], [-7, -5, 0.9], [10, 1, 1.0], [13, -2, 0.85],
  [4, 13, 1.15], [-4, 14, 1.0], [15, -5, 1.05], [-15, -5, 0.9]
].forEach(([x, z, s]) => addBush(x, z, s));

addFence(11, 12.2, 3.2, 0.15);
addFence(-11, 11.8, 3.0, -0.1);
addFence(13, -10.5, 3.4, Math.PI / 2);
addFence(-13, -10.0, 3.0, Math.PI / 2);

// --- Mynt ---
const coinGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.07, 20);
const coinMat = new THREE.MeshStandardMaterial({ color: 0xF2C438, metalness: 0.75, roughness: 0.3, emissive: 0x664400, emissiveIntensity: 0.25 });
const coinPositions = [
  [2, -1], [-3, 1.5], [4, 3], [-1, -4], [0, 5],
  [6, -3], [-6, 2], [3.5, -0.5], [-4, -3.5], [0.5, 2.5],
  [0.8, 0.0], [2.9, 4.0], [-4.0, 5.0],
  [9.5, 7.0], [12.5, 9.2], [15.0, 6.8],
  [-10.0, 7.0], [-13.0, 4.4], [-15.0, 1.0],
  [8.0, -8.0], [11.0, -5.8], [-9.0, -8.2], [-13.0, -7.0],
  [3.5, 10.0], [-4.0, 10.5], [4.0, 13.0], [-4.0, 14.0],
  [15.0, -5.0], [-15.0, -5.0]
];
const coins = coinPositions.map(([x, z]) => {
  const mesh = new THREE.Mesh(coinGeo, coinMat.clone());
  mesh.rotation.x = Math.PI / 2;
  mesh.position.set(x, 0.62, z);
  mesh.castShadow = true;
  scene.add(mesh);
  return { mesh, x, z, taken: false };
});

// --- Gräs (instansierat) ---
function isBlocked(x, z, margin) {
  for (const o of obstacles) if (Math.hypot(x - o.x, z - o.z) < o.r + margin) return true;
  for (const c of coinPositions) if (Math.hypot(x - c[0], z - c[1]) < 0.6 + margin) return true;
  return false;
}
const GRASS_COUNT = 1200;
const bladeGeo = new THREE.ConeGeometry(0.025, 0.32, 3);
bladeGeo.translate(0, 0.16, 0);
const bladeMat = new THREE.MeshStandardMaterial({ color: 0x4CAF50, roughness: 0.9, flatShading: true });
const grassMesh = new THREE.InstancedMesh(bladeGeo, bladeMat, GRASS_COUNT);
const dummy = new THREE.Object3D();
const tmpColor = new THREE.Color();
let placed = 0, attempts = 0;
while (placed < GRASS_COUNT && attempts < GRASS_COUNT * 8) {
  attempts++;
  const x = (Math.random() * 2 - 1) * (FIELD_HALF - 0.4);
  const z = (Math.random() * 2 - 1) * (FIELD_HALF - 0.4);
  if (isBlocked(x, z, 0.3)) continue;
  dummy.position.set(x, 0, z);
  dummy.rotation.y = Math.random() * Math.PI * 2;
  const s = 0.7 + Math.random() * 0.8;
  dummy.scale.set(s, s * (0.8 + Math.random() * 0.6), s);
  dummy.updateMatrix();
  grassMesh.setMatrixAt(placed, dummy.matrix);
  tmpColor.setHSL(0.30 + Math.random() * 0.06, 0.5 + Math.random() * 0.2, 0.28 + Math.random() * 0.15);
  grassMesh.setColorAt(placed, tmpColor);
  placed++;
}
grassMesh.count = placed;
grassMesh.instanceMatrix.needsUpdate = true;
if (grassMesh.instanceColor) grassMesh.instanceColor.needsUpdate = true;
scene.add(grassMesh);

// --- Kamera ---
let camYaw = 0, camPitch = 0.58, camDistance = 7;
const MIN_PITCH = 0.1, MAX_PITCH = 1.4, MIN_DIST = 3, MAX_DIST = 16;
const followPos = player.position.clone();
const UP = new THREE.Vector3(0, 1, 0);

function updateCamera(dt) {
  followPos.lerp(player.position, Math.min(1, dt * 8));
  const cosP = Math.cos(camPitch), sinP = Math.sin(camPitch);
  const camX = followPos.x - Math.sin(camYaw) * camDistance * cosP;
  const camZ = followPos.z - Math.cos(camYaw) * camDistance * cosP;
  const camY = followPos.y + 1.1 + camDistance * sinP;
  camera.position.set(camX, camY, camZ);
  camera.lookAt(followPos.x, followPos.y + 1.0, followPos.z);
}

// --- Musstyrning (Fortnite-stil) ---
let pitchDir = 1;
const MOUSE_SENS = 0.0028;
let pointerLocked = false;
let mouseLockFailed = false;
const pointerLockSupported = 'pointerLockElement' in document || 'exitPointerLock' in document;

const lockHint = document.createElement('div');
lockHint.textContent = '🖱️ Klicka för musstyrning';
lockHint.style.cssText = 'position:absolute; inset:0; display:flex; align-items:center; justify-content:center; background:rgba(15,23,32,0.35); color:#fff; font:700 14px "Space Grotesk", sans-serif; z-index:5; pointer-events:none; text-shadow:0 1px 4px rgba(0,0,0,0.6);';
el.appendChild(lockHint);

function requestMouseLock() {
  if (!pointerLockSupported || mouseLockFailed) return;
  const result = renderer.domElement.requestPointerLock();
  if (result && typeof result.catch === 'function') {
    result.catch(() => { mouseLockFailed = true; lockHint.style.display = 'none'; });
  }
}

document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === renderer.domElement;
  lockHint.style.display = pointerLocked ? 'none' : 'flex';
  lockHint.textContent = pointerLocked ? '' : '🖱️ Klicka för musstyrning';
});
document.addEventListener('pointerlockerror', () => {
  mouseLockFailed = true;
  lockHint.style.display = 'none';
});

renderer.domElement.addEventListener('click', () => {
  if (!pointerLocked && !mouseLockFailed) requestMouseLock();
});

document.addEventListener('mousemove', (e) => {
  if (!pointerLocked) return;
  camYaw -= e.movementX * MOUSE_SENS * 2.3;
  camPitch = THREE.MathUtils.clamp(camPitch + pitchDir * e.movementY * MOUSE_SENS * 2.3, MIN_PITCH, MAX_PITCH);
});

// Pekskärm: drag för att vrida, nyp för att zooma.
const activePointers = {};
let isDragging = false, lastX = 0, lastY = 0;
let pinchStartDist = null, pinchStartCam = null;

renderer.domElement.addEventListener('pointerdown', (e) => {
  el.focus();
  const useDrag = e.pointerType === 'touch' || (mouseLockFailed && e.pointerType === 'mouse');
  if (!useDrag) return;
  activePointers[e.pointerId] = { x: e.clientX, y: e.clientY };
  renderer.domElement.setPointerCapture(e.pointerId);
  const keys = Object.keys(activePointers);
  if (keys.length === 1) { isDragging = true; lastX = e.clientX; lastY = e.clientY; }
  else if (keys.length === 2) {
    isDragging = false;
    const pts = keys.map(k => activePointers[k]);
    pinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    pinchStartCam = camDistance;
  }
});
renderer.domElement.addEventListener('pointermove', (e) => {
  if (!(e.pointerId in activePointers)) return;
  activePointers[e.pointerId] = { x: e.clientX, y: e.clientY };
  const keys = Object.keys(activePointers);
  if (keys.length === 2 && pinchStartDist) {
    const pts = keys.map(k => activePointers[k]);
    const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    camDistance = THREE.MathUtils.clamp(pinchStartCam * (pinchStartDist / dist), MIN_DIST, MAX_DIST);
    return;
  }
  if (isDragging && keys.length === 1) {
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    camYaw -= dx * 0.006;
    camPitch = THREE.MathUtils.clamp(camPitch + pitchDir * dy * 0.006, MIN_PITCH, MAX_PITCH);
  }
});
function endPointer(e) {
  delete activePointers[e.pointerId];
  const keys = Object.keys(activePointers);
  pinchStartDist = keys.length < 2 ? null : pinchStartDist;
  if (keys.length === 0) isDragging = false;
  else if (keys.length === 1) { isDragging = true; lastX = activePointers[keys[0]].x; lastY = activePointers[keys[0]].y; }
}
renderer.domElement.addEventListener('pointerup', endPointer);
renderer.domElement.addEventListener('pointercancel', endPointer);
renderer.domElement.addEventListener('wheel', (e) => {
  e.preventDefault();
  camDistance = THREE.MathUtils.clamp(camDistance + e.deltaY * 0.003, MIN_DIST, MAX_DIST);
}, { passive: false });

// --- Rörelse + hopp (kamera-relativ) ---
const move = { up: false, down: false, left: false, right: false };
const GRAVITY = -24, JUMP_VELOCITY = 8, PLAYER_SPEED = 3.2, PLAYER_RADIUS = 0.32;
let velY = 0, grounded = true;

function tryJump() { if (grounded) { velY = JUMP_VELOCITY; grounded = false; } }

function keyDown(e) {
  const k = e.key.toLowerCase();
  if (k === 'w' || k === 'arrowup') move.up = true;
  else if (k === 's' || k === 'arrowdown') move.down = true;
  else if (k === 'a' || k === 'arrowleft') move.left = true;
  else if (k === 'd' || k === 'arrowright') move.right = true;
  else if (k === ' ') { e.preventDefault(); tryJump(); }
}
function keyUp(e) {
  const k = e.key.toLowerCase();
  if (k === 'w' || k === 'arrowup') move.up = false;
  else if (k === 's' || k === 'arrowdown') move.down = false;
  else if (k === 'a' || k === 'arrowleft') move.left = false;
  else if (k === 'd' || k === 'arrowright') move.right = false;
}
window.addEventListener('keydown', keyDown);
window.addEventListener('keyup', keyUp);

// --- Skärmkontroller ---
const dpad = document.createElement('div');
dpad.style.cssText = 'position:absolute; bottom:14px; left:14px; display:grid; grid-template-columns:repeat(3,40px); grid-template-rows:repeat(3,40px); gap:3px; z-index:3;';
function dBtn(label) {
  const b = document.createElement('div');
  b.textContent = label;
  b.style.cssText = 'background:rgba(28,43,54,0.8); border:1px solid #45596A; border-radius:8px; color:#DCE6EC; display:flex; align-items:center; justify-content:center; font:700 16px sans-serif; touch-action:none; user-select:none;';
  return b;
}
const bUp = dBtn('▲'); bUp.style.gridRow = '1'; bUp.style.gridColumn = '2';
const bDown = dBtn('▼'); bDown.style.gridRow = '3'; bDown.style.gridColumn = '2';
const bLeft = dBtn('◀'); bLeft.style.gridRow = '2'; bLeft.style.gridColumn = '1';
const bRight = dBtn('▶'); bRight.style.gridRow = '2'; bRight.style.gridColumn = '3';
[bUp, bDown, bLeft, bRight].forEach(b => dpad.appendChild(b));
el.appendChild(dpad);

const jumpBtn = document.createElement('div');
jumpBtn.textContent = '⤒';
jumpBtn.style.cssText = 'position:absolute; bottom:20px; right:20px; width:58px; height:58px; border-radius:50%; background:rgba(232,163,61,0.85); border:1px solid #C6842A; color:#0F1720; display:flex; align-items:center; justify-content:center; font:700 22px sans-serif; touch-action:none; user-select:none; z-index:3;';
el.appendChild(jumpBtn);

function bindHold(btn, onDown, onUp) {
  btn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); onDown(); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => btn.addEventListener(ev, (e) => { e.stopPropagation(); onUp(); }));
}
bindHold(bUp, () => move.up = true, () => move.up = false);
bindHold(bDown, () => move.down = true, () => move.down = false);
bindHold(bLeft, () => move.left = true, () => move.left = false);
bindHold(bRight, () => move.right = true, () => move.right = false);
jumpBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); tryJump(); });

// --- HUD, hint, invertera-knapp och vinstskärm ---
const hud = document.createElement('div');
hud.style.cssText = 'position:absolute; top:8px; left:8px; z-index:3; background:rgba(28,43,54,0.8); border:1px solid #45596A; border-radius:6px; padding:5px 10px; color:#DCE6EC; font:600 12px monospace;';
el.appendChild(hud);

const hint = document.createElement('div');
hint.textContent = 'Musen: kamera · WASD: gå · Mellanslag: hoppa · Hoppa upp på låga lådor, stockar och plattformar';
hint.style.cssText = 'position:absolute; top:8px; left:50%; transform:translateX(-50%); z-index:3; background:rgba(28,43,54,0.7); border:1px solid #45596A; border-radius:6px; padding:4px 9px; color:#9fb3c2; font:500 10px monospace; white-space:nowrap;';
el.appendChild(hint);

const headerBtns = document.createElement('div');
headerBtns.style.cssText = 'position:absolute; top:8px; right:8px; z-index:3; display:flex; gap:6px;';
const invertBtn = document.createElement('button');
invertBtn.textContent = '🔃 Invertera mus';
invertBtn.style.cssText = 'background:rgba(28,43,54,0.85); color:#DCE6EC; border:1px solid #45596A; border-radius:6px; padding:5px 9px; font:600 11px sans-serif; cursor:pointer;';
invertBtn.addEventListener('click', () => {
  pitchDir *= -1;
  invertBtn.style.background = pitchDir === -1 ? 'rgba(232,163,61,0.85)' : 'rgba(28,43,54,0.85)';
  invertBtn.style.color = pitchDir === -1 ? '#0F1720' : '#DCE6EC';
});
const restartBtn = document.createElement('button');
restartBtn.textContent = '⟲ Börja om';
restartBtn.style.cssText = 'background:rgba(28,43,54,0.85); color:#DCE6EC; border:1px solid #45596A; border-radius:6px; padding:5px 9px; font:600 11px sans-serif; cursor:pointer;';
headerBtns.appendChild(invertBtn); headerBtns.appendChild(restartBtn);
el.appendChild(headerBtns);

const messageBox = document.createElement('div');
messageBox.style.cssText = 'position:absolute; inset:0; display:none; align-items:center; justify-content:center; flex-direction:column; gap:10px; background:rgba(15,23,32,0.75); z-index:4; text-align:center; padding:16px;';
el.appendChild(messageBox);

let coinsGot = 0;
function updateHud() { hud.textContent = '🪙 ' + coinsGot + '/' + coins.length; }
function showWin() {
  messageBox.innerHTML = '';
  const t = document.createElement('div');
  t.textContent = '🏆 Bra jobbat!';
  t.style.cssText = 'color:#E8A33D; font:700 22px "Space Grotesk", sans-serif;';
  const s = document.createElement('div');
  s.textContent = 'Du samlade alla ' + coins.length + ' mynt.';
  s.style.cssText = 'color:#DCE6EC; font:500 13px monospace;';
  const btn = document.createElement('button');
  btn.textContent = '⟲ Spela igen';
  btn.style.cssText = 'background:#E8A33D; color:#0F1720; border:none; border-radius:8px; padding:9px 16px; font:700 13px sans-serif; cursor:pointer;';
  btn.addEventListener('click', resetGame);
  messageBox.appendChild(t); messageBox.appendChild(s); messageBox.appendChild(btn);
  messageBox.style.display = 'flex';
}
function resetGame() {
  player.position.set(0, 0, 4);
  player.scale.set(1, 1, 1);
  velY = 0; grounded = true;
  coins.forEach((c) => { c.taken = false; c.mesh.visible = true; });
  coinsGot = 0;
  updateHud();
  messageBox.style.display = 'none';
}
restartBtn.addEventListener('click', resetGame);
updateHud();

console.log('Klart! Klicka i rutan för musstyrning - gubben vrider sig mot musens riktning automatiskt.');

// --- Kollision & rörelse ---
function obstacleContains(o, x, z) {
  if (o.width && o.depth) {
    return Math.abs(x - o.x) < o.width / 2 + PLAYER_RADIUS &&
           Math.abs(z - o.z) < o.depth / 2 + PLAYER_RADIUS;
  }
  return Math.hypot(x - o.x, z - o.z) < o.r + PLAYER_RADIUS;
}

function collides(x, z) {
  for (const o of obstacles) {
    if (!obstacleContains(o, x, z)) continue;

    // När spelaren står på ett klätterbart hinder får han fortsätta gå där.
    if (o.climbable && player.position.y >= o.height - 0.12) continue;

    // Ett hopp kan passera över ett lågt hinder.
    if (o.climbable && player.position.y > o.height + 0.18) continue;

    return true;
  }
  return false;
}

function tryMove(dx, dz) {
  const nx = THREE.MathUtils.clamp(
    player.position.x + dx,
    -FIELD_HALF + PLAYER_RADIUS,
    FIELD_HALF - PLAYER_RADIUS
  );
  const nz = THREE.MathUtils.clamp(
    player.position.z + dz,
    -FIELD_HALF + PLAYER_RADIUS,
    FIELD_HALF - PLAYER_RADIUS
  );

  if (!collides(nx, player.position.z)) player.position.x = nx;
  if (!collides(player.position.x, nz)) player.position.z = nz;
}

function getLandingHeight() {
  let landing = 0;

  for (const o of obstacles) {
    if (!o.climbable || !obstacleContains(o, player.position.x, player.position.z)) continue;
    if (o.height > landing && o.height <= 0.82) landing = o.height;
  }

  return landing;
}

// Kortaste vägen mellan två vinklar, så vridningen aldrig "snurrar fel väg
// runt" när musen passerar 180°.
function lerpAngle(a, b, t) {
  const diff = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return a + diff * t;
}

// --- Spelloop ---
let walkPhase = 0;
let lastT = performance.now();

function loop(now) {
  el._rafId = requestAnimationFrame(loop);
  const dt = Math.min((now - lastT) / 1000, 0.05);
  lastT = now;

  const forward = new THREE.Vector3(Math.sin(camYaw), 0, Math.cos(camYaw));
  const right = new THREE.Vector3().crossVectors(forward, UP);

  const dir = new THREE.Vector3();
  if (move.up) dir.add(forward);
  if (move.down) dir.sub(forward);
  if (move.right) dir.add(right);
  if (move.left) dir.sub(right);
  const moving = dir.lengthSq() > 0;
  if (moving) {
    dir.normalize();
    tryMove(dir.x * PLAYER_SPEED * dt, dir.z * PLAYER_SPEED * dt);
  }

  // Gubben vrider sig alltid mjukt mot kamerans/musens riktning, oavsett
  // om han rör sig eller står stilla - ingen koppling till piltangenterna.
  player.rotation.y = lerpAngle(player.rotation.y, camYaw, Math.min(1, dt * 12));

  velY += GRAVITY * dt;
  const previousY = player.position.y;
  player.position.y += velY * dt;

  const landingHeight = getLandingHeight();
  if (velY <= 0 && previousY >= landingHeight && player.position.y <= landingHeight) {
    player.position.y = landingHeight;
    velY = 0;
    grounded = true;
  } else if (player.position.y <= 0) {
    player.position.y = 0;
    velY = 0;
    grounded = true;
  } else {
    grounded = false;
  }

  // Liten squash/stretch-effekt gör hoppet mer levande.
  const targetScaleY = grounded ? 1 : 1.04;
  player.scale.y = THREE.MathUtils.lerp(player.scale.y, targetScaleY, Math.min(1, dt * 10));

  if (!grounded) {
    legL.rotation.x = THREE.MathUtils.lerp(legL.rotation.x, -0.5, 0.3);
    legR.rotation.x = THREE.MathUtils.lerp(legR.rotation.x, -0.5, 0.3);
    armL.rotation.x = THREE.MathUtils.lerp(armL.rotation.x, -0.6, 0.3);
    armR.rotation.x = THREE.MathUtils.lerp(armR.rotation.x, -0.6, 0.3);
  } else if (moving) {
    walkPhase += dt * 9;
    const swing = Math.sin(walkPhase) * 0.5;
    legL.rotation.x = swing; legR.rotation.x = -swing;
    armL.rotation.x = -swing; armR.rotation.x = swing;
  } else {
    legL.rotation.x = THREE.MathUtils.lerp(legL.rotation.x, 0, 0.2);
    legR.rotation.x = THREE.MathUtils.lerp(legR.rotation.x, 0, 0.2);
    armL.rotation.x = THREE.MathUtils.lerp(armL.rotation.x, 0, 0.2);
    armR.rotation.x = THREE.MathUtils.lerp(armR.rotation.x, 0, 0.2);
  }

  coins.forEach((c) => {
    if (c.taken) return;
    c.mesh.rotation.z += dt * 2.4;
    const coinBaseY = 0.62 + (player.position.y > 0.05 && Math.hypot(player.position.x - c.x, player.position.z - c.z) < 0.9 ? player.position.y : 0);
    c.mesh.position.y = coinBaseY + Math.sin(now / 300 + c.x) * 0.08;
    const ddx = player.position.x - c.x, ddz = player.position.z - c.z;
    const ddy = player.position.y + 0.75 - c.mesh.position.y;
    if (ddx * ddx + ddz * ddz < 0.65 * 0.65 && Math.abs(ddy) < 0.9) {
      c.taken = true; c.mesh.visible = false; coinsGot++; updateHud();
      if (coinsGot === coins.length) showWin();
    }
  });

  updateCamera(dt);
  renderer.render(scene, camera);
}
el._rafId = requestAnimationFrame(loop);

const resizeObserver = new ResizeObserver(() => {
  const w = el.clientWidth, h = el.clientHeight;
  if (w === 0 || h === 0) return;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
});
resizeObserver.observe(el);

el._disposers.push(() => {
  window.removeEventListener('keydown', keyDown);
  window.removeEventListener('keyup', keyUp);
  if (document.pointerLockElement === renderer.domElement) document.exitPointerLock();
  resizeObserver.disconnect();
  grassTexture.dispose();
  scene.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((m) => m.dispose());
    }
  });
  renderer.dispose();
  if (renderer.domElement.parentNode) renderer.domElement.remove();
  if (dpad.parentNode) dpad.remove();
  if (jumpBtn.parentNode) jumpBtn.remove();
  if (hud.parentNode) hud.remove();
  if (hint.parentNode) hint.remove();
  if (headerBtns.parentNode) headerBtns.remove();
  if (messageBox.parentNode) messageBox.remove();
  if (lockHint.parentNode) lockHint.remove();
});

})();
