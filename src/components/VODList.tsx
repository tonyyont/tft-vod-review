import { useCallback, useEffect, useState } from 'react';
import type { VOD, MatchMetadata } from '../types/electron';
import MatchRow, { MatchRowSkeleton } from './MatchRow';

interface VODListProps {
  onVODSelect: (vodId: number) => void;
  onSettingsClick: () => void;
}

export default function VODList({ onVODSelect, onSettingsClick }: VODListProps) {
  const [vods, setVODs] = useState<VOD[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [matchCache, setMatchCache] = useState<Record<string, MatchMetadata | null | 'loading' | undefined>>({});

  useEffect(() => {
    let isMounted = true;
    void loadVODs({ initial: true });

    let refreshTimer: number | null = null;
    const scheduleRefresh = () => {
      if (refreshTimer) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        if (!isMounted) return;
        void loadVODs({ initial: false });
      }, 250);
    };

    const unsubscribe = window.electronAPI.onVodsUpdated(() => {
      if (isMounted) scheduleRefresh();
    });

    const onFocus = () => {
      if (isMounted) scheduleRefresh();
    };
    window.addEventListener('focus', onFocus);

    return () => {
      isMounted = false;
      if (refreshTimer) window.clearTimeout(refreshTimer);
      unsubscribe?.();
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  useEffect(() => {
    // Seed matchCache from DB-provided matchMetadata so the list renders instantly (same as detail view behavior).
    const next: Record<string, MatchMetadata> = {};
    for (const v of vods) {
      if (!v.matchId) continue;
      if (!v.matchMetadata) continue;
      next[v.matchId] = v.matchMetadata;
    }
    if (Object.keys(next).length) {
      setMatchCache((prev) => ({ ...next, ...prev }));
    }
  }, [vods]);

  const loadVODs = async (opts: { initial: boolean }) => {
    if (opts.initial) setInitialLoading(true);
    else setRefreshing(true);
    try {
      const vodList = await window.electronAPI.getVODs();
      setVODs(vodList);
    } catch (error) {
      console.error('Error loading VODs:', error);
    } finally {
      if (opts.initial) setInitialLoading(false);
      else setRefreshing(false);
    }
  };

  const ensureMatch = useCallback((matchId: string) => {
    if (!matchId) return;
    let shouldFetch = false;
    setMatchCache((prev) => {
      if (prev[matchId] !== undefined) return prev;
      shouldFetch = true;
      return { ...prev, [matchId]: 'loading' };
    });
    if (!shouldFetch) return;

    void (async () => {
      try {
        // fetchMatchMetadata is cache-aware (returns cached immediately if present)
        const md = await window.electronAPI.fetchMatchMetadata(matchId);
        setMatchCache((prev) => ({ ...prev, [matchId]: md }));
      } catch {
        setMatchCache((prev) => ({ ...prev, [matchId]: null }));
      }
    })();
  }, []);

  useEffect(() => {
    // Eagerly fetch for the first screenful so icons show without hover.
    // Keep this conservative to avoid spamming Riot on huge lists.
    const matchIds: string[] = [];
    for (const v of vods) {
      if (!v.matchId) continue;
      matchIds.push(v.matchId);
      if (matchIds.length >= 12) break;
    }
    for (const id of matchIds) ensureMatch(id);
  }, [ensureMatch, vods]);

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  };

  const hasReview = (vod: VOD) => {
    return vod.reviewText && vod.reviewText.trim().length > 0;
  };

  const linkBadge = (vod: VOD) => {
    if (vod.matchId) return { text: `Match: ${vod.matchId.slice(-8)}`, color: '#4a9eff' };
    if (vod.matchLinkStatus === 'linking') return { text: 'Linking…', color: '#ffcc66' };
    if (vod.matchLinkStatus === 'ambiguous') return { text: 'Needs selection', color: '#ffcc66' };
    if (vod.matchLinkStatus === 'error') return { text: 'Link error', color: '#ff6b6b' };
    return null;
  };

  const reviewedCount = vods.filter(hasReview).length;
  const totalCount = vods.length;

  if (initialLoading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#ccc' }}>
        Loading VODs...
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Header */}
      <div style={{
        padding: '20px',
        borderBottom: '1px solid #333',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#222'
      }}>
        <div>
          <h1 style={{ fontSize: '24px', marginBottom: '5px', color: '#fff' }}>
            TFT VOD Review
          </h1>
          <p style={{ color: '#888', fontSize: '14px' }}>
            {totalCount} VODs • {reviewedCount} reviewed ({totalCount > 0 ? Math.round((reviewedCount / totalCount) * 100) : 0}%)
            {refreshing ? <span style={{ marginLeft: 10, color: '#666' }}>Refreshing…</span> : null}
          </p>
        </div>
        <button
          onClick={onSettingsClick}
          style={{
            padding: '8px 16px',
            backgroundColor: '#444',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Settings
        </button>
      </div>

      {/* VOD List */}
      <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
        {vods.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px', color: '#888' }}>
            <p>No VODs found. Check your folder path in settings.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '12px' }}>
            {vods.map((vod) => (
              <div
                key={vod.id}
                onClick={() => onVODSelect(vod.id)}
                style={{
                  padding: '16px',
                  backgroundColor: '#2a2a2a',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  border: '1px solid #333',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#333';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#2a2a2a';
                }}
              >
                <div style={{ flex: 1, width: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                    <span style={{
                      fontSize: '18px',
                      color: hasReview(vod) ? '#4a9eff' : '#888',
                      fontWeight: '500'
                    }}>
                      {hasReview(vod) ? '✓' : '○'}
                    </span>
                    <span style={{ color: '#fff', fontSize: '16px' }}>
                      {vod.fileName}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '20px', fontSize: '14px', color: '#888', flexWrap: 'wrap' }}>
                    <span>{formatDate(vod.createdAt)}</span>
                    <span>{formatFileSize(vod.fileSize)}</span>
                    {(() => {
                      const badge = linkBadge(vod);
                      if (!badge) return null;
                      return <span style={{ color: badge.color }}>{badge.text}</span>;
                    })()}
                  </div>
                </div>

                {!!vod.matchId && (
                  <div style={{ width: '100%' }} onMouseEnter={() => ensureMatch(vod.matchId!)}>
                    {(() => {
                      const entry = matchCache[vod.matchId!];
                      const fallback = vod.matchMetadata ?? undefined;
                      const effective = entry && entry !== 'loading' ? entry : fallback;
                      if (effective) return <MatchRow metadata={effective} variant="compact" />;
                      if (entry === 'loading') return <MatchRowSkeleton compact />;
                      if (entry === undefined) return <MatchRowSkeleton compact />;
                      return (
                        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #333', color: '#888', fontSize: 12 }}>
                          Match metadata unavailable
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
