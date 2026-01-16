import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import { cn } from '../utils/cn';
import 'katex/dist/katex.min.css';

interface MarkdownRendererProps {
    content: string;
    className?: string;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className }) => {
    return (
        <div className={cn("prose prose-invert prose-zinc max-w-none", className)}>
            <ReactMarkdown
                remarkPlugins={[remarkMath, remarkGfm]}
                rehypePlugins={[rehypeKatex]}
                components={{
                    // Custom heading styles
                    h1: ({ children }) => (
                        <h1 className="text-lg font-bold text-zinc-100 mt-4 mb-2 tracking-tight">{children}</h1>
                    ),
                    h2: ({ children }) => (
                        <h2 className="text-base font-bold text-zinc-200 mt-3 mb-2">{children}</h2>
                    ),
                    h3: ({ children }) => (
                        <h3 className="text-sm font-bold text-zinc-300 mt-2 mb-1">{children}</h3>
                    ),
                    // Paragraph
                    p: ({ children }) => (
                        <p className="text-[13px] leading-relaxed text-zinc-300 mb-3 last:mb-0">{children}</p>
                    ),
                    // Strong/Bold
                    strong: ({ children }) => (
                        <strong className="font-bold text-zinc-100">{children}</strong>
                    ),
                    // Emphasis/Italic
                    em: ({ children }) => (
                        <em className="italic text-zinc-400">{children}</em>
                    ),
                    // Links
                    a: ({ href, children }) => (
                        <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-brand hover:text-brand/80 underline underline-offset-2 transition-colors"
                        >
                            {children}
                        </a>
                    ),
                    // Code blocks
                    code: ({ className: codeClassName, children, ...props }) => {
                        const isInline = !codeClassName;
                        if (isInline) {
                            return (
                                <code className="px-1.5 py-0.5 rounded bg-white/5 text-[11px] font-mono text-zinc-300 border border-white/5">
                                    {children}
                                </code>
                            );
                        }
                        return (
                            <code
                                className={cn(
                                    "block p-4 rounded-xl bg-[#0a0a0a] border border-white/5 text-[11px] font-mono text-zinc-400 overflow-x-auto no-scrollbar",
                                    codeClassName
                                )}
                                {...props}
                            >
                                {children}
                            </code>
                        );
                    },
                    // Pre (code block wrapper)
                    pre: ({ children }) => (
                        <pre className="my-3">{children}</pre>
                    ),
                    // Blockquote
                    blockquote: ({ children }) => (
                        <blockquote className="border-l-2 border-zinc-700 pl-4 my-3 text-zinc-500 italic">
                            {children}
                        </blockquote>
                    ),
                    // Lists
                    ul: ({ children }) => (
                        <ul className="list-disc list-inside space-y-1 my-2 text-[13px] text-zinc-300">{children}</ul>
                    ),
                    ol: ({ children }) => (
                        <ol className="list-decimal list-inside space-y-1 my-2 text-[13px] text-zinc-300">{children}</ol>
                    ),
                    li: ({ children }) => (
                        <li className="leading-relaxed">{children}</li>
                    ),
                    // Images - Enhanced for Thought Salon
                    img: ({ src, alt }) => (
                        <span className="block my-3">
                            <img
                                src={src}
                                alt={alt || 'Reference image'}
                                className="max-w-full h-auto rounded-xl border border-white/10 hover:border-white/20 transition-colors cursor-zoom-in"
                                loading="lazy"
                                onClick={() => {
                                    if (src) window.open(src, '_blank');
                                }}
                            />
                            {alt && (
                                <span className="block text-[10px] text-zinc-600 mt-1.5 italic">{alt}</span>
                            )}
                        </span>
                    ),
                    // Horizontal rule
                    hr: () => (
                        <hr className="my-4 border-t border-white/5" />
                    ),
                    // Table support
                    table: ({ children }) => (
                        <div className="overflow-x-auto my-3 no-scrollbar">
                            <table className="w-full text-[11px] border-collapse">{children}</table>
                        </div>
                    ),
                    thead: ({ children }) => (
                        <thead className="border-b border-white/10 text-zinc-400">{children}</thead>
                    ),
                    tbody: ({ children }) => (
                        <tbody className="text-zinc-300">{children}</tbody>
                    ),
                    tr: ({ children }) => (
                        <tr className="border-b border-white/5">{children}</tr>
                    ),
                    th: ({ children }) => (
                        <th className="px-3 py-2 text-left font-bold">{children}</th>
                    ),
                    td: ({ children }) => (
                        <td className="px-3 py-2">{children}</td>
                    ),
                }}
            >
                {content}
            </ReactMarkdown>
        </div>
    );
};
