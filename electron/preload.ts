import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSetting: (key: string, value: string) => ipcRenderer.invoke('set-setting', key, value),
  
  // VODs
  scanVODs: (folderPath: string) => ipcRenderer.invoke('scan-vods', folderPath),
  getVODs: () => ipcRenderer.invoke('get-vods'),
  getVOD: (vodId: number) => ipcRenderer.invoke('get-vod', vodId),
  
  // Reviews
  saveReview: (vodId: number, reviewText: string) => ipcRenderer.invoke('save-review', vodId, reviewText),
  
  // Match metadata
  linkMatch: (vodId: number, matchId: string) => ipcRenderer.invoke('link-match', vodId, matchId),
  fetchMatchMetadata: (matchId: string, region?: string) => ipcRenderer.invoke('fetch-match-metadata', matchId, region),
  getMatchMetadata: (matchId: string) => ipcRenderer.invoke('get-match-metadata', matchId),
  
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
  saveReview: (vodId: number, reviewText: string) => Promise<void>;
  linkMatch: (vodId: number, matchId: string) => Promise<void>;
  fetchMatchMetadata: (matchId: string, region?: string) => Promise<MatchMetadata>;
  getMatchMetadata: (matchId: string) => Promise<MatchMetadata | null>;
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
