import React, { useState } from 'react';
import {
    Plus, Trash2, Edit2, CheckCircle2, XCircle, Loader2,
    Server, Eye, Activity
} from 'lucide-react';
import { useTranslation } from '../../shared/hooks/useTranslation';
import { cn } from '../../shared/utils/cn';
import { AIServiceProvider, AISettings, AIProvider, AIProviderConfig, PROVIDER_PRESETS } from '../../shared/types/settings';


interface AIEngineManagerProps {
    settings: AISettings;
    onUpdate: (newSettings: AISettings) => void;
}

export const AIEngineManager: React.FC<AIEngineManagerProps> = ({ settings, onUpdate }) => {
    const { t } = useTranslation();
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formState, setFormState] = useState<Partial<AIServiceProvider>>({});
    const [isTesting, setIsTesting] = useState(false);
    const [testResult, setTestResult] = useState<{ success: boolean; msg: string; latency?: number } | null>(null);

    // Providers list
    const providers = settings.providers || [];
    const defaultProvider = providers.find(p => p.id === settings.defaultProviderId);

    // === Handlers ===
    const handleCreate = (providerKey: string) => {
        const preset = PROVIDER_PRESETS[providerKey];
        const newId = crypto.randomUUID();
        setFormState({
            id: newId,
            provider: preset.id,
            name: `${preset.name} ${providers.filter(p => p.provider === preset.id).length + 1}`,
            baseUrl: preset.defaultBaseUrl,
            apiKey: '',
            status: 'idle'
        });
        setEditingId('new');
        setTestResult(null);
    };

    const handleEdit = (provider: AIServiceProvider) => {
        setFormState({ ...provider });
        setEditingId(provider.id);
        setTestResult(null);
    };

    const handleDelete = (id: string) => {
        if (confirm(t('confirm_delete_engine'))) {
            const newProviders = providers.filter(p => p.id !== id);
            let newDefaultId = settings.defaultProviderId;
            if (newDefaultId === id) {
                newDefaultId = newProviders[0]?.id || '';
            }
            onUpdate({ ...settings, providers: newProviders, defaultProviderId: newDefaultId });
        }
    };

    const handleSave = () => {
        if (!formState.id || !formState.name || !formState.apiKey) return;

        const newProvider = formState as AIServiceProvider;
        if (testResult?.success) {
            newProvider.status = 'connected';
            newProvider.lastChecked = Date.now();
            newProvider.latency = testResult.latency;
        }

        let newProviders = [...providers];
        if (editingId === 'new') {
            newProviders.push(newProvider);
            // If first provider, set as default
            if (newProviders.length === 1) {
                onUpdate({ ...settings, providers: newProviders, defaultProviderId: newProvider.id });
            } else {
                onUpdate({ ...settings, providers: newProviders });
            }
        } else {
            newProviders = newProviders.map(p => p.id === newProvider.id ? newProvider : p);
            onUpdate({ ...settings, providers: newProviders });
        }
        setEditingId(null);
    };

    const handleTestConnection = async () => {
        if (!formState.baseUrl || !formState.apiKey) return;
        setIsTesting(true);
        setTestResult(null);

        const start = Date.now();
        try {
            const response = await fetch(`${formState.baseUrl.replace(/\/$/, '')}/models`, {
                headers: { 'Authorization': `Bearer ${formState.apiKey}` }
            });
            const latency = Date.now() - start;

            if (response.ok) {
                const data = await response.json();
                const models = (data.data || []).map((m: any) => m.id);
                setFormState(prev => ({ ...prev, cachedModels: models, modelsCachedAt: Date.now() }));
                setTestResult({ success: true, msg: `${models.length} models found`, latency });
            } else {
                const err = await response.json().catch(() => ({}));
                setTestResult({ success: false, msg: err.error?.message || response.statusText });
            }
        } catch (e: any) {
            setTestResult({ success: false, msg: e.message || 'Network Error' });
        } finally {
            setIsTesting(false);
        }
    };

    const handleSetDefault = (id: string) => {
        onUpdate({ ...settings, defaultProviderId: id });
    };

    // === Render ===
    if (editingId) {
        const preset = formState.provider ? PROVIDER_PRESETS[formState.provider] : PROVIDER_PRESETS.custom;
        return (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="flex items-center justify-between">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        {editingId === 'new' ? <Plus size={20} /> : <Edit2 size={20} />}
                        {editingId === 'new' ? t('engine_add_new') : t('engine_edit')}
                    </h3>
                    <button onClick={() => setEditingId(null)} className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors">
                        {t('cancel')}
                    </button>
                </div>

                <div className="bg-white/[0.02] border border-white/10 rounded-3xl p-6 space-y-5">
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">{t('engine_provider')}</label>
                            <div className="px-4 py-3 bg-zinc-900/50 border border-white/5 rounded-xl text-zinc-400 font-mono text-sm leading-none flex items-center gap-2">
                                {preset?.icon && <img src={preset.icon} className="w-4 h-4 rounded-full" />}
                                {preset?.name}
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">{t('engine_name')}</label>
                            <input
                                type="text"
                                value={formState.name}
                                onChange={e => setFormState({ ...formState, name: e.target.value })}
                                className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-sm text-white focus:border-brand/40 outline-none transition-all"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">{t('setting_api_key')}</label>
                        <input
                            type="password"
                            value={formState.apiKey}
                            onChange={e => setFormState({ ...formState, apiKey: e.target.value })}
                            placeholder="sk-..."
                            className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-sm font-mono text-white focus:border-brand/40 outline-none"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">{t('setting_base_url')}</label>
                        <input
                            type="text"
                            value={formState.baseUrl}
                            onChange={e => setFormState({ ...formState, baseUrl: e.target.value })}
                            className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-sm font-mono text-white focus:border-brand/40 outline-none"
                        />
                    </div>

                    <div className="pt-4 border-t border-white/5 space-y-3">
                        <div className="flex items-center justify-between">
                            <button
                                onClick={handleTestConnection}
                                disabled={isTesting || !formState.apiKey}
                                className="px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 text-zinc-300 text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 transition-colors disabled:opacity-50"
                            >
                                {isTesting ? <Loader2 size={10} className="animate-spin" /> : <Activity size={10} />}
                                {t('engine_test_connection')}
                            </button>
                            {testResult && (
                                <div className={cn("flex items-center gap-2 text-[9px] font-black uppercase tracking-tight", testResult.success ? "text-emerald-500" : "text-rose-500")}>
                                    {testResult.success ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
                                    <span className="truncate max-w-[80px]">{testResult.success ? 'OK' : 'Error'}</span>
                                </div>
                            )}
                        </div>
                        <button
                            onClick={handleSave}
                            disabled={!formState.name || !formState.apiKey}
                            className="w-full py-3 bg-brand hover:bg-brand-hover text-white rounded-xl text-[9px] font-black uppercase tracking-[0.2em] shadow-lg shadow-brand/20 transition-all active:scale-[0.98] disabled:opacity-50"
                        >
                            {t('save')}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // --- LIST MODE ---
    return (
        <div className="h-full flex flex-col animate-in fade-in duration-700 space-y-6">
            {/* Header & Quick Add */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
                        <Server className="text-brand" size={18} />
                        {t('engine_hub_title')}
                    </h2>
                </div>
                <div className="flex flex-wrap gap-2">
                    {Object.values(PROVIDER_PRESETS).filter(p => !['custom'].includes(p.id)).map(preset => (
                        <button
                            key={preset.id}
                            onClick={() => handleCreate(preset.id)}
                            className="group flex items-center gap-3 px-4 py-2 rounded-xl bg-white/[0.02] border border-white/5 hover:border-brand/40 hover:bg-brand/5 transition-all"
                        >
                            <img src={preset.icon} className="w-4 h-4 rounded-full grayscale group-hover:grayscale-0 transition-all" alt="" />
                            <span className="text-[9px] font-black text-zinc-600 group-hover:text-zinc-400 uppercase tracking-widest">
                                {preset.name}
                            </span>
                        </button>
                    ))}
                    <button
                        onClick={() => handleCreate('custom')}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 text-[9px] font-black uppercase tracking-widest border border-dashed border-white/10 transition-colors"
                    >
                        <Plus size={14} /> {t('engine_add_custom')}
                    </button>
                </div>
            </div>

            {/* Provider List - Vertical (Optimized for Sidebar) */}
            <div className="flex-1 space-y-3 overflow-y-auto no-scrollbar pr-1">
                {providers.map(provider => (
                    <div
                        key={provider.id}
                        className={cn(
                            "group relative bg-white/[0.02] border rounded-2xl p-4 transition-all duration-300",
                            settings.defaultProviderId === provider.id ? "border-brand/40 bg-brand/5 shadow-[0_0_20px_rgba(77,107,254,0.05)]" : "border-white/5 hover:border-white/10 hover:bg-white/[0.04]"
                        )}
                    >
                        <div className="absolute top-4 right-4 flex items-center gap-1.5">
                            <div className={cn("w-1.5 h-1.5 rounded-full",
                                provider.status === 'connected' ? "bg-emerald-500 shadow-[0_0_8px_#10b981]" : "bg-zinc-700"
                            )} />
                            <span className="text-[8px] text-zinc-600 font-black uppercase tracking-widest">
                                {provider.status === 'connected' ? `${provider.latency || '?'}ms` : t('engine_status_inactive')}
                            </span>
                        </div>

                        <div className="flex items-center gap-3">
                            <div className={cn(
                                "w-9 h-9 rounded-xl flex items-center justify-center border border-white/5 bg-zinc-900",
                                provider.status === 'connected' && "border-brand/20"
                            )}>
                                {PROVIDER_PRESETS[provider.provider]?.icon ? (
                                    <img src={PROVIDER_PRESETS[provider.provider].icon} className="w-4.5 h-4.5 rounded-full" />
                                ) : <Server size={14} className="text-zinc-700" />}
                            </div>
                            <div className="min-w-0 flex-1">
                                <h4 className="font-bold text-white text-xs truncate leading-tight transition-colors">{provider.name}</h4>
                                <p className="text-[10px] text-zinc-600 font-mono mt-0.5 truncate">{provider.baseUrl}</p>
                            </div>
                        </div>

                        <div className="mt-3 pt-2.5 border-t border-white/5 flex items-center justify-between">
                            <div className="flex gap-2.5">
                                <button onClick={() => handleEdit(provider)} className="text-[8px] font-black text-zinc-600 hover:text-white uppercase tracking-[0.1em] transition-colors flex items-center gap-1">
                                    <Edit2 size={9} />
                                    {t('edit')}
                                </button>
                                <button onClick={() => handleDelete(provider.id)} className="text-[8px] font-black text-zinc-700 hover:text-rose-500 uppercase tracking-[0.1em] transition-colors flex items-center gap-1">
                                    <Trash2 size={9} />
                                    {t('delete')}
                                </button>
                            </div>

                            {settings.defaultProviderId !== provider.id && (
                                <button
                                    onClick={() => handleSetDefault(provider.id)}
                                    className="px-3 py-1 bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg text-[8px] font-black text-zinc-400 hover:text-white uppercase tracking-widest transition-all"
                                >
                                    {t('engine_use_primary')}
                                </button>
                            )}
                            {settings.defaultProviderId === provider.id && (
                                <div className="flex items-center gap-1">
                                    <CheckCircle2 size={10} className="text-brand" />
                                    <span className="text-[8px] font-black text-brand uppercase tracking-widest leading-none">{t('engine_primary_label')}</span>
                                </div>
                            )}
                        </div>
                    </div>
                ))}

                {providers.length === 0 && (
                    <div className="col-span-full py-12 flex flex-col items-center justify-center text-center opacity-40">
                        <Server className="text-zinc-600 mb-4" size={32} />
                        <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">
                            {t('engine_empty_title')}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};
