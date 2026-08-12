// ===== KANVAS 3D-MODELLERARE =====
// Placera ut grundformer, flytta/skala/rotera dem med fingrarna,
// skär RIKTIGA hål (boolesk subtraktion) och exportera som STL.
// Klippläge (auto när ett hål väljs, eller manuellt via knappen): alla former blir
// genomskinliga, bara kanterna syns (röda = hål, blåa = former) med små måttetiketter
// i mm på varje kant, samma skala som mätbordets rutnät (1 enhet = 1mm).
// Runda hål får dessutom ett diameter- (⌀) och radiemått (R) med en punktlinje.
// Hål kan vinklas i 5 vanliga vinklar (15/30/45/60/90°) utöver den fria
// spinn-rotationen (nyp) - spinn väljer RIKTNING, vinkel-knapparna väljer LUTNING.
// Botten- och vinkel-kontrollerna sitter i en meny på vänster sida.
// Placeringshjälp: rosa mittpunkt på varje form, riktningslinje på hål, vit/RGB
// origo-gizmo vid (0,0,0), och en koordinat-ruta (höger sida) för vald form.
// Joystick (höger sida, under koordinaterna) finjusterar positionen för vald form.
// "Samma plats"-knapp (vänster sida) flyttar vald form till samma X/Z som den
// näst-senast valda formen hade.
// Kuben får tre färgade handtag (röd=bredd/X, grön=höjd/Y, blå=längd/Z) - dra ett
// handtag för att ändra just den dimensionen, oberoende av de andra två.

// --- Grundcontainer ---
el.style.position = 'relative';
el.style.width = '100%';
el.style.height = '100%';
el.style.minHeight = '400px';
el.style.overflow = 'hidden';
el.style.background = '#1a1a1a';
el.style.touchAction = 'none';

// Hämta THREE oavsett om den redan finns globalt eller kommer via importmap
let THREE = window.THREE;
if (!THREE) {
  THREE = await import('three');
}

// --- Wrapper som blir helskärmselementet ---
const wrapper = document.createElement('div');
wrapper.style.cssText = `
  position: absolute; inset: 0;
  width: 100%; height: 100%;
  touch-action: none;
  background: #1a1a1a;
`;
el.appendChild(wrapper);

// --- Responsiv UI-skala ---
// Samma fil ska kännas rätt både på en telefon (t.ex. Galaxy S8, CSS-bredd
// ~360-800px) och en stor platta (iPad Pro 12,9": CSS-bredd ~1024-1366px).
// Räknas ut EN gång från skärmens faktiska bredd - 1.0 vid telefon-bredd,
// växer mot 1.6 vid iPad-bredd, så knappar/paneler/text blir proportionerligt
// större och bekvämare att trycka på en stor skärm istället för att förbli
// telefon-småa i all den extra ytan.
const UI_SCALE = Math.max(1, Math.min(1.6, window.innerWidth / 850));
const px = (n) => Math.round(n * UI_SCALE) + 'px';

// --- Scen, kamera, renderer ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a1a);

const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 5000);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.domElement.style.cssText = 'display:block; width:100%; height:100%; touch-action:none;';
wrapper.appendChild(renderer.domElement);

// --- Ljus ---
scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight1.position.set(100, 200, 100);
scene.add(dirLight1);
const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
dirLight2.position.set(-100, 100, -100);
scene.add(dirLight2);

// --- Printbädd, 200x200mm som visuell referens ---
const BED_SIZE = 200;
scene.add(new THREE.GridHelper(BED_SIZE, 20, 0x666666, 0x333333));
const bedMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(BED_SIZE, BED_SIZE),
  new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 1, metalness: 0 })
);
bedMesh.rotation.x = -Math.PI / 2;
bedMesh.position.y = -0.1;
scene.add(bedMesh);

// --- Spawn-yta: en egen kvadrat utanför huvudplattan (delar kant med den vid
// X=100) där nya former och hål placeras. Grön ton skiljer den visuellt från
// den grå utskriftsplattan. Löser att nya former annars kunde hamna ovanpå
// befintliga när de dök upp mitt på plattan.
const SPAWN_SIZE = 100;
const SPAWN_CENTER_X = 100 + SPAWN_SIZE / 2; // 150 - direkt intill plattans kant vid X=100
const SPAWN_CENTER_Z = 0;
const SPAWN_JITTER = 35;
// Centrum för HELA arbetsområdet (bädd + spawn-ytan ihop), inte bara bädden.
// Bädden går X:[-100,100], spawn-ytan sträcker ut det till X:200 (Z täcks redan
// av bädden). Används av koordinat-rutans "Ref: Hela ytan"-läge.
const WORK_AREA_CENTER_X = (-BED_SIZE / 2 + (SPAWN_CENTER_X + SPAWN_SIZE / 2)) / 2;
const WORK_AREA_CENTER_Z = 0;
const spawnGrid = new THREE.GridHelper(SPAWN_SIZE, 6, 0x5a9a78, 0x2d4a3d);
spawnGrid.position.set(SPAWN_CENTER_X, 0, SPAWN_CENTER_Z);
scene.add(spawnGrid);
const spawnPlaneMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(SPAWN_SIZE, SPAWN_SIZE),
  new THREE.MeshStandardMaterial({ color: 0x16241c, roughness: 1, metalness: 0 })
);
spawnPlaneMesh.rotation.x = -Math.PI / 2;
spawnPlaneMesh.position.set(SPAWN_CENTER_X, -0.1, SPAWN_CENTER_Z);
scene.add(spawnPlaneMesh);

// --- Världsorigo-gizmo: tre korta axel-linjer vid bäddens (0,0,0) ---
// Röd=X, Blå=Z, Grön=Y - samma färgkonvention som Fusion/Blender m.fl. (och samma
// som kubens handtag nedan, så färgerna betyder samma sak överallt i verktyget).
const originLines = [];
function addAxisLine(dir, color, length) {
  const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), dir.clone().multiplyScalar(length)]);
  const mat = new THREE.LineBasicMaterial({ color, depthTest: false });
  const line = new THREE.Line(geo, mat);
  line.renderOrder = 998;
  scene.add(line);
  originLines.push(line);
}
addAxisLine(new THREE.Vector3(1, 0, 0), 0xff4444, 14);
addAxisLine(new THREE.Vector3(0, 0, 1), 0x4488ff, 14);
addAxisLine(new THREE.Vector3(0, 1, 0), 0x66ff66, 10);

// Etiketter "X"/"Y"/"Z" precis vid respektive axellinjes spets, samma färg som
// linjen så det är tydligt vilken bokstav som hör till vilken.
function makeAxisLabel(text, bgColor) {
  const el = document.createElement('div');
  el.textContent = text;
  el.style.cssText = `
    position: absolute; color: #fff; font-size: 12px; font-weight: 700;
    font-family: system-ui, sans-serif; background: ${bgColor}; padding: 2px 6px;
    border-radius: 3px; pointer-events: none; transform: translate(-50%,-50%);
    white-space: nowrap; z-index: 9; text-shadow: 0 1px 2px rgba(0,0,0,0.4);
  `;
  wrapper.appendChild(el);
  return el;
}
const axisLabelX = makeAxisLabel('X', '#ff4444');
const axisLabelY = makeAxisLabel('Y', '#3a9a3a');
const axisLabelZ = makeAxisLabel('Z', '#4488ff');
const AXIS_LABEL_POS_X = new THREE.Vector3(17, 0, 0);
const AXIS_LABEL_POS_Y = new THREE.Vector3(0, 12, 0);
const AXIS_LABEL_POS_Z = new THREE.Vector3(0, 0, 17);

// Kvadrant-siffror (1-4, medurs från +X/+Z) mitt i varje fjärdedel av huvudplattan.
// Stora och halvgenomskinliga - som fältmarkeringar, ska synas men inte skymma former.
const QUADRANT_LABEL_CSS = `
  position: absolute; color: rgba(255,255,255,0.32); font-size: 30px; font-weight: 700;
  font-family: system-ui, sans-serif; pointer-events: none; transform: translate(-50%,-50%);
  text-shadow: 0 1px 4px rgba(0,0,0,0.5); z-index: 8;
`;
function makeQuadrantLabelEl() {
  const el = document.createElement('div');
  el.style.cssText = QUADRANT_LABEL_CSS;
  wrapper.appendChild(el);
  return el;
}
const quadrantLabels = [
  { pos: new THREE.Vector3(50, 0, 50), text: '1' },  // +X, +Z
  { pos: new THREE.Vector3(-50, 0, 50), text: '2' },  // -X, +Z
  { pos: new THREE.Vector3(-50, 0, -50), text: '3' }, // -X, -Z
  { pos: new THREE.Vector3(50, 0, -50), text: '4' }   // +X, -Z
].map(q => ({ ...q, el: makeQuadrantLabelEl() }));

// --- Kameraorbit (egen enkel implementation, inget externt beroende) ---
const camTarget = new THREE.Vector3(0, 20, 0);
let camRadius = 260, camTheta = Math.PI / 4, camPhi = Math.PI / 3.2;
function updateCamera() {
  camPhi = Math.max(0.15, Math.min(Math.PI - 0.15, camPhi));
  camRadius = Math.max(50, Math.min(1200, camRadius));
  camera.position.set(
    camTarget.x + camRadius * Math.sin(camPhi) * Math.sin(camTheta),
    camTarget.y + camRadius * Math.cos(camPhi),
    camTarget.z + camRadius * Math.sin(camPhi) * Math.cos(camTheta)
  );
  camera.lookAt(camTarget);
}
updateCamera();

// ============================================================
// --- Minimal CSG-motor (boolesk subtraktion) ---
// Baserad på den klassiska BSP-träd-algoritmen (Evan Wallace, csg.js).
// Bygger ett binärt rymdpartitioneringsträd av polygoner och klipper
// två sådana träd mot varandra för att räkna ut "A minus B".
// ============================================================
const CSG_EPS = 1e-5;

class CSGVertex {
  constructor(pos, normal) { this.pos = pos.clone(); this.normal = normal.clone(); }
  clone() { return new CSGVertex(this.pos, this.normal); }
  flip() { this.normal.multiplyScalar(-1); }
  interpolate(other, t) {
    return new CSGVertex(this.pos.clone().lerp(other.pos, t), this.normal.clone().lerp(other.normal, t));
  }
}

