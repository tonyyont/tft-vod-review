import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSetting: (key: string, value: string) => ipcRenderer.invoke('set-setting', key, value),
  
  // VODs
  scanVODs: (folderPath: string) => ipcRenderer.invoke('scan-vods', folderPath),
  getVODs: () => ipcRenderer.invoke('get-vods'),
  getVOD: (vodId: number) => ipcRenderer.invoke('get-vod', vodId),
  onVodsUpdated: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('vods-updated', listener);
    return () => ipcRenderer.removeListener('vods-updated', listener);
  },
  
  // Reviews
  saveReview: (vodId: number, reviewText: string) => ipcRenderer.invoke('save-review', vodId, reviewText),
  
  // Match metadata
  linkMatch: (vodId: number, matchId: string) => ipcRenderer.invoke('link-match', vodId, matchId),
  fetchMatchMetadata: (matchId: string, region?: string) => ipcRenderer.invoke('fetch-match-metadata', matchId, region),
  getMatchMetadata: (matchId: string) => ipcRenderer.invoke('get-match-metadata', matchId),
  testRiotConnection: (params: { region: string; gameName: string; tagLine: string; apiKey: string }) =>
    ipcRenderer.invoke('test-riot-connection', params),
  autoLinkAll: () => ipcRenderer.invoke('auto-link-all'),
  autoLinkVOD: (vodId: number, opts?: { force?: boolean }) => ipcRenderer.invoke('auto-link-vod', vodId, opts),
  getVODLinkCandidates: (vodId: number) => ipcRenderer.invoke('get-vod-link-candidates', vodId),
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  
  // File dialogs
  selectFolder: () => ipcRenderer.invoke('select-folder'),
});

// Type definitions for TypeScript
export type ElectronAPI = {
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
};

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
