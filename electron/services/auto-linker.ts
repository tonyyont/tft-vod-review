import type { Database } from '../database.js';

type Candidate = { matchId: string; matchStartMs: number; matchEndMs: number };

function scoreCandidates(params: {
  vodTimeMs: number;
  candidates: Candidate[];
}): { status: 'linked' | 'ambiguous' | 'not_found'; matchId?: string; candidates?: string[]; confidenceMs?: number } {
  if (!params.candidates.length) return { status: 'not_found' };
  const ALLOW_EARLY_MS = 60_000; // tolerate small clock skew, but not minutes
  const scored = params.candidates
    .map((c) => ({
      ...c,
      // Assumption: VOD timestamp represents game start.
      signedDeltaStart: c.matchStartMs - params.vodTimeMs,
    }))
    .filter((c) => c.signedDeltaStart >= -ALLOW_EARLY_MS)
    .map((c) => ({
      ...c,
      score: Math.max(0, c.signedDeltaStart),
    }))
    .sort((a, b) => a.score - b.score);

  if (!scored.length) return { status: 'not_found' };

  const best = scored[0];
  const second = scored[1];

  // Confidence thresholds (tunable)
  if (best.score <= 3 * 60_000) {
    return { status: 'linked', matchId: best.matchId, confidenceMs: best.score };
  }
  if (best.score <= 10 * 60_000 && second && second.score - best.score >= 5 * 60_000) {
    return { status: 'linked', matchId: best.matchId, confidenceMs: best.score };
  }

  return {
    status: 'ambiguous',
    candidates: scored.slice(0, 5).map((c) => c.matchId),
    confidenceMs: best.score,
  };
}

