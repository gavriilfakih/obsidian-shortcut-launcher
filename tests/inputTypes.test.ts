import test from "node:test";
import assert from "node:assert/strict";
import {
	INPUT_TYPES,
	inputTypeById,
	inputTypeLabel,
	inputTypeOptions,
	joinVaultPath,
	resolveInput,
} from "../src/inputTypes.ts";
import type {
	InputContext,
	FrontMatterInfoLike,
} from "../src/inputTypes.ts";

/**
 * Offsets measured from Obsidian 1.13.2 on 2026-07-19 by calling
 * getFrontMatterInfo in the running app, rather than reimplemented here. A
 * reimplementation would only test itself.
 *
 * The headline result: contentStart already sits past the closing --- *and*
 * its newline, so a blank line the author left after the block survives.
 */
const MEASURED: Record<string, FrontMatterInfoLike> = {
	"---\na: 1\n---\nBody": { exists: true, contentStart: 13 },
	"---\na: 1\n---\n\nBody": { exists: true, contentStart: 13 },
	"---\na: 1\n---\n\n\nBody": { exists: true, contentStart: 13 },
	"---\na: 1\n---\n    indented": { exists: true, contentStart: 13 },
	"# Title\n\nBody": { exists: false, contentStart: 0 },
	"---\n---\nBody": { exists: true, contentStart: 8 },
	"---\na: 1\n---": { exists: true, contentStart: 12 },
	"---\na: 1\n---\nBefore\n---\nAfter": { exists: true, contentStart: 13 },
	"---\ntags: [ppe]\n---\nMilton's prose tracts argue…": {
		exists: true,
		contentStart: 20,
	},
	"---\ntags: [ppe]\n---\nBody": { exists: true, contentStart: 20 },
};

const frontMatterInfo = (text: string): FrontMatterInfoLike => {
	const measured = MEASURED[text];
	assert.ok(
		measured,
		`no measured getFrontMatterInfo result for ${JSON.stringify(text)}`
	);
	return measured;
};

const context = (over: Partial<InputContext> = {}): InputContext => ({
	file: { path: "Notes/Milton.md", basename: "Milton" },
	vaultName: "Vault",
	vaultPath: "/Users/gavriilfakih/Vault",
	isMobile: false,
	readActiveFile: async () => "",
	frontMatterInfo,
	properties: () => ({}),
	backlinks: () => [],
	selection: () => "",
	linkOrEmbedContents: async () => "",
	currentParagraph: async () => "",
	notify: () => undefined,
	...over,
});

const resolve = (id: string, ctx: InputContext) =>
	resolveInput(inputTypeById(id)!, ctx);

test("registry ids, labels, and keys are each unique", () => {
	const unique = (xs: string[]) => new Set(xs).size === xs.length;
	assert.ok(unique(INPUT_TYPES.map((t) => t.id)), "ids");
	assert.ok(unique(INPUT_TYPES.map((t) => t.label)), "labels");
	assert.ok(unique(INPUT_TYPES.map((t) => t.key)), "keys");
});

test("upstream ids are preserved so existing settings need no migration", () => {
	// The four launchers configured in the vault before this fork.
	for (const id of [
		"Document Path",
		"Document Name",
		"Entire Document",
		"Selected Text",
	]) {
		assert.ok(inputTypeById(id), `${id} must still resolve`);
	}
});

test("Document types are relabelled to Note", () => {
	assert.equal(inputTypeLabel("Document Path"), "Note Path");
	assert.equal(inputTypeLabel("Document Name"), "Note Name");
	assert.equal(inputTypeLabel("Entire Document"), "Entire Note");
	assert.equal(inputTypeLabel("Link to Document"), "Link to Note");
	assert.equal(inputTypeLabel("Backlinks to Document"), "Backlinks to Note");
	assert.ok(
		!INPUT_TYPES.some((t) => t.label.includes("Document")),
		"no label may still say Document"
	);
});

test("an unknown id falls back to itself rather than throwing", () => {
	assert.equal(inputTypeLabel("Invented Type"), "Invented Type");
});

test("dropdown options map stored id to displayed label", () => {
	assert.equal(inputTypeOptions()["Document Path"], "Note Path");
});

