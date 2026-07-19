import { App, PluginSettingTab, Setting } from "obsidian";
import { LauncherModal } from "./LauncherModal";
import type { LauncherDraft } from "./LauncherModal";
import { inputTypeLabel, MULTIPLE } from "./inputTypes";
// Type-only, so SettingsTab does not import main at runtime.
import type ShortcutLauncherPlugin from "./main";
import type { Launcher } from "./main";

function toDraft(launcher: Launcher): LauncherDraft {
	return {
		commandName: launcher.commandName,
		shortcutName: launcher.shortcutName,
		shortcutLabel: launcher.shortcutLabel,
		inputTypes: launcher.inputTypes,
		separator: launcher.separator,
		outputFormat: launcher.outputFormat ?? "separator",
		keys: launcher.keys ?? [],
	};
}

function fromDraft(draft: LauncherDraft): Launcher {
	return {
		commandName: draft.commandName,
		shortcutName: draft.shortcutName,
		shortcutLabel: draft.shortcutLabel,
		inputTypes: draft.inputTypes,
		separator: draft.separator,
		outputFormat: draft.outputFormat,
		keys: draft.keys,
	};
}

/** `Shortcut < First Input`, using the shortcut's name when set by identifier. */
function summarise(launcher: Launcher): string {
	const shortcut = launcher.shortcutLabel ?? launcher.shortcutName;
	const first = launcher.inputTypes[0];
	const input =
		first === MULTIPLE
			? `${MULTIPLE} (${launcher.outputFormat === "json" ? "JSON" : "separator"})`
			: inputTypeLabel(first);
	return `${shortcut} < ${input}`;
}

export class SettingsTab extends PluginSettingTab {
	plugin: ShortcutLauncherPlugin;

	constructor(app: App, plugin: ShortcutLauncherPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl("h2", { text: "Shortcut Launchers" });

		new Setting(containerEl).addButton((button) =>
			button
				.setButtonText("New")
				.setCta()
				.onClick(() => {
					new LauncherModal(
						this.app,
						false,
						{
							commandName: "",
							shortcutName: "",
							inputTypes: ["Selected Text"],
							separator: ",",
							outputFormat: "separator",
							keys: [],
						},
						(draft) => {
							this.plugin.settings.launchers.splice(
								0,
								0,
								fromDraft(draft)
							);
							this.plugin.saveSettings();
							this.display();
						}
					).open();
				})
		);

		this.plugin.settings.launchers.forEach((launcher, index) => {
			new Setting(containerEl)
				.setName(launcher.commandName)
				.setDesc(summarise(launcher))
				.addButton((button) =>
					button.setIcon("pencil").onClick(() => {
						new LauncherModal(
							this.app,
							true,
							toDraft(launcher),
							(draft) => {
								this.plugin.settings.launchers[index] =
									fromDraft(draft);
								this.plugin.saveSettings();
								this.display();
							}
						).open();
					})
				)
				.addButton((button) =>
					button
						.setIcon("trash")
						.setWarning()
						.onClick(() => {
							this.plugin.settings.launchers.splice(index, 1);
							this.plugin.saveSettings();
							this.display();
						})
				);
		});
	}
}
