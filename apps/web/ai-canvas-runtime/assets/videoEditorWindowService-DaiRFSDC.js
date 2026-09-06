import { n as e } from "./react-Dfufv8pq.js";
import { ct as t, et as n, it as r, ot as i, rt as a, st as o, tt as s } from "./indexedDbService-CqWFA8LG.js";
//#region node_modules/mediabunny/dist/modules/src/misc.js
function c(e) {
	if (!e) throw Error("Assertion failed.");
}
var l = (e) => {
	let t = (e % 360 + 360) % 360;
	if (t === 0 || t === 90 || t === 180 || t === 270) return t;
	throw Error(`Invalid rotation ${e}.`);
}, u = (e) => e && e[e.length - 1], d = (e) => e >= 0 && e < 2 ** 32, f = (e) => {
	let t = 0;
	for (; e.readBits(1) === 0 && t < 32;) t++;
	if (t >= 32) throw Error("Invalid exponential-Golomb code.");
	return (1 << t) - 1 + e.readBits(t);
}, p = (e) => {
	let t = f(e);
	return t & 1 ? t + 1 >> 1 : -(t >> 1);
}, m = (e) => e.constructor === Uint8Array ? e : ArrayBuffer.isView(e) ? new Uint8Array(e.buffer, e.byteOffset, e.byteLength) : new Uint8Array(e), h = (e) => e.constructor === DataView ? e : ArrayBuffer.isView(e) ? new DataView(e.buffer, e.byteOffset, e.byteLength) : new DataView(e), g = /* @__PURE__ */ new TextDecoder(), _ = /* @__PURE__ */ new TextEncoder(), v = (e) => Object.fromEntries(Object.entries(e).map(([e, t]) => [t, e])), y = {
	bt709: 1,
	bt470bg: 5,
	smpte170m: 6,
	bt2020: 9,
	smpte432: 12
}, b = /* @__PURE__ */ v(y), x = {
	bt709: 1,
	smpte170m: 6,
	linear: 8,
	"iec61966-2-1": 13,
	pq: 16,
	hlg: 18
}, S = /* @__PURE__ */ v(x), C = {
	rgb: 0,
	bt709: 1,
	bt470bg: 5,
	smpte170m: 6,
	"bt2020-ncl": 9
}, ee = /* @__PURE__ */ v(C), te = (e) => !!e && !!e.primaries && !!e.transfer && !!e.matrix && e.fullRange !== void 0, ne = (e) => e instanceof ArrayBuffer || typeof SharedArrayBuffer < "u" && e instanceof SharedArrayBuffer || ArrayBuffer.isView(e), re = class {
	constructor() {
		this.currentPromise = Promise.resolve(), this.pending = 0;
	}
	async acquire() {
		let e, t = new Promise((t) => {
			let n = !1;
			e = () => {
				n ||= (t(), this.pending--, !0);
			};
		}), n = this.currentPromise;
		return this.currentPromise = t, this.pending++, await n, e;
	}
}, ie = /^[0-9a-fA-F]+$/, ae = (e) => [...e].map((e) => e.toString(16).padStart(2, "0")).join(""), oe = (e) => {
	c(e.length % 2 == 0);
	let t = new Uint8Array(e.length / 2);
	for (let n = 0; n < e.length; n += 2) t[n / 2] = parseInt(e.slice(n, n + 2), 16);
	return t;
}, se = (e) => (e = e >> 1 & 1431655765 | (e & 1431655765) << 1, e = e >> 2 & 858993459 | (e & 858993459) << 2, e = e >> 4 & 252645135 | (e & 252645135) << 4, e = e >> 8 & 16711935 | (e & 16711935) << 8, e = e >> 16 & 65535 | (e & 65535) << 16, e >>> 0), ce = (e, t, n) => {
	let r = 0, i = e.length - 1, a = -1;
	for (; r <= i;) {
		let o = r + i >> 1, s = n(e[o]);
		s === t ? (a = o, i = o - 1) : s < t ? r = o + 1 : i = o - 1;
	}
	return a;
}, w = (e, t, n) => {
	let r = 0, i = e.length - 1, a = -1;
	for (; r <= i;) {
		let o = r + (i - r + 1) / 2 | 0;
		n(e[o]) <= t ? (a = o, r = o + 1) : i = o - 1;
	}
	return a;
}, le = (e, t, n) => {
	let r = w(e, n(t), n);
	e.splice(r + 1, 0, t);
}, T = () => {
	let e, t;
	return {
		promise: new Promise((n, r) => {
			e = n, t = r;
		}),
		resolve: e,
		reject: t
	};
}, ue = (e, t) => {
	let n = e.indexOf(t);
	n !== -1 && e.splice(n, 1);
}, de = (e, t) => {
	for (let n = e.length - 1; n >= 0; n--) if (t(e[n])) return e[n];
}, fe = (e, t) => {
	for (let n = e.length - 1; n >= 0; n--) if (t(e[n])) return n;
	return -1;
}, pe = async function* (e) {
	Symbol.iterator in e ? yield* e[Symbol.iterator]() : yield* e[Symbol.asyncIterator]();
}, me = (e) => {
	if (!(Symbol.iterator in e) && !(Symbol.asyncIterator in e)) throw TypeError("Argument must be an iterable or async iterable.");
}, he = (e) => {
	throw Error(`Unexpected value: ${e}`);
}, ge = (e, t, n) => {
	let r = e.getUint8(t), i = e.getUint8(t + 1), a = e.getUint8(t + 2);
	return n ? r | i << 8 | a << 16 : r << 16 | i << 8 | a;
}, _e = (e, t, n) => ge(e, t, n) << 8 >> 8, ve = (e, t, n, r) => {
	n >>>= 0, n &= 16777215, r ? (e.setUint8(t, n & 255), e.setUint8(t + 1, n >>> 8 & 255), e.setUint8(t + 2, n >>> 16 & 255)) : (e.setUint8(t, n >>> 16 & 255), e.setUint8(t + 1, n >>> 8 & 255), e.setUint8(t + 2, n & 255));
}, ye = (e, t, n, r) => {
	n = E(n, -8388608, 8388607), n < 0 && (n = n + 16777216 & 16777215), ve(e, t, n, r);
}, be = (e, t) => ({
	async next() {
		let n = await e.next();
		return n.done ? {
			value: void 0,
			done: !0
		} : {
			value: t(n.value),
			done: !1
		};
	},
	return() {
		return e.return();
	},
	throw(t) {
		return e.throw(t);
	},
	[Symbol.asyncIterator]() {
		return this;
	}
}), E = (e, t, n) => Math.max(t, Math.min(n, e)), xe = (e, t, n) => e + (t - e) * n, Se = (e) => {
	let t = Math.round(e);
	return Math.abs(e / t - 1) < 10 * 2 ** -52 ? t : e;
}, Ce = (e, t) => Math.round(e / t) * t, we = (e, t) => Math.round(e * t) / t, Te = (e, t) => Math.floor(e / t) * t, Ee = (e, t) => Math.floor(e * t) / t, De = (e) => {
	let t = 0;
	for (; e;) t++, e >>= 1;
	return t;
}, Oe = /^[a-z]{3}$/, ke = (e) => Oe.test(e), Ae = 1e6 * (1 + 2 ** -52), je = (e, t) => {
	let n = e < 0 ? -1 : 1;
	e = Math.abs(e);
	let r = 0, i = 1, a = 1, o = 0, s = e;
	for (;;) {
		let e = Math.floor(s), c = e * a + r, l = e * o + i;
		if (l > t) return {
			num: n * a,
			den: o
		};
		if (r = a, i = o, a = c, o = l, s = 1 / (s - e), !isFinite(s)) break;
	}
	return {
		num: n * a,
		den: o
	};
}, Me = class {
	constructor() {
		this.currentPromise = Promise.resolve();
	}
	call(e) {
		return this.currentPromise = this.currentPromise.then(e);
	}
}, Ne = null, Pe = () => Ne === null ? Ne = !!(typeof navigator < "u" && (navigator.vendor?.match(/apple/i) || /AppleWebKit/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent) || /\b(iPad|iPhone|iPod)\b/.test(navigator.userAgent))) : Ne, Fe = null, Ie = () => Fe === null ? Fe = typeof navigator < "u" && navigator.userAgent?.includes("Firefox") : Fe, Le = null, Re = () => Le === null ? Le = !!(typeof navigator < "u" && (navigator.vendor?.includes("Google Inc") || /Chrome/.test(navigator.userAgent))) : Le, ze = null, Be = () => {
	if (ze !== null) return ze;
	if (typeof navigator > "u") return null;
	let e = /\bChrome\/(\d+)/.exec(navigator.userAgent);
	return e ? ze = Number(e[1]) : null;
}, Ve = (e, t) => e === -1 ? t : e, He = (e, t, n, r) => e <= r && n <= t, Ue = function* (e) {
	for (let t in e) {
		let n = e[t];
		n !== void 0 && (yield {
			key: t,
			value: n
		});
	}
}, We = (e) => {
	let t = atob(e), n = new Uint8Array(t.length);
	for (let e = 0; e < t.length; e++) n[e] = t.charCodeAt(e);
	return n;
}, Ge = (e, t) => {
	if (e.length !== t.length) return !1;
	for (let n = 0; n < e.length; n++) if (e[n] !== t[n]) return !1;
	return !0;
}, Ke = () => {
	Symbol.dispose ??= Symbol("Symbol.dispose");
}, qe = (e) => typeof e == "number" && !Number.isNaN(e), Je = (e, t) => {
	if (t.includes("://")) return t;
	if (e.includes("://")) {
		let t = e.indexOf("?");
		t !== -1 && (e = e.slice(0, t));
	}
	let n;
	if (t.startsWith("/")) {
		let r = e.indexOf("://");
		if (r === -1) n = t;
		else {
			let i = e.indexOf("/", r + 3);
			n = i === -1 ? e + t : e.slice(0, i) + t;
		}
	} else {
		let r = e.lastIndexOf("/");
		n = r === -1 ? t : e.slice(0, r + 1) + t;
	}
	let r = "", i = n.indexOf("://");
	if (i !== -1) {
		let e = n.indexOf("/", i + 3);
		e !== -1 && (r = n.slice(0, e), n = n.slice(e));
	}
	let a = n.split("/"), o = [];
	for (let e of a) e === ".." ? o.pop() : e !== "." && o.push(e);
	return r + o.join("/");
}, Ye = (e, t) => {
	let n = 0;
	for (let r = 0; r < e.length; r++) t(e[r]) && n++;
	return n;
}, Xe = (e, t) => {
	let n = -1, r = Infinity;
	for (let i = 0; i < e.length; i++) {
		let a = t(e[i]);
		a < r && (r = a, n = i);
	}
	return n;
}, Ze = (e) => {
	c(Number.isInteger(e.num)), c(Number.isInteger(e.den)), c(e.den !== 0);
	let t = Math.abs(e.num), n = Math.abs(e.den);
	for (; n !== 0;) {
		let e = t % n;
		t = n, n = e;
	}
	let r = t || 1;
	return {
		num: e.num / r,
		den: e.den / r
	};
}, Qe = (e, t) => {
	if (typeof e != "object" || !e) throw TypeError(`${t} must be an object.`);
	if (!Number.isInteger(e.left) || e.left < 0) throw TypeError(`${t}.left must be a non-negative integer.`);
	if (!Number.isInteger(e.top) || e.top < 0) throw TypeError(`${t}.top must be a non-negative integer.`);
	if (!Number.isInteger(e.width) || e.width < 0) throw TypeError(`${t}.width must be a non-negative integer.`);
	if (!Number.isInteger(e.height) || e.height < 0) throw TypeError(`${t}.height must be a non-negative integer.`);
}, $e = (e) => new Promise((t) => setTimeout(t, e)), et = (e) => Array.isArray(e) ? e : [e], tt = class {
	constructor() {
		this._listeners = /* @__PURE__ */ new Map();
	}
	on(e, t, n) {
		this._listeners.has(e) || this._listeners.set(e, /* @__PURE__ */ new Set());
		let r = {
			fn: t,
			once: n?.once ?? !1
		};
		return this._listeners.get(e).add(r), () => {
			this._listeners.get(e)?.delete(r);
		};
	}
	_emit(...e) {
		let [t, n] = e, r = this._listeners.get(t);
		if (r) for (let e of r) {
			try {
				e.fn(n);
			} catch (e) {
				console.error(e);
			}
			e.once && r.delete(e);
		}
	}
}, nt = (e) => typeof e == "object" && !!e && Object.getPrototypeOf(e) === Object.prototype && Object.values(e).every((e) => typeof e == "string"), rt;
(function(e) {
	e[e.Silent = 0] = "Silent", e[e.Errors = 1] = "Errors", e[e.Warnings = 2] = "Warnings", e[e.Info = 3] = "Info";
})(rt ||= {});
var D = class e {
	constructor() {}
	static get level() {
		return e._level;
	}
	static set level(t) {
		if (t !== rt.Silent && t !== rt.Errors && t !== rt.Warnings && t !== rt.Info) throw TypeError("Invalid log level. Use one of the values of the LogLevel enum.");
		e._level = t;
	}
	static get _emitter() {
		return e._emitterInstance ??= new tt();
	}
	static on(t, n, r) {
		return e._emitter.on(t, n, r);
	}
	static _error(...t) {
		e._emitter._emit("error", t), e._level >= rt.Errors && console.error(...t);
	}
	static _warn(...t) {
		e._emitter._emit("warn", t), e._level >= rt.Warnings && console.warn(...t);
	}
	static _info(...t) {
		e._emitter._emit("info", t), e._level >= rt.Info && console.info(...t);
	}
};
D._level = rt.Info, D._emitterInstance = null;
//#endregion
//#region node_modules/mediabunny/dist/modules/src/metadata.js
var it = class {
	constructor(e, t) {
		if (this.data = e, this.mimeType = t, !(e instanceof Uint8Array)) throw TypeError("data must be a Uint8Array.");
		if (typeof t != "string") throw TypeError("mimeType must be a string.");
	}
}, at = class {
	constructor(e, t, n, r) {
		if (this.data = e, this.mimeType = t, this.name = n, this.description = r, !(e instanceof Uint8Array)) throw TypeError("data must be a Uint8Array.");
		if (t !== void 0 && typeof t != "string") throw TypeError("mimeType, when provided, must be a string.");
		if (n !== void 0 && typeof n != "string") throw TypeError("name, when provided, must be a string.");
		if (r !== void 0 && typeof r != "string") throw TypeError("description, when provided, must be a string.");
	}
}, ot = (e) => {
	if (!e || typeof e != "object") throw TypeError("tags must be an object.");
	if (e.title !== void 0 && typeof e.title != "string") throw TypeError("tags.title, when provided, must be a string.");
	if (e.description !== void 0 && typeof e.description != "string") throw TypeError("tags.description, when provided, must be a string.");
	if (e.artist !== void 0 && typeof e.artist != "string") throw TypeError("tags.artist, when provided, must be a string.");
	if (e.album !== void 0 && typeof e.album != "string") throw TypeError("tags.album, when provided, must be a string.");
	if (e.albumArtist !== void 0 && typeof e.albumArtist != "string") throw TypeError("tags.albumArtist, when provided, must be a string.");
	if (e.trackNumber !== void 0 && (!Number.isInteger(e.trackNumber) || e.trackNumber <= 0)) throw TypeError("tags.trackNumber, when provided, must be a positive integer.");
	if (e.tracksTotal !== void 0 && (!Number.isInteger(e.tracksTotal) || e.tracksTotal <= 0)) throw TypeError("tags.tracksTotal, when provided, must be a positive integer.");
	if (e.discNumber !== void 0 && (!Number.isInteger(e.discNumber) || e.discNumber <= 0)) throw TypeError("tags.discNumber, when provided, must be a positive integer.");
	if (e.discsTotal !== void 0 && (!Number.isInteger(e.discsTotal) || e.discsTotal <= 0)) throw TypeError("tags.discsTotal, when provided, must be a positive integer.");
	if (e.genre !== void 0 && typeof e.genre != "string") throw TypeError("tags.genre, when provided, must be a string.");
	if (e.date !== void 0 && (!(e.date instanceof Date) || Number.isNaN(e.date.getTime()))) throw TypeError("tags.date, when provided, must be a valid Date.");
	if (e.lyrics !== void 0 && typeof e.lyrics != "string") throw TypeError("tags.lyrics, when provided, must be a string.");
	if (e.images !== void 0) {
		if (!Array.isArray(e.images)) throw TypeError("tags.images, when provided, must be an array.");
		for (let t of e.images) {
			if (!t || typeof t != "object") throw TypeError("Each image in tags.images must be an object.");
			if (!(t.data instanceof Uint8Array)) throw TypeError("Each image.data must be a Uint8Array.");
			if (typeof t.mimeType != "string") throw TypeError("Each image.mimeType must be a string.");
			if (![
				"coverFront",
				"coverBack",
				"unknown"
			].includes(t.kind)) throw TypeError("Each image.kind must be 'coverFront', 'coverBack', or 'unknown'.");
		}
	}
	if (e.comment !== void 0 && typeof e.comment != "string") throw TypeError("tags.comment, when provided, must be a string.");
	if (e.raw !== void 0) {
		if (!e.raw || typeof e.raw != "object") throw TypeError("tags.raw, when provided, must be an object.");
		for (let t of Object.values(e.raw)) if (t !== null && typeof t != "string" && !(t instanceof Uint8Array) && !(t instanceof it) && !(t instanceof at) && !nt(t)) throw TypeError("Each value in tags.raw must be a string, Uint8Array, RichImageData, AttachedFile, Record<string, string>, or null.");
	}
}, st = {
	default: !0,
	primary: !0,
	forced: !1,
	original: !1,
	commentary: !1,
	hearingImpaired: !1,
	visuallyImpaired: !1
}, ct = (e) => {
	if (!e || typeof e != "object") throw TypeError("disposition must be an object.");
	if (e.default !== void 0 && typeof e.default != "boolean") throw TypeError("disposition.default must be a boolean.");
	if (e.primary !== void 0 && typeof e.primary != "boolean") throw TypeError("disposition.primary must be a boolean.");
	if (e.forced !== void 0 && typeof e.forced != "boolean") throw TypeError("disposition.forced must be a boolean.");
	if (e.original !== void 0 && typeof e.original != "boolean") throw TypeError("disposition.original must be a boolean.");
	if (e.commentary !== void 0 && typeof e.commentary != "boolean") throw TypeError("disposition.commentary must be a boolean.");
	if (e.hearingImpaired !== void 0 && typeof e.hearingImpaired != "boolean") throw TypeError("disposition.hearingImpaired must be a boolean.");
	if (e.visuallyImpaired !== void 0 && typeof e.visuallyImpaired != "boolean") throw TypeError("disposition.visuallyImpaired must be a boolean.");
}, O = class e {
	constructor(e) {
		this.bytes = e, this.pos = 0;
	}
	seekToByte(e) {
		this.pos = 8 * e;
	}
	readBit() {
		let e = Math.floor(this.pos / 8), t = this.bytes[e] ?? 0, n = 7 - (this.pos & 7), r = (t & 1 << n) >> n;
		return this.pos++, r;
	}
	readBits(e) {
		if (e === 1) return this.readBit();
		let t = 0;
		for (let n = 0; n < e; n++) t <<= 1, t |= this.readBit();
		return t;
	}
	writeBits(e, t) {
		let n = this.pos + e;
		for (let e = this.pos; e < n; e++) {
			let r = Math.floor(e / 8), i = this.bytes[r], a = 7 - (e & 7);
			i &= ~(1 << a), i |= (t & 1 << n - e - 1) >> n - e - 1 << a, this.bytes[r] = i;
		}
		this.pos = n;
	}
	readAlignedByte() {
		if (this.pos % 8 != 0) throw Error("Bitstream is not byte-aligned.");
		let e = this.pos / 8, t = this.bytes[e] ?? 0;
		return this.pos += 8, t;
	}
	skipBits(e) {
		this.pos += e;
	}
	getBitsLeft() {
		return this.bytes.length * 8 - this.pos;
	}
	clone() {
		let t = new e(this.bytes);
		return t.pos = this.pos, t;
	}
}, lt = [
	96e3,
	88200,
	64e3,
	48e3,
	44100,
	32e3,
	24e3,
	22050,
	16e3,
	12e3,
	11025,
	8e3,
	7350
], ut = [
	-1,
	1,
	2,
	3,
	4,
	5,
	6,
	8
], dt = (e) => {
	if (!e || e.byteLength < 2) throw TypeError("AAC description must be at least 2 bytes long.");
	let t = new O(e), n = t.readBits(5);
	n === 31 && (n = 32 + t.readBits(6));
	let r = t.readBits(4), i = null;
	r === 15 ? i = t.readBits(24) : r < lt.length && (i = lt[r]);
	let a = t.readBits(4), o = null;
	return a >= 1 && a <= 7 && (o = ut[a]), {
		objectType: n,
		frequencyIndex: r,
		sampleRate: i,
		channelConfiguration: a,
		numberOfChannels: o
	};
}, ft = (e) => {
	let t = lt.indexOf(e.sampleRate), n = null;
	t === -1 && (t = 15, n = e.sampleRate);
	let r = ut.indexOf(e.numberOfChannels);
	if (r === -1) throw TypeError(`Unsupported number of channels: ${e.numberOfChannels}`);
	let i = 13;
	e.objectType >= 32 && (i += 6), t === 15 && (i += 24);
	let a = Math.ceil(i / 8), o = new Uint8Array(a), s = new O(o);
	return e.objectType < 32 ? s.writeBits(5, e.objectType) : (s.writeBits(5, 31), s.writeBits(6, e.objectType - 32)), s.writeBits(4, t), t === 15 && s.writeBits(24, n), s.writeBits(4, r), o;
}, pt = [
	"avc",
	"hevc",
	"vp9",
	"av1",
	"vp8",
	"prores"
], k = [
	"pcm-s16",
	"pcm-s16be",
	"pcm-s24",
	"pcm-s24be",
	"pcm-s32",
	"pcm-s32be",
	"pcm-f32",
	"pcm-f32be",
	"pcm-f64",
	"pcm-f64be",
	"pcm-u8",
	"pcm-s8",
	"ulaw",
	"alaw"
], mt = [
	"aac",
	"opus",
	"mp3",
	"vorbis",
	"flac",
	"ac3",
	"eac3"
], ht = [...mt, ...k], gt = ["webvtt"], _t = [
	{
		maxMacroblocks: 99,
		maxBitrate: 64e3,
		maxDpbMbs: 396,
		level: 10
	},
	{
		maxMacroblocks: 396,
		maxBitrate: 192e3,
		maxDpbMbs: 900,
		level: 11
	},
	{
		maxMacroblocks: 396,
		maxBitrate: 384e3,
		maxDpbMbs: 2376,
		level: 12
	},
	{
		maxMacroblocks: 396,
		maxBitrate: 768e3,
		maxDpbMbs: 2376,
		level: 13
	},
	{
		maxMacroblocks: 396,
		maxBitrate: 2e6,
		maxDpbMbs: 2376,
		level: 20
	},
	{
		maxMacroblocks: 792,
		maxBitrate: 4e6,
		maxDpbMbs: 4752,
		level: 21
	},
	{
		maxMacroblocks: 1620,
		maxBitrate: 4e6,
		maxDpbMbs: 8100,
		level: 22
	},
	{
		maxMacroblocks: 1620,
		maxBitrate: 1e7,
		maxDpbMbs: 8100,
		level: 30
	},
	{
		maxMacroblocks: 3600,
		maxBitrate: 14e6,
		maxDpbMbs: 18e3,
		level: 31
	},
	{
		maxMacroblocks: 5120,
		maxBitrate: 2e7,
		maxDpbMbs: 20480,
		level: 32
	},
	{
		maxMacroblocks: 8192,
		maxBitrate: 2e7,
		maxDpbMbs: 32768,
		level: 40
	},
	{
		maxMacroblocks: 8192,
		maxBitrate: 5e7,
		maxDpbMbs: 32768,
		level: 41
	},
	{
		maxMacroblocks: 8704,
		maxBitrate: 5e7,
		maxDpbMbs: 34816,
		level: 42
	},
	{
		maxMacroblocks: 22080,
		maxBitrate: 135e6,
		maxDpbMbs: 110400,
		level: 50
	},
	{
		maxMacroblocks: 36864,
		maxBitrate: 24e7,
		maxDpbMbs: 184320,
		level: 51
	},
	{
		maxMacroblocks: 36864,
		maxBitrate: 24e7,
		maxDpbMbs: 184320,
		level: 52
	},
	{
		maxMacroblocks: 139264,
		maxBitrate: 24e7,
		maxDpbMbs: 696320,
		level: 60
	},
	{
		maxMacroblocks: 139264,
		maxBitrate: 48e7,
		maxDpbMbs: 696320,
		level: 61
	},
	{
		maxMacroblocks: 139264,
		maxBitrate: 8e8,
		maxDpbMbs: 696320,
		level: 62
	}
], vt = [
	{
		maxPictureSize: 36864,
		maxBitrate: 128e3,
		tier: "L",
		level: 30
	},
	{
		maxPictureSize: 122880,
		maxBitrate: 15e5,
		tier: "L",
		level: 60
	},
	{
		maxPictureSize: 245760,
		maxBitrate: 3e6,
		tier: "L",
		level: 63
	},
	{
		maxPictureSize: 552960,
		maxBitrate: 6e6,
		tier: "L",
		level: 90
	},
	{
		maxPictureSize: 983040,
		maxBitrate: 1e7,
		tier: "L",
		level: 93
	},
	{
		maxPictureSize: 2228224,
		maxBitrate: 12e6,
		tier: "L",
		level: 120
	},
	{
		maxPictureSize: 2228224,
		maxBitrate: 3e7,
		tier: "H",
		level: 120
	},
	{
		maxPictureSize: 2228224,
		maxBitrate: 2e7,
		tier: "L",
		level: 123
	},
	{
		maxPictureSize: 2228224,
		maxBitrate: 5e7,
		tier: "H",
		level: 123
	},
	{
		maxPictureSize: 8912896,
		maxBitrate: 25e6,
		tier: "L",
		level: 150
	},
	{
		maxPictureSize: 8912896,
		maxBitrate: 1e8,
		tier: "H",
		level: 150
	},
	{
		maxPictureSize: 8912896,
		maxBitrate: 4e7,
		tier: "L",
		level: 153
	},
	{
		maxPictureSize: 8912896,
		maxBitrate: 16e7,
		tier: "H",
		level: 153
	},
	{
		maxPictureSize: 8912896,
		maxBitrate: 6e7,
		tier: "L",
		level: 156
	},
	{
		maxPictureSize: 8912896,
		maxBitrate: 24e7,
		tier: "H",
		level: 156
	},
	{
		maxPictureSize: 35651584,
		maxBitrate: 6e7,
		tier: "L",
		level: 180
	},
	{
		maxPictureSize: 35651584,
		maxBitrate: 24e7,
		tier: "H",
		level: 180
	},
	{
		maxPictureSize: 35651584,
		maxBitrate: 12e7,
		tier: "L",
		level: 183
	},
	{
		maxPictureSize: 35651584,
		maxBitrate: 48e7,
		tier: "H",
		level: 183
	},
	{
		maxPictureSize: 35651584,
		maxBitrate: 24e7,
		tier: "L",
		level: 186
	},
	{
		maxPictureSize: 35651584,
		maxBitrate: 8e8,
		tier: "H",
		level: 186
	}
], yt = [
	{
		maxPictureSize: 36864,
		maxBitrate: 2e5,
		level: 10
	},
	{
		maxPictureSize: 73728,
		maxBitrate: 8e5,
		level: 11
	},
	{
		maxPictureSize: 122880,
		maxBitrate: 18e5,
		level: 20
	},
	{
		maxPictureSize: 245760,
		maxBitrate: 36e5,
		level: 21
	},
	{
		maxPictureSize: 552960,
		maxBitrate: 72e5,
		level: 30
	},
	{
		maxPictureSize: 983040,
		maxBitrate: 12e6,
		level: 31
	},
	{
		maxPictureSize: 2228224,
		maxBitrate: 18e6,
		level: 40
	},
	{
		maxPictureSize: 2228224,
		maxBitrate: 3e7,
		level: 41
	},
	{
		maxPictureSize: 8912896,
		maxBitrate: 6e7,
		level: 50
	},
	{
		maxPictureSize: 8912896,
		maxBitrate: 12e7,
		level: 51
	},
	{
		maxPictureSize: 8912896,
		maxBitrate: 18e7,
		level: 52
	},
	{
		maxPictureSize: 35651584,
		maxBitrate: 18e7,
		level: 60
	},
	{
		maxPictureSize: 35651584,
		maxBitrate: 24e7,
		level: 61
	},
	{
		maxPictureSize: 35651584,
		maxBitrate: 48e7,
		level: 62
	}
], bt = [
	{
		maxPictureSize: 147456,
		maxBitrate: 15e5,
		tier: "M",
		level: 0
	},
	{
		maxPictureSize: 278784,
		maxBitrate: 3e6,
		tier: "M",
		level: 1
	},
	{
		maxPictureSize: 665856,
		maxBitrate: 6e6,
		tier: "M",
		level: 4
	},
	{
		maxPictureSize: 1065024,
		maxBitrate: 1e7,
		tier: "M",
		level: 5
	},
	{
		maxPictureSize: 2359296,
		maxBitrate: 12e6,
		tier: "M",
		level: 8
	},
	{
		maxPictureSize: 2359296,
		maxBitrate: 3e7,
		tier: "H",
		level: 8
	},
	{
		maxPictureSize: 2359296,
		maxBitrate: 2e7,
		tier: "M",
		level: 9
	},
	{
		maxPictureSize: 2359296,
		maxBitrate: 5e7,
		tier: "H",
		level: 9
	},
	{
		maxPictureSize: 8912896,
		maxBitrate: 3e7,
		tier: "M",
		level: 12
	},
	{
		maxPictureSize: 8912896,
		maxBitrate: 1e8,
		tier: "H",
		level: 12
	},
	{
		maxPictureSize: 8912896,
		maxBitrate: 4e7,
		tier: "M",
		level: 13
	},
	{
		maxPictureSize: 8912896,
		maxBitrate: 16e7,
		tier: "H",
		level: 13
	},
	{
		maxPictureSize: 8912896,
		maxBitrate: 6e7,
		tier: "M",
		level: 14
	},
	{
		maxPictureSize: 8912896,
		maxBitrate: 24e7,
		tier: "H",
		level: 14
	},
	{
		maxPictureSize: 35651584,
		maxBitrate: 6e7,
		tier: "M",
		level: 15
	},
	{
		maxPictureSize: 35651584,
		maxBitrate: 24e7,
		tier: "H",
		level: 15
	},
	{
		maxPictureSize: 35651584,
		maxBitrate: 6e7,
		tier: "M",
		level: 16
	},
	{
		maxPictureSize: 35651584,
		maxBitrate: 24e7,
		tier: "H",
		level: 16
	},
	{
		maxPictureSize: 35651584,
		maxBitrate: 1e8,
		tier: "M",
		level: 17
	},
	{
		maxPictureSize: 35651584,
		maxBitrate: 48e7,
		tier: "H",
		level: 17
	},
	{
		maxPictureSize: 35651584,
		maxBitrate: 16e7,
		tier: "M",
		level: 18
	},
	{
		maxPictureSize: 35651584,
		maxBitrate: 8e8,
		tier: "H",
		level: 18
	},
	{
		maxPictureSize: 35651584,
		maxBitrate: 16e7,
		tier: "M",
		level: 19
	},
	{
		maxPictureSize: 35651584,
		maxBitrate: 8e8,
		tier: "H",
		level: 19
	}
], xt = ".01.01.01.01.00", St = ".0.110.01.01.01.0", Ct = [
	"ap4x",
	"ap4h",
	"apch",
	"apcn",
	"apcs",
	"apco"
], wt = [
	{
		fourCc: "apco",
		bitrate: 45e6,
		alpha: !1
	},
	{
		fourCc: "apcs",
		bitrate: 102e6,
		alpha: !1
	},
	{
		fourCc: "apcn",
		bitrate: 147e6,
		alpha: !1
	},
	{
		fourCc: "apch",
		bitrate: 22e7,
		alpha: !1
	},
	{
		fourCc: "ap4h",
		bitrate: 33e7,
		alpha: !0
	},
	{
		fourCc: "ap4x",
		bitrate: 5e8,
		alpha: !0
	}
], Tt = (e, t, n, r, i) => {
	if (e === "avc") {
		let e = Math.ceil(t / 16) * Math.ceil(n / 16), i = _t.find((t) => e <= t.maxMacroblocks && r <= t.maxBitrate) ?? u(_t), a = i ? i.level : 0;
		return `avc1.${"64".padStart(2, "0")}00${a.toString(16).padStart(2, "0")}`;
	} else if (e === "hevc") {
		let e = t * n, i = vt.find((t) => e <= t.maxPictureSize && r <= t.maxBitrate) ?? u(vt);
		return `hev1.1.6.${i.tier}${i.level}.B0`;
	} else if (e === "vp8") return "vp8";
	else if (e === "vp9") {
		let e = t * n;
		return `vp09.00.${(yt.find((t) => e <= t.maxPictureSize && r <= t.maxBitrate) ?? u(yt)).level.toString().padStart(2, "0")}.08`;
	} else if (e === "av1") {
		let e = t * n, i = bt.find((t) => e <= t.maxPictureSize && r <= t.maxBitrate) ?? u(bt);
		return `av01.0.${i.level.toString().padStart(2, "0")}${i.tier}.08`;
	} else if (e === "prores") {
		let e = (t * n / (1920 * 1080)) ** .95, a = wt.filter((e) => e.alpha === i), o = a[0].fourCc, s = Infinity;
		for (let { fourCc: t, bitrate: n } of a) {
			let i = Math.abs(n * e - r);
			i < s && (s = i, o = t);
		}
		return o;
	} else he(e);
	throw TypeError(`Unhandled codec '${String(e)}'.`);
}, Et = (e) => {
	let t = e.split("."), n = Number(t[1]), r = t[2], i = Number(r.slice(0, -1)), a = (n << 5) + i, o = +(r.slice(-1) === "H"), s = Number(t[3]) === 8 ? 0 : 1, c = t[4] ? Number(t[4]) : 0, l = t[5] ? Number(t[5][0]) : 1, u = t[5] ? Number(t[5][1]) : 1, d = t[5] ? Number(t[5][2]) : 0;
	return [
		129,
		a,
		(o << 7) + (s << 6) + 0 + (c << 4) + (l << 3) + (u << 2) + d,
		0
	];
}, Dt = (e) => {
	let { codec: t, codecDescription: n, colorSpace: r, avcCodecInfo: i, hevcCodecInfo: a, vp9CodecInfo: o, av1CodecInfo: s, proresFormat: l } = e;
	if (t === "avc") {
		if (c(e.avcType !== null), i) {
			let t = new Uint8Array([
				i.avcProfileIndication,
				i.profileCompatibility,
				i.avcLevelIndication
			]);
			return `avc${e.avcType}.${ae(t)}`;
		}
		if (!n || n.byteLength < 4) throw TypeError("AVC decoder description is not provided or is not at least 4 bytes long.");
		return `avc${e.avcType}.${ae(n.subarray(1, 4))}`;
	} else if (t === "hevc") {
		let e, t, r, i, o, s;
		if (a) e = a.generalProfileSpace, t = a.generalProfileIdc, r = se(a.generalProfileCompatibilityFlags), i = a.generalTierFlag, o = a.generalLevelIdc, s = [...a.generalConstraintIndicatorFlags];
		else {
			if (!n || n.byteLength < 23) throw TypeError("HEVC decoder description is not provided or is not at least 23 bytes long.");
			let a = h(n), c = a.getUint8(1);
			e = c >> 6 & 3, t = c & 31, r = se(a.getUint32(2)), i = c >> 5 & 1, o = a.getUint8(12), s = [];
			for (let e = 0; e < 6; e++) s.push(a.getUint8(6 + e));
		}
		let c = "hev1.";
		for (c += [
			"",
			"A",
			"B",
			"C"
		][e] + t, c += ".", c += r.toString(16).toUpperCase(), c += ".", c += i === 0 ? "L" : "H", c += o; s.length > 0 && s[s.length - 1] === 0;) s.pop();
		return s.length > 0 && (c += ".", c += s.map((e) => e.toString(16).toUpperCase()).join(".")), c;
	} else if (t === "vp8") return "vp8";
	else if (t === "vp9") {
		if (!o) {
			let t = e.width * e.height, n = u(yt).level;
			for (let e of yt) if (t <= e.maxPictureSize) {
				n = e.level;
				break;
			}
			return `vp09.00.${n.toString().padStart(2, "0")}.08`;
		}
		let t = o.profile.toString().padStart(2, "0"), n = o.level.toString().padStart(2, "0"), r = o.bitDepth.toString().padStart(2, "0"), i = o.chromaSubsampling.toString().padStart(2, "0"), a = o.colourPrimaries.toString().padStart(2, "0"), s = o.transferCharacteristics.toString().padStart(2, "0"), c = o.matrixCoefficients.toString().padStart(2, "0"), l = o.videoFullRangeFlag.toString().padStart(2, "0"), d = `vp09.${t}.${n}.${r}.${i}`;
		return d += `.${a}.${s}.${c}.${l}`, d.endsWith(xt) && (d = d.slice(0, -15)), d;
	} else if (t === "av1") {
		if (!s) {
			let t = e.width * e.height, n = u(yt).level;
			for (let e of yt) if (t <= e.maxPictureSize) {
				n = e.level;
				break;
			}
			return `av01.0.${n.toString().padStart(2, "0")}M.08`;
		}
		let t = s.profile, n = s.level.toString().padStart(2, "0"), i = s.tier ? "H" : "M", a = s.bitDepth.toString().padStart(2, "0"), o = s.monochrome ? "1" : "0", c = 100 * s.chromaSubsamplingX + 10 * s.chromaSubsamplingY + 1 * (s.chromaSubsamplingX && s.chromaSubsamplingY ? s.chromaSamplePosition : 0), l = r?.primaries ? y[r.primaries] : 1, d = r?.transfer ? x[r.transfer] : 1, f = r?.matrix ? C[r.matrix] : 1, p = +!!r?.fullRange, m = `av01.${t}.${n}${i}.${a}`;
		return m += `.${o}.${c.toString().padStart(3, "0")}`, m += `.${l.toString().padStart(2, "0")}`, m += `.${d.toString().padStart(2, "0")}`, m += `.${f.toString().padStart(2, "0")}`, m += `.${p}`, m.endsWith(St) && (m = m.slice(0, -17)), m;
	} else if (t === "prores") return l ?? "apch";
	else t !== null && he(t);
	throw TypeError(`Unhandled codec '${t}'.`);
}, Ot = (e, t, n) => {
	if (e === "aac") return t >= 2 && n <= 24e3 ? "mp4a.40.29" : n <= 24e3 ? "mp4a.40.5" : "mp4a.40.2";
	if (e === "mp3") return "mp3";
	if (e === "opus") return "opus";
	if (e === "vorbis") return "vorbis";
	if (e === "flac") return "flac";
	if (e === "ac3") return "ac-3";
	if (e === "eac3") return "ec-3";
	if (k.includes(e)) return e;
	throw TypeError(`Unhandled codec '${e}'.`);
}, kt = (e) => {
	let { codec: t, codecDescription: n, aacCodecInfo: r } = e;
	if (t === "aac") {
		if (!r) throw TypeError("AAC codec info must be provided.");
		if (r.isMpeg2) return "mp4a.67";
		{
			let e;
			return e = r.objectType === null ? dt(n).objectType : r.objectType, `mp4a.40.${e}`;
		}
	} else if (t === "mp3") return "mp3";
	else if (t === "opus") return "opus";
	else if (t === "vorbis") return "vorbis";
	else if (t === "flac") return "flac";
	else if (t === "ac3") return "ac-3";
	else if (t === "eac3") return "ec-3";
	else if (t && k.includes(t)) return t;
	throw TypeError(`Unhandled codec '${t}'.`);
}, At = 48e3, jt = /^pcm-([usf])(\d+)(be)?$/, Mt = (e) => {
	if (c(k.includes(e)), e === "ulaw") return {
		dataType: "ulaw",
		sampleSize: 1,
		littleEndian: !0,
		silentValue: 255
	};
	if (e === "alaw") return {
		dataType: "alaw",
		sampleSize: 1,
		littleEndian: !0,
		silentValue: 213
	};
	let t = jt.exec(e);
	c(t);
	let n;
	n = t[1] === "u" ? "unsigned" : t[1] === "s" ? "signed" : "float";
	let r = Number(t[2]) / 8, i = t[3] !== "be";
	return {
		dataType: n,
		sampleSize: r,
		littleEndian: i,
		silentValue: e === "pcm-u8" ? 2 ** 7 : 0
	};
}, Nt = (e) => e.startsWith("avc1") || e.startsWith("avc3") ? "avc" : e.startsWith("hev1") || e.startsWith("hvc1") ? "hevc" : e === "vp8" ? "vp8" : e.startsWith("vp09") ? "vp9" : e.startsWith("av01") ? "av1" : Ct.includes(e) ? "prores" : e === "mp3" || e === "mp4a.69" || e === "mp4a.6B" || e === "mp4a.6b" || e === "mp4a.40.34" ? "mp3" : e.startsWith("mp4a.40.") || e === "mp4a.67" ? "aac" : e === "opus" ? "opus" : e === "vorbis" ? "vorbis" : e === "flac" ? "flac" : e === "ac-3" || e === "ac3" ? "ac3" : e === "ec-3" || e === "eac3" ? "eac3" : e === "ulaw" ? "ulaw" : e === "alaw" ? "alaw" : jt.test(e) ? e : e === "webvtt" ? "webvtt" : null, Pt = (e) => e === "avc" ? { avc: { format: "avc" } } : e === "hevc" ? { hevc: { format: "hevc" } } : {}, Ft = (e) => e === "aac" ? { aac: { format: "aac" } } : e === "opus" ? { opus: { format: "opus" } } : {}, It = [
	"avc1",
	"avc3",
	"hev1",
	"hvc1",
	"vp8",
	"vp09",
	"av01",
	...Ct
], Lt = /^(avc1|avc3)\.[0-9a-fA-F]{6}$/, Rt = /^(hev1|hvc1)\.(?:[ABC]?\d+)\.[0-9a-fA-F]{1,8}\.[LH]\d+(?:\.[0-9a-fA-F]{1,2}){0,6}$/, zt = /^vp09(?:\.\d{2}){3}(?:(?:\.\d{2}){5})?$/, Bt = /^av01\.\d\.\d{2}[MH]\.\d{2}(?:\.\d\.\d{3}\.\d{2}\.\d{2}\.\d{2}\.\d)?$/, Vt = (e) => {
	if (!e) throw TypeError("Video chunk metadata must be provided.");
	if (typeof e != "object") throw TypeError("Video chunk metadata must be an object.");
	if (!e.decoderConfig) throw TypeError("Video chunk metadata must include a decoder configuration.");
	if (typeof e.decoderConfig != "object") throw TypeError("Video chunk metadata decoder configuration must be an object.");
	if (typeof e.decoderConfig.codec != "string") throw TypeError("Video chunk metadata decoder configuration must specify a codec string.");
	if (!It.some((t) => e.decoderConfig.codec.startsWith(t))) throw TypeError("Video chunk metadata decoder configuration codec string must be a valid video codec string as specified in the Mediabunny Codec Registry.");
	if (!Number.isInteger(e.decoderConfig.codedWidth) || e.decoderConfig.codedWidth <= 0) throw TypeError("Video chunk metadata decoder configuration must specify a valid codedWidth (positive integer).");
	if (!Number.isInteger(e.decoderConfig.codedHeight) || e.decoderConfig.codedHeight <= 0) throw TypeError("Video chunk metadata decoder configuration must specify a valid codedHeight (positive integer).");
	if (e.decoderConfig.displayAspectWidth !== void 0 && (!Number.isInteger(e.decoderConfig.displayAspectWidth) || e.decoderConfig.displayAspectWidth <= 0)) throw TypeError("Video chunk metadata decoder configuration displayAspectWidth, when defined, must be a positive integer.");
	if (e.decoderConfig.displayAspectHeight !== void 0 && (!Number.isInteger(e.decoderConfig.displayAspectHeight) || e.decoderConfig.displayAspectHeight <= 0)) throw TypeError("Video chunk metadata decoder configuration displayAspectHeight, when defined, must be a positive integer.");
	if (e.decoderConfig.displayAspectWidth !== void 0 != (e.decoderConfig.displayAspectHeight !== void 0)) throw TypeError("Video chunk metadata decoder configuration must specify both displayAspectWidth and displayAspectHeight, or neither.");
	if (e.decoderConfig.description !== void 0 && !ne(e.decoderConfig.description)) throw TypeError("Video chunk metadata decoder configuration description, when defined, must be an ArrayBuffer or an ArrayBuffer view.");
	if (e.decoderConfig.colorSpace !== void 0) {
		let { colorSpace: t } = e.decoderConfig;
		if (typeof t != "object") throw TypeError("Video chunk metadata decoder configuration colorSpace, when provided, must be an object.");
		let n = Object.keys(y);
		if (t.primaries != null && !n.includes(t.primaries)) throw TypeError(`Video chunk metadata decoder configuration colorSpace primaries, when defined, must be one of ${n.join(", ")}.`);
		let r = Object.keys(x);
		if (t.transfer != null && !r.includes(t.transfer)) throw TypeError(`Video chunk metadata decoder configuration colorSpace transfer, when defined, must be one of ${r.join(", ")}.`);
		let i = Object.keys(C);
		if (t.matrix != null && !i.includes(t.matrix)) throw TypeError(`Video chunk metadata decoder configuration colorSpace matrix, when defined, must be one of ${i.join(", ")}.`);
		if (t.fullRange != null && typeof t.fullRange != "boolean") throw TypeError("Video chunk metadata decoder configuration colorSpace fullRange, when defined, must be a boolean.");
	}
	if (e.decoderConfig.codec.startsWith("avc1") || e.decoderConfig.codec.startsWith("avc3")) {
		if (!Lt.test(e.decoderConfig.codec)) throw TypeError("Video chunk metadata decoder configuration codec string for AVC must be a valid AVC codec string as specified in Section 3.4 of RFC 6381.");
	} else if (e.decoderConfig.codec.startsWith("hev1") || e.decoderConfig.codec.startsWith("hvc1")) {
		if (!Rt.test(e.decoderConfig.codec)) throw TypeError("Video chunk metadata decoder configuration codec string for HEVC must be a valid HEVC codec string as specified in Section E.3 of ISO 14496-15.");
	} else if (e.decoderConfig.codec.startsWith("vp8")) {
		if (e.decoderConfig.codec !== "vp8") throw TypeError("Video chunk metadata decoder configuration codec string for VP8 must be \"vp8\".");
	} else if (e.decoderConfig.codec.startsWith("vp09")) {
		if (!zt.test(e.decoderConfig.codec)) throw TypeError("Video chunk metadata decoder configuration codec string for VP9 must be a valid VP9 codec string as specified in Section \"Codecs Parameter String\" of https://www.webmproject.org/vp9/mp4/.");
	} else if (e.decoderConfig.codec.startsWith("av01")) {
		if (!Bt.test(e.decoderConfig.codec)) throw TypeError("Video chunk metadata decoder configuration codec string for AV1 must be a valid AV1 codec string as specified in Section \"Codecs Parameter String\" of https://aomediacodec.github.io/av1-isobmff/.");
	} else if (Ct.some((t) => e.decoderConfig.codec.startsWith(t)) && !Ct.some((t) => e.decoderConfig.codec === t)) throw TypeError(`Video chunk metadata decoder configuration codec string for ProRes must be one of the valid ProRes four-character codes: ${Ct.join(", ")}.`);
}, Ht = [
	"mp4a",
	"mp3",
	"opus",
	"vorbis",
	"flac",
	"ulaw",
	"alaw",
	"pcm",
	"ac-3",
	"ec-3"
], Ut = (e) => {
	if (!e) throw TypeError("Audio chunk metadata must be provided.");
	if (typeof e != "object") throw TypeError("Audio chunk metadata must be an object.");
	if (!e.decoderConfig) throw TypeError("Audio chunk metadata must include a decoder configuration.");
	if (typeof e.decoderConfig != "object") throw TypeError("Audio chunk metadata decoder configuration must be an object.");
	if (typeof e.decoderConfig.codec != "string") throw TypeError("Audio chunk metadata decoder configuration must specify a codec string.");
	if (!Ht.some((t) => e.decoderConfig.codec.startsWith(t))) throw TypeError("Audio chunk metadata decoder configuration codec string must be a valid audio codec string as specified in the Mediabunny Codec Registry.");
	if (!Number.isInteger(e.decoderConfig.sampleRate) || e.decoderConfig.sampleRate <= 0) throw TypeError("Audio chunk metadata decoder configuration must specify a valid sampleRate (positive integer).");
	if (!Number.isInteger(e.decoderConfig.numberOfChannels) || e.decoderConfig.numberOfChannels <= 0) throw TypeError("Audio chunk metadata decoder configuration must specify a valid numberOfChannels (positive integer).");
	if (e.decoderConfig.description !== void 0 && !ne(e.decoderConfig.description)) throw TypeError("Audio chunk metadata decoder configuration description, when defined, must be an ArrayBuffer or an ArrayBuffer view.");
	if (e.decoderConfig.codec.startsWith("mp4a") && e.decoderConfig.codec !== "mp4a.69" && e.decoderConfig.codec !== "mp4a.6B" && e.decoderConfig.codec !== "mp4a.6b") {
		if (![
			"mp4a.40.2",
			"mp4a.40.02",
			"mp4a.40.5",
			"mp4a.40.05",
			"mp4a.40.29",
			"mp4a.67"
		].includes(e.decoderConfig.codec)) throw TypeError("Audio chunk metadata decoder configuration codec string for AAC must be a valid AAC codec string as specified in https://www.w3.org/TR/webcodecs-aac-codec-registration/.");
	} else if (e.decoderConfig.codec.startsWith("mp3") || e.decoderConfig.codec.startsWith("mp4a")) {
		if (e.decoderConfig.codec !== "mp3" && e.decoderConfig.codec !== "mp4a.69" && e.decoderConfig.codec !== "mp4a.6B" && e.decoderConfig.codec !== "mp4a.6b") throw TypeError("Audio chunk metadata decoder configuration codec string for MP3 must be \"mp3\", \"mp4a.69\" or \"mp4a.6B\".");
	} else if (e.decoderConfig.codec.startsWith("opus")) {
		if (e.decoderConfig.codec !== "opus") throw TypeError("Audio chunk metadata decoder configuration codec string for Opus must be \"opus\".");
		if (e.decoderConfig.description && e.decoderConfig.description.byteLength < 18) throw TypeError("Audio chunk metadata decoder configuration description, when specified, is expected to be an Identification Header as specified in Section 5.1 of RFC 7845.");
	} else if (e.decoderConfig.codec.startsWith("vorbis")) {
		if (e.decoderConfig.codec !== "vorbis") throw TypeError("Audio chunk metadata decoder configuration codec string for Vorbis must be \"vorbis\".");
		if (!e.decoderConfig.description) throw TypeError("Audio chunk metadata decoder configuration for Vorbis must include a description, which is expected to adhere to the format described in https://www.w3.org/TR/webcodecs-vorbis-codec-registration/.");
	} else if (e.decoderConfig.codec.startsWith("flac")) {
		if (e.decoderConfig.codec !== "flac") throw TypeError("Audio chunk metadata decoder configuration codec string for FLAC must be \"flac\".");
		if (!e.decoderConfig.description || e.decoderConfig.description.byteLength < 42) throw TypeError("Audio chunk metadata decoder configuration for FLAC must include a description, which is expected to adhere to the format described in https://www.w3.org/TR/webcodecs-flac-codec-registration/.");
	} else if (e.decoderConfig.codec.startsWith("ac-3") || e.decoderConfig.codec.startsWith("ac3")) {
		if (e.decoderConfig.codec !== "ac-3") throw TypeError("Audio chunk metadata decoder configuration codec string for AC-3 must be \"ac-3\".");
	} else if (e.decoderConfig.codec.startsWith("ec-3") || e.decoderConfig.codec.startsWith("eac3")) {
		if (e.decoderConfig.codec !== "ec-3") throw TypeError("Audio chunk metadata decoder configuration codec string for EC-3 must be \"ec-3\".");
	} else if ((e.decoderConfig.codec.startsWith("pcm") || e.decoderConfig.codec.startsWith("ulaw") || e.decoderConfig.codec.startsWith("alaw")) && !k.includes(e.decoderConfig.codec)) throw TypeError(`Audio chunk metadata decoder configuration codec string for PCM must be one of the supported PCM codecs (${k.join(", ")}).`);
}, Wt = (e) => {
	if (!e) throw TypeError("Subtitle metadata must be provided.");
	if (typeof e != "object") throw TypeError("Subtitle metadata must be an object.");
	if (!e.config) throw TypeError("Subtitle metadata must include a config object.");
	if (typeof e.config != "object") throw TypeError("Subtitle metadata config must be an object.");
	if (typeof e.config.description != "string") throw TypeError("Subtitle metadata config description must be a string.");
}, Gt = [
	44100,
	48e3,
	32e3
], Kt = [
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	32,
	40,
	48,
	56,
	64,
	80,
	96,
	112,
	128,
	160,
	192,
	224,
	256,
	320,
	-1,
	-1,
	32,
	48,
	56,
	64,
	80,
	96,
	112,
	128,
	160,
	192,
	224,
	256,
	320,
	384,
	-1,
	-1,
	32,
	64,
	96,
	128,
	160,
	192,
	224,
	256,
	288,
	320,
	352,
	384,
	416,
	448,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	8,
	16,
	24,
	32,
	40,
	48,
	56,
	64,
	80,
	96,
	112,
	128,
	144,
	160,
	-1,
	-1,
	8,
	16,
	24,
	32,
	40,
	48,
	56,
	64,
	80,
	96,
	112,
	128,
	144,
	160,
	-1,
	-1,
	32,
	48,
	56,
	64,
	80,
	96,
	112,
	128,
	144,
	160,
	176,
	192,
	224,
	256,
	-1
], qt = (e, t, n, r, i) => t === 0 ? 0 : t === 1 ? Math.floor(144 * n / (r << e)) + i : t === 2 ? Math.floor(144 * n / r) + i : (Math.floor(12 * n / r) + i) * 4, Jt = (e, t, n, r) => t === 0 ? 0 : t === 1 ? 144 * n / (r << e) : t === 2 ? 144 * n / r : 12 * n / r * 4, Yt = (e, t) => e === 3 ? t === 3 ? 21 : 36 : t === 3 ? 13 : 21, Xt = (e, t) => {
	let n = e >>> 24, r = e >>> 16 & 255, i = e >>> 8 & 255, a = e & 255;
	if (n !== 255 && r !== 255 && i !== 255 && a !== 255) return {
		header: null,
		bytesAdvanced: 4
	};
	if (n !== 255 || (r & 224) != 224) return {
		header: null,
		bytesAdvanced: 1
	};
	let o = 0, s = 0;
	r & 16 ? o = r & 8 ? 0 : 1 : (o = 1, s = 1);
	let c = r >> 3 & 3, l = r >> 1 & 3, u = i >> 4 & 15, d = (i >> 2 & 3) % 3, f = i >> 1 & 1, p = a >> 6 & 3, m = a >> 4 & 3, h = a >> 3 & 1, g = a >> 2 & 1, _ = a & 3, v = Kt[o * 16 * 4 + l * 16 + u];
	if (v === -1) return {
		header: null,
		bytesAdvanced: 1
	};
	let y = v * 1e3, b = Gt[d] >> o + s, x = qt(o, l, y, b, f);
	if (t !== null && t < x) return {
		header: null,
		bytesAdvanced: 1
	};
	let S;
	return S = c === 3 ? l === 3 ? 384 : 1152 : l === 3 ? 384 : l === 2 ? 1152 : 576, {
		header: {
			totalSize: x,
			mpegVersionId: c,
			lowSamplingFrequency: o,
			layer: l,
			bitrate: y,
			frequencyIndex: d,
			sampleRate: b,
			channel: p,
			modeExtension: m,
			copyright: h,
			original: g,
			emphasis: _,
			audioSamplesInFrame: S
		},
		bytesAdvanced: 1
	};
}, Zt = (e) => {
	let t = 2130706432, n = 0;
	for (; t !== 0;) n >>= 1, n |= e & t, t >>= 8;
	return n;
}, Qt;
(function(e) {
	e[e.FrameCount = 1] = "FrameCount", e[e.FileSize = 2] = "FileSize", e[e.Toc = 4] = "Toc";
})(Qt ||= {});
var $t = (e) => e === 3 ? 1 : 2, en = [
	48e3,
	44100,
	32e3
], tn = [
	24e3,
	22050,
	16e3
], A;
(function(e) {
	e[e.NON_IDR_SLICE = 1] = "NON_IDR_SLICE", e[e.SLICE_DPA = 2] = "SLICE_DPA", e[e.SLICE_DPB = 3] = "SLICE_DPB", e[e.SLICE_DPC = 4] = "SLICE_DPC", e[e.IDR = 5] = "IDR", e[e.SEI = 6] = "SEI", e[e.SPS = 7] = "SPS", e[e.PPS = 8] = "PPS", e[e.AUD = 9] = "AUD", e[e.SPS_EXT = 13] = "SPS_EXT";
})(A ||= {});
var j;
(function(e) {
	e[e.RASL_N = 8] = "RASL_N", e[e.RASL_R = 9] = "RASL_R", e[e.BLA_W_LP = 16] = "BLA_W_LP", e[e.RSV_IRAP_VCL23 = 23] = "RSV_IRAP_VCL23", e[e.VPS_NUT = 32] = "VPS_NUT", e[e.SPS_NUT = 33] = "SPS_NUT", e[e.PPS_NUT = 34] = "PPS_NUT", e[e.AUD_NUT = 35] = "AUD_NUT", e[e.PREFIX_SEI_NUT = 39] = "PREFIX_SEI_NUT", e[e.SUFFIX_SEI_NUT = 40] = "SUFFIX_SEI_NUT";
})(j ||= {});
var nn = function* (e) {
	let t = 0, n = -1;
	for (; t < e.length - 2;) {
		let r = e.indexOf(0, t);
		if (r === -1 || r >= e.length - 2) break;
		t = r;
		let i = 0;
		if (t + 3 < e.length && e[t + 1] === 0 && e[t + 2] === 0 && e[t + 3] === 1 ? i = 4 : e[t + 1] === 0 && e[t + 2] === 1 && (i = 3), i === 0) {
			t++;
			continue;
		}
		n !== -1 && t > n && (yield {
			offset: n,
			length: t - n
		}), n = t + i, t = n;
	}
	n !== -1 && n < e.length && (yield {
		offset: n,
		length: e.length - n
	});
}, rn = function* (e, t) {
	let n = 0, r = new DataView(e.buffer, e.byteOffset, e.byteLength);
	for (; n + t <= e.length;) {
		let e;
		t === 1 ? e = r.getUint8(n) : t === 2 ? e = r.getUint16(n, !1) : t === 3 ? e = ge(r, n, !1) : (c(t === 4), e = r.getUint32(n, !1)), n += t, yield {
			offset: n,
			length: e
		}, n += e;
	}
}, an = (e, t) => t.description ? rn(e, (m(t.description)[4] & 3) + 1) : nn(e), on = (e) => e & 31, sn = (e) => {
	let t = [], n = e.length;
	for (let r = 0; r < n; r++) r + 2 < n && e[r] === 0 && e[r + 1] === 0 && e[r + 2] === 3 ? (t.push(0, 0), r += 2) : t.push(e[r]);
	return new Uint8Array(t);
}, cn = new Uint8Array([
	0,
	0,
	0,
	1
]), ln = (e) => {
	let t = e.reduce((e, t) => e + cn.byteLength + t.byteLength, 0), n = new Uint8Array(t), r = 0;
	for (let t of e) n.set(cn, r), r += cn.byteLength, n.set(t, r), r += t.byteLength;
	return n;
}, un = (e, t) => {
	let n = e.reduce((e, n) => e + t + n.byteLength, 0), r = new Uint8Array(n), i = 0;
	for (let n of e) {
		let e = new DataView(r.buffer, r.byteOffset, r.byteLength);
		switch (t) {
			case 1:
				e.setUint8(i, n.byteLength);
				break;
			case 2:
				e.setUint16(i, n.byteLength, !1);
				break;
			case 3:
				ve(e, i, n.byteLength, !1);
				break;
			case 4:
				e.setUint32(i, n.byteLength, !1);
				break;
		}
		i += t, r.set(n, i), i += n.byteLength;
	}
	return r;
}, dn = (e, t) => t.description ? un(e, (m(t.description)[4] & 3) + 1) : ln(e), fn = (e) => {
	try {
		let t = [], n = [], r = [];
		for (let i of nn(e)) {
			let a = e.subarray(i.offset, i.offset + i.length), o = on(a[0]);
			o === A.SPS ? t.push(a) : o === A.PPS ? n.push(a) : o === A.SPS_EXT && r.push(a);
		}
		if (t.length === 0 || n.length === 0) return null;
		let i = t[0], a = gn(i);
		c(a !== null);
		let o = a.profileIdc === 100 || a.profileIdc === 110 || a.profileIdc === 122 || a.profileIdc === 144;
		return {
			configurationVersion: 1,
			avcProfileIndication: a.profileIdc,
			profileCompatibility: a.constraintFlags,
			avcLevelIndication: a.levelIdc,
			lengthSizeMinusOne: 3,
			sequenceParameterSets: t,
			pictureParameterSets: n,
			chromaFormat: o ? a.chromaFormatIdc : null,
			bitDepthLumaMinus8: o ? a.bitDepthLumaMinus8 : null,
			bitDepthChromaMinus8: o ? a.bitDepthChromaMinus8 : null,
			sequenceParameterSetExt: o ? r : null
		};
	} catch (e) {
		return D._error("Error building AVC Decoder Configuration Record:", e), null;
	}
}, pn = (e) => {
	let t = [];
	t.push(e.configurationVersion), t.push(e.avcProfileIndication), t.push(e.profileCompatibility), t.push(e.avcLevelIndication), t.push(252 | e.lengthSizeMinusOne & 3), t.push(224 | e.sequenceParameterSets.length & 31);
	for (let n of e.sequenceParameterSets) {
		let e = n.byteLength;
		t.push(e >> 8), t.push(e & 255);
		for (let r = 0; r < e; r++) t.push(n[r]);
	}
	t.push(e.pictureParameterSets.length);
	for (let n of e.pictureParameterSets) {
		let e = n.byteLength;
		t.push(e >> 8), t.push(e & 255);
		for (let r = 0; r < e; r++) t.push(n[r]);
	}
	if (e.avcProfileIndication === 100 || e.avcProfileIndication === 110 || e.avcProfileIndication === 122 || e.avcProfileIndication === 144) {
		c(e.chromaFormat !== null), c(e.bitDepthLumaMinus8 !== null), c(e.bitDepthChromaMinus8 !== null), c(e.sequenceParameterSetExt !== null), t.push(252 | e.chromaFormat & 3), t.push(248 | e.bitDepthLumaMinus8 & 7), t.push(248 | e.bitDepthChromaMinus8 & 7), t.push(e.sequenceParameterSetExt.length);
		for (let n of e.sequenceParameterSetExt) {
			let e = n.byteLength;
			t.push(e >> 8), t.push(e & 255);
			for (let r = 0; r < e; r++) t.push(n[r]);
		}
	}
	return new Uint8Array(t);
}, mn = (e) => {
	try {
		let t = h(e), n = 0, r = t.getUint8(n++), i = t.getUint8(n++), a = t.getUint8(n++), o = t.getUint8(n++), s = t.getUint8(n++) & 3, c = t.getUint8(n++) & 31, l = [];
		for (let r = 0; r < c; r++) {
			let r = t.getUint16(n, !1);
			n += 2, l.push(e.subarray(n, n + r)), n += r;
		}
		let u = t.getUint8(n++), d = [];
		for (let r = 0; r < u; r++) {
			let r = t.getUint16(n, !1);
			n += 2, d.push(e.subarray(n, n + r)), n += r;
		}
		let f = {
			configurationVersion: r,
			avcProfileIndication: i,
			profileCompatibility: a,
			avcLevelIndication: o,
			lengthSizeMinusOne: s,
			sequenceParameterSets: l,
			pictureParameterSets: d,
			chromaFormat: null,
			bitDepthLumaMinus8: null,
			bitDepthChromaMinus8: null,
			sequenceParameterSetExt: null
		};
		if ((i === 100 || i === 110 || i === 122 || i === 144) && n + 4 <= e.length) {
			let r = t.getUint8(n++) & 3, i = t.getUint8(n++) & 7, a = t.getUint8(n++) & 7, o = t.getUint8(n++);
			f.chromaFormat = r, f.bitDepthLumaMinus8 = i, f.bitDepthChromaMinus8 = a;
			let s = [];
			for (let r = 0; r < o; r++) {
				let r = t.getUint16(n, !1);
				n += 2, s.push(e.subarray(n, n + r)), n += r;
			}
			f.sequenceParameterSetExt = s;
		}
		return f;
	} catch (e) {
		return D._error("Error deserializing AVC Decoder Configuration Record:", e), null;
	}
}, hn = {
	1: {
		num: 1,
		den: 1
	},
	2: {
		num: 12,
		den: 11
	},
	3: {
		num: 10,
		den: 11
	},
	4: {
		num: 16,
		den: 11
	},
	5: {
		num: 40,
		den: 33
	},
	6: {
		num: 24,
		den: 11
	},
	7: {
		num: 20,
		den: 11
	},
	8: {
		num: 32,
		den: 11
	},
	9: {
		num: 80,
		den: 33
	},
	10: {
		num: 18,
		den: 11
	},
	11: {
		num: 15,
		den: 11
	},
	12: {
		num: 64,
		den: 33
	},
	13: {
		num: 160,
		den: 99
	},
	14: {
		num: 4,
		den: 3
	},
	15: {
		num: 3,
		den: 2
	},
	16: {
		num: 2,
		den: 1
	}
}, gn = (e) => {
	try {
		let t = new O(sn(e));
		if (t.skipBits(1), t.skipBits(2), t.readBits(5) !== 7) return null;
		let n = t.readAlignedByte(), r = t.readAlignedByte(), i = t.readAlignedByte();
		f(t);
		let a = 1, o = 0, s = 0, l = 0;
		if ((n === 100 || n === 110 || n === 122 || n === 244 || n === 44 || n === 83 || n === 86 || n === 118 || n === 128) && (a = f(t), a === 3 && (l = t.readBits(1)), o = f(t), s = f(t), t.skipBits(1), t.readBits(1))) {
			for (let e = 0; e < (a === 3 ? 12 : 8); e++) if (t.readBits(1)) {
				let n = e < 6 ? 16 : 64, r = 8, i = 8;
				for (let e = 0; e < n; e++) {
					if (i !== 0) {
						let e = p(t);
						i = (r + e + 256) % 256;
					}
					r = i === 0 ? r : i;
				}
			}
		}
		f(t);
		let d = f(t);
		if (d === 0) f(t);
		else if (d === 1) {
			t.skipBits(1), p(t), p(t);
			let e = f(t);
			for (let n = 0; n < e; n++) p(t);
		}
		f(t), t.skipBits(1);
		let m = f(t), h = f(t), g = 16 * (m + 1), _ = 16 * (h + 1), v = g, y = _, b = t.readBits(1);
		if (b || t.skipBits(1), t.skipBits(1), t.readBits(1)) {
			let e = f(t), n = f(t), r = f(t), i = f(t), o, s;
			if ((l === 0 ? a : 0) === 0) o = 1, s = 2 - b;
			else {
				let e = a === 3 ? 1 : 2, t = a === 1 ? 2 : 1;
				o = e, s = t * (2 - b);
			}
			v -= o * (e + n), y -= s * (r + i);
		}
		let x = 2, S = 2, C = 2, ee = 0, te = {
			num: 1,
			den: 1
		}, ne = null, re = null;
		if (t.readBits(1)) {
			if (t.readBits(1)) {
				let e = t.readBits(8);
				if (e === 255) te = {
					num: t.readBits(16),
					den: t.readBits(16)
				};
				else {
					let t = hn[e];
					t && (te = t);
				}
			}
			t.readBits(1) && t.skipBits(1), t.readBits(1) && (t.skipBits(3), ee = t.readBits(1), t.readBits(1) && (x = t.readBits(8), S = t.readBits(8), C = t.readBits(8))), t.readBits(1) && (f(t), f(t)), t.readBits(1) && (t.skipBits(32), t.skipBits(32), t.skipBits(1));
			let e = t.readBits(1);
			e && _n(t);
			let n = t.readBits(1);
			n && _n(t), (e || n) && t.skipBits(1), t.skipBits(1), t.readBits(1) && (t.skipBits(1), f(t), f(t), f(t), f(t), ne = f(t), re = f(t));
		}
		if (ne === null) {
			c(re === null);
			let e = r & 16;
			if ((n === 44 || n === 86 || n === 100 || n === 110 || n === 122 || n === 244) && e) ne = 0, re = 0;
			else {
				let e = m + 1, t = h + 1, n = (2 - b) * t, r = _t.find((e) => e.level >= i) ?? u(_t), a = Math.min(Math.floor(r.maxDpbMbs / (e * n)), 16);
				ne = a, re = a;
			}
		}
		return c(re !== null), {
			profileIdc: n,
			constraintFlags: r,
			levelIdc: i,
			frameMbsOnlyFlag: b,
			chromaFormatIdc: a,
			bitDepthLumaMinus8: o,
			bitDepthChromaMinus8: s,
			codedWidth: g,
			codedHeight: _,
			displayWidth: v,
			displayHeight: y,
			pixelAspectRatio: te,
			colourPrimaries: x,
			matrixCoefficients: C,
			transferCharacteristics: S,
			fullRangeFlag: ee,
			numReorderFrames: ne,
			maxDecFrameBuffering: re
		};
	} catch (e) {
		return D._error("Error parsing AVC SPS:", e), null;
	}
}, _n = (e) => {
	let t = f(e);
	e.skipBits(4), e.skipBits(4);
	for (let n = 0; n <= t; n++) f(e), f(e), e.skipBits(1);
	e.skipBits(5), e.skipBits(5), e.skipBits(5), e.skipBits(5);
}, vn = (e, t) => t.description ? un(e, (m(t.description)[21] & 3) + 1) : ln(e), yn = (e, t) => t.description ? rn(e, (m(t.description)[21] & 3) + 1) : nn(e), bn = (e) => e >> 1 & 63, xn = (e) => {
	try {
		let t = new O(sn(e));
		t.skipBits(16), t.readBits(4);
		let n = t.readBits(3), r = t.readBits(1), { general_profile_space: i, general_tier_flag: a, general_profile_idc: o, general_profile_compatibility_flags: s, general_constraint_indicator_flags: c, general_level_idc: l } = Cn(t, n);
		f(t);
		let u = f(t), d = 0;
		u === 3 && (d = t.readBits(1));
		let p = f(t), m = f(t), h = p, g = m;
		if (t.readBits(1)) {
			let e = f(t), n = f(t), r = f(t), i = f(t), a = 1, o = 1, s = d === 0 ? u : 0;
			s === 1 ? (a = 2, o = 2) : s === 2 && (a = 2, o = 1), h -= (e + n) * a, g -= (r + i) * o;
		}
		let _ = f(t), v = f(t);
		f(t);
		let y = t.readBits(1) ? 0 : n, b = 0;
		for (let e = y; e <= n; e++) f(t), b = f(t), f(t);
		if (f(t), f(t), f(t), f(t), f(t), f(t), t.readBits(1) && t.readBits(1) && wn(t), t.skipBits(1), t.skipBits(1), t.readBits(1) && (t.skipBits(4), t.skipBits(4), f(t), f(t), t.skipBits(1)), Tn(t, f(t)), t.readBits(1)) {
			let e = f(t);
			for (let n = 0; n < e; n++) f(t), t.skipBits(1);
		}
		t.skipBits(1), t.skipBits(1);
		let x = 2, S = 2, C = 2, ee = 0, te = 0, ne = {
			num: 1,
			den: 1
		};
		if (t.readBits(1)) {
			let e = Dn(t, n);
			ne = e.pixelAspectRatio, x = e.colourPrimaries, S = e.transferCharacteristics, C = e.matrixCoefficients, ee = e.fullRangeFlag, te = e.minSpatialSegmentationIdc;
		}
		return {
			displayWidth: h,
			displayHeight: g,
			pixelAspectRatio: ne,
			colourPrimaries: x,
			transferCharacteristics: S,
			matrixCoefficients: C,
			fullRangeFlag: ee,
			maxDecFrameBuffering: b + 1,
			spsMaxSubLayersMinus1: n,
			spsTemporalIdNestingFlag: r,
			generalProfileSpace: i,
			generalTierFlag: a,
			generalProfileIdc: o,
			generalProfileCompatibilityFlags: s,
			generalConstraintIndicatorFlags: c,
			generalLevelIdc: l,
			chromaFormatIdc: u,
			bitDepthLumaMinus8: _,
			bitDepthChromaMinus8: v,
			minSpatialSegmentationIdc: te
		};
	} catch (e) {
		return D._error("Error parsing HEVC SPS:", e), null;
	}
}, Sn = (e) => {
	try {
		let t = [], n = [], r = [], i = [];
		for (let a of nn(e)) {
			let o = e.subarray(a.offset, a.offset + a.length), s = bn(o[0]);
			s === j.VPS_NUT ? t.push(o) : s === j.SPS_NUT ? n.push(o) : s === j.PPS_NUT ? r.push(o) : (s === j.PREFIX_SEI_NUT || s === j.SUFFIX_SEI_NUT) && i.push(o);
		}
		if (n.length === 0 || r.length === 0) return null;
		let a = xn(n[0]);
		if (!a) return null;
		let o = 0;
		if (r.length > 0) {
			let e = r[0], t = new O(sn(e));
			t.skipBits(16), f(t), f(t), t.skipBits(1), t.skipBits(1), t.skipBits(3), t.skipBits(1), t.skipBits(1), f(t), f(t), p(t), t.skipBits(1), t.skipBits(1), t.readBits(1) && f(t), p(t), p(t), t.skipBits(1), t.skipBits(1), t.skipBits(1), t.skipBits(1);
			let n = t.readBits(1), i = t.readBits(1);
			o = !n && !i ? 0 : n && !i ? 2 : !n && i ? 3 : 0;
		}
		let s = [
			...t.length ? [{
				arrayCompleteness: 1,
				nalUnitType: j.VPS_NUT,
				nalUnits: t
			}] : [],
			...n.length ? [{
				arrayCompleteness: 1,
				nalUnitType: j.SPS_NUT,
				nalUnits: n
			}] : [],
			...r.length ? [{
				arrayCompleteness: 1,
				nalUnitType: j.PPS_NUT,
				nalUnits: r
			}] : [],
			...i.length ? [{
				arrayCompleteness: 1,
				nalUnitType: bn(i[0][0]),
				nalUnits: i
			}] : []
		];
		return {
			configurationVersion: 1,
			generalProfileSpace: a.generalProfileSpace,
			generalTierFlag: a.generalTierFlag,
			generalProfileIdc: a.generalProfileIdc,
			generalProfileCompatibilityFlags: a.generalProfileCompatibilityFlags,
			generalConstraintIndicatorFlags: a.generalConstraintIndicatorFlags,
			generalLevelIdc: a.generalLevelIdc,
			minSpatialSegmentationIdc: a.minSpatialSegmentationIdc,
			parallelismType: o,
			chromaFormatIdc: a.chromaFormatIdc,
			bitDepthLumaMinus8: a.bitDepthLumaMinus8,
			bitDepthChromaMinus8: a.bitDepthChromaMinus8,
			avgFrameRate: 0,
			constantFrameRate: 0,
			numTemporalLayers: a.spsMaxSubLayersMinus1 + 1,
			temporalIdNested: a.spsTemporalIdNestingFlag,
			lengthSizeMinusOne: 3,
			arrays: s
		};
	} catch (e) {
		return D._error("Error building HEVC Decoder Configuration Record:", e), null;
	}
}, Cn = (e, t) => {
	let n = e.readBits(2), r = e.readBits(1), i = e.readBits(5), a = 0;
	for (let t = 0; t < 32; t++) a = a << 1 | e.readBits(1);
	let o = new Uint8Array(6);
	for (let t = 0; t < 6; t++) o[t] = e.readBits(8);
	let s = e.readBits(8), c = [], l = [];
	for (let n = 0; n < t; n++) c.push(e.readBits(1)), l.push(e.readBits(1));
	if (t > 0) for (let n = t; n < 8; n++) e.skipBits(2);
	for (let n = 0; n < t; n++) c[n] && e.skipBits(88), l[n] && e.skipBits(8);
	return {
		general_profile_space: n,
		general_tier_flag: r,
		general_profile_idc: i,
		general_profile_compatibility_flags: a,
		general_constraint_indicator_flags: o,
		general_level_idc: s
	};
}, wn = (e) => {
	for (let t = 0; t < 4; t++) for (let n = 0; n < (t === 3 ? 2 : 6); n++) if (!e.readBits(1)) f(e);
	else {
		let n = Math.min(64, 1 << 4 + (t << 1));
		t > 1 && p(e);
		for (let t = 0; t < n; t++) p(e);
	}
}, Tn = (e, t) => {
	let n = [];
	for (let r = 0; r < t; r++) n[r] = En(e, r, t, n);
}, En = (e, t, n, r) => {
	let i = 0, a = 0, o = 0;
	if (t !== 0 && (a = e.readBits(1)), a) {
		o = t === n ? t - (f(e) + 1) : t - 1, e.readBits(1), f(e);
		let a = r[o] ?? 0;
		for (let t = 0; t <= a; t++) e.readBits(1) || e.readBits(1);
		i = r[o];
	} else {
		let t = f(e), n = f(e);
		for (let n = 0; n < t; n++) f(e), e.readBits(1);
		for (let t = 0; t < n; t++) f(e), e.readBits(1);
		i = t + n;
	}
	return i;
}, Dn = (e, t) => {
	let n = 2, r = 2, i = 2, a = 0, o = 0, s = {
		num: 1,
		den: 1
	};
	if (e.readBits(1)) {
		let t = e.readBits(8);
		if (t === 255) s = {
			num: e.readBits(16),
			den: e.readBits(16)
		};
		else {
			let e = hn[t];
			e && (s = e);
		}
	}
	return e.readBits(1) && e.readBits(1), e.readBits(1) && (e.readBits(3), a = e.readBits(1), e.readBits(1) && (n = e.readBits(8), r = e.readBits(8), i = e.readBits(8))), e.readBits(1) && (f(e), f(e)), e.readBits(1), e.readBits(1), e.readBits(1), e.readBits(1) && (f(e), f(e), f(e), f(e)), e.readBits(1) && (e.readBits(32), e.readBits(32), e.readBits(1) && f(e), e.readBits(1) && On(e, !0, t)), e.readBits(1) && (e.readBits(1), e.readBits(1), e.readBits(1), o = f(e), f(e), f(e), f(e), f(e)), {
		pixelAspectRatio: s,
		colourPrimaries: n,
		transferCharacteristics: r,
		matrixCoefficients: i,
		fullRangeFlag: a,
		minSpatialSegmentationIdc: o
	};
}, On = (e, t, n) => {
	let r = !1, i = !1, a = !1;
	t && (r = e.readBits(1) === 1, i = e.readBits(1) === 1, (r || i) && (a = e.readBits(1) === 1, a && (e.readBits(8), e.readBits(5), e.readBits(1), e.readBits(5)), e.readBits(4), e.readBits(4), a && e.readBits(4), e.readBits(5), e.readBits(5), e.readBits(5)));
	for (let t = 0; t <= n; t++) {
		let t = e.readBits(1) === 1, n = !0;
		t || (n = e.readBits(1) === 1);
		let o = !1;
		n ? f(e) : o = e.readBits(1) === 1;
		let s = 1;
		o || (s = f(e) + 1), r && kn(e, s, a), i && kn(e, s, a);
	}
}, kn = (e, t, n) => {
	for (let r = 0; r < t; r++) f(e), f(e), n && (f(e), f(e)), e.readBits(1);
}, An = (e) => {
	let t = [];
	t.push(e.configurationVersion), t.push((e.generalProfileSpace & 3) << 6 | (e.generalTierFlag & 1) << 5 | e.generalProfileIdc & 31), t.push(e.generalProfileCompatibilityFlags >>> 24 & 255), t.push(e.generalProfileCompatibilityFlags >>> 16 & 255), t.push(e.generalProfileCompatibilityFlags >>> 8 & 255), t.push(e.generalProfileCompatibilityFlags & 255), t.push(...e.generalConstraintIndicatorFlags), t.push(e.generalLevelIdc & 255), t.push(240 | e.minSpatialSegmentationIdc >> 8 & 15), t.push(e.minSpatialSegmentationIdc & 255), t.push(252 | e.parallelismType & 3), t.push(252 | e.chromaFormatIdc & 3), t.push(248 | e.bitDepthLumaMinus8 & 7), t.push(248 | e.bitDepthChromaMinus8 & 7), t.push(e.avgFrameRate >> 8 & 255), t.push(e.avgFrameRate & 255), t.push((e.constantFrameRate & 3) << 6 | (e.numTemporalLayers & 7) << 3 | (e.temporalIdNested & 1) << 2 | e.lengthSizeMinusOne & 3), t.push(e.arrays.length & 255);
	for (let n of e.arrays) {
		t.push((n.arrayCompleteness & 1) << 7 | 0 | n.nalUnitType & 63), t.push(n.nalUnits.length >> 8 & 255), t.push(n.nalUnits.length & 255);
		for (let e of n.nalUnits) {
			t.push(e.length >> 8 & 255), t.push(e.length & 255);
			for (let n = 0; n < e.length; n++) t.push(e[n]);
		}
	}
	return new Uint8Array(t);
}, M;
(function(e) {
	e[e.audAllowed = 0] = "audAllowed", e[e.beforeFirstVcl = 1] = "beforeFirstVcl", e[e.afterFirstVcl = 2] = "afterFirstVcl", e[e.eoBitstreamAllowed = 3] = "eoBitstreamAllowed", e[e.noMoreDataAllowed = 4] = "noMoreDataAllowed";
})(M ||= {});
var jn = (e, t) => {
	let n = /* @__PURE__ */ new Set(), r = M.audAllowed;
	for (let i of yn(e, t)) {
		if (r === M.noMoreDataAllowed) {
			n.add(i.offset);
			continue;
		}
		let t = bn(e[i.offset]);
		if (r === M.eoBitstreamAllowed && t !== 37) {
			n.add(i.offset);
			continue;
		}
		let a = !1;
		t === 35 ? r > M.audAllowed ? a = !0 : r = M.beforeFirstVcl : t <= 31 ? r > M.afterFirstVcl ? a = !0 : r = M.afterFirstVcl : t === 36 ? r === M.afterFirstVcl ? r = M.eoBitstreamAllowed : a = !0 : t === 37 ? r < M.afterFirstVcl ? a = !0 : r = M.noMoreDataAllowed : t === 32 || t === 33 || t === 34 || t === 39 || t >= 41 && t <= 44 || t >= 48 && t <= 55 ? r > M.beforeFirstVcl ? a = !0 : r = M.beforeFirstVcl : (t === 38 || t === 40 || t >= 45 && t <= 47 || t >= 56 && t <= 63) && r < M.afterFirstVcl && (a = !0), a && n.add(i.offset);
	}
	if (n.size === 0) return null;
	let i = [];
	for (let r of yn(e, t)) n.has(r.offset) || i.push(e.subarray(r.offset, r.offset + r.length));
	return vn(i, t);
}, Mn = (e) => {
	let t = new O(e);
	if (t.readBits(2) !== 2) return null;
	let n = t.readBits(1), r = (t.readBits(1) << 1) + n;
	if (r === 3 && t.skipBits(1), t.readBits(1) === 1 || t.readBits(1) !== 0 || (t.skipBits(2), t.readBits(24) !== 4817730)) return null;
	let i = 8;
	r >= 2 && (i = t.readBits(1) ? 12 : 10);
	let a = t.readBits(3), o = 0, s = 0;
	if (a !== 7) if (s = t.readBits(1), r === 1 || r === 3) {
		let e = t.readBits(1), n = t.readBits(1);
		o = !e && !n ? 3 : e && !n ? 2 : 1, t.skipBits(1);
	} else o = 1;
	else o = 3, s = 1;
	let c = t.readBits(16), l = t.readBits(16), d = (c + 1) * (l + 1), f = u(yt).level;
	for (let e of yt) if (d <= e.maxPictureSize) {
		f = e.level;
		break;
	}
	return {
		profile: r,
		level: f,
		bitDepth: i,
		chromaSubsampling: o,
		videoFullRangeFlag: s,
		colourPrimaries: a === 2 ? 1 : a === 1 ? 6 : 2,
		transferCharacteristics: a === 2 ? 1 : a === 1 ? 6 : 2,
		matrixCoefficients: a === 7 ? 0 : a === 2 ? 1 : a === 1 ? 6 : 2
	};
}, Nn = function* (e) {
	let t = new O(e), n = () => {
		let e = 0;
		for (let n = 0; n < 8; n++) {
			let r = t.readAlignedByte();
			if (e |= (r & 127) << n * 7, !(r & 128)) break;
			if (n === 7 && r & 128) return null;
		}
		return e >= 2 ** 32 - 1 ? null : e;
	};
	for (; t.getBitsLeft() >= 8;) {
		t.skipBits(1);
		let r = t.readBits(4), i = t.readBits(1), a = t.readBits(1);
		t.skipBits(1), i && t.skipBits(8);
		let o;
		if (a) {
			let e = n();
			if (e === null) return;
			o = e;
		} else o = Math.floor(t.getBitsLeft() / 8);
		c(t.pos % 8 == 0), yield {
			type: r,
			data: e.subarray(t.pos / 8, t.pos / 8 + o)
		}, t.skipBits(o * 8);
	}
}, Pn = (e) => {
	for (let { type: t, data: n } of Nn(e)) {
		if (t !== 1) continue;
		let e = new O(n), r = e.readBits(3);
		e.readBits(1);
		let i = e.readBits(1), a = 0, o = 0, s = 0;
		if (i) a = e.readBits(5);
		else {
			if (e.readBits(1) && (e.skipBits(32), e.skipBits(32), e.readBits(1))) return null;
			let t = e.readBits(1);
			t && (s = e.readBits(5), e.skipBits(32), e.skipBits(5), e.skipBits(5));
			let n = e.readBits(5);
			for (let r = 0; r <= n; r++) {
				e.skipBits(12);
				let n = e.readBits(5);
				if (r === 0 && (a = n), n > 7) {
					let t = e.readBits(1);
					r === 0 && (o = t);
				}
				if (t && e.readBits(1)) {
					let t = s + 1;
					e.skipBits(t), e.skipBits(t), e.skipBits(1);
				}
				e.readBits(1) && e.skipBits(4);
			}
		}
		let c = e.readBits(4), l = e.readBits(4), u = c + 1;
		e.skipBits(u);
		let d = l + 1;
		e.skipBits(d);
		let f = 0;
		if (f = i ? 0 : e.readBits(1), f && (e.skipBits(4), e.skipBits(3)), e.skipBits(1), e.skipBits(1), e.skipBits(1), !i) {
			e.skipBits(1), e.skipBits(1), e.skipBits(1), e.skipBits(1);
			let t = e.readBits(1);
			t && (e.skipBits(1), e.skipBits(1));
			let n = e.readBits(1), r = 0;
			r = n ? 2 : e.readBits(1), r > 0 && (e.readBits(1) || e.skipBits(1)), t && e.skipBits(3);
		}
		e.skipBits(1), e.skipBits(1), e.skipBits(1);
		let p = e.readBits(1), m = 8;
		r === 2 && p ? m = e.readBits(1) ? 12 : 10 : r <= 2 && (m = p ? 10 : 8);
		let h = 0;
		r !== 1 && (h = e.readBits(1));
		let g = 1, _ = 1, v = 0;
		return h || (r === 0 ? (g = 1, _ = 1) : r === 1 ? (g = 0, _ = 0) : m === 12 && (g = e.readBits(1), g && (_ = e.readBits(1))), g && _ && (v = e.readBits(2))), {
			profile: r,
			level: a,
			tier: o,
			bitDepth: m,
			monochrome: h,
			chromaSubsamplingX: g,
			chromaSubsamplingY: _,
			chromaSamplePosition: v
		};
	}
	return null;
}, Fn = (e) => {
	let t = h(e), n = t.getUint8(9), r = t.getUint16(10, !0), i = t.getUint32(12, !0), a = t.getInt16(16, !0), o = t.getUint8(18), s = null;
	return o && (s = e.subarray(19, 21 + n)), {
		outputChannelCount: n,
		preSkip: r,
		inputSampleRate: i,
		outputGain: a,
		channelMappingFamily: o,
		channelMappingTable: s
	};
}, In = [
	480,
	960,
	1920,
	2880,
	480,
	960,
	1920,
	2880,
	480,
	960,
	1920,
	2880,
	480,
	960,
	480,
	960,
	120,
	240,
	480,
	960,
	120,
	240,
	480,
	960,
	120,
	240,
	480,
	960,
	120,
	240,
	480,
	960
], Ln = (e) => {
	let t = e[0] >> 3, n = e[0] & 3, r;
	return r = n === 0 ? 1 : n === 1 || n === 2 ? 2 : e[1] & 63, { durationInSamples: In[t] * r };
}, Rn = (e) => {
	if (e.length < 7) throw Error("Setup header is too short.");
	if (e[0] !== 5) throw Error("Wrong packet type in Setup header.");
	if (String.fromCharCode(...e.slice(1, 7)) !== "vorbis") throw Error("Invalid packet signature in Setup header.");
	let t = e.length, n = new Uint8Array(t);
	for (let r = 0; r < t; r++) n[r] = e[t - 1 - r];
	let r = new O(n), i = 0;
	for (; r.getBitsLeft() > 97;) if (r.readBits(1) === 1) {
		i = r.pos;
		break;
	}
	if (i === 0) throw Error("Invalid Setup header: framing bit not found.");
	let a = 0, o = !1, s = 0;
	for (; r.getBitsLeft() >= 97;) {
		let e = r.pos, t = r.readBits(8), n = r.readBits(16), i = r.readBits(16);
		if (t > 63 || n !== 0 || i !== 0) {
			r.pos = e;
			break;
		}
		if (r.skipBits(1), a++, a > 64) break;
		r.clone().readBits(6) + 1 === a && (o = !0, s = a);
	}
	if (!o) throw Error("Invalid Setup header: mode header not found.");
	if (s > 63) throw Error(`Unsupported mode count: ${s}.`);
	let c = s;
	r.pos = 0, r.skipBits(i);
	let l = Array(c).fill(0);
	for (let e = c - 1; e >= 0; e--) r.skipBits(40), l[e] = r.readBits(1);
	return { modeBlockflags: l };
}, zn = (e, t, n) => {
	switch (e) {
		case "avc":
			for (let e of an(n, t)) {
				let t = n[e.offset], r = on(t);
				if (r >= A.NON_IDR_SLICE && r <= A.SLICE_DPC) return "delta";
				if (r === A.IDR) return "key";
				if (r === A.SEI && (!Re() || Be() >= 144)) {
					let t = sn(n.subarray(e.offset, e.offset + e.length)), r = 1;
					do {
						let e = 0;
						for (;;) {
							let n = t[r++];
							if (n === void 0 || (e += n, n < 255)) break;
						}
						let n = 0;
						for (;;) {
							let e = t[r++];
							if (e === void 0 || (n += e, e < 255)) break;
						}
						if (e === 6) {
							let e = new O(t);
							e.pos = 8 * r;
							let n = f(e), i = e.readBits(1);
							if (n === 0 && i === 1) return "key";
						}
						r += n;
					} while (r < t.length - 1);
				}
			}
			return "delta";
		case "hevc":
			for (let e of yn(n, t)) {
				let t = bn(n[e.offset]);
				if (t < j.BLA_W_LP) return "delta";
				if (t <= j.RSV_IRAP_VCL23) return "key";
			}
			return "delta";
		case "vp8": return n[0] & 1 ? "delta" : "key";
		case "vp9": {
			let e = new O(n);
			if (e.readBits(2) !== 2) return null;
			let t = e.readBits(1);
			return (e.readBits(1) << 1) + t === 3 && e.skipBits(1), e.readBits(1) ? null : e.readBits(1) === 0 ? "key" : "delta";
		}
		case "av1": {
			let e = !1;
			for (let { type: t, data: r } of Nn(n)) if (t === 1) {
				let t = new O(r);
				t.skipBits(4), e = !!t.readBits(1);
			} else if (t === 3 || t === 6 || t === 7) {
				if (e) return "key";
				let t = new O(r);
				return t.readBits(1) ? null : t.readBits(2) === 0 ? "key" : "delta";
			}
			return null;
		}
		case "prores": return "key";
		default: he(e), c(!1);
	}
}, Bn;
(function(e) {
	e[e.STREAMINFO = 0] = "STREAMINFO", e[e.VORBIS_COMMENT = 4] = "VORBIS_COMMENT", e[e.PICTURE = 6] = "PICTURE";
})(Bn ||= {});
var Vn = (e, t) => {
	let n = h(e), r = 0, i = n.getUint32(r, !0);
	r += 4;
	let a = g.decode(e.subarray(r, r + i));
	r += i, i > 0 && (t.raw ??= {}, t.raw.vendor ??= a);
	let o = n.getUint32(r, !0);
	r += 4;
	for (let i = 0; i < o; i++) {
		let i = n.getUint32(r, !0);
		r += 4;
		let a = g.decode(e.subarray(r, r + i));
		r += i;
		let o = a.indexOf("=");
		if (o === -1) continue;
		let s = a.slice(0, o).toUpperCase(), c = a.slice(o + 1);
		switch (t.raw ??= {}, t.raw[s] ??= c, s) {
			case "TITLE":
				t.title ??= c;
				break;
			case "DESCRIPTION":
				t.description ??= c;
				break;
			case "ARTIST":
				t.artist ??= c;
				break;
			case "ALBUM":
				t.album ??= c;
				break;
			case "ALBUMARTIST":
				t.albumArtist ??= c;
				break;
			case "COMMENT":
				t.comment ??= c;
				break;
			case "LYRICS":
				t.lyrics ??= c;
				break;
			case "TRACKNUMBER":
				{
					let e = c.split("/"), n = Number.parseInt(e[0], 10), r = e[1] && Number.parseInt(e[1], 10);
					Number.isInteger(n) && n > 0 && (t.trackNumber ??= n), r && Number.isInteger(r) && r > 0 && (t.tracksTotal ??= r);
				}
				break;
			case "TRACKTOTAL":
				{
					let e = Number.parseInt(c, 10);
					Number.isInteger(e) && e > 0 && (t.tracksTotal ??= e);
				}
				break;
			case "DISCNUMBER":
				{
					let e = c.split("/"), n = Number.parseInt(e[0], 10), r = e[1] && Number.parseInt(e[1], 10);
					Number.isInteger(n) && n > 0 && (t.discNumber ??= n), r && Number.isInteger(r) && r > 0 && (t.discsTotal ??= r);
				}
				break;
			case "DISCTOTAL":
				{
					let e = Number.parseInt(c, 10);
					Number.isInteger(e) && e > 0 && (t.discsTotal ??= e);
				}
				break;
			case "DATE":
				{
					let e = new Date(c);
					Number.isNaN(e.getTime()) || (t.date ??= e);
				}
				break;
			case "GENRE":
				t.genre ??= c;
				break;
			case "METADATA_BLOCK_PICTURE":
				{
					let e = We(c), n = h(e), r = n.getUint32(0, !1), i = n.getUint32(4, !1), a = String.fromCharCode(...e.subarray(8, 8 + i)), o = n.getUint32(8 + i, !1), s = g.decode(e.subarray(12 + i, 12 + i + o)), l = n.getUint32(i + o + 28), u = e.subarray(i + o + 32, i + o + 32 + l);
					t.images ??= [], t.images.push({
						data: u,
						mimeType: a,
						kind: r === 3 ? "coverFront" : r === 4 ? "coverBack" : "unknown",
						name: void 0,
						description: s || void 0
					});
				}
				break;
		}
	}
}, Hn = [
	2,
	1,
	2,
	3,
	3,
	4,
	4,
	5
], Un = (e) => {
	if (e.length < 7 || e[0] !== 11 || e[1] !== 119) return null;
	let t = new O(e);
	t.skipBits(16), t.skipBits(16);
	let n = t.readBits(2);
	if (n === 3) return null;
	let r = t.readBits(6), i = t.readBits(5);
	if (i > 8) return null;
	let a = t.readBits(3), o = t.readBits(3);
	return o & 1 && o !== 1 && t.skipBits(2), o & 4 && t.skipBits(2), o === 2 && t.skipBits(2), {
		fscod: n,
		bsid: i,
		bsmod: a,
		acmod: o,
		lfeon: t.readBits(1),
		bitRateCode: Math.floor(r / 2)
	};
}, Wn = [
	128,
	138,
	192,
	128,
	140,
	192,
	160,
	174,
	240,
	160,
	176,
	240,
	192,
	208,
	288,
	192,
	210,
	288,
	224,
	242,
	336,
	224,
	244,
	336,
	256,
	278,
	384,
	256,
	280,
	384,
	320,
	348,
	480,
	320,
	350,
	480,
	384,
	416,
	288 * 2,
	384,
	418,
	288 * 2,
	448,
	486,
	336 * 2,
	448,
	488,
	336 * 2,
	256 * 2,
	278 * 2,
	384 * 2,
	256 * 2,
	279 * 2,
	384 * 2,
	320 * 2,
	348 * 2,
	480 * 2,
	320 * 2,
	349 * 2,
	480 * 2,
	384 * 2,
	417 * 2,
	576 * 2,
	384 * 2,
	418 * 2,
	576 * 2,
	448 * 2,
	487 * 2,
	672 * 2,
	448 * 2,
	488 * 2,
	672 * 2,
	512 * 2,
	557 * 2,
	768 * 2,
	512 * 2,
	558 * 2,
	768 * 2,
	640 * 2,
	696 * 2,
	960 * 2,
	640 * 2,
	697 * 2,
	960 * 2,
	768 * 2,
	835 * 2,
	1152 * 2,
	768 * 2,
	836 * 2,
	1152 * 2,
	896 * 2,
	975 * 2,
	1344 * 2,
	896 * 2,
	976 * 2,
	1344 * 2,
	1024 * 2,
	1114 * 2,
	1536 * 2,
	1024 * 2,
	1115 * 2,
	1536 * 2,
	1152 * 2,
	1253 * 2,
	1728 * 2,
	1152 * 2,
	1254 * 2,
	1728 * 2,
	1280 * 2,
	1393 * 2,
	1920 * 2,
	1280 * 2,
	1394 * 2,
	1920 * 2
], Gn = 1536;
new Uint8Array([
	5,
	4,
	65,
	67,
	45,
	51
]), new Uint8Array([
	5,
	4,
	69,
	65,
	67,
	51
]);
var Kn = [
	1,
	2,
	3,
	6
], qn = (e) => {
	if (e.length < 6 || e[0] !== 11 || e[1] !== 119) return null;
	let t = new O(e);
	t.skipBits(16);
	let n = t.readBits(2);
	if (t.skipBits(3), n !== 0 && n !== 2) return null;
	let r = t.readBits(11), i = t.readBits(2), a = 0, o;
	i === 3 ? (a = t.readBits(2), o = 3) : o = t.readBits(2);
	let s = t.readBits(3), c = t.readBits(1), l = t.readBits(5);
	if (l < 11 || l > 16) return null;
	let u = Kn[o], d;
	return d = i < 3 ? en[i] / 1e3 : tn[a] / 1e3, {
		dataRate: Math.round((r + 1) * d / (u * 16)),
		substreams: [{
			fscod: i,
			fscod2: a,
			bsid: l,
			bsmod: 0,
			acmod: s,
			lfeon: c,
			numDepSub: 0,
			chanLoc: 0
		}]
	};
}, Jn = (e) => {
	if (e.length < 2) return null;
	let t = new O(e), n = t.readBits(13), r = t.readBits(3), i = [];
	for (let n = 0; n <= r && !(Math.ceil(t.pos / 8) + 3 > e.length); n++) {
		let e = t.readBits(2), n = t.readBits(5);
		t.skipBits(1), t.skipBits(1);
		let r = t.readBits(3), a = t.readBits(3), o = t.readBits(1);
		t.skipBits(3);
		let s = t.readBits(4), c = 0;
		s > 0 ? c = t.readBits(9) : t.skipBits(1), i.push({
			fscod: e,
			fscod2: null,
			bsid: n,
			bsmod: r,
			acmod: a,
			lfeon: o,
			numDepSub: s,
			chanLoc: c
		});
	}
	return i.length === 0 ? null : {
		dataRate: n,
		substreams: i
	};
}, Yn = (e) => {
	let t = e.substreams[0];
	return c(t), t.fscod < 3 ? en[t.fscod] : t.fscod2 !== null && t.fscod2 < 3 ? tn[t.fscod2] : null;
}, Xn = (e) => {
	let t = e.substreams[0];
	c(t);
	let n = Hn[t.acmod] + t.lfeon;
	if (t.numDepSub > 0) {
		let e = [
			2,
			2,
			1,
			1,
			2,
			2,
			2,
			1,
			1
		];
		for (let r = 0; r < 9; r++) t.chanLoc & 1 << 8 - r && (n += e[r]);
	}
	return n;
}, Zn = class {
	constructor(e) {
		this.input = e;
	}
	dispose() {}
}, Qn = /* @__PURE__ */ new Uint8Array(), N = class e {
	constructor(e, t, n, r, i = -1, a, o) {
		if (this.data = e, this.type = t, this.timestamp = n, this.duration = r, this.sequenceNumber = i, e === Qn && a === void 0) throw Error("Internal error: byteLength must be explicitly provided when constructing metadata-only packets.");
		if (a === void 0 && (a = e.byteLength), !(e instanceof Uint8Array)) throw TypeError("data must be a Uint8Array.");
		if (t !== "key" && t !== "delta") throw TypeError("type must be either \"key\" or \"delta\".");
		if (!Number.isFinite(n)) throw TypeError("timestamp must be a number.");
		if (!Number.isFinite(r) || r < 0) throw TypeError("duration must be a non-negative number.");
		if (!Number.isFinite(i)) throw TypeError("sequenceNumber must be a number.");
		if (!Number.isInteger(a) || a < 0) throw TypeError("byteLength must be a non-negative integer.");
		if (o !== void 0 && (typeof o != "object" || !o)) throw TypeError("sideData, when provided, must be an object.");
		if (o?.alpha !== void 0 && !(o.alpha instanceof Uint8Array)) throw TypeError("sideData.alpha, when provided, must be a Uint8Array.");
		if (o?.alphaByteLength !== void 0 && (!Number.isInteger(o.alphaByteLength) || o.alphaByteLength < 0)) throw TypeError("sideData.alphaByteLength, when provided, must be a non-negative integer.");
		this.byteLength = a, this.sideData = o ?? {}, this.sideData.alpha && this.sideData.alphaByteLength === void 0 && (this.sideData.alphaByteLength = this.sideData.alpha.byteLength);
	}
	get isMetadataOnly() {
		return this.data === Qn;
	}
	get microsecondTimestamp() {
		return Math.trunc(Ae * this.timestamp);
	}
	get microsecondDuration() {
		return Math.trunc(Ae * this.duration);
	}
	toEncodedVideoChunk() {
		if (this.isMetadataOnly) throw TypeError("Metadata-only packets cannot be converted to a video chunk.");
		if (typeof EncodedVideoChunk > "u") throw Error("Your browser does not support EncodedVideoChunk.");
		return new EncodedVideoChunk({
			data: this.data,
			type: this.type,
			timestamp: this.microsecondTimestamp,
			duration: this.microsecondDuration
		});
	}
	alphaToEncodedVideoChunk(e = this.type) {
		if (!this.sideData.alpha) throw TypeError("This packet does not contain alpha side data.");
		if (this.isMetadataOnly) throw TypeError("Metadata-only packets cannot be converted to a video chunk.");
		if (typeof EncodedVideoChunk > "u") throw Error("Your browser does not support EncodedVideoChunk.");
		return new EncodedVideoChunk({
			data: this.sideData.alpha,
			type: e,
			timestamp: this.microsecondTimestamp,
			duration: this.microsecondDuration
		});
	}
	toEncodedAudioChunk() {
		if (this.isMetadataOnly) throw TypeError("Metadata-only packets cannot be converted to an audio chunk.");
		if (typeof EncodedAudioChunk > "u") throw Error("Your browser does not support EncodedAudioChunk.");
		return new EncodedAudioChunk({
			data: this.data,
			type: this.type,
			timestamp: this.microsecondTimestamp,
			duration: this.microsecondDuration
		});
	}
	static fromEncodedChunk(t, n) {
		if (!(t instanceof EncodedVideoChunk || t instanceof EncodedAudioChunk)) throw TypeError("chunk must be an EncodedVideoChunk or EncodedAudioChunk.");
		let r = new Uint8Array(t.byteLength);
		return t.copyTo(r), new e(r, t.type, t.timestamp / 1e6, (t.duration ?? 0) / 1e6, void 0, void 0, n);
	}
	clone(t) {
		if (t !== void 0 && (typeof t != "object" || !t)) throw TypeError("options, when provided, must be an object.");
		if (t?.data !== void 0 && !(t.data instanceof Uint8Array)) throw TypeError("options.data, when provided, must be a Uint8Array.");
		if (t?.type !== void 0 && t.type !== "key" && t.type !== "delta") throw TypeError("options.type, when provided, must be either \"key\" or \"delta\".");
		if (t?.timestamp !== void 0 && !Number.isFinite(t.timestamp)) throw TypeError("options.timestamp, when provided, must be a number.");
		if (t?.duration !== void 0 && !Number.isFinite(t.duration)) throw TypeError("options.duration, when provided, must be a number.");
		if (t?.sequenceNumber !== void 0 && !Number.isFinite(t.sequenceNumber)) throw TypeError("options.sequenceNumber, when provided, must be a number.");
		if (t?.sideData !== void 0 && (typeof t.sideData != "object" || t.sideData === null)) throw TypeError("options.sideData, when provided, must be an object.");
		return new e(t?.data ?? this.data, t?.type ?? this.type, t?.timestamp ?? this.timestamp, t?.duration ?? this.duration, t?.sequenceNumber ?? this.sequenceNumber, this.byteLength, t?.sideData ?? this.sideData);
	}
}, $n = (e) => {
	let t = (e.hasVideo ? "video/" : e.hasAudio ? "audio/" : "application/") + (e.isQuickTime ? "quicktime" : "mp4");
	if (e.codecStrings.length > 0) {
		let n = [...new Set(e.codecStrings)];
		t += `; codecs="${n.join(", ")}"`;
	}
	return t;
}, er = (e) => {
	let t = h(e), n = 0, r = t.getUint8(n);
	n += 1, n += 3;
	let i = ae(e.subarray(n, n + 16));
	n += 16;
	let a = null;
	if (r > 0) {
		let r = t.getUint32(n);
		if (n += 4, r > 0) {
			a = [];
			for (let t = 0; t < r; t++) a.push(ae(e.subarray(n, n + 16))), n += 16;
		}
	}
	let o = t.getUint32(n);
	return n += 4, {
		systemId: i,
		keyIds: a,
		data: e.slice(n, n + o)
	};
}, tr = (e, t) => e.systemId === t.systemId && Ge(e.data, t.data), nr = (e) => {
	let t = W(e), n = G(e, 4), r = 8;
	t === 1 && (t = Us(e), r = 16);
	let i = t - r;
	return i < 0 ? null : {
		name: n,
		totalSize: t,
		headerSize: r,
		contentSize: i
	};
}, rr = (e) => Bs(e) / 65536, ir = (e) => Bs(e) / 1073741824, ar = (e) => {
	let t = 0;
	for (let n = 0; n < 4; n++) {
		t <<= 7;
		let n = H(e);
		if (t |= n & 127, !(n & 128)) break;
	}
	return t;
}, or = (e) => {
	let t = U(e);
	return e.skip(2), t = Math.min(t, e.remainingLength), g.decode(V(e, t));
}, sr = (e) => {
	let t = nr(e);
	if (!t || t.name !== "data" || e.remainingLength < 8) return null;
	let n = W(e);
	e.skip(4);
	let r = V(e, t.contentSize - 8);
	switch (n) {
		case 1: return g.decode(r);
		case 2: return new TextDecoder("utf-16be").decode(r);
		case 13: return new it(r, "image/jpeg");
		case 14: return new it(r, "image/png");
		case 27: return new it(r, "image/bmp");
		default: return r;
	}
}, cr = new Uint32Array(256), lr = new Uint32Array(256), ur = new Uint32Array(256), dr = new Uint32Array(256), fr = new Uint32Array(256), P = new Uint32Array(256), pr = new Uint32Array(10), mr = !1, hr = () => {
	let e = new Uint8Array(256), t = new Uint8Array(256), n = new Uint8Array(256);
	for (let e = 0, r = 1; e < 256; e++) n[e] = r, t[r] = e, r = r ^ r << 1 ^ (r & 128 ? 283 : 0);
	let r = (e, r) => e && r ? n[(t[e] + t[r]) % 255] : 0;
	e[0] = 99;
	for (let r = 1; r < 256; r++) {
		let i = n[255 - t[r]], a = i ^ i << 1 ^ i << 2 ^ i << 3 ^ i << 4;
		a = a >>> 8 ^ a & 255 ^ 99, e[r] = a;
	}
	for (let t = 0; t < 256; t++) {
		let n = e[t], i = e.indexOf(t);
		cr[t] = n << 24 | n << 16 | n << 8 | n, P[t] = i << 24 | i << 16 | i << 8 | i;
		let a = r(i, 14), o = r(i, 9), s = r(i, 13), c = r(i, 11), l = a << 24 | o << 16 | s << 8 | c;
		lr[t] = l, ur[t] = l >>> 8 | l << 24, dr[t] = l >>> 16 | l << 16, fr[t] = l >>> 24 | l << 8;
	}
	let i = 1;
	for (let e = 0; e < 10; e++) pr[e] = i << 24, i = i << 1 ^ (i & 128 ? 283 : 0);
	mr = !0;
}, gr = class {
	constructor() {
		this.roundkey = new Uint32Array(44), this.iv = new Uint32Array(16 / Uint32Array.BYTES_PER_ELEMENT), this.in = new Uint8Array(16), this.out = new Uint8Array(16), this.inView = new DataView(this.in.buffer), this.outView = new DataView(this.out.buffer);
	}
	init({ key: e, iv: t }) {
		c(e.byteLength === 16), c(t.byteLength === 16), mr || hr();
		let n = new DataView(e.buffer, e.byteOffset, e.byteLength), r = new DataView(t.buffer, t.byteOffset, t.byteLength);
		this.roundkey[0] = n.getUint32(0, !1), this.roundkey[1] = n.getUint32(4, !1), this.roundkey[2] = n.getUint32(8, !1), this.roundkey[3] = n.getUint32(12, !1), this.iv[0] = r.getUint32(0, !1), this.iv[1] = r.getUint32(4, !1), this.iv[2] = r.getUint32(8, !1), this.iv[3] = r.getUint32(12, !1);
		for (let e = 4; e < 44; e += 4) {
			let t = this.roundkey[e - 1];
			this.roundkey[e] = this.roundkey[e - 4] ^ cr[t >>> 16 & 255] & 4278190080 ^ cr[t >>> 8 & 255] & 16711680 ^ cr[t >>> 0 & 255] & 65280 ^ cr[t >>> 24 & 255] & 255 ^ pr[e / 4 - 1], this.roundkey[e + 1] = this.roundkey[e - 3] ^ this.roundkey[e], this.roundkey[e + 2] = this.roundkey[e - 2] ^ this.roundkey[e + 1], this.roundkey[e + 3] = this.roundkey[e - 1] ^ this.roundkey[e + 2];
		}
		for (let e = 0, t = 40; e < t; e += 4, t -= 4) for (let n = 0; n < 4; n++) {
			let r = this.roundkey[e + n];
			this.roundkey[e + n] = this.roundkey[t + n], this.roundkey[t + n] = r;
		}
		for (let e = 4; e < 40; e += 4) for (let t = 0; t < 4; t++) {
			let n = this.roundkey[e + t];
			this.roundkey[e + t] = lr[cr[n >>> 24 & 255] & 255] ^ ur[cr[n >>> 16 & 255] & 255] ^ dr[cr[n >>> 8 & 255] & 255] ^ fr[cr[n >>> 0 & 255] & 255];
		}
	}
	decrypt() {
		let e = this.inView.getUint32(0, !1) ^ this.roundkey[0], t = this.inView.getUint32(4, !1) ^ this.roundkey[1], n = this.inView.getUint32(8, !1) ^ this.roundkey[2], r = this.inView.getUint32(12, !1) ^ this.roundkey[3], i = this.inView.getUint32(0, !1), a = this.inView.getUint32(4, !1), o = this.inView.getUint32(8, !1), s = this.inView.getUint32(12, !1), c, l, u, d;
		for (let i = 1; i < 10; i++) {
			let a = i * 4;
			c = lr[e >>> 24] ^ ur[r >>> 16 & 255] ^ dr[n >>> 8 & 255] ^ fr[t & 255] ^ this.roundkey[a], l = lr[t >>> 24] ^ ur[e >>> 16 & 255] ^ dr[r >>> 8 & 255] ^ fr[n & 255] ^ this.roundkey[a + 1], u = lr[n >>> 24] ^ ur[t >>> 16 & 255] ^ dr[e >>> 8 & 255] ^ fr[r & 255] ^ this.roundkey[a + 2], d = lr[r >>> 24] ^ ur[n >>> 16 & 255] ^ dr[t >>> 8 & 255] ^ fr[e & 255] ^ this.roundkey[a + 3], e = c, t = l, n = u, r = d;
		}
		let f = P[e >>> 24 & 255] & 4278190080 ^ P[r >>> 16 & 255] & 16711680 ^ P[n >>> 8 & 255] & 65280 ^ P[t >>> 0 & 255] & 255 ^ this.roundkey[40], p = P[t >>> 24 & 255] & 4278190080 ^ P[e >>> 16 & 255] & 16711680 ^ P[r >>> 8 & 255] & 65280 ^ P[n >>> 0 & 255] & 255 ^ this.roundkey[41], m = P[n >>> 24 & 255] & 4278190080 ^ P[t >>> 16 & 255] & 16711680 ^ P[e >>> 8 & 255] & 65280 ^ P[r >>> 0 & 255] & 255 ^ this.roundkey[42], h = P[r >>> 24 & 255] & 4278190080 ^ P[n >>> 16 & 255] & 16711680 ^ P[t >>> 8 & 255] & 65280 ^ P[e >>> 0 & 255] & 255 ^ this.roundkey[43];
		this.outView.setUint32(0, f ^ this.iv[0], !1), this.outView.setUint32(4, p ^ this.iv[1], !1), this.outView.setUint32(8, m ^ this.iv[2], !1), this.outView.setUint32(12, h ^ this.iv[3], !1), this.iv[0] = i, this.iv[1] = a, this.iv[2] = o, this.iv[3] = s;
	}
}, _r = (e, t, n) => {
	let r = !1, i = 0, a = 2 ** 16, o = new gr();
	return new ReadableStream({
		pull: async (s) => {
			r ||= (o.init(await t()), !0);
			let c = a + 16, l = e.requestSliceRange(i, 0, c);
			if (l instanceof Promise && (l = await l), !l || l.length === 0) throw Error("Invalid ciphertext.");
			let u = l.length;
			if (u % 16 != 0) throw Error("Invalid ciphertext.");
			let d = u === c ? u - 16 : u, f = V(l, d), p = new Uint8Array(d);
			for (let e = 0; e < d; e += 16) o.in.set(f.subarray(e, e + 16)), o.decrypt(), p.set(o.out, e);
			if (d < u) s.enqueue(p), i += d;
			else {
				let e = p[d - 1];
				if (e === 0 || e > 16) throw Error("Invalid PKCS#7 padding. Incorrect key or corrupted data.");
				let t = p.subarray(0, d - e);
				s.enqueue(t), s.close(), n();
			}
		},
		cancel: () => {
			n();
		}
	});
}, vr = class e extends Zn {
	constructor(e) {
		super(e), this.moovSlice = null, this.currentTrack = null, this.tracks = [], this.metadataPromise = null, this.movieTimescale = -1, this.movieDurationInTimescale = -1, this.isQuickTime = !1, this.metadataTags = {}, this.currentMetadataKeys = null, this.isFragmented = !1, this.fragmentTrackDefaults = [], this.psshBoxes = [], this.currentFragment = null, this.lastReadFragment = null, this.decryptionKeyCache = /* @__PURE__ */ new Map(), this.reader = e._reader;
	}
	async getTrackBackings() {
		return await this.readMetadata(), this.tracks.map((e) => e.trackBacking);
	}
	async getMimeType() {
		await this.readMetadata();
		let e = await this.getTrackBackings(), t = await Promise.all(e.map((e) => e.getDecoderConfig().then((e) => e?.codec ?? null)));
		return $n({
			isQuickTime: this.isQuickTime,
			hasVideo: this.tracks.some((e) => e.info?.type === "video"),
			hasAudio: this.tracks.some((e) => e.info?.type === "audio"),
			codecStrings: t.filter(Boolean)
		});
	}
	async getMetadataTags() {
		return await this.readMetadata(), this.metadataTags;
	}
	readMetadata() {
		return this.metadataPromise ??= (async () => {
			let t = 0, n = !1;
			for (;;) {
				let r = this.reader.requestSliceRange(t, 8, 16);
				if (r instanceof Promise && (r = await r), !r) break;
				let i = t, a = nr(r);
				if (!a) break;
				if (a.name === "ftyp" || a.name === "styp") {
					let e = G(r, 4);
					this.isQuickTime = e === "qt  ";
				} else if (a.name === "moov") {
					let e = this.reader.requestSlice(r.filePos, a.contentSize);
					if (e instanceof Promise && (e = await e), !e) break;
					this.moovSlice = e, this.readContiguousBoxes(this.moovSlice);
					for (let e of this.tracks) {
						let t = e.editListPreviousSegmentDurations / this.movieTimescale;
						e.editListOffset -= Math.round(t * e.timescale);
					}
					n = this.isFragmented && this.reader.fileSize !== null && this.reader.fileSize > i + a.totalSize;
					break;
				} else if (a.name === "moof") {
					if (!this.input._initInput) throw Error("\"moof\" box encountered with no \"moov\" box present; this file is likely a Segment as described in ISO/IEC 14496-12 Section 8.16. A separate init file that contains a \"moov\" box is required to read this file, please provide it using InputOptions.initInput.");
					let t = await this.input._initInput._getDemuxer();
					if (t.constructor !== e) throw Error("Init input must match the input's format.");
					await t.readMetadata(), this.movieTimescale = t.movieTimescale, this.movieDurationInTimescale = t.movieDurationInTimescale, this.metadataTags = t.metadataTags, this.isFragmented = !0, this.fragmentTrackDefaults = t.fragmentTrackDefaults, this.psshBoxes = t.psshBoxes;
					for (let e of t.tracks) {
						let t = {
							id: e.id,
							demuxer: this,
							trackBacking: null,
							disposition: e.disposition,
							timescale: e.timescale,
							durationInMediaTimescale: e.durationInMediaTimescale,
							durationInMovieTimescale: e.durationInMovieTimescale,
							rotation: e.rotation,
							internalCodecId: e.internalCodecId,
							name: e.name,
							languageCode: e.languageCode,
							sampleTableByteOffset: null,
							sampleTable: null,
							fragmentLookupTable: [],
							currentFragmentState: null,
							fragmentPositionCache: [],
							editListPreviousSegmentDurations: e.editListPreviousSegmentDurations,
							editListOffset: e.editListOffset,
							encryptionInfo: e.encryptionInfo,
							encryptionAuxInfo: null,
							frmaCodecString: null,
							info: e.info
						};
						e.trackBacking && (c(t.info), t.info.type === "video" && t.info.width !== -1 ? (t.trackBacking = new br(t), this.tracks.push(t)) : t.info.type === "audio" && t.info.numberOfChannels !== -1 && (t.trackBacking = new xr(t), this.tracks.push(t)));
					}
					n = !1;
					break;
				}
				t = i + a.totalSize;
			}
			if (n) {
				c(this.reader.fileSize !== null);
				let e = this.reader.requestSlice(this.reader.fileSize - 4, 4);
				e instanceof Promise && (e = await e), c(e);
				let t = W(e), n = this.reader.fileSize - t;
				if (n >= 0 && n <= this.reader.fileSize - 16) {
					let e = this.reader.requestSliceRange(n, 8, 16);
					if (e instanceof Promise && (e = await e), e) {
						let t = nr(e);
						if (t && t.name === "mfra") {
							let n = this.reader.requestSlice(e.filePos, t.contentSize);
							n instanceof Promise && (n = await n), n && this.readContiguousBoxes(n);
						}
					}
				}
			}
		})();
	}
	getSampleTableForTrack(e) {
		if (e.sampleTable) return e.sampleTable;
		let t = {
			sampleTimingEntries: [],
			sampleCompositionTimeOffsets: [],
			sampleSizes: [],
			keySampleIndices: null,
			chunkOffsets: [],
			sampleToChunk: [],
			presentationTimestamps: null,
			presentationTimestampIndexMap: null
		};
		if (e.sampleTable = t, e.sampleTableByteOffset === null) return t;
		c(this.moovSlice);
		let n = this.moovSlice.slice(e.sampleTableByteOffset);
		if (this.currentTrack = e, this.traverseBox(n), this.currentTrack = null, e.info?.type === "audio" && e.info.codec && k.includes(e.info.codec) && t.sampleCompositionTimeOffsets.length === 0) {
			c(e.info?.type === "audio");
			let n = Mt(e.info.codec), r = [], i = [];
			for (let a = 0; a < t.sampleToChunk.length; a++) {
				let o = t.sampleToChunk[a], s = t.sampleToChunk[a + 1], c = (s ? s.startChunkIndex : t.chunkOffsets.length) - o.startChunkIndex;
				for (let a = 0; a < c; a++) {
					let s = o.startSampleIndex + a * o.samplesPerChunk, c = s + o.samplesPerChunk, l = w(t.sampleTimingEntries, s, (e) => e.startIndex), d = t.sampleTimingEntries[l], f = w(t.sampleTimingEntries, c, (e) => e.startIndex), p = t.sampleTimingEntries[f], m = d.startDecodeTimestamp + (s - d.startIndex) * d.delta, h = p.startDecodeTimestamp + (c - p.startIndex) * p.delta - m, g = u(r);
					g && g.delta === h ? g.count++ : r.push({
						startIndex: o.startChunkIndex + a,
						startDecodeTimestamp: m,
						count: 1,
						delta: h
					});
					let _ = o.samplesPerChunk * n.sampleSize * e.info.numberOfChannels;
					i.push(_);
				}
				o.startSampleIndex = o.startChunkIndex, o.samplesPerChunk = 1;
			}
			t.sampleTimingEntries = r, t.sampleSizes = i;
		}
		if (t.sampleCompositionTimeOffsets.length > 0) {
			t.presentationTimestamps = [];
			for (let e of t.sampleTimingEntries) for (let n = 0; n < e.count; n++) t.presentationTimestamps.push({
				presentationTimestamp: e.startDecodeTimestamp + n * e.delta,
				sampleIndex: e.startIndex + n
			});
			for (let e of t.sampleCompositionTimeOffsets) for (let n = 0; n < e.count; n++) {
				let r = e.startIndex + n, i = t.presentationTimestamps[r];
				i && (i.presentationTimestamp += e.offset);
			}
			t.presentationTimestamps.sort((e, t) => e.presentationTimestamp - t.presentationTimestamp), t.presentationTimestampIndexMap = Array(t.presentationTimestamps.length).fill(-1);
			for (let e = 0; e < t.presentationTimestamps.length; e++) t.presentationTimestampIndexMap[t.presentationTimestamps[e].sampleIndex] = e;
		}
		return t;
	}
	async readFragment(e) {
		if (this.lastReadFragment?.moofOffset === e) return this.lastReadFragment;
		let t = this.reader.requestSliceRange(e, 8, 16);
		t instanceof Promise && (t = await t), c(t);
		let n = nr(t);
		c(n?.name === "moof");
		let r = this.reader.requestSlice(e, n.totalSize);
		r instanceof Promise && (r = await r), c(r), this.traverseBox(r);
		let i = this.lastReadFragment;
		c(i && i.moofOffset === e);
		for (let [, e] of i.trackData) {
			let t = e.track, { fragmentPositionCache: n } = t;
			if (!e.startTimestampIsFinal) {
				let r = t.fragmentLookupTable.find((e) => e.moofOffset === i.moofOffset);
				if (r) Er(e, r.timestamp);
				else {
					let t = w(n, i.moofOffset - 1, (e) => e.moofOffset);
					if (t !== -1) {
						let r = n[t];
						Er(e, r.endTimestamp);
					}
				}
				e.startTimestampIsFinal = !0;
			}
			let r = w(n, e.startTimestamp, (e) => e.startTimestamp);
			if ((r === -1 || n[r].moofOffset !== i.moofOffset) && n.splice(r + 1, 0, {
				moofOffset: i.moofOffset,
				startTimestamp: e.startTimestamp,
				endTimestamp: e.endTimestamp
			}), e.encryptionAuxInfo && t.encryptionInfo) {
				let n = await Ar(this.reader, t.encryptionInfo, e.encryptionAuxInfo);
				for (let t = 0; t < Math.min(e.samples.length, n.length); t++) {
					let r = n[t];
					e.samples[t].encryption = r;
				}
			}
		}
		return i;
	}
	readContiguousBoxes(e) {
		let t = e.filePos;
		for (; e.filePos - t <= e.length - 8 && this.traverseBox(e););
	}
	*iterateContiguousBoxes(e) {
		let t = e.filePos;
		for (; e.filePos - t <= e.length - 8;) {
			let t = e.filePos, n = nr(e);
			if (!n) break;
			yield {
				boxInfo: n,
				slice: e
			}, e.filePos = t + n.totalSize;
		}
	}
	traverseBox(e) {
		let t = e.filePos, n = nr(e);
		if (!n) return !1;
		let r = e.filePos, i = t + n.totalSize;
		switch (n.name) {
			case "mdia":
			case "minf":
			case "dinf":
			case "mfra":
			case "edts":
			case "sinf":
			case "schi":
				this.readContiguousBoxes(e.slice(r, n.contentSize));
				break;
			case "mvhd":
				{
					let t = H(e);
					e.skip(3), t === 1 ? (e.skip(16), this.movieTimescale = W(e), this.movieDurationInTimescale = Us(e)) : (e.skip(8), this.movieTimescale = W(e), this.movieDurationInTimescale = W(e));
				}
				break;
			case "trak":
				{
					let t = {
						id: -1,
						demuxer: this,
						trackBacking: null,
						disposition: {
							...st,
							primary: !1
						},
						info: null,
						timescale: -1,
						durationInMovieTimescale: -1,
						durationInMediaTimescale: -1,
						rotation: 0,
						internalCodecId: null,
						name: null,
						languageCode: "und",
						sampleTableByteOffset: -1,
						sampleTable: null,
						fragmentLookupTable: [],
						currentFragmentState: null,
						fragmentPositionCache: [],
						editListPreviousSegmentDurations: 0,
						editListOffset: 0,
						encryptionInfo: null,
						encryptionAuxInfo: null,
						frmaCodecString: null
					};
					this.currentTrack = t, this.readContiguousBoxes(e.slice(r, n.contentSize)), t.id !== -1 && t.timescale !== -1 && t.info !== null && (t.info.type === "video" && t.info.width !== -1 ? (t.trackBacking = new br(t), this.tracks.push(t)) : t.info.type === "audio" && t.info.numberOfChannels !== -1 && (t.trackBacking = new xr(t), this.tracks.push(t))), this.currentTrack = null;
				}
				break;
			case "tkhd":
				{
					let t = this.currentTrack;
					if (!t) break;
					let n = H(e), r = !!(Is(e) & 1);
					if (t.disposition.default = r, n === 0) e.skip(8), t.id = W(e), e.skip(4), t.durationInMovieTimescale = W(e);
					else if (n === 1) e.skip(16), t.id = W(e), e.skip(4), t.durationInMovieTimescale = Us(e);
					else throw Error(`Incorrect track header version ${n}.`);
					e.skip(16);
					let i = l(Ce(Dr([
						rr(e),
						rr(e),
						ir(e),
						rr(e),
						rr(e),
						ir(e),
						rr(e),
						rr(e),
						ir(e)
					]), 90));
					c(i === 0 || i === 90 || i === 180 || i === 270), t.rotation = i;
				}
				break;
			case "elst":
				{
					let t = this.currentTrack;
					if (!t) break;
					let n = H(e);
					e.skip(3);
					let r = !1, i = 0, a = W(e);
					for (let o = 0; o < a; o++) {
						let a = n === 1 ? Us(e) : W(e), o = n === 1 ? Ws(e) : Bs(e), s = rr(e);
						if (a !== 0) {
							if (r) {
								D._warn("Unsupported edit list: multiple edits are not currently supported. Only using first edit.");
								break;
							}
							if (o === -1) {
								i += a;
								continue;
							}
							if (s !== 1) {
								D._warn("Unsupported edit list entry: media rate must be 1.");
								break;
							}
							t.editListPreviousSegmentDurations = i, t.editListOffset = o, r = !0;
						}
					}
				}
				break;
			case "mdhd":
				{
					let t = this.currentTrack;
					if (!t) break;
					let n = H(e);
					e.skip(3), n === 0 ? (e.skip(8), t.timescale = W(e), t.durationInMediaTimescale = W(e)) : n === 1 && (e.skip(16), t.timescale = W(e), t.durationInMediaTimescale = Us(e));
					let r = U(e);
					if (r > 0) {
						t.languageCode = "";
						for (let e = 0; e < 3; e++) t.languageCode = String.fromCharCode(96 + (r & 31)) + t.languageCode, r >>= 5;
						ke(t.languageCode) || (t.languageCode = "und");
					}
				}
				break;
			case "hdlr":
				{
					let t = this.currentTrack;
					if (!t) break;
					e.skip(8);
					let n = G(e, 4);
					n === "vide" ? t.info = {
						type: "video",
						width: -1,
						height: -1,
						squarePixelWidth: -1,
						squarePixelHeight: -1,
						codec: null,
						codecDescription: null,
						colorSpace: null,
						avcType: null,
						avcCodecInfo: null,
						hevcCodecInfo: null,
						vp9CodecInfo: null,
						av1CodecInfo: null,
						proresFormat: null
					} : n === "soun" && (t.info = {
						type: "audio",
						numberOfChannels: -1,
						sampleRate: -1,
						codec: null,
						codecDescription: null,
						aacCodecInfo: null,
						pcmLittleEndian: !1,
						pcmSampleSize: null
					});
				}
				break;
			case "stbl":
				{
					let i = this.currentTrack;
					if (!i) break;
					i.sampleTableByteOffset = t, this.readContiguousBoxes(e.slice(r, n.contentSize));
				}
				break;
			case "stsd":
				{
					let t = this.currentTrack;
					if (!t || t.info === null || t.sampleTable) break;
					let n = H(e);
					e.skip(3);
					let r = W(e);
					for (let i = 0; i < r; i++) {
						let r = e.filePos, i = nr(e);
						if (!i) break;
						t.internalCodecId = i.name;
						let a = i.name.toLowerCase();
						if (t.info.type === "video") {
							e.skip(24), t.info.width = U(e), t.info.height = U(e), t.info.squarePixelWidth = t.info.width, t.info.squarePixelHeight = t.info.height, e.skip(50), t.frmaCodecString = null, this.readContiguousBoxes(e.slice(e.filePos, r + i.totalSize - e.filePos));
							let n = a === "encv" ? t.frmaCodecString : a;
							t.frmaCodecString = null, n === "avc1" || n === "avc3" ? (t.info.codec = "avc", t.info.avcType = n === "avc1" ? 1 : 3) : n === "hvc1" || n === "hev1" ? t.info.codec = "hevc" : n === "vp08" ? t.info.codec = "vp8" : n === "vp09" ? t.info.codec = "vp9" : n === "av01" ? t.info.codec = "av1" : Ct.includes(a) ? (t.info.codec = "prores", t.info.proresFormat = a) : n === null ? D._warn("Unknown encrypted video codec due to missing frma box.") : D._warn(`Unsupported video codec (sample entry type '${i.name}').`);
						} else {
							e.skip(8);
							let o = U(e);
							e.skip(6);
							let s = U(e), c = U(e);
							e.skip(4);
							let l = W(e) / 65536, u = null;
							n === 0 && o > 0 && (o === 1 ? (e.skip(4), c = 8 * W(e), e.skip(8)) : o === 2 && (e.skip(4), l = qs(e), s = W(e), e.skip(4), c = W(e), u = W(e), e.skip(8))), t.info.numberOfChannels = s, t.info.sampleRate = l, t.frmaCodecString = null, this.readContiguousBoxes(e.slice(e.filePos, r + i.totalSize - e.filePos));
							let d = a === "enca" ? t.frmaCodecString : a;
							if (t.frmaCodecString = null, d !== "mp4a") if (d === "opus") t.info.codec = "opus", t.info.sampleRate = At;
							else if (d === "flac") t.info.codec = "flac";
							else if (d === "ulaw") t.info.codec = "ulaw";
							else if (d === "alaw") t.info.codec = "alaw";
							else if (d === "ac-3") t.info.codec = "ac3";
							else if (d === "ec-3") t.info.codec = "eac3";
							else if (d === "twos") c === 8 ? t.info.codec = "pcm-s8" : c === 16 ? t.info.codec = t.info.pcmLittleEndian ? "pcm-s16" : "pcm-s16be" : (D._warn(`Unsupported sample size ${c} for codec 'twos'.`), t.info.codec = null);
							else if (d === "sowt") c === 8 ? t.info.codec = "pcm-s8" : c === 16 ? t.info.codec = "pcm-s16" : (D._warn(`Unsupported sample size ${c} for codec 'sowt'.`), t.info.codec = null);
							else if (d === "raw ") t.info.codec = "pcm-u8";
							else if (d === "in24") t.info.codec = t.info.pcmLittleEndian ? "pcm-s24" : "pcm-s24be";
							else if (d === "in32") t.info.codec = t.info.pcmLittleEndian ? "pcm-s32" : "pcm-s32be";
							else if (d === "fl32") t.info.codec = t.info.pcmLittleEndian ? "pcm-f32" : "pcm-f32be";
							else if (d === "fl64") t.info.codec = t.info.pcmLittleEndian ? "pcm-f64" : "pcm-f64be";
							else if (d === "ipcm") {
								let e = t.info.pcmSampleSize;
								t.info.pcmLittleEndian ? e === 16 ? t.info.codec = "pcm-s16" : e === 24 ? t.info.codec = "pcm-s24" : e === 32 ? t.info.codec = "pcm-s32" : (D._warn(`Invalid ipcm sample size ${e}.`), t.info.codec = null) : e === 16 ? t.info.codec = "pcm-s16be" : e === 24 ? t.info.codec = "pcm-s24be" : e === 32 ? t.info.codec = "pcm-s32be" : (D._warn(`Invalid ipcm sample size ${e}.`), t.info.codec = null);
							} else if (d === "fpcm") {
								let e = t.info.pcmSampleSize;
								t.info.pcmLittleEndian ? e === 32 ? t.info.codec = "pcm-f32" : e === 64 ? t.info.codec = "pcm-f64" : (D._warn(`Invalid fpcm sample size ${e}.`), t.info.codec = null) : e === 32 ? t.info.codec = "pcm-f32be" : e === 64 ? t.info.codec = "pcm-f64be" : (D._warn(`Invalid fpcm sample size ${e}.`), t.info.codec = null);
							} else if (d === "lpcm" && u !== null) {
								let e = c + 7 >> 3, n = !!(u & 1), r = !!(u & 2), i = u & 4 ? -1 : 0;
								c > 0 && c <= 64 && (n ? c === 32 && (t.info.codec = r ? "pcm-f32be" : "pcm-f32") : i & 1 << e - 1 ? e === 1 ? t.info.codec = "pcm-s8" : e === 2 ? t.info.codec = r ? "pcm-s16be" : "pcm-s16" : e === 3 ? t.info.codec = r ? "pcm-s24be" : "pcm-s24" : e === 4 && (t.info.codec = r ? "pcm-s32be" : "pcm-s32") : e === 1 && (t.info.codec = "pcm-u8")), t.info.codec === null && D._warn("Unsupported PCM format.");
							} else d === null ? D._warn("Unknown encrypted audio codec due to missing frma box.") : D._warn(`Unsupported audio codec (sample entry type '${i.name}').`);
						}
						e.filePos = r + i.totalSize;
					}
				}
				break;
			case "frma":
				{
					let t = this.currentTrack;
					if (!t) break;
					t.frmaCodecString = G(e, 4).toLowerCase();
				}
				break;
			case "schm":
				{
					let t = this.currentTrack;
					if (!t) break;
					e.skip(4);
					let n = G(e, 4);
					n === "cenc" || n === "cens" || n === "cbcs" ? t.encryptionInfo = {
						scheme: n,
						defaultKid: null,
						defaultIsProtected: null,
						defaultPerSampleIvSize: null,
						defaultConstantIv: null,
						defaultCryptByteBlock: null,
						defaultSkipByteBlock: null
					} : D._warn(`Unsupported encryption scheme '${n}'.`);
				}
				break;
			case "tenc":
				{
					let t = this.currentTrack;
					if (!t || !t.encryptionInfo) break;
					let n = H(e);
					e.skip(3), e.skip(1);
					let r = H(e);
					if (n > 0 ? (t.encryptionInfo.defaultCryptByteBlock = r >> 4, t.encryptionInfo.defaultSkipByteBlock = r & 15) : (t.encryptionInfo.defaultCryptByteBlock = 0, t.encryptionInfo.defaultSkipByteBlock = 0), t.encryptionInfo.defaultIsProtected = H(e) !== 0, t.encryptionInfo.defaultPerSampleIvSize = H(e), t.encryptionInfo.defaultKid = ae(V(e, 16)), t.encryptionInfo.defaultIsProtected && t.encryptionInfo.defaultPerSampleIvSize === 0) {
						let n = H(e), r = new Uint8Array(16);
						r.set(V(e, n), 0), t.encryptionInfo.defaultConstantIv = r;
					}
				}
				break;
			case "avcC":
				{
					let t = this.currentTrack;
					if (!t) break;
					c(t.info), t.info.codecDescription = V(e, n.contentSize);
				}
				break;
			case "hvcC":
				{
					let t = this.currentTrack;
					if (!t) break;
					c(t.info), t.info.codecDescription = V(e, n.contentSize);
				}
				break;
			case "vpcC":
				{
					let t = this.currentTrack;
					if (!t) break;
					c(t.info?.type === "video"), e.skip(4);
					let n = H(e), r = H(e), i = H(e), a = i >> 4, o = i >> 1 & 7, s = i & 1, l = H(e), u = H(e), d = H(e);
					t.info.vp9CodecInfo = {
						profile: n,
						level: r,
						bitDepth: a,
						chromaSubsampling: o,
						videoFullRangeFlag: s,
						colourPrimaries: l,
						transferCharacteristics: u,
						matrixCoefficients: d
					};
				}
				break;
			case "av1C":
				{
					let t = this.currentTrack;
					if (!t) break;
					c(t.info?.type === "video"), e.skip(1);
					let n = H(e), r = n >> 5, i = n & 31, a = H(e), o = a >> 7, s = a >> 6 & 1, l = a >> 5 & 1, u = a >> 4 & 1, d = a >> 3 & 1, f = a >> 2 & 1, p = a & 3, m = r === 2 && s ? l ? 12 : 10 : s ? 10 : 8;
					t.info.av1CodecInfo = {
						profile: r,
						level: i,
						tier: o,
						bitDepth: m,
						monochrome: u,
						chromaSubsamplingX: d,
						chromaSubsamplingY: f,
						chromaSamplePosition: p
					};
				}
				break;
			case "colr":
				{
					let t = this.currentTrack;
					if (!t) break;
					c(t.info?.type === "video");
					let n = G(e, 4);
					if (n !== "nclx" && n !== "nclc") break;
					let r = U(e), i = U(e), a = U(e), o;
					n === "nclx" && (o = !!(H(e) & 128)), t.info.colorSpace = {
						primaries: b[r],
						transfer: S[i],
						matrix: ee[a],
						fullRange: o
					};
				}
				break;
			case "pasp":
				{
					let t = this.currentTrack;
					if (!t) break;
					c(t.info?.type === "video");
					let n = W(e), r = W(e);
					n > 0 && r > 0 && (n > r ? t.info.squarePixelWidth = Math.round(t.info.width * n / r) : t.info.squarePixelHeight = Math.round(t.info.height * r / n));
				}
				break;
			case "wave":
				this.readContiguousBoxes(e.slice(r, n.contentSize));
				break;
			case "esds":
				{
					let t = this.currentTrack;
					if (!t) break;
					c(t.info?.type === "audio"), e.skip(4), c(H(e) === 3), ar(e), e.skip(2);
					let n = H(e), r = (n & 128) != 0, i = (n & 64) != 0, a = (n & 32) != 0;
					if (r && e.skip(2), i) {
						let t = H(e);
						e.skip(t);
					}
					a && e.skip(2), c(H(e) === 4);
					let o = ar(e), s = e.filePos, l = H(e);
					if (l === 64 || l === 103 ? (t.info.codec = "aac", t.info.aacCodecInfo = {
						isMpeg2: l === 103,
						objectType: null
					}) : l === 105 || l === 107 ? t.info.codec = "mp3" : l === 221 ? t.info.codec = "vorbis" : D._warn(`Unsupported audio codec (objectTypeIndication ${l}) - discarding track.`), e.skip(12), o > e.filePos - s) {
						c(H(e) === 5);
						let n = ar(e);
						if (t.info.codecDescription = V(e, n), t.info.codec === "aac") {
							let e = dt(t.info.codecDescription);
							e.numberOfChannels !== null && (t.info.numberOfChannels = e.numberOfChannels), e.sampleRate !== null && (t.info.sampleRate = e.sampleRate);
						}
					}
				}
				break;
			case "enda":
				{
					let t = this.currentTrack;
					if (!t) break;
					c(t.info?.type === "audio"), t.info.pcmLittleEndian = !!(U(e) & 255);
				}
				break;
			case "pcmC":
				{
					let t = this.currentTrack;
					if (!t) break;
					c(t.info?.type === "audio"), e.skip(4);
					let n = H(e);
					t.info.pcmLittleEndian = !!(n & 1), t.info.pcmSampleSize = H(e);
				}
				break;
			case "dOps":
				{
					let t = this.currentTrack;
					if (!t) break;
					c(t.info?.type === "audio"), e.skip(1);
					let n = H(e), r = U(e), i = W(e), a = Ls(e), o = H(e), s;
					s = o === 0 ? new Uint8Array() : V(e, 2 + n);
					let l = new Uint8Array(19 + s.byteLength), u = new DataView(l.buffer);
					u.setUint32(0, 1332770163, !1), u.setUint32(4, 1214603620, !1), u.setUint8(8, 1), u.setUint8(9, n), u.setUint16(10, r, !0), u.setUint32(12, i, !0), u.setInt16(16, a, !0), u.setUint8(18, o), l.set(s, 19), t.info.codecDescription = l, t.info.numberOfChannels = n;
				}
				break;
			case "dfLa":
				{
					let t = this.currentTrack;
					if (!t) break;
					c(t.info?.type === "audio"), e.skip(4);
					let n = e.filePos;
					for (; e.filePos < i;) {
						let n = H(e), r = Is(e);
						if ((n & 127) === Bn.STREAMINFO) {
							e.skip(10);
							let n = W(e), r = n >>> 12, i = (n >> 9 & 7) + 1;
							t.info.sampleRate = r, t.info.numberOfChannels = i, e.skip(20);
						} else e.skip(r);
						if (n & 128) break;
					}
					let r = e.filePos;
					e.filePos = n;
					let a = V(e, r - n), o = new Uint8Array(4 + a.byteLength);
					new DataView(o.buffer).setUint32(0, 1716281667, !1), o.set(a, 4), t.info.codecDescription = o;
				}
				break;
			case "dac3":
				{
					let t = this.currentTrack;
					if (!t) break;
					c(t.info?.type === "audio");
					let n = new O(V(e, 3)), r = n.readBits(2);
					n.skipBits(8);
					let i = n.readBits(3), a = n.readBits(1);
					r < 3 && (t.info.sampleRate = en[r]), t.info.numberOfChannels = Hn[i] + a;
				}
				break;
			case "dec3":
				{
					let t = this.currentTrack;
					if (!t) break;
					c(t.info?.type === "audio");
					let r = Jn(V(e, n.contentSize));
					if (!r) {
						D._warn("Invalid dec3 box contents, ignoring.");
						break;
					}
					let i = Yn(r);
					i !== null && (t.info.sampleRate = i), t.info.numberOfChannels = Xn(r);
				}
				break;
			case "stts":
				{
					let t = this.currentTrack;
					if (!t || !t.sampleTable) break;
					e.skip(4);
					let n = W(e), r = 0, i = 0;
					for (let a = 0; a < n; a++) {
						let n = W(e), a = W(e);
						t.sampleTable.sampleTimingEntries.push({
							startIndex: r,
							startDecodeTimestamp: i,
							count: n,
							delta: a
						}), r += n, i += n * a;
					}
				}
				break;
			case "ctts":
				{
					let t = this.currentTrack;
					if (!t || !t.sampleTable) break;
					e.skip(4);
					let n = W(e), r = 0;
					for (let i = 0; i < n; i++) {
						let n = W(e), i = Bs(e);
						t.sampleTable.sampleCompositionTimeOffsets.push({
							startIndex: r,
							count: n,
							offset: i
						}), r += n;
					}
				}
				break;
			case "stsz":
				{
					let t = this.currentTrack;
					if (!t || !t.sampleTable) break;
					e.skip(4);
					let n = W(e), r = W(e);
					if (n === 0) for (let n = 0; n < r; n++) {
						let n = W(e);
						t.sampleTable.sampleSizes.push(n);
					}
					else t.sampleTable.sampleSizes.push(n);
				}
				break;
			case "stz2":
				{
					let t = this.currentTrack;
					if (!t || !t.sampleTable) break;
					e.skip(4), e.skip(3);
					let n = H(e), r = W(e), i = new O(V(e, Math.ceil(r * n / 8)));
					for (let e = 0; e < r; e++) {
						let e = i.readBits(n);
						t.sampleTable.sampleSizes.push(e);
					}
				}
				break;
			case "stss":
				{
					let t = this.currentTrack;
					if (!t || !t.sampleTable) break;
					e.skip(4), t.sampleTable.keySampleIndices = [];
					let n = W(e);
					for (let r = 0; r < n; r++) {
						let n = W(e) - 1;
						t.sampleTable.keySampleIndices.push(n);
					}
					t.sampleTable.keySampleIndices[0] !== 0 && t.sampleTable.keySampleIndices.unshift(0);
				}
				break;
			case "stsc":
				{
					let t = this.currentTrack;
					if (!t || !t.sampleTable) break;
					e.skip(4);
					let n = W(e);
					for (let r = 0; r < n; r++) {
						let n = W(e) - 1, r = W(e), i = W(e);
						t.sampleTable.sampleToChunk.push({
							startSampleIndex: -1,
							startChunkIndex: n,
							samplesPerChunk: r,
							sampleDescriptionIndex: i
						});
					}
					let r = 0;
					for (let e = 0; e < t.sampleTable.sampleToChunk.length; e++) if (t.sampleTable.sampleToChunk[e].startSampleIndex = r, e < t.sampleTable.sampleToChunk.length - 1) {
						let n = t.sampleTable.sampleToChunk[e + 1].startChunkIndex - t.sampleTable.sampleToChunk[e].startChunkIndex;
						r += n * t.sampleTable.sampleToChunk[e].samplesPerChunk;
					}
				}
				break;
			case "stco":
				{
					let t = this.currentTrack;
					if (!t || !t.sampleTable) break;
					e.skip(4);
					let n = W(e);
					for (let r = 0; r < n; r++) {
						let n = W(e);
						t.sampleTable.chunkOffsets.push(n);
					}
				}
				break;
			case "co64":
				{
					let t = this.currentTrack;
					if (!t || !t.sampleTable) break;
					e.skip(4);
					let n = W(e);
					for (let r = 0; r < n; r++) {
						let n = Us(e);
						t.sampleTable.chunkOffsets.push(n);
					}
				}
				break;
			case "mvex":
				this.isFragmented = !0, this.readContiguousBoxes(e.slice(r, n.contentSize));
				break;
			case "mehd":
				{
					let t = H(e);
					e.skip(3);
					let n = t === 1 ? Us(e) : W(e);
					this.movieDurationInTimescale = n;
				}
				break;
			case "trex":
				{
					e.skip(4);
					let t = W(e), n = W(e), r = W(e), i = W(e), a = W(e);
					this.fragmentTrackDefaults.push({
						trackId: t,
						defaultSampleDescriptionIndex: n,
						defaultSampleDuration: r,
						defaultSampleSize: i,
						defaultSampleFlags: a
					});
				}
				break;
			case "tfra":
				{
					let t = H(e);
					e.skip(3);
					let n = W(e), r = this.tracks.find((e) => e.id === n);
					if (!r) break;
					let i = W(e), a = (i & 48) >> 4, o = (i & 12) >> 2, s = i & 3, c = [
						H,
						U,
						Is,
						W
					], l = c[a], u = c[o], d = c[s], f = W(e);
					for (let n = 0; n < f; n++) {
						let n = t === 1 ? Us(e) : W(e), i = t === 1 ? Us(e) : W(e);
						l(e), u(e), d(e), r.fragmentLookupTable.push({
							timestamp: n,
							moofOffset: i
						});
					}
					r.fragmentLookupTable.sort((e, t) => e.timestamp - t.timestamp);
					for (let e = 0; e < r.fragmentLookupTable.length - 1; e++) {
						let t = r.fragmentLookupTable[e], n = r.fragmentLookupTable[e + 1];
						t.timestamp === n.timestamp && (r.fragmentLookupTable.splice(e + 1, 1), e--);
					}
				}
				break;
			case "moof":
				this.currentFragment = {
					moofOffset: t,
					moofSize: n.totalSize,
					implicitBaseDataOffset: t,
					trackData: /* @__PURE__ */ new Map(),
					psshBoxes: []
				}, this.readContiguousBoxes(e.slice(r, n.contentSize)), this.lastReadFragment = this.currentFragment, this.currentFragment = null;
				break;
			case "traf":
				if (c(this.currentFragment), this.readContiguousBoxes(e.slice(r, n.contentSize)), this.currentTrack) {
					let e = this.currentFragment.trackData.get(this.currentTrack.id);
					cond: if (e) {
						if (e.samples.length === 0) {
							this.currentFragment.trackData.delete(this.currentTrack.id);
							break cond;
						}
						e.presentationTimestamps = e.samples.map((e, t) => ({
							presentationTimestamp: e.presentationTimestamp,
							sampleIndex: t
						})).sort((e, t) => e.presentationTimestamp - t.presentationTimestamp);
						for (let t = 0; t < e.presentationTimestamps.length; t++) {
							let n = e.presentationTimestamps[t], r = e.samples[n.sampleIndex];
							e.firstKeyFrameTimestamp === null && r.isKeyFrame && (e.firstKeyFrameTimestamp = r.presentationTimestamp), t < e.presentationTimestamps.length - 1 && (r.duration = e.presentationTimestamps[t + 1].presentationTimestamp - n.presentationTimestamp);
						}
						let t = e.samples[e.presentationTimestamps[0].sampleIndex], n = e.samples[u(e.presentationTimestamps).sampleIndex];
						e.startTimestamp = t.presentationTimestamp, e.endTimestamp = n.presentationTimestamp + n.duration;
						let { currentFragmentState: r } = this.currentTrack;
						c(r), r.startTimestamp !== null && (Er(e, r.startTimestamp), e.startTimestampIsFinal = !0), r.encryptionAuxInfo && !e.samples[0].encryption && (e.encryptionAuxInfo = r.encryptionAuxInfo);
					}
					this.currentTrack.currentFragmentState = null, this.currentTrack = null;
				}
				break;
			case "pssh":
				{
					if (this.input._formatOptions.isobmff?._suppressPsshParsing) break;
					let t = er(V(e, n.contentSize));
					this.currentFragment ? this.currentFragment.psshBoxes.push(t) : this.currentTrack || this.psshBoxes.push(t);
				}
				break;
			case "tfhd":
				{
					c(this.currentFragment), e.skip(1);
					let t = Is(e), n = !!(t & 1), r = !!(t & 2), i = !!(t & 8), a = !!(t & 16), o = !!(t & 32), s = !!(t & 65536), l = !!(t & 131072), u = W(e), d = this.tracks.find((e) => e.id === u);
					if (!d) break;
					let f = this.fragmentTrackDefaults.find((e) => e.trackId === u);
					this.currentTrack = d, d.currentFragmentState = {
						baseDataOffset: this.currentFragment.implicitBaseDataOffset,
						sampleDescriptionIndex: f?.defaultSampleDescriptionIndex ?? null,
						defaultSampleDuration: f?.defaultSampleDuration ?? null,
						defaultSampleSize: f?.defaultSampleSize ?? null,
						defaultSampleFlags: f?.defaultSampleFlags ?? null,
						startTimestamp: null,
						encryptionAuxInfo: null
					}, n ? d.currentFragmentState.baseDataOffset = Us(e) : l && (d.currentFragmentState.baseDataOffset = this.currentFragment.moofOffset), r && (d.currentFragmentState.sampleDescriptionIndex = W(e)), i && (d.currentFragmentState.defaultSampleDuration = W(e)), a && (d.currentFragmentState.defaultSampleSize = W(e)), o && (d.currentFragmentState.defaultSampleFlags = W(e)), s && (d.currentFragmentState.defaultSampleDuration = 0);
				}
				break;
			case "tfdt":
				{
					let t = this.currentTrack;
					if (!t) break;
					c(t.currentFragmentState);
					let n = H(e);
					e.skip(3);
					let r = n === 0 ? W(e) : Us(e);
					t.currentFragmentState.startTimestamp = r;
				}
				break;
			case "trun":
				{
					let t = this.currentTrack;
					if (!t) break;
					c(this.currentFragment), c(t.currentFragmentState);
					let n = H(e), r = Is(e), i = !!(r & 1), a = !!(r & 4), o = !!(r & 256), s = !!(r & 512), l = !!(r & 1024), u = !!(r & 2048), d = W(e), f = null;
					i && (f = Bs(e));
					let p = null;
					a && (p = W(e));
					let m;
					this.currentFragment.trackData.has(t.id) ? (m = this.currentFragment.trackData.get(t.id), f !== null && (m.currentOffset = t.currentFragmentState.baseDataOffset + f)) : (m = {
						track: t,
						currentTimestamp: 0,
						currentOffset: t.currentFragmentState.baseDataOffset + (f ?? 0),
						startTimestamp: 0,
						endTimestamp: 0,
						firstKeyFrameTimestamp: null,
						samples: [],
						presentationTimestamps: [],
						startTimestampIsFinal: !1,
						encryptionAuxInfo: null
					}, this.currentFragment.trackData.set(t.id, m));
					for (let r = 0; r < d; r++) {
						let i;
						o ? i = W(e) : (c(t.currentFragmentState.defaultSampleDuration !== null), i = t.currentFragmentState.defaultSampleDuration);
						let a;
						s ? a = W(e) : (c(t.currentFragmentState.defaultSampleSize !== null), a = t.currentFragmentState.defaultSampleSize);
						let d;
						l ? d = W(e) : (c(t.currentFragmentState.defaultSampleFlags !== null), d = t.currentFragmentState.defaultSampleFlags), r === 0 && p !== null && (d = p);
						let f = 0;
						u && (f = n === 0 ? W(e) : Bs(e));
						let h = !(d & 65536);
						m.samples.push({
							presentationTimestamp: m.currentTimestamp + f,
							duration: i,
							byteOffset: m.currentOffset,
							byteSize: a,
							isKeyFrame: h,
							encryption: null
						}), m.currentOffset += a, m.currentTimestamp += i;
					}
					this.currentFragment.implicitBaseDataOffset = m.currentOffset;
				}
				break;
			case "saiz":
				{
					let t = this.currentTrack;
					if (!t || !t.encryptionInfo) break;
					if (e.skip(1), Is(e) & 1) {
						let n = G(e, 4), r = W(e);
						if (n !== t.encryptionInfo.scheme || r !== 0) break;
					}
					let n = H(e), r = W(e), i = null;
					n === 0 && r > 0 && (i = V(e, r));
					let a = kr(t);
					a.defaultSampleInfoSize = n, a.sampleSizes = i, a.sampleCount = r;
				}
				break;
			case "saio":
				{
					let t = this.currentTrack;
					if (!t || !t.encryptionInfo) break;
					let n = H(e);
					if (Is(e) & 1) {
						let n = G(e, 4), r = W(e);
						if (n !== t.encryptionInfo.scheme || r !== 0) break;
					}
					let r = W(e);
					if (r === 0) break;
					r > 1 && D._warn("Multiple saio entries are not supported; using the first offset only.");
					let i = n === 0 ? W(e) : Number(Us(e));
					this.currentFragment && (i += this.currentFragment.moofOffset);
					let a = kr(t);
					a.offset = i;
				}
				break;
			case "senc":
				{
					let t = this.currentTrack;
					if (!t || !t.encryptionInfo) break;
					c(this.currentFragment);
					let n = this.currentFragment.trackData.get(t.id);
					if (!n) break;
					e.skip(1);
					let r = !!(Is(e) & 2), i = W(e), a = t.encryptionInfo.defaultPerSampleIvSize;
					c(a !== null);
					for (let o = 0; o < Math.min(i, n.samples.length); o++) {
						let i = new Uint8Array(16);
						a > 0 ? i.set(V(e, a), 0) : i.set(t.encryptionInfo.defaultConstantIv, 0);
						let s = null;
						if (r) {
							let t = U(e);
							s = [];
							for (let n = 0; n < t; n++) {
								let t = U(e), n = W(e);
								s.push({
									clearLen: t,
									protectedLen: n
								});
							}
						}
						let c = n.samples[o];
						c.encryption = {
							iv: i,
							subsamples: s
						};
					}
				}
				break;
			case "udta":
				{
					let t = this.iterateContiguousBoxes(e.slice(r, n.contentSize));
					for (let { boxInfo: e, slice: n } of t) {
						if (e.name !== "meta" && !this.currentTrack) {
							let t = n.filePos;
							this.metadataTags.raw ??= {}, e.name[0] === "©" ? this.metadataTags.raw[e.name] ??= or(n) : this.metadataTags.raw[e.name] ??= V(n, e.contentSize), n.filePos = t;
						}
						switch (e.name) {
							case "meta":
								n.skip(-e.headerSize), this.traverseBox(n);
								break;
							case "©nam":
							case "name":
								this.currentTrack ? this.currentTrack.name = g.decode(V(n, e.contentSize)) : this.metadataTags.title ??= or(n);
								break;
							case "©des":
								this.currentTrack || (this.metadataTags.description ??= or(n));
								break;
							case "©ART":
								this.currentTrack || (this.metadataTags.artist ??= or(n));
								break;
							case "©alb":
								this.currentTrack || (this.metadataTags.album ??= or(n));
								break;
							case "albr":
								this.currentTrack || (this.metadataTags.albumArtist ??= or(n));
								break;
							case "©gen":
								this.currentTrack || (this.metadataTags.genre ??= or(n));
								break;
							case "©day":
								if (!this.currentTrack) {
									let e = new Date(or(n));
									Number.isNaN(e.getTime()) || (this.metadataTags.date ??= e);
								}
								break;
							case "©cmt":
								this.currentTrack || (this.metadataTags.comment ??= or(n));
								break;
							case "©lyr":
								this.currentTrack || (this.metadataTags.lyrics ??= or(n));
								break;
						}
					}
				}
				break;
			case "meta":
				{
					if (this.currentTrack) break;
					let t = W(e) !== 0;
					this.currentMetadataKeys = /* @__PURE__ */ new Map(), t ? this.readContiguousBoxes(e.slice(r, n.contentSize)) : this.readContiguousBoxes(e.slice(r + 4, n.contentSize - 4)), this.currentMetadataKeys = null;
				}
				break;
			case "keys":
				{
					if (!this.currentMetadataKeys) break;
					e.skip(4);
					let t = W(e);
					for (let n = 0; n < t; n++) {
						let t = W(e);
						e.skip(4);
						let r = g.decode(V(e, t - 8));
						this.currentMetadataKeys.set(n + 1, r);
					}
				}
				break;
			case "ilst":
				{
					if (!this.currentMetadataKeys) break;
					let t = this.iterateContiguousBoxes(e.slice(r, n.contentSize));
					for (let { boxInfo: e, slice: n } of t) {
						let t = e.name, r = (t.charCodeAt(0) << 24) + (t.charCodeAt(1) << 16) + (t.charCodeAt(2) << 8) + t.charCodeAt(3);
						this.currentMetadataKeys.has(r) && (t = this.currentMetadataKeys.get(r));
						let i = sr(n);
						switch (this.metadataTags.raw ??= {}, this.metadataTags.raw[t] ??= i, t) {
							case "©nam":
							case "titl":
							case "com.apple.quicktime.title":
							case "title":
								typeof i == "string" && (this.metadataTags.title ??= i);
								break;
							case "©des":
							case "desc":
							case "dscp":
							case "com.apple.quicktime.description":
							case "description":
								typeof i == "string" && (this.metadataTags.description ??= i);
								break;
							case "©ART":
							case "com.apple.quicktime.artist":
							case "artist":
								typeof i == "string" && (this.metadataTags.artist ??= i);
								break;
							case "©alb":
							case "albm":
							case "com.apple.quicktime.album":
							case "album":
								typeof i == "string" && (this.metadataTags.album ??= i);
								break;
							case "aART":
							case "album_artist":
								typeof i == "string" && (this.metadataTags.albumArtist ??= i);
								break;
							case "©cmt":
							case "com.apple.quicktime.comment":
							case "comment":
								typeof i == "string" && (this.metadataTags.comment ??= i);
								break;
							case "©gen":
							case "gnre":
							case "com.apple.quicktime.genre":
							case "genre":
								typeof i == "string" && (this.metadataTags.genre ??= i);
								break;
							case "©lyr":
							case "lyrics":
								typeof i == "string" && (this.metadataTags.lyrics ??= i);
								break;
							case "©day":
							case "rldt":
							case "com.apple.quicktime.creationdate":
							case "date":
								if (typeof i == "string") {
									let e = new Date(i);
									Number.isNaN(e.getTime()) || (this.metadataTags.date ??= e);
								}
								break;
							case "covr":
							case "com.apple.quicktime.artwork":
								i instanceof it ? (this.metadataTags.images ??= [], this.metadataTags.images.push({
									data: i.data,
									kind: "coverFront",
									mimeType: i.mimeType
								})) : i instanceof Uint8Array && (this.metadataTags.images ??= [], this.metadataTags.images.push({
									data: i,
									kind: "coverFront",
									mimeType: "image/*"
								}));
								break;
							case "track":
								if (typeof i == "string") {
									let e = i.split("/"), t = Number.parseInt(e[0], 10), n = e[1] && Number.parseInt(e[1], 10);
									Number.isInteger(t) && t > 0 && (this.metadataTags.trackNumber ??= t), n && Number.isInteger(n) && n > 0 && (this.metadataTags.tracksTotal ??= n);
								}
								break;
							case "trkn":
								if (i instanceof Uint8Array && i.length >= 6) {
									let e = h(i), t = e.getUint16(2, !1), n = e.getUint16(4, !1);
									t > 0 && (this.metadataTags.trackNumber ??= t), n > 0 && (this.metadataTags.tracksTotal ??= n);
								}
								break;
							case "disc":
							case "disk":
								if (i instanceof Uint8Array && i.length >= 6) {
									let e = h(i), t = e.getUint16(2, !1), n = e.getUint16(4, !1);
									t > 0 && (this.metadataTags.discNumber ??= t), n > 0 && (this.metadataTags.discsTotal ??= n);
								}
								break;
						}
					}
				}
				break;
		}
		return e.filePos = i, !0;
	}
}, yr = class {
	constructor(e) {
		this.internalTrack = e, this.packetToSampleIndex = /* @__PURE__ */ new WeakMap(), this.packetToFragmentLocation = /* @__PURE__ */ new WeakMap();
	}
	getId() {
		return this.internalTrack.id;
	}
	getNumber() {
		let e = this.internalTrack.demuxer, t = this.internalTrack.trackBacking.getType(), n = 0;
		for (let r of e.tracks) if (r.trackBacking.getType() === t && n++, r === this.internalTrack) break;
		return n;
	}
	getCodec() {
		throw Error("Not implemented on base class.");
	}
	getInternalCodecId() {
		return this.internalTrack.internalCodecId;
	}
	getName() {
		return this.internalTrack.name;
	}
	getLanguageCode() {
		return this.internalTrack.languageCode;
	}
	getTimeResolution() {
		return this.internalTrack.timescale;
	}
	isRelativeToUnixEpoch() {
		return !1;
	}
	getUnixTimeForTimestamp() {
		return null;
	}
	getDisposition() {
		return this.internalTrack.disposition;
	}
	getPairingMask() {
		return 1n;
	}
	getBitrate() {
		return null;
	}
	getAverageBitrate() {
		return null;
	}
	async getDurationFromMetadata() {
		let e = this.internalTrack;
		return e.durationInMediaTimescale <= 0 ? null : (c(e.trackBacking), ((await e.trackBacking.getFirstPacket({ metadataOnly: !0 }))?.timestamp ?? 0) + e.durationInMediaTimescale / e.timescale);
	}
	async getLiveRefreshInterval() {
		return null;
	}
	async getFirstPacket(e) {
		let t = await this.fetchPacketForSampleIndex(0, e);
		return t || !this.internalTrack.demuxer.isFragmented ? t : this.performFragmentedLookup(null, (e) => e.trackData.get(this.internalTrack.id) ? {
			sampleIndex: 0,
			correctSampleFound: !0
		} : {
			sampleIndex: -1,
			correctSampleFound: !1
		}, -Infinity, Infinity, e);
	}
	mapTimestampIntoTimescale(e) {
		return Se(e * this.internalTrack.timescale) + this.internalTrack.editListOffset;
	}
	async getPacket(e, t) {
		let n = this.mapTimestampIntoTimescale(e), r = this.internalTrack.demuxer.getSampleTableForTrack(this.internalTrack), i = Sr(r, n), a = await this.fetchPacketForSampleIndex(i, t);
		return !Or(r) || !this.internalTrack.demuxer.isFragmented ? a : this.performFragmentedLookup(null, (e) => {
			let t = e.trackData.get(this.internalTrack.id);
			if (!t) return {
				sampleIndex: -1,
				correctSampleFound: !1
			};
			let r = w(t.presentationTimestamps, n, (e) => e.presentationTimestamp);
			return {
				sampleIndex: r === -1 ? -1 : t.presentationTimestamps[r].sampleIndex,
				correctSampleFound: r !== -1 && n < t.endTimestamp
			};
		}, n, n, t);
	}
	async getNextPacket(e, t) {
		let n = this.packetToSampleIndex.get(e);
		if (n !== void 0) return this.fetchPacketForSampleIndex(n + 1, t);
		let r = this.packetToFragmentLocation.get(e);
		if (r === void 0) throw Error("Packet was not created from this track.");
		return this.performFragmentedLookup(r.fragment, (e) => {
			if (e === r.fragment) {
				let t = e.trackData.get(this.internalTrack.id);
				if (r.sampleIndex + 1 < t.samples.length) return {
					sampleIndex: r.sampleIndex + 1,
					correctSampleFound: !0
				};
			} else if (e.trackData.get(this.internalTrack.id)) return {
				sampleIndex: 0,
				correctSampleFound: !0
			};
			return {
				sampleIndex: -1,
				correctSampleFound: !1
			};
		}, -Infinity, Infinity, t);
	}
	async getKeyPacket(e, t) {
		let n = this.mapTimestampIntoTimescale(e), r = this.internalTrack.demuxer.getSampleTableForTrack(this.internalTrack), i = Cr(r, n), a = await this.fetchPacketForSampleIndex(i, t);
		return !Or(r) || !this.internalTrack.demuxer.isFragmented ? a : this.performFragmentedLookup(null, (e) => {
			let t = e.trackData.get(this.internalTrack.id);
			if (!t) return {
				sampleIndex: -1,
				correctSampleFound: !1
			};
			let r = fe(t.presentationTimestamps, (e) => t.samples[e.sampleIndex].isKeyFrame && e.presentationTimestamp <= n);
			return {
				sampleIndex: r === -1 ? -1 : t.presentationTimestamps[r].sampleIndex,
				correctSampleFound: r !== -1 && n < t.endTimestamp
			};
		}, n, n, t);
	}
	async getNextKeyPacket(e, t) {
		let n = this.packetToSampleIndex.get(e);
		if (n !== void 0) {
			let e = Tr(this.internalTrack.demuxer.getSampleTableForTrack(this.internalTrack), n);
			return this.fetchPacketForSampleIndex(e, t);
		}
		let r = this.packetToFragmentLocation.get(e);
		if (r === void 0) throw Error("Packet was not created from this track.");
		return this.performFragmentedLookup(r.fragment, (e) => {
			if (e === r.fragment) {
				let t = e.trackData.get(this.internalTrack.id).samples.findIndex((e, t) => e.isKeyFrame && t > r.sampleIndex);
				if (t !== -1) return {
					sampleIndex: t,
					correctSampleFound: !0
				};
			} else {
				let t = e.trackData.get(this.internalTrack.id);
				if (t && t.firstKeyFrameTimestamp !== null) {
					let e = t.samples.findIndex((e) => e.isKeyFrame);
					return c(e !== -1), {
						sampleIndex: e,
						correctSampleFound: !0
					};
				}
			}
			return {
				sampleIndex: -1,
				correctSampleFound: !1
			};
		}, -Infinity, Infinity, t);
	}
	async fetchPacketForSampleIndex(e, t) {
		if (e === -1) return null;
		let n = wr(this.internalTrack.demuxer.getSampleTableForTrack(this.internalTrack), e);
		if (!n) return null;
		let r;
		if (t.metadataOnly) r = Qn;
		else {
			let t = this.internalTrack.demuxer.reader.requestSlice(n.sampleOffset, n.sampleSize);
			if (t instanceof Promise && (t = await t), !t) return null;
			if (r = V(t, n.sampleSize), this.internalTrack.encryptionAuxInfo) {
				c(this.internalTrack.encryptionInfo);
				let t = await Ar(this.internalTrack.demuxer.reader, this.internalTrack.encryptionInfo, this.internalTrack.encryptionAuxInfo);
				e < t.length && (r = await jr(this.internalTrack, t[e], r, null));
			}
		}
		let i = (n.presentationTimestamp - this.internalTrack.editListOffset) / this.internalTrack.timescale, a = n.duration / this.internalTrack.timescale, o = new N(r, n.isKeyFrame ? "key" : "delta", i, a, e, n.sampleSize);
		return this.packetToSampleIndex.set(o, e), o;
	}
	async fetchPacketInFragment(e, t, n) {
		if (t === -1) return null;
		let r = e.trackData.get(this.internalTrack.id).samples[t];
		c(r);
		let i;
		if (n.metadataOnly) i = Qn;
		else {
			let t = this.internalTrack.demuxer.reader.requestSlice(r.byteOffset, r.byteSize);
			if (t instanceof Promise && (t = await t), !t) return null;
			i = V(t, r.byteSize), r.encryption && (i = await jr(this.internalTrack, r.encryption, i, e));
		}
		let a = (r.presentationTimestamp - this.internalTrack.editListOffset) / this.internalTrack.timescale, o = r.duration / this.internalTrack.timescale, s = new N(i, r.isKeyFrame ? "key" : "delta", a, o, e.moofOffset + t, r.byteSize);
		return this.packetToFragmentLocation.set(s, {
			fragment: e,
			sampleIndex: t
		}), s;
	}
	async performFragmentedLookup(e, t, n, r, i) {
		let a = this.internalTrack.demuxer, o = null, s = null, l = -1;
		if (e) {
			let { sampleIndex: n, correctSampleFound: r } = t(e);
			if (r) return this.fetchPacketInFragment(e, n, i);
			n !== -1 && (s = e, l = n);
		}
		let u = w(this.internalTrack.fragmentLookupTable, n, (e) => e.timestamp), d = u === -1 ? null : this.internalTrack.fragmentLookupTable[u], f = w(this.internalTrack.fragmentPositionCache, n, (e) => e.startTimestamp), p = f === -1 ? null : this.internalTrack.fragmentPositionCache[f], m = Math.max(d?.moofOffset ?? 0, p?.moofOffset ?? 0) || null, h;
		for (e ? m === null || e.moofOffset >= m ? (h = e.moofOffset + e.moofSize, o = e) : h = m : h = m ?? 0;;) {
			if (o) {
				let e = o.trackData.get(this.internalTrack.id);
				if (e && e.startTimestamp > r) break;
			}
			let e = a.reader.requestSliceRange(h, 8, 16);
			if (e instanceof Promise && (e = await e), !e) break;
			let n = h, c = nr(e);
			if (!c) break;
			if (c.name === "moof") {
				o = await a.readFragment(n);
				let { sampleIndex: e, correctSampleFound: r } = t(o);
				if (r) return this.fetchPacketInFragment(o, e, i);
				e !== -1 && (s = o, l = e);
			}
			h = n + c.totalSize;
		}
		if (d && (!s || s.moofOffset < d.moofOffset)) {
			let e = this.internalTrack.fragmentLookupTable[u - 1];
			c(!e || e.timestamp < d.timestamp);
			let n = e?.timestamp ?? -Infinity;
			return this.performFragmentedLookup(null, t, n, r, i);
		}
		return s ? this.fetchPacketInFragment(s, l, i) : null;
	}
}, br = class extends yr {
	constructor(e) {
		super(e), this.decoderConfigPromise = null, this.internalTrack = e;
	}
	getType() {
		return "video";
	}
	getCodec() {
		return this.internalTrack.info.codec;
	}
	getCodedWidth() {
		return this.internalTrack.info.width;
	}
	getCodedHeight() {
		return this.internalTrack.info.height;
	}
	getSquarePixelWidth() {
		return this.internalTrack.info.squarePixelWidth;
	}
	getSquarePixelHeight() {
		return this.internalTrack.info.squarePixelHeight;
	}
	getRotation() {
		return this.internalTrack.rotation;
	}
	async getColorSpace() {
		return {
			primaries: this.internalTrack.info.colorSpace?.primaries,
			transfer: this.internalTrack.info.colorSpace?.transfer,
			matrix: this.internalTrack.info.colorSpace?.matrix,
			fullRange: this.internalTrack.info.colorSpace?.fullRange
		};
	}
	async canBeTransparent() {
		return this.internalTrack.info.codec === "prores" && (this.internalTrack.info.proresFormat === "ap4h" || this.internalTrack.info.proresFormat === "ap4x");
	}
	async getDecoderConfig() {
		return this.internalTrack.info.codec ? this.decoderConfigPromise ??= (async () => {
			if (this.internalTrack.info.codec === "vp9" && !this.internalTrack.info.vp9CodecInfo) {
				let e = await this.getFirstPacket({});
				this.internalTrack.info.vp9CodecInfo = e && Mn(e.data);
			} else if (this.internalTrack.info.codec === "av1" && !this.internalTrack.info.av1CodecInfo) {
				let e = await this.getFirstPacket({});
				this.internalTrack.info.av1CodecInfo = e && Pn(e.data);
			}
			let e = {
				codec: Dt(this.internalTrack.info),
				codedWidth: this.internalTrack.info.width,
				codedHeight: this.internalTrack.info.height,
				description: this.internalTrack.info.codecDescription ?? void 0,
				colorSpace: this.internalTrack.info.colorSpace ?? void 0
			};
			return (this.internalTrack.info.width !== this.internalTrack.info.squarePixelWidth || this.internalTrack.info.height !== this.internalTrack.info.squarePixelHeight) && (e.displayAspectWidth = this.internalTrack.info.squarePixelWidth, e.displayAspectHeight = this.internalTrack.info.squarePixelHeight), e;
		})() : null;
	}
}, xr = class extends yr {
	constructor(e) {
		super(e), this.decoderConfig = null, this.internalTrack = e;
	}
	getType() {
		return "audio";
	}
	getCodec() {
		return this.internalTrack.info.codec;
	}
	getNumberOfChannels() {
		return this.internalTrack.info.numberOfChannels;
	}
	getSampleRate() {
		return this.internalTrack.info.sampleRate;
	}
	async getDecoderConfig() {
		return this.internalTrack.info.codec ? this.decoderConfig ??= {
			codec: kt(this.internalTrack.info),
			numberOfChannels: this.internalTrack.info.numberOfChannels,
			sampleRate: this.internalTrack.info.sampleRate,
			description: this.internalTrack.info.codecDescription ?? void 0
		} : null;
	}
}, Sr = (e, t) => {
	if (e.presentationTimestamps) {
		let n = w(e.presentationTimestamps, t, (e) => e.presentationTimestamp);
		return n === -1 ? -1 : e.presentationTimestamps[n].sampleIndex;
	} else {
		let n = w(e.sampleTimingEntries, t, (e) => e.startDecodeTimestamp);
		if (n === -1) return -1;
		let r = e.sampleTimingEntries[n];
		return r.startIndex + Math.min(Math.floor((t - r.startDecodeTimestamp) / r.delta), r.count - 1);
	}
}, Cr = (e, t) => {
	if (!e.keySampleIndices) return Sr(e, t);
	if (e.presentationTimestamps) {
		let n = w(e.presentationTimestamps, t, (e) => e.presentationTimestamp);
		if (n === -1) return -1;
		for (let t = n; t >= 0; t--) {
			let n = e.presentationTimestamps[t].sampleIndex;
			if (ce(e.keySampleIndices, n, (e) => e) !== -1) return n;
		}
		return -1;
	} else {
		let n = Sr(e, t), r = w(e.keySampleIndices, n, (e) => e);
		return e.keySampleIndices[r] ?? -1;
	}
}, wr = (e, t) => {
	let n = w(e.sampleTimingEntries, t, (e) => e.startIndex), r = e.sampleTimingEntries[n];
	if (!r || r.startIndex + r.count <= t) return null;
	let i = r.startDecodeTimestamp + (t - r.startIndex) * r.delta, a = w(e.sampleCompositionTimeOffsets, t, (e) => e.startIndex), o = e.sampleCompositionTimeOffsets[a];
	o && t - o.startIndex < o.count && (i += o.offset);
	let s = e.sampleSizes[Math.min(t, e.sampleSizes.length - 1)], l = w(e.sampleToChunk, t, (e) => e.startSampleIndex), u = e.sampleToChunk[l];
	c(u);
	let d = u.startChunkIndex + Math.floor((t - u.startSampleIndex) / u.samplesPerChunk), f = e.chunkOffsets[d], p = u.startSampleIndex + (d - u.startChunkIndex) * u.samplesPerChunk, m = 0, h = f;
	if (e.sampleSizes.length === 1) h += s * (t - p), m += s * u.samplesPerChunk;
	else for (let n = p; n < p + u.samplesPerChunk; n++) {
		let r = e.sampleSizes[n];
		n < t && (h += r), m += r;
	}
	let g = r.delta;
	if (e.presentationTimestamps) {
		let n = e.presentationTimestampIndexMap[t];
		c(n !== void 0), n < e.presentationTimestamps.length - 1 && (g = e.presentationTimestamps[n + 1].presentationTimestamp - i);
	}
	return {
		presentationTimestamp: i,
		duration: g,
		sampleOffset: h,
		sampleSize: s,
		chunkOffset: f,
		chunkSize: m,
		isKeyFrame: e.keySampleIndices ? ce(e.keySampleIndices, t, (e) => e) !== -1 : !0
	};
}, Tr = (e, t) => {
	if (!e.keySampleIndices) return t + 1;
	let n = w(e.keySampleIndices, t, (e) => e);
	return e.keySampleIndices[n + 1] ?? -1;
}, Er = (e, t) => {
	e.startTimestamp += t, e.endTimestamp += t;
	for (let n of e.samples) n.presentationTimestamp += t;
	for (let n of e.presentationTimestamps) n.presentationTimestamp += t;
}, Dr = (e) => {
	let [t, n] = e, r = Math.atan2(n, t);
	return Number.isFinite(r) ? 180 / Math.PI * r : 0;
}, Or = (e) => e.sampleSizes.length === 0, kr = (e) => e.currentFragmentState ? e.currentFragmentState.encryptionAuxInfo ??= {
	defaultSampleInfoSize: 0,
	sampleSizes: null,
	sampleCount: 0,
	offset: null,
	resolved: null
} : e.encryptionAuxInfo ??= {
	defaultSampleInfoSize: 0,
	sampleSizes: null,
	sampleCount: 0,
	offset: null,
	resolved: null
}, Ar = async (e, t, n) => {
	if (n.resolved) return n.resolved;
	if (n.offset === null || n.sampleCount === 0) throw Error("Incomplete saiz/saio info; cannot resolve encryption data.");
	let r = 0;
	if (n.defaultSampleInfoSize > 0) r = n.defaultSampleInfoSize * n.sampleCount;
	else {
		c(n.sampleSizes);
		for (let e = 0; e < n.sampleCount; e++) r += n.sampleSizes[e];
	}
	let i = e.requestSlice(n.offset, r);
	if (i instanceof Promise && (i = await i), !i) throw Error("Failed to read auxiliary encryption info.");
	let a = t.defaultPerSampleIvSize;
	c(a !== null);
	let o = [];
	for (let e = 0; e < n.sampleCount; e++) {
		let r = n.defaultSampleInfoSize > 0 ? n.defaultSampleInfoSize : n.sampleSizes[e], s = new Uint8Array(16);
		a > 0 ? s.set(V(i, a), 0) : s.set(t.defaultConstantIv, 0);
		let c = null;
		if (r > a) {
			let e = U(i);
			c = [];
			for (let t = 0; t < e; t++) {
				let e = U(i), t = W(i);
				c.push({
					clearLen: e,
					protectedLen: t
				});
			}
		}
		o.push({
			iv: s,
			subsamples: c
		});
	}
	return n.resolved = o, o;
}, jr = async (e, t, n, r) => {
	c(e.encryptionInfo);
	let i = e.encryptionInfo;
	c(i.defaultKid !== null);
	let a = i.defaultKid, o, s = e.demuxer.decryptionKeyCache.get(a);
	if (s) o = await s;
	else {
		if (!e.demuxer.input._formatOptions.isobmff?.resolveKeyId) throw Error("Encrypted media samples encountered. To decrypt them, please provide a callback for InputOptions.formatOptions.isobmff.resolveKeyId.");
		let t = (async () => {
			let t = e.demuxer.psshBoxes;
			if (r) {
				t = [...t, ...r.psshBoxes].filter((e) => e.keyIds === null || e.keyIds.includes(a));
				for (let e = 0; e < t.length - 1; e++) for (let n = e + 1; n < t.length; n++) tr(t[e], t[n]) && (t.splice(n, 1), n--);
			}
			let n = await e.demuxer.input._formatOptions.isobmff.resolveKeyId({
				keyId: a,
				psshBoxes: t
			});
			if (!(typeof n == "string" && n.length === 32 && ie.test(n) || n instanceof Uint8Array && n.byteLength === 16)) throw TypeError("resolveKeyId must return a 32-character hex string or a 16-byte Uint8Array containing the decryption key.");
			return n instanceof Uint8Array ? n : oe(n);
		})();
		e.demuxer.decryptionKeyCache.set(a, t), o = await t;
	}
	return i.scheme === "cenc" || i.scheme === "cens" ? Mr(o, i, t, n) : Nr(o, i, t, n);
}, Mr = async (e, t, n, r) => {
	let i = new Uint8Array(16);
	i.set(n.iv, 0);
	let a = await crypto.subtle.importKey("raw", e, { name: "AES-CTR" }, !1, ["decrypt"]), o = async (e) => {
		let t = await crypto.subtle.decrypt({
			name: "AES-CTR",
			counter: i,
			length: 64
		}, a, e);
		return new Uint8Array(t);
	};
	if (!n.subsamples) return o(r);
	c(t.defaultCryptByteBlock !== null && t.defaultSkipByteBlock !== null);
	let s = Pr(n.subsamples, t.defaultCryptByteBlock, t.defaultSkipByteBlock), l = 0;
	for (let e of s) for (let t of e.perSubsample) l += t.length;
	let u = new Uint8Array(l), d = 0;
	for (let e of s) for (let t of e.perSubsample) u.set(r.subarray(t.offset, t.offset + t.length), d), d += t.length;
	let f = await o(u), p = new Uint8Array(r), m = 0;
	for (let e of s) for (let t of e.perSubsample) p.set(f.subarray(m, m + t.length), t.offset), m += t.length;
	return p;
}, Nr = (e, t, n, r) => {
	let i = new gr();
	i.init({
		key: e,
		iv: n.iv
	});
	let a = t.defaultCryptByteBlock, o = t.defaultSkipByteBlock;
	if (c(a !== null && o !== null), !n.subsamples) {
		let e = new Uint8Array(r), t = Math.floor(r.length / 16);
		for (let n = 0; n < t; n++) {
			let t = n * 16;
			i.in.set(r.subarray(t, t + 16)), i.decrypt(), e.set(i.out, t);
		}
		return e;
	}
	if (a === 0 && o === 0) throw Error("cbcs with subsamples requires pattern encryption.");
	let s = new Uint8Array(r), l = Pr(n.subsamples, a, o), u = new DataView(n.iv.buffer, n.iv.byteOffset, 16);
	for (let e of l) {
		i.iv[0] = u.getUint32(0, !1), i.iv[1] = u.getUint32(4, !1), i.iv[2] = u.getUint32(8, !1), i.iv[3] = u.getUint32(12, !1);
		for (let t of e.perSubsample) {
			let e = t.length / 16;
			for (let n = 0; n < e; n++) {
				let e = t.offset + n * 16;
				i.in.set(r.subarray(e, e + 16)), i.decrypt(), s.set(i.out, e);
			}
		}
	}
	return s;
}, Pr = (e, t, n) => {
	let r = [], i = t !== 0 || n !== 0, a = 0;
	for (let o of e) {
		a += o.clearLen;
		let e = [];
		if (!i) o.protectedLen > 0 && e.push({
			offset: a,
			length: o.protectedLen
		}), a += o.protectedLen;
		else {
			let r = o.protectedLen, i = a;
			for (; r > 0 && !(r < 16 * t);) {
				let a = 16 * t;
				e.push({
					offset: i,
					length: a
				}), i += a, r -= a;
				let o = Math.min(16 * n, r);
				i += o, r -= o;
			}
			a += o.protectedLen;
		}
		r.push({ perSubsample: e });
	}
	return r;
}, F;
(function(e) {
	e[e.EBML = 440786851] = "EBML", e[e.EBMLVersion = 17030] = "EBMLVersion", e[e.EBMLReadVersion = 17143] = "EBMLReadVersion", e[e.EBMLMaxIDLength = 17138] = "EBMLMaxIDLength", e[e.EBMLMaxSizeLength = 17139] = "EBMLMaxSizeLength", e[e.DocType = 17026] = "DocType", e[e.DocTypeVersion = 17031] = "DocTypeVersion", e[e.DocTypeReadVersion = 17029] = "DocTypeReadVersion", e[e.Void = 236] = "Void", e[e.Segment = 408125543] = "Segment", e[e.SeekHead = 290298740] = "SeekHead", e[e.Seek = 19899] = "Seek", e[e.SeekID = 21419] = "SeekID", e[e.SeekPosition = 21420] = "SeekPosition", e[e.Duration = 17545] = "Duration", e[e.Info = 357149030] = "Info", e[e.TimestampScale = 2807729] = "TimestampScale", e[e.MuxingApp = 19840] = "MuxingApp", e[e.WritingApp = 22337] = "WritingApp", e[e.Tracks = 374648427] = "Tracks", e[e.TrackEntry = 174] = "TrackEntry", e[e.TrackNumber = 215] = "TrackNumber", e[e.TrackUID = 29637] = "TrackUID", e[e.TrackType = 131] = "TrackType", e[e.FlagEnabled = 185] = "FlagEnabled", e[e.FlagDefault = 136] = "FlagDefault", e[e.FlagForced = 21930] = "FlagForced", e[e.FlagOriginal = 21934] = "FlagOriginal", e[e.FlagHearingImpaired = 21931] = "FlagHearingImpaired", e[e.FlagVisualImpaired = 21932] = "FlagVisualImpaired", e[e.FlagCommentary = 21935] = "FlagCommentary", e[e.FlagLacing = 156] = "FlagLacing", e[e.Name = 21358] = "Name", e[e.Language = 2274716] = "Language", e[e.LanguageBCP47 = 2274717] = "LanguageBCP47", e[e.CodecID = 134] = "CodecID", e[e.CodecPrivate = 25506] = "CodecPrivate", e[e.CodecDelay = 22186] = "CodecDelay", e[e.SeekPreRoll = 22203] = "SeekPreRoll", e[e.DefaultDuration = 2352003] = "DefaultDuration", e[e.Video = 224] = "Video", e[e.PixelWidth = 176] = "PixelWidth", e[e.PixelHeight = 186] = "PixelHeight", e[e.DisplayWidth = 21680] = "DisplayWidth", e[e.DisplayHeight = 21690] = "DisplayHeight", e[e.DisplayUnit = 21682] = "DisplayUnit", e[e.AlphaMode = 21440] = "AlphaMode", e[e.Audio = 225] = "Audio", e[e.SamplingFrequency = 181] = "SamplingFrequency", e[e.Channels = 159] = "Channels", e[e.BitDepth = 25188] = "BitDepth", e[e.SimpleBlock = 163] = "SimpleBlock", e[e.BlockGroup = 160] = "BlockGroup", e[e.Block = 161] = "Block", e[e.BlockAdditions = 30113] = "BlockAdditions", e[e.BlockMore = 166] = "BlockMore", e[e.BlockAdditional = 165] = "BlockAdditional", e[e.BlockAddID = 238] = "BlockAddID", e[e.BlockDuration = 155] = "BlockDuration", e[e.ReferenceBlock = 251] = "ReferenceBlock", e[e.Cluster = 524531317] = "Cluster", e[e.Timestamp = 231] = "Timestamp", e[e.Cues = 475249515] = "Cues", e[e.CuePoint = 187] = "CuePoint", e[e.CueTime = 179] = "CueTime", e[e.CueTrackPositions = 183] = "CueTrackPositions", e[e.CueTrack = 247] = "CueTrack", e[e.CueClusterPosition = 241] = "CueClusterPosition", e[e.Colour = 21936] = "Colour", e[e.MatrixCoefficients = 21937] = "MatrixCoefficients", e[e.TransferCharacteristics = 21946] = "TransferCharacteristics", e[e.Primaries = 21947] = "Primaries", e[e.Range = 21945] = "Range", e[e.Projection = 30320] = "Projection", e[e.ProjectionType = 30321] = "ProjectionType", e[e.ProjectionPoseRoll = 30325] = "ProjectionPoseRoll", e[e.Attachments = 423732329] = "Attachments", e[e.AttachedFile = 24999] = "AttachedFile", e[e.FileDescription = 18046] = "FileDescription", e[e.FileName = 18030] = "FileName", e[e.FileMediaType = 18016] = "FileMediaType", e[e.FileData = 18012] = "FileData", e[e.FileUID = 18094] = "FileUID", e[e.Chapters = 272869232] = "Chapters", e[e.Tags = 307544935] = "Tags", e[e.Tag = 29555] = "Tag", e[e.Targets = 25536] = "Targets", e[e.TargetTypeValue = 26826] = "TargetTypeValue", e[e.TargetType = 25546] = "TargetType", e[e.TagTrackUID = 25541] = "TagTrackUID", e[e.TagEditionUID = 25545] = "TagEditionUID", e[e.TagChapterUID = 25540] = "TagChapterUID", e[e.TagAttachmentUID = 25542] = "TagAttachmentUID", e[e.SimpleTag = 26568] = "SimpleTag", e[e.TagName = 17827] = "TagName", e[e.TagLanguage = 17530] = "TagLanguage", e[e.TagString = 17543] = "TagString", e[e.TagBinary = 17541] = "TagBinary", e[e.ContentEncodings = 28032] = "ContentEncodings", e[e.ContentEncoding = 25152] = "ContentEncoding", e[e.ContentEncodingOrder = 20529] = "ContentEncodingOrder", e[e.ContentEncodingScope = 20530] = "ContentEncodingScope", e[e.ContentCompression = 20532] = "ContentCompression", e[e.ContentCompAlgo = 16980] = "ContentCompAlgo", e[e.ContentCompSettings = 16981] = "ContentCompSettings", e[e.ContentEncryption = 20533] = "ContentEncryption";
})(F ||= {});
var Fr = [F.EBML, F.Segment], Ir = [
	F.SeekHead,
	F.Info,
	F.Cluster,
	F.Tracks,
	F.Cues,
	F.Attachments,
	F.Chapters,
	F.Tags
], Lr = [...Fr, ...Ir], Rr = (e) => {
	if (e.remainingLength < 1) return null;
	let t = H(e);
	if (e.skip(-1), t === 0) return null;
	let n = 1, r = 128;
	for (; (t & r) === 0;) n++, r >>= 1;
	return e.remainingLength < n ? null : n;
}, zr = (e) => {
	if (e.remainingLength < 1) return null;
	let t = H(e);
	if (t === 0) return null;
	let n = 1, r = 128;
	for (; (t & r) === 0;) n++, r >>= 1;
	if (e.remainingLength < n - 1) return null;
	let i = t & r - 1;
	for (let t = 1; t < n; t++) i *= 256, i += H(e);
	return i;
}, I = (e, t) => {
	if (t < 1 || t > 8) throw Error("Bad unsigned int size " + t);
	let n = 0;
	for (let r = 0; r < t; r++) n *= 256, n += H(e);
	return n;
}, Br = (e, t) => {
	if (t < 1) throw Error("Bad unsigned int size " + t);
	let n = 0n;
	for (let r = 0; r < t; r++) n <<= 8n, n += BigInt(H(e));
	return n;
}, Vr = (e) => {
	let t = Rr(e);
	return t === null || e.remainingLength < t ? null : I(e, t);
}, Hr = (e) => {
	if (e.remainingLength < 1) return null;
	if (H(e) === 255) return;
	e.skip(-1);
	let t = zr(e);
	if (t === null) return null;
	if (t !== 72057594037927940) return t;
}, Ur = (e) => {
	c(e.remainingLength >= 2);
	let t = Vr(e);
	if (t === null) return null;
	let n = Hr(e);
	return n === null ? null : {
		id: t,
		size: n
	};
}, Wr = (e, t) => {
	let n = V(e, t), r = 0;
	for (; r < t && n[r] !== 0;) r += 1;
	return String.fromCharCode(...n.subarray(0, r));
}, Gr = (e, t) => {
	let n = V(e, t), r = 0;
	for (; r < t && n[r] !== 0;) r += 1;
	return g.decode(n.subarray(0, r));
}, Kr = (e, t) => {
	if (t === 0) return 0;
	if (t !== 4 && t !== 8) throw Error("Bad float size " + t);
	return t === 4 ? Ks(e) : qs(e);
}, qr = async (e, t, n, r) => {
	let i = new Set(n), a = t;
	for (; r === null || a < r;) {
		let t = e.requestSliceRange(a, 2, 16);
		if (t instanceof Promise && (t = await t), !t) break;
		let n = Ur(t);
		if (!n) break;
		if (i.has(n.id)) return {
			pos: a,
			found: !0
		};
		Xr(n.size), a = t.filePos + n.size;
	}
	return {
		pos: r !== null && r > a ? r : a,
		found: !1
	};
}, Jr = async (e, t, n, r) => {
	let i = 2 ** 16, a = new Set(n), o = t;
	for (; o < r;) {
		let t = e.requestSliceRange(o, 0, Math.min(i, r - o));
		if (t instanceof Promise && (t = await t), !t || t.length < 8) break;
		for (let e = 0; e < t.length - 8; e++) {
			t.filePos = o;
			let e = Vr(t);
			if (e !== null && a.has(e)) return o;
			o++;
		}
	}
	return null;
}, Yr = {
	avc: "V_MPEG4/ISO/AVC",
	hevc: "V_MPEGH/ISO/HEVC",
	vp8: "V_VP8",
	vp9: "V_VP9",
	av1: "V_AV1",
	prores: "V_PRORES",
	aac: "A_AAC",
	mp3: "A_MPEG/L3",
	opus: "A_OPUS",
	vorbis: "A_VORBIS",
	flac: "A_FLAC",
	ac3: "A_AC3",
	eac3: "A_EAC3",
	"pcm-u8": "A_PCM/INT/LIT",
	"pcm-s16": "A_PCM/INT/LIT",
	"pcm-s16be": "A_PCM/INT/BIG",
	"pcm-s24": "A_PCM/INT/LIT",
	"pcm-s24be": "A_PCM/INT/BIG",
	"pcm-s32": "A_PCM/INT/LIT",
	"pcm-s32be": "A_PCM/INT/BIG",
	"pcm-f32": "A_PCM/FLOAT/IEEE",
	"pcm-f64": "A_PCM/FLOAT/IEEE",
	webvtt: "S_TEXT/WEBVTT"
};
function Xr(e) {
	if (e === void 0) throw Error("Undefined element size is used in a place where it is not supported.");
}
//#endregion
//#region node_modules/mediabunny/dist/modules/src/matroska/matroska-misc.js
var Zr = (e) => {
	let t = (e.hasVideo ? "video/" : e.hasAudio ? "audio/" : "application/") + (e.isWebM ? "webm" : "x-matroska");
	if (e.codecStrings.length > 0) {
		let n = [...new Set(e.codecStrings.filter(Boolean))];
		t += `; codecs="${n.join(", ")}"`;
	}
	return t;
}, Qr;
(function(e) {
	e[e.None = 0] = "None", e[e.Xiph = 1] = "Xiph", e[e.FixedSize = 2] = "FixedSize", e[e.Ebml = 3] = "Ebml";
})(Qr ||= {});
var $r;
(function(e) {
	e[e.Block = 1] = "Block", e[e.Private = 2] = "Private", e[e.Next = 4] = "Next";
})($r ||= {});
var ei;
(function(e) {
	e[e.Zlib = 0] = "Zlib", e[e.Bzlib = 1] = "Bzlib", e[e.lzo1x = 2] = "lzo1x", e[e.HeaderStripping = 3] = "HeaderStripping";
})(ei ||= {});
var ti = [
	{
		id: F.SeekHead,
		flag: "seekHeadSeen"
	},
	{
		id: F.Info,
		flag: "infoSeen"
	},
	{
		id: F.Tracks,
		flag: "tracksSeen"
	},
	{
		id: F.Cues,
		flag: "cuesSeen"
	}
], ni = 10 * 2 ** 20, ri = class extends Zn {
	constructor(e) {
		super(e), this.readMetadataPromise = null, this.segments = [], this.currentSegment = null, this.currentTrack = null, this.currentCluster = null, this.currentBlock = null, this.currentBlockAdditional = null, this.currentCueTime = null, this.currentDecodingInstruction = null, this.currentTagTargetIsMovie = !0, this.currentSimpleTagName = null, this.currentAttachedFile = null, this.isWebM = !1, this.reader = e._reader;
	}
	async getTrackBackings() {
		return await this.readMetadata(), this.segments.flatMap((e) => e.tracks.map((e) => e.trackBacking));
	}
	async getMimeType() {
		await this.readMetadata();
		let e = await this.getTrackBackings(), t = await Promise.all(e.map((e) => e.getDecoderConfig().then((e) => e?.codec ?? null)));
		return Zr({
			isWebM: this.isWebM,
			hasVideo: this.segments.some((e) => e.tracks.some((e) => e.info?.type === "video")),
			hasAudio: this.segments.some((e) => e.tracks.some((e) => e.info?.type === "audio")),
			codecStrings: t.filter(Boolean)
		});
	}
	async getMetadataTags() {
		await this.readMetadata();
		for (let e of this.segments) e.metadataTagsCollected ||= (this.reader.fileSize !== null && await this.loadSegmentMetadata(e), !0);
		let e = {};
		for (let t of this.segments) e = {
			...e,
			...t.metadataTags
		};
		return e;
	}
	readMetadata() {
		return this.readMetadataPromise ??= (async () => {
			let e = 0;
			for (;;) {
				let t = this.reader.requestSliceRange(e, 2, 16);
				if (t instanceof Promise && (t = await t), !t) break;
				let n = Ur(t);
				if (!n) break;
				let r = n.id, i = n.size, a = t.filePos;
				if (r === F.EBML) {
					Xr(i);
					let e = this.reader.requestSlice(a, i);
					if (e instanceof Promise && (e = await e), !e) break;
					this.readContiguousElements(e);
				} else if (r === F.Segment) {
					if (await this.readSegment(a, i), i === void 0 || this.reader.fileSize === null) break;
				} else if (r === F.Cluster) {
					if (this.reader.fileSize === null) break;
					i === void 0 && (i = (await qr(this.reader, a, Lr, this.reader.fileSize)).pos - a);
					let e = u(this.segments);
					e && (e.elementEndPos = a + i);
				}
				Xr(i), e = a + i;
			}
		})();
	}
	async readSegment(e, t) {
		this.currentSegment = {
			seekHeadSeen: !1,
			infoSeen: !1,
			tracksSeen: !1,
			cuesSeen: !1,
			tagsSeen: !1,
			attachmentsSeen: !1,
			timestampScale: -1,
			timestampFactor: -1,
			duration: -1,
			seekEntries: [],
			tracks: [],
			cuePoints: [],
			dataStartPos: e,
			elementEndPos: t === void 0 ? null : e + t,
			clusterSeekStartPos: e,
			lastReadCluster: null,
			metadataTags: {},
			metadataTagsCollected: !1
		}, this.segments.push(this.currentSegment);
		let n = e;
		for (; this.currentSegment.elementEndPos === null || n < this.currentSegment.elementEndPos;) {
			let e = this.reader.requestSliceRange(n, 2, 16);
			if (e instanceof Promise && (e = await e), !e) break;
			let t = n, r = Ur(e);
			if (!r || !Ir.includes(r.id) && r.id !== F.Void) {
				let e = await Jr(this.reader, t, Ir, Math.min(this.currentSegment.elementEndPos ?? Infinity, t + ni));
				if (e) {
					n = e;
					continue;
				} else break;
			}
			let { id: i, size: a } = r, o = e.filePos, s = ti.findIndex((e) => e.id === i);
			if (s !== -1) {
				let e = ti[s].flag;
				this.currentSegment[e] = !0, Xr(a);
				let t = this.reader.requestSlice(o, a);
				t instanceof Promise && (t = await t), t && this.readContiguousElements(t);
			} else if (i === F.Tags || i === F.Attachments) {
				i === F.Tags ? this.currentSegment.tagsSeen = !0 : this.currentSegment.attachmentsSeen = !0, Xr(a);
				let e = this.reader.requestSlice(o, a);
				e instanceof Promise && (e = await e), e && this.readContiguousElements(e);
			} else if (i === F.Cluster) {
				this.currentSegment.clusterSeekStartPos = t;
				break;
			}
			if (a === void 0) break;
			n = o + a;
		}
		if (this.currentSegment.seekEntries.sort((e, t) => e.segmentPosition - t.segmentPosition), this.reader.fileSize !== null) for (let t of this.currentSegment.seekEntries) {
			let n = ti.find((e) => e.id === t.id);
			if (!n || this.currentSegment[n.flag]) continue;
			let r = this.reader.requestSliceRange(e + t.segmentPosition, 2, 16);
			if (r instanceof Promise && (r = await r), !r) continue;
			let i = Ur(r);
			if (!i) continue;
			let { id: a, size: o } = i;
			if (a !== n.id) continue;
			Xr(o), this.currentSegment[n.flag] = !0;
			let s = this.reader.requestSlice(r.filePos, o);
			s instanceof Promise && (s = await s), s && this.readContiguousElements(s);
		}
		this.currentSegment.timestampScale === -1 && (this.currentSegment.timestampScale = 1e6, this.currentSegment.timestampFactor = 1e9 / 1e6);
		for (let e of this.currentSegment.tracks) e.defaultDurationNs !== null && (e.defaultDuration = this.currentSegment.timestampFactor * e.defaultDurationNs / 1e9);
		let r = new Map(this.currentSegment.tracks.map((e) => [e.id, e]));
		for (let e of this.currentSegment.cuePoints) {
			let t = r.get(e.trackId);
			t && t.cuePoints.push(e);
		}
		for (let e of this.currentSegment.tracks) {
			e.cuePoints.sort((e, t) => e.time - t.time);
			for (let t = 0; t < e.cuePoints.length - 1; t++) {
				let n = e.cuePoints[t], r = e.cuePoints[t + 1];
				n.time === r.time && (e.cuePoints.splice(t + 1, 1), t--);
			}
		}
		let i = null, a = -Infinity;
		for (let e of this.currentSegment.tracks) e.cuePoints.length > a && (a = e.cuePoints.length, i = e);
		for (let e of this.currentSegment.tracks) e.cuePoints.length === 0 && (e.cuePoints = i.cuePoints);
		this.currentSegment = null;
	}
	async readCluster(e, t) {
		if (t.lastReadCluster?.elementStartPos === e) return t.lastReadCluster;
		let n = this.reader.requestSliceRange(e, 2, 16);
		n instanceof Promise && (n = await n), c(n);
		let r = e, i = Ur(n);
		c(i);
		let a = i.id;
		c(a === F.Cluster);
		let o = i.size, s = n.filePos;
		o === void 0 && (o = (await qr(this.reader, s, Lr, t.elementEndPos)).pos - s);
		let l = this.reader.requestSlice(s, o);
		l instanceof Promise && (l = await l);
		let d = {
			segment: t,
			elementStartPos: r,
			elementEndPos: s + o,
			dataStartPos: s,
			timestamp: -1,
			trackData: /* @__PURE__ */ new Map()
		};
		this.currentCluster = d, l && (d.elementEndPos = this.readContiguousElements(l, Lr));
		for (let [, e] of d.trackData) {
			let t = e.track;
			c(e.blocks.length > 0);
			let n = !1;
			for (let t = 0; t < e.blocks.length; t++) {
				let r = e.blocks[t];
				r.timestamp += d.timestamp, n ||= r.lacing !== Qr.None;
			}
			e.presentationTimestamps = e.blocks.map((e, t) => ({
				timestamp: e.timestamp,
				blockIndex: t
			})).sort((e, t) => e.timestamp - t.timestamp);
			for (let n = 0; n < e.presentationTimestamps.length; n++) {
				let r = e.presentationTimestamps[n], i = e.blocks[r.blockIndex];
				e.firstKeyFrameTimestamp === null && i.isKeyFrame && (e.firstKeyFrameTimestamp = i.timestamp), n < e.presentationTimestamps.length - 1 ? i.duration = e.presentationTimestamps[n + 1].timestamp - i.timestamp : i.duration === 0 && t.defaultDuration != null && i.lacing === Qr.None && (i.duration = t.defaultDuration);
			}
			n && (this.expandLacedBlocks(e.blocks, t), e.presentationTimestamps = e.blocks.map((e, t) => ({
				timestamp: e.timestamp,
				blockIndex: t
			})).sort((e, t) => e.timestamp - t.timestamp));
			let i = e.blocks[e.presentationTimestamps[0].blockIndex], a = e.blocks[u(e.presentationTimestamps).blockIndex];
			e.startTimestamp = i.timestamp, e.endTimestamp = a.timestamp + a.duration;
			let o = w(t.clusterPositionCache, e.startTimestamp, (e) => e.startTimestamp);
			(o === -1 || t.clusterPositionCache[o].elementStartPos !== r) && t.clusterPositionCache.splice(o + 1, 0, {
				elementStartPos: d.elementStartPos,
				startTimestamp: e.startTimestamp
			});
		}
		return t.lastReadCluster = d, d;
	}
	getTrackDataInCluster(e, t) {
		let n = e.trackData.get(t);
		if (!n) {
			let r = e.segment.tracks.find((e) => e.id === t);
			if (!r) return null;
			n = {
				track: r,
				startTimestamp: 0,
				endTimestamp: 0,
				firstKeyFrameTimestamp: null,
				blocks: [],
				presentationTimestamps: []
			}, e.trackData.set(t, n);
		}
		return n;
	}
	expandLacedBlocks(e, t) {
		for (let n = 0; n < e.length; n++) {
			let r = e[n];
			if (r.lacing === Qr.None) continue;
			r.decoded ||= (r.data = this.decodeBlockData(t, r.data), !0);
			let i = Ps.tempFromBytes(r.data), a = [], o = H(i) + 1;
			switch (r.lacing) {
				case Qr.Xiph:
					{
						let e = 0;
						for (let t = 0; t < o - 1; t++) {
							let t = 0;
							for (; i.bufferPos < i.length;) {
								let n = H(i);
								if (t += n, n < 255) {
									a.push(t), e += t;
									break;
								}
							}
						}
						a.push(i.length - (i.bufferPos + e));
					}
					break;
				case Qr.FixedSize:
					{
						let e = i.length - 1, t = Math.floor(e / o);
						for (let e = 0; e < o; e++) a.push(t);
					}
					break;
				case Qr.Ebml:
					{
						let e = zr(i);
						c(e !== null);
						let t = e;
						a.push(t);
						let n = t;
						for (let e = 1; e < o - 1; e++) {
							let e = i.bufferPos, r = zr(i);
							c(r !== null);
							let o = r - ((1 << (i.bufferPos - e) * 7 - 1) - 1);
							t += o, a.push(t), n += t;
						}
						a.push(i.length - (i.bufferPos + n));
					}
					break;
				default: c(!1);
			}
			c(a.length === o), e.splice(n, 1);
			let s = r.duration || o * (t.defaultDuration ?? 0);
			for (let t = 0; t < o; t++) {
				let c = a[t], l = V(i, c), u = r.timestamp + s * t / o, d = s / o;
				e.splice(n + t, 0, {
					timestamp: u,
					duration: d,
					isKeyFrame: r.isKeyFrame,
					data: l,
					lacing: Qr.None,
					decoded: !0,
					postProcessed: !1,
					mainAdditional: r.mainAdditional
				});
			}
			n += o, n--;
		}
	}
	async loadSegmentMetadata(e) {
		for (let t of e.seekEntries) {
			if (!(t.id === F.Tags && !e.tagsSeen) && !(t.id === F.Attachments && !e.attachmentsSeen)) continue;
			let n = this.reader.requestSliceRange(e.dataStartPos + t.segmentPosition, 2, 16);
			if (n instanceof Promise && (n = await n), !n) continue;
			let r = Ur(n);
			if (!r || r.id !== t.id) continue;
			let { size: i } = r;
			Xr(i), c(!this.currentSegment), this.currentSegment = e;
			let a = this.reader.requestSlice(n.filePos, i);
			a instanceof Promise && (a = await a), a && this.readContiguousElements(a), this.currentSegment = null, t.id === F.Tags ? e.tagsSeen = !0 : t.id === F.Attachments && (e.attachmentsSeen = !0);
		}
	}
	readContiguousElements(e, t) {
		for (; e.remainingLength >= 2;) {
			let n = e.filePos;
			if (!this.traverseElement(e, t)) return n;
		}
		return e.filePos;
	}
	traverseElement(e, t) {
		let n = Ur(e);
		if (!n || t && t.includes(n.id)) return !1;
		let { id: r, size: i } = n, a = e.filePos;
		switch (Xr(i), r) {
			case F.DocType:
				this.isWebM = Wr(e, i) === "webm";
				break;
			case F.Seek:
				{
					if (!this.currentSegment) break;
					let t = {
						id: -1,
						segmentPosition: -1
					};
					this.currentSegment.seekEntries.push(t), this.readContiguousElements(e.slice(a, i)), (t.id === -1 || t.segmentPosition === -1) && this.currentSegment.seekEntries.pop();
				}
				break;
			case F.SeekID:
				{
					let t = this.currentSegment?.seekEntries[this.currentSegment.seekEntries.length - 1];
					if (!t) break;
					t.id = I(e, i);
				}
				break;
			case F.SeekPosition:
				{
					let t = this.currentSegment?.seekEntries[this.currentSegment.seekEntries.length - 1];
					if (!t) break;
					t.segmentPosition = I(e, i);
				}
				break;
			case F.TimestampScale:
				if (!this.currentSegment) break;
				this.currentSegment.timestampScale = I(e, i), this.currentSegment.timestampFactor = 1e9 / this.currentSegment.timestampScale;
				break;
			case F.Duration:
				if (!this.currentSegment) break;
				this.currentSegment.duration = Kr(e, i);
				break;
			case F.TrackEntry:
				if (!this.currentSegment || (this.currentTrack = {
					id: -1,
					segment: this.currentSegment,
					demuxer: this,
					clusterPositionCache: [],
					cuePoints: [],
					disposition: {
						...st,
						primary: !1
					},
					trackBacking: null,
					codecId: null,
					codecPrivate: null,
					defaultDuration: null,
					defaultDurationNs: null,
					name: null,
					languageCode: "eng",
					hasLanguageBcp47: !1,
					decodingInstructions: [],
					info: null
				}, this.readContiguousElements(e.slice(a, i)), !this.currentTrack)) break;
				if (this.currentTrack.decodingInstructions.some((e) => e.data?.type !== "decompress" || e.scope !== $r.Block || e.data.algorithm !== ei.HeaderStripping) && (D._warn(`Track #${this.currentTrack.id} has an unsupported content encoding; dropping.`), this.currentTrack = null), this.currentTrack && this.currentTrack.id !== -1 && this.currentTrack.codecId && this.currentTrack.info) {
					let e = this.currentTrack.codecId.indexOf("/"), t = e === -1 ? this.currentTrack.codecId : this.currentTrack.codecId.slice(0, e);
					if (this.currentTrack.info.type === "video" && this.currentTrack.info.width !== -1 && this.currentTrack.info.height !== -1) {
						if (this.currentTrack.info.squarePixelWidth = this.currentTrack.info.width, this.currentTrack.info.squarePixelHeight = this.currentTrack.info.height, this.currentTrack.info.displayWidth !== null && this.currentTrack.info.displayHeight !== null) {
							let e = this.currentTrack.info.displayWidth * this.currentTrack.info.height, t = this.currentTrack.info.displayHeight * this.currentTrack.info.width;
							e > 0 && t > 0 && (e > t ? this.currentTrack.info.squarePixelWidth = Math.round(this.currentTrack.info.width * e / t) : this.currentTrack.info.squarePixelHeight = Math.round(this.currentTrack.info.height * t / e));
						}
						if (this.currentTrack.codecId === Yr.avc) this.currentTrack.info.codec = "avc", this.currentTrack.info.codecDescription = this.currentTrack.codecPrivate;
						else if (this.currentTrack.codecId === Yr.hevc) this.currentTrack.info.codec = "hevc", this.currentTrack.info.codecDescription = this.currentTrack.codecPrivate;
						else if (t === Yr.vp8) this.currentTrack.info.codec = "vp8";
						else if (t === Yr.vp9) this.currentTrack.info.codec = "vp9";
						else if (t === Yr.av1) this.currentTrack.info.codec = "av1";
						else if (t === Yr.prores) {
							let e = this.currentTrack.codecPrivate ? g.decode(this.currentTrack.codecPrivate) : "";
							Ct.includes(e) && (this.currentTrack.info.codec = "prores", this.currentTrack.info.proresFormat = e);
						}
						let e = this.currentTrack;
						this.currentTrack.trackBacking = new ai(e), this.currentSegment.tracks.push(this.currentTrack);
					} else if (this.currentTrack.info.type === "audio") {
						t === Yr.aac ? (this.currentTrack.info.codec = "aac", this.currentTrack.info.aacCodecInfo = {
							isMpeg2: this.currentTrack.codecId.includes("MPEG2"),
							objectType: null
						}, this.currentTrack.info.codecDescription = this.currentTrack.codecPrivate) : this.currentTrack.codecId === Yr.mp3 ? this.currentTrack.info.codec = "mp3" : t === Yr.opus ? (this.currentTrack.info.codec = "opus", this.currentTrack.info.codecDescription = this.currentTrack.codecPrivate, this.currentTrack.info.sampleRate = At) : t === Yr.vorbis ? (this.currentTrack.info.codec = "vorbis", this.currentTrack.info.codecDescription = this.currentTrack.codecPrivate) : t === Yr.flac ? (this.currentTrack.info.codec = "flac", this.currentTrack.info.codecDescription = this.currentTrack.codecPrivate) : t === Yr.ac3 ? (this.currentTrack.info.codec = "ac3", this.currentTrack.info.codecDescription = this.currentTrack.codecPrivate) : t === Yr.eac3 ? (this.currentTrack.info.codec = "eac3", this.currentTrack.info.codecDescription = this.currentTrack.codecPrivate) : this.currentTrack.codecId === "A_PCM/INT/LIT" ? this.currentTrack.info.bitDepth === 8 ? this.currentTrack.info.codec = "pcm-u8" : this.currentTrack.info.bitDepth === 16 ? this.currentTrack.info.codec = "pcm-s16" : this.currentTrack.info.bitDepth === 24 ? this.currentTrack.info.codec = "pcm-s24" : this.currentTrack.info.bitDepth === 32 && (this.currentTrack.info.codec = "pcm-s32") : this.currentTrack.codecId === "A_PCM/INT/BIG" ? this.currentTrack.info.bitDepth === 8 ? this.currentTrack.info.codec = "pcm-u8" : this.currentTrack.info.bitDepth === 16 ? this.currentTrack.info.codec = "pcm-s16be" : this.currentTrack.info.bitDepth === 24 ? this.currentTrack.info.codec = "pcm-s24be" : this.currentTrack.info.bitDepth === 32 && (this.currentTrack.info.codec = "pcm-s32be") : this.currentTrack.codecId === "A_PCM/FLOAT/IEEE" && (this.currentTrack.info.bitDepth === 32 ? this.currentTrack.info.codec = "pcm-f32" : this.currentTrack.info.bitDepth === 64 && (this.currentTrack.info.codec = "pcm-f64"));
						let e = this.currentTrack;
						this.currentTrack.trackBacking = new oi(e), this.currentSegment.tracks.push(this.currentTrack);
					}
				}
				this.currentTrack = null;
				break;
			case F.TrackNumber:
				if (!this.currentTrack) break;
				this.currentTrack.id = I(e, i);
				break;
			case F.TrackType:
				{
					if (!this.currentTrack) break;
					let t = I(e, i);
					t === 1 ? this.currentTrack.info = {
						type: "video",
						width: -1,
						height: -1,
						displayWidth: null,
						displayHeight: null,
						displayUnit: null,
						squarePixelWidth: -1,
						squarePixelHeight: -1,
						rotation: 0,
						codec: null,
						codecDescription: null,
						colorSpace: null,
						alphaMode: !1,
						proresFormat: null
					} : t === 2 && (this.currentTrack.info = {
						type: "audio",
						numberOfChannels: 1,
						sampleRate: 8e3,
						bitDepth: -1,
						codec: null,
						codecDescription: null,
						aacCodecInfo: null
					});
				}
				break;
			case F.FlagEnabled:
				if (!this.currentTrack) break;
				I(e, i) || (this.currentTrack = null);
				break;
			case F.FlagDefault:
				if (!this.currentTrack) break;
				this.currentTrack.disposition.default = !!I(e, i);
				break;
			case F.FlagForced:
				if (!this.currentTrack) break;
				this.currentTrack.disposition.forced = !!I(e, i);
				break;
			case F.FlagOriginal:
				if (!this.currentTrack) break;
				this.currentTrack.disposition.original = !!I(e, i);
				break;
			case F.FlagHearingImpaired:
				if (!this.currentTrack) break;
				this.currentTrack.disposition.hearingImpaired = !!I(e, i);
				break;
			case F.FlagVisualImpaired:
				if (!this.currentTrack) break;
				this.currentTrack.disposition.visuallyImpaired = !!I(e, i);
				break;
			case F.FlagCommentary:
				if (!this.currentTrack) break;
				this.currentTrack.disposition.commentary = !!I(e, i);
				break;
			case F.CodecID:
				if (!this.currentTrack) break;
				this.currentTrack.codecId = Wr(e, i);
				break;
			case F.CodecPrivate:
				if (!this.currentTrack) break;
				this.currentTrack.codecPrivate = V(e, i);
				break;
			case F.DefaultDuration:
				if (!this.currentTrack) break;
				this.currentTrack.defaultDurationNs = I(e, i);
				break;
			case F.Name:
				if (!this.currentTrack) break;
				this.currentTrack.name = Gr(e, i);
				break;
			case F.Language:
				if (!this.currentTrack || this.currentTrack.hasLanguageBcp47) break;
				this.currentTrack.languageCode = Wr(e, i), ke(this.currentTrack.languageCode) || (this.currentTrack.languageCode = "und");
				break;
			case F.LanguageBCP47:
				{
					if (!this.currentTrack) break;
					let t = Wr(e, i).split("-")[0];
					t ? this.currentTrack.languageCode = t : this.currentTrack.languageCode = "und", this.currentTrack.hasLanguageBcp47 = !0;
				}
				break;
			case F.Video:
				if (this.currentTrack?.info?.type !== "video") break;
				this.readContiguousElements(e.slice(a, i));
				break;
			case F.PixelWidth:
				if (this.currentTrack?.info?.type !== "video") break;
				this.currentTrack.info.width = I(e, i);
				break;
			case F.PixelHeight:
				if (this.currentTrack?.info?.type !== "video") break;
				this.currentTrack.info.height = I(e, i);
				break;
			case F.DisplayWidth:
				if (this.currentTrack?.info?.type !== "video") break;
				this.currentTrack.info.displayWidth = I(e, i);
				break;
			case F.DisplayHeight:
				if (this.currentTrack?.info?.type !== "video") break;
				this.currentTrack.info.displayHeight = I(e, i);
				break;
			case F.DisplayUnit:
				if (this.currentTrack?.info?.type !== "video") break;
				this.currentTrack.info.displayUnit = I(e, i);
				break;
			case F.AlphaMode:
				if (this.currentTrack?.info?.type !== "video") break;
				this.currentTrack.info.alphaMode = I(e, i) === 1;
				break;
			case F.Colour:
				if (this.currentTrack?.info?.type !== "video") break;
				this.currentTrack.info.colorSpace = {}, this.readContiguousElements(e.slice(a, i));
				break;
			case F.MatrixCoefficients:
				{
					if (this.currentTrack?.info?.type !== "video" || !this.currentTrack.info.colorSpace) break;
					let t = ee[I(e, i)] ?? null;
					this.currentTrack.info.colorSpace.matrix = t;
				}
				break;
			case F.Range:
				if (this.currentTrack?.info?.type !== "video" || !this.currentTrack.info.colorSpace) break;
				this.currentTrack.info.colorSpace.fullRange = I(e, i) === 2;
				break;
			case F.TransferCharacteristics:
				{
					if (this.currentTrack?.info?.type !== "video" || !this.currentTrack.info.colorSpace) break;
					let t = S[I(e, i)] ?? null;
					this.currentTrack.info.colorSpace.transfer = t;
				}
				break;
			case F.Primaries:
				{
					if (this.currentTrack?.info?.type !== "video" || !this.currentTrack.info.colorSpace) break;
					let t = b[I(e, i)] ?? null;
					this.currentTrack.info.colorSpace.primaries = t;
				}
				break;
			case F.Projection:
				if (this.currentTrack?.info?.type !== "video") break;
				this.readContiguousElements(e.slice(a, i));
				break;
			case F.ProjectionPoseRoll:
				{
					if (this.currentTrack?.info?.type !== "video") break;
					let t = -Kr(e, i);
					try {
						this.currentTrack.info.rotation = l(t);
					} catch {}
				}
				break;
			case F.Audio:
				if (this.currentTrack?.info?.type !== "audio") break;
				this.readContiguousElements(e.slice(a, i));
				break;
			case F.SamplingFrequency:
				if (this.currentTrack?.info?.type !== "audio") break;
				this.currentTrack.info.sampleRate = Kr(e, i);
				break;
			case F.Channels:
				if (this.currentTrack?.info?.type !== "audio") break;
				this.currentTrack.info.numberOfChannels = I(e, i);
				break;
			case F.BitDepth:
				if (this.currentTrack?.info?.type !== "audio") break;
				this.currentTrack.info.bitDepth = I(e, i);
				break;
			case F.CuePoint:
				if (!this.currentSegment) break;
				this.readContiguousElements(e.slice(a, i)), this.currentCueTime = null;
				break;
			case F.CueTime:
				this.currentCueTime = I(e, i);
				break;
			case F.CueTrackPositions:
				{
					if (this.currentCueTime === null) break;
					c(this.currentSegment);
					let t = {
						time: this.currentCueTime,
						trackId: -1,
						clusterPosition: -1
					};
					this.currentSegment.cuePoints.push(t), this.readContiguousElements(e.slice(a, i)), (t.trackId === -1 || t.clusterPosition === -1) && this.currentSegment.cuePoints.pop();
				}
				break;
			case F.CueTrack:
				{
					let t = this.currentSegment?.cuePoints[this.currentSegment.cuePoints.length - 1];
					if (!t) break;
					t.trackId = I(e, i);
				}
				break;
			case F.CueClusterPosition:
				{
					let t = this.currentSegment?.cuePoints[this.currentSegment.cuePoints.length - 1];
					if (!t) break;
					c(this.currentSegment), t.clusterPosition = this.currentSegment.dataStartPos + I(e, i);
				}
				break;
			case F.Timestamp:
				if (!this.currentCluster) break;
				this.currentCluster.timestamp = I(e, i);
				break;
			case F.SimpleBlock:
				{
					if (!this.currentCluster) break;
					let t = zr(e);
					if (t === null) break;
					let n = this.getTrackDataInCluster(this.currentCluster, t);
					if (!n) break;
					let r = Ls(e), o = H(e), s = o >> 1 & 3, c = !!(o & 128);
					n.track.info?.type === "audio" && n.track.info.codec && (c = !0);
					let l = V(e, i - (e.filePos - a)), u = n.track.decodingInstructions.length > 0;
					n.blocks.push({
						timestamp: r,
						duration: 0,
						isKeyFrame: c,
						data: l,
						lacing: s,
						decoded: !u,
						postProcessed: !1,
						mainAdditional: null
					});
				}
				break;
			case F.BlockGroup:
				if (!this.currentCluster) break;
				this.readContiguousElements(e.slice(a, i)), this.currentBlock = null;
				break;
			case F.Block:
				{
					if (!this.currentCluster) break;
					let t = zr(e);
					if (t === null) break;
					let n = this.getTrackDataInCluster(this.currentCluster, t);
					if (!n) break;
					let r = Ls(e), o = H(e) >> 1 & 3, s = V(e, i - (e.filePos - a)), c = n.track.decodingInstructions.length > 0;
					this.currentBlock = {
						timestamp: r,
						duration: 0,
						isKeyFrame: !0,
						data: s,
						lacing: o,
						decoded: !c,
						postProcessed: !1,
						mainAdditional: null
					}, n.blocks.push(this.currentBlock);
				}
				break;
			case F.BlockAdditions:
				this.readContiguousElements(e.slice(a, i));
				break;
			case F.BlockMore:
				if (!this.currentBlock) break;
				this.currentBlockAdditional = {
					addId: 1,
					data: null
				}, this.readContiguousElements(e.slice(a, i)), this.currentBlockAdditional.data && this.currentBlockAdditional.addId === 1 && (this.currentBlock.mainAdditional = this.currentBlockAdditional.data), this.currentBlockAdditional = null;
				break;
			case F.BlockAdditional:
				if (!this.currentBlockAdditional) break;
				this.currentBlockAdditional.data = V(e, i);
				break;
			case F.BlockAddID:
				if (!this.currentBlockAdditional) break;
				this.currentBlockAdditional.addId = I(e, i);
				break;
			case F.BlockDuration:
				if (!this.currentBlock) break;
				this.currentBlock.duration = I(e, i);
				break;
			case F.ReferenceBlock:
				if (!this.currentBlock) break;
				this.currentBlock.isKeyFrame = !1;
				break;
			case F.Tag:
				this.currentTagTargetIsMovie = !0, this.readContiguousElements(e.slice(a, i));
				break;
			case F.Targets:
				this.readContiguousElements(e.slice(a, i));
				break;
			case F.TargetTypeValue:
				I(e, i) !== 50 && (this.currentTagTargetIsMovie = !1);
				break;
			case F.TagTrackUID:
			case F.TagEditionUID:
			case F.TagChapterUID:
			case F.TagAttachmentUID:
				this.currentTagTargetIsMovie = !1;
				break;
			case F.SimpleTag:
				if (!this.currentTagTargetIsMovie) break;
				this.currentSimpleTagName = null, this.readContiguousElements(e.slice(a, i));
				break;
			case F.TagName:
				this.currentSimpleTagName = Gr(e, i);
				break;
			case F.TagString:
				{
					if (!this.currentSimpleTagName) break;
					let t = Gr(e, i);
					this.processTagValue(this.currentSimpleTagName, t);
				}
				break;
			case F.TagBinary:
				{
					if (!this.currentSimpleTagName) break;
					let t = V(e, i);
					this.processTagValue(this.currentSimpleTagName, t);
				}
				break;
			case F.AttachedFile:
				{
					if (!this.currentSegment) break;
					this.currentAttachedFile = {
						fileUid: null,
						fileName: null,
						fileMediaType: null,
						fileData: null,
						fileDescription: null
					}, this.readContiguousElements(e.slice(a, i));
					let t = this.currentSegment.metadataTags;
					if (this.currentAttachedFile.fileUid && this.currentAttachedFile.fileData && (t.raw ??= {}, t.raw[this.currentAttachedFile.fileUid.toString()] = new at(this.currentAttachedFile.fileData, this.currentAttachedFile.fileMediaType ?? void 0, this.currentAttachedFile.fileName ?? void 0, this.currentAttachedFile.fileDescription ?? void 0)), this.currentAttachedFile.fileMediaType?.startsWith("image/") && this.currentAttachedFile.fileData) {
						let e = this.currentAttachedFile.fileName, n = "unknown";
						if (e) {
							let t = e.toLowerCase();
							t.startsWith("cover.") ? n = "coverFront" : t.startsWith("back.") && (n = "coverBack");
						}
						t.images ??= [], t.images.push({
							data: this.currentAttachedFile.fileData,
							mimeType: this.currentAttachedFile.fileMediaType,
							kind: n,
							name: this.currentAttachedFile.fileName ?? void 0,
							description: this.currentAttachedFile.fileDescription ?? void 0
						});
					}
					this.currentAttachedFile = null;
				}
				break;
			case F.FileUID:
				if (!this.currentAttachedFile) break;
				this.currentAttachedFile.fileUid = Br(e, i);
				break;
			case F.FileName:
				if (!this.currentAttachedFile) break;
				this.currentAttachedFile.fileName = Gr(e, i);
				break;
			case F.FileMediaType:
				if (!this.currentAttachedFile) break;
				this.currentAttachedFile.fileMediaType = Wr(e, i);
				break;
			case F.FileData:
				if (!this.currentAttachedFile) break;
				this.currentAttachedFile.fileData = V(e, i);
				break;
			case F.FileDescription:
				if (!this.currentAttachedFile) break;
				this.currentAttachedFile.fileDescription = Gr(e, i);
				break;
			case F.ContentEncodings:
				if (!this.currentTrack) break;
				this.readContiguousElements(e.slice(a, i)), this.currentTrack.decodingInstructions.sort((e, t) => t.order - e.order);
				break;
			case F.ContentEncoding:
				this.currentDecodingInstruction = {
					order: 0,
					scope: $r.Block,
					data: null
				}, this.readContiguousElements(e.slice(a, i)), this.currentDecodingInstruction.data && this.currentTrack.decodingInstructions.push(this.currentDecodingInstruction), this.currentDecodingInstruction = null;
				break;
			case F.ContentEncodingOrder:
				if (!this.currentDecodingInstruction) break;
				this.currentDecodingInstruction.order = I(e, i);
				break;
			case F.ContentEncodingScope:
				if (!this.currentDecodingInstruction) break;
				this.currentDecodingInstruction.scope = I(e, i);
				break;
			case F.ContentCompression:
				if (!this.currentDecodingInstruction) break;
				this.currentDecodingInstruction.data = {
					type: "decompress",
					algorithm: ei.Zlib,
					settings: null
				}, this.readContiguousElements(e.slice(a, i));
				break;
			case F.ContentCompAlgo:
				if (this.currentDecodingInstruction?.data?.type !== "decompress") break;
				this.currentDecodingInstruction.data.algorithm = I(e, i);
				break;
			case F.ContentCompSettings:
				if (this.currentDecodingInstruction?.data?.type !== "decompress") break;
				this.currentDecodingInstruction.data.settings = V(e, i);
				break;
			case F.ContentEncryption:
				if (!this.currentDecodingInstruction) break;
				this.currentDecodingInstruction.data = { type: "decrypt" };
				break;
		}
		return e.filePos = a + i, !0;
	}
	decodeBlockData(e, t) {
		c(e.decodingInstructions.length > 0);
		let n = t;
		for (let t of e.decodingInstructions) switch (c(t.data), t.data.type) {
			case "decompress":
				switch (t.data.algorithm) {
					case ei.HeaderStripping:
						if (t.data.settings && t.data.settings.length > 0) {
							let e = t.data.settings, r = new Uint8Array(e.length + n.length);
							r.set(e, 0), r.set(n, e.length), n = r;
						}
						break;
					default:
				}
				break;
			default:
		}
		return n;
	}
	processTagValue(e, t) {
		if (!this.currentSegment?.metadataTags) return;
		let n = this.currentSegment.metadataTags;
		if (n.raw ??= {}, n.raw[e] ??= t, typeof t == "string") switch (e.toLowerCase()) {
			case "title":
				n.title ??= t;
				break;
			case "description":
				n.description ??= t;
				break;
			case "artist":
				n.artist ??= t;
				break;
			case "album":
				n.album ??= t;
				break;
			case "album_artist":
				n.albumArtist ??= t;
				break;
			case "genre":
				n.genre ??= t;
				break;
			case "comment":
				n.comment ??= t;
				break;
			case "lyrics":
				n.lyrics ??= t;
				break;
			case "date":
				{
					let e = new Date(t);
					Number.isNaN(e.getTime()) || (n.date ??= e);
				}
				break;
			case "track_number":
			case "part_number":
				{
					let e = t.split("/"), r = Number.parseInt(e[0], 10), i = e[1] && Number.parseInt(e[1], 10);
					Number.isInteger(r) && r > 0 && (n.trackNumber ??= r), i && Number.isInteger(i) && i > 0 && (n.tracksTotal ??= i);
				}
				break;
			case "disc_number":
			case "disc":
				{
					let e = t.split("/"), r = Number.parseInt(e[0], 10), i = e[1] && Number.parseInt(e[1], 10);
					Number.isInteger(r) && r > 0 && (n.discNumber ??= r), i && Number.isInteger(i) && i > 0 && (n.discsTotal ??= i);
				}
				break;
		}
	}
}, ii = class {
	constructor(e) {
		this.internalTrack = e, this.packetToClusterLocation = /* @__PURE__ */ new WeakMap();
	}
	getId() {
		return this.internalTrack.id;
	}
	getNumber() {
		let e = this.internalTrack.demuxer, t = this.internalTrack.trackBacking.getType(), n = 0;
		for (let r of e.segments) for (let e of r.tracks) if (e.trackBacking.getType() === t && n++, e === this.internalTrack) break;
		return n;
	}
	getCodec() {
		throw Error("Not implemented on base class.");
	}
	getInternalCodecId() {
		return this.internalTrack.codecId;
	}
	getName() {
		return this.internalTrack.name;
	}
	getLanguageCode() {
		return this.internalTrack.languageCode;
	}
	getTimeResolution() {
		return this.internalTrack.segment.timestampFactor;
	}
	isRelativeToUnixEpoch() {
		return !1;
	}
	getUnixTimeForTimestamp() {
		return null;
	}
	getDisposition() {
		return this.internalTrack.disposition;
	}
	getPairingMask() {
		return 1n;
	}
	getBitrate() {
		return null;
	}
	getAverageBitrate() {
		return null;
	}
	async getDurationFromMetadata() {
		let e = this.internalTrack.segment;
		if (e.duration <= 0) return null;
		let t = e.duration / e.timestampFactor, n = await this.getFirstPacket({ metadataOnly: !0 });
		return t += n?.timestamp ?? 0, t;
	}
	async getLiveRefreshInterval() {
		return null;
	}
	async getFirstPacket(e) {
		return this.performClusterLookup(null, (e) => e.trackData.get(this.internalTrack.id) ? {
			blockIndex: 0,
			correctBlockFound: !0
		} : {
			blockIndex: -1,
			correctBlockFound: !1
		}, -Infinity, Infinity, e);
	}
	intoTimescale(e) {
		return Se(e * this.internalTrack.segment.timestampFactor);
	}
	async getPacket(e, t) {
		let n = this.intoTimescale(e);
		return this.performClusterLookup(null, (e) => {
			let t = e.trackData.get(this.internalTrack.id);
			if (!t) return {
				blockIndex: -1,
				correctBlockFound: !1
			};
			let r = w(t.presentationTimestamps, n, (e) => e.timestamp);
			return {
				blockIndex: r === -1 ? -1 : t.presentationTimestamps[r].blockIndex,
				correctBlockFound: r !== -1 && n < t.endTimestamp
			};
		}, n, n, t);
	}
	async getNextPacket(e, t) {
		let n = this.packetToClusterLocation.get(e);
		if (n === void 0) throw Error("Packet was not created from this track.");
		return this.performClusterLookup(n.cluster, (e) => {
			if (e === n.cluster) {
				let t = e.trackData.get(this.internalTrack.id);
				if (n.blockIndex + 1 < t.blocks.length) return {
					blockIndex: n.blockIndex + 1,
					correctBlockFound: !0
				};
			} else if (e.trackData.get(this.internalTrack.id)) return {
				blockIndex: 0,
				correctBlockFound: !0
			};
			return {
				blockIndex: -1,
				correctBlockFound: !1
			};
		}, -Infinity, Infinity, t);
	}
	async getKeyPacket(e, t) {
		let n = this.intoTimescale(e);
		return this.performClusterLookup(null, (e) => {
			let t = e.trackData.get(this.internalTrack.id);
			if (!t) return {
				blockIndex: -1,
				correctBlockFound: !1
			};
			let r = fe(t.presentationTimestamps, (e) => t.blocks[e.blockIndex].isKeyFrame && e.timestamp <= n);
			return {
				blockIndex: r === -1 ? -1 : t.presentationTimestamps[r].blockIndex,
				correctBlockFound: r !== -1 && n < t.endTimestamp
			};
		}, n, n, t);
	}
	async getNextKeyPacket(e, t) {
		let n = this.packetToClusterLocation.get(e);
		if (n === void 0) throw Error("Packet was not created from this track.");
		return this.performClusterLookup(n.cluster, (e) => {
			if (e === n.cluster) {
				let t = e.trackData.get(this.internalTrack.id).blocks.findIndex((e, t) => e.isKeyFrame && t > n.blockIndex);
				if (t !== -1) return {
					blockIndex: t,
					correctBlockFound: !0
				};
			} else {
				let t = e.trackData.get(this.internalTrack.id);
				if (t && t.firstKeyFrameTimestamp !== null) {
					let e = t.blocks.findIndex((e) => e.isKeyFrame);
					return c(e !== -1), {
						blockIndex: e,
						correctBlockFound: !0
					};
				}
			}
			return {
				blockIndex: -1,
				correctBlockFound: !1
			};
		}, -Infinity, Infinity, t);
	}
	async fetchPacketInCluster(e, t, n) {
		if (t === -1) return null;
		let r = e.trackData.get(this.internalTrack.id).blocks[t];
		if (c(r), r.decoded ||= (r.data = this.internalTrack.demuxer.decodeBlockData(this.internalTrack, r.data), !0), !r.postProcessed) {
			if (this.internalTrack.info?.codec === "prores" && !(r.data.length >= 8 && r.data[4] === 105 && r.data[5] === 99 && r.data[6] === 112 && r.data[7] === 102)) {
				let e = new Uint8Array(r.data.length + 8);
				h(e).setUint32(0, e.length, !1), e[4] = 105, e[5] = 99, e[6] = 112, e[7] = 102, e.set(r.data, 8), r.data = e;
			}
			r.postProcessed = !0;
		}
		let i = n.metadataOnly ? Qn : r.data, a = r.timestamp / this.internalTrack.segment.timestampFactor, o = r.duration / this.internalTrack.segment.timestampFactor, s = {};
		r.mainAdditional && this.internalTrack.info?.type === "video" && this.internalTrack.info.alphaMode && (s.alpha = n.metadataOnly ? Qn : r.mainAdditional, s.alphaByteLength = r.mainAdditional.byteLength);
		let l = new N(i, r.isKeyFrame ? "key" : "delta", a, o, e.dataStartPos + t, r.data.byteLength, s);
		return this.packetToClusterLocation.set(l, {
			cluster: e,
			blockIndex: t
		}), l;
	}
	async performClusterLookup(e, t, n, r, i) {
		let { demuxer: a, segment: o } = this.internalTrack, s = null, l = null, u = -1;
		if (e) {
			let { blockIndex: n, correctBlockFound: r } = t(e);
			if (r) return this.fetchPacketInCluster(e, n, i);
			n !== -1 && (l = e, u = n);
		}
		let d = w(this.internalTrack.cuePoints, n, (e) => e.time), f = d === -1 ? null : this.internalTrack.cuePoints[d], p = w(this.internalTrack.clusterPositionCache, n, (e) => e.startTimestamp), m = p === -1 ? null : this.internalTrack.clusterPositionCache[p], h = Math.max(f?.clusterPosition ?? 0, m?.elementStartPos ?? 0) || null, g;
		for (e ? h === null || e.elementStartPos >= h ? (g = e.elementEndPos, s = e) : g = h : g = h ?? o.clusterSeekStartPos; o.elementEndPos === null || g <= o.elementEndPos - 2;) {
			if (s) {
				let e = s.trackData.get(this.internalTrack.id);
				if (e && e.startTimestamp > r) break;
			}
			let e = a.reader.requestSliceRange(g, 2, 16);
			if (e instanceof Promise && (e = await e), !e) break;
			let n = g, d = Ur(e);
			if (!d || !Ir.includes(d.id) && d.id !== F.Void) {
				let e = await Jr(a.reader, n, Ir, Math.min(o.elementEndPos ?? Infinity, n + ni));
				if (e) {
					g = e;
					continue;
				} else break;
			}
			let f = d.id, p = d.size, m = e.filePos;
			if (f === F.Cluster) {
				s = await a.readCluster(n, o), p = s.elementEndPos - m;
				let { blockIndex: e, correctBlockFound: r } = t(s);
				if (r) return this.fetchPacketInCluster(s, e, i);
				e !== -1 && (l = s, u = e);
			}
			p === void 0 && (c(f !== F.Cluster), p = (await qr(a.reader, m, Lr, o.elementEndPos)).pos - m);
			let h = m + p;
			if (o.elementEndPos === null) {
				let e = a.reader.requestSliceRange(h, 2, 16);
				if (e instanceof Promise && (e = await e), !e) break;
				if (Vr(e) === F.Segment) {
					o.elementEndPos = h;
					break;
				}
			}
			g = h;
		}
		if (f && (!l || l.elementStartPos < f.clusterPosition)) {
			let e = this.internalTrack.cuePoints[d - 1];
			c(!e || e.time < f.time);
			let n = e?.time ?? -Infinity;
			return this.performClusterLookup(null, t, n, r, i);
		}
		return l ? this.fetchPacketInCluster(l, u, i) : null;
	}
}, ai = class extends ii {
	constructor(e) {
		super(e), this.decoderConfigPromise = null, this.internalTrack = e;
	}
	getType() {
		return "video";
	}
	getCodec() {
		return this.internalTrack.info.codec;
	}
	getCodedWidth() {
		return this.internalTrack.info.width;
	}
	getCodedHeight() {
		return this.internalTrack.info.height;
	}
	getSquarePixelWidth() {
		return this.internalTrack.info.squarePixelWidth;
	}
	getSquarePixelHeight() {
		return this.internalTrack.info.squarePixelHeight;
	}
	getRotation() {
		return this.internalTrack.info.rotation;
	}
	async getColorSpace() {
		return {
			primaries: this.internalTrack.info.colorSpace?.primaries,
			transfer: this.internalTrack.info.colorSpace?.transfer,
			matrix: this.internalTrack.info.colorSpace?.matrix,
			fullRange: this.internalTrack.info.colorSpace?.fullRange
		};
	}
	async canBeTransparent() {
		return this.internalTrack.info.alphaMode || this.internalTrack.info.codec === "prores" && (this.internalTrack.info.proresFormat === "ap4h" || this.internalTrack.info.proresFormat === "ap4x");
	}
	async getDecoderConfig() {
		return this.internalTrack.info.codec ? this.decoderConfigPromise ??= (async () => {
			let e = null;
			(this.internalTrack.info.codec === "vp9" || this.internalTrack.info.codec === "av1" || this.internalTrack.info.codec === "avc" && !this.internalTrack.info.codecDescription || this.internalTrack.info.codec === "hevc" && !this.internalTrack.info.codecDescription) && (e = await this.getFirstPacket({}));
			let t = {
				codec: Dt({
					width: this.internalTrack.info.width,
					height: this.internalTrack.info.height,
					codec: this.internalTrack.info.codec,
					codecDescription: this.internalTrack.info.codecDescription,
					colorSpace: this.internalTrack.info.colorSpace,
					avcType: 1,
					avcCodecInfo: this.internalTrack.info.codec === "avc" && e ? fn(e.data) : null,
					hevcCodecInfo: this.internalTrack.info.codec === "hevc" && e ? Sn(e.data) : null,
					vp9CodecInfo: this.internalTrack.info.codec === "vp9" && e ? Mn(e.data) : null,
					av1CodecInfo: this.internalTrack.info.codec === "av1" && e ? Pn(e.data) : null,
					proresFormat: this.internalTrack.info.proresFormat
				}),
				codedWidth: this.internalTrack.info.width,
				codedHeight: this.internalTrack.info.height,
				description: this.internalTrack.info.codecDescription ?? void 0,
				colorSpace: this.internalTrack.info.colorSpace ?? void 0
			};
			return (this.internalTrack.info.width !== this.internalTrack.info.squarePixelWidth || this.internalTrack.info.height !== this.internalTrack.info.squarePixelHeight) && (t.displayAspectWidth = this.internalTrack.info.squarePixelWidth, t.displayAspectHeight = this.internalTrack.info.squarePixelHeight), t;
		})() : null;
	}
}, oi = class extends ii {
	constructor(e) {
		super(e), this.decoderConfig = null, this.internalTrack = e;
	}
	getType() {
		return "audio";
	}
	getCodec() {
		return this.internalTrack.info.codec;
	}
	getNumberOfChannels() {
		return this.internalTrack.info.numberOfChannels;
	}
	getSampleRate() {
		return this.internalTrack.info.sampleRate;
	}
	async getDecoderConfig() {
		return this.internalTrack.info.codec ? this.decoderConfig ??= {
			codec: kt({
				codec: this.internalTrack.info.codec,
				codecDescription: this.internalTrack.info.codecDescription,
				aacCodecInfo: this.internalTrack.info.aacCodecInfo
			}),
			numberOfChannels: this.internalTrack.info.numberOfChannels,
			sampleRate: this.internalTrack.info.sampleRate,
			description: this.internalTrack.info.codecDescription ?? void 0
		} : null;
	}
}, si = async (e, t, n, r = null) => {
	let i = 2 ** 16, a = t;
	for (; n === null || a < n;) {
		let t = n === null ? i : Math.min(i, n - a), o = e.requestSliceRange(a, 4, t);
		if (o instanceof Promise && (o = await o), !o || o.length < 4) break;
		for (; o.remainingLength >= 4;) {
			let t = o.filePos, n = Xt(W(o), e.fileSize === null ? null : e.fileSize - a);
			if (n.header && (!r || n.header.sampleRate === r.sampleRate && n.header.mpegVersionId === r.mpegVersionId && n.header.layer === r.layer && $t(n.header.channel) === $t(r.channel))) return {
				header: n.header,
				startPos: a
			};
			o.filePos = t + n.bytesAdvanced, a = o.filePos;
		}
	}
	return null;
}, ci = class extends Zn {
	constructor(e) {
		super(e), this.metadataPromise = null, this.firstFrameHeader = null, this.firstFrameHeaderPos = null, this.loadedSamples = [], this.metadataTags = null, this.xingData = null, this.trackBackings = [], this.readingMutex = new re(), this.lastSampleLoaded = !1, this.lastLoadedPos = 0, this.nextTimestampInSamples = 0, this.reader = e._reader;
	}
	async readMetadata() {
		return this.metadataPromise ??= (async () => {
			for (; !this.firstFrameHeader && !this.lastSampleLoaded;) await this.advanceReader();
			if (!this.firstFrameHeader) throw Error("No valid MP3 frame found.");
			this.trackBackings = [new li(this)];
		})();
	}
	async advanceReader() {
		if (this.lastLoadedPos === 0) for (;;) {
			let e = this.reader.requestSlice(this.lastLoadedPos, 10);
			if (e instanceof Promise && (e = await e), !e) {
				this.lastSampleLoaded = !0;
				return;
			}
			let t = ec(e);
			if (!t) break;
			this.lastLoadedPos = e.filePos + t.size;
		}
		let e = await si(this.reader, this.lastLoadedPos, this.reader.fileSize, this.firstFrameHeader);
		if (!e) {
			this.lastSampleLoaded = !0;
			return;
		}
		let t = e.header;
		this.lastLoadedPos = e.startPos + t.totalSize - 1;
		let n = Yt(t.mpegVersionId, t.channel), r = this.reader.requestSlice(e.startPos + n, 4);
		if (r instanceof Promise && (r = await r), r) {
			let t = W(r);
			if (t === 1483304551 || t === 1231971951) {
				if (!this.xingData) {
					let t = this.reader.requestSlice(e.startPos + n + 4, 12);
					if (t instanceof Promise && (t = await t), t) {
						let e = h(V(t, 12)), n = e.getUint32(0, !1);
						this.xingData = {
							frameCount: n & Qt.FrameCount ? e.getUint32(4, !1) : null,
							fileSize: n & Qt.FileSize ? e.getUint32(8, !1) : null
						};
					}
				}
				return;
			}
		}
		this.firstFrameHeader || (this.firstFrameHeader = t, this.firstFrameHeaderPos = e.startPos);
		let i = t.audioSamplesInFrame / this.firstFrameHeader.sampleRate, a = {
			timestamp: this.nextTimestampInSamples / this.firstFrameHeader.sampleRate,
			duration: i,
			dataStart: e.startPos,
			dataSize: t.totalSize
		};
		this.loadedSamples.push(a), this.nextTimestampInSamples += t.audioSamplesInFrame;
	}
	async getMimeType() {
		return "audio/mpeg";
	}
	async getTrackBackings() {
		return await this.readMetadata(), this.trackBackings;
	}
	async getMetadataTags() {
		let e = await this.readingMutex.acquire();
		try {
			if (await this.readMetadata(), this.metadataTags) return this.metadataTags;
			this.metadataTags = {};
			let e = 0, t = !1;
			for (;;) {
				let n = this.reader.requestSlice(e, 10);
				if (n instanceof Promise && (n = await n), !n) break;
				let r = ec(n);
				if (!r) break;
				t = !0;
				let i = this.reader.requestSlice(n.filePos, r.size);
				if (i instanceof Promise && (i = await i), !i) break;
				tc(i, r, this.metadataTags), e = n.filePos + r.size;
			}
			if (!t && this.reader.fileSize !== null && this.reader.fileSize >= 128) {
				let e = this.reader.requestSlice(this.reader.fileSize - 128, 128);
				e instanceof Promise && (e = await e), c(e), G(e, 3) === "TAG" && Qs(e, this.metadataTags);
			}
			return this.metadataTags;
		} finally {
			e();
		}
	}
}, li = class {
	constructor(e) {
		this.demuxer = e;
	}
	getType() {
		return "audio";
	}
	getId() {
		return 1;
	}
	getNumber() {
		return 1;
	}
	getTimeResolution() {
		return c(this.demuxer.firstFrameHeader), this.demuxer.firstFrameHeader.sampleRate / this.demuxer.firstFrameHeader.audioSamplesInFrame;
	}
	isRelativeToUnixEpoch() {
		return !1;
	}
	getUnixTimeForTimestamp() {
		return null;
	}
	getPairingMask() {
		return 1n;
	}
	getBitrate() {
		return null;
	}
	getAverageBitrate() {
		return null;
	}
	async getDurationFromMetadata() {
		let e = this.demuxer;
		if (c(e.firstFrameHeader !== null), c(e.firstFrameHeaderPos !== null), e.xingData) {
			if (e.xingData.frameCount !== null) return e.xingData.frameCount * e.firstFrameHeader.audioSamplesInFrame / e.firstFrameHeader.sampleRate;
		} else if (e.reader.fileSize !== null) {
			let t = Jt(e.firstFrameHeader.lowSamplingFrequency, e.firstFrameHeader.layer, e.firstFrameHeader.bitrate, e.firstFrameHeader.sampleRate), n = (e.reader.fileSize - e.firstFrameHeaderPos) / t;
			return Math.round(n) * e.firstFrameHeader.audioSamplesInFrame / e.firstFrameHeader.sampleRate;
		}
		return null;
	}
	async getLiveRefreshInterval() {
		return null;
	}
	getName() {
		return null;
	}
	getLanguageCode() {
		return "und";
	}
	getCodec() {
		return "mp3";
	}
	getInternalCodecId() {
		return null;
	}
	getNumberOfChannels() {
		return c(this.demuxer.firstFrameHeader), $t(this.demuxer.firstFrameHeader.channel);
	}
	getSampleRate() {
		return c(this.demuxer.firstFrameHeader), this.demuxer.firstFrameHeader.sampleRate;
	}
	getDisposition() {
		return { ...st };
	}
	async getDecoderConfig() {
		return c(this.demuxer.firstFrameHeader), {
			codec: "mp3",
			numberOfChannels: $t(this.demuxer.firstFrameHeader.channel),
			sampleRate: this.demuxer.firstFrameHeader.sampleRate
		};
	}
	async getPacketAtIndex(e, t) {
		if (e === -1) return null;
		let n = this.demuxer.loadedSamples[e];
		if (!n) return null;
		let r;
		if (t.metadataOnly) r = Qn;
		else {
			let e = this.demuxer.reader.requestSlice(n.dataStart, n.dataSize);
			if (e instanceof Promise && (e = await e), !e) return null;
			r = V(e, n.dataSize);
		}
		return new N(r, "key", n.timestamp, n.duration, e, n.dataSize);
	}
	getFirstPacket(e) {
		return this.getPacketAtIndex(0, e);
	}
	async getNextPacket(e, t) {
		let n = await this.demuxer.readingMutex.acquire();
		try {
			let n = ce(this.demuxer.loadedSamples, e.timestamp, (e) => e.timestamp);
			if (n === -1) throw Error("Packet was not created from this track.");
			let r = n + 1;
			for (; r >= this.demuxer.loadedSamples.length && !this.demuxer.lastSampleLoaded;) await this.demuxer.advanceReader();
			return this.getPacketAtIndex(r, t);
		} finally {
			n();
		}
	}
	async getPacket(e, t) {
		let n = await this.demuxer.readingMutex.acquire();
		try {
			for (;;) {
				let n = w(this.demuxer.loadedSamples, e, (e) => e.timestamp);
				if (n === -1 && this.demuxer.loadedSamples.length > 0) return null;
				if (this.demuxer.lastSampleLoaded || n >= 0 && n + 1 < this.demuxer.loadedSamples.length) return this.getPacketAtIndex(n, t);
				await this.demuxer.advanceReader();
			}
		} finally {
			n();
		}
	}
	getKeyPacket(e, t) {
		return this.getPacket(e, t);
	}
	getNextKeyPacket(e, t) {
		return this.getNextPacket(e, t);
	}
}, ui = 79764919, di = new Uint32Array(256);
for (let e = 0; e < 256; e++) {
	let t = e << 24;
	for (let e = 0; e < 8; e++) t = t & 2147483648 ? t << 1 ^ ui : t << 1;
	di[e] = t >>> 0 & 4294967295;
}
var fi = (e) => {
	let t = h(e), n = t.getUint32(22, !0);
	t.setUint32(22, 0, !0);
	let r = 0;
	for (let t = 0; t < e.length; t++) {
		let n = e[t];
		r = (r << 8 ^ di[r >>> 24 ^ n]) >>> 0;
	}
	return t.setUint32(22, n, !0), r;
}, pi = (e, t, n) => {
	let r = 0, i = null;
	if (e.length > 0) if (t.codec === "vorbis") {
		c(t.vorbisInfo);
		let a = t.vorbisInfo.modeBlockflags.length, o = (1 << De(a - 1)) - 1 << 1, s = (e[0] & o) >> 1;
		if (s >= t.vorbisInfo.modeBlockflags.length) throw Error("Invalid mode number.");
		let l = n, u = t.vorbisInfo.modeBlockflags[s];
		if (i = t.vorbisInfo.blocksizes[u], u === 1) {
			let n = (o | 1) + 1, r = e[0] & n ? 1 : 0;
			l = t.vorbisInfo.blocksizes[r];
		}
		r = l === null ? 0 : l + i >> 2;
	} else t.codec === "opus" && (r = Ln(e).durationInSamples);
	return {
		durationInSamples: r,
		vorbisBlockSize: i
	};
}, mi = (e) => {
	let t = "audio/ogg";
	if (e.codecStrings) {
		let n = [...new Set(e.codecStrings)];
		t += `; codecs="${n.join(", ")}"`;
	}
	return t;
}, hi = 65307, gi = (e) => {
	let t = e.filePos;
	if (zs(e) !== 1399285583) return null;
	e.skip(1);
	let n = H(e), r = Gs(e), i = zs(e), a = zs(e), o = zs(e), s = H(e), c = new Uint8Array(s);
	for (let t = 0; t < s; t++) c[t] = H(e);
	let l = 27 + s, u = c.reduce((e, t) => e + t, 0);
	return {
		headerStartPos: t,
		totalSize: l + u,
		dataStartPos: t + l,
		dataSize: u,
		headerType: n,
		granulePosition: r,
		serialNumber: i,
		sequenceNumber: a,
		checksum: o,
		lacingValues: c
	};
}, _i = (e, t) => {
	for (; e.filePos < t - 3;) {
		let t = zs(e), n = t & 255, r = t >>> 8 & 255, i = t >>> 16 & 255, a = t >>> 24 & 255;
		if (!(n !== 79 && r !== 79 && i !== 79 && a !== 79)) {
			if (e.skip(-4), t === 1399285583) return !0;
			e.skip(1);
		}
	}
	return !1;
}, vi = class extends Zn {
	constructor(e) {
		super(e), this.metadataPromise = null, this.bitstreams = [], this.trackBackings = [], this.metadataTags = {}, this.reader = e._reader;
	}
	async readMetadata() {
		return this.metadataPromise ??= (async () => {
			let e = 0;
			for (;;) {
				let t = this.reader.requestSliceRange(e, 27, 282);
				if (t instanceof Promise && (t = await t), !t) break;
				let n = gi(t);
				if (!n || !(n.headerType & 2)) break;
				this.bitstreams.push({
					serialNumber: n.serialNumber,
					bosPage: n,
					description: null,
					numberOfChannels: -1,
					sampleRate: -1,
					codecInfo: {
						codec: null,
						vorbisInfo: null,
						opusInfo: null
					},
					lastMetadataPacket: null
				}), e = n.headerStartPos + n.totalSize;
			}
			for (let e of this.bitstreams) {
				let t = await this.readPacket(e.bosPage, 0);
				t && (t.data.byteLength >= 7 && t.data[0] === 1 && t.data[1] === 118 && t.data[2] === 111 && t.data[3] === 114 && t.data[4] === 98 && t.data[5] === 105 && t.data[6] === 115 ? await this.readVorbisMetadata(t, e) : t.data.byteLength >= 8 && t.data[0] === 79 && t.data[1] === 112 && t.data[2] === 117 && t.data[3] === 115 && t.data[4] === 72 && t.data[5] === 101 && t.data[6] === 97 && t.data[7] === 100 && await this.readOpusMetadata(t, e), e.codecInfo.codec !== null && this.trackBackings.push(new yi(e, this)));
			}
		})();
	}
	async readVorbisMetadata(e, t) {
		let n = await this.findNextPacketStart(e);
		if (!n) return;
		let r = await this.readPacket(n.startPage, n.startSegmentIndex);
		if (!r || (n = await this.findNextPacketStart(r), !n)) return;
		let i = await this.readPacket(n.startPage, n.startSegmentIndex);
		if (!i || r.data[0] !== 3 || i.data[0] !== 5) return;
		let a = [], o = (e) => {
			for (; a.push(Math.min(255, e)), !(e < 255);) e -= 255;
		};
		o(e.data.length), o(r.data.length);
		let s = new Uint8Array(1 + a.length + e.data.length + r.data.length + i.data.length);
		s[0] = 2, s.set(a, 1), s.set(e.data, 1 + a.length), s.set(r.data, 1 + a.length + e.data.length), s.set(i.data, 1 + a.length + e.data.length + r.data.length), t.codecInfo.codec = "vorbis", t.description = s, t.lastMetadataPacket = i;
		let c = h(e.data);
		t.numberOfChannels = c.getUint8(11), t.sampleRate = c.getUint32(12, !0);
		let l = c.getUint8(28);
		t.codecInfo.vorbisInfo = {
			blocksizes: [1 << (l & 15), 1 << (l >> 4)],
			modeBlockflags: Rn(i.data).modeBlockflags
		}, Vn(r.data.subarray(7), this.metadataTags);
	}
	async readOpusMetadata(e, t) {
		let n = await this.findNextPacketStart(e);
		if (!n) return;
		let r = await this.readPacket(n.startPage, n.startSegmentIndex);
		if (!r) return;
		t.codecInfo.codec = "opus", t.description = e.data, t.lastMetadataPacket = r;
		let i = Fn(e.data);
		t.numberOfChannels = i.outputChannelCount, t.sampleRate = At, t.codecInfo.opusInfo = { preSkip: i.preSkip }, Vn(r.data.subarray(8), this.metadataTags);
	}
	async readPacket(e, t) {
		c(t < e.lacingValues.length);
		let n = 0;
		for (let r = 0; r < t; r++) n += e.lacingValues[r];
		let r = e, i = n, a = t, o = [];
		outer: for (;;) {
			let t = this.reader.requestSlice(r.dataStartPos, r.dataSize);
			t instanceof Promise && (t = await t), c(t);
			let s = V(t, r.dataSize);
			for (;;) {
				if (a === r.lacingValues.length) {
					o.push(s.subarray(n, i));
					break;
				}
				let e = r.lacingValues[a];
				if (i += e, e < 255) {
					o.push(s.subarray(n, i));
					break outer;
				}
				a++;
			}
			let l = r.headerStartPos + r.totalSize;
			for (;;) {
				let t = this.reader.requestSliceRange(l, 27, 282);
				if (t instanceof Promise && (t = await t), !t) return null;
				let n = gi(t);
				if (!n) return null;
				if (r = n, r.serialNumber === e.serialNumber) break;
				l = r.headerStartPos + r.totalSize;
			}
			n = 0, i = 0, a = 0;
		}
		let s = o.reduce((e, t) => e + t.length, 0);
		if (s === 0) return null;
		let l = new Uint8Array(s), u = 0;
		for (let e = 0; e < o.length; e++) {
			let t = o[e];
			l.set(t, u), u += t.length;
		}
		return {
			data: l,
			endPage: r,
			endSegmentIndex: a
		};
	}
	async findNextPacketStart(e) {
		if (e.endSegmentIndex < e.endPage.lacingValues.length - 1) return {
			startPage: e.endPage,
			startSegmentIndex: e.endSegmentIndex + 1
		};
		if (e.endPage.headerType & 4) return null;
		let t = e.endPage.headerStartPos + e.endPage.totalSize;
		for (;;) {
			let n = this.reader.requestSliceRange(t, 27, 282);
			if (n instanceof Promise && (n = await n), !n) return null;
			let r = gi(n);
			if (!r) return null;
			if (r.serialNumber === e.endPage.serialNumber) return {
				startPage: r,
				startSegmentIndex: 0
			};
			t = r.headerStartPos + r.totalSize;
		}
	}
	async getMimeType() {
		return await this.readMetadata(), mi({ codecStrings: (await Promise.all(this.trackBackings.map((e) => e.getDecoderConfig().then((e) => e?.codec ?? null)))).filter(Boolean) });
	}
	async getTrackBackings() {
		return await this.readMetadata(), this.trackBackings;
	}
	async getMetadataTags() {
		return await this.readMetadata(), this.metadataTags;
	}
}, yi = class {
	constructor(e, t) {
		this.bitstream = e, this.demuxer = t, this.encodedPacketToMetadata = /* @__PURE__ */ new WeakMap(), this.sequentialScanCache = [], this.sequentialScanMutex = new re(), this.internalSampleRate = e.codecInfo.codec === "opus" ? At : e.sampleRate;
	}
	getType() {
		return "audio";
	}
	getId() {
		return this.bitstream.serialNumber;
	}
	getNumber() {
		let e = this.demuxer.trackBackings.findIndex((e) => e.bitstream === this.bitstream);
		return c(e !== -1), e + 1;
	}
	getNumberOfChannels() {
		return this.bitstream.numberOfChannels;
	}
	getSampleRate() {
		return this.bitstream.sampleRate;
	}
	getTimeResolution() {
		return this.bitstream.sampleRate;
	}
	isRelativeToUnixEpoch() {
		return !1;
	}
	getUnixTimeForTimestamp() {
		return null;
	}
	getPairingMask() {
		return 1n;
	}
	getBitrate() {
		return null;
	}
	getAverageBitrate() {
		return null;
	}
	async getDurationFromMetadata() {
		return null;
	}
	async getLiveRefreshInterval() {
		return null;
	}
	getCodec() {
		return this.bitstream.codecInfo.codec;
	}
	getInternalCodecId() {
		return null;
	}
	async getDecoderConfig() {
		return c(this.bitstream.codecInfo.codec), {
			codec: this.bitstream.codecInfo.codec,
			numberOfChannels: this.bitstream.numberOfChannels,
			sampleRate: this.bitstream.sampleRate,
			description: this.bitstream.description ?? void 0
		};
	}
	getName() {
		return null;
	}
	getLanguageCode() {
		return "und";
	}
	getDisposition() {
		return {
			...st,
			primary: !1
		};
	}
	granulePositionToTimestampInSamples(e) {
		return this.bitstream.codecInfo.codec === "opus" ? (c(this.bitstream.codecInfo.opusInfo), e - this.bitstream.codecInfo.opusInfo.preSkip) : e;
	}
	createEncodedPacketFromOggPacket(e, t, n) {
		if (!e) return null;
		let { durationInSamples: r, vorbisBlockSize: i } = pi(e.data, this.bitstream.codecInfo, t.vorbisLastBlocksize), a = new N(n.metadataOnly ? Qn : e.data, "key", Math.max(0, t.timestampInSamples) / this.internalSampleRate, r / this.internalSampleRate, e.endPage.headerStartPos + e.endSegmentIndex, e.data.byteLength);
		return this.encodedPacketToMetadata.set(a, {
			packet: e,
			timestampInSamples: t.timestampInSamples,
			durationInSamples: r,
			vorbisLastBlockSize: t.vorbisLastBlocksize,
			vorbisBlockSize: i
		}), a;
	}
	async getFirstPacket(e) {
		c(this.bitstream.lastMetadataPacket);
		let t = await this.demuxer.findNextPacketStart(this.bitstream.lastMetadataPacket);
		if (!t) return null;
		let n = 0;
		this.bitstream.codecInfo.codec === "opus" && (c(this.bitstream.codecInfo.opusInfo), n -= this.bitstream.codecInfo.opusInfo.preSkip);
		let r = await this.demuxer.readPacket(t.startPage, t.startSegmentIndex);
		return this.createEncodedPacketFromOggPacket(r, {
			timestampInSamples: n,
			vorbisLastBlocksize: null
		}, e);
	}
	async getNextPacket(e, t) {
		let n = this.encodedPacketToMetadata.get(e);
		if (!n) throw Error("Packet was not created from this track.");
		let r = await this.demuxer.findNextPacketStart(n.packet);
		if (!r) return null;
		let i = n.timestampInSamples + n.durationInSamples, a = await this.demuxer.readPacket(r.startPage, r.startSegmentIndex);
		return this.createEncodedPacketFromOggPacket(a, {
			timestampInSamples: i,
			vorbisLastBlocksize: n.vorbisBlockSize
		}, t);
	}
	async getPacket(e, t) {
		if (this.demuxer.reader.fileSize === null) return this.getPacketSequential(e, t);
		let n = Se(e * this.internalSampleRate);
		if (n === 0) return this.getFirstPacket(t);
		if (n < 0) return null;
		c(this.bitstream.lastMetadataPacket);
		let r = await this.demuxer.findNextPacketStart(this.bitstream.lastMetadataPacket);
		if (!r) return null;
		let i = r.startPage, a = this.demuxer.reader.fileSize, o = [i];
		outer: for (; i.headerStartPos + i.totalSize < a;) {
			let e = i.headerStartPos, t = Math.floor((e + a) / 2), r = t;
			for (;;) {
				let e = Math.min(r + hi, a - 27), s = this.demuxer.reader.requestSlice(r, e - r);
				if (s instanceof Promise && (s = await s), c(s), !_i(s, e)) {
					a = t + 27;
					continue outer;
				}
				let l = this.demuxer.reader.requestSliceRange(s.filePos, 27, 282);
				l instanceof Promise && (l = await l), c(l);
				let u = gi(l);
				c(u);
				let d = !1;
				if (u.serialNumber === this.bitstream.serialNumber) d = !0;
				else {
					let e = this.demuxer.reader.requestSlice(u.headerStartPos, u.totalSize);
					e instanceof Promise && (e = await e), c(e), d = fi(V(e, u.totalSize)) === u.checksum;
				}
				if (!d) {
					r = u.headerStartPos + 4;
					continue;
				}
				if (d && u.serialNumber !== this.bitstream.serialNumber) {
					r = u.headerStartPos + u.totalSize;
					continue;
				}
				if (u.granulePosition === -1) {
					r = u.headerStartPos + u.totalSize;
					continue;
				}
				this.granulePositionToTimestampInSamples(u.granulePosition) > n ? a = u.headerStartPos : (i = u, o.push(u));
				continue outer;
			}
		}
		let s = r.startPage;
		for (let e of o) {
			if (e.granulePosition === i.granulePosition) break;
			(!s || e.headerStartPos > s.headerStartPos) && (s = e);
		}
		let l = s, u = [l];
		for (; !(l.serialNumber === this.bitstream.serialNumber && l.granulePosition === i.granulePosition);) {
			let e = l.headerStartPos + l.totalSize, t = this.demuxer.reader.requestSliceRange(e, 27, 282);
			t instanceof Promise && (t = await t), c(t);
			let n = gi(t);
			c(n), l = n, l.serialNumber === this.bitstream.serialNumber && u.push(l);
		}
		c(l.granulePosition !== -1);
		let d = null, f, p, m = l, h = 0;
		if (l.headerStartPos === r.startPage.headerStartPos) f = this.granulePositionToTimestampInSamples(0), p = !0, d = 0;
		else {
			f = 0, p = !1;
			for (let e = l.lacingValues.length - 1; e >= 0; e--) if (l.lacingValues[e] < 255) {
				d = e + 1;
				break;
			}
			if (d === null) throw Error("Invalid page with granule position: no packets end on this page.");
			h = d - 1;
			let e = {
				data: Qn,
				endPage: m,
				endSegmentIndex: h
			};
			if (await this.demuxer.findNextPacketStart(e)) {
				let e = xi(u, l, d);
				c(e);
				let t = bi(u, e.page, e.segmentIndex);
				t && (l = t.page, d = t.segmentIndex);
			} else for (;;) {
				let e = xi(u, l, d);
				if (!e) break;
				let t = bi(u, e.page, e.segmentIndex);
				if (!t) break;
				if (l = t.page, d = t.segmentIndex, e.page.headerStartPos !== m.headerStartPos) {
					m = e.page, h = e.segmentIndex;
					break;
				}
			}
		}
		let g = null, _ = null;
		for (; l !== null;) {
			c(d !== null);
			let e = await this.demuxer.readPacket(l, d);
			if (!e) break;
			if (!(l.headerStartPos === r.startPage.headerStartPos && d < r.startSegmentIndex)) {
				let r = this.createEncodedPacketFromOggPacket(e, {
					timestampInSamples: f,
					vorbisLastBlocksize: _?.vorbisBlockSize ?? null
				}, t);
				c(r);
				let i = this.encodedPacketToMetadata.get(r);
				if (c(i), !p && e.endPage.headerStartPos === m.headerStartPos && e.endSegmentIndex === h ? (f = this.granulePositionToTimestampInSamples(l.granulePosition), p = !0, r = this.createEncodedPacketFromOggPacket(e, {
					timestampInSamples: f - i.durationInSamples,
					vorbisLastBlocksize: _?.vorbisBlockSize ?? null
				}, t), c(r), i = this.encodedPacketToMetadata.get(r), c(i)) : f += i.durationInSamples, g = r, _ = i, p && (Math.max(f, 0) > n || Math.max(i.timestampInSamples, 0) === n)) break;
			}
			let i = await this.demuxer.findNextPacketStart(e);
			if (!i) break;
			l = i.startPage, d = i.startSegmentIndex;
		}
		return g;
	}
	async getPacketSequential(e, t) {
		let n = await this.sequentialScanMutex.acquire();
		try {
			let n = Se(e * this.internalSampleRate);
			e = n / this.internalSampleRate;
			let r = w(this.sequentialScanCache, n, (e) => e.timestampInSamples), i;
			if (r !== -1) {
				let e = this.sequentialScanCache[r];
				i = this.createEncodedPacketFromOggPacket(e.packet, {
					timestampInSamples: e.timestampInSamples,
					vorbisLastBlocksize: e.vorbisLastBlockSize
				}, t);
			} else i = await this.getFirstPacket(t);
			let a = 0;
			for (; i && i.timestamp < e;) {
				let n = await this.getNextPacket(i, t);
				if (!n || n.timestamp > e) break;
				if (i = n, a++, a === 100) {
					a = 0;
					let e = this.encodedPacketToMetadata.get(i);
					c(e), this.sequentialScanCache.length > 0 && c(u(this.sequentialScanCache).timestampInSamples <= e.timestampInSamples), this.sequentialScanCache.push(e);
				}
			}
			return i;
		} finally {
			n();
		}
	}
	getKeyPacket(e, t) {
		return this.getPacket(e, t);
	}
	getNextKeyPacket(e, t) {
		return this.getNextPacket(e, t);
	}
}, bi = (e, t, n) => {
	let r = t, i = n;
	outer: for (;;) {
		for (i--; i >= 0; i--) if (r.lacingValues[i] < 255) {
			i++;
			break outer;
		}
		if (c(i === -1), !(r.headerType & 1)) {
			i = 0;
			break;
		}
		let t = de(e, (e) => e.headerStartPos < r.headerStartPos);
		if (!t) return null;
		r = t, i = r.lacingValues.length;
	}
	if (c(i !== -1), i === r.lacingValues.length) {
		let t = e[e.indexOf(r) + 1];
		c(t), r = t, i = 0;
	}
	return {
		page: r,
		segmentIndex: i
	};
}, xi = (e, t, n) => {
	if (n > 0) return {
		page: t,
		segmentIndex: n - 1
	};
	let r = de(e, (e) => e.headerStartPos < t.headerStartPos);
	return r ? {
		page: r,
		segmentIndex: r.lacingValues.length - 1
	} : null;
}, L;
(function(e) {
	e[e.PCM = 1] = "PCM", e[e.IEEE_FLOAT = 3] = "IEEE_FLOAT", e[e.ALAW = 6] = "ALAW", e[e.MULAW = 7] = "MULAW", e[e.EXTENSIBLE = 65534] = "EXTENSIBLE";
})(L ||= {});
var Si = class extends Zn {
	constructor(e) {
		super(e), this.metadataPromise = null, this.dataStart = -1, this.dataSize = -1, this.audioInfo = null, this.trackBackings = [], this.lastKnownPacketIndex = 0, this.metadataTags = {}, this.reader = e._reader;
	}
	async readMetadata() {
		return this.metadataPromise ??= (async () => {
			let e = this.reader.requestSlice(0, 12);
			e instanceof Promise && (e = await e), c(e);
			let t = G(e, 4), n = t !== "RIFX", r = t === "RF64", i = Rs(e, n), a = r ? this.reader.fileSize : Math.min(i + 8, this.reader.fileSize ?? Infinity);
			if (G(e, 4) !== "WAVE") throw Error("Invalid WAVE file - wrong format");
			let o = 0, s = null, l = e.filePos;
			for (; a === null || l < a;) {
				let e = this.reader.requestSlice(l, 8);
				if (e instanceof Promise && (e = await e), !e) break;
				let t = G(e, 4), i = Rs(e, n), c = e.filePos;
				if (r && o === 0 && t !== "ds64") throw Error("Invalid RF64 file: First chunk must be \"ds64\".");
				if (t === "fmt ") await this.parseFmtChunk(c, i, n);
				else if (t === "data") {
					if (s ??= i, this.dataStart = e.filePos, this.dataSize = Math.min(s, (a ?? Infinity) - this.dataStart), this.reader.fileSize === null) break;
				} else if (t === "ds64") {
					let e = this.reader.requestSlice(c, i);
					if (e instanceof Promise && (e = await e), !e) break;
					let t = Hs(e, n);
					s = Hs(e, n), a = Math.min(t + 8, this.reader.fileSize ?? Infinity);
				} else t === "LIST" ? await this.parseListChunk(c, i, n) : (t === "ID3 " || t === "id3 ") && await this.parseId3Chunk(c, i);
				l = c + i + (i & 1), o++;
			}
			if (!this.audioInfo) throw Error("Invalid WAVE file - missing \"fmt \" chunk");
			if (this.dataStart === -1) throw Error("Invalid WAVE file - missing \"data\" chunk");
			let u = this.audioInfo.blockSizeInBytes;
			this.dataSize = Math.floor(this.dataSize / u) * u, this.trackBackings.push(new wi(this));
		})();
	}
	async parseFmtChunk(e, t, n) {
		let r = this.reader.requestSlice(e, t);
		if (r instanceof Promise && (r = await r), !r) return;
		let i = Fs(r, n), a = Fs(r, n), o = Rs(r, n);
		r.skip(4);
		let s = Fs(r, n), c;
		if (c = t === 14 ? 8 : Fs(r, n), t >= 18 && i !== 357) {
			let e = Fs(r, n), a = t - 18;
			if (Math.min(a, e) >= 22 && i === L.EXTENSIBLE) {
				r.skip(6);
				let e = V(r, 16);
				i = e[0] | e[1] << 8;
			}
		}
		if ((i === L.MULAW || i === L.ALAW) && (c = 8), i !== L.PCM && i !== L.IEEE_FLOAT && i !== L.ALAW && i !== L.MULAW) throw Error(`Unsupported WAVE codec (format tag ${i}). Only integer/float PCM, A-law, and μ-law are supported.`);
		if (i === L.PCM && ![
			8,
			16,
			24,
			32
		].includes(c)) throw Error(`Unsupported WAVE PCM bit depth (${c}). Only 8, 16, 24, and 32 bits are supported.`);
		if (i === L.IEEE_FLOAT && ![32, 64].includes(c)) throw Error(`Unsupported WAVE float bit depth (${c}). Only 32 and 64 bits are supported.`);
		this.audioInfo = {
			format: i,
			numberOfChannels: a,
			sampleRate: o,
			sampleSizeInBytes: Math.ceil(c / 8),
			blockSizeInBytes: s
		};
	}
	async parseListChunk(e, t, n) {
		let r = this.reader.requestSlice(e, t);
		if (r instanceof Promise && (r = await r), !r) return;
		let i = G(r, 4);
		if (i !== "INFO" && i !== "INF0") return;
		let a = r.filePos;
		for (; a <= e + t - 8;) {
			r.filePos = a;
			let e = G(r, 4), t = Rs(r, n), i = V(r, t), o = 0;
			for (let e = 0; e < i.length && i[e] !== 0; e++) o++;
			let s = String.fromCharCode(...i.subarray(0, o));
			switch (this.metadataTags.raw ??= {}, this.metadataTags.raw[e] = s, e) {
				case "INAM":
				case "TITL":
					this.metadataTags.title ??= s;
					break;
				case "TIT3":
					this.metadataTags.description ??= s;
					break;
				case "IART":
					this.metadataTags.artist ??= s;
					break;
				case "IPRD":
					this.metadataTags.album ??= s;
					break;
				case "IPRT":
				case "ITRK":
				case "TRCK":
					{
						let e = s.split("/"), t = Number.parseInt(e[0], 10), n = e[1] && Number.parseInt(e[1], 10);
						Number.isInteger(t) && t > 0 && (this.metadataTags.trackNumber ??= t), n && Number.isInteger(n) && n > 0 && (this.metadataTags.tracksTotal ??= n);
					}
					break;
				case "ICRD":
				case "IDIT":
					{
						let e = new Date(s);
						Number.isNaN(e.getTime()) || (this.metadataTags.date ??= e);
					}
					break;
				case "YEAR":
					{
						let e = Number.parseInt(s, 10);
						Number.isInteger(e) && e > 0 && (this.metadataTags.date ??= new Date(e, 0, 1));
					}
					break;
				case "IGNR":
				case "GENR":
					this.metadataTags.genre ??= s;
					break;
				case "ICMT":
				case "CMNT":
				case "COMM":
					this.metadataTags.comment ??= s;
					break;
			}
			a += 8 + t + (t & 1);
		}
	}
	async parseId3Chunk(e, t) {
		let n = this.reader.requestSlice(e, t);
		if (n instanceof Promise && (n = await n), !n) return;
		let r = ec(n);
		if (r) {
			let i = t - 10;
			r.size = Math.min(r.size, i), r.size > 0 && tc(n.slice(e + 10, r.size), r, this.metadataTags);
		}
	}
	getCodec() {
		if (c(this.audioInfo), this.audioInfo.format === L.MULAW) return "ulaw";
		if (this.audioInfo.format === L.ALAW) return "alaw";
		if (this.audioInfo.format === L.PCM) {
			if (this.audioInfo.sampleSizeInBytes === 1) return "pcm-u8";
			if (this.audioInfo.sampleSizeInBytes === 2) return "pcm-s16";
			if (this.audioInfo.sampleSizeInBytes === 3) return "pcm-s24";
			if (this.audioInfo.sampleSizeInBytes === 4) return "pcm-s32";
		}
		if (this.audioInfo.format === L.IEEE_FLOAT) {
			if (this.audioInfo.sampleSizeInBytes === 4) return "pcm-f32";
			if (this.audioInfo.sampleSizeInBytes === 8) return "pcm-f64";
		}
		c(!1);
	}
	async getMimeType() {
		return "audio/wav";
	}
	async getTrackBackings() {
		return await this.readMetadata(), this.trackBackings;
	}
	async getMetadataTags() {
		return await this.readMetadata(), this.metadataTags;
	}
}, Ci = 2048, wi = class {
	constructor(e) {
		this.demuxer = e;
	}
	getType() {
		return "audio";
	}
	getId() {
		return 1;
	}
	getNumber() {
		return 1;
	}
	getCodec() {
		return this.demuxer.getCodec();
	}
	getInternalCodecId() {
		return c(this.demuxer.audioInfo), this.demuxer.audioInfo.format;
	}
	async getDecoderConfig() {
		let e = this.demuxer.getCodec();
		return e ? (c(this.demuxer.audioInfo), {
			codec: e,
			numberOfChannels: this.demuxer.audioInfo.numberOfChannels,
			sampleRate: this.demuxer.audioInfo.sampleRate
		}) : null;
	}
	getNumberOfChannels() {
		return c(this.demuxer.audioInfo), this.demuxer.audioInfo.numberOfChannels;
	}
	getSampleRate() {
		return c(this.demuxer.audioInfo), this.demuxer.audioInfo.sampleRate;
	}
	getTimeResolution() {
		return c(this.demuxer.audioInfo), this.demuxer.audioInfo.sampleRate;
	}
	isRelativeToUnixEpoch() {
		return !1;
	}
	getUnixTimeForTimestamp() {
		return null;
	}
	getPairingMask() {
		return 1n;
	}
	getBitrate() {
		return null;
	}
	getAverageBitrate() {
		return null;
	}
	async getDurationFromMetadata() {
		return c(this.demuxer.dataSize !== -1), this.demuxer.dataSize / this.demuxer.audioInfo.blockSizeInBytes / this.demuxer.audioInfo.sampleRate;
	}
	async getLiveRefreshInterval() {
		return null;
	}
	getName() {
		return null;
	}
	getLanguageCode() {
		return "und";
	}
	getDisposition() {
		return { ...st };
	}
	async getPacketAtIndex(e, t) {
		c(e >= 0), c(this.demuxer.audioInfo);
		let n = e * Ci * this.demuxer.audioInfo.blockSizeInBytes;
		if (n >= this.demuxer.dataSize) return null;
		let r = Math.min(Ci * this.demuxer.audioInfo.blockSizeInBytes, this.demuxer.dataSize - n);
		if (this.demuxer.reader.fileSize === null) {
			let e = this.demuxer.reader.requestSlice(this.demuxer.dataStart + n, r);
			if (e instanceof Promise && (e = await e), !e) return null;
		}
		let i;
		if (t.metadataOnly) i = Qn;
		else {
			let e = this.demuxer.reader.requestSlice(this.demuxer.dataStart + n, r);
			e instanceof Promise && (e = await e), c(e), i = V(e, r);
		}
		let a = e * Ci / this.demuxer.audioInfo.sampleRate, o = r / this.demuxer.audioInfo.blockSizeInBytes / this.demuxer.audioInfo.sampleRate;
		return this.demuxer.lastKnownPacketIndex = Math.max(e, this.demuxer.lastKnownPacketIndex), new N(i, "key", a, o, e, r);
	}
	getFirstPacket(e) {
		return this.getPacketAtIndex(0, e);
	}
	async getPacket(e, t) {
		c(this.demuxer.audioInfo);
		let n = Math.floor(Math.min(e * this.demuxer.audioInfo.sampleRate / Ci, (this.demuxer.dataSize - 1) / (Ci * this.demuxer.audioInfo.blockSizeInBytes)));
		if (n < 0) return null;
		let r = await this.getPacketAtIndex(n, t);
		if (r) return r;
		if (n === 0) return null;
		c(this.demuxer.reader.fileSize === null);
		let i = await this.getPacketAtIndex(this.demuxer.lastKnownPacketIndex, t);
		for (; i;) {
			let e = await this.getNextPacket(i, t);
			if (!e) break;
			i = e;
		}
		return i;
	}
	getNextPacket(e, t) {
		c(this.demuxer.audioInfo);
		let n = Math.round(e.timestamp * this.demuxer.audioInfo.sampleRate / Ci);
		return this.getPacketAtIndex(n + 1, t);
	}
	getKeyPacket(e, t) {
		return this.getPacket(e, t);
	}
	getNextKeyPacket(e, t) {
		return this.getNextPacket(e, t);
	}
}, Ti = (e) => {
	let t = e.filePos, n = new O(V(e, 9));
	if (n.readBits(12) !== 4095 || (n.skipBits(1), n.readBits(2) !== 0)) return null;
	let r = n.readBits(1), i = n.readBits(2) + 1, a = n.readBits(4);
	if (a === 15) return null;
	n.skipBits(1);
	let o = n.readBits(3);
	if (o === 0) throw Error("ADTS frames with channel configuration 0 are not supported.");
	n.skipBits(1), n.skipBits(1), n.skipBits(1), n.skipBits(1);
	let s = n.readBits(13);
	n.skipBits(11);
	let c = n.readBits(2) + 1;
	if (c !== 1) throw Error("ADTS frames with more than one AAC frame are not supported.");
	let l = null;
	return r === 1 ? e.filePos -= 2 : l = n.readBits(16), {
		objectType: i,
		samplingFrequencyIndex: a,
		channelConfiguration: o,
		frameLength: s,
		numberOfAacFrames: c,
		crcCheck: l,
		startPos: t
	};
}, Ei = 1024, Di = class extends Zn {
	constructor(e) {
		super(e), this.metadataPromise = null, this.firstFrameHeader = null, this.loadedSamples = [], this.metadataTags = null, this.trackBackings = [], this.readingMutex = new re(), this.lastSampleLoaded = !1, this.lastLoadedPos = 0, this.nextTimestampInSamples = 0, this.reader = e._reader;
	}
	async readMetadata() {
		return this.metadataPromise ??= (async () => {
			for (; !this.firstFrameHeader && !this.lastSampleLoaded;) await this.advanceReader();
			c(this.firstFrameHeader), this.trackBackings = [new Oi(this)];
		})();
	}
	async advanceReader() {
		if (this.lastLoadedPos === 0) for (;;) {
			let e = this.reader.requestSlice(this.lastLoadedPos, 10);
			if (e instanceof Promise && (e = await e), !e) {
				this.lastSampleLoaded = !0;
				return;
			}
			let t = ec(e);
			if (!t) break;
			this.lastLoadedPos = e.filePos + t.size;
		}
		let e = this.reader.requestSliceRange(this.lastLoadedPos, 7, 9);
		if (e instanceof Promise && (e = await e), !e) {
			this.lastSampleLoaded = !0;
			return;
		}
		let t = Ti(e);
		if (!t) {
			this.lastSampleLoaded = !0;
			return;
		}
		if (this.reader.fileSize !== null && t.startPos + t.frameLength > this.reader.fileSize) {
			this.lastSampleLoaded = !0;
			return;
		}
		this.firstFrameHeader ||= t;
		let n = lt[t.samplingFrequencyIndex];
		c(n !== void 0);
		let r = Ei / n, i = {
			timestamp: this.nextTimestampInSamples / n,
			duration: r,
			dataStart: t.startPos,
			dataSize: t.frameLength
		};
		this.loadedSamples.push(i), this.nextTimestampInSamples += Ei, this.lastLoadedPos = t.startPos + t.frameLength;
	}
	async getMimeType() {
		return "audio/aac";
	}
	async getTrackBackings() {
		return await this.readMetadata(), this.trackBackings;
	}
	async getMetadataTags() {
		let e = await this.readingMutex.acquire();
		try {
			if (await this.readMetadata(), this.metadataTags) return this.metadataTags;
			this.metadataTags = {};
			let e = 0;
			for (;;) {
				let t = this.reader.requestSlice(e, 10);
				if (t instanceof Promise && (t = await t), !t) break;
				let n = ec(t);
				if (!n) break;
				let r = this.reader.requestSlice(t.filePos, n.size);
				if (r instanceof Promise && (r = await r), !r) break;
				tc(r, n, this.metadataTags), e = t.filePos + n.size;
			}
			return this.metadataTags;
		} finally {
			e();
		}
	}
}, Oi = class {
	constructor(e) {
		this.demuxer = e;
	}
	getType() {
		return "audio";
	}
	getId() {
		return 1;
	}
	getNumber() {
		return 1;
	}
	getTimeResolution() {
		return this.getSampleRate() / Ei;
	}
	isRelativeToUnixEpoch() {
		return !1;
	}
	getUnixTimeForTimestamp() {
		return null;
	}
	getPairingMask() {
		return 1n;
	}
	getBitrate() {
		return null;
	}
	getAverageBitrate() {
		return null;
	}
	async getDurationFromMetadata() {
		return null;
	}
	async getLiveRefreshInterval() {
		return null;
	}
	getName() {
		return null;
	}
	getLanguageCode() {
		return "und";
	}
	getCodec() {
		return "aac";
	}
	getInternalCodecId() {
		return c(this.demuxer.firstFrameHeader), this.demuxer.firstFrameHeader.objectType;
	}
	getNumberOfChannels() {
		c(this.demuxer.firstFrameHeader);
		let e = ut[this.demuxer.firstFrameHeader.channelConfiguration];
		return c(e !== void 0), e;
	}
	getSampleRate() {
		c(this.demuxer.firstFrameHeader);
		let e = lt[this.demuxer.firstFrameHeader.samplingFrequencyIndex];
		return c(e !== void 0), e;
	}
	getDisposition() {
		return { ...st };
	}
	async getDecoderConfig() {
		return c(this.demuxer.firstFrameHeader), {
			codec: `mp4a.40.${this.demuxer.firstFrameHeader.objectType}`,
			numberOfChannels: this.getNumberOfChannels(),
			sampleRate: this.getSampleRate()
		};
	}
	async getPacketAtIndex(e, t) {
		if (e === -1) return null;
		let n = this.demuxer.loadedSamples[e];
		if (!n) return null;
		let r;
		if (t.metadataOnly) r = Qn;
		else {
			let e = this.demuxer.reader.requestSlice(n.dataStart, n.dataSize);
			if (e instanceof Promise && (e = await e), !e) return null;
			r = V(e, n.dataSize);
		}
		return new N(r, "key", n.timestamp, n.duration, e, n.dataSize);
	}
	getFirstPacket(e) {
		return this.getPacketAtIndex(0, e);
	}
	async getNextPacket(e, t) {
		let n = await this.demuxer.readingMutex.acquire();
		try {
			let n = ce(this.demuxer.loadedSamples, e.timestamp, (e) => e.timestamp);
			if (n === -1) throw Error("Packet was not created from this track.");
			let r = n + 1;
			for (; r >= this.demuxer.loadedSamples.length && !this.demuxer.lastSampleLoaded;) await this.demuxer.advanceReader();
			return this.getPacketAtIndex(r, t);
		} finally {
			n();
		}
	}
	async getPacket(e, t) {
		let n = await this.demuxer.readingMutex.acquire();
		try {
			for (;;) {
				let n = w(this.demuxer.loadedSamples, e, (e) => e.timestamp);
				if (n === -1 && this.demuxer.loadedSamples.length > 0) return null;
				if (this.demuxer.lastSampleLoaded || n >= 0 && n + 1 < this.demuxer.loadedSamples.length) return this.getPacketAtIndex(n, t);
				await this.demuxer.advanceReader();
			}
		} finally {
			n();
		}
	}
	getKeyPacket(e, t) {
		return this.getPacket(e, t);
	}
	getNextKeyPacket(e, t) {
		return this.getNextPacket(e, t);
	}
}, ki = (e) => e === 0 ? null : e === 1 ? 192 : e >= 2 && e <= 5 ? 144 * 2 ** e : e === 6 ? "uncommon-u8" : e === 7 ? "uncommon-u16" : e >= 8 && e <= 15 ? 2 ** e : null, Ai = (e, t) => {
	switch (e) {
		case 0: return t;
		case 1: return 88200;
		case 2: return 176400;
		case 3: return 192e3;
		case 4: return 8e3;
		case 5: return 16e3;
		case 6: return 22050;
		case 7: return 24e3;
		case 8: return 32e3;
		case 9: return 44100;
		case 10: return 48e3;
		case 11: return 96e3;
		case 12: return "uncommon-u8";
		case 13: return "uncommon-u16";
		case 14: return "uncommon-u16-10";
		default: return null;
	}
}, ji = (e) => {
	let t = 0, n = new O(V(e, 1));
	for (; n.readBits(1) === 1;) t++;
	if (t === 0) return n.readBits(7);
	let r = [], i = t - 1, a = new O(V(e, i)), o = 8 - t - 1;
	for (let e = 0; e < o; e++) r.unshift(n.readBits(1));
	for (let e = 0; e < i; e++) for (let e = 0; e < 8; e++) {
		let t = a.readBits(1);
		e < 2 || r.unshift(t);
	}
	return r.reduce((e, t, n) => e | t << n, 0);
}, Mi = (e, t) => {
	if (t === "uncommon-u16") return U(e) + 1;
	if (t === "uncommon-u8") return H(e) + 1;
	if (typeof t == "number") return t;
	he(t), c(!1);
}, Ni = (e, t) => t === "uncommon-u16" ? U(e) : t === "uncommon-u16-10" ? U(e) * 10 : t === "uncommon-u8" ? H(e) : typeof t == "number" ? t : null, Pi = (e) => {
	let t = 0;
	for (let n of e) {
		t ^= n;
		for (let e = 0; e < 8; e++) t & 128 ? t = t << 1 ^ 7 : t <<= 1, t &= 255;
	}
	return t;
}, Fi = class extends Zn {
	constructor(e) {
		super(e), this.loadedSamples = [], this.metadataPromise = null, this.trackBacking = null, this.metadataTags = {}, this.audioInfo = null, this.lastLoadedPos = null, this.blockingBit = null, this.readingMutex = new re(), this.lastSampleLoaded = !1, this.reader = e._reader;
	}
	async getMetadataTags() {
		return await this.readMetadata(), this.metadataTags;
	}
	async getTrackBackings() {
		return await this.readMetadata(), c(this.trackBacking), [this.trackBacking];
	}
	async getMimeType() {
		return "audio/flac";
	}
	async readMetadata() {
		return this.metadataPromise ??= (async () => {
			let e = 0;
			for (;;) {
				let t = this.reader.requestSlice(e, 10);
				if (t instanceof Promise && (t = await t), !t) {
					this.lastSampleLoaded = !0;
					return;
				}
				let n = ec(t);
				if (!n) break;
				let r = this.reader.requestSlice(t.filePos, n.size);
				r instanceof Promise && (r = await r), c(r), tc(r, n, this.metadataTags), e = t.filePos + n.size;
			}
			for (e += 4; this.reader.fileSize === null || e < this.reader.fileSize;) {
				let t = this.reader.requestSlice(e, 4);
				if (t instanceof Promise && (t = await t), e += 4, t === null) throw Error(`Metadata block at position ${e} is too small! Corrupted file.`);
				c(t);
				let n = H(t), r = Is(t), i = (n & 128) != 0;
				switch (n & 127) {
					case Bn.STREAMINFO: {
						let t = this.reader.requestSlice(e, r);
						if (t instanceof Promise && (t = await t), c(t), t === null) throw Error(`StreamInfo block at position ${e} is too small! Corrupted file.`);
						let n = V(t, 34), i = new O(n), a = i.readBits(16), o = i.readBits(16), s = i.readBits(24), l = i.readBits(24), u = i.readBits(20), d = i.readBits(3) + 1;
						i.readBits(5);
						let f = i.readBits(36);
						i.skipBits(128);
						let p = new Uint8Array(42);
						p.set(new Uint8Array([
							102,
							76,
							97,
							67
						]), 0), p.set(new Uint8Array([
							128,
							0,
							0,
							34
						]), 4), p.set(n, 8), this.audioInfo = {
							numberOfChannels: d,
							sampleRate: u,
							totalSamples: f,
							minimumBlockSize: a,
							maximumBlockSize: o,
							minimumFrameSize: s,
							maximumFrameSize: l,
							description: p
						}, this.trackBacking = new Ii(this);
						break;
					}
					case Bn.VORBIS_COMMENT: {
						let t = this.reader.requestSlice(e, r);
						t instanceof Promise && (t = await t), c(t), Vn(V(t, r), this.metadataTags);
						break;
					}
					case Bn.PICTURE: {
						let t = this.reader.requestSlice(e, r);
						t instanceof Promise && (t = await t), c(t);
						let n = W(t), i = W(t), a = g.decode(V(t, i)), o = W(t), s = g.decode(V(t, o));
						t.skip(16);
						let l = W(t), u = V(t, l);
						this.metadataTags.images ??= [], this.metadataTags.images.push({
							data: u,
							mimeType: a,
							kind: n === 3 ? "coverFront" : n === 4 ? "coverBack" : "unknown",
							description: s
						});
						break;
					}
					default: break;
				}
				if (e += r, i) {
					this.lastLoadedPos = e;
					break;
				}
			}
			if (!this.audioInfo) throw Error("Missing STREAMINFO metadata block! Corrupted FLAC file.");
		})();
	}
	async readNextFlacFrame({ startPos: e, isFirstPacket: t }) {
		c(this.audioInfo);
		let n = this.audioInfo.maximumBlockSize * this.audioInfo.numberOfChannels * 4 + 16 + 2, r = this.audioInfo.minimumFrameSize || 10, i = (this.audioInfo.maximumFrameSize || n) + 16, a = await this.reader.requestSliceRange(e, 16, i);
		if (!a) return null;
		let o = this.readFlacFrameHeader({
			slice: a,
			isFirstPacket: t
		});
		if (!o) return null;
		for (a.filePos = e + r;;) {
			if (a.filePos > a.end - 6) return {
				num: o.num,
				blockSize: o.blockSize,
				sampleRate: o.sampleRate,
				size: a.end - e,
				isLastFrame: !0
			};
			if (H(a) === 255) {
				let t = a.filePos;
				if (H(a) !== (this.blockingBit === 1 ? 249 : 248)) {
					a.filePos = t;
					continue;
				}
				a.skip(-2);
				let n = a.filePos - e, r = this.readFlacFrameHeader({
					slice: a,
					isFirstPacket: !1
				});
				if (!r) {
					a.filePos = t;
					continue;
				}
				if (this.blockingBit === 0) {
					if (r.num - o.num !== 1) {
						a.filePos = t;
						continue;
					}
				} else if (r.num - o.num !== o.blockSize) {
					a.filePos = t;
					continue;
				}
				return {
					num: o.num,
					blockSize: o.blockSize,
					sampleRate: o.sampleRate,
					size: n,
					isLastFrame: !1
				};
			}
		}
	}
	readFlacFrameHeader({ slice: e, isFirstPacket: t }) {
		let n = e.filePos, r = new O(V(e, 4));
		if (r.readBits(15) !== 32764) return null;
		if (this.blockingBit === null) {
			c(t);
			let e = r.readBits(1);
			this.blockingBit = e;
		} else if (this.blockingBit === 1) {
			if (c(!t), r.readBits(1) !== 1) return null;
		} else if (this.blockingBit === 0) {
			if (c(!t), r.readBits(1) !== 0) return null;
		} else throw Error("Invalid blocking bit");
		let i = ki(r.readBits(4));
		if (!i) return null;
		c(this.audioInfo);
		let a = Ai(r.readBits(4), this.audioInfo.sampleRate);
		if (!a || (r.readBits(4), r.readBits(3), r.readBits(1) !== 0)) return null;
		let o = ji(e), s = Mi(e, i), l = Ni(e, a);
		if (l === null || l !== this.audioInfo.sampleRate) return null;
		let u = e.filePos - n, d = H(e);
		return e.skip(-u), e.skip(-1), d === Pi(V(e, u)) ? {
			num: o,
			blockSize: s,
			sampleRate: l
		} : null;
	}
	async advanceReader() {
		await this.readMetadata(), c(this.lastLoadedPos !== null), c(this.audioInfo);
		let e = this.lastLoadedPos, t = await this.readNextFlacFrame({
			startPos: e,
			isFirstPacket: this.loadedSamples.length === 0
		});
		if (!t) {
			this.lastSampleLoaded = !0;
			return;
		}
		let n = this.loadedSamples[this.loadedSamples.length - 1], r = {
			blockOffset: n ? n.blockOffset + n.blockSize : 0,
			blockSize: t.blockSize,
			byteOffset: e,
			byteSize: t.size
		};
		if (this.lastLoadedPos += t.size, this.loadedSamples.push(r), t.isLastFrame) {
			this.lastSampleLoaded = !0;
			return;
		}
	}
}, Ii = class {
	constructor(e) {
		this.demuxer = e;
	}
	getType() {
		return "audio";
	}
	getId() {
		return 1;
	}
	getNumber() {
		return 1;
	}
	getCodec() {
		return "flac";
	}
	getInternalCodecId() {
		return null;
	}
	getNumberOfChannels() {
		return c(this.demuxer.audioInfo), this.demuxer.audioInfo.numberOfChannels;
	}
	getSampleRate() {
		return c(this.demuxer.audioInfo), this.demuxer.audioInfo.sampleRate;
	}
	getName() {
		return null;
	}
	getLanguageCode() {
		return "und";
	}
	getTimeResolution() {
		return c(this.demuxer.audioInfo), this.demuxer.audioInfo.sampleRate;
	}
	isRelativeToUnixEpoch() {
		return !1;
	}
	getUnixTimeForTimestamp() {
		return null;
	}
	getPairingMask() {
		return 1n;
	}
	getBitrate() {
		return null;
	}
	getAverageBitrate() {
		return null;
	}
	async getDurationFromMetadata() {
		return c(this.demuxer.audioInfo), this.demuxer.audioInfo.totalSamples === 0 ? null : this.demuxer.audioInfo.totalSamples / this.demuxer.audioInfo.sampleRate;
	}
	async getLiveRefreshInterval() {
		return null;
	}
	getDisposition() {
		return { ...st };
	}
	async getDecoderConfig() {
		return c(this.demuxer.audioInfo), {
			codec: "flac",
			numberOfChannels: this.demuxer.audioInfo.numberOfChannels,
			sampleRate: this.demuxer.audioInfo.sampleRate,
			description: this.demuxer.audioInfo.description
		};
	}
	async getPacket(e, t) {
		if (c(this.demuxer.audioInfo), e < 0) return null;
		let n = await this.demuxer.readingMutex.acquire();
		try {
			for (;;) {
				let n = w(this.demuxer.loadedSamples, e, (e) => e.blockOffset / this.demuxer.audioInfo.sampleRate);
				if (n === -1) {
					await this.demuxer.advanceReader();
					continue;
				}
				let r = this.demuxer.loadedSamples[n];
				if (r.blockOffset / this.demuxer.audioInfo.sampleRate + r.blockSize / this.demuxer.audioInfo.sampleRate <= e) {
					if (this.demuxer.lastSampleLoaded) return this.getPacketAtIndex(this.demuxer.loadedSamples.length - 1, t);
					await this.demuxer.advanceReader();
					continue;
				}
				return this.getPacketAtIndex(n, t);
			}
		} finally {
			n();
		}
	}
	async getNextPacket(e, t) {
		let n = await this.demuxer.readingMutex.acquire();
		try {
			let n = e.sequenceNumber + 1;
			if (this.demuxer.lastSampleLoaded && n >= this.demuxer.loadedSamples.length) return null;
			for (; n >= this.demuxer.loadedSamples.length && !this.demuxer.lastSampleLoaded;) await this.demuxer.advanceReader();
			return this.getPacketAtIndex(n, t);
		} finally {
			n();
		}
	}
	getKeyPacket(e, t) {
		return this.getPacket(e, t);
	}
	getNextKeyPacket(e, t) {
		return this.getNextPacket(e, t);
	}
	async getPacketAtIndex(e, t) {
		let n = this.demuxer.loadedSamples[e];
		if (!n) return null;
		let r;
		if (t.metadataOnly) r = Qn;
		else {
			let e = this.demuxer.reader.requestSlice(n.byteOffset, n.byteSize);
			if (e instanceof Promise && (e = await e), !e) return null;
			r = V(e, n.byteSize);
		}
		c(this.demuxer.audioInfo);
		let i = n.blockOffset / this.demuxer.audioInfo.sampleRate, a = n.blockSize / this.demuxer.audioInfo.sampleRate;
		return new N(r, "key", i, a, e, n.byteSize);
	}
	async getFirstPacket(e) {
		for (; this.demuxer.loadedSamples.length === 0 && !this.demuxer.lastSampleLoaded;) await this.demuxer.advanceReader();
		return this.getPacketAtIndex(0, e);
	}
}, Li = 9e4, Ri = (e) => {
	let t = "video/MP2T", n = [...new Set(e.filter(Boolean))];
	return n.length > 0 && (t += `; codecs="${n.join(", ")}"`), t;
}, zi = "PES packet is missing PTS where it was expected. PES packets without PTS are not currently supported. If you think this file should be supported, please report it.", Bi = /* @__PURE__ */ new Set(), Vi = class extends Zn {
	constructor(e) {
		super(e), this.metadataPromise = null, this.elementaryStreams = [], this.trackBackingEntries = [], this.packetOffset = 0, this.packetStride = -1, this.sectionEndPositions = [], this.seekChunkSize = 5 * 1024 * 1024, this.minReferencePointByteDistance = -1, this.reader = e._reader;
	}
	async readMetadata() {
		return this.metadataPromise ??= (async () => {
			let e = this.reader.requestSlice(0, 205);
			e instanceof Promise && (e = await e), c(e);
			let t = V(e, 205);
			if (t[0] === 71 && t[188] === 71) this.packetOffset = 0, this.packetStride = 188;
			else if (t[0] === 71 && t[204] === 71) this.packetOffset = 0, this.packetStride = 204;
			else if (t[4] === 71 && t[196] === 71) this.packetOffset = 4, this.packetStride = 192;
			else throw Error("Unreachable.");
			this.minReferencePointByteDistance = 256 * this.packetStride;
			let n = this.packetOffset, r = null, i = !1, a = !1;
			for (;;) {
				let e = await this.readPacketHeader(n);
				if (!e) break;
				if (e.payloadUnitStartIndicator === 0) {
					n += this.packetStride;
					continue;
				}
				if (a && !this.elementaryStreams.some((t) => t.pid === e.pid)) {
					n += this.packetStride;
					continue;
				}
				let t = await this.readSection(n, !0, !a);
				if (!t) break;
				let o = !1;
				if (!a && t.pid !== 0 && !(t.payload[0] === 0 && t.payload[1] === 0 && t.payload[2] === 1)) {
					let e = new O(t.payload), n = e.readAlignedByte();
					e.skipBits(8 * n), o = e.readBits(8) === 2;
				}
				if (t.pid === 0 && !i) {
					let e = new O(t.payload), n = e.readAlignedByte();
					e.skipBits(8 * n), e.skipBits(14);
					let a = e.readBits(10);
					for (e.skipBits(40); 8 * (a + 3) - e.pos > 32;) {
						let t = e.readBits(16);
						e.skipBits(3);
						let n = e.readBits(13);
						if (t !== 0) {
							if (r !== null) throw Error("Only files with a single program are supported.");
							r = n;
						}
					}
					if (r === null) throw Error("Program Association Table must link to a Program Map Table.");
					i = !0;
				} else if ((t.pid === r || o) && !a) {
					let e = new O(t.payload), n = e.readAlignedByte();
					e.skipBits(8 * n), e.skipBits(12);
					let r = e.readBits(12);
					e.skipBits(43), e.readBits(13), e.skipBits(6);
					let i = e.readBits(10);
					for (e.skipBits(8 * i); 8 * (r + 3) - e.pos > 32;) {
						let t = e.readBits(8);
						e.skipBits(3);
						let n = e.readBits(13);
						e.skipBits(6);
						let r = e.readBits(10), i = e.pos + 8 * r, a = !1, o = !1;
						for (; e.pos < i;) {
							let t = e.readBits(8), n = e.readBits(8);
							t === 106 ? a = !0 : (t === 122 || t === 204) && (o = !0), e.skipBits(8 * n);
						}
						let s = null;
						switch (t) {
							case 27:
							case 36:
								s = {
									type: "video",
									codec: t === 27 ? "avc" : "hevc",
									decoderConfig: null,
									avcCodecInfo: null,
									hevcCodecInfo: null,
									colorSpace: {
										primaries: null,
										transfer: null,
										matrix: null,
										fullRange: null
									},
									width: -1,
									height: -1,
									squarePixelWidth: -1,
									squarePixelHeight: -1,
									reorderSize: -1
								};
								break;
							case 3:
							case 4:
							case 15:
							case 129:
							case 135:
								{
									let e;
									if (t === 3 || t === 4) e = "mp3";
									else if (t === 15) e = "aac";
									else if (t === 129) e = "ac3";
									else if (t === 135) e = "eac3";
									else throw Error("Unreachable.");
									s = {
										type: "audio",
										codec: e,
										decoderConfig: null,
										aacCodecInfo: null,
										numberOfChannels: -1,
										sampleRate: -1
									};
								}
								break;
							case 6:
								o ? s = {
									type: "audio",
									codec: "eac3",
									decoderConfig: null,
									aacCodecInfo: null,
									numberOfChannels: -1,
									sampleRate: -1
								} : a && (s = {
									type: "audio",
									codec: "ac3",
									decoderConfig: null,
									aacCodecInfo: null,
									numberOfChannels: -1,
									sampleRate: -1
								});
								break;
							default: Bi.has(t) || (D._warn(`Note: MPEG-TS streams with stream_type 0x${t.toString(16)} are not currently supported.`), Bi.add(t));
						}
						s && this.elementaryStreams.push({
							demuxer: this,
							pid: n,
							streamType: t,
							initialized: !1,
							firstSection: null,
							canBeTrustedWithKeyPackets: !1,
							info: s,
							referencePesPackets: []
						});
					}
					a = !0;
				} else {
					let e = this.elementaryStreams.find((e) => e.pid === t.pid);
					outer: if (e && !e.initialized) {
						let n = Ui(t, !0);
						if (!n) throw Error(`Couldn't read first PES packet for Elementary Stream with PID ${e.pid}`);
						if (e.firstSection = t, e.canBeTrustedWithKeyPackets = t.randomAccessIndicator === 1, this.input._initInput) {
							let n = (await this.input._initInput._getDemuxer()).elementaryStreams.find((n) => n.pid === t.pid && n.info.codec === e.info.codec);
							if (n) {
								e.info = n.info, e.initialized = !0;
								break outer;
							}
						}
						let r = new Ji(e, n);
						if (e.info.type === "video") {
							for (;;) {
								let t = r;
								if (t.suppliedPacket = null, await r.markNextPacket(), e.info.codec === "avc") {
									if (!r.suppliedPacket) throw Error("Invalid AVC video stream; could not extract AVCDecoderConfigurationRecord from any packet.");
									if (e.info.avcCodecInfo = fn(r.suppliedPacket.data), !e.info.avcCodecInfo) continue;
									let t = e.info.avcCodecInfo.sequenceParameterSets[0];
									c(t);
									let n = gn(t);
									e.info.width = n.displayWidth, e.info.height = n.displayHeight;
									let i = n.pixelAspectRatio.num, a = n.pixelAspectRatio.den;
									i > 0 && a > 0 && (i > a ? (e.info.squarePixelWidth = Math.round(e.info.width * i / a), e.info.squarePixelHeight = e.info.height) : (e.info.squarePixelWidth = e.info.width, e.info.squarePixelHeight = Math.round(e.info.height * a / i))), e.info.colorSpace = {
										primaries: b[n.colourPrimaries],
										transfer: S[n.transferCharacteristics],
										matrix: ee[n.matrixCoefficients],
										fullRange: !!n.fullRangeFlag
									}, e.info.reorderSize = n.maxDecFrameBuffering;
									break;
								} else if (e.info.codec === "hevc") {
									if (!r.suppliedPacket) throw Error("Invalid HEVC video stream; could not extract HVCDecoderConfigurationRecord from first packet.");
									if (e.info.hevcCodecInfo = Sn(r.suppliedPacket.data), !e.info.hevcCodecInfo) continue;
									let t = e.info.hevcCodecInfo.arrays.find((e) => e.nalUnitType === j.SPS_NUT).nalUnits[0];
									c(t);
									let n = xn(t);
									e.info.width = n.displayWidth, e.info.height = n.displayHeight, n.pixelAspectRatio.num > n.pixelAspectRatio.den ? (e.info.squarePixelWidth = Math.round(e.info.width * n.pixelAspectRatio.num / n.pixelAspectRatio.den), e.info.squarePixelHeight = e.info.height) : (e.info.squarePixelWidth = e.info.width, e.info.squarePixelHeight = Math.round(e.info.height * n.pixelAspectRatio.den / n.pixelAspectRatio.num)), e.info.colorSpace = {
										primaries: b[n.colourPrimaries],
										transfer: S[n.transferCharacteristics],
										matrix: ee[n.matrixCoefficients],
										fullRange: !!n.fullRangeFlag
									}, e.info.reorderSize = n.maxDecFrameBuffering;
									break;
								} else throw Error("Unhandled.");
							}
							e.info.decoderConfig = {
								codec: Dt({
									width: e.info.width,
									height: e.info.height,
									codec: e.info.codec,
									codecDescription: null,
									colorSpace: e.info.colorSpace,
									avcType: 1,
									avcCodecInfo: e.info.avcCodecInfo,
									hevcCodecInfo: e.info.hevcCodecInfo,
									vp9CodecInfo: null,
									av1CodecInfo: null,
									proresFormat: null
								}),
								codedWidth: e.info.width,
								codedHeight: e.info.height,
								colorSpace: e.info.colorSpace
							}, (e.info.width !== e.info.squarePixelWidth || e.info.height !== e.info.squarePixelHeight) && (e.info.decoderConfig.displayAspectWidth = e.info.squarePixelWidth, e.info.decoderConfig.displayAspectHeight = e.info.squarePixelHeight), e.initialized = !0;
						} else {
							if (await r.markNextPacket(), !r.suppliedPacket) throw Error(`Couldn't parse first media packet for Elementary Stream with PID ${e.pid}`);
							if (e.info.codec === "aac") {
								let t = Ti(Ps.tempFromBytes(r.suppliedPacket.data));
								if (!t) throw Error("Invalid AAC audio stream; could not read ADTS frame header from first packet.");
								e.info.aacCodecInfo = {
									isMpeg2: !1,
									objectType: t.objectType
								}, e.info.numberOfChannels = ut[t.channelConfiguration], e.info.sampleRate = lt[t.samplingFrequencyIndex];
							} else if (e.info.codec === "mp3") {
								let t = Xt(W(Ps.tempFromBytes(r.suppliedPacket.data)), r.suppliedPacket.data.byteLength);
								if (!t.header) throw Error("Invalid MP3 audio stream; could not read frame header from first packet.");
								e.info.numberOfChannels = $t(t.header.channel), e.info.sampleRate = t.header.sampleRate;
							} else if (e.info.codec === "ac3") {
								let t = Un(r.suppliedPacket.data);
								if (!t) throw Error("Invalid AC-3 audio stream; could not read sync frame from first packet.");
								if (t.fscod === 3) throw Error("Invalid AC-3 audio stream; reserved sample rate code found in first packet.");
								e.info.numberOfChannels = Hn[t.acmod] + t.lfeon, e.info.sampleRate = en[t.fscod];
							} else if (e.info.codec === "eac3") {
								let t = qn(r.suppliedPacket.data);
								if (!t) throw Error("Invalid E-AC-3 audio stream; could not read sync frame from first packet.");
								let n = Yn(t);
								if (n === null) throw Error("Invalid E-AC-3 audio stream; reserved sample rate code found in first packet.");
								e.info.numberOfChannels = Xn(t), e.info.sampleRate = n;
							} else throw Error("Unhandled.");
							e.info.decoderConfig = {
								codec: kt({
									codec: e.info.codec,
									codecDescription: null,
									aacCodecInfo: e.info.aacCodecInfo
								}),
								numberOfChannels: e.info.numberOfChannels,
								sampleRate: e.info.sampleRate
							}, e.initialized = !0;
						}
					}
				}
				if (a && this.elementaryStreams.every((e) => e.initialized)) break;
				n += this.packetStride;
			}
			if (!a) throw Error(i ? "No Program Map Table found in the file." : "No Program Association Table found in the file.");
			for (let e of this.elementaryStreams) e.info.type === "video" ? this.trackBackingEntries.push(new Gi(e)) : this.trackBackingEntries.push(new Ki(e));
		})();
	}
	async getTrackBackings() {
		return await this.readMetadata(), this.trackBackingEntries;
	}
	async getMetadataTags() {
		return {};
	}
	async getMimeType() {
		return await this.readMetadata(), Ri(await Promise.all(this.trackBackingEntries.map((e) => e.getDecoderConfig().then((e) => e?.codec ?? null))));
	}
	async readSection(e, t, n = !1) {
		let r = e, i = e, a = [], o = 0, s = null, c = !0, l = 0;
		for (;;) {
			let e = await this.readPacket(i);
			if (i += this.packetStride, !e) break;
			if (s) {
				if (e.pid !== s.pid) {
					if (n) break;
					continue;
				}
				if (e.payloadUnitStartIndicator === 1) break;
			} else {
				if (e.payloadUnitStartIndicator === 0) break;
				s = e;
			}
			let u = !!(e.adaptationFieldControl & 2), d = !!(e.adaptationFieldControl & 1), f = 0;
			if (u && (f = 1 + e.body[0], e === s && f > 1 && (l = e.body[1] >> 6 & 1)), d && (f === 0 ? (a.push(e.body), o += e.body.byteLength) : (a.push(e.body.subarray(f)), o += e.body.byteLength - f)), r = i, !t && o >= 64) {
				c = !1;
				break;
			}
			if (ce(this.sectionEndPositions, r, (e) => e) !== -1) {
				c = !1;
				break;
			}
		}
		if (c) {
			let e = w(this.sectionEndPositions, r, (e) => e);
			this.sectionEndPositions.splice(e + 1, 0, r);
		}
		if (!s) return null;
		let u;
		if (a.length === 1) u = a[0];
		else {
			let e = a.reduce((e, t) => e + t.length, 0);
			u = new Uint8Array(e);
			let t = 0;
			for (let e of a) u.set(e, t), t += e.length;
		}
		return {
			startPos: e,
			endPos: t ? r : null,
			pid: s.pid,
			payload: u,
			randomAccessIndicator: l
		};
	}
	async readPacketHeader(e) {
		let t = this.reader.requestSlice(e, 4);
		if (t instanceof Promise && (t = await t), !t) return null;
		if (H(t) !== 71) throw Error("Invalid TS packet sync byte. Likely an internal bug, please report this file.");
		let n = U(t);
		n >> 15;
		let r = n >> 14 & 1;
		n >> 13 & 1;
		let i = n & 8191, a = H(t);
		a >> 6;
		let o = a >> 4 & 3;
		return a & 15, {
			payloadUnitStartIndicator: r,
			pid: i,
			adaptationFieldControl: o
		};
	}
	async readPacket(e) {
		let t = this.reader.requestSlice(e, 188);
		if (t instanceof Promise && (t = await t), !t) return null;
		let n = V(t, 188);
		if (n[0] !== 71) throw Error("Invalid TS packet sync byte. Likely an internal bug, please report this file.");
		let r = (n[1] << 8) + n[2];
		r >> 15;
		let i = r >> 14 & 1;
		r >> 13 & 1;
		let a = r & 8191, o = n[3];
		o >> 6;
		let s = o >> 4 & 3;
		return o & 15, {
			payloadUnitStartIndicator: i,
			pid: a,
			adaptationFieldControl: s,
			body: n.subarray(4)
		};
	}
}, Hi = (e, t) => {
	if (e.payload.byteLength < 3) return null;
	let n = new O(e.payload);
	if (n.readBits(24) !== 1) return null;
	let r = n.readBits(8);
	if (n.skipBits(16), r === 188 || r === 190 || r === 191 || r === 240 || r === 241 || r === 255 || r === 242 || r === 248) return null;
	n.skipBits(8);
	let i = n.readBits(2);
	n.skipBits(14);
	let a = null;
	if (i === 2 || i === 3) a = 0, n.skipBits(4), a += n.readBits(3) * (1 << 30), n.skipBits(1), a += n.readBits(15) * 32768, n.skipBits(1), a += n.readBits(15);
	else if (t) throw Error(zi);
	return {
		sectionStartPos: e.startPos,
		sectionEndPos: e.endPos,
		pts: a,
		randomAccessIndicator: e.randomAccessIndicator
	};
}, Ui = (e, t) => {
	c(e.endPos !== null);
	let n = Hi(e, t);
	if (!n) return null;
	let r = new O(e.payload);
	r.skipBits(32);
	let i = r.readBits(16);
	r.skipBits(16);
	let a = r.readBits(8), o = r.pos + 8 * a;
	r.pos = o;
	let s = o / 8;
	c(Number.isInteger(s));
	let l = e.payload.subarray(s, i > 0 ? 6 + i : e.payload.byteLength);
	return {
		...n,
		data: l
	};
}, Wi = class e {
	constructor(e) {
		this.elementaryStream = e, this.packetBuffers = /* @__PURE__ */ new WeakMap(), this.packetSectionStarts = /* @__PURE__ */ new WeakMap();
	}
	getId() {
		return this.elementaryStream.pid;
	}
	getNumber() {
		let t = this.elementaryStream.demuxer, n = this.elementaryStream.info.type, r = 0;
		for (let i of t.trackBackingEntries) if (i.getType() === n && r++, c(i instanceof e), i.elementaryStream === this.elementaryStream) break;
		return r;
	}
	getCodec() {
		throw Error("Not implemented on base class.");
	}
	getInternalCodecId() {
		return this.elementaryStream.streamType;
	}
	getName() {
		return null;
	}
	getLanguageCode() {
		return "und";
	}
	getDisposition() {
		return {
			...st,
			primary: !1
		};
	}
	getTimeResolution() {
		return Li;
	}
	isRelativeToUnixEpoch() {
		return !1;
	}
	getUnixTimeForTimestamp() {
		return null;
	}
	getPairingMask() {
		return 1n;
	}
	getBitrate() {
		return null;
	}
	getAverageBitrate() {
		return null;
	}
	async getDurationFromMetadata() {
		return null;
	}
	async getLiveRefreshInterval() {
		return null;
	}
	createEncodedPacket(e, t, n) {
		let r;
		return r = this.allPacketsAreKeyPackets() || e.randomAccessIndicator === 1 ? "key" : "delta", new N(n.metadataOnly ? Qn : e.data, r, e.pts / Li, Math.max(t / Li, 0), e.sequenceNumber, e.data.byteLength);
	}
	async getFirstPacket(e) {
		let t = this.elementaryStream.firstSection;
		c(t);
		let n = Ui(t, !0);
		c(n);
		let r = new Ji(this.elementaryStream, n), i = new Yi(this, r), a = await i.readNext();
		if (!a) return null;
		let o = this.createEncodedPacket(a.packet, a.duration, e);
		return this.packetBuffers.set(o, i), this.packetSectionStarts.set(o, a.packet.sectionStartPos), o;
	}
	async getNextPacket(e, t) {
		let n = this.packetBuffers.get(e);
		if (n) {
			let r = await n.readNext();
			if (!r) return null;
			this.packetBuffers.delete(e);
			let i = this.createEncodedPacket(r.packet, r.duration, t);
			return this.packetBuffers.set(i, n), this.packetSectionStarts.set(i, r.packet.sectionStartPos), i;
		}
		let r = this.packetSectionStarts.get(e);
		if (r === void 0) throw Error("Packet was not created from this track.");
		let i = await this.elementaryStream.demuxer.readSection(r, !0);
		c(i);
		let a = Ui(i, !0);
		c(a);
		let o = new Ji(this.elementaryStream, a);
		n = new Yi(this, o);
		let s = e.sequenceNumber;
		for (;;) {
			let e = await n.readNext();
			if (!e) return null;
			if (e.packet.sequenceNumber > s) {
				let r = this.createEncodedPacket(e.packet, e.duration, t);
				return this.packetBuffers.set(r, n), this.packetSectionStarts.set(r, e.packet.sectionStartPos), r;
			}
		}
	}
	async getNextKeyPacket(e, t) {
		let n = e;
		for (;;) {
			if (n = await this.getNextPacket(n, t), !n) return null;
			if (n.type === "key") return n;
		}
	}
	getPacket(e, t) {
		return this.doPacketLookup(e, !1, t);
	}
	getKeyPacket(e, t) {
		return this.doPacketLookup(e, !0, t);
	}
	async doPacketLookup(e, t, n) {
		let r = Se(e * Li), i = this.elementaryStream.demuxer, { reader: a, seekChunkSize: o } = i, s = this.elementaryStream.pid, l = async (e, t, n) => {
			let r = e;
			for (; r < t;) {
				let e = await i.readPacketHeader(r);
				if (!e) return null;
				if (e.pid === s && e.payloadUnitStartIndicator === 1) {
					let e = await i.readSection(r, n);
					if (!e) return null;
					let t = Hi(e, !1);
					if (t && t.pts !== null) return {
						pesPacketHeader: t,
						section: e
					};
				}
				r += i.packetStride;
			}
			return null;
		}, d = this.elementaryStream.firstSection;
		c(d);
		let f = Hi(d, !0);
		if (c(f), r < f.pts) return null;
		let p, m = this.elementaryStream.referencePesPackets, h = w(m, r, (e) => e.pts), g = h === -1 ? null : m[h];
		if (g && r - g.pts < 9e4 / 2) p = g.sectionStartPos;
		else {
			let e = 0;
			if (a.fileSize !== null) {
				let t = Math.ceil(a.fileSize / o);
				if (t > 1) {
					let n = 0, a = t - 1;
					for (e = n; n <= a;) {
						let t = Math.floor((n + a) / 2), s = Te(t * o, i.packetStride) + f.sectionStartPos, c = await l(s, s + o, !1);
						if (!c) {
							a = t - 1;
							continue;
						}
						c.pesPacketHeader.pts <= r ? (e = t, n = t + 1) : a = t - 1;
					}
				}
			}
			p = Te(e * o, i.packetStride) + f.sectionStartPos;
		}
		let _ = (await l(p, a.fileSize ?? Infinity, !1))?.pesPacketHeader ?? null;
		_ ||= f;
		let v = this.getReorderSize(), y = async (e, t) => {
			let a = await i.readSection(e, !0);
			c(a);
			let o = Ui(a, !0);
			c(o);
			let s = new Ji(this.elementaryStream, o), l = new Yi(this, s);
			for (; !((u(l.presentationOrderPackets)?.pts ?? -Infinity) >= r || !await l.readNextPacket()););
			let d = fe(l.presentationOrderPackets, t);
			if (d === -1) return null;
			let f = l.presentationOrderPackets[d], p = d === 0 ? 0 : f.pts - l.presentationOrderPackets[d - 1].pts;
			for (; l.decodeOrderPackets[0] !== f;) l.decodeOrderPackets.shift();
			l.lastDuration = p;
			let m = await l.readNext();
			c(m);
			let h = this.createEncodedPacket(m.packet, m.duration, n);
			return this.packetBuffers.set(h, l), this.packetSectionStarts.set(h, m.packet.sectionStartPos), h;
		};
		if (!t || this.allPacketsAreKeyPackets()) {
			outer: for (;;) {
				let e = _.sectionStartPos + i.packetStride;
				for (;;) {
					let t = await i.readPacketHeader(e);
					if (!t) break outer;
					if (t.pid === s && t.payloadUnitStartIndicator === 1) {
						let t = await i.readSection(e, !1);
						if (t) {
							let e = Hi(t, !1);
							if (e && e.pts !== null) {
								if (e.pts > r) break outer;
								_ = e, qi(this.elementaryStream, _);
								break;
							}
						}
					}
					e += i.packetStride;
				}
			}
			outer: for (let e = 0; e < v + 1; e++) {
				let e = _.sectionStartPos - i.packetStride;
				for (; e >= i.packetOffset;) {
					let t = await i.readPacketHeader(e);
					if (!t) break outer;
					if (t.pid === s && t.payloadUnitStartIndicator === 1) {
						let t = await i.readSection(e, !1);
						if (t) {
							let e = Hi(t, !1);
							if (e && e.pts !== null) {
								_ = e;
								break;
							}
						}
					}
					e -= i.packetStride;
				}
			}
			return y(_.sectionStartPos, (e) => e.pts <= r);
		} else {
			let e = p, t = null, n = !this.elementaryStream.canBeTrustedWithKeyPackets;
			for (;;) {
				let u = null, p = e <= f.sectionStartPos, m, h = null;
				if (p) m = f, h = d;
				else {
					let t = await l(e, a.fileSize ?? Infinity, n);
					m = t?.pesPacketHeader ?? null, h = t?.section ?? null;
				}
				let g = !1, _ = 0;
				outer: for (; m && !(t !== null && m.sectionStartPos >= t);) {
					if (m.pts <= r) {
						let e;
						if (this.elementaryStream.canBeTrustedWithKeyPackets) e = m.randomAccessIndicator === 1;
						else {
							c(h);
							let t = Ui(h, !0);
							c(t);
							let n = new Ji(this.elementaryStream, t);
							await n.markNextPacket(), e = n.suppliedPacket?.randomAccessIndicator === 1;
						}
						e && (u = m);
					}
					if (m.pts > r && (g = !0), g && (_++, _ > v)) break;
					let e = m.sectionStartPos + i.packetStride;
					for (;;) {
						let t = await i.readPacketHeader(e);
						if (!t) break outer;
						if (t.pid === s && t.payloadUnitStartIndicator === 1) {
							let t = await i.readSection(e, n);
							if (t) {
								let e = Hi(t, !1);
								if (e && e.pts !== null) {
									m = e, h = t, qi(this.elementaryStream, m);
									break;
								}
							}
						}
						e += i.packetStride;
					}
				}
				if (u) {
					let e = u;
					if (_ === 0) outer: for (let t = 0; t < v; t++) {
						let t = e.sectionStartPos - i.packetStride;
						for (; t >= i.packetOffset;) {
							let r = await i.readPacketHeader(t);
							if (!r) break outer;
							if (r.pid === s && r.payloadUnitStartIndicator === 1) {
								let r = await i.readSection(t, n);
								if (r) {
									let t = Hi(r, !1);
									if (t && t.pts !== null) {
										e = t;
										break;
									}
								}
							}
							t -= i.packetStride;
						}
					}
					let t = await y(e.sectionStartPos, (e) => e.pts <= r && e.randomAccessIndicator === 1);
					return c(t), t;
				}
				if (p) return null;
				t = e, e = Math.max(Te(e - f.sectionStartPos - o, i.packetStride) + f.sectionStartPos, f.sectionStartPos);
			}
		}
	}
}, Gi = class extends Wi {
	getType() {
		return "video";
	}
	getCodec() {
		return this.elementaryStream.info.codec;
	}
	getCodedWidth() {
		return this.elementaryStream.info.width;
	}
	getCodedHeight() {
		return this.elementaryStream.info.height;
	}
	getSquarePixelWidth() {
		return this.elementaryStream.info.squarePixelWidth;
	}
	getSquarePixelHeight() {
		return this.elementaryStream.info.squarePixelHeight;
	}
	getRotation() {
		return 0;
	}
	async getColorSpace() {
		return this.elementaryStream.info.colorSpace;
	}
	async canBeTransparent() {
		return !1;
	}
	async getDecoderConfig() {
		return c(this.elementaryStream.info.decoderConfig), this.elementaryStream.info.decoderConfig;
	}
	allPacketsAreKeyPackets() {
		return !1;
	}
	getReorderSize() {
		return this.elementaryStream.info.reorderSize;
	}
}, Ki = class extends Wi {
	getType() {
		return "audio";
	}
	getCodec() {
		return this.elementaryStream.info.codec;
	}
	getNumberOfChannels() {
		return this.elementaryStream.info.numberOfChannels;
	}
	getSampleRate() {
		return this.elementaryStream.info.sampleRate;
	}
	async getDecoderConfig() {
		return c(this.elementaryStream.info.decoderConfig), this.elementaryStream.info.decoderConfig;
	}
	allPacketsAreKeyPackets() {
		return !0;
	}
	getReorderSize() {
		return 0;
	}
}, qi = (e, t) => {
	let n = e.referencePesPackets, r = w(n, t.sectionStartPos, (e) => e.sectionStartPos);
	if (r >= 0) {
		let i = n[r];
		if (t.pts <= i.pts) return !1;
		let a = e.demuxer.minReferencePointByteDistance;
		if (t.sectionStartPos - i.sectionStartPos < a) return !1;
		if (r < n.length - 1) {
			let e = n[r + 1];
			if (e.pts < t.pts || e.sectionStartPos - t.sectionStartPos < a) return !1;
		}
	}
	return n.splice(r + 1, 0, t), !0;
}, Ji = class {
	constructor(e, t) {
		this.currentPos = 0, this.pesPackets = [], this.currentPesPacketIndex = 0, this.currentPesPacketPos = 0, this.endPos = 0, this.lastSuppliedPesPacket = null, this.nextPts = null, this.suppliedPacket = null, this.elementaryStream = e, this.pid = e.pid, this.demuxer = e.demuxer, this.startingPesPacket = t;
	}
	ensureBuffered(e) {
		let t = this.endPos - this.currentPos;
		return t >= e ? e : this.bufferData(e - t).then(() => Math.min(this.endPos - this.currentPos, e));
	}
	getCurrentPesPacket() {
		let e = this.pesPackets[this.currentPesPacketIndex];
		return c(e), e;
	}
	async bufferData(e) {
		let t = this.endPos + e;
		for (; this.endPos < t;) {
			let e;
			if (this.pesPackets.length === 0) e = this.startingPesPacket;
			else {
				let t = u(this.pesPackets).sectionEndPos;
				for (c(t !== null);;) {
					let n = await this.demuxer.readPacketHeader(t);
					if (!n) return;
					if (n.pid === this.pid) {
						let n = await this.demuxer.readSection(t, !0);
						if (!n) return;
						let r = Ui(n, !1);
						if (r) {
							e = r;
							break;
						}
					}
					t += this.demuxer.packetStride;
				}
			}
			this.pesPackets.push(e), this.endPos += e.data.byteLength;
		}
	}
	readBytes(e) {
		let t = this.getCurrentPesPacket(), n = this.currentPos - this.currentPesPacketPos, r = n + e;
		if (this.currentPos += e, r <= t.data.byteLength) return t.data.subarray(n, r);
		let i = new Uint8Array(e);
		i.set(t.data.subarray(n));
		let a = t.data.byteLength - n;
		for (;;) {
			this.advanceCurrentPacket();
			let t = this.getCurrentPesPacket(), n = e - a;
			if (n <= t.data.byteLength) {
				i.set(t.data.subarray(0, n), a);
				break;
			}
			i.set(t.data, a), a += t.data.byteLength;
		}
		return i;
	}
	readU8() {
		let e = this.getCurrentPesPacket(), t = this.currentPos - this.currentPesPacketPos;
		return this.currentPos++, t < e.data.byteLength ? e.data[t] : (this.advanceCurrentPacket(), e = this.getCurrentPesPacket(), e.data[0]);
	}
	seekTo(e) {
		if (e !== this.currentPos) {
			if (e < this.currentPos) for (; e < this.currentPesPacketPos;) {
				this.currentPesPacketIndex--;
				let e = this.getCurrentPesPacket();
				this.currentPesPacketPos -= e.data.byteLength;
			}
			else for (;;) {
				let t = this.getCurrentPesPacket();
				if (e < this.currentPesPacketPos + t.data.byteLength) break;
				this.currentPesPacketPos += t.data.byteLength, this.currentPesPacketIndex++;
			}
			this.currentPos = e;
		}
	}
	skip(e) {
		this.seekTo(this.currentPos + e);
	}
	advanceCurrentPacket() {
		this.currentPesPacketPos += this.getCurrentPesPacket().data.byteLength, this.currentPesPacketIndex++;
	}
	async markNextPacket() {
		c(!this.suppliedPacket);
		let e = this.elementaryStream;
		if (e.info.type === "video") {
			let t = e.info.codec, n = 1024;
			if (t !== "avc" && t !== "hevc") throw Error("Unhandled.");
			let r = t === "avc" ? 1 : 2, i = null, a = !1, o = 0;
			for (;;) {
				let e = this.ensureBuffered(n);
				if (e instanceof Promise && (e = await e), e === 0) break;
				let s = this.currentPos, c = this.readBytes(e), l = c.byteLength, u = 0;
				for (; u < l;) {
					let e = c.indexOf(0, u);
					if (e === -1 || e >= l) break;
					u = e;
					let n = s + u;
					if (u + 3 >= l) {
						this.seekTo(n);
						break;
					}
					let d = c[u + 1], p = c[u + 2], m = c[u + 3], h = 0;
					if (d === 0 && p === 0 && m === 1 ? h = 4 : d === 0 && p === 1 && (h = 3), h === 0) {
						u++;
						continue;
					}
					let g = n;
					i ??= g;
					let _ = u + h, v = _ + r;
					if (v + (t === "avc" ? 6 : 1) > l) {
						this.seekTo(n);
						break;
					}
					let y = c[_], b, x, S;
					if (t === "avc") b = on(y), x = b === A.NON_IDR_SLICE || b === A.SLICE_DPA || b === A.IDR, S = b === A.SEI || b === A.SPS || b === A.PPS || b === A.AUD;
					else {
						if (b = bn(y), ((y & 1) << 5 | c[_ + 1] >> 3) > 0) {
							u += h;
							continue;
						}
						x = b <= j.RASL_R || b >= j.BLA_W_LP && b <= 21, S = b >= j.VPS_NUT && b <= 37 || b === j.PREFIX_SEI_NUT || b >= 41 && b <= 44 || b >= 48 && b <= 55;
					}
					let C = !1;
					if (x) {
						let e;
						if (t === "avc") {
							let t = f(new O(c.subarray(v, v + 6)));
							e = !a || t <= o, o = t;
						} else e = c[v] >> 7 == 1;
						e && (a ? C = !0 : a = !0);
					} else S && a && (C = !0);
					if (C) {
						let e = g - i;
						return this.seekTo(i), this.supplyPacket(e, 0);
					}
					u += h;
				}
				if (e < n) break;
			}
			if (i !== null && this.endPos > i) {
				let e = this.endPos - i;
				return this.seekTo(i), this.supplyPacket(e, 0);
			}
		} else {
			let t = e.info.codec;
			for (;;) {
				let n = this.ensureBuffered(128);
				n instanceof Promise && (n = await n);
				let r = this.currentPos;
				for (; this.currentPos - r < n;) {
					let n = this.readU8();
					if (t === "aac") {
						if (n !== 255) continue;
						this.skip(-1);
						let t = this.currentPos, r = this.ensureBuffered(9);
						if (r instanceof Promise && (r = await r), r < 9) return;
						let i = this.readBytes(9), a = Ti(Ps.tempFromBytes(i));
						if (a) {
							this.seekTo(t);
							let n = this.ensureBuffered(a.frameLength);
							return n instanceof Promise && (n = await n), this.supplyPacket(n, Math.round(Ei * Li / e.info.sampleRate));
						} else this.seekTo(t + 1);
					} else if (t === "mp3") {
						if (n !== 255) continue;
						this.skip(-1);
						let t = this.currentPos, r = this.ensureBuffered(4);
						if (r instanceof Promise && (r = await r), r < 4) return;
						let i = Xt(h(this.readBytes(4)).getUint32(0), null);
						if (i.header) {
							this.seekTo(t);
							let n = this.ensureBuffered(i.header.totalSize);
							n instanceof Promise && (n = await n);
							let r = i.header.audioSamplesInFrame * Li / e.info.sampleRate;
							return this.supplyPacket(n, Math.round(r));
						} else this.seekTo(t + 1);
					} else if (t === "ac3") {
						if (n !== 11) continue;
						this.skip(-1);
						let t = this.currentPos, r = this.ensureBuffered(5);
						if (r instanceof Promise && (r = await r), r < 5) return;
						let i = this.readBytes(5);
						if (i[0] !== 11 || i[1] !== 119) {
							this.seekTo(t + 1);
							continue;
						}
						let a = i[4] >> 6, o = i[4] & 63;
						if (a === 3 || o > 37) {
							this.seekTo(t + 1);
							continue;
						}
						let s = Wn[3 * o + a];
						c(s !== void 0), this.seekTo(t), r = this.ensureBuffered(s), r instanceof Promise && (r = await r);
						let l = Math.round(Gn * Li / e.info.sampleRate);
						return this.supplyPacket(r, l);
					} else if (t === "eac3") {
						if (n !== 11) continue;
						this.skip(-1);
						let t = this.currentPos, r = this.ensureBuffered(5);
						if (r instanceof Promise && (r = await r), r < 5) return;
						let i = this.readBytes(5);
						if (i[0] !== 11 || i[1] !== 119) {
							this.seekTo(t + 1);
							continue;
						}
						let a = (((i[2] & 7) << 8 | i[3]) + 1) * 2, o = Kn[i[4] >> 6 == 3 ? 3 : i[4] >> 4 & 3];
						this.seekTo(t), r = this.ensureBuffered(a), r instanceof Promise && (r = await r);
						let s = o * 256, c = Math.round(s * Li / e.info.sampleRate);
						return this.supplyPacket(r, c);
					} else throw Error("Unhandled.");
				}
				if (n < 128) break;
			}
		}
	}
	supplyPacket(e, t) {
		let n = this.getCurrentPesPacket(), r;
		if (this.lastSuppliedPesPacket === n) c(this.nextPts !== null), r = this.nextPts;
		else {
			if (n.pts === null) throw Error(zi);
			r = n.pts, qi(this.elementaryStream, n);
		}
		this.lastSuppliedPesPacket = n, this.nextPts = r + t;
		let i = n.sectionStartPos, a = i + (this.currentPos - this.currentPesPacketPos), o = this.readBytes(e), s = n.randomAccessIndicator;
		if (s === 0 && !this.elementaryStream.canBeTrustedWithKeyPackets) {
			if (this.elementaryStream.info.type === "audio") s = 1;
			else if (this.elementaryStream.info.decoderConfig) {
				let e = zn(this.elementaryStream.info.codec, this.elementaryStream.info.decoderConfig, o) === "key";
				s = Number(e);
			}
		}
		this.suppliedPacket = {
			pts: r,
			data: o,
			sequenceNumber: a,
			sectionStartPos: i,
			randomAccessIndicator: s
		}, this.pesPackets.splice(0, this.currentPesPacketIndex), this.currentPesPacketIndex = 0;
	}
}, Yi = class {
	constructor(e, t) {
		this.decodeOrderPackets = [], this.reorderBuffer = [], this.presentationOrderPackets = [], this.reachedEnd = !1, this.lastDuration = 0, this.backing = e, this.context = t, this.reorderSize = e.getReorderSize(), c(this.reorderSize >= 0);
	}
	async readNext() {
		if (this.decodeOrderPackets.length === 0 && !await this.readNextPacket()) return null;
		await this.ensureCurrentPacketHasNext();
		let e = this.decodeOrderPackets[0], t = this.presentationOrderPackets.indexOf(e);
		c(t !== -1);
		let n;
		for (t === this.presentationOrderPackets.length - 1 ? n = this.lastDuration : (n = this.presentationOrderPackets[t + 1].pts - e.pts, this.lastDuration = n), this.decodeOrderPackets.shift(); this.presentationOrderPackets.length > 0;) {
			let e = this.presentationOrderPackets[0];
			if (this.decodeOrderPackets.includes(e)) break;
			this.presentationOrderPackets.shift();
		}
		return {
			packet: e,
			duration: n
		};
	}
	async readNextPacket() {
		if (this.reachedEnd) return !1;
		let e;
		return this.context.suppliedPacket || await this.context.markNextPacket(), e = this.context.suppliedPacket, this.context.suppliedPacket = null, e ? (this.decodeOrderPackets.push(e), this.processPacketThroughReorderBuffer(e), !0) : (this.reachedEnd = !0, this.flushReorderBuffer(), !1);
	}
	async ensureCurrentPacketHasNext() {
		let e = this.decodeOrderPackets[0];
		for (c(e);;) {
			let t = this.presentationOrderPackets.indexOf(e);
			if (t !== -1 && t <= this.presentationOrderPackets.length - 2 || !await this.readNextPacket()) break;
		}
	}
	processPacketThroughReorderBuffer(e) {
		if (this.reorderBuffer.push(e), this.reorderBuffer.length > this.reorderSize) {
			let e = 0;
			for (let t = 1; t < this.reorderBuffer.length; t++) this.reorderBuffer[t].pts < this.reorderBuffer[e].pts && (e = t);
			let t = this.reorderBuffer[e];
			this.presentationOrderPackets.push(t), this.reorderBuffer.splice(e, 1);
		}
	}
	flushReorderBuffer() {
		this.reorderBuffer.sort((e, t) => e.pts - t.pts), this.presentationOrderPackets.push(...this.reorderBuffer), this.reorderBuffer.length = 0;
	}
}, Xi = "application/vnd.apple.mpegurl", Zi = "#EXT-X-STREAM-INF:", Qi = "#EXT-X-I-FRAME-STREAM-INF:", $i = "#EXT-X-MEDIA:", ea = "#EXTINF:", ta = "#EXT-X-MAP:", na = "#EXT-X-KEY:", ra = "#EXT-X-MEDIA-SEQUENCE:", ia = "#EXT-X-BYTERANGE:", aa = "#EXT-X-PROGRAM-DATE-TIME:", oa = "#EXT-X-TARGETDURATION:", sa = (e) => e.length === 0 || e.startsWith("#") && !e.startsWith("#EXT"), ca = class {
	constructor(e) {
		this._attributes = {};
		let t = "", n = "", r = !1, i = !1;
		for (let a = 0; a < e.length; a++) {
			let o = e[a];
			o === "\"" ? i = !i : o === "=" && !r && !i ? r = !0 : o === "," && !i ? (t && (this._attributes[t.trim().toLowerCase()] = n), t = "", n = "", r = !1) : r ? n += o : t += o;
		}
		t && (this._attributes[t.trim().toLowerCase()] = n);
	}
	get(e) {
		return this._attributes[e.toLowerCase()] ?? null;
	}
	getAsNumber(e) {
		let t = this.get(e);
		if (t === null) return null;
		let n = Number(t);
		return Number.isFinite(n) ? n : null;
	}
	merge(e) {
		Object.assign(this._attributes, e._attributes);
	}
}, la = class {
	constructor(e, t, n) {
		this.nextInputCacheAge = 0, this.inputCache = [], this.trackBackingsPromise = null, this.firstSegment = null, this.firstSegmentFirstTimestamps = /* @__PURE__ */ new WeakMap(), this.firstTimestampCache = /* @__PURE__ */ new WeakMap(), this.input = e, this.path = t, this.trackDeclarations = n;
	}
	async getDurationFromMetadata(e) {
		let t = await this.getSegmentAt(Infinity, { skipLiveWait: e.skipLiveWait });
		return t ? t.timestamp + t.duration : null;
	}
	async getUnixTimeForTimestamp(e) {
		let t = await this.getSegmentAt(e, {});
		if (t ??= await this.getFirstSegment({}), !t || t.unixEpochTimestamp === null) return null;
		let n = e - t.timestamp;
		return t.unixEpochTimestamp + n;
	}
	async getTrackBackings() {
		return this.trackBackingsPromise ??= (async () => {
			let e = [];
			if (this.trackDeclarations) {
				for (let t of this.trackDeclarations) if (t.type === "video") {
					let n = Ye(e, (e) => e.getType() === "video") + 1;
					e.push(new da(this, t, n));
				} else if (t.type === "audio") {
					let n = Ye(e, (e) => e.getType() === "audio") + 1;
					e.push(new fa(this, t, n));
				}
			} else {
				if (this.firstSegment = await this.getFirstSegment({}), !this.firstSegment) return [];
				let t = await this.getInputForSegment(this.firstSegment).getTracks();
				for (let n of t) if (n.type === "video") {
					let t = Ye(e, (e) => e.getType() === "video") + 1;
					e.push(new da(this, {
						id: e.length + 1,
						type: "video"
					}, t));
				} else if (n.type === "audio") {
					let t = Ye(e, (e) => e.getType() === "audio") + 1;
					e.push(new fa(this, {
						id: e.length + 1,
						type: "audio"
					}, t));
				}
			}
			return e;
		})();
	}
	async getFirstTimestampForInput(e) {
		let t = this.firstTimestampCache.get(e);
		if (t !== void 0) return t;
		let n = await e.getFirstTimestamp();
		return this.firstTimestampCache.set(e, n), n;
	}
	async getMediaOffset(e, t) {
		let n = e.firstSegment ?? e, r;
		if (this.firstSegmentFirstTimestamps.has(n)) r = this.firstSegmentFirstTimestamps.get(n);
		else {
			let e = this.getInputForSegment(n);
			r = await this.getFirstTimestampForInput(e), this.firstSegmentFirstTimestamps.set(n, r);
		}
		if (n === e) return n.timestamp - r;
		let i = await this.getFirstTimestampForInput(t), a = e.timestamp - n.timestamp, o = i - r - a;
		return Math.abs(o) <= Math.min(.25, a) ? n.timestamp - r : e.timestamp - i;
	}
	dispose() {
		for (let e of this.inputCache) e.input.dispose();
		this.inputCache.length = 0;
	}
}, ua = class {
	constructor(e, t, n) {
		this.packetInfos = /* @__PURE__ */ new WeakMap(), this.hydrationPromise = null, this.firstInputTrack = null, this.segmentedInput = e, this.decl = t, this.number = n;
	}
	hydrate() {
		return this.hydrationPromise ??= (async () => {
			if (this.segmentedInput.firstSegment ??= await this.segmentedInput.getFirstSegment({}), !this.segmentedInput.firstSegment) throw Error("Missing first segment, can't retrieve track.");
			let e = (await this.segmentedInput.getInputForSegment(this.segmentedInput.firstSegment).getTracks()).find((e) => e.type === this.decl.type && e.number === this.number);
			if (!e) throw Error("No matching track found in underlying media data.");
			this.firstInputTrack = e;
		})();
	}
	getId() {
		return this.decl.id;
	}
	getType() {
		return this.decl.type;
	}
	getNumber() {
		return this.number;
	}
	delegate(e) {
		return this.firstInputTrack ? e() : this.hydrate().then(e);
	}
	async getDecoderConfig() {
		return this.delegate(() => this.firstInputTrack._backing.getDecoderConfig());
	}
	getHasOnlyKeyPackets() {
		return this.delegate(() => this.firstInputTrack._backing.getHasOnlyKeyPackets?.() ?? null);
	}
	getPairingMask() {
		return 1n;
	}
	getCodec() {
		return this.delegate(() => this.firstInputTrack._backing.getCodec());
	}
	getInternalCodecId() {
		return this.delegate(() => this.firstInputTrack._backing.getInternalCodecId());
	}
	getDisposition() {
		return this.delegate(() => this.firstInputTrack._backing.getDisposition());
	}
	getLanguageCode() {
		return this.delegate(() => this.firstInputTrack._backing.getLanguageCode());
	}
	getName() {
		return this.delegate(() => this.firstInputTrack._backing.getName());
	}
	getTimeResolution() {
		return this.delegate(() => this.firstInputTrack._backing.getTimeResolution());
	}
	async isRelativeToUnixEpoch() {
		return await this.hydrate(), c(this.segmentedInput.firstSegment), this.segmentedInput.firstSegment.unixEpochTimestamp === this.segmentedInput.firstSegment.timestamp;
	}
	getUnixTimeForTimestamp(e) {
		return this.segmentedInput.getUnixTimeForTimestamp(e);
	}
	getBitrate() {
		return this.delegate(() => this.firstInputTrack._backing.getBitrate());
	}
	getAverageBitrate() {
		return this.delegate(() => this.firstInputTrack._backing.getAverageBitrate());
	}
	getDurationFromMetadata(e) {
		return this.segmentedInput.getDurationFromMetadata(e);
	}
	getLiveRefreshInterval() {
		return this.segmentedInput.getLiveRefreshInterval();
	}
	async createAdjustedPacket(e, t, n) {
		c(e.sequenceNumber >= 0), c(this.segmentedInput.firstSegment);
		let r = await this.segmentedInput.getMediaOffset(t, n.input), i = t.timestamp - this.segmentedInput.firstSegment.timestamp, a = e.clone({
			timestamp: we(e.timestamp + r, await n.getTimeResolution()),
			sequenceNumber: Math.floor(1e8 * i) + e.sequenceNumber
		});
		return this.packetInfos.set(a, {
			segment: t,
			track: n,
			sourcePacket: e
		}), a;
	}
	async getFirstPacket(e) {
		await this.hydrate(), c(this.segmentedInput.firstSegment), c(this.firstInputTrack);
		let t = await this.firstInputTrack._backing.getFirstPacket(e);
		return t ? this.createAdjustedPacket(t, this.segmentedInput.firstSegment, this.firstInputTrack) : null;
	}
	getNextPacket(e, t) {
		return this._getNextInternal(e, t, !1);
	}
	getNextKeyPacket(e, t) {
		return this._getNextInternal(e, t, !0);
	}
	async _getNextInternal(e, t, n) {
		let r = this.packetInfos.get(e);
		if (!r) throw Error("Packet was not created from this track.");
		let i = n ? await r.track._backing.getNextKeyPacket(r.sourcePacket, t) : await r.track._backing.getNextPacket(r.sourcePacket, t);
		if (i) return this.createAdjustedPacket(i, r.segment, r.track);
		let a = r.segment;
		for (;;) {
			let e = await this.segmentedInput.getNextSegment(a, { skipLiveWait: t.skipLiveWait });
			if (!e) return null;
			let n = (await this.segmentedInput.getInputForSegment(e).getTracks()).find((e) => e.type === r.track.type && e.number === r.track.number);
			if (!n) {
				a = e;
				continue;
			}
			let i = await n._backing.getFirstPacket(t);
			return i ? this.createAdjustedPacket(i, e, n) : null;
		}
	}
	getPacket(e, t) {
		return this._getPacketInternal(e, t, !1);
	}
	getKeyPacket(e, t) {
		return this._getPacketInternal(e, t, !0);
	}
	async _getPacketInternal(e, t, n) {
		let r = await this.segmentedInput.getSegmentAt(e, { skipLiveWait: t.skipLiveWait });
		if (!r) return null;
		for (await this.hydrate(); r;) {
			let i = this.segmentedInput.getInputForSegment(r), a = (await i.getTracks()).find((e) => e.type === this.firstInputTrack.type && e.number === this.firstInputTrack.number);
			if (!a) {
				r = await this.segmentedInput.getPreviousSegment(r, { skipLiveWait: t.skipLiveWait });
				continue;
			}
			let o = e - await this.segmentedInput.getMediaOffset(r, i), s = n ? await a._backing.getKeyPacket(o, t) : await a._backing.getPacket(o, t);
			if (!s) {
				r = await this.segmentedInput.getPreviousSegment(r, { skipLiveWait: t.skipLiveWait });
				continue;
			}
			return this.createAdjustedPacket(s, r, a);
		}
		return null;
	}
}, da = class extends ua {
	getType() {
		return "video";
	}
	getCodec() {
		return this.delegate(() => this.firstInputTrack._backing.getCodec());
	}
	getCodedWidth() {
		return this.delegate(() => this.firstInputTrack._backing.getCodedWidth());
	}
	getCodedHeight() {
		return this.delegate(() => this.firstInputTrack._backing.getCodedHeight());
	}
	getSquarePixelWidth() {
		return this.delegate(() => this.firstInputTrack._backing.getSquarePixelWidth());
	}
	getSquarePixelHeight() {
		return this.delegate(() => this.firstInputTrack._backing.getSquarePixelHeight());
	}
	getRotation() {
		return this.delegate(() => this.firstInputTrack._backing.getRotation());
	}
	async getColorSpace() {
		return this.delegate(() => this.firstInputTrack._backing.getColorSpace());
	}
	async canBeTransparent() {
		return this.delegate(() => this.firstInputTrack._backing.canBeTransparent());
	}
	async getDecoderConfig() {
		return this.delegate(() => this.firstInputTrack._backing.getDecoderConfig());
	}
}, fa = class extends ua {
	getType() {
		return "audio";
	}
	getCodec() {
		return this.delegate(() => this.firstInputTrack._backing.getCodec());
	}
	getNumberOfChannels() {
		return this.delegate(() => this.firstInputTrack._backing.getNumberOfChannels());
	}
	getSampleRate() {
		return this.delegate(() => this.firstInputTrack._backing.getSampleRate());
	}
	async getDecoderConfig() {
		return this.delegate(() => this.firstInputTrack._backing.getDecoderConfig());
	}
};
(/* @__PURE__ */ e(((e, t) => {
	t.exports = {};
})))(), Ke();
var pa = Infinity;
typeof FinalizationRegistry < "u" && new FinalizationRegistry((e) => {
	e();
});
var ma = class extends tt {
	constructor() {
		super(), this._disposed = !1, this._refCount = 0, this._usedForHls = !1, this._refFinalizationRegistry = null, this._sizePromise = null, this.onread = null, typeof FinalizationRegistry < "u" && (this._refFinalizationRegistry = new FinalizationRegistry((e) => {
			e._decrementRefCount();
		}));
	}
	async getSizeOrNull() {
		if (this._disposed) throw new z();
		return this._sizePromise ??= (async () => {
			let e = this._getFileSize();
			return e === void 0 ? (await this._read(0, 1, 0, pa), e = this._getFileSize(), c(e !== void 0), e) : e;
		})();
	}
	async getSize() {
		if (this._disposed) throw new z();
		let e = await this.getSizeOrNull();
		if (e === null) throw Error("Cannot determine the size of an unsized source.");
		return e;
	}
	slice(e, t) {
		if (!Number.isInteger(e) || e < 0) throw TypeError("offset must be a non-negative integer.");
		if (t !== void 0 && (!Number.isInteger(t) || t < 0)) throw TypeError("length, when provided, must be a non-negative integer.");
		return new Ta(this, e, t);
	}
	_dispatchRead(e, t) {
		this.onread?.(e, t), this._emit("read", {
			start: e,
			end: t
		});
	}
	ref() {
		return new ha(this);
	}
	_incrementRefCount() {
		this._refCount++;
	}
	_decrementRefCount() {
		this._refCount--, this._refCount === 0 && (this._dispose(), this._disposed = !0);
	}
}, ha = class {
	constructor(e) {
		if (this._freed = !1, e._disposed) throw Error("Cannot ref a disposed source.");
		e._incrementRefCount(), e._refFinalizationRegistry?.register(this, e, this), this._source = e;
	}
	get source() {
		if (!this._source) throw Error("Can't get source; ref has already been freed.");
		return this._source;
	}
	get freed() {
		return this._freed;
	}
	free() {
		if (this._freed) throw Error("Illegal operation: double free on SourceRef.");
		let e = this.source;
		c(e._refCount > 0), e._decrementRefCount(), e._refFinalizationRegistry?.unregister(this), this._freed = !0, this._source = null;
	}
	[Symbol.dispose]() {
		this.freed || this.free();
	}
}, ga = class extends ma {
	constructor(e, t) {
		if (typeof e != "string") throw TypeError("rootPath must be a string.");
		if (typeof t != "function") throw TypeError("requestHandler must be a function.");
		super(), this.rootPath = e, this.requestHandler = t;
	}
	_resolveRequest(e) {
		let t = this.requestHandler(e), n = (e) => {
			if (!(e instanceof ma || e instanceof ha)) throw TypeError("requestHandler must return or resolve to a Source or SourceRef.");
			let t = e instanceof ma ? e.ref() : e;
			return t.source._usedForHls ||= this._usedForHls, t;
		};
		return t instanceof Promise ? t.then(n) : n(t);
	}
}, _a = (e, t) => e.path === t.path, va = class extends ga {
	constructor() {
		super(...arguments), this._root = null, this._rootRequest = null;
	}
	_read(e, t, n, r) {
		if (!this._root) {
			if (!this._rootRequest) {
				let e = this._resolveRequest({
					path: this.rootPath,
					isRoot: !0
				}), t = (e) => {
					let t = e instanceof ma ? e.ref() : e;
					return this._root = t, this._rootRequest = null, t;
				};
				e instanceof Promise ? this._rootRequest = e.then(t) : (t(e), c(this._root));
			}
			if (this._rootRequest) return this._rootRequest.then((i) => i.source._read(e, t, n, r));
		}
		return this._root.source._read(e, t, n, r);
	}
	_getFileSize() {
		if (this._root) return this._root.source._getFileSize();
	}
	_dispose() {
		this._root ? this._root.free() : this._rootRequest && this._rootRequest.then((e) => e.free());
	}
}, ya = class extends ma {
	constructor(e, t = {}) {
		if (!(e instanceof Blob)) throw TypeError("blob must be a Blob.");
		if (!t || typeof t != "object") throw TypeError("options must be an object.");
		if (t.maxCacheSize !== void 0 && (!qe(t.maxCacheSize) || t.maxCacheSize < 0)) throw TypeError("options.maxCacheSize, when provided, must be a non-negative number.");
		if (t.useStreamReader !== void 0 && typeof t.useStreamReader != "boolean") throw TypeError("options.useStreamReader, when provided, must be a boolean.");
		super(), this._readers = /* @__PURE__ */ new WeakMap(), this._blob = e, this._options = t, this._orchestrator = new wa({
			maxCacheSize: t.maxCacheSize ?? 8 * 2 ** 20,
			maxWorkerCount: 4,
			runWorker: this._runWorker.bind(this),
			prefetchProfile: Ca.fileSystem
		}), this._orchestrator.fileSize = e.size;
	}
	_getFileSize() {
		return this._orchestrator.fileSize;
	}
	_read(e, t, n, r) {
		return this._orchestrator.read(e, t, n, r);
	}
	async _runWorker(e) {
		c(e.strictTarget);
		let t = this._readers.get(e);
		for (t === void 0 && (t = ("stream" in this._blob) && !Pe() && this._options.useStreamReader !== !1 ? this._blob.slice(e.currentPos).stream().getReader() : null, this._readers.set(e, t)); e.currentPos < e.targetPos && !e.aborted;) if (t) {
			let { done: n, value: r } = await t.read();
			if (n) throw this._orchestrator.onWorkerFinished(e), Error("Blob reader stopped unexpectedly before all requested data was read.");
			if (e.aborted) break;
			this._dispatchRead(e.currentPos, e.currentPos + r.length), this._orchestrator.supplyWorkerData(e, r);
		} else {
			let t = await this._blob.slice(e.currentPos, e.targetPos).arrayBuffer();
			if (e.aborted) break;
			this._dispatchRead(e.currentPos, e.currentPos + t.byteLength), this._orchestrator.supplyWorkerData(e, new Uint8Array(t));
		}
		this._orchestrator.signalWorkerStoppedRunning(e), e.aborted && await t?.cancel();
	}
	_dispose() {
		this._orchestrator.dispose();
	}
}, ba = .5 * 2 ** 20, xa = class extends ma {
	constructor(e) {
		if (!e || typeof e != "object") throw TypeError("options must be an object.");
		if (typeof e.getSize != "function") throw TypeError("options.getSize must be a function.");
		if (typeof e.read != "function") throw TypeError("options.read must be a function.");
		if (e.dispose !== void 0 && typeof e.dispose != "function") throw TypeError("options.dispose, when provided, must be a function.");
		if (e.maxCacheSize !== void 0 && (!qe(e.maxCacheSize) || e.maxCacheSize < 0)) throw TypeError("options.maxCacheSize, when provided, must be a non-negative number.");
		if (e.prefetchProfile && ![
			"none",
			"fileSystem",
			"network"
		].includes(e.prefetchProfile)) throw TypeError("options.prefetchProfile, when provided, must be one of 'none', 'fileSystem' or 'network'.");
		super(), this._options = e, this._orchestrator = new wa({
			maxCacheSize: e.maxCacheSize ?? 8 * 2 ** 20,
			maxWorkerCount: 2,
			prefetchProfile: Ca[e.prefetchProfile ?? "none"],
			runWorker: this._runWorker.bind(this)
		});
	}
	_getFileSize() {
		return this._orchestrator.fileSize ?? void 0;
	}
	_read(e, t, n, r) {
		if (this._orchestrator.fileSize !== null) return this._orchestrator.read(e, t, n, r);
		let i = this._options.getSize();
		if (i instanceof Promise) return i.then((i) => {
			if (!Number.isInteger(i) || i < 0) throw TypeError("options.getSize must return or resolve to a non-negative integer.");
			return this._orchestrator.fileSize = i, this._orchestrator.read(e, t, n, r);
		});
		if (!Number.isInteger(i) || i < 0) throw TypeError("options.getSize must return or resolve to a non-negative integer.");
		return this._orchestrator.fileSize = i, this._orchestrator.read(e, t, n, r);
	}
	async _runWorker(e) {
		for (; e.currentPos < e.targetPos && !e.aborted;) {
			let t = e.currentPos, n = e.targetPos, r = this._options.read(e.currentPos, n);
			if (r instanceof Promise && (r = await r), e.aborted) break;
			if (r instanceof Uint8Array) {
				if (r = m(r), r.length !== n - e.currentPos) throw Error(`options.read returned a Uint8Array with unexpected length: Requested ${n - e.currentPos} bytes, but got ${r.length}.`);
				this._dispatchRead(e.currentPos, e.currentPos + r.length), this._orchestrator.supplyWorkerData(e, r);
			} else if (r instanceof ReadableStream) {
				let i = r.getReader();
				for (; e.currentPos < n && !e.aborted;) {
					let { done: r, value: a } = await i.read();
					if (r) {
						if (e.currentPos < n) throw Error(`ReadableStream returned by options.read ended before supplying enough data. Requested ${n - t} bytes, but got ${e.currentPos - t}`);
						break;
					}
					if (!(a instanceof Uint8Array)) throw TypeError("ReadableStream returned by options.read must yield Uint8Array chunks.");
					if (e.aborted) break;
					let o = m(a);
					this._dispatchRead(e.currentPos, e.currentPos + o.length), this._orchestrator.supplyWorkerData(e, o);
				}
			} else throw TypeError("options.read must return or resolve to a Uint8Array or a ReadableStream.");
		}
		this._orchestrator.signalWorkerStoppedRunning(e);
	}
	_dispose() {
		this._orchestrator.dispose(), this._options.dispose?.();
	}
}, Sa = class extends ma {
	constructor(e, t = {}) {
		if (!(e instanceof ReadableStream)) throw TypeError("stream must be a ReadableStream.");
		if (!t || typeof t != "object") throw TypeError("options must be an object.");
		if (t.maxCacheSize !== void 0 && (!qe(t.maxCacheSize) || t.maxCacheSize < 0)) throw TypeError("options.maxCacheSize, when provided, must be a non-negative number.");
		super(), this._reader = null, this._cache = [], this._pendingSlices = [], this._currentIndex = 0, this._targetIndex = 0, this._maxRequestedIndex = 0, this._endIndex = null, this._pulling = !1, this._stream = e, this._maxCacheSize = t.maxCacheSize ?? 32 * 2 ** 20;
	}
	_getFileSize() {
		return this._endIndex;
	}
	_read(e, t) {
		if (this._endIndex !== null && t > this._endIndex) return null;
		this._maxRequestedIndex = Math.max(this._maxRequestedIndex, t);
		let n = w(this._cache, e, (e) => e.start), r = n === -1 ? null : this._cache[n];
		if (r && r.start <= e && t <= r.end) return {
			bytes: r.bytes,
			view: r.view,
			offset: r.start
		};
		let i = e, a = new Uint8Array(t - e);
		if (n !== -1) for (let r = n; r < this._cache.length; r++) {
			let n = this._cache[r];
			if (n.start >= t) break;
			let o = Math.max(e, n.start);
			o > i && this._throwDueToCacheMiss();
			let s = Math.min(t, n.end);
			o < s && (a.set(n.bytes.subarray(o - n.start, s - n.start), o - e), i = s);
		}
		if (i === t) return {
			bytes: a,
			view: h(a),
			offset: e
		};
		this._currentIndex > i && this._throwDueToCacheMiss();
		let { promise: o, resolve: s, reject: c } = T();
		return this._pendingSlices.push({
			start: e,
			end: t,
			bytes: a,
			resolve: s,
			reject: c
		}), this._targetIndex = Math.max(this._targetIndex, t), this._pulling || (this._pulling = !0, this._pull().catch((e) => {
			if (this._pulling = !1, this._pendingSlices.length > 0) this._pendingSlices.forEach((t) => t.reject(e)), this._pendingSlices.length = 0;
			else throw e;
		})), o;
	}
	_throwDueToCacheMiss() {
		throw Error("Read is before the cached region. With ReadableStreamSource, you must access the data more sequentially or increase the size of its cache.");
	}
	async _pull() {
		for (this._reader ??= this._stream.getReader(); this._currentIndex < this._targetIndex && !this._disposed;) {
			let { done: e, value: t } = await this._reader.read();
			if (e) {
				for (let e of this._pendingSlices) e.resolve(null);
				this._pendingSlices.length = 0, this._endIndex = this._currentIndex;
				break;
			}
			let n = this._currentIndex, r = this._currentIndex + t.byteLength;
			this._dispatchRead(n, r);
			for (let e = 0; e < this._pendingSlices.length; e++) {
				let i = this._pendingSlices[e], a = Math.max(n, i.start), o = Math.min(r, i.end);
				a < o && (i.bytes.set(t.subarray(a - n, o - n), a - i.start), o === i.end && (i.resolve({
					bytes: i.bytes,
					view: h(i.bytes),
					offset: i.start
				}), this._pendingSlices.splice(e, 1), e--));
			}
			for (this._cache.push({
				start: n,
				end: r,
				bytes: t,
				view: h(t),
				age: 0
			}); this._cache.length > 0;) {
				let e = this._cache[0];
				if (this._maxRequestedIndex - e.end <= this._maxCacheSize) break;
				this._cache.shift();
			}
			this._currentIndex += t.byteLength;
		}
		this._pulling = !1;
	}
	_dispose() {
		for (let e of this._pendingSlices) e.reject(new z());
		this._pendingSlices.length = 0, this._cache.length = 0, this._reader?.cancel();
	}
}, Ca = {
	none: (e, t) => ({
		start: e,
		end: t
	}),
	fileSystem: (e, t) => {
		let n = 2 ** 16;
		return e = Math.floor((e - n) / n) * n, t = Math.ceil((t + n) / n) * n, {
			start: e,
			end: t
		};
	},
	network: (e, t, n) => {
		let r = 2 ** 16;
		e = Math.max(0, Math.floor((e - r) / r) * r);
		for (let r of n) {
			let n = 8 * 2 ** 20, i = Math.max((r.startPos + r.targetPos) / 2, r.targetPos - n);
			if (He(e, t, i, r.targetPos)) {
				let e = r.targetPos - r.startPos, i = Math.ceil((e + 1) / n) * n, a = 2 ** Math.ceil(Math.log2(e + 1)), o = Math.min(a, i);
				t = Math.max(t, r.startPos + o);
			}
		}
		return t = Math.max(t, e + ba), {
			start: e,
			end: t
		};
	}
}, wa = class {
	constructor(e) {
		this.options = e, this.fileSize = null, this.nextAge = 0, this.workers = [], this.cache = [], this.currentCacheSize = 0, this.disposed = !1, this.queuedReads = [];
	}
	read(e, t, n, r) {
		c(!this.disposed);
		let i = this.options.prefetchProfile(e, t, this.workers), a = Math.max(i.start, n), o = Math.min(i.end, this.fileSize ?? Infinity, r);
		c(a <= e && t <= o);
		let s = null, l = w(this.cache, e, (e) => e.start), u = l === -1 ? null : this.cache[l];
		u && u.start <= e && t <= u.end && (u.age = this.nextAge++, s = {
			bytes: u.bytes,
			view: u.view,
			offset: u.start
		});
		let d = w(this.cache, a, (e) => e.start), f = s ? null : new Uint8Array(t - e), p = 0, m = a, g = [];
		if (d !== -1) {
			for (let n = d; n < this.cache.length; n++) {
				let r = this.cache[n];
				if (r.start >= o) break;
				if (r.end <= a) continue;
				let i = Math.max(a, r.start), s = Math.min(o, r.end);
				if (c(i <= s), m < i && g.push({
					start: m,
					end: i
				}), m = s, f) {
					let n = Math.max(e, r.start), i = Math.min(t, r.end);
					if (n < i) {
						let t = n - e;
						f.set(r.bytes.subarray(n - r.start, i - r.start), t), t === p && (p = i - e);
					}
				}
				r.age = this.nextAge++;
			}
			m < o && g.push({
				start: m,
				end: o
			});
		} else g.push({
			start: a,
			end: o
		});
		if (f && p >= f.length && (s = {
			bytes: f,
			view: h(f),
			offset: e
		}), g.length === 0) return c(s), s;
		let { promise: _, resolve: v, reject: y } = T(), b = [];
		for (let n of g) {
			let r = Math.max(e, n.start), i = Math.min(t, n.end);
			r === n.start && i === n.end ? b.push(n) : r < i && b.push({
				start: r,
				end: i
			});
		}
		let x = f && {
			start: e,
			bytes: f,
			holes: b,
			resolve: v,
			reject: y
		};
		outer: for (let e of g) {
			for (let t of this.workers) if (this.checkHoleAgainstWorker(t, e, x ? [x] : [])) {
				this.checkQueuedReadsAgainstWorker(t);
				continue outer;
			}
			let t = e.end < o || this.fileSize !== null, n = this.createWorker(e.start, e.end, t);
			if (n) x && (n.pendingSlices = [x]), this.runWorker(n);
			else {
				let n = w(this.queuedReads, e.start, (e) => e.hole.start), r = n === -1 ? null : this.queuedReads[n];
				for (r && e.start <= r.hole.end ? (r.hole.end = Math.max(r.hole.end, e.end), r.strictTarget &&= t, x && r.pendingSlices.push(x)) : (n++, r = {
					hole: {
						start: e.start,
						end: e.end
					},
					strictTarget: t,
					pendingSlices: x ? [x] : [],
					age: this.nextAge++
				}, this.queuedReads.splice(n, 0, r)); n + 1 < this.queuedReads.length;) {
					let e = this.queuedReads[n + 1];
					if (e.hole.start > r.hole.end) break;
					r.hole.end = Math.max(r.hole.end, e.hole.end), r.pendingSlices.push(...e.pendingSlices), r.strictTarget &&= e.strictTarget, r.age = Math.min(r.age, e.age), this.queuedReads.splice(n + 1, 1);
				}
			}
		}
		return s ? _.catch((e) => {
			if (!this.disposed) throw e;
		}) : (c(f), s = _.then((t) => t && {
			bytes: t,
			view: h(t),
			offset: e
		})), s;
	}
	checkHoleAgainstWorker(e, t, n) {
		if (He(t.start - 2 ** 17, t.start, e.currentPos, e.targetPos)) {
			e.targetPos = Math.max(e.targetPos, t.end);
			for (let t = 0; t < n.length; t++) {
				let r = n[t];
				e.pendingSlices.includes(r) || e.pendingSlices.push(r);
			}
			return e.running || this.runWorker(e), !0;
		}
		return !1;
	}
	checkQueuedReadsAgainstWorker(e) {
		let t = !1;
		for (let n = 0; n < this.queuedReads.length; n++) {
			let r = this.queuedReads[n];
			if (this.checkHoleAgainstWorker(e, r.hole, r.pendingSlices)) this.queuedReads.splice(n, 1), n--, t = !0;
			else if (t) break;
		}
	}
	createWorker(e, t, n) {
		if (this.workers.length >= this.options.maxWorkerCount) {
			let e = null, t = null;
			for (let n = 0; n < this.workers.length; n++) {
				let r = this.workers[n];
				!r.running && r.pendingSlices.length === 0 && (!e || r.age < e.age) && (t = n, e = r);
			}
			if (e) c(t !== null), c(e.pendingSlices.length === 0), this.workers.splice(t, 1);
			else return null;
		}
		let r = {
			startPos: e,
			currentPos: e,
			targetPos: t,
			strictTarget: n,
			running: !1,
			aborted: this.disposed,
			pendingSlices: [],
			age: this.nextAge++
		};
		return this.workers.push(r), r;
	}
	runWorker(e) {
		c(!e.running), c(e.currentPos < e.targetPos), e.running = !0, e.age = this.nextAge++, this.options.runWorker(e).catch((t) => {
			if (e.running = !1, e.pendingSlices.length > 0) e.pendingSlices.forEach((e) => e.reject(t)), e.pendingSlices.length = 0;
			else if (!e.aborted && !this.disposed) throw t;
		}).finally(() => {
			if (!e.running && this.queuedReads.length > 0) {
				let e = 0;
				for (let t = 1; t < this.queuedReads.length; t++) this.queuedReads[t].age < this.queuedReads[e].age && (e = t);
				let t = this.queuedReads[e], n = this.createWorker(t.hole.start, t.hole.end, t.strictTarget);
				if (!n) return;
				this.queuedReads.splice(e, 1), n.pendingSlices = t.pendingSlices, this.runWorker(n);
			}
		});
	}
	consolidateEverythingIntoOneWorker(e) {
		let t = new Set(e.pendingSlices);
		for (let n = 0; n < this.workers.length; n++) {
			let r = this.workers[n];
			if (r !== e) {
				for (let e of r.pendingSlices) t.add(e);
				r.aborted = !0, r.pendingSlices.length = 0, this.workers.splice(n, 1), n--;
			}
		}
		for (let e = 0; e < this.queuedReads.length; e++) {
			let n = this.queuedReads[e];
			for (let e of n.pendingSlices) t.add(e);
		}
		e.pendingSlices = [...t], this.queuedReads.length = 0;
	}
	supplyWorkerData(e, t) {
		c(!e.aborted);
		let n = e.currentPos, r = n + t.length;
		this.insertIntoCache({
			start: n,
			end: r,
			bytes: t,
			view: h(t),
			age: this.nextAge++
		}), e.currentPos += t.length, e.currentPos > e.targetPos && (e.targetPos = e.currentPos, this.checkQueuedReadsAgainstWorker(e));
		for (let i = 0; i < e.pendingSlices.length; i++) {
			let a = e.pendingSlices[i], o = Math.max(n, a.start), s = Math.min(r, a.start + a.bytes.length);
			o < s && a.bytes.set(t.subarray(o - n, s - n), o - a.start);
			for (let e = 0; e < a.holes.length; e++) {
				let t = a.holes[e];
				n <= t.start && r > t.start && (t.start = r), t.end <= t.start && (a.holes.splice(e, 1), e--);
			}
			a.holes.length === 0 && (a.resolve(a.bytes), e.pendingSlices.splice(i, 1), i--);
		}
		for (let t = 0; t < this.workers.length; t++) {
			let i = this.workers[t];
			e === i || i.running || He(n, r, i.currentPos, i.targetPos) && (this.workers.splice(t, 1), t--);
		}
	}
	supplyFileSize(e) {
		c(this.fileSize === null), this.fileSize = e;
		for (let t of this.workers) {
			t.targetPos = Math.min(t.targetPos, e), t.strictTarget = !0;
			for (let n = 0; n < t.pendingSlices.length; n++) {
				let r = t.pendingSlices[n];
				for (let i of r.holes) if (i.end > e) {
					r.resolve(null), t.pendingSlices.splice(n, 1), n--;
					break;
				}
			}
		}
		for (let t = 0; t < this.queuedReads.length; t++) {
			let n = this.queuedReads[t];
			if (n.hole.start >= e) {
				for (let e of n.pendingSlices) e.resolve(null);
				this.queuedReads.splice(t, 1), t--;
			} else if (n.hole.end > e) {
				n.hole.end = e, n.strictTarget = !0;
				for (let t = 0; t < n.pendingSlices.length; t++) {
					let r = n.pendingSlices[t];
					r.start >= e && (r.resolve(null), n.pendingSlices.splice(t, 1), t--);
				}
			}
		}
	}
	signalWorkerStoppedRunning(e) {
		e.running = !1, e.aborted || (e.pendingSlices.length = 0);
	}
	onWorkerFinished(e) {
		let t = this.workers.indexOf(e);
		c(t !== -1), e.running = !1, this.workers.splice(t, 1), this.fileSize === null && this.supplyFileSize(e.currentPos);
		for (let t of e.pendingSlices) t.resolve(null);
	}
	insertIntoCache(e) {
		if (this.options.maxCacheSize === 0) return;
		let t = w(this.cache, e.start, (e) => e.start) + 1;
		if (t > 0) {
			let n = this.cache[t - 1];
			if (n.end >= e.end) return;
			if (n.end > e.start) {
				let r = new Uint8Array(e.end - n.start);
				r.set(n.bytes, 0), r.set(e.bytes, e.start - n.start), this.currentCacheSize += e.end - n.end, n.bytes = r, n.view = h(r), n.end = e.end, t--, e = n;
			} else this.cache.splice(t, 0, e), this.currentCacheSize += e.bytes.length;
		} else this.cache.splice(t, 0, e), this.currentCacheSize += e.bytes.length;
		for (let n = t + 1; n < this.cache.length; n++) {
			let t = this.cache[n];
			if (e.end <= t.start) break;
			if (e.end >= t.end) {
				this.cache.splice(n, 1), this.currentCacheSize -= t.bytes.length, n--;
				continue;
			}
			let r = new Uint8Array(t.end - e.start);
			r.set(e.bytes, 0), r.set(t.bytes, t.start - e.start), this.currentCacheSize -= e.end - t.start, e.bytes = r, e.view = h(r), e.end = t.end, this.cache.splice(n, 1);
			break;
		}
		for (; this.currentCacheSize > this.options.maxCacheSize;) {
			let e = 0, t = this.cache[0];
			for (let n = 1; n < this.cache.length; n++) {
				let r = this.cache[n];
				r.age < t.age && (e = n, t = r);
			}
			if (this.currentCacheSize - t.bytes.length <= this.options.maxCacheSize) break;
			this.cache.splice(e, 1), this.currentCacheSize -= t.bytes.length;
		}
	}
	dispose() {
		for (let e of this.workers) {
			for (let t of e.pendingSlices) t.reject(new z());
			e.pendingSlices.length = 0, e.aborted = !0;
		}
		for (let e of this.queuedReads) for (let t of e.pendingSlices) t.reject(new z());
		this.workers.length = 0, this.cache.length = 0, this.queuedReads.length = 0, this.disposed = !0;
	}
}, Ta = class extends ma {
	constructor(e, t, n) {
		if (super(), this._ref = null, e._disposed) throw Error("Cannot create a slice of a disposed source.");
		this._baseSource = e, this._offset = t, this._length = n ?? null;
	}
	_getFileSize() {
		let e = this._baseSource._getFileSize();
		return e === void 0 ? this._length === null ? void 0 : this._length : e === null ? this._length === null ? null : this._length : E(e - this._offset, 0, this._length ?? Infinity);
	}
	_read(e, t, n, r) {
		if (this._length !== null && t > this._length) return null;
		let i = this._baseSource._read(this._offset + e, this._offset + t, this._offset + n, this._offset + r), a = (e) => e ? (e.offset -= this._offset, e) : null;
		return i instanceof Promise ? i.then(a) : a(i);
	}
	_dispose() {
		this._ref?.free();
	}
	ref() {
		return this._ref ??= this._baseSource.ref(), super.ref();
	}
}, Ea = function(e, t, n) {
	if (t != null) {
		if (typeof t != "object" && typeof t != "function") throw TypeError("Object expected.");
		var r, i;
		if (n) {
			if (!Symbol.asyncDispose) throw TypeError("Symbol.asyncDispose is not defined.");
			r = t[Symbol.asyncDispose];
		}
		if (r === void 0) {
			if (!Symbol.dispose) throw TypeError("Symbol.dispose is not defined.");
			r = t[Symbol.dispose], n && (i = r);
		}
		if (typeof r != "function") throw TypeError("Object not disposable.");
		i && (r = function() {
			try {
				i.call(this);
			} catch (e) {
				return Promise.reject(e);
			}
		}), e.stack.push({
			value: t,
			dispose: r,
			async: n
		});
	} else n && e.stack.push({ async: !0 });
	return t;
}, Da = (function(e) {
	return function(t) {
		function n(n) {
			t.error = t.hasError ? new e(n, t.error, "An error was suppressed during disposal.") : n, t.hasError = !0;
		}
		var r, i = 0;
		function a() {
			for (; r = t.stack.pop();) try {
				if (!r.async && i === 1) return i = 0, t.stack.push(r), Promise.resolve().then(a);
				if (r.dispose) {
					var e = r.dispose.call(r.value);
					if (r.async) return i |= 2, Promise.resolve(e).then(a, function(e) {
						return n(e), a();
					});
				} else i |= 1;
			} catch (e) {
				n(e);
			}
			if (i === 1) return t.hasError ? Promise.reject(t.error) : Promise.resolve();
			if (t.hasError) throw t.error;
		}
		return a();
	};
})(typeof SuppressedError == "function" ? SuppressedError : function(e, t, n) {
	var r = Error(n);
	return r.name = "SuppressedError", r.error = e, r.suppressed = t, r;
}), Oa = /^0[xX][0-9a-fA-F]+$/, ka = /^data:.*;base64,/i, Aa = class extends la {
	constructor(e, t, n, r) {
		super(e.input, t, n), this.segments = [], this.nextLines = null, this.currentUpdateSegmentsPromise = null, this.streamHasEnded = !1, this.lastSegmentUpdateTime = -Infinity, this.refreshInterval = 5, this.rootPath = t, this.demuxer = e, this.nextLines = r;
	}
	runUpdateSegments() {
		return this.currentUpdateSegmentsPromise ??= (async () => {
			try {
				let e = this.getRemainingWaitTimeMs();
				e > 0 && await $e(e), this.lastSegmentUpdateTime = performance.now(), await this.updateSegments();
			} finally {
				this.currentUpdateSegmentsPromise = null;
			}
		})();
	}
	getRemainingWaitTimeMs() {
		let e = performance.now() - this.lastSegmentUpdateTime, t = Math.max(0, 1e3 * this.refreshInterval - e);
		return t <= 50 ? 0 : t;
	}
	async updateSegments() {
		let e = this.nextLines;
		if (this.nextLines = null, !e) {
			let t = {
				stack: [],
				error: void 0,
				hasError: !1
			};
			try {
				let n = Ea(t, await this.demuxer.input._getSourceUncached({
					path: this.rootPath,
					isRoot: !1
				}), !1), r = await new Ns(n.source).requestEntireFile();
				c(r), e = Js(r, r.length, { ignore: sa }), n.source instanceof ga && (this.rootPath = n.source.rootPath);
			} catch (e) {
				t.error = e, t.hasError = !0;
			} finally {
				Da(t);
			}
		}
		let t = this.input._formatOptions.hls?.offsetTimestampsByDateTime !== !1, n = !1, r = 0, i = null, a = null, o = null, s = 0, l = null, d = null, f = null, p = null, m = null, g = null, _ = !1, v = u(this.segments) ?? null, y = (e) => {
			let t = e.indexOf("@"), n = Number(t === -1 ? e : e.slice(0, t));
			if (!Number.isInteger(n) || n < 0) throw Error(`Invalid #EXT-X-BYTERANGE length '${e}'.`);
			let r = null;
			if (t !== -1 && (r = Number(e.slice(t + 1)), !Number.isInteger(r) || r < 0)) throw Error(`Invalid #EXT-X-BYTERANGE offset '${e}'.`);
			return {
				length: n,
				offset: r
			};
		}, b = (e) => {
			s = e, v && (c(v.sequenceNumber !== null), v.sequenceNumber < e && (r = v.timestamp + v.duration, l = v.firstSegment, d = v.initSegment, m = v.lastProgramDateTimeSeconds, i = v.unixEpochTimestamp === null ? null : v.unixEpochTimestamp + v.duration, v = null));
		};
		for (let c = 0; c < e.length; c++) {
			let x = e[c];
			if (!n) {
				if (x !== "#EXTM3U") throw Error("Invalid M3U8 file; expected first line to be #EXTM3U.");
				n = !0;
				continue;
			}
			if (!x.startsWith("#")) {
				if (!v) {
					if (a === null) throw Error("Invalid M3U8 file; a segment must be preceded by an #EXTINF tag.");
					let e = o;
					if (e && e.method === "AES-128" && !e.iv) {
						let t = new Uint8Array(16), n = h(t);
						n.setUint32(8, Math.floor(s / 2 ** 32)), n.setUint32(12, s), e = {
							...e,
							iv: t
						};
					}
					let t = {
						path: Je(this.rootPath, x),
						offset: p?.offset ?? 0,
						length: p?.length ?? null
					}, n = {
						timestamp: r,
						unixEpochTimestamp: i,
						firstSegment: l,
						sequenceNumber: s,
						location: t,
						duration: a,
						encryption: e,
						initSegment: d,
						lastProgramDateTimeSeconds: m
					};
					l ??= n, r += a, i !== null && (i += a), this.segments.push(n);
				}
				a = null, p === null ? f = null : p = null, b(s + 1);
			}
			if (x.startsWith("#EXTINF:")) {
				if (v) {
					_ = !0;
					continue;
				}
				_ ||= (m === null && s > 0 && g !== null && (r = s * g), !0);
				let e = x.slice(ea.length), t = e.indexOf(","), n = t === -1 ? e : e.slice(0, t), i = Number(n);
				if (!Number.isFinite(i) || i < 0) throw Error(`Invalid #EXTINF tag duration '${n}'.`);
				a = i;
			} else if (x.startsWith("#EXT-X-MAP:")) {
				let e = new ca(x.slice(ta.length)), t = e.get("uri");
				if (!t) throw Error("Invalid #EXT-X-MAP tag; missing URI attribute.");
				let n = e.get("byterange"), s = null;
				if (n !== null && (s = y(n)), s && s.offset === null) throw Error("Invalid #EXT-X-MAP tag; BYTERANGE attribute must have a specified offset.");
				if (!v) {
					let e = {
						path: Je(this.rootPath, t),
						offset: s?.offset ?? 0,
						length: s?.length ?? null
					};
					if (o?.method === "AES-128" && !o.iv) throw Error("IV attribute must be set on #EXT-X-KEY tag preceding the #EXT-X-MAP tag.");
					d = {
						timestamp: r,
						unixEpochTimestamp: i,
						firstSegment: null,
						sequenceNumber: null,
						location: e,
						duration: 0,
						encryption: o,
						initSegment: null,
						lastProgramDateTimeSeconds: m
					};
				}
				a = null, p === null ? f = null : p = null;
			} else if (x.startsWith("#EXT-X-KEY:")) {
				let e = new ca(x.slice(na.length)), t = e.get("method");
				if (t === "NONE") o = null;
				else if (t === "AES-128") {
					let t = e.get("uri");
					if (!t) throw Error("Invalid #EXT-X-KEY: AES-128 requires a URI attribute.");
					let n = null, r = e.get("iv");
					if (r) {
						if (!Oa.test(r)) throw Error(`Unsupported IV format '${r}'.`);
						let e = r.slice(2);
						e = e.padStart(32, "0"), n = new Uint8Array(16);
						for (let t = 0; t < 16; t++) {
							let r = -32 + t;
							n[t] = parseInt(e.slice(r, r + 2), 16);
						}
					}
					let i = e.get("keyformat") ?? "identity";
					if (i !== "identity") throw Error("For AES-128 encryption, only the 'identity' KEYFORMAT is currently supported. If you think other formats should be supported, please raise an issue.");
					o = {
						method: "AES-128",
						keyUri: Je(this.rootPath, t),
						iv: n,
						keyFormat: i
					};
				} else if (t === "SAMPLE-AES" || t === "SAMPLE-AES-CTR") {
					let n = e.get("uri");
					if (!n) throw Error(`Invalid #EXT-X-KEY: ${t} requires a URI attribute.`);
					if ((e.get("keyformat") ?? "identity") === "identity") throw Error("For SAMPLE-AES and SAMPLE-AES-CTR encryption, the 'identity' KEYFORMAT is not supported. If you think this format should be supported, please raise an issue.");
					let r = null;
					if (ka.test(n)) {
						let e = n.indexOf(","), t = We(n.slice(e + 1));
						if (t.length >= 8 && t[4] === 112 && t[5] === 115 && t[6] === 115 && t[7] === 104) {
							let e = h(t).getUint32(0);
							r = er(t.subarray(8, Math.min(e, t.length)));
						}
					}
					o = {
						method: t,
						psshBox: r
					};
				} else throw Error(`Unsupported encryption method '${t}'. If you think this method should be supported, please raise an issue.`);
			} else if (x.startsWith("#EXT-X-MEDIA-SEQUENCE:")) {
				let e = x.slice(ra.length), t = Number(e);
				if (!Number.isInteger(t) || t < 0) throw Error(`Invalid EXT-X-MEDIA-SEQUENCE value '${e}'.`);
				b(t);
			} else if (x.startsWith("#EXT-X-BYTERANGE:")) {
				let e = y(x.slice(ia.length));
				if (e.offset === null) {
					if (f === null) throw Error("Invalid M3U8 file; #EXT-X-BYTERANGE without offset requires a previous byte range.");
					e.offset = f;
				}
				p = e, f = e.offset + e.length;
			} else if (x.startsWith("#EXT-X-PROGRAM-DATE-TIME:")) {
				if (v) continue;
				let e = x.slice(aa.length), n = Date.parse(e);
				if (!Number.isFinite(n)) continue;
				let a = n / 1e3;
				if (m === a) continue;
				if (m === null && this.segments.length > 0) {
					let e = u(this.segments), n = a - (e.timestamp + e.duration);
					for (let e of this.segments) e.unixEpochTimestamp = e.timestamp + n, t && (e.timestamp = e.unixEpochTimestamp);
				}
				m = a, i = a, t && (r = a);
			} else if (x === "#EXT-X-DISCONTINUITY") l = null;
			else if (x.startsWith("#EXT-X-TARGETDURATION:")) {
				let e = x.slice(oa.length), t = Number(e);
				if (!Number.isFinite(t) || t < 0) throw Error(`Invalid EXT-X-TARGETDURATION value '${e}'.`);
				this.refreshInterval = t, g = t;
			} else if (x === "#EXT-X-ENDLIST") {
				this.streamHasEnded = !0;
				break;
			} else x.startsWith("#EXT-X-PLAYLIST-TYPE:") && x.slice(21).toLowerCase() === "vod" && (this.streamHasEnded = !0);
		}
		if (!n) throw Error("Invalid M3U8 file; no #EXTM3U header.");
	}
	async getFirstSegment() {
		return this.segments.length === 0 && await this.runUpdateSegments(), this.segments[0] ?? null;
	}
	async getSegmentAt(e, t) {
		this.segments.length === 0 && await this.runUpdateSegments();
		let n = !!t.skipLiveWait && this.getRemainingWaitTimeMs() > 0;
		for (;;) {
			let r = w(this.segments, e, (e) => e.timestamp);
			if (r === -1) return null;
			if (r < this.segments.length - 1 || this.streamHasEnded || n) return this.segments[r];
			let i = this.segments[r];
			if (e < i.timestamp + i.duration) return i;
			await this.runUpdateSegments(), t.skipLiveWait && (n = !0);
		}
	}
	async getNextSegment(e, t) {
		let n = this.segments.indexOf(e);
		c(n !== -1);
		let r = n + 1, i = !!t.skipLiveWait && this.getRemainingWaitTimeMs() > 0;
		for (;;) {
			if (r < this.segments.length) return this.segments[r];
			if (this.streamHasEnded || i) return null;
			await this.runUpdateSegments(), t.skipLiveWait && (i = !0);
		}
	}
	async getPreviousSegment(e) {
		let t = this.segments.indexOf(e);
		return c(t !== -1), this.segments[t - 1] ?? null;
	}
	getInputForSegment(e) {
		let t = e, n = this.inputCache.find((e) => e.segment === t);
		if (n) return n.age = this.nextInputCacheAge++, n.input;
		let r = null;
		(t.initSegment || t.firstSegment) && (r = this.getInputForSegment(t.initSegment ?? t.firstSegment));
		let i = {
			...this.input._formatOptions,
			isobmff: {
				...this.input._formatOptions.isobmff,
				resolveKeyId: this.input._formatOptions.isobmff?.resolveKeyId && ((e) => {
					if (!t.encryption || !(t.encryption.method === "SAMPLE-AES" || t.encryption.method === "SAMPLE-AES-CTR") || !t.encryption.psshBox) return this.input._formatOptions.isobmff.resolveKeyId(e);
					let n = e.psshBoxes, { psshBox: r } = t.encryption;
					return (r.keyIds === null || r.keyIds.includes(e.keyId)) && !n.some((e) => tr(e, r)) && (n = [...n, r]), this.input._formatOptions.isobmff.resolveKeyId({
						...e,
						psshBoxes: n
					});
				})
			}
		}, a = new js({
			source: new va(t.location.path, async (e) => {
				c(e.isRoot);
				let n = {
					...e,
					isRoot: !1
				}, r, i = t.location.offset > 0 || t.location.length !== null;
				if (!t.encryption || t.encryption.method === "SAMPLE-AES" || t.encryption.method === "SAMPLE-AES-CTR") {
					if (r = await this.input._getSourceCached(n), i) {
						let e = r.source.slice(t.location.offset, t.location.length ?? void 0).ref();
						r.free(), r = e;
					}
				} else if (t.encryption.method === "AES-128") {
					let e = t.encryption;
					c(e.iv);
					let a = await this.input._getSourceCached(n);
					if (i) {
						let e = a.source.slice(t.location.offset, t.location.length ?? void 0).ref();
						a.free(), a = e;
					}
					r = new Sa(_r(new Ns(a.source), async () => {
						let t = {
							stack: [],
							error: void 0,
							hasError: !1
						};
						try {
							let n = await new Ns(Ea(t, await this.input._getSourceCached({
								path: e.keyUri,
								isRoot: !1
							}, 2), !1).source).requestSlice(0, 16);
							if (!n) throw Error("Invalid AES-128 key; expected at least 16 bytes of data.");
							return {
								key: V(n, 16),
								iv: e.iv
							};
						} catch (e) {
							t.error = e, t.hasError = !0;
						} finally {
							Da(t);
						}
					}, () => {
						a.free();
					})).ref();
				} else c(!1);
				return r;
			}),
			formats: this.input._formats.filter((e) => !(e instanceof Xa)),
			initInput: r ?? void 0,
			formatOptions: i
		});
		if (a._onFormatDetermined = (e) => {
			if ((t.encryption?.method === "SAMPLE-AES" || t.encryption?.method === "SAMPLE-AES-CTR") && !e._isIsobmff) throw Error("The SAMPLE-AES and SAMPLE-AES-CTR encryption methods are currently only supported for ISOBMFF files.");
		}, this.inputCache.push({
			segment: t,
			input: a,
			age: this.nextInputCacheAge++
		}), this.inputCache.length > 4) {
			let e = Xe(this.inputCache, (e) => e.age);
			c(e !== -1), this.inputCache.splice(e, 1);
		}
		return a;
	}
	async getLiveRefreshInterval() {
		return this.getRemainingWaitTimeMs() === 0 && await this.runUpdateSegments(), this.streamHasEnded ? null : this.refreshInterval;
	}
}, ja = class extends Zn {
	constructor(e) {
		super(e), this.metadataPromise = null, this.trackBackings = null, this.internalTracks = null, this.segmentedInputs = [], this.hasMasterPlaylist = !0;
	}
	readMetadata() {
		return this.metadataPromise ??= (async () => {
			c(this.input._rootSource instanceof ga);
			let e = await this.input._reader.requestEntireFile();
			c(e);
			let t = Js(e, e.length, { ignore: sa }), { rootPath: n } = this.input._rootSource, r = [], i = [];
			for (let e = 1; e < t.length; e++) {
				let a = t[e];
				if (a.startsWith("#EXT-X-STREAM-INF:")) {
					let i = e, o = t[++e];
					if (o === void 0) throw Error("Incorrect M3U8 file; a line must follow the #EXT-X-STREAM-INF tag.");
					let s = Je(n, o), c = new ca(a.slice(Zi.length));
					if (c.getAsNumber("bandwidth") === null) throw Error("Invalid M3U8 file; #EXT-X-STREAM-INF tag requires a BANDWIDTH attribute with a valid numerical value.");
					r.push({
						fullPath: s,
						attributes: c,
						lineNumber: i,
						hasOnlyKeyPackets: !1
					});
				} else if (a.startsWith("#EXT-X-I-FRAME-STREAM-INF:")) {
					let t = new ca(a.slice(Qi.length)), i = t.get("uri");
					if (i === null) throw Error("Invalid M3U8 file; #EXT-X-I-FRAME-STREAM-INF tag requires a URI attribute.");
					if (t.getAsNumber("bandwidth") === null) throw Error("Invalid M3U8 file; #EXT-X-I-FRAME-STREAM-INF tag requires a BANDWIDTH attribute with a valid numerical value.");
					let o = Je(n, i);
					r.push({
						fullPath: o,
						attributes: t,
						lineNumber: e,
						hasOnlyKeyPackets: !0
					});
				} else if (a.startsWith("#EXT-X-MEDIA:")) {
					let t = new ca(a.slice($i.length));
					if (t.get("type") === null) throw Error("Invalid M3U8 file; #EXT-X-MEDIA tag requires a TYPE attribute.");
					if (t.get("group-id") === null) throw Error("Invalid M3U8 file; #EXT-X-MEDIA tag requires a GROUP-ID attribute.");
					let r = null, o = t.get("uri");
					o !== null && (r = Je(n, o)), i.push({
						fullPath: r,
						attributes: t,
						lineNumber: e
					});
				} else if (a !== "#EXT-X-I-FRAMES-ONLY" && a.startsWith("#EXTINF:")) {
					let e = new Aa(this, n, null, t);
					this.segmentedInputs = [e], this.hasMasterPlaylist = !1, this.trackBackings = await e.getTrackBackings();
					return;
				}
			}
			let a = [...new Set(i.filter((e) => e.attributes.get("type").toLowerCase() === "video").map((e) => e.attributes.get("group-id")))], o = [...new Set(i.filter((e) => e.attributes.get("type").toLowerCase() === "audio").map((e) => e.attributes.get("group-id")))], s = await Promise.all(r.map(async (e, t) => {
				let r = [], s = e.attributes.get("codecs"), l;
				if (s) l = s.split(",").map((e) => e.trim());
				else {
					let t = await this.getSegmentedInputForPath(e.fullPath).getTrackBackings(), n = await Promise.all(t.map(async (e) => ({
						track: e,
						codec: await e.getCodec()
					})));
					l = await Promise.all(n.filter((e) => e.codec !== null).map((e) => e.track.getDecoderConfig().then((e) => e.codec)));
				}
				let u = e.attributes.get("video"), d = e.attributes.get("audio"), f = l.some((e) => pt.includes(Nt(e))), p = l.some((e) => ht.includes(Nt(e)));
				if (u !== null && !f) {
					if (!a.includes(u)) throw Error(`Invalid M3U8 file; variant stream references video group "${u}" which is not defined in any #EXT-X-MEDIA tags.`);
					let e = i.find((e) => {
						let t = e.attributes.get("group-id"), n = e.attributes.get("type");
						return t === u && n.toLowerCase() === "video";
					});
					outer: if (e) {
						let t = e.attributes.get("uri");
						if (t === null) break outer;
						let r = Je(n, t), i = (await this.getSegmentedInputForPath(r).getTrackBackings()).find((e) => e.getType() === "video");
						if (!i || await i.getCodec() === null) break outer;
						let a = await i.getDecoderConfig().then((e) => e?.codec ?? null);
						c(a !== null), l.push(a);
					}
				}
				if (d !== null && !p) {
					if (!o.includes(d)) throw Error(`Invalid M3U8 file; variant stream references audio group "${d}" which is not defined in any #EXT-X-MEDIA tags.`);
					let e = i.find((e) => {
						let t = e.attributes.get("group-id"), n = e.attributes.get("type");
						return t === d && n.toLowerCase() === "audio";
					});
					outer: if (e) {
						let t = e.attributes.get("uri");
						if (t === null) break outer;
						let r = Je(n, t), i = (await this.getSegmentedInputForPath(r).getTrackBackings()).find((e) => e.getType() === "audio");
						if (!i || await i.getCodec() === null) break outer;
						let a = await i.getDecoderConfig().then((e) => e?.codec ?? null);
						c(a !== null), l.push(a);
					}
				}
				l = [...new Set(l)];
				let m = null, h = null, g = e.attributes.getAsNumber("bandwidth");
				c(g !== null);
				let _ = e.attributes.getAsNumber("average-bandwidth"), v = e.attributes.get("name");
				for (let n of l) {
					let s = Nt(n);
					if (s !== null) {
						if (pt.includes(s)) {
							if (m !== null) throw Error("Unsupported M3U8 file; multiple video codecs found in the CODECS attribute of a variant stream.");
							m = n;
							let o = e.attributes.get("video");
							if (o === null) {
								let n = e.attributes.get("resolution"), i = null, a = null;
								if (n) {
									let e = n.match(/^(\d+)x(\d+)$/);
									e && (i = Number(e[1]), a = Number(e[2]));
								}
								r.push({
									id: -1,
									demuxer: this,
									backingTrack: null,
									default: !0,
									autoselect: !0,
									languageCode: "und",
									lineNumber: e.lineNumber,
									fullPath: e.fullPath,
									fullCodecString: m,
									pairingMask: 1n << BigInt(t),
									peakBitrate: g,
									averageBitrate: _,
									name: v,
									hasOnlyKeyPackets: e.hasOnlyKeyPackets,
									info: {
										type: "video",
										width: i,
										height: a
									}
								});
							} else {
								if (!a.includes(o)) throw Error(`Invalid M3U8 file; variant stream references video group "${o}" which is not defined in any #EXT-X-MEDIA tags.`);
								for (let n of i) {
									let i = n.attributes.get("group-id"), a = n.attributes.get("type");
									if (i !== o || a.toLowerCase() !== "video") continue;
									let s = n.attributes.get("resolution") ?? e.attributes.get("resolution"), c = null, l = null;
									if (s) {
										let e = s.match(/^(\d+)x(\d+)$/);
										e && (c = Number(e[1]), l = Number(e[2]));
									}
									r.push({
										id: -1,
										demuxer: this,
										backingTrack: null,
										default: Fa(n.attributes),
										autoselect: Fa(n.attributes) || Ia(n.attributes),
										languageCode: La(n.attributes.get("language")),
										lineNumber: n.lineNumber,
										fullPath: n.fullPath ?? e.fullPath,
										fullCodecString: m,
										pairingMask: 1n << BigInt(t),
										peakBitrate: null,
										averageBitrate: null,
										name: n.attributes.get("name"),
										hasOnlyKeyPackets: e.hasOnlyKeyPackets,
										info: {
											type: "video",
											width: c,
											height: l
										}
									});
								}
							}
						} else if (ht.includes(s)) {
							if (h !== null) throw Error("Unsupported M3U8 file; multiple audio codecs found in the CODECS attribute of a variant stream.");
							h = n;
							let a = e.attributes.get("audio");
							if (a === null) {
								let n = e.attributes.get("channels"), i = n === null ? null : Number(n.split("/")[0]);
								r.push({
									id: -1,
									demuxer: this,
									backingTrack: null,
									default: !0,
									autoselect: !0,
									languageCode: "und",
									lineNumber: e.lineNumber,
									fullPath: e.fullPath,
									fullCodecString: h,
									pairingMask: 1n << BigInt(t),
									peakBitrate: g,
									averageBitrate: _,
									name: v,
									hasOnlyKeyPackets: e.hasOnlyKeyPackets,
									info: {
										type: "audio",
										numberOfChannels: i !== null && Number.isInteger(i) && i > 0 ? i : null
									}
								});
							} else {
								if (!o.includes(a)) throw Error(`Invalid M3U8 file; variant stream references audio group "${a}" which is not defined in any #EXT-X-MEDIA tags.`);
								for (let n of i) {
									let i = n.attributes.get("group-id"), o = n.attributes.get("type");
									if (i !== a || o.toLowerCase() !== "audio") continue;
									let s = n.attributes.get("channels") ?? e.attributes.get("channels"), c = s === null ? null : Number(s.split("/")[0]);
									r.push({
										id: -1,
										demuxer: this,
										backingTrack: null,
										default: Fa(n.attributes),
										autoselect: Fa(n.attributes) || Ia(n.attributes),
										languageCode: La(n.attributes.get("language")),
										lineNumber: n.lineNumber,
										fullPath: n.fullPath ?? e.fullPath,
										fullCodecString: h,
										pairingMask: 1n << BigInt(t),
										peakBitrate: null,
										averageBitrate: null,
										name: n.attributes.get("name"),
										hasOnlyKeyPackets: e.hasOnlyKeyPackets,
										info: {
											type: "audio",
											numberOfChannels: c !== null && Number.isInteger(c) && c > 0 ? c : null
										}
									});
								}
							}
						}
					}
				}
				return r;
			})), l = [], u = (e) => {
				let t = l.find((t) => t.fullPath === e.fullPath && t.info.type === e.info.type);
				t ? (t.pairingMask |= e.pairingMask, t.default ||= e.default, t.autoselect ||= e.autoselect, t.lineNumber = Math.min(t.lineNumber, e.lineNumber), e.peakBitrate !== null && (t.peakBitrate = Math.max(t.peakBitrate ?? -Infinity, e.peakBitrate)), e.averageBitrate !== null && (t.averageBitrate = Math.max(t.averageBitrate ?? -Infinity, e.averageBitrate)), t.languageCode === "und" && (t.languageCode = e.languageCode)) : (e.id = l.length + 1, l.push(e));
			};
			for (let e of s) for (let t of e) u(t);
			l.sort((e, t) => e.lineNumber - t.lineNumber), this.trackBackings = [];
			for (let e of l) e.info.type === "video" ? this.trackBackings.push(new Na(e)) : this.trackBackings.push(new Pa(e));
			this.internalTracks = l;
		})();
	}
	async getTrackBackings() {
		return await this.readMetadata(), c(this.trackBackings), this.trackBackings;
	}
	getSegmentedInputForPath(e) {
		let t = this.segmentedInputs.find((t) => t.path === e);
		if (t) return t;
		let n = null;
		return this.internalTracks && (n = this.internalTracks.filter((t) => t.fullPath === e).map((e) => ({
			id: e.id,
			type: e.info.type
		}))), t = new Aa(this, e, n, null), this.segmentedInputs.push(t), t;
	}
	async getMetadataTags() {
		return {};
	}
	async getMimeType() {
		return Xi;
	}
	dispose() {
		if (this.segmentedInputs) {
			for (let e of this.segmentedInputs) e.dispose();
			this.segmentedInputs.length = 0;
		}
	}
}, Ma = class {
	constructor(e) {
		this.internalTrack = e, this.hydrationPromise = null;
	}
	hydrate() {
		return this.hydrationPromise ??= (async () => {
			let e = this.internalTrack.demuxer.getSegmentedInputForPath(this.internalTrack.fullPath), t = null, n = (await e.getTrackBackings()).filter((e) => e.getType() === this.getType());
			if (n.length === 1) t = n[0];
			else if (this instanceof Na) {
				for (let e of n) if (await e.getCodec() === this.getCodec()) {
					t = e;
					break;
				}
			} else {
				c(this instanceof Pa);
				for (let e of n) if (await e.getCodec() === this.getCodec()) {
					t = e;
					break;
				}
			}
			if (!t) throw Error("Could not find matching track in underlying media data.");
			this.internalTrack.backingTrack = t;
		})();
	}
	delegate(e) {
		return this.internalTrack.backingTrack ? e() : this.hydrate().then(e);
	}
	getCodec() {
		throw Error("Not implemented on base class.");
	}
	getDisposition() {
		return {
			...st,
			default: this.internalTrack.autoselect,
			primary: this.internalTrack.default
		};
	}
	getId() {
		return this.internalTrack.id;
	}
	getPairingMask() {
		return this.internalTrack.pairingMask;
	}
	getInternalCodecId() {
		return null;
	}
	getLanguageCode() {
		return this.internalTrack.languageCode;
	}
	getName() {
		return this.internalTrack.name;
	}
	getNumber() {
		c(this.internalTrack.demuxer.internalTracks);
		let e = this.internalTrack.info.type, t = 0;
		for (let n of this.internalTrack.demuxer.internalTracks) if (n.info.type === e && t++, n === this.internalTrack) break;
		return t;
	}
	getTimeResolution() {
		return this.delegate(() => this.internalTrack.backingTrack.getTimeResolution());
	}
	isRelativeToUnixEpoch() {
		return this.delegate(() => this.internalTrack.backingTrack.isRelativeToUnixEpoch());
	}
	getUnixTimeForTimestamp(e) {
		return this.delegate(() => this.internalTrack.backingTrack.getUnixTimeForTimestamp(e));
	}
	getBitrate() {
		return this.internalTrack.peakBitrate;
	}
	getAverageBitrate() {
		return this.internalTrack.averageBitrate;
	}
	async getDurationFromMetadata(e) {
		return await this.hydrate(), this.internalTrack.backingTrack.getDurationFromMetadata(e);
	}
	async getLiveRefreshInterval() {
		return await this.hydrate(), this.internalTrack.backingTrack.getLiveRefreshInterval();
	}
	getHasOnlyKeyPackets() {
		return this.internalTrack.hasOnlyKeyPackets || null;
	}
	async getFirstPacket(e) {
		return await this.hydrate(), this.internalTrack.backingTrack.getFirstPacket(e);
	}
	async getPacket(e, t) {
		return await this.hydrate(), this.internalTrack.backingTrack.getPacket(e, t);
	}
	async getKeyPacket(e, t) {
		return await this.hydrate(), this.internalTrack.backingTrack.getKeyPacket(e, t);
	}
	async getNextPacket(e, t) {
		return await this.hydrate(), this.internalTrack.backingTrack.getNextPacket(e, t);
	}
	async getNextKeyPacket(e, t) {
		return await this.hydrate(), this.internalTrack.backingTrack.getNextKeyPacket(e, t);
	}
}, Na = class extends Ma {
	constructor(e) {
		super(e);
	}
	get backingVideoTrack() {
		return this.internalTrack.backingTrack;
	}
	getType() {
		return "video";
	}
	getCodec() {
		return Nt(this.internalTrack.fullCodecString);
	}
	getCodedWidth() {
		return this.delegate(() => this.backingVideoTrack.getCodedWidth());
	}
	getCodedHeight() {
		return this.delegate(() => this.backingVideoTrack.getCodedHeight());
	}
	getSquarePixelWidth() {
		return this.delegate(() => this.backingVideoTrack.getSquarePixelWidth());
	}
	getSquarePixelHeight() {
		return this.delegate(() => this.backingVideoTrack.getSquarePixelHeight());
	}
	getMetadataDisplayWidth() {
		return this.backingVideoTrack ? null : this.internalTrack.info.width;
	}
	getMetadataDisplayHeight() {
		return this.backingVideoTrack ? null : this.internalTrack.info.height;
	}
	getRotation() {
		return this.delegate(() => this.backingVideoTrack.getRotation());
	}
	async getColorSpace() {
		return await this.hydrate(), this.backingVideoTrack.getColorSpace();
	}
	async canBeTransparent() {
		return await this.hydrate(), this.backingVideoTrack.canBeTransparent();
	}
	getMetadataCodecParameterString() {
		return this.backingVideoTrack ? null : this.internalTrack.fullCodecString;
	}
	async getDecoderConfig() {
		return await this.hydrate(), this.backingVideoTrack.getDecoderConfig();
	}
}, Pa = class extends Ma {
	constructor(e) {
		super(e);
	}
	get backingAudioTrack() {
		return this.internalTrack.backingTrack;
	}
	getType() {
		return "audio";
	}
	getCodec() {
		return Nt(this.internalTrack.fullCodecString);
	}
	getNumberOfChannels() {
		return this.internalTrack.info.numberOfChannels === null ? this.delegate(() => this.backingAudioTrack.getNumberOfChannels()) : this.internalTrack.info.numberOfChannels;
	}
	getSampleRate() {
		return this.delegate(() => this.backingAudioTrack.getSampleRate());
	}
	getMetadataCodecParameterString() {
		return this.backingAudioTrack ? null : this.internalTrack.fullCodecString;
	}
	async getDecoderConfig() {
		return await this.hydrate(), this.backingAudioTrack.getDecoderConfig();
	}
}, Fa = (e) => {
	let t = e.get("default");
	if (t === null) return !1;
	let n = t.toUpperCase();
	if (n === "YES") return !0;
	if (n === "NO") return !1;
	throw Error(`Invalid M3U8 file; #EXT-X-MEDIA DEFAULT attribute must be YES or NO, got "${t}".`);
}, Ia = (e) => {
	let t = e.get("autoselect");
	if (t === null) return !1;
	let n = t.toUpperCase();
	if (n === "YES") return !0;
	if (n === "NO") return !1;
	throw Error(`Invalid M3U8 file; #EXT-X-MEDIA AUTOSELECT attribute must be YES or NO, got "${t}".`);
}, La = (e) => e === null ? "und" : e.split("-")[0] || "und", Ra = class {
	constructor() {
		this._isIsobmff = !1;
	}
}, za = class extends Ra {
	constructor() {
		super(...arguments), this._isIsobmff = !0;
	}
	async _getMajorBrand(e) {
		let t = e._reader.requestSlice(0, 12);
		if (t instanceof Promise && (t = await t), !t) return null;
		t.skip(4);
		let n = G(t, 4);
		return n !== "ftyp" && n !== "styp" ? null : G(t, 4);
	}
	_createDemuxer(e) {
		return new vr(e);
	}
}, Ba = class extends za {
	async _canReadInput(e) {
		let t = await this._getMajorBrand(e);
		if (t !== null) return t !== "qt  ";
		let n = e._reader.requestSlice(4, 4);
		if (n instanceof Promise && (n = await n), !n) return !1;
		let r = G(n, 4);
		return r === "moof" || r === "sidx";
	}
	get name() {
		return "MP4";
	}
	get mimeType() {
		return "video/mp4";
	}
}, Va = class extends za {
	async _canReadInput(e) {
		return await this._getMajorBrand(e) === "qt  ";
	}
	get name() {
		return "QuickTime File Format";
	}
	get mimeType() {
		return "video/quicktime";
	}
}, Ha = class extends Ra {
	async isSupportedEBMLOfDocType(e, t) {
		let n = e._reader.requestSlice(0, 16);
		if (n instanceof Promise && (n = await n), !n) return !1;
		let r = Rr(n);
		if (r === null || r < 1 || r > 8 || I(n, r) !== F.EBML) return !1;
		let i = Hr(n);
		if (typeof i != "number") return !1;
		let a = e._reader.requestSlice(n.filePos, i);
		if (a instanceof Promise && (a = await a), !a) return !1;
		let o = n.filePos;
		for (; a.filePos <= o + i - 2;) {
			let e = Ur(a);
			if (!e) break;
			let { id: n, size: r } = e, i = a.filePos;
			if (r === void 0) return !1;
			switch (n) {
				case F.EBMLVersion:
					if (I(a, r) !== 1) return !1;
					break;
				case F.EBMLReadVersion:
					if (I(a, r) !== 1) return !1;
					break;
				case F.DocType:
					if (Wr(a, r) !== t) return !1;
					break;
				case F.DocTypeVersion:
					if (I(a, r) > 4) return !1;
					break;
			}
			a.filePos = i + r;
		}
		return !0;
	}
	_canReadInput(e) {
		return this.isSupportedEBMLOfDocType(e, "matroska");
	}
	_createDemuxer(e) {
		return new ri(e);
	}
	get name() {
		return "Matroska";
	}
	get mimeType() {
		return "video/x-matroska";
	}
}, Ua = class extends Ha {
	_canReadInput(e) {
		return this.isSupportedEBMLOfDocType(e, "webm");
	}
	get name() {
		return "WebM";
	}
	get mimeType() {
		return "video/webm";
	}
}, Wa = class extends Ra {
	async _canReadInput(e) {
		let t = 0;
		for (;;) {
			let n = e._reader.requestSlice(t, 10);
			if (n instanceof Promise && (n = await n), !n) break;
			let r = ec(n);
			if (!r) break;
			t = n.filePos + r.size;
		}
		let n = await si(e._reader, t, t + 4096);
		if (!n) return !1;
		let r = n.header, i = Yt(r.mpegVersionId, r.channel), a = e._reader.requestSlice(n.startPos + i, 4);
		if (a instanceof Promise && (a = await a), !a) return !1;
		let o = W(a);
		if (o === 1483304551 || o === 1231971951) return !0;
		t = n.startPos + n.header.totalSize;
		let s = await si(e._reader, t, t + 4);
		if (!s) return !1;
		let c = s.header;
		return !(r.channel !== c.channel || r.sampleRate !== c.sampleRate);
	}
	_createDemuxer(e) {
		return new ci(e);
	}
	get name() {
		return "MP3";
	}
	get mimeType() {
		return "audio/mpeg";
	}
}, Ga = class extends Ra {
	async _canReadInput(e) {
		let t = e._reader.requestSlice(0, 12);
		if (t instanceof Promise && (t = await t), !t) return !1;
		let n = G(t, 4);
		return n !== "RIFF" && n !== "RIFX" && n !== "RF64" ? !1 : (t.skip(4), G(t, 4) === "WAVE");
	}
	_createDemuxer(e) {
		return new Si(e);
	}
	get name() {
		return "WAVE";
	}
	get mimeType() {
		return "audio/wav";
	}
}, Ka = class extends Ra {
	async _canReadInput(e) {
		let t = e._reader.requestSlice(0, 4);
		return t instanceof Promise && (t = await t), t ? G(t, 4) === "OggS" : !1;
	}
	_createDemuxer(e) {
		return new vi(e);
	}
	get name() {
		return "Ogg";
	}
	get mimeType() {
		return "application/ogg";
	}
}, qa = class extends Ra {
	async _canReadInput(e) {
		let t = 0;
		for (;;) {
			let n = e._reader.requestSlice(t, 10);
			if (n instanceof Promise && (n = await n), !n) break;
			let r = ec(n);
			if (!r) break;
			t = n.filePos + r.size;
		}
		let n = e._reader.requestSlice(t, 4);
		return n instanceof Promise && (n = await n), n ? G(n, 4) === "fLaC" : !1;
	}
	get name() {
		return "FLAC";
	}
	get mimeType() {
		return "audio/flac";
	}
	_createDemuxer(e) {
		return new Fi(e);
	}
}, Ja = class extends Ra {
	async _canReadInput(e) {
		let t = 0;
		for (;;) {
			let n = e._reader.requestSlice(t, 10);
			if (n instanceof Promise && (n = await n), !n) break;
			let r = ec(n);
			if (!r) break;
			t = n.filePos + r.size;
		}
		let n = e._reader.requestSliceRange(t, 7, 9);
		if (n instanceof Promise && (n = await n), !n) return !1;
		let r = Ti(n);
		if (!r || (t += r.frameLength, n = e._reader.requestSliceRange(t, 7, 9), n instanceof Promise && (n = await n), !n)) return !1;
		let i = Ti(n);
		return i ? r.objectType === i.objectType && r.samplingFrequencyIndex === i.samplingFrequencyIndex && r.channelConfiguration === i.channelConfiguration : !1;
	}
	_createDemuxer(e) {
		return new Di(e);
	}
	get name() {
		return "ADTS";
	}
	get mimeType() {
		return "audio/aac";
	}
}, Ya = class extends Ra {
	async _canReadInput(e) {
		let t = e._reader.requestSlice(0, 205);
		if (t instanceof Promise && (t = await t), !t) return !1;
		let n = V(t, 205);
		return n[0] === 71 && n[188] === 71 || n[0] === 71 && n[204] === 71 ? !0 : n[4] === 71 && n[196] === 71;
	}
	_createDemuxer(e) {
		return new Vi(e);
	}
	get name() {
		return "MPEG Transport Stream";
	}
	get mimeType() {
		return "video/MP2T";
	}
}, Xa = class extends Ra {
	async _canReadInput(e) {
		let t = e._reader.requestSlice(0, 7);
		if (t instanceof Promise && (t = await t), !t || G(t, 7) !== "#EXTM3U") return !1;
		if (!(e._rootSource instanceof ga)) throw TypeError("HLS inputs require `InputOptions.source` to be a PathedSource or a ref to one.");
		return e._rootSource._usedForHls = !0, !0;
	}
	_createDemuxer(e) {
		return new ja(e);
	}
	get name() {
		return "HTTP Live Streaming (HLS)";
	}
	get mimeType() {
		return Xi;
	}
}, Za = [
	/* @__PURE__ */ new Xa(),
	/* @__PURE__ */ new Ba(),
	/* @__PURE__ */ new Va(),
	/* @__PURE__ */ new Ha(),
	/* @__PURE__ */ new Ua(),
	/* @__PURE__ */ new Ga(),
	/* @__PURE__ */ new Ka(),
	/* @__PURE__ */ new qa(),
	/* @__PURE__ */ new Wa(),
	/* @__PURE__ */ new Ja(),
	/* @__PURE__ */ new Ya()
], Qa = (e, t) => {
	if (!e || typeof e != "object") throw TypeError(`${t}, when provided, must be an object.`);
	if (e.isobmff !== void 0) {
		if (!e.isobmff || typeof e.isobmff != "object") throw TypeError(`${t}.isobmff, when provided, must be an object.`);
		if (e.isobmff.resolveKeyId !== void 0 && typeof e.isobmff.resolveKeyId != "function") throw TypeError(`${t}.isobmff.resolveKeyId, when provided, must be a function.`);
	}
	if (e.hls !== void 0) {
		if (!e.hls || typeof e.hls != "object") throw TypeError(`${t}.hls, when provided, must be an object.`);
		if (e.hls.offsetTimestampsByDateTime !== void 0 && typeof e.hls.offsetTimestampsByDateTime != "boolean") throw TypeError(`${t}.hls.offsetTimestampsByDateTime, when provided, must be a boolean.`);
	}
}, $a = function(e, t, n) {
	if (t != null) {
		if (typeof t != "object" && typeof t != "function") throw TypeError("Object expected.");
		var r, i;
		if (n) {
			if (!Symbol.asyncDispose) throw TypeError("Symbol.asyncDispose is not defined.");
			r = t[Symbol.asyncDispose];
		}
		if (r === void 0) {
			if (!Symbol.dispose) throw TypeError("Symbol.dispose is not defined.");
			r = t[Symbol.dispose], n && (i = r);
		}
		if (typeof r != "function") throw TypeError("Object not disposable.");
		i && (r = function() {
			try {
				i.call(this);
			} catch (e) {
				return Promise.reject(e);
			}
		}), e.stack.push({
			value: t,
			dispose: r,
			async: n
		});
	} else n && e.stack.push({ async: !0 });
	return t;
}, eo = (function(e) {
	return function(t) {
		function n(n) {
			t.error = t.hasError ? new e(n, t.error, "An error was suppressed during disposal.") : n, t.hasError = !0;
		}
		var r, i = 0;
		function a() {
			for (; r = t.stack.pop();) try {
				if (!r.async && i === 1) return i = 0, t.stack.push(r), Promise.resolve().then(a);
				if (r.dispose) {
					var e = r.dispose.call(r.value);
					if (r.async) return i |= 2, Promise.resolve(e).then(a, function(e) {
						return n(e), a();
					});
				} else i |= 1;
			} catch (e) {
				n(e);
			}
			if (i === 1) return t.hasError ? Promise.reject(t.error) : Promise.resolve();
			if (t.hasError) throw t.error;
		}
		return a();
	};
})(typeof SuppressedError == "function" ? SuppressedError : function(e, t, n) {
	var r = Error(n);
	return r.name = "SuppressedError", r.error = e, r.suppressed = t, r;
});
Ke();
var to = -Infinity, no = -Infinity, ro = null;
typeof FinalizationRegistry < "u" && (ro = new FinalizationRegistry((e) => {
	let t = performance.now();
	e.type === "video" ? (t - to >= 1e3 && (D._error("A VideoSample was garbage collected without first being closed. For proper resource management, make sure to call close() on all your VideoSamples as soon as you're done using them."), to = t), typeof VideoFrame < "u" && e.data instanceof VideoFrame && e.data.close()) : (t - no >= 1e3 && (D._error("An AudioSample was garbage collected without first being closed. For proper resource management, make sure to call close() on all your AudioSamples as soon as you're done using them."), no = t), typeof AudioData < "u" && e.data instanceof AudioData && e.data.close());
}));
var io = class {
	constructor() {
		this._referenceCount = 0, this._lastAllocationBuffer = null;
	}
}, ao = [
	"I420",
	"I420P10",
	"I420P12",
	"I420A",
	"I420AP10",
	"I420AP12",
	"I422",
	"I422P10",
	"I422P12",
	"I422A",
	"I422AP10",
	"I422AP12",
	"I444",
	"I444P10",
	"I444P12",
	"I444A",
	"I444AP10",
	"I444AP12",
	"NV12",
	"RGBA",
	"RGBX",
	"BGRA",
	"BGRX"
], oo = new Set(ao), so = class e {
	get codedWidth() {
		return this.visibleRect.width;
	}
	get codedHeight() {
		return this.visibleRect.height;
	}
	get displayWidth() {
		return this.rotation % 180 == 0 ? this.squarePixelWidth : this.squarePixelHeight;
	}
	get displayHeight() {
		return this.rotation % 180 == 0 ? this.squarePixelHeight : this.squarePixelWidth;
	}
	get microsecondTimestamp() {
		return Math.trunc(Ae * this.timestamp);
	}
	get microsecondDuration() {
		return Math.trunc(Ae * this.duration);
	}
	get hasAlpha() {
		return this.format && this.format.includes("A");
	}
	constructor(t, n) {
		if (this._closed = !1, t instanceof ArrayBuffer || typeof SharedArrayBuffer < "u" && t instanceof SharedArrayBuffer || ArrayBuffer.isView(t)) {
			if (!n || typeof n != "object") throw TypeError("init must be an object.");
			if (n.format === void 0 || !oo.has(n.format)) throw TypeError("init.format must be one of: " + ao.join(", "));
			if (!Number.isInteger(n.codedWidth) || n.codedWidth <= 0) throw TypeError("init.codedWidth must be a positive integer.");
			if (!Number.isInteger(n.codedHeight) || n.codedHeight <= 0) throw TypeError("init.codedHeight must be a positive integer.");
			if (n.rotation !== void 0 && ![
				0,
				90,
				180,
				270
			].includes(n.rotation)) throw TypeError("init.rotation, when provided, must be 0, 90, 180, or 270.");
			if (!Number.isFinite(n.timestamp)) throw TypeError("init.timestamp must be a number.");
			if (n.duration !== void 0 && (!Number.isFinite(n.duration) || n.duration < 0)) throw TypeError("init.duration, when provided, must be a non-negative number.");
			if (n.layout !== void 0) {
				if (!Array.isArray(n.layout)) throw TypeError("init.layout, when provided, must be an array.");
				for (let e of n.layout) {
					if (!e || typeof e != "object" || Array.isArray(e)) throw TypeError("Each entry in init.layout must be an object.");
					if (!Number.isInteger(e.offset) || e.offset < 0) throw TypeError("plane.offset must be a non-negative integer.");
					if (!Number.isInteger(e.stride) || e.stride < 0) throw TypeError("plane.stride must be a non-negative integer.");
				}
			}
			if (n.visibleRect !== void 0 && Qe(n.visibleRect, "init.visibleRect"), n.displayWidth !== void 0 && (!Number.isInteger(n.displayWidth) || n.displayWidth <= 0)) throw TypeError("init.displayWidth, when provided, must be a positive integer.");
			if (n.displayHeight !== void 0 && (!Number.isInteger(n.displayHeight) || n.displayHeight <= 0)) throw TypeError("init.displayHeight, when provided, must be a positive integer.");
			if (n.displayWidth !== void 0 != (n.displayHeight !== void 0)) throw TypeError("init.displayWidth and init.displayHeight must be either both provided or both omitted.");
			this.format = n.format, this.rotation = n.rotation ?? 0, this.timestamp = n.timestamp, this.duration = n.duration ?? 0;
			let e = n.layout ?? vo(n.format, n.codedWidth, n.codedHeight), r = n.colorSpace ?? null;
			r === null && (r = this.format === "RGBA" || this.format === "RGBX" || this.format === "BGRA" || this.format === "BGRX" ? {
				primaries: "bt709",
				transfer: "iec61966-2-1",
				matrix: "rgb",
				fullRange: !0
			} : {
				primaries: "bt709",
				transfer: "bt709",
				matrix: "bt709",
				fullRange: !1
			}), this.visibleRect = {
				left: n.visibleRect?.left ?? 0,
				top: n.visibleRect?.top ?? 0,
				width: n.visibleRect?.width ?? n.codedWidth,
				height: n.visibleRect?.height ?? n.codedHeight
			}, n.displayWidth === void 0 ? (this.squarePixelWidth = this.visibleRect.width, this.squarePixelHeight = this.visibleRect.height) : (this.squarePixelWidth = this.rotation % 180 == 0 ? n.displayWidth : n.displayHeight, this.squarePixelHeight = this.rotation % 180 == 0 ? n.displayHeight : n.displayWidth), this._data = n._doNotCopy ? m(t) : m(t).slice(), this._layout = e, this.colorSpace = new po(r);
		} else if (typeof VideoFrame < "u" && t instanceof VideoFrame) {
			if (n?.rotation !== void 0 && ![
				0,
				90,
				180,
				270
			].includes(n.rotation)) throw TypeError("init.rotation, when provided, must be 0, 90, 180, or 270.");
			if (n?.timestamp !== void 0 && !Number.isFinite(n?.timestamp)) throw TypeError("init.timestamp, when provided, must be a number.");
			if (n?.duration !== void 0 && (!Number.isFinite(n.duration) || n.duration < 0)) throw TypeError("init.duration, when provided, must be a non-negative number.");
			n?.visibleRect !== void 0 && Qe(n.visibleRect, "init.visibleRect"), this._data = t, this._layout = null, this.format = t.format, this.visibleRect = {
				left: t.visibleRect?.x ?? 0,
				top: t.visibleRect?.y ?? 0,
				width: t.visibleRect?.width ?? t.codedWidth,
				height: t.visibleRect?.height ?? t.codedHeight
			}, this.rotation = n?.rotation ?? 0, this.squarePixelWidth = t.displayWidth, this.squarePixelHeight = t.displayHeight, this.timestamp = n?.timestamp ?? t.timestamp / 1e6, this.duration = n?.duration ?? (t.duration ?? 0) / 1e6, this.colorSpace = new po(t.colorSpace);
		} else if (typeof HTMLImageElement < "u" && t instanceof HTMLImageElement || typeof SVGImageElement < "u" && t instanceof SVGImageElement || typeof ImageBitmap < "u" && t instanceof ImageBitmap || typeof HTMLVideoElement < "u" && t instanceof HTMLVideoElement || typeof HTMLCanvasElement < "u" && t instanceof HTMLCanvasElement || typeof OffscreenCanvas < "u" && t instanceof OffscreenCanvas) {
			if (!n || typeof n != "object") throw TypeError("init must be an object.");
			if (n.rotation !== void 0 && ![
				0,
				90,
				180,
				270
			].includes(n.rotation)) throw TypeError("init.rotation, when provided, must be 0, 90, 180, or 270.");
			if (!Number.isFinite(n.timestamp)) throw TypeError("init.timestamp must be a number.");
			if (n.duration !== void 0 && (!Number.isFinite(n.duration) || n.duration < 0)) throw TypeError("init.duration, when provided, must be a non-negative number.");
			if (typeof VideoFrame < "u") return new e(new VideoFrame(t, {
				timestamp: Math.trunc(n.timestamp * Ae),
				duration: Math.trunc((n.duration ?? 0) * Ae) || void 0
			}), n);
			let r = 0, i = 0;
			if ("naturalWidth" in t ? (r = t.naturalWidth, i = t.naturalHeight) : "videoWidth" in t ? (r = t.videoWidth, i = t.videoHeight) : "width" in t && (r = Number(t.width), i = Number(t.height)), !r || !i) throw TypeError("Could not determine dimensions.");
			let a = new OffscreenCanvas(r, i), o = a.getContext("2d", {
				alpha: Ie(),
				willReadFrequently: !0
			});
			if (!o) throw Error("OffscreenCanvas must have support for the '2d' context in order to create a VideoSample from this data.");
			o.drawImage(t, 0, 0), this._data = a, this._layout = null, this.format = "RGBX", this.visibleRect = {
				left: 0,
				top: 0,
				width: r,
				height: i
			}, this.squarePixelWidth = r, this.squarePixelHeight = i, this.rotation = n.rotation ?? 0, this.timestamp = n.timestamp, this.duration = n.duration ?? 0, this.colorSpace = new po({
				matrix: "rgb",
				primaries: "bt709",
				transfer: "iec61966-2-1",
				fullRange: !0
			});
		} else if (t instanceof io) {
			if (!n || typeof n != "object") throw TypeError("init must be an object.");
			if (n.rotation !== void 0 && ![
				0,
				90,
				180,
				270
			].includes(n.rotation)) throw TypeError("init.rotation, when provided, must be 0, 90, 180, or 270.");
			if (!Number.isFinite(n.timestamp)) throw TypeError("init.timestamp must be a number.");
			if (n.duration !== void 0 && (!Number.isFinite(n.duration) || n.duration < 0)) throw TypeError("init.duration, when provided, must be a non-negative number.");
			if (this._data = t, t._referenceCount++, this.format = t.getFormat(), this.format !== null && !ao.includes(this.format)) throw TypeError("getFormat() must return a VideoSamplePixelFormat or null.");
			if (this.visibleRect = {
				left: 0,
				top: 0,
				width: t.getCodedWidth(),
				height: t.getCodedHeight()
			}, !Number.isInteger(this.visibleRect.width) || this.visibleRect.width <= 0) throw TypeError("getCodedWidth() must return a positive integer.");
			if (!Number.isInteger(this.visibleRect.height) || this.visibleRect.height <= 0) throw TypeError("getCodedHeight() must return a positive integer.");
			if (this.squarePixelWidth = t.getSquarePixelWidth(), !Number.isInteger(this.squarePixelWidth) || this.squarePixelWidth <= 0) throw TypeError("getSquarePixelWidth() must return a positive integer.");
			if (this.squarePixelHeight = t.getSquarePixelHeight(), !Number.isInteger(this.squarePixelHeight) || this.squarePixelHeight <= 0) throw TypeError("getSquarePixelHeight() must return a positive integer.");
			this.rotation = n.rotation ?? 0, this.timestamp = n.timestamp, this.duration = n.duration ?? 0, this.colorSpace = t.getColorSpace();
		} else throw TypeError("Invalid data type: Must be a BufferSource, CanvasImageSource, or VideoSampleResource.");
		this.encodeOptions = n?.encodeOptions ?? {}, this.pixelAspectRatio = Ze({
			num: this.squarePixelWidth * this.codedHeight,
			den: this.squarePixelHeight * this.codedWidth
		}), ro?.register(this, {
			type: "video",
			data: this._data
		}, this);
	}
	clone() {
		if (this._closed) throw Error("VideoSample is closed.");
		return c(this._data !== null), this._data instanceof io ? new e(this._data, {
			timestamp: this.timestamp,
			duration: this.duration,
			rotation: this.rotation,
			encodeOptions: this.encodeOptions
		}) : mo(this._data) ? new e(this._data.clone(), {
			timestamp: this.timestamp,
			duration: this.duration,
			rotation: this.rotation,
			encodeOptions: this.encodeOptions
		}) : this._data instanceof Uint8Array ? (c(this._layout), new e(this._data, {
			format: this.format,
			layout: this._layout,
			codedWidth: this.codedWidth,
			codedHeight: this.codedHeight,
			timestamp: this.timestamp,
			duration: this.duration,
			colorSpace: this.colorSpace,
			rotation: this.rotation,
			visibleRect: this.visibleRect,
			displayWidth: this.displayWidth,
			displayHeight: this.displayHeight,
			encodeOptions: this.encodeOptions,
			_doNotCopy: !0
		})) : new e(this._data, {
			format: this.format,
			codedWidth: this.codedWidth,
			codedHeight: this.codedHeight,
			timestamp: this.timestamp,
			duration: this.duration,
			colorSpace: this.colorSpace,
			rotation: this.rotation,
			visibleRect: this.visibleRect,
			displayWidth: this.displayWidth,
			displayHeight: this.displayHeight,
			encodeOptions: this.encodeOptions
		});
	}
	close() {
		this._closed ||= (ro?.unregister(this), this._data instanceof io ? (this._data._referenceCount--, this._data._referenceCount === 0 && this._data.close()) : mo(this._data) ? this._data.close() : this._data = null, !0);
	}
	allocationSize(e = {}) {
		if (_o(e), this._closed) throw Error("VideoSample is closed.");
		if ((e.format ?? this.format) == null) throw Error("Cannot get allocation size when format is null.");
		return mo(this._data) ? this._data.allocationSize(e) : bo(this, e).allocationSize;
	}
	async copyTo(t, n = {}) {
		if (!ne(t)) throw TypeError("destination must be an ArrayBuffer or an ArrayBuffer view.");
		if (_o(n), this._closed) throw Error("VideoSample is closed.");
		if ((n.format ?? this.format) == null) throw Error("Cannot copy video sample data when format is null.");
		if (c(this._data !== null), mo(this._data)) return this._data.copyTo(t, n);
		if (n.format && ![
			"RGBA",
			"RGBX",
			"BGRA",
			"BGRX"
		].includes(this.format) && [
			"RGBA",
			"RGBX",
			"BGRA",
			"BGRX"
		].includes(n.format)) if (this._data instanceof io) {
			let r = {
				stack: [],
				error: void 0,
				hasError: !1
			};
			try {
				let i = $a(r, await this._data.toRgbSample({
					timestamp: this.timestamp,
					duration: this.duration,
					rotation: this.rotation
				}, n.colorSpace ?? "srgb"), !1);
				if (!(i instanceof e)) throw TypeError("toRgbSample() must return a VideoSample.");
				if (![
					"RGBA",
					"RGBX",
					"BGRA",
					"BGRX"
				].includes(i.format)) throw Error(`Sample returned by toRgbSample was expected to have an RGB format, got '${i.format}' instead.`);
				return await i.copyTo(t, n);
			} catch (e) {
				r.error = e, r.hasError = !0;
			} finally {
				eo(r);
			}
		} else {
			if (typeof VideoFrame > "u") throw Error("For this sample, converting from a non-RGB to an RGB format requires VideoFrame to be defined.");
			let e = this.toVideoFrame(), r = await e.copyTo(t, n);
			return e.close(), r;
		}
		let r = bo(this, n);
		c(this.format);
		let i = m(t);
		if (i.byteLength < r.allocationSize) throw TypeError(`Destination buffer too small. Required: ${r.allocationSize}, Available: ${i.byteLength}`);
		let a = yo(this.format), o;
		if (this._data instanceof io) {
			let e = this._data.getDataPlanes();
			if (e instanceof Promise && (e = await e), !Array.isArray(e) || e.some((e) => !(e.data instanceof Uint8Array) || !Number.isInteger(e.stride) || e.stride < 0)) throw TypeError("getDataPlanes() must return an array of objects with a Uint8Array \"data\" property and a non-negative integer \"stride\" property.");
			o = e;
		} else if (this._data instanceof Uint8Array) c(this._layout), c(this._layout.length === a.length), o = this._layout.map((e, t) => {
			let n = Math.ceil(this.codedHeight / a[t].heightDivisor);
			return {
				data: this._data.subarray(e.offset, e.offset + e.stride * n),
				stride: e.stride
			};
		});
		else {
			let e = this._data.getContext("2d");
			c(e), o = [{
				data: m(e.getImageData(0, 0, this.codedWidth, this.codedHeight).data),
				stride: 4 * this.codedWidth
			}];
		}
		let s = [], l = a.length;
		for (let e = 0; e < l; e++) {
			let t = r.computedLayouts[e], n = o[e].stride, a = o[e].data, c = t.sourceTop * n;
			c += t.sourceLeftBytes;
			let l = t.destinationOffset, u = t.sourceWidthBytes, d = {
				offset: l,
				stride: t.destinationStride
			};
			for (let e = 0; e < t.sourceHeight; e++) {
				if (c + u > a.byteLength) throw Error("Source buffer OOB read.");
				if (l + u > i.byteLength) throw Error("Destination buffer OOB write.");
				let e = a.subarray(c, c + u);
				i.set(e, l), c += n, l += t.destinationStride;
			}
			s.push(d);
		}
		if (n.format !== void 0) {
			let e = this.format.startsWith("RGB") !== n.format.startsWith("RGB"), t = this.format.includes("X") && n.format.includes("A");
			if (e || t) for (let n = 0; n < r.allocationSize; n += 4) {
				if (e) {
					let e = i[n];
					i[n] = i[n + 2], i[n + 2] = e;
				}
				t && (i[n + 3] = 255);
			}
		}
		return s;
	}
	toVideoFrame() {
		if (this._closed) throw Error("VideoSample is closed.");
		if (c(this._data !== null), this._data instanceof io) {
			if (this.format === null) throw Error("Cannot convert a VideoSampleResource-backed VideoSample to VideoFrame if format is null.");
			let e = this._data.getDataPlanes();
			if (e instanceof Promise) throw Error("Cannot convert a VideoSampleResource-backed VideoSample to VideoFrame if getDataPlanes() returns a promise.");
			let t = e.reduce((e, t) => e + t.data.byteLength, 0), n = new Uint8Array(t), r = 0, i = [];
			for (let t of e) n.set(t.data, r), i.push(r), r += t.data.byteLength;
			return new VideoFrame(n, {
				format: this.format,
				layout: e.map((e, t) => ({
					offset: i[t],
					stride: e.stride
				})),
				codedWidth: this.codedWidth,
				codedHeight: this.codedHeight,
				timestamp: this.microsecondTimestamp,
				duration: this.microsecondDuration,
				colorSpace: this.colorSpace,
				visibleRect: this.visibleRect,
				displayWidth: this.squarePixelWidth,
				displayHeight: this.squarePixelHeight
			});
		} else if (mo(this._data)) return new VideoFrame(this._data, {
			timestamp: this.microsecondTimestamp,
			duration: this.microsecondDuration || void 0
		});
		else if (this._data instanceof Uint8Array) return c(this._layout), new VideoFrame(this._data, {
			format: this.format,
			codedWidth: this.codedWidth,
			codedHeight: this.codedHeight,
			layout: this._layout,
			timestamp: this.microsecondTimestamp,
			duration: this.microsecondDuration || void 0,
			colorSpace: this.colorSpace,
			visibleRect: this.visibleRect,
			displayWidth: this.squarePixelWidth,
			displayHeight: this.squarePixelHeight
		});
		else return new VideoFrame(this._data, {
			timestamp: this.microsecondTimestamp,
			duration: this.microsecondDuration || void 0
		});
	}
	draw(e, t, n, r, i, a, o, s, c) {
		let l = 0, u = 0, d = this.displayWidth, f = this.displayHeight, p = 0, m = 0, h = this.displayWidth, g = this.displayHeight;
		if (a === void 0 ? (p = t, m = n, r !== void 0 && (h = r, g = i)) : (l = t, u = n, d = r, f = i, p = a, m = o, s === void 0 ? (h = d, g = f) : (h = s, g = c)), !(typeof CanvasRenderingContext2D < "u" && e instanceof CanvasRenderingContext2D || typeof OffscreenCanvasRenderingContext2D < "u" && e instanceof OffscreenCanvasRenderingContext2D)) throw TypeError("context must be a CanvasRenderingContext2D or OffscreenCanvasRenderingContext2D.");
		if (!Number.isFinite(l)) throw TypeError("sx must be a number.");
		if (!Number.isFinite(u)) throw TypeError("sy must be a number.");
		if (!Number.isFinite(d) || d < 0) throw TypeError("sWidth must be a non-negative number.");
		if (!Number.isFinite(f) || f < 0) throw TypeError("sHeight must be a non-negative number.");
		if (!Number.isFinite(p)) throw TypeError("dx must be a number.");
		if (!Number.isFinite(m)) throw TypeError("dy must be a number.");
		if (!Number.isFinite(h) || h < 0) throw TypeError("dWidth must be a non-negative number.");
		if (!Number.isFinite(g) || g < 0) throw TypeError("dHeight must be a non-negative number.");
		if (this._closed) throw Error("VideoSample is closed.");
		({sx: l, sy: u, sWidth: d, sHeight: f} = this._rotateSourceRegion(l, u, d, f, this.rotation));
		let _ = this.toCanvasImageSource();
		e.save();
		let v = p + h / 2, y = m + g / 2;
		e.translate(v, y), e.rotate(this.rotation * Math.PI / 180);
		let b = this.rotation % 180 == 0 ? 1 : h / g;
		e.scale(1 / b, b), e.drawImage(_, l, u, d, f, -h / 2, -g / 2, h, g), e.restore();
	}
	drawWithFit(e, t) {
		if (!(typeof CanvasRenderingContext2D < "u" && e instanceof CanvasRenderingContext2D || typeof OffscreenCanvasRenderingContext2D < "u" && e instanceof OffscreenCanvasRenderingContext2D)) throw TypeError("context must be a CanvasRenderingContext2D or OffscreenCanvasRenderingContext2D.");
		if (!t || typeof t != "object") throw TypeError("options must be an object.");
		if (![
			"fill",
			"contain",
			"cover"
		].includes(t.fit)) throw TypeError("options.fit must be 'fill', 'contain', or 'cover'.");
		if (t.rotation !== void 0 && ![
			0,
			90,
			180,
			270
		].includes(t.rotation)) throw TypeError("options.rotation, when provided, must be 0, 90, 180, or 270.");
		t.crop !== void 0 && go(t.crop, "options.");
		let n = e.canvas.width, r = e.canvas.height, i = t.rotation ?? this.rotation, [a, o] = i % 180 == 0 ? [this.squarePixelWidth, this.squarePixelHeight] : [this.squarePixelHeight, this.squarePixelWidth], s = t.crop;
		s &&= ho(s, a, o);
		let c, l, u, d, { sx: f, sy: p, sWidth: m, sHeight: h } = this._rotateSourceRegion(t.crop?.left ?? 0, t.crop?.top ?? 0, t.crop?.width ?? a, t.crop?.height ?? o, i);
		if (t.fit === "fill") c = 0, l = 0, u = n, d = r;
		else {
			let [e, i] = t.crop ? [t.crop.width, t.crop.height] : [a, o], s = t.fit === "contain" ? Math.min(n / e, r / i) : Math.max(n / e, r / i);
			u = e * s, d = i * s, c = (n - u) / 2, l = (r - d) / 2;
		}
		e.save();
		let g = i % 180 == 0 ? 1 : u / d;
		e.translate(n / 2, r / 2), e.rotate(i * Math.PI / 180), e.scale(1 / g, g), e.translate(-n / 2, -r / 2), e.drawImage(this.toCanvasImageSource(), f, p, m, h, c, l, u, d), e.restore();
	}
	_rotateSourceRegion(e, t, n, r, i) {
		return i === 90 ? [e, t, n, r] = [
			t,
			this.squarePixelHeight - e - n,
			r,
			n
		] : i === 180 ? [e, t] = [this.squarePixelWidth - e - n, this.squarePixelHeight - t - r] : i === 270 && ([e, t, n, r] = [
			this.squarePixelWidth - t - r,
			e,
			r,
			n
		]), {
			sx: e,
			sy: t,
			sWidth: n,
			sHeight: r
		};
	}
	toCanvasImageSource() {
		if (this._closed) throw Error("VideoSample is closed.");
		if (c(this._data !== null), this._data instanceof io || this._data instanceof Uint8Array) {
			let e = this.toVideoFrame();
			return queueMicrotask(() => e.close()), e;
		} else return this._data;
	}
	async transform(t) {
		if (!t || typeof t != "object") throw TypeError("options must be an object.");
		if (t.width !== void 0 && (!Number.isInteger(t.width) || t.width <= 0)) throw TypeError("options.width, when provided, must be a positive integer.");
		if (t.height !== void 0 && (!Number.isInteger(t.height) || t.height <= 0)) throw TypeError("options.height, when provided, must be a positive integer.");
		if (t.roundDimensionsTo !== void 0 && (!Number.isInteger(t.roundDimensionsTo) || t.roundDimensionsTo <= 0)) throw TypeError("options.roundDimensionsTo, when provided, must be a positive integer.");
		if (t.fit !== void 0 && ![
			"fill",
			"contain",
			"cover"
		].includes(t.fit)) throw TypeError("options.fit, when provided, must be one of \"fill\", \"contain\", or \"cover\".");
		if (t.width !== void 0 && t.height !== void 0 && t.fit === void 0) throw TypeError("When both options.width and options.height are provided, options.fit must also be provided.");
		if (t.rotate !== void 0 && ![
			0,
			90,
			180,
			270
		].includes(t.rotate)) throw TypeError("options.rotate, when provided, must be 0, 90, 180 or 270.");
		if (t.crop !== void 0 && go(t.crop, "options."), t.alpha !== void 0 && !["keep", "discard"].includes(t.alpha)) throw TypeError("options.alpha, when provided, must be 'keep' or 'discard'.");
		let n = l(this.rotation + (t.rotate ?? 0)), [r, i] = n % 180 == 0 ? [this.squarePixelWidth, this.squarePixelHeight] : [this.squarePixelHeight, this.squarePixelWidth], a = t.crop;
		a &&= ho(a, r, i);
		let o = a ? a.width : r, s = a ? a.height : i, c = o / s, u, d;
		t.width !== void 0 && t.height === void 0 ? (u = t.width, d = u / c) : t.width === void 0 && t.height !== void 0 ? (d = t.height, u = d * c) : t.width !== void 0 && t.height !== void 0 ? (u = t.width, d = t.height) : (u = o, d = s), u = Ce(u, t.roundDimensionsTo ?? 1), d = Ce(d, t.roundDimensionsTo ?? 1);
		let f = {
			width: u,
			height: d,
			fit: t.fit ?? "fill",
			rotation: n,
			crop: a ?? {
				left: 0,
				top: 0,
				width: r,
				height: i
			},
			alpha: t.alpha ?? "keep"
		};
		for (let e of co) {
			let t = e(this, f);
			if (t instanceof Promise && (t = await t), t !== null) return t;
		}
		let p = null, m = !1;
		for (let e of uo) if (e.canvas.width === f.width && e.canvas.height === f.height) {
			p = e.canvas, e.age = fo++;
			break;
		}
		if (p === null) {
			if (typeof OffscreenCanvas < "u") p = new OffscreenCanvas(f.width, f.height);
			else {
				if (typeof window > "u" || typeof document > "u") throw Error("Cannot transform VideoSamples in this environment. Either run in an environment with OffscreenCanvas or HTMLCanvasElement, or supply a custom VideoSample transformer using registerVideoSampleTransformer().");
				p = document.createElement("canvas"), p.width = f.width, p.height = f.height;
			}
			m = !0, uo.length >= lo && uo.splice(Xe(uo, (e) => e.age), 1), uo.push({
				canvas: p,
				age: fo++
			});
		}
		let h = p.getContext("2d", { alpha: !0 });
		if (!h) throw Error("The '2d' canvas context is required to transform VideoSamples. Register a custom transformer using registerVideoSampleTransformer to work around this limitation.");
		return f.alpha === "discard" ? (h.fillStyle = "black", h.fillRect(0, 0, f.width, f.height)) : m || h.clearRect(0, 0, f.width, f.height), this.drawWithFit(h, {
			fit: f.fit,
			rotation: f.rotation,
			crop: f.crop
		}), new e(p, {
			timestamp: this.timestamp,
			duration: this.duration,
			rotation: 0
		});
	}
	setRotation(e) {
		if (![
			0,
			90,
			180,
			270
		].includes(e)) throw TypeError("newRotation must be 0, 90, 180, or 270.");
		this.rotation = e;
	}
	setTimestamp(e) {
		if (!Number.isFinite(e)) throw TypeError("newTimestamp must be a number.");
		this.timestamp = e;
	}
	setDuration(e) {
		if (!Number.isFinite(e) || e < 0) throw TypeError("newDuration must be a non-negative number.");
		this.duration = e;
	}
	setEncodeOptions(e) {
		if (!e || typeof e != "object") throw TypeError("newEncodeOptions must be an object.");
		this.encodeOptions = e;
	}
	[Symbol.dispose]() {
		this.close();
	}
}, co = [], lo = 3, uo = [], fo = 0, po = class {
	constructor(e) {
		if (e !== void 0) {
			if (!e || typeof e != "object") throw TypeError("init.colorSpace, when provided, must be an object.");
			let t = Object.keys(y);
			if (e.primaries != null && !t.includes(e.primaries)) throw TypeError(`init.colorSpace.primaries, when provided, must be one of ${t.join(", ")}.`);
			let n = Object.keys(x);
			if (e.transfer != null && !n.includes(e.transfer)) throw TypeError(`init.colorSpace.transfer, when provided, must be one of ${n.join(", ")}.`);
			let r = Object.keys(C);
			if (e.matrix != null && !r.includes(e.matrix)) throw TypeError(`init.colorSpace.matrix, when provided, must be one of ${r.join(", ")}.`);
			if (e.fullRange != null && typeof e.fullRange != "boolean") throw TypeError("init.colorSpace.fullRange, when provided, must be a boolean.");
		}
		this.primaries = e?.primaries ?? null, this.transfer = e?.transfer ?? null, this.matrix = e?.matrix ?? null, this.fullRange = e?.fullRange ?? null;
	}
	toJSON() {
		return {
			primaries: this.primaries,
			transfer: this.transfer,
			matrix: this.matrix,
			fullRange: this.fullRange
		};
	}
}, mo = (e) => typeof VideoFrame < "u" && e instanceof VideoFrame, ho = (e, t, n) => {
	let r = Math.min(e.left, t), i = Math.min(e.top, n), a = Math.min(e.width, t - r), o = Math.min(e.height, n - i);
	return c(a >= 0), c(o >= 0), {
		left: r,
		top: i,
		width: a,
		height: o
	};
}, go = (e, t) => {
	if (!e || typeof e != "object") throw TypeError(t + "crop, when provided, must be an object.");
	if (!Number.isInteger(e.left) || e.left < 0) throw TypeError(t + "crop.left must be a non-negative integer.");
	if (!Number.isInteger(e.top) || e.top < 0) throw TypeError(t + "crop.top must be a non-negative integer.");
	if (!Number.isInteger(e.width) || e.width < 0) throw TypeError(t + "crop.width must be a non-negative integer.");
	if (!Number.isInteger(e.height) || e.height < 0) throw TypeError(t + "crop.height must be a non-negative integer.");
}, _o = (e) => {
	if (!e || typeof e != "object") throw TypeError("options must be an object.");
	if (e.colorSpace !== void 0 && !["display-p3", "srgb"].includes(e.colorSpace)) throw TypeError("options.colorSpace, when provided, must be 'display-p3' or 'srgb'.");
	if (e.format !== void 0 && typeof e.format != "string") throw TypeError("options.format, when provided, must be a string.");
	if (e.layout !== void 0) {
		if (!Array.isArray(e.layout)) throw TypeError("options.layout, when provided, must be an array.");
		for (let t of e.layout) {
			if (!t || typeof t != "object") throw TypeError("Each entry in options.layout must be an object.");
			if (!Number.isInteger(t.offset) || t.offset < 0) throw TypeError("plane.offset must be a non-negative integer.");
			if (!Number.isInteger(t.stride) || t.stride < 0) throw TypeError("plane.stride must be a non-negative integer.");
		}
	}
	if (e.rect !== void 0) {
		if (!e.rect || typeof e.rect != "object") throw TypeError("options.rect, when provided, must be an object.");
		if (e.rect.x !== void 0 && (!Number.isInteger(e.rect.x) || e.rect.x < 0)) throw TypeError("options.rect.x, when provided, must be a non-negative integer.");
		if (e.rect.y !== void 0 && (!Number.isInteger(e.rect.y) || e.rect.y < 0)) throw TypeError("options.rect.y, when provided, must be a non-negative integer.");
		if (e.rect.width !== void 0 && (!Number.isInteger(e.rect.width) || e.rect.width < 0)) throw TypeError("options.rect.width, when provided, must be a non-negative integer.");
		if (e.rect.height !== void 0 && (!Number.isInteger(e.rect.height) || e.rect.height < 0)) throw TypeError("options.rect.height, when provided, must be a non-negative integer.");
	}
}, vo = (e, t, n) => {
	let r = yo(e), i = [], a = 0;
	for (let e of r) {
		let r = Math.ceil(t / e.widthDivisor), o = Math.ceil(n / e.heightDivisor), s = r * e.sampleBytes, c = s * o;
		i.push({
			offset: a,
			stride: s
		}), a += c;
	}
	return i;
}, yo = (e) => {
	let t = (e, t, n, r, i) => {
		let a = [
			{
				sampleBytes: e,
				widthDivisor: 1,
				heightDivisor: 1
			},
			{
				sampleBytes: t,
				widthDivisor: n,
				heightDivisor: r
			},
			{
				sampleBytes: t,
				widthDivisor: n,
				heightDivisor: r
			}
		];
		return i && a.push({
			sampleBytes: e,
			widthDivisor: 1,
			heightDivisor: 1
		}), a;
	};
	switch (e) {
		case "I420": return t(1, 1, 2, 2, !1);
		case "I420P10":
		case "I420P12": return t(2, 2, 2, 2, !1);
		case "I420A": return t(1, 1, 2, 2, !0);
		case "I420AP10":
		case "I420AP12": return t(2, 2, 2, 2, !0);
		case "I422": return t(1, 1, 2, 1, !1);
		case "I422P10":
		case "I422P12": return t(2, 2, 2, 1, !1);
		case "I422A": return t(1, 1, 2, 1, !0);
		case "I422AP10":
		case "I422AP12": return t(2, 2, 2, 1, !0);
		case "I444": return t(1, 1, 1, 1, !1);
		case "I444P10":
		case "I444P12": return t(2, 2, 1, 1, !1);
		case "I444A": return t(1, 1, 1, 1, !0);
		case "I444AP10":
		case "I444AP12": return t(2, 2, 1, 1, !0);
		case "NV12": return [{
			sampleBytes: 1,
			widthDivisor: 1,
			heightDivisor: 1
		}, {
			sampleBytes: 2,
			widthDivisor: 2,
			heightDivisor: 2
		}];
		case "RGBA":
		case "RGBX":
		case "BGRA":
		case "BGRX": return [{
			sampleBytes: 4,
			widthDivisor: 1,
			heightDivisor: 1
		}];
		default: he(e), c(!1);
	}
}, bo = (e, t) => {
	let n = {
		left: 0,
		top: 0,
		width: e.codedWidth,
		height: e.codedHeight
	}, r = t.rect, i = xo(n, r, e.codedWidth, e.codedHeight, e.format), a = t.layout, o;
	if (!t.format || t.format === e.format) o = e.format;
	else if ([
		"RGBA",
		"RGBX",
		"BGRA",
		"BGRX"
	].includes(t.format)) o = t.format;
	else throw Error("NotSupportedError: Invalid destination format.");
	return Co(i, o, a);
}, xo = (e, t, n, r, i) => {
	let a = { ...e };
	if (t !== void 0) {
		if (t.width === 0 || t.height === 0) throw TypeError("visibleRect dimensions cannot be zero.");
		if ((t.x || 0) + (t.width || 0) > n) throw TypeError("visibleRect exceeds codedWidth.");
		if ((t.y || 0) + (t.height || 0) > r) throw TypeError("visibleRect exceeds codedHeight.");
		a.x = t.x || 0, a.y = t.y || 0, a.width = t.width || 0, a.height = t.height || 0;
	}
	if (!So(i, a)) throw TypeError("visibleRect alignment is invalid for the format.");
	return a;
}, So = (e, t) => {
	if (e === null) return !0;
	let n = yo(e);
	for (let e = 0; e < n.length; e++) {
		let r = n[e], i = r.widthDivisor, a = r.heightDivisor;
		if ((t.x || 0) % i !== 0 || (t.y || 0) % a !== 0) return !1;
	}
	return !0;
}, Co = (e, t, n) => {
	let r = yo(t), i = r.length;
	if (n !== void 0 && n.length !== i) throw TypeError(`Layout must have ${i} planes.`);
	let a = 0, o = [], s = [];
	for (let t = 0; t < i; t++) {
		let i = r[t], c = i.sampleBytes, l = i.widthDivisor, u = i.heightDivisor, d = {
			destinationOffset: 0,
			destinationStride: 0,
			sourceTop: 0,
			sourceHeight: 0,
			sourceLeftBytes: 0,
			sourceWidthBytes: 0
		};
		if (d.sourceTop = Math.ceil(Math.trunc(e.y || 0) / u), d.sourceHeight = Math.ceil(Math.trunc(e.height || 0) / u), d.sourceLeftBytes = Math.floor(Math.trunc(e.x || 0) / l) * c, d.sourceWidthBytes = Math.floor(Math.trunc(e.width || 0) / l) * c, n !== void 0) {
			let e = n[t];
			if (e.stride < d.sourceWidthBytes) throw TypeError(`Stride for plane ${t} is too small.`);
			d.destinationOffset = e.offset, d.destinationStride = e.stride;
		} else d.destinationOffset = a, d.destinationStride = d.sourceWidthBytes;
		let f = d.destinationStride * d.sourceHeight + d.destinationOffset;
		if (f > 4294967295) throw TypeError("Allocation size exceeds limit.");
		s.push(f), a = Math.max(a, f);
		for (let e = 0; e < t; e++) {
			let n = o[e];
			if (!(s[t] <= n.destinationOffset || s[e] <= d.destinationOffset)) throw TypeError("Planes overlap.");
		}
		o.push(d);
	}
	return {
		allocationSize: a,
		computedLayouts: o
	};
}, wo = new Set([
	"f32",
	"f32-planar",
	"s16",
	"s16-planar",
	"s32",
	"s32-planar",
	"u8",
	"u8-planar"
]), To = class {
	constructor() {
		this._referenceCount = 0;
	}
}, Eo = class e {
	get microsecondTimestamp() {
		return Math.trunc(Ae * this.timestamp);
	}
	get microsecondDuration() {
		return Math.trunc(Ae * this.duration);
	}
	constructor(e) {
		if (this._closed = !1, jo(e)) {
			if (e.format === null) throw TypeError("AudioData with null format is not supported.");
			this._data = e, this.format = e.format, this.sampleRate = e.sampleRate, this.numberOfFrames = e.numberOfFrames, this.numberOfChannels = e.numberOfChannels, this.timestamp = e.timestamp / 1e6, this.duration = e.numberOfFrames / e.sampleRate;
		} else if (e instanceof To) {
			if (this._data = e, e._referenceCount++, this.format = e.getFormat(), !wo.has(this.format)) throw TypeError("getFormat() must return an AudioSampleFormat.");
			if (this.sampleRate = e.getSampleRate(), !Number.isInteger(this.sampleRate) || this.sampleRate <= 0) throw TypeError("getSampleRate() must return a positive integer.");
			if (this.numberOfFrames = e.getNumberOfFrames(), !Number.isInteger(this.numberOfFrames) || this.numberOfFrames < 0) throw TypeError("getNumberOfFrames() must return a non-negative integer.");
			if (this.numberOfChannels = e.getNumberOfChannels(), !Number.isInteger(this.numberOfChannels) || this.numberOfChannels <= 0) throw TypeError("getNumberOfChannels() must return a positive integer.");
			if (this.timestamp = e.getTimestamp(), !Number.isFinite(this.timestamp)) throw TypeError("getTimestamp() must return a finite number.");
			this.duration = this.numberOfFrames / this.sampleRate;
		} else {
			if (!e || typeof e != "object") throw TypeError("Invalid AudioDataInit: must be an object.");
			if (!wo.has(e.format)) throw TypeError("Invalid AudioDataInit: invalid format.");
			if (!Number.isFinite(e.sampleRate) || e.sampleRate <= 0) throw TypeError("Invalid AudioDataInit: sampleRate must be > 0.");
			if (!Number.isInteger(e.numberOfChannels) || e.numberOfChannels === 0) throw TypeError("Invalid AudioDataInit: numberOfChannels must be an integer > 0.");
			if (!Number.isFinite(e?.timestamp)) throw TypeError("init.timestamp must be a number.");
			let t = e.data.byteLength / (Do(e.format) * e.numberOfChannels);
			if (!Number.isInteger(t)) throw TypeError("Invalid AudioDataInit: data size is not a multiple of frame size.");
			this.format = e.format, this.sampleRate = e.sampleRate, this.numberOfFrames = t, this.numberOfChannels = e.numberOfChannels, this.timestamp = e.timestamp, this.duration = t / e.sampleRate;
			let n;
			if (e.data instanceof ArrayBuffer) n = new Uint8Array(e.data);
			else if (ArrayBuffer.isView(e.data)) n = new Uint8Array(e.data.buffer, e.data.byteOffset, e.data.byteLength);
			else throw TypeError("Invalid AudioDataInit: data is not a BufferSource.");
			let r = this.numberOfFrames * this.numberOfChannels * Do(this.format);
			if (n.byteLength < r) throw TypeError("Invalid AudioDataInit: insufficient data size.");
			this._data = n;
		}
		ro?.register(this, {
			type: "audio",
			data: this._data
		}, this);
	}
	allocationSize(e) {
		if (!e || typeof e != "object") throw TypeError("options must be an object.");
		if (!Number.isInteger(e.planeIndex) || e.planeIndex < 0) throw TypeError("planeIndex must be a non-negative integer.");
		if (e.format !== void 0 && !wo.has(e.format)) throw TypeError("Invalid format.");
		if (e.frameOffset !== void 0 && (!Number.isInteger(e.frameOffset) || e.frameOffset < 0)) throw TypeError("frameOffset must be a non-negative integer.");
		if (e.frameCount !== void 0 && (!Number.isInteger(e.frameCount) || e.frameCount < 0)) throw TypeError("frameCount must be a non-negative integer.");
		if (this._closed) throw Error("AudioSample is closed.");
		let t = e.format ?? this.format, n = e.frameOffset ?? 0;
		if (n >= this.numberOfFrames) throw RangeError("frameOffset out of range");
		let r = e.frameCount === void 0 ? this.numberOfFrames - n : e.frameCount;
		if (r > this.numberOfFrames - n) throw RangeError("frameCount out of range");
		let i = Do(t), a = Oo(t);
		if (a && e.planeIndex >= this.numberOfChannels || !a && e.planeIndex !== 0) throw RangeError("planeIndex out of range");
		return (a ? r : r * this.numberOfChannels) * i;
	}
	copyTo(e, t) {
		if (!ne(e)) throw TypeError("destination must be an ArrayBuffer or an ArrayBuffer view.");
		if (!t || typeof t != "object") throw TypeError("options must be an object.");
		if (!Number.isInteger(t.planeIndex) || t.planeIndex < 0) throw TypeError("planeIndex must be a non-negative integer.");
		if (t.format !== void 0 && !wo.has(t.format)) throw TypeError("Invalid format.");
		if (t.frameOffset !== void 0 && (!Number.isInteger(t.frameOffset) || t.frameOffset < 0)) throw TypeError("frameOffset must be a non-negative integer.");
		if (t.frameCount !== void 0 && (!Number.isInteger(t.frameCount) || t.frameCount < 0)) throw TypeError("frameCount must be a non-negative integer.");
		if (this._closed) throw Error("AudioSample is closed.");
		let { format: n, frameCount: r, frameOffset: i } = t, { planeIndex: a } = t, o = this.format, s = n ?? this.format;
		if (!s) throw Error("Destination format not determined");
		let c = this.numberOfFrames, l = this.numberOfChannels, u = i ?? 0;
		if (u >= c) throw RangeError("frameOffset out of range");
		let d = r === void 0 ? c - u : r;
		if (d > c - u) throw RangeError("frameCount out of range");
		let f = Do(s), p = Oo(s);
		if (p && a >= l || !p && a !== 0) throw RangeError("planeIndex out of range");
		let m = (p ? d : d * l) * f;
		if (e.byteLength < m) throw RangeError("Destination buffer is too small");
		let g = h(e), _ = Ao(s);
		if (jo(this._data)) Pe() && l > 2 && s !== o ? No(this._data, g, o, s, l, a, u, d) : this._data.copyTo(e, {
			planeIndex: a,
			frameOffset: u,
			frameCount: d,
			format: s
		});
		else {
			let e = ko(o), t = Do(o), n = Oo(o), r;
			if (this._data instanceof To) {
				let e = (e) => {
					let r = this._data.getDataPlane(e);
					if (!(r instanceof Uint8Array)) throw TypeError("getDataPlane() must return a Uint8Array.");
					let i = c * t * (n ? 1 : l);
					if (r.byteLength !== i) throw TypeError(`Data plane ${e} has invalid size. Expected exactly ${i} bytes, got ${r.byteLength} bytes.`);
					return r;
				};
				if (n) if (p) r = e(a), a = 0;
				else {
					r = new Uint8Array(c * t * l);
					for (let n = 0; n < l; n++) {
						let i = e(n);
						r.set(i, n * c * t);
					}
				}
				else r = e(0);
			} else r = this._data;
			let i = h(r);
			for (let r = 0; r < d; r++) if (p) {
				let o = r * f, s;
				s = n ? (a * c + (r + u)) * t : ((r + u) * l + a) * t, _(g, o, e(i, s));
			} else for (let a = 0; a < l; a++) {
				let o = (r * l + a) * f, s;
				s = n ? (a * c + (r + u)) * t : ((r + u) * l + a) * t, _(g, o, e(i, s));
			}
		}
	}
	clone() {
		if (this._closed) throw Error("AudioSample is closed.");
		if (this._data instanceof To) {
			let t = new e(this._data);
			return t.setTimestamp(this.timestamp), t;
		} else if (jo(this._data)) {
			let t = new e(this._data.clone());
			return t.setTimestamp(this.timestamp), t;
		} else return new e({
			format: this.format,
			sampleRate: this.sampleRate,
			numberOfFrames: this.numberOfFrames,
			numberOfChannels: this.numberOfChannels,
			timestamp: this.timestamp,
			data: this._data
		});
	}
	trim(t, n = this.numberOfFrames) {
		if (!Number.isInteger(t) || t < 0) throw TypeError("startSample must be a non-negative integer.");
		if (!Number.isInteger(n) || n < 0) throw TypeError("endSample must be a non-negative integer.");
		if (t > this.numberOfFrames) throw RangeError("startSample out of range.");
		if (n > this.numberOfFrames) throw RangeError("endSample out of range.");
		if (n < t) throw RangeError("endSample must not be less than startSample.");
		if (this._closed) throw Error("AudioSample is closed.");
		let r = n - t, i = Do(this.format), a;
		if (Oo(this.format)) {
			let e = r * i;
			if (a = new Uint8Array(e * this.numberOfChannels), r > 0) for (let n = 0; n < this.numberOfChannels; n++) this.copyTo(a.subarray(n * e, (n + 1) * e), {
				planeIndex: n,
				format: this.format,
				frameOffset: t,
				frameCount: r
			});
		} else a = new Uint8Array(r * this.numberOfChannels * i), r > 0 && this.copyTo(a, {
			planeIndex: 0,
			format: this.format,
			frameOffset: t,
			frameCount: r
		});
		return new e({
			data: a,
			format: this.format,
			sampleRate: this.sampleRate,
			numberOfChannels: this.numberOfChannels,
			timestamp: this.timestamp + t / this.sampleRate
		});
	}
	close() {
		this._closed ||= (ro?.unregister(this), this._data instanceof To ? (this._data._referenceCount--, this._data._referenceCount === 0 && this._data.close()) : jo(this._data) ? this._data.close() : this._data = new Uint8Array(), !0);
	}
	toAudioData() {
		if (this._closed) throw Error("AudioSample is closed.");
		return this._data instanceof To ? this._createAudioDataFromData() : jo(this._data) ? this._data.timestamp === this.microsecondTimestamp ? this._data.clone() : this._createAudioDataFromData() : new AudioData({
			format: this.format,
			sampleRate: this.sampleRate,
			numberOfFrames: this.numberOfFrames,
			numberOfChannels: this.numberOfChannels,
			timestamp: this.microsecondTimestamp,
			data: this._data.buffer instanceof ArrayBuffer ? this._data.buffer : this._data.slice()
		});
	}
	_createAudioDataFromData() {
		if (Oo(this.format)) {
			let e = this.allocationSize({
				planeIndex: 0,
				format: this.format
			}), t = new ArrayBuffer(e * this.numberOfChannels);
			for (let n = 0; n < this.numberOfChannels; n++) this.copyTo(new Uint8Array(t, n * e, e), {
				planeIndex: n,
				format: this.format
			});
			return new AudioData({
				format: this.format,
				sampleRate: this.sampleRate,
				numberOfFrames: this.numberOfFrames,
				numberOfChannels: this.numberOfChannels,
				timestamp: this.microsecondTimestamp,
				data: t
			});
		} else {
			let e = new ArrayBuffer(this.allocationSize({
				planeIndex: 0,
				format: this.format
			}));
			return this.copyTo(e, {
				planeIndex: 0,
				format: this.format
			}), new AudioData({
				format: this.format,
				sampleRate: this.sampleRate,
				numberOfFrames: this.numberOfFrames,
				numberOfChannels: this.numberOfChannels,
				timestamp: this.microsecondTimestamp,
				data: e
			});
		}
	}
	toAudioBuffer() {
		if (this._closed) throw Error("AudioSample is closed.");
		let e = new AudioBuffer({
			numberOfChannels: this.numberOfChannels,
			length: this.numberOfFrames,
			sampleRate: this.sampleRate
		}), t = new Float32Array(this.allocationSize({
			planeIndex: 0,
			format: "f32-planar"
		}) / 4);
		for (let n = 0; n < this.numberOfChannels; n++) this.copyTo(t, {
			planeIndex: n,
			format: "f32-planar"
		}), e.copyToChannel(t, n);
		return e;
	}
	setTimestamp(e) {
		if (!Number.isFinite(e)) throw TypeError("newTimestamp must be a number.");
		this.timestamp = e;
	}
	[Symbol.dispose]() {
		this.close();
	}
	static *_fromAudioBuffer(t, n) {
		if (!(t instanceof AudioBuffer)) throw TypeError("audioBuffer must be an AudioBuffer.");
		let r = t.numberOfChannels, i = t.sampleRate, a = t.length, o = Math.floor(24e4 / r), s = 0, c = a;
		for (; c > 0;) {
			let a = Math.min(o, c), l = new Float32Array(r * a);
			for (let e = 0; e < r; e++) t.copyFromChannel(l.subarray(e * a, (e + 1) * a), e, s);
			yield new e({
				format: "f32-planar",
				sampleRate: i,
				numberOfFrames: a,
				numberOfChannels: r,
				timestamp: n + s / i,
				data: l
			}), s += a, c -= a;
		}
	}
	static fromAudioBuffer(t, n) {
		if (!(t instanceof AudioBuffer)) throw TypeError("audioBuffer must be an AudioBuffer.");
		let r = t.numberOfChannels, i = t.sampleRate, a = t.length, o = Math.floor(24e4 / r), s = 0, c = a, l = [];
		for (; c > 0;) {
			let a = Math.min(o, c), u = new Float32Array(r * a);
			for (let e = 0; e < r; e++) t.copyFromChannel(u.subarray(e * a, (e + 1) * a), e, s);
			let d = new e({
				format: "f32-planar",
				sampleRate: i,
				numberOfFrames: a,
				numberOfChannels: r,
				timestamp: n + s / i,
				data: u
			});
			l.push(d), s += a, c -= a;
		}
		return l;
	}
}, Do = (e) => {
	switch (e) {
		case "u8":
		case "u8-planar": return 1;
		case "s16":
		case "s16-planar": return 2;
		case "s32":
		case "s32-planar": return 4;
		case "f32":
		case "f32-planar": return 4;
		default: throw Error("Unknown AudioSampleFormat");
	}
}, Oo = (e) => {
	switch (e) {
		case "u8-planar":
		case "s16-planar":
		case "s32-planar":
		case "f32-planar": return !0;
		default: return !1;
	}
}, ko = (e) => {
	switch (e) {
		case "u8":
		case "u8-planar": return (e, t) => (e.getUint8(t) - 128) / 128;
		case "s16":
		case "s16-planar": return (e, t) => e.getInt16(t, !0) / 32768;
		case "s32":
		case "s32-planar": return (e, t) => e.getInt32(t, !0) / 2147483648;
		case "f32":
		case "f32-planar": return (e, t) => e.getFloat32(t, !0);
	}
}, Ao = (e) => {
	switch (e) {
		case "u8":
		case "u8-planar": return (e, t, n) => e.setUint8(t, E((n + 1) * 127.5, 0, 255));
		case "s16":
		case "s16-planar": return (e, t, n) => e.setInt16(t, E(Math.round(n * 32767), -32768, 32767), !0);
		case "s32":
		case "s32-planar": return (e, t, n) => e.setInt32(t, E(Math.round(n * 2147483647), -2147483648, 2147483647), !0);
		case "f32":
		case "f32-planar": return (e, t, n) => e.setFloat32(t, n, !0);
	}
}, jo = (e) => typeof AudioData < "u" && e instanceof AudioData, Mo = (e) => {
	switch (e) {
		case "u8-planar": return "u8";
		case "s16-planar": return "s16";
		case "s32-planar": return "s32";
		case "f32-planar": return "f32";
		default: return e;
	}
}, No = (e, t, n, r, i, a, o, s) => {
	let c = ko(n), l = Ao(r), u = Do(n), d = Do(r), f = Oo(n);
	if (Oo(r)) if (f) {
		let r = new ArrayBuffer(s * u), i = h(r);
		e.copyTo(r, {
			planeIndex: a,
			frameOffset: o,
			frameCount: s,
			format: n
		});
		for (let e = 0; e < s; e++) {
			let n = e * u;
			l(t, e * d, c(i, n));
		}
	} else {
		let r = new ArrayBuffer(s * i * u), f = h(r);
		e.copyTo(r, {
			planeIndex: 0,
			frameOffset: o,
			frameCount: s,
			format: n
		});
		for (let e = 0; e < s; e++) {
			let n = (e * i + a) * u;
			l(t, e * d, c(f, n));
		}
	}
	else if (f) {
		let r = s * u, a = new ArrayBuffer(r), f = h(a);
		for (let r = 0; r < i; r++) {
			e.copyTo(a, {
				planeIndex: r,
				frameOffset: o,
				frameCount: s,
				format: n
			});
			for (let e = 0; e < s; e++) {
				let n = e * u;
				l(t, (e * i + r) * d, c(f, n));
			}
		}
	} else {
		let r = new ArrayBuffer(s * i * u), a = h(r);
		e.copyTo(r, {
			planeIndex: 0,
			frameOffset: o,
			frameCount: s,
			format: n
		});
		for (let e = 0; e < s; e++) for (let n = 0; n < i; n++) {
			let r = e * i + n, o = r * u;
			l(t, r * d, c(a, o));
		}
	}
}, Po = (e, t) => {
	let n = e.allocationSize({
		format: t,
		planeIndex: 0
	}), r = new ArrayBuffer(n);
	return e.copyTo(r, {
		format: t,
		planeIndex: 0
	}), new Eo({
		data: r,
		format: t,
		numberOfChannels: e.numberOfChannels,
		sampleRate: e.sampleRate,
		timestamp: e.timestamp,
		duration: e.duration
	});
}, Fo = (e) => {
	if (!e || typeof e != "object") throw TypeError("Encoding config must be an object.");
	if (!pt.includes(e.codec)) throw TypeError(`Invalid video codec '${e.codec}'. Must be one of: ${pt.join(", ")}.`);
	let t = e.bitrate;
	if (e.quality === void 0 && t === void 0) throw TypeError("config.quality must be provided.");
	if (e.quality !== void 0 && t !== void 0) throw TypeError("config.quality and config.bitrate cannot both be provided.");
	if (e.quality !== void 0 && !(e.quality instanceof Vo)) throw TypeError("config.quality, when provided, must be a Quality.");
	if (t !== void 0 && !(t instanceof Vo) && (!Number.isInteger(t) || t <= 0)) throw TypeError("config.bitrate, when provided, must be a positive integer or a quality.");
	if (e.keyFrameInterval !== void 0 && (!Number.isFinite(e.keyFrameInterval) || e.keyFrameInterval < 0)) throw TypeError("config.keyFrameInterval, when provided, must be a non-negative number.");
	if (e.sizeChangeBehavior !== void 0 && ![
		"deny",
		"passThrough",
		"fill",
		"contain",
		"cover"
	].includes(e.sizeChangeBehavior)) throw TypeError("config.sizeChangeBehavior, when provided, must be 'deny', 'passThrough', 'fill', 'contain' or 'cover'.");
	if (e.transform !== void 0) {
		if (typeof e.transform != "object" || !e.transform) throw TypeError("config.transform, when provided, must be an object.");
		if (e.transform.width !== void 0 && (!Number.isInteger(e.transform.width) || e.transform.width <= 0)) throw TypeError("config.transform.width, when provided, must be a positive integer.");
		if (e.transform.height !== void 0 && (!Number.isInteger(e.transform.height) || e.transform.height <= 0)) throw TypeError("config.transform.height, when provided, must be a positive integer.");
		if (e.transform.fit !== void 0 && ![
			"fill",
			"contain",
			"cover"
		].includes(e.transform.fit)) throw TypeError("config.transform.fit, when provided, must be one of \"fill\", \"contain\", or \"cover\".");
		if (e.transform.width !== void 0 && e.transform.height !== void 0 && e.transform.fit === void 0 && ![
			"fill",
			"contain",
			"cover"
		].includes(e.sizeChangeBehavior)) throw TypeError("When both config.transform.width and config.transform.height are provided, config.transform.fit must also be provided.");
		if (e.transform.fit !== void 0 && [
			"fill",
			"contain",
			"cover"
		].includes(e.sizeChangeBehavior) && e.transform.fit !== e.sizeChangeBehavior) throw TypeError("config.transform.fit, when provided, cannot differ from config.sizeChangeBehavior when config.sizeChangeBehavior is 'fill', 'contain' or 'cover', as sizeChangeBehavior already determines the fitting algorithm.");
		if (e.transform.rotate !== void 0 && ![
			0,
			90,
			180,
			270
		].includes(e.transform.rotate)) throw TypeError("config.transform.rotate, when provided, must be 0, 90, 180 or 270.");
		if (e.transform.crop !== void 0 && go(e.transform.crop, "config.transform."), e.transform.process !== void 0 && typeof e.transform.process != "function") throw TypeError("config.transform.process, when provided, must be a function.");
		if (e.transform.frameRate !== void 0 && (!Number.isFinite(e.transform.frameRate) || e.transform.frameRate <= 0)) throw TypeError("config.transform.frameRate, when provided, must be a finite positive number.");
		if (e.transform.force !== void 0 && typeof e.transform.force != "boolean") throw TypeError("config.transform.force, when provided, must be a boolean.");
	}
	if (e.onEncodedPacket !== void 0 && typeof e.onEncodedPacket != "function") throw TypeError("config.onEncodedPacket, when provided, must be a function.");
	if (e.onEncoderConfig !== void 0 && typeof e.onEncoderConfig != "function") throw TypeError("config.onEncoderConfig, when provided, must be a function.");
	if (e.onEncodedSample !== void 0 && typeof e.onEncodedSample != "function") throw TypeError("config.onEncodedSample, when provided, must be a function.");
	Io(e.codec, e);
}, Io = (e, t) => {
	if (!t || typeof t != "object") throw TypeError("Encoding options must be an object.");
	if (t.alpha !== void 0 && !["discard", "keep"].includes(t.alpha)) throw TypeError("options.alpha, when provided, must be 'discard' or 'keep'.");
	let n = t.bitrateMode;
	if (n !== void 0 && !["constant", "variable"].includes(n)) throw TypeError("bitrateMode, when provided, must be 'constant' or 'variable'.");
	if (t.latencyMode !== void 0 && !["quality", "realtime"].includes(t.latencyMode)) throw TypeError("latencyMode, when provided, must be 'quality' or 'realtime'.");
	if (t.fullCodecString !== void 0 && typeof t.fullCodecString != "string") throw TypeError("fullCodecString, when provided, must be a string.");
	if (t.fullCodecString !== void 0 && Nt(t.fullCodecString) !== e) throw TypeError(`fullCodecString, when provided, must be a string that matches the specified codec (${e}).`);
	if (t.hardwareAcceleration !== void 0 && ![
		"no-preference",
		"prefer-hardware",
		"prefer-software"
	].includes(t.hardwareAcceleration)) throw TypeError("hardwareAcceleration, when provided, must be 'no-preference', 'prefer-hardware' or 'prefer-software'.");
	if (t.scalabilityMode !== void 0 && typeof t.scalabilityMode != "string") throw TypeError("scalabilityMode, when provided, must be a string.");
	if (t.contentHint !== void 0 && typeof t.contentHint != "string") throw TypeError("contentHint, when provided, must be a string.");
}, Lo = (e) => {
	let t = e.bitrateMode, n = e.quality._toVideoRateControl(e.codec, e.width, e.height, t), r = (t, n, r) => ({
		codec: e.fullCodecString ?? Tt(e.codec, e.width, e.height, r, e.alpha === "keep"),
		width: e.width,
		height: e.height,
		displayWidth: e.squarePixelWidth,
		displayHeight: e.squarePixelHeight,
		bitrate: t,
		bitrateMode: n,
		alpha: e.alpha ?? "discard",
		framerate: e.framerate,
		latencyMode: e.latencyMode,
		hardwareAcceleration: e.hardwareAcceleration,
		scalabilityMode: e.scalabilityMode,
		contentHint: e.contentHint,
		...Pt(e.codec)
	}), i = [];
	return n.quantizer !== null && i.push({
		config: r(void 0, "quantizer", n.bitrate),
		quantizer: n.quantizer
	}), n.bitrateMode !== "quantizer" && i.push({
		config: r(n.bitrate, n.bitrateMode, n.bitrate),
		quantizer: null
	}), c(i.length > 0), i;
}, Ro = (e) => {
	if (!e || typeof e != "object") throw TypeError("Encoding config must be an object.");
	if (!ht.includes(e.codec)) throw TypeError(`Invalid audio codec '${e.codec}'. Must be one of: ${ht.join(", ")}.`);
	let t = e.bitrate;
	if (e.quality === void 0 && t === void 0 && !(k.includes(e.codec) || e.codec === "flac")) throw TypeError("config.quality must be provided for compressed audio codecs.");
	if (e.quality !== void 0 && t !== void 0) throw TypeError("config.quality and config.bitrate cannot both be provided.");
	if (e.quality !== void 0 && !(e.quality instanceof Vo)) throw TypeError("config.quality, when provided, must be a Quality.");
	if (t !== void 0 && !(t instanceof Vo) && (!Number.isInteger(t) || t <= 0)) throw TypeError("config.bitrate, when provided, must be a positive integer or a quality.");
	if (e.transform !== void 0) {
		if (typeof e.transform != "object" || !e.transform) throw TypeError("config.transform, when provided, must be an object.");
		if (e.transform.numberOfChannels !== void 0 && (!Number.isInteger(e.transform.numberOfChannels) || e.transform.numberOfChannels <= 0)) throw TypeError("config.transform.numberOfChannels, when provided, must be a positive integer.");
		if (e.transform.sampleRate !== void 0 && (!Number.isInteger(e.transform.sampleRate) || e.transform.sampleRate <= 0)) throw TypeError("config.transform.sampleRate, when provided, must be a positive integer.");
		if (e.transform.sampleFormat !== void 0 && ![
			"u8",
			"s16",
			"s32",
			"f32"
		].includes(e.transform.sampleFormat)) throw TypeError("config.transform.sampleFormat, when provided, must be one of: u8, s16, s32, f32.");
		if (e.transform.process !== void 0 && typeof e.transform.process != "function") throw TypeError("config.transform.process, when provided, must be a function.");
	}
	if (e.onEncodedPacket !== void 0 && typeof e.onEncodedPacket != "function") throw TypeError("config.onEncodedPacket, when provided, must be a function.");
	if (e.onEncoderConfig !== void 0 && typeof e.onEncoderConfig != "function") throw TypeError("config.onEncoderConfig, when provided, must be a function.");
	if (e.onEncodedSample !== void 0 && typeof e.onEncodedSample != "function") throw TypeError("config.onEncodedSample, when provided, must be a function.");
	zo(e.codec, e);
}, zo = (e, t) => {
	if (!t || typeof t != "object") throw TypeError("Encoding options must be an object.");
	let n = t.bitrateMode;
	if (n !== void 0 && !["constant", "variable"].includes(n)) throw TypeError("bitrateMode, when provided, must be 'constant' or 'variable'.");
	if (t.fullCodecString !== void 0 && typeof t.fullCodecString != "string") throw TypeError("fullCodecString, when provided, must be a string.");
	if (t.fullCodecString !== void 0 && Nt(t.fullCodecString) !== e) throw TypeError(`fullCodecString, when provided, must be a string that matches the specified codec (${e}).`);
}, Bo = (e) => {
	let t = e.bitrateMode;
	return {
		codec: e.fullCodecString ?? Ot(e.codec, e.numberOfChannels, e.sampleRate),
		numberOfChannels: e.numberOfChannels,
		sampleRate: e.sampleRate,
		bitrate: e.quality?._toAudioBitrate(e.codec),
		bitrateMode: e.quality?._bitrateMode ?? t,
		...Ft(e.codec)
	};
}, Vo = class {
	constructor(e) {
		if ((typeof e == "number" || typeof e == "string") && (e = { quality: e }), !e || typeof e != "object") throw TypeError("options must be an object.");
		if (e.bitrateMode !== void 0 && !["constant", "variable"].includes(e.bitrateMode)) throw TypeError("options.bitrateMode, when provided, must be 'constant' or 'variable'.");
		if ("quality" in e) {
			if (typeof e.quality == "string" ? !(e.quality in Ho) : typeof e.quality != "number" || Number.isNaN(e.quality)) throw TypeError("options.quality must be a number, or one of 'very-low', 'low', 'medium', 'high' or 'very-high'.");
			if (e.preferBitrate !== void 0 && typeof e.preferBitrate != "boolean") throw TypeError("options.preferBitrate, when provided, must be a boolean.");
			if ("bitrate" in e || "quantizer" in e) throw TypeError("options.quality cannot be combined with options.bitrate or options.quantizer.");
			this._quality = typeof e.quality == "string" ? Ho[e.quality] : e.quality, this._preferBitrate = e.preferBitrate ?? !1, this._bitrate = void 0, this._quantizer = void 0;
		} else {
			if (e.bitrate !== void 0 && (!Number.isInteger(e.bitrate) || e.bitrate <= 0)) throw TypeError("options.bitrate, when provided, must be a positive integer.");
			if (e.quantizer !== void 0 && (!Number.isInteger(e.quantizer) || e.quantizer < 0)) throw TypeError("options.quantizer, when provided, must be a non-negative integer.");
			if (e.bitrate === void 0 && e.quantizer === void 0) throw TypeError("At least one of options.bitrate or options.quantizer must be set.");
			if ("preferBitrate" in e) throw TypeError("options.preferBitrate can only be combined with options.quality.");
			this._quality = void 0, this._preferBitrate = !1, this._bitrate = e.bitrate, this._quantizer = e.quantizer;
		}
		this._bitrateMode = e.bitrateMode;
	}
	_toVideoRateControl(e, t, n, r) {
		let i = Uo[e], a = null, o = this._bitrateMode ?? r ?? "variable";
		if (this._quantizer !== void 0) if (!i) {
			if (this._bitrate === void 0) throw Error(`Codec '${e}' does not support quantizer-based encoding. Provide a bitrate in the Quality to define a fallback.`);
		} else if (this._quantizer < i.min || this._quantizer > i.max) {
			if (this._bitrate === void 0) throw Error(`Quantizer ${this._quantizer} is out of range for codec '${e}'; must be between ${i.min} and ${i.max}.`);
		} else a = this._quantizer, this._bitrate === void 0 && (o = "quantizer");
		else this._bitrate === void 0 && i && !this._preferBitrate && (c(this._quality !== void 0), a = E(Math.round(xe(i.worst, i.best, this._quality)), i.min, i.max));
		let s;
		if (this._bitrate !== void 0) s = this._bitrate;
		else {
			let r = this._quality;
			r === void 0 && (c(a !== null && i), r = E((a - i.worst) / (i.best - i.worst), 0, 1)), s = Go(e, t, n, Wo(r));
		}
		return {
			quantizer: a,
			bitrate: s,
			bitrateMode: o
		};
	}
	_toVideoBitrate(e, t, n) {
		return this._bitrate === void 0 ? (c(this._quality !== void 0), Go(e, t, n, Wo(this._quality))) : this._bitrate;
	}
	_toAudioBitrate(e) {
		if (k.includes(e) || e === "flac") return;
		if (this._bitrate !== void 0) return this._bitrate;
		if (this._quality === void 0) throw Error("This Quality defines neither a quality level nor a bitrate and therefore cannot be used for audio encoding.");
		let t = Wo(this._quality), n = {
			aac: 128e3,
			opus: 64e3,
			mp3: 16e4,
			vorbis: 64e3,
			ac3: 384e3,
			eac3: 192e3
		}[e];
		if (!n) throw Error(`Unhandled codec: ${e}`);
		let r = n * t;
		return e === "aac" ? r = [
			96e3,
			128e3,
			16e4,
			192e3
		].reduce((e, t) => Math.abs(t - r) < Math.abs(e - r) ? t : e) : e === "opus" || e === "vorbis" ? r = Math.max(6e3, r) : e === "mp3" && (r = [
			8e3,
			16e3,
			24e3,
			32e3,
			4e4,
			48e3,
			64e3,
			8e4,
			96e3,
			112e3,
			128e3,
			16e4,
			192e3,
			224e3,
			256e3,
			32e4
		].reduce((e, t) => Math.abs(t - r) < Math.abs(e - r) ? t : e)), Math.round(r / 1e3) * 1e3;
	}
}, Ho = {
	"very-low": 0,
	low: .25,
	medium: .5,
	high: .75,
	"very-high": 1
}, Uo = {
	avc: {
		min: 0,
		max: 51,
		worst: 41,
		best: 16
	},
	hevc: {
		min: 0,
		max: 51,
		worst: 41,
		best: 16
	},
	vp9: {
		min: 0,
		max: 63,
		worst: 52,
		best: 20
	},
	av1: {
		min: 0,
		max: 255,
		worst: 208,
		best: 80
	}
}, Wo = (e) => .3 * Math.exp(2.5538 * e), Go = (e, t, n, r) => {
	let i = t * n, a = 3e6, o = a * (i / 2073600) ** .95 * {
		avc: 1,
		hevc: .6,
		vp9: .6,
		av1: .4,
		vp8: 1.2,
		prores: 22e7 / a
	}[e] * r;
	return Math.ceil(o / 1e3) * 1e3;
}, Ko = (e, t) => {
	if (e === "avc") return { avc: { quantizer: t } };
	if (e === "hevc") return { hevc: { quantizer: t } };
	if (e === "vp9") return { vp9: { quantizer: t } };
	if (e === "av1") return { av1: { quantizer: t } };
	c(!1);
}, qo = /* @__PURE__ */ new Vo("medium"), Jo = /* @__PURE__ */ new Vo("high"), Yo = (e, t) => {
	if (e !== void 0) return e;
	if (t !== void 0) return t instanceof Vo ? t : new Vo({ bitrate: t });
}, Xo = [], Zo = [], Qo = [], $o = [], es = (e) => {
	let t = 8191, n = e, r = 4096, i = 0, a = 12, o = 0;
	for (n < 0 && (n = -n, i = 128), n += 33, n > t && (n = t); (n & r) !== r && a >= 5;) r >>= 1, a--;
	return o = n >> a - 4 & 15, ~(i | a - 5 << 4 | o) & 255;
}, ts = (e) => {
	let t = 0, n = 0, r = ~e;
	r & 128 && (r &= -129, t = -1), n = ((r & 240) >> 4) + 5;
	let i = (1 << n | (r & 15) << n - 4 | 1 << n - 5) - 33;
	return t === 0 ? i : -i;
}, ns = (e) => {
	let t = 4095, n = 2048, r = 0, i = 11, a = 0, o = e;
	for (o < 0 && (o = -o, r = 128), o > t && (o = t); (o & n) !== n && i >= 5;) n >>= 1, i--;
	return a = o >> (i === 4 ? 1 : i - 4) & 15, (r | i - 4 << 4 | a) ^ 85;
}, rs = (e) => {
	let t = 0, n = 0, r = e ^ 85;
	r & 128 && (r &= -129, t = -1), n = ((r & 240) >> 4) + 4;
	let i = 0;
	return i = n === 4 ? r << 1 | 1 : 1 << n | (r & 15) << n - 4 | 1 << n - 5, t === 0 ? i : -i;
}, is = (e) => {
	if (!e || typeof e != "object") throw TypeError("options must be an object.");
	if (e.metadataOnly !== void 0 && typeof e.metadataOnly != "boolean") throw TypeError("options.metadataOnly, when defined, must be a boolean.");
	if (e.verifyKeyPackets !== void 0 && typeof e.verifyKeyPackets != "boolean") throw TypeError("options.verifyKeyPackets, when defined, must be a boolean.");
	if (e.verifyKeyPackets && e.metadataOnly) throw TypeError("options.verifyKeyPackets and options.metadataOnly cannot be enabled together.");
	if (e.skipLiveWait !== void 0 && typeof e.skipLiveWait != "boolean") throw TypeError("options.skipLiveWait, when defined, must be a boolean.");
}, as = (e) => {
	if (!qe(e)) throw TypeError("timestamp must be a number.");
}, os = (e, t, n) => n.verifyKeyPackets ? t.then(async (t) => {
	if (!t || t.type === "delta") return t;
	let n = await e.determinePacketType(t);
	return n && (t.type = n), t;
}) : t, ss = class {
	constructor(e) {
		if (!(e instanceof Ss)) throw TypeError("track must be an InputTrack.");
		this._track = e;
	}
	async getFirstPacket(e = {}) {
		if (is(e), this._track.input._disposed) throw new z();
		return os(this._track, this._track._backing.getFirstPacket(e), e);
	}
	async getFirstKeyPacket(e = {}) {
		is(e);
		let t = await this.getFirstPacket(e);
		return t ? t.type === "key" ? t : this.getNextKeyPacket(t, e) : null;
	}
	async getPacket(e, t = {}) {
		if (as(e), is(t), this._track.input._disposed) throw new z();
		return os(this._track, this._track._backing.getPacket(e, t), t);
	}
	async getNextPacket(e, t = {}) {
		if (!(e instanceof N)) throw TypeError("packet must be an EncodedPacket.");
		if (is(t), this._track.input._disposed) throw new z();
		return os(this._track, this._track._backing.getNextPacket(e, t), t);
	}
	async getKeyPacket(e, t = {}) {
		if (as(e), is(t), this._track.input._disposed) throw new z();
		if (!t.verifyKeyPackets) return this._track._backing.getKeyPacket(e, t);
		let n = await this._track._backing.getKeyPacket(e, t);
		return n && (c(n.type === "key"), await this._track.determinePacketType(n) === "delta" ? this.getKeyPacket(n.timestamp - 1 / await this._track.getTimeResolution(), t) : n);
	}
	async getNextKeyPacket(e, t = {}) {
		if (!(e instanceof N)) throw TypeError("packet must be an EncodedPacket.");
		if (is(t), this._track.input._disposed) throw new z();
		if (!t.verifyKeyPackets) return this._track._backing.getNextKeyPacket(e, t);
		let n = await this._track._backing.getNextKeyPacket(e, t);
		return n && (c(n.type === "key"), await this._track.determinePacketType(n) === "delta" ? this.getNextKeyPacket(n, t) : n);
	}
	packets(e, t, n = {}) {
		if (e !== void 0 && !(e instanceof N)) throw TypeError("startPacket must be an EncodedPacket.");
		if (e !== void 0 && e.isMetadataOnly && !n?.metadataOnly) throw TypeError("startPacket can only be metadata-only if options.metadataOnly is enabled.");
		if (t !== void 0 && !(t instanceof N)) throw TypeError("endPacket must be an EncodedPacket.");
		if (is(n), this._track.input._disposed) throw new z();
		let r = [], { promise: i, resolve: a } = T(), { promise: o, resolve: s } = T(), c = !1, l = !1, u = null, d = !1, f = [], p = () => Math.max(2, f.length);
		(async () => {
			let u = e ?? await this.getFirstPacket(n);
			for (; u && !l && !this._track.input._disposed && !(t && u.sequenceNumber >= t?.sequenceNumber);) {
				if (r.length > p()) {
					({promise: o, resolve: s} = T()), await o;
					continue;
				}
				r.push(u), a(), {promise: i, resolve: a} = T(), u = await this.getNextPacket(u, n);
			}
			c = !0, a();
		})().catch((e) => {
			d || (u = e, d = !0, a());
		});
		let m = this._track;
		return {
			async next() {
				for (;;) if (m.input._disposed) throw new z();
				else if (l) return {
					value: void 0,
					done: !0
				};
				else if (d) throw u;
				else if (r.length > 0) {
					let e = r.shift(), t = performance.now();
					for (f.push(t); f.length > 0 && t - f[0] >= 1e3;) f.shift();
					return s(), {
						value: e,
						done: !1
					};
				} else if (c) return {
					value: void 0,
					done: !0
				};
				else await i;
			},
			async return() {
				return l = !0, s(), a(), {
					value: void 0,
					done: !0
				};
			},
			async throw(e) {
				throw e;
			},
			[Symbol.asyncIterator]() {
				return this;
			}
		};
	}
}, cs = class {
	constructor(e, t) {
		this.onSample = e, this.onError = t;
	}
}, ls = class {
	mediaSamplesInRange(e = -Infinity, t = Infinity, n) {
		as(e), as(t);
		let r = [], i = !1, a = null, { promise: o, resolve: s } = T(), { promise: c, resolve: l } = T(), u = !1, d = !1, f = !1, p = null, m = null, h = !1, g = {
			...n,
			verifyKeyPackets: !0,
			metadataOnly: !1
		};
		(async () => {
			p = await this._createDecoder((n) => {
				if (l(), n.timestamp >= t && (d = !0), d) {
					n.close();
					return;
				}
				a && (n.timestamp > e ? (r.push(a), i = !0) : a.close()), n.timestamp >= e && (r.push(n), i = !0), a = i ? null : n, r.length > 0 && (s(), {promise: o, resolve: s} = T());
			}, (e) => {
				h || (m = e, h = !0, s());
			});
			let n = this._createPacketSink(), _ = await n.getKeyPacket(e, g) ?? await n.getFirstKeyPacket(g), v = _, y = n.packets(_ ?? void 0, void 0, g);
			for (await y.next(); v && !d && !this._track.input._disposed;) {
				let e = us(r.length);
				if (r.length + p.getDecodeQueueSize() > e) {
					({promise: c, resolve: l} = T()), await c;
					continue;
				}
				p.decode(v);
				let t = await y.next();
				if (t.done) break;
				v = t.value;
			}
			await y.return(), !f && !this._track.input._disposed && await p.flush(), !i && a && r.push(a), u = !0, s();
		})().catch((e) => {
			h || (m = e, h = !0, s());
		}).finally(() => {
			p?.close();
		});
		let _ = this._track, v = () => {
			a?.close();
			for (let e of r) e.close();
		};
		return {
			async next() {
				for (;;) if (_.input._disposed) throw v(), new z();
				else if (f) return {
					value: void 0,
					done: !0
				};
				else if (h) throw v(), m;
				else if (r.length > 0) {
					let e = r.shift();
					return l(), {
						value: e,
						done: !1
					};
				} else if (!u) await o;
				else return {
					value: void 0,
					done: !0
				};
			},
			async return() {
				return f = !0, d = !0, l(), s(), v(), {
					value: void 0,
					done: !0
				};
			},
			async throw(e) {
				throw e;
			},
			[Symbol.asyncIterator]() {
				return this;
			}
		};
	}
	mediaSamplesAtTimestamps(e, t) {
		me(e);
		let n = pe(e), r = [], i = [], { promise: a, resolve: o } = T(), { promise: s, resolve: l } = T(), u = !1, d = !1, f = null, p = null, m = !1, h = (e) => {
			i.push(e), o(), {promise: a, resolve: o} = T();
		}, g = {
			...t,
			verifyKeyPackets: !0,
			metadataOnly: !1
		};
		(async () => {
			f = await this._createDecoder((e) => {
				if (l(), d) {
					e.close();
					return;
				}
				let t = 0;
				for (; r.length > 0 && e.timestamp - r[0] > -1e-10;) t++, r.shift();
				if (t > 0) for (let n = 0; n < t; n++) h(n < t - 1 ? e.clone() : e);
				else e.close();
			}, (e) => {
				m || (p = e, m = !0, o());
			});
			let e = this._createPacketSink(), t = null, a = null, _ = -1, v = async () => {
				c(a), c(f);
				let t = a;
				for (f.decode(t); t.sequenceNumber < _;) {
					let n = us(i.length);
					for (; i.length + f.getDecodeQueueSize() > n && !d;) ({promise: s, resolve: l} = T()), await s;
					if (d) break;
					let r = await e.getNextPacket(t, g);
					c(r), f.decode(r), t = r;
				}
				_ = -1;
			}, y = async () => {
				c(f), await f.flush();
				for (let e = 0; e < r.length; e++) h(null);
				r.length = 0;
			};
			for await (let i of n) {
				if (as(i), d || this._track.input._disposed) break;
				let n = await e.getPacket(i, g), o = n && await e.getKeyPacket(i, g);
				if (!o) {
					_ !== -1 && (await v(), await y()), h(null), t = null;
					continue;
				}
				t && (o.sequenceNumber !== a.sequenceNumber || n.timestamp < t.timestamp) && (await v(), await y()), r.push(n.timestamp), _ = Math.max(n.sequenceNumber, _), t = n, a = o;
			}
			!d && !this._track.input._disposed && (_ !== -1 && await v(), await y()), u = !0, o();
		})().catch((e) => {
			m || (p = e, m = !0, o());
		}).finally(() => {
			f?.close();
		});
		let _ = this._track, v = () => {
			for (let e of i) e?.close();
		};
		return {
			async next() {
				for (;;) if (_.input._disposed) throw v(), new z();
				else if (d) return {
					value: void 0,
					done: !0
				};
				else if (m) throw v(), p;
				else if (i.length > 0) {
					let e = i.shift();
					return c(e !== void 0), l(), {
						value: e,
						done: !1
					};
				} else if (!u) await a;
				else return {
					value: void 0,
					done: !0
				};
			},
			async return() {
				return d = !0, l(), o(), v(), {
					value: void 0,
					done: !0
				};
			},
			async throw(e) {
				throw e;
			},
			[Symbol.asyncIterator]() {
				return this;
			}
		};
	}
}, us = (e) => e === 0 ? 40 : 8, ds = class extends cs {
	constructor(e, t, n, r, i, a) {
		super(e, t), this.codec = n, this.decoderConfig = r, this.rotation = i, this.timeResolution = a, this.decoder = null, this.customDecoder = null, this.customDecoderCallSerializer = new Me(), this.customDecoderQueueSize = 0, this.inputTimestamps = [], this.sampleQueue = [], this.currentPacketIndex = 0, this.raslSkipped = !1, this.alphaDecoder = null, this.alphaHadKeyframe = !1, this.colorQueue = [], this.alphaQueue = [], this.merger = null, this.decodedAlphaChunkCount = 0, this.alphaDecoderQueueSize = 0, this.nullAlphaFrameQueue = [], this.currentAlphaPacketIndex = 0, this.alphaRaslSkipped = !1, this.finalSamples = [], this.mergeAlphaPromises = [];
		let o = Xo.find((e) => e.supports(n, r));
		if (o) this.customDecoder = new o(), this.customDecoder.codec = n, this.customDecoder.config = r, this.customDecoder.onSample = (e) => {
			if (!(e instanceof so)) throw TypeError("The argument passed to onSample must be a VideoSample.");
			this.finalizeAndEmitSample(e);
		}, this.customDecoder.onError = (e) => {
			t(e);
		}, this.customDecoderCallSerializer.call(() => this.customDecoder.init()).catch((e) => t(e));
		else {
			let e = (e) => {
				if (this.alphaQueue.length > 0) {
					let t = this.alphaQueue.shift();
					c(t !== void 0), this.mergeAlpha(e, t);
				} else this.colorQueue.push(e);
			};
			if (n === "avc" && this.decoderConfig.description && Re()) {
				let e = mn(m(this.decoderConfig.description));
				if (e && e.sequenceParameterSets.length > 0) {
					let t = gn(e.sequenceParameterSets[0]);
					t && t.frameMbsOnlyFlag === 0 && (this.decoderConfig = {
						...this.decoderConfig,
						hardwareAcceleration: "prefer-software"
					});
				}
			}
			let t = (/* @__PURE__ */ Error("Decoding error")).stack;
			this.decoder = new VideoDecoder({
				output: (t) => {
					try {
						e(t);
					} catch (e) {
						this.onError(e);
					}
				},
				error: (e) => {
					e.stack = t, this.onError(e);
				}
			}), this.decoder.configure(this.decoderConfig);
		}
	}
	getDecodeQueueSize() {
		return this.customDecoder ? this.customDecoderQueueSize : (c(this.decoder), Math.max(this.decoder.decodeQueueSize, this.alphaDecoder?.decodeQueueSize ?? 0));
	}
	decode(e) {
		if (this.codec === "hevc" && this.currentPacketIndex > 0 && !this.raslSkipped) {
			if (this.hasHevcRaslPicture(e.data)) return;
			this.raslSkipped = !0;
		}
		if (this.customDecoder) this.customDecoderQueueSize++, this.customDecoderCallSerializer.call(() => this.customDecoder.decode(e)).catch((e) => this.onError(e)).finally(() => this.customDecoderQueueSize--);
		else {
			if (c(this.decoder), Pe() || le(this.inputTimestamps, e.timestamp, (e) => e), Re() && this.currentPacketIndex === 0) {
				if (this.codec === "avc") {
					let t = [], n = !1;
					for (let r of an(e.data, this.decoderConfig)) {
						let i = on(e.data[r.offset]);
						if (n ||= i >= 1 && i <= 5, i === A.AUD) {
							if (n) break;
							t.length = 0;
						}
						i >= 20 && i <= 31 || t.push(e.data.subarray(r.offset, r.offset + r.length));
					}
					e = new N(dn(t, this.decoderConfig), e.type, e.timestamp, e.duration);
				} else if (this.codec === "hevc") {
					let t = jn(e.data, this.decoderConfig);
					t && (e = new N(t, e.type, e.timestamp, e.duration));
				}
			}
			this.decoder.decode(e.toEncodedVideoChunk()), this.decodeAlphaData(e);
		}
		this.currentPacketIndex++;
	}
	decodeAlphaData(e) {
		if (!e.sideData.alpha) {
			this.pushNullAlphaFrame();
			return;
		}
		if (this.merger ||= new ps(), !this.alphaDecoder) {
			let e = (e) => {
				if (this.colorQueue.length > 0) {
					let t = this.colorQueue.shift();
					c(t !== void 0), this.mergeAlpha(t, e);
				} else this.alphaQueue.push(e);
				for (this.decodedAlphaChunkCount++; this.nullAlphaFrameQueue.length > 0 && this.nullAlphaFrameQueue[0] === this.decodedAlphaChunkCount;) if (this.nullAlphaFrameQueue.shift(), this.colorQueue.length > 0) {
					let e = this.colorQueue.shift();
					c(e !== void 0), this.mergeAlpha(e, null);
				} else this.alphaQueue.push(null);
				this.alphaDecoderQueueSize--;
			}, t = (/* @__PURE__ */ Error("Decoding error")).stack;
			this.alphaDecoder = new VideoDecoder({
				output: (t) => {
					try {
						e(t);
					} catch (e) {
						this.onError(e);
					}
				},
				error: (e) => {
					e.stack = t, this.onError(e);
				}
			}), this.alphaDecoder.configure(this.decoderConfig);
		}
		let t = zn(this.codec, this.decoderConfig, e.sideData.alpha);
		if (this.alphaHadKeyframe ||= t === "key", this.alphaHadKeyframe) {
			if (this.codec === "hevc" && this.currentAlphaPacketIndex > 0 && !this.alphaRaslSkipped) {
				if (this.hasHevcRaslPicture(e.sideData.alpha)) {
					this.pushNullAlphaFrame();
					return;
				}
				this.alphaRaslSkipped = !0;
			}
			this.currentAlphaPacketIndex++, this.alphaDecoder.decode(e.alphaToEncodedVideoChunk(t ?? e.type)), this.alphaDecoderQueueSize++;
		} else this.pushNullAlphaFrame();
	}
	pushNullAlphaFrame() {
		this.alphaDecoderQueueSize === 0 ? this.alphaQueue.push(null) : this.nullAlphaFrameQueue.push(this.decodedAlphaChunkCount + this.alphaDecoderQueueSize);
	}
	hasHevcRaslPicture(e) {
		for (let t of yn(e, this.decoderConfig)) {
			let n = bn(e[t.offset]);
			if (n === j.RASL_N || n === j.RASL_R) return !0;
		}
		return !1;
	}
	sampleHandler(e) {
		if (Pe()) {
			if (this.sampleQueue.length > 0 && e.timestamp >= u(this.sampleQueue).timestamp) {
				for (let e of this.sampleQueue) this.finalizeAndEmitSample(e);
				this.sampleQueue.length = 0;
			}
			le(this.sampleQueue, e, (e) => e.timestamp);
		} else {
			let t = this.inputTimestamps.shift();
			c(t !== void 0), e.setTimestamp(t), this.finalizeAndEmitSample(e);
		}
	}
	finalizeAndEmitSample(e) {
		e.setTimestamp(Math.round(e.timestamp * this.timeResolution) / this.timeResolution), e.setDuration(Math.round(e.duration * this.timeResolution) / this.timeResolution), e.setRotation(this.rotation), this.onSample(e);
	}
	async mergeAlpha(e, t) {
		let n = T();
		this.mergeAlphaPromises.push(n.promise);
		let r = { sample: null };
		this.finalSamples.push(r);
		try {
			for (t ? (c(this.merger), r.sample = new so(await this.merger.merge(e, t))) : r.sample = new so(e); this.finalSamples.length > 0 && this.finalSamples[0].sample !== null;) {
				let e = this.finalSamples.shift();
				this.sampleHandler(e.sample);
			}
		} catch (e) {
			ue(this.finalSamples, r), this.onError(e);
		} finally {
			ue(this.mergeAlphaPromises, n.promise), n.resolve();
		}
	}
	async flush() {
		if (this.customDecoder ? await this.customDecoderCallSerializer.call(() => this.customDecoder.flush()) : (c(this.decoder), await Promise.all([this.decoder.flush(), this.alphaDecoder?.flush()]), await Promise.all(this.mergeAlphaPromises), this.colorQueue.forEach((e) => e.close()), this.colorQueue.length = 0, this.alphaQueue.forEach((e) => e?.close()), this.alphaQueue.length = 0, this.alphaHadKeyframe = !1, this.decodedAlphaChunkCount = 0, this.alphaDecoderQueueSize = 0, this.nullAlphaFrameQueue.length = 0, this.currentAlphaPacketIndex = 0, this.alphaRaslSkipped = !1), Pe()) {
			for (let e of this.sampleQueue) this.finalizeAndEmitSample(e);
			this.sampleQueue.length = 0;
		}
		this.currentPacketIndex = 0, this.raslSkipped = !1;
	}
	close() {
		this.customDecoder ? this.customDecoderCallSerializer.call(() => this.customDecoder.close()) : (c(this.decoder), this.decoder.close(), this.alphaDecoder?.close(), this.colorQueue.forEach((e) => e.close()), this.colorQueue.length = 0, this.alphaQueue.forEach((e) => e?.close()), this.alphaQueue.length = 0, this.merger?.close());
		for (let e of this.sampleQueue) e.close();
		this.sampleQueue.length = 0;
	}
}, fs = null, ps = class {
	constructor() {
		this.workers = [], this.nextWorkerIndex = 0, this.pendingRequests = /* @__PURE__ */ new Map(), this.nextRequestId = 0;
	}
	merge(e, t) {
		if (this.workers.length === 0) {
			if (!fs) {
				let e = new Blob([`(${ms.toString()})()`], { type: "application/javascript" });
				fs = URL.createObjectURL(e);
			}
			let e = E(navigator.hardwareConcurrency, 1, 4);
			for (let t = 0; t < e; t++) {
				let e = new Worker(fs);
				e.addEventListener("message", (e) => {
					let t = e.data, n = this.pendingRequests.get(t.id);
					n && (this.pendingRequests.delete(t.id), "error" in t ? n.reject(Error(t.error)) : n.resolve(t.frame));
				}), e.addEventListener("error", (e) => {
					let t = Error(e.message || "Color/alpha merge worker error.");
					for (let e of this.pendingRequests.values()) e.reject(t);
					this.pendingRequests.clear();
				}), this.workers.push(e);
			}
		}
		let n = this.nextRequestId++, r = T();
		this.pendingRequests.set(n, r);
		let i = this.workers[this.nextWorkerIndex];
		return this.nextWorkerIndex = (this.nextWorkerIndex + 1) % this.workers.length, i.postMessage({
			id: n,
			color: e,
			alpha: t
		}, { transfer: [e, t] }), r.promise;
	}
	close() {
		for (let e of this.workers) e.terminate();
		this.workers.length = 0;
		let e = /* @__PURE__ */ Error("Color/alpha merger closed.");
		for (let t of this.pendingRequests.values()) t.reject(e);
		this.pendingRequests.clear();
	}
}, ms = () => {
	let e = null, t = null, n = Promise.resolve();
	self.addEventListener("message", (e) => {
		let { id: t, color: i, alpha: a } = e.data;
		n = n.then(async () => {
			try {
				let e = await r(i, a);
				self.postMessage({
					id: t,
					frame: e
				}, { transfer: [e] });
			} catch (e) {
				self.postMessage({
					id: t,
					error: e.message
				});
			} finally {
				i.close(), a.close();
			}
		});
	});
	let r = async (e, t) => {
		let n = e.format, r = t.format;
		if (!n || !r) throw Error("CPU color/alpha merging requires a known VideoFrame format.");
		let s = n.includes("P10"), c = n.includes("P12"), l = r.includes("P10"), u = r.includes("P12");
		if (l !== s || u !== c) throw Error(`CPU color/alpha merging requires the alpha frame to have the same bit depth as the color frame (color: '${n}', alpha: '${r}').`);
		if (n === "RGBX" || n === "RGBA" || n === "BGRX" || n === "BGRA") return await i(e, t, n);
		if (n === "I420" || n === "I420P10" || n === "I420P12" || n === "I422" || n === "I422P10" || n === "I422P12" || n === "I444" || n === "I444P10" || n === "I444P12") return await a(e, t, n);
		if (n === "NV12") return await o(e, t);
		throw Error(`CPU color/alpha merging does not support format '${n}'.`);
	}, i = async (e, t, n) => {
		let r = e.visibleRect?.width ?? e.codedWidth, i = e.visibleRect?.height ?? e.codedHeight, a = r * i, o = new Uint8Array(a * 4);
		await e.copyTo(o);
		let c = await s(t, r, i, 1);
		for (let e = 0, t = 3; e < a; e++, t += 4) o[t] = c[e];
		let l = {
			format: n === "RGBX" || n === "RGBA" ? "RGBA" : "BGRA",
			codedWidth: r,
			codedHeight: i,
			timestamp: e.timestamp,
			duration: e.duration ?? void 0,
			transfer: [o.buffer]
		};
		return new VideoFrame(o, l);
	}, a = async (e, t, n) => {
		let r = e.visibleRect?.width ?? e.codedWidth, i = e.visibleRect?.height ?? e.codedHeight, a = n.includes("P10"), o = n.includes("P12"), c = a || o ? 2 : 1, l, u;
		n.startsWith("I420") ? (l = Math.ceil(r / 2), u = Math.ceil(i / 2)) : n.startsWith("I422") ? (l = Math.ceil(r / 2), u = i) : (l = r, u = i);
		let d = r * i, f = l * u, p = d * c, m = f * c, h = d * c, g = p + 2 * m + h, _ = new Uint8Array(g);
		await e.copyTo(_);
		let v = await s(t, r, i, c), y = p + 2 * m;
		_.set(v, y);
		let b = {
			format: n.slice(0, 4) + "A" + n.slice(4),
			codedWidth: r,
			codedHeight: i,
			timestamp: e.timestamp,
			duration: e.duration ?? void 0,
			transfer: [_.buffer]
		};
		return new VideoFrame(_, b);
	}, o = async (e, n) => {
		let r = e.visibleRect?.width ?? e.codedWidth, i = e.visibleRect?.height ?? e.codedHeight, a = r * i, o = Math.ceil(r / 2) * Math.ceil(i / 2), c = e.allocationSize();
		(!t || t.byteLength !== c) && (t = new Uint8Array(c)), await e.copyTo(t);
		let l = new Uint8Array(a + 2 * o + a);
		l.set(t.subarray(0, a), 0);
		let u = a, d = a + o, f = a;
		for (let e = 0; e < o; e++) l[u + e] = t[f + e * 2], l[d + e] = t[f + e * 2 + 1];
		let p = await s(n, r, i, 1);
		l.set(p, a + 2 * o);
		let m = {
			format: "I420A",
			codedWidth: r,
			codedHeight: i,
			timestamp: e.timestamp,
			duration: e.duration ?? void 0,
			transfer: [l.buffer]
		};
		return new VideoFrame(l, m);
	}, s = async (t, n, r, i) => {
		let a = t.allocationSize();
		(!e || e.byteLength !== a) && (e = new Uint8Array(a)), await t.copyTo(e);
		let o = t.format;
		if (o === "RGBA" || o === "BGRA" || o === "RGBX" || o === "BGRX") {
			let t = o === "RGBA" || o === "RGBX" ? 0 : 2, i = n * r;
			for (let n = 0; n < i; n++) e[n] = e[n * 4 + t];
			return e.subarray(0, i);
		} else return e.subarray(0, n * r * i);
	};
}, hs = (e) => {
	if (!e || typeof e != "object") throw TypeError("decoderOptions must be an object.");
	if (e.hardwareAcceleration !== void 0 && ![
		"no-preference",
		"prefer-hardware",
		"prefer-software"
	].includes(e.hardwareAcceleration)) throw TypeError("decoderOptions.hardwareAcceleration, when provided, must be 'no-preference', 'prefer-hardware' or 'prefer-software'.");
	if (e.optimizeForLatency !== void 0 && typeof e.optimizeForLatency != "boolean") throw TypeError("decoderOptions.optimizeForLatency, when provided, must be a boolean.");
}, gs = class extends ls {
	constructor(e, t = {}) {
		if (!(e instanceof ws)) throw TypeError("videoTrack must be an InputVideoTrack.");
		hs(t), super(), this._track = e, this._decoderOptions = t;
	}
	async _createDecoder(e, t) {
		if (!await this._track.canDecode()) throw Error("This video track cannot be decoded by this browser. Make sure to check decodability before using a track.");
		let n = await this._track.getCodec(), r = await this._track.getRotation(), i = await this._track.getDecoderConfig(), a = await this._track.getTimeResolution();
		return c(n && i), i = {
			...i,
			hardwareAcceleration: this._decoderOptions.hardwareAcceleration,
			optimizeForLatency: this._decoderOptions.optimizeForLatency
		}, new ds(e, t, n, i, r, a);
	}
	_createPacketSink() {
		return new ss(this._track);
	}
	async getSample(e, t = {}) {
		as(e);
		for await (let n of this.mediaSamplesAtTimestamps([e], t)) return n;
		throw Error("Internal error: Iterator returned nothing.");
	}
	samples(e, t, n = {}) {
		return this.mediaSamplesInRange(e, t, n);
	}
	samplesAtTimestamps(e, t = {}) {
		return this.mediaSamplesAtTimestamps(e, t);
	}
}, _s = class {
	constructor(e, t = {}) {
		if (this._rotation = 0, this._initPromise = null, this._nextCanvasIndex = 0, !(e instanceof ws)) throw TypeError("videoTrack must be an InputVideoTrack.");
		if (t && typeof t != "object") throw TypeError("options must be an object.");
		if (t.alpha !== void 0 && typeof t.alpha != "boolean") throw TypeError("options.alpha, when provided, must be a boolean.");
		if (t.width !== void 0 && (!Number.isInteger(t.width) || t.width <= 0)) throw TypeError("options.width, when defined, must be a positive integer.");
		if (t.height !== void 0 && (!Number.isInteger(t.height) || t.height <= 0)) throw TypeError("options.height, when defined, must be a positive integer.");
		if (t.fit !== void 0 && ![
			"fill",
			"contain",
			"cover"
		].includes(t.fit)) throw TypeError("options.fit, when provided, must be one of \"fill\", \"contain\", or \"cover\".");
		if (t.width !== void 0 && t.height !== void 0 && t.fit === void 0) throw TypeError("When both options.width and options.height are provided, options.fit must also be provided.");
		if (t.rotation !== void 0 && ![
			0,
			90,
			180,
			270
		].includes(t.rotation)) throw TypeError("options.rotation, when provided, must be 0, 90, 180 or 270.");
		if (t.crop !== void 0 && go(t.crop, "options."), t.poolSize !== void 0 && (typeof t.poolSize != "number" || !Number.isInteger(t.poolSize) || t.poolSize < 0)) throw TypeError("poolSize must be a non-negative integer.");
		t.decoderOptions !== void 0 && hs(t.decoderOptions), this._videoTrack = e, this._alpha = t.alpha ?? !1, this._options = t, this._fit = t.fit ?? "fill", this._videoSampleSink = new gs(e, t.decoderOptions), this._canvasPool = Array.from({ length: t.poolSize ?? 0 }, () => null);
	}
	_ensureInit() {
		return this._initPromise ??= (async () => {
			let e = this._options, t = this._videoTrack, n = e.rotation ?? await t.getRotation(), r = await t.getSquarePixelWidth(), i = await t.getSquarePixelHeight(), [a, o] = n % 180 == 0 ? [r, i] : [i, r], s = e.crop;
			s &&= ho(s, a, o);
			let [c, l] = s ? [s.width, s.height] : [a, o], u = c / l;
			e.width !== void 0 && e.height === void 0 ? (c = e.width, l = Math.round(c / u)) : e.width === void 0 && e.height !== void 0 ? (l = e.height, c = Math.round(l * u)) : e.width !== void 0 && e.height !== void 0 && (c = e.width, l = e.height), this._width = c, this._height = l, this._rotation = n, this._crop = s;
		})();
	}
	_videoSampleToWrappedCanvas(e) {
		let t = this._width, n = this._height, r = this._canvasPool[this._nextCanvasIndex], i = !1;
		r || (typeof document < "u" ? (r = document.createElement("canvas"), r.width = t, r.height = n) : r = new OffscreenCanvas(t, n), this._canvasPool.length > 0 && (this._canvasPool[this._nextCanvasIndex] = r), i = !0), this._canvasPool.length > 0 && (this._nextCanvasIndex = (this._nextCanvasIndex + 1) % this._canvasPool.length);
		let a = r.getContext("2d", { alpha: this._alpha || Ie() });
		c(a), a.resetTransform(), i || (!this._alpha && Ie() ? (a.fillStyle = "black", a.fillRect(0, 0, t, n)) : a.clearRect(0, 0, t, n)), e.drawWithFit(a, {
			fit: this._fit,
			rotation: this._rotation,
			crop: this._crop
		});
		let o = {
			canvas: r,
			timestamp: e.timestamp,
			duration: e.duration
		};
		return e.close(), o;
	}
	async getCanvas(e, t) {
		as(e), await this._ensureInit();
		let n = await this._videoSampleSink.getSample(e, t);
		return n && this._videoSampleToWrappedCanvas(n);
	}
	async *canvases(e, t, n) {
		await this._ensureInit(), yield* be(this._videoSampleSink.samples(e, t, n), (e) => this._videoSampleToWrappedCanvas(e));
	}
	async *canvasesAtTimestamps(e, t) {
		await this._ensureInit(), yield* be(this._videoSampleSink.samplesAtTimestamps(e, t), (e) => e && this._videoSampleToWrappedCanvas(e));
	}
}, vs = class extends cs {
	constructor(e, t, n, r) {
		super(e, t), this.decoder = null, this.customDecoder = null, this.customDecoderCallSerializer = new Me(), this.customDecoderQueueSize = 0, this.currentTimestamp = null, this.expectedFirstTimestamp = null, this.timestampOffset = 0;
		let i = (t) => {
			let n = t.timestamp;
			this.expectedFirstTimestamp && this.currentTimestamp === null && (this.timestampOffset = this.expectedFirstTimestamp - n), n += this.timestampOffset, (this.currentTimestamp === null || Math.abs(n - this.currentTimestamp) >= t.duration) && (this.currentTimestamp = n);
			let i = this.currentTimestamp;
			if (this.currentTimestamp += t.duration, t.numberOfFrames === 0) {
				t.close();
				return;
			}
			let a = r.sampleRate;
			t.setTimestamp(Math.round(i * a) / a), e(t);
		}, a = Zo.find((e) => e.supports(n, r));
		if (a) this.customDecoder = new a(), this.customDecoder.codec = n, this.customDecoder.config = r, this.customDecoder.onSample = (e) => {
			if (!(e instanceof Eo)) throw TypeError("The argument passed to onSample must be an AudioSample.");
			i(e);
		}, this.customDecoder.onError = (e) => {
			t(e);
		}, this.customDecoderCallSerializer.call(() => this.customDecoder.init()).catch((e) => t(e));
		else {
			let e = (/* @__PURE__ */ Error("Decoding error")).stack;
			this.decoder = new AudioDecoder({
				output: (e) => {
					try {
						i(new Eo(e));
					} catch (e) {
						this.onError(e);
					}
				},
				error: (t) => {
					t.stack = e, this.onError(t);
				}
			}), this.decoder.configure(r);
		}
	}
	getDecodeQueueSize() {
		return this.customDecoder ? this.customDecoderQueueSize : (c(this.decoder), this.decoder.decodeQueueSize);
	}
	decode(e) {
		this.customDecoder ? (this.customDecoderQueueSize++, this.customDecoderCallSerializer.call(() => this.customDecoder.decode(e)).catch((e) => this.onError(e)).finally(() => this.customDecoderQueueSize--)) : (c(this.decoder), this.expectedFirstTimestamp ??= e.timestamp, this.decoder.decode(e.toEncodedAudioChunk()));
	}
	async flush() {
		this.customDecoder ? await this.customDecoderCallSerializer.call(() => this.customDecoder.flush()) : (c(this.decoder), await this.decoder.flush()), this.currentTimestamp = null, this.expectedFirstTimestamp = null, this.timestampOffset = 0;
	}
	close() {
		this.customDecoder ? this.customDecoderCallSerializer.call(() => this.customDecoder.close()) : (c(this.decoder), this.decoder.close());
	}
}, ys = class extends cs {
	constructor(e, t, n) {
		super(e, t), this.decoderConfig = n, this.currentTimestamp = null, c(k.includes(n.codec)), this.codec = n.codec;
		let { dataType: r, sampleSize: i, littleEndian: a } = Mt(this.codec);
		switch (this.inputSampleSize = i, i) {
			case 1:
				r === "unsigned" ? this.readInputValue = (e, t) => e.getUint8(t) - 2 ** 7 : r === "signed" ? this.readInputValue = (e, t) => e.getInt8(t) : r === "ulaw" ? this.readInputValue = (e, t) => ts(e.getUint8(t)) : r === "alaw" ? this.readInputValue = (e, t) => rs(e.getUint8(t)) : c(!1);
				break;
			case 2:
				r === "unsigned" ? this.readInputValue = (e, t) => e.getUint16(t, a) - 2 ** 15 : r === "signed" ? this.readInputValue = (e, t) => e.getInt16(t, a) : c(!1);
				break;
			case 3:
				r === "unsigned" ? this.readInputValue = (e, t) => ge(e, t, a) - 2 ** 23 : r === "signed" ? this.readInputValue = (e, t) => _e(e, t, a) : c(!1);
				break;
			case 4:
				r === "unsigned" ? this.readInputValue = (e, t) => e.getUint32(t, a) - 2 ** 31 : r === "signed" ? this.readInputValue = (e, t) => e.getInt32(t, a) : r === "float" ? this.readInputValue = (e, t) => e.getFloat32(t, a) : c(!1);
				break;
			case 8:
				r === "float" ? this.readInputValue = (e, t) => e.getFloat64(t, a) : c(!1);
				break;
			default: he(i), c(!1);
		}
		switch (i) {
			case 1:
				r === "ulaw" || r === "alaw" ? (this.outputSampleSize = 2, this.outputFormat = "s16", this.writeOutputValue = (e, t, n) => e.setInt16(t, n, !0)) : (this.outputSampleSize = 1, this.outputFormat = "u8", this.writeOutputValue = (e, t, n) => e.setUint8(t, n + 2 ** 7));
				break;
			case 2:
				this.outputSampleSize = 2, this.outputFormat = "s16", this.writeOutputValue = (e, t, n) => e.setInt16(t, n, !0);
				break;
			case 3:
				this.outputSampleSize = 4, this.outputFormat = "s32", this.writeOutputValue = (e, t, n) => e.setInt32(t, n << 8, !0);
				break;
			case 4:
				this.outputSampleSize = 4, r === "float" ? (this.outputFormat = "f32", this.writeOutputValue = (e, t, n) => e.setFloat32(t, n, !0)) : (this.outputFormat = "s32", this.writeOutputValue = (e, t, n) => e.setInt32(t, n, !0));
				break;
			case 8:
				this.outputSampleSize = 4, this.outputFormat = "f32", this.writeOutputValue = (e, t, n) => e.setFloat32(t, n, !0);
				break;
			default: he(i), c(!1);
		}
	}
	getDecodeQueueSize() {
		return 0;
	}
	decode(e) {
		let t = h(e.data), n = e.byteLength / this.decoderConfig.numberOfChannels / this.inputSampleSize, r = n * this.decoderConfig.numberOfChannels * this.outputSampleSize, i = new ArrayBuffer(r), a = new DataView(i);
		for (let e = 0; e < n * this.decoderConfig.numberOfChannels; e++) {
			let n = e * this.inputSampleSize, r = e * this.outputSampleSize, i = this.readInputValue(t, n);
			this.writeOutputValue(a, r, i);
		}
		let o = n / this.decoderConfig.sampleRate;
		(this.currentTimestamp === null || Math.abs(e.timestamp - this.currentTimestamp) >= o) && (this.currentTimestamp = e.timestamp);
		let s = this.currentTimestamp;
		this.currentTimestamp += o;
		let c = new Eo({
			format: this.outputFormat,
			data: i,
			numberOfChannels: this.decoderConfig.numberOfChannels,
			sampleRate: this.decoderConfig.sampleRate,
			numberOfFrames: n,
			timestamp: s
		});
		this.onSample(c);
	}
	async flush() {}
	close() {}
}, bs = class extends ls {
	constructor(e) {
		if (!(e instanceof Ts)) throw TypeError("audioTrack must be an InputAudioTrack.");
		super(), this._track = e;
	}
	async _createDecoder(e, t) {
		if (!await this._track.canDecode()) throw Error("This audio track cannot be decoded by this browser. Make sure to check decodability before using a track.");
		let n = await this._track.getCodec(), r = await this._track.getDecoderConfig();
		return c(n && r), k.includes(r.codec) ? new ys(e, t, r) : new vs(e, t, n, r);
	}
	_createPacketSink() {
		return new ss(this._track);
	}
	async getSample(e, t = {}) {
		as(e);
		for await (let n of this.mediaSamplesAtTimestamps([e], t)) return n;
		throw Error("Internal error: Iterator returned nothing.");
	}
	samples(e, t, n = {}) {
		return this.mediaSamplesInRange(e, t, n);
	}
	samplesAtTimestamps(e, t = {}) {
		return this.mediaSamplesAtTimestamps(e, t);
	}
}, xs = class {
	constructor(e) {
		if (!(e instanceof Ts)) throw TypeError("audioTrack must be an InputAudioTrack.");
		this._audioSampleSink = new bs(e);
	}
	_audioSampleToWrappedArrayBuffer(e) {
		let t = {
			buffer: e.toAudioBuffer(),
			timestamp: e.timestamp,
			duration: e.duration
		};
		return e.close(), t;
	}
	async getBuffer(e, t) {
		as(e);
		let n = await this._audioSampleSink.getSample(e, t);
		return n && this._audioSampleToWrappedArrayBuffer(n);
	}
	buffers(e, t, n) {
		return be(this._audioSampleSink.samples(e, t, n), (e) => this._audioSampleToWrappedArrayBuffer(e));
	}
	buffersAtTimestamps(e, t) {
		return be(this._audioSampleSink.samplesAtTimestamps(e, t), (e) => e && this._audioSampleToWrappedArrayBuffer(e));
	}
}, Ss = class e {
	constructor(e, t) {
		this.input = e, this._backing = t;
	}
	isVideoTrack() {
		return this instanceof ws;
	}
	isAudioTrack() {
		return this instanceof Ts;
	}
	get id() {
		return this._backing.getId();
	}
	get number() {
		return this._backing.getNumber();
	}
	async getInternalCodecId() {
		return this._backing.getInternalCodecId();
	}
	get internalCodecId() {
		return R(this._backing.getInternalCodecId(), "internalCodecId", "getInternalCodecId");
	}
	async getLanguageCode() {
		return this._backing.getLanguageCode();
	}
	get languageCode() {
		return R(this._backing.getLanguageCode(), "languageCode", "getLanguageCode");
	}
	async getName() {
		return this._backing.getName();
	}
	get name() {
		return R(this._backing.getName(), "name", "getName");
	}
	async getTimeResolution() {
		return this._backing.getTimeResolution();
	}
	get timeResolution() {
		return R(this._backing.getTimeResolution(), "timeResolution", "getTimeResolution");
	}
	async isRelativeToUnixEpoch() {
		return this._backing.isRelativeToUnixEpoch();
	}
	async getUnixTimeForTimestamp(e) {
		return this._backing.getUnixTimeForTimestamp(e);
	}
	async hasUnixTimeMapping() {
		return await this._backing.getUnixTimeForTimestamp(await this.getFirstTimestamp()) !== null;
	}
	async getDisposition() {
		return this._backing.getDisposition();
	}
	get disposition() {
		return R(this._backing.getDisposition(), "disposition", "getDisposition");
	}
	async getBitrate() {
		return this._backing.getBitrate();
	}
	async getAverageBitrate() {
		return this._backing.getAverageBitrate();
	}
	async getFirstTimestamp() {
		return (await this._backing.getFirstPacket({ metadataOnly: !0 }))?.timestamp ?? 0;
	}
	async computeDuration(e) {
		let t = await this._backing.getPacket(Infinity, {
			metadataOnly: !0,
			...e
		});
		return we((t?.timestamp ?? 0) + (t?.duration ?? 0), await this.getTimeResolution());
	}
	async getDurationFromMetadata(e = {}) {
		return this._backing.getDurationFromMetadata(e);
	}
	async computePacketStats(e = Infinity, t) {
		let n = new ss(this), r = Infinity, i = -Infinity, a = 0, o = 0;
		for await (let s of n.packets(void 0, void 0, {
			metadataOnly: !0,
			...t
		})) {
			if (a >= e && s.timestamp >= i) break;
			r = Math.min(r, s.timestamp), i = Math.max(i, s.timestamp + s.duration), a++, o += s.byteLength;
		}
		return {
			packetCount: a,
			averagePacketRate: a ? Number((a / (i - r)).toPrecision(16)) : 0,
			averageBitrate: a ? Number((8 * o / (i - r)).toPrecision(16)) : 0
		};
	}
	async isLive() {
		return await this._backing.getLiveRefreshInterval() !== null;
	}
	async getLiveRefreshInterval() {
		return this._backing.getLiveRefreshInterval();
	}
	canBePairedWith(t) {
		if (!(t instanceof e)) throw TypeError("other must be an InputTrack.");
		return this.input !== t.input || this === t ? !1 : (this._backing.getPairingMask() & t._backing.getPairingMask()) !== 0n;
	}
	async getPairableTracks(e) {
		return this.input.getTracks(ks({ filter: (e) => e.canBePairedWith(this) }, e));
	}
	async getPairableVideoTracks(e) {
		return this.input.getVideoTracks(ks({ filter: (e) => e.canBePairedWith(this) }, e));
	}
	async getPairableAudioTracks(e) {
		return this.input.getAudioTracks(ks({ filter: (e) => e.canBePairedWith(this) }, e));
	}
	async getPrimaryPairableVideoTrack(e) {
		return this.input.getPrimaryVideoTrack(ks({ filter: (e) => e.canBePairedWith(this) }, e));
	}
	async getPrimaryPairableAudioTrack(e) {
		return this.input.getPrimaryAudioTrack(ks({ filter: (e) => e.canBePairedWith(this) }, e));
	}
	async hasPairableTrack(e) {
		e &&= Cs(e);
		let t = await this.input.getTracks();
		for (let n of t) if (this.canBePairedWith(n) && (!e || await e(n))) return !0;
		return !1;
	}
	hasPairableVideoTrack(e) {
		return e &&= Cs(e), this.hasPairableTrack(async (t) => t.isVideoTrack() && (!e || await e(t)));
	}
	hasPairableAudioTrack(e) {
		return e &&= Cs(e), this.hasPairableTrack(async (t) => t.isAudioTrack() && (!e || await e(t)));
	}
}, R = (e, t, n) => {
	if (e instanceof Promise) throw Error(`'${t}' is deprecated and not available synchronously for this track. Use the preferred '${n}()' instead.`);
	return e;
}, Cs = (e) => {
	if (e !== void 0 && typeof e != "function") throw TypeError("predicate, when provided, must be a function.");
	return e ? (t) => {
		let n = (e) => {
			if (typeof e != "boolean") throw TypeError("predicate must return or resolve to a boolean value.");
			return e;
		}, r = e(t);
		return r instanceof Promise ? r.then(n) : n(r);
	} : void 0;
}, ws = class extends Ss {
	constructor(e, t) {
		super(e, t), this._pixelAspectRatioCache = null, this._backing = t;
	}
	get type() {
		return "video";
	}
	async getCodec() {
		return this._backing.getCodec();
	}
	get codec() {
		return R(this._backing.getCodec(), "codec", "getCodec");
	}
	async hasOnlyKeyPackets() {
		return await this._backing.getHasOnlyKeyPackets?.() ?? await this._backing.getCodec() === "prores";
	}
	async getCodedWidth() {
		return this._backing.getCodedWidth();
	}
	get codedWidth() {
		return R(this._backing.getCodedWidth(), "codedWidth", "getCodedWidth");
	}
	async getCodedHeight() {
		return this._backing.getCodedHeight();
	}
	get codedHeight() {
		return R(this._backing.getCodedHeight(), "codedHeight", "getCodedHeight");
	}
	async getRotation() {
		return this._backing.getRotation();
	}
	get rotation() {
		return R(this._backing.getRotation(), "rotation", "getRotation");
	}
	async getSquarePixelWidth() {
		return this._backing.getSquarePixelWidth();
	}
	get squarePixelWidth() {
		return R(this._backing.getSquarePixelWidth(), "squarePixelWidth", "getSquarePixelWidth");
	}
	async getSquarePixelHeight() {
		return this._backing.getSquarePixelHeight();
	}
	get squarePixelHeight() {
		return R(this._backing.getSquarePixelHeight(), "squarePixelHeight", "getSquarePixelHeight");
	}
	async getPixelAspectRatio() {
		return this._pixelAspectRatioCache ??= Ze({
			num: await this.getSquarePixelWidth() * await this.getCodedHeight(),
			den: await this.getSquarePixelHeight() * await this.getCodedWidth()
		});
	}
	get pixelAspectRatio() {
		return this._pixelAspectRatioCache ??= Ze({
			num: R(this._backing.getSquarePixelWidth(), "pixelAspectRatio", "getPixelAspectRatio") * R(this._backing.getCodedHeight(), "pixelAspectRatio", "getPixelAspectRatio"),
			den: R(this._backing.getSquarePixelHeight(), "pixelAspectRatio", "getPixelAspectRatio") * R(this._backing.getCodedWidth(), "pixelAspectRatio", "getPixelAspectRatio")
		});
	}
	async getDisplayWidth() {
		return await this._backing.getMetadataDisplayWidth?.() ?? (await this.getRotation() % 180 == 0 ? this.getSquarePixelWidth() : this.getSquarePixelHeight());
	}
	get displayWidth() {
		let e = this._backing.getMetadataDisplayWidth?.();
		if (e !== void 0) {
			let t = R(e, "displayWidth", "getDisplayWidth");
			if (t !== null) return t;
		}
		return R(R(this._backing.getRotation(), "displayWidth", "getDisplayWidth") % 180 == 0 ? this._backing.getSquarePixelWidth() : this._backing.getSquarePixelHeight(), "displayWidth", "getDisplayWidth");
	}
	async getDisplayHeight() {
		return await this._backing.getMetadataDisplayHeight?.() ?? (await this.getRotation() % 180 == 0 ? this.getSquarePixelHeight() : this.getSquarePixelWidth());
	}
	get displayHeight() {
		let e = this._backing.getMetadataDisplayHeight?.();
		if (e !== void 0) {
			let t = R(e, "displayHeight", "getDisplayHeight");
			if (t !== null) return t;
		}
		return R(R(this._backing.getRotation(), "displayHeight", "getDisplayHeight") % 180 == 0 ? this._backing.getSquarePixelHeight() : this._backing.getSquarePixelWidth(), "displayHeight", "getDisplayHeight");
	}
	async getColorSpace() {
		return this._backing.getColorSpace();
	}
	async hasHighDynamicRange() {
		let e = await this._backing.getColorSpace();
		return e.primaries === "bt2020" || e.primaries === "smpte432" || e.transfer === "pq" || e.transfer === "hlg" || e.matrix === "bt2020-ncl";
	}
	async canBeTransparent() {
		return this._backing.canBeTransparent();
	}
	async getDecoderConfig() {
		return this._backing.getDecoderConfig();
	}
	async getCodecParameterString() {
		return await this._backing.getMetadataCodecParameterString?.() ?? (await this._backing.getDecoderConfig())?.codec ?? null;
	}
	async canDecode() {
		try {
			let e = await this._backing.getDecoderConfig();
			if (!e) return !1;
			let t = await this._backing.getCodec();
			return c(t !== null), Xo.some((n) => n.supports(t, e)) ? !0 : typeof VideoDecoder > "u" ? !1 : (await VideoDecoder.isConfigSupported(e)).supported === !0;
		} catch (e) {
			return D._error("Error during decodability check:", e), !1;
		}
	}
	async determinePacketType(e) {
		if (!(e instanceof N)) throw TypeError("packet must be an EncodedPacket.");
		if (e.isMetadataOnly) throw TypeError("packet must not be metadata-only to determine its type.");
		let t = await this.getCodec();
		if (t === null) return null;
		let n = await this.getDecoderConfig();
		return c(n), zn(t, n, e.data);
	}
}, Ts = class extends Ss {
	constructor(e, t) {
		super(e, t), this._backing = t;
	}
	get type() {
		return "audio";
	}
	async getCodec() {
		return this._backing.getCodec();
	}
	get codec() {
		return R(this._backing.getCodec(), "codec", "getCodec");
	}
	async hasOnlyKeyPackets() {
		return await this._backing.getHasOnlyKeyPackets?.() ?? !0;
	}
	async getNumberOfChannels() {
		return this._backing.getNumberOfChannels();
	}
	get numberOfChannels() {
		return R(this._backing.getNumberOfChannels(), "numberOfChannels", "getNumberOfChannels");
	}
	async getSampleRate() {
		return this._backing.getSampleRate();
	}
	get sampleRate() {
		return R(this._backing.getSampleRate(), "sampleRate", "getSampleRate");
	}
	async getDecoderConfig() {
		return this._backing.getDecoderConfig();
	}
	async getCodecParameterString() {
		return await this._backing.getMetadataCodecParameterString?.() ?? (await this._backing.getDecoderConfig())?.codec ?? null;
	}
	async canDecode() {
		try {
			let e = await this._backing.getDecoderConfig();
			if (!e) return !1;
			let t = await this._backing.getCodec();
			return c(t !== null), Zo.some((n) => n.supports(t, e)) || e.codec.startsWith("pcm-") ? !0 : typeof AudioDecoder > "u" ? !1 : (await AudioDecoder.isConfigSupported(e)).supported === !0;
		} catch (e) {
			return D._error("Error during decodability check:", e), !1;
		}
	}
	async determinePacketType(e) {
		if (!(e instanceof N)) throw TypeError("packet must be an EncodedPacket.");
		return await this.getCodec() === null ? null : "key";
	}
}, Es = (e) => -(e ?? -Infinity), Ds = (e) => -e, Os = (e) => {
	if (typeof e != "object" || !e) throw TypeError("query must be an object.");
	if (e.filter !== void 0 && typeof e.filter != "function") throw TypeError("query.filter, when provided, must be a function.");
	if (e.sortBy !== void 0 && typeof e.sortBy != "function") throw TypeError("query.sortBy, when provided, must be a function.");
	return {
		filter: e.filter ? (t) => {
			let n = (e) => {
				if (typeof e != "boolean") throw TypeError("query.filter must return or resolve to a boolean.");
				return e;
			}, r = e.filter(t);
			return r instanceof Promise ? r.then(n) : n(r);
		} : void 0,
		sortBy: e.sortBy ? (t) => {
			let n = (e) => {
				if (typeof e != "number" && (!Array.isArray(e) || !e.every((e) => typeof e == "number"))) throw TypeError("query.sortBy must return or resolve to a number or an array of numbers.");
				return e;
			}, r = e.sortBy(t);
			return r instanceof Promise ? r.then(n) : n(r);
		} : void 0
	};
}, ks = (e, t) => ({
	filter: e?.filter || t?.filter ? (n) => {
		let r = e?.filter?.(n) ?? !0, i = (e) => e === !1 ? !1 : t?.filter?.(n) ?? !0;
		return r instanceof Promise ? r.then(i) : i(r);
	} : void 0,
	sortBy: e?.sortBy || t?.sortBy ? (n) => {
		let r = e?.sortBy?.(n) ?? [], i = t?.sortBy?.(n) ?? [], a = (e, t) => [...Array.isArray(e) ? e : [e], ...Array.isArray(t) ? t : [t]];
		return r instanceof Promise || i instanceof Promise ? Promise.all([r, i]).then(([e, t]) => a(e, t)) : a(r, i);
	} : void 0
}), As = async (e, t) => {
	let n = e;
	if (t?.filter) {
		let r = e.map((e) => t.filter(e));
		if (r.some((e) => e instanceof Promise)) {
			let t = await Promise.all(r);
			n = e.filter((e, n) => t[n]);
		} else n = e.filter((e, t) => r[t]);
	}
	if (!t?.sortBy) return n;
	let r = n.map((e) => t.sortBy(e)), i = r.some((e) => e instanceof Promise) ? await Promise.all(r) : r;
	return n.map((e, t) => ({
		track: e,
		sortValue: i[t]
	})).sort((e, t) => {
		let n = Array.isArray(e.sortValue) ? e.sortValue : [e.sortValue], r = Array.isArray(t.sortValue) ? t.sortValue : [t.sortValue], i = Math.max(n.length, r.length);
		for (let e = 0; e < i; e++) {
			let t = n[e] ?? 0, i = r[e] ?? 0;
			if (t !== i) return t - i;
		}
		return 0;
	}).map((e) => e.track);
};
//#endregion
//#region node_modules/mediabunny/dist/modules/src/input.js
Ke();
var js = class e extends tt {
	get disposed() {
		return this._disposed;
	}
	constructor(t) {
		if (super(), this._demuxerPromise = null, this._format = null, this._trackBackingsCache = null, this._backingToTrack = /* @__PURE__ */ new Map(), this._disposed = !1, this._nextSourceCacheAge = 0, this._sourceRefs = [], this._sourceCache = [], this._sourceCachePromises = [], this._onFormatDetermined = null, !t || typeof t != "object") throw TypeError("options must be an object.");
		if (!Array.isArray(t.formats) || t.formats.some((e) => !(e instanceof Ra))) throw TypeError("options.formats must be an array of InputFormat.");
		if (!(t.source instanceof ma || t.source instanceof ha)) throw TypeError("options.source must be a Source or SourceRef.");
		if (t.source instanceof ma && t.source._disposed) throw TypeError("options.source must not be a disposed Source.");
		if (t.initInput !== void 0 && !(t.initInput instanceof e)) throw TypeError("options.initInput, when provided, must be an Input.");
		t.formatOptions !== void 0 && Qa(t.formatOptions, "formatOptions"), this._formats = t.formats, this._initInput = t.initInput ?? null, this._formatOptions = t.formatOptions ?? {}, t.source instanceof ma ? this._rootRef = t.source.ref() : this._rootRef = t.source, this._sourceRefs.push(this._rootRef);
	}
	get _rootSource() {
		return this._rootRef.source;
	}
	async _getSourceUncached(e) {
		c(this._rootSource instanceof ga);
		let t = await this._rootSource._resolveRequest(e);
		return this._emit("source", {
			source: t.source,
			request: e,
			isRoot: e.isRoot
		}), t;
	}
	_getSourceCached(e, t = 1) {
		let n = this._sourceCache.find((n) => n.cacheGroup === t && _a(n.request, e));
		if (n) return n.age++, Promise.resolve(n.sourceRef.source.ref());
		let r = this._sourceCachePromises.find((n) => n.cacheGroup === t && _a(n.request, e));
		if (r) return r.promise.then((e) => e.sourceRef.source.ref());
		let i = (async () => {
			let n = await this._getSourceUncached(e);
			if (Ye(this._sourceCache, (e) => e.cacheGroup === t && e.sourceRef.source._refCount === 1) >= 4) {
				let e = Xe(this._sourceCache, (e) => e.cacheGroup === t && e.sourceRef.source._refCount === 1 ? e.age : Infinity);
				c(e !== -1);
				let n = this._sourceCache[e];
				this._sourceCache.splice(e, 1), n.sourceRef.free(), ue(this._sourceRefs, n.sourceRef);
			}
			this._sourceRefs.push(n);
			let r = this._sourceCachePromises.findIndex((t) => t.request === e);
			return c(r !== -1), this._sourceCachePromises.splice(r, 1), {
				request: e,
				sourceRef: n,
				age: this._nextSourceCacheAge++,
				cacheGroup: t
			};
		})();
		return this._sourceCachePromises.push({
			request: e,
			cacheGroup: t,
			promise: i
		}), i.then((e) => {
			let t = e.sourceRef.source.ref();
			return this._sourceCache.push(e), t;
		});
	}
	_getDemuxer() {
		return this._demuxerPromise ??= (async () => {
			this._reader = new Ns(this._rootSource), this._emit("source", {
				source: this._rootSource,
				request: null,
				isRoot: !0
			});
			for (let e of this._formats) if (await e._canReadInput(this)) return this._format = e, this._onFormatDetermined?.(e), e._createDemuxer(this);
			throw new Ms();
		})();
	}
	get source() {
		return this._rootSource;
	}
	async getFormat() {
		return await this._getDemuxer(), c(this._format), this._format;
	}
	async canRead() {
		try {
			return await this._getDemuxer(), !0;
		} catch (e) {
			if (e instanceof Ms) return !1;
			throw e;
		}
	}
	async getFirstTimestamp(e) {
		e ??= await this.getTracks();
		let t = e.filter((e) => e !== null);
		if (t.length === 0) return 0;
		let n = await Promise.all(t.map((e) => e.getFirstTimestamp()));
		return Math.min(...n);
	}
	async computeDuration(e, t) {
		e ??= await this.getTracks();
		let n = e.filter((e) => e !== null);
		if (n.length === 0) return 0;
		let r = await Promise.all(n.map((e) => e.computeDuration(t)));
		return Math.max(...r);
	}
	async getDurationFromMetadata(e, t) {
		e ??= await this.getTracks();
		let n = e.filter((e) => e !== null), r = (await Promise.all(n.map((e) => e.getDurationFromMetadata(t)))).filter((e) => e !== null);
		return r.length === 0 ? null : Math.max(...r);
	}
	async getTracks(e) {
		return e &&= Os(e), As((await this._getTrackBackings()).map((e) => this._wrapBackingAsTrack(e)), e);
	}
	async getVideoTracks(e) {
		return e &&= Os(e), As((await this.getTracks()).filter((e) => e.isVideoTrack()), e);
	}
	async getAudioTracks(e) {
		return e &&= Os(e), As((await this.getTracks()).filter((e) => e.isAudioTrack()), e);
	}
	async getPrimaryVideoTrack(e) {
		e &&= Os(e);
		let t = ks(e, { sortBy: async (e) => [
			Ds((await e.getDisposition()).default),
			Ds(await e.hasPairableAudioTrack()),
			Ds(!await e.hasOnlyKeyPackets()),
			Es(await e.getBitrate())
		] });
		return (await this.getVideoTracks(t))[0] ?? null;
	}
	async getPrimaryAudioTrack(e) {
		e &&= Os(e);
		let t = await this.getPrimaryVideoTrack(), n = ks(e, { sortBy: async (e) => [
			Ds(!t || e.canBePairedWith(t)),
			Ds((await e.getDisposition()).default),
			Es(await e.getBitrate())
		] });
		return (await this.getAudioTracks(n))[0] ?? null;
	}
	async _getTrackBackings() {
		let e = await this._getDemuxer();
		return this._trackBackingsCache ??= await e.getTrackBackings();
	}
	_wrapBackingAsTrack(e) {
		let t = this._backingToTrack.get(e);
		if (t) return t;
		let n = e.getType() === "video" ? new ws(this, e) : new Ts(this, e);
		return this._backingToTrack.set(e, n), n;
	}
	async getMimeType() {
		return (await this._getDemuxer()).getMimeType();
	}
	async getMetadataTags() {
		return (await this._getDemuxer()).getMetadataTags();
	}
	dispose() {
		if (!this._disposed) {
			this._disposed = !0;
			for (let e of this._sourceRefs) e.free();
			this._sourceRefs.length = 0, this._demuxerPromise && this._demuxerPromise.then((e) => e.dispose()).catch(() => {});
		}
	}
	[Symbol.dispose]() {
		this.dispose();
	}
}, Ms = class extends Error {
	constructor(e = "Input has an unsupported or unrecognizable format.") {
		super(e), this.name = "UnsupportedInputFormatError";
	}
}, z = class extends Error {
	constructor(e = "Input has been disposed.") {
		super(e), this.name = "InputDisposedError";
	}
}, Ns = class {
	constructor(e) {
		this.source = e;
	}
	get fileSize() {
		let e = this.source._getFileSize();
		if (e === void 0) throw Error("Reading file size too early; read required first.");
		return e;
	}
	get fileSizeNonStrict() {
		return this.source._getFileSize() ?? null;
	}
	requestSlice(e, t) {
		if (this.source._disposed) throw new z();
		if (e < 0 || this.fileSizeNonStrict !== null && e + t > this.fileSizeNonStrict) return null;
		if (t === 0) {
			let t = new Uint8Array();
			return new Ps(t, h(t), 0, e, e);
		}
		let n = e + t, r = this.source._read(e, n, 0, pa);
		return r instanceof Promise ? r.then((t) => t ? new Ps(t.bytes, t.view, t.offset, e, n) : null) : r ? new Ps(r.bytes, r.view, r.offset, e, n) : null;
	}
	requestSliceRange(e, t, n) {
		if (this.source._disposed) throw new z();
		if (e < 0) return null;
		if (this.fileSizeNonStrict !== null) return this.requestSlice(e, E(this.fileSizeNonStrict - e, t, n));
		{
			let r = this.requestSlice(e, n), i = (r) => r || (c(this.fileSizeNonStrict !== null), this.requestSlice(e, E(this.fileSizeNonStrict - e, t, n)));
			return r instanceof Promise ? r.then(i) : i(r);
		}
	}
	requestEntireFile() {
		return this.fileSizeNonStrict === null ? (async () => {
			let e = [], t = 0;
			for (;;) {
				if (e.length === 1 && this.fileSizeNonStrict !== null) return this.requestSlice(0, this.fileSizeNonStrict);
				let n = this.requestSliceRange(t, 0, 1024);
				if (n instanceof Promise && (n = await n), !n || n.length === 0) break;
				let r = V(n, n.length);
				e.push(r), t += n.length;
			}
			let n = new Uint8Array(t), r = 0;
			for (let t of e) n.set(t, r), r += t.length;
			return new Ps(n, h(n), 0, 0, t);
		})() : this.requestSlice(0, this.fileSizeNonStrict);
	}
}, Ps = class e {
	constructor(e, t, n, r, i) {
		this.bytes = e, this.view = t, this.offset = n, this.start = r, this.end = i, this.bufferPos = r - n;
	}
	static tempFromBytes(t) {
		return new e(t, h(t), 0, 0, t.length);
	}
	get length() {
		return this.end - this.start;
	}
	get filePos() {
		return this.offset + this.bufferPos;
	}
	set filePos(e) {
		this.bufferPos = e - this.offset;
	}
	get remainingLength() {
		return Math.max(this.end - this.filePos, 0);
	}
	skip(e) {
		this.bufferPos += e;
	}
	slice(t, n = this.end - t) {
		if (t < this.start || t + n > this.end) throw RangeError("Slicing outside of original slice.");
		return new e(this.bytes, this.view, this.offset, t, t + n);
	}
}, B = (e, t) => {
	if (e.filePos < e.start || e.filePos + t > e.end) throw RangeError(`Tried reading [${e.filePos}, ${e.filePos + t}), but slice is [${e.start}, ${e.end}). This is likely an internal error, please report it alongside the file that caused it.`);
}, V = (e, t) => {
	B(e, t);
	let n = e.bytes.subarray(e.bufferPos, e.bufferPos + t);
	return e.bufferPos += t, n;
}, H = (e) => (B(e, 1), e.view.getUint8(e.bufferPos++)), Fs = (e, t) => {
	B(e, 2);
	let n = e.view.getUint16(e.bufferPos, t);
	return e.bufferPos += 2, n;
}, U = (e) => {
	B(e, 2);
	let t = e.view.getUint16(e.bufferPos, !1);
	return e.bufferPos += 2, t;
}, Is = (e) => {
	B(e, 3);
	let t = ge(e.view, e.bufferPos, !1);
	return e.bufferPos += 3, t;
}, Ls = (e) => {
	B(e, 2);
	let t = e.view.getInt16(e.bufferPos, !1);
	return e.bufferPos += 2, t;
}, Rs = (e, t) => {
	B(e, 4);
	let n = e.view.getUint32(e.bufferPos, t);
	return e.bufferPos += 4, n;
}, W = (e) => {
	B(e, 4);
	let t = e.view.getUint32(e.bufferPos, !1);
	return e.bufferPos += 4, t;
}, zs = (e) => {
	B(e, 4);
	let t = e.view.getUint32(e.bufferPos, !0);
	return e.bufferPos += 4, t;
}, Bs = (e) => {
	B(e, 4);
	let t = e.view.getInt32(e.bufferPos, !1);
	return e.bufferPos += 4, t;
}, Vs = (e) => {
	B(e, 4);
	let t = e.view.getInt32(e.bufferPos, !0);
	return e.bufferPos += 4, t;
}, Hs = (e, t) => {
	let n, r;
	return t ? (n = Rs(e, !0), r = Rs(e, !0)) : (r = Rs(e, !1), n = Rs(e, !1)), r * 4294967296 + n;
}, Us = (e) => {
	let t = W(e), n = W(e);
	return t * 4294967296 + n;
}, Ws = (e) => {
	let t = Bs(e), n = W(e);
	return t * 4294967296 + n;
}, Gs = (e) => {
	let t = zs(e);
	return Vs(e) * 4294967296 + t;
}, Ks = (e) => {
	B(e, 4);
	let t = e.view.getFloat32(e.bufferPos, !1);
	return e.bufferPos += 4, t;
}, qs = (e) => {
	B(e, 8);
	let t = e.view.getFloat64(e.bufferPos, !1);
	return e.bufferPos += 8, t;
}, G = (e, t) => {
	B(e, t);
	let n = "";
	for (let r = 0; r < t; r++) n += String.fromCharCode(e.bytes[e.bufferPos++]);
	return n;
}, Js = (e, t, n) => g.decode(V(e, t)).split("\n").map((e) => e.trim()).filter((e) => e.length > 0 && !n?.ignore?.(e)), Ys;
(function(e) {
	e[e.Unsynchronisation = 128] = "Unsynchronisation", e[e.ExtendedHeader = 64] = "ExtendedHeader", e[e.ExperimentalIndicator = 32] = "ExperimentalIndicator", e[e.Footer = 16] = "Footer";
})(Ys ||= {});
var Xs;
(function(e) {
	e[e.ISO_8859_1 = 0] = "ISO_8859_1", e[e.UTF_16_WITH_BOM = 1] = "UTF_16_WITH_BOM", e[e.UTF_16_BE_NO_BOM = 2] = "UTF_16_BE_NO_BOM", e[e.UTF_8 = 3] = "UTF_8";
})(Xs ||= {});
var Zs = /* @__PURE__ */ "Blues.Classic rock.Country.Dance.Disco.Funk.Grunge.Hip-hop.Jazz.Metal.New age.Oldies.Other.Pop.Rhythm and blues.Rap.Reggae.Rock.Techno.Industrial.Alternative.Ska.Death metal.Pranks.Soundtrack.Euro-techno.Ambient.Trip-hop.Vocal.Jazz & funk.Fusion.Trance.Classical.Instrumental.Acid.House.Game.Sound clip.Gospel.Noise.Alternative rock.Bass.Soul.Punk.Space.Meditative.Instrumental pop.Instrumental rock.Ethnic.Gothic.Darkwave.Techno-industrial.Electronic.Pop-folk.Eurodance.Dream.Southern rock.Comedy.Cult.Gangsta.Top 40.Christian rap.Pop/funk.Jungle music.Native US.Cabaret.New wave.Psychedelic.Rave.Showtunes.Trailer.Lo-fi.Tribal.Acid punk.Acid jazz.Polka.Retro.Musical.Rock 'n' roll.Hard rock.Folk.Folk rock.National folk.Swing.Fast fusion.Bebop.Latin.Revival.Celtic.Bluegrass.Avantgarde.Gothic rock.Progressive rock.Psychedelic rock.Symphonic rock.Slow rock.Big band.Chorus.Easy listening.Acoustic.Humour.Speech.Chanson.Opera.Chamber music.Sonata.Symphony.Booty bass.Primus.Porn groove.Satire.Slow jam.Club.Tango.Samba.Folklore.Ballad.Power ballad.Rhythmic Soul.Freestyle.Duet.Punk rock.Drum solo.A cappella.Euro-house.Dance hall.Goa music.Drum & bass.Club-house.Hardcore techno.Terror.Indie.Britpop.Negerpunk.Polsk punk.Beat.Christian gangsta rap.Heavy metal.Black metal.Crossover.Contemporary Christian.Christian rock.Merengue.Salsa.Thrash metal.Anime.Jpop.Synthpop.Christmas.Art rock.Baroque.Bhangra.Big beat.Breakbeat.Chillout.Downtempo.Dub.EBM.Eclectic.Electro.Electroclash.Emo.Experimental.Garage.Global.IDM.Illbient.Industro-Goth.Jam Band.Krautrock.Leftfield.Lounge.Math rock.New romantic.Nu-breakz.Post-punk.Post-rock.Psytrance.Shoegaze.Space rock.Trop rock.World music.Neoclassical.Audiobook.Audio theatre.Neue Deutsche Welle.Podcast.Indie rock.G-Funk.Dubstep.Garage rock.Psybient".split("."), Qs = (e, t) => {
	let n = e.filePos;
	t.raw ??= {}, t.raw.TAG ??= V(e, 125), e.filePos = n;
	let r = $s(e, 30);
	r && (t.title ??= r);
	let i = $s(e, 30);
	i && (t.artist ??= i);
	let a = $s(e, 30);
	a && (t.album ??= a);
	let o = $s(e, 4), s = Number.parseInt(o, 10);
	Number.isInteger(s) && s > 0 && (t.date ??= new Date(String(s)));
	let c = V(e, 30), l;
	if (c[28] === 0 && c[29] !== 0) {
		let n = c[29];
		n > 0 && (t.trackNumber ??= n), e.skip(-30), l = $s(e, 28), e.skip(2);
	} else e.skip(-30), l = $s(e, 30);
	l && (t.comment ??= l);
	let u = H(e);
	u < Zs.length && (t.genre ??= Zs[u]);
}, $s = (e, t) => {
	let n = V(e, t), r = Ve(n.indexOf(0), n.length), i = n.subarray(0, r), a = "";
	for (let e = 0; e < i.length; e++) a += String.fromCharCode(i[e]);
	return a.trimEnd();
}, ec = (e) => {
	let t = e.filePos, n = G(e, 3), r = H(e), i = H(e), a = H(e), o = W(e);
	if (n !== "ID3" || r === 255 || i === 255 || o & 2155905152) return e.filePos = t, null;
	let s = Zt(o);
	return a & Ys.Footer && (s += 10), {
		majorVersion: r,
		revision: i,
		flags: a,
		size: s
	};
}, tc = (e, t, n) => {
	if (![
		2,
		3,
		4
	].includes(t.majorVersion)) {
		D._warn(`Unsupported ID3v2 major version: ${t.majorVersion}`);
		return;
	}
	let r = new nc(t, V(e, t.flags & Ys.Footer ? t.size - 10 : t.size));
	if (t.flags & Ys.Unsynchronisation && t.majorVersion === 3 && r.ununsynchronizeAll(), t.flags & Ys.ExtendedHeader) {
		let e = r.readU32();
		t.majorVersion === 3 ? r.pos += e : r.pos += e - 4;
	}
	for (; r.pos <= r.bytes.length - r.frameHeaderSize();) {
		let e = r.readId3V2Frame();
		if (!e) break;
		let i = r.pos, a = r.pos + e.size, o = !1, s = !1, c = !1;
		if (t.majorVersion === 3 ? (o = !!(e.flags & 64), s = !!(e.flags & 128)) : t.majorVersion === 4 && (o = !!(e.flags & 4), s = !!(e.flags & 8), c = !!(e.flags & 2) || !!(t.flags & Ys.Unsynchronisation)), o) {
			D._warn(`Skipping encrypted ID3v2 frame ${e.id}`), r.pos = a;
			continue;
		}
		if (s) {
			D._warn(`Skipping compressed ID3v2 frame ${e.id}`), r.pos = a;
			continue;
		}
		if (c && r.ununsynchronizeRegion(r.pos, a), n.raw ??= {}, e.id === "TXXX") {
			let e = n.raw.TXXX ??= {}, t = r.readId3V2TextEncoding(), i = r.readId3V2Text(t, a), o = r.readId3V2Text(t, a);
			e[i] ??= o;
		} else e.id[0] === "T" ? n.raw[e.id] ??= r.readId3V2EncodingAndText(a) : n.raw[e.id] ??= r.readBytes(e.size);
		switch (r.pos = i, e.id) {
			case "TIT2":
			case "TT2":
				n.title ??= r.readId3V2EncodingAndText(a);
				break;
			case "TIT3":
			case "TT3":
				n.description ??= r.readId3V2EncodingAndText(a);
				break;
			case "TPE1":
			case "TP1":
				n.artist ??= r.readId3V2EncodingAndText(a);
				break;
			case "TALB":
			case "TAL":
				n.album ??= r.readId3V2EncodingAndText(a);
				break;
			case "TPE2":
			case "TP2":
				n.albumArtist ??= r.readId3V2EncodingAndText(a);
				break;
			case "TRCK":
			case "TRK":
				{
					let e = r.readId3V2EncodingAndText(a).split("/"), t = Number.parseInt(e[0], 10), i = e[1] && Number.parseInt(e[1], 10);
					Number.isInteger(t) && t > 0 && (n.trackNumber ??= t), i && Number.isInteger(i) && i > 0 && (n.tracksTotal ??= i);
				}
				break;
			case "TPOS":
			case "TPA":
				{
					let e = r.readId3V2EncodingAndText(a).split("/"), t = Number.parseInt(e[0], 10), i = e[1] && Number.parseInt(e[1], 10);
					Number.isInteger(t) && t > 0 && (n.discNumber ??= t), i && Number.isInteger(i) && i > 0 && (n.discsTotal ??= i);
				}
				break;
			case "TCON":
			case "TCO":
				{
					let e = r.readId3V2EncodingAndText(a), t = /^\((\d+)\)/.exec(e);
					if (t) {
						let e = Number.parseInt(t[1]);
						if (Zs[e] !== void 0) {
							n.genre ??= Zs[e];
							break;
						}
					}
					if (t = /^\d+$/.exec(e), t) {
						let e = Number.parseInt(t[0]);
						if (Zs[e] !== void 0) {
							n.genre ??= Zs[e];
							break;
						}
					}
					n.genre ??= e;
				}
				break;
			case "TDRC":
			case "TDAT":
				{
					let e = r.readId3V2EncodingAndText(a), t = new Date(e);
					Number.isNaN(t.getTime()) || (n.date ??= t);
				}
				break;
			case "TYER":
			case "TYE":
				{
					let e = r.readId3V2EncodingAndText(a), t = Number.parseInt(e, 10);
					Number.isInteger(t) && (n.date ??= new Date(String(t)));
				}
				break;
			case "USLT":
			case "ULT":
				{
					let e = r.readU8();
					r.pos += 3, r.readId3V2Text(e, a), n.lyrics ??= r.readId3V2Text(e, a);
				}
				break;
			case "COMM":
			case "COM":
				{
					let e = r.readU8();
					r.pos += 3, r.readId3V2Text(e, a), n.comment ??= r.readId3V2Text(e, a);
				}
				break;
			case "APIC":
			case "PIC":
				{
					let e = r.readId3V2TextEncoding(), i;
					if (t.majorVersion === 2) {
						let e = r.readAscii(3);
						i = e === "PNG" ? "image/png" : e === "JPG" ? "image/jpeg" : "image/*";
					} else i = r.readId3V2Text(e, a);
					let o = r.readU8(), s = r.readId3V2Text(e, a).trimEnd(), c = a - r.pos;
					if (c >= 0) {
						let e = r.readBytes(c);
						n.images ||= [], n.images.push({
							data: e,
							mimeType: i,
							kind: o === 3 ? "coverFront" : o === 4 ? "coverBack" : "unknown",
							description: s
						});
					}
				}
				break;
			default:
				r.pos += e.size;
				break;
		}
		r.pos = a;
	}
}, nc = class {
	constructor(e, t) {
		this.header = e, this.bytes = t, this.pos = 0, this.view = new DataView(t.buffer, t.byteOffset, t.byteLength);
	}
	frameHeaderSize() {
		return this.header.majorVersion === 2 ? 6 : 10;
	}
	ununsynchronizeAll() {
		let e = [];
		for (let t = 0; t < this.bytes.length; t++) {
			let n = this.bytes[t];
			e.push(n), n === 255 && t !== this.bytes.length - 1 && this.bytes[t] === 0 && t++;
		}
		this.bytes = new Uint8Array(e), this.view = new DataView(this.bytes.buffer);
	}
	ununsynchronizeRegion(e, t) {
		let n = [];
		for (let r = e; r < t; r++) {
			let e = this.bytes[r];
			n.push(e), e === 255 && r !== t - 1 && this.bytes[r + 1] === 0 && r++;
		}
		let r = this.bytes.subarray(0, e), i = this.bytes.subarray(t);
		this.bytes = new Uint8Array(r.length + n.length + i.length), this.bytes.set(r, 0), this.bytes.set(n, r.length), this.bytes.set(i, r.length + n.length), this.view = new DataView(this.bytes.buffer);
	}
	readBytes(e) {
		let t = this.bytes.subarray(this.pos, this.pos + e);
		return this.pos += e, t;
	}
	readU8() {
		let e = this.view.getUint8(this.pos);
		return this.pos += 1, e;
	}
	readU16() {
		let e = this.view.getUint16(this.pos, !1);
		return this.pos += 2, e;
	}
	readU24() {
		let e = this.view.getUint16(this.pos, !1), t = this.view.getUint8(this.pos + 2);
		return this.pos += 3, e * 256 + t;
	}
	readU32() {
		let e = this.view.getUint32(this.pos, !1);
		return this.pos += 4, e;
	}
	readAscii(e) {
		let t = "";
		for (let n = 0; n < e; n++) t += String.fromCharCode(this.view.getUint8(this.pos + n));
		return this.pos += e, t;
	}
	readId3V2Frame() {
		if (this.header.majorVersion === 2) {
			let e = this.readAscii(3);
			return e === "\0\0\0" ? null : {
				id: e,
				size: this.readU24(),
				flags: 0
			};
		} else {
			let e = this.readAscii(4);
			if (e === "\0\0\0\0") return null;
			let t = this.readU32(), n = this.header.majorVersion === 4 ? Zt(t) : t, r = this.readU16(), i = this.pos, a = (e) => {
				let t = this.pos + e;
				if (t > this.bytes.length) return !1;
				if (t <= this.bytes.length - this.frameHeaderSize()) {
					this.pos += e;
					let t = this.readAscii(4);
					if (t !== "\0\0\0\0" && !/[0-9A-Z]{4}/.test(t)) return !1;
				}
				return !0;
			};
			if (!a(n)) {
				let e = this.header.majorVersion === 4 ? t : Zt(t);
				a(e) && (n = e);
			}
			return this.pos = i, {
				id: e,
				size: n,
				flags: r
			};
		}
	}
	readId3V2TextEncoding() {
		let e = this.readU8();
		if (e > 3) throw Error(`Unsupported text encoding: ${e}`);
		return e;
	}
	readId3V2Text(e, t) {
		let n = this.pos, r = this.readBytes(t - this.pos);
		switch (e) {
			case Xs.ISO_8859_1: {
				let e = "";
				for (let t = 0; t < r.length; t++) {
					let i = r[t];
					if (i === 0) {
						this.pos = n + t + 1;
						break;
					}
					e += String.fromCharCode(i);
				}
				return e;
			}
			case Xs.UTF_16_WITH_BOM: if (r[0] === 255 && r[1] === 254) {
				let e = new TextDecoder("utf-16le"), t = Ve(r.findIndex((e, t) => e === 0 && r[t + 1] === 0 && t % 2 == 0), r.length);
				return this.pos = n + Math.min(t + 2, r.length), e.decode(r.subarray(2, t));
			} else if (r[0] === 254 && r[1] === 255) {
				let e = new TextDecoder("utf-16be"), t = Ve(r.findIndex((e, t) => e === 0 && r[t + 1] === 0 && t % 2 == 0), r.length);
				return this.pos = n + Math.min(t + 2, r.length), e.decode(r.subarray(2, t));
			} else {
				let e = Ve(r.findIndex((e) => e === 0), r.length);
				return this.pos = n + Math.min(e + 1, r.length), g.decode(r.subarray(0, e));
			}
			case Xs.UTF_16_BE_NO_BOM: {
				let e = new TextDecoder("utf-16be"), t = Ve(r.findIndex((e, t) => e === 0 && r[t + 1] === 0 && t % 2 == 0), r.length);
				return this.pos = n + Math.min(t + 2, r.length), e.decode(r.subarray(0, t));
			}
			case Xs.UTF_8: {
				let e = Ve(r.findIndex((e) => e === 0), r.length);
				return this.pos = n + Math.min(e + 1, r.length), g.decode(r.subarray(0, e));
			}
		}
	}
	readId3V2EncodingAndText(e) {
		if (this.pos >= e) return "";
		let t = this.readId3V2TextEncoding();
		return this.readId3V2Text(t, e);
	}
}, rc = class {
	constructor(e) {
		this.mutex = new re(), this.trackTimestampInfo = /* @__PURE__ */ new WeakMap(), this.output = e;
	}
	onTrackClose(e) {}
	validateTimestamp(e, t, n) {
		if (t < 0) throw Error(`Timestamps must be non-negative (got ${t}s).`);
		let r = this.trackTimestampInfo.get(e);
		if (r) {
			if (n && (r.maxTimestampBeforeLastKeyPacket = r.maxTimestamp), r.maxTimestampBeforeLastKeyPacket !== null && t < r.maxTimestampBeforeLastKeyPacket) throw Error(`Timestamps cannot be smaller than the largest timestamp of the previous GOP (a GOP begins with a key packet and ends right before the next key packet). Got ${t}s, but largest timestamp is ${r.maxTimestampBeforeLastKeyPacket}s.`);
			r.maxTimestamp = Math.max(r.maxTimestamp, t);
		} else {
			if (!n) throw Error("First packet must be a key packet.");
			r = {
				maxTimestamp: t,
				maxTimestampBeforeLastKeyPacket: null
			}, this.trackTimestampInfo.set(e, r);
		}
	}
}, ic = /<(?:(\d{2}):)?(\d{2}):(\d{2}).(\d{3})>/g, ac = (e) => {
	let t = Math.floor(e / (3600 * 1e3)), n = Math.floor(e % (3600 * 1e3) / (60 * 1e3)), r = Math.floor(e % (60 * 1e3) / 1e3), i = e % 1e3;
	return t.toString().padStart(2, "0") + ":" + n.toString().padStart(2, "0") + ":" + r.toString().padStart(2, "0") + "." + i.toString().padStart(3, "0");
}, oc = class {
	constructor(e) {
		this.writer = e, this.helper = new Uint8Array(8), this.helperView = new DataView(this.helper.buffer), this.offsets = /* @__PURE__ */ new WeakMap();
	}
	writeU32(e) {
		this.helperView.setUint32(0, e, !1), this.writer.write(this.helper.subarray(0, 4));
	}
	writeU64(e) {
		this.helperView.setUint32(0, Math.floor(e / 2 ** 32), !1), this.helperView.setUint32(4, e, !1), this.writer.write(this.helper.subarray(0, 8));
	}
	writeAscii(e) {
		for (let t = 0; t < e.length; t++) this.helperView.setUint8(t % 8, e.charCodeAt(t)), t % 8 == 7 && this.writer.write(this.helper);
		e.length % 8 != 0 && this.writer.write(this.helper.subarray(0, e.length % 8));
	}
	writeBox(e) {
		if (this.offsets.set(e, this.writer.getPos()), e.contents && !e.children) this.writeBoxHeader(e, e.size ?? e.contents.byteLength + 8), this.writer.write(e.contents);
		else {
			let t = this.writer.getPos();
			if (this.writeBoxHeader(e, 0), e.contents && this.writer.write(e.contents), e.children) for (let t of e.children) t && this.writeBox(t);
			let n = this.writer.getPos(), r = e.size ?? n - t;
			this.writer.seek(t), this.writeBoxHeader(e, r), this.writer.seek(n);
		}
	}
	writeBoxHeader(e, t) {
		this.writeU32(e.largeSize ? 1 : t), this.writeAscii(e.type), e.largeSize && this.writeU64(t);
	}
	measureBoxHeader(e) {
		return 8 + (e.largeSize ? 8 : 0);
	}
	patchBox(e) {
		let t = this.offsets.get(e);
		c(t !== void 0);
		let n = this.writer.getPos();
		this.writer.seek(t), this.writeBox(e), this.writer.seek(n);
	}
	measureBox(e) {
		if (e.contents && !e.children) return this.measureBoxHeader(e) + e.contents.byteLength;
		{
			let t = this.measureBoxHeader(e);
			if (e.contents && (t += e.contents.byteLength), e.children) for (let n of e.children) n && (t += this.measureBox(n));
			return t;
		}
	}
}, K = /* @__PURE__ */ new Uint8Array(8), sc = /* @__PURE__ */ new DataView(K.buffer), q = (e) => [(e % 256 + 256) % 256], J = (e) => (sc.setUint16(0, e, !1), [K[0], K[1]]), cc = (e) => (sc.setInt16(0, e, !1), [K[0], K[1]]), lc = (e) => (sc.setUint32(0, e, !1), [
	K[1],
	K[2],
	K[3]
]), Y = (e) => (sc.setUint32(0, e, !1), [
	K[0],
	K[1],
	K[2],
	K[3]
]), uc = (e) => (sc.setInt32(0, e, !1), [
	K[0],
	K[1],
	K[2],
	K[3]
]), dc = (e) => (sc.setUint32(0, Math.floor(e / 2 ** 32), !1), sc.setUint32(4, e, !1), [
	K[0],
	K[1],
	K[2],
	K[3],
	K[4],
	K[5],
	K[6],
	K[7]
]), fc = (e) => (sc.setInt32(0, Math.floor(e / 2 ** 32), !1), sc.setUint32(4, e, !1), [
	K[0],
	K[1],
	K[2],
	K[3],
	K[4],
	K[5],
	K[6],
	K[7]
]), pc = (e) => (sc.setInt16(0, 2 ** 8 * e, !1), [K[0], K[1]]), mc = (e) => (sc.setInt32(0, 2 ** 16 * e, !1), [
	K[0],
	K[1],
	K[2],
	K[3]
]), hc = (e) => (sc.setInt32(0, 2 ** 30 * e, !1), [
	K[0],
	K[1],
	K[2],
	K[3]
]), gc = (e, t) => {
	let n = [], r = e;
	do {
		let e = r & 127;
		r >>= 7, n.length > 0 && (e |= 128), n.push(e), t !== void 0 && t--;
	} while (r > 0 || t);
	return n.reverse();
}, X = (e, t = !1) => {
	let n = Array(e.length).fill(null).map((t, n) => e.charCodeAt(n));
	return t && n.push(0), n;
}, _c = (e) => {
	let t = Math.PI / 180 * e, n = Math.round(Math.cos(t)), r = Math.round(Math.sin(t));
	return [
		n,
		r,
		0,
		-r,
		n,
		0,
		0,
		0,
		1
	];
}, vc = /* @__PURE__ */ _c(0), yc = (e) => [
	mc(e[0]),
	mc(e[1]),
	hc(e[2]),
	mc(e[3]),
	mc(e[4]),
	hc(e[5]),
	mc(e[6]),
	mc(e[7]),
	hc(e[8])
], Z = (e, t, n) => ({
	type: e,
	contents: t && new Uint8Array(t.flat(10)),
	children: n
}), Q = (e, t, n, r, i) => Z(e, [
	q(t),
	lc(n),
	r ?? []
], i), bc = (e) => e.isQuickTime ? Z("ftyp", [
	X("qt  "),
	Y(512),
	X("qt  ")
]) : e.fragmented ? e.cmaf ? Z("ftyp", [
	X("iso5"),
	Y(512),
	X("iso5"),
	X("iso6"),
	X("mp41"),
	X("cmfc"),
	X("dash")
]) : Z("ftyp", [
	X("iso5"),
	Y(512),
	X("iso5"),
	X("iso6"),
	X("mp41")
]) : Z("ftyp", [
	X("isom"),
	Y(512),
	X("isom"),
	e.holdsAvc ? X("avc1") : [],
	X("mp41")
]), xc = () => Z("styp", [
	X("iso5"),
	Y(0),
	X("iso5"),
	X("iso6"),
	X("mp41"),
	X("cmfc"),
	X("dash")
]), Sc = (e, t) => {
	let n = e.maxWrittenEndTimestamp - e.minWrittenTimestamp;
	return Number.isFinite(n) || (n = 0), Q("sidx", 1, 0, [
		Y(1),
		Y(Ql),
		dc($(e.minWrittenTimestamp, Ql)),
		dc(0),
		J(0),
		J(1),
		Y(t & 2147483647),
		Y($(n, Ql)),
		Y(0)
	]);
}, Cc = (e) => ({
	type: "mdat",
	largeSize: e
}), wc = (e) => ({
	type: "free",
	size: e
}), Tc = (e) => Z("moov", void 0, [
	Ec(e.creationTime, e.trackDatas),
	...e.trackDatas.map((t) => Oc(t, e.creationTime)),
	e.isFragmented ? hl(e.trackDatas) : null,
	Al(e)
]), Ec = (e, t) => {
	let n = Math.max(0, ...t.map((e) => $(Dc(e), Ql) + $(e.startTimestampOffset ?? 0, Ql))), r = Math.max(0, ...t.map((e) => e.track.id)) + 1, i = !d(e) || !d(n), a = i ? dc : Y;
	return Q("mvhd", +i, 0, [
		a(e),
		a(e),
		Y(Ql),
		a(n),
		mc(1),
		pc(1),
		Array(10).fill(0),
		yc(vc),
		Array(24).fill(0),
		Y(r)
	]);
}, Dc = (e) => {
	if (e.samples.length === 0) return 0;
	let t = Infinity, n = -Infinity;
	for (let r = 0; r < e.samples.length; r++) {
		let i = e.samples[r];
		i.timestamp < t && (t = i.timestamp), i.timestamp + i.duration > n && (n = i.timestamp + i.duration);
	}
	return t === Infinity ? 0 : n - t;
}, Oc = (e, t) => {
	let n = eu(e), r = e.startTimestampOffset !== null && e.startTimestampOffset > 0;
	return Z("trak", void 0, [
		kc(e, t),
		r ? Ac(e, e.startTimestampOffset) : null,
		jc(e, t),
		n.name === void 0 ? null : Z("udta", void 0, [Z("name", [..._.encode(n.name)])])
	]);
}, kc = (e, t) => {
	let n = $(Dc(e), Ql) + $(e.startTimestampOffset ?? 0, Ql), r = !d(t) || !d(n), i = r ? dc : Y, a;
	if (e.type === "video") {
		let t = e.track.metadata.rotation;
		a = _c(t ?? 0);
	} else a = vc;
	let o = 2;
	return e.track.metadata.disposition?.default !== !1 && (o |= 1), Q("tkhd", +r, o, [
		i(t),
		i(t),
		Y(e.track.id),
		Y(0),
		i(n),
		Array(8).fill(0),
		J(0),
		J(e.track.id),
		pc(+(e.type === "audio")),
		J(0),
		yc(a),
		mc(e.type === "video" ? e.info.width : 0),
		mc(e.type === "video" ? e.info.height : 0)
	]);
}, Ac = (e, t) => {
	let n = $(t, Ql), r = $(Dc(e), Ql), i = !d(n) || !d(r), a = i ? dc : Y, o = i ? fc : uc;
	return Z("edts", void 0, [Q("elst", +!!i, 0, [
		Y(2),
		a(n),
		o(-1),
		mc(1),
		a(r),
		o(0),
		mc(1)
	])]);
}, jc = (e, t) => Z("mdia", void 0, [
	Mc(e, t),
	Fc(!0, Nc[e.type], Pc[e.type]),
	Ic(e)
]), Mc = (e, t) => {
	let n = $(Dc(e), e.timescale), r = !d(t) || !d(n), i = r ? dc : Y;
	return Q("mdhd", +r, 0, [
		i(t),
		i(t),
		Y(e.timescale),
		i(n),
		J(Wl(e.track.metadata.languageCode ?? "und")),
		J(0)
	]);
}, Nc = {
	video: "vide",
	audio: "soun",
	subtitle: "text"
}, Pc = {
	video: "MediabunnyVideoHandler",
	audio: "MediabunnySoundHandler",
	subtitle: "MediabunnyTextHandler"
}, Fc = (e, t, n, r = "\0\0\0\0") => Q("hdlr", 0, 0, [
	e ? X("mhlr") : Y(0),
	X(t),
	X(r),
	Y(0),
	Y(0),
	X(n, !0)
]), Ic = (e) => Z("minf", void 0, [
	Lc[e.type](),
	Rc(),
	Vc(e)
]), Lc = {
	video: () => Q("vmhd", 0, 1, [
		J(0),
		J(0),
		J(0),
		J(0)
	]),
	audio: () => Q("smhd", 0, 0, [J(0), J(0)]),
	subtitle: () => Q("nmhd", 0, 0)
}, Rc = () => Z("dinf", void 0, [zc()]), zc = () => Q("dref", 0, 0, [Y(1)], [Bc()]), Bc = () => Q("url ", 0, 1), Vc = (e) => {
	let t = e.compositionTimeOffsetTable.length > 1 || e.compositionTimeOffsetTable.some((e) => e.sampleCompositionTimeOffset !== 0);
	return Z("stbl", void 0, [
		Hc(e),
		cl(e),
		t ? pl(e) : null,
		t ? ml(e) : null,
		ul(e),
		dl(e),
		fl(e),
		ll(e)
	]);
}, Hc = (e) => {
	let t;
	if (e.type === "video") t = Uc(Rl(e.track.source._codec, e.info.decoderConfig.codec), e);
	else if (e.type === "audio") {
		let n = Bl(e.track.source._codec, e.muxer.isQuickTime);
		c(n), t = Xc(n, e);
	} else e.type === "subtitle" && (t = ol(Hl[e.track.source._codec], e));
	return c(t), Q("stsd", 0, 0, [Y(1)], [t]);
}, Uc = (e, t) => Z(e, [
	[
		,
		,
		,
		,
		,
		,
	].fill(0),
	J(1),
	J(0),
	J(0),
	Array(12).fill(0),
	J(t.info.width),
	J(t.info.height),
	Y(4718592),
	Y(4718592),
	Y(0),
	J(1),
	q(10),
	X("Mediabunny"),
	Array(21).fill(0),
	J(t.info.hasAlphaChannel ? 32 : 24),
	cc(65535)
], [
	zl[t.track.source._codec]?.(t) ?? null,
	Wc(t),
	te(t.info.decoderConfig.colorSpace) ? Gc(t) : null
]), Wc = (e) => e.info.pixelAspectRatio.num === e.info.pixelAspectRatio.den ? null : Z("pasp", [Y(e.info.pixelAspectRatio.num), Y(e.info.pixelAspectRatio.den)]), Gc = (e) => Z("colr", [
	X(e.muxer.isQuickTime ? "nclc" : "nclx"),
	J(y[e.info.decoderConfig.colorSpace.primaries]),
	J(x[e.info.decoderConfig.colorSpace.transfer]),
	J(C[e.info.decoderConfig.colorSpace.matrix]),
	e.muxer.isQuickTime ? [] : q(!!e.info.decoderConfig.colorSpace.fullRange << 7)
]), Kc = (e) => e.info.decoderConfig && Z("avcC", [...m(e.info.decoderConfig.description)]), qc = (e) => e.info.decoderConfig && Z("hvcC", [...m(e.info.decoderConfig.description)]), Jc = (e) => {
	if (!e.info.decoderConfig) return null;
	let t = e.info.decoderConfig, n = t.codec.split("."), r = Number(n[1]), i = Number(n[2]), a = Number(n[3]), o = n[4] ? Number(n[4]) : 1, s = n[8] ? Number(n[8]) : Number(t.colorSpace?.fullRange ?? 0), c = (a << 4) + (o << 1) + s, l = n[5] ? Number(n[5]) : t.colorSpace?.primaries ? y[t.colorSpace.primaries] : 2, u = n[6] ? Number(n[6]) : t.colorSpace?.transfer ? x[t.colorSpace.transfer] : 2, d = n[7] ? Number(n[7]) : t.colorSpace?.matrix ? C[t.colorSpace.matrix] : 2;
	return Q("vpcC", 1, 0, [
		q(r),
		q(i),
		q(c),
		q(l),
		q(u),
		q(d),
		J(0)
	]);
}, Yc = (e) => Z("av1C", Et(e.info.decoderConfig.codec)), Xc = (e, t) => {
	let n = 0, r, i = 16, a = k.includes(t.track.source._codec);
	if (a) {
		let e = t.track.source._codec, { sampleSize: r } = Mt(e);
		i = 8 * r, i > 16 && (n = 1);
	}
	if (t.muxer.isQuickTime && (n = 1), n === 0) r = [
		[
			,
			,
			,
			,
			,
			,
		].fill(0),
		J(1),
		J(n),
		J(0),
		Y(0),
		J(t.info.numberOfChannels),
		J(i),
		J(0),
		J(0),
		J(t.info.sampleRate < 2 ** 16 ? t.info.sampleRate : 0),
		J(0)
	];
	else {
		let e = a ? 0 : -2;
		r = [
			[
				,
				,
				,
				,
				,
				,
			].fill(0),
			J(1),
			J(n),
			J(0),
			Y(0),
			J(t.info.numberOfChannels),
			J(Math.min(i, 16)),
			cc(e),
			J(0),
			J(t.info.sampleRate < 2 ** 16 ? t.info.sampleRate : 0),
			J(0),
			a ? [
				Y(1),
				Y(i / 8),
				Y(t.info.numberOfChannels * i / 8)
			] : [
				Y(0),
				Y(0),
				Y(0)
			],
			Y(2)
		];
	}
	return Z(e, r, [Vl(t.track.source._codec, t.muxer.isQuickTime)?.(t) ?? null]);
}, Zc = (e) => {
	let t;
	switch (e.track.source._codec) {
		case "aac":
			t = 64;
			break;
		case "mp3":
			t = 107;
			break;
		case "vorbis":
			t = 221;
			break;
		default: throw Error(`Unhandled audio codec: ${e.track.source._codec}`);
	}
	let n = [
		...q(t),
		...q(21),
		...lc(0),
		...Y(0),
		...Y(0)
	];
	if (e.info.decoderConfig.description) {
		let t = m(e.info.decoderConfig.description);
		n = [
			...n,
			...q(5),
			...gc(t.byteLength),
			...t
		];
	}
	return n = [
		...J(1),
		...q(0),
		...q(4),
		...gc(n.length),
		...n,
		...q(6),
		...q(1),
		...q(2)
	], n = [
		...q(3),
		...gc(n.length),
		...n
	], Q("esds", 0, 0, n);
}, Qc = (e) => Z("wave", void 0, [
	$c(e),
	el(e),
	Z("\0\0\0\0")
]), $c = (e) => Z("frma", [X(Bl(e.track.source._codec, e.muxer.isQuickTime))]), el = (e) => {
	let { littleEndian: t } = Mt(e.track.source._codec);
	return Z("enda", [J(+t)]);
}, tl = (e) => {
	let t = e.info.numberOfChannels, n = 3840, r = e.info.sampleRate, i = 0, a = 0, o = new Uint8Array(), s = e.info.decoderConfig?.description;
	if (s) {
		c(s.byteLength >= 18);
		let e = Fn(m(s));
		t = e.outputChannelCount, n = e.preSkip, r = e.inputSampleRate, i = e.outputGain, a = e.channelMappingFamily, e.channelMappingTable && (o = e.channelMappingTable);
	}
	return Z("dOps", [
		q(0),
		q(t),
		J(n),
		Y(r),
		cc(i),
		q(a),
		...o
	]);
}, nl = (e) => {
	let t = e.info.decoderConfig?.description;
	return c(t), Q("dfLa", 0, 0, [...m(t).subarray(4)]);
}, rl = (e) => {
	let { littleEndian: t, sampleSize: n } = Mt(e.track.source._codec);
	return Q("pcmC", 0, 0, [q(+t), q(8 * n)]);
}, il = (e) => {
	let t = Un(e.info.firstPacket.data);
	if (!t) throw Error("Couldn't extract AC-3 frame info from the audio packet. Ensure the packets contain valid AC-3 sync frames (as specified in ETSI TS 102 366).");
	let n = new Uint8Array(3), r = new O(n);
	return r.writeBits(2, t.fscod), r.writeBits(5, t.bsid), r.writeBits(3, t.bsmod), r.writeBits(3, t.acmod), r.writeBits(1, t.lfeon), r.writeBits(5, t.bitRateCode), r.writeBits(5, 0), Z("dac3", [...n]);
}, al = (e) => {
	let t = qn(e.info.firstPacket.data);
	if (!t) throw Error("Couldn't extract E-AC-3 frame info from the audio packet. Ensure the packets contain valid E-AC-3 sync frames (as specified in ETSI TS 102 366).");
	let n = 16;
	for (let e of t.substreams) n += 23, e.numDepSub > 0 ? n += 9 : n += 1;
	let r = Math.ceil(n / 8), i = new Uint8Array(r), a = new O(i);
	a.writeBits(13, t.dataRate), a.writeBits(3, t.substreams.length - 1);
	for (let e of t.substreams) a.writeBits(2, e.fscod), a.writeBits(5, e.bsid), a.writeBits(1, 0), a.writeBits(1, 0), a.writeBits(3, e.bsmod), a.writeBits(3, e.acmod), a.writeBits(1, e.lfeon), a.writeBits(3, 0), a.writeBits(4, e.numDepSub), e.numDepSub > 0 ? a.writeBits(9, e.chanLoc) : a.writeBits(1, 0);
	return Z("dec3", [...i]);
}, ol = (e, t) => Z(e, [[
	,
	,
	,
	,
	,
	,
].fill(0), J(1)], [Ul[t.track.source._codec](t)]), sl = (e) => Z("vttC", [..._.encode(e.info.config.description)]), cl = (e) => Q("stts", 0, 0, [Y(e.timeToSampleTable.length), e.timeToSampleTable.map((e) => [Y(e.sampleCount), Y(e.sampleDelta)])]), ll = (e) => {
	if (e.samples.every((e) => e.type === "key")) return null;
	let t = [...e.samples.entries()].filter(([, e]) => e.type === "key");
	return Q("stss", 0, 0, [Y(t.length), t.map(([e]) => Y(e + 1))]);
}, ul = (e) => Q("stsc", 0, 0, [Y(e.compactlyCodedChunkTable.length), e.compactlyCodedChunkTable.map((e) => [
	Y(e.firstChunk),
	Y(e.samplesPerChunk),
	Y(1)
])]), dl = (e) => {
	if (e.type === "audio" && e.info.requiresPcmTransformation) {
		let { sampleSize: t } = Mt(e.track.source._codec);
		return Q("stsz", 0, 0, [Y(t * e.info.numberOfChannels), Y(e.samples.reduce((t, n) => t + $(n.duration, e.timescale), 0))]);
	}
	return Q("stsz", 0, 0, [
		Y(0),
		Y(e.samples.length),
		e.samples.map((e) => Y(e.size))
	]);
}, fl = (e) => e.finalizedChunks.length > 0 && u(e.finalizedChunks).offset >= 2 ** 32 ? Q("co64", 0, 0, [Y(e.finalizedChunks.length), e.finalizedChunks.map((e) => dc(e.offset))]) : Q("stco", 0, 0, [Y(e.finalizedChunks.length), e.finalizedChunks.map((e) => Y(e.offset))]), pl = (e) => Q("ctts", 1, 0, [Y(e.compositionTimeOffsetTable.length), e.compositionTimeOffsetTable.map((e) => [Y(e.sampleCount), uc(e.sampleCompositionTimeOffset)])]), ml = (e) => {
	let t = Infinity, n = -Infinity, r = Infinity, i = -Infinity;
	c(e.compositionTimeOffsetTable.length > 0), c(e.samples.length > 0);
	for (let r = 0; r < e.compositionTimeOffsetTable.length; r++) {
		let i = e.compositionTimeOffsetTable[r];
		t = Math.min(t, i.sampleCompositionTimeOffset), n = Math.max(n, i.sampleCompositionTimeOffset);
	}
	for (let t = 0; t < e.samples.length; t++) {
		let n = e.samples[t];
		r = Math.min(r, $(n.timestamp, e.timescale)), i = Math.max(i, $(n.timestamp + n.duration, e.timescale));
	}
	let a = Math.max(-t, 0);
	return i >= 2 ** 31 ? null : Q("cslg", 0, 0, [
		uc(a),
		uc(t),
		uc(n),
		uc(r),
		uc(i)
	]);
}, hl = (e) => Z("mvex", void 0, e.map(gl)), gl = (e) => Q("trex", 0, 0, [
	Y(e.track.id),
	Y(1),
	Y(0),
	Y(0),
	Y(0)
]), _l = (e, t) => Z("moof", void 0, [vl(e), ...t.map(bl)]), vl = (e) => Q("mfhd", 0, 0, [Y(e)]), yl = (e) => {
	let t = 0, n = 0, r = e.type === "delta";
	return n |= +r, r ? t |= 1 : t |= 2, t << 24 | n << 16 | 0;
}, bl = (e) => Z("traf", void 0, [
	xl(e),
	Sl(e),
	Cl(e)
]), xl = (e) => {
	c(e.currentChunk);
	let t = 0;
	t |= 8, t |= 16, t |= 32, t |= 131072;
	let n = e.currentChunk.samples[1] ?? e.currentChunk.samples[0], r = {
		duration: n.timescaleUnitsToNextSample,
		size: n.size,
		flags: yl(n)
	};
	return Q("tfhd", 0, t, [
		Y(e.track.id),
		Y(r.duration),
		Y(r.size),
		Y(r.flags)
	]);
}, Sl = (e) => (c(e.currentChunk), Q("tfdt", 1, 0, [dc($(e.currentChunk.startTimestamp, e.timescale))])), Cl = (e) => {
	c(e.currentChunk);
	let t = e.currentChunk.samples.map((e) => e.timescaleUnitsToNextSample), n = e.currentChunk.samples.map((e) => e.size), r = e.currentChunk.samples.map(yl), i = e.currentChunk.samples.map((t) => $(t.timestamp - t.decodeTimestamp, e.timescale)), a = new Set(t), o = new Set(n), s = new Set(r), l = new Set(i), u = s.size === 2 && r[0] !== r[1], d = a.size > 1, f = o.size > 1, p = !u && s.size > 1, m = l.size > 1 || [...l].some((e) => e !== 0), h = 0;
	return h |= 1, h |= 4 * u, h |= 256 * d, h |= 512 * f, h |= 1024 * p, h |= 2048 * m, Q("trun", 1, h, [
		Y(e.currentChunk.samples.length),
		Y(e.currentChunk.offset - e.currentChunk.moofOffset || 0),
		u ? Y(r[0]) : [],
		e.currentChunk.samples.map((e, a) => [
			d ? Y(t[a]) : [],
			f ? Y(n[a]) : [],
			p ? Y(r[a]) : [],
			m ? uc(i[a]) : []
		])
	]);
}, wl = (e) => Z("mfra", void 0, [...e.map(Tl), El()]), Tl = (e, t) => Q("tfra", 1, 0, [
	Y(e.track.id),
	Y(63),
	Y(e.finalizedChunks.length),
	e.finalizedChunks.map((n) => [
		dc($(n.samples[0].timestamp, e.timescale)),
		dc(n.moofOffset),
		Y(t + 1),
		Y(1),
		Y(1)
	])
]), El = () => Q("mfro", 0, 0, [Y(0)]), Dl = () => Z("vtte"), Ol = (e, t, n, r, i) => Z("vttc", void 0, [
	i === null ? null : Z("vsid", [uc(i)]),
	n === null ? null : Z("iden", [..._.encode(n)]),
	t === null ? null : Z("ctim", [..._.encode(ac(t))]),
	r === null ? null : Z("sttg", [..._.encode(r)]),
	Z("payl", [..._.encode(e)])
]), kl = (e) => Z("vtta", [..._.encode(e)]), Al = (e) => {
	let t = [], n = e.format._options.metadataFormat ?? "auto", r = e.output._metadataTags;
	if (n === "mdir" || n === "auto" && !e.isQuickTime) {
		let e = Fl(r);
		e && t.push(e);
	} else if (n === "mdta") {
		let e = Il(r);
		e && t.push(e);
	} else (n === "udta" || n === "auto" && e.isQuickTime) && jl(t, e.output._metadataTags);
	return t.length === 0 ? null : Z("udta", void 0, t);
}, jl = (e, t) => {
	for (let { key: n, value: r } of Ue(t)) switch (n) {
		case "title":
			e.push(Ml("©nam", r));
			break;
		case "description":
			e.push(Ml("©des", r));
			break;
		case "artist":
			e.push(Ml("©ART", r));
			break;
		case "album":
			e.push(Ml("©alb", r));
			break;
		case "albumArtist":
			e.push(Ml("albr", r));
			break;
		case "genre":
			e.push(Ml("©gen", r));
			break;
		case "date":
			e.push(Ml("©day", r.toISOString().slice(0, 10)));
			break;
		case "comment":
			e.push(Ml("©cmt", r));
			break;
		case "lyrics":
			e.push(Ml("©lyr", r));
			break;
		case "raw": break;
		case "discNumber":
		case "discsTotal":
		case "trackNumber":
		case "tracksTotal":
		case "images": break;
		default: he(n);
	}
	if (t.raw) for (let n in t.raw) {
		let r = t.raw[n];
		r == null || n.length !== 4 || e.some((e) => e.type === n) || (typeof r == "string" ? e.push(Ml(n, r)) : r instanceof Uint8Array && e.push(Z(n, Array.from(r))));
	}
}, Ml = (e, t) => {
	let n = _.encode(t);
	return Z(e, [
		J(n.length),
		J(Wl("und")),
		Array.from(n)
	]);
}, Nl = {
	"image/jpeg": 13,
	"image/png": 14,
	"image/bmp": 27
}, Pl = (e, t) => {
	let n = [];
	for (let { key: r, value: i } of Ue(e)) switch (r) {
		case "title":
			n.push({
				key: t ? "title" : "©nam",
				value: Ll(i)
			});
			break;
		case "description":
			n.push({
				key: t ? "description" : "©des",
				value: Ll(i)
			});
			break;
		case "artist":
			n.push({
				key: t ? "artist" : "©ART",
				value: Ll(i)
			});
			break;
		case "album":
			n.push({
				key: t ? "album" : "©alb",
				value: Ll(i)
			});
			break;
		case "albumArtist":
			n.push({
				key: t ? "album_artist" : "aART",
				value: Ll(i)
			});
			break;
		case "comment":
			n.push({
				key: t ? "comment" : "©cmt",
				value: Ll(i)
			});
			break;
		case "genre":
			n.push({
				key: t ? "genre" : "©gen",
				value: Ll(i)
			});
			break;
		case "lyrics":
			n.push({
				key: t ? "lyrics" : "©lyr",
				value: Ll(i)
			});
			break;
		case "date":
			n.push({
				key: t ? "date" : "©day",
				value: Ll(i.toISOString().slice(0, 10))
			});
			break;
		case "images":
			for (let e of i) e.kind === "coverFront" && n.push({
				key: "covr",
				value: Z("data", [
					Y(Nl[e.mimeType] ?? 0),
					Y(0),
					Array.from(e.data)
				])
			});
			break;
		case "trackNumber":
			if (t) {
				let t = e.tracksTotal === void 0 ? i.toString() : `${i}/${e.tracksTotal}`;
				n.push({
					key: "track",
					value: Ll(t)
				});
			} else n.push({
				key: "trkn",
				value: Z("data", [
					Y(0),
					Y(0),
					J(0),
					J(i),
					J(e.tracksTotal ?? 0),
					J(0)
				])
			});
			break;
		case "discNumber":
			t || n.push({
				key: "disc",
				value: Z("data", [
					Y(0),
					Y(0),
					J(0),
					J(i),
					J(e.discsTotal ?? 0),
					J(0)
				])
			});
			break;
		case "tracksTotal":
		case "discsTotal": break;
		case "raw": break;
		default: he(r);
	}
	if (e.raw) for (let r in e.raw) {
		let i = e.raw[r];
		i == null || !t && r.length !== 4 || n.some((e) => e.key === r) || (typeof i == "string" ? n.push({
			key: r,
			value: Ll(i)
		}) : i instanceof Uint8Array ? n.push({
			key: r,
			value: Z("data", [
				Y(0),
				Y(0),
				Array.from(i)
			])
		}) : i instanceof it && n.push({
			key: r,
			value: Z("data", [
				Y(Nl[i.mimeType] ?? 0),
				Y(0),
				Array.from(i.data)
			])
		}));
	}
	return n;
}, Fl = (e) => {
	let t = Pl(e, !1);
	return t.length === 0 ? null : Q("meta", 0, 0, void 0, [Fc(!1, "mdir", "", "appl"), Z("ilst", void 0, t.map((e) => Z(e.key, void 0, [e.value])))]);
}, Il = (e) => {
	let t = Pl(e, !0);
	return t.length === 0 ? null : Z("meta", void 0, [
		Fc(!1, "mdta", ""),
		Q("keys", 0, 0, [Y(t.length)], t.map((e) => Z("mdta", [..._.encode(e.key)]))),
		Z("ilst", void 0, t.map((e, t) => Z(String.fromCharCode(...Y(t + 1)), void 0, [e.value])))
	]);
}, Ll = (e) => Z("data", [
	Y(1),
	Y(0),
	..._.encode(e)
]), Rl = (e, t) => {
	switch (e) {
		case "avc": return t.startsWith("avc3") ? "avc3" : "avc1";
		case "hevc": return "hvc1";
		case "vp8": return "vp08";
		case "vp9": return "vp09";
		case "av1": return "av01";
		case "prores": return t;
	}
}, zl = {
	avc: Kc,
	hevc: qc,
	vp8: Jc,
	vp9: Jc,
	av1: Yc,
	prores: null
}, Bl = (e, t) => {
	switch (e) {
		case "aac": return "mp4a";
		case "mp3": return "mp4a";
		case "opus": return "Opus";
		case "vorbis": return "mp4a";
		case "flac": return "fLaC";
		case "ulaw": return "ulaw";
		case "alaw": return "alaw";
		case "pcm-u8": return "raw ";
		case "pcm-s8": return "sowt";
		case "ac3": return "ac-3";
		case "eac3": return "ec-3";
	}
	if (t) switch (e) {
		case "pcm-s16": return "sowt";
		case "pcm-s16be": return "twos";
		case "pcm-s24": return "in24";
		case "pcm-s24be": return "in24";
		case "pcm-s32": return "in32";
		case "pcm-s32be": return "in32";
		case "pcm-f32": return "fl32";
		case "pcm-f32be": return "fl32";
		case "pcm-f64": return "fl64";
		case "pcm-f64be": return "fl64";
	}
	else switch (e) {
		case "pcm-s16": return "ipcm";
		case "pcm-s16be": return "ipcm";
		case "pcm-s24": return "ipcm";
		case "pcm-s24be": return "ipcm";
		case "pcm-s32": return "ipcm";
		case "pcm-s32be": return "ipcm";
		case "pcm-f32": return "fpcm";
		case "pcm-f32be": return "fpcm";
		case "pcm-f64": return "fpcm";
		case "pcm-f64be": return "fpcm";
	}
}, Vl = (e, t) => {
	switch (e) {
		case "aac": return Zc;
		case "mp3": return Zc;
		case "opus": return tl;
		case "vorbis": return Zc;
		case "flac": return nl;
		case "ac3": return il;
		case "eac3": return al;
	}
	if (t) switch (e) {
		case "pcm-s24": return Qc;
		case "pcm-s24be": return Qc;
		case "pcm-s32": return Qc;
		case "pcm-s32be": return Qc;
		case "pcm-f32": return Qc;
		case "pcm-f32be": return Qc;
		case "pcm-f64": return Qc;
		case "pcm-f64be": return Qc;
	}
	else switch (e) {
		case "pcm-s16": return rl;
		case "pcm-s16be": return rl;
		case "pcm-s24": return rl;
		case "pcm-s24be": return rl;
		case "pcm-s32": return rl;
		case "pcm-s32be": return rl;
		case "pcm-f32": return rl;
		case "pcm-f32be": return rl;
		case "pcm-f64": return rl;
		case "pcm-f64be": return rl;
	}
	return null;
}, Hl = { webvtt: "wvtt" }, Ul = { webvtt: sl }, Wl = (e) => {
	c(e.length === 3);
	let t = 0;
	for (let n = 0; n < 3; n++) t <<= 5, t += e.charCodeAt(n) - 96;
	return t;
}, Gl = class {
	constructor(e, t) {
		if (this.finalized = !1, this.started = !1, this.pos = 0, this.trackedWrites = null, this.trackedStart = -1, this.trackedEnd = -1, e._writerAcquired) throw Error("Can't have multiple Writers for the same Target.");
		this.target = e, e._setMonotonicity(t), e._writerAcquired = !0;
	}
	start() {
		c(!this.started), this.target._start(), this.started = !0;
	}
	write(e) {
		c(this.started && !this.finalized), this.maybeTrackWrites(e), this.target._write(e, this.pos), this.pos += e.byteLength;
	}
	seek(e) {
		this.pos = e;
	}
	getPos() {
		return this.pos;
	}
	async flush() {
		return c(this.started && !this.finalized), this.target._flush();
	}
	async finalize() {
		c(this.started && !this.finalized), await this.target._finalize(), this.finalized = !0;
	}
	maybeTrackWrites(e) {
		if (!this.trackedWrites) return;
		let t = this.getPos();
		if (t < this.trackedStart) {
			if (t + e.byteLength <= this.trackedStart) return;
			e = e.subarray(this.trackedStart - t), t = 0;
		}
		let n = t + e.byteLength - this.trackedStart, r = this.trackedWrites.byteLength;
		for (; r < n;) r *= 2;
		if (r !== this.trackedWrites.byteLength) {
			let e = new Uint8Array(r);
			e.set(this.trackedWrites, 0), this.trackedWrites = e;
		}
		this.trackedWrites.set(e, t - this.trackedStart), this.trackedEnd = Math.max(this.trackedEnd, t + e.byteLength);
	}
	startTrackingWrites() {
		this.trackedWrites = new Uint8Array(2 ** 10), this.trackedStart = this.getPos(), this.trackedEnd = this.trackedStart;
	}
	stopTrackingWrites() {
		if (!this.trackedWrites) throw Error("Internal error: Can't get tracked writes since nothing was tracked.");
		let e = {
			data: this.trackedWrites.subarray(0, this.trackedEnd - this.trackedStart),
			start: this.trackedStart,
			end: this.trackedEnd
		};
		return this.trackedWrites = null, e;
	}
}, Kl = class extends tt {
	constructor() {
		super(...arguments), this._writerAcquired = !1, this._monotonicity = null, this.onwrite = null;
	}
	_setMonotonicity(e) {
		this._monotonicity !== !1 && (this._monotonicity = e);
	}
	_dispatchWrite(e, t) {
		this.onwrite?.(e, t), this._emit("write", {
			start: e,
			end: t
		});
	}
	slice(e) {
		if (!Number.isInteger(e) || e < 0) throw TypeError("offset must be a non-negative integer.");
		return new Xl(this, e);
	}
}, ql = 2 ** 16, Jl = 2 ** 32, Yl = class extends Kl {
	constructor(e = {}) {
		if (super(), this.buffer = null, this._maxPos = 0, !e || typeof e != "object") throw TypeError("BufferTarget options, when provided, must be an object.");
		if (e.onFinalize !== void 0 && typeof e.onFinalize != "function") throw TypeError("options.onFinalize, when provided, must be a function.");
		if (this._options = e, this._supportsResize = "resize" in /* @__PURE__ */ new ArrayBuffer(0), this._supportsResize) try {
			this._buffer = new ArrayBuffer(ql, { maxByteLength: Jl });
		} catch {
			this._buffer = new ArrayBuffer(ql), this._supportsResize = !1;
		}
		else this._buffer = new ArrayBuffer(ql);
		this._bytes = new Uint8Array(this._buffer);
	}
	_ensureSize(e) {
		let t = this._buffer.byteLength;
		for (; t < e;) t *= 2;
		if (t !== this._buffer.byteLength) {
			if (t > Jl) throw Error(`ArrayBuffer exceeded maximum size of ${Jl} bytes. Please consider using another target.`);
			if (this._supportsResize) this._buffer.resize(t);
			else {
				let e = new ArrayBuffer(t), n = new Uint8Array(e);
				n.set(this._bytes, 0), this._buffer = e, this._bytes = n;
			}
		}
	}
	_start() {}
	_write(e, t) {
		this._ensureSize(t + e.byteLength), this._bytes.set(e, t), this._maxPos = Math.max(this._maxPos, t + e.byteLength), this._dispatchWrite(t, t + e.byteLength);
	}
	async _flush() {}
	async _finalize() {
		this.buffer = this._buffer.slice(0, this._maxPos), this._options.onFinalize && await this._options.onFinalize(this.buffer), this._emit("finalized");
	}
	async _close() {}
	_getSlice(e, t) {
		return this._bytes.slice(e, t);
	}
}, Xl = class extends Kl {
	constructor(e, t) {
		super(), this._baseTarget = e, this._offset = t;
	}
	_start() {}
	_write(e, t) {
		this._baseTarget._write(e, this._offset + t), this._dispatchWrite(t, t + e.byteLength);
	}
	_flush() {
		return this._baseTarget._flush();
	}
	async _finalize() {
		this._emit("finalized");
	}
	async _close() {}
	_setMonotonicity(e) {
		super._setMonotonicity(e), this._baseTarget._setMonotonicity(e);
	}
}, Zl = class {
	constructor(e, t) {
		if (this.rootPath = e, this.getTarget = t, typeof e != "string") throw TypeError("rootPath must be a string.");
		if (typeof t != "function") throw TypeError("getTarget must be a function.");
	}
}, Ql = 57600, $l = 2082844800, eu = (e) => {
	let t = {}, n = e.track;
	return n.metadata.name !== void 0 && (t.name = n.metadata.name), t;
}, $ = (e, t, n = !0) => {
	let r = e * t;
	return n ? Math.round(r) : r;
}, tu = class extends rc {
	constructor(e, t) {
		super(e), this.writer = null, this.boxWriter = null, this.initWriter = null, this.initBoxWriter = null, this.auxTarget = new Yl(), this.auxWriter = new Gl(this.auxTarget, !1), this.auxBoxWriter = new oc(this.auxWriter), this.mdat = null, this.ftypSize = null, this.trackDatas = [], this.allTracksKnown = T(), this.creationTime = Math.floor(Date.now() / 1e3) + $l, this.finalizedChunks = [], this.nextFragmentNumber = 1, this.maxWrittenTimestamp = -Infinity, this.minWrittenTimestamp = Infinity, this.maxWrittenEndTimestamp = -Infinity, this.segmentHeaderSize = null, this.format = t, this.isQuickTime = t instanceof Cu, this.isCmaf = t instanceof Su, this.minimumFragmentDuration = t._options.minimumFragmentDuration ?? (t instanceof Su ? Infinity : 1), this.auxWriter.start();
	}
	async start() {
		let e = await this.mutex.acquire();
		if (this.isCmaf ? (this.fastStart = "fragmented", this.isFragmented = !0) : (this.writer = await this.output._getRootWriter((e) => this.format._options.fastStart === void 0 ? e instanceof Yl : this.format._options.fastStart === "fragmented"), this.boxWriter = new oc(this.writer), this.fastStart = this.format._options.fastStart ?? (this.writer.target instanceof Yl ? "in-memory" : !1), this.isFragmented = this.fastStart === "fragmented"), this.isCmaf) {
			if (!this.output._hasInitTarget()) throw Error("CMAF outputs require the initTarget field in OutputOptions to be set; the init segment will be written to it.");
			let e = new Gl(await this.output._getInitTarget(), !0);
			e.start(), this.initWriter = e, this.initBoxWriter = new oc(e);
		}
		let t = this.output.tracks.some((e) => e.isVideoTrack() && e.source._codec === "avc");
		{
			let e = this.initBoxWriter ?? this.boxWriter;
			if (c(e), this.format._options.onFtyp && e.writer.startTrackingWrites(), e.writeBox(bc({
				isQuickTime: this.isQuickTime,
				holdsAvc: t,
				fragmented: this.isFragmented,
				cmaf: this.isCmaf
			})), this.format._options.onFtyp) {
				let { data: t, start: n } = e.writer.stopTrackingWrites();
				this.format._options.onFtyp(t, n);
			}
			this.ftypSize = e.writer.getPos(), this.isCmaf && await this.initWriter.flush();
		}
		if (this.fastStart !== "in-memory") if (this.fastStart === "reserve") {
			for (let e of this.output.tracks) if (e.metadata.maximumPacketCount === void 0) throw Error("All tracks must specify maximumPacketCount in their metadata when using fastStart: 'reserve'.");
		} else this.isFragmented || (c(this.writer), c(this.boxWriter), this.format._options.onMdat && this.writer.startTrackingWrites(), this.mdat = Cc(!0), this.boxWriter.writeBox(this.mdat));
		await this.writer?.flush(), e();
	}
	allTracksAreKnown() {
		for (let e of this.output.tracks) if (!e.source._closed && !this.trackDatas.some((t) => t.track === e)) return !1;
		return !0;
	}
	async getMimeType() {
		await this.allTracksKnown.promise;
		let e = this.trackDatas.map((e) => e.type === "video" || e.type === "audio" ? e.info.decoderConfig.codec : { webvtt: "wvtt" }[e.track.source._codec]);
		return $n({
			isQuickTime: this.isQuickTime,
			hasVideo: this.trackDatas.some((e) => e.type === "video"),
			hasAudio: this.trackDatas.some((e) => e.type === "audio"),
			codecStrings: e
		});
	}
	getVideoTrackData(e, t, n) {
		let r = this.trackDatas.find((t) => t.track === e);
		if (r) return r;
		Vt(n), c(n), c(n.decoderConfig);
		let i = { ...n.decoderConfig };
		c(i.codedWidth !== void 0), c(i.codedHeight !== void 0);
		let a = !1;
		if (e.source._codec === "avc" && !i.description) {
			let e = fn(t.data);
			if (!e) throw Error("Couldn't extract an AVCDecoderConfigurationRecord from the AVC packet. Make sure the packets are in Annex B format (as specified in ITU-T-REC-H.264) when not providing a description, or provide a description (must be an AVCDecoderConfigurationRecord as specified in ISO 14496-15) and ensure the packets are in AVCC format.");
			i.description = pn(e), a = !0;
		} else if (e.source._codec === "hevc" && !i.description) {
			let e = Sn(t.data);
			if (!e) throw Error("Couldn't extract an HEVCDecoderConfigurationRecord from the HEVC packet. Make sure the packets are in Annex B format (as specified in ITU-T-REC-H.265) when not providing a description, or provide a description (must be an HEVCDecoderConfigurationRecord as specified in ISO 14496-15) and ensure the packets are in HEVC format.");
			i.description = An(e), a = !0;
		}
		let o = je(1 / (e.metadata.frameRate ?? 57600), 1e6).den, s = i.displayAspectWidth, l = i.displayAspectHeight, u = s === void 0 || l === void 0 ? {
			num: 1,
			den: 1
		} : Ze({
			num: s * i.codedHeight,
			den: l * i.codedWidth
		}), d = i.codec === "ap4h" || i.codec === "ap4x", f = {
			muxer: this,
			track: e,
			type: "video",
			info: {
				width: i.codedWidth,
				height: i.codedHeight,
				pixelAspectRatio: u,
				decoderConfig: i,
				requiresAnnexBTransformation: a,
				hasAlphaChannel: d
			},
			timescale: o,
			samples: [],
			sampleQueue: [],
			timestampProcessingQueue: [],
			timeToSampleTable: [],
			compositionTimeOffsetTable: [],
			lastTimescaleUnits: null,
			lastSample: null,
			startTimestampOffset: null,
			finalizedChunks: [],
			currentChunk: null,
			compactlyCodedChunkTable: [],
			closed: !1
		};
		return this.trackDatas.push(f), this.trackDatas.sort((e, t) => e.track.id - t.track.id), this.allTracksAreKnown() && this.allTracksKnown.resolve(), f;
	}
	getAudioTrackData(e, t, n) {
		let r = this.trackDatas.find((t) => t.track === e);
		if (r) return r;
		Ut(n), c(n), c(n.decoderConfig);
		let i = { ...n.decoderConfig }, a = !1;
		if (e.source._codec === "aac" && !i.description) {
			let e = Ti(Ps.tempFromBytes(t.data));
			if (!e) throw Error("Couldn't parse ADTS header from the AAC packet. Make sure the packets are in ADTS format (as specified in ISO 13818-7) when not providing a description, or provide a description (must be an AudioSpecificConfig as specified in ISO 14496-3) and ensure the packets are raw AAC data.");
			let n = lt[e.samplingFrequencyIndex], r = ut[e.channelConfiguration];
			if (n === void 0 || r === void 0) throw Error("Invalid ADTS frame header.");
			i.description = ft({
				objectType: e.objectType,
				sampleRate: n,
				numberOfChannels: r
			}), a = !0;
		}
		let o = {
			muxer: this,
			track: e,
			type: "audio",
			info: {
				numberOfChannels: n.decoderConfig.numberOfChannels,
				sampleRate: n.decoderConfig.sampleRate,
				decoderConfig: i,
				requiresPcmTransformation: !this.isFragmented && k.includes(e.source._codec),
				expectedNextPcmPacketTimestamp: null,
				requiresAdtsStripping: a,
				firstPacket: t
			},
			timescale: i.sampleRate,
			samples: [],
			sampleQueue: [],
			timestampProcessingQueue: [],
			timeToSampleTable: [],
			compositionTimeOffsetTable: [],
			lastTimescaleUnits: null,
			lastSample: null,
			startTimestampOffset: null,
			finalizedChunks: [],
			currentChunk: null,
			compactlyCodedChunkTable: [],
			closed: !1
		};
		return this.trackDatas.push(o), this.trackDatas.sort((e, t) => e.track.id - t.track.id), this.allTracksAreKnown() && this.allTracksKnown.resolve(), o;
	}
	getSubtitleTrackData(e, t) {
		let n = this.trackDatas.find((t) => t.track === e);
		if (n) return n;
		Wt(t), c(t), c(t.config);
		let r = {
			muxer: this,
			track: e,
			type: "subtitle",
			info: { config: t.config },
			timescale: 1e3,
			samples: [],
			sampleQueue: [],
			timestampProcessingQueue: [],
			timeToSampleTable: [],
			compositionTimeOffsetTable: [],
			lastTimescaleUnits: null,
			lastSample: null,
			startTimestampOffset: null,
			finalizedChunks: [],
			currentChunk: null,
			compactlyCodedChunkTable: [],
			closed: !1,
			lastCueEndTimestamp: 0,
			cueQueue: [],
			nextSourceId: 0,
			cueToSourceId: /* @__PURE__ */ new WeakMap()
		};
		return this.trackDatas.push(r), this.trackDatas.sort((e, t) => e.track.id - t.track.id), this.allTracksAreKnown() && this.allTracksKnown.resolve(), r;
	}
	async addEncodedVideoPacket(e, t, n) {
		let r = await this.mutex.acquire();
		try {
			let r = this.getVideoTrackData(e, t, n), i = t.data;
			if (r.info.requiresAnnexBTransformation) {
				let e = [...nn(i)].map((e) => i.subarray(e.offset, e.offset + e.length));
				if (e.length === 0) throw Error("Failed to transform packet data. Make sure all packets are provided in Annex B format, as specified in ITU-T-REC-H.264 and ITU-T-REC-H.265.");
				i = un(e, 4);
			}
			this.validateTimestamp(r.track, t.timestamp, t.type === "key");
			let a = this.createSampleForTrack(r, i, t.timestamp, t.duration, t.type);
			await this.registerSample(r, a);
		} finally {
			r();
		}
	}
	async addEncodedAudioPacket(e, t, n) {
		let r = await this.mutex.acquire();
		try {
			let r = this.getAudioTrackData(e, t, n), i = t.data;
			if (r.info.requiresAdtsStripping) {
				let e = Ti(Ps.tempFromBytes(i));
				if (!e) throw Error("Expected ADTS frame, didn't get one.");
				let t = e.crcCheck === null ? 7 : 9;
				i = i.subarray(t);
			}
			this.validateTimestamp(r.track, t.timestamp, t.type === "key");
			let a = t.timestamp, o = t.duration;
			if (r.info.requiresPcmTransformation) {
				let e = Mt(r.info.decoderConfig.codec).sampleSize * r.info.numberOfChannels;
				if (o = i.byteLength / e / r.info.sampleRate, r.info.expectedNextPcmPacketTimestamp !== null) {
					let e = a - r.info.expectedNextPcmPacketTimestamp;
					if (e < .01) a = r.info.expectedNextPcmPacketTimestamp;
					else {
						let t = await this.padWithSilence(r, r.info.expectedNextPcmPacketTimestamp, e);
						a = r.info.expectedNextPcmPacketTimestamp + t;
					}
				}
				r.info.expectedNextPcmPacketTimestamp = a + o;
			}
			let s = this.createSampleForTrack(r, i, a, o, t.type);
			await this.registerSample(r, s);
		} finally {
			r();
		}
	}
	async padWithSilence(e, t, n) {
		let r = $(n, e.timescale);
		if (n = r / e.timescale, r > 0) {
			let { sampleSize: i, silentValue: a } = Mt(e.info.decoderConfig.codec), o = r * e.info.numberOfChannels, s = new Uint8Array(i * o).fill(a), c = this.createSampleForTrack(e, new Uint8Array(s.buffer), t, n, "key");
			await this.registerSample(e, c);
		}
		return n;
	}
	async addSubtitleCue(e, t, n) {
		let r = await this.mutex.acquire();
		try {
			let r = this.getSubtitleTrackData(e, n);
			this.validateTimestamp(r.track, t.timestamp, !0), e.source._codec === "webvtt" && (r.cueQueue.push(t), await this.processWebVTTCues(r, t.timestamp));
		} finally {
			r();
		}
	}
	async processWebVTTCues(e, t) {
		for (; e.cueQueue.length > 0;) {
			let n = /* @__PURE__ */ new Set([]);
			for (let r of e.cueQueue) c(r.timestamp <= t), c(e.lastCueEndTimestamp <= r.timestamp + r.duration), n.add(Math.max(r.timestamp, e.lastCueEndTimestamp)), n.add(r.timestamp + r.duration);
			let r = [...n].sort((e, t) => e - t), i = r[0], a = r[1] ?? i;
			if (t < a) break;
			if (e.lastCueEndTimestamp < i) {
				this.auxWriter.seek(0);
				let t = Dl();
				this.auxBoxWriter.writeBox(t);
				let n = this.auxTarget._getSlice(0, this.auxWriter.getPos()), r = this.createSampleForTrack(e, n, e.lastCueEndTimestamp, i - e.lastCueEndTimestamp, "key");
				await this.registerSample(e, r), e.lastCueEndTimestamp = i;
			}
			this.auxWriter.seek(0);
			for (let t = 0; t < e.cueQueue.length; t++) {
				let n = e.cueQueue[t];
				if (n.timestamp >= a) break;
				ic.lastIndex = 0;
				let r = ic.test(n.text), o = n.timestamp + n.duration, s = e.cueToSourceId.get(n);
				if (s === void 0 && a < o && (s = e.nextSourceId++, e.cueToSourceId.set(n, s)), n.notes) {
					let e = kl(n.notes);
					this.auxBoxWriter.writeBox(e);
				}
				let c = Ol(n.text, r ? i : null, n.identifier ?? null, n.settings ?? null, s ?? null);
				this.auxBoxWriter.writeBox(c), o === a && e.cueQueue.splice(t--, 1);
			}
			let o = this.auxTarget._getSlice(0, this.auxWriter.getPos()), s = this.createSampleForTrack(e, o, i, a - i, "key");
			await this.registerSample(e, s), e.lastCueEndTimestamp = a;
		}
	}
	createSampleForTrack(e, t, n, r, i) {
		return {
			timestamp: n,
			decodeTimestamp: n,
			duration: r,
			data: t,
			size: t.byteLength,
			type: i,
			timescaleUnitsToNextSample: $(r, e.timescale)
		};
	}
	processTimestamps(e, t) {
		if (e.timestampProcessingQueue.length === 0) return;
		if (e.type === "audio" && e.info.requiresPcmTransformation) {
			this.isFragmented || (e.startTimestampOffset ??= e.timestampProcessingQueue[0].timestamp);
			let t = 0;
			for (let n = 0; n < e.timestampProcessingQueue.length; n++) {
				let r = e.timestampProcessingQueue[n], i = $(r.duration, e.timescale);
				t += i;
			}
			if (e.timeToSampleTable.length === 0) e.timeToSampleTable.push({
				sampleCount: t,
				sampleDelta: 1
			});
			else {
				let n = u(e.timeToSampleTable);
				n.sampleCount += t;
			}
			e.timestampProcessingQueue.length = 0;
			return;
		}
		let n = e.timestampProcessingQueue.map((e) => e.timestamp).sort((e, t) => e - t);
		this.isFragmented || (e.startTimestampOffset ??= n[0]);
		for (let t = 0; t < e.timestampProcessingQueue.length; t++) {
			let r = e.timestampProcessingQueue[t];
			r.decodeTimestamp = n[t];
			let i = $(r.timestamp - r.decodeTimestamp, e.timescale), a = $(r.duration, e.timescale);
			if (e.lastTimescaleUnits !== null) {
				c(e.lastSample);
				let t = $(r.decodeTimestamp, e.timescale, !1), n = Math.round(t - e.lastTimescaleUnits);
				if (c(n >= 0), e.lastTimescaleUnits += n, e.lastSample.timescaleUnitsToNextSample = n, !this.isFragmented) {
					let t = u(e.timeToSampleTable);
					if (c(t), t.sampleCount === 1) {
						t.sampleDelta = n;
						let r = e.timeToSampleTable[e.timeToSampleTable.length - 2];
						r && r.sampleDelta === n && (r.sampleCount++, e.timeToSampleTable.pop(), t = r);
					} else t.sampleDelta !== n && (t.sampleCount--, e.timeToSampleTable.push(t = {
						sampleCount: 1,
						sampleDelta: n
					}));
					t.sampleDelta === a ? t.sampleCount++ : e.timeToSampleTable.push({
						sampleCount: 1,
						sampleDelta: a
					});
					let r = u(e.compositionTimeOffsetTable);
					c(r), r.sampleCompositionTimeOffset === i ? r.sampleCount++ : e.compositionTimeOffsetTable.push({
						sampleCount: 1,
						sampleCompositionTimeOffset: i
					});
				}
			} else e.lastTimescaleUnits = $(r.decodeTimestamp, e.timescale, !1), this.isFragmented || (e.timeToSampleTable.push({
				sampleCount: 1,
				sampleDelta: a
			}), e.compositionTimeOffsetTable.push({
				sampleCount: 1,
				sampleCompositionTimeOffset: i
			}));
			e.lastSample = r;
		}
		if (e.timestampProcessingQueue.length = 0, c(e.lastSample), c(e.lastTimescaleUnits !== null), t !== void 0 && e.lastSample.timescaleUnitsToNextSample === 0) {
			c(t.type === "key");
			let n = $(t.timestamp, e.timescale, !1), r = Math.round(n - e.lastTimescaleUnits);
			e.lastSample.timescaleUnitsToNextSample = r;
		}
	}
	async registerSample(e, t) {
		t.type === "key" && this.processTimestamps(e, t), e.timestampProcessingQueue.push(t), this.isFragmented ? (e.sampleQueue.push(t), await this.interleaveSamples()) : this.fastStart === "reserve" ? await this.registerSampleFastStartReserve(e, t) : await this.addSampleToTrack(e, t);
	}
	async addSampleToTrack(e, t) {
		if (!this.isFragmented && (e.samples.push(t), this.fastStart === "reserve")) {
			let t = e.track.metadata.maximumPacketCount;
			if (c(t !== void 0), e.samples.length > t) throw Error(`Track #${e.track.id} has already reached the maximum packet count (${t}). Either add less packets or increase the maximum packet count.`);
		}
		let n = !1;
		if (!e.currentChunk) n = !0;
		else {
			e.currentChunk.startTimestamp = Math.min(e.currentChunk.startTimestamp, t.timestamp);
			let r = t.timestamp - e.currentChunk.startTimestamp;
			if (this.isFragmented) {
				let i = this.trackDatas.every((n) => {
					if (e === n) return t.type === "key";
					let r = n.sampleQueue[0];
					return r ? r.type === "key" : n.closed;
				});
				r >= this.minimumFragmentDuration && i && t.timestamp > this.maxWrittenTimestamp && (n = !0, await this.finalizeFragment());
			} else n = r >= .5;
		}
		n && (e.currentChunk && await this.finalizeCurrentChunk(e), e.currentChunk = {
			startTimestamp: t.timestamp,
			samples: [],
			offset: null,
			moofOffset: null
		}), c(e.currentChunk), e.currentChunk.samples.push(t), this.isFragmented && (this.maxWrittenTimestamp = Math.max(this.maxWrittenTimestamp, t.timestamp), this.maxWrittenEndTimestamp = Math.max(this.maxWrittenEndTimestamp, t.timestamp + t.duration), this.minWrittenTimestamp = Math.min(this.minWrittenTimestamp, t.timestamp));
	}
	async finalizeCurrentChunk(e) {
		if (c(!this.isFragmented), c(this.writer), !e.currentChunk) return;
		e.finalizedChunks.push(e.currentChunk), this.finalizedChunks.push(e.currentChunk);
		let t = e.currentChunk.samples.length;
		if (e.type === "audio" && e.info.requiresPcmTransformation && (t = e.currentChunk.samples.reduce((t, n) => t + $(n.duration, e.timescale), 0)), (e.compactlyCodedChunkTable.length === 0 || u(e.compactlyCodedChunkTable).samplesPerChunk !== t) && e.compactlyCodedChunkTable.push({
			firstChunk: e.finalizedChunks.length,
			samplesPerChunk: t
		}), this.fastStart === "in-memory") {
			e.currentChunk.offset = 0;
			return;
		}
		e.currentChunk.offset = this.writer.getPos();
		for (let t of e.currentChunk.samples) c(t.data), this.writer.write(t.data), t.data = null;
		await this.writer.flush();
	}
	async interleaveSamples(e = !1) {
		if (c(this.isFragmented), !(!e && !this.allTracksAreKnown())) outer: for (;;) {
			let t = null, n = Infinity;
			for (let r of this.trackDatas) {
				if (!e && r.sampleQueue.length === 0 && !r.closed) break outer;
				r.sampleQueue.length > 0 && r.sampleQueue[0].timestamp < n && (t = r, n = r.sampleQueue[0].timestamp);
			}
			if (!t) break;
			let r = t.sampleQueue.shift();
			await this.addSampleToTrack(t, r);
		}
	}
	async finalizeFragment(e = !this.isCmaf) {
		c(this.isFragmented);
		let t = this.nextFragmentNumber++;
		if (t === 1) {
			let e = this.initBoxWriter ?? this.boxWriter;
			c(e), this.format._options.onMoov && e.writer.startTrackingWrites(), this.ensureOneEnabledTrack();
			let t = Tc(this);
			if (e.writeBox(t), this.format._options.onMoov) {
				let { data: t, start: n } = e.writer.stopTrackingWrites();
				this.format._options.onMoov(t, n);
			}
			if (this.isCmaf) {
				c(this.initWriter), await this.initWriter.flush(), await this.initWriter.finalize(), this.writer = await this.output._getRootWriter(!0), this.boxWriter = new oc(this.writer);
				let e = this.boxWriter.measureBox(xc()), t = this.boxWriter.measureBox(Sc(this, 0));
				this.segmentHeaderSize = e + t, this.writer.seek(this.segmentHeaderSize);
			}
		}
		c(this.writer), c(this.boxWriter);
		let n = this.trackDatas.filter((e) => e.currentChunk), r = _l(t, n), i = this.writer.getPos(), a = i + this.boxWriter.measureBox(r), o = a + 8, s = Infinity;
		for (let e of n) {
			e.currentChunk.offset = o, e.currentChunk.moofOffset = i;
			for (let t of e.currentChunk.samples) o += t.size;
			s = Math.min(s, e.currentChunk.startTimestamp);
		}
		let l = o - a, u = l >= 2 ** 32;
		if (u) for (let e of n) e.currentChunk.offset += 8;
		this.format._options.onMoof && this.writer.startTrackingWrites();
		let d = _l(t, n);
		if (this.boxWriter.writeBox(d), this.format._options.onMoof) {
			let { data: e, start: t } = this.writer.stopTrackingWrites();
			this.format._options.onMoof(e, t, s);
		}
		c(this.writer.getPos() === a), this.format._options.onMdat && this.writer.startTrackingWrites();
		let f = Cc(u);
		f.size = l, this.boxWriter.writeBox(f), this.writer.seek(a + (u ? 16 : 8));
		for (let e of n) for (let t of e.currentChunk.samples) this.writer.write(t.data), t.data = null;
		if (this.format._options.onMdat) {
			let { data: e, start: t } = this.writer.stopTrackingWrites();
			this.format._options.onMdat(e, t);
		}
		for (let e of n) e.finalizedChunks.push(e.currentChunk), this.finalizedChunks.push(e.currentChunk), e.currentChunk = null;
		e && await this.writer.flush();
	}
	async registerSampleFastStartReserve(e, t) {
		if (c(this.writer), c(this.boxWriter), this.allTracksAreKnown()) {
			if (!this.mdat) {
				this.ensureOneEnabledTrack();
				let e = Tc(this), t = this.boxWriter.measureBox(e) + this.computeSampleTableSizeUpperBound() + 4096;
				c(this.ftypSize !== null), this.writer.seek(this.ftypSize + t), this.format._options.onMdat && this.writer.startTrackingWrites(), this.mdat = Cc(!0), this.boxWriter.writeBox(this.mdat);
				for (let e of this.trackDatas) {
					for (let t of e.sampleQueue) await this.addSampleToTrack(e, t);
					e.sampleQueue.length = 0;
				}
			}
			await this.addSampleToTrack(e, t);
		} else e.sampleQueue.push(t);
	}
	computeSampleTableSizeUpperBound() {
		c(this.fastStart === "reserve");
		let e = 0;
		for (let t of this.trackDatas) {
			let n = t.track.metadata.maximumPacketCount;
			c(n !== void 0), e += 8 * Math.ceil(2 / 3 * n), e += 4 * n, e += 8 * Math.ceil(2 / 3 * n), e += 12 * Math.ceil(2 / 3 * n), e += 4 * n, e += 8 * n;
		}
		return e;
	}
	async onTrackClose(e) {
		let t = await this.mutex.acquire(), n = this.trackDatas.find((t) => t.track === e);
		n && (n.closed = !0, n.type === "subtitle" && e.source._codec === "webvtt" && await this.processWebVTTCues(n, Infinity), this.processTimestamps(n)), this.allTracksAreKnown() && this.allTracksKnown.resolve(), this.isFragmented && await this.interleaveSamples(), t();
	}
	ensureOneEnabledTrack() {
		for (let e of [
			"video",
			"audio",
			"subtitle"
		]) {
			let t = this.trackDatas.filter((t) => t.type === e);
			if (t.length !== 0 && !t.some((e) => e.track.metadata.disposition?.default !== !1)) {
				let e = t[0];
				e.track.metadata.disposition = {
					...e.track.metadata.disposition,
					default: !0
				};
			}
		}
	}
	async finalize() {
		let e = await this.mutex.acquire();
		this.allTracksKnown.resolve(), this.ensureOneEnabledTrack();
		for (let e of this.trackDatas) e.closed = !0, e.type === "subtitle" && e.track.source._codec === "webvtt" && await this.processWebVTTCues(e, Infinity), this.processTimestamps(e);
		if (this.isFragmented) await this.interleaveSamples(!0), await this.finalizeFragment(!1);
		else for (let e of this.trackDatas) {
			await this.finalizeCurrentChunk(e), c(e.startTimestampOffset !== null);
			for (let t = 0; t < e.samples.length; t++) {
				let n = e.samples[t];
				n.timestamp -= e.startTimestampOffset, n.decodeTimestamp -= e.startTimestampOffset;
			}
		}
		if (c(this.writer), c(this.boxWriter), this.fastStart === "in-memory") {
			this.mdat = Cc(!1);
			let e;
			for (let t = 0; t < 2; t++) {
				let t = Tc(this), n = this.boxWriter.measureBox(t);
				e = this.boxWriter.measureBox(this.mdat);
				let r = this.writer.getPos() + n + e;
				for (let t of this.finalizedChunks) {
					t.offset = r;
					for (let { data: n } of t.samples) c(n), r += n.byteLength, e += n.byteLength;
				}
				if (r < 2 ** 32) break;
				e >= 2 ** 32 && (this.mdat.largeSize = !0);
			}
			this.format._options.onMoov && this.writer.startTrackingWrites();
			let t = Tc(this);
			if (this.boxWriter.writeBox(t), this.format._options.onMoov) {
				let { data: e, start: t } = this.writer.stopTrackingWrites();
				this.format._options.onMoov(e, t);
			}
			this.format._options.onMdat && this.writer.startTrackingWrites(), this.mdat.size = e, this.boxWriter.writeBox(this.mdat);
			for (let e of this.finalizedChunks) for (let t of e.samples) c(t.data), this.writer.write(t.data), t.data = null;
			if (this.format._options.onMdat) {
				let { data: e, start: t } = this.writer.stopTrackingWrites();
				this.format._options.onMdat(e, t);
			}
		} else if (this.isFragmented) if (this.isCmaf) {
			let e = this.segmentHeaderSize === null ? 0 : this.writer.getPos() - this.segmentHeaderSize;
			this.writer.seek(0), this.boxWriter.writeBox(xc()), this.boxWriter.writeBox(Sc(this, e));
		} else {
			let e = this.writer.getPos(), t = wl(this.trackDatas);
			this.boxWriter.writeBox(t);
			let n = this.writer.getPos() - e;
			this.writer.seek(this.writer.getPos() - 4), this.boxWriter.writeU32(n);
		}
		else {
			c(this.mdat);
			let e = this.boxWriter.offsets.get(this.mdat);
			c(e !== void 0);
			let t = this.writer.getPos() - e;
			if (this.mdat.size = t, this.mdat.largeSize = t >= 2 ** 32, this.boxWriter.patchBox(this.mdat), this.format._options.onMdat) {
				let { data: e, start: t } = this.writer.stopTrackingWrites();
				this.format._options.onMdat(e, t);
			}
			let n = Tc(this);
			if (this.fastStart === "reserve") {
				c(this.ftypSize !== null), this.writer.seek(this.ftypSize), this.format._options.onMoov && this.writer.startTrackingWrites(), this.boxWriter.writeBox(n);
				let e = this.boxWriter.offsets.get(this.mdat) - this.writer.getPos();
				this.boxWriter.writeBox(wc(e));
			} else this.format._options.onMoov && this.writer.startTrackingWrites(), this.boxWriter.writeBox(n);
			if (this.format._options.onMoov) {
				let { data: e, start: t } = this.writer.stopTrackingWrites();
				this.format._options.onMoov(e, t);
			}
		}
		e();
	}
}, nu = class {
	constructor(e) {
		this.sourceSampleRate = null, this.sourceNumberOfChannels = null, this.startTime = null, this.bufferStartFrame = 0, this.maxWrittenFrame = null, this.targetSampleRate = e.targetSampleRate, this.targetNumberOfChannels = e.targetNumberOfChannels, this.onSample = e.onSample, this.bufferSizeInFrames = Math.floor(this.targetSampleRate * 5), this.bufferSizeInSamples = this.bufferSizeInFrames * this.targetNumberOfChannels, this.outputBuffer = new Float32Array(this.bufferSizeInSamples);
	}
	doChannelMixerSetup() {
		c(this.sourceNumberOfChannels !== null);
		let e = this.sourceNumberOfChannels, t = this.targetNumberOfChannels;
		e === 1 && t === 2 ? this.channelMixer = (t, n) => t[n * e] : e === 1 && t === 4 ? this.channelMixer = (t, n, r) => t[n * e] * +(r < 2) : e === 1 && t === 6 ? this.channelMixer = (t, n, r) => t[n * e] * +(r === 2) : e === 2 && t === 1 ? this.channelMixer = (t, n) => {
			let r = n * e;
			return .5 * (t[r] + t[r + 1]);
		} : e === 2 && t === 4 || e === 2 && t === 6 ? this.channelMixer = (t, n, r) => t[n * e + r] * +(r < 2) : e === 4 && t === 1 ? this.channelMixer = (t, n) => {
			let r = n * e;
			return .25 * (t[r] + t[r + 1] + t[r + 2] + t[r + 3]);
		} : e === 4 && t === 2 ? this.channelMixer = (t, n, r) => {
			let i = n * e;
			return .5 * (t[i + r] + t[i + r + 2]);
		} : e === 4 && t === 6 ? this.channelMixer = (t, n, r) => {
			let i = n * e;
			return r < 2 ? t[i + r] : r === 2 || r === 3 ? 0 : t[i + r - 2];
		} : e === 6 && t === 1 ? this.channelMixer = (t, n) => {
			let r = n * e;
			return Math.SQRT1_2 * (t[r] + t[r + 1]) + t[r + 2] + .5 * (t[r + 4] + t[r + 5]);
		} : e === 6 && t === 2 ? this.channelMixer = (t, n, r) => {
			let i = n * e;
			return t[i + r] + Math.SQRT1_2 * (t[i + 2] + t[i + r + 4]);
		} : e === 6 && t === 4 ? this.channelMixer = (t, n, r) => {
			let i = n * e;
			return r < 2 ? t[i + r] + Math.SQRT1_2 * t[i + 2] : t[i + r + 2];
		} : this.channelMixer = (t, n, r) => r < e ? t[n * e + r] : 0;
	}
	ensureTempBufferSize(e) {
		let t = this.tempSourceBuffer.length;
		for (; t < e;) t *= 2;
		if (t !== this.tempSourceBuffer.length) {
			let e = new Float32Array(t);
			e.set(this.tempSourceBuffer), this.tempSourceBuffer = e;
		}
	}
	async add(e) {
		this.sourceSampleRate === null && (this.sourceSampleRate = e.sampleRate, this.sourceNumberOfChannels = e.numberOfChannels, this.startTime = e.timestamp, this.tempSourceBuffer = new Float32Array(this.sourceSampleRate * this.sourceNumberOfChannels), this.doChannelMixerSetup()), c(this.startTime !== null);
		let t = e.numberOfFrames * e.numberOfChannels;
		this.ensureTempBufferSize(t);
		let n = e.allocationSize({
			planeIndex: 0,
			format: "f32"
		}), r = new Float32Array(this.tempSourceBuffer.buffer, 0, n / 4);
		e.copyTo(r, {
			planeIndex: 0,
			format: "f32"
		});
		let i = e.timestamp - this.startTime, a = i + e.duration, o = Math.floor((i - 1 / this.sourceSampleRate) * this.targetSampleRate) + 1, s = Math.ceil(a * this.targetSampleRate);
		for (let t = o; t < s; t++) {
			if (t < this.bufferStartFrame) continue;
			for (; t >= this.bufferStartFrame + this.bufferSizeInFrames;) await this.finalizeCurrentBuffer(), this.bufferStartFrame += this.bufferSizeInFrames;
			let n = t - this.bufferStartFrame;
			c(n < this.bufferSizeInFrames);
			let a = (t / this.targetSampleRate - i) * this.sourceSampleRate, o = Math.floor(a), s = Math.ceil(a), l = a - o;
			for (let t = 0; t < this.targetNumberOfChannels; t++) {
				let i = 0, a = 0;
				o >= 0 && o < e.numberOfFrames && (i = this.channelMixer(r, o, t)), s >= 0 && s < e.numberOfFrames && (a = this.channelMixer(r, s, t));
				let c = i + l * (a - i), u = n * this.targetNumberOfChannels + t;
				this.outputBuffer[u] += c;
			}
			this.maxWrittenFrame === null ? this.maxWrittenFrame = n : this.maxWrittenFrame = Math.max(this.maxWrittenFrame, n);
		}
	}
	async finalizeCurrentBuffer() {
		if (this.maxWrittenFrame === null) return;
		c(this.startTime !== null);
		let e = (this.maxWrittenFrame + 1) * this.targetNumberOfChannels, t = new Float32Array(e);
		t.set(this.outputBuffer.subarray(0, e));
		let n = new Eo({
			format: "f32",
			sampleRate: this.targetSampleRate,
			numberOfChannels: this.targetNumberOfChannels,
			timestamp: this.startTime + this.bufferStartFrame / this.targetSampleRate,
			data: t
		});
		await this.onSample(n), this.outputBuffer.fill(0), this.maxWrittenFrame = null;
	}
	finalize() {
		return this.finalizeCurrentBuffer();
	}
}, ru = function(e, t, n) {
	if (t != null) {
		if (typeof t != "object" && typeof t != "function") throw TypeError("Object expected.");
		var r, i;
		if (n) {
			if (!Symbol.asyncDispose) throw TypeError("Symbol.asyncDispose is not defined.");
			r = t[Symbol.asyncDispose];
		}
		if (r === void 0) {
			if (!Symbol.dispose) throw TypeError("Symbol.dispose is not defined.");
			r = t[Symbol.dispose], n && (i = r);
		}
		if (typeof r != "function") throw TypeError("Object not disposable.");
		i && (r = function() {
			try {
				i.call(this);
			} catch (e) {
				return Promise.reject(e);
			}
		}), e.stack.push({
			value: t,
			dispose: r,
			async: n
		});
	} else n && e.stack.push({ async: !0 });
	return t;
}, iu = (function(e) {
	return function(t) {
		function n(n) {
			t.error = t.hasError ? new e(n, t.error, "An error was suppressed during disposal.") : n, t.hasError = !0;
		}
		var r, i = 0;
		function a() {
			for (; r = t.stack.pop();) try {
				if (!r.async && i === 1) return i = 0, t.stack.push(r), Promise.resolve().then(a);
				if (r.dispose) {
					var e = r.dispose.call(r.value);
					if (r.async) return i |= 2, Promise.resolve(e).then(a, function(e) {
						return n(e), a();
					});
				} else i |= 1;
			} catch (e) {
				n(e);
			}
			if (i === 1) return t.hasError ? Promise.reject(t.error) : Promise.resolve();
			if (t.hasError) throw t.error;
		}
		return a();
	};
})(typeof SuppressedError == "function" ? SuppressedError : function(e, t, n) {
	var r = Error(n);
	return r.name = "SuppressedError", r.error = e, r.suppressed = t, r;
}), au = class {
	constructor() {
		this._connectedTrack = null, this._closingPromise = null, this._closed = !1;
	}
	_ensureValidAdd() {
		if (!this._connectedTrack) throw Error("Source is not connected to an output track.");
		if (this._connectedTrack.output.state === "canceled") throw Error("Output has been canceled.");
		if (this._connectedTrack.output.state === "finalizing" || this._connectedTrack.output.state === "finalized") throw Error("Output has been finalized.");
		if (this._connectedTrack.output.state === "pending") throw Error("Output has not started.");
		if (this._closed) throw Error("Source is closed.");
	}
	async _start() {}
	async _flushAndClose(e) {}
	close() {
		if (this._closingPromise) return;
		let e = this._connectedTrack;
		if (!e) throw Error("Cannot call close without connecting the source to an output track.");
		if (e.output.state === "pending") throw Error("Cannot call close before output has been started.");
		this._closingPromise = (async () => {
			await this._flushAndClose(!1), this._closed = !0, !(e.output.state === "finalizing" || e.output.state === "finalized") && e.output._muxer.onTrackClose(e);
		})();
	}
	async _flushOrWaitForOngoingClose(e) {
		return this._closingPromise ??= (async () => {
			await this._flushAndClose(e), this._closed = !0;
		})();
	}
}, ou = class extends au {
	constructor(e) {
		if (super(), this._connectedTrack = null, !pt.includes(e)) throw TypeError(`Invalid video codec '${e}'. Must be one of: ${pt.join(", ")}.`);
		this._codec = e;
	}
}, su = (e, t) => {
	if (e.metadata.hasOnlyKeyPackets && t.type !== "key") throw Error("Cannot add non-key packets to a hasOnlyKeyPackets video track.");
}, cu = class extends ou {
	constructor(e) {
		super(e);
	}
	add(e, t) {
		if (!(e instanceof N)) throw TypeError("packet must be an EncodedPacket.");
		if (e.isMetadataOnly) throw TypeError("Metadata-only packets cannot be added.");
		if (t !== void 0 && (!t || typeof t != "object")) throw TypeError("meta, when provided, must be an object.");
		return this._ensureValidAdd(), su(this._connectedTrack, e), this._connectedTrack.output._muxer.addEncodedVideoPacket(this._connectedTrack, e, t);
	}
}, lu = class {
	setError(e) {
		this.errorSet ||= (this.error = e, !0);
	}
	constructor(e, t) {
		this.source = e, this.encodingConfig = t, this.ensureEncoderPromise = null, this.encoderInitialized = !1, this.encoder = null, this.muxer = null, this.lastMultipleOfKeyFrameInterval = -1, this.emittedEncoderPackets = 0, this.codedWidth = null, this.codedHeight = null, this.outputWidth = null, this.outputHeight = null, this.frameRateLastSample = null, this.frameRateLastTimestamp = null, this.frameRateLastEndTimestamp = null, this.preciseTimings = [], this.customEncoder = null, this.customEncoderCallSerializer = new Me(), this.customEncoderQueueSize = 0, this.defaultEncodeOptions = {}, this.alphaEncoder = null, this.splitter = null, this.splitterCreationFailed = !1, this.alphaFrameQueue = [], this.error = null, this.errorSet = !1, this.lastMuxerPromise = Promise.resolve(), this.closed = !1;
	}
	async add(e, t, n) {
		let r = e;
		try {
			this.checkForEncoderError(), this.source._ensureValidAdd();
			let i = this.encodingConfig, a = i.sizeChangeBehavior ?? "deny", o = !1;
			if (this.codedWidth !== null && this.codedHeight !== null) {
				if ((e.codedWidth !== this.codedWidth || e.codedHeight !== this.codedHeight) && (o = !0, a === "deny")) throw Error(`Video sample size must remain constant. Expected ${this.codedWidth}x${this.codedHeight}, got ${e.codedWidth}x${e.codedHeight}. To allow the sample size to change over time, set \`sizeChangeBehavior\` to a value other than 'deny' in the encoding options.`);
			} else this.codedWidth = e.codedWidth, this.codedHeight = e.codedHeight;
			if (i.transform?.width !== void 0 || i.transform?.height !== void 0 || i.transform?.rotate !== void 0 || i.transform?.crop !== void 0 || i.transform?.force === !0 || o && a !== "passThrough") {
				let n = i.transform?.width, r = i.transform?.height, s = i.transform?.fit ?? "fill";
				o && a !== "passThrough" && (c(this.outputWidth), c(this.outputHeight), c(a !== "deny"), n = this.outputWidth, r = this.outputHeight, s = a);
				let l = await e.transform({
					width: n,
					height: r,
					roundDimensionsTo: 2,
					crop: i.transform?.crop,
					rotate: i.transform?.rotate,
					fit: s,
					alpha: i.alpha
				});
				(this.outputWidth === null || this.outputHeight === null) && (this.outputWidth = l.displayWidth, this.outputHeight = l.displayHeight), t && e.close(), e = l, t = !0;
			} else (this.outputWidth === null || this.outputHeight === null) && (this.outputWidth = e.codedWidth, this.outputHeight = e.codedHeight);
			let s = i.transform?.frameRate;
			if (s !== void 0) {
				let i = e.timestamp + e.duration, a = Ee(e.timestamp, s);
				if (this.frameRateLastSample !== null) if (a <= this.frameRateLastTimestamp) {
					this.frameRateLastSample.close(), this.frameRateLastSample = e.clone(), this.frameRateLastEndTimestamp = i;
					return;
				} else await this.padFrameRate(a, n);
				e === r && (e = e.clone(), t = !0), e.setTimestamp(a), e.setDuration(1 / s), this.frameRateLastSample?.close(), this.frameRateLastSample = e.clone(), this.frameRateLastTimestamp = a, this.frameRateLastEndTimestamp = i;
			}
			await this.processAndEncode(e, n);
		} finally {
			t && e.close();
		}
	}
	async processAndEncode(e, t) {
		let n = this.encodingConfig, r;
		if (n.transform?.process) {
			let t = n.transform.process(e);
			if (t instanceof Promise && (t = await t), t === null) return;
			Array.isArray(t) || (t = [t]);
			let i = [];
			try {
				for (let n of t) n instanceof so ? i.push(n) : typeof VideoFrame < "u" && n instanceof VideoFrame ? i.push(new so(n)) : i.push(new so(n, {
					timestamp: e.timestamp,
					duration: e.duration
				}));
			} catch (n) {
				for (let t of i) t !== e && t.close();
				for (let n of t) (n instanceof so && n !== e || typeof VideoFrame < "u" && n instanceof VideoFrame) && n.close();
				throw n;
			}
			r = i;
		} else r = [e];
		try {
			for (let e of r) {
				if (this.encoderInitialized || (this.ensureEncoderPromise || this.ensureEncoder(e), this.encoderInitialized || await this.ensureEncoderPromise), c(this.encoderInitialized), this.closed) break;
				let n = this.encodingConfig.keyFrameInterval ?? 2, r = Math.floor(e.timestamp / n), i = {
					...this.defaultEncodeOptions,
					...e.encodeOptions,
					...t
				}, a = {
					...i,
					keyFrame: i.keyFrame === void 0 ? n === 0 || r !== this.lastMultipleOfKeyFrameInterval : i.keyFrame
				};
				if (this.lastMultipleOfKeyFrameInterval = r, this.encodingConfig.onEncodedSample?.(e), this.customEncoder) {
					this.customEncoderQueueSize++;
					let t = e.clone(), n = this.customEncoderCallSerializer.call(() => this.customEncoder.encode(t, a)).catch((e) => this.setError(e)).finally(() => {
						this.customEncoderQueueSize--, t.close();
					});
					this.customEncoderQueueSize >= 4 && await n;
				} else {
					c(this.encoder);
					let t = e.toVideoFrame(), n = w(this.preciseTimings, t.timestamp, (e) => e.microsecondTimestamp), r = n === -1 ? null : this.preciseTimings[n];
					if (r && r.microsecondTimestamp === t.timestamp ? (r.timestamp !== e.timestamp && (r.timestampIsValid = !1), r.duration !== e.duration && (r.durationIsValid = !1)) : (this.preciseTimings.splice(n + 1, 0, {
						microsecondTimestamp: t.timestamp,
						timestamp: e.timestamp,
						duration: e.duration,
						timestampIsValid: !0,
						durationIsValid: !0
					}), this.preciseTimings.length > 128 && this.preciseTimings.shift()), !this.alphaEncoder) try {
						this.encoder.encode(t, a);
					} finally {
						t.close();
					}
					else if (t.format && !t.format.includes("A") || this.splitterCreationFailed) {
						this.alphaFrameQueue.push(null);
						try {
							this.encoder.encode(t, a);
						} finally {
							t.close();
						}
					} else {
						this.splitter ||= new du();
						let { colorFrame: e, alphaFrame: n } = await this.splitter.split(t);
						this.alphaFrameQueue.push(n);
						try {
							this.encoder.encode(e, a);
						} finally {
							e.close();
						}
					}
					this.encoder.encodeQueueSize >= 4 && await new Promise((e) => this.encoder.addEventListener("dequeue", e, { once: !0 }));
				}
				await this.lastMuxerPromise;
			}
		} finally {
			for (let t of r) t !== e && t.close();
		}
	}
	async padFrameRate(e, t) {
		let n = this.encodingConfig.transform.frameRate;
		c(this.frameRateLastSample);
		let r = Math.round((e - this.frameRateLastTimestamp) * n);
		for (let e = 1; e < r; e++) {
			let r = {
				stack: [],
				error: void 0,
				hasError: !1
			};
			try {
				let i = ru(r, this.frameRateLastSample.clone(), !1);
				i.setTimestamp(this.frameRateLastTimestamp + e / n), i.setDuration(1 / n), await this.processAndEncode(i, t);
			} catch (e) {
				r.error = e, r.hasError = !0;
			} finally {
				iu(r);
			}
		}
	}
	ensureEncoder(e) {
		this.ensureEncoderPromise = (async () => {
			let t = Yo(this.encodingConfig.quality, this.encodingConfig.bitrate);
			c(t !== void 0);
			let n = Lo({
				...this.encodingConfig,
				quality: t,
				width: e.codedWidth,
				height: e.codedHeight,
				squarePixelWidth: e.squarePixelWidth,
				squarePixelHeight: e.squarePixelHeight,
				framerate: this.source._connectedTrack?.metadata.frameRate
			}), r = null, i;
			for (let e of n) {
				let t = e.config;
				if (this.encodingConfig.onEncoderConfig?.(t), i = Qo.find((e) => e.supports(this.encodingConfig.codec, t)), i) {
					r = e;
					break;
				}
				if (!(typeof VideoEncoder > "u")) {
					if (t.alpha = "discard", this.encodingConfig.alpha === "keep" && (t.latencyMode = "quality"), (t.width % 2 == 1 || t.height % 2 == 1) && (this.encodingConfig.codec === "avc" || this.encodingConfig.codec === "hevc")) throw Error(`The dimensions ${t.width}x${t.height} are not supported for codec '${this.encodingConfig.codec}'; both width and height must be even numbers. Make sure to round your dimensions to the nearest even number.`);
					if ((await VideoEncoder.isConfigSupported(t)).supported) {
						r = e;
						break;
					}
				}
			}
			if (!r) {
				if (typeof VideoEncoder > "u") throw Error("VideoEncoder is not supported by this browser.");
				let e = n[0].config, t = n.map(({ config: e, quantizer: t }) => t === null ? `${e.bitrate} bps` : `quantizer ${t}`);
				throw Error(`This specific encoder configuration (${e.codec}, ${t.join(" / ")}, ${e.width}x${e.height}, hardware acceleration: ${e.hardwareAcceleration ?? "no-preference"}) is not supported by this browser. Consider using another codec or changing your video parameters.`);
			}
			let a = r.config;
			if (r.quantizer !== null && (this.defaultEncodeOptions = Ko(this.encodingConfig.codec, r.quantizer)), i) this.customEncoder = new i(), this.customEncoder.codec = this.encodingConfig.codec, this.customEncoder.config = a, this.customEncoder.onPacket = (e, t) => {
				if (!(e instanceof N)) throw TypeError("The first argument passed to onPacket must be an EncodedPacket.");
				if (t !== void 0 && (!t || typeof t != "object")) throw TypeError("The second argument passed to onPacket must be an object or undefined.");
				su(this.source._connectedTrack, e), this.encodingConfig.onEncodedPacket?.(e, t), this.lastMuxerPromise = this.muxer.addEncodedVideoPacket(this.source._connectedTrack, e, t).catch((e) => {
					this.setError(e);
				});
			}, this.customEncoder.onError = (e) => {
				this.setError(e);
			}, await this.customEncoder.init();
			else {
				let e = [], t = [], n = 0, r = 0, i = (e, t, n) => {
					let r = {};
					if (t) {
						let e = new Uint8Array(t.byteLength);
						t.copyTo(e), r.alpha = e;
					}
					let i = N.fromEncodedChunk(e, r), a = w(this.preciseTimings, e.timestamp, (e) => e.microsecondTimestamp), o = a === -1 ? null : this.preciseTimings[a], s = null;
					this.emittedEncoderPackets === 0 && i.type === "delta" && n?.decoderConfig && (s = zn(this.encodingConfig.codec, n.decoderConfig, i.data)), (o && o.microsecondTimestamp === e.timestamp || s !== null) && (i = i.clone({
						timestamp: o?.timestampIsValid ? o.timestamp : void 0,
						duration: o?.durationIsValid ? o.duration : void 0,
						type: s ?? void 0
					})), su(this.source._connectedTrack, i), this.encodingConfig.onEncodedPacket?.(i, n), this.lastMuxerPromise = this.muxer.addEncodedVideoPacket(this.source._connectedTrack, i, n).catch((e) => {
						this.setError(e);
					}), this.emittedEncoderPackets++;
				}, o = (/* @__PURE__ */ Error("Encoding error")).stack;
				if (this.encoder = new VideoEncoder({
					output: (a, o) => {
						if (!this.alphaEncoder) {
							i(a, null, o);
							return;
						}
						let s = this.alphaFrameQueue.shift();
						c(s !== void 0), s ? (this.alphaEncoder.encode(s, {
							...this.defaultEncodeOptions,
							keyFrame: a.type === "key"
						}), r++, s.close(), e.push({
							chunk: a,
							meta: o
						})) : r === 0 ? i(a, null, o) : (t.push(n + r), e.push({
							chunk: a,
							meta: o
						}));
					},
					error: (e) => {
						e.stack = o, this.setError(e);
					}
				}), this.encoder.configure(a), this.encodingConfig.alpha === "keep") {
					let o = (/* @__PURE__ */ Error("Encoding error")).stack;
					this.alphaEncoder = new VideoEncoder({
						output: (a, o) => {
							r--;
							let s = e.shift();
							for (c(s !== void 0), i(s.chunk, a, s.meta), n++; t.length > 0 && t[0] === n;) {
								t.shift();
								let n = e.shift();
								c(n !== void 0), i(n.chunk, null, n.meta);
							}
						},
						error: (e) => {
							e.stack = o, this.setError(e);
						}
					}), this.alphaEncoder.configure(a);
				}
			}
			c(this.source._connectedTrack), this.muxer = this.source._connectedTrack.output._muxer, this.encoderInitialized = !0;
		})();
	}
	async flushAndClose(e) {
		try {
			if (!e && (this.checkForEncoderError(), this.frameRateLastSample)) {
				let e = this.encodingConfig.transform.frameRate, t = Ee(this.frameRateLastEndTimestamp, e);
				await this.padFrameRate(t);
			}
			this.closed = !0, e || (this.customEncoder ? this.customEncoderCallSerializer.call(() => this.customEncoder.flush()) : this.encoder && (await this.encoder.flush(), await this.alphaEncoder?.flush(), await $e(25)));
		} finally {
			this.closed = !0, this.frameRateLastSample?.close(), this.frameRateLastSample = null, this.customEncoder ? await this.customEncoderCallSerializer.call(() => this.customEncoder.close()).catch((e) => this.setError(e)) : this.encoder && (this.encoder.state !== "closed" && this.encoder.close(), this.alphaEncoder && this.alphaEncoder.state !== "closed" && this.alphaEncoder.close(), this.alphaFrameQueue.forEach((e) => e?.close()), this.alphaFrameQueue.length = 0, this.splitter?.close());
		}
		e || this.checkForEncoderError();
	}
	getQueueSize() {
		return this.customEncoder ? this.customEncoderQueueSize : this.encoder?.encodeQueueSize ?? 0;
	}
	checkForEncoderError() {
		if (this.errorSet) throw this.error;
	}
}, uu = null, du = class {
	constructor() {
		this.worker = null, this.pendingRequests = /* @__PURE__ */ new Map(), this.nextRequestId = 0;
	}
	split(e) {
		if (!this.worker) {
			if (!uu) {
				let e = new Blob([`(${fu.toString()})()`], { type: "application/javascript" });
				uu = URL.createObjectURL(e);
			}
			this.worker = new Worker(uu), this.worker.addEventListener("message", (e) => {
				let t = e.data, n = this.pendingRequests.get(t.id);
				n && (this.pendingRequests.delete(t.id), "error" in t ? n.reject(Error(t.error)) : n.resolve({
					colorFrame: t.colorFrame,
					alphaFrame: t.alphaFrame
				}));
			}), this.worker.addEventListener("error", (e) => {
				let t = Error(e.message || "Color/alpha splitter worker error.");
				for (let e of this.pendingRequests.values()) e.reject(t);
				this.pendingRequests.clear();
			});
		}
		let t = this.nextRequestId++, n = T();
		return this.pendingRequests.set(t, n), this.worker.postMessage({
			id: t,
			sourceFrame: e
		}, { transfer: [e] }), n.promise;
	}
	close() {
		this.worker?.terminate(), this.worker = null;
		let e = /* @__PURE__ */ Error("Color/alpha splitter closed.");
		for (let t of this.pendingRequests.values()) t.reject(e);
		this.pendingRequests.clear();
	}
}, fu = () => {
	let e = null, t = Promise.resolve();
	self.addEventListener("message", (e) => {
		let { id: r, sourceFrame: i } = e.data;
		t = t.then(async () => {
			try {
				let { colorFrame: e, alphaFrame: t } = await n(i);
				self.postMessage({
					id: r,
					colorFrame: e,
					alphaFrame: t
				}, { transfer: [e, t] });
			} catch (e) {
				self.postMessage({
					id: r,
					error: e.message
				});
			} finally {
				i.close();
			}
		});
	});
	let n = async (t) => {
		let n = t.format;
		if (!n) throw Error("CPU color/alpha splitting requires a known VideoFrame format.");
		let a = t.allocationSize();
		if ((!e || e.byteLength !== a) && (e = new Uint8Array(a)), await t.copyTo(e), n === "RGBA" || n === "BGRA") return r(e, n, t);
		if (n === "I420A" || n === "I420AP10" || n === "I420AP12" || n === "I422A" || n === "I422AP10" || n === "I422AP12" || n === "I444A" || n === "I444AP10" || n === "I444AP12") return i(e, n, t);
		throw Error(`CPU color/alpha splitting does not support format '${n}'.`);
	}, r = (e, t, n) => {
		let r = n.visibleRect?.width ?? n.codedWidth, i = n.visibleRect?.height ?? n.codedHeight, a = r * i, o = a + Math.ceil(r / 2) * Math.ceil(i / 2) * 2, s = new Uint8Array(o);
		for (let t = 0, n = 3; t < a; t++, n += 4) s[t] = e[n];
		s.fill(128, a);
		let c = new VideoFrame(e, {
			format: t === "RGBA" ? "RGBX" : "BGRX",
			codedWidth: r,
			codedHeight: i,
			timestamp: n.timestamp,
			duration: n.duration ?? void 0
		}), l = {
			format: "I420",
			codedWidth: r,
			codedHeight: i,
			timestamp: n.timestamp,
			duration: n.duration ?? void 0,
			transfer: [s.buffer]
		};
		return {
			colorFrame: c,
			alphaFrame: new VideoFrame(s, l)
		};
	}, i = (e, t, n) => {
		let r = n.visibleRect?.width ?? n.codedWidth, i = n.visibleRect?.height ?? n.codedHeight, a = t.includes("P10"), o = t.includes("P12"), s = a || o ? 2 : 1, c, l;
		t.startsWith("I420") ? (c = Math.ceil(r / 2), l = Math.ceil(i / 2)) : t.startsWith("I422") ? (c = Math.ceil(r / 2), l = i) : (c = r, l = i);
		let u = r * i, d = c * l, f = u * s, p = d * s, m = u * s, h = f + p * 2, g = t.replace("A", ""), _ = Math.ceil(r / 2) * Math.ceil(i / 2), v = m + _ * s * 2, y = new Uint8Array(v), b = h;
		y.set(e.subarray(b, b + m), 0);
		let x = m, S = a ? 512 : o ? 2048 : 128;
		s === 1 ? y.fill(S, x) : new Uint16Array(y.buffer, x, 2 * _).fill(S);
		let C = a ? "I420P10" : o ? "I420P12" : "I420", ee = new VideoFrame(e.subarray(0, h), {
			format: g,
			codedWidth: r,
			codedHeight: i,
			timestamp: n.timestamp,
			duration: n.duration ?? void 0
		}), te = {
			format: C,
			codedWidth: r,
			codedHeight: i,
			timestamp: n.timestamp,
			duration: n.duration ?? void 0,
			transfer: [y.buffer]
		};
		return {
			colorFrame: ee,
			alphaFrame: new VideoFrame(y, te)
		};
	};
}, pu = class extends ou {
	constructor(e, t) {
		if (!(typeof HTMLCanvasElement < "u" && e instanceof HTMLCanvasElement) && !(typeof OffscreenCanvas < "u" && e instanceof OffscreenCanvas)) throw TypeError("canvas must be an HTMLCanvasElement or OffscreenCanvas.");
		Fo(t), super(t.codec), this._encoder = new lu(this, t), this._canvas = e;
	}
	add(e, t = 0, n) {
		if (!Number.isFinite(e) || e < 0) throw TypeError("timestamp must be a non-negative number.");
		if (!Number.isFinite(t) || t < 0) throw TypeError("duration must be a non-negative number.");
		let r = new so(this._canvas, {
			timestamp: e,
			duration: t
		});
		return this._encoder.add(r, !0, n);
	}
	_flushAndClose(e) {
		return this._encoder.flushAndClose(e);
	}
}, mu = class extends au {
	constructor(e) {
		if (super(), this._connectedTrack = null, !ht.includes(e)) throw TypeError(`Invalid audio codec '${e}'. Must be one of: ${ht.join(", ")}.`);
		this._codec = e;
	}
}, hu = class extends mu {
	constructor(e) {
		super(e);
	}
	add(e, t) {
		if (!(e instanceof N)) throw TypeError("packet must be an EncodedPacket.");
		if (e.isMetadataOnly) throw TypeError("Metadata-only packets cannot be added.");
		if (t !== void 0 && (!t || typeof t != "object")) throw TypeError("meta, when provided, must be an object.");
		return this._ensureValidAdd(), this._connectedTrack.output._muxer.addEncodedAudioPacket(this._connectedTrack, e, t);
	}
}, gu = class {
	setError(e) {
		this.errorSet ||= (this.error = e, !0);
	}
	constructor(e, t) {
		this.source = e, this.encodingConfig = t, this.ensureEncoderPromise = null, this.encoderInitialized = !1, this.encoder = null, this.muxer = null, this.lastNumberOfChannels = null, this.lastSampleRate = null, this.isPcmEncoder = !1, this.outputSampleSize = null, this.writeOutputValue = null, this.customEncoder = null, this.customEncoderCallSerializer = new Me(), this.customEncoderQueueSize = 0, this.lastEndSampleIndex = null, this.resampler = null, this.error = null, this.errorSet = !1, this.lastMuxerPromise = Promise.resolve(), this.closed = !1;
	}
	async add(e, t) {
		try {
			if (this.checkForEncoderError(), this.source._ensureValidAdd(), this.lastNumberOfChannels !== null && this.lastSampleRate !== null) {
				if (e.numberOfChannels !== this.lastNumberOfChannels || e.sampleRate !== this.lastSampleRate) throw Error(`Audio parameters must remain constant. Expected ${this.lastNumberOfChannels} channels at ${this.lastSampleRate} Hz, got ${e.numberOfChannels} channels at ${e.sampleRate} Hz.`);
			} else this.lastNumberOfChannels = e.numberOfChannels, this.lastSampleRate = e.sampleRate;
			let n = this.encodingConfig;
			n.transform?.numberOfChannels !== void 0 || n.transform?.sampleRate !== void 0 ? (this.resampler ||= new nu({
				targetNumberOfChannels: n.transform.numberOfChannels ?? e.numberOfChannels,
				targetSampleRate: n.transform.sampleRate ?? e.sampleRate,
				onSample: async (e) => {
					await this.processAndEncode(e, !0);
				}
			}), await this.resampler.add(e)) : await this.processAndEncode(e, t);
		} finally {
			t && e.close();
		}
	}
	async processAndEncode(e, t) {
		let n = this.encodingConfig;
		if (n.transform?.sampleFormat !== void 0 && Mo(e.format) !== n.transform.sampleFormat) {
			let r = Po(e, n.transform.sampleFormat);
			t && e.close(), e = r, t = !0;
		}
		if (n.transform?.process) try {
			let t = n.transform.process(e);
			if (t instanceof Promise && (t = await t), t === null) return;
			Array.isArray(t) || (t = [t]);
			try {
				for (let e of t) if (!(e instanceof Eo)) throw TypeError("The audio process function must return an AudioSample, null, or an array of AudioSamples.");
				for (let e of t) await this.encodeSample(e, !0);
			} finally {
				for (let e of t) e instanceof Eo && e.close();
			}
		} finally {
			t && e.close();
		}
		else await this.encodeSample(e, t);
	}
	async encodeSample(e, t) {
		try {
			if (this.encoderInitialized || (this.ensureEncoderPromise || this.ensureEncoder(e), this.encoderInitialized || await this.ensureEncoderPromise), c(this.encoderInitialized), this.closed) return;
			{
				let t = Math.round(e.timestamp * e.sampleRate), n = Math.round((e.timestamp + e.duration) * e.sampleRate);
				if (this.lastEndSampleIndex === null) this.lastEndSampleIndex = n;
				else {
					let n = t - this.lastEndSampleIndex;
					if (n >= 64) {
						let t = new Eo({
							data: new Float32Array(n * e.numberOfChannels),
							format: "f32-planar",
							sampleRate: e.sampleRate,
							numberOfChannels: e.numberOfChannels,
							numberOfFrames: n,
							timestamp: this.lastEndSampleIndex / e.sampleRate
						});
						await this.encodeSample(t, !0);
					}
					this.lastEndSampleIndex += e.numberOfFrames;
				}
			}
			if (this.encodingConfig.onEncodedSample?.(e), this.customEncoder) {
				this.customEncoderQueueSize++;
				let t = e.clone(), n = this.customEncoderCallSerializer.call(() => this.customEncoder.encode(t)).catch((e) => this.setError(e)).finally(() => {
					this.customEncoderQueueSize--, t.close();
				});
				this.customEncoderQueueSize >= 4 && await n, await this.lastMuxerPromise;
			} else if (this.isPcmEncoder) await this.doPcmEncoding(e, t);
			else {
				c(this.encoder);
				let n = e.toAudioData();
				this.encoder.encode(n), n.close(), t && e.close(), this.encoder.encodeQueueSize >= 4 && await new Promise((e) => this.encoder.addEventListener("dequeue", e, { once: !0 })), await this.lastMuxerPromise;
			}
		} finally {
			t && e.close();
		}
	}
	async doPcmEncoding(e, t) {
		c(this.outputSampleSize), c(this.writeOutputValue);
		let { numberOfChannels: n, numberOfFrames: r, sampleRate: i, timestamp: a } = e, o = 2048, s = [];
		for (let t = 0; t < r; t += o) {
			let r = Math.min(o, e.numberOfFrames - t), i = r * n * this.outputSampleSize, a = new ArrayBuffer(i), c = new DataView(a);
			s.push({
				frameCount: r,
				view: c
			});
		}
		let l = e.allocationSize({
			planeIndex: 0,
			format: "f32-planar"
		}), u = new Float32Array(l / Float32Array.BYTES_PER_ELEMENT);
		for (let t = 0; t < n; t++) {
			e.copyTo(u, {
				planeIndex: t,
				format: "f32-planar"
			});
			for (let e = 0; e < s.length; e++) {
				let { frameCount: r, view: i } = s[e];
				for (let a = 0; a < r; a++) this.writeOutputValue(i, (a * n + t) * this.outputSampleSize, u[e * o + a]);
			}
		}
		t && e.close();
		let d = { decoderConfig: {
			codec: this.encodingConfig.codec,
			numberOfChannels: n,
			sampleRate: i
		} };
		for (let e = 0; e < s.length; e++) {
			let { frameCount: t, view: n } = s[e], r = n.buffer, c = e * o, l = new N(new Uint8Array(r), "key", a + c / i, t / i);
			this.encodingConfig.onEncodedPacket?.(l, d), await this.muxer.addEncodedAudioPacket(this.source._connectedTrack, l, d);
		}
	}
	ensureEncoder(e) {
		this.ensureEncoderPromise = (async () => {
			let { numberOfChannels: t, sampleRate: n } = e, r = Yo(this.encodingConfig.quality, this.encodingConfig.bitrate), i = Bo({
				numberOfChannels: t,
				sampleRate: n,
				...this.encodingConfig,
				quality: r
			});
			this.encodingConfig.onEncoderConfig?.(i);
			let a = $o.find((e) => e.supports(this.encodingConfig.codec, i));
			if (a) this.customEncoder = new a(), this.customEncoder.codec = this.encodingConfig.codec, this.customEncoder.config = i, this.customEncoder.onPacket = (e, t) => {
				if (!(e instanceof N)) throw TypeError("The first argument passed to onPacket must be an EncodedPacket.");
				if (t !== void 0 && (!t || typeof t != "object")) throw TypeError("The second argument passed to onPacket must be an object or undefined.");
				this.encodingConfig.onEncodedPacket?.(e, t), this.lastMuxerPromise = this.muxer.addEncodedAudioPacket(this.source._connectedTrack, e, t).catch((e) => {
					this.setError(e);
				});
			}, this.customEncoder.onError = (e) => {
				this.setError(e);
			}, await this.customEncoder.init();
			else if (k.includes(this.encodingConfig.codec)) this.initPcmEncoder();
			else {
				if (typeof AudioEncoder > "u") throw Error("AudioEncoder is not supported by this browser.");
				if (!(await AudioEncoder.isConfigSupported(i)).supported) throw Error(`This specific encoder configuration (${i.codec}, ${i.bitrate} bps, ${i.numberOfChannels} channels, ${i.sampleRate} Hz) is not supported by this browser. Consider using another codec or changing your audio parameters.`);
				let e = (/* @__PURE__ */ Error("Encoding error")).stack;
				this.encoder = new AudioEncoder({
					output: (e, t) => {
						if (this.encodingConfig.codec === "aac" && t?.decoderConfig) {
							let e = !1;
							if (e = !t.decoderConfig.description || t.decoderConfig.description.byteLength < 2 ? !0 : dt(m(t.decoderConfig.description)).objectType === 0, e) {
								let e = Number(u(i.codec.split(".")));
								t.decoderConfig.description = ft({
									objectType: e,
									numberOfChannels: t.decoderConfig.numberOfChannels,
									sampleRate: t.decoderConfig.sampleRate
								});
							}
						}
						let n = N.fromEncodedChunk(e);
						n = n.clone({
							timestamp: we(n.timestamp, i.sampleRate),
							duration: e.duration == null ? void 0 : we(n.duration, i.sampleRate)
						}), this.encodingConfig.onEncodedPacket?.(n, t), this.lastMuxerPromise = this.muxer.addEncodedAudioPacket(this.source._connectedTrack, n, t).catch((e) => {
							this.setError(e);
						});
					},
					error: (t) => {
						t.stack = e, this.setError(t);
					}
				}), this.encoder.configure(i);
			}
			c(this.source._connectedTrack), this.muxer = this.source._connectedTrack.output._muxer, this.encoderInitialized = !0;
		})();
	}
	initPcmEncoder() {
		this.isPcmEncoder = !0;
		let e = this.encodingConfig.codec, { dataType: t, sampleSize: n, littleEndian: r } = Mt(e);
		switch (this.outputSampleSize = n, n) {
			case 1:
				t === "unsigned" ? this.writeOutputValue = (e, t, n) => e.setUint8(t, E((n + 1) * 127.5, 0, 255)) : t === "signed" ? this.writeOutputValue = (e, t, n) => {
					e.setInt8(t, E(Math.round(n * 128), -128, 127));
				} : t === "ulaw" ? this.writeOutputValue = (e, t, n) => {
					let r = E(Math.floor(n * 32767), -32768, 32767);
					e.setUint8(t, es(r));
				} : t === "alaw" ? this.writeOutputValue = (e, t, n) => {
					let r = E(Math.floor(n * 32767), -32768, 32767);
					e.setUint8(t, ns(r));
				} : c(!1);
				break;
			case 2:
				t === "unsigned" ? this.writeOutputValue = (e, t, n) => e.setUint16(t, E((n + 1) * 32767.5, 0, 65535), r) : t === "signed" ? this.writeOutputValue = (e, t, n) => e.setInt16(t, E(Math.round(n * 32767), -32768, 32767), r) : c(!1);
				break;
			case 3:
				t === "unsigned" ? this.writeOutputValue = (e, t, n) => ve(e, t, E((n + 1) * 8388607.5, 0, 16777215), r) : t === "signed" ? this.writeOutputValue = (e, t, n) => ye(e, t, E(Math.round(n * 8388607), -8388608, 8388607), r) : c(!1);
				break;
			case 4:
				t === "unsigned" ? this.writeOutputValue = (e, t, n) => e.setUint32(t, E((n + 1) * 2147483647.5, 0, 4294967295), r) : t === "signed" ? this.writeOutputValue = (e, t, n) => e.setInt32(t, E(Math.round(n * 2147483647), -2147483648, 2147483647), r) : t === "float" ? this.writeOutputValue = (e, t, n) => e.setFloat32(t, n, r) : c(!1);
				break;
			case 8:
				t === "float" ? this.writeOutputValue = (e, t, n) => e.setFloat64(t, n, r) : c(!1);
				break;
			default: he(n), c(!1);
		}
	}
	async flushAndClose(e) {
		try {
			e || (this.checkForEncoderError(), this.resampler && await this.resampler.finalize()), this.closed = !0, e || (this.customEncoder ? this.customEncoderCallSerializer.call(() => this.customEncoder.flush()) : this.encoder && await this.encoder.flush());
		} finally {
			this.closed = !0, this.resampler = null, this.customEncoder ? await this.customEncoderCallSerializer.call(() => this.customEncoder.close()).catch((e) => this.setError(e)) : this.encoder && this.encoder.state !== "closed" && this.encoder.close();
		}
		e || this.checkForEncoderError();
	}
	getQueueSize() {
		return this.customEncoder ? this.customEncoderQueueSize : this.isPcmEncoder ? 0 : this.encoder?.encodeQueueSize ?? 0;
	}
	checkForEncoderError() {
		if (this.errorSet) throw this.error;
	}
}, _u = class extends mu {
	constructor(e) {
		Ro(e), super(e.codec), this._accumulatedTime = 0, this._encoder = new gu(this, e);
	}
	async add(e) {
		if (!(e instanceof AudioBuffer)) throw TypeError("audioBuffer must be an AudioBuffer.");
		let t = Eo._fromAudioBuffer(e, this._accumulatedTime);
		this._accumulatedTime += e.duration;
		for (let e of t) await this._encoder.add(e, !0);
	}
	_flushAndClose(e) {
		return this._encoder.flushAndClose(e);
	}
}, vu = class extends au {
	constructor(e) {
		if (super(), this._connectedTrack = null, !gt.includes(e)) throw TypeError(`Invalid subtitle codec '${e}'. Must be one of: ${gt.join(", ")}.`);
		this._codec = e;
	}
}, yu = class {
	getSupportedVideoCodecs() {
		return this.getSupportedCodecs().filter((e) => pt.includes(e));
	}
	getSupportedAudioCodecs() {
		return this.getSupportedCodecs().filter((e) => ht.includes(e));
	}
	getSupportedSubtitleCodecs() {
		return this.getSupportedCodecs().filter((e) => gt.includes(e));
	}
	_codecUnsupportedHint(e) {
		return "";
	}
}, bu = class extends yu {
	constructor(e = {}) {
		if (!e || typeof e != "object") throw TypeError("options must be an object.");
		if (e.fastStart !== void 0 && ![
			!1,
			"in-memory",
			"reserve",
			"fragmented"
		].includes(e.fastStart)) throw TypeError("options.fastStart, when provided, must be false, 'in-memory', 'reserve', or 'fragmented'.");
		if (e.minimumFragmentDuration !== void 0 && (!Number.isFinite(e.minimumFragmentDuration) || e.minimumFragmentDuration < 0)) throw TypeError("options.minimumFragmentDuration, when provided, must be a non-negative number.");
		if (e.onFtyp !== void 0 && typeof e.onFtyp != "function") throw TypeError("options.onFtyp, when provided, must be a function.");
		if (e.onMoov !== void 0 && typeof e.onMoov != "function") throw TypeError("options.onMoov, when provided, must be a function.");
		if (e.onMdat !== void 0 && typeof e.onMdat != "function") throw TypeError("options.onMdat, when provided, must be a function.");
		if (e.onMoof !== void 0 && typeof e.onMoof != "function") throw TypeError("options.onMoof, when provided, must be a function.");
		if (e.metadataFormat !== void 0 && ![
			"mdir",
			"mdta",
			"udta",
			"auto"
		].includes(e.metadataFormat)) throw TypeError("options.metadataFormat, when provided, must be either 'auto', 'mdir', 'mdta', or 'udta'.");
		super(), this._options = e;
	}
	getSupportedTrackCounts() {
		let e = 2 ** 32 - 1;
		return {
			video: {
				min: 0,
				max: e
			},
			audio: {
				min: 0,
				max: e
			},
			subtitle: {
				min: 0,
				max: e
			},
			total: {
				min: 1,
				max: e
			}
		};
	}
	get supportsVideoRotationMetadata() {
		return !0;
	}
	get supportsTimestampedMediaData() {
		return !0;
	}
	_createMuxer(e) {
		return new tu(e, this);
	}
}, xu = class extends bu {
	constructor(e) {
		super(e);
	}
	get _name() {
		return "MP4";
	}
	get fileExtension() {
		return ".mp4";
	}
	get mimeType() {
		return "video/mp4";
	}
	getSupportedCodecs() {
		return [
			...pt,
			...mt,
			"pcm-s16",
			"pcm-s16be",
			"pcm-s24",
			"pcm-s24be",
			"pcm-s32",
			"pcm-s32be",
			"pcm-f32",
			"pcm-f32be",
			"pcm-f64",
			"pcm-f64be",
			...gt
		];
	}
	_codecUnsupportedHint(e) {
		return new Cu().getSupportedCodecs().includes(e) ? " Switching to MOV will grant support for this codec." : "";
	}
}, Su = class extends bu {
	constructor(e) {
		super(e);
	}
	get _name() {
		return "CMAF";
	}
	get fileExtension() {
		return ".m4s";
	}
	get mimeType() {
		return "video/mp4";
	}
	getSupportedCodecs() {
		return [
			...pt,
			...mt,
			"pcm-s16",
			"pcm-s16be",
			"pcm-s24",
			"pcm-s24be",
			"pcm-s32",
			"pcm-s32be",
			"pcm-f32",
			"pcm-f32be",
			"pcm-f64",
			"pcm-f64be",
			...gt
		];
	}
}, Cu = class extends bu {
	constructor(e) {
		super(e);
	}
	get _name() {
		return "MOV";
	}
	get fileExtension() {
		return ".mov";
	}
	get mimeType() {
		return "video/quicktime";
	}
	getSupportedCodecs() {
		return [...pt, ...ht];
	}
	_codecUnsupportedHint(e) {
		return new xu().getSupportedCodecs().includes(e) ? " Switching to MP4 will grant support for this codec." : "";
	}
}, wu = [
	"video",
	"audio",
	"subtitle"
], Tu = class e {
	constructor(e, t, n, r, i) {
		this.id = e, this.output = t, this.type = n, this.source = r, this.metadata = i;
	}
	isVideoTrack() {
		return this.type === "video";
	}
	isAudioTrack() {
		return this.type === "audio";
	}
	isSubtitleTrack() {
		return this.type === "subtitle";
	}
	canBePairedWith(t) {
		if (!(t instanceof e)) throw TypeError("other must be an OutputTrack.");
		if (this === t) return !1;
		let n = et(this.metadata.group), r = et(t.metadata.group);
		for (let e of n) if (this.type !== t.type && r.some((t) => e === t) || r.some((t) => e._pairedGroups.has(t))) return !0;
		return !1;
	}
}, Eu = class extends Tu {
	constructor(e, t, n, r) {
		super(e, t, "video", n, r);
	}
}, Du = class extends Tu {
	constructor(e, t, n, r) {
		super(e, t, "audio", n, r);
	}
}, Ou = class extends Tu {
	constructor(e, t, n, r) {
		super(e, t, "subtitle", n, r);
	}
}, ku = class e {
	constructor() {
		this._pairedGroups = /* @__PURE__ */ new Set();
	}
	pairWith(t) {
		if (!(t instanceof e)) throw TypeError("other must be an OutputTrackGroup.");
		if (this === t) throw TypeError("Cannot pair a group with itself.");
		this._pairedGroups.add(t), t._pairedGroups.add(this);
	}
}, Au = (e) => {
	if (!e || typeof e != "object") throw TypeError("metadata must be an object.");
	if (e.languageCode !== void 0 && !ke(e.languageCode)) throw TypeError("metadata.languageCode, when provided, must be a three-letter, ISO 639-2/T language code.");
	if (e.name !== void 0 && typeof e.name != "string") throw TypeError("metadata.name, when provided, must be a string.");
	if (e.disposition !== void 0 && ct(e.disposition), e.maximumPacketCount !== void 0 && (!Number.isInteger(e.maximumPacketCount) || e.maximumPacketCount < 0)) throw TypeError("metadata.maximumPacketCount, when provided, must be a non-negative integer.");
	if (e.group !== void 0 && !(e.group instanceof ku) && (!Array.isArray(e.group) || e.group.some((e) => !(e instanceof ku)))) throw TypeError("metadata.group, when provided, must be an OutputTrackGroup instance or an array of OutputTrackGroup instances.");
}, ju = class extends tt {
	get target() {
		let e = "Output.target cannot be used when using PathedTarget with an async callback. Use the 'target' event instead.";
		if (this._rootTargetPromise) throw TypeError(e);
		let t = this._getRootTarget();
		if (t instanceof Promise) throw TypeError(e);
		return t;
	}
	constructor(e) {
		if (super(), this.state = "pending", this.defaultTrackGroup = new ku(), this.tracks = [], this._onFinalize = null, this._unfinalizedTargets = /* @__PURE__ */ new Set(), this._rootWriterPromise = null, this._startPromise = null, this._cancelPromise = null, this._finalizePromise = null, this._mutex = new re(), this._metadataTags = {}, this._rootTarget = null, this._rootTargetPromise = null, this._firstMediaStreamTimestamp = null, !e || typeof e != "object") throw TypeError("options must be an object.");
		if (!(e.format instanceof yu)) throw TypeError("options.format must be an OutputFormat.");
		if (!(e.target instanceof Kl || e.target instanceof Zl)) throw TypeError("options.target must be a Target or a PathedTarget.");
		if (e.target instanceof Kl && this._rememberTarget(e.target), e.initTarget !== void 0 && !(e.initTarget instanceof Kl) && typeof e.initTarget != "function") throw Error("options.initTarget, when provided, must be a Target or a function that returns or resolves to a Target.");
		if (e.onFinalize !== void 0 && typeof e.onFinalize != "function") throw TypeError("options.onFinalize, when provided, must be a function.");
		this.format = e.format, this._target = e.target, this._onFinalize = e.onFinalize ?? null, this._initTarget = e.initTarget ?? null, this._initTarget instanceof Kl && this._rememberTarget(this._initTarget), this._muxer = e.format._createMuxer(this);
	}
	_getTargetValidated(e) {
		c(this._target instanceof Zl);
		let t = this._target.getTarget(e), n = (e) => {
			if (!(e instanceof Kl)) throw TypeError("getTarget must return a Target.");
			return e;
		};
		return t instanceof Promise ? t.then(n) : n(t);
	}
	async _getTarget(e) {
		c(this._target instanceof Zl);
		let t = await this._getTargetValidated(e);
		return this._emit("target", {
			target: t,
			request: e,
			isRoot: e.isRoot
		}), this.state === "canceled" ? await t._close() : this._rememberTarget(t), t;
	}
	_rememberTarget(e) {
		this._unfinalizedTargets.add(e), e.on("finalized", () => this._unfinalizedTargets.delete(e), { once: !0 });
	}
	async _getInitTarget() {
		if (c(this._initTarget !== null), this._initTarget instanceof Kl) return this._initTarget;
		let e = await this._initTarget();
		return this.state === "canceled" ? await e._close() : this._rememberTarget(e), e;
	}
	_hasInitTarget() {
		return this._initTarget !== null;
	}
	_getRootTarget() {
		if (this._rootTarget) return this._rootTarget;
		if (this._rootTargetPromise) return this._rootTargetPromise;
		if (this._target instanceof Kl) return this._emit("target", {
			target: this._target,
			request: null,
			isRoot: !0
		}), this._rootTarget = this._target, this._target;
		let e = {
			path: this._target.rootPath,
			isRoot: !0,
			mimeType: this.format.mimeType
		}, t = this._getTargetValidated(e), n = (t) => (this.state === "canceled" ? t._close() : this._rememberTarget(t), this._emit("target", {
			target: t,
			request: e,
			isRoot: !0
		}), this._rootTarget = t, t);
		return t instanceof Promise ? this._rootTargetPromise = t.then(n) : n(t);
	}
	_getRootWriter(e) {
		return this._rootWriterPromise ??= (async () => {
			let t = await this._getRootTarget(), n = new Gl(t, typeof e == "boolean" ? e : e(t));
			return n.start(), n;
		})();
	}
	addVideoTrack(e, t = {}) {
		if (!(e instanceof ou)) throw TypeError("source must be a VideoSource.");
		if (Au(t), t.rotation !== void 0 && ![
			0,
			90,
			180,
			270
		].includes(t.rotation)) throw TypeError(`Invalid video rotation: ${t.rotation}. Has to be 0, 90, 180 or 270.`);
		if (!this.format.supportsVideoRotationMetadata && t.rotation) throw Error(`${this.format._name} does not support video rotation metadata.`);
		if (t.frameRate !== void 0 && (!Number.isFinite(t.frameRate) || t.frameRate <= 0)) throw TypeError(`Invalid video frame rate: ${t.frameRate}. Must be a positive number.`);
		let n = { ...t };
		return n.group ??= this.defaultTrackGroup, this._addTrack(new Eu(this.tracks.length + 1, this, e, n));
	}
	addAudioTrack(e, t = {}) {
		if (!(e instanceof mu)) throw TypeError("source must be an AudioSource.");
		Au(t);
		let n = { ...t };
		return n.group ??= this.defaultTrackGroup, this._addTrack(new Du(this.tracks.length + 1, this, e, n));
	}
	addSubtitleTrack(e, t = {}) {
		if (!(e instanceof vu)) throw TypeError("source must be a SubtitleSource.");
		Au(t);
		let n = { ...t };
		return n.group ??= this.defaultTrackGroup, this._addTrack(new Ou(this.tracks.length + 1, this, e, n));
	}
	setMetadataTags(e) {
		if (ot(e), this.state !== "pending") throw Error("Cannot set metadata tags after output has been started or canceled.");
		this._metadataTags = e;
	}
	_addTrack(e) {
		if (this.state !== "pending") throw Error("Cannot add track after output has been started or canceled.");
		if (e.source._connectedTrack) throw Error("Source is already used for a track.");
		let t = this.format.getSupportedTrackCounts(), n = this.tracks.reduce((t, n) => t + +(n.type === e.type), 0), r = t[e.type].max;
		if (n === r) throw Error(r === 0 ? `${this.format._name} does not support ${e.type} tracks.` : `${this.format._name} does not support more than ${r} ${e.type} track${r === 1 ? "" : "s"}.`);
		let i = t.total.max;
		if (this.tracks.length === i) throw Error(`${this.format._name} does not support more than ${i} tracks${i === 1 ? "" : "s"} in total.`);
		if (e.isVideoTrack()) {
			let t = this.format.getSupportedVideoCodecs();
			if (t.length === 0) throw Error(`${this.format._name} does not support video tracks.` + this.format._codecUnsupportedHint(e.source._codec));
			if (!t.includes(e.source._codec)) throw Error(`Codec '${e.source._codec}' cannot be contained within ${this.format._name}. Supported video codecs are: ${t.map((e) => `'${e}'`).join(", ")}.` + this.format._codecUnsupportedHint(e.source._codec));
		} else if (e.isAudioTrack()) {
			let t = this.format.getSupportedAudioCodecs();
			if (t.length === 0) throw Error(`${this.format._name} does not support audio tracks.` + this.format._codecUnsupportedHint(e.source._codec));
			if (!t.includes(e.source._codec)) throw Error(`Codec '${e.source._codec}' cannot be contained within ${this.format._name}. Supported audio codecs are: ${t.map((e) => `'${e}'`).join(", ")}.` + this.format._codecUnsupportedHint(e.source._codec));
		} else if (e.isSubtitleTrack()) {
			let t = this.format.getSupportedSubtitleCodecs();
			if (t.length === 0) throw Error(`${this.format._name} does not support subtitle tracks.` + this.format._codecUnsupportedHint(e.source._codec));
			if (!t.includes(e.source._codec)) throw Error(`Codec '${e.source._codec}' cannot be contained within ${this.format._name}. Supported subtitle codecs are: ${t.map((e) => `'${e}'`).join(", ")}.` + this.format._codecUnsupportedHint(e.source._codec));
		}
		return this.tracks.push(e), e.source._connectedTrack = e, e;
	}
	hasEnoughTracks() {
		let e = this.format.getSupportedTrackCounts();
		for (let t of wu) if (this.tracks.reduce((e, n) => e + +(n.type === t), 0) < e[t].min) return !1;
		let t = e.total.min;
		return !(this.tracks.length < t);
	}
	async start() {
		let e = this.format.getSupportedTrackCounts();
		for (let t of wu) {
			let n = this.tracks.reduce((e, n) => e + +(n.type === t), 0), r = e[t].min;
			if (n < r) throw Error(r === e[t].max ? `${this.format._name} requires exactly ${r} ${t} track${r === 1 ? "" : "s"}.` : `${this.format._name} requires at least ${r} ${t} track${r === 1 ? "" : "s"}.`);
		}
		let t = e.total.min;
		if (this.tracks.length < t) throw Error(t === e.total.max ? `${this.format._name} requires exactly ${t} track${t === 1 ? "" : "s"}.` : `${this.format._name} requires at least ${t} track${t === 1 ? "" : "s"}.`);
		if (this.state === "canceled") throw Error("Output has been canceled.");
		return this._startPromise ? (D._warn("Output has already been started."), this._startPromise) : this._startPromise = (async () => {
			this.state = "started";
			let e = await this._mutex.acquire();
			try {
				await this._muxer.start();
				let e = this.tracks.map((e) => e.source._start());
				await Promise.all(e);
			} finally {
				e();
			}
		})();
	}
	getMimeType() {
		return this._muxer.getMimeType();
	}
	async cancel() {
		if (this._cancelPromise) return D._warn("Output has already been canceled."), this._cancelPromise;
		if (this.state === "finalizing" || this.state === "finalized") {
			this.state === "finalized" && D._warn("Output has already been finalized.");
			return;
		}
		return this._cancelPromise = (async () => {
			this.state = "canceled";
			let e = await this._mutex.acquire();
			try {
				let e = this.tracks.map((e) => e.source._flushOrWaitForOngoingClose(!0));
				await Promise.all(e), await Promise.all([...this._unfinalizedTargets].map((e) => e._close())), this._unfinalizedTargets.clear();
			} finally {
				e();
			}
		})();
	}
	async finalize() {
		if (this.state === "pending") throw Error("Cannot finalize before starting.");
		if (this.state === "canceled") throw Error("Cannot finalize after canceling.");
		return this._finalizePromise ? (D._warn("Output has already been finalized."), this._finalizePromise) : this._finalizePromise = (async () => {
			this.state = "finalizing";
			let e = await this._mutex.acquire();
			try {
				let e = this.tracks.map((e) => e.source._flushOrWaitForOngoingClose(!1));
				if (await Promise.all(e), await this._muxer.finalize(), this._rootWriterPromise) {
					let e = await this._rootWriterPromise;
					e.finalized || (await e.flush(), await e.finalize());
				}
				this._onFinalize && await this._onFinalize(), this.state = "finalized";
			} finally {
				await Promise.all([...this._unfinalizedTargets].map((e) => e._close().catch(() => {}))), this._unfinalizedTargets.clear(), e();
			}
		})();
	}
};
//#endregion
//#region src/services/videoCompositor.ts
async function Mu(e) {
	let t = await e.getPrimaryVideoTrack();
	if (!(!t || !await t.canDecode())) return {
		sink: new gs(t),
		width: t.displayWidth,
		height: t.displayHeight
	};
}
function Nu(e, t, n) {
	let r = Math.min(t.width / Math.max(1, e.width), t.height / Math.max(1, e.height)), i = e.width * r * n.scale, a = e.height * r * n.scale;
	return {
		x: n.x * t.width - i / 2,
		y: n.y * t.height - a / 2,
		width: i,
		height: a
	};
}
function Pu(e, t, n, r, i, a) {
	let o = Nu(n, r, i);
	e.save(), e.globalAlpha = Math.max(0, Math.min(1, i.opacity * a)), i.rotation === 0 ? e.drawImage(t, o.x, o.y, o.width, o.height) : (e.translate(o.x + o.width / 2, o.y + o.height / 2), e.rotate(i.rotation * Math.PI / 180), e.drawImage(t, -o.width / 2, -o.height / 2, o.width, o.height)), e.restore();
}
function Fu(e, t, r, i) {
	let a = r.transform ?? s, o = {
		...n,
		...r.textStyle
	}, c = (o.content.trim() || n.content).split(/\r?\n/), l = Math.max(8, o.fontSize * a.scale), u = l * 1.2;
	e.save(), e.translate(a.x * t.width, a.y * t.height), e.rotate(a.rotation * Math.PI / 180), e.globalAlpha = Math.max(0, Math.min(1, a.opacity * i)), e.fillStyle = o.color, e.font = `${o.fontWeight} ${l}px ${o.fontFamily}`, e.textAlign = o.align, e.textBaseline = "middle", e.shadowColor = "rgba(0, 0, 0, 0.45)", e.shadowBlur = Math.max(2, l * .08);
	let d = -((c.length - 1) * u) / 2;
	c.forEach((t, n) => e.fillText(t, 0, d + n * u)), e.restore();
}
async function Iu(e, t, n, r, i, a, o) {
	if (n.kind === "text") {
		Fu(e, t, n, i);
		return;
	}
	let c = a(n);
	if (!c) return;
	let l = n.transform ?? s;
	if (c.bitmap) {
		Pu(e, c.bitmap, c, t, l, i);
		return;
	}
	if (!c.sink) return;
	let u = await c.sink.getSample(Math.max(0, r));
	u && (o.push(u), Pu(e, u.toCanvasImageSource(), c, t, l, i));
}
function Lu(e, n) {
	let r = e.clips.indexOf(n);
	if (r <= 0) return;
	let i = e.clips[r - 1];
	return Math.abs(t(i) - n.timelineStart) < .001 ? i : void 0;
}
async function Ru(e, t, n, r, o) {
	e.clearRect(0, 0, t.width, t.height), e.fillStyle = "#000", e.fillRect(0, 0, t.width, t.height);
	let s = [];
	try {
		for (let c of n) if (!(c.hidden || c.kind !== "video")) for (let n of i(c, r)) {
			let i = r - n.timelineStart, l = a(n, i);
			if (l < 1 && n.transitionIn?.kind === "dissolve") {
				let r = Lu(c, n);
				r && await Iu(e, t, r, r.sourceOut + i, 1, o, s);
			}
			n.transitionIn?.kind === "fade" && l < 1 && (e.save(), e.globalAlpha = 1 - l, e.fillStyle = "#000", e.fillRect(0, 0, t.width, t.height), e.restore()), await Iu(e, t, n, n.sourceIn + i, l, o, s);
		}
	} finally {
		for (let e of s) e.close();
	}
}
//#endregion
//#region src/services/videoAudioMixer.ts
var zu = 48e3;
function Bu(e) {
	return Array.from({ length: 2 }, () => new Float32Array(new ArrayBuffer(e * Float32Array.BYTES_PER_ELEMENT)));
}
async function Vu(e, t, n, i, a) {
	let s = await i.getPrimaryAudioTrack();
	if (!s || !await s.canDecode()) return;
	let c = new xs(s), l = o(n);
	for await (let i of c.buffers(n.sourceIn, n.sourceOut)) {
		let o = i.buffer, s = i.timestamp - n.sourceIn;
		if (s >= l) break;
		let c = Math.round((n.timelineStart + s) * zu), u = o.sampleRate / zu;
		for (let i = 0; i < 2; i += 1) {
			let l = Math.min(i, o.numberOfChannels - 1), d = o.getChannelData(l), f = e[i];
			for (let e = 0; e < Math.round(o.duration * zu); e += 1) {
				let i = c + e;
				if (i < 0 || i >= t) continue;
				let o = Math.floor(e * u);
				if (o >= d.length) break;
				let l = r(n, s + e / zu) * a;
				f[i] += d[o] * l;
			}
		}
	}
}
function Hu(e) {
	let t = 1;
	for (let n of e) for (let e of n) {
		let n = Math.abs(e);
		n > t && (t = n);
	}
	if (t <= 1) return;
	let n = 1 / t;
	for (let t of e) for (let e = 0; e < t.length; e += 1) t[e] *= n;
}
async function Uu(e) {
	let { tracks: t, duration: n, resolve: r, onProgress: i, signal: a } = e;
	if (n <= 0) return null;
	let o = Math.ceil(n * zu), s = Bu(o), c = [];
	for (let e of t) if (!(e.hidden || e.muted)) for (let t of e.clips) {
		if (t.kind === "image" || t.kind === "text") continue;
		let n = r(t);
		n && c.push({
			clip: t,
			input: n,
			trackVolume: e.volume ?? 1
		});
	}
	if (c.length === 0) return null;
	let l = 0;
	for (let e of c) {
		if (a?.aborted) throw Error("导出已取消");
		await Vu(s, o, e.clip, e.input, e.trackVolume), l += 1, i?.(l / c.length);
	}
	return Hu(s), {
		channels: s,
		sampleRate: zu,
		length: o
	};
}
function Wu(e, t = 1) {
	let n = Math.max(1, Math.round(t * e.sampleRate)), r = [];
	for (let t = 0; t < e.length; t += n) {
		let i = Math.min(n, e.length - t), a = new AudioBuffer({
			length: i,
			numberOfChannels: 2,
			sampleRate: e.sampleRate
		});
		for (let n = 0; n < 2; n += 1) a.copyToChannel(e.channels[n].subarray(t, t + i), n);
		r.push(a);
	}
	return r;
}
async function Gu(e, t) {
	let { buckets: n, duration: r } = t;
	if (n <= 0 || r <= 0) return [];
	let i = await e.getPrimaryAudioTrack();
	if (!i || !await i.canDecode()) return [];
	let a = Array(n).fill(0), o = new xs(i);
	for await (let e of o.buffers()) {
		let t = e.buffer, i = t.getChannelData(0), o = t.duration / Math.max(1, i.length);
		for (let t = 0; t < i.length; t += 1) {
			let s = e.timestamp + t * o, c = Math.floor(s / r * n);
			if (c < 0 || c >= n) continue;
			let l = Math.abs(i[t]);
			l > a[c] && (a[c] = l);
		}
	}
	return a;
}
//#endregion
//#region src/services/videoEditorMediaService.ts
var Ku = 8 * 1024 * 1024, qu = class extends Error {};
async function Ju(e, t) {
	let n = Number(e.headers.get("Content-Length"));
	if (Number.isFinite(n) && n > t) throw await e.body?.cancel().catch(() => void 0), new qu("媒体分片响应超过请求范围");
	let r = e.body?.getReader();
	if (!r) {
		let n = new Uint8Array(await e.arrayBuffer());
		if (n.byteLength > t) throw new qu("媒体分片响应超过请求范围");
		return n;
	}
	let i = [], a = 0;
	try {
		for (;;) {
			let { done: e, value: n } = await r.read();
			if (e) break;
			if (a + n.byteLength > t) throw new qu("媒体分片响应超过请求范围");
			i.push(n), a += n.byteLength;
		}
	} catch (e) {
		throw await r.cancel().catch(() => void 0), e;
	} finally {
		r.releaseLock();
	}
	if (i.length === 1) return i[0];
	let o = new Uint8Array(a), s = 0;
	for (let e of i) o.set(e, s), s += e.byteLength;
	return o;
}
async function Yu(e, t, n) {
	let r = Math.max(0, n - t);
	if (r === 0) return new Uint8Array();
	let i = await fetch(e, { headers: { Range: `bytes=${t}-${n - 1}` } });
	if (!i.ok) throw Error(`读取媒体分片失败：HTTP ${i.status}`);
	if (i.status !== 206) throw await i.body?.cancel().catch(() => void 0), new qu("媒体源忽略 Range 请求");
	return Ju(i, r);
}
function Xu(e, t) {
	let n = null, r = () => (n ??= (async () => {
		let t = await fetch(e);
		if (!t.ok) throw Error(`读取媒体失败：HTTP ${t.status}`);
		return new Uint8Array(await t.arrayBuffer());
	})(), n);
	return async (i, a) => {
		let o = Math.min(a, t);
		if (n) return (await n).subarray(i, o);
		try {
			return await Yu(e, i, o);
		} catch (t) {
			if (t instanceof qu) return (await r()).subarray(i, o);
			await new Promise((e) => setTimeout(e, 50));
			try {
				return await Yu(e, i, o);
			} catch (e) {
				return e instanceof qu, (await r()).subarray(i, o);
			}
		}
	};
}
async function Zu(e) {
	let t = null;
	try {
		if (t = await fetch(e, { headers: { Range: "bytes=0-0" } }), !t.ok) return null;
		if (t.status === 206) {
			let e = t.headers.get("Content-Range")?.split("/")[1], n = e ? Number(e) : NaN;
			if (Number.isFinite(n) && n > 0) return {
				size: n,
				ranged: !0
			};
		}
		let n = t.headers.get("Content-Length"), r = n ? Number(n) : NaN;
		return Number.isFinite(r) && r > 0 ? {
			size: r,
			ranged: !1
		} : null;
	} catch {
		return null;
	} finally {
		await t?.body?.cancel().catch(() => void 0);
	}
}
async function Qu(e) {
	let t = await Zu(e);
	if (t?.ranged) {
		let n = Xu(e, t.size);
		return new js({
			formats: Za,
			source: new xa({
				getSize: () => t.size,
				read: (e, t) => n(e, Math.min(t, e + Ku)),
				maxCacheSize: Ku
			})
		});
	}
	let n = await fetch(e);
	if (!n.ok) throw Error(`读取媒体失败：HTTP ${n.status}`);
	return new js({
		formats: Za,
		source: new ya(await n.blob())
	});
}
async function $u(e) {
	let t = await e.getPrimaryVideoTrack(), n = await e.getPrimaryAudioTrack(), r = await e.computeDuration(), i = t ? await t.canDecode() : !1;
	return {
		duration: r,
		width: t?.displayWidth ?? 0,
		height: t?.displayHeight ?? 0,
		decodable: i,
		videoCodec: t ? await t.getCodec() : null,
		audioCodec: n ? await n.getCodec() : null
	};
}
async function* ed(e, t) {
	let n = await e.getPrimaryVideoTrack();
	if (!n || !await n.canDecode()) throw Error("视频轨无法解码");
	let r = new _s(n, {
		height: t.height,
		fit: "contain",
		poolSize: 2
	});
	for await (let e of r.canvases(t.start, t.end)) {
		if (t.signal?.aborted) throw Error("抽帧已取消");
		yield {
			requestedTime: e.timestamp,
			actualTime: e.timestamp,
			duration: e.duration,
			width: e.canvas.width,
			height: e.canvas.height,
			canvas: e.canvas
		};
	}
}
async function td(e, t) {
	let { timestamps: n, height: r, signal: i } = t;
	if (!Number.isInteger(r) || r <= 0) throw Error("抽帧高度必须是正整数");
	if (n.length === 0) return [];
	for (let e = 0; e < n.length; e += 1) {
		let t = n[e];
		if (!Number.isFinite(t) || t < 0) throw Error("抽帧时间点无效");
		if (e > 0 && t < n[e - 1]) throw Error("批量抽帧时间点必须单调递增");
	}
	if (i?.aborted) throw Error("抽帧已取消");
	let a = await e.getPrimaryVideoTrack();
	if (!a || !await a.canDecode()) return n.map(() => null);
	let o = new _s(a, {
		height: r,
		fit: "contain",
		poolSize: 0
	}), s = [], c = 0;
	for await (let e of o.canvasesAtTimestamps(n)) {
		if (i?.aborted) throw Error("抽帧已取消");
		s.push(e ? {
			requestedTime: n[c],
			actualTime: e.timestamp,
			duration: e.duration,
			width: e.canvas.width,
			height: e.canvas.height,
			canvas: e.canvas
		} : null), c += 1;
	}
	for (; s.length < n.length;) s.push(null);
	return s;
}
async function nd(e, t) {
	let { count: n, height: r, duration: i } = t;
	return n <= 0 || i <= 0 ? [] : (await td(e, {
		timestamps: Array.from({ length: n }, (e, t) => i * t / n),
		height: r
	})).map((e) => e?.canvas instanceof HTMLCanvasElement ? e.canvas.toDataURL("image/jpeg", .82) : "");
}
var rd = !1;
function id() {
	if (rd || (rd = !0, typeof VideoEncoder > "u")) return;
	let e = VideoEncoder.isConfigSupported.bind(VideoEncoder);
	VideoEncoder.isConfigSupported = async (t) => {
		try {
			return await e(t);
		} catch (e) {
			return console.warn("[videoEditor] isConfigSupported 拒绝了该配置，跳过该候选:", t, e), {
				supported: !1,
				config: t
			};
		}
	};
}
var ad = class extends Error {
	constructor() {
		super("导出已取消"), this.name = "VideoExportCanceledError";
	}
};
async function od(e) {
	let { input: t, start: n, end: r, onProgress: i, signal: a } = e;
	if (!(r > n)) throw Error("导出区间无效：出点必须大于入点");
	let o = await t.getPrimaryVideoTrack();
	if (!o) throw Error("该文件没有可导出的视频轨");
	let s = await o.getCodec();
	if (!s) throw Error("无法识别源视频编码，改用重编码导出");
	let c = new ju({
		format: new xu(),
		target: new Yl()
	});
	if (!c.format.getSupportedVideoCodecs().includes(s)) throw Error(`MP4 容器不支持源编码 ${s}，改用重编码导出`);
	let l = new cu(s);
	c.addVideoTrack(l, { rotation: o.rotation });
	let u = await t.getPrimaryAudioTrack(), d = u ? await u.getCodec() : null, f = !!u && !!d && c.format.getSupportedAudioCodecs().includes(d), p = f ? new hu(d) : null;
	p && c.addAudioTrack(p), await c.start();
	let m = () => {
		if (a?.aborted) throw new ad();
	};
	try {
		let e = new ss(o), t = await e.getKeyPacket(n) ?? await e.getFirstKeyPacket();
		if (!t) throw Error("视频轨没有可用的关键帧");
		let a = t.timestamp, s = Math.max(r - a, 2 ** -52), h = await o.getDecoderConfig(), g = !0;
		for await (let n of e.packets(t)) {
			if (m(), n.timestamp >= r) break;
			await l.add(n.clone({ timestamp: n.timestamp - a }), g && h ? { decoderConfig: h } : void 0), g = !1, i?.(Math.min(1, (n.timestamp - a) / s));
		}
		if (l.close(), u && p) {
			let e = new ss(u), t = await e.getPacket(a) ?? void 0, n = await u.getDecoderConfig(), i = !0;
			for await (let o of e.packets(t)) {
				if (m(), o.timestamp >= r) break;
				let e = o.timestamp - a;
				e < 0 || (await p.add(o.clone({ timestamp: e }), i && n ? { decoderConfig: n } : void 0), i = !1);
			}
			p.close();
		}
		await c.finalize(), i?.(1);
		let _ = c.target.buffer;
		if (!_) throw Error("导出未产生有效数据");
		return {
			bytes: new Uint8Array(_),
			actualStart: a,
			audioKept: f,
			audioDropReason: f ? void 0 : u ? `MP4 不接受源音频编码 ${d ?? "未知"}` : "素材没有音轨"
		};
	} catch (e) {
		throw await c.cancel().catch(() => {}), e;
	}
}
var sd = "pcm-s16";
async function cd(e, n) {
	let r = e.filter((e) => !e.hidden && !e.muted).flatMap((e) => (e.volume ?? 1) === 1 ? e.clips.filter((e) => e.kind !== "image") : e.clips.map((e) => ({
		...e,
		volume: -1
	})));
	if (r.length === 0) return {
		mode: "none",
		reason: "时间轴没有音频素材"
	};
	if (typeof AudioEncoder < "u") return { mode: "encode" };
	let i = r.some((e) => (e.volume ?? 1) !== 1 || (e.volumePoints?.length ?? 0) > 0), a = [...r].sort((e, t) => e.timelineStart - t.timelineStart), o = a.some((e, n) => n > 0 && e.timelineStart < t(a[n - 1]) - .001), s = null, c = !0;
	for (let e of a) {
		let t = n(e);
		if (!t) continue;
		let r = await t.getPrimaryAudioTrack();
		if (!r) continue;
		let i = await r.getDecoderConfig(), a = i ? `${i.codec}|${i.sampleRate}|${i.numberOfChannels}` : "unknown";
		s ??= a, a !== s && (c = !1);
	}
	return s ? !i && !o && c ? { mode: "copy" } : {
		mode: "pcm",
		reason: `${[
			i ? "需要应用音量调整" : "",
			o ? "存在重叠音频需混合" : "",
			c ? "" : "各段音频参数不一致"
		].filter(Boolean).join("、")}，本机无 AudioEncoder，改用未压缩 PCM 音轨`
	} : {
		mode: "none",
		reason: "时间轴没有可用的音频轨"
	};
}
async function ld(e) {
	let { output: t, tracks: n, resolve: r, signal: i, onProgress: a } = e, o = n.filter((e) => !e.hidden && !e.muted).flatMap((e) => e.clips.filter((e) => e.kind !== "image")).sort((e, t) => e.timelineStart - t.timelineStart), s = o.map(r).find(Boolean), c = s ? await s.getPrimaryAudioTrack() : null, l = c ? await c.getCodec() : null;
	if (!l) return;
	let u = new hu(l);
	t.addAudioTrack(u), await t.start();
	let d = !0;
	for (let [e, t] of o.entries()) {
		if (i?.aborted) throw new ad();
		let n = r(t), s = n ? await n.getPrimaryAudioTrack() : null;
		if (!s) continue;
		let c = new ss(s), l = await s.getDecoderConfig(), f = await c.getPacket(t.sourceIn) ?? void 0;
		for await (let e of c.packets(f)) {
			if (i?.aborted) throw new ad();
			if (e.timestamp >= t.sourceOut) break;
			let n = t.timelineStart + (e.timestamp - t.sourceIn);
			n < 0 || (await u.add(e.clone({ timestamp: n }), d && l ? { decoderConfig: l } : void 0), d = !1);
		}
		a?.((e + 1) / o.length);
	}
	u.close();
}
async function ud(e) {
	let { tracks: t, duration: n, canvas: r, frameRate: i, resolveVideo: a, resolveAudio: o, onProgress: s, onStage: c, onAudioMode: l, signal: u } = e;
	if (n <= 0) throw Error("时间轴为空，没有可导出的内容");
	id();
	let d = document.createElement("canvas");
	d.width = r.width, d.height = r.height;
	let f = null;
	try {
		let e = d.getContext("2d", { alpha: !1 });
		if (!e) throw Error("无法创建合成画布");
		let p = new ju({
			format: new xu(),
			target: new Yl()
		});
		f = p;
		let m = new pu(d, {
			codec: "avc",
			bitrate: Jo
		});
		p.addVideoTrack(m);
		let { mode: h, reason: g } = await cd(t, o);
		l?.(h, g);
		let _ = null, v = null;
		(h === "encode" || h === "pcm") && (c?.("混合音频"), _ = await Uu({
			tracks: t,
			duration: n,
			resolve: o,
			signal: u,
			onProgress: (e) => s?.(e * .2)
		}), _ && (v = h === "pcm" ? new _u({ codec: sd }) : new _u({
			codec: "aac",
			bitrate: qo
		}), p.addAudioTrack(v))), h !== "copy" && await p.start(), h === "copy" && (c?.("搬运音频"), await ld({
			output: p,
			tracks: t,
			resolve: o,
			signal: u,
			onProgress: (e) => s?.(e * .2)
		})), c?.("渲染画面");
		let y = Math.max(1, Math.round(n * i)), b = 1 / i;
		for (let n = 0; n < y; n += 1) {
			if (u?.aborted) throw new ad();
			let i = n * b;
			await Ru(e, r, t, i, a), await m.add(i, b), s?.(.2 + n / y * .7);
		}
		if (m.close(), v && _) {
			c?.("写入音频");
			let e = Wu(_);
			for (let [t, n] of e.entries()) {
				if (u?.aborted) throw new ad();
				await v.add(n), s?.(.9 + t / e.length * .1);
			}
			v.close();
		}
		await p.finalize(), f = null, s?.(1);
		let x = p.target.buffer;
		if (!x) throw Error("导出未产生有效数据");
		return new Uint8Array(x);
	} finally {
		await f?.cancel().catch(() => void 0), d.width = 1, d.height = 1;
	}
}
async function dd(e) {
	let { segments: t, onProgress: n, signal: r } = e;
	if (t.length === 0) throw Error("没有可导出的片段");
	if (t.length === 1) return od({
		...t[0],
		onProgress: n,
		signal: r
	});
	let i = await Promise.all(t.map(async (e) => {
		let t = await e.input.getPrimaryVideoTrack();
		if (!t) throw Error(`片段「${e.label}」没有视频轨`);
		return {
			segment: e,
			track: t,
			codec: await t.getCodec()
		};
	})), [a, ...o] = i;
	if (!a.codec) throw Error("无法识别源视频编码，无法直通拼接");
	let s = o.find((e) => e.codec !== a.codec || e.track.displayWidth !== a.track.displayWidth || e.track.displayHeight !== a.track.displayHeight);
	if (s) throw Error(`片段「${s.segment.label}」的编码或分辨率与首个片段不一致，无法直通拼接（${s.codec ?? "未知"} ${s.track.displayWidth}×${s.track.displayHeight} vs ${a.codec} ${a.track.displayWidth}×${a.track.displayHeight}）`);
	let c = new ju({
		format: new xu(),
		target: new Yl()
	});
	if (!c.format.getSupportedVideoCodecs().includes(a.codec)) throw Error(`MP4 容器不支持源编码 ${a.codec}`);
	let l = new cu(a.codec);
	c.addVideoTrack(l, { rotation: a.track.rotation });
	let u = await Promise.all(t.map(async (e) => {
		let t = await e.input.getPrimaryAudioTrack();
		if (!t) return null;
		let n = await t.getDecoderConfig();
		return {
			track: t,
			codec: await t.getCodec(),
			signature: n ? `${n.codec}|${n.sampleRate}|${n.numberOfChannels}` : null
		};
	})), d = u[0], f = d?.codec && d.signature && c.format.getSupportedAudioCodecs().includes(d.codec) && u.every((e) => e?.signature === d.signature) && d.codec ? new hu(d.codec) : null;
	f && c.addAudioTrack(f), await c.start();
	try {
		let e = i.reduce((e, t) => e + Math.max(0, t.segment.end - t.segment.start), 0), t = 0, a = !0, o = !0, s = 0;
		for (let [c, d] of i.entries()) {
			if (r?.aborted) throw new ad();
			let i = new ss(d.track), p = await i.getKeyPacket(d.segment.start) ?? await i.getFirstKeyPacket();
			if (!p) throw Error(`片段「${d.segment.label}」没有可用的关键帧`);
			c === 0 && (s = p.timestamp);
			let m = await d.track.getDecoderConfig(), h = p.timestamp;
			for await (let o of i.packets(p)) {
				if (r?.aborted) throw new ad();
				if (o.timestamp >= d.segment.end) break;
				if (await l.add(o.clone({ timestamp: t + (o.timestamp - h) }), a && m ? { decoderConfig: m } : void 0), a = !1, e > 0) {
					let r = t + (o.timestamp - h);
					n?.(Math.min(1, r / e));
				}
			}
			let g = u[c];
			if (f && g) {
				let e = new ss(g.track), n = await e.getPacket(h) ?? void 0, i = await g.track.getDecoderConfig();
				for await (let a of e.packets(n)) {
					if (r?.aborted) throw new ad();
					if (a.timestamp >= d.segment.end) break;
					let e = t + (a.timestamp - h);
					e < 0 || (await f.add(a.clone({ timestamp: e }), o && i ? { decoderConfig: i } : void 0), o = !1);
				}
			}
			t += Math.max(0, d.segment.end - h);
		}
		l.close(), f?.close(), await c.finalize(), n?.(1);
		let p = c.target.buffer;
		if (!p) throw Error("导出未产生有效数据");
		return {
			bytes: new Uint8Array(p),
			actualStart: s,
			audioKept: !!f,
			audioDropReason: f ? void 0 : d ? "各段音频编码或采样参数不一致，无法直通拼接音轨" : "素材没有音轨"
		};
	} catch (e) {
		throw await c.cancel().catch(() => {}), e;
	}
}
//#endregion
//#region src/services/videoEditorWindowService.ts
var fd = "video-editor", pd = "video-editor:host-message", md = "video-editor:message", hd = new Set([
	"storyai:video-editor-ready",
	"storyai:video-editor-close",
	"storyai:video-editor-exported",
	"storyai:video-editor-frame-exported",
	"storyai:video-editor-models-request",
	"storyai:video-editor-ai-transition-request"
]), gd = new Set([
	"storyai:video-editor-session",
	"storyai:video-editor-models",
	"storyai:video-editor-ai-transition-result"
]), _d = /* @__PURE__ */ new Map(), vd = null, yd = /* @__PURE__ */ new Map(), bd = null;
function xd(e) {
	if (typeof e != "string") return null;
	let t = e.trim();
	return !t || t.length > 128 ? null : t;
}
function Sd(e, t) {
	if (!e || typeof e != "object") return null;
	let n = e, r = xd(n.instanceId);
	if (!r || !n.message || typeof n.message != "object") return null;
	let i = n.message;
	return typeof i.type != "string" || !t.has(i.type) || i.payload !== void 0 && (!i.payload || typeof i.payload != "object") ? null : {
		instanceId: r,
		message: {
			type: i.type,
			...i.payload ? { payload: i.payload } : {}
		}
	};
}
function Cd(e) {
	return Sd(e, hd);
}
function wd(e) {
	return Sd(e, gd);
}
function Td() {
	return typeof window < "u" && typeof window.__TAURI_INTERNALS__?.transformCallback === "function" && typeof window.__TAURI_INTERNALS__?.invoke === "function";
}
function Ed(e, t, n) {
	for (let r of e.get(t) ?? []) r(n);
}
async function Dd() {
	if (!Td()) return;
	return vd || (vd = (async () => {
		let { listen: e } = await import("./event-BlmvLUFr.js").then((e) => e.i);
		await e(md, (e) => {
			let t = Cd(e.payload);
			t && Ed(_d, t.instanceId, t.message);
		});
	})().catch((e) => {
		throw vd = null, e;
	}), vd);
}
async function Od() {
	if (!Td()) return;
	return bd || (bd = (async () => {
		let { listen: e } = await import("./event-BlmvLUFr.js").then((e) => e.i);
		await e(pd, (e) => {
			let t = wd(e.payload);
			t && Ed(yd, t.instanceId, t.message);
		});
	})().catch((e) => {
		throw bd = null, e;
	}), bd);
}
function kd(e) {
	return `index.html?${new URLSearchParams({
		view: "video-editor",
		instanceId: e.instanceId,
		projectId: e.projectId,
		nodeId: e.nodeId,
		theme: e.theme
	}).toString()}`;
}
async function Ad(e) {
	let t = xd(e.instanceId);
	if (!t) throw Error("剪辑工程标识无效");
	if (!Td()) throw Error("视频编辑器独立窗口仅支持 Tauri 桌面端");
	let n = e.theme === "light" ? "light" : "dark";
	await Dd();
	let { WebviewWindow: r } = await import("./webviewWindow-DrkgzeEA.js"), i = await r.getByLabel(fd);
	if (i) {
		await i.show().catch(() => {}), await i.unminimize().catch(() => {}), await i.setFocus().catch(() => {});
		let { emitTo: r } = await import("./event-BlmvLUFr.js").then((e) => e.i);
		await r(fd, pd, {
			instanceId: t,
			message: {
				type: "storyai:video-editor-session",
				payload: {
					instanceId: t,
					projectId: e.projectId,
					nodeId: e.nodeId,
					theme: n
				}
			}
		});
		return;
	}
	let a = new r(fd, {
		url: kd({
			instanceId: t,
			projectId: e.projectId,
			nodeId: e.nodeId,
			theme: n
		}),
		title: "视频编辑器",
		width: 1440,
		height: 900,
		minWidth: 1080,
		minHeight: 680,
		center: !0,
		resizable: !0,
		decorations: !1,
		transparent: !0,
		shadow: !1
	});
	await new Promise((e, t) => {
		a.once("tauri://created", () => e()), a.once("tauri://error", (e) => {
			t(/* @__PURE__ */ Error(`创建视频编辑器窗口失败：${String(e.payload ?? "unknown")}`));
		});
	}), a.once("tauri://destroyed", () => {
		Ed(_d, t, { type: "storyai:video-editor-close" });
	});
}
function jd(e, t) {
	let n = xd(e);
	if (!n) return () => {};
	let r = _d.get(n) ?? /* @__PURE__ */ new Set();
	return r.add(t), _d.set(n, r), Dd().catch((e) => {
		console.error("[videoEditorWindow] 初始化事件监听失败:", e);
	}), () => {
		r.delete(t), r.size === 0 && _d.delete(n);
	};
}
async function Md(e, t) {
	let { emitTo: n } = await import("./event-BlmvLUFr.js").then((e) => e.i);
	await n("main", md, {
		instanceId: e,
		message: {
			type: "storyai:video-editor-exported",
			payload: { ...t }
		}
	});
}
async function Nd(e, t) {
	let { emitTo: n } = await import("./event-BlmvLUFr.js").then((e) => e.i);
	await n("main", md, {
		instanceId: e,
		message: {
			type: "storyai:video-editor-frame-exported",
			payload: { ...t }
		}
	});
}
async function Pd(e) {
	let { emitTo: t } = await import("./event-BlmvLUFr.js").then((e) => e.i);
	await t("main", md, {
		instanceId: e,
		message: { type: "storyai:video-editor-ready" }
	});
}
async function Fd(e) {
	let { emitTo: t } = await import("./event-BlmvLUFr.js").then((e) => e.i);
	await t("main", md, {
		instanceId: e,
		message: { type: "storyai:video-editor-models-request" }
	});
}
async function Id(e, t) {
	let { emitTo: n } = await import("./event-BlmvLUFr.js").then((e) => e.i);
	await n("main", md, {
		instanceId: e,
		message: {
			type: "storyai:video-editor-ai-transition-request",
			payload: { ...t }
		}
	});
}
function Ld(e, t) {
	let n = xd(e);
	if (!n) return () => {};
	let r = yd.get(n) ?? /* @__PURE__ */ new Set();
	return r.add(t), yd.set(n, r), Od().catch((e) => {
		console.error("[videoEditorWindow] 初始化主窗口消息监听失败:", e);
	}), () => {
		r.delete(t), r.size === 0 && yd.delete(n);
	};
}
async function Rd(e, t) {
	let { emitTo: n } = await import("./event-BlmvLUFr.js").then((e) => e.i);
	await n(fd, pd, {
		instanceId: e,
		message: {
			type: "storyai:video-editor-models",
			payload: { models: t }
		}
	});
}
async function zd(e, t) {
	let { emitTo: n } = await import("./event-BlmvLUFr.js").then((e) => e.i);
	await n(fd, pd, {
		instanceId: e,
		message: {
			type: "storyai:video-editor-ai-transition-result",
			payload: { ...t }
		}
	});
}
//#endregion
export { Ru as S, ed as _, Nd as a, Nu as b, Pd as c, ad as d, Qu as f, nd as g, td as h, Md as i, Ld as l, dd as m, Id as n, Rd as o, ud as p, zd as r, Fd as s, Ad as t, jd as u, $u as v, Mu as x, Gu as y };
