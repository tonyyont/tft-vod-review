import { useState } from 'react';

interface SetupWizardProps {
  onComplete: () => void;
}

export default function SetupWizard({ onComplete }: SetupWizardProps) {
  const [folderPath, setFolderPath] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [step, setStep] = useState(1);

  const handleSelectFolder = async () => {
    const path = await window.electronAPI.selectFolder();
    if (path) {
      setFolderPath(path);
    }
  };

  const handleNext = async () => {
    if (step === 1 && folderPath) {
      await window.electronAPI.setSetting('obs_folder_path', folderPath);
      await window.electronAPI.scanVODs(folderPath);
      setStep(2);
    } else if (step === 2) {
      if (apiKey) {
        await window.electronAPI.setSetting('riot_api_key', apiKey);
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
              (Optional) Enter your Riot API key to fetch match metadata. You can skip this and add it later in settings.
            </p>
            <div style={{ marginBottom: '20px' }}>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Riot API Key (optional)"
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
