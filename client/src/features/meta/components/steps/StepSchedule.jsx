import React from 'react';
import { CalendarClock, AlertCircle } from 'lucide-react';

/**
 * Step 3: Schedule
 *
 * The <input type="datetime-local"> works in the browser's LOCAL time, so
 * every value here is built from local components. Converting to UTC happens
 * once, at submit, in MetaAdsPage.
 */

/** Format a Date as the `YYYY-MM-DDTHH:mm` the input expects, in local time. */
const toLocalInputValue = (date) => {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
        + `T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const StepSchedule = ({ scheduledTime, onScheduleChange }) => {
    // Two minutes of headroom, in local time — using toISOString() here would
    // produce a UTC string and let the user pick times already in the past.
    const min = new Date();
    min.setMinutes(min.getMinutes() + 2);
    const minValue = toLocalInputValue(min);

    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    const chosen = scheduledTime ? new Date(scheduledTime) : null;
    const isValidDate = chosen && !Number.isNaN(chosen.getTime());
    const isPast = isValidDate && chosen.getTime() < Date.now();

    const quickPicks = [
        { label: 'In 1 hour', build: () => { const d = new Date(); d.setHours(d.getHours() + 1, d.getMinutes(), 0, 0); return d; } },
        { label: 'Tomorrow 9:00', build: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d; } },
        { label: 'Tomorrow 12:00', build: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(12, 0, 0, 0); return d; } },
        { label: 'Tomorrow 18:00', build: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(18, 0, 0, 0); return d; } },
        { label: 'Next week', build: () => { const d = new Date(); d.setDate(d.getDate() + 7); d.setHours(10, 0, 0, 0); return d; } },
    ];

    return (
        <div className="space-y-8">
            <h4 className="text-xl font-extrabold font-['Space_Grotesk'] text-[var(--text)] tracking-tight flex items-center gap-3 border-l-4 border-[var(--accent)] pl-3 mb-6">
                <CalendarClock className="h-5 w-5 text-[var(--accent)]" /> Pick a time
            </h4>

            <div className="max-w-md rounded-2xl bg-[var(--bg)] border border-[var(--border)] p-6">
                <label htmlFor="scheduled-time" className="block text-sm font-medium text-[var(--text)] mb-3">
                    Publish time
                </label>
                <input
                    id="scheduled-time"
                    type="datetime-local"
                    value={scheduledTime || ''}
                    onChange={(e) => onScheduleChange(e.target.value)}
                    min={minValue}
                    className="w-full px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:border-[var(--accent)] focus:ring-0 focus:outline-none transition-colors text-sm"
                />

                {isValidDate && !isPast && (
                    <p className="text-sm text-[var(--text)] mt-4">
                        Publishes{' '}
                        <span className="font-medium">
                            {chosen.toLocaleString(undefined, {
                                weekday: 'short', day: 'numeric', month: 'short',
                                hour: '2-digit', minute: '2-digit'
                            })}
                        </span>
                    </p>
                )}

                {isPast && (
                    <p className="text-sm text-red-500 mt-4 flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                        That time has already passed — pick a time at least a couple of minutes from now.
                    </p>
                )}

                <p className="text-xs text-[var(--muted)] mt-4 leading-relaxed">
                    Times use your device&apos;s timezone ({timeZone}). We convert to UTC when
                    saving, so the post goes out at the moment you picked.
                </p>
            </div>

            {/* Quick picks */}
            <div>
                <p className="text-sm font-medium text-[var(--text)] mb-3">Quick picks</p>
                <div className="flex flex-wrap gap-3">
                    {quickPicks.map(({ label, build }) => (
                        <button
                            key={label}
                            type="button"
                            onClick={() => onScheduleChange(toLocalInputValue(build()))}
                            className="px-4 py-2.5 rounded-full border border-[var(--border)] bg-[var(--surface)] text-sm text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default StepSchedule;
