import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class AntworkApi implements ICredentialType {
	name = 'antworkApi';

	displayName = 'Antwork API';

	icon: Icon = { light: 'file:../icons/antwork.svg', dark: 'file:../icons/antwork.dark.svg' };

	documentationUrl = 'https://antwork.io/docs/api/keys';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'Create a key in Antwork under Settings > Developer > Manage API keys. Give it the write scope to create drafts, publish to schedule or publish, and media to attach media URLs. It starts with ak_.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://antwork.io/api/v1',
			url: '/workspaces',
			method: 'GET',
		},
	};
}
