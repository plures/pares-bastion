// ─── Export Service ──────────────────────────────────────────────────────────
// Handles CSV and Excel (XLSX) exports from any table data.
// In the browser, generates files client-side via Blob.
// In Tauri, delegates to the Rust backend for native XLSX generation.

import { licenseStore } from '$lib/stores/license.svelte.js';
import { yamlSettingsStore } from '$lib/stores/yaml-settings.svelte.js';

export type ExportFormat = 'csv' | 'xlsx' | 'json' | 'yaml';

export interface ExportOptions {
	filename?: string;
	format?: ExportFormat;
	/** Which feature this export belongs to (for license gating) */
	feature?: string;
	/** Sheet name for XLSX */
	sheetName?: string;
}

export interface ExportResult {
	ok: boolean;
	error?: string;
	filename?: string;
	gated?: boolean; // true if rows were truncated due to license
}

// ─── CSV Export ─────────────────────────────────────────────────────────────

function escapeCSV(value: unknown): string {
	const str = String(value ?? '');
	if (str.includes(',') || str.includes('"') || str.includes('\n')) {
		return `"${str.replace(/"/g, '""')}"`;
	}
	return str;
}

function toCSV(columns: string[], rows: Record<string, unknown>[]): string {
	const header = columns.map(escapeCSV).join(',');
	const body = rows.map((row) => columns.map((col) => escapeCSV(row[col])).join(',')).join('\n');
	return `${header}\n${body}`;
}

// ─── XLSX Export (browser-side) ─────────────────────────────────────────────
// Uses a minimal XLSX generator — enough for structured table data.
// For full XLSX features (styles, formulas), the Rust backend uses rust_xlsxwriter.

