import React from 'react';
import { Link } from 'react-router-dom';
import { Facebook, Instagram, ArrowRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

/**
 * Landing page.
 *
 * Deliberately minimal: says what the product does, and routes to login or
 * the dashboard. Meta reviewers land here first, so it must make the purpose
 * of the app obvious without any marketing filler.
 */
const LandingPage = () => {
    const { user } = useAuth();

    return (
        <div className="min-h-screen flex flex-col bg-[var(--bg)] text-[var(--text)]">
            <header className="px-6 py-6 flex items-center justify-between border-b border-[var(--border)]">
                <span className="font-['Space_Grotesk'] font-extrabold text-lg uppercase tracking-tight">
                    Bitlance
                </span>
                <Link
                    to={user ? '/dashboard/agents/meta' : '/login'}
                    className="text-[11px] font-mono uppercase tracking-widest text-[var(--muted)] hover:text-[var(--accent)] transition-colors"
                >
                    {user ? 'Dashboard' : 'Log in'}
                </Link>
            </header>

            <main className="flex-1 flex items-center justify-center px-6 py-20">
                <div className="max-w-2xl w-full">
                    <div className="flex items-center gap-3 mb-8 text-[var(--accent)]">
                        <Facebook className="w-5 h-5" />
                        <Instagram className="w-5 h-5" />
                        <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--muted)]">
                            Official Meta Graph API
                        </span>
                    </div>

                    <h1 className="font-['Space_Grotesk'] text-4xl sm:text-5xl font-extrabold tracking-tight leading-[1.1] mb-6">
                        Schedule and publish to your Facebook Pages and Instagram Business accounts.
                    </h1>

                    <p className="text-[var(--muted)] text-base leading-relaxed mb-10 max-w-xl">
                        Connect your Meta account once, compose a post with images or video,
                        pick a time, and let it publish itself — to Facebook, Instagram, or both.
                    </p>

                    <Link
                        to={user ? '/dashboard/agents/meta' : '/login'}
                        className="inline-flex items-center gap-2 px-6 py-3 bg-[var(--accent)] text-white text-[11px] font-mono uppercase tracking-widest hover:bg-[var(--accent-hover)] transition-colors"
                    >
                        {user ? 'Open dashboard' : 'Get started'}
                        <ArrowRight className="w-4 h-4" />
                    </Link>
                </div>
            </main>

            <footer className="px-6 py-6 border-t border-[var(--border)] flex flex-wrap items-center gap-x-6 gap-y-2">
                <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--muted)]">
                    &copy; {new Date().getFullYear()} Bitlance
                </span>
                <Link
                    to="/privacy-policy"
                    className="text-[10px] font-mono uppercase tracking-widest text-[var(--muted)] hover:text-[var(--accent)] transition-colors"
                >
                    Privacy Policy
                </Link>
                <Link
                    to="/terms-policy"
                    className="text-[10px] font-mono uppercase tracking-widest text-[var(--muted)] hover:text-[var(--accent)] transition-colors"
                >
                    Terms
                </Link>
            </footer>
        </div>
    );
};

export default LandingPage;
