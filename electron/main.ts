import { app, BrowserWindow, ipcMain, dialog, protocol, shell } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { Database } from './database.js';
import type { RegionalRouting } from './riot-api.js';
import { createDDragonAssetService } from './ddragon-assets.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let db: Database;
const ddragonAssets = createDDragonAssetService();
let vodWatcher: fs.FSWatcher | null = null;
let vodWatchPath: string | null = null;
let vodRescanTimer: NodeJS.Timeout | null = null;
let vodPollTimer: NodeJS.Timeout | null = null;
let vodRescanInFlight = false;
let vodRescanQueued = false;

// --- Riot rate limiting (personal key friendly) ---
let riotLastRequestAt = 0;
let riotRecentRequests: number[] = []; // timestamps (ms) within rolling 120s
const RIOT_MIN_INTERVAL_MS = 250; // 4 req/sec conservative
const RIOT_WINDOW_MS = 120_000;
const RIOT_WINDOW_MAX = 90; // conservative under 100/2min

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function waitForRiotSlot(): Promise<void> {
  // Min interval
  const now = Date.now();
  const waitForInterval = riotLastRequestAt + RIOT_MIN_INTERVAL_MS - now;
  if (waitForInterval > 0) await sleep(waitForInterval);

  // Rolling window
  const now2 = Date.now();
  riotRecentRequests = riotRecentRequests.filter((t) => now2 - t < RIOT_WINDOW_MS);
  if (riotRecentRequests.length >= RIOT_WINDOW_MAX) {
    const oldest = riotRecentRequests[0];
    const waitMs = oldest + RIOT_WINDOW_MS - now2 + 50;
    if (waitMs > 0) await sleep(waitMs);
  }

  const now3 = Date.now();
  riotLastRequestAt = now3;
  riotRecentRequests.push(now3);
}

async function withRiotRateLimit<T>(fn: () => Promise<T>): Promise<T> {
  await waitForRiotSlot();
  return fn();
}

// --- Auto-link queue ---
let autoLinkTimer: NodeJS.Timeout | null = null;
let autoLinkInFlight = false;
let autoLinkQueued = false;

function scheduleAutoLink(delayMs: number = 1000) {
  if (autoLinkTimer) clearTimeout(autoLinkTimer);
  autoLinkTimer = setTimeout(() => {
    autoLinkTimer = null;
    void autoLinkAllUnlinked();
  }, delayMs);
}

function scoreCandidates(params: {
  vodTimeMs: number;
  candidates: Array<{ matchId: string; matchStartMs: number; matchEndMs: number }>;
}): { status: 'linked' | 'ambiguous' | 'not_found'; matchId?: string; candidates?: string[]; confidenceMs?: number } {
  if (!params.candidates.length) return { status: 'not_found' };
  const ALLOW_EARLY_MS = 60_000; // tolerate small clock skew, but not minutes
  const scored = params.candidates
    .map((c) => ({
      ...c,
      deltaStart: Math.abs(c.matchStartMs - params.vodTimeMs),
    }))
    .map((c) => ({
      ...c,
      // Assumption: VOD timestamp represents game start.
      // Prefer matches that start at/after the VOD time; discard ones that start too far before it.
      signedDeltaStart: c.matchStartMs - params.vodTimeMs,
    }))
    .filter((c) => c.signedDeltaStart >= -ALLOW_EARLY_MS)
    .map((c) => ({
      ...c,
      score: Math.max(0, c.signedDeltaStart),
    }))
    .sort((a, b) => a.score - b.score);

  if (!scored.length) return { status: 'not_found' };

  const best = scored[0];
  const second = scored[1];

  // Confidence thresholds (tunable)
  if (best.score <= 3 * 60_000) {
    return { status: 'linked', matchId: best.matchId, confidenceMs: best.score };
  }
  if (best.score <= 10 * 60_000 && second && second.score - best.score >= 5 * 60_000) {
    return { status: 'linked', matchId: best.matchId, confidenceMs: best.score };
  }

  return {
    status: 'ambiguous',
    candidates: scored.slice(0, 5).map((c) => c.matchId),
    confidenceMs: best.score,
  };
}

