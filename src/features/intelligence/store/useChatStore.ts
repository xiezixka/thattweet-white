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
    generateTitle: (sessionId: string, query: string) => Promise<void>;
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
                currentId = null;
            } else {
                currentId = currentId || sessions[0].id;
            }

            const currentSession = sessions.find((s: ChatSession) => s.id === currentId) || null;

            set({
                sessions,
                currentSessionId: currentId,
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
                currentId = null;
            } else {
                currentId = currentId || sessions[0].id;
            }

            const currentSession = sessions.find((s: ChatSession) => s.id === currentId) || null;
            set({
                sessions,
                currentSessionId: currentId,
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
        let currentSessionId = get().currentSessionId;

        // 如果当前没有会话，先创建一个
        if (!currentSessionId) {
            currentSessionId = get().createSession();
        }

        // 首次消息自动生成标题
        if (get().currentSession?.messages.length === 0) {
            get().generateTitle(currentSessionId, content);
        }

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
            // 2. 执行搜索 (根据模式选择精确/语义/混合)
            const mode = get().searchMode;
            let contextCitations: Tweet[] = [];
            let lastSearchMethod: ChatMessage['searchMethod'] = 'none';

            // 🌟 如果用户已经附加了推文，直接使用它们，跳过搜索
            if (citations.length > 0) {
                get().setStatusMessage('正在分析附加的推文...');
                contextCitations = [...citations];
                lastSearchMethod = 'none'; // 用户手动附加，不是搜索结果
                console.log(`[ChatStore] Using ${citations.length} user-attached citations, skipping search.`);
            } else if (content.trim().length > 0) {
                // 没有附加推文时，才执行搜索
                // 1.5 进阶：AI 关键词提取 (Query Analysis)
                let aiKeywords: string[] | undefined;
                try {
                    get().setStatusMessage('正在提取搜索关键线索...');
                    const analysisResult = await llmService.generateJSON('queryAnalysis', { query: content });
                    if (Array.isArray(analysisResult)) {
                        aiKeywords = analysisResult;
                    } else if (analysisResult && Array.isArray(analysisResult.keywords)) {
                        aiKeywords = analysisResult.keywords;
                    }

                    if (aiKeywords && aiKeywords.length > 0) {
                        get().setStatusMessage(`搜索关键词: ${aiKeywords.join(', ')}`);
                    }
                } catch (e) {
                    console.warn('[ChatStore] Query analysis failed, falling back to basic split:', e);
                }

                // 根据模式显示不同状态
                const statusText = mode === 'rag' ? '正在进行语义向量检索...' :
                    mode === 'structured' ? '正在进行精确关键词检索...' :
                        '正在进行智能混合检索...';
                get().setStatusMessage(statusText);

                // 调用 ragService，可选传递 AI 提取的关键词
                const searchResults = await ragService.search(content, 12, mode, aiKeywords);
                console.log(`[ChatStore] Search results found: ${searchResults.length}`);

                if (searchResults.length > 0) {
                    get().setStatusMessage(`找到 ${searchResults.length} 条相关推文，正在分析内容...`);
                } else {
                    get().setStatusMessage('未在推文库中找到直接相关内容，将尝试基于通用知识回答...');
                }

                contextCitations = searchResults.map(r => {
                    const t = r.tweet as any;
                    t.relevanceScore = Math.min(Math.round(r.score), 100);
                    return t;
                });

                // 确定最终使用的搜索方法
                if (searchResults.length > 0) {
                    const hasStructured = searchResults.some(r => r.method === 'structured');
                    const hasRag = searchResults.some(r => r.method === 'rag');
                    if (hasStructured && hasRag) lastSearchMethod = 'structured';
                    else if (hasStructured) lastSearchMethod = 'structured';
                    else lastSearchMethod = 'rag';
                }
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

    generateTitle: async (sessionId, query) => {
        try {
            const title = await llmService.generateNodeText('titleGeneration', { query });
            if (title && title.trim()) {
                const cleanTitle = title.replace(/["'”]/g, '').trim();
                set(state => {
                    const sessions = state.sessions.map(s =>
                        s.id === sessionId ? { ...s, title: cleanTitle } : s
                    );
                    const currentSession = state.currentSessionId === sessionId
                        ? { ...state.currentSession!, title: cleanTitle }
                        : state.currentSession;
                    return { sessions, currentSession };
                });
                get().saveSessions();
            }
        } catch (e) {
            console.warn('[ChatStore] Failed to generate title:', e);
        }
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
