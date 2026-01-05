export type VodLinkStatus = 'linking' | 'linked' | 'ambiguous' | 'not_found' | 'error';

export type MatchLinkCandidate = {
  matchId: string;
  matchStartMs: number;
  matchEndMs: number;
  placement: number | null;
  deltaMs: number;
};

export type Trait = {
  name: string;
  numUnits: number;
  style: number;
  tierCurrent: number;
  tierTotal: number;
};

export type Champion = {
  tier: number;
  // Riot match API uses `character_id` and `itemNames` (strings). We normalize where possible,
  // but keep these optional for backward compatibility with cached rows.
  characterId?: string;
  character_id?: string;
  items?: number[];
  itemNames?: string[];
};

export type MatchMetadata = {
  matchId: string;
  placement: number;
  level: number;
  augments: string[];
  traits: Trait[];
  finalBoard: Champion[];
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
};

export type VOD = {
  id: number;
  filePath: string;
  fileName: string;
  displayTitle: string | null;
  fileSize: number;
  createdAt: number;
  modifiedAt: number;
  matchId: string | null;
  matchLinkStatus: VodLinkStatus | null;
  matchLinkConfidenceMs: number | null;
  matchLinkUpdatedAt: number | null;
  matchLinkCandidates: string[] | null;
  matchLinkError: string | null;
  reviewText: string | null;
  matchMetadata?: MatchMetadata | null;
};

