export type OutputFormat = 'json' | 'csv';
export type Theme = 'dark' | 'light';

export interface SshCredentials {
	username: string;
	passwordOrKeyPath: string;
	defaultTimeout: number;
}

export interface ScanDefaults {
	defaultConcurrency: number;
	deepScan: boolean;
	outputFormat: OutputFormat;
}

export interface Appearance {
	theme: Theme;
	tuiMode: boolean;
}

export interface Settings {
	sshCredentials: SshCredentials;
	scanDefaults: ScanDefaults;
	appearance: Appearance;
}
