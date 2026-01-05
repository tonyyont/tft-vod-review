import { contextBridge, ipcRenderer } from 'electron';
import type { ElectronAPI } from '../common/ipc.js';

const api: ElectronAPI = {
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
  setVODTitle: (vodId: number, title: string | null) => ipcRenderer.invoke('set-vod-title', vodId, title),
  
  // Match metadata
  linkMatch: (vodId: number, matchId: string) => ipcRenderer.invoke('link-match', vodId, matchId),
  fetchMatchMetadata: (matchId: string, region?: string) =>
    ipcRenderer.invoke('fetch-match-metadata', matchId, region),
  getMatchMetadata: (matchId: string) => ipcRenderer.invoke('get-match-metadata', matchId),
  testRiotConnection: (params) => ipcRenderer.invoke('test-riot-connection', params),
  autoLinkAll: () => ipcRenderer.invoke('auto-link-all'),
  autoLinkVOD: (vodId: number, opts?: { force?: boolean }) => ipcRenderer.invoke('auto-link-vod', vodId, opts),
  getVODLinkCandidates: (vodId: number) => ipcRenderer.invoke('get-vod-link-candidates', vodId),
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  getAssetUrl: (assetKey: string) => {
    return ipcRenderer.invoke('get-asset-url', assetKey);
  },
  
  // File dialogs
  selectFolder: () => ipcRenderer.invoke('select-folder'),
};

contextBridge.exposeInMainWorld('electronAPI', api);
