import React, { useState, useEffect } from 'react';
import { CalendarDays, ArrowRight } from 'lucide-react';
import { fetchUpcomingOccasions } from '../lib/occasionsApi';

const DAY_MS = 24 * 60 * 60 * 1000;

const fmtDate = (iso) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

const daysAway = (iso, now) => {
    const d = Math.round((new Date(`${iso}T00:00:00`).getTime() - now) / DAY_MS);
    if (d <= 0) return 'today';
    if (d === 1) return 'tomorrow';
    return `in ${d} days`;
};

/**
 * Horizontal strip of upcoming dated occasions shown in Create-a-Post. Tapping
 * one hands the occasion to `onPick` (the composer opens the matching template).
 * Renders nothing when there is nothing upcoming, so it stays quiet off-season.
 */
const OccasionStrip = ({ onPick }) => {
    const [occasions, setOccasions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [now] = useState(() => Date.now());

    useEffect(() => {
        let cancelled = false;
        fetchUpcomingOccasions(45)
            .then((list) => { if (!cancelled) setOccasions(list); })
            .catch(() => {})
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, []);

    if (loading || occasions.length === 0) return null;

    return (
        <div className="mb-8">
            <div className="flex items-center gap-2 mb-3">
                <CalendarDays className="h-4 w-4 text-[var(--accent)]" />
                <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--muted)]">
                    Upcoming occasions
                </span>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
                {occasions.slice(0, 12).map((o) => (
                    <button
                        key={`${o.slug}-${o.date}`}
                        onClick={() => onPick?.(o)}
                        className="group shrink-0 w-44 text-left rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 hover:border-[var(--accent)] transition-colors"
                    >
                        <p className="font-['Space_Grotesk'] text-sm font-bold tracking-tight text-[var(--text)] line-clamp-2 mb-2 min-h-[2.5rem]">
                            {o.name}
                        </p>
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-mono text-[var(--muted)]">
                                {fmtDate(o.date)} · {daysAway(o.date, now)}
                            </span>
                            <ArrowRight className="h-3.5 w-3.5 text-[var(--accent)] transition-transform group-hover:translate-x-0.5" />
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
};

export default OccasionStrip;
