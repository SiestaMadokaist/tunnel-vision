import * as sqs from '@aws-sdk/client-sqs';
import { ClientSQSHub } from '../../modules/Hub/ClientSQSHub';
// import { LocalVars } from '../../configs/vars';
// import type * as C from 'commander';
import fs from 'fs';
import dotenv from 'dotenv';
interface IStart {
	target: string;
	config: string;
}
export async function start(opts: IStart): Promise<void> {
	const Config: Record<string, string> = await new Promise((rs, rj) => {
		fs.readFile(opts.config, null, (err, result) => {
			if (err) {
				rj(err);
			}
			rs(dotenv.parse(result) as any);
		});
	});
	const hub = new ClientSQSHub({
		incoming: {
			channel: Config.REQUEST_QUEUE,
			hostname: opts.target
		},
		outgoing: {
			channel: Config.RESPONSE_QUEUE,
			client: new sqs.SQSClient({})
		},
		stdout: process.stdout
	});
	await hub.start();
}
