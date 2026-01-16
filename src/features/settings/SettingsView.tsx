import React, { useState, useEffect, useRef } from 'react';
import {
    Save,
    Key,
    Cpu,
    RotateCcw,
    CheckCircle,
    AlertCircle,
    Loader2,
    Heart,
    Shield,
    Eye,
    Zap,
    Database,
    Terminal,
    FileText,
    FolderOpen,
    Trash2,
    Plus,
    Check,
    X,
    MessageSquare,
    Search,
    RefreshCw,
    Clock,
    Upload,
    Download,
    Sparkles,
    Settings,
    Activity,
    BookOpen,
    ScanFace
} from 'lucide-react';
import { AISettings, DEFAULT_AI_SETTINGS } from '../../shared/types/settings';
import { useTranslation } from '../../shared/hooks/useTranslation';
import supportImg from '../../assets/img/支持一下.png';
import { cn } from '../../shared/utils/cn';
import { selectBackupDirectory, hasBackupDirectory, BackupResult, importBackupFromFile, ImportResult } from '../../core/backup/backupService';

// ============ Reorganized Types ============
type SettingsGroup = 'ai' | 'advanced' | 'intelligence' | 'automation' | 'system';

// ============ Backup Card Component ============
const BackupCard: React.FC = () => {
    const { t } = useTranslation();
    const [backupStatus, setBackupStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
    const [backupMessage, setBackupMessage] = useState<string>('');
    const [folderName, setFolderName] = useState<string | null>(null);
    const [lastBackupTime, setLastBackupTime] = useState<string | null>(null);

    // Import state
    const [importStatus, setImportStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
    const [importMessage, setImportMessage] = useState<string>('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        hasBackupDirectory().then(status => {
            if (status.configured && status.name) {
                setFolderName(status.name);
            }
        });
    }, []);

    const handleSelectFolder = async () => {
        const result = await selectBackupDirectory();
        if (result.success && result.name) {
            setFolderName(result.name);
            setBackupMessage(t('settings_save_success'));
            setTimeout(() => setBackupMessage(''), 2000);
        }
    };

    const handleBackupNow = () => {
        setBackupStatus('running');
        setBackupMessage('');

        chrome.runtime.sendMessage({ type: 'thattweet-backup-now' }, (response: BackupResult) => {
            if (response?.ok) {
                setBackupStatus('success');
                setBackupMessage(t('settings_verify_success'));
                setLastBackupTime(new Date().toLocaleString());
            } else if (response?.reason === 'no-change') {
                setBackupStatus('idle');
                setBackupMessage(t('settings_waiting'));
            } else if (response?.reason === 'no-handle') {
                setBackupStatus('error');
                setBackupMessage(t('settings_no_folder'));
            } else {
                setBackupStatus('error');
                setBackupMessage(t('settings_verify_failed'));
            }
            setTimeout(() => {
                setBackupStatus('idle');
                setBackupMessage('');
            }, 3000);
        });
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setImportStatus('running');
        try {
            const result = await importBackupFromFile(file);
            if (result.ok) {
                setImportStatus('success');
                setImportMessage(`${t('settings_verify_success')} +${result.imported}`);
            } else {
                setImportStatus('error');
                setImportMessage(result.error || t('settings_verify_failed'));
            }
        } catch (error) {
            setImportStatus('error');
            setImportMessage(String(error));
        }

        if (fileInputRef.current) fileInputRef.current.value = '';
        setTimeout(() => {
            setImportStatus('idle');
            setImportMessage('');
        }, 5000);
    };

    return (
        <div className="bg-white/[0.03] border border-white/10 rounded-3xl p-6 space-y-6 relative overflow-hidden">
            <div className="flex items-center justify-between relative z-10">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-brand/10 text-brand rounded-2xl">
                        <Database size={24} />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-white">{t('settings_section_backup')}</h3>
                        <p className="text-xs text-zinc-500">{t('settings_backup_shield')}</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative z-10">
                <button
                    onClick={handleBackupNow}
                    disabled={backupStatus === 'running' || !folderName}
                    className={cn(
                        "flex flex-col items-center justify-center gap-2 p-6 rounded-2xl border transition-all active:scale-95 group",
                        !folderName
                            ? "bg-zinc-900/50 border-white/5 text-zinc-600 grayscale cursor-not-allowed"
                            : "bg-white/[0.02] border-white/5 hover:border-brand/40 text-brand"
                    )}
                >
                    {backupStatus === 'running' ? <Loader2 size={24} className="animate-spin" /> : <Download size={24} />}
                    <span className="text-xs font-black uppercase tracking-widest">{t('settings_backup_now')}</span>
                </button>

                <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={importStatus === 'running'}
                    className="flex flex-col items-center justify-center gap-2 p-6 bg-white/[0.02] border border-white/5 rounded-2xl hover:border-emerald-500/40 text-emerald-500 transition-all active:scale-95 group"
                >
                    {importStatus === 'running' ? <Loader2 size={24} className="animate-spin" /> : <Upload size={24} />}
                    <span className="text-xs font-black uppercase tracking-widest">{t('settings_import')}</span>
                    <input ref={fileInputRef} type="file" accept=".json" onChange={handleFileChange} className="hidden" />
                </button>
            </div>

            <div className="space-y-4 pt-2 border-t border-white/5">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <FolderOpen size={16} className="text-zinc-500" />
                        <div className="text-xs">
                            <p className="text-zinc-500 uppercase font-black tracking-tighter text-[9px]">{t('settings_backup_folder')}</p>
                            <p className="text-zinc-300 font-bold max-w-[150px] truncate">{folderName || t('settings_no_folder')}</p>
                        </div>
                    </div>
                    <button
                        onClick={handleSelectFolder}
                        className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-[10px] font-bold text-white rounded-lg transition-colors border border-white/5"
                    >
                        {t('settings_select_folder')}
                    </button>
                </div>

                <div className="p-3 bg-black/20 rounded-xl border border-white/5">
                    <p className="text-[10px] text-zinc-500 leading-relaxed font-medium">
                        {t('settings_backup_auto_info')}
                    </p>
                </div>
            </div>
        </div>
    );
};

