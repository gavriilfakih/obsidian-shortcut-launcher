import test from "node:test";
import assert from "node:assert/strict";
import {
	parseShortcutList,
	isShortcutIdentifier,
} from "../src/shortcutList.ts";

test("parses name and identifier", () => {
	const out = parseShortcutList(
		"Organise Reading List by Topic (B6351202-CC76-42FA-8A77-9BB6D2B25010)\n" +
			"Rename File (12F861F5-C352-48D2-BEF2-4964D5C48277)\n"
	);
	assert.deepEqual(out, [
		{
			name: "Organise Reading List by Topic",
			id: "B6351202-CC76-42FA-8A77-9BB6D2B25010",
		},
		{ name: "Rename File", id: "12F861F5-C352-48D2-BEF2-4964D5C48277" },
	]);
});

test("keeps parentheses that belong to the shortcut name", () => {
	const out = parseShortcutList(
		"Save (Draft) (9E455909-7286-4532-9B4D-FFA2474EC9D4)"
	);
	assert.deepEqual(out, [
		{ name: "Save (Draft)", id: "9E455909-7286-4532-9B4D-FFA2474EC9D4" },
	]);
});

test("parses real shortcut names containing parentheses", () => {
	// Taken from `shortcuts list --show-identifiers` on a 459-shortcut library.
	// A parser that split on the first "(" would truncate every one of these.
	const out = parseShortcutList(
		"Metadata info - including code (runs locally) (9134B129-1C98-4EB2-9771-F59049EAE913)\n" +
			"Base Body (cal) 1.07 (1C643A94-B285-4A9E-9303-E086F2CB8564)\n" +
			"Verification in Shortcuts (newer versions) (37B787FD-3A76-42FB-9F0A-8109762C95AF)\n"
	);
	assert.deepEqual(
		out.map((entry) => entry.name),
		[
			"Metadata info - including code (runs locally)",
			"Base Body (cal) 1.07",
			"Verification in Shortcuts (newer versions)",
		]
	);
	assert.equal(out[0].id, "9134B129-1C98-4EB2-9771-F59049EAE913");
});

test("handles a name that is only parentheses", () => {
	const out = parseShortcutList(
		"(Draft) (9E455909-7286-4532-9B4D-FFA2474EC9D4)"
	);
	assert.deepEqual(out, [
		{ name: "(Draft)", id: "9E455909-7286-4532-9B4D-FFA2474EC9D4" },
	]);
});

test("skips blank, malformed, and error lines", () => {
	const out = parseShortcutList(
		"\n" +
			"Error: Couldn't communicate with a helper application.\n" +
			"Shortcut Without Identifier\n" +
			"Not A UUID (12345)\n" +
			"\n" +
			"Good One (12F861F5-C352-48D2-BEF2-4964D5C48277)\n"
	);
	assert.deepEqual(out, [
		{ name: "Good One", id: "12F861F5-C352-48D2-BEF2-4964D5C48277" },
	]);
});

test("tolerates CRLF line endings", () => {
	const out = parseShortcutList(
		"Rename File (12F861F5-C352-48D2-BEF2-4964D5C48277)\r\n"
	);
	assert.deepEqual(out, [
		{ name: "Rename File", id: "12F861F5-C352-48D2-BEF2-4964D5C48277" },
	]);
});

test("returns nothing for empty output", () => {
	assert.deepEqual(parseShortcutList(""), []);
});

test("identifies identifiers but not names", () => {
	assert.equal(
		isShortcutIdentifier("12F861F5-C352-48D2-BEF2-4964D5C48277"),
		true
	);
	assert.equal(
		isShortcutIdentifier("  12f861f5-c352-48d2-bef2-4964d5c48277  "),
		true
	);
	assert.equal(isShortcutIdentifier("Intelligent Topics"), false);
	assert.equal(isShortcutIdentifier(""), false);
	// A name that merely contains an identifier is still a name.
	assert.equal(
		isShortcutIdentifier("Run 12F861F5-C352-48D2-BEF2-4964D5C48277"),
		false
	);
});
