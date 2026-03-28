export interface Device {
	id: string;
	name: string;
	host: string;
	vendor: 'cisco_ios' | 'nokia_sros' | 'arista_eos';
	model: string;
	version: string;
	serial: string;
	site: string;
}

export const mockInventory: Device[] = [
	{
		id: '1',
		name: 'core-rtr-01',
		host: '10.0.0.1',
		vendor: 'cisco_ios',
		model: 'ASR1001-X',
		version: '16.9.4',
		serial: 'FXS2208Q1GD',
		site: 'NYC-DC1'
	},
	{
		id: '2',
		name: 'core-rtr-02',
		host: '10.0.0.2',
		vendor: 'cisco_ios',
		model: 'ASR1001-X',
		version: '16.9.4',
		serial: 'FXS2208Q1GE',
		site: 'NYC-DC1'
	},
	{
		id: '3',
		name: 'edge-rtr-01',
		host: '10.0.1.1',
		vendor: 'nokia_sros',
		model: '7750 SR-12',
		version: '23.10.R1',
		serial: 'NS22010001',
		site: 'NYC-DC1'
	},
	{
		id: '4',
		name: 'edge-rtr-02',
		host: '10.0.1.2',
		vendor: 'nokia_sros',
		model: '7750 SR-12',
		version: '23.10.R1',
		serial: 'NS22010002',
		site: 'LON-DC2'
	},
	{
		id: '5',
		name: 'spine-sw-01',
		host: '10.1.0.1',
		vendor: 'arista_eos',
		model: 'DCS-7050CX3-32S',
		version: '4.30.1F',
		serial: 'HSH21270001',
		site: 'NYC-DC1'
	},
	{
		id: '6',
		name: 'spine-sw-02',
		host: '10.1.0.2',
		vendor: 'arista_eos',
		model: 'DCS-7050CX3-32S',
		version: '4.30.1F',
		serial: 'HSH21270002',
		site: 'LON-DC2'
	},
	{
		id: '7',
		name: 'leaf-sw-01',
		host: '10.1.1.1',
		vendor: 'arista_eos',
		model: 'DCS-7020R-48S2-R',
		version: '4.29.2F',
		serial: 'HSH20100011',
		site: 'NYC-DC1'
	},
	{
		id: '8',
		name: 'leaf-sw-02',
		host: '10.1.1.2',
		vendor: 'arista_eos',
		model: 'DCS-7020R-48S2-R',
		version: '4.29.2F',
		serial: 'HSH20100012',
		site: 'NYC-DC1'
	},
	{
		id: '9',
		name: 'agg-rtr-01',
		host: '10.0.2.1',
		vendor: 'cisco_ios',
		model: 'ISR4451',
		version: '17.3.5',
		serial: 'FGL2404AA4B',
		site: 'SYD-DC3'
	},
	{
		id: '10',
		name: 'agg-rtr-02',
		host: '10.0.2.2',
		vendor: 'cisco_ios',
		model: 'ISR4451',
		version: '17.3.5',
		serial: 'FGL2404AA4C',
		site: 'SYD-DC3'
	},
	{
		id: '11',
		name: 'pe-rtr-01',
		host: '10.0.3.1',
		vendor: 'nokia_sros',
		model: '7210 SAS-T',
		version: '22.7.R2',
		serial: 'NS21070003',
		site: 'LON-DC2'
	},
	{
		id: '12',
		name: 'pe-rtr-02',
		host: '10.0.3.2',
		vendor: 'nokia_sros',
		model: '7210 SAS-T',
		version: '22.7.R2',
		serial: 'NS21070004',
		site: 'SYD-DC3'
	},
	{
		id: '13',
		name: 'border-sw-01',
		host: '10.1.2.1',
		vendor: 'arista_eos',
		model: 'DCS-7280CR3-32P4',
		version: '4.30.2F',
		serial: 'HSH22010013',
		site: 'NYC-DC1'
	},
	{
		id: '14',
		name: 'dist-rtr-01',
		host: '10.0.4.1',
		vendor: 'cisco_ios',
		model: 'Catalyst 9300',
		version: '17.6.3',
		serial: 'FCW2319Y0J2',
		site: 'SYD-DC3'
	},
	{
		id: '15',
		name: 'wan-rtr-01',
		host: '10.0.5.1',
		vendor: 'nokia_sros',
		model: '7705 SAR-8',
		version: '21.10.R3',
		serial: 'NS20100005',
		site: 'LON-DC2'
	}
];

export const LAST_SCAN_TIME = '2026-03-26T08:00:00Z';
