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
    searchMethod?: 'structured' | 'rag' | 'none';
    searchCriteriaSummary?: string;
}

export type SearchMode = 'auto' | 'structured' | 'rag';

export interface ChatSession {
    id: string;
    title: string;
    createdAt: number;
    updatedAt: number;
    messages: ChatMessage[];
    noteContent?: string; // Content of the side note for this session
}

interface ChatState {
    // 状态
    sessions: ChatSession[];
    currentSessionId: string | null;
    currentSession: ChatSession | null;
    isGenerating: boolean;
    statusMessage: string | null;
    searchMode: SearchMode;
    isInitialized: boolean;

    // 动作
    createSession: () => string;
    switchSession: (sessionId: string) => void;
    deleteSession: (sessionId: string) => void;
    setStatusMessage: (msg: string | null) => void;
    setSearchMode: (mode: SearchMode) => void;

    // 消息操作
    sendMessage: (content: string, citations?: Tweet[]) => Promise<void>;
    appendAssistantMessage: (content: string, isStreaming?: boolean, citations?: Tweet[], searchMethod?: ChatMessage['searchMethod']) => void;
    updateAssistantMessage: (content: string, isStreaming?: boolean) => void;

    // 加载/保存
    loadSessions: () => Promise<void>;
    saveSessions: () => Promise<void>;
    updateSessionNote: (sessionId: string, content: string) => void;

    // Internal Helper
    _appendMessageToCurrent: (msg: ChatMessage) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
    sessions: [],
    currentSessionId: null,
    currentSession: null,
    isGenerating: false,
    statusMessage: null,
    searchMode: 'auto',
    isInitialized: false,

    setStatusMessage: (msg) => set({ statusMessage: msg }),
    setSearchMode: (mode) => set({ searchMode: mode }),

    loadSessions: async () => {
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
            const res = await chrome.storage.local.get(['chat_sessions', 'current_session_id']);
            let sessions = res.chat_sessions || [];
            let currentId = res.current_session_id;

            if (sessions.length === 0) {
                const newId = crypto.randomUUID();
                const initialSession: ChatSession = {
                    id: newId,
                    title: 'New Chat',
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    messages: []
                };
                sessions = [initialSession];
                currentId = newId;
            }

            const currentSession = sessions.find((s: ChatSession) => s.id === (currentId || sessions[0].id)) || sessions[0];

            set({
                sessions,
                currentSessionId: currentSession.id,
                currentSession,
                isInitialized: true
            });
        } else {
            // Development fallback to localStorage
            const savedSessions = localStorage.getItem('chat_sessions');
            const savedCurrentId = localStorage.getItem('current_session_id');
            let sessions = savedSessions ? JSON.parse(savedSessions) : [];
            let currentId = savedCurrentId;

            if (sessions.length === 0) {
                const newId = 'local-1';
                const initialSession: ChatSession = {
                    id: newId,
                    title: 'New Chat',
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    messages: []
                };
                sessions = [initialSession];
                currentId = newId;
            }

            const currentSession = sessions.find((s: ChatSession) => s.id === (currentId || sessions[0].id)) || sessions[0];
            set({
                sessions,
                currentSessionId: currentSession.id,
                currentSession,
                isInitialized: true
            });
        }
    },

    saveSessions: async () => {
        const { sessions, currentSessionId, isInitialized } = get();
        if (!isInitialized) return;
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
            await chrome.storage.local.set({
                chat_sessions: sessions,
                current_session_id: currentSessionId
            });
        } else {
            localStorage.setItem('chat_sessions', JSON.stringify(sessions));
            localStorage.setItem('current_session_id', currentSessionId || "");
        }
    },

    createSession: () => {
        const newId = crypto.randomUUID();
        const newSession: ChatSession = {
            id: newId,
            title: 'New Chat',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            messages: [],
            noteContent: ""
        };
        set(state => ({
            sessions: [newSession, ...state.sessions],
            currentSessionId: newId,
            currentSession: newSession
        }));
        get().saveSessions();
        return newId;
    },

    switchSession: (sessionId) => {
        const session = get().sessions.find(s => s.id === sessionId);
        if (session) {
            set({
                currentSessionId: sessionId,
                currentSession: session
            });
            get().saveSessions();
        }
    },

    deleteSession: (sessionId) => {
        set(state => {
            const newSessions = state.sessions.filter(s => s.id !== sessionId);
            let newCurrentId = state.currentSessionId;
            let newCurrentSession = state.currentSession;

            // If the deleted session was the active one
            if (state.currentSessionId === sessionId) {
                if (newSessions.length > 0) {
                    // Switch to the first available session
                    newCurrentId = newSessions[0].id;
                    newCurrentSession = newSessions[0];
                } else {
                    // No sessions left
                    newCurrentId = null;
                    newCurrentSession = null;
                }
            }

            return {
                sessions: newSessions,
                currentSessionId: newCurrentId,
                currentSession: newCurrentSession
            };
        });
        get().saveSessions();
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

            let lastSearchMethod: ChatMessage['searchMethod'] = 'none';

            if (content.length > 1 || citations.length > 0) {
                if (content.length > 1) {
                    const mode = get().searchMode;
                    const searchResults = await ragService.search(content, 12);

                    // 根据 SearchMode 过滤结果
                    let filteredResults = searchResults;
                    if (mode === 'structured') {
                        filteredResults = searchResults.filter(r => r.method === 'structured');
                    } else if (mode === 'rag') {
                        filteredResults = searchResults.filter(r => r.method === 'rag');
                    }

                    contextCitations = filteredResults.map(r => r.tweet);

                    // 如果是精确搜索且有结果，设置 searchMethod
                    if (filteredResults.length > 0) {
                        const hasStructured = filteredResults.some(r => r.method === 'structured');
                        const hasRag = filteredResults.some(r => r.method === 'rag');
                        if (hasStructured && hasRag) lastSearchMethod = 'auto' as any;
                        else if (hasStructured) lastSearchMethod = 'structured';
                        else lastSearchMethod = 'rag';
                    }
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
            get().appendAssistantMessage('', true, contextCitations, lastSearchMethod);

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
            get().saveSessions();
        }
    },

    appendAssistantMessage: (content, isStreaming = true, citations: Tweet[] = [], searchMethod: ChatMessage['searchMethod'] = 'none') => {
        const msg: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content,
            timestamp: Date.now(),
            isStreaming,
            citations,
            searchMethod
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

    // Internal Helper
    _appendMessageToCurrent: (msg: ChatMessage) => {
        set(state => {
            if (!state.currentSession) return {};
            const updatedSession = {
                ...state.currentSession,
                messages: [...state.currentSession.messages, msg],
                updatedAt: Date.now()
            };
            // 更新标题（如果是第一条消息）
            if (updatedSession.messages.length === 2 && updatedSession.messages[0].role === 'user') {
                updatedSession.title = updatedSession.messages[0].content.slice(0, 20);
            }

            // 同时更新 sessions 列表里的对应项
            const updatedSessions = state.sessions.map(s => s.id === updatedSession.id ? updatedSession : s);
            return {
                currentSession: updatedSession,
                sessions: updatedSessions
            };
        });
        get().saveSessions();
    },

    updateSessionNote: (sessionId, content) => {
        set(state => {
            const sessions = state.sessions.map(s =>
                s.id === sessionId ? { ...s, noteContent: content, updatedAt: Date.now() } : s
            );
            const currentSession = state.currentSession?.id === sessionId
                ? { ...state.currentSession, noteContent: content, updatedAt: Date.now() }
                : state.currentSession;

            return { sessions, currentSession };
        });
        get().saveSessions();
    }
}));
