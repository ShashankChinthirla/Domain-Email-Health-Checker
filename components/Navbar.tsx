import { Search, Loader2 } from 'lucide-react';

interface NavbarProps {
    searchState?: {
        value: string;
        onChange: (val: string) => void;
        onSubmit: () => void;
        loading: boolean;
    };
}

export function Navbar({ searchState }: NavbarProps) {
    return (
        <nav className="fixed top-0 left-0 w-full h-16 flex items-center justify-between px-6 md:px-12 z-50 border-b border-white/10 bg-black/80 backdrop-blur-xl transition-all duration-300">
            <div className="flex items-center">

                {/* Logo */}
                <div className="text-sm font-medium tracking-widest text-white/90 uppercase opacity-80 shrink-0">
                    DomainGuard <span className="text-white/30 ml-2">PRO</span>
                </div>
            </div>

            <div className="flex items-center gap-6">
                {/* Optional Navbar Search (Visible on Results Page) */}
                {searchState && (
                    <div className="hidden md:flex items-center relative group w-80 animate-in fade-in slide-in-from-right-4 duration-500">
                        <div className="absolute left-3 text-white/40 pointer-events-none">
                            <Search className="w-3.5 h-3.5" />
                        </div>
                        <input
                            type="text"
                            value={searchState.value}
                            onChange={(e) => searchState.onChange(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && searchState.onSubmit()}
                            placeholder="Analyze another domain..."
                            className="w-full h-9 pl-9 pr-4 bg-[#1c1c1e] border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-white/20 focus:ring-1 focus:ring-white/10 transition-all font-medium placeholder-white/20"
                        />
                        {searchState.loading && (
                            <div className="absolute right-3">
                                <Loader2 className="w-3.5 h-3.5 text-white/50 animate-spin" />
                            </div>
                        )}
                    </div>
                )}
            </div>
        </nav>
    );
}
