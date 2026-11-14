import React, { useState, useEffect, useRef } from 'react';
import {
    Activity, Cpu, Database, Eye, FileText, Heart,
    RefreshCw, Search, Settings, Sparkles, Terminal,
    X, Plus, Zap, ChevronDown, Check, ScanFace, BookOpen, AlertCircle, Loader2,
    BrainCircuit, HardDrive, Info, Sliders, PlayCircle, PauseCircle, Fingerprint, FolderOpen,
    Download, Upload, Save, User
} from 'lucide-react';
import { useTranslation } from '../../shared/hooks/useTranslation';
import { cn } from '../../shared/utils/cn';
import { useSettingsStore, SettingsState } from '../../shared/store/useSettingsStore';
import { AISettings, DEFAULT_AI_SETTINGS, getSafeAISettings } from '../../shared/types/settings';
import { AIEngineManager } from './AIEngineManager';
import { AIPipelineDesigner } from './AIPipelineDesigner';
import { TweetRepository } from '../../core/storage/TweetRepository';
import supportImg from '../../assets/img/支持一下.png';
import { embeddingSyncManager } from '../intelligence/services/embeddingSyncManager';
import { SyncProgress } from '../intelligence/services/embeddingService';
import logoPng from '../../assets/img/icon.png';
import { VisionService } from '../../core/vision/visionService';
import { version } from '../../../package.json';
import { isSafariIOS } from '../../shared/utils/platform';
import { SafariBackupPanel } from './SafariBackupPanel';

type SettingsGroup = 'neural' | 'memory' | 'system';

// --- UI COMPONENTS ---

const SectionHeader = ({ title, icon: Icon, rightContent }: any) => (
    <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/5">
        <div className="flex items-center gap-3">
            <Icon size={18} className="text-zinc-500" />
            <h2 className="text-sm font-black text-white uppercase tracking-[0.25em]">{title}</h2>
        </div>
        {rightContent}
    </div>
);

const Card = ({ children, className }: { children: React.ReactNode, className?: string }) => (
    <div className={cn("bg-[#0A0A0A] border border-white/5 rounded-2xl p-6 hover:border-white/10 transition-colors duration-300", className)}>
        {children}
    </div>
);

const Field = ({ label, children, description }: any) => (
    <div className="space-y-2.5">
        <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">{label}</label>
        </div>
        {children}
        {description && <p className="text-[11px] text-zinc-600 font-medium leading-relaxed">{description}</p>}
    </div>
);

// --- MAIN VIEW ---

