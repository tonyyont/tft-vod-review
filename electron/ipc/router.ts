import type { BrowserWindow, IpcMain, Dialog, Shell } from 'electron';
import { z } from 'zod';
import type { Database } from '../database.js';

export function registerIpcHandlers(params: {
  ipcMain: IpcMain;
  dialog: Dialog;
  shell: Shell;
  getMainWindow: () => BrowserWindow | null;
  db: Database;
  startVODWatcher: (folderPath: string) => void;
  withRiotRateLimit: <T>(fn: () => Promise<T>) => Promise<T>;
  scheduleAutoLink: (delayMs?: number) => void;
  autoLinkVod: (vodId: number, opts?: { force?: boolean }) => Promise<void>;
  getAssetUrl: (assetKey: string) => Promise<string>;
}) {
  const IpcSchemas = {
    urlHttp: z
      .string()
      .url()
      .refine((u) => /^https?:\/\//i.test(u), { message: 'Only http(s) URLs are allowed' }),
    vodId: z.number().int().nonnegative(),
    matchId: z.string().min(1).max(128),
    folderPath: z.string().min(1),
    settingKey: z.string().min(1).max(128),
    settingValue: z.string().max(100_000),
    riotTestParams: z.object({
      region: z.string().min(1).max(16),
      gameName: z.string().min(1).max(32),
      tagLine: z.string().min(1).max(16),
      apiKey: z.string().min(1).max(256),
    }),
    forceOpts: z
      .object({
        force: z.boolean().optional(),
      })
      .optional(),
    assetKey: z.string().min(1).max(256),
  };

  function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown, label: string): T {
    const res = schema.safeParse(value);
    if (!res.success) {
      throw new Error(`Invalid ${label}: ${res.error.issues.map((i) => i.message).join(', ')}`);
    }
    return res.data;
  }

  // Settings
  params.ipcMain.handle('get-settings', async () => {
    return params.db.getSettings();
  });

  params.ipcMain.handle('set-setting', async (_event, key: string, value: string) => {
    const safeKey = parseOrThrow(IpcSchemas.settingKey, key, 'setting key');
    const safeValue = parseOrThrow(IpcSchemas.settingValue, value, 'setting value');
    const result = params.db.setSetting(safeKey, safeValue);
    if (safeKey === 'obs_folder_path') {
      params.startVODWatcher(safeValue);
    }
    if (safeKey.startsWith('riot_')) {
      // If Riot settings become available/changed, retry auto-linking
      params.scheduleAutoLink(250);
    }
    return result;
  });

  // VODs
  params.ipcMain.handle('scan-vods', async (_event, folderPath: string) => {
    const safeFolder = parseOrThrow(IpcSchemas.folderPath, folderPath, 'folder path');
    const { scanVODs } = await import('../vod-scanner.js');
    const result = await scanVODs(safeFolder, params.db);
    // Ensure watcher is running for the scanned folder
    params.startVODWatcher(safeFolder);
    params.getMainWindow()?.webContents.send('vods-updated');
    params.scheduleAutoLink(250);
    return result;
  });

  params.ipcMain.handle('get-vods', async () => {
    return params.db.getVODs();
  });

  params.ipcMain.handle('get-vod', async (_event, vodId: number) => {
    const safeVodId = parseOrThrow(IpcSchemas.vodId, vodId, 'vod id');
    return params.db.getVOD(safeVodId);
  });

  // Reviews
  params.ipcMain.handle('save-review', async (_event, vodId: number, reviewText: string) => {
    const safeVodId = parseOrThrow(IpcSchemas.vodId, vodId, 'vod id');
    const safeText = parseOrThrow(IpcSchemas.settingValue, reviewText, 'review text');
    const result = params.db.saveReview(safeVodId, safeText);
    params.getMainWindow()?.webContents.send('vods-updated');
    return result;
  });

  // Match metadata
  params.ipcMain.handle('link-match', async (_event, vodId: number, matchId: string) => {
    const safeVodId = parseOrThrow(IpcSchemas.vodId, vodId, 'vod id');
    const safeMatchId = parseOrThrow(IpcSchemas.matchId, matchId, 'match id');
    return params.db.linkMatch(safeVodId, safeMatchId);
  });

  params.ipcMain.handle('fetch-match-metadata', async (_event, matchId: string, region?: string) => {
    const safeMatchId = parseOrThrow(IpcSchemas.matchId, matchId, 'match id');
    const { fetchMatchMetadata } = await import('../riot-api.js');
    const settings = params.db.getSettings();
    const effectiveRegion = region || settings.riot_region || 'NA';
    return params.withRiotRateLimit(() => fetchMatchMetadata(safeMatchId, effectiveRegion, params.db));
  });

  params.ipcMain.handle(
    'test-riot-connection',
    async (
      _event,
      p: { region: string; gameName: string; tagLine: string; apiKey: string },
    ): Promise<{ puuid: string }> => {
      const safe = parseOrThrow(IpcSchemas.riotTestParams, p, 'riot test params');
      const { resolvePuuidByRiotId } = await import('../riot-api.js');
      return params.withRiotRateLimit(() =>
        resolvePuuidByRiotId({
          region: safe.region,
          gameName: safe.gameName,
          tagLine: safe.tagLine,
          apiKey: safe.apiKey,
        }),
      );
    },
  );

  params.ipcMain.handle('auto-link-all', async () => {
    params.scheduleAutoLink(0);
  });

  params.ipcMain.handle('auto-link-vod', async (_event, vodId: number, opts?: { force?: boolean }) => {
    const safeVodId = parseOrThrow(IpcSchemas.vodId, vodId, 'vod id');
    const safeOpts = parseOrThrow(IpcSchemas.forceOpts, opts, 'options');
    await params.autoLinkVod(safeVodId, safeOpts);
  });

  params.ipcMain.handle('get-vod-link-candidates', async (_event, vodId: number) => {
    const safeVodId = parseOrThrow(IpcSchemas.vodId, vodId, 'vod id');
    const vod = params.db.getVOD(safeVodId);
    if (!vod?.matchLinkCandidates?.length) return [];
    const settings = params.db.getSettings();
    const apiKey = settings['riot_api_key'];
    const puuid = settings['riot_puuid'];
    const region = settings['riot_region'] || 'NA';
    if (!apiKey || !puuid) return [];

    const { fetchTftMatch } = await import('../riot-api.js');
    const vodTimeMs = vod.createdAt;
    const ALLOW_EARLY_MS = 60_000;

    const results: Array<{
      matchId: string;
      matchStartMs: number;
      matchEndMs: number;
      placement: number | null;
      deltaMs: number;
    }> = [];

    for (const matchId of vod.matchLinkCandidates.slice(0, 5)) {
      try {
        const match = await params.withRiotRateLimit(() => fetchTftMatch({ matchId, region, apiKey }));
        // Treat Riot's game_datetime as game END time; derive START using game_length.
        const matchEndMs = match?.info?.game_datetime;
        const gameLengthSec = match?.info?.game_length;
        if (typeof matchEndMs !== 'number' || typeof gameLengthSec !== 'number') continue;
        const matchStartMs = matchEndMs - gameLengthSec * 1000;
        const participants = match?.info?.participants || [];
        const participant = participants.find((pp: any) => pp?.puuid === puuid) || participants[0];
        const placement = participant?.placement ?? null;
        // Assumption: VOD timestamp represents game start, so show delta vs start time only.
        const signedDeltaMs = matchStartMs - vodTimeMs;
        if (signedDeltaMs < -ALLOW_EARLY_MS) continue;
        const deltaMs = Math.max(0, signedDeltaMs);
        results.push({ matchId, matchStartMs, matchEndMs, placement, deltaMs });
      } catch {
        // skip
      }
    }

    return results.sort((a, b) => a.deltaMs - b.deltaMs);
  });

  params.ipcMain.handle('get-match-metadata', async (_event, matchId: string) => {
    const safeMatchId = parseOrThrow(IpcSchemas.matchId, matchId, 'match id');
    return params.db.getMatchMetadata(safeMatchId);
  });

  params.ipcMain.handle('get-asset-url', async (_event, assetKey: string) => {
    const safeAssetKey = parseOrThrow(IpcSchemas.assetKey, assetKey, 'asset key');
    return params.getAssetUrl(safeAssetKey);
  });

  params.ipcMain.handle('open-external', async (_event, url: string) => {
    const safeUrl = parseOrThrow(IpcSchemas.urlHttp, url, 'url');
    await params.shell.openExternal(safeUrl);
  });

  // File dialogs
  params.ipcMain.handle('select-folder', async () => {
    const result = await params.dialog.showOpenDialog(params.getMainWindow()!, {
      properties: ['openDirectory'],
    });
    return result.canceled ? null : result.filePaths[0];
  });
}

