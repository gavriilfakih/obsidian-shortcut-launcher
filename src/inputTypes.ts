/**
 * The single source of truth for input types.
 *
 * Upstream repeats its input types in four places: two dropdown option lists,
 * an if/else chain, and a set of contains() calls in check(). This table
 * replaces all four, so adding a type or renaming a label touches one entry.
 *
 * This module deliberately imports nothing from "obsidian". Everything the
 * resolvers need arrives through InputContext, which keeps the table testable
 * outside Obsidian and keeps the Obsidian coupling in main.ts.
 */

/**
 * The sentinel upstream stores at index 0 of inputTypes to mean "several
 * inputs". It lives here rather than in main.ts so that the settings UI can
 * reach it without importing main, which would form an import cycle.
 */
export const MULTIPLE = "Multiple";

export type JsonShape = "string" | "object" | "array";

/** Conditions a launcher needs before its command becomes available. */
export type Requirement =
	| "activeFile"
	| "sourceMode"
	| "selection"
	| "linkAtCursor";

/** The subset of Obsidian's FrontMatterInfo this plugin uses. */
export interface FrontMatterInfoLike {
	exists: boolean;
	contentStart: number;
}

/** The subset of Obsidian's TFile this plugin uses. */
export interface FileRef {
	path: string;
	basename: string;
}

export interface InputContext {
	file: FileRef | null;
	vaultName: string;
	/** Absolute path of the vault root, or null where there is no filesystem. */
	vaultPath: string | null;
	isMobile: boolean;
	readActiveFile(): Promise<string>;
	frontMatterInfo(text: string): FrontMatterInfoLike;
	properties(): Record<string, unknown>;
	backlinks(): string[];
	selection(): string;
	linkOrEmbedContents(): Promise<string>;
	currentParagraph(): Promise<string>;
	notify(message: string): void;
}

export interface InputType {
	/**
	 * Persisted in data.json. For types that existed upstream this is
	 * upstream's exact string, so renaming a label needs no migration and
	 * settings stay readable by upstream's build.
	 */
	id: string;
	/** Shown in the UI. */
	label: string;
	/** Default key when the launcher outputs a JSON dictionary. */
	key: string;
	jsonShape: JsonShape;
	requires: Requirement[];
	/** Needs a real filesystem, so it yields "" on mobile. */
	desktopOnly?: boolean;
	resolve(ctx: InputContext): Promise<unknown>;
}

/** Join a vault root to a vault-relative path. Vault paths always use "/". */
export function joinVaultPath(root: string, relative: string): string {
	return `${root.replace(/\/+$/, "")}/${relative.replace(/^\/+/, "")}`;
}

export const INPUT_TYPES: InputType[] = [
	{
		id: "Selected Text",
		label: "Selected Text",
		key: "selectedText",
		jsonShape: "string",
		requires: ["selection"],
		resolve: async (ctx) => ctx.selection(),
	},
	{
		id: "Selected Link/Embed Contents",
		label: "Selected Link/Embed Contents",
		key: "linkContents",
		jsonShape: "string",
		requires: ["activeFile", "sourceMode", "linkAtCursor"],
		resolve: (ctx) => ctx.linkOrEmbedContents(),
	},
	{
		id: "Current Paragraph",
		label: "Current Paragraph",
		key: "paragraph",
		jsonShape: "string",
		requires: ["activeFile", "sourceMode"],
		resolve: (ctx) => ctx.currentParagraph(),
	},
	{
		id: "Entire Document",
		label: "Entire Note",
		key: "noteText",
		jsonShape: "string",
		requires: ["activeFile"],
		resolve: (ctx) => ctx.readActiveFile(),
	},
	{
		id: "Note Content",
		label: "Note Content",
		key: "noteContent",
		jsonShape: "string",
		requires: ["activeFile"],
		resolve: async (ctx) => {
			const text = await ctx.readActiveFile();
			const info = ctx.frontMatterInfo(text);
			if (!info.exists) {
				// contentStart is only meaningful when a block exists, though
				// Obsidian does report 0 when there is none.
				return text;
			}
			// contentStart already sits past the closing --- and its newline,
			// verified against Obsidian 1.13.2. Slicing is therefore exact: it
			// keeps a blank line the author put after the properties block, and
			// keeps indentation that opens the body.
			return text.slice(info.contentStart);
		},
	},
	{
		id: "Link to Document",
		label: "Link to Note",
		key: "noteLink",
		jsonShape: "string",
		requires: ["activeFile"],
		resolve: async (ctx) =>
			`obsidian://open?vault=${encodeURIComponent(
				ctx.vaultName
			)}&file=${encodeURIComponent(ctx.file!.path)}`,
	},
	{
		id: "Document Name",
		label: "Note Name",
		key: "noteName",
		jsonShape: "string",
		requires: ["activeFile"],
		resolve: async (ctx) => ctx.file!.basename,
	},
	{
		id: "Document Path",
		label: "Note Path",
		key: "notePath",
		jsonShape: "string",
		requires: ["activeFile"],
		resolve: async (ctx) => ctx.file!.path,
	},
	{
		id: "Absolute Note Path",
		label: "Absolute Note Path",
		key: "absoluteNotePath",
		jsonShape: "string",
		requires: ["activeFile"],
		desktopOnly: true,
		resolve: async (ctx) =>
			joinVaultPath(ctx.vaultPath!, ctx.file!.path),
	},
	{
		id: "Vault Path",
		label: "Vault Path",
		key: "vaultPath",
		jsonShape: "string",
		requires: [],
		desktopOnly: true,
		resolve: async (ctx) => ctx.vaultPath!,
	},
	{
		id: "Backlinks to Document",
		label: "Backlinks to Note",
		key: "backlinks",
		jsonShape: "array",
		requires: ["activeFile"],
		resolve: async (ctx) => ctx.backlinks(),
	},
	{
		id: "Properties",
		label: "Properties",
		key: "properties",
		jsonShape: "object",
		requires: ["activeFile"],
		resolve: async (ctx) => ctx.properties(),
	},
];

const BY_ID = new Map(INPUT_TYPES.map((type) => [type.id, type]));

export function inputTypeById(id: string): InputType | undefined {
	return BY_ID.get(id);
}

/** Dropdown options, as Obsidian's addOptions expects them: id -> label. */
export function inputTypeOptions(): Record<string, string> {
	const options: Record<string, string> = {};
	for (const type of INPUT_TYPES) {
		options[type.id] = type.label;
	}
	return options;
}

/** The label to display for a stored id, falling back to the id itself. */
export function inputTypeLabel(id: string): string {
	return BY_ID.get(id)?.label ?? id;
}

/**
 * Resolve one input, applying the desktop-only guard centrally so each
 * resolver stays a single expression.
 */
export async function resolveInput(
	type: InputType,
	ctx: InputContext
): Promise<unknown> {
	if (type.desktopOnly && (ctx.isMobile || ctx.vaultPath === null)) {
		ctx.notify(`${type.label} is unavailable on mobile.`);
		return "";
	}
	return type.resolve(ctx);
}
