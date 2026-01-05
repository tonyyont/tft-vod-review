import { useEffect, useMemo, useState } from 'react';
import type { MatchMetadata, Champion, Trait } from '../types/electron';

const assetUrlCache = new Map<string, string>();
const assetUrlInFlight = new Map<string, Promise<string>>();

function useAssetUrl(assetKey: string | null): string | null {
  const [url, setUrl] = useState<string | null>(() => {
    if (!assetKey) return null;
    return assetUrlCache.get(assetKey) ?? null;
  });

  useEffect(() => {
    if (!assetKey) {
      setUrl(null);
      return;
    }
    if (!window.electronAPI?.getAssetUrl) {
      // App not rebuilt / preload mismatch: fail gracefully (no icons) instead of throwing.
      setUrl(null);
      return;
    }
    const cached = assetUrlCache.get(assetKey);
    if (cached) {
      setUrl(cached);
      return;
    }

    let cancelled = false;
    const p =
      assetUrlInFlight.get(assetKey) ??
      window.electronAPI.getAssetUrl(assetKey).then((u) => {
        // Don’t permanently cache placeholders; allow future retries if the backing resolver improves.
        if (!String(u).startsWith('data:image/svg+xml')) {
          assetUrlCache.set(assetKey, u);
        }
        return u;
      });
    assetUrlInFlight.set(assetKey, p);

    p.then((u) => {
      if (cancelled) return;
      setUrl(u);
    }).catch(() => {
      // ignore
    }).finally(() => {
      assetUrlInFlight.delete(assetKey);
    });

    return () => {
      cancelled = true;
    };
  }, [assetKey]);

  return url;
}

function PlacementBadge({ placement, compact }: { placement: number; compact: boolean }) {
  const bg =
    placement <= 1 ? '#d8b255' :
    placement <= 2 ? '#c0c0c0' :
    placement <= 4 ? '#4a9eff' :
    '#444';
  const size = compact ? 34 : 42;
  return (
    <div style={{
      width: size,
      height: size,
      borderRadius: 10,
      backgroundColor: bg,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#0b0b0b',
      fontWeight: 900,
      fontSize: compact ? 14 : 16,
      boxShadow: '0 0 0 1px rgba(0,0,0,0.4) inset',
      flex: '0 0 auto',
    }}>
      #{placement}
    </div>
  );
}

function LevelPill({ level, compact }: { level: number; compact: boolean }) {
  return (
    <div style={{
      padding: compact ? '6px 10px' : '7px 12px',
      borderRadius: 999,
      backgroundColor: '#1a1a1a',
      border: '1px solid #333',
      color: '#ddd',
      fontSize: compact ? 12 : 13,
      fontWeight: 700,
      flex: '0 0 auto',
    }}>
      Lv {level || 0}
    </div>
  );
}

function ItemIcon({ itemKey }: { itemKey: string | number }) {
  const src = useAssetUrl(itemKey ? `item:${String(itemKey)}` : null);
  if (!src) return null;
  return (
    <img
      src={src}
      title={`Item ${String(itemKey)}`}
      style={{
        width: 14,
        height: 14,
        borderRadius: 3,
        border: '1px solid rgba(0,0,0,0.35)',
        backgroundColor: '#111',
      }}
    />
  );
}

function UnitTile({ unit, size }: { unit: Champion; size: number }) {
  const champId = unit.characterId ?? unit.character_id ?? '';
  const src = useAssetUrl(champId ? `champion:${champId}` : null);
  const stars = Math.max(1, Math.min(3, Number(unit.tier ?? 1)));
  const numericItems = Array.isArray(unit.items) ? unit.items.slice(0, 3) : [];
  const namedItems = Array.isArray(unit.itemNames) ? unit.itemNames.slice(0, 3) : [];
  const itemsToShow: Array<string | number> = numericItems.length ? numericItems : namedItems;

  return (
    <div style={{ width: size, height: size + 16, position: 'relative', flex: '0 0 auto' }}>
      <div style={{
        width: size,
        height: size,
        borderRadius: 8,
        overflow: 'hidden',
        border: '1px solid #333',
        backgroundColor: '#111',
        position: 'relative',
      }}>
        {src ? (
          <img
            src={src}
            title={champId || 'Unknown unit'}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : null}
        <div style={{
          position: 'absolute',
          top: 6,
          left: 6,
          padding: '2px 6px',
          borderRadius: 999,
          backgroundColor: 'rgba(0,0,0,0.65)',
          color: '#fff',
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: 0.2,
        }}>
          {'★'.repeat(stars)}
        </div>
      </div>
      <div style={{
        marginTop: 4,
        display: 'flex',
        gap: 3,
        justifyContent: 'center',
      }}>
        {itemsToShow.map((it) => <ItemIcon key={String(it)} itemKey={it} />)}
      </div>
    </div>
  );
}

function TraitsRow({ traits }: { traits: Trait[] }) {
  const sorted = [...traits].sort((a, b) => (b.tierCurrent - a.tierCurrent) || (b.numUnits - a.numUnits));
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {sorted.map((t) => <TraitChip key={t.name} trait={t} />)}
    </div>
  );
}

