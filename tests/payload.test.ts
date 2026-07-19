import test from "node:test";
import assert from "node:assert/strict";
import {
	buildPayload,
	toSeparatorText,
	resolveKeys,
	duplicateKey,
} from "../src/payload.ts";
import type { ResolvedInput } from "../src/payload.ts";
import { inputTypeById } from "../src/inputTypes.ts";
import type { InputType } from "../src/inputTypes.ts";

const type = (id: string): InputType => {
	const found = inputTypeById(id);
	assert.ok(found, `no input type ${id}`);
	return found;
};

const input = (id: string, value: unknown, key?: string): ResolvedInput => {
	const t = type(id);
	return { type: t, key: key ?? t.key, value };
};

test("separator output matches upstream for plain strings", () => {
	const out = buildPayload(
		[
			input("Document Name", "Milton"),
			input("Document Path", "Notes/Milton.md"),
		],
		"separator",
		"◁BREAK▹"
	);
	assert.equal(out, "Milton◁BREAK▹Notes/Milton.md");
});

test("separator output stringifies properties as upstream did", () => {
	const properties = { tags: ["ppe"], status: "draft" };
	assert.equal(
		toSeparatorText(type("Properties"), properties),
		JSON.stringify(properties)
	);
});

test("separator output newline-joins backlinks as upstream did", () => {
	assert.equal(
		toSeparatorText(type("Backlinks to Document"), ["a.md", "b.md"]),
		"a.md\nb.md"
	);
});

test("separator output survives missing values", () => {
	assert.equal(toSeparatorText(type("Document Name"), undefined), "");
	assert.equal(toSeparatorText(type("Properties"), undefined), "{}");
	assert.equal(toSeparatorText(type("Backlinks to Document"), undefined), "");
});

test("json output nests properties as an object and backlinks as an array", () => {
	const out = buildPayload(
		[
			input("Document Path", "Notes/Milton.md"),
			input("Properties", { tags: ["ppe"], status: "draft" }),
			input("Backlinks to Document", ["a.md", "b.md"]),
		],
		"json",
		"ignored"
	);
	assert.deepEqual(JSON.parse(out), {
		notePath: "Notes/Milton.md",
		properties: { tags: ["ppe"], status: "draft" },
		backlinks: ["a.md", "b.md"],
	});
	// Not a string that needs parsing a second time.
	assert.equal(typeof JSON.parse(out).properties, "object");
	assert.ok(Array.isArray(JSON.parse(out).backlinks));
});

test("json output honours custom keys", () => {
	const out = buildPayload(
		[input("Document Path", "Notes/Milton.md", "file")],
		"json",
		","
	);
	assert.deepEqual(JSON.parse(out), { file: "Notes/Milton.md" });
});

test("resolveKeys falls back to registry defaults", () => {
	const types = [type("Document Path"), type("Properties")];
	assert.deepEqual(resolveKeys(types, undefined), [
		"notePath",
		"properties",
	]);
	assert.deepEqual(resolveKeys(types, ["file", ""]), ["file", "properties"]);
	assert.deepEqual(resolveKeys(types, ["  ", "  props  "]), [
		"notePath",
		"props",
	]);
});

test("duplicateKey finds the first repeat", () => {
	assert.equal(duplicateKey(["a", "b", "c"]), null);
	assert.equal(duplicateKey(["a", "b", "a"]), "a");
	assert.equal(duplicateKey([]), null);
});

test("the same input type twice can coexist under distinct keys", () => {
	const out = buildPayload(
		[
			input("Selected Text", "first", "before"),
			input("Selected Text", "second", "after"),
		],
		"json",
		","
	);
	assert.deepEqual(JSON.parse(out), { before: "first", after: "second" });
});
