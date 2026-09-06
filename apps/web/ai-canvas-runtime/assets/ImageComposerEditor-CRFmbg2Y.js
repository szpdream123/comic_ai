import { i as e, n as t, o as n, t as r } from "./react-Dfufv8pq.js";
import { t as i } from "./scheduler-hjgAJs7S.js";
import { t as a } from "./jsx-runtime-BAkIPmuO.js";
import { si as o, t as s } from "./useAppStore-BH-MdRLu.js";
import { i as c } from "./core-D3lATfku.js";
import { C as l, S as u, l as d } from "./fileService-BawXHbsK.js";
import { t as f } from "./num-vBm-9Bix.js";
import { Ct as p, Kt as m, St as h, _t as g, bt as _, dt as v, gt as y, ht as b, mt as x, ut as ee, vt as S, xt as te, yt as ne } from "./useTooltipAutoPlacement-D1FArkVS.js";
import { t as C } from "./QualityRatioSelector-LO9EKHvS.js";
import { n as w } from "./dropCapture-BvcIf7tG.js";
import { t as T } from "./FullscreenOverlay-BTKONk6M.js";
import { a as re, l as E, r as ie } from "./onnxService-NbSJoWgT.js";
import { t as ae } from "./ImageEditorZoomControls-CCyWrBTV.js";
//#region node_modules/konva/lib/Global.js
var D = /* @__PURE__ */ n(r()), O = Math.PI / 180;
function oe() {
	return typeof window < "u" && ({}.toString.call(window) === "[object Window]" || {}.toString.call(window) === "[object global]");
}
var k = typeof global < "u" ? global : typeof window < "u" ? window : typeof WorkerGlobalScope < "u" ? self : {}, A = {
	_global: k,
	version: "10.3.0",
	isBrowser: oe(),
	isUnminified: /param/.test(function(e) {}.toString()),
	dblClickWindow: 400,
	getAngle(e) {
		return A.angleDeg ? e * O : e;
	},
	enableTrace: !1,
	pointerEventsEnabled: !0,
	autoDrawEnabled: !0,
	hitOnDragEnabled: !1,
	capturePointerEventsEnabled: !1,
	_mouseListenClick: !1,
	_touchListenClick: !1,
	_pointerListenClick: !1,
	_mouseInDblClickWindow: !1,
	_touchInDblClickWindow: !1,
	_pointerInDblClickWindow: !1,
	_mouseDblClickPointerId: null,
	_touchDblClickPointerId: null,
	_pointerDblClickPointerId: null,
	_renderBackend: "web",
	legacyTextRendering: !1,
	pixelRatio: typeof window < "u" && window.devicePixelRatio || 1,
	dragDistance: 3,
	angleDeg: !0,
	showWarnings: !0,
	dragButtons: [0, 1],
	isDragging() {
		return A.DD.isDragging;
	},
	isTransforming() {
		return A.Transformer?.isTransforming() ?? !1;
	},
	isDragReady() {
		return !!A.DD.node;
	},
	releaseCanvasOnDestroy: !0,
	document: k.document,
	_injectGlobal(e) {
		k.Konva !== void 0 && console.error("Several Konva instances detected. It is not recommended to use multiple Konva instances in the same environment."), k.Konva = e;
	}
}, se = (e) => {
	A[e.prototype.getClassName()] = e;
};
A._injectGlobal(A);
//#endregion
//#region node_modules/konva/lib/Util.js
var ce = "Konva.js unsupported environment.\n\nLooks like you are trying to use Konva.js in Node.js environment. because \"document\" object is undefined.\n\nTo use Konva.js in Node.js environment, you need to use the \"canvas-backend\" or \"skia-backend\" module.\n\nbash: npm install canvas\njs: import \"konva/canvas-backend\";\n\nor\n\nbash: npm install skia-canvas\njs: import \"konva/skia-backend\";\n", le = () => {
	if (typeof document > "u") throw Error(ce);
}, ue = class e {
	constructor(e = [
		1,
		0,
		0,
		1,
		0,
		0
	]) {
		this.dirty = !1, this.m = e && e.slice() || [
			1,
			0,
			0,
			1,
			0,
			0
		];
	}
	reset() {
		this.m[0] = 1, this.m[1] = 0, this.m[2] = 0, this.m[3] = 1, this.m[4] = 0, this.m[5] = 0;
	}
	copy() {
		return new e(this.m);
	}
	copyInto(e) {
		e.m[0] = this.m[0], e.m[1] = this.m[1], e.m[2] = this.m[2], e.m[3] = this.m[3], e.m[4] = this.m[4], e.m[5] = this.m[5];
	}
	point(e) {
		let t = this.m;
		return {
			x: t[0] * e.x + t[2] * e.y + t[4],
			y: t[1] * e.x + t[3] * e.y + t[5]
		};
	}
	translate(e, t) {
		return this.m[4] += this.m[0] * e + this.m[2] * t, this.m[5] += this.m[1] * e + this.m[3] * t, this;
	}
	scale(e, t) {
		return this.m[0] *= e, this.m[1] *= e, this.m[2] *= t, this.m[3] *= t, this;
	}
	rotate(e) {
		let t = Math.cos(e), n = Math.sin(e), r = this.m[0] * t + this.m[2] * n, i = this.m[1] * t + this.m[3] * n, a = this.m[0] * -n + this.m[2] * t, o = this.m[1] * -n + this.m[3] * t;
		return this.m[0] = r, this.m[1] = i, this.m[2] = a, this.m[3] = o, this;
	}
	getTranslation() {
		return {
			x: this.m[4],
			y: this.m[5]
		};
	}
	skew(e, t) {
		let n = this.m[0] + this.m[2] * t, r = this.m[1] + this.m[3] * t, i = this.m[2] + this.m[0] * e, a = this.m[3] + this.m[1] * e;
		return this.m[0] = n, this.m[1] = r, this.m[2] = i, this.m[3] = a, this;
	}
	multiply(e) {
		let t = this.m[0] * e.m[0] + this.m[2] * e.m[1], n = this.m[1] * e.m[0] + this.m[3] * e.m[1], r = this.m[0] * e.m[2] + this.m[2] * e.m[3], i = this.m[1] * e.m[2] + this.m[3] * e.m[3], a = this.m[0] * e.m[4] + this.m[2] * e.m[5] + this.m[4], o = this.m[1] * e.m[4] + this.m[3] * e.m[5] + this.m[5];
		return this.m[0] = t, this.m[1] = n, this.m[2] = r, this.m[3] = i, this.m[4] = a, this.m[5] = o, this;
	}
	invert() {
		let e = 1 / (this.m[0] * this.m[3] - this.m[1] * this.m[2]), t = this.m[3] * e, n = -this.m[1] * e, r = -this.m[2] * e, i = this.m[0] * e, a = e * (this.m[2] * this.m[5] - this.m[3] * this.m[4]), o = e * (this.m[1] * this.m[4] - this.m[0] * this.m[5]);
		return this.m[0] = t, this.m[1] = n, this.m[2] = r, this.m[3] = i, this.m[4] = a, this.m[5] = o, this;
	}
	getMatrix() {
		return this.m;
	}
	decompose() {
		let e = this.m[0], t = this.m[1], n = this.m[2], r = this.m[3], i = this.m[4], a = this.m[5], o = e * r - t * n, s = {
			x: i,
			y: a,
			rotation: 0,
			scaleX: 0,
			scaleY: 0,
			skewX: 0,
			skewY: 0
		};
		if (e != 0 || t != 0) {
			let i = Math.sqrt(e * e + t * t);
			s.rotation = t > 0 ? Math.acos(e / i) : -Math.acos(e / i), s.scaleX = i, s.scaleY = o / i, s.skewX = (e * n + t * r) / o, s.skewY = 0;
		} else if (n != 0 || r != 0) {
			let i = Math.sqrt(n * n + r * r);
			s.rotation = Math.PI / 2 - (r > 0 ? Math.acos(-n / i) : -Math.acos(n / i)), s.scaleX = o / i, s.scaleY = i, s.skewX = 0, s.skewY = (e * n + t * r) / o;
		}
		return s.rotation = M._getRotation(s.rotation), s;
	}
}, de = "[object Array]", fe = "[object Number]", pe = "[object String]", me = "[object Boolean]", he = Math.PI / 180, ge = 180 / Math.PI, j = "#", _e = "", ve = "0", ye = "Konva warning: ", be = "Konva error: ", xe = "rgb(", Se = {
	aliceblue: [
		240,
		248,
		255
	],
	antiquewhite: [
		250,
		235,
		215
	],
	aqua: [
		0,
		255,
		255
	],
	aquamarine: [
		127,
		255,
		212
	],
	azure: [
		240,
		255,
		255
	],
	beige: [
		245,
		245,
		220
	],
	bisque: [
		255,
		228,
		196
	],
	black: [
		0,
		0,
		0
	],
	blanchedalmond: [
		255,
		235,
		205
	],
	blue: [
		0,
		0,
		255
	],
	blueviolet: [
		138,
		43,
		226
	],
	brown: [
		165,
		42,
		42
	],
	burlywood: [
		222,
		184,
		135
	],
	cadetblue: [
		95,
		158,
		160
	],
	chartreuse: [
		127,
		255,
		0
	],
	chocolate: [
		210,
		105,
		30
	],
	coral: [
		255,
		127,
		80
	],
	cornflowerblue: [
		100,
		149,
		237
	],
	cornsilk: [
		255,
		248,
		220
	],
	crimson: [
		220,
		20,
		60
	],
	cyan: [
		0,
		255,
		255
	],
	darkblue: [
		0,
		0,
		139
	],
	darkcyan: [
		0,
		139,
		139
	],
	darkgoldenrod: [
		184,
		132,
		11
	],
	darkgray: [
		169,
		169,
		169
	],
	darkgreen: [
		0,
		100,
		0
	],
	darkgrey: [
		169,
		169,
		169
	],
	darkkhaki: [
		189,
		183,
		107
	],
	darkmagenta: [
		139,
		0,
		139
	],
	darkolivegreen: [
		85,
		107,
		47
	],
	darkorange: [
		255,
		140,
		0
	],
	darkorchid: [
		153,
		50,
		204
	],
	darkred: [
		139,
		0,
		0
	],
	darksalmon: [
		233,
		150,
		122
	],
	darkseagreen: [
		143,
		188,
		143
	],
	darkslateblue: [
		72,
		61,
		139
	],
	darkslategray: [
		47,
		79,
		79
	],
	darkslategrey: [
		47,
		79,
		79
	],
	darkturquoise: [
		0,
		206,
		209
	],
	darkviolet: [
		148,
		0,
		211
	],
	deeppink: [
		255,
		20,
		147
	],
	deepskyblue: [
		0,
		191,
		255
	],
	dimgray: [
		105,
		105,
		105
	],
	dimgrey: [
		105,
		105,
		105
	],
	dodgerblue: [
		30,
		144,
		255
	],
	firebrick: [
		178,
		34,
		34
	],
	floralwhite: [
		255,
		255,
		240
	],
	forestgreen: [
		34,
		139,
		34
	],
	fuchsia: [
		255,
		0,
		255
	],
	gainsboro: [
		220,
		220,
		220
	],
	ghostwhite: [
		248,
		248,
		255
	],
	gold: [
		255,
		215,
		0
	],
	goldenrod: [
		218,
		165,
		32
	],
	gray: [
		128,
		128,
		128
	],
	green: [
		0,
		128,
		0
	],
	greenyellow: [
		173,
		255,
		47
	],
	grey: [
		128,
		128,
		128
	],
	honeydew: [
		240,
		255,
		240
	],
	hotpink: [
		255,
		105,
		180
	],
	indianred: [
		205,
		92,
		92
	],
	indigo: [
		75,
		0,
		130
	],
	ivory: [
		255,
		255,
		240
	],
	khaki: [
		240,
		230,
		140
	],
	lavender: [
		230,
		230,
		250
	],
	lavenderblush: [
		255,
		240,
		245
	],
	lawngreen: [
		124,
		252,
		0
	],
	lemonchiffon: [
		255,
		250,
		205
	],
	lightblue: [
		173,
		216,
		230
	],
	lightcoral: [
		240,
		128,
		128
	],
	lightcyan: [
		224,
		255,
		255
	],
	lightgoldenrodyellow: [
		250,
		250,
		210
	],
	lightgray: [
		211,
		211,
		211
	],
	lightgreen: [
		144,
		238,
		144
	],
	lightgrey: [
		211,
		211,
		211
	],
	lightpink: [
		255,
		182,
		193
	],
	lightsalmon: [
		255,
		160,
		122
	],
	lightseagreen: [
		32,
		178,
		170
	],
	lightskyblue: [
		135,
		206,
		250
	],
	lightslategray: [
		119,
		136,
		153
	],
	lightslategrey: [
		119,
		136,
		153
	],
	lightsteelblue: [
		176,
		196,
		222
	],
	lightyellow: [
		255,
		255,
		224
	],
	lime: [
		0,
		255,
		0
	],
	limegreen: [
		50,
		205,
		50
	],
	linen: [
		250,
		240,
		230
	],
	magenta: [
		255,
		0,
		255
	],
	maroon: [
		128,
		0,
		0
	],
	mediumaquamarine: [
		102,
		205,
		170
	],
	mediumblue: [
		0,
		0,
		205
	],
	mediumorchid: [
		186,
		85,
		211
	],
	mediumpurple: [
		147,
		112,
		219
	],
	mediumseagreen: [
		60,
		179,
		113
	],
	mediumslateblue: [
		123,
		104,
		238
	],
	mediumspringgreen: [
		0,
		250,
		154
	],
	mediumturquoise: [
		72,
		209,
		204
	],
	mediumvioletred: [
		199,
		21,
		133
	],
	midnightblue: [
		25,
		25,
		112
	],
	mintcream: [
		245,
		255,
		250
	],
	mistyrose: [
		255,
		228,
		225
	],
	moccasin: [
		255,
		228,
		181
	],
	navajowhite: [
		255,
		222,
		173
	],
	navy: [
		0,
		0,
		128
	],
	oldlace: [
		253,
		245,
		230
	],
	olive: [
		128,
		128,
		0
	],
	olivedrab: [
		107,
		142,
		35
	],
	orange: [
		255,
		165,
		0
	],
	orangered: [
		255,
		69,
		0
	],
	orchid: [
		218,
		112,
		214
	],
	palegoldenrod: [
		238,
		232,
		170
	],
	palegreen: [
		152,
		251,
		152
	],
	paleturquoise: [
		175,
		238,
		238
	],
	palevioletred: [
		219,
		112,
		147
	],
	papayawhip: [
		255,
		239,
		213
	],
	peachpuff: [
		255,
		218,
		185
	],
	peru: [
		205,
		133,
		63
	],
	pink: [
		255,
		192,
		203
	],
	plum: [
		221,
		160,
		203
	],
	powderblue: [
		176,
		224,
		230
	],
	purple: [
		128,
		0,
		128
	],
	rebeccapurple: [
		102,
		51,
		153
	],
	red: [
		255,
		0,
		0
	],
	rosybrown: [
		188,
		143,
		143
	],
	royalblue: [
		65,
		105,
		225
	],
	saddlebrown: [
		139,
		69,
		19
	],
	salmon: [
		250,
		128,
		114
	],
	sandybrown: [
		244,
		164,
		96
	],
	seagreen: [
		46,
		139,
		87
	],
	seashell: [
		255,
		245,
		238
	],
	sienna: [
		160,
		82,
		45
	],
	silver: [
		192,
		192,
		192
	],
	skyblue: [
		135,
		206,
		235
	],
	slateblue: [
		106,
		90,
		205
	],
	slategray: [
		119,
		128,
		144
	],
	slategrey: [
		119,
		128,
		144
	],
	snow: [
		255,
		255,
		250
	],
	springgreen: [
		0,
		255,
		127
	],
	steelblue: [
		70,
		130,
		180
	],
	tan: [
		210,
		180,
		140
	],
	teal: [
		0,
		128,
		128
	],
	thistle: [
		216,
		191,
		216
	],
	transparent: [
		255,
		255,
		255,
		0
	],
	tomato: [
		255,
		99,
		71
	],
	turquoise: [
		64,
		224,
		208
	],
	violet: [
		238,
		130,
		238
	],
	wheat: [
		245,
		222,
		179
	],
	white: [
		255,
		255,
		255
	],
	whitesmoke: [
		245,
		245,
		245
	],
	yellow: [
		255,
		255,
		0
	],
	yellowgreen: [
		154,
		205,
		5
	]
}, Ce = /rgb\((\d{1,3}),(\d{1,3}),(\d{1,3})\)/, we = [], Te = null, Ee = typeof requestAnimationFrame < "u" && requestAnimationFrame || function(e) {
	setTimeout(e, 16);
}, M = {
	_isElement(e) {
		return !!(e && e.nodeType == 1);
	},
	_isFunction(e) {
		return !!(e && e.constructor && e.call && e.apply);
	},
	_isPlainObject(e) {
		return !!e && e.constructor === Object;
	},
	_isArray(e) {
		return Object.prototype.toString.call(e) === de;
	},
	_isNumber(e) {
		return Object.prototype.toString.call(e) === fe && !isNaN(e) && isFinite(e);
	},
	_isString(e) {
		return Object.prototype.toString.call(e) === pe;
	},
	_isBoolean(e) {
		return Object.prototype.toString.call(e) === me;
	},
	isObject(e) {
		return e instanceof Object;
	},
	isValidSelector(e) {
		if (typeof e != "string") return !1;
		let t = e[0];
		return t === "#" || t === "." || t === t.toUpperCase();
	},
	_sign(e) {
		return e === 0 || e > 0 ? 1 : -1;
	},
	requestAnimFrame(e) {
		we.push(e), we.length === 1 && Ee(function() {
			let e = we;
			we = [], e.forEach(function(e) {
				e();
			});
		});
	},
	createCanvasElement() {
		le();
		let e = document.createElement("canvas");
		try {
			e.style = e.style || {};
		} catch {}
		return e;
	},
	createImageElement() {
		return le(), document.createElement("img");
	},
	_isInDocument(e) {
		for (; e = e.parentNode;) if (e == document) return !0;
		return !1;
	},
	_urlToImage(e, t) {
		let n = M.createImageElement();
		n.onload = function() {
			t(n);
		}, n.src = e;
	},
	_rgbToHex(e, t, n) {
		return ((1 << 24) + (e << 16) + (t << 8) + n).toString(16).slice(1);
	},
	_hexToRgb(e) {
		e = e.replace(j, _e);
		let t = parseInt(e, 16);
		return {
			r: t >> 16 & 255,
			g: t >> 8 & 255,
			b: t & 255
		};
	},
	getRandomColor() {
		let e = (Math.random() * 16777215 << 0).toString(16);
		for (; e.length < 6;) e = ve + e;
		return j + e;
	},
	isCanvasFarblingActive() {
		if (Te !== null) return Te;
		if (typeof document > "u") return Te = !1, !1;
		let e = this.createCanvasElement();
		e.width = 10, e.height = 10;
		let t = e.getContext("2d", { willReadFrequently: !0 });
		t.clearRect(0, 0, 10, 10), t.fillStyle = "#282828", t.fillRect(0, 0, 10, 10);
		let n = t.getImageData(0, 0, 10, 10).data, r = !1;
		for (let e = 0; e < 100; e++) if (n[e * 4] !== 40 || n[e * 4 + 1] !== 40 || n[e * 4 + 2] !== 40 || n[e * 4 + 3] !== 255) {
			r = !0;
			break;
		}
		return Te = r, this.releaseCanvas(e), Te;
	},
	getHitColor() {
		let e = this.getRandomColor();
		return this.isCanvasFarblingActive() ? this.getSnappedHexColor(e) : e;
	},
	getHitColorKey(e, t, n) {
		return this.isCanvasFarblingActive() && (e = Math.round(e / 5) * 5, t = Math.round(t / 5) * 5, n = Math.round(n / 5) * 5), j + this._rgbToHex(e, t, n);
	},
	getSnappedHexColor(e) {
		let t = this._hexToRgb(e);
		return j + this._rgbToHex(Math.round(t.r / 5) * 5, Math.round(t.g / 5) * 5, Math.round(t.b / 5) * 5);
	},
	getRGB(e) {
		let t;
		return e in Se ? (t = Se[e], {
			r: t[0],
			g: t[1],
			b: t[2]
		}) : e[0] === j ? this._hexToRgb(e.substring(1)) : e.substr(0, 4) === xe ? (t = Ce.exec(e.replace(/ /g, "")), {
			r: parseInt(t[1], 10),
			g: parseInt(t[2], 10),
			b: parseInt(t[3], 10)
		}) : {
			r: 0,
			g: 0,
			b: 0
		};
	},
	colorToRGBA(e) {
		return e ||= "black", M._namedColorToRBA(e) || M._hex3ColorToRGBA(e) || M._hex4ColorToRGBA(e) || M._hex6ColorToRGBA(e) || M._hex8ColorToRGBA(e) || M._rgbColorToRGBA(e) || M._rgbaColorToRGBA(e) || M._hslColorToRGBA(e);
	},
	_namedColorToRBA(e) {
		let t = Se[e.toLowerCase()];
		return t ? {
			r: t[0],
			g: t[1],
			b: t[2],
			a: 1
		} : null;
	},
	_rgbColorToRGBA(e) {
		if (e.indexOf("rgb(") === 0) {
			e = e.match(/rgb\(([^)]+)\)/)[1];
			let t = e.split(/ *, */).map(Number);
			return {
				r: t[0],
				g: t[1],
				b: t[2],
				a: 1
			};
		}
	},
	_rgbaColorToRGBA(e) {
		if (e.indexOf("rgba(") === 0) {
			e = e.match(/rgba\(([^)]+)\)/)[1];
			let t = e.split(/ *, */).map((e, t) => e.slice(-1) === "%" ? t === 3 ? parseInt(e) / 100 : parseInt(e) / 100 * 255 : Number(e));
			return {
				r: t[0],
				g: t[1],
				b: t[2],
				a: t[3]
			};
		}
	},
	_hex8ColorToRGBA(e) {
		if (e[0] === "#" && e.length === 9) return {
			r: parseInt(e.slice(1, 3), 16),
			g: parseInt(e.slice(3, 5), 16),
			b: parseInt(e.slice(5, 7), 16),
			a: parseInt(e.slice(7, 9), 16) / 255
		};
	},
	_hex6ColorToRGBA(e) {
		if (e[0] === "#" && e.length === 7) return {
			r: parseInt(e.slice(1, 3), 16),
			g: parseInt(e.slice(3, 5), 16),
			b: parseInt(e.slice(5, 7), 16),
			a: 1
		};
	},
	_hex4ColorToRGBA(e) {
		if (e[0] === "#" && e.length === 5) return {
			r: parseInt(e[1] + e[1], 16),
			g: parseInt(e[2] + e[2], 16),
			b: parseInt(e[3] + e[3], 16),
			a: parseInt(e[4] + e[4], 16) / 255
		};
	},
	_hex3ColorToRGBA(e) {
		if (e[0] === "#" && e.length === 4) return {
			r: parseInt(e[1] + e[1], 16),
			g: parseInt(e[2] + e[2], 16),
			b: parseInt(e[3] + e[3], 16),
			a: 1
		};
	},
	_hslColorToRGBA(e) {
		if (/hsl\((\d+),\s*([\d.]+)%,\s*([\d.]+)%\)/g.test(e)) {
			let [t, ...n] = /hsl\((\d+),\s*([\d.]+)%,\s*([\d.]+)%\)/g.exec(e), r = Number(n[0]) / 360, i = Number(n[1]) / 100, a = Number(n[2]) / 100, o, s, c;
			if (i === 0) return c = a * 255, {
				r: Math.round(c),
				g: Math.round(c),
				b: Math.round(c),
				a: 1
			};
			o = a < .5 ? a * (1 + i) : a + i - a * i;
			let l = 2 * a - o, u = [
				0,
				0,
				0
			];
			for (let e = 0; e < 3; e++) s = r + 1 / 3 * -(e - 1), s < 0 && s++, s > 1 && s--, c = 6 * s < 1 ? l + (o - l) * 6 * s : 2 * s < 1 ? o : 3 * s < 2 ? l + (o - l) * (2 / 3 - s) * 6 : l, u[e] = c * 255;
			return {
				r: Math.round(u[0]),
				g: Math.round(u[1]),
				b: Math.round(u[2]),
				a: 1
			};
		}
	},
	haveIntersection(e, t) {
		return !(t.x > e.x + e.width || t.x + t.width < e.x || t.y > e.y + e.height || t.y + t.height < e.y);
	},
	cloneObject(e) {
		let t = {};
		for (let n in e) this._isPlainObject(e[n]) ? t[n] = this.cloneObject(e[n]) : this._isArray(e[n]) ? t[n] = this.cloneArray(e[n]) : t[n] = e[n];
		return t;
	},
	cloneArray(e) {
		return e.slice(0);
	},
	degToRad(e) {
		return e * he;
	},
	radToDeg(e) {
		return e * ge;
	},
	_degToRad(e) {
		return M.warn("Util._degToRad is removed. Please use public Util.degToRad instead."), M.degToRad(e);
	},
	_radToDeg(e) {
		return M.warn("Util._radToDeg is removed. Please use public Util.radToDeg instead."), M.radToDeg(e);
	},
	_getRotation(e) {
		return A.angleDeg ? M.radToDeg(e) : e;
	},
	_capitalize(e) {
		return e.charAt(0).toUpperCase() + e.slice(1);
	},
	throw(e) {
		throw Error(be + e);
	},
	error(e) {
		console.error(be + e);
	},
	warn(e) {
		A.showWarnings && console.warn(ye + e);
	},
	each(e, t) {
		for (let n in e) t(n, e[n]);
	},
	_inRange(e, t, n) {
		return t <= e && e < n;
	},
	_getProjectionToSegment(e, t, n, r, i, a) {
		let o, s, c, l = (e - n) * (e - n) + (t - r) * (t - r);
		if (l == 0) o = e, s = t, c = (i - n) * (i - n) + (a - r) * (a - r);
		else {
			let u = ((i - e) * (n - e) + (a - t) * (r - t)) / l;
			u < 0 ? (o = e, s = t, c = (e - i) * (e - i) + (t - a) * (t - a)) : u > 1 ? (o = n, s = r, c = (n - i) * (n - i) + (r - a) * (r - a)) : (o = e + u * (n - e), s = t + u * (r - t), c = (o - i) * (o - i) + (s - a) * (s - a));
		}
		return [
			o,
			s,
			c
		];
	},
	_getProjectionToLine(e, t, n) {
		let r = M.cloneObject(e), i = Number.MAX_VALUE;
		return t.forEach(function(a, o) {
			if (!n && o === t.length - 1) return;
			let s = t[(o + 1) % t.length], c = M._getProjectionToSegment(a.x, a.y, s.x, s.y, e.x, e.y), l = c[0], u = c[1], d = c[2];
			d < i && (r.x = l, r.y = u, i = d);
		}), r;
	},
	_prepareArrayForTween(e, t, n) {
		let r = [], i = [];
		if (e.length > t.length) {
			let n = t;
			t = e, e = n;
		}
		for (let t = 0; t < e.length; t += 2) r.push({
			x: e[t],
			y: e[t + 1]
		});
		for (let e = 0; e < t.length; e += 2) i.push({
			x: t[e],
			y: t[e + 1]
		});
		let a = [];
		return i.forEach(function(e) {
			let t = M._getProjectionToLine(e, r, n);
			a.push(t.x), a.push(t.y);
		}), a;
	},
	_prepareToStringify(e) {
		let t;
		e.visitedByCircularReferenceRemoval = !0;
		for (let n in e) if (e.hasOwnProperty(n) && e[n] && typeof e[n] == "object") {
			if (t = Object.getOwnPropertyDescriptor(e, n), e[n].visitedByCircularReferenceRemoval || M._isElement(e[n])) if (t.configurable) delete e[n];
			else return null;
			else if (M._prepareToStringify(e[n]) === null) if (t.configurable) delete e[n];
			else return null;
		}
		return delete e.visitedByCircularReferenceRemoval, e;
	},
	_assign(e, t) {
		for (let n in t) e[n] = t[n];
		return e;
	},
	_getFirstPointerId(e) {
		return e.touches ? e.changedTouches[0].identifier : e.pointerId || 999;
	},
	releaseCanvas(...e) {
		A.releaseCanvasOnDestroy && e.forEach((e) => {
			e.width = 0, e.height = 0;
		});
	},
	drawRoundedRectPath(e, t, n, r) {
		let i = t < 0 ? t : 0, a = n < 0 ? n : 0;
		t = Math.abs(t), n = Math.abs(n);
		let o = 0, s = 0, c = 0, l = 0;
		typeof r == "number" ? o = s = c = l = Math.min(r, t / 2, n / 2) : (o = Math.min(r[0] || 0, t / 2, n / 2), s = Math.min(r[1] || 0, t / 2, n / 2), l = Math.min(r[2] || 0, t / 2, n / 2), c = Math.min(r[3] || 0, t / 2, n / 2)), e.moveTo(i + o, a), e.lineTo(i + t - s, a), e.arc(i + t - s, a + s, s, Math.PI * 3 / 2, 0, !1), e.lineTo(i + t, a + n - l), e.arc(i + t - l, a + n - l, l, 0, Math.PI / 2, !1), e.lineTo(i + c, a + n), e.arc(i + c, a + n - c, c, Math.PI / 2, Math.PI, !1), e.lineTo(i, a + o), e.arc(i + o, a + o, o, Math.PI, Math.PI * 3 / 2, !1);
	},
	drawRoundedPolygonPath(e, t, n, r, i) {
		r = Math.abs(r);
		for (let a = 0; a < n; a++) {
			let o = t[(a - 1 + n) % n], s = t[a], c = t[(a + 1) % n], l = {
				x: s.x - o.x,
				y: s.y - o.y
			}, u = {
				x: c.x - s.x,
				y: c.y - s.y
			}, d = Math.hypot(l.x, l.y), f = Math.hypot(u.x, u.y), p;
			p = typeof i == "number" ? i : a < i.length ? i[a] : 0, p = r * Math.cos(Math.PI / n) * Math.min(1, p / r * 2);
			let m = {
				x: l.x / d,
				y: l.y / d
			}, h = {
				x: u.x / f,
				y: u.y / f
			}, g = {
				x: s.x - m.x * p,
				y: s.y - m.y * p
			}, _ = {
				x: s.x + h.x * p,
				y: s.y + h.y * p
			};
			a === 0 ? e.moveTo(g.x, g.y) : e.lineTo(g.x, g.y), e.arcTo(s.x, s.y, _.x, _.y, p);
		}
	}
};
//#endregion
//#region node_modules/konva/lib/Context.js
function De(e) {
	let t = [], n = e.length, r = M;
	for (let i = 0; i < n; i++) {
		let n = e[i];
		r._isNumber(n) ? n = Math.round(n * 1e3) / 1e3 : r._isString(n) || (n += ""), t.push(n);
	}
	return t;
}
var Oe = ",", ke = "(", Ae = ")", je = "([", Me = "])", Ne = ";", Pe = "()", Fe = "=", Ie = /* @__PURE__ */ "arc.arcTo.beginPath.bezierCurveTo.clearRect.clip.closePath.createLinearGradient.createPattern.createRadialGradient.drawImage.ellipse.fill.fillText.getImageData.createImageData.lineTo.moveTo.putImageData.quadraticCurveTo.rect.roundRect.restore.rotate.save.scale.setLineDash.setTransform.stroke.strokeText.transform.translate".split("."), Le = [
	"fillStyle",
	"strokeStyle",
	"shadowColor",
	"shadowBlur",
	"shadowOffsetX",
	"shadowOffsetY",
	"letterSpacing",
	"lineCap",
	"lineDashOffset",
	"lineJoin",
	"lineWidth",
	"miterLimit",
	"direction",
	"font",
	"textAlign",
	"textBaseline",
	"globalAlpha",
	"globalCompositeOperation",
	"imageSmoothingEnabled",
	"filter"
], Re = 100, ze = null;
function Be() {
	if (ze !== null) return ze;
	try {
		let e = M.createCanvasElement().getContext("2d");
		return e ? !!e && "filter" in e : (ze = !1, !1);
	} catch {
		return ze = !1, !1;
	}
}
var Ve = class {
	constructor(e) {
		this.canvas = e, A.enableTrace && (this.traceArr = [], this._enableTrace());
	}
	fillShape(e) {
		e.fillEnabled() && this._fill(e);
	}
	_fill(e) {}
	strokeShape(e) {
		e.hasStroke() && this._stroke(e);
	}
	_stroke(e) {}
	fillStrokeShape(e) {
		e.attrs.fillAfterStrokeEnabled ? (this.strokeShape(e), this.fillShape(e)) : (this.fillShape(e), this.strokeShape(e));
	}
	getTrace(e, t) {
		let n = this.traceArr, r = n.length, i = "", a, o, s, c;
		for (a = 0; a < r; a++) o = n[a], s = o.method, s ? (c = o.args, i += s, e ? i += Pe : M._isArray(c[0]) ? i += je + c.join(Oe) + Me : (t && (c = c.map((e) => typeof e == "number" ? Math.floor(e) : e)), i += ke + c.join(Oe) + Ae)) : (i += o.property, e || (i += Fe + o.val)), i += Ne;
		return i;
	}
	clearTrace() {
		this.traceArr = [];
	}
	_trace(e) {
		let t = this.traceArr, n;
		t.push(e), n = t.length, n >= Re && t.shift();
	}
	reset() {
		let e = this.getCanvas().getPixelRatio();
		this.setTransform(1 * e, 0, 0, 1 * e, 0, 0);
	}
	getCanvas() {
		return this.canvas;
	}
	clear(e) {
		let t = this.getCanvas();
		e ? this.clearRect(e.x || 0, e.y || 0, e.width || 0, e.height || 0) : this.clearRect(0, 0, t.getWidth() / t.pixelRatio, t.getHeight() / t.pixelRatio);
	}
	_applyLineCap(e) {
		let t = e.attrs.lineCap;
		t && this.setAttr("lineCap", t);
	}
	_applyOpacity(e) {
		let t = e.getAbsoluteOpacity();
		t !== 1 && this.setAttr("globalAlpha", t);
	}
	_applyLineJoin(e) {
		let t = e.attrs.lineJoin;
		t && this.setAttr("lineJoin", t);
	}
	_applyMiterLimit(e) {
		let t = e.attrs.miterLimit;
		t != null && this.setAttr("miterLimit", t);
	}
	setAttr(e, t) {
		this._context[e] = t;
	}
	arc(e, t, n, r, i, a) {
		this._context.arc(e, t, n, r, i, a);
	}
	arcTo(e, t, n, r, i) {
		this._context.arcTo(e, t, n, r, i);
	}
	beginPath() {
		this._context.beginPath();
	}
	bezierCurveTo(e, t, n, r, i, a) {
		this._context.bezierCurveTo(e, t, n, r, i, a);
	}
	clearRect(e, t, n, r) {
		this._context.clearRect(e, t, n, r);
	}
	clip(...e) {
		this._context.clip.apply(this._context, e);
	}
	closePath() {
		this._context.closePath();
	}
	createImageData(e, t) {
		let n = arguments;
		if (n.length === 2) return this._context.createImageData(e, t);
		if (n.length === 1) return this._context.createImageData(e);
	}
	createLinearGradient(e, t, n, r) {
		return this._context.createLinearGradient(e, t, n, r);
	}
	createPattern(e, t) {
		return this._context.createPattern(e, t);
	}
	createRadialGradient(e, t, n, r, i, a) {
		return this._context.createRadialGradient(e, t, n, r, i, a);
	}
	drawImage(e, t, n, r, i, a, o, s, c) {
		let l = arguments, u = this._context;
		l.length === 3 ? u.drawImage(e, t, n) : l.length === 5 ? u.drawImage(e, t, n, r, i) : l.length === 9 && u.drawImage(e, t, n, r, i, a, o, s, c);
	}
	ellipse(e, t, n, r, i, a, o, s) {
		this._context.ellipse(e, t, n, r, i, a, o, s);
	}
	isPointInPath(e, t, n, r) {
		return n ? this._context.isPointInPath(n, e, t, r) : this._context.isPointInPath(e, t, r);
	}
	fill(...e) {
		this._context.fill.apply(this._context, e);
	}
	fillRect(e, t, n, r) {
		this._context.fillRect(e, t, n, r);
	}
	strokeRect(e, t, n, r) {
		this._context.strokeRect(e, t, n, r);
	}
	fillText(e, t, n, r) {
		r ? this._context.fillText(e, t, n, r) : this._context.fillText(e, t, n);
	}
	measureText(e) {
		return this._context.measureText(e);
	}
	getImageData(e, t, n, r) {
		return this._context.getImageData(e, t, n, r);
	}
	lineTo(e, t) {
		this._context.lineTo(e, t);
	}
	moveTo(e, t) {
		this._context.moveTo(e, t);
	}
	rect(e, t, n, r) {
		this._context.rect(e, t, n, r);
	}
	roundRect(e, t, n, r, i) {
		this._context.roundRect(e, t, n, r, i);
	}
	putImageData(e, t, n) {
		this._context.putImageData(e, t, n);
	}
	quadraticCurveTo(e, t, n, r) {
		this._context.quadraticCurveTo(e, t, n, r);
	}
	restore() {
		this._context.restore();
	}
	rotate(e) {
		this._context.rotate(e);
	}
	save() {
		this._context.save();
	}
	scale(e, t) {
		this._context.scale(e, t);
	}
	setLineDash(e) {
		this._context.setLineDash ? this._context.setLineDash(e) : "mozDash" in this._context ? this._context.mozDash = e : "webkitLineDash" in this._context && (this._context.webkitLineDash = e);
	}
	getLineDash() {
		return this._context.getLineDash();
	}
	setTransform(e, t, n, r, i, a) {
		this._context.setTransform(e, t, n, r, i, a);
	}
	stroke(e) {
		e ? this._context.stroke(e) : this._context.stroke();
	}
	strokeText(e, t, n, r) {
		this._context.strokeText(e, t, n, r);
	}
	transform(e, t, n, r, i, a) {
		this._context.transform(e, t, n, r, i, a);
	}
	translate(e, t) {
		this._context.translate(e, t);
	}
	_enableTrace() {
		let e = this, t = Ie.length, n = this.setAttr, r, i, a = function(t) {
			let n = e[t], r;
			e[t] = function() {
				return i = De(Array.prototype.slice.call(arguments, 0)), r = n.apply(e, arguments), e._trace({
					method: t,
					args: i
				}), r;
			};
		};
		for (r = 0; r < t; r++) a(Ie[r]);
		e.setAttr = function() {
			n.apply(e, arguments);
			let t = arguments[0], r = arguments[1];
			(t === "shadowOffsetX" || t === "shadowOffsetY" || t === "shadowBlur") && (r /= this.canvas.getPixelRatio()), e._trace({
				property: t,
				val: r
			});
		};
	}
	_applyGlobalCompositeOperation(e) {
		let t = e.attrs.globalCompositeOperation;
		!t || t === "source-over" || this.setAttr("globalCompositeOperation", t);
	}
};
Le.forEach(function(e) {
	Object.defineProperty(Ve.prototype, e, {
		get() {
			return this._context[e];
		},
		set(t) {
			this._context[e] = t;
		}
	});
});
var He = class extends Ve {
	constructor(e, { willReadFrequently: t = !1 } = {}) {
		super(e), this._context = e._canvas.getContext("2d", { willReadFrequently: t });
	}
	_fillColor(e) {
		let t = e.fill();
		this.setAttr("fillStyle", t), e._fillFunc(this);
	}
	_fillPattern(e) {
		this.setAttr("fillStyle", e._getFillPattern()), e._fillFunc(this);
	}
	_fillLinearGradient(e) {
		let t = e._getLinearGradient();
		t && (this.setAttr("fillStyle", t), e._fillFunc(this));
	}
	_fillRadialGradient(e) {
		let t = e._getRadialGradient();
		t && (this.setAttr("fillStyle", t), e._fillFunc(this));
	}
	_fill(e) {
		let t = e.fill(), n = e.getFillPriority();
		if (t && n === "color") {
			this._fillColor(e);
			return;
		}
		let r = e.getFillPatternImage();
		if (r && n === "pattern") {
			this._fillPattern(e);
			return;
		}
		let i = e.getFillLinearGradientColorStops();
		if (i && n === "linear-gradient") {
			this._fillLinearGradient(e);
			return;
		}
		let a = e.getFillRadialGradientColorStops();
		if (a && n === "radial-gradient") {
			this._fillRadialGradient(e);
			return;
		}
		t ? this._fillColor(e) : r ? this._fillPattern(e) : i ? this._fillLinearGradient(e) : a && this._fillRadialGradient(e);
	}
	_strokeLinearGradient(e) {
		let t = e.getStrokeLinearGradientStartPoint(), n = e.getStrokeLinearGradientEndPoint(), r = e.getStrokeLinearGradientColorStops(), i = this.createLinearGradient(t.x, t.y, n.x, n.y);
		if (r) {
			for (let e = 0; e < r.length; e += 2) i.addColorStop(r[e], r[e + 1]);
			this.setAttr("strokeStyle", i);
		}
	}
	_stroke(e) {
		let t = e.dash(), n = e.getStrokeScaleEnabled();
		if (e.hasStroke()) {
			if (!n) {
				this.save();
				let e = this.getCanvas().getPixelRatio();
				this.setTransform(e, 0, 0, e, 0, 0);
			}
			this._applyLineCap(e), t && e.dashEnabled() && (this.setLineDash(t), this.setAttr("lineDashOffset", e.dashOffset())), this.setAttr("lineWidth", e.strokeWidth()), e.getShadowForStrokeEnabled() || this.setAttr("shadowColor", "rgba(0,0,0,0)"), e.getStrokeLinearGradientColorStops() ? this._strokeLinearGradient(e) : this.setAttr("strokeStyle", e.stroke()), e._strokeFunc(this), n || this.restore();
		}
	}
	_applyShadow(e) {
		let t = e.getShadowRGBA() ?? "black", n = e.getShadowBlur() ?? 5, r = e.getShadowOffset() ?? {
			x: 0,
			y: 0
		}, i = e.getAbsoluteScale(), a = this.canvas.getPixelRatio(), o = i.x * a, s = i.y * a;
		this.setAttr("shadowColor", t), this.setAttr("shadowBlur", n * Math.min(Math.abs(o), Math.abs(s))), this.setAttr("shadowOffsetX", r.x * o), this.setAttr("shadowOffsetY", r.y * s);
	}
}, Ue = class extends Ve {
	constructor(e) {
		super(e), this._context = e._canvas.getContext("2d", { willReadFrequently: !0 });
	}
	_fill(e) {
		this.save(), this.setAttr("fillStyle", e.colorKey), e._fillFuncHit(this), this.restore();
	}
	strokeShape(e) {
		e.hasHitStroke() && this._stroke(e);
	}
	_stroke(e) {
		if (e.hasHitStroke()) {
			let t = e.getStrokeScaleEnabled();
			if (!t) {
				this.save();
				let e = this.getCanvas().getPixelRatio();
				this.setTransform(e, 0, 0, e, 0, 0);
			}
			this._applyLineCap(e);
			let n = e.hitStrokeWidth(), r = n === "auto" ? e.strokeWidth() : n;
			this.setAttr("lineWidth", r), this.setAttr("strokeStyle", e.colorKey), e._strokeFuncHit(this), t || this.restore();
		}
	}
}, We;
function Ge() {
	if (We) return We;
	let e = M.createCanvasElement(), t = e.getContext("2d");
	return We = (function() {
		return (A._global.devicePixelRatio || 1) / (t.webkitBackingStorePixelRatio || t.mozBackingStorePixelRatio || t.msBackingStorePixelRatio || t.oBackingStorePixelRatio || t.backingStorePixelRatio || 1);
	})(), M.releaseCanvas(e), We;
}
var Ke = class {
	constructor(e) {
		this.pixelRatio = 1, this.width = 0, this.height = 0, this.isCache = !1;
		let t = (e || {}).pixelRatio || A.pixelRatio || Ge();
		this.pixelRatio = t, this._canvas = M.createCanvasElement(), this._canvas.style.padding = "0", this._canvas.style.margin = "0", this._canvas.style.border = "0", this._canvas.style.background = "transparent", this._canvas.style.position = "absolute", this._canvas.style.top = "0", this._canvas.style.left = "0";
	}
	getContext() {
		return this.context;
	}
	getPixelRatio() {
		return this.pixelRatio;
	}
	setPixelRatio(e) {
		let t = this.pixelRatio;
		this.pixelRatio = e, this.setSize(this.getWidth() / t, this.getHeight() / t);
	}
	setWidth(e) {
		this.width = this._canvas.width = e * this.pixelRatio, this._canvas.style.width = e + "px";
		let t = this.pixelRatio;
		this.getContext()._context.scale(t, t);
	}
	setHeight(e) {
		this.height = this._canvas.height = e * this.pixelRatio, this._canvas.style.height = e + "px";
		let t = this.pixelRatio;
		this.getContext()._context.scale(t, t);
	}
	getWidth() {
		return this.width;
	}
	getHeight() {
		return this.height;
	}
	setSize(e, t) {
		this.setWidth(e || 0), this.setHeight(t || 0);
	}
	toDataURL(e, t) {
		try {
			return this._canvas.toDataURL(e, t);
		} catch {
			try {
				return this._canvas.toDataURL();
			} catch (e) {
				return M.error("Unable to get data URL. " + e.message + " For more info read https://konvajs.org/docs/posts/Tainted_Canvas.html."), "";
			}
		}
	}
}, qe = class extends Ke {
	constructor(e = {
		width: 0,
		height: 0,
		willReadFrequently: !1
	}) {
		super(e), this.context = new He(this, { willReadFrequently: e.willReadFrequently }), this.setSize(e.width, e.height);
	}
}, Je = class extends Ke {
	constructor(e = {
		width: 0,
		height: 0
	}) {
		super(e), this.hitCanvas = !0, this.context = new Ue(this), this.setSize(e.width, e.height);
	}
}, Ye = {
	get isDragging() {
		let e = !1;
		return Ye._dragElements.forEach((t) => {
			t.dragStatus === "dragging" && (e = !0);
		}), e;
	},
	justDragged: !1,
	get node() {
		let e;
		return Ye._dragElements.forEach((t) => {
			e = t.node;
		}), e;
	},
	_dragElements: /* @__PURE__ */ new Map(),
	_drag(e) {
		let t = [];
		Ye._dragElements.forEach((n, r) => {
			let { node: i } = n, a = i.getStage();
			a.setPointersPositions(e), n.pointerId === void 0 && (n.pointerId = M._getFirstPointerId(e));
			let o = a._changedPointerPositions.find((e) => e.id === n.pointerId);
			if (o) {
				if (n.dragStatus !== "dragging") {
					let t = i.dragDistance();
					if (Math.max(Math.abs(o.x - n.startPointerPos.x), Math.abs(o.y - n.startPointerPos.y)) < t || (i.startDrag({ evt: e }), !i.isDragging())) return;
				}
				i._setDragPosition(e, n), t.push(i);
			}
		}), t.forEach((t) => {
			t.getStage() && t.fire("dragmove", {
				type: "dragmove",
				target: t,
				evt: e
			}, !0);
		});
	},
	_endDragBefore(e) {
		let t = [];
		Ye._dragElements.forEach((n) => {
			let { node: r } = n, i = r.getStage();
			if (e && i.setPointersPositions(e), !i._changedPointerPositions.find((e) => e.id === n.pointerId)) return;
			(n.dragStatus === "dragging" || n.dragStatus === "stopped") && (Ye.justDragged = !0, A._mouseListenClick = !1, A._touchListenClick = !1, A._pointerListenClick = !1, n.dragStatus = "stopped");
			let a = n.node.getLayer() || n.node instanceof A.Stage && n.node;
			a && t.indexOf(a) === -1 && t.push(a);
		}), t.forEach((e) => {
			e.draw();
		});
	},
	_endDragAfter(e) {
		Ye._dragElements.forEach((t, n) => {
			t.dragStatus === "stopped" && t.node.fire("dragend", {
				type: "dragend",
				target: t.node,
				evt: e
			}, !0), t.dragStatus !== "dragging" && Ye._dragElements.delete(n);
		});
	}
};
A.isBrowser && (window.addEventListener("mouseup", Ye._endDragBefore, !0), window.addEventListener("touchend", Ye._endDragBefore, !0), window.addEventListener("touchcancel", Ye._endDragBefore, !0), window.addEventListener("mousemove", Ye._drag), window.addEventListener("touchmove", Ye._drag), window.addEventListener("mouseup", Ye._endDragAfter, !1), window.addEventListener("touchend", Ye._endDragAfter, !1), window.addEventListener("touchcancel", Ye._endDragAfter, !1));
//#endregion
//#region node_modules/konva/lib/Validators.js
function Xe(e) {
	return M._isString(e) ? "\"" + e + "\"" : Object.prototype.toString.call(e) === "[object Number]" || M._isBoolean(e) ? e : Object.prototype.toString.call(e);
}
function Ze(e) {
	return e > 255 ? 255 : e < 0 ? 0 : Math.round(e);
}
function N() {
	if (A.isUnminified) return function(e, t) {
		return M._isNumber(e) || M.warn(Xe(e) + " is a not valid value for \"" + t + "\" attribute. The value should be a number."), e;
	};
}
function Qe(e) {
	if (A.isUnminified) return function(t, n) {
		let r = M._isNumber(t), i = M._isArray(t) && t.length == e;
		return !r && !i && M.warn(Xe(t) + " is a not valid value for \"" + n + "\" attribute. The value should be a number or Array<number>(" + e + ")"), t;
	};
}
function $e() {
	if (A.isUnminified) return function(e, t) {
		return M._isNumber(e) || e === "auto" || M.warn(Xe(e) + " is a not valid value for \"" + t + "\" attribute. The value should be a number or \"auto\"."), e;
	};
}
function et() {
	if (A.isUnminified) return function(e, t) {
		return M._isString(e) || M.warn(Xe(e) + " is a not valid value for \"" + t + "\" attribute. The value should be a string."), e;
	};
}
function tt() {
	if (A.isUnminified) return function(e, t) {
		let n = M._isString(e), r = Object.prototype.toString.call(e) === "[object CanvasGradient]" || e && e.addColorStop;
		return n || r || M.warn(Xe(e) + " is a not valid value for \"" + t + "\" attribute. The value should be a string or a native gradient."), e;
	};
}
function nt() {
	if (A.isUnminified) return function(e, t) {
		let n = Int8Array ? Object.getPrototypeOf(Int8Array) : null;
		return n && e instanceof n || (M._isArray(e) ? e.forEach(function(e) {
			M._isNumber(e) || M.warn("\"" + t + "\" attribute has non numeric element " + e + ". Make sure that all elements are numbers.");
		}) : M.warn(Xe(e) + " is a not valid value for \"" + t + "\" attribute. The value should be a array of numbers.")), e;
	};
}
function rt() {
	if (A.isUnminified) return function(e, t) {
		return e === !0 || e === !1 || M.warn(Xe(e) + " is a not valid value for \"" + t + "\" attribute. The value should be a boolean."), e;
	};
}
function it(e) {
	if (A.isUnminified) return function(t, n) {
		return t == null || M.isObject(t) || M.warn(Xe(t) + " is a not valid value for \"" + n + "\" attribute. The value should be an object with properties " + e), t;
	};
}
//#endregion
//#region node_modules/konva/lib/Factory.js
var at = "get", ot = "set", P = {
	addGetterSetter(e, t, n, r, i) {
		P.addGetter(e, t, n), P.addSetter(e, t, r, i), P.addOverloadedGetterSetter(e, t);
	},
	addGetter(e, t, n) {
		let r = at + M._capitalize(t);
		e.prototype[r] = e.prototype[r] || function() {
			let e = this.attrs[t];
			return e === void 0 ? n : e;
		};
	},
	addSetter(e, t, n, r) {
		let i = ot + M._capitalize(t);
		e.prototype[i] || P.overWriteSetter(e, t, n, r);
	},
	overWriteSetter(e, t, n, r) {
		let i = ot + M._capitalize(t);
		e.prototype[i] = function(e) {
			return n && e != null && (e = n.call(this, e, t)), this._setAttr(t, e), r && r.call(this), this;
		};
	},
	addComponentsGetterSetter(e, t, n, r, i) {
		let a = n.length, o = M._capitalize, s = at + o(t), c = ot + o(t);
		e.prototype[s] = function() {
			let e = {};
			for (let r = 0; r < a; r++) {
				let i = n[r];
				e[i] = this.getAttr(t + o(i));
			}
			return e;
		};
		let l = it(n);
		e.prototype[c] = function(e) {
			let a = this.attrs[t];
			r && (e = r.call(this, e, t)), l && l.call(this, e, t);
			for (let n in e) e.hasOwnProperty(n) && this._setAttr(t + o(n), e[n]);
			return e || n.forEach((e) => {
				this._setAttr(t + o(e), void 0);
			}), this._fireChangeEvent(t, a, e), i && i.call(this), this;
		}, P.addOverloadedGetterSetter(e, t);
	},
	addOverloadedGetterSetter(e, t) {
		let n = M._capitalize(t), r = ot + n, i = at + n;
		e.prototype[t] = function() {
			return arguments.length ? (this[r](arguments[0]), this) : this[i]();
		};
	},
	addDeprecatedGetterSetter(e, t, n, r) {
		M.error("Adding deprecated " + t);
		let i = at + M._capitalize(t), a = t + " property is deprecated and will be removed soon. Look at Konva change log for more information.";
		e.prototype[i] = function() {
			M.error(a);
			let e = this.attrs[t];
			return e === void 0 ? n : e;
		}, P.addSetter(e, t, r, function() {
			M.error(a);
		}), P.addOverloadedGetterSetter(e, t);
	},
	backCompat(e, t) {
		M.each(t, function(t, n) {
			let r = e.prototype[n], i = at + M._capitalize(t), a = ot + M._capitalize(t);
			function o() {
				r.apply(this, arguments), M.error("\"" + t + "\" method is deprecated and will be removed soon. Use \"\"" + n + "\" instead.");
			}
			e.prototype[t] = o, e.prototype[i] = o, e.prototype[a] = o;
		});
	},
	afterSetFilter() {
		this._filterUpToDate = !1;
	}
};
//#endregion
//#region node_modules/konva/lib/Node.js
function st(e) {
	let t = /(\w+)\(([^)]+)\)/g, n;
	for (; (n = t.exec(e)) !== null;) {
		let [, e, t] = n;
		switch (e) {
			case "blur": {
				let e = parseFloat(t.replace("px", ""));
				return function(t) {
					this.blurRadius(e * .5);
					let n = A.Filters;
					n && n.Blur && n.Blur.call(this, t);
				};
			}
			case "brightness": {
				let e = t.includes("%") ? parseFloat(t) / 100 : parseFloat(t);
				return function(t) {
					this.brightness(e);
					let n = A.Filters;
					n && n.Brightness && n.Brightness.call(this, t);
				};
			}
			case "contrast": {
				let e = parseFloat(t);
				return function(t) {
					let n = 100 * (Math.sqrt(e) - 1);
					this.contrast(n);
					let r = A.Filters;
					r && r.Contrast && r.Contrast.call(this, t);
				};
			}
			case "grayscale": return function(e) {
				let t = A.Filters;
				t && t.Grayscale && t.Grayscale.call(this, e);
			};
			case "sepia": return function(e) {
				let t = A.Filters;
				t && t.Sepia && t.Sepia.call(this, e);
			};
			case "invert": return function(e) {
				let t = A.Filters;
				t && t.Invert && t.Invert.call(this, e);
			};
			default:
				M.warn(`CSS filter "${e}" is not supported in fallback mode. Consider using function filters for better compatibility.`);
				break;
		}
	}
	return () => {};
}
var ct = "absoluteOpacity", lt = "allEventListeners", ut = "absoluteTransform", dt = "absoluteScale", ft = "canvas", pt = "Change", mt = "children", ht = "konva", gt = "listening", _t = "mouseenter", F = "mouseleave", vt = "pointerenter", yt = "pointerleave", bt = "touchenter", xt = "touchleave", St = "set", Ct = "Shape", wt = " ", Tt = "stage", Et = "transform", Dt = "Stage", Ot = "visible", kt = [
	"xChange.konva",
	"yChange.konva",
	"scaleXChange.konva",
	"scaleYChange.konva",
	"skewXChange.konva",
	"skewYChange.konva",
	"rotationChange.konva",
	"offsetXChange.konva",
	"offsetYChange.konva",
	"transformsEnabledChange.konva"
].join(wt), At = 1, I = class e {
	constructor(e) {
		this._id = At++, this.eventListeners = {}, this.attrs = {}, this.index = 0, this._allEventListeners = null, this.parent = null, this._cache = /* @__PURE__ */ new Map(), this._attachedDepsListeners = /* @__PURE__ */ new Map(), this._lastPos = null, this._batchingTransformChange = !1, this._needClearTransformCache = !1, this._filterUpToDate = !1, this._isUnderCache = !1, this._dragEventId = null, this._shouldFireChangeEvents = !1, this.setAttrs(e), this._shouldFireChangeEvents = !0;
	}
	hasChildren() {
		return !1;
	}
	_clearCache(e) {
		(e === Et || e === ut) && this._cache.get(e) ? this._cache.get(e).dirty = !0 : e ? this._cache.delete(e) : this._cache.clear();
	}
	_getCache(e, t) {
		let n = this._cache.get(e);
		return (n === void 0 || (e === Et || e === ut) && n.dirty === !0) && (n = t.call(this), this._cache.set(e, n)), n;
	}
	_calculate(e, t, n) {
		if (!this._attachedDepsListeners.get(e)) {
			let n = t.map((e) => e + "Change.konva").join(wt);
			this.on(n, () => {
				this._clearCache(e);
			}), this._attachedDepsListeners.set(e, !0);
		}
		return this._getCache(e, n);
	}
	_getCanvasCache() {
		return this._cache.get(ft);
	}
	_clearSelfAndDescendantCache(e) {
		this._clearCache(e), e === ut && this.fire("absoluteTransformChange");
	}
	clearCache() {
		if (this._cache.has(ft)) {
			let { scene: e, filter: t, hit: n } = this._cache.get(ft);
			M.releaseCanvas(e._canvas, t._canvas, n._canvas), this._cache.delete(ft);
		}
		return this._clearSelfAndDescendantCache(), this._requestDraw(), this;
	}
	cache(e) {
		let t = e || {}, n = {};
		(t.x === void 0 || t.y === void 0 || t.width === void 0 || t.height === void 0) && (n = this.getClientRect({
			skipTransform: !0,
			relativeTo: this.getParent() || void 0
		}));
		let r = Math.ceil(t.width || n.width), i = Math.ceil(t.height || n.height), a = t.pixelRatio, o = t.x === void 0 ? Math.floor(n.x) : t.x, s = t.y === void 0 ? Math.floor(n.y) : t.y, c = t.offset || 0, l = t.drawBorder || !1, u = t.hitCanvasPixelRatio || 1;
		if (!r || !i) {
			M.error("Can not cache the node. Width or height of the node equals 0. Caching is skipped.");
			return;
		}
		let d = +(Math.abs(Math.round(n.x) - o) > .5), f = +(Math.abs(Math.round(n.y) - s) > .5);
		r += c * 2 + d, i += c * 2 + f, o -= c, s -= c;
		let p = new qe({
			pixelRatio: a,
			width: r,
			height: i
		}), m = new qe({
			pixelRatio: a,
			width: 0,
			height: 0,
			willReadFrequently: !0
		}), h = new Je({
			pixelRatio: u,
			width: r,
			height: i
		}), g = p.getContext(), _ = h.getContext(), v = new qe({
			width: p.width / p.pixelRatio + Math.abs(o),
			height: p.height / p.pixelRatio + Math.abs(s),
			pixelRatio: p.pixelRatio
		}), y = v.getContext();
		return h.isCache = !0, p.isCache = !0, this._cache.delete(ft), this._filterUpToDate = !1, t.imageSmoothingEnabled === !1 && (p.getContext()._context.imageSmoothingEnabled = !1, m.getContext()._context.imageSmoothingEnabled = !1), g.save(), _.save(), y.save(), g.translate(-o, -s), _.translate(-o, -s), y.translate(-o, -s), v.x = o, v.y = s, this._isUnderCache = !0, this._clearSelfAndDescendantCache(ct), this._clearSelfAndDescendantCache(dt), this.drawScene(p, this, v), this.drawHit(h, this), this._isUnderCache = !1, g.restore(), _.restore(), l && (g.save(), g.beginPath(), g.rect(0, 0, r, i), g.closePath(), g.setAttr("strokeStyle", "red"), g.setAttr("lineWidth", 5), g.stroke(), g.restore()), M.releaseCanvas(v._canvas), this._cache.set(ft, {
			scene: p,
			filter: m,
			hit: h,
			x: o,
			y: s
		}), this._requestDraw(), this;
	}
	isCached() {
		return this._cache.has(ft);
	}
	getClientRect(e) {
		throw Error("abstract \"getClientRect\" method call");
	}
	_transformedRect(e, t) {
		let n = [
			{
				x: e.x,
				y: e.y
			},
			{
				x: e.x + e.width,
				y: e.y
			},
			{
				x: e.x + e.width,
				y: e.y + e.height
			},
			{
				x: e.x,
				y: e.y + e.height
			}
		], r = Infinity, i = Infinity, a = -Infinity, o = -Infinity, s = this.getAbsoluteTransform(t);
		return n.forEach(function(e) {
			let t = s.point(e);
			r === void 0 && (r = a = t.x, i = o = t.y), r = Math.min(r, t.x), i = Math.min(i, t.y), a = Math.max(a, t.x), o = Math.max(o, t.y);
		}), {
			x: r,
			y: i,
			width: a - r,
			height: o - i
		};
	}
	_drawCachedSceneCanvas(e) {
		e.save(), e._applyOpacity(this), e._applyGlobalCompositeOperation(this);
		let t = this._getCanvasCache();
		e.translate(t.x, t.y);
		let n = this._getCachedSceneCanvas(), r = n.pixelRatio;
		e.drawImage(n._canvas, 0, 0, n.width / r, n.height / r), e.restore();
	}
	_drawCachedHitCanvas(e) {
		let t = this._getCanvasCache(), n = t.hit;
		e.save(), e.translate(t.x, t.y), e.drawImage(n._canvas, 0, 0, n.width / n.pixelRatio, n.height / n.pixelRatio), e.restore();
	}
	_getCachedSceneCanvas() {
		let e = this.filters(), t = this._getCanvasCache(), n = t.scene, r = t.filter, i = r.getContext(), a, o, s, c;
		if (!e || e.length === 0) return n;
		if (this._filterUpToDate) return r;
		let l = !0;
		for (let t = 0; t < e.length; t++) if (typeof e[t] == "string" && Be(), typeof e[t] != "string" || !Be()) {
			l = !1;
			break;
		}
		let u = n.pixelRatio;
		if (r.setSize(n.width / n.pixelRatio, n.height / n.pixelRatio), l) {
			let t = e.join(" ");
			return i.save(), i.setAttr("filter", t), i.drawImage(n._canvas, 0, 0, n.getWidth() / u, n.getHeight() / u), i.restore(), this._filterUpToDate = !0, r;
		}
		try {
			for (a = e.length, i.clear(), i.drawImage(n._canvas, 0, 0, n.getWidth() / u, n.getHeight() / u), o = i.getImageData(0, 0, r.getWidth(), r.getHeight()), s = 0; s < a; s++) c = e[s], typeof c == "string" && (c = st(c)), c.call(this, o), i.putImageData(o, 0, 0);
		} catch (e) {
			M.error("Unable to apply filter. " + e.message + " This post my help you https://konvajs.org/docs/posts/Tainted_Canvas.html.");
		}
		return this._filterUpToDate = !0, r;
	}
	on(...e) {
		let t = e[0], n = e[1];
		if (e[2], this._cache && this._cache.delete(lt), e.length === 3) return this._delegate.apply(this, e);
		let r = t.split(wt);
		for (let e = 0; e < r.length; e++) {
			let t = r[e].split("."), i = t[0], a = t[1] || "";
			this.eventListeners[i] || (this.eventListeners[i] = []), this.eventListeners[i].push({
				name: a,
				handler: n
			});
		}
		return this;
	}
	off(e, t) {
		let n = (e || "").split(wt), r = n.length, i, a, o, s, c, l;
		if (this._cache && this._cache.delete(lt), !e) for (a in this.eventListeners) this._off(a);
		for (i = 0; i < r; i++) if (o = n[i], s = o.split("."), c = s[0], l = s[1], c) this.eventListeners[c] && this._off(c, l, t);
		else for (a in this.eventListeners) this._off(a, l, t);
		return this;
	}
	dispatchEvent(e) {
		let t = {
			target: this,
			type: e.type,
			evt: e
		};
		return this.fire(e.type, t), this;
	}
	addEventListener(e, t) {
		return this.on(e, function(e) {
			t.call(this, e.evt);
		}), this;
	}
	removeEventListener(e) {
		return this.off(e), this;
	}
	_delegate(e, t, n) {
		let r = this;
		return this.on(e, function(e) {
			let i = e.target.findAncestors(t, !0, r);
			for (let t = 0; t < i.length; t++) e = M.cloneObject(e), e.currentTarget = i[t], n.call(i[t], e);
		}), this;
	}
	remove() {
		return this.isDragging() && this.stopDrag(), Ye._dragElements.delete(this._id), Ye._dragElements.forEach((e, t) => {
			this.isAncestorOf(e.node) && Ye._dragElements.delete(t);
		}), this._remove(), this;
	}
	_clearCaches() {
		this._clearSelfAndDescendantCache(ut), this._clearSelfAndDescendantCache(ct), this._clearSelfAndDescendantCache(dt), this._clearSelfAndDescendantCache(Tt), this._clearSelfAndDescendantCache(Ot), this._clearSelfAndDescendantCache(gt);
	}
	_remove() {
		this._clearCaches();
		let e = this.getParent();
		e && e.children && (e.children.splice(this.index, 1), e._setChildrenIndices(), this.parent = null);
	}
	destroy() {
		return this.remove(), this.clearCache(), this;
	}
	getAttr(e) {
		let t = "get" + M._capitalize(e);
		return M._isFunction(this[t]) ? this[t]() : this.attrs[e];
	}
	getAncestors() {
		let e = this.getParent(), t = [];
		for (; e;) t.push(e), e = e.getParent();
		return t;
	}
	getAttrs() {
		return this.attrs || {};
	}
	setAttrs(e) {
		return this._batchTransformChanges(() => {
			let t, n;
			if (!e) return this;
			for (t in e) t !== mt && (n = St + M._capitalize(t), M._isFunction(this[n]) ? this[n](e[t]) : this._setAttr(t, e[t]));
		}), this;
	}
	isListening() {
		return this._getCache(gt, this._isListening);
	}
	_isListening(e) {
		if (!this.listening()) return !1;
		let t = this.getParent();
		return t && t !== e && this !== e ? t._isListening(e) : !0;
	}
	isVisible() {
		return this._getCache(Ot, this._isVisible);
	}
	_isVisible(e) {
		if (!this.visible()) return !1;
		let t = this.getParent();
		return t && t !== e && this !== e ? t._isVisible(e) : !0;
	}
	shouldDrawHit(e, t = !1) {
		if (e) return this._isVisible(e) && this._isListening(e);
		let n = this.getLayer(), r = !1;
		Ye._dragElements.forEach((e) => {
			e.dragStatus === "dragging" && (e.node.nodeType === "Stage" || e.node.getLayer() === n) && (r = !0);
		});
		let i = !t && !A.hitOnDragEnabled && (r || A.isTransforming());
		return this.isListening() && this.isVisible() && !i;
	}
	show() {
		return this.visible(!0), this;
	}
	hide() {
		return this.visible(!1), this;
	}
	getZIndex() {
		return this.index || 0;
	}
	getAbsoluteZIndex() {
		let e = this.getDepth(), t = this, n = 0, r, i, a, o;
		function s(c) {
			for (r = [], i = c.length, a = 0; a < i; a++) o = c[a], n++, o.nodeType !== Ct && (r = r.concat(o.getChildren().slice())), o._id === t._id && (a = i);
			r.length > 0 && r[0].getDepth() <= e && s(r);
		}
		let c = this.getStage();
		return t.nodeType !== Dt && c && s(c.getChildren()), n;
	}
	getDepth() {
		let e = 0, t = this.parent;
		for (; t;) e++, t = t.parent;
		return e;
	}
	_batchTransformChanges(e) {
		this._batchingTransformChange = !0, e(), this._batchingTransformChange = !1, this._needClearTransformCache && (this._clearCache(Et), this._clearSelfAndDescendantCache(ut)), this._needClearTransformCache = !1;
	}
	setPosition(e) {
		return this._batchTransformChanges(() => {
			this.x(e.x), this.y(e.y);
		}), this;
	}
	getPosition() {
		return {
			x: this.x(),
			y: this.y()
		};
	}
	getRelativePointerPosition() {
		let e = this.getStage();
		if (!e) return null;
		let t = e.getPointerPosition();
		if (!t) return null;
		let n = this.getAbsoluteTransform().copy();
		return n.invert(), n.point(t);
	}
	getAbsolutePosition(e) {
		let t = !1, n = this.parent;
		for (; n;) {
			if (n.isCached()) {
				t = !0;
				break;
			}
			n = n.parent;
		}
		t && !e && (e = !0);
		let r = this.getAbsoluteTransform(e).getMatrix(), i = new ue(), a = this.offset();
		return i.m = r.slice(), i.translate(a.x, a.y), i.getTranslation();
	}
	setAbsolutePosition(e) {
		let { x: t, y: n, ...r } = this._clearTransform();
		this.attrs.x = t, this.attrs.y = n, this._clearCache(Et);
		let i = this._getAbsoluteTransform().copy();
		return i.invert(), i.translate(e.x, e.y), e = {
			x: this.attrs.x + i.getTranslation().x,
			y: this.attrs.y + i.getTranslation().y
		}, this._setTransform(r), this.setPosition({
			x: e.x,
			y: e.y
		}), this._clearCache(Et), this._clearSelfAndDescendantCache(ut), this;
	}
	_setTransform(e) {
		let t;
		for (t in e) this.attrs[t] = e[t];
	}
	_clearTransform() {
		let e = {
			x: this.x(),
			y: this.y(),
			rotation: this.rotation(),
			scaleX: this.scaleX(),
			scaleY: this.scaleY(),
			offsetX: this.offsetX(),
			offsetY: this.offsetY(),
			skewX: this.skewX(),
			skewY: this.skewY()
		};
		return this.attrs.x = 0, this.attrs.y = 0, this.attrs.rotation = 0, this.attrs.scaleX = 1, this.attrs.scaleY = 1, this.attrs.offsetX = 0, this.attrs.offsetY = 0, this.attrs.skewX = 0, this.attrs.skewY = 0, e;
	}
	move(e) {
		let t = e.x, n = e.y, r = this.x(), i = this.y();
		return t !== void 0 && (r += t), n !== void 0 && (i += n), this.setPosition({
			x: r,
			y: i
		}), this;
	}
	_eachAncestorReverse(e, t) {
		let n = [], r = this.getParent(), i, a;
		if (!(t && t._id === this._id)) {
			for (n.unshift(this); r && (!t || r._id !== t._id);) n.unshift(r), r = r.parent;
			for (i = n.length, a = 0; a < i; a++) e(n[a]);
		}
	}
	rotate(e) {
		return this.rotation(this.rotation() + e), this;
	}
	moveToTop() {
		if (!this.parent) return M.warn("Node has no parent. moveToTop function is ignored."), !1;
		let e = this.index;
		return e < this.parent.getChildren().length - 1 ? (this.parent.children.splice(e, 1), this.parent.children.push(this), this.parent._setChildrenIndices(), !0) : !1;
	}
	moveUp() {
		if (!this.parent) return M.warn("Node has no parent. moveUp function is ignored."), !1;
		let e = this.index;
		return e < this.parent.getChildren().length - 1 ? (this.parent.children.splice(e, 1), this.parent.children.splice(e + 1, 0, this), this.parent._setChildrenIndices(), !0) : !1;
	}
	moveDown() {
		if (!this.parent) return M.warn("Node has no parent. moveDown function is ignored."), !1;
		let e = this.index;
		return e > 0 ? (this.parent.children.splice(e, 1), this.parent.children.splice(e - 1, 0, this), this.parent._setChildrenIndices(), !0) : !1;
	}
	moveToBottom() {
		if (!this.parent) return M.warn("Node has no parent. moveToBottom function is ignored."), !1;
		let e = this.index;
		return e > 0 ? (this.parent.children.splice(e, 1), this.parent.children.unshift(this), this.parent._setChildrenIndices(), !0) : !1;
	}
	setZIndex(e) {
		if (!this.parent) return M.warn("Node has no parent. zIndex parameter is ignored."), this;
		(e < 0 || e >= this.parent.children.length) && M.warn("Unexpected value " + e + " for zIndex property. zIndex is just index of a node in children of its parent. Expected value is from 0 to " + (this.parent.children.length - 1) + ".");
		let t = this.index;
		return this.parent.children.splice(t, 1), this.parent.children.splice(e, 0, this), this.parent._setChildrenIndices(), this;
	}
	getAbsoluteOpacity() {
		return this._getCache(ct, this._getAbsoluteOpacity);
	}
	_getAbsoluteOpacity() {
		let e = this.opacity(), t = this.getParent();
		return t && !t._isUnderCache && (e *= t.getAbsoluteOpacity()), e;
	}
	moveTo(e) {
		return this.getParent() !== e && (this._remove(), e.add(this)), this;
	}
	toObject() {
		let e = this.getAttrs(), t, n, r, i, a, o = {
			attrs: {},
			className: this.getClassName()
		};
		for (t in e) n = e[t], a = M.isObject(n) && !M._isPlainObject(n) && !M._isArray(n), !a && (r = typeof this[t] == "function" && this[t], delete e[t], i = r ? r.call(this) : null, e[t] = n, i !== n && (o.attrs[t] = n));
		return M._prepareToStringify(o);
	}
	toJSON() {
		return JSON.stringify(this.toObject());
	}
	getParent() {
		return this.parent;
	}
	findAncestors(e, t, n) {
		let r = [];
		t && this._isMatch(e) && r.push(this);
		let i = this.parent;
		for (; i;) {
			if (i === n) return r;
			i._isMatch(e) && r.push(i), i = i.parent;
		}
		return r;
	}
	isAncestorOf(e) {
		return !1;
	}
	findAncestor(e, t, n) {
		return this.findAncestors(e, t, n)[0];
	}
	_isMatch(e) {
		if (!e) return !1;
		if (typeof e == "function") return e(this);
		let t = e.replace(/ /g, "").split(","), n = t.length, r, i;
		for (r = 0; r < n; r++) if (i = t[r], M.isValidSelector(i) || (M.warn("Selector \"" + i + "\" is invalid. Allowed selectors examples are \"#foo\", \".bar\" or \"Group\"."), M.warn("If you have a custom shape with such className, please change it to start with upper letter like \"Triangle\"."), M.warn("Konva is awesome, right?")), i.charAt(0) === "#") {
			if (this.id() === i.slice(1)) return !0;
		} else if (i.charAt(0) === ".") {
			if (this.hasName(i.slice(1))) return !0;
		} else if (this.className === i || this.nodeType === i) return !0;
		return !1;
	}
	getLayer() {
		let e = this.getParent();
		return e ? e.getLayer() : null;
	}
	getStage() {
		return this._getCache(Tt, this._getStage);
	}
	_getStage() {
		let e = this.getParent();
		return e ? e.getStage() : null;
	}
	fire(e, t = {}, n) {
		return t.target = t.target || this, n ? this._fireAndBubble(e, t) : this._fire(e, t), this;
	}
	getAbsoluteTransform(e) {
		return e ? this._getAbsoluteTransform(e) : this._getCache(ut, this._getAbsoluteTransform);
	}
	_getAbsoluteTransform(e) {
		let t;
		if (e) return t = new ue(), this._eachAncestorReverse(function(e) {
			let n = e.transformsEnabled();
			n === "all" ? t.multiply(e.getTransform()) : n === "position" && t.translate(e.x() - e.offsetX(), e.y() - e.offsetY());
		}, e), t;
		{
			t = this._cache.get(ut) || new ue(), this.parent ? this.parent.getAbsoluteTransform().copyInto(t) : t.reset();
			let e = this.transformsEnabled();
			if (e === "all") t.multiply(this.getTransform());
			else if (e === "position") {
				let e = this.attrs.x || 0, n = this.attrs.y || 0, r = this.attrs.offsetX || 0, i = this.attrs.offsetY || 0;
				t.translate(e - r, n - i);
			}
			return t.dirty = !1, t;
		}
	}
	getAbsoluteScale(e) {
		let t = this;
		for (; t;) t._isUnderCache && (e = t), t = t.getParent();
		let n = this.getAbsoluteTransform(e).decompose();
		return {
			x: n.scaleX,
			y: n.scaleY
		};
	}
	getAbsoluteRotation() {
		return this.getAbsoluteTransform().decompose().rotation;
	}
	getTransform() {
		return this._getCache(Et, this._getTransform);
	}
	_getTransform() {
		let e = this._cache.get(Et) || new ue();
		e.reset();
		let t = this.x(), n = this.y(), r = A.getAngle(this.rotation()), i = this.attrs.scaleX ?? 1, a = this.attrs.scaleY ?? 1, o = this.attrs.skewX || 0, s = this.attrs.skewY || 0, c = this.attrs.offsetX || 0, l = this.attrs.offsetY || 0;
		return (t !== 0 || n !== 0) && e.translate(t, n), r !== 0 && e.rotate(r), (o !== 0 || s !== 0) && e.skew(o, s), (i !== 1 || a !== 1) && e.scale(i, a), (c !== 0 || l !== 0) && e.translate(-1 * c, -1 * l), e.dirty = !1, e;
	}
	clone(e) {
		let t = M.cloneObject(this.attrs), n, r, i, a, o;
		for (n in e) t[n] = e[n];
		let s = new this.constructor(t);
		for (n in this.eventListeners) for (r = this.eventListeners[n], i = r.length, a = 0; a < i; a++) o = r[a], o.name.indexOf(ht) < 0 && (s.eventListeners[n] || (s.eventListeners[n] = []), s.eventListeners[n].push(o));
		return s;
	}
	_toKonvaCanvas(e) {
		e ||= {};
		let t = this.getClientRect(), n = this.getStage(), r = e.x === void 0 ? Math.floor(t.x) : e.x, i = e.y === void 0 ? Math.floor(t.y) : e.y, a = e.pixelRatio || 1, o = new qe({
			width: e.width || Math.ceil(t.width) || (n ? n.width() : 0),
			height: e.height || Math.ceil(t.height) || (n ? n.height() : 0),
			pixelRatio: a
		}), s = o.getContext(), c = new qe({
			width: o.width / o.pixelRatio + Math.abs(r),
			height: o.height / o.pixelRatio + Math.abs(i),
			pixelRatio: o.pixelRatio
		});
		return e.imageSmoothingEnabled === !1 && (s._context.imageSmoothingEnabled = !1), s.save(), (r || i) && s.translate(-1 * r, -1 * i), this.drawScene(o, void 0, c), s.restore(), o;
	}
	toCanvas(e) {
		return this._toKonvaCanvas(e)._canvas;
	}
	toDataURL(e) {
		e ||= {};
		let t = e.mimeType || null, n = e.quality || null, r = this._toKonvaCanvas(e).toDataURL(t, n);
		return e.callback && e.callback(r), r;
	}
	toImage(e) {
		return new Promise((t, n) => {
			try {
				let n = e?.callback;
				n && delete e.callback, M._urlToImage(this.toDataURL(e), function(e) {
					t(e), n?.(e);
				});
			} catch (e) {
				n(e);
			}
		});
	}
	toBlob(e) {
		return new Promise((t, n) => {
			try {
				let n = e?.callback;
				n && delete e.callback, this.toCanvas(e).toBlob((e) => {
					t(e), n?.(e);
				}, e?.mimeType, e?.quality);
			} catch (e) {
				n(e);
			}
		});
	}
	setSize(e) {
		return this.width(e.width), this.height(e.height), this;
	}
	getSize() {
		return {
			width: this.width(),
			height: this.height()
		};
	}
	getClassName() {
		return this.className || this.nodeType;
	}
	getType() {
		return this.nodeType;
	}
	getDragDistance() {
		return this.attrs.dragDistance === void 0 ? this.parent ? this.parent.getDragDistance() : A.dragDistance : this.attrs.dragDistance;
	}
	_off(e, t, n) {
		let r = this.eventListeners[e], i, a, o;
		for (i = 0; i < r.length; i++) if (a = r[i].name, o = r[i].handler, (a !== "konva" || t === "konva") && (!t || a === t) && (!n || n === o)) {
			if (r.splice(i, 1), r.length === 0) {
				delete this.eventListeners[e];
				break;
			}
			i--;
		}
	}
	_fireChangeEvent(e, t, n) {
		this._fire(e + pt, {
			oldVal: t,
			newVal: n
		});
	}
	addName(e) {
		if (!this.hasName(e)) {
			let t = this.name(), n = t ? t + " " + e : e;
			this.name(n);
		}
		return this;
	}
	hasName(e) {
		if (!e) return !1;
		let t = this.name();
		return t ? (t || "").split(/\s/g).indexOf(e) !== -1 : !1;
	}
	removeName(e) {
		let t = (this.name() || "").split(/\s/g), n = t.indexOf(e);
		return n !== -1 && (t.splice(n, 1), this.name(t.join(" "))), this;
	}
	setAttr(e, t) {
		let n = this[St + M._capitalize(e)];
		return M._isFunction(n) ? n.call(this, t) : this._setAttr(e, t), this;
	}
	_requestDraw() {
		A.autoDrawEnabled && (this.getLayer() || this.getStage())?.batchDraw();
	}
	_setAttr(e, t) {
		let n = this.attrs[e];
		n === t && !M.isObject(t) || (t == null ? delete this.attrs[e] : this.attrs[e] = t, this._shouldFireChangeEvents && this._fireChangeEvent(e, n, t), this._requestDraw());
	}
	_setComponentAttr(e, t, n) {
		let r;
		n !== void 0 && (r = this.attrs[e], r || (this.attrs[e] = this.getAttr(e)), this.attrs[e][t] = n, this._fireChangeEvent(e, r, n));
	}
	_fireAndBubble(e, t, n) {
		t && this.nodeType === Ct && (t.target = this);
		let r = [
			_t,
			F,
			vt,
			yt,
			bt,
			xt
		];
		if (!(r.indexOf(e) !== -1 && (n && (this === n || this.isAncestorOf && this.isAncestorOf(n)) || this.nodeType === "Stage" && !n))) {
			this._fire(e, t);
			let i = r.indexOf(e) !== -1 && n && n.isAncestorOf && n.isAncestorOf(this) && !n.isAncestorOf(this.parent);
			(t && !t.cancelBubble || !t) && this.parent && this.parent.isListening() && !i && (n && n.parent ? this._fireAndBubble.call(this.parent, e, t, n) : this._fireAndBubble.call(this.parent, e, t));
		}
	}
	_getProtoListeners(t) {
		let { nodeType: n } = this, r = e.protoListenerMap.get(n) || {}, i = r?.[t];
		if (i === void 0) {
			i = [];
			let a = Object.getPrototypeOf(this);
			for (; a;) {
				let e = a.eventListeners?.[t] ?? [];
				i.push(...e), a = Object.getPrototypeOf(a);
			}
			r[t] = i, e.protoListenerMap.set(n, r);
		}
		return i;
	}
	_fire(e, t) {
		t ||= {}, t.currentTarget = this, t.type = e;
		let n = this._getProtoListeners(e);
		if (n) {
			let e = n.slice();
			for (let n = 0; n < e.length; n++) e[n].handler.call(this, t);
		}
		let r = this.eventListeners[e];
		if (r) {
			let n = r.slice(), i = n.length;
			for (let e = 0; e < n.length; e++) n[e].handler.call(this, t);
			let a = this.eventListeners[e];
			if (a) for (let e = i; e < a.length; e++) a[e].handler.call(this, t);
		}
	}
	draw() {
		return this.drawScene(), this.drawHit(), this;
	}
	_createDragElement(e) {
		let t = e ? e.pointerId : void 0, n = this.getStage(), r = this.getAbsolutePosition();
		if (!n) return;
		let i = n._getPointerById(t) || n._changedPointerPositions[0] || r;
		Ye._dragElements.set(this._id, {
			node: this,
			startPointerPos: i,
			offset: {
				x: i.x - r.x,
				y: i.y - r.y
			},
			dragStatus: "ready",
			pointerId: t,
			startEvent: e
		});
	}
	startDrag(e, t = !0) {
		Ye._dragElements.has(this._id) || this._createDragElement(e);
		let n = Ye._dragElements.get(this._id);
		n.dragStatus = "dragging", this.fire("dragstart", {
			type: "dragstart",
			target: this,
			evt: n.startEvent && n.startEvent.evt || e && e.evt
		}, t);
	}
	_setDragPosition(e, t) {
		let n = this.getStage()._getPointerById(t.pointerId);
		if (!n) return;
		let r = {
			x: n.x - t.offset.x,
			y: n.y - t.offset.y
		}, i = this.dragBoundFunc();
		if (i !== void 0) {
			let t = i.call(this, r, e);
			t ? r = t : M.warn("dragBoundFunc did not return any value. That is unexpected behavior. You must return new absolute position from dragBoundFunc.");
		}
		(!this._lastPos || this._lastPos.x !== r.x || this._lastPos.y !== r.y) && (this.setAbsolutePosition(r), this._requestDraw()), this._lastPos = r;
	}
	stopDrag(e) {
		let t = Ye._dragElements.get(this._id);
		t && (t.dragStatus = "stopped"), Ye._endDragBefore(e), Ye._endDragAfter(e);
	}
	setDraggable(e) {
		this._setAttr("draggable", e), this._dragChange();
	}
	isDragging() {
		let e = Ye._dragElements.get(this._id);
		return e ? e.dragStatus === "dragging" : !1;
	}
	_listenDrag() {
		this._dragCleanup(), this.on("mousedown.konva touchstart.konva", function(e) {
			if (!(e.evt.button === void 0 || A.dragButtons.indexOf(e.evt.button) >= 0) || this.isDragging()) return;
			let t = !1;
			Ye._dragElements.forEach((e) => {
				this.isAncestorOf(e.node) && (t = !0);
			}), t || this._createDragElement(e);
		});
	}
	_dragChange() {
		if (this.attrs.draggable) this._listenDrag();
		else {
			if (this._dragCleanup(), !this.getStage()) return;
			let e = Ye._dragElements.get(this._id), t = e && e.dragStatus === "dragging", n = e && e.dragStatus === "ready";
			t ? this.stopDrag() : n && Ye._dragElements.delete(this._id);
		}
	}
	_dragCleanup() {
		this.off("mousedown.konva"), this.off("touchstart.konva");
	}
	isClientRectOnScreen(e = {
		x: 0,
		y: 0
	}) {
		let t = this.getStage();
		if (!t) return !1;
		let n = {
			x: -e.x,
			y: -e.y,
			width: t.width() + 2 * e.x,
			height: t.height() + 2 * e.y
		};
		return M.haveIntersection(n, this.getClientRect());
	}
	static create(e, t) {
		return M._isString(e) && (e = JSON.parse(e)), this._createNode(e, t);
	}
	static _createNode(t, n) {
		let r = e.prototype.getClassName.call(t), i = t.children, a, o, s;
		n && (t.attrs.container = n), A[r] || (M.warn("Can not find a node with class name \"" + r + "\". Fallback to \"Shape\"."), r = "Shape");
		let c = A[r];
		if (a = new c(t.attrs), i) for (o = i.length, s = 0; s < o; s++) a.add(e._createNode(i[s]));
		return a;
	}
};
I.protoListenerMap = /* @__PURE__ */ new Map(), I.prototype.nodeType = "Node", I.prototype._attrsAffectingSize = [], I.prototype.eventListeners = {}, I.prototype.on(kt, function() {
	if (this._batchingTransformChange) {
		this._needClearTransformCache = !0;
		return;
	}
	this._clearCache(Et), this._clearSelfAndDescendantCache(ut);
}), I.prototype.on("visibleChange.konva", function() {
	this._clearSelfAndDescendantCache(Ot);
}), I.prototype.on("listeningChange.konva", function() {
	this._clearSelfAndDescendantCache(gt);
}), I.prototype.on("opacityChange.konva", function() {
	this._clearSelfAndDescendantCache(ct);
});
var jt = P.addGetterSetter;
jt(I, "zIndex"), jt(I, "absolutePosition"), jt(I, "position"), jt(I, "x", 0, N()), jt(I, "y", 0, N()), jt(I, "globalCompositeOperation", "source-over", et()), jt(I, "opacity", 1, N()), jt(I, "name", "", et()), jt(I, "id", "", et()), jt(I, "rotation", 0, N()), P.addComponentsGetterSetter(I, "scale", ["x", "y"]), jt(I, "scaleX", 1, N()), jt(I, "scaleY", 1, N()), P.addComponentsGetterSetter(I, "skew", ["x", "y"]), jt(I, "skewX", 0, N()), jt(I, "skewY", 0, N()), P.addComponentsGetterSetter(I, "offset", ["x", "y"]), jt(I, "offsetX", 0, N()), jt(I, "offsetY", 0, N()), jt(I, "dragDistance", void 0, N()), jt(I, "width", 0, N()), jt(I, "height", 0, N()), jt(I, "listening", !0, rt()), jt(I, "preventDefault", !0, rt()), jt(I, "filters", void 0, function(e) {
	return this._filterUpToDate = !1, e;
}), jt(I, "visible", !0, rt()), jt(I, "transformsEnabled", "all", et()), jt(I, "size"), jt(I, "dragBoundFunc"), jt(I, "draggable", !1, rt()), P.backCompat(I, {
	rotateDeg: "rotate",
	setRotationDeg: "setRotation",
	getRotationDeg: "getRotation"
});
//#endregion
//#region node_modules/konva/lib/Container.js
var Mt = class extends I {
	constructor() {
		super(...arguments), this.children = [];
	}
	getChildren(e) {
		let t = this.children || [];
		return e ? t.filter(e) : t;
	}
	hasChildren() {
		return this.getChildren().length > 0;
	}
	removeChildren() {
		return this.getChildren().forEach((e) => {
			e.parent = null, e.index = 0, e.remove();
		}), this.children = [], this._requestDraw(), this;
	}
	destroyChildren() {
		return this.getChildren().forEach((e) => {
			e.parent = null, e.index = 0, e.destroy();
		}), this.children = [], this._requestDraw(), this;
	}
	add(...e) {
		if (e.length === 0) return this;
		if (e.length > 1) {
			for (let t = 0; t < e.length; t++) this.add(e[t]);
			return this;
		}
		let t = e[0];
		return t.getParent() ? (t.moveTo(this), this) : (this._validateAdd(t), t.index = this.getChildren().length, t.parent = this, t._clearCaches(), this.getChildren().push(t), this._fire("add", { child: t }), this._requestDraw(), this);
	}
	destroy() {
		return this.hasChildren() && this.destroyChildren(), super.destroy(), this;
	}
	find(e) {
		return this._generalFind(e, !1);
	}
	findOne(e) {
		let t = this._generalFind(e, !0);
		return t.length > 0 ? t[0] : void 0;
	}
	_generalFind(e, t) {
		let n = [];
		return this._descendants((r) => {
			let i = r._isMatch(e);
			return i && n.push(r), !!(i && t);
		}), n;
	}
	_descendants(e) {
		let t = !1, n = this.getChildren();
		for (let r of n) if (t = e(r), t || r.hasChildren() && (t = r._descendants(e), t)) return !0;
		return !1;
	}
	toObject() {
		let e = I.prototype.toObject.call(this);
		return e.children = [], this.getChildren().forEach((t) => {
			e.children.push(t.toObject());
		}), e;
	}
	isAncestorOf(e) {
		let t = e.getParent();
		for (; t;) {
			if (t._id === this._id) return !0;
			t = t.getParent();
		}
		return !1;
	}
	clone(e) {
		let t = I.prototype.clone.call(this, e);
		return this.getChildren().forEach(function(e) {
			t.add(e.clone());
		}), t;
	}
	getAllIntersections(e) {
		let t = [];
		return this.find("Shape").forEach((n) => {
			n.isVisible() && n.intersects(e) && t.push(n);
		}), t;
	}
	_clearSelfAndDescendantCache(e) {
		var t;
		super._clearSelfAndDescendantCache(e), !this.isCached() && ((t = this.children) == null || t.forEach(function(t) {
			t._clearSelfAndDescendantCache(e);
		}));
	}
	_setChildrenIndices() {
		var e;
		(e = this.children) == null || e.forEach(function(e, t) {
			e.index = t;
		}), this._requestDraw();
	}
	drawScene(e, t, n) {
		let r = this.getLayer(), i = e || r && r.getCanvas(), a = i && i.getContext(), o = this._getCanvasCache(), s = o && o.scene, c = i && i.isCache;
		if (!this.isVisible() && !c) return this;
		if (s) {
			a.save();
			let e = this.getAbsoluteTransform(t).getMatrix();
			a.transform(e[0], e[1], e[2], e[3], e[4], e[5]), this._drawCachedSceneCanvas(a), a.restore();
		} else this._drawChildren("drawScene", i, t, n);
		return this;
	}
	drawHit(e, t) {
		if (!this.shouldDrawHit(t)) return this;
		let n = this.getLayer(), r = e || n && n.hitCanvas, i = r && r.getContext(), a = this._getCanvasCache();
		if (a && a.hit) {
			i.save();
			let e = this.getAbsoluteTransform(t).getMatrix();
			i.transform(e[0], e[1], e[2], e[3], e[4], e[5]), this._drawCachedHitCanvas(i), i.restore();
		} else this._drawChildren("drawHit", r, t);
		return this;
	}
	_drawChildren(e, t, n, r) {
		var i;
		let a = t && t.getContext(), o = this.clipWidth(), s = this.clipHeight(), c = this.clipFunc(), l = typeof o == "number" && typeof s == "number" || c, u = n === this;
		if (l) {
			a.save();
			let e = this.getAbsoluteTransform(n), t = e.getMatrix();
			a.transform(t[0], t[1], t[2], t[3], t[4], t[5]), a.beginPath();
			let r;
			if (c) r = c.call(this, a, this);
			else {
				let e = this.clipX(), t = this.clipY();
				a.rect(e || 0, t || 0, o, s);
			}
			a.clip.apply(a, r), t = e.copy().invert().getMatrix(), a.transform(t[0], t[1], t[2], t[3], t[4], t[5]);
		}
		let d = !u && this.globalCompositeOperation() !== "source-over" && e === "drawScene";
		d && (a.save(), a._applyGlobalCompositeOperation(this)), (i = this.children) == null || i.forEach(function(i) {
			i[e](t, n, r);
		}), d && a.restore(), l && a.restore();
	}
	getClientRect(e = {}) {
		var t;
		let n = e.skipTransform, r = e.relativeTo, i, a, o, s, c = {
			x: Infinity,
			y: Infinity,
			width: 0,
			height: 0
		}, l = this;
		(t = this.children) == null || t.forEach(function(t) {
			if (!t.visible()) return;
			let n = t.getClientRect({
				relativeTo: l,
				skipShadow: e.skipShadow,
				skipStroke: e.skipStroke
			});
			n.width === 0 && n.height === 0 || (i === void 0 ? (i = n.x, a = n.y, o = n.x + n.width, s = n.y + n.height) : (i = Math.min(i, n.x), a = Math.min(a, n.y), o = Math.max(o, n.x + n.width), s = Math.max(s, n.y + n.height)));
		});
		let u = this.find("Shape"), d = !1;
		for (let e = 0; e < u.length; e++) if (u[e]._isVisible(this)) {
			d = !0;
			break;
		}
		return c = d && i !== void 0 ? {
			x: i,
			y: a,
			width: o - i,
			height: s - a
		} : {
			x: 0,
			y: 0,
			width: 0,
			height: 0
		}, n ? c : this._transformedRect(c, r);
	}
};
P.addComponentsGetterSetter(Mt, "clip", [
	"x",
	"y",
	"width",
	"height"
]), P.addGetterSetter(Mt, "clipX", void 0, N()), P.addGetterSetter(Mt, "clipY", void 0, N()), P.addGetterSetter(Mt, "clipWidth", void 0, N()), P.addGetterSetter(Mt, "clipHeight", void 0, N()), P.addGetterSetter(Mt, "clipFunc");
//#endregion
//#region node_modules/konva/lib/PointerEvents.js
var Nt = /* @__PURE__ */ new Map(), Pt = A._global.PointerEvent !== void 0;
function Ft(e) {
	return Nt.get(e);
}
function It(e) {
	return {
		evt: e,
		pointerId: e.pointerId
	};
}
function Lt(e, t) {
	return Nt.get(e) === t;
}
function Rt(e, t) {
	zt(e), t.getStage() && (Nt.set(e, t), Pt && t._fire("gotpointercapture", It(new PointerEvent("gotpointercapture"))));
}
function zt(e, t) {
	let n = Nt.get(e);
	if (!n) return;
	let r = n.getStage();
	r && r.content, Nt.delete(e), Pt && n._fire("lostpointercapture", It(new PointerEvent("lostpointercapture")));
}
//#endregion
//#region node_modules/konva/lib/Stage.js
var Bt = "Stage", Vt = "string", Ht = "px", Ut = "mouseout", Wt = "mouseleave", Gt = "mouseover", Kt = "mouseenter", qt = "mousemove", Jt = "mousedown", Yt = "mouseup", Xt = "pointermove", Zt = "pointerdown", Qt = "pointerup", $t = "pointercancel", en = "lostpointercapture", tn = "pointerout", nn = "pointerleave", rn = "pointerover", an = "pointerenter", on = "contextmenu", sn = "touchstart", cn = "touchend", ln = "touchmove", un = "touchcancel", dn = "wheel", fn = 5, pn = [
	[Kt, "_pointerenter"],
	[Jt, "_pointerdown"],
	[qt, "_pointermove"],
	[Yt, "_pointerup"],
	[Wt, "_pointerleave"],
	[sn, "_pointerdown"],
	[ln, "_pointermove"],
	[cn, "_pointerup"],
	[un, "_pointercancel"],
	[Gt, "_pointerover"],
	[dn, "_wheel"],
	[on, "_contextmenu"],
	[Zt, "_pointerdown"],
	[Xt, "_pointermove"],
	[Qt, "_pointerup"],
	[$t, "_pointercancel"],
	[nn, "_pointerleave"],
	[en, "_lostpointercapture"]
], mn = {
	mouse: {
		[tn]: Ut,
		[nn]: Wt,
		[rn]: Gt,
		[an]: Kt,
		[Xt]: qt,
		[Zt]: Jt,
		[Qt]: Yt,
		[$t]: "mousecancel",
		pointerclick: "click",
		pointerdblclick: "dblclick"
	},
	touch: {
		[tn]: "touchout",
		[nn]: "touchleave",
		[rn]: "touchover",
		[an]: "touchenter",
		[Xt]: ln,
		[Zt]: sn,
		[Qt]: cn,
		[$t]: un,
		pointerclick: "tap",
		pointerdblclick: "dbltap"
	},
	pointer: {
		[tn]: tn,
		[nn]: nn,
		[rn]: rn,
		[an]: an,
		[Xt]: Xt,
		[Zt]: Zt,
		[Qt]: Qt,
		[$t]: $t,
		pointerclick: "pointerclick",
		pointerdblclick: "pointerdblclick"
	}
}, hn = (e) => e.indexOf("pointer") >= 0 ? "pointer" : e.indexOf("touch") >= 0 ? "touch" : "mouse", gn = (e) => {
	let t = hn(e);
	if (t === "pointer") return A.pointerEventsEnabled && mn.pointer;
	if (t === "touch") return mn.touch;
	if (t === "mouse") return mn.mouse;
};
function _n(e = {}) {
	return (e.clipFunc || e.clipWidth || e.clipHeight) && M.warn("Stage does not support clipping. Please use clip for Layers or Groups."), e;
}
var vn = "Pointer position is missing and not registered by the stage. Looks like it is outside of the stage container. You can set it manually from event: stage.setPointersPositions(event);", yn = [], bn = class extends Mt {
	constructor(e) {
		super(_n(e)), this._pointerPositions = [], this._changedPointerPositions = [], this._buildDOM(), this._bindContentEvents(), yn.push(this), this.on("widthChange.konva heightChange.konva", this._resizeDOM), this.on("visibleChange.konva", this._checkVisibility), this.on("clipWidthChange.konva clipHeightChange.konva clipFuncChange.konva", () => {
			_n(this.attrs);
		}), this._checkVisibility();
	}
	_validateAdd(e) {
		let t = e.getType() === "Layer", n = e.getType() === "FastLayer";
		t || n || M.throw("You may only add layers to the stage.");
	}
	_checkVisibility() {
		if (!this.content) return;
		let e = this.visible() ? "" : "none";
		this.content.style.display = e;
	}
	setContainer(e) {
		if (typeof e === Vt) {
			let t;
			if (e.charAt(0) === ".") {
				let t = e.slice(1);
				e = document.getElementsByClassName(t)[0];
			} else t = e.charAt(0) === "#" ? e.slice(1) : e, e = document.getElementById(t);
			if (!e) throw "Can not find container in document with id " + t;
		}
		return this._setAttr("container", e), this.content && (this.content.parentElement && this.content.parentElement.removeChild(this.content), e.appendChild(this.content)), this;
	}
	shouldDrawHit() {
		return !0;
	}
	clear() {
		let e = this.children, t = e.length;
		for (let n = 0; n < t; n++) e[n].clear();
		return this;
	}
	clone(e) {
		return e ||= {}, e.container = typeof document < "u" && document.createElement("div"), Mt.prototype.clone.call(this, e);
	}
	destroy() {
		super.destroy();
		let e = this.content;
		e && M._isInDocument(e) && this.container().removeChild(e);
		let t = yn.indexOf(this);
		return t > -1 && yn.splice(t, 1), M.releaseCanvas(this.bufferCanvas._canvas, this.bufferHitCanvas._canvas), this;
	}
	getPointerPosition() {
		let e = this._pointerPositions[0] || this._changedPointerPositions[0];
		return e ? {
			x: e.x,
			y: e.y
		} : (M.warn(vn), null);
	}
	_getPointerById(e) {
		return this._pointerPositions.find((t) => t.id === e);
	}
	getPointersPositions() {
		return this._pointerPositions;
	}
	getStage() {
		return this;
	}
	getContent() {
		return this.content;
	}
	_toKonvaCanvas(e) {
		e = { ...e }, e.x = e.x || 0, e.y = e.y || 0, e.width = e.width || this.width(), e.height = e.height || this.height();
		let t = new qe({
			width: e.width,
			height: e.height,
			pixelRatio: e.pixelRatio || 1
		}), n = t.getContext()._context, r = this.children;
		return (e.x || e.y) && n.translate(-1 * e.x, -1 * e.y), r.forEach(function(t) {
			if (!t.isVisible()) return;
			let r = t._toKonvaCanvas(e);
			n.drawImage(r._canvas, e.x, e.y, r.getWidth() / r.getPixelRatio(), r.getHeight() / r.getPixelRatio());
		}), t;
	}
	getIntersection(e) {
		if (!e) return null;
		let t = this.children, n = t.length - 1;
		for (let r = n; r >= 0; r--) {
			let n = t[r].getIntersection(e);
			if (n) return n;
		}
		return null;
	}
	_resizeDOM() {
		let e = this.width(), t = this.height();
		this.content && (this.content.style.width = e + Ht, this.content.style.height = t + Ht), this.bufferCanvas.setSize(e, t), this.bufferHitCanvas.setSize(e, t), this.children.forEach((n) => {
			n.setSize({
				width: e,
				height: t
			}), n.draw();
		});
	}
	add(e, ...t) {
		if (arguments.length > 1) {
			for (let e = 0; e < arguments.length; e++) this.add(arguments[e]);
			return this;
		}
		super.add(e);
		let n = this.children.length;
		return n > fn && M.warn("The stage has " + n + " layers. Recommended maximum number of layers is 3-5. Adding more layers into the stage may drop the performance. Rethink your tree structure, you can use Konva.Group."), e.setSize({
			width: this.width(),
			height: this.height()
		}), e.draw(), A.isBrowser && this.content.appendChild(e.canvas._canvas), this;
	}
	getParent() {
		return null;
	}
	getLayer() {
		return null;
	}
	hasPointerCapture(e) {
		return Lt(e, this);
	}
	setPointerCapture(e) {
		Rt(e, this);
	}
	releaseCapture(e) {
		zt(e, this);
	}
	getLayers() {
		return this.children;
	}
	_bindContentEvents() {
		A.isBrowser && pn.forEach(([e, t]) => {
			this.content.addEventListener(e, (e) => {
				this[t](e);
			}, { passive: !1 });
		});
	}
	_pointerenter(e) {
		this.setPointersPositions(e);
		let t = gn(e.type);
		t && this._fire(t.pointerenter, {
			evt: e,
			target: this,
			currentTarget: this
		});
	}
	_pointerover(e) {
		this.setPointersPositions(e);
		let t = gn(e.type);
		t && this._fire(t.pointerover, {
			evt: e,
			target: this,
			currentTarget: this
		});
	}
	_getTargetShape(e) {
		let t = this[e + "targetShape"];
		return t && !t.getStage() && (t = null), t;
	}
	_pointerleave(e) {
		let t = gn(e.type), n = hn(e.type);
		if (!t) return;
		this.setPointersPositions(e);
		let r = this._getTargetShape(n), i = !(A.isDragging() || A.isTransforming()) || A.hitOnDragEnabled;
		r && i ? (r._fireAndBubble(t.pointerout, { evt: e }), r._fireAndBubble(t.pointerleave, { evt: e }), this._fire(t.pointerleave, {
			evt: e,
			target: this,
			currentTarget: this
		}), this[n + "targetShape"] = null) : i && (this._fire(t.pointerleave, {
			evt: e,
			target: this,
			currentTarget: this
		}), this._fire(t.pointerout, {
			evt: e,
			target: this,
			currentTarget: this
		})), this.pointerPos = null, this._pointerPositions = [];
	}
	_pointerdown(e) {
		let t = gn(e.type), n = hn(e.type);
		if (!t) return;
		this.setPointersPositions(e);
		let r = !1;
		this._changedPointerPositions.forEach((i) => {
			let a = this.getIntersection(i);
			if (Ye.justDragged = !1, A["_" + n + "ListenClick"] = !0, !a || !a.isListening()) {
				this[n + "ClickStartShape"] = void 0;
				return;
			}
			A.capturePointerEventsEnabled && a.setPointerCapture(i.id), this[n + "ClickStartShape"] = a, a._fireAndBubble(t.pointerdown, {
				evt: e,
				pointerId: i.id
			}), r = !0;
			let o = e.type.indexOf("touch") >= 0;
			a.preventDefault() && e.cancelable && o && e.preventDefault();
		}), r || this._fire(t.pointerdown, {
			evt: e,
			target: this,
			currentTarget: this,
			pointerId: this._pointerPositions[0].id
		});
	}
	_pointermove(e) {
		let t = gn(e.type), n = hn(e.type);
		if (!t) return;
		let r = e.type.indexOf("touch") >= 0 || e.pointerType === "touch";
		if (A.isDragging() && Ye.node.preventDefault() && e.cancelable && r && e.preventDefault(), this.setPointersPositions(e), !(!(A.isDragging() || A.isTransforming()) || A.hitOnDragEnabled)) return;
		let i = {}, a = !1, o = this._getTargetShape(n);
		this._changedPointerPositions.forEach((r) => {
			let s = Ft(r.id) || this.getIntersection(r), c = r.id, l = {
				evt: e,
				pointerId: c
			}, u = o !== s;
			if (u && o && (o._fireAndBubble(t.pointerout, { ...l }, s), o._fireAndBubble(t.pointerleave, { ...l }, s)), s) {
				if (i[s._id]) return;
				i[s._id] = !0;
			}
			s && s.isListening() ? (a = !0, u && (s._fireAndBubble(t.pointerover, { ...l }, o), s._fireAndBubble(t.pointerenter, { ...l }, o), this[n + "targetShape"] = s), s._fireAndBubble(t.pointermove, { ...l })) : o && (this._fire(t.pointerover, {
				evt: e,
				target: this,
				currentTarget: this,
				pointerId: c
			}), this[n + "targetShape"] = null);
		}), a || this._fire(t.pointermove, {
			evt: e,
			target: this,
			currentTarget: this,
			pointerId: this._changedPointerPositions[0].id
		});
	}
	_pointerup(e) {
		let t = gn(e.type), n = hn(e.type);
		if (!t) return;
		this.setPointersPositions(e);
		let r = this[n + "ClickStartShape"], i = this[n + "ClickEndShape"], a = {}, o = !1;
		this._changedPointerPositions.forEach((s) => {
			let c = Ft(s.id) || this.getIntersection(s);
			if (c) {
				if (c.releaseCapture(s.id), a[c._id]) return;
				a[c._id] = !0;
			}
			let l = s.id, u = {
				evt: e,
				pointerId: l
			}, d = !1;
			A["_" + n + "InDblClickWindow"] ? (d = !0, clearTimeout(this[n + "DblTimeout"])) : Ye.justDragged || (A["_" + n + "InDblClickWindow"] = !0, clearTimeout(this[n + "DblTimeout"])), this[n + "DblTimeout"] = setTimeout(function() {
				A["_" + n + "InDblClickWindow"] = !1;
			}, A.dblClickWindow), c && c.isListening() ? (o = !0, this[n + "ClickEndShape"] = c, c._fireAndBubble(t.pointerup, { ...u }), A["_" + n + "ListenClick"] && r && r === c && (c._fireAndBubble(t.pointerclick, { ...u }), d && i && i === c && c._fireAndBubble(t.pointerdblclick, { ...u }))) : (this[n + "ClickEndShape"] = null, o ||= (this._fire(t.pointerup, {
				evt: e,
				target: this,
				currentTarget: this,
				pointerId: this._changedPointerPositions[0].id
			}), !0), A["_" + n + "ListenClick"] && this._fire(t.pointerclick, {
				evt: e,
				target: this,
				currentTarget: this,
				pointerId: l
			}), d && this._fire(t.pointerdblclick, {
				evt: e,
				target: this,
				currentTarget: this,
				pointerId: l
			}));
		}), o || this._fire(t.pointerup, {
			evt: e,
			target: this,
			currentTarget: this,
			pointerId: this._changedPointerPositions[0].id
		}), A["_" + n + "ListenClick"] = !1, e.cancelable && n !== "touch" && n !== "pointer" && e.preventDefault();
	}
	_contextmenu(e) {
		this.setPointersPositions(e);
		let t = this.getIntersection(this.getPointerPosition());
		t && t.isListening() ? t._fireAndBubble(on, { evt: e }) : this._fire(on, {
			evt: e,
			target: this,
			currentTarget: this
		});
	}
	_wheel(e) {
		this.setPointersPositions(e);
		let t = this.getIntersection(this.getPointerPosition());
		t && t.isListening() ? t._fireAndBubble(dn, { evt: e }) : this._fire(dn, {
			evt: e,
			target: this,
			currentTarget: this
		});
	}
	_pointercancel(e) {
		this.setPointersPositions(e);
		let t = Ft(e.pointerId) || this.getIntersection(this.getPointerPosition());
		t && t._fireAndBubble(Qt, It(e)), zt(e.pointerId);
	}
	_lostpointercapture(e) {
		zt(e.pointerId);
	}
	setPointersPositions(e) {
		let t = this._getContentPosition(), n = null, r = null;
		e ||= window.event, e.touches === void 0 ? (n = (e.clientX - t.left) / t.scaleX, r = (e.clientY - t.top) / t.scaleY, this.pointerPos = {
			x: n,
			y: r
		}, this._pointerPositions = [{
			x: n,
			y: r,
			id: M._getFirstPointerId(e)
		}], this._changedPointerPositions = [{
			x: n,
			y: r,
			id: M._getFirstPointerId(e)
		}]) : (this._pointerPositions = [], this._changedPointerPositions = [], Array.prototype.forEach.call(e.touches, (e) => {
			this._pointerPositions.push({
				id: e.identifier,
				x: (e.clientX - t.left) / t.scaleX,
				y: (e.clientY - t.top) / t.scaleY
			});
		}), Array.prototype.forEach.call(e.changedTouches || e.touches, (e) => {
			this._changedPointerPositions.push({
				id: e.identifier,
				x: (e.clientX - t.left) / t.scaleX,
				y: (e.clientY - t.top) / t.scaleY
			});
		}));
	}
	_setPointerPosition(e) {
		M.warn("Method _setPointerPosition is deprecated. Use \"stage.setPointersPositions(event)\" instead."), this.setPointersPositions(e);
	}
	_getContentPosition() {
		if (!this.content || !this.content.getBoundingClientRect) return {
			top: 0,
			left: 0,
			scaleX: 1,
			scaleY: 1
		};
		let e = this.content.getBoundingClientRect();
		return {
			top: e.top,
			left: e.left,
			scaleX: e.width / this.content.clientWidth || 1,
			scaleY: e.height / this.content.clientHeight || 1
		};
	}
	_buildDOM() {
		if (this.bufferCanvas = new qe({
			width: this.width(),
			height: this.height()
		}), this.bufferHitCanvas = new Je({
			pixelRatio: 1,
			width: this.width(),
			height: this.height()
		}), !A.isBrowser) return;
		let e = this.container();
		if (!e) throw "Stage has no container. A container is required.";
		e.innerHTML = "", this.content = document.createElement("div"), this.content.style.position = "relative", this.content.style.userSelect = "none", this.content.className = "konvajs-content", this.content.setAttribute("role", "presentation"), e.appendChild(this.content), this._resizeDOM();
	}
	cache() {
		return M.warn("Cache function is not allowed for stage. You may use cache only for layers, groups and shapes."), this;
	}
	clearCache() {
		return this;
	}
	batchDraw() {
		return this.getChildren().forEach(function(e) {
			e.batchDraw();
		}), this;
	}
};
bn.prototype.nodeType = Bt, se(bn), P.addGetterSetter(bn, "container"), A.isBrowser && document.addEventListener("visibilitychange", () => {
	yn.forEach((e) => {
		e.batchDraw();
	});
});
//#endregion
//#region node_modules/konva/lib/Shape.js
var xn = "hasShadow", Sn = "shadowRGBA", Cn = "patternImage", wn = "linearGradient", Tn = "radialGradient", En;
function Dn() {
	return En || (En = M.createCanvasElement().getContext("2d"), En);
}
var On = {};
function kn(e) {
	let t = this.attrs.fillRule;
	t ? e.fill(t) : e.fill();
}
function An(e) {
	e.stroke();
}
function jn(e) {
	let t = this.attrs.fillRule;
	t ? e.fill(t) : e.fill();
}
function Mn(e) {
	e.stroke();
}
function Nn() {
	this._clearCache(xn);
}
function Pn() {
	this._clearCache(Sn);
}
function Fn() {
	this._clearCache(Cn);
}
function In() {
	this._clearCache(wn);
}
function Ln() {
	this._clearCache(Tn);
}
var L = class extends I {
	constructor(e) {
		super(e);
		let t, n = 0;
		for (; t = M.getHitColor(), !(t && !(t in On));) if (n++, n >= 1e4) {
			M.warn("Failed to find a unique color key for a shape. Konva may work incorrectly. Most likely your browser is using canvas farbling. Consider disabling it."), t = M.getRandomColor();
			break;
		}
		this.colorKey = t, On[t] = this;
	}
	getContext() {
		return M.warn("shape.getContext() method is deprecated. Please do not use it."), this.getLayer().getContext();
	}
	getCanvas() {
		return M.warn("shape.getCanvas() method is deprecated. Please do not use it."), this.getLayer().getCanvas();
	}
	getSceneFunc() {
		return this.attrs.sceneFunc || this._sceneFunc;
	}
	getHitFunc() {
		return this.attrs.hitFunc || this._hitFunc;
	}
	hasShadow() {
		return this._getCache(xn, this._hasShadow);
	}
	_hasShadow() {
		return this.shadowEnabled() && this.shadowOpacity() !== 0 && !!(this.shadowColor() || this.shadowBlur() || this.shadowOffsetX() || this.shadowOffsetY());
	}
	_getFillPattern() {
		return this._getCache(Cn, this.__getFillPattern);
	}
	__getFillPattern() {
		if (this.fillPatternImage()) {
			let e = Dn().createPattern(this.fillPatternImage(), this.fillPatternRepeat() || "repeat");
			if (e && e.setTransform) {
				let t = new ue();
				t.translate(this.fillPatternX(), this.fillPatternY()), t.rotate(A.getAngle(this.fillPatternRotation())), t.scale(this.fillPatternScaleX(), this.fillPatternScaleY()), t.translate(-1 * this.fillPatternOffsetX(), -1 * this.fillPatternOffsetY());
				let n = t.getMatrix(), r = typeof DOMMatrix > "u" ? {
					a: n[0],
					b: n[1],
					c: n[2],
					d: n[3],
					e: n[4],
					f: n[5]
				} : new DOMMatrix(n);
				e.setTransform(r);
			}
			return e;
		}
	}
	_getLinearGradient() {
		return this._getCache(wn, this.__getLinearGradient);
	}
	__getLinearGradient() {
		let e = this.fillLinearGradientColorStops();
		if (e) {
			let t = Dn(), n = this.fillLinearGradientStartPoint(), r = this.fillLinearGradientEndPoint(), i = t.createLinearGradient(n.x, n.y, r.x, r.y);
			for (let t = 0; t < e.length; t += 2) i.addColorStop(e[t], e[t + 1]);
			return i;
		}
	}
	_getRadialGradient() {
		return this._getCache(Tn, this.__getRadialGradient);
	}
	__getRadialGradient() {
		let e = this.fillRadialGradientColorStops();
		if (e) {
			let t = Dn(), n = this.fillRadialGradientStartPoint(), r = this.fillRadialGradientEndPoint(), i = t.createRadialGradient(n.x, n.y, this.fillRadialGradientStartRadius(), r.x, r.y, this.fillRadialGradientEndRadius());
			for (let t = 0; t < e.length; t += 2) i.addColorStop(e[t], e[t + 1]);
			return i;
		}
	}
	getShadowRGBA() {
		return this._getCache(Sn, this._getShadowRGBA);
	}
	_getShadowRGBA() {
		if (!this.hasShadow()) return;
		let e = M.colorToRGBA(this.shadowColor());
		if (e) return "rgba(" + e.r + "," + e.g + "," + e.b + "," + e.a * (this.shadowOpacity() || 1) + ")";
	}
	hasFill() {
		return this._calculate("hasFill", [
			"fillEnabled",
			"fill",
			"fillPatternImage",
			"fillLinearGradientColorStops",
			"fillRadialGradientColorStops"
		], () => this.fillEnabled() && !!(this.fill() || this.fillPatternImage() || this.fillLinearGradientColorStops() || this.fillRadialGradientColorStops()));
	}
	hasStroke() {
		return this._calculate("hasStroke", [
			"strokeEnabled",
			"strokeWidth",
			"stroke",
			"strokeLinearGradientColorStops"
		], () => this.strokeEnabled() && this.strokeWidth() && !!(this.stroke() || this.strokeLinearGradientColorStops()));
	}
	hasHitStroke() {
		let e = this.hitStrokeWidth();
		return e === "auto" ? this.hasStroke() : this.strokeEnabled() && !!e;
	}
	intersects(e) {
		let t = this.getStage();
		if (!t) return !1;
		let n = t.bufferHitCanvas;
		return n.getContext().clear(), this.drawHit(n, void 0, !0), n.context.getImageData(Math.round(e.x), Math.round(e.y), 1, 1).data[3] > 0;
	}
	destroy() {
		return I.prototype.destroy.call(this), delete On[this.colorKey], delete this.colorKey, this;
	}
	_useBufferCanvas(e) {
		if (!(this.attrs.perfectDrawEnabled ?? !0)) return !1;
		let t = e || this.hasFill(), n = this.hasStroke(), r = this.getAbsoluteOpacity() !== 1;
		if (t && n && r) return !0;
		let i = this.hasShadow(), a = this.shadowForStrokeEnabled();
		return !!(t && n && i && a);
	}
	setStrokeHitEnabled(e) {
		M.warn("strokeHitEnabled property is deprecated. Please use hitStrokeWidth instead."), e ? this.hitStrokeWidth("auto") : this.hitStrokeWidth(0);
	}
	getStrokeHitEnabled() {
		return this.hitStrokeWidth() !== 0;
	}
	getSelfRect() {
		let e = this.size();
		return {
			x: this._centroid ? -e.width / 2 : 0,
			y: this._centroid ? -e.height / 2 : 0,
			width: e.width,
			height: e.height
		};
	}
	getClientRect(e = {}) {
		let t = !1, n = this.getParent();
		for (; n;) {
			if (n.isCached()) {
				t = !0;
				break;
			}
			n = n.getParent();
		}
		let r = e.skipTransform, i = e.relativeTo || t && this.getStage() || void 0, a = this.getSelfRect(), o = !e.skipStroke && this.hasStroke() && this.strokeWidth() || 0, s = a.width + o, c = a.height + o, l = !e.skipShadow && this.hasShadow(), u = l ? this.shadowOffsetX() : 0, d = l ? this.shadowOffsetY() : 0, f = s + Math.abs(u), p = c + Math.abs(d), m = l && this.shadowBlur() || 0, h = {
			width: f + m * 2,
			height: p + m * 2,
			x: -(o / 2 + m) + Math.min(u, 0) + a.x,
			y: -(o / 2 + m) + Math.min(d, 0) + a.y
		};
		return r ? h : this._transformedRect(h, i);
	}
	drawScene(e, t, n) {
		let r = this.getLayer(), i = (e || r.getCanvas()).getContext(), a = this._getCanvasCache(), o = this.getSceneFunc(), s = this.hasShadow(), c, l = t === this;
		if (!this.isVisible() && !l) return this;
		if (a) {
			i.save();
			let e = this.getAbsoluteTransform(t).getMatrix();
			return i.transform(e[0], e[1], e[2], e[3], e[4], e[5]), this._drawCachedSceneCanvas(i), i.restore(), this;
		}
		if (!o) return this;
		if (i.save(), this._useBufferCanvas()) {
			c = this.getStage();
			let e = n || c.bufferCanvas, r = e.getContext();
			n ? (r.save(), r.setTransform(1, 0, 0, 1, 0, 0), r.clearRect(0, 0, e.width, e.height), r.restore()) : r.clear(), r.save(), r._applyLineJoin(this), r._applyMiterLimit(this);
			let a = this.getAbsoluteTransform(t).getMatrix();
			r.transform(a[0], a[1], a[2], a[3], a[4], a[5]), o.call(this, r, this), r.restore();
			let u = e.pixelRatio;
			s && i._applyShadow(this), l || (i._applyOpacity(this), i._applyGlobalCompositeOperation(this)), i.drawImage(e._canvas, e.x || 0, e.y || 0, e.width / u, e.height / u);
		} else {
			if (i._applyLineJoin(this), i._applyMiterLimit(this), !l) {
				let e = this.getAbsoluteTransform(t).getMatrix();
				i.transform(e[0], e[1], e[2], e[3], e[4], e[5]), i._applyOpacity(this), i._applyGlobalCompositeOperation(this);
			}
			s && i._applyShadow(this), o.call(this, i, this);
		}
		return i.restore(), this;
	}
	drawHit(e, t, n = !1) {
		if (!this.shouldDrawHit(t, n)) return this;
		let r = this.getLayer(), i = e || r.hitCanvas, a = i && i.getContext(), o = this.hitFunc() || this.sceneFunc(), s = this._getCanvasCache(), c = s && s.hit;
		if (this.colorKey || M.warn("Looks like your canvas has a destroyed shape in it. Do not reuse shape after you destroyed it. If you want to reuse shape you should call remove() instead of destroy()"), c) {
			a.save();
			let e = this.getAbsoluteTransform(t).getMatrix();
			return a.transform(e[0], e[1], e[2], e[3], e[4], e[5]), this._drawCachedHitCanvas(a), a.restore(), this;
		}
		if (!o) return this;
		if (a.save(), a._applyLineJoin(this), a._applyMiterLimit(this), this !== t) {
			let e = this.getAbsoluteTransform(t).getMatrix();
			a.transform(e[0], e[1], e[2], e[3], e[4], e[5]);
		}
		return o.call(this, a, this), a.restore(), this;
	}
	drawHitFromCache(e = 0) {
		let t = this._getCanvasCache(), n = this._getCachedSceneCanvas(), r = t.hit, i = r.getContext(), a = r.getWidth(), o = r.getHeight();
		i.clear(), i.drawImage(n._canvas, 0, 0, a, o);
		try {
			let t = i.getImageData(0, 0, a, o), n = t.data, r = n.length, s = M._hexToRgb(this.colorKey);
			for (let t = 0; t < r; t += 4) n[t + 3] > e ? (n[t] = s.r, n[t + 1] = s.g, n[t + 2] = s.b, n[t + 3] = 255) : n[t + 3] = 0;
			i.putImageData(t, 0, 0);
		} catch (e) {
			M.error("Unable to draw hit graph from cached scene canvas. " + e.message);
		}
		return this;
	}
	hasPointerCapture(e) {
		return Lt(e, this);
	}
	setPointerCapture(e) {
		Rt(e, this);
	}
	releaseCapture(e) {
		zt(e, this);
	}
};
L.prototype._fillFunc = kn, L.prototype._strokeFunc = An, L.prototype._fillFuncHit = jn, L.prototype._strokeFuncHit = Mn, L.prototype._centroid = !1, L.prototype.nodeType = "Shape", se(L), L.prototype.eventListeners = {}, L.prototype.on("shadowColorChange.konva shadowBlurChange.konva shadowOffsetChange.konva shadowOpacityChange.konva shadowEnabledChange.konva", Nn), L.prototype.on("shadowColorChange.konva shadowOpacityChange.konva shadowEnabledChange.konva", Pn), L.prototype.on("fillPriorityChange.konva fillPatternImageChange.konva fillPatternRepeatChange.konva fillPatternScaleXChange.konva fillPatternScaleYChange.konva fillPatternOffsetXChange.konva fillPatternOffsetYChange.konva fillPatternXChange.konva fillPatternYChange.konva fillPatternRotationChange.konva", Fn), L.prototype.on("fillPriorityChange.konva fillLinearGradientColorStopsChange.konva fillLinearGradientStartPointXChange.konva fillLinearGradientStartPointYChange.konva fillLinearGradientEndPointXChange.konva fillLinearGradientEndPointYChange.konva", In), L.prototype.on("fillPriorityChange.konva fillRadialGradientColorStopsChange.konva fillRadialGradientStartPointXChange.konva fillRadialGradientStartPointYChange.konva fillRadialGradientEndPointXChange.konva fillRadialGradientEndPointYChange.konva fillRadialGradientStartRadiusChange.konva fillRadialGradientEndRadiusChange.konva", Ln), P.addGetterSetter(L, "stroke", void 0, tt()), P.addGetterSetter(L, "strokeWidth", 2, N()), P.addGetterSetter(L, "fillAfterStrokeEnabled", !1), P.addGetterSetter(L, "hitStrokeWidth", "auto", $e()), P.addGetterSetter(L, "strokeHitEnabled", !0, rt()), P.addGetterSetter(L, "perfectDrawEnabled", !0, rt()), P.addGetterSetter(L, "shadowForStrokeEnabled", !0, rt()), P.addGetterSetter(L, "lineJoin"), P.addGetterSetter(L, "lineCap"), P.addGetterSetter(L, "miterLimit"), P.addGetterSetter(L, "sceneFunc"), P.addGetterSetter(L, "hitFunc"), P.addGetterSetter(L, "dash"), P.addGetterSetter(L, "dashOffset", 0, N()), P.addGetterSetter(L, "shadowColor", void 0, et()), P.addGetterSetter(L, "shadowBlur", 0, N()), P.addGetterSetter(L, "shadowOpacity", 1, N()), P.addComponentsGetterSetter(L, "shadowOffset", ["x", "y"]), P.addGetterSetter(L, "shadowOffsetX", 0, N()), P.addGetterSetter(L, "shadowOffsetY", 0, N()), P.addGetterSetter(L, "fillPatternImage"), P.addGetterSetter(L, "fill", void 0, tt()), P.addGetterSetter(L, "fillPatternX", 0, N()), P.addGetterSetter(L, "fillPatternY", 0, N()), P.addGetterSetter(L, "fillLinearGradientColorStops"), P.addGetterSetter(L, "strokeLinearGradientColorStops"), P.addGetterSetter(L, "fillRadialGradientStartRadius", 0), P.addGetterSetter(L, "fillRadialGradientEndRadius", 0), P.addGetterSetter(L, "fillRadialGradientColorStops"), P.addGetterSetter(L, "fillPatternRepeat", "repeat"), P.addGetterSetter(L, "fillEnabled", !0), P.addGetterSetter(L, "strokeEnabled", !0), P.addGetterSetter(L, "shadowEnabled", !0), P.addGetterSetter(L, "dashEnabled", !0), P.addGetterSetter(L, "strokeScaleEnabled", !0), P.addGetterSetter(L, "fillPriority", "color"), P.addComponentsGetterSetter(L, "fillPatternOffset", ["x", "y"]), P.addGetterSetter(L, "fillPatternOffsetX", 0, N()), P.addGetterSetter(L, "fillPatternOffsetY", 0, N()), P.addComponentsGetterSetter(L, "fillPatternScale", ["x", "y"]), P.addGetterSetter(L, "fillPatternScaleX", 1, N()), P.addGetterSetter(L, "fillPatternScaleY", 1, N()), P.addComponentsGetterSetter(L, "fillLinearGradientStartPoint", ["x", "y"]), P.addComponentsGetterSetter(L, "strokeLinearGradientStartPoint", ["x", "y"]), P.addGetterSetter(L, "fillLinearGradientStartPointX", 0), P.addGetterSetter(L, "strokeLinearGradientStartPointX", 0), P.addGetterSetter(L, "fillLinearGradientStartPointY", 0), P.addGetterSetter(L, "strokeLinearGradientStartPointY", 0), P.addComponentsGetterSetter(L, "fillLinearGradientEndPoint", ["x", "y"]), P.addComponentsGetterSetter(L, "strokeLinearGradientEndPoint", ["x", "y"]), P.addGetterSetter(L, "fillLinearGradientEndPointX", 0), P.addGetterSetter(L, "strokeLinearGradientEndPointX", 0), P.addGetterSetter(L, "fillLinearGradientEndPointY", 0), P.addGetterSetter(L, "strokeLinearGradientEndPointY", 0), P.addComponentsGetterSetter(L, "fillRadialGradientStartPoint", ["x", "y"]), P.addGetterSetter(L, "fillRadialGradientStartPointX", 0), P.addGetterSetter(L, "fillRadialGradientStartPointY", 0), P.addComponentsGetterSetter(L, "fillRadialGradientEndPoint", ["x", "y"]), P.addGetterSetter(L, "fillRadialGradientEndPointX", 0), P.addGetterSetter(L, "fillRadialGradientEndPointY", 0), P.addGetterSetter(L, "fillPatternRotation", 0), P.addGetterSetter(L, "fillRule", void 0, et()), P.backCompat(L, {
	dashArray: "dash",
	getDashArray: "getDash",
	setDashArray: "getDash",
	drawFunc: "sceneFunc",
	getDrawFunc: "getSceneFunc",
	setDrawFunc: "setSceneFunc",
	drawHitFunc: "hitFunc",
	getDrawHitFunc: "getHitFunc",
	setDrawHitFunc: "setHitFunc"
});
//#endregion
//#region node_modules/konva/lib/Layer.js
var Rn = "beforeDraw", zn = "draw", Bn = [
	{
		x: 0,
		y: 0
	},
	{
		x: -1,
		y: -1
	},
	{
		x: 1,
		y: -1
	},
	{
		x: 1,
		y: 1
	},
	{
		x: -1,
		y: 1
	}
], Vn = Bn.length, Hn = class extends Mt {
	constructor(e) {
		super(e), this.canvas = new qe(), this.hitCanvas = new Je({ pixelRatio: 1 }), this._waitingForDraw = !1, this.on("visibleChange.konva", this._checkVisibility), this._checkVisibility(), this.on("imageSmoothingEnabledChange.konva", this._setSmoothEnabled), this._setSmoothEnabled();
	}
	createPNGStream() {
		return this.canvas._canvas.createPNGStream();
	}
	getCanvas() {
		return this.canvas;
	}
	getNativeCanvasElement() {
		return this.canvas._canvas;
	}
	getHitCanvas() {
		return this.hitCanvas;
	}
	getContext() {
		return this.getCanvas().getContext();
	}
	clear(e) {
		return this.getContext().clear(e), this.getHitCanvas().getContext().clear(e), this;
	}
	setZIndex(e) {
		super.setZIndex(e);
		let t = this.getStage();
		return t && t.content && (t.content.removeChild(this.getNativeCanvasElement()), e < t.children.length - 1 ? t.content.insertBefore(this.getNativeCanvasElement(), t.children[e + 1].getCanvas()._canvas) : t.content.appendChild(this.getNativeCanvasElement())), this;
	}
	moveToTop() {
		I.prototype.moveToTop.call(this);
		let e = this.getStage();
		return e && e.content && (e.content.removeChild(this.getNativeCanvasElement()), e.content.appendChild(this.getNativeCanvasElement())), !0;
	}
	moveUp() {
		if (!I.prototype.moveUp.call(this)) return !1;
		let e = this.getStage();
		return !e || !e.content ? !1 : (e.content.removeChild(this.getNativeCanvasElement()), this.index < e.children.length - 1 ? e.content.insertBefore(this.getNativeCanvasElement(), e.children[this.index + 1].getCanvas()._canvas) : e.content.appendChild(this.getNativeCanvasElement()), !0);
	}
	moveDown() {
		if (I.prototype.moveDown.call(this)) {
			let e = this.getStage();
			if (e) {
				let t = e.children;
				e.content && (e.content.removeChild(this.getNativeCanvasElement()), e.content.insertBefore(this.getNativeCanvasElement(), t[this.index + 1].getCanvas()._canvas));
			}
			return !0;
		}
		return !1;
	}
	moveToBottom() {
		if (I.prototype.moveToBottom.call(this)) {
			let e = this.getStage();
			if (e) {
				let t = e.children;
				e.content && (e.content.removeChild(this.getNativeCanvasElement()), e.content.insertBefore(this.getNativeCanvasElement(), t[1].getCanvas()._canvas));
			}
			return !0;
		}
		return !1;
	}
	getLayer() {
		return this;
	}
	remove() {
		let e = this.getNativeCanvasElement();
		return I.prototype.remove.call(this), e && e.parentNode && M._isInDocument(e) && e.parentNode.removeChild(e), this;
	}
	getStage() {
		return this.parent;
	}
	setSize({ width: e, height: t }) {
		return this.canvas.setSize(e, t), this.hitCanvas.setSize(e, t), this._setSmoothEnabled(), this;
	}
	_validateAdd(e) {
		let t = e.getType();
		t !== "Group" && t !== "Shape" && M.throw("You may only add groups and shapes to a layer.");
	}
	_toKonvaCanvas(e) {
		return e = { ...e }, e.width = e.width || this.getWidth(), e.height = e.height || this.getHeight(), e.x = e.x === void 0 ? this.x() : e.x, e.y = e.y === void 0 ? this.y() : e.y, I.prototype._toKonvaCanvas.call(this, e);
	}
	_checkVisibility() {
		this.visible() ? this.canvas._canvas.style.display = "block" : this.canvas._canvas.style.display = "none";
	}
	_setSmoothEnabled() {
		this.getContext()._context.imageSmoothingEnabled = this.imageSmoothingEnabled();
	}
	getWidth() {
		if (this.parent) return this.parent.width();
	}
	setWidth() {
		M.warn("Can not change width of layer. Use \"stage.width(value)\" function instead.");
	}
	getHeight() {
		if (this.parent) return this.parent.height();
	}
	setHeight() {
		M.warn("Can not change height of layer. Use \"stage.height(value)\" function instead.");
	}
	batchDraw() {
		return this._waitingForDraw || (this._waitingForDraw = !0, M.requestAnimFrame(() => {
			this.draw(), this._waitingForDraw = !1;
		})), this;
	}
	getIntersection(e) {
		if (!this.isListening() || !this.isVisible()) return null;
		let t = 1, n = !1;
		for (;;) {
			for (let r = 0; r < Vn; r++) {
				let i = Bn[r], a = this._getIntersection({
					x: e.x + i.x * t,
					y: e.y + i.y * t
				}), o = a.shape;
				if (o) return o;
				if (n = !!a.antialiased, !a.antialiased) break;
			}
			if (n) t += 1;
			else return null;
		}
	}
	_getIntersection(e) {
		let t = this.hitCanvas.pixelRatio, n = this.hitCanvas.context.getImageData(Math.round(e.x * t), Math.round(e.y * t), 1, 1).data, r = n[3];
		if (r === 255) {
			let e = On[M.getHitColorKey(n[0], n[1], n[2])];
			return e ? { shape: e } : { antialiased: !0 };
		} else if (r > 0) return { antialiased: !0 };
		return {};
	}
	drawScene(e, t, n) {
		let r = this.getLayer(), i = e || r && r.getCanvas();
		return this._fire(Rn, { node: this }), this.clearBeforeDraw() && i.getContext().clear(), Mt.prototype.drawScene.call(this, i, t, n), this._fire(zn, { node: this }), this;
	}
	drawHit(e, t) {
		let n = this.getLayer(), r = e || n && n.hitCanvas;
		return n && n.clearBeforeDraw() && n.getHitCanvas().getContext().clear(), Mt.prototype.drawHit.call(this, r, t), this;
	}
	enableHitGraph() {
		return this.hitGraphEnabled(!0), this;
	}
	disableHitGraph() {
		return this.hitGraphEnabled(!1), this;
	}
	setHitGraphEnabled(e) {
		M.warn("hitGraphEnabled method is deprecated. Please use layer.listening() instead."), this.listening(e);
	}
	getHitGraphEnabled(e) {
		return M.warn("hitGraphEnabled method is deprecated. Please use layer.listening() instead."), this.listening();
	}
	toggleHitCanvas() {
		if (!this.parent || !this.parent.content) return;
		let e = this.parent;
		this.hitCanvas._canvas.parentNode ? e.content.removeChild(this.hitCanvas._canvas) : e.content.appendChild(this.hitCanvas._canvas);
	}
	destroy() {
		return M.releaseCanvas(this.getNativeCanvasElement(), this.getHitCanvas()._canvas), super.destroy();
	}
};
Hn.prototype.nodeType = "Layer", se(Hn), P.addGetterSetter(Hn, "imageSmoothingEnabled", !0), P.addGetterSetter(Hn, "clearBeforeDraw", !0), P.addGetterSetter(Hn, "hitGraphEnabled", !0, rt());
//#endregion
//#region node_modules/konva/lib/FastLayer.js
var Un = class extends Hn {
	constructor(e) {
		super(e), this.listening(!1), M.warn("Konva.Fast layer is deprecated. Please use \"new Konva.Layer({ listening: false })\" instead.");
	}
};
Un.prototype.nodeType = "FastLayer", se(Un);
//#endregion
//#region node_modules/konva/lib/Group.js
var Wn = class extends Mt {
	_validateAdd(e) {
		let t = e.getType();
		t !== "Group" && t !== "Shape" && M.throw("You may only add groups and shapes to groups.");
	}
};
Wn.prototype.nodeType = "Group", se(Wn);
//#endregion
//#region node_modules/konva/lib/Animation.js
var Gn = (function() {
	return k.performance && k.performance.now ? function() {
		return k.performance.now();
	} : function() {
		return (/* @__PURE__ */ new Date()).getTime();
	};
})(), Kn = class e {
	constructor(t, n) {
		this.id = e.animIdCounter++, this.frame = {
			time: 0,
			timeDiff: 0,
			lastTime: Gn(),
			frameRate: 0
		}, this.func = t, this.setLayers(n);
	}
	setLayers(e) {
		let t = [];
		return e && (t = Array.isArray(e) ? e : [e]), this.layers = t, this;
	}
	getLayers() {
		return this.layers;
	}
	addLayer(e) {
		let t = this.layers, n = t.length;
		for (let r = 0; r < n; r++) if (t[r]._id === e._id) return !1;
		return this.layers.push(e), !0;
	}
	isRunning() {
		let t = e.animations, n = t.length;
		for (let e = 0; e < n; e++) if (t[e].id === this.id) return !0;
		return !1;
	}
	start() {
		return this.stop(), this.frame.timeDiff = 0, this.frame.lastTime = Gn(), e._addAnimation(this), this;
	}
	stop() {
		return e._removeAnimation(this), this;
	}
	_updateFrameObject(e) {
		this.frame.timeDiff = e - this.frame.lastTime, this.frame.lastTime = e, this.frame.time += this.frame.timeDiff, this.frame.frameRate = 1e3 / this.frame.timeDiff;
	}
	static _addAnimation(e) {
		this.animations.push(e), this._handleAnimation();
	}
	static _removeAnimation(e) {
		let t = e.id, n = this.animations, r = n.length;
		for (let e = 0; e < r; e++) if (n[e].id === t) {
			this.animations.splice(e, 1);
			break;
		}
	}
	static _runFrames() {
		let e = {}, t = this.animations;
		for (let n = 0; n < t.length; n++) {
			let r = t[n], i = r.layers, a = r.func;
			r._updateFrameObject(Gn());
			let o = i.length, s;
			if (s = a ? a.call(r, r.frame) !== !1 : !0, s) for (let t = 0; t < o; t++) {
				let n = i[t];
				n._id !== void 0 && (e[n._id] = n);
			}
		}
		for (let t in e) e.hasOwnProperty(t) && e[t].batchDraw();
	}
	static _animationLoop() {
		let t = e;
		t.animations.length ? (t._runFrames(), M.requestAnimFrame(t._animationLoop)) : t.animRunning = !1;
	}
	static _handleAnimation() {
		this.animRunning || (this.animRunning = !0, M.requestAnimFrame(this._animationLoop));
	}
};
Kn.animations = [], Kn.animIdCounter = 0, Kn.animRunning = !1;
//#endregion
//#region node_modules/konva/lib/Tween.js
var qn = {
	node: 1,
	duration: 1,
	easing: 1,
	onFinish: 1,
	yoyo: 1
}, Jn = 1, Yn = 2, Xn = 3, Zn = [
	"fill",
	"stroke",
	"shadowColor"
], Qn = 0, $n = class {
	constructor(e, t, n, r, i, a, o) {
		this.prop = e, this.propFunc = t, this.begin = r, this._pos = r, this.duration = a, this._change = 0, this.prevPos = 0, this.yoyo = o, this._time = 0, this._position = 0, this._startTime = 0, this._finish = 0, this.func = n, this._change = i - this.begin, this.pause();
	}
	fire(e) {
		let t = this[e];
		t && t();
	}
	setTime(e) {
		e > this.duration ? this.yoyo ? (this._time = this.duration, this.reverse()) : this.finish() : e < 0 ? this.yoyo ? (this._time = 0, this.play()) : this.reset() : (this._time = e, this.update());
	}
	getTime() {
		return this._time;
	}
	setPosition(e) {
		this.prevPos = this._pos, this.propFunc(e), this._pos = e;
	}
	getPosition(e) {
		return e === void 0 && (e = this._time), this.func(e, this.begin, this._change, this.duration);
	}
	play() {
		this.state = Yn, this._startTime = this.getTimer() - this._time, this.onEnterFrame(), this.fire("onPlay");
	}
	reverse() {
		this.state = Xn, this._time = this.duration - this._time, this._startTime = this.getTimer() - this._time, this.onEnterFrame(), this.fire("onReverse");
	}
	seek(e) {
		this.pause(), this._time = e, this.update(), this.fire("onSeek");
	}
	reset() {
		this.pause(), this._time = 0, this.update(), this.fire("onReset");
	}
	finish() {
		this.pause(), this._time = this.duration, this.update(), this.fire("onFinish");
	}
	update() {
		this.setPosition(this.getPosition(this._time)), this.fire("onUpdate");
	}
	onEnterFrame() {
		let e = this.getTimer() - this._startTime;
		this.state === Yn ? this.setTime(e) : this.state === Xn && this.setTime(this.duration - e);
	}
	pause() {
		this.state = Jn, this.fire("onPause");
	}
	getTimer() {
		return (/* @__PURE__ */ new Date()).getTime();
	}
}, er = class e {
	constructor(t) {
		let n = this, r = t.node, i = r._id, a = t.easing || tr.Linear, o = !!t.yoyo, s, c;
		s = t.duration === void 0 ? .3 : t.duration === 0 ? .001 : t.duration, this.node = r, this._id = Qn++;
		let l = r.getLayer() || (r instanceof A.Stage ? r.getLayers() : null);
		for (c in l || M.error("Tween constructor have `node` that is not in a layer. Please add node into layer first."), this.anim = new Kn(function() {
			n.tween.onEnterFrame();
		}, l), this.tween = new $n(c, function(e) {
			n._tweenFunc(e);
		}, a, 0, 1, s * 1e3, o), this._addListeners(), e.attrs[i] || (e.attrs[i] = {}), e.attrs[i][this._id] || (e.attrs[i][this._id] = {}), e.tweens[i] || (e.tweens[i] = {}), t) qn[c] === void 0 && this._addAttr(c, t[c]);
		this.reset(), this.onFinish = t.onFinish, this.onReset = t.onReset, this.onUpdate = t.onUpdate;
	}
	_addAttr(t, n) {
		let r = this.node, i = r._id, a, o, s, c, l, u = e.tweens[i][t];
		u && delete e.attrs[i][u][t];
		let d = r.getAttr(t);
		if (M._isArray(n)) if (a = [], o = Math.max(n.length, d.length), t === "points" && n.length !== d.length && (n.length > d.length ? (c = d, d = M._prepareArrayForTween(d, n, r.closed())) : (s = n, n = M._prepareArrayForTween(n, d, r.closed()))), t.indexOf("fill") === 0) for (let e = 0; e < o; e++) if (e % 2 == 0) a.push(n[e] - d[e]);
		else {
			let t = M.colorToRGBA(d[e]);
			l = M.colorToRGBA(n[e]), d[e] = t, a.push({
				r: l.r - t.r,
				g: l.g - t.g,
				b: l.b - t.b,
				a: l.a - t.a
			});
		}
		else for (let e = 0; e < o; e++) a.push(n[e] - d[e]);
		else Zn.indexOf(t) === -1 ? a = n - d : (d = M.colorToRGBA(d), l = M.colorToRGBA(n), a = {
			r: l.r - d.r,
			g: l.g - d.g,
			b: l.b - d.b,
			a: l.a - d.a
		});
		e.attrs[i][this._id][t] = {
			start: d,
			diff: a,
			end: n,
			trueEnd: s,
			trueStart: c
		}, e.tweens[i][t] = this._id;
	}
	_tweenFunc(t) {
		let n = this.node, r = e.attrs[n._id][this._id], i, a, o, s, c, l, u, d;
		for (i in r) {
			if (a = r[i], o = a.start, s = a.diff, d = a.end, M._isArray(o)) if (c = [], u = Math.max(o.length, d.length), i.indexOf("fill") === 0) for (l = 0; l < u; l++) l % 2 == 0 ? c.push((o[l] || 0) + s[l] * t) : c.push("rgba(" + Math.round(o[l].r + s[l].r * t) + "," + Math.round(o[l].g + s[l].g * t) + "," + Math.round(o[l].b + s[l].b * t) + "," + (o[l].a + s[l].a * t) + ")");
			else for (l = 0; l < u; l++) c.push((o[l] || 0) + s[l] * t);
			else c = Zn.indexOf(i) === -1 ? o + s * t : "rgba(" + Math.round(o.r + s.r * t) + "," + Math.round(o.g + s.g * t) + "," + Math.round(o.b + s.b * t) + "," + (o.a + s.a * t) + ")";
			n.setAttr(i, c);
		}
	}
	_addListeners() {
		this.tween.onPlay = () => {
			this.anim.start();
		}, this.tween.onReverse = () => {
			this.anim.start();
		}, this.tween.onPause = () => {
			this.anim.stop();
		}, this.tween.onFinish = () => {
			let t = this.node, n = e.attrs[t._id][this._id];
			n.points && n.points.trueEnd && t.setAttr("points", n.points.trueEnd), this.onFinish && this.onFinish.call(this);
		}, this.tween.onReset = () => {
			let t = this.node, n = e.attrs[t._id][this._id];
			n.points && n.points.trueStart && t.points(n.points.trueStart), this.onReset && this.onReset();
		}, this.tween.onUpdate = () => {
			this.onUpdate && this.onUpdate.call(this);
		};
	}
	play() {
		return this.tween.play(), this;
	}
	reverse() {
		return this.tween.reverse(), this;
	}
	reset() {
		return this.tween.reset(), this;
	}
	seek(e) {
		return this.tween.seek(e * 1e3), this;
	}
	pause() {
		return this.tween.pause(), this;
	}
	finish() {
		return this.tween.finish(), this;
	}
	destroy() {
		let t = this.node._id, n = this._id, r = e.tweens[t];
		this.pause(), this.anim && this.anim.stop();
		for (let n in r) delete e.tweens[t][n];
		delete e.attrs[t][n], e.tweens[t] && (Object.keys(e.tweens[t]).length === 0 && delete e.tweens[t], Object.keys(e.attrs[t]).length === 0 && delete e.attrs[t]);
	}
};
er.attrs = {}, er.tweens = {}, I.prototype.to = function(e) {
	let t = e.onFinish;
	e.node = this, e.onFinish = function() {
		this.destroy(), t && t();
	}, new er(e).play();
};
var tr = {
	BackEaseIn(e, t, n, r) {
		return n * (e /= r) * e * (2.70158 * e - 1.70158) + t;
	},
	BackEaseOut(e, t, n, r) {
		return n * ((e = e / r - 1) * e * (2.70158 * e + 1.70158) + 1) + t;
	},
	BackEaseInOut(e, t, n, r) {
		let i = 1.70158;
		return (e /= r / 2) < 1 ? n / 2 * (e * e * (((i *= 1.525) + 1) * e - i)) + t : n / 2 * ((e -= 2) * e * (((i *= 1.525) + 1) * e + i) + 2) + t;
	},
	ElasticEaseIn(e, t, n, r, i, a) {
		let o = 0;
		return e === 0 ? t : (e /= r) === 1 ? t + n : (a ||= r * .3, !i || i < Math.abs(n) ? (i = n, o = a / 4) : o = a / (2 * Math.PI) * Math.asin(n / i), -(i * 2 ** (10 * --e) * Math.sin((e * r - o) * (2 * Math.PI) / a)) + t);
	},
	ElasticEaseOut(e, t, n, r, i, a) {
		let o = 0;
		return e === 0 ? t : (e /= r) === 1 ? t + n : (a ||= r * .3, !i || i < Math.abs(n) ? (i = n, o = a / 4) : o = a / (2 * Math.PI) * Math.asin(n / i), i * 2 ** (-10 * e) * Math.sin((e * r - o) * (2 * Math.PI) / a) + n + t);
	},
	ElasticEaseInOut(e, t, n, r, i, a) {
		let o = 0;
		return e === 0 ? t : (e /= r / 2) == 2 ? t + n : (a ||= .3 * 1.5 * r, !i || i < Math.abs(n) ? (i = n, o = a / 4) : o = a / (2 * Math.PI) * Math.asin(n / i), e < 1 ? -.5 * (i * 2 ** (10 * --e) * Math.sin((e * r - o) * (2 * Math.PI) / a)) + t : i * 2 ** (-10 * --e) * Math.sin((e * r - o) * (2 * Math.PI) / a) * .5 + n + t);
	},
	BounceEaseOut(e, t, n, r) {
		return (e /= r) < 1 / 2.75 ? n * (7.5625 * e * e) + t : e < 2 / 2.75 ? n * (7.5625 * (e -= 1.5 / 2.75) * e + .75) + t : e < 2.5 / 2.75 ? n * (7.5625 * (e -= 2.25 / 2.75) * e + .9375) + t : n * (7.5625 * (e -= 2.625 / 2.75) * e + .984375) + t;
	},
	BounceEaseIn(e, t, n, r) {
		return n - tr.BounceEaseOut(r - e, 0, n, r) + t;
	},
	BounceEaseInOut(e, t, n, r) {
		return e < r / 2 ? tr.BounceEaseIn(e * 2, 0, n, r) * .5 + t : tr.BounceEaseOut(e * 2 - r, 0, n, r) * .5 + n * .5 + t;
	},
	EaseIn(e, t, n, r) {
		return n * (e /= r) * e + t;
	},
	EaseOut(e, t, n, r) {
		return -n * (e /= r) * (e - 2) + t;
	},
	EaseInOut(e, t, n, r) {
		return (e /= r / 2) < 1 ? n / 2 * e * e + t : -n / 2 * (--e * (e - 2) - 1) + t;
	},
	StrongEaseIn(e, t, n, r) {
		return n * (e /= r) * e * e * e * e + t;
	},
	StrongEaseOut(e, t, n, r) {
		return n * ((e = e / r - 1) * e * e * e * e + 1) + t;
	},
	StrongEaseInOut(e, t, n, r) {
		return (e /= r / 2) < 1 ? n / 2 * e * e * e * e * e + t : n / 2 * ((e -= 2) * e * e * e * e + 2) + t;
	},
	Linear(e, t, n, r) {
		return n * e / r + t;
	}
}, nr = M._assign(A, {
	Util: M,
	Transform: ue,
	Node: I,
	Container: Mt,
	Stage: bn,
	stages: yn,
	Layer: Hn,
	FastLayer: Un,
	Group: Wn,
	DD: Ye,
	Shape: L,
	shapes: On,
	Animation: Kn,
	Tween: er,
	Easings: tr,
	Context: Ve,
	Canvas: Ke
}), rr = class extends L {
	_sceneFunc(e) {
		let t = A.getAngle(this.angle()), n = this.clockwise();
		e.beginPath(), e.arc(0, 0, this.outerRadius(), 0, t, n), e.arc(0, 0, this.innerRadius(), t, 0, !n), e.closePath(), e.fillStrokeShape(this);
	}
	getWidth() {
		return this.outerRadius() * 2;
	}
	getHeight() {
		return this.outerRadius() * 2;
	}
	setWidth(e) {
		this.outerRadius(e / 2);
	}
	setHeight(e) {
		this.outerRadius(e / 2);
	}
	getSelfRect() {
		let e = this.innerRadius(), t = this.outerRadius(), n = this.clockwise(), r = A.getAngle(n ? 360 - this.angle() : this.angle()), i = Math.cos(Math.min(r, Math.PI)), a = Math.sin(Math.min(Math.max(Math.PI, r), 3 * Math.PI / 2)), o = Math.sin(Math.min(r, Math.PI / 2)), s = i * (i > 0 ? e : t), c = 1 * t, l = a * (a > 0 ? e : t), u = o * (o > 0 ? t : e);
		return {
			x: s,
			y: n ? -1 * u : l,
			width: c - s,
			height: u - l
		};
	}
};
rr.prototype._centroid = !0, rr.prototype.className = "Arc", rr.prototype._attrsAffectingSize = [
	"innerRadius",
	"outerRadius",
	"angle",
	"clockwise"
], se(rr), P.addGetterSetter(rr, "innerRadius", 0, N()), P.addGetterSetter(rr, "outerRadius", 0, N()), P.addGetterSetter(rr, "angle", 0, N()), P.addGetterSetter(rr, "clockwise", !1, rt());
//#endregion
//#region node_modules/konva/lib/shapes/Line.js
function ir(e, t, n, r, i, a, o) {
	let s = Math.sqrt((n - e) ** 2 + (r - t) ** 2), c = Math.sqrt((i - n) ** 2 + (a - r) ** 2), l = o * s / (s + c), u = o * c / (s + c);
	return [
		n - l * (i - e),
		r - l * (a - t),
		n + u * (i - e),
		r + u * (a - t)
	];
}
function ar(e, t) {
	let n = e.length, r = [];
	for (let i = 2; i < n - 2; i += 2) {
		let n = ir(e[i - 2], e[i - 1], e[i], e[i + 1], e[i + 2], e[i + 3], t);
		isNaN(n[0]) || (r.push(n[0]), r.push(n[1]), r.push(e[i]), r.push(e[i + 1]), r.push(n[2]), r.push(n[3]));
	}
	return r;
}
function or(e) {
	let t = [[
		e[0],
		e[2],
		e[4],
		e[6]
	], [
		e[1],
		e[3],
		e[5],
		e[7]
	]], n = [];
	for (let e of t) {
		let t = -3 * e[0] + 9 * e[1] - 9 * e[2] + 3 * e[3];
		if (t !== 0) {
			let r = 6 * e[0] - 12 * e[1] + 6 * e[2], i = -3 * e[0] + 3 * e[1], a = r * r - 4 * t * i;
			if (a >= 0) {
				let e = Math.sqrt(a);
				n.push((-r + e) / (2 * t)), n.push((-r - e) / (2 * t));
			}
		}
	}
	return n.filter((e) => e > 0 && e < 1).flatMap((e) => t.map((t) => {
		let n = 1 - e;
		return n * n * n * t[0] + 3 * n * n * e * t[1] + 3 * n * e * e * t[2] + e * e * e * t[3];
	}));
}
var sr = class extends L {
	constructor(e) {
		super(e), this.on("pointsChange.konva tensionChange.konva closedChange.konva bezierChange.konva", function() {
			this._clearCache("tensionPoints");
		});
	}
	_sceneFunc(e) {
		let t = this.points(), n = t.length, r = this.tension(), i = this.closed(), a = this.bezier();
		if (!n) return;
		let o = 0;
		if (e.beginPath(), e.moveTo(t[0], t[1]), r !== 0 && n > 4) {
			let r = this.getTensionPoints(), a = r.length;
			for (o = i ? 0 : 4, i || e.quadraticCurveTo(r[0], r[1], r[2], r[3]); o < a - 2;) e.bezierCurveTo(r[o++], r[o++], r[o++], r[o++], r[o++], r[o++]);
			i || e.quadraticCurveTo(r[a - 2], r[a - 1], t[n - 2], t[n - 1]);
		} else if (a) for (o = 2; o < n;) e.bezierCurveTo(t[o++], t[o++], t[o++], t[o++], t[o++], t[o++]);
		else for (o = 2; o < n; o += 2) e.lineTo(t[o], t[o + 1]);
		i ? (e.closePath(), e.fillStrokeShape(this)) : e.strokeShape(this);
	}
	getTensionPoints() {
		return this._getCache("tensionPoints", this._getTensionPoints);
	}
	_getTensionPoints() {
		return this.closed() ? this._getTensionPointsClosed() : ar(this.points(), this.tension());
	}
	_getTensionPointsClosed() {
		let e = this.points(), t = e.length, n = this.tension(), r = ir(e[t - 2], e[t - 1], e[0], e[1], e[2], e[3], n), i = ir(e[t - 4], e[t - 3], e[t - 2], e[t - 1], e[0], e[1], n), a = ar(e, n);
		return [r[2], r[3]].concat(a, [
			i[0],
			i[1],
			e[t - 2],
			e[t - 1],
			i[2],
			i[3],
			r[0],
			r[1],
			e[0],
			e[1]
		]);
	}
	getWidth() {
		return this.getSelfRect().width;
	}
	getHeight() {
		return this.getSelfRect().height;
	}
	getSelfRect() {
		let e = this.points();
		if (e.length < 4) return {
			x: e[0] || 0,
			y: e[1] || 0,
			width: 0,
			height: 0
		};
		e = this.tension() === 0 ? this.bezier() ? [
			e[0],
			e[1],
			...or(this.points()),
			e[e.length - 2],
			e[e.length - 1]
		] : this.points() : [
			e[0],
			e[1],
			...this._getTensionPoints(),
			e[e.length - 2],
			e[e.length - 1]
		];
		let t = e[0], n = e[0], r = e[1], i = e[1], a, o;
		for (let s = 0; s < e.length / 2; s++) a = e[s * 2], o = e[s * 2 + 1], t = Math.min(t, a), n = Math.max(n, a), r = Math.min(r, o), i = Math.max(i, o);
		return {
			x: t,
			y: r,
			width: n - t,
			height: i - r
		};
	}
};
sr.prototype.className = "Line", sr.prototype._attrsAffectingSize = [
	"points",
	"bezier",
	"tension"
], se(sr), P.addGetterSetter(sr, "closed", !1), P.addGetterSetter(sr, "bezier", !1), P.addGetterSetter(sr, "tension", 0, N()), P.addGetterSetter(sr, "points", [], nt());
//#endregion
//#region node_modules/konva/lib/BezierFunctions.js
var cr = [
	[],
	[],
	[-.5773502691896257, .5773502691896257],
	[
		0,
		-.7745966692414834,
		.7745966692414834
	],
	[
		-.33998104358485626,
		.33998104358485626,
		-.8611363115940526,
		.8611363115940526
	],
	[
		0,
		-.5384693101056831,
		.5384693101056831,
		-.906179845938664,
		.906179845938664
	],
	[
		.6612093864662645,
		-.6612093864662645,
		-.2386191860831969,
		.2386191860831969,
		-.932469514203152,
		.932469514203152
	],
	[
		0,
		.4058451513773972,
		-.4058451513773972,
		-.7415311855993945,
		.7415311855993945,
		-.9491079123427585,
		.9491079123427585
	],
	[
		-.1834346424956498,
		.1834346424956498,
		-.525532409916329,
		.525532409916329,
		-.7966664774136267,
		.7966664774136267,
		-.9602898564975363,
		.9602898564975363
	],
	[
		0,
		-.8360311073266358,
		.8360311073266358,
		-.9681602395076261,
		.9681602395076261,
		-.3242534234038089,
		.3242534234038089,
		-.6133714327005904,
		.6133714327005904
	],
	[
		-.14887433898163122,
		.14887433898163122,
		-.4333953941292472,
		.4333953941292472,
		-.6794095682990244,
		.6794095682990244,
		-.8650633666889845,
		.8650633666889845,
		-.9739065285171717,
		.9739065285171717
	],
	[
		0,
		-.26954315595234496,
		.26954315595234496,
		-.5190961292068118,
		.5190961292068118,
		-.7301520055740494,
		.7301520055740494,
		-.8870625997680953,
		.8870625997680953,
		-.978228658146057,
		.978228658146057
	],
	[
		-.1252334085114689,
		.1252334085114689,
		-.3678314989981802,
		.3678314989981802,
		-.5873179542866175,
		.5873179542866175,
		-.7699026741943047,
		.7699026741943047,
		-.9041172563704749,
		.9041172563704749,
		-.9815606342467192,
		.9815606342467192
	],
	[
		0,
		-.2304583159551348,
		.2304583159551348,
		-.44849275103644687,
		.44849275103644687,
		-.6423493394403402,
		.6423493394403402,
		-.8015780907333099,
		.8015780907333099,
		-.9175983992229779,
		.9175983992229779,
		-.9841830547185881,
		.9841830547185881
	],
	[
		-.10805494870734367,
		.10805494870734367,
		-.31911236892788974,
		.31911236892788974,
		-.5152486363581541,
		.5152486363581541,
		-.6872929048116855,
		.6872929048116855,
		-.827201315069765,
		.827201315069765,
		-.9284348836635735,
		.9284348836635735,
		-.9862838086968123,
		.9862838086968123
	],
	[
		0,
		-.20119409399743451,
		.20119409399743451,
		-.3941513470775634,
		.3941513470775634,
		-.5709721726085388,
		.5709721726085388,
		-.7244177313601701,
		.7244177313601701,
		-.8482065834104272,
		.8482065834104272,
		-.937273392400706,
		.937273392400706,
		-.9879925180204854,
		.9879925180204854
	],
	[
		-.09501250983763744,
		.09501250983763744,
		-.2816035507792589,
		.2816035507792589,
		-.45801677765722737,
		.45801677765722737,
		-.6178762444026438,
		.6178762444026438,
		-.755404408355003,
		.755404408355003,
		-.8656312023878318,
		.8656312023878318,
		-.9445750230732326,
		.9445750230732326,
		-.9894009349916499,
		.9894009349916499
	],
	[
		0,
		-.17848418149584785,
		.17848418149584785,
		-.3512317634538763,
		.3512317634538763,
		-.5126905370864769,
		.5126905370864769,
		-.6576711592166907,
		.6576711592166907,
		-.7815140038968014,
		.7815140038968014,
		-.8802391537269859,
		.8802391537269859,
		-.9506755217687678,
		.9506755217687678,
		-.9905754753144174,
		.9905754753144174
	],
	[
		-.0847750130417353,
		.0847750130417353,
		-.2518862256915055,
		.2518862256915055,
		-.41175116146284263,
		.41175116146284263,
		-.5597708310739475,
		.5597708310739475,
		-.6916870430603532,
		.6916870430603532,
		-.8037049589725231,
		.8037049589725231,
		-.8926024664975557,
		.8926024664975557,
		-.9558239495713977,
		.9558239495713977,
		-.9915651684209309,
		.9915651684209309
	],
	[
		0,
		-.16035864564022537,
		.16035864564022537,
		-.31656409996362983,
		.31656409996362983,
		-.46457074137596094,
		.46457074137596094,
		-.600545304661681,
		.600545304661681,
		-.7209661773352294,
		.7209661773352294,
		-.8227146565371428,
		.8227146565371428,
		-.9031559036148179,
		.9031559036148179,
		-.96020815213483,
		.96020815213483,
		-.9924068438435844,
		.9924068438435844
	],
	[
		-.07652652113349734,
		.07652652113349734,
		-.22778585114164507,
		.22778585114164507,
		-.37370608871541955,
		.37370608871541955,
		-.5108670019508271,
		.5108670019508271,
		-.636053680726515,
		.636053680726515,
		-.7463319064601508,
		.7463319064601508,
		-.8391169718222188,
		.8391169718222188,
		-.912234428251326,
		.912234428251326,
		-.9639719272779138,
		.9639719272779138,
		-.9931285991850949,
		.9931285991850949
	],
	[
		0,
		-.1455618541608951,
		.1455618541608951,
		-.2880213168024011,
		.2880213168024011,
		-.4243421202074388,
		.4243421202074388,
		-.5516188358872198,
		.5516188358872198,
		-.6671388041974123,
		.6671388041974123,
		-.7684399634756779,
		.7684399634756779,
		-.8533633645833173,
		.8533633645833173,
		-.9200993341504008,
		.9200993341504008,
		-.9672268385663063,
		.9672268385663063,
		-.9937521706203895,
		.9937521706203895
	],
	[
		-.06973927331972223,
		.06973927331972223,
		-.20786042668822127,
		.20786042668822127,
		-.34193582089208424,
		.34193582089208424,
		-.469355837986757,
		.469355837986757,
		-.5876404035069116,
		.5876404035069116,
		-.6944872631866827,
		.6944872631866827,
		-.7878168059792081,
		.7878168059792081,
		-.8658125777203002,
		.8658125777203002,
		-.926956772187174,
		.926956772187174,
		-.9700604978354287,
		.9700604978354287,
		-.9942945854823992,
		.9942945854823992
	],
	[
		0,
		-.1332568242984661,
		.1332568242984661,
		-.26413568097034495,
		.26413568097034495,
		-.3903010380302908,
		.3903010380302908,
		-.5095014778460075,
		.5095014778460075,
		-.6196098757636461,
		.6196098757636461,
		-.7186613631319502,
		.7186613631319502,
		-.8048884016188399,
		.8048884016188399,
		-.8767523582704416,
		.8767523582704416,
		-.9329710868260161,
		.9329710868260161,
		-.9725424712181152,
		.9725424712181152,
		-.9947693349975522,
		.9947693349975522
	],
	[
		-.06405689286260563,
		.06405689286260563,
		-.1911188674736163,
		.1911188674736163,
		-.3150426796961634,
		.3150426796961634,
		-.4337935076260451,
		.4337935076260451,
		-.5454214713888396,
		.5454214713888396,
		-.6480936519369755,
		.6480936519369755,
		-.7401241915785544,
		.7401241915785544,
		-.820001985973903,
		.820001985973903,
		-.8864155270044011,
		.8864155270044011,
		-.9382745520027328,
		.9382745520027328,
		-.9747285559713095,
		.9747285559713095,
		-.9951872199970213,
		.9951872199970213
	]
], lr = [
	[],
	[],
	[1, 1],
	[
		.8888888888888888,
		.5555555555555556,
		.5555555555555556
	],
	[
		.6521451548625461,
		.6521451548625461,
		.34785484513745385,
		.34785484513745385
	],
	[
		.5688888888888889,
		.47862867049936647,
		.47862867049936647,
		.23692688505618908,
		.23692688505618908
	],
	[
		.3607615730481386,
		.3607615730481386,
		.46791393457269104,
		.46791393457269104,
		.17132449237917036,
		.17132449237917036
	],
	[
		.4179591836734694,
		.3818300505051189,
		.3818300505051189,
		.27970539148927664,
		.27970539148927664,
		.1294849661688697,
		.1294849661688697
	],
	[
		.362683783378362,
		.362683783378362,
		.31370664587788727,
		.31370664587788727,
		.22238103445337448,
		.22238103445337448,
		.10122853629037626,
		.10122853629037626
	],
	[
		.3302393550012598,
		.1806481606948574,
		.1806481606948574,
		.08127438836157441,
		.08127438836157441,
		.31234707704000286,
		.31234707704000286,
		.26061069640293544,
		.26061069640293544
	],
	[
		.29552422471475287,
		.29552422471475287,
		.26926671930999635,
		.26926671930999635,
		.21908636251598204,
		.21908636251598204,
		.1494513491505806,
		.1494513491505806,
		.06667134430868814,
		.06667134430868814
	],
	[
		.2729250867779006,
		.26280454451024665,
		.26280454451024665,
		.23319376459199048,
		.23319376459199048,
		.18629021092773426,
		.18629021092773426,
		.1255803694649046,
		.1255803694649046,
		.05566856711617366,
		.05566856711617366
	],
	[
		.24914704581340277,
		.24914704581340277,
		.2334925365383548,
		.2334925365383548,
		.20316742672306592,
		.20316742672306592,
		.16007832854334622,
		.16007832854334622,
		.10693932599531843,
		.10693932599531843,
		.04717533638651183,
		.04717533638651183
	],
	[
		.2325515532308739,
		.22628318026289723,
		.22628318026289723,
		.2078160475368885,
		.2078160475368885,
		.17814598076194574,
		.17814598076194574,
		.13887351021978725,
		.13887351021978725,
		.09212149983772845,
		.09212149983772845,
		.04048400476531588,
		.04048400476531588
	],
	[
		.2152638534631578,
		.2152638534631578,
		.2051984637212956,
		.2051984637212956,
		.18553839747793782,
		.18553839747793782,
		.15720316715819355,
		.15720316715819355,
		.12151857068790319,
		.12151857068790319,
		.08015808715976021,
		.08015808715976021,
		.03511946033175186,
		.03511946033175186
	],
	[
		.2025782419255613,
		.19843148532711158,
		.19843148532711158,
		.1861610000155622,
		.1861610000155622,
		.16626920581699392,
		.16626920581699392,
		.13957067792615432,
		.13957067792615432,
		.10715922046717194,
		.10715922046717194,
		.07036604748810812,
		.07036604748810812,
		.03075324199611727,
		.03075324199611727
	],
	[
		.1894506104550685,
		.1894506104550685,
		.18260341504492358,
		.18260341504492358,
		.16915651939500254,
		.16915651939500254,
		.14959598881657674,
		.14959598881657674,
		.12462897125553388,
		.12462897125553388,
		.09515851168249279,
		.09515851168249279,
		.062253523938647894,
		.062253523938647894,
		.027152459411754096,
		.027152459411754096
	],
	[
		.17944647035620653,
		.17656270536699264,
		.17656270536699264,
		.16800410215645004,
		.16800410215645004,
		.15404576107681028,
		.15404576107681028,
		.13513636846852548,
		.13513636846852548,
		.11188384719340397,
		.11188384719340397,
		.08503614831717918,
		.08503614831717918,
		.0554595293739872,
		.0554595293739872,
		.02414830286854793,
		.02414830286854793
	],
	[
		.1691423829631436,
		.1691423829631436,
		.16427648374583273,
		.16427648374583273,
		.15468467512626524,
		.15468467512626524,
		.14064291467065065,
		.14064291467065065,
		.12255520671147846,
		.12255520671147846,
		.10094204410628717,
		.10094204410628717,
		.07642573025488905,
		.07642573025488905,
		.0497145488949698,
		.0497145488949698,
		.02161601352648331,
		.02161601352648331
	],
	[
		.1610544498487837,
		.15896884339395434,
		.15896884339395434,
		.15276604206585967,
		.15276604206585967,
		.1426067021736066,
		.1426067021736066,
		.12875396253933621,
		.12875396253933621,
		.11156664554733399,
		.11156664554733399,
		.09149002162245,
		.09149002162245,
		.06904454273764123,
		.06904454273764123,
		.0448142267656996,
		.0448142267656996,
		.019461788229726478,
		.019461788229726478
	],
	[
		.15275338713072584,
		.15275338713072584,
		.14917298647260374,
		.14917298647260374,
		.14209610931838204,
		.14209610931838204,
		.13168863844917664,
		.13168863844917664,
		.11819453196151841,
		.11819453196151841,
		.10193011981724044,
		.10193011981724044,
		.08327674157670475,
		.08327674157670475,
		.06267204833410907,
		.06267204833410907,
		.04060142980038694,
		.04060142980038694,
		.017614007139152118,
		.017614007139152118
	],
	[
		.14608113364969041,
		.14452440398997005,
		.14452440398997005,
		.13988739479107315,
		.13988739479107315,
		.13226893863333747,
		.13226893863333747,
		.12183141605372853,
		.12183141605372853,
		.10879729916714838,
		.10879729916714838,
		.09344442345603386,
		.09344442345603386,
		.0761001136283793,
		.0761001136283793,
		.057134425426857205,
		.057134425426857205,
		.036953789770852494,
		.036953789770852494,
		.016017228257774335,
		.016017228257774335
	],
	[
		.13925187285563198,
		.13925187285563198,
		.13654149834601517,
		.13654149834601517,
		.13117350478706238,
		.13117350478706238,
		.12325237681051242,
		.12325237681051242,
		.11293229608053922,
		.11293229608053922,
		.10041414444288096,
		.10041414444288096,
		.08594160621706773,
		.08594160621706773,
		.06979646842452049,
		.06979646842452049,
		.052293335152683286,
		.052293335152683286,
		.03377490158481415,
		.03377490158481415,
		.0146279952982722,
		.0146279952982722
	],
	[
		.13365457218610619,
		.1324620394046966,
		.1324620394046966,
		.12890572218808216,
		.12890572218808216,
		.12304908430672953,
		.12304908430672953,
		.11499664022241136,
		.11499664022241136,
		.10489209146454141,
		.10489209146454141,
		.09291576606003515,
		.09291576606003515,
		.07928141177671895,
		.07928141177671895,
		.06423242140852585,
		.06423242140852585,
		.04803767173108467,
		.04803767173108467,
		.030988005856979445,
		.030988005856979445,
		.013411859487141771,
		.013411859487141771
	],
	[
		.12793819534675216,
		.12793819534675216,
		.1258374563468283,
		.1258374563468283,
		.12167047292780339,
		.12167047292780339,
		.1155056680537256,
		.1155056680537256,
		.10744427011596563,
		.10744427011596563,
		.09761865210411388,
		.09761865210411388,
		.08619016153195327,
		.08619016153195327,
		.0733464814110803,
		.0733464814110803,
		.05929858491543678,
		.05929858491543678,
		.04427743881741981,
		.04427743881741981,
		.028531388628933663,
		.028531388628933663,
		.0123412297999872,
		.0123412297999872
	]
], ur = [
	[1],
	[1, 1],
	[
		1,
		2,
		1
	],
	[
		1,
		3,
		3,
		1
	]
], dr = (e, t, n) => {
	let r, i, a = n / 2;
	r = 0;
	for (let n = 0; n < 20; n++) i = a * cr[20][n] + a, r += lr[20][n] * pr(e, t, i);
	return a * r;
}, fr = (e, t, n) => {
	n === void 0 && (n = 1);
	let r = e[0] - 2 * e[1] + e[2], i = t[0] - 2 * t[1] + t[2], a = 2 * e[1] - 2 * e[0], o = 2 * t[1] - 2 * t[0], s = 4 * (r * r + i * i), c = 4 * (r * a + i * o), l = a * a + o * o;
	if (s === 0) return n * Math.sqrt((e[2] - e[0]) ** 2 + (t[2] - t[0]) ** 2);
	let u = c / (2 * s), d = l / s, f = n + u, p = d - u * u, m = f * f + p > 0 ? Math.sqrt(f * f + p) : 0, h = u * u + p > 0 ? Math.sqrt(u * u + p) : 0, g = u + Math.sqrt(u * u + p) === 0 ? 0 : p * Math.log(Math.abs((f + m) / (u + h)));
	return Math.sqrt(s) / 2 * (f * m - u * h + g);
};
function pr(e, t, n) {
	let r = mr(1, n, e), i = mr(1, n, t), a = r * r + i * i;
	return Math.sqrt(a);
}
var mr = (e, t, n) => {
	let r = n.length - 1, i, a;
	if (r === 0) return 0;
	if (e === 0) {
		a = 0;
		for (let e = 0; e <= r; e++) a += ur[r][e] * (1 - t) ** (r - e) * t ** +e * n[e];
		return a;
	} else {
		i = Array(r);
		for (let e = 0; e < r; e++) i[e] = r * (n[e + 1] - n[e]);
		return mr(e - 1, t, i);
	}
}, hr = (e, t, n) => {
	let r = 1, i = e / t, a = (e - n(i)) / t, o = 0;
	for (; r > .001;) {
		let s = n(i + a), c = Math.abs(e - s) / t;
		if (c < r) r = c, i += a;
		else {
			let o = n(i - a), s = Math.abs(e - o) / t;
			s < r ? (r = s, i -= a) : a /= 2;
		}
		if (o++, o > 500) break;
	}
	return i;
}, gr = class e extends L {
	constructor(e) {
		super(e), this.dataArray = [], this.pathLength = 0, this._readDataAttribute(), this.on("dataChange.konva", function() {
			this._readDataAttribute();
		});
	}
	_readDataAttribute() {
		this.dataArray = e.parsePathData(this.data()), this.pathLength = e.getPathLength(this.dataArray);
	}
	_sceneFunc(e) {
		let t = this.dataArray;
		e.beginPath();
		let n = !1;
		for (let r = 0; r < t.length; r++) {
			let i = t[r].command, a = t[r].points;
			switch (i) {
				case "L":
					e.lineTo(a[0], a[1]);
					break;
				case "M":
					e.moveTo(a[0], a[1]);
					break;
				case "C":
					e.bezierCurveTo(a[0], a[1], a[2], a[3], a[4], a[5]);
					break;
				case "Q":
					e.quadraticCurveTo(a[0], a[1], a[2], a[3]);
					break;
				case "A":
					let t = a[0], r = a[1], i = a[2], o = a[3], s = a[4], c = a[5], l = a[6], u = a[7], d = i > o ? i : o, f = i > o ? 1 : i / o, p = i > o ? o / i : 1;
					e.translate(t, r), e.rotate(l), e.scale(f, p), e.arc(0, 0, d, s, s + c, 1 - u), e.scale(1 / f, 1 / p), e.rotate(-l), e.translate(-t, -r);
					break;
				case "z":
					n = !0, e.closePath();
					break;
			}
		}
		!n && !this.hasFill() ? e.strokeShape(this) : e.fillStrokeShape(this);
	}
	getSelfRect() {
		let t = [];
		this.dataArray.forEach(function(n) {
			if (n.command === "A") {
				let r = n.points[4], i = n.points[5], a = n.points[4] + i, o = Math.PI / 180;
				if (Math.abs(r - a) < o && (o = Math.abs(r - a)), i < 0) for (let i = r - o; i > a; i -= o) {
					let r = e.getPointOnEllipticalArc(n.points[0], n.points[1], n.points[2], n.points[3], i, 0);
					t.push(r.x, r.y);
				}
				else for (let i = r + o; i < a; i += o) {
					let r = e.getPointOnEllipticalArc(n.points[0], n.points[1], n.points[2], n.points[3], i, 0);
					t.push(r.x, r.y);
				}
			} else if (n.command === "C") for (let r = 0; r <= 1; r += .01) {
				let i = e.getPointOnCubicBezier(r, n.start.x, n.start.y, n.points[0], n.points[1], n.points[2], n.points[3], n.points[4], n.points[5]);
				t.push(i.x, i.y);
			}
			else t = t.concat(n.points);
		});
		let n = t[0], r = t[0], i = t[1], a = t[1], o, s;
		for (let e = 0; e < t.length / 2; e++) o = t[e * 2], s = t[e * 2 + 1], isNaN(o) || (n = Math.min(n, o), r = Math.max(r, o)), isNaN(s) || (i = Math.min(i, s), a = Math.max(a, s));
		return {
			x: n,
			y: i,
			width: r - n,
			height: a - i
		};
	}
	getLength() {
		return this.pathLength;
	}
	getPointAtLength(t) {
		return e.getPointAtLengthOfDataArray(t, this.dataArray);
	}
	static getLineLength(e, t, n, r) {
		return Math.sqrt((n - e) * (n - e) + (r - t) * (r - t));
	}
	static getPathLength(e) {
		let t = 0;
		for (let n = 0; n < e.length; ++n) t += e[n].pathLength;
		return t;
	}
	static getPointAtLengthOfDataArray(t, n) {
		let r, i = 0, a = n.length;
		if (!a) return null;
		for (; i < a && t > n[i].pathLength;) t -= n[i].pathLength, ++i;
		if (i === a) return r = n[i - 1].points.slice(-2), {
			x: r[0],
			y: r[1]
		};
		if (t < .01) return n[i].command === "M" ? (r = n[i].points.slice(0, 2), {
			x: r[0],
			y: r[1]
		}) : {
			x: n[i].start.x,
			y: n[i].start.y
		};
		let o = n[i], s = o.points;
		switch (o.command) {
			case "L": return e.getPointOnLine(t, o.start.x, o.start.y, s[0], s[1]);
			case "C": return e.getPointOnCubicBezier(hr(t, e.getPathLength(n), (e) => dr([
				o.start.x,
				s[0],
				s[2],
				s[4]
			], [
				o.start.y,
				s[1],
				s[3],
				s[5]
			], e)), o.start.x, o.start.y, s[0], s[1], s[2], s[3], s[4], s[5]);
			case "Q": return e.getPointOnQuadraticBezier(hr(t, e.getPathLength(n), (e) => fr([
				o.start.x,
				s[0],
				s[2]
			], [
				o.start.y,
				s[1],
				s[3]
			], e)), o.start.x, o.start.y, s[0], s[1], s[2], s[3]);
			case "A":
				let r = s[0], i = s[1], a = s[2], c = s[3], l = s[5], u = s[6], d = s[4];
				return d += l * t / o.pathLength, e.getPointOnEllipticalArc(r, i, a, c, d, u);
		}
		return null;
	}
	static getPointOnLine(e, t, n, r, i, a, o) {
		a ??= t, o ??= n;
		let s = this.getLineLength(t, n, r, i);
		if (s < 1e-10) return {
			x: t,
			y: n
		};
		if (r === t) return {
			x: a,
			y: o + (i > n ? e : -e)
		};
		let c = (i - n) / (r - t), l = Math.sqrt(e * e / (1 + c * c)) * (r < t ? -1 : 1), u = c * l;
		if (Math.abs(o - n - c * (a - t)) < 1e-10) return {
			x: a + l,
			y: o + u
		};
		let d = ((a - t) * (r - t) + (o - n) * (i - n)) / (s * s), f = t + d * (r - t), p = n + d * (i - n), m = this.getLineLength(a, o, f, p), h = Math.sqrt(e * e - m * m), g = Math.sqrt(h * h / (1 + c * c)) * (r < t ? -1 : 1), _ = c * g;
		return {
			x: f + g,
			y: p + _
		};
	}
	static getPointOnCubicBezier(e, t, n, r, i, a, o, s, c) {
		function l(e) {
			return e * e * e;
		}
		function u(e) {
			return 3 * e * e * (1 - e);
		}
		function d(e) {
			return 3 * e * (1 - e) * (1 - e);
		}
		function f(e) {
			return (1 - e) * (1 - e) * (1 - e);
		}
		return {
			x: s * l(e) + a * u(e) + r * d(e) + t * f(e),
			y: c * l(e) + o * u(e) + i * d(e) + n * f(e)
		};
	}
	static getPointOnQuadraticBezier(e, t, n, r, i, a, o) {
		function s(e) {
			return e * e;
		}
		function c(e) {
			return 2 * e * (1 - e);
		}
		function l(e) {
			return (1 - e) * (1 - e);
		}
		return {
			x: a * s(e) + r * c(e) + t * l(e),
			y: o * s(e) + i * c(e) + n * l(e)
		};
	}
	static getPointOnEllipticalArc(e, t, n, r, i, a) {
		let o = Math.cos(a), s = Math.sin(a), c = {
			x: n * Math.cos(i),
			y: r * Math.sin(i)
		};
		return {
			x: e + (c.x * o - c.y * s),
			y: t + (c.x * s + c.y * o)
		};
	}
	static parsePathData(e) {
		if (!e) return [];
		let t = e, n = [
			"m",
			"M",
			"l",
			"L",
			"v",
			"V",
			"h",
			"H",
			"z",
			"Z",
			"c",
			"C",
			"q",
			"Q",
			"t",
			"T",
			"s",
			"S",
			"a",
			"A"
		];
		t = t.replace(/* @__PURE__ */ RegExp(" ", "g"), ",");
		for (let e = 0; e < n.length; e++) t = t.replace(new RegExp(n[e], "g"), "|" + n[e]);
		let r = t.split("|"), i = [], a = [], o = 0, s = 0, c = /([-+]?((\d+\.\d+)|((\d+)|(\.\d+)))(?:e[-+]?\d+)?)/gi, l;
		for (let e = 1; e < r.length; e++) {
			let t = r[e], n = t.charAt(0);
			for (t = t.slice(1), a.length = 0; l = c.exec(t);) a.push(l[0]);
			let u = [], d = n === "A" || n === "a" ? 0 : -1;
			for (let e = 0, t = a.length; e < t; e++) {
				let t = a[e];
				if (t === "00") {
					u.push(0, 0), d >= 0 && (d += 2, d >= 7 && (d -= 7));
					continue;
				}
				if (d >= 0) {
					if (d === 3) {
						if (/^[01]{2}\d+(?:\.\d+)?$/.test(t)) {
							u.push(parseInt(t[0], 10)), u.push(parseInt(t[1], 10)), u.push(parseFloat(t.slice(2))), d += 3, d >= 7 && (d -= 7);
							continue;
						}
						if (t === "11" || t === "10" || t === "01") {
							u.push(parseInt(t[0], 10)), u.push(parseInt(t[1], 10)), d += 2, d >= 7 && (d -= 7);
							continue;
						}
						if (t === "0" || t === "1") {
							u.push(parseInt(t, 10)), d += 1, d >= 7 && (d -= 7);
							continue;
						}
					} else if (d === 4) {
						if (/^[01]\d+(?:\.\d+)?$/.test(t)) {
							u.push(parseInt(t[0], 10)), u.push(parseFloat(t.slice(1))), d += 2, d >= 7 && (d -= 7);
							continue;
						}
						if (t === "0" || t === "1") {
							u.push(parseInt(t, 10)), d += 1, d >= 7 && (d -= 7);
							continue;
						}
					}
					let e = parseFloat(t);
					isNaN(e) ? u.push(0) : u.push(e), d += 1, d >= 7 && (d -= 7);
				} else {
					let e = parseFloat(t);
					isNaN(e) ? u.push(0) : u.push(e);
				}
			}
			for (; u.length > 0 && !isNaN(u[0]);) {
				let e = "", t = [], r = o, a = s, c, l, d, f, p, m, h, g, _, v;
				switch (n) {
					case "l":
						o += u.shift(), s += u.shift(), e = "L", t.push(o, s);
						break;
					case "L":
						o = u.shift(), s = u.shift(), t.push(o, s);
						break;
					case "m":
						let r = u.shift(), a = u.shift();
						if (o += r, s += a, e = "M", i.length > 2 && i[i.length - 1].command === "z") {
							for (let e = i.length - 2; e >= 0; e--) if (i[e].command === "M") {
								o = i[e].points[0] + r, s = i[e].points[1] + a;
								break;
							}
						}
						t.push(o, s), n = "l";
						break;
					case "M":
						o = u.shift(), s = u.shift(), e = "M", t.push(o, s), n = "L";
						break;
					case "h":
						o += u.shift(), e = "L", t.push(o, s);
						break;
					case "H":
						o = u.shift(), e = "L", t.push(o, s);
						break;
					case "v":
						s += u.shift(), e = "L", t.push(o, s);
						break;
					case "V":
						s = u.shift(), e = "L", t.push(o, s);
						break;
					case "C":
						t.push(u.shift(), u.shift(), u.shift(), u.shift()), o = u.shift(), s = u.shift(), t.push(o, s);
						break;
					case "c":
						t.push(o + u.shift(), s + u.shift(), o + u.shift(), s + u.shift()), o += u.shift(), s += u.shift(), e = "C", t.push(o, s);
						break;
					case "S":
						l = o, d = s, c = i[i.length - 1], c.command === "C" && (l = o + (o - c.points[2]), d = s + (s - c.points[3])), t.push(l, d, u.shift(), u.shift()), o = u.shift(), s = u.shift(), e = "C", t.push(o, s);
						break;
					case "s":
						l = o, d = s, c = i[i.length - 1], c.command === "C" && (l = o + (o - c.points[2]), d = s + (s - c.points[3])), t.push(l, d, o + u.shift(), s + u.shift()), o += u.shift(), s += u.shift(), e = "C", t.push(o, s);
						break;
					case "Q":
						t.push(u.shift(), u.shift()), o = u.shift(), s = u.shift(), t.push(o, s);
						break;
					case "q":
						t.push(o + u.shift(), s + u.shift()), o += u.shift(), s += u.shift(), e = "Q", t.push(o, s);
						break;
					case "T":
						l = o, d = s, c = i[i.length - 1], c.command === "Q" && (l = o + (o - c.points[0]), d = s + (s - c.points[1])), o = u.shift(), s = u.shift(), e = "Q", t.push(l, d, o, s);
						break;
					case "t":
						l = o, d = s, c = i[i.length - 1], c.command === "Q" && (l = o + (o - c.points[0]), d = s + (s - c.points[1])), o += u.shift(), s += u.shift(), e = "Q", t.push(l, d, o, s);
						break;
					case "A":
						f = u.shift(), p = u.shift(), m = u.shift(), h = u.shift(), g = u.shift(), _ = o, v = s, o = u.shift(), s = u.shift(), e = "A", t = this.convertEndpointToCenterParameterization(_, v, o, s, h, g, f, p, m);
						break;
					case "a":
						f = u.shift(), p = u.shift(), m = u.shift(), h = u.shift(), g = u.shift(), _ = o, v = s, o += u.shift(), s += u.shift(), e = "A", t = this.convertEndpointToCenterParameterization(_, v, o, s, h, g, f, p, m);
						break;
				}
				i.push({
					command: e || n,
					points: t,
					start: {
						x: r,
						y: a
					},
					pathLength: this.calcLength(r, a, e || n, t)
				});
			}
			(n === "z" || n === "Z") && i.push({
				command: "z",
				points: [],
				start: void 0,
				pathLength: 0
			});
		}
		return i;
	}
	static calcLength(t, n, r, i) {
		let a, o, s, c, l = e;
		switch (r) {
			case "L": return l.getLineLength(t, n, i[0], i[1]);
			case "C": return dr([
				t,
				i[0],
				i[2],
				i[4]
			], [
				n,
				i[1],
				i[3],
				i[5]
			], 1);
			case "Q": return fr([
				t,
				i[0],
				i[2]
			], [
				n,
				i[1],
				i[3]
			], 1);
			case "A":
				a = 0;
				let e = i[4], r = i[5], u = i[4] + r, d = Math.PI / 180;
				if (Math.abs(e - u) < d && (d = Math.abs(e - u)), o = l.getPointOnEllipticalArc(i[0], i[1], i[2], i[3], e, 0), r < 0) for (c = e - d; c > u; c -= d) s = l.getPointOnEllipticalArc(i[0], i[1], i[2], i[3], c, 0), a += l.getLineLength(o.x, o.y, s.x, s.y), o = s;
				else for (c = e + d; c < u; c += d) s = l.getPointOnEllipticalArc(i[0], i[1], i[2], i[3], c, 0), a += l.getLineLength(o.x, o.y, s.x, s.y), o = s;
				return s = l.getPointOnEllipticalArc(i[0], i[1], i[2], i[3], u, 0), a += l.getLineLength(o.x, o.y, s.x, s.y), a;
		}
		return 0;
	}
	static convertEndpointToCenterParameterization(e, t, n, r, i, a, o, s, c) {
		let l = Math.PI / 180 * c, u = Math.cos(l) * (e - n) / 2 + Math.sin(l) * (t - r) / 2, d = -1 * Math.sin(l) * (e - n) / 2 + Math.cos(l) * (t - r) / 2, f = u * u / (o * o) + d * d / (s * s);
		f > 1 && (o *= Math.sqrt(f), s *= Math.sqrt(f));
		let p = Math.sqrt((o * o * (s * s) - o * o * (d * d) - s * s * (u * u)) / (o * o * (d * d) + s * s * (u * u)));
		i === a && (p *= -1), isNaN(p) && (p = 0);
		let m = p * o * d / s, h = p * -s * u / o, g = (e + n) / 2 + Math.cos(l) * m - Math.sin(l) * h, _ = (t + r) / 2 + Math.sin(l) * m + Math.cos(l) * h, v = function(e) {
			return Math.sqrt(e[0] * e[0] + e[1] * e[1]);
		}, y = function(e, t) {
			return (e[0] * t[0] + e[1] * t[1]) / (v(e) * v(t));
		}, b = function(e, t) {
			return (e[0] * t[1] < e[1] * t[0] ? -1 : 1) * Math.acos(y(e, t));
		}, x = b([1, 0], [(u - m) / o, (d - h) / s]), ee = [(u - m) / o, (d - h) / s], S = [(-1 * u - m) / o, (-1 * d - h) / s], te = b(ee, S);
		return y(ee, S) <= -1 && (te = Math.PI), y(ee, S) >= 1 && (te = 0), a === 0 && te > 0 && (te -= 2 * Math.PI), a === 1 && te < 0 && (te += 2 * Math.PI), [
			g,
			_,
			o,
			s,
			x,
			te,
			l,
			a
		];
	}
};
gr.prototype.className = "Path", gr.prototype._attrsAffectingSize = ["data"], se(gr), P.addGetterSetter(gr, "data");
//#endregion
//#region node_modules/konva/lib/shapes/Arrow.js
var _r = class extends sr {
	_sceneFunc(e) {
		super._sceneFunc(e);
		let t = Math.PI * 2, n = this.points(), r = n, i = this.tension() !== 0 && n.length > 4;
		i && (r = this.getTensionPoints());
		let a = this.pointerLength(), o = n.length, s, c;
		if (i) {
			let e = [
				r[r.length - 4],
				r[r.length - 3],
				r[r.length - 2],
				r[r.length - 1],
				n[o - 2],
				n[o - 1]
			], t = gr.calcLength(r[r.length - 4], r[r.length - 3], "C", e), i = gr.getPointOnQuadraticBezier(Math.min(1, 1 - a / t), e[0], e[1], e[2], e[3], e[4], e[5]);
			s = n[o - 2] - i.x, c = n[o - 1] - i.y;
		} else s = n[o - 2] - n[o - 4], c = n[o - 1] - n[o - 3];
		let l = (Math.atan2(c, s) + t) % t, u = this.pointerWidth();
		this.pointerAtEnding() && (e.save(), e.beginPath(), e.translate(n[o - 2], n[o - 1]), e.rotate(l), e.moveTo(0, 0), e.lineTo(-a, u / 2), e.lineTo(-a, -u / 2), e.closePath(), e.restore(), this.__fillStroke(e)), this.pointerAtBeginning() && (e.save(), e.beginPath(), e.translate(n[0], n[1]), i ? (s = (r[0] + r[2]) / 2 - n[0], c = (r[1] + r[3]) / 2 - n[1]) : (s = n[2] - n[0], c = n[3] - n[1]), e.rotate((Math.atan2(-c, -s) + t) % t), e.moveTo(0, 0), e.lineTo(-a, u / 2), e.lineTo(-a, -u / 2), e.closePath(), e.restore(), this.__fillStroke(e));
	}
	__fillStroke(e) {
		let t = this.dashEnabled();
		t && (this.attrs.dashEnabled = !1, e.setLineDash([])), e.fillStrokeShape(this), t && (this.attrs.dashEnabled = !0);
	}
	getSelfRect() {
		let e = super.getSelfRect(), t = this.pointerWidth() / 2;
		return {
			x: e.x,
			y: e.y - t,
			width: e.width,
			height: e.height + t * 2
		};
	}
};
_r.prototype.className = "Arrow", se(_r), P.addGetterSetter(_r, "pointerLength", 10, N()), P.addGetterSetter(_r, "pointerWidth", 10, N()), P.addGetterSetter(_r, "pointerAtBeginning", !1), P.addGetterSetter(_r, "pointerAtEnding", !0);
//#endregion
//#region node_modules/konva/lib/shapes/Circle.js
var R = class extends L {
	_sceneFunc(e) {
		e.beginPath(), e.arc(0, 0, this.attrs.radius || 0, 0, Math.PI * 2, !1), e.closePath(), e.fillStrokeShape(this);
	}
	getWidth() {
		return this.radius() * 2;
	}
	getHeight() {
		return this.radius() * 2;
	}
	setWidth(e) {
		this.radius() !== e / 2 && this.radius(e / 2);
	}
	setHeight(e) {
		this.radius() !== e / 2 && this.radius(e / 2);
	}
};
R.prototype._centroid = !0, R.prototype.className = "Circle", R.prototype._attrsAffectingSize = ["radius"], se(R), P.addGetterSetter(R, "radius", 0, N());
//#endregion
//#region node_modules/konva/lib/shapes/Ellipse.js
var z = class extends L {
	_sceneFunc(e) {
		let t = this.radiusX(), n = this.radiusY();
		e.beginPath(), e.save(), t !== n && e.scale(1, n / t), e.arc(0, 0, t, 0, Math.PI * 2, !1), e.restore(), e.closePath(), e.fillStrokeShape(this);
	}
	getWidth() {
		return this.radiusX() * 2;
	}
	getHeight() {
		return this.radiusY() * 2;
	}
	setWidth(e) {
		this.radiusX(e / 2);
	}
	setHeight(e) {
		this.radiusY(e / 2);
	}
};
z.prototype.className = "Ellipse", z.prototype._centroid = !0, z.prototype._attrsAffectingSize = ["radiusX", "radiusY"], se(z), P.addComponentsGetterSetter(z, "radius", ["x", "y"]), P.addGetterSetter(z, "radiusX", 0, N()), P.addGetterSetter(z, "radiusY", 0, N());
//#endregion
//#region node_modules/konva/lib/shapes/Image.js
var vr = class e extends L {
	constructor(e) {
		super(e), this._loadListener = () => {
			this._requestDraw();
		}, this.on("imageChange.konva", (e) => {
			this._removeImageLoad(e.oldVal), this._setImageLoad();
		}), this._setImageLoad();
	}
	_setImageLoad() {
		let e = this.image();
		e && e.complete || e && e.readyState === 4 || e && e.addEventListener && e.addEventListener("load", this._loadListener);
	}
	_removeImageLoad(e) {
		e && e.removeEventListener && e.removeEventListener("load", this._loadListener);
	}
	destroy() {
		return this._removeImageLoad(this.image()), super.destroy(), this;
	}
	_useBufferCanvas() {
		let e = !!this.cornerRadius(), t = this.hasShadow();
		return e && t ? !0 : super._useBufferCanvas(!0);
	}
	_sceneFunc(e) {
		let t = this.getWidth(), n = this.getHeight(), r = this.cornerRadius(), i = this.attrs.image, a;
		if (i) {
			let e = this.attrs.cropWidth, r = this.attrs.cropHeight;
			a = e && r ? [
				i,
				this.cropX(),
				this.cropY(),
				e,
				r,
				0,
				0,
				t,
				n
			] : [
				i,
				0,
				0,
				t,
				n
			];
		}
		(this.hasFill() || this.hasStroke() || r) && (e.beginPath(), r ? M.drawRoundedRectPath(e, t, n, r) : e.rect(0, 0, t, n), e.closePath(), e.fillStrokeShape(this)), i && (r && e.clip(), e.drawImage.apply(e, a));
	}
	_hitFunc(e) {
		let t = this.width(), n = this.height(), r = this.cornerRadius();
		e.beginPath(), r ? M.drawRoundedRectPath(e, t, n, r) : e.rect(0, 0, t, n), e.closePath(), e.fillStrokeShape(this);
	}
	getWidth() {
		return this.attrs.width ?? this.image()?.width ?? 0;
	}
	getHeight() {
		return this.attrs.height ?? this.image()?.height ?? 0;
	}
	static fromURL(t, n, r = null) {
		let i = M.createImageElement();
		i.onload = function() {
			n(new e({ image: i }));
		}, i.onerror = r, i.crossOrigin = "Anonymous", i.src = t;
	}
};
vr.prototype.className = "Image", vr.prototype._attrsAffectingSize = ["image"], se(vr), P.addGetterSetter(vr, "cornerRadius", 0, Qe(4)), P.addGetterSetter(vr, "image"), P.addComponentsGetterSetter(vr, "crop", [
	"x",
	"y",
	"width",
	"height"
]), P.addGetterSetter(vr, "cropX", 0, N()), P.addGetterSetter(vr, "cropY", 0, N()), P.addGetterSetter(vr, "cropWidth", 0, N()), P.addGetterSetter(vr, "cropHeight", 0, N());
//#endregion
//#region node_modules/konva/lib/shapes/Label.js
var yr = [
	"fontFamily",
	"fontSize",
	"fontStyle",
	"padding",
	"lineHeight",
	"text",
	"width",
	"height",
	"pointerDirection",
	"pointerWidth",
	"pointerHeight"
], br = "Change.konva", xr = "none", Sr = "up", Cr = "right", wr = "down", Tr = "left", Er = yr.length, Dr = class extends Wn {
	constructor(e) {
		super(e), this.on("add.konva", function(e) {
			this._addListeners(e.child), this._sync();
		});
	}
	getText() {
		return this.find("Text")[0];
	}
	getTag() {
		return this.find("Tag")[0];
	}
	_addListeners(e) {
		let t = this, n, r = function() {
			t._sync();
		};
		for (n = 0; n < Er; n++) e.on(yr[n] + br, r);
	}
	getWidth() {
		return this.getText().width();
	}
	getHeight() {
		return this.getText().height();
	}
	_sync() {
		let e = this.getText(), t = this.getTag(), n, r, i, a, o, s, c;
		if (e && t) {
			switch (n = e.width(), r = e.height(), i = t.pointerDirection(), a = t.pointerWidth(), c = t.pointerHeight(), o = 0, s = 0, i) {
				case Sr:
					o = n / 2, s = -1 * c;
					break;
				case Cr:
					o = n + a, s = r / 2;
					break;
				case wr:
					o = n / 2, s = r + c;
					break;
				case Tr:
					o = -1 * a, s = r / 2;
					break;
			}
			t.setAttrs({
				x: -1 * o,
				y: -1 * s,
				width: n,
				height: r
			}), e.setAttrs({
				x: -1 * o,
				y: -1 * s
			});
		}
	}
};
Dr.prototype.className = "Label", se(Dr);
var Or = class extends L {
	_sceneFunc(e) {
		let t = this.width(), n = this.height(), r = this.pointerDirection(), i = this.pointerWidth(), a = this.pointerHeight(), o = this.cornerRadius(), s = 0, c = 0, l = 0, u = 0;
		typeof o == "number" ? s = c = l = u = Math.min(o, t / 2, n / 2) : (s = Math.min(o[0] || 0, t / 2, n / 2), c = Math.min(o[1] || 0, t / 2, n / 2), u = Math.min(o[2] || 0, t / 2, n / 2), l = Math.min(o[3] || 0, t / 2, n / 2)), e.beginPath(), e.moveTo(s, 0), r === Sr && (e.lineTo((t - i) / 2, 0), e.lineTo(t / 2, -1 * a), e.lineTo((t + i) / 2, 0)), e.lineTo(t - c, 0), e.arc(t - c, c, c, Math.PI * 3 / 2, 0, !1), r === Cr && (e.lineTo(t, (n - a) / 2), e.lineTo(t + i, n / 2), e.lineTo(t, (n + a) / 2)), e.lineTo(t, n - u), e.arc(t - u, n - u, u, 0, Math.PI / 2, !1), r === wr && (e.lineTo((t + i) / 2, n), e.lineTo(t / 2, n + a), e.lineTo((t - i) / 2, n)), e.lineTo(l, n), e.arc(l, n - l, l, Math.PI / 2, Math.PI, !1), r === Tr && (e.lineTo(0, (n + a) / 2), e.lineTo(-1 * i, n / 2), e.lineTo(0, (n - a) / 2)), e.lineTo(0, s), e.arc(s, s, s, Math.PI, Math.PI * 3 / 2, !1), e.closePath(), e.fillStrokeShape(this);
	}
	getSelfRect() {
		let e = 0, t = 0, n = this.pointerWidth(), r = this.pointerHeight(), i = this.pointerDirection(), a = this.width(), o = this.height();
		return i === Sr ? (t -= r, o += r) : i === wr ? o += r : i === Tr ? (e -= n * 1.5, a += n) : i === Cr && (a += n * 1.5), {
			x: e,
			y: t,
			width: a,
			height: o
		};
	}
};
Or.prototype.className = "Tag", se(Or), P.addGetterSetter(Or, "pointerDirection", xr), P.addGetterSetter(Or, "pointerWidth", 0, N()), P.addGetterSetter(Or, "pointerHeight", 0, N()), P.addGetterSetter(Or, "cornerRadius", 0, Qe(4));
//#endregion
//#region node_modules/konva/lib/shapes/Rect.js
var kr = class extends L {
	_sceneFunc(e) {
		let t = this.cornerRadius(), n = this.width(), r = this.height();
		e.beginPath(), t ? M.drawRoundedRectPath(e, n, r, t) : e.rect(0, 0, n, r), e.closePath(), e.fillStrokeShape(this);
	}
};
kr.prototype.className = "Rect", se(kr), P.addGetterSetter(kr, "cornerRadius", 0, Qe(4));
//#endregion
//#region node_modules/konva/lib/shapes/RegularPolygon.js
var Ar = class extends L {
	_sceneFunc(e) {
		let t = this._getPoints(), n = this.radius(), r = this.sides(), i = this.cornerRadius();
		if (e.beginPath(), i) M.drawRoundedPolygonPath(e, t, r, n, i);
		else {
			e.moveTo(t[0].x, t[0].y);
			for (let n = 1; n < t.length; n++) e.lineTo(t[n].x, t[n].y);
		}
		e.closePath(), e.fillStrokeShape(this);
	}
	_getPoints() {
		let e = this.attrs.sides, t = this.attrs.radius || 0, n = [];
		for (let r = 0; r < e; r++) n.push({
			x: t * Math.sin(r * 2 * Math.PI / e),
			y: -1 * t * Math.cos(r * 2 * Math.PI / e)
		});
		return n;
	}
	getSelfRect() {
		let e = this._getPoints(), t = e[0].x, n = e[0].x, r = e[0].y, i = e[0].y;
		return e.forEach((e) => {
			t = Math.min(t, e.x), n = Math.max(n, e.x), r = Math.min(r, e.y), i = Math.max(i, e.y);
		}), {
			x: t,
			y: r,
			width: n - t,
			height: i - r
		};
	}
	getWidth() {
		return this.radius() * 2;
	}
	getHeight() {
		return this.radius() * 2;
	}
	setWidth(e) {
		this.radius(e / 2);
	}
	setHeight(e) {
		this.radius(e / 2);
	}
};
Ar.prototype.className = "RegularPolygon", Ar.prototype._centroid = !0, Ar.prototype._attrsAffectingSize = ["radius"], se(Ar), P.addGetterSetter(Ar, "radius", 0, N()), P.addGetterSetter(Ar, "sides", 0, N()), P.addGetterSetter(Ar, "cornerRadius", 0, Qe(4));
//#endregion
//#region node_modules/konva/lib/shapes/Ring.js
var jr = Math.PI * 2, Mr = class extends L {
	_sceneFunc(e) {
		e.beginPath(), e.arc(0, 0, this.innerRadius(), 0, jr, !1), e.moveTo(this.outerRadius(), 0), e.arc(0, 0, this.outerRadius(), jr, 0, !0), e.closePath(), e.fillStrokeShape(this);
	}
	getWidth() {
		return this.outerRadius() * 2;
	}
	getHeight() {
		return this.outerRadius() * 2;
	}
	setWidth(e) {
		this.outerRadius(e / 2);
	}
	setHeight(e) {
		this.outerRadius(e / 2);
	}
};
Mr.prototype.className = "Ring", Mr.prototype._centroid = !0, Mr.prototype._attrsAffectingSize = ["innerRadius", "outerRadius"], se(Mr), P.addGetterSetter(Mr, "innerRadius", 0, N()), P.addGetterSetter(Mr, "outerRadius", 0, N());
//#endregion
//#region node_modules/konva/lib/shapes/Sprite.js
var B = class extends L {
	constructor(e) {
		super(e), this._updated = !0, this.anim = new Kn(() => {
			let e = this._updated;
			return this._updated = !1, e;
		}), this.on("animationChange.konva", function() {
			this.frameIndex(0);
		}), this.on("frameIndexChange.konva", function() {
			this._updated = !0;
		}), this.on("frameRateChange.konva", function() {
			this.anim.isRunning() && (clearInterval(this.interval), this._setInterval());
		});
	}
	_sceneFunc(e) {
		let t = this.animation(), n = this.frameIndex(), r = n * 4, i = this.animations()[t], a = this.frameOffsets(), o = i[r + 0], s = i[r + 1], c = i[r + 2], l = i[r + 3], u = this.image();
		if ((this.hasFill() || this.hasStroke()) && (e.beginPath(), e.rect(0, 0, c, l), e.closePath(), e.fillStrokeShape(this)), u) if (a) {
			let r = a[t], i = n * 2;
			e.drawImage(u, o, s, c, l, r[i + 0], r[i + 1], c, l);
		} else e.drawImage(u, o, s, c, l, 0, 0, c, l);
	}
	_hitFunc(e) {
		let t = this.animation(), n = this.frameIndex(), r = n * 4, i = this.animations()[t], a = this.frameOffsets(), o = i[r + 2], s = i[r + 3];
		if (e.beginPath(), a) {
			let r = a[t], i = n * 2;
			e.rect(r[i + 0], r[i + 1], o, s);
		} else e.rect(0, 0, o, s);
		e.closePath(), e.fillShape(this);
	}
	_useBufferCanvas() {
		return super._useBufferCanvas(!0);
	}
	_setInterval() {
		let e = this;
		this.interval = setInterval(function() {
			e._updateIndex();
		}, 1e3 / this.frameRate());
	}
	start() {
		if (this.isRunning()) return;
		let e = this.getLayer();
		this.anim.setLayers(e), this._setInterval(), this.anim.start();
	}
	stop() {
		this.anim.stop(), clearInterval(this.interval);
	}
	isRunning() {
		return this.anim.isRunning();
	}
	_updateIndex() {
		let e = this.frameIndex(), t = this.animation();
		e < this.animations()[t].length / 4 - 1 ? this.frameIndex(e + 1) : this.frameIndex(0);
	}
};
B.prototype.className = "Sprite", se(B), P.addGetterSetter(B, "animation"), P.addGetterSetter(B, "animations"), P.addGetterSetter(B, "frameOffsets"), P.addGetterSetter(B, "image"), P.addGetterSetter(B, "frameIndex", 0, N()), P.addGetterSetter(B, "frameRate", 17, N()), P.backCompat(B, {
	index: "frameIndex",
	getIndex: "getFrameIndex",
	setIndex: "setFrameIndex"
});
//#endregion
//#region node_modules/konva/lib/shapes/Star.js
var Nr = class extends L {
	_sceneFunc(e) {
		let t = this.innerRadius(), n = this.outerRadius(), r = this.numPoints();
		e.beginPath(), e.moveTo(0, 0 - n);
		for (let i = 1; i < r * 2; i++) {
			let a = i % 2 == 0 ? n : t, o = a * Math.sin(i * Math.PI / r), s = -1 * a * Math.cos(i * Math.PI / r);
			e.lineTo(o, s);
		}
		e.closePath(), e.fillStrokeShape(this);
	}
	getWidth() {
		return this.outerRadius() * 2;
	}
	getHeight() {
		return this.outerRadius() * 2;
	}
	setWidth(e) {
		this.outerRadius(e / 2);
	}
	setHeight(e) {
		this.outerRadius(e / 2);
	}
};
Nr.prototype.className = "Star", Nr.prototype._centroid = !0, Nr.prototype._attrsAffectingSize = ["innerRadius", "outerRadius"], se(Nr), P.addGetterSetter(Nr, "numPoints", 5, N()), P.addGetterSetter(Nr, "innerRadius", 0, N()), P.addGetterSetter(Nr, "outerRadius", 0, N());
//#endregion
//#region node_modules/konva/lib/shapes/Text.js
function Pr(e) {
	return [...e].reduce((e, t, n, r) => {
		if (/\p{Emoji}/u.test(t)) {
			let i = r[n + 1];
			i && /\p{Emoji_Modifier}|\u200D/u.test(i) ? (e.push(t + i), r[n + 1] = "") : e.push(t);
		} else /\p{Regional_Indicator}{2}/u.test(t + (r[n + 1] || "")) ? e.push(t + r[n + 1]) : n > 0 && /\p{Mn}|\p{Me}|\p{Mc}/u.test(t) ? e[e.length - 1] += t : t && e.push(t);
		return e;
	}, []);
}
var Fr = "auto", Ir = "center", Lr = "inherit", Rr = "justify", zr = "Change.konva", Br = "2d", Vr = "-", Hr = "left", Ur = "text", Wr = "Text", Gr = "top", Kr = "bottom", qr = "middle", Jr = "normal", Yr = "px ", Xr = " ", Zr = "right", Qr = "rtl", $r = "word", ei = "char", ti = "none", ni = "…", ri = [
	"direction",
	"fontFamily",
	"fontSize",
	"fontStyle",
	"fontVariant",
	"padding",
	"align",
	"verticalAlign",
	"lineHeight",
	"text",
	"width",
	"height",
	"wrap",
	"ellipsis",
	"letterSpacing"
], ii = ri.length, ai = null;
function oi() {
	if (ai !== null) return ai;
	ai = !1;
	try {
		let e = document.createElement("canvas");
		e.width = 10, e.height = 10;
		let t = e.getContext(Br);
		if (t) {
			t.globalAlpha = 0, t.shadowColor = "black", t.shadowBlur = 5, t.shadowOffsetX = 5, t.shadowOffsetY = 5, t.fillStyle = "black", t.font = "10px Arial", t.fillText("X", 0, 10);
			let e = t.getImageData(0, 0, 10, 10).data;
			for (let t = 3; t < e.length; t += 4) if (e[t] > 0) {
				ai = !0;
				break;
			}
		}
	} catch {}
	return ai;
}
function si(e) {
	return e.split(",").map((e) => {
		e = e.trim();
		let t = e.indexOf(" ") >= 0, n = e.indexOf("\"") >= 0 || e.indexOf("'") >= 0;
		return t && !n && (e = `"${e}"`), e;
	}).join(", ");
}
var ci;
function li() {
	return ci || (ci = M.createCanvasElement().getContext(Br), ci);
}
function ui(e) {
	e.fillText(this._partialText, this._partialTextX, this._partialTextY);
}
function di(e) {
	e.setAttr("miterLimit", 2), e.strokeText(this._partialText, this._partialTextX, this._partialTextY);
}
function fi(e) {
	return e ||= {}, !e.fillLinearGradientColorStops && !e.fillRadialGradientColorStops && !e.fillPatternImage && (e.fill = e.fill || "black"), e;
}
var V = class extends L {
	constructor(e) {
		super(fi(e)), this._partialTextX = 0, this._partialTextY = 0;
		for (let e = 0; e < ii; e++) this.on(ri[e] + zr, this._setTextData);
		this._setTextData();
	}
	_sceneFunc(e) {
		let t = this.textArr, n = t.length;
		if (!this.text()) return;
		let r = this.padding(), i = this.fontSize(), a = this.lineHeight() * i, o = this.verticalAlign(), s = this.direction(), c = 0, l = this.align(), u = this.getWidth(), d = this.letterSpacing(), f = this.charRenderFunc(), p = this.fill(), m = this.textDecoration(), h = this.underlineOffset(), g = m.indexOf("underline") !== -1, _ = m.indexOf("line-through") !== -1, v;
		s = s === Lr ? e.direction : s;
		let y = a / 2, b = qr;
		if (!A.legacyTextRendering) {
			let e = this.measureSize("M");
			b = "alphabetic", y = ((e.fontBoundingBoxAscent ?? e.actualBoundingBoxAscent) - (e.fontBoundingBoxDescent ?? e.actualBoundingBoxDescent)) / 2 + a / 2;
		}
		for (s === Qr && e.setAttr("direction", s), e.setAttr("font", this._getContextFont()), e.setAttr("textBaseline", b), e.setAttr("textAlign", Hr), o === qr ? c = (this.getHeight() - n * a - r * 2) / 2 : o === Kr && (c = this.getHeight() - n * a - r * 2), e.translate(r, c + r), v = 0; v < n; v++) {
			let o = 0, c = t[v], m = c.text, b = c.width, x = c.lastInParagraph;
			if (e.save(), l === Zr ? o += u - b - r * 2 : l === Ir && (o += (u - b - r * 2) / 2), g) {
				e.save(), e.beginPath();
				let t = h ?? (A.legacyTextRendering ? Math.round(i / 2) : Math.round(i / 4)), n = o, a = y + 0 + t;
				e.moveTo(n, a);
				let s = l === Rr && !x ? u - r * 2 : b;
				e.lineTo(n + Math.round(s), a), e.lineWidth = i / 15, e.strokeStyle = this._getLinearGradient() || p, e.stroke(), e.restore();
			}
			let ee = o;
			if (s !== Qr && (d !== 0 || l === Rr || f)) {
				let n = m.split(" ").length - 1, i = Pr(m);
				for (let a = 0; a < i.length; a++) {
					let s = i[a];
					if (s === " " && !x && l === Rr && (o += (u - r * 2 - b) / n), this._partialTextX = o, this._partialTextY = y + 0, this._partialText = s, f) {
						e.save();
						let n = t.slice(0, v).reduce((e, t) => e + Pr(t.text).length, 0);
						f({
							char: s,
							index: a + n,
							x: o,
							y: y + 0,
							lineIndex: v,
							column: a,
							isLastInLine: x,
							width: this.measureSize(s).width,
							context: e
						});
					}
					e.fillStrokeShape(this), f && e.restore(), o += this.measureSize(s).width + d;
				}
			} else d !== 0 && e.setAttr("letterSpacing", `${d}px`), this._partialTextX = o, this._partialTextY = y + 0, this._partialText = m, e.fillStrokeShape(this);
			if (_) {
				e.save(), e.beginPath();
				let t = A.legacyTextRendering ? 0 : -Math.round(i / 4), n = ee;
				e.moveTo(n, y + 0 + t);
				let a = l === Rr && !x ? u - r * 2 : b;
				e.lineTo(n + Math.round(a), y + 0 + t), e.lineWidth = i / 15, e.strokeStyle = this._getLinearGradient() || p, e.stroke(), e.restore();
			}
			e.restore(), n > 1 && (y += a);
		}
	}
	_hitFunc(e) {
		let t = this.getWidth(), n = this.getHeight();
		e.beginPath(), e.rect(0, 0, t, n), e.closePath(), e.fillStrokeShape(this);
	}
	setText(e) {
		let t = M._isString(e) ? e : e == null ? "" : e + "";
		return this._setAttr(Ur, t), this;
	}
	getWidth() {
		return this.attrs.width === Fr || this.attrs.width === void 0 ? this.getTextWidth() + this.padding() * 2 : this.attrs.width;
	}
	getHeight() {
		return this.attrs.height === Fr || this.attrs.height === void 0 ? this.fontSize() * this.textArr.length * this.lineHeight() + this.padding() * 2 : this.attrs.height;
	}
	getTextWidth() {
		return this.textWidth;
	}
	getTextHeight() {
		return M.warn("text.getTextHeight() method is deprecated. Use text.height() - for full height and text.fontSize() - for one line height."), this.textHeight;
	}
	measureSize(e) {
		let t = li(), n = this.fontSize(), r;
		t.save(), t.font = this._getContextFont(), r = t.measureText(e), t.restore();
		let i = n / 100;
		return {
			actualBoundingBoxAscent: r.actualBoundingBoxAscent ?? 71.58203125 * i,
			actualBoundingBoxDescent: r.actualBoundingBoxDescent ?? 0,
			actualBoundingBoxLeft: r.actualBoundingBoxLeft ?? -7.421875 * i,
			actualBoundingBoxRight: r.actualBoundingBoxRight ?? 75.732421875 * i,
			alphabeticBaseline: r.alphabeticBaseline ?? 0,
			emHeightAscent: r.emHeightAscent ?? 100 * i,
			emHeightDescent: r.emHeightDescent ?? -20 * i,
			fontBoundingBoxAscent: r.fontBoundingBoxAscent ?? 91 * i,
			fontBoundingBoxDescent: r.fontBoundingBoxDescent ?? 21 * i,
			hangingBaseline: r.hangingBaseline ?? 72.80000305175781 * i,
			ideographicBaseline: r.ideographicBaseline ?? -21 * i,
			width: r.width,
			height: n
		};
	}
	_getContextFont() {
		return this.fontStyle() + Xr + this.fontVariant() + Xr + (this.fontSize() + Yr) + si(this.fontFamily());
	}
	_addTextLine(e) {
		this.align() === Rr && (e = e.trim());
		let t = this._getTextWidth(e);
		return this.textArr.push({
			text: e,
			width: t,
			lastInParagraph: !1
		});
	}
	_getTextWidth(e) {
		let t = this.letterSpacing(), n = e.length;
		return li().measureText(e).width + t * n;
	}
	_setTextData() {
		let e = this.text().split("\n"), t = +this.fontSize(), n = 0, r = this.lineHeight() * t, i = this.attrs.width, a = this.attrs.height, o = i !== Fr && i !== void 0, s = a !== Fr && a !== void 0, c = this.padding(), l = i - c * 2, u = a - c * 2, d = 0, f = this.wrap(), p = f !== ei && f !== ti, m = this.ellipsis();
		this.textArr = [], li().font = this._getContextFont();
		let h = m ? this._getTextWidth(ni) : 0;
		for (let t = 0, i = e.length; t < i; ++t) {
			let a = e[t], c = this._getTextWidth(a);
			if (o && c > l) for (; a.length > 0;) {
				let e = 0, t = Pr(a).length, i = "", o = 0;
				for (; e < t;) {
					let n = e + t >>> 1, c = Pr(a).slice(0, n + 1).join(""), f = this._getTextWidth(c);
					(m && s && d + r > u ? f + h : f) <= l ? (e = n + 1, i = c, o = f) : t = n;
				}
				if (i) {
					if (p) {
						let t = Pr(a), n = Pr(i), r = t[n.length], s = r === Xr || r === Vr, c;
						if (s && o <= l) c = n.length;
						else {
							let e = n.lastIndexOf(Xr), t = n.lastIndexOf(Vr);
							c = Math.max(e, t) + 1;
						}
						c > 0 && (e = c, i = t.slice(0, e).join(""), o = this._getTextWidth(i));
					}
					if (i = i.trimRight(), this._addTextLine(i), n = Math.max(n, o), d += r, this._shouldHandleEllipsis(d)) {
						this._tryToAddEllipsisToLastLine();
						break;
					}
					if (a = Pr(a).slice(e).join("").trimLeft(), a.length > 0 && (c = this._getTextWidth(a), c <= l)) {
						this._addTextLine(a), d += r, n = Math.max(n, c);
						break;
					}
				} else break;
			}
			else this._addTextLine(a), d += r, n = Math.max(n, c), this._shouldHandleEllipsis(d) && t < i - 1 && this._tryToAddEllipsisToLastLine();
			if (this.textArr[this.textArr.length - 1] && (this.textArr[this.textArr.length - 1].lastInParagraph = !0), s && d + r > u) break;
		}
		this.textHeight = t, this.textWidth = n;
	}
	_shouldHandleEllipsis(e) {
		let t = +this.fontSize(), n = this.lineHeight() * t, r = this.attrs.height, i = r !== Fr && r !== void 0, a = r - this.padding() * 2;
		return this.wrap() === ti || i && e + n > a;
	}
	_tryToAddEllipsisToLastLine() {
		let e = this.attrs.width, t = e !== Fr && e !== void 0, n = e - this.padding() * 2, r = this.ellipsis(), i = this.textArr[this.textArr.length - 1];
		!i || !r || (t && (this._getTextWidth(i.text + ni) < n || (i.text = i.text.slice(0, i.text.length - 3))), this.textArr.splice(this.textArr.length - 1, 1), this._addTextLine(i.text + ni));
	}
	getStrokeScaleEnabled() {
		return !0;
	}
	_useBufferCanvas() {
		let e = this.textDecoration().indexOf("underline") !== -1 || this.textDecoration().indexOf("line-through") !== -1, t = this.hasShadow();
		return e && t || t && this.getAbsoluteOpacity() !== 1 && oi() ? !0 : super._useBufferCanvas();
	}
};
V.prototype._fillFunc = ui, V.prototype._strokeFunc = di, V.prototype.className = Wr, V.prototype._attrsAffectingSize = [
	"text",
	"fontSize",
	"padding",
	"wrap",
	"lineHeight",
	"letterSpacing"
], se(V), P.overWriteSetter(V, "width", $e()), P.overWriteSetter(V, "height", $e()), P.addGetterSetter(V, "direction", Lr), P.addGetterSetter(V, "fontFamily", "Arial"), P.addGetterSetter(V, "fontSize", 12, N()), P.addGetterSetter(V, "fontStyle", Jr), P.addGetterSetter(V, "fontVariant", Jr), P.addGetterSetter(V, "padding", 0, N()), P.addGetterSetter(V, "align", Hr), P.addGetterSetter(V, "verticalAlign", Gr), P.addGetterSetter(V, "lineHeight", 1, N()), P.addGetterSetter(V, "wrap", $r), P.addGetterSetter(V, "ellipsis", !1, rt()), P.addGetterSetter(V, "letterSpacing", 0, N()), P.addGetterSetter(V, "text", "", et()), P.addGetterSetter(V, "textDecoration", ""), P.addGetterSetter(V, "underlineOffset", void 0, N()), P.addGetterSetter(V, "charRenderFunc", void 0);
//#endregion
//#region node_modules/konva/lib/shapes/TextPath.js
var pi = "", mi = "normal";
function hi(e) {
	e.fillText(this.partialText, 0, 0);
}
function gi(e) {
	e.strokeText(this.partialText, 0, 0);
}
var _i = class extends L {
	constructor(e) {
		super(e), this.dummyCanvas = M.createCanvasElement(), this.dataArray = [], this._readDataAttribute(), this.on("dataChange.konva", function() {
			this._readDataAttribute(), this._setTextData();
		}), this.on("textChange.konva alignChange.konva letterSpacingChange.konva kerningFuncChange.konva fontSizeChange.konva fontFamilyChange.konva directionChange.konva", this._setTextData), this._setTextData();
	}
	_getTextPathLength() {
		return gr.getPathLength(this.dataArray);
	}
	_getPointAtLength(e) {
		return !this.attrs.data || e > this.pathLength ? null : gr.getPointAtLengthOfDataArray(e, this.dataArray);
	}
	_readDataAttribute() {
		this.dataArray = gr.parsePathData(this.attrs.data), this.pathLength = this._getTextPathLength();
	}
	_sceneFunc(e) {
		e.setAttr("font", this._getContextFont()), e.setAttr("textBaseline", this.textBaseline()), e.setAttr("textAlign", "left"), e.save();
		let t = this.textDecoration(), n = this.fill(), r = this.fontSize(), i = this.glyphInfo, a = t.indexOf("underline") !== -1, o = t.indexOf("line-through") !== -1;
		a && e.beginPath();
		for (let t = 0; t < i.length; t++) {
			e.save();
			let n = i[t].p0;
			e.translate(n.x, n.y), e.rotate(i[t].rotation), this.partialText = i[t].text, e.fillStrokeShape(this), a && (t === 0 && e.moveTo(0, r / 2 + 1), e.lineTo(i[t].width, r / 2 + 1)), e.restore();
		}
		if (a && (e.strokeStyle = n, e.lineWidth = r / 20, e.stroke()), o) {
			e.beginPath();
			for (let t = 0; t < i.length; t++) {
				e.save();
				let n = i[t].p0;
				e.translate(n.x, n.y), e.rotate(i[t].rotation), t === 0 && e.moveTo(0, 0), e.lineTo(i[t].width, 0), e.restore();
			}
			e.strokeStyle = n, e.lineWidth = r / 20, e.stroke();
		}
		e.restore();
	}
	_hitFunc(e) {
		e.beginPath();
		let t = this.glyphInfo;
		if (t.length >= 1) {
			let n = t[0].p0;
			e.moveTo(n.x, n.y);
		}
		for (let n = 0; n < t.length; n++) {
			let r = t[n].p1;
			e.lineTo(r.x, r.y);
		}
		e.setAttr("lineWidth", this.fontSize()), e.setAttr("strokeStyle", this.colorKey), e.stroke();
	}
	getTextWidth() {
		return this.textWidth;
	}
	getTextHeight() {
		return M.warn("text.getTextHeight() method is deprecated. Use text.height() - for full height and text.fontSize() - for one line height."), this.textHeight;
	}
	setText(e) {
		return V.prototype.setText.call(this, e);
	}
	_getContextFont() {
		return V.prototype._getContextFont.call(this);
	}
	_getTextSize(e) {
		let t = this.dummyCanvas.getContext("2d");
		t.save(), t.font = this._getContextFont();
		let n = t.measureText(e);
		return t.restore(), {
			width: n.width,
			height: parseInt(`${this.fontSize()}`, 10)
		};
	}
	_setTextData() {
		let e = Pr(this.text());
		this.direction() === "rtl" && e.reverse();
		let t = [], n = 0;
		for (let r = 0; r < e.length; r++) t.push({
			char: e[r],
			width: this._getTextSize(e[r]).width
		}), n += t[r].width;
		let { width: r, height: i } = this._getTextSize(this.attrs.text);
		if (this.textWidth = n, this.textHeight = i, this.glyphInfo = [], !this.attrs.data) return null;
		let a = this.letterSpacing(), o = this.align(), s = this.kerningFunc(), c = Math.max(0, n - r), l = Math.max(this.textWidth + ((this.attrs.text || "").length - 1) * a, 0), u = 0;
		o === "center" && (u = Math.max(0, this.pathLength / 2 - l / 2)), o === "right" && (u = Math.max(0, this.pathLength - l));
		let d = u;
		for (let n = 0; n < t.length; n++) {
			let r = this._getPointAtLength(d);
			if (!r) return;
			let i = t[n].char, u = t[n].width + a;
			if (i === " " && o === "justify") {
				let e = this.text().split(" ").length - 1;
				u += (this.pathLength - l) / e;
			}
			let f = d + u, p = this._getPointAtLength(f > this.pathLength && f - this.pathLength <= c ? this.pathLength : f);
			if (!p) return;
			let m = gr.getLineLength(r.x, r.y, p.x, p.y), h = 0;
			if (s) try {
				h = s(t[n - 1].char, i) * this.fontSize();
			} catch {
				h = 0;
			}
			r.x += h, p.x += h, this.textWidth += h;
			let g = gr.getPointOnLine(h + m / 2, r.x, r.y, p.x, p.y), _ = Math.atan2(p.y - r.y, p.x - r.x);
			this.glyphInfo.push({
				transposeX: g.x,
				transposeY: g.y,
				text: e[n],
				rotation: _,
				p0: r,
				p1: p,
				width: m
			}), d += u;
		}
	}
	getSelfRect() {
		if (!this.glyphInfo.length) return {
			x: 0,
			y: 0,
			width: 0,
			height: 0
		};
		let e = [];
		this.glyphInfo.forEach(function(t) {
			e.push(t.p0.x), e.push(t.p0.y), e.push(t.p1.x), e.push(t.p1.y);
		});
		let t = e[0] || 0, n = e[0] || 0, r = e[1] || 0, i = e[1] || 0, a, o;
		for (let s = 0; s < e.length / 2; s++) a = e[s * 2], o = e[s * 2 + 1], t = Math.min(t, a), n = Math.max(n, a), r = Math.min(r, o), i = Math.max(i, o);
		let s = this.fontSize();
		return {
			x: t - s / 2,
			y: r - s / 2,
			width: n - t + s,
			height: i - r + s
		};
	}
	destroy() {
		return M.releaseCanvas(this.dummyCanvas), super.destroy();
	}
};
_i.prototype._fillFunc = hi, _i.prototype._strokeFunc = gi, _i.prototype._fillFuncHit = hi, _i.prototype._strokeFuncHit = gi, _i.prototype.className = "TextPath", _i.prototype._attrsAffectingSize = [
	"text",
	"fontSize",
	"data"
], se(_i), P.addGetterSetter(_i, "data"), P.addGetterSetter(_i, "fontFamily", "Arial"), P.addGetterSetter(_i, "fontSize", 12, N()), P.addGetterSetter(_i, "fontStyle", mi), P.addGetterSetter(_i, "align", "left"), P.addGetterSetter(_i, "letterSpacing", 0, N()), P.addGetterSetter(_i, "textBaseline", "middle"), P.addGetterSetter(_i, "fontVariant", mi), P.addGetterSetter(_i, "text", pi), P.addGetterSetter(_i, "textDecoration", ""), P.addGetterSetter(_i, "kerningFunc", void 0), P.addGetterSetter(_i, "direction", "inherit");
//#endregion
//#region node_modules/konva/lib/shapes/Transformer.js
var vi = "tr-konva", yi = [
	"resizeEnabledChange",
	"rotateAnchorOffsetChange",
	"rotateAnchorAngleChange",
	"rotateEnabledChange",
	"enabledAnchorsChange",
	"anchorSizeChange",
	"borderEnabledChange",
	"borderStrokeChange",
	"borderStrokeWidthChange",
	"borderDashChange",
	"anchorStrokeChange",
	"anchorStrokeWidthChange",
	"anchorFillChange",
	"anchorCornerRadiusChange",
	"ignoreStrokeChange",
	"anchorStyleFuncChange"
].map((e) => e + `.${vi}`).join(" "), bi = "nodesRect", xi = [
	"widthChange",
	"heightChange",
	"scaleXChange",
	"scaleYChange",
	"skewXChange",
	"skewYChange",
	"rotationChange",
	"offsetXChange",
	"offsetYChange",
	"transformsEnabledChange",
	"strokeWidthChange",
	"draggableChange"
], Si = {
	"top-left": -45,
	"top-center": 0,
	"top-right": 45,
	"middle-right": -90,
	"middle-left": 90,
	"bottom-left": -135,
	"bottom-center": 180,
	"bottom-right": 135
}, Ci = "ontouchstart" in A._global;
function wi(e, t, n) {
	if (e === "rotater") return n;
	t += M.degToRad(Si[e] || 0);
	let r = (M.radToDeg(t) % 360 + 360) % 360;
	return M._inRange(r, 337.5, 360) || M._inRange(r, 0, 22.5) ? "ns-resize" : M._inRange(r, 22.5, 67.5) ? "nesw-resize" : M._inRange(r, 67.5, 112.5) ? "ew-resize" : M._inRange(r, 112.5, 157.5) ? "nwse-resize" : M._inRange(r, 157.5, 202.5) ? "ns-resize" : M._inRange(r, 202.5, 247.5) ? "nesw-resize" : M._inRange(r, 247.5, 292.5) ? "ew-resize" : M._inRange(r, 292.5, 337.5) ? "nwse-resize" : (M.error("Transformer has unknown angle for cursor detection: " + r), "pointer");
}
var Ti = [
	"top-left",
	"top-center",
	"top-right",
	"middle-right",
	"middle-left",
	"bottom-left",
	"bottom-center",
	"bottom-right"
];
function Ei(e) {
	return {
		x: e.x + e.width / 2 * Math.cos(e.rotation) + e.height / 2 * Math.sin(-e.rotation),
		y: e.y + e.height / 2 * Math.cos(e.rotation) + e.width / 2 * Math.sin(e.rotation)
	};
}
function Di(e, t, n) {
	let r = n.x + (e.x - n.x) * Math.cos(t) - (e.y - n.y) * Math.sin(t), i = n.y + (e.x - n.x) * Math.sin(t) + (e.y - n.y) * Math.cos(t);
	return {
		...e,
		rotation: e.rotation + t,
		x: r,
		y: i
	};
}
function Oi(e, t) {
	return Di(e, t, Ei(e));
}
function ki(e, t, n) {
	let r = t;
	for (let i = 0; i < e.length; i++) {
		let a = A.getAngle(e[i]), o = Math.abs(a - t) % (Math.PI * 2);
		Math.min(o, Math.PI * 2 - o) < n && (r = a);
	}
	return r;
}
var Ai = 0, H = class extends Wn {
	constructor(e) {
		super(e), this._movingAnchorName = null, this._transforming = !1, this._elementsCreated = !1, this._createElements(), this._handleMouseMove = this._handleMouseMove.bind(this), this._handleMouseUp = this._handleMouseUp.bind(this), this.update = this.update.bind(this), this.on(yi, this.update), this.getNode() && this.update();
	}
	attachTo(e) {
		return this.setNode(e), this;
	}
	setNode(e) {
		return M.warn("tr.setNode(shape), tr.node(shape) and tr.attachTo(shape) methods are deprecated. Please use tr.nodes(nodesArray) instead."), this.setNodes([e]);
	}
	getNode() {
		return this._nodes && this._nodes[0];
	}
	_getEventNamespace() {
		return vi + this._id;
	}
	setNodes(e = []) {
		this._nodes && this._nodes.length && this.detach();
		let t = e.filter((e) => e.isAncestorOf(this) ? (M.error("Konva.Transformer cannot be an a child of the node you are trying to attach"), !1) : !0);
		return this._nodes = e = t, e.length === 1 && this.useSingleNodeRotation() ? this.rotation(e[0].getAbsoluteRotation()) : this.rotation(0), this._nodes.forEach((e) => {
			let t = () => {
				this.nodes().length === 1 && this.useSingleNodeRotation() && this.rotation(this.nodes()[0].getAbsoluteRotation()), this._resetTransformCache(), !this._transforming && !this.isDragging() && this.update();
			};
			if (e._attrsAffectingSize.length) {
				let n = e._attrsAffectingSize.map((e) => e + "Change." + this._getEventNamespace()).join(" ");
				e.on(n, t);
			}
			e.on(xi.map((e) => e + `.${this._getEventNamespace()}`).join(" "), t), e.on(`absoluteTransformChange.${this._getEventNamespace()}`, t), this._proxyDrag(e);
		}), this._resetTransformCache(), this.findOne(".top-left") && this.update(), this;
	}
	_proxyDrag(e) {
		let t;
		e.on(`dragstart.${this._getEventNamespace()}`, (n) => {
			t = e.getAbsolutePosition(), !this.isDragging() && e !== this.findOne(".back") && this.startDrag(n, !1);
		}), e.on(`dragmove.${this._getEventNamespace()}`, (n) => {
			if (!t) return;
			let r = e.getAbsolutePosition(), i = r.x - t.x, a = r.y - t.y;
			this.nodes().forEach((t) => {
				if (t === e || t.isDragging()) return;
				let r = t.getAbsolutePosition();
				t.setAbsolutePosition({
					x: r.x + i,
					y: r.y + a
				}), t.startDrag(n);
			}), t = null;
		});
	}
	getNodes() {
		return this._nodes || [];
	}
	getActiveAnchor() {
		return this._movingAnchorName;
	}
	detach() {
		this._nodes && this._nodes.forEach((e) => {
			e.off("." + this._getEventNamespace());
		}), this._nodes = [], this._resetTransformCache();
	}
	_resetTransformCache() {
		this._clearCache(bi), this._clearCache("transform"), this._clearSelfAndDescendantCache("absoluteTransform");
	}
	_getNodeRect() {
		return this._getCache(bi, this.__getNodeRect);
	}
	__getNodeShape(e, t = this.rotation(), n) {
		let r = e.getClientRect({
			skipTransform: !0,
			skipShadow: !0,
			skipStroke: this.ignoreStroke()
		}), i = e.getAbsoluteScale(n), a = e.getAbsolutePosition(n), o = r.x * i.x - e.offsetX() * i.x, s = r.y * i.y - e.offsetY() * i.y, c = (A.getAngle(e.getAbsoluteRotation()) + Math.PI * 2) % (Math.PI * 2);
		return Di({
			x: a.x + o * Math.cos(c) + s * Math.sin(-c),
			y: a.y + s * Math.cos(c) + o * Math.sin(c),
			width: r.width * i.x,
			height: r.height * i.y,
			rotation: c
		}, -A.getAngle(t), {
			x: 0,
			y: 0
		});
	}
	__getNodeRect() {
		if (!this.getNode()) return {
			x: -1e8,
			y: -1e8,
			width: 0,
			height: 0,
			rotation: 0
		};
		let e = [];
		this.nodes().map((t) => {
			let n = t.getClientRect({
				skipTransform: !0,
				skipShadow: !0,
				skipStroke: this.ignoreStroke()
			}), r = [
				{
					x: n.x,
					y: n.y
				},
				{
					x: n.x + n.width,
					y: n.y
				},
				{
					x: n.x + n.width,
					y: n.y + n.height
				},
				{
					x: n.x,
					y: n.y + n.height
				}
			], i = t.getAbsoluteTransform();
			r.forEach(function(t) {
				let n = i.point(t);
				e.push(n);
			});
		});
		let t = new ue();
		t.rotate(-A.getAngle(this.rotation()));
		let n = Infinity, r = Infinity, i = -Infinity, a = -Infinity;
		e.forEach(function(e) {
			let o = t.point(e);
			n === void 0 && (n = i = o.x, r = a = o.y), n = Math.min(n, o.x), r = Math.min(r, o.y), i = Math.max(i, o.x), a = Math.max(a, o.y);
		}), t.invert();
		let o = t.point({
			x: n,
			y: r
		});
		return {
			x: o.x,
			y: o.y,
			width: i - n,
			height: a - r,
			rotation: A.getAngle(this.rotation())
		};
	}
	getX() {
		return this._getNodeRect().x;
	}
	getY() {
		return this._getNodeRect().y;
	}
	getWidth() {
		return this._getNodeRect().width;
	}
	getHeight() {
		return this._getNodeRect().height;
	}
	_createElements() {
		this._createBack(), Ti.forEach((e) => {
			this._createAnchor(e);
		}), this._createAnchor("rotater"), this._elementsCreated = !0;
	}
	_createAnchor(e) {
		let t = new kr({
			stroke: "rgb(0, 161, 255)",
			fill: "white",
			strokeWidth: 1,
			name: e + " _anchor",
			dragDistance: 0,
			draggable: !0,
			hitStrokeWidth: Ci ? 10 : "auto"
		}), n = this;
		t.on("mousedown touchstart", function(e) {
			n._handleMouseDown(e);
		}), t.on("dragstart", (e) => {
			t.stopDrag(), e.cancelBubble = !0;
		}), t.on("dragend", (e) => {
			e.cancelBubble = !0;
		}), t.on("mouseenter", () => {
			let n = wi(e, A.getAngle(this.rotation()), this.rotateAnchorCursor());
			t.getStage().content && (t.getStage().content.style.cursor = n), this._cursorChange = !0;
		}), t.on("mouseout", () => {
			t.getStage().content && (t.getStage().content.style.cursor = ""), this._cursorChange = !1;
		}), this.add(t);
	}
	_createBack() {
		let e = new L({
			name: "back",
			width: 0,
			height: 0,
			sceneFunc(e, t) {
				let n = t.getParent(), r = n.padding(), i = t.width(), a = t.height();
				if (e.beginPath(), e.rect(-r, -r, i + r * 2, a + r * 2), n.rotateEnabled() && n.rotateLineVisible()) {
					let t = n.rotateAnchorAngle(), r = n.rotateAnchorOffset(), o = M.degToRad(t), s = Math.sin(o), c = -Math.cos(o), l = i / 2, u = a / 2, d = Infinity;
					c < 0 ? d = Math.min(d, -u / c) : c > 0 && (d = Math.min(d, (a - u) / c)), s < 0 ? d = Math.min(d, -l / s) : s > 0 && (d = Math.min(d, (i - l) / s));
					let f = l + s * d, p = u + c * d, m = M._sign(a), h = f + s * r * m, g = p + c * r * m;
					e.moveTo(f, p), e.lineTo(h, g);
				}
				e.fillStrokeShape(t);
			},
			hitFunc: (e, t) => {
				if (!this.shouldOverdrawWholeArea()) return;
				let n = this.padding();
				e.beginPath(), e.rect(-n, -n, t.width() + n * 2, t.height() + n * 2), e.fillStrokeShape(t);
			}
		});
		this.add(e), this._proxyDrag(e), e.on("dragstart", (e) => {
			e.cancelBubble = !0;
		}), e.on("dragmove", (e) => {
			e.cancelBubble = !0;
		}), e.on("dragend", (e) => {
			e.cancelBubble = !0;
		}), this.on("dragmove", (e) => {
			this.update();
		});
	}
	_handleMouseDown(e) {
		if (this._transforming) return;
		this._movingAnchorName = e.target.name().split(" ")[0];
		let t = this._getNodeRect(), n = t.width, r = t.height, i = Math.sqrt(n ** 2 + r ** 2);
		this.sin = Math.abs(r / i), this.cos = Math.abs(n / i), typeof window < "u" && (window.addEventListener("mousemove", this._handleMouseMove), window.addEventListener("touchmove", this._handleMouseMove), window.addEventListener("mouseup", this._handleMouseUp, !0), window.addEventListener("touchend", this._handleMouseUp, !0)), this._transforming = !0;
		let a = e.target.getAbsolutePosition(), o = e.target.getStage().getPointerPosition();
		this._anchorDragOffset = {
			x: o.x - a.x,
			y: o.y - a.y
		}, Ai++, this._fire("transformstart", {
			evt: e.evt,
			target: this.getNode()
		}), this._nodes.forEach((t) => {
			t._fire("transformstart", {
				evt: e.evt,
				target: t
			});
		});
	}
	_handleMouseMove(e) {
		let t, n, r, i = this.findOne("." + this._movingAnchorName), a = i.getStage();
		a.setPointersPositions(e);
		let o = a.getPointerPosition(), s = {
			x: o.x - this._anchorDragOffset.x,
			y: o.y - this._anchorDragOffset.y
		}, c = i.getAbsolutePosition();
		this.anchorDragBoundFunc() && (s = this.anchorDragBoundFunc()(c, s, e)), i.setAbsolutePosition(s);
		let l = i.getAbsolutePosition();
		if (c.x === l.x && c.y === l.y) return;
		if (this._movingAnchorName === "rotater") {
			let r = this._getNodeRect();
			t = i.x() - r.width / 2, n = -i.y() + r.height / 2;
			let a = A.getAngle(this.rotateAnchorAngle()), o = Math.atan2(-n, t) + Math.PI / 2 - a;
			r.height < 0 && (o -= Math.PI);
			let s = A.getAngle(this.rotation()) + o, c = A.getAngle(this.rotationSnapTolerance()), l = Oi(r, ki(this.rotationSnaps(), s, c) - r.rotation);
			this._fitNodesInto(l, e);
			return;
		}
		let u = this.shiftBehavior(), d;
		d = u === "inverted" ? this.keepRatio() && !e.shiftKey : u === "none" ? this.keepRatio() : this.keepRatio() || e.shiftKey;
		let f = this.centeredScaling() || e.altKey;
		if (this._movingAnchorName === "top-left") {
			if (d) {
				let e = f ? {
					x: this.width() / 2,
					y: this.height() / 2
				} : {
					x: this.findOne(".bottom-right").x(),
					y: this.findOne(".bottom-right").y()
				};
				r = Math.sqrt((e.x - i.x()) ** 2 + (e.y - i.y()) ** 2);
				let a = this.findOne(".top-left").x() > e.x ? -1 : 1, o = this.findOne(".top-left").y() > e.y ? -1 : 1;
				t = r * this.cos * a, n = r * this.sin * o, this.findOne(".top-left").x(e.x - t), this.findOne(".top-left").y(e.y - n);
			}
		} else if (this._movingAnchorName === "top-center") this.findOne(".top-left").y(i.y());
		else if (this._movingAnchorName === "top-right") {
			if (d) {
				let e = f ? {
					x: this.width() / 2,
					y: this.height() / 2
				} : {
					x: this.findOne(".bottom-left").x(),
					y: this.findOne(".bottom-left").y()
				};
				r = Math.sqrt((i.x() - e.x) ** 2 + (e.y - i.y()) ** 2);
				let a = this.findOne(".top-right").x() < e.x ? -1 : 1, o = this.findOne(".top-right").y() > e.y ? -1 : 1;
				t = r * this.cos * a, n = r * this.sin * o, this.findOne(".top-right").x(e.x + t), this.findOne(".top-right").y(e.y - n);
			}
			var p = i.position();
			this.findOne(".top-left").y(p.y), this.findOne(".bottom-right").x(p.x);
		} else if (this._movingAnchorName === "middle-left") this.findOne(".top-left").x(i.x());
		else if (this._movingAnchorName === "middle-right") this.findOne(".bottom-right").x(i.x());
		else if (this._movingAnchorName === "bottom-left") {
			if (d) {
				let e = f ? {
					x: this.width() / 2,
					y: this.height() / 2
				} : {
					x: this.findOne(".top-right").x(),
					y: this.findOne(".top-right").y()
				};
				r = Math.sqrt((e.x - i.x()) ** 2 + (i.y() - e.y) ** 2);
				let a = e.x < i.x() ? -1 : 1, o = i.y() < e.y ? -1 : 1;
				t = r * this.cos * a, n = r * this.sin * o, i.x(e.x - t), i.y(e.y + n);
			}
			p = i.position(), this.findOne(".top-left").x(p.x), this.findOne(".bottom-right").y(p.y);
		} else if (this._movingAnchorName === "bottom-center") this.findOne(".bottom-right").y(i.y());
		else if (this._movingAnchorName === "bottom-right") {
			if (d) {
				let e = f ? {
					x: this.width() / 2,
					y: this.height() / 2
				} : {
					x: this.findOne(".top-left").x(),
					y: this.findOne(".top-left").y()
				};
				r = Math.sqrt((i.x() - e.x) ** 2 + (i.y() - e.y) ** 2);
				let a = this.findOne(".bottom-right").x() < e.x ? -1 : 1, o = this.findOne(".bottom-right").y() < e.y ? -1 : 1;
				t = r * this.cos * a, n = r * this.sin * o, this.findOne(".bottom-right").x(e.x + t), this.findOne(".bottom-right").y(e.y + n);
			}
		} else console.error(/* @__PURE__ */ Error("Wrong position argument of selection resizer: " + this._movingAnchorName));
		if (f = this.centeredScaling() || e.altKey, f) {
			let e = this.findOne(".top-left"), t = this.findOne(".bottom-right"), n = e.x(), r = e.y(), i = this.getWidth() - t.x(), a = this.getHeight() - t.y();
			t.move({
				x: -n,
				y: -r
			}), e.move({
				x: i,
				y: a
			});
		}
		let m = this.findOne(".top-left").getAbsolutePosition();
		t = m.x, n = m.y;
		let h = this.findOne(".bottom-right").x() - this.findOne(".top-left").x(), g = this.findOne(".bottom-right").y() - this.findOne(".top-left").y();
		this._fitNodesInto({
			x: t,
			y: n,
			width: h,
			height: g,
			rotation: A.getAngle(this.rotation())
		}, e);
	}
	_handleMouseUp(e) {
		this._removeEvents(e);
	}
	getAbsoluteTransform() {
		return this.getTransform();
	}
	_removeEvents(e) {
		var t;
		if (this._transforming) {
			this._transforming = !1, typeof window < "u" && (window.removeEventListener("mousemove", this._handleMouseMove), window.removeEventListener("touchmove", this._handleMouseMove), window.removeEventListener("mouseup", this._handleMouseUp, !0), window.removeEventListener("touchend", this._handleMouseUp, !0));
			let n = this.getNode();
			Ai--, this._fire("transformend", {
				evt: e,
				target: n
			}), (t = this.getLayer()) == null || t.batchDraw(), n && this._nodes.forEach((t) => {
				var n;
				t._fire("transformend", {
					evt: e,
					target: t
				}), (n = t.getLayer()) == null || n.batchDraw();
			}), this._movingAnchorName = null;
		}
	}
	_fitNodesInto(e, t) {
		let n = this._getNodeRect();
		if (M._inRange(e.width, -this.padding() * 2 - 1, 1)) {
			this.update();
			return;
		}
		if (M._inRange(e.height, -this.padding() * 2 - 1, 1)) {
			this.update();
			return;
		}
		let r = new ue();
		if (r.rotate(A.getAngle(this.rotation())), this._movingAnchorName && e.width < 0 && this._movingAnchorName.indexOf("left") >= 0) {
			let t = r.point({
				x: -this.padding() * 2,
				y: 0
			});
			e.x += t.x, e.y += t.y, e.width += this.padding() * 2, this._movingAnchorName = this._movingAnchorName.replace("left", "right"), this._anchorDragOffset.x -= t.x, this._anchorDragOffset.y -= t.y;
		} else if (this._movingAnchorName && e.width < 0 && this._movingAnchorName.indexOf("right") >= 0) {
			let t = r.point({
				x: this.padding() * 2,
				y: 0
			});
			this._movingAnchorName = this._movingAnchorName.replace("right", "left"), this._anchorDragOffset.x -= t.x, this._anchorDragOffset.y -= t.y, e.width += this.padding() * 2;
		}
		if (this._movingAnchorName && e.height < 0 && this._movingAnchorName.indexOf("top") >= 0) {
			let t = r.point({
				x: 0,
				y: -this.padding() * 2
			});
			e.x += t.x, e.y += t.y, this._movingAnchorName = this._movingAnchorName.replace("top", "bottom"), this._anchorDragOffset.x -= t.x, this._anchorDragOffset.y -= t.y, e.height += this.padding() * 2;
		} else if (this._movingAnchorName && e.height < 0 && this._movingAnchorName.indexOf("bottom") >= 0) {
			let t = r.point({
				x: 0,
				y: this.padding() * 2
			});
			this._movingAnchorName = this._movingAnchorName.replace("bottom", "top"), this._anchorDragOffset.x -= t.x, this._anchorDragOffset.y -= t.y, e.height += this.padding() * 2;
		}
		if (this.boundBoxFunc()) {
			let t = this.boundBoxFunc()(n, e);
			t ? e = t : M.warn("boundBoxFunc returned falsy. You should return new bound rect from it!");
		}
		let i = 1e7, a = new ue();
		a.translate(n.x, n.y), a.rotate(n.rotation), a.scale(n.width / i, n.height / i);
		let o = new ue(), s = e.width / i, c = e.height / i;
		this.flipEnabled() === !1 ? (o.translate(e.x, e.y), o.rotate(e.rotation), o.translate(e.width < 0 ? e.width : 0, e.height < 0 ? e.height : 0), o.scale(Math.abs(s), Math.abs(c))) : (o.translate(e.x, e.y), o.rotate(e.rotation), o.scale(s, c));
		let l = o.multiply(a.invert());
		this._nodes.forEach((e) => {
			var t;
			if (!e.getStage()) return;
			let n = e.getParent().getAbsoluteTransform(), r = e.getTransform().copy();
			r.translate(e.offsetX(), e.offsetY());
			let i = new ue();
			i.multiply(n.copy().invert()).multiply(l).multiply(n).multiply(r);
			let a = i.decompose();
			e.setAttrs(a), (t = e.getLayer()) == null || t.batchDraw();
		}), this.rotation(M._getRotation(e.rotation)), this._nodes.forEach((e) => {
			this._fire("transform", {
				evt: t,
				target: e
			}), e._fire("transform", {
				evt: t,
				target: e
			});
		}), this._resetTransformCache(), this.update(), this.getLayer().batchDraw();
	}
	forceUpdate() {
		this._resetTransformCache(), this.update();
	}
	_batchChangeChild(e, t) {
		this.findOne(e).setAttrs(t);
	}
	update() {
		var e;
		let t = this._getNodeRect();
		this.rotation(M._getRotation(t.rotation));
		let n = t.width, r = t.height, i = this.enabledAnchors(), a = this.resizeEnabled(), o = this.padding(), s = this.anchorSize(), c = this.find("._anchor");
		c.forEach((e) => {
			e.setAttrs({
				width: s,
				height: s,
				offsetX: s / 2,
				offsetY: s / 2,
				stroke: this.anchorStroke(),
				strokeWidth: this.anchorStrokeWidth(),
				fill: this.anchorFill(),
				cornerRadius: this.anchorCornerRadius()
			});
		}), this._batchChangeChild(".top-left", {
			x: 0,
			y: 0,
			offsetX: s / 2 + o,
			offsetY: s / 2 + o,
			visible: a && i.indexOf("top-left") >= 0
		}), this._batchChangeChild(".top-center", {
			x: n / 2,
			y: 0,
			offsetY: s / 2 + o,
			visible: a && i.indexOf("top-center") >= 0
		}), this._batchChangeChild(".top-right", {
			x: n,
			y: 0,
			offsetX: s / 2 - o,
			offsetY: s / 2 + o,
			visible: a && i.indexOf("top-right") >= 0
		}), this._batchChangeChild(".middle-left", {
			x: 0,
			y: r / 2,
			offsetX: s / 2 + o,
			visible: a && i.indexOf("middle-left") >= 0
		}), this._batchChangeChild(".middle-right", {
			x: n,
			y: r / 2,
			offsetX: s / 2 - o,
			visible: a && i.indexOf("middle-right") >= 0
		}), this._batchChangeChild(".bottom-left", {
			x: 0,
			y: r,
			offsetX: s / 2 + o,
			offsetY: s / 2 - o,
			visible: a && i.indexOf("bottom-left") >= 0
		}), this._batchChangeChild(".bottom-center", {
			x: n / 2,
			y: r,
			offsetY: s / 2 - o,
			visible: a && i.indexOf("bottom-center") >= 0
		}), this._batchChangeChild(".bottom-right", {
			x: n,
			y: r,
			offsetX: s / 2 - o,
			offsetY: s / 2 - o,
			visible: a && i.indexOf("bottom-right") >= 0
		});
		let l = this.rotateAnchorAngle(), u = this.rotateAnchorOffset(), d = M.degToRad(l), f = Math.sin(d), p = -Math.cos(d), m = n / 2, h = r / 2, g = Infinity;
		p < 0 ? g = Math.min(g, -h / p) : p > 0 && (g = Math.min(g, (r - h) / p)), f < 0 ? g = Math.min(g, -m / f) : f > 0 && (g = Math.min(g, (n - m) / f));
		let _ = m + f * g, v = h + p * g, y = M._sign(r);
		this._batchChangeChild(".rotater", {
			x: _ + f * u * y,
			y: v + p * u * y - o * p,
			visible: this.rotateEnabled()
		}), this._batchChangeChild(".back", {
			width: n,
			height: r,
			visible: this.borderEnabled(),
			stroke: this.borderStroke(),
			strokeWidth: this.borderStrokeWidth(),
			dash: this.borderDash(),
			draggable: this.nodes().some((e) => e.draggable()),
			x: 0,
			y: 0
		});
		let b = this.anchorStyleFunc();
		b && c.forEach((e) => {
			b(e);
		}), (e = this.getLayer()) == null || e.batchDraw();
	}
	isTransforming() {
		return this._transforming;
	}
	stopTransform() {
		if (this._transforming) {
			this._removeEvents();
			let e = this.findOne("." + this._movingAnchorName);
			e && e.stopDrag();
		}
	}
	destroy() {
		return this.getStage() && this._cursorChange && this.getStage().content && (this.getStage().content.style.cursor = ""), Wn.prototype.destroy.call(this), this.detach(), this._removeEvents(), this;
	}
	add(...e) {
		return this._elementsCreated ? (M.error("You cannot add external nodes to the Transformer. Use tr.nodes([node]) instead."), this) : super.add(...e);
	}
	toObject() {
		return I.prototype.toObject.call(this);
	}
	clone(e) {
		return I.prototype.clone.call(this, e);
	}
	getClientRect() {
		return this.nodes().length > 0 ? super.getClientRect() : {
			x: 0,
			y: 0,
			width: 0,
			height: 0
		};
	}
};
H.isTransforming = () => Ai > 0;
function ji(e) {
	return e instanceof Array || M.warn("enabledAnchors value should be an array"), e instanceof Array && e.forEach(function(e) {
		Ti.indexOf(e) === -1 && M.warn("Unknown anchor name: " + e + ". Available names are: " + Ti.join(", "));
	}), e || [];
}
H.prototype.className = "Transformer", se(H), P.addGetterSetter(H, "enabledAnchors", Ti, ji), P.addGetterSetter(H, "flipEnabled", !0, rt()), P.addGetterSetter(H, "resizeEnabled", !0), P.addGetterSetter(H, "anchorSize", 10, N()), P.addGetterSetter(H, "rotateEnabled", !0), P.addGetterSetter(H, "rotateLineVisible", !0), P.addGetterSetter(H, "rotationSnaps", []), P.addGetterSetter(H, "rotateAnchorOffset", 50, N()), P.addGetterSetter(H, "rotateAnchorAngle", 0, N()), P.addGetterSetter(H, "rotateAnchorCursor", "crosshair"), P.addGetterSetter(H, "rotationSnapTolerance", 5, N()), P.addGetterSetter(H, "borderEnabled", !0), P.addGetterSetter(H, "anchorStroke", "rgb(0, 161, 255)"), P.addGetterSetter(H, "anchorStrokeWidth", 1, N()), P.addGetterSetter(H, "anchorFill", "white"), P.addGetterSetter(H, "anchorCornerRadius", 0, N()), P.addGetterSetter(H, "borderStroke", "rgb(0, 161, 255)"), P.addGetterSetter(H, "borderStrokeWidth", 1, N()), P.addGetterSetter(H, "borderDash"), P.addGetterSetter(H, "keepRatio", !0), P.addGetterSetter(H, "shiftBehavior", "default"), P.addGetterSetter(H, "centeredScaling", !1), P.addGetterSetter(H, "ignoreStroke", !1), P.addGetterSetter(H, "padding", 0, N()), P.addGetterSetter(H, "nodes"), P.addGetterSetter(H, "node"), P.addGetterSetter(H, "boundBoxFunc"), P.addGetterSetter(H, "anchorDragBoundFunc"), P.addGetterSetter(H, "anchorStyleFunc"), P.addGetterSetter(H, "shouldOverdrawWholeArea", !1), P.addGetterSetter(H, "useSingleNodeRotation", !0), P.backCompat(H, {
	lineEnabled: "borderEnabled",
	rotateHandlerOffset: "rotateAnchorOffset",
	enabledHandlers: "enabledAnchors"
});
//#endregion
//#region node_modules/konva/lib/shapes/Wedge.js
var Mi = class extends L {
	_sceneFunc(e) {
		e.beginPath(), e.arc(0, 0, this.radius(), 0, A.getAngle(this.angle()), this.clockwise()), e.lineTo(0, 0), e.closePath(), e.fillStrokeShape(this);
	}
	getWidth() {
		return this.radius() * 2;
	}
	getHeight() {
		return this.radius() * 2;
	}
	setWidth(e) {
		this.radius(e / 2);
	}
	setHeight(e) {
		this.radius(e / 2);
	}
};
Mi.prototype.className = "Wedge", Mi.prototype._centroid = !0, Mi.prototype._attrsAffectingSize = ["radius"], se(Mi), P.addGetterSetter(Mi, "radius", 0, N()), P.addGetterSetter(Mi, "angle", 0, N()), P.addGetterSetter(Mi, "clockwise", !1), P.backCompat(Mi, {
	angleDeg: "angle",
	getAngleDeg: "getAngle",
	setAngleDeg: "setAngle"
});
//#endregion
//#region node_modules/konva/lib/filters/Blur.js
function Ni() {
	this.r = 0, this.g = 0, this.b = 0, this.a = 0, this.next = null;
}
var Pi = [
	512,
	512,
	456,
	512,
	328,
	456,
	335,
	512,
	405,
	328,
	271,
	456,
	388,
	335,
	292,
	512,
	454,
	405,
	364,
	328,
	298,
	271,
	496,
	456,
	420,
	388,
	360,
	335,
	312,
	292,
	273,
	512,
	482,
	454,
	428,
	405,
	383,
	364,
	345,
	328,
	312,
	298,
	284,
	271,
	259,
	496,
	475,
	456,
	437,
	420,
	404,
	388,
	374,
	360,
	347,
	335,
	323,
	312,
	302,
	292,
	282,
	273,
	265,
	512,
	497,
	482,
	468,
	454,
	441,
	428,
	417,
	405,
	394,
	383,
	373,
	364,
	354,
	345,
	337,
	328,
	320,
	312,
	305,
	298,
	291,
	284,
	278,
	271,
	265,
	259,
	507,
	496,
	485,
	475,
	465,
	456,
	446,
	437,
	428,
	420,
	412,
	404,
	396,
	388,
	381,
	374,
	367,
	360,
	354,
	347,
	341,
	335,
	329,
	323,
	318,
	312,
	307,
	302,
	297,
	292,
	287,
	282,
	278,
	273,
	269,
	265,
	261,
	512,
	505,
	497,
	489,
	482,
	475,
	468,
	461,
	454,
	447,
	441,
	435,
	428,
	422,
	417,
	411,
	405,
	399,
	394,
	389,
	383,
	378,
	373,
	368,
	364,
	359,
	354,
	350,
	345,
	341,
	337,
	332,
	328,
	324,
	320,
	316,
	312,
	309,
	305,
	301,
	298,
	294,
	291,
	287,
	284,
	281,
	278,
	274,
	271,
	268,
	265,
	262,
	259,
	257,
	507,
	501,
	496,
	491,
	485,
	480,
	475,
	470,
	465,
	460,
	456,
	451,
	446,
	442,
	437,
	433,
	428,
	424,
	420,
	416,
	412,
	408,
	404,
	400,
	396,
	392,
	388,
	385,
	381,
	377,
	374,
	370,
	367,
	363,
	360,
	357,
	354,
	350,
	347,
	344,
	341,
	338,
	335,
	332,
	329,
	326,
	323,
	320,
	318,
	315,
	312,
	310,
	307,
	304,
	302,
	299,
	297,
	294,
	292,
	289,
	287,
	285,
	282,
	280,
	278,
	275,
	273,
	271,
	269,
	267,
	265,
	263,
	261,
	259
], Fi = [
	9,
	11,
	12,
	13,
	13,
	14,
	14,
	15,
	15,
	15,
	15,
	16,
	16,
	16,
	16,
	17,
	17,
	17,
	17,
	17,
	17,
	17,
	18,
	18,
	18,
	18,
	18,
	18,
	18,
	18,
	18,
	19,
	19,
	19,
	19,
	19,
	19,
	19,
	19,
	19,
	19,
	19,
	19,
	19,
	19,
	20,
	20,
	20,
	20,
	20,
	20,
	20,
	20,
	20,
	20,
	20,
	20,
	20,
	20,
	20,
	20,
	20,
	20,
	21,
	21,
	21,
	21,
	21,
	21,
	21,
	21,
	21,
	21,
	21,
	21,
	21,
	21,
	21,
	21,
	21,
	21,
	21,
	21,
	21,
	21,
	21,
	21,
	21,
	21,
	21,
	22,
	22,
	22,
	22,
	22,
	22,
	22,
	22,
	22,
	22,
	22,
	22,
	22,
	22,
	22,
	22,
	22,
	22,
	22,
	22,
	22,
	22,
	22,
	22,
	22,
	22,
	22,
	22,
	22,
	22,
	22,
	22,
	22,
	22,
	22,
	22,
	22,
	23,
	23,
	23,
	23,
	23,
	23,
	23,
	23,
	23,
	23,
	23,
	23,
	23,
	23,
	23,
	23,
	23,
	23,
	23,
	23,
	23,
	23,
	23,
	23,
	23,
	23,
	23,
	23,
	23,
	23,
	23,
	23,
	23,
	23,
	23,
	23,
	23,
	23,
	23,
	23,
	23,
	23,
	23,
	23,
	23,
	23,
	23,
	23,
	23,
	23,
	23,
	23,
	23,
	23,
	24,
	24,
	24,
	24,
	24,
	24,
	24,
	24,
	24,
	24,
	24,
	24,
	24,
	24,
	24,
	24,
	24,
	24,
	24,
	24,
	24,
	24,
	24,
	24,
	24,
	24,
	24,
	24,
	24,
	24,
	24,
	24,
	24,
	24,
	24,
	24,
	24,
	24,
	24,
	24,
	24,
	24,
	24,
	24,
	24,
	24,
	24,
	24,
	24,
	24,
	24,
	24,
	24,
	24,
	24,
	24,
	24,
	24,
	24,
	24,
	24,
	24,
	24,
	24,
	24,
	24,
	24,
	24,
	24,
	24,
	24,
	24,
	24,
	24
];
function Ii(e, t) {
	let n = e.data, r = e.width, i = e.height, a, o, s, c, l, u, d, f, p, m, h, g, _, v, y, b, x, ee, S, te, ne = t + t + 1, C = r - 1, w = i - 1, T = t + 1, re = T * (T + 1) / 2, E = new Ni(), ie = Pi[t], ae = Fi[t], D = null, O = E, oe = null, k = null;
	for (let e = 1; e < ne; e++) O = O.next = new Ni(), e === T && (D = O);
	O.next = E, s = o = 0;
	for (let e = 0; e < i; e++) {
		g = _ = v = y = c = l = u = d = 0, f = T * (b = n[o]), p = T * (x = n[o + 1]), m = T * (ee = n[o + 2]), h = T * (S = n[o + 3]), c += re * b, l += re * x, u += re * ee, d += re * S, O = E;
		for (let e = 0; e < T; e++) O.r = b, O.g = x, O.b = ee, O.a = S, O = O.next;
		for (let e = 1; e < T; e++) a = o + ((C < e ? C : e) << 2), c += (O.r = b = n[a]) * (te = T - e), l += (O.g = x = n[a + 1]) * te, u += (O.b = ee = n[a + 2]) * te, d += (O.a = S = n[a + 3]) * te, g += b, _ += x, v += ee, y += S, O = O.next;
		oe = E, k = D;
		for (let e = 0; e < r; e++) n[o + 3] = S = d * ie >> ae, S === 0 ? n[o] = n[o + 1] = n[o + 2] = 0 : (S = 255 / S, n[o] = (c * ie >> ae) * S, n[o + 1] = (l * ie >> ae) * S, n[o + 2] = (u * ie >> ae) * S), c -= f, l -= p, u -= m, d -= h, f -= oe.r, p -= oe.g, m -= oe.b, h -= oe.a, a = s + ((a = e + t + 1) < C ? a : C) << 2, g += oe.r = n[a], _ += oe.g = n[a + 1], v += oe.b = n[a + 2], y += oe.a = n[a + 3], c += g, l += _, u += v, d += y, oe = oe.next, f += b = k.r, p += x = k.g, m += ee = k.b, h += S = k.a, g -= b, _ -= x, v -= ee, y -= S, k = k.next, o += 4;
		s += r;
	}
	for (let e = 0; e < r; e++) {
		_ = v = y = g = l = u = d = c = 0, o = e << 2, f = T * (b = n[o]), p = T * (x = n[o + 1]), m = T * (ee = n[o + 2]), h = T * (S = n[o + 3]), c += re * b, l += re * x, u += re * ee, d += re * S, O = E;
		for (let e = 0; e < T; e++) O.r = b, O.g = x, O.b = ee, O.a = S, O = O.next;
		let s = r;
		for (let i = 1; i <= t; i++) o = s + e << 2, c += (O.r = b = n[o]) * (te = T - i), l += (O.g = x = n[o + 1]) * te, u += (O.b = ee = n[o + 2]) * te, d += (O.a = S = n[o + 3]) * te, g += b, _ += x, v += ee, y += S, O = O.next, i < w && (s += r);
		o = e, oe = E, k = D;
		for (let t = 0; t < i; t++) a = o << 2, n[a + 3] = S = d * ie >> ae, S > 0 ? (S = 255 / S, n[a] = (c * ie >> ae) * S, n[a + 1] = (l * ie >> ae) * S, n[a + 2] = (u * ie >> ae) * S) : n[a] = n[a + 1] = n[a + 2] = 0, c -= f, l -= p, u -= m, d -= h, f -= oe.r, p -= oe.g, m -= oe.b, h -= oe.a, a = e + ((a = t + T) < w ? a : w) * r << 2, c += g += oe.r = n[a], l += _ += oe.g = n[a + 1], u += v += oe.b = n[a + 2], d += y += oe.a = n[a + 3], oe = oe.next, f += b = k.r, p += x = k.g, m += ee = k.b, h += S = k.a, g -= b, _ -= x, v -= ee, y -= S, k = k.next, o += r;
	}
}
var Li = function(e) {
	let t = Math.round(this.blurRadius());
	t > 0 && Ii(e, t);
};
P.addGetterSetter(I, "blurRadius", 0, N(), P.afterSetFilter);
//#endregion
//#region node_modules/konva/lib/filters/Brighten.js
var Ri = function(e) {
	let t = this.brightness() * 255, n = e.data, r = n.length;
	for (let e = 0; e < r; e += 4) n[e] += t, n[e + 1] += t, n[e + 2] += t;
};
P.addGetterSetter(I, "brightness", 0, N(), P.afterSetFilter);
//#endregion
//#region node_modules/konva/lib/filters/Brightness.js
var zi = function(e) {
	let t = this.brightness(), n = e.data, r = n.length;
	for (let e = 0; e < r; e += 4) n[e] = Math.min(255, n[e] * t), n[e + 1] = Math.min(255, n[e + 1] * t), n[e + 2] = Math.min(255, n[e + 2] * t);
}, Bi = function(e) {
	let t = ((this.contrast() + 100) / 100) ** 2, n = e.data, r = n.length, i = 150, a = 150, o = 150;
	for (let e = 0; e < r; e += 4) i = n[e], a = n[e + 1], o = n[e + 2], i /= 255, i -= .5, i *= t, i += .5, i *= 255, a /= 255, a -= .5, a *= t, a += .5, a *= 255, o /= 255, o -= .5, o *= t, o += .5, o *= 255, i = i < 0 ? 0 : i > 255 ? 255 : i, a = a < 0 ? 0 : a > 255 ? 255 : a, o = o < 0 ? 0 : o > 255 ? 255 : o, n[e] = i, n[e + 1] = a, n[e + 2] = o;
};
P.addGetterSetter(I, "contrast", 0, N(), P.afterSetFilter);
//#endregion
//#region node_modules/konva/lib/filters/Emboss.js
var Vi = function(e) {
	let t = e.data, n = e.width, r = e.height, i = Math.min(1, Math.max(0, this.embossStrength?.call(this) ?? .5)), a = Math.min(1, Math.max(0, this.embossWhiteLevel?.call(this) ?? .5)), o = {
		"top-left": 315,
		top: 270,
		"top-right": 225,
		right: 180,
		"bottom-right": 135,
		bottom: 90,
		"bottom-left": 45,
		left: 0
	}[this.embossDirection?.call(this) ?? "top-left"] ?? 315, s = !!(this.embossBlend?.call(this) ?? !1), c = i * 10, l = a * 255, u = o * Math.PI / 180, d = Math.cos(u), f = Math.sin(u), p = 128 / 1020 * c, m = new Uint8ClampedArray(t), h = new Float32Array(n * r);
	for (let e = 0, n = 0; n < t.length; n += 4, e++) h[e] = .2126 * m[n] + .7152 * m[n + 1] + .0722 * m[n + 2];
	let g = [
		-1,
		0,
		1,
		-2,
		0,
		2,
		-1,
		0,
		1
	], _ = [
		-1,
		-2,
		-1,
		0,
		0,
		0,
		1,
		2,
		1
	], v = [
		-n - 1,
		-n,
		-n + 1,
		-1,
		0,
		1,
		n - 1,
		n,
		n + 1
	], y = (e) => e < 0 ? 0 : e > 255 ? 255 : e;
	for (let e = 1; e < r - 1; e++) for (let r = 1; r < n - 1; r++) {
		let i = e * n + r, a = 0, o = 0;
		a += h[i + v[0]] * g[0], o += h[i + v[0]] * _[0], a += h[i + v[1]] * g[1], o += h[i + v[1]] * _[1], a += h[i + v[2]] * g[2], o += h[i + v[2]] * _[2], a += h[i + v[3]] * g[3], o += h[i + v[3]] * _[3], a += h[i + v[5]] * g[5], o += h[i + v[5]] * _[5], a += h[i + v[6]] * g[6], o += h[i + v[6]] * _[6], a += h[i + v[7]] * g[7], o += h[i + v[7]] * _[7], a += h[i + v[8]] * g[8], o += h[i + v[8]] * _[8];
		let c = y(l + (d * a + f * o) * p), u = i * 4;
		if (s) {
			let e = c - l;
			t[u] = y(m[u] + e), t[u + 1] = y(m[u + 1] + e), t[u + 2] = y(m[u + 2] + e), t[u + 3] = m[u + 3];
		} else t[u] = t[u + 1] = t[u + 2] = c, t[u + 3] = m[u + 3];
	}
	for (let e = 0; e < n; e++) {
		let i = e * 4, a = ((r - 1) * n + e) * 4;
		t[i] = m[i], t[i + 1] = m[i + 1], t[i + 2] = m[i + 2], t[i + 3] = m[i + 3], t[a] = m[a], t[a + 1] = m[a + 1], t[a + 2] = m[a + 2], t[a + 3] = m[a + 3];
	}
	for (let e = 1; e < r - 1; e++) {
		let r = e * n * 4, i = (e * n + (n - 1)) * 4;
		t[r] = m[r], t[r + 1] = m[r + 1], t[r + 2] = m[r + 2], t[r + 3] = m[r + 3], t[i] = m[i], t[i + 1] = m[i + 1], t[i + 2] = m[i + 2], t[i + 3] = m[i + 3];
	}
	return e;
};
P.addGetterSetter(I, "embossStrength", .5, N(), P.afterSetFilter), P.addGetterSetter(I, "embossWhiteLevel", .5, N(), P.afterSetFilter), P.addGetterSetter(I, "embossDirection", "top-left", void 0, P.afterSetFilter), P.addGetterSetter(I, "embossBlend", !1, void 0, P.afterSetFilter);
//#endregion
//#region node_modules/konva/lib/filters/Enhance.js
function Hi(e, t, n, r, i) {
	let a = n - t, o = i - r;
	if (a === 0) return r + o / 2;
	if (o === 0) return r;
	let s = (e - t) / a;
	return s = o * s + r, s;
}
var Ui = function(e) {
	let t = e.data, n = t.length, r = t[0], i = r, a, o = t[1], s = o, c, l = t[2], u = l, d, f = this.enhance();
	if (f === 0) return;
	for (let e = 0; e < n; e += 4) a = t[e + 0], a < r ? r = a : a > i && (i = a), c = t[e + 1], c < o ? o = c : c > s && (s = c), d = t[e + 2], d < l ? l = d : d > u && (u = d);
	i === r && (i = 255, r = 0), s === o && (s = 255, o = 0), u === l && (u = 255, l = 0);
	let p, m, h, g, _, v;
	if (f > 0) p = i + f * (255 - i), m = r - f * (r - 0), h = s + f * (255 - s), g = o - f * (o - 0), _ = u + f * (255 - u), v = l - f * (l - 0);
	else {
		let e = (i + r) * .5;
		p = i + f * (i - e), m = r + f * (r - e);
		let t = (s + o) * .5;
		h = s + f * (s - t), g = o + f * (o - t);
		let n = (u + l) * .5;
		_ = u + f * (u - n), v = l + f * (l - n);
	}
	for (let e = 0; e < n; e += 4) t[e + 0] = Hi(t[e + 0], r, i, m, p), t[e + 1] = Hi(t[e + 1], o, s, g, h), t[e + 2] = Hi(t[e + 2], l, u, v, _);
};
P.addGetterSetter(I, "enhance", 0, N(), P.afterSetFilter);
//#endregion
//#region node_modules/konva/lib/filters/Grayscale.js
var Wi = function(e) {
	let t = e.data, n = t.length;
	for (let e = 0; e < n; e += 4) {
		let n = .34 * t[e] + .5 * t[e + 1] + .16 * t[e + 2];
		t[e] = n, t[e + 1] = n, t[e + 2] = n;
	}
};
P.addGetterSetter(I, "hue", 0, N(), P.afterSetFilter), P.addGetterSetter(I, "saturation", 0, N(), P.afterSetFilter), P.addGetterSetter(I, "luminance", 0, N(), P.afterSetFilter);
var Gi = function(e) {
	let t = e.data, n = t.length, r = 2 ** this.saturation(), i = Math.abs(this.hue() + 360) % 360, a = this.luminance() * 127, o = 1 * r * Math.cos(i * Math.PI / 180), s = 1 * r * Math.sin(i * Math.PI / 180), c = .299 * 1 + .701 * o + .167 * s, l = .587 * 1 - .587 * o + .33 * s, u = .114 * 1 - .114 * o - .497 * s, d = .299 * 1 - .299 * o - .328 * s, f = .587 * 1 + .413 * o + .035 * s, p = .114 * 1 - .114 * o + .293 * s, m = .299 * 1 - .3 * o + 1.25 * s, h = .587 * 1 - .586 * o - 1.05 * s, g = .114 * 1 + .886 * o - .2 * s, _, v, y, b;
	for (let e = 0; e < n; e += 4) _ = t[e + 0], v = t[e + 1], y = t[e + 2], b = t[e + 3], t[e + 0] = c * _ + l * v + u * y + a, t[e + 1] = d * _ + f * v + p * y + a, t[e + 2] = m * _ + h * v + g * y + a, t[e + 3] = b;
}, Ki = function(e) {
	let t = e.data, n = t.length, r = 2 ** this.value(), i = 2 ** this.saturation(), a = Math.abs(this.hue() + 360) % 360, o = r * i * Math.cos(a * Math.PI / 180), s = r * i * Math.sin(a * Math.PI / 180), c = .299 * r + .701 * o + .167 * s, l = .587 * r - .587 * o + .33 * s, u = .114 * r - .114 * o - .497 * s, d = .299 * r - .299 * o - .328 * s, f = .587 * r + .413 * o + .035 * s, p = .114 * r - .114 * o + .293 * s, m = .299 * r - .3 * o + 1.25 * s, h = .587 * r - .586 * o - 1.05 * s, g = .114 * r + .886 * o - .2 * s;
	for (let e = 0; e < n; e += 4) {
		let n = t[e + 0], r = t[e + 1], i = t[e + 2], a = t[e + 3];
		t[e + 0] = c * n + l * r + u * i, t[e + 1] = d * n + f * r + p * i, t[e + 2] = m * n + h * r + g * i, t[e + 3] = a;
	}
};
P.addGetterSetter(I, "hue", 0, N(), P.afterSetFilter), P.addGetterSetter(I, "saturation", 0, N(), P.afterSetFilter), P.addGetterSetter(I, "value", 0, N(), P.afterSetFilter);
//#endregion
//#region node_modules/konva/lib/filters/Invert.js
var qi = function(e) {
	let t = e.data, n = t.length;
	for (let e = 0; e < n; e += 4) t[e] = 255 - t[e], t[e + 1] = 255 - t[e + 1], t[e + 2] = 255 - t[e + 2];
}, Ji = function(e, t, n) {
	let r = e.data, i = t.data, a = e.width, o = e.height, s = n.polarCenterX || a / 2, c = n.polarCenterY || o / 2, l = Math.sqrt(s * s + c * c), u = a - s, d = o - c, f = Math.sqrt(u * u + d * d);
	l = f > l ? f : l;
	let p = o, m = a, h = 360 / m * Math.PI / 180;
	for (let e = 0; e < m; e += 1) {
		let t = Math.sin(e * h), n = Math.cos(e * h);
		for (let o = 0; o < p; o += 1) {
			u = Math.floor(s + l * o / p * n), d = Math.floor(c + l * o / p * t);
			let f = (d * a + u) * 4, m = r[f + 0], h = r[f + 1], g = r[f + 2], _ = r[f + 3];
			f = (e + o * a) * 4, i[f + 0] = m, i[f + 1] = h, i[f + 2] = g, i[f + 3] = _;
		}
	}
}, Yi = function(e, t, n) {
	let r = e.data, i = t.data, a = e.width, o = e.height, s = n.polarCenterX || a / 2, c = n.polarCenterY || o / 2, l = Math.sqrt(s * s + c * c), u = a - s, d = o - c, f = Math.sqrt(u * u + d * d);
	l = f > l ? f : l;
	let p = o, m = a, h = n.polarRotation || 0, g, _;
	for (u = 0; u < a; u += 1) for (d = 0; d < o; d += 1) {
		let e = u - s, t = d - c, n = Math.sqrt(e * e + t * t) * p / l, o = (Math.atan2(t, e) * 180 / Math.PI + 360 + h) % 360;
		o = o * m / 360, g = Math.floor(o), _ = Math.floor(n);
		let f = (_ * a + g) * 4, v = r[f + 0], y = r[f + 1], b = r[f + 2], x = r[f + 3];
		f = (d * a + u) * 4, i[f + 0] = v, i[f + 1] = y, i[f + 2] = b, i[f + 3] = x;
	}
}, Xi = function(e) {
	let t = e.width, n = e.height, r, i, a, o, s, c, l, u, d, f, p = Math.round(this.kaleidoscopePower()), m = Math.round(this.kaleidoscopeAngle()), h = Math.floor(m % 360 * t / 360);
	if (p < 1) return;
	let g = M.createCanvasElement();
	g.width = t, g.height = n;
	let _ = g.getContext("2d").getImageData(0, 0, t, n);
	M.releaseCanvas(g), Ji(e, _, {
		polarCenterX: t / 2,
		polarCenterY: n / 2
	});
	let v = t / 2 ** p;
	for (; v <= 8;) v *= 2, --p;
	v = Math.ceil(v);
	let y = v, b = 0, x = y, ee = 1;
	for (h + v > t && (b = y, x = 0, ee = -1), i = 0; i < n; i += 1) for (r = b; r !== x; r += ee) a = Math.round(r + h) % t, d = (t * i + a) * 4, s = _.data[d + 0], c = _.data[d + 1], l = _.data[d + 2], u = _.data[d + 3], f = (t * i + r) * 4, _.data[f + 0] = s, _.data[f + 1] = c, _.data[f + 2] = l, _.data[f + 3] = u;
	for (i = 0; i < n; i += 1) for (y = Math.floor(v), o = 0; o < p; o += 1) {
		for (r = 0; r < y + 1; r += 1) d = (t * i + r) * 4, s = _.data[d + 0], c = _.data[d + 1], l = _.data[d + 2], u = _.data[d + 3], f = (t * i + y * 2 - r - 1) * 4, _.data[f + 0] = s, _.data[f + 1] = c, _.data[f + 2] = l, _.data[f + 3] = u;
		y *= 2;
	}
	Yi(_, e, { polarRotation: 0 });
};
P.addGetterSetter(I, "kaleidoscopePower", 2, N(), P.afterSetFilter), P.addGetterSetter(I, "kaleidoscopeAngle", 0, N(), P.afterSetFilter);
//#endregion
//#region node_modules/konva/lib/filters/Mask.js
function Zi(e, t, n) {
	let r = (n * e.width + t) * 4, i = [];
	return i.push(e.data[r++], e.data[r++], e.data[r++], e.data[r++]), i;
}
function Qi(e, t) {
	return Math.sqrt((e[0] - t[0]) ** 2 + (e[1] - t[1]) ** 2 + (e[2] - t[2]) ** 2);
}
function $i(e) {
	let t = [
		0,
		0,
		0
	];
	for (let n = 0; n < e.length; n++) t[0] += e[n][0], t[1] += e[n][1], t[2] += e[n][2];
	return t[0] /= e.length, t[1] /= e.length, t[2] /= e.length, t;
}
function ea(e, t) {
	let n = Zi(e, 0, 0), r = Zi(e, e.width - 1, 0), i = Zi(e, 0, e.height - 1), a = Zi(e, e.width - 1, e.height - 1), o = t || 10;
	if (Qi(n, r) < o && Qi(r, a) < o && Qi(a, i) < o && Qi(i, n) < o) {
		let t = $i([
			r,
			n,
			a,
			i
		]), s = [];
		for (let n = 0; n < e.width * e.height; n++) s[n] = Qi(t, [
			e.data[n * 4],
			e.data[n * 4 + 1],
			e.data[n * 4 + 2]
		]) < o ? 0 : 255;
		return s;
	}
}
function ta(e, t) {
	for (let n = 0; n < e.width * e.height; n++) e.data[4 * n + 3] = t[n];
}
function na(e, t, n) {
	let r = [
		1,
		1,
		1,
		1,
		0,
		1,
		1,
		1,
		1
	], i = Math.round(Math.sqrt(r.length)), a = Math.floor(i / 2), o = [];
	for (let s = 0; s < n; s++) for (let c = 0; c < t; c++) {
		let l = s * t + c, u = 0;
		for (let o = 0; o < i; o++) for (let l = 0; l < i; l++) {
			let d = s + o - a, f = c + l - a;
			if (d >= 0 && d < n && f >= 0 && f < t) {
				let n = d * t + f, a = r[o * i + l];
				u += e[n] * a;
			}
		}
		o[l] = u === 2040 ? 255 : 0;
	}
	return o;
}
function ra(e, t, n) {
	let r = [
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1
	], i = Math.round(Math.sqrt(r.length)), a = Math.floor(i / 2), o = [];
	for (let s = 0; s < n; s++) for (let c = 0; c < t; c++) {
		let l = s * t + c, u = 0;
		for (let o = 0; o < i; o++) for (let l = 0; l < i; l++) {
			let d = s + o - a, f = c + l - a;
			if (d >= 0 && d < n && f >= 0 && f < t) {
				let n = d * t + f, a = r[o * i + l];
				u += e[n] * a;
			}
		}
		o[l] = u >= 1020 ? 255 : 0;
	}
	return o;
}
function ia(e, t, n) {
	let r = [
		1 / 9,
		1 / 9,
		1 / 9,
		1 / 9,
		1 / 9,
		1 / 9,
		1 / 9,
		1 / 9,
		1 / 9
	], i = Math.round(Math.sqrt(r.length)), a = Math.floor(i / 2), o = [];
	for (let s = 0; s < n; s++) for (let c = 0; c < t; c++) {
		let l = s * t + c, u = 0;
		for (let o = 0; o < i; o++) for (let l = 0; l < i; l++) {
			let d = s + o - a, f = c + l - a;
			if (d >= 0 && d < n && f >= 0 && f < t) {
				let n = d * t + f, a = r[o * i + l];
				u += e[n] * a;
			}
		}
		o[l] = u;
	}
	return o;
}
var aa = function(e) {
	let t = ea(e, this.threshold());
	return t && (t = na(t, e.width, e.height), t = ra(t, e.width, e.height), t = ia(t, e.width, e.height), ta(e, t)), e;
};
P.addGetterSetter(I, "threshold", 0, N(), P.afterSetFilter);
//#endregion
//#region node_modules/konva/lib/filters/Noise.js
var oa = function(e) {
	let t = this.noise() * 255, n = e.data, r = n.length, i = t / 2;
	for (let e = 0; e < r; e += 4) n[e + 0] += i - 2 * i * Math.random(), n[e + 1] += i - 2 * i * Math.random(), n[e + 2] += i - 2 * i * Math.random();
};
P.addGetterSetter(I, "noise", .2, N(), P.afterSetFilter);
//#endregion
//#region node_modules/konva/lib/filters/Pixelate.js
var sa = function(e) {
	let t = Math.ceil(this.pixelSize()), n = e.width, r = e.height, i = Math.ceil(n / t), a = Math.ceil(r / t), o = e.data;
	if (t <= 0) {
		M.error("pixelSize value can not be <= 0");
		return;
	}
	for (let e = 0; e < i; e += 1) for (let i = 0; i < a; i += 1) {
		let a = 0, s = 0, c = 0, l = 0, u = e * t, d = u + t, f = i * t, p = f + t, m = 0;
		for (let e = u; e < d; e += 1) if (!(e >= n)) for (let t = f; t < p; t += 1) {
			if (t >= r) continue;
			let i = (n * t + e) * 4;
			a += o[i + 0], s += o[i + 1], c += o[i + 2], l += o[i + 3], m += 1;
		}
		a /= m, s /= m, c /= m, l /= m;
		for (let e = u; e < d; e += 1) if (!(e >= n)) for (let t = f; t < p; t += 1) {
			if (t >= r) continue;
			let i = (n * t + e) * 4;
			o[i + 0] = a, o[i + 1] = s, o[i + 2] = c, o[i + 3] = l;
		}
	}
};
P.addGetterSetter(I, "pixelSize", 8, N(), P.afterSetFilter);
//#endregion
//#region node_modules/konva/lib/filters/Posterize.js
var ca = function(e) {
	let t = Math.round(this.levels() * 254) + 1, n = e.data, r = n.length, i = 255 / t;
	for (let e = 0; e < r; e += 1) n[e] = Math.floor(n[e] / i) * i;
};
P.addGetterSetter(I, "levels", .5, N(), P.afterSetFilter);
//#endregion
//#region node_modules/konva/lib/filters/RGB.js
var la = function(e) {
	let t = e.data, n = t.length, r = this.red(), i = this.green(), a = this.blue();
	for (let e = 0; e < n; e += 4) {
		let n = (.34 * t[e] + .5 * t[e + 1] + .16 * t[e + 2]) / 255;
		t[e] = n * r, t[e + 1] = n * i, t[e + 2] = n * a, t[e + 3] = t[e + 3];
	}
};
P.addGetterSetter(I, "red", 0, function(e) {
	return this._filterUpToDate = !1, e > 255 ? 255 : e < 0 ? 0 : Math.round(e);
}), P.addGetterSetter(I, "green", 0, function(e) {
	return this._filterUpToDate = !1, e > 255 ? 255 : e < 0 ? 0 : Math.round(e);
}), P.addGetterSetter(I, "blue", 0, Ze, P.afterSetFilter);
//#endregion
//#region node_modules/konva/lib/filters/RGBA.js
var ua = function(e) {
	let t = e.data, n = t.length, r = this.red(), i = this.green(), a = this.blue(), o = this.alpha();
	for (let e = 0; e < n; e += 4) {
		let n = 1 - o;
		t[e] = r * o + t[e] * n, t[e + 1] = i * o + t[e + 1] * n, t[e + 2] = a * o + t[e + 2] * n;
	}
};
P.addGetterSetter(I, "red", 0, function(e) {
	return this._filterUpToDate = !1, e > 255 ? 255 : e < 0 ? 0 : Math.round(e);
}), P.addGetterSetter(I, "green", 0, function(e) {
	return this._filterUpToDate = !1, e > 255 ? 255 : e < 0 ? 0 : Math.round(e);
}), P.addGetterSetter(I, "blue", 0, Ze, P.afterSetFilter), P.addGetterSetter(I, "alpha", 1, function(e) {
	return this._filterUpToDate = !1, e > 1 ? 1 : e < 0 ? 0 : e;
});
//#endregion
//#region node_modules/konva/lib/filters/Sepia.js
var da = function(e) {
	let t = e.data, n = t.length;
	for (let e = 0; e < n; e += 4) {
		let n = t[e + 0], r = t[e + 1], i = t[e + 2];
		t[e + 0] = Math.min(255, n * .393 + r * .769 + i * .189), t[e + 1] = Math.min(255, n * .349 + r * .686 + i * .168), t[e + 2] = Math.min(255, n * .272 + r * .534 + i * .131);
	}
}, fa = function(e) {
	let t = e.data;
	for (let e = 0; e < t.length; e += 4) {
		let n = t[e], r = t[e + 1], i = t[e + 2];
		.2126 * n + .7152 * r + .0722 * i >= 128 && (t[e] = 255 - n, t[e + 1] = 255 - r, t[e + 2] = 255 - i);
	}
	return e;
}, pa = function(e) {
	let t = this.threshold() * 255, n = e.data, r = n.length;
	for (let e = 0; e < r; e += 1) n[e] = n[e] < t ? 0 : 255;
};
P.addGetterSetter(I, "threshold", .5, N(), P.afterSetFilter);
//#endregion
//#region node_modules/konva/lib/index.js
var ma = nr.Util._assign(nr, {
	Arc: rr,
	Arrow: _r,
	Circle: R,
	Ellipse: z,
	Image: vr,
	Label: Dr,
	Tag: Or,
	Line: sr,
	Path: gr,
	Rect: kr,
	RegularPolygon: Ar,
	Ring: Mr,
	Sprite: B,
	Star: Nr,
	Text: V,
	TextPath: _i,
	Transformer: H,
	Wedge: Mi,
	Filters: {
		Blur: Li,
		Brightness: zi,
		Brighten: Ri,
		Contrast: Bi,
		Emboss: Vi,
		Enhance: Ui,
		Grayscale: Wi,
		HSL: Gi,
		HSV: Ki,
		Invert: qi,
		Kaleidoscope: Xi,
		Mask: aa,
		Noise: oa,
		Pixelate: sa,
		Posterize: ca,
		RGB: la,
		RGBA: ua,
		Sepia: da,
		Solarize: fa,
		Threshold: pa
	}
}), ha = nr, ga = /* @__PURE__ */ t(((e, t) => {
	t.exports = function(e) {
		function t(e, t, n, r) {
			return new pa(e, t, n, r);
		}
		function n() {}
		function a(e) {
			var t = "https://react.dev/errors/" + e;
			if (1 < arguments.length) {
				t += "?args[]=" + encodeURIComponent(arguments[1]);
				for (var n = 2; n < arguments.length; n++) t += "&args[]=" + encodeURIComponent(arguments[n]);
			}
			return "Minified React error #" + e + "; visit " + t + " for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";
		}
		function o(e) {
			var t = e, n = e;
			if (e.alternate) for (; t.return;) t = t.return;
			else {
				e = t;
				do
					t = e, t.flags & 4098 && (n = t.return), e = t.return;
				while (e);
			}
			return t.tag === 3 ? n : null;
		}
		function s(e) {
			if (o(e) !== e) throw Error(a(188));
		}
		function c(e) {
			var t = e.alternate;
			if (!t) {
				if (t = o(e), t === null) throw Error(a(188));
				return t === e ? e : null;
			}
			for (var n = e, r = t;;) {
				var i = n.return;
				if (i === null) break;
				var c = i.alternate;
				if (c === null) {
					if (r = i.return, r !== null) {
						n = r;
						continue;
					}
					break;
				}
				if (i.child === c.child) {
					for (c = i.child; c;) {
						if (c === n) return s(i), e;
						if (c === r) return s(i), t;
						c = c.sibling;
					}
					throw Error(a(188));
				}
				if (n.return !== r.return) n = i, r = c;
				else {
					for (var l = !1, u = i.child; u;) {
						if (u === n) {
							l = !0, n = i, r = c;
							break;
						}
						if (u === r) {
							l = !0, r = i, n = c;
							break;
						}
						u = u.sibling;
					}
					if (!l) {
						for (u = c.child; u;) {
							if (u === n) {
								l = !0, n = c, r = i;
								break;
							}
							if (u === r) {
								l = !0, r = c, n = i;
								break;
							}
							u = u.sibling;
						}
						if (!l) throw Error(a(189));
					}
				}
				if (n.alternate !== r) throw Error(a(190));
			}
			if (n.tag !== 3) throw Error(a(188));
			return n.stateNode.current === n ? e : t;
		}
		function l(e) {
			var t = e.tag;
			if (t === 5 || t === 26 || t === 27 || t === 6) return e;
			for (e = e.child; e !== null;) {
				if (t = l(e), t !== null) return t;
				e = e.sibling;
			}
			return null;
		}
		function u(e) {
			var t = e.tag;
			if (t === 5 || t === 26 || t === 27 || t === 6) return e;
			for (e = e.child; e !== null;) {
				if (e.tag !== 4 && (t = u(e), t !== null)) return t;
				e = e.sibling;
			}
			return null;
		}
		function d(e) {
			return typeof e != "object" || !e ? null : (e = Ja && e[Ja] || e["@@iterator"], typeof e == "function" ? e : null);
		}
		function f(e) {
			if (e == null) return null;
			if (typeof e == "function") return e.$$typeof === Ya ? null : e.displayName || e.name || null;
			if (typeof e == "string") return e;
			switch (e) {
				case Ia: return "Fragment";
				case Ra: return "Profiler";
				case La: return "StrictMode";
				case Ha: return "Suspense";
				case Ua: return "SuspenseList";
				case Ka: return "Activity";
			}
			if (typeof e == "object") switch (e.$$typeof) {
				case Fa: return "Portal";
				case Ba: return e.displayName || "Context";
				case za: return (e._context.displayName || "Context") + ".Consumer";
				case Va:
					var t = e.render;
					return e = e.displayName, e ||= (e = t.displayName || t.name || "", e === "" ? "ForwardRef" : "ForwardRef(" + e + ")"), e;
				case Wa: return t = e.displayName || null, t === null ? f(e.type) || "Memo" : t;
				case Ga:
					t = e._payload, e = e._init;
					try {
						return f(e(t));
					} catch {}
			}
			return null;
		}
		function p(e) {
			return { current: e };
		}
		function m(e) {
			0 > hc || (e.current = mc[hc], mc[hc] = null, hc--);
		}
		function h(e, t) {
			hc++, mc[hc] = e.current, e.current = t;
		}
		function g(e) {
			return e >>>= 0, e === 0 ? 32 : 31 - (vc(e) / yc | 0) | 0;
		}
		function _(e) {
			var t = e & 42;
			if (t !== 0) return t;
			switch (e & -e) {
				case 1: return 1;
				case 2: return 2;
				case 4: return 4;
				case 8: return 8;
				case 16: return 16;
				case 32: return 32;
				case 64: return 64;
				case 128: return 128;
				case 256:
				case 512:
				case 1024:
				case 2048:
				case 4096:
				case 8192:
				case 16384:
				case 32768:
				case 65536:
				case 131072: return e & 261888;
				case 262144:
				case 524288:
				case 1048576:
				case 2097152: return e & 3932160;
				case 4194304:
				case 8388608:
				case 16777216:
				case 33554432: return e & 62914560;
				case 67108864: return 67108864;
				case 134217728: return 134217728;
				case 268435456: return 268435456;
				case 536870912: return 536870912;
				case 1073741824: return 0;
				default: return e;
			}
		}
		function v(e, t, n) {
			var r = e.pendingLanes;
			if (r === 0) return 0;
			var i = 0, a = e.suspendedLanes, o = e.pingedLanes;
			e = e.warmLanes;
			var s = r & 134217727;
			return s === 0 ? (s = r & ~a, s === 0 ? o === 0 ? n || (n = r & ~e, n !== 0 && (i = _(n))) : i = _(o) : i = _(s)) : (r = s & ~a, r === 0 ? (o &= s, o === 0 ? n || (n = s & ~e, n !== 0 && (i = _(n))) : i = _(o)) : i = _(r)), i === 0 ? 0 : t !== 0 && t !== i && (t & a) === 0 && (a = i & -i, n = t & -t, a >= n || a === 32 && n & 4194048) ? t : i;
		}
		function y(e, t) {
			return (e.pendingLanes & ~(e.suspendedLanes & ~e.pingedLanes) & t) === 0;
		}
		function b(e, t) {
			switch (e) {
				case 1:
				case 2:
				case 4:
				case 8:
				case 64: return t + 250;
				case 16:
				case 32:
				case 128:
				case 256:
				case 512:
				case 1024:
				case 2048:
				case 4096:
				case 8192:
				case 16384:
				case 32768:
				case 65536:
				case 131072:
				case 262144:
				case 524288:
				case 1048576:
				case 2097152: return t + 5e3;
				case 4194304:
				case 8388608:
				case 16777216:
				case 33554432: return -1;
				case 67108864:
				case 134217728:
				case 268435456:
				case 536870912:
				case 1073741824: return -1;
				default: return -1;
			}
		}
		function x() {
			var e = Sc;
			return Sc <<= 1, !(Sc & 62914560) && (Sc = 4194304), e;
		}
		function ee(e) {
			for (var t = [], n = 0; 31 > n; n++) t.push(e);
			return t;
		}
		function S(e, t) {
			e.pendingLanes |= t, t !== 268435456 && (e.suspendedLanes = 0, e.pingedLanes = 0, e.warmLanes = 0);
		}
		function te(e, t, n, r, i, a) {
			var o = e.pendingLanes;
			e.pendingLanes = n, e.suspendedLanes = 0, e.pingedLanes = 0, e.warmLanes = 0, e.expiredLanes &= n, e.entangledLanes &= n, e.errorRecoveryDisabledLanes &= n, e.shellSuspendCounter = 0;
			var s = e.entanglements, c = e.expirationTimes, l = e.hiddenUpdates;
			for (n = o & ~n; 0 < n;) {
				var u = 31 - _c(n), d = 1 << u;
				s[u] = 0, c[u] = -1;
				var f = l[u];
				if (f !== null) for (l[u] = null, u = 0; u < f.length; u++) {
					var p = f[u];
					p !== null && (p.lane &= -536870913);
				}
				n &= ~d;
			}
			r !== 0 && ne(e, r, 0), a !== 0 && i === 0 && e.tag !== 0 && (e.suspendedLanes |= a & ~(o & ~t));
		}
		function ne(e, t, n) {
			e.pendingLanes |= t, e.suspendedLanes &= ~t;
			var r = 31 - _c(t);
			e.entangledLanes |= t, e.entanglements[r] = e.entanglements[r] | 1073741824 | n & 261930;
		}
		function C(e, t) {
			var n = e.entangledLanes |= t;
			for (e = e.entanglements; n;) {
				var r = 31 - _c(n), i = 1 << r;
				i & t | e[r] & t && (e[r] |= t), n &= ~i;
			}
		}
		function w(e, t) {
			var n = t & -t;
			return n = n & 42 ? 1 : T(n), (n & (e.suspendedLanes | t)) === 0 ? n : 0;
		}
		function T(e) {
			switch (e) {
				case 2:
					e = 1;
					break;
				case 8:
					e = 4;
					break;
				case 32:
					e = 16;
					break;
				case 256:
				case 512:
				case 1024:
				case 2048:
				case 4096:
				case 8192:
				case 16384:
				case 32768:
				case 65536:
				case 131072:
				case 262144:
				case 524288:
				case 1048576:
				case 2097152:
				case 4194304:
				case 8388608:
				case 16777216:
				case 33554432:
					e = 128;
					break;
				case 268435456:
					e = 134217728;
					break;
				default: e = 0;
			}
			return e;
		}
		function re(e) {
			return e &= -e, 2 < e ? 8 < e ? e & 134217727 ? 32 : 268435456 : 8 : 2;
		}
		function E(e) {
			if (typeof Mc == "function" && Nc(e), Fc && typeof Fc.setStrictMode == "function") try {
				Fc.setStrictMode(Pc, e);
			} catch {}
		}
		function ie(e, t) {
			return e === t && (e !== 0 || 1 / e == 1 / t) || e !== e && t !== t;
		}
		function ae(e) {
			if (zc === void 0) try {
				throw Error();
			} catch (e) {
				var t = e.stack.trim().match(/\n( *(at )?)/);
				zc = t && t[1] || "", Bc = -1 < e.stack.indexOf("\n    at") ? " (<anonymous>)" : -1 < e.stack.indexOf("@") ? "@unknown:0:0" : "";
			}
			return "\n" + zc + e + Bc;
		}
		function D(e, t) {
			if (!e || Vc) return "";
			Vc = !0;
			var n = Error.prepareStackTrace;
			Error.prepareStackTrace = void 0;
			try {
				var r = { DetermineComponentFrameRoot: function() {
					try {
						if (t) {
							var n = function() {
								throw Error();
							};
							if (Object.defineProperty(n.prototype, "props", { set: function() {
								throw Error();
							} }), typeof Reflect == "object" && Reflect.construct) {
								try {
									Reflect.construct(n, []);
								} catch (e) {
									var r = e;
								}
								Reflect.construct(e, [], n);
							} else {
								try {
									n.call();
								} catch (e) {
									r = e;
								}
								e.call(n.prototype);
							}
						} else {
							try {
								throw Error();
							} catch (e) {
								r = e;
							}
							(n = e()) && typeof n.catch == "function" && n.catch(function() {});
						}
					} catch (e) {
						if (e && r && typeof e.stack == "string") return [e.stack, r.stack];
					}
					return [null, null];
				} };
				r.DetermineComponentFrameRoot.displayName = "DetermineComponentFrameRoot";
				var i = Object.getOwnPropertyDescriptor(r.DetermineComponentFrameRoot, "name");
				i && i.configurable && Object.defineProperty(r.DetermineComponentFrameRoot, "name", { value: "DetermineComponentFrameRoot" });
				var a = r.DetermineComponentFrameRoot(), o = a[0], s = a[1];
				if (o && s) {
					var c = o.split("\n"), l = s.split("\n");
					for (i = r = 0; r < c.length && !c[r].includes("DetermineComponentFrameRoot");) r++;
					for (; i < l.length && !l[i].includes("DetermineComponentFrameRoot");) i++;
					if (r === c.length || i === l.length) for (r = c.length - 1, i = l.length - 1; 1 <= r && 0 <= i && c[r] !== l[i];) i--;
					for (; 1 <= r && 0 <= i; r--, i--) if (c[r] !== l[i]) {
						if (r !== 1 || i !== 1) do
							if (r--, i--, 0 > i || c[r] !== l[i]) {
								var u = "\n" + c[r].replace(" at new ", " at ");
								return e.displayName && u.includes("<anonymous>") && (u = u.replace("<anonymous>", e.displayName)), u;
							}
						while (1 <= r && 0 <= i);
						break;
					}
				}
			} finally {
				Vc = !1, Error.prepareStackTrace = n;
			}
			return (n = e ? e.displayName || e.name : "") ? ae(n) : "";
		}
		function O(e, t) {
			switch (e.tag) {
				case 26:
				case 27:
				case 5: return ae(e.type);
				case 16: return ae("Lazy");
				case 13: return e.child !== t && t !== null ? ae("Suspense Fallback") : ae("Suspense");
				case 19: return ae("SuspenseList");
				case 0:
				case 15: return D(e.type, !1);
				case 11: return D(e.type.render, !1);
				case 1: return D(e.type, !0);
				case 31: return ae("Activity");
				default: return "";
			}
		}
		function oe(e) {
			try {
				var t = "", n = null;
				do
					t += O(e, n), n = e, e = e.return;
				while (e);
				return t;
			} catch (e) {
				return "\nError generating stack: " + e.message + "\n" + e.stack;
			}
		}
		function k(e, t) {
			if (typeof e == "object" && e) {
				var n = Hc.get(e);
				return n === void 0 ? (t = {
					value: e,
					source: t,
					stack: oe(t)
				}, Hc.set(e, t), t) : n;
			}
			return {
				value: e,
				source: t,
				stack: oe(t)
			};
		}
		function A(e, t) {
			Uc[Wc++] = G, Uc[Wc++] = Gc, Gc = e, G = t;
		}
		function se(e, t, n) {
			Kc[qc++] = Yc, Kc[qc++] = Xc, Kc[qc++] = Jc, Jc = e;
			var r = Yc;
			e = Xc;
			var i = 32 - _c(r) - 1;
			r &= ~(1 << i), n += 1;
			var a = 32 - _c(t) + i;
			if (30 < a) {
				var o = i - i % 5;
				a = (r & (1 << o) - 1).toString(32), r >>= o, i -= o, Yc = 1 << 32 - _c(t) + i | n << i | r, Xc = a + e;
			} else Yc = 1 << a | n << i | r, Xc = e;
		}
		function ce(e) {
			e.return !== null && (A(e, 1), se(e, 1, 0));
		}
		function le(e) {
			for (; e === Gc;) Gc = Uc[--Wc], Uc[Wc] = null, G = Uc[--Wc], Uc[Wc] = null;
			for (; e === Jc;) Jc = Kc[--qc], Kc[qc] = null, Xc = Kc[--qc], Kc[qc] = null, Yc = Kc[--qc], Kc[qc] = null;
		}
		function ue(e, t) {
			Kc[qc++] = Yc, Kc[qc++] = Xc, Kc[qc++] = Jc, Yc = t.id, Xc = t.overflow, Jc = e;
		}
		function de(e, t) {
			h($c, t), h(Qc, e), h(Zc, null), e = to(t), m(Zc), h(Zc, e);
		}
		function fe() {
			m(Zc), m(Qc), m($c);
		}
		function pe(e) {
			e.memoizedState !== null && h(el, e);
			var t = Zc.current, n = no(t, e.type);
			t !== n && (h(Qc, e), h(Zc, n));
		}
		function me(e) {
			Qc.current === e && (m(Zc), m(Qc)), el.current === e && (m(el), mo ? No._currentValue = Mo : No._currentValue2 = Mo);
		}
		function he(e) {
			throw be(k(Error(a(418, 1 < arguments.length && arguments[1] !== void 0 && arguments[1] ? "text" : "HTML", "")), e)), ol;
		}
		function ge(e, t) {
			if (!_o) throw Error(a(175));
			ks(e.stateNode, e.type, e.memoizedProps, t, e) || he(e, !0);
		}
		function j(e) {
			for (tl = e.return; tl;) switch (tl.tag) {
				case 5:
				case 31:
				case 13:
					al = !1;
					return;
				case 27:
				case 3:
					al = !0;
					return;
				default: tl = tl.return;
			}
		}
		function _e(e) {
			if (!_o || e !== tl) return !1;
			if (!rl) return j(e), rl = !0, !1;
			var t = e.tag;
			if (cc ? t !== 3 && t !== 27 && (t !== 5 || Gs(e.type) && !co(e.type, e.memoizedProps)) && nl && he(e) : t !== 3 && (t !== 5 || Gs(e.type) && !co(e.type, e.memoizedProps)) && nl && he(e), j(e), t === 13) {
				if (!_o) throw Error(a(316));
				if (e = e.memoizedState, e = e === null ? null : e.dehydrated, !e) throw Error(a(317));
				nl = Ps(e);
			} else if (t === 31) {
				if (e = e.memoizedState, e = e === null ? null : e.dehydrated, !e) throw Error(a(317));
				nl = Ns(e);
			} else nl = cc && t === 27 ? W(e.type, nl) : tl ? ys(e.stateNode) : null;
			return !0;
		}
		function ve() {
			_o && (nl = tl = null, rl = !1);
		}
		function ye() {
			var e = il;
			return e !== null && (Uu === null ? Uu = e : Uu.push.apply(Uu, e), il = null), e;
		}
		function be(e) {
			il === null ? il = [e] : il.push(e);
		}
		function xe(e, t, n) {
			mo ? (h(sl, t._currentValue), t._currentValue = n) : (h(sl, t._currentValue2), t._currentValue2 = n);
		}
		function Se(e) {
			var t = sl.current;
			mo ? e._currentValue = t : e._currentValue2 = t, m(sl);
		}
		function Ce(e, t, n) {
			for (; e !== null;) {
				var r = e.alternate;
				if ((e.childLanes & t) === t ? r !== null && (r.childLanes & t) !== t && (r.childLanes |= t) : (e.childLanes |= t, r !== null && (r.childLanes |= t)), e === n) break;
				e = e.return;
			}
		}
		function we(e, t, n, r) {
			var i = e.child;
			for (i !== null && (i.return = e); i !== null;) {
				var o = i.dependencies;
				if (o !== null) {
					var s = i.child;
					o = o.firstContext;
					a: for (; o !== null;) {
						var c = o;
						o = i;
						for (var l = 0; l < t.length; l++) if (c.context === t[l]) {
							o.lanes |= n, c = o.alternate, c !== null && (c.lanes |= n), Ce(o.return, n, e), r || (s = null);
							break a;
						}
						o = c.next;
					}
				} else if (i.tag === 18) {
					if (s = i.return, s === null) throw Error(a(341));
					s.lanes |= n, o = s.alternate, o !== null && (o.lanes |= n), Ce(s, n, e), s = null;
				} else s = i.child;
				if (s !== null) s.return = i;
				else for (s = i; s !== null;) {
					if (s === e) {
						s = null;
						break;
					}
					if (i = s.sibling, i !== null) {
						i.return = s.return, s = i;
						break;
					}
					s = s.return;
				}
				i = s;
			}
		}
		function Te(e, t, n, r) {
			e = null;
			for (var i = t, o = !1; i !== null;) {
				if (!o) {
					if (i.flags & 524288) o = !0;
					else if (i.flags & 262144) break;
				}
				if (i.tag === 10) {
					var s = i.alternate;
					if (s === null) throw Error(a(387));
					if (s = s.memoizedProps, s !== null) {
						var c = i.type;
						Ic(i.pendingProps.value, s.value) || (e === null ? e = [c] : e.push(c));
					}
				} else if (i === el.current) {
					if (s = i.alternate, s === null) throw Error(a(387));
					s.memoizedState.memoizedState !== i.memoizedState.memoizedState && (e === null ? e = [No] : e.push(No));
				}
				i = i.return;
			}
			e !== null && we(t, e, n, r), t.flags |= 262144;
		}
		function Ee(e) {
			for (e = e.firstContext; e !== null;) {
				var t = e.context;
				if (!Ic(mo ? t._currentValue : t._currentValue2, e.memoizedValue)) return !0;
				e = e.next;
			}
			return !1;
		}
		function M(e) {
			cl = e, ll = null, e = e.dependencies, e !== null && (e.firstContext = null);
		}
		function De(e) {
			return ke(cl, e);
		}
		function Oe(e, t) {
			return cl === null && M(e), ke(e, t);
		}
		function ke(e, t) {
			var n = mo ? t._currentValue : t._currentValue2;
			if (t = {
				context: t,
				memoizedValue: n,
				next: null
			}, ll === null) {
				if (e === null) throw Error(a(308));
				ll = t, e.dependencies = {
					lanes: 0,
					firstContext: t
				}, e.flags |= 524288;
			} else ll = ll.next = t;
			return n;
		}
		function Ae() {
			return {
				controller: new ul(),
				data: /* @__PURE__ */ new Map(),
				refCount: 0
			};
		}
		function je(e) {
			e.refCount--, e.refCount === 0 && dl(fl, function() {
				e.controller.abort();
			});
		}
		function Me() {}
		function Ne(e) {
			e !== hl && e.next === null && (hl === null ? ml = hl = e : hl = hl.next = e), _l = !0, gl || (gl = !0, Be());
		}
		function Pe(e, t) {
			if (!vl && _l) {
				vl = !0;
				do
					for (var n = !1, r = ml; r !== null;) {
						if (!t) if (e !== 0) {
							var i = r.pendingLanes;
							if (i === 0) var a = 0;
							else {
								var o = r.suspendedLanes, s = r.pingedLanes;
								a = (1 << 31 - _c(42 | e) + 1) - 1, a &= i & ~(o & ~s), a = a & 201326741 ? a & 201326741 | 1 : a ? a | 2 : 0;
							}
							a !== 0 && (n = !0, ze(r, a));
						} else a = ku, a = v(r, r === Du ? a : 0, r.cancelPendingCommit !== null || r.timeoutHandle !== po), !(a & 3) || y(r, a) || (n = !0, ze(r, a));
						r = r.next;
					}
				while (n);
				vl = !1;
			}
		}
		function Fe() {
			Ie();
		}
		function Ie() {
			_l = gl = !1;
			var e = 0;
			yl !== 0 && Co() && (e = yl);
			for (var t = Dc(), n = null, r = ml; r !== null;) {
				var i = r.next, a = Le(r, t);
				a === 0 ? (r.next = null, n === null ? ml = i : n.next = i, i === null && (hl = n)) : (n = r, (e !== 0 || a & 3) && (_l = !0)), r = i;
			}
			Xu !== 0 && Xu !== 5 || Pe(e, !1), yl !== 0 && (yl = 0);
		}
		function Le(e, t) {
			for (var n = e.suspendedLanes, r = e.pingedLanes, i = e.expirationTimes, a = e.pendingLanes & -62914561; 0 < a;) {
				var o = 31 - _c(a), s = 1 << o, c = i[o];
				c === -1 ? ((s & n) === 0 || (s & r) !== 0) && (i[o] = b(s, t)) : c <= t && (e.expiredLanes |= s), a &= ~s;
			}
			if (t = Du, n = ku, n = v(e, e === t ? n : 0, e.cancelPendingCommit !== null || e.timeoutHandle !== po), r = e.callbackNode, n === 0 || e === t && (Au === 2 || Au === 9) || e.cancelPendingCommit !== null) return r !== null && r !== null && wc(r), e.callbackNode = null, e.callbackPriority = 0;
			if (!(n & 3) || y(e, n)) {
				if (t = n & -n, t === e.callbackPriority) return t;
				switch (r !== null && wc(r), re(n)) {
					case 2:
					case 8:
						n = kc;
						break;
					case 32:
						n = Ac;
						break;
					case 268435456:
						n = jc;
						break;
					default: n = Ac;
				}
				return r = Re.bind(null, e), n = Cc(n, r), e.callbackPriority = t, e.callbackNode = n, t;
			}
			return r !== null && r !== null && wc(r), e.callbackPriority = 2, e.callbackNode = null, 2;
		}
		function Re(e, t) {
			if (Xu !== 0 && Xu !== 5) return e.callbackNode = null, e.callbackPriority = 0, null;
			var n = e.callbackNode;
			if (ra() && e.callbackNode !== n) return null;
			var r = ku;
			return r = v(e, e === Du ? r : 0, e.cancelPendingCommit !== null || e.timeoutHandle !== po), r === 0 ? null : (ji(e, r, t), Le(e, Dc()), e.callbackNode != null && e.callbackNode === n ? Re.bind(null, e) : null);
		}
		function ze(e, t) {
			if (ra()) return null;
			ji(e, t, !0);
		}
		function Be() {
			Fo ? Io(function() {
				Eu & 6 ? Cc(Oc, Fe) : Ie();
			}) : Cc(Oc, Fe);
		}
		function Ve() {
			if (yl === 0) {
				var e = Sl;
				e === 0 && (e = bc, bc <<= 1, !(bc & 261888) && (bc = 256)), yl = e;
			}
			return yl;
		}
		function He(e, t) {
			if (bl === null) {
				var n = bl = [];
				xl = 0, Sl = Ve(), Cl = {
					status: "pending",
					value: void 0,
					then: function(e) {
						n.push(e);
					}
				};
			}
			return xl++, t.then(Ue, Ue), t;
		}
		function Ue() {
			if (--xl === 0 && bl !== null) {
				Cl !== null && (Cl.status = "fulfilled");
				var e = bl;
				bl = null, Sl = 0, Cl = null;
				for (var t = 0; t < e.length; t++) (0, e[t])();
			}
		}
		function We(e, t) {
			var n = [], r = {
				status: "pending",
				value: null,
				reason: null,
				then: function(e) {
					n.push(e);
				}
			};
			return e.then(function() {
				r.status = "fulfilled", r.value = t;
				for (var e = 0; e < n.length; e++) (0, n[e])(t);
			}, function(e) {
				for (r.status = "rejected", r.reason = e, e = 0; e < n.length; e++) (0, n[e])(void 0);
			}), r;
		}
		function Ge() {
			var e = Tl.current;
			return e === null ? Du.pooledCache : e;
		}
		function Ke(e, t) {
			t === null ? h(Tl, Tl.current) : h(Tl, t.pool);
		}
		function qe() {
			var e = Ge();
			return e === null ? null : {
				parent: mo ? pl._currentValue : pl._currentValue2,
				pool: e
			};
		}
		function Je(e, t) {
			if (Ic(e, t)) return !0;
			if (typeof e != "object" || !e || typeof t != "object" || !t) return !1;
			var n = Object.keys(e), r = Object.keys(t);
			if (n.length !== r.length) return !1;
			for (r = 0; r < n.length; r++) {
				var i = n[r];
				if (!Rc.call(t, i) || !Ic(e[i], t[i])) return !1;
			}
			return !0;
		}
		function Ye(e) {
			return e = e.status, e === "fulfilled" || e === "rejected";
		}
		function Xe(e, t, n) {
			switch (n = e[n], n === void 0 ? e.push(t) : n !== t && (t.then(Me, Me), t = n), t.status) {
				case "fulfilled": return t.value;
				case "rejected": throw e = t.reason, Qe(e), e;
				default:
					if (typeof t.status == "string") t.then(Me, Me);
					else {
						if (e = Du, e !== null && 100 < e.shellSuspendCounter) throw Error(a(482));
						e = t, e.status = "pending", e.then(function(e) {
							if (t.status === "pending") {
								var n = t;
								n.status = "fulfilled", n.value = e;
							}
						}, function(e) {
							if (t.status === "pending") {
								var n = t;
								n.status = "rejected", n.reason = e;
							}
						});
					}
					switch (t.status) {
						case "fulfilled": return t.value;
						case "rejected": throw e = t.reason, Qe(e), e;
					}
					throw Al = t, El;
			}
		}
		function Ze(e) {
			try {
				var t = e._init;
				return t(e._payload);
			} catch (e) {
				throw typeof e == "object" && e && typeof e.then == "function" ? (Al = e, El) : e;
			}
		}
		function N() {
			if (Al === null) throw Error(a(459));
			var e = Al;
			return Al = null, e;
		}
		function Qe(e) {
			if (e === El || e === Ol) throw Error(a(483));
		}
		function $e(e) {
			var t = Ml;
			return Ml += 1, jl === null && (jl = []), Xe(jl, e, t);
		}
		function et(e, t) {
			t = t.props.ref, e.ref = t === void 0 ? null : t;
		}
		function tt(e, t) {
			throw t.$$typeof === Na ? Error(a(525)) : (e = Object.prototype.toString.call(t), Error(a(31, e === "[object Object]" ? "object with keys {" + Object.keys(t).join(", ") + "}" : e)));
		}
		function nt(e) {
			function n(t, n) {
				if (e) {
					var r = t.deletions;
					r === null ? (t.deletions = [n], t.flags |= 16) : r.push(n);
				}
			}
			function r(t, r) {
				if (!e) return null;
				for (; r !== null;) n(t, r), r = r.sibling;
				return null;
			}
			function i(e) {
				for (var t = /* @__PURE__ */ new Map(); e !== null;) e.key === null ? t.set(e.index, e) : t.set(e.key, e), e = e.sibling;
				return t;
			}
			function o(e, t) {
				return e = ha(e, t), e.index = 0, e.sibling = null, e;
			}
			function s(t, n, r) {
				return t.index = r, e ? (r = t.alternate, r === null ? (t.flags |= 67108866, n) : (r = r.index, r < n ? (t.flags |= 67108866, n) : r)) : (t.flags |= 1048576, n);
			}
			function c(t) {
				return e && t.alternate === null && (t.flags |= 67108866), t;
			}
			function l(e, t, n, r) {
				return t === null || t.tag !== 6 ? (t = ya(n, e.mode, r), t.return = e, t) : (t = o(t, n), t.return = e, t);
			}
			function u(e, t, n, r) {
				var i = n.type;
				return i === Ia ? p(e, t, n.props.children, r, n.key) : t !== null && (t.elementType === i || typeof i == "object" && i && i.$$typeof === Ga && Ze(i) === t.type) ? (t = o(t, n.props), et(t, n), t.return = e, t) : (t = _a(n.type, n.key, n.props, null, e.mode, r), et(t, n), t.return = e, t);
			}
			function f(e, t, n, r) {
				return t === null || t.tag !== 4 || t.stateNode.containerInfo !== n.containerInfo || t.stateNode.implementation !== n.implementation ? (t = xa(n, e.mode, r), t.return = e, t) : (t = o(t, n.children || []), t.return = e, t);
			}
			function p(e, t, n, r, i) {
				return t === null || t.tag !== 7 ? (t = va(n, e.mode, r, i), t.return = e, t) : (t = o(t, n), t.return = e, t);
			}
			function m(e, t, n) {
				if (typeof t == "string" && t !== "" || typeof t == "number" || typeof t == "bigint") return t = ya("" + t, e.mode, n), t.return = e, t;
				if (typeof t == "object" && t) {
					switch (t.$$typeof) {
						case Pa: return n = _a(t.type, t.key, t.props, null, e.mode, n), et(n, t), n.return = e, n;
						case Fa: return t = xa(t, e.mode, n), t.return = e, t;
						case Ga: return t = Ze(t), m(e, t, n);
					}
					if (Xa(t) || d(t)) return t = va(t, e.mode, n, null), t.return = e, t;
					if (typeof t.then == "function") return m(e, $e(t), n);
					if (t.$$typeof === Ba) return m(e, Oe(e, t), n);
					tt(e, t);
				}
				return null;
			}
			function h(e, t, n, r) {
				var i = t === null ? null : t.key;
				if (typeof n == "string" && n !== "" || typeof n == "number" || typeof n == "bigint") return i === null ? l(e, t, "" + n, r) : null;
				if (typeof n == "object" && n) {
					switch (n.$$typeof) {
						case Pa: return n.key === i ? u(e, t, n, r) : null;
						case Fa: return n.key === i ? f(e, t, n, r) : null;
						case Ga: return n = Ze(n), h(e, t, n, r);
					}
					if (Xa(n) || d(n)) return i === null ? p(e, t, n, r, null) : null;
					if (typeof n.then == "function") return h(e, t, $e(n), r);
					if (n.$$typeof === Ba) return h(e, t, Oe(e, n), r);
					tt(e, n);
				}
				return null;
			}
			function g(e, t, n, r, i) {
				if (typeof r == "string" && r !== "" || typeof r == "number" || typeof r == "bigint") return e = e.get(n) || null, l(t, e, "" + r, i);
				if (typeof r == "object" && r) {
					switch (r.$$typeof) {
						case Pa: return e = e.get(r.key === null ? n : r.key) || null, u(t, e, r, i);
						case Fa: return e = e.get(r.key === null ? n : r.key) || null, f(t, e, r, i);
						case Ga: return r = Ze(r), g(e, t, n, r, i);
					}
					if (Xa(r) || d(r)) return e = e.get(n) || null, p(t, e, r, i, null);
					if (typeof r.then == "function") return g(e, t, n, $e(r), i);
					if (r.$$typeof === Ba) return g(e, t, n, Oe(t, r), i);
					tt(t, r);
				}
				return null;
			}
			function _(t, a, o, c) {
				for (var l = null, u = null, d = a, f = a = 0, p = null; d !== null && f < o.length; f++) {
					d.index > f ? (p = d, d = null) : p = d.sibling;
					var _ = h(t, d, o[f], c);
					if (_ === null) {
						d === null && (d = p);
						break;
					}
					e && d && _.alternate === null && n(t, d), a = s(_, a, f), u === null ? l = _ : u.sibling = _, u = _, d = p;
				}
				if (f === o.length) return r(t, d), rl && A(t, f), l;
				if (d === null) {
					for (; f < o.length; f++) d = m(t, o[f], c), d !== null && (a = s(d, a, f), u === null ? l = d : u.sibling = d, u = d);
					return rl && A(t, f), l;
				}
				for (d = i(d); f < o.length; f++) p = g(d, t, f, o[f], c), p !== null && (e && p.alternate !== null && d.delete(p.key === null ? f : p.key), a = s(p, a, f), u === null ? l = p : u.sibling = p, u = p);
				return e && d.forEach(function(e) {
					return n(t, e);
				}), rl && A(t, f), l;
			}
			function v(t, o, c, l) {
				if (c == null) throw Error(a(151));
				for (var u = null, d = null, f = o, p = o = 0, _ = null, v = c.next(); f !== null && !v.done; p++, v = c.next()) {
					f.index > p ? (_ = f, f = null) : _ = f.sibling;
					var y = h(t, f, v.value, l);
					if (y === null) {
						f === null && (f = _);
						break;
					}
					e && f && y.alternate === null && n(t, f), o = s(y, o, p), d === null ? u = y : d.sibling = y, d = y, f = _;
				}
				if (v.done) return r(t, f), rl && A(t, p), u;
				if (f === null) {
					for (; !v.done; p++, v = c.next()) v = m(t, v.value, l), v !== null && (o = s(v, o, p), d === null ? u = v : d.sibling = v, d = v);
					return rl && A(t, p), u;
				}
				for (f = i(f); !v.done; p++, v = c.next()) v = g(f, t, p, v.value, l), v !== null && (e && v.alternate !== null && f.delete(v.key === null ? p : v.key), o = s(v, o, p), d === null ? u = v : d.sibling = v, d = v);
				return e && f.forEach(function(e) {
					return n(t, e);
				}), rl && A(t, p), u;
			}
			function y(e, t, i, s) {
				if (typeof i == "object" && i && i.type === Ia && i.key === null && (i = i.props.children), typeof i == "object" && i) {
					switch (i.$$typeof) {
						case Pa:
							a: {
								for (var l = i.key; t !== null;) {
									if (t.key === l) {
										if (l = i.type, l === Ia) {
											if (t.tag === 7) {
												r(e, t.sibling), s = o(t, i.props.children), s.return = e, e = s;
												break a;
											}
										} else if (t.elementType === l || typeof l == "object" && l && l.$$typeof === Ga && Ze(l) === t.type) {
											r(e, t.sibling), s = o(t, i.props), et(s, i), s.return = e, e = s;
											break a;
										}
										r(e, t);
										break;
									} else n(e, t);
									t = t.sibling;
								}
								i.type === Ia ? (s = va(i.props.children, e.mode, s, i.key), s.return = e, e = s) : (s = _a(i.type, i.key, i.props, null, e.mode, s), et(s, i), s.return = e, e = s);
							}
							return c(e);
						case Fa:
							a: {
								for (l = i.key; t !== null;) {
									if (t.key === l) if (t.tag === 4 && t.stateNode.containerInfo === i.containerInfo && t.stateNode.implementation === i.implementation) {
										r(e, t.sibling), s = o(t, i.children || []), s.return = e, e = s;
										break a;
									} else {
										r(e, t);
										break;
									}
									else n(e, t);
									t = t.sibling;
								}
								s = xa(i, e.mode, s), s.return = e, e = s;
							}
							return c(e);
						case Ga: return i = Ze(i), y(e, t, i, s);
					}
					if (Xa(i)) return _(e, t, i, s);
					if (d(i)) {
						if (l = d(i), typeof l != "function") throw Error(a(150));
						return i = l.call(i), v(e, t, i, s);
					}
					if (typeof i.then == "function") return y(e, t, $e(i), s);
					if (i.$$typeof === Ba) return y(e, t, Oe(e, i), s);
					tt(e, i);
				}
				return typeof i == "string" && i !== "" || typeof i == "number" || typeof i == "bigint" ? (i = "" + i, t !== null && t.tag === 6 ? (r(e, t.sibling), s = o(t, i), s.return = e, e = s) : (r(e, t), s = ya(i, e.mode, s), s.return = e, e = s), c(e)) : r(e, t);
			}
			return function(e, n, r, i) {
				try {
					Ml = 0;
					var a = y(e, n, r, i);
					return jl = null, a;
				} catch (n) {
					if (n === El || n === Ol) throw n;
					var o = t(29, n, null, e.mode);
					return o.lanes = i, o.return = e, o;
				}
			};
		}
		function rt() {
			for (var e = Il, t = Ll = Il = 0; t < e;) {
				var n = Fl[t];
				Fl[t++] = null;
				var r = Fl[t];
				Fl[t++] = null;
				var i = Fl[t];
				Fl[t++] = null;
				var a = Fl[t];
				if (Fl[t++] = null, r !== null && i !== null) {
					var o = r.pending;
					o === null ? i.next = i : (i.next = o.next, o.next = i), r.pending = i;
				}
				a !== 0 && P(n, i, a);
			}
		}
		function it(e, t, n, r) {
			Fl[Il++] = e, Fl[Il++] = t, Fl[Il++] = n, Fl[Il++] = r, Ll |= r, e.lanes |= r, e = e.alternate, e !== null && (e.lanes |= r);
		}
		function at(e, t, n, r) {
			return it(e, t, n, r), st(e);
		}
		function ot(e, t) {
			return it(e, null, null, t), st(e);
		}
		function P(e, t, n) {
			e.lanes |= n;
			var r = e.alternate;
			r !== null && (r.lanes |= n);
			for (var i = !1, a = e.return; a !== null;) a.childLanes |= n, r = a.alternate, r !== null && (r.childLanes |= n), a.tag === 22 && (e = a.stateNode, e === null || e._visibility & 1 || (i = !0)), e = a, a = a.return;
			return e.tag === 3 ? (a = e.stateNode, i && t !== null && (i = 31 - _c(n), e = a.hiddenUpdates, r = e[i], r === null ? e[i] = [t] : r.push(t), t.lane = n | 536870912), a) : null;
		}
		function st(e) {
			if (50 < rd) throw rd = 0, id = null, Error(a(185));
			for (var t = e.return; t !== null;) e = t, t = e.return;
			return e.tag === 3 ? e.stateNode : null;
		}
		function ct(e) {
			e.updateQueue = {
				baseState: e.memoizedState,
				firstBaseUpdate: null,
				lastBaseUpdate: null,
				shared: {
					pending: null,
					lanes: 0,
					hiddenCallbacks: null
				},
				callbacks: null
			};
		}
		function lt(e, t) {
			e = e.updateQueue, t.updateQueue === e && (t.updateQueue = {
				baseState: e.baseState,
				firstBaseUpdate: e.firstBaseUpdate,
				lastBaseUpdate: e.lastBaseUpdate,
				shared: e.shared,
				callbacks: null
			});
		}
		function ut(e) {
			return {
				lane: e,
				tag: 0,
				payload: null,
				callback: null,
				next: null
			};
		}
		function dt(e, t, n) {
			var r = e.updateQueue;
			if (r === null) return null;
			if (r = r.shared, Eu & 2) {
				var i = r.pending;
				return i === null ? t.next = t : (t.next = i.next, i.next = t), r.pending = t, t = st(e), P(e, null, n), t;
			}
			return it(e, r, t, n), st(e);
		}
		function ft(e, t, n) {
			if (t = t.updateQueue, t !== null && (t = t.shared, n & 4194048)) {
				var r = t.lanes;
				r &= e.pendingLanes, n |= r, t.lanes = n, C(e, n);
			}
		}
		function pt(e, t) {
			var n = e.updateQueue, r = e.alternate;
			if (r !== null && (r = r.updateQueue, n === r)) {
				var i = null, a = null;
				if (n = n.firstBaseUpdate, n !== null) {
					do {
						var o = {
							lane: n.lane,
							tag: n.tag,
							payload: n.payload,
							callback: null,
							next: null
						};
						a === null ? i = a = o : a = a.next = o, n = n.next;
					} while (n !== null);
					a === null ? i = a = t : a = a.next = t;
				} else i = a = t;
				n = {
					baseState: r.baseState,
					firstBaseUpdate: i,
					lastBaseUpdate: a,
					shared: r.shared,
					callbacks: r.callbacks
				}, e.updateQueue = n;
				return;
			}
			e = n.lastBaseUpdate, e === null ? n.firstBaseUpdate = t : e.next = t, n.lastBaseUpdate = t;
		}
		function mt() {
			if (zl) {
				var e = Cl;
				if (e !== null) throw e;
			}
		}
		function ht(e, t, n, r) {
			zl = !1;
			var i = e.updateQueue;
			Rl = !1;
			var a = i.firstBaseUpdate, o = i.lastBaseUpdate, s = i.shared.pending;
			if (s !== null) {
				i.shared.pending = null;
				var c = s, l = c.next;
				c.next = null, o === null ? a = l : o.next = l, o = c;
				var u = e.alternate;
				u !== null && (u = u.updateQueue, s = u.lastBaseUpdate, s !== o && (s === null ? u.firstBaseUpdate = l : s.next = l, u.lastBaseUpdate = c));
			}
			if (a !== null) {
				var d = i.baseState;
				o = 0, u = l = c = null, s = a;
				do {
					var f = s.lane & -536870913, p = f !== s.lane;
					if (p ? (ku & f) === f : (r & f) === f) {
						f !== 0 && f === Sl && (zl = !0), u !== null && (u = u.next = {
							lane: 0,
							tag: s.tag,
							payload: s.payload,
							callback: null,
							next: null
						});
						a: {
							var m = e, h = s;
							f = t;
							var g = n;
							switch (h.tag) {
								case 1:
									if (m = h.payload, typeof m == "function") {
										d = m.call(g, d, f);
										break a;
									}
									d = m;
									break a;
								case 3: m.flags = m.flags & -65537 | 128;
								case 0:
									if (m = h.payload, f = typeof m == "function" ? m.call(g, d, f) : m, f == null) break a;
									d = Ma({}, d, f);
									break a;
								case 2: Rl = !0;
							}
						}
						f = s.callback, f !== null && (e.flags |= 64, p && (e.flags |= 8192), p = i.callbacks, p === null ? i.callbacks = [f] : p.push(f));
					} else p = {
						lane: f,
						tag: s.tag,
						payload: s.payload,
						callback: s.callback,
						next: null
					}, u === null ? (l = u = p, c = d) : u = u.next = p, o |= f;
					if (s = s.next, s === null) {
						if (s = i.shared.pending, s === null) break;
						p = s, s = p.next, p.next = null, i.lastBaseUpdate = p, i.shared.pending = null;
					}
				} while (1);
				u === null && (c = d), i.baseState = c, i.firstBaseUpdate = l, i.lastBaseUpdate = u, a === null && (i.shared.lanes = 0), Lu |= o, e.lanes = o, e.memoizedState = d;
			}
		}
		function gt(e, t) {
			if (typeof e != "function") throw Error(a(191, e));
			e.call(t);
		}
		function _t(e, t) {
			var n = e.callbacks;
			if (n !== null) for (e.callbacks = null, e = 0; e < n.length; e++) gt(n[e], t);
		}
		function F(e, t) {
			e = Fu, h(Vl, e), h(Bl, t), Fu = e | t.baseLanes;
		}
		function vt() {
			h(Vl, Fu), h(Bl, Bl.current);
		}
		function yt() {
			Fu = Vl.current, m(Bl), m(Vl);
		}
		function bt(e) {
			var t = e.alternate;
			h(Wl, Wl.current & 1), h(Hl, e), Ul === null && (t === null || Bl.current !== null || t.memoizedState !== null) && (Ul = e);
		}
		function xt(e) {
			h(Wl, Wl.current), h(Hl, e), Ul === null && (Ul = e);
		}
		function St(e) {
			e.tag === 22 ? (h(Wl, Wl.current), h(Hl, e), Ul === null && (Ul = e)) : Ct(e);
		}
		function Ct() {
			h(Wl, Wl.current), h(Hl, Hl.current);
		}
		function wt(e) {
			m(Hl), Ul === e && (Ul = null), m(Wl);
		}
		function Tt(e) {
			for (var t = e; t !== null;) {
				if (t.tag === 13) {
					var n = t.memoizedState;
					if (n !== null && (n = n.dehydrated, n === null || ps(n) || ms(n))) return t;
				} else if (t.tag === 19 && (t.memoizedProps.revealOrder === "forwards" || t.memoizedProps.revealOrder === "backwards" || t.memoizedProps.revealOrder === "unstable_legacy-backwards" || t.memoizedProps.revealOrder === "together")) {
					if (t.flags & 128) return t;
				} else if (t.child !== null) {
					t.child.return = t, t = t.child;
					continue;
				}
				if (t === e) break;
				for (; t.sibling === null;) {
					if (t.return === null || t.return === e) return null;
					t = t.return;
				}
				t.sibling.return = t.return, t = t.sibling;
			}
			return null;
		}
		function Et() {
			throw Error(a(321));
		}
		function Dt(e, t) {
			if (t === null) return !1;
			for (var n = 0; n < t.length && n < e.length; n++) if (!Ic(e[n], t[n])) return !1;
			return !0;
		}
		function Ot(e, t, n, r, i, a) {
			return Gl = a, K = t, t.memoizedState = null, t.updateQueue = null, t.lanes = 0, U.H = e === null || e.memoizedState === null ? nu : ru, Xl = !1, a = n(r, i), Xl = !1, Yl && (a = At(t, n, r, i)), kt(e), a;
		}
		function kt(e) {
			U.H = tu;
			var t = Kl !== null && Kl.next !== null;
			if (Gl = 0, ql = Kl = K = null, Jl = !1, Ql = 0, $l = null, t) throw Error(a(300));
			e === null || su || (e = e.dependencies, e !== null && Ee(e) && (su = !0));
		}
		function At(e, t, n, r) {
			K = e;
			var i = 0;
			do {
				if (Yl && ($l = null), Ql = 0, Yl = !1, 25 <= i) throw Error(a(301));
				if (i += 1, ql = Kl = null, e.updateQueue != null) {
					var o = e.updateQueue;
					o.lastEffect = null, o.events = null, o.stores = null, o.memoCache != null && (o.memoCache.index = 0);
				}
				U.H = iu, o = t(n, r);
			} while (Yl);
			return o;
		}
		function I() {
			var e = U.H, t = e.useState()[0];
			return t = typeof t.then == "function" ? Lt(t) : t, e = e.useState()[0], (Kl === null ? null : Kl.memoizedState) !== e && (K.flags |= 1024), t;
		}
		function jt() {
			var e = Zl !== 0;
			return Zl = 0, e;
		}
		function Mt(e, t, n) {
			t.updateQueue = e.updateQueue, t.flags &= -2053, e.lanes &= ~n;
		}
		function Nt(e) {
			if (Jl) {
				for (e = e.memoizedState; e !== null;) {
					var t = e.queue;
					t !== null && (t.pending = null), e = e.next;
				}
				Jl = !1;
			}
			Gl = 0, ql = Kl = K = null, Yl = !1, Ql = Zl = 0, $l = null;
		}
		function Pt() {
			var e = {
				memoizedState: null,
				baseState: null,
				baseQueue: null,
				queue: null,
				next: null
			};
			return ql === null ? K.memoizedState = ql = e : ql = ql.next = e, ql;
		}
		function Ft() {
			if (Kl === null) {
				var e = K.alternate;
				e = e === null ? null : e.memoizedState;
			} else e = Kl.next;
			var t = ql === null ? K.memoizedState : ql.next;
			if (t !== null) ql = t, Kl = e;
			else {
				if (e === null) throw K.alternate === null ? Error(a(467)) : Error(a(310));
				Kl = e, e = {
					memoizedState: Kl.memoizedState,
					baseState: Kl.baseState,
					baseQueue: Kl.baseQueue,
					queue: Kl.queue,
					next: null
				}, ql === null ? K.memoizedState = ql = e : ql = ql.next = e;
			}
			return ql;
		}
		function It() {
			return {
				lastEffect: null,
				events: null,
				stores: null,
				memoCache: null
			};
		}
		function Lt(e) {
			var t = Ql;
			return Ql += 1, $l === null && ($l = []), e = Xe($l, e, t), t = K, (ql === null ? t.memoizedState : ql.next) === null && (t = t.alternate, U.H = t === null || t.memoizedState === null ? nu : ru), e;
		}
		function Rt(e) {
			if (typeof e == "object" && e) {
				if (typeof e.then == "function") return Lt(e);
				if (e.$$typeof === Ba) return De(e);
			}
			throw Error(a(438, String(e)));
		}
		function zt(e) {
			var t = null, n = K.updateQueue;
			if (n !== null && (t = n.memoCache), t == null) {
				var r = K.alternate;
				r !== null && (r = r.updateQueue, r !== null && (r = r.memoCache, r != null && (t = {
					data: r.data.map(function(e) {
						return e.slice();
					}),
					index: 0
				})));
			}
			if (t ??= {
				data: [],
				index: 0
			}, n === null && (n = It(), K.updateQueue = n), n.memoCache = t, n = t.data[t.index], n === void 0) for (n = t.data[t.index] = Array(e), r = 0; r < e; r++) n[r] = qa;
			return t.index++, n;
		}
		function Bt(e, t) {
			return typeof t == "function" ? t(e) : t;
		}
		function Vt(e) {
			return Ht(Ft(), Kl, e);
		}
		function Ht(e, t, n) {
			var r = e.queue;
			if (r === null) throw Error(a(311));
			r.lastRenderedReducer = n;
			var i = e.baseQueue, o = r.pending;
			if (o !== null) {
				if (i !== null) {
					var s = i.next;
					i.next = o.next, o.next = s;
				}
				t.baseQueue = i = o, r.pending = null;
			}
			if (o = e.baseState, i === null) e.memoizedState = o;
			else {
				t = i.next;
				var c = s = null, l = null, u = t, d = !1;
				do {
					var f = u.lane & -536870913;
					if (f === u.lane ? (Gl & f) === f : (ku & f) === f) {
						var p = u.revertLane;
						if (p === 0) l !== null && (l = l.next = {
							lane: 0,
							revertLane: 0,
							gesture: null,
							action: u.action,
							hasEagerState: u.hasEagerState,
							eagerState: u.eagerState,
							next: null
						}), f === Sl && (d = !0);
						else if ((Gl & p) === p) {
							u = u.next, p === Sl && (d = !0);
							continue;
						} else f = {
							lane: 0,
							revertLane: u.revertLane,
							gesture: null,
							action: u.action,
							hasEagerState: u.hasEagerState,
							eagerState: u.eagerState,
							next: null
						}, l === null ? (c = l = f, s = o) : l = l.next = f, K.lanes |= p, Lu |= p;
						f = u.action, Xl && n(o, f), o = u.hasEagerState ? u.eagerState : n(o, f);
					} else p = {
						lane: f,
						revertLane: u.revertLane,
						gesture: u.gesture,
						action: u.action,
						hasEagerState: u.hasEagerState,
						eagerState: u.eagerState,
						next: null
					}, l === null ? (c = l = p, s = o) : l = l.next = p, K.lanes |= f, Lu |= f;
					u = u.next;
				} while (u !== null && u !== t);
				if (l === null ? s = o : l.next = c, !Ic(o, e.memoizedState) && (su = !0, d && (n = Cl, n !== null))) throw n;
				e.memoizedState = o, e.baseState = s, e.baseQueue = l, r.lastRenderedState = o;
			}
			return i === null && (r.lanes = 0), [e.memoizedState, r.dispatch];
		}
		function Ut(e) {
			var t = Ft(), n = t.queue;
			if (n === null) throw Error(a(311));
			n.lastRenderedReducer = e;
			var r = n.dispatch, i = n.pending, o = t.memoizedState;
			if (i !== null) {
				n.pending = null;
				var s = i = i.next;
				do
					o = e(o, s.action), s = s.next;
				while (s !== i);
				Ic(o, t.memoizedState) || (su = !0), t.memoizedState = o, t.baseQueue === null && (t.baseState = o), n.lastRenderedState = o;
			}
			return [o, r];
		}
		function Wt(e, t, n) {
			var r = K, i = Ft(), o = rl;
			if (o) {
				if (n === void 0) throw Error(a(407));
				n = n();
			} else n = t();
			var s = !Ic((Kl || i).memoizedState, n);
			if (s && (i.memoizedState = n, su = !0), i = i.queue, gn(qt.bind(null, r, i, e), [e]), i.getSnapshot !== t || s || ql !== null && ql.memoizedState.tag & 1) {
				if (r.flags |= 2048, dn(9, { destroy: void 0 }, Kt.bind(null, r, i, n, t), null), Du === null) throw Error(a(349));
				o || Gl & 127 || Gt(r, t, n);
			}
			return n;
		}
		function Gt(e, t, n) {
			e.flags |= 16384, e = {
				getSnapshot: t,
				value: n
			}, t = K.updateQueue, t === null ? (t = It(), K.updateQueue = t, t.stores = [e]) : (n = t.stores, n === null ? t.stores = [e] : n.push(e));
		}
		function Kt(e, t, n, r) {
			t.value = n, t.getSnapshot = r, Jt(t) && Yt(e);
		}
		function qt(e, t, n) {
			return n(function() {
				Jt(t) && Yt(e);
			});
		}
		function Jt(e) {
			var t = e.getSnapshot;
			e = e.value;
			try {
				var n = t();
				return !Ic(e, n);
			} catch {
				return !0;
			}
		}
		function Yt(e) {
			var t = ot(e, 2);
			t !== null && H(t, e, 2);
		}
		function Xt(e) {
			var t = Pt();
			if (typeof e == "function") {
				var n = e;
				if (e = n(), Xl) {
					E(!0);
					try {
						n();
					} finally {
						E(!1);
					}
				}
			}
			return t.memoizedState = t.baseState = e, t.queue = {
				pending: null,
				lanes: 0,
				dispatch: null,
				lastRenderedReducer: Bt,
				lastRenderedState: e
			}, t;
		}
		function Zt(e, t, n, r) {
			return e.baseState = n, Ht(e, Kl, typeof r == "function" ? r : Bt);
		}
		function Qt(e, t, n, r, i) {
			if (L(e)) throw Error(a(485));
			if (e = t.action, e !== null) {
				var o = {
					payload: i,
					action: e,
					next: null,
					isTransition: !0,
					status: "pending",
					value: null,
					reason: null,
					listeners: [],
					then: function(e) {
						o.listeners.push(e);
					}
				};
				U.T === null ? o.isTransition = !1 : n(!0), r(o), n = t.pending, n === null ? (o.next = t.pending = o, $t(t, o)) : (o.next = n.next, t.pending = n.next = o);
			}
		}
		function $t(e, t) {
			var n = t.action, r = t.payload, i = e.state;
			if (t.isTransition) {
				var a = U.T, o = {};
				U.T = o;
				try {
					var s = n(i, r), c = U.S;
					c !== null && c(o, s), en(e, t, s);
				} catch (n) {
					nn(e, t, n);
				} finally {
					a !== null && o.types !== null && (a.types = o.types), U.T = a;
				}
			} else try {
				a = n(i, r), en(e, t, a);
			} catch (n) {
				nn(e, t, n);
			}
		}
		function en(e, t, n) {
			typeof n == "object" && n && typeof n.then == "function" ? n.then(function(n) {
				tn(e, t, n);
			}, function(n) {
				return nn(e, t, n);
			}) : tn(e, t, n);
		}
		function tn(e, t, n) {
			t.status = "fulfilled", t.value = n, rn(t), e.state = n, t = e.pending, t !== null && (n = t.next, n === t ? e.pending = null : (n = n.next, t.next = n, $t(e, n)));
		}
		function nn(e, t, n) {
			var r = e.pending;
			if (e.pending = null, r !== null) {
				r = r.next;
				do
					t.status = "rejected", t.reason = n, rn(t), t = t.next;
				while (t !== r);
			}
			e.action = null;
		}
		function rn(e) {
			e = e.listeners;
			for (var t = 0; t < e.length; t++) (0, e[t])();
		}
		function an(e, t) {
			return t;
		}
		function on(e, t) {
			if (rl) {
				var n = Du.formState;
				if (n !== null) {
					a: {
						var r = K;
						if (rl) {
							if (nl) {
								var i = _s(nl, al);
								if (i) {
									nl = ys(i), r = vs(i);
									break a;
								}
							}
							he(r);
						}
						r = !1;
					}
					r && (t = n[0]);
				}
			}
			n = Pt(), n.memoizedState = n.baseState = t, r = {
				pending: null,
				lanes: 0,
				dispatch: null,
				lastRenderedReducer: an,
				lastRenderedState: t
			}, n.queue = r, n = Fn.bind(null, K, r), r.dispatch = n, r = Xt(!1);
			var a = Ln.bind(null, K, !1, r.queue);
			return r = Pt(), i = {
				state: t,
				dispatch: null,
				action: e,
				pending: null
			}, r.queue = i, n = Qt.bind(null, K, i, a, n), i.dispatch = n, r.memoizedState = e, [
				t,
				n,
				!1
			];
		}
		function sn(e) {
			return cn(Ft(), Kl, e);
		}
		function cn(e, t, n) {
			if (t = Ht(e, t, an)[0], e = Vt(Bt)[0], typeof t == "object" && t && typeof t.then == "function") try {
				var r = Lt(t);
			} catch (e) {
				throw e === El ? Ol : e;
			}
			else r = t;
			t = Ft();
			var i = t.queue, a = i.dispatch;
			return n !== t.memoizedState && (K.flags |= 2048, dn(9, { destroy: void 0 }, ln.bind(null, i, n), null)), [
				r,
				a,
				e
			];
		}
		function ln(e, t) {
			e.action = t;
		}
		function un(e) {
			var t = Ft(), n = Kl;
			if (n !== null) return cn(t, n, e);
			Ft(), t = t.memoizedState, n = Ft();
			var r = n.queue.dispatch;
			return n.memoizedState = e, [
				t,
				r,
				!1
			];
		}
		function dn(e, t, n, r) {
			return e = {
				tag: e,
				create: n,
				deps: r,
				inst: t,
				next: null
			}, t = K.updateQueue, t === null && (t = It(), K.updateQueue = t), n = t.lastEffect, n === null ? t.lastEffect = e.next = e : (r = n.next, n.next = e, e.next = r, t.lastEffect = e), e;
		}
		function fn() {
			return Ft().memoizedState;
		}
		function pn(e, t, n, r) {
			var i = Pt();
			K.flags |= e, i.memoizedState = dn(1 | t, { destroy: void 0 }, n, r === void 0 ? null : r);
		}
		function mn(e, t, n, r) {
			var i = Ft();
			r = r === void 0 ? null : r;
			var a = i.memoizedState.inst;
			Kl !== null && r !== null && Dt(r, Kl.memoizedState.deps) ? i.memoizedState = dn(t, a, n, r) : (K.flags |= e, i.memoizedState = dn(1 | t, a, n, r));
		}
		function hn(e, t) {
			pn(8390656, 8, e, t);
		}
		function gn(e, t) {
			mn(2048, 8, e, t);
		}
		function _n(e) {
			K.flags |= 4;
			var t = K.updateQueue;
			if (t === null) t = It(), K.updateQueue = t, t.events = [e];
			else {
				var n = t.events;
				n === null ? t.events = [e] : n.push(e);
			}
		}
		function vn(e) {
			var t = Ft().memoizedState;
			return _n({
				ref: t,
				nextImpl: e
			}), function() {
				if (Eu & 2) throw Error(a(440));
				return t.impl.apply(void 0, arguments);
			};
		}
		function yn(e, t) {
			return mn(4, 2, e, t);
		}
		function bn(e, t) {
			return mn(4, 4, e, t);
		}
		function xn(e, t) {
			if (typeof t == "function") {
				e = e();
				var n = t(e);
				return function() {
					typeof n == "function" ? n() : t(null);
				};
			}
			if (t != null) return e = e(), t.current = e, function() {
				t.current = null;
			};
		}
		function Sn(e, t, n) {
			n = n == null ? null : n.concat([e]), mn(4, 4, xn.bind(null, t, e), n);
		}
		function Cn() {}
		function wn(e, t) {
			var n = Ft();
			t = t === void 0 ? null : t;
			var r = n.memoizedState;
			return t !== null && Dt(t, r[1]) ? r[0] : (n.memoizedState = [e, t], e);
		}
		function Tn(e, t) {
			var n = Ft();
			t = t === void 0 ? null : t;
			var r = n.memoizedState;
			if (t !== null && Dt(t, r[1])) return r[0];
			if (r = e(), Xl) {
				E(!0);
				try {
					e();
				} finally {
					E(!1);
				}
			}
			return n.memoizedState = [r, t], r;
		}
		function En(e, t, n) {
			return n === void 0 || Gl & 1073741824 && !(ku & 261930) ? e.memoizedState = t : (e.memoizedState = n, e = Ai(), K.lanes |= e, Lu |= e, n);
		}
		function Dn(e, t, n, r) {
			return Ic(n, t) ? n : Bl.current === null ? !(Gl & 42) || Gl & 1073741824 && !(ku & 261930) ? (su = !0, e.memoizedState = n) : (e = Ai(), K.lanes |= e, Lu |= e, t) : (e = En(e, n, r), Ic(e, t) || (su = !0), e);
		}
		function On(e, t, n, r, i) {
			var a = xo();
			bo(a !== 0 && 8 > a ? a : 8);
			var o = U.T, s = {};
			U.T = s, Ln(e, !1, t, n);
			try {
				var c = i(), l = U.S;
				l !== null && l(s, c), typeof c == "object" && c && typeof c.then == "function" ? In(e, t, We(c, r), ki(e)) : In(e, t, r, ki(e));
			} catch (n) {
				In(e, t, {
					then: function() {},
					status: "rejected",
					reason: n
				}, ki());
			} finally {
				bo(a), o !== null && s.types !== null && (o.types = s.types), U.T = o;
			}
		}
		function kn(e) {
			var t = e.memoizedState;
			if (t !== null) return t;
			t = {
				memoizedState: Mo,
				baseState: Mo,
				baseQueue: null,
				queue: {
					pending: null,
					lanes: 0,
					dispatch: null,
					lastRenderedReducer: Bt,
					lastRenderedState: Mo
				},
				next: null
			};
			var n = {};
			return t.next = {
				memoizedState: n,
				baseState: n,
				baseQueue: null,
				queue: {
					pending: null,
					lanes: 0,
					dispatch: null,
					lastRenderedReducer: Bt,
					lastRenderedState: n
				},
				next: null
			}, e.memoizedState = t, e = e.alternate, e !== null && (e.memoizedState = t), t;
		}
		function An() {
			return De(No);
		}
		function jn() {
			return Ft().memoizedState;
		}
		function Mn() {
			return Ft().memoizedState;
		}
		function Nn(e) {
			for (var t = e.return; t !== null;) {
				switch (t.tag) {
					case 24:
					case 3:
						var n = ki();
						e = ut(n);
						var r = dt(t, e, n);
						r !== null && (H(r, t, n), ft(r, t, n)), t = { cache: Ae() }, e.payload = t;
						return;
				}
				t = t.return;
			}
		}
		function Pn(e, t, n) {
			var r = ki();
			n = {
				lane: r,
				revertLane: 0,
				gesture: null,
				action: n,
				hasEagerState: !1,
				eagerState: null,
				next: null
			}, L(e) ? Rn(t, n) : (n = at(e, t, n, r), n !== null && (H(n, e, r), zn(n, t, r)));
		}
		function Fn(e, t, n) {
			In(e, t, n, ki());
		}
		function In(e, t, n, r) {
			var i = {
				lane: r,
				revertLane: 0,
				gesture: null,
				action: n,
				hasEagerState: !1,
				eagerState: null,
				next: null
			};
			if (L(e)) Rn(t, i);
			else {
				var a = e.alternate;
				if (e.lanes === 0 && (a === null || a.lanes === 0) && (a = t.lastRenderedReducer, a !== null)) try {
					var o = t.lastRenderedState, s = a(o, n);
					if (i.hasEagerState = !0, i.eagerState = s, Ic(s, o)) return it(e, t, i, 0), Du === null && rt(), !1;
				} catch {}
				if (n = at(e, t, i, r), n !== null) return H(n, e, r), zn(n, t, r), !0;
			}
			return !1;
		}
		function Ln(e, t, n, r) {
			if (r = {
				lane: 2,
				revertLane: Ve(),
				gesture: null,
				action: r,
				hasEagerState: !1,
				eagerState: null,
				next: null
			}, L(e)) {
				if (t) throw Error(a(479));
			} else t = at(e, n, r, 2), t !== null && H(t, e, 2);
		}
		function L(e) {
			var t = e.alternate;
			return e === K || t !== null && t === K;
		}
		function Rn(e, t) {
			Yl = Jl = !0;
			var n = e.pending;
			n === null ? t.next = t : (t.next = n.next, n.next = t), e.pending = t;
		}
		function zn(e, t, n) {
			if (n & 4194048) {
				var r = t.lanes;
				r &= e.pendingLanes, n |= r, t.lanes = n, C(e, n);
			}
		}
		function Bn(e, t, n, r) {
			t = e.memoizedState, n = n(r, t), n = n == null ? t : Ma({}, t, n), e.memoizedState = n, e.lanes === 0 && (e.updateQueue.baseState = n);
		}
		function Vn(e, t, n, r, i, a, o) {
			return e = e.stateNode, typeof e.shouldComponentUpdate == "function" ? e.shouldComponentUpdate(r, a, o) : t.prototype && t.prototype.isPureReactComponent ? !Je(n, r) || !Je(i, a) : !0;
		}
		function Hn(e, t, n, r) {
			e = t.state, typeof t.componentWillReceiveProps == "function" && t.componentWillReceiveProps(n, r), typeof t.UNSAFE_componentWillReceiveProps == "function" && t.UNSAFE_componentWillReceiveProps(n, r), t.state !== e && au.enqueueReplaceState(t, t.state, null);
		}
		function Un(e, t) {
			var n = t;
			if ("ref" in t) for (var r in n = {}, t) r !== "ref" && (n[r] = t[r]);
			if (e = e.defaultProps) for (var i in n === t && (n = Ma({}, n)), e) n[i] === void 0 && (n[i] = e[i]);
			return n;
		}
		function Wn(e, t) {
			try {
				var n = e.onUncaughtError;
				n(t.value, { componentStack: t.stack });
			} catch (e) {
				setTimeout(function() {
					throw e;
				});
			}
		}
		function Gn(e, t, n) {
			try {
				var r = e.onCaughtError;
				r(n.value, {
					componentStack: n.stack,
					errorBoundary: t.tag === 1 ? t.stateNode : null
				});
			} catch (e) {
				setTimeout(function() {
					throw e;
				});
			}
		}
		function Kn(e, t, n) {
			return n = ut(n), n.tag = 3, n.payload = { element: null }, n.callback = function() {
				Wn(e, t);
			}, n;
		}
		function qn(e) {
			return e = ut(e), e.tag = 3, e;
		}
		function Jn(e, t, n, r) {
			var i = n.type.getDerivedStateFromError;
			if (typeof i == "function") {
				var a = r.value;
				e.payload = function() {
					return i(a);
				}, e.callback = function() {
					Gn(t, n, r);
				};
			}
			var o = n.stateNode;
			o !== null && typeof o.componentDidCatch == "function" && (e.callback = function() {
				Gn(t, n, r), typeof i != "function" && (Yu === null ? Yu = new Set([this]) : Yu.add(this));
				var e = r.stack;
				this.componentDidCatch(r.value, { componentStack: e === null ? "" : e });
			});
		}
		function Yn(e, t, n, r, i) {
			if (n.flags |= 32768, typeof r == "object" && r && typeof r.then == "function") {
				if (t = n.alternate, t !== null && Te(t, n, i, !0), n = Hl.current, n !== null) {
					switch (n.tag) {
						case 31:
						case 13: return Ul === null ? Hi() : n.alternate === null && Iu === 0 && (Iu = 3), n.flags &= -257, n.flags |= 65536, n.lanes = i, r === kl ? n.flags |= 16384 : (t = n.updateQueue, t === null ? n.updateQueue = new Set([r]) : t.add(r), sa(e, r, i)), !1;
						case 22: return n.flags |= 65536, r === kl ? n.flags |= 16384 : (t = n.updateQueue, t === null ? (t = {
							transitions: null,
							markerInstances: null,
							retryQueue: new Set([r])
						}, n.updateQueue = t) : (n = t.retryQueue, n === null ? t.retryQueue = new Set([r]) : n.add(r)), sa(e, r, i)), !1;
					}
					throw Error(a(435, n.tag));
				}
				return sa(e, r, i), Hi(), !1;
			}
			if (rl) return t = Hl.current, t === null ? (r !== ol && (t = Error(a(423), { cause: r }), be(k(t, n))), e = e.current.alternate, e.flags |= 65536, i &= -i, e.lanes |= i, r = k(r, n), i = Kn(e.stateNode, r, i), pt(e, i), Iu !== 4 && (Iu = 2)) : (!(t.flags & 65536) && (t.flags |= 256), t.flags |= 65536, t.lanes = i, r !== ol && (e = Error(a(422), { cause: r }), be(k(e, n)))), !1;
			var o = Error(a(520), { cause: r });
			if (o = k(o, n), Hu === null ? Hu = [o] : Hu.push(o), Iu !== 4 && (Iu = 2), t === null) return !0;
			r = k(r, n), n = t;
			do {
				switch (n.tag) {
					case 3: return n.flags |= 65536, e = i & -i, n.lanes |= e, e = Kn(n.stateNode, r, e), pt(n, e), !1;
					case 1: if (t = n.type, o = n.stateNode, !(n.flags & 128) && (typeof t.getDerivedStateFromError == "function" || o !== null && typeof o.componentDidCatch == "function" && (Yu === null || !Yu.has(o)))) return n.flags |= 65536, i &= -i, n.lanes |= i, i = qn(i), Jn(i, e, n, r), pt(n, i), !1;
				}
				n = n.return;
			} while (n !== null);
			return !1;
		}
		function Xn(e, t, n, r) {
			t.child = e === null ? Pl(t, null, n, r) : Nl(t, e.child, n, r);
		}
		function Zn(e, t, n, r, i) {
			n = n.render;
			var a = t.ref;
			if ("ref" in r) {
				var o = {};
				for (var s in r) s !== "ref" && (o[s] = r[s]);
			} else o = r;
			return M(t), r = Ot(e, t, n, o, a, i), s = jt(), e !== null && !su ? (Mt(e, t, i), vr(e, t, i)) : (rl && s && ce(t), t.flags |= 1, Xn(e, t, r, i), t.child);
		}
		function Qn(e, t, n, r, i) {
			if (e === null) {
				var a = n.type;
				return typeof a == "function" && !ma(a) && a.defaultProps === void 0 && n.compare === null ? (t.tag = 15, t.type = a, $n(e, t, a, r, i)) : (e = _a(n.type, null, r, t, t.mode, i), e.ref = t.ref, e.return = t, t.child = e);
			}
			if (a = e.child, !yr(e, i)) {
				var o = a.memoizedProps;
				if (n = n.compare, n = n === null ? Je : n, n(o, r) && e.ref === t.ref) return vr(e, t, i);
			}
			return t.flags |= 1, e = ha(a, r), e.ref = t.ref, e.return = t, t.child = e;
		}
		function $n(e, t, n, r, i) {
			if (e !== null) {
				var a = e.memoizedProps;
				if (Je(a, r) && e.ref === t.ref) if (su = !1, t.pendingProps = r = a, yr(e, i)) e.flags & 131072 && (su = !0);
				else return t.lanes = e.lanes, vr(e, t, i);
			}
			return sr(e, t, n, r, i);
		}
		function er(e, t, n, r) {
			var i = r.children, a = e === null ? null : e.memoizedState;
			if (e === null && t.stateNode === null && (t.stateNode = {
				_visibility: 1,
				_pendingMarkers: null,
				_retryCache: null,
				_transitions: null
			}), r.mode === "hidden") {
				if (t.flags & 128) {
					if (a = a === null ? n : a.baseLanes | n, e !== null) {
						for (r = t.child = e.child, i = 0; r !== null;) i = i | r.lanes | r.childLanes, r = r.sibling;
						r = i & ~a;
					} else r = 0, t.child = null;
					return nr(e, t, a, n, r);
				}
				if (n & 536870912) t.memoizedState = {
					baseLanes: 0,
					cachePool: null
				}, e !== null && Ke(t, a === null ? null : a.cachePool), a === null ? vt() : F(t, a), St(t);
				else return r = t.lanes = 536870912, nr(e, t, a === null ? n : a.baseLanes | n, n, r);
			} else a === null ? (e !== null && Ke(t, null), vt(), Ct(t)) : (Ke(t, a.cachePool), F(t, a), Ct(t), t.memoizedState = null);
			return Xn(e, t, i, n), t.child;
		}
		function tr(e, t) {
			return e !== null && e.tag === 22 || t.stateNode !== null || (t.stateNode = {
				_visibility: 1,
				_pendingMarkers: null,
				_retryCache: null,
				_transitions: null
			}), t.sibling;
		}
		function nr(e, t, n, r, i) {
			var a = Ge();
			return a = a === null ? null : {
				parent: mo ? pl._currentValue : pl._currentValue2,
				pool: a
			}, t.memoizedState = {
				baseLanes: n,
				cachePool: a
			}, e !== null && Ke(t, null), vt(), St(t), e !== null && Te(e, t, r, !0), t.childLanes = i, null;
		}
		function rr(e, t) {
			return t = hr({
				mode: t.mode,
				children: t.children
			}, e.mode), t.ref = e.ref, e.child = t, t.return = e, t;
		}
		function ir(e, t, n) {
			return Nl(t, e.child, null, n), e = rr(t, t.pendingProps), e.flags |= 2, wt(t), t.memoizedState = null, e;
		}
		function ar(e, t, n) {
			var r = t.pendingProps, i = (t.flags & 128) != 0;
			if (t.flags &= -129, e === null) {
				if (rl) {
					if (r.mode === "hidden") return e = rr(t, r), t.lanes = 536870912, tr(null, e);
					if (xt(t), (e = nl) ? (e = Ds(e, al), e !== null && (t.memoizedState = {
						dehydrated: e,
						treeContext: Jc === null ? null : {
							id: Yc,
							overflow: Xc
						},
						retryLane: 536870912,
						hydrationErrors: null
					}, n = ba(e), n.return = t, t.child = n, tl = t, nl = null)) : e = null, e === null) throw he(t);
					return t.lanes = 536870912, null;
				}
				return rr(t, r);
			}
			var o = e.memoizedState;
			if (o !== null) {
				var s = o.dehydrated;
				if (xt(t), i) if (t.flags & 256) t.flags &= -257, t = ir(e, t, n);
				else if (t.memoizedState !== null) t.child = e.child, t.flags |= 128, t = null;
				else throw Error(a(558));
				else if (su || Te(e, t, n, !1), i = (n & e.childLanes) !== 0, su || i) {
					if (r = Du, r !== null && (s = w(r, n), s !== 0 && s !== o.retryLane)) throw o.retryLane = s, ot(e, s), H(r, e, s), ou;
					Hi(), t = ir(e, t, n);
				} else e = o.treeContext, _o && (nl = Ss(s), tl = t, rl = !0, il = null, al = !1, e !== null && ue(t, e)), t = rr(t, r), t.flags |= 4096;
				return t;
			}
			return e = ha(e.child, {
				mode: r.mode,
				children: r.children
			}), e.ref = t.ref, t.child = e, e.return = t, e;
		}
		function or(e, t) {
			var n = t.ref;
			if (n === null) e !== null && e.ref !== null && (t.flags |= 4194816);
			else {
				if (typeof n != "function" && typeof n != "object") throw Error(a(284));
				(e === null || e.ref !== n) && (t.flags |= 4194816);
			}
		}
		function sr(e, t, n, r, i) {
			return M(t), n = Ot(e, t, n, r, void 0, i), r = jt(), e !== null && !su ? (Mt(e, t, i), vr(e, t, i)) : (rl && r && ce(t), t.flags |= 1, Xn(e, t, n, i), t.child);
		}
		function cr(e, t, n, r, i, a) {
			return M(t), t.updateQueue = null, n = At(t, r, n, i), kt(e), r = jt(), e !== null && !su ? (Mt(e, t, a), vr(e, t, a)) : (rl && r && ce(t), t.flags |= 1, Xn(e, t, n, a), t.child);
		}
		function lr(e, t, n, r, i) {
			if (M(t), t.stateNode === null) {
				var a = gc, o = n.contextType;
				typeof o == "object" && o && (a = De(o)), a = new n(r, a), t.memoizedState = a.state !== null && a.state !== void 0 ? a.state : null, a.updater = au, t.stateNode = a, a._reactInternals = t, a = t.stateNode, a.props = r, a.state = t.memoizedState, a.refs = {}, ct(t), o = n.contextType, a.context = typeof o == "object" && o ? De(o) : gc, a.state = t.memoizedState, o = n.getDerivedStateFromProps, typeof o == "function" && (Bn(t, n, o, r), a.state = t.memoizedState), typeof n.getDerivedStateFromProps == "function" || typeof a.getSnapshotBeforeUpdate == "function" || typeof a.UNSAFE_componentWillMount != "function" && typeof a.componentWillMount != "function" || (o = a.state, typeof a.componentWillMount == "function" && a.componentWillMount(), typeof a.UNSAFE_componentWillMount == "function" && a.UNSAFE_componentWillMount(), o !== a.state && au.enqueueReplaceState(a, a.state, null), ht(t, r, a, i), mt(), a.state = t.memoizedState), typeof a.componentDidMount == "function" && (t.flags |= 4194308), r = !0;
			} else if (e === null) {
				a = t.stateNode;
				var s = t.memoizedProps, c = Un(n, s);
				a.props = c;
				var l = a.context, u = n.contextType;
				o = gc, typeof u == "object" && u && (o = De(u));
				var d = n.getDerivedStateFromProps;
				u = typeof d == "function" || typeof a.getSnapshotBeforeUpdate == "function", s = t.pendingProps !== s, u || typeof a.UNSAFE_componentWillReceiveProps != "function" && typeof a.componentWillReceiveProps != "function" || (s || l !== o) && Hn(t, a, r, o), Rl = !1;
				var f = t.memoizedState;
				a.state = f, ht(t, r, a, i), mt(), l = t.memoizedState, s || f !== l || Rl ? (typeof d == "function" && (Bn(t, n, d, r), l = t.memoizedState), (c = Rl || Vn(t, n, c, r, f, l, o)) ? (u || typeof a.UNSAFE_componentWillMount != "function" && typeof a.componentWillMount != "function" || (typeof a.componentWillMount == "function" && a.componentWillMount(), typeof a.UNSAFE_componentWillMount == "function" && a.UNSAFE_componentWillMount()), typeof a.componentDidMount == "function" && (t.flags |= 4194308)) : (typeof a.componentDidMount == "function" && (t.flags |= 4194308), t.memoizedProps = r, t.memoizedState = l), a.props = r, a.state = l, a.context = o, r = c) : (typeof a.componentDidMount == "function" && (t.flags |= 4194308), r = !1);
			} else {
				a = t.stateNode, lt(e, t), o = t.memoizedProps, u = Un(n, o), a.props = u, d = t.pendingProps, f = a.context, l = n.contextType, c = gc, typeof l == "object" && l && (c = De(l)), s = n.getDerivedStateFromProps, (l = typeof s == "function" || typeof a.getSnapshotBeforeUpdate == "function") || typeof a.UNSAFE_componentWillReceiveProps != "function" && typeof a.componentWillReceiveProps != "function" || (o !== d || f !== c) && Hn(t, a, r, c), Rl = !1, f = t.memoizedState, a.state = f, ht(t, r, a, i), mt();
				var p = t.memoizedState;
				o !== d || f !== p || Rl || e !== null && e.dependencies !== null && Ee(e.dependencies) ? (typeof s == "function" && (Bn(t, n, s, r), p = t.memoizedState), (u = Rl || Vn(t, n, u, r, f, p, c) || e !== null && e.dependencies !== null && Ee(e.dependencies)) ? (l || typeof a.UNSAFE_componentWillUpdate != "function" && typeof a.componentWillUpdate != "function" || (typeof a.componentWillUpdate == "function" && a.componentWillUpdate(r, p, c), typeof a.UNSAFE_componentWillUpdate == "function" && a.UNSAFE_componentWillUpdate(r, p, c)), typeof a.componentDidUpdate == "function" && (t.flags |= 4), typeof a.getSnapshotBeforeUpdate == "function" && (t.flags |= 1024)) : (typeof a.componentDidUpdate != "function" || o === e.memoizedProps && f === e.memoizedState || (t.flags |= 4), typeof a.getSnapshotBeforeUpdate != "function" || o === e.memoizedProps && f === e.memoizedState || (t.flags |= 1024), t.memoizedProps = r, t.memoizedState = p), a.props = r, a.state = p, a.context = c, r = u) : (typeof a.componentDidUpdate != "function" || o === e.memoizedProps && f === e.memoizedState || (t.flags |= 4), typeof a.getSnapshotBeforeUpdate != "function" || o === e.memoizedProps && f === e.memoizedState || (t.flags |= 1024), r = !1);
			}
			return a = r, or(e, t), r = (t.flags & 128) != 0, a || r ? (a = t.stateNode, n = r && typeof n.getDerivedStateFromError != "function" ? null : a.render(), t.flags |= 1, e !== null && r ? (t.child = Nl(t, e.child, null, i), t.child = Nl(t, null, n, i)) : Xn(e, t, n, i), t.memoizedState = a.state, e = t.child) : e = vr(e, t, i), e;
		}
		function ur(e, t, n, r) {
			return ve(), t.flags |= 256, Xn(e, t, n, r), t.child;
		}
		function dr(e) {
			return {
				baseLanes: e,
				cachePool: qe()
			};
		}
		function fr(e, t, n) {
			return e = e === null ? 0 : e.childLanes & ~n, t && (e |= Bu), e;
		}
		function pr(e, t, n) {
			var r = t.pendingProps, i = !1, o = (t.flags & 128) != 0, s;
			if ((s = o) || (s = e !== null && e.memoizedState === null ? !1 : (Wl.current & 2) != 0), s && (i = !0, t.flags &= -129), s = (t.flags & 32) != 0, t.flags &= -33, e === null) {
				if (rl) {
					if (i ? bt(t) : Ct(t), (e = nl) ? (e = Os(e, al), e !== null && (t.memoizedState = {
						dehydrated: e,
						treeContext: Jc === null ? null : {
							id: Yc,
							overflow: Xc
						},
						retryLane: 536870912,
						hydrationErrors: null
					}, n = ba(e), n.return = t, t.child = n, tl = t, nl = null)) : e = null, e === null) throw he(t);
					return ms(e) ? t.lanes = 32 : t.lanes = 536870912, null;
				}
				var c = r.children;
				return r = r.fallback, i ? (Ct(t), i = t.mode, c = hr({
					mode: "hidden",
					children: c
				}, i), r = va(r, i, n, null), c.return = t, r.return = t, c.sibling = r, t.child = c, r = t.child, r.memoizedState = dr(n), r.childLanes = fr(e, s, n), t.memoizedState = cu, tr(null, r)) : (bt(t), mr(t, c));
			}
			var l = e.memoizedState;
			if (l !== null && (c = l.dehydrated, c !== null)) {
				if (o) t.flags & 256 ? (bt(t), t.flags &= -257, t = gr(e, t, n)) : t.memoizedState === null ? (Ct(t), c = r.fallback, i = t.mode, r = hr({
					mode: "visible",
					children: r.children
				}, i), c = va(c, i, n, null), c.flags |= 2, r.return = t, c.return = t, r.sibling = c, t.child = r, Nl(t, e.child, null, n), r = t.child, r.memoizedState = dr(n), r.childLanes = fr(e, s, n), t.memoizedState = cu, t = tr(null, r)) : (Ct(t), t.child = e.child, t.flags |= 128, t = null);
				else if (bt(t), ms(c)) s = hs(c).digest, r = Error(a(419)), r.stack = "", r.digest = s, be({
					value: r,
					source: null,
					stack: null
				}), t = gr(e, t, n);
				else if (su || Te(e, t, n, !1), s = (n & e.childLanes) !== 0, su || s) {
					if (s = Du, s !== null && (r = w(s, n), r !== 0 && r !== l.retryLane)) throw l.retryLane = r, ot(e, r), H(s, e, r), ou;
					ps(c) || Hi(), t = gr(e, t, n);
				} else ps(c) ? (t.flags |= 192, t.child = e.child, t = null) : (e = l.treeContext, _o && (nl = Cs(c), tl = t, rl = !0, il = null, al = !1, e !== null && ue(t, e)), t = mr(t, r.children), t.flags |= 4096);
				return t;
			}
			return i ? (Ct(t), c = r.fallback, i = t.mode, l = e.child, o = l.sibling, r = ha(l, {
				mode: "hidden",
				children: r.children
			}), r.subtreeFlags = l.subtreeFlags & 65011712, o === null ? (c = va(c, i, n, null), c.flags |= 2) : c = ha(o, c), c.return = t, r.return = t, r.sibling = c, t.child = r, tr(null, r), r = t.child, c = e.child.memoizedState, c === null ? c = dr(n) : (i = c.cachePool, i === null ? i = qe() : (l = mo ? pl._currentValue : pl._currentValue2, i = i.parent === l ? i : {
				parent: l,
				pool: l
			}), c = {
				baseLanes: c.baseLanes | n,
				cachePool: i
			}), r.memoizedState = c, r.childLanes = fr(e, s, n), t.memoizedState = cu, tr(e.child, r)) : (bt(t), n = e.child, e = n.sibling, n = ha(n, {
				mode: "visible",
				children: r.children
			}), n.return = t, n.sibling = null, e !== null && (s = t.deletions, s === null ? (t.deletions = [e], t.flags |= 16) : s.push(e)), t.child = n, t.memoizedState = null, n);
		}
		function mr(e, t) {
			return t = hr({
				mode: "visible",
				children: t
			}, e.mode), t.return = e, e.child = t;
		}
		function hr(e, n) {
			return e = t(22, e, null, n), e.lanes = 0, e;
		}
		function gr(e, t, n) {
			return Nl(t, e.child, null, n), e = mr(t, t.pendingProps.children), e.flags |= 2, t.memoizedState = null, e;
		}
		function _r(e, t, n) {
			e.lanes |= t;
			var r = e.alternate;
			r !== null && (r.lanes |= t), Ce(e.return, t, n);
		}
		function R(e, t, n, r, i, a) {
			var o = e.memoizedState;
			o === null ? e.memoizedState = {
				isBackwards: t,
				rendering: null,
				renderingStartTime: 0,
				last: r,
				tail: n,
				tailMode: i,
				treeForkCount: a
			} : (o.isBackwards = t, o.rendering = null, o.renderingStartTime = 0, o.last = r, o.tail = n, o.tailMode = i, o.treeForkCount = a);
		}
		function z(e, t, n) {
			var r = t.pendingProps, i = r.revealOrder, a = r.tail;
			r = r.children;
			var o = Wl.current, s = (o & 2) != 0;
			if (s ? (o = o & 1 | 2, t.flags |= 128) : o &= 1, h(Wl, o), Xn(e, t, r, n), r = rl ? G : 0, !s && e !== null && e.flags & 128) a: for (e = t.child; e !== null;) {
				if (e.tag === 13) e.memoizedState !== null && _r(e, n, t);
				else if (e.tag === 19) _r(e, n, t);
				else if (e.child !== null) {
					e.child.return = e, e = e.child;
					continue;
				}
				if (e === t) break a;
				for (; e.sibling === null;) {
					if (e.return === null || e.return === t) break a;
					e = e.return;
				}
				e.sibling.return = e.return, e = e.sibling;
			}
			switch (i) {
				case "forwards":
					for (n = t.child, i = null; n !== null;) e = n.alternate, e !== null && Tt(e) === null && (i = n), n = n.sibling;
					n = i, n === null ? (i = t.child, t.child = null) : (i = n.sibling, n.sibling = null), R(t, !1, i, n, a, r);
					break;
				case "backwards":
				case "unstable_legacy-backwards":
					for (n = null, i = t.child, t.child = null; i !== null;) {
						if (e = i.alternate, e !== null && Tt(e) === null) {
							t.child = i;
							break;
						}
						e = i.sibling, i.sibling = n, n = i, i = e;
					}
					R(t, !0, n, null, a, r);
					break;
				case "together":
					R(t, !1, null, null, void 0, r);
					break;
				default: t.memoizedState = null;
			}
			return t.child;
		}
		function vr(e, t, n) {
			if (e !== null && (t.dependencies = e.dependencies), Lu |= t.lanes, (n & t.childLanes) === 0) if (e !== null) {
				if (Te(e, t, n, !1), (n & t.childLanes) === 0) return null;
			} else return null;
			if (e !== null && t.child !== e.child) throw Error(a(153));
			if (t.child !== null) {
				for (e = t.child, n = ha(e, e.pendingProps), t.child = n, n.return = t; e.sibling !== null;) e = e.sibling, n = n.sibling = ha(e, e.pendingProps), n.return = t;
				n.sibling = null;
			}
			return t.child;
		}
		function yr(e, t) {
			return (e.lanes & t) === 0 ? (e = e.dependencies, !!(e !== null && Ee(e))) : !0;
		}
		function br(e, t, n) {
			switch (t.tag) {
				case 3:
					de(t, t.stateNode.containerInfo), xe(t, pl, e.memoizedState.cache), ve();
					break;
				case 27:
				case 5:
					pe(t);
					break;
				case 4:
					de(t, t.stateNode.containerInfo);
					break;
				case 10:
					xe(t, t.type, t.memoizedProps.value);
					break;
				case 31:
					if (t.memoizedState !== null) return t.flags |= 128, xt(t), null;
					break;
				case 13:
					var r = t.memoizedState;
					if (r !== null) return r.dehydrated === null ? (n & t.child.childLanes) === 0 ? (bt(t), e = vr(e, t, n), e === null ? null : e.sibling) : pr(e, t, n) : (bt(t), t.flags |= 128, null);
					bt(t);
					break;
				case 19:
					var i = (e.flags & 128) != 0;
					if (r = (n & t.childLanes) !== 0, r ||= (Te(e, t, n, !1), (n & t.childLanes) !== 0), i) {
						if (r) return z(e, t, n);
						t.flags |= 128;
					}
					if (i = t.memoizedState, i !== null && (i.rendering = null, i.tail = null, i.lastEffect = null), h(Wl, Wl.current), r) break;
					return null;
				case 22: return t.lanes = 0, er(e, t, n, t.pendingProps);
				case 24: xe(t, pl, e.memoizedState.cache);
			}
			return vr(e, t, n);
		}
		function xr(e, t, n) {
			if (e !== null) if (e.memoizedProps !== t.pendingProps) su = !0;
			else {
				if (!yr(e, n) && !(t.flags & 128)) return su = !1, br(e, t, n);
				su = !!(e.flags & 131072);
			}
			else su = !1, rl && t.flags & 1048576 && se(t, G, t.index);
			switch (t.lanes = 0, t.tag) {
				case 16:
					a: {
						var r = t.pendingProps;
						if (e = Ze(t.elementType), t.type = e, typeof e == "function") ma(e) ? (r = Un(e, r), t.tag = 1, t = lr(null, t, e, r, n)) : (t.tag = 0, t = sr(null, t, e, r, n));
						else {
							if (e != null) {
								var i = e.$$typeof;
								if (i === Va) {
									t.tag = 11, t = Zn(null, t, e, r, n);
									break a;
								} else if (i === Wa) {
									t.tag = 14, t = Qn(null, t, e, r, n);
									break a;
								}
							}
							throw t = f(e) || e, Error(a(306, t, ""));
						}
					}
					return t;
				case 0: return sr(e, t, t.type, t.pendingProps, n);
				case 1: return r = t.type, i = Un(r, t.pendingProps), lr(e, t, r, i, n);
				case 3:
					a: {
						if (de(t, t.stateNode.containerInfo), e === null) throw Error(a(387));
						var o = t.pendingProps;
						i = t.memoizedState, r = i.element, lt(e, t), ht(t, o, null, n);
						var s = t.memoizedState;
						if (o = s.cache, xe(t, pl, o), o !== i.cache && we(t, [pl], n, !0), mt(), o = s.element, _o && i.isDehydrated) if (i = {
							element: o,
							isDehydrated: !1,
							cache: s.cache
						}, t.updateQueue.baseState = i, t.memoizedState = i, t.flags & 256) {
							t = ur(e, t, o, n);
							break a;
						} else if (o !== r) {
							r = k(Error(a(424)), t), be(r), t = ur(e, t, o, n);
							break a;
						} else for (_o && (nl = xs(t.stateNode.containerInfo), tl = t, rl = !0, il = null, al = !0), n = Pl(t, null, o, n), t.child = n; n;) n.flags = n.flags & -3 | 4096, n = n.sibling;
						else {
							if (ve(), o === r) {
								t = vr(e, t, n);
								break a;
							}
							Xn(e, t, o, n);
						}
						t = t.child;
					}
					return t;
				case 26: if (Js) return or(e, t), e === null ? (n = Zs(t.type, null, t.pendingProps, null)) ? t.memoizedState = n : rl || (t.stateNode = rc(t.type, t.pendingProps, $c.current, t)) : t.memoizedState = Zs(t.type, e.memoizedProps, t.pendingProps, e.memoizedState), null;
				case 27: if (cc) return pe(t), e === null && cc && rl && (r = t.stateNode = lc(t.type, t.pendingProps, $c.current, Zc.current, !1), tl = t, al = !0, nl = ws(t.type, r, nl)), Xn(e, t, t.pendingProps.children, n), or(e, t), e === null && (t.flags |= 4194304), t.child;
				case 5: return e === null && rl && (Ks(t.type, t.pendingProps, Zc.current), (i = r = nl) && (r = Ts(r, t.type, t.pendingProps, al), r === null ? i = !1 : (t.stateNode = r, tl = t, nl = bs(r), al = !1, i = !0)), i || he(t)), pe(t), i = t.type, o = t.pendingProps, s = e === null ? null : e.memoizedProps, r = o.children, co(i, o) ? r = null : s !== null && co(i, s) && (t.flags |= 32), t.memoizedState !== null && (i = Ot(e, t, I, null, null, n), mo ? No._currentValue = i : No._currentValue2 = i), or(e, t), Xn(e, t, r, n), t.child;
				case 6: return e === null && rl && (qs(t.pendingProps, Zc.current), (e = n = nl) && (n = Es(n, t.pendingProps, al), n === null ? e = !1 : (t.stateNode = n, tl = t, nl = null, e = !0)), e || he(t)), null;
				case 13: return pr(e, t, n);
				case 4: return de(t, t.stateNode.containerInfo), r = t.pendingProps, e === null ? t.child = Nl(t, null, r, n) : Xn(e, t, r, n), t.child;
				case 11: return Zn(e, t, t.type, t.pendingProps, n);
				case 7: return Xn(e, t, t.pendingProps, n), t.child;
				case 8: return Xn(e, t, t.pendingProps.children, n), t.child;
				case 12: return Xn(e, t, t.pendingProps.children, n), t.child;
				case 10: return r = t.pendingProps, xe(t, t.type, r.value), Xn(e, t, r.children, n), t.child;
				case 9: return i = t.type._context, r = t.pendingProps.children, M(t), i = De(i), r = r(i), t.flags |= 1, Xn(e, t, r, n), t.child;
				case 14: return Qn(e, t, t.type, t.pendingProps, n);
				case 15: return $n(e, t, t.type, t.pendingProps, n);
				case 19: return z(e, t, n);
				case 31: return ar(e, t, n);
				case 22: return er(e, t, n, t.pendingProps);
				case 24: return M(t), r = De(pl), e === null ? (i = Ge(), i === null && (i = Du, o = Ae(), i.pooledCache = o, o.refCount++, o !== null && (i.pooledCacheLanes |= n), i = o), t.memoizedState = {
					parent: r,
					cache: i
				}, ct(t), xe(t, pl, i)) : ((e.lanes & n) !== 0 && (lt(e, t), ht(t, null, null, n), mt()), i = e.memoizedState, o = t.memoizedState, i.parent === r ? (r = o.cache, xe(t, pl, r), r !== i.cache && we(t, [pl], n, !0)) : (i = {
					parent: r,
					cache: r
				}, t.memoizedState = i, t.lanes === 0 && (t.memoizedState = t.updateQueue.baseState = i), xe(t, pl, r))), Xn(e, t, t.pendingProps.children, n), t.child;
				case 29: throw t.pendingProps;
			}
			throw Error(a(156, t.tag));
		}
		function Sr(e) {
			e.flags |= 4;
		}
		function Cr(e) {
			go && (e.flags |= 8);
		}
		function wr(e, t) {
			if (e !== null && e.child === t.child) return !1;
			if (t.flags & 16) return !0;
			for (e = t.child; e !== null;) {
				if (e.flags & 8218 || e.subtreeFlags & 8218) return !0;
				e = e.sibling;
			}
			return !1;
		}
		function Tr(e, t, n, r) {
			if (ho) for (n = t.child; n !== null;) {
				if (n.tag === 5 || n.tag === 6) oo(e, n.stateNode);
				else if (!(n.tag === 4 || cc && n.tag === 27) && n.child !== null) {
					n.child.return = n, n = n.child;
					continue;
				}
				if (n === t) break;
				for (; n.sibling === null;) {
					if (n.return === null || n.return === t) return;
					n = n.return;
				}
				n.sibling.return = n.return, n = n.sibling;
			}
			else if (go) for (var i = t.child; i !== null;) {
				if (i.tag === 5) {
					var a = i.stateNode;
					n && r && (a = ds(a, i.type, i.memoizedProps)), oo(e, a);
				} else if (i.tag === 6) a = i.stateNode, n && r && (a = fs(a, i.memoizedProps)), oo(e, a);
				else if (i.tag !== 4) {
					if (i.tag === 22 && i.memoizedState !== null) a = i.child, a !== null && (a.return = i), Tr(e, i, !0, !0);
					else if (i.child !== null) {
						i.child.return = i, i = i.child;
						continue;
					}
				}
				if (i === t) break;
				for (; i.sibling === null;) {
					if (i.return === null || i.return === t) return;
					i = i.return;
				}
				i.sibling.return = i.return, i = i.sibling;
			}
		}
		function Er(e, t, n, r) {
			var i = !1;
			if (go) for (var a = t.child; a !== null;) {
				if (a.tag === 5) {
					var o = a.stateNode;
					n && r && (o = ds(o, a.type, a.memoizedProps)), cs(e, o);
				} else if (a.tag === 6) o = a.stateNode, n && r && (o = fs(o, a.memoizedProps)), cs(e, o);
				else if (a.tag !== 4) {
					if (a.tag === 22 && a.memoizedState !== null) i = a.child, i !== null && (i.return = a), Er(e, a, !0, !0), i = !0;
					else if (a.child !== null) {
						a.child.return = a, a = a.child;
						continue;
					}
				}
				if (a === t) break;
				for (; a.sibling === null;) {
					if (a.return === null || a.return === t) return i;
					a = a.return;
				}
				a.sibling.return = a.return, a = a.sibling;
			}
			return i;
		}
		function Dr(e, t) {
			if (go && wr(e, t)) {
				e = t.stateNode;
				var n = e.containerInfo, r = ss();
				Er(r, t, !1, !1), e.pendingChildren = r, Sr(t), ls(n, r);
			}
		}
		function Or(e, t, n, r) {
			if (ho) e.memoizedProps !== r && Sr(t);
			else if (go) {
				var i = e.stateNode, a = e.memoizedProps;
				if ((e = wr(e, t)) || a !== r) {
					var o = Zc.current;
					a = os(i, n, a, r, !e, null), a === i ? t.stateNode = i : (Cr(t), so(a, n, r, o) && Sr(t), t.stateNode = a, e && Tr(a, t, !1, !1));
				} else t.stateNode = i;
			}
		}
		function kr(e, t, n, r, i) {
			if (e.mode & 32 && (n === null ? To(t, r) : Eo(t, n, r))) {
				if (e.flags |= 16777216, (i & 335544128) === i || Do(t, r)) if (Oo(e.stateNode, t, r)) e.flags |= 8192;
				else if (zi()) e.flags |= 8192;
				else throw Al = kl, Dl;
			} else e.flags &= -16777217;
		}
		function Ar(e, t) {
			if (ac(t)) {
				if (e.flags |= 16777216, !oc(t)) if (zi()) e.flags |= 8192;
				else throw Al = kl, Dl;
			} else e.flags &= -16777217;
		}
		function jr(e, t) {
			t !== null && (e.flags |= 4), e.flags & 16384 && (t = e.tag === 22 ? 536870912 : x(), e.lanes |= t, Vu |= t);
		}
		function Mr(e, t) {
			if (!rl) switch (e.tailMode) {
				case "hidden":
					t = e.tail;
					for (var n = null; t !== null;) t.alternate !== null && (n = t), t = t.sibling;
					n === null ? e.tail = null : n.sibling = null;
					break;
				case "collapsed":
					n = e.tail;
					for (var r = null; n !== null;) n.alternate !== null && (r = n), n = n.sibling;
					r === null ? t || e.tail === null ? e.tail = null : e.tail.sibling = null : r.sibling = null;
			}
		}
		function B(e) {
			var t = e.alternate !== null && e.alternate.child === e.child, n = 0, r = 0;
			if (t) for (var i = e.child; i !== null;) n |= i.lanes | i.childLanes, r |= i.subtreeFlags & 65011712, r |= i.flags & 65011712, i.return = e, i = i.sibling;
			else for (i = e.child; i !== null;) n |= i.lanes | i.childLanes, r |= i.subtreeFlags, r |= i.flags, i.return = e, i = i.sibling;
			return e.subtreeFlags |= r, e.childLanes = n, t;
		}
		function Nr(e, t, n) {
			var r = t.pendingProps;
			switch (le(t), t.tag) {
				case 16:
				case 15:
				case 0:
				case 11:
				case 7:
				case 8:
				case 12:
				case 9:
				case 14: return B(t), null;
				case 1: return B(t), null;
				case 3: return n = t.stateNode, r = null, e !== null && (r = e.memoizedState.cache), t.memoizedState.cache !== r && (t.flags |= 2048), Se(pl), fe(), n.pendingContext && (n.context = n.pendingContext, n.pendingContext = null), (e === null || e.child === null) && (_e(t) ? Sr(t) : e === null || e.memoizedState.isDehydrated && !(t.flags & 256) || (t.flags |= 1024, ye())), Dr(e, t), B(t), null;
				case 26: if (Js) {
					var i = t.type, o = t.memoizedState;
					return e === null ? (Sr(t), o === null ? (B(t), kr(t, i, null, r, n)) : (B(t), Ar(t, o))) : o ? o === e.memoizedState ? (B(t), t.flags &= -16777217) : (Sr(t), B(t), Ar(t, o)) : (o = e.memoizedProps, ho ? o !== r && Sr(t) : Or(e, t, i, r), B(t), kr(t, i, o, r, n)), null;
				}
				case 27: if (cc) {
					if (me(t), n = $c.current, i = t.type, e !== null && t.stateNode != null) ho ? e.memoizedProps !== r && Sr(t) : Or(e, t, i, r);
					else {
						if (!r) {
							if (t.stateNode === null) throw Error(a(166));
							return B(t), null;
						}
						e = Zc.current, _e(t) ? ge(t, e) : (e = lc(i, r, n, e, !0), t.stateNode = e, Sr(t));
					}
					return B(t), null;
				}
				case 5:
					if (me(t), i = t.type, e !== null && t.stateNode != null) Or(e, t, i, r);
					else {
						if (!r) {
							if (t.stateNode === null) throw Error(a(166));
							return B(t), null;
						}
						if (o = Zc.current, _e(t)) ge(t, o), zs(t.stateNode, i, r, o) && (t.flags |= 64);
						else {
							var s = ao(i, r, $c.current, o, t);
							Cr(t), Tr(s, t, !1, !1), t.stateNode = s, so(s, i, r, o) && Sr(t);
						}
					}
					return B(t), kr(t, t.type, e === null ? null : e.memoizedProps, t.pendingProps, n), null;
				case 6:
					if (e && t.stateNode != null) n = e.memoizedProps, ho ? n !== r && Sr(t) : go && (n === r ? t.stateNode = e.stateNode : (e = $c.current, n = Zc.current, Cr(t), t.stateNode = lo(r, e, n, t)));
					else {
						if (typeof r != "string" && t.stateNode === null) throw Error(a(166));
						if (e = $c.current, n = Zc.current, _e(t)) {
							if (!_o) throw Error(a(176));
							if (e = t.stateNode, n = t.memoizedProps, r = null, i = tl, i !== null) switch (i.tag) {
								case 27:
								case 5: r = i.memoizedProps;
							}
							As(e, n, t, r) || he(t, !0);
						} else Cr(t), t.stateNode = lo(r, e, n, t);
					}
					return B(t), null;
				case 31:
					if (n = t.memoizedState, e === null || e.memoizedState !== null) {
						if (r = _e(t), n !== null) {
							if (e === null) {
								if (!r) throw Error(a(318));
								if (!_o) throw Error(a(556));
								if (e = t.memoizedState, e = e === null ? null : e.dehydrated, !e) throw Error(a(557));
								js(e, t);
							} else ve(), !(t.flags & 128) && (t.memoizedState = null), t.flags |= 4;
							B(t), e = !1;
						} else n = ye(), e !== null && e.memoizedState !== null && (e.memoizedState.hydrationErrors = n), e = !0;
						if (!e) return t.flags & 256 ? (wt(t), t) : (wt(t), null);
						if (t.flags & 128) throw Error(a(558));
					}
					return B(t), null;
				case 13:
					if (r = t.memoizedState, e === null || e.memoizedState !== null && e.memoizedState.dehydrated !== null) {
						if (i = _e(t), r !== null && r.dehydrated !== null) {
							if (e === null) {
								if (!i) throw Error(a(318));
								if (!_o) throw Error(a(344));
								if (i = t.memoizedState, i = i === null ? null : i.dehydrated, !i) throw Error(a(317));
								Ms(i, t);
							} else ve(), !(t.flags & 128) && (t.memoizedState = null), t.flags |= 4;
							B(t), i = !1;
						} else i = ye(), e !== null && e.memoizedState !== null && (e.memoizedState.hydrationErrors = i), i = !0;
						if (!i) return t.flags & 256 ? (wt(t), t) : (wt(t), null);
					}
					return wt(t), t.flags & 128 ? (t.lanes = n, t) : (n = r !== null, e = e !== null && e.memoizedState !== null, n && (r = t.child, i = null, r.alternate !== null && r.alternate.memoizedState !== null && r.alternate.memoizedState.cachePool !== null && (i = r.alternate.memoizedState.cachePool.pool), o = null, r.memoizedState !== null && r.memoizedState.cachePool !== null && (o = r.memoizedState.cachePool.pool), o !== i && (r.flags |= 2048)), n !== e && n && (t.child.flags |= 8192), jr(t, t.updateQueue), B(t), null);
				case 4: return fe(), Dr(e, t), e === null && yo(t.stateNode.containerInfo), B(t), null;
				case 10: return Se(t.type), B(t), null;
				case 19:
					if (m(Wl), r = t.memoizedState, r === null) return B(t), null;
					if (i = (t.flags & 128) != 0, o = r.rendering, o === null) if (i) Mr(r, !1);
					else {
						if (Iu !== 0 || e !== null && e.flags & 128) for (e = t.child; e !== null;) {
							if (o = Tt(e), o !== null) {
								for (t.flags |= 128, Mr(r, !1), e = o.updateQueue, t.updateQueue = e, jr(t, e), t.subtreeFlags = 0, e = n, n = t.child; n !== null;) ga(n, e), n = n.sibling;
								return h(Wl, Wl.current & 1 | 2), rl && A(t, r.treeForkCount), t.child;
							}
							e = e.sibling;
						}
						r.tail !== null && Dc() > qu && (t.flags |= 128, i = !0, Mr(r, !1), t.lanes = 4194304);
					}
					else {
						if (!i) if (e = Tt(o), e !== null) {
							if (t.flags |= 128, i = !0, e = e.updateQueue, t.updateQueue = e, jr(t, e), Mr(r, !0), r.tail === null && r.tailMode === "hidden" && !o.alternate && !rl) return B(t), null;
						} else 2 * Dc() - r.renderingStartTime > qu && n !== 536870912 && (t.flags |= 128, i = !0, Mr(r, !1), t.lanes = 4194304);
						r.isBackwards ? (o.sibling = t.child, t.child = o) : (e = r.last, e === null ? t.child = o : e.sibling = o, r.last = o);
					}
					return r.tail === null ? (B(t), null) : (e = r.tail, r.rendering = e, r.tail = e.sibling, r.renderingStartTime = Dc(), e.sibling = null, n = Wl.current, h(Wl, i ? n & 1 | 2 : n & 1), rl && A(t, r.treeForkCount), e);
				case 22:
				case 23: return wt(t), yt(), r = t.memoizedState !== null, e === null ? r && (t.flags |= 8192) : e.memoizedState !== null !== r && (t.flags |= 8192), r ? n & 536870912 && !(t.flags & 128) && (B(t), t.subtreeFlags & 6 && (t.flags |= 8192)) : B(t), n = t.updateQueue, n !== null && jr(t, n.retryQueue), n = null, e !== null && e.memoizedState !== null && e.memoizedState.cachePool !== null && (n = e.memoizedState.cachePool.pool), r = null, t.memoizedState !== null && t.memoizedState.cachePool !== null && (r = t.memoizedState.cachePool.pool), r !== n && (t.flags |= 2048), e !== null && m(Tl), null;
				case 24: return n = null, e !== null && (n = e.memoizedState.cache), t.memoizedState.cache !== n && (t.flags |= 2048), Se(pl), B(t), null;
				case 25: return null;
				case 30: return null;
			}
			throw Error(a(156, t.tag));
		}
		function Pr(e, t) {
			switch (le(t), t.tag) {
				case 1: return e = t.flags, e & 65536 ? (t.flags = e & -65537 | 128, t) : null;
				case 3: return Se(pl), fe(), e = t.flags, e & 65536 && !(e & 128) ? (t.flags = e & -65537 | 128, t) : null;
				case 26:
				case 27:
				case 5: return me(t), null;
				case 31:
					if (t.memoizedState !== null) {
						if (wt(t), t.alternate === null) throw Error(a(340));
						ve();
					}
					return e = t.flags, e & 65536 ? (t.flags = e & -65537 | 128, t) : null;
				case 13:
					if (wt(t), e = t.memoizedState, e !== null && e.dehydrated !== null) {
						if (t.alternate === null) throw Error(a(340));
						ve();
					}
					return e = t.flags, e & 65536 ? (t.flags = e & -65537 | 128, t) : null;
				case 19: return m(Wl), null;
				case 4: return fe(), null;
				case 10: return Se(t.type), null;
				case 22:
				case 23: return wt(t), yt(), e !== null && m(Tl), e = t.flags, e & 65536 ? (t.flags = e & -65537 | 128, t) : null;
				case 24: return Se(pl), null;
				case 25: return null;
				default: return null;
			}
		}
		function Fr(e, t) {
			switch (le(t), t.tag) {
				case 3:
					Se(pl), fe();
					break;
				case 26:
				case 27:
				case 5:
					me(t);
					break;
				case 4:
					fe();
					break;
				case 31:
					t.memoizedState !== null && wt(t);
					break;
				case 13:
					wt(t);
					break;
				case 19:
					m(Wl);
					break;
				case 10:
					Se(t.type);
					break;
				case 22:
				case 23:
					wt(t), yt(), e !== null && m(Tl);
					break;
				case 24: Se(pl);
			}
		}
		function Ir(e, t) {
			try {
				var n = t.updateQueue, r = n === null ? null : n.lastEffect;
				if (r !== null) {
					var i = r.next;
					n = i;
					do {
						if ((n.tag & e) === e) {
							r = void 0;
							var a = n.create, o = n.inst;
							r = a(), o.destroy = r;
						}
						n = n.next;
					} while (n !== i);
				}
			} catch (e) {
				oa(t, t.return, e);
			}
		}
		function Lr(e, t, n) {
			try {
				var r = t.updateQueue, i = r === null ? null : r.lastEffect;
				if (i !== null) {
					var a = i.next;
					r = a;
					do {
						if ((r.tag & e) === e) {
							var o = r.inst, s = o.destroy;
							if (s !== void 0) {
								o.destroy = void 0, i = t;
								var c = n, l = s;
								try {
									l();
								} catch (e) {
									oa(i, c, e);
								}
							}
						}
						r = r.next;
					} while (r !== a);
				}
			} catch (e) {
				oa(t, t.return, e);
			}
		}
		function Rr(e) {
			var t = e.updateQueue;
			if (t !== null) {
				var n = e.stateNode;
				try {
					_t(t, n);
				} catch (t) {
					oa(e, e.return, t);
				}
			}
		}
		function zr(e, t, n) {
			n.props = Un(e.type, e.memoizedProps), n.state = e.memoizedState;
			try {
				n.componentWillUnmount();
			} catch (n) {
				oa(e, t, n);
			}
		}
		function Br(e, t) {
			try {
				var n = e.ref;
				if (n !== null) {
					switch (e.tag) {
						case 26:
						case 27:
						case 5:
							var r = eo(e.stateNode);
							break;
						case 30:
							r = e.stateNode;
							break;
						default: r = e.stateNode;
					}
					typeof n == "function" ? e.refCleanup = n(r) : n.current = r;
				}
			} catch (n) {
				oa(e, t, n);
			}
		}
		function Vr(e, t) {
			var n = e.ref, r = e.refCleanup;
			if (n !== null) if (typeof r == "function") try {
				r();
			} catch (n) {
				oa(e, t, n);
			} finally {
				e.refCleanup = null, e = e.alternate, e != null && (e.refCleanup = null);
			}
			else if (typeof n == "function") try {
				n(null);
			} catch (n) {
				oa(e, t, n);
			}
			else n.current = null;
		}
		function Hr(e) {
			var t = e.type, n = e.memoizedProps, r = e.stateNode;
			try {
				Jo(r, t, n, e);
			} catch (t) {
				oa(e, e.return, t);
			}
		}
		function Ur(e, t, n) {
			try {
				Yo(e.stateNode, e.type, n, t, e);
			} catch (t) {
				oa(e, e.return, t);
			}
		}
		function Wr(e) {
			return e.tag === 5 || e.tag === 3 || (Js ? e.tag === 26 : !1) || (cc ? e.tag === 27 && pc(e.type) : !1) || e.tag === 4;
		}
		function Gr(e) {
			a: for (;;) {
				for (; e.sibling === null;) {
					if (e.return === null || Wr(e.return)) return null;
					e = e.return;
				}
				for (e.sibling.return = e.return, e = e.sibling; e.tag !== 5 && e.tag !== 6 && e.tag !== 18;) {
					if (cc && e.tag === 27 && pc(e.type) || e.flags & 2 || e.child === null || e.tag === 4) continue a;
					e.child.return = e, e = e.child;
				}
				if (!(e.flags & 2)) return e.stateNode;
			}
		}
		function Kr(e, t, n) {
			var r = e.tag;
			if (r === 5 || r === 6) e = e.stateNode, t ? Zo(n, e, t) : Ko(n, e);
			else if (r !== 4 && (cc && r === 27 && pc(e.type) && (n = e.stateNode, t = null), e = e.child, e !== null)) for (Kr(e, t, n), e = e.sibling; e !== null;) Kr(e, t, n), e = e.sibling;
		}
		function qr(e, t, n) {
			var r = e.tag;
			if (r === 5 || r === 6) e = e.stateNode, t ? Xo(n, e, t) : Go(n, e);
			else if (r !== 4 && (cc && r === 27 && pc(e.type) && (n = e.stateNode), e = e.child, e !== null)) for (qr(e, t, n), e = e.sibling; e !== null;) qr(e, t, n), e = e.sibling;
		}
		function Jr(e, t, n) {
			e = e.containerInfo;
			try {
				us(e, n);
			} catch (e) {
				oa(t, t.return, e);
			}
		}
		function Yr(e) {
			var t = e.stateNode, n = e.memoizedProps;
			try {
				uc(e.type, n, t, e);
			} catch (t) {
				oa(e, e.return, t);
			}
		}
		function Xr(e, t) {
			for (ro(e.containerInfo), pu = t; pu !== null;) if (e = pu, t = e.child, e.subtreeFlags & 1028 && t !== null) t.return = e, pu = t;
			else for (; pu !== null;) {
				e = pu;
				var n = e.alternate;
				switch (t = e.flags, e.tag) {
					case 0:
						if (t & 4 && (t = e.updateQueue, t = t === null ? null : t.events, t !== null)) for (var r = 0; r < t.length; r++) {
							var i = t[r];
							i.ref.impl = i.nextImpl;
						}
						break;
					case 11:
					case 15: break;
					case 1:
						if (t & 1024 && n !== null) {
							t = void 0, r = e, i = n.memoizedProps, n = n.memoizedState;
							var o = r.stateNode;
							try {
								var s = Un(r.type, i);
								t = o.getSnapshotBeforeUpdate(s, n), o.__reactInternalSnapshotBeforeUpdate = t;
							} catch (e) {
								oa(r, r.return, e);
							}
						}
						break;
					case 3:
						t & 1024 && ho && as(e.stateNode.containerInfo);
						break;
					case 5:
					case 26:
					case 27:
					case 6:
					case 4:
					case 17: break;
					default: if (t & 1024) throw Error(a(163));
				}
				if (t = e.sibling, t !== null) {
					t.return = e.return, pu = t;
					break;
				}
				pu = e.return;
			}
		}
		function Zr(e, t, n) {
			var r = n.flags;
			switch (n.tag) {
				case 0:
				case 11:
				case 15:
					li(e, n), r & 4 && Ir(5, n);
					break;
				case 1:
					if (li(e, n), r & 4) if (e = n.stateNode, t === null) try {
						e.componentDidMount();
					} catch (e) {
						oa(n, n.return, e);
					}
					else {
						var i = Un(n.type, t.memoizedProps);
						t = t.memoizedState;
						try {
							e.componentDidUpdate(i, t, e.__reactInternalSnapshotBeforeUpdate);
						} catch (e) {
							oa(n, n.return, e);
						}
					}
					r & 64 && Rr(n), r & 512 && Br(n, n.return);
					break;
				case 3:
					if (li(e, n), r & 64 && (r = n.updateQueue, r !== null)) {
						if (e = null, n.child !== null) switch (n.child.tag) {
							case 27:
							case 5:
								e = eo(n.child.stateNode);
								break;
							case 1: e = n.child.stateNode;
						}
						try {
							_t(r, e);
						} catch (e) {
							oa(n, n.return, e);
						}
					}
					break;
				case 27: cc && t === null && r & 4 && Yr(n);
				case 26:
				case 5:
					if (li(e, n), t === null) {
						if (r & 4) Hr(n);
						else if (r & 64) {
							e = n.type, t = n.memoizedProps, i = n.stateNode;
							try {
								Fs(i, e, t, n);
							} catch (e) {
								oa(n, n.return, e);
							}
						}
					}
					r & 512 && Br(n, n.return);
					break;
				case 12:
					li(e, n);
					break;
				case 31:
					li(e, n), r & 4 && ti(e, n);
					break;
				case 13:
					li(e, n), r & 4 && ni(e, n), r & 64 && (r = n.memoizedState, r !== null && (r = r.dehydrated, r !== null && (n = ua.bind(null, n), gs(r, n))));
					break;
				case 22:
					if (r = n.memoizedState !== null || lu, !r) {
						t = t !== null && t.memoizedState !== null || uu, i = lu;
						var a = uu;
						lu = r, (uu = t) && !a ? di(e, n, (n.subtreeFlags & 8772) != 0) : li(e, n), lu = i, uu = a;
					}
					break;
				case 30: break;
				default: li(e, n);
			}
		}
		function Qr(e) {
			var t = e.alternate;
			t !== null && (e.alternate = null, Qr(t)), e.child = null, e.deletions = null, e.sibling = null, e.tag === 5 && (t = e.stateNode, t !== null && wo(t)), e.stateNode = null, e.return = null, e.dependencies = null, e.memoizedProps = null, e.memoizedState = null, e.pendingProps = null, e.stateNode = null, e.updateQueue = null;
		}
		function $r(e, t, n) {
			for (n = n.child; n !== null;) ei(e, t, n), n = n.sibling;
		}
		function ei(e, t, n) {
			if (Fc && typeof Fc.onCommitFiberUnmount == "function") try {
				Fc.onCommitFiberUnmount(Pc, n);
			} catch {}
			switch (n.tag) {
				case 26: if (Js) {
					uu || Vr(n, t), $r(e, t, n), n.memoizedState ? $s(n.memoizedState) : n.stateNode && nc(n.stateNode);
					break;
				}
				case 27: if (cc) {
					uu || Vr(n, t);
					var r = mu, i = hu;
					pc(n.type) && (mu = n.stateNode, hu = !1), $r(e, t, n), dc(n.stateNode), mu = r, hu = i;
					break;
				}
				case 5: uu || Vr(n, t);
				case 6:
					if (ho) {
						if (r = mu, i = hu, mu = null, $r(e, t, n), mu = r, hu = i, mu !== null) if (hu) try {
							$o(mu, n.stateNode);
						} catch (e) {
							oa(n, t, e);
						}
						else try {
							Qo(mu, n.stateNode);
						} catch (e) {
							oa(n, t, e);
						}
					} else $r(e, t, n);
					break;
				case 18:
					ho && mu !== null && (hu ? Hs(mu, n.stateNode) : Vs(mu, n.stateNode));
					break;
				case 4:
					ho ? (r = mu, i = hu, mu = n.stateNode.containerInfo, hu = !0, $r(e, t, n), mu = r, hu = i) : (go && Jr(n.stateNode, n, ss()), $r(e, t, n));
					break;
				case 0:
				case 11:
				case 14:
				case 15:
					Lr(2, n, t), uu || Lr(4, n, t), $r(e, t, n);
					break;
				case 1:
					uu || (Vr(n, t), r = n.stateNode, typeof r.componentWillUnmount == "function" && zr(n, t, r)), $r(e, t, n);
					break;
				case 21:
					$r(e, t, n);
					break;
				case 22:
					uu = (r = uu) || n.memoizedState !== null, $r(e, t, n), uu = r;
					break;
				default: $r(e, t, n);
			}
		}
		function ti(e, t) {
			if (_o && t.memoizedState === null && (e = t.alternate, e !== null && (e = e.memoizedState, e !== null))) {
				e = e.dehydrated;
				try {
					Ls(e);
				} catch (e) {
					oa(t, t.return, e);
				}
			}
		}
		function ni(e, t) {
			if (_o && t.memoizedState === null && (e = t.alternate, e !== null && (e = e.memoizedState, e !== null && (e = e.dehydrated, e !== null)))) try {
				Rs(e);
			} catch (e) {
				oa(t, t.return, e);
			}
		}
		function ri(e) {
			switch (e.tag) {
				case 31:
				case 13:
				case 19:
					var t = e.stateNode;
					return t === null && (t = e.stateNode = new fu()), t;
				case 22: return e = e.stateNode, t = e._retryCache, t === null && (t = e._retryCache = new fu()), t;
				default: throw Error(a(435, e.tag));
			}
		}
		function ii(e, t) {
			var n = ri(e);
			t.forEach(function(t) {
				if (!n.has(t)) {
					n.add(t);
					var r = da.bind(null, e, t);
					t.then(r, r);
				}
			});
		}
		function ai(e, t) {
			var n = t.deletions;
			if (n !== null) for (var r = 0; r < n.length; r++) {
				var i = n[r], o = e, s = t;
				if (ho) {
					var c = s;
					a: for (; c !== null;) {
						switch (c.tag) {
							case 27: if (cc) {
								if (pc(c.type)) {
									mu = c.stateNode, hu = !1;
									break a;
								}
								break;
							}
							case 5:
								mu = c.stateNode, hu = !1;
								break a;
							case 3:
							case 4:
								mu = c.stateNode.containerInfo, hu = !0;
								break a;
						}
						c = c.return;
					}
					if (mu === null) throw Error(a(160));
					ei(o, s, i), mu = null, hu = !1;
				} else ei(o, s, i);
				o = i.alternate, o !== null && (o.return = null), i.return = null;
			}
			if (t.subtreeFlags & 13886) for (t = t.child; t !== null;) oi(t, e), t = t.sibling;
		}
		function oi(e, t) {
			var n = e.alternate, r = e.flags;
			switch (e.tag) {
				case 0:
				case 11:
				case 14:
				case 15:
					ai(t, e), si(e), r & 4 && (Lr(3, e, e.return), Ir(3, e), Lr(5, e, e.return));
					break;
				case 1:
					ai(t, e), si(e), r & 512 && (uu || n === null || Vr(n, n.return)), r & 64 && lu && (e = e.updateQueue, e !== null && (r = e.callbacks, r !== null && (n = e.shared.hiddenCallbacks, e.shared.hiddenCallbacks = n === null ? r : n.concat(r))));
					break;
				case 26: if (Js) {
					var i = gu;
					if (ai(t, e), si(e), r & 512 && (uu || n === null || Vr(n, n.return)), r & 4) {
						r = n === null ? null : n.memoizedState;
						var o = e.memoizedState;
						n === null ? o === null ? e.stateNode === null ? e.stateNode = ec(i, e.type, e.memoizedProps, e) : tc(i, e.type, e.stateNode) : e.stateNode = Qs(i, o, e.memoizedProps) : r === o ? o === null && e.stateNode !== null && Ur(e, e.memoizedProps, n.memoizedProps) : (r === null ? n.stateNode !== null && nc(n.stateNode) : $s(r), o === null ? tc(i, e.type, e.stateNode) : Qs(i, o, e.memoizedProps));
					}
					break;
				}
				case 27: if (cc) {
					ai(t, e), si(e), r & 512 && (uu || n === null || Vr(n, n.return)), n !== null && r & 4 && Ur(e, e.memoizedProps, n.memoizedProps);
					break;
				}
				case 5:
					if (ai(t, e), si(e), r & 512 && (uu || n === null || Vr(n, n.return)), ho) {
						if (e.flags & 32) {
							i = e.stateNode;
							try {
								es(i);
							} catch (t) {
								oa(e, e.return, t);
							}
						}
						r & 4 && e.stateNode != null && (i = e.memoizedProps, Ur(e, i, n === null ? i : n.memoizedProps)), r & 1024 && (du = !0);
					} else go && e.alternate !== null && (e.alternate.stateNode = e.stateNode);
					break;
				case 6:
					if (ai(t, e), si(e), r & 4 && ho) {
						if (e.stateNode === null) throw Error(a(162));
						r = e.memoizedProps, n = n === null ? r : n.memoizedProps, i = e.stateNode;
						try {
							qo(i, n, r);
						} catch (t) {
							oa(e, e.return, t);
						}
					}
					break;
				case 3:
					if (Js ? (ic(), i = gu, gu = Xs(t.containerInfo), ai(t, e), gu = i) : ai(t, e), si(e), r & 4) {
						if (ho && _o && n !== null && n.memoizedState.isDehydrated) try {
							Is(t.containerInfo);
						} catch (t) {
							oa(e, e.return, t);
						}
						if (go) {
							r = t.containerInfo, n = t.pendingChildren;
							try {
								us(r, n);
							} catch (t) {
								oa(e, e.return, t);
							}
						}
					}
					du && (du = !1, ci(e));
					break;
				case 4:
					Js ? (n = gu, gu = Xs(e.stateNode.containerInfo), ai(t, e), si(e), gu = n) : (ai(t, e), si(e)), r & 4 && go && Jr(e.stateNode, e, e.stateNode.pendingChildren);
					break;
				case 12:
					ai(t, e), si(e);
					break;
				case 31:
					ai(t, e), si(e), r & 4 && (r = e.updateQueue, r !== null && (e.updateQueue = null, ii(e, r)));
					break;
				case 13:
					ai(t, e), si(e), e.child.flags & 8192 && e.memoizedState !== null != (n !== null && n.memoizedState !== null) && (Gu = Dc()), r & 4 && (r = e.updateQueue, r !== null && (e.updateQueue = null, ii(e, r)));
					break;
				case 22:
					i = e.memoizedState !== null;
					var s = n !== null && n.memoizedState !== null, c = lu, l = uu;
					if (lu = c || i, uu = l || s, ai(t, e), uu = l, lu = c, si(e), r & 8192 && (t = e.stateNode, t._visibility = i ? t._visibility & -2 : t._visibility | 1, i && (n === null || s || lu || uu || ui(e)), ho)) {
						a: if (n = null, ho) for (t = e;;) {
							if (t.tag === 5 || Js && t.tag === 26) {
								if (n === null) {
									s = n = t;
									try {
										o = s.stateNode, i ? ts(o) : rs(s.stateNode, s.memoizedProps);
									} catch (e) {
										oa(s, s.return, e);
									}
								}
							} else if (t.tag === 6) {
								if (n === null) {
									s = t;
									try {
										var u = s.stateNode;
										i ? ns(u) : is(u, s.memoizedProps);
									} catch (e) {
										oa(s, s.return, e);
									}
								}
							} else if (t.tag === 18) {
								if (n === null) {
									s = t;
									try {
										var d = s.stateNode;
										i ? Us(d) : Ws(s.stateNode);
									} catch (e) {
										oa(s, s.return, e);
									}
								}
							} else if ((t.tag !== 22 && t.tag !== 23 || t.memoizedState === null || t === e) && t.child !== null) {
								t.child.return = t, t = t.child;
								continue;
							}
							if (t === e) break a;
							for (; t.sibling === null;) {
								if (t.return === null || t.return === e) break a;
								n === t && (n = null), t = t.return;
							}
							n === t && (n = null), t.sibling.return = t.return, t = t.sibling;
						}
					}
					r & 4 && (r = e.updateQueue, r !== null && (n = r.retryQueue, n !== null && (r.retryQueue = null, ii(e, n))));
					break;
				case 19:
					ai(t, e), si(e), r & 4 && (r = e.updateQueue, r !== null && (e.updateQueue = null, ii(e, r)));
					break;
				case 30: break;
				case 21: break;
				default: ai(t, e), si(e);
			}
		}
		function si(e) {
			var t = e.flags;
			if (t & 2) {
				try {
					for (var n, r = e.return; r !== null;) {
						if (Wr(r)) {
							n = r;
							break;
						}
						r = r.return;
					}
					if (ho) {
						if (n == null) throw Error(a(160));
						switch (n.tag) {
							case 27: if (cc) {
								var i = n.stateNode;
								qr(e, Gr(e), i);
								break;
							}
							case 5:
								var o = n.stateNode;
								n.flags & 32 && (es(o), n.flags &= -33), qr(e, Gr(e), o);
								break;
							case 3:
							case 4:
								var s = n.stateNode.containerInfo;
								Kr(e, Gr(e), s);
								break;
							default: throw Error(a(161));
						}
					}
				} catch (t) {
					oa(e, e.return, t);
				}
				e.flags &= -3;
			}
			t & 4096 && (e.flags &= -4097);
		}
		function ci(e) {
			if (e.subtreeFlags & 1024) for (e = e.child; e !== null;) {
				var t = e;
				ci(t), t.tag === 5 && t.flags & 1024 && Po(t.stateNode), e = e.sibling;
			}
		}
		function li(e, t) {
			if (t.subtreeFlags & 8772) for (t = t.child; t !== null;) Zr(e, t.alternate, t), t = t.sibling;
		}
		function ui(e) {
			for (e = e.child; e !== null;) {
				var t = e;
				switch (t.tag) {
					case 0:
					case 11:
					case 14:
					case 15:
						Lr(4, t, t.return), ui(t);
						break;
					case 1:
						Vr(t, t.return);
						var n = t.stateNode;
						typeof n.componentWillUnmount == "function" && zr(t, t.return, n), ui(t);
						break;
					case 27: cc && dc(t.stateNode);
					case 26:
					case 5:
						Vr(t, t.return), ui(t);
						break;
					case 22:
						t.memoizedState === null && ui(t);
						break;
					case 30:
						ui(t);
						break;
					default: ui(t);
				}
				e = e.sibling;
			}
		}
		function di(e, t, n) {
			for (n &&= (t.subtreeFlags & 8772) != 0, t = t.child; t !== null;) {
				var r = t.alternate, i = e, a = t, o = a.flags;
				switch (a.tag) {
					case 0:
					case 11:
					case 15:
						di(i, a, n), Ir(4, a);
						break;
					case 1:
						if (di(i, a, n), r = a, i = r.stateNode, typeof i.componentDidMount == "function") try {
							i.componentDidMount();
						} catch (e) {
							oa(r, r.return, e);
						}
						if (r = a, i = r.updateQueue, i !== null) {
							var s = r.stateNode;
							try {
								var c = i.shared.hiddenCallbacks;
								if (c !== null) for (i.shared.hiddenCallbacks = null, i = 0; i < c.length; i++) gt(c[i], s);
							} catch (e) {
								oa(r, r.return, e);
							}
						}
						n && o & 64 && Rr(a), Br(a, a.return);
						break;
					case 27: cc && Yr(a);
					case 26:
					case 5:
						di(i, a, n), n && r === null && o & 4 && Hr(a), Br(a, a.return);
						break;
					case 12:
						di(i, a, n);
						break;
					case 31:
						di(i, a, n), n && o & 4 && ti(i, a);
						break;
					case 13:
						di(i, a, n), n && o & 4 && ni(i, a);
						break;
					case 22:
						a.memoizedState === null && di(i, a, n), Br(a, a.return);
						break;
					case 30: break;
					default: di(i, a, n);
				}
				t = t.sibling;
			}
		}
		function fi(e, t) {
			var n = null;
			e !== null && e.memoizedState !== null && e.memoizedState.cachePool !== null && (n = e.memoizedState.cachePool.pool), e = null, t.memoizedState !== null && t.memoizedState.cachePool !== null && (e = t.memoizedState.cachePool.pool), e !== n && (e != null && e.refCount++, n != null && je(n));
		}
		function V(e, t) {
			e = null, t.alternate !== null && (e = t.alternate.memoizedState.cache), t = t.memoizedState.cache, t !== e && (t.refCount++, e != null && je(e));
		}
		function pi(e, t, n, r) {
			if (t.subtreeFlags & 10256) for (t = t.child; t !== null;) mi(e, t, n, r), t = t.sibling;
		}
		function mi(e, t, n, r) {
			var i = t.flags;
			switch (t.tag) {
				case 0:
				case 11:
				case 15:
					pi(e, t, n, r), i & 2048 && Ir(9, t);
					break;
				case 1:
					pi(e, t, n, r);
					break;
				case 3:
					pi(e, t, n, r), i & 2048 && (e = null, t.alternate !== null && (e = t.alternate.memoizedState.cache), t = t.memoizedState.cache, t !== e && (t.refCount++, e != null && je(e)));
					break;
				case 12:
					if (i & 2048) {
						pi(e, t, n, r), e = t.stateNode;
						try {
							var a = t.memoizedProps, o = a.id, s = a.onPostCommit;
							typeof s == "function" && s(o, t.alternate === null ? "mount" : "update", e.passiveEffectDuration, -0);
						} catch (e) {
							oa(t, t.return, e);
						}
					} else pi(e, t, n, r);
					break;
				case 31:
					pi(e, t, n, r);
					break;
				case 13:
					pi(e, t, n, r);
					break;
				case 23: break;
				case 22:
					a = t.stateNode, o = t.alternate, t.memoizedState === null ? a._visibility & 2 ? pi(e, t, n, r) : (a._visibility |= 2, hi(e, t, n, r, (t.subtreeFlags & 10256) != 0 || !1)) : a._visibility & 2 ? pi(e, t, n, r) : gi(e, t), i & 2048 && fi(o, t);
					break;
				case 24:
					pi(e, t, n, r), i & 2048 && V(t.alternate, t);
					break;
				default: pi(e, t, n, r);
			}
		}
		function hi(e, t, n, r, i) {
			for (i &&= (t.subtreeFlags & 10256) != 0 || !1, t = t.child; t !== null;) {
				var a = e, o = t, s = n, c = r, l = o.flags;
				switch (o.tag) {
					case 0:
					case 11:
					case 15:
						hi(a, o, s, c, i), Ir(8, o);
						break;
					case 23: break;
					case 22:
						var u = o.stateNode;
						o.memoizedState === null ? (u._visibility |= 2, hi(a, o, s, c, i)) : u._visibility & 2 ? hi(a, o, s, c, i) : gi(a, o), i && l & 2048 && fi(o.alternate, o);
						break;
					case 24:
						hi(a, o, s, c, i), i && l & 2048 && V(o.alternate, o);
						break;
					default: hi(a, o, s, c, i);
				}
				t = t.sibling;
			}
		}
		function gi(e, t) {
			if (t.subtreeFlags & 10256) for (t = t.child; t !== null;) {
				var n = e, r = t, i = r.flags;
				switch (r.tag) {
					case 22:
						gi(n, r), i & 2048 && fi(r.alternate, r);
						break;
					case 24:
						gi(n, r), i & 2048 && V(r.alternate, r);
						break;
					default: gi(n, r);
				}
				t = t.sibling;
			}
		}
		function _i(e, t, n) {
			if (e.subtreeFlags & _u) for (e = e.child; e !== null;) vi(e, t, n), e = e.sibling;
		}
		function vi(e, t, n) {
			switch (e.tag) {
				case 26:
					if (_i(e, t, n), e.flags & _u) if (e.memoizedState !== null) sc(n, gu, e.memoizedState, e.memoizedProps);
					else {
						var r = e.stateNode, i = e.type;
						e = e.memoizedProps, ((t & 335544128) === t || Do(i, e)) && Ao(n, r, i, e);
					}
					break;
				case 5:
					_i(e, t, n), e.flags & _u && (r = e.stateNode, i = e.type, e = e.memoizedProps, ((t & 335544128) === t || Do(i, e)) && Ao(n, r, i, e));
					break;
				case 3:
				case 4:
					Js ? (r = gu, gu = Xs(e.stateNode.containerInfo), _i(e, t, n), gu = r) : _i(e, t, n);
					break;
				case 22:
					e.memoizedState === null && (r = e.alternate, r !== null && r.memoizedState !== null ? (r = _u, _u = 16777216, _i(e, t, n), _u = r) : _i(e, t, n));
					break;
				default: _i(e, t, n);
			}
		}
		function yi(e) {
			var t = e.alternate;
			if (t !== null && (e = t.child, e !== null)) {
				t.child = null;
				do
					t = e.sibling, e.sibling = null, e = t;
				while (e !== null);
			}
		}
		function bi(e) {
			var t = e.deletions;
			if (e.flags & 16) {
				if (t !== null) for (var n = 0; n < t.length; n++) {
					var r = t[n];
					pu = r, Ci(r, e);
				}
				yi(e);
			}
			if (e.subtreeFlags & 10256) for (e = e.child; e !== null;) xi(e), e = e.sibling;
		}
		function xi(e) {
			switch (e.tag) {
				case 0:
				case 11:
				case 15:
					bi(e), e.flags & 2048 && Lr(9, e, e.return);
					break;
				case 3:
					bi(e);
					break;
				case 12:
					bi(e);
					break;
				case 22:
					var t = e.stateNode;
					e.memoizedState !== null && t._visibility & 2 && (e.return === null || e.return.tag !== 13) ? (t._visibility &= -3, Si(e)) : bi(e);
					break;
				default: bi(e);
			}
		}
		function Si(e) {
			var t = e.deletions;
			if (e.flags & 16) {
				if (t !== null) for (var n = 0; n < t.length; n++) {
					var r = t[n];
					pu = r, Ci(r, e);
				}
				yi(e);
			}
			for (e = e.child; e !== null;) {
				switch (t = e, t.tag) {
					case 0:
					case 11:
					case 15:
						Lr(8, t, t.return), Si(t);
						break;
					case 22:
						n = t.stateNode, n._visibility & 2 && (n._visibility &= -3, Si(t));
						break;
					default: Si(t);
				}
				e = e.sibling;
			}
		}
		function Ci(e, t) {
			for (; pu !== null;) {
				var n = pu;
				switch (n.tag) {
					case 0:
					case 11:
					case 15:
						Lr(8, n, t);
						break;
					case 23:
					case 22:
						if (n.memoizedState !== null && n.memoizedState.cachePool !== null) {
							var r = n.memoizedState.cachePool.pool;
							r != null && r.refCount++;
						}
						break;
					case 24: je(n.memoizedState.cache);
				}
				if (r = n.child, r !== null) r.return = n, pu = r;
				else a: for (n = e; pu !== null;) {
					r = pu;
					var i = r.sibling, a = r.return;
					if (Qr(r), r === n) {
						pu = null;
						break a;
					}
					if (i !== null) {
						i.return = a, pu = i;
						break a;
					}
					pu = a;
				}
			}
		}
		function wi(e) {
			var t = vo(e);
			if (t != null) {
				if (typeof t.memoizedProps["data-testname"] != "string") throw Error(a(364));
				return t;
			}
			if (e = Ro(e), e === null) throw Error(a(362));
			return e.stateNode.current;
		}
		function Ti(e, t) {
			var n = e.tag;
			switch (t.$$typeof) {
				case yu:
					if (e.type === t.value) return !0;
					break;
				case bu:
					a: {
						for (t = t.value, e = [e, 0], n = 0; n < e.length;) {
							var r = e[n++], i = r.tag, o = e[n++], s = t[o];
							if (i !== 5 && i !== 26 && i !== 27 || !Vo(r)) {
								for (; s != null && Ti(r, s);) o++, s = t[o];
								if (o === t.length) {
									t = !0;
									break a;
								} else for (r = r.child; r !== null;) e.push(r, o), r = r.sibling;
							}
						}
						t = !1;
					}
					return t;
				case xu:
					if ((n === 5 || n === 26 || n === 27) && Ho(e.stateNode, t.value)) return !0;
					break;
				case Cu:
					if ((n === 5 || n === 6 || n === 26 || n === 27) && (e = Bo(e), e !== null && 0 <= e.indexOf(t.value))) return !0;
					break;
				case Su:
					if ((n === 5 || n === 26 || n === 27) && (e = e.memoizedProps["data-testname"], typeof e == "string" && e.toLowerCase() === t.value.toLowerCase())) return !0;
					break;
				default: throw Error(a(365));
			}
			return !1;
		}
		function Ei(e) {
			switch (e.$$typeof) {
				case yu: return "<" + (f(e.value) || "Unknown") + ">";
				case bu: return ":has(" + (Ei(e) || "") + ")";
				case xu: return "[role=\"" + e.value + "\"]";
				case Cu: return "\"" + e.value + "\"";
				case Su: return "[data-testname=\"" + e.value + "\"]";
				default: throw Error(a(365));
			}
		}
		function Di(e, t) {
			var n = [];
			e = [e, 0];
			for (var r = 0; r < e.length;) {
				var i = e[r++], a = i.tag, o = e[r++], s = t[o];
				if (a !== 5 && a !== 26 && a !== 27 || !Vo(i)) {
					for (; s != null && Ti(i, s);) o++, s = t[o];
					if (o === t.length) n.push(i);
					else for (i = i.child; i !== null;) e.push(i, o), i = i.sibling;
				}
			}
			return n;
		}
		function Oi(e, t) {
			if (!Lo) throw Error(a(363));
			e = wi(e), e = Di(e, t), t = [], e = Array.from(e);
			for (var n = 0; n < e.length;) {
				var r = e[n++], i = r.tag;
				if (i === 5 || i === 26 || i === 27) Vo(r) || t.push(r.stateNode);
				else for (r = r.child; r !== null;) e.push(r), r = r.sibling;
			}
			return t;
		}
		function ki() {
			return Eu & 2 && ku !== 0 ? ku & -ku : U.T === null ? So() : Ve();
		}
		function Ai() {
			if (Bu === 0) if (!(ku & 536870912) || rl) {
				var e = xc;
				xc <<= 1, !(xc & 3932160) && (xc = 262144), Bu = e;
			} else Bu = 536870912;
			return e = Hl.current, e !== null && (e.flags |= 32), Bu;
		}
		function H(e, t, n) {
			(e === Du && (Au === 2 || Au === 9) || e.cancelPendingCommit !== null) && (Li(e, 0), Pi(e, ku, Bu, !1)), S(e, n), (!(Eu & 2) || e !== Du) && (e === Du && (!(Eu & 2) && (Ru |= n), Iu === 4 && Pi(e, ku, Bu, !1)), Ne(e));
		}
		function ji(e, t, n) {
			if (Eu & 6) throw Error(a(327));
			var r = !n && (t & 127) == 0 && (t & e.expiredLanes) === 0 || y(e, t), i = r ? Gi(e, t) : Ui(e, t, !0), o = r;
			do {
				if (i === 0) {
					Nu && !r && Pi(e, t, 0, !1);
					break;
				} else {
					if (n = e.current.alternate, o && !Ni(n)) {
						i = Ui(e, t, !1), o = !1;
						continue;
					}
					if (i === 2) {
						if (o = t, e.errorRecoveryDisabledLanes & o) var s = 0;
						else s = e.pendingLanes & -536870913, s = s === 0 ? s & 536870912 ? 536870912 : 0 : s;
						if (s !== 0) {
							t = s;
							a: {
								var c = e;
								i = Hu;
								var l = _o && c.current.memoizedState.isDehydrated;
								if (l && (Li(c, s).flags |= 256), s = Ui(c, s, !1), s !== 2) {
									if (Pu && !l) {
										c.errorRecoveryDisabledLanes |= o, Ru |= o, i = 4;
										break a;
									}
									o = Uu, Uu = i, o !== null && (Uu === null ? Uu = o : Uu.push.apply(Uu, o));
								}
								i = s;
							}
							if (o = !1, i !== 2) continue;
						}
					}
					if (i === 1) {
						Li(e, 0), Pi(e, t, 0, !0);
						break;
					}
					a: {
						switch (r = e, o = i, o) {
							case 0:
							case 1: throw Error(a(345));
							case 4: if ((t & 4194048) !== t) break;
							case 6:
								Pi(r, t, Bu, !Mu);
								break a;
							case 2:
								Uu = null;
								break;
							case 3:
							case 5: break;
							default: throw Error(a(329));
						}
						if ((t & 62914560) === t && (i = Gu + 300 - Dc(), 10 < i)) {
							if (Pi(r, t, Bu, !Mu), v(r, 0, !0) !== 0) break a;
							$u = t, r.timeoutHandle = uo(Mi.bind(null, r, n, Uu, Ju, Wu, t, Bu, Ru, Vu, Mu, o, "Throttled", -0, 0), i);
							break a;
						}
						Mi(r, n, Uu, Ju, Wu, t, Bu, Ru, Vu, Mu, o, null, -0, 0);
					}
				}
				break;
			} while (1);
			Ne(e);
		}
		function Mi(e, t, n, r, i, a, o, s, c, l, u, d, f, p) {
			if (e.timeoutHandle = po, d = t.subtreeFlags, d & 8192 || (d & 16785408) == 16785408) {
				d = ko(), vi(t, a, d);
				var m = (a & 62914560) === a ? Gu - Dc() : (a & 4194048) === a ? Ku - Dc() : 0;
				if (m = jo(d, m), m !== null) {
					$u = a, e.cancelPendingCommit = m(Qi.bind(null, e, t, a, n, r, i, o, s, c, u, d, null, f, p)), Pi(e, a, o, !l);
					return;
				}
			}
			Qi(e, t, a, n, r, i, o, s, c);
		}
		function Ni(e) {
			for (var t = e;;) {
				var n = t.tag;
				if ((n === 0 || n === 11 || n === 15) && t.flags & 16384 && (n = t.updateQueue, n !== null && (n = n.stores, n !== null))) for (var r = 0; r < n.length; r++) {
					var i = n[r], a = i.getSnapshot;
					i = i.value;
					try {
						if (!Ic(a(), i)) return !1;
					} catch {
						return !1;
					}
				}
				if (n = t.child, t.subtreeFlags & 16384 && n !== null) n.return = t, t = n;
				else {
					if (t === e) break;
					for (; t.sibling === null;) {
						if (t.return === null || t.return === e) return !0;
						t = t.return;
					}
					t.sibling.return = t.return, t = t.sibling;
				}
			}
			return !0;
		}
		function Pi(e, t, n, r) {
			t &= ~zu, t &= ~Ru, e.suspendedLanes |= t, e.pingedLanes &= ~t, r && (e.warmLanes |= t), r = e.expirationTimes;
			for (var i = t; 0 < i;) {
				var a = 31 - _c(i), o = 1 << a;
				r[a] = -1, i &= ~o;
			}
			n !== 0 && ne(e, n, t);
		}
		function Fi() {
			return Eu & 6 ? !0 : (Pe(0, !1), !1);
		}
		function Ii() {
			if (Ou !== null) {
				if (Au === 0) var e = Ou.return;
				else e = Ou, ll = cl = null, Nt(e), jl = null, Ml = 0, e = Ou;
				for (; e !== null;) Fr(e.alternate, e), e = e.return;
				Ou = null;
			}
		}
		function Li(e, t) {
			var n = e.timeoutHandle;
			n !== po && (e.timeoutHandle = po, fo(n)), n = e.cancelPendingCommit, n !== null && (e.cancelPendingCommit = null, n()), $u = 0, Ii(), Du = e, Ou = n = ha(e.current, null), ku = t, Au = 0, ju = null, Mu = !1, Nu = y(e, t), Pu = !1, Vu = Bu = zu = Ru = Lu = Iu = 0, Uu = Hu = null, Wu = !1, t & 8 && (t |= t & 32);
			var r = e.entangledLanes;
			if (r !== 0) for (e = e.entanglements, r &= t; 0 < r;) {
				var i = 31 - _c(r), a = 1 << i;
				t |= e[i], r &= ~a;
			}
			return Fu = t, rt(), n;
		}
		function Ri(e, t) {
			K = null, U.H = tu, t === El || t === Ol ? (t = N(), Au = 3) : t === Dl ? (t = N(), Au = 4) : Au = t === ou ? 8 : typeof t == "object" && t && typeof t.then == "function" ? 6 : 1, ju = t, Ou === null && (Iu = 1, Wn(e, k(t, e.current)));
		}
		function zi() {
			var e = Hl.current;
			return e === null ? !0 : (ku & 4194048) === ku ? Ul === null : (ku & 62914560) === ku || ku & 536870912 ? e === Ul : !1;
		}
		function Bi() {
			var e = U.H;
			return U.H = tu, e === null ? tu : e;
		}
		function Vi() {
			var e = U.A;
			return U.A = vu, e;
		}
		function Hi() {
			Iu = 4, Mu || (ku & 4194048) !== ku && Hl.current !== null || (Nu = !0), !(Lu & 134217727) && !(Ru & 134217727) || Du === null || Pi(Du, ku, Bu, !1);
		}
		function Ui(e, t, n) {
			var r = Eu;
			Eu |= 2;
			var i = Bi(), a = Vi();
			(Du !== e || ku !== t) && (Ju = null, Li(e, t)), t = !1;
			var o = Iu;
			a: do
				try {
					if (Au !== 0 && Ou !== null) {
						var s = Ou, c = ju;
						switch (Au) {
							case 8:
								Ii(), o = 6;
								break a;
							case 3:
							case 2:
							case 9:
							case 6:
								Hl.current === null && (t = !0);
								var l = Au;
								if (Au = 0, ju = null, Yi(e, s, c, l), n && Nu) {
									o = 0;
									break a;
								}
								break;
							default: l = Au, Au = 0, ju = null, Yi(e, s, c, l);
						}
					}
					Wi(), o = Iu;
					break;
				} catch (t) {
					Ri(e, t);
				}
			while (1);
			return t && e.shellSuspendCounter++, ll = cl = null, Eu = r, U.H = i, U.A = a, Ou === null && (Du = null, ku = 0, rt()), o;
		}
		function Wi() {
			for (; Ou !== null;) qi(Ou);
		}
		function Gi(e, t) {
			var n = Eu;
			Eu |= 2;
			var r = Bi(), i = Vi();
			Du !== e || ku !== t ? (Ju = null, qu = Dc() + 500, Li(e, t)) : Nu = y(e, t);
			a: do
				try {
					if (Au !== 0 && Ou !== null) {
						t = Ou;
						var o = ju;
						b: switch (Au) {
							case 1:
								Au = 0, ju = null, Yi(e, t, o, 1);
								break;
							case 2:
							case 9:
								if (Ye(o)) {
									Au = 0, ju = null, Ji(t);
									break;
								}
								t = function() {
									Au !== 2 && Au !== 9 || Du !== e || (Au = 7), Ne(e);
								}, o.then(t, t);
								break a;
							case 3:
								Au = 7;
								break a;
							case 4:
								Au = 5;
								break a;
							case 7:
								Ye(o) ? (Au = 0, ju = null, Ji(t)) : (Au = 0, ju = null, Yi(e, t, o, 7));
								break;
							case 5:
								var s = null;
								switch (Ou.tag) {
									case 26: s = Ou.memoizedState;
									case 5:
									case 27:
										var c = Ou, l = c.type, u = c.pendingProps;
										if (s ? oc(s) : Oo(c.stateNode, l, u)) {
											Au = 0, ju = null;
											var d = c.sibling;
											if (d !== null) Ou = d;
											else {
												var f = c.return;
												f === null ? Ou = null : (Ou = f, Xi(f));
											}
											break b;
										}
								}
								Au = 0, ju = null, Yi(e, t, o, 5);
								break;
							case 6:
								Au = 0, ju = null, Yi(e, t, o, 6);
								break;
							case 8:
								Ii(), Iu = 6;
								break a;
							default: throw Error(a(462));
						}
					}
					Ki();
					break;
				} catch (t) {
					Ri(e, t);
				}
			while (1);
			return ll = cl = null, U.H = r, U.A = i, Eu = n, Ou === null ? (Du = null, ku = 0, rt(), Iu) : 0;
		}
		function Ki() {
			for (; Ou !== null && !Tc();) qi(Ou);
		}
		function qi(e) {
			var t = xr(e.alternate, e, Fu);
			e.memoizedProps = e.pendingProps, t === null ? Xi(e) : Ou = t;
		}
		function Ji(e) {
			var t = e, n = t.alternate;
			switch (t.tag) {
				case 15:
				case 0:
					t = cr(n, t, t.pendingProps, t.type, void 0, ku);
					break;
				case 11:
					t = cr(n, t, t.pendingProps, t.type.render, t.ref, ku);
					break;
				case 5: Nt(t);
				default: Fr(n, t), t = Ou = ga(t, Fu), t = xr(n, t, Fu);
			}
			e.memoizedProps = e.pendingProps, t === null ? Xi(e) : Ou = t;
		}
		function Yi(e, t, n, r) {
			ll = cl = null, Nt(t), jl = null, Ml = 0;
			var i = t.return;
			try {
				if (Yn(e, i, t, n, ku)) {
					Iu = 1, Wn(e, k(n, e.current)), Ou = null;
					return;
				}
			} catch (t) {
				if (i !== null) throw Ou = i, t;
				Iu = 1, Wn(e, k(n, e.current)), Ou = null;
				return;
			}
			t.flags & 32768 ? (rl || r === 1 ? e = !0 : Nu || ku & 536870912 ? e = !1 : (Mu = e = !0, (r === 2 || r === 9 || r === 3 || r === 6) && (r = Hl.current, r !== null && r.tag === 13 && (r.flags |= 16384))), Zi(t, e)) : Xi(t);
		}
		function Xi(e) {
			var t = e;
			do {
				if (t.flags & 32768) {
					Zi(t, Mu);
					return;
				}
				e = t.return;
				var n = Nr(t.alternate, t, Fu);
				if (n !== null) {
					Ou = n;
					return;
				}
				if (t = t.sibling, t !== null) {
					Ou = t;
					return;
				}
				Ou = t = e;
			} while (t !== null);
			Iu === 0 && (Iu = 5);
		}
		function Zi(e, t) {
			do {
				var n = Pr(e.alternate, e);
				if (n !== null) {
					n.flags &= 32767, Ou = n;
					return;
				}
				if (n = e.return, n !== null && (n.flags |= 32768, n.subtreeFlags = 0, n.deletions = null), !t && (e = e.sibling, e !== null)) {
					Ou = e;
					return;
				}
				Ou = e = n;
			} while (e !== null);
			Iu = 6, Ou = null;
		}
		function Qi(e, t, n, r, i, o, s, c, l) {
			e.cancelPendingCommit = null;
			do
				ra();
			while (Xu !== 0);
			if (Eu & 6) throw Error(a(327));
			if (t !== null) {
				if (t === e.current) throw Error(a(177));
				if (o = t.lanes | t.childLanes, o |= Ll, te(e, n, o, s, c, l), e === Du && (Ou = Du = null, ku = 0), Qu = t, Zu = e, $u = n, ed = o, td = i, nd = r, t.subtreeFlags & 10256 || t.flags & 10256 ? (e.callbackNode = null, e.callbackPriority = 0, fa(Ac, function() {
					return ia(), null;
				})) : (e.callbackNode = null, e.callbackPriority = 0), r = (t.flags & 13878) != 0, t.subtreeFlags & 13878 || r) {
					r = U.T, U.T = null, i = xo(), bo(2), s = Eu, Eu |= 4;
					try {
						Xr(e, t, n);
					} finally {
						Eu = s, bo(i), U.T = r;
					}
				}
				Xu = 1, $i(), ea(), ta();
			}
		}
		function $i() {
			if (Xu === 1) {
				Xu = 0;
				var e = Zu, t = Qu, n = (t.flags & 13878) != 0;
				if (t.subtreeFlags & 13878 || n) {
					n = U.T, U.T = null;
					var r = xo();
					bo(2);
					var i = Eu;
					Eu |= 4;
					try {
						oi(t, e), io(e.containerInfo);
					} finally {
						Eu = i, bo(r), U.T = n;
					}
				}
				e.current = t, Xu = 2;
			}
		}
		function ea() {
			if (Xu === 2) {
				Xu = 0;
				var e = Zu, t = Qu, n = (t.flags & 8772) != 0;
				if (t.subtreeFlags & 8772 || n) {
					n = U.T, U.T = null;
					var r = xo();
					bo(2);
					var i = Eu;
					Eu |= 4;
					try {
						Zr(e, t.alternate, t);
					} finally {
						Eu = i, bo(r), U.T = n;
					}
				}
				Xu = 3;
			}
		}
		function ta() {
			if (Xu === 4 || Xu === 3) {
				Xu = 0, Ec();
				var e = Zu, t = Qu, n = $u, r = nd;
				t.subtreeFlags & 10256 || t.flags & 10256 ? Xu = 5 : (Xu = 0, Qu = Zu = null, na(e, e.pendingLanes));
				var i = e.pendingLanes;
				if (i === 0 && (Yu = null), re(n), t = t.stateNode, Fc && typeof Fc.onCommitFiberRoot == "function") try {
					Fc.onCommitFiberRoot(Pc, t, void 0, (t.current.flags & 128) == 128);
				} catch {}
				if (r !== null) {
					t = U.T, i = xo(), bo(2), U.T = null;
					try {
						for (var a = e.onRecoverableError, o = 0; o < r.length; o++) {
							var s = r[o];
							a(s.value, { componentStack: s.stack });
						}
					} finally {
						U.T = t, bo(i);
					}
				}
				$u & 3 && ra(), Ne(e), i = e.pendingLanes, n & 261930 && i & 42 ? e === id ? rd++ : (rd = 0, id = e) : rd = 0, _o && Bs(), Pe(0, !1);
			}
		}
		function na(e, t) {
			(e.pooledCacheLanes &= t) === 0 && (t = e.pooledCache, t != null && (e.pooledCache = null, je(t)));
		}
		function ra() {
			return $i(), ea(), ta(), ia();
		}
		function ia() {
			if (Xu !== 5) return !1;
			var e = Zu, t = ed;
			ed = 0;
			var n = re($u), r = 32 > n ? 32 : n;
			n = U.T;
			var i = xo();
			try {
				bo(r), U.T = null, r = td, td = null;
				var o = Zu, s = $u;
				if (Xu = 0, Qu = Zu = null, $u = 0, Eu & 6) throw Error(a(331));
				var c = Eu;
				if (Eu |= 4, xi(o.current), mi(o, o.current, s, r), Eu = c, Pe(0, !1), Fc && typeof Fc.onPostCommitFiberRoot == "function") try {
					Fc.onPostCommitFiberRoot(Pc, o);
				} catch {}
				return !0;
			} finally {
				bo(i), U.T = n, na(e, t);
			}
		}
		function aa(e, t, n) {
			t = k(n, t), t = Kn(e.stateNode, t, 2), e = dt(e, t, 2), e !== null && (S(e, 2), Ne(e));
		}
		function oa(e, t, n) {
			if (e.tag === 3) aa(e, e, n);
			else for (; t !== null;) {
				if (t.tag === 3) {
					aa(t, e, n);
					break;
				} else if (t.tag === 1) {
					var r = t.stateNode;
					if (typeof t.type.getDerivedStateFromError == "function" || typeof r.componentDidCatch == "function" && (Yu === null || !Yu.has(r))) {
						e = k(n, e), n = qn(2), r = dt(t, n, 2), r !== null && (Jn(n, r, t, e), S(r, 2), Ne(r));
						break;
					}
				}
				t = t.return;
			}
		}
		function sa(e, t, n) {
			var r = e.pingCache;
			if (r === null) {
				r = e.pingCache = new Tu();
				var i = /* @__PURE__ */ new Set();
				r.set(t, i);
			} else i = r.get(t), i === void 0 && (i = /* @__PURE__ */ new Set(), r.set(t, i));
			i.has(n) || (Pu = !0, i.add(n), e = ca.bind(null, e, t, n), t.then(e, e));
		}
		function ca(e, t, n) {
			var r = e.pingCache;
			r !== null && r.delete(t), e.pingedLanes |= e.suspendedLanes & n, e.warmLanes &= ~n, Du === e && (ku & n) === n && (Iu === 4 || Iu === 3 && (ku & 62914560) === ku && 300 > Dc() - Gu ? !(Eu & 2) && Li(e, 0) : zu |= n, Vu === ku && (Vu = 0)), Ne(e);
		}
		function la(e, t) {
			t === 0 && (t = x()), e = ot(e, t), e !== null && (S(e, t), Ne(e));
		}
		function ua(e) {
			var t = e.memoizedState, n = 0;
			t !== null && (n = t.retryLane), la(e, n);
		}
		function da(e, t) {
			var n = 0;
			switch (e.tag) {
				case 31:
				case 13:
					var r = e.stateNode, i = e.memoizedState;
					i !== null && (n = i.retryLane);
					break;
				case 19:
					r = e.stateNode;
					break;
				case 22:
					r = e.stateNode._retryCache;
					break;
				default: throw Error(a(314));
			}
			r !== null && r.delete(t), la(e, n);
		}
		function fa(e, t) {
			return Cc(e, t);
		}
		function pa(e, t, n, r) {
			this.tag = e, this.key = n, this.sibling = this.child = this.return = this.stateNode = this.type = this.elementType = null, this.index = 0, this.refCleanup = this.ref = null, this.pendingProps = t, this.dependencies = this.memoizedState = this.updateQueue = this.memoizedProps = null, this.mode = r, this.subtreeFlags = this.flags = 0, this.deletions = null, this.childLanes = this.lanes = 0, this.alternate = null;
		}
		function ma(e) {
			return e = e.prototype, !(!e || !e.isReactComponent);
		}
		function ha(e, n) {
			var r = e.alternate;
			return r === null ? (r = t(e.tag, n, e.key, e.mode), r.elementType = e.elementType, r.type = e.type, r.stateNode = e.stateNode, r.alternate = e, e.alternate = r) : (r.pendingProps = n, r.type = e.type, r.flags = 0, r.subtreeFlags = 0, r.deletions = null), r.flags = e.flags & 65011712, r.childLanes = e.childLanes, r.lanes = e.lanes, r.child = e.child, r.memoizedProps = e.memoizedProps, r.memoizedState = e.memoizedState, r.updateQueue = e.updateQueue, n = e.dependencies, r.dependencies = n === null ? null : {
				lanes: n.lanes,
				firstContext: n.firstContext
			}, r.sibling = e.sibling, r.index = e.index, r.ref = e.ref, r.refCleanup = e.refCleanup, r;
		}
		function ga(e, t) {
			e.flags &= 65011714;
			var n = e.alternate;
			return n === null ? (e.childLanes = 0, e.lanes = t, e.child = null, e.subtreeFlags = 0, e.memoizedProps = null, e.memoizedState = null, e.updateQueue = null, e.dependencies = null, e.stateNode = null) : (e.childLanes = n.childLanes, e.lanes = n.lanes, e.child = n.child, e.subtreeFlags = 0, e.deletions = null, e.memoizedProps = n.memoizedProps, e.memoizedState = n.memoizedState, e.updateQueue = n.updateQueue, e.type = n.type, t = n.dependencies, e.dependencies = t === null ? null : {
				lanes: t.lanes,
				firstContext: t.firstContext
			}), e;
		}
		function _a(e, n, r, i, o, s) {
			var c = 0;
			if (i = e, typeof e == "function") ma(e) && (c = 1);
			else if (typeof e == "string") c = Js && cc ? Ys(e, r, Zc.current) ? 26 : fc(e) ? 27 : 5 : Js ? Ys(e, r, Zc.current) ? 26 : 5 : cc && fc(e) ? 27 : 5;
			else a: switch (e) {
				case Ka: return e = t(31, r, n, o), e.elementType = Ka, e.lanes = s, e;
				case Ia: return va(r.children, o, s, n);
				case La:
					c = 8, o |= 24;
					break;
				case Ra: return e = t(12, r, n, o | 2), e.elementType = Ra, e.lanes = s, e;
				case Ha: return e = t(13, r, n, o), e.elementType = Ha, e.lanes = s, e;
				case Ua: return e = t(19, r, n, o), e.elementType = Ua, e.lanes = s, e;
				default:
					if (typeof e == "object" && e) switch (e.$$typeof) {
						case Ba:
							c = 10;
							break a;
						case za:
							c = 9;
							break a;
						case Va:
							c = 11;
							break a;
						case Wa:
							c = 14;
							break a;
						case Ga:
							c = 16, i = null;
							break a;
					}
					c = 29, r = Error(a(130, e === null ? "null" : typeof e, "")), i = null;
			}
			return n = t(c, r, n, o), n.elementType = e, n.type = i, n.lanes = s, n;
		}
		function va(e, n, r, i) {
			return e = t(7, e, i, n), e.lanes = r, e;
		}
		function ya(e, n, r) {
			return e = t(6, e, null, n), e.lanes = r, e;
		}
		function ba(e) {
			var n = t(18, null, null, 0);
			return n.stateNode = e, n;
		}
		function xa(e, n, r) {
			return n = t(4, e.children === null ? [] : e.children, e.key, n), n.lanes = r, n.stateNode = {
				containerInfo: e.containerInfo,
				pendingChildren: null,
				implementation: e.implementation
			}, n;
		}
		function Sa(e, t, n, r, i, a, o, s, c) {
			this.tag = 1, this.containerInfo = e, this.pingCache = this.current = this.pendingChildren = null, this.timeoutHandle = po, this.callbackNode = this.next = this.pendingContext = this.context = this.cancelPendingCommit = null, this.callbackPriority = 0, this.expirationTimes = ee(-1), this.entangledLanes = this.shellSuspendCounter = this.errorRecoveryDisabledLanes = this.expiredLanes = this.warmLanes = this.pingedLanes = this.suspendedLanes = this.pendingLanes = 0, this.entanglements = ee(0), this.hiddenUpdates = ee(null), this.identifierPrefix = r, this.onUncaughtError = i, this.onCaughtError = a, this.onRecoverableError = o, this.pooledCache = null, this.pooledCacheLanes = 0, this.formState = c, this.incompleteTransitions = /* @__PURE__ */ new Map();
		}
		function Ca(e, n, r, i, a, o, s, c, l, u, d, f) {
			return e = new Sa(e, n, r, s, l, u, d, f, c), n = 1, !0 === o && (n |= 24), o = t(3, null, null, n), e.current = o, o.stateNode = e, n = Ae(), n.refCount++, e.pooledCache = n, n.refCount++, o.memoizedState = {
				element: i,
				isDehydrated: r,
				cache: n
			}, ct(o), e;
		}
		function wa(e) {
			return e ? (e = gc, e) : gc;
		}
		function Ta(e) {
			var t = e._reactInternals;
			if (t === void 0) throw typeof e.render == "function" ? Error(a(188)) : (e = Object.keys(e).join(","), Error(a(268, e)));
			return e = c(t), e = e === null ? null : l(e), e === null ? null : eo(e.stateNode);
		}
		function Ea(e, t, n, r, i, a) {
			i = wa(i), r.context === null ? r.context = i : r.pendingContext = i, r = ut(t), r.payload = { element: n }, a = a === void 0 ? null : a, a !== null && (r.callback = a), n = dt(e, r, t), n !== null && (H(n, e, t), ft(n, e, t));
		}
		function Da(e, t) {
			if (e = e.memoizedState, e !== null && e.dehydrated !== null) {
				var n = e.retryLane;
				e.retryLane = n !== 0 && n < t ? n : t;
			}
		}
		function Oa(e, t) {
			Da(e, t), (e = e.alternate) && Da(e, t);
		}
		var ka = {}, Aa = r(), ja = i(), Ma = Object.assign, Na = Symbol.for("react.element"), Pa = Symbol.for("react.transitional.element"), Fa = Symbol.for("react.portal"), Ia = Symbol.for("react.fragment"), La = Symbol.for("react.strict_mode"), Ra = Symbol.for("react.profiler"), za = Symbol.for("react.consumer"), Ba = Symbol.for("react.context"), Va = Symbol.for("react.forward_ref"), Ha = Symbol.for("react.suspense"), Ua = Symbol.for("react.suspense_list"), Wa = Symbol.for("react.memo"), Ga = Symbol.for("react.lazy"), Ka = Symbol.for("react.activity"), qa = Symbol.for("react.memo_cache_sentinel"), Ja = Symbol.iterator, Ya = Symbol.for("react.client.reference"), Xa = Array.isArray, U = Aa.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, Za = e.rendererVersion, Qa = e.rendererPackageName, $a = e.extraDevToolsConfig, eo = e.getPublicInstance, to = e.getRootHostContext, no = e.getChildHostContext, ro = e.prepareForCommit, io = e.resetAfterCommit, ao = e.createInstance;
		e.cloneMutableInstance;
		var oo = e.appendInitialChild, so = e.finalizeInitialChildren, co = e.shouldSetTextContent, lo = e.createTextInstance;
		e.cloneMutableTextInstance;
		var uo = e.scheduleTimeout, fo = e.cancelTimeout, po = e.noTimeout, mo = e.isPrimaryRenderer;
		e.warnsIfNotActing;
		var ho = e.supportsMutation, go = e.supportsPersistence, _o = e.supportsHydration, vo = e.getInstanceFromNode;
		e.beforeActiveInstanceBlur;
		var yo = e.preparePortalMount;
		e.prepareScopeUpdate, e.getInstanceFromScope;
		var bo = e.setCurrentUpdatePriority, xo = e.getCurrentUpdatePriority, So = e.resolveUpdatePriority;
		e.trackSchedulerEvent, e.resolveEventType, e.resolveEventTimeStamp;
		var Co = e.shouldAttemptEagerTransition, wo = e.detachDeletedInstance;
		e.requestPostPaintCallback;
		var To = e.maySuspendCommit, Eo = e.maySuspendCommitOnUpdate, Do = e.maySuspendCommitInSyncRender, Oo = e.preloadInstance, ko = e.startSuspendingCommit, Ao = e.suspendInstance;
		e.suspendOnActiveViewTransition;
		var jo = e.waitForCommitToBeReady;
		e.getSuspendedCommitReason;
		var Mo = e.NotPendingTransition, No = e.HostTransitionContext, Po = e.resetFormInstance;
		e.bindToConsole;
		var Fo = e.supportsMicrotasks, Io = e.scheduleMicrotask, Lo = e.supportsTestSelectors, Ro = e.findFiberRoot, zo = e.getBoundingRect, Bo = e.getTextContent, Vo = e.isHiddenSubtree, Ho = e.matchAccessibilityRole, Uo = e.setFocusIfFocusable, Wo = e.setupIntersectionObserver, Go = e.appendChild, Ko = e.appendChildToContainer, qo = e.commitTextUpdate, Jo = e.commitMount, Yo = e.commitUpdate, Xo = e.insertBefore, Zo = e.insertInContainerBefore, Qo = e.removeChild, $o = e.removeChildFromContainer, es = e.resetTextContent, ts = e.hideInstance, ns = e.hideTextInstance, rs = e.unhideInstance, is = e.unhideTextInstance;
		e.cancelViewTransitionName, e.cancelRootViewTransitionName, e.restoreRootViewTransitionName, e.cloneRootViewTransitionContainer, e.removeRootViewTransitionClone, e.measureClonedInstance, e.hasInstanceChanged, e.hasInstanceAffectedParent, e.startViewTransition, e.startGestureTransition, e.stopViewTransition, e.getCurrentGestureOffset, e.createViewTransitionInstance;
		var as = e.clearContainer;
		e.createFragmentInstance, e.updateFragmentInstanceFiber, e.commitNewChildToFragmentInstance, e.deleteChildFromFragmentInstance;
		var os = e.cloneInstance, ss = e.createContainerChildSet, cs = e.appendChildToContainerChildSet, ls = e.finalizeContainerChildren, us = e.replaceContainerChildren, ds = e.cloneHiddenInstance, fs = e.cloneHiddenTextInstance, ps = e.isSuspenseInstancePending, ms = e.isSuspenseInstanceFallback, hs = e.getSuspenseInstanceFallbackErrorDetails, gs = e.registerSuspenseInstanceRetry, _s = e.canHydrateFormStateMarker, vs = e.isFormStateMarkerMatching, ys = e.getNextHydratableSibling, W = e.getNextHydratableSiblingAfterSingleton, bs = e.getFirstHydratableChild, xs = e.getFirstHydratableChildWithinContainer, Ss = e.getFirstHydratableChildWithinActivityInstance, Cs = e.getFirstHydratableChildWithinSuspenseInstance, ws = e.getFirstHydratableChildWithinSingleton, Ts = e.canHydrateInstance, Es = e.canHydrateTextInstance, Ds = e.canHydrateActivityInstance, Os = e.canHydrateSuspenseInstance, ks = e.hydrateInstance, As = e.hydrateTextInstance, js = e.hydrateActivityInstance, Ms = e.hydrateSuspenseInstance, Ns = e.getNextHydratableInstanceAfterActivityInstance, Ps = e.getNextHydratableInstanceAfterSuspenseInstance, Fs = e.commitHydratedInstance, Is = e.commitHydratedContainer, Ls = e.commitHydratedActivityInstance, Rs = e.commitHydratedSuspenseInstance, zs = e.finalizeHydratedChildren, Bs = e.flushHydrationEvents;
		e.clearActivityBoundary;
		var Vs = e.clearSuspenseBoundary;
		e.clearActivityBoundaryFromContainer;
		var Hs = e.clearSuspenseBoundaryFromContainer, Us = e.hideDehydratedBoundary, Ws = e.unhideDehydratedBoundary, Gs = e.shouldDeleteUnhydratedTailInstances;
		e.diffHydratedPropsForDevWarnings, e.diffHydratedTextForDevWarnings, e.describeHydratableInstanceForDevWarnings;
		var Ks = e.validateHydratableInstance, qs = e.validateHydratableTextInstance, Js = e.supportsResources, Ys = e.isHostHoistableType, Xs = e.getHoistableRoot, Zs = e.getResource, Qs = e.acquireResource, $s = e.releaseResource, ec = e.hydrateHoistable, tc = e.mountHoistable, nc = e.unmountHoistable, rc = e.createHoistableInstance, ic = e.prepareToCommitHoistables, ac = e.mayResourceSuspendCommit, oc = e.preloadResource, sc = e.suspendResource, cc = e.supportsSingletons, lc = e.resolveSingletonInstance, uc = e.acquireSingletonInstance, dc = e.releaseSingletonInstance, fc = e.isHostSingletonType, pc = e.isSingletonScope, mc = [], hc = -1, gc = {}, _c = Math.clz32 ? Math.clz32 : g, vc = Math.log, yc = Math.LN2, bc = 256, xc = 262144, Sc = 4194304, Cc = ja.unstable_scheduleCallback, wc = ja.unstable_cancelCallback, Tc = ja.unstable_shouldYield, Ec = ja.unstable_requestPaint, Dc = ja.unstable_now, Oc = ja.unstable_ImmediatePriority, kc = ja.unstable_UserBlockingPriority, Ac = ja.unstable_NormalPriority, jc = ja.unstable_IdlePriority, Mc = ja.log, Nc = ja.unstable_setDisableYieldValue, Pc = null, Fc = null, Ic = typeof Object.is == "function" ? Object.is : ie, Lc = typeof reportError == "function" ? reportError : function(e) {
			if (typeof window == "object" && typeof window.ErrorEvent == "function") {
				var t = new window.ErrorEvent("error", {
					bubbles: !0,
					cancelable: !0,
					message: typeof e == "object" && e && typeof e.message == "string" ? String(e.message) : String(e),
					error: e
				});
				if (!window.dispatchEvent(t)) return;
			} else if (typeof process == "object" && typeof process.emit == "function") {
				process.emit("uncaughtException", e);
				return;
			}
			console.error(e);
		}, Rc = Object.prototype.hasOwnProperty, zc, Bc, Vc = !1, Hc = /* @__PURE__ */ new WeakMap(), Uc = [], Wc = 0, Gc = null, G = 0, Kc = [], qc = 0, Jc = null, Yc = 1, Xc = "", Zc = p(null), Qc = p(null), $c = p(null), el = p(null), tl = null, nl = null, rl = !1, il = null, al = !1, ol = Error(a(519)), sl = p(null), cl = null, ll = null, ul = typeof AbortController < "u" ? AbortController : function() {
			var e = [], t = this.signal = {
				aborted: !1,
				addEventListener: function(t, n) {
					e.push(n);
				}
			};
			this.abort = function() {
				t.aborted = !0, e.forEach(function(e) {
					return e();
				});
			};
		}, dl = ja.unstable_scheduleCallback, fl = ja.unstable_NormalPriority, pl = {
			$$typeof: Ba,
			Consumer: null,
			Provider: null,
			_currentValue: null,
			_currentValue2: null,
			_threadCount: 0
		}, ml = null, hl = null, gl = !1, _l = !1, vl = !1, yl = 0, bl = null, xl = 0, Sl = 0, Cl = null, wl = U.S;
		U.S = function(e, t) {
			Ku = Dc(), typeof t == "object" && t && typeof t.then == "function" && He(e, t), wl !== null && wl(e, t);
		};
		var Tl = p(null), El = Error(a(460)), Dl = Error(a(474)), Ol = Error(a(542)), kl = { then: function() {} }, Al = null, jl = null, Ml = 0, Nl = nt(!0), Pl = nt(!1), Fl = [], Il = 0, Ll = 0, Rl = !1, zl = !1, Bl = p(null), Vl = p(0), Hl = p(null), Ul = null, Wl = p(0), Gl = 0, K = null, Kl = null, ql = null, Jl = !1, Yl = !1, Xl = !1, Zl = 0, Ql = 0, $l = null, eu = 0, tu = {
			readContext: De,
			use: Rt,
			useCallback: Et,
			useContext: Et,
			useEffect: Et,
			useImperativeHandle: Et,
			useLayoutEffect: Et,
			useInsertionEffect: Et,
			useMemo: Et,
			useReducer: Et,
			useRef: Et,
			useState: Et,
			useDebugValue: Et,
			useDeferredValue: Et,
			useTransition: Et,
			useSyncExternalStore: Et,
			useId: Et,
			useHostTransitionStatus: Et,
			useFormState: Et,
			useActionState: Et,
			useOptimistic: Et,
			useMemoCache: Et,
			useCacheRefresh: Et
		};
		tu.useEffectEvent = Et;
		var nu = {
			readContext: De,
			use: Rt,
			useCallback: function(e, t) {
				return Pt().memoizedState = [e, t === void 0 ? null : t], e;
			},
			useContext: De,
			useEffect: hn,
			useImperativeHandle: function(e, t, n) {
				n = n == null ? null : n.concat([e]), pn(4194308, 4, xn.bind(null, t, e), n);
			},
			useLayoutEffect: function(e, t) {
				return pn(4194308, 4, e, t);
			},
			useInsertionEffect: function(e, t) {
				pn(4, 2, e, t);
			},
			useMemo: function(e, t) {
				var n = Pt();
				t = t === void 0 ? null : t;
				var r = e();
				if (Xl) {
					E(!0);
					try {
						e();
					} finally {
						E(!1);
					}
				}
				return n.memoizedState = [r, t], r;
			},
			useReducer: function(e, t, n) {
				var r = Pt();
				if (n !== void 0) {
					var i = n(t);
					if (Xl) {
						E(!0);
						try {
							n(t);
						} finally {
							E(!1);
						}
					}
				} else i = t;
				return r.memoizedState = r.baseState = i, e = {
					pending: null,
					lanes: 0,
					dispatch: null,
					lastRenderedReducer: e,
					lastRenderedState: i
				}, r.queue = e, e = e.dispatch = Pn.bind(null, K, e), [r.memoizedState, e];
			},
			useRef: function(e) {
				var t = Pt();
				return e = { current: e }, t.memoizedState = e;
			},
			useState: function(e) {
				e = Xt(e);
				var t = e.queue, n = Fn.bind(null, K, t);
				return t.dispatch = n, [e.memoizedState, n];
			},
			useDebugValue: Cn,
			useDeferredValue: function(e, t) {
				return En(Pt(), e, t);
			},
			useTransition: function() {
				var e = Xt(!1);
				return e = On.bind(null, K, e.queue, !0, !1), Pt().memoizedState = e, [!1, e];
			},
			useSyncExternalStore: function(e, t, n) {
				var r = K, i = Pt();
				if (rl) {
					if (n === void 0) throw Error(a(407));
					n = n();
				} else {
					if (n = t(), Du === null) throw Error(a(349));
					ku & 127 || Gt(r, t, n);
				}
				i.memoizedState = n;
				var o = {
					value: n,
					getSnapshot: t
				};
				return i.queue = o, hn(qt.bind(null, r, o, e), [e]), r.flags |= 2048, dn(9, { destroy: void 0 }, Kt.bind(null, r, o, n, t), null), n;
			},
			useId: function() {
				var e = Pt(), t = Du.identifierPrefix;
				if (rl) {
					var n = Xc, r = Yc;
					n = (r & ~(1 << 32 - _c(r) - 1)).toString(32) + n, t = "_" + t + "R_" + n, n = Zl++, 0 < n && (t += "H" + n.toString(32)), t += "_";
				} else n = eu++, t = "_" + t + "r_" + n.toString(32) + "_";
				return e.memoizedState = t;
			},
			useHostTransitionStatus: An,
			useFormState: on,
			useActionState: on,
			useOptimistic: function(e) {
				var t = Pt();
				t.memoizedState = t.baseState = e;
				var n = {
					pending: null,
					lanes: 0,
					dispatch: null,
					lastRenderedReducer: null,
					lastRenderedState: null
				};
				return t.queue = n, t = Ln.bind(null, K, !0, n), n.dispatch = t, [e, t];
			},
			useMemoCache: zt,
			useCacheRefresh: function() {
				return Pt().memoizedState = Nn.bind(null, K);
			},
			useEffectEvent: function(e) {
				var t = Pt(), n = { impl: e };
				return t.memoizedState = n, function() {
					if (Eu & 2) throw Error(a(440));
					return n.impl.apply(void 0, arguments);
				};
			}
		}, ru = {
			readContext: De,
			use: Rt,
			useCallback: wn,
			useContext: De,
			useEffect: gn,
			useImperativeHandle: Sn,
			useInsertionEffect: yn,
			useLayoutEffect: bn,
			useMemo: Tn,
			useReducer: Vt,
			useRef: fn,
			useState: function() {
				return Vt(Bt);
			},
			useDebugValue: Cn,
			useDeferredValue: function(e, t) {
				return Dn(Ft(), Kl.memoizedState, e, t);
			},
			useTransition: function() {
				var e = Vt(Bt)[0], t = Ft().memoizedState;
				return [typeof e == "boolean" ? e : Lt(e), t];
			},
			useSyncExternalStore: Wt,
			useId: jn,
			useHostTransitionStatus: An,
			useFormState: sn,
			useActionState: sn,
			useOptimistic: function(e, t) {
				return Zt(Ft(), Kl, e, t);
			},
			useMemoCache: zt,
			useCacheRefresh: Mn
		};
		ru.useEffectEvent = vn;
		var iu = {
			readContext: De,
			use: Rt,
			useCallback: wn,
			useContext: De,
			useEffect: gn,
			useImperativeHandle: Sn,
			useInsertionEffect: yn,
			useLayoutEffect: bn,
			useMemo: Tn,
			useReducer: Ut,
			useRef: fn,
			useState: function() {
				return Ut(Bt);
			},
			useDebugValue: Cn,
			useDeferredValue: function(e, t) {
				var n = Ft();
				return Kl === null ? En(n, e, t) : Dn(n, Kl.memoizedState, e, t);
			},
			useTransition: function() {
				var e = Ut(Bt)[0], t = Ft().memoizedState;
				return [typeof e == "boolean" ? e : Lt(e), t];
			},
			useSyncExternalStore: Wt,
			useId: jn,
			useHostTransitionStatus: An,
			useFormState: un,
			useActionState: un,
			useOptimistic: function(e, t) {
				var n = Ft();
				return Kl === null ? (n.baseState = e, [e, n.queue.dispatch]) : Zt(n, Kl, e, t);
			},
			useMemoCache: zt,
			useCacheRefresh: Mn
		};
		iu.useEffectEvent = vn;
		var au = {
			enqueueSetState: function(e, t, n) {
				e = e._reactInternals;
				var r = ki(), i = ut(r);
				i.payload = t, n != null && (i.callback = n), t = dt(e, i, r), t !== null && (H(t, e, r), ft(t, e, r));
			},
			enqueueReplaceState: function(e, t, n) {
				e = e._reactInternals;
				var r = ki(), i = ut(r);
				i.tag = 1, i.payload = t, n != null && (i.callback = n), t = dt(e, i, r), t !== null && (H(t, e, r), ft(t, e, r));
			},
			enqueueForceUpdate: function(e, t) {
				e = e._reactInternals;
				var n = ki(), r = ut(n);
				r.tag = 2, t != null && (r.callback = t), t = dt(e, r, n), t !== null && (H(t, e, n), ft(t, e, n));
			}
		}, ou = Error(a(461)), su = !1, cu = {
			dehydrated: null,
			treeContext: null,
			retryLane: 0,
			hydrationErrors: null
		}, lu = !1, uu = !1, du = !1, fu = typeof WeakSet == "function" ? WeakSet : Set, pu = null, mu = null, hu = !1, gu = null, _u = 8192, vu = {
			getCacheForType: function(e) {
				var t = De(pl), n = t.data.get(e);
				return n === void 0 && (n = e(), t.data.set(e, n)), n;
			},
			cacheSignal: function() {
				return De(pl).controller.signal;
			}
		}, yu = 0, bu = 1, xu = 2, Su = 3, Cu = 4;
		if (typeof Symbol == "function" && Symbol.for) {
			var wu = Symbol.for;
			yu = wu("selector.component"), bu = wu("selector.has_pseudo_class"), xu = wu("selector.role"), Su = wu("selector.test_id"), Cu = wu("selector.text");
		}
		var Tu = typeof WeakMap == "function" ? WeakMap : Map, Eu = 0, Du = null, Ou = null, ku = 0, Au = 0, ju = null, Mu = !1, Nu = !1, Pu = !1, Fu = 0, Iu = 0, Lu = 0, Ru = 0, zu = 0, Bu = 0, Vu = 0, Hu = null, Uu = null, Wu = !1, Gu = 0, Ku = 0, qu = Infinity, Ju = null, Yu = null, Xu = 0, Zu = null, Qu = null, $u = 0, ed = 0, td = null, nd = null, rd = 0, id = null;
		return ka.attemptContinuousHydration = function(e) {
			if (e.tag === 13 || e.tag === 31) {
				var t = ot(e, 67108864);
				t !== null && H(t, e, 67108864), Oa(e, 67108864);
			}
		}, ka.attemptHydrationAtCurrentPriority = function(e) {
			if (e.tag === 13 || e.tag === 31) {
				var t = ki();
				t = T(t);
				var n = ot(e, t);
				n !== null && H(n, e, t), Oa(e, t);
			}
		}, ka.attemptSynchronousHydration = function(e) {
			switch (e.tag) {
				case 3:
					if (e = e.stateNode, e.current.memoizedState.isDehydrated) {
						var t = _(e.pendingLanes);
						if (t !== 0) {
							for (e.pendingLanes |= 2, e.entangledLanes |= 2; t;) {
								var n = 1 << 31 - _c(t);
								e.entanglements[1] |= n, t &= ~n;
							}
							Ne(e), !(Eu & 6) && (qu = Dc() + 500, Pe(0, !1));
						}
					}
					break;
				case 31:
				case 13: t = ot(e, 2), t !== null && H(t, e, 2), Fi(), Oa(e, 2);
			}
		}, ka.batchedUpdates = function(e, t) {
			return e(t);
		}, ka.createComponentSelector = function(e) {
			return {
				$$typeof: yu,
				value: e
			};
		}, ka.createContainer = function(e, t, n, r, i, a, o, s, c, l) {
			return Ca(e, t, !1, null, n, r, a, null, o, s, c, l);
		}, ka.createHasPseudoClassSelector = function(e) {
			return {
				$$typeof: bu,
				value: e
			};
		}, ka.createHydrationContainer = function(e, t, n, r, i, a, o, s, c, l, u, d, f, p) {
			return e = Ca(n, r, !0, e, i, a, s, p, c, l, u, d), e.context = wa(null), n = e.current, r = ki(), r = T(r), i = ut(r), i.callback = t ?? null, dt(n, i, r), t = r, e.current.lanes = t, S(e, t), Ne(e), e;
		}, ka.createPortal = function(e, t, n) {
			var r = 3 < arguments.length && arguments[3] !== void 0 ? arguments[3] : null;
			return {
				$$typeof: Fa,
				key: r == null ? null : "" + r,
				children: e,
				containerInfo: t,
				implementation: n
			};
		}, ka.createRoleSelector = function(e) {
			return {
				$$typeof: xu,
				value: e
			};
		}, ka.createTestNameSelector = function(e) {
			return {
				$$typeof: Su,
				value: e
			};
		}, ka.createTextSelector = function(e) {
			return {
				$$typeof: Cu,
				value: e
			};
		}, ka.defaultOnCaughtError = function(e) {
			console.error(e);
		}, ka.defaultOnRecoverableError = function(e) {
			Lc(e);
		}, ka.defaultOnUncaughtError = function(e) {
			Lc(e);
		}, ka.deferredUpdates = function(e) {
			var t = U.T, n = xo();
			try {
				return bo(32), U.T = null, e();
			} finally {
				bo(n), U.T = t;
			}
		}, ka.discreteUpdates = function(e, t, n, r, i) {
			var a = U.T, o = xo();
			try {
				return bo(2), U.T = null, e(t, n, r, i);
			} finally {
				bo(o), U.T = a, Eu === 0 && (qu = Dc() + 500);
			}
		}, ka.findAllNodes = Oi, ka.findBoundingRects = function(e, t) {
			if (!Lo) throw Error(a(363));
			t = Oi(e, t), e = [];
			for (var n = 0; n < t.length; n++) e.push(zo(t[n]));
			for (t = e.length - 1; 0 < t; t--) {
				n = e[t];
				for (var r = n.x, i = r + n.width, o = n.y, s = o + n.height, c = t - 1; 0 <= c; c--) if (t !== c) {
					var l = e[c], u = l.x, d = u + l.width, f = l.y, p = f + l.height;
					if (r >= u && o >= f && i <= d && s <= p) {
						e.splice(t, 1);
						break;
					} else if (!(r !== u || n.width !== l.width || p < o || f > s)) {
						f > o && (l.height += f - o, l.y = o), p < s && (l.height = s - f), e.splice(t, 1);
						break;
					} else if (!(o !== f || n.height !== l.height || d < r || u > i)) {
						u > r && (l.width += u - r, l.x = r), d < i && (l.width = i - u), e.splice(t, 1);
						break;
					}
				}
			}
			return e;
		}, ka.findHostInstance = Ta, ka.findHostInstanceWithNoPortals = function(e) {
			return e = c(e), e = e === null ? null : u(e), e === null ? null : eo(e.stateNode);
		}, ka.findHostInstanceWithWarning = function(e) {
			return Ta(e);
		}, ka.flushPassiveEffects = ra, ka.flushSyncFromReconciler = function(e) {
			var t = Eu;
			Eu |= 1;
			var n = U.T, r = xo();
			try {
				if (bo(2), U.T = null, e) return e();
			} finally {
				bo(r), U.T = n, Eu = t, !(Eu & 6) && Pe(0, !1);
			}
		}, ka.flushSyncWork = Fi, ka.focusWithin = function(e, t) {
			if (!Lo) throw Error(a(363));
			for (e = wi(e), t = Di(e, t), t = Array.from(t), e = 0; e < t.length;) {
				var n = t[e++], r = n.tag;
				if (!Vo(n)) {
					if ((r === 5 || r === 26 || r === 27) && Uo(n.stateNode)) return !0;
					for (n = n.child; n !== null;) t.push(n), n = n.sibling;
				}
			}
			return !1;
		}, ka.getFindAllNodesFailureDescription = function(e, t) {
			if (!Lo) throw Error(a(363));
			var n = 0, r = [];
			e = [wi(e), 0];
			for (var i = 0; i < e.length;) {
				var o = e[i++], s = o.tag, c = e[i++], l = t[c];
				if ((s !== 5 && s !== 26 && s !== 27 || !Vo(o)) && (Ti(o, l) && (r.push(Ei(l)), c++, c > n && (n = c)), c < t.length)) for (o = o.child; o !== null;) e.push(o, c), o = o.sibling;
			}
			if (n < t.length) {
				for (e = []; n < t.length; n++) e.push(Ei(t[n]));
				return "findAllNodes was able to match part of the selector:\n  " + (r.join(" > ") + "\n\nNo matching component was found for:\n  ") + e.join(" > ");
			}
			return null;
		}, ka.getPublicRootInstance = function(e) {
			if (e = e.current, !e.child) return null;
			switch (e.child.tag) {
				case 27:
				case 5: return eo(e.child.stateNode);
				default: return e.child.stateNode;
			}
		}, ka.injectIntoDevTools = function() {
			var e = {
				bundleType: 0,
				version: Za,
				rendererPackageName: Qa,
				currentDispatcherRef: U,
				reconcilerVersion: "19.2.0"
			};
			if ($a !== null && (e.rendererConfig = $a), typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ > "u") e = !1;
			else {
				var t = __REACT_DEVTOOLS_GLOBAL_HOOK__;
				if (t.isDisabled || !t.supportsFiber) e = !0;
				else {
					try {
						Pc = t.inject(e), Fc = t;
					} catch {}
					e = !!t.checkDCE;
				}
			}
			return e;
		}, ka.isAlreadyRendering = function() {
			return (Eu & 6) != 0;
		}, ka.observeVisibleRects = function(e, t, n, r) {
			if (!Lo) throw Error(a(363));
			e = Oi(e, t);
			var i = Wo(e, n, r).disconnect;
			return { disconnect: function() {
				i();
			} };
		}, ka.shouldError = function() {
			return null;
		}, ka.shouldSuspend = function() {
			return !1;
		}, ka.startHostTransition = function(e, t, r, i) {
			if (e.tag !== 5) throw Error(a(476));
			var o = kn(e).queue;
			On(e, o, t, Mo, r === null ? n : function() {
				var t = kn(e);
				return t.next === null && (t = e.alternate.memoizedState), In(e, t.next.queue, {}, ki()), r(i);
			});
		}, ka.updateContainer = function(e, t, n, r) {
			var i = t.current, a = ki();
			return Ea(i, a, e, t, n, r), a;
		}, ka.updateContainerSync = function(e, t, n, r) {
			return Ea(t.current, 2, e, t, n, r), 2;
		}, ka;
	}, t.exports.default = t.exports, Object.defineProperty(t.exports, "__esModule", { value: !0 });
})), _a = /* @__PURE__ */ t(((e, t) => {
	process.env.NODE_ENV !== "production" && (t.exports = function(e) {
		function t(e, t) {
			for (e = e.memoizedState; e !== null && 0 < t;) e = e.next, t--;
			return e;
		}
		function n(e, t, r, i) {
			if (r >= t.length) return i;
			var a = t[r], o = Gc(e) ? e.slice() : Dc({}, e);
			return o[a] = n(e[a], t, r + 1, i), o;
		}
		function a(e, t, n) {
			if (t.length !== n.length) console.warn("copyWithRename() expects paths of the same length");
			else {
				for (var r = 0; r < n.length - 1; r++) if (t[r] !== n[r]) {
					console.warn("copyWithRename() expects paths to be the same except for the deepest key");
					return;
				}
				return o(e, t, n, 0);
			}
		}
		function o(e, t, n, r) {
			var i = t[r], a = Gc(e) ? e.slice() : Dc({}, e);
			return r + 1 === t.length ? (a[n[r]] = a[i], Gc(a) ? a.splice(i, 1) : delete a[i]) : a[i] = o(e[i], t, n, r + 1), a;
		}
		function s(e, t, n) {
			var r = t[n], i = Gc(e) ? e.slice() : Dc({}, e);
			return n + 1 === t.length ? (Gc(i) ? i.splice(r, 1) : delete i[r], i) : (i[r] = s(e[r], t, n + 1), i);
		}
		function c() {
			return !1;
		}
		function l() {
			return null;
		}
		function u(e, t, n, r) {
			return new ac(e, t, n, r);
		}
		function d(e, t) {
			e.context === yd && (yc(t, e, null, null), fs());
		}
		function f(e, t) {
			if ($_ !== null) {
				var n = t.staleFamilies;
				t = t.updatedFamilies, Rs(), ic(e.current, t, n), fs();
			}
		}
		function p(e) {
			$_ = e;
		}
		function m() {
			console.error("Do not call Hooks inside useEffect(...), useMemo(...), or other built-in Hooks. You can only call Hooks at the top level of your React function. For more information, see https://react.dev/link/rules-of-hooks");
		}
		function h() {
			console.error("Context can only be read while React is rendering. In classes, you can read it in the render method or getDerivedStateFromProps. In function components, you can read it directly in the function body, but not inside Hooks like useReducer() or useMemo().");
		}
		function g() {}
		function _() {}
		function v(e) {
			var t = [];
			return e.forEach(function(e) {
				t.push(e);
			}), t.sort().join(", ");
		}
		function y(e) {
			var t = e, n = e;
			if (e.alternate) for (; t.return;) t = t.return;
			else {
				e = t;
				do
					t = e, t.flags & 4098 && (n = t.return), e = t.return;
				while (e);
			}
			return t.tag === 3 ? n : null;
		}
		function b(e) {
			if (y(e) !== e) throw Error("Unable to find node on an unmounted component.");
		}
		function x(e) {
			var t = e.alternate;
			if (!t) {
				if (t = y(e), t === null) throw Error("Unable to find node on an unmounted component.");
				return t === e ? e : null;
			}
			for (var n = e, r = t;;) {
				var i = n.return;
				if (i === null) break;
				var a = i.alternate;
				if (a === null) {
					if (r = i.return, r !== null) {
						n = r;
						continue;
					}
					break;
				}
				if (i.child === a.child) {
					for (a = i.child; a;) {
						if (a === n) return b(i), e;
						if (a === r) return b(i), t;
						a = a.sibling;
					}
					throw Error("Unable to find node on an unmounted component.");
				}
				if (n.return !== r.return) n = i, r = a;
				else {
					for (var o = !1, s = i.child; s;) {
						if (s === n) {
							o = !0, n = i, r = a;
							break;
						}
						if (s === r) {
							o = !0, r = i, n = a;
							break;
						}
						s = s.sibling;
					}
					if (!o) {
						for (s = a.child; s;) {
							if (s === n) {
								o = !0, n = a, r = i;
								break;
							}
							if (s === r) {
								o = !0, r = a, n = i;
								break;
							}
							s = s.sibling;
						}
						if (!o) throw Error("Child was not found in either parent set. This indicates a bug in React related to the return pointer. Please file an issue.");
					}
				}
				if (n.alternate !== r) throw Error("Return fibers should always be each others' alternates. This error is likely caused by a bug in React. Please file an issue.");
			}
			if (n.tag !== 3) throw Error("Unable to find node on an unmounted component.");
			return n.stateNode.current === n ? e : t;
		}
		function ee(e) {
			return e = x(e), e === null ? null : S(e);
		}
		function S(e) {
			var t = e.tag;
			if (t === 5 || t === 26 || t === 27 || t === 6) return e;
			for (e = e.child; e !== null;) {
				if (t = S(e), t !== null) return t;
				e = e.sibling;
			}
			return null;
		}
		function te(e) {
			var t = e.tag;
			if (t === 5 || t === 26 || t === 27 || t === 6) return e;
			for (e = e.child; e !== null;) {
				if (e.tag !== 4 && (t = te(e), t !== null)) return t;
				e = e.sibling;
			}
			return null;
		}
		function ne(e) {
			return typeof e != "object" || !e ? null : (e = Uc && e[Uc] || e["@@iterator"], typeof e == "function" ? e : null);
		}
		function C(e) {
			if (e == null) return null;
			if (typeof e == "function") return e.$$typeof === Wc ? null : e.displayName || e.name || null;
			if (typeof e == "string") return e;
			switch (e) {
				case jc: return "Fragment";
				case Nc: return "Profiler";
				case Mc: return "StrictMode";
				case Lc: return "Suspense";
				case Rc: return "SuspenseList";
				case Vc: return "Activity";
			}
			if (typeof e == "object") switch (typeof e.tag == "number" && console.error("Received an unexpected object in getComponentNameFromType(). This is likely a bug in React. Please file an issue."), e.$$typeof) {
				case Ac: return "Portal";
				case Fc: return e.displayName || "Context";
				case Pc: return (e._context.displayName || "Context") + ".Consumer";
				case Ic:
					var t = e.render;
					return e = e.displayName, e ||= (e = t.displayName || t.name || "", e === "" ? "ForwardRef" : "ForwardRef(" + e + ")"), e;
				case zc: return t = e.displayName || null, t === null ? C(e.type) || "Memo" : t;
				case Bc:
					t = e._payload, e = e._init;
					try {
						return C(e(t));
					} catch {}
			}
			return null;
		}
		function w(e) {
			var t = e.type;
			switch (e.tag) {
				case 31: return "Activity";
				case 24: return "Cache";
				case 9: return (t._context.displayName || "Context") + ".Consumer";
				case 10: return t.displayName || "Context";
				case 18: return "DehydratedFragment";
				case 11: return e = t.render, e = e.displayName || e.name || "", t.displayName || (e === "" ? "ForwardRef" : "ForwardRef(" + e + ")");
				case 7: return "Fragment";
				case 26:
				case 27:
				case 5: return t;
				case 4: return "Portal";
				case 3: return "Root";
				case 6: return "Text";
				case 16: return C(t);
				case 8: return t === Mc ? "StrictMode" : "Mode";
				case 22: return "Offscreen";
				case 12: return "Profiler";
				case 21: return "Scope";
				case 13: return "Suspense";
				case 19: return "SuspenseList";
				case 25: return "TracingMarker";
				case 1:
				case 0:
				case 14:
				case 15:
					if (typeof t == "function") return t.displayName || t.name || null;
					if (typeof t == "string") return t;
					break;
				case 29:
					if (t = e._debugInfo, t != null) {
						for (var n = t.length - 1; 0 <= n; n--) if (typeof t[n].name == "string") return t[n].name;
					}
					if (e.return !== null) return w(e.return);
			}
			return null;
		}
		function T(e) {
			return { current: e };
		}
		function re(e, t) {
			0 > vd ? console.error("Unexpected pop.") : (t !== _d[vd] && console.error("Unexpected Fiber popped."), e.current = gd[vd], gd[vd] = null, _d[vd] = null, vd--);
		}
		function E(e, t, n) {
			vd++, gd[vd] = e.current, _d[vd] = n, e.current = t;
		}
		function ie(e) {
			return e >>>= 0, e === 0 ? 32 : 31 - (xd(e) / Sd | 0) | 0;
		}
		function ae(e) {
			var t = e & 42;
			if (t !== 0) return t;
			switch (e & -e) {
				case 1: return 1;
				case 2: return 2;
				case 4: return 4;
				case 8: return 8;
				case 16: return 16;
				case 32: return 32;
				case 64: return 64;
				case 128: return 128;
				case 256:
				case 512:
				case 1024:
				case 2048:
				case 4096:
				case 8192:
				case 16384:
				case 32768:
				case 65536:
				case 131072: return e & 261888;
				case 262144:
				case 524288:
				case 1048576:
				case 2097152: return e & 3932160;
				case 4194304:
				case 8388608:
				case 16777216:
				case 33554432: return e & 62914560;
				case 67108864: return 67108864;
				case 134217728: return 134217728;
				case 268435456: return 268435456;
				case 536870912: return 536870912;
				case 1073741824: return 0;
				default: return console.error("Should have found matching lanes. This is a bug in React."), e;
			}
		}
		function D(e, t, n) {
			var r = e.pendingLanes;
			if (r === 0) return 0;
			var i = 0, a = e.suspendedLanes, o = e.pingedLanes;
			e = e.warmLanes;
			var s = r & 134217727;
			return s === 0 ? (s = r & ~a, s === 0 ? o === 0 ? n || (n = r & ~e, n !== 0 && (i = ae(n))) : i = ae(o) : i = ae(s)) : (r = s & ~a, r === 0 ? (o &= s, o === 0 ? n || (n = s & ~e, n !== 0 && (i = ae(n))) : i = ae(o)) : i = ae(r)), i === 0 ? 0 : t !== 0 && t !== i && (t & a) === 0 && (a = i & -i, n = t & -t, a >= n || a === 32 && n & 4194048) ? t : i;
		}
		function O(e, t) {
			return (e.pendingLanes & ~(e.suspendedLanes & ~e.pingedLanes) & t) === 0;
		}
		function oe(e, t) {
			switch (e) {
				case 1:
				case 2:
				case 4:
				case 8:
				case 64: return t + 250;
				case 16:
				case 32:
				case 128:
				case 256:
				case 512:
				case 1024:
				case 2048:
				case 4096:
				case 8192:
				case 16384:
				case 32768:
				case 65536:
				case 131072:
				case 262144:
				case 524288:
				case 1048576:
				case 2097152: return t + 5e3;
				case 4194304:
				case 8388608:
				case 16777216:
				case 33554432: return -1;
				case 67108864:
				case 134217728:
				case 268435456:
				case 536870912:
				case 1073741824: return -1;
				default: return console.error("Should have found matching lanes. This is a bug in React."), -1;
			}
		}
		function k() {
			var e = Td;
			return Td <<= 1, !(Td & 62914560) && (Td = 4194304), e;
		}
		function A(e) {
			for (var t = [], n = 0; 31 > n; n++) t.push(e);
			return t;
		}
		function se(e, t) {
			e.pendingLanes |= t, t !== 268435456 && (e.suspendedLanes = 0, e.pingedLanes = 0, e.warmLanes = 0);
		}
		function ce(e, t, n, r, i, a) {
			var o = e.pendingLanes;
			e.pendingLanes = n, e.suspendedLanes = 0, e.pingedLanes = 0, e.warmLanes = 0, e.expiredLanes &= n, e.entangledLanes &= n, e.errorRecoveryDisabledLanes &= n, e.shellSuspendCounter = 0;
			var s = e.entanglements, c = e.expirationTimes, l = e.hiddenUpdates;
			for (n = o & ~n; 0 < n;) {
				var u = 31 - bd(n), d = 1 << u;
				s[u] = 0, c[u] = -1;
				var f = l[u];
				if (f !== null) for (l[u] = null, u = 0; u < f.length; u++) {
					var p = f[u];
					p !== null && (p.lane &= -536870913);
				}
				n &= ~d;
			}
			r !== 0 && le(e, r, 0), a !== 0 && i === 0 && e.tag !== 0 && (e.suspendedLanes |= a & ~(o & ~t));
		}
		function le(e, t, n) {
			e.pendingLanes |= t, e.suspendedLanes &= ~t;
			var r = 31 - bd(t);
			e.entangledLanes |= t, e.entanglements[r] = e.entanglements[r] | 1073741824 | n & 261930;
		}
		function ue(e, t) {
			var n = e.entangledLanes |= t;
			for (e = e.entanglements; n;) {
				var r = 31 - bd(n), i = 1 << r;
				i & t | e[r] & t && (e[r] |= t), n &= ~i;
			}
		}
		function de(e, t) {
			var n = t & -t;
			return n = n & 42 ? 1 : fe(n), (n & (e.suspendedLanes | t)) === 0 ? n : 0;
		}
		function fe(e) {
			switch (e) {
				case 2:
					e = 1;
					break;
				case 8:
					e = 4;
					break;
				case 32:
					e = 16;
					break;
				case 256:
				case 512:
				case 1024:
				case 2048:
				case 4096:
				case 8192:
				case 16384:
				case 32768:
				case 65536:
				case 131072:
				case 262144:
				case 524288:
				case 1048576:
				case 2097152:
				case 4194304:
				case 8388608:
				case 16777216:
				case 33554432:
					e = 128;
					break;
				case 268435456:
					e = 134217728;
					break;
				default: e = 0;
			}
			return e;
		}
		function pe(e, t, n) {
			if (Bd) for (e = e.pendingUpdatersLaneMap; 0 < n;) {
				var r = 31 - bd(n), i = 1 << r;
				e[r].add(t), n &= ~i;
			}
		}
		function me(e, t) {
			if (Bd) for (var n = e.pendingUpdatersLaneMap, r = e.memoizedUpdaters; 0 < t;) {
				var i = 31 - bd(t);
				e = 1 << i, i = n[i], 0 < i.size && (i.forEach(function(e) {
					var t = e.alternate;
					t !== null && r.has(t) || r.add(e);
				}), i.clear()), t &= ~e;
			}
		}
		function he(e) {
			return e &= -e, 2 < e ? 8 < e ? e & 134217727 ? 32 : 268435456 : 8 : 2;
		}
		function ge(e) {
			if (typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ > "u") return !1;
			var t = __REACT_DEVTOOLS_GLOBAL_HOOK__;
			if (t.isDisabled) return !0;
			if (!t.supportsFiber) return console.error("The installed version of React DevTools is too old and will not work with the current version of React. Please update React DevTools. https://react.dev/link/react-devtools"), !0;
			try {
				Ld = t.inject(e), Rd = t;
			} catch (e) {
				console.error("React instrumentation encountered an error: %o.", e);
			}
			return !!t.checkDCE;
		}
		function j(e) {
			if (typeof Fd == "function" && Id(e), Rd && typeof Rd.setStrictMode == "function") try {
				Rd.setStrictMode(Ld, e);
			} catch (e) {
				zd || (zd = !0, console.error("React instrumentation encountered an error: %o", e));
			}
		}
		function _e(e, t) {
			return e === t && (e !== 0 || 1 / e == 1 / t) || e !== e && t !== t;
		}
		function ve(e) {
			for (var t = 0, n = 0; n < e.length; n++) {
				var r = e[n];
				if (typeof r == "object" && r) if (Gc(r) && r.length === 2 && typeof r[0] == "string") {
					if (t !== 0 && t !== 3) return 1;
					t = 3;
				} else return 1;
				else {
					if (typeof r == "function" || typeof r == "string" && 50 < r.length || t !== 0 && t !== 2) return 1;
					t = 2;
				}
			}
			return t;
		}
		function ye(e, t, n, r) {
			for (var i in e) qd.call(e, i) && i[0] !== "_" && be(i, e[i], t, n, r);
		}
		function be(e, t, n, r, i) {
			switch (typeof t) {
				case "object": if (t === null) {
					t = "null";
					break;
				} else {
					if (t.$$typeof === kc) {
						var a = C(t.type) || "…", o = t.key;
						t = t.props;
						var s = Object.keys(t), c = s.length;
						if (o == null && c === 0) {
							t = "<" + a + " />";
							break;
						}
						if (3 > r || c === 1 && s[0] === "children" && o == null) {
							t = "<" + a + " … />";
							break;
						}
						for (var l in n.push([i + "\xA0\xA0".repeat(r) + e, "<" + a]), o !== null && be("key", o, n, r + 1, i), e = !1, t) l === "children" ? t.children != null && (!Gc(t.children) || 0 < t.children.length) && (e = !0) : qd.call(t, l) && l[0] !== "_" && be(l, t[l], n, r + 1, i);
						n.push(["", e ? ">…</" + a + ">" : "/>"]);
						return;
					}
					if (a = Object.prototype.toString.call(t), a = a.slice(8, a.length - 1), a === "Array") {
						if (l = ve(t), l === 2 || l === 0) {
							t = JSON.stringify(t);
							break;
						} else if (l === 3) {
							for (n.push([i + "\xA0\xA0".repeat(r) + e, ""]), e = 0; e < t.length; e++) a = t[e], be(a[0], a[1], n, r + 1, i);
							return;
						}
					}
					if (a === "Promise") {
						if (t.status === "fulfilled") {
							if (a = n.length, be(e, t.value, n, r, i), n.length > a) {
								n = n[a], n[1] = "Promise<" + (n[1] || "Object") + ">";
								return;
							}
						} else if (t.status === "rejected" && (a = n.length, be(e, t.reason, n, r, i), n.length > a)) {
							n = n[a], n[1] = "Rejected Promise<" + n[1] + ">";
							return;
						}
						n.push(["\xA0\xA0".repeat(r) + e, "Promise"]);
						return;
					}
					a === "Object" && (l = Object.getPrototypeOf(t)) && typeof l.constructor == "function" && (a = l.constructor.name), n.push([i + "\xA0\xA0".repeat(r) + e, a === "Object" ? 3 > r ? "" : "…" : a]), 3 > r && ye(t, n, r + 1, i);
					return;
				}
				case "function":
					t = t.name === "" ? "() => {}" : t.name + "() {}";
					break;
				case "string":
					t = t === "This object has been omitted by React in the console log to avoid sending too much data from the server. Try logging smaller or more specific objects." ? "…" : JSON.stringify(t);
					break;
				case "undefined":
					t = "undefined";
					break;
				case "boolean":
					t = t ? "true" : "false";
					break;
				default: t = String(t);
			}
			n.push([i + "\xA0\xA0".repeat(r) + e, t]);
		}
		function xe(e, t, n, r) {
			var i = !0;
			for (o in e) o in t || (n.push(["–\xA0" + "\xA0\xA0".repeat(r) + o, "…"]), i = !1);
			for (var a in t) if (a in e) {
				var o = e[a], s = t[a];
				if (o !== s) {
					if (r === 0 && a === "children") i = "\xA0\xA0".repeat(r) + a, n.push(["–\xA0" + i, "…"], ["+\xA0" + i, "…"]);
					else {
						if (!(3 <= r)) {
							if (typeof o == "object" && typeof s == "object" && o !== null && s !== null && o.$$typeof === s.$$typeof) if (s.$$typeof === kc) {
								if (o.type === s.type && o.key === s.key) {
									o = C(s.type) || "…", i = "\xA0\xA0".repeat(r) + a, o = "<" + o + " … />", n.push(["–\xA0" + i, o], ["+\xA0" + i, o]), i = !1;
									continue;
								}
							} else {
								var c = Object.prototype.toString.call(o), l = Object.prototype.toString.call(s);
								if (c === l && (l === "[object Object]" || l === "[object Array]")) {
									c = [" \xA0" + "\xA0\xA0".repeat(r) + a, l === "[object Array]" ? "Array" : ""], n.push(c), l = n.length, xe(o, s, n, r + 1) ? l === n.length && (c[1] = "Referentially unequal but deeply equal objects. Consider memoization.") : i = !1;
									continue;
								}
							}
							else if (typeof o == "function" && typeof s == "function" && o.name === s.name && o.length === s.length && (c = Function.prototype.toString.call(o), l = Function.prototype.toString.call(s), c === l)) {
								o = s.name === "" ? "() => {}" : s.name + "() {}", n.push([" \xA0" + "\xA0\xA0".repeat(r) + a, o + " Referentially unequal function closure. Consider memoization."]);
								continue;
							}
						}
						be(a, o, n, r, "–\xA0"), be(a, s, n, r, "+\xA0");
					}
					i = !1;
				}
			} else n.push(["+\xA0" + "\xA0\xA0".repeat(r) + a, "…"]), i = !1;
			return i;
		}
		function Se(e) {
			Yd = e & 63 ? "Blocking" : e & 64 ? "Gesture" : e & 4194176 ? "Transition" : e & 62914560 ? "Suspense" : e & 2080374784 ? "Idle" : "Other";
		}
		function Ce(e, t, n, r) {
			Jd && (Qd.start = t, Qd.end = n, Zd.color = "warning", Zd.tooltipText = r, Zd.properties = null, (e = e._debugTask) ? e.run(performance.measure.bind(performance, r, Qd)) : performance.measure(r, Qd));
		}
		function we(e, t, n) {
			Ce(e, t, n, "Reconnect");
		}
		function Te(e, t, n, r, i) {
			var a = w(e);
			if (a !== null && Jd) {
				var o = e.alternate, s = e.actualDuration;
				if (o === null || o.child !== e.child) for (var c = e.child; c !== null; c = c.sibling) s -= c.actualDuration;
				r = .5 > s ? r ? "tertiary-light" : "primary-light" : 10 > s ? r ? "tertiary" : "primary" : 100 > s ? r ? "tertiary-dark" : "primary-dark" : "error";
				var l = e.memoizedProps;
				s = e._debugTask, l !== null && o !== null && o.memoizedProps !== l ? (c = [$d], l = xe(o.memoizedProps, l, c, 0), 1 < c.length && (l && !Xd && (o.lanes & i) === 0 && 100 < e.actualDuration ? (Xd = !0, c[0] = ef, Zd.color = "warning", Zd.tooltipText = "This component received deeply equal props. It might benefit from useMemo or the React Compiler in its owner.") : (Zd.color = r, Zd.tooltipText = a), Zd.properties = c, Qd.start = t, Qd.end = n, s == null ? performance.measure("​" + a, Qd) : s.run(performance.measure.bind(performance, "​" + a, Qd)))) : s == null ? console.timeStamp(a, t, n, "Components ⚛", void 0, r) : s.run(console.timeStamp.bind(console, a, t, n, "Components ⚛", void 0, r));
			}
		}
		function Ee(e, t, n, r) {
			if (Jd) {
				var i = w(e);
				if (i !== null) {
					for (var a = null, o = [], s = 0; s < r.length; s++) {
						var c = r[s];
						a == null && c.source !== null && (a = c.source._debugTask), c = c.value, o.push(["Error", typeof c == "object" && c && typeof c.message == "string" ? String(c.message) : String(c)]);
					}
					e.key !== null && be("key", e.key, o, 0, ""), e.memoizedProps !== null && ye(e.memoizedProps, o, 0, ""), a ??= e._debugTask, e = {
						start: t,
						end: n,
						detail: { devtools: {
							color: "error",
							track: "Components ⚛",
							tooltipText: e.tag === 13 ? "Hydration failed" : "Error boundary caught an error",
							properties: o
						} }
					}, a ? a.run(performance.measure.bind(performance, "​" + i, e)) : performance.measure("​" + i, e);
				}
			}
		}
		function M(e, t, n, r, i) {
			if (i !== null) {
				if (Jd) {
					var a = w(e);
					if (a !== null) {
						r = [];
						for (var o = 0; o < i.length; o++) {
							var s = i[o].value;
							r.push(["Error", typeof s == "object" && s && typeof s.message == "string" ? String(s.message) : String(s)]);
						}
						e.key !== null && be("key", e.key, r, 0, ""), e.memoizedProps !== null && ye(e.memoizedProps, r, 0, ""), t = {
							start: t,
							end: n,
							detail: { devtools: {
								color: "error",
								track: "Components ⚛",
								tooltipText: "A lifecycle or effect errored",
								properties: r
							} }
						}, (e = e._debugTask) ? e.run(performance.measure.bind(performance, "​" + a, t)) : performance.measure("​" + a, t);
					}
				}
			} else a = w(e), a !== null && Jd && (i = 1 > r ? "secondary-light" : 100 > r ? "secondary" : 500 > r ? "secondary-dark" : "error", (e = e._debugTask) ? e.run(console.timeStamp.bind(console, a, t, n, "Components ⚛", void 0, i)) : console.timeStamp(a, t, n, "Components ⚛", void 0, i));
		}
		function De(e, t, n, r) {
			if (Jd && !(t <= e)) {
				var i = (n & 738197653) === n ? "tertiary-dark" : "primary-dark";
				n = (n & 536870912) === n ? "Prepared" : (n & 201326741) === n ? "Hydrated" : "Render", r ? r.run(console.timeStamp.bind(console, n, e, t, Yd, "Scheduler ⚛", i)) : console.timeStamp(n, e, t, Yd, "Scheduler ⚛", i);
			}
		}
		function Oe(e, t, n, r) {
			!Jd || t <= e || (n = (n & 738197653) === n ? "tertiary-dark" : "primary-dark", r ? r.run(console.timeStamp.bind(console, "Prewarm", e, t, Yd, "Scheduler ⚛", n)) : console.timeStamp("Prewarm", e, t, Yd, "Scheduler ⚛", n));
		}
		function ke(e, t, n, r) {
			!Jd || t <= e || (n = (n & 738197653) === n ? "tertiary-dark" : "primary-dark", r ? r.run(console.timeStamp.bind(console, "Suspended", e, t, Yd, "Scheduler ⚛", n)) : console.timeStamp("Suspended", e, t, Yd, "Scheduler ⚛", n));
		}
		function Ae(e, t, n, r, i, a) {
			if (Jd && !(t <= e)) {
				n = [];
				for (var o = 0; o < r.length; o++) {
					var s = r[o].value;
					n.push(["Recoverable Error", typeof s == "object" && s && typeof s.message == "string" ? String(s.message) : String(s)]);
				}
				e = {
					start: e,
					end: t,
					detail: { devtools: {
						color: "primary-dark",
						track: Yd,
						trackGroup: "Scheduler ⚛",
						tooltipText: i ? "Hydration Failed" : "Recovered after Error",
						properties: n
					} }
				}, a ? a.run(performance.measure.bind(performance, "Recovered", e)) : performance.measure("Recovered", e);
			}
		}
		function je(e, t, n, r) {
			!Jd || t <= e || (r ? r.run(console.timeStamp.bind(console, "Errored", e, t, Yd, "Scheduler ⚛", "error")) : console.timeStamp("Errored", e, t, Yd, "Scheduler ⚛", "error"));
		}
		function Me(e, t, n, r) {
			!Jd || t <= e || (r ? r.run(console.timeStamp.bind(console, n, e, t, Yd, "Scheduler ⚛", "secondary-light")) : console.timeStamp(n, e, t, Yd, "Scheduler ⚛", "secondary-light"));
		}
		function Ne(e, t, n, r, i) {
			if (Jd && !(t <= e)) {
				for (var a = [], o = 0; o < n.length; o++) {
					var s = n[o].value;
					a.push(["Error", typeof s == "object" && s && typeof s.message == "string" ? String(s.message) : String(s)]);
				}
				e = {
					start: e,
					end: t,
					detail: { devtools: {
						color: "error",
						track: Yd,
						trackGroup: "Scheduler ⚛",
						tooltipText: r ? "Remaining Effects Errored" : "Commit Errored",
						properties: a
					} }
				}, i ? i.run(performance.measure.bind(performance, "Errored", e)) : performance.measure("Errored", e);
			}
		}
		function Pe() {}
		function Fe() {
			if (tf === 0) {
				nf = console.log, rf = console.info, af = console.warn, of = console.error, sf = console.group, cf = console.groupCollapsed, lf = console.groupEnd;
				var e = {
					configurable: !0,
					enumerable: !0,
					value: Pe,
					writable: !0
				};
				Object.defineProperties(console, {
					info: e,
					log: e,
					warn: e,
					error: e,
					group: e,
					groupCollapsed: e,
					groupEnd: e
				});
			}
			tf++;
		}
		function Ie() {
			if (tf--, tf === 0) {
				var e = {
					configurable: !0,
					enumerable: !0,
					writable: !0
				};
				Object.defineProperties(console, {
					log: Dc({}, e, { value: nf }),
					info: Dc({}, e, { value: rf }),
					warn: Dc({}, e, { value: af }),
					error: Dc({}, e, { value: of }),
					group: Dc({}, e, { value: sf }),
					groupCollapsed: Dc({}, e, { value: cf }),
					groupEnd: Dc({}, e, { value: lf })
				});
			}
			0 > tf && console.error("disabledDepth fell below zero. This is a bug in React. Please file an issue.");
		}
		function Le(e) {
			var t = Error.prepareStackTrace;
			if (Error.prepareStackTrace = void 0, e = e.stack, Error.prepareStackTrace = t, e.startsWith("Error: react-stack-top-frame\n") && (e = e.slice(29)), t = e.indexOf("\n"), t !== -1 && (e = e.slice(t + 1)), t = e.indexOf("react_stack_bottom_frame"), t !== -1 && (t = e.lastIndexOf("\n", t)), t !== -1) e = e.slice(0, t);
			else return "";
			return e;
		}
		function Re(e) {
			if (uf === void 0) try {
				throw Error();
			} catch (e) {
				var t = e.stack.trim().match(/\n( *(at )?)/);
				uf = t && t[1] || "", df = -1 < e.stack.indexOf("\n    at") ? " (<anonymous>)" : -1 < e.stack.indexOf("@") ? "@unknown:0:0" : "";
			}
			return "\n" + uf + e + df;
		}
		function ze(e, t) {
			if (!e || ff) return "";
			var n = pf.get(e);
			if (n !== void 0) return n;
			ff = !0, n = Error.prepareStackTrace, Error.prepareStackTrace = void 0;
			var r = null;
			r = G.H, G.H = null, Fe();
			try {
				var i = { DetermineComponentFrameRoot: function() {
					try {
						if (t) {
							var n = function() {
								throw Error();
							};
							if (Object.defineProperty(n.prototype, "props", { set: function() {
								throw Error();
							} }), typeof Reflect == "object" && Reflect.construct) {
								try {
									Reflect.construct(n, []);
								} catch (e) {
									var r = e;
								}
								Reflect.construct(e, [], n);
							} else {
								try {
									n.call();
								} catch (e) {
									r = e;
								}
								e.call(n.prototype);
							}
						} else {
							try {
								throw Error();
							} catch (e) {
								r = e;
							}
							(n = e()) && typeof n.catch == "function" && n.catch(function() {});
						}
					} catch (e) {
						if (e && r && typeof e.stack == "string") return [e.stack, r.stack];
					}
					return [null, null];
				} };
				i.DetermineComponentFrameRoot.displayName = "DetermineComponentFrameRoot";
				var a = Object.getOwnPropertyDescriptor(i.DetermineComponentFrameRoot, "name");
				a && a.configurable && Object.defineProperty(i.DetermineComponentFrameRoot, "name", { value: "DetermineComponentFrameRoot" });
				var o = i.DetermineComponentFrameRoot(), s = o[0], c = o[1];
				if (s && c) {
					var l = s.split("\n"), u = c.split("\n");
					for (o = a = 0; a < l.length && !l[a].includes("DetermineComponentFrameRoot");) a++;
					for (; o < u.length && !u[o].includes("DetermineComponentFrameRoot");) o++;
					if (a === l.length || o === u.length) for (a = l.length - 1, o = u.length - 1; 1 <= a && 0 <= o && l[a] !== u[o];) o--;
					for (; 1 <= a && 0 <= o; a--, o--) if (l[a] !== u[o]) {
						if (a !== 1 || o !== 1) do
							if (a--, o--, 0 > o || l[a] !== u[o]) {
								var d = "\n" + l[a].replace(" at new ", " at ");
								return e.displayName && d.includes("<anonymous>") && (d = d.replace("<anonymous>", e.displayName)), typeof e == "function" && pf.set(e, d), d;
							}
						while (1 <= a && 0 <= o);
						break;
					}
				}
			} finally {
				ff = !1, G.H = r, Ie(), Error.prepareStackTrace = n;
			}
			return l = (l = e ? e.displayName || e.name : "") ? Re(l) : "", typeof e == "function" && pf.set(e, l), l;
		}
		function Be(e, t) {
			switch (e.tag) {
				case 26:
				case 27:
				case 5: return Re(e.type);
				case 16: return Re("Lazy");
				case 13: return e.child !== t && t !== null ? Re("Suspense Fallback") : Re("Suspense");
				case 19: return Re("SuspenseList");
				case 0:
				case 15: return ze(e.type, !1);
				case 11: return ze(e.type.render, !1);
				case 1: return ze(e.type, !0);
				case 31: return Re("Activity");
				default: return "";
			}
		}
		function Ve(e) {
			try {
				var t = "", n = null;
				do {
					t += Be(e, n);
					var r = e._debugInfo;
					if (r) for (var i = r.length - 1; 0 <= i; i--) {
						var a = r[i];
						if (typeof a.name == "string") {
							var o = t;
							a: {
								var s = a.name, c = a.env, l = a.debugLocation;
								if (l != null) {
									var u = Le(l), d = u.lastIndexOf("\n"), f = d === -1 ? u : u.slice(d + 1);
									if (f.indexOf(s) !== -1) {
										var p = "\n" + f;
										break a;
									}
								}
								p = Re(s + (c ? " [" + c + "]" : ""));
							}
							t = o + p;
						}
					}
					n = e, e = e.return;
				} while (e);
				return t;
			} catch (e) {
				return "\nError generating stack: " + e.message + "\n" + e.stack;
			}
		}
		function He(e) {
			return (e = e ? e.displayName || e.name : "") ? Re(e) : "";
		}
		function Ue(e, t) {
			if (typeof e == "object" && e) {
				var n = mf.get(e);
				return n === void 0 ? (t = {
					value: e,
					source: t,
					stack: Ve(t)
				}, mf.set(e, t), t) : n;
			}
			return {
				value: e,
				source: t,
				stack: Ve(t)
			};
		}
		function We(e, t) {
			Xe(), hf[gf++] = vf, hf[gf++] = _f, _f = e, vf = t;
		}
		function Ge(e, t, n) {
			Xe(), yf[bf++] = Sf, yf[bf++] = Cf, yf[bf++] = xf, xf = e;
			var r = Sf;
			e = Cf;
			var i = 32 - bd(r) - 1;
			r &= ~(1 << i), n += 1;
			var a = 32 - bd(t) + i;
			if (30 < a) {
				var o = i - i % 5;
				a = (r & (1 << o) - 1).toString(32), r >>= o, i -= o, Sf = 1 << 32 - bd(t) + i | n << i | r, Cf = a + e;
			} else Sf = 1 << a | n << i | r, Cf = e;
		}
		function Ke(e) {
			Xe(), e.return !== null && (We(e, 1), Ge(e, 1, 0));
		}
		function qe(e) {
			for (; e === _f;) _f = hf[--gf], hf[gf] = null, vf = hf[--gf], hf[gf] = null;
			for (; e === xf;) xf = yf[--bf], yf[bf] = null, Cf = yf[--bf], yf[bf] = null, Sf = yf[--bf], yf[bf] = null;
		}
		function Je() {
			return Xe(), xf === null ? null : {
				id: Sf,
				overflow: Cf
			};
		}
		function Ye(e, t) {
			Xe(), yf[bf++] = Sf, yf[bf++] = Cf, yf[bf++] = xf, Sf = t.id, Cf = t.overflow, xf = e;
		}
		function Xe() {
			Nf || console.error("Expected to be hydrating. This is a bug in React. Please file an issue.");
		}
		function Ze(e) {
			return e === null && console.error("Expected host context to exist. This error is likely caused by a bug in React. Please file an issue."), e;
		}
		function N(e, t) {
			E(Ef, t, e), E(Tf, e, e), E(wf, null, e), t = Xc(t), re(wf, e), E(wf, t, e);
		}
		function Qe(e) {
			re(wf, e), re(Tf, e), re(Ef, e);
		}
		function $e() {
			return Ze(wf.current);
		}
		function et(e) {
			e.memoizedState !== null && E(Df, e, e);
			var t = Ze(wf.current), n = Zc(t, e.type);
			t !== n && (E(Tf, e, e), E(wf, n, e));
		}
		function tt(e) {
			Tf.current === e && (re(wf, e), re(Tf, e)), Df.current === e && (re(Df, e), cl ? jl._currentValue = Al : jl._currentValue2 = Al);
		}
		function nt(e, t) {
			return e.serverProps === void 0 && e.serverTail.length === 0 && e.children.length === 1 && 3 < e.distanceFromLeaf && e.distanceFromLeaf > 15 - t ? nt(e.children[0], t) : e;
		}
		function rt(e) {
			return "  " + "  ".repeat(e);
		}
		function it(e) {
			return "+ " + "  ".repeat(e);
		}
		function at(e) {
			return "- " + "  ".repeat(e);
		}
		function ot(e) {
			switch (e.tag) {
				case 26:
				case 27:
				case 5: return e.type;
				case 16: return "Lazy";
				case 31: return "Activity";
				case 13: return "Suspense";
				case 19: return "SuspenseList";
				case 0:
				case 15: return e = e.type, e.displayName || e.name || null;
				case 11: return e = e.type.render, e.displayName || e.name || null;
				case 1: return e = e.type, e.displayName || e.name || null;
				default: return null;
			}
		}
		function P(e, t) {
			return Of.test(e) ? (e = JSON.stringify(e), e.length > t - 2 ? 8 > t ? "{\"...\"}" : "{" + e.slice(0, t - 7) + "...\"}" : "{" + e + "}") : e.length > t ? 5 > t ? "{\"...\"}" : e.slice(0, t - 3) + "..." : e;
		}
		function st(e, t, n) {
			var r = 120 - 2 * n;
			if (t === null) return it(n) + P(e, r) + "\n";
			if (typeof t == "string") {
				for (var i = 0; i < t.length && i < e.length && t.charCodeAt(i) === e.charCodeAt(i); i++);
				return i > r - 8 && 10 < i && (e = "..." + e.slice(i - 8), t = "..." + t.slice(i - 8)), it(n) + P(e, r) + "\n" + at(n) + P(t, r) + "\n";
			}
			return rt(n) + P(e, r) + "\n";
		}
		function ct(e) {
			return Object.prototype.toString.call(e).replace(/^\[object (.*)\]$/, function(e, t) {
				return t;
			});
		}
		function lt(e, t) {
			switch (typeof e) {
				case "string": return e = JSON.stringify(e), e.length > t ? 5 > t ? "\"...\"" : e.slice(0, t - 4) + "...\"" : e;
				case "object":
					if (e === null) return "null";
					if (Gc(e)) return "[...]";
					if (e.$$typeof === kc) return (t = C(e.type)) ? "<" + t + ">" : "<...>";
					var n = ct(e);
					if (n === "Object") {
						for (var r in n = "", t -= 2, e) if (e.hasOwnProperty(r)) {
							var i = JSON.stringify(r);
							if (i !== "\"" + r + "\"" && (r = i), t -= r.length - 2, i = lt(e[r], 15 > t ? t : 15), t -= i.length, 0 > t) {
								n += n === "" ? "..." : ", ...";
								break;
							}
							n += (n === "" ? "" : ",") + r + ":" + i;
						}
						return "{" + n + "}";
					}
					return n;
				case "function": return (t = e.displayName || e.name) ? "function " + t : "function";
				default: return String(e);
			}
		}
		function ut(e, t) {
			return typeof e != "string" || Of.test(e) ? "{" + lt(e, t - 2) + "}" : e.length > t - 2 ? 5 > t ? "\"...\"" : "\"" + e.slice(0, t - 5) + "...\"" : "\"" + e + "\"";
		}
		function dt(e, t, n) {
			var r = 120 - n.length - e.length, i = [], a;
			for (a in t) if (t.hasOwnProperty(a) && a !== "children") {
				var o = ut(t[a], 120 - n.length - a.length - 1);
				r -= a.length + o.length + 2, i.push(a + "=" + o);
			}
			return i.length === 0 ? n + "<" + e + ">\n" : 0 < r ? n + "<" + e + " " + i.join(" ") + ">\n" : n + "<" + e + "\n" + n + "  " + i.join("\n" + n + "  ") + "\n" + n + ">\n";
		}
		function ft(e, t, n) {
			var r = "", i = Dc({}, t), a;
			for (a in e) if (e.hasOwnProperty(a)) {
				delete i[a];
				var o = 120 - 2 * n - a.length - 2, s = lt(e[a], o);
				t.hasOwnProperty(a) ? (o = lt(t[a], o), r += it(n) + a + ": " + s + "\n", r += at(n) + a + ": " + o + "\n") : r += it(n) + a + ": " + s + "\n";
			}
			for (var c in i) i.hasOwnProperty(c) && (e = lt(i[c], 120 - 2 * n - c.length - 2), r += at(n) + c + ": " + e + "\n");
			return r;
		}
		function pt(e, t, n, r) {
			var i = "", a = /* @__PURE__ */ new Map();
			for (l in n) n.hasOwnProperty(l) && a.set(l.toLowerCase(), l);
			if (a.size === 1 && a.has("children")) i += dt(e, t, rt(r));
			else {
				for (var o in t) if (t.hasOwnProperty(o) && o !== "children") {
					var s = 120 - 2 * (r + 1) - o.length - 1, c = a.get(o.toLowerCase());
					if (c !== void 0) {
						a.delete(o.toLowerCase());
						var l = t[o];
						c = n[c];
						var u = ut(l, s);
						s = ut(c, s), typeof l == "object" && l && typeof c == "object" && c && ct(l) === "Object" && ct(c) === "Object" && (2 < Object.keys(l).length || 2 < Object.keys(c).length || -1 < u.indexOf("...") || -1 < s.indexOf("...")) ? i += rt(r + 1) + o + "={{\n" + ft(l, c, r + 2) + rt(r + 1) + "}}\n" : (i += it(r + 1) + o + "=" + u + "\n", i += at(r + 1) + o + "=" + s + "\n");
					} else i += rt(r + 1) + o + "=" + ut(t[o], s) + "\n";
				}
				a.forEach(function(e) {
					if (e !== "children") {
						var t = 120 - 2 * (r + 1) - e.length - 1;
						i += at(r + 1) + e + "=" + ut(n[e], t) + "\n";
					}
				}), i = i === "" ? rt(r) + "<" + e + ">\n" : rt(r) + "<" + e + "\n" + i + rt(r) + ">\n";
			}
			return e = n.children, t = t.children, typeof e == "string" || typeof e == "number" || typeof e == "bigint" ? (a = "", (typeof t == "string" || typeof t == "number" || typeof t == "bigint") && (a = "" + t), i += st(a, "" + e, r + 1)) : (typeof t == "string" || typeof t == "number" || typeof t == "bigint") && (i = e == null ? i + st("" + t, null, r + 1) : i + st("" + t, void 0, r + 1)), i;
		}
		function mt(e, t) {
			var n = ot(e);
			if (n === null) {
				for (n = "", e = e.child; e;) n += mt(e, t), e = e.sibling;
				return n;
			}
			return rt(t) + "<" + n + ">\n";
		}
		function ht(e, t) {
			var n = nt(e, t);
			if (n !== e && (e.children.length !== 1 || e.children[0] !== n)) return rt(t) + "...\n" + ht(n, t + 1);
			n = "";
			var r = e.fiber._debugInfo;
			if (r) for (var i = 0; i < r.length; i++) {
				var a = r[i].name;
				typeof a == "string" && (n += rt(t) + "<" + a + ">\n", t++);
			}
			if (r = "", i = e.fiber.pendingProps, e.fiber.tag === 6) r = st(i, e.serverProps, t), t++;
			else if (a = ot(e.fiber), a !== null) if (e.serverProps === void 0) {
				r = t;
				var o = 120 - 2 * r - a.length - 2, s = "";
				for (l in i) if (i.hasOwnProperty(l) && l !== "children") {
					var c = ut(i[l], 15);
					if (o -= l.length + c.length + 2, 0 > o) {
						s += " ...";
						break;
					}
					s += " " + l + "=" + c;
				}
				r = rt(r) + "<" + a + s + ">\n", t++;
			} else e.serverProps === null ? (r = dt(a, i, it(t)), t++) : typeof e.serverProps == "string" ? console.error("Should not have matched a non HostText fiber to a Text node. This is a bug in React.") : (r = pt(a, i, e.serverProps, t), t++);
			var l = "";
			for (i = e.fiber.child, a = 0; i && a < e.children.length;) o = e.children[a], o.fiber === i ? (l += ht(o, t), a++) : l += mt(i, t), i = i.sibling;
			for (i && 0 < e.children.length && (l += rt(t) + "...\n"), i = e.serverTail, e.serverProps === null && t--, e = 0; e < i.length; e++) a = i[e], l = typeof a == "string" ? l + (at(t) + P(a, 120 - 2 * t) + "\n") : l + dt(a.type, a.props, at(t));
			return n + r + l;
		}
		function gt(e) {
			try {
				return "\n\n" + ht(e, 0);
			} catch {
				return "";
			}
		}
		function _t() {
			if (kf === null) return "";
			var e = kf;
			try {
				var t = "";
				switch (e.tag === 6 && (e = e.return), e.tag) {
					case 26:
					case 27:
					case 5:
						t += Re(e.type);
						break;
					case 13:
						t += Re("Suspense");
						break;
					case 19:
						t += Re("SuspenseList");
						break;
					case 31:
						t += Re("Activity");
						break;
					case 30:
					case 0:
					case 15:
					case 1:
						e._debugOwner || t !== "" || (t += He(e.type));
						break;
					case 11: e._debugOwner || t !== "" || (t += He(e.type.render));
				}
				for (; e;) if (typeof e.tag == "number") {
					var n = e;
					e = n._debugOwner;
					var r = n._debugStack;
					if (e && r) {
						var i = Le(r);
						i !== "" && (t += "\n" + i);
					}
				} else if (e.debugStack != null) {
					var a = e.debugStack;
					(e = e.owner) && a && (t += "\n" + Le(a));
				} else break;
				var o = t;
			} catch (e) {
				o = "\nError generating stack: " + e.message + "\n" + e.stack;
			}
			return o;
		}
		function F(e, t, n, r, i, a, o) {
			var s = kf;
			vt(e);
			try {
				return e !== null && e._debugTask ? e._debugTask.run(t.bind(null, n, r, i, a, o)) : t(n, r, i, a, o);
			} finally {
				vt(s);
			}
			throw Error("runWithFiberInDEV should never be called in production. This is a bug in React.");
		}
		function vt(e) {
			G.getCurrentStack = e === null ? null : _t, Af = !1, kf = e;
		}
		function yt(e, t) {
			if (e.return === null) {
				if (Ff === null) Ff = {
					fiber: e,
					children: [],
					serverProps: void 0,
					serverTail: [],
					distanceFromLeaf: t
				};
				else {
					if (Ff.fiber !== e) throw Error("Saw multiple hydration diff roots in a pass. This is a bug in React.");
					Ff.distanceFromLeaf > t && (Ff.distanceFromLeaf = t);
				}
				return Ff;
			}
			var n = yt(e.return, t + 1).children;
			return 0 < n.length && n[n.length - 1].fiber === e ? (n = n[n.length - 1], n.distanceFromLeaf > t && (n.distanceFromLeaf = t), n) : (t = {
				fiber: e,
				children: [],
				serverProps: void 0,
				serverTail: [],
				distanceFromLeaf: t
			}, n.push(t), t);
		}
		function bt() {
			Nf && console.error("We should not be hydrating here. This is a bug in React. Please file a bug.");
		}
		function xt(e, t) {
			Pf || (e = yt(e, 0), e.serverProps = null, t !== null && (t = qu(t), e.serverTail.push(t)));
		}
		function St(e) {
			var t = 1 < arguments.length && arguments[1] !== void 0 ? arguments[1] : !1, n = "", r = Ff;
			throw r !== null && (Ff = null, n = gt(r)), kt(Ue(Error("Hydration failed because the server rendered " + (t ? "text" : "HTML") + " didn't match the client. As a result this tree will be regenerated on the client. This can happen if a SSR-ed Client Component used:\n\n- A server/client branch `if (typeof window !== 'undefined')`.\n- Variable input such as `Date.now()` or `Math.random()` which changes each time it's called.\n- Date formatting in a user's locale which doesn't match the server.\n- External changing data without sending a snapshot of it along with the HTML.\n- Invalid HTML tag nesting.\n\nIt can also happen if the client has a browser extension installed which messes with the HTML before React loaded.\n\nhttps://react.dev/link/hydration-mismatch" + n), e)), Rf;
		}
		function Ct(e, t) {
			if (!dl) throw Error("Expected prepareToHydrateHostInstance() to never be called. This error is likely caused by a bug in React. Please file an issue.");
			Ou(e.stateNode, e.type, e.memoizedProps, t, e) || St(e, !0);
		}
		function wt(e) {
			for (jf = e.return; jf;) switch (jf.tag) {
				case 5:
				case 31:
				case 13:
					Lf = !1;
					return;
				case 27:
				case 3:
					Lf = !0;
					return;
				default: jf = jf.return;
			}
		}
		function Tt(e) {
			if (!dl || e !== jf) return !1;
			if (!Nf) return wt(e), Nf = !0, !1;
			var t = e.tag;
			if (ud ? t !== 3 && t !== 27 && (t !== 5 || Wu(e.type) && !rl(e.type, e.memoizedProps)) && Mf && (Et(e), St(e)) : t !== 3 && (t !== 5 || Wu(e.type) && !rl(e.type, e.memoizedProps)) && Mf && (Et(e), St(e)), wt(e), t === 13) {
				if (!dl) throw Error("Expected skipPastDehydratedSuspenseInstance() to never be called. This error is likely caused by a bug in React. Please file an issue.");
				if (e = e.memoizedState, e = e === null ? null : e.dehydrated, !e) throw Error("Expected to have a hydrated suspense instance. This error is likely caused by a bug in React. Please file an issue.");
				Mf = Nu(e);
			} else if (t === 31) {
				if (e = e.memoizedState, e = e === null ? null : e.dehydrated, !e) throw Error("Expected to have a hydrated suspense instance. This error is likely caused by a bug in React. Please file an issue.");
				Mf = Mu(e);
			} else Mf = ud && t === 27 ? vu(e.type, Mf) : jf ? _u(e.stateNode) : null;
			return !0;
		}
		function Et(e) {
			for (var t = Mf; t;) {
				var n = yt(e, 0), r = qu(t);
				n.serverTail.push(r), t = r.type === "Suspense" ? Nu(t) : _u(t);
			}
		}
		function Dt() {
			dl && (Mf = jf = null, Pf = Nf = !1);
		}
		function Ot() {
			var e = If;
			return e !== null && (l_ === null ? l_ = e : l_.push.apply(l_, e), If = null), e;
		}
		function kt(e) {
			If === null ? If = [e] : If.push(e);
		}
		function At() {
			var e = Ff;
			if (e !== null) {
				Ff = null;
				for (var t = gt(e); 0 < e.children.length;) e = e.children[0];
				F(e.fiber, function() {
					console.error("A tree hydrated but some attributes of the server rendered HTML didn't match the client properties. This won't be patched up. This can happen if a SSR-ed Client Component used:\n\n- A server/client branch `if (typeof window !== 'undefined')`.\n- Variable input such as `Date.now()` or `Math.random()` which changes each time it's called.\n- Date formatting in a user's locale which doesn't match the server.\n- External changing data without sending a snapshot of it along with the HTML.\n- Invalid HTML tag nesting.\n\nIt can also happen if the client has a browser extension installed which messes with the HTML before React loaded.\n\n%s%s", "https://react.dev/link/hydration-mismatch", t);
				});
			}
		}
		function I() {
			Wf = Uf = null, Gf = !1;
		}
		function jt(e, t, n) {
			cl ? (E(zf, t._currentValue, e), t._currentValue = n, E(Bf, t._currentRenderer, e), t._currentRenderer !== void 0 && t._currentRenderer !== null && t._currentRenderer !== Hf && console.error("Detected multiple renderers concurrently rendering the same context provider. This is currently unsupported."), t._currentRenderer = Hf) : (E(zf, t._currentValue2, e), t._currentValue2 = n, E(Vf, t._currentRenderer2, e), t._currentRenderer2 !== void 0 && t._currentRenderer2 !== null && t._currentRenderer2 !== Hf && console.error("Detected multiple renderers concurrently rendering the same context provider. This is currently unsupported."), t._currentRenderer2 = Hf);
		}
		function Mt(e, t) {
			var n = zf.current;
			cl ? (e._currentValue = n, n = Bf.current, re(Bf, t), e._currentRenderer = n) : (e._currentValue2 = n, n = Vf.current, re(Vf, t), e._currentRenderer2 = n), re(zf, t);
		}
		function Nt(e, t, n) {
			for (; e !== null;) {
				var r = e.alternate;
				if ((e.childLanes & t) === t ? r !== null && (r.childLanes & t) !== t && (r.childLanes |= t) : (e.childLanes |= t, r !== null && (r.childLanes |= t)), e === n) break;
				e = e.return;
			}
			e !== n && console.error("Expected to find the propagation root when scheduling context work. This error is likely caused by a bug in React. Please file an issue.");
		}
		function Pt(e, t, n, r) {
			var i = e.child;
			for (i !== null && (i.return = e); i !== null;) {
				var a = i.dependencies;
				if (a !== null) {
					var o = i.child;
					a = a.firstContext;
					a: for (; a !== null;) {
						var s = a;
						a = i;
						for (var c = 0; c < t.length; c++) if (s.context === t[c]) {
							a.lanes |= n, s = a.alternate, s !== null && (s.lanes |= n), Nt(a.return, n, e), r || (o = null);
							break a;
						}
						a = s.next;
					}
				} else if (i.tag === 18) {
					if (o = i.return, o === null) throw Error("We just came from a parent so we must have had a parent. This is a bug in React.");
					o.lanes |= n, a = o.alternate, a !== null && (a.lanes |= n), Nt(o, n, e), o = null;
				} else o = i.child;
				if (o !== null) o.return = i;
				else for (o = i; o !== null;) {
					if (o === e) {
						o = null;
						break;
					}
					if (i = o.sibling, i !== null) {
						i.return = o.return, o = i;
						break;
					}
					o = o.return;
				}
				i = o;
			}
		}
		function Ft(e, t, n, r) {
			e = null;
			for (var i = t, a = !1; i !== null;) {
				if (!a) {
					if (i.flags & 524288) a = !0;
					else if (i.flags & 262144) break;
				}
				if (i.tag === 10) {
					var o = i.alternate;
					if (o === null) throw Error("Should have a current fiber. This is a bug in React.");
					if (o = o.memoizedProps, o !== null) {
						var s = i.type;
						Gd(i.pendingProps.value, o.value) || (e === null ? e = [s] : e.push(s));
					}
				} else if (i === Df.current) {
					if (o = i.alternate, o === null) throw Error("Should have a current fiber. This is a bug in React.");
					o.memoizedState.memoizedState !== i.memoizedState.memoizedState && (e === null ? e = [jl] : e.push(jl));
				}
				i = i.return;
			}
			e !== null && Pt(t, e, n, r), t.flags |= 262144;
		}
		function It(e) {
			for (e = e.firstContext; e !== null;) {
				var t = e.context;
				if (!Gd(cl ? t._currentValue : t._currentValue2, e.memoizedValue)) return !0;
				e = e.next;
			}
			return !1;
		}
		function Lt(e) {
			Uf = e, Wf = null, e = e.dependencies, e !== null && (e.firstContext = null);
		}
		function Rt(e) {
			return Gf && console.error("Context can only be read while React is rendering. In classes, you can read it in the render method or getDerivedStateFromProps. In function components, you can read it directly in the function body, but not inside Hooks like useReducer() or useMemo()."), Bt(Uf, e);
		}
		function zt(e, t) {
			return Uf === null && Lt(e), Bt(e, t);
		}
		function Bt(e, t) {
			var n = cl ? t._currentValue : t._currentValue2;
			if (t = {
				context: t,
				memoizedValue: n,
				next: null
			}, Wf === null) {
				if (e === null) throw Error("Context can only be read while React is rendering. In classes, you can read it in the render method or getDerivedStateFromProps. In function components, you can read it directly in the function body, but not inside Hooks like useReducer() or useMemo().");
				Wf = t, e.dependencies = {
					lanes: 0,
					firstContext: t,
					_debugThenableState: null
				}, e.flags |= 524288;
			} else Wf = Wf.next = t;
			return n;
		}
		function Vt() {
			return {
				controller: new Kf(),
				data: /* @__PURE__ */ new Map(),
				refCount: 0
			};
		}
		function Ht(e) {
			e.controller.signal.aborted && console.warn("A cache instance was retained after it was already freed. This likely indicates a bug in React."), e.refCount++;
		}
		function Ut(e) {
			e.refCount--, 0 > e.refCount && console.warn("A cache instance was released after it was already freed. This likely indicates a bug in React."), e.refCount === 0 && qf(Jf, function() {
				e.controller.abort();
			});
		}
		function Wt(e, t, n) {
			e & 127 ? 0 > cp && (cp = Xf(), lp = Zf(t), dp = t, n != null && (fp = w(n)), ps() && (op = !0, up = 1), e = yl(), t = vl(), e !== hp || t !== mp ? hp = -1.1 : t !== null && (up = 1), pp = e, mp = t) : e & 4194048 && 0 > yp && (yp = Xf(), xp = Zf(t), Sp = t, n != null && (Cp = w(n)), 0 > vp) && (e = yl(), t = vl(), (e !== Ep || t !== Tp) && (Ep = -1.1), wp = e, Tp = t);
		}
		function Gt(e) {
			if (0 > cp) {
				cp = Xf(), lp = e._debugTask == null ? null : e._debugTask, ps() && (up = 1);
				var t = yl(), n = vl();
				t !== hp || n !== mp ? hp = -1.1 : n !== null && (up = 1), pp = t, mp = n;
			}
			0 > yp && (yp = Xf(), xp = e._debugTask == null ? null : e._debugTask, 0 > vp) && (e = yl(), t = vl(), (e !== Ep || t !== Tp) && (Ep = -1.1), wp = e, Tp = t);
		}
		function Kt() {
			var e = rp;
			return rp = 0, e;
		}
		function qt(e) {
			var t = rp;
			return rp = e, t;
		}
		function Jt(e) {
			var t = rp;
			return rp += e, t;
		}
		function Yt() {
			Y = J = -1.1;
		}
		function Xt() {
			var e = J;
			return J = -1.1, e;
		}
		function Zt(e) {
			0 <= e && (J = e);
		}
		function Qt() {
			var e = ip;
			return ip = -0, e;
		}
		function $t(e) {
			0 <= e && (ip = e);
		}
		function en() {
			var e = ap;
			return ap = null, e;
		}
		function tn() {
			var e = op;
			return op = !1, e;
		}
		function nn(e) {
			np = Xf(), 0 > e.actualStartTime && (e.actualStartTime = np);
		}
		function rn(e) {
			if (0 <= np) {
				var t = Xf() - np;
				e.actualDuration += t, e.selfBaseDuration = t, np = -1;
			}
		}
		function an(e) {
			if (0 <= np) {
				var t = Xf() - np;
				e.actualDuration += t, np = -1;
			}
		}
		function on() {
			if (0 <= np) {
				var e = Xf(), t = e - np;
				np = -1, rp += t, ip += t, Y = e;
			}
		}
		function sn(e) {
			ap === null && (ap = []), ap.push(e), tp === null && (tp = []), tp.push(e);
		}
		function cn() {
			np = Xf(), 0 > J && (J = np);
		}
		function ln(e) {
			for (var t = e.child; t;) e.actualDuration += t.actualDuration, t = t.sibling;
		}
		function un() {}
		function dn(e) {
			e !== Pp && e.next === null && (Pp === null ? Np = Pp = e : Pp = Pp.next = e), Lp = !0, G.actQueue === null ? Fp || (Fp = !0, yn()) : Ip || (Ip = !0, yn());
		}
		function fn(e, t) {
			if (!Rp && Lp) {
				Rp = !0;
				do
					for (var n = !1, r = Np; r !== null;) {
						if (!t) if (e !== 0) {
							var i = r.pendingLanes;
							if (i === 0) var a = 0;
							else {
								var o = r.suspendedLanes, s = r.pingedLanes;
								a = (1 << 31 - bd(42 | e) + 1) - 1, a &= i & ~(o & ~s), a = a & 201326741 ? a & 201326741 | 1 : a ? a | 2 : 0;
							}
							a !== 0 && (n = !0, _n(r, a));
						} else a = $, a = D(r, r === Rg ? a : 0, r.cancelPendingCommit !== null || r.timeoutHandle !== sl), !(a & 3) || O(r, a) || (n = !0, _n(r, a));
						r = r.next;
					}
				while (n);
				Rp = !1;
			}
		}
		function pn() {
			_l(), mn();
		}
		function mn() {
			Lp = Ip = Fp = !1;
			var e = 0;
			zp !== 0 && bl() && (e = zp);
			for (var t = Ad(), n = null, r = Np; r !== null;) {
				var i = r.next, a = hn(r, t);
				a === 0 ? (r.next = null, n === null ? Np = i : n.next = i, i === null && (Pp = n)) : (n = r, (e !== 0 || a & 3) && (Lp = !0)), r = i;
			}
			k_ !== C_ && k_ !== O_ || fn(e, !1), zp !== 0 && (zp = 0);
		}
		function hn(e, t) {
			for (var n = e.suspendedLanes, r = e.pingedLanes, i = e.expirationTimes, a = e.pendingLanes & -62914561; 0 < a;) {
				var o = 31 - bd(a), s = 1 << o, c = i[o];
				c === -1 ? ((s & n) === 0 || (s & r) !== 0) && (i[o] = oe(s, t)) : c <= t && (e.expiredLanes |= s), a &= ~s;
			}
			if (t = Rg, n = $, n = D(e, e === t ? n : 0, e.cancelPendingCommit !== null || e.timeoutHandle !== sl), r = e.callbackNode, n === 0 || e === t && (Xg === Hg || Xg === Yg) || e.cancelPendingCommit !== null) return r !== null && vn(r), e.callbackNode = null, e.callbackPriority = 0;
			if (!(n & 3) || O(e, n)) {
				if (t = n & -n, t !== e.callbackPriority || G.actQueue !== null && r !== Bp) vn(r);
				else return t;
				switch (he(n)) {
					case 2:
					case 8:
						n = Md;
						break;
					case 32:
						n = Nd;
						break;
					case 268435456:
						n = Pd;
						break;
					default: n = Nd;
				}
				return r = gn.bind(null, e), G.actQueue === null ? n = Ed(n, r) : (G.actQueue.push(r), n = Bp), e.callbackPriority = t, e.callbackNode = n, t;
			}
			return r !== null && vn(r), e.callbackPriority = 2, e.callbackNode = null, 2;
		}
		function gn(e, t) {
			if (Mp = jp = !1, _l(), k_ !== C_ && k_ !== O_) return e.callbackNode = null, e.callbackPriority = 0, null;
			var n = e.callbackNode;
			if (R_ === y_ && (R_ = x_), Rs() && e.callbackNode !== n) return null;
			var r = $;
			return r = D(e, e === Rg ? r : 0, e.cancelPendingCommit !== null || e.timeoutHandle !== sl), r === 0 ? null : (cs(e, r, t), hn(e, Ad()), e.callbackNode != null && e.callbackNode === n ? gn.bind(null, e) : null);
		}
		function _n(e, t) {
			if (Rs()) return null;
			jp = Mp, Mp = !1, cs(e, t, !0);
		}
		function vn(e) {
			e !== Bp && e !== null && Dd(e);
		}
		function yn() {
			G.actQueue !== null && G.actQueue.push(function() {
				return mn(), null;
			}), Pl ? Fl(function() {
				(Lg & (Og | kg)) === Dg ? mn() : Ed(jd, pn);
			}) : Ed(jd, pn);
		}
		function bn() {
			if (zp === 0) {
				var e = Up;
				e === 0 && (e = Cd, Cd <<= 1, !(Cd & 261888) && (Cd = 256)), zp = e;
			}
			return zp;
		}
		function xn(e, t) {
			if (Vp === null) {
				var n = Vp = [];
				Hp = 0, Up = bn(), Wp = {
					status: "pending",
					value: void 0,
					then: function(e) {
						n.push(e);
					}
				};
			}
			return Hp++, t.then(Sn, Sn), t;
		}
		function Sn() {
			if (--Hp === 0 && (-1 < yp || (vp = -1.1), Vp !== null)) {
				Wp !== null && (Wp.status = "fulfilled");
				var e = Vp;
				Vp = null, Up = 0, Wp = null;
				for (var t = 0; t < e.length; t++) (0, e[t])();
			}
		}
		function Cn(e, t) {
			var n = [], r = {
				status: "pending",
				value: null,
				reason: null,
				then: function(e) {
					n.push(e);
				}
			};
			return e.then(function() {
				r.status = "fulfilled", r.value = t;
				for (var e = 0; e < n.length; e++) (0, n[e])(t);
			}, function(e) {
				for (r.status = "rejected", r.reason = e, e = 0; e < n.length; e++) (0, n[e])(void 0);
			}), r;
		}
		function wn() {
			var e = Kp.current;
			return e === null ? Rg.pooledCache : e;
		}
		function Tn(e, t) {
			t === null ? E(Kp, Kp.current, e) : E(Kp, t.pool, e);
		}
		function En() {
			var e = wn();
			return e === null ? null : {
				parent: cl ? Yf._currentValue : Yf._currentValue2,
				pool: e
			};
		}
		function Dn(e, t) {
			if (Gd(e, t)) return !0;
			if (typeof e != "object" || !e || typeof t != "object" || !t) return !1;
			var n = Object.keys(e), r = Object.keys(t);
			if (n.length !== r.length) return !1;
			for (r = 0; r < n.length; r++) {
				var i = n[r];
				if (!qd.call(t, i) || !Gd(e[i], t[i])) return !1;
			}
			return !0;
		}
		function On() {
			return {
				didWarnAboutUncachedPromise: !1,
				thenables: []
			};
		}
		function kn(e) {
			return e = e.status, e === "fulfilled" || e === "rejected";
		}
		function An(e, t, n) {
			G.actQueue !== null && (G.didUsePromise = !0);
			var r = e.thenables;
			if (n = r[n], n === void 0 ? r.push(t) : n !== t && (e.didWarnAboutUncachedPromise || (e.didWarnAboutUncachedPromise = !0, console.error("A component was suspended by an uncached promise. Creating promises inside a Client Component or hook is not yet supported, except via a Suspense-compatible library or framework.")), t.then(un, un), t = n), t._debugInfo === void 0) {
				e = performance.now(), r = t.displayName;
				var i = {
					name: typeof r == "string" ? r : "Promise",
					start: e,
					end: e,
					value: t
				};
				t._debugInfo = [{ awaited: i }], t.status !== "fulfilled" && t.status !== "rejected" && (e = function() {
					i.end = performance.now();
				}, t.then(e, e));
			}
			switch (t.status) {
				case "fulfilled": return t.value;
				case "rejected": throw e = t.reason, Nn(e), e;
				default:
					if (typeof t.status == "string") t.then(un, un);
					else {
						if (e = Rg, e !== null && 100 < e.shellSuspendCounter) throw Error("An unknown Component is an async Client Component. Only Server Components can be async at the moment. This error is often caused by accidentally adding `'use client'` to a module that was originally written for the server.");
						e = t, e.status = "pending", e.then(function(e) {
							if (t.status === "pending") {
								var n = t;
								n.status = "fulfilled", n.value = e;
							}
						}, function(e) {
							if (t.status === "pending") {
								var n = t;
								n.status = "rejected", n.reason = e;
							}
						});
					}
					switch (t.status) {
						case "fulfilled": return t.value;
						case "rejected": throw e = t.reason, Nn(e), e;
					}
					throw Tm = t, Em = !0, xm;
			}
		}
		function jn(e) {
			try {
				return bm(e);
			} catch (e) {
				throw typeof e == "object" && e && typeof e.then == "function" ? (Tm = e, Em = !0, xm) : e;
			}
		}
		function Mn() {
			if (Tm === null) throw Error("Expected a suspended thenable. This is a bug in React. Please file an issue.");
			var e = Tm;
			return Tm = null, Em = !1, e;
		}
		function Nn(e) {
			if (e === xm || e === Cm) throw Error("Hooks are not supported inside an async component. This error is often caused by accidentally adding `'use client'` to a module that was originally written for the server.");
		}
		function Pn(e) {
			var t = X;
			return e != null && (X = t === null ? e : t.concat(e)), t;
		}
		function Fn() {
			var e = X;
			if (e != null) {
				for (var t = e.length - 1; 0 <= t; t--) if (e[t].name != null) {
					var n = e[t].debugTask;
					if (n != null) return n;
				}
			}
			return null;
		}
		function In(e, t, n) {
			for (var r = Object.keys(e.props), i = 0; i < r.length; i++) {
				var a = r[i];
				if (a !== "children" && a !== "key") {
					t === null && (t = uc(e, n.mode, 0), t._debugInfo = X, t.return = n), F(t, function(e) {
						console.error("Invalid prop `%s` supplied to `React.Fragment`. React.Fragment can only have `key` and `children` props.", e);
					}, a);
					break;
				}
			}
		}
		function Ln(e) {
			var t = Om;
			return Om += 1, Dm === null && (Dm = On()), An(Dm, e, t);
		}
		function L(e, t) {
			t = t.props.ref, e.ref = t === void 0 ? null : t;
		}
		function Rn(e, t) {
			throw t.$$typeof === Oc ? Error("A React Element from an older version of React was rendered. This is not supported. It can happen if:\n- Multiple copies of the \"react\" package is used.\n- A library pre-bundled an old copy of \"react\" or \"react/jsx-runtime\".\n- A compiler tries to \"inline\" JSX instead of using the runtime.") : (e = Object.prototype.toString.call(t), Error("Objects are not valid as a React child (found: " + (e === "[object Object]" ? "object with keys {" + Object.keys(t).join(", ") + "}" : e) + "). If you meant to render a collection of children, use an array instead."));
		}
		function zn(e, t) {
			var n = Fn();
			n === null ? Rn(e, t) : n.run(Rn.bind(null, e, t));
		}
		function Bn(e, t) {
			var n = w(e) || "Component";
			Mm[n] || (Mm[n] = !0, t = t.displayName || t.name || "Component", e.tag === 3 ? console.error("Functions are not valid as a React child. This may happen if you return %s instead of <%s /> from render. Or maybe you meant to call this function rather than return it.\n  root.render(%s)", t, t, t) : console.error("Functions are not valid as a React child. This may happen if you return %s instead of <%s /> from render. Or maybe you meant to call this function rather than return it.\n  <%s>{%s}</%s>", t, t, n, t, n));
		}
		function Vn(e, t) {
			var n = Fn();
			n === null ? Bn(e, t) : n.run(Bn.bind(null, e, t));
		}
		function Hn(e, t) {
			var n = w(e) || "Component";
			Nm[n] || (Nm[n] = !0, t = String(t), e.tag === 3 ? console.error("Symbols are not valid as a React child.\n  root.render(%s)", t) : console.error("Symbols are not valid as a React child.\n  <%s>%s</%s>", n, t, n));
		}
		function Un(e, t) {
			var n = Fn();
			n === null ? Hn(e, t) : n.run(Hn.bind(null, e, t));
		}
		function Wn(e) {
			function t(t, n) {
				if (e) {
					var r = t.deletions;
					r === null ? (t.deletions = [n], t.flags |= 16) : r.push(n);
				}
			}
			function n(n, r) {
				if (!e) return null;
				for (; r !== null;) t(n, r), r = r.sibling;
				return null;
			}
			function r(e) {
				for (var t = /* @__PURE__ */ new Map(); e !== null;) e.key === null ? t.set(e.index, e) : t.set(e.key, e), e = e.sibling;
				return t;
			}
			function i(e, t) {
				return e = sc(e, t), e.index = 0, e.sibling = null, e;
			}
			function a(t, n, r) {
				return t.index = r, e ? (r = t.alternate, r === null ? (t.flags |= 67108866, n) : (r = r.index, r < n ? (t.flags |= 67108866, n) : r)) : (t.flags |= 1048576, n);
			}
			function o(t) {
				return e && t.alternate === null && (t.flags |= 67108866), t;
			}
			function s(e, t, n, r) {
				return t === null || t.tag !== 6 ? (t = fc(n, e.mode, r), t.return = e, t._debugOwner = e, t._debugTask = e._debugTask, t._debugInfo = X, t) : (t = i(t, n), t.return = e, t._debugInfo = X, t);
			}
			function c(e, t, n, r) {
				var a = n.type;
				return a === jc ? (t = d(e, t, n.props.children, r, n.key), In(n, t, e), t) : t !== null && (t.elementType === a || nc(t, n) || typeof a == "object" && a && a.$$typeof === Bc && jn(a) === t.type) ? (t = i(t, n.props), L(t, n), t.return = e, t._debugOwner = n._owner, t._debugInfo = X, t) : (t = uc(n, e.mode, r), L(t, n), t.return = e, t._debugInfo = X, t);
			}
			function l(e, t, n, r) {
				return t === null || t.tag !== 4 || t.stateNode.containerInfo !== n.containerInfo || t.stateNode.implementation !== n.implementation ? (t = mc(n, e.mode, r), t.return = e, t._debugInfo = X, t) : (t = i(t, n.children || []), t.return = e, t._debugInfo = X, t);
			}
			function d(e, t, n, r, a) {
				return t === null || t.tag !== 7 ? (t = dc(n, e.mode, r, a), t.return = e, t._debugOwner = e, t._debugTask = e._debugTask, t._debugInfo = X, t) : (t = i(t, n), t.return = e, t._debugInfo = X, t);
			}
			function f(e, t, n) {
				if (typeof t == "string" && t !== "" || typeof t == "number" || typeof t == "bigint") return t = fc("" + t, e.mode, n), t.return = e, t._debugOwner = e, t._debugTask = e._debugTask, t._debugInfo = X, t;
				if (typeof t == "object" && t) {
					switch (t.$$typeof) {
						case kc: return n = uc(t, e.mode, n), L(n, t), n.return = e, e = Pn(t._debugInfo), n._debugInfo = X, X = e, n;
						case Ac: return t = mc(t, e.mode, n), t.return = e, t._debugInfo = X, t;
						case Bc:
							var r = Pn(t._debugInfo);
							return t = jn(t), e = f(e, t, n), X = r, e;
					}
					if (Gc(t) || ne(t)) return n = dc(t, e.mode, n, null), n.return = e, n._debugOwner = e, n._debugTask = e._debugTask, e = Pn(t._debugInfo), n._debugInfo = X, X = e, n;
					if (typeof t.then == "function") return r = Pn(t._debugInfo), e = f(e, Ln(t), n), X = r, e;
					if (t.$$typeof === Fc) return f(e, zt(e, t), n);
					zn(e, t);
				}
				return typeof t == "function" && Vn(e, t), typeof t == "symbol" && Un(e, t), null;
			}
			function p(e, t, n, r) {
				var i = t === null ? null : t.key;
				if (typeof n == "string" && n !== "" || typeof n == "number" || typeof n == "bigint") return i === null ? s(e, t, "" + n, r) : null;
				if (typeof n == "object" && n) {
					switch (n.$$typeof) {
						case kc: return n.key === i ? (i = Pn(n._debugInfo), e = c(e, t, n, r), X = i, e) : null;
						case Ac: return n.key === i ? l(e, t, n, r) : null;
						case Bc: return i = Pn(n._debugInfo), n = jn(n), e = p(e, t, n, r), X = i, e;
					}
					if (Gc(n) || ne(n)) return i === null ? (i = Pn(n._debugInfo), e = d(e, t, n, r, null), X = i, e) : null;
					if (typeof n.then == "function") return i = Pn(n._debugInfo), e = p(e, t, Ln(n), r), X = i, e;
					if (n.$$typeof === Fc) return p(e, t, zt(e, n), r);
					zn(e, n);
				}
				return typeof n == "function" && Vn(e, n), typeof n == "symbol" && Un(e, n), null;
			}
			function m(e, t, n, r, i) {
				if (typeof r == "string" && r !== "" || typeof r == "number" || typeof r == "bigint") return e = e.get(n) || null, s(t, e, "" + r, i);
				if (typeof r == "object" && r) {
					switch (r.$$typeof) {
						case kc: return n = e.get(r.key === null ? n : r.key) || null, e = Pn(r._debugInfo), t = c(t, n, r, i), X = e, t;
						case Ac: return e = e.get(r.key === null ? n : r.key) || null, l(t, e, r, i);
						case Bc:
							var a = Pn(r._debugInfo);
							return r = jn(r), t = m(e, t, n, r, i), X = a, t;
					}
					if (Gc(r) || ne(r)) return n = e.get(n) || null, e = Pn(r._debugInfo), t = d(t, n, r, i, null), X = e, t;
					if (typeof r.then == "function") return a = Pn(r._debugInfo), t = m(e, t, n, Ln(r), i), X = a, t;
					if (r.$$typeof === Fc) return m(e, t, n, zt(t, r), i);
					zn(t, r);
				}
				return typeof r == "function" && Vn(t, r), typeof r == "symbol" && Un(t, r), null;
			}
			function h(e, t, n, r) {
				if (typeof n != "object" || !n) return r;
				switch (n.$$typeof) {
					case kc:
					case Ac:
						_(e, t, n);
						var i = n.key;
						if (typeof i != "string") break;
						if (r === null) {
							r = /* @__PURE__ */ new Set(), r.add(i);
							break;
						}
						if (!r.has(i)) {
							r.add(i);
							break;
						}
						F(t, function() {
							console.error("Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.", i);
						});
						break;
					case Bc: n = jn(n), h(e, t, n, r);
				}
				return r;
			}
			function g(i, o, s, c) {
				for (var l = null, u = null, d = null, g = o, _ = o = 0, v = null; g !== null && _ < s.length; _++) {
					g.index > _ ? (v = g, g = null) : v = g.sibling;
					var y = p(i, g, s[_], c);
					if (y === null) {
						g === null && (g = v);
						break;
					}
					l = h(i, y, s[_], l), e && g && y.alternate === null && t(i, g), o = a(y, o, _), d === null ? u = y : d.sibling = y, d = y, g = v;
				}
				if (_ === s.length) return n(i, g), Nf && We(i, _), u;
				if (g === null) {
					for (; _ < s.length; _++) g = f(i, s[_], c), g !== null && (l = h(i, g, s[_], l), o = a(g, o, _), d === null ? u = g : d.sibling = g, d = g);
					return Nf && We(i, _), u;
				}
				for (g = r(g); _ < s.length; _++) v = m(g, i, _, s[_], c), v !== null && (l = h(i, v, s[_], l), e && v.alternate !== null && g.delete(v.key === null ? _ : v.key), o = a(v, o, _), d === null ? u = v : d.sibling = v, d = v);
				return e && g.forEach(function(e) {
					return t(i, e);
				}), Nf && We(i, _), u;
			}
			function v(i, o, s, c) {
				if (s == null) throw Error("An iterable object provided no iterator.");
				for (var l = null, u = null, d = o, g = o = 0, _ = null, v = null, y = s.next(); d !== null && !y.done; g++, y = s.next()) {
					d.index > g ? (_ = d, d = null) : _ = d.sibling;
					var b = p(i, d, y.value, c);
					if (b === null) {
						d === null && (d = _);
						break;
					}
					v = h(i, b, y.value, v), e && d && b.alternate === null && t(i, d), o = a(b, o, g), u === null ? l = b : u.sibling = b, u = b, d = _;
				}
				if (y.done) return n(i, d), Nf && We(i, g), l;
				if (d === null) {
					for (; !y.done; g++, y = s.next()) d = f(i, y.value, c), d !== null && (v = h(i, d, y.value, v), o = a(d, o, g), u === null ? l = d : u.sibling = d, u = d);
					return Nf && We(i, g), l;
				}
				for (d = r(d); !y.done; g++, y = s.next()) _ = m(d, i, g, y.value, c), _ !== null && (v = h(i, _, y.value, v), e && _.alternate !== null && d.delete(_.key === null ? g : _.key), o = a(_, o, g), u === null ? l = _ : u.sibling = _, u = _);
				return e && d.forEach(function(e) {
					return t(i, e);
				}), Nf && We(i, g), l;
			}
			function y(e, r, a, s) {
				if (typeof a == "object" && a && a.type === jc && a.key === null && (In(a, null, e), a = a.props.children), typeof a == "object" && a) {
					switch (a.$$typeof) {
						case kc:
							var c = Pn(a._debugInfo);
							a: {
								for (var l = a.key; r !== null;) {
									if (r.key === l) {
										if (l = a.type, l === jc) {
											if (r.tag === 7) {
												n(e, r.sibling), s = i(r, a.props.children), s.return = e, s._debugOwner = a._owner, s._debugInfo = X, In(a, s, e), e = s;
												break a;
											}
										} else if (r.elementType === l || nc(r, a) || typeof l == "object" && l && l.$$typeof === Bc && jn(l) === r.type) {
											n(e, r.sibling), s = i(r, a.props), L(s, a), s.return = e, s._debugOwner = a._owner, s._debugInfo = X, e = s;
											break a;
										}
										n(e, r);
										break;
									} else t(e, r);
									r = r.sibling;
								}
								a.type === jc ? (s = dc(a.props.children, e.mode, s, a.key), s.return = e, s._debugOwner = e, s._debugTask = e._debugTask, s._debugInfo = X, In(a, s, e), e = s) : (s = uc(a, e.mode, s), L(s, a), s.return = e, s._debugInfo = X, e = s);
							}
							return e = o(e), X = c, e;
						case Ac:
							a: {
								for (c = a, a = c.key; r !== null;) {
									if (r.key === a) if (r.tag === 4 && r.stateNode.containerInfo === c.containerInfo && r.stateNode.implementation === c.implementation) {
										n(e, r.sibling), s = i(r, c.children || []), s.return = e, e = s;
										break a;
									} else {
										n(e, r);
										break;
									}
									else t(e, r);
									r = r.sibling;
								}
								s = mc(c, e.mode, s), s.return = e, e = s;
							}
							return o(e);
						case Bc: return c = Pn(a._debugInfo), a = jn(a), e = y(e, r, a, s), X = c, e;
					}
					if (Gc(a)) return c = Pn(a._debugInfo), e = g(e, r, a, s), X = c, e;
					if (ne(a)) {
						if (c = Pn(a._debugInfo), l = ne(a), typeof l != "function") throw Error("An object is not an iterable. This error is likely caused by a bug in React. Please file an issue.");
						var u = l.call(a);
						return u === a ? (e.tag !== 0 || Object.prototype.toString.call(e.type) !== "[object GeneratorFunction]" || Object.prototype.toString.call(u) !== "[object Generator]") && (Am || console.error("Using Iterators as children is unsupported and will likely yield unexpected results because enumerating a generator mutates it. You may convert it to an array with `Array.from()` or the `[...spread]` operator before rendering. You can also use an Iterable that can iterate multiple times over the same items."), Am = !0) : a.entries !== l || km || (console.error("Using Maps as children is not supported. Use an array of keyed ReactElements instead."), km = !0), e = v(e, r, u, s), X = c, e;
					}
					if (typeof a.then == "function") return c = Pn(a._debugInfo), e = y(e, r, Ln(a), s), X = c, e;
					if (a.$$typeof === Fc) return y(e, r, zt(e, a), s);
					zn(e, a);
				}
				return typeof a == "string" && a !== "" || typeof a == "number" || typeof a == "bigint" ? (c = "" + a, r !== null && r.tag === 6 ? (n(e, r.sibling), s = i(r, c), s.return = e, e = s) : (n(e, r), s = fc(c, e.mode, s), s.return = e, s._debugOwner = e, s._debugTask = e._debugTask, s._debugInfo = X, e = s), o(e)) : (typeof a == "function" && Vn(e, a), typeof a == "symbol" && Un(e, a), n(e, r));
			}
			return function(e, t, n, r) {
				var i = X;
				X = null;
				try {
					Om = 0;
					var a = y(e, t, n, r);
					return Dm = null, a;
				} catch (t) {
					if (t === xm || t === Cm) throw t;
					var o = u(29, t, null, e.mode);
					o.lanes = r, o.return = e;
					var s = o._debugInfo = X;
					if (o._debugOwner = e._debugOwner, o._debugTask = e._debugTask, s != null) {
						for (var c = s.length - 1; 0 <= c; c--) if (typeof s[c].stack == "string") {
							o._debugOwner = s[c], o._debugTask = s[c].debugTask;
							break;
						}
					}
					return o;
				} finally {
					X = i;
				}
			};
		}
		function Gn(e, t) {
			var n = Gc(e);
			return e = !n && typeof ne(e) == "function", n || e ? (n = n ? "array" : "iterable", console.error("A nested %s was passed to row #%s in <SuspenseList />. Wrap it in an additional SuspenseList to configure its revealOrder: <SuspenseList revealOrder=...> ... <SuspenseList revealOrder=...>{%s}</SuspenseList> ... </SuspenseList>", n, t, n), !1) : !0;
		}
		function Kn() {
			for (var e = zm, t = Bm = zm = 0; t < e;) {
				var n = Rm[t];
				Rm[t++] = null;
				var r = Rm[t];
				Rm[t++] = null;
				var i = Rm[t];
				Rm[t++] = null;
				var a = Rm[t];
				if (Rm[t++] = null, r !== null && i !== null) {
					var o = r.pending;
					o === null ? i.next = i : (i.next = o.next, o.next = i), r.pending = i;
				}
				a !== 0 && Xn(n, i, a);
			}
		}
		function qn(e, t, n, r) {
			Rm[zm++] = e, Rm[zm++] = t, Rm[zm++] = n, Rm[zm++] = r, Bm |= r, e.lanes |= r, e = e.alternate, e !== null && (e.lanes |= r);
		}
		function Jn(e, t, n, r) {
			return qn(e, t, n, r), Zn(e);
		}
		function Yn(e, t) {
			return qn(e, null, null, t), Zn(e);
		}
		function Xn(e, t, n) {
			e.lanes |= n;
			var r = e.alternate;
			r !== null && (r.lanes |= n);
			for (var i = !1, a = e.return; a !== null;) a.childLanes |= n, r = a.alternate, r !== null && (r.childLanes |= n), a.tag === 22 && (e = a.stateNode, e === null || e._visibility & Im || (i = !0)), e = a, a = a.return;
			return e.tag === 3 ? (a = e.stateNode, i && t !== null && (i = 31 - bd(n), e = a.hiddenUpdates, r = e[i], r === null ? e[i] = [t] : r.push(t), t.lane = n | 536870912), a) : null;
		}
		function Zn(e) {
			if (V_ > B_) throw K_ = V_ = 0, q_ = H_ = null, Error("Maximum update depth exceeded. This can happen when a component repeatedly calls setState inside componentWillUpdate or componentDidUpdate. React limits the number of nested updates to prevent infinite loops.");
			K_ > G_ && (K_ = 0, q_ = null, console.error("Maximum update depth exceeded. This can happen when a component calls setState inside useEffect, but useEffect either doesn't have a dependency array, or one of the dependencies changes on every render.")), e.alternate === null && e.flags & 4098 && Xs(e);
			for (var t = e, n = t.return; n !== null;) t.alternate === null && t.flags & 4098 && Xs(e), t = n, n = t.return;
			return t.tag === 3 ? t.stateNode : null;
		}
		function Qn(e) {
			e.updateQueue = {
				baseState: e.memoizedState,
				firstBaseUpdate: null,
				lastBaseUpdate: null,
				shared: {
					pending: null,
					lanes: 0,
					hiddenCallbacks: null
				},
				callbacks: null
			};
		}
		function $n(e, t) {
			e = e.updateQueue, t.updateQueue === e && (t.updateQueue = {
				baseState: e.baseState,
				firstBaseUpdate: e.firstBaseUpdate,
				lastBaseUpdate: e.lastBaseUpdate,
				shared: e.shared,
				callbacks: null
			});
		}
		function er(e) {
			return {
				lane: e,
				tag: Vm,
				payload: null,
				callback: null,
				next: null
			};
		}
		function tr(e, t, n) {
			var r = e.updateQueue;
			if (r === null) return null;
			if (r = r.shared, qm === r && !Km) {
				var i = w(e);
				console.error("An update (setState, replaceState, or forceUpdate) was scheduled from inside an update function. Update functions should be pure, with zero side-effects. Consider using componentDidUpdate or a callback.\n\nPlease update the following component: %s", i), Km = !0;
			}
			return (Lg & Og) === Dg ? (qn(e, r, t, n), Zn(e)) : (i = r.pending, i === null ? t.next = t : (t.next = i.next, i.next = t), r.pending = t, t = Zn(e), Xn(e, null, n), t);
		}
		function nr(e, t, n) {
			if (t = t.updateQueue, t !== null && (t = t.shared, n & 4194048)) {
				var r = t.lanes;
				r &= e.pendingLanes, n |= r, t.lanes = n, ue(e, n);
			}
		}
		function rr(e, t) {
			var n = e.updateQueue, r = e.alternate;
			if (r !== null && (r = r.updateQueue, n === r)) {
				var i = null, a = null;
				if (n = n.firstBaseUpdate, n !== null) {
					do {
						var o = {
							lane: n.lane,
							tag: n.tag,
							payload: n.payload,
							callback: null,
							next: null
						};
						a === null ? i = a = o : a = a.next = o, n = n.next;
					} while (n !== null);
					a === null ? i = a = t : a = a.next = t;
				} else i = a = t;
				n = {
					baseState: r.baseState,
					firstBaseUpdate: i,
					lastBaseUpdate: a,
					shared: r.shared,
					callbacks: r.callbacks
				}, e.updateQueue = n;
				return;
			}
			e = n.lastBaseUpdate, e === null ? n.firstBaseUpdate = t : e.next = t, n.lastBaseUpdate = t;
		}
		function ir() {
			if (Jm) {
				var e = Wp;
				if (e !== null) throw e;
			}
		}
		function ar(e, t, n, r) {
			Jm = !1;
			var i = e.updateQueue;
			Gm = !1, qm = i.shared;
			var a = i.firstBaseUpdate, o = i.lastBaseUpdate, s = i.shared.pending;
			if (s !== null) {
				i.shared.pending = null;
				var c = s, l = c.next;
				c.next = null, o === null ? a = l : o.next = l, o = c;
				var u = e.alternate;
				u !== null && (u = u.updateQueue, s = u.lastBaseUpdate, s !== o && (s === null ? u.firstBaseUpdate = l : s.next = l, u.lastBaseUpdate = c));
			}
			if (a !== null) {
				var d = i.baseState;
				o = 0, u = l = c = null, s = a;
				do {
					var f = s.lane & -536870913, p = f !== s.lane;
					if (p ? ($ & f) === f : (r & f) === f) {
						f !== 0 && f === Up && (Jm = !0), u !== null && (u = u.next = {
							lane: 0,
							tag: s.tag,
							payload: s.payload,
							callback: null,
							next: null
						});
						a: {
							f = e;
							var m = s, h = t, g = n;
							switch (m.tag) {
								case Hm:
									if (m = m.payload, typeof m == "function") {
										Gf = !0;
										var _ = m.call(g, d, h);
										if (f.mode & 8) {
											j(!0);
											try {
												m.call(g, d, h);
											} finally {
												j(!1);
											}
										}
										Gf = !1, d = _;
										break a;
									}
									d = m;
									break a;
								case Wm: f.flags = f.flags & -65537 | 128;
								case Vm:
									if (_ = m.payload, typeof _ == "function") {
										if (Gf = !0, m = _.call(g, d, h), f.mode & 8) {
											j(!0);
											try {
												_.call(g, d, h);
											} finally {
												j(!1);
											}
										}
										Gf = !1;
									} else m = _;
									if (m == null) break a;
									d = Dc({}, d, m);
									break a;
								case Um: Gm = !0;
							}
						}
						f = s.callback, f !== null && (e.flags |= 64, p && (e.flags |= 8192), p = i.callbacks, p === null ? i.callbacks = [f] : p.push(f));
					} else p = {
						lane: f,
						tag: s.tag,
						payload: s.payload,
						callback: s.callback,
						next: null
					}, u === null ? (l = u = p, c = d) : u = u.next = p, o |= f;
					if (s = s.next, s === null) {
						if (s = i.shared.pending, s === null) break;
						p = s, s = p.next, p.next = null, i.lastBaseUpdate = p, i.shared.pending = null;
					}
				} while (1);
				u === null && (c = d), i.baseState = c, i.firstBaseUpdate = l, i.lastBaseUpdate = u, a === null && (i.shared.lanes = 0), r_ |= o, e.lanes = o, e.memoizedState = d;
			}
			qm = null;
		}
		function or(e, t) {
			if (typeof e != "function") throw Error("Invalid argument passed as callback. Expected a function. Instead received: " + e);
			e.call(t);
		}
		function sr(e, t) {
			var n = e.shared.hiddenCallbacks;
			if (n !== null) for (e.shared.hiddenCallbacks = null, e = 0; e < n.length; e++) or(n[e], t);
		}
		function cr(e, t) {
			var n = e.callbacks;
			if (n !== null) for (e.callbacks = null, e = 0; e < n.length; e++) or(n[e], t);
		}
		function lr(e, t) {
			var n = t_;
			E(Xm, n, e), E(Ym, t, e), t_ = n | t.baseLanes;
		}
		function ur(e) {
			E(Xm, t_, e), E(Ym, Ym.current, e);
		}
		function dr(e) {
			t_ = Xm.current, re(Ym, e), re(Xm, e);
		}
		function fr(e) {
			var t = e.alternate;
			E(th, th.current & $m, e), E(Zm, e, e), Qm === null && (t === null || Ym.current !== null || t.memoizedState !== null) && (Qm = e);
		}
		function pr(e) {
			E(th, th.current, e), E(Zm, e, e), Qm === null && (Qm = e);
		}
		function mr(e) {
			e.tag === 22 ? (E(th, th.current, e), E(Zm, e, e), Qm === null && (Qm = e)) : hr(e);
		}
		function hr(e) {
			E(th, th.current, e), E(Zm, Zm.current, e);
		}
		function gr(e) {
			re(Zm, e), Qm === e && (Qm = null), re(th, e);
		}
		function _r(e) {
			for (var t = e; t !== null;) {
				if (t.tag === 13) {
					var n = t.memoizedState;
					if (n !== null && (n = n.dehydrated, n === null || du(n) || fu(n))) return t;
				} else if (t.tag === 19 && (t.memoizedProps.revealOrder === "forwards" || t.memoizedProps.revealOrder === "backwards" || t.memoizedProps.revealOrder === "unstable_legacy-backwards" || t.memoizedProps.revealOrder === "together")) {
					if (t.flags & 128) return t;
				} else if (t.child !== null) {
					t.child.return = t, t = t.child;
					continue;
				}
				if (t === e) break;
				for (; t.sibling === null;) {
					if (t.return === null || t.return === e) return null;
					t = t.return;
				}
				t.sibling.return = t.return, t = t.sibling;
			}
			return null;
		}
		function R() {
			var e = Q;
			Ch === null ? Ch = [e] : Ch.push(e);
		}
		function z() {
			var e = Q;
			if (Ch !== null && (wh++, Ch[wh] !== e)) {
				var t = w(Z);
				if (!ch.has(t) && (ch.add(t), Ch !== null)) {
					for (var n = "", r = 0; r <= wh; r++) {
						var i = Ch[r], a = r === wh ? e : i;
						for (i = r + 1 + ". " + i; 30 > i.length;) i += " ";
						i += a + "\n", n += i;
					}
					console.error("React has detected a change in the order of Hooks called by %s. This will lead to bugs and errors if not fixed. For more information, read the Rules of Hooks: https://react.dev/link/rules-of-hooks\n\n   Previous render            Next render\n   ------------------------------------------------------\n%s   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^\n", t, n);
				}
			}
		}
		function vr(e) {
			e == null || Gc(e) || console.error("%s received a final argument that is not an array (instead, received `%s`). When specified, the final argument must be an array.", Q, typeof e);
		}
		function yr() {
			var e = w(Z);
			dh.has(e) || (dh.add(e), console.error("ReactDOM.useFormState has been renamed to React.useActionState. Please update %s to use React.useActionState.", e));
		}
		function br() {
			throw Error("Invalid hook call. Hooks can only be called inside of the body of a function component. This could happen for one of the following reasons:\n1. You might have mismatching versions of React and the renderer (such as React DOM)\n2. You might be breaking the Rules of Hooks\n3. You might have more than one copy of React in the same app\nSee https://react.dev/link/invalid-hook-call for tips about how to debug and fix this problem.");
		}
		function xr(e, t) {
			if (Th) return !1;
			if (t === null) return console.error("%s received a final argument during this render, but not during the previous render. Even though the final argument is optional, its type cannot change between renders.", Q), !1;
			e.length !== t.length && console.error("The final argument passed to %s changed size between renders. The order and size of this array must remain constant.\n\nPrevious: %s\nIncoming: %s", Q, "[" + t.join(", ") + "]", "[" + e.join(", ") + "]");
			for (var n = 0; n < t.length && n < e.length; n++) if (!Gd(e[n], t[n])) return !1;
			return !0;
		}
		function Sr(e, t, n, r, i, a) {
			fh = a, Z = t, Ch = e === null ? null : e._debugHookTypes, wh = -1, Th = e !== null && e.type !== t.type, (Object.prototype.toString.call(n) === "[object AsyncFunction]" || Object.prototype.toString.call(n) === "[object AsyncGeneratorFunction]") && (a = w(Z), uh.has(a) || (uh.add(a), console.error("%s is an async Client Component. Only Server Components can be async at the moment. This error is often caused by accidentally adding `'use client'` to a module that was originally written for the server.", a === null ? "An unknown Component" : "<" + a + ">"))), t.memoizedState = null, t.updateQueue = null, t.lanes = 0, G.H = e !== null && e.memoizedState !== null ? kh : Ch === null ? Dh : Oh, _h = a = (t.mode & 8) !== q;
			var o = im(n, r, i);
			if (_h = !1, gh && (o = wr(t, n, r, i)), a) {
				j(!0);
				try {
					o = wr(t, n, r, i);
				} finally {
					j(!1);
				}
			}
			return Cr(e, t), o;
		}
		function Cr(e, t) {
			t._debugHookTypes = Ch, t.dependencies === null ? bh !== null && (t.dependencies = {
				lanes: 0,
				firstContext: null,
				_debugThenableState: bh
			}) : t.dependencies._debugThenableState = bh, G.H = Eh;
			var n = ph !== null && ph.next !== null;
			if (fh = 0, Ch = Q = mh = ph = Z = null, wh = -1, e !== null && (e.flags & 65011712) != (t.flags & 65011712) && console.error("Internal React error: Expected static flag was missing. Please notify the React team."), hh = !1, yh = 0, bh = null, n) throw Error("Rendered fewer hooks than expected. This may be caused by an accidental early return statement.");
			e === null || Yh || (e = e.dependencies, e !== null && It(e) && (Yh = !0)), Em ? (Em = !1, e = !0) : e = !1, e && (t = w(t) || "Unknown", lh.has(t) || uh.has(t) || (lh.add(t), console.error("`use` was called from inside a try/catch block. This is not allowed and can lead to unexpected behavior. To handle errors triggered by `use`, wrap your component in a error boundary.")));
		}
		function wr(e, t, n, r) {
			Z = e;
			var i = 0;
			do {
				if (gh && (bh = null), yh = 0, gh = !1, i >= Sh) throw Error("Too many re-renders. React limits the number of renders to prevent an infinite loop.");
				if (i += 1, Th = !1, mh = ph = null, e.updateQueue != null) {
					var a = e.updateQueue;
					a.lastEffect = null, a.events = null, a.stores = null, a.memoCache != null && (a.memoCache.index = 0);
				}
				wh = -1, G.H = Ah, a = im(t, n, r);
			} while (gh);
			return a;
		}
		function Tr() {
			var e = G.H, t = e.useState()[0];
			return t = typeof t.then == "function" ? Mr(t) : t, e = e.useState()[0], (ph === null ? null : ph.memoizedState) !== e && (Z.flags |= 1024), t;
		}
		function Er() {
			var e = vh !== 0;
			return vh = 0, e;
		}
		function Dr(e, t, n) {
			t.updateQueue = e.updateQueue, t.flags = (t.mode & 16) === q ? t.flags & -2053 : t.flags & -402655237, e.lanes &= ~n;
		}
		function Or(e) {
			if (hh) {
				for (e = e.memoizedState; e !== null;) {
					var t = e.queue;
					t !== null && (t.pending = null), e = e.next;
				}
				hh = !1;
			}
			fh = 0, Ch = mh = ph = Z = null, wh = -1, Q = null, gh = !1, yh = vh = 0, bh = null;
		}
		function kr() {
			var e = {
				memoizedState: null,
				baseState: null,
				baseQueue: null,
				queue: null,
				next: null
			};
			return mh === null ? Z.memoizedState = mh = e : mh = mh.next = e, mh;
		}
		function Ar() {
			if (ph === null) {
				var e = Z.alternate;
				e = e === null ? null : e.memoizedState;
			} else e = ph.next;
			var t = mh === null ? Z.memoizedState : mh.next;
			if (t !== null) mh = t, ph = e;
			else {
				if (e === null) throw Z.alternate === null ? Error("Update hook called on initial render. This is likely a bug in React. Please file an issue.") : Error("Rendered more hooks than during the previous render.");
				ph = e, e = {
					memoizedState: ph.memoizedState,
					baseState: ph.baseState,
					baseQueue: ph.baseQueue,
					queue: ph.queue,
					next: null
				}, mh === null ? Z.memoizedState = mh = e : mh = mh.next = e;
			}
			return mh;
		}
		function jr() {
			return {
				lastEffect: null,
				events: null,
				stores: null,
				memoCache: null
			};
		}
		function Mr(e) {
			var t = yh;
			return yh += 1, bh === null && (bh = On()), e = An(bh, e, t), t = Z, (mh === null ? t.memoizedState : mh.next) === null && (t = t.alternate, G.H = t !== null && t.memoizedState !== null ? kh : Dh), e;
		}
		function B(e) {
			if (typeof e == "object" && e) {
				if (typeof e.then == "function") return Mr(e);
				if (e.$$typeof === Fc) return Rt(e);
			}
			throw Error("An unsupported type was passed to use(): " + String(e));
		}
		function Nr(e) {
			var t = null, n = Z.updateQueue;
			if (n !== null && (t = n.memoCache), t == null) {
				var r = Z.alternate;
				r !== null && (r = r.updateQueue, r !== null && (r = r.memoCache, r != null && (t = {
					data: r.data.map(function(e) {
						return e.slice();
					}),
					index: 0
				})));
			}
			if (t ??= {
				data: [],
				index: 0
			}, n === null && (n = jr(), Z.updateQueue = n), n.memoCache = t, n = t.data[t.index], n === void 0 || Th) for (n = t.data[t.index] = Array(e), r = 0; r < e; r++) n[r] = Hc;
			else n.length !== e && console.error("Expected a constant size argument for each invocation of useMemoCache. The previous cache was allocated with size %s but size %s was requested.", n.length, e);
			return t.index++, n;
		}
		function Pr(e, t) {
			return typeof t == "function" ? t(e) : t;
		}
		function Fr(e, t, n) {
			var r = kr();
			if (n !== void 0) {
				var i = n(t);
				if (_h) {
					j(!0);
					try {
						n(t);
					} finally {
						j(!1);
					}
				}
			} else i = t;
			return r.memoizedState = r.baseState = i, e = {
				pending: null,
				lanes: 0,
				dispatch: null,
				lastRenderedReducer: e,
				lastRenderedState: i
			}, r.queue = e, e = e.dispatch = zi.bind(null, Z, e), [r.memoizedState, e];
		}
		function Ir(e) {
			return Lr(Ar(), ph, e);
		}
		function Lr(e, t, n) {
			var r = e.queue;
			if (r === null) throw Error("Should have a queue. You are likely calling Hooks conditionally, which is not allowed. (https://react.dev/link/invalid-hook-call)");
			r.lastRenderedReducer = n;
			var i = e.baseQueue, a = r.pending;
			if (a !== null) {
				if (i !== null) {
					var o = i.next;
					i.next = a.next, a.next = o;
				}
				t.baseQueue !== i && console.error("Internal error: Expected work-in-progress queue to be a clone. This is a bug in React."), t.baseQueue = i = a, r.pending = null;
			}
			if (a = e.baseState, i === null) e.memoizedState = a;
			else {
				t = i.next;
				var s = o = null, c = null, l = t, u = !1;
				do {
					var d = l.lane & -536870913;
					if (d === l.lane ? (fh & d) === d : ($ & d) === d) {
						var f = l.revertLane;
						if (f === 0) c !== null && (c = c.next = {
							lane: 0,
							revertLane: 0,
							gesture: null,
							action: l.action,
							hasEagerState: l.hasEagerState,
							eagerState: l.eagerState,
							next: null
						}), d === Up && (u = !0);
						else if ((fh & f) === f) {
							l = l.next, f === Up && (u = !0);
							continue;
						} else d = {
							lane: 0,
							revertLane: l.revertLane,
							gesture: null,
							action: l.action,
							hasEagerState: l.hasEagerState,
							eagerState: l.eagerState,
							next: null
						}, c === null ? (s = c = d, o = a) : c = c.next = d, Z.lanes |= f, r_ |= f;
						d = l.action, _h && n(a, d), a = l.hasEagerState ? l.eagerState : n(a, d);
					} else f = {
						lane: d,
						revertLane: l.revertLane,
						gesture: l.gesture,
						action: l.action,
						hasEagerState: l.hasEagerState,
						eagerState: l.eagerState,
						next: null
					}, c === null ? (s = c = f, o = a) : c = c.next = f, Z.lanes |= d, r_ |= d;
					l = l.next;
				} while (l !== null && l !== t);
				if (c === null ? o = a : c.next = s, !Gd(a, e.memoizedState) && (Yh = !0, u && (n = Wp, n !== null))) throw n;
				e.memoizedState = a, e.baseState = o, e.baseQueue = c, r.lastRenderedState = a;
			}
			return i === null && (r.lanes = 0), [e.memoizedState, r.dispatch];
		}
		function Rr(e) {
			var t = Ar(), n = t.queue;
			if (n === null) throw Error("Should have a queue. You are likely calling Hooks conditionally, which is not allowed. (https://react.dev/link/invalid-hook-call)");
			n.lastRenderedReducer = e;
			var r = n.dispatch, i = n.pending, a = t.memoizedState;
			if (i !== null) {
				n.pending = null;
				var o = i = i.next;
				do
					a = e(a, o.action), o = o.next;
				while (o !== i);
				Gd(a, t.memoizedState) || (Yh = !0), t.memoizedState = a, t.baseQueue === null && (t.baseState = a), n.lastRenderedState = a;
			}
			return [a, r];
		}
		function zr(e, t, n) {
			var r = Z, i = kr();
			if (Nf) {
				if (n === void 0) throw Error("Missing getServerSnapshot, which is required for server-rendered content. Will revert to client rendering.");
				var a = n();
				sh || a === n() || (console.error("The result of getServerSnapshot should be cached to avoid an infinite loop"), sh = !0);
			} else {
				if (a = t(), sh || (n = t(), Gd(a, n) || (console.error("The result of getSnapshot should be cached to avoid an infinite loop"), sh = !0)), Rg === null) throw Error("Expected a work-in-progress root. This is a bug in React. Please file an issue.");
				$ & 127 || Vr(r, t, a);
			}
			return i.memoizedState = a, n = {
				value: a,
				getSnapshot: t
			}, i.queue = n, pi(Ur.bind(null, r, n, e), [e]), r.flags |= 2048, ui(rh | oh, { destroy: void 0 }, Hr.bind(null, r, n, a, t), null), a;
		}
		function Br(e, t, n) {
			var r = Z, i = Ar(), a = Nf;
			if (a) {
				if (n === void 0) throw Error("Missing getServerSnapshot, which is required for server-rendered content. Will revert to client rendering.");
				n = n();
			} else if (n = t(), !sh) {
				var o = t();
				Gd(n, o) || (console.error("The result of getSnapshot should be cached to avoid an infinite loop"), sh = !0);
			}
			if ((o = !Gd((ph || i).memoizedState, n)) && (i.memoizedState = n, Yh = !0), i = i.queue, V(2048, oh, Ur.bind(null, r, i, e), [e]), i.getSnapshot !== t || o || mh !== null && mh.memoizedState.tag & rh) {
				if (r.flags |= 2048, ui(rh | oh, { destroy: void 0 }, Hr.bind(null, r, i, n, t), null), Rg === null) throw Error("Expected a work-in-progress root. This is a bug in React. Please file an issue.");
				a || fh & 127 || Vr(r, t, n);
			}
			return n;
		}
		function Vr(e, t, n) {
			e.flags |= 16384, e = {
				getSnapshot: t,
				value: n
			}, t = Z.updateQueue, t === null ? (t = jr(), Z.updateQueue = t, t.stores = [e]) : (n = t.stores, n === null ? t.stores = [e] : n.push(e));
		}
		function Hr(e, t, n, r) {
			t.value = n, t.getSnapshot = r, Wr(t) && Gr(e);
		}
		function Ur(e, t, n) {
			return n(function() {
				Wr(t) && (Wt(2, "updateSyncExternalStore()", e), Gr(e));
			});
		}
		function Wr(e) {
			var t = e.getSnapshot;
			e = e.value;
			try {
				var n = t();
				return !Gd(e, n);
			} catch {
				return !0;
			}
		}
		function Gr(e) {
			var t = Yn(e, 2);
			t !== null && ss(t, e, 2);
		}
		function Kr(e) {
			var t = kr();
			if (typeof e == "function") {
				var n = e;
				if (e = n(), _h) {
					j(!0);
					try {
						n();
					} finally {
						j(!1);
					}
				}
			}
			return t.memoizedState = t.baseState = e, t.queue = {
				pending: null,
				lanes: 0,
				dispatch: null,
				lastRenderedReducer: Pr,
				lastRenderedState: e
			}, t;
		}
		function qr(e) {
			e = Kr(e);
			var t = e.queue, n = Bi.bind(null, Z, t);
			return t.dispatch = n, [e.memoizedState, n];
		}
		function Jr(e) {
			var t = kr();
			t.memoizedState = t.baseState = e;
			var n = {
				pending: null,
				lanes: 0,
				dispatch: null,
				lastRenderedReducer: null,
				lastRenderedState: null
			};
			return t.queue = n, t = Hi.bind(null, Z, !0, n), n.dispatch = t, [e, t];
		}
		function Yr(e, t) {
			return Xr(Ar(), ph, e, t);
		}
		function Xr(e, t, n, r) {
			return e.baseState = n, Lr(e, ph, typeof r == "function" ? r : Pr);
		}
		function Zr(e, t) {
			var n = Ar();
			return ph === null ? (n.baseState = e, [e, n.queue.dispatch]) : Xr(n, ph, e, t);
		}
		function Qr(e, t, n, r, i) {
			if (Ui(e)) throw Error("Cannot update form state while rendering.");
			if (e = t.action, e !== null) {
				var a = {
					payload: i,
					action: e,
					next: null,
					isTransition: !0,
					status: "pending",
					value: null,
					reason: null,
					listeners: [],
					then: function(e) {
						a.listeners.push(e);
					}
				};
				G.T === null ? a.isTransition = !1 : n(!0), r(a), n = t.pending, n === null ? (a.next = t.pending = a, $r(t, a)) : (a.next = n.next, t.pending = n.next = a);
			}
		}
		function $r(e, t) {
			var n = t.action, r = t.payload, i = e.state;
			if (t.isTransition) {
				var a = G.T, o = {};
				o._updatedFibers = /* @__PURE__ */ new Set(), G.T = o;
				try {
					var s = n(i, r), c = G.S;
					c !== null && c(o, s), ei(e, t, s);
				} catch (n) {
					ni(e, t, n);
				} finally {
					a !== null && o.types !== null && (a.types !== null && a.types !== o.types && console.error("We expected inner Transitions to have transferred the outer types set and that you cannot add to the outer Transition while inside the inner.This is a bug in React."), a.types = o.types), G.T = a, a === null && o._updatedFibers && (e = o._updatedFibers.size, o._updatedFibers.clear(), 10 < e && console.warn("Detected a large number of updates inside startTransition. If this is due to a subscription please re-write it to use React provided hooks. Otherwise concurrent mode guarantees are off the table."));
				}
			} else try {
				o = n(i, r), ei(e, t, o);
			} catch (n) {
				ni(e, t, n);
			}
		}
		function ei(e, t, n) {
			typeof n == "object" && n && typeof n.then == "function" ? (G.asyncTransitions++, n.then(Ai, Ai), n.then(function(n) {
				ti(e, t, n);
			}, function(n) {
				return ni(e, t, n);
			}), t.isTransition || console.error("An async function with useActionState was called outside of a transition. This is likely not what you intended (for example, isPending will not update correctly). Either call the returned function inside startTransition, or pass it to an `action` or `formAction` prop.")) : ti(e, t, n);
		}
		function ti(e, t, n) {
			t.status = "fulfilled", t.value = n, ri(t), e.state = n, t = e.pending, t !== null && (n = t.next, n === t ? e.pending = null : (n = n.next, t.next = n, $r(e, n)));
		}
		function ni(e, t, n) {
			var r = e.pending;
			if (e.pending = null, r !== null) {
				r = r.next;
				do
					t.status = "rejected", t.reason = n, ri(t), t = t.next;
				while (t !== r);
			}
			e.action = null;
		}
		function ri(e) {
			e = e.listeners;
			for (var t = 0; t < e.length; t++) (0, e[t])();
		}
		function ii(e, t) {
			return t;
		}
		function ai(e, t) {
			if (Nf) {
				var n = Rg.formState;
				if (n !== null) {
					a: {
						var r = Z;
						if (Nf) {
							if (Mf) {
								var i = hu(Mf, Lf);
								if (i) {
									Mf = _u(i), r = gu(i);
									break a;
								}
							}
							St(r);
						}
						r = !1;
					}
					r && (t = n[0]);
				}
			}
			n = kr(), n.memoizedState = n.baseState = t, r = {
				pending: null,
				lanes: 0,
				dispatch: null,
				lastRenderedReducer: ii,
				lastRenderedState: t
			}, n.queue = r, n = Bi.bind(null, Z, r), r.dispatch = n, r = Kr(!1);
			var a = Hi.bind(null, Z, !1, r.queue);
			return r = kr(), i = {
				state: t,
				dispatch: null,
				action: e,
				pending: null
			}, r.queue = i, n = Qr.bind(null, Z, i, a, n), i.dispatch = n, r.memoizedState = e, [
				t,
				n,
				!1
			];
		}
		function oi(e) {
			return si(Ar(), ph, e);
		}
		function si(e, t, n) {
			if (t = Lr(e, t, ii)[0], e = Ir(Pr)[0], typeof t == "object" && t && typeof t.then == "function") try {
				var r = Mr(t);
			} catch (e) {
				throw e === xm ? Cm : e;
			}
			else r = t;
			t = Ar();
			var i = t.queue, a = i.dispatch;
			return n !== t.memoizedState && (Z.flags |= 2048, ui(rh | oh, { destroy: void 0 }, ci.bind(null, i, n), null)), [
				r,
				a,
				e
			];
		}
		function ci(e, t) {
			e.action = t;
		}
		function li(e) {
			var t = Ar(), n = ph;
			if (n !== null) return si(t, n, e);
			Ar(), t = t.memoizedState, n = Ar();
			var r = n.queue.dispatch;
			return n.memoizedState = e, [
				t,
				r,
				!1
			];
		}
		function ui(e, t, n, r) {
			return e = {
				tag: e,
				create: n,
				deps: r,
				inst: t,
				next: null
			}, t = Z.updateQueue, t === null && (t = jr(), Z.updateQueue = t), n = t.lastEffect, n === null ? t.lastEffect = e.next = e : (r = n.next, n.next = e, e.next = r, t.lastEffect = e), e;
		}
		function di(e) {
			var t = kr();
			return e = { current: e }, t.memoizedState = e;
		}
		function fi(e, t, n, r) {
			var i = kr();
			Z.flags |= e, i.memoizedState = ui(rh | t, { destroy: void 0 }, n, r === void 0 ? null : r);
		}
		function V(e, t, n, r) {
			var i = Ar();
			r = r === void 0 ? null : r;
			var a = i.memoizedState.inst;
			ph !== null && r !== null && xr(r, ph.memoizedState.deps) ? i.memoizedState = ui(t, a, n, r) : (Z.flags |= e, i.memoizedState = ui(rh | t, a, n, r));
		}
		function pi(e, t) {
			(Z.mode & 16) === q ? fi(8390656, oh, e, t) : fi(276826112, oh, e, t);
		}
		function mi(e) {
			Z.flags |= 4;
			var t = Z.updateQueue;
			if (t === null) t = jr(), Z.updateQueue = t, t.events = [e];
			else {
				var n = t.events;
				n === null ? t.events = [e] : n.push(e);
			}
		}
		function hi(e) {
			var t = kr(), n = { impl: e };
			return t.memoizedState = n, function() {
				if ((Lg & Og) !== Dg) throw Error("A function wrapped in useEffectEvent can't be called during rendering.");
				return n.impl.apply(void 0, arguments);
			};
		}
		function gi(e) {
			var t = Ar().memoizedState;
			return mi({
				ref: t,
				nextImpl: e
			}), function() {
				if ((Lg & Og) !== Dg) throw Error("A function wrapped in useEffectEvent can't be called during rendering.");
				return t.impl.apply(void 0, arguments);
			};
		}
		function _i(e, t) {
			var n = 4194308;
			return (Z.mode & 16) !== q && (n |= 134217728), fi(n, ah, e, t);
		}
		function vi(e, t) {
			if (typeof t == "function") {
				e = e();
				var n = t(e);
				return function() {
					typeof n == "function" ? n() : t(null);
				};
			}
			if (t != null) return t.hasOwnProperty("current") || console.error("Expected useImperativeHandle() first argument to either be a ref callback or React.createRef() object. Instead received: %s.", "an object with keys {" + Object.keys(t).join(", ") + "}"), e = e(), t.current = e, function() {
				t.current = null;
			};
		}
		function yi(e, t, n) {
			typeof t != "function" && console.error("Expected useImperativeHandle() second argument to be a function that creates a handle. Instead received: %s.", t === null ? "null" : typeof t), n = n == null ? null : n.concat([e]);
			var r = 4194308;
			(Z.mode & 16) !== q && (r |= 134217728), fi(r, ah, vi.bind(null, t, e), n);
		}
		function bi(e, t, n) {
			typeof t != "function" && console.error("Expected useImperativeHandle() second argument to be a function that creates a handle. Instead received: %s.", t === null ? "null" : typeof t), n = n == null ? null : n.concat([e]), V(4, ah, vi.bind(null, t, e), n);
		}
		function xi(e, t) {
			return kr().memoizedState = [e, t === void 0 ? null : t], e;
		}
		function Si(e, t) {
			var n = Ar();
			t = t === void 0 ? null : t;
			var r = n.memoizedState;
			return t !== null && xr(t, r[1]) ? r[0] : (n.memoizedState = [e, t], e);
		}
		function Ci(e, t) {
			var n = kr();
			t = t === void 0 ? null : t;
			var r = e();
			if (_h) {
				j(!0);
				try {
					e();
				} finally {
					j(!1);
				}
			}
			return n.memoizedState = [r, t], r;
		}
		function wi(e, t) {
			var n = Ar();
			t = t === void 0 ? null : t;
			var r = n.memoizedState;
			if (t !== null && xr(t, r[1])) return r[0];
			if (r = e(), _h) {
				j(!0);
				try {
					e();
				} finally {
					j(!1);
				}
			}
			return n.memoizedState = [r, t], r;
		}
		function Ti(e, t) {
			return Oi(kr(), e, t);
		}
		function Ei(e, t) {
			return ki(Ar(), ph.memoizedState, e, t);
		}
		function Di(e, t) {
			var n = Ar();
			return ph === null ? Oi(n, e, t) : ki(n, ph.memoizedState, e, t);
		}
		function Oi(e, t, n) {
			return n === void 0 || fh & 1073741824 && !($ & 261930) ? e.memoizedState = t : (e.memoizedState = n, e = os(), Z.lanes |= e, r_ |= e, n);
		}
		function ki(e, t, n, r) {
			return Gd(n, t) ? n : Ym.current === null ? !(fh & 42) || fh & 1073741824 && !($ & 261930) ? (Yh = !0, e.memoizedState = n) : (e = os(), Z.lanes |= e, r_ |= e, t) : (e = Oi(e, n, r), Gd(e, t) || (Yh = !0), e);
		}
		function Ai() {
			G.asyncTransitions--;
		}
		function H(e, t, n, r, i) {
			var a = hl();
			ml(a !== 0 && 8 > a ? a : 8);
			var o = G.T, s = {};
			s._updatedFibers = /* @__PURE__ */ new Set(), G.T = s, Hi(e, !1, t, n);
			try {
				var c = i(), l = G.S;
				if (l !== null && l(s, c), typeof c == "object" && c && typeof c.then == "function") {
					G.asyncTransitions++, c.then(Ai, Ai);
					var u = Cn(c, r);
					Vi(e, t, u, as(e));
				} else Vi(e, t, r, as(e));
			} catch (n) {
				Vi(e, t, {
					then: function() {},
					status: "rejected",
					reason: n
				}, as(e));
			} finally {
				ml(a), o !== null && s.types !== null && (o.types !== null && o.types !== s.types && console.error("We expected inner Transitions to have transferred the outer types set and that you cannot add to the outer Transition while inside the inner.This is a bug in React."), o.types = s.types), G.T = o, o === null && s._updatedFibers && (e = s._updatedFibers.size, s._updatedFibers.clear(), 10 < e && console.warn("Detected a large number of updates inside startTransition. If this is due to a subscription please re-write it to use React provided hooks. Otherwise concurrent mode guarantees are off the table."));
			}
		}
		function ji(e) {
			var t = e.memoizedState;
			if (t !== null) return t;
			t = {
				memoizedState: Al,
				baseState: Al,
				baseQueue: null,
				queue: {
					pending: null,
					lanes: 0,
					dispatch: null,
					lastRenderedReducer: Pr,
					lastRenderedState: Al
				},
				next: null
			};
			var n = {};
			return t.next = {
				memoizedState: n,
				baseState: n,
				baseQueue: null,
				queue: {
					pending: null,
					lanes: 0,
					dispatch: null,
					lastRenderedReducer: Pr,
					lastRenderedState: n
				},
				next: null
			}, e.memoizedState = t, e = e.alternate, e !== null && (e.memoizedState = t), t;
		}
		function Mi() {
			var e = Kr(!1);
			return e = H.bind(null, Z, e.queue, !0, !1), kr().memoizedState = e, [!1, e];
		}
		function Ni() {
			var e = Ir(Pr)[0], t = Ar().memoizedState;
			return [typeof e == "boolean" ? e : Mr(e), t];
		}
		function Pi() {
			var e = Rr(Pr)[0], t = Ar().memoizedState;
			return [typeof e == "boolean" ? e : Mr(e), t];
		}
		function Fi() {
			return Rt(jl);
		}
		function Ii() {
			var e = kr(), t = Rg.identifierPrefix;
			if (Nf) {
				var n = Cf, r = Sf;
				n = (r & ~(1 << 32 - bd(r) - 1)).toString(32) + n, t = "_" + t + "R_" + n, n = vh++, 0 < n && (t += "H" + n.toString(32)), t += "_";
			} else n = xh++, t = "_" + t + "r_" + n.toString(32) + "_";
			return e.memoizedState = t;
		}
		function Li() {
			return kr().memoizedState = Ri.bind(null, Z);
		}
		function Ri(e, t) {
			for (var n = e.return; n !== null;) {
				switch (n.tag) {
					case 24:
					case 3:
						var r = as(n), i = er(r), a = tr(n, i, r);
						a !== null && (Wt(r, "refresh()", e), ss(a, n, r), nr(a, n, r)), e = Vt(), t != null && a !== null && console.error("The seed argument is not enabled outside experimental channels."), i.payload = { cache: e };
						return;
				}
				n = n.return;
			}
		}
		function zi(e, t, n) {
			var r = arguments;
			typeof r[3] == "function" && console.error("State updates from the useState() and useReducer() Hooks don't support the second callback argument. To execute a side effect after rendering, declare it in the component body with useEffect()."), r = as(e);
			var i = {
				lane: r,
				revertLane: 0,
				gesture: null,
				action: n,
				hasEagerState: !1,
				eagerState: null,
				next: null
			};
			Ui(e) ? Wi(t, i) : (i = Jn(e, t, i, r), i !== null && (Wt(r, "dispatch()", e), ss(i, e, r), Gi(i, t, r)));
		}
		function Bi(e, t, n) {
			var r = arguments;
			typeof r[3] == "function" && console.error("State updates from the useState() and useReducer() Hooks don't support the second callback argument. To execute a side effect after rendering, declare it in the component body with useEffect()."), r = as(e), Vi(e, t, n, r) && Wt(r, "setState()", e);
		}
		function Vi(e, t, n, r) {
			var i = {
				lane: r,
				revertLane: 0,
				gesture: null,
				action: n,
				hasEagerState: !1,
				eagerState: null,
				next: null
			};
			if (Ui(e)) Wi(t, i);
			else {
				var a = e.alternate;
				if (e.lanes === 0 && (a === null || a.lanes === 0) && (a = t.lastRenderedReducer, a !== null)) {
					var o = G.H;
					G.H = Mh;
					try {
						var s = t.lastRenderedState, c = a(s, n);
						if (i.hasEagerState = !0, i.eagerState = c, Gd(c, s)) return qn(e, t, i, 0), Rg === null && Kn(), !1;
					} catch {} finally {
						G.H = o;
					}
				}
				if (n = Jn(e, t, i, r), n !== null) return ss(n, e, r), Gi(n, t, r), !0;
			}
			return !1;
		}
		function Hi(e, t, n, r) {
			if (G.T === null && Up === 0 && console.error("An optimistic state update occurred outside a transition or action. To fix, move the update to an action, or wrap with startTransition."), r = {
				lane: 2,
				revertLane: bn(),
				gesture: null,
				action: r,
				hasEagerState: !1,
				eagerState: null,
				next: null
			}, Ui(e)) {
				if (t) throw Error("Cannot update optimistic state while rendering.");
				console.error("Cannot call startTransition while rendering.");
			} else t = Jn(e, n, r, 2), t !== null && (Wt(2, "setOptimistic()", e), ss(t, e, 2));
		}
		function Ui(e) {
			var t = e.alternate;
			return e === Z || t !== null && t === Z;
		}
		function Wi(e, t) {
			gh = hh = !0;
			var n = e.pending;
			n === null ? t.next = t : (t.next = n.next, n.next = t), e.pending = t;
		}
		function Gi(e, t, n) {
			if (n & 4194048) {
				var r = t.lanes;
				r &= e.pendingLanes, n |= r, t.lanes = n, ue(e, n);
			}
		}
		function Ki(e) {
			if (e !== null && typeof e != "function") {
				var t = String(e);
				Wh.has(t) || (Wh.add(t), console.error("Expected the last optional `callback` argument to be a function. Instead received: %s.", e));
			}
		}
		function qi(e, t, n, r) {
			var i = e.memoizedState, a = n(r, i);
			if (e.mode & 8) {
				j(!0);
				try {
					a = n(r, i);
				} finally {
					j(!1);
				}
			}
			a === void 0 && (t = C(t) || "Component", Bh.has(t) || (Bh.add(t), console.error("%s.getDerivedStateFromProps(): A valid state object (or null) must be returned. You have returned undefined.", t))), i = a == null ? i : Dc({}, i, a), e.memoizedState = i, e.lanes === 0 && (e.updateQueue.baseState = i);
		}
		function Ji(e, t, n, r, i, a, o) {
			var s = e.stateNode;
			if (typeof s.shouldComponentUpdate == "function") {
				if (n = s.shouldComponentUpdate(r, a, o), e.mode & 8) {
					j(!0);
					try {
						n = s.shouldComponentUpdate(r, a, o);
					} finally {
						j(!1);
					}
				}
				return n === void 0 && console.error("%s.shouldComponentUpdate(): Returned undefined instead of a boolean value. Make sure to return true or false.", C(t) || "Component"), n;
			}
			return t.prototype && t.prototype.isPureReactComponent ? !Dn(n, r) || !Dn(i, a) : !0;
		}
		function Yi(e, t, n, r) {
			var i = t.state;
			typeof t.componentWillReceiveProps == "function" && t.componentWillReceiveProps(n, r), typeof t.UNSAFE_componentWillReceiveProps == "function" && t.UNSAFE_componentWillReceiveProps(n, r), t.state !== i && (e = w(e) || "Component", Fh.has(e) || (Fh.add(e), console.error("%s.componentWillReceiveProps(): Assigning directly to this.state is deprecated (except inside a component's constructor). Use setState instead.", e)), Gh.enqueueReplaceState(t, t.state, null));
		}
		function Xi(e, t) {
			var n = t;
			if ("ref" in t) for (var r in n = {}, t) r !== "ref" && (n[r] = t[r]);
			if (e = e.defaultProps) for (var i in n === t && (n = Dc({}, n)), e) n[i] === void 0 && (n[i] = e[i]);
			return n;
		}
		function Zi(e, t) {
			try {
				Kh = t.source ? w(t.source) : null, qh = null;
				var n = t.value;
				if (G.actQueue !== null) G.thrownErrors.push(n);
				else {
					var r = e.onUncaughtError;
					r(n, { componentStack: t.stack });
				}
			} catch (e) {
				setTimeout(function() {
					throw e;
				});
			}
		}
		function Qi(e, t, n) {
			try {
				Kh = n.source ? w(n.source) : null, qh = w(t);
				var r = e.onCaughtError;
				r(n.value, {
					componentStack: n.stack,
					errorBoundary: t.tag === 1 ? t.stateNode : null
				});
			} catch (e) {
				setTimeout(function() {
					throw e;
				});
			}
		}
		function $i(e, t, n) {
			return n = er(n), n.tag = Wm, n.payload = { element: null }, n.callback = function() {
				F(t.source, Zi, e, t);
			}, n;
		}
		function ea(e) {
			return e = er(e), e.tag = Wm, e;
		}
		function ta(e, t, n, r) {
			var i = n.type.getDerivedStateFromError;
			if (typeof i == "function") {
				var a = r.value;
				e.payload = function() {
					return i(a);
				}, e.callback = function() {
					rc(n), F(r.source, Qi, t, n, r);
				};
			}
			var o = n.stateNode;
			o !== null && typeof o.componentDidCatch == "function" && (e.callback = function() {
				rc(n), F(r.source, Qi, t, n, r), typeof i != "function" && (v_ === null ? v_ = new Set([this]) : v_.add(this)), fm(this, r), typeof i == "function" || !(n.lanes & 2) && console.error("%s: Error boundaries should implement getDerivedStateFromError(). In that method, return a state update to display an error message or fallback UI.", w(n) || "Unknown");
			});
		}
		function na(e, t, n, r, i) {
			if (n.flags |= 32768, Bd && Zs(e, i), typeof r == "object" && r && typeof r.then == "function") {
				if (t = n.alternate, t !== null && Ft(t, n, i, !0), Nf && (Pf = !0), n = Zm.current, n !== null) {
					switch (n.tag) {
						case 31:
						case 13: return Qm === null ? xs() : n.alternate === null && n_ === Ag && (n_ = Ng), n.flags &= -257, n.flags |= 65536, n.lanes = i, r === wm ? n.flags |= 16384 : (t = n.updateQueue, t === null ? n.updateQueue = new Set([r]) : t.add(r), Hs(e, r, i)), !1;
						case 22: return n.flags |= 65536, r === wm ? n.flags |= 16384 : (t = n.updateQueue, t === null ? (t = {
							transitions: null,
							markerInstances: null,
							retryQueue: new Set([r])
						}, n.updateQueue = t) : (n = t.retryQueue, n === null ? t.retryQueue = new Set([r]) : n.add(r)), Hs(e, r, i)), !1;
					}
					throw Error("Unexpected Suspense handler tag (" + n.tag + "). This is a bug in React.");
				}
				return Hs(e, r, i), xs(), !1;
			}
			if (Nf) return Pf = !0, t = Zm.current, t === null ? (r !== Rf && kt(Ue(Error("There was an error while hydrating but React was able to recover by instead client rendering the entire root.", { cause: r }), n)), e = e.current.alternate, e.flags |= 65536, i &= -i, e.lanes |= i, r = Ue(r, n), i = $i(e.stateNode, r, i), rr(e, i), n_ !== Pg && (n_ = Mg)) : (!(t.flags & 65536) && (t.flags |= 256), t.flags |= 65536, t.lanes = i, r !== Rf && kt(Ue(Error("There was an error while hydrating but React was able to recover by instead client rendering from the nearest Suspense boundary.", { cause: r }), n))), !1;
			var a = Ue(Error("There was an error during concurrent rendering but React was able to recover by instead synchronously rendering the entire root.", { cause: r }), n);
			if (c_ === null ? c_ = [a] : c_.push(a), n_ !== Pg && (n_ = Mg), t === null) return !0;
			r = Ue(r, n), n = t;
			do {
				switch (n.tag) {
					case 3: return n.flags |= 65536, e = i & -i, n.lanes |= e, e = $i(n.stateNode, r, e), rr(n, e), !1;
					case 1: if (t = n.type, a = n.stateNode, !(n.flags & 128) && (typeof t.getDerivedStateFromError == "function" || a !== null && typeof a.componentDidCatch == "function" && (v_ === null || !v_.has(a)))) return n.flags |= 65536, i &= -i, n.lanes |= i, i = ea(i), ta(i, e, n, r), rr(n, i), !1;
				}
				n = n.return;
			} while (n !== null);
			return !1;
		}
		function ra(e, t, n, r) {
			t.child = e === null ? Fm(t, null, n, r) : Pm(t, e.child, n, r);
		}
		function ia(e, t, n, r, i) {
			n = n.render;
			var a = t.ref;
			if ("ref" in r) {
				var o = {};
				for (var s in r) s !== "ref" && (o[s] = r[s]);
			} else o = r;
			return Lt(t), r = Sr(e, t, n, o, a, i), s = Er(), e !== null && !Yh ? (Dr(e, t, i), Oa(e, t, i)) : (Nf && s && Ke(t), t.flags |= 1, ra(e, t, r, i), t.child);
		}
		function aa(e, t, n, r, i) {
			if (e === null) {
				var a = n.type;
				return typeof a == "function" && !oc(a) && a.defaultProps === void 0 && n.compare === null ? (n = ec(a), t.tag = 15, t.type = n, va(t, a), oa(e, t, n, r, i)) : (e = lc(n.type, null, r, t, t.mode, i), e.ref = t.ref, e.return = t, t.child = e);
			}
			if (a = e.child, !ka(e, i)) {
				var o = a.memoizedProps;
				if (n = n.compare, n = n === null ? Dn : n, n(o, r) && e.ref === t.ref) return Oa(e, t, i);
			}
			return t.flags |= 1, e = sc(a, r), e.ref = t.ref, e.return = t, t.child = e;
		}
		function oa(e, t, n, r, i) {
			if (e !== null) {
				var a = e.memoizedProps;
				if (Dn(a, r) && e.ref === t.ref && t.type === e.type) if (Yh = !1, t.pendingProps = r = a, ka(e, i)) e.flags & 131072 && (Yh = !0);
				else return t.lanes = e.lanes, Oa(e, t, i);
			}
			return ma(e, t, n, r, i);
		}
		function sa(e, t, n, r) {
			var i = r.children, a = e === null ? null : e.memoizedState;
			if (e === null && t.stateNode === null && (t.stateNode = {
				_visibility: Im,
				_pendingMarkers: null,
				_retryCache: null,
				_transitions: null
			}), r.mode === "hidden") {
				if (t.flags & 128) {
					if (a = a === null ? n : a.baseLanes | n, e !== null) {
						for (r = t.child = e.child, i = 0; r !== null;) i = i | r.lanes | r.childLanes, r = r.sibling;
						r = i & ~a;
					} else r = 0, t.child = null;
					return la(e, t, a, n, r);
				}
				if (n & 536870912) t.memoizedState = {
					baseLanes: 0,
					cachePool: null
				}, e !== null && Tn(t, a === null ? null : a.cachePool), a === null ? ur(t) : lr(t, a), mr(t);
				else return r = t.lanes = 536870912, la(e, t, a === null ? n : a.baseLanes | n, n, r);
			} else a === null ? (e !== null && Tn(t, null), ur(t), hr(t)) : (Tn(t, a.cachePool), lr(t, a), hr(t), t.memoizedState = null);
			return ra(e, t, i, n), t.child;
		}
		function ca(e, t) {
			return e !== null && e.tag === 22 || t.stateNode !== null || (t.stateNode = {
				_visibility: Im,
				_pendingMarkers: null,
				_retryCache: null,
				_transitions: null
			}), t.sibling;
		}
		function la(e, t, n, r, i) {
			var a = wn();
			return a = a === null ? null : {
				parent: cl ? Yf._currentValue : Yf._currentValue2,
				pool: a
			}, t.memoizedState = {
				baseLanes: n,
				cachePool: a
			}, e !== null && Tn(t, null), ur(t), mr(t), e !== null && Ft(e, t, r, !0), t.childLanes = i, null;
		}
		function ua(e, t) {
			var n = t.hidden;
			return n !== void 0 && console.error("<Activity> doesn't accept a hidden prop. Use mode=\"hidden\" instead.\n- <Activity %s>\n+ <Activity %s>", !0 === n ? "hidden" : !1 === n ? "hidden={false}" : "hidden={...}", n ? "mode=\"hidden\"" : "mode=\"visible\""), t = Ca({
				mode: t.mode,
				children: t.children
			}, e.mode), t.ref = e.ref, e.child = t, t.return = e, t;
		}
		function da(e, t, n) {
			return Pm(t, e.child, null, n), e = ua(t, t.pendingProps), e.flags |= 2, gr(t), t.memoizedState = null, e;
		}
		function fa(e, t, n) {
			var r = t.pendingProps, i = (t.flags & 128) != 0;
			if (t.flags &= -129, e === null) {
				if (Nf) {
					if (r.mode === "hidden") return e = ua(t, r), t.lanes = 536870912, ca(null, e);
					if (pr(t), (e = Mf) ? (n = Eu(e, Lf), n !== null && (r = {
						dehydrated: n,
						treeContext: Je(),
						retryLane: 536870912,
						hydrationErrors: null
					}, t.memoizedState = r, r = pc(n), r.return = t, t.child = r, jf = t, Mf = null)) : n = null, n === null) throw xt(t, e), St(t);
					return t.lanes = 536870912, null;
				}
				return ua(t, r);
			}
			var a = e.memoizedState;
			if (a !== null) {
				var o = a.dehydrated;
				if (pr(t), i) if (t.flags & 256) t.flags &= -257, t = da(e, t, n);
				else if (t.memoizedState !== null) t.child = e.child, t.flags |= 128, t = null;
				else throw Error("Client rendering an Activity suspended it again. This is a bug in React.");
				else if (bt(), n & 536870912 && bs(t), Yh || Ft(e, t, n, !1), i = (n & e.childLanes) !== 0, Yh || i) {
					if (r = Rg, r !== null && (o = de(r, n), o !== 0 && o !== a.retryLane)) throw a.retryLane = o, Yn(e, o), ss(r, e, o), Jh;
					xs(), t = da(e, t, n);
				} else e = a.treeContext, dl && (Mf = xu(o), jf = t, Nf = !0, If = null, Pf = !1, Ff = null, Lf = !1, e !== null && Ye(t, e)), t = ua(t, r), t.flags |= 4096;
				return t;
			}
			return a = e.child, r = {
				mode: r.mode,
				children: r.children
			}, n & 536870912 && (n & e.lanes) !== 0 && bs(t), e = sc(a, r), e.ref = t.ref, t.child = e, e.return = t, e;
		}
		function pa(e, t) {
			var n = t.ref;
			if (n === null) e !== null && e.ref !== null && (t.flags |= 4194816);
			else {
				if (typeof n != "function" && typeof n != "object") throw Error("Expected ref to be a function, an object returned by React.createRef(), or undefined/null.");
				(e === null || e.ref !== n) && (t.flags |= 4194816);
			}
		}
		function ma(e, t, n, r, i) {
			if (n.prototype && typeof n.prototype.render == "function") {
				var a = C(n) || "Unknown";
				Xh[a] || (console.error("The <%s /> component appears to have a render method, but doesn't extend React.Component. This is likely to cause errors. Change %s to extend React.Component instead.", a, a), Xh[a] = !0);
			}
			return t.mode & 8 && qp.recordLegacyContextWarning(t, null), e === null && (va(t, t.type), n.contextTypes && (a = C(n) || "Unknown", Qh[a] || (Qh[a] = !0, console.error("%s uses the legacy contextTypes API which was removed in React 19. Use React.createContext() with React.useContext() instead. (https://react.dev/link/legacy-context)", a)))), Lt(t), n = Sr(e, t, n, r, void 0, i), r = Er(), e !== null && !Yh ? (Dr(e, t, i), Oa(e, t, i)) : (Nf && r && Ke(t), t.flags |= 1, ra(e, t, n, i), t.child);
		}
		function ha(e, t, n, r, i, a) {
			return Lt(t), wh = -1, Th = e !== null && e.type !== t.type, t.updateQueue = null, n = wr(t, r, n, i), Cr(e, t), r = Er(), e !== null && !Yh ? (Dr(e, t, a), Oa(e, t, a)) : (Nf && r && Ke(t), t.flags |= 1, ra(e, t, n, a), t.child);
		}
		function ga(e, t, n, r, i) {
			switch (l(t)) {
				case !1:
					var a = t.stateNode, o = new t.type(t.memoizedProps, a.context).state;
					a.updater.enqueueSetState(a, o, null);
					break;
				case !0:
					t.flags |= 128, t.flags |= 65536, a = Error("Simulated error coming from DevTools");
					var s = i & -i;
					if (t.lanes |= s, o = Rg, o === null) throw Error("Expected a work-in-progress root. This is a bug in React. Please file an issue.");
					s = ea(s), ta(s, o, t, Ue(a, t)), rr(t, s);
			}
			if (Lt(t), t.stateNode === null) {
				if (o = yd, a = n.contextType, "contextType" in n && a !== null && (a === void 0 || a.$$typeof !== Fc) && !Uh.has(n) && (Uh.add(n), s = a === void 0 ? " However, it is set to undefined. This can be caused by a typo or by mixing up named and default imports. This can also happen due to a circular dependency, so try moving the createContext() call to a separate file." : typeof a == "object" ? a.$$typeof === Pc ? " Did you accidentally pass the Context.Consumer instead?" : " However, it is set to an object with keys {" + Object.keys(a).join(", ") + "}." : " However, it is set to a " + typeof a + ".", console.error("%s defines an invalid contextType. contextType should point to the Context object returned by React.createContext().%s", C(n) || "Component", s)), typeof a == "object" && a && (o = Rt(a)), a = new n(r, o), t.mode & 8) {
					j(!0);
					try {
						a = new n(r, o);
					} finally {
						j(!1);
					}
				}
				if (o = t.memoizedState = a.state !== null && a.state !== void 0 ? a.state : null, a.updater = Gh, t.stateNode = a, a._reactInternals = t, a._reactInternalInstance = Ph, typeof n.getDerivedStateFromProps == "function" && o === null && (o = C(n) || "Component", Ih.has(o) || (Ih.add(o), console.error("`%s` uses `getDerivedStateFromProps` but its initial state is %s. This is not recommended. Instead, define the initial state by assigning an object to `this.state` in the constructor of `%s`. This ensures that `getDerivedStateFromProps` arguments have a consistent shape.", o, a.state === null ? "null" : "undefined", o))), typeof n.getDerivedStateFromProps == "function" || typeof a.getSnapshotBeforeUpdate == "function") {
					var c = s = o = null;
					if (typeof a.componentWillMount == "function" && !0 !== a.componentWillMount.__suppressDeprecationWarning ? o = "componentWillMount" : typeof a.UNSAFE_componentWillMount == "function" && (o = "UNSAFE_componentWillMount"), typeof a.componentWillReceiveProps == "function" && !0 !== a.componentWillReceiveProps.__suppressDeprecationWarning ? s = "componentWillReceiveProps" : typeof a.UNSAFE_componentWillReceiveProps == "function" && (s = "UNSAFE_componentWillReceiveProps"), typeof a.componentWillUpdate == "function" && !0 !== a.componentWillUpdate.__suppressDeprecationWarning ? c = "componentWillUpdate" : typeof a.UNSAFE_componentWillUpdate == "function" && (c = "UNSAFE_componentWillUpdate"), o !== null || s !== null || c !== null) {
						a = C(n) || "Component";
						var u = typeof n.getDerivedStateFromProps == "function" ? "getDerivedStateFromProps()" : "getSnapshotBeforeUpdate()";
						Rh.has(a) || (Rh.add(a), console.error("Unsafe legacy lifecycles will not be called for components using new component APIs.\n\n%s uses %s but also contains the following legacy lifecycles:%s%s%s\n\nThe above lifecycles should be removed. Learn more about this warning here:\nhttps://react.dev/link/unsafe-component-lifecycles", a, u, o === null ? "" : "\n  " + o, s === null ? "" : "\n  " + s, c === null ? "" : "\n  " + c));
					}
				}
				a = t.stateNode, o = C(n) || "Component", a.render || (n.prototype && typeof n.prototype.render == "function" ? console.error("No `render` method found on the %s instance: did you accidentally return an object from the constructor?", o) : console.error("No `render` method found on the %s instance: you may have forgotten to define `render`.", o)), !a.getInitialState || a.getInitialState.isReactClassApproved || a.state || console.error("getInitialState was defined on %s, a plain JavaScript class. This is only supported for classes created using React.createClass. Did you mean to define a state property instead?", o), a.getDefaultProps && !a.getDefaultProps.isReactClassApproved && console.error("getDefaultProps was defined on %s, a plain JavaScript class. This is only supported for classes created using React.createClass. Use a static property to define defaultProps instead.", o), a.contextType && console.error("contextType was defined as an instance property on %s. Use a static property to define contextType instead.", o), n.childContextTypes && !Hh.has(n) && (Hh.add(n), console.error("%s uses the legacy childContextTypes API which was removed in React 19. Use React.createContext() instead. (https://react.dev/link/legacy-context)", o)), n.contextTypes && !Vh.has(n) && (Vh.add(n), console.error("%s uses the legacy contextTypes API which was removed in React 19. Use React.createContext() with static contextType instead. (https://react.dev/link/legacy-context)", o)), typeof a.componentShouldUpdate == "function" && console.error("%s has a method called componentShouldUpdate(). Did you mean shouldComponentUpdate()? The name is phrased as a question because the function is expected to return a value.", o), n.prototype && n.prototype.isPureReactComponent && a.shouldComponentUpdate !== void 0 && console.error("%s has a method called shouldComponentUpdate(). shouldComponentUpdate should not be used when extending React.PureComponent. Please extend React.Component if shouldComponentUpdate is used.", C(n) || "A pure component"), typeof a.componentDidUnmount == "function" && console.error("%s has a method called componentDidUnmount(). But there is no such lifecycle method. Did you mean componentWillUnmount()?", o), typeof a.componentDidReceiveProps == "function" && console.error("%s has a method called componentDidReceiveProps(). But there is no such lifecycle method. If you meant to update the state in response to changing props, use componentWillReceiveProps(). If you meant to fetch data or run side-effects or mutations after React has updated the UI, use componentDidUpdate().", o), typeof a.componentWillRecieveProps == "function" && console.error("%s has a method called componentWillRecieveProps(). Did you mean componentWillReceiveProps()?", o), typeof a.UNSAFE_componentWillRecieveProps == "function" && console.error("%s has a method called UNSAFE_componentWillRecieveProps(). Did you mean UNSAFE_componentWillReceiveProps()?", o), s = a.props !== r, a.props !== void 0 && s && console.error("When calling super() in `%s`, make sure to pass up the same props that your component's constructor was passed.", o), a.defaultProps && console.error("Setting defaultProps as an instance property on %s is not supported and will be ignored. Instead, define defaultProps as a static property on %s.", o, o), typeof a.getSnapshotBeforeUpdate != "function" || typeof a.componentDidUpdate == "function" || Lh.has(n) || (Lh.add(n), console.error("%s: getSnapshotBeforeUpdate() should be used with componentDidUpdate(). This component defines getSnapshotBeforeUpdate() only.", C(n))), typeof a.getDerivedStateFromProps == "function" && console.error("%s: getDerivedStateFromProps() is defined as an instance method and will be ignored. Instead, declare it as a static method.", o), typeof a.getDerivedStateFromError == "function" && console.error("%s: getDerivedStateFromError() is defined as an instance method and will be ignored. Instead, declare it as a static method.", o), typeof n.getSnapshotBeforeUpdate == "function" && console.error("%s: getSnapshotBeforeUpdate() is defined as a static method and will be ignored. Instead, declare it as an instance method.", o), (s = a.state) && (typeof s != "object" || Gc(s)) && console.error("%s.state: must be set to an object or null", o), typeof a.getChildContext == "function" && typeof n.childContextTypes != "object" && console.error("%s.getChildContext(): childContextTypes must be defined in order to use getChildContext().", o), a = t.stateNode, a.props = r, a.state = t.memoizedState, a.refs = {}, Qn(t), o = n.contextType, a.context = typeof o == "object" && o ? Rt(o) : yd, a.state === r && (o = C(n) || "Component", zh.has(o) || (zh.add(o), console.error("%s: It is not recommended to assign props directly to state because updates to props won't be reflected in state. In most cases, it is better to use props directly.", o))), t.mode & 8 && qp.recordLegacyContextWarning(t, a), qp.recordUnsafeLifecycleWarnings(t, a), a.state = t.memoizedState, o = n.getDerivedStateFromProps, typeof o == "function" && (qi(t, n, o, r), a.state = t.memoizedState), typeof n.getDerivedStateFromProps == "function" || typeof a.getSnapshotBeforeUpdate == "function" || typeof a.UNSAFE_componentWillMount != "function" && typeof a.componentWillMount != "function" || (o = a.state, typeof a.componentWillMount == "function" && a.componentWillMount(), typeof a.UNSAFE_componentWillMount == "function" && a.UNSAFE_componentWillMount(), o !== a.state && (console.error("%s.componentWillMount(): Assigning directly to this.state is deprecated (except inside a component's constructor). Use setState instead.", w(t) || "Component"), Gh.enqueueReplaceState(a, a.state, null)), ar(t, r, a, i), ir(), a.state = t.memoizedState), typeof a.componentDidMount == "function" && (t.flags |= 4194308), (t.mode & 16) !== q && (t.flags |= 134217728), a = !0;
			} else if (e === null) {
				a = t.stateNode;
				var d = t.memoizedProps;
				s = Xi(n, d), a.props = s;
				var f = a.context;
				c = n.contextType, o = yd, typeof c == "object" && c && (o = Rt(c)), u = n.getDerivedStateFromProps, c = typeof u == "function" || typeof a.getSnapshotBeforeUpdate == "function", d = t.pendingProps !== d, c || typeof a.UNSAFE_componentWillReceiveProps != "function" && typeof a.componentWillReceiveProps != "function" || (d || f !== o) && Yi(t, a, r, o), Gm = !1;
				var p = t.memoizedState;
				a.state = p, ar(t, r, a, i), ir(), f = t.memoizedState, d || p !== f || Gm ? (typeof u == "function" && (qi(t, n, u, r), f = t.memoizedState), (s = Gm || Ji(t, n, s, r, p, f, o)) ? (c || typeof a.UNSAFE_componentWillMount != "function" && typeof a.componentWillMount != "function" || (typeof a.componentWillMount == "function" && a.componentWillMount(), typeof a.UNSAFE_componentWillMount == "function" && a.UNSAFE_componentWillMount()), typeof a.componentDidMount == "function" && (t.flags |= 4194308), (t.mode & 16) !== q && (t.flags |= 134217728)) : (typeof a.componentDidMount == "function" && (t.flags |= 4194308), (t.mode & 16) !== q && (t.flags |= 134217728), t.memoizedProps = r, t.memoizedState = f), a.props = r, a.state = f, a.context = o, a = s) : (typeof a.componentDidMount == "function" && (t.flags |= 4194308), (t.mode & 16) !== q && (t.flags |= 134217728), a = !1);
			} else {
				a = t.stateNode, $n(e, t), o = t.memoizedProps, c = Xi(n, o), a.props = c, u = t.pendingProps, p = a.context, f = n.contextType, s = yd, typeof f == "object" && f && (s = Rt(f)), d = n.getDerivedStateFromProps, (f = typeof d == "function" || typeof a.getSnapshotBeforeUpdate == "function") || typeof a.UNSAFE_componentWillReceiveProps != "function" && typeof a.componentWillReceiveProps != "function" || (o !== u || p !== s) && Yi(t, a, r, s), Gm = !1, p = t.memoizedState, a.state = p, ar(t, r, a, i), ir();
				var m = t.memoizedState;
				o !== u || p !== m || Gm || e !== null && e.dependencies !== null && It(e.dependencies) ? (typeof d == "function" && (qi(t, n, d, r), m = t.memoizedState), (c = Gm || Ji(t, n, c, r, p, m, s) || e !== null && e.dependencies !== null && It(e.dependencies)) ? (f || typeof a.UNSAFE_componentWillUpdate != "function" && typeof a.componentWillUpdate != "function" || (typeof a.componentWillUpdate == "function" && a.componentWillUpdate(r, m, s), typeof a.UNSAFE_componentWillUpdate == "function" && a.UNSAFE_componentWillUpdate(r, m, s)), typeof a.componentDidUpdate == "function" && (t.flags |= 4), typeof a.getSnapshotBeforeUpdate == "function" && (t.flags |= 1024)) : (typeof a.componentDidUpdate != "function" || o === e.memoizedProps && p === e.memoizedState || (t.flags |= 4), typeof a.getSnapshotBeforeUpdate != "function" || o === e.memoizedProps && p === e.memoizedState || (t.flags |= 1024), t.memoizedProps = r, t.memoizedState = m), a.props = r, a.state = m, a.context = s, a = c) : (typeof a.componentDidUpdate != "function" || o === e.memoizedProps && p === e.memoizedState || (t.flags |= 4), typeof a.getSnapshotBeforeUpdate != "function" || o === e.memoizedProps && p === e.memoizedState || (t.flags |= 1024), a = !1);
			}
			if (s = a, pa(e, t), o = (t.flags & 128) != 0, s || o) {
				if (s = t.stateNode, vt(t), o && typeof n.getDerivedStateFromError != "function") n = null, np = -1;
				else if (n = om(s), t.mode & 8) {
					j(!0);
					try {
						om(s);
					} finally {
						j(!1);
					}
				}
				t.flags |= 1, e !== null && o ? (t.child = Pm(t, e.child, null, i), t.child = Pm(t, null, n, i)) : ra(e, t, n, i), t.memoizedState = s.state, e = t.child;
			} else e = Oa(e, t, i);
			return i = t.stateNode, a && i.props !== r && (eg || console.error("It looks like %s is reassigning its own `this.props` while rendering. This is not supported and can lead to confusing bugs.", w(t) || "a component"), eg = !0), e;
		}
		function _a(e, t, n, r) {
			return Dt(), t.flags |= 256, ra(e, t, n, r), t.child;
		}
		function va(e, t) {
			t && t.childContextTypes && console.error("childContextTypes cannot be defined on a function component.\n  %s.childContextTypes = ...", t.displayName || t.name || "Component"), typeof t.getDerivedStateFromProps == "function" && (e = C(t) || "Unknown", $h[e] || (console.error("%s: Function components do not support getDerivedStateFromProps.", e), $h[e] = !0)), typeof t.contextType == "object" && t.contextType !== null && (t = C(t) || "Unknown", Zh[t] || (console.error("%s: Function components do not support contextType.", t), Zh[t] = !0));
		}
		function ya(e) {
			return {
				baseLanes: e,
				cachePool: En()
			};
		}
		function ba(e, t, n) {
			return e = e === null ? 0 : e.childLanes & ~n, t && (e |= o_), e;
		}
		function xa(e, t, n) {
			var r = t.pendingProps;
			c(t) && (t.flags |= 128);
			var i = !1, a = (t.flags & 128) != 0, o;
			if ((o = a) || (o = e !== null && e.memoizedState === null ? !1 : (th.current & eh) !== 0), o && (i = !0, t.flags &= -129), o = (t.flags & 32) != 0, t.flags &= -33, e === null) {
				if (Nf) {
					if (i ? fr(t) : hr(t), (e = Mf) ? (n = Du(e, Lf), n !== null && (o = {
						dehydrated: n,
						treeContext: Je(),
						retryLane: 536870912,
						hydrationErrors: null
					}, t.memoizedState = o, o = pc(n), o.return = t, t.child = o, jf = t, Mf = null)) : n = null, n === null) throw xt(t, e), St(t);
					return fu(n) ? t.lanes = 32 : t.lanes = 536870912, null;
				}
				var s = r.children;
				return r = r.fallback, i ? (hr(t), i = t.mode, s = Ca({
					mode: "hidden",
					children: s
				}, i), r = dc(r, i, n, null), s.return = t, r.return = t, s.sibling = r, t.child = s, r = t.child, r.memoizedState = ya(n), r.childLanes = ba(e, o, n), t.memoizedState = rg, ca(null, r)) : (fr(t), Sa(t, s));
			}
			var l = e.memoizedState;
			if (l !== null && (s = l.dehydrated, s !== null)) {
				if (a) t.flags & 256 ? (fr(t), t.flags &= -257, t = wa(e, t, n)) : t.memoizedState === null ? (hr(t), s = r.fallback, i = t.mode, r = Ca({
					mode: "visible",
					children: r.children
				}, i), s = dc(s, i, n, null), s.flags |= 2, r.return = t, s.return = t, r.sibling = s, t.child = r, Pm(t, e.child, null, n), r = t.child, r.memoizedState = ya(n), r.childLanes = ba(e, o, n), t.memoizedState = rg, t = ca(null, r)) : (hr(t), t.child = e.child, t.flags |= 128, t = null);
				else if (fr(t), bt(), n & 536870912 && bs(t), fu(s)) i = pu(s), o = i.digest, s = i.message, r = i.stack, i = i.componentStack, s = Error(s || "The server could not finish this Suspense boundary, likely due to an error during server rendering. Switched to client rendering."), s.stack = r || "", s.digest = o, o = i === void 0 ? null : i, r = {
					value: s,
					source: null,
					stack: o
				}, typeof o == "string" && mf.set(s, r), kt(r), t = wa(e, t, n);
				else if (Yh || Ft(e, t, n, !1), o = (n & e.childLanes) !== 0, Yh || o) {
					if (o = Rg, o !== null && (r = de(o, n), r !== 0 && r !== l.retryLane)) throw l.retryLane = r, Yn(e, r), ss(o, e, r), Jh;
					du(s) || xs(), t = wa(e, t, n);
				} else du(s) ? (t.flags |= 192, t.child = e.child, t = null) : (e = l.treeContext, dl && (Mf = Su(s), jf = t, Nf = !0, If = null, Pf = !1, Ff = null, Lf = !1, e !== null && Ye(t, e)), t = Sa(t, r.children), t.flags |= 4096);
				return t;
			}
			return i ? (hr(t), s = r.fallback, i = t.mode, l = e.child, a = l.sibling, r = sc(l, {
				mode: "hidden",
				children: r.children
			}), r.subtreeFlags = l.subtreeFlags & 65011712, a === null ? (s = dc(s, i, n, null), s.flags |= 2) : s = sc(a, s), s.return = t, r.return = t, r.sibling = s, t.child = r, ca(null, r), r = t.child, s = e.child.memoizedState, s === null ? s = ya(n) : (i = s.cachePool, i === null ? i = En() : (l = cl ? Yf._currentValue : Yf._currentValue2, i = i.parent === l ? i : {
				parent: l,
				pool: l
			}), s = {
				baseLanes: s.baseLanes | n,
				cachePool: i
			}), r.memoizedState = s, r.childLanes = ba(e, o, n), t.memoizedState = rg, ca(e.child, r)) : (l !== null && (n & 62914560) === n && (n & e.lanes) !== 0 && bs(t), fr(t), n = e.child, e = n.sibling, n = sc(n, {
				mode: "visible",
				children: r.children
			}), n.return = t, n.sibling = null, e !== null && (o = t.deletions, o === null ? (t.deletions = [e], t.flags |= 16) : o.push(e)), t.child = n, t.memoizedState = null, n);
		}
		function Sa(e, t) {
			return t = Ca({
				mode: "visible",
				children: t
			}, e.mode), t.return = e, e.child = t;
		}
		function Ca(e, t) {
			return e = u(22, e, null, t), e.lanes = 0, e;
		}
		function wa(e, t, n) {
			return Pm(t, e.child, null, n), e = Sa(t, t.pendingProps.children), e.flags |= 2, t.memoizedState = null, e;
		}
		function Ta(e, t, n) {
			e.lanes |= t;
			var r = e.alternate;
			r !== null && (r.lanes |= t), Nt(e.return, t, n);
		}
		function Ea(e, t, n, r, i, a) {
			var o = e.memoizedState;
			o === null ? e.memoizedState = {
				isBackwards: t,
				rendering: null,
				renderingStartTime: 0,
				last: r,
				tail: n,
				tailMode: i,
				treeForkCount: a
			} : (o.isBackwards = t, o.rendering = null, o.renderingStartTime = 0, o.last = r, o.tail = n, o.tailMode = i, o.treeForkCount = a);
		}
		function Da(e, t, n) {
			var r = t.pendingProps, i = r.revealOrder, a = r.tail, o = r.children, s = th.current;
			if ((r = (s & eh) !== 0) ? (s = s & $m | eh, t.flags |= 128) : s &= $m, E(th, s, t), s = i ?? "null", i !== "forwards" && i !== "unstable_legacy-backwards" && i !== "together" && i !== "independent" && !tg[s]) if (tg[s] = !0, i == null) console.error("The default for the <SuspenseList revealOrder=\"...\"> prop is changing. To be future compatible you must explictly specify either \"independent\" (the current default), \"together\", \"forwards\" or \"legacy_unstable-backwards\".");
			else if (i === "backwards") console.error("The rendering order of <SuspenseList revealOrder=\"backwards\"> is changing. To be future compatible you must specify revealOrder=\"legacy_unstable-backwards\" instead.");
			else if (typeof i == "string") switch (i.toLowerCase()) {
				case "together":
				case "forwards":
				case "backwards":
				case "independent":
					console.error("\"%s\" is not a valid value for revealOrder on <SuspenseList />. Use lowercase \"%s\" instead.", i, i.toLowerCase());
					break;
				case "forward":
				case "backward":
					console.error("\"%s\" is not a valid value for revealOrder on <SuspenseList />. React uses the -s suffix in the spelling. Use \"%ss\" instead.", i, i.toLowerCase());
					break;
				default: console.error("\"%s\" is not a supported revealOrder on <SuspenseList />. Did you mean \"independent\", \"together\", \"forwards\" or \"backwards\"?", i);
			}
			else console.error("%s is not a supported value for revealOrder on <SuspenseList />. Did you mean \"independent\", \"together\", \"forwards\" or \"backwards\"?", i);
			s = a ?? "null", ng[s] || (a == null ? (i === "forwards" || i === "backwards" || i === "unstable_legacy-backwards") && (ng[s] = !0, console.error("The default for the <SuspenseList tail=\"...\"> prop is changing. To be future compatible you must explictly specify either \"visible\" (the current default), \"collapsed\" or \"hidden\".")) : a !== "visible" && a !== "collapsed" && a !== "hidden" ? (ng[s] = !0, console.error("\"%s\" is not a supported value for tail on <SuspenseList />. Did you mean \"visible\", \"collapsed\" or \"hidden\"?", a)) : i !== "forwards" && i !== "backwards" && i !== "unstable_legacy-backwards" && (ng[s] = !0, console.error("<SuspenseList tail=\"%s\" /> is only valid if revealOrder is \"forwards\" or \"backwards\". Did you mean to specify revealOrder=\"forwards\"?", a)));
			a: if ((i === "forwards" || i === "backwards" || i === "unstable_legacy-backwards") && o != null && !1 !== o) if (Gc(o)) {
				for (s = 0; s < o.length; s++) if (!Gn(o[s], s)) break a;
			} else if (s = ne(o), typeof s == "function") {
				if (s = s.call(o)) for (var c = s.next(), l = 0; !c.done; c = s.next()) {
					if (!Gn(c.value, l)) break a;
					l++;
				}
			} else console.error("A single row was passed to a <SuspenseList revealOrder=\"%s\" />. This is not useful since it needs multiple rows. Did you mean to pass multiple children or an array?", i);
			if (ra(e, t, o, n), Nf ? (Xe(), o = vf) : o = 0, !r && e !== null && e.flags & 128) a: for (e = t.child; e !== null;) {
				if (e.tag === 13) e.memoizedState !== null && Ta(e, n, t);
				else if (e.tag === 19) Ta(e, n, t);
				else if (e.child !== null) {
					e.child.return = e, e = e.child;
					continue;
				}
				if (e === t) break a;
				for (; e.sibling === null;) {
					if (e.return === null || e.return === t) break a;
					e = e.return;
				}
				e.sibling.return = e.return, e = e.sibling;
			}
			switch (i) {
				case "forwards":
					for (n = t.child, i = null; n !== null;) e = n.alternate, e !== null && _r(e) === null && (i = n), n = n.sibling;
					n = i, n === null ? (i = t.child, t.child = null) : (i = n.sibling, n.sibling = null), Ea(t, !1, i, n, a, o);
					break;
				case "backwards":
				case "unstable_legacy-backwards":
					for (n = null, i = t.child, t.child = null; i !== null;) {
						if (e = i.alternate, e !== null && _r(e) === null) {
							t.child = i;
							break;
						}
						e = i.sibling, i.sibling = n, n = i, i = e;
					}
					Ea(t, !0, n, null, a, o);
					break;
				case "together":
					Ea(t, !1, null, null, void 0, o);
					break;
				default: t.memoizedState = null;
			}
			return t.child;
		}
		function Oa(e, t, n) {
			if (e !== null && (t.dependencies = e.dependencies), np = -1, r_ |= t.lanes, (n & t.childLanes) === 0) if (e !== null) {
				if (Ft(e, t, n, !1), (n & t.childLanes) === 0) return null;
			} else return null;
			if (e !== null && t.child !== e.child) throw Error("Resuming work not yet implemented.");
			if (t.child !== null) {
				for (e = t.child, n = sc(e, e.pendingProps), t.child = n, n.return = t; e.sibling !== null;) e = e.sibling, n = n.sibling = sc(e, e.pendingProps), n.return = t;
				n.sibling = null;
			}
			return t.child;
		}
		function ka(e, t) {
			return (e.lanes & t) === 0 ? (e = e.dependencies, !!(e !== null && It(e))) : !0;
		}
		function Aa(e, t, n) {
			switch (t.tag) {
				case 3:
					N(t, t.stateNode.containerInfo), jt(t, Yf, e.memoizedState.cache), Dt();
					break;
				case 27:
				case 5:
					et(t);
					break;
				case 4:
					N(t, t.stateNode.containerInfo);
					break;
				case 10:
					jt(t, t.type, t.memoizedProps.value);
					break;
				case 12:
					(n & t.childLanes) !== 0 && (t.flags |= 4), t.flags |= 2048;
					var r = t.stateNode;
					r.effectDuration = -0, r.passiveEffectDuration = -0;
					break;
				case 31:
					if (t.memoizedState !== null) return t.flags |= 128, pr(t), null;
					break;
				case 13:
					if (r = t.memoizedState, r !== null) return r.dehydrated === null ? (n & t.child.childLanes) === 0 ? (fr(t), e = Oa(e, t, n), e === null ? null : e.sibling) : xa(e, t, n) : (fr(t), t.flags |= 128, null);
					fr(t);
					break;
				case 19:
					var i = (e.flags & 128) != 0;
					if (r = (n & t.childLanes) !== 0, r ||= (Ft(e, t, n, !1), (n & t.childLanes) !== 0), i) {
						if (r) return Da(e, t, n);
						t.flags |= 128;
					}
					if (i = t.memoizedState, i !== null && (i.rendering = null, i.tail = null, i.lastEffect = null), E(th, th.current, t), r) break;
					return null;
				case 22: return t.lanes = 0, sa(e, t, n, t.pendingProps);
				case 24: jt(t, Yf, e.memoizedState.cache);
			}
			return Oa(e, t, n);
		}
		function ja(e, t, n) {
			if (t._debugNeedsRemount && e !== null) {
				n = lc(t.type, t.key, t.pendingProps, t._debugOwner || null, t.mode, t.lanes), n._debugStack = t._debugStack, n._debugTask = t._debugTask;
				var r = t.return;
				if (r === null) throw Error("Cannot swap the root fiber.");
				if (e.alternate = null, t.alternate = null, n.index = t.index, n.sibling = t.sibling, n.return = t.return, n.ref = t.ref, n._debugInfo = t._debugInfo, t === r.child) r.child = n;
				else {
					var i = r.child;
					if (i === null) throw Error("Expected parent to have a child.");
					for (; i.sibling !== t;) if (i = i.sibling, i === null) throw Error("Expected to find the previous sibling.");
					i.sibling = n;
				}
				return t = r.deletions, t === null ? (r.deletions = [e], r.flags |= 16) : t.push(e), n.flags |= 2, n;
			}
			if (e !== null) if (e.memoizedProps !== t.pendingProps || t.type !== e.type) Yh = !0;
			else {
				if (!ka(e, n) && !(t.flags & 128)) return Yh = !1, Aa(e, t, n);
				Yh = !!(e.flags & 131072);
			}
			else Yh = !1, (r = Nf) && (Xe(), r = (t.flags & 1048576) != 0), r && (r = t.index, Xe(), Ge(t, vf, r));
			switch (t.lanes = 0, t.tag) {
				case 16:
					a: if (r = t.pendingProps, e = jn(t.elementType), t.type = e, typeof e == "function") oc(e) ? (r = Xi(e, r), t.tag = 1, t.type = e = ec(e), t = ga(null, t, e, r, n)) : (t.tag = 0, va(t, e), t.type = e = ec(e), t = ma(null, t, e, r, n));
					else {
						if (e != null) {
							if (i = e.$$typeof, i === Ic) {
								t.tag = 11, t.type = e = tc(e), t = ia(null, t, e, r, n);
								break a;
							} else if (i === zc) {
								t.tag = 14, t = aa(null, t, e, r, n);
								break a;
							}
						}
						throw t = "", typeof e == "object" && e && e.$$typeof === Bc && (t = " Did you wrap a component in React.lazy() more than once?"), e = C(e) || e, Error("Element type is invalid. Received a promise that resolves to: " + e + ". Lazy element type must resolve to a class or function." + t);
					}
					return t;
				case 0: return ma(e, t, t.type, t.pendingProps, n);
				case 1: return r = t.type, i = Xi(r, t.pendingProps), ga(e, t, r, i, n);
				case 3:
					a: {
						if (N(t, t.stateNode.containerInfo), e === null) throw Error("Should have a current fiber. This is a bug in React.");
						var a = t.pendingProps;
						i = t.memoizedState, r = i.element, $n(e, t), ar(t, a, null, n);
						var o = t.memoizedState;
						if (a = o.cache, jt(t, Yf, a), a !== i.cache && Pt(t, [Yf], n, !0), ir(), a = o.element, dl && i.isDehydrated) if (i = {
							element: a,
							isDehydrated: !1,
							cache: o.cache
						}, t.updateQueue.baseState = i, t.memoizedState = i, t.flags & 256) {
							t = _a(e, t, a, n);
							break a;
						} else if (a !== r) {
							r = Ue(Error("This root received an early update, before anything was able hydrate. Switched the entire root to client rendering."), t), kt(r), t = _a(e, t, a, n);
							break a;
						} else for (dl && (Mf = bu(t.stateNode.containerInfo), jf = t, Nf = !0, If = null, Pf = !1, Ff = null, Lf = !0), e = Fm(t, null, a, n), t.child = e; e;) e.flags = e.flags & -3 | 4096, e = e.sibling;
						else {
							if (Dt(), a === r) {
								t = Oa(e, t, n);
								break a;
							}
							ra(e, t, a, n);
						}
						t = t.child;
					}
					return t;
				case 26: if (Xu) return pa(e, t), e === null ? (e = $u(t.type, null, t.pendingProps, null)) ? t.memoizedState = e : Nf || (t.stateNode = ad(t.type, t.pendingProps, Ze(Ef.current), t)) : t.memoizedState = $u(t.type, e.memoizedProps, t.pendingProps, e.memoizedState), null;
				case 27: if (ud) return et(t), e === null && ud && Nf && (i = Ze(Ef.current), r = $e(), i = t.stateNode = dd(t.type, t.pendingProps, i, r, !1), Pf || (r = Gu(i, t.type, t.pendingProps, r), r !== null && (yt(t, 0).serverProps = r)), jf = t, Lf = !0, Mf = Cu(t.type, i, Mf)), ra(e, t, t.pendingProps.children, n), pa(e, t), e === null && (t.flags |= 4194304), t.child;
				case 5: return e === null && Nf && (a = $e(), r = Ju(t.type, t.pendingProps, a), i = Mf, (o = !i) || (o = wu(i, t.type, t.pendingProps, Lf), o === null ? a = !1 : (t.stateNode = o, Pf || (a = Gu(o, t.type, t.pendingProps, a), a !== null && (yt(t, 0).serverProps = a)), jf = t, Mf = yu(o), Lf = !1, a = !0), o = !a), o && (r && xt(t, i), St(t))), et(t), i = t.type, a = t.pendingProps, o = e === null ? null : e.memoizedProps, r = a.children, rl(i, a) ? r = null : o !== null && rl(i, o) && (t.flags |= 32), t.memoizedState !== null && (i = Sr(e, t, Tr, null, null, n), cl ? jl._currentValue = i : jl._currentValue2 = i), pa(e, t), ra(e, t, r, n), t.child;
				case 6: return e === null && Nf && (e = t.pendingProps, n = $e(), e = Yu(e, n), n = Mf, (r = !n) || (r = Tu(n, t.pendingProps, Lf), r === null ? r = !1 : (t.stateNode = r, jf = t, Mf = null, r = !0), r = !r), r && (e && xt(t, n), St(t))), null;
				case 13: return xa(e, t, n);
				case 4: return N(t, t.stateNode.containerInfo), r = t.pendingProps, e === null ? t.child = Pm(t, null, r, n) : ra(e, t, r, n), t.child;
				case 11: return ia(e, t, t.type, t.pendingProps, n);
				case 7: return ra(e, t, t.pendingProps, n), t.child;
				case 8: return ra(e, t, t.pendingProps.children, n), t.child;
				case 12: return t.flags |= 4, t.flags |= 2048, r = t.stateNode, r.effectDuration = -0, r.passiveEffectDuration = -0, ra(e, t, t.pendingProps.children, n), t.child;
				case 10: return r = t.type, i = t.pendingProps, a = i.value, "value" in i || ig || (ig = !0, console.error("The `value` prop is required for the `<Context.Provider>`. Did you misspell it or forget to pass it?")), jt(t, r, a), ra(e, t, i.children, n), t.child;
				case 9: return i = t.type._context, r = t.pendingProps.children, typeof r != "function" && console.error("A context consumer was rendered with multiple children, or a child that isn't a function. A context consumer expects a single child that is a function. If you did pass a function, make sure there is no trailing or leading whitespace around it."), Lt(t), i = Rt(i), r = im(r, i, void 0), t.flags |= 1, ra(e, t, r, n), t.child;
				case 14: return aa(e, t, t.type, t.pendingProps, n);
				case 15: return oa(e, t, t.type, t.pendingProps, n);
				case 19: return Da(e, t, n);
				case 31: return fa(e, t, n);
				case 22: return sa(e, t, n, t.pendingProps);
				case 24: return Lt(t), r = Rt(Yf), e === null ? (i = wn(), i === null && (i = Rg, a = Vt(), i.pooledCache = a, Ht(a), a !== null && (i.pooledCacheLanes |= n), i = a), t.memoizedState = {
					parent: r,
					cache: i
				}, Qn(t), jt(t, Yf, i)) : ((e.lanes & n) !== 0 && ($n(e, t), ar(t, null, null, n), ir()), i = e.memoizedState, a = t.memoizedState, i.parent === r ? (r = a.cache, jt(t, Yf, r), r !== i.cache && Pt(t, [Yf], n, !0)) : (i = {
					parent: r,
					cache: r
				}, t.memoizedState = i, t.lanes === 0 && (t.memoizedState = t.updateQueue.baseState = i), jt(t, Yf, r))), ra(e, t, t.pendingProps.children, n), t.child;
				case 29: throw t.pendingProps;
			}
			throw Error("Unknown unit of work tag (" + t.tag + "). This error is likely caused by a bug in React. Please file an issue.");
		}
		function Ma(e) {
			e.flags |= 4;
		}
		function Na(e) {
			ul && (e.flags |= 8);
		}
		function Pa(e, t) {
			if (e !== null && e.child === t.child) return !1;
			if (t.flags & 16) return !0;
			for (e = t.child; e !== null;) {
				if (e.flags & 8218 || e.subtreeFlags & 8218) return !0;
				e = e.sibling;
			}
			return !1;
		}
		function Fa(e, t, n, r) {
			if (ll) for (n = t.child; n !== null;) {
				if (n.tag === 5 || n.tag === 6) tl(e, n.stateNode);
				else if (!(n.tag === 4 || ud && n.tag === 27) && n.child !== null) {
					n.child.return = n, n = n.child;
					continue;
				}
				if (n === t) break;
				for (; n.sibling === null;) {
					if (n.return === null || n.return === t) return;
					n = n.return;
				}
				n.sibling.return = n.return, n = n.sibling;
			}
			else if (ul) for (var i = t.child; i !== null;) {
				if (i.tag === 5) {
					var a = i.stateNode;
					n && r && (a = lu(a, i.type, i.memoizedProps)), tl(e, a);
				} else if (i.tag === 6) a = i.stateNode, n && r && (a = uu(a, i.memoizedProps)), tl(e, a);
				else if (i.tag !== 4) {
					if (i.tag === 22 && i.memoizedState !== null) a = i.child, a !== null && (a.return = i), Fa(e, i, !0, !0);
					else if (i.child !== null) {
						i.child.return = i, i = i.child;
						continue;
					}
				}
				if (i === t) break;
				for (; i.sibling === null;) {
					if (i.return === null || i.return === t) return;
					i = i.return;
				}
				i.sibling.return = i.return, i = i.sibling;
			}
		}
		function Ia(e, t, n, r) {
			var i = !1;
			if (ul) for (var a = t.child; a !== null;) {
				if (a.tag === 5) {
					var o = a.stateNode;
					n && r && (o = lu(o, a.type, a.memoizedProps)), ou(e, o);
				} else if (a.tag === 6) o = a.stateNode, n && r && (o = uu(o, a.memoizedProps)), ou(e, o);
				else if (a.tag !== 4) {
					if (a.tag === 22 && a.memoizedState !== null) i = a.child, i !== null && (i.return = a), Ia(e, a, !0, !0), i = !0;
					else if (a.child !== null) {
						a.child.return = a, a = a.child;
						continue;
					}
				}
				if (a === t) break;
				for (; a.sibling === null;) {
					if (a.return === null || a.return === t) return i;
					a = a.return;
				}
				a.sibling.return = a.return, a = a.sibling;
			}
			return i;
		}
		function La(e, t) {
			if (ul && Pa(e, t)) {
				e = t.stateNode;
				var n = e.containerInfo, r = au();
				Ia(r, t, !1, !1), e.pendingChildren = r, Ma(t), su(n, r);
			}
		}
		function Ra(e, t, n, r) {
			if (ll) e.memoizedProps !== r && Ma(t);
			else if (ul) {
				var i = e.stateNode, a = e.memoizedProps;
				if ((e = Pa(e, t)) || a !== r) {
					var o = $e();
					a = iu(i, n, a, r, !e, null), a === i ? t.stateNode = i : (Na(t), nl(a, n, r, o) && Ma(t), t.stateNode = a, e && Fa(a, t, !1, !1));
				} else t.stateNode = i;
			}
		}
		function za(e, t, n, r, i) {
			if ((e.mode & 32) !== q && (n === null ? Sl(t, r) : Cl(t, n, r))) {
				if (e.flags |= 16777216, (i & 335544128) === i || wl(t, r)) if (Tl(e.stateNode, t, r)) e.flags |= 8192;
				else if (vs()) e.flags |= 8192;
				else throw Tm = wm, Sm;
			} else e.flags &= -16777217;
		}
		function Ba(e, t) {
			if (sd(t)) {
				if (e.flags |= 16777216, !cd(t)) if (vs()) e.flags |= 8192;
				else throw Tm = wm, Sm;
			} else e.flags &= -16777217;
		}
		function Va(e, t) {
			t !== null && (e.flags |= 4), e.flags & 16384 && (t = e.tag === 22 ? 536870912 : k(), e.lanes |= t, s_ |= t);
		}
		function Ha(e, t) {
			if (!Nf) switch (e.tailMode) {
				case "hidden":
					t = e.tail;
					for (var n = null; t !== null;) t.alternate !== null && (n = t), t = t.sibling;
					n === null ? e.tail = null : n.sibling = null;
					break;
				case "collapsed":
					n = e.tail;
					for (var r = null; n !== null;) n.alternate !== null && (r = n), n = n.sibling;
					r === null ? t || e.tail === null ? e.tail = null : e.tail.sibling = null : r.sibling = null;
			}
		}
		function Ua(e) {
			var t = e.alternate !== null && e.alternate.child === e.child, n = 0, r = 0;
			if (t) if ((e.mode & 2) !== q) {
				for (var i = e.selfBaseDuration, a = e.child; a !== null;) n |= a.lanes | a.childLanes, r |= a.subtreeFlags & 65011712, r |= a.flags & 65011712, i += a.treeBaseDuration, a = a.sibling;
				e.treeBaseDuration = i;
			} else for (i = e.child; i !== null;) n |= i.lanes | i.childLanes, r |= i.subtreeFlags & 65011712, r |= i.flags & 65011712, i.return = e, i = i.sibling;
			else if ((e.mode & 2) !== q) {
				i = e.actualDuration, a = e.selfBaseDuration;
				for (var o = e.child; o !== null;) n |= o.lanes | o.childLanes, r |= o.subtreeFlags, r |= o.flags, i += o.actualDuration, a += o.treeBaseDuration, o = o.sibling;
				e.actualDuration = i, e.treeBaseDuration = a;
			} else for (i = e.child; i !== null;) n |= i.lanes | i.childLanes, r |= i.subtreeFlags, r |= i.flags, i.return = e, i = i.sibling;
			return e.subtreeFlags |= r, e.childLanes = n, t;
		}
		function Wa(e, t, n) {
			var r = t.pendingProps;
			switch (qe(t), t.tag) {
				case 16:
				case 15:
				case 0:
				case 11:
				case 7:
				case 8:
				case 12:
				case 9:
				case 14: return Ua(t), null;
				case 1: return Ua(t), null;
				case 3: return n = t.stateNode, r = null, e !== null && (r = e.memoizedState.cache), t.memoizedState.cache !== r && (t.flags |= 2048), Mt(Yf, t), Qe(t), n.pendingContext && (n.context = n.pendingContext, n.pendingContext = null), (e === null || e.child === null) && (Tt(t) ? (At(), Ma(t)) : e === null || e.memoizedState.isDehydrated && !(t.flags & 256) || (t.flags |= 1024, Ot())), La(e, t), Ua(t), null;
				case 26: if (Xu) {
					var i = t.type, a = t.memoizedState;
					return e === null ? (Ma(t), a === null ? (Ua(t), za(t, i, null, r, n)) : (Ua(t), Ba(t, a))) : a ? a === e.memoizedState ? (Ua(t), t.flags &= -16777217) : (Ma(t), Ua(t), Ba(t, a)) : (a = e.memoizedProps, ll ? a !== r && Ma(t) : Ra(e, t, i, r), Ua(t), za(t, i, a, r, n)), null;
				}
				case 27: if (ud) {
					if (tt(t), n = Ze(Ef.current), i = t.type, e !== null && t.stateNode != null) ll ? e.memoizedProps !== r && Ma(t) : Ra(e, t, i, r);
					else {
						if (!r) {
							if (t.stateNode === null) throw Error("We must have new props for new mounts. This error is likely caused by a bug in React. Please file an issue.");
							return Ua(t), null;
						}
						e = $e(), Tt(t) ? Ct(t, e) : (e = dd(i, r, n, e, !0), t.stateNode = e, Ma(t));
					}
					return Ua(t), null;
				}
				case 5:
					if (tt(t), i = t.type, e !== null && t.stateNode != null) Ra(e, t, i, r);
					else {
						if (!r) {
							if (t.stateNode === null) throw Error("We must have new props for new mounts. This error is likely caused by a bug in React. Please file an issue.");
							return Ua(t), null;
						}
						if (a = $e(), Tt(t)) Ct(t, a), Ru(t.stateNode, i, r, a) && (t.flags |= 64);
						else {
							var o = Ze(Ef.current);
							o = el(i, r, o, a, t), Na(t), Fa(o, t, !1, !1), t.stateNode = o, nl(o, i, r, a) && Ma(t);
						}
					}
					return Ua(t), za(t, t.type, e === null ? null : e.memoizedProps, t.pendingProps, n), null;
				case 6:
					if (e && t.stateNode != null) n = e.memoizedProps, ll ? n !== r && Ma(t) : ul && (n === r ? t.stateNode = e.stateNode : (e = Ze(Ef.current), n = $e(), Na(t), t.stateNode = il(r, e, n, t)));
					else {
						if (typeof r != "string" && t.stateNode === null) throw Error("We must have new props for new mounts. This error is likely caused by a bug in React. Please file an issue.");
						if (e = Ze(Ef.current), n = $e(), Tt(t)) {
							if (!dl) throw Error("Expected prepareToHydrateHostTextInstance() to never be called. This error is likely caused by a bug in React. Please file an issue.");
							if (e = t.stateNode, n = t.memoizedProps, i = !Pf, r = null, a = jf, a !== null) switch (a.tag) {
								case 3:
									i && (i = Ku(e, n, r), i !== null && (yt(t, 0).serverProps = i));
									break;
								case 27:
								case 5: r = a.memoizedProps, i && (i = Ku(e, n, r), i !== null && (yt(t, 0).serverProps = i));
							}
							ku(e, n, t, r) || St(t, !0);
						} else Na(t), t.stateNode = il(r, e, n, t);
					}
					return Ua(t), null;
				case 31:
					if (n = t.memoizedState, e === null || e.memoizedState !== null) {
						if (r = Tt(t), n !== null) {
							if (e === null) {
								if (!r) throw Error("A dehydrated suspense component was completed without a hydrated node. This is probably a bug in React.");
								if (!dl) throw Error("Expected prepareToHydrateHostActivityInstance() to never be called. This error is likely caused by a bug in React. Please file an issue.");
								if (e = t.memoizedState, e = e === null ? null : e.dehydrated, !e) throw Error("Expected to have a hydrated activity instance. This error is likely caused by a bug in React. Please file an issue.");
								Au(e, t), Ua(t), (t.mode & 2) !== q && n !== null && (e = t.child, e !== null && (t.treeBaseDuration -= e.treeBaseDuration));
							} else At(), Dt(), !(t.flags & 128) && (n = t.memoizedState = null), t.flags |= 4, Ua(t), (t.mode & 2) !== q && n !== null && (e = t.child, e !== null && (t.treeBaseDuration -= e.treeBaseDuration));
							e = !1;
						} else n = Ot(), e !== null && e.memoizedState !== null && (e.memoizedState.hydrationErrors = n), e = !0;
						if (!e) return t.flags & 256 ? (gr(t), t) : (gr(t), null);
						if (t.flags & 128) throw Error("Client rendering an Activity suspended it again. This is a bug in React.");
					}
					return Ua(t), null;
				case 13:
					if (r = t.memoizedState, e === null || e.memoizedState !== null && e.memoizedState.dehydrated !== null) {
						if (i = r, a = Tt(t), i !== null && i.dehydrated !== null) {
							if (e === null) {
								if (!a) throw Error("A dehydrated suspense component was completed without a hydrated node. This is probably a bug in React.");
								if (!dl) throw Error("Expected prepareToHydrateHostSuspenseInstance() to never be called. This error is likely caused by a bug in React. Please file an issue.");
								if (a = t.memoizedState, a = a === null ? null : a.dehydrated, !a) throw Error("Expected to have a hydrated suspense instance. This error is likely caused by a bug in React. Please file an issue.");
								ju(a, t), Ua(t), (t.mode & 2) !== q && i !== null && (i = t.child, i !== null && (t.treeBaseDuration -= i.treeBaseDuration));
							} else At(), Dt(), !(t.flags & 128) && (i = t.memoizedState = null), t.flags |= 4, Ua(t), (t.mode & 2) !== q && i !== null && (i = t.child, i !== null && (t.treeBaseDuration -= i.treeBaseDuration));
							i = !1;
						} else i = Ot(), e !== null && e.memoizedState !== null && (e.memoizedState.hydrationErrors = i), i = !0;
						if (!i) return t.flags & 256 ? (gr(t), t) : (gr(t), null);
					}
					return gr(t), t.flags & 128 ? (t.lanes = n, (t.mode & 2) !== q && ln(t), t) : (n = r !== null, e = e !== null && e.memoizedState !== null, n && (r = t.child, i = null, r.alternate !== null && r.alternate.memoizedState !== null && r.alternate.memoizedState.cachePool !== null && (i = r.alternate.memoizedState.cachePool.pool), a = null, r.memoizedState !== null && r.memoizedState.cachePool !== null && (a = r.memoizedState.cachePool.pool), a !== i && (r.flags |= 2048)), n !== e && n && (t.child.flags |= 8192), Va(t, t.updateQueue), Ua(t), (t.mode & 2) !== q && n && (e = t.child, e !== null && (t.treeBaseDuration -= e.treeBaseDuration)), null);
				case 4: return Qe(t), La(e, t), e === null && pl(t.stateNode.containerInfo), Ua(t), null;
				case 10: return Mt(t.type, t), Ua(t), null;
				case 19:
					if (re(th, t), r = t.memoizedState, r === null) return Ua(t), null;
					if (i = (t.flags & 128) != 0, a = r.rendering, a === null) if (i) Ha(r, !1);
					else {
						if (n_ !== Ag || e !== null && e.flags & 128) for (e = t.child; e !== null;) {
							if (a = _r(e), a !== null) {
								for (t.flags |= 128, Ha(r, !1), e = a.updateQueue, t.updateQueue = e, Va(t, e), t.subtreeFlags = 0, e = n, n = t.child; n !== null;) cc(n, e), n = n.sibling;
								return E(th, th.current & $m | eh, t), Nf && We(t, r.treeForkCount), t.child;
							}
							e = e.sibling;
						}
						r.tail !== null && Ad() > m_ && (t.flags |= 128, i = !0, Ha(r, !1), t.lanes = 4194304);
					}
					else {
						if (!i) if (e = _r(a), e !== null) {
							if (t.flags |= 128, i = !0, e = e.updateQueue, t.updateQueue = e, Va(t, e), Ha(r, !0), r.tail === null && r.tailMode === "hidden" && !a.alternate && !Nf) return Ua(t), null;
						} else 2 * Ad() - r.renderingStartTime > m_ && n !== 536870912 && (t.flags |= 128, i = !0, Ha(r, !1), t.lanes = 4194304);
						r.isBackwards ? (a.sibling = t.child, t.child = a) : (e = r.last, e === null ? t.child = a : e.sibling = a, r.last = a);
					}
					return r.tail === null ? (Ua(t), null) : (e = r.tail, r.rendering = e, r.tail = e.sibling, r.renderingStartTime = Ad(), e.sibling = null, n = th.current, n = i ? n & $m | eh : n & $m, E(th, n, t), Nf && We(t, r.treeForkCount), e);
				case 22:
				case 23: return gr(t), dr(t), r = t.memoizedState !== null, e === null ? r && (t.flags |= 8192) : e.memoizedState !== null !== r && (t.flags |= 8192), r ? n & 536870912 && !(t.flags & 128) && (Ua(t), t.subtreeFlags & 6 && (t.flags |= 8192)) : Ua(t), n = t.updateQueue, n !== null && Va(t, n.retryQueue), n = null, e !== null && e.memoizedState !== null && e.memoizedState.cachePool !== null && (n = e.memoizedState.cachePool.pool), r = null, t.memoizedState !== null && t.memoizedState.cachePool !== null && (r = t.memoizedState.cachePool.pool), r !== n && (t.flags |= 2048), e !== null && re(Kp, t), null;
				case 24: return n = null, e !== null && (n = e.memoizedState.cache), t.memoizedState.cache !== n && (t.flags |= 2048), Mt(Yf, t), Ua(t), null;
				case 25: return null;
				case 30: return null;
			}
			throw Error("Unknown unit of work tag (" + t.tag + "). This error is likely caused by a bug in React. Please file an issue.");
		}
		function Ga(e, t) {
			switch (qe(t), t.tag) {
				case 1: return e = t.flags, e & 65536 ? (t.flags = e & -65537 | 128, (t.mode & 2) !== q && ln(t), t) : null;
				case 3: return Mt(Yf, t), Qe(t), e = t.flags, e & 65536 && !(e & 128) ? (t.flags = e & -65537 | 128, t) : null;
				case 26:
				case 27:
				case 5: return tt(t), null;
				case 31:
					if (t.memoizedState !== null) {
						if (gr(t), t.alternate === null) throw Error("Threw in newly mounted dehydrated component. This is likely a bug in React. Please file an issue.");
						Dt();
					}
					return e = t.flags, e & 65536 ? (t.flags = e & -65537 | 128, (t.mode & 2) !== q && ln(t), t) : null;
				case 13:
					if (gr(t), e = t.memoizedState, e !== null && e.dehydrated !== null) {
						if (t.alternate === null) throw Error("Threw in newly mounted dehydrated component. This is likely a bug in React. Please file an issue.");
						Dt();
					}
					return e = t.flags, e & 65536 ? (t.flags = e & -65537 | 128, (t.mode & 2) !== q && ln(t), t) : null;
				case 19: return re(th, t), null;
				case 4: return Qe(t), null;
				case 10: return Mt(t.type, t), null;
				case 22:
				case 23: return gr(t), dr(t), e !== null && re(Kp, t), e = t.flags, e & 65536 ? (t.flags = e & -65537 | 128, (t.mode & 2) !== q && ln(t), t) : null;
				case 24: return Mt(Yf, t), null;
				case 25: return null;
				default: return null;
			}
		}
		function Ka(e, t) {
			switch (qe(t), t.tag) {
				case 3:
					Mt(Yf, t), Qe(t);
					break;
				case 26:
				case 27:
				case 5:
					tt(t);
					break;
				case 4:
					Qe(t);
					break;
				case 31:
					t.memoizedState !== null && gr(t);
					break;
				case 13:
					gr(t);
					break;
				case 19:
					re(th, t);
					break;
				case 10:
					Mt(t.type, t);
					break;
				case 22:
				case 23:
					gr(t), dr(t), e !== null && re(Kp, t);
					break;
				case 24: Mt(Yf, t);
			}
		}
		function qa(e) {
			return (e.mode & 2) !== q;
		}
		function Ja(e, t) {
			qa(e) ? (cn(), Xa(t, e), on()) : Xa(t, e);
		}
		function Ya(e, t, n) {
			qa(e) ? (cn(), U(n, e, t), on()) : U(n, e, t);
		}
		function Xa(e, t) {
			try {
				var n = t.updateQueue, r = n === null ? null : n.lastEffect;
				if (r !== null) {
					var i = r.next;
					n = i;
					do {
						if ((n.tag & e) === e && (r = void 0, (e & ih) !== nh && (J_ = !0), r = F(t, gm, n), (e & ih) !== nh && (J_ = !1), r !== void 0 && typeof r != "function")) {
							var a = void 0;
							a = (n.tag & ah) === 0 ? (n.tag & ih) === 0 ? "useEffect" : "useInsertionEffect" : "useLayoutEffect";
							var o = void 0;
							o = r === null ? " You returned null. If your effect does not require clean up, return undefined (or nothing)." : typeof r.then == "function" ? "\n\nIt looks like you wrote " + a + "(async () => ...) or returned a Promise. Instead, write the async function inside your effect and call it immediately:\n\n" + a + "(() => {\n  async function fetchData() {\n    // You can await here\n    const response = await MyAPI.getData(someId);\n    // ...\n  }\n  fetchData();\n}, [someId]); // Or [] if effect doesn't need props or state\n\nLearn more about data fetching with Hooks: https://react.dev/link/hooks-data-fetching" : " You returned: " + r, F(t, function(e, t) {
								console.error("%s must not return anything besides a function, which is used for clean-up.%s", e, t);
							}, a, o);
						}
						n = n.next;
					} while (n !== i);
				}
			} catch (e) {
				Vs(t, t.return, e);
			}
		}
		function U(e, t, n) {
			try {
				var r = t.updateQueue, i = r === null ? null : r.lastEffect;
				if (i !== null) {
					var a = i.next;
					r = a;
					do {
						if ((r.tag & e) === e) {
							var o = r.inst, s = o.destroy;
							s !== void 0 && (o.destroy = void 0, (e & ih) !== nh && (J_ = !0), i = t, F(i, vm, i, n, s), (e & ih) !== nh && (J_ = !1));
						}
						r = r.next;
					} while (r !== a);
				}
			} catch (e) {
				Vs(t, t.return, e);
			}
		}
		function Za(e, t) {
			qa(e) ? (cn(), Xa(t, e), on()) : Xa(t, e);
		}
		function Qa(e, t, n) {
			qa(e) ? (cn(), U(n, e, t), on()) : U(n, e, t);
		}
		function $a(e) {
			var t = e.updateQueue;
			if (t !== null) {
				var n = e.stateNode;
				e.type.defaultProps || "ref" in e.memoizedProps || eg || (n.props !== e.memoizedProps && console.error("Expected %s props to match memoized props before processing the update queue. This might either be because of a bug in React, or because a component reassigns its own `this.props`. Please file an issue.", w(e) || "instance"), n.state !== e.memoizedState && console.error("Expected %s state to match memoized state before processing the update queue. This might either be because of a bug in React, or because a component reassigns its own `this.state`. Please file an issue.", w(e) || "instance"));
				try {
					F(e, cr, t, n);
				} catch (t) {
					Vs(e, e.return, t);
				}
			}
		}
		function eo(e, t, n) {
			return e.getSnapshotBeforeUpdate(t, n);
		}
		function to(e, t) {
			var n = t.memoizedProps, r = t.memoizedState;
			t = e.stateNode, e.type.defaultProps || "ref" in e.memoizedProps || eg || (t.props !== e.memoizedProps && console.error("Expected %s props to match memoized props before getSnapshotBeforeUpdate. This might either be because of a bug in React, or because a component reassigns its own `this.props`. Please file an issue.", w(e) || "instance"), t.state !== e.memoizedState && console.error("Expected %s state to match memoized state before getSnapshotBeforeUpdate. This might either be because of a bug in React, or because a component reassigns its own `this.state`. Please file an issue.", w(e) || "instance"));
			try {
				var i = Xi(e.type, n), a = F(e, eo, t, i, r);
				n = ag, a !== void 0 || n.has(e.type) || (n.add(e.type), F(e, function() {
					console.error("%s.getSnapshotBeforeUpdate(): A snapshot value (or null) must be returned. You have returned undefined.", w(e));
				})), t.__reactInternalSnapshotBeforeUpdate = a;
			} catch (t) {
				Vs(e, e.return, t);
			}
		}
		function no(e, t, n) {
			n.props = Xi(e.type, e.memoizedProps), n.state = e.memoizedState, qa(e) ? (cn(), F(e, mm, e, t, n), on()) : F(e, mm, e, t, n);
		}
		function ro(e) {
			var t = e.ref;
			if (t !== null) {
				switch (e.tag) {
					case 26:
					case 27:
					case 5:
						var n = Yc(e.stateNode);
						break;
					case 30:
						n = e.stateNode;
						break;
					default: n = e.stateNode;
				}
				if (typeof t == "function") if (qa(e)) try {
					cn(), e.refCleanup = t(n);
				} finally {
					on();
				}
				else e.refCleanup = t(n);
				else typeof t == "string" ? console.error("String refs are no longer supported.") : t.hasOwnProperty("current") || console.error("Unexpected ref object provided for %s. Use either a ref-setter function or React.createRef().", w(e)), t.current = n;
			}
		}
		function io(e, t) {
			try {
				F(e, ro, e);
			} catch (n) {
				Vs(e, t, n);
			}
		}
		function ao(e, t) {
			var n = e.ref, r = e.refCleanup;
			if (n !== null) if (typeof r == "function") try {
				if (qa(e)) try {
					cn(), F(e, r);
				} finally {
					on(e);
				}
				else F(e, r);
			} catch (n) {
				Vs(e, t, n);
			} finally {
				e.refCleanup = null, e = e.alternate, e != null && (e.refCleanup = null);
			}
			else if (typeof n == "function") try {
				if (qa(e)) try {
					cn(), F(e, n, null);
				} finally {
					on(e);
				}
				else F(e, n, null);
			} catch (n) {
				Vs(e, t, n);
			}
			else n.current = null;
		}
		function oo(e, t, n, r) {
			var i = e.memoizedProps, a = i.id, o = i.onCommit;
			i = i.onRender, t = t === null ? "mount" : "update", jp && (t = "nested-update"), typeof i == "function" && i(a, t, e.actualDuration, e.treeBaseDuration, e.actualStartTime, n), typeof o == "function" && o(a, t, r, n);
		}
		function so(e, t, n, r) {
			var i = e.memoizedProps;
			e = i.id, i = i.onPostCommit, t = t === null ? "mount" : "update", jp && (t = "nested-update"), typeof i == "function" && i(e, t, r, n);
		}
		function co(e) {
			var t = e.type, n = e.memoizedProps, r = e.stateNode;
			try {
				F(e, Kl, r, t, n, e);
			} catch (t) {
				Vs(e, e.return, t);
			}
		}
		function lo(e, t, n) {
			try {
				F(e, ql, e.stateNode, e.type, n, t, e);
			} catch (t) {
				Vs(e, e.return, t);
			}
		}
		function uo(e) {
			return e.tag === 5 || e.tag === 3 || (Xu ? e.tag === 26 : !1) || (ud ? e.tag === 27 && hd(e.type) : !1) || e.tag === 4;
		}
		function fo(e) {
			a: for (;;) {
				for (; e.sibling === null;) {
					if (e.return === null || uo(e.return)) return null;
					e = e.return;
				}
				for (e.sibling.return = e.return, e = e.sibling; e.tag !== 5 && e.tag !== 6 && e.tag !== 18;) {
					if (ud && e.tag === 27 && hd(e.type) || e.flags & 2 || e.child === null || e.tag === 4) continue a;
					e.child.return = e, e = e.child;
				}
				if (!(e.flags & 2)) return e.stateNode;
			}
		}
		function po(e, t, n) {
			var r = e.tag;
			if (r === 5 || r === 6) e = e.stateNode, t ? Yl(n, e, t) : Gl(n, e);
			else if (r !== 4 && (ud && r === 27 && hd(e.type) && (n = e.stateNode, t = null), e = e.child, e !== null)) for (po(e, t, n), e = e.sibling; e !== null;) po(e, t, n), e = e.sibling;
		}
		function mo(e, t, n) {
			var r = e.tag;
			if (r === 5 || r === 6) e = e.stateNode, t ? Jl(n, e, t) : Wl(n, e);
			else if (r !== 4 && (ud && r === 27 && hd(e.type) && (n = e.stateNode), e = e.child, e !== null)) for (mo(e, t, n), e = e.sibling; e !== null;) mo(e, t, n), e = e.sibling;
		}
		function ho(e) {
			for (var t, n = e.return; n !== null;) {
				if (uo(n)) {
					t = n;
					break;
				}
				n = n.return;
			}
			if (ll) {
				if (t == null) throw Error("Expected to find a host parent. This error is likely caused by a bug in React. Please file an issue.");
				switch (t.tag) {
					case 27: if (ud) {
						t = t.stateNode, n = fo(e), mo(e, n, t);
						break;
					}
					case 5:
						n = t.stateNode, t.flags & 32 && (Ql(n), t.flags &= -33), t = fo(e), mo(e, t, n);
						break;
					case 3:
					case 4:
						t = t.stateNode.containerInfo, n = fo(e), po(e, n, t);
						break;
					default: throw Error("Invalid host parent fiber. This error is likely caused by a bug in React. Please file an issue.");
				}
			}
		}
		function go(e, t, n) {
			e = e.containerInfo;
			try {
				F(t, cu, e, n);
			} catch (e) {
				Vs(t, t.return, e);
			}
		}
		function _o(e) {
			var t = e.stateNode, n = e.memoizedProps;
			try {
				F(e, fd, e.type, n, t, e);
			} catch (t) {
				Vs(e, e.return, t);
			}
		}
		function vo(e, t) {
			return t.tag === 31 ? (t = t.memoizedState, e.memoizedState !== null && t === null) : t.tag === 13 ? (e = e.memoizedState, t = t.memoizedState, e !== null && e.dehydrated !== null && (t === null || t.dehydrated === null)) : t.tag === 3 ? e.memoizedState.isDehydrated && (t.flags & 256) == 0 : !1;
		}
		function yo(e, t) {
			for (Qc(e.containerInfo), ug = t; ug !== null;) if (e = ug, t = e.child, e.subtreeFlags & 1028 && t !== null) t.return = e, ug = t;
			else for (; ug !== null;) {
				t = e = ug;
				var n = t.alternate, r = t.flags;
				switch (t.tag) {
					case 0:
						if (r & 4 && (t = t.updateQueue, t = t === null ? null : t.events, t !== null)) for (n = 0; n < t.length; n++) r = t[n], r.ref.impl = r.nextImpl;
						break;
					case 11:
					case 15: break;
					case 1:
						r & 1024 && n !== null && to(t, n);
						break;
					case 3:
						r & 1024 && ll && ru(t.stateNode.containerInfo);
						break;
					case 5:
					case 26:
					case 27:
					case 6:
					case 4:
					case 17: break;
					default: if (r & 1024) throw Error("This unit of work tag should not have side-effects. This error is likely caused by a bug in React. Please file an issue.");
				}
				if (t = e.sibling, t !== null) {
					t.return = e.return, ug = t;
					break;
				}
				ug = e.return;
			}
		}
		function bo(e, t, n) {
			var r = Xt(), i = Qt(), a = en(), o = tn(), s = n.flags;
			switch (n.tag) {
				case 0:
				case 11:
				case 15:
					Mo(e, n), s & 4 && Ja(n, ah | rh);
					break;
				case 1:
					if (Mo(e, n), s & 4) if (e = n.stateNode, t === null) n.type.defaultProps || "ref" in n.memoizedProps || eg || (e.props !== n.memoizedProps && console.error("Expected %s props to match memoized props before componentDidMount. This might either be because of a bug in React, or because a component reassigns its own `this.props`. Please file an issue.", w(n) || "instance"), e.state !== n.memoizedState && console.error("Expected %s state to match memoized state before componentDidMount. This might either be because of a bug in React, or because a component reassigns its own `this.state`. Please file an issue.", w(n) || "instance")), qa(n) ? (cn(), F(n, cm, n, e), on()) : F(n, cm, n, e);
					else {
						var c = Xi(n.type, t.memoizedProps);
						t = t.memoizedState, n.type.defaultProps || "ref" in n.memoizedProps || eg || (e.props !== n.memoizedProps && console.error("Expected %s props to match memoized props before componentDidUpdate. This might either be because of a bug in React, or because a component reassigns its own `this.props`. Please file an issue.", w(n) || "instance"), e.state !== n.memoizedState && console.error("Expected %s state to match memoized state before componentDidUpdate. This might either be because of a bug in React, or because a component reassigns its own `this.state`. Please file an issue.", w(n) || "instance")), qa(n) ? (cn(), F(n, um, n, e, c, t, e.__reactInternalSnapshotBeforeUpdate), on()) : F(n, um, n, e, c, t, e.__reactInternalSnapshotBeforeUpdate);
					}
					s & 64 && $a(n), s & 512 && io(n, n.return);
					break;
				case 3:
					if (t = Kt(), Mo(e, n), s & 64 && (s = n.updateQueue, s !== null)) {
						if (c = null, n.child !== null) switch (n.child.tag) {
							case 27:
							case 5:
								c = Yc(n.child.stateNode);
								break;
							case 1: c = n.child.stateNode;
						}
						try {
							F(n, cr, s, c);
						} catch (e) {
							Vs(n, n.return, e);
						}
					}
					e.effectDuration += qt(t);
					break;
				case 27: ud && t === null && s & 4 && _o(n);
				case 26:
				case 5:
					if (Mo(e, n), t === null) {
						if (s & 4) co(n);
						else if (s & 64) {
							e = n.type, t = n.memoizedProps, c = n.stateNode;
							try {
								F(n, Pu, c, e, t, n);
							} catch (e) {
								Vs(n, n.return, e);
							}
						}
					}
					s & 512 && io(n, n.return);
					break;
				case 12:
					if (s & 4) {
						s = Kt(), Mo(e, n), e = n.stateNode, e.effectDuration += Jt(s);
						try {
							F(n, oo, n, t, $f, e.effectDuration);
						} catch (e) {
							Vs(n, n.return, e);
						}
					} else Mo(e, n);
					break;
				case 31:
					Mo(e, n), s & 4 && wo(e, n);
					break;
				case 13:
					Mo(e, n), s & 4 && To(e, n), s & 64 && (e = n.memoizedState, e !== null && (e = e.dehydrated, e !== null && (s = Gs.bind(null, n), mu(e, s))));
					break;
				case 22:
					if (s = n.memoizedState !== null || og, !s) {
						t = t !== null && t.memoizedState !== null || sg, c = og;
						var l = sg;
						og = s, (sg = t) && !l ? (Io(e, n, (n.subtreeFlags & 8772) != 0), (n.mode & 2) !== q && 0 <= J && 0 <= Y && .05 < Y - J && we(n, J, Y)) : Mo(e, n), og = c, sg = l;
					}
					break;
				case 30: break;
				default: Mo(e, n);
			}
			(n.mode & 2) !== q && 0 <= J && 0 <= Y && ((op || .05 < ip) && M(n, J, Y, ip, ap), n.alternate === null && n.return !== null && n.return.alternate !== null && .05 < Y - J && (vo(n.return.alternate, n.return) || Ce(n, J, Y, "Mount"))), Zt(r), $t(i), ap = a, op = o;
		}
		function xo(e) {
			var t = e.alternate;
			t !== null && (e.alternate = null, xo(t)), e.child = null, e.deletions = null, e.sibling = null, e.tag === 5 && (t = e.stateNode, t !== null && xl(t)), e.stateNode = null, e._debugOwner = null, e.return = null, e.dependencies = null, e.memoizedProps = null, e.memoizedState = null, e.pendingProps = null, e.stateNode = null, e.updateQueue = null;
		}
		function So(e, t, n) {
			for (n = n.child; n !== null;) Co(e, t, n), n = n.sibling;
		}
		function Co(e, t, n) {
			if (Rd && typeof Rd.onCommitFiberUnmount == "function") try {
				Rd.onCommitFiberUnmount(Ld, n);
			} catch (e) {
				zd || (zd = !0, console.error("React instrumentation encountered an error: %o", e));
			}
			var r = Xt(), i = Qt(), a = en(), o = tn();
			switch (n.tag) {
				case 26: if (Xu) {
					sg || ao(n, t), So(e, t, n), n.memoizedState ? td(n.memoizedState) : n.stateNode && id(n.stateNode);
					break;
				}
				case 27: if (ud) {
					sg || ao(n, t);
					var s = pg, c = mg;
					hd(n.type) && (pg = n.stateNode, mg = !1), So(e, t, n), F(n, pd, n.stateNode), pg = s, mg = c;
					break;
				}
				case 5: sg || ao(n, t);
				case 6:
					if (ll) {
						if (s = pg, c = mg, pg = null, So(e, t, n), pg = s, mg = c, pg !== null) if (mg) try {
							F(n, Zl, pg, n.stateNode);
						} catch (e) {
							Vs(n, t, e);
						}
						else try {
							F(n, Xl, pg, n.stateNode);
						} catch (e) {
							Vs(n, t, e);
						}
					} else So(e, t, n);
					break;
				case 18:
					ll && pg !== null && (mg ? Vu(pg, n.stateNode) : Bu(pg, n.stateNode));
					break;
				case 4:
					ll ? (s = pg, c = mg, pg = n.stateNode.containerInfo, mg = !0, So(e, t, n), pg = s, mg = c) : (ul && go(n.stateNode, n, au()), So(e, t, n));
					break;
				case 0:
				case 11:
				case 14:
				case 15:
					U(ih, n, t), sg || Ya(n, t, ah), So(e, t, n);
					break;
				case 1:
					sg || (ao(n, t), s = n.stateNode, typeof s.componentWillUnmount == "function" && no(n, t, s)), So(e, t, n);
					break;
				case 21:
					So(e, t, n);
					break;
				case 22:
					sg = (s = sg) || n.memoizedState !== null, So(e, t, n), sg = s;
					break;
				default: So(e, t, n);
			}
			(n.mode & 2) !== q && 0 <= J && 0 <= Y && (op || .05 < ip) && M(n, J, Y, ip, ap), Zt(r), $t(i), ap = a, op = o;
		}
		function wo(e, t) {
			if (dl && t.memoizedState === null && (e = t.alternate, e !== null && (e = e.memoizedState, e !== null))) {
				e = e.dehydrated;
				try {
					F(t, Iu, e);
				} catch (e) {
					Vs(t, t.return, e);
				}
			}
		}
		function To(e, t) {
			if (dl && t.memoizedState === null && (e = t.alternate, e !== null && (e = e.memoizedState, e !== null && (e = e.dehydrated, e !== null)))) try {
				F(t, Lu, e);
			} catch (e) {
				Vs(t, t.return, e);
			}
		}
		function Eo(e) {
			switch (e.tag) {
				case 31:
				case 13:
				case 19:
					var t = e.stateNode;
					return t === null && (t = e.stateNode = new lg()), t;
				case 22: return e = e.stateNode, t = e._retryCache, t === null && (t = e._retryCache = new lg()), t;
				default: throw Error("Unexpected Suspense handler tag (" + e.tag + "). This is a bug in React.");
			}
		}
		function Do(e, t) {
			var n = Eo(e);
			t.forEach(function(t) {
				if (!n.has(t)) {
					if (n.add(t), Bd) if (dg !== null && fg !== null) Zs(fg, dg);
					else throw Error("Expected finished root and lanes to be set. This is a bug in React.");
					var r = Ks.bind(null, e, t);
					t.then(r, r);
				}
			});
		}
		function Oo(e, t) {
			var n = t.deletions;
			if (n !== null) for (var r = 0; r < n.length; r++) {
				var i = e, a = t, o = n[r], s = Xt();
				if (ll) {
					var c = a;
					a: for (; c !== null;) {
						switch (c.tag) {
							case 27: if (ud) {
								if (hd(c.type)) {
									pg = c.stateNode, mg = !1;
									break a;
								}
								break;
							}
							case 5:
								pg = c.stateNode, mg = !1;
								break a;
							case 3:
							case 4:
								pg = c.stateNode.containerInfo, mg = !0;
								break a;
						}
						c = c.return;
					}
					if (pg === null) throw Error("Expected to find a host parent. This error is likely caused by a bug in React. Please file an issue.");
					Co(i, a, o), pg = null, mg = !1;
				} else Co(i, a, o);
				(o.mode & 2) !== q && 0 <= J && 0 <= Y && .05 < Y - J && Ce(o, J, Y, "Unmount"), Zt(s), i = o, a = i.alternate, a !== null && (a.return = null), i.return = null;
			}
			if (t.subtreeFlags & 13886) for (t = t.child; t !== null;) ko(t, e), t = t.sibling;
		}
		function ko(e, t) {
			var n = Xt(), r = Qt(), i = en(), a = tn(), o = e.alternate, s = e.flags;
			switch (e.tag) {
				case 0:
				case 11:
				case 14:
				case 15:
					Oo(t, e), Ao(e), s & 4 && (U(ih | rh, e, e.return), Xa(ih | rh, e), Ya(e, e.return, ah | rh));
					break;
				case 1:
					Oo(t, e), Ao(e), s & 512 && (sg || o === null || ao(o, o.return)), s & 64 && og && (s = e.updateQueue, s !== null && (o = s.callbacks, o !== null && (t = s.shared.hiddenCallbacks, s.shared.hiddenCallbacks = t === null ? o : t.concat(o))));
					break;
				case 26: if (Xu) {
					var c = hg;
					Oo(t, e), Ao(e), s & 512 && (sg || o === null || ao(o, o.return)), s & 4 && (s = o === null ? null : o.memoizedState, t = e.memoizedState, o === null ? t === null ? e.stateNode === null ? e.stateNode = nd(c, e.type, e.memoizedProps, e) : rd(c, e.type, e.stateNode) : e.stateNode = ed(c, t, e.memoizedProps) : s === t ? t === null && e.stateNode !== null && lo(e, e.memoizedProps, o.memoizedProps) : (s === null ? o.stateNode !== null && id(o.stateNode) : td(s), t === null ? rd(c, e.type, e.stateNode) : ed(c, t, e.memoizedProps)));
					break;
				}
				case 27: if (ud) {
					Oo(t, e), Ao(e), s & 512 && (sg || o === null || ao(o, o.return)), o !== null && s & 4 && lo(e, e.memoizedProps, o.memoizedProps);
					break;
				}
				case 5:
					if (Oo(t, e), Ao(e), s & 512 && (sg || o === null || ao(o, o.return)), ll) {
						if (e.flags & 32) {
							t = e.stateNode;
							try {
								F(e, Ql, t);
							} catch (t) {
								Vs(e, e.return, t);
							}
						}
						s & 4 && e.stateNode != null && (t = e.memoizedProps, lo(e, t, o === null ? t : o.memoizedProps)), s & 1024 && (cg = !0, e.type !== "form" && console.error("Unexpected host component type. Expected a form. This is a bug in React."));
					} else ul && e.alternate !== null && (e.alternate.stateNode = e.stateNode);
					break;
				case 6:
					if (Oo(t, e), Ao(e), s & 4 && ll) {
						if (e.stateNode === null) throw Error("This should have a text node initialized. This error is likely caused by a bug in React. Please file an issue.");
						s = e.memoizedProps, o = o === null ? s : o.memoizedProps, t = e.stateNode;
						try {
							F(e, K, t, o, s);
						} catch (t) {
							Vs(e, e.return, t);
						}
					}
					break;
				case 3:
					if (c = Kt(), Xu) {
						od();
						var l = hg;
						hg = Qu(t.containerInfo), Oo(t, e), hg = l;
					} else Oo(t, e);
					if (Ao(e), s & 4) {
						if (ll && dl && o !== null && o.memoizedState.isDehydrated) try {
							F(e, Fu, t.containerInfo);
						} catch (t) {
							Vs(e, e.return, t);
						}
						if (ul) {
							s = t.containerInfo, o = t.pendingChildren;
							try {
								F(e, cu, s, o);
							} catch (t) {
								Vs(e, e.return, t);
							}
						}
					}
					cg && (cg = !1, jo(e)), t.effectDuration += qt(c);
					break;
				case 4:
					Xu ? (o = hg, hg = Qu(e.stateNode.containerInfo), Oo(t, e), Ao(e), hg = o) : (Oo(t, e), Ao(e)), s & 4 && ul && go(e.stateNode, e, e.stateNode.pendingChildren);
					break;
				case 12:
					s = Kt(), Oo(t, e), Ao(e), e.stateNode.effectDuration += Jt(s);
					break;
				case 31:
					Oo(t, e), Ao(e), s & 4 && (s = e.updateQueue, s !== null && (e.updateQueue = null, Do(e, s)));
					break;
				case 13:
					Oo(t, e), Ao(e), e.child.flags & 8192 && e.memoizedState !== null != (o !== null && o.memoizedState !== null) && (d_ = Ad()), s & 4 && (s = e.updateQueue, s !== null && (e.updateQueue = null, Do(e, s)));
					break;
				case 22:
					c = e.memoizedState !== null;
					var u = o !== null && o.memoizedState !== null, d = og, f = sg;
					if (og = d || c, sg = f || u, Oo(t, e), sg = f, og = d, u && !c && !d && !f && (e.mode & 2) !== q && 0 <= J && 0 <= Y && .05 < Y - J && we(e, J, Y), Ao(e), s & 8192 && (t = e.stateNode, t._visibility = c ? t._visibility & ~Im : t._visibility | Im, !c || o === null || u || og || sg || (Po(e), (e.mode & 2) !== q && 0 <= J && 0 <= Y && .05 < Y - J && Ce(e, J, Y, "Disconnect")), ll)) {
						a: if (o = null, ll) for (t = e;;) {
							if (t.tag === 5 || Xu && t.tag === 26) {
								if (o === null) {
									u = o = t;
									try {
										l = u.stateNode, c ? F(u, $l, l) : F(u, tu, u.stateNode, u.memoizedProps);
									} catch (e) {
										Vs(u, u.return, e);
									}
								}
							} else if (t.tag === 6) {
								if (o === null) {
									u = t;
									try {
										var p = u.stateNode;
										c ? F(u, eu, p) : F(u, nu, p, u.memoizedProps);
									} catch (e) {
										Vs(u, u.return, e);
									}
								}
							} else if (t.tag === 18) {
								if (o === null) {
									u = t;
									try {
										var m = u.stateNode;
										c ? F(u, Hu, m) : F(u, Uu, u.stateNode);
									} catch (e) {
										Vs(u, u.return, e);
									}
								}
							} else if ((t.tag !== 22 && t.tag !== 23 || t.memoizedState === null || t === e) && t.child !== null) {
								t.child.return = t, t = t.child;
								continue;
							}
							if (t === e) break a;
							for (; t.sibling === null;) {
								if (t.return === null || t.return === e) break a;
								o === t && (o = null), t = t.return;
							}
							o === t && (o = null), t.sibling.return = t.return, t = t.sibling;
						}
					}
					s & 4 && (s = e.updateQueue, s !== null && (o = s.retryQueue, o !== null && (s.retryQueue = null, Do(e, o))));
					break;
				case 19:
					Oo(t, e), Ao(e), s & 4 && (s = e.updateQueue, s !== null && (e.updateQueue = null, Do(e, s)));
					break;
				case 30: break;
				case 21: break;
				default: Oo(t, e), Ao(e);
			}
			(e.mode & 2) !== q && 0 <= J && 0 <= Y && ((op || .05 < ip) && M(e, J, Y, ip, ap), e.alternate === null && e.return !== null && e.return.alternate !== null && .05 < Y - J && (vo(e.return.alternate, e.return) || Ce(e, J, Y, "Mount"))), Zt(n), $t(r), ap = i, op = a;
		}
		function Ao(e) {
			var t = e.flags;
			if (t & 2) {
				try {
					F(e, ho, e);
				} catch (t) {
					Vs(e, e.return, t);
				}
				e.flags &= -3;
			}
			t & 4096 && (e.flags &= -4097);
		}
		function jo(e) {
			if (e.subtreeFlags & 1024) for (e = e.child; e !== null;) {
				var t = e;
				jo(t), t.tag === 5 && t.flags & 1024 && Ml(t.stateNode), e = e.sibling;
			}
		}
		function Mo(e, t) {
			if (t.subtreeFlags & 8772) for (t = t.child; t !== null;) bo(e, t.alternate, t), t = t.sibling;
		}
		function No(e) {
			var t = Xt(), n = Qt(), r = en(), i = tn();
			switch (e.tag) {
				case 0:
				case 11:
				case 14:
				case 15:
					Ya(e, e.return, ah), Po(e);
					break;
				case 1:
					ao(e, e.return);
					var a = e.stateNode;
					typeof a.componentWillUnmount == "function" && no(e, e.return, a), Po(e);
					break;
				case 27: ud && F(e, pd, e.stateNode);
				case 26:
				case 5:
					ao(e, e.return), Po(e);
					break;
				case 22:
					e.memoizedState === null && Po(e);
					break;
				case 30:
					Po(e);
					break;
				default: Po(e);
			}
			(e.mode & 2) !== q && 0 <= J && 0 <= Y && (op || .05 < ip) && M(e, J, Y, ip, ap), Zt(t), $t(n), ap = r, op = i;
		}
		function Po(e) {
			for (e = e.child; e !== null;) No(e), e = e.sibling;
		}
		function Fo(e, t, n, r) {
			var i = Xt(), a = Qt(), o = en(), s = tn(), c = n.flags;
			switch (n.tag) {
				case 0:
				case 11:
				case 15:
					Io(e, n, r), Ja(n, ah);
					break;
				case 1:
					if (Io(e, n, r), t = n.stateNode, typeof t.componentDidMount == "function" && F(n, cm, n, t), t = n.updateQueue, t !== null) {
						e = n.stateNode;
						try {
							F(n, sr, t, e);
						} catch (e) {
							Vs(n, n.return, e);
						}
					}
					r && c & 64 && $a(n), io(n, n.return);
					break;
				case 27: ud && _o(n);
				case 26:
				case 5:
					Io(e, n, r), r && t === null && c & 4 && co(n), io(n, n.return);
					break;
				case 12:
					if (r && c & 4) {
						c = Kt(), Io(e, n, r), r = n.stateNode, r.effectDuration += Jt(c);
						try {
							F(n, oo, n, t, $f, r.effectDuration);
						} catch (e) {
							Vs(n, n.return, e);
						}
					} else Io(e, n, r);
					break;
				case 31:
					Io(e, n, r), r && c & 4 && wo(e, n);
					break;
				case 13:
					Io(e, n, r), r && c & 4 && To(e, n);
					break;
				case 22:
					n.memoizedState === null && Io(e, n, r), io(n, n.return);
					break;
				case 30: break;
				default: Io(e, n, r);
			}
			(n.mode & 2) !== q && 0 <= J && 0 <= Y && (op || .05 < ip) && M(n, J, Y, ip, ap), Zt(i), $t(a), ap = o, op = s;
		}
		function Io(e, t, n) {
			for (n &&= (t.subtreeFlags & 8772) != 0, t = t.child; t !== null;) Fo(e, t.alternate, t, n), t = t.sibling;
		}
		function Lo(e, t) {
			var n = null;
			e !== null && e.memoizedState !== null && e.memoizedState.cachePool !== null && (n = e.memoizedState.cachePool.pool), e = null, t.memoizedState !== null && t.memoizedState.cachePool !== null && (e = t.memoizedState.cachePool.pool), e !== n && (e != null && Ht(e), n != null && Ut(n));
		}
		function Ro(e, t) {
			e = null, t.alternate !== null && (e = t.alternate.memoizedState.cache), t = t.memoizedState.cache, t !== e && (Ht(t), e != null && Ut(e));
		}
		function zo(e, t, n, r, i) {
			if (t.subtreeFlags & 10256 || t.actualDuration !== 0 && (t.alternate === null || t.alternate.child !== t.child)) for (t = t.child; t !== null;) {
				var a = t.sibling;
				Bo(e, t, n, r, a === null ? i : a.actualStartTime), t = a;
			}
		}
		function Bo(e, t, n, r, i) {
			var a = Xt(), o = Qt(), s = en(), c = tn(), l = Xd, u = t.flags;
			switch (t.tag) {
				case 0:
				case 11:
				case 15:
					(t.mode & 2) !== q && 0 < t.actualStartTime && t.flags & 1 && Te(t, t.actualStartTime, i, gg, n), zo(e, t, n, r, i), u & 2048 && Za(t, oh | rh);
					break;
				case 1:
					(t.mode & 2) !== q && 0 < t.actualStartTime && (t.flags & 128 ? Ee(t, t.actualStartTime, i, []) : t.flags & 1 && Te(t, t.actualStartTime, i, gg, n)), zo(e, t, n, r, i);
					break;
				case 3:
					var d = Kt(), f = gg;
					gg = t.alternate !== null && t.alternate.memoizedState.isDehydrated && (t.flags & 256) == 0, zo(e, t, n, r, i), gg = f, u & 2048 && (n = null, t.alternate !== null && (n = t.alternate.memoizedState.cache), r = t.memoizedState.cache, r !== n && (Ht(r), n != null && Ut(n))), e.passiveEffectDuration += qt(d);
					break;
				case 12:
					if (u & 2048) {
						u = Kt(), zo(e, t, n, r, i), e = t.stateNode, e.passiveEffectDuration += Jt(u);
						try {
							F(t, so, t, t.alternate, $f, e.passiveEffectDuration);
						} catch (e) {
							Vs(t, t.return, e);
						}
					} else zo(e, t, n, r, i);
					break;
				case 31:
					u = gg, d = t.alternate === null ? null : t.alternate.memoizedState, f = t.memoizedState, d !== null && f === null ? (f = t.deletions, f !== null && 0 < f.length && f[0].tag === 18 ? (gg = !1, d = d.hydrationErrors, d !== null && Ee(t, t.actualStartTime, i, d)) : gg = !0) : gg = !1, zo(e, t, n, r, i), gg = u;
					break;
				case 13:
					u = gg, d = t.alternate === null ? null : t.alternate.memoizedState, f = t.memoizedState, d === null || d.dehydrated === null || f !== null && f.dehydrated !== null ? gg = !1 : (f = t.deletions, f !== null && 0 < f.length && f[0].tag === 18 ? (gg = !1, d = d.hydrationErrors, d !== null && Ee(t, t.actualStartTime, i, d)) : gg = !0), zo(e, t, n, r, i), gg = u;
					break;
				case 23: break;
				case 22:
					f = t.stateNode, d = t.alternate, t.memoizedState === null ? f._visibility & Lm ? zo(e, t, n, r, i) : (f._visibility |= Lm, Vo(e, t, n, r, (t.subtreeFlags & 10256) != 0 || t.actualDuration !== 0 && (t.alternate === null || t.alternate.child !== t.child), i), (t.mode & 2) === q || gg || (e = t.actualStartTime, 0 <= e && .05 < i - e && we(t, e, i), 0 <= J && 0 <= Y && .05 < Y - J && we(t, J, Y))) : f._visibility & Lm ? zo(e, t, n, r, i) : Uo(e, t, n, r, i), u & 2048 && Lo(d, t);
					break;
				case 24:
					zo(e, t, n, r, i), u & 2048 && Ro(t.alternate, t);
					break;
				default: zo(e, t, n, r, i);
			}
			(t.mode & 2) !== q && ((e = !gg && t.alternate === null && t.return !== null && t.return.alternate !== null) && (n = t.actualStartTime, 0 <= n && .05 < i - n && Ce(t, n, i, "Mount")), 0 <= J && 0 <= Y && ((op || .05 < ip) && M(t, J, Y, ip, ap), e && .05 < Y - J && Ce(t, J, Y, "Mount"))), Zt(a), $t(o), ap = s, op = c, Xd = l;
		}
		function Vo(e, t, n, r, i, a) {
			for (i &&= (t.subtreeFlags & 10256) != 0 || t.actualDuration !== 0 && (t.alternate === null || t.alternate.child !== t.child), t = t.child; t !== null;) {
				var o = t.sibling;
				Ho(e, t, n, r, i, o === null ? a : o.actualStartTime), t = o;
			}
		}
		function Ho(e, t, n, r, i, a) {
			var o = Xt(), s = Qt(), c = en(), l = tn(), u = Xd;
			i && (t.mode & 2) !== q && 0 < t.actualStartTime && t.flags & 1 && Te(t, t.actualStartTime, a, gg, n);
			var d = t.flags;
			switch (t.tag) {
				case 0:
				case 11:
				case 15:
					Vo(e, t, n, r, i, a), Za(t, oh);
					break;
				case 23: break;
				case 22:
					var f = t.stateNode;
					t.memoizedState === null ? (f._visibility |= Lm, Vo(e, t, n, r, i, a)) : f._visibility & Lm ? Vo(e, t, n, r, i, a) : Uo(e, t, n, r, a), i && d & 2048 && Lo(t.alternate, t);
					break;
				case 24:
					Vo(e, t, n, r, i, a), i && d & 2048 && Ro(t.alternate, t);
					break;
				default: Vo(e, t, n, r, i, a);
			}
			(t.mode & 2) !== q && 0 <= J && 0 <= Y && (op || .05 < ip) && M(t, J, Y, ip, ap), Zt(o), $t(s), ap = c, op = l, Xd = u;
		}
		function Uo(e, t, n, r, i) {
			if (t.subtreeFlags & 10256 || t.actualDuration !== 0 && (t.alternate === null || t.alternate.child !== t.child)) for (var a = t.child; a !== null;) {
				t = a.sibling;
				var o = e, s = n, c = r, l = t === null ? i : t.actualStartTime, u = Xd;
				(a.mode & 2) !== q && 0 < a.actualStartTime && a.flags & 1 && Te(a, a.actualStartTime, l, gg, s);
				var d = a.flags;
				switch (a.tag) {
					case 22:
						Uo(o, a, s, c, l), d & 2048 && Lo(a.alternate, a);
						break;
					case 24:
						Uo(o, a, s, c, l), d & 2048 && Ro(a.alternate, a);
						break;
					default: Uo(o, a, s, c, l);
				}
				Xd = u, a = t;
			}
		}
		function Wo(e, t, n) {
			if (e.subtreeFlags & _g) for (e = e.child; e !== null;) Go(e, t, n), e = e.sibling;
		}
		function Go(e, t, n) {
			switch (e.tag) {
				case 26:
					if (Wo(e, t, n), e.flags & _g) if (e.memoizedState !== null) ld(n, hg, e.memoizedState, e.memoizedProps);
					else {
						var r = e.stateNode, i = e.type;
						e = e.memoizedProps, ((t & 335544128) === t || wl(i, e)) && Dl(n, r, i, e);
					}
					break;
				case 5:
					Wo(e, t, n), e.flags & _g && (r = e.stateNode, i = e.type, e = e.memoizedProps, ((t & 335544128) === t || wl(i, e)) && Dl(n, r, i, e));
					break;
				case 3:
				case 4:
					Xu ? (r = hg, hg = Qu(e.stateNode.containerInfo), Wo(e, t, n), hg = r) : Wo(e, t, n);
					break;
				case 22:
					e.memoizedState === null && (r = e.alternate, r !== null && r.memoizedState !== null ? (r = _g, _g = 16777216, Wo(e, t, n), _g = r) : Wo(e, t, n));
					break;
				default: Wo(e, t, n);
			}
		}
		function Ko(e) {
			var t = e.alternate;
			if (t !== null && (e = t.child, e !== null)) {
				t.child = null;
				do
					t = e.sibling, e.sibling = null, e = t;
				while (e !== null);
			}
		}
		function qo(e) {
			var t = e.deletions;
			if (e.flags & 16) {
				if (t !== null) for (var n = 0; n < t.length; n++) {
					var r = t[n], i = Xt();
					ug = r, Zo(r, e), (r.mode & 2) !== q && 0 <= J && 0 <= Y && .05 < Y - J && Ce(r, J, Y, "Unmount"), Zt(i);
				}
				Ko(e);
			}
			if (e.subtreeFlags & 10256) for (e = e.child; e !== null;) Jo(e), e = e.sibling;
		}
		function Jo(e) {
			var t = Xt(), n = Qt(), r = en(), i = tn();
			switch (e.tag) {
				case 0:
				case 11:
				case 15:
					qo(e), e.flags & 2048 && Qa(e, e.return, oh | rh);
					break;
				case 3:
					var a = Kt();
					qo(e), e.stateNode.passiveEffectDuration += qt(a);
					break;
				case 12:
					a = Kt(), qo(e), e.stateNode.passiveEffectDuration += Jt(a);
					break;
				case 22:
					a = e.stateNode, e.memoizedState !== null && a._visibility & Lm && (e.return === null || e.return.tag !== 13) ? (a._visibility &= ~Lm, Yo(e), (e.mode & 2) !== q && 0 <= J && 0 <= Y && .05 < Y - J && Ce(e, J, Y, "Disconnect")) : qo(e);
					break;
				default: qo(e);
			}
			(e.mode & 2) !== q && 0 <= J && 0 <= Y && (op || .05 < ip) && M(e, J, Y, ip, ap), Zt(t), $t(n), op = i, ap = r;
		}
		function Yo(e) {
			var t = e.deletions;
			if (e.flags & 16) {
				if (t !== null) for (var n = 0; n < t.length; n++) {
					var r = t[n], i = Xt();
					ug = r, Zo(r, e), (r.mode & 2) !== q && 0 <= J && 0 <= Y && .05 < Y - J && Ce(r, J, Y, "Unmount"), Zt(i);
				}
				Ko(e);
			}
			for (e = e.child; e !== null;) Xo(e), e = e.sibling;
		}
		function Xo(e) {
			var t = Xt(), n = Qt(), r = en(), i = tn();
			switch (e.tag) {
				case 0:
				case 11:
				case 15:
					Qa(e, e.return, oh), Yo(e);
					break;
				case 22:
					var a = e.stateNode;
					a._visibility & Lm && (a._visibility &= ~Lm, Yo(e));
					break;
				default: Yo(e);
			}
			(e.mode & 2) !== q && 0 <= J && 0 <= Y && (op || .05 < ip) && M(e, J, Y, ip, ap), Zt(t), $t(n), op = i, ap = r;
		}
		function Zo(e, t) {
			for (; ug !== null;) {
				var n = ug, r = n, i = t, a = Xt(), o = Qt(), s = en(), c = tn();
				switch (r.tag) {
					case 0:
					case 11:
					case 15:
						Qa(r, i, oh);
						break;
					case 23:
					case 22:
						r.memoizedState !== null && r.memoizedState.cachePool !== null && (i = r.memoizedState.cachePool.pool, i != null && Ht(i));
						break;
					case 24: Ut(r.memoizedState.cache);
				}
				if ((r.mode & 2) !== q && 0 <= J && 0 <= Y && (op || .05 < ip) && M(r, J, Y, ip, ap), Zt(a), $t(o), op = c, ap = s, r = n.child, r !== null) r.return = n, ug = r;
				else a: for (n = e; ug !== null;) {
					if (r = ug, a = r.sibling, o = r.return, xo(r), r === n) {
						ug = null;
						break a;
					}
					if (a !== null) {
						a.return = o, ug = a;
						break a;
					}
					ug = o;
				}
			}
		}
		function Qo(e) {
			var t = fl(e);
			if (t != null) {
				if (typeof t.memoizedProps["data-testname"] != "string") throw Error("Invalid host root specified. Should be either a React container or a node with a testname attribute.");
				return t;
			}
			if (e = Ll(e), e === null) throw Error("Could not find React container within specified host subtree.");
			return e.stateNode.current;
		}
		function $o(e, t) {
			var n = e.tag;
			switch (t.$$typeof) {
				case yg:
					if (e.type === t.value) return !0;
					break;
				case bg:
					a: {
						for (t = t.value, e = [e, 0], n = 0; n < e.length;) {
							var r = e[n++], i = r.tag, a = e[n++], o = t[a];
							if (i !== 5 && i !== 26 && i !== 27 || !Bl(r)) {
								for (; o != null && $o(r, o);) a++, o = t[a];
								if (a === t.length) {
									t = !0;
									break a;
								} else for (r = r.child; r !== null;) e.push(r, a), r = r.sibling;
							}
						}
						t = !1;
					}
					return t;
				case xg:
					if ((n === 5 || n === 26 || n === 27) && Vl(e.stateNode, t.value)) return !0;
					break;
				case Cg:
					if ((n === 5 || n === 6 || n === 26 || n === 27) && (e = zl(e), e !== null && 0 <= e.indexOf(t.value))) return !0;
					break;
				case Sg:
					if ((n === 5 || n === 26 || n === 27) && (e = e.memoizedProps["data-testname"], typeof e == "string" && e.toLowerCase() === t.value.toLowerCase())) return !0;
					break;
				default: throw Error("Invalid selector type specified.");
			}
			return !1;
		}
		function es(e) {
			switch (e.$$typeof) {
				case yg: return "<" + (C(e.value) || "Unknown") + ">";
				case bg: return ":has(" + (es(e) || "") + ")";
				case xg: return "[role=\"" + e.value + "\"]";
				case Cg: return "\"" + e.value + "\"";
				case Sg: return "[data-testname=\"" + e.value + "\"]";
				default: throw Error("Invalid selector type specified.");
			}
		}
		function ts(e, t) {
			var n = [];
			e = [e, 0];
			for (var r = 0; r < e.length;) {
				var i = e[r++], a = i.tag, o = e[r++], s = t[o];
				if (a !== 5 && a !== 26 && a !== 27 || !Bl(i)) {
					for (; s != null && $o(i, s);) o++, s = t[o];
					if (o === t.length) n.push(i);
					else for (i = i.child; i !== null;) e.push(i, o), i = i.sibling;
				}
			}
			return n;
		}
		function ns(e, t) {
			if (!Il) throw Error("Test selector API is not supported by this renderer.");
			e = Qo(e), e = ts(e, t), t = [], e = Array.from(e);
			for (var n = 0; n < e.length;) {
				var r = e[n++], i = r.tag;
				if (i === 5 || i === 26 || i === 27) Bl(r) || t.push(r.stateNode);
				else for (r = r.child; r !== null;) e.push(r), r = r.sibling;
			}
			return t;
		}
		function rs() {
			Il && Tg.forEach(function(e) {
				return e();
			});
		}
		function is() {
			var e = typeof IS_REACT_ACT_ENVIRONMENT < "u" ? IS_REACT_ACT_ENVIRONMENT : void 0;
			return e || G.actQueue === null || console.error("The current testing environment is not configured to support act(...)"), e;
		}
		function as(e) {
			if ((Lg & Og) !== Dg && $ !== 0) return $ & -$;
			var t = G.T;
			return t === null ? gl() : (t._updatedFibers ||= /* @__PURE__ */ new Set(), t._updatedFibers.add(e), bn());
		}
		function os() {
			if (o_ === 0) if (!($ & 536870912) || Nf) {
				var e = wd;
				wd <<= 1, !(wd & 3932160) && (wd = 262144), o_ = e;
			} else o_ = 536870912;
			return e = Zm.current, e !== null && (e.flags |= 32), o_;
		}
		function ss(e, t, n) {
			if (J_ && console.error("useInsertionEffect must not schedule updates."), U_ && (W_ = !0), (e === Rg && (Xg === Hg || Xg === Yg) || e.cancelPendingCommit !== null) && (gs(e, 0), ds(e, $, o_, !1)), se(e, n), (Lg & Og) !== Dg && e === Rg) {
				if (Af) switch (t.tag) {
					case 0:
					case 11:
					case 15:
						e = zg && w(zg) || "Unknown", Z_.has(e) || (Z_.add(e), t = w(t) || "Unknown", console.error("Cannot update a component (`%s`) while rendering a different component (`%s`). To locate the bad setState() call inside `%s`, follow the stack trace as described in https://react.dev/link/setstate-in-render", t, e, e));
						break;
					case 1: X_ ||= (console.error("Cannot update during an existing state transition (such as within `render`). Render methods should be a pure function of props and state."), !0);
				}
			} else Bd && pe(e, t, n), $s(t), e === Rg && ((Lg & Og) === Dg && (i_ |= n), n_ === Pg && ds(e, $, o_, !1)), dn(e);
		}
		function cs(e, t, n) {
			if ((Lg & (Og | kg)) !== Dg) throw Error("Should not already be working.");
			if ($ !== 0 && zg !== null) {
				var r = zg, i = Ad();
				switch (kp) {
					case Ug:
					case Hg:
						var a = Ap;
						Jd && ((r = r._debugTask) ? r.run(console.timeStamp.bind(console, "Suspended", a, i, "Components ⚛", void 0, "primary-light")) : console.timeStamp("Suspended", a, i, "Components ⚛", void 0, "primary-light"));
						break;
					case Yg:
						a = Ap, Jd && ((r = r._debugTask) ? r.run(console.timeStamp.bind(console, "Action", a, i, "Components ⚛", void 0, "primary-light")) : console.timeStamp("Action", a, i, "Components ⚛", void 0, "primary-light"));
						break;
					default: Jd && (r = i - Ap, 3 > r || console.timeStamp("Blocked", Ap, i, "Components ⚛", void 0, 5 > r ? "primary-light" : 10 > r ? "primary" : 100 > r ? "primary-dark" : "error"));
				}
			}
			a = (n = !n && (t & 127) == 0 && (t & e.expiredLanes) === 0 || O(e, t)) ? ws(e, t) : Ss(e, t, !0);
			var o = n;
			do {
				if (a === Ag) {
					$g && !n && ds(e, t, 0, !1), t = Xg, Ap = Xf(), kp = t;
					break;
				} else {
					if (r = Ad(), i = e.current.alternate, o && !us(i)) {
						Se(t), i = Qf, a = r, !Jd || a <= i || (__ ? __.run(console.timeStamp.bind(console, "Teared Render", i, a, Yd, "Scheduler ⚛", "error")) : console.timeStamp("Teared Render", i, a, Yd, "Scheduler ⚛", "error")), hs(t, r), a = Ss(e, t, !1), o = !1;
						continue;
					}
					if (a === Mg) {
						if (o = t, e.errorRecoveryDisabledLanes & o) var s = 0;
						else s = e.pendingLanes & -536870913, s = s === 0 ? s & 536870912 ? 536870912 : 0 : s;
						if (s !== 0) {
							Se(t), je(Qf, r, t, __), hs(t, r), t = s;
							a: {
								r = e, a = o, o = c_;
								var c = dl && r.current.memoizedState.isDehydrated;
								if (c && (gs(r, s).flags |= 256), s = Ss(r, s, !1), s !== Mg) {
									if (e_ && !c) {
										r.errorRecoveryDisabledLanes |= a, i_ |= a, a = Pg;
										break a;
									}
									r = l_, l_ = o, r !== null && (l_ === null ? l_ = r : l_.push.apply(l_, r));
								}
								a = s;
							}
							if (o = !1, a !== Mg) continue;
							r = Ad();
						}
					}
					if (a === jg) {
						Se(t), je(Qf, r, t, __), hs(t, r), gs(e, 0), ds(e, t, 0, !0);
						break;
					}
					a: {
						switch (n = e, a) {
							case Ag:
							case jg: throw Error("Root did not complete. This is a bug in React.");
							case Pg: if ((t & 4194048) !== t) break;
							case Fg:
								Se(t), Oe(Qf, r, t, __), hs(t, r), i = t, i & 127 ? gp = r : i & 4194048 && (Dp = r), ds(n, t, o_, !Qg);
								break a;
							case Mg:
								l_ = null;
								break;
							case Ng:
							case Ig: break;
							default: throw Error("Unknown root exit status.");
						}
						if (G.actQueue !== null) Ms(n, i, t, l_, g_, u_, o_, i_, s_, a, null, null, Qf, r);
						else {
							if ((t & 62914560) === t && (o = d_ + p_ - Ad(), 10 < o)) {
								if (ds(n, t, o_, !Qg), D(n, 0, !0) !== 0) break a;
								M_ = t, n.timeoutHandle = al(ls.bind(null, n, i, l_, g_, u_, t, o_, i_, s_, Qg, a, "Throttled", Qf, r), o);
								break a;
							}
							ls(n, i, l_, g_, u_, t, o_, i_, s_, Qg, a, null, Qf, r);
						}
					}
				}
				break;
			} while (1);
			dn(e);
		}
		function ls(e, t, n, r, i, a, o, s, c, l, u, d, f, p) {
			e.timeoutHandle = sl;
			var m = t.subtreeFlags, h = null;
			if ((m & 8192 || (m & 16785408) == 16785408) && (h = El(), Go(t, a, h), m = (a & 62914560) === a ? d_ - Ad() : (a & 4194048) === a ? f_ - Ad() : 0, m = Ol(h, m), m !== null)) {
				M_ = a, e.cancelPendingCommit = m(Ms.bind(null, e, t, a, n, r, i, o, s, c, u, h, kl(h, e.containerInfo), f, p)), ds(e, a, o, !l);
				return;
			}
			Ms(e, t, a, n, r, i, o, s, c, u, h, d, f, p);
		}
		function us(e) {
			for (var t = e;;) {
				var n = t.tag;
				if ((n === 0 || n === 11 || n === 15) && t.flags & 16384 && (n = t.updateQueue, n !== null && (n = n.stores, n !== null))) for (var r = 0; r < n.length; r++) {
					var i = n[r], a = i.getSnapshot;
					i = i.value;
					try {
						if (!Gd(a(), i)) return !1;
					} catch {
						return !1;
					}
				}
				if (n = t.child, t.subtreeFlags & 16384 && n !== null) n.return = t, t = n;
				else {
					if (t === e) break;
					for (; t.sibling === null;) {
						if (t.return === null || t.return === e) return !0;
						t = t.return;
					}
					t.sibling.return = t.return, t = t.sibling;
				}
			}
			return !0;
		}
		function ds(e, t, n, r) {
			t &= ~a_, t &= ~i_, e.suspendedLanes |= t, e.pingedLanes &= ~t, r && (e.warmLanes |= t), r = e.expirationTimes;
			for (var i = t; 0 < i;) {
				var a = 31 - bd(i), o = 1 << a;
				r[a] = -1, i &= ~o;
			}
			n !== 0 && le(e, n, t);
		}
		function fs() {
			return (Lg & (Og | kg)) === Dg ? (fn(0, !1), !1) : !0;
		}
		function ps() {
			return (Lg & (Og | kg)) !== Dg;
		}
		function ms() {
			if (zg !== null) {
				if (Xg === Bg) var e = zg.return;
				else e = zg, I(), Or(e), Dm = null, Om = 0, e = zg;
				for (; e !== null;) Ka(e.alternate, e), e = e.return;
				zg = null;
			}
		}
		function hs(e, t) {
			e & 127 && (sp = t), e & 4194048 && (_p = t);
		}
		function gs(e, t) {
			Jd && (console.timeStamp("Blocking Track", .003, .003, "Blocking", "Scheduler ⚛", "primary-light"), console.timeStamp("Transition Track", .003, .003, "Transition", "Scheduler ⚛", "primary-light"), console.timeStamp("Suspense Track", .003, .003, "Suspense", "Scheduler ⚛", "primary-light"), console.timeStamp("Idle Track", .003, .003, "Idle", "Scheduler ⚛", "primary-light"));
			var n = Qf;
			if (Qf = Xf(), $ !== 0 && 0 < n) {
				if (Se($), n_ === Ng || n_ === Pg) Oe(n, Qf, t, __);
				else {
					var r = Qf, i = __;
					if (Jd && !(r <= n)) {
						var a = (t & 738197653) === t ? "tertiary-dark" : "primary-dark", o = (t & 536870912) === t ? "Prewarm" : (t & 201326741) === t ? "Interrupted Hydration" : "Interrupted Render";
						i ? i.run(console.timeStamp.bind(console, o, n, r, Yd, "Scheduler ⚛", a)) : console.timeStamp(o, n, r, Yd, "Scheduler ⚛", a);
					}
				}
				hs($, Qf);
			}
			if (n = __, __ = null, t & 127) {
				__ = lp, i = 0 <= cp && cp < sp ? sp : cp, r = 0 <= pp && pp < sp ? sp : pp, a = 0 <= r ? r : 0 <= i ? i : Qf, 0 <= gp && (Se(2), ke(gp, a, t, n)), n = i;
				var s = r, c = mp, l = 0 < hp, u = up === 1, d = up === 2;
				if (i = Qf, r = lp, a = dp, o = fp, Jd) {
					if (Yd = "Blocking", 0 < n ? n > i && (n = i) : n = i, 0 < s ? s > n && (s = n) : s = n, c !== null && n > s) {
						var f = l ? "secondary-light" : "warning";
						r ? r.run(console.timeStamp.bind(console, l ? "Consecutive" : "Event: " + c, s, n, Yd, "Scheduler ⚛", f)) : console.timeStamp(l ? "Consecutive" : "Event: " + c, s, n, Yd, "Scheduler ⚛", f);
					}
					i > n && (s = u ? "error" : (t & 738197653) === t ? "tertiary-light" : "primary-light", u = d ? "Promise Resolved" : u ? "Cascading Update" : 5 < i - n ? "Update Blocked" : "Update", d = [], o != null && d.push(["Component name", o]), a != null && d.push(["Method name", a]), n = {
						start: n,
						end: i,
						detail: { devtools: {
							properties: d,
							track: Yd,
							trackGroup: "Scheduler ⚛",
							color: s
						} }
					}, r ? r.run(performance.measure.bind(performance, u, n)) : performance.measure(u, n));
				}
				cp = -1.1, up = 0, fp = dp = null, gp = -1.1, hp = pp, pp = -1.1, sp = Xf();
			}
			if (t & 4194048 && (__ = xp, i = 0 <= vp && vp < _p ? _p : vp, n = 0 <= yp && yp < _p ? _p : yp, r = 0 <= wp && wp < _p ? _p : wp, a = 0 <= r ? r : 0 <= n ? n : Qf, 0 <= Dp && (Se(256), ke(Dp, a, t, __)), d = r, s = Tp, c = 0 < Ep, l = bp === 2, a = Qf, r = xp, o = Sp, u = Cp, Jd && (Yd = "Transition", 0 < n ? n > a && (n = a) : n = a, 0 < i ? i > n && (i = n) : i = n, 0 < d ? d > i && (d = i) : d = i, i > d && s !== null && (f = c ? "secondary-light" : "warning", r ? r.run(console.timeStamp.bind(console, c ? "Consecutive" : "Event: " + s, d, i, Yd, "Scheduler ⚛", f)) : console.timeStamp(c ? "Consecutive" : "Event: " + s, d, i, Yd, "Scheduler ⚛", f)), n > i && (r ? r.run(console.timeStamp.bind(console, "Action", i, n, Yd, "Scheduler ⚛", "primary-dark")) : console.timeStamp("Action", i, n, Yd, "Scheduler ⚛", "primary-dark")), a > n && (i = l ? "Promise Resolved" : 5 < a - n ? "Update Blocked" : "Update", d = [], u != null && d.push(["Component name", u]), o != null && d.push(["Method name", o]), n = {
				start: n,
				end: a,
				detail: { devtools: {
					properties: d,
					track: Yd,
					trackGroup: "Scheduler ⚛",
					color: "primary-light"
				} }
			}, r ? r.run(performance.measure.bind(performance, i, n)) : performance.measure(i, n))), yp = vp = -1.1, bp = 0, Dp = -1.1, Ep = wp, wp = -1.1, _p = Xf()), n = e.timeoutHandle, n !== sl && (e.timeoutHandle = sl, ol(n)), n = e.cancelPendingCommit, n !== null && (e.cancelPendingCommit = null, n()), M_ = 0, ms(), Rg = e, zg = n = sc(e.current, null), $ = t, Xg = Bg, Zg = null, Qg = !1, $g = O(e, t), e_ = !1, n_ = Ag, s_ = o_ = a_ = i_ = r_ = 0, l_ = c_ = null, u_ = !1, t & 8 && (t |= t & 32), r = e.entangledLanes, r !== 0) for (e = e.entanglements, r &= t; 0 < r;) i = 31 - bd(r), a = 1 << i, t |= e[i], r &= ~a;
			return t_ = t, Kn(), e = Ud(), 1e3 < e - Vd && (G.recentlyCreatedOwnerStacks = 0, Vd = e), qp.discardPendingWarnings(), n;
		}
		function _s(e, t) {
			Z = null, G.H = Eh, G.getCurrentStack = null, Af = !1, kf = null, t === xm || t === Cm ? (t = Mn(), Xg = Ug) : t === Sm ? (t = Mn(), Xg = Wg) : Xg = t === Jh ? Jg : typeof t == "object" && t && typeof t.then == "function" ? Kg : Vg, Zg = t;
			var n = zg;
			n === null ? (n_ = jg, Zi(e, Ue(t, e.current))) : n.mode & 2 && rn(n);
		}
		function vs() {
			var e = Zm.current;
			return e === null ? !0 : ($ & 4194048) === $ ? Qm === null : ($ & 62914560) === $ || $ & 536870912 ? e === Qm : !1;
		}
		function ys() {
			var e = G.H;
			return G.H = Eh, e === null ? Eh : e;
		}
		function W() {
			var e = G.A;
			return G.A = vg, e;
		}
		function bs(e) {
			__ === null && (__ = e._debugTask == null ? null : e._debugTask);
		}
		function xs() {
			n_ = Pg, Qg || ($ & 4194048) !== $ && Zm.current !== null || ($g = !0), !(r_ & 134217727) && !(i_ & 134217727) || Rg === null || ds(Rg, $, o_, !1);
		}
		function Ss(e, t, n) {
			var r = Lg;
			Lg |= Og;
			var i = ys(), a = W();
			if (Rg !== e || $ !== t) {
				if (Bd) {
					var o = e.memoizedUpdaters;
					0 < o.size && (Zs(e, $), o.clear()), me(e, t);
				}
				g_ = null, gs(e, t);
			}
			t = !1, o = n_;
			a: do
				try {
					if (Xg !== Bg && zg !== null) {
						var s = zg, c = Zg;
						switch (Xg) {
							case Jg:
								ms(), o = Fg;
								break a;
							case Ug:
							case Hg:
							case Yg:
							case Kg:
								Zm.current === null && (t = !0);
								var l = Xg;
								if (Xg = Bg, Zg = null, ks(e, s, c, l), n && $g) {
									o = Ag;
									break a;
								}
								break;
							default: l = Xg, Xg = Bg, Zg = null, ks(e, s, c, l);
						}
					}
					Cs(), o = n_;
					break;
				} catch (t) {
					_s(e, t);
				}
			while (1);
			return t && e.shellSuspendCounter++, I(), Lg = r, G.H = i, G.A = a, zg === null && (Rg = null, $ = 0, Kn()), o;
		}
		function Cs() {
			for (; zg !== null;) Es(zg);
		}
		function ws(e, t) {
			var n = Lg;
			Lg |= Og;
			var r = ys(), i = W();
			if (Rg !== e || $ !== t) {
				if (Bd) {
					var a = e.memoizedUpdaters;
					0 < a.size && (Zs(e, $), a.clear()), me(e, t);
				}
				g_ = null, m_ = Ad() + h_, gs(e, t);
			} else $g = O(e, t);
			a: do
				try {
					if (Xg !== Bg && zg !== null) b: switch (t = zg, a = Zg, Xg) {
						case Vg:
							Xg = Bg, Zg = null, ks(e, t, a, Vg);
							break;
						case Hg:
						case Yg:
							if (kn(a)) {
								Xg = Bg, Zg = null, Ds(t);
								break;
							}
							t = function() {
								Xg !== Hg && Xg !== Yg || Rg !== e || (Xg = qg), dn(e);
							}, a.then(t, t);
							break a;
						case Ug:
							Xg = qg;
							break a;
						case Wg:
							Xg = Gg;
							break a;
						case qg:
							kn(a) ? (Xg = Bg, Zg = null, Ds(t)) : (Xg = Bg, Zg = null, ks(e, t, a, qg));
							break;
						case Gg:
							var o = null;
							switch (zg.tag) {
								case 26: o = zg.memoizedState;
								case 5:
								case 27:
									var s = zg, c = s.type, l = s.pendingProps;
									if (o ? cd(o) : Tl(s.stateNode, c, l)) {
										Xg = Bg, Zg = null;
										var u = s.sibling;
										if (u !== null) zg = u;
										else {
											var d = s.return;
											d === null ? zg = null : (zg = d, As(d));
										}
										break b;
									}
									break;
								default: console.error("Unexpected type of fiber triggered a suspensey commit. This is a bug in React.");
							}
							Xg = Bg, Zg = null, ks(e, t, a, Gg);
							break;
						case Kg:
							Xg = Bg, Zg = null, ks(e, t, a, Kg);
							break;
						case Jg:
							ms(), n_ = Fg;
							break a;
						default: throw Error("Unexpected SuspendedReason. This is a bug in React.");
					}
					G.actQueue === null ? Ts() : Cs();
					break;
				} catch (t) {
					_s(e, t);
				}
			while (1);
			return I(), G.H = r, G.A = i, Lg = n, zg === null ? (Rg = null, $ = 0, Kn(), n_) : Ag;
		}
		function Ts() {
			for (; zg !== null && !Od();) Es(zg);
		}
		function Es(e) {
			var t = e.alternate;
			(e.mode & 2) === q ? t = F(e, ja, t, e, t_) : (nn(e), t = F(e, ja, t, e, t_), rn(e)), e.memoizedProps = e.pendingProps, t === null ? As(e) : zg = t;
		}
		function Ds(e) {
			var t = F(e, Os, e);
			e.memoizedProps = e.pendingProps, t === null ? As(e) : zg = t;
		}
		function Os(e) {
			var t = e.alternate, n = (e.mode & 2) !== q;
			switch (n && nn(e), e.tag) {
				case 15:
				case 0:
					t = ha(t, e, e.pendingProps, e.type, void 0, $);
					break;
				case 11:
					t = ha(t, e, e.pendingProps, e.type.render, e.ref, $);
					break;
				case 5: Or(e);
				default: Ka(t, e), e = zg = cc(e, t_), t = ja(t, e, t_);
			}
			return n && rn(e), t;
		}
		function ks(e, t, n, r) {
			I(), Or(t), Dm = null, Om = 0;
			var i = t.return;
			try {
				if (na(e, i, t, n, $)) {
					n_ = jg, Zi(e, Ue(n, e.current)), zg = null;
					return;
				}
			} catch (t) {
				if (i !== null) throw zg = i, t;
				n_ = jg, Zi(e, Ue(n, e.current)), zg = null;
				return;
			}
			t.flags & 32768 ? (Nf || r === Vg ? e = !0 : $g || $ & 536870912 ? e = !1 : (Qg = e = !0, (r === Hg || r === Yg || r === Ug || r === Kg) && (r = Zm.current, r !== null && r.tag === 13 && (r.flags |= 16384))), js(t, e)) : As(t);
		}
		function As(e) {
			var t = e;
			do {
				if (t.flags & 32768) {
					js(t, Qg);
					return;
				}
				var n = t.alternate;
				if (e = t.return, nn(t), n = F(t, Wa, n, t, t_), (t.mode & 2) !== q && an(t), n !== null) {
					zg = n;
					return;
				}
				if (t = t.sibling, t !== null) {
					zg = t;
					return;
				}
				zg = t = e;
			} while (t !== null);
			n_ === Ag && (n_ = Ig);
		}
		function js(e, t) {
			do {
				var n = Ga(e.alternate, e);
				if (n !== null) {
					n.flags &= 32767, zg = n;
					return;
				}
				if ((e.mode & 2) !== q) {
					an(e), n = e.actualDuration;
					for (var r = e.child; r !== null;) n += r.actualDuration, r = r.sibling;
					e.actualDuration = n;
				}
				if (n = e.return, n !== null && (n.flags |= 32768, n.subtreeFlags = 0, n.deletions = null), !t && (e = e.sibling, e !== null)) {
					zg = e;
					return;
				}
				zg = e = n;
			} while (e !== null);
			n_ = Fg, zg = null;
		}
		function Ms(e, t, n, r, i, a, o, s, c, l, u, d, f, p) {
			e.cancelPendingCommit = null;
			do
				Rs();
			while (k_ !== C_);
			if (qp.flushLegacyContextWarning(), qp.flushPendingUnsafeLifecycleWarnings(), (Lg & (Og | kg)) !== Dg) throw Error("Should not already be working.");
			if (Se(n), l === Mg ? je(f, p, n, __) : r === null ? De(f, p, n, __) : Ae(f, p, n, r, t !== null && t.alternate !== null && t.alternate.memoizedState.isDehydrated && (t.flags & 256) != 0, __), t !== null) {
				if (n === 0 && console.error("finishedLanes should not be empty during a commit. This is a bug in React."), t === e.current) throw Error("Cannot commit the same tree as before. This error is likely caused by a bug in React. Please file an issue.");
				if (a = t.lanes | t.childLanes, a |= Bm, ce(e, n, a, o, s, c), e === Rg && (zg = Rg = null, $ = 0), j_ = t, A_ = e, M_ = n, N_ = a, F_ = i, I_ = r, P_ = p, L_ = d, R_ = y_, z_ = null, t.actualDuration !== 0 || t.subtreeFlags & 10256 || t.flags & 10256 ? (e.callbackNode = null, e.callbackPriority = 0, Qs(Nd, function() {
					return _l(), R_ === y_ && (R_ = x_), zs(), null;
				})) : (e.callbackNode = null, e.callbackPriority = 0), tp = null, $f = Xf(), d !== null && Me(p, $f, d, __), r = (t.flags & 13878) != 0, t.subtreeFlags & 13878 || r) {
					r = G.T, G.T = null, i = hl(), ml(2), o = Lg, Lg |= kg;
					try {
						yo(e, t, n);
					} finally {
						Lg = o, ml(i), G.T = r;
					}
				}
				k_ = w_, Ns(), Ps(), Fs();
			}
		}
		function Ns() {
			if (k_ === w_) {
				k_ = C_;
				var e = A_, t = j_, n = M_, r = (t.flags & 13878) != 0;
				if (t.subtreeFlags & 13878 || r) {
					r = G.T, G.T = null;
					var i = hl();
					ml(2);
					var a = Lg;
					Lg |= kg;
					try {
						dg = n, fg = e, Yt(), ko(t, e), fg = dg = null, $c(e.containerInfo);
					} finally {
						Lg = a, ml(i), G.T = r;
					}
				}
				e.current = t, k_ = T_;
			}
		}
		function Ps() {
			if (k_ === T_) {
				k_ = C_;
				var e = z_;
				if (e !== null) {
					$f = Xf();
					var t = ep, n = $f;
					!Jd || n <= t || (Op ? Op.run(console.timeStamp.bind(console, e, t, n, Yd, "Scheduler ⚛", "secondary-light")) : console.timeStamp(e, t, n, Yd, "Scheduler ⚛", "secondary-light"));
				}
				e = A_, t = j_, n = M_;
				var r = (t.flags & 8772) != 0;
				if (t.subtreeFlags & 8772 || r) {
					r = G.T, G.T = null;
					var i = hl();
					ml(2);
					var a = Lg;
					Lg |= kg;
					try {
						dg = n, fg = e, Yt(), bo(e, t.alternate, t), fg = dg = null;
					} finally {
						Lg = a, ml(i), G.T = r;
					}
				}
				e = P_, t = L_, ep = Xf(), e = t === null ? e : $f, t = ep, n = R_ === b_, r = __, tp === null ? !Jd || t <= e || (r ? r.run(console.timeStamp.bind(console, n ? "Commit Interrupted View Transition" : "Commit", e, t, Yd, "Scheduler ⚛", n ? "error" : "secondary-dark")) : console.timeStamp(n ? "Commit Interrupted View Transition" : "Commit", e, t, Yd, "Scheduler ⚛", n ? "error" : "secondary-dark")) : Ne(e, t, tp, !1, r), k_ = E_;
			}
		}
		function Fs() {
			if (k_ === D_ || k_ === E_) {
				if (k_ === D_) {
					var e = ep;
					ep = Xf();
					var t = ep, n = R_ === b_;
					!Jd || t <= e || (Op ? Op.run(console.timeStamp.bind(console, n ? "Interrupted View Transition" : "Starting Animation", e, t, Yd, "Scheduler ⚛", n ? "error" : "secondary-light")) : console.timeStamp(n ? "Interrupted View Transition" : "Starting Animation", e, t, Yd, "Scheduler ⚛", n ? " error" : "secondary-light")), R_ !== b_ && (R_ = S_);
				}
				k_ = C_, kd(), e = A_;
				var r = j_;
				t = M_, n = I_;
				var i = r.actualDuration !== 0 || (r.subtreeFlags & 10256) != 0 || (r.flags & 10256) != 0;
				i ? k_ = O_ : (k_ = C_, j_ = A_ = null, Ls(e, e.pendingLanes), K_ = 0, q_ = null);
				var a = e.pendingLanes;
				if (a === 0 && (v_ = null), i || Ys(e), a = he(t), r = r.stateNode, Rd && typeof Rd.onCommitFiberRoot == "function") try {
					var o = (r.current.flags & 128) == 128;
					switch (a) {
						case 2:
							var s = jd;
							break;
						case 8:
							s = Md;
							break;
						case 32:
							s = Nd;
							break;
						case 268435456:
							s = Pd;
							break;
						default: s = Nd;
					}
					Rd.onCommitFiberRoot(Ld, r, s, o);
				} catch (e) {
					zd || (zd = !0, console.error("React instrumentation encountered an error: %o", e));
				}
				if (Bd && e.memoizedUpdaters.clear(), rs(), n !== null) {
					o = G.T, s = hl(), ml(2), G.T = null;
					try {
						var c = e.onRecoverableError;
						for (r = 0; r < n.length; r++) {
							var l = n[r], u = Is(l.stack);
							F(l.source, c, l.value, u);
						}
					} finally {
						G.T = o, ml(s);
					}
				}
				M_ & 3 && Rs(), dn(e), a = e.pendingLanes, t & 261930 && a & 42 ? (Mp = !0, e === H_ ? V_++ : (V_ = 0, H_ = e)) : V_ = 0, i || hs(t, ep), dl && zu(), fn(0, !1);
			}
		}
		function Is(e) {
			return e = { componentStack: e }, Object.defineProperty(e, "digest", { get: function() {
				console.error("You are accessing \"digest\" from the errorInfo object passed to onRecoverableError. This property is no longer provided as part of errorInfo but can be accessed as a property of the Error instance itself.");
			} }), e;
		}
		function Ls(e, t) {
			(e.pooledCacheLanes &= t) === 0 && (t = e.pooledCache, t != null && (e.pooledCache = null, Ut(t)));
		}
		function Rs() {
			return Ns(), Ps(), Fs(), zs();
		}
		function zs() {
			if (k_ !== O_) return !1;
			var e = A_, t = N_;
			N_ = 0;
			var n = he(M_), r = 32 > n ? 32 : n;
			n = G.T;
			var i = hl();
			try {
				ml(r), G.T = null;
				var a = F_;
				F_ = null, r = A_;
				var o = M_;
				if (k_ = C_, j_ = A_ = null, M_ = 0, (Lg & (Og | kg)) !== Dg) throw Error("Cannot flush passive effects while already rendering.");
				Se(o), U_ = !0, W_ = !1;
				var s = 0;
				if (tp = null, s = Ad(), R_ === S_) {
					var c = ep, l = s;
					!Jd || l <= c || (Op ? Op.run(console.timeStamp.bind(console, "Animating", c, l, Yd, "Scheduler ⚛", "secondary-dark")) : console.timeStamp("Animating", c, l, Yd, "Scheduler ⚛", "secondary-dark"));
				} else {
					c = ep, l = s;
					var u = R_ === x_;
					!Jd || l <= c || (__ ? __.run(console.timeStamp.bind(console, u ? "Waiting for Paint" : "Waiting", c, l, Yd, "Scheduler ⚛", "secondary-light")) : console.timeStamp(u ? "Waiting for Paint" : "Waiting", c, l, Yd, "Scheduler ⚛", "secondary-light"));
				}
				c = Lg, Lg |= kg;
				var d = r.current;
				Yt(), Jo(d);
				var f = r.current;
				d = P_, Yt(), Bo(r, f, o, a, d), Ys(r), Lg = c;
				var p = Ad();
				if (f = s, d = __, tp === null ? !Jd || p <= f || (d ? d.run(console.timeStamp.bind(console, "Remaining Effects", f, p, Yd, "Scheduler ⚛", "secondary-dark")) : console.timeStamp("Remaining Effects", f, p, Yd, "Scheduler ⚛", "secondary-dark")) : Ne(f, p, tp, !0, d), hs(o, p), fn(0, !1), W_ ? r === q_ ? K_++ : (K_ = 0, q_ = r) : K_ = 0, W_ = U_ = !1, Rd && typeof Rd.onPostCommitFiberRoot == "function") try {
					Rd.onPostCommitFiberRoot(Ld, r);
				} catch (e) {
					zd || (zd = !0, console.error("React instrumentation encountered an error: %o", e));
				}
				var m = r.current.stateNode;
				return m.effectDuration = 0, m.passiveEffectDuration = 0, !0;
			} finally {
				ml(i), G.T = n, Ls(e, t);
			}
		}
		function Bs(e, t, n) {
			t = Ue(n, t), sn(t), t = $i(e.stateNode, t, 2), e = tr(e, t, 2), e !== null && (se(e, 2), dn(e));
		}
		function Vs(e, t, n) {
			if (J_ = !1, e.tag === 3) Bs(e, e, n);
			else {
				for (; t !== null;) {
					if (t.tag === 3) {
						Bs(t, e, n);
						return;
					}
					if (t.tag === 1) {
						var r = t.stateNode;
						if (typeof t.type.getDerivedStateFromError == "function" || typeof r.componentDidCatch == "function" && (v_ === null || !v_.has(r))) {
							e = Ue(n, e), sn(e), n = ea(2), r = tr(t, n, 2), r !== null && (ta(n, r, t, e), se(r, 2), dn(r));
							return;
						}
					}
					t = t.return;
				}
				console.error("Internal React error: Attempted to capture a commit phase error inside a detached tree. This indicates a bug in React. Potential causes include deleting the same fiber more than once, committing an already-finished tree, or an inconsistent return pointer.\n\nError message:\n\n%s", n);
			}
		}
		function Hs(e, t, n) {
			var r = e.pingCache;
			if (r === null) {
				r = e.pingCache = new Eg();
				var i = /* @__PURE__ */ new Set();
				r.set(t, i);
			} else i = r.get(t), i === void 0 && (i = /* @__PURE__ */ new Set(), r.set(t, i));
			i.has(n) || (e_ = !0, i.add(n), r = Us.bind(null, e, t, n), Bd && Zs(e, n), t.then(r, r));
		}
		function Us(e, t, n) {
			var r = e.pingCache;
			r !== null && r.delete(t), e.pingedLanes |= e.suspendedLanes & n, e.warmLanes &= ~n, n & 127 ? 0 > cp && (sp = cp = Xf(), lp = Zf("Promise Resolved"), up = 2) : n & 4194048 && 0 > yp && (_p = yp = Xf(), xp = Zf("Promise Resolved"), bp = 2), is() && G.actQueue === null && console.error("A suspended resource finished loading inside a test, but the event was not wrapped in act(...).\n\nWhen testing, code that resolves suspended data should be wrapped into act(...):\n\nact(() => {\n  /* finish loading suspended data */\n});\n/* assert on the output */\n\nThis ensures that you're testing the behavior the user would see in the browser. Learn more at https://react.dev/link/wrap-tests-with-act"), Rg === e && ($ & n) === n && (n_ === Pg || n_ === Ng && ($ & 62914560) === $ && Ad() - d_ < p_ ? (Lg & Og) === Dg && gs(e, 0) : a_ |= n, s_ === $ && (s_ = 0)), dn(e);
		}
		function Ws(e, t) {
			t === 0 && (t = k()), e = Yn(e, t), e !== null && (se(e, t), dn(e));
		}
		function Gs(e) {
			var t = e.memoizedState, n = 0;
			t !== null && (n = t.retryLane), Ws(e, n);
		}
		function Ks(e, t) {
			var n = 0;
			switch (e.tag) {
				case 31:
				case 13:
					var r = e.stateNode, i = e.memoizedState;
					i !== null && (n = i.retryLane);
					break;
				case 19:
					r = e.stateNode;
					break;
				case 22:
					r = e.stateNode._retryCache;
					break;
				default: throw Error("Pinged unknown suspense boundary type. This is probably a bug in React.");
			}
			r !== null && r.delete(t), Ws(e, n);
		}
		function qs(e, t, n) {
			if (t.subtreeFlags & 67117056) for (t = t.child; t !== null;) {
				var r = e, i = t, a = i.type === Mc;
				a = n || a, i.tag === 22 ? i.memoizedState === null && (a && i.flags & 8192 ? F(i, Js, r, i) : i.subtreeFlags & 67108864 && F(i, qs, r, i, a)) : i.flags & 67108864 ? a && F(i, Js, r, i) : qs(r, i, a), t = t.sibling;
			}
		}
		function Js(e, t) {
			j(!0);
			try {
				No(t), Xo(t), Fo(e, t.alternate, t, !1), Ho(e, t, 0, null, !1, 0);
			} finally {
				j(!1);
			}
		}
		function Ys(e) {
			var t = !0;
			e.current.mode & 24 || (t = !1), qs(e, e.current, t);
		}
		function Xs(e) {
			if ((Lg & Og) === Dg) {
				var t = e.tag;
				if (t === 3 || t === 1 || t === 0 || t === 11 || t === 14 || t === 15) {
					if (t = w(e) || "ReactComponent", Y_ !== null) {
						if (Y_.has(t)) return;
						Y_.add(t);
					} else Y_ = new Set([t]);
					F(e, function() {
						console.error("Can't perform a React state update on a component that hasn't mounted yet. This indicates that you have a side-effect in your render function that asynchronously tries to update the component. Move this work to useEffect instead.");
					});
				}
			}
		}
		function Zs(e, t) {
			Bd && e.memoizedUpdaters.forEach(function(n) {
				pe(e, n, t);
			});
		}
		function Qs(e, t) {
			var n = G.actQueue;
			return n === null ? Ed(e, t) : (n.push(t), Q_);
		}
		function $s(e) {
			is() && G.actQueue === null && F(e, function() {
				console.error("An update to %s inside a test was not wrapped in act(...).\n\nWhen testing, code that causes React state updates should be wrapped into act(...):\n\nact(() => {\n  /* fire events that update state */\n});\n/* assert on the output */\n\nThis ensures that you're testing the behavior the user would see in the browser. Learn more at https://react.dev/link/wrap-tests-with-act", w(e));
			});
		}
		function ec(e) {
			if ($_ === null) return e;
			var t = $_(e);
			return t === void 0 ? e : t.current;
		}
		function tc(e) {
			if ($_ === null) return e;
			var t = $_(e);
			return t === void 0 ? e != null && typeof e.render == "function" && (t = ec(e.render), e.render !== t) ? (t = {
				$$typeof: Ic,
				render: t
			}, e.displayName !== void 0 && (t.displayName = e.displayName), t) : e : t.current;
		}
		function nc(e, t) {
			if ($_ === null) return !1;
			var n = e.elementType;
			t = t.type;
			var r = !1, i = typeof t == "object" && t ? t.$$typeof : null;
			switch (e.tag) {
				case 1:
					typeof t == "function" && (r = !0);
					break;
				case 0:
					(typeof t == "function" || i === Bc) && (r = !0);
					break;
				case 11:
					(i === Ic || i === Bc) && (r = !0);
					break;
				case 14:
				case 15:
					(i === zc || i === Bc) && (r = !0);
					break;
				default: return !1;
			}
			return !!(r && (e = $_(n), e !== void 0 && e === $_(t)));
		}
		function rc(e) {
			$_ !== null && typeof WeakSet == "function" && (ev === null && (ev = /* @__PURE__ */ new WeakSet()), ev.add(e));
		}
		function ic(e, t, n) {
			do {
				var r = e, i = r.alternate, a = r.child, o = r.sibling, s = r.tag;
				r = r.type;
				var c = null;
				switch (s) {
					case 0:
					case 15:
					case 1:
						c = r;
						break;
					case 11: c = r.render;
				}
				if ($_ === null) throw Error("Expected resolveFamily to be set during hot reload.");
				var l = !1;
				if (r = !1, c !== null && (c = $_(c), c !== void 0 && (n.has(c) ? r = !0 : t.has(c) && (s === 1 ? r = !0 : l = !0))), ev !== null && (ev.has(e) || i !== null && ev.has(i)) && (r = !0), r && (e._debugNeedsRemount = !0), (r || l) && (i = Yn(e, 2), i !== null && ss(i, e, 2)), a === null || r || ic(a, t, n), o === null) break;
				e = o;
			} while (1);
		}
		function ac(e, t, n, r) {
			this.tag = e, this.key = n, this.sibling = this.child = this.return = this.stateNode = this.type = this.elementType = null, this.index = 0, this.refCleanup = this.ref = null, this.pendingProps = t, this.dependencies = this.memoizedState = this.updateQueue = this.memoizedProps = null, this.mode = r, this.subtreeFlags = this.flags = 0, this.deletions = null, this.childLanes = this.lanes = 0, this.alternate = null, this.actualDuration = -0, this.actualStartTime = -1.1, this.treeBaseDuration = this.selfBaseDuration = -0, this._debugTask = this._debugStack = this._debugOwner = this._debugInfo = null, this._debugNeedsRemount = !1, this._debugHookTypes = null, tv || typeof Object.preventExtensions != "function" || Object.preventExtensions(this);
		}
		function oc(e) {
			return e = e.prototype, !(!e || !e.isReactComponent);
		}
		function sc(e, t) {
			var n = e.alternate;
			switch (n === null ? (n = u(e.tag, t, e.key, e.mode), n.elementType = e.elementType, n.type = e.type, n.stateNode = e.stateNode, n._debugOwner = e._debugOwner, n._debugStack = e._debugStack, n._debugTask = e._debugTask, n._debugHookTypes = e._debugHookTypes, n.alternate = e, e.alternate = n) : (n.pendingProps = t, n.type = e.type, n.flags = 0, n.subtreeFlags = 0, n.deletions = null, n.actualDuration = -0, n.actualStartTime = -1.1), n.flags = e.flags & 65011712, n.childLanes = e.childLanes, n.lanes = e.lanes, n.child = e.child, n.memoizedProps = e.memoizedProps, n.memoizedState = e.memoizedState, n.updateQueue = e.updateQueue, t = e.dependencies, n.dependencies = t === null ? null : {
				lanes: t.lanes,
				firstContext: t.firstContext,
				_debugThenableState: t._debugThenableState
			}, n.sibling = e.sibling, n.index = e.index, n.ref = e.ref, n.refCleanup = e.refCleanup, n.selfBaseDuration = e.selfBaseDuration, n.treeBaseDuration = e.treeBaseDuration, n._debugInfo = e._debugInfo, n._debugNeedsRemount = e._debugNeedsRemount, n.tag) {
				case 0:
				case 15:
					n.type = ec(e.type);
					break;
				case 1:
					n.type = ec(e.type);
					break;
				case 11: n.type = tc(e.type);
			}
			return n;
		}
		function cc(e, t) {
			e.flags &= 65011714;
			var n = e.alternate;
			return n === null ? (e.childLanes = 0, e.lanes = t, e.child = null, e.subtreeFlags = 0, e.memoizedProps = null, e.memoizedState = null, e.updateQueue = null, e.dependencies = null, e.stateNode = null, e.selfBaseDuration = 0, e.treeBaseDuration = 0) : (e.childLanes = n.childLanes, e.lanes = n.lanes, e.child = n.child, e.subtreeFlags = 0, e.deletions = null, e.memoizedProps = n.memoizedProps, e.memoizedState = n.memoizedState, e.updateQueue = n.updateQueue, e.type = n.type, t = n.dependencies, e.dependencies = t === null ? null : {
				lanes: t.lanes,
				firstContext: t.firstContext,
				_debugThenableState: t._debugThenableState
			}, e.selfBaseDuration = n.selfBaseDuration, e.treeBaseDuration = n.treeBaseDuration), e;
		}
		function lc(e, t, n, r, i, a) {
			var o = 0, s = e;
			if (typeof e == "function") oc(e) && (o = 1), s = ec(s);
			else if (typeof e == "string") Xu && ud ? (o = $e(), o = Zu(e, n, o) ? 26 : md(e) ? 27 : 5) : Xu ? (o = $e(), o = Zu(e, n, o) ? 26 : 5) : o = ud && md(e) ? 27 : 5;
			else a: switch (e) {
				case Vc: return t = u(31, n, t, i), t.elementType = Vc, t.lanes = a, t;
				case jc: return dc(n.children, i, a, t);
				case Mc:
					o = 8, i |= 24;
					break;
				case Nc: return e = n, r = i, typeof e.id != "string" && console.error("Profiler must specify an \"id\" of type `string` as a prop. Received the type `%s` instead.", typeof e.id), t = u(12, e, t, r | 2), t.elementType = Nc, t.lanes = a, t.stateNode = {
					effectDuration: 0,
					passiveEffectDuration: 0
				}, t;
				case Lc: return t = u(13, n, t, i), t.elementType = Lc, t.lanes = a, t;
				case Rc: return t = u(19, n, t, i), t.elementType = Rc, t.lanes = a, t;
				default:
					if (typeof e == "object" && e) switch (e.$$typeof) {
						case Fc:
							o = 10;
							break a;
						case Pc:
							o = 9;
							break a;
						case Ic:
							o = 11, s = tc(s);
							break a;
						case zc:
							o = 14;
							break a;
						case Bc:
							o = 16, s = null;
							break a;
					}
					s = "", (e === void 0 || typeof e == "object" && e && Object.keys(e).length === 0) && (s += " You likely forgot to export your component from the file it's defined in, or you might have mixed up default and named imports."), e === null ? n = "null" : Gc(e) ? n = "array" : e !== void 0 && e.$$typeof === kc ? (n = "<" + (C(e.type) || "Unknown") + " />", s = " Did you accidentally export a JSX literal instead of a component?") : n = typeof e, o = r ? typeof r.tag == "number" ? w(r) : typeof r.name == "string" ? r.name : null : null, o && (s += "\n\nCheck the render method of `" + o + "`."), o = 29, n = Error("Element type is invalid: expected a string (for built-in components) or a class/function (for composite components) but got: " + (n + "." + s)), s = null;
			}
			return t = u(o, n, t, i), t.elementType = e, t.type = s, t.lanes = a, t._debugOwner = r, t;
		}
		function uc(e, t, n) {
			return t = lc(e.type, e.key, e.props, e._owner, t, n), t._debugOwner = e._owner, t._debugStack = e._debugStack, t._debugTask = e._debugTask, t;
		}
		function dc(e, t, n, r) {
			return e = u(7, e, r, t), e.lanes = n, e;
		}
		function fc(e, t, n) {
			return e = u(6, e, null, t), e.lanes = n, e;
		}
		function pc(e) {
			var t = u(18, null, null, q);
			return t.stateNode = e, t;
		}
		function mc(e, t, n) {
			return t = u(4, e.children === null ? [] : e.children, e.key, t), t.lanes = n, t.stateNode = {
				containerInfo: e.containerInfo,
				pendingChildren: null,
				implementation: e.implementation
			}, t;
		}
		function hc(e, t, n, r, i, a, o, s, c) {
			for (this.tag = 1, this.containerInfo = e, this.pingCache = this.current = this.pendingChildren = null, this.timeoutHandle = sl, this.callbackNode = this.next = this.pendingContext = this.context = this.cancelPendingCommit = null, this.callbackPriority = 0, this.expirationTimes = A(-1), this.entangledLanes = this.shellSuspendCounter = this.errorRecoveryDisabledLanes = this.expiredLanes = this.warmLanes = this.pingedLanes = this.suspendedLanes = this.pendingLanes = 0, this.entanglements = A(0), this.hiddenUpdates = A(null), this.identifierPrefix = r, this.onUncaughtError = i, this.onCaughtError = a, this.onRecoverableError = o, this.pooledCache = null, this.pooledCacheLanes = 0, this.formState = c, this.incompleteTransitions = /* @__PURE__ */ new Map(), this.passiveEffectDuration = this.effectDuration = -0, this.memoizedUpdaters = /* @__PURE__ */ new Set(), e = this.pendingUpdatersLaneMap = [], t = 0; 31 > t; t++) e.push(/* @__PURE__ */ new Set());
			this._debugRootType = n ? "hydrateRoot()" : "createRoot()";
		}
		function gc(e, t, n, r, i, a, o, s, c, l, d, f) {
			return e = new hc(e, t, n, o, c, l, d, f, s), t = 1, !0 === a && (t |= 24), a = u(3, null, null, t | 2), e.current = a, a.stateNode = e, t = Vt(), Ht(t), e.pooledCache = t, Ht(t), a.memoizedState = {
				element: r,
				isDehydrated: n,
				cache: t
			}, Qn(a), e;
		}
		function _c(e) {
			return "" + e;
		}
		function vc(e) {
			return e ? (e = yd, e) : yd;
		}
		function yc(e, t, n, r) {
			return bc(t.current, 2, e, t, n, r), 2;
		}
		function bc(e, t, n, r, i, a) {
			if (Rd && typeof Rd.onScheduleFiberRoot == "function") try {
				Rd.onScheduleFiberRoot(Ld, r, n);
			} catch (e) {
				zd || (zd = !0, console.error("React instrumentation encountered an error: %o", e));
			}
			i = vc(i), r.context === null ? r.context = i : r.pendingContext = i, Af && kf !== null && !rv && (rv = !0, console.error("Render methods should be a pure function of props and state; triggering nested component updates from render is not allowed. If necessary, trigger nested updates in componentDidUpdate.\n\nCheck the render method of %s.", w(kf) || "Unknown")), r = er(t), r.payload = { element: n }, a = a === void 0 ? null : a, a !== null && (typeof a != "function" && console.error("Expected the last optional `callback` argument to be a function. Instead received: %s.", a), r.callback = a), n = tr(e, r, t), n !== null && (Wt(t, "root.render()", null), ss(n, e, t), nr(n, e, t));
		}
		function xc(e, t) {
			if (e = e.memoizedState, e !== null && e.dehydrated !== null) {
				var n = e.retryLane;
				e.retryLane = n !== 0 && n < t ? n : t;
			}
		}
		function Sc(e, t) {
			xc(e, t), (e = e.alternate) && xc(e, t);
		}
		function Cc() {
			return kf;
		}
		var wc = {}, Tc = r(), Ec = i(), Dc = Object.assign, Oc = Symbol.for("react.element"), kc = Symbol.for("react.transitional.element"), Ac = Symbol.for("react.portal"), jc = Symbol.for("react.fragment"), Mc = Symbol.for("react.strict_mode"), Nc = Symbol.for("react.profiler"), Pc = Symbol.for("react.consumer"), Fc = Symbol.for("react.context"), Ic = Symbol.for("react.forward_ref"), Lc = Symbol.for("react.suspense"), Rc = Symbol.for("react.suspense_list"), zc = Symbol.for("react.memo"), Bc = Symbol.for("react.lazy"), Vc = Symbol.for("react.activity"), Hc = Symbol.for("react.memo_cache_sentinel"), Uc = Symbol.iterator, Wc = Symbol.for("react.client.reference"), Gc = Array.isArray, G = Tc.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, Kc = e.rendererVersion, qc = e.rendererPackageName, Jc = e.extraDevToolsConfig, Yc = e.getPublicInstance, Xc = e.getRootHostContext, Zc = e.getChildHostContext, Qc = e.prepareForCommit, $c = e.resetAfterCommit, el = e.createInstance;
		e.cloneMutableInstance;
		var tl = e.appendInitialChild, nl = e.finalizeInitialChildren, rl = e.shouldSetTextContent, il = e.createTextInstance;
		e.cloneMutableTextInstance;
		var al = e.scheduleTimeout, ol = e.cancelTimeout, sl = e.noTimeout, cl = e.isPrimaryRenderer;
		e.warnsIfNotActing;
		var ll = e.supportsMutation, ul = e.supportsPersistence, dl = e.supportsHydration, fl = e.getInstanceFromNode;
		e.beforeActiveInstanceBlur;
		var pl = e.preparePortalMount;
		e.prepareScopeUpdate, e.getInstanceFromScope;
		var ml = e.setCurrentUpdatePriority, hl = e.getCurrentUpdatePriority, gl = e.resolveUpdatePriority, _l = e.trackSchedulerEvent, vl = e.resolveEventType, yl = e.resolveEventTimeStamp, bl = e.shouldAttemptEagerTransition, xl = e.detachDeletedInstance;
		e.requestPostPaintCallback;
		var Sl = e.maySuspendCommit, Cl = e.maySuspendCommitOnUpdate, wl = e.maySuspendCommitInSyncRender, Tl = e.preloadInstance, El = e.startSuspendingCommit, Dl = e.suspendInstance;
		e.suspendOnActiveViewTransition;
		var Ol = e.waitForCommitToBeReady, kl = e.getSuspendedCommitReason, Al = e.NotPendingTransition, jl = e.HostTransitionContext, Ml = e.resetFormInstance, Nl = e.bindToConsole, Pl = e.supportsMicrotasks, Fl = e.scheduleMicrotask, Il = e.supportsTestSelectors, Ll = e.findFiberRoot, Rl = e.getBoundingRect, zl = e.getTextContent, Bl = e.isHiddenSubtree, Vl = e.matchAccessibilityRole, Hl = e.setFocusIfFocusable, Ul = e.setupIntersectionObserver, Wl = e.appendChild, Gl = e.appendChildToContainer, K = e.commitTextUpdate, Kl = e.commitMount, ql = e.commitUpdate, Jl = e.insertBefore, Yl = e.insertInContainerBefore, Xl = e.removeChild, Zl = e.removeChildFromContainer, Ql = e.resetTextContent, $l = e.hideInstance, eu = e.hideTextInstance, tu = e.unhideInstance, nu = e.unhideTextInstance;
		e.cancelViewTransitionName, e.cancelRootViewTransitionName, e.restoreRootViewTransitionName, e.cloneRootViewTransitionContainer, e.removeRootViewTransitionClone, e.measureClonedInstance, e.hasInstanceChanged, e.hasInstanceAffectedParent, e.startViewTransition, e.startGestureTransition, e.stopViewTransition, e.getCurrentGestureOffset, e.createViewTransitionInstance;
		var ru = e.clearContainer;
		e.createFragmentInstance, e.updateFragmentInstanceFiber, e.commitNewChildToFragmentInstance, e.deleteChildFromFragmentInstance;
		var iu = e.cloneInstance, au = e.createContainerChildSet, ou = e.appendChildToContainerChildSet, su = e.finalizeContainerChildren, cu = e.replaceContainerChildren, lu = e.cloneHiddenInstance, uu = e.cloneHiddenTextInstance, du = e.isSuspenseInstancePending, fu = e.isSuspenseInstanceFallback, pu = e.getSuspenseInstanceFallbackErrorDetails, mu = e.registerSuspenseInstanceRetry, hu = e.canHydrateFormStateMarker, gu = e.isFormStateMarkerMatching, _u = e.getNextHydratableSibling, vu = e.getNextHydratableSiblingAfterSingleton, yu = e.getFirstHydratableChild, bu = e.getFirstHydratableChildWithinContainer, xu = e.getFirstHydratableChildWithinActivityInstance, Su = e.getFirstHydratableChildWithinSuspenseInstance, Cu = e.getFirstHydratableChildWithinSingleton, wu = e.canHydrateInstance, Tu = e.canHydrateTextInstance, Eu = e.canHydrateActivityInstance, Du = e.canHydrateSuspenseInstance, Ou = e.hydrateInstance, ku = e.hydrateTextInstance, Au = e.hydrateActivityInstance, ju = e.hydrateSuspenseInstance, Mu = e.getNextHydratableInstanceAfterActivityInstance, Nu = e.getNextHydratableInstanceAfterSuspenseInstance, Pu = e.commitHydratedInstance, Fu = e.commitHydratedContainer, Iu = e.commitHydratedActivityInstance, Lu = e.commitHydratedSuspenseInstance, Ru = e.finalizeHydratedChildren, zu = e.flushHydrationEvents;
		e.clearActivityBoundary;
		var Bu = e.clearSuspenseBoundary;
		e.clearActivityBoundaryFromContainer;
		var Vu = e.clearSuspenseBoundaryFromContainer, Hu = e.hideDehydratedBoundary, Uu = e.unhideDehydratedBoundary, Wu = e.shouldDeleteUnhydratedTailInstances, Gu = e.diffHydratedPropsForDevWarnings, Ku = e.diffHydratedTextForDevWarnings, qu = e.describeHydratableInstanceForDevWarnings, Ju = e.validateHydratableInstance, Yu = e.validateHydratableTextInstance, Xu = e.supportsResources, Zu = e.isHostHoistableType, Qu = e.getHoistableRoot, $u = e.getResource, ed = e.acquireResource, td = e.releaseResource, nd = e.hydrateHoistable, rd = e.mountHoistable, id = e.unmountHoistable, ad = e.createHoistableInstance, od = e.prepareToCommitHoistables, sd = e.mayResourceSuspendCommit, cd = e.preloadResource, ld = e.suspendResource, ud = e.supportsSingletons, dd = e.resolveSingletonInstance, fd = e.acquireSingletonInstance, pd = e.releaseSingletonInstance, md = e.isHostSingletonType, hd = e.isSingletonScope, gd = [], _d = [], vd = -1, yd = {};
		Object.freeze(yd);
		var bd = Math.clz32 ? Math.clz32 : ie, xd = Math.log, Sd = Math.LN2, Cd = 256, wd = 262144, Td = 4194304, Ed = Ec.unstable_scheduleCallback, Dd = Ec.unstable_cancelCallback, Od = Ec.unstable_shouldYield, kd = Ec.unstable_requestPaint, Ad = Ec.unstable_now, jd = Ec.unstable_ImmediatePriority, Md = Ec.unstable_UserBlockingPriority, Nd = Ec.unstable_NormalPriority, Pd = Ec.unstable_IdlePriority, Fd = Ec.log, Id = Ec.unstable_setDisableYieldValue, Ld = null, Rd = null, zd = !1, Bd = typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ < "u", Vd = 0;
		if (typeof performance == "object" && typeof performance.now == "function") var Hd = performance, Ud = function() {
			return Hd.now();
		};
		else {
			var Wd = Date;
			Ud = function() {
				return Wd.now();
			};
		}
		var Gd = typeof Object.is == "function" ? Object.is : _e, Kd = typeof reportError == "function" ? reportError : function(e) {
			if (typeof window == "object" && typeof window.ErrorEvent == "function") {
				var t = new window.ErrorEvent("error", {
					bubbles: !0,
					cancelable: !0,
					message: typeof e == "object" && e && typeof e.message == "string" ? String(e.message) : String(e),
					error: e
				});
				if (!window.dispatchEvent(t)) return;
			} else if (typeof process == "object" && typeof process.emit == "function") {
				process.emit("uncaughtException", e);
				return;
			}
			console.error(e);
		}, qd = Object.prototype.hasOwnProperty, Jd = typeof console < "u" && typeof console.timeStamp == "function" && typeof performance < "u" && typeof performance.measure == "function", Yd = "Blocking", Xd = !1, Zd = {
			color: "primary",
			properties: null,
			tooltipText: "",
			track: "Components ⚛"
		}, Qd = {
			start: -0,
			end: -0,
			detail: { devtools: Zd }
		}, $d = ["Changed Props", ""], ef = ["Changed Props", "This component received deeply equal props. It might benefit from useMemo or the React Compiler in its owner."], tf = 0, nf, rf, af, of, sf, cf, lf;
		Pe.__reactDisabledLog = !0;
		var uf, df, ff = !1, pf = new (typeof WeakMap == "function" ? WeakMap : Map)(), mf = /* @__PURE__ */ new WeakMap(), hf = [], gf = 0, _f = null, vf = 0, yf = [], bf = 0, xf = null, Sf = 1, Cf = "", wf = T(null), Tf = T(null), Ef = T(null), Df = T(null), Of = /["'&<>\n\t]|^\s|\s$/, kf = null, Af = !1, jf = null, Mf = null, Nf = !1, Pf = !1, Ff = null, If = null, Lf = !1, Rf = Error("Hydration Mismatch Exception: This is not a real error, and should not leak into userspace. If you're seeing this, it's likely a bug in React."), q = 0, zf = T(null), Bf = T(null), Vf = T(null), Hf = {}, Uf = null, Wf = null, Gf = !1, Kf = typeof AbortController < "u" ? AbortController : function() {
			var e = [], t = this.signal = {
				aborted: !1,
				addEventListener: function(t, n) {
					e.push(n);
				}
			};
			this.abort = function() {
				t.aborted = !0, e.forEach(function(e) {
					return e();
				});
			};
		}, qf = Ec.unstable_scheduleCallback, Jf = Ec.unstable_NormalPriority, Yf = {
			$$typeof: Fc,
			Consumer: null,
			Provider: null,
			_currentValue: null,
			_currentValue2: null,
			_threadCount: 0,
			_currentRenderer: null,
			_currentRenderer2: null
		}, Xf = Ec.unstable_now, Zf = console.createTask ? console.createTask : function() {
			return null;
		}, Qf = -0, $f = -0, ep = -0, tp = null, np = -1.1, rp = -0, ip = -0, J = -1.1, Y = -1.1, ap = null, op = !1, sp = -0, cp = -1.1, lp = null, up = 0, dp = null, fp = null, pp = -1.1, mp = null, hp = -1.1, gp = -1.1, _p = -0, vp = -1.1, yp = -1.1, bp = 0, xp = null, Sp = null, Cp = null, wp = -1.1, Tp = null, Ep = -1.1, Dp = -1.1, Op = null, kp = 0, Ap = -1.1, jp = !1, Mp = !1, Np = null, Pp = null, Fp = !1, Ip = !1, Lp = !1, Rp = !1, zp = 0, Bp = {}, Vp = null, Hp = 0, Up = 0, Wp = null, Gp = G.S;
		G.S = function(e, t) {
			if (f_ = Ad(), typeof t == "object" && t && typeof t.then == "function") {
				if (0 > vp && 0 > yp) {
					vp = Xf();
					var n = yl(), r = vl();
					(n !== Ep || r !== Tp) && (Ep = -1.1), wp = n, Tp = r;
				}
				xn(e, t);
			}
			Gp !== null && Gp(e, t);
		};
		var Kp = T(null), qp = {
			recordUnsafeLifecycleWarnings: function() {},
			flushPendingUnsafeLifecycleWarnings: function() {},
			recordLegacyContextWarning: function() {},
			flushLegacyContextWarning: function() {},
			discardPendingWarnings: function() {}
		}, Jp = [], Yp = [], Xp = [], Zp = [], Qp = [], $p = [], em = /* @__PURE__ */ new Set();
		qp.recordUnsafeLifecycleWarnings = function(e, t) {
			em.has(e.type) || (typeof t.componentWillMount == "function" && !0 !== t.componentWillMount.__suppressDeprecationWarning && Jp.push(e), e.mode & 8 && typeof t.UNSAFE_componentWillMount == "function" && Yp.push(e), typeof t.componentWillReceiveProps == "function" && !0 !== t.componentWillReceiveProps.__suppressDeprecationWarning && Xp.push(e), e.mode & 8 && typeof t.UNSAFE_componentWillReceiveProps == "function" && Zp.push(e), typeof t.componentWillUpdate == "function" && !0 !== t.componentWillUpdate.__suppressDeprecationWarning && Qp.push(e), e.mode & 8 && typeof t.UNSAFE_componentWillUpdate == "function" && $p.push(e));
		}, qp.flushPendingUnsafeLifecycleWarnings = function() {
			var e = /* @__PURE__ */ new Set();
			0 < Jp.length && (Jp.forEach(function(t) {
				e.add(w(t) || "Component"), em.add(t.type);
			}), Jp = []);
			var t = /* @__PURE__ */ new Set();
			0 < Yp.length && (Yp.forEach(function(e) {
				t.add(w(e) || "Component"), em.add(e.type);
			}), Yp = []);
			var n = /* @__PURE__ */ new Set();
			0 < Xp.length && (Xp.forEach(function(e) {
				n.add(w(e) || "Component"), em.add(e.type);
			}), Xp = []);
			var r = /* @__PURE__ */ new Set();
			0 < Zp.length && (Zp.forEach(function(e) {
				r.add(w(e) || "Component"), em.add(e.type);
			}), Zp = []);
			var i = /* @__PURE__ */ new Set();
			0 < Qp.length && (Qp.forEach(function(e) {
				i.add(w(e) || "Component"), em.add(e.type);
			}), Qp = []);
			var a = /* @__PURE__ */ new Set();
			if (0 < $p.length && ($p.forEach(function(e) {
				a.add(w(e) || "Component"), em.add(e.type);
			}), $p = []), 0 < t.size) {
				var o = v(t);
				console.error("Using UNSAFE_componentWillMount in strict mode is not recommended and may indicate bugs in your code. See https://react.dev/link/unsafe-component-lifecycles for details.\n\n* Move code with side effects to componentDidMount, and set initial state in the constructor.\n\nPlease update the following components: %s", o);
			}
			0 < r.size && (o = v(r), console.error("Using UNSAFE_componentWillReceiveProps in strict mode is not recommended and may indicate bugs in your code. See https://react.dev/link/unsafe-component-lifecycles for details.\n\n* Move data fetching code or side effects to componentDidUpdate.\n* If you're updating state whenever props change, refactor your code to use memoization techniques or move it to static getDerivedStateFromProps. Learn more at: https://react.dev/link/derived-state\n\nPlease update the following components: %s", o)), 0 < a.size && (o = v(a), console.error("Using UNSAFE_componentWillUpdate in strict mode is not recommended and may indicate bugs in your code. See https://react.dev/link/unsafe-component-lifecycles for details.\n\n* Move data fetching code or side effects to componentDidUpdate.\n\nPlease update the following components: %s", o)), 0 < e.size && (o = v(e), console.warn("componentWillMount has been renamed, and is not recommended for use. See https://react.dev/link/unsafe-component-lifecycles for details.\n\n* Move code with side effects to componentDidMount, and set initial state in the constructor.\n* Rename componentWillMount to UNSAFE_componentWillMount to suppress this warning in non-strict mode. In React 18.x, only the UNSAFE_ name will work. To rename all deprecated lifecycles to their new names, you can run `npx react-codemod rename-unsafe-lifecycles` in your project source folder.\n\nPlease update the following components: %s", o)), 0 < n.size && (o = v(n), console.warn("componentWillReceiveProps has been renamed, and is not recommended for use. See https://react.dev/link/unsafe-component-lifecycles for details.\n\n* Move data fetching code or side effects to componentDidUpdate.\n* If you're updating state whenever props change, refactor your code to use memoization techniques or move it to static getDerivedStateFromProps. Learn more at: https://react.dev/link/derived-state\n* Rename componentWillReceiveProps to UNSAFE_componentWillReceiveProps to suppress this warning in non-strict mode. In React 18.x, only the UNSAFE_ name will work. To rename all deprecated lifecycles to their new names, you can run `npx react-codemod rename-unsafe-lifecycles` in your project source folder.\n\nPlease update the following components: %s", o)), 0 < i.size && (o = v(i), console.warn("componentWillUpdate has been renamed, and is not recommended for use. See https://react.dev/link/unsafe-component-lifecycles for details.\n\n* Move data fetching code or side effects to componentDidUpdate.\n* Rename componentWillUpdate to UNSAFE_componentWillUpdate to suppress this warning in non-strict mode. In React 18.x, only the UNSAFE_ name will work. To rename all deprecated lifecycles to their new names, you can run `npx react-codemod rename-unsafe-lifecycles` in your project source folder.\n\nPlease update the following components: %s", o));
		};
		var tm = /* @__PURE__ */ new Map(), nm = /* @__PURE__ */ new Set();
		qp.recordLegacyContextWarning = function(e, t) {
			for (var n = null, r = e; r !== null;) r.mode & 8 && (n = r), r = r.return;
			n === null ? console.error("Expected to find a StrictMode component in a strict mode tree. This error is likely caused by a bug in React. Please file an issue.") : !nm.has(e.type) && (r = tm.get(n), e.type.contextTypes != null || e.type.childContextTypes != null || t !== null && typeof t.getChildContext == "function") && (r === void 0 && (r = [], tm.set(n, r)), r.push(e));
		}, qp.flushLegacyContextWarning = function() {
			tm.forEach(function(e) {
				if (e.length !== 0) {
					var t = e[0], n = /* @__PURE__ */ new Set();
					e.forEach(function(e) {
						n.add(w(e) || "Component"), nm.add(e.type);
					});
					var r = v(n);
					F(t, function() {
						console.error("Legacy context API has been detected within a strict-mode tree.\n\nThe old API will be supported in all 16.x releases, but applications using it should migrate to the new version.\n\nPlease update the following components: %s\n\nLearn more about this warning here: https://react.dev/link/legacy-context", r);
					});
				}
			});
		}, qp.discardPendingWarnings = function() {
			Jp = [], Yp = [], Xp = [], Zp = [], Qp = [], $p = [], tm = /* @__PURE__ */ new Map();
		};
		var rm = { react_stack_bottom_frame: function(e, t, n) {
			var r = Af;
			Af = !0;
			try {
				return e(t, n);
			} finally {
				Af = r;
			}
		} }, im = rm.react_stack_bottom_frame.bind(rm), am = { react_stack_bottom_frame: function(e) {
			var t = Af;
			Af = !0;
			try {
				return e.render();
			} finally {
				Af = t;
			}
		} }, om = am.react_stack_bottom_frame.bind(am), sm = { react_stack_bottom_frame: function(e, t) {
			try {
				t.componentDidMount();
			} catch (t) {
				Vs(e, e.return, t);
			}
		} }, cm = sm.react_stack_bottom_frame.bind(sm), lm = { react_stack_bottom_frame: function(e, t, n, r, i) {
			try {
				t.componentDidUpdate(n, r, i);
			} catch (t) {
				Vs(e, e.return, t);
			}
		} }, um = lm.react_stack_bottom_frame.bind(lm), dm = { react_stack_bottom_frame: function(e, t) {
			var n = t.stack;
			e.componentDidCatch(t.value, { componentStack: n === null ? "" : n });
		} }, fm = dm.react_stack_bottom_frame.bind(dm), pm = { react_stack_bottom_frame: function(e, t, n) {
			try {
				n.componentWillUnmount();
			} catch (n) {
				Vs(e, t, n);
			}
		} }, mm = pm.react_stack_bottom_frame.bind(pm), hm = { react_stack_bottom_frame: function(e) {
			var t = e.create;
			return e = e.inst, t = t(), e.destroy = t;
		} }, gm = hm.react_stack_bottom_frame.bind(hm), _m = { react_stack_bottom_frame: function(e, t, n) {
			try {
				n();
			} catch (n) {
				Vs(e, t, n);
			}
		} }, vm = _m.react_stack_bottom_frame.bind(_m), ym = { react_stack_bottom_frame: function(e) {
			var t = e._init;
			return t(e._payload);
		} }, bm = ym.react_stack_bottom_frame.bind(ym), xm = Error("Suspense Exception: This is not a real error! It's an implementation detail of `use` to interrupt the current render. You must either rethrow it immediately, or move the `use` call outside of the `try/catch` block. Capturing without rethrowing will lead to unexpected behavior.\n\nTo handle async errors, wrap your component in an error boundary, or call the promise's `.catch` method and pass the result to `use`."), Sm = Error("Suspense Exception: This is not a real error, and should not leak into userspace. If you're seeing this, it's likely a bug in React."), Cm = Error("Suspense Exception: This is not a real error! It's an implementation detail of `useActionState` to interrupt the current render. You must either rethrow it immediately, or move the `useActionState` call outside of the `try/catch` block. Capturing without rethrowing will lead to unexpected behavior.\n\nTo handle async errors, wrap your component in an error boundary."), wm = { then: function() {
			console.error("Internal React error: A listener was unexpectedly attached to a \"noop\" thenable. This is a bug in React. Please file an issue.");
		} }, Tm = null, Em = !1, Dm = null, Om = 0, X = null, km, Am = km = !1, jm = {}, Mm = {}, Nm = {};
		_ = function(e, t, n) {
			if (typeof n == "object" && n && n._store && (!n._store.validated && n.key == null || n._store.validated === 2)) {
				if (typeof n._store != "object") throw Error("React Component in warnForMissingKey should have a _store. This error is likely caused by a bug in React. Please file an issue.");
				n._store.validated = 1;
				var r = w(e), i = r || "null";
				if (!jm[i]) {
					jm[i] = !0, n = n._owner, e = e._debugOwner;
					var a = "";
					e && typeof e.tag == "number" && (i = w(e)) && (a = "\n\nCheck the render method of `" + i + "`."), a || r && (a = "\n\nCheck the top-level render call using <" + r + ">.");
					var o = "";
					n != null && e !== n && (r = null, typeof n.tag == "number" ? r = w(n) : typeof n.name == "string" && (r = n.name), r && (o = " It was passed a child from " + r + ".")), F(t, function() {
						console.error("Each child in a list should have a unique \"key\" prop.%s%s See https://react.dev/link/warning-keys for more information.", a, o);
					});
				}
			}
		};
		var Pm = Wn(!0), Fm = Wn(!1), Im = 1, Lm = 2, Rm = [], zm = 0, Bm = 0, Vm = 0, Hm = 1, Um = 2, Wm = 3, Gm = !1, Km = !1, qm = null, Jm = !1, Ym = T(null), Xm = T(0), Zm = T(null), Qm = null, $m = 1, eh = 2, th = T(0), nh = 0, rh = 1, ih = 2, ah = 4, oh = 8, sh, ch = /* @__PURE__ */ new Set(), lh = /* @__PURE__ */ new Set(), uh = /* @__PURE__ */ new Set(), dh = /* @__PURE__ */ new Set(), fh = 0, Z = null, ph = null, mh = null, hh = !1, gh = !1, _h = !1, vh = 0, yh = 0, bh = null, xh = 0, Sh = 25, Q = null, Ch = null, wh = -1, Th = !1, Eh = {
			readContext: Rt,
			use: B,
			useCallback: br,
			useContext: br,
			useEffect: br,
			useImperativeHandle: br,
			useLayoutEffect: br,
			useInsertionEffect: br,
			useMemo: br,
			useReducer: br,
			useRef: br,
			useState: br,
			useDebugValue: br,
			useDeferredValue: br,
			useTransition: br,
			useSyncExternalStore: br,
			useId: br,
			useHostTransitionStatus: br,
			useFormState: br,
			useActionState: br,
			useOptimistic: br,
			useMemoCache: br,
			useCacheRefresh: br
		};
		Eh.useEffectEvent = br;
		var Dh = null, Oh = null, kh = null, Ah = null, jh = null, Mh = null, Nh = null;
		Dh = {
			readContext: function(e) {
				return Rt(e);
			},
			use: B,
			useCallback: function(e, t) {
				return Q = "useCallback", R(), vr(t), xi(e, t);
			},
			useContext: function(e) {
				return Q = "useContext", R(), Rt(e);
			},
			useEffect: function(e, t) {
				return Q = "useEffect", R(), vr(t), pi(e, t);
			},
			useImperativeHandle: function(e, t, n) {
				return Q = "useImperativeHandle", R(), vr(n), yi(e, t, n);
			},
			useInsertionEffect: function(e, t) {
				Q = "useInsertionEffect", R(), vr(t), fi(4, ih, e, t);
			},
			useLayoutEffect: function(e, t) {
				return Q = "useLayoutEffect", R(), vr(t), _i(e, t);
			},
			useMemo: function(e, t) {
				Q = "useMemo", R(), vr(t);
				var n = G.H;
				G.H = jh;
				try {
					return Ci(e, t);
				} finally {
					G.H = n;
				}
			},
			useReducer: function(e, t, n) {
				Q = "useReducer", R();
				var r = G.H;
				G.H = jh;
				try {
					return Fr(e, t, n);
				} finally {
					G.H = r;
				}
			},
			useRef: function(e) {
				return Q = "useRef", R(), di(e);
			},
			useState: function(e) {
				Q = "useState", R();
				var t = G.H;
				G.H = jh;
				try {
					return qr(e);
				} finally {
					G.H = t;
				}
			},
			useDebugValue: function() {
				Q = "useDebugValue", R();
			},
			useDeferredValue: function(e, t) {
				return Q = "useDeferredValue", R(), Ti(e, t);
			},
			useTransition: function() {
				return Q = "useTransition", R(), Mi();
			},
			useSyncExternalStore: function(e, t, n) {
				return Q = "useSyncExternalStore", R(), zr(e, t, n);
			},
			useId: function() {
				return Q = "useId", R(), Ii();
			},
			useFormState: function(e, t) {
				return Q = "useFormState", R(), yr(), ai(e, t);
			},
			useActionState: function(e, t) {
				return Q = "useActionState", R(), ai(e, t);
			},
			useOptimistic: function(e) {
				return Q = "useOptimistic", R(), Jr(e);
			},
			useHostTransitionStatus: Fi,
			useMemoCache: Nr,
			useCacheRefresh: function() {
				return Q = "useCacheRefresh", R(), Li();
			},
			useEffectEvent: function(e) {
				return Q = "useEffectEvent", R(), hi(e);
			}
		}, Oh = {
			readContext: function(e) {
				return Rt(e);
			},
			use: B,
			useCallback: function(e, t) {
				return Q = "useCallback", z(), xi(e, t);
			},
			useContext: function(e) {
				return Q = "useContext", z(), Rt(e);
			},
			useEffect: function(e, t) {
				return Q = "useEffect", z(), pi(e, t);
			},
			useImperativeHandle: function(e, t, n) {
				return Q = "useImperativeHandle", z(), yi(e, t, n);
			},
			useInsertionEffect: function(e, t) {
				Q = "useInsertionEffect", z(), fi(4, ih, e, t);
			},
			useLayoutEffect: function(e, t) {
				return Q = "useLayoutEffect", z(), _i(e, t);
			},
			useMemo: function(e, t) {
				Q = "useMemo", z();
				var n = G.H;
				G.H = jh;
				try {
					return Ci(e, t);
				} finally {
					G.H = n;
				}
			},
			useReducer: function(e, t, n) {
				Q = "useReducer", z();
				var r = G.H;
				G.H = jh;
				try {
					return Fr(e, t, n);
				} finally {
					G.H = r;
				}
			},
			useRef: function(e) {
				return Q = "useRef", z(), di(e);
			},
			useState: function(e) {
				Q = "useState", z();
				var t = G.H;
				G.H = jh;
				try {
					return qr(e);
				} finally {
					G.H = t;
				}
			},
			useDebugValue: function() {
				Q = "useDebugValue", z();
			},
			useDeferredValue: function(e, t) {
				return Q = "useDeferredValue", z(), Ti(e, t);
			},
			useTransition: function() {
				return Q = "useTransition", z(), Mi();
			},
			useSyncExternalStore: function(e, t, n) {
				return Q = "useSyncExternalStore", z(), zr(e, t, n);
			},
			useId: function() {
				return Q = "useId", z(), Ii();
			},
			useActionState: function(e, t) {
				return Q = "useActionState", z(), ai(e, t);
			},
			useFormState: function(e, t) {
				return Q = "useFormState", z(), yr(), ai(e, t);
			},
			useOptimistic: function(e) {
				return Q = "useOptimistic", z(), Jr(e);
			},
			useHostTransitionStatus: Fi,
			useMemoCache: Nr,
			useCacheRefresh: function() {
				return Q = "useCacheRefresh", z(), Li();
			},
			useEffectEvent: function(e) {
				return Q = "useEffectEvent", z(), hi(e);
			}
		}, kh = {
			readContext: function(e) {
				return Rt(e);
			},
			use: B,
			useCallback: function(e, t) {
				return Q = "useCallback", z(), Si(e, t);
			},
			useContext: function(e) {
				return Q = "useContext", z(), Rt(e);
			},
			useEffect: function(e, t) {
				Q = "useEffect", z(), V(2048, oh, e, t);
			},
			useImperativeHandle: function(e, t, n) {
				return Q = "useImperativeHandle", z(), bi(e, t, n);
			},
			useInsertionEffect: function(e, t) {
				return Q = "useInsertionEffect", z(), V(4, ih, e, t);
			},
			useLayoutEffect: function(e, t) {
				return Q = "useLayoutEffect", z(), V(4, ah, e, t);
			},
			useMemo: function(e, t) {
				Q = "useMemo", z();
				var n = G.H;
				G.H = Mh;
				try {
					return wi(e, t);
				} finally {
					G.H = n;
				}
			},
			useReducer: function(e, t, n) {
				Q = "useReducer", z();
				var r = G.H;
				G.H = Mh;
				try {
					return Ir(e, t, n);
				} finally {
					G.H = r;
				}
			},
			useRef: function() {
				return Q = "useRef", z(), Ar().memoizedState;
			},
			useState: function() {
				Q = "useState", z();
				var e = G.H;
				G.H = Mh;
				try {
					return Ir(Pr);
				} finally {
					G.H = e;
				}
			},
			useDebugValue: function() {
				Q = "useDebugValue", z();
			},
			useDeferredValue: function(e, t) {
				return Q = "useDeferredValue", z(), Ei(e, t);
			},
			useTransition: function() {
				return Q = "useTransition", z(), Ni();
			},
			useSyncExternalStore: function(e, t, n) {
				return Q = "useSyncExternalStore", z(), Br(e, t, n);
			},
			useId: function() {
				return Q = "useId", z(), Ar().memoizedState;
			},
			useFormState: function(e) {
				return Q = "useFormState", z(), yr(), oi(e);
			},
			useActionState: function(e) {
				return Q = "useActionState", z(), oi(e);
			},
			useOptimistic: function(e, t) {
				return Q = "useOptimistic", z(), Yr(e, t);
			},
			useHostTransitionStatus: Fi,
			useMemoCache: Nr,
			useCacheRefresh: function() {
				return Q = "useCacheRefresh", z(), Ar().memoizedState;
			},
			useEffectEvent: function(e) {
				return Q = "useEffectEvent", z(), gi(e);
			}
		}, Ah = {
			readContext: function(e) {
				return Rt(e);
			},
			use: B,
			useCallback: function(e, t) {
				return Q = "useCallback", z(), Si(e, t);
			},
			useContext: function(e) {
				return Q = "useContext", z(), Rt(e);
			},
			useEffect: function(e, t) {
				Q = "useEffect", z(), V(2048, oh, e, t);
			},
			useImperativeHandle: function(e, t, n) {
				return Q = "useImperativeHandle", z(), bi(e, t, n);
			},
			useInsertionEffect: function(e, t) {
				return Q = "useInsertionEffect", z(), V(4, ih, e, t);
			},
			useLayoutEffect: function(e, t) {
				return Q = "useLayoutEffect", z(), V(4, ah, e, t);
			},
			useMemo: function(e, t) {
				Q = "useMemo", z();
				var n = G.H;
				G.H = Nh;
				try {
					return wi(e, t);
				} finally {
					G.H = n;
				}
			},
			useReducer: function(e, t, n) {
				Q = "useReducer", z();
				var r = G.H;
				G.H = Nh;
				try {
					return Rr(e, t, n);
				} finally {
					G.H = r;
				}
			},
			useRef: function() {
				return Q = "useRef", z(), Ar().memoizedState;
			},
			useState: function() {
				Q = "useState", z();
				var e = G.H;
				G.H = Nh;
				try {
					return Rr(Pr);
				} finally {
					G.H = e;
				}
			},
			useDebugValue: function() {
				Q = "useDebugValue", z();
			},
			useDeferredValue: function(e, t) {
				return Q = "useDeferredValue", z(), Di(e, t);
			},
			useTransition: function() {
				return Q = "useTransition", z(), Pi();
			},
			useSyncExternalStore: function(e, t, n) {
				return Q = "useSyncExternalStore", z(), Br(e, t, n);
			},
			useId: function() {
				return Q = "useId", z(), Ar().memoizedState;
			},
			useFormState: function(e) {
				return Q = "useFormState", z(), yr(), li(e);
			},
			useActionState: function(e) {
				return Q = "useActionState", z(), li(e);
			},
			useOptimistic: function(e, t) {
				return Q = "useOptimistic", z(), Zr(e, t);
			},
			useHostTransitionStatus: Fi,
			useMemoCache: Nr,
			useCacheRefresh: function() {
				return Q = "useCacheRefresh", z(), Ar().memoizedState;
			},
			useEffectEvent: function(e) {
				return Q = "useEffectEvent", z(), gi(e);
			}
		}, jh = {
			readContext: function(e) {
				return h(), Rt(e);
			},
			use: function(e) {
				return m(), B(e);
			},
			useCallback: function(e, t) {
				return Q = "useCallback", m(), R(), xi(e, t);
			},
			useContext: function(e) {
				return Q = "useContext", m(), R(), Rt(e);
			},
			useEffect: function(e, t) {
				return Q = "useEffect", m(), R(), pi(e, t);
			},
			useImperativeHandle: function(e, t, n) {
				return Q = "useImperativeHandle", m(), R(), yi(e, t, n);
			},
			useInsertionEffect: function(e, t) {
				Q = "useInsertionEffect", m(), R(), fi(4, ih, e, t);
			},
			useLayoutEffect: function(e, t) {
				return Q = "useLayoutEffect", m(), R(), _i(e, t);
			},
			useMemo: function(e, t) {
				Q = "useMemo", m(), R();
				var n = G.H;
				G.H = jh;
				try {
					return Ci(e, t);
				} finally {
					G.H = n;
				}
			},
			useReducer: function(e, t, n) {
				Q = "useReducer", m(), R();
				var r = G.H;
				G.H = jh;
				try {
					return Fr(e, t, n);
				} finally {
					G.H = r;
				}
			},
			useRef: function(e) {
				return Q = "useRef", m(), R(), di(e);
			},
			useState: function(e) {
				Q = "useState", m(), R();
				var t = G.H;
				G.H = jh;
				try {
					return qr(e);
				} finally {
					G.H = t;
				}
			},
			useDebugValue: function() {
				Q = "useDebugValue", m(), R();
			},
			useDeferredValue: function(e, t) {
				return Q = "useDeferredValue", m(), R(), Ti(e, t);
			},
			useTransition: function() {
				return Q = "useTransition", m(), R(), Mi();
			},
			useSyncExternalStore: function(e, t, n) {
				return Q = "useSyncExternalStore", m(), R(), zr(e, t, n);
			},
			useId: function() {
				return Q = "useId", m(), R(), Ii();
			},
			useFormState: function(e, t) {
				return Q = "useFormState", m(), R(), ai(e, t);
			},
			useActionState: function(e, t) {
				return Q = "useActionState", m(), R(), ai(e, t);
			},
			useOptimistic: function(e) {
				return Q = "useOptimistic", m(), R(), Jr(e);
			},
			useMemoCache: function(e) {
				return m(), Nr(e);
			},
			useHostTransitionStatus: Fi,
			useCacheRefresh: function() {
				return Q = "useCacheRefresh", R(), Li();
			},
			useEffectEvent: function(e) {
				return Q = "useEffectEvent", m(), R(), hi(e);
			}
		}, Mh = {
			readContext: function(e) {
				return h(), Rt(e);
			},
			use: function(e) {
				return m(), B(e);
			},
			useCallback: function(e, t) {
				return Q = "useCallback", m(), z(), Si(e, t);
			},
			useContext: function(e) {
				return Q = "useContext", m(), z(), Rt(e);
			},
			useEffect: function(e, t) {
				Q = "useEffect", m(), z(), V(2048, oh, e, t);
			},
			useImperativeHandle: function(e, t, n) {
				return Q = "useImperativeHandle", m(), z(), bi(e, t, n);
			},
			useInsertionEffect: function(e, t) {
				return Q = "useInsertionEffect", m(), z(), V(4, ih, e, t);
			},
			useLayoutEffect: function(e, t) {
				return Q = "useLayoutEffect", m(), z(), V(4, ah, e, t);
			},
			useMemo: function(e, t) {
				Q = "useMemo", m(), z();
				var n = G.H;
				G.H = Mh;
				try {
					return wi(e, t);
				} finally {
					G.H = n;
				}
			},
			useReducer: function(e, t, n) {
				Q = "useReducer", m(), z();
				var r = G.H;
				G.H = Mh;
				try {
					return Ir(e, t, n);
				} finally {
					G.H = r;
				}
			},
			useRef: function() {
				return Q = "useRef", m(), z(), Ar().memoizedState;
			},
			useState: function() {
				Q = "useState", m(), z();
				var e = G.H;
				G.H = Mh;
				try {
					return Ir(Pr);
				} finally {
					G.H = e;
				}
			},
			useDebugValue: function() {
				Q = "useDebugValue", m(), z();
			},
			useDeferredValue: function(e, t) {
				return Q = "useDeferredValue", m(), z(), Ei(e, t);
			},
			useTransition: function() {
				return Q = "useTransition", m(), z(), Ni();
			},
			useSyncExternalStore: function(e, t, n) {
				return Q = "useSyncExternalStore", m(), z(), Br(e, t, n);
			},
			useId: function() {
				return Q = "useId", m(), z(), Ar().memoizedState;
			},
			useFormState: function(e) {
				return Q = "useFormState", m(), z(), oi(e);
			},
			useActionState: function(e) {
				return Q = "useActionState", m(), z(), oi(e);
			},
			useOptimistic: function(e, t) {
				return Q = "useOptimistic", m(), z(), Yr(e, t);
			},
			useMemoCache: function(e) {
				return m(), Nr(e);
			},
			useHostTransitionStatus: Fi,
			useCacheRefresh: function() {
				return Q = "useCacheRefresh", z(), Ar().memoizedState;
			},
			useEffectEvent: function(e) {
				return Q = "useEffectEvent", m(), z(), gi(e);
			}
		}, Nh = {
			readContext: function(e) {
				return h(), Rt(e);
			},
			use: function(e) {
				return m(), B(e);
			},
			useCallback: function(e, t) {
				return Q = "useCallback", m(), z(), Si(e, t);
			},
			useContext: function(e) {
				return Q = "useContext", m(), z(), Rt(e);
			},
			useEffect: function(e, t) {
				Q = "useEffect", m(), z(), V(2048, oh, e, t);
			},
			useImperativeHandle: function(e, t, n) {
				return Q = "useImperativeHandle", m(), z(), bi(e, t, n);
			},
			useInsertionEffect: function(e, t) {
				return Q = "useInsertionEffect", m(), z(), V(4, ih, e, t);
			},
			useLayoutEffect: function(e, t) {
				return Q = "useLayoutEffect", m(), z(), V(4, ah, e, t);
			},
			useMemo: function(e, t) {
				Q = "useMemo", m(), z();
				var n = G.H;
				G.H = Mh;
				try {
					return wi(e, t);
				} finally {
					G.H = n;
				}
			},
			useReducer: function(e, t, n) {
				Q = "useReducer", m(), z();
				var r = G.H;
				G.H = Mh;
				try {
					return Rr(e, t, n);
				} finally {
					G.H = r;
				}
			},
			useRef: function() {
				return Q = "useRef", m(), z(), Ar().memoizedState;
			},
			useState: function() {
				Q = "useState", m(), z();
				var e = G.H;
				G.H = Mh;
				try {
					return Rr(Pr);
				} finally {
					G.H = e;
				}
			},
			useDebugValue: function() {
				Q = "useDebugValue", m(), z();
			},
			useDeferredValue: function(e, t) {
				return Q = "useDeferredValue", m(), z(), Di(e, t);
			},
			useTransition: function() {
				return Q = "useTransition", m(), z(), Pi();
			},
			useSyncExternalStore: function(e, t, n) {
				return Q = "useSyncExternalStore", m(), z(), Br(e, t, n);
			},
			useId: function() {
				return Q = "useId", m(), z(), Ar().memoizedState;
			},
			useFormState: function(e) {
				return Q = "useFormState", m(), z(), li(e);
			},
			useActionState: function(e) {
				return Q = "useActionState", m(), z(), li(e);
			},
			useOptimistic: function(e, t) {
				return Q = "useOptimistic", m(), z(), Zr(e, t);
			},
			useMemoCache: function(e) {
				return m(), Nr(e);
			},
			useHostTransitionStatus: Fi,
			useCacheRefresh: function() {
				return Q = "useCacheRefresh", z(), Ar().memoizedState;
			},
			useEffectEvent: function(e) {
				return Q = "useEffectEvent", m(), z(), gi(e);
			}
		};
		var Ph = {}, Fh = /* @__PURE__ */ new Set(), Ih = /* @__PURE__ */ new Set(), Lh = /* @__PURE__ */ new Set(), Rh = /* @__PURE__ */ new Set(), zh = /* @__PURE__ */ new Set(), Bh = /* @__PURE__ */ new Set(), Vh = /* @__PURE__ */ new Set(), Hh = /* @__PURE__ */ new Set(), Uh = /* @__PURE__ */ new Set(), Wh = /* @__PURE__ */ new Set();
		Object.freeze(Ph);
		var Gh = {
			enqueueSetState: function(e, t, n) {
				e = e._reactInternals;
				var r = as(e), i = er(r);
				i.payload = t, n != null && (Ki(n), i.callback = n), t = tr(e, i, r), t !== null && (Wt(r, "this.setState()", e), ss(t, e, r), nr(t, e, r));
			},
			enqueueReplaceState: function(e, t, n) {
				e = e._reactInternals;
				var r = as(e), i = er(r);
				i.tag = Hm, i.payload = t, n != null && (Ki(n), i.callback = n), t = tr(e, i, r), t !== null && (Wt(r, "this.replaceState()", e), ss(t, e, r), nr(t, e, r));
			},
			enqueueForceUpdate: function(e, t) {
				e = e._reactInternals;
				var n = as(e), r = er(n);
				r.tag = Um, t != null && (Ki(t), r.callback = t), t = tr(e, r, n), t !== null && (Wt(n, "this.forceUpdate()", e), ss(t, e, n), nr(t, e, n));
			}
		}, Kh = null, qh = null, Jh = Error("This is not a real error. It's an implementation detail of React's selective hydration feature. If this leaks into userspace, it's a bug in React. Please file an issue."), Yh = !1, Xh = {}, Zh = {}, Qh = {}, $h = {}, eg = !1, tg = {}, ng = {}, rg = {
			dehydrated: null,
			treeContext: null,
			retryLane: 0,
			hydrationErrors: null
		}, ig = !1, ag = null;
		ag = /* @__PURE__ */ new Set();
		var og = !1, sg = !1, cg = !1, lg = typeof WeakSet == "function" ? WeakSet : Set, ug = null, dg = null, fg = null, pg = null, mg = !1, hg = null, gg = !1, _g = 8192, vg = {
			getCacheForType: function(e) {
				var t = Rt(Yf), n = t.data.get(e);
				return n === void 0 && (n = e(), t.data.set(e, n)), n;
			},
			cacheSignal: function() {
				return Rt(Yf).controller.signal;
			},
			getOwner: function() {
				return kf;
			}
		}, yg = 0, bg = 1, xg = 2, Sg = 3, Cg = 4;
		if (typeof Symbol == "function" && Symbol.for) {
			var wg = Symbol.for;
			yg = wg("selector.component"), bg = wg("selector.has_pseudo_class"), xg = wg("selector.role"), Sg = wg("selector.test_id"), Cg = wg("selector.text");
		}
		var Tg = [], Eg = typeof WeakMap == "function" ? WeakMap : Map, Dg = 0, Og = 2, kg = 4, Ag = 0, jg = 1, Mg = 2, Ng = 3, Pg = 4, Fg = 6, Ig = 5, Lg = Dg, Rg = null, zg = null, $ = 0, Bg = 0, Vg = 1, Hg = 2, Ug = 3, Wg = 4, Gg = 5, Kg = 6, qg = 7, Jg = 8, Yg = 9, Xg = Bg, Zg = null, Qg = !1, $g = !1, e_ = !1, t_ = 0, n_ = Ag, r_ = 0, i_ = 0, a_ = 0, o_ = 0, s_ = 0, c_ = null, l_ = null, u_ = !1, d_ = 0, f_ = 0, p_ = 300, m_ = Infinity, h_ = 500, g_ = null, __ = null, v_ = null, y_ = 0, b_ = 1, x_ = 2, S_ = 3, C_ = 0, w_ = 1, T_ = 2, E_ = 3, D_ = 4, O_ = 5, k_ = 0, A_ = null, j_ = null, M_ = 0, N_ = 0, P_ = -0, F_ = null, I_ = null, L_ = null, R_ = y_, z_ = null, B_ = 50, V_ = 0, H_ = null, U_ = !1, W_ = !1, G_ = 50, K_ = 0, q_ = null, J_ = !1, Y_ = null, X_ = !1, Z_ = /* @__PURE__ */ new Set(), Q_ = {}, $_ = null, ev = null, tv = !1;
		try {
			var nv = Object.preventExtensions({});
			new Map([[nv, null]]), new Set([nv]);
		} catch {
			tv = !0;
		}
		var rv = !1, iv = {}, av = null, ov = null, sv = null, cv = null, lv = null, uv = null, dv = null, fv = null, pv = null, mv = null;
		return av = function(e, r, i, a) {
			r = t(e, r), r !== null && (i = n(r.memoizedState, i, 0, a), r.memoizedState = i, r.baseState = i, e.memoizedProps = Dc({}, e.memoizedProps), i = Yn(e, 2), i !== null && ss(i, e, 2));
		}, ov = function(e, n, r) {
			n = t(e, n), n !== null && (r = s(n.memoizedState, r, 0), n.memoizedState = r, n.baseState = r, e.memoizedProps = Dc({}, e.memoizedProps), r = Yn(e, 2), r !== null && ss(r, e, 2));
		}, sv = function(e, n, r, i) {
			n = t(e, n), n !== null && (r = a(n.memoizedState, r, i), n.memoizedState = r, n.baseState = r, e.memoizedProps = Dc({}, e.memoizedProps), r = Yn(e, 2), r !== null && ss(r, e, 2));
		}, cv = function(e, t, r) {
			e.pendingProps = n(e.memoizedProps, t, 0, r), e.alternate && (e.alternate.pendingProps = e.pendingProps), t = Yn(e, 2), t !== null && ss(t, e, 2);
		}, lv = function(e, t) {
			e.pendingProps = s(e.memoizedProps, t, 0), e.alternate && (e.alternate.pendingProps = e.pendingProps), t = Yn(e, 2), t !== null && ss(t, e, 2);
		}, uv = function(e, t, n) {
			e.pendingProps = a(e.memoizedProps, t, n), e.alternate && (e.alternate.pendingProps = e.pendingProps), t = Yn(e, 2), t !== null && ss(t, e, 2);
		}, dv = function(e) {
			var t = Yn(e, 2);
			t !== null && ss(t, e, 2);
		}, fv = function(e) {
			var t = k(), n = Yn(e, t);
			n !== null && ss(n, e, t);
		}, pv = function(e) {
			l = e;
		}, mv = function(e) {
			c = e;
		}, wc.attemptContinuousHydration = function(e) {
			if (e.tag === 13 || e.tag === 31) {
				var t = Yn(e, 67108864);
				t !== null && ss(t, e, 67108864), Sc(e, 67108864);
			}
		}, wc.attemptHydrationAtCurrentPriority = function(e) {
			if (e.tag === 13 || e.tag === 31) {
				var t = as(e);
				t = fe(t);
				var n = Yn(e, t);
				n !== null && ss(n, e, t), Sc(e, t);
			}
		}, wc.attemptSynchronousHydration = function(e) {
			switch (e.tag) {
				case 3:
					if (e = e.stateNode, e.current.memoizedState.isDehydrated) {
						var t = ae(e.pendingLanes);
						if (t !== 0) {
							for (e.pendingLanes |= 2, e.entangledLanes |= 2; t;) {
								var n = 1 << 31 - bd(t);
								e.entanglements[1] |= n, t &= ~n;
							}
							dn(e), (Lg & (Og | kg)) === Dg && (m_ = Ad() + h_, fn(0, !1));
						}
					}
					break;
				case 31:
				case 13: t = Yn(e, 2), t !== null && ss(t, e, 2), fs(), Sc(e, 2);
			}
		}, wc.batchedUpdates = function(e, t) {
			return e(t);
		}, wc.createComponentSelector = function(e) {
			return {
				$$typeof: yg,
				value: e
			};
		}, wc.createContainer = function(e, t, n, r, i, a, o, s, c, l) {
			return gc(e, t, !1, null, n, r, a, null, o, s, c, l);
		}, wc.createHasPseudoClassSelector = function(e) {
			return {
				$$typeof: bg,
				value: e
			};
		}, wc.createHydrationContainer = function(e, t, n, r, i, a, o, s, c, l, u, d, f, p) {
			return e = gc(n, r, !0, e, i, a, s, p, c, l, u, d), e.context = vc(null), n = e.current, r = as(n), r = fe(r), i = er(r), i.callback = t ?? null, tr(n, i, r), Wt(r, "hydrateRoot()", null), t = r, e.current.lanes = t, se(e, t), dn(e), e;
		}, wc.createPortal = function(e, t, n) {
			var r = 3 < arguments.length && arguments[3] !== void 0 ? arguments[3] : null;
			try {
				_c(r);
				var i = !1;
			} catch {
				i = !0;
			}
			return i && (console.error("The provided key is an unsupported type %s. This value must be coerced to a string before using it here.", typeof Symbol == "function" && Symbol.toStringTag && r[Symbol.toStringTag] || r.constructor.name || "Object"), _c(r)), {
				$$typeof: Ac,
				key: r == null ? null : "" + r,
				children: e,
				containerInfo: t,
				implementation: n
			};
		}, wc.createRoleSelector = function(e) {
			return {
				$$typeof: xg,
				value: e
			};
		}, wc.createTestNameSelector = function(e) {
			return {
				$$typeof: Sg,
				value: e
			};
		}, wc.createTextSelector = function(e) {
			return {
				$$typeof: Cg,
				value: e
			};
		}, wc.defaultOnCaughtError = function(e) {
			var t = Kh ? "The above error occurred in the <" + Kh + "> component." : "The above error occurred in one of your React components.", n = "React will try to recreate this component tree from scratch using the error boundary you provided, " + ((qh || "Anonymous") + ".");
			typeof e == "object" && e && typeof e.environmentName == "string" ? Nl("error", [
				"%o\n\n%s\n\n%s\n",
				e,
				t,
				n
			], e.environmentName)() : console.error("%o\n\n%s\n\n%s\n", e, t, n);
		}, wc.defaultOnRecoverableError = function(e) {
			Kd(e);
		}, wc.defaultOnUncaughtError = function(e) {
			Kd(e), console.warn("%s\n\n%s\n", Kh ? "An error occurred in the <" + Kh + "> component." : "An error occurred in one of your React components.", "Consider adding an error boundary to your tree to customize error handling behavior.\nVisit https://react.dev/link/error-boundaries to learn more about error boundaries.");
		}, wc.deferredUpdates = function(e) {
			var t = G.T, n = hl();
			try {
				return ml(32), G.T = null, e();
			} finally {
				ml(n), G.T = t;
			}
		}, wc.discreteUpdates = function(e, t, n, r, i) {
			var a = G.T, o = hl();
			try {
				return ml(2), G.T = null, e(t, n, r, i);
			} finally {
				ml(o), G.T = a, Lg === Dg && (m_ = Ad() + h_);
			}
		}, wc.findAllNodes = ns, wc.findBoundingRects = function(e, t) {
			if (!Il) throw Error("Test selector API is not supported by this renderer.");
			t = ns(e, t), e = [];
			for (var n = 0; n < t.length; n++) e.push(Rl(t[n]));
			for (t = e.length - 1; 0 < t; t--) {
				n = e[t];
				for (var r = n.x, i = r + n.width, a = n.y, o = a + n.height, s = t - 1; 0 <= s; s--) if (t !== s) {
					var c = e[s], l = c.x, u = l + c.width, d = c.y, f = d + c.height;
					if (r >= l && a >= d && i <= u && o <= f) {
						e.splice(t, 1);
						break;
					} else if (!(r !== l || n.width !== c.width || f < a || d > o)) {
						d > a && (c.height += d - a, c.y = a), f < o && (c.height = o - d), e.splice(t, 1);
						break;
					} else if (!(a !== d || n.height !== c.height || u < r || l > i)) {
						l > r && (c.width += l - r, c.x = r), u < i && (c.width = i - l), e.splice(t, 1);
						break;
					}
				}
			}
			return e;
		}, wc.findHostInstance = function(e) {
			var t = e._reactInternals;
			if (t === void 0) throw typeof e.render == "function" ? Error("Unable to find node on an unmounted component.") : (e = Object.keys(e).join(","), Error("Argument appears to not be a ReactComponent. Keys: " + e));
			return e = ee(t), e === null ? null : Yc(e.stateNode);
		}, wc.findHostInstanceWithNoPortals = function(e) {
			return e = x(e), e = e === null ? null : te(e), e === null ? null : Yc(e.stateNode);
		}, wc.findHostInstanceWithWarning = function(e, t) {
			var n = e._reactInternals;
			if (n === void 0) throw typeof e.render == "function" ? Error("Unable to find node on an unmounted component.") : (e = Object.keys(e).join(","), Error("Argument appears to not be a ReactComponent. Keys: " + e));
			if (e = ee(n), e === null) return null;
			if (e.mode & 8) {
				var r = w(n) || "Component";
				iv[r] || (iv[r] = !0, F(e, function() {
					n.mode & 8 ? console.error("%s is deprecated in StrictMode. %s was passed an instance of %s which is inside StrictMode. Instead, add a ref directly to the element you want to reference. Learn more about using refs safely here: https://react.dev/link/strict-mode-find-node", t, t, r) : console.error("%s is deprecated in StrictMode. %s was passed an instance of %s which renders StrictMode children. Instead, add a ref directly to the element you want to reference. Learn more about using refs safely here: https://react.dev/link/strict-mode-find-node", t, t, r);
				}));
			}
			return Yc(e.stateNode);
		}, wc.flushPassiveEffects = Rs, wc.flushSyncFromReconciler = function(e) {
			var t = Lg;
			Lg |= 1;
			var n = G.T, r = hl();
			try {
				if (ml(2), G.T = null, e) return e();
			} finally {
				ml(r), G.T = n, Lg = t, (Lg & (Og | kg)) === Dg && fn(0, !1);
			}
		}, wc.flushSyncWork = fs, wc.focusWithin = function(e, t) {
			if (!Il) throw Error("Test selector API is not supported by this renderer.");
			for (e = Qo(e), t = ts(e, t), t = Array.from(t), e = 0; e < t.length;) {
				var n = t[e++], r = n.tag;
				if (!Bl(n)) {
					if ((r === 5 || r === 26 || r === 27) && Hl(n.stateNode)) return !0;
					for (n = n.child; n !== null;) t.push(n), n = n.sibling;
				}
			}
			return !1;
		}, wc.getFindAllNodesFailureDescription = function(e, t) {
			if (!Il) throw Error("Test selector API is not supported by this renderer.");
			var n = 0, r = [];
			e = [Qo(e), 0];
			for (var i = 0; i < e.length;) {
				var a = e[i++], o = a.tag, s = e[i++], c = t[s];
				if ((o !== 5 && o !== 26 && o !== 27 || !Bl(a)) && ($o(a, c) && (r.push(es(c)), s++, s > n && (n = s)), s < t.length)) for (a = a.child; a !== null;) e.push(a, s), a = a.sibling;
			}
			if (n < t.length) {
				for (e = []; n < t.length; n++) e.push(es(t[n]));
				return "findAllNodes was able to match part of the selector:\n  " + (r.join(" > ") + "\n\nNo matching component was found for:\n  ") + e.join(" > ");
			}
			return null;
		}, wc.getPublicRootInstance = function(e) {
			if (e = e.current, !e.child) return null;
			switch (e.child.tag) {
				case 27:
				case 5: return Yc(e.child.stateNode);
				default: return e.child.stateNode;
			}
		}, wc.injectIntoDevTools = function() {
			var e = {
				bundleType: 1,
				version: Kc,
				rendererPackageName: qc,
				currentDispatcherRef: G,
				reconcilerVersion: "19.2.0"
			};
			return Jc !== null && (e.rendererConfig = Jc), e.overrideHookState = av, e.overrideHookStateDeletePath = ov, e.overrideHookStateRenamePath = sv, e.overrideProps = cv, e.overridePropsDeletePath = lv, e.overridePropsRenamePath = uv, e.scheduleUpdate = dv, e.scheduleRetry = fv, e.setErrorHandler = pv, e.setSuspenseHandler = mv, e.scheduleRefresh = f, e.scheduleRoot = d, e.setRefreshHandler = p, e.getCurrentFiber = Cc, ge(e);
		}, wc.isAlreadyRendering = ps, wc.observeVisibleRects = function(e, t, n, r) {
			function i() {
				var n = ns(e, t);
				a.forEach(function(e) {
					0 > n.indexOf(e) && c(e);
				}), n.forEach(function(e) {
					0 > a.indexOf(e) && s(e);
				});
			}
			if (!Il) throw Error("Test selector API is not supported by this renderer.");
			var a = ns(e, t);
			n = Ul(a, n, r);
			var o = n.disconnect, s = n.observe, c = n.unobserve;
			return Tg.push(i), { disconnect: function() {
				var e = Tg.indexOf(i);
				0 <= e && Tg.splice(e, 1), o();
			} };
		}, wc.shouldError = function(e) {
			return l(e);
		}, wc.shouldSuspend = function(e) {
			return c(e);
		}, wc.startHostTransition = function(e, t, n, r) {
			if (e.tag !== 5) throw Error("Expected the form instance to be a HostComponent. This is a bug in React.");
			var i = ji(e).queue;
			Gt(e), H(e, i, t, Al, n === null ? g : function() {
				G.T === null && console.error("requestFormReset was called outside a transition or action. To fix, move to an action, or wrap with startTransition.");
				var t = ji(e);
				return t.next === null && (t = e.alternate.memoizedState), Vi(e, t.next.queue, {}, as(e)), n(r);
			});
		}, wc.updateContainer = function(e, t, n, r) {
			var i = t.current, a = as(i);
			return bc(i, a, e, t, n, r), a;
		}, wc.updateContainerSync = yc, wc;
	}, t.exports.default = t.exports, Object.defineProperty(t.exports, "__esModule", { value: !0 }));
})), va = /* @__PURE__ */ t(((e, t) => {
	process.env.NODE_ENV === "production" ? t.exports = ga() : t.exports = _a();
})), ya = /* @__PURE__ */ t(((e) => {
	e.ConcurrentRoot = 1, e.ContinuousEventPriority = 8, e.DefaultEventPriority = 32, e.DiscreteEventPriority = 2, e.IdleEventPriority = 268435456, e.LegacyRoot = 0, e.NoEventPriority = 0;
})), ba = /* @__PURE__ */ t(((e) => {
	process.env.NODE_ENV !== "production" && (e.ConcurrentRoot = 1, e.ContinuousEventPriority = 8, e.DefaultEventPriority = 32, e.DiscreteEventPriority = 2, e.IdleEventPriority = 268435456, e.LegacyRoot = 0, e.NoEventPriority = 0);
})), xa = /* @__PURE__ */ t(((e, t) => {
	process.env.NODE_ENV === "production" ? t.exports = ya() : t.exports = ba();
})), Sa = /* @__PURE__ */ n(va()), Ca = xa(), wa = {
	children: !0,
	ref: !0,
	key: !0,
	style: !0,
	forwardedRef: !0,
	unstable_applyCache: !0,
	unstable_applyDrawHitFromCache: !0
}, Ta = !1, Ea = !1, Da = ".react-konva-event", Oa = !1, ka = "ReactKonva: You have a Konva node with draggable = true and position defined but no onDragMove or onDragEnd events are handled.\nPosition of a node will be changed during drag&drop, so you should update state of the react app as well.\nConsider to add onDragMove or onDragEnd events.\nFor more info see: https://github.com/konvajs/react-konva/issues/256\n", Aa = "ReactKonva: You are using \"zIndex\" attribute for a Konva node.\nreact-konva may get confused with ordering. Just define correct order of elements in your render function of a component.\nFor more info see: https://github.com/konvajs/react-konva/issues/194\n", ja = {}, Ma = () => {};
function Na(e) {
	Ma = e;
}
var Pa = !1;
function Fa(e) {
	return function(...t) {
		let n = e.apply(this, t);
		if (!Pa) {
			Pa = !0;
			try {
				Ma();
			} finally {
				Pa = !1;
			}
		}
		return n;
	};
}
function Ia(e, t, n = ja) {
	if (!Ta && "zIndex" in t && (console.warn(Aa), Ta = !0), !Ea && t.draggable) {
		var r = t.x !== void 0 || t.y !== void 0, i = t.onDragEnd || t.onDragMove;
		r && !i && (console.warn(ka), Ea = !0);
	}
	for (var a in n) if (!wa[a]) {
		var o = a.slice(0, 2) === "on", s = n[a] !== t[a];
		if (o && s) {
			var c = a.substr(2).toLowerCase();
			c.substr(0, 7) === "content" && (c = "content" + c.substr(7, 1).toUpperCase() + c.substr(8)), e.off(c + Da);
		}
		t.hasOwnProperty(a) || e.setAttr(a, void 0);
	}
	var l = Oa || t._useStrictMode, u = {}, d = !1;
	let f = {};
	for (var a in t) if (!wa[a]) {
		var o = a.slice(0, 2) === "on", p = n[a] !== t[a];
		if (o && p) {
			var c = a.substr(2).toLowerCase();
			c.substr(0, 7) === "content" && (c = "content" + c.substr(7, 1).toUpperCase() + c.substr(8)), t[a] && (f[c] = t[a]);
		}
		!o && (t[a] !== n[a] || l && t[a] !== e.getAttr(a)) && (d = !0, u[a] = t[a]);
	}
	for (var c in d && (e.setAttrs(u), La(e)), f) e.off(c + Da), e.on(c + Da, Fa(f[c]));
}
function La(e) {
	if (!A.autoDrawEnabled) {
		var t = e.getLayer() || e.getStage();
		t && t.batchDraw();
	}
}
//#endregion
//#region node_modules/react-konva/es/ReactKonvaHostConfig.js
var Ra = /* @__PURE__ */ e({
	HostTransitionContext: () => Bo,
	NotPendingTransition: () => null,
	afterActiveInstanceBlur: () => Co,
	appendChild: () => ao,
	appendChildToContainer: () => oo,
	appendInitialChild: () => Ua,
	beforeActiveInstanceBlur: () => So,
	cancelTimeout: () => no,
	clearContainer: () => yo,
	commitMount: () => po,
	commitTextUpdate: () => fo,
	commitUpdate: () => mo,
	createInstance: () => Wa,
	createTextInstance: () => Ga,
	detachDeletedInstance: () => bo,
	finalizeInitialChildren: () => Ka,
	getChildHostContext: () => eo,
	getCurrentEventPriority: () => wo,
	getCurrentUpdatePriority: () => Oo,
	getInstanceFromNode: () => xo,
	getInstanceFromScope: () => Eo,
	getPublicInstance: () => qa,
	getRootHostContext: () => $a,
	hideInstance: () => ho,
	hideTextInstance: () => go,
	idlePriority: () => za.unstable_IdlePriority,
	insertBefore: () => so,
	insertInContainerBefore: () => co,
	isPrimaryRenderer: () => !1,
	maySuspendCommit: () => Fo,
	noTimeout: () => -1,
	now: () => za.unstable_now,
	preloadInstance: () => Io,
	prepareForCommit: () => Ja,
	preparePortalMount: () => Ya,
	prepareScopeUpdate: () => To,
	prepareUpdate: () => Xa,
	removeChild: () => lo,
	removeChildFromContainer: () => uo,
	requestPostPaintCallback: () => Po,
	resetAfterCommit: () => U,
	resetFormInstance: () => Vo,
	resetTextContent: () => Za,
	resolveEventTimeStamp: () => No,
	resolveEventType: () => Mo,
	resolveUpdatePriority: () => ko,
	run: () => za.unstable_runWithPriority,
	scheduleMicrotask: () => ro,
	scheduleTimeout: () => to,
	setCurrentUpdatePriority: () => Do,
	shouldAttemptEagerTransition: () => Ao,
	shouldDeprioritizeSubtree: () => Qa,
	shouldSetTextContent: () => io,
	startSuspendingCommit: () => Lo,
	supportsHydration: () => !1,
	supportsMicrotasks: () => !0,
	supportsMutation: () => !0,
	supportsPersistence: () => !1,
	suspendInstance: () => Ro,
	trackSchedulerEvent: () => jo,
	unhideInstance: () => _o,
	unhideTextInstance: () => vo,
	waitForCommitToBeReady: () => zo,
	warnsIfNotActing: () => !1
}), za = i(), Ba = {}, Va = {};
ha.Node.prototype._applyProps = Ia;
var Ha = Ca.DefaultEventPriority;
function Ua(e, t) {
	if (typeof t == "string") {
		console.error(`Do not use plain text as child of Konva.Node. You are using text: ${t}`);
		return;
	}
	e.add(t), La(e);
}
function Wa(e, t, n) {
	let r = ha[e];
	r ||= (console.error(`Konva has no node with the type ${e}. Group will be used instead. If you use minimal version of react-konva, just import required nodes into Konva: "import "konva/lib/shapes/${e}"  If you want to render DOM elements as part of canvas tree take a look into this demo: https://konvajs.github.io/docs/react/DOM_Portal.html`), ha.Group);
	let i = {}, a = {};
	for (var o in t) o !== "ref" && (o.slice(0, 2) === "on" ? a[o] = t[o] : i[o] = t[o]);
	let s = new r(i);
	return Ia(s, a), s;
}
function Ga(e, t, n) {
	console.error(`Text components are not supported for now in ReactKonva. Your text is: "${e}"`);
}
function Ka(e, t, n) {
	return !1;
}
function qa(e) {
	return e;
}
function Ja() {
	return null;
}
function Ya() {
	return null;
}
function Xa(e, t, n, r) {
	return Va;
}
function U() {}
function Za(e) {}
function Qa(e, t) {
	return !1;
}
function $a() {
	return Ba;
}
function eo() {
	return Ba;
}
var to = setTimeout, no = clearTimeout, ro = typeof queueMicrotask == "function" ? queueMicrotask : (e) => Promise.resolve(null).then(e);
function io(e, t) {
	return !1;
}
function ao(e, t) {
	t.parent === e ? t.moveToTop() : e.add(t), La(e);
}
function oo(e, t) {
	t.parent === e ? t.moveToTop() : e.add(t), La(e);
}
function so(e, t, n) {
	t._remove(), e.add(t), t.setZIndex(n.getZIndex()), La(e);
}
function co(e, t, n) {
	so(e, t, n);
}
function lo(e, t) {
	t.destroy(), t.off(Da), La(e);
}
function uo(e, t) {
	t.destroy(), t.off(Da), La(e);
}
function fo(e, t, n) {
	console.error(`Text components are not yet supported in ReactKonva. You text is: "${n}"`);
}
function po(e, t, n) {}
function mo(e, t, n, r) {
	Ia(e, r, n);
}
function ho(e) {
	e.hide(), La(e);
}
function go(e) {}
function _o(e, t) {
	(t.visible == null || t.visible) && e.show();
}
function vo(e, t) {}
function yo(e) {}
function bo() {}
function xo() {
	return null;
}
function So() {}
function Co() {}
function wo() {
	return Ca.DefaultEventPriority;
}
function To() {}
function Eo() {
	return null;
}
function Do(e) {
	Ha = e;
}
function Oo() {
	return Ha;
}
function ko() {
	return Ca.DiscreteEventPriority;
}
function Ao() {
	return !1;
}
function jo() {}
function Mo() {
	return null;
}
function No() {
	return -1.1;
}
function Po() {}
function Fo() {
	return !1;
}
function Io() {
	return !0;
}
function Lo() {}
function Ro() {}
function zo() {
	return null;
}
var Bo = /* @__PURE__ */ D.createContext(null);
function Vo() {}
typeof window < "u" && (window.document?.createElement || window.navigator?.product === "ReactNative") ? D.useLayoutEffect : D.useEffect;
function Ho(e, t, n) {
	if (!e) return;
	if (n(e) === !0) return e;
	let r = t ? e.return : e.child;
	for (; r;) {
		let e = Ho(r, t, n);
		if (e) return e;
		r = t ? null : r.sibling;
	}
}
function Uo(e) {
	try {
		return Object.defineProperties(e, {
			_currentRenderer: {
				get() {
					return null;
				},
				set() {}
			},
			_currentRenderer2: {
				get() {
					return null;
				},
				set() {}
			}
		});
	} catch {
		return e;
	}
}
var Wo = /* @__PURE__ */ Uo(/* @__PURE__ */ D.createContext(null)), Go = class extends D.Component {
	render() {
		return /* @__PURE__ */ D.createElement(Wo.Provider, { value: this._reactInternals }, this.props.children);
	}
};
function Ko() {
	let e = D.useContext(Wo);
	if (e === null) throw Error("its-fine: useFiber must be called within a <FiberProvider />!");
	let t = D.useId();
	return D.useMemo(() => {
		for (let n of [e, e?.alternate]) {
			if (!n) continue;
			let e = Ho(n, !1, (e) => {
				let n = e.memoizedState;
				for (; n;) {
					if (n.memoizedState === t) return !0;
					n = n.next;
				}
			});
			if (e) return e;
		}
	}, [e, t]);
}
var qo = Symbol.for("react.context"), Jo = (e) => typeof e == "object" && !!e && "$$typeof" in e && e.$$typeof === qo;
function Yo() {
	let e = Ko(), [t] = D.useState(() => /* @__PURE__ */ new Map());
	t.clear();
	let n = e;
	for (; n;) {
		let e = n.type;
		Jo(e) && e !== Wo && !t.has(e) && t.set(e, D.use(Uo(e))), n = n.return;
	}
	return t;
}
function Xo() {
	let e = Yo();
	return D.useMemo(() => Array.from(e.keys()).reduce((t, n) => (r) => /* @__PURE__ */ D.createElement(t, null, /* @__PURE__ */ D.createElement(n.Provider, {
		...r,
		value: e.get(n)
	})), (e) => /* @__PURE__ */ D.createElement(Go, { ...e })), [e]);
}
function Zo(e) {
	let t = D.useRef({});
	return D.useLayoutEffect(() => {
		t.current = e;
	}), D.useLayoutEffect(() => () => {
		t.current = {};
	}, []), t.current;
}
var Qo = () => {
	let e = D.useRef(0);
	return D.useMemo(() => {
		e.current++;
	}, []), e.current > 1;
}, $o = (e) => {
	let t = D.useRef(null), n = D.useRef(null), r = D.useRef(null), i = Zo(e), a = Xo(), o = D.useRef(null), s = (t) => {
		let { forwardedRef: n } = e;
		n && (typeof n == "function" ? n(t) : n.current = t);
	}, c = Qo(), l = () => {
		s(null), os.flushSyncFromReconciler(() => {
			os.updateContainer(null, r.current, null);
		}), n.current?.destroy(), n.current = null;
	};
	return D.useLayoutEffect(() => (o.current &&= (clearTimeout(o.current), null), n.current ? s(n.current) : (n.current = new ha.Stage({
		width: e.width,
		height: e.height,
		container: t.current
	}), s(n.current), r.current = os.createContainer(n.current, Ca.ConcurrentRoot, null, !1, null, "", console.error, console.error, console.error, null), os.updateContainer(D.createElement(a, {}, e.children), r.current, null, () => {})), () => {
		c ? o.current = setTimeout(l, 0) : l();
	}), []), D.useLayoutEffect(() => {
		s(n.current), Ia(n.current, e, i), os.updateContainer(D.createElement(a, {}, e.children), r.current, null), os.flushSyncWork();
	}), D.createElement("div", {
		ref: t,
		id: e.id,
		accessKey: e.accessKey,
		className: e.className,
		role: e.role,
		style: e.style,
		tabIndex: e.tabIndex,
		title: e.title
	});
}, es = "Rect", ts = "Ellipse", ns = "Line", rs = "Image", is = "Text", as = "Arrow", os = (0, Sa.default)(Ra);
Na(() => os.flushSyncWork());
var ss = D.forwardRef((e, t) => D.createElement(Go, {}, D.createElement($o, {
	...e,
	forwardedRef: t
})));
//#endregion
//#region src/components/nodes/shared/image/composer/composerHistoryBudget.ts
function cs(e, t, n, r = (e) => URL.revokeObjectURL(e)) {
	let i = /* @__PURE__ */ new Set();
	for (let t of n) for (let n of t) n.type === "image" && e.has(n.src) && i.add(n.src);
	for (let n of Array.from(e)) t.has(n) || i.has(n) || (e.delete(n), r(n));
}
function ls(e) {
	let t = /* @__PURE__ */ new Set(), n = 0;
	for (let r of e) for (let e of r) e.type !== "image" || !e.image || t.has(e.image) || (t.add(e.image), n += g(e.width, e.height)?.bytes ?? 0);
	return n;
}
function us(e, t, n, r = v, i = 0) {
	let a = t, o = n, s = Number.isFinite(i) ? Math.max(0, i) : 0, c = (t, n) => ls([
		e,
		...t.map((e) => e.layers),
		...n.map((e) => e.layers)
	]) + s, l = c(a, o);
	for (; l > r && (a.length > 0 || o.length > 0);) {
		let e = a.length > 0 ? a.slice(1) : a, t = o.length > 0 ? o.slice(1) : o, n = a.length > 0 ? c(e, o) : Infinity, r = o.length > 0 ? c(a, t) : Infinity;
		n <= r ? (a = e, l = n) : (o = t, l = r);
	}
	return {
		past: a,
		future: o,
		totalBytes: l
	};
}
//#endregion
//#region src/types/composerTypes.ts
var ds = [
	{
		value: "source-over",
		label: "正常"
	},
	{
		value: "multiply",
		label: "正片叠底"
	},
	{
		value: "screen",
		label: "滤色"
	},
	{
		value: "overlay",
		label: "叠加"
	},
	{
		value: "darken",
		label: "变暗"
	},
	{
		value: "lighten",
		label: "变亮"
	},
	{
		value: "color-dodge",
		label: "颜色减淡"
	},
	{
		value: "color-burn",
		label: "颜色加深"
	},
	{
		value: "soft-light",
		label: "柔光"
	},
	{
		value: "hard-light",
		label: "强光"
	},
	{
		value: "difference",
		label: "差值"
	},
	{
		value: "exclusion",
		label: "排除"
	},
	{
		value: "hue",
		label: "色相"
	},
	{
		value: "saturation",
		label: "饱和度"
	},
	{
		value: "color",
		label: "颜色"
	},
	{
		value: "luminosity",
		label: "明度"
	}
], fs = {
	brightness: 0,
	contrast: 0,
	saturation: 0,
	hue: 0,
	luminance: 0,
	blur: 0,
	grayscale: !1,
	invert: !1,
	sepia: !1
}, ps = (e) => !e || e.brightness === 0 && e.contrast === 0 && e.saturation === 0 && e.hue === 0 && e.luminance === 0 && e.blur === 0 && !e.grayscale && !e.invert && !e.sepia, ms = () => `layer-${o()}`, hs = 600, gs = {
	width: 1024,
	height: 1024,
	bg: "transparent"
}, _s = (e, t, n, r) => ({
	id: e,
	name: t,
	x: n,
	y: r,
	rotation: 0,
	scaleX: 1,
	scaleY: 1,
	opacity: 1,
	visible: !0,
	locked: !1,
	blendMode: "source-over"
});
function vs() {
	let [e, t] = (0, D.useState)([]), [n, r] = (0, D.useState)(null), [i, a] = (0, D.useState)(gs), [o, s] = (0, D.useState)("select"), [c, l] = (0, D.useState)({
		color: "#ffffff",
		size: 12
	}), [u, d] = (0, D.useState)({
		past: 0,
		future: 0
	}), [f, p] = (0, D.useState)(0), m = (0, D.useRef)([]), _ = (0, D.useRef)(gs), y = (0, D.useRef)(null), b = (0, D.useRef)([]), x = (0, D.useRef)([]), S = (0, D.useRef)(null), ne = (0, D.useRef)(Promise.resolve()), C = (0, D.useRef)(/* @__PURE__ */ new Set()), w = (0, D.useRef)(/* @__PURE__ */ new Set()), T = (0, D.useCallback)((e = m.current) => {
		cs(C.current, w.current, [
			e,
			...b.current.map((e) => e.layers),
			...x.current.map((e) => e.layers)
		]);
	}, []), re = (0, D.useCallback)(() => {
		w.current.clear(), cs(C.current, w.current, []);
	}, []);
	(0, D.useEffect)(() => re, [re]);
	let E = (0, D.useCallback)((e) => {
		let n = us(e, b.current, x.current);
		(n.past !== b.current || n.future !== x.current) && (b.current = n.past, x.current = n.future, d({
			past: n.past.length,
			future: n.future.length
		}));
		let r = te(n.totalBytes);
		if (r) throw T(), RangeError(r);
		p(n.totalBytes), m.current = e, t(e), T(e);
	}, [T]), ie = (0, D.useCallback)((e) => {
		y.current = e, r(e);
	}, []), ae = (0, D.useCallback)((e) => {
		_.current = e, a(e);
	}, []), O = (0, D.useCallback)(() => {
		d({
			past: b.current.length,
			future: x.current.length
		});
	}, []), oe = (0, D.useCallback)(() => ({
		layers: m.current,
		canvas: _.current,
		selectedId: y.current
	}), []), k = (0, D.useCallback)((e) => {
		let t = Date.now();
		if (e && S.current?.tag === e && t - S.current.at < hs) {
			S.current.at = t;
			return;
		}
		S.current = e ? {
			tag: e,
			at: t
		} : null, b.current = [...b.current, oe()].slice(-80), x.current = [], O(), T();
	}, [
		T,
		oe,
		O
	]), A = (0, D.useCallback)((e) => {
		E(e.layers), ae(e.canvas), ie(e.layers.some((t) => t.id === e.selectedId) ? e.selectedId : null);
	}, [
		ae,
		E,
		ie
	]), se = (0, D.useCallback)(() => {
		let e = b.current.pop();
		e && (x.current = [...x.current, oe()].slice(-80), S.current = null, A(e), O());
	}, [
		A,
		oe,
		O
	]), ce = (0, D.useCallback)(() => {
		let e = x.current.pop();
		e && (b.current = [...b.current, oe()].slice(-80), S.current = null, A(e), O());
	}, [
		A,
		oe,
		O
	]), le = (0, D.useCallback)(() => {
		b.current = [], x.current = [], S.current = null, p(us(m.current, [], []).totalBytes), O(), T();
	}, [T, O]), ue = e.find((e) => e.id === n) ?? null, de = (0, D.useCallback)((e, t, n) => {
		n !== null && k(n), E(m.current.map((n) => n.id === e ? {
			...n,
			...t
		} : n));
	}, [E, k]), fe = (0, D.useCallback)((e) => {
		k(), E(m.current.filter((t) => t.id !== e)), y.current === e && ie(null);
	}, [
		E,
		k,
		ie
	]), pe = (0, D.useCallback)((e) => {
		let t = m.current.findIndex((t) => t.id === e);
		if (t < 0) return;
		k();
		let n = ms(), r = m.current[t], i = {
			...r,
			id: n,
			name: `${r.name} 副本`,
			x: r.x + 24,
			y: r.y + 24
		}, a = m.current.slice();
		a.splice(t + 1, 0, i), E(a), ie(n);
	}, [
		E,
		k,
		ie
	]), me = (0, D.useCallback)((e, t) => {
		let n = m.current.findIndex((t) => t.id === e);
		if (n < 0) return;
		k();
		let r = m.current.slice(), [i] = r.splice(n, 1);
		t === "top" ? r.push(i) : t === "bottom" ? r.unshift(i) : t === "up" ? r.splice(Math.min(n + 1, r.length), 0, i) : r.splice(Math.max(n - 1, 0), 0, i), E(r);
	}, [E, k]), he = (0, D.useCallback)((e, t) => {
		let n = m.current;
		if (e === t || e < 0 || e >= n.length || t < 0 || t >= n.length) return;
		k();
		let r = n.slice(), [i] = r.splice(e, 1);
		r.splice(t, 0, i), E(r);
	}, [E, k]), ge = (0, D.useCallback)((e) => {
		k(), E([...m.current, e]), ie(e.id);
	}, [
		E,
		k,
		ie
	]), j = (0, D.useCallback)((e) => {
		let t = ne.current.catch(() => void 0).then(e);
		return ne.current = t.then(() => void 0, () => void 0), t;
	}, []), _e = (0, D.useCallback)((e) => ee(e, {
		label: "合成器源图",
		beforeDecode: ({ width: e, height: t }) => {
			let n = g(e, t);
			if (!n) throw RangeError("图片图层尺寸无效，请重新添加图片");
			let r = us(m.current, b.current, x.current, v, n.bytes);
			(r.past !== b.current || r.future !== x.current) && (b.current = r.past, x.current = r.future, O()), T(), p(r.totalBytes - n.bytes);
			let i = te(r.totalBytes);
			if (i) throw RangeError(i);
		}
	}), [T, O]), ve = (0, D.useCallback)(async (e, t = "图片", n) => j(async () => {
		let r = await _e(e), i = r.naturalWidth, a = r.naturalHeight, o = /* @__PURE__ */ new Set(), s = h(m.current.reduce((e, t) => t.type !== "image" || !t.image || o.has(t.image) ? e : (o.add(t.image), e + (g(t.width, t.height)?.bytes ?? 0)), 0), i, a);
		if (s) throw RangeError(s);
		n?.(r);
		let c = _.current, l = Math.min(1, c.width * .9 / i, c.height * .9 / a);
		ge({
			..._s(ms(), t, c.width / 2, c.height / 2),
			type: "image",
			src: e,
			image: r,
			width: i,
			height: a,
			scaleX: l,
			scaleY: l,
			adjustments: { ...fs }
		});
	}), [
		ge,
		j,
		_e
	]), ye = (0, D.useCallback)((e, t) => j(async () => {
		let n = await _e(t);
		return de(e, {
			image: n,
			src: t,
			width: n.naturalWidth,
			height: n.naturalHeight
		}), n;
	}), [
		j,
		_e,
		de
	]), be = (0, D.useCallback)(async (e, t = e.name || "图片") => {
		let n = URL.createObjectURL(e);
		C.current.add(n), w.current.add(n);
		try {
			await ve(n, t), w.current.delete(n), T();
		} catch (e) {
			throw w.current.delete(n), C.current.delete(n) && URL.revokeObjectURL(n), e;
		}
	}, [ve, T]), xe = (0, D.useCallback)((e = "双击编辑文字", t = "文字") => {
		let n = _.current;
		ge({
			..._s(ms(), t, n.width / 2, n.height / 2),
			type: "text",
			text: e,
			fontSize: Math.round(n.height / 14),
			fontFamily: "sans-serif",
			fontStyle: "bold",
			fill: "#ffffff",
			align: "center",
			width: Math.round(n.width * .6),
			lineHeight: 1.2,
			letterSpacing: 0,
			stroke: "#000000",
			strokeWidth: 0,
			shadow: !1
		});
	}, [ge]), Se = (0, D.useCallback)((e) => {
		let t = _.current, n = t.width / 2, r = t.height / 2, i = Math.min(t.width, t.height) * .3, a = ms();
		ge(e === "rect" || e === "ellipse" ? {
			..._s(a, e === "rect" ? "矩形" : "椭圆", n, r),
			type: e,
			width: i,
			height: i * .7,
			fill: "#6366f1",
			stroke: "#ffffff",
			strokeWidth: 0,
			cornerRadius: 0
		} : {
			..._s(a, e === "line" ? "直线" : "箭头", n - i / 2, r),
			type: e,
			points: [
				0,
				0,
				i,
				0
			],
			stroke: "#ffffff",
			strokeWidth: Math.max(2, Math.round(i / 30))
		});
	}, [ge]), Ce = (0, D.useCallback)((e, t) => {
		e.length < 4 || ge({
			..._s(ms(), t ? "橡皮" : "画笔", 0, 0),
			type: "brush",
			points: e,
			stroke: c.color,
			strokeWidth: c.size,
			erase: t
		});
	}, [
		ge,
		c.color,
		c.size
	]), we = (0, D.useCallback)((e, t) => {
		t !== null && k(t), ae({
			..._.current,
			...e
		});
	}, [ae, k]), Te = (0, D.useCallback)((e, t) => {
		let n = m.current.find((t) => t.id === e);
		n && de(e, t === "x" ? { scaleX: -n.scaleX } : { scaleY: -n.scaleY });
	}, [de]), Ee = (0, D.useCallback)((e) => {
		de(e, {
			rotation: 0,
			scaleX: 1,
			scaleY: 1
		});
	}, [de]), M = (0, D.useCallback)((e, t, n) => {
		let r = m.current.find((t) => t.id === e);
		!r || r.type !== "image" || de(e, { adjustments: {
			...r.adjustments,
			...t
		} }, n);
	}, [de]), De = (0, D.useCallback)((e) => {
		de(e, { adjustments: { ...fs } });
	}, [de]), Oe = (0, D.useCallback)((e) => {
		s(e), e !== "select" && ie(null);
	}, [ie]), ke = (0, D.useCallback)((e) => {
		l((t) => ({
			...t,
			...e
		}));
	}, []), Ae = (0, D.useCallback)(() => {
		E([]), ie(null), ae(gs), s("select"), le(), re();
	}, [
		le,
		ae,
		E,
		re,
		ie
	]);
	return {
		layers: e,
		layersRef: m,
		selectedId: n,
		setSelectedId: ie,
		selectedLayer: ue,
		canvas: i,
		canvasRef: _,
		updateCanvas: we,
		tool: o,
		setTool: Oe,
		brush: c,
		setBrush: ke,
		updateLayer: de,
		removeLayer: fe,
		duplicateLayer: pe,
		reorderLayer: me,
		moveLayerToIndex: he,
		addImageLayer: ve,
		addImageFileLayer: be,
		replaceImageLayer: ye,
		addText: xe,
		addShape: Se,
		addBrushStroke: Ce,
		flipLayer: Te,
		resetTransform: Ee,
		setAdjustments: M,
		resetAdjustments: De,
		pushHistory: k,
		undo: se,
		redo: ce,
		canUndo: u.past > 0,
		canRedo: u.future > 0,
		retainedImageBytes: f,
		clearHistory: le,
		reset: Ae
	};
}
//#endregion
//#region src/components/nodes/shared/image/composer/composerRange.ts
function ys(e, t, n) {
	let r = n - t;
	if (r <= 0) return {};
	let i = (e - t) / r * 100, a = t < 0 && n > 0 ? (0 - t) / r * 100 : 0;
	return {
		"--range-from": `${Math.min(a, i)}%`,
		"--range-to": `${Math.max(a, i)}%`
	};
}
//#endregion
//#region src/components/nodes/shared/image/composer/ComposerToolbar.tsx
var W = a(), bs = {
	"720p": 720,
	"1K": 1024,
	"2K": 2048,
	"4K": 4096
};
function xs(e, t) {
	let n = bs[t] ?? 1024, [r, i] = e.split(":").map(Number);
	return !r || !i ? {
		w: n,
		h: n
	} : r >= i ? {
		w: n,
		h: Math.round(n * i / r)
	} : {
		w: Math.round(n * r / i),
		h: n
	};
}
var Ss = [
	"1:1",
	"9:16",
	"16:9",
	"3:4",
	"4:3",
	"3:2",
	"2:3",
	"5:4",
	"4:5",
	"21:9",
	"1:4",
	"4:1",
	"1:8",
	"8:1"
];
function Cs(e, t) {
	let n = e / t, r = Ss[0], i = Infinity;
	for (let e of Ss) {
		let [t, a] = e.split(":").map(Number), o = Math.abs(n - t / a);
		o < i && (i = o, r = e);
	}
	return r;
}
var ws = [
	{
		label: "透明",
		value: "transparent"
	},
	{
		label: "白",
		value: "#ffffff"
	},
	{
		label: "黑",
		value: "#000000"
	}
], Ts = [
	{
		type: "rect",
		label: "矩形"
	},
	{
		type: "ellipse",
		label: "椭圆"
	},
	{
		type: "line",
		label: "直线"
	},
	{
		type: "arrow",
		label: "箭头"
	}
];
function Es({ composer: e, canExport: t, onFit: n, onExport: r, onClose: i }) {
	let { canvas: a, updateCanvas: o, addImageLayer: c, addImageFileLayer: l, addText: u, addShape: d, tool: f, setTool: p, brush: h, setBrush: g, undo: _, redo: v, canUndo: y, canRedo: b } = e, x = (0, D.useRef)(null), [ee, S] = (0, D.useState)(null), te = (e) => S((t) => t === e ? null : e), [ne, w] = (0, D.useState)("1K"), T = Cs(a.width, a.height), re = (e) => {
		let { w: t, h: n } = xs(e, ne);
		o({
			width: t,
			height: n
		});
	}, E = (e) => {
		w(e);
		let { w: t, h: n } = xs(T, e);
		o({
			width: t,
			height: n
		});
	}, ie = s((e) => e.nodes).filter((e) => e.type === "ai-image" && e.data?.imageUrl);
	return /* @__PURE__ */ (0, W.jsxs)("div", {
		"data-tauri-drag-region": !0,
		className: "composer-toolbar",
		children: [
			/* @__PURE__ */ (0, W.jsxs)("div", {
				className: "composer-toolbar-main",
				children: [
					/* @__PURE__ */ (0, W.jsx)(m, {
						className: "crop-aspect-btn icon-only",
						"data-tooltip": "撤销 (⌘Z)",
						"aria-label": "撤销",
						disabled: !y,
						onClick: _,
						children: /* @__PURE__ */ (0, W.jsxs)("svg", {
							viewBox: "0 0 24 24",
							fill: "none",
							stroke: "currentColor",
							strokeWidth: "2",
							strokeLinecap: "round",
							strokeLinejoin: "round",
							width: "16",
							height: "16",
							children: [/* @__PURE__ */ (0, W.jsx)("path", { d: "M9 14L4 9l5-5" }), /* @__PURE__ */ (0, W.jsx)("path", { d: "M4 9h10a6 6 0 0 1 0 12h-3" })]
						})
					}),
					/* @__PURE__ */ (0, W.jsx)(m, {
						className: "crop-aspect-btn icon-only",
						"data-tooltip": "重做 (⇧⌘Z)",
						"aria-label": "重做",
						disabled: !b,
						onClick: v,
						children: /* @__PURE__ */ (0, W.jsxs)("svg", {
							viewBox: "0 0 24 24",
							fill: "none",
							stroke: "currentColor",
							strokeWidth: "2",
							strokeLinecap: "round",
							strokeLinejoin: "round",
							width: "16",
							height: "16",
							children: [/* @__PURE__ */ (0, W.jsx)("path", { d: "M15 14l5-5-5-5" }), /* @__PURE__ */ (0, W.jsx)("path", { d: "M20 9H10a6 6 0 0 0 0 12h3" })]
						})
					}),
					/* @__PURE__ */ (0, W.jsx)("div", { className: "crop-bar-divider" }),
					/* @__PURE__ */ (0, W.jsx)(m, {
						className: `crop-aspect-btn icon-only${f === "select" ? " active" : ""}`,
						"data-tooltip": "选择 (V)",
						"aria-label": "选择工具",
						onClick: () => p("select"),
						children: /* @__PURE__ */ (0, W.jsx)("svg", {
							viewBox: "0 0 24 24",
							fill: "none",
							stroke: "currentColor",
							strokeWidth: "2",
							width: "16",
							height: "16",
							children: /* @__PURE__ */ (0, W.jsx)("path", { d: "M4 3l7 17 2.5-6.5L20 11z" })
						})
					}),
					/* @__PURE__ */ (0, W.jsxs)("div", {
						className: "composer-dd",
						children: [/* @__PURE__ */ (0, W.jsx)(m, {
							className: `crop-aspect-btn icon-only${f === "brush" ? " active" : ""}`,
							"data-tooltip": "画笔 (B) — 再次点击设置笔刷",
							"aria-label": "画笔",
							onClick: () => f === "brush" ? te("brush") : p("brush"),
							children: /* @__PURE__ */ (0, W.jsxs)("svg", {
								viewBox: "0 0 24 24",
								fill: "none",
								stroke: "currentColor",
								strokeWidth: "2",
								width: "16",
								height: "16",
								children: [/* @__PURE__ */ (0, W.jsx)("path", { d: "M15 4l5 5L9 20H4v-5z" }), /* @__PURE__ */ (0, W.jsx)("path", { d: "M13.5 5.5l5 5" })]
							})
						}), ee === "brush" && /* @__PURE__ */ (0, W.jsxs)("div", {
							className: "composer-menu composer-brush-menu",
							onMouseLeave: () => S(null),
							children: [/* @__PURE__ */ (0, W.jsxs)("div", {
								className: "composer-menu-custom",
								children: [/* @__PURE__ */ (0, W.jsx)("span", { children: "颜色" }), /* @__PURE__ */ (0, W.jsx)("input", {
									type: "color",
									value: h.color,
									onChange: (e) => g({ color: e.target.value })
								})]
							}), /* @__PURE__ */ (0, W.jsxs)("div", {
								className: "composer-menu-custom",
								children: [/* @__PURE__ */ (0, W.jsxs)("span", { children: [
									"粗细 ",
									h.size,
									"px"
								] }), /* @__PURE__ */ (0, W.jsx)("input", {
									type: "range",
									min: 1,
									max: 120,
									value: h.size,
									style: ys(h.size, 1, 120),
									onChange: (e) => g({ size: +e.target.value })
								})]
							})]
						})]
					}),
					/* @__PURE__ */ (0, W.jsx)(m, {
						className: `crop-aspect-btn icon-only${f === "eraser" ? " active" : ""}`,
						"data-tooltip": "橡皮 (E)",
						"aria-label": "橡皮",
						onClick: () => p("eraser"),
						children: /* @__PURE__ */ (0, W.jsxs)("svg", {
							viewBox: "0 0 24 24",
							fill: "none",
							stroke: "currentColor",
							strokeWidth: "2",
							width: "16",
							height: "16",
							children: [/* @__PURE__ */ (0, W.jsx)("path", { d: "M4 15l7-7 6 6-5 5H6z" }), /* @__PURE__ */ (0, W.jsx)("path", { d: "M9 20h11" })]
						})
					}),
					/* @__PURE__ */ (0, W.jsx)("div", { className: "crop-bar-divider" }),
					/* @__PURE__ */ (0, W.jsx)(m, {
						className: "crop-aspect-btn icon-only",
						"data-tooltip": "上传图片",
						"aria-label": "上传图片",
						onClick: () => x.current?.click(),
						children: /* @__PURE__ */ (0, W.jsxs)("svg", {
							viewBox: "0 0 24 24",
							fill: "none",
							stroke: "currentColor",
							strokeWidth: "2",
							width: "16",
							height: "16",
							children: [
								/* @__PURE__ */ (0, W.jsx)("path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }),
								/* @__PURE__ */ (0, W.jsx)("polyline", { points: "17 8 12 3 7 8" }),
								/* @__PURE__ */ (0, W.jsx)("line", {
									x1: "12",
									y1: "3",
									x2: "12",
									y2: "15"
								})
							]
						})
					}),
					/* @__PURE__ */ (0, W.jsx)("input", {
						ref: x,
						type: "file",
						accept: "image/*",
						hidden: !0,
						onChange: (e) => {
							let t = e.target.files?.[0];
							t && (l(t, t.name).catch((e) => {
								s.getState().showToast(e instanceof Error ? e.message : "图片导入失败", "error");
							}), e.target.value = "");
						}
					}),
					/* @__PURE__ */ (0, W.jsxs)("div", {
						className: "composer-dd",
						children: [/* @__PURE__ */ (0, W.jsx)(m, {
							className: "crop-aspect-btn icon-only",
							"data-tooltip": "从画布添加图片",
							"aria-label": "从画布添加图片",
							onClick: () => te("canvas"),
							children: /* @__PURE__ */ (0, W.jsxs)("svg", {
								viewBox: "0 0 24 24",
								fill: "none",
								stroke: "currentColor",
								strokeWidth: "2",
								width: "16",
								height: "16",
								children: [
									/* @__PURE__ */ (0, W.jsx)("rect", {
										x: "3",
										y: "3",
										width: "18",
										height: "18",
										rx: "2"
									}),
									/* @__PURE__ */ (0, W.jsx)("circle", {
										cx: "8.5",
										cy: "9",
										r: "1.5"
									}),
									/* @__PURE__ */ (0, W.jsx)("path", { d: "M21 15l-5-5L5 21" })
								]
							})
						}), ee === "canvas" && /* @__PURE__ */ (0, W.jsxs)("div", {
							className: "composer-menu",
							onMouseLeave: () => S(null),
							children: [ie.length === 0 && /* @__PURE__ */ (0, W.jsx)("div", {
								className: "composer-menu-empty",
								children: "画布暂无图片节点"
							}), ie.map((e) => {
								let t = e.data;
								return /* @__PURE__ */ (0, W.jsxs)("button", {
									type: "button",
									className: "composer-menu-item",
									onClick: () => {
										S(null), c(t.imageUrl, t.label || "图片").catch((e) => {
											s.getState().showToast(e instanceof Error ? e.message : "图片导入失败", "error");
										});
									},
									children: [/* @__PURE__ */ (0, W.jsx)("img", {
										src: t.imageUrl,
										alt: ""
									}), /* @__PURE__ */ (0, W.jsx)("span", { children: t.label || "图片" })]
								}, e.id);
							})]
						})]
					}),
					/* @__PURE__ */ (0, W.jsx)(m, {
						className: "crop-aspect-btn icon-only",
						"data-tooltip": "文字",
						"aria-label": "文字",
						onClick: () => u(),
						children: /* @__PURE__ */ (0, W.jsx)("svg", {
							viewBox: "0 0 24 24",
							fill: "none",
							stroke: "currentColor",
							strokeWidth: "2",
							width: "16",
							height: "16",
							children: /* @__PURE__ */ (0, W.jsx)("path", { d: "M5 6V4h14v2M9 20h6M12 4v16" })
						})
					}),
					/* @__PURE__ */ (0, W.jsxs)("div", {
						className: "composer-dd",
						children: [/* @__PURE__ */ (0, W.jsx)(m, {
							className: "crop-aspect-btn icon-only",
							"data-tooltip": "形状",
							"aria-label": "形状",
							onClick: () => te("shape"),
							children: /* @__PURE__ */ (0, W.jsxs)("svg", {
								viewBox: "0 0 24 24",
								fill: "none",
								stroke: "currentColor",
								strokeWidth: "2",
								width: "16",
								height: "16",
								children: [/* @__PURE__ */ (0, W.jsx)("rect", {
									x: "3",
									y: "10",
									width: "11",
									height: "11",
									rx: "1"
								}), /* @__PURE__ */ (0, W.jsx)("circle", {
									cx: "15.5",
									cy: "7.5",
									r: "4.5"
								})]
							})
						}), ee === "shape" && /* @__PURE__ */ (0, W.jsx)("div", {
							className: "composer-menu",
							onMouseLeave: () => S(null),
							children: Ts.map((e) => /* @__PURE__ */ (0, W.jsx)("button", {
								type: "button",
								className: "composer-menu-item row",
								onClick: () => {
									d(e.type), S(null);
								},
								children: e.label
							}, e.type))
						})]
					}),
					/* @__PURE__ */ (0, W.jsx)("div", { className: "crop-bar-divider" }),
					/* @__PURE__ */ (0, W.jsx)(C, {
						imageSize: ne,
						aspectRatio: T,
						onChangeImageSize: E,
						onChangeAspectRatio: re,
						showAdaptive: !1,
						placement: "bottom"
					}),
					/* @__PURE__ */ (0, W.jsxs)("div", {
						className: "composer-dd",
						children: [/* @__PURE__ */ (0, W.jsx)(m, {
							className: "crop-aspect-btn icon-only",
							"data-tooltip": "背景",
							"aria-label": "背景",
							onClick: () => te("bg"),
							children: /* @__PURE__ */ (0, W.jsxs)("svg", {
								viewBox: "0 0 24 24",
								fill: "none",
								stroke: "currentColor",
								strokeWidth: "2",
								width: "16",
								height: "16",
								children: [/* @__PURE__ */ (0, W.jsx)("rect", {
									x: "3",
									y: "3",
									width: "18",
									height: "18",
									rx: "2"
								}), /* @__PURE__ */ (0, W.jsx)("path", { d: "M3 12h18M12 3v18" })]
							})
						}), ee === "bg" && /* @__PURE__ */ (0, W.jsxs)("div", {
							className: "composer-menu",
							onMouseLeave: () => S(null),
							children: [ws.map((e) => /* @__PURE__ */ (0, W.jsx)("button", {
								type: "button",
								className: `composer-menu-item row${a.bg === e.value ? " active" : ""}`,
								onClick: () => {
									o({ bg: e.value }), S(null);
								},
								children: e.label
							}, e.label)), /* @__PURE__ */ (0, W.jsxs)("div", {
								className: "composer-menu-custom",
								children: [/* @__PURE__ */ (0, W.jsx)("span", { children: "自定义" }), /* @__PURE__ */ (0, W.jsx)("input", {
									type: "color",
									value: a.bg === "transparent" ? "#ffffff" : a.bg,
									onChange: (e) => o({ bg: e.target.value }, "canvas-bg")
								})]
							})]
						})]
					})
				]
			}),
			/* @__PURE__ */ (0, W.jsxs)("div", {
				className: "composer-toolbar-actions",
				children: [/* @__PURE__ */ (0, W.jsx)(m, {
					className: "crop-aspect-btn icon-only",
					"data-tooltip": "适配画布 (⌘0)",
					"aria-label": "适配画布",
					onClick: n,
					children: /* @__PURE__ */ (0, W.jsx)("svg", {
						viewBox: "0 0 24 24",
						fill: "none",
						stroke: "currentColor",
						strokeWidth: "2",
						width: "16",
						height: "16",
						children: /* @__PURE__ */ (0, W.jsx)("path", { d: "M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" })
					})
				}), /* @__PURE__ */ (0, W.jsxs)(m, {
					className: "crop-action-btn confirm",
					"data-tooltip": "合成为新节点",
					"aria-label": "导出",
					disabled: !t,
					onClick: r,
					children: [/* @__PURE__ */ (0, W.jsx)("svg", {
						viewBox: "0 0 24 24",
						fill: "none",
						stroke: "currentColor",
						strokeWidth: "2",
						width: "16",
						height: "16",
						children: /* @__PURE__ */ (0, W.jsx)("path", { d: "M3 17l5-5 3 3 8-8" })
					}), /* @__PURE__ */ (0, W.jsx)("span", { children: "合成" })]
				})]
			}),
			/* @__PURE__ */ (0, W.jsx)(m, {
				className: "composer-toolbar-close crop-aspect-btn crop-aspect-close act-cancel",
				"data-tooltip": "关闭 (Esc)",
				"aria-label": "关闭",
				onClick: i,
				children: /* @__PURE__ */ (0, W.jsx)("svg", {
					viewBox: "0 0 24 24",
					fill: "none",
					stroke: "currentColor",
					strokeWidth: "2",
					width: "18",
					height: "18",
					children: /* @__PURE__ */ (0, W.jsx)("path", { d: "M18 6L6 18M6 6l12 12" })
				})
			})
		]
	});
}
//#endregion
//#region src/components/nodes/shared/image/composer/composerUi.tsx
function Ds({ label: e, value: t, min: n, max: r, step: i = 1, display: a, onChange: o }) {
	return /* @__PURE__ */ (0, W.jsxs)("label", {
		className: "composer-field",
		children: [
			/* @__PURE__ */ (0, W.jsx)("span", { children: e }),
			/* @__PURE__ */ (0, W.jsx)("input", {
				type: "range",
				min: n,
				max: r,
				step: i,
				value: t,
				style: ys(t, n, r),
				onChange: (e) => o(+e.target.value)
			}),
			/* @__PURE__ */ (0, W.jsx)("em", {
				className: "composer-field-value",
				children: a ?? Math.round(t * 100) / 100
			})
		]
	});
}
function Os({ label: e, value: t, min: n, max: r, step: i = 1, onCommit: a }) {
	let [o, s] = (0, D.useState)(null);
	return /* @__PURE__ */ (0, W.jsxs)("label", {
		className: "composer-num",
		children: [/* @__PURE__ */ (0, W.jsx)("span", { children: e }), /* @__PURE__ */ (0, W.jsx)("input", {
			type: "number",
			min: n,
			max: r,
			step: i,
			value: o ?? String(Math.round(t * 100) / 100),
			onChange: (e) => s(e.target.value),
			onBlur: () => {
				if (o === null) return;
				let e = Number(o);
				s(null), Number.isFinite(e) && a(e);
			},
			onKeyDown: (e) => {
				e.key === "Enter" && e.target.blur();
			}
		})]
	});
}
//#endregion
//#region src/components/nodes/shared/image/composer/ComposerSidePanel.tsx
var ks = (e) => e.type === "image" || e.type === "rect" || e.type === "ellipse", As = (e) => e.type !== "image", js = [
	{
		value: "sans-serif",
		label: "无衬线"
	},
	{
		value: "serif",
		label: "衬线"
	},
	{
		value: "monospace",
		label: "等宽"
	},
	{
		value: "PingFang SC, Microsoft YaHei, sans-serif",
		label: "苹方 / 雅黑"
	},
	{
		value: "Songti SC, SimSun, serif",
		label: "宋体"
	}
], Ms = [
	{
		dir: "left",
		icon: "⇤",
		tip: "左对齐"
	},
	{
		dir: "hcenter",
		icon: "⇔",
		tip: "水平居中"
	},
	{
		dir: "right",
		icon: "⇥",
		tip: "右对齐"
	},
	{
		dir: "top",
		icon: "⤒",
		tip: "顶对齐"
	},
	{
		dir: "vcenter",
		icon: "⇕",
		tip: "垂直居中"
	},
	{
		dir: "bottom",
		icon: "⤓",
		tip: "底对齐"
	}
], Ns = [
	{
		key: "brightness",
		label: "亮度",
		min: -1,
		max: 1,
		step: .01
	},
	{
		key: "contrast",
		label: "对比度",
		min: -100,
		max: 100,
		step: 1
	},
	{
		key: "saturation",
		label: "饱和度",
		min: -2,
		max: 2,
		step: .02
	},
	{
		key: "hue",
		label: "色相",
		min: 0,
		max: 359,
		step: 1
	},
	{
		key: "luminance",
		label: "明度",
		min: -1,
		max: 1,
		step: .01
	},
	{
		key: "blur",
		label: "模糊",
		min: 0,
		max: 40,
		step: 1
	}
];
function Ps({ composer: e, nodeId: t, collapsed: n, onToggleCollapsed: r, animateIn: i, onMatteSubject: a, mattingLayerId: o, onAlign: c, onFitLayer: l }) {
	let { layers: u, selectedId: d, setSelectedId: f, selectedLayer: p, canvas: h, updateCanvas: g, updateLayer: _, removeLayer: v, duplicateLayer: y, reorderLayer: b, moveLayerToIndex: x, addImageLayer: ee, addText: S, flipLayer: te, resetTransform: ne, setAdjustments: C, resetAdjustments: w } = e, [T, re] = (0, D.useState)(null), [E, ie] = (0, D.useState)(null), ae = s((e) => e.nodes), O = s((e) => e.edges), oe = (0, D.useMemo)(() => {
		let e = /* @__PURE__ */ new Set();
		for (let n of O) n.source === t && e.add(n.target), n.target === t && e.add(n.source);
		return ae.filter((t) => e.has(t.id)).map((e) => {
			let t = e.data, n = t.imageUrl || t.thumbnailUrl, r = t.output || t.prompt;
			return {
				id: e.id,
				label: t.label || "节点",
				img: n,
				text: r
			};
		}).filter((e) => e.img || e.text);
	}, [
		ae,
		O,
		t
	]), k = (e, t) => p && _(p.id, e, t), A = p && (p.type === "rect" || p.type === "ellipse") ? p : null, se = p && As(p) ? p : null, ce = p && ks(p) ? p : null, le = (e, t) => {
		if (!ce || t <= 0) return;
		let n = e === "w" ? ce.width : ce.height;
		if (!n) return;
		let r = e === "w" ? ce.scaleX : ce.scaleY, i = t / n * (r < 0 ? -1 : 1);
		k(e === "w" ? { scaleX: i } : { scaleY: i });
	}, ue = (e) => {
		if (E === null) return;
		let t = u.length - 1 - E, n = u.length - 1 - e;
		ie(null), x(t, n);
	}, de = (e, t) => {
		ee(e, t).catch((e) => {
			s.getState().showToast(e instanceof Error ? e.message : "图片导入失败", "error");
		});
	}, fe = p?.type === "text" ? p.fontStyle : "", pe = (e) => {
		let t = fe.includes(e), n = new Set(fe.split(" ").filter(Boolean));
		t ? n.delete(e) : n.add(e), k({ fontStyle: n.size ? Array.from(n).join(" ") : "normal" });
	};
	return /* @__PURE__ */ (0, W.jsxs)(W.Fragment, { children: [n && /* @__PURE__ */ (0, W.jsx)("button", {
		type: "button",
		className: "composer-side-expand",
		"data-tooltip": "展开属性面板",
		"aria-label": "展开属性面板",
		onClick: r,
		children: /* @__PURE__ */ (0, W.jsx)("svg", {
			viewBox: "0 0 24 24",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			width: "16",
			height: "16",
			children: /* @__PURE__ */ (0, W.jsx)("path", { d: "M15 18l-6-6 6-6" })
		})
	}), /* @__PURE__ */ (0, W.jsxs)("div", {
		className: `composer-side${n ? " collapsed" : ""}${i ? "" : " no-enter"}`,
		children: [
			/* @__PURE__ */ (0, W.jsxs)("div", {
				className: "composer-side-head",
				children: [/* @__PURE__ */ (0, W.jsx)("span", {
					className: "composer-side-heading",
					children: "属性"
				}), /* @__PURE__ */ (0, W.jsx)("button", {
					type: "button",
					className: "composer-icon-btn",
					"data-tooltip": "收起面板",
					"aria-label": "收起面板",
					onClick: r,
					children: /* @__PURE__ */ (0, W.jsx)("svg", {
						viewBox: "0 0 24 24",
						fill: "none",
						stroke: "currentColor",
						strokeWidth: "2",
						width: "14",
						height: "14",
						children: /* @__PURE__ */ (0, W.jsx)("path", { d: "M9 18l6-6-6-6" })
					})
				})]
			}),
			/* @__PURE__ */ (0, W.jsxs)("div", {
				className: "composer-side-section",
				children: [/* @__PURE__ */ (0, W.jsx)("div", {
					className: "composer-side-title",
					children: "图层"
				}), /* @__PURE__ */ (0, W.jsxs)("div", {
					className: "composer-layer-list",
					children: [u.length === 0 && /* @__PURE__ */ (0, W.jsx)("div", {
						className: "composer-menu-empty",
						children: "还没有图层"
					}), u.slice().reverse().map((e, t) => /* @__PURE__ */ (0, W.jsxs)("div", {
						draggable: !0,
						onDragStart: () => ie(t),
						onDragOver: (e) => e.preventDefault(),
						onDrop: () => ue(t),
						onDragEnd: () => ie(null),
						className: `composer-layer-item${e.id === d ? " active" : ""}${E === t ? " dragging" : ""}`,
						onClick: () => f(e.id),
						onDoubleClick: () => re(e.id),
						children: [
							/* @__PURE__ */ (0, W.jsx)("button", {
								type: "button",
								className: "composer-icon-btn",
								"data-tooltip": e.visible ? "隐藏" : "显示",
								onClick: (t) => {
									t.stopPropagation(), _(e.id, { visible: !e.visible });
								},
								children: e.visible ? "👁" : "🚫"
							}),
							e.type === "image" && /* @__PURE__ */ (0, W.jsx)("img", {
								className: "composer-layer-thumb",
								src: e.src,
								alt: ""
							}),
							T === e.id ? /* @__PURE__ */ (0, W.jsx)("input", {
								className: "composer-layer-rename",
								autoFocus: !0,
								defaultValue: e.name,
								onClick: (e) => e.stopPropagation(),
								onBlur: (t) => {
									_(e.id, { name: t.target.value.trim() || e.name }), re(null);
								},
								onKeyDown: (e) => {
									e.key === "Enter" ? e.target.blur() : e.key === "Escape" && re(null);
								}
							}) : /* @__PURE__ */ (0, W.jsx)("span", {
								className: "composer-layer-name",
								children: e.name
							}),
							/* @__PURE__ */ (0, W.jsx)("button", {
								type: "button",
								className: `composer-icon-btn${e.locked ? " on" : ""}`,
								"data-tooltip": e.locked ? "解锁" : "锁定",
								onClick: (t) => {
									t.stopPropagation(), _(e.id, { locked: !e.locked });
								},
								children: e.locked ? "🔒" : "🔓"
							}),
							/* @__PURE__ */ (0, W.jsx)("button", {
								type: "button",
								className: "composer-icon-btn danger",
								"data-tooltip": "删除",
								onClick: (t) => {
									t.stopPropagation(), v(e.id);
								},
								children: "✕"
							})
						]
					}, e.id))]
				})]
			}),
			p && /* @__PURE__ */ (0, W.jsxs)(W.Fragment, { children: [
				/* @__PURE__ */ (0, W.jsxs)("div", {
					className: "composer-side-section",
					children: [
						/* @__PURE__ */ (0, W.jsx)("div", {
							className: "composer-side-title",
							children: "变换"
						}),
						/* @__PURE__ */ (0, W.jsxs)("div", {
							className: "composer-num-grid",
							children: [
								/* @__PURE__ */ (0, W.jsx)(Os, {
									label: "X",
									value: p.x,
									onCommit: (e) => k({ x: e })
								}),
								/* @__PURE__ */ (0, W.jsx)(Os, {
									label: "Y",
									value: p.y,
									onCommit: (e) => k({ y: e })
								}),
								ce && /* @__PURE__ */ (0, W.jsxs)(W.Fragment, { children: [/* @__PURE__ */ (0, W.jsx)(Os, {
									label: "宽",
									value: ce.width * Math.abs(ce.scaleX),
									min: 1,
									onCommit: (e) => le("w", e)
								}), /* @__PURE__ */ (0, W.jsx)(Os, {
									label: "高",
									value: ce.height * Math.abs(ce.scaleY),
									min: 1,
									onCommit: (e) => le("h", e)
								})] }),
								/* @__PURE__ */ (0, W.jsx)(Os, {
									label: "旋转",
									value: p.rotation,
									min: -360,
									max: 360,
									onCommit: (e) => k({ rotation: e })
								})
							]
						}),
						/* @__PURE__ */ (0, W.jsxs)("div", {
							className: "composer-field",
							children: [/* @__PURE__ */ (0, W.jsx)("span", { children: "翻转" }), /* @__PURE__ */ (0, W.jsxs)("div", {
								className: "composer-seg",
								children: [
									/* @__PURE__ */ (0, W.jsx)("button", {
										type: "button",
										"data-tooltip": "水平翻转",
										onClick: () => te(p.id, "x"),
										children: "⇋"
									}),
									/* @__PURE__ */ (0, W.jsx)("button", {
										type: "button",
										"data-tooltip": "垂直翻转",
										onClick: () => te(p.id, "y"),
										children: "⇵"
									}),
									/* @__PURE__ */ (0, W.jsx)("button", {
										type: "button",
										"data-tooltip": "重置旋转与缩放",
										onClick: () => ne(p.id),
										children: "↺"
									})
								]
							})]
						}),
						/* @__PURE__ */ (0, W.jsxs)("div", {
							className: "composer-field",
							children: [/* @__PURE__ */ (0, W.jsx)("span", { children: "对齐" }), /* @__PURE__ */ (0, W.jsx)("div", {
								className: "composer-seg wrap",
								children: Ms.map((e) => /* @__PURE__ */ (0, W.jsx)("button", {
									type: "button",
									"data-tooltip": e.tip,
									onClick: () => c(e.dir),
									children: e.icon
								}, e.dir))
							})]
						}),
						/* @__PURE__ */ (0, W.jsxs)("div", {
							className: "composer-side-actions",
							children: [/* @__PURE__ */ (0, W.jsx)(m, {
								className: "crop-aspect-btn",
								"data-tooltip": "等比放入画布",
								onClick: () => l("contain"),
								children: "适配画布"
							}), /* @__PURE__ */ (0, W.jsx)(m, {
								className: "crop-aspect-btn",
								"data-tooltip": "等比铺满画布",
								onClick: () => l("cover"),
								children: "铺满画布"
							})]
						})
					]
				}),
				/* @__PURE__ */ (0, W.jsxs)("div", {
					className: "composer-side-section",
					children: [
						/* @__PURE__ */ (0, W.jsx)("div", {
							className: "composer-side-title",
							children: "外观"
						}),
						/* @__PURE__ */ (0, W.jsx)(Ds, {
							label: "透明度",
							value: p.opacity,
							min: 0,
							max: 1,
							step: .01,
							display: `${Math.round(p.opacity * 100)}%`,
							onChange: (e) => k({ opacity: e }, `opacity:${p.id}`)
						}),
						/* @__PURE__ */ (0, W.jsxs)("label", {
							className: "composer-field",
							children: [/* @__PURE__ */ (0, W.jsx)("span", { children: "混合" }), /* @__PURE__ */ (0, W.jsx)("select", {
								className: "composer-select",
								value: p.blendMode,
								onChange: (e) => k({ blendMode: e.target.value }),
								children: ds.map((e) => /* @__PURE__ */ (0, W.jsx)("option", {
									value: e.value,
									children: e.label
								}, e.value))
							})]
						}),
						p.type === "text" && /* @__PURE__ */ (0, W.jsxs)(W.Fragment, { children: [
							/* @__PURE__ */ (0, W.jsxs)("label", {
								className: "composer-field",
								children: [/* @__PURE__ */ (0, W.jsx)("span", { children: "字体" }), /* @__PURE__ */ (0, W.jsx)("select", {
									className: "composer-select",
									value: p.fontFamily,
									onChange: (e) => k({ fontFamily: e.target.value }),
									children: js.map((e) => /* @__PURE__ */ (0, W.jsx)("option", {
										value: e.value,
										children: e.label
									}, e.value))
								})]
							}),
							/* @__PURE__ */ (0, W.jsxs)("div", {
								className: "composer-num-grid",
								children: [
									/* @__PURE__ */ (0, W.jsx)(Os, {
										label: "字号",
										value: p.fontSize,
										min: 8,
										max: 600,
										onCommit: (e) => k({ fontSize: e })
									}),
									/* @__PURE__ */ (0, W.jsx)(Os, {
										label: "行高",
										value: p.lineHeight,
										min: .5,
										max: 4,
										step: .05,
										onCommit: (e) => k({ lineHeight: e })
									}),
									/* @__PURE__ */ (0, W.jsx)(Os, {
										label: "字距",
										value: p.letterSpacing,
										min: -20,
										max: 100,
										onCommit: (e) => k({ letterSpacing: e })
									}),
									/* @__PURE__ */ (0, W.jsx)(Os, {
										label: "框宽",
										value: p.width,
										min: 20,
										onCommit: (e) => k({ width: e })
									})
								]
							}),
							/* @__PURE__ */ (0, W.jsxs)("label", {
								className: "composer-field",
								children: [/* @__PURE__ */ (0, W.jsx)("span", { children: "颜色" }), /* @__PURE__ */ (0, W.jsx)("input", {
									type: "color",
									value: p.fill,
									onChange: (e) => k({ fill: e.target.value }, `fill:${p.id}`)
								})]
							}),
							/* @__PURE__ */ (0, W.jsxs)("div", {
								className: "composer-field",
								children: [/* @__PURE__ */ (0, W.jsx)("span", { children: "样式" }), /* @__PURE__ */ (0, W.jsxs)("div", {
									className: "composer-seg",
									children: [
										/* @__PURE__ */ (0, W.jsx)("button", {
											type: "button",
											className: fe.includes("bold") ? "active" : "",
											onClick: () => pe("bold"),
											children: /* @__PURE__ */ (0, W.jsx)("b", { children: "B" })
										}),
										/* @__PURE__ */ (0, W.jsx)("button", {
											type: "button",
											className: fe.includes("italic") ? "active" : "",
											onClick: () => pe("italic"),
											children: /* @__PURE__ */ (0, W.jsx)("i", { children: "I" })
										}),
										/* @__PURE__ */ (0, W.jsx)("button", {
											type: "button",
											className: p.shadow ? "active" : "",
											"data-tooltip": "投影",
											onClick: () => k({ shadow: !p.shadow }),
											children: "◍"
										})
									]
								})]
							}),
							/* @__PURE__ */ (0, W.jsxs)("div", {
								className: "composer-field",
								children: [/* @__PURE__ */ (0, W.jsx)("span", { children: "对齐" }), /* @__PURE__ */ (0, W.jsx)("div", {
									className: "composer-seg",
									children: [
										"left",
										"center",
										"right"
									].map((e) => /* @__PURE__ */ (0, W.jsx)("button", {
										type: "button",
										className: p.align === e ? "active" : "",
										onClick: () => k({ align: e }),
										children: e === "left" ? "左" : e === "center" ? "中" : "右"
									}, e))
								})]
							})
						] }),
						A && /* @__PURE__ */ (0, W.jsxs)("label", {
							className: "composer-field",
							children: [/* @__PURE__ */ (0, W.jsx)("span", { children: "填充" }), /* @__PURE__ */ (0, W.jsx)("input", {
								type: "color",
								value: A.fill,
								onChange: (e) => k({ fill: e.target.value }, `fill:${A.id}`)
							})]
						}),
						se && /* @__PURE__ */ (0, W.jsxs)(W.Fragment, { children: [/* @__PURE__ */ (0, W.jsxs)("label", {
							className: "composer-field",
							children: [/* @__PURE__ */ (0, W.jsx)("span", { children: "描边色" }), /* @__PURE__ */ (0, W.jsx)("input", {
								type: "color",
								value: se.stroke,
								onChange: (e) => k({ stroke: e.target.value }, `stroke:${se.id}`)
							})]
						}), /* @__PURE__ */ (0, W.jsx)(Ds, {
							label: "描边宽",
							value: se.strokeWidth,
							min: 0,
							max: 80,
							onChange: (e) => k({ strokeWidth: e }, `strokeWidth:${se.id}`)
						})] }),
						p.type === "rect" && /* @__PURE__ */ (0, W.jsx)(Ds, {
							label: "圆角",
							value: p.cornerRadius,
							min: 0,
							max: 400,
							onChange: (e) => k({ cornerRadius: e }, `radius:${p.id}`)
						}),
						/* @__PURE__ */ (0, W.jsxs)("div", {
							className: "composer-field",
							children: [/* @__PURE__ */ (0, W.jsx)("span", { children: "层级" }), /* @__PURE__ */ (0, W.jsxs)("div", {
								className: "composer-seg",
								children: [
									/* @__PURE__ */ (0, W.jsx)("button", {
										type: "button",
										onClick: () => b(p.id, "bottom"),
										"data-tooltip": "置底",
										children: "⤓"
									}),
									/* @__PURE__ */ (0, W.jsx)("button", {
										type: "button",
										onClick: () => b(p.id, "down"),
										"data-tooltip": "下移 (⌘[)",
										children: "▽"
									}),
									/* @__PURE__ */ (0, W.jsx)("button", {
										type: "button",
										onClick: () => b(p.id, "up"),
										"data-tooltip": "上移 (⌘])",
										children: "△"
									}),
									/* @__PURE__ */ (0, W.jsx)("button", {
										type: "button",
										onClick: () => b(p.id, "top"),
										"data-tooltip": "置顶",
										children: "⤒"
									})
								]
							})]
						}),
						/* @__PURE__ */ (0, W.jsxs)("div", {
							className: "composer-side-actions",
							children: [/* @__PURE__ */ (0, W.jsx)(m, {
								className: "crop-aspect-btn",
								"data-tooltip": "复制图层 (⌘D)",
								onClick: () => y(p.id),
								children: "复制"
							}), /* @__PURE__ */ (0, W.jsx)(m, {
								className: "crop-aspect-btn danger",
								"data-tooltip": "删除图层 (Delete)",
								onClick: () => v(p.id),
								children: "删除"
							})]
						})
					]
				}),
				p.type === "image" && /* @__PURE__ */ (0, W.jsxs)("div", {
					className: "composer-side-section",
					children: [
						/* @__PURE__ */ (0, W.jsxs)("div", {
							className: "composer-side-title",
							children: ["调整", !ps(p.adjustments) && /* @__PURE__ */ (0, W.jsx)("button", {
								type: "button",
								className: "composer-title-action",
								onClick: () => w(p.id),
								children: "复位"
							})]
						}),
						Ns.map((e) => /* @__PURE__ */ (0, W.jsx)(Ds, {
							label: e.label,
							value: p.adjustments[e.key],
							min: e.min,
							max: e.max,
							step: e.step,
							onChange: (t) => C(p.id, { [e.key]: t }, `adj:${e.key}:${p.id}`)
						}, e.key)),
						/* @__PURE__ */ (0, W.jsxs)("div", {
							className: "composer-field",
							children: [/* @__PURE__ */ (0, W.jsx)("span", { children: "效果" }), /* @__PURE__ */ (0, W.jsxs)("div", {
								className: "composer-seg",
								children: [
									/* @__PURE__ */ (0, W.jsx)("button", {
										type: "button",
										className: p.adjustments.grayscale ? "active" : "",
										onClick: () => C(p.id, { grayscale: !p.adjustments.grayscale }),
										children: "黑白"
									}),
									/* @__PURE__ */ (0, W.jsx)("button", {
										type: "button",
										className: p.adjustments.sepia ? "active" : "",
										onClick: () => C(p.id, { sepia: !p.adjustments.sepia }),
										children: "怀旧"
									}),
									/* @__PURE__ */ (0, W.jsx)("button", {
										type: "button",
										className: p.adjustments.invert ? "active" : "",
										onClick: () => C(p.id, { invert: !p.adjustments.invert }),
										children: "反相"
									})
								]
							})]
						}),
						/* @__PURE__ */ (0, W.jsx)(m, {
							className: "crop-aspect-btn composer-matte-btn",
							disabled: o === p.id,
							onClick: a,
							children: o === p.id ? "识别主体中…" : "识别主体（抠图）"
						})
					]
				})
			] }),
			/* @__PURE__ */ (0, W.jsxs)("div", {
				className: "composer-side-section",
				children: [/* @__PURE__ */ (0, W.jsx)("div", {
					className: "composer-side-title",
					children: "画布"
				}), /* @__PURE__ */ (0, W.jsxs)("div", {
					className: "composer-num-grid",
					children: [/* @__PURE__ */ (0, W.jsx)(Os, {
						label: "宽",
						value: h.width,
						min: 16,
						max: 8192,
						onCommit: (e) => g({ width: Math.round(e) })
					}), /* @__PURE__ */ (0, W.jsx)(Os, {
						label: "高",
						value: h.height,
						min: 16,
						max: 8192,
						onCommit: (e) => g({ height: Math.round(e) })
					})]
				})]
			}),
			/* @__PURE__ */ (0, W.jsxs)("div", {
				className: "composer-side-section composer-files",
				children: [
					/* @__PURE__ */ (0, W.jsx)("div", {
						className: "composer-side-title",
						children: "连线文件"
					}),
					oe.length === 0 && /* @__PURE__ */ (0, W.jsx)("div", {
						className: "composer-menu-empty",
						children: "没有连线的节点"
					}),
					/* @__PURE__ */ (0, W.jsx)("div", {
						className: "composer-file-grid",
						children: oe.map((e) => /* @__PURE__ */ (0, W.jsxs)("button", {
							type: "button",
							className: "composer-file-card",
							"data-tooltip": `${e.label}（点击加入图层）`,
							onClick: () => e.img ? de(e.img, e.label) : e.text && S(e.text, e.label),
							children: [e.img ? /* @__PURE__ */ (0, W.jsx)("img", {
								src: e.img,
								alt: e.label
							}) : /* @__PURE__ */ (0, W.jsx)("span", {
								className: "composer-file-text",
								children: e.text
							}), /* @__PURE__ */ (0, W.jsx)("span", {
								className: "composer-file-label",
								children: e.label
							})]
						}, e.id))
					})
				]
			})
		]
	})] });
}
//#endregion
//#region src/components/nodes/shared/image/composer/ComposerLayerNode.tsx
function Fs(e) {
	let t = [];
	return e.brightness !== 0 && t.push(ma.Filters.Brighten), e.contrast !== 0 && t.push(ma.Filters.Contrast), (e.hue !== 0 || e.saturation !== 0 || e.luminance !== 0) && t.push(ma.Filters.HSL), e.blur > 0 && t.push(ma.Filters.Blur), e.grayscale && t.push(ma.Filters.Grayscale), e.sepia && t.push(ma.Filters.Sepia), e.invert && t.push(ma.Filters.Invert), t;
}
function Is({ layer: e, register: t, common: n, onResourceIssue: r, resourceBudgetError: i }) {
	let a = (0, D.useRef)(null), o = e.adjustments;
	return (0, D.useEffect)(() => {
		let t = a.current;
		if (!(!t || !e.image)) {
			if (ps(o)) t.filters([]), t.clearCache(), r(e.id, null);
			else {
				let n = Math.ceil(o.blur) * 2 + 1, a = i ?? ne(e.width, e.height, n);
				a ? (t.filters([]), t.clearCache(), r(e.id, `${e.name}：${a}`)) : (t.cache({ offset: n }), t.filters(Fs(o)), r(e.id, null));
			}
			return t.getLayer()?.batchDraw(), () => {
				t.filters([]), t.clearCache();
			};
		}
	}, [
		o,
		e.id,
		e.image,
		e.name,
		e.width,
		e.height,
		r,
		i
	]), (0, D.useEffect)(() => () => r(e.id, null), [e.id, r]), /* @__PURE__ */ (0, W.jsx)(rs, {
		...n,
		ref: (e) => {
			a.current = e, t(e);
		},
		image: e.image,
		width: e.width,
		height: e.height,
		offsetX: e.width / 2,
		offsetY: e.height / 2,
		brightness: o.brightness,
		contrast: o.contrast,
		hue: o.hue,
		saturation: o.saturation,
		luminance: o.luminance,
		blurRadius: o.blur
	});
}
function Ls({ layer: e, interactive: t, hidden: n, onSelect: r, onDragMove: i, onDragEnd: a, onTransformEnd: o, onBeginTextEdit: s, registerNode: c, onResourceIssue: l, resourceBudgetError: u }) {
	if (!e.visible) return null;
	let d = (t) => {
		c(e.id, t);
	}, f = t && !e.locked, p = {
		id: e.id,
		name: "composer-layer",
		x: e.x,
		y: e.y,
		rotation: e.rotation,
		scaleX: e.scaleX,
		scaleY: e.scaleY,
		opacity: e.opacity,
		globalCompositeOperation: e.type === "brush" && e.erase ? "destination-out" : e.blendMode,
		listening: f,
		draggable: f,
		onMouseDown: () => r(e.id),
		onTap: () => r(e.id),
		onDragMove: (t) => i(e.id, t.target, t.evt),
		onDragEnd: (t) => a(e.id, t.target),
		onTransformEnd: (t) => o(e.id, t.target)
	};
	switch (e.type) {
		case "image": return /* @__PURE__ */ (0, W.jsx)(Is, {
			layer: e,
			register: d,
			common: p,
			onResourceIssue: l,
			resourceBudgetError: u
		});
		case "rect": return /* @__PURE__ */ (0, W.jsx)(es, {
			...p,
			ref: d,
			width: e.width,
			height: e.height,
			offsetX: e.width / 2,
			offsetY: e.height / 2,
			fill: e.fill,
			stroke: e.strokeWidth > 0 ? e.stroke : void 0,
			strokeWidth: e.strokeWidth,
			cornerRadius: e.cornerRadius
		});
		case "ellipse": return /* @__PURE__ */ (0, W.jsx)(ts, {
			...p,
			ref: d,
			radiusX: e.width / 2,
			radiusY: e.height / 2,
			fill: e.fill,
			stroke: e.strokeWidth > 0 ? e.stroke : void 0,
			strokeWidth: e.strokeWidth
		});
		case "text": return /* @__PURE__ */ (0, W.jsx)(is, {
			...p,
			ref: d,
			text: e.text,
			fontSize: e.fontSize,
			fontFamily: e.fontFamily,
			fontStyle: e.fontStyle,
			fill: e.fill,
			align: e.align,
			width: e.width,
			offsetX: e.width / 2,
			lineHeight: e.lineHeight,
			letterSpacing: e.letterSpacing,
			stroke: e.strokeWidth > 0 ? e.stroke : void 0,
			strokeWidth: e.strokeWidth,
			fillAfterStrokeEnabled: !0,
			shadowColor: "#000000",
			shadowBlur: e.shadow ? Math.max(4, e.fontSize / 8) : 0,
			shadowOpacity: e.shadow ? .55 : 0,
			shadowOffsetY: e.shadow ? Math.max(2, e.fontSize / 20) : 0,
			visible: !n,
			onDblClick: () => s(e),
			onDblTap: () => s(e)
		});
		case "line": return /* @__PURE__ */ (0, W.jsx)(ns, {
			...p,
			ref: d,
			points: e.points,
			stroke: e.stroke,
			strokeWidth: e.strokeWidth,
			lineCap: "round"
		});
		case "arrow": return /* @__PURE__ */ (0, W.jsx)(as, {
			...p,
			ref: d,
			points: e.points,
			stroke: e.stroke,
			fill: e.stroke,
			strokeWidth: e.strokeWidth,
			pointerLength: e.strokeWidth * 3,
			pointerWidth: e.strokeWidth * 3
		});
		case "brush": return /* @__PURE__ */ (0, W.jsx)(ns, {
			...p,
			ref: d,
			points: e.points,
			stroke: e.stroke,
			strokeWidth: e.strokeWidth,
			tension: .4,
			lineCap: "round",
			lineJoin: "round"
		});
		default: return null;
	}
}
//#endregion
//#region src/components/nodes/shared/image/composer/composerGeometry.ts
var Rs = {
	v: null,
	h: null
};
function zs(e) {
	let t = e.getLayer();
	return e.getClientRect(t ? { relativeTo: t } : void 0);
}
function Bs(e, t, n) {
	let r = Infinity, i = null;
	for (let n of e) for (let e of t) {
		let t = e - n;
		Math.abs(t) < Math.abs(r) && (r = t, i = e);
	}
	return Math.abs(r) <= n ? {
		delta: r,
		line: i
	} : {
		delta: 0,
		line: null
	};
}
function Vs(e, t, n, r) {
	let i = zs(e), a = [
		0,
		n.width / 2,
		n.width
	], o = [
		0,
		n.height / 2,
		n.height
	];
	for (let e of t) {
		let t = zs(e);
		a.push(t.x, t.x + t.width / 2, t.x + t.width), o.push(t.y, t.y + t.height / 2, t.y + t.height);
	}
	let s = Bs([
		i.x,
		i.x + i.width / 2,
		i.x + i.width
	], a, r), c = Bs([
		i.y,
		i.y + i.height / 2,
		i.y + i.height
	], o, r);
	return s.delta && e.x(e.x() + s.delta), c.delta && e.y(e.y() + c.delta), {
		v: s.line,
		h: c.line
	};
}
function Hs(e, t, n) {
	let r = zs(e);
	switch (n) {
		case "left": return {
			dx: -r.x,
			dy: 0
		};
		case "hcenter": return {
			dx: t.width / 2 - (r.x + r.width / 2),
			dy: 0
		};
		case "right": return {
			dx: t.width - (r.x + r.width),
			dy: 0
		};
		case "top": return {
			dx: 0,
			dy: -r.y
		};
		case "vcenter": return {
			dx: 0,
			dy: t.height / 2 - (r.y + r.height / 2)
		};
		case "bottom": return {
			dx: 0,
			dy: t.height - (r.y + r.height)
		};
		default: return {
			dx: 0,
			dy: 0
		};
	}
}
function Us(e, t, n) {
	let r = zs(e);
	if (r.width <= 0 || r.height <= 0) return 1;
	let i = t.width / r.width, a = t.height / r.height;
	return n === "cover" ? Math.max(i, a) : Math.min(i, a);
}
//#endregion
//#region src/components/nodes/shared/image/composer/ImageComposerEditor.tsx
var Ws = 2048, Gs = /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i, Ks = "rmbg-1.4.onnx", qs = 6, Js = (e, t) => typeof e == "string" ? e : e instanceof Error ? e.message : e && typeof e == "object" && "message" in e ? String(e.message) : t, Ys = {
	"image/png": "png",
	"image/jpeg": "jpg",
	"image/webp": "webp",
	"image/gif": "gif",
	"image/bmp": "bmp",
	"image/svg+xml": "svg",
	"image/avif": "avif"
};
function Xs(e, t) {
	return Ys[t.toLowerCase()] || e.match(/\.([a-z0-9]{2,5})(?:[?#]|$)/i)?.[1]?.toLowerCase() || "png";
}
async function Zs(e, t) {
	let n = Date.now(), r = await d(e);
	if (r.startsWith("data:")) return l(r, t, `composer_subject_${n}.${Xs(e, r.match(/^data:([^;,]+)/i)?.[1] ?? "image/png")}`);
	let i = await fetch(r);
	if (!i.ok) throw Error(`图片读取失败：HTTP ${i.status}`);
	let a = await i.blob();
	return u(new Uint8Array(await a.arrayBuffer()), t, `composer_subject_${n}.${Xs(e, a.type)}`);
}
function Qs({ isOpen: e, nodeId: t, imageUrl: n, onClose: r, onStart: i, onSave: a }) {
	let o = vs(), { layers: l, selectedId: u, setSelectedId: d, selectedLayer: m, canvas: h, updateCanvas: g, updateLayer: v, removeLayer: ee, duplicateLayer: te, reorderLayer: ne, addImageLayer: C, addImageFileLayer: O, replaceImageLayer: oe, addBrushStroke: k, tool: A, setTool: se, brush: ce, undo: le, redo: ue, clearHistory: de, reset: fe, retainedImageBytes: pe } = o, me = (0, D.useRef)(null), he = (0, D.useRef)(null), ge = (0, D.useRef)(null), j = (0, D.useRef)(/* @__PURE__ */ new Map()), [_e, ve] = (0, D.useState)({
		w: 0,
		h: 0
	}), [ye, be] = (0, D.useState)(1), [xe, Se] = (0, D.useState)({
		x: 0,
		y: 0
	}), [Ce, we] = (0, D.useState)(null), [Te, Ee] = (0, D.useState)(Rs), [M, De] = (0, D.useState)(!1), [Oe, ke] = (0, D.useState)(!1), [Ae, je] = (0, D.useState)(null), Me = (0, D.useRef)(null), Ne = (0, D.useRef)(!1), Pe = (0, D.useRef)(!1), Fe = (0, D.useRef)(!1), Ie = (0, D.useRef)(null), Le = (0, D.useRef)(0), Re = (0, D.useRef)(Promise.resolve()), ze = (0, D.useRef)(/* @__PURE__ */ new Map()), Be = (0, D.useCallback)((e) => {
		Me.current = e, je(e);
	}, []), Ve = (0, D.useCallback)((e, t) => {
		t ? j.current.set(e, t) : j.current.delete(e);
	}, []), He = (0, D.useCallback)((e, t) => {
		let n = ze.current.get(e);
		if (!t) {
			ze.current.delete(e);
			return;
		}
		ze.current.set(e, t), n !== t && s.getState().showToast(t, "error");
	}, []), Ue = (0, D.useMemo)(() => {
		let e = /* @__PURE__ */ new Map(), t = 0;
		for (let n of l) {
			if (n.type !== "image" || !n.visible || ps(n.adjustments)) continue;
			let r = Math.ceil(n.adjustments.blur) * 2 + 1, i = S(t, n.width, n.height, r, pe);
			if (i) {
				e.set(n.id, i);
				continue;
			}
			t += y(n.width, n.height, r) ?? 0;
		}
		return {
			errors: e,
			workingBytes: t
		};
	}, [l, pe]), We = Ue.errors, Ge = (0, D.useCallback)((e, t = !0) => {
		let n = Le.current, r = () => Le.current === n, i = Re.current.catch(() => void 0).then(async () => {
			r() && await e(r);
		});
		return Re.current = i.catch((e) => {
			t && r() && s.getState().showToast(Js(e, "图片导入失败"), "error");
		}), i;
	}, []), Ke = (0, D.useCallback)((e, t, n, r) => {
		let i = f(Math.min((n - 96) / e, (r - 120) / t), .05, 2);
		be(i), Se({
			x: (n - e * i) / 2,
			y: (r - t * i) / 2
		});
	}, []), qe = (0, D.useCallback)(() => {
		Ke(h.width, h.height, _e.w, _e.h);
	}, [
		h.width,
		h.height,
		Ke,
		_e.w,
		_e.h
	]), Je = (0, D.useCallback)((e) => {
		let t = f(e, .05, 8), n = {
			x: _e.w / 2,
			y: _e.h / 2
		}, r = {
			x: (n.x - xe.x) / ye,
			y: (n.y - xe.y) / ye
		};
		be(t), Se({
			x: n.x - r.x * t,
			y: n.y - r.y * t
		});
	}, [
		xe.x,
		xe.y,
		ye,
		_e.h,
		_e.w
	]), Ye = (0, D.useCallback)(() => Je(1), [Je]);
	(0, D.useEffect)(() => {
		if (!e) return;
		let t = me.current;
		if (!t) return;
		let n = new ResizeObserver(() => {
			ve({
				w: t.clientWidth,
				h: t.clientHeight
			});
		});
		return n.observe(t), ve({
			w: t.clientWidth,
			h: t.clientHeight
		}), () => n.disconnect();
	}, [e]), (0, D.useEffect)(() => {
		!e || Pe.current || _e.w === 0 || !n || (Pe.current = !0, Ge(async (e) => {
			await C(n, "底图", (t) => {
				if (!e()) throw Error("编辑器已关闭");
				let n = Math.min(t.naturalWidth, Ws), r = Math.round(t.naturalHeight / t.naturalWidth * n);
				g({
					width: n,
					height: r,
					bg: "transparent"
				}, null), Ke(n, r, _e.w, _e.h);
			}), e() && de();
		}, !1).catch(() => {}));
	}, [
		C,
		de,
		Ge,
		Ke,
		n,
		e,
		_e.h,
		_e.w,
		g
	]);
	let Xe = (0, D.useCallback)(() => {
		Le.current += 1, Ie.current !== null && (cancelAnimationFrame(Ie.current), Ie.current = null), fe(), Pe.current = !1, we(null), Be(null), Fe.current = !1, ze.current.clear(), r();
	}, [
		fe,
		r,
		Be
	]);
	(0, D.useEffect)(() => {
		e || (Le.current += 1, Ie.current !== null && (cancelAnimationFrame(Ie.current), Ie.current = null), Fe.current = !1);
	}, [e]), (0, D.useEffect)(() => () => {
		Le.current += 1, Pe.current = !1, Ie.current !== null && cancelAnimationFrame(Ie.current), Ie.current = null;
	}, []), (0, D.useEffect)(() => {
		let e = ge.current;
		if (!e) return;
		let t = u ? l.find((e) => e.id === u) : null, n = t && !t.locked && A === "select" ? j.current.get(t.id) : null;
		e.nodes(n ? [n] : []), e.getLayer()?.batchDraw();
	}, [
		u,
		l,
		A
	]);
	let Ze = (0, D.useCallback)((e) => {
		e.evt.preventDefault();
		let t = he.current;
		if (t) if (e.evt.ctrlKey) {
			let n = t.getPointerPosition();
			if (!n) return;
			let r = {
				x: (n.x - xe.x) / ye,
				y: (n.y - xe.y) / ye
			}, i = f(ye * Math.exp(f(-e.evt.deltaY, -40, 40) * .01), .05, 8);
			be(i), Se({
				x: n.x - r.x * i,
				y: n.y - r.y * i
			});
		} else Se((t) => ({
			x: t.x - e.evt.deltaX,
			y: t.y - e.evt.deltaY
		}));
	}, [ye, xe]), N = (0, D.useCallback)(() => he.current?.getRelativePointerPosition() ?? null, []), Qe = (0, D.useCallback)((e) => {
		if (A !== "select") {
			let e = N();
			if (!e) return;
			Ne.current = !0, Be([e.x, e.y]);
			return;
		}
		let t = e.target;
		(t === t.getStage() || t.name() === "page-bg") && d(null);
	}, [
		N,
		Be,
		d,
		A
	]), $e = (0, D.useCallback)(() => {
		if (!Ne.current) return;
		let e = N();
		e && Be([
			...Me.current ?? [],
			e.x,
			e.y
		]);
	}, [N, Be]), et = (0, D.useCallback)(() => {
		if (!Ne.current) return;
		Ne.current = !1;
		let e = Me.current;
		Be(null), e && e.length >= 4 && k(e, A === "eraser");
	}, [
		k,
		Be,
		A
	]), tt = (0, D.useCallback)((e) => {
		let t = [];
		for (let [n, r] of j.current) n !== e && l.find((e) => e.id === n)?.visible && t.push(r);
		return t;
	}, [l]), nt = (0, D.useCallback)((e, t, n) => {
		if (n.altKey) {
			Ee(Rs);
			return;
		}
		Ee(Vs(t, tt(e), h, qs / ye));
	}, [
		ye,
		h,
		tt
	]), rt = (0, D.useCallback)((e, t) => {
		Ee(Rs), v(e, {
			x: t.x(),
			y: t.y(),
			rotation: t.rotation(),
			scaleX: t.scaleX(),
			scaleY: t.scaleY()
		});
	}, [v]), it = (0, D.useCallback)((e) => {
		if (e.type !== "text") return;
		let t = j.current.get(e.id), n = me.current;
		if (!t || !n) return;
		let r = t.getClientRect({ relativeTo: he.current ?? void 0 }), i = xe.x + r.x * ye, a = xe.y + r.y * ye;
		d(e.id), we({
			id: e.id,
			left: i,
			top: a,
			width: e.width * Math.abs(e.scaleX) * ye,
			fontPx: e.fontSize * Math.abs(e.scaleY) * ye
		});
	}, [
		xe,
		ye,
		d
	]), at = (0, D.useCallback)((e) => {
		Ce && v(Ce.id, { text: e }), we(null);
	}, [Ce, v]), ot = (0, D.useCallback)((e) => {
		if (!m) return;
		let t = j.current.get(m.id);
		if (!t) return;
		let { dx: n, dy: r } = Hs(t, h, e);
		v(m.id, {
			x: m.x + n,
			y: m.y + r
		});
	}, [
		h,
		m,
		v
	]), P = (0, D.useCallback)((e) => {
		if (!m) return;
		let t = j.current.get(m.id);
		if (!t) return;
		let n = Us(t, h, e);
		v(m.id, {
			scaleX: m.scaleX * n,
			scaleY: m.scaleY * n,
			x: h.width / 2,
			y: h.height / 2
		});
	}, [
		h,
		m,
		v
	]);
	(0, D.useEffect)(() => {
		if (!e) return;
		let t = (e) => {
			if (Ce) return;
			let t = e.target;
			if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
			let n = e.metaKey || e.ctrlKey, r = () => {
				e.preventDefault(), e.stopPropagation(), e.stopImmediatePropagation();
			};
			if (n && e.key.toLowerCase() === "z") {
				r(), e.shiftKey ? ue() : le();
				return;
			}
			if (n && e.key.toLowerCase() === "y") {
				r(), ue();
				return;
			}
			if (n && e.key.toLowerCase() === "d" && u) {
				r(), te(u);
				return;
			}
			if (n && (e.key === "]" || e.key === "[") && u) {
				r(), ne(u, e.key === "]" ? "up" : "down");
				return;
			}
			if (n && e.key === "0") {
				r(), qe();
				return;
			}
			if (e.key === "Delete" || e.key === "Backspace") {
				r(), u && ee(u);
				return;
			}
			if (e.key === "Escape") {
				if (A !== "select") {
					r(), se("select");
					return;
				}
				u && (r(), d(null));
				return;
			}
			if (e.key.startsWith("Arrow") && u) {
				let t = o.layersRef.current.find((e) => e.id === u);
				if (!t) return;
				r();
				let n = e.shiftKey ? 10 : 1, i = e.key === "ArrowLeft" ? -n : e.key === "ArrowRight" ? n : 0, a = e.key === "ArrowUp" ? -n : e.key === "ArrowDown" ? n : 0;
				v(u, {
					x: t.x + i,
					y: t.y + a
				}, `nudge:${u}`);
				return;
			}
			if (!n && !e.altKey) {
				let t = e.key.toLowerCase();
				t === "v" ? se("select") : t === "b" ? se("brush") : t === "e" && se("eraser");
			}
		};
		return window.addEventListener("keydown", t, !0), () => window.removeEventListener("keydown", t, !0);
	}, [
		e,
		u,
		Ce,
		A,
		o.layersRef,
		ee,
		d,
		se,
		le,
		ue,
		te,
		ne,
		v,
		qe
	]), (0, D.useEffect)(() => {
		if (!e) return;
		let t = (e) => {
			let t = Array.from(e.clipboardData?.items ?? []).find((e) => e.kind === "file" && e.type.startsWith("image/"))?.getAsFile();
			t && (e.preventDefault(), Ge(async (e) => {
				e() && await O(t, "粘贴图片");
			}).catch(() => {}));
		};
		return window.addEventListener("paste", t), () => window.removeEventListener("paste", t);
	}, [
		e,
		O,
		Ge
	]);
	let [st, ct] = (0, D.useState)(!1), lt = (0, D.useCallback)((e) => {
		e.dataTransfer?.types?.includes("Files") && (e.preventDefault(), e.dataTransfer.dropEffect = "copy", ct(!0));
	}, []), ut = (0, D.useCallback)((e) => {
		e.currentTarget === e.target && ct(!1);
	}, []), dt = (0, D.useCallback)((e) => {
		e.preventDefault(), ct(!1);
		let t = Array.from(e.dataTransfer?.files ?? []).filter((e) => e.type.startsWith("image/"));
		for (let e of t) Ge(async (t) => {
			t() && await O(e, e.name);
		}).catch(() => {});
	}, [O, Ge]);
	(0, D.useEffect)(() => {
		if (!e || !("__TAURI_INTERNALS__" in window)) return;
		w(!0);
		let t = !1, n = null;
		return (async () => {
			let { listen: e } = await import("./event-BlmvLUFr.js").then((e) => e.i), r = await e("tauri://drag-drop", async (e) => {
				let { type: t, paths: n } = e.payload;
				if (t === "enter" || t === "over") {
					ct(!0);
					return;
				}
				if (t === "leave" || t === "cancelled") {
					ct(!1);
					return;
				}
				ct(!1);
				for (let e of n ?? []) Gs.test(e) && await Ge(async (t) => {
					t() && await C(c(e), e.split(/[\\/]/).pop() || "图片");
				}).catch(() => {});
			});
			t ? r() : n = r;
		})(), () => {
			t = !0, n?.(), w(!1), ct(!1);
		};
	}, [
		e,
		C,
		Ge
	]);
	let [ft, pt] = (0, D.useState)(null), mt = (0, D.useCallback)(async () => {
		let e = m;
		if (!e || e.type !== "image") return;
		let t = s.getState();
		if (!("__TAURI_INTERNALS__" in window)) {
			t.showToast("主体识别仅桌面端可用", "error");
			return;
		}
		let n = t.currentProjectId;
		if (!n || n === "default") {
			t.showToast("请先在项目中使用主体识别", "error");
			return;
		}
		pt(e.id);
		try {
			await ie(Ks) || (t.showToast("正在下载主体识别模型…"), await re(Ks));
			let r = await Zs(e.src, n);
			if (!r) throw Error("无法写入临时文件");
			let i = `${r.filePath.replace(/\.[^.]+$/, "")}_subject.png`, a = await E(r.filePath, i, Ks, `composer-matting-${Date.now()}`), o = c(a.subject_path);
			await oe(e.id, o), t.showToast(`主体识别完成 (${a.input_size})`);
		} catch (e) {
			t.showToast(Js(e, "主体识别失败"), "error");
		} finally {
			pt(null);
		}
	}, [oe, m]), ht = (0, D.useCallback)(() => {
		let e = he.current;
		if (!e || l.length === 0 || Fe.current) return;
		let t = ze.current.values().next().value;
		if (t) {
			s.getState().showToast(`${t}；请处理后再导出`, "error");
			return;
		}
		let n = p(h.width, h.height, "合成导出");
		if (n) {
			s.getState().showToast(n, "error");
			return;
		}
		let r = _(pe, Ue.workingBytes, h.width, h.height);
		if (r) {
			s.getState().showToast(r, "error");
			return;
		}
		Fe.current = !0, d(null), Ee(Rs);
		let o = Le.current, c = () => Le.current === o;
		Ie.current = requestAnimationFrame(() => {
			if (Ie.current = null, !c() || he.current !== e) {
				Fe.current = !1;
				return;
			}
			(async () => {
				let t = {
					scale: ye,
					pos: { ...xe },
					w: _e.w,
					h: _e.h
				}, n = null, r = null;
				try {
					x(h.width, h.height, "合成导出"), e.size({
						width: h.width,
						height: h.height
					}), e.scale({
						x: 1,
						y: 1
					}), e.position({
						x: 0,
						y: 0
					}), e.batchDraw(), n = e.toCanvas({
						x: 0,
						y: 0,
						width: h.width,
						height: h.height,
						pixelRatio: 1
					});
				} catch (e) {
					r = e;
				} finally {
					try {
						e.size({
							width: t.w,
							height: t.h
						}), e.scale({
							x: t.scale,
							y: t.scale
						}), e.position(t.pos), e.batchDraw();
					} catch (e) {
						r ??= e, console.error("[Composer] stage restore failed:", e);
					}
				}
				let o = null;
				try {
					if (r || !n) throw r ?? /* @__PURE__ */ Error("合成导出画布不可用");
					o = await b(n);
				} catch (e) {
					r = e;
				} finally {
					n && (n.width = 1, n.height = 1);
				}
				if (!c()) return;
				if (r || !o) {
					console.error("[Composer] export failed:", r), s.getState().showToast(Js(r, "合成导出失败，请重试"), "error");
					return;
				}
				let { width: l, height: u } = h;
				Le.current += 1, i?.(), fe(), Pe.current = !1, ze.current.clear(), a(o, {
					width: l,
					height: u
				});
			})().finally(() => {
				Fe.current = !1;
			});
		});
	}, [
		l.length,
		ye,
		xe,
		_e,
		h,
		Ue.workingBytes,
		i,
		a,
		fe,
		pe,
		d
	]), gt = (0, D.useMemo)(() => ({
		x: -h.width,
		y: -h.height,
		w: h.width * 3,
		h: h.height * 3
	}), [h.width, h.height]);
	return /* @__PURE__ */ (0, W.jsx)(T, {
		isOpen: e,
		onClose: Xe,
		title: "多图编辑",
		hidePanel: !0,
		className: "composer-overlay",
		children: /* @__PURE__ */ (0, W.jsxs)("div", {
			className: `composer-root${M ? " side-collapsed" : ""}`,
			onClick: (e) => e.stopPropagation(),
			children: [/* @__PURE__ */ (0, W.jsxs)("div", {
				className: "composer-toolbar-dock",
				children: [/* @__PURE__ */ (0, W.jsx)(Es, {
					composer: o,
					canExport: l.length > 0,
					onFit: qe,
					onExport: ht,
					onClose: Xe
				}), /* @__PURE__ */ (0, W.jsx)(ae, {
					scale: ye,
					minScale: .05,
					maxScale: 8,
					onZoomChange: Je,
					onReset: Ye
				})]
			}), /* @__PURE__ */ (0, W.jsxs)("div", {
				className: "composer-body",
				children: [/* @__PURE__ */ (0, W.jsxs)("div", {
					className: `composer-stage-wrap${st ? " drag-over" : ""}${A === "select" ? "" : " drawing"}`,
					ref: me,
					onDragOver: lt,
					onDragLeave: ut,
					onDrop: dt,
					children: [
						_e.w > 0 && /* @__PURE__ */ (0, W.jsx)(ss, {
							ref: he,
							width: _e.w,
							height: _e.h,
							scaleX: ye,
							scaleY: ye,
							x: xe.x,
							y: xe.y,
							onWheel: Ze,
							onMouseDown: Qe,
							onTouchStart: Qe,
							onMouseMove: $e,
							onTouchMove: $e,
							onMouseUp: et,
							onTouchEnd: et,
							onMouseLeave: et,
							children: /* @__PURE__ */ (0, W.jsxs)("Layer", { children: [
								h.bg !== "transparent" && /* @__PURE__ */ (0, W.jsx)("Rect", {
									name: "page-bg",
									x: 0,
									y: 0,
									width: h.width,
									height: h.height,
									fill: h.bg,
									listening: A === "select"
								}),
								l.map((e) => /* @__PURE__ */ (0, W.jsx)(Ls, {
									layer: e,
									interactive: A === "select",
									hidden: Ce?.id === e.id,
									onSelect: d,
									onDragMove: nt,
									onDragEnd: rt,
									onTransformEnd: rt,
									onBeginTextEdit: it,
									registerNode: Ve,
									onResourceIssue: He,
									resourceBudgetError: We.get(e.id)
								}, e.id)),
								Ae && /* @__PURE__ */ (0, W.jsx)("Line", {
									points: Ae,
									stroke: ce.color,
									strokeWidth: ce.size,
									tension: .4,
									lineCap: "round",
									lineJoin: "round",
									listening: !1,
									globalCompositeOperation: A === "eraser" ? "destination-out" : "source-over"
								}),
								/* @__PURE__ */ (0, W.jsx)("Transformer", {
									ref: ge,
									rotateEnabled: !0,
									keepRatio: !1,
									anchorSize: 9,
									borderStroke: "#6366f1",
									anchorStroke: "#6366f1",
									anchorFill: "#fff",
									boundBoxFunc: (e, t) => t.width < 8 || t.height < 8 ? e : t
								}),
								Te.v !== null && /* @__PURE__ */ (0, W.jsx)("Line", {
									points: [
										Te.v,
										gt.y,
										Te.v,
										gt.y + gt.h
									],
									stroke: "#ec4899",
									strokeWidth: 1 / ye,
									dash: [6 / ye, 4 / ye],
									listening: !1
								}),
								Te.h !== null && /* @__PURE__ */ (0, W.jsx)("Line", {
									points: [
										gt.x,
										Te.h,
										gt.x + gt.w,
										Te.h
									],
									stroke: "#ec4899",
									strokeWidth: 1 / ye,
									dash: [6 / ye, 4 / ye],
									listening: !1
								})
							] })
						}),
						/* @__PURE__ */ (0, W.jsx)("div", {
							className: "composer-page-frame",
							style: {
								left: xe.x,
								top: xe.y,
								width: h.width * ye,
								height: h.height * ye
							}
						}),
						Ce && /* @__PURE__ */ (0, W.jsx)("textarea", {
							className: "composer-text-edit",
							autoFocus: !0,
							defaultValue: (m?.type === "text" ? m.text : "") || "",
							style: {
								left: Ce.left,
								top: Ce.top,
								width: Ce.width,
								fontSize: Ce.fontPx
							},
							onBlur: (e) => at(e.target.value),
							onKeyDown: (e) => {
								e.nativeEvent.isComposing || (e.key === "Enter" && !e.shiftKey ? (e.preventDefault(), at(e.target.value)) : e.key === "Escape" && we(null));
							}
						})
					]
				}), /* @__PURE__ */ (0, W.jsx)(Ps, {
					composer: o,
					nodeId: t,
					collapsed: M,
					animateIn: !Oe,
					onToggleCollapsed: () => {
						ke(!0), De((e) => !e);
					},
					onMatteSubject: mt,
					mattingLayerId: ft,
					onAlign: ot,
					onFitLayer: P
				})]
			})]
		})
	});
}
//#endregion
export { Qs as default };
