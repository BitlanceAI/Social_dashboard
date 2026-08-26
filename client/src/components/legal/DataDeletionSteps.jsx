import React from 'react';

/**
 * Data deletion instructions.
 *
 * Shared by the landing footer's linked page and the standalone
 * /data-deletion route so the two can never drift apart — Meta reads the
 * standalone URL, users read the same content.
 *
 * Radius scale matches the landing page: rounded-xl small, rounded-2xl cards.
 */

const CARD = 'rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-8';

const DataDeletionSteps = () => (
    <div className="space-y-6">
        <div className={CARD}>
            <h2 className="font-['Space_Grotesk'] text-lg font-bold tracking-tight mb-4">
                What we store
            </h2>
            <ul className="space-y-2 text-[var(--muted)] text-sm leading-relaxed list-disc pl-5">
                <li>Your encrypted Meta access token</li>
                <li>Your app-scoped Meta user ID</li>
                <li>The list of Facebook Pages and linked Instagram Business accounts</li>
                <li>The posts you have composed and scheduled</li>
            </ul>
            <p className="text-[var(--muted)] text-sm leading-relaxed mt-4">
                We do not store your Facebook or Instagram password, your direct
                messages, or your comments.
            </p>
        </div>

        <div className={CARD}>
            <h2 className="font-['Space_Grotesk'] text-lg font-bold tracking-tight mb-2">
                How to delete it
            </h2>
            <p className="text-[var(--muted)] text-sm leading-relaxed mb-6">
                Any one of these removes your data. Choose whichever is easiest.
            </p>
            <ol className="space-y-4">
                {[
                    [
                        '01',
                        'From inside this app.',
                        <>
                            Open the Meta dashboard and click <em>Disconnect</em>. Your access
                            token and connection are deleted immediately.
                        </>,
                    ],
                    [
                        '02',
                        'From Facebook.',
                        <>
                            Go to <em>Settings &amp; Privacy &rarr; Settings &rarr; Apps and Websites</em>,
                            find this app, and click <em>Remove</em>. Facebook notifies us and we
                            delete your stored data automatically, then return a confirmation code
                            you can use to check the status of the request.
                        </>,
                    ],
                    [
                        '03',
                        'By email.',
                        <>
                            Write to{' '}
                            <a
                                href="mailto:support@bitlancetechhub.com"
                                className="text-[var(--accent)] hover:underline"
                            >
                                support@bitlancetechhub.com
                            </a>{' '}
                            from the address on your account. We action requests within 30 days.
                        </>,
                    ],
                ].map(([num, label, body]) => (
                    <li
                        key={num}
                        className="flex gap-4 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-5 py-4"
                    >
                        <span className="w-8 h-8 rounded-full bg-[var(--accent-muted)] text-[var(--accent)] font-mono text-[10px] flex items-center justify-center shrink-0">
                            {num}
                        </span>
                        <span className="text-[var(--muted)] text-sm leading-relaxed">
                            <strong className="text-[var(--text)]">{label}</strong> {body}
                        </span>
                    </li>
                ))}
            </ol>
        </div>

        <div className={CARD}>
            <h2 className="font-['Space_Grotesk'] text-lg font-bold tracking-tight mb-4">
                What gets deleted
            </h2>
            <p className="text-[var(--muted)] text-sm leading-relaxed">
                Your Meta access token, your Meta connection record, and every post you
                scheduled through this app. Posts that have already been published to
                Facebook or Instagram remain on those platforms &mdash; delete them there
                if you no longer want them, as we have no way to remove content once
                Meta owns it.
            </p>
        </div>
    </div>
);

export default DataDeletionSteps;
