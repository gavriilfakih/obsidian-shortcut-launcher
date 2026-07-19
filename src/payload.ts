/**
 * Turning resolved inputs into the text handed to Shortcuts.
 *
 * Pure: no Obsidian, no Node. Separator output must stay byte-identical to
 * upstream's, so launchers written before this fork behave exactly as before.
 */

import type { InputType } from "./inputTypes";

export type OutputFormat = "separator" | "json";

export interface ResolvedInput {
	type: InputType;
	key: string;
	value: unknown;
}

/**
 * Flatten one value for separator output. Upstream stringified Properties and
 * newline-joined backlinks; both are reproduced here exactly.
 */
export function toSeparatorText(type: InputType, value: unknown): string {
	if (type.jsonShape === "object") {
		return JSON.stringify(value ?? {});
	}
	if (type.jsonShape === "array") {
		return ((value as string[]) ?? []).join("\n");
	}
	return (value as string) ?? "";
}

export function buildPayload(
	inputs: ResolvedInput[],
	format: OutputFormat,
	separator: string
): string {
	if (format === "json") {
		const dictionary: Record<string, unknown> = {};
		for (const input of inputs) {
			dictionary[input.key] = input.value;
		}
		return JSON.stringify(dictionary);
	}
	return inputs
		.map((input) => toSeparatorText(input.type, input.value))
		.join(separator);
}

/**
 * The JSON key for each input, preferring a saved override.
 *
 * Overrides are positional rather than keyed by input type because the same
 * type may appear more than once in a launcher.
 */
export function resolveKeys(
	types: InputType[],
	overrides: string[] | undefined
): string[] {
	return types.map((type, index) => {
		const override = overrides?.[index]?.trim();
		return override ? override : type.key;
	});
}

/** The first key used more than once, or null when all are distinct. */
export function duplicateKey(keys: string[]): string | null {
	const seen = new Set<string>();
	for (const key of keys) {
		if (seen.has(key)) {
			return key;
		}
		seen.add(key);
	}
	return null;
}
