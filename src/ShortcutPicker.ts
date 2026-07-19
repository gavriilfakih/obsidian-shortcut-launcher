import { App, FuzzySuggestModal, Notice } from "obsidian";
import { parseShortcutList } from "./shortcutList";
import type { ShortcutEntry } from "./shortcutList";

/**
 * Ask the Shortcuts CLI for the installed shortcuts.
 *
 * child_process is required inline rather than imported so that the module
 * is never evaluated on mobile, where it does not exist.
 */
export function listShortcuts(): Promise<ShortcutEntry[]> {
	return new Promise((resolve, reject) => {
		require("child_process").execFile(
			"shortcuts",
			["list", "--show-identifiers"],
			(error: Error | null, stdout: string, stderr: string) => {
				if (error) {
					reject(new Error(stderr?.trim() || error.message));
					return;
				}
				resolve(parseShortcutList(stdout));
			}
		);
	});
}

export class ShortcutPicker extends FuzzySuggestModal<ShortcutEntry> {
	private entries: ShortcutEntry[];
	private onChoose: (entry: ShortcutEntry) => void;

	constructor(
		app: App,
		entries: ShortcutEntry[],
		onChoose: (entry: ShortcutEntry) => void
	) {
		super(app);
		this.entries = entries;
		this.onChoose = onChoose;
		this.setPlaceholder("Search shortcuts…");
	}

	getItems(): ShortcutEntry[] {
		return this.entries;
	}

	getItemText(entry: ShortcutEntry): string {
		return entry.name;
	}

	onChooseItem(entry: ShortcutEntry): void {
		this.onChoose(entry);
	}
}

/** List the installed shortcuts and let the user pick one. */
export async function pickShortcut(
	app: App,
	onChoose: (entry: ShortcutEntry) => void
): Promise<void> {
	let entries: ShortcutEntry[];
	try {
		entries = await listShortcuts();
	} catch (error) {
		new Notice(
			`Could not list shortcuts: ${
				error instanceof Error ? error.message : String(error)
			}`
		);
		return;
	}
	if (entries.length === 0) {
		new Notice("No shortcuts found.");
		return;
	}
	new ShortcutPicker(app, entries, onChoose).open();
}
