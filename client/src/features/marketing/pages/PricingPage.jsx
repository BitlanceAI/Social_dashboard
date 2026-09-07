import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Check, Minus, ArrowRight, Sun, Moon, Sparkles } from 'lucide-react';
import Logo from '@/shared/components/layout/Logo';
import SEOHead from '@/shared/components/layout/SEOHead';
import { useAuth } from '@/features/auth/context/AuthContext';
import { useTheme } from '@/shared/context/ThemeContext';
import { fetchPlans, money } from '@/features/billing/lib/billingApi';

const CTA_CLASS =
    'inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[var(--accent)] text-white text-[11px] font-mono uppercase tracking-widest hover:bg-[var(--accent-hover)] transition-colors';
const FOOTER_LINK = 'text-[10px] font-mono uppercase tracking-widest text-[var(--muted)] hover:text-[var(--accent)] transition-colors';

const Eyebrow = ({ children }) => (
    <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--accent)] mb-3">{children}</p>
);

// Comparison-row cell: a check, a value, or a dash.
const Cell = ({ value }) => {
    if (value === true) return <Check className="h-4 w-4 text-[var(--accent)] mx-auto" />;
    if (value === false || value === null || value === undefined)
        return <Minus className="h-4 w-4 text-[var(--muted-2)] mx-auto" />;
    return <span className="text-sm text-[var(--text)]">{value}</span>;
};

const FAQ = [
    ['Is there a free trial?', 'Yes — every plan starts with a 14-day free trial. No credit card required, and you are never charged automatically.'],
    ['What counts as a social account?', 'Each connected publishing target: a Facebook Page, a linked Instagram Business account, or a LinkedIn profile. You pick which accounts to use in the dashboard.'],
    ['Can I change plans later?', 'Yes. Upgrade, downgrade, or cancel any time from your billing settings. Billing is prorated.'],
    ['How does yearly billing work?', 'Pay for ten months and get two free — roughly 17% off the monthly rate. Yearly plans are billed once per year.'],
    ['Do you charge per team member?', 'No. Plans are priced per social account, not per seat — each tier includes its users. Extra teammates are a small flat add-on.'],
    ['Is media storage included?', 'Each plan includes working storage for your posts. If you need more, storage scales as a separate add-on, billed only for what you use.'],
];

const unlimited = (n) => (n === null || n === undefined ? 'Unlimited' : n);

