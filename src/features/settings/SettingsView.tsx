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
    RefreshCw
} from 'lucide-react';
import { AISettings, DEFAULT_AI_SETTINGS } from '../../shared/types/settings';
import { useTranslation } from '../../shared/hooks/useTranslation';
import supportImg from '../../assets/img/支持一下.png';
import { cn } from '../../shared/utils/cn';

type SettingsSection = 'api' | 'vision' | 'chat' | 'rag' | 'workflow' | 'backup' | 'prompts';

export const SettingsView: React.FC = () => {
    const { t } = useTranslation();
    const [activeSection, setActiveSection] = useState<SettingsSection>('api');
    const [settings, setSettings] = useState<AISettings>(DEFAULT_AI_SETTINGS);
    const [status, setStatus] = useState<string>('');
    const [isSaving, setIsSaving] = useState(false);
    const [isValidating, setIsValidating] = useState<string | null>(null); // section name or null
    const [newTag, setNewTag] = useState('');

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

    const handleResetPrompt = (key: 'promptAnalysis' | 'promptSummary') => {
        handleChange(key, DEFAULT_AI_SETTINGS[key]);
    };

    const addTag = () => {
        if (newTag.trim() && !settings.categories.includes(newTag.trim())) {
            handleChange('categories', [...settings.categories, newTag.trim()]);
            setNewTag('');
        }
    };

    const removeTag = (tag: string) => {
        handleChange('categories', settings.categories.filter(t => t !== tag));
    };

    const handleVerifyKey = async (section: 'api' | 'vision' | 'chat' | 'rag') => {
        setIsValidating(section);
        setStatus(t('settings_verifying') || 'Verifying...');

        let apiKey = '';
        let baseUrl = '';
        let model = '';

        if (section === 'api') {
            apiKey = settings.apiKey;
            baseUrl = settings.baseUrl;
            model = settings.model;
        } else if (section === 'chat') {
            apiKey = settings.chatApiKey || settings.apiKey;
            baseUrl = settings.chatBaseUrl || settings.baseUrl;
            model = settings.chatModel || settings.model;
        } else if (section === 'vision') {
            // 取第一行非空密钥测试
            apiKey = settings.imageKeys.split('\n').map(k => k.trim()).filter(Boolean)[0] || '';
            baseUrl = 'https://api.siliconflow.cn/v1'; // 默认硅基流动
            model = 'google/gemini-2.0-flash-exp'; // 默认测试模型
        } else if (section === 'rag') {
            apiKey = settings.ragApiKey;
            baseUrl = settings.embeddingUrl; // 简单测试地址
        }

        if (!apiKey) {
            setIsValidating(null);
            setStatus(t('settings_no_key') || 'No key provided');
            return;
        }

        try {
            const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    'HTTP-Referer': 'https://github.com/RechardLLee/thattweet-vite',
                    'X-Title': 'ThatTweet'
                },
                body: JSON.stringify({
                    model: model || 'xiaomi/mimo-v2-flash:free',
                    messages: [{ role: 'user', content: 'Say hi' }],
                    max_tokens: 5,
                    temperature: 0.1
                })
            });

            if (response.ok) {
                setStatus(t('settings_verify_success') || 'Verification Success');
            } else {
                const err = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
                const errMsg = err.error?.message || response.statusText;
                console.error('Verify failed:', err);
                setStatus(`${t('settings_verify_failed') || 'Failed'}: ${errMsg}`);
            }
        } catch (error) {
            console.error('Verify error:', error);
            setStatus(t('settings_verify_error') || 'Network Error');
        } finally {
            setIsValidating(null);
            setTimeout(() => setStatus(''), 3000);
        }
    };

    const sidebarItems = [
        { id: 'api', icon: Shield, label: t('settings_section_api') },
        { id: 'vision', icon: Eye, label: t('settings_section_vision') },
        { id: 'chat', icon: MessageSquare, label: t('settings_section_chat') },
        { id: 'rag', icon: Search, label: t('settings_section_rag') },
        { id: 'workflow', icon: Zap, label: t('settings_section_automation') },
        { id: 'backup', icon: Database, label: t('settings_section_backup') },
        { id: 'prompts', icon: FileText, label: t('settings_section_prompts') },
    ];

    const InputGroup = ({ label, description, children, error }: any) => (
        <div className="space-y-2 mb-8 group/input">
            <div className="flex flex-col">
                <label className="text-sm font-bold text-zinc-100 uppercase tracking-tight flex items-center gap-2 group-focus-within/input:text-brand transition-colors">
                    {label}
                </label>
                {description && <p className="text-[11px] text-zinc-500 font-medium mb-2">{description}</p>}
            </div>
            {children}
            {error && <p className="text-xs text-rose-500 font-medium">{error}</p>}
        </div>
    );

    const SectionHeader = ({ title }: { title: string }) => (
        <h2 className="text-xl font-black text-white mb-10 tracking-tight flex items-center gap-3">
            <div className="w-1.5 h-6 bg-brand rounded-full" />
            {title}
        </h2>
    );

    return (
        <div className="flex h-screen bg-[#0a0a0a] overflow-hidden">
            {/* Left Navigation */}
            <aside className="w-64 border-r border-white/[0.05] flex flex-col p-4 bg-[#0d0d0d]">
                <div className="px-4 py-8 mb-4">
                    <h1 className="text-xs font-black text-zinc-500 uppercase tracking-[0.2em] mb-1">{t('settings_lab')}</h1>
                    <p className="text-[10px] text-zinc-600 font-medium uppercase">{t('settings_sys_config')}</p>
                </div>

                <nav className="flex-1 space-y-1">
                    {sidebarItems.map((item) => (
                        <button
                            key={item.id}
                            onClick={() => setActiveSection(item.id as SettingsSection)}
                            className={cn(
                                "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all duration-200 group",
                                activeSection === item.id
                                    ? "bg-white/[0.03] text-white border border-white/10"
                                    : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.02]"
                            )}
                        >
                            <item.icon size={18} className={cn(
                                "transition-colors",
                                activeSection === item.id ? "text-brand" : "text-zinc-600 group-hover:text-zinc-400"
                            )} />
                            <span>{item.label}</span>
                            {activeSection === item.id && (
                                <div className="ml-auto w-1 h-1 rounded-full bg-brand shadow-[0_0_8px_var(--brand)]" />
                            )}
                        </button>
                    ))}
                </nav>

                {/* Status Bar */}
                <div className="mt-auto p-4 rounded-2xl bg-white/[0.02] border border-white/[0.05]">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold text-zinc-500 uppercase">{t('settings_save_status')}</span>
                        <div className={cn("w-2 h-2 rounded-full", status ? "bg-emerald-500 animate-pulse" : "bg-zinc-700")} />
                    </div>
                    <p className="text-[10px] text-zinc-600 font-medium truncate">
                        {status || t('settings_waiting')}
                    </p>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 overflow-y-auto no-scrollbar relative" ref={scrollContainerRef}>
                <div className="max-w-3xl mx-auto px-12 py-16 pb-40">

                    {/* API Configuration */}
                    {activeSection === 'api' && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <SectionHeader title={sidebarItems[0].label} />

                            <InputGroup label={t('settings_api_key')} description={t('settings_api_key_desc')}>
                                <div className="relative flex gap-2">
                                    <div className="relative flex-1 group/field">
                                        <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 group-focus-within/field:text-brand transition-colors" size={16} />
                                        <input
                                            type="password"
                                            value={settings.apiKey}
                                            onChange={e => handleChange('apiKey', e.target.value)}
                                            placeholder="sk-..."
                                            className="w-full bg-zinc-900/50 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm font-mono text-white focus:border-brand/40 focus:bg-zinc-900 transition-all outline-none"
                                        />
                                    </div>
                                    <button
                                        onClick={() => handleVerifyKey('api')}
                                        disabled={isValidating !== null}
                                        className="px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-xs font-bold border border-white/10 transition-all flex items-center gap-2 active:scale-95 disabled:opacity-50"
                                    >
                                        {isValidating === 'api' ? <Loader2 size={14} className="animate-spin" /> : <Terminal size={14} />}
                                        {t('settings_verify')}
                                    </button>
                                </div>
                            </InputGroup>

                            <InputGroup label={t('settings_api_url')} description={t('settings_api_url_desc')}>
                                <input
                                    type="text"
                                    value={settings.baseUrl}
                                    onChange={e => handleChange('baseUrl', e.target.value)}
                                    placeholder="https://"
                                    className="w-full bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-3 text-sm font-mono text-white focus:border-brand/40 focus:bg-zinc-900 transition-all outline-none"
                                />
                            </InputGroup>

                            <InputGroup label={t('settings_model')} description={t('settings_model_desc')}>
                                <input
                                    type="text"
                                    value={settings.model}
                                    onChange={e => handleChange('model', e.target.value)}
                                    placeholder="deepseek-chat"
                                    className="w-full bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-3 text-sm font-mono text-white focus:border-brand/40 focus:bg-zinc-900 transition-all outline-none"
                                />
                            </InputGroup>
                        </div>
                    )}

                    {/* Image Recognition */}
                    {activeSection === 'vision' && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <SectionHeader title={sidebarItems[1].label} />

                            <InputGroup label={t('settings_vision_keys')} description={t('settings_vision_keys_desc')}>
                                <div className="space-y-3">
                                    <textarea
                                        rows={4}
                                        value={settings.imageKeys}
                                        onChange={e => handleChange('imageKeys', e.target.value)}
                                        placeholder="sk-..."
                                        className="w-full bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-3 text-sm font-mono text-zinc-300 focus:border-brand/40 focus:bg-zinc-900 transition-all outline-none resize-none no-scrollbar"
                                    />
                                    <div className="flex items-center justify-between px-1">
                                        <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-600 uppercase">
                                            <Database size={12} />
                                            {t('settings_keys_loaded', { count: settings.imageKeys.split('\n').filter(Boolean).length })}
                                        </div>
                                        <button
                                            onClick={() => handleVerifyKey('vision')}
                                            disabled={isValidating !== null}
                                            className="flex items-center gap-1.5 text-[10px] font-bold text-brand uppercase hover:text-brand-hover transition-colors disabled:opacity-50"
                                        >
                                            {isValidating === 'vision' ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                                            {t('settings_verify')}
                                        </button>
                                    </div>
                                </div>
                            </InputGroup>

                            <div className="grid grid-cols-2 gap-4 mb-8">
                                <div className={cn(
                                    "p-4 rounded-2xl border transition-all cursor-pointer group/toggle",
                                    settings.ocrEnabled ? "bg-brand/5 border-brand/20" : "bg-white/[0.02] border-white/5 grayscale"
                                )} onClick={() => handleChange('ocrEnabled', !settings.ocrEnabled)}>
                                    <div className="flex items-center justify-between mb-2">
                                        <div className={cn("p-2 rounded-lg", settings.ocrEnabled ? "bg-brand/10 text-brand" : "bg-zinc-800 text-zinc-500")}>
                                            <FileText size={18} />
                                        </div>
                                        <div className={cn("w-8 h-4 rounded-full relative transition-colors", settings.ocrEnabled ? "bg-brand" : "bg-zinc-700")}>
                                            <div className={cn("absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all", settings.ocrEnabled ? "left-4.5" : "left-0.5")} />
                                        </div>
                                    </div>
                                    <p className="text-sm font-bold text-white uppercase tracking-tight">{t('settings_ocr_enable')}</p>
                                    <p className="text-[10px] text-zinc-500 font-medium">{t('settings_ocr_desc')}</p>
                                </div>

                                <div className={cn(
                                    "p-4 rounded-2xl border transition-all cursor-pointer group/toggle",
                                    settings.visionEnabled ? "bg-emerald-500/5 border-emerald-500/20" : "bg-white/[0.02] border-white/5 grayscale"
                                )} onClick={() => handleChange('visionEnabled', !settings.visionEnabled)}>
                                    <div className="flex items-center justify-between mb-2">
                                        <div className={cn("p-2 rounded-lg", settings.visionEnabled ? "bg-emerald-500/10 text-emerald-500" : "bg-zinc-800 text-zinc-500")}>
                                            <Eye size={18} />
                                        </div>
                                        <div className={cn("w-8 h-4 rounded-full relative transition-colors", settings.visionEnabled ? "bg-emerald-500" : "bg-zinc-700")}>
                                            <div className={cn("absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all", settings.visionEnabled ? "left-4.5" : "left-0.5")} />
                                        </div>
                                    </div>
                                    <p className="text-sm font-bold text-white uppercase tracking-tight">{t('settings_vision_enable')}</p>
                                    <p className="text-[10px] text-zinc-500 font-medium">{t('settings_vision_desc')}</p>
                                </div>
                            </div>

                            <InputGroup label={t('settings_max_images')} description={t('settings_max_images_desc')}>
                                <div className="flex items-center gap-4">
                                    <input
                                        type="range"
                                        min="1"
                                        max="4"
                                        value={settings.maxImagesPerTweet}
                                        onChange={e => handleChange('maxImagesPerTweet', parseInt(e.target.value))}
                                        className="flex-1 accent-brand"
                                    />
                                    <div className="w-12 h-10 bg-zinc-900 border border-white/10 rounded-xl flex items-center justify-center font-mono font-bold text-brand">
                                        {settings.maxImagesPerTweet}
                                    </div>
                                </div>
                            </InputGroup>
                        </div>
                    )}

                    {/* AI Chat (Contemplation) */}
                    {activeSection === 'chat' && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <SectionHeader title={sidebarItems[2].label} />

                            <InputGroup label={t('settings_api_key')} description={t('settings_chat_key_desc')}>
                                <div className="relative group/field">
                                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 group-focus-within/field:text-brand transition-colors" size={16} />
                                    <input
                                        type="password"
                                        value={settings.chatApiKey}
                                        onChange={e => handleChange('chatApiKey', e.target.value)}
                                        placeholder="Optional fallback to global..."
                                        className="w-full bg-zinc-900/50 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm font-mono text-white focus:border-brand/40 focus:bg-zinc-900 transition-all outline-none"
                                    />
                                </div>
                            </InputGroup>

                            <InputGroup label={t('settings_api_url')} description={t('settings_api_url_desc')}>
                                <input
                                    type="text"
                                    value={settings.chatBaseUrl}
                                    onChange={e => handleChange('chatBaseUrl', e.target.value)}
                                    placeholder="https://"
                                    className="w-full bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-3 text-sm font-mono text-white focus:border-brand/40 focus:bg-zinc-900 transition-all outline-none"
                                />
                            </InputGroup>

                            <InputGroup label={t('settings_model')} description={t('settings_model_desc')}>
                                <input
                                    type="text"
                                    value={settings.chatModel}
                                    onChange={e => handleChange('chatModel', e.target.value)}
                                    placeholder="gpt-4o / Qwen-Max"
                                    className="w-full bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-3 text-sm font-mono text-white focus:border-brand/40 focus:bg-zinc-900 transition-all outline-none"
                                />
                            </InputGroup>
                        </div>
                    )}

                    {/* RAG (Embeddings & Retrieval) */}
                    {activeSection === 'rag' && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <SectionHeader title={sidebarItems[3].label} />

                            <div className={cn(
                                "p-6 rounded-2xl border transition-all mb-10",
                                settings.ragEnabled ? "bg-blue-500/5 border-blue-500/20" : "bg-white/[0.02] border-white/5 grayscale"
                            )}>
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className={cn("p-2.5 rounded-xl", settings.ragEnabled ? "bg-blue-500 text-white shadow-lg shadow-blue-500/20" : "bg-zinc-800 text-zinc-500")}>
                                            <Search size={20} />
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-white uppercase tracking-tight">{t('settings_rag_enable')}</p>
                                            <p className="text-[10px] text-zinc-500 font-medium">{t('settings_rag_desc')}</p>
                                        </div>
                                    </div>
                                    <div onClick={() => handleChange('ragEnabled', !settings.ragEnabled)} className={cn("w-12 h-6 rounded-full relative cursor-pointer transition-colors", settings.ragEnabled ? "bg-blue-500" : "bg-zinc-700")}>
                                        <div className={cn("absolute top-1 w-4 h-4 bg-white rounded-full transition-all", settings.ragEnabled ? "left-7" : "left-1")} />
                                    </div>
                                </div>
                            </div>

                            {settings.ragEnabled && (
                                <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-500">
                                    <InputGroup label={t('settings_api_key')} description={t('settings_rag_key_desc')}>
                                        <input
                                            type="password"
                                            value={settings.ragApiKey}
                                            onChange={e => handleChange('ragApiKey', e.target.value)}
                                            placeholder="sk-..."
                                            className="w-full bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-3 text-sm font-mono text-white focus:border-brand/40 focus:bg-zinc-900 transition-all outline-none"
                                        />
                                    </InputGroup>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="p-5 bg-white/[0.03] border border-white/[0.05] rounded-2xl space-y-4">
                                            <div className="flex items-center gap-2 text-xs font-black text-zinc-500 uppercase tracking-widest">
                                                <Zap size={14} className="text-blue-400" />
                                                {t('settings_embedding')}
                                            </div>
                                            <input
                                                type="text"
                                                value={settings.embeddingModel}
                                                onChange={e => handleChange('embeddingModel', e.target.value)}
                                                className="w-full bg-black/40 border border-white/5 rounded-xl px-3 py-2 text-xs font-mono text-white focus:border-blue-500/30 outline-none"
                                                placeholder={t('settings_model_id')}
                                            />
                                            <input
                                                type="text"
                                                value={settings.embeddingUrl}
                                                onChange={e => handleChange('embeddingUrl', e.target.value)}
                                                className="w-full bg-black/40 border border-white/5 rounded-xl px-3 py-2 text-xs font-mono text-white focus:border-blue-500/30 outline-none"
                                                placeholder={t('settings_endpoint')}
                                            />
                                        </div>

                                        <div className="p-5 bg-white/[0.03] border border-white/[0.05] rounded-2xl space-y-4">
                                            <div className="flex items-center gap-2 text-xs font-black text-zinc-500 uppercase tracking-widest">
                                                <RefreshCw size={14} className="text-emerald-400" />
                                                {t('settings_reranker')}
                                            </div>
                                            <input
                                                type="text"
                                                value={settings.rerankerModel}
                                                onChange={e => handleChange('rerankerModel', e.target.value)}
                                                className="w-full bg-black/40 border border-white/5 rounded-xl px-3 py-2 text-xs font-mono text-white focus:border-emerald-500/30 outline-none"
                                                placeholder={t('settings_model_id')}
                                            />
                                            <input
                                                type="text"
                                                value={settings.rerankerUrl}
                                                onChange={e => handleChange('rerankerUrl', e.target.value)}
                                                className="w-full bg-black/40 border border-white/5 rounded-xl px-3 py-2 text-xs font-mono text-white focus:border-emerald-500/30 outline-none"
                                                placeholder={t('settings_endpoint')}
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Automation & Tags */}
                    {activeSection === 'workflow' && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <SectionHeader title={sidebarItems[4].label} />

                            <div className="flex items-center justify-between p-6 bg-white/[0.02] border border-white/[0.05] rounded-2xl mb-10 group translate-all hover:bg-white/[0.04]">
                                <div>
                                    <p className="text-sm font-bold text-white uppercase tracking-tight">{t('settings_automation_auto')}</p>
                                    <p className="text-[10px] text-zinc-500 font-medium">{t('settings_automation_auto_desc')}</p>
                                </div>
                                <div onClick={() => handleChange('autoAnalyze', !settings.autoAnalyze)} className={cn("w-12 h-6 rounded-full relative cursor-pointer transition-colors", settings.autoAnalyze ? "bg-brand" : "bg-zinc-700")}>
                                    <div className={cn("absolute top-1 w-4 h-4 bg-white rounded-full transition-all", settings.autoAnalyze ? "left-7" : "left-1")} />
                                </div>
                            </div>

                            <InputGroup label={t('settings_categories')} description={t('settings_categories_desc')}>
                                <div className="flex flex-wrap gap-2 mb-4 p-4 min-h-[120px] bg-zinc-900/50 border border-white/10 rounded-2xl">
                                    {settings.categories.map((tag) => (
                                        <div key={tag} className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 border border-white/5 rounded-lg text-xs font-bold text-zinc-300 group/tag hover:border-brand/40 transition-all">
                                            <span>{tag}</span>
                                            <button onClick={() => removeTag(tag)} className="text-zinc-600 hover:text-rose-500 transition-colors">
                                                <X size={12} />
                                            </button>
                                        </div>
                                    ))}
                                    <div className="inline-flex items-center relative">
                                        <input
                                            type="text"
                                            value={newTag}
                                            onChange={e => setNewTag(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && addTag()}
                                            placeholder={t('settings_new_category')}
                                            className="bg-transparent border-none text-xs font-bold text-brand focus:ring-0 w-24 outline-none placeholder:text-zinc-600"
                                        />
                                        <Plus size={12} className="text-brand opacity-50" />
                                    </div>
                                </div>
                                <div className="flex items-center justify-end">
                                    <button className="text-[10px] font-bold text-zinc-600 uppercase hover:text-zinc-400 transition-colors">
                                        {t('settings_batch_replace')}
                                    </button>
                                </div>
                            </InputGroup>
                        </div>
                    )}

                    {/* Backup */}
                    {activeSection === 'backup' && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <SectionHeader title={sidebarItems[5].label} />

                            <div className="p-8 bg-zinc-900/50 border border-white/5 rounded-3xl space-y-8 relative overflow-hidden group">
                                <div className="absolute top-0 right-0 p-8 text-zinc-800 pointer-events-none group-hover:text-zinc-700 transition-colors">
                                    <Database size={80} />
                                </div>
                                <div className="relative z-10 max-w-md">
                                    <p className="text-lg font-bold text-white mb-2">{t('settings_backup_shield')}</p>
                                    <p className="text-xs text-zinc-500 leading-relaxed">
                                        {t('settings_backup_desc')}
                                    </p>
                                </div>

                                <div className="flex flex-col gap-4 relative z-10">
                                    <div className="flex items-center gap-4">
                                        <button className="flex items-center gap-2 px-6 py-3 bg-brand text-white rounded-xl text-xs font-black shadow-lg shadow-brand/20 active:scale-95 transition-all">
                                            {t('settings_backup_now')}
                                        </button>
                                    </div>

                                    <div className="h-px bg-white/5" />

                                    <div className="flex items-center justify-between py-2">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2.5 rounded-xl bg-zinc-800 border border-white/5">
                                                <FolderOpen size={18} className="text-zinc-400" />
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">{t('settings_backup_folder')}</p>
                                                <p className="text-xs font-bold text-zinc-300">
                                                    {settings.backupFolderName || t('settings_no_folder')}
                                                </p>
                                            </div>
                                        </div>
                                        <button className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-[10px] font-bold border border-white/5 transition-all">
                                            {t('settings_select_folder')}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Custom Prompts */}
                    {activeSection === 'prompts' && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <SectionHeader title={sidebarItems[6].label} />

                            <InputGroup label={t('settings_prompt_analysis')} description={t('settings_prompt_analysis_desc')}>
                                <div className="space-y-3">
                                    <textarea
                                        rows={12}
                                        value={settings.promptAnalysis}
                                        onChange={e => handleChange('promptAnalysis', e.target.value)}
                                        className="w-full bg-zinc-900/50 border border-white/10 rounded-2xl px-5 py-4 text-xs font-medium leading-relaxed text-zinc-300 focus:border-brand/40 focus:bg-zinc-800 transition-all outline-none resize-none no-scrollbar font-mono"
                                    />
                                    <div className="flex justify-end">
                                        <button
                                            onClick={() => handleResetPrompt('promptAnalysis')}
                                            className="flex items-center gap-1.5 text-[10px] font-black text-zinc-600 uppercase hover:text-brand transition-colors"
                                        >
                                            <RotateCcw size={12} />
                                            {t('settings_reset')}
                                        </button>
                                    </div>
                                </div>
                            </InputGroup>

                            <InputGroup label={t('settings_prompt_summary')} description={t('settings_prompt_summary_desc')}>
                                <div className="space-y-3">
                                    <textarea
                                        rows={6}
                                        value={settings.promptSummary}
                                        onChange={e => handleChange('promptSummary', e.target.value)}
                                        className="w-full bg-zinc-900/50 border border-white/10 rounded-2xl px-5 py-4 text-xs font-medium leading-relaxed text-zinc-300 focus:border-brand/40 focus:bg-zinc-800 transition-all outline-none resize-none no-scrollbar font-mono"
                                    />
                                    <div className="flex justify-end">
                                        <button
                                            onClick={() => handleResetPrompt('promptSummary')}
                                            className="flex items-center gap-1.5 text-[10px] font-black text-zinc-600 uppercase hover:text-brand transition-colors"
                                        >
                                            <RotateCcw size={12} />
                                            {t('settings_reset')}
                                        </button>
                                    </div>
                                </div>
                            </InputGroup>
                        </div>
                    )}

                    {/* Support Author (Bottom) */}
                    <div className="mt-32 pt-16 border-t border-white/[0.05] flex flex-col items-center">
                        <div className="flex flex-col items-center gap-6 group/support">
                            <div className="flex items-center gap-2 text-xs font-bold text-zinc-500 bg-white/5 px-4 py-1.5 rounded-full border border-white/10 opacity-60 group-hover/support:opacity-100 transition-all">
                                <Heart size={14} className="text-rose-500 fill-rose-500" />
                                <span>{t('settings_support_title')}</span>
                            </div>

                            <div className="relative p-2 bg-zinc-900 rounded-3xl border border-white/10 shadow-2xl transition-all duration-700 hover:scale-[1.02]">
                                <img
                                    src={supportImg}
                                    alt="Support"
                                    className="w-48 h-auto object-contain rounded-2xl opacity-80 group-hover/support:opacity-100 transition-opacity"
                                />
                                <div className="absolute inset-0 rounded-3xl bg-gradient-to-tr from-white/5 to-transparent pointer-events-none" />
                            </div>

                            <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest text-center max-w-xs leading-loose">
                                {t('settings_support_subtitle')}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Floating Save Button */}
                <div className="fixed bottom-10 right-10 flex items-center gap-3">
                    {status && (
                        <div className="px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-500 text-[10px] font-black uppercase tracking-widest animate-in fade-in slide-in-from-right-4">
                            {status}
                        </div>
                    )}
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className={cn(
                            "flex items-center gap-3 px-8 py-4 rounded-2xl text-sm font-black transition-all shadow-[0_20px_40px_rgba(0,0,0,0.5)] active:scale-95 group",
                            isSaving
                                ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                                : "bg-white text-black hover:bg-zinc-200"
                        )}
                    >
                        {isSaving ? (
                            <Loader2 size={18} className="animate-spin" />
                        ) : (
                            <Save size={18} className="transition-transform group-hover:-translate-y-0.5" />
                        )}
                        {t('settings_save')}
                    </button>
                </div>
            </main>
        </div>
    );
};
