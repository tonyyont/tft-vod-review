import { Database } from './database.js';

export type RegionalRouting = 'americas' | 'europe' | 'asia' | 'sea';

const REGION_TO_REGIONAL_ROUTING: Record<string, RegionalRouting> = {
  // Simple dropdown values (recommended UX)
  NA: 'americas',
  BR: 'americas',
  LAN: 'americas',
  LAS: 'americas',

  EUW: 'europe',
  EUNE: 'europe',
  TR: 'europe',
  RU: 'europe',

  KR: 'asia',
  JP: 'asia',

  OCE: 'sea',
};

// Back-compat for platform routing strings used elsewhere in the app or older configs
const PLATFORM_TO_REGIONAL_ROUTING: Record<string, RegionalRouting> = {
  na1: 'americas',
  br1: 'americas',
  la1: 'americas', // LAN
  la2: 'americas', // LAS

  euw1: 'europe',
  eun1: 'europe',
  tr1: 'europe',
  ru: 'europe',

  kr: 'asia',
  jp1: 'asia',

  oc1: 'sea',
};

export function toRegionalRouting(region: string): RegionalRouting {
  const normalized = (region || '').trim();
  const lower = normalized.toLowerCase();
  if (lower === 'americas' || lower === 'europe' || lower === 'asia' || lower === 'sea') {
    return lower;
  }
  if (REGION_TO_REGIONAL_ROUTING[normalized]) return REGION_TO_REGIONAL_ROUTING[normalized];
  if (PLATFORM_TO_REGIONAL_ROUTING[lower]) return PLATFORM_TO_REGIONAL_ROUTING[lower];
  throw new Error(`Unsupported region: ${region}`);
}

