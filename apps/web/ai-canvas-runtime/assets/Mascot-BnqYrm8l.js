import { o as e, t } from "./react-Dfufv8pq.js";
import { t as n } from "./jsx-runtime-BAkIPmuO.js";
import { t as r } from "./gsap-C1ZKf3Iq.js";
import { $ as i, B as a, C as o, D as s, E as c, F as l, G as ee, H as te, I as u, K as d, O as f, R as p, S as m, U as ne, W as re, b as h, d as ie, h as g, j as ae, k as oe, l as _, m as v, n as se, nt as y, o as ce, q as le, r as ue, s as de, tt as b, x as fe, z as x } from "./three.module-Xrs-xySb.js";
import { a as pe, c as me, d as he, i as ge, l as _e, n as ve, o as ye, r as be, s as xe, t as Se, u as Ce } from "./mascotClips-Czs9Mb5c.js";
//#region src/components/shared/mascot/mascotOrbitRibbons.ts
var S = /* @__PURE__ */ e(t(), 1), we = 64, C = .05, w = 6, T = 77, E = .002, Te = [
	{
		radius: 1.29,
		tilt: .32,
		roll: .28,
		follow: .86,
		drift: .64,
		phase: .3,
		delay: 0,
		arc: 2.65,
		hue: 145,
		hueSpan: 62,
		hueVelocity: 22,
		width: .145
	},
	{
		radius: 1.36,
		tilt: .38,
		roll: .34,
		follow: .9,
		drift: .56,
		phase: 1.9,
		delay: .09,
		arc: 2.45,
		hue: 265,
		hueSpan: -78,
		hueVelocity: -18,
		width: .13
	},
	{
		radius: 1.43,
		tilt: .35,
		roll: .23,
		follow: .82,
		drift: .72,
		phase: 3.5,
		delay: .18,
		arc: 2.8,
		hue: 25,
		hueSpan: 84,
		hueVelocity: 26,
		width: .14
	},
	{
		radius: 1.5,
		tilt: .42,
		roll: .31,
		follow: .88,
		drift: .6,
		phase: 5.1,
		delay: .27,
		arc: 2.55,
		hue: 190,
		hueSpan: -54,
		hueVelocity: -24,
		width: .125
	}
];
function D(e, t, n) {
	let r = Math.sin(t), i = Math.cos(t), a = e.radius * r, o = -e.radius * i * Math.sin(e.tilt), s = e.radius * i * Math.cos(e.tilt), c = Math.cos(e.roll), l = Math.sin(e.roll);
	return n.set(a * c - o * l, a * l + o * c, s);
}
var O = new y(), k = new y(), Ee = new y(), A = new y(), j = new y(), M = new _();
function N(e) {
	let t = Math.max(0, Math.min(1, e));
	return t * t * (3 - 2 * t);
}
function De(e) {
	let t = .45, n = .85, r = 6.8, i = (e) => e * e * e * (1 - e / 2);
	if (e <= t) return r * t * i(e / t);
	let a = Math.min(e - t, n), o = r * t / 2 + r * a + (3 - r) * n * i(a / n), s = Math.max(0, e - t - n);
	return o + 3 * s + .4 * (1 - Math.cos(s * .6));
}
function Oe() {
	let e = new h(), t = [], n = [];
	for (let e = 0; e < T - 1; e += 1) {
		let t = e * 2, r = e * 2 + 1, i = e * 2 + 2, a = e * 2 + 3;
		n.push(t, r, i, r, a, i);
	}
	for (let r of Te) {
		let i = new Float32Array(T * 2 * 3), a = new Float32Array(T * 2 * 3), o = new de();
		o.setAttribute("position", new ce(i, 3).setUsage(g)), o.setAttribute("color", new ce(a, 3).setUsage(g)), o.setIndex(n), o.setDrawRange(0, 0);
		let s = new oe({
			vertexColors: !0,
			transparent: !0,
			opacity: 0,
			toneMapped: !1,
			depthWrite: !1,
			side: 2
		}), c = new f(o, s);
		c.frustumCulled = !1, c.renderOrder = 3, e.add(c), t.push({
			...r,
			geometry: o,
			material: s,
			positions: i,
			colors: a
		});
	}
	e.visible = !1;
	function r(e, t, n) {
		let r = Math.max(0, a - e.delay), i = De(r) * e.follow + e.drift * r, o = e.phase + i, s = Math.min(e.arc, i) * N(n);
		if (s < .005) {
			e.geometry.setDrawRange(0, 0);
			return;
		}
		let c = Math.min(we, Math.max(2, Math.ceil(s / C))), l = N(r / .34), ee = Math.min(e.width, e.radius * s * .34) * l * n, { positions: u, colors: d } = e, f = 0, p = (n, i, a = 0, o = 1) => {
			let s = D(e, n, O);
			D(e, n + Math.PI / 2, k).normalize(), Ee.subVectors(t, s).normalize(), A.crossVectors(k, Ee), A.lengthSq() < 1e-12 && A.set(0, 1, 0), A.normalize(), j.crossVectors(Ee, A).normalize();
			let c = .72 + .28 * Math.max(0, s.z / e.radius), l = ee * (.5 + .5 * i) * c / 2;
			s.addScaledVector(j, l * a);
			let p = l * o, m = f * 6;
			u[m] = s.x + A.x * p, u[m + 1] = s.y + A.y * p, u[m + 2] = s.z + A.z * p, u[m + 3] = s.x - A.x * p, u[m + 4] = s.y - A.y * p, u[m + 5] = s.z - A.z * p;
			let ne = ((e.hue + r * e.hueVelocity + i * e.hueSpan) % 360 + 360) % 360;
			M.setHSL(ne / 360, .56, .56 + .11 * i, te), d[m] = M.r, d[m + 1] = M.g, d[m + 2] = M.b, d[m + 3] = M.r, d[m + 4] = M.g, d[m + 5] = M.b, f += 1;
		};
		for (let e = 0; e < w; e += 1) {
			let t = (e / w - 1) * Math.PI / 2;
			p(o - s, 0, Math.sin(t), Math.cos(t));
		}
		for (let e = 0; e <= c; e += 1) {
			let t = e / c;
			p(o - s + s * t, t);
		}
		for (let e = 1; e <= w; e += 1) {
			let t = e / w * Math.PI / 2;
			p(o, 1, Math.sin(t), Math.cos(t));
		}
		e.geometry.setDrawRange(0, (f - 1) * 6), e.geometry.getAttribute("position").needsUpdate = !0, e.geometry.getAttribute("color").needsUpdate = !0;
	}
	let i = 0, a = 0;
	return {
		group: e,
		update(e, n) {
			if (i !== 0) {
				Number.isFinite(e) && (a += Math.max(0, e));
				for (let e of t) r(e, n, i);
			}
		},
		setIntensity(e) {
			if (i = Number.isFinite(e) ? Math.max(0, Math.min(1, e)) : 0, i <= E) {
				i = 0, a = 0;
				for (let e of t) e.geometry.setDrawRange(0, 0);
			}
			for (let e of t) e.material.opacity = i;
		},
		dispose() {
			for (let e of t) e.geometry.dispose(), e.material.dispose();
			e.clear();
		}
	};
}
//#endregion
//#region src/components/shared/mascot/mascotMotion.ts
var ke = {
	hop: .82,
	shake: .65
}, Ae = .18, P = .16, F = .18, I = .82, L = .2, je = 2.5, Me = .05, Ne = {
	lift: 0,
	yaw: 0,
	squashY: 1
};
function Pe(e) {
	if (e < F) return 1 - P * Math.sin(e / F * Math.PI);
	if (e > I) return 1 - P * Math.sin((e - I) / (1 - I) * Math.PI);
	let t = (e - F) / (I - F);
	return 1 + P * .28 * Math.sin(t * Math.PI);
}
function Fe(e, t) {
	let n = Math.min(Math.max(t, 0), 1);
	if (n >= 1) return Ne;
	if (e === "hop") {
		let e = Pe(n), t = Math.min(Math.max((n - F) / (I - F), 0), 1);
		return {
			lift: 4 * t * (1 - t) * Ae + Math.min(e - 1, 0),
			yaw: 0,
			squashY: e
		};
	}
	return {
		lift: -Math.sin(Math.PI * n) * Me,
		yaw: Math.sin(n * Math.PI * 2 * je) * L * (1 - n),
		squashY: 1
	};
}
var R = (e) => {
	let t = Math.min(Math.max(e, 0), 1);
	return t * t * (3 - 2 * t);
}, Ie = .24;
function Le(e) {
	return e < 0 || e >= .24 ? 1 : e < .065 ? 1 - R(e / .065) : R((e - .105) / (Ie - .105));
}
function Re(e, t, n) {
	let r = Math.hypot(e, t);
	if (r === 0) return {
		x: 0,
		y: 0
	};
	let i = 1 - Math.exp(-r / Math.max(n * 1.4, 1));
	return {
		x: e / r * i,
		y: t / r * i
	};
}
function ze(e, t, n, r, i) {
	let a = t === "sleep" || t === "sleepy" || t === "rest", o = Math.sin(r * (a ? .65 : 1.05));
	if (i.x = Math.sin(r * .43) * (a ? .004 : .012), i.lift = o * (a ? .012 : .025), i.squashY = 1 + o * (a ? .012 : .009), i.tilt = Math.sin(r * .57) * (a ? .009 : .022), i.yaw = 0, i.pitch = 0, i.eyeOpen = 1, !t) return e === "thinking" && (i.x += Math.sin(r * .7) * .035, i.tilt += -.07 + Math.sin(r * .85) * .045, i.pitch = -.025), i;
	let s = Se[t].duration, c = Number.isFinite(s) ? R(n / .1) * (1 - R((n - s * .58) / (s * .42))) : 1;
	switch (t) {
		case "excited": {
			let e = Fe("hop", n / ke.hop);
			i.lift += e.lift, i.squashY *= e.squashY, i.tilt += Math.sin(n * 12) * .09 * c;
			break;
		}
		case "surprised":
			i.x -= .07 * c, i.pitch = -.12 * c, i.lift += .08 * c;
			break;
		case "suspicious":
			i.x -= .065 * c, i.yaw = -.12 * c, i.tilt -= .09 * c;
			break;
		case "angry":
			i.yaw = Math.sin(n * 27) * .085 * c, i.pitch = .055 * c, i.squashY -= .025 * c;
			break;
		case "remind":
			i.pitch = Math.sin(n * 12) * .085 * c, i.lift += Math.abs(Math.sin(n * 6)) * .06 * c, i.tilt -= .04 * c;
			break;
		case "wake": {
			let e = R(n / .18) * c;
			i.eyeOpen = R(n / .16), i.pitch = -.08 * e, i.squashY += .045 * e, i.lift += .045 * e;
			break;
		}
		case "sleepy": {
			let e = n % 5.6, t = R((e - 1.6) / 1.5) * (1 - R((e - 3.1) / .5));
			i.pitch = t * .14, i.lift -= t * .06, i.eyeOpen = 1 - t * .9;
			break;
		}
		case "sleep":
			i.pitch = .045;
			break;
		case "rest":
			i.pitch = .025;
			break;
	}
	return i;
}
function Be(e) {
	return 1 / Math.sqrt(Math.max(e, .05));
}
function Ve(e, t, n) {
	if (t <= 1) return 0;
	let r = Math.min(Math.floor(n * t), t - 1);
	return r === e ? (r + 1) % t : r;
}
//#endregion
//#region src/components/shared/mascot/mascotSpring.ts
var He = 5e-4, Ue = .005, We = 1 / 120, Ge = 1 / 15, Ke = 8;
function z(e, t, n = 1) {
	let r = 2 * Math.PI * Math.max(e, .01);
	return {
		stiffness: r * r * n,
		damping: 2 * Math.max(t, 0) * r * n,
		mass: n
	};
}
var qe = {
	eye: z(3.2, .72),
	body: z(2.2, .5),
	head: z(1.6, .85)
};
function B(e = 0) {
	return {
		value: e,
		velocity: 0
	};
}
function Je(e, t) {
	e.value = t, e.velocity = 0;
}
function Ye(e) {
	return e.restDelta ?? He;
}
function Xe(e) {
	return e.restSpeed ?? Ue;
}
function Ze(e, t, n) {
	return Math.abs(t - e.value) < Ye(n) && Math.abs(e.velocity) < Xe(n);
}
function V(e, t, n, r) {
	if (!(r > 0)) return Ze(e, t, n);
	let { stiffness: i, damping: a, mass: o } = n, s = o > 0 ? 1 / o : 1, c = Math.min(r, Ge), l = Math.min(Math.ceil(c / We), Ke), ee = c / l;
	for (let n = 0; n < l; n += 1) {
		let n = (-i * (e.value - t) - a * e.velocity) * s;
		e.velocity += n * ee, e.value += e.velocity * ee;
	}
	return Ze(e, t, n) ? (e.value = t, e.velocity = 0, !0) : !1;
}
function Qe(e, t, n, r) {
	return r > 0 ? t + (e - t) * Math.exp(-Math.max(n, 0) * r) : e;
}
function $e(e, t = 60) {
	return -Math.log(1 - Math.min(Math.max(e, 0), .999)) * t;
}
//#endregion
//#region src/components/shared/mascot/mascotEyeShader.ts
var et = .09, tt = .18, nt = .02, H = {
	open: {
		min: 0,
		max: 1.28
	},
	curve: {
		min: -.62,
		max: .62
	},
	slant: {
		min: -.6,
		max: .6
	},
	width: {
		min: .6,
		max: 1.3
	},
	height: {
		min: .6,
		max: 1.22
	}
}, rt = .52, it = 1.62, at = "\nvarying vec2 vLocal;\n\nvoid main() {\n  vLocal = position.xy;\n  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);\n}\n", ot = `
precision highp float;

uniform vec3 uColor;
uniform float uOpacity;
uniform float uOpen;
uniform float uCurve;
uniform float uSlant;
uniform float uWidth;
uniform float uHeight;

varying vec2 vLocal;

const float BASE_HALF_WIDTH = ${et};
const float BASE_HALF_HEIGHT = ${tt};
const float LID_THICKNESS = ${nt};

/** 眼睛的距离场：负为内部，正为外部。 */
float eyeDistance(vec2 p) {
  float halfW = BASE_HALF_WIDTH * max(uWidth, 0.001);
  float t = clamp(p.x / halfW, -1.0, 1.0);
  // 眼睑中心线：curve 给眉眼弧度，slant 给 > < 的斜势
  float arch = max(1.0 - t * t, 0.0);
  float center = (uCurve * arch + uSlant * t) * BASE_HALF_HEIGHT;
  float halfH = uOpen * uHeight * BASE_HALF_HEIGHT + LID_THICKNESS;
  // 圆角半径参考原胶囊：r = min(w, h * 0.6)，这样睁眼时两端是圆的，
  // 闭眼时因为 halfH 很小半径也变得很小，变成一条可见的细线
  float radius = min(halfW, halfH * 0.6);
  vec2 q = vec2(abs(p.x), abs(p.y - center)) - vec2(halfW, halfH) + radius;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
}

void main() {
  float d = eyeDistance(vLocal);
  // 用屏幕空间导数做抗锯齿，缩放时边缘始终平滑
  float aa = max(fwidth(d), 1e-4);
  float alpha = (1.0 - smoothstep(-aa, aa, d)) * uOpacity;
  // 透明像素直接丢弃：眼睛是贴在球面上的平面，
  // 不丢弃会与球体、绒毛争抢透明排序并产生边缘脏边
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(uColor, alpha);
}
`;
function st(e) {
	return {
		uColor: { value: e },
		uOpacity: { value: 1 },
		uOpen: { value: 1 },
		uCurve: { value: 0 },
		uSlant: { value: 0 },
		uWidth: { value: 1 },
		uHeight: { value: 1 }
	};
}
function U(e, t, n) {
	return e < t ? t : e > n ? n : e;
}
function ct(e, t) {
	e.uOpen.value = U(t.open, H.open.min, H.open.max), e.uCurve.value = U(t.curve, H.curve.min, H.curve.max), e.uSlant.value = U(t.slant, H.slant.min, H.slant.max), e.uWidth.value = U(t.width, H.width.min, H.width.max), e.uHeight.value = U(t.height, H.height.min, H.height.max);
}
//#endregion
//#region src/components/shared/mascot/Mascot.tsx
var lt = n(), ut = 1, dt = .42, ft = .04, pt = .16, mt = $e(.12), ht = 2.2, gt = 5.5, _t = z(3, 1), vt = z(3.4, .78), yt = 30, bt = 60, xt = 250, St = 320, Ct = 900, wt = .8, Tt = 1.4, Et = 48, Dt = .22, W = 128, Ot = 1.5, kt = .72, At = 90, jt = 11, G = .002, Mt = [
	[-.34, .2],
	[.28, .3],
	[.16, -.04],
	[-.16, .34],
	[.04, .1]
], Nt = 2600, Pt = 1.8, Ft = 3.4, It = [
	[-.62, .12],
	[.58, .2],
	[.3, -.3],
	[-.4, -.22],
	[.1, .42],
	[-.12, -.36]
], Lt = 6, Rt = 11, zt = 1.3, Bt = .09, Vt = .18, Ht = .22, Ut = .12, Wt = {
	idle: "neutral",
	thinking: "thinking",
	success: "success",
	error: "error"
}, Gt = {
	thinking: 8300287,
	success: 5752738,
	error: 14254722
}, Kt = 11056127, qt = {
	dark: {
		body: 15330030,
		eyes: 1710623,
		emissive: 9081855,
		roughness: .62,
		metalness: 0,
		clearcoat: 0,
		clearcoatRoughness: .5,
		opacity: 1,
		rimLightIntensity: 0,
		hoverEmissiveIntensity: .32,
		hoverKeyLightIntensity: 1.9,
		shadow: 0,
		shadowOpacity: .08,
		statusEmissiveIntensity: .12,
		statusRimBoost: .16
	},
	light: {
		body: 8752280,
		eyes: 16251388,
		emissive: 11187398,
		roughness: .55,
		metalness: .12,
		clearcoat: .08,
		clearcoatRoughness: .62,
		opacity: 1,
		rimLightIntensity: .35,
		hoverEmissiveIntensity: .06,
		hoverKeyLightIntensity: 1.6,
		shadow: 5857905,
		shadowOpacity: .12,
		statusEmissiveIntensity: .09,
		statusRimBoost: .1
	}
};
function Jt() {
	let e = new Uint8Array(W * W * 4), t = (e, t, n) => {
		let r = Math.imul(e + 1, 374761393) ^ Math.imul(t + 1, 668265263) ^ n;
		return r = Math.imul(r ^ r >>> 13, 1274126177), ((r ^ r >>> 16) >>> 0) / 4294967295;
	};
	for (let n = 0; n < W; n += 1) for (let r = 0; r < W; r += 1) {
		let i = (n * W + r) * 4, a = t(r, n, 5370206) > .52 ? .72 + t(r, n, 8342140) ** .65 * .28 : 0, o = t(r, n, 10368889);
		e[i] = Math.round(a * 255), e[i + 1] = Math.round(o * 255), e[i + 2] = 255, e[i + 3] = 255;
	}
	let n = new ie(e, W, W, p, i);
	return n.wrapS = a, n.wrapT = a, n.minFilter = o, n.magFilter = o, n.needsUpdate = !0, n;
}
var Yt = `
uniform float uFurLength;
uniform vec2 uDragForce;

varying vec2 vFurUv;
varying vec3 vFurNormal;
varying float vFurLayer;

void main() {
  float shellScale = 1.0;
  vec4 shellPosition = vec4(position, 1.0);

  #ifdef USE_INSTANCING
    shellScale = length(instanceMatrix[0].xyz);
  #endif

  vFurLayer = clamp((shellScale - 1.0) / uFurLength, 0.0, 1.0);
  vec3 furDirection = normalize(normal + vec3(0.08, -0.2, 0.0));
  float strandHeight = length(position) * uFurLength * vFurLayer;
  vec3 dragDirection = vec3(-uDragForce.x, uDragForce.y, 0.0);
  vec3 dragBend = dragDirection * strandHeight * vFurLayer * ${kt.toFixed(2)};
  shellPosition = vec4(position + furDirection * strandHeight + dragBend, 1.0);
  vFurUv = uv;
  vFurNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * shellPosition;
}
`, Xt = "\nuniform sampler2D uFurNoise;\nuniform vec3 uFurColor;\nuniform vec3 uGlowColor;\nuniform float uNoiseScale;\nuniform float uSmoothness;\nuniform float uOpacity;\nuniform float uGlow;\n\nvarying vec2 vFurUv;\nvarying vec3 vFurNormal;\nvarying float vFurLayer;\n\nvoid main() {\n  vec4 noiseSample = texture2D(uFurNoise, vFurUv * uNoiseScale);\n  float strandLength = max(noiseSample.r, 0.02);\n  float strandPosition = vFurLayer / strandLength;\n  if (strandPosition >= 1.0) discard;\n\n  float alpha = pow(1.0 - strandPosition, uSmoothness) * uOpacity;\n  if (alpha < 0.02) discard;\n\n  vec3 normal = normalize(vFurNormal);\n  vec3 lightDirection = normalize(vec3(-0.48, 0.72, 1.0));\n  float diffuse = max(dot(normal, lightDirection), 0.0);\n  float rim = pow(1.0 - abs(normal.z), 2.2);\n  float variation = mix(0.94, 1.02, noiseSample.g);\n  float rootShade = mix(0.72, 1.0, strandPosition * strandPosition);\n  vec3 color = uFurColor * (0.72 + 0.25 * diffuse + 0.08 * rim) * variation * rootShade;\n  color += uGlowColor * uGlow * (0.18 + 0.34 * rim);\n\n  gl_FragColor = vec4(color, alpha);\n  #include <tonemapping_fragment>\n  #include <colorspace_fragment>\n}\n";
function Zt({ loading: e = !1, status: t = "idle", theme: n = "dark", reduceMotion: i = !1, getDragForce: a, handleRef: o }) {
	let te = (0, S.useRef)(null), p = (0, S.useRef)({ playClip: () => !1 }), ie = (0, S.useRef)(e), g = (0, S.useRef)(t), y = (0, S.useRef)(0), ce = (0, S.useRef)(n), de = (0, S.useRef)(i), we = (0, S.useRef)(a);
	return (0, S.useEffect)(() => {
		ie.current = e;
	}, [e]), (0, S.useEffect)(() => {
		g.current !== t && (g.current = t, y.current = performance.now());
	}, [t]), (0, S.useEffect)(() => {
		ce.current = n;
	}, [n]), (0, S.useEffect)(() => {
		de.current = i;
	}, [i]), (0, S.useEffect)(() => {
		we.current = a;
	}, [a]), (0, S.useEffect)(() => {
		if (!o) return;
		let e = p.current;
		return o.current = e, () => {
			o.current === e && (o.current = null);
		};
	}, [o]), (0, S.useEffect)(() => {
		let e = te.current;
		if (!e) return;
		let t = e.clientWidth || 1, n = e.clientHeight || 1, i = new ne(), a = new l(35, t / n, .1, 100);
		a.position.set(0, 0, 5.35);
		let o = new se({
			antialias: !0,
			alpha: !0
		});
		o.setPixelRatio(Math.min(window.devicePixelRatio, 2)), o.setSize(t, n), e.appendChild(o.domElement);
		let S = ce.current, C = qt[S], w = new fe(16777215, 2105384, 1.05);
		i.add(w);
		let T = new v(16777215, 1.4);
		T.position.set(-1.4, 2.2, 2.5), i.add(T);
		let E = new v(Kt, C.rimLightIntensity);
		E.position.set(2.4, .8, 3), i.add(E);
		let Te = new ue(16777215, .18);
		i.add(Te);
		let D = new h();
		i.add(D);
		let O = new ae({
			color: C.body,
			roughness: C.roughness,
			metalness: C.metalness,
			clearcoat: C.clearcoat,
			clearcoatRoughness: C.clearcoatRoughness,
			specularIntensity: .62,
			emissive: new _(C.emissive),
			emissiveIntensity: 0,
			transparent: !1,
			depthWrite: !0
		}), k = new f(new le(ut, 64, 64), O);
		k.renderOrder = 1, D.add(k);
		let Ee = Jt(), A = new le(ut, 48, 32), j = {
			uFurNoise: { value: Ee },
			uFurColor: { value: new _(C.body) },
			uGlowColor: { value: new _(C.emissive) },
			uFurLength: { value: Dt },
			uDragForce: { value: new b(0, 0) },
			uNoiseScale: { value: Ot },
			uSmoothness: { value: .9 },
			uOpacity: { value: 1 },
			uGlow: { value: 0 }
		}, M = new re({
			uniforms: j,
			vertexShader: Yt,
			fragmentShader: Xt,
			transparent: !0,
			depthWrite: !1
		}), N = new m(A, M, Et), De = new s();
		for (let e = 0; e < Et; e += 1) {
			let t = 1 + Dt * ((e + 1) / Et);
			De.makeScale(t, t, t), N.setMatrixAt(e, De);
		}
		N.instanceMatrix.needsUpdate = !0, N.computeBoundingSphere(), N.renderOrder = 2, D.add(N);
		let Ae = new oe({
			colorWrite: !1,
			depthWrite: !0,
			transparent: !0,
			side: 1
		}), P = new f(k.geometry, Ae);
		P.scale.setScalar(1.187), P.renderOrder = 2.5, P.visible = !1, D.add(P);
		let F = new ee();
		F.absellipse(0, 0, .58, .11, 0, Math.PI * 2, !1, 0);
		let I = new d(F, 32), L = new oe({
			color: C.shadow,
			transparent: !0,
			opacity: C.shadowOpacity,
			depthWrite: !1
		}), je = new f(I, L);
		je.position.set(0, -1.08, -.4), je.renderOrder = -1, i.add(je);
		let Me = new h();
		D.add(Me);
		let Ne = new _(C.eyes), Pe = new u(rt, it), R = [], Ie = [], He = [];
		for (let e of [-1, 1]) {
			let t = st(Ne), n = new re({
				uniforms: t,
				vertexShader: at,
				fragmentShader: ot,
				transparent: !0,
				depthWrite: !1
			}), r = new f(Pe, n);
			r.position.set(e * .22, ft, ut * 1.01), r.renderOrder = 4, Me.add(r), He.push(r), R.push(t), Ie.push(n);
		}
		let Ue = new b(0, 0), We = new b(0, 0), Ge = new b(0, 0), Ke = !1, z = 0, Ye = 0, Xe = -1, Ze = !1, $e = g.current, et = new x(), tt = window.matchMedia("(hover: hover) and (pointer: fine)"), nt = (e) => {
			if (!tt.matches || de.current) {
				Ue.set(0, 0), Ke = !1;
				return;
			}
			z = performance.now();
			let t = o.domElement.getBoundingClientRect();
			e.clientX >= t.left && e.clientX <= t.right && e.clientY >= t.top && e.clientY <= t.bottom ? (We.x = (e.clientX - t.left) / t.width * 2 - 1, We.y = -((e.clientY - t.top) / t.height) * 2 + 1, et.setFromCamera(We, a), Ke = et.intersectObject(k, !1).length > 0) : Ke = !1;
			let n = t.left + t.width / 2, r = t.top + t.height / 2, i = Re(e.clientX - n, r - e.clientY, Math.min(t.width, t.height));
			Ue.set(i.x, i.y);
		}, H = () => {
			Ue.set(0, 0), Ke = !1;
		};
		window.addEventListener("pointermove", nt), document.addEventListener("pointerleave", H), window.addEventListener("blur", H);
		let U = be(), lt = me(), W = me();
		_e(W, xe.neutral);
		let kt = Array.from({ length: 17 }, (e, t) => B(W[t])), Zt = (e) => e < 14 ? qe.eye : qe.body, Qt = {
			open: 1,
			curve: 0,
			slant: 0,
			width: 1,
			height: 1,
			rotationZ: 0,
			offsetY: 0
		}, $t = {
			squashY: 1,
			lift: 0,
			tilt: 0
		}, en = {
			x: 0,
			lift: 0,
			squashY: 1,
			tilt: 0,
			yaw: 0,
			pitch: 0,
			eyeOpen: 1
		}, tn = [
			"x",
			"lift",
			"squashY",
			"tilt",
			"yaw",
			"pitch"
		], K = {
			x: B(),
			lift: B(),
			squashY: B(1),
			tilt: B(),
			yaw: B(),
			pitch: B()
		}, nn = {
			x: B(),
			y: B()
		}, q = {
			yaw: B(),
			pitch: B(),
			roll: B()
		}, rn = !1, an = !1, on = p.current;
		on.playClip = (e) => pe(U, e);
		let sn = 1, cn = ht, J = -1, ln = -1, un = 0, dn = !1, fn = (e) => {
			J = e, ln = !dn && Math.random() < Ut ? Math.random() < .5 ? 0 : 1 : -1;
		}, pn = (e) => {
			if (un > 0) {
				--un, dn = !0, cn = e + Ht;
				return;
			}
			dn = !1, un = +(Math.random() < Vt), cn = e + ht + Math.random() * (gt - ht);
		}, mn = 0, hn = 0, gn = c.randFloat(Lt, Rt), Y = null, _n = 0, X = null, vn = !1, yn = { val: 0 }, bn = null, xn = 0, Sn = 1, Cn = new _(C.emissive), wn = new _(Kt), Z = new b(0, 0), Q = new b(0, 0), Tn = 0, En = performance.now(), Dn = En, $ = 0, On = (e) => {
			if (Tn = requestAnimationFrame(On), document.hidden || document.documentElement.classList.contains("canvas-interacting")) {
				Dn = e, En = e;
				return;
			}
			let t = !de.current, n = g.current, s = t && tt.matches && Ke, l = we.current?.(), ee = t && !!(l?.active || Z.lengthSq() > G * G || Q.lengthSq() > G * G), te = 1e3 / (t && (ie.current || s || ee || J >= 0 || rn || an || U.clipId !== null && Number.isFinite(Se[U.clipId].duration) || Y !== null || yn.val > .002 || e - z < xt || e - y.current < St) ? bt : yt), u = e - En;
			if (u < te) return;
			En = e - u % te;
			let d = Math.min((e - Dn) / 1e3, 1 / 15);
			if (Dn = e, $ += d, ve(U, d), !t) Z.set(0, 0), Q.set(0, 0), Y = null;
			else {
				let e = l?.active ? l.x : 0, t = l?.active ? l.y : 0;
				Q.x += ((e - Z.x) * At - Q.x * jt) * d, Q.y += ((t - Z.y) * At - Q.y * jt) * d, Z.x += Q.x * d, Z.y += Q.y * d, !l?.active && Z.lengthSq() <= G * G && Q.lengthSq() <= G * G && (Z.set(0, 0), Q.set(0, 0));
			}
			j.uDragForce.value.copy(Z), n !== $e && (Ge.set(0, 0), Xe = -1, Ye = $, Y = null, t && n === "success" ? (Y = "hop", _n = $) : t && n === "error" && (Y = "shake", _n = $), $e = n);
			let f = n === "thinking", p = ge(U), m = t && (n === "idle" || f) && !p, ne = f ? Ct : Nt, re = m && e - z >= ne;
			if (re && !Ze && (Ye = $), Ze = re, re) {
				let e = f ? Mt : It;
				if ($ >= Ye) {
					Xe = Ve(Xe, e.length, Math.random());
					let [t, n] = e[Xe];
					Ge.set(t, n), Ye = $ + (f ? c.randFloat(wt, Tt) : c.randFloat(Pt, Ft));
				}
			}
			let h = Y ? Fe(Y, ($ - _n) / ke[Y]) : null;
			Y && $ - _n >= ke[Y] && (Y = null);
			let ae = ce.current;
			if (ae !== S) {
				S = ae;
				let e = qt[S];
				O.color.setHex(e.body), O.emissive.setHex(e.emissive), O.roughness = e.roughness, O.metalness = e.metalness, O.clearcoat = e.clearcoat, O.clearcoatRoughness = e.clearcoatRoughness, O.needsUpdate = !0, j.uFurColor.value.setHex(e.body), Ne.setHex(e.eyes), L.color.setHex(e.shadow), L.opacity = e.shadowOpacity, E.intensity = e.rimLightIntensity;
			}
			let oe = (n === "idle" || f) && !p, _ = re ? Ge : Ue, v = t && oe ? _.x : 0, se = t && oe ? _.y : 0, le = v * (f ? .6 : 1), ue = se * (f ? .6 : 1);
			if (t) {
				let e = V(nn.x, v, _t, d), t = V(nn.y, se, _t, d), n = V(q.yaw, le * pt, qe.head, d), r = V(q.pitch, -ue * pt, qe.head, d);
				an = !(e && t && n && r);
			} else {
				for (let e of [...Object.values(nn), ...Object.values(q)]) Je(e, 0);
				an = !1;
			}
			Me.rotation.set(-nn.y.value * dt, nn.x.value * dt, 0);
			let b = 0;
			t && n === "idle" && U.clipId === null && ($ >= gn && (mn = (Math.random() < .5 ? -1 : 1) * c.randFloat(Bt * .5, Bt), hn = $ + zt, gn = hn + c.randFloat(Lt, Rt)), b = ($ < hn ? mn : 0) - v * .09), t && V(q.roll, b, qe.head, d);
			let fe = t && (n === "idle" || f) && U.clipId === null;
			fe ? J < 0 && $ >= cn && fn($) : (sn = 1, J = -1, cn = $ + ht), fe && J >= 0 && (sn = Le($ - J), $ - J >= .24 && (sn = 1, J = -1, pn($))), ye(U, Wt[n], lt), t && n === "idle" && U.clipId === null && (lt[0] *= 1 + v * .14, lt[7] *= 1 - v * .14), rn = !1;
			for (let e = 0; e < 17; e += 1) {
				let n = lt[e];
				t ? V(kt[e], n, Zt(e), d) || (rn = !0) : Je(kt[e], n), W[e] = kt[e].value;
			}
			ze(n, U.clipId, U.elapsed, $, en);
			for (let e of tn) t ? V(K[e], en[e], vt, d) : Je(K[e], +(e === "squashY"));
			for (let e = 0; e < He.length; e += 1) {
				let n = He[e];
				he(W, e, Qt), Qt.open *= (ln < 0 || ln === e ? sn : 1) * (t ? en.eyeOpen : 1), ct(R[e], Qt), n.rotation.z = Qt.rotationZ, n.position.y = ft + Qt.offsetY;
			}
			Ce(W, $t), D.rotation.z = t ? q.roll.value + $t.tilt + K.tilt.value : 0, D.rotation.x = q.pitch.value + K.pitch.value, D.position.x = K.x.value, D.position.y = t ? K.lift.value + (h?.lift ?? 0) + $t.lift : 0;
			let x = qt[S], pe = ie.current, me = n !== "idle", _e = n === "idle" ? x.emissive : Gt[n];
			Cn.setHex(_e), wn.setHex(me ? _e : Kt), O.emissive.lerp(Cn, .14), E.color.lerp(wn, .14);
			let be = s ? x.hoverEmissiveIntensity : me ? x.statusEmissiveIntensity : 0;
			O.emissiveIntensity = c.lerp(O.emissiveIntensity, be, .1), j.uGlowColor.value.copy(O.emissive), j.uGlow.value = O.emissiveIntensity, E.intensity = c.lerp(E.intensity, x.rimLightIntensity + (me ? x.statusRimBoost : 0), .1), T.intensity = c.lerp(T.intensity, s ? x.hoverKeyLightIntensity : 1.4, .1), Sn = t ? Qe(Sn, s ? 1.015 : 1, mt, d) : 1, pe && !X && !vn && (vn = !0, X = Oe(), X.group.visible = !1, i.add(X.group), vn = !1), !t && yn.val !== 0 && (bn?.kill(), yn.val = 0, xn = 0);
			let xe = t && pe && X ? 1 : 0;
			xe !== xn && (xn = xe, bn?.kill(), bn = r.to(yn, {
				val: xe,
				duration: xe ? .45 : .6,
				ease: xe ? "power2.out" : "power2.inOut"
			}));
			let C = yn.val;
			D.rotation.y = q.yaw.value + K.yaw.value + (h?.yaw ?? 0);
			let w = t ? K.squashY.value * (h?.squashY ?? 1) * $t.squashY : 1, Te = Be(w);
			D.scale.set(Sn * Te, Sn * w, Sn * Te);
			let k = Math.max(D.position.y, 0);
			if (je.scale.setScalar(1 - Math.min(k * .5, .18)), L.opacity = x.shadowOpacity * (1 - Math.min(k * 1.4, .45)), X) {
				let e = C > .002;
				P.visible = e, X.group.visible = e, X.setIntensity(C), e && t && X.update(d, a.position);
			}
			o.render(i, a);
		};
		Tn = requestAnimationFrame(On);
		let kn = new ResizeObserver(() => {
			let t = e.clientWidth || 1, n = e.clientHeight || 1;
			a.aspect = t / n, a.updateProjectionMatrix(), o.setSize(t, n);
		});
		return kn.observe(e), () => {
			cancelAnimationFrame(Tn), kn.disconnect(), window.removeEventListener("pointermove", nt), document.removeEventListener("pointerleave", H), window.removeEventListener("blur", H), k.geometry.dispose(), O.dispose(), A.dispose(), M.dispose(), Ae.dispose(), Ee.dispose(), I.dispose(), L.dispose(), Pe.dispose();
			for (let e of Ie) e.dispose();
			on.playClip = () => !1, bn?.kill(), X &&= (i.remove(X.group), X.dispose(), null), o.dispose(), e.contains(o.domElement) && e.removeChild(o.domElement);
		};
	}, []), /* @__PURE__ */ (0, lt.jsx)("div", {
		ref: te,
		className: "h-full w-full cursor-pointer"
	});
}
//#endregion
export { Zt as default };
