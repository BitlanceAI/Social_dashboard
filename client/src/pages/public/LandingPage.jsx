import React from 'react';
import { Link } from 'react-router-dom';
import {
    Facebook,
    Instagram,
    ArrowRight,
    CalendarClock,
    Images,
    Layers,
    ShieldCheck,
    Activity,
    RefreshCw,
    Check,
    Minus,
    X as XIcon,
    Sun,
    Moon,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import Logo from '../../components/layout/Logo';

/**
 * Product landing page.
 *
 * Every capability, limit and permission stated here is one the app actually
 * implements. Meta reviewers read this page, so an inaccurate claim here is a
 * rejection risk — keep it in sync with metaService.js. Do not add social
 * proof, customer counts or testimonials that do not exist.
 *
 * Radius scale: rounded-full for pills, rounded-xl for small surfaces,
 * rounded-2xl for cards and the table shell.
 */

const BEFORE = [
    'Two tabs open, posting the same thing twice',
    'Captions retyped for Instagram after posting to Facebook',
    'Posts that silently never went out',
    'No idea an access token expired until someone noticed the gap',
];

const AFTER = [
    'One composer, both networks',
    'One caption, tailored targets',
    'A queue that shows exactly what published and what failed',
    'Expired connections surfaced before they cost you a post',
];

const STAGES = [
    {
        num: '01',
        title: 'Connect',
        body: 'Sign in with Facebook and approve the permissions. We import your Pages and detect the Instagram Business account linked to each one. Nothing is published at this stage — connecting only reads your account structure.',
        output: 'Your Pages and Instagram accounts, ready to publish to.',
    },
    {
        num: '02',
        title: 'Compose',
        body: 'Write the post once. Pick the Page, then choose Facebook, Instagram, or both. Add images, video or a carousel. Validation runs as you go, so an Instagram post without media is caught while you are writing it — not at publish time.',
        output: 'A post that will actually be accepted by every network you picked.',
    },
    {
        num: '03',
        title: 'Schedule',
        body: 'Set a date and time in your own timezone. A background worker wakes every minute and publishes the moment your slot arrives. Claiming is atomic, so a slow upload can never send the same post twice.',
        output: 'A queue that runs without you watching it.',
    },
    {
        num: '04',
        title: 'Track',
        body: 'Every post reports back as pending, published or failed — recorded separately for each network. When one side fails, you get the exact Graph API reason rather than a generic error.',
        output: 'A clear record of what went out, where, and what did not.',
    },
];

const FEATURES = [
    {
        icon: Layers,
        title: 'One composer, both platforms',
        body: 'Target your Facebook Page, your Instagram Business account, or both from a single submission. Instagram is only offered for Pages that actually have a linked Business account, so you never build a post that cannot be delivered.',
    },
    {
        icon: Images,
        title: 'Photos, video, Reels and carousels',
        body: 'A single image, a video, or a carousel of up to ten items. Videos sent to Instagram publish as Reels. Uploads are hosted and served from a public URL first, because Meta fetches media by reference rather than accepting a direct upload.',
    },
    {
        icon: CalendarClock,
        title: 'Scheduling that runs itself',
        body: 'Pick a time and walk away. The scheduler checks every minute, claims what is due, and publishes it. Your timezone is stored with the post, so the slot you chose is the slot that fires.',
    },
    {
        icon: Activity,
        title: 'Failures you can actually see',
        body: 'Most tools fail quietly. Here a failed post stays in the queue with the real reason attached — a rejected image spec, an expired token, a rate limit — so you can fix it instead of discovering the gap a week later.',
    },
    {
        icon: RefreshCw,
        title: 'Token expiry handled for you',
        body: 'Meta access tokens expire. We detect the specific Graph API error codes for an invalid session, deactivate the connection, and prompt you to reconnect — rather than dropping every scheduled post behind it.',
    },
    {
        icon: ShieldCheck,
        title: 'Official Graph API, encrypted tokens',
        body: 'Connection is through Facebook Login and the official Meta Graph API, with no third-party relay in the path. We never see your password, and access tokens are encrypted at rest with a server-side key.',
    },
];

const POST_TYPES = [
    { type: 'Text only', fb: true, ig: false, note: 'Instagram requires media on every post' },
    { type: 'Link post', fb: true, ig: false, note: 'Instagram has no link-post format' },
    { type: 'Single image', fb: true, ig: true, note: '—' },
    { type: 'Single video', fb: true, ig: true, note: 'Published as a Reel on Instagram' },
    { type: 'Carousel', fb: true, ig: true, note: 'Up to 10 items' },
];

const FIT = [
    {
        title: 'You run a Facebook Page and an Instagram account',
        body: 'The same content usually belongs on both. Writing it twice is the tax this removes.',
    },
    {
        title: 'You post on a schedule, not on impulse',
        body: 'Queue a week of content in one sitting and let it publish while you do other work.',
    },
    {
        title: 'You have been burned by a post that never went out',
        body: 'Visible failure states exist because silent ones are expensive.',
    },
];

const NOT_FIT = [
    'You need LinkedIn, X, TikTok, Pinterest or YouTube — this publishes to Facebook and Instagram only',
    'You want a shared inbox for comments and DMs — this is a publishing tool, not an engagement tool',
    'You need audience analytics or white-label client reports',
    'You want approval workflows for clients or teammates',
];

const FAQ = [
    [
        'Do I need an Instagram Business account?',
        'Yes. Meta only permits publishing to Business or Creator accounts, and the account must be linked to a Facebook Page you manage. Personal Instagram accounts cannot be published to through any API — not by us, and not by any other tool. If a Page has no linked account, Instagram is shown as unavailable for that Page.',
    ],
    [
        'Why can Instagram posts not be text only?',
        'The Instagram Content Publishing API has no text-only post format — every post must carry at least one image or video. We block this in the composer rather than letting it fail at publish time.',
    ],
    [
        'Is there a publishing limit?',
        'Meta allows 25 published posts per Instagram account in any rolling 24-hour period. That limit is set by Meta, not by us.',
    ],
    [
        'What happens when a post fails?',
        'It stays in the queue marked failed, with the exact reason returned by Meta. If a post targeted both networks and only one succeeded, the successful side is recorded as published and the failure is kept alongside it — you never lose the half that worked.',
    ],
    [
        'What permissions do you request?',
        'Five, and no more than we use: pages_show_list and pages_read_engagement to find your Pages and their linked Instagram accounts, pages_manage_posts to publish to a Page, instagram_basic to read the Instagram profile and media, and instagram_content_publish to publish to Instagram. We do not request access to your messages or comments.',
    ],
    [
        'Do you store my password?',
        'No. Connection happens through Facebook Login, so your credentials go to Meta and never to us. We store an access token, encrypted at rest, which you can revoke at any time.',
    ],
    [
        'Can I disconnect?',
        'At any time, from the dashboard or from your Facebook settings. Either removes your stored access token and connection immediately. The Data Deletion page lists exactly what is removed.',
    ],
];

const CTA_CLASS =
    'inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[var(--accent)] text-white text-[11px] font-mono uppercase tracking-widest hover:bg-[var(--accent-hover)] transition-colors';

const FOOTER_LINK =
    'text-[10px] font-mono uppercase tracking-widest text-[var(--muted)] hover:text-[var(--accent)] transition-colors';

const Eyebrow = ({ children }) => (
    <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--accent)] mb-3">{children}</p>
);

