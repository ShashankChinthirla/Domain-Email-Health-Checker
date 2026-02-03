import React from 'react';
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FullHealthReport } from '@/lib/types';

interface VerdictBannerProps {
    report: FullHealthReport;
}

export function VerdictBanner({ report }: VerdictBannerProps) {
    // Safety checks
    if (!report || !report.categories || !report.categories.problems) {
        return null;
    }

    const problems = report.categories.problems.tests || [];
    const errorCount = problems.filter(p => p.status === 'Error').length;
    const warningCount = problems.filter(p => p.status === 'Warning').length;

    // Strict verdict logic
    const hasErrors = errorCount > 0;
    const hasWarnings = warningCount > 0;

    let bgClass = "bg-green-50 border-green-200 text-green-900";
    let iconClass = "bg-green-100 text-green-600";
    let Icon = CheckCircle2;
    let title = "All Systems Operational";
    let message = "No critical issues detected. Your domain health is excellent.";

    if (hasErrors) {
        bgClass = "bg-red-50 border-red-200 text-red-900";
        iconClass = "bg-red-100 text-red-600";
        Icon = XCircle;
        title = "Action Required";
        message = `${errorCount} critical issue${errorCount === 1 ? '' : 's'} detected. Immediate attention required.`;
    } else if (hasWarnings) {
        bgClass = "bg-yellow-50 border-yellow-200 text-yellow-900";
        iconClass = "bg-yellow-100 text-yellow-600";
        Icon = AlertTriangle;
        title = "Warnings Detected";
        message = `${warningCount} warning${warningCount === 1 ? '' : 's'} detected. Review recommendations to improve health.`;
    }

    return (
        <div className={cn(
            "rounded-xl p-6 mb-8 border shadow-sm flex items-start sm:items-center justify-between gap-4",
            bgClass
        )}>
            <div className="flex items-center gap-4">
                <div className={cn("p-3 rounded-full flex-shrink-0", iconClass)}>
                    <Icon className="w-8 h-8" />
                </div>
                <div>
                    <h2 className="text-xl font-bold tracking-tight">{title}</h2>
                    <p className={cn("text-sm mt-1 opacity-90")}>{message}</p>
                </div>
            </div>

            {/* Action Button */}
            {(hasErrors || hasWarnings) && (
                <div className="hidden sm:block">
                    <span className={cn(
                        "inline-flex items-center px-4 py-2 rounded-lg border text-sm font-semibold shadow-sm",
                        hasErrors
                            ? "bg-white/60 border-red-200 text-red-800"
                            : "bg-white/60 border-yellow-200 text-yellow-800"
                    )}>
                        View Problems ↓
                    </span>
                </div>
            )}
        </div>
    );
}