function normalizeApiKey(raw: string): string {
  const s = String(raw ?? '').trim().replace(/^["']|["']$/g, '');
  if (!s) return '';
  const rgapiMatch = s.match(/RGAPI-[0-9a-fA-F-]{16,}/);
  if (rgapiMatch?.[0]) return rgapiMatch[0].trim();
  const lower = s.toLowerCase();
  if (lower.startsWith('bearer ')) return s.slice('bearer '.length).trim();
  if (s.includes(':')) return s.split(':').slice(1).join(':').trim();
  return s;
}

async function riotFetchJson(url: string, apiKey: string): Promise<any> {
  const token = normalizeApiKey(apiKey);
  const response = await fetch(url, {
    headers: {
      'X-Riot-Token': token,
    },
  });

  if (!response.ok) {
    if (response.status === 404) throw new Error('Not found');
    if (response.status === 401) {
      throw new Error('Unauthorized (401). This usually means the API key was not sent/recognized. Make sure it is exactly `RGAPI-...`.');
    }
    if (response.status === 403) {
      throw new Error('Forbidden (403). Check your Riot API key (it may be expired) and permissions.');
    }
    if (response.status === 429) throw new Error('Rate limit exceeded. Please try again later.');
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

function normalizeTraits(rawTraits: any[]): any[] {
  const traits = Array.isArray(rawTraits) ? rawTraits : [];
  return traits
    .map((t) => {
      const name = t?.name ?? t?.trait_name ?? t?.traitName ?? '';
      const numUnits = t?.num_units ?? t?.numUnits ?? t?.num_units_in_team ?? t?.num_units_in_board ?? t?.num_units_in_current_team;
      const style = t?.style ?? t?.style_current ?? t?.styleCurrent ?? 0;
      const tierCurrent = t?.tier_current ?? t?.tierCurrent ?? 0;
      const tierTotal = t?.tier_total ?? t?.tierTotal ?? 0;
      return { name, numUnits: Number(numUnits ?? 0), style: Number(style ?? 0), tierCurrent: Number(tierCurrent ?? 0), tierTotal: Number(tierTotal ?? 0) };
    })
    // Filter to “active” traits (tierCurrent>0 or style>0), and valid names
    .filter((t) => !!t.name && (t.tierCurrent > 0 || t.style > 0));
}

export async function resolvePuuidByRiotId(params: {
  gameName: string;
  tagLine: string;
  region: string; // dropdown value or routing
  apiKey: string;
}): Promise<{ puuid: string }> {
  const regionalRouting = toRegionalRouting(params.region);
  const baseUrl = `https://${regionalRouting}.api.riotgames.com`;
  const url = `${baseUrl}/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(
    params.gameName
  )}/${encodeURIComponent(params.tagLine)}`;
  const data = await riotFetchJson(url, params.apiKey);
  if (!data?.puuid) throw new Error('Failed to resolve Riot ID');
  return { puuid: data.puuid };
}

export async function listTftMatchIdsByPuuid(params: {
  puuid: string;
  region: string; // dropdown value or routing
  apiKey: string;
  startTimeSec?: number;
  endTimeSec?: number;
  count?: number;
}): Promise<string[]> {
  const regionalRouting = toRegionalRouting(params.region);
  const baseUrl = `https://${regionalRouting}.api.riotgames.com`;
  const qs = new URLSearchParams();
  if (params.startTimeSec) qs.set('startTime', String(params.startTimeSec));
  if (params.endTimeSec) qs.set('endTime', String(params.endTimeSec));
  qs.set('count', String(params.count ?? 20));
  const url = `${baseUrl}/tft/match/v1/matches/by-puuid/${encodeURIComponent(params.puuid)}/ids?${qs.toString()}`;
  const data = await riotFetchJson(url, params.apiKey);
  return Array.isArray(data) ? (data as string[]) : [];
}

export async function fetchTftMatch(params: {
  matchId: string;
  region: string; // dropdown value or routing
  apiKey: string;
}): Promise<any> {
  const regionalRouting = toRegionalRouting(params.region);
  const baseUrl = `https://${regionalRouting}.api.riotgames.com`;
  const url = `${baseUrl}/tft/match/v1/matches/${encodeURIComponent(params.matchId)}`;
  return riotFetchJson(url, params.apiKey);
}

function normalizeUnits(rawUnits: any[]): any[] {
  const units = Array.isArray(rawUnits) ? rawUnits : [];
  return units.map((u) => {
    const characterId = u?.characterId ?? u?.character_id ?? u?.character ?? u?.name ?? '';
    const tier = Number(u?.tier ?? 1);
    const items = Array.isArray(u?.items) ? u.items : undefined;
    const itemNames = Array.isArray(u?.itemNames) ? u.itemNames : undefined;
    // Preserve original fields too for back-compat, but add normalized `characterId`.
    return {
      ...u,
      characterId,
      tier,
      ...(items ? { items } : null),
      ...(itemNames ? { itemNames } : null),
    };
  });
}

export async function fetchMatchMetadata(
  matchId: string,
  region: string,
  db: Database
): Promise<{
  matchId: string;
  placement: number;
  level: number;
  augments: string[];
  traits: any[];
  finalBoard: any[];
  stats: {
    goldLeft: number | null;
    lastRound: number | null;
    totalDamageToPlayers: number | null;
    gameLengthSec: number | null;
    gameDatetimeMs: number | null;
    queueId: number | null;
    tftSetNumber: number | null;
  };
  fetchedAt: number;
}> {
  // Check cache first
  const cached = db.getMatchMetadata(matchId);
  if (cached) {
    return cached;
  }

  // Get API key from settings
  const settings = db.getSettings();
  const apiKey = settings['riot_api_key'];
  if (!apiKey) {
    throw new Error('Riot API key not configured');
  }

  const data = await fetchTftMatch({ matchId, region, apiKey });

  // Extract player data (prefer configured puuid, fall back to first participant)
  const configuredPuuid = settings['riot_puuid'] || '';
  const participants = data?.info?.participants || [];
  const participant =
    (configuredPuuid
      ? participants.find((p: any) => p?.puuid === configuredPuuid)
      : null) || participants[0];
  if (!participant) throw new Error('Match participants not available');

  const placement = participant.placement;
  const level = Number(participant?.level ?? 0);
  const augments = participant.augments || [];
  const traits = normalizeTraits(participant.traits || []);
  const finalBoard = normalizeUnits(participant.units || []);
  const stats = {
    goldLeft: typeof participant?.gold_left === 'number' ? participant.gold_left : null,
    lastRound: typeof participant?.last_round === 'number' ? participant.last_round : null,
    totalDamageToPlayers:
      typeof participant?.total_damage_to_players === 'number' ? participant.total_damage_to_players : null,
    gameLengthSec: typeof data?.info?.game_length === 'number' ? data.info.game_length : null,
    gameDatetimeMs: typeof data?.info?.game_datetime === 'number' ? data.info.game_datetime : null,
    queueId: typeof data?.info?.queue_id === 'number' ? data.info.queue_id : null,
    tftSetNumber: typeof data?.info?.tft_set_number === 'number' ? data.info.tft_set_number : null,
  };

  // Save to cache
  db.saveMatchMetadata(matchId, placement, level, augments, traits, finalBoard, stats, data);

  return {
    matchId,
    placement,
    level,
    augments,
    traits,
    finalBoard,
    stats,
    fetchedAt: Date.now(),
  };
}
