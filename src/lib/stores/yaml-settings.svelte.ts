import {
	SETTINGS_SCHEMA,
	getDefaultValues,
	toNestedObject,
	fromNestedObject,
	type SettingDefinition,
} from '$lib/types/settings-schema.js';

const SETTINGS_YAML_KEY = 'netops-toolkit-settings-yaml';

// ─── YAML Settings Store (Svelte 5 runes) ──────────────────────────────────
// Stores settings as flat dot-notation keys internally.
// Serializes to/from YAML for the editor and persistence.

class YamlSettingsStore {
	/** Flat settings map: "ssh.defaultTimeout" → 30 */
	values = $state<Record<string, unknown>>(getDefaultValues());

	/** Raw YAML string shown in the editor */
	yamlText = $state('');

	/** Whether the YAML editor has unsaved changes */
	dirty = $state(false);

	/** Last parse error (shown in editor) */
	parseError = $state('');

	constructor() {
		this.load();
		this.regenerateYaml();
	}

	// ── Get / Set individual values ─────────────────────────────────────────

	get(key: string): unknown {
		return this.values[key];
	}

	set(key: string, value: unknown): void {
		this.values[key] = value;
		this.regenerateYaml();
		this.save();
	}

	getTyped<T>(key: string, fallback: T): T {
		const v = this.values[key];
		return (v ?? fallback) as T;
	}

	// ── YAML Editor ─────────────────────────────────────────────────────────

	updateYaml(text: string): void {
		this.yamlText = text;
		this.dirty = true;
		this.parseError = '';
	}

	applyYaml(): boolean {
		try {
			const nested = parseSimpleYaml(this.yamlText);
			const flat = fromNestedObject(nested);

			// Validate against schema
			for (const [key, value] of Object.entries(flat)) {
				const def = SETTINGS_SCHEMA.find((s) => s.key === key);
				if (def) {
					const validated = validateValue(def, value);
					if (validated !== undefined) {
						flat[key] = validated;
					}
				}
			}

			this.values = { ...getDefaultValues(), ...flat };
			this.dirty = false;
			this.parseError = '';
			this.save();
			return true;
		} catch (err) {
			this.parseError = err instanceof Error ? err.message : 'Invalid YAML';
			return false;
		}
	}

	resetToDefaults(): void {
		this.values = getDefaultValues();
		this.regenerateYaml();
		this.dirty = false;
		this.save();
	}

	// ── Persistence ─────────────────────────────────────────────────────────

	private load(): void {
		if (typeof localStorage === 'undefined') return;
		const raw = localStorage.getItem(SETTINGS_YAML_KEY);
		if (!raw) return;
		try {
			const parsed = JSON.parse(raw) as Record<string, unknown>;
			this.values = { ...getDefaultValues(), ...parsed };
		} catch {
			// corrupted, use defaults
		}
	}

	private save(): void {
		if (typeof localStorage === 'undefined') return;
		localStorage.setItem(SETTINGS_YAML_KEY, JSON.stringify(this.values));
	}

	private regenerateYaml(): void {
		const nested = toNestedObject(this.values);
		this.yamlText = objectToYaml(nested);
		this.dirty = false;
	}
}

export const yamlSettingsStore = new YamlSettingsStore();

// ─── Simple YAML Serializer ─────────────────────────────────────────────────
// We use a simple YAML generator/parser rather than pulling in a full YAML lib.
// Handles flat key-value pairs nested by category — sufficient for settings.

function objectToYaml(obj: Record<string, unknown>, indent = 0): string {
	const lines: string[] = [];
	const pad = '  '.repeat(indent);

	for (const [key, value] of Object.entries(obj)) {
		if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
			// Find description for first child to add a section comment
			lines.push('');
			lines.push(`${pad}# ── ${key} ${'─'.repeat(Math.max(0, 60 - key.length - indent * 2))} `);
			lines.push(`${pad}${key}:`);
			lines.push(objectToYaml(value as Record<string, unknown>, indent + 1));
		} else {
			// Add inline comment with description if available
			const fullKey = getFullKey(obj, key, indent);
			const def = SETTINGS_SCHEMA.find((s) => s.key === fullKey);
			const comment = def ? `  # ${def.description}` : '';

			if (typeof value === 'string') {
				lines.push(`${pad}${key}: "${value}"${comment}`);
			} else if (typeof value === 'boolean') {
				lines.push(`${pad}${key}: ${value}${comment}`);
			} else if (typeof value === 'number') {
				lines.push(`${pad}${key}: ${value}${comment}`);
			} else {
				lines.push(`${pad}${key}: ${String(value)}${comment}`);
			}
		}
	}

	return lines.join('\n');
}

/** Reconstruct the full dot-notation key for YAML generation */
function getFullKey(
	_obj: Record<string, unknown>,
	key: string,
	indent: number,
): string {
	// The indent level corresponds to the nesting depth in the schema
	// e.g., indent=1, key="defaultTimeout" → we need to find which category
	// For simplicity, do a fuzzy match
	const match = SETTINGS_SCHEMA.find((s) => s.key.endsWith(`.${key}`) || s.key === key);
	return match?.key ?? key;
}

/** Simple YAML parser — handles our structured settings format */
function parseSimpleYaml(text: string): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	const stack: { obj: Record<string, unknown>; indent: number }[] = [
		{ obj: result, indent: -1 },
	];

	for (const rawLine of text.split('\n')) {
		// Strip comments
		const commentIdx = rawLine.indexOf('#');
		const line =
			commentIdx >= 0
				? rawLine.slice(0, commentIdx).trimEnd()
				: rawLine.trimEnd();

		if (!line.trim()) continue;

		const indent = line.length - line.trimStart().length;
		const trimmed = line.trim();

		// Pop stack to find parent
		while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
			stack.pop();
		}
		const parent = stack[stack.length - 1].obj;

		if (trimmed.endsWith(':')) {
			// Section header
			const key = trimmed.slice(0, -1).trim();
			const section: Record<string, unknown> = {};
			parent[key] = section;
			stack.push({ obj: section, indent });
		} else if (trimmed.includes(':')) {
			// Key: value
			const colonIdx = trimmed.indexOf(':');
			const key = trimmed.slice(0, colonIdx).trim();
			let valueStr = trimmed.slice(colonIdx + 1).trim();

			// Parse value
			if (valueStr.startsWith('"') && valueStr.endsWith('"')) {
				parent[key] = valueStr.slice(1, -1);
			} else if (valueStr === 'true') {
				parent[key] = true;
			} else if (valueStr === 'false') {
				parent[key] = false;
			} else if (valueStr === 'null') {
				parent[key] = null;
			} else if (!isNaN(Number(valueStr)) && valueStr !== '') {
				parent[key] = Number(valueStr);
			} else {
				parent[key] = valueStr;
			}
		}
	}

	return result;
}

/** Validate and coerce a value against its schema definition */
function validateValue(def: SettingDefinition, value: unknown): unknown {
	switch (def.type) {
		case 'boolean':
			return typeof value === 'boolean' ? value : undefined;
		case 'number': {
			const num = Number(value);
			if (isNaN(num)) return undefined;
			const clamped = Math.min(
				Math.max(num, def.min ?? -Infinity),
				def.max ?? Infinity,
			);
			return clamped;
		}
		case 'enum':
			return def.options?.includes(String(value)) ? value : undefined;
		case 'string':
		case 'path':
		case 'password':
			return typeof value === 'string' ? value : undefined;
		default:
			return value;
	}
}
