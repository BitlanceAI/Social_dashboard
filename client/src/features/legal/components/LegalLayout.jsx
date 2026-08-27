import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import Logo from '../layout/Logo';

/**
 * Shared chrome for the three legal pages — Privacy Policy, Terms of Service
 * and Data Deletion Instructions.
 *
 * All three are read by Meta App Review side by side, so they share one shell:
 * same header, same eyebrow/title/lede block, same card scale, same footer.
 * Radius scale matches the landing page: rounded-xl small, rounded-2xl cards.
 */

/** Card shell used by every section on a legal page. */
export const CARD = 'rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-8';

/** Section heading inside a card. */
export const CARD_TITLE = "font-['Space_Grotesk'] text-lg font-bold tracking-tight mb-4";

/** Body copy inside a card. */
export const BODY = 'text-[var(--muted)] text-sm leading-relaxed';

/** Bulleted list inside a card. */
export const LIST = `${BODY} space-y-2 list-disc pl-5 marker:text-[var(--accent)]`;

/** A titled card section. */
export const LegalSection = ({ title, children }) => (
    <section className={CARD}>
        <h2 className={CARD_TITLE}>{title}</h2>
        {children}
    </section>
);

const LINKS = [
    { to: '/privacy-policy', label: 'Privacy Policy' },
    { to: '/terms-policy', label: 'Terms of Service' },
    { to: '/data-deletion', label: 'Data Deletion' },
];

const LegalLayout = ({ eyebrow, title, lede, children }) => {
    const { pathname } = useLocation();

    return (
        <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
            <header className="px-6 py-4 border-b border-[var(--border)]">
                <div className="max-w-3xl mx-auto flex flex-wrap items-center justify-between gap-3">
                    <Link
                        to="/"
                        className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-[var(--border)] text-[10px] font-mono uppercase tracking-widest text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                    >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        <Logo className="h-5" />
                    </Link>
                    <nav className="flex items-center gap-1">
                        {LINKS.filter((link) => link.to !== pathname).map((link) => (
                            <Link
                                key={link.to}
                                to={link.to}
                                className="px-4 py-1.5 rounded-full text-[10px] font-mono uppercase tracking-widest text-[var(--muted)] hover:text-[var(--accent)] hover:bg-[var(--surface)] transition-colors"
                            >
                                {link.label}
                            </Link>
                        ))}
                    </nav>
                </div>
            </header>

            <main className="max-w-3xl mx-auto px-6 py-16">
                {eyebrow && (
                    <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--accent)] mb-3">
                        {eyebrow}
                    </p>
                )}
                <h1 className="font-['Space_Grotesk'] text-3xl sm:text-4xl font-extrabold tracking-tight mb-8">
                    {title}
                </h1>
                {lede && (
                    <p className={`${BODY} mb-12 max-w-2xl`}>{lede}</p>
                )}

                <div className="space-y-6">{children}</div>
            </main>

            <footer className="border-t border-[var(--border)] px-6 py-8">
                <div className="max-w-3xl mx-auto">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--muted)]">
                        &copy; {new Date().getFullYear()} Bitlance
                    </span>
                </div>
            </footer>
        </div>
    );
};

export default LegalLayout;
