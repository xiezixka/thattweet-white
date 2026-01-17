/**
 * 图片分类常量定义
 * Image Category Constants
 */

export type ImageCategory =
    | 'code'
    | 'architecture'
    | 'ui_design'
    | 'chart'
    | 'portrait'
    | 'illustration'
    | 'cosplay'
    | 'product'
    | 'screenshot'
    | 'meme'
    | 'photo'
    | 'other';

export interface CategoryMeta {
    id: ImageCategory;
    label: string;
    labelEn: string;
    icon: string; // Lucide icon name
    color: string; // Tailwind color class
}

export const CATEGORY_META: Record<ImageCategory, CategoryMeta> = {
    code: {
        id: 'code',
        label: '代码',
        labelEn: 'Code',
        icon: 'Code',
        color: 'text-emerald-400'
    },
    architecture: {
        id: 'architecture',
        label: '架构图',
        labelEn: 'Architecture',
        icon: 'Network',
        color: 'text-blue-400'
    },
    ui_design: {
        id: 'ui_design',
        label: 'UI设计',
        labelEn: 'UI Design',
        icon: 'Layout',
        color: 'text-purple-400'
    },
    chart: {
        id: 'chart',
        label: '数据图表',
        labelEn: 'Chart',
        icon: 'BarChart3',
        color: 'text-cyan-400'
    },
    portrait: {
        id: 'portrait',
        label: '人像',
        labelEn: 'Portrait',
        icon: 'User',
        color: 'text-pink-400'
    },
    illustration: {
        id: 'illustration',
        label: '插画',
        labelEn: 'Illustration',
        icon: 'Palette',
        color: 'text-orange-400'
    },
    cosplay: {
        id: 'cosplay',
        label: 'Cosplay',
        labelEn: 'Cosplay',
        icon: 'Sparkles',
        color: 'text-rose-400'
    },
    product: {
        id: 'product',
        label: '产品',
        labelEn: 'Product',
        icon: 'Package',
        color: 'text-amber-400'
    },
    screenshot: {
        id: 'screenshot',
        label: '截图',
        labelEn: 'Screenshot',
        icon: 'Monitor',
        color: 'text-slate-400'
    },
    meme: {
        id: 'meme',
        label: '表情包',
        labelEn: 'Meme',
        icon: 'Smile',
        color: 'text-yellow-400'
    },
    photo: {
        id: 'photo',
        label: '摄影',
        labelEn: 'Photo',
        icon: 'Camera',
        color: 'text-teal-400'
    },
    other: {
        id: 'other',
        label: '其他',
        labelEn: 'Other',
        icon: 'MoreHorizontal',
        color: 'text-zinc-400'
    }
};

/**
 * VLM 返回的类型名 → 标准分类 ID 映射
 * Supports fuzzy matching for various VLM output formats
 */
export const TYPE_TO_CATEGORY_MAP: Record<string, ImageCategory[]> = {
    // Code
    '代码': ['code'],
    '代码截图': ['code', 'screenshot'],
    '代码/配置截图': ['code', 'screenshot'],
    '代码/配置': ['code'],
    'code': ['code'],
    'code screenshot': ['code', 'screenshot'],

    // Architecture
    '架构图': ['architecture'],
    '流程图': ['architecture'],
    '技术架构图': ['architecture'],
    '技术架构图/流程图': ['architecture'],
    'architecture': ['architecture'],
    'flowchart': ['architecture'],

    // UI Design
    'UI': ['ui_design'],
    'UI设计': ['ui_design'],
    'UI/界面设计': ['ui_design'],
    'UI/设计': ['ui_design'],
    '界面设计': ['ui_design'],
    '设计稿': ['ui_design'],
    'ui design': ['ui_design'],
    'interface': ['ui_design'],

    // Chart
    '图表': ['chart'],
    '数据图表': ['chart'],
    '数据图表/仪表盘': ['chart'],
    '仪表盘': ['chart'],
    '数据可视化': ['chart'],
    'chart': ['chart'],
    'dashboard': ['chart'],

    // Portrait
    '人像': ['portrait'],
    '人物': ['portrait'],
    '人物照片': ['portrait'],
    '人物照片/自拍': ['portrait'],
    '自拍': ['portrait'],
    'portrait': ['portrait'],
    'selfie': ['portrait'],

    // Illustration
    '插画': ['illustration'],
    '二次元': ['illustration'],
    '动漫': ['illustration'],
    '插画/二次元': ['illustration'],
    '插画/二次元/Cosplay': ['illustration', 'cosplay'],
    'illustration': ['illustration'],
    'anime': ['illustration'],

    // Cosplay
    'Cosplay': ['cosplay'],
    'cosplay': ['cosplay'],
    '角色扮演': ['cosplay'],

    // Product
    '产品': ['product'],
    '商品': ['product'],
    '产品图': ['product'],
    '商品/产品图': ['product'],
    'product': ['product'],

    // Screenshot
    '截图': ['screenshot'],
    '文档': ['screenshot'],
    '文档/截图': ['screenshot'],
    '文档截图': ['screenshot'],
    'screenshot': ['screenshot'],
    'document': ['screenshot'],

    // Meme
    '表情包': ['meme'],
    '搞笑图': ['meme'],
    '梗图': ['meme'],
    'meme': ['meme'],

    // Photo
    '摄影': ['photo'],
    '风景': ['photo'],
    '照片': ['photo'],
    '风景照': ['photo'],
    'photo': ['photo'],
    'photography': ['photo'],
    'landscape': ['photo'],

    // Other
    '其他': ['other'],
    'other': ['other']
};

/**
 * 根据 VLM 返回的类型字符串，解析出标准分类 ID 数组
 */
export function parseCategories(typeString: string | undefined): ImageCategory[] {
    if (!typeString) return ['other'];

    const normalized = typeString.trim();

    // Direct match
    if (TYPE_TO_CATEGORY_MAP[normalized]) {
        return TYPE_TO_CATEGORY_MAP[normalized];
    }

    // Fuzzy match - check if any key is contained in the string
    const categories = new Set<ImageCategory>();

    for (const [key, cats] of Object.entries(TYPE_TO_CATEGORY_MAP)) {
        if (normalized.toLowerCase().includes(key.toLowerCase()) ||
            key.toLowerCase().includes(normalized.toLowerCase())) {
            cats.forEach(c => categories.add(c));
        }
    }

    return categories.size > 0 ? Array.from(categories) : ['other'];
}

/**
 * 获取分类的显示信息
 */
export function getCategoryMeta(category: ImageCategory): CategoryMeta {
    return CATEGORY_META[category] || CATEGORY_META.other;
}

/**
 * 获取所有分类列表（用于筛选器）
 */
export function getAllCategories(): CategoryMeta[] {
    return Object.values(CATEGORY_META);
}
