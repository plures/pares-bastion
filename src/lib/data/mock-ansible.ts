import type {
	AnsibleInventory,
	GeneratedPlaybook,
	PlaybookTemplate
} from '$lib/types/ansible.types.js';

export const mockInventoryYaml: AnsibleInventory = {
	format: 'yaml',
	content: `all:
  children:
    cisco_ios:
      hosts:
        core-rtr-01:
          ansible_host: 10.0.0.1
          model: ASR1001-X
          serial: FXS2208Q1GD
          site: NYC-DC1
        core-rtr-02:
          ansible_host: 10.0.0.2
          model: ASR1001-X
          serial: FXS2208Q1GE
          site: NYC-DC1
        agg-rtr-01:
          ansible_host: 10.0.2.1
          model: ISR4451
          serial: FGL2404AA4B
          site: SYD-DC3
        agg-rtr-02:
          ansible_host: 10.0.2.2
          model: ISR4451
          serial: FGL2404AA4C
          site: SYD-DC3
        dist-rtr-01:
          ansible_host: 10.0.4.1
          model: Catalyst 9300
          serial: FCW2319Y0J2
          site: SYD-DC3
      vars:
        ansible_network_os: ios
        ansible_connection: network_cli
    nokia_sros:
      hosts:
        edge-rtr-01:
          ansible_host: 10.0.1.1
          model: 7750 SR-12
          serial: NS22010001
          site: NYC-DC1
        edge-rtr-02:
          ansible_host: 10.0.1.2
          model: 7750 SR-12
          serial: NS22010002
          site: LON-DC2
        pe-rtr-01:
          ansible_host: 10.0.3.1
          model: 7210 SAS-T
          serial: NS21070003
          site: LON-DC2
        pe-rtr-02:
          ansible_host: 10.0.3.2
          model: 7210 SAS-T
          serial: NS21070004
          site: SYD-DC3
        wan-rtr-01:
          ansible_host: 10.0.5.1
          model: 7705 SAR-8
          serial: NS20100005
          site: LON-DC2
      vars:
        ansible_network_os: sros
        ansible_connection: network_cli
    arista_eos:
      hosts:
        spine-sw-01:
          ansible_host: 10.1.0.1
          model: DCS-7050CX3-32S
          serial: HSH21270001
          site: NYC-DC1
        spine-sw-02:
          ansible_host: 10.1.0.2
          model: DCS-7050CX3-32S
          serial: HSH21270002
          site: LON-DC2
        leaf-sw-01:
          ansible_host: 10.1.1.1
          model: DCS-7020R-48S2-R
          serial: HSH20100011
          site: NYC-DC1
        leaf-sw-02:
          ansible_host: 10.1.1.2
          model: DCS-7020R-48S2-R
          serial: HSH20100012
          site: NYC-DC1
        border-sw-01:
          ansible_host: 10.1.2.1
          model: DCS-7280CR3-32P4
          serial: HSH22010013
          site: NYC-DC1
      vars:
        ansible_network_os: eos
        ansible_connection: network_cli`,
	groupCount: 3,
	hostCount: 15
};

export const mockInventoryJson: AnsibleInventory = {
	format: 'json',
	content: JSON.stringify(
		{
			all: {
				children: {
					cisco_ios: {
						hosts: {
							'core-rtr-01': {
								ansible_host: '10.0.0.1',
								model: 'ASR1001-X',
								site: 'NYC-DC1'
							},
							'core-rtr-02': {
								ansible_host: '10.0.0.2',
								model: 'ASR1001-X',
								site: 'NYC-DC1'
							},
							'agg-rtr-01': {
								ansible_host: '10.0.2.1',
								model: 'ISR4451',
								site: 'SYD-DC3'
							},
							'agg-rtr-02': {
								ansible_host: '10.0.2.2',
								model: 'ISR4451',
								site: 'SYD-DC3'
							},
							'dist-rtr-01': {
								ansible_host: '10.0.4.1',
								model: 'Catalyst 9300',
								site: 'SYD-DC3'
							}
						},
						vars: {
							ansible_network_os: 'ios',
							ansible_connection: 'network_cli'
						}
					},
					nokia_sros: {
						hosts: {
							'edge-rtr-01': {
								ansible_host: '10.0.1.1',
								model: '7750 SR-12',
								site: 'NYC-DC1'
							},
							'edge-rtr-02': {
								ansible_host: '10.0.1.2',
								model: '7750 SR-12',
								site: 'LON-DC2'
							},
							'pe-rtr-01': {
								ansible_host: '10.0.3.1',
								model: '7210 SAS-T',
								site: 'LON-DC2'
							},
							'pe-rtr-02': {
								ansible_host: '10.0.3.2',
								model: '7210 SAS-T',
								site: 'SYD-DC3'
							},
							'wan-rtr-01': {
								ansible_host: '10.0.5.1',
								model: '7705 SAR-8',
								site: 'LON-DC2'
							}
						},
						vars: {
							ansible_network_os: 'sros',
							ansible_connection: 'network_cli'
						}
					},
					arista_eos: {
						hosts: {
							'spine-sw-01': {
								ansible_host: '10.1.0.1',
								model: 'DCS-7050CX3-32S',
								site: 'NYC-DC1'
							},
							'spine-sw-02': {
								ansible_host: '10.1.0.2',
								model: 'DCS-7050CX3-32S',
								site: 'LON-DC2'
							},
							'leaf-sw-01': {
								ansible_host: '10.1.1.1',
								model: 'DCS-7020R-48S2-R',
								site: 'NYC-DC1'
							},
							'leaf-sw-02': {
								ansible_host: '10.1.1.2',
								model: 'DCS-7020R-48S2-R',
								site: 'NYC-DC1'
							},
							'border-sw-01': {
								ansible_host: '10.1.2.1',
								model: 'DCS-7280CR3-32P4',
								site: 'NYC-DC1'
							}
						},
						vars: {
							ansible_network_os: 'eos',
							ansible_connection: 'network_cli'
						}
					}
				}
			}
		},
		null,
		2
	),
	groupCount: 3,
	hostCount: 15
};

