//#region src/services/indexedDb/schema.ts
var e = "ai-canvas-db", t = "projects", n = "workflows", r = "config", i = "presets", a = "history", o = "assetMeta", s = "assetMetaV2", c = "assetIndex", l = "styles", u = "skills", d = "chatConversations", f = "chatMessages", p = "agentTasks", m = "projectMemories", h = "toolbarLayouts", g = "metadata", _ = "globalCharacters", v = "subAgentProfiles", y = "videoEditorProjects", b = "projectVisualDescriptions", x = "plugins", S = null;
function C() {
	return S || (S = new Promise((S, C) => {
		let w = indexedDB.open(e, 20);
		w.onupgradeneeded = () => {
			let e = w.result;
			e.objectStoreNames.contains("projects") || e.createObjectStore(t, { keyPath: "id" }), e.objectStoreNames.contains("workflows") || e.createObjectStore(n, { keyPath: "id" }), e.objectStoreNames.contains("config") || e.createObjectStore(r, { keyPath: "id" }), e.objectStoreNames.contains("presets") || e.createObjectStore(i, { keyPath: "id" });
			let S = e.objectStoreNames.contains("history") ? w.transaction.objectStore(a) : e.createObjectStore(a, { keyPath: "id" });
			if (S.indexNames.contains("timestamp_id") || S.createIndex("timestamp_id", ["timestamp", "id"], { unique: !1 }), S.indexNames.contains("nodeId") || S.createIndex("nodeId", "nodeId", { unique: !1 }), S.indexNames.contains("projectId_timestamp_id") || S.createIndex("projectId_timestamp_id", [
				"projectId",
				"timestamp",
				"id"
			], { unique: !1 }), S.indexNames.contains("projectId_nodeId") || S.createIndex("projectId_nodeId", ["projectId", "nodeId"], { unique: !1 }), e.objectStoreNames.contains("assetMeta") || e.createObjectStore(o, { keyPath: "path" }), e.objectStoreNames.contains("assetMetaV2") || e.createObjectStore(s, { keyPath: "assetId" }), !e.objectStoreNames.contains("assetIndex")) {
				let t = e.createObjectStore(c, { keyPath: "assetId" });
				t.createIndex("path", "path", { unique: !0 }), t.createIndex("fingerprint", "fingerprint", { unique: !1 });
			}
			if (e.objectStoreNames.contains("styles") || e.createObjectStore(l, { keyPath: "id" }), e.objectStoreNames.contains("skills") || e.createObjectStore(u, { keyPath: "id" }), !e.objectStoreNames.contains("chatConversations")) {
				let t = e.createObjectStore(d, { keyPath: "id" });
				t.createIndex("projectId_updatedAt", ["projectId", "updatedAt"], { unique: !1 }), t.createIndex("deletedAt", "deletedAt", { unique: !1 }), t.createIndex("pinned", "pinned", { unique: !1 });
			}
			if (!e.objectStoreNames.contains("chatMessages")) {
				let t = e.createObjectStore(f, { keyPath: "id" });
				t.createIndex("conversationId_sequence", ["conversationId", "sequence"], { unique: !1 }), t.createIndex("requestId", "requestId", { unique: !1 });
			}
			if (!e.objectStoreNames.contains("agentTasks")) {
				let t = e.createObjectStore(p, { keyPath: "id" });
				t.createIndex("projectId_updatedAt", ["projectId", "updatedAt"], { unique: !1 }), t.createIndex("conversationId_updatedAt", ["conversationId", "updatedAt"], { unique: !1 }), t.createIndex("status", "status", { unique: !1 });
			}
			if (e.objectStoreNames.contains("toolbarLayouts") || e.createObjectStore(h, { keyPath: "id" }), !e.objectStoreNames.contains("projectMemories")) {
				let t = e.createObjectStore(m, { keyPath: "id" });
				t.createIndex("projectId_updatedAt", ["projectId", "updatedAt"], { unique: !1 }), t.createIndex("conversationId", "source.conversationId", { unique: !1 });
			}
			if (e.objectStoreNames.contains("metadata") || e.createObjectStore(g, { keyPath: "id" }), e.objectStoreNames.contains("globalCharacters") || e.createObjectStore(_, { keyPath: "id" }).createIndex("updatedAt", "updatedAt", { unique: !1 }), e.objectStoreNames.contains("subAgentProfiles") || e.createObjectStore(v, { keyPath: "id" }).createIndex("updatedAt", "updatedAt", { unique: !1 }), !e.objectStoreNames.contains("videoEditorProjects")) {
				let t = e.createObjectStore(y, { keyPath: "id" });
				t.createIndex("projectId_updatedAt", ["projectId", "updatedAt"], { unique: !1 }), t.createIndex("nodeId", "nodeId", { unique: !1 });
			}
			if (!e.objectStoreNames.contains("projectVisualDescriptions")) {
				let t = e.createObjectStore(b, { keyPath: "id" });
				t.createIndex("projectId_updatedAt", ["projectId", "updatedAt"], { unique: !1 }), t.createIndex("projectId_fingerprint", ["projectId", "fingerprint"], { unique: !0 });
			}
			e.objectStoreNames.contains("plugins") || e.createObjectStore(x, { keyPath: "id" });
		}, w.onsuccess = () => S(w.result), w.onerror = () => C(w.error);
	}), S);
}
//#endregion
//#region src/services/indexedDb/catalogRepository.ts
var w = "app-config";
function T(e, t) {
	return C().then((n) => new Promise((r, i) => {
		let a = n.transaction(e, "readwrite");
		a.objectStore(e).put(t), a.oncomplete = () => r(), a.onerror = () => i(a.error);
	}));
}
function E(e) {
	return C().then((t) => new Promise((n, r) => {
		let i = t.transaction(e, "readonly").objectStore(e).getAll();
		i.onsuccess = () => n(i.result), i.onerror = () => r(i.error);
	}));
}
function D(e, t) {
	return C().then((n) => new Promise((r, i) => {
		let a = n.transaction(e, "readwrite");
		a.objectStore(e).delete(t), a.oncomplete = () => r(), a.onerror = () => i(a.error);
	}));
}
var O = (e) => T(n, e), k = () => E(n), A = (e) => D(n, e), j = (e) => T(r, {
	id: w,
	data: e
});
async function M() {
	let e = await C();
	return new Promise((t, n) => {
		let i = e.transaction(r, "readonly").objectStore(r).get(w);
		i.onsuccess = () => t(i.result?.data ?? null), i.onerror = () => n(i.error);
	});
}
var ee = (e) => T(i, e), te = () => E(i), ne = (e) => D(i, e), re = (e) => T(u, e), ie = () => E(u), ae = (e) => D(u, e), oe = (e) => T(v, e), se = () => E(v), ce = (e) => D(v, e), le = (e) => T(l, e), N = () => E(l), P = (e) => D(l, e), F = (e) => T(x, e), I = () => E(x), L = (e) => D(x, e), R = {
	content: "输入文字",
	fontFamily: "system-ui, -apple-system, \"Segoe UI\", sans-serif",
	fontSize: 64,
	color: "#ffffff",
	fontWeight: 600,
	align: "center"
}, z = {
	x: .5,
	y: .5,
	scale: 1,
	rotation: 0,
	opacity: 1
};
function B(e) {
	return Math.max(0, e.sourceOut - e.sourceIn);
}
function V(e) {
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
		return t += B(e), n;
	});
}
function W(e, t) {
	for (let n = 0; n < e.length; n += 1) {
		let r = e[n], i = r.timelineStart + B(r), a = n === e.length - 1 ? t <= i : t < i;
		if (t >= r.timelineStart && a) return {
			clip: r,
			index: n
		};
	}
	return null;
}
function ue(e) {
	let t = H(e);
	return e.filter((e) => e !== t && e.kind !== "caption");
}
function G(e) {
	return e.timelineStart + B(e);
}
function de(e, t) {
	return e.clips.filter((e) => t >= e.timelineStart && t < G(e));
}
function fe(e, t) {
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
function pe(e, t) {
	let n = e.transitionIn;
	return !n || n.kind === "none" || n.duration <= 0 || t >= n.duration ? 1 : Math.max(0, Math.min(1, t / n.duration));
}
function me(e) {
	let t = e.filter((e) => !!e && e.width > 0 && e.height > 0);
	if (t.length < 2) return !1;
	let [n] = t;
	return t.some((e) => e.codec !== n.codec || e.width !== n.width || e.height !== n.height);
}
function he(e) {
	let t = e.filter((e) => !e.hidden);
	return t.filter((e) => e.kind === "video").length > 1 ? !0 : t.some((e) => e.clips.some((e) => e.kind === "image" || e.kind === "text" || !!e.transitionIn && e.transitionIn.kind !== "none" && e.transitionIn.duration > 0 || !!e.transform && (e.transform.x !== z.x || e.transform.y !== z.y || e.transform.scale !== z.scale || e.transform.rotation !== z.rotation || e.transform.opacity !== z.opacity)));
}
var K = .05;
function ge(e, t) {
	let n = W(e, t);
	if (!n) return null;
	let { clip: r, index: i } = n, a = t - r.timelineStart, o = B(r);
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
function _e(e, t) {
	return `${e}::${t}`;
}
async function ve(e) {
	let t = await C();
	return new Promise((n, r) => {
		let i = t.transaction(y, "readwrite");
		i.objectStore(y).put(e), i.oncomplete = () => n(), i.onerror = () => r(i.error);
	});
}
async function ye(e) {
	let t = await C(), n = await new Promise((n, r) => {
		let i = t.transaction(y, "readonly").objectStore(y).get(e);
		i.onsuccess = () => n(i.result), i.onerror = () => r(i.error);
	});
	return !n || (n.schemaVersion ?? 0) > 1 ? null : n;
}
//#endregion
//#region src/services/indexedDbService.ts
var q = "last-active-project";
async function be(e) {
	let n = await C();
	return new Promise((r, i) => {
		let a = n.transaction(t, "readwrite"), o = a.objectStore(t).put(e), s = !1, c = (t) => {
			s || (s = !0, i(t ?? /* @__PURE__ */ Error(`项目 ${e.id} 的 IndexedDB 写入失败`)));
		};
		o.onerror = () => c(o.error), a.oncomplete = () => {
			s || (s = !0, r());
		}, a.onerror = () => c(a.error), a.onabort = () => c(a.error);
	});
}
async function xe(e) {
	let t = await C();
	return new Promise((n, r) => {
		let i = t.transaction(_, "readwrite");
		i.objectStore(_).put(e), i.oncomplete = () => n(), i.onerror = () => r(i.error), i.onabort = () => r(i.error ?? /* @__PURE__ */ Error(`全局角色 ${e.id} 保存失败`));
	});
}
async function Se() {
	let e = await C();
	return new Promise((t, n) => {
		let r = e.transaction(_, "readonly").objectStore(_).getAll();
		r.onsuccess = () => t(r.result), r.onerror = () => n(r.error);
	});
}
async function Ce(e) {
	let t = await C();
	return new Promise((n, r) => {
		let i = t.transaction(_, "readwrite");
		i.objectStore(_).delete(e), i.oncomplete = () => n(), i.onerror = () => r(i.error);
	});
}
async function we() {
	let e = await C();
	return new Promise((t, n) => {
		let r = e.transaction(_, "readwrite");
		r.objectStore(_).clear(), r.oncomplete = () => t(), r.onerror = () => n(r.error);
	});
}
async function Te(e) {
	let n = await C();
	return new Promise((r, i) => {
		let o = n.transaction([
			t,
			d,
			f,
			p,
			m,
			b,
			a
		], "readwrite");
		o.objectStore(t).delete(e);
		let s = o.objectStore(d), c = IDBKeyRange.bound([e, 0], [e, Infinity]), l = s.index("projectId_updatedAt").openCursor(c);
		l.onsuccess = () => {
			let e = l.result;
			e && (e.delete(), e.continue());
		};
		let u = o.objectStore(f).openCursor();
		u.onsuccess = () => {
			let t = u.result;
			t && (t.value.projectId === e && t.delete(), t.continue());
		};
		let h = IDBKeyRange.bound([e, 0], [e, Infinity]), g = o.objectStore(p).index("projectId_updatedAt").openCursor(h);
		g.onsuccess = () => {
			let e = g.result;
			e && (e.delete(), e.continue());
		};
		let _ = IDBKeyRange.bound([e, 0], [e, Infinity]), v = o.objectStore(m).index("projectId_updatedAt").openCursor(_);
		v.onsuccess = () => {
			let e = v.result;
			e && (e.delete(), e.continue());
		};
		let y = o.objectStore(a).index("projectId_timestamp_id").openCursor(Y(e));
		y.onsuccess = () => {
			let e = y.result;
			e && (e.delete(), e.continue());
		};
		let x = IDBKeyRange.bound([e, 0], [e, Infinity]), S = o.objectStore(b).index("projectId_updatedAt").openCursor(x);
		S.onsuccess = () => {
			let e = S.result;
			e && (e.delete(), e.continue());
		}, o.oncomplete = () => r(), o.onerror = () => i(o.error), o.onabort = () => i(o.error ?? /* @__PURE__ */ Error(`删除项目 ${e} 的持久化数据失败`));
	});
}
async function Ee() {
	let e = await C();
	return new Promise((n, r) => {
		let i = e.transaction(t, "readonly").objectStore(t).getAll();
		i.onsuccess = () => n(i.result), i.onerror = () => r(i.error);
	});
}
async function De(e) {
	let n = await C();
	return new Promise((r, i) => {
		let a = n.transaction(t, "readonly").objectStore(t).get(e);
		a.onsuccess = () => r(a.result), a.onerror = () => i(a.error);
	});
}
var J = "output-history-v1:", Oe = 16;
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
		e && (r >= Oe ? e.delete() : r += 1, e.continue());
	};
}
async function ke(e) {
	let t = await C();
	return new Promise((n, r) => {
		let i = t.transaction(a, "readwrite");
		X(i.objectStore(a), e), i.oncomplete = () => n(), i.onerror = () => r(i.error);
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
async function Ae(e) {
	let t = await C();
	return new Promise((n, r) => {
		let i = t.transaction(a, "readwrite"), o = i.objectStore(a);
		o.put(e), X(o, e.projectId), i.oncomplete = () => n(), i.onerror = () => r(i.error);
	});
}
async function je(e) {
	if (e.length === 0) return;
	let t = await C();
	return new Promise((n, r) => {
		let i = t.transaction(a, "readwrite"), o = i.objectStore(a);
		for (let t of e) o.put(t);
		for (let t of new Set(e.map((e) => e.projectId))) X(o, t);
		i.oncomplete = () => n(), i.onerror = () => r(i.error);
	});
}
async function Me(e, t) {
	let n = await C();
	return new Promise((r, i) => {
		let o = n.transaction(a, "readwrite"), s = o.objectStore(a), c = s.get(t);
		c.onsuccess = () => {
			c.result?.projectId === e && s.delete(t);
		}, o.oncomplete = () => r(), o.onerror = () => i(o.error);
	});
}
async function Ne(e, t, n = null, r = {}) {
	let i = await C();
	return new Promise((o, s) => {
		let c = i.transaction(a, "readonly").objectStore(a).index("projectId_timestamp_id").openCursor(Y(e, n), "prev"), l = [], u = null;
		c.onsuccess = () => {
			let e = c.result;
			if (!e) {
				o({
					records: l,
					nextCursor: null,
					hasMore: !1
				});
				return;
			}
			if (l.length >= t) {
				o({
					records: l,
					nextCursor: u,
					hasMore: !0
				});
				return;
			}
			let n = e.value;
			Z(n, r) && (l.push(n), u = {
				timestamp: n.timestamp,
				id: n.id
			}), e.continue();
		}, c.onerror = () => s(c.error);
	});
}
async function Pe(e, t = {}) {
	let n = await C();
	return new Promise((r, i) => {
		let o = n.transaction(a, "readonly").objectStore(a).index("projectId_timestamp_id").openCursor(Y(e), "prev"), s = [];
		o.onsuccess = () => {
			let e = o.result;
			if (!e) {
				r(s);
				return;
			}
			let n = e.value;
			Z(n, t) && s.push(n), e.continue();
		}, o.onerror = () => i(o.error);
	});
}
async function Fe(e, t) {
	let n = await C();
	return new Promise((r, i) => {
		let o = n.transaction(a, "readonly").objectStore(a).index("projectId_nodeId").getAll(IDBKeyRange.only([e, t]));
		o.onsuccess = () => {
			r(o.result.sort((e, t) => t.timestamp - e.timestamp || t.id.localeCompare(e.id)));
		}, o.onerror = () => i(o.error);
	});
}
async function Ie(e) {
	let t = await C();
	return new Promise((n, r) => {
		let i = t.transaction(a, "readonly").objectStore(a).index("projectId_timestamp_id").count(Y(e));
		i.onsuccess = () => n(i.result), i.onerror = () => r(i.error);
	});
}
async function Le(e) {
	let t = await C();
	return new Promise((n, r) => {
		let i = t.transaction(g, "readonly").objectStore(g).get(`${J}${e}`);
		i.onsuccess = () => n(!!i.result), i.onerror = () => r(i.error);
	});
}
async function Re(e) {
	let t = await C();
	return new Promise((n, r) => {
		let i = t.transaction(g, "readwrite");
		i.objectStore(g).put({
			id: `${J}${e}`,
			completedAt: Date.now()
		}), i.oncomplete = () => n(), i.onerror = () => r(i.error);
	});
}
async function ze() {
	let e = await C();
	return new Promise((t, n) => {
		let r = e.transaction(g, "readonly").objectStore(g).get(q);
		r.onsuccess = () => {
			let e = r.result?.projectId;
			t(typeof e == "string" && e.trim() ? e : null);
		}, r.onerror = () => n(r.error);
	});
}
async function Be(e) {
	let t = await C();
	return new Promise((n, r) => {
		let i = t.transaction(g, "readwrite");
		i.objectStore(g).put({
			id: q,
			projectId: e,
			updatedAt: Date.now()
		}), i.oncomplete = () => n(), i.onerror = () => r(i.error), i.onabort = () => r(i.error);
	});
}
async function Ve(e, t) {
	let n = [...new Set(t)];
	if (n.length === 0) return;
	let r = await C();
	await new Promise((t, i) => {
		let o = r.transaction(a, "readwrite"), s = o.objectStore(a).index("nodeId");
		for (let t of n) {
			let n = s.openCursor(IDBKeyRange.only(t));
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
		o.oncomplete = () => t(), o.onerror = () => i(o.error);
	}), await ke(e);
}
async function He(e) {
	let t = await C();
	return new Promise((n, r) => {
		let i = t.transaction(a, "readwrite"), o = i.objectStore(a).index("projectId_timestamp_id").openCursor(Y(e));
		o.onsuccess = () => {
			let e = o.result;
			e && (e.delete(), e.continue());
		}, i.oncomplete = () => n(), i.onerror = () => r(i.error);
	});
}
async function Ue(e, t) {
	let n = await C();
	return new Promise((r, i) => {
		let o = n.transaction(a, "readwrite"), s = o.objectStore(a).index("projectId_nodeId").openCursor(IDBKeyRange.only([e, t]));
		s.onsuccess = () => {
			let e = s.result;
			e && (e.delete(), e.continue());
		}, s.onerror = () => i(s.error), o.oncomplete = () => r(), o.onerror = () => i(o.error);
	});
}
async function We() {
	let e = await C();
	return new Promise((t, n) => {
		let r = e.transaction(s, "readonly").objectStore(s).getAll();
		r.onsuccess = () => t(r.result), r.onerror = () => n(r.error);
	});
}
async function Ge(e) {
	let t = await C();
	return new Promise((n, r) => {
		let i = t.transaction(s, "readwrite");
		i.objectStore(s).put(e), i.oncomplete = () => n(), i.onerror = () => r(i.error);
	});
}
async function Ke(e) {
	let t = await C();
	return new Promise((n, r) => {
		let i = t.transaction(s, "readwrite");
		i.objectStore(s).delete(e), i.oncomplete = () => n(), i.onerror = () => r(i.error);
	});
}
async function qe(e) {
	let t = await C();
	return new Promise((n, r) => {
		let i = t.transaction(d, "readwrite");
		i.objectStore(d).put(e), i.oncomplete = () => n(), i.onerror = () => r(i.error);
	});
}
async function Je(e) {
	let t = await C();
	return new Promise((n, r) => {
		let i = t.transaction(d, "readonly").objectStore(d).index("projectId_updatedAt"), a = IDBKeyRange.bound([e, 0], [e, Infinity]), o = i.getAll(a);
		o.onsuccess = () => {
			let e = o.result;
			n(e.filter((e) => !e.deletedAt));
		}, o.onerror = () => r(o.error);
	});
}
async function Ye(e) {
	let t = await C();
	return new Promise((n, r) => {
		let i = t.transaction(o, "readonly").objectStore(o).get(e);
		i.onsuccess = () => n(i.result), i.onerror = () => r(i.error);
	});
}
async function Xe(e) {
	let t = await C();
	return new Promise((n, r) => {
		let i = t.transaction(c, "readonly").objectStore(c).get(e);
		i.onsuccess = () => n(i.result), i.onerror = () => r(i.error);
	});
}
async function Ze(e) {
	let t = await C();
	return new Promise((n, r) => {
		let i = t.transaction(c, "readonly").objectStore(c).index("path").get(e);
		i.onsuccess = () => n(i.result), i.onerror = () => r(i.error);
	});
}
async function Qe(e) {
	let t = await C();
	return new Promise((n, r) => {
		let i = t.transaction(c, "readonly").objectStore(c).index("fingerprint").getAll(e);
		i.onsuccess = () => n(i.result), i.onerror = () => r(i.error);
	});
}
async function $e(e) {
	let t = await C();
	return new Promise((n, r) => {
		let i = t.transaction(c, "readwrite");
		i.objectStore(c).put(e), i.oncomplete = () => n(), i.onerror = () => r(i.error);
	});
}
async function et(e) {
	let t = await C();
	return new Promise((n, r) => {
		let i = t.transaction(f, "readwrite");
		i.objectStore(f).put(e), i.oncomplete = () => n(), i.onerror = () => r(i.error);
	});
}
async function tt(e, t = 0, n = 50) {
	let r = await C();
	return new Promise((i, a) => {
		let o = r.transaction(f, "readonly").objectStore(f).index("conversationId_sequence"), s = IDBKeyRange.bound([e, 0], [e, Infinity]), c = o.count(s);
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
async function nt(e) {
	let t = await C();
	return new Promise((n, r) => {
		let i = t.transaction(f, "readwrite"), a = i.objectStore(f), o = e.sequence, s = a.get(e.id);
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
async function Q(e) {
	let t = await C();
	return new Promise((n, r) => {
		let i = t.transaction(f, "readwrite"), a = i.objectStore(f).index("conversationId_sequence"), o = IDBKeyRange.bound([e, 0], [e, Infinity]), s = a.openCursor(o);
		s.onsuccess = () => {
			let e = s.result;
			e && (e.delete(), e.continue());
		}, s.onerror = () => r(s.error), i.oncomplete = () => n(), i.onerror = () => r(i.error);
	});
}
async function rt(e) {
	let t = await C();
	return new Promise((n, r) => {
		let i = t.transaction(p, "readwrite");
		i.objectStore(p).put(e), i.oncomplete = () => n(), i.onerror = () => r(i.error);
	});
}
async function it(e) {
	let t = await C();
	return new Promise((n, r) => {
		let i = t.transaction(p, "readonly").objectStore(p).index("projectId_updatedAt"), a = IDBKeyRange.bound([e, 0], [e, Infinity]), o = i.getAll(a);
		o.onsuccess = () => n(o.result), o.onerror = () => r(o.error);
	});
}
async function at(e) {
	let t = await C();
	return new Promise((n, r) => {
		let i = t.transaction(p, "readwrite");
		i.objectStore(p).delete(e), i.oncomplete = () => n(), i.onerror = () => r(i.error);
	});
}
async function ot(e) {
	let t = await C();
	return new Promise((n, r) => {
		let i = t.transaction(p, "readwrite"), a = i.objectStore(p).index("conversationId_updatedAt"), o = IDBKeyRange.bound([e, 0], [e, Infinity]), s = a.openCursor(o);
		s.onsuccess = () => {
			let e = s.result;
			e && (e.delete(), e.continue());
		}, s.onerror = () => r(s.error), i.oncomplete = () => n(), i.onerror = () => r(i.error);
	});
}
async function st(e) {
	let t = await C();
	return new Promise((n, r) => {
		let i = t.transaction(p, "readwrite"), a = i.objectStore(p).index("projectId_updatedAt"), o = IDBKeyRange.bound([e, 0], [e, Infinity]), s = a.openCursor(o);
		s.onsuccess = () => {
			let e = s.result;
			e && (e.delete(), e.continue());
		}, s.onerror = () => r(s.error), i.oncomplete = () => n(), i.onerror = () => r(i.error);
	});
}
async function ct(e) {
	let t = await C();
	return new Promise((n, r) => {
		let i = t.transaction(m, "readwrite");
		i.objectStore(m).put(e), i.oncomplete = () => n(), i.onerror = () => r(i.error);
	});
}
async function lt(e) {
	let t = await C();
	return new Promise((n, r) => {
		let i = t.transaction(m, "readonly").objectStore(m).index("projectId_updatedAt"), a = IDBKeyRange.bound([e, 0], [e, Infinity]), o = i.getAll(a);
		o.onsuccess = () => n(o.result), o.onerror = () => r(o.error);
	});
}
async function ut(e) {
	let t = await C();
	return new Promise((n, r) => {
		let i = t.transaction(m, "readwrite");
		i.objectStore(m).delete(e), i.oncomplete = () => n(), i.onerror = () => r(i.error);
	});
}
async function dt(e) {
	let t = await C();
	return new Promise((n, r) => {
		let i = t.transaction(m, "readwrite"), a = i.objectStore(m).index("projectId_updatedAt"), o = IDBKeyRange.bound([e, 0], [e, Infinity]), s = a.openCursor(o);
		s.onsuccess = () => {
			let e = s.result;
			e && (e.delete(), e.continue());
		}, s.onerror = () => r(s.error), i.oncomplete = () => n(), i.onerror = () => r(i.error);
	});
}
async function ft(e) {
	let t = await C();
	return new Promise((n, r) => {
		let i = t.transaction(m, "readwrite"), a = i.objectStore(m).index("conversationId").openCursor(IDBKeyRange.only(e));
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
async function pt(e) {
	let t = await C();
	return new Promise((n, r) => {
		let i = t.transaction(h, "readwrite");
		i.objectStore(h).put({
			id: $,
			data: e
		}), i.oncomplete = () => n(), i.onerror = () => r(i.error);
	});
}
async function mt() {
	let e = await C();
	return new Promise((t, n) => {
		let r = e.transaction(h, "readonly").objectStore(h).get($);
		r.onsuccess = () => t(r.result?.data ?? null), r.onerror = () => n(r.error);
	});
}
async function ht(e, t) {
	let n = await C();
	return new Promise((r, i) => {
		let a = n.transaction(b, "readonly").objectStore(b).index("projectId_fingerprint").get([e, t]);
		a.onsuccess = () => r(a.result), a.onerror = () => i(a.error);
	});
}
async function gt(e) {
	let t = await C();
	return new Promise((n, r) => {
		let i = t.transaction(b, "readwrite");
		i.objectStore(b).put(e), i.oncomplete = () => n(), i.onerror = () => r(i.error);
	});
}
//#endregion
export { ve as $, Je as A, ee as At, qe as B, Ne as C, ie as Ct, Fe as D, M as Dt, Ye as E, k as Et, ft as F, Ae as G, nt as H, Re as I, be as J, ct as K, rt as L, ht as M, le as Mt, Le as N, oe as Nt, it as O, j as Ot, mt as P, O as Pt, ye as Q, $e as R, Pe as S, te as St, ze as T, se as Tt, xe as U, et as V, je as W, Be as X, pt as Y, _e as Z, Ee as _, ae as _t, Ke as a, W as at, Qe as b, A as bt, Ce as c, G as ct, st as d, me as dt, R as et, Te as f, he as ft, Se as g, ne as gt, We as h, L as ht, at as i, fe as it, lt as j, re as jt, De as k, F as kt, Me as l, ue as lt, ut as m, ge as mt, He as n, V as nt, ot as o, de as ot, dt as p, U as pt, gt as q, we as r, pe as rt, Q as s, B as st, Ve as t, z as tt, Ue as u, H as ut, Xe as v, P as vt, Ie as w, N as wt, tt as x, I as xt, Ze as y, ce as yt, Ge as z };
