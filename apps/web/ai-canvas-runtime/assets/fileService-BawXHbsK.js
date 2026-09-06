import { i as e } from "./react-Dfufv8pq.js";
import { a as t } from "./core-D3lATfku.js";
import { i as n, n as r } from "./path-gl9BKl4b.js";
import { a as i, c as a, d as o, i as s, l as c, n as l, o as u } from "./dist-js-CiPmuq1Z.js";
import { i as d, r as f } from "./dist-js-Cjy7VdJu.js";
import { a as p } from "./event-BlmvLUFr.js";
import { At as m, Ct as h, Dt as ee, E as te, Et as ne, J as re, Mt as ie, Ot as ae, P as oe, Pt as se, R as ce, St as le, Y as ue, _ as de, _t as fe, b as pe, bt as me, f as he, gt as ge, jt as _e, k as ve, v as ye, vt as be, wt as xe, y as Se, z as Ce } from "./indexedDbService-CqWFA8LG.js";
import { A as g, B as we, C as Te, D as _, E as Ee, F as De, G as Oe, H as v, I as y, J as ke, K as Ae, L as je, M as b, N as x, O as Me, P as Ne, R as Pe, S, T as C, U as Fe, V as Ie, W as w, _ as Le, b as Re, f as ze, g as T, h as Be, j as E, k as Ve, l as He, m as Ue, p as We, q as D, s as Ge, v as Ke, w as qe, x as Je, y as Ye, z as Xe } from "./directorSceneSchema-D22Qlbpb.js";
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
async function yt() {
	let e = await Ee();
	return e ? x(e, "file") : null;
}
async function bt() {
	if (!b()) return null;
	let e = await yt();
	if (!e) return null;
	try {
		return await l(e) || await s(e, { recursive: !0 }), e;
	} catch (t) {
		return console.error("Failed to create global files dir:", e, t), null;
	}
}
async function xt() {
	let e = await yt();
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
async function St(e, t = {}) {
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
async function Ct(e, t = {}) {
	if (!b() || e.length === 0) return [];
	let n = t.maxFilesPerFolder ?? 3e3;
	return (await Promise.all(e.map(async (e) => await l(e).catch(() => !1) ? (await St(e, { maxFiles: n })).map((t) => ({
		...t,
		source: "folder",
		folderRoot: e
	})) : []))).flat();
}
async function wt() {
	if (!b()) return 0;
	let e = await f({
		multiple: !0,
		title: "添加文件到资产库"
	});
	if (!e) return 0;
	let t = Array.isArray(e) ? e : [e], n = await bt();
	if (!n) return 0;
	let r = 0;
	for (let e of t) try {
		await o(await v(n, e.split(/[\\/]/).pop() || "file"), await u(e)), r++;
	} catch (t) {
		console.error("Failed to add file to global:", e, t);
	}
	return r;
}
async function Tt() {
	if (!b()) return null;
	let e = await f({
		directory: !0,
		title: "添加本地文件夹"
	});
	return !e || Array.isArray(e) ? typeof e == "string" ? e : null : e;
}
async function Et(e) {
	if (!b()) return null;
	let t = await bt();
	if (!t) return null;
	try {
		let n = await v(t, e.split(/[\\/]/).pop() || "file");
		return await o(n, await u(e)), n;
	} catch (t) {
		return console.error("Failed to save file to permanent:", e, t), null;
	}
}
async function Dt(e) {
	if (!b()) return null;
	if (e.path.startsWith("virtual://")) {
		if (!e.assetUrl || !e.assetUrl.startsWith("data:")) return null;
		let t = await bt();
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
	return Et(e.path);
}
async function Ot(e) {
	await ct(e);
}
//#endregion
//#region src/services/mediaDataUrl.ts
var kt = 256 * 1024, At = 1024 * 1024, jt = {
	image: 32 * 1024 * 1024,
	video: 64 * 1024 * 1024,
	audio: 32 * 1024 * 1024,
	other: 8 * 1024 * 1024
};
function Mt(e) {
	return e?.reason ?? new DOMException("操作已取消", "AbortError");
}
function Nt(e) {
	if (e?.aborted) throw Mt(e);
}
async function Pt(e) {
	await new Promise((e) => setTimeout(e, 0)), Nt(e);
}
async function Ft(e) {
	let t = globalThis.crypto?.subtle;
	if (!t) throw Error("当前环境缺少内容摘要能力");
	let n = e.buffer instanceof ArrayBuffer && e.byteOffset === 0 && e.byteLength === e.buffer.byteLength ? e.buffer : e.buffer.slice(e.byteOffset, e.byteOffset + e.byteLength), r = new Uint8Array(await t.digest("SHA-256", n));
	return Array.from(r, (e) => e.toString(16).padStart(2, "0")).join("");
}
async function It(e, t = {}) {
	Nt(t.signal);
	let n = e.slice(0, 4098).indexOf(",");
	if (n < 0) throw Error("Data URL 格式无效：缺少内容分隔符");
	let r = e.slice(0, n), i = t.maxBytes ?? 2 ** 53 - 1, a = t.label ?? "媒体";
	if (!/;base64(?:;|$)/i.test(r)) {
		let n = await fetch(e, { signal: t.signal });
		if (!n.ok) throw Error(`读取 Data URL 失败：HTTP ${n.status}`);
		let r = await n.arrayBuffer();
		if (r.byteLength > i) throw Error(`${a}大小超过允许的内存转换上限`);
		return new Uint8Array(r);
	}
	let o;
	if (t.expectedBytes === void 0) {
		let r = 0, i = "", a = "";
		for (let o = n + 1; o < e.length; o += 1) {
			let s = e.charCodeAt(o);
			s !== 32 && (s < 9 || s > 13) && (r += 1, a = i, i = e[o]), (o - n) % At === 0 && await Pt(t.signal);
		}
		let s = i === "=" ? a === "=" ? 2 : 1 : 0;
		o = Math.max(0, Math.floor(r * 3 / 4) - s);
	} else if (o = t.expectedBytes, !Number.isSafeInteger(o) || o < 0) throw Error("Data URL 预估字节数无效");
	if (o > i) throw Error(`${a}大小超过允许的内存转换上限`);
	let s = new Uint8Array(o), c = 0, l = (e) => {
		if (c + e.length > s.length) throw Error("Data URL 解码长度与预估不一致");
		for (let t = 0; t < e.length; t += 1) s[c] = e.charCodeAt(t), c += 1;
	}, u = "";
	for (let r = n + 1; r < e.length; r += kt) {
		Nt(t.signal);
		let i = Math.min(e.length, r + kt), a = u + e.slice(r, i).replace(/\s/g, ""), o = i === e.length ? a.length : a.length - a.length % 4;
		o > 0 && l(atob(a.slice(0, o))), u = a.slice(o), (r - n) % At < kt && await Pt(t.signal);
	}
	if (u && l(atob(u)), t.expectedBytes !== void 0 && c !== t.expectedBytes) throw Error("Data URL 解码长度与预估不一致");
	return c === s.length ? s : s.slice(0, c);
}
//#endregion
//#region src/services/providerSecretService.ts
var N = "secret:";
function P(e) {
	return typeof e == "object" && !!e && !Array.isArray(e);
}
function Lt(e) {
	return P(e) ? e : null;
}
function Rt(e) {
	return `${N}provider/${e.replace(/[^A-Za-z0-9._-]/g, "_").replace(/\.{2,}/g, "_")}`;
}
function zt(e) {
	return e.startsWith(N) ? e.slice(7) : null;
}
async function Bt(e, n) {
	return t(e, n);
}
async function Vt() {
	if (!b()) return !1;
	try {
		return await t("secret_store_available");
	} catch (e) {
		return console.warn("[providerSecret] 凭据存储探测失败:", e), !1;
	}
}
async function Ht(e, t) {
	let n = zt(e);
	if (!n || !b()) return !1;
	try {
		return await Bt("secret_set", {
			key: n,
			value: t
		}), !0;
	} catch (t) {
		return console.warn("[providerSecret] 写入凭据存储失败:", e, t), !1;
	}
}
async function Ut(e) {
	let t = zt(e);
	if (!t || !b()) return null;
	try {
		return await Bt("secret_get", { key: t }) ?? null;
	} catch (t) {
		return console.warn("[providerSecret] 读取凭据存储失败:", e, t), null;
	}
}
async function Wt(e, t) {
	return Ht(`${N}${e}`, t);
}
async function Gt(e) {
	return Ut(`${N}${e}`);
}
async function Kt(e) {
	let t = zt(Rt(e));
	if (!(!t || !b())) try {
		await Bt("secret_delete", { key: t });
	} catch (t) {
		console.warn("[providerSecret] 删除凭据存储条目失败:", e, t);
	}
}
async function qt(e) {
	let t = Lt(e);
	if (!t) return {
		config: e,
		unstored: []
	};
	let n = P(t.providers) ? t.providers : void 0, r = {}, i = [];
	for (let [e, t] of Object.entries(n ?? {})) {
		if (!P(t)) {
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
		let s = Rt(e);
		if (await Ht(s, n)) r[e] = {
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
	if (n && (a.providers = r), P(t.dreaminaAuth) && "cookie" in t.dreaminaAuth) {
		let { cookie: e, ...n } = t.dreaminaAuth;
		a.dreaminaAuth = n;
	}
	return {
		config: a,
		unstored: i
	};
}
async function Jt(e) {
	let t = Lt(e);
	if (!t || !P(t.providers)) return {
		config: e,
		migrated: !1,
		missing: []
	};
	let n = {}, r = [], i = !1;
	for (let [e, a] of Object.entries(t.providers)) {
		if (!P(a)) {
			n[e] = a;
			continue;
		}
		let t = typeof a.apiKey == "string" ? a.apiKey : "", o = typeof a.apiKeyRef == "string" ? a.apiKeyRef : "";
		if (t) {
			let r = Rt(e), o = await Ht(r, t);
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
		let s = await Ut(o);
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
var Yt = [
	"imageUrl",
	"videoUrl",
	"audioUrl",
	"thumbnailUrl",
	"sourceUrl",
	"output",
	"mattingMask",
	"annotation"
], Xt = [
	"imageUrl",
	"videoUrl",
	"audioUrl",
	"url"
], Zt = new Set([
	"imageUrl",
	"videoUrl",
	"audioUrl",
	"output"
]);
function F(e) {
	return typeof e == "string" && (/^data:(?:image|video|audio)\//i.test(e) || /^blob:/i.test(e));
}
function Qt(e, t, n) {
	if (/^data:image\//i.test(e)) return "image";
	if (/^data:video\//i.test(e)) return "video";
	if (/^data:audio\//i.test(e)) return "audio";
	let r = `${t} ${String(n.type ?? "")} ${String(n.kind ?? "")}`.toLowerCase();
	return r.includes("video") ? "video" : r.includes("audio") || r.includes("voice") ? "audio" : "image";
}
function $t(e, t) {
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
	return n && r[n] ? r[n] : t === "video" ? ".mp4" : t === "audio" ? ".mp3" : ".png";
}
async function en(e, t) {
	if (/^data:/i.test(e)) return It(e, {
		maxBytes: jt[t],
		label: "项目内嵌媒体"
	});
	let n = await fetch(e);
	if (!n.ok) throw Error(`读取已存储媒体失败：HTTP ${n.status}`);
	let r = new Uint8Array(await n.arrayBuffer());
	if (r.byteLength > jt[t]) throw Error("项目内嵌媒体超过允许的内存迁移上限");
	return r;
}
function tn(e) {
	return e === "video" ? "embedded-video" : e === "audio" ? "embedded-audio" : "embedded-image";
}
async function nn(e, t, n) {
	let r = t.cache.get(e);
	if (r) return r;
	let i = (async () => {
		let r = await en(e, n), i = await Ft(r), a = `${tn(n)}-${i.slice(0, 20)}${$t(e, n)}`, s = x(t.projectDir, a);
		return await l(s).catch(() => !1) || (await o(s, r), y()), {
			filePath: s,
			assetUrl: await C(s)
		};
	})();
	t.cache.set(e, i);
	try {
		return await i;
	} catch (n) {
		throw t.cache.delete(e), n;
	}
}
async function rn(e, t, n, r = /* @__PURE__ */ new Set()) {
	let i = null, a;
	for (let o of t) {
		let t = (i ?? e)[o];
		if (!F(t)) continue;
		let s = await nn(t, n, Qt(t, o, e));
		i ||= { ...e }, i[o] = s.assetUrl, !a && r.has(o) && (a = s.filePath);
	}
	return i && a && (i.filePath = a), i ?? e;
}
async function I(e, t) {
	return rn(e, Xt, t, new Set(Xt));
}
async function L(e, t, n) {
	if (!e.filePath) return e;
	let r = e.filePath.replace(/\\/g, "/"), i = n.replace(/\\/g, "/").replace(/\/+$/, "");
	if (!r.toLowerCase().startsWith(`${i.toLowerCase()}/`) || !await l(r).catch(() => !1)) return e;
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
async function R(e, t, n) {
	let r = Array(e.length), i = 0;
	return await Promise.all(Array.from({ length: Math.min(t, e.length) }, async () => {
		for (; i < e.length;) {
			let t = i;
			i += 1, r[t] = await n(e[t], t);
		}
	})), r;
}
function z(e) {
	if (!e || typeof e != "object") return !1;
	let t = e;
	return Xt.some((e) => F(t[e]));
}
function an(e) {
	return e ? Yt.some((t) => F(e[t])) || (e.storyboardOverrides ?? []).some(z) || (e.shotlistRows ?? []).some((e) => z(e.frame)) || (e.videoReferences ?? []).some(z) ? !0 : Array.isArray(e.directorCaptureUrls) && e.directorCaptureUrls.some(F) : !1;
}
async function on(e, t) {
	return Array.isArray(e) ? R(e, sn(e) ? 1 : 4, async (e) => {
		if (!e.data) return e;
		let n = await rn(e.data, Yt, t, Zt);
		if (n = await L(n, t.projectId, t.projectDir), Array.isArray(n.storyboardOverrides)) {
			let e = await R(n.storyboardOverrides, 4, async (e) => e ? L(await I(e, t), t.projectId, t.projectDir) : null);
			n = {
				...n,
				storyboardOverrides: e
			};
		}
		if (Array.isArray(n.shotlistRows)) {
			let e = await R(n.shotlistRows, 4, async (e) => {
				if (!e.frame) return e;
				let n = await L(await I(e.frame, t), t.projectId, t.projectDir);
				return {
					...e,
					frame: n
				};
			});
			n = {
				...n,
				shotlistRows: e
			};
		}
		if (Array.isArray(n.videoReferences)) {
			let e = await R(n.videoReferences, 4, async (e) => L(await I(e, t), t.projectId, t.projectDir));
			n = {
				...n,
				videoReferences: e
			};
		}
		if (Array.isArray(n.directorCaptureUrls)) {
			let e = Array.isArray(n.directorCaptureFilePaths) ? n.directorCaptureFilePaths : [], r = await R(n.directorCaptureUrls, 2, async (n, r) => {
				if (!F(n)) return {
					url: n,
					filePath: e[r]
				};
				let i = await nn(n, t, "image");
				return {
					url: i.assetUrl,
					filePath: i.filePath
				};
			});
			n = {
				...n,
				directorCaptureUrls: r.map((e) => e.url),
				directorCaptureFilePaths: r.map((e) => e.filePath)
			};
		}
		return {
			...e,
			data: n
		};
	}) : e;
}
function sn(e) {
	return Array.isArray(e) && e.some((e) => an(e.data));
}
function cn(e) {
	return z(e?.visualStyle?.styleReference);
}
async function ln(e, t) {
	let n = e?.visualStyle?.styleReference;
	if (!e?.visualStyle || !n) return e;
	let r = await L(await I(n, t), t.projectId, t.projectDir);
	return {
		...e,
		visualStyle: {
			...e.visualStyle,
			styleReference: r
		}
	};
}
function un(e) {
	return e ? e.characters.some((e) => F(e.imageUrl) || (e.referenceImages ?? []).some(z) || (e.voiceClips ?? []).some(z) || (e.actions ?? []).some((e) => (e.media ?? []).some(z))) || e.scenes.some((e) => F(e.imageUrl)) || e.props.some((e) => F(e.imageUrl)) : !1;
}
function dn(e) {
	return sn(e.nodes) || cn(e.settings) || un(e.dramaAssets);
}
function fn(e) {
	if (!(!e || !(e.includes("asset.localhost") || e.startsWith("asset://")))) try {
		let { pathname: t } = new URL(e), n = decodeURIComponent(t.replace(/^\//, ""));
		return n ? D(n) : void 0;
	} catch {
		return;
	}
}
async function pn(e, t, n) {
	let r = e.filePath ? D(e.filePath) : void 0, i = e.relativePath ? x(n, e.relativePath) : void 0, a = fn(e.imageUrl || e.videoUrl || e.audioUrl || e.url), o = (e) => e.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase(), s = (e) => !!(e && o(e).startsWith(`${o(n)}/`)), c = s(r) ? [r, i] : s(a) ? [a, i] : [i, r], u;
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
async function B(e, t, n) {
	try {
		return await pn(e, t, n);
	} catch {
		return console.warn("[项目加载] 单个资产展示信息恢复失败，已保留节点", {
			projectId: t,
			assetId: e.assetId
		}), e;
	}
}
async function mn(e, t) {
	let n;
	try {
		n = await St(t);
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
function hn(e) {
	if (!e.data) return [];
	let t = Array.isArray(e.data.storyboardOverrides) ? e.data.storyboardOverrides : [], n = Array.isArray(e.data.shotlistRows) ? e.data.shotlistRows.map((e) => e.frame).filter(Boolean) : [], r = Array.isArray(e.data.videoReferences) ? e.data.videoReferences : [];
	return [
		e.data,
		...t,
		...n,
		...r
	];
}
function gn(e) {
	return hn(e).some((e) => !!(e && !e.filePath && (e.assetId || e.relativePath)));
}
async function _n(e, t) {
	if (!Array.isArray(e)) return e;
	let n = await E(t);
	if (!n) return e;
	let r = async (e) => {
		if (!e.data) return e;
		let r = await B(e.data, t, n);
		if (Array.isArray(r.storyboardOverrides)) {
			let e = await R(r.storyboardOverrides, 4, async (e) => e ? B(e, t, n) : null);
			r = {
				...r,
				storyboardOverrides: e
			};
		}
		if (Array.isArray(r.shotlistRows)) {
			let e = await R(r.shotlistRows, 4, async (e) => ({
				...e,
				frame: e.frame ? await B(e.frame, t, n) : e.frame
			}));
			r = {
				...r,
				shotlistRows: e
			};
		}
		if (Array.isArray(r.videoReferences)) {
			let e = await R(r.videoReferences, 4, (e) => B(e, t, n));
			r = {
				...r,
				videoReferences: e
			};
		}
		if (Array.isArray(r.directorCaptureUrls) && Array.isArray(r.directorCaptureFilePaths)) {
			let e = await R(r.directorCaptureUrls, 2, async (e, t) => {
				let n = r.directorCaptureFilePaths?.[t];
				return n && await l(n).catch(() => !1) ? C(n) : e;
			});
			r = {
				...r,
				directorCaptureUrls: e
			};
		}
		return {
			...e,
			data: r
		};
	}, i = await Promise.all(e.map(r));
	return i.some(gn) ? (await mn(t, n), Promise.all(e.map(r))) : i;
}
async function vn(e, t, n) {
	let r = e?.visualStyle?.styleReference;
	if (!e?.visualStyle || !r) return e;
	let i = await B(r, t, n);
	return {
		...e,
		visualStyle: {
			...e.visualStyle,
			styleReference: i
		}
	};
}
async function yn(e, t) {
	if (!e) return e;
	let n = async (e) => L(await I(e, t), t.projectId, t.projectDir), r = await R(e.characters, 2, async (e) => {
		let t = await n(e), r = await R(e.referenceImages ?? [], 2, n), i = await R(e.voiceClips ?? [], 2, n), a = await R(e.actions ?? [], 2, async (e) => ({
			...e,
			media: await R(e.media ?? [], 2, n)
		})), o = r.find((t) => t.id === e.primaryReferenceImageId) ?? r[0];
		return {
			...t,
			referenceImages: r,
			voiceClips: i,
			actions: a,
			imageUrl: o?.imageUrl ?? t.imageUrl
		};
	}), i = await R(e.scenes, 2, n), a = await R(e.props, 2, n);
	return {
		...e,
		characters: r,
		scenes: i,
		props: a
	};
}
async function bn(e) {
	let t = await E(e.id);
	if (!t) {
		if (dn(e)) throw Error("当前环境没有项目目录，无法将内嵌媒体写入 IndexedDB");
		return e;
	}
	let n = {
		projectId: e.id,
		projectDir: t,
		cache: /* @__PURE__ */ new Map()
	}, r = await on(e.nodes, n), i = await ln(e.settings, n), a = await yn(e.dramaAssets, n);
	return {
		...e,
		nodes: r,
		settings: i,
		dramaAssets: a
	};
}
async function xn(e, t) {
	let n = await E(t);
	if (!n) return e;
	let r = (e) => B(e, t, n), i = await R(e.characters, 2, async (e) => {
		let t = await r(e), n = await R(e.referenceImages ?? [], 2, r), i = await R(e.voiceClips ?? [], 2, r), a = await R(e.actions ?? [], 2, async (e) => ({
			...e,
			media: await R(e.media ?? [], 2, r)
		})), o = n.find((t) => t.id === e.primaryReferenceImageId) ?? n[0];
		return {
			...t,
			referenceImages: n,
			voiceClips: i,
			actions: a,
			imageUrl: o?.imageUrl ?? t.imageUrl
		};
	}), a = await R(e.scenes, 2, r), o = await R(e.props, 2, r);
	return {
		...e,
		characters: i,
		scenes: a,
		props: o
	};
}
async function Sn(e) {
	try {
		return await re(await bn(e)), console.log("Project saved to IndexedDB:", e.id), e.id;
	} catch (e) {
		throw console.error("Save project to IndexedDB failed:", e), e;
	}
}
async function Cn() {
	try {
		return await de();
	} catch (e) {
		throw console.error("Load projects list failed:", e), e;
	}
}
async function wn(e) {
	try {
		let t = await ve(e);
		if (!t) return null;
		let n = t;
		if (dn(n)) try {
			n = await bn(n), await re(n), console.log("[项目加载] 已将旧的内嵌媒体迁移到项目目录:", e);
		} catch (t) {
			console.warn("[项目加载] 内嵌媒体迁移失败，未覆盖原项目数据", {
				projectId: e,
				error: t
			});
		}
		let r = n.nodes;
		try {
			r = await _n(r, e);
		} catch {
			console.warn("[项目加载] 资产恢复未完成，已使用原始画布数据", { projectId: e });
		}
		let i = await E(e), a = n.settings;
		if (i) try {
			a = await vn(a, e, i);
		} catch {
			console.warn("[项目加载] 项目风格参考图恢复失败，已保留原始设置", { projectId: e });
		}
		let o = Ze(n.dramaAssets);
		try {
			o = await xn(o, e);
		} catch {
			console.warn("[项目加载] 角色库本地文件恢复未完成，已使用原始角色数据", { projectId: e });
		}
		return {
			...n,
			nodes: r,
			settings: a,
			dramaAssets: o
		};
	} catch (e) {
		return console.error("Load project data failed:", e), null;
	}
}
async function Tn(e) {
	try {
		await he(e), console.log("Project deleted from IndexedDB:", e);
	} catch (e) {
		throw console.error("Delete project from IndexedDB failed:", e), e;
	}
}
async function En(e) {
	try {
		await se(e), console.log("Workflow saved to IndexedDB:", e.id);
	} catch (e) {
		throw console.error("Save workflow failed:", e), e;
	}
}
async function Dn() {
	try {
		return await ne();
	} catch (e) {
		return console.error("Load workflows failed:", e), [];
	}
}
async function On(e) {
	try {
		await me(e), console.log("Workflow deleted from IndexedDB:", e);
	} catch (e) {
		throw console.error("Delete workflow failed:", e), e;
	}
}
async function kn(e) {
	try {
		let { config: t, unstored: n } = await qt(e);
		return await ae(t), console.log("Config saved to IndexedDB"), n;
	} catch (e) {
		throw console.error("Save config failed:", e), e;
	}
}
async function An() {
	try {
		let e = await ee();
		if (e == null) return {
			config: null,
			missingSecrets: []
		};
		let { config: t, migrated: n, missing: r } = await Jt(e);
		if (n) {
			let { config: e } = await qt(t);
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
async function jn() {
	return (await An()).config;
}
async function Mn() {
	try {
		return await ee();
	} catch (e) {
		return console.error("Load config failed:", e), null;
	}
}
async function Nn(e) {
	try {
		await m(e), console.log("Preset saved to IndexedDB:", e.id);
	} catch (e) {
		throw console.error("Save preset failed:", e), e;
	}
}
async function Pn() {
	try {
		return await le();
	} catch (e) {
		return console.error("Load presets failed:", e), [];
	}
}
async function Fn(e) {
	try {
		await ge(e), console.log("Preset deleted from IndexedDB:", e);
	} catch (e) {
		throw console.error("Delete preset failed:", e), e;
	}
}
async function In(e) {
	try {
		await _e(e), console.log("Skill saved to IndexedDB:", e.id);
	} catch (e) {
		throw console.error("Save skill failed:", e), e;
	}
}
async function Ln() {
	try {
		return await h();
	} catch (e) {
		return console.error("Load skills failed:", e), [];
	}
}
async function Rn(e) {
	try {
		await fe(e), console.log("Skill deleted from IndexedDB:", e);
	} catch (e) {
		throw console.error("Delete skill failed:", e), e;
	}
}
async function zn(e) {
	try {
		await ie(e);
	} catch (e) {
		throw console.error("Save style failed:", e), e;
	}
}
async function Bn() {
	try {
		return await xe();
	} catch (e) {
		return console.error("Load styles failed:", e), [];
	}
}
async function Vn(e) {
	try {
		await be(e);
	} catch (e) {
		throw console.error("Delete style failed:", e), e;
	}
}
async function Hn(e) {
	try {
		await ue(e);
	} catch (e) {
		throw console.error("Save toolbar layouts failed:", e), e;
	}
}
async function Un() {
	try {
		return await oe();
	} catch (e) {
		return console.error("Load toolbar layouts failed:", e), null;
	}
}
//#endregion
//#region src/services/fs/skillFiles.ts
var Wn = new Set([
	"md",
	"txt",
	"json"
]), V = "Skill 资料路径无效，只能使用 Skill 内相对路径";
function Gn(e) {
	try {
		return new TextDecoder("utf-8", { fatal: !0 }).decode(e);
	} catch {
		throw Error("Skill 文件必须是 UTF-8 文本");
	}
}
function Kn(e) {
	let t = e.split(".").pop()?.toLowerCase() || "";
	return Wn.has(t);
}
function qn(e) {
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
async function Jn() {
	let e = x(await r(), "skill");
	return await l(e) || await s(e, { recursive: !0 }), e;
}
async function Yn(e, t = e) {
	let n = await i(e), r = [];
	for (let i of n) {
		let n = x(e, i.name);
		if (i.isDirectory) {
			r.push(...await Yn(n, t));
			continue;
		}
		if (!i.isFile || !Kn(i.name)) continue;
		let a = t.replace(/\\/g, "/").replace(/\/+$/, ""), o = n.replace(/\\/g, "/");
		r.push({
			path: n,
			relativePath: o.startsWith(`${a}/`) ? o.slice(a.length + 1) : i.name,
			name: i.name
		});
	}
	return r.sort((e, t) => e.relativePath.localeCompare(t.relativePath, void 0, { numeric: !0 }));
}
function Xn(e) {
	return e.find((e) => e.name.toLowerCase() === "skill.md") ?? e.find((e) => e.relativePath.toLowerCase().endsWith("/skill.md")) ?? e.find((e) => e.name.toLowerCase().endsWith(".md")) ?? e[0] ?? null;
}
async function Zn() {
	let e = await f({
		directory: !0,
		multiple: !1,
		title: "上传 Skill 文件夹"
	});
	if (!e || Array.isArray(e)) return null;
	let t = e.split(/[\\/]/).filter(Boolean).pop() || "skill", n = await Yn(e);
	if (n.length === 0) throw Error("Skill 文件夹中没有可用的 .md / .txt / .json 文件");
	let r = Xn(n);
	if (!r) throw Error("Skill 文件夹中没有可调用入口文件");
	let i = await v(await Jn(), Oe(t));
	await s(i, { recursive: !0 });
	let a = "";
	for (let e of n) {
		let t = await u(e.path), n = Gn(t);
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
async function Qn() {
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
	if (!Kn(t)) throw Error("Skill 文件只支持 .md / .txt / .json");
	let n = await u(e), r = Gn(n), i = await v(await Jn(), t);
	return await o(i, n), {
		fileName: t,
		content: r,
		sourceType: "file",
		storagePath: i,
		entryFileName: t
	};
}
async function $n(e = "folder") {
	try {
		if (b()) return e === "file" ? await Qn() : await Zn();
		let t = await qn(".md,.txt,.json");
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
function er(e) {
	let t = e.trim().replace(/\\/g, "/");
	if (!t || t.includes(":") || t.startsWith("/") || t.startsWith("~")) throw Error(V);
	let n = t.split("/");
	if (n.some((e) => !e || e === "." || e === "..")) throw Error(V);
	if (!Kn(n[n.length - 1])) throw Error("Skill 资料只支持 .md / .txt / .json");
	return n.join("/");
}
async function tr(e, t) {
	if (!b() || !e || t <= 0) return [];
	try {
		return await l(e) ? (await Yn(e)).slice(0, t).map((e) => e.relativePath) : [];
	} catch (e) {
		return console.warn("[Skill 资料] 列出附属文件失败:", e), [];
	}
}
async function nr(e, t) {
	let n = er(t);
	if (!b()) throw Error("当前环境不支持读取 Skill 附属资料");
	let r = e.replace(/\\/g, "/").replace(/\/+$/, "");
	if (!r) throw Error(V);
	let i = `${r}/${n}`;
	if (!i.startsWith(`${r}/`)) throw Error(V);
	if (!await l(i)) throw Error(`Skill 资料不存在: ${n}`);
	return Gn(await u(i));
}
//#endregion
//#region src/services/fs/externalEditors.ts
var rr = {
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
async function H(e, n) {
	try {
		return await t("open_with_app", {
			appPath: e,
			filePath: n
		}), !0;
	} catch (t) {
		return console.warn("[fileService] launchApp 失败:", e, t), !1;
	}
}
async function ir(e) {
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
async function ar(e) {
	if (!b()) {
		console.warn("[fileService] openDirectoryInFileManager: 仅 Tauri 桌面环境支持");
		return;
	}
	await t("reveal_in_file_manager", {
		path: e,
		select: !1
	});
}
async function or(e, t) {
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
				for (let e of r) if (await H(e, n)) return;
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
				if (await H(`${e}\\Program Files\\Adobe\\${r}\\Photoshop.exe`, n) || await H(`${e}\\Program Files (x86)\\Adobe\\${r}\\Photoshop.exe`, n)) return;
			}
			throw Error("未找到 Photoshop。请在设置中手动配置 Photoshop 安装路径，或确认已安装 Adobe Photoshop");
		}
		if (n.includes("mac")) {
			if (t?.trim()) {
				if (await H(t, e)) return;
				throw Error(`配置的 Photoshop 路径无效: ${t}`);
			}
			let { Command: n } = await import("./dist-js-BTabQsg0.js");
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
function sr(e, t) {
	let n = e.trim().replace(/\/+$/, "").replace(/\\+$/, "");
	return /\.exe$/i.test(n) ? [n] : [n, ...t.map((e) => `${n}\\${e}`)];
}
async function cr(e) {
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
async function lr(e, t, n) {
	let r = rr[t];
	if (!b()) {
		console.warn(`[fileService] openInVideoEditor(${t}): 仅 Tauri 桌面环境支持`);
		return;
	}
	try {
		let i = (navigator.platform || "").toLowerCase();
		if (i.includes("win")) {
			let i = e.replace(/\//g, "\\");
			if (n?.trim()) {
				for (let e of sr(n, r.executableNames)) if (await H(e, i)) return;
				throw Error(`配置的 ${r.displayName} 路径无效: ${n}`);
			}
			for (let e of await cr(t)) if (await H(e, i)) return;
			throw Error(`未找到 ${r.displayName}。请在设置中手动配置安装路径，或确认已安装该应用`);
		}
		if (i.includes("mac")) {
			if (n?.trim()) {
				if (await H(n, e)) return;
				throw Error(`配置的 ${r.displayName} 路径无效: ${n}`);
			}
			let { Command: t } = await import("./dist-js-BTabQsg0.js");
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
async function ur(e, t) {
	return lr(e, "jianying", t);
}
async function dr(e, t) {
	return lr(e, "premiere", t);
}
//#endregion
//#region src/services/fileService.ts
var fr = /* @__PURE__ */ e({
	CATEGORY_EXTENSIONS: () => ze,
	CATEGORY_LABELS: () => We,
	MEDIA_DATA_URL_MAX_BYTES: () => pr,
	MEDIA_DATA_URL_MAX_HEADER_CHARS: () => hr,
	MEDIA_DATA_URL_TOTAL_MAX_BYTES: () => mr,
	MediaDataUrlHeaderTooLargeError: () => gr,
	MediaDataUrlTooLargeError: () => G,
	MediaDataUrlTotalTooLargeError: () => K,
	PROJECT_DISK_CHANGED_EVENT: () => Ue,
	addAssetFilesToGlobal: () => wt,
	arrayBufferToBase64: () => Be,
	assertMediaDataUrlBudgetAvailable: () => Y,
	assertMediaDataUrlSize: () => J,
	assertMediaDataUrlWithinLimit: () => br,
	assertMediaDataUrlWithinLimitAsync: () => xr,
	assertSafeSkillRelativePath: () => er,
	buildNodeFileName: () => T,
	buildProjectFolderName: () => Le,
	bytePartsToBase64: () => Ke,
	bytePartsToBase64Async: () => Ye,
	collectNodeFileReferences: () => ot,
	consumeMediaDataUrlBudgetBytes: () => Er,
	copyFileToProjectData: () => Lr,
	createMediaDataUrlBudget: () => _r,
	deleteNodeFile: () => _t,
	deletePermanentFile: () => Ot,
	deleteProjectDataDir: () => gt,
	downloadUrlAndSave: () => Gr,
	ensureBinaryFile: () => Re,
	ensureGroupFolder: () => Je,
	ensureProjectDataDir: () => S,
	estimateMediaDataUrlBytes: () => wr,
	estimateMediaDataUrlBytesAsync: () => Tr,
	extractFilesFromNodeData: () => ei,
	fetchImageForCrop: () => Mr,
	fileUriToPath: () => Te,
	flushUndoTrashDirs: () => mt,
	getAppExecutableDir: () => qe,
	getAssetUrlFromPath: () => C,
	getBaseDir: () => Ee,
	getConvertFileSrc: () => _,
	getDefaultBaseDir: () => Me,
	getFileCategory: () => Ve,
	getGlobalFilesDir: () => yt,
	getMimeType: () => g,
	getProjectDataDir: () => E,
	getRelativeAssetPath: () => Qe,
	identifyAsset: () => k,
	inferMediaDataUrlKind: () => q,
	isFileMissing: () => ft,
	isMediaDataUrl: () => yr,
	isPathInsideDir: () => M,
	isTauriEnv: () => b,
	isTransientMediaUrl: () => $,
	joinPath: () => x,
	listDirectoryFiles: () => Ne,
	listExternalFolderFiles: () => Ct,
	listGlobalFiles: () => xt,
	listProjectFiles: () => qr,
	listSkillResourceFiles: () => tr,
	loadConfigWithoutSecrets: () => Mn,
	moveProjectFileToFolder: () => De,
	moveToTrash: () => ct,
	moveToUndoTrash: () => dt,
	notifyProjectDiskChanged: () => y,
	openDirectoryInFileManager: () => ar,
	openInJianying: () => ur,
	openInPhotoshop: () => or,
	openInPremiere: () => dr,
	persistMediaUrlToProjectData: () => Wr,
	pickAssetFolder: () => Tt,
	readAgentAuthorizedTextFile: () => Xr,
	readBinaryFile: () => je,
	readFileToDataUrl: () => Fr,
	readSkillResourceFile: () => nr,
	registerProjectFolder: () => Pe,
	registerProjectFolders: () => Xe,
	renameGroupFolder: () => we,
	renameProjectDataDir: () => Ie,
	renameProjectFileToLabel: () => Kr,
	resolveIndexedAssetPath: () => nt,
	resolveNodeUndoTrashPaths: () => st,
	resolveProjectOutputPath: () => Br,
	resolveUniqueDestPath: () => v,
	restoreFromUndoTrash: () => pt,
	revealFileInFolder: () => ir,
	revertProjectDataDirRename: () => Fe,
	sanitizeFileName: () => w,
	sanitizeFolderName: () => Oe,
	saveAgentTextOutput: () => Zr,
	saveAssetToPermanent: () => Dt,
	saveBinaryToLocalFile: () => Vr,
	saveBinaryToProjectData: () => zr,
	saveDataUrlToProjectData: () => Rr,
	saveNodeOutputToFile: () => ri,
	saveToPermanent: () => Et,
	selectAgentTextFiles: () => Yr,
	setBaseDataDir: () => Ae,
	stripVerbatimPrefix: () => D,
	syncAuthorizedDirectories: () => Ar,
	uploadSkillFile: () => $n,
	uploadSourceFile: () => $r,
	uploadSourceFileToProject: () => Qr,
	waitForPendingNodeFileDeletions: () => vt,
	walkDirectoryFiles: () => St,
	watchFilePaths: () => ke
}), U = /* @__PURE__ */ new Map(), pr = { ...jt }, mr = 128 * 1024 * 1024, hr = 4096, W = {
	image: "图片",
	video: "视频",
	audio: "音频",
	other: "文件"
}, G = class extends Error {
	actualBytes;
	maxBytes;
	kind;
	constructor(e, t, n, r = W[n]) {
		super(`${r}大小为 ${vr(e)}，超过内存转换上限 ${vr(t)}；请压缩素材，或先导入正式项目以使用原生文件存储`), this.name = "MediaDataUrlTooLargeError", this.actualBytes = e, this.maxBytes = t, this.kind = n;
	}
}, K = class extends Error {
	actualBytes;
	maxBytes;
	constructor(e, t, n = "本次参考媒体") {
		super(`${n}累计大小为 ${vr(e)}，超过内存转换总上限 ${vr(t)}；请减少参考素材数量或压缩素材后重试`), this.name = "MediaDataUrlTotalTooLargeError", this.actualBytes = e, this.maxBytes = t;
	}
}, gr = class extends Error {
	actualChars;
	maxChars;
	constructor(e, t = hr) {
		super(`Data URL 元数据长度为 ${e}，超过上限 ${t}；请重新导入媒体文件`), this.name = "MediaDataUrlHeaderTooLargeError", this.actualChars = e, this.maxChars = t;
	}
};
function _r(e = "本次参考媒体", t = mr) {
	return {
		usedBytes: 0,
		maxBytes: t,
		label: e
	};
}
function vr(e) {
	return `${Number((e / 1024 / 1024).toFixed(2))} MiB`;
}
function yr(e) {
	return e.length >= 5 && e.slice(0, 5).toLowerCase() === "data:";
}
function q(e) {
	let t = 0;
	for (; t < e.length && /\s/.test(e[t]);) t += 1;
	if (e.slice(t, t + 5).toLowerCase() === "data:") {
		let n = t + hr + 1, r = e.slice(t, n + 1).indexOf(","), i = r >= 0 ? t + r : Math.min(e.length, n), a = e.slice(t, i).toLowerCase(), o = /^data:([^;,]+)/.exec(a)?.[1] ?? "";
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
	let r = pr[t];
	if (e > r) throw new G(e, r, t, n);
}
function br(e, t, n) {
	J(wr(e), t, n);
}
async function xr(e, t, n, r) {
	let i = await Tr(e, r);
	return J(i, t, n), i;
}
function Sr(e) {
	let t = e.slice(0, 4098).indexOf(",");
	if (t < 0) throw e.length > 4097 ? new gr(4097) : Error("Data URL 格式无效：缺少元数据与内容分隔符");
	if (t > 4096) throw new gr(t);
	return {
		commaIndex: t,
		metadata: e.slice(0, t)
	};
}
function Cr(e, t, n, r) {
	if (!/;base64(?:;|$)/i.test(e)) return t;
	let i = n === "=" ? r === "=" ? 2 : 1 : 0;
	return Math.max(0, Math.floor(t * 3 / 4) - i);
}
function wr(e) {
	let { commaIndex: t, metadata: n } = Sr(e), r = 0, i = "", a = "";
	for (let n = t + 1; n < e.length; n += 1) {
		let t = e.charCodeAt(n);
		t === 32 || t >= 9 && t <= 13 || (r += 1, a = i, i = e[n]);
	}
	return Cr(n, r, i, a);
}
async function Tr(e, t) {
	Z(t);
	let { commaIndex: n, metadata: r } = Sr(e), i = 0, a = "", o = "";
	for (let r = n + 1; r < e.length; r += 1) {
		let s = e.charCodeAt(r);
		s !== 32 && (s < 9 || s > 13) && (i += 1, o = a, a = e[r]), (r - n) % 1048576 == 0 && (await new Promise((e) => setTimeout(e, 0)), Z(t));
	}
	return Z(t), Cr(r, i, a, o);
}
function Er(e, t) {
	e && (Y(e, t), e.usedBytes += t);
}
function Y(e, t) {
	if (!e) return;
	let n = e.usedBytes + t;
	if (n > e.maxBytes) throw new K(n, e.maxBytes, e.label);
}
async function Dr(e, t, n) {
	let r = `${e}\n${w(t)}`, i = U.get(r)?.catch(() => void 0) ?? Promise.resolve(), a = () => void 0, o = new Promise((e) => {
		a = e;
	}), s = i.then(() => o);
	U.set(r, s), await i;
	try {
		return await n();
	} finally {
		a(), U.get(r) === s && U.delete(r);
	}
}
function Or() {
	return globalThis.crypto?.randomUUID?.() ?? `transfer-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
async function kr(e, n, r) {
	let i = Or(), a, o = !1, s = () => {
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
async function Ar(e) {
	if (!b()) return;
	let n = [e.baseDataDir, ...e.assetFolders ?? []].map((e) => e?.trim()).filter((e) => !!e), r = await t("sync_authorized_directories", {
		directories: [...new Set(n)],
		baseDataDir: e.baseDataDir?.trim() || null
	});
	r.length > 0 && console.warn("[fileService] 已跳过不存在或无效的授权目录:", r);
}
function jr(e) {
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
async function Mr(e) {
	if (e.startsWith("data:") || e.startsWith("blob:") || e.startsWith("asset://") || e.includes("asset.localhost")) return e;
	if (b() && /^https?:\/\//i.test(e)) try {
		return await t("fetch_image_data_url", { url: e });
	} catch (t) {
		return console.warn("[fileService] fetchImageForCrop via Rust failed, fallback to original URL:", t), e;
	}
	return e;
}
function X(e) {
	return e.reason ?? new DOMException("读取已取消", "AbortError");
}
function Z(e) {
	if (e?.aborted) throw X(e);
}
function Nr(e) {
	return e instanceof DOMException && e.name === "AbortError";
}
function Pr(e, t) {
	return Z(t), new Promise((n, r) => {
		let i = new FileReader(), a = () => t?.removeEventListener("abort", o), o = () => {
			i.readyState === FileReader.LOADING && i.abort(), a(), r(X(t));
		};
		i.onload = () => {
			a(), n(i.result);
		}, i.onerror = () => {
			a(), r(i.error ?? /* @__PURE__ */ Error("媒体读取失败"));
		}, t?.addEventListener("abort", o, { once: !0 }), i.readAsDataURL(e);
	});
}
async function Fr(e, t = {}) {
	try {
		Z(t.signal);
		let n = e.replace(/\\/g, "/"), r = n.split(".").pop()?.toLowerCase() || "", i = t.kind ?? q(n), a = t.label ?? W[i];
		if (b()) {
			try {
				let n = await c(e);
				Z(t.signal), J(n.size, i, a), Y(t.dataUrlBudget, n.size);
			} catch (e) {
				if (t.signal?.aborted) throw X(t.signal);
				if (e instanceof G || e instanceof K || Nr(e)) throw e;
			}
			let n = await u(e);
			Z(t.signal), J(n.byteLength, i, a), Y(t.dataUrlBudget, n.byteLength);
			let o = await Ye([n], t.signal), s = `data:${g(r)};base64,${o}`;
			return Er(t.dataUrlBudget, n.byteLength), s;
		}
		let o = await fetch(n, { signal: t.signal });
		if (Z(t.signal), !o.ok) throw Error(`读取本地文件失败 (${o.status})`);
		let s = Number(o.headers.get("Content-Length"));
		Number.isFinite(s) && s >= 0 && (J(s, i, a), Y(t.dataUrlBudget, s));
		let l = await o.blob();
		Z(t.signal), J(l.size, i, a), Y(t.dataUrlBudget, l.size);
		let d = await Pr(l, t.signal);
		return Er(t.dataUrlBudget, l.size), d;
	} catch (n) {
		if (t.signal?.aborted) throw X(t.signal);
		if (n instanceof G || n instanceof K || n instanceof gr || Nr(n)) throw n;
		return console.error("readFileToDataUrl failed:", e, n), null;
	}
}
async function Ir(e, t, n) {
	let r = await Ft(n), i = w(t), a = i.lastIndexOf("."), o = a > 0 ? i.slice(0, a) : i, s = a > 0 ? i.slice(a) : "";
	return x(e, `${o}-${r.slice(0, 20)}${s}`);
}
async function Lr(e, t, n) {
	if (!b()) return null;
	let r = await S(t);
	if (!r) return null;
	let i = e.split(/[/\\]/).pop() || "file", a = await v(r, i);
	try {
		await kr("copy_file_streamed", {
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
async function Rr(e, t, n, r = {}) {
	if (!b()) return null;
	let i = await S(t);
	if (!i) return null;
	try {
		let t = q(e), a = await It(e, {
			expectedBytes: await xr(e, t, n),
			maxBytes: pr[t],
			label: n
		}), s;
		s = r.deduplicateByContent ? await Ir(i, n, a) : await v(i, n), (!r.deduplicateByContent || !await l(s).catch(() => !1)) && (await o(s, a), y());
		let c = await _(), u = c ? c(s) : "";
		return {
			filePath: s,
			assetUrl: u
		};
	} catch (e) {
		return console.error("Failed to save data URL to project data:", n, e), null;
	}
}
async function zr(e, t, n) {
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
async function Br(e, t) {
	if (!b()) return null;
	let n = await S(e);
	return n ? v(n, w(t)) : null;
}
async function Vr(e, t, n = [{
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
function Hr(e, t) {
	try {
		let t = new URL(e), n = t.searchParams.get("filename");
		if (n) return w(n.split(/[/\\]/).pop());
		let r = t.pathname.split("/").pop() || "";
		if (r && r.includes(".")) return w(r);
	} catch {}
	return `${t}-${Date.now()}`;
}
var Ur = {
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
	return t && Ur[t] ? Ur[t] : n.includes("video") ? ".mp4" : n.includes("audio") ? ".mp3" : ".png";
}
function $(e) {
	return !!(e && (/^data:/i.test(e) || /^blob:/i.test(e)));
}
async function Wr(e, t, n, r, i) {
	if (!b()) {
		if ($(e)) throw Error("当前环境没有项目目录，无法保存内嵌媒体");
		return {
			mediaUrl: e,
			sourceUrl: e
		};
	}
	let a = await Gr(e, t, n, r, i);
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
async function Gr(e, t, n, r, i) {
	if (!b()) return null;
	try {
		if (yr(e)) {
			let a = /^data:([^;,]+)/i.exec(e)?.[1];
			return Rr(e, t, r && r.trim() ? T(r, Q(e, a, n), n) : `${w(n)}-${Date.now()}${Q("", a, n)}`, i);
		}
		if (/^blob:/i.test(e)) {
			let a = await fetch(e);
			if (!a.ok) throw Error(`读取临时媒体失败：HTTP ${a.status}`);
			let s = a.headers.get("content-type") || void 0, c = q(s ?? n), u = r && r.trim() ? T(r, Q(e, s, n), n) : `${w(n)}-${Date.now()}${Q("", s, n)}`, d = Number(a.headers.get("content-length"));
			Number.isFinite(d) && d >= 0 && J(d, c, u);
			let f = new Uint8Array(await a.arrayBuffer());
			if (J(f.byteLength, c, u), i?.deduplicateByContent) {
				let e = await S(t);
				if (!e) return null;
				let n = await Ir(e, u, f);
				await l(n).catch(() => !1) || (await o(n, f), y());
				let r = await _();
				return {
					filePath: n,
					assetUrl: r ? r(n) : ""
				};
			}
			return zr(f, t, u);
		}
		let a = r && r.trim() ? T(r, Q(e, void 0, n), n) : Hr(e, n), s = await S(t);
		if (!s) return null;
		let c = await Dr(s, a, async () => kr("download_file_streamed", {
			url: e,
			destinationPath: await v(s, a)
		}, i));
		y();
		let u = await _();
		return {
			filePath: c.path,
			assetUrl: u ? u(c.path) : ""
		};
	} catch (t) {
		return console.warn("[fileService] downloadUrlAndSave failed:", e, t), null;
	}
}
async function Kr(e, t, n) {
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
async function qr(e) {
	let t = await E(e);
	if (!t) return [];
	let n = (await St(t)).filter((e) => !e.path.substring(t.length).replace(/\\/g, "/").replace(/^\//, "").split("/").slice(0, -1).some((e) => e === "AppData" || e === ".trash"));
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
var Jr = [
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
async function Yr(e = "授权当前对话读取本地文件") {
	if (!b()) throw Error("本地文件授权仅在 Tauri 桌面环境可用");
	let t = await f({
		multiple: !0,
		directory: !1,
		title: e,
		filters: [{
			name: "文本与数据文件",
			extensions: Jr
		}]
	});
	if (!t) return [];
	let n = Array.isArray(t) ? t : [t], r = [];
	for (let e of n.slice(0, 10)) {
		let t = e.split(/[/\\]/).pop() || "未命名文件", n = t.split(".").pop()?.toLowerCase() || "";
		if (!Jr.includes(n)) continue;
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
async function Xr(e, t, n) {
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
async function Zr(e, t, n = "保存 Agent 输出") {
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
async function Qr(e, t) {
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
				let e = await Lr(n, t);
				if (e) return {
					dataUrl: e.assetUrl,
					fileName: e.fileName,
					fileSize: i,
					filePath: e.filePath
				};
			}
			let a = r.split(".").pop()?.toLowerCase() || "", o = q(r);
			i > 0 && J(i, o, `${W[o]}「${r}」`);
			let s = await u(n);
			J(s.byteLength, o, `${W[o]}「${r}」`);
			let l = Be(s.buffer);
			return {
				dataUrl: `data:${g(a)};base64,${l}`,
				fileName: r,
				fileSize: s.byteLength
			};
		}
		let n = await jr(e || "*/*");
		if (!n) return null;
		let r = q(n.type), i = r === "other" ? q(n.name) : r;
		J(n.size, i, `${W[i]}「${n.name}」`);
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
async function $r(e) {
	return Qr(e);
}
function ei(e) {
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
function ti(e) {
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
function ni(e) {
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
async function ri(e) {
	let { filePath: t, mediaUrl: n, textOutput: r, nodeType: i, fileName: a } = e, s = ti(i);
	if (!b()) return console.warn("[fileService] saveNodeOutputToFile: 仅 Tauri 桌面环境支持"), null;
	let c = a || "output", l = c.lastIndexOf(".");
	l > 0 && (c = c.substring(0, l)), c += s;
	let f = ni(i), p = await d({
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
export { Nn as $, ur as A, Vn as B, Rr as C, st as Ct, $r as D, k as Dt, Ar as E, Qe as Et, nr as F, Pn as G, jn as H, $n as I, Ln as J, wn as K, Fn as L, dr as M, ir as N, Qr as O, nt as Ot, tr as P, kn as Q, Tn as R, zr as S, dt as St, Yr as T, vt as Tt, An as U, On as V, Mn as W, Un as X, Bn as Y, Dn as Z, Fr as _, _t, Lr as a, Kt as at, Zr as b, ft as bt, ei as c, Wt as ct, q as d, yt as dt, Sn as et, yr as f, Ct as ft, Xr as g, ot as gt, Wr as h, Dt as ht, Er as i, En as it, or as j, ar as k, Mr as l, wt as lt, qr as m, Tt as mt, br as n, zn as nt, _r as o, Vt as ot, $ as p, xt as pt, Cn as q, xr as r, Hn as rt, Gr as s, Gt as st, J as t, In as tt, fr as u, Ot as ut, Kr as v, gt as vt, ri as w, pt as wt, Vr as x, ct as xt, Br as y, mt as yt, Rn as z };
