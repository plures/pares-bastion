/**
 * Bulk configuration preview utilities.
 *
 * Handles multi-device config template rendering, validation,
 * and preview generation for bulk operations.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BulkConfigTemplate {
	/** Unique template identifier. */
	id: string;
	/** Human-readable template name. */
	name: string;
	/** Template body with `{{variable}}` placeholders. */
	body: string;
	/** Variables expected in the template. */
	variables: string[];
}

export interface BulkConfigTarget {
	/** Device hostname. */
	hostname: string;
	/** Variable values for this device. */
	variables: Record<string, string>;
}

export interface BulkConfigPreview {
	/** Device hostname. */
	hostname: string;
	/** Rendered config output after variable substitution. */
	rendered: string;
	/** Validation warnings (e.g. missing variables). */
	warnings: string[];
}

// ─── Template logic ─────────────────────────────────────────────────────────

/**
 * Extract `{{variable}}` placeholders from a template body.
 */
export function extractTemplateVariables(body: string): string[] {
	const matches = body.match(/\{\{(\w+)\}\}/g);
	if (!matches) return [];
	return [...new Set(matches.map((m) => m.slice(2, -2)))];
}

/**
 * Render a template for a single target, replacing `{{var}}` placeholders.
 * Returns a preview with any warnings about missing variables.
 */
export function renderTemplate(
	template: BulkConfigTemplate,
	target: BulkConfigTarget
): BulkConfigPreview {
	const warnings: string[] = [];
	let rendered = template.body;

	for (const v of template.variables) {
		const value = target.variables[v];
		if (value === undefined || value === '') {
			warnings.push(`Missing variable: {{${v}}}`);
		}
		rendered = rendered.replaceAll(`{{${v}}}`, value ?? `{{${v}}}`);
	}

	return { hostname: target.hostname, rendered, warnings };
}

/**
 * Render a template for multiple targets, producing a preview per device.
 */
export function renderBulkPreviews(
	template: BulkConfigTemplate,
	targets: BulkConfigTarget[]
): BulkConfigPreview[] {
	return targets.map((t) => renderTemplate(template, t));
}

/**
 * Validate a template body: checks for non-empty body and balanced `{{` / `}}` tokens.
 */
export function validateTemplate(body: string): string[] {
	const errors: string[] = [];
	if (!body.trim()) {
		errors.push('Template body is empty');
		return errors;
	}

	// Check for unbalanced placeholders
	const openCount = (body.match(/\{\{/g) ?? []).length;
	const closeCount = (body.match(/\}\}/g) ?? []).length;
	if (openCount !== closeCount) {
		errors.push('Unbalanced {{ }} placeholders');
	}

	return errors;
}
