import { i as e } from "./react-Dfufv8pq.js";
import { n as t, s as n, t as r } from "./dramaAssets-BblLUZy_.js";
//#region src/services/dramaAssetExtract.ts
var i = /* @__PURE__ */ e({
	extractJsonObject: () => f,
	formatDramaExtractMarkdown: () => y,
	mergeDramaExtractIntoLibrary: () => x,
	normalizeAssetKey: () => l,
	parseCharacterItems: () => m,
	parseDramaExtractResponse: () => _,
	parsePropItems: () => g,
	parseSceneItems: () => h,
	postProcessDramaExtractOutput: () => b
}), a = [
	"main",
	"supporting",
	"minor"
];
function o(e, t = "") {
	return typeof e == "string" ? e.trim() : e == null ? t : String(e).trim();
}
function s(e) {
	if (!Array.isArray(e)) return;
	let t = e.map((e) => o(e)).filter(Boolean);
	return t.length > 0 ? t : void 0;
}
function c(e) {
	let t = o(e).toLowerCase();
	return a.includes(t) ? t : t === "主要" || t === "主角" ? "main" : t === "次要" || t === "配角" ? "supporting" : "minor";
}
function l(e) {
	return e.trim().toLowerCase().replace(/[\s\u3000]+/g, "").replace(/[（(].*?[）)]/g, "").replace(/[^\u4e00-\u9fff\w]/g, "");
}
function u(e, t) {
	let n = Math.random().toString(36).slice(2, 8);
	return `${e.slice(0, 4)}_${Date.now().toString(36)}_${t}_${n}`;
}
function d() {
	return Date.now();
}
function f(e) {
	let t = e.trim(), n = /```(?:json)?\s*([\s\S]*?)```/i.exec(t);
	if (n?.[1]) return JSON.parse(n[1].trim());
	let r = t.indexOf("{"), i = t.lastIndexOf("}");
	if (r >= 0 && i > r) return JSON.parse(t.slice(r, i + 1));
	throw Error("未找到可解析的 JSON 对象");
}
function p(e, t) {
	let n = o(e.name);
	if (!n) throw Error(`第 ${t + 1} 条缺少 name`);
	return {
		name: n,
		summary: o(e.summary) || n,
		visualNotes: o(e.visualNotes) || o(e.visual_notes),
		storyRole: o(e.storyRole) || o(e.story_role) || void 0,
		importance: c(e.importance),
		firstSeen: o(e.firstSeen) || o(e.first_seen) || void 0,
		appearances: s(e.appearances)
	};
}
function m(e) {
	let t = d();
	return e.map((e, n) => {
		let r = p(e, n), i = o(e.identity) || r.summary;
		return {
			kind: "character",
			id: u("character", n),
			key: l(r.name),
			...r,
			identity: i,
			aliases: s(e.aliases),
			ageBand: o(e.ageBand) || o(e.age_band) || void 0,
			gender: o(e.gender) || void 0,
			personality: o(e.personality) || void 0,
			wardrobeDefault: o(e.wardrobeDefault) || o(e.wardrobe_default) || void 0,
			voiceNotes: o(e.voiceNotes) || o(e.voice_notes) || void 0,
			relationships: Array.isArray(e.relationships) ? e.relationships.map((e) => {
				if (!e || typeof e != "object") return null;
				let t = e, n = o(t.targetName) || o(t.target_name), r = o(t.relation);
				return !n || !r ? null : {
					targetName: n,
					relation: r
				};
			}).filter((e) => !!e) : void 0,
			confirmed: !1,
			createdAt: t,
			updatedAt: t,
			source: "ai"
		};
	});
}
function h(e) {
	let t = d();
	return e.map((e, n) => {
		let r = p(e, n);
		return {
			kind: "scene",
			id: u("scene", n),
			key: l(r.name),
			...r,
			placeType: o(e.placeType) || o(e.place_type) || void 0,
			timeOfDay: o(e.timeOfDay) || o(e.time_of_day) || void 0,
			atmosphere: o(e.atmosphere) || void 0,
			spatialNotes: o(e.spatialNotes) || o(e.spatial_notes) || void 0,
			confirmed: !1,
			createdAt: t,
			updatedAt: t,
			source: "ai"
		};
	});
}
function g(e) {
	let t = d();
	return e.map((e, n) => {
		let r = p(e, n);
		return {
			kind: "prop",
			id: u("prop", n),
			key: l(r.name),
			...r,
			ownerName: o(e.ownerName) || o(e.owner_name) || void 0,
			category: o(e.category) || void 0,
			significance: o(e.significance) || void 0,
			confirmed: !1,
			createdAt: t,
			updatedAt: t,
			source: "ai"
		};
	});
}
function _(e, t) {
	let n = f(e), r = o(n.kind);
	if (![
		"character",
		"scene",
		"prop"
	].includes(r)) throw Error(`无效 kind: ${n.kind}`);
	if (t && r !== t) throw Error(`期望 kind=${t}，实际为 ${r}`);
	let i = Array.isArray(n.items) ? n.items : [];
	if (i.length === 0) throw Error("items 为空");
	let a = o(n.notes) || void 0;
	return r === "character" ? {
		kind: r,
		characters: m(i),
		scenes: [],
		props: [],
		notes: a
	} : r === "scene" ? {
		kind: r,
		characters: [],
		scenes: h(i),
		props: [],
		notes: a
	} : {
		kind: r,
		characters: [],
		scenes: [],
		props: g(i),
		notes: a
	};
}
var v = {
	main: "主要",
	supporting: "次要",
	minor: "零星"
};
function y(e, t) {
	let n = [
		`# ${r[e]}简介表`,
		`> 结构化提取 · 仅简介（非生图提示词）· 共 ${e === "character" ? t.characters.length : e === "scene" ? t.scenes.length : t.props.length} 条`,
		""
	];
	return e === "character" ? t.characters.forEach((e, t) => {
		n.push(`## ${t + 1}. ${e.name}${e.importance === "main" ? "（主要）" : ""}`), n.push(`- 身份：${e.identity}`), e.aliases?.length && n.push(`- 别名：${e.aliases.join("、")}`), e.ageBand && n.push(`- 年龄段：${e.ageBand}`), e.gender && n.push(`- 性别呈现：${e.gender}`), e.personality && n.push(`- 性格：${e.personality}`), n.push(`- 简介：${e.summary}`), e.visualNotes && n.push(`- 外形要点：${e.visualNotes}`), e.wardrobeDefault && n.push(`- 默认造型：${e.wardrobeDefault}`), e.voiceNotes && n.push(`- 声音：${e.voiceNotes}`), e.storyRole && n.push(`- 剧情功能：${e.storyRole}`), e.relationships?.length && n.push(`- 关系：${e.relationships.map((e) => `${e.targetName}（${e.relation}）`).join("；")}`), e.firstSeen && n.push(`- 首次出现：${e.firstSeen}`), e.appearances?.length && n.push(`- 出场：${e.appearances.join("；")}`), n.push(`- 重要度：${v[e.importance]}`), n.push(""), n.push("---"), n.push("");
	}) : e === "scene" ? t.scenes.forEach((e, t) => {
		n.push(`## ${t + 1}. ${e.name}`), n.push(`- 简介：${e.summary}`), e.placeType && n.push(`- 类型：${e.placeType}`), e.timeOfDay && n.push(`- 时段：${e.timeOfDay}`), e.atmosphere && n.push(`- 氛围：${e.atmosphere}`), e.visualNotes && n.push(`- 视觉要点：${e.visualNotes}`), e.spatialNotes && n.push(`- 空间：${e.spatialNotes}`), e.storyRole && n.push(`- 剧情功能：${e.storyRole}`), e.firstSeen && n.push(`- 首次出现：${e.firstSeen}`), n.push(`- 重要度：${v[e.importance]}`), n.push(""), n.push("---"), n.push("");
	}) : t.props.forEach((e, t) => {
		n.push(`## ${t + 1}. ${e.name}`), n.push(`- 简介：${e.summary}`), e.ownerName && n.push(`- 归属：${e.ownerName}`), e.category && n.push(`- 分类：${e.category}`), e.visualNotes && n.push(`- 外观要点：${e.visualNotes}`), e.significance && n.push(`- 为何重要：${e.significance}`), e.storyRole && n.push(`- 剧情功能：${e.storyRole}`), n.push(`- 重要度：${v[e.importance]}`), n.push(""), n.push("---"), n.push("");
	}), t.notes && (n.push("## 备注"), n.push(t.notes), n.push("")), n.push("> 下一步：对单条资产另做「生成定妆/场景/道具提示词」，再逐个生成资产图。"), n.join("\n").replace(/\n---\n\n$/u, "\n").trim() + "\n";
}
function b(e, n) {
	let i;
	for (let [n, r] of Object.entries(t)) if (e.includes(r)) {
		i = n;
		break;
	}
	if (!i) return {
		output: n,
		ok: !0
	};
	try {
		let e = _(n, i);
		return {
			output: y(i, e),
			kind: i,
			ok: !0,
			parsed: e
		};
	} catch (e) {
		let t = e instanceof Error ? e.message : String(e);
		return {
			output: [
				`# ${r[i]}提取（未规范化）`,
				`> 无法解析为 JSON：${t}`,
				"> 以下为模型原文，可手动整理或重试提取。",
				"",
				n
			].join("\n"),
			kind: i,
			ok: !1
		};
	}
}
function x(e, t, r) {
	let i = n(e), a = (e, t) => {
		let n = [...e];
		for (let e of t) {
			let t = n.findIndex((t) => t.key === e.key || t.name === e.name);
			if (t >= 0) {
				let r = n[t], i = r;
				n[t] = {
					...e,
					id: r.id,
					imageNodeId: r.imageNodeId,
					imageUrl: r.imageUrl,
					..."referenceImages" in r ? {
						referenceImages: i.referenceImages,
						primaryReferenceImageId: i.primaryReferenceImageId,
						avatarReferenceImageId: i.avatarReferenceImageId,
						avatarCrop: i.avatarCrop
					} : {},
					confirmed: r.confirmed,
					createdAt: r.createdAt,
					updatedAt: Date.now(),
					source: "merge"
				};
			} else n.push(e);
		}
		return n;
	};
	return {
		...i,
		version: 2,
		lastExtract: {
			at: Date.now(),
			kinds: [t.kind],
			sourceNodeId: r?.sourceNodeId,
			modelId: r?.modelId
		},
		characters: t.kind === "character" ? a(i.characters, t.characters) : i.characters,
		scenes: t.kind === "scene" ? a(i.scenes, t.scenes) : i.scenes,
		props: t.kind === "prop" ? a(i.props, t.props) : i.props
	};
}
//#endregion
export { b as a, l as i, f as n, x as r, i as t };