async function autoLinkVod(vodId: number, opts?: { force?: boolean }): Promise<void> {
  const vod = db.getVOD(vodId);
  if (!vod) return;
  if (vod.matchId && !opts?.force) return;
  if (vod.matchId && opts?.force) {
    db.unlinkMatch(vodId);
  }

  const settings = db.getSettings();
  const apiKey = settings['riot_api_key'];
  const puuid = settings['riot_puuid'];
  const region = settings['riot_region'] || 'NA';

  if (!apiKey || !puuid) {
    // Not configured; don't mark as error
    db.setVodLinkStatus({ vodId, status: 'not_found', error: 'Riot account not configured' });
    return;
  }

  db.setVodLinkStatus({ vodId, status: 'linking' });

  try {
    const { listTftMatchIdsByPuuid, fetchTftMatch } = await import('./riot-api.js');

    // Assumption: VOD timestamp represents game start, so only use createdAt.
    const vodTimesToTry: number[] = [];
    if (typeof vod.createdAt === 'number') vodTimesToTry.push(vod.createdAt);

    for (const vodTimeMs of vodTimesToTry) {
      // Pass 1: shortly before (clock skew) through after VOD start.
      const windows: Array<{ startMs: number; endMs: number }> = [
        { startMs: vodTimeMs - 2 * 60_000, endMs: vodTimeMs + 45 * 60_000 },
        { startMs: vodTimeMs - 2 * 60_000, endMs: vodTimeMs + 3 * 60 * 60_000 },
      ];

      for (const w of windows) {
        const matchIds = await withRiotRateLimit(() =>
          listTftMatchIdsByPuuid({
            puuid,
            region,
            apiKey,
            startTimeSec: Math.floor(w.startMs / 1000),
            endTimeSec: Math.floor(w.endMs / 1000),
            count: 20,
          })
        );

        if (!matchIds.length) continue;

        const candidates: Array<{ matchId: string; matchStartMs: number; matchEndMs: number }> = [];

        // Fetch details for up to N matches to score them
        for (const matchId of matchIds.slice(0, 10)) {
          const match = await withRiotRateLimit(() => fetchTftMatch({ matchId, region, apiKey }));
          // Treat Riot's game_datetime as game END time; derive START using game_length.
          const matchEndMs = match?.info?.game_datetime;
          const gameLengthSec = match?.info?.game_length;
          if (typeof matchEndMs !== 'number' || typeof gameLengthSec !== 'number') continue;
          const matchStartMs = matchEndMs - gameLengthSec * 1000;
          candidates.push({ matchId, matchStartMs, matchEndMs });

          // Opportunistically cache metadata for later UI rendering
          try {
            const participants = match?.info?.participants || [];
            const participant = participants.find((p: any) => p?.puuid === puuid) || participants[0];
            if (participant) {
              const normalizeTraits = (rawTraits: any[]) => {
                const traits = Array.isArray(rawTraits) ? rawTraits : [];
                return traits
                  .map((t) => ({
                    name: t?.name ?? t?.trait_name ?? t?.traitName ?? '',
                    numUnits: Number(t?.num_units ?? t?.numUnits ?? 0),
                    style: Number(t?.style ?? t?.styleCurrent ?? 0),
                    tierCurrent: Number(t?.tier_current ?? t?.tierCurrent ?? 0),
                    tierTotal: Number(t?.tier_total ?? t?.tierTotal ?? 0),
                  }))
                  .filter((t) => !!t.name && (t.tierCurrent > 0 || t.style > 0));
              };
              const stats = {
                goldLeft: typeof participant?.gold_left === 'number' ? participant.gold_left : null,
                lastRound: typeof participant?.last_round === 'number' ? participant.last_round : null,
                totalDamageToPlayers:
                  typeof participant?.total_damage_to_players === 'number' ? participant.total_damage_to_players : null,
                gameLengthSec: typeof match?.info?.game_length === 'number' ? match.info.game_length : null,
                gameDatetimeMs: typeof match?.info?.game_datetime === 'number' ? match.info.game_datetime : null,
                queueId: typeof match?.info?.queue_id === 'number' ? match.info.queue_id : null,
                tftSetNumber: typeof match?.info?.tft_set_number === 'number' ? match.info.tft_set_number : null,
              };
              const normalizeUnits = (rawUnits: any[]) => {
                const units = Array.isArray(rawUnits) ? rawUnits : [];
                return units.map((u) => ({
                  ...u,
                  characterId: u?.characterId ?? u?.character_id ?? u?.character ?? u?.name ?? '',
                  tier: Number(u?.tier ?? 1),
                  items: Array.isArray(u?.items) ? u.items : u?.items,
                  itemNames: Array.isArray(u?.itemNames) ? u.itemNames : u?.itemNames,
                }));
              };
              db.saveMatchMetadata(
                matchId,
                participant.placement,
                Number(participant?.level ?? 0),
                participant.augments || [],
                normalizeTraits(participant.traits || []),
                normalizeUnits(participant.units || []),
                stats,
                match
              );
            }
          } catch {
            // ignore cache failures
          }
        }

        // Force mode: always show a picker (don't auto-link)
        if (opts?.force) {
          const ALLOW_EARLY_MS = 60_000;
          const ranked = candidates
            .map((c) => ({ matchId: c.matchId, signedDeltaMs: c.matchStartMs - vodTimeMs }))
            .filter((c) => c.signedDeltaMs >= -ALLOW_EARLY_MS)
            .sort((a, b) => a.signedDeltaMs - b.signedDeltaMs);

          if (ranked.length) {
            db.setVodLinkStatus({
              vodId,
              status: 'ambiguous',
              confidenceMs: Math.max(0, ranked[0].signedDeltaMs),
              candidates: ranked.slice(0, 5).map((r) => r.matchId),
              error: null,
            });
            return;
          }
          // No candidates in this window; try next window
          continue;
        }

        const decision = scoreCandidates({ vodTimeMs, candidates });
        if (decision.status === 'linked' && decision.matchId) {
          db.linkMatch(vodId, decision.matchId);
          db.setVodLinkStatus({
            vodId,
            status: 'linked',
            confidenceMs: decision.confidenceMs ?? null,
            candidates: null,
            error: null,
          });
          // Ensure metadata exists (cache hit if already saved above)
          try {
            const { fetchMatchMetadata } = await import('./riot-api.js');
            await withRiotRateLimit(() => fetchMatchMetadata(decision.matchId!, region, db));
          } catch (e) {
            console.warn('Failed to fetch match metadata after linking:', e);
          }
          return;
        }
        if (decision.status === 'ambiguous') {
          db.setVodLinkStatus({
            vodId,
            status: 'ambiguous',
            confidenceMs: decision.confidenceMs ?? null,
            candidates: decision.candidates ?? null,
            error: null,
          });
          return;
        }
        // else not found in this window; try next
      }
    }

    db.setVodLinkStatus({ vodId, status: 'not_found', error: null, candidates: null, confidenceMs: null });
  } catch (error: any) {
    db.setVodLinkStatus({
      vodId,
      status: 'error',
      error: error?.message || String(error),
      candidates: null,
      confidenceMs: null,
    });
  } finally {
    mainWindow?.webContents.send('vods-updated');
  }
}