function toXLSX(columns: string[], rows: Record<string, unknown>[], sheetName: string): Blob {
	// Generate a minimal Office Open XML spreadsheet
	const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

	let sheetData = '<sheetData>';

	// Header row
	sheetData += '<row r="1">';
	columns.forEach((col, i) => {
		const ref = `${String.fromCharCode(65 + (i % 26))}1`;
		sheetData += `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(col)}</t></is></c>`;
	});
	sheetData += '</row>';

	// Data rows
	rows.forEach((row, rowIdx) => {
		const r = rowIdx + 2;
		sheetData += `<row r="${r}">`;
		columns.forEach((col, i) => {
			const ref = `${String.fromCharCode(65 + (i % 26))}${r}`;
			const val = row[col];
			if (typeof val === 'number') {
				sheetData += `<c r="${ref}"><v>${val}</v></c>`;
			} else {
				sheetData += `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(String(val ?? ''))}</t></is></c>`;
			}
		});
		sheetData += '</row>';
	});

	sheetData += '</sheetData>';

	const worksheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
${sheetData}
</worksheet>`;

	const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`;

	const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;

	const relsRoot = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

	const relsWorkbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`;

	// Build ZIP manually using minimal structure
	// For browser, we use a simplified approach
	const files: Record<string, string> = {
		'[Content_Types].xml': contentTypes,
		'_rels/.rels': relsRoot,
		'xl/workbook.xml': workbook,
		'xl/_rels/workbook.xml.rels': relsWorkbook,
		'xl/worksheets/sheet1.xml': worksheet,
	};

	// Use simple ZIP construction
	return createSimpleZip(files);
}

/** Create a minimal ZIP file from string contents */
function createSimpleZip(files: Record<string, string>): Blob {
	const encoder = new TextEncoder();
	const entries: { name: Uint8Array; data: Uint8Array; offset: number }[] = [];
	const parts: Uint8Array[] = [];
	let offset = 0;

	for (const [name, content] of Object.entries(files)) {
		const nameBytes = encoder.encode(name);
		const dataBytes = encoder.encode(content);

		entries.push({ name: nameBytes, data: dataBytes, offset });

		// Local file header
		const header = new Uint8Array(30 + nameBytes.length);
		const view = new DataView(header.buffer);
		view.setUint32(0, 0x04034b50, true); // signature
		view.setUint16(4, 20, true); // version needed
		view.setUint16(6, 0, true); // flags
		view.setUint16(8, 0, true); // compression (store)
		view.setUint16(10, 0, true); // mod time
		view.setUint16(12, 0, true); // mod date
		view.setUint32(14, crc32(dataBytes), true); // crc32
		view.setUint32(18, dataBytes.length, true); // compressed size
		view.setUint32(22, dataBytes.length, true); // uncompressed size
		view.setUint16(26, nameBytes.length, true); // name length
		view.setUint16(28, 0, true); // extra length
		header.set(nameBytes, 30);

		parts.push(header, dataBytes);
		offset += header.length + dataBytes.length;
	}

	// Central directory
	const centralStart = offset;
	for (const entry of entries) {
		const cd = new Uint8Array(46 + entry.name.length);
		const cdView = new DataView(cd.buffer);
		cdView.setUint32(0, 0x02014b50, true);
		cdView.setUint16(4, 20, true);
		cdView.setUint16(6, 20, true);
		cdView.setUint16(8, 0, true);
		cdView.setUint16(10, 0, true);
		cdView.setUint16(12, 0, true);
		cdView.setUint16(14, 0, true);
		cdView.setUint32(16, crc32(entry.data), true);
		cdView.setUint32(20, entry.data.length, true);
		cdView.setUint32(24, entry.data.length, true);
		cdView.setUint16(28, entry.name.length, true);
		cdView.setUint16(30, 0, true);
		cdView.setUint16(32, 0, true);
		cdView.setUint16(34, 0, true);
		cdView.setUint16(36, 0, true);
		cdView.setUint32(38, 0, true);
		cdView.setUint32(42, entry.offset, true);
		cd.set(entry.name, 46);
		parts.push(cd);
		offset += cd.length;
	}

	// End of central directory
	const eocd = new Uint8Array(22);
	const eocdView = new DataView(eocd.buffer);
	eocdView.setUint32(0, 0x06054b50, true);
	eocdView.setUint16(4, 0, true);
	eocdView.setUint16(6, 0, true);
	eocdView.setUint16(8, entries.length, true);
	eocdView.setUint16(10, entries.length, true);
	eocdView.setUint32(12, offset - centralStart, true);
	eocdView.setUint32(16, centralStart, true);
	eocdView.setUint16(20, 0, true);
	parts.push(eocd);

	return new Blob(parts as BlobPart[], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/** CRC32 implementation for ZIP */
function crc32(data: Uint8Array): number {
	let crc = 0xffffffff;
	for (const byte of data) {
		crc = crc ^ byte;
		for (let j = 0; j < 8; j++) {
			crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
		}
	}
	return (crc ^ 0xffffffff) >>> 0;
}

// ─── Main Export Function ───────────────────────────────────────────────────

export async function exportTable(
	columns: string[],
	rows: Record<string, unknown>[],
	options: ExportOptions = {},
): Promise<ExportResult> {
	const format = options.format ?? (yamlSettingsStore.getTyped('export.defaultFormat', 'xlsx') as ExportFormat);
	const includeTimestamp = yamlSettingsStore.getTyped('export.includeTimestamp', true);
	const sheetName = options.sheetName ?? 'Export';

	// License gating — cap exported rows for free tier
	let exportRows = rows;
	let gated = false;

	if (options.feature && licenseStore.isFree) {
		const limit = licenseStore.getLimit('export');
		if (limit !== -1 && rows.length > limit) {
			exportRows = rows.slice(0, limit);
			gated = true;
		}
	}

	// Generate filename
	const baseName = options.filename ?? 'netops-export';
	const timestamp = includeTimestamp ? `-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}` : '';
	const ext = format === 'xlsx' ? '.xlsx' : format === 'csv' ? '.csv' : format === 'json' ? '.json' : '.yaml';
	const filename = `${baseName}${timestamp}${ext}`;

	try {
		let blob: Blob;

		switch (format) {
			case 'csv':
				blob = new Blob([toCSV(columns, exportRows)], { type: 'text/csv' });
				break;
			case 'xlsx':
				blob = toXLSX(columns, exportRows, sheetName);
				break;
			case 'json':
				blob = new Blob([JSON.stringify(exportRows, null, 2)], { type: 'application/json' });
				break;
			case 'yaml': {
				// Simple YAML array export
				const yamlLines = exportRows.map((row) => {
					const fields = columns
						.map((col) => `  ${col}: ${JSON.stringify(row[col])}`)
						.join('\n');
					return `- \n${fields}`;
				});
				blob = new Blob([yamlLines.join('\n')], { type: 'text/yaml' });
				break;
			}
			default:
				return { ok: false, error: `Unsupported format: ${format}` };
		}

		// Download
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		a.click();
		URL.revokeObjectURL(url);

		return { ok: true, filename, gated };
	} catch (err) {
		return { ok: false, error: err instanceof Error ? err.message : 'Export failed' };
	}
}
