/**
 * Parse hashtags and @mentions from post body text.
 * Tags are normalised to lowercase with leading #.
 */

const HASHTAG_RE = /#([\w-]+)/g
const MENTION_RE = /@([\w][\w.-]{1,30})/g

export function parseHashtags(text: string): string[] {
  const tags = new Set<string>()
  for (const match of text.matchAll(HASHTAG_RE)) {
    const raw = match[1]
    if (raw) tags.add(`#${raw.toLowerCase()}`)
  }
  return [...tags]
}

export function parseMentionUsernames(text: string): string[] {
  const names = new Set<string>()
  for (const match of text.matchAll(MENTION_RE)) {
    const raw = match[1]
    if (raw) names.add(raw)
  }
  return [...names]
}
