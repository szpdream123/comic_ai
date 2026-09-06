import { o as e, t } from "./react-Dfufv8pq.js";
import { t as n } from "./jsx-runtime-BAkIPmuO.js";
import { A as r, D as i, H as a, L as o, M as s, N as c, O as l, P as u, S as d, U as f, a as p, j as m, l as h, m as g, n as _, nt as v, q as y, r as b, t as x, x as S } from "./three.module-Xrs-xySb.js";
//#region node_modules/three/examples/jsm/environments/RoomEnvironment.js
var C = /* @__PURE__ */ e(t(), 1), ee = class extends f {
	constructor() {
		super(), this.name = "RoomEnvironment", this.position.y = -3.5;
		let e = new p();
		e.deleteAttribute("uv");
		let t = new s({ side: 1 }), n = new s(), r = new o(16777215, 900, 28, 2);
		r.position.set(.418, 16.199, .3), this.add(r);
		let i = new l(e, t);
		i.position.set(-.757, 13.219, .717), i.scale.set(31.713, 28.305, 28.591), this.add(i);
		let a = new d(e, n, 6), u = new c();
		u.position.set(-10.906, 2.009, 1.846), u.rotation.set(0, -.195, 0), u.scale.set(2.328, 7.905, 4.651), u.updateMatrix(), a.setMatrixAt(0, u.matrix), u.position.set(-5.607, -.754, -.758), u.rotation.set(0, .994, 0), u.scale.set(1.97, 1.534, 3.955), u.updateMatrix(), a.setMatrixAt(1, u.matrix), u.position.set(6.167, .857, 7.803), u.rotation.set(0, .561, 0), u.scale.set(3.927, 6.285, 3.687), u.updateMatrix(), a.setMatrixAt(2, u.matrix), u.position.set(-2.017, .018, 6.124), u.rotation.set(0, .333, 0), u.scale.set(2.002, 4.566, 2.064), u.updateMatrix(), a.setMatrixAt(3, u.matrix), u.position.set(2.291, -.756, -2.621), u.rotation.set(0, -.286, 0), u.scale.set(1.546, 1.552, 1.496), u.updateMatrix(), a.setMatrixAt(4, u.matrix), u.position.set(-2.193, -.369, -5.547), u.rotation.set(0, .516, 0), u.scale.set(3.875, 3.487, 2.986), u.updateMatrix(), a.setMatrixAt(5, u.matrix), this.add(a);
		let f = new l(e, w(50));
		f.position.set(-16.116, 14.37, 8.208), f.scale.set(.1, 2.428, 2.739), this.add(f);
		let m = new l(e, w(50));
		m.position.set(-16.109, 18.021, -8.207), m.scale.set(.1, 2.425, 2.751), this.add(m);
		let h = new l(e, w(17));
		h.position.set(14.904, 12.198, -1.832), h.scale.set(.15, 4.265, 6.331), this.add(h);
		let g = new l(e, w(43));
		g.position.set(-.462, 8.89, 14.52), g.scale.set(4.38, 5.441, .088), this.add(g);
		let _ = new l(e, w(20));
		_.position.set(3.235, 11.486, -12.541), _.scale.set(2.5, 2, .1), this.add(_);
		let v = new l(e, w(100));
		v.position.set(0, 20, 0), v.scale.set(1, .1, 1), this.add(v);
	}
	dispose() {
		let e = /* @__PURE__ */ new Set();
		this.traverse((t) => {
			t.isMesh && (e.add(t.geometry), e.add(t.material));
		});
		for (let t of e) t.dispose();
	}
};
function w(e) {
	return new r({
		color: 0,
		emissive: 16777215,
		emissiveIntensity: e
	});
}
//#endregion
//#region node_modules/three/examples/jsm/geometries/RoundedBoxGeometry.js
var T = new v();
function E(e, t, n, r, i, a) {
	let o = 2 * Math.PI * i / 4, s = Math.max(a - 2 * i, 0), c = Math.PI / 4;
	T.copy(t), T[r] = 0, T.normalize();
	let l = .5 * o / (o + s), u = 1 - T.angleTo(e) / c;
	return Math.sign(T[n]) === 1 ? u * l : s / (o + s) + l + l * (1 - u);
}
var te = class e extends p {
	constructor(e = 1, t = 1, n = 1, r = 2, i = .1) {
		let a = r * 2 + 1;
		if (i = Math.min(e / 2, t / 2, n / 2, i), super(1, 1, 1, a, a, a), this.type = "RoundedBoxGeometry", this.parameters = {
			width: e,
			height: t,
			depth: n,
			segments: r,
			radius: i
		}, a === 1) return;
		let o = this.toNonIndexed();
		this.index = null, this.attributes.position = o.attributes.position, this.attributes.normal = o.attributes.normal, this.attributes.uv = o.attributes.uv;
		let s = new v(), c = new v(), l = new v(e, t, n).divideScalar(2).subScalar(i), u = this.attributes.position.array, d = this.attributes.normal.array, f = this.attributes.uv.array, p = u.length / 6, m = new v(), h = .5 / a;
		for (let r = 0, a = 0; r < u.length; r += 3, a += 2) switch (s.fromArray(u, r), c.copy(s), c.x -= Math.sign(c.x) * h, c.y -= Math.sign(c.y) * h, c.z -= Math.sign(c.z) * h, c.normalize(), u[r + 0] = l.x * Math.sign(s.x) + c.x * i, u[r + 1] = l.y * Math.sign(s.y) + c.y * i, u[r + 2] = l.z * Math.sign(s.z) + c.z * i, d[r + 0] = c.x, d[r + 1] = c.y, d[r + 2] = c.z, Math.floor(r / p)) {
			case 0:
				m.set(1, 0, 0), f[a + 0] = E(m, c, "z", "y", i, n), f[a + 1] = 1 - E(m, c, "y", "z", i, t);
				break;
			case 1:
				m.set(-1, 0, 0), f[a + 0] = 1 - E(m, c, "z", "y", i, n), f[a + 1] = 1 - E(m, c, "y", "z", i, t);
				break;
			case 2:
				m.set(0, 1, 0), f[a + 0] = 1 - E(m, c, "x", "z", i, e), f[a + 1] = E(m, c, "z", "x", i, n);
				break;
			case 3:
				m.set(0, -1, 0), f[a + 0] = 1 - E(m, c, "x", "z", i, e), f[a + 1] = 1 - E(m, c, "z", "x", i, n);
				break;
			case 4:
				m.set(0, 0, 1), f[a + 0] = 1 - E(m, c, "x", "y", i, e), f[a + 1] = 1 - E(m, c, "y", "x", i, t);
				break;
			case 5:
				m.set(0, 0, -1), f[a + 0] = E(m, c, "x", "y", i, e), f[a + 1] = 1 - E(m, c, "y", "x", i, t);
				break;
		}
	}
	static fromJSON(t) {
		return new e(t.width, t.height, t.depth, t.segments, t.radius);
	}
}, D = n(), O = 12, k = .16, A = 1e3 / 40, j = 1.2, ne = .55;
function M() {
	let e = (0, C.useRef)(null);
	return (0, C.useEffect)(() => {
		let t = e.current;
		if (!t) return;
		let n = new f();
		n.background = new h(13816785);
		let r = new u(-1, 1, 1, -1, .1, 100);
		r.position.set(0, 0, 14), r.lookAt(0, 0, 0), r.layers.enable(1);
		let o = new _({
			antialias: !0,
			powerPreference: "low-power"
		});
		o.outputColorSpace = a, o.toneMapping = 4, o.toneMappingExposure = .92, o.transmissionResolutionScale = ne, o.setPixelRatio(Math.min(window.devicePixelRatio, j)), o.domElement.setAttribute("aria-hidden", "true"), t.appendChild(o.domElement);
		let c = new x(o), p = new ee(), C = c.fromScene(p, .04).texture;
		n.environment = C, p.dispose(), c.dispose(), n.add(new b(16777215, .012));
		let w = new g(16777215, .035);
		w.position.set(-4, 6, 10), n.add(w);
		let T = new g(16773288, 3.8);
		T.position.set(6, 7, 3), T.layers.set(1), n.add(T);
		let E = new S(16763493, 2819840, .18);
		E.layers.set(1), n.add(E);
		let D = {
			glowCenter: { value: new v() },
			glowRadius: { value: 4 }
		}, M = new m({
			color: 14080213,
			roughness: .64,
			metalness: 0,
			transmission: .985,
			thickness: .52,
			ior: 1.36,
			dispersion: .025,
			attenuationColor: new h(14934748),
			attenuationDistance: 9,
			clearcoat: .07,
			clearcoatRoughness: .5,
			envMapIntensity: .045,
			transparent: !0,
			depthWrite: !1
		});
		M.onBeforeCompile = (e) => {
			e.uniforms.glowCenter = D.glowCenter, e.uniforms.glowRadius = D.glowRadius, e.vertexShader = e.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vFrostedWorldPosition;").replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvFrostedWorldPosition = worldPosition.xyz;"), e.fragmentShader = e.fragmentShader.replace("#include <common>", "#include <common>\nuniform vec3 glowCenter;\nuniform float glowRadius;\nvarying vec3 vFrostedWorldPosition;").replace("#include <opaque_fragment>", "#include <opaque_fragment>\n          float frostedDistance = distance(vFrostedWorldPosition.xy, glowCenter.xy);\n          float frostedReveal = 1.0 - smoothstep(glowRadius * 0.34, glowRadius, frostedDistance);\n          gl_FragColor.a *= mix(0.015, 1.0, frostedReveal);");
		};
		let N = new s({
			color: 16756736,
			emissive: 3805184,
			emissiveIntensity: 0,
			roughness: .96,
			metalness: 0,
			envMapIntensity: .02
		}), P = new y(1, 48, 32), F = new l(P, N);
		F.position.z = -2.2, F.layers.set(1), n.add(F);
		let I = null, L = O, R = 0, z = .7, B = R, V = z, H = 0, U = 0, W = !1, G = null, K = () => o.render(n, r), q = (e) => {
			H = 0;
			let t = e - U;
			if (t < A) {
				H = requestAnimationFrame(q);
				return;
			}
			U = e - t % A, R += (B - R) * k, z += (V - z) * k, F.position.x = R, F.position.y = z, D.glowCenter.value.set(R, z, 0), K(), (Math.abs(B - R) > .002 || Math.abs(V - z) > .002) && (H = requestAnimationFrame(q));
		}, J = () => {
			H ||= requestAnimationFrame(q);
		}, re = (e, t) => {
			L = e / t * O, r.left = -L / 2, r.right = L / 2, r.top = O / 2, r.bottom = -12 / 2, r.updateProjectionMatrix();
			let a = L / 2, o = O / 2;
			R = Math.min(a, Math.max(-a, R)), B = Math.min(a, Math.max(-a, B)), z = Math.min(o, Math.max(-6, z)), V = Math.min(o, Math.max(-6, V));
			let s = Math.min(e, t), c = Math.min(5, Math.max(3, s * .003)), l = Math.min(220, Math.max(128, s * .175)), u = Math.max(1, Math.ceil((e + c) / (l + c))), f = Math.max(1, Math.ceil((t + c) / (l + c))), p = O / t, m = l * p, h = c * p;
			G && n.remove(G), I?.dispose();
			let g = m * .72;
			I = new te(m, m, g, 3, 23 / 412.86 * m), M.thickness = g, M.attenuationDistance = m * 3;
			let _ = m + h, v = -((u - 1) * _) / 2, b = (f - 1) * _ / 2;
			G = new d(I, M, u * f);
			let x = new i(), S = 0;
			for (let e = 0; e < f; e += 1) for (let t = 0; t < u; t += 1) x.makeTranslation(v + t * _, b - e * _, 0), G.setMatrixAt(S, x), S += 1;
			G.instanceMatrix.needsUpdate = !0, n.add(G), P.dispose(), P = new y(Math.min(180, Math.max(108, s * .137)) * p, 48, 32), F.geometry = P;
			let C = Math.min(340, Math.max(270, s * .33));
			D.glowRadius.value = C * p, W || (R = L * .08, z = O * .08, B = R, V = z), F.position.set(R, z, -2.2), D.glowCenter.value.set(R, z, 0);
		}, Y = new ResizeObserver(() => {
			let e = t.clientWidth, n = t.clientHeight;
			!e || !n || (o.setPixelRatio(Math.min(window.devicePixelRatio, j)), o.setSize(e, n, !1), re(e, n), K());
		}), X = window.matchMedia("(prefers-reduced-motion: reduce)"), Z = window.matchMedia("(pointer: coarse)"), Q = (e) => {
			if (X.matches || Z.matches) return;
			let n = t.getBoundingClientRect();
			!n.width || !n.height || (W = !0, B = ((e.clientX - n.left) / n.width - .5) * L, V = (.5 - (e.clientY - n.top) / n.height) * O, J());
		}, $ = () => {
			!X.matches && !Z.matches || (B = L * .08, V = O * .08, J());
		}, ie = () => {
			document.hidden || J();
		};
		return Y.observe(t), window.addEventListener("pointermove", Q, { passive: !0 }), document.addEventListener("visibilitychange", ie), X.addEventListener("change", $), Z.addEventListener("change", $), () => {
			Y.disconnect(), window.removeEventListener("pointermove", Q), document.removeEventListener("visibilitychange", ie), X.removeEventListener("change", $), Z.removeEventListener("change", $), H && cancelAnimationFrame(H), G && n.remove(G), I?.dispose(), M.dispose(), P.dispose(), N.dispose(), C.dispose(), t.contains(o.domElement) && t.removeChild(o.domElement), o.dispose(), o.forceContextLoss();
		};
	}, []), /* @__PURE__ */ (0, D.jsx)("div", {
		ref: e,
		className: "canvas-bg-frosted-three",
		"aria-hidden": "true",
		children: /* @__PURE__ */ (0, D.jsx)("div", { className: "canvas-bg-frosted__grain" })
	});
}
//#endregion
export { M as default };
