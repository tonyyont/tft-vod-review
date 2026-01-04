import { app, BrowserWindow, ipcMain, dialog, protocol } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { Database } from './database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let db: Database;
let vodWatcher: fs.FSWatcher | null = null;
let vodWatchPath: string | null = null;
let vodRescanTimer: NodeJS.Timeout | null = null;
let vodPollTimer: NodeJS.Timeout | null = null;
let vodRescanInFlight = false;
let vodRescanQueued = false;

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
  return result;
});

// VODs
ipcMain.handle('scan-vods', async (_event, folderPath: string) => {
  const { scanVODs } = await import('./vod-scanner.js');
  const result = await scanVODs(folderPath, db);
  // Ensure watcher is running for the scanned folder
  startVODWatcher(folderPath);
  mainWindow?.webContents.send('vods-updated');
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
  return db.saveReview(vodId, reviewText);
});

// Match metadata
ipcMain.handle('link-match', async (_event, vodId: number, matchId: string) => {
  return db.linkMatch(vodId, matchId);
});

ipcMain.handle('fetch-match-metadata', async (_event, matchId: string, region: string = 'na1') => {
  const { fetchMatchMetadata } = await import('./riot-api.js');
  return fetchMatchMetadata(matchId, region, db);
});

ipcMain.handle('get-match-metadata', async (_event, matchId: string) => {
  return db.getMatchMetadata(matchId);
});

// File dialogs
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory'],
  });
  return result.canceled ? null : result.filePaths[0];
});
