import { useState, useEffect } from 'react';
import type { VOD, MatchMetadata } from '../types/electron';

interface VODDetailProps {
  vodId: number;
  onBack: () => void;
}

export default function VODDetail({ vodId, onBack }: VODDetailProps) {
  const [vod, setVOD] = useState<VOD | null>(null);
  const [reviewText, setReviewText] = useState('');
  const [matchMetadata, setMatchMetadata] = useState<MatchMetadata | null>(null);
  const [matchIdInput, setMatchIdInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadVOD();
  }, [vodId]);

  const loadVOD = async () => {
    setLoading(true);
    try {
      const vodData = await window.electronAPI.getVOD(vodId);
      if (vodData) {
        setVOD(vodData);
        setReviewText(vodData.reviewText || '');
        setMatchIdInput(vodData.matchId || '');

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
        }
      }
    } catch (error) {
      console.error('Error loading VOD:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveReview = async () => {
    if (!vod) return;
    setSaving(true);
    try {
      await window.electronAPI.saveReview(vod.id, reviewText);
    } catch (error) {
      console.error('Error saving review:', error);
      alert('Error saving review. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleLinkMatch = async () => {
    if (!vod || !matchIdInput.trim()) return;
    try {
      await window.electronAPI.linkMatch(vod.id, matchIdInput.trim());
      setVOD({ ...vod, matchId: matchIdInput.trim() });

      // Fetch metadata
      try {
        const metadata = await window.electronAPI.fetchMatchMetadata(matchIdInput.trim());
        setMatchMetadata(metadata);
      } catch (error: any) {
        alert(`Error fetching match metadata: ${error.message}`);
      }
    } catch (error) {
      console.error('Error linking match:', error);
      alert('Error linking match. Please try again.');
    }
  };

  // Auto-save review with debounce
  useEffect(() => {
    if (!vod || saving) return;
    const timer = setTimeout(() => {
      handleSaveReview();
    }, 2000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewText]);

  if (loading || !vod) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#ccc' }}>
        Loading...
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
            {vod.fileName}
          </h2>
          <p style={{ color: '#888', fontSize: '12px' }}>
            {new Date(vod.createdAt).toLocaleString()}
          </p>
        </div>
        <button
          onClick={onBack}
          style={{
            padding: '8px 16px',
            backgroundColor: '#444',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Back to List
        </button>
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
            <h3 style={{ fontSize: '16px', color: '#fff', marginBottom: '12px' }}>Match Metadata</h3>
            
            {!vod.matchId ? (
              <div>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <input
                    type="text"
                    value={matchIdInput}
                    onChange={(e) => setMatchIdInput(e.target.value)}
                    placeholder="Enter match ID"
                    style={{
                      flex: 1,
                      padding: '8px',
                      backgroundColor: '#1a1a1a',
                      color: '#fff',
                      border: '1px solid #444',
                      borderRadius: '4px',
                      fontSize: '14px'
                    }}
                  />
                  <button
                    onClick={handleLinkMatch}
                    disabled={!matchIdInput.trim()}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: matchIdInput.trim() ? '#4a9eff' : '#555',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: matchIdInput.trim() ? 'pointer' : 'not-allowed',
                      fontSize: '14px'
                    }}
                  >
                    Link
                  </button>
                </div>
                <p style={{ fontSize: '12px', color: '#888' }}>
                  Link this VOD to a TFT match to see placement, augments, traits, and final board.
                </p>
              </div>
            ) : (
              <div>
                {matchMetadata ? (
                  <div>
                    <div style={{ marginBottom: '12px' }}>
                      <strong style={{ color: '#4a9eff' }}>Placement: </strong>
                      <span style={{ color: '#fff', fontSize: '18px', fontWeight: 'bold' }}>
                        #{matchMetadata.placement}
                      </span>
                    </div>
                    
                    {matchMetadata.augments.length > 0 && (
                      <div style={{ marginBottom: '12px' }}>
                        <strong style={{ color: '#ccc' }}>Augments: </strong>
                        <div style={{ marginTop: '4px' }}>
                          {matchMetadata.augments.map((augment, idx) => (
                            <div key={idx} style={{ color: '#fff', fontSize: '13px' }}>
                              • {augment}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {matchMetadata.traits.length > 0 && (
                      <div style={{ marginBottom: '12px' }}>
                        <strong style={{ color: '#ccc' }}>Traits: </strong>
                        <div style={{ marginTop: '4px' }}>
                          {matchMetadata.traits.map((trait, idx) => (
                            <div key={idx} style={{ color: '#fff', fontSize: '13px' }}>
                              • {trait.name} ({trait.numUnits})
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <p style={{ color: '#888', fontSize: '14px' }}>
                    Linked to match: {vod.matchId.slice(-8)}<br />
                    <span style={{ fontSize: '12px' }}>Metadata not available</span>
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Review Field */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ fontSize: '16px', color: '#fff' }}>Review</h3>
              {saving && (
                <span style={{ fontSize: '12px', color: '#888' }}>Saving...</span>
              )}
            </div>
            <textarea
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
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
              Review auto-saves as you type
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
