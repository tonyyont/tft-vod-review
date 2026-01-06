import { useCallback, useEffect, useMemo, useState } from 'react';
import type { VOD, MatchMetadata } from '../types/electron';
import MatchRow, { MatchRowSkeleton } from './MatchRow';
import { deriveVODTitle, reviewSnippet } from '../lib/vodTitle';

interface VODListProps {
  onVODSelect: (vodId: number) => void;
  onSettingsClick: () => void;
}

type PlacementBucket = 'top2' | 'top4' | 'bot4' | 'eighths';

export default function VODList({ onVODSelect, onSettingsClick }: VODListProps) {
  const [vods, setVODs] = useState<VOD[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [matchCache, setMatchCache] = useState<Record<string, MatchMetadata | null | 'loading' | undefined>>({});
  const [unreviewedOnly, setUnreviewedOnly] = useState(true);
  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState<'newest' | 'worstPlacement'>('newest');
  const [placementFilters, setPlacementFilters] = useState<Record<PlacementBucket, boolean>>({
    top2: false,
    top4: false,
    bot4: false,
    eighths: false,
  });

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

  const hasReview = (vod: VOD) => {
    return vod.reviewText && vod.reviewText.trim().length > 0;
  };

  // "Recency" should reflect when the recording finished / last changed on disk.
  // birthtimeMs can be unreliable on macOS when files are copied/moved.
  const recencyTs = useCallback((vod: VOD): number => {
    const m = Number(vod.modifiedAt);
    if (Number.isFinite(m) && m > 0) return m;
    const c = Number(vod.createdAt);
    if (Number.isFinite(c) && c > 0) return c;
    return 0;
  }, []);

  const effectiveMetadata = useCallback((vod: VOD): MatchMetadata | null => {
    if (!vod.matchId) return vod.matchMetadata ?? null;
    const entry = matchCache[vod.matchId];
    if (entry && entry !== 'loading') return entry;
    return vod.matchMetadata ?? null;
  }, [matchCache]);

  const displayTitle = useCallback((vod: VOD): string => {
    const t = String(vod.displayTitle ?? '').trim();
    if (t) return t;
    return deriveVODTitle({ vod, metadata: effectiveMetadata(vod) });
  }, [effectiveMetadata]);

  const bucketMatches = (placement: number, bucket: PlacementBucket): boolean => {
    if (!Number.isFinite(placement) || placement <= 0) return false;
    if (bucket === 'top2') return placement <= 2;
    if (bucket === 'top4') return placement <= 4;
    if (bucket === 'bot4') return placement >= 5;
    return placement >= 7;
  };

  const anyPlacementFilterOn = useMemo(() => {
    return Object.values(placementFilters).some(Boolean);
  }, [placementFilters]);

  const searchLower = useMemo(() => search.trim().toLowerCase(), [search]);

  const matchSearch = useCallback((vod: VOD) => {
    if (!searchLower) return true;
    const md = effectiveMetadata(vod);
    const aug = md?.augments?.join(' ') ?? '';
    const traits = md?.traits?.map((t) => t.name).join(' ') ?? '';
    const snippet = reviewSnippet(vod.reviewText, 220);
    const hay = `${displayTitle(vod)} ${snippet} ${aug} ${traits}`.toLowerCase();
    return hay.includes(searchLower);
  }, [displayTitle, effectiveMetadata, searchLower]);

  const matchPlacementFilter = useCallback((vod: VOD) => {
    if (!anyPlacementFilterOn) return true;
    const md = effectiveMetadata(vod);
    const placement = Number(md?.placement);
    if (!Number.isFinite(placement) || placement <= 0) return false;
    for (const b of Object.keys(placementFilters) as PlacementBucket[]) {
      if (!placementFilters[b]) continue;
      if (bucketMatches(placement, b)) return true;
    }
    return false;
  }, [anyPlacementFilterOn, effectiveMetadata, placementFilters]);

  const sorted = useCallback((list: VOD[]) => {
    const next = [...list];
    if (sortMode === 'newest') {
      next.sort((a, b) => (recencyTs(b) - recencyTs(a)) || (b.id - a.id));
      return next;
    }
    next.sort((a, b) => {
      const pa = Number(effectiveMetadata(a)?.placement);
      const pb = Number(effectiveMetadata(b)?.placement);
      const hasA = Number.isFinite(pa) && pa > 0;
      const hasB = Number.isFinite(pb) && pb > 0;
      if (hasA !== hasB) return hasA ? -1 : 1;
      if (hasA && hasB && pa !== pb) return pb - pa; // worst first
      return (recencyTs(b) - recencyTs(a)) || (b.id - a.id);
    });
    return next;
  }, [effectiveMetadata, recencyTs, sortMode]);

  const upNext = useMemo(() => {
    let list = vods.filter((v) => !unreviewedOnly || !hasReview(v));
    list = list.filter(matchSearch).filter(matchPlacementFilter);
    return sorted(list);
  }, [matchPlacementFilter, matchSearch, sorted, unreviewedOnly, vods]);

  const recentLearnings = useMemo(() => {
    let list = vods.filter(hasReview);
    list = list.filter(matchSearch).filter(matchPlacementFilter);
    list.sort((a, b) => (recencyTs(b) - recencyTs(a)) || (b.id - a.id));
    return list.slice(0, 12);
  }, [matchPlacementFilter, matchSearch, recencyTs, vods]);

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

  const toggleBucket = (bucket: PlacementBucket) => {
    setPlacementFilters((prev) => ({ ...prev, [bucket]: !prev[bucket] }));
  };

  const handleRename = async (vod: VOD) => {
    const current = String(vod.displayTitle ?? '').trim() || displayTitle(vod);
    const input = window.prompt('VOD title (leave empty to clear):', current);
    if (input === null) return;
    const next = input.trim();
    const value = next ? next : null;
    setVODs((prev) => prev.map((v) => (v.id === vod.id ? { ...v, displayTitle: value } : v)));
    await window.electronAPI.setVODTitle(vod.id, value);
  };

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, review, augments, traits…"
            style={{
              width: 340,
              padding: '8px 10px',
              backgroundColor: '#1a1a1a',
              color: '#fff',
              border: '1px solid #444',
              borderRadius: 6,
              fontSize: 13,
            }}
          />
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
      </div>

      {/* VOD List */}
      <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
        {vods.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px', color: '#888' }}>
            <p>No VODs found. Check your folder path in settings.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 18 }}>
            {/* Controls */}
            <div style={{
              padding: '12px 12px',
              borderRadius: 10,
              backgroundColor: '#222',
              border: '1px solid #333',
              display: 'flex',
              flexWrap: 'wrap',
              gap: 10,
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                <button
                  onClick={() => toggleBucket('top2')}
                  style={{
                    padding: '7px 10px',
                    borderRadius: 8,
                    border: '1px solid #333',
                    backgroundColor: placementFilters.top2 ? 'rgba(74,158,255,0.20)' : '#1a1a1a',
                    color: placementFilters.top2 ? '#cfe6ff' : '#ddd',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  Top 2
                </button>
                <button
                  onClick={() => toggleBucket('top4')}
                  style={{
                    padding: '7px 10px',
                    borderRadius: 8,
                    border: '1px solid #333',
                    backgroundColor: placementFilters.top4 ? 'rgba(74,158,255,0.20)' : '#1a1a1a',
                    color: placementFilters.top4 ? '#cfe6ff' : '#ddd',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  Top 4
                </button>
                <button
                  onClick={() => toggleBucket('bot4')}
                  style={{
                    padding: '7px 10px',
                    borderRadius: 8,
                    border: '1px solid #333',
                    backgroundColor: placementFilters.bot4 ? 'rgba(255,204,102,0.16)' : '#1a1a1a',
                    color: placementFilters.bot4 ? '#ffe7b3' : '#ddd',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  Bottom 4
                </button>
                <button
                  onClick={() => toggleBucket('eighths')}
                  style={{
                    padding: '7px 10px',
                    borderRadius: 8,
                    border: '1px solid #333',
                    backgroundColor: placementFilters.eighths ? 'rgba(255,107,107,0.14)' : '#1a1a1a',
                    color: placementFilters.eighths ? '#ffd1d1' : '#ddd',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  7–8
                </button>

                <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#ddd', fontSize: 12 }}>
                  <input
                    type="checkbox"
                    checked={unreviewedOnly}
                    onChange={(e) => setUnreviewedOnly(e.target.checked)}
                  />
                  Unreviewed only
                </label>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <label style={{ color: '#aaa', fontSize: 12 }}>Sort</label>
                <select
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value as any)}
                  style={{
                    padding: '7px 10px',
                    borderRadius: 8,
                    border: '1px solid #333',
                    backgroundColor: '#1a1a1a',
                    color: '#ddd',
                    fontSize: 12,
                  }}
                >
                  <option value="newest">Newest</option>
                  <option value="worstPlacement">Placement (worst first)</option>
                </select>
              </div>
            </div>

            {/* Up next */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                <div style={{ color: '#fff', fontSize: 16, fontWeight: 800 }}>Up next</div>
                <div style={{ color: '#888', fontSize: 12 }}>
                  {upNext.length} shown
                </div>
              </div>
              <div style={{ display: 'grid', gap: 12 }}>
                {upNext.map((vod) => (
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between', marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                          <span style={{
                            fontSize: '18px',
                            color: hasReview(vod) ? '#4a9eff' : '#888',
                            fontWeight: '500'
                          }}>
                            {hasReview(vod) ? '✓' : '○'}
                          </span>
                          <span style={{ color: '#fff', fontSize: '16px', fontWeight: 650, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {displayTitle(vod)}
                          </span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleRename(vod);
                          }}
                          style={{
                            padding: '6px 10px',
                            backgroundColor: '#1a1a1a',
                            color: '#ddd',
                            border: '1px solid #333',
                            borderRadius: 8,
                            cursor: 'pointer',
                            fontSize: 12,
                            flex: '0 0 auto',
                          }}
                        >
                          Rename
                        </button>
                      </div>
                      <div style={{ display: 'flex', gap: '20px', fontSize: '14px', color: '#888', flexWrap: 'wrap' }}>
                        <span>{formatDate(recencyTs(vod))}</span>
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
            </div>

            {/* Recent learnings */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                <div style={{ color: '#fff', fontSize: 16, fontWeight: 800 }}>Recent learnings</div>
                <div style={{ color: '#888', fontSize: 12 }}>
                  {recentLearnings.length} shown
                </div>
              </div>
              <div style={{ display: 'grid', gap: 12 }}>
                {recentLearnings.map((vod) => (
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
                      gap: 10,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#333';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = '#2a2a2a';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                        <span style={{ fontSize: 18, color: '#4a9eff', fontWeight: 600 }}>✓</span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ color: '#fff', fontSize: 15, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {displayTitle(vod)}
                          </div>
                          <div style={{ marginTop: 4, color: '#aaa', fontSize: 12, lineHeight: 1.35 }}>
                            {reviewSnippet(vod.reviewText, 160) || <span style={{ color: '#666' }}>(No snippet)</span>}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleRename(vod);
                        }}
                        style={{
                          padding: '6px 10px',
                          backgroundColor: '#1a1a1a',
                          color: '#ddd',
                          border: '1px solid #333',
                          borderRadius: 8,
                          cursor: 'pointer',
                          fontSize: 12,
                          flex: '0 0 auto',
                        }}
                      >
                        Rename
                      </button>
                    </div>

                    <div style={{ display: 'flex', gap: 18, fontSize: 13, color: '#888', flexWrap: 'wrap' }}>
                      <span>{formatDate(recencyTs(vod))}</span>
                      {(() => {
                        const badge = linkBadge(vod);
                        if (!badge) return null;
                        return <span style={{ color: badge.color }}>{badge.text}</span>;
                      })()}
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
                          return null;
                        })()}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
