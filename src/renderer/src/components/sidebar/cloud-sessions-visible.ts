/**
 * Picks the rows the sidebar renders before the "show more" fold.
 *
 * Why: the fold trims by age, but an approval waiting on a human must never be trimmed — 18 such
 * calls once sat behind a fold and were invisible. Order is left untouched: the fold hides, it
 * never ranks.
 *
 * Why a per-provider floor: with several cloud agent providers in one list, a chatty vendor fills
 * the whole fold by recency alone and the others vanish — the list looked like it had one vendor.
 * Each provider keeps its newest few rows; the source order still decides where they appear, so the
 * list stays strictly newest-first. Three per provider is enough to see the vendor is alive without
 * letting it push the fold past a screenful.
 */
/** How many rows a provider keeps in the fold even when it is older than everything else. */
const PROVIDER_FLOOR = 3

export function selectVisibleSessions<T extends { state: string; provider?: string }>(
  source: readonly T[],
  showAll: boolean,
  limit = 8
): T[] {
  if (showAll) {
    return [...source]
  }
  const folded = source.filter((session, index) => index < limit || session.state === 'blocked')
  const kept = new Map<string, number>()
  for (const session of folded) {
    const provider = session.provider ?? ''
    kept.set(provider, (kept.get(provider) ?? 0) + 1)
  }
  const rescued = new Set<T>()
  for (const session of source) {
    const provider = session.provider ?? ''
    const seen = kept.get(provider) ?? 0
    if (seen >= PROVIDER_FLOOR) {
      continue
    }
    kept.set(provider, seen + 1)
    rescued.add(session)
  }
  if (rescued.size === 0) {
    return folded
  }
  return source.filter((session) => folded.includes(session) || rescued.has(session))
}
