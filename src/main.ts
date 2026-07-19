import {
	Command,
	FileSystemAdapter,
	getFrontMatterInfo,
	getLinkpath,
	MarkdownView,
	Notice,
	Platform,
	Plugin,
	ReferenceCache,
	TFile,
} from "obsidian";
import { SettingsTab } from "./SettingsTab";
import { inputTypeById, MULTIPLE, resolveInput } from "./inputTypes";
import type { InputContext, InputType, Requirement } from "./inputTypes";
import { buildPayload, resolveKeys } from "./payload";
import type { OutputFormat, ResolvedInput } from "./payload";
import { isShortcutIdentifier } from "./shortcutList";

declare module "obsidian" {
	interface Commands {
		removeCommand(arg0: string): void;
	}
	interface App {
		commands: Commands;
	}
	interface View {
		getSelection(): string;
	}
}

export interface Launcher {
	commandName: string;
	/** A shortcut name or identifier. Named for compatibility with upstream. */
	shortcutName: string;
	inputTypes: string[];
	separator: string;
	/** Absent means "separator", so launchers written upstream are unchanged. */
	outputFormat?: OutputFormat;
	/** Positional JSON key overrides, aligned with the collected input types. */
	keys?: string[];
	/** Display only, so a launcher set by identifier is still readable. */
	shortcutLabel?: string;
}

interface ShortcutLauncherPluginSettings {
	launchers: Launcher[];
}

const DEFAULT_SETTINGS: ShortcutLauncherPluginSettings = {
	launchers: [],
};

/** The input types a launcher actually collects, in order. */
export function selectedTypes(launcher: Launcher): InputType[] {
	return launcher.inputTypes
		.filter((id) => id !== MULTIPLE)
		.map((id) => inputTypeById(id))
		.filter((type): type is InputType => type !== undefined);
}

