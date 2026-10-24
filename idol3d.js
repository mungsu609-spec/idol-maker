// ===== 3D 아이돌 (VRM) — 무대·동작·꾸미기·사진 찍기 =====
// three.js + @pixiv/three-vrm (오픈소스), 모델: VRoid 공식 샘플 (CC0)
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

export const MODELS = {
  girl: [
    ['AvatarSample_G', '핑크 아이돌'], ['HairSample_Female', '고양이 귀 소녀'], ['AvatarSample_D', '교복 단발'], ['Sendagaya_Shino', '교복 장발'],
    ['AvatarSample_F', '사이버 걸'], ['AvatarSample_D_Darkness', '고딕 소녀'], ['AvatarSample_E', '숲속 소녀'], ['Base_Female', '청록 머리'],
  ],
  boy: [['Sakurada_Fumiriya', '갈색 머리 소년'], ['HairSample_Male', '후드티 소년'], ['Base_Male', '청록 머리 소년']],
};
const BASE = new URL('art/vrm/', import.meta.url).href;
const loader = new GLTFLoader();
loader.register(p => new VRMLoaderPlugin(p));
const cache = new Map();          // 모델 이름 → Promise<gltf ArrayBuffer>
function fetchModel(name) {
  if (!cache.has(name)) cache.set(name, fetch(BASE + name + '.vrm').then(r => { if (!r.ok) throw new Error(name + ' ' + r.status); return r.arrayBuffer(); }));
  return cache.get(name);
}
async function loadVRM(name) {
  const buf = await fetchModel(name);
  const gltf = await loader.parseAsync(buf.slice(0), '');
  const vrm = gltf.userData.vrm;
  VRMUtils.removeUnnecessaryVertices(gltf.scene);
  VRMUtils.rotateVRM0(vrm);
  vrm.scene.traverse(o => { o.frustumCulled = false; });
  vrm.v0 = vrm.meta && vrm.meta.metaVersion === '0';
  return vrm;
}

// --- 머리 색: 머리카락 그림을 흑백으로 바꾼 뒤 원하는 색을 곱함
function grayMap(tex) {
  const img = tex.image; if (!img || !img.width) return null;
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height), a = d.data;
  let mx = 0; for (let i = 0; i < a.length; i += 4) { const l = a[i] * .3 + a[i + 1] * .59 + a[i + 2] * .11; if (l > mx) mx = l; }
  const k = mx ? 255 / mx : 1;
  for (let i = 0; i < a.length; i += 4) { const l = Math.min(255, (a[i] * .3 + a[i + 1] * .59 + a[i + 2] * .11) * k * 1.05); a[i] = a[i + 1] = a[i + 2] = l; }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c); t.flipY = tex.flipY; t.colorSpace = tex.colorSpace; t.wrapS = tex.wrapS; t.wrapT = tex.wrapT; t.needsUpdate = true;
  return t;
}
function mats(vrm, test) {
  const out = []; vrm.scene.traverse(o => { if (o.isMesh) [].concat(o.material).forEach(m => { if (m && test(m.name || '')) out.push(m); }); });
  return [...new Set(out)];
}
function tint(vrm, kind, hex) {
  const list = kind === 'hair' ? mats(vrm, n => /hair/i.test(n)) : mats(vrm, n => /(tops|bottoms|onepice|onepiece|cloth)/i.test(n));
  for (const m of list) {
    if (!m.userData.orig) m.userData.orig = { map: m.map, color: m.color && m.color.clone(), shade: m.shadeColorFactor && m.shadeColorFactor.clone() };
    const O = m.userData.orig;
    if (!hex) { m.map = O.map; if (O.color) m.color.copy(O.color); if (O.shade && m.shadeColorFactor) m.shadeColorFactor.copy(O.shade); }
    else {
      if (!m.userData.gray && O.map) m.userData.gray = grayMap(O.map);
      if (m.userData.gray) m.map = m.userData.gray;
      const c = new THREE.Color(hex); if (m.color) m.color.copy(c);
      if (m.shadeColorFactor) m.shadeColorFactor.copy(c.clone().multiplyScalar(.62));
      if (m.shadeMultiplyTexture !== undefined) m.shadeMultiplyTexture = m.userData.gray || m.shadeMultiplyTexture;
    }
    m.needsUpdate = true;
  }
}
// --- 고양이 귀·꼬리 (털색 = 머리색)
function catParts(vrm, color) {
  const col = new THREE.Color(color || '#3a2a30');
  const mat = new THREE.MeshToonMaterial({ color: col }), inner = new THREE.MeshToonMaterial({ color: new THREE.Color('#ffb3c6') });
  const head = vrm.humanoid.getRawBoneNode('head'), hips = vrm.humanoid.getRawBoneNode('hips');
  const back = vrm.v0 ? 1 : -1;        // VRM0은 앞뒤가 반대
  const grp = new THREE.Group(); grp.name = 'catEars';
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(.052, .1, 4, 1), mat); ear.scale.set(1, 1, .45);
    const inn = new THREE.Mesh(new THREE.ConeGeometry(.034, .066, 4, 1), inner); inn.scale.set(1, 1, .3); inn.position.set(0, -.008, -back * .014); ear.add(inn);
    ear.position.set(s * .07, .205, back * .01); ear.rotation.z = -s * .35; ear.rotation.x = back * .12; grp.add(ear);
  }
  head.add(grp);
  // 꼬리: 마디 여러 개 (각자 살랑)
  const tail = new THREE.Group(); tail.name = 'catTail'; tail.position.set(0, -.03, back * .1); tail.rotation.x = back * 1.95;
  let parent = tail; const segs = [];
  for (let i = 0; i < 8; i++) {
    const r = .022 - i * .0016, seg = new THREE.Group(); seg.position.y = i ? .055 : 0;
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, .04, 4, 8), mat); m.position.y = .028; seg.add(m);
    parent.add(seg); parent = seg; segs.push(seg);
  }
  hips.add(tail);
  return { ears: grp, tail, segs };
}
function setCat(m, on) {
  if (m.cat) { m.cat.ears.parent && m.cat.ears.parent.remove(m.cat.ears); m.cat.tail.parent && m.cat.tail.parent.remove(m.cat.tail); m.cat = null; }
  if (on) m.cat = catParts(m.vrm, on === true ? m.look.hair || '#3a2a30' : on);
}

