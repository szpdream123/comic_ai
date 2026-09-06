import { i as e } from "./react-Dfufv8pq.js";
import { a as t } from "./core-CoHQ9AE0.js";
import { i as n, n as r } from "./path-C7M6ZesM.js";
import { a as i, c as a, d as o, i as s, l as c, n as l, o as u } from "./dist-js-DL_alM4B.js";
import { i as d, r as f } from "./dist-js-De6wNmmK.js";
import { a as p } from "./event-h5Ir25pQ.js";
import { At as m, Ct as h, Dt as ee, E as te, Et as ne, J as re, Mt as ie, Ot as ae, P as oe, Pt as se, R as ce, St as le, Y as ue, _ as de, _t as fe, b as pe, bt as me, f as he, gt as ge, jt as _e, k as ve, v as ye, vt as be, wt as xe, y as Se, z as Ce } from "./indexedDbService-wXUqJvjT.js";
import { A as g, B as we, C as Te, D as _, E as Ee, F as De, G as Oe, H as v, I as y, J as ke, K as Ae, L as je, M as b, N as x, O as Me, P as Ne, R as Pe, S, T as C, U as Fe, V as Ie, W as w, _ as Le, b as Re, f as ze, g as T, h as Be, j as E, k as Ve, l as He, m as Ue, p as We, q as D, s as Ge, v as Ke, w as qe, x as Je, y as Ye, z as Xe } from "./directorSceneSchema-BcP-NXqL.js";
import { s as Ze } from "./dramaAssets-BblLUZy_.js";
//#region src/services/fs/assetIndex.ts
function O(e) {
	return D(e).replace(/\\/g, "/").replace(/\/+$/, "");
}
function Qe(e, t) {
	let n = O(e), r = O(t), i = /^[A-Za-z]:\//.test(n) ? n.toLowerCase() : n, a = /^[A-Za-z]:\//.test(r) ? r.toLowerCase() : r;
	if (i.startsWith(`${a}/`)) return n.slice(r.length + 1);
}
function $e() {
	return globalThis.crypto?.randomUUID?.() ?? `asset-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
async function et(e) {
	return l(e).catch(() => !1);
}
async function tt(e, t) {
	let n = await te(t).catch(() => void 0);
	n?.tags?.length && await Ce({
		assetId: e,
		path: t,
		tags: n.tags,
		taggedBy: n.taggedBy,
		updatedAt: n.updatedAt
	}).catch(() => void 0);
}
async function k(e, t) {
	let n = O(e), r = t.size == null || t.mtimeMs == null ? await c(n) : null, i = t.size ?? r?.size ?? 0, a = t.mtimeMs ?? r?.mtime?.getTime() ?? 0, o = `${i}:${a}`, s = t.rootPath ? O(t.rootPath) : void 0, l = s ? Qe(n, s) : void 0, u = t.assetId ? await ye(t.assetId) : void 0;
	if (u ??= await Se(n), !u) {
		let e = await pe(o);
		for (let t of e) if (!await et(t.path)) {
			u = t;
			break;
		}
	}
	let d = {
		assetId: u?.assetId ?? t.assetId ?? $e(),
		path: n,
		relativePath: l,
		rootPath: s,
		projectId: t.projectId,
		source: t.source,
		fingerprint: o,
		size: i,
		mtimeMs: a,
		status: "online",
		updatedAt: Date.now()
	};
	return await ce(d), await tt(d.assetId, n), d;
}
async function nt(e) {
	let t = await ye(e);
	return !t || !await et(t.path) ? null : t.path;
}
//#endregion
//#region src/services/fs/trash.ts
var rt = "director-scene:";
function A(e) {
	return typeof e == "string" && e.trim() ? e : null;
}
function it(e) {
	let t = /* @__PURE__ */ new Set();
	try {
		t.add(He(e.directorScene).sceneId);
	} catch {}
	try {
		t.add(Ge(e.directorResultManifest).sceneId);
	} catch {}
	return t.size <= 1 ? [...t] : [];
}
function at(e) {
	return `${rt}${e}`;
}
function ot(e) {
	let t = /* @__PURE__ */ new Set(), n = A(e.filePath);
	return n && t.add(n), Array.isArray(e.directorCaptureFilePaths) && e.directorCaptureFilePaths.forEach((e) => {
		let n = A(e);
		n && t.add(n);
	}), Array.isArray(e.storyboardOverrides) && e.storyboardOverrides.forEach((e) => {
		if (!e || typeof e != "object" || Array.isArray(e)) return;
		let n = A(e.filePath);
		n && t.add(n);
	}), it(e).forEach((e) => {
		t.add(at(e));
	}), t;
}
async function st(e, t, n) {
	let r = [...ot(e)].filter((e) => !e.startsWith(rt));
	if (t === void 0) {
		let t = A(e.filePath);
		return t && !n?.has(t) ? [t] : [];
	}
	if (!t) return [];
	let i = await E(t).catch(() => null);
	if (!i) return [];
	let a = it(e).map((e) => ({
		sceneId: e,
		path: x(i, "director", "scenes", e)
	})), o = /* @__PURE__ */ new Set();
	for (let e of a) !(n?.has(at(e.sceneId)) || [...n ?? []].some((t) => !t.startsWith(rt) && M(t, e.path))) && M(e.path, i) && o.add(e.path);
	for (let e of r) n?.has(e) || a.some((t) => M(e, t.path)) || (M(e, i) ? o.add(e) : console.warn("[fileService] 跳过删除非本项目文件:", e));
	return [...o];
}
async function ct(e) {
	if (b()) try {
		await t("move_to_trash", { path: e }), console.log("[fileService] Moved to trash:", e);
	} catch (t) {
		console.warn("[fileService] Failed to move to trash:", e, t);
	}
}
var j = /* @__PURE__ */ new Map(), lt = /* @__PURE__ */ new Set();
function ut(e) {
	let t = e.replace(/\\/g, "/"), n = t.lastIndexOf("/");
	return n >= 0 ? x(t.substring(0, n), ".trash") : ".trash";
}
async function dt(e) {
	if (b()) try {
		if (!await l(e)) return;
		let t = ut(e);
		await s(t, { recursive: !0 });
		let n = e.split(/[/\\]/).pop() || "file", r = x(t, `${Date.now()}-${n}`);
		await a(e, r), j.set(e, r), y(), console.log("[fileService] Staged in undo-trash:", e, "→", r);
	} catch (t) {
		console.warn("[fileService] Failed to stage in undo-trash, file left in place:", e, t);
	}
}
async function ft(e) {
	if (!b()) return !1;
	try {
		return !await l(e);
	} catch {
		return !1;
	}
}
async function pt(e) {
	if (!b()) return !1;
	let t = j.get(e);
	if (!t) return !1;
	try {
		return await l(t) ? (await a(t, e), j.delete(e), y(), console.log("[fileService] Restored from undo-trash:", e), !0) : (j.delete(e), !1);
	} catch (t) {
		return console.warn("[fileService] Failed to restore from undo-trash:", e, t), !1;
	}
}
async function mt() {
	if (!b()) return;
	let e = /* @__PURE__ */ new Set();
	for (let [t] of j) e.add(ut(t));
	for (let n of e) try {
		await l(n) && (await t("move_to_trash", { path: n }), console.log("[fileService] Flushed undo-trash dir to system trash:", n));
	} catch (e) {
		console.warn("[fileService] Failed to flush undo-trash dir:", n, e);
	}
	j.clear();
}
async function ht(e) {
	if (b()) try {
		await t("move_to_trash", { path: e }), console.log("[fileService] Moved dir to trash:", e);
	} catch (t) {
		console.warn("[fileService] Failed to move dir to trash:", e, t);
	}
}
async function gt(e) {
	if (!b()) return;
	let t = await E(e);
	if (t) try {
		await ht(t), console.log("[fileService] Deleted project data dir:", t);
	} catch (e) {
		console.warn("[fileService] Failed to delete project data dir:", t, e);
	}
}
function M(e, t) {
	let n = e.replace(/\\/g, "/").toLowerCase(), r = t.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
	return r ? n.startsWith(`${r}/`) : !1;
}
function _t(e, t, n) {
	let r = (async () => {
		let r = await st(e, n, t);
		await Promise.all(r.map((e) => dt(e)));
	})();
	return lt.add(r), r.finally(() => lt.delete(r));
}
async function vt() {
	for (; lt.size > 0;) await Promise.allSettled([...lt]);
}
//#endregion
//#region src/services/fs/assetLibrary.ts
async function N() {
	let e = await Ee();
	return e ? x(e, "file") : null;
}
async function yt() {
	if (!b()) return null;
	let e = await N();
	if (!e) return null;
	try {
		return await l(e) || await s(e, { recursive: !0 }), e;
	} catch (t) {
		return console.error("Failed to create global files dir:", e, t), null;
	}
}
async function bt() {
	let e = await N();
	if (!e || !await l(e).catch(() => !1)) return [];
	let t = await Ne(e);
	return Promise.all(t.map(async (t) => {
		let n = await k(t.path, {
			rootPath: e,
			source: "global",
			size: t.size
		});
		return {
			...t,
			assetId: n.assetId,
			relativePath: n.relativePath,
			source: "global",
			availability: "online"
		};
	}));
}
async function P(e, t = {}) {
	if (!b()) return [];
	let n = t.maxFiles ?? 3e3, r = t.maxDepth ?? 8, a = await _(), o = [], s = [{
		dir: e,
		depth: 0
	}];
	for (; s.length > 0 && o.length < n;) {
		let { dir: t, depth: l } = s.pop(), u;
		try {
			u = await i(t);
		} catch {
			continue;
		}
		let d = u.filter((e) => e.isFile), f = u.filter((e) => e.isDirectory), p = await Promise.all(d.map(async (e) => {
			let n = x(t, e.name);
			try {
				let t = await c(n);
				return {
					name: e.name,
					filePath: n,
					size: t.size ?? 0,
					mtimeMs: t.mtime?.getTime() ?? 0
				};
			} catch {
				return null;
			}
		}));
		for (let t of p) {
			if (!t) continue;
			if (o.length >= n) break;
			let r = `.${t.name.split(".").pop()?.toLowerCase()}`, i;
			ze.image.includes(r) && a && (i = a(t.filePath));
			let s = await k(t.filePath, {
				rootPath: e,
				source: "folder",
				size: t.size,
				mtimeMs: t.mtimeMs
			});
			o.push({
				assetId: s.assetId,
				name: t.name,
				path: t.filePath,
				relativePath: s.relativePath,
				assetUrl: i,
				size: t.size,
				category: Ve(t.name),
				availability: "online"
			});
		}
		if (l < r) for (let e of f) s.push({
			dir: x(t, e.name),
			depth: l + 1
		});
	}
	return o;
}
async function xt(e, t = {}) {
	if (!b() || e.length === 0) return [];
	let n = t.maxFilesPerFolder ?? 3e3;
	return (await Promise.all(e.map(async (e) => await l(e).catch(() => !1) ? (await P(e, { maxFiles: n })).map((t) => ({
		...t,
		source: "folder",
		folderRoot: e
	})) : []))).flat();
}
async function St() {
	if (!b()) return 0;
	let e = await f({
		multiple: !0,
		title: "添加文件到资产库"
	});
	if (!e) return 0;
	let t = Array.isArray(e) ? e : [e], n = await yt();
	if (!n) return 0;
	let r = 0;
	for (let e of t) try {
		await o(await v(n, e.split(/[\\/]/).pop() || "file"), await u(e)), r++;
	} catch (t) {
		console.error("Failed to add file to global:", e, t);
	}
	return r;
}
async function Ct() {
	if (!b()) return null;
	let e = await f({
		directory: !0,
		title: "添加本地文件夹"
	});
	return !e || Array.isArray(e) ? typeof e == "string" ? e : null : e;
}
async function wt(e) {
	if (!b()) return null;
	let t = await yt();
	if (!t) return null;
	try {
		let n = await v(t, e.split(/[\\/]/).pop() || "file");
		return await o(n, await u(e)), n;
	} catch (t) {
		return console.error("Failed to save file to permanent:", e, t), null;
	}
}
async function Tt(e) {
	if (!b()) return null;
	if (e.path.startsWith("virtual://")) {
		if (!e.assetUrl || !e.assetUrl.startsWith("data:")) return null;
		let t = await yt();
		if (!t) return null;
		try {
			let n = await v(t, e.name), r = e.assetUrl.match(/^data:(.+?);base64,(.+)$/);
			if (r) {
				let e = r[2], t = atob(e), i = new Uint8Array(t.length);
				for (let e = 0; e < t.length; e++) i[e] = t.charCodeAt(e);
				await o(n, i);
			} else {
				let t = await (await fetch(e.assetUrl)).arrayBuffer();
				await o(n, new Uint8Array(t));
			}
			return n;
		} catch (t) {
			return console.error("Failed to save virtual asset to permanent:", e.name, t), null;
		}
	}
	return wt(e.path);
}
async function Et(e) {
	await ct(e);
}
//#endregion
//#region src/services/providerSecretService.ts
var F = "secret:";
function I(e) {
	return typeof e == "object" && !!e && !Array.isArray(e);
}
function Dt(e) {
	return I(e) ? e : null;
}
function Ot(e) {
	return `${F}provider/${e.replace(/[^A-Za-z0-9._-]/g, "_").replace(/\.{2,}/g, "_")}`;
}
function kt(e) {
	return e.startsWith(F) ? e.slice(7) : null;
}
async function At(e, n) {
	return t(e, n);
}
async function jt() {
	if (!b()) return !1;
	try {
		return await t("secret_store_available");
	} catch (e) {
		return console.warn("[providerSecret] 凭据存储探测失败:", e), !1;
	}
}
async function Mt(e, t) {
	let n = kt(e);
	if (!n || !b()) return !1;
	try {
		return await At("secret_set", {
			key: n,
			value: t
		}), !0;
	} catch (t) {
		return console.warn("[providerSecret] 写入凭据存储失败:", e, t), !1;
	}
}
async function Nt(e) {
	let t = kt(e);
	if (!t || !b()) return null;
	try {
		return await At("secret_get", { key: t }) ?? null;
	} catch (t) {
		return console.warn("[providerSecret] 读取凭据存储失败:", e, t), null;
	}
}
async function Pt(e, t) {
	return Mt(`${F}${e}`, t);
}
async function Ft(e) {
	return Nt(`${F}${e}`);
}
async function It(e) {
	let t = kt(Ot(e));
	if (!(!t || !b())) try {
		await At("secret_delete", { key: t });
	} catch (t) {
		console.warn("[providerSecret] 删除凭据存储条目失败:", e, t);
	}
}
async function Lt(e) {
	let t = Dt(e);
	if (!t) return {
		config: e,
		unstored: []
	};
	let n = I(t.providers) ? t.providers : void 0, r = {}, i = [];
	for (let [e, t] of Object.entries(n ?? {})) {
		if (!I(t)) {
			r[e] = t;
			continue;
		}
		let n = typeof t.apiKey == "string" ? t.apiKey : "", { apiKey: a, ...o } = t;
		if (!n) {
			r[e] = {
				...o,
				apiKey: ""
			};
			continue;
		}
		let s = Ot(e);
		if (await Mt(s, n)) r[e] = {
			...o,
			apiKey: "",
			apiKeyRef: s
		};
		else {
			i.push(e);
			let { apiKeyRef: t, ...n } = o;
			r[e] = {
				...n,
				apiKey: ""
			};
		}
	}
	let a = { ...t };
	if (n && (a.providers = r), I(t.dreaminaAuth) && "cookie" in t.dreaminaAuth) {
		let { cookie: e, ...n } = t.dreaminaAuth;
		a.dreaminaAuth = n;
	}
	return {
		config: a,
		unstored: i
	};
}
async function Rt(e) {
	let t = Dt(e);
	if (!t || !I(t.providers)) return {
		config: e,
		migrated: !1,
		missing: []
	};
	let n = {}, r = [], i = !1;
	for (let [e, a] of Object.entries(t.providers)) {
		if (!I(a)) {
			n[e] = a;
			continue;
		}
		let t = typeof a.apiKey == "string" ? a.apiKey : "", o = typeof a.apiKeyRef == "string" ? a.apiKeyRef : "";
		if (t) {
			let r = Ot(e), o = await Mt(r, t);
			i ||= o, n[e] = o ? {
				...a,
				apiKey: t,
				apiKeyRef: r
			} : {
				...a,
				apiKey: t
			};
			continue;
		}
		if (!o) {
			n[e] = a;
			continue;
		}
		let s = await Nt(o);
		s ? n[e] = {
			...a,
			apiKey: s
		} : (r.push(e), n[e] = {
			...a,
			apiKey: ""
		});
	}
	return {
		config: {
			...t,
			providers: n
		},
		migrated: i,
		missing: r
	};
}
//#endregion
//#region src/services/storageService.ts
var zt = [
	"imageUrl",
	"videoUrl",
	"audioUrl",
	"thumbnailUrl",
	"sourceUrl",
	"output"
];
function Bt(e) {
	return typeof e == "string" && (/^data:(?:image|video|audio)\//i.test(e) || /^blob:/i.test(e));
}
function Vt(e, t) {
	let n = /^data:([^;,]+)/i.exec(e)?.[1]?.toLowerCase(), r = {
		"image/png": ".png",
		"image/jpeg": ".jpg",
		"image/webp": ".webp",
		"image/gif": ".gif",
		"video/mp4": ".mp4",
		"video/webm": ".webm",
		"video/quicktime": ".mov",
		"audio/mpeg": ".mp3",
		"audio/wav": ".wav",
		"audio/ogg": ".ogg"
	};
	return n && r[n] ? r[n] : t.type === "ai-video" || t.type === "source-video" ? ".mp4" : t.type === "ai-audio" || t.type === "source-audio" ? ".mp3" : ".png";
}
async function Ht(e) {
	let t = /^data:[^,]*;base64,([\s\S]*)$/i.exec(e);
	if (t) {
		let e = atob(t[1].replace(/\s/g, ""));
		return Uint8Array.from(e, (e) => e.charCodeAt(0));
	}
	let n = await fetch(e);
	if (!n.ok) throw Error(`读取已存储媒体失败：HTTP ${n.status}`);
	return new Uint8Array(await n.arrayBuffer());
}
async function Ut(e, t) {
	let n = zt.map((t) => e[t]).find(Bt);
	if (!n) return e;
	let r = e.filePath;
	if (!r && e.relativePath) {
		let n = x(t, e.relativePath);
		await l(n).catch(() => !1) && (r = n);
	}
	if (!r || !r.replace(/\\/g, "/").toLowerCase().startsWith(`${t.replace(/\\/g, "/").toLowerCase()}/`)) {
		let i = Vt(n, e), a = e.type === "ai-video" ? "generated-video" : "generated-image";
		r = await v(t, T(e.label, i, a)), await o(r, await Ht(n)), y();
	}
	let i = await C(r), a = {
		...e,
		filePath: r
	};
	for (let e of zt) {
		let t = a[e];
		Bt(t) && (a[e] = t === n ? i : void 0);
	}
	return a;
}
async function L(e, t, n) {
	if (!e.filePath) return e;
	let r = e.filePath.replace(/\\/g, "/"), i = n.replace(/\\/g, "/").replace(/\/+$/, "");
	if (!r.toLowerCase().startsWith(`${i.toLowerCase()}/`)) return e;
	if (e.assetId && e.relativePath && r.slice(i.length + 1) === e.relativePath.replace(/\\/g, "/")) {
		let t = { ...e };
		return delete t.filePath, t;
	}
	let a = await k(r, {
		assetId: e.assetId,
		rootPath: i,
		projectId: t,
		source: "project"
	}).catch(() => null);
	if (!a) return e;
	let o = {
		...e,
		assetId: a.assetId,
		relativePath: a.relativePath
	};
	return delete o.filePath, o;
}
async function Wt(e, t) {
	if (!Array.isArray(e)) return e;
	let n = await E(t);
	return n ? Promise.all(e.map(async (e) => {
		if (!e.data) return e;
		let r = await Ut(e.data, n);
		if (r = await L(r, t, n), Array.isArray(r.storyboardOverrides)) {
			let e = await Promise.all(r.storyboardOverrides.map(async (e) => e ? L(e, t, n) : null));
			r = {
				...r,
				storyboardOverrides: e
			};
		}
		return {
			...e,
			data: r
		};
	})) : e;
}
function Gt(e) {
	return Array.isArray(e) && e.some((e) => e.data && zt.some((t) => Bt(e.data?.[t])));
}
function Kt(e) {
	if (!(!e || !(e.includes("asset.localhost") || e.startsWith("asset://")))) try {
		let { pathname: t } = new URL(e), n = decodeURIComponent(t.replace(/^\//, ""));
		return n ? D(n) : void 0;
	} catch {
		return;
	}
}
async function qt(e, t, n) {
	let r = e.filePath ? D(e.filePath) : void 0, i = e.relativePath ? x(n, e.relativePath) : void 0, a = Kt(e.imageUrl || e.videoUrl || e.audioUrl || e.url), o = (e) => e.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase(), s = (e) => !!(e && o(e).startsWith(`${o(n)}/`)), c = s(r) ? [r, i] : s(a) ? [a, i] : [i, r], u;
	for (let e of c) if (e && await l(e).catch(() => !1)) {
		u = e;
		break;
	}
	if (!u && e.assetId && (u = await nt(e.assetId).catch(() => null) ?? void 0), !u) return e;
	let d = e.assetId && e.relativePath && u === x(n, e.relativePath) ? {
		assetId: e.assetId,
		relativePath: e.relativePath
	} : await k(u, {
		assetId: e.assetId,
		rootPath: n,
		projectId: t,
		source: "project"
	}).catch(() => null);
	d || console.warn("[项目加载] 单个资产索引恢复失败，已保留节点", {
		projectId: t,
		assetId: e.assetId
	});
	let f = {
		...e,
		...d ? {
			assetId: d.assetId,
			relativePath: d.relativePath
		} : {},
		filePath: u
	}, p = (e.relativePath ?? e.filePath)?.split(/[/\\]/).pop(), m = u.split(/[/\\]/).pop(), h = f.label, ee = m === a?.split(/[/\\]/).pop();
	if (h !== void 0 && !ee && p && m && p !== m) {
		let e = f.fileName, t = (e) => e.replace(/\.[^.]+$/, "");
		f.fileName = m, (h === e || h === p || t(h) === t(p)) && (f.label = m);
	}
	return "imageUrl" in f && f.imageUrl && (f.imageUrl = await C(u)), "videoUrl" in f && f.videoUrl && (f.videoUrl = await C(u)), "audioUrl" in f && f.audioUrl && (f.audioUrl = await C(u)), "url" in f && (f.url = await C(u)), f;
}
async function R(e, t, n) {
	try {
		return await qt(e, t, n);
	} catch {
		return console.warn("[项目加载] 单个资产展示信息恢复失败，已保留节点", {
			projectId: t,
			assetId: e.assetId
		}), e;
	}
}
async function Jt(e, t) {
	let n;
	try {
		n = await P(t);
	} catch {
		console.warn("[项目加载] 资产目录扫描失败，已继续加载画布", { projectId: e });
		return;
	}
	let r = (await Promise.allSettled(n.map((n) => k(n.path, {
		rootPath: t,
		projectId: e,
		source: "project",
		size: n.size
	})))).filter((e) => e.status === "rejected").length;
	r > 0 && console.warn("[项目加载] 部分资产索引刷新失败，已继续加载画布", {
		projectId: e,
		failedCount: r
	});
}
function Yt(e) {
	let t = Array.isArray(e.data?.storyboardOverrides) ? e.data.storyboardOverrides : [];
	return [e.data, ...t].some((e) => !!(e && !e.filePath && (e.assetId || e.relativePath)));
}
async function Xt(e, t) {
	if (!Array.isArray(e)) return e;
	let n = await E(t);
	if (!n) return e;
	let r = async (e) => {
		if (!e.data) return e;
		let r = await R(e.data, t, n);
		if (Array.isArray(r.storyboardOverrides)) {
			let e = await Promise.all(r.storyboardOverrides.map(async (e) => e ? R(e, t, n) : null));
			r = {
				...r,
				storyboardOverrides: e
			};
		}
		return {
			...e,
			data: r
		};
	}, i = await Promise.all(e.map(r));
	return i.some(Yt) ? (await Jt(t, n), Promise.all(e.map(r))) : i;
}
async function Zt(e, t) {
	if (!e?.characters.length) return e;
	let n = await E(t);
	if (!n) return e;
	let r = await Promise.all(e.characters.map(async (e) => ({
		...e,
		referenceImages: await Promise.all((e.referenceImages ?? []).map((e) => L(e, t, n))),
		voiceClips: await Promise.all((e.voiceClips ?? []).map((e) => L(e, t, n)))
	})));
	return {
		...e,
		characters: r
	};
}
async function Qt(e, t) {
	if (!e.characters.length) return e;
	let n = await E(t);
	if (!n) return e;
	let r = await Promise.all(e.characters.map(async (e) => {
		let r = await Promise.all((e.referenceImages ?? []).map((e) => R(e, t, n))), i = await Promise.all((e.voiceClips ?? []).map((e) => R(e, t, n))), a = r.find((t) => t.id === e.primaryReferenceImageId) ?? r[0];
		return {
			...e,
			referenceImages: r,
			voiceClips: i,
			imageUrl: a?.imageUrl ?? e.imageUrl
		};
	}));
	return {
		...e,
		characters: r
	};
}
async function $t(e) {
	try {
		return await re({
			...e,
			nodes: await Wt(e.nodes, e.id),
			dramaAssets: await Zt(e.dramaAssets, e.id)
		}), console.log("Project saved to IndexedDB:", e.id), e.id;
	} catch (e) {
		throw console.error("Save project to IndexedDB failed:", e), e;
	}
}
async function en() {
	try {
		return await de();
	} catch (e) {
		throw console.error("Load projects list failed:", e), e;
	}
}
async function tn(e) {
	try {
		let t = await ve(e);
		if (!t) return null;
		let n = t.nodes;
		if (Gt(n)) try {
			n = await Wt(n, e), await re({
				...t,
				nodes: n
			}), console.log("[项目加载] 已将旧的内嵌媒体迁移到项目目录:", e);
		} catch (t) {
			console.warn("[项目加载] 内嵌媒体迁移失败，未覆盖原项目数据", {
				projectId: e,
				error: t
			});
		}
		try {
			n = await Xt(n, e);
		} catch {
			console.warn("[项目加载] 资产恢复未完成，已使用原始画布数据", { projectId: e });
		}
		let r = Ze(t.dramaAssets);
		try {
			r = await Qt(r, e);
		} catch {
			console.warn("[项目加载] 角色库本地文件恢复未完成，已使用原始角色数据", { projectId: e });
		}
		return {
			...t,
			nodes: n,
			dramaAssets: r
		};
	} catch (e) {
		return console.error("Load project data failed:", e), null;
	}
}
async function nn(e) {
	try {
		await he(e), console.log("Project deleted from IndexedDB:", e);
	} catch (e) {
		throw console.error("Delete project from IndexedDB failed:", e), e;
	}
}
async function rn(e) {
	try {
		await se(e), console.log("Workflow saved to IndexedDB:", e.id);
	} catch (e) {
		throw console.error("Save workflow failed:", e), e;
	}
}
async function an() {
	try {
		return await ne();
	} catch (e) {
		return console.error("Load workflows failed:", e), [];
	}
}
async function on(e) {
	try {
		await me(e), console.log("Workflow deleted from IndexedDB:", e);
	} catch (e) {
		throw console.error("Delete workflow failed:", e), e;
	}
}
async function sn(e) {
	try {
		let { config: t, unstored: n } = await Lt(e);
		return await ae(t), console.log("Config saved to IndexedDB"), n;
	} catch (e) {
		throw console.error("Save config failed:", e), e;
	}
}
async function cn() {
	try {
		let e = await ee();
		if (e == null) return {
			config: null,
			missingSecrets: []
		};
		let { config: t, migrated: n, missing: r } = await Rt(e);
		if (n) {
			let { config: e } = await Lt(t);
			await ae(e), console.log("[storage] 已将明文 API Key 迁移到凭据存储并清理数据库记录");
		}
		return {
			config: t,
			missingSecrets: r
		};
	} catch (e) {
		return console.error("Load config failed:", e), {
			config: null,
			missingSecrets: []
		};
	}
}
async function ln() {
	return (await cn()).config;
}
async function un() {
	try {
		return await ee();
	} catch (e) {
		return console.error("Load config failed:", e), null;
	}
}
async function dn(e) {
	try {
		await m(e), console.log("Preset saved to IndexedDB:", e.id);
	} catch (e) {
		throw console.error("Save preset failed:", e), e;
	}
}
async function fn() {
	try {
		return await le();
	} catch (e) {
		return console.error("Load presets failed:", e), [];
	}
}
async function pn(e) {
	try {
		await ge(e), console.log("Preset deleted from IndexedDB:", e);
	} catch (e) {
		throw console.error("Delete preset failed:", e), e;
	}
}
async function mn(e) {
	try {
		await _e(e), console.log("Skill saved to IndexedDB:", e.id);
	} catch (e) {
		throw console.error("Save skill failed:", e), e;
	}
}
async function hn() {
	try {
		return await h();
	} catch (e) {
		return console.error("Load skills failed:", e), [];
	}
}
async function gn(e) {
	try {
		await fe(e), console.log("Skill deleted from IndexedDB:", e);
	} catch (e) {
		throw console.error("Delete skill failed:", e), e;
	}
}
async function _n(e) {
	try {
		await ie(e);
	} catch (e) {
		throw console.error("Save style failed:", e), e;
	}
}
async function vn() {
	try {
		return await xe();
	} catch (e) {
		return console.error("Load styles failed:", e), [];
	}
}
async function yn(e) {
	try {
		await be(e);
	} catch (e) {
		throw console.error("Delete style failed:", e), e;
	}
}
async function bn(e) {
	try {
		await ue(e);
	} catch (e) {
		throw console.error("Save toolbar layouts failed:", e), e;
	}
}
async function xn() {
	try {
		return await oe();
	} catch (e) {
		return console.error("Load toolbar layouts failed:", e), null;
	}
}
//#endregion
//#region src/services/fs/skillFiles.ts
var Sn = new Set([
	"md",
	"txt",
	"json"
]), z = "Skill 资料路径无效，只能使用 Skill 内相对路径";
function Cn(e) {
	try {
		return new TextDecoder("utf-8", { fatal: !0 }).decode(e);
	} catch {
		throw Error("Skill 文件必须是 UTF-8 文本");
	}
}
function wn(e) {
	let t = e.split(".").pop()?.toLowerCase() || "";
	return Sn.has(t);
}
function Tn(e) {
	return new Promise((t) => {
		let n = document.createElement("input");
		n.type = "file", n.accept = e, n.style.display = "none", document.body.appendChild(n), n.addEventListener("change", () => {
			document.body.removeChild(n), t(n.files?.[0] ?? null);
		}), n.addEventListener("cancel", () => {
			document.body.removeChild(n), t(null);
		}), n.click(), window.addEventListener("focus", () => {
			setTimeout(() => {
				document.body.contains(n) && (document.body.removeChild(n), t(null));
			}, 300);
		}, { once: !0 });
	});
}
async function En() {
	let e = x(await r(), "skill");
	return await l(e) || await s(e, { recursive: !0 }), e;
}
async function Dn(e, t = e) {
	let n = await i(e), r = [];
	for (let i of n) {
		let n = x(e, i.name);
		if (i.isDirectory) {
			r.push(...await Dn(n, t));
			continue;
		}
		if (!i.isFile || !wn(i.name)) continue;
		let a = t.replace(/\\/g, "/").replace(/\/+$/, ""), o = n.replace(/\\/g, "/");
		r.push({
			path: n,
			relativePath: o.startsWith(`${a}/`) ? o.slice(a.length + 1) : i.name,
			name: i.name
		});
	}
	return r.sort((e, t) => e.relativePath.localeCompare(t.relativePath, void 0, { numeric: !0 }));
}
function On(e) {
	return e.find((e) => e.name.toLowerCase() === "skill.md") ?? e.find((e) => e.relativePath.toLowerCase().endsWith("/skill.md")) ?? e.find((e) => e.name.toLowerCase().endsWith(".md")) ?? e[0] ?? null;
}
async function kn() {
	let e = await f({
		directory: !0,
		multiple: !1,
		title: "上传 Skill 文件夹"
	});
	if (!e || Array.isArray(e)) return null;
	let t = e.split(/[\\/]/).filter(Boolean).pop() || "skill", n = await Dn(e);
	if (n.length === 0) throw Error("Skill 文件夹中没有可用的 .md / .txt / .json 文件");
	let r = On(n);
	if (!r) throw Error("Skill 文件夹中没有可调用入口文件");
	let i = await v(await En(), Oe(t));
	await s(i, { recursive: !0 });
	let a = "";
	for (let e of n) {
		let t = await u(e.path), n = Cn(t);
		e.relativePath === r.relativePath && (a = n);
		let c = x(i, ...e.relativePath.split(/[\\/]/).map((e) => w(e))), d = c.slice(0, c.lastIndexOf("/"));
		d && !await l(d) && await s(d, { recursive: !0 }), await o(c, t);
	}
	return {
		fileName: t,
		content: a,
		sourceType: "folder",
		storagePath: i,
		entryFileName: r.relativePath
	};
}
async function An() {
	let e = await f({
		multiple: !1,
		title: "上传 Skill 文件",
		filters: [{
			name: "Skill 文本文件",
			extensions: [
				"md",
				"txt",
				"json"
			]
		}]
	});
	if (!e || Array.isArray(e)) return null;
	let t = e.split(/[\\/]/).pop() || "skill.txt";
	if (!wn(t)) throw Error("Skill 文件只支持 .md / .txt / .json");
	let n = await u(e), r = Cn(n), i = await v(await En(), t);
	return await o(i, n), {
		fileName: t,
		content: r,
		sourceType: "file",
		storagePath: i,
		entryFileName: t
	};
}
async function jn(e = "folder") {
	try {
		if (b()) return e === "file" ? await An() : await kn();
		let t = await Tn(".md,.txt,.json");
		return t ? {
			fileName: t.name,
			content: await t.text(),
			sourceType: "file",
			entryFileName: t.name
		} : null;
	} catch (e) {
		throw console.error("Upload skill failed:", e), e;
	}
}
function Mn(e) {
	let t = e.trim().replace(/\\/g, "/");
	if (!t || t.includes(":") || t.startsWith("/") || t.startsWith("~")) throw Error(z);
	let n = t.split("/");
	if (n.some((e) => !e || e === "." || e === "..")) throw Error(z);
	if (!wn(n[n.length - 1])) throw Error("Skill 资料只支持 .md / .txt / .json");
	return n.join("/");
}
async function Nn(e, t) {
	if (!b() || !e || t <= 0) return [];
	try {
		return await l(e) ? (await Dn(e)).slice(0, t).map((e) => e.relativePath) : [];
	} catch (e) {
		return console.warn("[Skill 资料] 列出附属文件失败:", e), [];
	}
}
async function Pn(e, t) {
	let n = Mn(t);
	if (!b()) throw Error("当前环境不支持读取 Skill 附属资料");
	let r = e.replace(/\\/g, "/").replace(/\/+$/, "");
	if (!r) throw Error(z);
	let i = `${r}/${n}`;
	if (!i.startsWith(`${r}/`)) throw Error(z);
	if (!await l(i)) throw Error(`Skill 资料不存在: ${n}`);
	return Cn(await u(i));
}
//#endregion
//#region src/services/fs/externalEditors.ts
var Fn = {
	jianying: {
		displayName: "剪映专业版",
		executableNames: ["JianyingPro.exe"],
		macAppNames: ["剪映专业版", "JianyingPro"]
	},
	premiere: {
		displayName: "Adobe Premiere Pro",
		executableNames: ["Adobe Premiere Pro.exe"],
		macAppNames: [
			"Adobe Premiere Pro 2026",
			"Adobe Premiere Pro 2025",
			"Adobe Premiere Pro 2024",
			"Adobe Premiere Pro 2023",
			"Adobe Premiere Pro 2022",
			"Adobe Premiere Pro 2021",
			"Adobe Premiere Pro"
		]
	}
};
async function B(e, n) {
	try {
		return await t("open_with_app", {
			appPath: e,
			filePath: n
		}), !0;
	} catch (t) {
		return console.warn("[fileService] launchApp 失败:", e, t), !1;
	}
}
async function In(e) {
	if (!b()) {
		console.warn("[fileService] revealFileInFolder: 仅 Tauri 桌面环境支持");
		return;
	}
	try {
		await t("reveal_in_file_manager", {
			path: e,
			select: !0
		});
	} catch (t) {
		throw console.error("[fileService] revealFileInFolder 失败:", e, t), t;
	}
}
async function Ln(e) {
	if (!b()) {
		console.warn("[fileService] openDirectoryInFileManager: 仅 Tauri 桌面环境支持");
		return;
	}
	await t("reveal_in_file_manager", {
		path: e,
		select: !1
	});
}
async function Rn(e, t) {
	if (!b()) {
		console.warn("[fileService] openInPhotoshop: 仅 Tauri 桌面环境支持");
		return;
	}
	try {
		let n = (navigator.platform || "").toLowerCase();
		if (n.includes("win")) {
			let n = e.replace(/\//g, "\\");
			if (t?.trim()) {
				let e = t.replace(/\/+$/, "").replace(/\\+$/, ""), r = /photoshop\.exe$/i.test(e) ? [e] : [e, `${e}\\Photoshop.exe`];
				for (let e of r) if (await B(e, n)) return;
				throw Error(`配置的 Photoshop 路径无效: ${t}`);
			}
			let r = [
				"C:",
				"D:",
				"E:",
				"F:",
				"G:"
			], i = [
				"2026",
				"2025",
				"2024",
				"2023",
				"2022",
				"2021",
				""
			];
			for (let e of r) for (let t of i) {
				let r = t ? `Adobe Photoshop ${t}` : "Adobe Photoshop";
				if (await B(`${e}\\Program Files\\Adobe\\${r}\\Photoshop.exe`, n) || await B(`${e}\\Program Files (x86)\\Adobe\\${r}\\Photoshop.exe`, n)) return;
			}
			throw Error("未找到 Photoshop。请在设置中手动配置 Photoshop 安装路径，或确认已安装 Adobe Photoshop");
		}
		if (n.includes("mac")) {
			if (t?.trim()) {
				if (await B(t, e)) return;
				throw Error(`配置的 Photoshop 路径无效: ${t}`);
			}
			let { Command: n } = await import("./dist-js-CtV1w6rx.js");
			for (let t of [
				"Adobe Photoshop 2025",
				"Adobe Photoshop 2024",
				"Adobe Photoshop 2023",
				"Adobe Photoshop"
			]) try {
				await n.create("mac-open", [
					"-a",
					t,
					e
				]).execute();
				return;
			} catch {
				continue;
			}
			throw Error("未找到 Photoshop。请在设置中手动配置 Photoshop 安装路径，或确认已安装 Adobe Photoshop");
		}
		throw Error("不支持的操作系统");
	} catch (t) {
		throw console.error("[fileService] openInPhotoshop 失败:", e, t), t;
	}
}
function zn(e, t) {
	let n = e.trim().replace(/\/+$/, "").replace(/\\+$/, "");
	return /\.exe$/i.test(n) ? [n] : [n, ...t.map((e) => `${n}\\${e}`)];
}
async function Bn(e) {
	let t = [
		"C:",
		"D:",
		"E:",
		"F:",
		"G:"
	];
	if (e === "jianying") {
		let e = [];
		try {
			let t = await n();
			e.push(x(t, "JianyingPro", "Apps", "JianyingPro.exe"), x(t, "JianyingPro", "JianyingPro.exe"));
		} catch {}
		for (let n of t) e.push(`${n}\\Program Files\\JianyingPro\\JianyingPro.exe`, `${n}\\Program Files\\ByteDance\\JianyingPro\\JianyingPro.exe`, `${n}\\Program Files (x86)\\JianyingPro\\JianyingPro.exe`);
		return e;
	}
	let r = [
		"2026",
		"2025",
		"2024",
		"2023",
		"2022",
		"2021",
		"2020",
		""
	], i = [];
	for (let e of t) for (let t of r) {
		let n = t ? `Adobe Premiere Pro ${t}` : "Adobe Premiere Pro";
		i.push(`${e}\\Program Files\\Adobe\\${n}\\Adobe Premiere Pro.exe`, `${e}\\Program Files (x86)\\Adobe\\${n}\\Adobe Premiere Pro.exe`);
	}
	return i;
}
async function Vn(e, t, n) {
	let r = Fn[t];
	if (!b()) {
		console.warn(`[fileService] openInVideoEditor(${t}): 仅 Tauri 桌面环境支持`);
		return;
	}
	try {
		let i = (navigator.platform || "").toLowerCase();
		if (i.includes("win")) {
			let i = e.replace(/\//g, "\\");
			if (n?.trim()) {
				for (let e of zn(n, r.executableNames)) if (await B(e, i)) return;
				throw Error(`配置的 ${r.displayName} 路径无效: ${n}`);
			}
			for (let e of await Bn(t)) if (await B(e, i)) return;
			throw Error(`未找到 ${r.displayName}。请在设置中手动配置安装路径，或确认已安装该应用`);
		}
		if (i.includes("mac")) {
			if (n?.trim()) {
				if (await B(n, e)) return;
				throw Error(`配置的 ${r.displayName} 路径无效: ${n}`);
			}
			let { Command: t } = await import("./dist-js-CtV1w6rx.js");
			for (let n of r.macAppNames) try {
				await t.create("mac-open", [
					"-a",
					n,
					e
				]).execute();
				return;
			} catch {
				continue;
			}
			throw Error(`未找到 ${r.displayName}。请在设置中手动配置安装路径，或确认已安装该应用`);
		}
		throw Error("不支持的操作系统");
	} catch (n) {
		throw console.error(`[fileService] openInVideoEditor(${t}) 失败:`, e, n), n;
	}
}
async function Hn(e, t) {
	return Vn(e, "jianying", t);
}
async function Un(e, t) {
	return Vn(e, "premiere", t);
}
//#endregion
//#region src/services/fileService.ts
var Wn = /* @__PURE__ */ e({
	CATEGORY_EXTENSIONS: () => ze,
	CATEGORY_LABELS: () => We,
	MEDIA_DATA_URL_MAX_BYTES: () => Gn,
	MEDIA_DATA_URL_MAX_HEADER_CHARS: () => qn,
	MEDIA_DATA_URL_TOTAL_MAX_BYTES: () => Kn,
	MediaDataUrlHeaderTooLargeError: () => G,
	MediaDataUrlTooLargeError: () => U,
	MediaDataUrlTotalTooLargeError: () => W,
	PROJECT_DISK_CHANGED_EVENT: () => Ue,
	addAssetFilesToGlobal: () => St,
	arrayBufferToBase64: () => Be,
	assertMediaDataUrlBudgetAvailable: () => X,
	assertMediaDataUrlSize: () => J,
	assertMediaDataUrlWithinLimit: () => Xn,
	assertMediaDataUrlWithinLimitAsync: () => Zn,
	assertSafeSkillRelativePath: () => Mn,
	buildNodeFileName: () => T,
	buildProjectFolderName: () => Le,
	bytePartsToBase64: () => Ke,
	bytePartsToBase64Async: () => Ye,
	collectNodeFileReferences: () => ot,
	consumeMediaDataUrlBudgetBytes: () => Y,
	copyFileToProjectData: () => fr,
	createMediaDataUrlBudget: () => Jn,
	deleteNodeFile: () => _t,
	deletePermanentFile: () => Et,
	deleteProjectDataDir: () => gt,
	downloadUrlAndSave: () => br,
	ensureBinaryFile: () => Re,
	ensureGroupFolder: () => Je,
	ensureProjectDataDir: () => S,
	estimateMediaDataUrlBytes: () => er,
	estimateMediaDataUrlBytesAsync: () => tr,
	extractFilesFromNodeData: () => kr,
	fetchImageForCrop: () => sr,
	fileUriToPath: () => Te,
	flushUndoTrashDirs: () => mt,
	getAppExecutableDir: () => qe,
	getAssetUrlFromPath: () => C,
	getBaseDir: () => Ee,
	getConvertFileSrc: () => _,
	getDefaultBaseDir: () => Me,
	getFileCategory: () => Ve,
	getGlobalFilesDir: () => N,
	getMimeType: () => g,
	getProjectDataDir: () => E,
	getRelativeAssetPath: () => Qe,
	identifyAsset: () => k,
	inferMediaDataUrlKind: () => q,
	isFileMissing: () => ft,
	isMediaDataUrl: () => Yn,
	isPathInsideDir: () => M,
	isTauriEnv: () => b,
	isTransientMediaUrl: () => $,
	joinPath: () => x,
	listDirectoryFiles: () => Ne,
	listExternalFolderFiles: () => xt,
	listGlobalFiles: () => bt,
	listProjectFiles: () => Sr,
	listSkillResourceFiles: () => Nn,
	loadConfigWithoutSecrets: () => un,
	moveProjectFileToFolder: () => De,
	moveToTrash: () => ct,
	moveToUndoTrash: () => dt,
	notifyProjectDiskChanged: () => y,
	openDirectoryInFileManager: () => Ln,
	openInJianying: () => Hn,
	openInPhotoshop: () => Rn,
	openInPremiere: () => Un,
	persistMediaUrlToProjectData: () => yr,
	pickAssetFolder: () => Ct,
	readAgentAuthorizedTextFile: () => Tr,
	readBinaryFile: () => je,
	readFileToDataUrl: () => dr,
	readSkillResourceFile: () => Pn,
	registerProjectFolder: () => Pe,
	registerProjectFolders: () => Xe,
	renameGroupFolder: () => we,
	renameProjectDataDir: () => Ie,
	renameProjectFileToLabel: () => xr,
	resolveIndexedAssetPath: () => nt,
	resolveNodeUndoTrashPaths: () => st,
	resolveProjectOutputPath: () => hr,
	resolveUniqueDestPath: () => v,
	restoreFromUndoTrash: () => pt,
	revealFileInFolder: () => In,
	revertProjectDataDirRename: () => Fe,
	sanitizeFileName: () => w,
	sanitizeFolderName: () => Oe,
	saveAgentTextOutput: () => Er,
	saveAssetToPermanent: () => Tt,
	saveBinaryToLocalFile: () => gr,
	saveBinaryToProjectData: () => mr,
	saveDataUrlToProjectData: () => pr,
	saveNodeOutputToFile: () => Mr,
	saveToPermanent: () => wt,
	selectAgentTextFiles: () => wr,
	setBaseDataDir: () => Ae,
	stripVerbatimPrefix: () => D,
	syncAuthorizedDirectories: () => ar,
	uploadSkillFile: () => jn,
	uploadSourceFile: () => Or,
	uploadSourceFileToProject: () => Dr,
	waitForPendingNodeFileDeletions: () => vt,
	walkDirectoryFiles: () => P,
	watchFilePaths: () => ke
}), V = /* @__PURE__ */ new Map(), Gn = {
	image: 32 * 1024 * 1024,
	video: 64 * 1024 * 1024,
	audio: 32 * 1024 * 1024,
	other: 8 * 1024 * 1024
}, Kn = 128 * 1024 * 1024, qn = 4096, H = {
	image: "图片",
	video: "视频",
	audio: "音频",
	other: "文件"
}, U = class extends Error {
	actualBytes;
	maxBytes;
	kind;
	constructor(e, t, n, r = H[n]) {
		super(`${r}大小为 ${K(e)}，超过内存转换上限 ${K(t)}；请压缩素材，或先导入正式项目以使用原生文件存储`), this.name = "MediaDataUrlTooLargeError", this.actualBytes = e, this.maxBytes = t, this.kind = n;
	}
}, W = class extends Error {
	actualBytes;
	maxBytes;
	constructor(e, t, n = "本次参考媒体") {
		super(`${n}累计大小为 ${K(e)}，超过内存转换总上限 ${K(t)}；请减少参考素材数量或压缩素材后重试`), this.name = "MediaDataUrlTotalTooLargeError", this.actualBytes = e, this.maxBytes = t;
	}
}, G = class extends Error {
	actualChars;
	maxChars;
	constructor(e, t = qn) {
		super(`Data URL 元数据长度为 ${e}，超过上限 ${t}；请重新导入媒体文件`), this.name = "MediaDataUrlHeaderTooLargeError", this.actualChars = e, this.maxChars = t;
	}
};
function Jn(e = "本次参考媒体", t = Kn) {
	return {
		usedBytes: 0,
		maxBytes: t,
		label: e
	};
}
function K(e) {
	return `${Number((e / 1024 / 1024).toFixed(2))} MiB`;
}
function Yn(e) {
	return e.length >= 5 && e.slice(0, 5).toLowerCase() === "data:";
}
function q(e) {
	let t = 0;
	for (; t < e.length && /\s/.test(e[t]);) t += 1;
	if (e.slice(t, t + 5).toLowerCase() === "data:") {
		let n = t + qn + 1, r = e.slice(t, n + 1).indexOf(","), i = r >= 0 ? t + r : Math.min(e.length, n), a = e.slice(t, i).toLowerCase(), o = /^data:([^;,]+)/.exec(a)?.[1] ?? "";
		return o.startsWith("image/") ? "image" : o.startsWith("video/") ? "video" : o.startsWith("audio/") ? "audio" : "other";
	}
	let n = e.trim().toLowerCase(), r = /^[a-z]+\/[a-z0-9.+-]+$/i.test(n) ? n : "";
	if (r.startsWith("image/")) return "image";
	if (r.startsWith("video/")) return "video";
	if (r.startsWith("audio/")) return "audio";
	let i = g(n.split(/[?#]/, 1)[0].split(".").pop() || "");
	return i.startsWith("image/") ? "image" : i.startsWith("video/") ? "video" : i.startsWith("audio/") ? "audio" : "other";
}
function J(e, t, n) {
	let r = Gn[t];
	if (e > r) throw new U(e, r, t, n);
}
function Xn(e, t, n) {
	J(er(e), t, n);
}
async function Zn(e, t, n, r) {
	let i = await tr(e, r);
	return J(i, t, n), i;
}
function Qn(e) {
	let t = e.slice(0, 4098).indexOf(",");
	if (t < 0) throw e.length > 4097 ? new G(4097) : Error("Data URL 格式无效：缺少元数据与内容分隔符");
	if (t > 4096) throw new G(t);
	return {
		commaIndex: t,
		metadata: e.slice(0, t)
	};
}
function $n(e, t, n, r) {
	if (!/;base64(?:;|$)/i.test(e)) return t;
	let i = n === "=" ? r === "=" ? 2 : 1 : 0;
	return Math.max(0, Math.floor(t * 3 / 4) - i);
}
function er(e) {
	let { commaIndex: t, metadata: n } = Qn(e), r = 0, i = "", a = "";
	for (let n = t + 1; n < e.length; n += 1) {
		let t = e.charCodeAt(n);
		t === 32 || t >= 9 && t <= 13 || (r += 1, a = i, i = e[n]);
	}
	return $n(n, r, i, a);
}
async function tr(e, t) {
	Z(t);
	let { commaIndex: n, metadata: r } = Qn(e), i = 0, a = "", o = "";
	for (let r = n + 1; r < e.length; r += 1) {
		let s = e.charCodeAt(r);
		s !== 32 && (s < 9 || s > 13) && (i += 1, o = a, a = e[r]), (r - n) % 1048576 == 0 && (await new Promise((e) => setTimeout(e, 0)), Z(t));
	}
	return Z(t), $n(r, i, a, o);
}
function Y(e, t) {
	e && (X(e, t), e.usedBytes += t);
}
function X(e, t) {
	if (!e) return;
	let n = e.usedBytes + t;
	if (n > e.maxBytes) throw new W(n, e.maxBytes, e.label);
}
async function nr(e, t, n) {
	let r = `${e}\n${w(t)}`, i = V.get(r)?.catch(() => void 0) ?? Promise.resolve(), a = () => void 0, o = new Promise((e) => {
		a = e;
	}), s = i.then(() => o);
	V.set(r, s), await i;
	try {
		return await n();
	} finally {
		a(), V.get(r) === s && V.delete(r);
	}
}
function rr() {
	return globalThis.crypto?.randomUUID?.() ?? `transfer-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
async function ir(e, n, r) {
	let i = rr(), a, o = !1, s = () => {
		o || (o = !0, t("cancel_file_transfer", { taskId: i }).catch((e) => {
			console.warn("[fileService] cancel_file_transfer failed:", e);
		}));
	};
	if (r?.signal?.aborted) throw new DOMException("File transfer aborted", "AbortError");
	try {
		return r?.onProgress && (a = await p("file-transfer-progress", ({ payload: e }) => {
			e.taskId === i && r.onProgress?.(e);
		})), r?.signal?.addEventListener("abort", s, { once: !0 }), await t(e, {
			taskId: i,
			...n
		});
	} finally {
		r?.signal?.removeEventListener("abort", s), a?.();
	}
}
async function ar(e) {
	if (!b()) return;
	let n = [e.baseDataDir, ...e.assetFolders ?? []].map((e) => e?.trim()).filter((e) => !!e), r = await t("sync_authorized_directories", {
		directories: [...new Set(n)],
		baseDataDir: e.baseDataDir?.trim() || null
	});
	r.length > 0 && console.warn("[fileService] 已跳过不存在或无效的授权目录:", r);
}
function or(e) {
	return new Promise((t) => {
		let n = document.createElement("input");
		n.type = "file", n.accept = e, n.style.display = "none", document.body.appendChild(n), n.addEventListener("change", () => {
			document.body.removeChild(n), t(n.files?.[0] ?? null);
		}), n.addEventListener("cancel", () => {
			document.body.removeChild(n), t(null);
		}), n.click(), window.addEventListener("focus", () => {
			setTimeout(() => {
				document.body.contains(n) && (document.body.removeChild(n), t(null));
			}, 300);
		}, { once: !0 });
	});
}
async function sr(e) {
	if (e.startsWith("data:") || e.startsWith("blob:") || e.startsWith("asset://") || e.includes("asset.localhost")) return e;
	if (b() && /^https?:\/\//i.test(e)) try {
		return await t("fetch_image_data_url", { url: e });
	} catch (t) {
		return console.warn("[fileService] fetchImageForCrop via Rust failed, fallback to original URL:", t), e;
	}
	return e;
}
function cr(e) {
	return e.reason ?? new DOMException("读取已取消", "AbortError");
}
function Z(e) {
	if (e?.aborted) throw cr(e);
}
function lr(e) {
	return e instanceof DOMException && e.name === "AbortError";
}
function ur(e, t) {
	return Z(t), new Promise((n, r) => {
		let i = new FileReader(), a = () => t?.removeEventListener("abort", o), o = () => {
			i.readyState === FileReader.LOADING && i.abort(), a(), r(cr(t));
		};
		i.onload = () => {
			a(), n(i.result);
		}, i.onerror = () => {
			a(), r(i.error ?? /* @__PURE__ */ Error("媒体读取失败"));
		}, t?.addEventListener("abort", o, { once: !0 }), i.readAsDataURL(e);
	});
}
async function dr(e, t = {}) {
	try {
		Z(t.signal);
		let n = e.replace(/\\/g, "/"), r = n.split(".").pop()?.toLowerCase() || "", i = t.kind ?? q(n), a = t.label ?? H[i];
		if (b()) {
			try {
				let n = await c(e);
				Z(t.signal), J(n.size, i, a), X(t.dataUrlBudget, n.size);
			} catch (e) {
				if (t.signal?.aborted) throw cr(t.signal);
				if (e instanceof U || e instanceof W || lr(e)) throw e;
			}
			let n = await u(e);
			Z(t.signal), J(n.byteLength, i, a), X(t.dataUrlBudget, n.byteLength);
			let o = await Ye([n], t.signal), s = `data:${g(r)};base64,${o}`;
			return Y(t.dataUrlBudget, n.byteLength), s;
		}
		let o = await fetch(n, { signal: t.signal });
		if (Z(t.signal), !o.ok) throw Error(`读取本地文件失败 (${o.status})`);
		let s = Number(o.headers.get("Content-Length"));
		Number.isFinite(s) && s >= 0 && (J(s, i, a), X(t.dataUrlBudget, s));
		let l = await o.blob();
		Z(t.signal), J(l.size, i, a), X(t.dataUrlBudget, l.size);
		let d = await ur(l, t.signal);
		return Y(t.dataUrlBudget, l.size), d;
	} catch (n) {
		if (t.signal?.aborted) throw cr(t.signal);
		if (n instanceof U || n instanceof W || n instanceof G || lr(n)) throw n;
		return console.error("readFileToDataUrl failed:", e, n), null;
	}
}
async function fr(e, t, n) {
	if (!b()) return null;
	let r = await S(t);
	if (!r) return null;
	let i = e.split(/[/\\]/).pop() || "file", a = await v(r, i);
	try {
		await ir("copy_file_streamed", {
			sourcePath: e,
			destinationPath: a
		}, n), y();
	} catch (t) {
		return console.error("Failed to copy file to project data:", e, t), null;
	}
	let o = await _();
	return o ? {
		filePath: a,
		assetUrl: o(a),
		fileName: i
	} : {
		filePath: a,
		assetUrl: "",
		fileName: i
	};
}
async function pr(e, t, n) {
	if (!b()) return null;
	let r = await S(t);
	if (!r) return null;
	try {
		let t = e.match(/^data:(.+?);base64,(.+)$/i), i;
		if (t) {
			let e = t[2], n = atob(e);
			i = new Uint8Array(n.length);
			for (let e = 0; e < n.length; e++) i[e] = n.charCodeAt(e);
		} else {
			let t = await (await fetch(e)).arrayBuffer();
			i = new Uint8Array(t);
		}
		let a = await v(r, n);
		await o(a, i), y();
		let s = await _();
		return {
			filePath: a,
			assetUrl: s ? s(a) : ""
		};
	} catch (e) {
		return console.error("Failed to save data URL to project data:", n, e), null;
	}
}
async function mr(e, t, n) {
	if (!b()) return null;
	let r = await S(t);
	if (!r) return null;
	let i = await v(r, n);
	try {
		await o(i, e), y();
	} catch (e) {
		return console.error("Failed to save binary to project data:", i, e), null;
	}
	let a = await _();
	return {
		filePath: i,
		assetUrl: a ? a(i) : ""
	};
}
async function hr(e, t) {
	if (!b()) return null;
	let n = await S(e);
	return n ? v(n, w(t)) : null;
}
async function gr(e, t, n = [{
	name: "视频文件",
	extensions: ["mp4"]
}]) {
	if (!b()) return null;
	let r = await d({
		defaultPath: t,
		filters: n
	});
	return r ? (await o(r, e), r) : null;
}
function _r(e, t) {
	try {
		let t = new URL(e), n = t.searchParams.get("filename");
		if (n) return w(n.split(/[/\\]/).pop());
		let r = t.pathname.split("/").pop() || "";
		if (r && r.includes(".")) return w(r);
	} catch {}
	return `${t}-${Date.now()}`;
}
var vr = {
	"image/png": ".png",
	"image/jpeg": ".jpg",
	"image/webp": ".webp",
	"image/gif": ".gif",
	"video/mp4": ".mp4",
	"video/webm": ".webm",
	"video/quicktime": ".mov",
	"audio/mpeg": ".mp3",
	"audio/wav": ".wav",
	"audio/ogg": ".ogg",
	"audio/aac": ".aac"
};
function Q(e, t, n) {
	try {
		let t = new URL(e), n = t.searchParams.get("filename") || t.pathname.split("/").pop() || "", r = n.lastIndexOf(".");
		if (r > 0 && r < n.length - 1) return n.slice(r).toLowerCase();
	} catch {}
	return t && vr[t] ? vr[t] : n.includes("video") ? ".mp4" : n.includes("audio") ? ".mp3" : ".png";
}
function $(e) {
	return !!(e && (/^data:/i.test(e) || /^blob:/i.test(e)));
}
async function yr(e, t, n, r, i) {
	if (!b()) {
		if ($(e)) throw Error("当前环境没有项目目录，无法保存内嵌媒体");
		return {
			mediaUrl: e,
			sourceUrl: e
		};
	}
	let a = await br(e, t, n, r, i);
	if (!a?.filePath || !a.assetUrl) throw Error("生成媒体未能写入项目目录");
	return $(e) ? {
		...a,
		mediaUrl: a.assetUrl,
		sourceUrl: a.assetUrl
	} : {
		...a,
		mediaUrl: a.assetUrl,
		sourceUrl: e
	};
}
async function br(e, t, n, r, i) {
	if (!b()) return null;
	try {
		if (Yn(e)) {
			let i = /^data:([^;,]+)/i.exec(e)?.[1];
			return pr(e, t, r && r.trim() ? T(r, Q(e, i, n), n) : `${w(n)}-${Date.now()}${Q("", i, n)}`);
		}
		if (/^blob:/i.test(e)) {
			let i = await fetch(e);
			if (!i.ok) throw Error(`读取临时媒体失败：HTTP ${i.status}`);
			let a = i.headers.get("content-type") || void 0, o = r && r.trim() ? T(r, Q(e, a, n), n) : `${w(n)}-${Date.now()}${Q("", a, n)}`;
			return mr(new Uint8Array(await i.arrayBuffer()), t, o);
		}
		let a = r && r.trim() ? T(r, Q(e, void 0, n), n) : _r(e, n), o = await S(t);
		if (!o) return null;
		let s = await nr(o, a, async () => ir("download_file_streamed", {
			url: e,
			destinationPath: await v(o, a)
		}, i));
		y();
		let c = await _();
		return {
			filePath: s.path,
			assetUrl: c ? c(s.path) : ""
		};
	} catch (t) {
		return console.warn("[fileService] downloadUrlAndSave failed:", e, t), null;
	}
}
async function xr(e, t, n) {
	if (!b() || !e) return null;
	let r = await E(n);
	if (!r) return null;
	let i = D(e).replace(/\\/g, "/"), o = r.replace(/\\/g, "/").replace(/\/+$/, "");
	if (!i.startsWith(`${o}/`)) return null;
	let s = i.split("/").pop() || "", c = s.lastIndexOf("."), l = c > 0 ? s.slice(c) : "", u = t;
	l && u.toLowerCase().endsWith(l.toLowerCase()) && (u = u.slice(0, -l.length));
	let d = T(u, l, "file");
	if (d === s) return null;
	try {
		let t = await v(i.slice(0, i.length - s.length - 1), d);
		await a(e, t), y();
		let n = await _();
		return {
			filePath: t,
			assetUrl: n ? n(t) : "",
			fileName: t.replace(/\\/g, "/").split("/").pop() || d
		};
	} catch (t) {
		return console.warn("[fileService] renameProjectFileToLabel failed:", e, t), null;
	}
}
async function Sr(e) {
	let t = await E(e);
	if (!t) return [];
	let n = (await P(t)).filter((e) => !e.path.substring(t.length).replace(/\\/g, "/").replace(/^\//, "").split("/").slice(0, -1).some((e) => e === "AppData" || e === ".trash"));
	return Promise.all(n.map(async (n) => {
		let r = await k(n.path, {
			rootPath: t,
			projectId: e,
			source: "project",
			size: n.size
		});
		return {
			...n,
			assetId: r.assetId,
			relativePath: r.relativePath,
			source: "project",
			availability: "online"
		};
	}));
}
var Cr = [
	"txt",
	"md",
	"markdown",
	"json",
	"csv",
	"tsv",
	"yaml",
	"yml",
	"xml",
	"html",
	"htm",
	"css",
	"js",
	"jsx",
	"ts",
	"tsx",
	"log"
];
async function wr(e = "授权当前对话读取本地文件") {
	if (!b()) throw Error("本地文件授权仅在 Tauri 桌面环境可用");
	let t = await f({
		multiple: !0,
		directory: !1,
		title: e,
		filters: [{
			name: "文本与数据文件",
			extensions: Cr
		}]
	});
	if (!t) return [];
	let n = Array.isArray(t) ? t : [t], r = [];
	for (let e of n.slice(0, 10)) {
		let t = e.split(/[/\\]/).pop() || "未命名文件", n = t.split(".").pop()?.toLowerCase() || "";
		if (!Cr.includes(n)) continue;
		let i = await c(e);
		i.isFile && r.push({
			path: e,
			fileName: t,
			size: i.size,
			extension: n
		});
	}
	return r;
}
async function Tr(e, t, n) {
	if (!b()) throw Error("本地文件读取仅在 Tauri 桌面环境可用");
	if (n?.aborted) throw new DOMException("读取已取消", "AbortError");
	let r = await c(e);
	if (!r.isFile) throw Error("授权目标已不再是文件");
	if (r.size > t) throw Error(`文件超过 ${Math.floor(t / 1024)} KB 读取限制`);
	let i = await u(e);
	if (n?.aborted) throw new DOMException("读取已取消", "AbortError");
	try {
		return new TextDecoder("utf-8", { fatal: !0 }).decode(i);
	} catch {
		throw Error("文件不是有效的 UTF-8 文本");
	}
}
async function Er(e, t, n = "保存 Agent 输出") {
	if (!b()) throw Error("本地文件写入仅在 Tauri 桌面环境可用");
	let r = w(t || "agent-output.txt"), i = await d({
		defaultPath: r,
		title: n,
		filters: [{
			name: "文本文件",
			extensions: [
				"txt",
				"md",
				"json",
				"csv"
			]
		}]
	});
	return i ? (await o(i, new TextEncoder().encode(e)), { fileName: i.split(/[/\\]/).pop() || r }) : null;
}
async function Dr(e, t) {
	try {
		if (b()) {
			let n = await f({
				multiple: !1,
				title: "选择文件",
				filters: !e || e === "*/*" || e.trim() === "*/*" ? [] : [{
					name: "支持的文件",
					extensions: e.split(",").map((e) => e.trim().replace(".", ""))
				}]
			});
			if (!n) return null;
			let r = n.split(/[\\/]/).pop() || "file", i = 0;
			try {
				i = (await c(n)).size;
			} catch {}
			if (t && t !== "default") {
				let e = await fr(n, t);
				if (e) return {
					dataUrl: e.assetUrl,
					fileName: e.fileName,
					fileSize: i,
					filePath: e.filePath
				};
			}
			let a = r.split(".").pop()?.toLowerCase() || "", o = q(r);
			i > 0 && J(i, o, `${H[o]}「${r}」`);
			let s = await u(n);
			J(s.byteLength, o, `${H[o]}「${r}」`);
			let l = Be(s.buffer);
			return {
				dataUrl: `data:${g(a)};base64,${l}`,
				fileName: r,
				fileSize: s.byteLength
			};
		}
		let n = await or(e || "*/*");
		if (!n) return null;
		let r = q(n.type), i = r === "other" ? q(n.name) : r;
		J(n.size, i, `${H[i]}「${n.name}」`);
		let a = Be(await n.arrayBuffer());
		return {
			dataUrl: `data:${g(n.name.split(".").pop()?.toLowerCase() || "")};base64,${a}`,
			fileName: n.name,
			fileSize: n.size
		};
	} catch (e) {
		throw console.error("Upload to project failed:", e), e;
	}
}
async function Or(e) {
	return Dr(e);
}
function kr(e) {
	let t = e.fileName || "", n = e.imageUrl, r = e.videoUrl, i = e.audioUrl, a = e.filePath, o = n || r || i;
	if (!o && !a) return null;
	let s = t;
	if (!s && a && (s = a.split(/[\\/]/).pop() || ""), !s && o) if (o.startsWith("data:")) s = "";
	else try {
		let e = new URL(o);
		s = decodeURIComponent(e.pathname).split(/[\\/]/).pop() || "";
	} catch {
		s = "";
	}
	s ||= "file";
	let c = Ve(s), l = a || `node://${s}`;
	return {
		assetId: e.assetId,
		name: s,
		path: l,
		relativePath: e.relativePath,
		assetUrl: o || void 0,
		size: 0,
		category: c
	};
}
function Ar(e) {
	switch (e) {
		case "ai-text": return ".txt";
		case "ai-markdown": return ".md";
		case "ai-image":
		case "source-image": return ".png";
		case "ai-video":
		case "source-video": return ".mp4";
		case "ai-audio":
		case "source-audio": return ".mp3";
		case "ai-panorama": return ".png";
		default: return ".txt";
	}
}
function jr(e) {
	switch (e) {
		case "ai-text": return [{
			name: "文本文件",
			extensions: ["txt"]
		}, {
			name: "所有文件",
			extensions: ["*"]
		}];
		case "ai-markdown": return [{
			name: "Markdown 文件",
			extensions: ["md"]
		}, {
			name: "所有文件",
			extensions: ["*"]
		}];
		case "ai-image":
		case "source-image":
		case "ai-panorama": return [{
			name: "图片文件",
			extensions: [
				"png",
				"jpg",
				"jpeg",
				"webp"
			]
		}, {
			name: "所有文件",
			extensions: ["*"]
		}];
		case "ai-video":
		case "source-video": return [{
			name: "视频文件",
			extensions: [
				"mp4",
				"webm",
				"mov"
			]
		}, {
			name: "所有文件",
			extensions: ["*"]
		}];
		case "ai-audio":
		case "source-audio": return [{
			name: "音频文件",
			extensions: [
				"mp3",
				"wav",
				"ogg"
			]
		}, {
			name: "所有文件",
			extensions: ["*"]
		}];
		default: return [{
			name: "所有文件",
			extensions: ["*"]
		}];
	}
}
async function Mr(e) {
	let { filePath: t, mediaUrl: n, textOutput: r, nodeType: i, fileName: a } = e, s = Ar(i);
	if (!b()) return console.warn("[fileService] saveNodeOutputToFile: 仅 Tauri 桌面环境支持"), null;
	let c = a || "output", l = c.lastIndexOf(".");
	l > 0 && (c = c.substring(0, l)), c += s;
	let f = jr(i), p = await d({
		defaultPath: c,
		filters: f
	});
	if (!p) return null;
	try {
		if (t) try {
			return await o(p, await u(t)), p;
		} catch (e) {
			if (!n && !r) throw e;
			console.warn("[fileService] saveNodeOutputToFile: 源文件读取失败，改用节点 URL:", t, e);
		}
		if (n && n.startsWith("data:")) {
			let e = n.indexOf(","), t = e > 0 ? n.substring(e + 1) : "", r = atob(t), i = new Uint8Array(r.length);
			for (let e = 0; e < r.length; e++) i[e] = r.charCodeAt(e);
			return await o(p, i), p;
		}
		if (n && /^(asset:|blob:|https?:)/.test(n)) {
			let e = await fetch(n);
			if (!e.ok) throw Error(`读取媒体失败：HTTP ${e.status}`);
			let t = await e.arrayBuffer();
			return await o(p, new Uint8Array(t)), p;
		}
		return r ? (await o(p, new TextEncoder().encode(r)), p) : (console.warn("[fileService] saveNodeOutputToFile: 无可保存的内容"), null);
	} catch (e) {
		throw console.error("[fileService] saveNodeOutputToFile 失败:", e), e;
	}
}
//#endregion
export { dn as $, Hn as A, yn as B, pr as C, pt as Ct, Or as D, nt as Dt, ar as E, k as Et, Pn as F, fn as G, ln as H, jn as I, hn as J, tn as K, pn as L, Un as M, In as N, Dr as O, Nn as P, sn as Q, nn as R, mr as S, st as St, wr as T, Qe as Tt, cn as U, on as V, un as W, xn as X, vn as Y, an as Z, dr as _, _t, fr as a, It as at, Er as b, ft as bt, kr as c, Pt as ct, q as d, N as dt, $t as et, Yn as f, xt as ft, Tr as g, ot as gt, yr as h, Tt as ht, Y as i, rn as it, Rn as j, Ln as k, sr as l, St as lt, Sr as m, Ct as mt, Xn as n, _n as nt, Jn as o, jt as ot, $ as p, bt as pt, en as q, Zn as r, bn as rt, br as s, Ft as st, J as t, mn as tt, Wn as u, Et as ut, xr as v, gt as vt, Mr as w, vt as wt, gr as x, dt as xt, hr as y, mt as yt, gn as z };
