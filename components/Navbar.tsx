'use client';

import { Search, Loader2, LogIn, LogOut, User as UserIcon, ChevronDown } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { auth } from '@/lib/firebase';
import { User, signOut } from 'firebase/auth';
import { LoginModal } from '@/components/LoginModal';
import { cn } from '@/lib/utils';
import { useOnClickOutside } from '@/lib/hooks';

interface NavbarProps {
    searchState?: {
        value: string;
        onChange: (val: string) => void;
        onSubmit: () => void;
        loading: boolean;
    };
}

export function Navbar({ searchState }: NavbarProps) {
    const [user, setUser] = useState<User | null>(null);
    const [showLogin, setShowLogin] = useState(false);
    const [showDropdown, setShowDropdown] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useOnClickOutside(dropdownRef as React.RefObject<HTMLElement>, () => setShowDropdown(false));

    useEffect(() => {
        const unsubscribe = auth.onAuthStateChanged((u) => {
            setUser(u);
        });
        return () => unsubscribe();
    }, []);

    const handleLogout = async () => {
        await signOut(auth);
        setShowDropdown(false);
    };

    return (
        <>
            <nav className={cn(
                "fixed z-50 transition-all duration-300 flex items-center justify-between border-white/10 backdrop-blur-xl",
                searchState
                    ? "top-0 left-0 w-full h-16 px-6 md:px-12 border-b bg-black/80"
                    : "top-6 left-6 right-6 h-16 rounded-2xl px-6 border bg-black/80 shadow-2xl"
            )}>
                <div className="flex items-center">
                    {/* Logo */}
                    <div className="text-sm font-medium tracking-widest text-white/90 uppercase opacity-80 shrink-0 select-none">
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

                    {/* Auth Section */}
                    <div className="flex items-center gap-4 border-l border-white/10 pl-6 h-8">
                        {user ? (
                            <div className="relative" ref={dropdownRef}>
                                <button
                                    onClick={() => setShowDropdown(!showDropdown)}
                                    className="flex items-center gap-3 p-1.5 pr-3 rounded-full bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 transition-all duration-200 group"
                                >
                                    {/* Avatar */}
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center text-white font-medium text-xs shadow-lg">
                                        {user.photoURL ? (
                                            <img src={user.photoURL} alt="User" className="w-full h-full rounded-full object-cover" />
                                        ) : (
                                            (user.displayName?.[0] || user.email?.[0] || 'U').toUpperCase()
                                        )}
                                    </div>

                                    {/* Name */}
                                    <div className="hidden sm:block text-left">
                                        <p className="text-xs font-semibold text-white/90 group-hover:text-white transition-colors">
                                            {user.displayName || 'User'}
                                        </p>
                                    </div>

                                    <ChevronDown size={14} className={cn("text-white/50 transition-transform duration-200", showDropdown && "rotate-180")} />
                                </button>

                                {/* Dropdown Menu */}
                                {showDropdown && (
                                    <div className="absolute right-0 top-full mt-2 w-56 bg-[#18181b] border border-white/10 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 origin-top-right">
                                        <div className="p-4 border-b border-white/5">
                                            <p className="text-sm font-medium text-white truncate">{user.displayName || 'DomainGuard User'}</p>
                                            <p className="text-xs text-white/50 truncate mt-0.5">{user.email}</p>
                                        </div>
                                        <div className="p-1">
                                            <button
                                                onClick={handleLogout}
                                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-white/5 rounded-lg transition-colors"
                                            >
                                                <LogOut size={16} />
                                                Sign Out
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <button
                                onClick={() => setShowLogin(true)}
                                className="flex items-center gap-2 px-5 py-2 rounded-full bg-white text-black text-sm font-bold tracking-tight hover:bg-zinc-200 active:scale-95 transition-all shadow-lg hover:shadow-white/20"
                            >
                                <LogIn size={14} strokeWidth={2.5} />
                                <span>Sign In</span>
                            </button>
                        )}
                    </div>
                </div>
            </nav>

            {/* Login Modal */}
            <LoginModal isOpen={showLogin} onClose={() => setShowLogin(false)} />
        </>
    );
}
