import { App, Modal, Notice, Platform, Setting } from "obsidian";
import {
	inputTypeById,
	inputTypeOptions,
	INPUT_TYPES,
	MULTIPLE,
} from "./inputTypes";
import type { InputType } from "./inputTypes";
import { duplicateKey, resolveKeys } from "./payload";
import type { OutputFormat } from "./payload";
import { isShortcutIdentifier } from "./shortcutList";
import { pickShortcut } from "./ShortcutPicker";

export interface LauncherDraft {
	commandName: string;
	shortcutName: string;
	shortcutLabel?: string;
	inputTypes: string[];
	separator: string;
	outputFormat: OutputFormat;
	keys: string[];
}

/** The default pair offered when a launcher switches to several inputs. */
const DEFAULT_MULTIPLE = [MULTIPLE, "Document Name", "Selected Text"];

export class LauncherModal extends Modal {
	private isEditing: boolean;
	private draft: LauncherDraft;
	private onSave: (draft: LauncherDraft) => void;

	constructor(
		app: App,
		isEditing: boolean,
		draft: LauncherDraft,
		onSave: (draft: LauncherDraft) => void
	) {
		super(app);
		this.isEditing = isEditing;
		this.draft = { ...draft, inputTypes: [...draft.inputTypes], keys: [...draft.keys] };
		this.onSave = onSave;
	}

	/** The input types actually collected, ignoring the Multiple sentinel. */
	private collected(): string[] {
		return this.draft.inputTypes.filter((id) => id !== MULTIPLE);
	}

	private isMultiple(): boolean {
		return this.draft.inputTypes[0] === MULTIPLE;
	}

