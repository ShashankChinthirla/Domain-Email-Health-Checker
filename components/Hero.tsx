import React, { useRef } from 'react';
import { Search, Loader2, Upload, ChevronRight } from 'lucide-react';

interface HeroProps {
    domainInput: string;
    setDomainInput: (val: string) => void;
    handleCheck: () => void;
    handleKeyDown: (e: React.KeyboardEvent) => void;
    loading: boolean;
    error: string | null;
    onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export function Hero({
    domainInput,
    setDomainInput,
    handleCheck,
    handleKeyDown,
    loading,
    error,
    onFileUpload
}: HeroProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);

    return (
        <section className="min-h-[calc(100vh-64px)] flex flex-col items-center justify-center px-4 w-full relative overflow-hidden">

            {/* Ambient Titanium Glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-white/[0.03] rounded-full blur-[120px] pointer-events-none" />

            {/* 1. Headline - Titanium Gradient */}
            <div className="relative z-10 text-center mb-6">
                <span className="inline-block py-1 px-3 rounded-full bg-white/5 border border-white/10 text-xs font-medium text-white/60 mb-6 backdrop-blur-md">
                    Passive Domain Analysis v2.0
                </span>
                <h1 className="text-5xl md:text-7xl font-semibold tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white via-white to-white/60 pb-2">
                    Email security.
                    <br />
                    <span className="text-white/40">Re-imagined.</span>
                </h1>
            </div>

            {/* 2. Subtext */}
            <p className="text-lg md:text-xl text-[#86868b] font-medium text-center mb-16 max-w-xl leading-relaxed relative z-10">
                Advanced SPF, DMARC, and DNS diagnostics. <br className="hidden sm:block" />
                Designed for professionals.
            </p>

            {/* 3. SEARCH BOX (Apple Dark Surface) */}
            <div className="relative w-full max-w-xl group z-10">

                {/* Visual Container */}
                <div className="relative flex items-center w-full bg-[#1c1c1e] border border-white/10 shadow-2xl shadow-black/80 rounded-full p-2 transition-all duration-300 focus-within:bg-[#2c2c2e] focus-within:border-white/20 focus-within:scale-[1.02] focus-within:shadow-[0_0_40px_-10px_rgba(255,255,255,0.1)]">

                    {/* Icon */}
                    <div className="pl-5 pr-3 text-white/40">
                        <Search className="w-5 h-5" />
                    </div>

                    {/* Input */}
                    <input
                        type="text"
                        className="w-full bg-transparent border-none text-white placeholder-white/20 text-lg font-medium px-2 py-4 focus:ring-0 focus:outline-none tracking-tight"
                        placeholder="domain.com"
                        value={domainInput}
                        onChange={(e) => setDomainInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        disabled={loading}
                        autoFocus
                    />

                    {/* Button - High Contrast Pill */}
                    <button
                        onClick={handleCheck}
                        disabled={loading || !domainInput}
                        className="mr-1 pl-5 pr-2 py-3 bg-white hover:bg-[#e5e5e5] text-black font-semibold text-sm rounded-full transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2 group/btn"
                    >
                        {loading ? (
                            <Loader2 className="w-5 h-5 animate-spin mr-2" />
                        ) : (
                            <>
                                Analyze <ChevronRight className="w-4 h-4 text-black/60 group-hover/btn:translate-x-0.5 transition-transform" />
                            </>
                        )}
                    </button>
                </div>

                {/* Error Message */}
                {error && (
                    <div className="absolute top-full left-0 right-0 mt-6 text-center">
                        <span className="inline-block px-4 py-2 bg-red-500/10 text-red-300 text-sm font-medium rounded-lg border border-red-500/20 backdrop-blur-md animate-in fade-in slide-in-from-top-2">
                            {error}
                        </span>
                    </div>
                )}

                {/* Subtle File Upload */}
                <div className="absolute top-full left-0 right-0 mt-10 flex justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="text-xs font-medium text-white/20 hover:text-white/60 flex items-center gap-2 transition-colors uppercase tracking-widest"
                    >
                        <Upload className="w-3 h-3" /> or upload list
                    </button>
                    <input type="file" ref={fileInputRef} accept=".xlsx, .xls" className="hidden" onChange={onFileUpload} />
                </div>

            </div>
        </section>
    );
}
