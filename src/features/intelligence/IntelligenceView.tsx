import React from 'react';

export const IntelligenceView: React.FC = () => (
    <div className="flex h-full">
        <div className="w-80 border-r border-white/5 p-6 space-y-4">
            <h2 className="text-xl font-bold">对话记录</h2>
            <div className="space-y-2 opacity-30">
                <div className="h-12 bg-white/5 rounded-lg" />
                <div className="h-12 bg-white/5 rounded-lg" />
            </div>
        </div>
        <div className="flex-1 flex flex-col p-8">
            <div className="flex-1 glass-panel rounded-3xl p-8 flex items-center justify-center text-zinc-600 italic">
                选择或开始一个新的深度分析对话...
            </div>
        </div>
    </div>
);
