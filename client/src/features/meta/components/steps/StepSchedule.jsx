import React from 'react';
import { CalendarClock, AlertCircle, MessageCircle } from 'lucide-react';

/**
 * Step 3: Schedule
 *
 * The <input type="datetime-local"> works in the browser's LOCAL time, so
 * every value here is built from local components. Converting to UTC happens
 * once, at submit, in MetaDashboardPage.
 */

/** Format a Date as the `YYYY-MM-DDTHH:mm` the input expects, in local time. */
const IST_OFFSET_MS = 330 * 60 * 1000;

const toIstInputValue = (date) => {
    const ist = new Date(date.getTime() + IST_OFFSET_MS);
    const pad = (n) => String(n).padStart(2, '0');
    return `${ist.getUTCFullYear()}-${pad(ist.getUTCMonth() + 1)}-${pad(ist.getUTCDate())}`
        + `T${pad(ist.getUTCHours())}:${pad(ist.getUTCMinutes())}`;
};

const futureIstTime = (days, hour) => {
    const istWallClock = new Date(Date.now() + IST_OFFSET_MS);
    istWallClock.setUTCDate(istWallClock.getUTCDate() + days);
    istWallClock.setUTCHours(hour, 0, 0, 0);
    return new Date(istWallClock.getTime() - IST_OFFSET_MS);
};

/** Digits only; 10-digit Indian numbers get the 91 prefix (mirrors the server). */
const normalizePhone = (p) => {
    const digits = String(p || '').replace(/\D/g, '');
    if (!digits) return null;
    return digits.length === 10 ? `91${digits}` : digits;
};
const parsePhones = (text) => [...new Set(String(text || '').split(/[,;\s]+/).map(normalizePhone).filter(Boolean))];

