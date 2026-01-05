import type { MatchLinkCandidate, MatchMetadata, VOD } from './types.js';

export type TestRiotConnectionParams = {
  region: string;
  gameName: string;
  tagLine: string;
  apiKey: string;
};

export type ElectronAPI = {
  // Settings
  getSettings: () => Promise<Record<string, string>>;
  setSetting: (key: string, value: string) => Promise<void>;

  // VODs
  scanVODs: (folderPath: string) => Promise<void>;
  getVODs: () => Promise<VOD[]>;
  getVOD: (vodId: number) => Promise<VOD | null>;
  onVodsUpdated: (callback: () => void) => () => void;

  // Reviews
  saveReview: (vodId: number, reviewText: string) => Promise<void>;

  // Match metadata
  linkMatch: (vodId: number, matchId: string) => Promise<void>;
  fetchMatchMetadata: (matchId: string, region?: string) => Promise<MatchMetadata>;
  getMatchMetadata: (matchId: string) => Promise<MatchMetadata | null>;
  testRiotConnection: (params: TestRiotConnectionParams) => Promise<{ puuid: string }>;
  autoLinkAll: () => Promise<void>;
  autoLinkVOD: (vodId: number, opts?: { force?: boolean }) => Promise<void>;
  getVODLinkCandidates: (vodId: number) => Promise<MatchLinkCandidate[]>;

  // Misc
  openExternal: (url: string) => Promise<void>;
  getAssetUrl: (assetKey: string) => Promise<string>;

  // File dialogs
  selectFolder: () => Promise<string | null>;
};

