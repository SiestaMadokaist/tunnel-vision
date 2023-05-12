import { defaultProvider } from '@aws-sdk/credential-provider-node'
import { ClientSQSHub } from '../../modules/Hub/ClientSQSHub';
import fs from 'fs';
import yaml from 'yaml'
interface IStart {
	config: string;
	account: string;
}

export interface IConfig {
	profile: string;
	region: string;
	localhost: string;
	remotehost: string;
	request: string;
	response: string;
	whitelist: string[];
}

export type ITunnelConfig = Record<string, IConfig>;


export async function start(opts: IStart): Promise<void> {
	const configs: ITunnelConfig = yaml.parse(fs.readFileSync(opts.config, 'utf-8'));
	const config = configs[opts.account];
	if (typeof config === 'undefined') {
		throw new Error(`config for ${opts.account} not found`);
	}
	const credentials = await defaultProvider({ profile: config.profile })({ forceRefresh: true })
	const hub = new ClientSQSHub({
		incoming: {
			channel: config.request,
			hostname: config.localhost,
		},
		outgoing: {
			channel: config.response,
			hostname: config.remotehost,
		},
		awsConfig: {
			credentials,
			region: config.region,
		},
		whitelist: config.whitelist,
		stdout: process.stdout
	});
	await hub.start();
}