export const SettingsView: React.FC = () => {
    const { t } = useTranslation();
    const settings = useSettingsStore((s: SettingsState) => s.settings);
    const updateSettings = useSettingsStore((s: SettingsState) => s.updateSettings);
    const [activeGroup, setActiveGroup] = useState<SettingsGroup>('neural');
    const [status, setStatus] = useState('');
    const [newTag, setNewTag] = useState('');
    const [isDirty, setIsDirty] = useState(false);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const restoreInputRef = useRef<HTMLInputElement>(null);
    const [includeSettings, setIncludeSettings] = useState(false);
    const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
    const [embedStats, setEmbedStats] = useState<any>(null);
    const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Author Export States
    const [authors, setAuthors] = useState<Array<{ id: string; handle: string; name: string; avatar?: string; tweetCount: number }>>([]);
    const [selectedAuthorId, setSelectedAuthorId] = useState<string | null>(null);
    const [isLoadingAuthors, setIsLoadingAuthors] = useState(false);
    const [authorSearchQuery, setAuthorSearchQuery] = useState('');

    // Initial Load & Migration
    useEffect(() => {
        const loadStats = async () => {
            const stats = await embeddingSyncManager.getStats();
            setEmbedStats(stats);
        };
        loadStats();

        embeddingSyncManager.onProgress((p) => {
            setSyncProgress(p);
            if (p.status === 'completed') {
                loadStats();
                setTimeout(() => setSyncProgress(null), 3000);
            }
        });

        return () => embeddingSyncManager.offProgress();
    }, []);

    const handleSyncEmbeddings = async () => {
        try {
            await embeddingSyncManager.syncNow();
        } catch (error) {
            console.error('Manual sync failed:', error);
        }
    };

    const handleClearEmbeddings = async () => {
        if (confirm('Are you sure you want to clear all embeddings? This cannot be undone.')) {
            await embeddingSyncManager.clearAll();
            const stats = await embeddingSyncManager.getStats();
            setEmbedStats(stats);
        }
    };

    const [isResettingImages, setIsResettingImages] = useState(false);

    const handleResetImageAnalysis = async () => {
        if (!confirm('确定要重新分析所有图片吗？这将使用 VLM API 配额。')) return;

        setIsResettingImages(true);
        try {
            const count = await VisionService.resetAllImageAnalysis();
            setStatus(`已重置 ${count} 条推文的图片分析`);
            setTimeout(() => setStatus(''), 3000);
        } catch (error) {
            console.error('Reset failed:', error);
            setStatus('ERROR');
        } finally {
            setIsResettingImages(false);
        }
    };

    const [isClearingData, setIsClearingData] = useState(false);

    const handleClearAllData = async () => {
        if (!confirm('⚠️ 危险操作！\n\n确定要清空所有推文和用户数据吗？\n此操作不可恢复！建议先导出备份。')) return;
        if (!confirm('再次确认：所有数据将被永久删除，确定继续吗？')) return;

        setIsClearingData(true);
        try {
            const result = await TweetRepository.clearAllData();
            setStatus(`已清空 ${result.tweets} 条推文和 ${result.users} 个用户`);
            setTimeout(() => {
                setStatus('');
                window.location.reload(); // 刷新页面以更新 UI
            }, 2000);
        } catch (error) {
            console.error('Clear failed:', error);
            setStatus('ERROR');
        } finally {
            setIsClearingData(false);
        }
    };

    useEffect(() => {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.get(['aiSettings'], (result) => {
                if (result.aiSettings) {
                    let loaded = getSafeAISettings(result.aiSettings);

                    // Legacy Migration
                    const legacy = result.aiSettings as any;
                    if ((!loaded.providers || loaded.providers.length === 0) && legacy.apiKey) {
                        const newProviderId = crypto.randomUUID();
                        const isSilicon = legacy.baseUrl?.includes('siliconflow') || legacy.apiKey?.startsWith('sk-');
                        const isOR = legacy.baseUrl?.includes('openrouter') || legacy.apiKey?.startsWith('sk-or');

                        loaded.providers = [{
                            id: newProviderId,
                            name: isSilicon ? 'SiliconFlow (Migrated)' : isOR ? 'OpenRouter (Migrated)' : 'Legacy Provider',
                            provider: isSilicon ? 'siliconflow' : isOR ? 'openrouter' : 'custom',
                            baseUrl: legacy.baseUrl || 'https://api.openai.com/v1',
                            apiKey: legacy.apiKey,
                            status: 'connected',
                            lastChecked: Date.now()
                        }];
                        loaded.defaultProviderId = newProviderId;
                    }

                    // Safe Merge
                    loaded.workflowNodes = { ...DEFAULT_AI_SETTINGS.workflowNodes, ...(loaded.workflowNodes || {}) };
                    updateSettings(loaded);
                }
            });
        }
    }, []);

    const handleChange = (key: keyof AISettings, value: any) => {
        const newSettings = { ...settings, [key]: value };
        updateSettings(newSettings);
        setIsDirty(true);
        setStatus('UNSAVED');

        // Auto-save after 5 seconds of inactivity
        if (autoSaveTimeoutRef.current) {
            clearTimeout(autoSaveTimeoutRef.current);
        }
        autoSaveTimeoutRef.current = setTimeout(() => {
            handleSave(useSettingsStore.getState().settings);
        }, 5000);
    };

    useEffect(() => () => {
        if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
    }, []);

    const handleManualSave = () => {
        if (autoSaveTimeoutRef.current) {
            clearTimeout(autoSaveTimeoutRef.current);
        }
        handleSave(settings);
    };

    const handleBrowseFolder = () => {
        fileInputRef.current?.click();
    };

    const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files && files.length > 0) {
            // Try to get path if available (Electron/special env) or fallback to name
            const path = (files[0] as any).path || files[0].webkitRelativePath?.split('/')[0];
            if (path) {
                handleChange('backupFolderName', path);
            }
        }
    };

    const handleManualBackup = async () => {
        try {
            setStatus('BACKING UP...');
            const data: any = await TweetRepository.exportAllData();

            // Optionally include settings
            if (includeSettings) {
                data.settings = settings;
            }

            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `ThatTweet-Backup-${new Date().toISOString().slice(0, 10)}${includeSettings ? '-Full' : ''}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 60000);
            setStatus('EXPORTED');
            setTimeout(() => setStatus(''), 2000);
        } catch (error) {
            console.error('Backup failed:', error);
            setStatus('ERROR');
        }
    };

    // Load authors for export selection
    const handleLoadAuthors = async () => {
        setIsLoadingAuthors(true);
        try {
            const allAuthors = await TweetRepository.getAllAuthors();
            setAuthors(allAuthors);
        } catch (error) {
            console.error('Failed to load authors:', error);
        } finally {
            setIsLoadingAuthors(false);
        }
    };

    // Export tweets by specific author
    const handleAuthorExport = async () => {
        if (!selectedAuthorId) return;

        try {
            setStatus('EXPORTING...');
            const data = await TweetRepository.exportByAuthor(selectedAuthorId);

            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `ThatTweet-${data.authorHandle}-${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 60000);
            setStatus('EXPORTED');
            setTimeout(() => setStatus(''), 2000);
        } catch (error) {
            console.error('Author export failed:', error);
            setStatus('ERROR');
        }
    };

    // Filter authors by search query
    const filteredAuthors = authors.filter(author =>
        author.handle.toLowerCase().includes(authorSearchQuery.toLowerCase()) ||
        author.name.toLowerCase().includes(authorSearchQuery.toLowerCase())
    );

    const handleRestoreFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            setStatus('IMPORTING...');
            const text = await file.text();
            const data = JSON.parse(text);

            // Restore DB data
            await TweetRepository.importData(data);

            // Restore Settings if present
            if (data.settings) {
                updateSettings(data.settings);
                handleSave(data.settings);
            }

            setStatus('RESTORED');
            setTimeout(() => setStatus(''), 2000);
        } catch (error) {
            console.error('Restore failed:', error);
            setStatus('ERROR');
        } finally {
            if (restoreInputRef.current) restoreInputRef.current.value = '';
        }
    };

    const handleSettingsUpdate = (newSettings: AISettings) => {
        updateSettings(newSettings);
        handleSave(newSettings);
    };

    const handleSave = (newSettings: AISettings) => {
        setStatus('SAVING...');
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.set({ aiSettings: newSettings }, () => {
                if (chrome.runtime.lastError) {
                    setStatus('ERROR');
                    return;
                }
                setIsDirty(false);
                setTimeout(() => setStatus('SAVED'), 300);
                setTimeout(() => setStatus(''), 2000);
            });
        }
    };

    const groups = [
        { id: 'neural', label: t('nav_neural'), icon: BrainCircuit, sub: t('sub_neural') },
        { id: 'memory', label: t('nav_memory'), icon: HardDrive, sub: t('sub_memory') },
        { id: 'system', label: t('nav_system'), icon: Info, sub: t('sub_system') },
    ];

    return (
        <div className="flex flex-col md:flex-row h-full min-w-0 bg-black font-sans selection:bg-white selection:text-black">
            {/* --- SIDEBAR --- */}
            <aside className="w-full md:w-[260px] border-b md:border-b-0 md:border-r border-white/10 flex flex-col bg-black shrink-0 relative z-20">
                <div className="hidden md:block p-8 pb-10">
                    <div className="flex items-center gap-3 mb-1">
                        <div className="w-6 h-6 bg-white rounded flex items-center justify-center overflow-hidden p-0.5">
                            <img src={logoPng} className="w-full h-full object-contain" alt="Logo" />
                        </div>
                        <h1 className="text-lg font-black text-white tracking-widest">THATTWEET</h1>
                    </div>
                    <p className="text-[11px] text-zinc-600 font-mono pl-9 tracking-widest">INTELLIGENCE CONSOLE</p>
                </div>

                <nav className="flex md:block md:flex-1 px-3 md:px-4 py-3 md:py-0 gap-2 md:space-y-2">
                    {groups.map((group) => (
                        <button
                            key={group.id}
                            onClick={() => setActiveGroup(group.id as SettingsGroup)}
                            className={cn(
                                "flex-1 md:w-full flex items-center justify-center md:justify-start gap-2 md:gap-4 px-2 md:px-4 py-3 md:py-4 rounded-xl transition-all duration-300 group relative overflow-hidden",
                                activeGroup === group.id
                                    ? "bg-white text-black"
                                    : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03]"
                            )}
                        >
                            <group.icon size={18} className={cn("relative z-10 transition-colors", activeGroup === group.id ? "text-black" : "text-zinc-600 group-hover:text-zinc-400")} />
                            <div className="text-left relative z-10">
                                <p className="text-[13px] font-black tracking-[0.1em] leading-tight">{group.label}</p>
                                <p className={cn("hidden md:block text-[10px] font-mono mt-0.5", activeGroup === group.id ? "text-neutral-500" : "text-zinc-600")}>{group.sub}</p>
                            </div>
                        </button>
                    ))}
                </nav>

                <div className="flex md:block items-center gap-4 px-4 pb-3 md:p-6 md:space-y-4">
                    {/* Save Button */}
                    <button
                        onClick={handleManualSave}
                        className={cn(
                            "w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all duration-300",
                            isDirty
                                ? "bg-white text-black hover:bg-zinc-200 shadow-lg shadow-white/20"
                                : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 border border-white/5"
                        )}
                    >
                        <Save size={14} />
                        {isDirty ? 'Save Changes' : 'All Saved'}
                    </button>

                    {/* Status Indicator */}
                    <div className="flex items-center justify-between px-2">
                        <span className={cn(
                            "text-[11px] font-mono transition-colors",
                            status === 'UNSAVED' ? "text-amber-500" : status === 'SAVED' ? "text-emerald-500" : "text-zinc-600"
                        )}>
                            {status || 'READY'}
                        </span>
                        <div className={cn(
                            "w-1.5 h-1.5 rounded-full transition-colors",
                            status === 'UNSAVED' ? "bg-amber-500 animate-pulse" :
                                status === 'SAVING...' ? "bg-white animate-pulse" :
                                    status === 'SAVED' ? "bg-emerald-500" : "bg-zinc-800"
                        )} />
                    </div>
                </div>
            </aside>

            {/* --- MAIN CONTENT --- */}
            <main className="flex-1 min-h-0 min-w-0 overflow-y-auto no-scrollbar bg-[#050505] relative" ref={scrollContainerRef}>
                <div className="p-4 md:p-8 min-h-full">

                    {/* === TAB: NEURAL FORGE === */}
                    {activeGroup === 'neural' && (
                        <div className="flex gap-8 h-full animate-in fade-in slide-in-from-bottom-2 duration-500">

                            {/* Left: Engine Inventory (Sticky Sidebar) */}
                            <div className="w-[320px] shrink-0 sticky top-0 h-fit space-y-6">
                                <Card className="border-white/10 bg-black shadow-2xl">
                                    <AIEngineManager settings={settings} onUpdate={handleSettingsUpdate} />
                                </Card>

                                {/* Advanced Tuning (Moved here for quick access) */}
                                <Card className="border-white/5 space-y-6">
                                    <SectionHeader title="内核调优" icon={Sliders} />
                                    <Field label="视觉范围" description="分析哪些图片">
                                        <div className="grid grid-cols-2 gap-2">
                                            {(['all', 'new'] as const).map(mode => (
                                                <button
                                                    key={mode}
                                                    onClick={() => handleChange('visionEnabledAt', mode === 'all' ? 0 : Date.now())}
                                                    className={cn(
                                                        "py-2 px-3 rounded-lg text-[9px] font-black border transition-all uppercase tracking-widest",
                                                        (mode === 'all' ? settings.visionEnabledAt === 0 : settings.visionEnabledAt > 0)
                                                            ? "bg-white text-black border-white"
                                                            : "bg-black border-white/10 text-zinc-600 hover:border-white/20"
                                                    )}
                                                >
                                                    {mode === 'all' ? 'All Time' : 'New Only'}
                                                </button>
                                            ))}
                                        </div>
                                    </Field>
                                    <Field label={t('label_performance')} description={t('desc_performance')}>
                                        <div className="flex items-center gap-4">
                                            <input
                                                type="range" min="1" max="50" step="1"
                                                value={settings.batchSize}
                                                onChange={e => handleChange('batchSize', parseInt(e.target.value))}
                                                className="flex-1 accent-white h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
                                            />
                                            <span className="font-mono text-xs text-white w-8 text-right">{settings.batchSize}</span>
                                        </div>
                                    </Field>
                                    <Field label={t('label_max_images')} description={t('desc_max_images')}>
                                        <div className="flex items-center gap-4">
                                            <input
                                                type="range" min="1" max="4" step="1"
                                                value={settings.maxImagesPerTweet ?? 4}
                                                onChange={e => handleChange('maxImagesPerTweet', parseInt(e.target.value))}
                                                className="flex-1 accent-white h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
                                            />
                                            <span className="font-mono text-xs text-white w-8 text-right">{settings.maxImagesPerTweet ?? 4}</span>
                                        </div>
                                    </Field>

                                    {/* Reset Image Analysis Button */}
                                    <div className="pt-4 border-t border-white/5">
                                        <button
                                            onClick={handleResetImageAnalysis}
                                            disabled={isResettingImages}
                                            className={cn(
                                                "w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border",
                                                isResettingImages
                                                    ? "bg-zinc-800 text-zinc-500 border-zinc-700 cursor-not-allowed"
                                                    : "bg-amber-500/10 text-amber-500 border-amber-500/20 hover:bg-amber-500/20"
                                            )}
                                        >
                                            {isResettingImages ? (
                                                <Loader2 size={12} className="animate-spin" />
                                            ) : (
                                                <Eye size={12} />
                                            )}
                                            {isResettingImages ? '重置中...' : '重新分析所有图片'}
                                        </button>
                                        <p className="text-[9px] text-zinc-600 mt-2 text-center">
                                            清空现有分析结果，使用新模型/配置重新处理所有图片
                                        </p>
                                    </div>
                                </Card>
                            </div>

                            {/* Right: Mission Control & Pipeline */}
                            <div className="flex-1 min-w-0 space-y-6">
                                {/* Mission Directive (Global Context) */}
                                <Card className="border-white/10 relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 p-8 opacity-[0.02] pointer-events-none group-hover:scale-110 transition-transform duration-1000">
                                        <Fingerprint size={120} />
                                    </div>
                                    <div className="flex items-start justify-between gap-8 relative z-10">
                                        <div className="space-y-4 flex-1">
                                            <div className="flex items-center gap-2 text-zinc-500">
                                                <ScanFace size={16} />
                                                <span className="text-xs font-black uppercase tracking-[0.2em]">{t('section_directive')}</span>
                                            </div>
                                            <input
                                                type="text"
                                                value={settings.aiStyleFocus}
                                                onChange={e => handleChange('aiStyleFocus', e.target.value)}
                                                className="w-full bg-transparent border-b border-white/10 py-2 text-xl font-bold text-white placeholder:text-zinc-700 focus:border-white/40 focus:outline-none font-sans"
                                                placeholder={t('placeholder_directive')}
                                            />
                                            <p className="text-xs text-zinc-600 font-medium">{t('desc_directive')}</p>
                                        </div>

                                        {/* Master Switch */}
                                        <div className="space-y-3 flex flex-col items-end">
                                            <button
                                                onClick={() => handleChange('autoAnalyze', !settings.autoAnalyze)}
                                                className={cn(
                                                    "flex items-center gap-2 pl-3 pr-4 py-2 rounded-full border transition-all duration-300",
                                                    settings.autoAnalyze
                                                        ? "bg-white text-black border-white"
                                                        : "bg-black text-zinc-500 border-white/10 hover:border-white/30"
                                                )}
                                            >
                                                {settings.autoAnalyze ? <PauseCircle size={16} className="fill-black text-white" /> : <PlayCircle size={16} />}
                                                <span className="text-xs font-black uppercase tracking-widest">
                                                    {settings.autoAnalyze ? t('system_active') : t('system_paused')}
                                                </span>
                                            </button>
                                            {settings.autoAnalyze && (
                                                <div className="flex items-center gap-2 text-[11px] text-emerald-500 font-mono uppercase">
                                                    <span className="relative flex h-2 w-2">
                                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                                    </span>
                                                    Online
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </Card>

                                {/* The Pipeline */}
                                <div className="border border-white/5 rounded-3xl bg-[#080808]">
                                    <div className="p-6 border-b border-white/5 bg-white/[0.01]">
                                        <h3 className="text-xs font-black text-zinc-500 uppercase tracking-[0.2em] flex items-center gap-2">
                                            <BrainCircuit size={14} /> {t('pipeline_arch')}
                                        </h3>
                                    </div>
                                    <div className="p-6">
                                        <AIPipelineDesigner settings={settings} onUpdate={handleSettingsUpdate} />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* === TAB: MEMORY CORTEX === */}
                    {activeGroup === 'memory' && (
                        <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

                            {/* RAG Section */}
                            <Card className="border-white/10">
                                <SectionHeader title={t('section_rag')} icon={Database}
                                    rightContent={
                                        <div onClick={() => handleChange('ragEnabled', !settings.ragEnabled)} className={cn("cursor-pointer px-3 py-1 rounded bg-white/5 border border-white/5 text-xs font-mono", settings.ragEnabled ? "text-emerald-500 border-emerald-500/30" : "text-zinc-600")}>
                                            {settings.ragEnabled ? t('status_enabled') : t('status_disabled')}
                                        </div>
                                    }
                                />
                                {settings.ragEnabled ? (
                                    <div className="space-y-8">
                                        <div className="grid grid-cols-2 gap-8">
                                            <Field label={t('label_embedding_model')} description={t('desc_embedding_model')}>
                                                <input type="text" value={settings.embeddingModel} onChange={e => handleChange('embeddingModel', e.target.value)} className="w-full bg-black border border-white/10 rounded-lg px-3 py-2 text-sm font-mono text-white focus:border-white/30 outline-none" />
                                            </Field>
                                            <Field label={t('label_reranker_model')} description={t('desc_reranker_model')}>
                                                <input type="text" value={settings.rerankerModel} onChange={e => handleChange('rerankerModel', e.target.value)} className="w-full bg-black border border-white/10 rounded-lg px-3 py-2 text-sm font-mono text-white focus:border-white/30 outline-none" />
                                            </Field>
                                            <div className="col-span-2">
                                                <Field label={t('label_endpoint')} description={t('desc_endpoint')}>
                                                    <input type="text" value={settings.embeddingUrl} onChange={e => handleChange('embeddingUrl', e.target.value)} className="w-full bg-black border border-white/10 rounded-lg px-3 py-2 text-sm font-mono text-white focus:border-white/30 outline-none" />
                                                </Field>
                                            </div>
                                        </div>

                                        {/* Embedding Sync Control */}
                                        <div className="p-6 bg-white/[0.02] border border-white/5 rounded-2xl space-y-4">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <Fingerprint size={18} className="text-zinc-500" />
                                                    <div>
                                                        <h4 className="text-xs font-black text-white uppercase tracking-widest">向量库状态</h4>
                                                        <p className="text-[10px] text-zinc-600 font-mono mt-0.5">
                                                            {embedStats ? `${embedStats.totalEmbeddings} / ${embedStats.totalTweets} 条推文已索引 (${embedStats.coveragePercent}%)` : '正在获取状态...'}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={handleClearEmbeddings}
                                                        className="px-3 py-1.5 rounded-lg border border-white/5 text-[10px] font-bold text-zinc-600 hover:text-red-400 hover:border-red-400/30 transition-all uppercase tracking-widest"
                                                    >
                                                        清空索引
                                                    </button>
                                                    <button
                                                        onClick={handleSyncEmbeddings}
                                                        disabled={syncProgress?.status === 'syncing'}
                                                        className={cn(
                                                            "flex items-center gap-2 px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                                                            syncProgress?.status === 'syncing'
                                                                ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                                                                : "bg-white text-black hover:bg-zinc-200"
                                                        )}
                                                    >
                                                        {syncProgress?.status === 'syncing' ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                                                        {syncProgress?.status === 'syncing' ? '同步中...' : '立即同步'}
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Progress Bar */}
                                            {syncProgress && (
                                                <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-300">
                                                    <div className="flex justify-between text-[10px] font-mono">
                                                        <span className="text-zinc-500">{syncProgress.message}</span>
                                                        <span className="text-zinc-400">{Math.round((syncProgress.processed / (syncProgress.total || 1)) * 100)}%</span>
                                                    </div>
                                                    <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full bg-white transition-all duration-500"
                                                            style={{ width: `${(syncProgress.processed / (syncProgress.total || 1)) * 100}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="p-10 text-center space-y-4 opacity-50">
                                        <Database size={40} className="mx-auto text-zinc-700" />
                                        <p className="text-sm text-zinc-500 font-mono">{t('rag_offline')}</p>
                                    </div>
                                )}
                            </Card>

                            {/* Backup Section */}
                            <Card className="border-white/10">
                                <SectionHeader title={t('section_backup')} icon={RefreshCw} />
                                {isSafariIOS ? <SafariBackupPanel /> : <>
                                <div className="flex items-center justify-between p-6 bg-white/[0.02] border border-white/5 rounded-xl mb-6">
                                    <div className="flex items-center gap-4">
                                        <div className={cn("p-2 rounded-lg", settings.autoBackupEnabled ? "bg-emerald-900/20 text-emerald-500" : "bg-white/5 text-zinc-600")}>
                                            <Activity size={20} />
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-white uppercase tracking-widest">{t('label_auto_backup')}</p>
                                            <p className="text-xs text-zinc-500 font-mono mt-0.5">{t('desc_auto_backup')}</p>
                                        </div>
                                    </div>
                                    <div onClick={() => handleChange('autoBackupEnabled', !settings.autoBackupEnabled)} className={cn("w-10 h-5 rounded-full relative cursor-pointer bg-zinc-800 transition-colors", settings.autoBackupEnabled && "bg-white")}>
                                        <div className={cn("absolute top-1 w-3 h-3 rounded-full transition-all duration-300", settings.autoBackupEnabled ? "bg-black left-6" : "bg-zinc-500 left-1")} />
                                    </div>
                                </div>
                                <div className="p-4 bg-black rounded-xl border border-white/5 flex items-center gap-4">
                                    <span className="text-xs font-mono text-zinc-500 whitespace-nowrap">{t('label_location')}</span>
                                    <div className="flex-1 flex items-center gap-2 justify-end">
                                        <input
                                            type="text"
                                            value={settings.backupFolderName || ''}
                                            onChange={e => handleChange('backupFolderName', e.target.value)}
                                            placeholder="~/Documents/ThatTweet/Backup"
                                            className="w-full bg-transparent text-xs font-mono text-white outline-none text-right placeholder:text-zinc-700 hover:placeholder:text-zinc-600 focus:placeholder:text-zinc-600 transition-colors"
                                        />
                                        <button
                                            onClick={handleBrowseFolder}
                                            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-500 hover:text-white transition-colors"
                                            title="Select Folder"
                                        >
                                            <FolderOpen size={14} />
                                        </button>
                                    </div>
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        className="hidden"
                                        {...({ webkitdirectory: "", directory: "" } as any)}
                                        onChange={handleFolderSelect}
                                    />
                                </div>

                                {/* Manual Backup & Restore */}
                                <div className="mt-4 flex items-center justify-between p-6 bg-white/[0.02] border border-white/5 rounded-xl">
                                    <div className="flex items-center gap-4">
                                        <div className="p-2 rounded-lg bg-white/5 text-zinc-600">
                                            <HardDrive size={20} />
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-white uppercase tracking-widest">{t('backup_manual_title')}</p>
                                            <p className="text-xs text-zinc-500 font-mono mt-0.5">{t('backup_manual_desc')}</p>
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-end gap-3">
                                        <div className="flex items-center gap-2 cursor-pointer group" onClick={() => setIncludeSettings(!includeSettings)}>
                                            <div className={cn("w-4 h-4 rounded border flex items-center justify-center transition-colors", includeSettings ? "bg-brand border-brand" : "border-zinc-600 group-hover:border-zinc-400")}>
                                                {includeSettings && <Check size={10} className="text-white" />}
                                            </div>
                                            <div className="text-right">
                                                <p className="text-[10px] font-bold text-zinc-400 group-hover:text-zinc-300 uppercase tracking-wider">{t('label_include_settings')}</p>
                                                <p className="text-[9px] text-zinc-600 text-right">{t('desc_include_settings')}</p>
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={handleManualBackup}
                                                className="px-4 py-2 bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white rounded-lg text-xs font-black uppercase tracking-widest flex items-center gap-2 transition-colors border border-white/5"
                                            >
                                                <Download size={14} />
                                                {t('btn_backup_download')}
                                            </button>
                                            <button
                                                onClick={() => restoreInputRef.current?.click()}
                                                className="px-4 py-2 bg-brand/10 hover:bg-brand/20 text-brand rounded-lg text-xs font-black uppercase tracking-widest flex items-center gap-2 transition-colors border border-brand/20"
                                            >
                                                <Upload size={14} />
                                                {t('btn_backup_upload')}
                                            </button>
                                            <input
                                                type="file"
                                                ref={restoreInputRef}
                                                className="hidden"
                                                accept=".json"
                                                onChange={handleRestoreFileSelect}
                                            />
                                        </div>
                                    </div>
                                </div>

                                </>}

                                {/* Export by Author */}
                                <div className="mt-4 p-6 bg-white/[0.02] border border-white/5 rounded-xl space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-500">
                                                <User size={20} />
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold text-white uppercase tracking-widest">按作者导出</p>
                                                <p className="text-xs text-zinc-500 font-mono mt-0.5">导出特定作者的所有推文</p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={handleLoadAuthors}
                                            disabled={isLoadingAuthors}
                                            className={cn(
                                                "px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 transition-all border",
                                                isLoadingAuthors
                                                    ? "bg-zinc-800 text-zinc-500 border-zinc-700 cursor-not-allowed"
                                                    : "bg-white/5 text-zinc-400 hover:text-white border-white/5 hover:border-white/20"
                                            )}
                                        >
                                            {isLoadingAuthors ? (
                                                <Loader2 size={12} className="animate-spin" />
                                            ) : (
                                                <RefreshCw size={12} />
                                            )}
                                            {isLoadingAuthors ? '加载中...' : '加载作者'}
                                        </button>
                                    </div>

                                    {authors.length > 0 && (
                                        <div className="space-y-3">
                                            {/* Search Bar */}
                                            <input
                                                type="text"
                                                value={authorSearchQuery}
                                                onChange={e => setAuthorSearchQuery(e.target.value)}
                                                placeholder="搜索作者..."
                                                className="w-full bg-black border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-white/30 outline-none"
                                            />

                                            {/* Author List */}
                                            <div className="max-h-48 overflow-y-auto space-y-1 scrollbar-thin scrollbar-thumb-zinc-700">
                                                {filteredAuthors.slice(0, 20).map(author => (
                                                    <div
                                                        key={author.id}
                                                        onClick={() => setSelectedAuthorId(author.id)}
                                                        className={cn(
                                                            "flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all",
                                                            selectedAuthorId === author.id
                                                                ? "bg-cyan-500/20 border border-cyan-500/30"
                                                                : "bg-white/[0.02] border border-transparent hover:border-white/10"
                                                        )}
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            {author.avatar ? (
                                                                <img
                                                                    src={author.avatar}
                                                                    alt={author.name}
                                                                    className="w-8 h-8 rounded-full object-cover"
                                                                />
                                                            ) : (
                                                                <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center">
                                                                    <User size={14} className="text-zinc-500" />
                                                                </div>
                                                            )}
                                                            <div>
                                                                <p className="text-xs font-bold text-white">{author.name}</p>
                                                                <p className="text-[10px] text-zinc-500 font-mono">@{author.handle}</p>
                                                            </div>
                                                        </div>
                                                        <span className="text-[10px] font-mono text-zinc-400 bg-white/5 px-2 py-0.5 rounded">
                                                            {author.tweetCount} 条
                                                        </span>
                                                    </div>
                                                ))}
                                                {filteredAuthors.length > 20 && (
                                                    <p className="text-[10px] text-zinc-600 text-center py-2">
                                                        还有 {filteredAuthors.length - 20} 位作者未显示...
                                                    </p>
                                                )}
                                            </div>

                                            {/* Export Button */}
                                            <button
                                                onClick={handleAuthorExport}
                                                disabled={!selectedAuthorId}
                                                className={cn(
                                                    "w-full py-2.5 rounded-lg text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all border",
                                                    selectedAuthorId
                                                        ? "bg-cyan-500/20 text-cyan-400 border-cyan-500/30 hover:bg-cyan-500/30"
                                                        : "bg-zinc-800 text-zinc-600 border-zinc-700 cursor-not-allowed"
                                                )}
                                            >
                                                <Download size={14} />
                                                {selectedAuthorId
                                                    ? `导出 @${authors.find(a => a.id === selectedAuthorId)?.handle} 的推文`
                                                    : '请先选择一位作者'
                                                }
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </Card>

                            {/* Taxonomy Section */}
                            <Card className="border-white/10">
                                <SectionHeader title={t('section_taxonomy')} icon={BookOpen} />
                                <div className="flex flex-wrap gap-2">
                                    {settings.categories.map((tag) => (
                                        <div key={tag} className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/5 rounded text-xs font-bold text-zinc-300 group hover:border-white/20 hover:text-white transition-all">
                                            <span>{tag}</span>
                                            <button onClick={() => handleChange('categories', settings.categories.filter(t => t !== tag))} className="text-zinc-600 hover:text-white"><X size={10} /></button>
                                        </div>
                                    ))}
                                    <input
                                        type="text"
                                        value={newTag}
                                        onChange={e => setNewTag(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && newTag.trim() && (handleChange('categories', [...settings.categories, newTag.trim()]), setNewTag(''))}
                                        placeholder={t('placeholder_new_tag')}
                                        className="bg-transparent border border-dashed border-white/10 px-3 py-1.5 rounded text-xs font-bold text-white focus:border-white/40 focus:outline-none uppercase w-24 placeholder:text-zinc-700"
                                    />
                                </div>
                            </Card>

                            {/* Danger Zone */}
                            <Card className="border-red-500/20 bg-red-500/[0.02]">
                                <SectionHeader title="危险操作" icon={AlertCircle} />
                                <div className="flex items-center justify-between p-4 bg-red-500/5 border border-red-500/10 rounded-xl">
                                    <div className="flex items-center gap-4">
                                        <div className="p-2 rounded-lg bg-red-500/10 text-red-500">
                                            <Database size={20} />
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-white uppercase tracking-widest">清空所有数据</p>
                                            <p className="text-xs text-zinc-500 font-mono mt-0.5">永久删除所有推文和用户记录</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={handleClearAllData}
                                        disabled={isClearingData}
                                        className={cn(
                                            "px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest flex items-center gap-2 transition-all border",
                                            isClearingData
                                                ? "bg-zinc-800 text-zinc-500 border-zinc-700 cursor-not-allowed"
                                                : "bg-red-500/10 text-red-500 border-red-500/20 hover:bg-red-500/20 hover:border-red-500/40"
                                        )}
                                    >
                                        {isClearingData ? (
                                            <Loader2 size={14} className="animate-spin" />
                                        ) : (
                                            <X size={14} />
                                        )}
                                        {isClearingData ? '清空中...' : '清空全部'}
                                    </button>
                                </div>
                                <p className="text-[10px] text-red-500/40 mt-3 text-center">
                                    ⚠️ 此操作不可恢复，建议先执行备份
                                </p>
                            </Card>
                        </div>
                    )}

                    {/* === TAB: SYSTEM === */}
                    {activeGroup === 'system' && (
                        <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

                            {/* Identity Header */}
                            <div className="p-8 border border-white/10 rounded-3xl bg-gradient-to-br from-zinc-900 via-black to-black relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-12 opacity-[0.03] pointer-events-none">
                                    <Terminal size={200} />
                                </div>
                                <div className="relative z-10">
                                    <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mb-6 shadow-xl shadow-white/10 overflow-hidden p-3">
                                        <img src={logoPng} className="w-full h-full object-contain" alt="Logo" />
                                    </div>
                                    <h1 className="text-4xl font-black text-white tracking-widest mb-2">THATTWEET</h1>
                                    <div className="flex items-center gap-3 mb-6">
                                        <div className="px-2 py-1 rounded bg-white/10 border border-white/10 text-[10px] font-mono text-white">
                                            v{version}
                                        </div>
                                        <div className="px-2 py-1 rounded bg-emerald-900/30 border border-emerald-500/30 text-[10px] font-mono text-emerald-500 uppercase">
                                            Stable Channel
                                        </div>
                                    </div>
                                    <p className="text-sm text-zinc-400 max-w-lg leading-relaxed">{t('system_about_desc')}</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Appearance Settings */}
                                <Card className="border-white/10 space-y-6 md:col-span-2">
                                    <SectionHeader title="界面设置" icon={ScanFace} />
                                    <Field label="颜色主题" description="默认使用白色背景，也可以切换回原版深色主题。设置会自动保存。">
                                        <div className="grid grid-cols-2 gap-4" role="group" aria-label="颜色主题">
                                            {([
                                                { value: 'light', label: '浅色 · 白底' },
                                                { value: 'dark', label: '深色 · 原版' }
                                            ] as const).map(theme => (
                                                <button
                                                    key={theme.value}
                                                    type="button"
                                                    aria-pressed={settings.themeMode === theme.value}
                                                    onClick={() => handleChange('themeMode', theme.value)}
                                                    className={cn(
                                                        "p-4 rounded-xl border text-sm font-bold transition-colors",
                                                        settings.themeMode === theme.value
                                                            ? "bg-brand/10 border-brand text-brand"
                                                            : "bg-black border-white/10 text-zinc-400 hover:border-brand/50"
                                                    )}
                                                >{theme.label}</button>
                                            ))}
                                        </div>
                                    </Field>
                                    <Field label="字体风格" description="选择您喜欢的界面字体风格">
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                            {[
                                                { name: '快乐体 (默认)', value: 'ZCOOL KuaiLe', font: 'ZCOOL KuaiLe' },
                                                { name: '小薇体 (文艺)', value: 'ZCOOL XiaoWei', font: 'ZCOOL XiaoWei' },
                                                { name: '标准黑体', value: 'Inter', font: 'Inter' },
                                                { name: '思源黑体', value: 'Noto Sans SC', font: 'Noto Sans SC' }
                                            ].map((font) => (
                                                <button
                                                    key={font.value}
                                                    onClick={() => handleChange('themeFont', font.value)}
                                                    className={cn(
                                                        "flex flex-col items-center justify-center p-4 rounded-xl border transition-all duration-300 gap-2 hover:scale-[1.02]",
                                                        settings.themeFont === font.value
                                                            ? "bg-white text-black border-white shadow-lg shadow-white/10"
                                                            : "bg-black border-white/10 text-zinc-500 hover:text-white hover:border-white/30"
                                                    )}
                                                >
                                                    <span className="text-xl" style={{ fontFamily: font.font }}>Aa</span>
                                                    <span className="text-[10px] font-bold uppercase tracking-widest">{font.name}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </Field>
                                </Card>

                                {/* Connect & Resources */}
                                <Card className="border-white/10 space-y-6 h-full flex flex-col">
                                    <SectionHeader title={t('system_connect_title')} icon={FileText} />
                                    <div className="flex-1 grid gap-4">
                                        <a href="https://github.com/RechardLLee/thattweet-vite" target="_blank" rel="noreferrer" className="flex items-center gap-4 p-4 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/20 hover:scale-[1.02] transition-all group">
                                            <div className="p-3 rounded-lg bg-black text-white border border-white/10 group-hover:border-white/30">
                                                <Terminal size={20} />
                                            </div>
                                            <div>
                                                <h3 className="text-sm font-bold text-white">GitHub</h3>
                                                <p className="text-xs text-zinc-500 font-mono">RechardLLee/thattweet-vite</p>
                                            </div>
                                        </a>
                                        <a href="#" className="flex items-center gap-4 p-4 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/20 hover:scale-[1.02] transition-all group">
                                            <div className="p-3 rounded-lg bg-black text-white border border-white/10 group-hover:border-white/30">
                                                <FileText size={20} />
                                            </div>
                                            <div>
                                                <h3 className="text-sm font-bold text-white">{t('btn_docs')}</h3>
                                                <p className="text-xs text-zinc-500 font-mono">Documentation (Coming Soon)</p>
                                            </div>
                                        </a>
                                    </div>
                                </Card>

                                {/* Support */}
                                <Card className="border-white/10 space-y-6 h-full flex flex-col">
                                    <SectionHeader title={t('system_sponsor_title')} icon={Heart} />
                                    <div className="flex-1 flex flex-col items-center text-center p-2">
                                        <div className="p-2 bg-white rounded-xl mb-6 shadow-xl max-w-[160px]">
                                            <img src={supportImg} className="w-full h-auto rounded-lg" alt="Support" />
                                        </div>
                                        <p className="text-xs text-zinc-400 leading-relaxed mb-4 px-4">{t('system_sponsor_desc')}</p>
                                        <button className="px-6 py-2 bg-pink-600/10 hover:bg-pink-600/20 text-pink-500 border border-pink-500/20 hover:border-pink-500/50 rounded-full text-[10px] font-black uppercase tracking-widest transition-all">
                                            Sponsor Project
                                        </button>
                                    </div>
                                </Card>
                            </div>
                        </div>
                    )}

                </div>
            </main>
        </div>
    );
};
