import React from 'react';
import './Options.css';
import { MainLayout } from '../../shared/components/layout/MainLayout';
import { useUIStore } from '../../shared/store/useUIStore';
import { useSettingsStore } from '../../shared/store/useSettingsStore';
import { FeedView } from '../../features/feed/FeedView';
import { MediaLightbox } from '../../shared/components/MediaLightbox';
import { useColorTheme } from '../../shared/hooks/useColorTheme';
import { isSafariIOS } from '../../shared/utils/platform';
import '../../shared/styles/mobile.css';

const IntelligenceView = React.lazy(() => import('../../features/intelligence/IntelligenceView').then(m => ({ default: m.IntelligenceView })));
const SettingsView = React.lazy(() => import('../../features/settings/SettingsView').then(m => ({ default: m.SettingsView })));
const StatsView = React.lazy(() => import('../../features/stats/StatsView').then(m => ({ default: m.StatsView })));
const AnalyticsView = React.lazy(() => import('../../features/analytics/AnalyticsView').then(m => ({ default: m.AnalyticsView })));
const GalleryView = React.lazy(() => import('../../features/gallery/GalleryView').then(m => ({ default: m.GalleryView })));
const ConnectionsView = React.lazy(() => import('../../features/connections/ConnectionsView'));
const SimulationView = React.lazy(() => import('../../features/simulation/SimulationView').then(m => ({ default: m.SimulationView })));

const Options: React.FC = () => {
  useColorTheme();
  const { activeView } = useUIStore();
  const settings = useSettingsStore(s => s.settings);
  React.useEffect(() => {
    if (!isSafariIOS) return;
    document.documentElement.dataset.platform = 'safari-ios';
    const resume = () => {
      if (!document.hidden) chrome.runtime.sendMessage({ type: 'RESUME_QUEUES' }).catch(console.error);
    };
    resume();
    document.addEventListener('visibilitychange', resume);
    return () => document.removeEventListener('visibilitychange', resume);
  }, []);

  React.useEffect(() => {
    if (settings.themeFont) {
      document.body.style.setProperty('font-family', `"${settings.themeFont}", "ZCOOL XiaoWei", sans-serif`, 'important');
    }
  }, [settings.themeFont]);

  const renderView = () => {
    switch (activeView) {
      case 'feed':
        return <FeedView />;
      case 'intelligence':
        return <IntelligenceView />;
      case 'connections':
        return <ConnectionsView key={settings.themeMode} />;
      case 'simulation':
        return <SimulationView />;
      case 'gallery':
        return <GalleryView />;
      case 'analytics':
        return <AnalyticsView />;
      case 'stats':
        return <StatsView />;
      case 'settings':
        return <SettingsView />;
      default:
        return <FeedView />;
    }
  };

  return (
    <MainLayout>
      <React.Suspense fallback={<div className="flex flex-1 items-center justify-center p-8 text-zinc-500" role="status">正在加载…</div>}>
        {renderView()}
      </React.Suspense>
      <MediaLightbox />
    </MainLayout>
  );
};

export default Options;
