import React from 'react';
import { CalendarClock } from 'lucide-react';

/**
 * Step 3: Schedule
 * Select date and time for the post
 */
const StepSchedule = ({ scheduledTime, onScheduleChange }) => {
    // Get minimum datetime (now + 2 minutes)
    const getMinDateTime = () => {
        const now = new Date();
        now.setMinutes(now.getMinutes() + 2);
        return now.toISOString().slice(0, 16);
    };

    return (
        <div className="space-y-8">
            <h4 className="text-xl font-extrabold font-['Space_Grotesk'] text-[var(--text)] tracking-tight flex items-center gap-3 border-l-4 border-[var(--accent)] pl-3 mb-6">
                <CalendarClock className="h-5 w-5 text-[var(--accent)]" /> Pick a time
            </h4>

            <div className="max-w-md bg-[var(--bg)] border border-[var(--border)] p-6 md:p-8">
                <label className="block text-xs text-[var(--accent)] mb-4">
                    Publish time
                </label>
                <input
                    type="datetime-local"
                    value={scheduledTime}
                    onChange={(e) => onScheduleChange(e.target.value)}
                    min={getMinDateTime()}
                    className="w-full px-4 py-3 border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:border-[var(--accent)] focus:ring-0 focus:outline-none transition-colors text-sm [color-scheme:dark]"
                />
                <p className="text-xs text-[var(--muted)] mt-4 leading-relaxed">
                    &gt; Buffer requirement: 120,000ms minimum <br />
                    <span className="font-bold text-[var(--accent)]">&gt; Input mapped to Indian Standard Time (IST)</span>
                </p>
            </div>

            {/* Quick Schedule Options */}
            <div>
                <p className="text-xs font-bold text-[var(--accent)] mb-4 flex items-center gap-2">
                    <span className="w-2 h-2 bg-[var(--accent)]"></span> Macros (IST)
                </p>
                <div className="flex flex-wrap gap-3">
                    {[
                        { label: 'Tomorrow 9 AM', hours: 24, setHour: 9 },
                        { label: 'Tomorrow 12 PM', hours: 24, setHour: 12 },
                        { label: 'Tomorrow 6 PM', hours: 24, setHour: 18 },
                        { label: 'In 2 Days', hours: 48, setHour: 10 },
                        { label: 'Next Week', hours: 168, setHour: 10 }
                    ].map((option) => (
                        <button
                            key={option.label}
                            onClick={() => {
                                const date = new Date();
                                date.setDate(date.getDate() + Math.floor(option.hours / 24));
                                date.setHours(option.setHour, 0, 0, 0);
                                // The input expects local time format but we want to ensure user thinks in IST
                                // For now, relying on browser's local time if user is in India is best approach without complex lib
                                // We just format it for the input
                                const offset = date.getTimezoneOffset() * 60000;
                                const localISOTime = (new Date(date.getTime() - offset)).toISOString().slice(0, 16);
                                onScheduleChange(localISOTime);
                            }}
                            className="px-4 py-3 border border-[var(--border)] bg-[var(--surface)] text-xs text-[var(--muted)] hover:bg-[var(--accent)] hover:text-[var(--bg)] hover:border-[var(--accent)] hover:font-bold hover:shadow-[2px_2px_0_0_var(--border)] transition-all"
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default StepSchedule;
