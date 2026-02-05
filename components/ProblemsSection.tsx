import React, { useState } from 'react';
import { CategoryResult, TestResult } from '@/lib/types';
import { ChevronDown, ChevronUp, AlertTriangle, XCircle, ShieldCheck, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProblemsSectionProps {
    problems: CategoryResult;
}

export function ProblemsSection({ problems }: ProblemsSectionProps) {
    if (!problems || problems.tests.length === 0) return null;

    const criticals = problems.tests.filter(t => t.status === 'Error');
    const warnings = problems.tests.filter(t => t.status === 'Warning');

    return (
        <div className="w-full rounded-3xl border border-white/10 bg-[#09090b] overflow-hidden shadow-2xl">
            {criticals.length > 0 && (
                <ProblemGroup
                    title="Critical Security Issues"
                    items={criticals}
                    type="critical"
                    defaultOpen={true}
                    className={warnings.length > 0 ? "border-b border-white/5" : ""}
                />
            )}

            {warnings.length > 0 && (
                <ProblemGroup
                    title="Warnings & Recommendations"
                    items={warnings}
                    type="warning"
                    defaultOpen={true} // ALWAYS OPEN by default per user request
                />
            )}
        </div>
    );
}

interface ProblemGroupProps {
    title: string;
    items: TestResult[];
    type: 'critical' | 'warning';
    defaultOpen?: boolean;
    className?: string;
}

function ProblemGroup({ title, items, type, defaultOpen = false, className }: ProblemGroupProps) {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    const isCritical = type === 'critical';

    // Theme (using the same colors but applied to the header bar)
    const theme = isCritical ? {
        bgHeader: "bg-rose-950/30 hover:bg-rose-950/40",
        textHeader: "text-rose-400",
        icon: XCircle,
        badgeParams: "bg-rose-500/10 text-rose-400 border-rose-500/20"
    } : {
        bgHeader: "bg-amber-950/30 hover:bg-amber-950/40",
        textHeader: "text-amber-400",
        icon: AlertTriangle,
        badgeParams: "bg-amber-500/10 text-amber-400 border-amber-500/20"
    };

    return (
        <div className={cn("transition-all", className)}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    "w-full px-6 py-5 flex items-center justify-between transition-all",
                    theme.bgHeader
                )}
            >
                <div className="flex items-center gap-4">
                    <theme.icon className={cn("w-5 h-5", theme.textHeader)} />
                    <h3 className={cn("font-bold text-lg tracking-tight", theme.textHeader)}>
                        {title}
                        <span className="ml-3 text-xs font-bold opacity-70 bg-black/40 px-2.5 py-0.5 rounded-full border border-white/5">
                            {items.length} ISSUES
                        </span>
                    </h3>
                </div>
                {isOpen ? <ChevronUp className={cn("w-5 h-5", theme.textHeader)} />
                    : <ChevronDown className={cn("w-5 h-5", theme.textHeader)} />}
            </button>

            {/* Content */}
            {isOpen && (
                <div className="divide-y divide-white/5 bg-[#0c0c0e]">
                    {items.map((item, idx) => (
                        <div key={idx} className="p-6 hover:bg-white/[0.02] transition-colors">
                            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">

                                {/* Left: Issue Info */}
                                <div className="flex-1 space-y-2">
                                    <div className="flex items-center gap-3">
                                        <span className={cn("text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border", theme.badgeParams)}>
                                            {item.category?.toUpperCase()}
                                        </span>
                                        <h4 className="text-base font-bold text-slate-200">
                                            {item.name}
                                        </h4>
                                    </div>
                                    <p className="text-slate-400 text-sm leading-relaxed">
                                        {item.reason}
                                    </p>

                                    {/* Additional Debug Info Tags */}
                                    {item.info && (
                                        <div className="pt-2">
                                            <span className="text-[10px] font-mono text-slate-500 bg-white/5 px-2 py-1 rounded">
                                                {item.info}
                                            </span>
                                        </div>
                                    )}
                                </div>

                                {/* Right: Action / Recommendation */}
                                <div className="md:w-1/3 flex-shrink-0 bg-[#050505] p-4 rounded-xl border border-white/5">
                                    <div className="flex items-start gap-3">
                                        <ArrowRight className={cn("w-4 h-4 mt-0.5 flex-shrink-0", theme.textHeader)} />
                                        <div>
                                            <p className="text-[10px] font-bold uppercase text-slate-500 mb-1">Recommendation</p>
                                            <p className={cn("text-sm font-medium leading-snug", theme.textHeader)}>
                                                {item.recommendation}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