// --- 동작 (정규화된 뼈를 시간에 따라 돌림)
const BONES = ['hips', 'spine', 'chest', 'upperChest', 'neck', 'head', 'leftShoulder', 'rightShoulder', 'leftUpperArm', 'rightUpperArm', 'leftLowerArm', 'rightLowerArm', 'leftHand', 'rightHand', 'leftUpperLeg', 'rightUpperLeg', 'leftLowerLeg', 'rightLowerLeg'];
function pose(m, mode, t) {
  const vrm = m.vrm, H = vrm.humanoid, f = vrm.v0 ? -1 : 1;
  const B = n => H.getNormalizedBoneNode(n);
  const set = (n, x = 0, y = 0, z = 0) => { const b = B(n); if (b) b.rotation.set(x * f, y, z * f); };
  BONES.forEach(n => set(n));
  const hips = B('hips'); if (hips && !hips.userData.rest) hips.userData.rest = hips.position.clone();
  const R = hips.userData.rest; hips.position.copy(R);
  const p = t + m.phase, S = Math.sin, C = Math.cos;
  const armsDown = (sw = 0) => { set('leftUpperArm', 0, 0, -1.22 + sw); set('rightUpperArm', 0, 0, 1.22 - sw); set('leftLowerArm', 0, -.15, 0); set('rightLowerArm', 0, .15, 0); };
  if (mode === 'idle') {
    armsDown(S(p * 1.3) * .03); set('spine', 0, 0, S(p * 1.1) * .025); set('head', S(p * .7) * .04, S(p * .45) * .12, S(p * .6) * .03);
    hips.position.y = R.y + S(p * 2.4) * .003;
  } else if (mode === 'dance' || mode === 'stage') {
    const b = p * Math.PI * 2 * 1.05, s = S(b), c = C(b), s2 = S(b * 2);
    hips.position.y = R.y - Math.abs(s) * .035; hips.position.x = R.x + s * .045; hips.rotation.y = s * .22 * f;
    set('spine', 0, -s * .14, s * .06); set('chest', .04, -s * .1, 0);
    set('head', .04 + Math.abs(c) * .07, s * .18, -s * .1);
    set('leftUpperArm', 0, .35 + s * .3, -.7 + s * .35); set('rightUpperArm', 0, -.35 + s * .3, .7 + s * .35);
    set('leftLowerArm', 0, -1.4 - Math.max(0, s) * .5, 0); set('rightLowerArm', 0, 1.4 + Math.max(0, -s) * .5, 0);
    set('leftHand', 0, 0, s2 * .25); set('rightHand', 0, 0, s2 * .25);
    set('leftUpperLeg', -Math.max(0, s) * .45, 0, .04); set('rightUpperLeg', -Math.max(0, -s) * .45, 0, -.04);
    set('leftLowerLeg', Math.max(0, s) * .85, 0, 0); set('rightLowerLeg', Math.max(0, -s) * .85, 0, 0);
  } else if (mode === 'cheer') {
    const b = p * Math.PI * 2 * 1.5, s = S(b);
    hips.position.y = R.y + Math.max(0, s) * .11;
    set('spine', -.08, 0, 0); set('head', -.14, 0, s * .1);
    set('leftUpperArm', 0, 0, 1.3 + s * .18); set('rightUpperArm', 0, 0, -1.3 - s * .18); set('leftLowerArm', 0, -.35, 0); set('rightLowerArm', 0, .35, 0);
    set('leftUpperLeg', -Math.max(0, -s) * .28, 0, 0); set('rightUpperLeg', -Math.max(0, -s) * .28, 0, 0);
    set('leftLowerLeg', Math.max(0, -s) * .55, 0, 0); set('rightLowerLeg', Math.max(0, -s) * .55, 0, 0);
  } else if (mode === 'wave') {
    armsDown(); const s = S(p * 7);
    set('rightUpperArm', 0, -.2, -.25); set('rightLowerArm', 0, .2, -1.3 + s * .25); set('head', .02, -.08, .08); set('spine', 0, 0, -.04);
  } else if (mode === 'bow') {
    const k = (S(p * 1.4) + 1) / 2; armsDown(); set('spine', .35 * k, 0, 0); set('chest', .15 * k, 0, 0); set('head', .2 * k, 0, 0);
  } else if (mode === 'sleep') {
    armsDown(); set('spine', .12, 0, 0); set('head', .3 + S(p * 1.2) * .07, 0, .22);
  } else if (mode === 'sad') {
    armsDown(); set('spine', .15, 0, 0); set('head', .35, 0, 0); set('leftUpperArm', .2, 0, -1.25); set('rightUpperArm', .2, 0, 1.25);
  }
  if (m.cat) { const bk = vrm.v0 ? 1 : -1; m.cat.segs.forEach((g, i) => { g.rotation.z = S(p * (mode === 'dance' || mode === 'cheer' ? 6 : 2.5) - i * .5) * .22; g.rotation.x = -bk * .2; }); }
}
function face(m, mode, t) {
  const E = m.vrm.expressionManager; if (!E) return;
  ['happy', 'surprised', 'angry', 'sad', 'relaxed', 'aa', 'oh', 'blink'].forEach(n => E.setValue(n, 0));
  const p = t + m.phase, e = m.exp || (mode === 'cheer' ? 'happy' : mode === 'sad' ? 'sad' : null);
  if (e && e !== 'neutral') E.setValue(e, 1);
  if ((mode === 'dance' || mode === 'stage' || mode === 'cheer') && !m.exp) E.setValue('aa', Math.max(0, Math.sin(p * 9)) * .6);
  if (mode === 'sleep') E.setValue('blink', 1);
  else if (e !== 'happy') { const k = (p * 1000 % 3700) / 1000; E.setValue('blink', k < .13 ? Math.sin(k / .13 * Math.PI) : 0); }
}

