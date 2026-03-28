import type { TerminalTab, TerminalType } from '$lib/types/terminal.types.js';
import { yamlSettingsStore } from '$lib/stores/yaml-settings.svelte.js';

// ─── Terminal Store (Svelte 5 runes) ────────────────────────────────────────

class TerminalStore {
	tabs = $state<TerminalTab[]>([]);
	activeTabId = $state<string | null>(null);

	get activeTab(): TerminalTab | null {
		return this.tabs.find((t) => t.id === this.activeTabId) ?? null;
	}

	// ── Tab Management ──────────────────────────────────────────────────────

	createLocalTab(): TerminalTab {
		const shell = yamlSettingsStore.getTyped('terminal.defaultShell', 'bash');
		const id = `term-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
		const tab: TerminalTab = {
			id,
			label: `Local (${shell})`,
			type: 'local',
			hostname: null,
			ip: null,
			shell: String(shell),
			status: 'connected',
			createdAt: Date.now(),
			tunnelId: null,
			output: [
				`\x1b[32m${shell}\x1b[0m session started`,
				`\x1b[34m$\x1b[0m `,
			],
		};

		this.tabs = [...this.tabs, tab];
		this.activeTabId = id;
		return tab;
	}

	createSshTab(hostname: string, ip: string, tunnelId: string | null = null): TerminalTab {
		const id = `term-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
		const tab: TerminalTab = {
			id,
			label: hostname,
			type: 'ssh',
			hostname,
			ip,
			shell: null,
			status: 'connected',
			createdAt: Date.now(),
			tunnelId,
			output: [
				`Connecting to \x1b[36m${hostname}\x1b[0m (${ip})${tunnelId ? ' via tunnel' : ''}...`,
				`\x1b[32mConnected.\x1b[0m`,
				`\x1b[34m${hostname}#\x1b[0m `,
			],
		};

		this.tabs = [...this.tabs, tab];
		this.activeTabId = id;
		return tab;
	}

	closeTab(id: string): void {
		this.tabs = this.tabs.filter((t) => t.id !== id);
		if (this.activeTabId === id) {
			this.activeTabId = this.tabs.length > 0 ? this.tabs[this.tabs.length - 1].id : null;
		}
	}

	setActiveTab(id: string): void {
		this.activeTabId = id;
	}

	/**
	 * Send a command to the active terminal.
	 * In production, this invokes Tauri to write to the PTY.
	 * For now, appends mock output.
	 */
	sendCommand(tabId: string, command: string): void {
		const tab = this.tabs.find((t) => t.id === tabId);
		if (!tab) return;

		const prompt = tab.type === 'ssh'
			? `\x1b[34m${tab.hostname}#\x1b[0m `
			: `\x1b[34m$\x1b[0m `;

		// Mock command responses
		const responses: Record<string, string[]> = {
			'show version': [
				'Cisco IOS XE Software, Version 16.9.4',
				'Cisco ASR1001-X (1RU) processor with 3670116K/6147K bytes of memory.',
				'uptime is 47 days, 3 hours, 22 minutes',
			],
			'show ip interface brief': [
				'Interface              IP-Address      OK? Method Status                Protocol',
				'GigabitEthernet0/0/0   10.0.0.1        YES NVRAM  up                    up',
				'GigabitEthernet0/0/1   10.0.1.1        YES NVRAM  up                    up',
				'Loopback0              1.1.1.1         YES NVRAM  up                    up',
			],
			'ls': ['CHANGELOG.md  README.md  docs/  src/  package.json  tsconfig.json'],
			'pwd': ['/home/user'],
			'whoami': ['netops'],
		};

		const output = responses[command.trim()] ?? [`Command executed: ${command}`];
		tab.output = [...tab.output, `${prompt}${command}`, ...output, prompt];
		this.tabs = [...this.tabs]; // trigger reactivity
	}
}

export const terminalStore = new TerminalStore();
