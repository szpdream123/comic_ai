import { I as e, L as t, R as n, ai as r, c as i, d as a, f as o, h as s, l as c, m as l, oi as u, p as d, si as f, t as p, u as m } from "./useAppStore-BH-MdRLu.js";
import { a as h } from "./core-D3lATfku.js";
import { S as g, xt as _ } from "./fileService-BawXHbsK.js";
import { Bt as v, It as y, K as b, Pt as x, U as S, V as C, Y as w, zt as T } from "./useTooltipAutoPlacement-D1FArkVS.js";
import { _ as E, f as D, h as O, v as k } from "./videoEditorWindowService-DaiRFSDC.js";
//#region src/services/plugins/pluginModelCatalog.ts
var ee = {
	text: "ai-text",
	image: "ai-image",
	video: "ai-video",
	audio: "ai-audio"
}, te = [
	"text",
	"image",
	"video",
	"audio"
];
function ne(e, t, n) {
	return n !== void 0 || e !== "text" ? n : T({ modelId: t }) ? ["text", "image"] : ["text"];
}
function re(e) {
	let t = e.filter((e) => e.type === "model").flatMap((e) => e.modelCategories ?? []), n = t.length > 0 ? t : te;
	return [...new Set(n)];
}
function ie(e, t) {
	let n = t.flatMap((t) => {
		let n = y(e, ee[t], x, { filterSelectedModels: !0 }).flatMap((e) => e.models.map((e) => ({
			id: e.value,
			name: e.label,
			provider: e.provider,
			category: t,
			description: e.description,
			inputModalities: ne(t, e.value, e.inputModalities)
		}))), r = (e.generalModels ?? []).filter((n) => n.category === t && !!e.providers[n.providerConfigId]?.apiKey && v(e, n.providerConfigId, t)).map((e) => ({
			id: `general/${e.id}`,
			name: e.name,
			provider: "general",
			category: t,
			description: e.description || `ID: ${e.modelId}`,
			inputModalities: ne(t, e.modelId, e.inputModalities)
		}));
		return [...n, ...r];
	});
	return [...new Map(n.map((e) => [e.id, e])).values()];
}
//#endregion
//#region src/services/plugins/pluginVideoFrameService.ts
var ae = 48, oe = 24, se = 120, ce = 720, le = 72 * 1024, A = 4 * 1024 * 1024, ue = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u;
function de(e, t) {
	if (e.length !== t.length || e.length === 0) throw Error("镜头检测像素尺寸不一致");
	let n = new Float64Array(48), r = new Float64Array(48), i = 0;
	for (let a = 0; a < e.length; a += 4) for (let o = 0; o < 3; o += 1) n[o * 16 + (e[a + o] >> 4)] += 1, r[o * 16 + (t[a + o] >> 4)] += 1, i += Math.abs(e[a + o] - t[a + o]);
	let a = e.length / 4, o = 0;
	for (let e = 0; e < 48; e += 1) o += Math.abs(n[e] - r[e]);
	return .65 * o / (a * 6) + .35 * i / (a * 3 * 255);
}
function fe(e, t, n) {
	if (![
		e,
		t,
		n
	].every(Number.isFinite) || e < 0 || t <= e || t > n) throw Error("镜头扫描区间超出视频范围");
	if (t - e > 300) throw Error("每次自动切镜最多扫描 300 秒，请缩小区间");
}
async function pe(e) {
	let t = await D(e.url);
	try {
		j(e.signal);
		let n = await k(t);
		if (!Number.isFinite(e.time) || e.time < 0 || e.time > n.duration) throw Error("帧时间超出视频范围");
		let r = async (r) => (await O(t, {
			timestamps: [Math.max(0, Math.min(r, n.duration - 1e-6))],
			height: 360,
			signal: e.signal
		}))[0], i = await r(e.time);
		if (!i) throw Error("该时间点没有可解码画面");
		let a;
		if (e.direction !== 0 && !(e.direction < 0 && e.time === n.duration)) {
			let t = e.direction < 0 ? i.actualTime - 1e-6 : i.actualTime + i.duration + 1e-6;
			if (e.boundary && e.direction > 0 && t >= n.duration && e.time < n.duration) a = n.duration;
			else {
				let n = await r(t);
				if (!n || (e.direction < 0 ? n.actualTime >= i.actualTime : n.actualTime <= i.actualTime)) throw Error(e.direction < 0 ? "已经是第一帧" : "已经是最后一帧");
				i = n;
			}
		}
		return j(e.signal), {
			key: "cursor",
			requestedTime: e.time,
			actualTime: i.actualTime,
			frameDuration: i.duration,
			width: i.width,
			height: i.height,
			...e.boundary ? { boundaryTime: a ?? i.actualTime } : {},
			mediaType: "image/jpeg",
			previewDataUrl: await ye(i.canvas, 360)
		};
	} finally {
		t.dispose();
	}
}
async function me(e) {
	let t = e.threshold ?? .28, n = e.minShotDuration ?? .3;
	if (!Number.isFinite(t) || t < .05 || t > .95 || !Number.isFinite(n) || n < .04 || n > 10) throw Error("镜头检测参数无效");
	let r = await D(e.url);
	try {
		j(e.signal);
		let i = await k(r);
		fe(e.start, e.end, i.duration);
		let a = [{
			time: e.start,
			score: 0
		}], o = document.createElement("canvas");
		o.width = 64, o.height = 36;
		let s = o.getContext("2d", { willReadFrequently: !0 });
		if (!s) throw Error("当前环境不能检测镜头");
		let c, l, u = 0, d = 0, f = Date.now();
		for await (let i of E(r, {
			start: e.start,
			end: e.end,
			height: 36,
			signal: e.signal
		})) {
			if (++d > 36e3 || Date.now() - f > 12e4) throw Error("镜头扫描达到处理上限，请缩小区间");
			s.drawImage(i.canvas, 0, 0, 64, 36);
			let r = s.getImageData(0, 0, 64, 36).data, o = !1, p = !1;
			if (l) {
				if (de(l.before, r) >= t * .65) {
					if (a.push({
						time: l.time,
						score: l.score
					}), a.length > 128) throw Error("检测到超过 128 个镜头，请缩小区间或降低灵敏度");
					o = !0;
				} else p = !0;
				l = void 0;
			}
			if (c) {
				let s = de(c, r), d = Math.max(t, u * 2.5);
				!o && !p && s >= d && i.actualTime - a[a.length - 1].time >= n && e.end - i.actualTime >= n && (l = {
					time: i.actualTime,
					score: s,
					before: c
				}), u = u * .9 + Math.min(s, t) * .1;
			}
			c = r;
		}
		if (j(e.signal), !d) throw Error("扫描区间没有可解码画面");
		return {
			shots: a.map((t, n) => ({
				inPoint: t.time,
				outPoint: a[n + 1]?.time ?? e.end,
				score: t.score
			})),
			scannedFrames: d,
			algorithm: "adaptive-frame-difference"
		};
	} finally {
		r.dispose();
	}
}
function j(e) {
	if (e?.aborted) throw Error("抽帧已取消");
}
function he(e, t) {
	if (!Number.isFinite(e) || e <= 0) throw Error("视频时长无效");
	if (!Number.isInteger(t) || t < 1 || t > ae) throw Error(`预览帧数量必须在 1-${ae} 之间`);
	return Array.from({ length: t }, (n, r) => ({
		key: `preview-${r + 1}`,
		time: e * r / t
	}));
}
function ge(e, t) {
	if (!Number.isFinite(t) || t <= 0) throw Error("视频时长无效");
	if (e.length < 1 || e.length > oe) throw Error(`分析帧数量必须在 1-${oe} 之间`);
	let n = /* @__PURE__ */ new Set();
	return e.map((r, i) => {
		if (!ue.test(r.key) || n.has(r.key)) throw Error("抽帧 key 无效或重复");
		if (!Number.isFinite(r.time) || r.time < 0 || r.time > t) throw Error("抽帧时间点超出视频范围");
		if (i > 0 && r.time <= e[i - 1].time) throw Error("分析帧时间点必须严格递增");
		return n.add(r.key), {
			key: r.key,
			time: r.time
		};
	});
}
function _e(e, t) {
	let n = "", r = 32768;
	for (let t = 0; t < e.length; t += r) n += String.fromCharCode(...e.subarray(t, t + r));
	return `data:${t};base64,${btoa(n)}`;
}
async function M(e, t) {
	let n;
	if (n = typeof HTMLCanvasElement < "u" && e instanceof HTMLCanvasElement ? await new Promise((n) => e.toBlob(n, "image/jpeg", t)) : await e.convertToBlob({
		type: "image/jpeg",
		quality: t
	}), !n) throw Error("视频帧 JPEG 编码失败");
	return new Uint8Array(await n.arrayBuffer());
}
function ve(e, t) {
	if (typeof document > "u") throw Error("当前环境不能创建视频帧画布");
	let n = Math.max(1, Math.min(t, e.height)), r = Math.max(1, Math.round(e.width * (n / e.height))), i = document.createElement("canvas");
	i.width = r, i.height = n;
	let a = i.getContext("2d");
	if (!a) throw Error("当前环境不能绘制视频帧");
	return a.drawImage(e, 0, 0, r, n), i;
}
async function ye(e, t = se) {
	for (let [n, r] of [
		[t, .7],
		[Math.max(72, Math.round(t * .8)), .62],
		[72, .54]
	]) {
		let t = await M(ve(e, n), r);
		if (t.byteLength <= le) return _e(t, "image/jpeg");
	}
	throw Error("视频帧预览图超过大小上限");
}
function be(e) {
	let t = Math.max(0, Math.round(e * 1e3)), n = Math.floor(t / 36e5), r = Math.floor(t % 36e5 / 6e4), i = Math.floor(t % 6e4 / 1e3), a = t % 1e3;
	return `${String(n).padStart(2, "0")}:${String(r).padStart(2, "0")}:${String(i).padStart(2, "0")}.${String(a).padStart(3, "0")}`;
}
async function xe(e) {
	if (e.length === 0) return;
	if (typeof document > "u") throw Error("当前环境不能创建联系表");
	let t = Math.min(4, e.length), n = Math.ceil(e.length / t), r = document.createElement("canvas");
	r.width = t * 360 + Math.max(0, t - 1) * 8, r.height = n * 233 + Math.max(0, n - 1) * 8;
	let i = r.getContext("2d");
	if (!i) throw Error("当前环境不能绘制联系表");
	i.fillStyle = "#0a0a0f", i.fillRect(0, 0, r.width, r.height), i.font = "600 16px system-ui, sans-serif", i.textBaseline = "middle", e.forEach(({ request: e, frame: n }, r) => {
		let a = r % t, o = Math.floor(r / t), s = a * 368, c = o * 241, l = Math.min(360 / n.canvas.width, 203 / n.canvas.height), u = Math.max(1, Math.round(n.canvas.width * l)), d = Math.max(1, Math.round(n.canvas.height * l)), f = s + Math.round((360 - u) / 2), p = c + Math.round((203 - d) / 2);
		i.drawImage(n.canvas, f, p, u, d), i.fillStyle = "#14141c", i.fillRect(s, c + 203, 360, 30), i.fillStyle = "#e8e8ed", i.fillText(`${e.key}  ${be(n.actualTime)}`, s + 10, c + 203 + 30 / 2);
	});
	let a = await M(r, .84);
	if (a.byteLength > A) throw Error("联系表超过 4 MiB 上限，请减少分析帧数");
	return {
		mediaType: "image/jpeg",
		width: r.width,
		height: r.height,
		bytes: a
	};
}
async function Se(e) {
	j(e.signal);
	let t = await D(e.url);
	try {
		let n = await k(t);
		if (!n.decodable || n.duration <= 0) throw Error("视频轨无法解码或时长无效");
		let r = e.mode === "preview" ? he(n.duration, e.count ?? 12) : ge(e.samples ?? [], n.duration), i = Math.max(0, n.duration - Math.min(.001, n.duration / 1e3)), a = await O(t, {
			timestamps: r.map((e) => Math.min(e.time, i)),
			height: e.mode === "preview" ? se : ce,
			signal: e.signal
		});
		j(e.signal);
		let o = [], s = [];
		for (let t = 0; t < r.length; t += 1) {
			let n = r[t], i = a[t];
			if (!i) {
				s.push({
					key: n.key,
					requestedTime: n.time,
					error: "该时间点没有可解码画面"
				});
				continue;
			}
			try {
				let t = await ye(i.canvas), r = e.mode === "analysis" ? await M(i.canvas, .88) : void 0;
				if (r && r.byteLength > A) throw Error("视频帧超过 4 MiB 上限");
				r && o.push({
					request: n,
					frame: i
				}), s.push({
					key: n.key,
					requestedTime: n.time,
					actualTime: i.actualTime,
					frameDuration: i.duration,
					width: i.width,
					height: i.height,
					mediaType: "image/jpeg",
					previewDataUrl: t,
					bytes: r
				});
			} catch (e) {
				s.push({
					key: n.key,
					requestedTime: n.time,
					error: e instanceof Error ? e.message : "视频帧编码失败"
				});
			}
			j(e.signal);
		}
		return {
			video: {
				duration: n.duration,
				width: n.width,
				height: n.height,
				videoCodec: n.videoCodec
			},
			frames: s,
			contactSheet: e.mode === "analysis" ? await xe(o) : void 0
		};
	} finally {
		t.dispose();
	}
}
//#endregion
//#region src/services/plugins/pluginRuntime.ts
var N = 256e3, P = 256, Ce = 128, we = 8, F = new Set([
	"__proto__",
	"constructor",
	"prototype"
]), I = 4, Te = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u, Ee = 64, L = new Set([
	"__proto__",
	"constructor",
	"prototype",
	"filePath",
	"relativePath",
	"directorCaptureFilePaths"
]), R = new Set([
	"image",
	"video",
	"audio"
]), De = new Set([
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
]), Oe = new Set([
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
]), ke = new Set([
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
]), z = new Set([
	...F,
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
function B(e, t, n) {
	if (typeof n != "string" || !/^[a-f0-9]{64}$/.test(n)) throw Error("插件描述符缺少已登记的源码摘要，请重新选择插件后再执行");
	let r = e.find((e) => e.id === t);
	if (!r?.enabled) throw Error("插件已被禁用或卸载");
	let i = r.sourceDigest;
	if (typeof i != "string" || !/^[a-f0-9]{64}$/.test(i)) throw Error("插件缺少已登记的源码摘要，请重新安装或完成迁移后再执行");
	if (i !== n) throw Error("插件版本已更新，请重新选择插件后再执行");
	return i;
}
function V(e, t, n) {
	if (typeof n != "string" || !/^[a-f0-9]{64}$/.test(n)) throw Error("插件描述符缺少完整 revision 摘要，请重新选择插件后再执行");
	let r = e.find((e) => e.id === t)?.revisionDigest;
	if (typeof r != "string" || !/^[a-f0-9]{64}$/.test(r)) throw Error("插件缺少完整 revision 摘要，请重新安装后再执行");
	if (r !== n) throw Error("插件版本已更新，请重新选择插件后再执行");
	return r;
}
function H(e, t, n) {
	let r = p.getState();
	return B(r.installedPlugins, e, t), V(r.installedPlugins, e, n), r;
}
function Ae() {
	return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${f()}-${f()}`;
}
function U(e, t = 0, n = !1) {
	if (!(t > we || e === void 0 || typeof e == "function" || typeof e == "symbol")) {
		if (e === null || typeof e == "boolean") return e;
		if (typeof e == "number") return Number.isFinite(e) ? e : void 0;
		if (typeof e == "string") return n && G(e) ? void 0 : e.slice(0, N);
		if (Array.isArray(e)) return e.slice(0, P).map((e) => U(e, t + 1, n)).filter((e) => e !== void 0);
		if (typeof e == "object") {
			let r = {};
			for (let [i, a] of Object.entries(e).slice(0, Ce)) {
				if (F.has(i) || n && L.has(i)) continue;
				let e = U(a, t + 1, n);
				e !== void 0 && (r[i] = e);
			}
			return r;
		}
	}
}
function je(e, t, n = "node-context-menu") {
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
function Me(e) {
	return e.permissions.includes("models.read") ? ie(p.getState().config, re(e.tool.dialog?.fields ?? [])) : [];
}
function Ne(e) {
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
function Pe(e, t) {
	let n = Object.fromEntries(e.node.fields.flatMap((e) => e.defaultValue === void 0 ? [] : [[e.id, e.defaultValue]]));
	return {
		id: `node-${f()}`,
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
function Fe(e, t, n, r, i) {
	let a = {};
	for (let e of n) {
		if (L.has(e)) continue;
		let n = t.data[e], r = U(n, 0, !0);
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
function Ie(e, t, n) {
	let r = e.nodes;
	if (!Array.isArray(r) || r.length === 0 || r.length > (t.maxNodes ?? 0)) throw Error(`节点集必须包含 1-${t.maxNodes ?? 0} 个节点`);
	let i = new Set(t.nodeTypes ?? []), a = new Set(t.fields), o = /* @__PURE__ */ new Set(), s = r.map((e) => {
		let t = W(e), r = typeof t.key == "string" ? t.key : "", s = typeof t.nodeType == "string" ? t.nodeType : void 0;
		if (!Te.test(r) || o.has(r)) throw Error("节点集 key 无效或重复");
		if (!s || !i.has(s)) throw Error("节点集包含未声明的节点类型");
		o.add(r);
		let c = W(t.data), l = {};
		for (let [e, t] of Object.entries(c)) {
			if (!a.has(e)) throw Error(`节点集返回了未声明字段: ${e}`);
			if (z.has(e)) throw Error(`节点集不能修改受保护字段: ${e}`);
			let n = U(t);
			if (n === void 0) throw Error(`节点集字段不可 JSON 序列化: ${e}`);
			l[e] = n;
		}
		let u = typeof t.resourceId == "string" ? t.resourceId.slice(0, 160) : void 0, d = s === "ai-image" || s === "source-image";
		if (d && !u) throw Error("节点集图像节点必须绑定派生 resourceId");
		if (!d && u) throw Error("只有图像节点可以绑定派生 resourceId");
		return n && (Ge(l), Ye(l, n, s)), {
			key: r,
			nodeType: s,
			resourceId: u,
			data: l
		};
	}), c = e.edges === void 0 ? [] : e.edges;
	if (!Array.isArray(c) || c.length > Ee) throw Error(`节点集连线不能超过 ${Ee} 条`);
	let l = /* @__PURE__ */ new Set();
	return {
		nodes: s,
		edges: c.map((e) => {
			let t = W(e), n = typeof t.sourceKey == "string" ? t.sourceKey : "", r = typeof t.targetKey == "string" ? t.targetKey : "", i = `${n}\0${r}`;
			if (!o.has(n) || !o.has(r) || n === r || l.has(i)) throw Error("节点集连线引用无效、重复或形成自连线");
			return l.add(i), {
				sourceKey: n,
				targetKey: r
			};
		})
	};
}
function Le(e, t, n, r) {
	if (!e || typeof e != "object" || Array.isArray(e)) throw Error("插件必须返回对象");
	let i = e, a = typeof i.message == "string" ? i.message.slice(0, 240) : void 0;
	if (i.effect !== void 0) return {
		effect: X(i.effect, n),
		message: a
	};
	if (!i.data || typeof i.data != "object" || Array.isArray(i.data)) throw Error("插件返回值必须包含 data 对象");
	if (t.mode === "create-node-set") return {
		nodeSet: Ie(i.data, t, n),
		message: a
	};
	let o = new Set(t.fields), s = {};
	for (let [e, t] of Object.entries(i.data)) {
		if (!o.has(e)) throw Error(`插件返回了未声明字段: ${e}`);
		if (z.has(e)) throw Error(`插件不能修改受保护字段: ${e}`);
		let n = U(t);
		if (n === void 0) throw Error(`插件字段不可 JSON 序列化: ${e}`);
		s[e] = n;
	}
	if (Object.keys(s).length === 0) throw Error("插件没有返回任何节点字段");
	return n && (Ge(s), Ye(s, n, r)), {
		data: s,
		message: a
	};
}
function W(e) {
	return e && typeof e == "object" && !Array.isArray(e) ? e : {};
}
function Re(e, t) {
	if (e?.startsWith(t)) return e.slice(t.length) || void 0;
}
function ze(e) {
	let t = [e.trim()];
	for (let n of e.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/giu)) {
		let e = n[2]?.trim();
		e && t.push(e);
	}
	return [...new Set(t.filter(Boolean))];
}
function Be(e, t) {
	let n = e.split("\0").join("").replace(/```\w*\n[\s\S]*?```/gu, "").replace(/`[^`]+`/gu, "").replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;");
	for (let e of n.matchAll(/!\[[^\]]*\]\(([^)\s]+(?:\s+"[^"]*")?)\)/gu)) {
		let n = e[1]?.replace(/\s+"[^"]*"$/u, "").trim();
		n && t(n);
	}
}
function Ve(e) {
	let t = e.replace(/\\/gu, "/");
	if (t.startsWith("//")) return !0;
	try {
		let e = new URL(t).protocol.toLowerCase();
		return e === "http:" || e === "https:";
	} catch {
		return !1;
	}
}
function G(e) {
	let t = e.trim().toLowerCase();
	return t.startsWith("asset:") || t.startsWith("file:") || t.startsWith("blob:") || t.startsWith("data:") || t.startsWith("http://asset.localhost/") || t.startsWith("https://asset.localhost/");
}
function He(e) {
	if (!e.toLowerCase().startsWith("data:")) return !1;
	let t = e.indexOf(",");
	if (t < 0) return !0;
	let n = e.slice(5, t).split(";", 1)[0]?.trim().toLowerCase();
	return !n || !Oe.has(n);
}
function K(e, t, n = 0) {
	if (!(n > we)) {
		if (typeof e == "string") {
			t(e);
			return;
		}
		if (Array.isArray(e)) {
			for (let r of e) K(r, t, n + 1);
			return;
		}
		if (!(!e || typeof e != "object")) for (let r of Object.values(e)) K(r, t, n + 1);
	}
}
function Ue(e, t, n) {
	for (let [r, i] of Object.entries(e)) (/urls?$/iu.test(r) || r === "output" && n !== void 0 && De.has(n)) && K(i, t), r === "output" && n === "ai-markdown" && typeof i == "string" && Be(i, t);
	K(e.annotation, t), K(e.mattingMask, t);
	for (let n of Array.isArray(e.storyboardOverrides) ? e.storyboardOverrides : []) K(W(n).url, t);
	for (let n of Array.isArray(e.shotlistRows) ? e.shotlistRows : []) K(W(W(n).frame).url, t);
	for (let n of Array.isArray(e.videoReferences) ? e.videoReferences : []) K(W(n).url, t);
}
function We(e) {
	return typeof e == "string" ? ke.has(e) ? !0 : /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/iu.test(e) : !1;
}
function Ge(e) {
	let t = W(W(e.note).style);
	for (let e of ["strokeColor", "backgroundColor"]) if (t[e] !== void 0 && !We(t[e])) throw Error("JavaScript 插件返回了不允许的画布笔记颜色");
}
function q(e, t) {
	for (let n of ze(t)) (Ve(n) || G(n)) && e.add(n);
}
function J(e, t) {
	for (let n of ze(e)) {
		if (He(n)) throw Error("JavaScript 插件返回了不允许的内联媒体类型");
		if (!n.trim().toLowerCase().startsWith("data:")) {
			if (G(n) && !t.has(n)) throw Error("JavaScript 插件返回了未经宿主授权的本地媒体引用");
			if (Ve(n) && !t.has(n)) throw Error("JavaScript 插件返回了未经宿主授权的远程媒体引用");
		}
	}
}
function Ke(e, t) {
	let n = /* @__PURE__ */ new Set();
	return Ue(t, (e) => q(n, e), e), n;
}
function qe(e) {
	return Ke(e.node.type, e.node.data);
}
function Je(e, t) {
	let n = /* @__PURE__ */ new Set();
	for (let r of e.node.inputs) R.has(r.type) && K(t[r.id], (e) => q(n, e));
	return n;
}
function Ye(e, t, n) {
	Ue(e, (e) => J(e, t), n);
}
function Y(e, t, n, r) {
	let i = n.find((t) => t.id === e.modelId);
	if (!t.ok || !i || i.category !== "image" && i.category !== "video" && i.category !== "audio") return;
	let a = W(t.value).url;
	typeof a == "string" && q(r, a);
}
function X(e, t) {
	let n = W(e), r = n.type;
	if (r === "model.generate") {
		let e = Array.isArray(n.imageUrls) ? n.imageUrls : [], i = e.filter((e) => typeof e == "string");
		if (i.length !== e.length) throw Error("模型调用的 imageUrls 必须是字符串数组");
		if (i.length > P) throw Error(`模型调用的参考图不能超过 ${P} 张`);
		let a = Array.isArray(n.resourceIds) ? n.resourceIds : [], o = a.filter((e) => typeof e == "string" && e.length > 0 && e.length <= 160);
		if (o.length !== a.length || o.length > P) throw Error(`模型调用的 resourceIds 必须是最多 ${P} 个资源标识`);
		if (t) for (let e of i) J(e, t);
		let s = {
			type: r,
			modelId: String(n.modelId ?? "").slice(0, 256),
			prompt: String(n.prompt ?? "").slice(0, N),
			parameters: n.parameters === void 0 ? void 0 : U(W(n.parameters))
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
		content: String(n.content ?? "").slice(0, N),
		suggestedName: typeof n.suggestedName == "string" ? n.suggestedName.slice(0, 120) : void 0
	};
	if (r === "resource.export") {
		let e = typeof n.resourceId == "string" ? n.resourceId.slice(0, 160) : "";
		if (!e) throw Error("资源导出必须包含 resourceId");
		return {
			type: r,
			resourceId: e,
			suggestedName: typeof n.suggestedName == "string" ? n.suggestedName.slice(0, 120) : void 0
		};
	}
	if (r === "video.detectShots" || r === "video.inspectFrame") {
		let e = typeof n.resourceId == "string" ? n.resourceId.slice(0, 160) : "";
		if (!e) throw Error("视频操作必须包含 resourceId");
		if (r === "video.inspectFrame") {
			let t = Number(n.time), i = Number(n.direction ?? 0);
			if (!Number.isFinite(t) || t < 0 || i !== -1 && i !== 0 && i !== 1) throw Error("帧步进参数无效");
			return {
				type: r,
				resourceId: e,
				time: t,
				direction: i,
				boundary: n.boundary === !0
			};
		}
		let t = Number(n.start), i = Number(n.end), a = Number(n.threshold ?? .28), o = Number(n.minShotDuration ?? .3);
		if (![
			t,
			i,
			a,
			o
		].every(Number.isFinite) || t < 0 || i <= t || i - t > 300 || a < .05 || a > .95 || o < .04 || o > 10) throw Error("镜头检测参数或区间无效");
		return {
			type: r,
			resourceId: e,
			start: t,
			end: i,
			threshold: a,
			minShotDuration: o
		};
	}
	if (r === "video.extractFrames") {
		let e = typeof n.resourceId == "string" ? n.resourceId.slice(0, 160) : "", t = n.mode === "preview" || n.mode === "analysis" ? n.mode : void 0;
		if (!e || !t) throw Error("视频抽帧必须包含 resourceId 和有效 mode");
		if (t === "preview") {
			let i = Number(n.count ?? 12);
			if (!Number.isSafeInteger(i) || i < 1 || i > 48) throw Error("视频预览帧数量必须在 1-48 之间");
			return {
				type: r,
				resourceId: e,
				mode: t,
				count: i
			};
		}
		if (!Array.isArray(n.samples) || n.samples.length < 1 || n.samples.length > 24) throw Error("视频分析帧数量必须在 1-24 之间");
		let i = /* @__PURE__ */ new Set(), a = -1;
		return {
			type: r,
			resourceId: e,
			mode: t,
			samples: n.samples.map((e) => {
				let t = W(e), n = typeof t.key == "string" ? t.key : "", r = Number(t.time);
				if (!Te.test(n) || i.has(n) || !Number.isFinite(r) || r < 0) throw Error("视频分析帧参数无效");
				if (r <= a) throw Error("视频分析帧时间点必须严格递增");
				return i.add(n), a = r, {
					key: n,
					time: r
				};
			}),
			replaceDerived: n.replaceDerived === !0
		};
	}
	throw Error("插件请求了不支持的宿主操作");
}
function Xe(e, t) {
	if (t === "resource") return;
	let n = t === "image" ? e.imageUrl ?? e.thumbnailUrl ?? e.output : t === "video" ? e.videoUrl ?? e.output : t === "audio" ? e.audioUrl ?? e.output : t === "json" ? e.pluginOutputs ?? e.output : e.output ?? e.prompt;
	if (!(typeof n == "string" && G(n))) return U(n, 0, !0);
}
function Ze(e, t, n, r) {
	let i = Re(t, "plugin-out-");
	if (e.data.type !== "plugin-node" || !i) return Xe(e.data, n.type);
	let a = typeof e.data.pluginId == "string" ? e.data.pluginId : void 0, o = typeof e.data.pluginNodeId == "string" ? e.data.pluginNodeId : void 0, s = r.find((e) => e.id === a);
	if (!s) throw Error("来源插件未安装或已卸载，请重新连接端口");
	let c = s.manifest.contributes.nodes?.find((e) => e.id === o);
	if (!c) throw Error("来源插件节点已不存在，请重新连接端口");
	let l = c.outputs.find((e) => e.id === i);
	if (!l) throw Error(`来源插件输出端口「${i}」已不存在，请重新连接端口`);
	if (l.type !== n.type) throw Error(`端口类型不兼容：来源「${l.label}」为 ${l.type}，目标「${n.label}」为 ${n.type}`);
	return U(W(e.data.pluginOutputs)[i]);
}
function Qe(e, t) {
	let n = p.getState(), r = {};
	for (let i of n.edges.filter((e) => e.target === t)) {
		let t = Re(i.targetHandle, "plugin-in-"), a = e.node.inputs.find((e) => e.id === t), o = n.nodes.find((e) => e.id === i.source);
		if (!a || !o) continue;
		let s = Ze(o, i.sourceHandle, a, n.installedPlugins);
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
function $e(e, t, n) {
	let r = W(e), i = typeof r.message == "string" ? r.message.slice(0, 240) : void 0, a;
	r.effect !== void 0 && (a = X(r.effect, n));
	let o;
	if (r.data !== void 0) {
		let e = W(r.data), i = new Set(t.node.fields.map((e) => e.id)), a = new Set(t.node.outputs.map((e) => e.id)), s = {}, c = {};
		for (let [t, n] of Object.entries(W(e.values))) {
			if (!i.has(t)) throw Error(`插件返回了未声明字段: ${t}`);
			let e = U(n);
			e !== void 0 && (s[t] = e);
		}
		for (let [r, i] of Object.entries(W(e.outputs))) {
			if (!a.has(r)) throw Error(`插件返回了未声明输出: ${r}`);
			let e = U(i);
			if (e !== void 0) {
				let i = t.node.outputs.find((e) => e.id === r);
				n && i && R.has(i.type) && K(e, (e) => J(e, n)), c[r] = e;
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
async function et(e, t, n, r, i) {
	let a = t.find((t) => t.id === e.modelId);
	if (!a) throw Error("插件请求的模型不在当前可调用列表中");
	let o = e.parameters ?? {}, s = {
		prompt: e.prompt,
		model: a.id,
		provider: a.provider,
		nodeId: n
	};
	if (a.category === "text") return { text: await w({
		...s,
		imageUrls: r
	}) };
	if (a.category === "image") return { url: (await b({
		...s,
		imageSize: Z(o, "imageSize"),
		aspectRatio: Z(o, "aspectRatio"),
		image_urls: r
	}, i)).url };
	if (a.category === "video") return { url: (await S({
		...s,
		videoResolution: Q(o, "videoResolution"),
		videoFps: Q(o, "videoFps"),
		videoFrames: Q(o, "videoFrames"),
		seedanceResolution: Z(o, "resolution"),
		seedanceRatio: Z(o, "aspectRatio"),
		seedanceDuration: Q(o, "duration"),
		generateAudio: typeof o.generateAudio == "boolean" ? o.generateAudio : void 0
	}, i)).url };
	let c = await C({
		...s,
		audioVoice: Z(o, "voice"),
		audioFormat: Z(o, "format"),
		audioSpeed: Q(o, "speed"),
		musicTitle: Z(o, "title"),
		musicLyrics: Z(o, "lyrics"),
		musicBpm: Q(o, "bpm"),
		musicDuration: Q(o, "duration")
	}, i);
	return {
		url: c.url,
		title: c.title ?? null,
		lyrics: c.lyrics ?? null
	};
}
function tt(e) {
	return e ? [
		...e.self,
		...e.incoming,
		...e.package,
		...e.derived
	] : [];
}
function nt(e, t) {
	return e.node.inputs.filter((e) => e.type === "image").flatMap((e) => {
		let n = t[e.id];
		return (Array.isArray(n) ? n : [n]).filter((e) => typeof e == "string");
	});
}
async function $(e, t, n, r) {
	let i = () => {
		if (e.signal?.aborted) throw Error("插件操作已取消");
		let n = e.resourceReadContext;
		if (!n) throw Error("插件资源会话已失效");
		let r = H(e.pluginId, n.sourceDigest, n.revisionDigest);
		if (r.currentProjectId !== e.projectId || r.getCurrentRevision() !== n.baseRevision || !r.nodes.some((e) => e.id === t)) throw Error("画布已变化，插件操作已撤销");
	};
	try {
		if (e.signal?.aborted) throw Error("插件操作已取消");
		if (n.type === "model.generate") {
			if (!e.permissions.includes("models.invoke")) throw Error("插件未声明 models.invoke 权限");
			let a = await Promise.all((n.resourceIds ?? []).map(async (t) => {
				let n = tt(e.resources).find((e) => e.resourceId === t);
				if (!n) throw Error("模型调用引用了当前调用范围外的资源");
				if (!n.mediaType.startsWith("image/")) throw Error("模型参考资源必须是图像");
				if (!e.resourceReadContext) throw Error("插件资源会话已失效");
				return s(e.resourceReadContext, t);
			})), o = [
				...e.pluginNode && e.inputs ? nt(e.pluginNode, e.inputs) : [],
				...n.imageUrls ?? [],
				...a
			];
			i();
			let c = await et(n, r, t, o, e.signal);
			return i(), {
				type: n.type,
				ok: !0,
				value: c
			};
		}
		if (n.type === "resource.readText") {
			if (!e.resourceReadContext) throw Error("插件资源会话已失效");
			let t = await o(e.resourceReadContext, n.resourceId, n.maxBytes);
			return {
				type: n.type,
				ok: !0,
				value: U(t)
			};
		}
		if (n.type === "resource.readRange") {
			if (!e.resourceReadContext) throw Error("插件资源会话已失效");
			let t = await a(e.resourceReadContext, n.resourceId, n.offset, n.length);
			return {
				type: n.type,
				ok: !0,
				value: U(t)
			};
		}
		if (n.type === "video.extractFrames" || n.type === "video.detectShots" || n.type === "video.inspectFrame") {
			if (!e.permissions.includes("files.connected.read") || !e.permissions.includes("files.output.create")) throw Error("视频抽帧要求 files.connected.read 与 files.output.create 权限");
			if (!e.resources || !e.resourceReadContext) throw Error("插件资源会话已失效");
			let r = e.resources.self.find((e) => e.resourceId === n.resourceId);
			if (!r || r.origin !== "node-self" || r.source?.nodeId !== t || !r.mediaType.startsWith("video/")) throw Error("视频抽帧只能读取当前节点的 self 视频资源");
			let a = await s(e.resourceReadContext, n.resourceId);
			if (i(), n.type === "video.detectShots" || n.type === "video.inspectFrame") {
				let t = n.type === "video.detectShots" ? await me({
					...n,
					url: a,
					signal: e.signal
				}) : await pe({
					...n,
					url: a,
					signal: e.signal
				});
				return i(), {
					type: n.type,
					ok: !0,
					value: U(t)
				};
			}
			let o = await Se({
				url: a,
				mode: n.mode,
				count: n.count,
				samples: n.samples,
				signal: e.signal
			});
			i();
			let c = o.frames.flatMap((e) => !("error" in e) && e.bytes ? [{
				displayName: `${e.key}.jpg`,
				mediaType: e.mediaType,
				bytes: e.bytes
			}] : []);
			o.contactSheet && c.push({
				displayName: "frame-contact-sheet.jpg",
				...o.contactSheet
			});
			let u = n.replaceDerived ? l(e.resourceReadContext, e.resources, c) : c.map((t) => d(e.resourceReadContext, e.resources, t)), f = 0, p = o.frames.map((e) => {
				if ("error" in e) return e;
				let t = e.bytes ? u[f++] : void 0;
				return {
					key: e.key,
					requestedTime: e.requestedTime,
					actualTime: e.actualTime,
					frameDuration: e.frameDuration,
					width: e.width,
					height: e.height,
					previewDataUrl: e.previewDataUrl,
					resourceId: t?.resourceId
				};
			}), m = o.contactSheet ? u[f] : void 0;
			return {
				type: n.type,
				ok: !0,
				value: U({
					video: o.video,
					frames: p,
					contactSheetResourceId: m?.resourceId
				})
			};
		}
		if (!e.permissions.includes("files.output.create")) throw Error("插件未声明 files.output.create 权限");
		if (n.type === "resource.export" && !e.resourceReadContext) throw Error("插件资源会话已失效");
		e.resourceReadContext && i();
		let c = n.type === "resource.export" && e.resourceReadContext ? m(e.resourceReadContext, n.resourceId) : void 0, u = Array.from((n.suggestedName || c?.resource.displayName || "plugin-output.txt").replace(/[<>:"/\\|?*]/gu, "_"), (e) => e.codePointAt(0) <= 31 ? "_" : e).join("").replace(/^\.+/u, "").trim().slice(0, 120) || "plugin-output.txt", f = c?.bytes ?? new TextEncoder().encode(n.type === "resource.createText" ? n.content : ""), p = await g(f, e.projectId, u);
		if (!p) throw Error(`无法在当前项目中创建「${e.title}」输出`);
		if (e.resourceReadContext) try {
			i();
		} catch (e) {
			throw await _(p.filePath), e;
		}
		let h = p.filePath.replace(/\\/gu, "/").split("/").at(-1) ?? u;
		return {
			type: n.type,
			ok: !0,
			value: {
				fileName: h,
				bytes: f.byteLength
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
function rt(e, t) {
	let n = { pluginOutputs: t };
	for (let r of e.node.outputs) {
		let e = t[r.id];
		typeof e == "string" && (r.type === "image" && n.imageUrl === void 0 ? n.imageUrl = e : r.type === "video" && n.videoUrl === void 0 ? n.videoUrl = e : r.type === "audio" && n.audioUrl === void 0 ? n.audioUrl = e : (r.type === "text" || r.type === "json") && n.output === void 0 && (n.output = e));
	}
	return n;
}
async function it(r, a, o) {
	let s = p.getState(), l = s.currentProjectId, u = s.nodes.find((e) => e.id === a);
	if (!l || !u) throw Error("插件节点或项目不存在");
	let d = B(s.installedPlugins, r.pluginId, r.sourceDigest), f = V(s.installedPlugins, r.pluginId, r.revisionDigest), m = s.installedPlugins.find((e) => e.id === r.pluginId);
	if (!m) throw Error("插件已被卸载");
	let g = Ae(), _ = U(u.data.pluginValues);
	for (let e of r.node.fields) {
		let t = _?.[e.id], n = t == null || t === "" || e.type === "boolean" && t !== !0;
		if (e.required && n) throw Error(`请填写「${e.label}」`);
	}
	let v = Qe(r, a), y = n(s, a);
	if (!y) throw Error("无法创建插件执行保护");
	let b = r.runtime === "javascript" ? Je(r, v) : void 0, x;
	try {
		let e = await c({
			pluginId: r.pluginId,
			sourceDigest: d,
			revisionDigest: f,
			invocationId: g,
			projectId: l,
			nodeId: a,
			baseRevision: y.baseRevision,
			access: r.node.resourceAccess,
			inputPorts: r.node.inputs,
			packageResources: m.manifest.resources,
			state: s
		});
		for (let t of r.node.inputs) {
			let n = e.inputs[t.id] ?? [], r = v[t.id], i = Array.isArray(r) ? r.length : r === void 0 ? 0 : 1;
			if (!t.multiple && n.length > 1) throw Error(`输入「${t.label}」只允许一条连线`);
			if (t.required && i === 0 && n.length === 0) throw Error(`缺少必填输入「${t.label}」`);
		}
		let n = () => ({
			pluginId: r.pluginId,
			sourceDigest: d,
			revisionDigest: f,
			invocationId: g,
			projectId: l,
			nodeId: a,
			baseRevision: y.baseRevision,
			permissions: r.permissions,
			state: p.getState()
		});
		for (let i = 0; i <= I; i += 1) {
			H(r.pluginId, d, f);
			let s = {
				projectId: l,
				iteration: i,
				node: {
					id: a,
					values: _ ?? {}
				},
				inputs: v,
				models: r.permissions.includes("models.read") ? o : [],
				resources: e,
				effectResult: x
			}, c = await h("execute_node_plugin_tool", {
				pluginId: r.pluginId,
				sourceDigest: d,
				revisionDigest: f,
				toolId: r.node.id,
				invocationId: g,
				input: s
			});
			H(r.pluginId, d, f);
			let u = $e(c, r, b);
			if (u.effect) {
				if (i === I) throw Error(`插件宿主操作不能超过 ${I} 次`);
				x = await $({
					pluginId: r.pluginId,
					projectId: l,
					title: r.node.title,
					permissions: r.permissions,
					resources: e,
					resourceReadContext: n(),
					pluginNode: r,
					inputs: v
				}, a, u.effect, o), H(r.pluginId, d, f), b && u.effect.type === "model.generate" && Y(u.effect, x, o, b);
				continue;
			}
			let p = H(r.pluginId, d, f);
			if (!t(y, p)) throw Error("画布已变化，插件结果未写入");
			let m = {
				..._ ?? {},
				...u.data?.values ?? {}
			}, S = u.data?.outputs ?? {};
			p.updateNodeData(a, {
				pluginValues: m,
				status: "success",
				...rt(r, S)
			}), p.showToast(u.message || `插件节点「${r.node.title}」执行完成`);
			return;
		}
	} finally {
		i(g), e(y);
	}
}
async function at(e) {
	let t = [], n = /* @__PURE__ */ new Map(), i = new Map(e.nodeSet.nodes.map((e) => [e.key, `node-${f()}`])), a = async () => {
		await Promise.all(t.map((e) => _(e)));
	};
	try {
		for (let a of e.nodeSet.nodes) {
			if (!a.resourceId) continue;
			e.assertFresh();
			let o = m(e.resourceContext, a.resourceId), s = o.resource.mediaType === "image/png" ? "png" : o.resource.mediaType === "image/webp" ? "webp" : "jpg", c = `video-frame-${a.key}.${s}`, l = await g(o.bytes, e.projectId, c);
			if (!l?.assetUrl) throw Error(`无法保存抽帧图像「${a.key}」`);
			t.push(l.filePath);
			let u = await r(l.assetUrl);
			e.assertFresh(), n.set(a.key, {
				nodeId: i.get(a.key),
				assetUrl: l.assetUrl,
				filePath: l.filePath,
				fileName: l.filePath.replace(/\\/gu, "/").split("/").at(-1) ?? c,
				dimensions: u
			});
		}
		e.assertFresh();
		let o = u(e.sourceNode), s = Math.min(4, Math.max(1, e.nodeSet.nodes.length)), c = o.position.y, l = 0;
		return {
			nodes: e.nodeSet.nodes.map((t, r) => {
				r > 0 && r % s === 0 && (c += Math.max(280, l + 80), l = 0);
				let a = n.get(t.key), u = { ...t.data };
				u.frameAnalysis && typeof u.frameAnalysis == "object" && !Array.isArray(u.frameAnalysis) && (u.frameAnalysis = {
					...u.frameAnalysis,
					sourceVideoNodeId: e.sourceNode.id,
					sourceVideoName: String(e.sourceNode.data.label || "视频").slice(0, 240)
				}), Array.isArray(u.shotlistRows) && (u.shotlistRows = u.shotlistRows.map((t) => {
					let r = W(t), i = typeof r.frameKey == "string" ? r.frameKey : void 0, a = i ? n.get(i) : void 0;
					if (i && !a) throw Error(`分镜行引用了无效画面 key: ${i}`);
					let { frameKey: o, ...s } = r;
					return {
						...s,
						...r.frameAnalysis && typeof r.frameAnalysis == "object" ? { frameAnalysis: {
							...W(r.frameAnalysis),
							sourceVideoNodeId: e.sourceNode.id,
							sourceVideoName: String(e.sourceNode.data.label || "视频").slice(0, 240)
						} } : {},
						frame: a ? {
							nodeId: a.nodeId,
							kind: "image",
							url: a.assetUrl,
							filePath: a.filePath
						} : null
					};
				})), a && (u.imageUrl = a.assetUrl, u.filePath = a.filePath, u.fileName = a.fileName, u.nodeWidth = a.dimensions.nodeWidth, u.nodeHeight = a.dimensions.nodeHeight);
				let d = typeof u.nodeHeight == "number" && Number.isFinite(u.nodeHeight) && u.nodeHeight > 0 ? u.nodeHeight : t.nodeType === "ai-shotlist" ? 380 : 158;
				return l = Math.max(l, d), {
					id: i.get(t.key),
					type: t.nodeType,
					position: {
						x: o.position.x + r % s * 320,
						y: c
					},
					...o.parentId ? { parentId: o.parentId } : {},
					data: {
						label: typeof u.label == "string" ? u.label : t.key,
						type: t.nodeType,
						role: "source",
						status: "success",
						...u
					}
				};
			}),
			edges: (e.nodeSet.edges ?? []).map((e) => ({
				id: `edge-${f()}`,
				source: i.get(e.sourceKey),
				target: i.get(e.targetKey),
				sourceHandle: "right",
				targetHandle: "left"
			})),
			rollback: a
		};
	} catch (e) {
		throw await a(), e;
	}
}
async function ot(r, a, o = {}, s) {
	let l = p.getState(), d = l.currentProjectId, m = l.nodes.find((e) => e.id === a);
	if (!d || !m) throw Error("目标节点或项目不存在");
	let g = B(l.installedPlugins, r.pluginId, r.sourceDigest), _ = V(l.installedPlugins, r.pluginId, r.revisionDigest), v = l.installedPlugins.find((e) => e.id === r.pluginId);
	if (!v) throw Error("插件已被卸载");
	let y = !s, b = s?.invocationId ?? Ae(), x = s?.guard ?? n(l, a);
	if (!x) throw Error("无法创建插件执行保护");
	if (x.projectId !== d || x.sourceNodeId !== a || !t(x, l)) throw Error("插件界面会话已失效");
	let S = {};
	for (let [e, t] of Object.entries(o)) {
		if (F.has(e)) continue;
		let n = U(t);
		n !== void 0 && (S[e] = n);
	}
	let C = Me(r), w = r.runtime === "javascript" ? s?.trustedMediaReferences ?? /* @__PURE__ */ new Set() : void 0, T, E = () => {
		if (s?.signal?.aborted) throw Error("插件操作已取消");
		let e = H(r.pluginId, g, _);
		if (!t(x, e)) throw Error("画布已变化，插件结果未写入");
		return e;
	};
	try {
		E();
		let e = s?.resources ?? await c({
			pluginId: r.pluginId,
			sourceDigest: g,
			revisionDigest: _,
			invocationId: b,
			projectId: d,
			nodeId: a,
			baseRevision: x.baseRevision,
			access: r.tool.resourceAccess,
			packageResources: v.manifest.resources,
			state: l
		}), t = () => ({
			pluginId: r.pluginId,
			sourceDigest: g,
			revisionDigest: _,
			invocationId: b,
			projectId: d,
			nodeId: a,
			baseRevision: x.baseRevision,
			permissions: r.permissions,
			state: p.getState()
		});
		for (let n = 0; n <= I; n += 1) {
			E();
			let i = Fe(d, m, r.tool.inputFields, S, {
				iteration: n,
				models: C,
				resources: e,
				effectResult: T
			});
			if (w) for (let e of qe(i)) w.add(e);
			let o = await h("execute_node_plugin_tool", {
				pluginId: r.pluginId,
				sourceDigest: g,
				revisionDigest: _,
				toolId: r.tool.id,
				invocationId: b,
				input: i
			});
			E();
			let c = r.tool.output.mode === "create-node" ? r.tool.output.nodeType ?? m.data.type : m.data.type, l = Le(o, r.tool.output, w, c);
			if (l.effect) {
				if (n === I) throw Error(`插件宿主操作不能超过 ${I} 次`);
				T = await $({
					pluginId: r.pluginId,
					projectId: d,
					title: r.tool.title,
					permissions: r.permissions,
					resources: e,
					resourceReadContext: t(),
					signal: s?.signal
				}, a, l.effect, C), E(), w && l.effect.type === "model.generate" && Y(l.effect, T, C, w);
				continue;
			}
			let p = E(), v = l.data ?? {};
			if (r.tool.output.mode === "update-current") p.updateNodeData(a, v);
			else if (r.tool.output.mode === "create-node") {
				let e = r.tool.output.nodeType ?? m.data.type, t = u(m);
				p.addNode({
					id: `node-${f()}`,
					type: e,
					...t,
					data: {
						label: typeof v.label == "string" ? v.label : `${m.data.label} · ${r.tool.title}`,
						type: e,
						role: "source",
						status: "success",
						...v
					}
				});
			} else {
				if (!l.nodeSet) throw Error("插件没有返回有效节点集");
				let e = () => {
					E();
				}, n = await at({
					nodeSet: l.nodeSet,
					sourceNode: m,
					projectId: d,
					resourceContext: t(),
					assertFresh: e
				});
				try {
					e(), H(r.pluginId, g, _).addNodesWithEdges(n.nodes, n.edges);
				} catch (e) {
					throw await n.rollback(), e;
				}
			}
			p.showToast(l.message || `插件工具「${r.tool.title}」执行完成`);
			return;
		}
		throw Error(`插件宿主操作不能超过 ${I} 次`);
	} finally {
		y && (i(b), e(x));
	}
}
async function st() {
	return h("get_python_plugin_runtime_status");
}
async function ct(e) {
	let t = X(e.effect, e.trustedMediaReferences), n = await $({
		pluginId: e.pluginId,
		projectId: e.projectId,
		title: e.title,
		permissions: e.permissions,
		resources: e.resources,
		resourceReadContext: e.resourceReadContext,
		signal: e.signal
	}, e.nodeId, t, e.models);
	return t.type === "model.generate" && Y(t, n, e.models, e.trustedMediaReferences), n;
}
//#endregion
export { ct as a, st as c, it as i, ie as l, Pe as n, je as o, ot as r, Ne as s, Ke as t, re as u };