// ===== 무대 =====
export function createStage(canvas, opt = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: !!opt.snap });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(24, 16 / 9, .1, 60);
  scene.add(new THREE.AmbientLight(0xffffff, 1.25));
  const key = new THREE.DirectionalLight(0xffffff, 2.1); key.position.set(1.5, 3, 3); scene.add(key);
  const rim = new THREE.DirectionalLight(0xffb3d9, 1.2); rim.position.set(-2, 2, -2); scene.add(rim);
  let members = [], mode = 'idle', clock = new THREE.Clock(), running = true;
  function frame() {
    const n = Math.max(1, members.length), w = Math.max(1.6, n * .62);
    cam.position.set(0, .9, w * 1.55 + 1.15); cam.lookAt(0, .8, 0);
  }
  function resize() {
    const w = canvas.clientWidth || canvas.width, h = canvas.clientHeight || canvas.height;
    renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix();
  }
  async function setMembers(list) {
    for (const m of members) scene.remove(m.vrm.scene);
    members = await Promise.all(list.map(async (look, i) => {
      const vrm = await loadVRM(look.model);
      const m = { vrm, look, phase: i * .23, exp: look.exp || null, cat: null };
      if (look.hair) tint(vrm, 'hair', look.hair);
      if (look.cloth) tint(vrm, 'cloth', look.cloth);
      if (look.cat) setCat(m, look.hair || look.catColor || true);
      return m;
    }));
    const n = members.length;
    members.forEach((m, i) => { m.vrm.scene.position.set((i - (n - 1) / 2) * .62, 0, -Math.abs(i - (n - 1) / 2) * .12); scene.add(m.vrm.scene); });
    frame(); resize();
  }
  function setMode(m) { mode = m; }
  function tick() {
    if (!running) return;
    const dt = Math.min(.05, clock.getDelta()), t = clock.elapsedTime;
    for (const m of members) { pose(m, mode, t); face(m, mode, t); m.vrm.update(dt); }
    renderer.render(scene, cam);
  }
  renderer.setAnimationLoop(tick);
  addEventListener('resize', resize); resize();
  return { setMembers, setMode, resize, renderer, scene, get members() { return members; }, stop() { running = false; renderer.setAnimationLoop(null); renderer.dispose(); } };
}

