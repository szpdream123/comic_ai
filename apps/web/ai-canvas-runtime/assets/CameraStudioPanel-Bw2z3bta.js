import { o as e, t } from "./react-Dfufv8pq.js";
import { t as n } from "./jsx-runtime-BAkIPmuO.js";
import { n as r } from "./rasterImageDimensions-CX1VK2cM.js";
import { t as i } from "./FullscreenOverlay-BTKONk6M.js";
import { E as a, F as o, H as s, I as c, L as l, M as u, O as d, U as f, V as p, Y as m, Z as h, a as g, b as _, c as v, k as y, l as b, n as x, nt as S, q as C, r as ee, u as te } from "./three.module-Xrs-xySb.js";
import { i as w, n as T, o as E, r as D, s as O, t as k } from "./cameraStudio-D2rT6ZbS.js";
//#region src/styles/camera-studio.css
var A = /* @__PURE__ */ e(t(), 1), j = n(), M = [
	{
		value: "far",
		label: "远景"
	},
	{
		value: "full",
		label: "全身"
	},
	{
		value: "medium",
		label: "中景"
	},
	{
		value: "close",
		label: "近景"
	},
	{
		value: "extreme-close",
		label: "特写"
	}
], N = [
	"15mm",
	"24mm",
	"35mm",
	"50mm",
	"85mm",
	"200mm",
	"fisheye"
], P = [
	{
		value: "cool",
		label: "冷光"
	},
	{
		value: "neutral",
		label: "中性"
	},
	{
		value: "warm",
		label: "暖光"
	}
];
function F(e, t, n) {
	let r = a.degToRad(e), i = a.degToRad(t);
	return new S(Math.sin(r) * Math.cos(i) * n, Math.sin(i) * n, Math.cos(r) * Math.cos(i) * n);
}
function I({ imageUrl: e, mode: t, activeControl: n, cameraState: r, lightState: i, onCameraChange: S, onLightChange: w }) {
	let T = (0, A.useRef)(null), E = (0, A.useRef)(null), D = (0, A.useRef)(null), k = (0, A.useRef)(null), M = (0, A.useRef)(null), N = (0, A.useRef)(r), P = (0, A.useRef)(i), I = (0, A.useRef)(t);
	(0, A.useEffect)(() => {
		N.current = r, P.current = i, I.current = t;
	}, [
		r,
		i,
		t
	]), (0, A.useEffect)(() => {
		let t = T.current;
		if (!t) return;
		let n = getComputedStyle(t), r = N.current, i = P.current, S = I.current, w = new b(n.getPropertyValue("--node-panorama-light").trim()), O = new b(n.getPropertyValue("--warning-light").trim()), A = new b(n.getPropertyValue("--theme-text-muted").trim()), j = new f(), M = new o(38, 1, .1, 100);
		M.position.set(0, .25, 6.1), M.lookAt(0, 0, 0);
		let L = new x({
			antialias: !0,
			alpha: !0
		});
		L.setPixelRatio(Math.min(window.devicePixelRatio, 2)), L.outputColorSpace = s, L.domElement.className = "camera-studio-canvas", t.appendChild(L.domElement);
		let R = new ee(16777215, 1.4);
		j.add(R);
		let z = new C(1.72, 28, 18), ne = new y({
			color: A,
			wireframe: !0,
			transparent: !0,
			opacity: .38
		});
		j.add(new d(z, ne));
		let B = new h(1.73, .008, 8, 96), V = new y({
			color: A,
			transparent: !0,
			opacity: .7
		}), H = new d(B, V);
		H.rotation.x = Math.PI / 2, j.add(H);
		let re = new d(B, V.clone());
		j.add(re);
		let U = new _(), ie = new d(new v(.83, 48), new y({
			color: A,
			transparent: !0,
			opacity: .24
		}));
		U.add(ie), j.add(U);
		let W, G = !1;
		e && new m().load(e, (e) => {
			if (G) {
				e.dispose();
				return;
			}
			W = e, e.colorSpace = s;
			let t = new y({
				map: e,
				transparent: !0,
				side: 2
			}), n = new d(new c(1.45, 1.45), t);
			n.position.z = .02, U.add(n);
		}, void 0, () => void 0);
		let K = new _(), ae = new d(new g(.34, .23, .2), new u({
			color: w,
			roughness: .35,
			metalness: .25
		})), q = new d(new te(.09, .13, .2, 20), new u({
			color: w,
			roughness: .25,
			metalness: .5
		}));
		q.rotation.x = Math.PI / 2, q.position.z = -.18, K.add(ae, q), K.visible = S !== "lighting", K.position.copy(F(r.yaw, r.pitch, 2.35)), K.lookAt(0, 0, 0), K.rotateZ(a.degToRad(r.roll)), j.add(K), E.current = K;
		let J = new _(), oe = new d(new C(.15, 24, 16), new y({ color: O })), se = new d(new p(.22, .27, 32), new y({
			color: O,
			transparent: !0,
			opacity: .45,
			side: 2
		}));
		J.add(oe, se), J.visible = S !== "camera";
		let Y = F(i.yaw, i.pitch, 2.25);
		J.position.copy(Y), J.lookAt(0, 0, 0), j.add(J), D.current = J;
		let X = new l(O, 2.5, 12);
		X.position.copy(Y), X.intensity = i.intensity / 24, j.add(X), k.current = X;
		let Z = () => {
			let e = Math.max(1, t.clientWidth), n = Math.max(1, t.clientHeight);
			L.setSize(e, n, !1), M.aspect = e / n, M.updateProjectionMatrix();
		}, Q = new ResizeObserver(Z);
		Q.observe(t), Z();
		let $ = 0, ce = () => {
			H.rotation.z += 8e-4, L.render(j, M), $ = requestAnimationFrame(ce);
		};
		return ce(), () => {
			G = !0, cancelAnimationFrame($), Q.disconnect(), E.current = null, D.current = null, k.current = null, W?.dispose(), j.traverse((e) => {
				e instanceof d && (e.geometry.dispose(), (Array.isArray(e.material) ? e.material : [e.material]).forEach((e) => e.dispose()));
			}), L.dispose(), L.domElement.remove();
		};
	}, [e]), (0, A.useEffect)(() => {
		let e = E.current;
		e && (e.visible = t !== "lighting", e.position.copy(F(r.yaw, r.pitch, 2.35)), e.lookAt(0, 0, 0), e.rotateZ(a.degToRad(r.roll)));
	}, [
		r.pitch,
		r.roll,
		r.yaw,
		t
	]), (0, A.useEffect)(() => {
		let e = D.current, n = k.current;
		if (!e || !n) return;
		e.visible = t !== "camera";
		let r = F(i.yaw, i.pitch, 2.25);
		e.position.copy(r), e.lookAt(0, 0, 0), n.position.copy(r), n.intensity = i.intensity / 24;
	}, [
		i.intensity,
		i.pitch,
		i.yaw,
		t
	]);
	let L = (0, A.useCallback)((e) => {
		e.currentTarget.setPointerCapture(e.pointerId);
		let a = (t === "dual" ? n : t) === "lighting" ? i : r;
		M.current = {
			pointerId: e.pointerId,
			x: e.clientX,
			y: e.clientY,
			yaw: a.yaw,
			pitch: a.pitch
		};
	}, [
		n,
		r,
		i,
		t
	]), R = (0, A.useCallback)((e) => {
		let r = M.current;
		if (!r || r.pointerId !== e.pointerId) return;
		let i = O(r.yaw + (e.clientX - r.x) * .45), a = Math.max(-80, Math.min(80, r.pitch - (e.clientY - r.y) * .35));
		(t === "dual" ? n : t) === "lighting" ? w({
			yaw: i,
			pitch: a
		}) : S({
			yaw: i,
			pitch: a
		});
	}, [
		n,
		t,
		S,
		w
	]), z = (0, A.useCallback)((e) => {
		M.current?.pointerId === e.pointerId && (M.current = null, e.currentTarget.releasePointerCapture(e.pointerId));
	}, []);
	return /* @__PURE__ */ (0, j.jsxs)("div", {
		ref: T,
		className: "camera-studio-viewport",
		onPointerDown: L,
		onPointerMove: R,
		onPointerUp: z,
		onPointerCancel: z,
		children: [
			/* @__PURE__ */ (0, j.jsx)("div", {
				className: "camera-studio-axis camera-studio-axis--yaw",
				children: "YAW"
			}),
			/* @__PURE__ */ (0, j.jsx)("div", {
				className: "camera-studio-axis camera-studio-axis--pitch",
				children: "PITCH"
			}),
			/* @__PURE__ */ (0, j.jsxs)("div", {
				className: "camera-studio-readout",
				children: [/* @__PURE__ */ (0, j.jsx)("span", { children: t === "lighting" || t === "dual" && n === "lighting" ? "LIGHT" : "CAM" }), /* @__PURE__ */ (0, j.jsxs)("strong", { children: [Math.round(t === "lighting" || t === "dual" && n === "lighting" ? i.yaw : r.yaw), " deg"] })]
			})
		]
	});
}
function L({ label: e, value: t, min: n, max: r, step: i = 1, suffix: a = "", onChange: o }) {
	return /* @__PURE__ */ (0, j.jsxs)("label", {
		className: "camera-studio-range",
		children: [
			/* @__PURE__ */ (0, j.jsx)("span", { children: e }),
			/* @__PURE__ */ (0, j.jsxs)("output", { children: [Math.round(t * 10) / 10, a] }),
			/* @__PURE__ */ (0, j.jsx)("input", {
				type: "range",
				min: n,
				max: r,
				step: i,
				value: t,
				onChange: (e) => o(Number(e.target.value))
			})
		]
	});
}
function R({ isOpen: e, imageUrl: t, onClose: n, onGenerate: a }) {
	let [o, s] = (0, A.useState)("camera"), [c, l] = (0, A.useState)("camera"), [u, d] = (0, A.useState)(() => ({ ...T })), [f, p] = (0, A.useState)(() => ({ ...D })), [m, h] = (0, A.useState)(!1), g = (0, A.useMemo)(() => E(o, u, f), [
		u,
		f,
		o
	]), _ = (0, A.useCallback)((e) => {
		d((t) => ({
			...t,
			...e
		}));
	}, []), v = (0, A.useCallback)((e) => {
		p((t) => ({
			...t,
			...e
		}));
	}, []), y = (0, A.useCallback)((e) => {
		s(e), e !== "dual" && l(e);
	}, []), b = (0, A.useCallback)(() => {
		d({ ...T }), p({ ...D });
	}, []), x = (0, A.useCallback)(async () => {
		try {
			await navigator.clipboard.writeText(g), h(!0), window.setTimeout(() => h(!1), 1600);
		} catch {
			h(!1);
		}
	}, [g]), S = (0, A.useCallback)(() => {
		a({
			mode: o,
			camera: u,
			light: f,
			prompt: g
		});
	}, [
		u,
		f,
		o,
		a,
		g
	]), C = o === "camera" || o === "dual" && c === "camera";
	return /* @__PURE__ */ (0, j.jsx)(i, {
		isOpen: e,
		onClose: n,
		title: "小逻摄影棚",
		panelWidth: "min(96vw, 1180px)",
		className: "camera-studio-overlay",
		bodyClassName: "camera-studio-body",
		unmountOnClose: !0,
		headerContent: /* @__PURE__ */ (0, j.jsxs)("div", {
			className: "camera-studio-mode",
			role: "tablist",
			"aria-label": "摄影棚模式",
			children: [
				/* @__PURE__ */ (0, j.jsxs)("button", {
					type: "button",
					className: o === "camera" ? "is-active" : "",
					onClick: () => y("camera"),
					children: [/* @__PURE__ */ (0, j.jsx)(r, {
						icon: "mdi:camera-outline",
						width: 14
					}), "摄影机"]
				}),
				/* @__PURE__ */ (0, j.jsxs)("button", {
					type: "button",
					className: o === "lighting" ? "is-active is-light" : "",
					onClick: () => y("lighting"),
					children: [/* @__PURE__ */ (0, j.jsx)(r, {
						icon: "mdi:lightbulb-on-outline",
						width: 14
					}), "打光"]
				}),
				/* @__PURE__ */ (0, j.jsxs)("button", {
					type: "button",
					className: o === "dual" ? "is-active" : "",
					onClick: () => y("dual"),
					children: [/* @__PURE__ */ (0, j.jsx)(r, {
						icon: "mdi:vector-combine",
						width: 14
					}), "联动"]
				})
			]
		}),
		children: /* @__PURE__ */ (0, j.jsxs)("div", {
			className: "camera-studio-shell",
			children: [/* @__PURE__ */ (0, j.jsxs)("section", {
				className: "camera-studio-stage",
				children: [
					o === "dual" ? /* @__PURE__ */ (0, j.jsxs)("div", {
						className: "camera-studio-focus-switch",
						"aria-label": "联动控制对象",
						children: [/* @__PURE__ */ (0, j.jsx)("button", {
							type: "button",
							className: c === "camera" ? "is-active" : "",
							onClick: () => l("camera"),
							children: "摄影机"
						}), /* @__PURE__ */ (0, j.jsx)("button", {
							type: "button",
							className: c === "lighting" ? "is-active is-light" : "",
							onClick: () => l("lighting"),
							children: "主光源"
						})]
					}) : null,
					/* @__PURE__ */ (0, j.jsx)(I, {
						imageUrl: t,
						mode: o,
						activeControl: c,
						cameraState: u,
						lightState: f,
						onCameraChange: _,
						onLightChange: v
					}),
					/* @__PURE__ */ (0, j.jsxs)("div", {
						className: "camera-studio-prompt",
						children: [
							/* @__PURE__ */ (0, j.jsxs)("div", { children: [
								/* @__PURE__ */ (0, j.jsx)(r, {
									icon: "mdi:console-line",
									width: 14
								}),
								/* @__PURE__ */ (0, j.jsx)("span", { children: "STUDIO PROMPT" }),
								/* @__PURE__ */ (0, j.jsx)("b", { children: o.toUpperCase() })
							] }),
							/* @__PURE__ */ (0, j.jsx)("button", {
								type: "button",
								onClick: x,
								"data-tooltip": m ? "已复制" : "复制提示词",
								"aria-label": "复制提示词",
								children: /* @__PURE__ */ (0, j.jsx)(r, {
									icon: m ? "mdi:check" : "mdi:content-copy",
									width: 15
								})
							}),
							/* @__PURE__ */ (0, j.jsx)("p", { children: g })
						]
					})
				]
			}), /* @__PURE__ */ (0, j.jsxs)("aside", {
				className: "camera-studio-controls",
				children: [C ? /* @__PURE__ */ (0, j.jsxs)(j.Fragment, { children: [
					/* @__PURE__ */ (0, j.jsxs)("div", {
						className: "camera-studio-section-title",
						children: [/* @__PURE__ */ (0, j.jsx)(r, {
							icon: "mdi:camera-control",
							width: 16
						}), /* @__PURE__ */ (0, j.jsx)("span", { children: "摄影机参数" })]
					}),
					/* @__PURE__ */ (0, j.jsx)("div", {
						className: "camera-studio-presets",
						children: k.map((e) => /* @__PURE__ */ (0, j.jsx)("button", {
							type: "button",
							onClick: () => _({
								yaw: e.yaw,
								pitch: e.pitch,
								roll: e.roll ?? 0,
								...e.lens ? { lens: e.lens } : {}
							}),
							children: e.label
						}, e.id))
					}),
					/* @__PURE__ */ (0, j.jsxs)("div", {
						className: "camera-studio-range-grid",
						children: [
							/* @__PURE__ */ (0, j.jsx)(L, {
								label: "水平角度",
								value: u.yaw,
								min: -180,
								max: 180,
								suffix: "°",
								onChange: (e) => _({ yaw: e })
							}),
							/* @__PURE__ */ (0, j.jsx)(L, {
								label: "垂直角度",
								value: u.pitch,
								min: -80,
								max: 80,
								suffix: "°",
								onChange: (e) => _({ pitch: e })
							}),
							/* @__PURE__ */ (0, j.jsx)(L, {
								label: "画面倾斜",
								value: u.roll,
								min: -45,
								max: 45,
								suffix: "°",
								onChange: (e) => _({ roll: e })
							})
						]
					}),
					/* @__PURE__ */ (0, j.jsxs)("div", {
						className: "camera-studio-select-grid",
						children: [/* @__PURE__ */ (0, j.jsxs)("label", { children: [/* @__PURE__ */ (0, j.jsx)("span", { children: "景别" }), /* @__PURE__ */ (0, j.jsx)("select", {
							value: u.distance,
							onChange: (e) => _({ distance: e.target.value }),
							children: M.map((e) => /* @__PURE__ */ (0, j.jsx)("option", {
								value: e.value,
								children: e.label
							}, e.value))
						})] }), /* @__PURE__ */ (0, j.jsxs)("label", { children: [/* @__PURE__ */ (0, j.jsx)("span", { children: "镜头" }), /* @__PURE__ */ (0, j.jsx)("select", {
							value: u.lens,
							onChange: (e) => _({ lens: e.target.value }),
							children: N.map((e) => /* @__PURE__ */ (0, j.jsx)("option", {
								value: e,
								children: e
							}, e))
						})] })]
					}),
					/* @__PURE__ */ (0, j.jsxs)("label", {
						className: "camera-studio-toggle",
						children: [/* @__PURE__ */ (0, j.jsx)("input", {
							type: "checkbox",
							checked: u.promptEnhance,
							onChange: (e) => _({ promptEnhance: e.target.checked })
						}), /* @__PURE__ */ (0, j.jsx)("span", { children: "电影感增强" })]
					})
				] }) : /* @__PURE__ */ (0, j.jsxs)(j.Fragment, { children: [
					/* @__PURE__ */ (0, j.jsxs)("div", {
						className: "camera-studio-section-title is-light",
						children: [/* @__PURE__ */ (0, j.jsx)(r, {
							icon: "mdi:lightbulb-on-outline",
							width: 16
						}), /* @__PURE__ */ (0, j.jsx)("span", { children: "主光源参数" })]
					}),
					/* @__PURE__ */ (0, j.jsx)("div", {
						className: "camera-studio-presets is-light",
						children: w.map((e) => /* @__PURE__ */ (0, j.jsx)("button", {
							type: "button",
							onClick: () => v({
								yaw: e.yaw,
								pitch: e.pitch
							}),
							children: e.label
						}, e.id))
					}),
					/* @__PURE__ */ (0, j.jsxs)("div", {
						className: "camera-studio-range-grid",
						children: [
							/* @__PURE__ */ (0, j.jsx)(L, {
								label: "水平角度",
								value: f.yaw,
								min: -180,
								max: 180,
								suffix: "°",
								onChange: (e) => v({ yaw: e })
							}),
							/* @__PURE__ */ (0, j.jsx)(L, {
								label: "垂直角度",
								value: f.pitch,
								min: -80,
								max: 80,
								suffix: "°",
								onChange: (e) => v({ pitch: e })
							}),
							/* @__PURE__ */ (0, j.jsx)(L, {
								label: "光照强度",
								value: f.intensity,
								min: 10,
								max: 100,
								suffix: "%",
								onChange: (e) => v({ intensity: e })
							})
						]
					}),
					/* @__PURE__ */ (0, j.jsx)("div", {
						className: "camera-studio-temperature",
						"aria-label": "色温",
						children: P.map((e) => /* @__PURE__ */ (0, j.jsx)("button", {
							type: "button",
							className: f.temperature === e.value ? "is-active" : "",
							onClick: () => v({ temperature: e.value }),
							children: e.label
						}, e.value))
					}),
					/* @__PURE__ */ (0, j.jsxs)("div", {
						className: "camera-studio-toggle-row",
						children: [/* @__PURE__ */ (0, j.jsxs)("label", {
							className: "camera-studio-toggle",
							children: [/* @__PURE__ */ (0, j.jsx)("input", {
								type: "checkbox",
								checked: f.fillLight,
								onChange: (e) => v({ fillLight: e.target.checked })
							}), /* @__PURE__ */ (0, j.jsx)("span", { children: "柔和补光" })]
						}), /* @__PURE__ */ (0, j.jsxs)("label", {
							className: "camera-studio-toggle",
							children: [/* @__PURE__ */ (0, j.jsx)("input", {
								type: "checkbox",
								checked: f.rimLight,
								onChange: (e) => v({ rimLight: e.target.checked })
							}), /* @__PURE__ */ (0, j.jsx)("span", { children: "轮廓光" })]
						})]
					})
				] }), /* @__PURE__ */ (0, j.jsxs)("div", {
					className: "camera-studio-actions",
					children: [/* @__PURE__ */ (0, j.jsx)("button", {
						type: "button",
						className: "camera-studio-reset",
						onClick: b,
						"data-tooltip": "重置参数",
						"aria-label": "重置参数",
						children: /* @__PURE__ */ (0, j.jsx)(r, {
							icon: "mdi:restore",
							width: 17
						})
					}), /* @__PURE__ */ (0, j.jsxs)("button", {
						type: "button",
						className: "camera-studio-generate",
						onClick: S,
						children: [/* @__PURE__ */ (0, j.jsx)(r, {
							icon: "mdi:creation",
							width: 17
						}), "生成图片"]
					})]
				})]
			})]
		})
	});
}
var z = (0, A.memo)(R);
//#endregion
export { z as default };
