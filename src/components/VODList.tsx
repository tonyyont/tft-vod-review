import { useState, useEffect } from 'react';
import type { VOD } from '../types/electron';

interface VODListProps {
  onVODSelect: (vodId: number) => void;
  onSettingsClick: () => void;
}

export default function VODList({ onVODSelect, onSettingsClick }: VODListProps) {
  const [vods, setVODs] = useState<VOD[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    loadVODs();

    const unsubscribe = window.electronAPI.onVodsUpdated(() => {
      if (isMounted) loadVODs();
    });

    const onFocus = () => {
      if (isMounted) loadVODs();
    };
    window.addEventListener('focus', onFocus);

    return () => {
      isMounted = false;
      unsubscribe?.();
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  const loadVODs = async () => {
    setLoading(true);
    try {
      const vodList = await window.electronAPI.getVODs();
      setVODs(vodList);
    } catch (error) {
      console.error('Error loading VODs:', error);
    } finally {
      setLoading(false);
    }
  };

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

  if (loading) {
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
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#333';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#2a2a2a';
                }}
              >
                <div style={{ flex: 1 }}>
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
                  <div style={{ display: 'flex', gap: '20px', fontSize: '14px', color: '#888' }}>
                    <span>{formatDate(vod.createdAt)}</span>
                    <span>{formatFileSize(vod.fileSize)}</span>
                    {(() => {
                      const badge = linkBadge(vod);
                      if (!badge) return null;
                      return <span style={{ color: badge.color }}>{badge.text}</span>;
                    })()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
