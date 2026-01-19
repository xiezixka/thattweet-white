import React from 'react';
import { Settings2, X, ChevronDown, ChevronRight, Activity, Eye, Filter } from 'lucide-react';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { motion, AnimatePresence } from 'framer-motion';

export interface GraphSettings {
    repelForce: number;
    linkDistance: number;
    centerForce: number;
    nodeScale: number;
    linkWidth: number;
    particleWidth: number;
    showUsers: boolean;
    showTweets: boolean;
    showTags: boolean;
    highlightDepth: number; // 高亮时搜索的层级深度
    is3D: boolean;
    clusterByTopic: boolean;
    temporalEvolution: boolean;
    showPanelOnHover: boolean; // 悬浮时是否显示侧边面板
}

interface Props {
    settings: GraphSettings;
    onUpdate: (key: keyof GraphSettings, value: number | boolean) => void;
}

const Slider = ({ label, value, min, max, step, onChange }: any) => (
    <div className="flex flex-col gap-2 mb-4">
        <div className="flex justify-between text-xs text-zinc-400">
            <span>{label}</span>
            <span className="font-mono text-zinc-500">{value}</span>
        </div>
        <SliderPrimitive.Root
            className="relative flex items-center select-none touch-none w-full h-5"
            value={[value]}
            max={max}
            min={min}
            step={step}
            onValueChange={(vals) => onChange(vals[0])}
        >
            <SliderPrimitive.Track className="bg-zinc-800 relative grow rounded-full h-[3px]">
                <SliderPrimitive.Range className="absolute bg-blue-500 rounded-full h-full" />
            </SliderPrimitive.Track>
            <SliderPrimitive.Thumb
                className="block w-3 h-3 bg-white hover:bg-blue-100 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-colors"
            />
        </SliderPrimitive.Root>
    </div>
);

const Toggle = ({ label, checked, onChange, color = "bg-blue-500" }: any) => (
    <div className="flex items-center justify-between mb-3 cursor-pointer" onClick={() => onChange(!checked)}>
        <span className="text-xs text-zinc-400">{label}</span>
        <div className={`w-9 h-5 rounded-full transition-colors relative ${checked ? color : 'bg-zinc-800'}`}>
            <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-transform ${checked ? 'left-5' : 'left-1'}`} />
        </div>
    </div>
);

const Section = ({ title, icon: Icon, children, defaultOpen = true }: any) => {
    const [isOpen, setIsOpen] = React.useState(defaultOpen);
    return (
        <div className="border-b border-white/5 last:border-0">
            <button
                className="w-full flex items-center justify-between p-3 text-xs font-bold text-zinc-300 hover:bg-white/5 transition-colors"
                onClick={() => setIsOpen(!isOpen)}
            >
                <div className="flex items-center gap-2">
                    <Icon size={14} className="text-zinc-500" />
                    {title}
                </div>
                {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="p-3 pt-0">
                            {children}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export const GraphSettingsPanel: React.FC<Props> = ({ settings, onUpdate }) => {
    const [isExpanded, setIsExpanded] = React.useState(false); // 默认关闭

    if (!isExpanded) {
        return (
            <button
                onClick={() => setIsExpanded(true)}
                className="absolute top-6 right-6 z-20 w-10 h-10 bg-zinc-900/80 backdrop-blur-md border border-white/10 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all shadow-lg text-xs"
            >
                <Settings2 size={18} />
            </button>
        );
    }

    return (
        <div className="absolute top-6 right-6 z-20 w-64 bg-zinc-950/90 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl flex flex-col animate-in slide-in-from-right-4 fade-in duration-300">
            {/* Header */}
            <div className="flex items-center justify-between p-3 border-b border-white/10 bg-white/5 rounded-t-xl">
                <span className="text-xs font-bold text-zinc-300 flex items-center gap-2">
                    <Settings2 size={14} />
                    图谱控制
                </span>
                <button
                    onClick={() => setIsExpanded(false)}
                    className="text-zinc-500 hover:text-white transition-colors"
                >
                    <X size={14} />
                </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto custom-scrollbar">
                {/* 筛选 */}
                <Section title="筛选" icon={Filter}>
                    <Toggle
                        label="用户"
                        checked={settings.showUsers}
                        onChange={(v: boolean) => onUpdate('showUsers', v)}
                        color="bg-blue-600"
                    />
                    <Toggle
                        label="推文"
                        checked={settings.showTweets}
                        onChange={(v: boolean) => onUpdate('showTweets', v)}
                        color="bg-zinc-600"
                    />
                    <Toggle
                        label="标签/话题"
                        checked={settings.showTags}
                        onChange={(v: boolean) => onUpdate('showTags', v)}
                        color="bg-purple-600"
                    />
                </Section>

                {/* 力场 */}
                <Section title="力场" icon={Activity}>
                    <Slider
                        label="排斥力"
                        value={settings.repelForce} min={0} max={200} step={5}
                        onChange={(v: number) => onUpdate('repelForce', v)}
                    />
                    <Slider
                        label="连接距离"
                        value={settings.linkDistance} min={5} max={100} step={5}
                        onChange={(v: number) => onUpdate('linkDistance', v)}
                    />
                    <Slider
                        label="中心引力"
                        value={settings.centerForce} min={0} max={1} step={0.05}
                        onChange={(v: number) => onUpdate('centerForce', v)}
                    />
                </Section>

                {/* 显示 */}
                <Section title="显示" icon={Eye}>
                    <Slider
                        label="节点缩放"
                        value={settings.nodeScale} min={0.1} max={3} step={0.1}
                        onChange={(v: number) => onUpdate('nodeScale', v)}
                    />
                    <Slider
                        label="连线粗细"
                        value={settings.linkWidth} min={0} max={5} step={0.1}
                        onChange={(v: number) => onUpdate('linkWidth', v)}
                    />
                    <Slider
                        label="粒子大小"
                        value={settings.particleWidth} min={0} max={5} step={0.5}
                        onChange={(v: number) => onUpdate('particleWidth', v)}
                    />
                    <Slider
                        label="高亮层级"
                        value={settings.highlightDepth} min={0} max={5} step={1}
                        onChange={(v: number) => onUpdate('highlightDepth', v)}
                    />
                    <div className="text-[10px] text-zinc-500 -mt-2 mb-2">点击节点后高亮显示 {settings.highlightDepth} 层相邻节点</div>

                    <div className="pt-2 border-t border-white/5 space-y-1">
                        <Toggle
                            label="3D 空间模式"
                            checked={settings.is3D}
                            onChange={(v: boolean) => onUpdate('is3D', v)}
                            color="bg-indigo-600"
                        />
                        <Toggle
                            label="主题聚类"
                            checked={settings.clusterByTopic}
                            onChange={(v: boolean) => onUpdate('clusterByTopic', v)}
                            color="bg-emerald-600"
                        />
                        <Toggle
                            label="时间流光"
                            checked={settings.temporalEvolution}
                            onChange={(v: boolean) => onUpdate('temporalEvolution', v)}
                            color="bg-orange-600"
                        />
                        <Toggle
                            label="悬浮显示详情"
                            checked={settings.showPanelOnHover}
                            onChange={(v: boolean) => onUpdate('showPanelOnHover', v)}
                            color="bg-pink-600"
                        />
                    </div>
                </Section>
            </div>
        </div>
    );
};
