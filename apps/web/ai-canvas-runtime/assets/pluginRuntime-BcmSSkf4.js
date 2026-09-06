import { F as e, N as t, P as n, c as r, d as i, f as a, l as o, ni as s, ri as c, t as l, u } from "./useAppStore-CcUL4Jo0.js";
import { a as d } from "./core-CoHQ9AE0.js";
import { S as f } from "./fileService-zQLozbOU.js";
import { Et as p, K as m, Mt as h, Ot as g, U as _, V as v, Y as y } from "./useTooltipAutoPlacement-BSvTkR9V.js";
//#region src/services/plugins/pluginModelCatalog.ts
var b = {
	text: "ai-text",
	image: "ai-image",
	video: "ai-video",
	audio: "ai-audio"
}, x = [
	"text",
	"image",
	"video",
	"audio"
];
function S(e) {
	let t = e.filter((e) => e.type === "model").flatMap((e) => e.modelCategories ?? []), n = t.length > 0 ? t : x;
	return [...new Set(n)];
}
function C(e, t) {
	let n = t.flatMap((t) => {
		let n = g(e, b[t], p, { filterSelectedModels: !0 }).flatMap((e) => e.models.map((e) => ({
			id: e.value,
			name: e.label,
			provider: e.provider,
			category: t,
			description: e.description,
			inputModalities: e.inputModalities
		}))), r = (e.generalModels ?? []).filter((n) => n.category === t && !!e.providers[n.providerConfigId]?.apiKey && h(e, n.providerConfigId, t)).map((e) => ({
			id: `general/${e.id}`,
			name: e.name,
			provider: "general",
			category: t,
			description: e.description || `ID: ${e.modelId}`,
			inputModalities: e.inputModalities
		}));
		return [...n, ...r];
	});
	return [...new Map(n.map((e) => [e.id, e])).values()];
}
//#endregion
//#region src/services/plugins/pluginRuntime.ts
var w = 256e3, T = 256, E = 128, D = 8, O = new Set([
	"__proto__",
	"constructor",
	"prototype"
]), k = 4, A = new Set([
	"__proto__",
	"constructor",
	"prototype",
	"filePath",
	"relativePath",
	"directorCaptureFilePaths"
]), j = new Set([
	"image",
	"video",
	"audio"
]), ee = new Set([
	"ai-image",
	"source-image",
	"ai-video",
	"source-video",
	"ai-audio",
	"source-audio",
	"ai-animation",
	"ai-panorama",
	"ai-storyboard",
	"ai-director"
]), te = new Set([
	"image/png",
	"image/jpeg",
	"image/jpg",
	"image/webp",
	"image/gif",
	"image/avif",
	"image/bmp",
	"image/x-icon",
	"audio/mpeg",
	"audio/mp4",
	"audio/aac",
	"audio/wav",
	"audio/ogg",
	"audio/webm",
	"audio/flac",
	"video/mp4",
	"video/webm",
	"video/ogg"
]), ne = new Set([
	"transparent",
	"var(--theme-text)",
	"var(--danger)",
	"var(--success)",
	"var(--node-video)",
	"var(--accent-amber)",
	"var(--theme-card)",
	"color-mix(in srgb, var(--danger) 32%, transparent)",
	"color-mix(in srgb, var(--success) 32%, transparent)",
	"color-mix(in srgb, var(--node-video) 32%, transparent)",
	"color-mix(in srgb, var(--accent-amber) 32%, transparent)"
]), M = new Set([
	...O,
	"type",
	"displayId",
	"filePath",
	"relativePath",
	"assetId",
	"artifactId",
	"role",
	"dramaAssetId",
	"dramaAssetKind",
	"characterLibraryLinks",
	"hiddenByCharacterLibrary",
	"directorInstanceId",
	"directorCaptureFilePaths",
	"pluginId",
	"pluginNodeId"
]);
function N(e, t, n) {
	if (typeof n != "string" || !/^[a-f0-9]{64}$/.test(n)) throw Error("插件描述符缺少已登记的源码摘要，请重新选择插件后再执行");
	let r = e.find((e) => e.id === t);
	if (!r?.enabled) throw Error("插件已被禁用或卸载");
	let i = r.sourceDigest;
	if (typeof i != "string" || !/^[a-f0-9]{64}$/.test(i)) throw Error("插件缺少已登记的源码摘要，请重新安装或完成迁移后再执行");
	if (i !== n) throw Error("插件版本已更新，请重新选择插件后再执行");
	return i;
}
function P(e, t, n) {
	if (typeof n != "string" || !/^[a-f0-9]{64}$/.test(n)) throw Error("插件描述符缺少完整 revision 摘要，请重新选择插件后再执行");
	let r = e.find((e) => e.id === t)?.revisionDigest;
	if (typeof r != "string" || !/^[a-f0-9]{64}$/.test(r)) throw Error("插件缺少完整 revision 摘要，请重新安装后再执行");
	if (r !== n) throw Error("插件版本已更新，请重新选择插件后再执行");
	return r;
}
function F(e, t, n) {
	let r = l.getState();
	return N(r.installedPlugins, e, t), P(r.installedPlugins, e, n), r;
}
function I() {
	return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${c()}-${c()}`;
}
function L(e, t = 0, n = !1) {
	if (!(t > D || e === void 0 || typeof e == "function" || typeof e == "symbol")) {
		if (e === null || typeof e == "boolean") return e;
		if (typeof e == "number") return Number.isFinite(e) ? e : void 0;
		if (typeof e == "string") return n && H(e) ? void 0 : e.slice(0, w);
		if (Array.isArray(e)) return e.slice(0, T).map((e) => L(e, t + 1, n)).filter((e) => e !== void 0);
		if (typeof e == "object") {
			let r = {};
			for (let [i, a] of Object.entries(e).slice(0, E)) {
				if (O.has(i) || n && A.has(i)) continue;
				let e = L(a, t + 1, n);
				e !== void 0 && (r[i] = e);
			}
			return r;
		}
	}
}
function re(e, t, n = "node-context-menu") {
	return t ? e.flatMap((e) => e.enabled ? (e.manifest.contributes.nodeTools ?? []).filter((e) => e.nodeTypes.includes(t) && e.placements.includes(n)).map((t) => ({
		pluginId: e.id,
		pluginName: e.manifest.name,
		sourceDigest: e.sourceDigest,
		revisionDigest: e.revisionDigest,
		runtime: e.manifest.runtime ?? "javascript",
		source: e.source,
		tool: t,
		permissions: e.manifest.permissions
	})) : []) : [];
}
function ie(e) {
	return e.permissions.includes("models.read") ? C(l.getState().config, S(e.tool.dialog?.fields ?? [])) : [];
}
function ae(e) {
	return e.flatMap((e) => e.enabled ? (e.manifest.contributes.nodes ?? []).map((t) => ({
		pluginId: e.id,
		pluginName: e.manifest.name,
		sourceDigest: e.sourceDigest,
		revisionDigest: e.revisionDigest,
		runtime: e.manifest.runtime ?? "javascript",
		source: e.source,
		node: t,
		permissions: e.manifest.permissions
	})) : []);
}
function oe(e, t) {
	let n = Object.fromEntries(e.node.fields.flatMap((e) => e.defaultValue === void 0 ? [] : [[e.id, e.defaultValue]]));
	return {
		id: `node-${c()}`,
		type: "plugin-node",
		position: t,
		data: {
			label: e.node.title,
			type: "plugin-node",
			status: "idle",
			nodeWidth: 320,
			nodeHeight: Math.min(520, Math.max(180, 132 + e.node.fields.length * 58)),
			pluginId: e.pluginId,
			pluginNodeId: e.node.id,
			pluginValues: n,
			pluginOutputs: {}
		}
	};
}
function se(e, t, n, r, i) {
	let a = {};
	for (let e of n) {
		if (A.has(e)) continue;
		let n = t.data[e], r = L(n, 0, !0);
		r !== void 0 && (a[e] = r);
	}
	return {
		projectId: e,
		iteration: i.iteration,
		parameters: r,
		node: {
			id: t.id,
			type: t.data.type,
			data: a
		},
		models: i.models,
		resources: i.resources,
		effectResult: i.effectResult
	};
}
function ce(e, t, n, r) {
	if (!e || typeof e != "object" || Array.isArray(e)) throw Error("插件必须返回对象");
	let i = e, a = typeof i.message == "string" ? i.message.slice(0, 240) : void 0;
	if (i.effect !== void 0) return {
		effect: X(i.effect, n),
		message: a
	};
	if (!i.data || typeof i.data != "object" || Array.isArray(i.data)) throw Error("插件返回值必须包含 data 对象");
	let o = new Set(t), s = {};
	for (let [e, t] of Object.entries(i.data)) {
		if (!o.has(e)) throw Error(`插件返回了未声明字段: ${e}`);
		if (M.has(e)) throw Error(`插件不能修改受保护字段: ${e}`);
		let n = L(t);
		if (n === void 0) throw Error(`插件字段不可 JSON 序列化: ${e}`);
		s[e] = n;
	}
	if (Object.keys(s).length === 0) throw Error("插件没有返回任何节点字段");
	return n && (de(s), me(s, n, r)), {
		data: s,
		message: a
	};
}
function R(e) {
	return e && typeof e == "object" && !Array.isArray(e) ? e : {};
}
function z(e, t) {
	if (e?.startsWith(t)) return e.slice(t.length) || void 0;
}
function B(e) {
	let t = [e.trim()];
	for (let n of e.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/giu)) {
		let e = n[2]?.trim();
		e && t.push(e);
	}
	return [...new Set(t.filter(Boolean))];
}
function le(e, t) {
	let n = e.split("\0").join("").replace(/```\w*\n[\s\S]*?```/gu, "").replace(/`[^`]+`/gu, "").replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;");
	for (let e of n.matchAll(/!\[[^\]]*\]\(([^)\s]+(?:\s+"[^"]*")?)\)/gu)) {
		let n = e[1]?.replace(/\s+"[^"]*"$/u, "").trim();
		n && t(n);
	}
}
function V(e) {
	let t = e.replace(/\\/gu, "/");
	if (t.startsWith("//")) return !0;
	try {
		let e = new URL(t).protocol.toLowerCase();
		return e === "http:" || e === "https:";
	} catch {
		return !1;
	}
}
function H(e) {
	let t = e.trim().toLowerCase();
	return t.startsWith("asset:") || t.startsWith("file:") || t.startsWith("blob:") || t.startsWith("data:") || t.startsWith("http://asset.localhost/") || t.startsWith("https://asset.localhost/");
}
function U(e) {
	if (!e.toLowerCase().startsWith("data:")) return !1;
	let t = e.indexOf(",");
	if (t < 0) return !0;
	let n = e.slice(5, t).split(";", 1)[0]?.trim().toLowerCase();
	return !n || !te.has(n);
}
function W(e, t, n = 0) {
	if (!(n > D)) {
		if (typeof e == "string") {
			t(e);
			return;
		}
		if (Array.isArray(e)) {
			for (let r of e) W(r, t, n + 1);
			return;
		}
		if (!(!e || typeof e != "object")) for (let r of Object.values(e)) W(r, t, n + 1);
	}
}
function G(e, t, n) {
	for (let [r, i] of Object.entries(e)) (/urls?$/iu.test(r) || r === "output" && n !== void 0 && ee.has(n)) && W(i, t), r === "output" && n === "ai-markdown" && typeof i == "string" && le(i, t);
	W(e.annotation, t), W(e.mattingMask, t);
	for (let n of Array.isArray(e.storyboardOverrides) ? e.storyboardOverrides : []) W(R(n).url, t);
	for (let n of Array.isArray(e.shotlistRows) ? e.shotlistRows : []) W(R(R(n).frame).url, t);
	for (let n of Array.isArray(e.videoReferences) ? e.videoReferences : []) W(R(n).url, t);
}
function ue(e) {
	return typeof e == "string" ? ne.has(e) ? !0 : /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/iu.test(e) : !1;
}
function de(e) {
	let t = R(R(e.note).style);
	for (let e of ["strokeColor", "backgroundColor"]) if (t[e] !== void 0 && !ue(t[e])) throw Error("JavaScript 插件返回了不允许的画布笔记颜色");
}
function K(e, t) {
	for (let n of B(t)) (V(n) || H(n)) && e.add(n);
}
function q(e, t) {
	for (let n of B(e)) {
		if (U(n)) throw Error("JavaScript 插件返回了不允许的内联媒体类型");
		if (!n.trim().toLowerCase().startsWith("data:")) {
			if (H(n) && !t.has(n)) throw Error("JavaScript 插件返回了未经宿主授权的本地媒体引用");
			if (V(n) && !t.has(n)) throw Error("JavaScript 插件返回了未经宿主授权的远程媒体引用");
		}
	}
}
function J(e, t) {
	let n = /* @__PURE__ */ new Set();
	return G(t, (e) => K(n, e), e), n;
}
function fe(e) {
	return J(e.node.type, e.node.data);
}
function pe(e, t) {
	let n = /* @__PURE__ */ new Set();
	for (let r of e.node.inputs) j.has(r.type) && W(t[r.id], (e) => K(n, e));
	return n;
}
function me(e, t, n) {
	G(e, (e) => q(e, t), n);
}
function Y(e, t, n, r) {
	let i = n.find((t) => t.id === e.modelId);
	if (!t.ok || !i || i.category !== "image" && i.category !== "video" && i.category !== "audio") return;
	let a = R(t.value).url;
	typeof a == "string" && K(r, a);
}
function X(e, t) {
	let n = R(e), r = n.type;
	if (r === "model.generate") {
		let e = Array.isArray(n.imageUrls) ? n.imageUrls : [], i = e.filter((e) => typeof e == "string");
		if (i.length !== e.length) throw Error("模型调用的 imageUrls 必须是字符串数组");
		if (i.length > T) throw Error(`模型调用的参考图不能超过 ${T} 张`);
		let a = Array.isArray(n.resourceIds) ? n.resourceIds : [], o = a.filter((e) => typeof e == "string" && e.length > 0 && e.length <= 160);
		if (o.length !== a.length || o.length > T) throw Error(`模型调用的 resourceIds 必须是最多 ${T} 个资源标识`);
		if (t) for (let e of i) q(e, t);
		let s = {
			type: r,
			modelId: String(n.modelId ?? "").slice(0, 256),
			prompt: String(n.prompt ?? "").slice(0, w),
			parameters: n.parameters === void 0 ? void 0 : L(R(n.parameters))
		};
		if (!s.modelId || !s.prompt.trim()) throw Error("模型调用必须包含 modelId 和 prompt");
		return i.length > 0 && (s.imageUrls = i), o.length > 0 && (s.resourceIds = o), s;
	}
	if (r === "resource.readText") {
		let e = String(n.resourceId ?? "").slice(0, 160);
		if (!e) throw Error("文本资源读取必须包含 resourceId");
		let t = n.maxBytes === void 0 ? void 0 : Number(n.maxBytes);
		if (t !== void 0 && (!Number.isSafeInteger(t) || t <= 0)) throw Error("文本资源读取 maxBytes 无效");
		return {
			type: r,
			resourceId: e,
			maxBytes: t
		};
	}
	if (r === "resource.readRange") {
		let e = String(n.resourceId ?? "").slice(0, 160), t = Number(n.offset), i = Number(n.length);
		if (!e || !Number.isSafeInteger(t) || !Number.isSafeInteger(i)) throw Error("分段资源读取参数无效");
		return {
			type: r,
			resourceId: e,
			offset: t,
			length: i
		};
	}
	if (r === "resource.createText") return {
		type: r,
		content: String(n.content ?? "").slice(0, w),
		suggestedName: typeof n.suggestedName == "string" ? n.suggestedName.slice(0, 120) : void 0
	};
	throw Error("插件请求了不支持的宿主操作");
}
function he(e, t) {
	if (t === "resource") return;
	let n = t === "image" ? e.imageUrl ?? e.thumbnailUrl ?? e.output : t === "video" ? e.videoUrl ?? e.output : t === "audio" ? e.audioUrl ?? e.output : t === "json" ? e.pluginOutputs ?? e.output : e.output ?? e.prompt;
	if (!(typeof n == "string" && H(n))) return L(n, 0, !0);
}
function ge(e, t, n, r) {
	let i = z(t, "plugin-out-");
	if (e.data.type !== "plugin-node" || !i) return he(e.data, n.type);
	let a = typeof e.data.pluginId == "string" ? e.data.pluginId : void 0, o = typeof e.data.pluginNodeId == "string" ? e.data.pluginNodeId : void 0, s = r.find((e) => e.id === a);
	if (!s) throw Error("来源插件未安装或已卸载，请重新连接端口");
	let c = s.manifest.contributes.nodes?.find((e) => e.id === o);
	if (!c) throw Error("来源插件节点已不存在，请重新连接端口");
	let l = c.outputs.find((e) => e.id === i);
	if (!l) throw Error(`来源插件输出端口「${i}」已不存在，请重新连接端口`);
	if (l.type !== n.type) throw Error(`端口类型不兼容：来源「${l.label}」为 ${l.type}，目标「${n.label}」为 ${n.type}`);
	return L(R(e.data.pluginOutputs)[i]);
}
function _e(e, t) {
	let n = l.getState(), r = {};
	for (let i of n.edges.filter((e) => e.target === t)) {
		let t = z(i.targetHandle, "plugin-in-"), a = e.node.inputs.find((e) => e.id === t), o = n.nodes.find((e) => e.id === i.source);
		if (!a || !o) continue;
		let s = ge(o, i.sourceHandle, a, n.installedPlugins);
		s !== void 0 && (r[a.id] ??= []).push(s);
	}
	let i = {};
	for (let t of e.node.inputs) {
		let e = r[t.id] ?? [];
		if (!t.multiple && e.length > 1) throw Error(`输入「${t.label}」只允许一条连线`);
		e.length > 0 && (i[t.id] = t.multiple ? e : e[0]);
	}
	return i;
}
function ve(e, t, n) {
	let r = R(e), i = typeof r.message == "string" ? r.message.slice(0, 240) : void 0, a;
	r.effect !== void 0 && (a = X(r.effect, n));
	let o;
	if (r.data !== void 0) {
		let e = R(r.data), i = new Set(t.node.fields.map((e) => e.id)), a = new Set(t.node.outputs.map((e) => e.id)), s = {}, c = {};
		for (let [t, n] of Object.entries(R(e.values))) {
			if (!i.has(t)) throw Error(`插件返回了未声明字段: ${t}`);
			let e = L(n);
			e !== void 0 && (s[t] = e);
		}
		for (let [r, i] of Object.entries(R(e.outputs))) {
			if (!a.has(r)) throw Error(`插件返回了未声明输出: ${r}`);
			let e = L(i);
			if (e !== void 0) {
				let i = t.node.outputs.find((e) => e.id === r);
				n && i && j.has(i.type) && W(e, (e) => q(e, n)), c[r] = e;
			}
		}
		o = {
			values: s,
			outputs: c
		};
	}
	if (!a && !o) throw Error("插件必须返回 data 或 effect");
	return {
		data: o,
		effect: a,
		message: i
	};
}
function Z(e, t) {
	return typeof e[t] == "string" ? e[t] : void 0;
}
function Q(e, t) {
	return typeof e[t] == "number" && Number.isFinite(e[t]) ? e[t] : void 0;
}
async function ye(e, t, n, r) {
	let i = t.find((t) => t.id === e.modelId);
	if (!i) throw Error("插件请求的模型不在当前可调用列表中");
	let a = e.parameters ?? {}, o = {
		prompt: e.prompt,
		model: i.id,
		provider: i.provider,
		nodeId: n
	};
	if (i.category === "text") return { text: await y({
		...o,
		imageUrls: r
	}) };
	if (i.category === "image") return { url: (await m({
		...o,
		imageSize: Z(a, "imageSize"),
		aspectRatio: Z(a, "aspectRatio"),
		image_urls: r
	})).url };
	if (i.category === "video") return { url: (await _({
		...o,
		videoResolution: Q(a, "videoResolution"),
		videoFps: Q(a, "videoFps"),
		videoFrames: Q(a, "videoFrames"),
		seedanceResolution: Z(a, "resolution"),
		seedanceRatio: Z(a, "aspectRatio"),
		seedanceDuration: Q(a, "duration"),
		generateAudio: typeof a.generateAudio == "boolean" ? a.generateAudio : void 0
	})).url };
	let s = await v({
		...o,
		audioVoice: Z(a, "voice"),
		audioFormat: Z(a, "format"),
		audioSpeed: Q(a, "speed"),
		musicTitle: Z(a, "title"),
		musicLyrics: Z(a, "lyrics"),
		musicBpm: Q(a, "bpm"),
		musicDuration: Q(a, "duration")
	});
	return {
		url: s.url,
		title: s.title ?? null,
		lyrics: s.lyrics ?? null
	};
}
function be(e) {
	return e ? [
		...e.self,
		...e.incoming,
		...e.package
	] : [];
}
function xe(e, t) {
	return e.node.inputs.filter((e) => e.type === "image").flatMap((e) => {
		let n = t[e.id];
		return (Array.isArray(n) ? n : [n]).filter((e) => typeof e == "string");
	});
}
async function $(e, t, n, r) {
	try {
		if (n.type === "model.generate") {
			if (!e.permissions.includes("models.invoke")) throw Error("插件未声明 models.invoke 权限");
			let i = await Promise.all((n.resourceIds ?? []).map(async (t) => {
				let n = be(e.resources).find((e) => e.resourceId === t);
				if (!n) throw Error("模型调用引用了当前调用范围外的资源");
				if (!n.mediaType.startsWith("image/")) throw Error("模型参考资源必须是图像");
				if (!e.resourceReadContext) throw Error("插件资源会话已失效");
				return a(e.resourceReadContext, t);
			})), o = [
				...e.pluginNode && e.inputs ? xe(e.pluginNode, e.inputs) : [],
				...n.imageUrls ?? [],
				...i
			];
			return {
				type: n.type,
				ok: !0,
				value: await ye(n, r, t, o)
			};
		}
		if (n.type === "resource.readText") {
			if (!e.resourceReadContext) throw Error("插件资源会话已失效");
			let t = await i(e.resourceReadContext, n.resourceId, n.maxBytes);
			return {
				type: n.type,
				ok: !0,
				value: L(t)
			};
		}
		if (n.type === "resource.readRange") {
			if (!e.resourceReadContext) throw Error("插件资源会话已失效");
			let t = await u(e.resourceReadContext, n.resourceId, n.offset, n.length);
			return {
				type: n.type,
				ok: !0,
				value: L(t)
			};
		}
		if (!e.permissions.includes("files.output.create")) throw Error("插件未声明 files.output.create 权限");
		let o = Array.from((n.suggestedName || "plugin-output.txt").replace(/[<>:"/\\|?*]/gu, "_"), (e) => e.codePointAt(0) <= 31 ? "_" : e).join("").replace(/^\.+/u, "").trim().slice(0, 120) || "plugin-output.txt", s = new TextEncoder().encode(n.content), c = await f(s, e.projectId, o);
		if (!c) throw Error(`无法在当前项目中创建「${e.title}」输出`);
		let l = c.filePath.replace(/\\/gu, "/").split("/").at(-1) ?? o;
		return {
			type: n.type,
			ok: !0,
			value: {
				fileName: l,
				bytes: s.byteLength
			}
		};
	} catch (e) {
		return {
			type: n.type,
			ok: !1,
			error: e instanceof Error ? e.message : "宿主操作失败"
		};
	}
}
function Se(e, t) {
	let n = { pluginOutputs: t };
	for (let r of e.node.outputs) {
		let e = t[r.id];
		typeof e == "string" && (r.type === "image" && n.imageUrl === void 0 ? n.imageUrl = e : r.type === "video" && n.videoUrl === void 0 ? n.videoUrl = e : r.type === "audio" && n.audioUrl === void 0 ? n.audioUrl = e : (r.type === "text" || r.type === "json") && n.output === void 0 && (n.output = e));
	}
	return n;
}
async function Ce(i, a, s) {
	let c = l.getState(), u = c.currentProjectId, f = c.nodes.find((e) => e.id === a);
	if (!u || !f) throw Error("插件节点或项目不存在");
	let p = N(c.installedPlugins, i.pluginId, i.sourceDigest), m = P(c.installedPlugins, i.pluginId, i.revisionDigest), h = c.installedPlugins.find((e) => e.id === i.pluginId);
	if (!h) throw Error("插件已被卸载");
	let g = I(), _ = L(f.data.pluginValues);
	for (let e of i.node.fields) {
		let t = _?.[e.id], n = t == null || t === "" || e.type === "boolean" && t !== !0;
		if (e.required && n) throw Error(`请填写「${e.label}」`);
	}
	let v = _e(i, a), y = e(c, a);
	if (!y) throw Error("无法创建插件执行保护");
	let b = i.runtime === "javascript" ? pe(i, v) : void 0, x;
	try {
		let e = await o({
			pluginId: i.pluginId,
			sourceDigest: p,
			revisionDigest: m,
			invocationId: g,
			projectId: u,
			nodeId: a,
			baseRevision: y.baseRevision,
			access: i.node.resourceAccess,
			inputPorts: i.node.inputs,
			packageResources: h.manifest.resources,
			state: c
		});
		for (let t of i.node.inputs) {
			let n = e.inputs[t.id] ?? [], r = v[t.id], i = Array.isArray(r) ? r.length : r === void 0 ? 0 : 1;
			if (!t.multiple && n.length > 1) throw Error(`输入「${t.label}」只允许一条连线`);
			if (t.required && i === 0 && n.length === 0) throw Error(`缺少必填输入「${t.label}」`);
		}
		let t = () => ({
			pluginId: i.pluginId,
			sourceDigest: p,
			revisionDigest: m,
			invocationId: g,
			projectId: u,
			nodeId: a,
			baseRevision: y.baseRevision,
			permissions: i.permissions,
			state: l.getState()
		});
		for (let r = 0; r <= k; r += 1) {
			F(i.pluginId, p, m);
			let o = {
				projectId: u,
				iteration: r,
				node: {
					id: a,
					values: _ ?? {}
				},
				inputs: v,
				models: i.permissions.includes("models.read") ? s : [],
				resources: e,
				effectResult: x
			}, c = await d("execute_node_plugin_tool", {
				pluginId: i.pluginId,
				sourceDigest: p,
				revisionDigest: m,
				toolId: i.node.id,
				invocationId: g,
				input: o
			});
			F(i.pluginId, p, m);
			let l = ve(c, i, b);
			if (l.effect) {
				if (r === k) throw Error(`插件宿主操作不能超过 ${k} 次`);
				x = await $({
					pluginId: i.pluginId,
					projectId: u,
					title: i.node.title,
					permissions: i.permissions,
					resources: e,
					resourceReadContext: t(),
					pluginNode: i,
					inputs: v
				}, a, l.effect, s), F(i.pluginId, p, m), b && l.effect.type === "model.generate" && Y(l.effect, x, s, b);
				continue;
			}
			let f = F(i.pluginId, p, m);
			if (!n(y, f)) throw Error("画布已变化，插件结果未写入");
			let h = {
				..._ ?? {},
				...l.data?.values ?? {}
			}, S = l.data?.outputs ?? {};
			f.updateNodeData(a, {
				pluginValues: h,
				status: "success",
				...Se(i, S)
			}), f.showToast(l.message || `插件节点「${i.node.title}」执行完成`);
			return;
		}
	} finally {
		r(g), t(y);
	}
}
async function we(i, a, u = {}, f) {
	let p = l.getState(), m = p.currentProjectId, h = p.nodes.find((e) => e.id === a);
	if (!m || !h) throw Error("目标节点或项目不存在");
	let g = N(p.installedPlugins, i.pluginId, i.sourceDigest), _ = P(p.installedPlugins, i.pluginId, i.revisionDigest), v = p.installedPlugins.find((e) => e.id === i.pluginId);
	if (!v) throw Error("插件已被卸载");
	let y = !f, b = f?.invocationId ?? I(), x = f?.guard ?? e(p, a);
	if (!x) throw Error("无法创建插件执行保护");
	if (x.projectId !== m || x.sourceNodeId !== a || !n(x, p)) throw Error("插件界面会话已失效");
	let S = {};
	for (let [e, t] of Object.entries(u)) {
		if (O.has(e)) continue;
		let n = L(t);
		n !== void 0 && (S[e] = n);
	}
	let C = ie(i), w = i.runtime === "javascript" ? f?.trustedMediaReferences ?? /* @__PURE__ */ new Set() : void 0, T;
	try {
		let e = f?.resources ?? await o({
			pluginId: i.pluginId,
			sourceDigest: g,
			revisionDigest: _,
			invocationId: b,
			projectId: m,
			nodeId: a,
			baseRevision: x.baseRevision,
			access: i.tool.resourceAccess,
			packageResources: v.manifest.resources,
			state: p
		}), t = () => ({
			pluginId: i.pluginId,
			sourceDigest: g,
			revisionDigest: _,
			invocationId: b,
			projectId: m,
			nodeId: a,
			baseRevision: x.baseRevision,
			permissions: i.permissions,
			state: l.getState()
		});
		for (let r = 0; r <= k; r += 1) {
			F(i.pluginId, g, _);
			let o = se(m, h, i.tool.inputFields, S, {
				iteration: r,
				models: C,
				resources: e,
				effectResult: T
			});
			if (w) for (let e of fe(o)) w.add(e);
			let l = await d("execute_node_plugin_tool", {
				pluginId: i.pluginId,
				sourceDigest: g,
				revisionDigest: _,
				toolId: i.tool.id,
				invocationId: b,
				input: o
			});
			F(i.pluginId, g, _);
			let u = i.tool.output.mode === "create-node" ? i.tool.output.nodeType ?? h.data.type : h.data.type, f = ce(l, i.tool.output.fields, w, u);
			if (f.effect) {
				if (r === k) throw Error(`插件宿主操作不能超过 ${k} 次`);
				T = await $({
					pluginId: i.pluginId,
					projectId: m,
					title: i.tool.title,
					permissions: i.permissions,
					resources: e,
					resourceReadContext: t()
				}, a, f.effect, C), F(i.pluginId, g, _), w && f.effect.type === "model.generate" && Y(f.effect, T, C, w);
				continue;
			}
			let p = F(i.pluginId, g, _);
			if (!n(x, p)) throw Error("画布已变化，插件结果未写入");
			let v = f.data ?? {};
			if (i.tool.output.mode === "update-current") p.updateNodeData(a, v);
			else {
				let e = i.tool.output.nodeType ?? h.data.type, t = s(h);
				p.addNode({
					id: `node-${c()}`,
					type: e,
					...t,
					data: {
						label: typeof v.label == "string" ? v.label : `${h.data.label} · ${i.tool.title}`,
						type: e,
						role: "source",
						status: "success",
						...v
					}
				});
			}
			p.showToast(f.message || `插件工具「${i.tool.title}」执行完成`);
			return;
		}
		throw Error(`插件宿主操作不能超过 ${k} 次`);
	} finally {
		y && (r(b), t(x));
	}
}
async function Te() {
	return d("get_python_plugin_runtime_status");
}
async function Ee(e) {
	let t = X(e.effect, e.trustedMediaReferences), n = await $({
		pluginId: e.pluginId,
		projectId: e.projectId,
		title: e.title,
		permissions: e.permissions,
		resources: e.resources,
		resourceReadContext: e.resourceReadContext
	}, e.nodeId, t, e.models);
	return t.type === "model.generate" && Y(t, n, e.models, e.trustedMediaReferences), n;
}
//#endregion
export { Ee as a, Te as c, Ce as i, C as l, oe as n, re as o, we as r, ae as s, J as t, S as u };