const Support = ({ ok }) =>
    ok ? (
        <Check className="w-4 h-4 text-[var(--accent)]" aria-label="Supported" />
    ) : (
        <Minus className="w-4 h-4 text-[var(--muted-2)]" aria-label="Not supported" />
    );

const LandingPage = () => {
    const { user } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const dest = user ? '/socialdashboad' : '/login';
    const ctaLabel = user ? 'Open dashboard' : 'Get started free';

    return (
        <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
            <header className="sticky top-0 z-10 bg-[var(--bg)]/95 backdrop-blur px-6 py-4 border-b border-[var(--border)]">
                <div className="max-w-4xl mx-auto flex items-center justify-between">
                    <Link to="/" className="flex items-center">
                        <Logo className="h-7" />
                    </Link>
                    <nav className="flex items-center gap-2 sm:gap-4">
                        {[['#how', 'How it works'], ['#features', 'Features'], ['#formats', 'Formats'], ['#faq', 'FAQ']].map(
                            ([href, label]) => (
                                <a
                                    key={href}
                                    href={href}
                                    className="hidden md:inline px-3 py-1.5 rounded-full text-[10px] font-mono uppercase tracking-widest text-[var(--muted)] hover:text-[var(--accent)] hover:bg-[var(--surface)] transition-colors"
                                >
                                    {label}
                                </a>
                            )
                        )}
                        <button
                            onClick={toggleTheme}
                            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                            className="p-1.5 rounded-full text-[var(--muted)] hover:text-[var(--accent)] hover:bg-[var(--surface)] transition-colors"
                        >
                            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                        </button>
                        <Link
                            to={dest}
                            className="px-4 py-1.5 rounded-full border border-[var(--border)] text-[10px] font-mono uppercase tracking-widest text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                        >
                            {user ? 'Dashboard' : 'Log in'}
                        </Link>
                    </nav>
                </div>
            </header>

            <main className="max-w-4xl mx-auto px-6">
                {/* ── Hero ── */}
                <section className="py-24">
                    <div className="inline-flex items-center gap-3 mb-8 px-4 py-2 rounded-full border border-[var(--border)] bg-[var(--surface)]">
                        <Facebook className="w-4 h-4 text-[var(--accent)]" />
                        <Instagram className="w-4 h-4 text-[var(--accent)]" />
                        <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--muted)]">
                            Official Meta Graph API
                        </span>
                    </div>

                    <h1 className="font-['Space_Grotesk'] text-4xl sm:text-5xl font-extrabold tracking-tight leading-[1.1] mb-6 max-w-3xl">
                        Stop posting the same thing twice.
                    </h1>

                    <p className="text-[var(--muted)] text-base sm:text-lg leading-relaxed mb-4 max-w-2xl">
                        Bitlance is a publishing tool for people who run a Facebook Page and an
                        Instagram Business account. Write the post once, send it to either network
                        or both, schedule it, and see exactly what published.
                    </p>
                    <p className="text-[var(--muted)] text-sm leading-relaxed mb-10 max-w-2xl">
                        No password sharing, no browser extensions, no third-party relay — just the
                        official Meta Graph API.
                    </p>

                    <Link to={dest} className={CTA_CLASS}>
                        {ctaLabel}
                        <ArrowRight className="w-4 h-4" />
                    </Link>
                    <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--muted)] mt-4">
                        Connect your Meta account in under a minute
                    </p>
                </section>

                {/* ── Before / After ── */}
                <section className="border-t border-[var(--border)] py-20">
                    <Eyebrow>The problem</Eyebrow>
                    <h2 className="font-['Space_Grotesk'] text-2xl sm:text-3xl font-extrabold tracking-tight mb-4">
                        Two networks, one piece of content, twice the work.
                    </h2>
                    <p className="text-[var(--muted)] text-sm leading-relaxed mb-10 max-w-2xl">
                        Facebook and Instagram are the same company and almost always want the same
                        post. Managing them separately is a habit, not a requirement.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <div className="rounded-2xl border border-[var(--border)] p-6">
                            <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--muted)] mb-5">
                                Before
                            </p>
                            <ul className="space-y-3">
                                {BEFORE.map(item => (
                                    <li key={item} className="flex gap-3 text-sm leading-relaxed text-[var(--muted)]">
                                        <XIcon className="w-4 h-4 text-[var(--muted-2)] shrink-0 mt-0.5" />
                                        <span>{item}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <div className="rounded-2xl border border-[var(--accent)] bg-[var(--surface)] p-6">
                            <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--accent)] mb-5">
                                With Bitlance
                            </p>
                            <ul className="space-y-3">
                                {AFTER.map(item => (
                                    <li key={item} className="flex gap-3 text-sm leading-relaxed">
                                        <Check className="w-4 h-4 text-[var(--accent)] shrink-0 mt-0.5" />
                                        <span>{item}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </section>

                {/* ── How it works ── */}
                <section id="how" className="scroll-mt-20 border-t border-[var(--border)] py-20">
                    <Eyebrow>How it works</Eyebrow>
                    <h2 className="font-['Space_Grotesk'] text-2xl sm:text-3xl font-extrabold tracking-tight mb-4">
                        From draft to published, in four stages.
                    </h2>
                    <p className="text-[var(--muted)] text-sm leading-relaxed mb-12 max-w-2xl">
                        One continuous flow: connect → compose → schedule → track.
                    </p>

                    <ol className="space-y-6">
                        {STAGES.map(({ num, title, body, output }) => (
                            <li
                                key={num}
                                className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 flex gap-5"
                            >
                                <span className="w-9 h-9 rounded-full bg-[var(--accent-muted)] text-[var(--accent)] font-mono text-xs flex items-center justify-center shrink-0">
                                    {num}
                                </span>
                                <div>
                                    <h3 className="font-['Space_Grotesk'] text-base font-bold tracking-tight mb-2">
                                        {title}
                                    </h3>
                                    <p className="text-[var(--muted)] text-sm leading-relaxed max-w-2xl mb-3">{body}</p>
                                    <p className="text-[11px] font-mono uppercase tracking-widest text-[var(--accent)]">
                                        Result: <span className="text-[var(--muted)] normal-case tracking-normal font-sans text-sm">{output}</span>
                                    </p>
                                </div>
                            </li>
                        ))}
                    </ol>
                </section>

                {/* ── Features ── */}
                <section id="features" className="scroll-mt-20 border-t border-[var(--border)] py-20">
                    <Eyebrow>Features</Eyebrow>
                    <h2 className="font-['Space_Grotesk'] text-2xl sm:text-3xl font-extrabold tracking-tight mb-12">
                        Built around the parts that usually break.
                    </h2>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        {FEATURES.map(({ icon: Icon, title, body }) => (
                            <div
                                key={title}
                                className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 hover:border-[var(--accent)] transition-colors"
                            >
                                <div className="w-10 h-10 rounded-xl bg-[var(--accent-muted)] flex items-center justify-center mb-4">
                                    <Icon className="w-5 h-5 text-[var(--accent)]" />
                                </div>
                                <h3 className="font-['Space_Grotesk'] text-base font-bold tracking-tight mb-2">
                                    {title}
                                </h3>
                                <p className="text-[var(--muted)] text-sm leading-relaxed">{body}</p>
                            </div>
                        ))}
                    </div>
                </section>

                {/* ── Formats ── */}
                <section id="formats" className="scroll-mt-20 border-t border-[var(--border)] py-20">
                    <Eyebrow>Formats</Eyebrow>
                    <h2 className="font-['Space_Grotesk'] text-2xl sm:text-3xl font-extrabold tracking-tight mb-4">
                        What you can publish, and where.
                    </h2>
                    <p className="text-[var(--muted)] text-sm leading-relaxed mb-10 max-w-2xl">
                        These differences come from Meta&apos;s APIs, not from us. The composer
                        enforces them as you build the post, so you find out now rather than at
                        publish time.
                    </p>

                    <div className="rounded-2xl border border-[var(--border)] overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm border-collapse min-w-[520px]">
                                <thead>
                                    <tr className="bg-[var(--surface)]">
                                        <th className="text-left py-3 px-5 text-[10px] font-mono uppercase tracking-widest text-[var(--muted)] font-normal">
                                            Post type
                                        </th>
                                        <th className="py-3 px-4 text-[10px] font-mono uppercase tracking-widest text-[var(--muted)] font-normal w-24">
                                            Facebook
                                        </th>
                                        <th className="py-3 px-4 text-[10px] font-mono uppercase tracking-widest text-[var(--muted)] font-normal w-24">
                                            Instagram
                                        </th>
                                        <th className="text-left py-3 px-5 text-[10px] font-mono uppercase tracking-widest text-[var(--muted)] font-normal">
                                            Notes
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {POST_TYPES.map(({ type, fb, ig, note }, i) => (
                                        <tr key={type} className={i > 0 ? 'border-t border-[var(--border)]' : ''}>
                                            <td className="py-3 px-5 font-medium">{type}</td>
                                            <td className="py-3 px-4">
                                                <span className="flex justify-center"><Support ok={fb} /></span>
                                            </td>
                                            <td className="py-3 px-4">
                                                <span className="flex justify-center"><Support ok={ig} /></span>
                                            </td>
                                            <td className="py-3 px-5 text-[var(--muted)]">{note}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </section>

                {/* ── Who it's for ── */}
                <section className="border-t border-[var(--border)] py-20">
                    <Eyebrow>Who it&apos;s for</Eyebrow>
                    <h2 className="font-['Space_Grotesk'] text-2xl sm:text-3xl font-extrabold tracking-tight mb-12">
                        A good fit if this sounds familiar.
                    </h2>

                    <div className="space-y-4 mb-14">
                        {FIT.map(({ title, body }) => (
                            <div
                                key={title}
                                className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6"
                            >
                                <h3 className="font-['Space_Grotesk'] text-base font-bold tracking-tight mb-2">
                                    {title}
                                </h3>
                                <p className="text-[var(--muted)] text-sm leading-relaxed">{body}</p>
                            </div>
                        ))}
                    </div>

                    <h3 className="font-['Space_Grotesk'] text-lg font-bold tracking-tight mb-2">
                        Not the right tool when…
                    </h3>
                    <p className="text-[var(--muted)] text-sm leading-relaxed mb-6 max-w-2xl">
                        Worth knowing before you sign up.
                    </p>
                    <ul className="space-y-3 max-w-2xl">
                        {NOT_FIT.map(item => (
                            <li
                                key={item}
                                className="flex gap-3 items-start rounded-xl border border-[var(--border)] px-5 py-4 text-sm leading-relaxed text-[var(--muted)]"
                            >
                                <XIcon className="w-4 h-4 text-[var(--muted-2)] shrink-0 mt-0.5" />
                                <span>{item}</span>
                            </li>
                        ))}
                    </ul>
                </section>

                {/* ── FAQ ── */}
                <section id="faq" className="scroll-mt-20 border-t border-[var(--border)] py-20">
                    <Eyebrow>FAQ</Eyebrow>
                    <h2 className="font-['Space_Grotesk'] text-2xl sm:text-3xl font-extrabold tracking-tight mb-12">
                        Questions people actually ask.
                    </h2>

                    <div className="space-y-4 max-w-2xl">
                        {FAQ.map(([q, a]) => (
                            <div key={q} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
                                <h3 className="font-['Space_Grotesk'] text-base font-bold tracking-tight mb-2">{q}</h3>
                                <p className="text-[var(--muted)] text-sm leading-relaxed">{a}</p>
                            </div>
                        ))}
                    </div>
                </section>

                {/* ── Closing CTA ── */}
                <section className="border-t border-[var(--border)] py-20">
                    <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-10 sm:p-12">
                        <h2 className="font-['Space_Grotesk'] text-2xl sm:text-3xl font-extrabold tracking-tight mb-4 max-w-2xl">
                            Write it once. Publish it everywhere it belongs.
                        </h2>
                        <p className="text-[var(--muted)] text-sm leading-relaxed mb-8 max-w-xl">
                            Connect your Meta account and schedule your first post in the next few
                            minutes.
                        </p>
                        <Link to={dest} className={CTA_CLASS}>
                            {ctaLabel}
                            <ArrowRight className="w-4 h-4" />
                        </Link>
                    </div>
                </section>
            </main>

            <footer className="border-t border-[var(--border)] px-6 py-8">
                <div className="max-w-4xl mx-auto flex flex-wrap items-center gap-x-6 gap-y-2">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--muted)]">
                        &copy; {new Date().getFullYear()} Bitlance
                    </span>
                    <Link to="/privacy-policy" className={FOOTER_LINK}>Privacy Policy</Link>
                    <Link to="/terms-policy" className={FOOTER_LINK}>Terms of Service</Link>
                    <Link to="/data-deletion" className={FOOTER_LINK}>Data Deletion</Link>
                </div>
            </footer>
        </div>
    );
};

export default LandingPage;
