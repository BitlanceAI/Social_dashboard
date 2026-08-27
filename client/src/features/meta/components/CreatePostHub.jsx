import React from 'react';
import { PenLine, Zap, Images, Clock, ArrowRight, Link2 } from 'lucide-react';

/**
 * Create-a-post hub.
 *
 * Only lists creation modes the app can actually perform today. Anything not
 * built yet is marked "Coming soon" and is not clickable — a card that looks
 * live but does nothing is worse than no card, and Meta reviewers open this
 * screen.
 */

const MODES = [
    {
        id: 'schedule',
        icon: Clock,
        title: 'Schedule a Post',
        body: 'Write it now, pick a date and time, and let the scheduler publish it for you.',
        available: true,
    },
    {
        id: 'now',
        icon: Zap,
        title: 'Publish Now',
        body: 'Compose and send it straight to Facebook and Instagram, no waiting.',
        available: true,
    },
];

const UPCOMING = [
    {
        icon: Images,
        title: 'Bulk upload (CSV)',
        body: 'Queue many posts at once from a spreadsheet.',
    },
    {
        icon: PenLine,
        title: 'AI-assisted drafting',
        body: 'Generate captions and variations from a prompt.',
    },
];

const CreatePostHub = ({ isConnected, onSelect, onConnect }) => (
    <div>
        <div className="text-center mb-8">
            <h2 className="font-['Space_Grotesk'] text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text)] mb-2">
                Create a Post
            </h2>
            <p className="text-sm text-[var(--muted)]">
                Choose how you want to publish.
            </p>
        </div>

        {!isConnected && (
            <div className="mb-8 rounded-2xl border border-[var(--accent)] bg-[var(--accent-muted)] px-5 py-4 flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm text-[var(--text)]">
                    Connect a profile first — posting is disabled until then.
                </span>
                <button
                    onClick={onConnect}
                    className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-[var(--accent)] text-white text-xs font-medium hover:bg-[var(--accent-hover)] transition-colors shrink-0"
                >
                    <Link2 className="h-3.5 w-3.5" />
                    Connect a profile
                </button>
            </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {MODES.map(({ id, icon: Icon, title, body }) => (
                <button
                    key={id}
                    onClick={() => isConnected && onSelect(id)}
                    disabled={!isConnected}
                    className="group relative text-left rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm transition-all hover:border-[var(--accent)] hover:shadow-md hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:hover:translate-y-0 disabled:hover:border-[var(--border)]"
                >
                    <div className="w-12 h-12 rounded-2xl bg-[var(--accent-muted)] flex items-center justify-center mb-4">
                        <Icon className="h-5 w-5 text-[var(--accent)]" />
                    </div>
                    <h3 className="font-['Space_Grotesk'] text-base font-bold tracking-tight text-[var(--text)] mb-1.5">
                        {title}
                    </h3>
                    <p className="text-sm text-[var(--muted)] leading-relaxed">{body}</p>
                    <span className="mt-4 inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-widest text-[var(--accent)]">
                        {title === 'Publish Now' ? 'Compose' : 'Start'}
                        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                    </span>
                </button>
            ))}
        </div>

        <div className="mt-12">
            <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--muted)] mb-4">
                Not built yet
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {UPCOMING.map(({ icon: Icon, title, body }) => (
                    <div
                        key={title}
                        className="relative rounded-2xl border border-dashed border-[var(--border)] p-6 select-none opacity-70"
                    >
                        <span className="absolute top-4 right-4 text-[9px] font-mono uppercase tracking-widest px-2 py-1 rounded-full bg-[var(--surface-2)] text-[var(--muted)]">
                            Coming soon
                        </span>
                        <div className="w-12 h-12 rounded-2xl bg-[var(--surface-2)] flex items-center justify-center mb-4">
                            <Icon className="h-5 w-5 text-[var(--muted-2)]" />
                        </div>
                        <h3 className="font-['Space_Grotesk'] text-base font-bold tracking-tight text-[var(--muted-2)] mb-1.5">{title}</h3>
                        <p className="text-sm text-[var(--muted-2)] leading-relaxed">{body}</p>
                    </div>
                ))}
            </div>
        </div>
    </div>
);

export default CreatePostHub;