export function createAutoLinker(params: {
  db: Database;
  withRiotRateLimit: <T>(fn: () => Promise<T>) => Promise<T>;
  notifyVodsUpdated: () => void;
}) {
  let autoLinkTimer: NodeJS.Timeout | null = null;
  let autoLinkInFlight = false;
  let autoLinkQueued = false;
  // In-memory caches to reduce Riot calls (best-effort; cleared between runs)
  let matchIdsCache = new Map<string, string[]>(); // key: `${region}|${puuid}|${startSec}|${endSec}|${count}`
  let matchTimeCache = new Map<string, Candidate>(); // matchId -> {matchId, matchStartMs, matchEndMs}

  function scheduleAutoLink(delayMs: number = 1000) {
    if (autoLinkTimer) clearTimeout(autoLinkTimer);
    autoLinkTimer = setTimeout(() => {
      autoLinkTimer = null;
      void autoLinkAllUnlinked();
    }, delayMs);
  }

  function getCachedCandidateFromMetadata(matchId: string): Candidate | null {
    const cached = params.db.getMatchMetadata(matchId);
    if (!cached?.stats) return null;
    const matchEndMs = cached.stats.gameDatetimeMs;
    const gameLengthSec = cached.stats.gameLengthSec;
    if (typeof matchEndMs !== 'number' || typeof gameLengthSec !== 'number') return null;
    const matchStartMs = matchEndMs - gameLengthSec * 1000;
    return { matchId, matchStartMs, matchEndMs };
  }

  async function autoLinkVod(vodId: number, opts?: { force?: boolean }): Promise<void> {
    const vod = params.db.getVOD(vodId);
    if (!vod) return;
    // De-dupe repeated "retry" clicks while a VOD is already being linked.
    if (vod.matchLinkStatus === 'linking' && !opts?.force) return;
    if (vod.matchId && !opts?.force) return;
    if (vod.matchId && opts?.force) {
      params.db.unlinkMatch(vodId);
    }

    const settings = params.db.getSettings();
    const apiKey = settings['riot_api_key'];
    const puuid = settings['riot_puuid'];
    const region = settings['riot_region'] || 'NA';

    if (!apiKey || !puuid) {
      // Not configured; don't mark as error
      params.db.setVodLinkStatus({ vodId, status: 'not_found', error: 'Riot account not configured' });
      params.notifyVodsUpdated();
      return;
    }

    params.db.setVodLinkStatus({ vodId, status: 'linking' });
    // Push UI update immediately (so the user sees "Auto-linking…" right away)
    params.notifyVodsUpdated();

    try {
      const { listTftMatchIdsByPuuid, fetchTftMatch } = await import('../riot-api.js');

      // OBS file timestamps can be tricky (createdAt vs modifiedAt); try both to avoid huge windows.
      const vodTimesToTry: number[] = [];
      if (typeof vod.createdAt === 'number') vodTimesToTry.push(vod.createdAt);
      if (typeof vod.modifiedAt === 'number' && vod.modifiedAt !== vod.createdAt) vodTimesToTry.push(vod.modifiedAt);

      for (const vodTimeMs of vodTimesToTry) {
        // Single reasonably-sized window. TFT games are <~45min; add buffer for clock skew and OBS timing.
        const w = { startMs: vodTimeMs - 2 * 60_000, endMs: vodTimeMs + 90 * 60_000 };
        const startTimeSec = Math.floor(w.startMs / 1000);
        const endTimeSec = Math.floor(w.endMs / 1000);
        const count = 20;
        const cacheKey = `${region}|${puuid}|${startTimeSec}|${endTimeSec}|${count}`;

        const matchIds =
          matchIdsCache.get(cacheKey) ??
          (await params.withRiotRateLimit(() =>
            listTftMatchIdsByPuuid({
              puuid,
              region,
              apiKey,
              startTimeSec,
              endTimeSec,
              count,
            }),
          ));
        matchIdsCache.set(cacheKey, matchIds);

        if (!matchIds.length) continue;

        const candidates: Candidate[] = [];

        // Fetch details for up to N matches to score them.
        // Note: we try cache first (DB + in-memory) to avoid re-fetching across VODs.
        const MAX_MATCH_DETAILS = 6;
        for (const matchId of matchIds.slice(0, MAX_MATCH_DETAILS)) {
          const fromMem = matchTimeCache.get(matchId);
          const fromDb = fromMem ? null : getCachedCandidateFromMetadata(matchId);
          const cached = fromMem ?? fromDb;
          if (cached) {
            matchTimeCache.set(matchId, cached);
            candidates.push(cached);
            continue;
          }

          const match = await params.withRiotRateLimit(() => fetchTftMatch({ matchId, region, apiKey }));
          // Treat Riot's game_datetime as game END time; derive START using game_length.
          const matchEndMs = match?.info?.game_datetime;
          const gameLengthSec = match?.info?.game_length;
          if (typeof matchEndMs !== 'number' || typeof gameLengthSec !== 'number') continue;
          const matchStartMs = matchEndMs - gameLengthSec * 1000;
          const candidate = { matchId, matchStartMs, matchEndMs };
          matchTimeCache.set(matchId, candidate);
          candidates.push(candidate);

            // Opportunistically cache metadata for later UI rendering
            try {
              const participants = match?.info?.participants || [];
              const participant = participants.find((p: any) => p?.puuid === puuid) || participants[0];
              if (participant) {
                const normalizeTraits = (rawTraits: any[]) => {
                  const traits = Array.isArray(rawTraits) ? rawTraits : [];
                  return traits
                    .map((t) => ({
                      name: t?.name ?? t?.trait_name ?? t?.traitName ?? '',
                      numUnits: Number(t?.num_units ?? t?.numUnits ?? 0),
                      style: Number(t?.style ?? t?.styleCurrent ?? 0),
                      tierCurrent: Number(t?.tier_current ?? t?.tierCurrent ?? 0),
                      tierTotal: Number(t?.tier_total ?? t?.tierTotal ?? 0),
                    }))
                    .filter((t) => !!t.name && (t.tierCurrent > 0 || t.style > 0));
                };
                const stats = {
                  goldLeft: typeof participant?.gold_left === 'number' ? participant.gold_left : null,
                  lastRound: typeof participant?.last_round === 'number' ? participant.last_round : null,
                  totalDamageToPlayers:
                    typeof participant?.total_damage_to_players === 'number'
                      ? participant.total_damage_to_players
                      : null,
                  gameLengthSec: typeof match?.info?.game_length === 'number' ? match.info.game_length : null,
                  gameDatetimeMs: typeof match?.info?.game_datetime === 'number' ? match.info.game_datetime : null,
                  queueId: typeof match?.info?.queue_id === 'number' ? match.info.queue_id : null,
                  tftSetNumber: typeof match?.info?.tft_set_number === 'number' ? match.info.tft_set_number : null,
                };
                const normalizeUnits = (rawUnits: any[]) => {
                  const units = Array.isArray(rawUnits) ? rawUnits : [];
                  return units.map((u) => ({
                    ...u,
                    characterId: u?.characterId ?? u?.character_id ?? u?.character ?? u?.name ?? '',
                    tier: Number(u?.tier ?? 1),
                    items: Array.isArray(u?.items) ? u.items : u?.items,
                    itemNames: Array.isArray(u?.itemNames) ? u.itemNames : u?.itemNames,
                  }));
                };
                params.db.saveMatchMetadata(
                  matchId,
                  participant.placement,
                  Number(participant?.level ?? 0),
                  participant.augments || [],
                  normalizeTraits(participant.traits || []),
                  normalizeUnits(participant.units || []),
                  stats,
                  match,
                );
              }
            } catch {
              // ignore cache failures
            }
          }

          // Force mode: always show a picker (don't auto-link)
          if (opts?.force) {
            const ALLOW_EARLY_MS = 60_000;
            const ranked = candidates
              .map((c) => ({ matchId: c.matchId, signedDeltaMs: c.matchStartMs - vodTimeMs }))
              .filter((c) => c.signedDeltaMs >= -ALLOW_EARLY_MS)
              .sort((a, b) => a.signedDeltaMs - b.signedDeltaMs);

            if (ranked.length) {
              params.db.setVodLinkStatus({
                vodId,
                status: 'ambiguous',
                confidenceMs: Math.max(0, ranked[0].signedDeltaMs),
                candidates: ranked.slice(0, 5).map((r) => r.matchId),
                error: null,
              });
              return;
            }
            // No candidates for this vodTime; try next vodTime candidate
            continue;
          }

          const decision = scoreCandidates({ vodTimeMs, candidates });
          if (decision.status === 'linked' && decision.matchId) {
            params.db.linkMatch(vodId, decision.matchId);
            params.db.setVodLinkStatus({
              vodId,
              status: 'linked',
              confidenceMs: decision.confidenceMs ?? null,
              candidates: null,
              error: null,
            });
            // Ensure metadata exists (cache hit if already saved above)
            try {
              const { fetchMatchMetadata } = await import('../riot-api.js');
              await params.withRiotRateLimit(() => fetchMatchMetadata(decision.matchId!, region, params.db));
            } catch (e) {
              console.warn('Failed to fetch match metadata after linking:', e);
            }
            return;
          }
          if (decision.status === 'ambiguous') {
            params.db.setVodLinkStatus({
              vodId,
              status: 'ambiguous',
              confidenceMs: decision.confidenceMs ?? null,
              candidates: decision.candidates ?? null,
              error: null,
            });
            return;
          }
          // else not found for this vodTime; try next vodTime candidate
      }

      params.db.setVodLinkStatus({ vodId, status: 'not_found', error: null, candidates: null, confidenceMs: null });
    } catch (error: any) {
      params.db.setVodLinkStatus({
        vodId,
        status: 'error',
        error: error?.message || String(error),
        candidates: null,
        confidenceMs: null,
      });
    } finally {
      params.notifyVodsUpdated();
    }
  }

  async function autoLinkAllUnlinked(): Promise<void> {
    if (autoLinkInFlight) {
      autoLinkQueued = true;
      return;
    }
    autoLinkInFlight = true;
    // Clear caches for each run (keeps memory bounded; still reduces duplicates within run)
    matchIdsCache = new Map();
    matchTimeCache = new Map();
    try {
      const vods = params.db.listUnlinkedVods();
      for (const vod of vods) {
        await autoLinkVod(vod.id);
      }
    } finally {
      autoLinkInFlight = false;
      if (autoLinkQueued) {
        autoLinkQueued = false;
        scheduleAutoLink(500);
      }
    }
  }

  return {
    scheduleAutoLink,
    autoLinkVod,
    autoLinkAllUnlinked,
  };
}

