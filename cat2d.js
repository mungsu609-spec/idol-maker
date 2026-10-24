// ===== 2D 고양이 아이돌 (그림을 휘고 늘리는 메시 애니메이션, PixiJS) =====
// 부위 그림(몸통·팔·꼬리·표정)을 격자 모양 메시로 붙이고, 꼭짓점을 움직여서 이음새 없이 휘게 만듦.
const ART = new URL('art/cat/', import.meta.url).href, VER = '?v=15';   // 고치면 숫자 올리기 (브라우저 저장본 대신 새 파일)
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const rot = (x, y, cx, cy, a) => { const c = Math.cos(a), s = Math.sin(a); return [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]; };

export async function loadCat(PIXI, name) {
  const info = await (await fetch(ART + name + '.json' + VER)).json();
  const tex = {};
  for (const k of ['body', 'armL', 'armR', 'tail', 'face-blink', 'face-sing', 'face-joy', 'face-sad', 'face-sleep']) {
    if (k !== 'body' && !info.parts[k]) continue;
    tex[k] = await PIXI.Assets.load(ART + `${name}-${k}.png` + VER);
  }
  return { info, tex };
}
// 옷·소품 (모든 고양이 공통, 치즈 고양이 자세 기준 좌표)
let ITEMS = null;
export async function loadItems(PIXI) {
  if (!ITEMS) ITEMS = (async () => { const info = await (await fetch(ART + 'items.json' + VER)).json(), tex = {};
    for (const k in info) tex[k] = await PIXI.Assets.load(ART + `item-${k}.png` + VER);
    return { info, tex }; })();
  return ITEMS;
}

