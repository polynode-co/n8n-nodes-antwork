import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	INodePropertyOptions,
	IPollFunctions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

/** The documented base URL of the public REST API (`servers[0]` in antwork.io/openapi.json). */
export const API_BASE = 'https://antwork.io/api/v1';

type Context = IExecuteFunctions | ILoadOptionsFunctions | IPollFunctions;

const PLATFORM_NAMES: Record<string, string> = {
	x: 'X (Twitter)',
	linkedin: 'LinkedIn',
	facebook: 'Facebook',
	instagram: 'Instagram',
	threads: 'Threads',
	youtube: 'YouTube',
	tiktok: 'TikTok',
	pinterest: 'Pinterest',
	bluesky: 'Bluesky',
	discord: 'Discord',
	mastodon: 'Mastodon',
	telegram: 'Telegram',
	google_business: 'Google Business Profile',
};

export function platformName(id: string | undefined): string {
	if (!id) return 'Unknown';
	return PLATFORM_NAMES[id] ?? id.charAt(0).toUpperCase() + id.slice(1);
}

/**
 * Actionable hints for the API's stable error codes (https://antwork.io/docs/api/errors).
 * `message` from the API is copy and may change; the code is the contract.
 */
const HINTS: Record<string, string> = {
	insufficient_scope:
		'Create a key with that scope in Antwork (Settings > Developer > Manage API keys) and update the credential.',
	subscription_inactive: 'Your Antwork subscription is inactive. Reactivate it under Billing.',
	tiktok_choices_needed:
		'TikTok audience and disclosure choices are made by you, per post, in Antwork. Open the post in Antwork, pick them, then publish or schedule from there.',
	tiktok_privacy_required: 'TikTok needs an audience chosen in Antwork before this post can go out.',
	media_required: 'This platform needs an image or video. Add a media URL to the draft first.',
	pinterest_board_required: 'Pinterest pins need a board. Pick one on the post in Antwork.',
	text_too_long: 'The text is over the platform limit. Shorten it before publishing.',
	token_invalid: 'The social account needs reconnecting in Antwork (Connections).',
	workspace_required: 'Pick a workspace: this Antwork account has more than one.',
};

export function describeApiError(body: unknown): { code?: string; text?: string } {
	if (!body || typeof body !== 'object') return {};
	const err = (body as IDataObject).error as IDataObject | undefined;
	if (!err || typeof err !== 'object') return {};
	const code = typeof err.code === 'string' ? err.code : undefined;
	let text = typeof err.message === 'string' ? err.message : undefined;
	if (text && typeof err.param === 'string') text += ` (field: ${err.param})`;
	if (text && code && HINTS[code]) text += ` ${HINTS[code]}`;
	if (text && typeof err.settingsUrl === 'string') text += ` Open: ${err.settingsUrl}`;
	return { code, text };
}

export async function antworkApiRequest(
	this: Context,
	method: IHttpRequestMethods,
	path: string,
	body?: IDataObject,
	qs?: IDataObject,
	headers?: IDataObject,
): Promise<IDataObject> {
	const options: IHttpRequestOptions = {
		method,
		url: `${API_BASE}${path}`,
		json: true,
		...(qs ? { qs } : {}),
		...(body ? { body } : {}),
		...(headers ? { headers } : {}),
	};
	try {
		return (await this.helpers.httpRequestWithAuthentication.call(
			this,
			'antworkApi',
			options,
		)) as IDataObject;
	} catch (error) {
		// The HTTP helper throws axios-shaped errors (`response.data`); older paths use `response.body`.
		const response = (error as { response?: { data?: unknown; body?: unknown } }).response;
		const responseBody = response?.data ?? response?.body;
		const { code, text } = describeApiError(responseBody);
		throw new NodeApiError(this.getNode(), error as JsonObject, {
			...(text ? { message: text } : {}),
			...(code ? { description: `Antwork error code: ${code}` } : {}),
		});
	}
}

/**
 * A deterministic string hash (FNV-1a, two 32-bit lanes) for Idempotency-Key.
 * Hand-rolled because verified community nodes may not import modules.
 */
function fnv1a(input: string): string {
	let h1 = 0x811c9dc5;
	let h2 = 0x01000193 ^ 0x5bd1e995;
	for (let i = 0; i < input.length; i++) {
		const c = input.charCodeAt(i);
		h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
		h2 = Math.imul(h2 ^ c, 0x01000197) >>> 0;
	}
	return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

function canonical(value: unknown): string {
	if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
	if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
	const entries = Object.entries(value as IDataObject)
		.filter(([, v]) => v !== undefined)
		.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
	return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
}

/**
 * An `Idempotency-Key` for a mutating call. Scoped to the execution and item, so
 * n8n's "Retry On Fail" (same execution) gets the first answer back instead of a
 * second draft or publish, while a new execution always makes a new request.
 */
export function idempotencyKey(
	ctx: IExecuteFunctions,
	itemIndex: number,
	action: string,
	body: IDataObject,
): string {
	const scope = `${ctx.getWorkflow().id ?? 'wf'}:${ctx.getExecutionId() ?? 'exec'}:${itemIndex}`;
	return `n8n-${action}-${fnv1a(`${scope}:${action}:${canonical(body)}`)}`;
}

export async function getWorkspaces(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const response = await antworkApiRequest.call(this, 'GET', '/workspaces');
	const workspaces = (response.workspaces as IDataObject[]) ?? [];
	return workspaces.map((w) => ({ name: String(w.name), value: String(w.id) }));
}

export async function getAccounts(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const workspaceId = this.getCurrentNodeParameter('workspaceId') as string | undefined;
	const response = await antworkApiRequest.call(
		this,
		'GET',
		'/accounts',
		undefined,
		workspaceId ? { workspaceId } : undefined,
	);
	const accounts = (response.accounts as IDataObject[]) ?? [];
	return accounts
		.filter((a) => a.active !== false)
		.map((a) => {
			const handle = a.handle ? ` (@${String(a.handle).replace(/^@/, '')})` : '';
			return {
				name: `${platformName(a.platform as string)} · ${String(a.name)}${handle}`,
				value: String(a.id),
			};
		});
}
