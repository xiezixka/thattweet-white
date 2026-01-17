import React from 'react';
import './Options.css';
import { MainLayout } from '../../shared/components/layout/MainLayout';
import { useUIStore } from '../../shared/store/useUIStore';
import { useSettingsStore } from '../../shared/store/useSettingsStore';
import { FeedView } from '../../features/feed/FeedView';
import { IntelligenceView } from '../../features/intelligence/IntelligenceView';
import { SettingsView } from '../../features/settings/SettingsView';
import { StatsView } from '../../features/stats/StatsView';
import { AnalyticsView } from '../../features/analytics/AnalyticsView';
import { GalleryView } from '../../features/gallery/GalleryView';
import { MediaLightbox } from '../../shared/components/MediaLightbox';
import ConnectionsView from '../../features/connections/ConnectionsView';

const Options: React.FC = () => {
  const { activeView } = useUIStore();
  const settings = useSettingsStore(s => s.settings);

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
        return <ConnectionsView />;
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
      {renderView()}
      <MediaLightbox />
    </MainLayout>
  );
};

export default Options;