class CSGPlane {
  constructor(normal, w) { this.normal = normal; this.w = w; }
  static fromPoints(a, b, c) {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    return new CSGPlane(n, n.dot(a));
  }
  clone() { return new CSGPlane(this.normal.clone(), this.w); }
  flip() { this.normal.multiplyScalar(-1); this.w = -this.w; }
  splitPolygon(polygon, coplanarFront, coplanarBack, front, back) {
    const COPLANAR = 0, FRONT = 1, BACK = 2, SPANNING = 3;
    let polygonType = 0;
    const types = [];
    for (const v of polygon.vertices) {
      const t = this.normal.dot(v.pos) - this.w;
      const type = t < -CSG_EPS ? BACK : t > CSG_EPS ? FRONT : COPLANAR;
      polygonType |= type;
      types.push(type);
    }
    switch (polygonType) {
      case COPLANAR:
        (this.normal.dot(polygon.plane.normal) > 0 ? coplanarFront : coplanarBack).push(polygon);
        break;
      case FRONT:
        front.push(polygon);
        break;
      case BACK:
        back.push(polygon);
        break;
      case SPANNING: {
        const f = [], b = [];
        for (let i = 0; i < polygon.vertices.length; i++) {
          const j = (i + 1) % polygon.vertices.length;
          const ti = types[i], tj = types[j];
          const vi = polygon.vertices[i], vj = polygon.vertices[j];
          if (ti !== BACK) f.push(vi);
          if (ti !== FRONT) b.push(ti !== BACK ? vi.clone() : vi);
          if ((ti | tj) === SPANNING) {
            const t = (this.w - this.normal.dot(vi.pos)) / this.normal.dot(new THREE.Vector3().subVectors(vj.pos, vi.pos));
            const v = vi.interpolate(vj, t);
            f.push(v);
            b.push(v.clone());
          }
        }
        if (f.length >= 3) front.push(new CSGPolygon(f));
        if (b.length >= 3) back.push(new CSGPolygon(b));
        break;
      }
    }
  }
}

class CSGPolygon {
  constructor(vertices) {
    this.vertices = vertices;
    this.plane = CSGPlane.fromPoints(vertices[0].pos, vertices[1].pos, vertices[2].pos);
  }
  clone() { return new CSGPolygon(this.vertices.map(v => v.clone())); }
  flip() {
    this.vertices.reverse();
    for (const v of this.vertices) v.flip();
    this.plane.flip();
  }
}

class CSGNode {
  constructor(polygons) {
    this.plane = null;
    this.front = null;
    this.back = null;
    this.polygons = [];
    if (polygons) this.build(polygons);
  }
  invert() {
    for (const p of this.polygons) p.flip();
    this.plane.flip();
    if (this.front) this.front.invert();
    if (this.back) this.back.invert();
    const tmp = this.front; this.front = this.back; this.back = tmp;
  }
  clipPolygons(polygons) {
    if (!this.plane) return polygons.slice();
    let front = [], back = [];
    for (const p of polygons) this.plane.splitPolygon(p, front, back, front, back);
    if (this.front) front = this.front.clipPolygons(front);
    back = this.back ? this.back.clipPolygons(back) : [];
    return front.concat(back);
  }
  clipTo(bsp) {
    this.polygons = bsp.clipPolygons(this.polygons);
    if (this.front) this.front.clipTo(bsp);
    if (this.back) this.back.clipTo(bsp);
  }
  allPolygons() {
    let polygons = this.polygons.slice();
    if (this.front) polygons = polygons.concat(this.front.allPolygons());
    if (this.back) polygons = polygons.concat(this.back.allPolygons());
    return polygons;
  }
  build(polygons) {
    if (!polygons.length) return;
    if (!this.plane) this.plane = polygons[0].plane.clone();
    const front = [], back = [];
    for (const p of polygons) this.plane.splitPolygon(p, this.polygons, this.polygons, front, back);
    if (front.length) {
      if (!this.front) this.front = new CSGNode();
      this.front.build(front);
    }
    if (back.length) {
      if (!this.back) this.back = new CSGNode();
      this.back.build(back);
    }
  }
}

// A minus B
function csgSubtract(polysA, polysB) {
  const a = new CSGNode(polysA.map(p => p.clone()));
  const b = new CSGNode(polysB.map(p => p.clone()));
  a.invert();
  a.clipTo(b);
  b.clipTo(a);
  b.invert();
  b.clipTo(a);
  b.invert();
  a.build(b.allPolygons());
  a.invert();
  return a.allPolygons();
}

// Mesh (i world space) -> lista av CSGPolygon
function meshToPolygons(mesh) {
  mesh.updateMatrixWorld(true);
  const geo = mesh.geometry;
  const pos = geo.attributes.position;
  const norm = geo.attributes.normal;
  const index = geo.index;
  const matrix = mesh.matrixWorld;
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
  const triN = index ? index.count / 3 : pos.count / 3;
  const polygons = [];
  for (let t = 0; t < triN; t++) {
    const idx = [0, 1, 2].map(k => (index ? index.getX(t * 3 + k) : t * 3 + k));
    const verts = idx.map(i => {
      const p = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(matrix);
      const n = norm
        ? new THREE.Vector3().fromBufferAttribute(norm, i).applyMatrix3(normalMatrix).normalize()
        : new THREE.Vector3(0, 1, 0);
      return new CSGVertex(p, n);
    });
    polygons.push(new CSGPolygon(verts));
  }
  return polygons;
}

// Lista av CSGPolygon -> THREE.BufferGeometry (fläkt-triangulerad)
function polygonsToGeometry(polygons) {
  const positions = [], normals = [];
  for (const poly of polygons) {
    for (let i = 2; i < poly.vertices.length; i++) {
      const a = poly.vertices[0], b = poly.vertices[i - 1], c = poly.vertices[i];
      for (const v of [a, b, c]) {
        positions.push(v.pos.x, v.pos.y, v.pos.z);
        normals.push(v.normal.x, v.normal.y, v.normal.z);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  return geometry;
}

// --- Formhantering ---
const shapes = [];
let selected = null;
let selectionBox = null;
let prevSelected = null;
let prevBox = null;
let lastSelectFaceInfo = null; // yta som träffades vid SENASTE markeringen
let prevSelectedFace = null;   // yta som hörde till FÖREGÅENDE markering (prevSelected)

function makeMaterial() {
  const color = new THREE.Color().setHSL(Math.random(), 0.55, 0.55);
  return new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.15 });
}
function makeHoleMaterial() {
  return new THREE.MeshStandardMaterial({ color: 0xff5555, transparent: true, opacity: 0.5, roughness: 0.4 });
}

// --- Orientering: spinn (Y, fri via nyp) + vinkel (X, förvalda knappar) ---
// Kombineras som quaternion = spinn * vinkel: vinkeln lutar formen kring sin egen
// lokala X-axel FÖRST, sen roterar spinnet hela den lutade formen kring VÄRLDENS
// Y-axel. Det gör att spinn väljer vilket HÅLL lutningen pekar, och vinkel-knappen
// väljer HUR MYCKET den lutar - tillsammans kan ett hål vinklas åt vilket håll som helst.
const _upAxis = new THREE.Vector3(0, 1, 0);
const _tiltAxis = new THREE.Vector3(1, 0, 0);
const _qSpin = new THREE.Quaternion(), _qTilt = new THREE.Quaternion();
function applyOrientation(mesh) {
  _qSpin.setFromAxisAngle(_upAxis, mesh.userData.spinAngle || 0);
  _qTilt.setFromAxisAngle(_tiltAxis, mesh.userData.tiltAngle || 0);
  mesh.quaternion.copy(_qSpin).multiply(_qTilt);
}
function setTilt(mesh, angle) {
  mesh.userData.tiltAngle = angle;
  applyOrientation(mesh);
}

// --- Placera på yta: räkna fram spinn+vinkel som pekar "neråt" i vald riktning ---
// Given en önskad "neråt"-riktning (downDir, enhetsvektor) räknas den kombination
// av spinn (kring världens Y) och vinkel (kring lokal X) ut som applyOrientation
// skulle behöva ge för att formens lokala -Y ska peka just åt det hållet. Löst
// genom att spåra hur (0,-1,0) rör sig genom vinkel-sen-spinn-kedjan (se
// kommentaren vid applyOrientation) och lösa ut vinklarna ur resultatet.
function computeFaceOrientation(downDir) {
  const ty = Math.max(-1, Math.min(1, downDir.y));
  const tilt = Math.acos(-ty);
  const sinTilt = Math.sin(tilt);
  const spin = sinTilt > 1e-6 ? Math.atan2(-downDir.x, -downDir.z) : 0;
  return { spin, tilt };
}
// Lokal referenspunkt (i formens EGNA, oroterade koordinater) som ska hamna
// exakt på målytan: botten för vanliga former, toppen (ingången) för hål.
function getBaseLocalOffset(mesh) {
  if (mesh.userData.isHole) return new THREE.Vector3(0, mesh.scale.y * 0.5, 0);
  return new THREE.Vector3(0, -mesh.userData.restHeight * mesh.scale.y, 0);
}
function placeOnFace(mesh, facePoint, downDir) {
  const orient = computeFaceOrientation(downDir);
  mesh.userData.spinAngle = orient.spin;
  mesh.userData.tiltAngle = orient.tilt;
  applyOrientation(mesh);
  const localOffset = getBaseLocalOffset(mesh).applyQuaternion(mesh.quaternion);
  mesh.position.copy(facePoint).sub(localOffset);
}

// --- Hål: botten-kontroll ---
// Toppen på ett hål ligger fast på HOLE_TOP (gott om marginal över normalstora former).
// "Botten" är det enda du justerar: 0 = går hela vägen ner till bädden (genomgående hål),
// högre värde = hålet stannar högre upp = blint hål. Hål-geometrin är enhetsstor (radie/sida 1,
// höjd 1) och all storlek styrs via scale, så botten-justering kräver ingen ny geometri.
const HOLE_TOP = 60, HOLE_BOTTOM_MIN = -50, HOLE_BOTTOM_MAX = 55, HOLE_BOTTOM_STEP = 5;
function setHoleBottom(mesh, value) {
  const bottom = Math.max(HOLE_BOTTOM_MIN, Math.min(HOLE_BOTTOM_MAX, value));
  mesh.userData.holeBottom = bottom;
  mesh.scale.y = HOLE_TOP - bottom;
  mesh.position.y = (HOLE_TOP + bottom) / 2;
}

// ============================================================
// --- Placeringsmarkörer (mittpunkt, riktning, koordinater) ---
// Som origo/gizmo-verktygen i Fusion/Tinkercad m.fl: en liten rosa punkt vid varje
// formens mittpunkt, en riktningslinje på hål (så du ser åt vilket håll de pekar
// efter vinkling). Fast världsstorlek och ritas alltid överst (depthTest:false) -
// annars skulle en tunn eller kraftigt skalad hålform ge sneda/osynliga markörer.
// Syns alltid, inte bara i klippläge, och uppdateras varje bildruta.
// ============================================================
const centerDotGeo = new THREE.SphereGeometry(1.6, 10, 8);
const centerDotMat = new THREE.MeshBasicMaterial({ color: 0xff44ff, depthTest: false });
const centerDotMatLocked = new THREE.MeshBasicMaterial({ color: 0xffcc00, depthTest: false }); // guld = ihoplåst
const dirLineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 14, 0)]);
const dirLineMat = new THREE.LineBasicMaterial({ color: 0xff44ff, depthTest: false });

