/**
 * Ansible service — wraps Tauri invoke commands for Ansible integration.
 *
 * Commands map to `src-tauri/src/commands.rs`:
 *   export_ansible_inventory → spawn python3 -m netops.ansible.dynamic_inventory
 *   generate_playbook        → spawn python3 -m netops.playbooks.generator
 *   list_playbook_templates  → list available playbook templates
 */
import { invoke } from '@tauri-apps/api/core';
import type {
	AnsibleInventory,
	GeneratedPlaybook,
	InventoryFilter,
	InventoryFormat,
	PlaybookTemplate
} from '$lib/types/ansible.types.js';

/**
 * Export an Ansible-compatible inventory from scanned devices.
 * Calls the `export_ansible_inventory` Tauri command.
 */
export async function exportAnsibleInventory(
	format: InventoryFormat,
	filter?: InventoryFilter
): Promise<AnsibleInventory> {
	return invoke<AnsibleInventory>('export_ansible_inventory', {
		format,
		filter: filter ?? null
	});
}

/**
 * Generate an Ansible playbook from a template and device list.
 * Calls the `generate_playbook` Tauri command.
 */
export async function generatePlaybook(
	devices: string[],
	template: string,
	variables?: Record<string, string>
): Promise<GeneratedPlaybook> {
	return invoke<GeneratedPlaybook>('generate_playbook', {
		devices,
		template,
		variables: variables ?? null
	});
}

/**
 * List available playbook templates.
 * Calls the `list_playbook_templates` Tauri command.
 */
export async function listPlaybookTemplates(): Promise<PlaybookTemplate[]> {
	return invoke<PlaybookTemplate[]>('list_playbook_templates');
}
