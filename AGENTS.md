# Shortcut Launcher (fork)

A fork of [macstories/obsidian-shortcut-launcher](https://github.com/macstories/obsidian-shortcut-launcher). It tracks upstream and merges from it. It does not send pull requests back, so do not open one or suggest one.

## Fork constraints

`upstream` is a fetch-only remote. Take changes with `git fetch upstream && git merge upstream/main`.

Every deliberate difference from upstream is listed in `README.md` under 'Differences from upstream'. Keep that list current: it is the only record of what a merge conflict is protecting.

Two rules exist to keep merges cheap:

- **Add input types by adding a row to `INPUT_TYPES` in `src/inputTypes.ts`, never by adding a branch elsewhere.** Upstream repeats its input types in four places; this fork has one. Reintroducing a second place reintroduces the conflicts.
- **Never change an `id` in `INPUT_TYPES`.** Ids are persisted in `data.json`, and the pre-existing ones are upstream's exact strings. That is what lets this fork rename labels with no migration and stay readable by upstream's build. Rename `label`; leave `id` alone.

**Never change the plugin `id` in `manifest.json` either.** Sharing upstream's id is safe and load-bearing, not an oversight:

- Obsidian namespaces commands as `<plugin-id>:<command>`, so renaming the plugin renames every command. In this vault `cmdr` already references `obsidian-shortcut-launcher:share`, and hotkeys bind the same ids. They would break silently.
- Nothing can update over it. Obsidian's update check iterates the community plugin list and skips entries that are not installed, so a plugin absent from that list is never reached. Upstream was delisted; it is in none of the ~5,800 entries in `community-plugins.json`.

## Releasing

`./release.sh <version>` (or `pnpm run release <version>`) bumps the three version fields, runs the tests and build, tags, and attaches `manifest.json` and `main.js` to a GitHub release. BRAT installs and updates this fork by reading those releases, so a change is not delivered anywhere until a release is cut.

`versions.json` takes `minAppVersion` from `manifest.json` rather than upstream's hardcoded `0.13.0`.

## Terminology

Notes are called notes, not documents. The word 'Document' survives only in `id` values, where it is a storage detail and must not be shown to the user. `label` is the display string; a test asserts no label contains 'Document'.

'Content' means the note body without its properties block, following Obsidian's own `FrontMatterInfo.contentStart`.

## Layout

| File | Contents |
| --- | --- |
| `src/inputTypes.ts` | The input type registry. No `obsidian` import: Obsidian is injected through `InputContext`. |
| `src/payload.ts` | Separator and JSON assembly. Pure. |
| `src/shortcutList.ts` | Parsing `shortcuts list --show-identifiers`. Pure. |
| `src/ShortcutPicker.ts` | The picker modal and the CLI call. |
| `src/main.ts` | Wiring: builds `InputContext`, resolves inputs, dispatches. |
| `src/LauncherModal.ts`, `src/SettingsTab.ts` | Settings UI. |

`inputTypes.ts`, `payload.ts`, and `shortcutList.ts` import nothing from `obsidian` or Node. Keep it that way: it is what makes them testable, and the tests are the only automated check this project has.

## Build and test

```shell
pnpm install
node --test tests/*.test.ts          # or: pnpm test
npx tsc -noEmit -skipLibCheck
node esbuild.config.mjs production    # writes main.js
```

Tests run on Node's native TypeScript support, so they need no test framework and no new dependency. Two consequences:

- Test files must import with explicit `.ts` extensions, which TypeScript 4.7 rejects, so `tests` is excluded in `tsconfig.json`. `tsc` covers shipped code only.
- Import types with `import type`, or Node fails at runtime trying to resolve a type as a binding.

Do not add a test framework or bump TypeScript to get around either point. Both changes would conflict with upstream's `package.json` for no functional gain.

### Testing against the running app

Behaviour that depends on Obsidian or Shortcuts is verified through the `obsidian` CLI against a live vault, not mocked:

```shell
obsidian plugin:reload id=obsidian-shortcut-launcher
obsidian dev:errors
obsidian eval code='…'
```

Two things to know before writing such a check:

- Modals do not open from `eval`. Capture the instance by stubbing `open()` on the prototypes in `app.setting`'s chain that own it, then call `onOpen()` directly.
- Every Obsidian dropdown renders a second, single-option `<select>` alongside the real one. Select dropdowns by their options, never by position, or you will drive a decoy.

When measuring Obsidian API behaviour, record the measurements as fixtures rather than reimplementing the API in the test.

## Conventions

- Prose uses British quotes and Hart's Rules. The canonical guides are `~/Vault/Meta/Style/Documentation.md` and `Typography.md`.
- Tabs for indentation, matching upstream and `.editorconfig`.