export default class ShortcutLauncherPlugin extends Plugin {
	settings: ShortcutLauncherPluginSettings;
	registeredCommands: Command[] = [];

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new SettingsTab(this.app, this));
		await this.createCommands();
	}

	async createCommands() {
		this.registeredCommands = [];
		this.settings.launchers.forEach((launcher) => {
			this.registeredCommands.push(
				this.addCommand({
					id: launcher.commandName.replace(/\s+/g, "-").toLowerCase(),
					name: launcher.commandName,
					checkCallback: (checking) => {
						if (checking) {
							return this.check(launcher);
						}
						this.run(launcher);
						return true;
					},
				})
			);
		});
	}

	// --------------------------------------------------------------- context

	private vaultPath(): string | null {
		const adapter = this.app.vault.adapter;
		return adapter instanceof FileSystemAdapter
			? adapter.getBasePath()
			: null;
	}

	private sourceModeView(): MarkdownView | null {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view || view.getMode() !== "source" || !view.editor) {
			return null;
		}
		return view;
	}

	/**
	 * The link or embed under the cursor. Shared by check() and the resolver so
	 * the two cannot disagree about whether one is present.
	 */
	private linkOrEmbedAtCursor(): ReferenceCache | null {
		const view = this.sourceModeView();
		const activeFile = this.app.workspace.getActiveFile();
		if (!view || !activeFile) {
			return null;
		}
		const cache = this.app.metadataCache.getFileCache(activeFile);
		if (!cache) {
			return null;
		}
		const linksAndEmbeds = ((cache.links ?? []) as ReferenceCache[]).concat(
			(cache.embeds ?? []) as ReferenceCache[]
		);
		const cursorOffset = view.editor.posToOffset(view.editor.getCursor());
		const matching = linksAndEmbeds.filter(
			(cached) =>
				cached.position.start.offset <= cursorOffset &&
				cached.position.end.offset >= cursorOffset
		);
		return matching.length > 0 ? matching[0] : null;
	}

	private async readLinkOrEmbed(): Promise<string> {
		const activeFile = this.app.workspace.getActiveFile();
		const match = this.linkOrEmbedAtCursor();
		if (!match || !activeFile) {
			new Notice("Could not find current link or embed");
			return "";
		}
		const linkpath = getLinkpath(match.link);
		const linkedFile = this.app.metadataCache.getFirstLinkpathDest(
			linkpath,
			activeFile.path
		);
		if (!linkedFile) {
			new Notice("Could not find current link or embed");
			return "";
		}
		if (
			!match.link.contains(".") ||
			linkpath.endsWith(".md") ||
			linkpath.endsWith("txt")
		) {
			return this.app.vault.read(linkedFile);
		}
		const binary = await this.app.vault.readBinary(linkedFile);
		return arrayBufferToBase64(binary);
	}

	private async readCurrentParagraph(): Promise<string> {
		const activeFile = this.app.workspace.getActiveFile();
		const view = this.sourceModeView();
		if (!activeFile || !view) {
			new Notice("Could not find current paragraph");
			return "";
		}
		const cache = this.app.metadataCache.getFileCache(activeFile);
		const cursorOffset = view.editor.posToOffset(view.editor.getCursor());
		const matching = (cache?.sections ?? []).filter(
			(section) =>
				section.position.start.offset <= cursorOffset &&
				section.position.end.offset >= cursorOffset
		);
		if (matching.length === 0) {
			new Notice("Could not find current paragraph");
			return "";
		}
		const contents = await this.app.vault.read(activeFile);
		return contents.substring(
			matching[0].position.start.offset,
			matching[0].position.end.offset
		);
	}

	private backlinks(): string[] {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			return [];
		}
		return Object.entries(this.app.metadataCache.resolvedLinks)
			.filter((entry) => Object.keys(entry[1]).contains(activeFile.path))
			.map((entry) => entry[0]);
	}

	private buildContext(): InputContext {
		const activeFile: TFile | null = this.app.workspace.getActiveFile();
		return {
			file: activeFile
				? { path: activeFile.path, basename: activeFile.basename }
				: null,
			vaultName: this.app.vault.getName(),
			vaultPath: this.vaultPath(),
			isMobile: Platform.isMobileApp,
			readActiveFile: () => this.app.vault.read(activeFile!),
			frontMatterInfo: (text) => getFrontMatterInfo(text),
			properties: () =>
				this.app.metadataCache.getFileCache(activeFile!)?.frontmatter ??
				{},
			backlinks: () => this.backlinks(),
			selection: () =>
				this.app.workspace.activeEditor?.editor?.getSelection() || "",
			linkOrEmbedContents: () => this.readLinkOrEmbed(),
			currentParagraph: () => this.readCurrentParagraph(),
			notify: (message) => new Notice(message),
		};
	}

	// ------------------------------------------------------------- execution

	private async run(launcher: Launcher) {
		const types = selectedTypes(launcher);
		const keys = resolveKeys(types, launcher.keys);
		const ctx = this.buildContext();

		const inputs: ResolvedInput[] = [];
		for (let index = 0; index < types.length; index++) {
			const value = await resolveInput(types[index], ctx);
			inputs.push({ type: types[index], key: keys[index], value });
		}

		const payload = buildPayload(
			inputs,
			launcher.outputFormat ?? "separator",
			launcher.separator
		);

		if (Platform.isMobileApp) {
			this.runOnMobile(launcher, payload);
		} else {
			this.runOnDesktop(launcher, payload);
		}
	}

	private runOnMobile(launcher: Launcher, payload: string) {
		if (isShortcutIdentifier(launcher.shortcutName)) {
			new Notice(
				"Shortcut identifiers only work on desktop. Use the shortcut's name on mobile."
			);
		}
		window.open(
			`shortcuts://run-shortcut?name=${encodeURIComponent(
				launcher.shortcutName
			)}&input=text&text=${encodeURIComponent(payload)}`
		);
	}

	private runOnDesktop(launcher: Launcher, payload: string) {
		const isJson = (launcher.outputFormat ?? "separator") === "json";
		// A .json extension lets `shortcuts run` infer the input's type.
		const tempFilePath = require("path").join(
			require("os").tmpdir(),
			`obsidian-shortcut-launcher-temp-input${isJson ? ".json" : ""}`
		);
		const escapedShortcut = launcher.shortcutName.replace(/["\\]/g, "\\$&");
		const fs = require("fs");
		fs.writeFile(tempFilePath, payload, () => {
			require("child_process").exec(
				`shortcuts run "${escapedShortcut}" -i ${tempFilePath}`,
				(error: Error | null, _stdout: string, stderr: string) => {
					if (error) {
						new Notice(
							`Shortcut failed: ${stderr?.trim() || error.message}`
						);
					}
					fs.unlink(tempFilePath, () => {});
				}
			);
		});
	}

	// ------------------------------------------------------------ visibility

	private meets(requirement: Requirement): boolean {
		switch (requirement) {
			case "activeFile":
				return this.app.workspace.getActiveFile() !== null;
			case "selection":
				return (
					(this.app.workspace.activeEditor?.editor?.getSelection()
						.length || 0) > 0
				);
			case "sourceMode":
				return this.sourceModeView() !== null;
			case "linkAtCursor":
				return this.linkOrEmbedAtCursor() !== null;
		}
	}

	check(launcher: Launcher): boolean {
		const requirements = new Set<Requirement>();
		for (const type of selectedTypes(launcher)) {
			for (const requirement of type.requires) {
				requirements.add(requirement);
			}
		}
		for (const requirement of requirements) {
			if (!this.meets(requirement)) {
				return false;
			}
		}
		return true;
	}

	// -------------------------------------------------------------- settings

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);

		this.registeredCommands.forEach((command) => {
			this.app.commands.removeCommand(command.id);
		});
		this.registeredCommands = [];

		await this.createCommands();
	}
}

// https://stackoverflow.com/a/9458996/4927033
function arrayBufferToBase64(buffer: ArrayBuffer) {
	let binary = "";
	const bytes = new Uint8Array(buffer);
	const len = bytes.byteLength;
	for (let i = 0; i < len; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return window.btoa(binary);
}
