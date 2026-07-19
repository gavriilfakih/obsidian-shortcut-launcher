/**
 * Parsing `shortcuts list --show-identifiers`.
 *
 * Pure: no Obsidian, no Node. ShortcutPicker supplies the stdout.
 */

const UUID = "[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}";

/**
 * Anchored at end of line so that names containing parentheses parse
 * correctly: "Save (Draft) (UUID)" is the shortcut "Save (Draft)".
 */
const TRAILING_IDENTIFIER = new RegExp(`\\s\\((${UUID})\\)$`);

const BARE_IDENTIFIER = new RegExp(`^${UUID}$`);

export interface ShortcutEntry {
	name: string;
	id: string;
}

/** One shortcut per line, formatted `Name (UUID)`. Unmatched lines are skipped. */
export function parseShortcutList(stdout: string): ShortcutEntry[] {
	const entries: ShortcutEntry[] = [];
	for (const rawLine of stdout.split("\n")) {
		const line = rawLine.replace(/\r$/, "").trimEnd();
		if (!line) {
			continue;
		}
		const match = line.match(TRAILING_IDENTIFIER);
		if (!match) {
			continue;
		}
		const name = line.slice(0, line.length - match[0].length).trim();
		if (!name) {
			continue;
		}
		entries.push({ name, id: match[1] });
	}
	return entries;
}

/**
 * Whether a value is an identifier rather than a name. Used only to warn on
 * mobile, where the URL scheme takes a name and has no identifier parameter.
 */
export function isShortcutIdentifier(value: string): boolean {
	return BARE_IDENTIFIER.test(value.trim());
}
