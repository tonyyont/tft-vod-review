import { useState } from 'react';

interface SetupWizardProps {
  onComplete: () => void;
}

const REGIONS = ['NA', 'EUW', 'EUNE', 'KR', 'OCE', 'JP', 'BR', 'LAN', 'LAS', 'TR', 'RU'] as const;

export default function SetupWizard({ onComplete }: SetupWizardProps) {
  const [folderPath, setFolderPath] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [riotRegion, setRiotRegion] = useState<(typeof REGIONS)[number]>('NA');
  const [gameName, setGameName] = useState('');
  const [tagLine, setTagLine] = useState('');
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [step, setStep] = useState(1);

  const handleSelectFolder = async () => {
    const path = await window.electronAPI.selectFolder();
    if (path) {
      setFolderPath(path);
    }
  };

  const canTest = !!apiKey.trim() && !!gameName.trim() && !!tagLine.trim();

  const handleTestConnection = async () => {
    if (!canTest) return;
    setTesting(true);
    setTestError(null);
    try {
      const res = await window.electronAPI.testRiotConnection({
        region: riotRegion,
        gameName: gameName.trim(),
        tagLine: tagLine.trim(),
        apiKey: apiKey.trim(),
      });
      await window.electronAPI.setSetting('riot_api_key', apiKey.trim());
      await window.electronAPI.setSetting('riot_region', riotRegion);
      await window.electronAPI.setSetting('riot_game_name', gameName.trim());
      await window.electronAPI.setSetting('riot_tag_line', tagLine.trim());
      await window.electronAPI.setSetting('riot_puuid', res.puuid);
      await window.electronAPI.autoLinkAll();
      alert('Riot account connected!');
    } catch (e: any) {
      const msg = (e?.message || 'Failed to connect to Riot').replace(
        /^Error invoking remote method '.*?': Error: /,
        ''
      );
      setTestError(msg);
    } finally {
      setTesting(false);
    }
  };

  const handleNext = async () => {
    if (step === 1 && folderPath) {
      await window.electronAPI.setSetting('obs_folder_path', folderPath);
      await window.electronAPI.scanVODs(folderPath);
      setStep(2);
    } else if (step === 2) {
      if (apiKey.trim()) {
        await window.electronAPI.setSetting('riot_api_key', apiKey.trim());
      }
      // If user filled Riot ID info, attempt to connect (best-effort)
      if (canTest) {
        try {
          const res = await window.electronAPI.testRiotConnection({
            region: riotRegion,
            gameName: gameName.trim(),
            tagLine: tagLine.trim(),
            apiKey: apiKey.trim(),
          });
          await window.electronAPI.setSetting('riot_region', riotRegion);
          await window.electronAPI.setSetting('riot_game_name', gameName.trim());
          await window.electronAPI.setSetting('riot_tag_line', tagLine.trim());
          await window.electronAPI.setSetting('riot_puuid', res.puuid);
          await window.electronAPI.autoLinkAll();
        } catch {
          // Don't block setup completion
        }
      }
      onComplete();
    }
  };

  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      height: '100vh',
      backgroundColor: '#1a1a1a'
    }}>
      <div style={{ 
        maxWidth: '500px', 
        padding: '40px',
        backgroundColor: '#2a2a2a',
        borderRadius: '8px',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)'
      }}>
        <h1 style={{ marginBottom: '30px', color: '#fff' }}>Welcome to TFT VOD Review</h1>
        
        {step === 1 && (
          <div>
            <p style={{ marginBottom: '20px', color: '#ccc' }}>
              First, select your OBS recording folder. The app will scan for MP4 files.
            </p>
            <div style={{ marginBottom: '20px' }}>
              <button
                onClick={handleSelectFolder}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#4a9eff',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '16px',
                  marginRight: '10px'
                }}
              >
                Select Folder
              </button>
              {folderPath && (
                <span style={{ color: '#4a9eff', fontSize: '14px' }}>
                  {folderPath}
                </span>
              )}
            </div>
            <button
              onClick={handleNext}
              disabled={!folderPath}
              style={{
                padding: '10px 30px',
                backgroundColor: folderPath ? '#4a9eff' : '#555',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: folderPath ? 'pointer' : 'not-allowed',
                fontSize: '16px'
              }}
            >
              Next
            </button>
          </div>
        )}

        {step === 2 && (
          <div>
            <p style={{ marginBottom: '20px', color: '#ccc' }}>
              (Optional) Connect your Riot account to auto-link VODs to matches. You can skip this and add it later in settings.
            </p>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', marginBottom: '6px', color: '#fff', fontSize: '13px' }}>
                Region
              </label>
              <select
                value={riotRegion}
                onChange={(e) => setRiotRegion(e.target.value as any)}
                style={{
                  width: '100%',
                  padding: '10px',
                  backgroundColor: '#1a1a1a',
                  color: '#fff',
                  border: '1px solid #444',
                  borderRadius: '4px',
                  fontSize: '14px',
                }}
              >
                {REGIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ marginBottom: '20px' }}>
              <input
                type="text"
                value={gameName}
                onChange={(e) => setGameName(e.target.value)}
                placeholder="Riot ID game name (e.g. tonysheng)"
                style={{
                  width: '100%',
                  padding: '10px',
                  backgroundColor: '#1a1a1a',
                  color: '#fff',
                  border: '1px solid #444',
                  borderRadius: '4px',
                  fontSize: '14px',
                  marginBottom: '10px',
                }}
              />
              <input
                type="text"
                value={tagLine}
                onChange={(e) => setTagLine(e.target.value)}
                placeholder="Tagline (e.g. NA1)"
                style={{
                  width: '100%',
                  padding: '10px',
                  backgroundColor: '#1a1a1a',
                  color: '#fff',
                  border: '1px solid #444',
                  borderRadius: '4px',
                  fontSize: '14px',
                  marginBottom: '10px',
                }}
              />
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Riot API Key (RGAPI-...)"
                style={{
                  width: '100%',
                  padding: '10px',
                  backgroundColor: '#1a1a1a',
                  color: '#fff',
                  border: '1px solid #444',
                  borderRadius: '4px',
                  fontSize: '14px'
                }}
              />
              {testError && (
                <p style={{ marginTop: '8px', color: '#ff6b6b', fontSize: '12px' }}>
                  {testError}
                </p>
              )}
            </div>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
              <button
                onClick={handleTestConnection}
                disabled={!canTest || testing}
                style={{
                  padding: '10px 16px',
                  backgroundColor: (!canTest || testing) ? '#555' : '#444',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: (!canTest || testing) ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                }}
              >
                {testing ? 'Testing...' : 'Test Connection'}
              </button>
              <div style={{ color: '#888', fontSize: '12px', lineHeight: 1.3 }}>
                If you don’t connect now, VODs will still import — they just won’t auto-link to matches.
              </div>
            </div>
            <button
              onClick={handleNext}
              style={{
                padding: '10px 30px',
                backgroundColor: '#4a9eff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '16px'
              }}
            >
              Get Started
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
