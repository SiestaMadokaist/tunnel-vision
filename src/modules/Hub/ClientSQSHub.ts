import aws from 'aws-sdk';
import * as sqs from '@aws-sdk/client-sqs';
import { Consumer, SQSMessage } from 'sqs-consumer';
import { Memoizer } from '../../helper/Memoizer';
import EventEmitter from 'events';
import axios, { AxiosError, AxiosInstance, AxiosRequestHeaders } from 'axios';
import { IRequestMessage, IResponse } from './interface';
import { Writable } from 'stream';
import { TIME } from '../../helper/TIME';
import qs from 'querystring';
export interface IClientSQSHub {
	incoming: {
		channel: string;
		hostname: string;
	};
	outgoing: {
		hostname: string;
		channel: string;
	};
	awsConfig: {
		credentials: {
			accessKeyId: string;
			secretAccessKey: string;
		};
		region: string;
	}
	whitelist: string[];
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
		consumer: Promise<Consumer>;
		started: Promise<boolean>;
		keepConnection: Promise<boolean>;
	}>();
	#publishCounter: number = 0;
	constructor(private props: IClientSQSHub) {}

	client(): sqs.SQSClient {
		const { awsConfig } = this.props;
		return new sqs.SQSClient(awsConfig);
	}

	private log(message: string): void {
		this.props.stdout.write(`${message}\n`);
	}

	private connectionRequest(): AxiosInstance {
		return this.#memo.memoize('connectionRequest', () => {
			console.log({ c: this.props.outgoing.hostname });
			return axios.create({ baseURL: this.props.outgoing.hostname, timeout: 30_000 });
		});
	}

	private whitelist(): string[] {
		return this.props.whitelist ?? [];
	}

	private async keepConnection(): Promise<boolean> {
		return this.#memo.memoize('keepConnection', async () => {
			const connector = this.connectionRequest();
			const doConnect = async () => {
				this.log(`connecting with ${this.props.outgoing.hostname}`);
				const data = { whitelist: this.whitelist() };
				await connector.put('/~internals/connect', data).catch(console.error)
			};
			setInterval(doConnect, TIME.MINUTE);
			await doConnect();
			return true;
		});
	}

	async start(): Promise<boolean> {
		await this.keepConnection();
		const consumer = await this.requestConsumer();
		consumer.start();
		return true;
	}

	private sourceRequest(): AxiosInstance {
		return this.#memo.memoize('sourceRequest', () => {
			const instance = axios.create({ baseURL: this.props.incoming.hostname, timeout: 30_000 });
			instance.interceptors.request.use((config) => {
				if (config.headers) {
					delete config.headers['content-length'];
				}
				return config;
			});
			return instance;
		});
	}

	encode(data: string | object, contentType?: string): string | object {
		if (typeof contentType === 'undefined') {
			return data;
		}
		if (contentType.startsWith('image/')) {
			const imageData = data as string;
			// Buffer.from(imageData, '');
			return Buffer.from(imageData, 'utf8').toString('base64');
		}
		return data;
	}

	isImage(request: IRequestMessage): boolean {
		const imageFormat = /\.png|\.jpg|\.jpeg|\.gif|\.webp/;
		return request.url.toLowerCase().match(imageFormat) !== null;
	}

	getReformatted(originalRequest: IRequestMessage): IRequestMessage {
		const request: IRequestMessage = JSON.parse(JSON.stringify(originalRequest));
		delete request.headers['host'];
		delete request.headers['x-forwarded-port'];
		delete request.headers['x-forwarded-proto'];
		if (request.method.toUpperCase() === 'GET') {
			delete request.body;
			delete request.headers['content-length'];
		}
		if (request.headers['content-type'] === 'application/x-www-form-urlencoded') {
			request.body = qs.encode(request.body as {});
		}
		return request;
	}

	getRequestBody(request: IRequestMessage): unknown {
		if (request.headers['content-type'] === 'application/x-www-form-urlencoded') {
			const body = request.body as Record<string, string>;
			return new URLSearchParams(Object.entries(body)).toString();
		}
		return request.body;
	}

	async getResponse(originalRequest: IRequestMessage): Promise<IResponse> {
		const request = this.getReformatted(originalRequest);
		const responseType = this.isImage(request) ? 'arraybuffer' : 'json';
		const requestBody = this.getRequestBody(originalRequest);
		const response = await this.sourceRequest()
			.request({
				method: request.method,
				data: requestBody,
				params: request.query,
				headers: request.headers as AxiosRequestHeaders,
				url: request.url,
				responseType
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
		const headers = response?.headers ?? {};
		if (this.isImage(request)) {
			headers['content-type'] = 'image/png';
		}
		return {
			body: this.encode(response?.data ?? '', response?.headers['content-type']),
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
		// console.log(JSON.stringify({ request }, null, 2));
		const response = await this.getResponse(request);
		this.publish(response);
	}

	private async requestConsumer(): Promise<Consumer> {
		return this.#memo.memoize('consumer', async  () => {
			this.log(`listening message from ${this.props.incoming.channel}`);
			return Consumer.create({
				sqs: new aws.SQS(this.props.awsConfig),
				queueUrl: this.props.incoming.channel,
				handleMessage: async (message) => this.handleMessage(message).catch(console.error)
			});
		});
	}
}
