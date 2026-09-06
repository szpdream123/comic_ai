import { o as e, t } from "./react-Dfufv8pq.js";
import { t as n } from "./jsx-runtime-BAkIPmuO.js";
import { E as r, F as i, G as a, L as o, M as s, O as c, U as l, X as u, _ as d, b as f, k as p, l as m, m as h, n as g, q as _, r as v, u as y } from "./three.module-Xrs-xySb.js";
//#region src/components/shared/mascot/PacmanDownloadMascot.tsx
var b = /* @__PURE__ */ e(t(), 1), x = n(), S = 1e3 / 60, C = .48, w = .35, T = -.55, E = .12, D = .18, O = 8;
function k(e) {
	let t = new a();
	t.moveTo(0, 0), t.absarc(0, 0, C, e, Math.PI * 2 - e, !1), t.lineTo(0, 0);
	let n = new d(t, {
		depth: w,
		bevelEnabled: !1
	});
	return n.translate(0, 0, -.35 / 2), n;
}
function A({ progress: e, state: t = "downloading" }) {
	let n = (0, b.useRef)(null), a = (0, b.useRef)({
		progress: e,
		state: t
	});
	return (0, b.useEffect)(() => {
		a.current = {
			progress: e,
			state: t
		};
	}, [e, t]), (0, b.useEffect)(() => {
		let e = n.current;
		if (!e) return;
		let t = e.clientWidth || 1, d = e.clientHeight || 1, b = t / d, x = new l(), C = new i(38, b, .1, 20);
		C.position.set(.2, .05, 2.35), C.lookAt(T, 0, 0);
		let w = new g({
			antialias: !0,
			alpha: !0
		});
		w.setPixelRatio(Math.min(window.devicePixelRatio, 2)), w.setSize(t, d), e.appendChild(w.domElement), x.add(new v(16774056, .42));
		let A = new h(16777215, 1.4);
		A.position.set(-1.5, 2.3, 4), x.add(A);
		let j = new o(16765471, 2.2, 4.5);
		j.position.set(-.3, .4, 1.8), x.add(j);
		let M = new o(16760976, .6, 6);
		M.position.set(1.4, .7, 2.2), x.add(M);
		let N = new f();
		N.position.set(T, 0, 0), N.rotation.y = .38, x.add(N);
		let P = new s({
			color: 16765471,
			roughness: .22,
			metalness: .18,
			emissive: new m(16756736),
			emissiveIntensity: .12
		}), F = new c(k(.45), P);
		N.add(F);
		let I = new _(.06, 24, 16), L = new p({ color: 592140 }), R = new c(I, L);
		R.position.set(0, .19, .205), N.add(R);
		let z = new _(.015, 12, 8), B = new c(z, new p({ color: 16777215 }));
		B.position.set(-.005, .21, .245), N.add(B);
		let V = new s({
			color: 2040368,
			transparent: !0,
			opacity: .88,
			roughness: .5,
			metalness: .25
		}), H = new c(new y(.012, .012, 1.9, 16), V);
		H.rotation.z = Math.PI / 2, H.position.set(.35, -.01, -.04), x.add(H);
		let U = new s({
			color: 16773542,
			roughness: .35,
			emissive: new m(16762954),
			emissiveIntensity: .2
		}), W = new _(.055, 24, 16), G = [];
		for (let e = 0; e < O; e += 1) {
			let e = new c(W, U);
			x.add(e), G.push(e);
		}
		let K = new u(), q = 0, J = 0, Y = (e) => {
			if (q = requestAnimationFrame(Y), document.hidden) return;
			let t = e - J;
			if (t < S) return;
			J = e - t % S, K.update();
			let n = K.getElapsed(), { progress: i, state: o } = a.current, s = typeof i == "number" ? r.clamp(i, 0, 1) : void 0, c = o === "complete" || s === 1, l = c ? 0 : (Math.sin(n * 10) + 1) / 2, u = c ? .05 : .2 + l * .7, d = F.geometry;
			F.geometry = k(u), d.dispose();
			let f = c ? 1 + Math.sin(n * 5) * .02 : 1;
			N.scale.setScalar(f), N.rotation.z = Math.sin(n * 2.4) * (c ? .015 : .03), N.rotation.y = .38 + Math.sin(n * 1.7) * .06, j.intensity = c ? 1.4 : 1.8 + l * .65;
			let p = typeof s == "number" ? s : n * .34 % 1, m = typeof s == "number" ? Math.floor(s * O) : 0;
			G.forEach((e, t) => {
				let r = typeof s == "number" ? E + t * D : E + (t * D - p * D * O) % (D * O), i = r < E - D ? r + D * O : r, a = c || typeof s == "number" && t < m, o = i < .22799999999999998;
				e.visible = !a && (!o || typeof s != "number"), e.position.set(i, Math.sin(n * 2.6 + t) * .018, .08 + Math.sin(n * 3 + t) * .025);
				let l = 1 + Math.sin(n * 5 + t) * .08;
				e.scale.setScalar(o && typeof s == "number" ? Math.max(.2, (i - E) / D + .2) : l);
			}), w.render(x, C);
		};
		q = requestAnimationFrame(Y);
		let X = new ResizeObserver(() => {
			let t = e.clientWidth || 1, n = e.clientHeight || 1;
			C.aspect = t / n, C.updateProjectionMatrix(), w.setSize(t, n);
		});
		return X.observe(e), () => {
			cancelAnimationFrame(q), X.disconnect(), F.geometry.dispose(), P.dispose(), I.dispose(), L.dispose(), z.dispose(), B.material.dispose(), H.geometry.dispose(), V.dispose(), W.dispose(), U.dispose(), w.dispose(), e.contains(w.domElement) && e.removeChild(w.domElement);
		};
	}, []), /* @__PURE__ */ (0, x.jsx)("div", {
		ref: n,
		style: {
			width: "100%",
			height: "100%",
			pointerEvents: "none"
		}
	});
}
//#endregion
export { A as default };