	/** Registry entries for the collected ids, skipping any unknown id. */
	private collectedTypes(): InputType[] {
		return this.collected()
			.map((id) => inputTypeById(id))
			.filter((type): type is InputType => type !== undefined);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h2", {
			text: this.isEditing ? "Edit Launcher" : "New Launcher",
		});

		new Setting(contentEl)
			.setName("Command Name")
			.setDesc("The Obsidian command name.")
			.addText((text) =>
				text
					.setPlaceholder("Command Name")
					.setValue(this.draft.commandName)
					.onChange((value) => (this.draft.commandName = value))
			);

		this.renderShortcutSetting(contentEl);
		this.renderInputTypeSetting(contentEl);

		if (this.isMultiple()) {
			this.renderAdditionalInputs(contentEl);
			this.renderOutputFormat(contentEl);
		}

		new Setting(contentEl).addButton((button) =>
			button
				.setButtonText("Save")
				.setCta()
				.onClick(() => this.save())
		);
	}

	private renderShortcutSetting(contentEl: HTMLElement) {
		const usingIdentifier = isShortcutIdentifier(this.draft.shortcutName);
		const description =
			usingIdentifier && this.draft.shortcutLabel
				? `Name or identifier of the shortcut to run. Currently: ${this.draft.shortcutLabel}`
				: "Name or identifier of the shortcut to run.";

		const setting = new Setting(contentEl)
			.setName("Shortcut")
			.setDesc(description)
			.addText((text) =>
				text
					.setPlaceholder("Shortcut")
					.setValue(this.draft.shortcutName)
					.onChange((value) => {
						this.draft.shortcutName = value;
						// The stored label no longer describes a hand-edited value.
						this.draft.shortcutLabel = undefined;
					})
			);

		// The Shortcuts CLI only exists on desktop.
		if (!Platform.isMobileApp) {
			setting.addButton((button) =>
				button.setButtonText("Pick…").onClick(() =>
					pickShortcut(this.app, (entry) => {
						this.draft.shortcutName = entry.id;
						this.draft.shortcutLabel = entry.name;
						this.onOpen();
					})
				)
			);
		}
	}

	private renderInputTypeSetting(contentEl: HTMLElement) {
		new Setting(contentEl)
			.setName("Input Type")
			.setDesc("The initial input into the shortcut.")
			.addDropdown((dropdown) =>
				dropdown
					.addOptions({
						...inputTypeOptions(),
						[MULTIPLE]: MULTIPLE,
					})
					.setValue(this.draft.inputTypes[0])
					.onChange((value) => {
						if (value === MULTIPLE) {
							this.draft.inputTypes = [...DEFAULT_MULTIPLE];
						} else {
							this.draft.inputTypes = [value];
							this.draft.outputFormat = "separator";
						}
						this.draft.keys = this.defaultKeys();
						this.onOpen();
					})
			);
	}

	private defaultKeys(): string[] {
		return resolveKeys(this.collectedTypes(), undefined);
	}

	private renderAdditionalInputs(contentEl: HTMLElement) {
		const json = this.draft.outputFormat === "json";

		this.collected().forEach((inputType, index) => {
			const setting = new Setting(contentEl)
				.setName(`Input Type #${index + 1}`)
				.addDropdown((dropdown) =>
					dropdown
						.addOptions(inputTypeOptions())
						.setValue(inputType)
						.onChange((value) => {
							this.draft.inputTypes[index + 1] = value;
							// Follow the new type's default key unless the key
							// was deliberately changed from the old default.
							const previous = inputTypeById(inputType);
							if (
								!this.draft.keys[index] ||
								this.draft.keys[index] === previous?.key
							) {
								this.draft.keys[index] =
									inputTypeById(value)?.key ?? "";
							}
							if (json) {
								this.onOpen();
							}
						})
				);

			if (json) {
				setting.addText((text) =>
					text
						.setPlaceholder("key")
						.setValue(this.draft.keys[index] ?? "")
						.onChange((value) => (this.draft.keys[index] = value))
				);
			}

			// Upstream keeps a minimum of two inputs in Multiple mode.
			if (index > 1) {
				setting.addButton((button) =>
					button
						.setIcon("trash")
						.setWarning()
						.onClick(() => {
							this.draft.inputTypes.splice(index + 1, 1);
							this.draft.keys.splice(index, 1);
							this.onOpen();
						})
				);
			}
		});

		new Setting(contentEl).addButton((button) =>
			button.setButtonText("Add Input").onClick(() => {
				const added = INPUT_TYPES[0];
				this.draft.inputTypes.push(added.id);
				this.draft.keys.push(added.key);
				this.onOpen();
			})
		);
	}

	private renderOutputFormat(contentEl: HTMLElement) {
		new Setting(contentEl)
			.setName("Output Format")
			.setDesc("How the inputs are combined before the shortcut runs.")
			.addDropdown((dropdown) =>
				dropdown
					.addOptions({
						separator: "Separator",
						json: "JSON dictionary",
					})
					.setValue(this.draft.outputFormat)
					.onChange((value) => {
						this.draft.outputFormat = value as OutputFormat;
						if (this.draft.outputFormat === "json") {
							// Fill any gaps left by launchers saved before this.
							this.draft.keys = resolveKeys(
								this.collectedTypes(),
								this.draft.keys
							);
						}
						this.onOpen();
					})
			);

		if (this.draft.outputFormat === "separator") {
			new Setting(contentEl)
				.setName("Separator")
				.setDesc("The separator to insert between input types.")
				.addText((text) =>
					text
						.setValue(this.draft.separator)
						.onChange((value) => (this.draft.separator = value))
				);
		}
	}

	private save() {
		if (!this.draft.commandName || this.draft.commandName.length === 0) {
			return new Notice("Specify a command name.");
		}
		if (!this.draft.shortcutName || this.draft.shortcutName.length === 0) {
			return new Notice("Specify a shortcut name or identifier.");
		}
		if (this.draft.outputFormat === "json") {
			const keys = resolveKeys(this.collectedTypes(), this.draft.keys);
			const repeated = duplicateKey(keys);
			if (repeated) {
				return new Notice(
					`Duplicate key "${repeated}". Each input needs its own key.`
				);
			}
			this.draft.keys = keys;
		}
		this.onSave(this.draft);
		this.close();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
