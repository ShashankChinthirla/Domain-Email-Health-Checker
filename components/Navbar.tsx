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
const ADMIN_EMAILS = ['shashankshashankc39@gmail.com', 'paybalc06@gmail.com'];

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
                "fixed z-50 transition-all duration-300 border-white/10 backdrop-blur-xl flex justify-center",
                searchState
                    ? "top-0 left-0 w-full h-16 border-b bg-black/80"
                    : "top-6 left-6 right-6 md:left-1/2 md:-translate-x-1/2 md:w-[calc(100%-3rem)] md:max-w-7xl h-16 rounded-2xl border bg-black/80 shadow-2xl"
            )}>
                {/* INNER CONSTRAINED CONTAINER MATCHING THE REPORT MAX WIDTH */}
                <div className="w-full max-w-7xl mx-auto px-6 h-full flex items-center justify-between gap-6">

                    {/* Logo */}
                    <a href="/" className="text-sm font-medium tracking-widest text-white/90 uppercase opacity-80 hover:opacity-100 transition-opacity shrink-0 select-none cursor-pointer flex items-center">
                        DOMAINGUARD <span className="text-white/30 ml-2">PRO</span>
                    </a>

                    {/* Right Side (Search + Auth) */}
                    <div className="flex flex-1 items-center justify-end gap-6 sm:gap-8">
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
                        <div className="flex items-center gap-4 h-8 shrink-0">
                            {user ? (
                                <div className="relative" ref={dropdownRef}>
                                    <button
                                        onClick={() => setShowDropdown(!showDropdown)}
                                        className={cn(
                                            "flex items-center justify-center p-0.5 rounded-full bg-[#1c1c1e] hover:bg-[#2c2c2e] border border-white/10 hover:border-white/20 transition-all duration-200 group cursor-pointer shadow-sm hover:shadow-md",
                                            showDropdown && "bg-[#2c2c2e] border-white/20"
                                        )}
                                    >
                                        {/* Avatar */}
                                        <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-500 flex items-center justify-center text-white font-bold text-sm shadow-inner ring-2 ring-black/20">
                                            {user.photoURL ? (
                                                <img src={user.photoURL} alt="User" className="w-full h-full rounded-full object-cover" />
                                            ) : (
                                                (user.displayName?.[0] || user.email?.[0] || 'U').toUpperCase()
                                            )}
                                        </div>
                                    </button>

                                    {/* Dropdown Menu */}
                                    {showDropdown && (
                                        <div className="absolute right-0 top-[calc(100%+1rem)] w-56 bg-[#0a0a0c]/98 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-[0_16px_40px_-5px_rgba(0,0,0,0.8)] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 origin-top-right ring-1 ring-white/5 z-50">

                                            {/* Top specular highlight */}
                                            <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-50" />

                                            {/* User Info Header */}
                                            <div className="p-4 border-b border-white/5 bg-white/[0.02] flex flex-col items-end relative">
                                                <div className="absolute inset-0 bg-gradient-to-b from-white/[0.04] to-transparent pointer-events-none" />
                                                <p className="text-[14px] font-bold tracking-wide text-white/95 truncate w-full text-right drop-shadow-md">{user.displayName || 'DomainGuard User'}</p>
                                                <p className="text-[12px] font-medium text-white/50 truncate mt-0.5 w-full text-right">{user.email}</p>
                                            </div>

                                            {/* Actions */}
                                            <div className="p-1.5 space-y-1 bg-black/20">
                                                {user.email && ADMIN_EMAILS.includes(user.email) && (
                                                    <a
                                                        href="/admin"
                                                        className="w-full flex items-center justify-end gap-3 px-3 py-2.5 text-[13px] font-medium text-emerald-400/90 hover:text-emerald-300 hover:bg-emerald-500/10 rounded-xl transition-all cursor-pointer group"
                                                    >
                                                        Admin Dashboard
                                                        <div className="relative flex h-2 w-2 shrink-0">
                                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-50 group-hover:opacity-100"></span>
                                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]"></span>
                                                        </div>
                                                    </a>
                                                )}

                                                <button
                                                    onClick={handleLogout}
                                                    className="w-full flex items-center justify-end gap-3 px-3 py-2.5 text-[13px] font-medium text-red-400/80 hover:text-red-300 hover:bg-red-500/10 rounded-xl transition-all cursor-pointer group"
                                                >
                                                    Disconnect Session
                                                    <LogOut size={16} className="text-red-400/70 group-hover:text-red-400 transition-colors" />
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <button
                                    onClick={() => setShowLogin(true)}
                                    className="flex items-center gap-2 px-5 py-2 rounded-full bg-white text-black text-sm font-bold tracking-tight hover:bg-zinc-200 active:scale-95 transition-all shadow-lg hover:shadow-white/20 cursor-pointer"
                                >
                                    <LogIn size={14} strokeWidth={2.5} />
                                    <span>Sign In</span>
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </nav>

            {/* Login Modal */}
            <LoginModal isOpen={showLogin} onClose={() => setShowLogin(false)} />
        </>
    );
}
