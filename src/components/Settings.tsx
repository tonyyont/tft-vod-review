import { useState, useEffect } from 'react';

interface SettingsProps {
  settings: Record<string, string>;
  onBack: () => void;
  onSettingsChange: () => void;
}

export default function Settings({ settings, onBack, onSettingsChange }: SettingsProps) {
  const [folderPath, setFolderPath] = useState(settings.obs_folder_path || '');
  const [apiKey, setApiKey] = useState(settings.riot_api_key || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setFolderPath(settings.obs_folder_path || '');
    setApiKey(settings.riot_api_key || '');
  }, [settings]);

  const handleSelectFolder = async () => {
    const path = await window.electronAPI.selectFolder();
    if (path) {
      setFolderPath(path);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await window.electronAPI.setSetting('obs_folder_path', folderPath);
      if (apiKey) {
        await window.electronAPI.setSetting('riot_api_key', apiKey);
      }
      
      // Rescan VODs if folder changed
      if (folderPath) {
        await window.electronAPI.scanVODs(folderPath);
      }
      
      onSettingsChange();
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('Error saving settings. Please try again.');
    } finally {
      setSaving(false);
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
            Riot API Key (Optional)
          </label>
          <p style={{ marginBottom: '12px', color: '#888', fontSize: '14px' }}>
            Your Riot API key is needed to fetch match metadata. Get one from{' '}
            <a
              href="https://developer.riotgames.com/"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#4a9eff' }}
            >
              developer.riotgames.com
            </a>
          </p>
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
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}
