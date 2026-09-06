import { i as e } from "./react-Dfufv8pq.js";
//#region src/types/dramaAssets.ts
var t = /* @__PURE__ */ e({
	DRAMA_ASSET_KIND_LABEL: () => n,
	DRAMA_EXTRACT_MARKER: () => r,
	DRAMA_MENTION_MERGE_ALL: () => "all",
	buildDramaMentionId: () => _,
	emptyDramaAssetLibrary: () => i,
	formatDramaMention: () => g,
	normalizeDramaAssetLibrary: () => h,
	normalizeDramaCharacter: () => m,
	parseDramaMentionId: () => v
}), n = {
	character: "人物",
	scene: "场景",
	prop: "道具"
}, r = {
	character: "[[DRAMA_EXTRACT:character]]",
	scene: "[[DRAMA_EXTRACT:scene]]",
	prop: "[[DRAMA_EXTRACT:prop]]"
};
function i() {
	return {
		version: 2,
		characters: [],
		scenes: [],
		props: []
	};
}
var a = new Set([
	"primary",
	"avatar",
	"full_body",
	"expression",
	"turnaround",
	"outfit",
	"other"
]), o = new Set([
	"timbre",
	"line",
	"emotion",
	"other"
]), s = new Set([
	"standing",
	"walking",
	"running",
	"jumping",
	"sitting",
	"crouching",
	"lying",
	"climbing",
	"swimming",
	"attacking",
	"defending",
	"hit",
	"death",
	"casting",
	"interacting",
	"dancing",
	"expression",
	"custom"
]);
function c(e) {
	return typeof e == "object" && e ? e : null;
}
function l(e, t) {
	return typeof e == "number" && Number.isFinite(e) ? e : t;
}
function u(e) {
	let t = c(e);
	if (!t) return;
	let n = (e) => Math.min(1, Math.max(0, e)), r = n(l(t.x, 0)), i = n(l(t.y, 0)), a = n(l(t.width, 1)), o = n(l(t.height, 1));
	if (!(a <= 0 || o <= 0)) return {
		x: Math.min(r, 1 - a),
		y: Math.min(i, 1 - o),
		width: a,
		height: o
	};
}
function d(e, t, n, r) {
	let i = c(e);
	if (!i) return null;
	let o = typeof i.imageUrl == "string" ? i.imageUrl : void 0, s = typeof i.assetId == "string" ? i.assetId : void 0, u = typeof i.relativePath == "string" ? i.relativePath : void 0, d = typeof i.filePath == "string" ? i.filePath : void 0, f = typeof i.sourceNodeId == "string" ? i.sourceNodeId : void 0;
	if (!o && !s && !u && !d && !f) return null;
	let p = typeof i.kind == "string" ? i.kind : "", m = a.has(p) ? p : "other";
	return {
		id: typeof i.id == "string" && i.id.trim() ? i.id : `ref-${t}-${n}`,
		kind: m,
		assetId: s,
		relativePath: u,
		filePath: d,
		imageUrl: o,
		sourceNodeId: f,
		prompt: typeof i.prompt == "string" ? i.prompt : "",
		createdAt: l(i.createdAt, r),
		updatedAt: l(i.updatedAt, r)
	};
}
function f(e, t, n, r) {
	let i = c(e);
	if (!i) return null;
	let a = typeof i.audioUrl == "string" ? i.audioUrl : void 0, s = typeof i.assetId == "string" ? i.assetId : void 0, u = typeof i.relativePath == "string" ? i.relativePath : void 0, d = typeof i.filePath == "string" ? i.filePath : void 0, f = typeof i.sourceNodeId == "string" ? i.sourceNodeId : void 0;
	if (!a && !s && !u && !d && !f) return null;
	let p = typeof i.kind == "string" ? i.kind : "", m = o.has(p) ? p : "other", h = typeof i.durationSec == "number" && Number.isFinite(i.durationSec) && i.durationSec > 0 ? i.durationSec : void 0, g = typeof i.label == "string" && i.label.trim() ? i.label : void 0;
	return {
		id: typeof i.id == "string" && i.id.trim() ? i.id : `voice-${t}-${n}`,
		kind: m,
		label: g,
		assetId: s,
		relativePath: u,
		filePath: d,
		audioUrl: a,
		sourceNodeId: f,
		transcript: typeof i.transcript == "string" ? i.transcript : "",
		durationSec: h,
		createdAt: l(i.createdAt, r),
		updatedAt: l(i.updatedAt, r)
	};
}
function p(e, t, n, r) {
	let i = c(e);
	if (!i) return null;
	let a = typeof i.category == "string" ? i.category : "", o = s.has(a) ? a : "custom", u = typeof i.name == "string" ? i.name.trim() : "", d = typeof i.prompt == "string" ? i.prompt.trim() : "";
	if (!u && !d) return null;
	let f = o === "custom" && typeof i.customCategory == "string" && i.customCategory.trim() || void 0, p = (Array.isArray(i.media) ? i.media : []).map((e, i) => {
		let a = c(e);
		if (!a) return null;
		let o = typeof a.url == "string" ? a.url : void 0, s = typeof a.assetId == "string" ? a.assetId : void 0, u = typeof a.relativePath == "string" ? a.relativePath : void 0, d = typeof a.filePath == "string" ? a.filePath : void 0;
		if (!o && !s && !u && !d) return null;
		let f = a.kind === "image" || a.kind === "gif" || a.kind === "video" ? a.kind : void 0, p = typeof a.mimeType == "string" ? a.mimeType : void 0, m = f ?? (p?.startsWith("video/") ? "video" : p === "image/gif" ? "gif" : "image");
		return {
			id: typeof a.id == "string" && a.id.trim() ? a.id : `action-media-${t}-${n}-${i}`,
			kind: m,
			name: typeof a.name == "string" && a.name.trim() ? a.name.trim() : `${m === "video" ? "视频" : m === "gif" ? "动图" : "图片"} ${i + 1}`,
			mimeType: p,
			assetId: s,
			relativePath: u,
			filePath: d,
			url: o,
			createdAt: l(a.createdAt, r),
			updatedAt: l(a.updatedAt, r)
		};
	}).filter((e) => e !== null);
	return {
		id: typeof i.id == "string" && i.id.trim() ? i.id : `action-${t}-${n}`,
		category: o,
		customCategory: f,
		name: u || d,
		prompt: d,
		media: p,
		createdAt: l(i.createdAt, r),
		updatedAt: l(i.updatedAt, r)
	};
}
function m(e) {
	let t = (Array.isArray(e.referenceImages) ? e.referenceImages : []).map((t, n) => d(t, e.id, n, e.updatedAt || e.createdAt)).filter((e) => e !== null);
	t.length === 0 && (e.imageNodeId || e.imageUrl) && t.push({
		id: `ref-${e.id}-legacy`,
		kind: "primary",
		imageUrl: e.imageUrl,
		sourceNodeId: e.imageNodeId,
		prompt: "",
		createdAt: e.createdAt,
		updatedAt: e.updatedAt
	});
	let n = new Set(t.map((e) => e.id)), r = e.primaryReferenceImageId && n.has(e.primaryReferenceImageId) ? e.primaryReferenceImageId : t[0]?.id, i = e.avatarReferenceImageId && n.has(e.avatarReferenceImageId) ? e.avatarReferenceImageId : t.find((e) => e.kind === "avatar")?.id, a = (Array.isArray(e.voiceClips) ? e.voiceClips : []).map((t, n) => f(t, e.id, n, e.updatedAt || e.createdAt)).filter((e) => e !== null), o = new Set(a.map((e) => e.id)), s = e.primaryVoiceClipId && o.has(e.primaryVoiceClipId) ? e.primaryVoiceClipId : a[0]?.id, c = (Array.isArray(e.actions) ? e.actions : []).map((t, n) => p(t, e.id, n, e.updatedAt || e.createdAt)).filter((e) => e !== null);
	return {
		...e,
		referenceImages: t,
		primaryReferenceImageId: r,
		avatarReferenceImageId: i,
		avatarCrop: i ? u(e.avatarCrop) : void 0,
		voiceClips: a,
		primaryVoiceClipId: s,
		actions: c
	};
}
function h(e) {
	let t = c(e);
	if (!t) return i();
	let n = Array.isArray(t.characters) ? t.characters.map(m) : [], r = Array.isArray(t.scenes) ? t.scenes : [], a = Array.isArray(t.props) ? t.props : [];
	return {
		version: 2,
		lastExtract: c(t.lastExtract) ? t.lastExtract : void 0,
		lastViewedAt: l(t.lastViewedAt, 0) || void 0,
		characters: n,
		scenes: r,
		props: a
	};
}
function g(e, t) {
	return `@drama{${e}:${t}}`;
}
function _(e, t) {
	return t ? `${e}#${t}` : e;
}
function v(e) {
	let t = e.indexOf("#");
	if (t < 0) return {
		assetId: e,
		mergeAll: !1
	};
	let n = e.slice(t + 1);
	return {
		assetId: e.slice(0, t),
		referenceImageId: n === "all" ? void 0 : n,
		mergeAll: n === "all"
	};
}
//#endregion
export { i as a, m as c, t as i, v as l, r as n, g as o, _ as r, h as s, n as t };
