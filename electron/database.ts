import BetterSQLite3 from 'better-sqlite3';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';

export class Database {
  private db: BetterSQLite3.Database;

  constructor() {
    const userDataPath = app.getPath('userData');
    const dbPath = path.join(userDataPath, 'tftvod.db');
    
    // Ensure userData directory exists
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }

    this.db = new BetterSQLite3(dbPath);
  }

  initialize() {
    // VODs table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS vods (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_path TEXT UNIQUE NOT NULL,
        file_name TEXT NOT NULL,
        file_size INTEGER,
        created_at INTEGER,
        modified_at INTEGER,
        match_id TEXT,
        review_text TEXT
      );
    `);

    // Match metadata cache
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS match_metadata (
        match_id TEXT PRIMARY KEY,
        placement INTEGER,
        augments TEXT,
        traits TEXT,
        final_board TEXT,
        fetched_at INTEGER,
        raw_data TEXT
      );
    `);

    // Settings
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `);

    // Create indices
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_vods_match_id ON vods(match_id);
      CREATE INDEX IF NOT EXISTS idx_vods_created_at ON vods(created_at);
    `);
  }

  // Settings
  getSettings(): Record<string, string> {
    const rows = this.db.prepare('SELECT key, value FROM settings').all() as Array<{ key: string; value: string }>;
    const settings: Record<string, string> = {};
    for (const row of rows) {
      settings[row.key] = row.value;
    }
    return settings;
  }

  setSetting(key: string, value: string): void {
    this.db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
  }

  // VODs
  getVODs(): Array<{
    id: number;
    filePath: string;
    fileName: string;
    fileSize: number;
    createdAt: number;
    modifiedAt: number;
    matchId: string | null;
    reviewText: string | null;
  }> {
    const rows = this.db.prepare('SELECT * FROM vods ORDER BY created_at DESC').all() as Array<{
      id: number;
      file_path: string;
      file_name: string;
      file_size: number;
      created_at: number;
      modified_at: number;
      match_id: string | null;
      review_text: string | null;
    }>;
    return rows.map(row => ({
      id: row.id,
      filePath: row.file_path,
      fileName: row.file_name,
      fileSize: row.file_size,
      createdAt: row.created_at,
      modifiedAt: row.modified_at,
      matchId: row.match_id,
      reviewText: row.review_text,
    }));
  }

  getVOD(vodId: number): {
    id: number;
    filePath: string;
    fileName: string;
    fileSize: number;
    createdAt: number;
    modifiedAt: number;
    matchId: string | null;
    reviewText: string | null;
  } | null {
    const result = this.db.prepare('SELECT * FROM vods WHERE id = ?').get(vodId) as {
      id: number;
      file_path: string;
      file_name: string;
      file_size: number;
      created_at: number;
      modified_at: number;
      match_id: string | null;
      review_text: string | null;
    } | undefined;
    if (!result) return null;
    return {
      id: result.id,
      filePath: result.file_path,
      fileName: result.file_name,
      fileSize: result.file_size,
      createdAt: result.created_at,
      modifiedAt: result.modified_at,
      matchId: result.match_id,
      reviewText: result.review_text,
    };
  }

  upsertVOD(filePath: string, fileName: string, fileSize: number, createdAt: number, modifiedAt: number): number {
    const stmt = this.db.prepare(`
      INSERT INTO vods (file_path, file_name, file_size, created_at, modified_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(file_path) DO UPDATE SET
        file_name = excluded.file_name,
        file_size = excluded.file_size,
        modified_at = excluded.modified_at
    `);
    const result = stmt.run(filePath, fileName, fileSize, createdAt, modifiedAt);
    if (result.lastInsertRowid) {
      return result.lastInsertRowid as number;
    }
    const existing = this.db.prepare('SELECT id FROM vods WHERE file_path = ?').get(filePath) as { id: number } | undefined;
    return existing?.id || 0;
  }

  listVODFilePaths(): string[] {
    const rows = this.db.prepare('SELECT file_path FROM vods').all() as Array<{ file_path: string }>;
    return rows.map(r => r.file_path);
  }

  deleteVODByPath(filePath: string): void {
    this.db.prepare('DELETE FROM vods WHERE file_path = ?').run(filePath);
  }

  saveReview(vodId: number, reviewText: string): void {
    this.db.prepare('UPDATE vods SET review_text = ? WHERE id = ?').run(reviewText, vodId);
  }

  linkMatch(vodId: number, matchId: string): void {
    this.db.prepare('UPDATE vods SET match_id = ? WHERE id = ?').run(matchId, vodId);
  }

  // Match metadata
  getMatchMetadata(matchId: string): {
    matchId: string;
    placement: number;
    augments: string[];
    traits: any[];
    finalBoard: any[];
    fetchedAt: number;
  } | null {
    const result = this.db.prepare('SELECT * FROM match_metadata WHERE match_id = ?').get(matchId) as any;
    if (!result) return null;

    return {
      matchId: result.match_id,
      placement: result.placement,
      augments: JSON.parse(result.augments || '[]'),
      traits: JSON.parse(result.traits || '[]'),
      finalBoard: JSON.parse(result.final_board || '[]'),
      fetchedAt: result.fetched_at,
    };
  }

  saveMatchMetadata(
    matchId: string,
    placement: number,
    augments: string[],
    traits: any[],
    finalBoard: any[],
    rawData: any
  ): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO match_metadata 
      (match_id, placement, augments, traits, final_board, fetched_at, raw_data)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      matchId,
      placement,
      JSON.stringify(augments),
      JSON.stringify(traits),
      JSON.stringify(finalBoard),
      Date.now(),
      JSON.stringify(rawData)
    );
  }

  close() {
    this.db.close();
  }
}
