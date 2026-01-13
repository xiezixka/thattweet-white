import React, { useState, useEffect } from 'react';
import { Save, Key, Cpu, RotateCcw, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { AISettings, DEFAULT_AI_SETTINGS } from '../../shared/types/settings';

interface ModelOption {
    id: string;
    name?: string;
}

export const SettingsView: React.FC = () => {
    const [settings, setSettings] = useState<AISettings>(DEFAULT_AI_SETTINGS);
    const [status, setStatus] = useState<string>('');
    const [isValidating, setIsValidating] = useState(false);
    const [modelList, setModelList] = useState<ModelOption[]>([]);
    const [validationMsg, setValidationMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    useEffect(() => {
        // @ts-ignore
        chrome.storage.local.get(['aiSettings'], (result) => {
            if (result.aiSettings) {
                setSettings(result.aiSettings);
            }
        });
    }, []);

    const handleChange = (key: keyof AISettings, value: any) => {
        setSettings(prev => ({ ...prev, [key]: value }));
        // Reset validation status when key changes
        if (key === 'apiKey') setValidationMsg(null);
    };

    const getBaseUrl = (provider: string) => {
        switch (provider) {
            case 'siliconflow': return 'https://api.siliconflow.cn/v1';
            case 'deepseek': return 'https://api.deepseek.com';
            case 'openai': return 'https://api.openai.com/v1';
            default: return '';
        }
    };

    const handleVerifyAndLoad = async () => {
        if (!settings.apiKey) return;
        setIsValidating(true);
        setValidationMsg(null);
        setModelList([]);

        try {
            const baseUrl = settings.provider === 'custom' ? settings.baseUrlContent : getBaseUrl(settings.provider);
            if (!baseUrl) throw new Error('Invalid Provider URL');

            // 尝试获取模型列表
            const res = await fetch(`${baseUrl}/models`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${settings.apiKey}` }
            });

            if (!res.ok) {
                throw new Error(`API Error: ${res.status} ${res.statusText}`);
            }

            const data = await res.json();
            // 兼容 OpenAI 格式 { data: [{id: ...}, ...] }
            const models = Array.isArray(data.data) ? data.data : [];

            // 过滤 chat models (可选，简单的过滤策略)
            const chatModels = models
                .filter((m: any) => !m.id.includes('embedding') && !m.id.includes('whisper') && !m.id.includes('tts'))
                .sort((a: any, b: any) => a.id.localeCompare(b.id));

            setModelList(chatModels);
            setValidationMsg({ type: 'success', text: `Verified! Found ${chatModels.length} models.` });

            // Persist model list for other views
            // @ts-ignore
            chrome.storage.local.set({ availableModels: chatModels.map(m => m.id) });

            // 如果当前没有选模型且有列表，默认选第一个推荐的
            if (!settings.model && chatModels.length > 0) {
                // 优先找 deepseek
                const preferred = chatModels.find((m: any) => m.id.includes('deepseek') || m.id.includes('gpt-4o')) || chatModels[0];
                handleChange('model', preferred.id);
            }

        } catch (err: any) {
            console.error('Validation failed:', err);
            setValidationMsg({ type: 'error', text: `Failed: ${err.message}` });
        } finally {
            setIsValidating(false);
        }
    };

    const handleSave = () => {
        // @ts-ignore
        chrome.storage.local.set({
            aiSettings: settings,
            availableModels: modelList.map(m => m.id)
        }, () => {
            setStatus('Settings saved successfully!');
            setTimeout(() => setStatus(''), 2000);
        });
    };

    return (
        <div className="max-w-3xl mx-auto p-8 text-zinc-200">
            <h1 className="text-2xl font-bold mb-8 flex items-center gap-2">
                <Cpu className="text-brand" /> AI Engine Configuration
            </h1>

            <div className="space-y-6 bg-zinc-900/50 p-6 rounded-xl border border-white/5">
                {/* Provider Selection */}
                <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-400">AI Provider</label>
                    <select
                        value={settings.provider}
                        onChange={(e) => {
                            handleChange('provider', e.target.value);
                            setModelList([]); // Reset models on provider change
                            setValidationMsg(null);
                        }}
                        className="w-full bg-zinc-950 border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-brand/50 focus:outline-none"
                    >
                        <option value="siliconflow">SiliconFlow (Recommended)</option>
                        <option value="openai">OpenAI</option>
                        <option value="deepseek">DeepSeek</option>
                        <option value="custom">Custom (OpenAI Compatible)</option>
                    </select>
                </div>

                {/* API Key */}
                <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-400 flex items-center justify-between">
                        <span className="flex items-center gap-2"><Key size={14} /> API Key</span>
                        {validationMsg && (
                            <span className={`text-xs flex items-center gap-1 ${validationMsg.type === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
                                {validationMsg.type === 'success' ? <CheckCircle size={12} /> : <AlertCircle size={12} />}
                                {validationMsg.text}
                            </span>
                        )}
                    </label>
                    <div className="flex gap-2">
                        <input
                            type="password"
                            value={settings.apiKey}
                            onChange={(e) => handleChange('apiKey', e.target.value)}
                            placeholder="sk-..."
                            className="flex-1 bg-zinc-950 border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-brand/50 focus:outline-none font-mono"
                        />
                        <button
                            onClick={handleVerifyAndLoad}
                            disabled={!settings.apiKey || isValidating}
                            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                        >
                            {isValidating ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                            {modelList.length > 0 ? 'Refresh Models' : 'Verify & Load Models'}
                        </button>
                    </div>
                </div>

                {/* Model Selection */}
                <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-400">Model Name</label>
                    {modelList.length > 0 ? (
                        <select
                            value={settings.model}
                            onChange={(e) => handleChange('model', e.target.value)}
                            className="w-full bg-zinc-950 border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-brand/50 focus:outline-none font-mono"
                        >
                            <option value="" disabled>Select a model...</option>
                            {modelList.map(m => (
                                <option key={m.id} value={m.id}>{m.id}</option>
                            ))}
                        </select>
                    ) : (
                        <div className="relative">
                            <input
                                type="text"
                                value={settings.model}
                                onChange={(e) => handleChange('model', e.target.value)}
                                placeholder="e.g. deepseek-ai/DeepSeek-V2.5"
                                className="w-full bg-zinc-950 border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-brand/50 focus:outline-none font-mono"
                            />
                            <p className="text-xs text-zinc-500 mt-1">
                                Click "Verify & Load Models" above to auto-fetch available models.
                            </p>
                        </div>
                    )}
                </div>

                {/* Save Button */}
                <div className="pt-4 flex items-center gap-4 border-t border-white/5 mt-4">
                    <button
                        onClick={handleSave}
                        className="flex items-center gap-2 bg-brand text-white px-6 py-2.5 rounded-lg hover:bg-brand-hover transition-colors font-medium text-sm shadow-lg shadow-brand/10 active:scale-95 transform"
                    >
                        <Save size={16} /> Save Configuration
                    </button>
                    {status && <span className="text-emerald-400 text-sm animate-fade-in">{status}</span>}
                </div>
            </div>
        </div>
    );
};
