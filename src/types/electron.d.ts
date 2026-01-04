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
      selectFolder: () => Promise<string | null>;
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
  reviewText: string | null;
};

export type MatchMetadata = {
  matchId: string;
  placement: number;
  augments: string[];
  traits: Trait[];
  finalBoard: Champion[];
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
  characterId: string;
  items: number[];
  tier: number;
};

export {};