const PricingPage = () => {
    const { user } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const [interval, setInterval] = useState('yearly'); // default to the discounted option
    const [plans, setPlans] = useState([]);
    const [trialDays, setTrialDays] = useState(14);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        fetchPlans()
            .then((res) => {
                if (cancelled) return;
                setPlans(res.plans || []);
                setTrialDays(res.trialDays || 14);
            })
            .catch(() => { /* pricing shows a fallback message */ })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, []);

    const dest = user ? '/billing' : '/login';
    const ctaLabel = user ? 'Go to billing' : 'Start free trial';
    const priceOf = (p) => (interval === 'yearly' ? p.yearlyPrice : p.monthlyPrice);
    const perLabel = interval === 'yearly' ? '/ year' : '/ month';

    return (
        <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
            <SEOHead
                title="Pricing"
                description="Simple, per-account pricing for scheduling and publishing to Facebook, Instagram, and LinkedIn. 14-day free trial, no credit card."
                canonicalUrl="https://www.bitlancetechhub.com/pricing"
            />

            {/* Header */}
            <header className="sticky top-0 z-10 bg-[var(--bg)]/95 backdrop-blur px-6 py-4 border-b border-[var(--border)]">
                <div className="max-w-5xl mx-auto flex items-center justify-between">
                    <Link to="/" className="flex items-center"><Logo className="h-7" /></Link>
                    <nav className="flex items-center gap-2 sm:gap-4">
                        <Link to="/" className="hidden md:inline px-3 py-1.5 rounded-full text-[10px] font-mono uppercase tracking-widest text-[var(--muted)] hover:text-[var(--accent)] hover:bg-[var(--surface)] transition-colors">Home</Link>
                        <button
                            onClick={toggleTheme}
                            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                            className="p-1.5 rounded-full text-[var(--muted)] hover:text-[var(--accent)] hover:bg-[var(--surface)] transition-colors"
                        >
                            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                        </button>
                        <Link to={user ? '/socialdashboad' : '/login'} className="px-4 py-1.5 rounded-full border border-[var(--border)] text-[10px] font-mono uppercase tracking-widest text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors">
                            {user ? 'Dashboard' : 'Log in'}
                        </Link>
                    </nav>
                </div>
            </header>

            <main className="max-w-5xl mx-auto px-6">
                {/* Hero */}
                <section className="pt-20 pb-8 text-center">
                    <Eyebrow>Pricing</Eyebrow>
                    <h1 className="font-['Space_Grotesk'] text-5xl sm:text-6xl font-black tracking-tight leading-[1.1] mb-5">
                        Priced per account, not per seat.
                    </h1>
                    <p className="text-[var(--muted)] text-lg sm:text-xl font-medium leading-relaxed max-w-2xl mx-auto mb-8">
                        Schedule and publish to Facebook, Instagram, and LinkedIn from one dashboard.
                        Start with a {trialDays}-day free trial — no credit card, cancel anytime.
                    </p>

                    {/* Billing interval toggle */}
                    <div className="inline-flex items-center gap-1 p-1 rounded-full border border-[var(--border)] bg-[var(--surface)]">
                        <button
                            onClick={() => setInterval('monthly')}
                            className={`px-4 py-1.5 rounded-full text-[11px] font-mono uppercase tracking-widest transition-colors ${interval === 'monthly' ? 'bg-[var(--accent)] text-white' : 'text-[var(--muted)]'}`}
                        >
                            Monthly
                        </button>
                        <button
                            onClick={() => setInterval('yearly')}
                            className={`px-4 py-1.5 rounded-full text-[11px] font-mono uppercase tracking-widest transition-colors ${interval === 'yearly' ? 'bg-[var(--accent)] text-white' : 'text-[var(--muted)]'}`}
                        >
                            Yearly · 2 months free
                        </button>
                    </div>
                </section>

                {/* Tier cards */}
                <section className="pb-8">
                    {loading ? (
                        <div className="py-16 text-center text-sm text-[var(--muted)]">Loading plans…</div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
                            {plans.map((p) => (
                                <div
                                    key={p.key}
                                    className={`relative flex flex-col rounded-2xl border p-6 ${p.highlighted ? 'border-[var(--accent)] bg-[var(--surface)]' : 'border-[var(--border)] bg-[var(--surface)]'}`}
                                >
                                    {p.highlighted && (
                                        <span className="absolute -top-3 left-6 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[var(--accent)] text-white text-[9px] font-mono uppercase tracking-widest">
                                            <Sparkles className="h-3 w-3" /> Recommended
                                        </span>
                                    )}
                                    <h3 className="font-['Space_Grotesk'] text-xl font-black tracking-tight">{p.name}</h3>
                                    <p className="text-xs text-[var(--muted)] mt-1 min-h-[32px]">{p.tagline}</p>
                                    <div className="mt-4 mb-1 flex items-end gap-1.5">
                                        <span className="font-['Space_Grotesk'] text-4xl font-black tracking-tight">{money(priceOf(p), p.currency)}</span>
                                        <span className="text-xs text-[var(--muted)] mb-1">{perLabel}</span>
                                    </div>
                                    {interval === 'yearly' && (
                                        <p className="text-[11px] text-[var(--accent)] mb-4">
                                            {money(p.monthlyPrice * 12 - p.yearlyPrice, p.currency)} off vs monthly
                                        </p>
                                    )}
                                    {interval === 'monthly' && <div className="mb-4" />}

                                    <Link to={dest} className={`${p.highlighted ? CTA_CLASS : 'inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full border border-[var(--border)] text-[11px] font-mono uppercase tracking-widest text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors'} w-full justify-center`}>
                                        {ctaLabel}
                                    </Link>

                                    <ul className="mt-5 space-y-2.5">
                                        <li className="flex items-start gap-2 text-sm">
                                            <Check className="h-4 w-4 shrink-0 mt-0.5 text-[var(--accent)]" />
                                            <span><strong>{unlimited(p.includedAccounts)}</strong> social accounts</span>
                                        </li>
                                        <li className="flex items-start gap-2 text-sm">
                                            <Check className="h-4 w-4 shrink-0 mt-0.5 text-[var(--accent)]" />
                                            <span><strong>{unlimited(p.includedUsers)}</strong> {p.includedUsers === 1 ? 'user' : 'users'}</span>
                                        </li>
                                        <li className="flex items-start gap-2 text-sm">
                                            <Check className="h-4 w-4 shrink-0 mt-0.5 text-[var(--accent)]" />
                                            <span><strong>{unlimited(p.includedWorkspaces)}</strong> {p.includedWorkspaces === 1 ? 'workspace' : 'workspaces'}</span>
                                        </li>
                                        {p.features.map((f) => (
                                            <li key={f} className="flex items-start gap-2 text-sm text-[var(--muted)]">
                                                <Check className="h-4 w-4 shrink-0 mt-0.5 text-[var(--accent)]" />
                                                <span>{f}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ))}

                            {/* Enterprise — contact, not a checkout tier */}
                            <div className="flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
                                <h3 className="font-['Space_Grotesk'] text-xl font-black tracking-tight">Enterprise</h3>
                                <p className="text-xs text-[var(--muted)] mt-1 min-h-[32px]">For 100+ accounts or custom terms.</p>
                                <div className="mt-4 mb-1">
                                    <span className="font-['Space_Grotesk'] text-4xl font-black tracking-tight">Custom</span>
                                </div>
                                <div className="mb-4" />
                                <a href="mailto:bitlanceai@gmail.com?subject=Enterprise%20pricing" className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full border border-[var(--border)] text-[11px] font-mono uppercase tracking-widest text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors w-full">
                                    Contact sales
                                </a>
                                <ul className="mt-5 space-y-2.5">
                                    {['100+ social accounts', 'Custom users & workspaces', 'Priority support & onboarding', 'Sales-assisted implementation'].map((f) => (
                                        <li key={f} className="flex items-start gap-2 text-sm text-[var(--muted)]">
                                            <Check className="h-4 w-4 shrink-0 mt-0.5 text-[var(--accent)]" />
                                            <span>{f}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    )}

                    <p className="text-center text-[11px] text-[var(--muted)] mt-6">
                        Prices exclude applicable taxes. Extra social accounts and teammates available as add-ons.
                    </p>
                </section>

                {/* Comparison table */}
                {!loading && plans.length > 0 && (
                    <section className="border-t border-[var(--border)] py-16">
                        <Eyebrow>Compare plans</Eyebrow>
                        <h2 className="font-['Space_Grotesk'] text-3xl sm:text-4xl font-black tracking-tight mb-6">What changes between tiers</h2>
                        <div className="rounded-2xl border border-[var(--border)] overflow-x-auto">
                            <table className="w-full text-left min-w-[560px]">
                                <thead>
                                    <tr className="bg-[var(--surface-2)]">
                                        <th className="px-5 py-3 text-[10px] font-mono uppercase tracking-widest text-[var(--muted)]">Feature</th>
                                        {plans.map((p) => (
                                            <th key={p.key} className="px-5 py-3 text-[10px] font-mono uppercase tracking-widest text-[var(--muted)] text-center">{p.name}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {[
                                        ['Social accounts', (p) => unlimited(p.includedAccounts)],
                                        ['Team members', (p) => unlimited(p.includedUsers)],
                                        ['Workspaces', (p) => unlimited(p.includedWorkspaces)],
                                        ['Daily posts / account', (p) => unlimited(p.dailyPostLimit)],
                                        ['Post history & analytics', () => true],
                                        ['Comment management', (p) => p.key !== 'starter'],
                                        ['Best-time scheduling', (p) => p.key !== 'starter'],
                                        ['White-label reports', (p) => p.key === 'agency'],
                                        ['Approval workflows', (p) => p.key === 'agency'],
                                        ['Priority support', (p) => p.key === 'agency'],
                                    ].map(([label, fn], i) => (
                                        <tr key={label} className={i > 0 ? 'border-t border-[var(--border)]' : ''}>
                                            <td className="px-5 py-3 text-sm text-[var(--muted)]">{label}</td>
                                            {plans.map((p) => (
                                                <td key={p.key} className="px-5 py-3 text-center"><Cell value={fn(p)} /></td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>
                )}

                {/* FAQ */}
                <section className="border-t border-[var(--border)] py-16">
                    <Eyebrow>FAQ</Eyebrow>
                    <h2 className="font-['Space_Grotesk'] text-3xl sm:text-4xl font-black tracking-tight mb-6">Pricing questions</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        {FAQ.map(([q, a]) => (
                            <div key={q} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
                                <h3 className="font-['Space_Grotesk'] text-lg font-extrabold text-[var(--text)] mb-2">{q}</h3>
                                <p className="text-sm text-[var(--muted)] leading-relaxed">{a}</p>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Closing CTA */}
                <section className="py-16">
                    <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-10 text-center">
                        <h2 className="font-['Space_Grotesk'] text-3xl sm:text-4xl font-black tracking-tight mb-3">Start your {trialDays}-day free trial</h2>
                        <p className="text-sm text-[var(--muted)] mb-6">No credit card. Cancel anytime. 30-day money-back guarantee.</p>
                        <Link to={dest} className={CTA_CLASS}>
                            {ctaLabel}
                            <ArrowRight className="w-4 h-4" />
                        </Link>
                    </div>
                </section>
            </main>

            {/* Footer */}
            <footer className="border-t border-[var(--border)] px-6 py-10">
                <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-center gap-6">
                    <Link to="/" className={FOOTER_LINK}>Home</Link>
                    <Link to="/pricing" className={FOOTER_LINK}>Pricing</Link>
                    <Link to="/privacy-policy" className={FOOTER_LINK}>Privacy</Link>
                    <Link to="/terms-policy" className={FOOTER_LINK}>Terms</Link>
                    <Link to="/data-deletion" className={FOOTER_LINK}>Your data</Link>
                </div>
            </footer>
        </div>
    );
};

export default PricingPage;
