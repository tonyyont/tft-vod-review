import fs from 'fs';
import path from 'path';
import { Database } from './database.js';

export async function scanVODs(folderPath: string, db: Database): Promise<void> {
  if (!fs.existsSync(folderPath)) {
    throw new Error('Folder does not exist');
  }

  const mp4Files: string[] = [];

  function scanDirectory(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        scanDirectory(fullPath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.mp4')) {
        mp4Files.push(fullPath);
      }
    }
  }

  scanDirectory(folderPath);

  const mp4Set = new Set(mp4Files);
  const normalizedRoot = path.resolve(folderPath) + path.sep;

  // Upsert in a single transaction for atomicity + speed
  const rows: Array<{ filePath: string; fileName: string; fileSize: number; createdAt: number; modifiedAt: number }> = [];
  for (const filePath of mp4Files) {
    const stats = fs.statSync(filePath);
    rows.push({
      filePath,
      fileName: path.basename(filePath),
      fileSize: stats.size,
      createdAt: Math.floor(stats.birthtimeMs),
      modifiedAt: Math.floor(stats.mtimeMs),
    });
  }
  db.upsertVODBatch(rows);

  // Remove DB rows for files that no longer exist (keeps DB in sync with disk)
  const existingPaths = db.listVODFilePaths();
  const toDelete: string[] = [];
  for (const existingPath of existingPaths) {
    const normalizedExisting = path.resolve(existingPath);
    // Only delete rows for files within the folder being scanned
    if (!normalizedExisting.startsWith(normalizedRoot)) continue;
    if (!mp4Set.has(existingPath) || !fs.existsSync(existingPath)) {
      toDelete.push(existingPath);
    }
  }
  db.deleteVODsByPath(toDelete);
}