// ============ Main View Component ============
export const SettingsView: React.FC = () => {
    const { t } = useTranslation();
    const [activeGroup, setActiveGroup] = useState<SettingsGroup>('ai');
    const [settings, setSettings] = useState<AISettings>(DEFAULT_AI_SETTINGS);
    const [status, setStatus] = useState<string>('');
    const [isSaving, setIsSaving] = useState(false);
    const [isValidating, setIsValidating] = useState<string | null>(null);
    const [newTag, setNewTag] = useState('');
    const [availableVLMs, setAvailableVLMs] = useState<string[]>([]);
    const [isFetchingModels, setIsFetchingModels] = useState(false);

    const scrollContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.get(['aiSettings'], (result) => {
                if (result.aiSettings) {
                    setSettings(prev => ({ ...prev, ...result.aiSettings }));
                }
            });
        }
    }, []);

    // Debounced Auto-save
    const isFirstMount = useRef(true);
    const hasLoaded = useRef(false);
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (isFirstMount.current) {
            isFirstMount.current = false;
            return;
        }

        // 避免在数据加载完成前触发保存
        if (!hasLoaded.current) {
            hasLoaded.current = true;
            return;
        }

        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

        saveTimeoutRef.current = setTimeout(() => {
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                chrome.storage.local.set({ aiSettings: settings }, () => {
                    setStatus(t('settings_save_success'));
                    setTimeout(() => setStatus(''), 2000);
                });
            }
        }, 1000);

        return () => {
            if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        };
    }, [settings]);

    const handleChange = (key: keyof AISettings, value: any) => {
        setSettings(prev => ({ ...prev, [key]: value }));
    };

    const handleSave = () => {
        setIsSaving(true);
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.set({ aiSettings: settings }, () => {
                setTimeout(() => {
                    setIsSaving(false);
                    setStatus(t('settings_save_success'));
                    setTimeout(() => setStatus(''), 3000);
                }, 600);
            });
        }
    };

    const handleFetchVLMs = async () => {
        setIsFetchingModels(true);
        setStatus('Fetching available models...');
        try {
            let apiUrl = '';
            let apiKeys: string[] = [];

            if (settings.visionProvider === 'siliconflow') {
                apiUrl = 'https://api.siliconflow.cn/v1/models';
                if (settings.siliconFlowApiKeys && settings.siliconFlowApiKeys.length > 0) {
                    apiKeys = settings.siliconFlowApiKeys;
                } else if (settings.imageKeys && settings.imageKeys.trim()) {
                    apiKeys = settings.imageKeys.split('\n').map(k => k.trim()).filter(Boolean);
                } else if (settings.apiKey) {
                    apiKeys = [settings.apiKey];
                }
            } else {
                apiUrl = 'https://openrouter.ai/api/v1/models';
                if (settings.visionApiKeyOpenRouter) {
                    apiKeys = [settings.visionApiKeyOpenRouter];
                } else if (settings.apiKey && (settings.apiKey.startsWith('sk-or') || settings.baseUrl.includes('openrouter'))) {
                    apiKeys = [settings.apiKey];
                }
            }

            console.log(`[Settings] Fetching ${settings.visionProvider} models with key count:`, apiKeys.length);

            if (apiKeys.length === 0) {
                setStatus('No API key configured for the selected provider.');
                return;
            }

            const response = await fetch(apiUrl, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${apiKeys[0]}`,
                    'HTTP-Referer': 'https://github.com/RechardLLee/thattweet-vite',
                    'X-Title': 'ThatTweet'
                }
            });

            if (!response.ok) {
                setStatus(`Failed to fetch models: ${response.status}`);
                return;
            }

            const data = await response.json();
            const models = data.data || [];

            const vlmModels = models
                .filter((m: any) => {
                    const id = m.id.toLowerCase();

                    // 如果是 OpenRouter，只筛选带有 ':free' 的模型
                    if (settings.visionProvider === 'openrouter') {
                        return id.includes(':free');
                    }

                    // SiliconFlow 默认显示全部模型
                    return true;
                })
                .map((m: any) => m.id);

            setAvailableVLMs(vlmModels);
            setStatus(`Found ${vlmModels.length} VLM models`);
        } catch (err: any) {
            setStatus(`Error: ${err.message}`);
        } finally {
            setIsFetchingModels(false);
            setTimeout(() => setStatus(''), 5000);
        }
    };

    const handleVerifyKey = async (type: 'api' | 'vision' | 'chat' | 'rag') => {
        setIsValidating(type);
        setStatus(t('settings_verifying'));

        let apiKey = '';
        let baseUrl = '';
        let model = '';

        if (type === 'api') {
            apiKey = settings.apiKey;
            baseUrl = settings.baseUrl;
            model = settings.model;
        } else if (type === 'chat') {
            apiKey = settings.chatApiKey || settings.apiKey;
            baseUrl = settings.chatBaseUrl || settings.baseUrl;
            model = settings.chatModel || settings.model;
        } else if (type === 'vision') {
            if (settings.visionProvider === 'siliconflow') {
                const apiKeys = settings.siliconFlowApiKeys.length > 0
                    ? settings.siliconFlowApiKeys
                    : (settings.imageKeys.trim() ? settings.imageKeys.split('\n').map(k => k.trim()).filter(Boolean) : []);

                apiKey = apiKeys[0] || settings.apiKey;
                baseUrl = 'https://api.siliconflow.cn/v1';
            } else {
                apiKey = settings.visionApiKeyOpenRouter || (settings.apiKey?.startsWith('sk-or') ? settings.apiKey : '');
                baseUrl = 'https://openrouter.ai/api/v1';
            }
            model = settings.visionModel;
        } else if (type === 'rag') {
            apiKey = settings.ragApiKey;
            baseUrl = settings.embeddingUrl;
        }

        if (!apiKey) {
            setIsValidating(null);
            setStatus(t('settings_no_key'));
            return;
        }

        try {
            const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    'X-Title': 'ThatTweet'
                },
                body: JSON.stringify({
                    model: model || 'xiaomi/mimo-v2-flash:free',
                    messages: [{ role: 'user', content: 'hi' }],
                    max_tokens: 5
                })
            });

            if (response.ok) {
                setStatus(t('settings_verify_success'));
            } else {
                const err = await response.json();
                setStatus(`${t('settings_verify_failed')}: ${err.error?.message || response.statusText}`);
            }
        } catch (error) {
            setStatus(t('settings_verify_error'));
        } finally {
            setIsValidating(null);
            setTimeout(() => setStatus(''), 3000);
        }
    };

    const groups = [
        { id: 'ai', icon: Shield, label: t('settings_group_ai'), sublabel: 'Connections & Models' },
        { id: 'advanced', icon: Zap, label: t('settings_group_advanced'), sublabel: 'Vision & Knowledge' },
        { id: 'intelligence', icon: Activity, label: t('settings_group_intelligence'), sublabel: 'Prompts & Rules' },
        { id: 'automation', icon: Terminal, label: t('settings_group_workflow'), sublabel: 'Automation & Tags' },
        { id: 'system', icon: Settings, label: t('settings_group_system'), sublabel: 'Data & Maintenance' },
    ];

    const Card = ({ children, title, icon: Icon, description }: any) => (
        <section className="bg-white/[0.02] border border-white/[0.05] rounded-[32px] p-8 space-y-8 relative overflow-hidden group/card hover:bg-white/[0.03] transition-all duration-500">
            <div className="absolute top-0 right-0 p-8 text-white/[0.02] pointer-events-none group-hover/card:text-white/[0.04] transition-colors duration-700">
                {Icon && <Icon size={120} strokeWidth={1} />}
            </div>
            <div className="relative z-10">
                <div className="flex items-center gap-3 mb-2">
                    {Icon && <div className="p-2 bg-brand/10 rounded-xl text-brand"><Icon size={20} /></div>}
                    <h3 className="text-xl font-bold text-white tracking-tight">{title}</h3>
                </div>
                {description && <p className="text-xs text-zinc-500 font-medium mb-8 max-w-lg leading-relaxed">{description}</p>}
                <div className="space-y-6">
                    {children}
                </div>
            </div>
        </section>
    );

    const Field = ({ label, description, children }: any) => (
        <div className="space-y-2 group/field">
            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block group-focus-within/field:text-brand transition-colors">
                {label}
            </label>
            {children}
            {description && <p className="text-[10px] text-zinc-600 font-medium italic">{description}</p>}
        </div>
    );

    return (
        <div className="flex h-full bg-[#050505]">
            {/* Elegant Sidebar */}
            <aside className="w-[300px] border-r border-white/5 flex flex-col bg-[#080808]">
                <div className="p-10">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-8 h-8 rounded-lg bg-brand flex items-center justify-center shadow-lg shadow-brand/20">
                            <Sparkles size={18} className="text-white" />
                        </div>
                        <h1 className="text-lg font-black text-white tracking-tighter">{t('settings_lab')}</h1>
                    </div>
                    <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-[0.2em]">{t('settings_sys_config')}</p>
                </div>

                <nav className="flex-1 px-4 space-y-1.5">
                    {groups.map((group) => (
                        <button
                            key={group.id}
                            onClick={() => setActiveGroup(group.id as SettingsGroup)}
                            className={cn(
                                "w-full flex items-center gap-4 px-6 py-4 rounded-2xl transition-all duration-300 group",
                                activeGroup === group.id
                                    ? "bg-white/[0.04] text-white border border-white/10 shadow-xl shadow-black/40"
                                    : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.01]"
                            )}
                        >
                            <group.icon size={20} className={cn(
                                "transition-colors duration-300",
                                activeGroup === group.id ? "text-brand" : "text-zinc-600 group-hover:text-zinc-400"
                            )} />
                            <div className="text-left">
                                <p className="text-sm font-bold tracking-tight">{group.label}</p>
                                <p className="text-[9px] font-medium opacity-40 uppercase tracking-wider">{group.sublabel}</p>
                            </div>
                            {activeGroup === group.id && (
                                <div className="ml-auto w-1 h-1 rounded-full bg-brand shadow-[0_0_8px_var(--brand)]" />
                            )}
                        </button>
                    ))}
                </nav>

                <div className="p-6">
                    <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-[9px] font-black text-zinc-600 uppercase tracking-widest">{t('settings_save_status')}</span>
                            <div className={cn("w-1.5 h-1.5 rounded-full", status ? "bg-emerald-500 animate-pulse" : "bg-zinc-800")} />
                        </div>
                        <p className="text-[10px] text-zinc-500 font-bold truncate leading-none">
                            {status || t('settings_waiting')}
                        </p>
                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className="w-full flex items-center justify-center gap-2 py-2.5 bg-brand hover:bg-brand-hover text-white rounded-xl text-xs font-black transition-all active:scale-95 disabled:opacity-50 shadow-lg shadow-brand/10 mt-2"
                        >
                            {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                            {t('settings_save')}
                        </button>
                    </div>
                </div>
            </aside>

            {/* Content Area */}
            <main className="flex-1 overflow-y-auto no-scrollbar" ref={scrollContainerRef}>
                <div className="max-w-4xl mx-auto px-12 py-16 space-y-12 pb-40">

                    {/* GROUP 1: AI CORE */}
                    {activeGroup === 'ai' && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <Card title={t('settings_section_api')} icon={Cpu} description={t('settings_api_key_desc')}>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <Field label={t('settings_api_key')}>
                                        <div className="relative flex gap-2">
                                            <div className="relative flex-1 group/field">
                                                <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 group-focus-within/field:text-brand transition-colors" size={14} />
                                                <input
                                                    type="password"
                                                    value={settings.apiKey}
                                                    onChange={e => handleChange('apiKey', e.target.value)}
                                                    className="w-full bg-black/40 border border-white/5 rounded-xl pl-9 pr-4 py-3 text-sm font-mono text-white focus:border-brand/40 outline-none transition-all"
                                                    placeholder="sk-..."
                                                />
                                            </div>
                                            <button
                                                onClick={() => handleVerifyKey('api')}
                                                disabled={isValidating !== null}
                                                className="px-4 py-3 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl border border-white/5 transition-all flex items-center gap-2 active:scale-95"
                                            >
                                                {isValidating === 'api' ? <Loader2 size={14} className="animate-spin" /> : <Terminal size={14} />}
                                            </button>
                                        </div>
                                    </Field>
                                    <Field label={t('settings_model')} description={t('settings_model_desc')}>
                                        <input
                                            type="text"
                                            value={settings.model}
                                            onChange={e => handleChange('model', e.target.value)}
                                            className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-sm font-mono text-white focus:border-brand/40 outline-none transition-all"
                                        />
                                    </Field>
                                </div>
                                <Field label={t('settings_api_url')}>
                                    <input
                                        type="text"
                                        value={settings.baseUrl}
                                        onChange={e => handleChange('baseUrl', e.target.value)}
                                        className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-sm font-mono text-white focus:border-brand/40 outline-none transition-all"
                                    />
                                </Field>
                            </Card>
                        </div>
                    )}

                    {/* GROUP 2: ADVANCED (Vision & RAG) */}
                    {activeGroup === 'advanced' && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <Card title={t('settings_section_vision')} icon={Eye} description={t('settings_vision_keys_desc')}>
                                {/* Provider Selection */}
                                <Field label={t('settings_vision_provider')}>
                                    <div className="flex gap-2">
                                        {(['siliconflow', 'openrouter'] as const).map(p => (
                                            <button
                                                key={p}
                                                onClick={() => handleChange('visionProvider', p)}
                                                className={cn(
                                                    "flex-1 py-3 rounded-xl text-xs font-bold border transition-all uppercase tracking-widest",
                                                    settings.visionProvider === p ? "bg-brand/10 border-brand/40 text-brand" : "bg-white/5 border-white/5 text-zinc-500"
                                                )}
                                            >
                                                {p === 'siliconflow' ? 'SiliconFlow' : 'OpenRouter'}
                                            </button>
                                        ))}
                                    </div>
                                </Field>

                                {settings.visionProvider === 'siliconflow' ? (
                                    <Field label={t('settings_vision_keys')} description={t('settings_vision_multi_line')}>
                                        <textarea
                                            rows={3}
                                            value={settings.imageKeys}
                                            onChange={e => handleChange('imageKeys', e.target.value)}
                                            className="w-full bg-black/40 border border-white/5 rounded-2xl px-4 py-3 text-sm font-mono text-white focus:border-brand/40 outline-none transition-all resize-none no-scrollbar"
                                            placeholder="sk-..."
                                        />
                                    </Field>
                                ) : (
                                    <Field label={t('settings_openrouter_key')} description={t('settings_openrouter_key_desc')}>
                                        <input
                                            type="password"
                                            value={settings.visionApiKeyOpenRouter}
                                            onChange={e => handleChange('visionApiKeyOpenRouter', e.target.value)}
                                            className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-sm font-mono text-white focus:border-brand/40 outline-none transition-all"
                                            placeholder={settings.apiKey?.startsWith('sk-or') ? "Using Global Key (OpenRouter Detected)" : "sk-or-..."}
                                        />
                                    </Field>
                                )}

                                <div className="grid grid-cols-2 gap-4">
                                    <div onClick={() => handleChange('ocrEnabled', !settings.ocrEnabled)} className={cn(
                                        "p-4 rounded-2xl border cursor-pointer transition-all",
                                        settings.ocrEnabled ? "bg-brand/5 border-brand/20" : "bg-white/[0.01] border-white/5 text-zinc-600"
                                    )}>
                                        <div className="flex items-center justify-between mb-2">
                                            <FileText size={18} className={settings.ocrEnabled ? "text-brand" : "text-zinc-600"} />
                                            <div className={cn("w-8 h-4 rounded-full relative", settings.ocrEnabled ? "bg-brand" : "bg-zinc-800")}>
                                                <div className={cn("absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all", settings.ocrEnabled ? "left-4.5" : "left-0.5")} />
                                            </div>
                                        </div>
                                        <p className="text-xs font-black uppercase tracking-tight">{t('settings_ocr_enable')}</p>
                                    </div>
                                    <div onClick={() => handleChange('visionEnabled', !settings.visionEnabled)} className={cn(
                                        "p-4 rounded-2xl border cursor-pointer transition-all",
                                        settings.visionEnabled ? "bg-emerald-500/5 border-emerald-500/20" : "bg-white/[0.01] border-white/5 text-zinc-600"
                                    )}>
                                        <div className="flex items-center justify-between mb-2">
                                            <Eye size={18} className={settings.visionEnabled ? "text-emerald-500" : "text-zinc-600"} />
                                            <div className={cn("w-8 h-4 rounded-full relative", settings.visionEnabled ? "bg-emerald-500" : "bg-zinc-800")}>
                                                <div className={cn("absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all", settings.visionEnabled ? "left-4.5" : "left-0.5")} />
                                            </div>
                                        </div>
                                        <p className="text-xs font-black uppercase tracking-tight">{t('settings_vision_enable')}</p>
                                    </div>
                                </div>

                                <div className="space-y-4 pt-4 border-t border-white/5">
                                    <Field label="Vision Model" description={`${settings.visionProvider === 'siliconflow' ? 'SiliconFlow' : 'OpenRouter'} Multi-modal Model Name`}>
                                        <div className="flex gap-2">
                                            {availableVLMs.length > 0 ? (
                                                <select
                                                    value={settings.visionModel}
                                                    onChange={e => handleChange('visionModel', e.target.value)}
                                                    className="flex-1 bg-zinc-900 border border-white/10 rounded-xl px-4 py-2.5 text-xs font-mono text-white focus:border-brand/40 outline-none transition-all cursor-pointer"
                                                    style={{ colorScheme: 'dark' }}
                                                >
                                                    <option value="" className="bg-zinc-900 text-zinc-400">Select a model...</option>
                                                    {availableVLMs.map(m => (
                                                        <option key={m} value={m} className="bg-zinc-900 text-white">{m}</option>
                                                    ))}
                                                </select>
                                            ) : (
                                                <input
                                                    type="text"
                                                    value={settings.visionModel}
                                                    onChange={e => handleChange('visionModel', e.target.value)}
                                                    placeholder={settings.visionProvider === 'siliconflow' ? "e.g. Qwen/Qwen2-VL-7B-Instruct" : "e.g. google/gemini-pro-1.5-exp"}
                                                    className="flex-1 bg-black/40 border border-white/5 rounded-xl px-4 py-2.5 text-xs font-mono text-white focus:border-brand/40 outline-none transition-all"
                                                />
                                            )}
                                            <button
                                                onClick={handleFetchVLMs}
                                                disabled={isFetchingModels}
                                                className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl border border-white/10 transition-all flex items-center gap-1.5 active:scale-95"
                                            >
                                                {isFetchingModels ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                                                <span className="text-[10px] font-bold">Fetch</span>
                                            </button>
                                        </div>
                                    </Field>

                                    <div className="grid grid-cols-2 gap-4">
                                        <Field label="Max Images / Tweet">
                                            <input
                                                type="number"
                                                value={settings.maxImagesPerTweet}
                                                onChange={e => handleChange('maxImagesPerTweet', parseInt(e.target.value))}
                                                className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-2.5 text-xs font-mono text-white"
                                            />
                                        </Field>
                                        <Field label="Batch Size (Tweets)">
                                            <input
                                                type="number"
                                                value={settings.visionBatchSize}
                                                onChange={e => handleChange('visionBatchSize', parseInt(e.target.value))}
                                                className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-2.5 text-xs font-mono text-white"
                                            />
                                        </Field>
                                    </div>

                                    <Field label="Processing Scope">
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => handleChange('visionEnabledAt', 0)}
                                                className={cn(
                                                    "flex-1 py-2 rounded-xl text-[10px] font-bold border transition-all",
                                                    settings.visionEnabledAt === 0 ? "bg-brand/10 border-brand/40 text-brand" : "bg-white/5 border-white/5 text-zinc-500"
                                                )}
                                            >
                                                Process All History
                                            </button>
                                            <button
                                                onClick={() => handleChange('visionEnabledAt', Date.now())}
                                                className={cn(
                                                    "flex-1 py-2 rounded-xl text-[10px] font-bold border transition-all",
                                                    settings.visionEnabledAt > 0 ? "bg-brand/10 border-brand/40 text-brand" : "bg-white/5 border-white/5 text-zinc-500"
                                                )}
                                            >
                                                Only New Tweets
                                            </button>
                                        </div>
                                    </Field>
                                </div>
                            </Card>

                            <Card title={t('settings_section_rag')} icon={Search} description={t('settings_rag_desc')}>
                                <div className="flex items-center justify-between p-4 bg-white/[0.02] border border-white/5 rounded-2xl mb-6">
                                    <div className="flex items-center gap-3">
                                        <div className={cn("p-2 rounded-xl", settings.ragEnabled ? "bg-blue-500/10 text-blue-500" : "bg-zinc-900 text-zinc-600")}>
                                            <Database size={18} />
                                        </div>
                                        <span className="text-sm font-bold text-white uppercase">{t('settings_rag_enable')}</span>
                                    </div>
                                    <div onClick={() => handleChange('ragEnabled', !settings.ragEnabled)} className={cn("w-10 h-5 rounded-full relative cursor-pointer", settings.ragEnabled ? "bg-blue-500" : "bg-zinc-800")}>
                                        <div className={cn("absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all", settings.ragEnabled ? "left-5.5" : "left-0.5")} />
                                    </div>
                                </div>
                                {settings.ragEnabled && (
                                    <div className="space-y-6 animate-in zoom-in-95 duration-300">
                                        <Field label={t('settings_embedding')}>
                                            <input type="text" value={settings.embeddingModel} onChange={e => handleChange('embeddingModel', e.target.value)} className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-sm font-mono text-white mb-2" />
                                            <input type="text" value={settings.embeddingUrl} onChange={e => handleChange('embeddingUrl', e.target.value)} className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-sm font-mono text-white" />
                                        </Field>
                                        <Field label={t('settings_reranker')}>
                                            <input type="text" value={settings.rerankerModel} onChange={e => handleChange('rerankerModel', e.target.value)} className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-sm font-mono text-white mb-2" />
                                            <input type="text" value={settings.rerankerUrl} onChange={e => handleChange('rerankerUrl', e.target.value)} className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-sm font-mono text-white" />
                                        </Field>
                                    </div>
                                )}
                            </Card>
                        </div>
                    )}

                    {/* GROUP 3: INTELLIGENCE */}
                    {activeGroup === 'intelligence' && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <Card title={t('settings_section_chat')} icon={MessageSquare} description={t('settings_chat_optional_fallback')}>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <Field label={t('settings_api_key')}>
                                        <input
                                            type="password"
                                            value={settings.chatApiKey}
                                            onChange={e => handleChange('chatApiKey', e.target.value)}
                                            className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-sm font-mono text-white focus:border-brand/40 outline-none transition-all"
                                        />
                                    </Field>
                                    <Field label={t('settings_model')}>
                                        <input
                                            type="text"
                                            value={settings.chatModel}
                                            onChange={e => handleChange('chatModel', e.target.value)}
                                            className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-sm font-mono text-white focus:border-brand/40 outline-none transition-all"
                                        />
                                    </Field>
                                </div>
                            </Card>

                            <Card title={t('settings_section_prompts')} icon={FileText}>
                                <Field label={t('settings_ai_style_focus')} description={t('settings_ai_style_focus_desc')}>
                                    <input
                                        type="text"
                                        value={settings.aiStyleFocus}
                                        onChange={e => handleChange('aiStyleFocus', e.target.value)}
                                        className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-sm font-medium text-zinc-300 focus:border-brand/40 outline-none transition-all"
                                        placeholder="e.g. 技术干货、灵感采集、深度见解..."
                                    />
                                </Field>
                                <Field label={t('settings_prompt_analysis')} description={t('settings_prompt_analysis_desc')}>
                                    <textarea
                                        rows={6}
                                        value={settings.promptAnalysis}
                                        onChange={e => handleChange('promptAnalysis', e.target.value)}
                                        className="w-full bg-black/40 border border-white/5 rounded-2xl px-4 py-3 text-xs font-medium text-zinc-400 focus:border-brand/40 outline-none transition-all resize-none no-scrollbar"
                                    />
                                </Field>
                                <Field label={t('settings_prompt_vision')} description={t('settings_prompt_vision_desc')}>
                                    <textarea
                                        rows={6}
                                        value={settings.promptVision}
                                        onChange={e => handleChange('promptVision', e.target.value)}
                                        className="w-full bg-black/40 border border-white/5 rounded-2xl px-4 py-3 text-xs font-medium text-zinc-400 focus:border-brand/40 outline-none transition-all resize-none no-scrollbar"
                                    />
                                </Field>
                                <Field label={t('settings_prompt_summary')} description={t('settings_prompt_summary_desc')}>
                                    <textarea
                                        rows={4}
                                        value={settings.promptSummary}
                                        onChange={e => handleChange('promptSummary', e.target.value)}
                                        className="w-full bg-black/40 border border-white/5 rounded-2xl px-4 py-3 text-xs font-medium text-zinc-400 focus:border-brand/40 outline-none transition-all resize-none no-scrollbar"
                                    />
                                </Field>
                                <Field label="Profile Prompt" description={t('settings_prompt_profile_desc')}>
                                    <textarea
                                        rows={6}
                                        value={settings.promptProfile}
                                        onChange={e => handleChange('promptProfile', e.target.value)}
                                        className="w-full bg-black/40 border border-white/5 rounded-2xl px-4 py-3 text-xs font-medium text-zinc-400 focus:border-brand/40 outline-none transition-all resize-none no-scrollbar"
                                    />
                                </Field>
                            </Card>

                            <Card title="AI Profile Engine" icon={ScanFace} description="Configure dedicated API settings for generating Author Profiles. Leave Key empty to use default Chat settings.">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <Field label="API Key (Optional)">
                                        <input
                                            type="password"
                                            value={settings.profileApiKey}
                                            onChange={e => handleChange('profileApiKey', e.target.value)}
                                            className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-sm font-mono text-white focus:border-brand/40 outline-none transition-all"
                                            placeholder="Leave empty to use Chat Key"
                                        />
                                    </Field>
                                    <Field label="Model Name">
                                        <input
                                            type="text"
                                            value={settings.profileModel}
                                            onChange={e => handleChange('profileModel', e.target.value)}
                                            className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-sm font-mono text-white focus:border-brand/40 outline-none transition-all"
                                            placeholder="mistralai/mistral-7b-instruct:free"
                                        />
                                    </Field>
                                </div>
                                <Field label="Base URL">
                                    <input
                                        type="text"
                                        value={settings.profileBaseUrl}
                                        onChange={e => handleChange('profileBaseUrl', e.target.value)}
                                        className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-sm font-mono text-white focus:border-brand/40 outline-none transition-all"
                                        placeholder="https://openrouter.ai/api/v1"
                                    />
                                </Field>
                            </Card>
                        </div>
                    )}

                    {/* GROUP 4: AUTOMATION */}
                    {activeGroup === 'automation' && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <Card title={t('settings_section_automation')} icon={Zap} description={t('settings_automation_auto_desc')}>
                                <div className="flex items-center justify-between p-6 bg-white/[0.02] border border-white/10 rounded-3xl hover:bg-white/[0.04] transition-all">
                                    <div className="flex items-center gap-4">
                                        <div className={cn("p-3 rounded-2xl", settings.autoAnalyze ? "bg-brand/10 text-brand" : "bg-zinc-900 text-zinc-600")}>
                                            <RefreshCw size={24} className={settings.autoAnalyze ? "animate-spin-slow" : ""} />
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-white uppercase">{t('settings_automation_auto')}</p>
                                            <p className="text-[10px] text-zinc-500">{t('settings_automation_auto_desc')}</p>
                                        </div>
                                    </div>
                                    <div onClick={() => handleChange('autoAnalyze', !settings.autoAnalyze)} className={cn("w-12 h-6 rounded-full relative cursor-pointer", settings.autoAnalyze ? "bg-brand" : "bg-zinc-800")}>
                                        <div className={cn("absolute top-1 w-4 h-4 bg-white rounded-full transition-all", settings.autoAnalyze ? "left-7" : "left-1")} />
                                    </div>
                                </div>

                                <div className="mt-8 pt-6 border-t border-white/5">
                                    <Field label={t('settings_batch_process_size')} description={t('settings_batch_process_size_desc')}>
                                        <div className="flex items-center gap-6 mt-2">
                                            <input
                                                type="range"
                                                min="1"
                                                max="50"
                                                step="1"
                                                value={settings.batchSize}
                                                onChange={e => handleChange('batchSize', parseInt(e.target.value))}
                                                className="flex-1 accent-brand h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
                                            />
                                            <div className="min-w-[48px] h-10 bg-brand/10 border border-brand/20 rounded-xl flex items-center justify-center font-mono font-bold text-brand shadow-lg shadow-brand/5">
                                                {settings.batchSize}
                                            </div>
                                        </div>
                                    </Field>
                                </div>
                            </Card>

                            <Card title={t('settings_categories')} icon={BookOpen} description={t('settings_categories_desc')}>
                                <div className="flex flex-wrap gap-2 p-6 bg-black/20 border border-white/5 rounded-3xl min-h-[140px]">
                                    {settings.categories.map((tag) => (
                                        <div key={tag} className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 border border-white/5 rounded-xl text-xs font-bold text-zinc-300 hover:border-brand/40 hover:bg-zinc-800 transition-all group/tag">
                                            <span>{tag}</span>
                                            <button onClick={() => handleChange('categories', settings.categories.filter(t => t !== tag))} className="text-zinc-700 hover:text-rose-500 transition-colors">
                                                <X size={14} />
                                            </button>
                                        </div>
                                    ))}
                                    <div className="inline-flex items-center relative ml-2">
                                        <input
                                            type="text"
                                            value={newTag}
                                            onChange={e => setNewTag(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && (() => {
                                                if (newTag.trim()) {
                                                    handleChange('categories', [...settings.categories, newTag.trim()]);
                                                    setNewTag('');
                                                }
                                            })()}
                                            placeholder={t('settings_new_category')}
                                            className="bg-transparent border-none text-xs font-bold text-brand focus:ring-0 w-28 outline-none placeholder:text-zinc-700"
                                        />
                                        <Plus size={14} className="text-brand opacity-40" />
                                    </div>
                                </div>
                            </Card>
                        </div>
                    )}

                    {/* GROUP 5: SYSTEM */}
                    {activeGroup === 'system' && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <BackupCard />

                            <Card title={t('settings_support_title')} icon={Heart}>
                                <div className="flex flex-col md:flex-row items-center gap-8 bg-brand/5 border border-brand/10 p-8 rounded-3xl">
                                    <div className="w-32 h-32 shrink-0 rounded-2xl overflow-hidden shadow-2xl shadow-brand/20">
                                        <img src={supportImg} alt="Support" className="w-full h-full object-cover" />
                                    </div>
                                    <div className="space-y-4">
                                        <h4 className="text-lg font-bold text-white">{t('settings_support_title')}</h4>
                                        <p className="text-xs text-zinc-400 leading-relaxed font-medium">{t('settings_support_subtitle')}</p>
                                        <div className="flex items-center gap-2 p-2 bg-white/[0.04] rounded-xl border border-white/5 w-fit">
                                            <div className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" />
                                            <span className="text-[10px] font-black text-brand uppercase tracking-widest">v1.1.0 Experimental</span>
                                        </div>
                                    </div>
                                </div>
                            </Card>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};
