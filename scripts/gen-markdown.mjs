// Generates bounty-board.md from bounties.json.
// Run via: node scripts/gen-markdown.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

const data = JSON.parse(fs.readFileSync(path.join(root, 'bounties.json'), 'utf8'))
const { meta, bounties } = data

const STATUS_EMOJI = {
  open: '🔴',
  partial: '🟡',
  claimed: '🟢',
  shipped: '✅',
}

const STATUS_LABEL = {
  open: 'Open',
  partial: 'Partial',
  claimed: 'Claimed',
  shipped: 'Shipped',
}

const DIFFICULTY_LABEL = ['', 'Low', 'Medium', 'Hard']

// Group by primary category
const groups = {
  high: { title: '🔥 High Demand', items: [] },
  admin: { title: '⚔️ Server Admin', items: [] },
  qol: { title: '🎮 Quality of Life', items: [] },
  other: { title: '📦 Other', items: [] },
}

for (const b of bounties) {
  const cats = b.categories || []
  if (cats.includes('high')) groups.high.items.push(b)
  else if (cats.includes('admin')) groups.admin.items.push(b)
  else if (cats.includes('qol')) groups.qol.items.push(b)
  else groups.other.items.push(b)
}

const serverSideFlag = (b) => {
  const hasServer = (b.tags || []).some((t) => t.variant === 'server')
  return hasServer ? 'Yes' : 'No/Unknown'
}

const kcFlag = (b) => (b.categories || []).includes('kc')

let md = ''
md += `# 7 Days to Die — Community Mod Bounty Board\n\n`
md += `**Curated by Kitsune Den** | Last updated: ${meta.lastUpdated}  \n`
md += `Source: [The Fun Pimps Official Forums](${meta.source}) — real requests from real players.\n\n`
md += `---\n\n`
md += `## Status Legend\n\n`
md += `- 🔴 **Open** — No working solution exists\n`
md += `- 🟡 **Partial** — Outdated or incomplete solutions exist\n`
md += `- 🟢 **Claimed** — Someone's working on it\n`
md += `- ✅ **Shipped** — Done, linked below\n\n`
md += `---\n\n`

for (const group of Object.values(groups)) {
  if (group.items.length === 0) continue
  md += `## ${group.title}\n\n`
  for (const b of group.items) {
    md += `### ${b.id} — ${b.title}\n`
    md += `**Status:** ${STATUS_EMOJI[b.status]} ${STATUS_LABEL[b.status]} | **Difficulty:** ${DIFFICULTY_LABEL[b.difficulty]} | **Server-Side:** ${serverSideFlag(b)}\n\n`
    md += `${b.description}\n\n`
    md += `**Link:** [${b.link.label}](${b.link.url})\n`
    if (kcFlag(b)) md += `\n**🦊 KitsuneCommand overlap.**\n`
    md += `\n---\n\n`
  }
}

md += `## How to Contribute\n\n`
md += `Want to claim a bounty? Drop by the [Kitsune Den Discord](https://kitsuneden.net/discord) or ping us on [kitsuneden.net](https://kitsuneden.net).\n\n`
md += `*This file is auto-generated from \`bounties.json\`. Don't edit by hand.*\n`

fs.writeFileSync(path.join(root, 'bounty-board.md'), md)
console.log(`[gen-markdown] wrote bounty-board.md (${bounties.length} bounties)`)
