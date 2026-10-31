import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { antworkApiRequest, getAccounts, getWorkspaces, idempotencyKey } from './GenericFunctions';

const toList = (value: unknown): string[] => {
	if (value === undefined || value === null || value === '') return [];
	const items = Array.isArray(value) ? value : String(value).split(/[\n,]/);
	return items.map((s) => String(s).trim()).filter(Boolean);
};

export class Antwork implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Antwork',
		name: 'antwork',
		icon: { light: 'file:../../icons/antwork.svg', dark: 'file:../../icons/antwork.dark.svg' },
		group: ['output'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description:
			'Draft, schedule and publish social posts to LinkedIn, Instagram, X, TikTok, YouTube, Threads and more',
		defaults: { name: 'Antwork' },
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'antworkApi', required: true }],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [{ name: 'Post', value: 'post' }],
				default: 'post',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['post'] } },
				options: [
					{
						name: 'Create Draft',
						value: 'createDraft',
						description:
							'Save a draft for one social account. Nothing is published until you schedule or publish it.',
						action: 'Create a draft post',
					},
					{
						name: 'Get',
						value: 'get',
						description: 'Get a post by its ID',
						action: 'Get a post',
					},
					{
						name: 'Publish Now',
						value: 'publish',
						description:
							'Publish an existing post to its social account immediately. This is public.',
						action: 'Publish a post now',
					},
					{
						name: 'Schedule',
						value: 'schedule',
						description: 'Schedule an existing post. It goes public on the social account at that time.',
						action: 'Schedule a post',
					},
				],
				default: 'createDraft',
			},

			// Create Draft
			{
				displayName: 'Workspace Name or ID',
				name: 'workspaceId',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getWorkspaces' },
				required: true,
				default: '',
				description:
					'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
				displayOptions: { show: { resource: ['post'], operation: ['createDraft'] } },
			},
			{
				displayName: 'Social Account Name or ID',
				name: 'accountId',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getAccounts', loadOptionsDependsOn: ['workspaceId'] },
				required: true,
				default: '',
				description:
					'One account per draft. For several accounts, add one node per account, each with copy written for that platform. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				displayOptions: { show: { resource: ['post'], operation: ['createDraft'] } },
			},
			{
				displayName: 'Text',
				name: 'text',
				type: 'string',
				typeOptions: { rows: 4 },
				required: true,
				default: '',
				description:
					'Platform limits apply at publish time (X 280, Bluesky 300, Threads 500, LinkedIn 3000...)',
				displayOptions: { show: { resource: ['post'], operation: ['createDraft'] } },
			},
			{
				displayName: 'Additional Fields',
				name: 'additionalFields',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				displayOptions: { show: { resource: ['post'], operation: ['createDraft'] } },
				options: [
					{
						displayName: 'Media URLs',
						name: 'mediaUrls',
						type: 'string',
						default: '',
						description:
							'Comma-separated public links to images, videos or PDFs. Antwork downloads each into its media library (needs the media scope). Instagram and Pinterest need an image or video; TikTok and YouTube need a video.',
					},
					{
						displayName: 'Proposed Time',
						name: 'proposedTime',
						type: 'dateTime',
						default: '',
						description:
							'Only proposes a time on the draft. It does not schedule anything; use the Schedule operation for that.',
					},
				],
			},

			// Get / Schedule / Publish
			{
				displayName: 'Post ID',
				name: 'postId',
				type: 'string',
				required: true,
				default: '',
				description: 'From Create Draft, or from the Antwork Trigger',
				displayOptions: { show: { resource: ['post'], operation: ['get', 'schedule', 'publish'] } },
			},
			{
				displayName: 'Publish At',
				name: 'scheduledFor',
				type: 'dateTime',
				required: true,
				default: '',
				description: 'In the future, at most 30 days ahead. The post goes public at this time.',
				displayOptions: { show: { resource: ['post'], operation: ['schedule'] } },
			},
			{
				displayName: 'This post goes public on the social account right away',
				name: 'publishNotice',
				type: 'notice',
				default: '',
				displayOptions: { show: { resource: ['post'], operation: ['publish'] } },
			},
		],
	};

	methods = {
		loadOptions: { getWorkspaces, getAccounts },
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const operation = this.getNodeParameter('operation', i) as string;
				let result: IDataObject;

				if (operation === 'createDraft') {
					result = await createDraft.call(this, i);
				} else if (operation === 'get') {
					const postId = (this.getNodeParameter('postId', i) as string).trim();
					result = await antworkApiRequest.call(this, 'GET', `/posts/${encodeURIComponent(postId)}`);
				} else if (operation === 'schedule') {
					const postId = (this.getNodeParameter('postId', i) as string).trim();
					const body = {
						scheduledFor: new Date(this.getNodeParameter('scheduledFor', i) as string).toISOString(),
					};
					result = await antworkApiRequest.call(
						this,
						'POST',
						`/posts/${encodeURIComponent(postId)}/schedule`,
						body,
						undefined,
						{ 'Idempotency-Key': idempotencyKey(this, i, `schedule-${postId}`, body) },
					);
				} else if (operation === 'publish') {
					const postId = (this.getNodeParameter('postId', i) as string).trim();
					result = await antworkApiRequest.call(
						this,
						'POST',
						`/posts/${encodeURIComponent(postId)}/publish`,
						{},
						undefined,
						{ 'Idempotency-Key': idempotencyKey(this, i, `publish-${postId}`, {}) },
					);
				} else {
					throw new NodeOperationError(this.getNode(), `Unknown operation: ${operation}`, {
						itemIndex: i,
					});
				}

				returnData.push({ json: result, pairedItem: { item: i } });
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({ json: { error: (error as Error).message }, pairedItem: { item: i } });
					continue;
				}
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
			}
		}

		return [returnData];
	}
}

