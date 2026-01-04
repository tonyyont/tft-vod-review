import { useState, useEffect } from 'react';
import VODList from './components/VODList';
import VODDetail from './components/VODDetail';
import Settings from './components/Settings';
import SetupWizard from './components/SetupWizard';
import type { VOD } from './types/electron';

type View = 'setup' | 'list' | 'detail' | 'settings';

function App() {
  const [currentView, setCurrentView] = useState<View>('setup');
  const [selectedVODId, setSelectedVODId] = useState<number | null>(null);
  const [settings, setSettings] = useState<Record<string, string>>({});

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const loadedSettings = await window.electronAPI.getSettings();
    setSettings(loadedSettings);
    
    // If folder path is set, go to list view, otherwise show setup
    if (loadedSettings.obs_folder_path) {
      setCurrentView('list');
    } else {
      setCurrentView('setup');
    }
  };

  const handleVODSelect = (vodId: number) => {
    setSelectedVODId(vodId);
    setCurrentView('detail');
  };

  const handleBackToList = () => {
    setCurrentView('list');
    setSelectedVODId(null);
  };

  const handleSetupComplete = () => {
    loadSettings();
    setCurrentView('list');
  };

  if (currentView === 'setup') {
    return <SetupWizard onComplete={handleSetupComplete} />;
  }

  if (currentView === 'settings') {
    return (
      <Settings
        settings={settings}
        onBack={() => setCurrentView('list')}
        onSettingsChange={loadSettings}
      />
    );
  }

  if (currentView === 'detail' && selectedVODId !== null) {
    return (
      <VODDetail
        vodId={selectedVODId}
        onBack={handleBackToList}
      />
    );
  }

  return (
    <VODList
      onVODSelect={handleVODSelect}
      onSettingsClick={() => setCurrentView('settings')}
    />
  );
}

export default App;
