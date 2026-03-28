// ─── Terminal Types ──────────────────────────────────────────────────────────

export type TerminalType = 'local' | 'ssh';
export type TerminalStatus = 'idle' | 'connected' | 'disconnected' | 'error';

export interface TerminalTab {
	id: string;
	label: string;
	type: TerminalType;
	/** For SSH terminals: device hostname */
	hostname: string | null;
	/** For SSH terminals: IP address */
	ip: string | null;
	/** For local terminals: shell path */
	shell: string | null;
	status: TerminalStatus;
	createdAt: number;
	/** Whether this terminal is using a tunnel */
	tunnelId: string | null;
	/** Scrollback buffer (mock for now) */
	output: string[];
}

export interface TerminalShellOption {
	id: string;
	name: string;
	path: string;
	icon: string;
	platform: 'all' | 'linux' | 'macos' | 'windows';
}

// ─── Default Shell Options ──────────────────────────────────────────────────

export const SHELL_OPTIONS: TerminalShellOption[] = [
	{ id: 'bash', name: 'Bash', path: '/bin/bash', icon: '🐚', platform: 'all' },
	{ id: 'zsh', name: 'Zsh', path: '/bin/zsh', icon: '⚡', platform: 'all' },
	{ id: 'fish', name: 'Fish', path: '/usr/bin/fish', icon: '🐟', platform: 'all' },
	{ id: 'powershell', name: 'PowerShell', path: 'powershell.exe', icon: '💙', platform: 'windows' },
	{ id: 'cmd', name: 'Command Prompt', path: 'cmd.exe', icon: '⬛', platform: 'windows' },
];