const StepSchedule = ({
    scheduledTime,
    onScheduleChange,
    approvalEnabled = false,
    savedApprovers = [],
    savingApprovers = false,
    reuseApprovers = true,
    onReuseApproversChange,
    onSaveApprovers,
    approverPhones = '',
    onApproverChange = () => {},
}) => {
    const chosenApprovers = parsePhones(approverPhones);
    const toggleSaved = (phone) => {
        const next = chosenApprovers.includes(phone)
            ? chosenApprovers.filter((p) => p !== phone)
            : [...chosenApprovers, phone];
        onApproverChange(next.join(', '));
    };

    // Two minutes of headroom, in local time — using toISOString() here would
    // produce a UTC string and let the user pick times already in the past.
    const min = new Date();
    min.setMinutes(min.getMinutes() + 2);
    const minValue = toIstInputValue(min);

    const chosen = scheduledTime ? new Date(`${scheduledTime}:00+05:30`) : null;
    const isValidDate = chosen && !Number.isNaN(chosen.getTime());
    const isPast = isValidDate && chosen.getTime() < min.getTime();

    const quickPicks = [
        { label: 'In 1 hour', build: () => { const d = new Date(); d.setHours(d.getHours() + 1, d.getMinutes(), 0, 0); return d; } },
        { label: 'Tomorrow 9:00', build: () => futureIstTime(1, 9) },
        { label: 'Tomorrow 12:00', build: () => futureIstTime(1, 12) },
        { label: 'Tomorrow 18:00', build: () => futureIstTime(1, 18) },
        { label: 'Next week', build: () => futureIstTime(7, 10) },
    ];

    return (
        <div className="space-y-4">
            <h4 className="text-xl font-extrabold font-['Space_Grotesk'] text-[var(--text)] tracking-tight flex items-center gap-3 border-l-4 border-[var(--accent)] pl-3 mb-4">
                <CalendarClock className="h-5 w-5 text-[var(--accent)]" /> Pick a time
            </h4>

            <div className={`grid grid-cols-1 gap-4 ${approvalEnabled ? 'lg:grid-cols-2' : ''}`}>
            <div className="rounded-2xl bg-[var(--bg)] border border-[var(--border)] p-5">
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
                                hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata'
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
                    All times are in Indian Standard Time (IST, Asia/Kolkata).
                </p>
            </div>

            {/* Quick picks */}
            <div className="lg:col-start-1 rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-4">
                <p className="text-sm font-medium text-[var(--text)] mb-3">Quick picks</p>
                <div className="flex flex-wrap gap-2">
                    {quickPicks.map(({ label, build }) => (
                        <button
                            key={label}
                            type="button"
                            onClick={() => onScheduleChange(toIstInputValue(build()))}
                            className="px-3 py-2 rounded-full border border-[var(--border)] bg-[var(--bg)] text-xs text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            {/* WhatsApp approval (optional) — only shown when the server has the channel configured */}
            {approvalEnabled && (
                <div className="lg:col-start-2 lg:row-start-1 lg:row-span-2 rounded-2xl bg-[var(--bg)] border border-[var(--border)] p-5">
                    <label htmlFor="approver-phones" className="flex items-center gap-2 text-sm font-medium text-[var(--text)] mb-1">
                        <MessageCircle className="h-4 w-4 text-[var(--accent)]" />
                        WhatsApp approval <span className="text-xs font-normal text-[var(--muted)]">(optional)</span>
                    </label>
                    <p className="text-xs text-[var(--muted)] mb-3 leading-relaxed">
                        Enter your or your client&apos;s WhatsApp number for reviewing posts. Each number gets the post on WhatsApp with Approve / Reject buttons. The post
                        is held until someone approves; the first decision wins.
                    </p>
                    <input
                        id="approver-phones"
                        type="text"
                        inputMode="tel"
                        value={approverPhones || ''}
                        onChange={(e) => onApproverChange(e.target.value)}
                        placeholder="e.g. 9876543210, 919123456789"
                        className="w-full px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:border-[var(--accent)] focus:ring-0 focus:outline-none transition-colors text-sm"
                    />
                    <p className="text-[11px] text-[var(--muted)] mt-2">
                        Separate several numbers with commas. 10-digit numbers are treated as Indian (+91).
                    </p>

                    <div className="mt-3 space-y-2">
                        <label className="flex items-center gap-2 text-sm text-[var(--text)]">
                            <input type="checkbox" checked={reuseApprovers} onChange={e => onReuseApproversChange?.(e.target.checked)} />
                            Reuse these numbers next time
                        </label>
                        <button type="button" disabled={savingApprovers} onClick={onSaveApprovers} className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--text)] disabled:opacity-50">
                            {savingApprovers ? 'Saving…' : 'Save approval numbers'}
                        </button>
                        <p className="text-xs text-[var(--muted)]">Saved for this workspace. Clear the field to skip approval for this post. Uncheck reuse and save to stop filling numbers automatically.</p>
                    </div>
                    {savedApprovers.length > 0 && (
                        <div className="mt-4">
                            <p className="text-xs font-medium text-[var(--text)] mb-2">Previously used</p>
                            <div className="flex flex-wrap gap-2">
                                {savedApprovers.map((phone) => {
                                    const active = chosenApprovers.includes(phone);
                                    return (
                                        <button
                                            key={phone}
                                            type="button"
                                            onClick={() => toggleSaved(phone)}
                                            className={`px-3 py-1.5 rounded-full border text-xs transition-colors ${active
                                                ? 'border-[var(--accent)] bg-[var(--accent-muted)] text-[var(--accent)]'
                                                : 'border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]'}`}
                                        >
                                            +{phone}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {chosenApprovers.length > 0 && (
                        <p className="text-sm text-[var(--text)] mt-4">
                            Will ask{' '}
                            <span className="font-medium">{chosenApprovers.map((p) => `+${p}`).join(', ')}</span>
                            {' '}before publishing.
                        </p>
                    )}
                </div>
            )}
            </div>
        </div>
    );
};

export default StepSchedule;
