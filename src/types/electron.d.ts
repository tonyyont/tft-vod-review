declare global {
  interface Window {
    electronAPI: {
      getSettings: () => Promise<Record<string, string>>;
      setSetting: (key: string, value: string) => Promise<void>;
      scanVODs: (folderPath: string) => Promise<void>;
      getVODs: () => Promise<VOD[]>;
      getVOD: (vodId: number) => Promise<VOD | null>;
      onVodsUpdated: (callback: () => void) => () => void;
      saveReview: (vodId: number, reviewText: string) => Promise<void>;
      linkMatch: (vodId: number, matchId: string) => Promise<void>;
      fetchMatchMetadata: (matchId: string, region?: string) => Promise<MatchMetadata>;
      getMatchMetadata: (matchId: string) => Promise<MatchMetadata | null>;
      testRiotConnection: (params: { region: string; gameName: string; tagLine: string; apiKey: string }) => Promise<{ puuid: string }>;
      autoLinkAll: () => Promise<void>;
      autoLinkVOD: (vodId: number, opts?: { force?: boolean }) => Promise<void>;
      getVODLinkCandidates: (vodId: number) => Promise<Array<{
        matchId: string;
        matchStartMs: number;
        matchEndMs: number;
        placement: number | null;
        deltaMs: number;
      }>>;
      openExternal: (url: string) => Promise<void>;
      selectFolder: () => Promise<string | null>;
      getAssetUrl: (assetKey: string) => Promise<string>;
    };
  }
}

export type VOD = {
  id: number;
  filePath: string;
  fileName: string;
  fileSize: number;
  createdAt: number;
  modifiedAt: number;
  matchId: string | null;
  matchLinkStatus: string | null;
  matchLinkConfidenceMs: number | null;
  matchLinkUpdatedAt: number | null;
  matchLinkCandidates: string[] | null;
  matchLinkError: string | null;
  reviewText: string | null;
  matchMetadata?: MatchMetadata | null;
};

export type MatchMetadata = {
  matchId: string;
  placement: number;
  level: number;
  augments: string[];
  traits: Trait[];
  finalBoard: Champion[];
  stats?: {
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

export {};
