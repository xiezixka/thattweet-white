import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, ChevronDown, Check, Loader2, Plus } from 'lucide-react';
import { cn } from '../../shared/utils/cn';

interface ModelSelectorProps {
    value: string;
    models: string[];
    isLoading?: boolean;
    placeholder?: string;
    disabled?: boolean;
    onChange: (model: string) => void;
    onOpen?: () => void;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
    value,
    models,
    isLoading,
    placeholder = 'Select or type model...',
    disabled,
    onChange,
    onOpen
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [inputValue, setInputValue] = useState(value);
    const [selectedIndex, setSelectedIndex] = useState(-1);
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Update internal input when value prop changes
    useEffect(() => {
        setInputValue(value);
    }, [value]);

    // Fuzzy filter models
    const filteredModels = useMemo(() => {
        if (!inputValue || value === inputValue) return models;
        return models.filter(m =>
            m.toLowerCase().includes(inputValue.toLowerCase())
        );
    }, [models, inputValue, value]);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
                setInputValue(value); // Reset to actual value if cancelled
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [value]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(prev => Math.min(prev + 1, filteredModels.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(prev => Math.max(prev - 1, 0));
        } else if (e.key === 'Enter') {
            if (selectedIndex >= 0 && filteredModels[selectedIndex]) {
                handleSelect(filteredModels[selectedIndex]);
            } else if (inputValue) {
                handleSelect(inputValue); // Allow custom input
            }
        } else if (e.key === 'Escape') {
            setIsOpen(false);
            setInputValue(value);
        }
    };

    const handleSelect = (model: string) => {
        onChange(model);
        setInputValue(model);
        setIsOpen(false);
        setSelectedIndex(-1);
    };

    return (
        <div ref={containerRef} className="relative w-full">
            {/* Input Trigger */}
            <div className={cn(
                "group relative flex items-center transition-all border rounded-xl overflow-hidden",
                "bg-black border-white/5 hover:border-white/20",
                isOpen && "border-white/40 ring-4 ring-white/5",
                disabled && "opacity-50 pointer-events-none"
            )}>
                <div className="pl-4 text-zinc-600">
                    <Search size={14} className={cn(isOpen && "text-white")} />
                </div>
                <input
                    ref={inputRef}
                    type="text"
                    value={inputValue}
                    onChange={(e) => {
                        setInputValue(e.target.value);
                        if (!isOpen) setIsOpen(true);
                    }}
                    onFocus={() => {
                        setIsOpen(true);
                        onOpen?.();
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    className="w-full bg-transparent border-none px-3 py-3 text-sm text-white font-mono placeholder:text-zinc-700 outline-none"
                    disabled={disabled}
                />

                <div className="pr-3 flex items-center gap-2">
                    {isLoading && <Loader2 size={14} className="animate-spin text-zinc-500" />}
                    <ChevronDown size={14} className={cn("text-zinc-600 transition-transform", isOpen && "rotate-180")} />
                </div>
            </div>

            {/* Dropdown Panel */}
            {isOpen && (
                <div className="absolute z-[100] mt-2 w-full bg-black border border-white/10 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,1)] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="max-h-60 overflow-y-auto no-scrollbar py-2">
                        {filteredModels.length === 0 && inputValue && (
                            <button
                                onClick={() => handleSelect(inputValue)}
                                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors"
                            >
                                <div className="w-5 h-5 rounded-lg bg-zinc-800 flex items-center justify-center">
                                    <Plus size={12} className="text-zinc-400" />
                                </div>
                                <div>
                                    <div className="text-sm text-white font-mono">{inputValue}</div>
                                    <div className="text-[10px] text-zinc-600 font-bold uppercase tracking-wider">Use custom model name</div>
                                </div>
                            </button>
                        )}

                        {filteredModels.map((model, index) => (
                            <button
                                key={model}
                                onClick={() => handleSelect(model)}
                                onMouseEnter={() => setSelectedIndex(index)}
                                className={cn(
                                    "w-full flex items-center justify-between px-4 py-3 text-left transition-all",
                                    (index === selectedIndex || value === model) ? "bg-white text-black" : "hover:bg-zinc-900 text-zinc-400"
                                )}
                            >
                                <span className="text-sm font-mono truncate mr-4">
                                    {model}
                                </span>
                                {value === model && <Check size={14} className={cn(index === selectedIndex ? "text-black" : "text-white")} />}
                            </button>
                        ))}
                    </div>

                    {/* Count Indicator */}
                    <div className="px-4 py-2 border-t border-white/5 bg-zinc-950 flex items-center justify-between">
                        <span className="text-[9px] text-zinc-600 font-black uppercase tracking-widest">
                            {filteredModels.length} models matched
                        </span>
                        <span className="text-[9px] text-zinc-700 font-medium">ESC to close</span>
                    </div>
                </div>
            )}
        </div>
    );
};
