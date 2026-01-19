import React from 'react';
import { Settings2, X, ChevronDown, ChevronRight, Zap, Eye, Sliders } from 'lucide-react';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { motion, AnimatePresence } from 'framer-motion';

export interface GraphSettings {
    // ⚡ 核心过滤
    qualityThreshold: number;      // AI 质量阈值 (0-100)
    influenceLevel: number;        // 影响力档位 (0=全员, 1=1k, 2=10k, 3=100k, 4=1M)
    explorationDepth: number;      // 社交探索深度 (1-3 层)

    // 🎨 视觉展示
    is3D: boolean;
    showUsers: boolean;
    showTweets: boolean;
    showTags: boolean;
    showPanelOnHover: boolean;
    enableFlowParticles: boolean;  // 是否开启流光粒子 (仅高亮时)

    // 🧪 物理布局 (高级)
    layoutDensity: number;         // 布局疏密度 (整合排斥力/连接距离)
    nodeScale: number;
}

// 影响力档位标签
const INFLUENCE_LABELS = ['全员', '1k+', '10k+', '100k+', '1M+'];
const INFLUENCE_VALUES = [0, 1000, 10000, 100000, 1000000];

interface Props {
    settings: GraphSettings;
    onUpdate: (key: keyof GraphSettings, value: number | boolean) => void;
}

const Slider = ({ label, value, min, max, step, onChange, hint }: any) => (
    <div className="flex flex-col gap-2 mb-4">
        <div className="flex justify-between text-xs text-zinc-400">
            <span>{label}</span>
            <span className="font-mono text-zinc-500">{hint || value}</span>
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

const Toggle = ({ label, checked, onChange, color = "bg-blue-500", hint }: any) => (
    <div className="flex items-center justify-between mb-3 cursor-pointer group" onClick={() => onChange(!checked)}>
        <div className="flex flex-col">
            <span className="text-xs text-zinc-400 group-hover:text-zinc-300 transition-colors">{label}</span>
            {hint && <span className="text-[10px] text-zinc-600">{hint}</span>}
        </div>
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
    const [isExpanded, setIsExpanded] = React.useState(false);

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
        <div className="absolute top-6 right-6 z-20 w-72 bg-zinc-950/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl flex flex-col animate-in slide-in-from-right-4 fade-in duration-300">
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
                {/* ⚡ 核心过滤 */}
                <Section title="精锐过滤" icon={Zap}>
                    <Slider
                        label="AI 质量阈值"
                        value={settings.qualityThreshold}
                        min={0} max={100} step={5}
                        onChange={(v: number) => onUpdate('qualityThreshold', v)}
                        hint={settings.qualityThreshold === 0 ? '全部' : `≥ ${settings.qualityThreshold} 分`}
                    />
                    <div className="text-[10px] text-zinc-600 -mt-2 mb-3">低于此分数的回复或水贴将被过滤</div>

                    <Slider
                        label="影响力门槛"
                        value={settings.influenceLevel}
                        min={0} max={4} step={1}
                        onChange={(v: number) => onUpdate('influenceLevel', v)}
                        hint={INFLUENCE_LABELS[settings.influenceLevel]}
                    />
                    <div className="text-[10px] text-zinc-600 -mt-2 mb-3">
                        只显示粉丝 {settings.influenceLevel === 0 ? '不限' : `≥ ${INFLUENCE_VALUES[settings.influenceLevel].toLocaleString()}`} 的用户
                    </div>

                    <Slider
                        label="探索深度"
                        value={settings.explorationDepth}
                        min={1} max={3} step={1}
                        onChange={(v: number) => onUpdate('explorationDepth', v)}
                        hint={`${settings.explorationDepth} 层`}
                    />
                    <div className="text-[10px] text-zinc-600 -mt-2 mb-1">点击大 V 后展开 {settings.explorationDepth} 层关联内容</div>
                </Section>

                {/* 🎨 视觉展示 */}
                <Section title="视觉展示" icon={Eye}>
                    <Toggle
                        label="3D 空间模式"
                        checked={settings.is3D}
                        onChange={(v: boolean) => onUpdate('is3D', v)}
                        color="bg-indigo-600"
                    />
                    <Toggle
                        label="交互流光"
                        checked={settings.enableFlowParticles}
                        onChange={(v: boolean) => onUpdate('enableFlowParticles', v)}
                        color="bg-cyan-600"
                        hint="仅高亮路径显示粒子"
                    />
                    <Toggle
                        label="悬浮显示详情"
                        checked={settings.showPanelOnHover}
                        onChange={(v: boolean) => onUpdate('showPanelOnHover', v)}
                        color="bg-pink-600"
                    />

                    <div className="pt-3 mt-2 border-t border-white/5 space-y-1">
                        <div className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold mb-2">可见元素</div>
                        <Toggle
                            label="用户节点"
                            checked={settings.showUsers}
                            onChange={(v: boolean) => onUpdate('showUsers', v)}
                            color="bg-blue-600"
                        />
                        <Toggle
                            label="推文节点"
                            checked={settings.showTweets}
                            onChange={(v: boolean) => onUpdate('showTweets', v)}
                            color="bg-zinc-600"
                        />
                        <Toggle
                            label="话题标签"
                            checked={settings.showTags}
                            onChange={(v: boolean) => onUpdate('showTags', v)}
                            color="bg-purple-600"
                        />
                    </div>
                </Section>

                {/* 🧪 高级布局 */}
                <Section title="布局调整" icon={Sliders} defaultOpen={false}>
                    <Slider
                        label="布局疏密度"
                        value={settings.layoutDensity}
                        min={1} max={5} step={1}
                        onChange={(v: number) => onUpdate('layoutDensity', v)}
                        hint={['极密', '紧凑', '正常', '宽松', '极疏'][settings.layoutDensity - 1]}
                    />
                    <div className="text-[10px] text-zinc-600 -mt-2 mb-3">调整节点间距和排斥力</div>

                    <Slider
                        label="节点大小"
                        value={settings.nodeScale}
                        min={0.5} max={2} step={0.1}
                        onChange={(v: number) => onUpdate('nodeScale', v)}
                    />
                </Section>
            </div>
        </div>
    );
};

export { INFLUENCE_VALUES };
