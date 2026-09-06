import { i as e } from "./react-Dfufv8pq.js";
import { a as t, n, t as r } from "./core-D3lATfku.js";
import { t as i } from "./path-gl9BKl4b.js";
//#region node_modules/@tauri-apps/plugin-fs/dist-js/index.js
var a = /* @__PURE__ */ e({
	BaseDirectory: () => i,
	FileHandle: () => l,
	SeekMode: () => o,
	copyFile: () => f,
	create: () => u,
	exists: () => T,
	lstat: () => x,
	mkdir: () => p,
	open: () => d,
	readDir: () => m,
	readFile: () => h,
	readTextFile: () => g,
	readTextFileLines: () => _,
	remove: () => v,
	rename: () => y,
	size: () => A,
	startAccessingSecurityScopedResource: () => j,
	stat: () => b,
	stopAccessingSecurityScopedResource: () => M,
	truncate: () => S,
	watch: () => O,
	watchImmediate: () => k,
	writeFile: () => C,
	writeTextFile: () => w
}), o;
(function(e) {
	e[e.Start = 0] = "Start", e[e.Current = 1] = "Current", e[e.End = 2] = "End";
})(o ||= {});
function s(e) {
	return {
		isFile: e.isFile,
		isDirectory: e.isDirectory,
		isSymlink: e.isSymlink,
		size: e.size,
		mtime: e.mtime === null ? null : new Date(e.mtime),
		atime: e.atime === null ? null : new Date(e.atime),
		birthtime: e.birthtime === null ? null : new Date(e.birthtime),
		readonly: e.readonly,
		fileAttributes: e.fileAttributes,
		dev: e.dev,
		ino: e.ino,
		mode: e.mode,
		nlink: e.nlink,
		uid: e.uid,
		gid: e.gid,
		rdev: e.rdev,
		blksize: e.blksize,
		blocks: e.blocks
	};
}
function c(e) {
	let t = new Uint8ClampedArray(e), n = t.byteLength, r = 0;
	for (let e = 0; e < n; e++) {
		let n = t[e];
		r *= 256, r += n;
	}
	return r;
}
var l = class extends n {
	async read(e) {
		if (e.byteLength === 0) return 0;
		let n = await t("plugin:fs|read", {
			rid: this.rid,
			len: e.byteLength
		}), r = c(n.slice(-8)), i = n instanceof ArrayBuffer ? new Uint8Array(n) : n;
		return e.set(i.slice(0, i.length - 8)), r === 0 ? null : r;
	}
	async seek(e, n) {
		return await t("plugin:fs|seek", {
			rid: this.rid,
			offset: e,
			whence: n
		});
	}
	async stat() {
		return s(await t("plugin:fs|fstat", { rid: this.rid }));
	}
	async truncate(e) {
		await t("plugin:fs|ftruncate", {
			rid: this.rid,
			len: e
		});
	}
	async write(e) {
		return await t("plugin:fs|write", {
			rid: this.rid,
			data: e
		});
	}
};
async function u(e, n) {
	if (e instanceof URL && e.protocol !== "file:") throw TypeError("Must be a file URL.");
	return new l(await t("plugin:fs|create", {
		path: e instanceof URL ? e.toString() : e,
		options: n
	}));
}
async function d(e, n) {
	if (e instanceof URL && e.protocol !== "file:") throw TypeError("Must be a file URL.");
	return new l(await t("plugin:fs|open", {
		path: e instanceof URL ? e.toString() : e,
		options: n
	}));
}
async function f(e, n, r) {
	if (e instanceof URL && e.protocol !== "file:" || n instanceof URL && n.protocol !== "file:") throw TypeError("Must be a file URL.");
	await t("plugin:fs|copy_file", {
		fromPath: e instanceof URL ? e.toString() : e,
		toPath: n instanceof URL ? n.toString() : n,
		options: r
	});
}
async function p(e, n) {
	if (e instanceof URL && e.protocol !== "file:") throw TypeError("Must be a file URL.");
	await t("plugin:fs|mkdir", {
		path: e instanceof URL ? e.toString() : e,
		options: n
	});
}
async function m(e, n) {
	if (e instanceof URL && e.protocol !== "file:") throw TypeError("Must be a file URL.");
	return await t("plugin:fs|read_dir", {
		path: e instanceof URL ? e.toString() : e,
		options: n
	});
}
async function h(e, n) {
	if (e instanceof URL && e.protocol !== "file:") throw TypeError("Must be a file URL.");
	let r = await t("plugin:fs|read_file", {
		path: e instanceof URL ? e.toString() : e,
		options: n
	});
	return r instanceof ArrayBuffer ? new Uint8Array(r) : Uint8Array.from(r);
}
async function g(e, n) {
	if (e instanceof URL && e.protocol !== "file:") throw TypeError("Must be a file URL.");
	let r = await t("plugin:fs|read_text_file", {
		path: e instanceof URL ? e.toString() : e,
		options: n
	}), i = r instanceof ArrayBuffer ? r : Uint8Array.from(r);
	return new TextDecoder(n?.encoding ?? "utf-8").decode(i);
}
async function _(e, n) {
	if (e instanceof URL && e.protocol !== "file:") throw TypeError("Must be a file URL.");
	let r = e instanceof URL ? e.toString() : e;
	return await Promise.resolve({
		path: r,
		rid: null,
		async next() {
			let e = new TextDecoder(n?.encoding ?? "utf-8");
			if (this.rid === null) {
				let i = e.encoding;
				this.rid = await t("plugin:fs|read_text_file_lines", {
					path: r,
					options: n == null ? void 0 : {
						...n,
						encoding: i
					}
				});
			}
			let i = await t("plugin:fs|read_text_file_lines_next", { rid: this.rid }), a = i instanceof ArrayBuffer ? new Uint8Array(i) : Uint8Array.from(i), o = a[a.byteLength - 1] === 1;
			return o ? (this.rid = null, {
				value: null,
				done: o
			}) : {
				value: e.decode(a.slice(0, a.byteLength - 1)),
				done: o
			};
		},
		[Symbol.asyncIterator]() {
			return this;
		}
	});
}
async function v(e, n) {
	if (e instanceof URL && e.protocol !== "file:") throw TypeError("Must be a file URL.");
	await t("plugin:fs|remove", {
		path: e instanceof URL ? e.toString() : e,
		options: n
	});
}
async function y(e, n, r) {
	if (e instanceof URL && e.protocol !== "file:" || n instanceof URL && n.protocol !== "file:") throw TypeError("Must be a file URL.");
	await t("plugin:fs|rename", {
		oldPath: e instanceof URL ? e.toString() : e,
		newPath: n instanceof URL ? n.toString() : n,
		options: r
	});
}
async function b(e, n) {
	return s(await t("plugin:fs|stat", {
		path: e instanceof URL ? e.toString() : e,
		options: n
	}));
}
async function x(e, n) {
	return s(await t("plugin:fs|lstat", {
		path: e instanceof URL ? e.toString() : e,
		options: n
	}));
}
async function S(e, n, r) {
	if (e instanceof URL && e.protocol !== "file:") throw TypeError("Must be a file URL.");
	await t("plugin:fs|truncate", {
		path: e instanceof URL ? e.toString() : e,
		len: n,
		options: r
	});
}
async function C(e, n, r) {
	if (e instanceof URL && e.protocol !== "file:") throw TypeError("Must be a file URL.");
	if (n instanceof ReadableStream) {
		let t = await d(e, {
			read: !1,
			create: !0,
			write: !0,
			...r
		}), i = n.getReader();
		try {
			for (;;) {
				let { done: e, value: n } = await i.read();
				if (e) break;
				await t.write(n);
			}
		} finally {
			i.releaseLock(), await t.close();
		}
	} else await t("plugin:fs|write_file", n, { headers: {
		path: encodeURIComponent(e instanceof URL ? e.toString() : e),
		options: JSON.stringify(r)
	} });
}
async function w(e, n, r) {
	if (e instanceof URL && e.protocol !== "file:") throw TypeError("Must be a file URL.");
	await t("plugin:fs|write_text_file", new TextEncoder().encode(n), { headers: {
		path: encodeURIComponent(e instanceof URL ? e.toString() : e),
		options: JSON.stringify(r)
	} });
}
async function T(e, n) {
	if (e instanceof URL && e.protocol !== "file:") throw TypeError("Must be a file URL.");
	return await t("plugin:fs|exists", {
		path: e instanceof URL ? e.toString() : e,
		options: n
	});
}
var E = class extends n {};
async function D(e, n, i) {
	let a = Array.isArray(e) ? e : [e];
	for (let e of a) if (e instanceof URL && e.protocol !== "file:") throw TypeError("Must be a file URL.");
	let o = new r();
	o.onmessage = n;
	let s = new E(await t("plugin:fs|watch", {
		paths: a.map((e) => e instanceof URL ? e.toString() : e),
		options: i,
		onEvent: o
	}));
	return () => {
		s.close();
	};
}
async function O(e, t, n) {
	return await D(e, t, {
		delayMs: 2e3,
		...n
	});
}
async function k(e, t, n) {
	return await D(e, t, {
		...n,
		delayMs: void 0
	});
}
async function A(e) {
	if (e instanceof URL && e.protocol !== "file:") throw TypeError("Must be a file URL.");
	return await t("plugin:fs|size", { path: e instanceof URL ? e.toString() : e });
}
async function j(e) {
	if (e instanceof URL && e.protocol !== "file:") throw TypeError("Must be a file URL.");
	await t("plugin:fs|start_accessing_security_scoped_resource", { path: e instanceof URL ? e.toString() : e });
}
async function M(e) {
	if (e instanceof URL && e.protocol !== "file:") throw TypeError("Must be a file URL.");
	await t("plugin:fs|stop_accessing_security_scoped_resource", { path: e instanceof URL ? e.toString() : e });
}
//#endregion
export { m as a, y as c, C as d, p as i, b as l, T as n, h as o, x as r, v as s, a as t, O as u };