async function autoLinkAllUnlinked(): Promise<void> {
  if (autoLinkInFlight) {
    autoLinkQueued = true;
    return;
  }
  autoLinkInFlight = true;
  try {
    const vods = db.listUnlinkedVods();
    for (const vod of vods) {
      await autoLinkVod(vod.id);
    }
  } finally {
    autoLinkInFlight = false;
    if (autoLinkQueued) {
      autoLinkQueued = false;
      scheduleAutoLink(500);
    }
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Load the app
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

function stopVODWatcher() {
  if (vodWatcher) {
    try {
      vodWatcher.close();
    } catch {
      // ignore
    }
    vodWatcher = null;
  }
  vodWatchPath = null;
  if (vodRescanTimer) {
    clearTimeout(vodRescanTimer);
    vodRescanTimer = null;
  }
  if (vodPollTimer) {
    clearInterval(vodPollTimer);
    vodPollTimer = null;
  }
  vodRescanInFlight = false;
  vodRescanQueued = false;
}

async function rescanVODsAndNotify() {
  if (!vodWatchPath) return;
  if (vodRescanInFlight) {
    vodRescanQueued = true;
    return;
  }
  vodRescanInFlight = true;
  try {
    const { scanVODs } = await import('./vod-scanner.js');
    await scanVODs(vodWatchPath, db);
    mainWindow?.webContents.send('vods-updated');
    scheduleAutoLink(250);
  } catch (error) {
    console.error('Error rescanning VODs:', error);
  } finally {
    vodRescanInFlight = false;
    if (vodRescanQueued) {
      vodRescanQueued = false;
      scheduleVODRescan(250);
    }
  }
}

function scheduleVODRescan(delayMs: number = 1000) {
  if (!vodWatchPath) return;
  if (vodRescanTimer) clearTimeout(vodRescanTimer);
  vodRescanTimer = setTimeout(() => {
    vodRescanTimer = null;
    void rescanVODsAndNotify();
  }, delayMs);
}

function startVODWatcher(folderPath: string) {
  stopVODWatcher();
  if (!folderPath) return;
  if (!fs.existsSync(folderPath)) {
    console.warn('VOD folder does not exist:', folderPath);
    return;
  }
  vodWatchPath = folderPath;

  try {
    vodWatcher = fs.watch(folderPath, { recursive: true }, () => {
      // Debounce rapid events from OBS writes/renames
      scheduleVODRescan(1000);
    });
  } catch (error) {
    console.error('Failed to watch VOD folder:', error);
    vodWatcher = null;
  }

  // Fallback poll in case fs.watch misses events on some filesystems
  vodPollTimer = setInterval(() => scheduleVODRescan(0), 15_000);

  // Ensure initial sync on startup / folder change
  scheduleVODRescan(0);
}

// Register custom protocol for serving video files
app.whenReady().then(() => {
  protocol.registerFileProtocol('vod', (request, callback) => {
    // Extract file path from vod:// protocol URL
    // Format: vod:///path/to/file or vod://path/to/file
    let filePath = request.url.replace('vod://', '');
    // Remove leading slash if present
    if (filePath.startsWith('/')) {
      filePath = filePath.substring(1);
    }
    filePath = decodeURIComponent(filePath);
    
    // Security check: ensure the file exists
    if (fs.existsSync(filePath)) {
      callback({ path: filePath });
    } else {
      console.error('Video file not found:', filePath);
      callback({ error: -6 }); // FILE_NOT_FOUND
    }
  });
  // Initialize database
  db = new Database();
  db.initialize();

  createWindow();

  // Start realtime watcher if folder is configured
  const settings = db.getSettings();
  if (settings.obs_folder_path) {
    startVODWatcher(settings.obs_folder_path);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopVODWatcher();
});

// IPC Handlers

// Settings
ipcMain.handle('get-settings', async () => {
  return db.getSettings();
});

ipcMain.handle('set-setting', async (_event, key: string, value: string) => {
  const result = db.setSetting(key, value);
  if (key === 'obs_folder_path') {
    startVODWatcher(value);
  }
  if (key.startsWith('riot_')) {
    // If Riot settings become available/changed, retry auto-linking
    scheduleAutoLink(250);
  }
  return result;
});

// VODs
ipcMain.handle('scan-vods', async (_event, folderPath: string) => {
  const { scanVODs } = await import('./vod-scanner.js');
  const result = await scanVODs(folderPath, db);
  // Ensure watcher is running for the scanned folder
  startVODWatcher(folderPath);
  mainWindow?.webContents.send('vods-updated');
  scheduleAutoLink(250);
  return result;
});

ipcMain.handle('get-vods', async () => {
  return db.getVODs();
});

ipcMain.handle('get-vod', async (_event, vodId: number) => {
  return db.getVOD(vodId);
});

// Reviews
ipcMain.handle('save-review', async (_event, vodId: number, reviewText: string) => {
  const result = db.saveReview(vodId, reviewText);
  mainWindow?.webContents.send('vods-updated');
  return result;
});

// Match metadata
ipcMain.handle('link-match', async (_event, vodId: number, matchId: string) => {
  return db.linkMatch(vodId, matchId);
});

ipcMain.handle('fetch-match-metadata', async (_event, matchId: string, region?: string) => {
  const { fetchMatchMetadata } = await import('./riot-api.js');
  const settings = db.getSettings();
  const effectiveRegion = region || settings.riot_region || 'NA';
  return withRiotRateLimit(() => fetchMatchMetadata(matchId, effectiveRegion, db));
});

ipcMain.handle(
  'test-riot-connection',
  async (
    _event,
    params: { region: string; gameName: string; tagLine: string; apiKey: string }
  ): Promise<{ puuid: string }> => {
    const { resolvePuuidByRiotId } = await import('./riot-api.js');
    return withRiotRateLimit(() =>
      resolvePuuidByRiotId({
        region: params.region,
        gameName: params.gameName,
        tagLine: params.tagLine,
        apiKey: params.apiKey,
      })
    );
  }
);

ipcMain.handle('auto-link-all', async () => {
  scheduleAutoLink(0);
});

ipcMain.handle('auto-link-vod', async (_event, vodId: number, opts?: { force?: boolean }) => {
  await autoLinkVod(vodId, opts);
});

ipcMain.handle('get-vod-link-candidates', async (_event, vodId: number) => {
  const vod = db.getVOD(vodId);
  if (!vod?.matchLinkCandidates?.length) return [];
  const settings = db.getSettings();
  const apiKey = settings['riot_api_key'];
  const puuid = settings['riot_puuid'];
  const region = settings['riot_region'] || 'NA';
  if (!apiKey || !puuid) return [];

  const { fetchTftMatch } = await import('./riot-api.js');
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
      const match = await withRiotRateLimit(() => fetchTftMatch({ matchId, region, apiKey }));
      // Treat Riot's game_datetime as game END time; derive START using game_length.
      const matchEndMs = match?.info?.game_datetime;
      const gameLengthSec = match?.info?.game_length;
      if (typeof matchEndMs !== 'number' || typeof gameLengthSec !== 'number') continue;
      const matchStartMs = matchEndMs - gameLengthSec * 1000;
      const participants = match?.info?.participants || [];
      const participant = participants.find((p: any) => p?.puuid === puuid) || participants[0];
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

ipcMain.handle('get-match-metadata', async (_event, matchId: string) => {
  return db.getMatchMetadata(matchId);
});

ipcMain.handle('get-asset-url', async (_event, assetKey: string) => {
  return ddragonAssets.resolveAssetUrl(assetKey);
});

ipcMain.handle('open-external', async (_event, url: string) => {
  if (typeof url !== 'string' || !url) return;
  // Basic allow-list: only open http(s)
  if (!/^https?:\/\//i.test(url)) return;
  await shell.openExternal(url);
});

// File dialogs
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory'],
  });
  return result.canceled ? null : result.filePaths[0];
});