function createPlacementMarker(mesh) {
  const dot = new THREE.Mesh(centerDotGeo, centerDotMat);
  dot.renderOrder = 999;
  scene.add(dot);
  let dirLine = null;
  if (mesh.userData.isHole) {
    dirLine = new THREE.Line(dirLineGeo, dirLineMat);
    dirLine.renderOrder = 999;
    scene.add(dirLine);
  }
  return { dot, dirLine };
}
function removePlacementMarker(mesh) {
  const pm = mesh.userData.placementMarker;
  if (!pm) return;
  scene.remove(pm.dot);
  if (pm.dirLine) scene.remove(pm.dirLine);
  delete mesh.userData.placementMarker;
}

// ============================================================
// --- Kub-handtag (bredd/höjd/längd oberoende av varandra) ---
// Tre små klot vid kubens +X/+Y/+Z-sidor. Position räknas ut varje bildruta från
// mesh.position + (halva sidan * mesh.scale för just den axeln), roterat med
// mesh.quaternion - INTE föräldrat till mesh:en, så klotens EGEN storlek förblir
// konstant även om kuben skalas kraftigt. Samma färgkod som origo-gizmot:
// röd=X/bredd, grön=Y/höjd, blå=Z/längd.
// ============================================================
const CUBE_HALF = 15; // halva sidan (30mm) på bas-geometrin vid scale=1
const handleGeo = new THREE.SphereGeometry(3, 12, 8);
const handleMatX = new THREE.MeshBasicMaterial({ color: 0xff4444, depthTest: false });
const handleMatY = new THREE.MeshBasicMaterial({ color: 0x66ff66, depthTest: false });
const handleMatZ = new THREE.MeshBasicMaterial({ color: 0x4488ff, depthTest: false });
let cubeHandles = null;

function createCubeHandles() {
  const x = new THREE.Mesh(handleGeo, handleMatX); x.renderOrder = 1000;
  const y = new THREE.Mesh(handleGeo, handleMatY); y.renderOrder = 1000;
  const z = new THREE.Mesh(handleGeo, handleMatZ); z.renderOrder = 1000;
  scene.add(x, y, z);
  return { x, y, z };
}
function removeCubeHandles() {
  if (!cubeHandles) return;
  scene.remove(cubeHandles.x, cubeHandles.y, cubeHandles.z);
  cubeHandles = null;
}
function updateCubeHandlesVisibility() {
  const shouldShow = !!(selected && selected.userData.shapeType === 'cube');
  if (shouldShow && !cubeHandles) cubeHandles = createCubeHandles();
  else if (!shouldShow && cubeHandles) removeCubeHandles();
}
const _handleLocal = new THREE.Vector3();
function updateCubeHandles() {
  if (!cubeHandles || !selected) return;
  const mesh = selected;
  _handleLocal.set(CUBE_HALF * mesh.scale.x, 0, 0).applyQuaternion(mesh.quaternion).add(mesh.position);
  cubeHandles.x.position.copy(_handleLocal);
  _handleLocal.set(0, CUBE_HALF * mesh.scale.y, 0).applyQuaternion(mesh.quaternion).add(mesh.position);
  cubeHandles.y.position.copy(_handleLocal);
  _handleLocal.set(0, 0, CUBE_HALF * mesh.scale.z).applyQuaternion(mesh.quaternion).add(mesh.position);
  cubeHandles.z.position.copy(_handleLocal);
}
function pickHandle(clientX, clientY) {
  if (!cubeHandles) return null;
  getNDC(clientX, clientY);
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects([cubeHandles.x, cubeHandles.y, cubeHandles.z], false);
  if (!hits.length) return null;
  if (hits[0].object === cubeHandles.x) return 'x';
  if (hits[0].object === cubeHandles.y) return 'y';
  return 'z';
}

// Uppdaterar mittpunkt/riktningslinje för alla former, kub-handtagen, plus
// koordinat-rutan (höger sida) för DEN VALDA formen. Koordinat-rutan är ett fast
// UI-element (inte en 3d-etikett vid formen) just för att den inte ska hamna
// under fingret medan man drar/nyper.
function updatePlacementMarkers() {
  for (const mesh of shapes) {
    const pm = mesh.userData.placementMarker;
    if (!pm) continue;
    pm.dot.material = mesh.userData.groupId ? centerDotMatLocked : centerDotMat;
    mesh.getWorldPosition(pm.dot.position);
    if (pm.dirLine) {
      pm.dirLine.position.copy(pm.dot.position);
      mesh.getWorldQuaternion(pm.dirLine.quaternion);
    }
  }
  updateCubeHandles();
  if (selected && selected.userData.placementMarker) {
    const p = selected.userData.placementMarker.dot.position;
    coordBox.style.display = 'flex';
    const refX = coordMode === 'world' ? 0 : WORK_AREA_CENTER_X;
    const refZ = coordMode === 'world' ? 0 : WORK_AREA_CENTER_Z;
    coordXEl.textContent = `X: ${Math.round(p.x - refX)}mm`;
    coordZEl.textContent = `Z: ${Math.round(p.z - refZ)}mm`;
    coordHEl.textContent = `H: ${Math.round(p.y)}mm`;
    coordQuadEl.textContent = `Kvadrant ${quadrantOf(p.x, p.z)}`;
    joystickBase.style.display = 'block';
    speedBtn.style.display = 'block';
    const wrapperRect = wrapper.getBoundingClientRect();
    // Joystick + hastighetsknapp botten-förankras (sida vid sida) istället för att
    // staplas uppifrån - annars blev det för högt i liggande läge och knappen
    // hamnade utanför skärmen. Avståndet från botten mäts mot hint-textens
    // faktiska topp, så de aldrig hamnar ovanpå den.
    const hintTop = hint.getBoundingClientRect().top;
    const bottomClearance = Math.max(8, Math.round(wrapperRect.bottom - hintTop) + 6);
    joystickBase.style.bottom = bottomClearance + 'px';
    speedBtn.style.bottom = bottomClearance + 'px';
  } else {
    coordBox.style.display = 'none';
    joystickBase.style.display = 'none';
    speedBtn.style.display = 'none';
  }
}

function addShape(type) {
  let geometry, restHeight = 15, isHole = false, radiusXZ = null, holeShape = null, initialTilt = 0;
  switch (type) {
    case 'cube': geometry = new THREE.BoxGeometry(30, 30, 30); break;
    case 'sphere': geometry = new THREE.SphereGeometry(15, 24, 16); break;
    case 'cylinder': geometry = new THREE.CylinderGeometry(15, 15, 30, 24); break;
    case 'cone': geometry = new THREE.ConeGeometry(15, 30, 24); break;
    case 'pyramid': geometry = new THREE.ConeGeometry(18, 30, 4); break;
    case 'torus': geometry = new THREE.TorusGeometry(15, 5, 12, 24); restHeight = 5; initialTilt = Math.PI / 2; break;
    case 'holeRound': geometry = new THREE.CylinderGeometry(1, 1, 1, 24); isHole = true; radiusXZ = 8; holeShape = 'round'; break;
    case 'holeSquare': geometry = new THREE.BoxGeometry(1, 1, 1); isHole = true; radiusXZ = 16; holeShape = 'square'; break;
    default: return;
  }
  const mesh = new THREE.Mesh(geometry, isHole ? makeHoleMaterial() : makeMaterial());
  const jitterX = () => SPAWN_CENTER_X + (Math.random() - 0.5) * 2 * SPAWN_JITTER;
  const jitterZ = () => SPAWN_CENTER_Z + (Math.random() - 0.5) * 2 * SPAWN_JITTER;
  mesh.userData.isHole = isHole;
  mesh.userData.holeShape = holeShape;
  mesh.userData.shapeType = type;
  mesh.userData.spinAngle = 0;
  mesh.userData.tiltAngle = initialTilt;
  applyOrientation(mesh);

  if (isHole) {
    mesh.position.x = jitterX();
    mesh.position.z = jitterZ();
    mesh.scale.x = mesh.scale.z = radiusXZ;
    mesh.userData.holeBottom = 0;
    setHoleBottom(mesh, 0);
  } else {
    mesh.position.set(jitterX(), restHeight, jitterZ());
    mesh.userData.restHeight = restHeight;
  }

  scene.add(mesh);
  mesh.userData.placementMarker = createPlacementMarker(mesh);
  shapes.push(mesh);
  selectShape(mesh);
}

// ============================================================
// --- Klippläge: av / kantläge / rutnät ---
// Knappen cyklar tre lägen: av, kantläge (kanter+mått, aktiveras även
// automatiskt när ett hål väljs) och rutnät (fullt trådnät, alla kanter).
// Alla former blir osynliga (genomskinligt material, INTE mesh.visible=false,
// så de fortfarande går att peka på/välja) och ersätts visuellt av kantlinjer -
// röda för hål, blåa för vanliga former - plus små måttetiketter (mm, samma
// skala som mätbordet) på varje kant som är lång nog för att vara meningsfull.
// Runda hål får också en punktlinje tvärs över med diameter (⌀) och radie (R),
// eftersom deras rundade kanter annars bara ger massa små meningslösa fasettmått.
// Tips: slå på klippläget medan du drar i kubens handtag för att se exakta mått
// på kanterna live (samma edge-etiketter funkar på vilken form som helst).
// Alla overlay-objekt är barn till respektive mesh så de följer automatiskt med
// vid flytt/skala/rotera/vinkla/botten-justering. Etiketternas skärmposition och
// text uppdateras varje bildruta i renderloopen.
// ============================================================
const XRAY_HIDDEN_MATERIAL = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
const MIN_EDGE_LABEL_LENGTH = 8; // mm - filtrerar bort småfasetter på runda former
const LABEL_CSS = `
  position: absolute; color: #fff; font-size: 9px; font-family: system-ui, sans-serif;
  background: rgba(0,0,0,0.55); padding: 1px 4px; border-radius: 3px;
  pointer-events: none; transform: translate(-50%,-50%); white-space: nowrap; z-index: 9;
`;
const XRAY_MODES = [
  { label: '◐ Klippläge', mode: null, color: '#2a2a2a' },
  { label: '◐ Kantläge', mode: 'edge', color: '#3a7bd5' },
  { label: '◐ Rutnät', mode: 'grid', color: '#8a4fd5' }
];
let manualXrayIndex = 0;
let edgeOverlays = [];

