import type { ElectronAPI } from '../../common/ipc.js';
export type { ElectronAPI } from '../../common/ipc.js';
export type {
  Champion,
  MatchLinkCandidate,
  MatchMetadata,
  Trait,
  VOD,
  VodLinkStatus,
} from '../../common/types.js';

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