// ===== 사진 찍기 (얼굴 / 전신) — 꾸미기를 반영한 이미지 =====
let shotR = null, shotScene = null, shotCam = null;
export async function snapshot(look, kind = 'face', size = 256) {
  if (!shotR) {
    const c = document.createElement('canvas');
    shotR = new THREE.WebGLRenderer({ canvas: c, antialias: true, alpha: true, preserveDrawingBuffer: true });
    shotScene = new THREE.Scene(); shotScene.add(new THREE.AmbientLight(0xffffff, 1.3));
    const k = new THREE.DirectionalLight(0xffffff, 2); k.position.set(1, 2, 3); shotScene.add(k);
    shotCam = new THREE.PerspectiveCamera(20, 1, .05, 20);
  }
  const vrm = await loadVRM(look.model), m = { vrm, look, phase: 0, exp: look.exp || null, cat: null };
  if (look.hair) tint(vrm, 'hair', look.hair);
  if (look.cloth) tint(vrm, 'cloth', look.cloth);
  if (look.cat) setCat(m, look.hair || true);
  pose(m, 'idle', 0); face(m, 'idle', 0);
  const E = vrm.expressionManager; if (E) { E.setValue('blink', 0); if (look.exp) E.setValue(look.exp, 1); }
  vrm.update(0); shotScene.add(vrm.scene); vrm.scene.updateMatrixWorld(true);
  const hp = new THREE.Vector3(); vrm.humanoid.getRawBoneNode('head').getWorldPosition(hp);
  const W = kind === 'face' ? size : Math.round(size * .56), Hh = size;
  shotR.setSize(W, Hh, false); shotCam.aspect = W / Hh;
  if (kind === 'face') { shotCam.fov = 20; shotCam.position.set(0, hp.y + .09, 1.18); shotCam.lookAt(0, hp.y + .08, 0); }
  else { shotCam.fov = 24; shotCam.position.set(0, hp.y * .55, hp.y * 2.65); shotCam.lookAt(0, hp.y * .52, 0); }
  shotCam.updateProjectionMatrix();
  shotR.render(shotScene, shotCam);
  const url = shotR.domElement.toDataURL('image/png');
  shotScene.remove(vrm.scene); VRMUtils.deepDispose(vrm.scene);
  return url;
}