function makeLabelEl() {
  const el = document.createElement('div');
  el.style.cssText = LABEL_CSS;
  wrapper.appendChild(el);
  return el;
}

// Alltid synlig etikett ovanför spawn-ytan (inte bara i klippläge), så det är
// tydligt vad den gröna kvadraten är till för.
const spawnLabelEl = makeLabelEl();
const SPAWN_LABEL_POS = new THREE.Vector3(SPAWN_CENTER_X, 25, SPAWN_CENTER_Z);

// Punktlinje + ⌀/R-etiketter för ett runt hål. Lokala koordinater (radie=1 i
// enhets-geometrin) så att scale.x (=aktuell radie i mm) skalar allt automatiskt.
function createDiameterIndicator(mesh) {
  const y = 0.5; // toppen av enhets-cylindern
  const geo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-1, y, 0),
    new THREE.Vector3(1, y, 0)
  ]);
  const line = new THREE.Line(geo, new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.03, gapSize: 0.05 }));
  line.computeLineDistances();
  mesh.add(line);
  return {
    line,
    diaPoint: new THREE.Vector3(1.2, y, 0),
    radPoint: new THREE.Vector3(0.5, y, 0),
    diaEl: makeLabelEl(),
    radEl: makeLabelEl()
  };
}

function enterXrayMode(mode) {
  for (const mesh of shapes) {
    mesh.updateMatrixWorld(true);
    mesh.userData.savedMaterial = mesh.material;
    mesh.material = XRAY_HIDDEN_MATERIAL;

    const color = mesh.userData.isHole ? 0xff5555 : 0x66ccff;
    let lines;

    if (mode === 'grid') {
      // Rutnät: ALLA triangelkanter i mesh:en, inte bara de "hårda" - ger det
      // klassiska trådnätet man ser i Blender/Maya m.fl. Ingen filtrering på
      // vinkel som i kantläget, så runda former blir tätt rutade.
      const wireGeo = new THREE.WireframeGeometry(mesh.geometry);
      lines = new THREE.LineSegments(wireGeo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.55 }));
    } else {
      // Kantläge: bara rena kantlinjer nu, inga mått - måtten sitter i Rutnät istället.
      const edgesGeo = new THREE.EdgesGeometry(mesh.geometry, 25);
      lines = new THREE.LineSegments(edgesGeo, new THREE.LineBasicMaterial({ color }));
    }
    mesh.add(lines);

    // Mått (kant-etiketter + ⌀/R) hör bara till Rutnät-läget. Räknas alltid ut
    // från de "hårda" kanterna (egen EdgesGeometry, slängs direkt efter) oavsett
    // vilken linje-geometri som faktiskt ritas - annars skulle t.ex. diagonalen
    // i en kvadratisk sida (som Rutnät visar men kantläget aldrig gjorde) få ett
    // eget, mindre meningsfullt mått.
    let segments = [], diameterInfo = null;
    if (mode === 'grid') {
      const measureGeo = new THREE.EdgesGeometry(mesh.geometry, 25);
      const segPos = measureGeo.attributes.position;
      const wa = new THREE.Vector3(), wb = new THREE.Vector3();
      for (let i = 0; i < segPos.count; i += 2) {
        wa.fromBufferAttribute(segPos, i).applyMatrix4(mesh.matrixWorld);
        wb.fromBufferAttribute(segPos, i + 1).applyMatrix4(mesh.matrixWorld);
        if (wa.distanceTo(wb) < MIN_EDGE_LABEL_LENGTH) continue;
        segments.push({
          a: new THREE.Vector3().fromBufferAttribute(segPos, i),
          b: new THREE.Vector3().fromBufferAttribute(segPos, i + 1),
          el: makeLabelEl()
        });
      }
      measureGeo.dispose();
      diameterInfo = (mesh.userData.isHole && mesh.userData.holeShape === 'round') ? createDiameterIndicator(mesh) : null;
    }

    edgeOverlays.push({ mesh, lines, segments, diameterInfo });
  }
  updateEdgeLabels(renderer.domElement.getBoundingClientRect());
}

function exitXrayMode() {
  for (const { mesh, lines, segments, diameterInfo } of edgeOverlays) {
    mesh.material = mesh.userData.savedMaterial;
    delete mesh.userData.savedMaterial;
    mesh.remove(lines);
    lines.geometry.dispose();
    lines.material.dispose();
    for (const seg of segments) seg.el.remove();
    if (diameterInfo) {
      mesh.remove(diameterInfo.line);
      diameterInfo.line.geometry.dispose();
      diameterInfo.line.material.dispose();
      diameterInfo.diaEl.remove();
      diameterInfo.radEl.remove();
    }
  }
  edgeOverlays = [];
}

// Projicerar en world-position till skärmen och sätter text/position/synlighet på en etikett.
function positionLabel(el, worldPoint, rect, text) {
  _lmid.copy(worldPoint).project(camera);
  if (_lmid.z < -1 || _lmid.z > 1) {
    el.style.display = 'none';
    return;
  }
  el.style.display = 'block';
  el.style.left = ((_lmid.x * 0.5 + 0.5) * rect.width) + 'px';
  el.style.top = ((-_lmid.y * 0.5 + 0.5) * rect.height) + 'px';
  el.textContent = text;
}

// Uppdaterar skärmposition + mått-text för alla etiketter. Körs varje bildruta.
const _la = new THREE.Vector3(), _lb = new THREE.Vector3(), _lmid = new THREE.Vector3();
function updateEdgeLabels(rect) {
  for (const { mesh, segments, diameterInfo } of edgeOverlays) {
    for (const seg of segments) {
      _la.copy(seg.a).applyMatrix4(mesh.matrixWorld);
      _lb.copy(seg.b).applyMatrix4(mesh.matrixWorld);
      const length = _la.distanceTo(_lb);
      positionLabel(seg.el, _la.add(_lb).multiplyScalar(0.5), rect, Math.round(length) + 'mm');
    }
    if (diameterInfo) {
      const radius = mesh.scale.x;
      _la.copy(diameterInfo.diaPoint).applyMatrix4(mesh.matrixWorld);
      positionLabel(diameterInfo.diaEl, _la, rect, `⌀${Math.round(radius * 2)}mm`);
      _lb.copy(diameterInfo.radPoint).applyMatrix4(mesh.matrixWorld);
      positionLabel(diameterInfo.radEl, _lb, rect, `R${Math.round(radius)}mm`);
    }
  }
}

// Beslutar om klippläge ska vara på just nu och synkar overlays därefter.
// Körs alltid (inte bara vid av/på-växling) så nytillkomna/borttagna former
// alltid får rätt kantlinjer och etiketter. Manuellt Rutnät-läge har alltid
// företräde; annars kantläge om det är manuellt valt ELLER ett hål är valt
// (samma auto-trigger som förut, så mått/⌀/R fortsätter dyka upp automatiskt).
function refreshXray() {
  exitXrayMode();
  const manualMode = XRAY_MODES[manualXrayIndex].mode;
  const holeSelected = selected && selected.userData.isHole;
  if (manualMode === 'grid') enterXrayMode('grid');
  else if (manualMode === 'edge' || holeSelected) enterXrayMode('edge');
}

// Ritar/uppdaterar den orangea rutan runt "föregående" markerade form (referensen
// för "Samma plats"-knappen). Skild färg från den gula (selectionBox) som visar
// den AKTUELLA markeringen, så man ser båda samtidigt.
function updatePrevBox() {
  if (prevBox) {
    scene.remove(prevBox);
    prevBox.geometry.dispose();
    prevBox.material.dispose();
    prevBox = null;
  }
  if (prevSelected && shapes.includes(prevSelected) && prevSelected !== selected) {
    prevBox = new THREE.BoxHelper(prevSelected, 0xff8800);
    scene.add(prevBox);
  }
}

function selectShape(mesh, hit) {
  if (selected && mesh !== selected) {
    prevSelected = selected;
    prevSelectedFace = lastSelectFaceInfo;
  }
  selected = mesh;
  lastSelectFaceInfo = (mesh && hit && hit.face) ? {
    normal: hit.face.normal.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld)).normalize(),
    point: hit.point.clone()
  } : null;
  if (selectionBox) {
    scene.remove(selectionBox);
    selectionBox.geometry.dispose();
    selectionBox.material.dispose();
    selectionBox = null;
  }
  if (mesh) {
    selectionBox = new THREE.BoxHelper(mesh, 0xffcc00);
    scene.add(selectionBox);
  }

  updateCubeHandlesVisibility();
  updatePrevBox();
  refreshXray();
  updateToolbarState();
}

// --- Ångra (ett steg tillbaka) ---
let undoAction = null;
let undoDiscard = null;
function setUndo(action, discard) {
  if (undoDiscard) undoDiscard();
  undoAction = action;
  undoDiscard = discard || null;
  updateToolbarState();
}
function performUndo() {
  if (!undoAction) return;
  const fn = undoAction;
  undoAction = null;
  undoDiscard = null;
  fn();
  updateToolbarState();
}

function disposeMesh(mesh) {
  mesh.geometry.dispose();
  mesh.material.dispose();
}

function forgetIfPrevious(mesh) {
  if (prevSelected === mesh) {
    prevSelected = null;
    prevSelectedFace = null;
    updatePrevBox();
  }
}

// --- Låsa former ihop (flyttas som en enhet) ---
// Varje form har en userData.groupId (null = olåst). Att låsa A+B ihop ger dem
// samma id - om någon redan tillhör en grupp går ALLA i den gruppen med i den
// gemensamma. Funkar identiskt för objekt och hål. Bara FLYTT (drag/joystick)
// följer låsningen, inte skala/rotera/botten - se applyGroupDelta.
let nextGroupId = 1;
function lockTogether(a, b) {
  const gidA = a.userData.groupId, gidB = b.userData.groupId;
  if (gidA && gidB) {
    if (gidA === gidB) return;
    for (const m of shapes) if (m.userData.groupId === gidB) m.userData.groupId = gidA;
  } else {
    const gid = gidA || gidB || ('g' + nextGroupId++);
    a.userData.groupId = gid;
    b.userData.groupId = gid;
  }
}
function unlockSelected() {
  if (!selected || !selected.userData.groupId) return;
  const gid = selected.userData.groupId;
  selected.userData.groupId = null;
  const remaining = shapes.filter(m => m.userData.groupId === gid);
  if (remaining.length === 1) remaining[0].userData.groupId = null; // grupp om 1 är meningslös
}
// Flyttar alla ÖVRIGA medlemmar i mesh:ens grupp med samma delta som mesh:en
// själv precis flyttades. Anropas efter att mesh.position redan uppdaterats.
function applyGroupDelta(mesh, dx, dz) {
  if (!mesh.userData.groupId) return;
  for (const m of shapes) {
    if (m !== mesh && m.userData.groupId === mesh.userData.groupId) {
      m.position.x += dx;
      m.position.z += dz;
    }
  }
}
// Botten/vinkel är hål-specifika koncept, så dessa påverkar bara de LÅSTA
// gruppmedlemmar som själva är hål - en låst vanlig form rörs inte av dem.
function applyGroupHoleBottomDelta(mesh, delta) {
  if (!mesh.userData.groupId) return;
  for (const m of shapes) {
    if (m !== mesh && m.userData.groupId === mesh.userData.groupId && m.userData.isHole) {
      setHoleBottom(m, m.userData.holeBottom + delta);
    }
  }
}
function applyGroupTilt(mesh, angle) {
  if (!mesh.userData.groupId) return;
  for (const m of shapes) {
    if (m !== mesh && m.userData.groupId === mesh.userData.groupId && m.userData.isHole) {
      setTilt(m, angle);
    }
  }
}

