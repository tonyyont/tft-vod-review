import { useState, useEffect } from 'react';
import { REGIONS, type RiotRegion, canTestRiot, normalizeElectronInvokeError, persistRiotSettings, testAndPersistPuuid } from '../lib/riot';

interface SettingsProps {
  settings: Record<string, string>;
  onBack: () => void;
  onSettingsChange: () => void;
}

export default function Settings({ settings, onBack, onSettingsChange }: SettingsProps) {
  const [folderPath, setFolderPath] = useState(settings.obs_folder_path || '');
  const [apiKey, setApiKey] = useState(settings.riot_api_key || '');
  const [riotRegion, setRiotRegion] = useState<RiotRegion>((settings.riot_region as RiotRegion) || 'NA');
  const [gameName, setGameName] = useState(settings.riot_game_name || '');
  const [tagLine, setTagLine] = useState(settings.riot_tag_line || '');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  useEffect(() => {
    setFolderPath(settings.obs_folder_path || '');
    setApiKey(settings.riot_api_key || '');
    setRiotRegion((settings.riot_region as RiotRegion) || 'NA');
    setGameName(settings.riot_game_name || '');
    setTagLine(settings.riot_tag_line || '');
  }, [settings]);

  const handleSelectFolder = async () => {
    const path = await window.electronAPI.selectFolder();
    if (path) {
      setFolderPath(path);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setTestError(null);
    setInfoMessage(null);
    try {
      await window.electronAPI.setSetting('obs_folder_path', folderPath);
      await persistRiotSettings({ region: riotRegion, apiKey, gameName, tagLine });

      // If Riot fields are present, validate and save puuid
      const canTest = canTestRiot({ region: riotRegion, apiKey, gameName, tagLine });
      if (canTest) {
        setTesting(true);
        await testAndPersistPuuid({ region: riotRegion, apiKey, gameName, tagLine });
      }
      
      // Rescan VODs if folder changed
      if (folderPath) {
        await window.electronAPI.scanVODs(folderPath);
      }
      
      onSettingsChange();
    } catch (error) {
      console.error('Error saving settings:', error);
      const msg = normalizeElectronInvokeError(error) || 'Error saving settings. Please try again.';
      setTestError(msg);
    } finally {
      setSaving(false);
      setTesting(false);
    }
  };

  const handleRelinkAll = async () => {
    setTestError(null);
    setInfoMessage(null);
    try {
      await window.electronAPI.autoLinkAll();
      setInfoMessage('Started auto-linking matches in the background.');
    } catch (e) {
      console.error('Error starting auto-link:', e);
      setTestError(normalizeElectronInvokeError(e) || 'Error starting auto-link. Please try again.');
    }
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
        <h1 style={{ fontSize: '24px', color: '#fff' }}>Settings</h1>
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
          Back
        </button>
      </div>

      {/* Settings Form */}
      <div style={{ flex: 1, padding: '40px', maxWidth: '600px', margin: '0 auto', width: '100%' }}>
        <div style={{ marginBottom: '30px' }}>
          <label style={{ display: 'block', marginBottom: '8px', color: '#fff', fontSize: '16px', fontWeight: '500' }}>
            OBS Recording Folder
          </label>
          <p style={{ marginBottom: '12px', color: '#888', fontSize: '14px' }}>
            Select the folder where OBS saves your recordings. The app will scan for MP4 files.
          </p>
          <div style={{ display: 'flex', gap: '10px', marginBottom: '8px' }}>
            <input
              type="text"
              value={folderPath}
              readOnly
              style={{
                flex: 1,
                padding: '10px',
                backgroundColor: '#1a1a1a',
                color: '#ccc',
                border: '1px solid #444',
                borderRadius: '4px',
                fontSize: '14px'
              }}
            />
            <button
              onClick={handleSelectFolder}
              style={{
                padding: '10px 20px',
                backgroundColor: '#4a9eff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              Browse
            </button>
          </div>
        </div>

        <div style={{ marginBottom: '30px' }}>
          <label style={{ display: 'block', marginBottom: '8px', color: '#fff', fontSize: '16px', fontWeight: '500' }}>
            Riot Account (Optional)
          </label>
          <p style={{ marginBottom: '12px', color: '#888', fontSize: '14px' }}>
            Connect your Riot account to auto-link VODs to matches. Your Riot API key is needed. Get one from{' '}
            <a
              href="https://developer.riotgames.com/"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#4a9eff' }}
            >
              developer.riotgames.com
            </a>
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
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
            <input
              type="text"
              value={gameName}
              onChange={(e) => setGameName(e.target.value)}
              placeholder="Game name"
              style={{
                width: '100%',
                padding: '10px',
                backgroundColor: '#1a1a1a',
                color: '#fff',
                border: '1px solid #444',
                borderRadius: '4px',
                fontSize: '14px',
              }}
            />
          </div>
          <input
            type="text"
            value={tagLine}
            onChange={(e) => setTagLine(e.target.value)}
            placeholder="Tagline"
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
            placeholder="RGAPI-..."
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
          {testError ? (
            <p style={{ marginTop: '8px', color: '#ff6b6b', fontSize: '12px' }}>{testError}</p>
          ) : infoMessage ? (
            <p style={{ marginTop: '8px', color: '#7bd88f', fontSize: '12px' }}>{infoMessage}</p>
          ) : null}
        </div>

        <div style={{ marginBottom: '24px', display: 'flex', gap: '10px' }}>
          <button
            onClick={handleRelinkAll}
            disabled={saving || testing}
            style={{
              padding: '10px 18px',
              backgroundColor: (saving || testing) ? '#555' : '#444',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: (saving || testing) ? 'not-allowed' : 'pointer',
              fontSize: '14px',
            }}
          >
            Relink Unlinked VODs
          </button>
          <div style={{ color: '#888', fontSize: '12px', lineHeight: 1.3, alignSelf: 'center' }}>
            Runs in the background and updates the list automatically.
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={!folderPath || saving}
          style={{
            padding: '12px 30px',
            backgroundColor: (!folderPath || saving) ? '#555' : '#4a9eff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: (!folderPath || saving) ? 'not-allowed' : 'pointer',
            fontSize: '16px',
            fontWeight: '500'
          }}
        >
          {(saving || testing) ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}
