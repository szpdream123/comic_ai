//#region src/services/indexedDb/projectSummary.ts
function e(e, t) {
	return typeof e == "number" && Number.isFinite(e) ? e : t;
}
function t(e) {
	if (!e || typeof e != "object") return;
	let t = e, n = t.visualStyle, r = n?.styleReference;
	if (!n || !r) return t;
	let i = { ...r };
	return delete i.filePath, typeof i.imageUrl == "string" && /^(?:data:image\/|blob:)/i.test(i.imageUrl) && delete i.imageUrl, {
		...t,
		visualStyle: {
			...n,
			styleReference: i
		}
	};
}
function n(n) {
	if (!n || typeof n != "object") return null;
	let r = n;
	if (typeof r.id != "string" || !r.id.trim()) return null;
	let i = e(r.createdAt, Date.now()), a = {
		id: r.id,
		name: typeof r.name == "string" ? r.name : "未命名项目",
		createdAt: i,
		updatedAt: e(r.updatedAt, i)
	};
	typeof r.snapshot == "string" && (a.snapshot = r.snapshot), typeof r.dataFolder == "string" && (a.dataFolder = r.dataFolder);
	let o = t(r.settings);
	return o && (a.settings = o), typeof r.parentId == "string" && (a.parentId = r.parentId), typeof r.episodeNo == "number" && Number.isFinite(r.episodeNo) && (a.episodeNo = r.episodeNo), typeof r.episodeOutline == "string" && (a.episodeOutline = r.episodeOutline), typeof r.episodeScript == "string" && (a.episodeScript = r.episodeScript), r.episodeCreative && typeof r.episodeCreative == "object" && (a.episodeCreative = r.episodeCreative), r.series && typeof r.series == "object" && (a.series = r.series), a;
}
//#endregion
//#region src/services/indexedDb/schema.ts
var r = "ai-canvas-db", i = "projects", a = "projectSummaries", o = "workflows", s = "config", c = "presets", l = "history", u = "assetMeta", d = "assetMetaV2", f = "assetIndex", p = "styles", m = "skills", h = "chatConversations", g = "chatMessages", _ = "agentTasks", v = "projectMemories", y = "toolbarLayouts", b = "metadata", x = "globalCharacters", S = "subAgentProfiles", C = "videoEditorProjects", w = "projectVisualDescriptions", T = "plugins", E = null;
function D() {
	return E || (E = new Promise((e, t) => {
		let E = indexedDB.open(r, 21);
		E.onupgradeneeded = () => {
			let e = E.result;
			e.objectStoreNames.contains("projects") || e.createObjectStore(i, { keyPath: "id" });
			let t = !e.objectStoreNames.contains(a), r = t ? e.createObjectStore(a, { keyPath: "id" }) : E.transaction.objectStore(a);
			if (t) {
				let e = E.transaction.objectStore(i).openCursor();
				e.onsuccess = () => {
					let t = e.result;
					if (!t) return;
					let i = n(t.value);
					i && r.put(i), t.continue();
				};
			}
			e.objectStoreNames.contains("workflows") || e.createObjectStore(o, { keyPath: "id" }), e.objectStoreNames.contains("config") || e.createObjectStore(s, { keyPath: "id" }), e.objectStoreNames.contains("presets") || e.createObjectStore(c, { keyPath: "id" });
			let D = e.objectStoreNames.contains("history") ? E.transaction.objectStore(l) : e.createObjectStore(l, { keyPath: "id" });
			if (D.indexNames.contains("timestamp_id") || D.createIndex("timestamp_id", ["timestamp", "id"], { unique: !1 }), D.indexNames.contains("nodeId") || D.createIndex("nodeId", "nodeId", { unique: !1 }), D.indexNames.contains("projectId_timestamp_id") || D.createIndex("projectId_timestamp_id", [
				"projectId",
				"timestamp",
				"id"
			], { unique: !1 }), D.indexNames.contains("projectId_nodeId") || D.createIndex("projectId_nodeId", ["projectId", "nodeId"], { unique: !1 }), e.objectStoreNames.contains("assetMeta") || e.createObjectStore(u, { keyPath: "path" }), e.objectStoreNames.contains("assetMetaV2") || e.createObjectStore(d, { keyPath: "assetId" }), !e.objectStoreNames.contains("assetIndex")) {
				let t = e.createObjectStore(f, { keyPath: "assetId" });
				t.createIndex("path", "path", { unique: !0 }), t.createIndex("fingerprint", "fingerprint", { unique: !1 });
			}
			if (e.objectStoreNames.contains("styles") || e.createObjectStore(p, { keyPath: "id" }), e.objectStoreNames.contains("skills") || e.createObjectStore(m, { keyPath: "id" }), !e.objectStoreNames.contains("chatConversations")) {
				let t = e.createObjectStore(h, { keyPath: "id" });
				t.createIndex("projectId_updatedAt", ["projectId", "updatedAt"], { unique: !1 }), t.createIndex("deletedAt", "deletedAt", { unique: !1 }), t.createIndex("pinned", "pinned", { unique: !1 });
			}
			if (!e.objectStoreNames.contains("chatMessages")) {
				let t = e.createObjectStore(g, { keyPath: "id" });
				t.createIndex("conversationId_sequence", ["conversationId", "sequence"], { unique: !1 }), t.createIndex("requestId", "requestId", { unique: !1 });
			}
			if (!e.objectStoreNames.contains("agentTasks")) {
				let t = e.createObjectStore(_, { keyPath: "id" });
				t.createIndex("projectId_updatedAt", ["projectId", "updatedAt"], { unique: !1 }), t.createIndex("conversationId_updatedAt", ["conversationId", "updatedAt"], { unique: !1 }), t.createIndex("status", "status", { unique: !1 });
			}
			if (e.objectStoreNames.contains("toolbarLayouts") || e.createObjectStore(y, { keyPath: "id" }), !e.objectStoreNames.contains("projectMemories")) {
				let t = e.createObjectStore(v, { keyPath: "id" });
				t.createIndex("projectId_updatedAt", ["projectId", "updatedAt"], { unique: !1 }), t.createIndex("conversationId", "source.conversationId", { unique: !1 });
			}
			if (e.objectStoreNames.contains("metadata") || e.createObjectStore(b, { keyPath: "id" }), e.objectStoreNames.contains("globalCharacters") || e.createObjectStore(x, { keyPath: "id" }).createIndex("updatedAt", "updatedAt", { unique: !1 }), e.objectStoreNames.contains("subAgentProfiles") || e.createObjectStore(S, { keyPath: "id" }).createIndex("updatedAt", "updatedAt", { unique: !1 }), !e.objectStoreNames.contains("videoEditorProjects")) {
				let t = e.createObjectStore(C, { keyPath: "id" });
				t.createIndex("projectId_updatedAt", ["projectId", "updatedAt"], { unique: !1 }), t.createIndex("nodeId", "nodeId", { unique: !1 });
			}
			if (!e.objectStoreNames.contains("projectVisualDescriptions")) {
				let t = e.createObjectStore(w, { keyPath: "id" });
				t.createIndex("projectId_updatedAt", ["projectId", "updatedAt"], { unique: !1 }), t.createIndex("projectId_fingerprint", ["projectId", "fingerprint"], { unique: !0 });
			}
			e.objectStoreNames.contains("plugins") || e.createObjectStore(T, { keyPath: "id" });
		}, E.onsuccess = () => e(E.result), E.onerror = () => t(E.error);
	}), E);
}
//#endregion
//#region src/services/indexedDb/catalogRepository.ts
var O = "app-config";
function k(e, t) {
	return D().then((n) => new Promise((r, i) => {
		let a = n.transaction(e, "readwrite");
		a.objectStore(e).put(t), a.oncomplete = () => r(), a.onerror = () => i(a.error);
	}));
}
function A(e) {
	return D().then((t) => new Promise((n, r) => {
		let i = t.transaction(e, "readonly").objectStore(e).getAll();
		i.onsuccess = () => n(i.result), i.onerror = () => r(i.error);
	}));
}
function j(e, t) {
	return D().then((n) => new Promise((r, i) => {
		let a = n.transaction(e, "readwrite");
		a.objectStore(e).delete(t), a.oncomplete = () => r(), a.onerror = () => i(a.error);
	}));
}
var M = (e) => k(o, e), N = () => A(o), ee = (e) => j(o, e), te = (e) => k(s, {
	id: O,
	data: e
});
async function ne() {
	let e = await D();
	return new Promise((t, n) => {
		let r = e.transaction(s, "readonly").objectStore(s).get(O);
		r.onsuccess = () => t(r.result?.data ?? null), r.onerror = () => n(r.error);
	});
}
var re = (e) => k(c, e), ie = () => A(c), ae = (e) => j(c, e), oe = (e) => k(m, e), se = () => A(m), ce = (e) => j(m, e), le = (e) => k(S, e), ue = () => A(S), de = (e) => j(S, e), fe = (e) => k(p, e), P = () => A(p), F = (e) => j(p, e), I = (e) => k(T, e), L = () => A(T), R = (e) => j(T, e), z = {
	content: "输入文字",
	fontFamily: "system-ui, -apple-system, \"Segoe UI\", sans-serif",
	fontSize: 64,
	color: "#ffffff",
	fontWeight: 600,
	align: "center"
}, B = {
	x: .5,
	y: .5,
	scale: 1,
	rotation: 0,
	opacity: 1
};
function V(e) {
	return Math.max(0, e.sourceOut - e.sourceIn);
}
function pe(e) {
	let t = 0;
	for (let n of e) for (let e of n.clips) {
		let n = e.timelineStart + Math.max(0, e.sourceOut - e.sourceIn);
		n > t && (t = n);
	}
	return t;
}
function H(e) {
	return e.find((e) => e.kind === "video") ?? null;
}
function U(e) {
	let t = 0;
	return e.map((e) => {
		let n = {
			...e,
			timelineStart: t
		};
		return t += V(e), n;
	});
}
function W(e, t) {
	for (let n = 0; n < e.length; n += 1) {
		let r = e[n], i = r.timelineStart + V(r), a = n === e.length - 1 ? t <= i : t < i;
		if (t >= r.timelineStart && a) return {
			clip: r,
			index: n
		};
	}
	return null;
}
function me(e) {
	let t = H(e);
	return e.filter((e) => e !== t && e.kind !== "caption");
}
function G(e) {
	return e.timelineStart + V(e);
}
function he(e, t) {
	return e.clips.filter((e) => t >= e.timelineStart && t < G(e));
}
function ge(e, t) {
	let n = e.volume ?? 1, r = e.volumePoints;
	if (!r || r.length === 0) return n;
	let i = [...r].sort((e, t) => e.t - t.t);
	if (t <= i[0].t) return i[0].gain * n;
	let a = i[i.length - 1];
	if (t >= a.t) return a.gain * n;
	for (let e = 0; e < i.length - 1; e += 1) {
		let r = i[e], a = i[e + 1];
		if (t >= r.t && t <= a.t) {
			let e = a.t - r.t, i = e <= 0 ? 0 : (t - r.t) / e;
			return (r.gain + (a.gain - r.gain) * i) * n;
		}
	}
	return n;
}
function _e(e, t) {
	let n = e.transitionIn;
	return !n || n.kind === "none" || n.duration <= 0 || t >= n.duration ? 1 : Math.max(0, Math.min(1, t / n.duration));
}
function ve(e) {
	let t = e.filter((e) => !!e && e.width > 0 && e.height > 0);
	if (t.length < 2) return !1;
	let [n] = t;
	return t.some((e) => e.codec !== n.codec || e.width !== n.width || e.height !== n.height);
}
function ye(e) {
	let t = e.filter((e) => !e.hidden);
	return t.filter((e) => e.kind === "video").length > 1 ? !0 : t.some((e) => e.clips.some((e) => e.kind === "image" || e.kind === "text" || !!e.transitionIn && e.transitionIn.kind !== "none" && e.transitionIn.duration > 0 || !!e.transform && (e.transform.x !== B.x || e.transform.y !== B.y || e.transform.scale !== B.scale || e.transform.rotation !== B.rotation || e.transform.opacity !== B.opacity)));
}
var K = .05;
function be(e, t) {
	let n = W(e, t);
	if (!n) return null;
	let { clip: r, index: i } = n, a = t - r.timelineStart, o = V(r);
	if (a < K || o - a < K) return null;
	let s = r.sourceIn + a, c = {
		...r,
		sourceOut: s
	}, l = {
		...r,
		id: `${r.id}-b${Date.now().toString(36)}`,
		sourceIn: s
	}, u = [...e];
	return u.splice(i, 1, c, l), U(u);
}
//#endregion
//#region src/services/indexedDb/videoEditorRepository.ts
function xe(e, t) {
	return `${e}::${t}`;
}
async function Se(e) {
	let t = await D();
	return new Promise((n, r) => {
		let i = t.transaction(C, "readwrite");
		i.objectStore(C).put(e), i.oncomplete = () => n(), i.onerror = () => r(i.error);
	});
}
async function Ce(e) {
	let t = await D(), n = await new Promise((n, r) => {
		let i = t.transaction(C, "readonly").objectStore(C).get(e);
		i.onsuccess = () => n(i.result), i.onerror = () => r(i.error);
	});
	return !n || (n.schemaVersion ?? 0) > 1 ? null : n;
}
//#endregion
//#region src/services/indexedDbService.ts
var q = "last-active-project";
async function we(e) {
	let t = n(e);
	if (!t) throw Error("项目摘要无效，无法写入 IndexedDB");
	let r = await D();
	return new Promise((n, o) => {
		let s = r.transaction([i, a], "readwrite"), c = s.objectStore(i).put(e), l = s.objectStore(a).put(t), u = !1, d = (t) => {
			u || (u = !0, o(t ?? /* @__PURE__ */ Error(`项目 ${e.id} 的 IndexedDB 写入失败`)));
		};
		c.onerror = () => d(c.error), l.onerror = () => d(l.error), s.oncomplete = () => {
			u || (u = !0, n());
		}, s.onerror = () => d(s.error), s.onabort = () => d(s.error);
	});
}
async function Te(e) {
	let t = await D();
	return new Promise((n, r) => {
		let i = t.transaction(x, "readwrite");
		i.objectStore(x).put(e), i.oncomplete = () => n(), i.onerror = () => r(i.error), i.onabort = () => r(i.error ?? /* @__PURE__ */ Error(`全局角色 ${e.id} 保存失败`));
	});
}
async function Ee() {
	let e = await D();
	return new Promise((t, n) => {
		let r = e.transaction(x, "readonly").objectStore(x).getAll();
		r.onsuccess = () => t(r.result), r.onerror = () => n(r.error);
	});
}
async function De(e) {
	let t = await D();
	return new Promise((n, r) => {
		let i = t.transaction(x, "readwrite");
		i.objectStore(x).delete(e), i.oncomplete = () => n(), i.onerror = () => r(i.error);
	});
}
async function Oe() {
	let e = await D();
	return new Promise((t, n) => {
		let r = e.transaction(x, "readwrite");
		r.objectStore(x).clear(), r.oncomplete = () => t(), r.onerror = () => n(r.error);
	});
}
async function ke(e) {
	let t = await D();
	return new Promise((n, r) => {
		let o = t.transaction([
			i,
			a,
			h,
			g,
			_,
			v,
			w,
			l
		], "readwrite");
		o.objectStore(i).delete(e), o.objectStore(a).delete(e);
		let s = o.objectStore(h), c = IDBKeyRange.bound([e, 0], [e, Infinity]), u = s.index("projectId_updatedAt").openCursor(c);
		u.onsuccess = () => {
			let e = u.result;
			e && (e.delete(), e.continue());
		};
		let d = o.objectStore(g).openCursor();
		d.onsuccess = () => {
			let t = d.result;
			t && (t.value.projectId === e && t.delete(), t.continue());
		};
		let f = IDBKeyRange.bound([e, 0], [e, Infinity]), p = o.objectStore(_).index("projectId_updatedAt").openCursor(f);
		p.onsuccess = () => {
			let e = p.result;
			e && (e.delete(), e.continue());
		};
		let m = IDBKeyRange.bound([e, 0], [e, Infinity]), y = o.objectStore(v).index("projectId_updatedAt").openCursor(m);
		y.onsuccess = () => {
			let e = y.result;
			e && (e.delete(), e.continue());
		};
		let b = o.objectStore(l).index("projectId_timestamp_id").openCursor(Y(e));
		b.onsuccess = () => {
			let e = b.result;
			e && (e.delete(), e.continue());
		};
		let x = IDBKeyRange.bound([e, 0], [e, Infinity]), S = o.objectStore(w).index("projectId_updatedAt").openCursor(x);
		S.onsuccess = () => {
			let e = S.result;
			e && (e.delete(), e.continue());
		}, o.oncomplete = () => n(), o.onerror = () => r(o.error), o.onabort = () => r(o.error ?? /* @__PURE__ */ Error(`删除项目 ${e} 的持久化数据失败`));
	});
}
async function Ae() {
	let e = await D();
	return new Promise((t, n) => {
		let r = e.transaction(a, "readonly").objectStore(a).getAll();
		r.onsuccess = () => t(r.result), r.onerror = () => n(r.error);
	});
}
async function je(e) {
	let t = await D();
	return new Promise((n, r) => {
		let a = t.transaction(i, "readonly").objectStore(i).get(e);
		a.onsuccess = () => n(a.result), a.onerror = () => r(a.error);
	});
}
var J = "output-history-v1:", Me = 16;
function Y(e, t) {
	let n = [
		e,
		0,
		""
	], r = t ? [
		e,
		t.timestamp,
		t.id
	] : [
		e,
		2 ** 53 - 1,
		"￿"
	];
	return IDBKeyRange.bound(n, r, !1, !!t);
}
function X(e, t) {
	let n = e.index("projectId_timestamp_id").openCursor(Y(t), "prev"), r = 0;
	n.onsuccess = () => {
		let e = n.result;
		e && (r >= Me ? e.delete() : r += 1, e.continue());
	};
}
async function Ne(e) {
	let t = await D();
	return new Promise((n, r) => {
		let i = t.transaction(l, "readwrite");
		X(i.objectStore(l), e), i.oncomplete = () => n(), i.onerror = () => r(i.error);
	});
}
function Z(e, t) {
	if (t.nodeType && e.nodeType !== t.nodeType) return !1;
	let n = t.search?.trim().toLowerCase();
	return n ? [
		e.prompt,
		e.output,
		e.model,
		e.nodeLabel
	].some((e) => e.toLowerCase().includes(n)) : !0;
}
async function Pe(e) {
	let t = await D();
	return new Promise((n, r) => {
		let i = t.transaction(l, "readwrite"), a = i.objectStore(l);
		a.put(e), X(a, e.projectId), i.oncomplete = () => n(), i.onerror = () => r(i.error);
	});
}
async function Fe(e) {
	if (e.length === 0) return;
	let t = await D();
	return new Promise((n, r) => {
		let i = t.transaction(l, "readwrite"), a = i.objectStore(l);
		for (let t of e) a.put(t);
		for (let t of new Set(e.map((e) => e.projectId))) X(a, t);
		i.oncomplete = () => n(), i.onerror = () => r(i.error);
	});
}
async function Ie(e, t) {
	let n = await D();
	return new Promise((r, i) => {
		let a = n.transaction(l, "readwrite"), o = a.objectStore(l), s = o.get(t);
		s.onsuccess = () => {
			s.result?.projectId === e && o.delete(t);
		}, a.oncomplete = () => r(), a.onerror = () => i(a.error);
	});
}
async function Le(e, t, n = null, r = {}) {
	let i = await D();
	return new Promise((a, o) => {
		let s = i.transaction(l, "readonly").objectStore(l).index("projectId_timestamp_id").openCursor(Y(e, n), "prev"), c = [], u = null;
		s.onsuccess = () => {
			let e = s.result;
			if (!e) {
				a({
					records: c,
					nextCursor: null,
					hasMore: !1
				});
				return;
			}
			if (c.length >= t) {
				a({
					records: c,
					nextCursor: u,
					hasMore: !0
				});
				return;
			}
			let n = e.value;
			Z(n, r) && (c.push(n), u = {
				timestamp: n.timestamp,
				id: n.id
			}), e.continue();
		}, s.onerror = () => o(s.error);
	});
}
async function Re(e, t = {}) {
	let n = await D();
	return new Promise((r, i) => {
		let a = n.transaction(l, "readonly").objectStore(l).index("projectId_timestamp_id").openCursor(Y(e), "prev"), o = [];
		a.onsuccess = () => {
			let e = a.result;
			if (!e) {
				r(o);
				return;
			}
			let n = e.value;
			Z(n, t) && o.push(n), e.continue();
		}, a.onerror = () => i(a.error);
	});
}
async function ze(e, t) {
	let n = await D();
	return new Promise((r, i) => {
		let a = n.transaction(l, "readonly").objectStore(l).index("projectId_nodeId").getAll(IDBKeyRange.only([e, t]));
		a.onsuccess = () => {
			r(a.result.sort((e, t) => t.timestamp - e.timestamp || t.id.localeCompare(e.id)));
		}, a.onerror = () => i(a.error);
	});
}
async function Be(e) {
	let t = await D();
	return new Promise((n, r) => {
		let i = t.transaction(l, "readonly").objectStore(l).index("projectId_timestamp_id").count(Y(e));
		i.onsuccess = () => n(i.result), i.onerror = () => r(i.error);
	});
}
async function Ve(e) {
	let t = await D();
	return new Promise((n, r) => {
		let i = t.transaction(b, "readonly").objectStore(b).get(`${J}${e}`);
		i.onsuccess = () => n(!!i.result), i.onerror = () => r(i.error);
	});
}
async function He(e) {
	let t = await D();
	return new Promise((n, r) => {
		let i = t.transaction(b, "readwrite");
		i.objectStore(b).put({
			id: `${J}${e}`,
			completedAt: Date.now()
		}), i.oncomplete = () => n(), i.onerror = () => r(i.error);
	});
}
async function Ue() {
	let e = await D();
	return new Promise((t, n) => {
		let r = e.transaction(b, "readonly").objectStore(b).get(q);
		r.onsuccess = () => {
			let e = r.result?.projectId;
			t(typeof e == "string" && e.trim() ? e : null);
		}, r.onerror = () => n(r.error);
	});
}
async function We(e) {
	let t = await D();
	return new Promise((n, r) => {
		let i = t.transaction(b, "readwrite");
		i.objectStore(b).put({
			id: q,
			projectId: e,
			updatedAt: Date.now()
		}), i.oncomplete = () => n(), i.onerror = () => r(i.error), i.onabort = () => r(i.error);
	});
}
async function Ge(e, t) {
	let n = [...new Set(t)];
	if (n.length === 0) return;
	let r = await D();
	await new Promise((t, i) => {
		let a = r.transaction(l, "readwrite"), o = a.objectStore(l).index("nodeId");
		for (let t of n) {
			let n = o.openCursor(IDBKeyRange.only(t));
			n.onsuccess = () => {
				let t = n.result;
				if (!t) return;
				let r = t.value;
				r.projectId || t.update({
					...r,
					projectId: e
				}), t.continue();
			};
		}
		a.oncomplete = () => t(), a.onerror = () => i(a.error);
	}), await Ne(e);
}
async function Ke(e) {
	let t = await D();
	return new Promise((n, r) => {
		let i = t.transaction(l, "readwrite"), a = i.objectStore(l).index("projectId_timestamp_id").openCursor(Y(e));
		a.onsuccess = () => {
			let e = a.result;
			e && (e.delete(), e.continue());
		}, i.oncomplete = () => n(), i.onerror = () => r(i.error);
	});
}
async function qe(e, t) {
	let n = await D();
	return new Promise((r, i) => {
		let a = n.transaction(l, "readwrite"), o = a.objectStore(l).index("projectId_nodeId").openCursor(IDBKeyRange.only([e, t]));
		o.onsuccess = () => {
			let e = o.result;
			e && (e.delete(), e.continue());
		}, o.onerror = () => i(o.error), a.oncomplete = () => r(), a.onerror = () => i(a.error);
	});
}
async function Je() {
	let e = await D();
	return new Promise((t, n) => {
		let r = e.transaction(d, "readonly").objectStore(d).getAll();
		r.onsuccess = () => t(r.result), r.onerror = () => n(r.error);
	});
}
async function Ye(e) {
	let t = await D();
	return new Promise((n, r) => {
		let i = t.transaction(d, "readwrite");
		i.objectStore(d).put(e), i.oncomplete = () => n(), i.onerror = () => r(i.error);
	});
}
async function Xe(e) {
	let t = await D();
	return new Promise((n, r) => {
		let i = t.transaction(d, "readwrite");
		i.objectStore(d).delete(e), i.oncomplete = () => n(), i.onerror = () => r(i.error);
	});
}
async function Ze(e) {
	let t = await D();
	return new Promise((n, r) => {
		let i = t.transaction(h, "readwrite");
		i.objectStore(h).put(e), i.oncomplete = () => n(), i.onerror = () => r(i.error);
	});
}
async function Qe(e) {
	let t = await D();
	return new Promise((n, r) => {
		let i = t.transaction(h, "readonly").objectStore(h).index("projectId_updatedAt"), a = IDBKeyRange.bound([e, 0], [e, Infinity]), o = i.getAll(a);
		o.onsuccess = () => {
			let e = o.result;
			n(e.filter((e) => !e.deletedAt));
		}, o.onerror = () => r(o.error);
	});
}
async function $e(e) {
	let t = await D();
	return new Promise((n, r) => {
		let i = t.transaction(u, "readonly").objectStore(u).get(e);
		i.onsuccess = () => n(i.result), i.onerror = () => r(i.error);
	});
}
async function et(e) {
	let t = await D();
	return new Promise((n, r) => {
		let i = t.transaction(f, "readonly").objectStore(f).get(e);
		i.onsuccess = () => n(i.result), i.onerror = () => r(i.error);
	});
}
async function tt(e) {
	let t = await D();
	return new Promise((n, r) => {
		let i = t.transaction(f, "readonly").objectStore(f).index("path").get(e);
		i.onsuccess = () => n(i.result), i.onerror = () => r(i.error);
	});
}
async function nt(e) {
	let t = await D();
	return new Promise((n, r) => {
		let i = t.transaction(f, "readonly").objectStore(f).index("fingerprint").getAll(e);
		i.onsuccess = () => n(i.result), i.onerror = () => r(i.error);
	});
}
async function rt(e) {
	let t = await D();
	return new Promise((n, r) => {
		let i = t.transaction(f, "readwrite");
		i.objectStore(f).put(e), i.oncomplete = () => n(), i.onerror = () => r(i.error);
	});
}
async function it(e) {
	let t = await D();
	return new Promise((n, r) => {
		let i = t.transaction(g, "readwrite");
		i.objectStore(g).put(e), i.oncomplete = () => n(), i.onerror = () => r(i.error);
	});
}
async function at(e, t = 0, n = 50) {
	let r = await D();
	return new Promise((i, a) => {
		let o = r.transaction(g, "readonly").objectStore(g).index("conversationId_sequence"), s = IDBKeyRange.bound([e, 0], [e, Infinity]), c = o.count(s);
		c.onsuccess = () => {
			let e = c.result, r = o.openCursor(s, "prev"), l = [], u = 0;
			r.onsuccess = () => {
				let a = r.result;
				if (!a) {
					i({
						messages: l,
						total: e
					});
					return;
				}
				if (u < t) {
					u++, a.continue();
					return;
				}
				l.length < n ? (l.push(a.value), a.continue()) : i({
					messages: l,
					total: e
				});
			}, r.onerror = () => a(r.error);
		}, c.onerror = () => a(c.error);
	});
}
async function ot(e) {
	let t = await D();
	return new Promise((n, r) => {
		let i = t.transaction(g, "readwrite"), a = i.objectStore(g), o = e.sequence, s = a.get(e.id);
		s.onsuccess = () => {
			let t = s.result;
			if (t) {
				o = t.sequence, a.put({
					...e,
					sequence: o
				});
				return;
			}
			let n = a.index("conversationId_sequence"), i = IDBKeyRange.bound([e.conversationId, 0], [e.conversationId, Infinity]), c = n.openCursor(i, "prev");
			c.onsuccess = () => {
				let t = c.result;
				o = t ? t.value.sequence + 1 : 0, a.put({
					...e,
					sequence: o
				});
			}, c.onerror = () => r(c.error);
		}, s.onerror = () => r(s.error), i.oncomplete = () => n(o), i.onerror = () => r(i.error);
	});
}
async function st(e) {
	let t = await D();
	return new Promise((n, r) => {
		let i = t.transaction(g, "readwrite"), a = i.objectStore(g).index("conversationId_sequence"), o = IDBKeyRange.bound([e, 0], [e, Infinity]), s = a.openCursor(o);
		s.onsuccess = () => {
			let e = s.result;
			e && (e.delete(), e.continue());
		}, s.onerror = () => r(s.error), i.oncomplete = () => n(), i.onerror = () => r(i.error);
	});
}
async function ct(e) {
	let t = await D();
	return new Promise((n, r) => {
		let i = t.transaction(_, "readwrite");
		i.objectStore(_).put(e), i.oncomplete = () => n(), i.onerror = () => r(i.error);
	});
}
async function lt(e) {
	let t = await D();
	return new Promise((n, r) => {
		let i = t.transaction(_, "readonly").objectStore(_).index("projectId_updatedAt"), a = IDBKeyRange.bound([e, 0], [e, Infinity]), o = i.getAll(a);
		o.onsuccess = () => n(o.result), o.onerror = () => r(o.error);
	});
}
async function ut(e) {
	let t = await D();
	return new Promise((n, r) => {
		let i = t.transaction(_, "readwrite");
		i.objectStore(_).delete(e), i.oncomplete = () => n(), i.onerror = () => r(i.error);
	});
}
async function dt(e) {
	let t = await D();
	return new Promise((n, r) => {
		let i = t.transaction(_, "readwrite"), a = i.objectStore(_).index("conversationId_updatedAt"), o = IDBKeyRange.bound([e, 0], [e, Infinity]), s = a.openCursor(o);
		s.onsuccess = () => {
			let e = s.result;
			e && (e.delete(), e.continue());
		}, s.onerror = () => r(s.error), i.oncomplete = () => n(), i.onerror = () => r(i.error);
	});
}
async function ft(e) {
	let t = await D();
	return new Promise((n, r) => {
		let i = t.transaction(_, "readwrite"), a = i.objectStore(_).index("projectId_updatedAt"), o = IDBKeyRange.bound([e, 0], [e, Infinity]), s = a.openCursor(o);
		s.onsuccess = () => {
			let e = s.result;
			e && (e.delete(), e.continue());
		}, s.onerror = () => r(s.error), i.oncomplete = () => n(), i.onerror = () => r(i.error);
	});
}
async function pt(e) {
	let t = await D();
	return new Promise((n, r) => {
		let i = t.transaction(v, "readwrite");
		i.objectStore(v).put(e), i.oncomplete = () => n(), i.onerror = () => r(i.error);
	});
}
async function Q(e) {
	let t = await D();
	return new Promise((n, r) => {
		let i = t.transaction(v, "readonly").objectStore(v).index("projectId_updatedAt"), a = IDBKeyRange.bound([e, 0], [e, Infinity]), o = i.getAll(a);
		o.onsuccess = () => n(o.result), o.onerror = () => r(o.error);
	});
}
async function mt(e) {
	let t = await D();
	return new Promise((n, r) => {
		let i = t.transaction(v, "readwrite");
		i.objectStore(v).delete(e), i.oncomplete = () => n(), i.onerror = () => r(i.error);
	});
}
async function ht(e) {
	let t = await D();
	return new Promise((n, r) => {
		let i = t.transaction(v, "readwrite"), a = i.objectStore(v).index("projectId_updatedAt"), o = IDBKeyRange.bound([e, 0], [e, Infinity]), s = a.openCursor(o);
		s.onsuccess = () => {
			let e = s.result;
			e && (e.delete(), e.continue());
		}, s.onerror = () => r(s.error), i.oncomplete = () => n(), i.onerror = () => r(i.error);
	});
}
async function gt(e) {
	let t = await D();
	return new Promise((n, r) => {
		let i = t.transaction(v, "readwrite"), a = i.objectStore(v).index("conversationId").openCursor(IDBKeyRange.only(e));
		a.onsuccess = () => {
			let e = a.result;
			if (e) {
				let t = e.value;
				t.source.unavailable || e.update({
					...t,
					source: {
						...t.source,
						unavailable: !0
					}
				}), e.continue();
			}
		}, a.onerror = () => r(a.error), i.oncomplete = () => n(), i.onerror = () => r(i.error);
	});
}
var $ = "layouts";
async function _t(e) {
	let t = await D();
	return new Promise((n, r) => {
		let i = t.transaction(y, "readwrite");
		i.objectStore(y).put({
			id: $,
			data: e
		}), i.oncomplete = () => n(), i.onerror = () => r(i.error);
	});
}
async function vt() {
	let e = await D();
	return new Promise((t, n) => {
		let r = e.transaction(y, "readonly").objectStore(y).get($);
		r.onsuccess = () => t(r.result?.data ?? null), r.onerror = () => n(r.error);
	});
}
async function yt(e, t) {
	let n = await D();
	return new Promise((r, i) => {
		let a = n.transaction(w, "readonly").objectStore(w).index("projectId_fingerprint").get([e, t]);
		a.onsuccess = () => r(a.result), a.onerror = () => i(a.error);
	});
}
async function bt(e) {
	let t = await D();
	return new Promise((n, r) => {
		let i = t.transaction(w, "readwrite");
		i.objectStore(w).put(e), i.oncomplete = () => n(), i.onerror = () => r(i.error);
	});
}
//#endregion
export { Se as $, Qe as A, re as At, Ze as B, Le as C, se as Ct, ze as D, ne as Dt, $e as E, N as Et, gt as F, Pe as G, ot as H, He as I, we as J, pt as K, ct as L, yt as M, fe as Mt, Ve as N, le as Nt, lt as O, te as Ot, vt as P, M as Pt, Ce as Q, rt as R, Re as S, ie as St, Ue as T, ue as Tt, Te as U, it as V, Fe as W, We as X, _t as Y, xe as Z, Ae as _, ce as _t, Xe as a, W as at, nt as b, ee as bt, De as c, G as ct, ft as d, ve as dt, z as et, ke as f, ye as ft, Ee as g, ae as gt, Je as h, R as ht, ut as i, ge as it, Q as j, oe as jt, je as k, I as kt, Ie as l, me as lt, mt as m, be as mt, Ke as n, pe as nt, dt as o, he as ot, ht as p, U as pt, bt as q, Oe as r, _e as rt, st as s, V as st, Ge as t, B as tt, qe as u, H as ut, et as v, F as vt, Be as w, P as wt, at as x, L as xt, tt as y, de as yt, Ye as z };
