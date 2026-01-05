export const REGIONS = ['NA', 'EUW', 'EUNE', 'KR', 'OCE', 'JP', 'BR', 'LAN', 'LAS', 'TR', 'RU'] as const;
export type RiotRegion = (typeof REGIONS)[number];

export type RiotFormValues = {
  region: RiotRegion;
  gameName: string;
  tagLine: string;
  apiKey: string;
};

function normalizeApiKey(raw: string): string {
  const s = String(raw ?? '').trim().replace(/^["']|["']$/g, '');
  if (!s) return '';

  // If user pasted a header or other wrapper, try to extract the RGAPI token.
  const rgapiMatch = s.match(/RGAPI-[0-9a-fA-F-]{16,}/);
  if (rgapiMatch?.[0]) return rgapiMatch[0].trim();

  // Common paste formats:
  // - "X-Riot-Token: RGAPI-..."
  // - "Bearer RGAPI-..."
  const lower = s.toLowerCase();
  if (lower.startsWith('bearer ')) return s.slice('bearer '.length).trim();
  if (s.includes(':')) return s.split(':').slice(1).join(':').trim();

  return s;
}

export function normalizeElectronInvokeError(err: unknown): string {
  const raw = (err as any)?.message || String(err);
  return String(raw).replace(/^Error invoking remote method '.*?': Error: /, '');
}

export function canTestRiot(values: RiotFormValues): boolean {
  return !!normalizeApiKey(values.apiKey) && !!values.gameName.trim() && !!values.tagLine.trim();
}

export async function persistRiotSettings(values: RiotFormValues): Promise<void> {
  const apiKey = normalizeApiKey(values.apiKey);
  const gameName = values.gameName.trim();
  const tagLine = values.tagLine.trim();

  if (apiKey) await window.electronAPI.setSetting('riot_api_key', apiKey);
  await window.electronAPI.setSetting('riot_region', values.region);
  if (gameName) await window.electronAPI.setSetting('riot_game_name', gameName);
  if (tagLine) await window.electronAPI.setSetting('riot_tag_line', tagLine);
}

export async function testAndPersistPuuid(values: RiotFormValues): Promise<string> {
  const res = await window.electronAPI.testRiotConnection({
    region: values.region,
    gameName: values.gameName.trim(),
    tagLine: values.tagLine.trim(),
    apiKey: normalizeApiKey(values.apiKey),
  });
  await window.electronAPI.setSetting('riot_puuid', res.puuid);
  return res.puuid;
}

