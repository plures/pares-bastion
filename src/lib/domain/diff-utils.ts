/**
 * Diff parsing and analysis utilities.
 *
 * Provides structured parsing of unified diff output for display,
 * search, and navigation in the config diff viewer.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type DiffLineType = 'add' | 'del' | 'header' | 'context';

export interface DiffLine {
	/** Original text of the line (including +/-/@ prefix). */
	text: string;
	/** Semantic type for styling. */
	type: DiffLineType;
	/** 1-based line number within the diff output. */
	lineNumber: number;
}

export interface DiffHunk {
	/** Header line text (e.g. "@@ -8,6 +8,9 @@"). */
	header: string;
	/** 1-based index of the header line in the full diff. */
	startLine: number;
	/** Lines belonging to this hunk (excluding the header). */
	lines: DiffLine[];
	/** Number of additions in this hunk. */
	additions: number;
	/** Number of deletions in this hunk. */
	deletions: number;
}

export interface DiffSummary {
	/** All parsed lines. */
	lines: DiffLine[];
	/** Parsed hunks for section navigation. */
	hunks: DiffHunk[];
	/** Total additions across all hunks. */
	totalAdditions: number;
	/** Total deletions across all hunks. */
	totalDeletions: number;
	/** Total number of changed (non-context, non-header) lines. */
	totalChanged: number;
}

// ─── Parsing ────────────────────────────────────────────────────────────────

function classifyLine(line: string): DiffLineType {
	if (
		line.startsWith('@@') ||
		line.startsWith('+++ ') ||
		line.startsWith('--- ') ||
		line.startsWith('diff ') ||
		line.startsWith('index ')
	) {
		return 'header';
	}
	if (line.startsWith('+')) return 'add';
	if (line.startsWith('-')) return 'del';
	return 'context';
}

/**
 * Parse a unified diff string into structured lines and hunks.
 */
export function parseDiff(unified: string): DiffSummary {
	if (!unified) {
		return { lines: [], hunks: [], totalAdditions: 0, totalDeletions: 0, totalChanged: 0 };
	}

	const rawLines = unified.split('\n');
	const lines: DiffLine[] = rawLines.map((text, i) => ({
		text,
		type: classifyLine(text),
		lineNumber: i + 1,
	}));

	const hunks: DiffHunk[] = [];
	let currentHunk: DiffHunk | null = null;

	for (const line of lines) {
		if (line.text.startsWith('@@')) {
			if (currentHunk) hunks.push(currentHunk);
			currentHunk = {
				header: line.text,
				startLine: line.lineNumber,
				lines: [],
				additions: 0,
				deletions: 0,
			};
		} else if (currentHunk) {
			currentHunk.lines.push(line);
			if (line.type === 'add') currentHunk.additions++;
			if (line.type === 'del') currentHunk.deletions++;
		}
	}
	if (currentHunk) hunks.push(currentHunk);

	const totalAdditions = hunks.reduce((sum, h) => sum + h.additions, 0);
	const totalDeletions = hunks.reduce((sum, h) => sum + h.deletions, 0);

	return {
		lines,
		hunks,
		totalAdditions,
		totalDeletions,
		totalChanged: totalAdditions + totalDeletions,
	};
}

// ─── Search ─────────────────────────────────────────────────────────────────

export interface DiffSearchMatch {
	/** The matching line. */
	line: DiffLine;
	/** 0-based index within the lines array. */
	index: number;
}

/**
 * Search diff lines for a query string (case-insensitive).
 * Returns matching lines with their indices for navigation.
 */
export function searchDiffLines(lines: DiffLine[], query: string): DiffSearchMatch[] {
	if (!query) return [];
	const q = query.toLowerCase();
	return lines
		.map((line, index) => ({ line, index }))
		.filter(({ line }) => line.text.toLowerCase().includes(q));
}

// ─── Config section parsing ─────────────────────────────────────────────────

export interface ConfigSection {
	/** Section label (e.g. "interface GigabitEthernet0/0/0", "router bgp 65001"). */
	label: string;
	/** 1-based line number where this section starts. */
	lineNumber: number;
}

/**
 * Extract navigable sections from a device configuration.
 * Recognises common IOS/EOS/SR-OS section headers.
 */
export function parseConfigSections(config: string): ConfigSection[] {
	if (!config) return [];
	const sections: ConfigSection[] = [];
	const lines = config.split('\n');

	for (let i = 0; i < lines.length; i++) {
		const raw = lines[i];
		// Skip indented lines (those are sub-commands, not section headers)
		if (raw.startsWith(' ') || raw.startsWith('\t')) continue;
		const line = raw.trim();
		// Match common config section headers (not comments/banners)
		if (
			/^(interface|router|ip route|ip access-list|route-map|line|vlan|spanning-tree|ntp|logging|snmp-server|aaa|policy-map|class-map|crypto)\b/i.test(line)
		) {
			sections.push({ label: line, lineNumber: i + 1 });
		}
	}

	return sections;
}
