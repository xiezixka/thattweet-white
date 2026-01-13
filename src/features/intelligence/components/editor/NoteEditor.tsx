import React, { useEffect, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Typography from '@tiptap/extension-typography';
import { Markdown } from 'tiptap-markdown';
import { Maximize2, FileText, ChevronRight, Twitter, Copy, Check } from 'lucide-react';
import { useIntelligenceStore } from '../../store/useIntelligenceStore';
import { cn } from '../../../../shared/utils/cn';
import { TweetNode } from './extensions/TweetNode';

import './editor.css';

export const NoteEditor: React.FC = () => {
    const { toggleNote, pendingInsert, clearPendingInsert } = useIntelligenceStore();
    const [copied, setCopied] = useState(false);

    const editor = useEditor({
        extensions: [
            StarterKit,
            Typography,
            Markdown.configure({
                html: true,
                transformPastedText: true,
                transformCopiedText: true,
            }),
            TweetNode.extend({
                addStorage() {
                    return {
                        markdown: {
                            serialize(state: any, node: any) {
                                state.write(`<tweet-card id="${node.attrs.tweet?.id}"></tweet-card>`);
                            },
                        }
                    }
                }
            }),
            Placeholder.configure({
                placeholder: '开始撰写你的文章... (支持 Markdown 快捷键)',
            }),
        ],
        content: `
# 🚀 欢迎使用 DeepNote

这是一个 **所见即所得** 的现代化编辑器。

- 支持 Markdown 快捷键
- 支持推文卡片拖入
- 自动导出为干净的 Markdown
        `,
        editorProps: {
            attributes: {
                class: 'prose prose-invert prose-sm sm:prose-base lg:prose-lg xl:prose-2xl m-5 focus:outline-none max-w-none',
            },
            handleDrop: (view, event, slice, moved) => {
                if (!moved && event.dataTransfer && event.dataTransfer.getData('tweet')) {
                    const tweetJson = event.dataTransfer.getData('tweet');
                    try {
                        const tweet = JSON.parse(tweetJson);
                        const { schema } = view.state;
                        const coordinates = view.posAtCoords({ left: event.clientX, top: event.clientY });
                        if (coordinates) {
                            const node = schema.nodes.tweet.create({ tweet });
                            const transaction = view.state.tr.insert(coordinates.pos, node);
                            view.dispatch(transaction);
                        }
                        return true;
                    } catch (e) {
                        console.error('Failed to drop tweet:', e);
                    }
                }
                return false;
            }
        },
    });

    useEffect(() => {
        if (pendingInsert && editor) {
            const { type, content } = pendingInsert;
            if (type === 'tweet') {
                editor.chain().focus().insertContent({
                    type: 'tweet',
                    attrs: { tweet: content }
                }).run();
            } else if (type === 'text') {
                editor.chain().focus().insertContent(`\n> ${content}\n`).run();
            }
            clearPendingInsert();
        }
    }, [pendingInsert, editor, clearPendingInsert]);

    const handleCopyMarkdown = () => {
        if (!editor) return;
        const markdown = (editor.storage as any).markdown.getMarkdown();
        navigator.clipboard.writeText(markdown).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    return (
        <div className="h-full flex flex-col bg-[#121212] border-l border-white/5 relative group">
            <div className="h-12 border-b border-white/5 flex items-center justify-between px-4 bg-[#121212]">
                <div className="flex items-center gap-2 text-zinc-400">
                    <FileText size={16} />
                    <span className="text-xs font-medium">Untitled Note</span>
                    <button
                        onClick={handleCopyMarkdown}
                        className="ml-2 flex items-center gap-1.5 px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-[10px] text-zinc-400 hover:text-zinc-200 transition-all border border-transparent hover:border-white/10"
                    >
                        {copied ? <Check size={10} className="text-green-400" /> : <Copy size={10} />}
                        {copied ? 'Copied' : 'Copy MD'}
                    </button>
                </div>
                <div className="flex items-center gap-1">
                    <button className="p-1.5 text-zinc-500 hover:text-zinc-200 hover:bg-white/5 rounded transition-colors" title="Full Screen">
                        <Maximize2 size={14} />
                    </button>
                    <button
                        onClick={toggleNote}
                        className="p-1.5 text-zinc-500 hover:text-zinc-200 hover:bg-white/5 rounded transition-colors"
                        title="Close Panel"
                    >
                        <ChevronRight size={16} />
                    </button>
                </div>
            </div>

            <div className="h-10 border-b border-white/5 flex items-center px-4 gap-2 overflow-x-auto bg-[#121212] text-zinc-500 text-xs scrollbar-hide">
                <button
                    onClick={() => editor?.chain().focus().toggleBold().run()}
                    className={cn("hover:text-zinc-200 px-1 font-bold", editor?.isActive('bold') && "text-brand")}
                >
                    Bold
                </button>
                <button
                    onClick={() => editor?.chain().focus().toggleItalic().run()}
                    className={cn("hover:text-zinc-200 px-1 italic", editor?.isActive('italic') && "text-brand")}
                >
                    Italic
                </button>
                <div className="w-px h-3 bg-white/10 mx-1" />
                <button
                    onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
                    className={cn("hover:text-zinc-200 px-1 font-bold", editor?.isActive('heading', { level: 1 }) && "text-brand")}
                >
                    H1
                </button>
                <button
                    onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
                    className={cn("hover:text-zinc-200 px-1 font-bold", editor?.isActive('heading', { level: 2 }) && "text-brand")}
                >
                    H2
                </button>
                <div className="w-px h-3 bg-white/10 mx-1" />
                <button
                    onClick={() => editor?.chain().focus().toggleBlockquote().run()}
                    className={cn("hover:text-zinc-200 px-1", editor?.isActive('blockquote') && "text-brand")}
                >
                    Quote
                </button>
                <button
                    onClick={() => editor?.chain().focus().toggleBulletList().run()}
                    className={cn("hover:text-zinc-200 px-1", editor?.isActive('bulletList') && "text-brand")}
                >
                    List
                </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar bg-[#121212]">
                <EditorContent editor={editor} className="min-h-full py-8 px-8" />
            </div>
        </div>
    );
};