export const mockPlaybookTemplates: PlaybookTemplate[] = [
	{
		id: 'backup-config',
		name: 'Backup Configuration',
		description: 'Collect running configuration from target devices and store locally.',
		variables: [
			{
				name: 'backup_dir',
				description: 'Local directory to store backups',
				defaultValue: './backups',
				required: true
			},
			{
				name: 'timestamp_format',
				description: 'Timestamp format for backup filenames',
				defaultValue: '%Y%m%d_%H%M%S',
				required: false
			}
		]
	},
	{
		id: 'health-check',
		name: 'Health Check',
		description: 'Run health checks across selected devices — CPU, memory, interface errors.',
		variables: [
			{
				name: 'cpu_threshold',
				description: 'CPU usage warning threshold (%)',
				defaultValue: '80',
				required: false
			},
			{
				name: 'memory_threshold',
				description: 'Memory usage warning threshold (%)',
				defaultValue: '85',
				required: false
			}
		]
	},
	{
		id: 'firmware-upgrade',
		name: 'Firmware Upgrade',
		description: 'Stage and activate firmware on target devices with pre/post checks.',
		variables: [
			{
				name: 'firmware_image',
				description: 'Path or URL to firmware image',
				defaultValue: '',
				required: true
			},
			{
				name: 'reboot_wait',
				description: 'Seconds to wait for device reboot',
				defaultValue: '300',
				required: false
			},
			{
				name: 'pre_check',
				description: 'Run pre-upgrade health check',
				defaultValue: 'true',
				required: false
			}
		]
	},
	{
		id: 'ntp-config',
		name: 'Configure NTP',
		description: 'Deploy NTP server configuration to selected devices.',
		variables: [
			{
				name: 'ntp_server_1',
				description: 'Primary NTP server address',
				defaultValue: '10.0.0.100',
				required: true
			},
			{
				name: 'ntp_server_2',
				description: 'Secondary NTP server address',
				defaultValue: '10.0.0.101',
				required: false
			}
		]
	},
	{
		id: 'snmp-config',
		name: 'Configure SNMP',
		description: 'Deploy SNMP v2c/v3 community and trap configuration.',
		variables: [
			{
				name: 'snmp_community',
				description: 'SNMP community string',
				defaultValue: 'public',
				required: true
			},
			{
				name: 'trap_server',
				description: 'SNMP trap destination',
				defaultValue: '10.0.0.200',
				required: true
			},
			{
				name: 'snmp_version',
				description: 'SNMP version (2c or 3)',
				defaultValue: '2c',
				required: false
			}
		]
	}
];

export const mockGeneratedPlaybook: GeneratedPlaybook = {
	name: 'backup-config-playbook.yml',
	content: `---
- name: Backup Configuration
  hosts: all
  gather_facts: false
  vars:
    backup_dir: ./backups
    timestamp_format: "%Y%m%d_%H%M%S"

  tasks:
    - name: Collect running configuration
      cli_command:
        command: show running-config
      register: config_output

    - name: Create backup directory
      delegate_to: localhost
      file:
        path: "{{ backup_dir }}/{{ inventory_hostname }}"
        state: directory

    - name: Save configuration to file
      delegate_to: localhost
      copy:
        content: "{{ config_output.stdout }}"
        dest: "{{ backup_dir }}/{{ inventory_hostname }}/{{ inventory_hostname }}_{{ lookup('pipe', 'date +' + timestamp_format) }}.cfg"

    - name: Verify backup saved
      delegate_to: localhost
      stat:
        path: "{{ backup_dir }}/{{ inventory_hostname }}"
      register: backup_stat

    - name: Report backup status
      debug:
        msg: "Backup saved for {{ inventory_hostname }}"
      when: backup_stat.stat.exists
`,
	deviceCount: 15,
	template: 'backup-config'
};
