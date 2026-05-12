// WebDriverIO configuration for Tauri e2e testing
// Requires: cargo install tauri-driver --locked
// Run: npx wdio run tests/e2e/wdio.conf.ts

import type { Options } from '@wdio/types';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';

let tauriDriver: ChildProcess;

export const config: Options.Testrunner = {
	runner: 'local',
	specs: ['./tests/e2e/specs/**/*.ts'],
	maxInstances: 1,
	capabilities: [
		{
			// @ts-expect-error custom capability
			'tauri:options': {
				application: path.resolve('./src-tauri/target/release/pares-bastion'),
			},
		},
	],
	logLevel: 'warn',
	waitforTimeout: 10000,
	connectionRetryTimeout: 120000,
	connectionRetryCount: 3,
	framework: 'mocha',
	reporters: ['spec'],
	mochaOpts: {
		ui: 'bdd',
		timeout: 60000,
	},
	onPrepare: () => {
		tauriDriver = spawn('tauri-driver', [], {
			stdio: ['ignore', 'pipe', 'pipe'],
		});
	},
	onComplete: () => {
		tauriDriver?.kill();
	},
};