function deleteSelected() {
  if (!selected) return;
  const mesh = selected;
  scene.remove(mesh);
  removePlacementMarker(mesh);
  forgetIfPrevious(mesh);
  const i = shapes.indexOf(mesh);
  if (i >= 0) shapes.splice(i, 1);
  selectShape(null);
  setUndo(
    () => { scene.add(mesh); mesh.userData.placementMarker = createPlacementMarker(mesh); shapes.push(mesh); selectShape(mesh); },
    () => disposeMesh(mesh)
  );
}

function clearAll() {
  if (!shapes.length) return;
  const removed = shapes.slice();
  for (const mesh of removed) { scene.remove(mesh); removePlacementMarker(mesh); forgetIfPrevious(mesh); }
  shapes.length = 0;
  selectShape(null);
  setUndo(
    () => { for (const mesh of removed) { scene.add(mesh); mesh.userData.placementMarker = createPlacementMarker(mesh); shapes.push(mesh); } selectShape(null); },
    () => { for (const mesh of removed) disposeMesh(mesh); }
  );
}

function duplicateSelected() {
  if (!selected) return;
  const src = selected;
  const mesh = new THREE.Mesh(src.geometry.clone(), src.material.clone());
  mesh.position.copy(src.position); mesh.position.x += 20; mesh.position.z += 20;
  mesh.scale.copy(src.scale);
  mesh.userData.restHeight = src.userData.restHeight;
  mesh.userData.isHole = src.userData.isHole;
  mesh.userData.holeBottom = src.userData.holeBottom;
  mesh.userData.holeShape = src.userData.holeShape;
  mesh.userData.shapeType = src.userData.shapeType;
  mesh.userData.spinAngle = src.userData.spinAngle;
  mesh.userData.tiltAngle = src.userData.tiltAngle;
  applyOrientation(mesh);
  scene.add(mesh);
  mesh.userData.placementMarker = createPlacementMarker(mesh);
  shapes.push(mesh);
  selectShape(mesh);
}

// Skär den valda hål-formen ur alla former den överlappar
function cutHole() {
  if (!selected || !selected.userData.isHole) {
    flashButton(cutBtn, 'Välj en hålform');
    return;
  }
  const holeMesh = selected;
  const holeBox = new THREE.Box3().setFromObject(holeMesh);
  const targets = shapes.filter(m => m !== holeMesh && !m.userData.isHole && holeBox.intersectsBox(new THREE.Box3().setFromObject(m)));
  if (!targets.length) {
    flashButton(cutBtn, 'Inget att skära i');
    return;
  }

  const holePolys = meshToPolygons(holeMesh);
  const undoEntries = [];

  for (const mesh of targets) {
    const oldGeometry = mesh.geometry;
    const oldPosition = mesh.position.clone();
    const oldRotation = mesh.rotation.clone();
    const oldScale = mesh.scale.clone();
    const oldRestHeight = mesh.userData.restHeight;
    const oldSpinAngle = mesh.userData.spinAngle;
    const oldTiltAngle = mesh.userData.tiltAngle;

    const solidPolys = meshToPolygons(mesh);
    const resultPolys = csgSubtract(solidPolys, holePolys);
    if (!resultPolys.length) continue;

    const newGeometry = polygonsToGeometry(resultPolys);
    newGeometry.computeBoundingBox();
    const bbox = newGeometry.boundingBox;
    const cx = (bbox.min.x + bbox.max.x) / 2;
    const cz = (bbox.min.z + bbox.max.z) / 2;
    newGeometry.translate(-cx, 0, -cz); // centrera bara X/Z (bra rotations-pivå), Y är redan world-korrekt

    mesh.geometry = newGeometry;
    mesh.position.set(cx, 0, cz);
    mesh.rotation.set(0, 0, 0);
    mesh.scale.set(1, 1, 1);
    mesh.userData.restHeight = 0;
    // Nollställ även spinn/vinkel-tracking så den matchar den nollställda rotationen -
    // annars skulle NÄSTA nyp-rotation hoppa till det gamla (nu inaktuella) spinn-värdet.
    mesh.userData.spinAngle = 0;
    mesh.userData.tiltAngle = 0;

    undoEntries.push({ mesh, oldGeometry, newGeometry, oldPosition, oldRotation, oldScale, oldRestHeight, oldSpinAngle, oldTiltAngle });
  }

  scene.remove(holeMesh);
  removePlacementMarker(holeMesh);
  forgetIfPrevious(holeMesh);
  const hi = shapes.indexOf(holeMesh);
  if (hi >= 0) shapes.splice(hi, 1);
  selectShape(null);

  setUndo(
    () => {
      for (const en of undoEntries) {
        en.mesh.geometry = en.oldGeometry;
        en.mesh.position.copy(en.oldPosition);
        en.mesh.rotation.copy(en.oldRotation);
        en.mesh.scale.copy(en.oldScale);
        en.mesh.userData.restHeight = en.oldRestHeight;
        en.mesh.userData.spinAngle = en.oldSpinAngle;
        en.mesh.userData.tiltAngle = en.oldTiltAngle;
        en.newGeometry.dispose();
      }
      scene.add(holeMesh);
      holeMesh.userData.placementMarker = createPlacementMarker(holeMesh);
      shapes.push(holeMesh);
      selectShape(holeMesh);
    },
    () => {
      for (const en of undoEntries) en.oldGeometry.dispose();
      disposeMesh(holeMesh);
    }
  );
}

// --- STL-export (binär STL, skriven för hand - inga externa beroenden) ---
function countTriangles(meshList) {
  let count = 0;
  for (const mesh of meshList) {
    const geo = mesh.geometry;
    count += geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3;
  }
  return count;
}

function exportSTL(meshList) {
  const triCount = countTriangles(meshList);
  const buffer = new ArrayBuffer(84 + 50 * triCount);
  const dv = new DataView(buffer);
  let offset = 80;
  dv.setUint32(offset, triCount, true); offset += 4;

  const vA = new THREE.Vector3(), vB = new THREE.Vector3(), vC = new THREE.Vector3();
  const cb = new THREE.Vector3(), ab = new THREE.Vector3();

  for (const mesh of meshList) {
    mesh.updateMatrixWorld(true);
    const geo = mesh.geometry;
    const pos = geo.attributes.position;
    const index = geo.index;
    const triN = index ? index.count / 3 : pos.count / 3;

    for (let t = 0; t < triN; t++) {
      const i0 = index ? index.getX(t * 3) : t * 3;
      const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
      const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;

      vA.fromBufferAttribute(pos, i0).applyMatrix4(mesh.matrixWorld);
      vB.fromBufferAttribute(pos, i1).applyMatrix4(mesh.matrixWorld);
      vC.fromBufferAttribute(pos, i2).applyMatrix4(mesh.matrixWorld);

      cb.subVectors(vC, vB);
      ab.subVectors(vA, vB);
      cb.cross(ab).normalize();

      dv.setFloat32(offset, cb.x, true); offset += 4;
      dv.setFloat32(offset, cb.y, true); offset += 4;
      dv.setFloat32(offset, cb.z, true); offset += 4;
      for (const v of [vA, vB, vC]) {
        dv.setFloat32(offset, v.x, true); offset += 4;
        dv.setFloat32(offset, v.y, true); offset += 4;
        dv.setFloat32(offset, v.z, true); offset += 4;
      }
      dv.setUint16(offset, 0, true); offset += 2;
    }
  }
  return buffer;
}

// --- Toolbar (HTML overlay, ligger längst upp) ---
const toolbar = document.createElement('div');
toolbar.style.cssText = `
  position: absolute; top: 0; left: 0; right: 0;
  display: flex; flex-wrap: wrap; align-items: center; gap: ${px(6)};
  padding: ${px(8)}; box-sizing: border-box;
  background: rgba(0,0,0,0.55);
  z-index: 10; font-family: system-ui, sans-serif;
`;
wrapper.appendChild(toolbar);

function makeButton(label, onClick, accent) {
  const btn = document.createElement('button');
  btn.textContent = label;
  btn.style.cssText = `
    padding: ${px(8)} ${px(12)}; min-height: ${px(40)};
    border-radius: ${px(8)}; border: 1px solid #555;
    background: ${accent ? '#3a7bd5' : '#2a2a2a'};
    color: #fff; font-size: ${px(13)}; touch-action: manipulation;
  `;
  btn.addEventListener('click', onClick);
  toolbar.appendChild(btn);
  return btn;
}
function addDivider() {
  const div = document.createElement('div');
  div.style.cssText = 'width:1px; align-self:stretch; background:#444; margin:0 2px;';
  toolbar.appendChild(div);
}
function flashButton(btn, text, ms) {
  const original = btn.textContent;
  btn.textContent = text;
  setTimeout(() => { btn.textContent = original; }, ms || 1200);
}

const shapeLabels = { cube: 'Kub', sphere: 'Sfär', cylinder: 'Cylinder', cone: 'Kon', pyramid: 'Pyramid', torus: 'Ring' };
for (const type in shapeLabels) makeButton(shapeLabels[type], () => addShape(type));

addDivider();
makeButton('○ Rundhål', () => addShape('holeRound'));
makeButton('□ Fyrkanthål', () => addShape('holeSquare'));

addDivider();
const xrayBtn = makeButton('◐ Klippläge', () => {
  manualXrayIndex = (manualXrayIndex + 1) % XRAY_MODES.length;
  refreshXray();
  updateToolbarState();
});
const cutBtn = makeButton('✂ Skär hål', cutHole);
const duplicateBtn = makeButton('Kopiera', duplicateSelected);
const undoBtn = makeButton('Ångra', performUndo);
const deleteBtn = makeButton('🗑 Ta bort', deleteSelected);

