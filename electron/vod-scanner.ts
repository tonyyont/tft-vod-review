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

  // Upsert each file into database
  for (const filePath of mp4Files) {
    const stats = fs.statSync(filePath);
    const fileName = path.basename(filePath);
    const fileSize = stats.size;
    const createdAt = Math.floor(stats.birthtimeMs);
    const modifiedAt = Math.floor(stats.mtimeMs);

    db.upsertVOD(filePath, fileName, fileSize, createdAt, modifiedAt);
  }
}
