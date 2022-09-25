import * as sqs from '@aws-sdk/client-sqs';
import { Consumer, SQSMessage } from 'sqs-consumer';
import { Memoizer } from '../../helper/Memoizer';
import EventEmitter from 'events';
import axios, { AxiosError, AxiosInstance, AxiosRequestHeaders } from 'axios';
import { IRequestMessage, IResponse } from './interface';
import { Writable } from 'stream';
import { TIME } from '../../helper/TIME';
export interface IClientSQSHub {
	incoming: {
		channel: string;
		hostname: string;
	};
	outgoing: {
		hostname: string;
		channel: string;
		client: sqs.SQSClient;
	};
	stdout: Writable;
}

export interface IRespEmitter<O> extends EventEmitter {
	on(requestId: 'message', action: (resp: O) => void): this;
	emit(requestId: 'message', response: O): boolean;
}

export class ClientSQSHub {
	#memo = new Memoizer<{
		connectionRequest: AxiosInstance;
		sourceRequest: AxiosInstance;
		consumer: Consumer;
		started: Promise<boolean>;
		keepConnection: Promise<boolean>;
	}>();
	#publishCounter: number = 0;
	constructor(private props: IClientSQSHub) {}

	client(): sqs.SQSClient {
		return this.props.outgoing.client;
	}

	private log(message: string): void {
		this.props.stdout.write(`${message}\n`);
	}

	private connectionRequest(): AxiosInstance {
		return this.#memo.memoize('connectionRequest', () => {
			return axios.create({ baseURL: this.props.outgoing.hostname, timeout: 30_000 });
		});
	}

	private async keepConnection(): Promise<boolean> {
		return this.#memo.memoize('keepConnection', async () => {
			const connector = this.connectionRequest();
			const doConnect = async () => {
				await connector.put('/$internals/connect').catch(console.error);
			};
			setInterval(doConnect, TIME.MINUTE);
			await doConnect();
			return true;
		});
	}

	async start(): Promise<boolean> {
		await this.keepConnection();
		const consumer = this.requestConsumer();
		consumer.start();
		return true;
	}

	private sourceRequest(): AxiosInstance {
		return this.#memo.memoize('sourceRequest', () => {
			return axios.create({ baseURL: this.props.incoming.hostname, timeout: 30_000 });
		});
	}

	async getResponse(request: IRequestMessage): Promise<IResponse> {
		delete request.headers['host'];
		delete request.headers['x-forwarded-port'];
		delete request.headers['x-forwarded-proto'];
		if (request.method.toUpperCase() === 'GET') {
			delete request.body;
		}
		const response = await this.sourceRequest()
			.request({
				method: request.method,
				data: request.body,
				params: request.query,
				headers: request.headers as AxiosRequestHeaders,
				url: request.url
			})
			.catch((error: AxiosError) => {
				if (error.isAxiosError) {
					if (typeof error.response === 'undefined') {
						this.log(`failed to connect ${this.props.incoming.hostname}`);
					}
					return error.response;
				}
				throw error;
			});
		return {
			body: response?.data,
			headers: response?.headers ?? {},
			statusCode: response?.status ?? 500,
			requestId: request.requestId,
			type: 'response'
		};
	}

	protected async publish(response: IResponse): Promise<void> {
		const command = new sqs.SendMessageCommand({
			MessageBody: JSON.stringify({ ...response }),
			QueueUrl: this.props.outgoing.channel
		});
		this.log(
			`${this.#publishCounter} ClientHub: publish [${response.statusCode}] #${response.requestId}`
		);
		await this.client().send(command).catch(console.error);
		this.#publishCounter++;
	}

	protected async handleMessage(message: SQSMessage): Promise<void> {
		const request: IRequestMessage = JSON.parse(message.Body ?? '{}');
		this.log(`received: ${request.url} #${request.requestId}`);
		const response = await this.getResponse(request);
		this.publish(response);
	}

	private requestConsumer(): Consumer {
		return this.#memo.memoize('consumer', () => {
			this.log(`listening message from ${this.props.incoming.channel}`);
			return Consumer.create({
				queueUrl: this.props.incoming.channel,
				handleMessage: async (message) => this.handleMessage(message).catch(console.error)
			});
		});
	}
}
