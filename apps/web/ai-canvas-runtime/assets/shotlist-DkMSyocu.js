//#region src/types/shotlist.ts
var e = [
	"shotNo",
	"frame",
	"shotSize",
	"content",
	"duration"
], t = [
	"camera",
	"dialogue",
	"audio",
	"transition",
	"note"
], n = [
	"shotNo",
	"frame",
	"shotSize",
	"camera",
	"content",
	"dialogue",
	"audio",
	"transition",
	"duration",
	"note"
], r = {
	shotNo: "镜号",
	frame: "画面",
	shotSize: "景别",
	camera: "运镜",
	content: "内容",
	dialogue: "台词",
	audio: "音效/音乐",
	transition: "转场",
	duration: "时长",
	note: "备注"
}, i = [
	...e,
	"camera",
	"dialogue"
], a = [
	"远景",
	"全景",
	"中景",
	"近景",
	"特写",
	"大特写"
], o = [
	"固定",
	"推",
	"拉",
	"摇",
	"移",
	"跟",
	"升",
	"降",
	"手持",
	"环绕"
], s = [
	{
		label: "切",
		kind: "none"
	},
	{
		label: "叠化",
		kind: "dissolve"
	},
	{
		label: "淡入淡出",
		kind: "fade"
	}
], c = .5, l = [
	"ai-image",
	"source-image",
	"ai-video",
	"source-video"
];
function u(e) {
	let t = e.type === "ai-video" || e.type === "source-video", n = t ? e.data.thumbnailUrl || e.data.videoUrl : e.data.imageUrl || e.data.thumbnailUrl;
	return {
		kind: t ? "video" : "image",
		url: n
	};
}
function d(e, t, n) {
	let r = new Set(t.filter((e) => e.target === n).map((e) => e.source));
	return e.filter((e) => r.has(e.id) && l.includes(e.type ?? "")).map((e) => ({
		nodeId: e.id,
		label: e.data.label || e.data.fileName || e.id,
		...u(e)
	}));
}
function f(e) {
	return [
		e.shotSize?.trim(),
		e.camera?.trim(),
		e.content?.trim()
	].filter(Boolean).join("，");
}
function p(e) {
	return e.frame ? !1 : [
		e.shotSize,
		e.camera,
		e.content,
		e.dialogue,
		e.audio,
		e.transition,
		e.note
	].every((e) => !e?.trim());
}
function m(e) {
	let t = [
		e.shotNo?.trim(),
		e.shotSize?.trim(),
		e.camera?.trim()
	].filter(Boolean).join(" · "), n = e.content?.trim() || e.dialogue?.trim() || "";
	return t && n ? `${t}\n${n}` : t || n || "未命名镜头";
}
function h(e) {
	let t = [e.content?.trim(), e.dialogue?.trim()].filter(Boolean).join(" / "), n = [
		e.shotNo?.trim(),
		e.shotSize?.trim(),
		e.camera?.trim(),
		t
	].filter(Boolean).join(" · "), r = Number(_(e).toFixed(1));
	return n ? `${n} · ${r}″` : `${r}″`;
}
function g(e) {
	let t = e?.trim();
	return t ? s.find((e) => e.label === t)?.kind ?? "none" : "none";
}
function _(e) {
	return typeof e.duration == "number" && e.duration > 0 ? e.duration : e.frame?.kind === "video" && (e.frame.sourceDuration ?? 0) > 0 ? e.frame.sourceDuration : 3;
}
function v(e) {
	return e.reduce((e, t) => p(t) ? e : e + _(t), 0);
}
function y(e, t) {
	return {
		id: e,
		shotNo: String(t),
		frame: null,
		shotSize: "",
		camera: "",
		content: "",
		dialogue: "",
		audio: "",
		transition: "",
		duration: 3,
		note: ""
	};
}
function b(t) {
	let r = new Set([...e, ...t ?? i]);
	return n.filter((e) => r.has(e));
}
//#endregion
export { u as _, t as a, b, a as c, m as d, d as f, p as g, h, l as i, s as l, y as m, n, c as o, v as p, i as r, o as s, r as t, f as u, _ as v, g as y };
