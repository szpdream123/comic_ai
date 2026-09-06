import { i as e } from "./core-D3lATfku.js";
import { n as t, r as n } from "./path-gl9BKl4b.js";
import { a as r, c as i, d as a, i as o, l as s, n as c, o as l, u } from "./dist-js-CiPmuq1Z.js";
//#region src/services/fs/core.ts
function d() {
	return typeof window < "u" && "__TAURI_INTERNALS__" in window;
}
var f = "project-disk-changed";
function p() {
	typeof window > "u" || window.dispatchEvent(new CustomEvent(f));
}
function m(e) {
	return {
		txt: "text/plain",
		md: "text/markdown",
		csv: "text/csv",
		json: "application/json",
		yaml: "application/yaml",
		yml: "application/yaml",
		xml: "application/xml",
		html: "text/html",
		css: "text/css",
		png: "image/png",
		jpg: "image/jpeg",
		jpeg: "image/jpeg",
		gif: "image/gif",
		webp: "image/webp",
		bmp: "image/bmp",
		svg: "image/svg+xml",
		mp4: "video/mp4",
		webm: "video/webm",
		avi: "video/x-msvideo",
		mov: "video/quicktime",
		mkv: "video/x-matroska",
		m4v: "video/x-m4v",
		flv: "video/x-flv",
		wmv: "video/x-ms-wmv",
		mp3: "audio/mpeg",
		wav: "audio/wav",
		ogg: "audio/ogg",
		flac: "audio/flac",
		aac: "audio/aac",
		m4a: "audio/mp4",
		opus: "audio/opus",
		wma: "audio/x-ms-wma"
	}[e] || "application/octet-stream";
}
function* h(e) {
	let t = [];
	for (let n of e) {
		let e = 0;
		if (t.length > 0) {
			for (; t.length < 3 && e < n.length;) t.push(n[e]), e += 1;
			t.length === 3 && (yield btoa(String.fromCharCode(...t)), t = []);
		}
		let r = e + Math.floor((n.length - e) / 3) * 3;
		for (; e < r;) {
			let t = Math.min(e + 24576, r);
			yield btoa(String.fromCharCode(...n.subarray(e, t))), e = t;
		}
		for (; e < n.length;) t.push(n[e]), e += 1;
	}
	t.length > 0 && (yield btoa(String.fromCharCode(...t)));
}
function g(e) {
	if (e?.aborted) throw e.reason ?? new DOMException("转换已取消", "AbortError");
}
function _(e) {
	return [...h(e)].join("");
}
async function ee(e, t) {
	g(t);
	let n = [], r = 0;
	for (let i of h(e)) n.push(i), r += 1, r >= 32 && (r = 0, await new Promise((e) => setTimeout(e, 0)), g(t));
	return g(t), n.join("");
}
function te(e) {
	return _([new Uint8Array(e)]);
}
async function ne(e) {
	return l(e);
}
async function re(e, t) {
	if (await c(e)) return;
	let n = e.replace(/[/\\][^/\\]+$/, "");
	n && !await c(n) && await o(n, { recursive: !0 }), await a(e, t);
}
async function ie(e, t, n) {
	return u(e, t, n);
}
function v(...e) {
	return e.map((e) => e.replace(/\\/g, "/").replace(/\/+$/, "")).join("/").replace(/\/+/g, "/");
}
function ae(e) {
	try {
		let t = new URL(e), n = decodeURIComponent(t.pathname);
		return /^\/[A-Za-z]:[/\\]/.test(n) ? n.slice(1) : n;
	} catch {
		let t = decodeURIComponent(e.replace(/^file:\/\/+/, ""));
		return /^[A-Za-z]:[/\\]/.test(t) ? t : "/" + t;
	}
}
var oe = typeof navigator < "u" && /win/i.test(navigator.platform || "") ? /[<>:"|?*]/g : /[/]/g;
function y(e) {
	return e.replace(oe, "_");
}
function b(e) {
	let t = /^[\\/]{2}\?[\\/](UNC[\\/])?/.exec(e);
	if (!t) return e;
	let n = e.slice(t[0].length);
	return t[1] ? `\\\\${n}` : n;
}
function x() {
	return d() ? e : null;
}
async function S() {
	if (!d()) return null;
	try {
		return await t();
	} catch {
		return null;
	}
}
async function se() {
	if (!d()) return null;
	try {
		return await n();
	} catch {
		return null;
	}
}
async function C() {
	let e = await S();
	return e ? v(e, "data") : null;
}
var w = null;
function ce(e) {
	w = e && e.trim() ? e.trim() : null;
}
async function le() {
	return w || C();
}
var T = /* @__PURE__ */ new Map();
function E(e, t) {
	t && t.trim() && T.set(e, t.trim());
}
function ue(e) {
	for (let t of e) E(t.id, t.dataFolder);
}
function D(e) {
	return Array.from(e || "").filter((e) => e.charCodeAt(0) > 31).join("").replace(/[<>:"|?*/\\]/g, "_").replace(/^[.\s]+|[.\s]+$/g, "").trim().slice(0, 80) || "project";
}
function de(e, t) {
	let n = t.replace(/-/g, "").slice(0, 8) || t;
	return `${D(e)}-${n}`;
}
function fe(e) {
	return T.get(e) ?? e;
}
async function O(e) {
	let t = fe(e);
	if (w) return v(w, t);
	let n = await S();
	return n ? v(n, "data", t) : null;
}
async function pe(e) {
	if (!d()) return null;
	let t = await O(e);
	if (!t) return null;
	try {
		return await c(t) || await o(t, { recursive: !0 }), t;
	} catch (e) {
		return console.error("Failed to create project data dir:", t, e), null;
	}
}
async function me(e, t) {
	if (!d() || !e) return null;
	let n = await pe(e);
	if (!n) return null;
	let r = v(n, D(t));
	try {
		return await c(r) || (await o(r, { recursive: !0 }), p()), r;
	} catch (e) {
		return console.warn("[fileService] ensureGroupFolder failed:", r, e), null;
	}
}
async function he(e, t, n) {
	if (!d() || !e) return !0;
	let r = await O(e);
	if (!r) return !0;
	let a = v(r, D(t)), s = v(r, D(n));
	if (a === s) return !0;
	try {
		return await c(s) ? !1 : (await c(a) ? await i(a, s) : await o(s, { recursive: !0 }), p(), !0);
	} catch (e) {
		return console.warn("[fileService] renameGroupFolder failed:", a, "→", s, e), !1;
	}
}
async function ge(e, t, n) {
	if (!d() || !e) return null;
	let r = t.replace(/\\/g, "/").replace(/\/+$/, ""), a = b(e).replace(/\\/g, "/");
	if (!a.startsWith(`${r}/`)) return null;
	let s = a.slice(r.length + 1).split("/");
	if (s.length > 2) return null;
	let l = s.length === 2 ? s[0] : null;
	if (l === ".trash" || l === "AppData" || l === n) return null;
	let u = s[s.length - 1], f = n ? v(r, n) : r;
	try {
		if (!await c(a)) return null;
		n && !await c(f) && await o(f, { recursive: !0 });
		let e = await ye(f, u);
		return await i(a, e), e;
	} catch (e) {
		return console.warn("[fileService] moveProjectFileToFolder failed:", a, "→", f, e), null;
	}
}
async function _e(e, t, n) {
	if (!d()) return E(e, n), null;
	let r = t?.trim() || fe(e), a = w || await S();
	if (!a) return null;
	let s = w ? v(a, r) : v(a, "data", r), l = w ? v(a, n) : v(a, "data", n);
	if (!s || !l || s === l) return E(e, n), s && l ? {
		oldDir: s,
		newDir: l,
		oldFolder: r,
		dataFolder: n,
		renamed: !1
	} : null;
	try {
		let t = await c(s), a = await c(l);
		return t && !a ? (await i(s, l), E(e, n), p(), {
			oldDir: s,
			newDir: l,
			oldFolder: r,
			dataFolder: n,
			renamed: !0
		}) : t ? (console.warn("[fileService] Project data dir rename skipped because target exists:", l), null) : (E(e, n), await o(l, { recursive: !0 }), {
			oldDir: s,
			newDir: l,
			oldFolder: r,
			dataFolder: n,
			renamed: !1
		});
	} catch (e) {
		return console.warn("[fileService] renameProjectDataDir failed:", s, "→", l, e), null;
	}
}
async function ve(e, t, n) {
	let r = t?.oldFolder?.trim() || n?.trim();
	if (r ? T.set(e, r) : T.delete(e), !(!t?.renamed || !d())) try {
		await c(t.newDir) && !await c(t.oldDir) && (await i(t.newDir, t.oldDir), p());
	} catch (e) {
		console.error("[fileService] revertProjectDataDirRename failed:", t.newDir, "→", t.oldDir, e);
	}
}
async function ye(e, t) {
	let n = y(t), r = n.lastIndexOf("."), i = r > 0 ? n.slice(0, r) : n, a = r > 0 ? n.slice(r) : "", o = v(e, n);
	try {
		let t = 1;
		for (; await c(o);) o = v(e, `${i}_${t}${a}`), t++;
	} catch {}
	return o;
}
function be(e, t, n) {
	return `${e && e.trim() ? D(e) : D(n)}${t ? t.startsWith(".") ? t : `.${t}` : ""}`;
}
async function xe(e) {
	let t = await x();
	return t ? t(e) : e;
}
var k = {
	image: [
		".png",
		".jpg",
		".jpeg",
		".gif",
		".webp",
		".svg",
		".bmp",
		".ico",
		".tiff",
		".tif"
	],
	video: [
		".mp4",
		".webm",
		".mov",
		".avi",
		".mkv",
		".flv",
		".wmv",
		".m4v"
	],
	audio: [
		".mp3",
		".wav",
		".ogg",
		".aac",
		".flac",
		".wma",
		".m4a",
		".opus"
	],
	text: [
		".txt",
		".md",
		".json",
		".csv",
		".xml",
		".html",
		".css",
		".js",
		".ts",
		".jsx",
		".tsx",
		".yaml",
		".yml",
		".toml",
		".ini",
		".cfg",
		".log"
	],
	other: []
};
function A(e) {
	let t = `.${e.split(".").pop()?.toLowerCase()}`;
	for (let [e, n] of Object.entries(k)) if (n.includes(t)) return e;
	return "other";
}
var Se = {
	image: "图片",
	video: "视频",
	audio: "音频",
	text: "文本",
	other: "其他"
};
async function Ce(e) {
	if (!d()) return [];
	try {
		let t = await r(e), n = [];
		for (let r of t) if (r.isFile) try {
			let t = v(e, r.name), i = await s(t), a = await x(), o = i.size ?? 0, c = `.${r.name.split(".").pop()?.toLowerCase()}`.toLowerCase(), l;
			k.image.includes(c) && a && (l = a(t)), n.push({
				name: r.name,
				path: t,
				assetUrl: l,
				size: o,
				category: A(r.name)
			});
		} catch {}
		return n.sort((e, t) => e.name.localeCompare(t.name, void 0, { numeric: !0 })), n;
	} catch {
		return [];
	}
}
var j = 2 * 1024 * 1024, we = 512 * 1024, Te = 64 * 1024 * 1024, Ee = 128, M = 200, De = 512, Oe = 240, ke = 32, Ae = 256, je = 64, Me = 256, N = 8192, Ne = 256, Pe = 1e7, Fe = 240, Ie = /^[a-z0-9](?:[a-z0-9._-]{0,126}[a-z0-9])?$/, Le = /^[a-f0-9]{64}$/, Re = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i, ze = /[<>"|?*]/, Be = new Set([
	"schemaVersion",
	"sceneId",
	"revision",
	"parent",
	"coordinateSystem",
	"timeline",
	"environment",
	"entities",
	"cameras",
	"shots"
]), Ve = new Set(["revision", "sha256"]), He = new Set([
	"handedness",
	"upAxis",
	"forwardAxis",
	"lengthUnit",
	"angleUnit",
	"rotationOrder"
]), Ue = new Set([
	"fps",
	"startFrame",
	"endFrame"
]), We = new Set(["worldColor", "asset"]), Ge = new Set([
	"r",
	"g",
	"b"
]), Ke = new Set([
	"kind",
	"relativePath",
	"sha256",
	"bytes"
]), qe = new Set([
	"entityId",
	"kind",
	"name",
	"asset",
	"transform",
	"visible"
]), Je = new Set([
	"position",
	"rotationEuler",
	"scale"
]), Ye = new Set([
	"x",
	"y",
	"z"
]), Xe = new Set([
	"cameraId",
	"name",
	"transform",
	"focalLengthMm",
	"sensorWidthMm",
	"apertureFStop",
	"focusDistanceM",
	"keyframes"
]), Ze = new Set([
	"frame",
	"interpolation",
	"transform",
	"focalLengthMm",
	"apertureFStop",
	"focusDistanceM"
]), Qe = new Set([
	"shotId",
	"name",
	"startFrame",
	"endFrame",
	"cameraId"
]), $e = new Set([
	"schemaVersion",
	"sceneId",
	"sceneRevision",
	"sceneSha256",
	"manifestRevision",
	"producer",
	"artifacts"
]), et = new Set([
	"runtime",
	"adapterVersion",
	"blenderVersion"
]), tt = new Set([
	"schemaVersion",
	"sceneId",
	"revision",
	"relativePath",
	"sha256",
	"bytes"
]), nt = new Set([
	"schemaVersion",
	"sceneId",
	"sceneRevision",
	"sceneSha256",
	"manifestRevision",
	"relativePath",
	"sha256",
	"bytes"
]), rt = new Set([
	"artifactId",
	"kind",
	"mimeType",
	"relativePath",
	"sha256",
	"bytes",
	"frame"
]), it = new Set([
	"artifactId",
	"kind",
	"mimeType",
	"relativePath",
	"sha256",
	"bytes",
	"startFrame",
	"endFrame",
	"fps"
]), at = new Set([
	"artifactId",
	"kind",
	"mimeType",
	"relativePath",
	"sha256",
	"bytes"
]), ot = class extends Error {
	name = "DirectorSceneSchemaError";
	code;
	constructor(e, t) {
		super(t), this.code = e;
	}
};
function P(e, t) {
	throw new ot(e, t);
}
function F(e) {
	return Array.from(e).some((e) => {
		let t = e.charCodeAt(0);
		return t <= 31 || t >= 127 && t <= 159;
	});
}
function I(e, t) {
	return (typeof e != "object" || !e || Array.isArray(e)) && P("invalid-value", `${t} 必须是对象`), e;
}
function L(e, t, n) {
	let r = Object.keys(e).find((e) => !t.has(e));
	r && P("unknown-field", `${n} 包含不支持的字段: ${r}`);
}
function R(e, t) {
	return Number.isSafeInteger(e) || P("invalid-value", `${t} 必须是安全整数`), e !== 1 && (e > 1 && P("unsupported-schema", `${t}=${String(e)} 需要升级应用`), P("invalid-value", `${t} 必须为 1`)), 1;
}
function z(e, t, n) {
	typeof e != "string" && P("invalid-value", `${t} 必须是字符串`), e.length > n && P("limit-exceeded", `${t} 超过长度上限`), F(e) && P("invalid-value", `${t} 包含控制字符`);
	let r = e.trim();
	return r || P("invalid-value", `${t} 不能为空`), r !== e && P("invalid-value", `${t} 不允许首尾空白`), e;
}
function B(e, t) {
	let n = z(e, t, Ee);
	return Ie.test(n) || P("invalid-value", `${t} 只能包含小写字母、数字、点、下划线和短横线`), n;
}
function V(e, t) {
	return (typeof e != "string" || !Le.test(e)) && P("invalid-value", `${t} 必须是小写 SHA-256`), e;
}
function H(e, t, n = 2 ** 53 - 1) {
	return (!Number.isSafeInteger(e) || e <= 0) && P("invalid-value", `${t} 必须是正安全整数`), e > n && P("limit-exceeded", `${t} 超过上限`), e;
}
function U(e, t) {
	return (!Number.isSafeInteger(e) || e < 0) && P("invalid-value", `${t} 必须是非负安全整数`), e > Pe && P("limit-exceeded", `${t} 超过帧号上限`), e;
}
function W(e, t, n = {}) {
	return (typeof e != "number" || !Number.isFinite(e)) && P("invalid-value", `${t} 必须是有限数字`), n.min !== void 0 && e < n.min && P("invalid-value", `${t} 不能小于 ${n.min}`), n.max !== void 0 && e > n.max && P("limit-exceeded", `${t} 不能大于 ${n.max}`), e;
}
function st(e, t) {
	return typeof e != "boolean" && P("invalid-value", `${t} 必须是布尔值`), e;
}
function G(e, t, n) {
	return e !== t && P("invalid-value", `${n} 必须为 ${t}`), t;
}
function K(e, t, n) {
	return (typeof e != "string" || !t.includes(e)) && P("invalid-value", `${n} 是不支持的值`), e;
}
function q(e, t, n) {
	return Array.isArray(e) || P("invalid-value", `${t} 必须是数组`), e.length > n && P("limit-exceeded", `${t} 超过数量上限`), e;
}
function J(e, t) {
	new Set(e).size !== e.length && P("invalid-value", `${t} 不能包含重复项`);
}
function ct(e) {
	return new TextEncoder().encode(e).byteLength;
}
function lt(e, t, n) {
	ct(e) > t && P("limit-exceeded", `${n} 超过 ${t} 字节上限`);
}
function Y(e, t = "项目相对路径") {
	(typeof e != "string" || !e) && P("invalid-value", `${t} 必须是非空字符串`), e.length > De && P("limit-exceeded", `${t} 超过长度上限`), (F(e) || ze.test(e) || e.includes("\\") || e.includes(":") || e.startsWith("/") || e.startsWith("~")) && P("invalid-value", `${t} 必须是安全的项目相对路径`);
	let n = e.split("/");
	n.length > ke && P("limit-exceeded", `${t} 目录层级过深`);
	for (let e of n) (!e || e === "." || e === ".." || e.toLowerCase() === ".trash" || e.endsWith(".") || e.endsWith(" ") || Re.test(e)) && P("invalid-value", `${t} 包含不安全的路径段`), e.length > Oe && P("limit-exceeded", `${t} 的路径段过长`);
	return e;
}
function X(e, t, n) {
	let r = I(e, t);
	return L(r, Ye, t), {
		x: W(r.x, `${t}.x`, n),
		y: W(r.y, `${t}.y`, n),
		z: W(r.z, `${t}.z`, n)
	};
}
function Z(e, t) {
	let n = I(e, t);
	L(n, Je, t);
	let r = X(n.scale, `${t}.scale`, {
		min: 0,
		max: 1e4
	});
	return (r.x <= 0 || r.y <= 0 || r.z <= 0) && P("invalid-value", `${t}.scale 必须大于 0`), {
		position: X(n.position, `${t}.position`, {
			min: -1e6,
			max: 1e6
		}),
		rotationEuler: X(n.rotationEuler, `${t}.rotationEuler`, {
			min: -1e6,
			max: 1e6
		}),
		scale: r
	};
}
function ut(e, t = "项目文件引用") {
	let n = I(e, t);
	return L(n, Ke, t), {
		kind: G(n.kind, "project-file", `${t}.kind`),
		relativePath: Y(n.relativePath, `${t}.relativePath`),
		sha256: V(n.sha256, `${t}.sha256`),
		bytes: H(n.bytes, `${t}.bytes`)
	};
}
function dt(e) {
	let t = I(e, "environment");
	L(t, We, "environment");
	let n = I(t.worldColor, "environment.worldColor");
	L(n, Ge, "environment.worldColor");
	let r = {
		r: W(n.r, "environment.worldColor.r", {
			min: 0,
			max: 1
		}),
		g: W(n.g, "environment.worldColor.g", {
			min: 0,
			max: 1
		}),
		b: W(n.b, "environment.worldColor.b", {
			min: 0,
			max: 1
		})
	};
	return t.asset === void 0 ? { worldColor: r } : {
		worldColor: r,
		asset: ut(t.asset, "environment.asset")
	};
}
function ft(e, t) {
	let n = `entities[${t}]`, r = I(e, n);
	return L(r, qe, n), {
		entityId: B(r.entityId, `${n}.entityId`),
		kind: K(r.kind, ["character", "prop"], `${n}.kind`),
		name: z(r.name, `${n}.name`, M),
		asset: ut(r.asset, `${n}.asset`),
		transform: Z(r.transform, `${n}.transform`),
		visible: st(r.visible, `${n}.visible`)
	};
}
function Q(e, t, n) {
	return e === void 0 ? void 0 : W(e, t, n);
}
function pt(e, t, n) {
	let r = `cameras[${t}].keyframes[${n}]`, i = I(e, r);
	L(i, Ze, r);
	let a = Q(i.focalLengthMm, `${r}.focalLengthMm`, {
		min: .1,
		max: 2e3
	}), o = Q(i.apertureFStop, `${r}.apertureFStop`, {
		min: .1,
		max: 128
	}), s = Q(i.focusDistanceM, `${r}.focusDistanceM`, {
		min: 0,
		max: 1e9
	});
	return {
		frame: U(i.frame, `${r}.frame`),
		interpolation: K(i.interpolation, [
			"constant",
			"linear",
			"bezier"
		], `${r}.interpolation`),
		transform: Z(i.transform, `${r}.transform`),
		...a === void 0 ? {} : { focalLengthMm: a },
		...o === void 0 ? {} : { apertureFStop: o },
		...s === void 0 ? {} : { focusDistanceM: s }
	};
}
function mt(e, t) {
	let n = `cameras[${t}]`, r = I(e, n);
	L(r, Xe, n);
	let i = q(r.keyframes, `${n}.keyframes`, N).map((e, n) => pt(e, t, n));
	for (let e = 1; e < i.length; e += 1) i[e].frame <= i[e - 1].frame && P("invalid-value", `${n}.keyframes 必须按 frame 严格递增`);
	return {
		cameraId: B(r.cameraId, `${n}.cameraId`),
		name: z(r.name, `${n}.name`, M),
		transform: Z(r.transform, `${n}.transform`),
		focalLengthMm: W(r.focalLengthMm, `${n}.focalLengthMm`, {
			min: .1,
			max: 2e3
		}),
		sensorWidthMm: W(r.sensorWidthMm, `${n}.sensorWidthMm`, {
			min: .1,
			max: 1e3
		}),
		apertureFStop: W(r.apertureFStop, `${n}.apertureFStop`, {
			min: .1,
			max: 128
		}),
		focusDistanceM: W(r.focusDistanceM, `${n}.focusDistanceM`, {
			min: 0,
			max: 1e9
		}),
		keyframes: i
	};
}
function ht(e, t) {
	let n = `shots[${t}]`, r = I(e, n);
	L(r, Qe, n);
	let i = U(r.startFrame, `${n}.startFrame`), a = U(r.endFrame, `${n}.endFrame`);
	return a < i && P("invalid-value", `${n}.endFrame 不能早于 startFrame`), {
		shotId: B(r.shotId, `${n}.shotId`),
		name: z(r.name, `${n}.name`, M),
		startFrame: i,
		endFrame: a,
		cameraId: B(r.cameraId, `${n}.cameraId`)
	};
}
function $(e) {
	let t = I(e, "Director Scene");
	L(t, Be, "Director Scene");
	let n = R(t.schemaVersion, "schemaVersion"), r = H(t.revision, "revision"), i;
	if (t.parent === null) i = null;
	else {
		let e = I(t.parent, "parent");
		L(e, Ve, "parent"), i = {
			revision: H(e.revision, "parent.revision"),
			sha256: V(e.sha256, "parent.sha256")
		};
	}
	r === 1 && i !== null && P("invalid-value", "revision=1 时 parent 必须为 null"), r > 1 && (i === null || i.revision !== r - 1) && P("reference-mismatch", "parent 必须绑定上一 Scene revision");
	let a = I(t.coordinateSystem, "coordinateSystem");
	L(a, He, "coordinateSystem");
	let o = {
		handedness: G(a.handedness, "right", "coordinateSystem.handedness"),
		upAxis: G(a.upAxis, "Z", "coordinateSystem.upAxis"),
		forwardAxis: G(a.forwardAxis, "-Y", "coordinateSystem.forwardAxis"),
		lengthUnit: G(a.lengthUnit, "meter", "coordinateSystem.lengthUnit"),
		angleUnit: G(a.angleUnit, "degree", "coordinateSystem.angleUnit"),
		rotationOrder: G(a.rotationOrder, "XYZ", "coordinateSystem.rotationOrder")
	}, s = I(t.timeline, "timeline");
	L(s, Ue, "timeline");
	let c = {
		fps: W(s.fps, "timeline.fps", {
			min: 1,
			max: Fe
		}),
		startFrame: U(s.startFrame, "timeline.startFrame"),
		endFrame: U(s.endFrame, "timeline.endFrame")
	};
	c.endFrame < c.startFrame && P("invalid-value", "timeline.endFrame 不能早于 startFrame");
	let l = q(t.entities, "entities", Ae).map((e, t) => ft(e, t)), u = [], d = 0, f = q(t.cameras, "cameras", je);
	f.forEach((e, t) => {
		let n = q(I(e, `cameras[${t}]`).keyframes, `cameras[${t}].keyframes`, N);
		d += n.length, d > N && P("limit-exceeded", "camera keyframes 总数超过上限");
	}), f.forEach((e, t) => u.push(mt(e, t)));
	let p = q(t.shots, "shots", Me).map((e, t) => ht(e, t));
	J(l.map((e) => e.entityId), "entityId"), J(u.map((e) => e.cameraId), "cameraId"), J(p.map((e) => e.shotId), "shotId");
	let m = new Set(u.map((e) => e.cameraId));
	for (let e of u) e.keyframes.some((e) => e.frame < c.startFrame || e.frame > c.endFrame) && P("reference-mismatch", `camera ${e.cameraId} 的关键帧超出 timeline`);
	for (let e of p) m.has(e.cameraId) || P("reference-mismatch", `shot ${e.shotId} 引用了不存在的 camera`), (e.startFrame < c.startFrame || e.endFrame > c.endFrame) && P("reference-mismatch", `shot ${e.shotId} 超出 timeline`);
	return {
		schemaVersion: n,
		sceneId: B(t.sceneId, "sceneId"),
		revision: r,
		parent: i,
		coordinateSystem: o,
		timeline: c,
		environment: dt(t.environment),
		entities: l,
		cameras: u,
		shots: p
	};
}
function gt(e, t, n) {
	typeof e != "string" && P("invalid-json", `${t} 必须是 JSON 字符串`), lt(e, n, t);
	try {
		return JSON.parse(e);
	} catch {
		P("invalid-json", `${t} 不是有效 JSON`);
	}
}
function _t(e) {
	return $(gt(e, "Director Scene JSON", j));
}
function vt(e) {
	let t = `${JSON.stringify($(e), null, 2)}\n`;
	return lt(t, j, "Director Scene JSON"), t;
}
function yt(e, t, n) {
	return `director/scenes/${B(e, "sceneId")}/scene-r${H(t, "revision")}-${V(n, "sha256")}.json`;
}
function bt(e, t, n) {
	return `director/scenes/${B(e, "sceneId")}/results/manifest-r${H(t, "manifestRevision")}-${V(n, "sha256")}.json`;
}
function xt(e, t, n, r) {
	return `director/scenes/${B(e, "sceneId")}/results/${B(t, "artifactId")}-${V(n, "sha256")}.${{
		"frame-image": "png",
		"reference-video": "mp4",
		"blend-project": "blend"
	}[K(r, [
		"frame-image",
		"reference-video",
		"blend-project"
	], "artifact.kind")]}`;
}
function St(e) {
	let t = I(e, "Director Scene reference");
	L(t, tt, "Director Scene reference");
	let n = {
		schemaVersion: R(t.schemaVersion, "reference.schemaVersion"),
		sceneId: B(t.sceneId, "reference.sceneId"),
		revision: H(t.revision, "reference.revision"),
		relativePath: Y(t.relativePath, "reference.relativePath"),
		sha256: V(t.sha256, "reference.sha256"),
		bytes: H(t.bytes, "reference.bytes", j)
	}, r = yt(n.sceneId, n.revision, n.sha256);
	return n.relativePath !== r && P("reference-mismatch", "Director Scene reference 路径与内容标识不匹配"), n;
}
function Ct(e, t, n) {
	let r = `artifacts[${n}]`, i = I(e, r), a = K(i.kind, [
		"frame-image",
		"reference-video",
		"blend-project"
	], `${r}.kind`);
	L(i, a === "frame-image" ? rt : a === "reference-video" ? it : at, r);
	let o = B(i.artifactId, `${r}.artifactId`), s = V(i.sha256, `${r}.sha256`), c = Y(i.relativePath, `${r}.relativePath`), l = H(i.bytes, `${r}.bytes`);
	if (c !== xt(t, o, s, a) && P("reference-mismatch", `${r}.relativePath 与 artifact 标识不匹配`), a === "frame-image") return {
		artifactId: o,
		kind: a,
		mimeType: G(i.mimeType, "image/png", `${r}.mimeType`),
		relativePath: c,
		sha256: s,
		bytes: l,
		frame: U(i.frame, `${r}.frame`)
	};
	if (a === "reference-video") {
		let e = U(i.startFrame, `${r}.startFrame`), t = U(i.endFrame, `${r}.endFrame`);
		return t < e && P("invalid-value", `${r}.endFrame 不能早于 startFrame`), {
			artifactId: o,
			kind: a,
			mimeType: G(i.mimeType, "video/mp4", `${r}.mimeType`),
			relativePath: c,
			sha256: s,
			bytes: l,
			startFrame: e,
			endFrame: t,
			fps: W(i.fps, `${r}.fps`, {
				min: 1,
				max: Fe
			})
		};
	}
	return {
		artifactId: o,
		kind: a,
		mimeType: G(i.mimeType, "application/x-blender", `${r}.mimeType`),
		relativePath: c,
		sha256: s,
		bytes: l
	};
}
function wt(e) {
	let t = I(e, "Director Result Manifest");
	L(t, $e, "Director Result Manifest");
	let n = R(t.schemaVersion, "schemaVersion"), r = B(t.sceneId, "sceneId"), i = I(t.producer, "producer");
	L(i, et, "producer");
	let a = K(i.runtime, ["lightweight-web", "blender"], "producer.runtime"), o = z(i.adapterVersion, "producer.adapterVersion", 64), s;
	a === "lightweight-web" ? (i.blenderVersion !== void 0 && P("invalid-value", "lightweight-web producer 不能声明 blenderVersion"), s = {
		runtime: a,
		adapterVersion: o
	}) : s = {
		runtime: a,
		adapterVersion: o,
		blenderVersion: z(i.blenderVersion, "producer.blenderVersion", 64)
	};
	let c = q(t.artifacts, "artifacts", Ne).map((e, t) => Ct(e, r, t));
	return J(c.map((e) => e.artifactId), "artifactId"), J(c.map((e) => e.relativePath), "artifact relativePath"), a === "lightweight-web" && c.some((e) => e.kind === "blend-project") && P("invalid-value", "lightweight-web producer 不能声明 blend-project artifact"), {
		schemaVersion: n,
		sceneId: r,
		sceneRevision: H(t.sceneRevision, "sceneRevision"),
		sceneSha256: V(t.sceneSha256, "sceneSha256"),
		manifestRevision: H(t.manifestRevision, "manifestRevision"),
		producer: s,
		artifacts: c
	};
}
function Tt(e) {
	let t = I(e, "Director Result Manifest reference");
	L(t, nt, "Director Result Manifest reference");
	let n = {
		schemaVersion: R(t.schemaVersion, "reference.schemaVersion"),
		sceneId: B(t.sceneId, "reference.sceneId"),
		sceneRevision: H(t.sceneRevision, "reference.sceneRevision"),
		sceneSha256: V(t.sceneSha256, "reference.sceneSha256"),
		manifestRevision: H(t.manifestRevision, "reference.manifestRevision"),
		relativePath: Y(t.relativePath, "reference.relativePath"),
		sha256: V(t.sha256, "reference.sha256"),
		bytes: H(t.bytes, "reference.bytes", we)
	}, r = bt(n.sceneId, n.manifestRevision, n.sha256);
	return n.relativePath !== r && P("reference-mismatch", "Director Result Manifest reference 路径与内容标识不匹配"), n;
}
function Et(e, t) {
	let n = wt(e), r = St(t);
	(n.sceneId !== r.sceneId || n.sceneRevision !== r.revision || n.sceneSha256 !== r.sha256) && P("reference-mismatch", "Result Manifest 与 Director Scene reference 不匹配");
}
//#endregion
export { m as A, he as B, ae as C, x as D, le as E, ge as F, D as G, ye as H, p as I, ie as J, ce as K, ne as L, d as M, v as N, C as O, Ce as P, E as R, pe as S, xe as T, ve as U, _e as V, y as W, de as _, Y as a, re as b, $ as c, vt as d, k as f, be as g, te as h, yt as i, O as j, A as k, St as l, f as m, j as n, wt as o, Se as p, b as q, Et as r, Tt as s, Te as t, _t as u, _ as v, se as w, me as x, ee as y, ue as z };