function TraitChip({ trait }: { trait: Trait }) {
  const src = useAssetUrl(trait.name ? `trait:${trait.name}` : null);
  const tier =
    trait.tierCurrent >= Math.max(1, trait.tierTotal - 1) ? 'high' :
    trait.tierCurrent >= 2 ? 'mid' :
    'low';
  const borderColor =
    tier === 'high' ? 'rgba(74,158,255,0.55)' :
    tier === 'mid' ? 'rgba(255,204,102,0.45)' :
    '#333';
  const bg =
    tier === 'high' ? 'rgba(74,158,255,0.10)' :
    tier === 'mid' ? 'rgba(255,204,102,0.08)' :
    '#1a1a1a';

  return (
    <div
      title={`${trait.name} (${trait.numUnits})`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 10px',
        borderRadius: 999,
        backgroundColor: bg,
        border: `1px solid ${borderColor}`,
      }}
    >
      {src ? (
        <img
          src={src}
          style={{
            width: 18,
            height: 18,
            borderRadius: 4,
            backgroundColor: '#111',
          }}
        />
      ) : null}
      <div style={{ color: '#eee', fontSize: 12, fontWeight: 700 }}>
        {trait.numUnits}
      </div>
    </div>
  );
}

function AugmentsRow({ augments }: { augments: string[] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {augments.map((a) => <AugmentChip key={a} augment={a} />)}
    </div>
  );
}

function AugmentChip({ augment }: { augment: string }) {
  const src = useAssetUrl(augment ? `augment:${augment}` : null);
  return (
    <div
      title={augment}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 10px',
        borderRadius: 10,
        backgroundColor: '#1a1a1a',
        border: '1px solid #333',
      }}
    >
      {src ? (
        <img
          src={src}
          style={{
            width: 22,
            height: 22,
            borderRadius: 4,
            backgroundColor: '#111',
          }}
        />
      ) : null}
      <div style={{ color: '#ddd', fontSize: 12, fontWeight: 650 }}>
        {augment}
      </div>
    </div>
  );
}

function StatsGrid({ metadata }: { metadata: MatchMetadata }) {
  const stats = metadata.stats;
  const rows = [
    { label: 'Gold left', value: stats?.goldLeft ?? null },
    { label: 'Last round', value: stats?.lastRound ?? null },
    { label: 'Damage', value: stats?.totalDamageToPlayers ?? null },
    { label: 'Game length', value: stats?.gameLengthSec != null ? `${Math.round(stats.gameLengthSec / 60)}m` : null },
    { label: 'Queue', value: stats?.queueId ?? null },
    { label: 'Set', value: stats?.tftSetNumber ?? null },
  ].filter((r) => r.value !== null && r.value !== undefined);

  if (!rows.length) return null;
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
      gap: 8,
    }}>
      {rows.map((r) => (
        <div key={r.label} style={{
          padding: '10px 10px',
          borderRadius: 10,
          backgroundColor: '#1a1a1a',
          border: '1px solid #333',
        }}>
          <div style={{ color: '#888', fontSize: 11, marginBottom: 4 }}>{r.label}</div>
          <div style={{ color: '#fff', fontSize: 13, fontWeight: 750 }}>{String(r.value)}</div>
        </div>
      ))}
    </div>
  );
}

export function MatchRowSkeleton({ compact }: { compact: boolean }) {
  const h = compact ? 42 : 48;
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: compact ? '10px 0 0' : '12px 0 0',
      opacity: 0.8,
    }}>
      <div style={{ width: h, height: h, borderRadius: 10, backgroundColor: '#1f1f1f', border: '1px solid #333' }} />
      <div style={{ width: 64, height: 28, borderRadius: 999, backgroundColor: '#1f1f1f', border: '1px solid #333' }} />
      <div style={{ flex: 1, height: 38, borderRadius: 10, backgroundColor: '#1f1f1f', border: '1px solid #333' }} />
    </div>
  );
}

export default function MatchRow({
  metadata,
  variant = 'compact',
}: {
  metadata: MatchMetadata;
  variant?: 'compact' | 'full';
}) {
  const compact = variant === 'compact';
  const unitSize = compact ? 44 : 50;

  const finalBoard = useMemo(() => {
    const board = Array.isArray(metadata.finalBoard) ? metadata.finalBoard : [];
    // Prefer sorted by tier then items (rough “importance”), but keep stable
    return [...board].sort((a, b) => (b.tier - a.tier) || ((b.items?.length ?? 0) - (a.items?.length ?? 0)));
  }, [metadata.finalBoard]);

  return (
    <div style={{
      marginTop: compact ? 10 : 0,
      paddingTop: compact ? 10 : 0,
      borderTop: compact ? '1px solid #333' : undefined,
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}>
        <PlacementBadge placement={metadata.placement} compact={compact} />
        <LevelPill level={metadata.level} compact={compact} />
        <div style={{
          flex: 1,
          display: 'flex',
          gap: 10,
          overflowX: 'auto',
          paddingBottom: 6,
        }}>
          {finalBoard.slice(0, 12).map((u, idx) => (
            <UnitTile
              key={`${u.characterId || 'unknown'}-${u.tier}-${(u.items || []).join(',')}-${idx}`}
              unit={u}
              size={unitSize}
            />
          ))}
        </div>
      </div>

      {variant === 'full' && (
        <div style={{ marginTop: 14, display: 'grid', gap: 14 }}>
          {metadata.augments?.length ? (
            <div>
              <div style={{ color: '#aaa', fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Augments</div>
              <AugmentsRow augments={metadata.augments} />
            </div>
          ) : null}

          {metadata.traits?.length ? (
            <div>
              <div style={{ color: '#aaa', fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Traits</div>
              <TraitsRow traits={metadata.traits} />
            </div>
          ) : null}

          <div>
            <div style={{ color: '#aaa', fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Stats</div>
            <StatsGrid metadata={metadata} />
          </div>
        </div>
      )}
    </div>
  );
}

