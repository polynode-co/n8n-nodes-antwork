import type {
	IDataObject,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IPollFunctions,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';

import { antworkApiRequest, getAccounts, getWorkspaces } from './GenericFunctions';

/** How many post ids to remember between polls, so a post is emitted once. */
const SEEN_LIMIT = 500;

export class AntworkTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Antwork Trigger',
		name: 'antworkTrigger',
		icon: { light: 'file:../../icons/antwork.svg', dark: 'file:../../icons/antwork.dark.svg' },
		group: ['trigger'],
		version: 1,
		description: 'Starts the workflow when a post goes live on a social account through Antwork',
		subtitle: 'New Published Post',
		defaults: { name: 'Antwork Trigger' },
		polling: true,
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'antworkApi', required: true }],
		properties: [
			{
				displayName: 'Event',
				name: 'event',
				type: 'options',
				options: [
					{
						name: 'New Published Post',
						value: 'newPublishedPost',
						description: 'A post went live on a social account',
					},
				],
				default: 'newPublishedPost',
			},
			{
				displayName: 'Workspace Name or ID',
				name: 'workspaceId',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getWorkspaces' },
				default: '',
				description:
					'Leave empty for every workspace. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
			{
				displayName: 'Social Account Name or ID',
				name: 'accountId',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getAccounts', loadOptionsDependsOn: ['workspaceId'] },
				default: '',
				description:
					'Leave empty for every account. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
		],
	};

	methods = {
		loadOptions: { getWorkspaces, getAccounts },
	};

	/**
	 * Polls `GET /posts?status=published`. The API orders that list by
	 * `createdAt` and has no `publishedAfter` filter or webhooks, so this reads
	 * the newest 100, filters by workspace/account here, and remembers which ids
	 * it has emitted. The first poll after activation only records what is
	 * already published, so old posts never fire.
	 */
	async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
		const workspaceId = this.getNodeParameter('workspaceId', '') as string;
		const accountId = this.getNodeParameter('accountId', '') as string;
		const isManual = this.getMode() === 'manual';

		const response = await antworkApiRequest.call(this, 'GET', '/posts', undefined, {
			status: 'published',
			limit: isManual ? 10 : 100,
		});
		const time = (p: IDataObject) =>
			Date.parse(String(p.publishedAt ?? p.createdAt ?? '')) || 0;
		const posts = ((response.posts as IDataObject[]) ?? [])
			.filter((p) => p.status === 'published')
			.filter((p) => !workspaceId || p.workspaceId === workspaceId)
			.filter((p) => !accountId || p.accountId === accountId)
			.sort((a, b) => time(b) - time(a));

		if (isManual) {
			return posts.length ? [this.helpers.returnJsonArray(posts.slice(0, 1))] : null;
		}

		const staticData = this.getWorkflowStaticData('node') as { seen?: string[] };
		const firstRun = staticData.seen === undefined;
		const seen = new Set(staticData.seen ?? []);
		const fresh = posts.filter((p) => !seen.has(String(p.id)));

		staticData.seen = [...posts.map((p) => String(p.id)), ...(staticData.seen ?? [])]
			.filter((id, index, all) => all.indexOf(id) === index)
			.slice(0, SEEN_LIMIT);

		if (firstRun || fresh.length === 0) return null;
		return [this.helpers.returnJsonArray(fresh.reverse())];
	}
}
