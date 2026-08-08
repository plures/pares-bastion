import { describe, it, expect } from 'vitest';
import {
	extractTemplateVariables,
	renderTemplate,
	renderBulkPreviews,
	validateTemplate,
} from '../bulk-config.js';
import type { BulkConfigTemplate, BulkConfigTarget } from '../bulk-config.js';

// ─── extractTemplateVariables ───────────────────────────────────────────────

describe('extractTemplateVariables', () => {
	it('returns empty array for body with no placeholders', () => {
		expect(extractTemplateVariables('hostname core-rtr-01')).toEqual([]);
	});

	it('extracts unique variables', () => {
		const body = 'hostname {{hostname}}\nip address {{ip}} {{ip}}';
		expect(extractTemplateVariables(body)).toEqual(['hostname', 'ip']);
	});
});

// ─── renderTemplate ─────────────────────────────────────────────────────────

describe('renderTemplate', () => {
	const template: BulkConfigTemplate = {
		id: 'ntp',
		name: 'NTP Config',
		body: 'hostname {{hostname}}\nntp server {{ntpServer}}',
		variables: ['hostname', 'ntpServer'],
	};

	it('substitutes all variables', () => {
		const target: BulkConfigTarget = {
			hostname: 'core-rtr-01',
			variables: { hostname: 'core-rtr-01', ntpServer: '10.0.0.100' },
		};
		const result = renderTemplate(template, target);
		expect(result.rendered).toBe('hostname core-rtr-01\nntp server 10.0.0.100');
		expect(result.warnings).toHaveLength(0);
	});

	it('warns on missing variables and preserves placeholder', () => {
		const target: BulkConfigTarget = {
			hostname: 'edge-rtr-01',
			variables: { hostname: 'edge-rtr-01' },
		};
		const result = renderTemplate(template, target);
		expect(result.rendered).toContain('{{ntpServer}}');
		expect(result.warnings).toEqual(['Missing variable: {{ntpServer}}']);
	});
});

// ─── renderBulkPreviews ─────────────────────────────────────────────────────

describe('renderBulkPreviews', () => {
	it('renders previews for multiple targets', () => {
		const template: BulkConfigTemplate = {
			id: 'snmp',
			name: 'SNMP Community',
			body: 'snmp-server community {{community}} RO',
			variables: ['community'],
		};
		const targets: BulkConfigTarget[] = [
			{ hostname: 'rtr-01', variables: { community: 'public' } },
			{ hostname: 'rtr-02', variables: { community: 'private' } },
		];
		const previews = renderBulkPreviews(template, targets);
		expect(previews).toHaveLength(2);
		expect(previews[0].hostname).toBe('rtr-01');
		expect(previews[0].rendered).toBe('snmp-server community public RO');
		expect(previews[1].rendered).toBe('snmp-server community private RO');
	});
});

// ─── validateTemplate ───────────────────────────────────────────────────────

describe('validateTemplate', () => {
	it('returns error for empty body', () => {
		const errors = validateTemplate('');
		expect(errors).toContain('Template body is empty');
	});

	it('returns no errors for valid template', () => {
		expect(validateTemplate('ntp server {{server}}')).toEqual([]);
	});

	it('detects unbalanced placeholders', () => {
		const errors = validateTemplate('hostname {{name}');
		expect(errors).toContain('Unbalanced {{ }} placeholders');
	});
});
