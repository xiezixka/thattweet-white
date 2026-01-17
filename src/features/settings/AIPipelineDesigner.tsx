import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
    Eye, FileText, MessageSquare, BrainCircuit, Sparkles,
    Plus, Trash2, Edit2, CheckCircle2, XCircle, Loader2,
    Server, Activity, Edit3, Zap, X, Terminal, Search, Check, ChevronDown, Cpu, User, Lock
} from 'lucide-react';
import { useTranslation } from '../../shared/hooks/useTranslation';
import { cn } from '../../shared/utils/cn';
import { AISettings, AIServiceProvider, WorkflowNodeConfig, PROVIDER_PRESETS, DEFAULT_AI_SETTINGS } from '../../shared/types/settings';
import { ModelSelector } from '../../shared/components/ModelSelector';

interface AIPipelineDesignerProps {
    settings: AISettings;
    onUpdate: (newSettings: AISettings) => void;
}

type NodeKey = 'perception' | 'textAnalysis' | 'profile' | 'chat' | 'salon';

interface NodeMeta {
    key: NodeKey;
    icon: React.ElementType;
    labelKey: string;
    descKey: string;
    hasToggle?: boolean;
    hasPrompt?: boolean;
}

const CAPTURE_NODES: NodeMeta[] = [
    { key: 'perception', icon: Search, labelKey: 'node_perception', descKey: 'node_perception_desc', hasToggle: true, hasPrompt: true },
];

const ANALYSIS_NODES: NodeMeta[] = [
    { key: 'textAnalysis', icon: Sparkles, labelKey: 'node_text', descKey: 'node_text_desc', hasPrompt: true },
    { key: 'profile', icon: User, labelKey: 'node_profile', descKey: 'node_profile_desc', hasPrompt: true },
];

const INTERACTION_NODES: NodeMeta[] = [
    { key: 'chat', icon: Lock, labelKey: 'node_chat', descKey: 'node_chat_desc' },
    { key: 'salon', icon: BrainCircuit, labelKey: 'node_salon', descKey: 'node_salon_desc' },
];

/**
 * Custom Minimalist Provider Selector
 */
