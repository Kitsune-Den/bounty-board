// Posts a Discord webhook message when bounties.json changes between
// the previous commit (HEAD^) and the current one (HEAD).
//
// Requires:
//   - DISCORD_WEBHOOK_URL env var
//   - Run inside a git checkout with at least 2 commits of history
import fs from 'node:fs'
import { execSync } from 'node:child_process'

const webhook = process.env.DISCORD_WEBHOOK_URL
if (!webhook) {
  console.log('[discord-notify] DISCORD_WEBHOOK_URL not set — skipping.')
  process.exit(0)
}

const STATUS_EMOJI = {
  open: '🔴',
  partial: '🟡',
  claimed: '🟢',
  shipped: '✅',
}

function loadAt(ref) {
  try {
    const raw = execSync(`git show ${ref}:bounties.json`, { encoding: 'utf8' })
    return JSON.parse(raw)
  } catch {
    return { bounties: [] }
  }
}

const prev = loadAt('HEAD^')
const curr = JSON.parse(fs.readFileSync('bounties.json', 'utf8'))

const prevMap = new Map((prev.bounties || []).map((b) => [b.id, b]))
const currMap = new Map((curr.bounties || []).map((b) => [b.id, b]))

const added = []
const statusChanged = []
const removed = []

for (const [id, b] of currMap) {
  const before = prevMap.get(id)
  if (!before) added.push(b)
  else if (before.status !== b.status) statusChanged.push({ before, after: b })
}
for (const [id, b] of prevMap) {
  if (!currMap.has(id)) removed.push(b)
}

if (added.length === 0 && statusChanged.length === 0 && removed.length === 0) {
  console.log('[discord-notify] No bounty changes detected. Skipping post.')
  process.exit(0)
}

const lines = []
lines.push('**🦊 Bounty Board updated** — https://bb.kitsuneden.net')
lines.push('')

if (added.length) {
  lines.push(`**New bounties (${added.length}):**`)
  for (const b of added) {
    lines.push(`• ${STATUS_EMOJI[b.status] ?? ''} \`${b.id}\` — **${b.title}**`)
    lines.push(`  ${b.link.url}`)
  }
  lines.push('')
}

if (statusChanged.length) {
  lines.push(`**Status changes (${statusChanged.length}):**`)
  for (const { before, after } of statusChanged) {
    const beforeEmoji = STATUS_EMOJI[before.status] ?? ''
    const afterEmoji = STATUS_EMOJI[after.status] ?? ''
    lines.push(`• \`${after.id}\` — **${after.title}** ${beforeEmoji} ${before.status} → ${afterEmoji} ${after.status}`)
  }
  lines.push('')
}

if (removed.length) {
  lines.push(`**Removed (${removed.length}):**`)
  for (const b of removed) {
    lines.push(`• \`${b.id}\` — ${b.title}`)
  }
  lines.push('')
}

lines.push('Want to claim one? Drop a message in the channel.')

const body = {
  username: 'Bounty Board',
  content: lines.join('\n'),
  allowed_mentions: { parse: [] },
}

const res = await fetch(webhook, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

if (!res.ok) {
  const txt = await res.text()
  console.error(`[discord-notify] Webhook failed: ${res.status} ${txt}`)
  process.exit(1)
}

console.log('[discord-notify] Posted successfully.')
