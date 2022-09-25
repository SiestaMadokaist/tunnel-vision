import * as sqs from '@aws-sdk/client-sqs';
import { ClientSQSHub } from '../../modules/Hub/ClientSQSHub';
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
	process.env.AWS_PROFILE = process.env.AWS_PROFILE ?? Config.AWS_PROFILE ?? 'tunnelvision';
	process.env.AWS_REGION = process.env.AWS_REGION ?? Config.AWS_REGION;
	const hub = new ClientSQSHub({
		incoming: {
			channel: Config.REQUEST_QUEUE,
			hostname: opts.target ?? Config.TARGET_HOST
		},
		outgoing: {
			channel: Config.RESPONSE_QUEUE,
			hostname: Config.REMOTE_HOST,
			client: new sqs.SQSClient({})
		},
		stdout: process.stdout
	});
	await hub.start();
}
