import { describe, it, expect } from 'vitest';
import {
	parseDiff,
	searchDiffLines,
	parseConfigSections,
} from '../diff-utils.js';

// ─── parseDiff ──────────────────────────────────────────────────────────────

describe('parseDiff', () => {
	it('returns empty summary for empty input', () => {
		const result = parseDiff('');
		expect(result.lines).toHaveLength(0);
		expect(result.hunks).toHaveLength(0);
		expect(result.totalAdditions).toBe(0);
		expect(result.totalDeletions).toBe(0);
		expect(result.totalChanged).toBe(0);
	});

	it('parses a simple unified diff', () => {
		const unified = [
			'--- a/config.txt',
			'+++ b/config.txt',
			'@@ -1,3 +1,4 @@',
			' hostname core-rtr-01',
			'-ip route 10.0.0.0/8 null0',
			'+ip route 10.0.0.0/8 10.0.0.254',
			'+ip route 192.168.0.0/16 10.0.0.254',
			' end',
		].join('\n');

		const result = parseDiff(unified);
		expect(result.lines).toHaveLength(8);
		expect(result.hunks).toHaveLength(1);
		expect(result.totalAdditions).toBe(2);
		expect(result.totalDeletions).toBe(1);
		expect(result.totalChanged).toBe(3);
	});

	it('parses multiple hunks', () => {
		const unified = [
			'--- a/config.txt',
			'+++ b/config.txt',
			'@@ -1,2 +1,2 @@',
			'-old line 1',
			'+new line 1',
			'@@ -10,2 +10,3 @@',
			' context',
			'+added line',
		].join('\n');

		const result = parseDiff(unified);
		expect(result.hunks).toHaveLength(2);
		expect(result.hunks[0].additions).toBe(1);
		expect(result.hunks[0].deletions).toBe(1);
		expect(result.hunks[1].additions).toBe(1);
		expect(result.hunks[1].deletions).toBe(0);
	});

	it('assigns correct line numbers', () => {
		const unified = '--- a\n+++ b\n@@ -1,1 +1,1 @@\n-old\n+new';
		const result = parseDiff(unified);
		expect(result.lines[0].lineNumber).toBe(1);
		expect(result.lines[4].lineNumber).toBe(5);
	});

	it('classifies line types correctly', () => {
		const unified = '--- a\n+++ b\n@@ -1,1 +1,1 @@\n-removed\n+added\n context';
		const result = parseDiff(unified);
		expect(result.lines[0].type).toBe('header'); // --- a
		expect(result.lines[1].type).toBe('header'); // +++ b
		expect(result.lines[2].type).toBe('header'); // @@
		expect(result.lines[3].type).toBe('del');
		expect(result.lines[4].type).toBe('add');
		expect(result.lines[5].type).toBe('context');
	});
});

// ─── searchDiffLines ────────────────────────────────────────────────────────

describe('searchDiffLines', () => {
	const lines = parseDiff(
		'--- a\n+++ b\n@@ -1,2 +1,2 @@\n-ip route 10.0.0.0\n+ip route 192.168.0.0\n end'
	).lines;

	it('returns empty array for empty query', () => {
		expect(searchDiffLines(lines, '')).toHaveLength(0);
	});

	it('finds matching lines case-insensitively', () => {
		const matches = searchDiffLines(lines, 'IP ROUTE');
		expect(matches).toHaveLength(2);
		expect(matches[0].line.type).toBe('del');
		expect(matches[1].line.type).toBe('add');
	});

	it('returns indices usable for navigation', () => {
		const matches = searchDiffLines(lines, 'end');
		expect(matches.length).toBeGreaterThan(0);
		expect(typeof matches[0].index).toBe('number');
	});
});

// ─── parseConfigSections ────────────────────────────────────────────────────

describe('parseConfigSections', () => {
	it('returns empty for empty config', () => {
		expect(parseConfigSections('')).toHaveLength(0);
	});

	it('extracts interface and router sections', () => {
		const config = `hostname core-rtr-01
!
interface GigabitEthernet0/0/0
 ip address 10.0.0.1 255.255.255.0
 no shutdown
!
router bgp 65001
 neighbor 10.0.0.2 remote-as 65001
!
ip route 0.0.0.0 0.0.0.0 10.0.0.254
!
end`;
		const sections = parseConfigSections(config);
		expect(sections).toHaveLength(3);
		expect(sections[0].label).toBe('interface GigabitEthernet0/0/0');
		expect(sections[0].lineNumber).toBe(3);
		expect(sections[1].label).toBe('router bgp 65001');
		expect(sections[2].label).toBe('ip route 0.0.0.0 0.0.0.0 10.0.0.254');
	});

	it('ignores indented lines and comments', () => {
		const config = `!
 interface inside-section
interface Loopback0
!`;
		const sections = parseConfigSections(config);
		expect(sections).toHaveLength(1);
		expect(sections[0].label).toBe('interface Loopback0');
	});
});
