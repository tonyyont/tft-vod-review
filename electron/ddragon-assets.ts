type AssetKind = 'champion' | 'item' | 'trait' | 'augment' | 'placeholder';

type DDragonVersion = string;

const DDRAGON_BASE = 'https://ddragon.leagueoflegends.com';

function parseAssetKey(assetKey: string): { kind: AssetKind; id: string } | null {
  const key = String(assetKey || '').trim();
  const idx = key.indexOf(':');
  if (idx <= 0) return null;
  const kind = key.slice(0, idx) as AssetKind;
  const id = key.slice(idx + 1);
  if (!id) return null;
  if (!['champion', 'item', 'trait', 'augment', 'placeholder'].includes(kind)) return null;
  return { kind, id };
}

function placeholderDataUrl(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
  <rect width="64" height="64" rx="10" ry="10" fill="#2a2a2a"/>
  <path d="M16 44 L32 20 L48 44 Z" fill="#444"/>
  <circle cx="24" cy="28" r="3" fill="#666"/>
  <path d="M18 42 L28 32 L36 38 L46 30 L52 42 Z" fill="#555" opacity="0.9"/>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

function buildImgUrl(version: string, group: string, full: string): string {
  // DDragon image groups are like "tft-champion", "tft-trait", "tft-item", "tft-augment"
  return `${DDRAGON_BASE}/cdn/${encodeURIComponent(version)}/img/${encodeURIComponent(group)}/${encodeURIComponent(full)}`;
}

type ImageInfo = { full: string; group: string };

function getImageInfo(obj: any): ImageInfo | null {
  const image = obj?.image;
  const full = image?.full;
  const group = image?.group;
  if (typeof full === 'string' && full && typeof group === 'string' && group) return { full, group };
  return null;
}

function normalizeIdVariants(id: string): string[] {
  const raw = String(id || '').trim();
  if (!raw) return [];
  const out = new Set<string>();
  out.add(raw);
  // Strip common TFT set suffixes
  out.add(raw.replace(/\.TFT_Set\d+$/i, ''));
  out.add(raw.replace(/\.tft_set\d+$/i, ''));
  // Strip extension if someone passes filename-like ids
  out.add(raw.replace(/\.(png|jpg|jpeg|webp)$/i, ''));
  // If filename includes set suffix before extension (e.g. TFT16_Qiyana.TFT_Set16.png)
  out.add(raw.replace(/\.TFT_Set\d+\.(png|jpg|jpeg|webp)$/i, ''));
  out.add(raw.replace(/\.tft_set\d+\.(png|jpg|jpeg|webp)$/i, ''));
  return [...out].filter(Boolean);
}

function addAliases(map: Map<string, ImageInfo>, ids: Array<string | undefined | null>, img: ImageInfo) {
  for (const v of ids) {
    if (typeof v !== 'string') continue;
    for (const k of normalizeIdVariants(v)) map.set(k, img);
  }
}

export function createDDragonAssetService() {
  let versionPromise: Promise<DDragonVersion> | null = null;
  let indexesPromise: Promise<{
    version: DDragonVersion;
    championsById: Map<string, ImageInfo>;
    traitsById: Map<string, ImageInfo>;
    augmentsById: Map<string, ImageInfo>;
    itemsByNumericId: Map<number, ImageInfo>;
    itemsById: Map<string, ImageInfo>;
  }> | null = null;

  async function getLatestVersion(): Promise<DDragonVersion> {
    if (versionPromise) return versionPromise;
    versionPromise = (async () => {
      const versions = await fetchJson(`${DDRAGON_BASE}/api/versions.json`);
      if (!Array.isArray(versions) || !versions.length) throw new Error('No Data Dragon versions available');
      const v = versions[0];
      if (typeof v !== 'string' || !v) throw new Error('Invalid Data Dragon version');
      return v;
    })();
    return versionPromise;
  }

  async function loadIndexes() {
    if (indexesPromise) return indexesPromise;
    indexesPromise = (async () => {
      const version = await getLatestVersion();
      const base = `${DDRAGON_BASE}/cdn/${encodeURIComponent(version)}/data/en_US`;

      const [championsJson, traitsJson, itemsJson, augmentsJson] = await Promise.all([
        fetchJson(`${base}/tft-champion.json`),
        fetchJson(`${base}/tft-trait.json`),
        fetchJson(`${base}/tft-item.json`),
        fetchJson(`${base}/tft-augments.json`),
      ]);

      const championsById = new Map<string, ImageInfo>();
      const traitsById = new Map<string, ImageInfo>();
      const augmentsById = new Map<string, ImageInfo>();
      const itemsByNumericId = new Map<number, ImageInfo>();
      const itemsById = new Map<string, ImageInfo>();

      const ingestDataObject = (json: any, onEntry: (key: string, entry: any) => void) => {
        const data = json?.data;
        if (data && typeof data === 'object') {
          for (const [k, v] of Object.entries<any>(data)) onEntry(k, v);
        }
      };

      // Champions: keys typically match match API characterId (e.g. TFT16_Qiyana)
      ingestDataObject(championsJson, (key, entry) => {
        const img = getImageInfo(entry);
        if (!img) return;
        addAliases(
          championsById,
          [
            key,
            entry?.id,
            entry?.apiName,
            entry?.characterId,
            entry?.character_id,
            // Derive ids from the filename itself
            typeof img.full === 'string' ? img.full.replace(/\.(png|jpg|jpeg|webp)$/i, '') : undefined,
          ],
          img
        );
      });

      // Traits: keys typically match match API trait name (e.g. TFT16_Bilgewater)
      ingestDataObject(traitsJson, (key, entry) => {
        const img = getImageInfo(entry);
        if (!img) return;
        addAliases(traitsById, [key, entry?.id, entry?.apiName], img);
      });

      // Augments: match API returns strings; DDragon keys usually match those ids.
      ingestDataObject(augmentsJson, (key, entry) => {
        const img = getImageInfo(entry);
        if (!img) return;
        addAliases(augmentsById, [key, entry?.id, entry?.apiName], img);
      });

      // Items: mapping is tricky; we try to find a numeric id field that matches match API ints.
      ingestDataObject(itemsJson, (key, entry) => {
        const img = getImageInfo(entry);
        if (!img) return;
        // String IDs (common in itemNames): e.g. TFT_Item_InfinityEdge
        addAliases(itemsById, [key, entry?.id, entry?.nameId, entry?.apiName], img);
        // Sometimes the object keys are numeric strings
        const keyNum = Number(key);
        if (Number.isFinite(keyNum) && keyNum > 0) itemsByNumericId.set(keyNum, img);
        const candidates = [
          entry?.id,
          entry?.itemId,
          entry?.itemID,
          entry?.tftItemId,
          entry?.riotId,
        ];
        for (const c of candidates) {
          const n = Number(c);
          if (Number.isFinite(n) && n > 0) {
            itemsByNumericId.set(n, img);
          }
        }
      });

      return { version, championsById, traitsById, augmentsById, itemsByNumericId, itemsById };
    })();
    return indexesPromise;
  }

  async function resolveAssetUrl(assetKey: string): Promise<string> {
    const parsed = parseAssetKey(assetKey);
    if (!parsed) return placeholderDataUrl();
    if (parsed.kind === 'placeholder') return placeholderDataUrl();

    try {
      const idx = await loadIndexes();

      if (parsed.kind === 'champion') {
        const img = idx.championsById.get(parsed.id);
        return img ? buildImgUrl(idx.version, img.group, img.full) : placeholderDataUrl();
      }
      if (parsed.kind === 'trait') {
        const img = idx.traitsById.get(parsed.id);
        return img ? buildImgUrl(idx.version, img.group, img.full) : placeholderDataUrl();
      }
      if (parsed.kind === 'augment') {
        const img = idx.augmentsById.get(parsed.id);
        return img ? buildImgUrl(idx.version, img.group, img.full) : placeholderDataUrl();
      }
      if (parsed.kind === 'item') {
        const maybeNum = Number(parsed.id);
        if (Number.isFinite(maybeNum) && maybeNum > 0) {
          const img = idx.itemsByNumericId.get(maybeNum);
          return img ? buildImgUrl(idx.version, img.group, img.full) : placeholderDataUrl();
        }
        const img = idx.itemsById.get(parsed.id);
        return img ? buildImgUrl(idx.version, img.group, img.full) : placeholderDataUrl();
      }
      return placeholderDataUrl();
    } catch {
      return placeholderDataUrl();
    }
  }

  return {
    getLatestVersion,
    resolveAssetUrl,
  };
}

