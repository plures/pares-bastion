/** Format for exported Ansible inventory. */
export type InventoryFormat = 'yaml' | 'json';

/** Optional filter to narrow which devices appear in the inventory. */
export interface InventoryFilter {
	vendor?: string;
	site?: string;
	hostnames?: string[];
}

/** Result of an Ansible inventory export. */
export interface AnsibleInventory {
	format: InventoryFormat;
	content: string;
	groupCount: number;
	hostCount: number;
}

/** A playbook template available for generation. */
export interface PlaybookTemplate {
	id: string;
	name: string;
	description: string;
	variables: TemplateVariable[];
}

/** A variable required or optional within a playbook template. */
export interface TemplateVariable {
	name: string;
	description: string;
	defaultValue: string;
	required: boolean;
}

/** Result of playbook generation. */
export interface GeneratedPlaybook {
	name: string;
	content: string;
	deviceCount: number;
	template: string;
}

/** Result of saving inventory or playbook to a file. */
export interface ExportResult {
	path: string;
	success: boolean;
	message: string;
}
