type fnFromEnv<T> = (k: T) => string;
function fromEnv<T>(k: T): string {
	const v = process.env[k as any];
	if (typeof v !== 'string') {
		throw new Error(`the fuck, ${k} is not set`);
	}
	return v;
}

const localVars: fnFromEnv<LocalVars> = (k: LocalVars) => fromEnv(k);
type LocalVars = 'REQUEST_QUEUE' | 'RESPONSE_QUEUE';

// export const LocalVar: Record<LocalVars, string> = {
// 	REQUEST_QUEUE: localVars('REQUEST_QUEUE'),
// 	RESPONSE_QUEUE: localVars('RESPONSE_QUEUE')
// };