export function makeCat(PIXI, data, opt = {}) {
  const { info, tex } = data, W = info.w, H = info.h, U = H / 1200;   // U: 그림 크기 비율 (움직임 크기 맞추기)
  const root = new PIXI.Container();
  const items = opt.items || null, wear = opt.wear || [];
  const parts = [];
  // 몸 비율: 머리-목 경계, 발 위치
  const neckY = H * .40, feetY = H * .95, headP = [W * .47, H * .42];
  function plane(key, nx, ny, x, y, kind) {
    const t = tex[key]; if (!t) return null;
    const p = new PIXI.SimplePlane(t, nx, ny);
    p.x = 0; p.y = 0;
    const buf = p.geometry.getBuffer('aVertexPosition');
    const rest = Float32Array.from(buf.data);
    for (let i = 0; i < rest.length; i += 2) { rest[i] += x; rest[i + 1] += y; }   // 전체 좌표로
    const obj = { p, buf, rest, kind, key, info: info.parts[key] };
    parts.push(obj); return obj;
  }
  const P = info.parts;
  const tail = P.tail && plane('tail', 6, 18, P.tail.x, P.tail.y, 'tail');
  const body = plane('body', 14, 20, 0, 0, 'body');
  const armL = P.armL && plane('armL', 10, 10, P.armL.x, P.armL.y, 'armL');
  const armR = P.armR && plane('armR', 10, 10, P.armR.x, P.armR.y, 'armR');
  const faces = {};
  for (const k of ['face-blink', 'face-sing', 'face-joy', 'face-sad', 'face-sleep']) if (P[k]) { faces[k] = plane(k, 8, 6, P[k].x, P[k].y, 'face'); faces[k].p.alpha = 0; }
  // 그리는 순서: 꼬리 → 몸 → 표정 → 팔
  // 옷은 몸 위·팔 아래, 소품은 얼굴 위
  const wearO = [];
  if (items) for (const k of wear) { const it = items.info[k]; if (!it) continue;
    const t = items.tex[k], pl = new PIXI.SimplePlane(t, 10, 10), buf = pl.geometry.getBuffer('aVertexPosition'), rest = Float32Array.from(buf.data);
    for (let i = 0; i < rest.length; i += 2) { rest[i] = rest[i] / t.width * it.w * (W / 448) + it.x * (W / 448); rest[i + 1] = rest[i + 1] / t.height * it.h * (H / 600) + it.y * (H / 600); }
    const o = { p: pl, buf, rest, kind: 'face', key: k, info: it, layer: it.kind }; parts.push(o); wearO.push(o); }
  [tail, body, ...wearO.filter(o => o.layer === 'body'), ...Object.values(faces), ...wearO.filter(o => o.layer === 'head'), armL, armR].forEach(o => o && root.addChild(o.p));
  const zz = [0, 1, 2].map(i => { const z = new PIXI.Text('Z', { fontFamily: 'Jua, sans-serif', fontSize: (70 + i * 22) * U, fill: 0xb9a6ff, stroke: 0xffffff, strokeThickness: 10 * U, fontWeight: '700' }); z.anchor.set(.5); z.alpha = 0; root.addChild(z); return z; });
  root.pivot.set(W / 2, feetY);
  // 발밑 그림자 (바닥에 붙어 있고, 뛰면 작고 옅어짐)
  const shadow = new PIXI.Graphics(); shadow.beginFill(0x1a0f2e, 1).drawEllipse(0, 0, W * .34, W * .08).endFill();
  shadow.filters = [new PIXI.BlurFilter(6)];

  const st = { mode: 'idle', t: Math.random() * 10, phase: opt.phase || 0 };
  // 동작마다 각도들
  function pose(t) {
    const m = st.mode, s = Math.sin, k = t * Math.PI * 2;
    const q = { armL: 0, armR: 0, tail: 0, tailWave: .08, tailSpeed: 1.6, head: s(t * .9) * .03, sway: s(t * .8) * .01, breathe: s(t * 2.2) * .012, bounce: 0, squash: 0, earL: 0, earR: 0, face: null };
    const twitch = (p, x) => { const u = (t * .37 + p) % 1; return u < .06 ? s(u / .06 * Math.PI) * x : 0; };
    q.earL = twitch(.1, -.25); q.earR = twitch(.6, .25);
    if (m === 'dance') {
      const b = s(k * 1.05);
      q.armL = -.35 + b * .45; q.armR = .35 + b * .45; q.head = -b * .12; q.sway = b * .07;
      q.bounce = Math.abs(s(k * 1.05)) * 22; q.squash = (1 - Math.abs(b)) * .05; q.tail = b * .25; q.tailWave = .18; q.tailSpeed = 4;
      q.face = (s(k * 2.1) > 0) ? 'face-sing' : null;
    } else if (m === 'cheer') {
      const b = s(k * 1.6), j = Math.max(0, b);
      q.armL = .75 + s(k * 3.2) * .2; q.armR = -.75 - s(k * 3.2) * .2; q.bounce = j * 70; q.squash = b < 0 ? -b * .08 : -j * .04;
      q.head = s(k * 1.6) * .06; q.tail = .3 + b * .2; q.tailWave = .2; q.tailSpeed = 5; q.face = 'face-joy';
    } else if (m === 'wave') {
      q.armR = -.55 + s(k * 2.2) * .35; q.armL = -.25; q.head = -.07 + s(k * .5) * .03; q.sway = -.02; q.tail = .15; q.tailSpeed = 2.5;
      q.face = s(k * .7) > .3 ? 'face-joy' : null;
    } else if (m === 'sleep') {
      q.head = .12 + s(t * 1.1) * .05; q.breathe = s(t * 1.1) * .03; q.armL = -.4; q.armR = .4; q.tail = -.15; q.tailSpeed = .6; q.tailWave = .04; q.face = P['face-sleep'] ? 'face-sleep' : 'face-blink';
    } else if (m === 'sad') {
      q.head = .14 + s(t * .6) * .02; q.armL = -.45; q.armR = .45; q.tail = -.5; q.tailSpeed = .5; q.tailWave = .03; q.squash = .02;
      q.earL = -.55 + s(t * .8) * .03; q.earR = .55 - s(t * .8) * .03; q.droop = 1; q.face = 'face-sad';
    } else {
      q.armL = s(t * 1.3) * .05; q.armR = -s(t * 1.3) * .05; q.tail = s(t * .9) * .12;
    }
    if (!q.face && m !== 'sleep') { const u = (t * .29 + st.phase) % 1; if (u < .035) q.face = 'face-blink'; }
    return q;
  }
  // 몸 전체 변형 (머리 기울이기·숨쉬기·흔들기·찌그러짐)
  function bodyDeform(x, y, q) {
    // 숨쉬기 + 찌그러짐: 발 기준 세로로 줄고 가로로 늘어남
    const sq = q.squash + q.breathe;
    x = W / 2 + (x - W / 2) * (1 + sq * .6); y = feetY + (y - feetY) * (1 - sq);
    // 귀 쫑긋 (머리 윗부분 좌우)
    if (y < H * .24) {
      const top = sstep(H * .22, H * .07, y);
      const wl = sstep(W * .44, W * .27, x) * top, wr = sstep(W * .5, W * .67, x) * top;
      if (wl) [x, y] = rot(x, y, W * .33, H * .2, q.earL * wl);
      if (wr) [x, y] = rot(x, y, W * .62, H * .2, q.earR * wr);
    }
    // 머리: 목 위만 부드럽게 기울어짐
    const hw = sstep(neckY + 70, neckY - 50, y);
    if (hw) [x, y] = rot(x, y, headP[0], headP[1], q.head * hw);
    // 몸 흔들기: 발은 고정, 위로 갈수록 크게
    const bw = sstep(feetY, H * .3, y);
    [x, y] = rot(x, y, W / 2, feetY, q.sway * bw);
    return [x, y];
  }
  function limb(o, x, y, q) {
    const pv = o.info.pivot, R = Math.hypot(o.info.w, o.info.h);
    const r = Math.hypot(x - pv[0], y - pv[1]);
    if (o.kind === 'tail') {
      const u = r / R, a = q.tail * u + Math.sin(st.t * q.tailSpeed - u * 3.2) * q.tailWave * u * 1.4;
      return rot(x, y, pv[0], pv[1], a);
    }
    const a = o.kind === 'armL' ? q.armL : q.armR, w = sstep(R * .05, R * .45, r);
    return rot(x, y, pv[0], pv[1], a * w * (.75 + .25 * r / R));
  }
  function update(dt) {
    st.t += dt;
    const q = pose(st.t + st.phase);
    for (const o of parts) {
      const d = o.buf.data, R = o.rest;
      for (let i = 0; i < R.length; i += 2) {
        let x = R[i], y = R[i + 1];
        if (o.kind === 'armL' || o.kind === 'armR' || o.kind === 'tail') [x, y] = limb(o, x, y, q);
        // 팔·꼬리는 붙은 곳 기준으로 몸을 따라감
        if (o.kind !== 'body' && o.kind !== 'face') {
          const pv = o.info.pivot, [px, py] = bodyDeform(pv[0], pv[1], q); x += px - pv[0]; y += py - pv[1];
        } else[x, y] = bodyDeform(x, y, q);
        d[i] = x; d[i + 1] = y;
      }
      o.buf.update();
    }
    for (const k in faces) faces[k].p.alpha = q.face === k ? 1 : 0;
    zz.forEach((z, i) => {
      if (st.mode !== 'sleep') { z.alpha = 0; return; }
      const u = ((st.t * .45) + i / 3) % 1;              // 머리 오른쪽에서 위로 둥실
      z.x = W * .74 + u * W * .18 + Math.sin(u * 6) * 18 * U; z.y = H * .2 - u * H * .2;
      z.alpha = u < .15 ? u / .15 : 1 - (u - .15) / .85; z.scale.set(.6 + u * .6); z.rotation = -.2 + u * .3;
    });
    root.y = (root.baseY || 0) - q.bounce * U * (root.scale.y || 1);
    const up = Math.min(1, q.bounce / 90), sc = root.scale.x || 1;
    shadow.x = root.x; shadow.y = (root.baseY || 0) - H * .01 * sc; shadow.scale.set(sc * (1 - up * .35)); shadow.alpha = (opt.shadowAlpha || .5) * (1 - up * .5);
  }
  return { root, shadow, update, setMode(m) { st.mode = m; }, get mode() { return st.mode; }, W, H };
}
