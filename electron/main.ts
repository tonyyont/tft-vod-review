import { app, BrowserWindow, ipcMain, dialog, protocol, shell } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { Database } from './database.js';
import { createDDragonAssetService } from './ddragon-assets.js';
import { resolveVodRequestToFilePath } from './services/vod-protocol.js';
import { createRiotRateLimiter } from './services/riot-rate-limiter.js';
import { createAutoLinker } from './services/auto-linker.js';
import { createVodWatcher } from './services/vod-watcher.js';
import { registerIpcHandlers } from './ipc/router.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let db: Database;
const ddragonAssets = createDDragonAssetService();
const riotLimiter = createRiotRateLimiter();
let autoLinker: ReturnType<typeof createAutoLinker> | null = null;
let vodWatcherService: ReturnType<typeof createVodWatcher> | null = null;

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
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }
}

// Register custom protocol for serving video files
app.whenReady().then(() => {
  // Initialize database
  db = new Database();
  db.initialize();

  const notifyVodsUpdated = () => {
    mainWindow?.webContents.send('vods-updated');
  };

  autoLinker = createAutoLinker({
    db,
    withRiotRateLimit: riotLimiter.withRiotRateLimit,
    notifyVodsUpdated,
  });

  vodWatcherService = createVodWatcher({
    onRescan: async (folderPath) => {
      try {
        const { scanVODs } = await import('./vod-scanner.js');
        await scanVODs(folderPath, db);
        notifyVodsUpdated();
        autoLinker?.scheduleAutoLink(250);
      } catch (error) {
        console.error('Error rescanning VODs:', error);
      }
    },
  });

  protocol.registerFileProtocol('vod', (request, callback) => {
    const settings = db.getSettings();
    const allowedRoots = settings.obs_folder_path ? [settings.obs_folder_path] : [];
    const resolved = resolveVodRequestToFilePath({
      requestUrl: request.url,
      allowedRoots,
      allowedExtensions: ['.mp4'],
    });

    if (resolved.ok) {
      callback({ path: resolved.filePath });
      return;
    }

    console.error('Blocked vod:// request:', { url: request.url, reason: resolved.reason });
    callback({ error: -6 }); // FILE_NOT_FOUND (avoid leaking details)
  });

  createWindow();

  registerIpcHandlers({
    ipcMain,
    dialog,
    shell,
    getMainWindow: () => mainWindow,
    db,
    startVODWatcher: (folderPath) => vodWatcherService?.start(folderPath),
    withRiotRateLimit: riotLimiter.withRiotRateLimit,
    scheduleAutoLink: (delayMs) => autoLinker?.scheduleAutoLink(delayMs),
    autoLinkVod: async (vodId, opts) => {
      await autoLinker?.autoLinkVod(vodId, opts);
    },
    getAssetUrl: (assetKey) => ddragonAssets.resolveAssetUrl(assetKey),
  });

  // Start realtime watcher if folder is configured
  const settings = db.getSettings();
  if (settings.obs_folder_path) {
    vodWatcherService.start(settings.obs_folder_path);
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
  vodWatcherService?.stop();
});