const ProviderSelector: React.FC<{
    value: string;
    providers: AIServiceProvider[];
    defaultName?: string;
    onChange: (v: string) => void;
    disabled?: boolean;
}> = ({ value, providers, defaultName, onChange, disabled }) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const selectedProvider = providers.find(p => p.id === value);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div ref={containerRef} className="relative w-full">
            <button
                type="button"
                onClick={() => !disabled && setIsOpen(!isOpen)}
                className={cn(
                    "w-full flex items-center justify-between gap-2 px-4 py-3 rounded-xl border transition-all text-left",
                    "bg-black border-white/5 hover:border-white/20",
                    disabled && "opacity-50 cursor-not-allowed",
                    isOpen && "border-white/30 ring-1 ring-white/10"
                )}
            >
                <div className="flex items-center gap-2">
                    <Terminal size={14} className="text-zinc-600" />
                    <span className={cn("text-sm font-black truncate", value ? "text-white" : "text-zinc-500")}>
                        {selectedProvider ? selectedProvider.name : defaultName}
                    </span>
                </div>
                <ChevronDown size={14} className={cn("text-zinc-600 transition-transform", isOpen && "rotate-180")} />
            </button>

            {isOpen && (
                <div className="absolute z-50 mt-2 w-full bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden py-1 animate-in zoom-in-95 duration-200">
                    <button
                        onClick={() => { onChange(''); setIsOpen(false); }}
                        className={cn("w-full px-4 py-3 text-left text-xs font-black uppercase tracking-widest flex items-center justify-between transition-colors", !value ? "bg-white text-black" : "text-zinc-500 hover:bg-white/5")}
                    >
                        {defaultName}
                        {!value && <Check size={14} />}
                    </button>
                    {providers.map(p => (
                        <button
                            key={p.id}
                            onClick={() => { onChange(p.id); setIsOpen(false); }}
                            className={cn("w-full px-4 py-3 text-left text-xs font-black uppercase tracking-widest flex items-center justify-between transition-colors", value === p.id ? "bg-white text-black" : "text-zinc-500 hover:bg-white/5")}
                        >
                            {p.name}
                            {value === p.id && <Check size={14} />}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

export const AIPipelineDesigner: React.FC<AIPipelineDesignerProps> = ({ settings, onUpdate }) => {
    const { t } = useTranslation();
    const [loadingModels, setLoadingModels] = useState<string | null>(null);
    const [modelCache, setModelCache] = useState<Record<string, string[]>>({});
    const [promptModal, setPromptModal] = useState<NodeKey | null>(null);

    const providers = settings.providers || [];
    const defaultProvider = providers.find(p => p.id === settings.defaultProviderId);

    const fetchModels = useCallback(async (providerId: string): Promise<string[]> => {
        const provider = providers.find(p => p.id === providerId);
        if (!provider || modelCache[providerId]) return modelCache[providerId] || [];

        setLoadingModels(providerId);
        try {
            const response = await fetch(`${provider.baseUrl.replace(/\/$/, '')}/models`, {
                headers: { 'Authorization': `Bearer ${provider.apiKey}` }
            });
            if (response.ok) {
                const data = await response.json();
                const models = (data.data || []).map((m: any) => m.id);
                setModelCache(prev => ({ ...prev, [providerId]: models }));

                const updatedProviders = settings.providers.map(p =>
                    p.id === providerId ? { ...p, cachedModels: models, modelsCachedAt: Date.now() } : p
                );
                onUpdate({ ...settings, providers: updatedProviders });
                return models;
            }
        } catch (e) {
            console.error('Failed to fetch models:', e);
        } finally {
            setLoadingModels(null);
        }
        return [];
    }, [modelCache, providers, settings, onUpdate]);

    const getModelsForProvider = (providerId: string): string[] => {
        if (modelCache[providerId]) return modelCache[providerId];
        const provider = providers.find(p => p.id === providerId);
        return provider?.cachedModels || [];
    };

    const updateNode = (nodeKey: NodeKey, updates: Partial<WorkflowNodeConfig>) => {
        onUpdate({
            ...settings,
            workflowNodes: {
                ...settings.workflowNodes,
                [nodeKey]: { ...settings.workflowNodes[nodeKey], ...updates }
            }
        });
    };

    const renderNode = (meta: NodeMeta) => {
        const nodeConfig = settings.workflowNodes?.[meta.key];
        if (!nodeConfig) return null; // Safety check
        const isEnabled = nodeConfig.enabled !== false;
        const currentProviderId = nodeConfig.providerId || settings.defaultProviderId;
        const availableModels = getModelsForProvider(currentProviderId);
        const provider = providers.find(p => p.id === currentProviderId);

        return (
            <div
                key={meta.key}
                className={cn(
                    "group relative bg-zinc-950/50 border rounded-3xl p-5 transition-all duration-500",
                    "focus-within:z-50", // 👈 确保内部下拉菜单展示时置顶
                    isEnabled
                        ? "border-white/10 hover:border-white/20 hover:bg-white/[0.02] shadow-2xl shadow-black"
                        : "border-white/5 opacity-40 grayscale"
                )}
            >
                {/* Node Label & Icon */}
                <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-3">
                        <div className={cn(
                            "w-10 h-10 rounded-2xl flex items-center justify-center transition-all duration-500",
                            isEnabled ? "bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.15)]" : "bg-zinc-900 text-zinc-600"
                        )}>
                            <meta.icon size={18} />
                        </div>
                        <div>
                            <h4 className="text-white font-black text-[13px] uppercase tracking-wider">{t(meta.labelKey)}</h4>
                            <p className="text-[11px] text-zinc-600 font-bold uppercase tracking-widest mt-0.5">
                                {isEnabled ? t('node_status_active') : t('node_status_disabled')}
                            </p>
                        </div>
                    </div>

                    {meta.hasToggle && (
                        <button
                            onClick={() => updateNode(meta.key, { enabled: !isEnabled })}
                            className={cn(
                                "relative w-10 h-5 rounded-full transition-all duration-500 flex items-center px-0.5 border",
                                isEnabled ? "bg-white border-white" : "bg-black border-white/10"
                            )}
                        >
                            <div className={cn(
                                "w-3.5 h-3.5 rounded-full transition-all duration-500",
                                isEnabled ? "bg-black translate-x-5" : "bg-zinc-800 translate-x-0"
                            )} />
                        </button>
                    )}
                </div>

                <div className="space-y-4">
                    {/* Provider Select */}
                    <div className="space-y-1">
                        <div className="flex items-center justify-between px-1">
                            <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">{t('label_provider')}</label>
                            {provider && (
                                <img src={PROVIDER_PRESETS[provider.provider]?.icon} className="w-3 h-3 rounded-full opacity-40" />
                            )}
                        </div>
                        <ProviderSelector
                            value={nodeConfig.providerId}
                            providers={providers}
                            defaultName={defaultProvider ? t('fallback_global') : "UNSET"}
                            onChange={(v) => {
                                updateNode(meta.key, { providerId: v, model: '' });
                                if (v && !modelCache[v]) fetchModels(v);
                            }}
                            disabled={!isEnabled}
                        />
                    </div>

                    {/* Model Select */}
                    <div className="space-y-1">
                        <label className="px-1 text-[10px] font-black text-zinc-600 uppercase tracking-widest">{t('label_model')}</label>
                        <ModelSelector
                            value={nodeConfig.model}
                            models={availableModels}
                            isLoading={loadingModels === currentProviderId}
                            placeholder={t('select_model')}
                            disabled={!isEnabled}
                            onChange={(m) => updateNode(meta.key, { model: m })}
                            onOpen={() => {
                                if (currentProviderId && !modelCache[currentProviderId]) fetchModels(currentProviderId);
                            }}
                        />
                        {meta.hasPrompt && isEnabled && (
                            <button
                                onClick={() => setPromptModal(meta.key)}
                                className="w-full flex items-center justify-between px-3 py-1.5 mt-1 rounded-lg bg-white/5 border border-white/5 hover:border-brand/40 group/p transition-all"
                            >
                                <span className="text-[11px] font-black text-zinc-600 group-hover:text-brand transition-colors uppercase tracking-widest leading-none">
                                    {t('edit_prompt')}
                                </span>
                                <Edit3 size={10} className="text-zinc-700 group-hover:text-brand transition-colors" />
                            </button>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    const renderStage = (titleKey: string, nodes: NodeMeta[], stageIndex: number) => (
        <div className="flex-1 flex flex-col gap-6 relative">
            {/* Stage Header */}
            <div className="flex items-center gap-3 px-2">
                <div className="w-6 h-6 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-xs font-black text-white">
                    {stageIndex + 1}
                </div>
                <h3 className="text-base font-black text-white uppercase tracking-[0.2em]">{t(titleKey)}</h3>
            </div>

            {/* Stage Nodes Container */}
            <div className="flex-1 space-y-4">
                {nodes.map(renderNode)}
            </div>

            {/* Connector - Desktop only */}
            {stageIndex < 2 && (
                <div className="hidden lg:block absolute -right-6 top-1/2 -translate-y-1/2 z-0">
                    <div className="w-12 h-px bg-gradient-to-r from-white/10 to-transparent relative">
                        <div className="absolute right-0 -top-[3px] w-1.5 h-1.5 rounded-full bg-white/10" />
                    </div>
                </div>
            )}
        </div>
    );

    return (
        <div className="space-y-6">
            {/* Header Banner - Compact */}
            <div className="relative overflow-hidden bg-zinc-900 border border-white/5 rounded-[2rem] p-6 group">
                <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:scale-110 transition-transform duration-1000">
                    <Zap size={100} />
                </div>
                <div className="relative z-10">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[11px] font-black text-emerald-500 uppercase tracking-widest mb-3">
                        <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                        {t('pipeline_status_online')}
                    </div>
                    <h2 className="text-2xl font-black text-white tracking-tighter uppercase mb-1">
                        {t('pipeline_title')}
                    </h2>
                    <p className="text-sm text-zinc-500 font-medium max-w-xl">
                        {t('pipeline_desc')}
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative min-h-[600px]">
                {/* Background Grid - Node-style aesthetics */}
                <div className="absolute inset-0 -z-10 opacity-[0.03] pointer-events-none rounded-[3rem]"
                    style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '32px 32px' }}
                />

                {renderStage('stage_capture', CAPTURE_NODES, 0)}
                {renderStage('stage_analysis', ANALYSIS_NODES, 1)}
                {renderStage('stage_interaction', INTERACTION_NODES, 2)}
            </div>

            {/* Prompt Modal Overlay */}
            {promptModal && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="absolute inset-0" onClick={() => setPromptModal(null)} />
                    <div className="relative bg-zinc-900 border border-white/10 rounded-[2rem] w-full max-w-5xl h-[80vh] flex flex-col shadow-2xl overflow-hidden scale-in-center">
                        {/* Modal Header */}
                        <div className="px-8 py-6 bg-white/[0.02] border-b border-white/5 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-brand/10 rounded-2xl text-brand">
                                    <BrainCircuit size={24} />
                                </div>
                                <div>
                                    <h3 className="text-3xl font-black text-white tracking-tighter uppercase">
                                        {t(`node_${promptModal}`)}
                                    </h3>
                                    <p className="text-zinc-500 text-xs font-black uppercase tracking-widest mt-1 flex items-center gap-2">
                                        <Sparkles size={10} />
                                        {t('prompt_hub_title')}
                                    </p>
                                </div>
                            </div>
                            <button onClick={() => setPromptModal(null)} className="w-12 h-12 rounded-2xl bg-white/5 hover:bg-rose-500/10 hover:text-rose-500 flex items-center justify-center text-zinc-500 transition-all">
                                <X size={20} />
                            </button>
                        </div>

                        {/* Modal Content - Split View */}
                        <div className="flex-1 flex overflow-hidden">
                            {/* Variables Sidebar */}
                            <div className="w-64 bg-black/20 border-r border-white/5 p-6 space-y-6 overflow-y-auto no-scrollbar">
                                <div className="space-y-2">
                                    <h4 className="text-xs font-black text-zinc-500 uppercase tracking-widest px-1">
                                        {t('prompt_variables')}
                                    </h4>
                                    <div className="space-y-1.5 mt-4">
                                        {(promptModal === 'perception'
                                            ? ['{tweet_text}', '{author}', '{ai_style_focus}']
                                            : promptModal === 'profile'
                                                ? ['{context}']
                                                : ['{tweet_text}', '{author}', '{ai_style_focus}', '{tweet_id}']
                                        ).map(v => (
                                            <div key={v} className="px-3 py-2 bg-white/5 border border-white/5 rounded-xl text-xs font-mono text-brand flex items-center justify-between group cursor-default">
                                                <span>{v}</span>
                                                <div className="w-1 h-1 rounded-full bg-brand/40 group-hover:bg-brand transition-colors" />
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="p-4 rounded-2xl bg-brand/5 border border-brand/10">
                                    <p className="text-[11px] text-zinc-500 leading-relaxed italic">
                                        Tips: 使用反斜杠转义双引号 \" 确保 JSON 结构合法。
                                    </p>
                                </div>
                            </div>

                            {/* Editor Area */}
                            <div className="flex-1 p-8 bg-zinc-950/30 flex flex-col relative group">
                                <textarea
                                    value={settings.workflowNodes[promptModal as keyof typeof settings.workflowNodes]?.prompt || ''}
                                    onChange={(e) => {
                                        const newNodes = { ...settings.workflowNodes };
                                        const nodeKey = promptModal as keyof typeof settings.workflowNodes;
                                        newNodes[nodeKey] = { ...newNodes[nodeKey], prompt: e.target.value };
                                        onUpdate({
                                            ...settings,
                                            workflowNodes: newNodes
                                        });
                                    }}
                                    placeholder={t('prompt_placeholder')}
                                    className="w-full h-full bg-transparent text-base font-mono text-zinc-300 outline-none resize-none no-scrollbar leading-relaxed"
                                />

                                {/* Absolute Decoration */}
                                <div className="absolute top-8 right-8 text-xs font-mono text-zinc-800 pointer-events-none select-none uppercase">
                                    System Instructions
                                </div>
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div className="px-8 py-6 bg-white/[0.02] border-t border-white/5 flex items-center justify-between">
                            <p className="text-xs text-zinc-600 font-bold uppercase tracking-wider">
                                {promptModal === 'profile' ? 'Persona Generation Logic' : 'Contextual Intelligence Model'}
                            </p>
                            <div className="flex gap-4">
                                <button
                                    onClick={() => setPromptModal(null)}
                                    className="px-8 py-3 bg-white/5 hover:bg-white/10 text-white font-black rounded-xl transition-all uppercase text-xs tracking-widest border border-white/5"
                                >
                                    {t('cancel')}
                                </button>
                                <button
                                    onClick={() => {
                                        if (promptModal) {
                                            const defaultPrompt = DEFAULT_AI_SETTINGS.workflowNodes[promptModal]?.prompt;
                                            if (defaultPrompt) {
                                                const newNodes = { ...settings.workflowNodes };
                                                newNodes[promptModal] = { ...newNodes[promptModal], prompt: defaultPrompt };
                                                onUpdate({ ...settings, workflowNodes: newNodes });
                                            }
                                        }
                                    }}
                                    className="px-6 py-3 bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white font-black rounded-xl transition-all uppercase text-xs tracking-widest border border-white/5"
                                >
                                    {t('btn_reset_default')}
                                </button>
                                <button
                                    onClick={() => setPromptModal(null)}
                                    className="px-10 py-3 bg-brand text-white font-black rounded-xl hover:brightness-110 hover:scale-[1.02] transition-all active:scale-95 shadow-xl shadow-brand/20 uppercase text-xs tracking-widest"
                                >
                                    {t('prompt_deploy')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
