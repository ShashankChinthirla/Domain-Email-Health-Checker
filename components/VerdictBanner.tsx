import React from 'react';
import { ShieldCheck, ShieldAlert, CheckCircle2, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FullHealthReport } from '@/lib/types';

interface VerdictBannerProps {
    report: FullHealthReport;
}

export function VerdictBanner({ report }: VerdictBannerProps) {
    if (!report || !report.categories || !report.categories.problems) return null;

    const problemTests = report.categories.problems.tests || [];
    const errorCount = problemTests.filter(p => p.status === 'Error').length;
    const isSecure = errorCount === 0;

    // Content Strategy: Plain English, No Technical Jargon in the Header
    const content = isSecure ? {
        title: "Domain is Secure",
        desc: "Your email configuration is safe. No critical issues found.",
        borderColor: "border-emerald-500",
        iconColor: "text-emerald-500",
        Icon: ShieldCheck
    } : {
        title: "Domain is At Risk",
        desc: "Attackers can likely spoof emails from your domain.",
        borderColor: "border-rose-500",
        iconColor: "text-rose-500",
        Icon: ShieldAlert
    };

    const statusStyles = isSecure ? {
        container: "bg-gradient-to-br from-emerald-950/40 to-emerald-900/20 border-emerald-500/20 shadow-[0_0_40px_-10px_rgba(16,185,129,0.1)]",
        iconBox: "bg-emerald-500/10 text-emerald-500",
        title: "text-emerald-400",
        badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
        pulse: "bg-emerald-500"
    } : {
        container: "bg-gradient-to-br from-rose-950/40 to-rose-900/20 border-rose-500/20 shadow-[0_0_40px_-10px_rgba(244,63,94,0.1)]",
        iconBox: "bg-rose-500/10 text-rose-500",
        title: "text-rose-400",
        badge: "bg-rose-500/10 text-rose-400 border-rose-500/20",
        pulse: "bg-rose-500"
    };

    return (
        <div className={cn(
            "w-full rounded-3xl border backdrop-blur-xl p-6 relative overflow-hidden group hover:scale-[1.005] transition-all duration-500",
            statusStyles.container
        )}>
            {/* Subtle Noise / Highlight Overlay */}
            <div className="absolute inset-0 bg-white/[0.02] pointer-events-none" />

            <div className="relative flex flex-col md:flex-row items-center gap-6">

                {/* ICON BOX */}
                <div className={cn("p-4 rounded-2xl shrink-0 border border-white/5", statusStyles.iconBox)}>
                    <content.Icon className="w-8 h-8" strokeWidth={1.5} />
                </div>

                {/* TEXT CONTENT */}
                <div className="flex-1 text-center md:text-left space-y-1">
                    <h2 className={cn("text-xl font-bold tracking-tight", statusStyles.title)}>
                        {content.title}
                    </h2>
                    <p className="text-white/60 text-base font-medium leading-relaxed">
                        {content.desc}
                    </p>
                </div>

                {/* ACTION / STATUS BADGE */}
                <div className={cn(
                    "px-5 py-2 rounded-full border text-xs font-bold uppercase tracking-widest flex items-center gap-2.5",
                    statusStyles.badge
                )}>
                    <span className="relative flex h-2 w-2">
                        <span className={cn("animate-ping absolute inline-flex h-full w-full rounded-full opacity-75", statusStyles.pulse)}></span>
                        <span className={cn("relative inline-flex rounded-full h-2 w-2", statusStyles.pulse)}></span>
                    </span>
                    {isSecure ? "System Secure" : "Action Required"}
                </div>
            </div>
        </div>
    );
}
