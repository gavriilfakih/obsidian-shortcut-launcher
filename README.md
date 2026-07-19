# Obsidian Shortcut Launcher

> **This is a personal fork** of [macstories/obsidian-shortcut-launcher](https://github.com/macstories/obsidian-shortcut-launcher). It tracks upstream and merges from it, but sends nothing back. See [Differences from Upstream](#differences-from-upstream). For the original, use upstream.

![](https://cdn.macstories.net/osl-1643193603979.png)

Trigger shortcuts in Apple's Shortcuts app as custom commands from Obsidian.

Obsidian Shortcut Launcher (abbreviated as 'OSL') lets you trigger shortcuts and pass along values from Obsidian as input. On iOS and iPadOS, shortcuts are triggered from Obsidian using Apple's official URL scheme for Shortcuts; on macOS, OSL can run shortcuts in the background – without opening the Shortcuts app.

![](https://cdn.macstories.net/cleanshot-2022-01-21-at-5-39-50-2x-1642783463880.png)

The plugin **requires iOS 15, iPadOS 15, or macOS Monterey**, and **Obsidian 1.5.7 or later**.

## Differences from Upstream

| Change | Detail |
| --- | --- |
| Notes, not documents | Every input type that said 'Document' now says 'Note'. Stored settings are unchanged, so no migration runs and upstream's build still reads them. |
| JSON dictionary output | A launcher passing several inputs can send a JSON dictionary with named keys instead of separator-joined text. |
| Three new input types | Note Content, Vault Path, and Absolute Note Path. |
| Shortcut by identifier | The shortcut field takes a name *or* an identifier, with a picker that lists installed shortcuts. |
| Tests | `pnpm test` runs unit tests on Node's native TypeScript support, with no added dependency. |

Nothing else is intentionally different. Upstream's separator output is reproduced byte for byte.

## Installing

This fork is not in Obsidian's Community Plugins list. Build it and copy the output into your vault:

```shell
pnpm install
npx tsc -noEmit -skipLibCheck && node esbuild.config.mjs production
cp main.js manifest.json ~/YourVault/.obsidian/plugins/obsidian-shortcut-launcher/
```

It keeps upstream's plugin id, so it replaces an existing OSL install and inherits its settings. Because it shares that id, Obsidian may offer to 'update' it back to the community version; its version number is set ahead of upstream's to avoid that, but do not accept such an update.

## Creating Launchers for Shortcuts

![Creating launchers for Shortcuts in Obsidian.](https://cdn.macstories.net/monday-24-jan-2022-18-21-39-1643044904822.png)

OSL works by creating "launchers" for shortcuts you want to run in the Shortcuts app. These launchers show up as individual commands in Obsidian.

You can create a new launcher for Shortcuts in OSL's settings by tapping the 'New' button. When creating a new launcher, there are three main fields you have to configure:

* **Command Name**: The name of the launcher. This will appear as a command in Obsidian. This name can be anything you want and does not need to match the name of the shortcut.
* **Shortcut**: The name or identifier of the shortcut to run. See [Choosing a Shortcut](#choosing-a-shortcut).
* **Input Type**: The input you want to pass from Obsidian to the Shortcuts app. See next section for more details.

## Choosing a Shortcut

The **Shortcut** field accepts either a shortcut's name or its identifier.

Press **Pick…** to list the shortcuts installed on this Mac and choose one. Picking stores the shortcut's *identifier*, which keeps the launcher working if you later rename the shortcut in the Shortcuts app. The settings list still shows the readable name.

Identifiers are macOS only. The URL scheme used on iOS and iPadOS takes a name, so a launcher configured by identifier warns and falls back to sending the identifier as a name there. Use a name for launchers you run on iPhone or iPad.

## Passing Input Values from Obsidian

![](https://cdn.macstories.net/cleanshot-2022-01-21-at-5-47-57-2x-1642783800591.png)

There are twelve input types you can pass from Obsidian to Shortcuts:

* **Selected Text**: The current text selection from Obsidian.
* **Current Paragraph**: The text of the paragraph the cursor is currently in. (Not available in Reading mode.)
* **Entire Note**: The entire text of the current note, including its properties block.
* **Note Content**: The body of the current note, *excluding* its properties block. Where the note has no properties, this is the same as Entire Note.
* **Link to Note**: The Obsidian URL to the current note.
* **Note Name**: The name of the current note, without file extension.
* **Note Path**: The path to the current note, relative to the vault.
* **Absolute Note Path**: The full filesystem path to the current note. macOS only.
* **Vault Path**: The full filesystem path to the vault itself. macOS only.
* **Selected Link/Embed Contents**: The contents of the file referenced in an [[internal link]] under the cursor. If the internal link points to a note, the full text of the note will be passed to Shortcuts as input; if the internal link points to an attachment (e.g. an image), the file will be encoded with base64 first and passed to Shortcuts as base64-encoded text. (Not available in Reading mode.)
* **Backlinks to Note**: A list of notes linking to the current note, separated by newlines.
* **Properties**: The [Properties](https://help.obsidian.md/Editing+and+formatting/Properties) of the current note as JSON.

On iOS and iPadOS the two filesystem paths yield an empty string and show a notice, since there is no vault path to report.

Here is an example of an Obsidian command that has passed the name of the current note to a shortcut in the Shortcuts app:

![](https://cdn.macstories.net/monday-24-jan-2022-18-23-05-1643044990698.png)

And here is how you can receive attachments from Obsidian and decode them using base64 in Shortcuts:

![](https://cdn.macstories.net/cleanshot-2022-01-26-at-12-03-47-2x-1643195055516.png)

## Passing Multiple Values

Selecting **Multiple** as the input type lets you pass several values at once. **Output Format** then controls how they are combined.

### Separator

The default. Values are joined with a separator, `,` by default. To read them in Shortcuts, use the 'Split Text' action with a matching Custom Separator.

![](https://cdn.macstories.net/cleanshot-2022-01-26-at-12-05-11-2x-1643195145281.png)

### JSON Dictionary

Values are sent as a JSON dictionary. Each input gets a **Key**, pre-filled with a sensible default and editable; keys must be unique within a launcher. Read it in Shortcuts with 'Get Dictionary from Input', then 'Get Value for Key'.

Properties and Backlinks to Note are nested as a real object and a real array, so a shortcut reads them directly instead of parsing a second time:

```json
{
  "notePath": "Notes/Milton.md",
  "vaultPath": "/Users/you/Vault",
  "noteContent": "Milton's prose tracts argue…",
  "properties": { "tags": ["ppe"], "status": "draft" },
  "backlinks": ["Notes/Areopagitica.md"]
}
```

Under Separator these two keep their original flat form: Properties as a JSON string, backlinks joined by newlines.

## Running Shortcuts with Input from Obsidian

![](https://cdn.macstories.net/cleanshot-2022-01-21-at-5-48-32-2x-1642783800940.png)

Text passed by OSL to a shortcut is available in the default 'Shortcut Input' variable of the Shortcuts app. In the case of files passed as base64-encoded text, you will have to decode the input first using the dedicated 'Decode Base64' action in Shortcuts.

Due to system limitations, on iOS and iPadOS 15 OSL needs to leave Obsidian and open the Shortcuts app to run a shortcut. That's because shortcuts can only be invoked by other apps with a URL scheme on iOS and iPadOS 15.

On macOS Monterey, OSL can run shortcuts in the background – without opening the Shortcuts app at all – thanks to shell commands. When using OSL on a Mac, you can trigger shortcuts as commands without leaving Obsidian – a powerful experience that perfectly complements the app.

## Development

```shell
pnpm install
pnpm test                             # unit tests, no framework needed
npx tsc -noEmit -skipLibCheck         # typecheck shipped code
node esbuild.config.mjs production    # writes main.js
```

See `AGENTS.md` for the rules that keep this fork mergeable with upstream.
