// Sends scraped forum threads to Claude for triage.
// Claude decides which threads are genuine mod REQUESTS and proposes bounty entries.
// The proposals get merged into bounties.json — which the caller then commits/PRs.
//
// Input: candidates.json on stdin (output of scrape-forum.mjs)
// Env: ANTHROPIC_API_KEY required
// Writes: updates bounties.json in place with any new bounties appended.
import fs from 'node:fs'
import Anthropic from '@anthropic-ai/sdk'

const MODEL = 'claude-sonnet-4-5'
const MAX_TOKENS = 4096

const apiKey = process.env.ANTHROPIC_API_KEY
if (!apiKey) {
  console.error('[curate] ANTHROPIC_API_KEY not set')
  process.exit(1)
}

async function readStdin() {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

function nextBountyId(existing) {
  const nums = (existing.bounties || [])
    .map((b) => parseInt(String(b.id).replace(/^BB-/, ''), 10))
    .filter((n) => !Number.isNaN(n))
  const max = nums.length ? Math.max(...nums) : 0
  return (n) => `BB-${String(max + n).padStart(3, '0')}`
}

const SYSTEM_PROMPT = `You are curating a bounty board for 7 Days to Die mod requests.

You will receive a list of forum threads from The Fun Pimps "Discussion and Requests" subforum.
For each thread, decide: is this a genuine MOD REQUEST worth listing as a bounty?

YES if:
- The thread describes a feature, mechanic, or tool the poster wants modded into the game
- It's clear enough that a modder could understand the goal
- It's a server admin pain point worth solving

NO if:
- It's a help/support post ("my mod won't load")
- It's a guide, announcement, or release post
- It's too vague ("please add more content")
- It's about a mod that already exists
- It's off-topic chatter

For each YES, propose a bounty entry. For each NO, skip silently.

Respond with ONLY valid JSON in this exact shape:

{
  "proposed": [
    {
      "title": "short punchy title (max 50 chars)",
      "description": "1-2 sentence description of the gap and why it matters. Plain text, no markdown.",
      "status": "open",
      "difficulty": 1,
      "categories": ["high" | "admin" | "qol"],
      "tags": [
        { "label": "Server-Side" | "Server Admin" | "Quality of Life" | "High Demand", "variant": "server" | "admin" | "qol" | "high" }
      ],
      "link": { "label": "Forum Thread ↗", "url": "<the thread url>" }
    }
  ]
}

Rules:
- difficulty: 1 = simple XML, 2 = DLL/Harmony, 3 = large system change
- categories: pick ONE primary: high (high demand), admin (server admin focused), qol (quality of life). Add "kc" if it overlaps with KitsuneCommand features (server lifecycle, mod management, zone management, admin panel stuff).
- tags: same variants as categories. Include "Server-Side" tag if the mod is server-side-only.
- Return [] if NOTHING in the batch is worth bountying. Don't pad.
- NEVER invent URLs — only use the URL from the thread.`

function userPrompt(threads) {
  return `Threads to triage:\n\n${threads
    .map(
      (t, i) => `### Thread ${i + 1}
Title: ${t.title}
URL: ${t.url}
First post:
${t.firstPost || '(empty)'}
`
    )
    .join('\n---\n\n')}`
}

function extractJson(text) {
  const first = text.indexOf('{')
  const last = text.lastIndexOf('}')
  if (first === -1 || last === -1) throw new Error('No JSON object in model response')
  return JSON.parse(text.slice(first, last + 1))
}

async function main() {
  const input = JSON.parse(await readStdin())
  const threads = input.threads || []
  if (threads.length === 0) {
    console.error('[curate] no threads to process — exiting')
    process.exit(0)
  }

  const client = new Anthropic({ apiKey })
  console.error(`[curate] sending ${threads.length} threads to ${MODEL}…`)

  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt(threads) }],
  })

  const text = resp.content.map((c) => (c.type === 'text' ? c.text : '')).join('')
  const parsed = extractJson(text)
  const proposals = parsed.proposed || []

  if (proposals.length === 0) {
    console.error('[curate] Claude proposed 0 bounties — nothing to add')
    process.exit(0)
  }

  const existing = JSON.parse(fs.readFileSync('bounties.json', 'utf8'))
  const nextId = nextBountyId(existing)

  const accepted = proposals.map((p, i) => ({
    id: nextId(i + 1),
    title: p.title,
    description: p.description,
    status: p.status || 'open',
    difficulty: Math.max(1, Math.min(3, p.difficulty ?? 2)),
    categories: Array.isArray(p.categories) ? p.categories : [],
    tags: Array.isArray(p.tags) ? p.tags : [],
    link: p.link,
  }))

  existing.bounties = [...(existing.bounties || []), ...accepted]
  existing.meta = {
    ...(existing.meta || {}),
    lastUpdated: new Date().toISOString().slice(0, 10),
  }

  fs.writeFileSync('bounties.json', JSON.stringify(existing, null, 2) + '\n')
  console.error(`[curate] appended ${accepted.length} bounties:`)
  for (const b of accepted) console.error(`  + ${b.id} — ${b.title}`)
}

main().catch((err) => {
  console.error('[curate] fatal:', err)
  process.exit(1)
})
