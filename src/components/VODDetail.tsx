import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { VOD, MatchMetadata } from '../types/electron';
import MatchRow from './MatchRow';
import { normalizeElectronInvokeError } from '../lib/riot';
import { deriveVODTitle } from '../lib/vodTitle';

interface VODDetailProps {
  vodId: number;
  onBack: () => void;
}

export default function VODDetail({ vodId, onBack }: VODDetailProps) {
  const [vod, setVOD] = useState<VOD | null>(null);
  const [reviewText, setReviewText] = useState('');
  const [matchMetadata, setMatchMetadata] = useState<MatchMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [lastAutosavedAt, setLastAutosavedAt] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkCandidates, setLinkCandidates] = useState<Array<{
    matchId: string;
    matchStartMs: number;
    matchEndMs: number;
    placement: number | null;
    deltaMs: number;
  }>>([]);
  const [linkingAction, setLinkingAction] = useState(false);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const linkActionInFlightRef = useRef(false);

  const reviewTextRef = useRef(reviewText);
  const dirtyRef = useRef(dirty);
  const vodIdRef = useRef(vodId);

  useEffect(() => {
    reviewTextRef.current = reviewText;
  }, [reviewText]);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);
  useEffect(() => {
    vodIdRef.current = vodId;
  }, [vodId]);

  const loadVOD = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) {
      setLoading(true);
    }
    try {
      const s = await window.electronAPI.getSettings();
      setSettings(s);
      const vodData = await window.electronAPI.getVOD(vodId);
      if (vodData) {
        setVOD(vodData);
        const initialReview = vodData.reviewText || '';
        setReviewText(initialReview);
        setDirty(false);
        setSaveError(null);
        setLinkError(null);
        setLastAutosavedAt(null);
        setLinkCandidates([]);

        // Load match metadata if linked
        if (vodData.matchId) {
          try {
            const metadata = await window.electronAPI.getMatchMetadata(vodData.matchId);
            if (metadata) {
              setMatchMetadata(metadata);
            }
          } catch (error) {
            console.error('Error loading match metadata:', error);
          }
        } else if (vodData.matchLinkStatus === 'ambiguous') {
          try {
            const candidates = await window.electronAPI.getVODLinkCandidates(vodData.id);
            setLinkCandidates(candidates);
          } catch (error) {
            console.error('Error loading link candidates:', error);
          }
        }
      }
    } catch (error) {
      console.error('Error loading VOD:', error);
    } finally {
      setLoading(false);
    }
  }, [vodId]);

  useEffect(() => {
    void loadVOD();
  }, [loadVOD]);

  // Keep the detail view in sync with background rescans/auto-link updates.
  useEffect(() => {
    const unsubscribe = window.electronAPI.onVodsUpdated(() => {
      void loadVOD({ silent: true });
    });
    return () => unsubscribe();
  }, [loadVOD]);

  const tacticsRegionSegment = useMemo(() => {
    const r = (settings.riot_region || 'NA').toLowerCase();
    const allowed = new Set(['na', 'euw', 'eune', 'kr', 'oce', 'jp', 'br', 'lan', 'las', 'tr', 'ru']);
    return allowed.has(r) ? r : 'na';
  }, [settings.riot_region]);

  const tacticsPlayerUrl = useMemo(() => {
    const gameName = settings.riot_game_name;
    const tagLine = settings.riot_tag_line;
    if (!gameName || !tagLine) return null;
    return `https://tactics.tools/player/${tacticsRegionSegment}/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
  }, [settings.riot_game_name, settings.riot_tag_line, tacticsRegionSegment]);

  const tacticsMatchUrl = useMemo(() => {
    if (!vod?.matchId) return null;
    if (!tacticsPlayerUrl) return null;
    return `${tacticsPlayerUrl}/${encodeURIComponent(vod.matchId)}`;
  }, [tacticsPlayerUrl, vod?.matchId]);

  const handleSaveReview = useCallback(async (textToSave: string) => {
    if (!vod) return false;
    setSaving(true);
    setSaveError(null);
    try {
      await window.electronAPI.saveReview(vod.id, textToSave);
      setVOD((prev) => (prev ? { ...prev, reviewText: textToSave } : prev));
      setLastAutosavedAt(Date.now());
      setDirty(false);
      return true;
    } catch (error) {
      console.error('Error saving review:', error);
      setSaveError('Autosave failed');
      return false;
    } finally {
      setSaving(false);
    }
  }, [vod]);

  const handleRetryAutoLink = async (opts?: { force?: boolean }) => {
    if (!vod) return;
    if (linkActionInFlightRef.current) return;
    linkActionInFlightRef.current = true;
    setLinkingAction(true);
    setLinkError(null);
    // Optimistic UI: show linking immediately even if IPC dispatch is delayed.
    setVOD((prev) => (prev ? { ...prev, matchLinkStatus: 'linking', matchLinkError: null } : prev));
    try {
      // Start auto-link and immediately refresh to show `linking` state.
      // We intentionally don't await the full auto-link run here since it may take a while under rate limiting.
      void window.electronAPI.autoLinkVOD(vod.id, opts).catch((error) => {
        console.error('Error retrying auto-link:', error);
        setLinkError(normalizeElectronInvokeError(error) || 'Error retrying auto-link. Please try again.');
      });
      await loadVOD({ silent: true });
    } catch (error) {
      console.error('Error retrying auto-link:', error);
      setLinkError(normalizeElectronInvokeError(error) || 'Error retrying auto-link. Please try again.');
    } finally {
      setLinkingAction(false);
      linkActionInFlightRef.current = false;
    }
  };

  const handleSelectCandidate = async (matchId: string) => {
    if (!vod) return;
    setLinkingAction(true);
    setLinkError(null);
    try {
      await window.electronAPI.linkMatch(vod.id, matchId);
      setVOD({ ...vod, matchId });
      const metadata = await window.electronAPI.fetchMatchMetadata(matchId);
      setMatchMetadata(metadata);
      setLinkCandidates([]);
    } catch (error: any) {
      console.error('Error linking candidate match:', error);
      setLinkError(`Error linking match: ${error?.message || 'Unknown error'}`);
    } finally {
      setLinkingAction(false);
    }
  };

  // Auto-save review with debounce
  useEffect(() => {
    if (!vod || saving || !dirty) return;
    const timer = setTimeout(() => {
      void handleSaveReview(reviewText);
    }, 2000);
    return () => clearTimeout(timer);
  }, [reviewText, dirty, saving, vod, handleSaveReview]);

  // Best-effort flush if the component unmounts while still dirty (e.g. fast navigation)
  useEffect(() => {
    return () => {
      if (!dirtyRef.current) return;
      const text = reviewTextRef.current;
      const id = vodIdRef.current;
      void window.electronAPI.saveReview(id, text);
    };
  }, []);

  const statusLabel = useMemo(() => {
    if (saveError) return saveError;
    if (saving) return 'Saving...';
    if (dirty) return 'Unsaved changes';
    if (lastAutosavedAt) return `Autosaved at ${new Date(lastAutosavedAt).toLocaleTimeString()}`;
    return '';
  }, [dirty, lastAutosavedAt, saveError, saving]);

  const statusColor = useMemo(() => {
    if (saveError) return '#ff6b6b';
    if (dirty) return '#ffcc66';
    return '#888';
  }, [dirty, saveError]);

  const handleBackClick = async () => {
    if (!dirty) return onBack();
    const ok = await handleSaveReview(reviewText);
    if (ok) return onBack();
    const leaveAnyway = window.confirm(
      "Couldn't autosave your latest changes. Stay on this page and try again?"
    );
    if (!leaveAnyway) {
      onBack();
    }
  };

  const displayTitle = useMemo(() => {
    if (!vod) return '';
    const t = String(vod.displayTitle ?? '').trim();
    if (t) return t;
    return deriveVODTitle({ vod, metadata: matchMetadata });
  }, [matchMetadata, vod]);

  const handleRename = async () => {
    if (!vod) return;
    const current = String(vod.displayTitle ?? '').trim() || displayTitle;
    const input = window.prompt('VOD title (leave empty to clear):', current);
    if (input === null) return;
    const next = input.trim();
    const value = next ? next : null;
    setVOD((prev) => (prev ? { ...prev, displayTitle: value } : prev));
    await window.electronAPI.setVODTitle(vod.id, value);
  };

  if (!vod) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#ccc' }}>
        {loading ? 'Loading...' : 'No VOD found.'}
      </div>
    );
  }

  // Use custom protocol to serve video files securely
  const videoUrl = `vod://${encodeURIComponent(vod.filePath)}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px',
        borderBottom: '1px solid #333',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#222'
      }}>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: '18px', color: '#fff', marginBottom: '4px' }}>
            {displayTitle}
          </h2>
          <p style={{ color: '#888', fontSize: '12px' }}>
            {new Date(vod.createdAt).toLocaleString()}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            onClick={() => void handleRename()}
            style={{
              padding: '8px 12px',
              backgroundColor: '#1a1a1a',
              color: '#ddd',
              border: '1px solid #333',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            Rename
          </button>
          <button
            onClick={handleBackClick}
            disabled={saving}
            style={{
              padding: '8px 16px',
              backgroundColor: saving ? '#555' : (dirty ? '#6b4f00' : '#444'),
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: saving ? 'not-allowed' : 'pointer'
            }}
          >
            Back to List
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Video Player */}
        <div style={{ flex: '0 0 60%', display: 'flex', flexDirection: 'column', borderRight: '1px solid #333' }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' }}>
            <video
              src={videoUrl}
              controls
              style={{ width: '100%', height: '100%', maxHeight: '100%' }}
            />
          </div>
        </div>

        {/* Sidebar: Match Metadata + Review */}
        <div style={{ flex: '0 0 40%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Match Metadata */}
          <div style={{ padding: '20px', borderBottom: '1px solid #333', backgroundColor: '#222' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ fontSize: '16px', color: '#fff' }}>Match Metadata</h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                {tacticsPlayerUrl && (
                  <button
                    onClick={() => void window.electronAPI.openExternal(tacticsPlayerUrl)}
                    style={{
                      padding: '6px 10px',
                      backgroundColor: '#444',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px',
                    }}
                  >
                    Player on tactics.tools
                  </button>
                )}
                {tacticsMatchUrl && (
                  <button
                    onClick={() => void window.electronAPI.openExternal(tacticsMatchUrl)}
                    style={{
                      padding: '6px 10px',
                      backgroundColor: '#4a9eff',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: 600,
                    }}
                  >
                    Match on tactics.tools
                  </button>
                )}
              </div>
            </div>

            {linkError ? (
              <div style={{ marginBottom: 10, padding: '8px 10px', borderRadius: 6, backgroundColor: 'rgba(255,107,107,0.1)', border: '1px solid rgba(255,107,107,0.35)', color: '#ff6b6b', fontSize: 12 }}>
                {linkError}
              </div>
            ) : null}
            
            {!vod.matchId ? (
              <div>
                {vod.matchLinkStatus === 'linking' && (
                  <p style={{ color: '#ccc', fontSize: '14px' }}>
                    Auto-linking this VOD to a match…
                  </p>
                )}

                {vod.matchLinkStatus === 'ambiguous' && (
                  <div>
                    <p style={{ color: '#ccc', fontSize: '14px', marginBottom: '10px' }}>
                      Multiple matches look possible. Pick one:
                    </p>
                    {linkCandidates.length === 0 ? (
                      <p style={{ color: '#888', fontSize: '13px' }}>
                        Loading candidates…
                      </p>
                    ) : (
                      <div style={{ display: 'grid', gap: '8px' }}>
                        {linkCandidates.map((c) => (
                          <button
                            key={c.matchId}
                            onClick={() => handleSelectCandidate(c.matchId)}
                            disabled={linkingAction}
                            style={{
                              textAlign: 'left',
                              padding: '10px 12px',
                              backgroundColor: '#1a1a1a',
                              color: '#fff',
                              border: '1px solid #333',
                              borderRadius: '6px',
                              cursor: linkingAction ? 'not-allowed' : 'pointer',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
                              <span>
                                {new Date(c.matchStartMs).toLocaleString()}
                              </span>
                              <span style={{ color: '#4a9eff' }}>
                                {c.placement ? `#${c.placement}` : '—'}
                              </span>
                            </div>
                            <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
                              Closest within {Math.round(c.deltaMs / 60_000)} min • {c.matchId.slice(-8)}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {(vod.matchLinkStatus === 'not_found' || !vod.matchLinkStatus) && (
                  <div>
                    <p style={{ color: '#888', fontSize: '14px', marginBottom: '8px' }}>
                      Not linked yet.
                    </p>
                    <button
                      onClick={() => void handleRetryAutoLink()}
                      disabled={linkingAction}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: linkingAction ? '#555' : '#4a9eff',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: linkingAction ? 'not-allowed' : 'pointer',
                        fontSize: '14px',
                      }}
                    >
                      {linkingAction ? 'Retrying…' : 'Retry Auto-Link'}
                    </button>
                  </div>
                )}

                {vod.matchLinkStatus === 'error' && (
                  <div>
                    <p style={{ color: '#ff6b6b', fontSize: '13px', marginBottom: '8px' }}>
                      Auto-link error: {vod.matchLinkError || 'Unknown error'}
                    </p>
                    <button
                      onClick={() => void handleRetryAutoLink()}
                      disabled={linkingAction}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: linkingAction ? '#555' : '#4a9eff',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: linkingAction ? 'not-allowed' : 'pointer',
                        fontSize: '14px',
                      }}
                    >
                      {linkingAction ? 'Retrying…' : 'Retry Auto-Link'}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div>
                {matchMetadata ? (
                  <div>
                    <div style={{ marginBottom: '10px', color: '#888', fontSize: '12px' }}>
                      Match: {matchMetadata.matchId.slice(-8)} • Updated{' '}
                      {new Date(matchMetadata.fetchedAt).toLocaleString()}
                    </div>
                    <MatchRow metadata={matchMetadata} variant="full" />
                  </div>
                ) : (
                  <p style={{ color: '#888', fontSize: '14px' }}>
                    Linked to match: {vod.matchId.slice(-8)}<br />
                    <span style={{ fontSize: '12px' }}>Metadata not available</span>
                  </p>
                )}

                <div style={{ marginTop: '12px' }}>
                  <button
                    onClick={() => void handleRetryAutoLink({ force: true })}
                    disabled={linkingAction}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: linkingAction ? '#555' : '#444',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: linkingAction ? 'not-allowed' : 'pointer',
                      fontSize: '14px',
                    }}
                  >
                    {linkingAction ? 'Relinking…' : 'Relink (force)'}
                  </button>
                  <p style={{ marginTop: '6px', color: '#888', fontSize: '12px' }}>
                    If the match looks wrong, this will clear the link and re-run auto-linking using start-time matching.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Review Field */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ fontSize: '16px', color: '#fff' }}>Review</h3>
              {!!statusLabel && (
                <span style={{ fontSize: '12px', color: statusColor }}>{statusLabel}</span>
              )}
            </div>
            <textarea
              value={reviewText}
              onChange={(e) => {
                setReviewText(e.target.value);
                setDirty(true);
                setSaveError(null);
              }}
              placeholder="Write your review here... What went wrong? What to focus on next time? One thing to improve?"
              style={{
                flex: 1,
                padding: '12px',
                backgroundColor: '#1a1a1a',
                color: '#fff',
                border: '1px solid #444',
                borderRadius: '4px',
                fontSize: '14px',
                fontFamily: 'inherit',
                resize: 'none',
                minHeight: '200px'
              }}
            />
            <p style={{ marginTop: '8px', fontSize: '12px', color: '#888' }}>
              Review auto-saves as you type (about 2s after you stop typing)
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