/**
 * One draft for one account. Never publishes: `draft: true` is always sent,
 * because `POST /posts` without it publishes immediately.
 */
async function createDraft(this: IExecuteFunctions, i: number): Promise<IDataObject> {
	const workspaceId = this.getNodeParameter('workspaceId', i) as string;
	const accountId = this.getNodeParameter('accountId', i) as string;
	const text = this.getNodeParameter('text', i) as string;
	const additional = this.getNodeParameter('additionalFields', i, {}) as IDataObject;

	// Media on a post must be Antwork-hosted, so a public link goes through
	// `POST /media` (the server fetches it into the library) first.
	const media: string[] = [];
	for (const url of toList(additional.mediaUrls)) {
		const body = { url, workspaceId };
		const uploaded = await antworkApiRequest.call(this, 'POST', '/media', body, undefined, {
			'Idempotency-Key': idempotencyKey(this, i, 'media', body),
		});
		media.push(String(uploaded.id));
	}

	const body: IDataObject = {
		accounts: [accountId],
		text,
		draft: true,
		workspaceId,
		...(media.length ? { media } : {}),
		...(additional.proposedTime
			? { scheduledFor: new Date(additional.proposedTime as string).toISOString() }
			: {}),
	};

	const response = await antworkApiRequest.call(this, 'POST', '/posts', body, undefined, {
		'Idempotency-Key': idempotencyKey(this, i, 'draft', body),
	});

	// `POST /posts` answers with one row per target; a refused target is a row, not an HTTP error.
	const row = ((response.posts as IDataObject[]) ?? [])[0];
	if (!row) {
		throw new NodeOperationError(this.getNode(), 'Antwork returned no post for this request.', {
			itemIndex: i,
		});
	}
	if (row.status !== 'accepted') {
		throw new NodeOperationError(
			this.getNode(),
			(row.message as string) || `Antwork refused the post (${String(row.reason ?? 'rejected')}).`,
			{ itemIndex: i, description: row.reason ? `Antwork error code: ${String(row.reason)}` : undefined },
		);
	}
	return {
		...row,
		campaignId: response.campaignId ?? null,
		status: 'draft',
		text,
	};
}
