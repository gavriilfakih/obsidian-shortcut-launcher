# JSON input, Notes terminology, and shortcut identifiers

This fork of [Shortcut Launcher](https://github.com/macstories/obsidian-shortcut-launcher) adds a JSON dictionary output mode for multi-input launchers, renames the ‘Document’ input types to ‘Note’, and accepts a shortcut identifier in place of a name. It tracks upstream and merges from it; it does not send pull requests back.

## Scope

Four changes, in dependency order:

1. Replace the four duplicated input-type lists with a single registry.
2. Add three input types: Note Content, Vault Path, Absolute Note Path.
3. Add a JSON dictionary output format with editable keys, as an alternative to the separator.
4. Accept a shortcut name or identifier, with a picker that lists installed shortcuts.

## Fork and update strategy

The repository is a standalone public repository, not a GitHub fork. A fork badges the repository as derived and points new pull requests at upstream, which is not wanted here. A standalone repository with an `upstream` remote merges from upstream identically.

| Remote | URL | Use |
| --- | --- | --- |
| `origin` | `gavriilfakih/obsidian-shortcut-launcher` | Push. Work directly on `main`. |
| `upstream` | `macstories/obsidian-shortcut-launcher` | Fetch only. |

Take upstream changes with `git fetch upstream && git merge upstream/main`.

Merge conflicts are the reason for the registry in the next section. Upstream keeps its input types in four places: two dropdown option lists, an `if`/`else if` chain in `main.ts`, and a set of `contains()` calls in `check()`. Editing those in place puts this fork's changes on exactly the lines upstream touches when it adds an input type. Consolidating them into one table confines future conflicts to that table.

### Working directory constraint

`git clone` into `~/Developer` fails under the agent sandbox: `.git/hooks/*.sample` and `.git/config` are not writable there. Clone and configure remotes in `$TMPDIR`, then move the directory into place. Committing inside an existing repository under `~/Developer` works; only repository creation and `.git/config` writes are blocked.

## Input type registry

A single exported table in `src/inputTypes.ts` replaces the four lists. Each entry:

```ts
interface InputType {
	id: string;              // persisted in data.json; never changes
	label: string;           // shown in the UI
	key: string;             // default JSON key
	jsonShape: "string" | "object" | "array";
	requires?: Requirement[]; // gates command availability
	desktopOnly?: boolean;
	resolve(ctx: InputContext): Promise<unknown>;
}
```

`id` retains upstream's exact strings for every pre-existing type. This is what makes the rename free of migration: an existing `data.json` referring to `Document Path` keeps working, because only `label` changes. The four launchers currently configured in the vault (`Document Path` twice, `Document Name`, `Entire Document`) are unaffected.

| `id` (persisted) | `label` (displayed) | Default key | JSON shape |
| --- | --- | --- | --- |
| `Selected Text` | Selected Text | `selectedText` | string |
| `Selected Link/Embed Contents` | Selected Link/Embed Contents | `linkContents` | string |
| `Current Paragraph` | Current Paragraph | `paragraph` | string |
| `Entire Document` | Entire Note | `noteText` | string |
| `Link to Document` | Link to Note | `noteLink` | string |
| `Document Name` | Note Name | `noteName` | string |
| `Document Path` | Note Path | `notePath` | string |
| `Backlinks to Document` | Backlinks to Note | `backlinks` | array |
| `Properties` | Properties | `properties` | object |
| `Note Content` | Note Content | `noteContent` | string |
| `Vault Path` | Vault Path | `vaultPath` | string |
| `Absolute Note Path` | Absolute Note Path | `absoluteNotePath` | string |

New types take their label as their `id`, since they have no upstream string to preserve.

`check()` becomes a fold over the `requires` flags of the selected types rather than a sequence of special cases. The flags are `activeFile`, `sourceMode`, `selection`, and `linkAtCursor`, each corresponding to one existing branch of upstream's `check()`.

## New input types

**Note Content** returns the note body with the properties block removed. Obsidian's API supplies this directly:

```ts
const text = await this.app.vault.read(file);
const info = getFrontMatterInfo(text);
return info.exists ? text.slice(info.contentStart) : text;
```

`contentStart` sits past the closing `---` **and** the newline that follows it, so slicing needs no further trimming. This was measured by calling `getFrontMatterInfo` in Obsidian 1.13.2 rather than inferred from the documented wording, which says only that the block ends 'including the ---' and is ambiguous about the newline. The measurements are the fixture table in `tests/inputTypes.test.ts`; reimplementing the function in the test would only have tested the reimplementation.

The distinction matters: a blank line the author left after the properties block appears in the slice as a leading `\n` and must survive. An earlier draft stripped one leading newline defensively, which would have silently eaten that line.

The `exists` flag is tested rather than relying on `contentStart` being `0` when a note has no properties, though it was measured as `0`.

The function is available since Obsidian 1.5.7, so `minAppVersion` in `manifest.json` rises from `0.15.0` to `1.5.7`.

The term ‘content’ follows Obsidian rather than this plugin: `FrontMatterInfo.contentStart` and the documentation for `getAllTags` (‘combines all tags from frontmatter and note content’) both use it for the body after the properties block.

**Vault Path** returns the vault root's absolute path, via `getBasePath()` on the vault adapter when that adapter is a `FileSystemAdapter`.

**Absolute Note Path** returns the vault path joined to the active note's vault-relative path.

Both are desktop-only: mobile has no filesystem path to report.

## JSON output format

Output format is a property of the launcher, not an input type. Adding a ‘Dictionary’ entry to the input-type dropdown would conflate what data is collected with how it is serialised, which is the conflation upstream's `Multiple` sentinel already makes once. The format selector therefore sits beside the separator field, and appears only when Input Type is `Multiple`, where the separator appears today. A single-input launcher continues to send a bare string.

Selecting JSON replaces the separator field with a per-input **Key** text field, pre-filled from the registry's default key and editable.

`jsonShape` determines how each value enters the dictionary. Properties becomes a nested object and Backlinks to Note becomes an array, rather than strings that a shortcut would have to parse a second time:

```json
{
  "notePath": "Notes/Milton.md",
  "vaultPath": "/Users/gavriilfakih/Vault",
  "noteContent": "Milton's prose tracts argue…",
  "properties": { "tags": ["ppe"], "status": "draft" },
  "backlinks": ["Notes/Areopagitica.md", "Notes/Civil War.md"]
}
```

Separator output is unchanged: Properties is still `JSON.stringify`d and Backlinks to Note is still newline-joined, so existing launchers produce byte-identical input.

Keys must be unique within a launcher. Upstream permits the same input type twice, so duplicate keys are reachable; saving with duplicates is rejected with a notice naming the repeated key.

In JSON mode the desktop temporary file is written with a `.json` extension so `shortcuts run` can infer its type. Whether Shortcuts then delivers a dictionary or text depends on the runtime and must be confirmed by testing; a shortcut using ‘Get dictionary from input’ handles both.

## Shortcut selection

`shortcuts run` accepts `<shortcut-name-or-identifier>`, so passing an identifier requires no change to the invocation. The work is in the settings UI.

The **Shortcut Name** field becomes **Shortcut**, described as ‘Name or identifier of the shortcut to run’, and is passed through verbatim.

A **Pick…** button runs `shortcuts list --show-identifiers` and presents the results in a `FuzzySuggestModal`. Selecting an entry stores the identifier, which survives the shortcut being renamed.

Output is one shortcut per line, formatted `Name (UUID)`:

```
Organise Reading List by Topic (B6351202-CC76-42FA-8A77-9BB6D2B25010)
```

Shortcut names may themselves contain parentheses, so the parser anchors a UUID pattern at end of line rather than splitting on the first `(`. Lines that do not match are skipped. If the command exits non-zero or returns nothing, a notice reports the failure and the text field is left alone.

Selecting from the picker also stores `shortcutLabel`, the human-readable name, used only to render the settings list. Without it a launcher configured by identifier would display as a bare UUID.

## Mobile behaviour

Mobile launches shortcuts through `shortcuts://run-shortcut?name=…`, which takes a name and has no identifier parameter and no filesystem access. Rather than dropping mobile support, each affected feature degrades:

| Feature | Mobile behaviour |
| --- | --- |
| JSON output | Works. The dictionary is passed as URL-encoded text. |
| Vault Path, Absolute Note Path | Resolve to `""` and show a notice. |
| Identifier in the Shortcut field | Notice that identifiers are desktop-only; the value is still sent as `name`. |
| Pick… button | Hidden. |

An identifier is detected by matching the canonical 36-character UUID form.

## Settings schema

Every added field is optional, so a launcher written by upstream's version loads and behaves identically:

```ts
interface Launcher {
	commandName: string;
	shortcutName: string;      // now a name or an identifier; field name kept for compatibility
	inputTypes: string[];      // unchanged, including the "Multiple" sentinel at index 0
	separator: string;         // unchanged
	outputFormat?: "separator" | "json";  // added; absent means "separator"
	keys?: string[];           // added; positionally aligned with inputTypes
	shortcutLabel?: string;    // added; display only, never used to launch
}
```

`keys` is positional rather than keyed by input type because the same type may appear more than once in a launcher. The modal splices `keys` alongside `inputTypes` whenever a row is added or removed, which matches how upstream already maintains `inputTypes`.

No migration runs at any point. `data.json` written by this fork remains readable by upstream's version, which ignores the unknown fields.

## Files

| File | Change |
| --- | --- |
| `src/inputTypes.ts` | New. The registry, requirement flags, and resolvers. |
| `src/ShortcutPicker.ts` | New. `shortcuts list` invocation, output parsing, suggest modal. |
| `src/main.ts` | Reduced. Iterates the registry, assembles the payload, dispatches. |
| `src/LauncherModal.ts` | Dropdowns built from the registry; format selector, key fields, Pick… button. |
| `src/SettingsTab.ts` | Renders `shortcutLabel` when present; passes new fields through. |
| `manifest.json` | `minAppVersion` to `1.5.7`. |
| `README.md` | Documents the fork's differences from upstream. |
| `AGENTS.md`, `CLAUDE.md` | Added per the conventions in `~/Developer/AGENTS.md`. |

## Verification

The plugin has no test suite and its behaviour is mostly Obsidian and Shortcuts integration, so verification is manual against a build installed in the vault:

1. The four existing launchers run unchanged after upgrade, with no edit to `data.json`.
2. A multi-input launcher in separator mode produces the same bytes as before.
3. A multi-input launcher in JSON mode produces a dictionary whose Properties value is an object and whose Backlinks value is an array.
4. Note Content omits the properties block, and returns the whole note when there is none.
5. Vault Path and Absolute Note Path resolve on desktop.
6. A launcher configured by identifier runs after its shortcut is renamed.
7. The picker lists shortcuts and handles a name containing parentheses.

## Out of scope

- Folder filtering in the shortcut picker, although `shortcuts list --folders` would support it.
- Reading shortcut output back into the note. `shortcuts run` has `--output-path`, but nothing currently consumes it.
- Per-input JSON output for single-input launchers.
- Sending any of this upstream.
