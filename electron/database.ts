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
        match_link_status TEXT,
        match_link_confidence_ms INTEGER,
        match_link_updated_at INTEGER,
        match_link_candidates TEXT,
        match_link_error TEXT,
        review_text TEXT
      );
    `);

    // Match metadata cache
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS match_metadata (
        match_id TEXT PRIMARY KEY,
        placement INTEGER,
        level INTEGER,
        augments TEXT,
        traits TEXT,
        final_board TEXT,
        stats TEXT,
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

    // Best-effort migration for existing user DBs (SQLite doesn't support IF NOT EXISTS for ADD COLUMN)
    this.migrateVodsTable();
    this.migrateMatchMetadataTable();
  }

  private migrateVodsTable(): void {
    const cols = this.db
      .prepare(`PRAGMA table_info(vods)`)
      .all() as Array<{ name: string }>;
    const existing = new Set(cols.map(c => c.name));

    const addColumnIfMissing = (name: string, ddlType: string) => {
      if (existing.has(name)) return;
      this.db.exec(`ALTER TABLE vods ADD COLUMN ${name} ${ddlType};`);
      existing.add(name);
    };

    addColumnIfMissing('match_link_status', 'TEXT');
    addColumnIfMissing('match_link_confidence_ms', 'INTEGER');
    addColumnIfMissing('match_link_updated_at', 'INTEGER');
    addColumnIfMissing('match_link_candidates', 'TEXT');
    addColumnIfMissing('match_link_error', 'TEXT');
  }

  private migrateMatchMetadataTable(): void {
    const cols = this.db
      .prepare(`PRAGMA table_info(match_metadata)`)
      .all() as Array<{ name: string }>;
    const existing = new Set(cols.map(c => c.name));

    const addColumnIfMissing = (name: string, ddlType: string) => {
      if (existing.has(name)) return;
      this.db.exec(`ALTER TABLE match_metadata ADD COLUMN ${name} ${ddlType};`);
      existing.add(name);
    };

    addColumnIfMissing('level', 'INTEGER');
    addColumnIfMissing('stats', 'TEXT');
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
    matchLinkStatus: string | null;
    matchLinkConfidenceMs: number | null;
    matchLinkUpdatedAt: number | null;
    matchLinkCandidates: string[] | null;
    matchLinkError: string | null;
    reviewText: string | null;
    matchMetadata: any | null;
  }> {
    const rows = this.db.prepare('SELECT * FROM vods ORDER BY created_at DESC').all() as Array<{
      id: number;
      file_path: string;
      file_name: string;
      file_size: number;
      created_at: number;
      modified_at: number;
      match_id: string | null;
      match_link_status: string | null;
      match_link_confidence_ms: number | null;
      match_link_updated_at: number | null;
      match_link_candidates: string | null;
      match_link_error: string | null;
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
      matchLinkStatus: row.match_link_status,
      matchLinkConfidenceMs: row.match_link_confidence_ms,
      matchLinkUpdatedAt: row.match_link_updated_at,
      matchLinkCandidates: row.match_link_candidates ? JSON.parse(row.match_link_candidates) : null,
      matchLinkError: row.match_link_error,
      reviewText: row.review_text,
      matchMetadata: row.match_id ? this.getMatchMetadata(row.match_id) : null,
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
    matchLinkStatus: string | null;
    matchLinkConfidenceMs: number | null;
    matchLinkUpdatedAt: number | null;
    matchLinkCandidates: string[] | null;
    matchLinkError: string | null;
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
      match_link_status: string | null;
      match_link_confidence_ms: number | null;
      match_link_updated_at: number | null;
      match_link_candidates: string | null;
      match_link_error: string | null;
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
      matchLinkStatus: result.match_link_status,
      matchLinkConfidenceMs: result.match_link_confidence_ms,
      matchLinkUpdatedAt: result.match_link_updated_at,
      matchLinkCandidates: result.match_link_candidates ? JSON.parse(result.match_link_candidates) : null,
      matchLinkError: result.match_link_error,
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
    this.db
      .prepare(
        'UPDATE vods SET match_id = ?, match_link_status = ?, match_link_updated_at = ?, match_link_error = NULL WHERE id = ?'
      )
      .run(matchId, 'linked', Date.now(), vodId);
  }

  unlinkMatch(vodId: number): void {
    this.db
      .prepare(
        `
        UPDATE vods
        SET
          match_id = NULL,
          match_link_status = NULL,
          match_link_confidence_ms = NULL,
          match_link_updated_at = ?,
          match_link_candidates = NULL,
          match_link_error = NULL
        WHERE id = ?
      `
      )
      .run(Date.now(), vodId);
  }

  listUnlinkedVods(): Array<{
    id: number;
    createdAt: number;
    modifiedAt: number;
    matchId: string | null;
  }> {
    const rows = this.db
      .prepare(
        `
        SELECT id, created_at, modified_at, match_id
        FROM vods
        WHERE match_id IS NULL
        ORDER BY created_at DESC
      `
      )
      .all() as Array<{ id: number; created_at: number; modified_at: number; match_id: string | null }>;
    return rows.map(r => ({
      id: r.id,
      createdAt: r.created_at,
      modifiedAt: r.modified_at,
      matchId: r.match_id,
    }));
  }

  setVodLinkStatus(params: {
    vodId: number;
    status: 'linking' | 'linked' | 'ambiguous' | 'not_found' | 'error';
    confidenceMs?: number | null;
    candidates?: string[] | null;
    error?: string | null;
  }): void {
    const now = Date.now();
    this.db
      .prepare(
        `
        UPDATE vods
        SET
          match_link_status = ?,
          match_link_confidence_ms = ?,
          match_link_updated_at = ?,
          match_link_candidates = ?,
          match_link_error = ?
        WHERE id = ?
      `
      )
      .run(
        params.status,
        params.confidenceMs ?? null,
        now,
        params.candidates ? JSON.stringify(params.candidates) : null,
        params.error ?? null,
        params.vodId
      );
  }

  // Match metadata
  getMatchMetadata(matchId: string): {
    matchId: string;
    placement: number;
    level: number;
    augments: string[];
    traits: any[];
    finalBoard: any[];
    stats: any;
    fetchedAt: number;
  } | null {
    const result = this.db.prepare('SELECT * FROM match_metadata WHERE match_id = ?').get(matchId) as any;
    if (!result) return null;

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

    const deriveFromRaw = (raw: any) => {
      const participants = raw?.info?.participants || [];
      const settings = this.getSettings();
      const puuid = settings['riot_puuid'] || '';
      const participant =
        (puuid ? participants.find((p: any) => p?.puuid === puuid) : null) || participants[0] || null;
      return {
        level: Number(participant?.level ?? 0),
        stats: {
          goldLeft: typeof participant?.gold_left === 'number' ? participant.gold_left : null,
          lastRound: typeof participant?.last_round === 'number' ? participant.last_round : null,
          totalDamageToPlayers:
            typeof participant?.total_damage_to_players === 'number' ? participant.total_damage_to_players : null,
          gameLengthSec: typeof raw?.info?.game_length === 'number' ? raw.info.game_length : null,
          gameDatetimeMs: typeof raw?.info?.game_datetime === 'number' ? raw.info.game_datetime : null,
          queueId: typeof raw?.info?.queue_id === 'number' ? raw.info.queue_id : null,
          tftSetNumber: typeof raw?.info?.tft_set_number === 'number' ? raw.info.tft_set_number : null,
        },
      };
    };

    const rawData = result.raw_data ? JSON.parse(result.raw_data) : null;
    const derived = rawData ? deriveFromRaw(rawData) : { level: 0, stats: {} };
    const normalizeUnits = (rawUnits: any[]) => {
      const units = Array.isArray(rawUnits) ? rawUnits : [];
      return units.map((u) => ({
        ...u,
        characterId: u?.characterId ?? u?.character_id ?? u?.character ?? u?.name ?? '',
        tier: Number(u?.tier ?? 1),
        // Preserve both forms; UI prefers numeric items then itemNames
        items: Array.isArray(u?.items) ? u.items : u?.items,
        itemNames: Array.isArray(u?.itemNames) ? u.itemNames : u?.itemNames,
      }));
    };

    return {
      matchId: result.match_id,
      placement: result.placement,
      level: typeof result.level === 'number' ? result.level : derived.level,
      augments: JSON.parse(result.augments || '[]'),
      traits: normalizeTraits(JSON.parse(result.traits || '[]')),
      finalBoard: normalizeUnits(JSON.parse(result.final_board || '[]')),
      stats: result.stats ? JSON.parse(result.stats || '{}') : derived.stats,
      fetchedAt: result.fetched_at,
    };
  }

  saveMatchMetadata(
    matchId: string,
    placement: number,
    level: number,
    augments: string[],
    traits: any[],
    finalBoard: any[],
    stats: any,
    rawData: any
  ): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO match_metadata 
      (match_id, placement, level, augments, traits, final_board, stats, fetched_at, raw_data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      matchId,
      placement,
      level,
      JSON.stringify(augments),
      JSON.stringify(traits),
      JSON.stringify(finalBoard),
      JSON.stringify(stats ?? {}),
      Date.now(),
      JSON.stringify(rawData)
    );
  }

  close() {
    this.db.close();
  }
}
