'use client';

import { useState, useEffect } from 'react';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/Navbar';
import { Save, Mail, User as UserIcon, MessageSquare, Loader2, ArrowLeft, CheckCircle2, Shield, Plus, Trash2, ChevronDown, ChevronUp, X } from 'lucide-react';
import { getUserSettings, saveUserSettings } from '@/app/settings/actions';
import { UserSettings, DEFAULT_SETTINGS } from '@/app/settings/types';
import { isAdmin, getAdmins, addAdmin, removeAdmin, AdminUser } from '@/lib/roles';

export default function SettingsPage() {
    const [user, setUser] = useState<User | null | undefined>(undefined);
    const [isUserAdmin, setIsUserAdmin] = useState(false);
    const router = useRouter();

    const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState({ text: '', isError: false });

    // Admin array state
    const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
    const [newAdminEmails, setNewAdminEmails] = useState<string[]>([]);
    const [adminInputValue, setAdminInputValue] = useState('');
    const [isManagingAdmins, setIsManagingAdmins] = useState(false);
    const [isAccessMgmtOpen, setIsAccessMgmtOpen] = useState(false);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (currentUser === null) {
                router.push('/');
                return;
            }
            setUser(currentUser);

            if (currentUser.email) {
                const adminStatus = await isAdmin(currentUser.email);
                setIsUserAdmin(adminStatus);

                const res = await getUserSettings(currentUser.email);
                if (res.success && res.settings) {
                    setSettings(res.settings);
                }

                if (adminStatus) {
                    const adminsList = await getAdmins();
                    setAdminUsers(adminsList);
                }
            } else {
                setIsUserAdmin(false);
            }
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [router]);

    const handleSave = async () => {
        if (!user || !user.email) return;

        setIsSaving(true);
        setSaveMessage({ text: '', isError: false });

        const res = await saveUserSettings(user.email, settings);

        if (res.success) {
            setSaveMessage({ text: 'Settings saved successfully!', isError: false });
            // Dispatch event to trigger navbar to update its display name
            window.dispatchEvent(new Event('user-settings-updated'));
        } else {
            setSaveMessage({ text: 'Failed to save settings.', isError: true });
        }

        setIsSaving(false);

        // Clear success message after 3 seconds
        setTimeout(() => {
            setSaveMessage({ text: '', isError: false });
        }, 3000);
    };

    const handleAddAdmin = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();

        let emailsToProcess = [...newAdminEmails];
        // If there's an active typed email not yet tokenized, try to add it
        if (adminInputValue.trim()) {
            const val = adminInputValue.trim().toLowerCase();
            // Basic email regex before processing
            if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val) && !emailsToProcess.includes(val)) {
                emailsToProcess.push(val);
            }
        }

        if (emailsToProcess.length === 0 || !user?.email) return;

        setIsManagingAdmins(true);
        let successCount = 0;
        let lastError = '';

        for (const email of emailsToProcess) {
            const res = await addAdmin(email, user.email);
            if (res.success) {
                successCount++;
            } else {
                lastError = res.message || `Failed to add ${email}.`;
            }
        }

        if (successCount > 0) {
            setSaveMessage({ text: `Successfully added ${successCount} admin(s).`, isError: false });
            setNewAdminEmails([]);
            setAdminInputValue('');
            const adminsList = await getAdmins();
            setAdminUsers(adminsList);
        } else if (lastError) {
            setSaveMessage({ text: lastError, isError: true });
        }

        setIsManagingAdmins(false);
        setTimeout(() => setSaveMessage({ text: '', isError: false }), 3000);
    };

    const handleEmailInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === ',') {
            e.preventDefault();
            const val = adminInputValue.trim().toLowerCase();
            if (val && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
                if (!newAdminEmails.includes(val)) {
                    setNewAdminEmails([...newAdminEmails, val]);
                }
                setAdminInputValue('');
            }
        } else if (e.key === 'Backspace' && !adminInputValue && newAdminEmails.length > 0) {
            e.preventDefault();
            // Remove the last token on backspace if input is empty
            const lastEmail = newAdminEmails[newAdminEmails.length - 1];
            setNewAdminEmails(newAdminEmails.slice(0, -1));
            setAdminInputValue(lastEmail);
        }
    };

    const removeEmailToken = (email: string) => {
        setNewAdminEmails(newAdminEmails.filter(e => e !== email));
    };

    const handleRemoveAdmin = async (emailToRemove: string) => {
        if (!user?.email || !confirm(`Are you sure you want to revoke admin access for ${emailToRemove}?`)) return;

        setIsManagingAdmins(true);
        const res = await removeAdmin(emailToRemove, user.email);

        if (res.success) {
            setSaveMessage({ text: 'Admin removed successfully.', isError: false });
            const adminsList = await getAdmins();
            setAdminUsers(adminsList);
        } else {
            setSaveMessage({ text: res.message || 'Failed to remove admin.', isError: true });
        }
        setIsManagingAdmins(false);
        setTimeout(() => setSaveMessage({ text: '', isError: false }), 3000);
    };

    if (user === undefined || isLoading) {
        return (
            <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
                <Loader2 className="w-6 h-6 text-white/50 animate-spin" />
            </div>
        );
    }

    if (!user) return null;

    return (
        <div className="min-h-screen bg-[#09090b] text-white selection:bg-blue-500/30 font-sans pb-32">
            <Navbar />

            <main className="w-[calc(100%-3rem)] max-w-7xl mx-auto px-6 pt-24 animate-in fade-in slide-in-from-bottom-4 duration-500">

                {/* Header Sequence */}
                <div className="flex flex-col">
                    <button
                        onClick={() => router.back()}
                        className="group flex items-center gap-2 text-[14px] font-semibold text-zinc-400 hover:text-white hover:bg-white/10 cursor-pointer transition-all duration-200 w-fit -ml-2 px-2.5 py-1.5 rounded-lg"
                    >
                        <ArrowLeft size={16} className="text-zinc-500 group-hover:text-white transition-colors" /> Dashboard
                    </button>
                    <div className="mb-6 mt-1">
                        <h1 className="text-3xl font-bold tracking-tight text-white mb-1">{isUserAdmin ? 'Settings' : 'Profile'}</h1>
                        <p className="text-[13px] text-white/40 leading-relaxed">
                            {isUserAdmin ? 'Manage outbound communication preferences and signatures from this dashboard.' : 'Update your personal profile information.'}
                        </p>
                    </div>
                </div>

                <div className="space-y-8 bg-[#111] border border-white/5 rounded-2xl p-6 md:p-8">

                    {/* section: General Profile (All Users) */}
                    <section className="grid grid-cols-1 lg:grid-cols-[250px_1fr] gap-6">
                        <div className="flex flex-col gap-1.5 pt-2">
                            <h2 className="text-[16px] font-semibold text-white">Account Basics</h2>
                            <p className="text-[13px] text-white/50 leading-relaxed">Your personal profile information.</p>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1.5 flex flex-col md:col-span-2">
                                <label className="text-[13px] font-medium text-white/60">Email Address (Read-only)</label>
                                <input
                                    type="text"
                                    value={user.email || ''}
                                    disabled
                                    className="w-full h-10 bg-[#1a1a1c] border border-white/5 rounded-lg px-3 text-[14px] text-white/40 cursor-not-allowed"
                                />
                            </div>
                            <div className="space-y-1.5 flex flex-col md:col-span-2">
                                <label className="text-[13px] font-medium text-white/60">Display Name</label>
                                <input
                                    type="text"
                                    value={settings.displayName}
                                    onChange={(e) => setSettings({ ...settings, displayName: e.target.value })}
                                    className="w-full h-10 bg-[#111] border border-white/10 rounded-lg px-3 text-[14px] text-white/90 focus:outline-none focus:border-white/20 focus:bg-zinc-900 transition-colors"
                                    placeholder="e.g. John Doe"
                                />
                            </div>
                        </div>
                    </section>

                    {isUserAdmin && (
                        <>
                            <div className="w-full h-px bg-white/5" />

                            {/* section: Access Management */}
                            <section className="grid grid-cols-1 lg:grid-cols-[250px_1fr] gap-6">
                                <div className="flex flex-col gap-1.5 pt-2">
                                    <h2 className="text-[16px] font-semibold text-white">Access Management</h2>
                                    <p className="text-[13px] text-white/50 leading-relaxed">Control which accounts have root authorization.</p>
                                </div>

                                <div className="flex flex-col space-y-4">
                                    <form onSubmit={handleAddAdmin} className="flex flex-col sm:flex-row items-center gap-3 w-full">
                                        <div
                                            className="flex-1 w-full min-h-10 bg-[#141417] border border-white/10 rounded-lg p-1.5 flex flex-wrap items-center gap-1.5 focus-within:border-white/20 focus-within:bg-zinc-900 transition-colors cursor-text"
                                            onClick={() => document.getElementById('admin-email-input')?.focus()}
                                        >
                                            {newAdminEmails.map(email => (
                                                <div key={email} className="flex items-center gap-1 text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-1 rounded-md text-[13px] font-medium tracking-wide shadow-sm">
                                                    {email}
                                                    <button
                                                        type="button"
                                                        onClick={(e) => { e.stopPropagation(); removeEmailToken(email); }}
                                                        className="text-blue-400/50 hover:text-blue-400 transition-colors ml-0.5"
                                                    >
                                                        <X className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            ))}
                                            <input
                                                id="admin-email-input"
                                                type="text"
                                                value={adminInputValue}
                                                onChange={(e) => setAdminInputValue(e.target.value)}
                                                onKeyDown={handleEmailInputKeyDown}
                                                placeholder={newAdminEmails.length === 0 ? "rafi@gmail.com, sabir@gmail.com..." : ""}
                                                className="flex-1 min-w-[180px] bg-transparent border-none text-[14px] text-white/90 focus:outline-none focus:ring-0 px-1 py-1"
                                                disabled={isManagingAdmins}
                                            />
                                        </div>
                                        <button
                                            type="submit"
                                            disabled={isManagingAdmins || (newAdminEmails.length === 0 && !adminInputValue.trim())}
                                            className="h-10 px-5 w-full sm:w-auto flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-[13px] rounded-lg transition-colors shadow-[0_0_15px_rgba(37,99,235,0.2)] disabled:opacity-50 disabled:shadow-none cursor-pointer whitespace-nowrap"
                                        >
                                            {isManagingAdmins ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send Invite'}
                                        </button>
                                    </form>

                                    <div className="bg-[#141417] border border-white/10 rounded-xl overflow-hidden shadow-inner max-h-[250px] overflow-y-auto">
                                        <ul className="divide-y divide-white/5">
                                            {adminUsers.map((admin) => (
                                                <li key={admin.email} className="flex items-center justify-between p-3 hover:bg-white/5 transition-colors">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-blue-500/20 to-indigo-500/20 flex items-center justify-center border border-white/5 text-blue-400 shrink-0">
                                                            <Shield className="w-3.5 h-3.5" />
                                                        </div>
                                                        <div className="flex flex-col min-w-0">
                                                            <span className="text-[13px] font-bold text-white/90 truncate">{admin.email}</span>
                                                            <span className="text-[11px] text-white/40 truncate">Added by {admin.addedBy}</span>
                                                        </div>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveAdmin(admin.email)}
                                                        disabled={isManagingAdmins || admin.email === 'shashankshashankc39@gmail.com' || admin.email === user?.email}
                                                        className="p-2 text-rose-500/50 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                                                        title="Revoke Access"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </li>
                                            ))}
                                            {adminUsers.length === 0 && (
                                                <li className="p-6 text-center text-white/30 text-[13px]">No active administrators found.</li>
                                            )}
                                        </ul>
                                    </div>
                                </div>
                            </section>

                            <div className="w-full h-px bg-white/5" />

                            {/* section: Signature details */}
                            <section className="grid grid-cols-1 lg:grid-cols-[250px_1fr] gap-6">
                                <div className="flex flex-col gap-1.5 pt-2">
                                    <h2 className="text-[16px] font-semibold text-white">Signature Details</h2>
                                    <p className="text-[13px] text-white/50 leading-relaxed">Personal details appended to custom outreach emails for admins.</p>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-1.5 flex flex-col">
                                        <label className="text-[13px] font-medium text-white/60">Full Name</label>
                                        <input
                                            type="text"
                                            value={settings.senderName}
                                            onChange={(e) => setSettings({ ...settings, senderName: e.target.value })}
                                            className="w-full h-10 bg-[#141417] border border-white/10 rounded-lg px-3 text-[14px] text-white/90 focus:outline-none focus:border-white/20 focus:bg-zinc-900 transition-colors"
                                            placeholder="e.g. Security Admin"
                                        />
                                    </div>
                                    <div className="space-y-1.5 flex flex-col">
                                        <label className="text-[13px] font-medium text-white/60">Job Role</label>
                                        <input
                                            type="text"
                                            value={settings.senderTitle}
                                            onChange={(e) => setSettings({ ...settings, senderTitle: e.target.value })}
                                            className="w-full h-10 bg-[#141417] border border-white/10 rounded-lg px-3 text-[14px] text-white/90 focus:outline-none focus:border-white/20 focus:bg-zinc-900 transition-colors"
                                            placeholder="e.g. Head of IT"
                                        />
                                    </div>
                                    <div className="space-y-1.5 flex flex-col md:col-span-2">
                                        <label className="text-[13px] font-medium text-white/60">Contact Number</label>
                                        <input
                                            type="text"
                                            value={settings.senderPhone}
                                            onChange={(e) => setSettings({ ...settings, senderPhone: e.target.value })}
                                            className="w-full h-10 bg-[#141417] border border-white/10 rounded-lg px-3 text-[14px] text-white/90 focus:outline-none focus:border-white/20 focus:bg-zinc-900 transition-colors"
                                            placeholder="e.g. +1 (555) 000-0000"
                                        />
                                    </div>
                                </div>
                            </section>

                            <div className="w-full h-px bg-white/5" />

                            {/* section: email client */}
                            <section className="grid grid-cols-1 lg:grid-cols-[250px_1fr] gap-6">
                                <div className="flex flex-col gap-1.5 pt-2">
                                    <h2 className="text-[16px] font-semibold text-white">Email Client Routing</h2>
                                    <p className="text-[13px] text-white/50 leading-relaxed">Select what app opens when you click a domain owner's email address in the dashboard.</p>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    {[
                                        { id: 'default', label: 'System Default', desc: 'Mail, Outlook app, Apple Mail' },
                                        { id: 'gmail', label: 'Google Workspace', desc: 'New tab in Gmail web client' },
                                        { id: 'outlook', label: 'Microsoft 365', desc: 'New tab in Outlook web client' }
                                    ].map((option) => {
                                        const isActive = settings.emailClient === option.id;
                                        return (
                                            <button
                                                key={option.id}
                                                onClick={() => setSettings({ ...settings, emailClient: option.id as any })}
                                                className={`group relative text-left flex flex-col p-4 rounded-xl border transition-all duration-200 outline-none cursor-pointer hover:-translate-y-0.5 ${isActive
                                                    ? 'bg-zinc-800 border-white/20 shadow-md ring-1 ring-white/10'
                                                    : 'bg-[#141417] border-white/10 hover:bg-[#1f1f22] hover:border-white/20 hover:shadow-sm'
                                                    }`}
                                            >
                                                <span className={`text-[14px] font-medium transition-colors pr-6 ${isActive ? 'text-white' : 'text-white/70 group-hover:text-white/90'}`}>
                                                    {option.label}
                                                </span>
                                                <span className="text-[12px] text-white/40 mt-1">{option.desc}</span>
                                                <div className={`absolute top-4 right-4 flex items-center justify-center w-3 h-3 rounded-full border transition-colors ${isActive ? 'border-transparent' : 'border-white/20 group-hover:border-white/40 bg-black/20'}`}>
                                                    {isActive && (
                                                        <div className="w-2 h-2 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
                                                    )}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </section>

                            <div className="w-full h-px bg-white/5" />

                            {/* section: message template */}
                            <section className="grid grid-cols-1 lg:grid-cols-[250px_1fr] gap-6">
                                <div className="flex flex-col gap-1.5 pt-2">
                                    <h2 className="text-[16px] font-semibold text-white">Issue Outreach Template</h2>
                                    <p className="text-[13px] text-white/50 leading-relaxed">This text gets automatically injected into the email body along with the exact issues found when a domain has problems.</p>
                                </div>
                                <div className="flex relative">
                                    <textarea
                                        value={settings.messageTemplate}
                                        onChange={(e) => setSettings({ ...settings, messageTemplate: e.target.value })}
                                        rows={8}
                                        className="w-full bg-[#141417] border border-white/10 rounded-xl p-4 text-[14px] text-white/80 focus:outline-none focus:border-white/20 focus:bg-zinc-900 transition-all font-medium resize-y"
                                        placeholder="Write your default email message..."
                                    />
                                </div>
                            </section>
                        </>
                    )}
                </div>

            </main>

            {/* Floating Action Bar */}
            <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-8 duration-700 pointer-events-none">
                <div className="flex items-center gap-6 bg-[#1a1a1c]/90 backdrop-blur-xl border border-white/10 pl-6 pr-2 py-2 rounded-full shadow-[0_20px_40px_-15px_rgba(0,0,0,0.7)] pointer-events-auto">
                    <div className="flex items-center gap-2 min-w-[200px]">
                        {saveMessage.text ? (
                            <span className={`text-[13px] font-medium flex items-center gap-1.5 ${saveMessage.isError ? "text-rose-400" : "text-emerald-400"}`}>
                                {!saveMessage.isError && <CheckCircle2 className="w-4 h-4" />}
                                {saveMessage.text}
                            </span>
                        ) : (
                            <div className="flex items-center gap-2.5">
                                <div className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                                </div>
                                <span className="text-[13px] font-medium text-white/50 tracking-wide">Unsaved changes</span>
                            </div>
                        )}
                    </div>

                    <div className="w-px h-6 bg-white/10" />

                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="flex items-center gap-2 bg-white text-black px-6 py-2.5 rounded-full font-bold text-[13px] hover:bg-gray-200 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin text-black/50" /> : 'Save'}
                    </button>
                </div>
            </div>
        </div>
    );
}
