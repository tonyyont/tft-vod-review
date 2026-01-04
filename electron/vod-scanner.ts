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

  // Upsert each file into database
  for (const filePath of mp4Files) {
    const stats = fs.statSync(filePath);
    const fileName = path.basename(filePath);
    const fileSize = stats.size;
    const createdAt = Math.floor(stats.birthtimeMs);
    const modifiedAt = Math.floor(stats.mtimeMs);

    db.upsertVOD(filePath, fileName, fileSize, createdAt, modifiedAt);
  }

  // Remove DB rows for files that no longer exist (keeps DB in sync with disk)
  const existingPaths = db.listVODFilePaths();
  for (const existingPath of existingPaths) {
    const normalizedExisting = path.resolve(existingPath);
    // Only delete rows for files within the folder being scanned
    if (!normalizedExisting.startsWith(normalizedRoot)) continue;
    if (!mp4Set.has(existingPath) || !fs.existsSync(existingPath)) {
      db.deleteVODByPath(existingPath);
    }
  }
}
