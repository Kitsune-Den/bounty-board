# Kitsune Den Bounty Board

The live site: **https://bb.kitsuneden.net**

Community-sourced mod bounties for 7 Days to Die. Real requests, real players, curated by the skulk.

## How to update

1. Edit `bounties.json` ~ add, remove, or change a bounty's `status`
2. Commit + push to `main`
3. GitHub Actions will:
   - Regenerate `bounty-board.md` from the JSON
   - SFTP-deploy the site
   - Post a Discord webhook message summarizing what changed (new bounties, status flips)

No servers to babysit. No manual HTML editing. The JSON is the source of truth.

## Schema (bounties.json)

```json
{
  "meta": { "lastUpdated": "2026-04-21", "source": "..." },
  "bounties": [
    {
      "id": "BB-001",
      "title": "Short title",
      "description": "One or two sentences. Plain text.",
      "status": "open | partial | claimed | shipped",
      "difficulty": 1,
      "categories": ["high", "admin", "qol", "kc"],
      "tags": [
        { "label": "Server-Side", "variant": "server" }
      ],
      "link": { "label": "Forum Thread ↗", "url": "https://..." }
    }
  ]
}
```

**Tag variants** (CSS colors): `high`, `admin`, `qol`, `server`, `kc`
**Categories** used by filters: `high`, `admin`, `qol`, `kc`
**Difficulty**: 1 (low), 2 (medium), 3 (hard)

## Local dev

Open `index.html` directly in a browser, or run any static server in this dir (e.g. `python -m http.server 8000`). It fetches `bounties.json` at runtime.

To regenerate the markdown locally:

```bash
npm run build
```

## Discord automation

The workflow posts to a Discord webhook when `bounties.json` changes. Set up:

1. In Discord: Server Settings → Integrations → Webhooks → New Webhook → pick a channel
2. Copy the webhook URL
3. Paste into this repo: Settings → Secrets → Actions → new secret `DISCORD_WEBHOOK_URL`

## Deploy secrets

In the repo's Actions secrets:

- `SFTP_HOST`
- `SFTP_USER`
- `SFTP_PASSWORD`
- `SFTP_REMOTE_PATH` (e.g. `/home/kitsuneden/bb.kitsuneden.net`)
- `DISCORD_WEBHOOK_URL` (optional ~ notify step is skipped if missing)
- `ANTHROPIC_API_KEY` (for the weekly scraper)

## Weekly forum scrape (auto-curate)

Runs every Sunday 08:00 UTC (also manually triggerable):

1. Scrapes the first page of [Discussion & Requests](https://community.thefunpimps.com/forums/discussion-and-requests.40/)
2. Fetches the first post of each thread for context
3. Filters out any thread URL already in `bounties.json`
4. Sends the rest to Claude for triage ~ "is this a real mod request?"
5. Claude proposes `{id, title, description, status, difficulty, categories, tags, link}` entries
6. Opens a PR with the proposed additions for you to review + merge

Nothing hits production without your merge. Claude's job is triage + drafting, not committing.

Local dry run:

```bash
export ANTHROPIC_API_KEY=sk-...
npm run refresh
git diff bounties.json
```
