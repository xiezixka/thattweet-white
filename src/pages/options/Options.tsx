import React from 'react';
import './Options.css';
import { MainLayout } from '../../shared/components/layout/MainLayout';
import { useUIStore } from '../../shared/store/useUIStore';
import { FeedView } from '../../features/feed/FeedView';
import { IntelligenceView } from '../../features/intelligence/IntelligenceView';

const Options: React.FC = () => {
  const { activeView } = useUIStore();

  const renderView = () => {
    switch (activeView) {
      case 'feed':
        return <FeedView />;
      case 'intelligence':
        return <IntelligenceView />;
      case 'stats':
        return <div className="p-8 text-zinc-500">数据看板模块构建中...</div>;
      case 'settings':
        return <div className="p-8 text-zinc-500">引擎实验室模块构建中...</div>;
      default:
        return <FeedView />;
    }
  };

  return (
    <MainLayout>
      {renderView()}
    </MainLayout>
  );
};

export default Options;