test("Note Content strips a properties block", async () => {
	const text = "---\ntags: [ppe]\n---\nMilton's prose tracts argue…";
	const out = await resolve(
		"Note Content",
		context({ readActiveFile: async () => text })
	);
	assert.equal(out, "Milton's prose tracts argue…");
});

test("Note Content returns the whole note when there is no properties block", async () => {
	const text = "# Title\n\nBody";
	const out = await resolve(
		"Note Content",
		context({ readActiveFile: async () => text })
	);
	assert.equal(out, text);
});

test("Note Content keeps a blank line the author left after the block", async () => {
	// contentStart consumes the delimiter's own newline but nothing further,
	// so this blank line is the author's and must survive.
	const out = await resolve(
		"Note Content",
		context({ readActiveFile: async () => "---\na: 1\n---\n\nBody" })
	);
	assert.equal(out, "\nBody");
});

test("Note Content handles empty and unterminated bodies", async () => {
	assert.equal(
		await resolve(
			"Note Content",
			context({ readActiveFile: async () => "---\n---\nBody" })
		),
		"Body"
	);
	// A note that is nothing but properties has no content.
	assert.equal(
		await resolve(
			"Note Content",
			context({ readActiveFile: async () => "---\na: 1\n---" })
		),
		""
	);
});

test("Note Content does not stop at a --- inside the body", async () => {
	const out = await resolve(
		"Note Content",
		context({
			readActiveFile: async () =>
				"---\na: 1\n---\nBefore\n---\nAfter",
		})
	);
	assert.equal(out, "Before\n---\nAfter");
});

test("Note Content preserves indentation that opens the body", async () => {
	const out = await resolve(
		"Note Content",
		context({ readActiveFile: async () => "---\na: 1\n---\n    indented" })
	);
	assert.equal(out, "    indented");
});

test("Entire Note keeps the properties block", async () => {
	const text = "---\ntags: [ppe]\n---\nBody";
	const out = await resolve(
		"Entire Document",
		context({ readActiveFile: async () => text })
	);
	assert.equal(out, text);
});

test("path types resolve", async () => {
	const ctx = context();
	assert.equal(await resolve("Document Path", ctx), "Notes/Milton.md");
	assert.equal(await resolve("Document Name", ctx), "Milton");
	assert.equal(await resolve("Vault Path", ctx), "/Users/gavriilfakih/Vault");
	assert.equal(
		await resolve("Absolute Note Path", ctx),
		"/Users/gavriilfakih/Vault/Notes/Milton.md"
	);
});

test("joinVaultPath normalises slashes", () => {
	assert.equal(joinVaultPath("/a/b", "c.md"), "/a/b/c.md");
	assert.equal(joinVaultPath("/a/b/", "c.md"), "/a/b/c.md");
	assert.equal(joinVaultPath("/a/b/", "/c.md"), "/a/b/c.md");
	assert.equal(joinVaultPath("/a/b", "sub/c.md"), "/a/b/sub/c.md");
});

test("Link to Note percent-encodes vault and path", async () => {
	const out = await resolve(
		"Link to Document",
		context({
			vaultName: "My Vault",
			file: { path: "Notes/A B.md", basename: "A B" },
		})
	);
	assert.equal(
		out,
		"obsidian://open?vault=My%20Vault&file=Notes%2FA%20B.md"
	);
});

test("desktop-only types yield an empty string and warn on mobile", async () => {
	const warnings: string[] = [];
	const ctx = context({
		isMobile: true,
		vaultPath: null,
		notify: (m) => warnings.push(m),
	});
	assert.equal(await resolve("Vault Path", ctx), "");
	assert.equal(await resolve("Absolute Note Path", ctx), "");
	assert.equal(warnings.length, 2);
	assert.ok(warnings[0].includes("mobile"));
});

test("desktop-only types do not throw when the adapter has no base path", async () => {
	const ctx = context({ isMobile: false, vaultPath: null });
	assert.equal(await resolve("Vault Path", ctx), "");
	assert.equal(await resolve("Absolute Note Path", ctx), "");
});

test("Properties and Backlinks resolve to structured values, not strings", async () => {
	const ctx = context({
		properties: () => ({ tags: ["ppe"] }),
		backlinks: () => ["a.md", "b.md"],
	});
	assert.deepEqual(await resolve("Properties", ctx), { tags: ["ppe"] });
	assert.deepEqual(await resolve("Backlinks to Document", ctx), [
		"a.md",
		"b.md",
	]);
});
