import { app, BrowserWindow, ipcMain, dialog, protocol } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { Database } from './database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let db: Database;

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

// IPC Handlers

// Settings
ipcMain.handle('get-settings', async () => {
  return db.getSettings();
});

ipcMain.handle('set-setting', async (_event, key: string, value: string) => {
  return db.setSetting(key, value);
});

// VODs
ipcMain.handle('scan-vods', async (_event, folderPath: string) => {
  const { scanVODs } = await import('./vod-scanner.js');
  return scanVODs(folderPath, db);
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
