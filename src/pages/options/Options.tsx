import React from 'react';
import './Options.css';
import { MainLayout } from '../../shared/components/layout/MainLayout';
import { useUIStore } from '../../shared/store/useUIStore';
import { FeedView } from '../../features/feed/FeedView';
import { IntelligenceView } from '../../features/intelligence/IntelligenceView';
import { SettingsView } from '../../features/settings/SettingsView';
import { StatsView } from '../../features/stats/StatsView';
import { AnalyticsView } from '../../features/analytics/AnalyticsView';
import { MediaLightbox } from '../../shared/components/MediaLightbox';

const Options: React.FC = () => {
  const { activeView } = useUIStore();

  const renderView = () => {
    switch (activeView) {
      case 'feed':
        return <FeedView />;
      case 'intelligence':
        return <IntelligenceView />;
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
