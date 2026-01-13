import { create } from 'zustand';
import { Tweet } from '../../../shared/types/tweet';
import { ragService } from '../services/ragService';
import { llmService } from '../services/llmService';

export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
    citations?: Tweet[];     // 引用了哪些推文
    isStreaming?: boolean;   // 是否正在生成中
    error?: string;          // 生成错误信息
}

export interface ChatSession {
    id: string;
    title: string;
    createdAt: number;
    updatedAt: number;
    messages: ChatMessage[];
}

interface ChatState {
    // 状态
    sessions: ChatSession[];
    currentSessionId: string | null;
    currentSession: ChatSession | null;
    isGenerating: boolean;
    statusMessage: string | null;

    // 动作
    createSession: () => string;
    switchSession: (sessionId: string) => void;
    deleteSession: (sessionId: string) => void;
    setStatusMessage: (msg: string | null) => void;

    // 消息操作
    sendMessage: (content: string, citations?: Tweet[]) => Promise<void>;
    appendAssistantMessage: (content: string, isStreaming?: boolean, citations?: Tweet[]) => void;
    updateAssistantMessage: (content: string, isStreaming?: boolean) => void;

    // 加载/保存
    loadSessions: () => Promise<void>;

    // Internal Helper
    _appendMessageToCurrent: (msg: ChatMessage) => void;
}

// 模拟初始状态
const MOCK_SESSION_ID = 'mock-1';
const MOCK_MESSAGES: ChatMessage[] = [
    {
        id: 'msg-1',
        role: 'assistant',
        content: '你好！我是你的智能助手 ThatBot。\n我已准备好根据你的推文库回答任何问题。',
        timestamp: Date.now()
    }
];

export const useChatStore = create<ChatState>((set, get) => ({
    sessions: [],
    currentSessionId: MOCK_SESSION_ID,
    currentSession: {
        id: MOCK_SESSION_ID,
        title: 'New Chat',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: MOCK_MESSAGES
    },
    isGenerating: false,
    statusMessage: null,

    setStatusMessage: (msg) => set({ statusMessage: msg }),

    createSession: () => {
        const newId = crypto.randomUUID();
        const newSession: ChatSession = {
            id: newId,
            title: 'New Chat',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            messages: []
        };
        set(state => ({
            sessions: [newSession, ...state.sessions],
            currentSessionId: newId,
            currentSession: newSession
        }));
        return newId;
    },

    switchSession: (sessionId) => {
        const session = get().sessions.find(s => s.id === sessionId);
        if (session) {
            set({
                currentSessionId: sessionId,
                currentSession: session
            });
        }
    },

    deleteSession: (sessionId) => {
        set(state => {
            const newSessions = state.sessions.filter(s => s.id !== sessionId);
            // 如果删除了当前会话，切到第一个或新建
            let newCurrentId = state.currentSessionId;
            let newCurrentSession = state.currentSession;

            if (state.currentSessionId === sessionId) {
                if (newSessions.length > 0) {
                    newCurrentId = newSessions[0].id;
                    newCurrentSession = newSessions[0];
                } else {
                    const newId = crypto.randomUUID();
                    const newSess: ChatSession = {
                        id: newId, title: 'New Chat', createdAt: Date.now(), updatedAt: Date.now(), messages: []
                    };
                    newSessions.push(newSess);
                    newCurrentId = newId;
                    newCurrentSession = newSess;
                }
            }
            return { sessions: newSessions, currentSessionId: newCurrentId, currentSession: newCurrentSession };
        });
    },

    sendMessage: async (content, citations = []) => {
        set({ isGenerating: true });
        get().setStatusMessage('分析搜索意图...');

        // 1. 添加用户消息
        const userMsg: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'user',
            content,
            timestamp: Date.now(),
            citations
        };
        get()._appendMessageToCurrent(userMsg);

        try {
            // 2. 执行混合搜索 (精确 + 评分)
            get().setStatusMessage('正在检索推文知识库...');
            let contextCitations: Tweet[] = [];

            if (content.length > 1 || citations.length > 0) {
                if (content.length > 1) {
                    const searchResults = await ragService.search(content, 12);
                    contextCitations = searchResults.map(r => r.tweet);
                }
            }

            // 如果有自带引用（比如用户拖进来的），合并它们
            if (citations.length > 0) {
                const existingIds = new Set(contextCitations.map(t => t.id));
                const uniqueCitations = citations.filter(t => !existingIds.has(t.id));
                contextCitations = [...contextCitations, ...uniqueCitations];
            }

            // 3. 开启 AI 初始消息 (带引用)
            get().setStatusMessage('思考并回答中...');
            let fullResponse = '';
            get().appendAssistantMessage('', true, contextCitations);

            // 4. 调用 LLM 流式生成
            const history = [...(get().currentSession?.messages || [])];
            const stream = llmService.chatStream(history, contextCitations);

            let hasStarted = false;
            for await (const delta of stream) {
                if (!hasStarted) {
                    get().setStatusMessage(null); // 开始吐字，隐藏状态
                    hasStarted = true;
                }
                fullResponse += delta;
                get().updateAssistantMessage(fullResponse, true);
            }

            // 完成
            get().updateAssistantMessage(fullResponse, false);

        } catch (err: any) {
            console.error('AI Chat Error:', err);
            get().updateAssistantMessage(`Error: ${err.message || 'Unknown AI Error'}`, false);
        } finally {
            set({ isGenerating: false, statusMessage: null });
        }
    },

    appendAssistantMessage: (content, isStreaming = true, citations: Tweet[] = []) => {
        const msg: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content,
            timestamp: Date.now(),
            isStreaming,
            citations
        };
        get()._appendMessageToCurrent(msg);
    },

    updateAssistantMessage: (content, isStreaming = true) => {
        set(state => {
            if (!state.currentSession) return {};
            const messages = [...state.currentSession.messages];
            const lastMsg = messages[messages.length - 1];
            if (lastMsg && lastMsg.role === 'assistant') {
                lastMsg.content = content;
                lastMsg.isStreaming = isStreaming;
            }
            return {
                currentSession: { ...state.currentSession, messages }
            };
        });
    },

    loadSessions: async () => {
        // TODO: Load from IndexedDB
    },

    // Internal Helper
    _appendMessageToCurrent: (msg: ChatMessage) => {
        set(state => {
            if (!state.currentSession) return {};
            const updatedSession = {
                ...state.currentSession,
                messages: [...state.currentSession.messages, msg],
                updatedAt: Date.now()
            };
            // 同时更新 sessions 列表里的对应项
            const updatedSessions = state.sessions.map(s => s.id === updatedSession.id ? updatedSession : s);
            return {
                currentSession: updatedSession,
                sessions: updatedSessions
            };
        });
    }
}));