let clearArmed = false, clearTimer = null;
function resetClearBtn() {
  clearArmed = false;
  clearBtn.textContent = 'Rensa allt';
  clearBtn.style.background = '#2a2a2a';
}
const clearBtn = makeButton('Rensa allt', () => {
  if (!shapes.length) return;
  if (!clearArmed) {
    clearArmed = true;
    clearBtn.textContent = 'Säker? Tryck igen';
    clearBtn.style.background = '#a53a3a';
    clearTimer = setTimeout(resetClearBtn, 3000);
  } else {
    clearTimeout(clearTimer);
    clearAll();
    resetClearBtn();
  }
});

const fullscreenBtn = makeButton('⛶ Helskärm', async () => {
  try {
    if (!document.fullscreenElement) {
      await wrapper.requestFullscreen();
      try { await screen.orientation.lock('landscape'); } catch (e) { /* stöds inte överallt, ignorera */ }
    } else {
      await document.exitFullscreen();
    }
  } catch (e) {
    console.warn('Helskärm stöds inte här:', e);
  }
});
function onFullscreenChange() {
  fullscreenBtn.textContent = document.fullscreenElement ? '⛶ Avsluta helskärm' : '⛶ Helskärm';
  onResize();
}
document.addEventListener('fullscreenchange', onFullscreenChange);

