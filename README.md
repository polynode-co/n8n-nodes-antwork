# n8n-nodes-antwork

n8n community nodes for [Antwork](https://antwork.io/?utm_source=n8n&utm_medium=referral&utm_campaign=directories), the AI social media manager. Draft, schedule and publish posts to LinkedIn, Instagram, X, TikTok, YouTube, Threads, Facebook, Bluesky, Pinterest, Mastodon, Telegram, Discord and Google Business Profile from your workflows.

## Installation

In n8n: **Settings > Community Nodes > Install**, then enter `n8n-nodes-antwork`. See n8n's [community nodes installation guide](https://docs.n8n.io/integrations/community-nodes/installation/).

## Credentials

The nodes use an Antwork API key.

1. In Antwork, open your workspace, then **Settings > Developer > Manage API keys** ([docs](https://antwork.io/docs/api/keys)).
2. Create a key with the scopes you need:
   - `read` for the trigger and **Get**
   - `write` for **Create Draft**
   - `publish` for **Schedule** and **Publish Now**
   - `media` to attach media URLs to a draft
3. In n8n, create an **Antwork API** credential and paste the key (it starts with `ak_`).

## Operations

### Antwork node

| Operation | What it does |
|---|---|
| **Create Draft** | Saves a draft for one social account. Nothing is published. Optional media URLs (Antwork imports each into your media library) and a proposed time. |
| **Schedule** | Schedules an existing post. It goes public at that time (at most 30 days ahead). |
| **Publish Now** | Publishes an existing post immediately. This is public. |
| **Get** | Gets a post by its ID. |

The node can also be used as a tool by n8n's AI Agent.

### Antwork Trigger

| Event | What it does |
|---|---|
| **New Published Post** | Starts the workflow when a post goes live on a social account, optionally filtered to one workspace or account. It polls; the first poll after activation records what is already published, so old posts never fire. |

## Rules worth knowing

- **One account per draft.** For several accounts, add one Create Draft node per account, each with copy written for that platform.
- **Creating is a draft.** Only Schedule or Publish Now sends a post.
- **Media.** Instagram and Pinterest need an image or video; TikTok and YouTube need a video.
- **TikTok** audience and disclosure choices are yours, per post, in Antwork. A TikTok post scheduled or published from n8n fails with `tiktok_choices_needed` and a link to set them.
- **Retries.** Mutating calls send an `Idempotency-Key` scoped to the execution and item, so n8n's *Retry On Fail* never makes a second draft or a second publish.

## Example workflow

Blog post to LinkedIn, reviewed before it goes out:

1. **RSS Feed Trigger** on your blog.
2. An **AI** node writes a LinkedIn post from the item.
3. **Antwork > Create Draft** for your LinkedIn account.
4. **Wait** for approval (for example a Slack message with a button).
5. **Antwork > Schedule** with the draft's `id` and a time.

## Resources

- [Antwork REST API docs](https://antwork.io/docs/api) and [OpenAPI spec](https://antwork.io/openapi.json)
- [Error codes](https://antwork.io/docs/api/errors)
- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)

## License

[MIT](LICENSE.md)
