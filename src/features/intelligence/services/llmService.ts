import { AISettings, DEFAULT_AI_SETTINGS } from '../../../shared/types/settings';
import { Tweet } from '../../../shared/types/tweet';
import { ChatMessage } from '../store/useChatStore';

export const llmService = {
    async getSettings(): Promise<AISettings> {
        return new Promise((resolve) => {
            // @ts-ignore
            chrome.storage.local.get(['aiSettings'], (res) => {
                resolve(res.aiSettings || DEFAULT_AI_SETTINGS);
            });
        });
    },

    buildSystemPrompt(contextTweets: Tweet[]): string {
        let contextSection = '';
        if (contextTweets.length > 0) {
            contextSection = `
<SEARCH_RESULTS>
${contextTweets.map((t, i) => `
[Source ID: ${i + 1}]
Author: @${t.authorName || t.author || 'Unknown'}
Date: ${new Date(t.createdAt).toLocaleDateString()}
Content: ${t.text}
---`).join('\n')}
</SEARCH_RESULTS>`;
        }

        return `你是 ThatTweet Intelligence Suite 的核心 AI 助手。你的角色是协助用户管理、检索和总结他们保存的推文。

<IMPORTANT_INSTRUCTIONS>
1. **基于知识库回答**：优先使用 <SEARCH_RESULTS> 提供的推文内容。
2. **强制引用**：当你引用了知识库中的信息时，必须在句末标注来源 ID，例如 "[1]"。
3. **多维总结**：如果有多条相关推文，请总结其中的共性或趋势，而不仅仅是罗列。
4. **边界处理**：如果搜索结果与问题完全无关：
   - 请直接告知用户：“在您的推文知识库中未找到直接相关的内容。”
   - 然后基于由于通用知识给出简简要建议。
5. **格式化**：使用清晰的 Markdown 标题、加粗、列表等。不要在内容中输出 <SEARCH_RESULTS> 标签本身。
</IMPORTANT_INSTRUCTIONS>

${contextSection || "【注意：当前检索结果为空，请告知用户后根据通用知识回答】"}`;
    },

    /**
     * 流式聊天 - 返回一个异步生成器
     */
    async *chatStream(messages: ChatMessage[], contextTweets: Tweet[]): AsyncGenerator<string, void, unknown> {
        const settings = await this.getSettings();

        // 优先使用 Chat 专用配置，否则回退到全局 API 配置
        const apiKey = settings.chatApiKey || settings.apiKey;
        const baseUrl = settings.chatBaseUrl || settings.baseUrl;
        const model = settings.chatModel || settings.model;

        console.log('[llmService] Settings:', {
            model,
            hasKey: !!apiKey,
        });

        if (!apiKey) throw new Error('AI API Key not configured');
        if (!model) throw new Error('AI Model not selected');

        const url = `${baseUrl}/chat/completions`;

        console.log('[llmService] Calling:', url, 'with model:', model);

        // 构建消息体
        const systemPrompt = this.buildSystemPrompt(contextTweets);
        const apiMessages = [
            { role: 'system', content: systemPrompt },
            ...messages.slice(-10).map(m => ({ role: m.role, content: m.content }))
        ];

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'HTTP-Referer': 'https://github.com/RechardLLee/thattweet-vite',
                'X-Title': 'ThatTweet'
            },
            body: JSON.stringify({
                model,
                messages: apiMessages,
                stream: true,
                max_tokens: 4096,
                temperature: 0.7
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[llmService] API Error:', response.status, errorText);
            throw new Error(`API Error: ${response.status} - ${errorText}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('Response body is null');

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // 保留不完整的行

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed === 'data: [DONE]') continue;
                if (!trimmed.startsWith('data: ')) continue;

                try {
                    const json = JSON.parse(trimmed.slice(6));
                    const delta = json.choices?.[0]?.delta?.content;
                    if (delta) {
                        yield delta;
                    }
                } catch (e) {
                    // 忽略解析错误，可能是不完整的 JSON
                    console.warn('[llmService] Parse warning:', trimmed);
                }
            }
        }
    }
};