const exportBtn = makeButton('⬇ Exportera STL', () => {
  const printable = shapes.filter(m => !m.userData.isHole);
  if (!printable.length) return;
  const buffer = exportSTL(printable);
  const blob = new Blob([buffer], { type: 'application/sla' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `kanvas-modell-${Date.now()}.stl`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}, true);

// --- "Samma plats"-rad (vänster sida, ovanför botten/vinkel-menyn) ---
// Flyttar VALD form till samma X/Z som den NÄST SENAST valda formen (den orangea
// rutan). Markera form A, markera form B, tryck knappen -> B hamnar där A är.
const alignRow = document.createElement('div');
alignRow.style.cssText = `
  position: absolute; left: ${px(8)}; width: ${px(96)};
  display: none; flex-direction: column; gap: ${px(6)}; z-index: 10;
`;
wrapper.appendChild(alignRow);

function makeSideButton(container, label, onClick, flexWidth) {
  const b = document.createElement('button');
  b.textContent = label;
  b.style.cssText = `
    ${flexWidth ? 'flex:1;' : 'width:100%;'} min-height: ${px(36)};
    border-radius: ${px(8)}; border: 1px solid #555;
    background: #2a2a2a; color: #fff; font-size: ${px(13)}; touch-action: manipulation;
  `;
  b.addEventListener('click', onClick);
  container.appendChild(b);
  return b;
}
const alignBtn = makeSideButton(alignRow, '➜ Samma plats', () => {
  if (!selected || !prevSelected || prevSelected === selected || !shapes.includes(prevSelected)) return;
  selected.position.x = prevSelected.position.x;
  selected.position.z = prevSelected.position.z;
  updateToolbarState();
});
// Markera A genom att trycka på en specifik yta av den, markera sen B - då
// flyttas/vinklas B så att dess botten (eller för hål: ingången) hamnar exakt
// på den ytan, riktad rätt mot den. Kräver att A verkligen TRYCKTES på (inte
// bara blev vald på annat sätt), annars finns ingen sparad yta att utgå från.
const surfaceBtn = makeSideButton(alignRow, '⊞ På yta', () => {
  if (!selected || !prevSelected || prevSelected === selected || !shapes.includes(prevSelected)) return;
  if (!prevSelectedFace) {
    flashButton(surfaceBtn, 'Tryck på en yta först');
    return;
  }
  const downDir = prevSelectedFace.normal.clone().multiplyScalar(-1);
  placeOnFace(selected, prevSelectedFace.point, downDir);
  updateToolbarState();
});
// Smart knapp: om vald form redan är ihoplåst med något - lås upp DEN (behåller
// resten av gruppen ihop). Annars, om två giltiga former är markerade - lås
// ihop dem. Flytt (drag/joystick) på VILKEN medlem som helst rör hela gruppen.
const lockBtn = makeSideButton(alignRow, '🔒 Lås ihop', () => {
  if (!selected) return;
  if (selected.userData.groupId) {
    unlockSelected();
  } else {
    if (!prevSelected || prevSelected === selected || !shapes.includes(prevSelected)) {
      flashButton(lockBtn, 'Markera 2 former först');
      return;
    }
    lockTogether(selected, prevSelected);
  }
  updateToolbarState();
});

// --- Vänstermeny: Botten + Vinkel (syns bara när ett hål är valt) ---
// Ligger till vänster istället för mitt i vyn, så den inte skymmer det du jobbar med.
const sidePanel = document.createElement('div');
sidePanel.style.cssText = `
  position: absolute; left: ${px(8)}; bottom: ${px(40)}; width: ${px(96)};
  display: none; flex-direction: column; align-items: stretch; gap: ${px(8)};
  overflow-y: auto; background: rgba(0,0,0,0.55); padding: ${px(8)}; border-radius: ${px(10)};
  font-family: system-ui, sans-serif; z-index: 10;
`;
wrapper.appendChild(sidePanel);

function sideTitle(text) {
  const t = document.createElement('div');
  t.textContent = text;
  t.style.cssText = `color:#aaa; font-size:${px(11)}; text-align:center;`;
  sidePanel.appendChild(t);
  return t;
}

sideTitle('Botten');
const bottomLabel = document.createElement('div');
bottomLabel.style.cssText = `color:#fff; font-size:${px(12)}; text-align:center;`;
sidePanel.appendChild(bottomLabel);
const bottomRow = document.createElement('div');
bottomRow.style.cssText = `display:flex; gap:${px(6)};`;
sidePanel.appendChild(bottomRow);
const bottomMinus = makeSideButton(bottomRow, '−', () => {
  if (!selected || !selected.userData.isHole) return;
  setHoleBottom(selected, selected.userData.holeBottom - HOLE_BOTTOM_STEP);
  applyGroupHoleBottomDelta(selected, -HOLE_BOTTOM_STEP);
  updateToolbarState();
}, true);
const bottomPlus = makeSideButton(bottomRow, '+', () => {
  if (!selected || !selected.userData.isHole) return;
  setHoleBottom(selected, selected.userData.holeBottom + HOLE_BOTTOM_STEP);
  applyGroupHoleBottomDelta(selected, HOLE_BOTTOM_STEP);
  updateToolbarState();
}, true);

const sideDivider = document.createElement('div');
sideDivider.style.cssText = 'height:1px; background:#444; margin:2px 0;';
sidePanel.appendChild(sideDivider);

sideTitle('Vinkel');
const TILT_ANGLES = [15, 30, 45, 60, 90];
const angleButtons = TILT_ANGLES.map(deg => {
  const btn = makeSideButton(sidePanel, deg + '°', () => {
    if (!selected || !selected.userData.isHole) return;
    const rad = deg * Math.PI / 180;
    const current = selected.userData.tiltAngle || 0;
    const newAngle = Math.abs(current - rad) < 0.0001 ? 0 : rad;
    setTilt(selected, newAngle);
    applyGroupTilt(selected, newAngle);
    updateToolbarState();
  });
  return { deg, btn };
});

// --- Koordinat-ruta (höger sida) ---
// Visar X/Z/H för DEN VALDA formen, oavsett om det är ett objekt eller ett skär.
// Ligger fast till höger (inte vid själva formen) så den inte hamnar under fingret
// när du drar/nyper. Uppdateras live i renderloopen, se updatePlacementMarkers.
const coordBox = document.createElement('div');
coordBox.style.cssText = `
  position: absolute; right: ${px(8)}; min-width: ${px(84)};
  display: none; flex-direction: column; gap: ${px(3)};
  background: rgba(0,0,0,0.55); padding: ${px(8)} ${px(10)}; border-radius: ${px(10)};
  font-family: system-ui, sans-serif; z-index: 10;
`;
wrapper.appendChild(coordBox);
const coordTitle = document.createElement('div');
coordTitle.textContent = 'Position';
coordTitle.style.cssText = `color:#aaa; font-size:${px(11)}; margin-bottom:${px(2)};`;
coordBox.appendChild(coordTitle);
let coordMode = 'world'; // 'world' = bäddens (0,0) | 'workarea' = mitten av hela arbetsytan
const coordModeBtn = document.createElement('button');
coordModeBtn.style.cssText = `
  width: 100%; margin-bottom: ${px(2)}; padding: ${px(3)} ${px(4)}; min-height: ${px(22)};
  border-radius: ${px(6)}; border: 1px solid #555; background: #2a2a2a;
  color: #ccc; font-size: ${px(10)}; touch-action: manipulation; font-family: system-ui, sans-serif;
`;
coordModeBtn.textContent = 'Ref: Bädd';
coordModeBtn.addEventListener('click', () => {
  coordMode = coordMode === 'world' ? 'workarea' : 'world';
  coordModeBtn.textContent = coordMode === 'world' ? 'Ref: Bädd' : 'Ref: Hela ytan';
});
coordBox.appendChild(coordModeBtn);
function coordLine() {
  const line = document.createElement('div');
  line.style.cssText = `color:#fff; font-size:${px(11)};`;
  coordBox.appendChild(line);
  return line;
}
const coordXEl = coordLine();
const coordZEl = coordLine();
const coordHEl = coordLine();
const coordQuadEl = document.createElement('div');
coordQuadEl.style.cssText = `color:#ffcc66; font-size:${px(12)}; font-weight:700; margin-top:${px(3)}; padding-top:${px(3)}; border-top:1px solid #444;`;
coordBox.appendChild(coordQuadEl);
function quadrantOf(x, z) {
  if (x >= 0) return z >= 0 ? 1 : 4;
  return z >= 0 ? 2 : 3;
}

// --- Joystick (höger sida, under koordinat-rutan) ---
// Finjusterar X/Z-positionen för vald form. Dra handtaget bort från mitten och
// formen rör sig kontinuerligt åt det hållet (snabbare ju längre ut), släpp så
// fjädrar handtaget tillbaka och rörelsen stannar. Riktningen är kamera-relativ
// (upp på joysticken = bort från kameran i aktuell vy), samma känsla som att dra
// direkt i formen.
const JOYSTICK_SIZE = Math.round(76 * UI_SCALE), JOYSTICK_RADIUS = Math.round(33 * UI_SCALE);
const JOYSTICK_CENTER = JOYSTICK_SIZE / 2;
const JOYSTICK_HANDLE = Math.round(30 * UI_SCALE);
const JOYSTICK_SPEEDS = [
  { label: '🐢 Sakta', speed: 8, color: '#3a7bd5' },
  { label: 'Normal', speed: 25, color: '#2a2a2a' },
  { label: '⚡ Snabb', speed: 50, color: '#d5763a' }
];
let joystickSpeedIndex = 1; // börjar på "Normal", samma som tidigare standard
const joystickBase = document.createElement('div');
joystickBase.style.cssText = `
  position: absolute; right: ${px(8)}; width: ${JOYSTICK_SIZE}px; height: ${JOYSTICK_SIZE}px;
  border-radius: 50%; background: rgba(255,255,255,0.08); border: 1px solid #555;
  display: none; z-index: 10; touch-action: none;
`;
wrapper.appendChild(joystickBase);
const joystickHandle = document.createElement('div');
joystickHandle.style.cssText = `
  position: absolute; left: ${JOYSTICK_CENTER}px; top: ${JOYSTICK_CENTER}px;
  width: ${JOYSTICK_HANDLE}px; height: ${JOYSTICK_HANDLE}px;
  margin-left: ${-JOYSTICK_HANDLE / 2}px; margin-top: ${-JOYSTICK_HANDLE / 2}px;
  border-radius: 50%; background: #3a7bd5; border: 1px solid #fff;
  touch-action: none;
`;
joystickBase.appendChild(joystickHandle);

// Växlar joystickens hastighet. Sitter till VÄNSTER om joysticken (inte under den)
// och båda är botten-förankrade (se updatePlacementMarkers) - att stapla dem
// uppifrån och ner tog för mycket höjd i liggande läge och tryckte ut knappen
// utanför skärmen.
const speedBtn = document.createElement('button');
speedBtn.style.cssText = `
  position: absolute; right: ${8 + JOYSTICK_SIZE + 8}px; width: ${px(90)}; min-height: ${px(32)};
  border-radius: ${px(8)}; border: 1px solid #555; background: #2a2a2a;
  color: #fff; font-size: ${px(12)}; touch-action: manipulation;
  display: none; z-index: 10; font-family: system-ui, sans-serif;
`;
speedBtn.addEventListener('click', () => {
  joystickSpeedIndex = (joystickSpeedIndex + 1) % JOYSTICK_SPEEDS.length;
  const mode = JOYSTICK_SPEEDS[joystickSpeedIndex];
  speedBtn.textContent = mode.label;
  speedBtn.style.background = mode.color;
});
speedBtn.textContent = JOYSTICK_SPEEDS[joystickSpeedIndex].label;
speedBtn.style.background = JOYSTICK_SPEEDS[joystickSpeedIndex].color;
wrapper.appendChild(speedBtn);

const joystickOffset = { x: 0, y: 0 }; // -1..1, andel av radien
let joystickPointerId = null;
function joystickReset() {
  joystickOffset.x = 0;
  joystickOffset.y = 0;
  joystickHandle.style.left = JOYSTICK_CENTER + 'px';
  joystickHandle.style.top = JOYSTICK_CENTER + 'px';
}
function updateJoystickFromEvent(e) {
  const rect = joystickBase.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  let dx = e.clientX - cx;
  let dy = e.clientY - cy;
  const dist = Math.hypot(dx, dy);
  if (dist > JOYSTICK_RADIUS) {
    dx = dx / dist * JOYSTICK_RADIUS;
    dy = dy / dist * JOYSTICK_RADIUS;
  }
  joystickOffset.x = dx / JOYSTICK_RADIUS;
  joystickOffset.y = dy / JOYSTICK_RADIUS;
  joystickHandle.style.left = (JOYSTICK_CENTER + dx) + 'px';
  joystickHandle.style.top = (JOYSTICK_CENTER + dy) + 'px';
}
joystickBase.addEventListener('pointerdown', (e) => {
  if (!selected) return;
  e.preventDefault();
  e.stopPropagation();
  joystickPointerId = e.pointerId;
  joystickBase.setPointerCapture(e.pointerId);
  updateJoystickFromEvent(e);
});
joystickBase.addEventListener('pointermove', (e) => {
  if (e.pointerId !== joystickPointerId) return;
  e.preventDefault();
  updateJoystickFromEvent(e);
});
function endJoystick(e) {
  if (e.pointerId !== joystickPointerId) return;
  joystickPointerId = null;
  joystickReset();
}
joystickBase.addEventListener('pointerup', endJoystick);
joystickBase.addEventListener('pointercancel', endJoystick);
joystickBase.addEventListener('pointerleave', endJoystick);

const _joyForward = new THREE.Vector3(), _joyRight = new THREE.Vector3();
function applyJoystickMovement(dt) {
  if (!selected || (joystickOffset.x === 0 && joystickOffset.y === 0)) return;
  camera.getWorldDirection(_joyForward);
  _joyForward.y = 0;
  if (_joyForward.lengthSq() < 1e-6) return;
  _joyForward.normalize();
  _joyRight.crossVectors(_joyForward, _upAxis).normalize();
  const speed = JOYSTICK_SPEEDS[joystickSpeedIndex].speed * dt;
  const dx = (_joyRight.x * joystickOffset.x + _joyForward.x * -joystickOffset.y) * speed;
  const dz = (_joyRight.z * joystickOffset.x + _joyForward.z * -joystickOffset.y) * speed;
  selected.position.x += dx;
  selected.position.z += dz;
  applyGroupDelta(selected, dx, dz);
}

// Toolbaren kan radbryta olika många rader beroende på skärmbredd. Håll koll på dess
// faktiska höjd och flytta vänstermenyn, "Samma plats"-raden och koordinat-rutan så
// de alltid hamnar precis under den istället för att gissa fasta pixelvärden.
// (Joystickens position räknas ut separat i updatePlacementMarkers, eftersom den
// måste mätas när koordinat-rutan faktiskt är synlig - annars blir höjden 0.)
function updateSidePanelPositions() {
  const top = Math.round(toolbar.getBoundingClientRect().height) + 8;
  alignRow.style.top = top + 'px';
  coordBox.style.top = top + 'px';
}
const toolbarResizeObserver = new ResizeObserver(updateSidePanelPositions);
toolbarResizeObserver.observe(toolbar);
updateSidePanelPositions();

function updateToolbarState() {
  const printableCount = shapes.filter(m => !m.userData.isHole).length;
  deleteBtn.style.opacity = selected ? '1' : '0.4';
  duplicateBtn.style.opacity = selected ? '1' : '0.4';
  cutBtn.style.opacity = (selected && selected.userData.isHole) ? '1' : '0.4';
  undoBtn.style.opacity = undoAction ? '1' : '0.4';
  exportBtn.style.opacity = printableCount ? '1' : '0.4';
  clearBtn.style.opacity = shapes.length ? '1' : '0.4';

  xrayBtn.textContent = XRAY_MODES[manualXrayIndex].label;
  xrayBtn.style.background = XRAY_MODES[manualXrayIndex].color;

  alignRow.style.display = selected ? 'flex' : 'none';
  const canAlign = !!(selected && prevSelected && prevSelected !== selected && shapes.includes(prevSelected));
  alignBtn.style.opacity = canAlign ? '1' : '0.4';
  surfaceBtn.style.opacity = (canAlign && prevSelectedFace) ? '1' : '0.4';
  const selectedLocked = !!(selected && selected.userData.groupId);
  lockBtn.textContent = selectedLocked ? '🔓 Lås upp' : '🔒 Lås ihop';
  lockBtn.style.opacity = (selectedLocked || canAlign) ? '1' : '0.4';

  // sidePanel ska alltid hamna precis under alignRow. Mäter dess FAKTISKA höjd
  // just nu (alignRow kan variera i höjd) istället för att gissa ett fast
  // pixelvärde - samma "mät, gissa inte"-princip som fixade koordinat-rutan
  // och joysticken tidigare.
  const wrapperTop = wrapper.getBoundingClientRect().top;
  const alignBottom = selected ? alignRow.getBoundingClientRect().bottom : toolbar.getBoundingClientRect().bottom;
  sidePanel.style.top = Math.round(alignBottom - wrapperTop + 8) + 'px';

  const showHolePanels = !!(selected && selected.userData.isHole);
  sidePanel.style.display = showHolePanels ? 'flex' : 'none';
  if (showHolePanels) {
    const b = selected.userData.holeBottom;
    bottomLabel.textContent = b <= HOLE_BOTTOM_MIN + 0.01 ? 'Genomgående' : `${b}mm`;
    const currentDeg = Math.round((selected.userData.tiltAngle || 0) * 180 / Math.PI);
    for (const { deg, btn } of angleButtons) {
      btn.style.background = (deg === currentDeg) ? '#3a7bd5' : '#2a2a2a';
    }
  }
}
updateToolbarState();

// --- Hint-text ---
const hint = document.createElement('div');
hint.textContent = 'Tryck: välj • Dra: flytta/kamera • Nyp: skala+spinn/zooma • Kub: dra röd/grön/blå prick för bredd/höjd/längd • Joystick: finjustera position';
hint.style.cssText = `
  position: absolute; bottom: 4px; left: 8px; right: 8px;
  color: #999; font-size: ${px(11)}; font-family: system-ui, sans-serif;
  pointer-events: none; text-align: center; text-shadow: 0 1px 2px #000;
`;
wrapper.appendChild(hint);

// --- Pekgester (pointer events, funkar för touch och mus) ---
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

function getNDC(clientX, clientY) {
  const rect = renderer.domElement.getBoundingClientRect();
  ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  return ndc;
}
function pickShape(clientX, clientY) {
  getNDC(clientX, clientY);
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(shapes, false);
  return hits.length ? hits[0] : null;
}
function groundPoint(clientX, clientY, heightY) {
  getNDC(clientX, clientY);
  raycaster.setFromCamera(ndc, camera);
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -heightY);
  const point = new THREE.Vector3();
  const hit = raycaster.ray.intersectPlane(plane, point);
  return hit || point;
}
function distanceAngle(p1, p2) {
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  return { dist: Math.hypot(dx, dy), angle: Math.atan2(dy, dx) };
}

// --- Kub-storlek via handtag: rayträffar ett plan genom formens centrum, vänt
// mot kameran, och mäter hur långt träffpunkten ligger utmed vald axel. ---
const _resizePlane = new THREE.Plane();
const _resizeHit = new THREE.Vector3();
const _resizeOffset = new THREE.Vector3();
const _resizeAxisDir = new THREE.Vector3();
const _camDir = new THREE.Vector3();
function updateResizeDrag(clientX, clientY) {
  if (!selected) return;
  getNDC(clientX, clientY);
  raycaster.setFromCamera(ndc, camera);
  camera.getWorldDirection(_camDir);
  _resizePlane.setFromNormalAndCoplanarPoint(_camDir, selected.position);
  const hit = raycaster.ray.intersectPlane(_resizePlane, _resizeHit);
  if (!hit) return;
  _resizeOffset.subVectors(_resizeHit, selected.position);
  _resizeAxisDir.set(0, 0, 0);
  _resizeAxisDir[resizeAxis] = 1;
  _resizeAxisDir.applyQuaternion(selected.quaternion);
  const distAlongAxis = Math.abs(_resizeOffset.dot(_resizeAxisDir));
  const newScale = Math.max(0.1, Math.min(8, Math.max(2, distAlongAxis) / CUBE_HALF));
  selected.scale[resizeAxis] = newScale;
  if (resizeAxis === 'y') {
    selected.position.y = selected.userData.restHeight * newScale;
  }
}

const pointers = new Map();
let mode = null; // 'orbit' | 'moveObject' | 'pinchObject' | 'pinchCamera' | 'resizeHandle'
let dragStart = null;
let pinchStart = null;
let lastSingle = null;
let resizeAxis = null;

function onPointerDown(e) {
  e.preventDefault();
  renderer.domElement.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (pointers.size === 1) {
    const handleAxis = pickHandle(e.clientX, e.clientY);
    if (handleAxis) {
      mode = 'resizeHandle';
      resizeAxis = handleAxis;
      return;
    }
    const hit = pickShape(e.clientX, e.clientY);
    if (hit) {
      selectShape(hit.object, hit);
      mode = 'moveObject';
      const gp = groundPoint(e.clientX, e.clientY, selected.position.y);
      dragStart = { offsetX: selected.position.x - gp.x, offsetZ: selected.position.z - gp.z };
    } else {
      selectShape(null);
      mode = 'orbit';
      lastSingle = { x: e.clientX, y: e.clientY };
    }
  } else if (pointers.size === 2) {
    const pts = Array.from(pointers.values());
    const { dist, angle } = distanceAngle(pts[0], pts[1]);
    if (selected) {
      mode = 'pinchObject';
      const groupMembers = selected.userData.groupId
        ? shapes.filter(m => m !== selected && m.userData.groupId === selected.userData.groupId).map(m => ({
            mesh: m,
            relPos: m.position.clone().sub(selected.position),
            scaleX: m.scale.x, scaleY: m.scale.y, scaleZ: m.scale.z,
            spin: m.userData.spinAngle || 0,
            isHole: m.userData.isHole,
            restHeight: m.userData.restHeight
          }))
        : [];
      pinchStart = {
        dist, angle,
        scaleX: selected.scale.x, scaleY: selected.scale.y, scaleZ: selected.scale.z,
        rotY: selected.userData.spinAngle || 0,
        groupMembers
      };
    } else {
      mode = 'pinchCamera';
      pinchStart = { dist, angle, radius: camRadius, theta: camTheta };
    }
  }
}

function onPointerMove(e) {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (mode === 'resizeHandle' && pointers.size === 1) {
    updateResizeDrag(e.clientX, e.clientY);
  } else if (mode === 'moveObject' && selected && pointers.size === 1) {
    const gp = groundPoint(e.clientX, e.clientY, selected.position.y);
    const newX = gp.x + dragStart.offsetX;
    const newZ = gp.z + dragStart.offsetZ;
    const dx = newX - selected.position.x;
    const dz = newZ - selected.position.z;
    selected.position.x = newX;
    selected.position.z = newZ;
    applyGroupDelta(selected, dx, dz);
  } else if (mode === 'orbit' && pointers.size === 1) {
    const dx = e.clientX - lastSingle.x;
    const dy = e.clientY - lastSingle.y;
    camTheta -= dx * 0.008;
    camPhi -= dy * 0.008;
    lastSingle = { x: e.clientX, y: e.clientY };
    updateCamera();
  } else if (pointers.size === 2 && (mode === 'pinchObject' || mode === 'pinchCamera')) {
    const pts = Array.from(pointers.values());
    const { dist, angle } = distanceAngle(pts[0], pts[1]);
    const scaleFactor = dist / pinchStart.dist;
    const angleDelta = angle - pinchStart.angle;

    if (mode === 'pinchObject' && selected) {
      if (selected.userData.isHole) {
        const newScale = Math.max(0.15, Math.min(6, pinchStart.scaleX * scaleFactor));
        selected.scale.x = newScale;
        selected.scale.z = newScale;
      } else {
        // Multiplikativt per axel (inte ett gemensamt scale.setScalar) så att en
        // kub som fått olika bredd/höjd/längd via handtagen behåller sina
        // PROPORTIONER när man nyper - nypet växer/krymper helheten istället för
        // att tvinga tillbaka alla tre axlar till samma värde.
        selected.scale.x = Math.max(0.1, Math.min(8, pinchStart.scaleX * scaleFactor));
        selected.scale.y = Math.max(0.1, Math.min(8, pinchStart.scaleY * scaleFactor));
        selected.scale.z = Math.max(0.1, Math.min(8, pinchStart.scaleZ * scaleFactor));
        selected.position.y = selected.userData.restHeight * selected.scale.y;
      }
      selected.userData.spinAngle = pinchStart.rotY + angleDelta;
      applyOrientation(selected);

      // Låsta gruppmedlemmar: kretsar runt den valda formen (position roterad+
      // skalad relativt startläget) och skalar/roterar sin EGEN storlek med
      // samma faktor/delta, så hela låsta assemblyn rör sig ihop.
      for (const gm of pinchStart.groupMembers) {
        const rel = gm.relPos.clone().applyAxisAngle(_upAxis, angleDelta).multiplyScalar(scaleFactor);
        gm.mesh.position.x = selected.position.x + rel.x;
        gm.mesh.position.z = selected.position.z + rel.z;
        if (gm.isHole) {
          const s = Math.max(0.15, Math.min(6, gm.scaleX * scaleFactor));
          gm.mesh.scale.x = s;
          gm.mesh.scale.z = s;
        } else {
          gm.mesh.scale.x = Math.max(0.1, Math.min(8, gm.scaleX * scaleFactor));
          gm.mesh.scale.y = Math.max(0.1, Math.min(8, gm.scaleY * scaleFactor));
          gm.mesh.scale.z = Math.max(0.1, Math.min(8, gm.scaleZ * scaleFactor));
          gm.mesh.position.y = gm.restHeight * gm.mesh.scale.y;
        }
        gm.mesh.userData.spinAngle = gm.spin + angleDelta;
        applyOrientation(gm.mesh);
      }
    } else if (mode === 'pinchCamera') {
      camRadius = Math.max(50, Math.min(1200, pinchStart.radius / scaleFactor));
      camTheta = pinchStart.theta - angleDelta;
      updateCamera();
    }
  }
}

function onPointerUp(e) {
  if (pointers.has(e.pointerId)) {
    try { renderer.domElement.releasePointerCapture(e.pointerId); } catch (err) { /* redan släppt */ }
    pointers.delete(e.pointerId);
  }
  if (pointers.size === 0) {
    mode = null; dragStart = null; pinchStart = null; lastSingle = null; resizeAxis = null;
  } else if (pointers.size === 1) {
    const remaining = Array.from(pointers.values())[0];
    mode = 'orbit';
    lastSingle = { x: remaining.x, y: remaining.y };
  }
}

renderer.domElement.addEventListener('pointerdown', onPointerDown);
renderer.domElement.addEventListener('pointermove', onPointerMove);
renderer.domElement.addEventListener('pointerup', onPointerUp);
renderer.domElement.addEventListener('pointercancel', onPointerUp);
renderer.domElement.addEventListener('pointerleave', onPointerUp);

// --- Storleksändring ---
function onResize() {
  const rect = wrapper.getBoundingClientRect();
  const w = Math.max(1, rect.width);
  const h = Math.max(1, rect.height);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}
const resizeObserver = new ResizeObserver(onResize);
resizeObserver.observe(wrapper);
onResize();

// --- Renderloop ---
let animationId;
let lastFrameTime = performance.now();
function animate() {
  const now = performance.now();
  const dt = Math.min((now - lastFrameTime) / 1000, 0.1);
  lastFrameTime = now;

  applyJoystickMovement(dt);
  if (selectionBox && selected) selectionBox.update();
  if (prevBox && prevSelected) prevBox.update();
  renderer.render(scene, camera);
  const rect = renderer.domElement.getBoundingClientRect();
  if (edgeOverlays.length) updateEdgeLabels(rect);
  updatePlacementMarkers();
  positionLabel(spawnLabelEl, SPAWN_LABEL_POS, rect, 'Nya former hamnar här');
  positionLabel(axisLabelX, AXIS_LABEL_POS_X, rect, 'X');
  positionLabel(axisLabelY, AXIS_LABEL_POS_Y, rect, 'Y');
  positionLabel(axisLabelZ, AXIS_LABEL_POS_Z, rect, 'Z');
  for (const q of quadrantLabels) positionLabel(q.el, q.pos, rect, q.text);
  animationId = requestAnimationFrame(animate);
}
animationId = requestAnimationFrame(animate);

// --- Städning när rutan tas bort ---
el._disposers = el._disposers || [];
el._disposers.push(() => {
  cancelAnimationFrame(animationId);
  resizeObserver.disconnect();
  toolbarResizeObserver.disconnect();
  document.removeEventListener('fullscreenchange', onFullscreenChange);
  renderer.domElement.removeEventListener('pointerdown', onPointerDown);
  renderer.domElement.removeEventListener('pointermove', onPointerMove);
  renderer.domElement.removeEventListener('pointerup', onPointerUp);
  renderer.domElement.removeEventListener('pointercancel', onPointerUp);
  renderer.domElement.removeEventListener('pointerleave', onPointerUp);
  if (undoDiscard) undoDiscard();
  exitXrayMode();
  removeCubeHandles();
  XRAY_HIDDEN_MATERIAL.dispose();
  if (selectionBox) { selectionBox.geometry.dispose(); selectionBox.material.dispose(); }
  if (prevBox) { prevBox.geometry.dispose(); prevBox.material.dispose(); }
  for (const line of originLines) { scene.remove(line); line.geometry.dispose(); line.material.dispose(); }
  for (const mesh of shapes) { removePlacementMarker(mesh); disposeMesh(mesh); }
  centerDotGeo.dispose(); centerDotMat.dispose(); centerDotMatLocked.dispose();
  dirLineGeo.dispose(); dirLineMat.dispose();
  handleGeo.dispose(); handleMatX.dispose(); handleMatY.dispose(); handleMatZ.dispose();
  shapes.length = 0;
  bedMesh.geometry.dispose();
  bedMesh.material.dispose();
  scene.remove(spawnGrid);
  spawnGrid.geometry.dispose(); spawnGrid.material.dispose();
  scene.remove(spawnPlaneMesh);
  spawnPlaneMesh.geometry.dispose(); spawnPlaneMesh.material.dispose();
  spawnLabelEl.remove();
  axisLabelX.remove(); axisLabelY.remove(); axisLabelZ.remove();
  for (const q of quadrantLabels) q.el.remove();
  renderer.dispose();
  if (wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
});
