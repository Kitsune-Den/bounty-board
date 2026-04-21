// Scrapes the TFP "Discussion and Requests" subforum for candidate bounty threads.
// Emits candidates to stdout as JSON, and skips anything already tracked in bounties.json.
//
// Usage: node scripts/scrape-forum.mjs > candidates.json
import fs from 'node:fs'

const FORUM_URL = 'https://community.thefunpimps.com/forums/discussion-and-requests.40/'
const UA = 'Mozilla/5.0 (compatible; KitsuneDenBot/1.0; +https://kitsuneden.net)'
const MAX_THREADS_PER_RUN = 25
const REQUEST_DELAY_MS = 600

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA } })
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`)
  return res.text()
}

/**
 * Extracts thread links + titles from a XenForo subforum listing.
 * Returns [{ title, url }]
 */
function parseThreadList(html) {
  const out = []
  const seen = new Set()
  // XenForo structItem anchors: <a href="/threads/slug.12345/" ...>Title</a>
  const re = /<a[^>]+href="(\/threads\/[^"]+\/)"[^>]*data-tp-primary="on"[^>]*>([^<]+)<\/a>/g
  let m
  while ((m = re.exec(html)) !== null) {
    const url = new URL(m[1], FORUM_URL).href
    if (seen.has(url)) continue
    seen.add(url)
    out.push({ url, title: stripHtml(m[2]) })
  }
  // Fallback: looser match if the primary-tagged anchors aren't present
  if (out.length === 0) {
    const re2 = /<div class="structItem-title"[^>]*>\s*(?:<[^>]+>\s*)*<a[^>]+href="(\/threads\/[^"]+\/)"[^>]*>([^<]+)<\/a>/g
    while ((m = re2.exec(html)) !== null) {
      const url = new URL(m[1], FORUM_URL).href
      if (seen.has(url)) continue
      seen.add(url)
      out.push({ url, title: stripHtml(m[2]) })
    }
  }
  return out
}

/**
 * Fetches a thread page and extracts the first-post body (plain text, trimmed).
 */
async function fetchFirstPost(threadUrl) {
  const html = await fetchText(threadUrl)
  // First <article class="message ..."> ... <div class="bbWrapper">body</div></article>
  const m = html.match(/<div[^>]+class="[^"]*bbWrapper[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/)
  if (!m) return ''
  const text = stripHtml(m[1])
  return text.length > 1200 ? text.slice(0, 1200) + '…' : text
}

async function main() {
  const existing = JSON.parse(fs.readFileSync('bounties.json', 'utf8'))
  const existingUrls = new Set((existing.bounties || []).map((b) => b.link?.url).filter(Boolean))

  const listing = await fetchText(FORUM_URL)
  const threads = parseThreadList(listing)
  const candidates = threads
    .filter((t) => !existingUrls.has(t.url))
    .slice(0, MAX_THREADS_PER_RUN)

  const enriched = []
  for (const t of candidates) {
    try {
      await sleep(REQUEST_DELAY_MS)
      const firstPost = await fetchFirstPost(t.url)
      enriched.push({ ...t, firstPost })
      process.stderr.write(`[scrape] ${t.url}\n`)
    } catch (err) {
      process.stderr.write(`[scrape] FAILED ${t.url}: ${err.message}\n`)
    }
  }

  process.stdout.write(JSON.stringify({ scrapedAt: new Date().toISOString(), threads: enriched }, null, 2))
}

main().catch((err) => {
  console.error('[scrape] fatal:', err)
  process.exit(1)
})
