import type { MatchMetadata, VOD } from '../types/electron';

export function reviewSnippet(text: string | null | undefined, maxLen = 140): string {
  const raw = String(text ?? '').trim();
  if (!raw) return '';
  const firstLine = raw.split(/\r?\n/).find((l) => l.trim().length > 0)?.trim() ?? '';
  const base = firstLine || raw.replace(/\s+/g, ' ').trim();
  if (base.length <= maxLen) return base;
  return base.slice(0, Math.max(0, maxLen - 1)).trimEnd() + '…';
}

function formatShortDate(ts: number): string {
  return new Date(ts).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function topTrait(md: MatchMetadata): { name: string; numUnits: number } | null {
  const traits = Array.isArray(md.traits) ? md.traits : [];
  if (!traits.length) return null;
  const sorted = [...traits].sort((a, b) => (b.tierCurrent - a.tierCurrent) || (b.numUnits - a.numUnits));
  const t = sorted[0];
  if (!t?.name) return null;
  return { name: t.name, numUnits: Number(t.numUnits ?? 0) };
}

function cleanHumanLabel(raw: string): string {
  let s = String(raw ?? '').trim();
  if (!s) return '';
  // Strip internal TFT keys like "TFT16_Freljord" -> "Freljord"
  s = s.replace(/^TFT\d+_/i, '');
  // Convert underscores to spaces for readability
  s = s.replace(/_/g, ' ');
  // Collapse whitespace
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

export function deriveVODTitle(params: { vod: VOD; metadata?: MatchMetadata | null }): string {
  const { vod, metadata } = params;
  const md = metadata ?? vod.matchMetadata ?? null;

  if (md) {
    const aug1 = Array.isArray(md.augments) ? md.augments.find((a) => !!String(a).trim()) : null;
    const cleanAug1 = aug1 ? cleanHumanLabel(aug1) : '';
    if (cleanAug1) return cleanAug1;
    const tt = topTrait(md);
    if (tt) return `${cleanHumanLabel(tt.name)}${tt.numUnits ? ` (${tt.numUnits})` : ''}`;
    return formatShortDate(vod.createdAt);
  }

  return `Unlinked VOD • ${formatShortDate(vod.createdAt)}`;
}

