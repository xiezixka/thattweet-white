import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import React from 'react';
import { TweetCard } from '../../../../../shared/components/TweetCard';
import { Tweet } from '../../../../../shared/types/tweet';

// 1. 定义 React 组件视图
const TweetComponent = (props: any) => {
    // 从 node.attrs 获取数据 (这些数据是插入时写入的)
    const tweetData = props.node.attrs.tweet as Tweet;

    // 🛡️ 防御性编程：如果没有数据，渲染占位符
    if (!tweetData) {
        return (
            <NodeViewWrapper className="tweet-card-node my-4 max-w-md mx-auto select-none p-4 border border-zinc-800 rounded-xl bg-zinc-900/50 text-center text-zinc-500 text-xs">
                Tweet Data Missing
            </NodeViewWrapper>
        );
    }

    // 构造或获取 Author 对象，保证组件不报错
    const authorData = tweetData.author || {
        id: tweetData.authorId,
        handle: tweetData.authorName || 'unknown',
        name: tweetData.authorName || 'Unknown',
        avatar: tweetData.authorAvatarUrl || '',
        updatedAt: Date.now(),
        followersCount: 0,
        verified: false
    };

    return (
        <NodeViewWrapper className="tweet-card-node my-4 max-w-md mx-auto select-none">
            <div className="relative group border border-transparent hover:border-brand/30 rounded-xl transition-all">
                {/* 加上 pointer-events-none 防止编辑器里的点击事件干扰编辑光标，但允许拖拽 */}
                <div className="pointer-events-none">
                    <TweetCard tweet={tweetData} author={authorData as any} />
                </div>

                {/* 选中时的遮罩 (可选) */}
                <div className={`absolute inset-0 bg-brand/5 rounded-xl pointer-events-none transition-opacity ${props.selected ? 'opacity-100' : 'opacity-0'}`} />
            </div>
        </NodeViewWrapper>
    );
};

// 2. 定义 Tiptap Extension
export const TweetNode = Node.create({
    name: 'tweet',

    group: 'block', // 这是一个块级元素

    atom: true, // 原子节点，不可在内部编辑文本

    addAttributes() {
        return {
            tweet: {
                default: null,
            },
        };
    },

    parseHTML() {
        return [
            {
                tag: 'tweet-card',
            },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return ['tweet-card', mergeAttributes(HTMLAttributes)];
    },

    addNodeView() {
        return ReactNodeViewRenderer(TweetComponent);
    },
});
