import React from 'react';
import { CategoryResult, TestResult } from '@/lib/types';
import { AlertTriangle, XCircle, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProblemsSectionProps {
    problems: CategoryResult;
}

export function ProblemsSection({ problems }: ProblemsSectionProps) {
    if (!problems || problems.tests.length === 0) return null;

    const criticals = problems.tests.filter(t => t.status === 'Error');
    const warnings = problems.tests.filter(t => t.status === 'Warning');

    return (
        <div className="w-full space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {criticals.length > 0 && (
                <ProblemList
                    title="Critical Security Issues"
                    items={criticals}
                    type="critical"
                />
            )}

            {warnings.length > 0 && (
                <ProblemList
                    title="Warnings & Recommendations"
                    items={warnings}
                    type="warning"
                />
            )}
        </div>
    );
}

interface ProblemListProps {
    title: string;
    items: TestResult[];
    type: 'critical' | 'warning';
}

function ProblemList({ title, items, type }: ProblemListProps) {
    const isCritical = type === 'critical';

    const theme = isCritical ? {
        textHeader: "text-rose-400",
        icon: XCircle,
        badge: "bg-rose-500/10 text-rose-400 border-rose-500/20",
        recBox: "bg-rose-950/10 border-rose-500/10",
        arrow: "text-rose-400",
        divider: "border-rose-500/10"
    } : {
        textHeader: "text-amber-400",
        icon: AlertTriangle,
        badge: "bg-amber-500/10 text-amber-400 border-amber-500/20",
        recBox: "bg-amber-950/10 border-amber-500/10",
        arrow: "text-amber-400",
        divider: "border-amber-500/10"
    };

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center gap-3 px-2">
                <theme.icon className={cn("w-5 h-5", theme.textHeader)} />
                <div className="flex items-baseline gap-3">
                    <h3 className={cn("font-bold text-xl tracking-tight", theme.textHeader)}>
                        {title}
                    </h3>
                    <span className="text-[9px] font-black opacity-40 bg-white/5 px-2 py-0.5 rounded-full border border-white/10 uppercase tracking-[0.2em]">
                        {items.length} ISSUES
                    </span>
                </div>
            </div>

            {/* SINGLE TABLE CONTAINER */}
            <div className="bg-[#09090b] border border-white/5 rounded-3xl overflow-hidden divide-y divide-white/5">
                {items.map((item, idx) => (
                    <div
                        key={idx}
                        className="relative p-6 md:p-8 hover:bg-white/[0.01] transition-all duration-300"
                    >
                        <div className="relative flex flex-col lg:flex-row lg:items-center gap-8 lg:gap-12">

                            {/* ISSUE INFO (LEFT COLUMN) */}
                            <div className="flex-1 space-y-3">
                                <div className="flex items-center gap-3 flex-wrap">
                                    <span className={cn(
                                        "text-[9px] font-black uppercase tracking-[0.2em] px-2 py-0.5 rounded-md border",
                                        theme.badge
                                    )}>
                                        {item.category || 'SYSTEM'}
                                    </span>
                                    <h4 className="text-lg font-bold text-white tracking-tight leading-tight">
                                        {item.name}
                                    </h4>
                                </div>

                                <p className="text-white/40 text-sm leading-relaxed max-w-2xl">
                                    {item.reason}
                                </p>

                                {item.info && (
                                    <div className="inline-flex items-center px-2 py-1 rounded bg-white/[0.02] border border-white/5">
                                        <span className="text-[10px] font-mono text-white/20 uppercase tracking-tight">
                                            {item.info}
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* RECOMMENDATION (RIGHT COLUMN / TABLE CELL) */}
                            <div className="lg:w-[45%] shrink-0">
                                <div className={cn(
                                    "p-5 rounded-2xl border flex items-center gap-4 group/rec transition-all duration-300",
                                    theme.recBox,
                                    "border-white/5 hover:border-white/10"
                                )}>
                                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-white/5 border border-white/5 shrink-0">
                                        <ArrowRight className={cn("w-4 h-4 transition-transform group-hover/rec:translate-x-1", theme.arrow)} />
                                    </div>
                                    <div className="space-y-0.5 min-w-0">
                                        <p className="text-[9px] font-black uppercase text-white/20 tracking-[0.3em]">Recommendation</p>
                                        <p className={cn("text-sm font-bold leading-tight tracking-tight break-all md:break-words", theme.arrow)}>
                                            {item.recommendation}
                                        </p>
                                    </div>
                                </div>
                            </div>

                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
