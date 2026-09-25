import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
    ArrowRight, BarChart3, CalendarDays, Check, ChevronRight, Facebook,
    Instagram, Linkedin, Menu, MessageSquareText, Moon, Play, ShieldCheck,
    Sparkles, Sun, UsersRound, WandSparkles, X, Zap,
} from 'lucide-react';
import { useAuth } from '@/features/auth/context/AuthContext';
import Logo from '@/shared/components/layout/Logo';
import SEOHead from '@/shared/components/layout/SEOHead';
import { useTheme } from '@/shared/context/ThemeContext';

const FLOW = [
    ['01', 'Create', 'Write once, use AI when you need it, and tailor the final post for each network.'],
    ['02', 'Approve', 'Share a review link or send a WhatsApp approval before anything enters the queue.'],
    ['03', 'Publish', 'Schedule Facebook, Instagram, and LinkedIn from one visual calendar.'],
    ['04', 'Measure', 'See publishing status, engagement, and client-ready reports without rebuilding spreadsheets.'],
];

const FEATURES = [
    { icon: CalendarDays, title: 'One calendar for every account', body: 'Plan weeks ahead across Facebook, Instagram, and LinkedIn without switching tabs or losing the campaign thread.' },
    { icon: WandSparkles, title: 'AI that finishes the first draft', body: 'Generate captions, campaign ideas, and platform-ready variations, then keep the final edit in your hands.' },
    { icon: MessageSquareText, title: 'Approvals without another login', body: 'Clients can review, comment, approve, or request changes from a focused link or WhatsApp.' },
    { icon: BarChart3, title: 'Reports already assembled', body: 'Turn post and account performance into recurring, client-ready reporting from the same workspace.' },
    { icon: UsersRound, title: 'Workspaces built for client work', body: 'Separate brands, people, permissions, media, and calendars while your agency keeps one operating view.' },
    { icon: ShieldCheck, title: 'Failures stay visible', body: 'Expired tokens, rejected media, and publishing errors remain in the queue with a clear path to fix and retry.' },
];

const FAQ = [
    ['Which social networks can I publish to?', 'Bitlance supports Facebook Pages, linked Instagram Business accounts, and LinkedIn profiles. Each network keeps its own format and publishing rules.'],
    ['Can clients approve posts without using the dashboard?', 'Yes. Client review links keep the approval experience focused, and optional WhatsApp approvals let stakeholders respond where they already work.'],
    ['What happens when a scheduled post fails?', 'The post stays visible with its status and error reason. Your team can correct the account, token, timing, or media issue and retry it.'],
    ['Can I keep different clients separate?', 'Yes. Workspaces separate calendars, connections, media, members, and client-facing review activity.'],
    ['Does Bitlance create content for me?', 'AI caption tools and content pipelines can help research, draft, and prepare content. Your team can edit and approve every post before publishing.'],
    ['Is there a free trial?', 'Yes. Plans begin with a 15-day trial. Payment authorization is required at signup, and you can cancel before renewal.'],
];

const CTA = 'inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#26CECE] px-6 text-sm font-bold text-[#061414] transition hover:bg-[#35DFDF] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#169c9c]';
const SECONDARY_CTA = 'inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-[#c9dada] bg-white px-6 text-sm font-bold text-[#071414] transition hover:border-[#071414] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#071414]';

const NetworkBadge = ({ icon, label }) => (
    <span className="inline-flex items-center gap-2 rounded-full border border-[#d6e5e5] bg-white px-3 py-2 text-xs font-semibold text-[#2e4242] shadow-sm">
        {React.createElement(icon, { className: 'h-4 w-4' })} {label}
    </span>
);

const ProductPreview = () => (
    <div className="relative mx-auto mt-14 max-w-5xl px-2 sm:px-8">
        <div className="absolute -left-3 top-20 hidden rotate-[-7deg] rounded-2xl border border-[#c5dddd] bg-white p-4 shadow-[0_20px_50px_rgba(7,40,40,.12)] lg:block">
            <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-[#26CECE]"><Check className="h-5 w-5" /></span>
                <div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#788171]">Client review</p><p className="text-sm font-bold">Approved on WhatsApp</p></div>
            </div>
        </div>
        <div className="overflow-hidden rounded-[28px] border border-[#173838] bg-[#071414] p-2 shadow-[0_45px_100px_rgba(7,40,40,.24)] sm:p-3">
            <div className="overflow-hidden rounded-[21px] bg-[#f7f8f2] text-left">
                <div className="flex items-center justify-between border-b border-[#dde3d7] bg-white px-4 py-3 sm:px-6">
                    <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-[#ff6b66]"/><span className="h-2.5 w-2.5 rounded-full bg-[#ffc84b]"/><span className="h-2.5 w-2.5 rounded-full bg-[#77ca66]"/></div>
                    <span className="text-[10px] font-bold uppercase tracking-[.18em] text-[#7b8575]">Campaign calendar · September</span>
                    <div className="h-7 w-20 rounded-full bg-[#eef0e9]" />
                </div>
                <div className="grid min-h-[330px] grid-cols-[72px_1fr] sm:grid-cols-[180px_1fr]">
                    <aside className="border-r border-[#dde3d7] bg-white p-3 sm:p-5">
                        <p className="hidden text-[10px] font-bold uppercase tracking-[.18em] text-[#90998a] sm:block">Workspace</p>
                        <div className="mt-3 flex items-center gap-2 rounded-xl bg-[#e2f8f8] p-2.5"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[#071414] text-[10px] font-bold text-white">NL</span><span className="hidden text-xs font-bold sm:block">Northlane Studio</span></div>
                        <div className="mt-6 hidden space-y-3 text-xs text-[#6f7969] sm:block"><p className="font-bold text-[#1b2719]">Calendar</p><p>Content queue</p><p>Approvals</p><p>Analytics</p><p>Media library</p></div>
                    </aside>
                    <div className="p-3 sm:p-6">
                        <div className="mb-5 flex items-end justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#899282]">This week</p><h3 className="mt-1 text-lg font-bold text-[#071414] sm:text-2xl">12 posts ready to move</h3></div><button className="hidden rounded-full bg-[#071414] px-4 py-2 text-xs font-bold text-white sm:block">+ Create post</button></div>
                        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                            {['MON 21', 'TUE 22', 'WED 23', 'THU 24', 'FRI 25'].map((day, index) => (
                                <div key={day} className={`${index > 2 ? 'hidden sm:block' : ''} min-h-56 rounded-xl border border-[#dde3d7] bg-white p-2`}>
                                    <p className="mb-3 text-[9px] font-bold tracking-[.12em] text-[#7e8878]">{day}</p>
                                    {index !== 1 && <div className={`${index === 3 ? 'bg-[#fff0e2]' : 'bg-[#edf6db]'} rounded-lg p-2`}><div className="mb-8 flex gap-1">{index % 2 === 0 ? <Instagram className="h-3 w-3"/> : <Linkedin className="h-3 w-3"/>}<span className="text-[9px] font-semibold">{index % 2 === 0 ? 'Carousel' : 'Update'}</span></div><p className="text-[9px] font-bold leading-snug">{index === 0 ? '3 ways to stop losing warm leads' : index === 2 ? 'A faster content review loop' : index === 3 ? 'September launch notes' : 'Friday field notes'}</p><p className="mt-2 text-[8px] text-[#71806c]">10:{index}0 AM</p></div>}
                                    {index === 1 && <div className="rounded-lg border border-dashed border-[#c7d1c0] p-2 text-center text-[9px] text-[#8b9485]">Open slot</div>}
                                    {index === 2 && <div className="mt-2 rounded-lg bg-[#e9efff] p-2"><Facebook className="h-3 w-3"/><p className="mt-6 text-[9px] font-bold">Customer story</p></div>}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <div className="absolute -right-2 bottom-12 hidden rotate-[5deg] rounded-2xl border border-[#9bdede] bg-[#26CECE] p-4 shadow-[0_20px_50px_rgba(7,40,40,.12)] lg:block">
            <p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#075d5d]">Publishing</p><p className="mt-1 text-sm font-black text-[#071414]">8 posts scheduled</p>
        </div>
    </div>
);

const LandingPage = () => {
    const { user } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const primaryDest = user ? '/socialdashboad' : '/signup';
    const primaryLabel = user ? 'Open dashboard' : 'Start free trial';

    return (
        <div className="min-h-screen bg-[#f7fbfb] text-[#071414] selection:bg-[#26CECE] selection:text-[#071414]">
            <SEOHead title="Social media management for teams and agencies" description="Plan, approve, publish, and report across Facebook, Instagram, and LinkedIn from one clear workspace." canonicalUrl="https://www.bitlancetechhub.com/" />
            <header className="sticky top-0 z-50 border-b border-[#dfe5d9]/80 bg-[#fbfcf7]/90 px-4 backdrop-blur-xl sm:px-6">
                <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between">
                    <Link to="/" aria-label="Bitlance home"><Logo className="h-8" /></Link>
                    <nav className="hidden items-center gap-7 text-sm font-semibold text-[#4d5a48] lg:flex"><a href="#workflow" className="hover:text-[#172116]">How it works</a><a href="#features" className="hover:text-[#172116]">Features</a><a href="#agencies" className="hover:text-[#172116]">For agencies</a><Link to="/pricing" className="hover:text-[#172116]">Pricing</Link></nav>
                    <div className="flex items-center gap-2">
                        <button onClick={toggleTheme} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} className="grid h-10 w-10 place-items-center rounded-full text-[#596553] transition hover:bg-[#edf1e7]">{theme === 'dark' ? <Sun className="h-4 w-4"/> : <Moon className="h-4 w-4"/>}</button>
                        <Link to={user ? '/socialdashboad' : '/login'} className="hidden px-3 py-2 text-sm font-bold sm:block">{user ? 'Dashboard' : 'Log in'}</Link>
                        <Link to={primaryDest} className="hidden h-10 items-center gap-2 rounded-full bg-[#071414] px-4 text-xs font-bold text-white transition hover:bg-[#123030] sm:inline-flex">{primaryLabel}<ArrowRight className="h-3.5 w-3.5"/></Link>
                        <button
                            type="button"
                            className="grid h-10 w-10 place-items-center rounded-full border border-[#c9dada] bg-white text-[#071414] lg:hidden"
                            aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
                            aria-expanded={mobileMenuOpen}
                            aria-controls="mobile-navigation"
                            onClick={() => setMobileMenuOpen(open => !open)}
                        >
                            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                        </button>
                    </div>
                </div>
                {mobileMenuOpen && (
                    <nav id="mobile-navigation" className="mx-auto max-w-7xl border-t border-[#d8e5e5] pb-4 pt-3 lg:hidden">
                        <div className="grid gap-1 rounded-2xl bg-white p-2 shadow-[0_18px_45px_rgba(7,40,40,.1)]">
                            {[['#workflow', 'How it works'], ['#features', 'Features'], ['#agencies', 'For agencies']].map(([href, label]) => (
                                <a key={href} href={href} onClick={() => setMobileMenuOpen(false)} className="rounded-xl px-4 py-3 text-sm font-bold text-[#405555] transition hover:bg-[#e5f7f7] hover:text-[#071414]">{label}</a>
                            ))}
                            <Link to="/pricing" onClick={() => setMobileMenuOpen(false)} className="rounded-xl px-4 py-3 text-sm font-bold text-[#405555] transition hover:bg-[#e5f7f7] hover:text-[#071414]">Pricing</Link>
                            <div className="mt-1 grid grid-cols-2 gap-2 border-t border-[#e1eaea] pt-3">
                                <Link to={user ? '/socialdashboad' : '/login'} onClick={() => setMobileMenuOpen(false)} className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#c9dada] text-sm font-bold">{user ? 'Dashboard' : 'Log in'}</Link>
                                <Link to={primaryDest} onClick={() => setMobileMenuOpen(false)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#26CECE] px-3 text-sm font-bold text-[#061414]">{primaryLabel}<ArrowRight className="h-4 w-4"/></Link>
                            </div>
                        </div>
                    </nav>
                )}
            </header>
            <main>
                <section className="relative overflow-hidden px-4 pb-24 pt-16 sm:px-6 sm:pt-24">
                    <div className="pointer-events-none absolute left-1/2 top-0 h-[560px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(38,206,206,.22),transparent_65%)]" />
                    <div className="relative mx-auto max-w-7xl text-center">
                        <div className="mx-auto mb-7 inline-flex items-center gap-2 rounded-full border border-[#d0e2e2] bg-white px-4 py-2 text-xs font-bold text-[#405555] shadow-sm"><Sparkles className="h-4 w-4 text-[#159f9f]"/> Built for busy social teams, not busywork</div>
                        <h1 className="mx-auto max-w-5xl text-balance text-[clamp(3rem,7.2vw,6.8rem)] font-black leading-[.91] tracking-[-.065em]">Run every social account from <span className="relative whitespace-nowrap"><span className="relative z-10">one calm workspace.</span><span className="absolute bottom-[.06em] left-0 h-[.18em] w-full -rotate-1 rounded-full bg-[#26CECE]"/></span></h1>
                        <p className="mx-auto mt-8 max-w-2xl text-balance text-lg leading-relaxed text-[#586453] sm:text-xl">Create, approve, schedule, publish, and report across every client account—without stitching together spreadsheets, chat threads, and five different tools.</p>
                        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"><Link to={primaryDest} className={CTA}>{primaryLabel}<ArrowRight className="h-4 w-4"/></Link><a href="#workflow" className={SECONDARY_CTA}><Play className="h-4 w-4 fill-current"/>See how it works</a></div>
                        <p className="mt-4 text-xs font-medium text-[#788373]">15-day trial · Payment authorization required · Cancel before renewal</p>
                        <div className="mt-8 flex flex-wrap justify-center gap-2"><NetworkBadge icon={Facebook} label="Facebook"/><NetworkBadge icon={Instagram} label="Instagram"/><NetworkBadge icon={Linkedin} label="LinkedIn"/></div>
                        <ProductPreview />
                    </div>
                </section>
                <section className="border-y border-[#dfe5d9] bg-white px-4 py-8 sm:px-6"><div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 text-center md:grid-cols-4"><div><p className="text-3xl font-black">0.4 sec</p><p className="mt-1 text-xs font-semibold text-[#778171]">AI response speed</p></div><div><p className="text-3xl font-black">3 networks</p><p className="mt-1 text-xs font-semibold text-[#778171]">one publishing flow</p></div><div><p className="text-3xl font-black">24/7</p><p className="mt-1 text-xs font-semibold text-[#778171]">automation at work</p></div><div><p className="text-3xl font-black">1 calendar</p><p className="mt-1 text-xs font-semibold text-[#778171]">every client account</p></div></div></section>
                <section className="px-4 py-24 sm:px-6"><div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[.85fr_1.15fr] lg:items-center"><div><p className="text-xs font-black uppercase tracking-[.2em] text-[#159f9f]">The operating problem</p><h2 className="mt-4 text-4xl font-black leading-tight tracking-[-.04em] sm:text-5xl">Your calendar should not live in five places.</h2><p className="mt-5 max-w-lg text-base leading-relaxed text-[#5f7070]">When content lives in spreadsheets, approvals live in WhatsApp, and results live in separate dashboards, every post creates coordination work.</p></div><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-[26px] border border-[#dbe7e7] bg-[#f0f5f5] p-6"><p className="text-xs font-black uppercase tracking-[.16em] text-[#819292]">Before</p>{['Copying posts between tabs','Chasing client approvals','Rebuilding reports by hand','Discovering failed posts late'].map(x=><p key={x} className="mt-4 flex items-center gap-3 text-sm font-semibold text-[#627575]"><span className="h-1.5 w-1.5 rounded-full bg-[#a8bbbb]"/>{x}</p>)}</div><div className="rounded-[26px] bg-[#071414] p-6 text-white shadow-[0_24px_60px_rgba(7,20,20,.18)]"><p className="text-xs font-black uppercase tracking-[.16em] text-[#26CECE]">With Bitlance</p>{['One shared content calendar','One visible approval path','One publishing queue','One reporting rhythm'].map(x=><p key={x} className="mt-4 flex items-center gap-3 text-sm font-semibold"><Check className="h-4 w-4 text-[#26CECE]"/>{x}</p>)}</div></div></div></section>
                <section id="workflow" className="bg-[#071414] px-4 py-24 text-white sm:px-6"><div className="mx-auto max-w-6xl"><div className="max-w-2xl"><p className="text-xs font-black uppercase tracking-[.2em] text-[#26CECE]">One continuous workflow</p><h2 className="mt-4 text-4xl font-black tracking-[-.04em] sm:text-5xl">From idea to report, without the handoffs.</h2><p className="mt-5 text-[#adc5c5]">Every stage keeps the account, owner, approval status, and publishing result attached.</p></div><ol className="mt-14 grid gap-px overflow-hidden rounded-[28px] border border-white/10 bg-white/10 md:grid-cols-4">{FLOW.map(([num,title,body])=><li key={num} className="group bg-[#071414] p-7 transition hover:bg-[#102828]"><span className="text-xs font-black text-[#26CECE]">{num}</span><h3 className="mt-10 text-xl font-black">{title}</h3><p className="mt-3 text-sm leading-relaxed text-[#a6bcbc]">{body}</p><ChevronRight className="mt-6 h-5 w-5 text-[#26CECE] transition-transform group-hover:translate-x-1"/></li>)}</ol></div></section>
                <section id="features" className="px-4 py-24 sm:px-6"><div className="mx-auto max-w-6xl"><div className="flex flex-col justify-between gap-5 md:flex-row md:items-end"><div className="max-w-2xl"><p className="text-xs font-black uppercase tracking-[.2em] text-[#159f9f]">Built around the real work</p><h2 className="mt-4 text-4xl font-black tracking-[-.04em] sm:text-5xl">Less tool management. More campaigns out the door.</h2></div><Link to={primaryDest} className="inline-flex items-center gap-2 text-sm font-black">Explore the workspace <ArrowRight className="h-4 w-4"/></Link></div><div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{FEATURES.map(({icon,title,body},i)=><article key={title} className={`rounded-[26px] border border-[#d8e5e5] p-7 transition hover:-translate-y-1 hover:shadow-[0_20px_50px_rgba(7,40,40,.08)] ${i===0?'bg-[#26CECE]':'bg-white'}`}><span className={`grid h-11 w-11 place-items-center rounded-2xl ${i===0?'bg-[#071414] text-white':'bg-[#e5f7f7]'}`}>{React.createElement(icon, { className: 'h-5 w-5' })}</span><h3 className="mt-8 text-xl font-black tracking-[-.02em]">{title}</h3><p className={`mt-3 text-sm leading-relaxed ${i===0?'text-[#0a5050]':'text-[#5d7070]'}`}>{body}</p></article>)}</div></div></section>
                <section id="agencies" className="px-4 pb-24 sm:px-6"><div className="mx-auto grid max-w-6xl overflow-hidden rounded-[32px] bg-[#e8f3f3] lg:grid-cols-2"><div className="p-8 sm:p-12"><p className="text-xs font-black uppercase tracking-[.2em] text-[#159f9f]">For agencies</p><h2 className="mt-4 text-4xl font-black tracking-[-.04em]">Give every client a cleaner way to say “approved.”</h2><p className="mt-5 leading-relaxed text-[#5c7070]">Keep internal production powerful and the client experience simple. Share only what needs review, collect feedback in context, and preserve a clear decision trail.</p><ul className="mt-8 space-y-4">{['Separate client workspaces and calendars','Restricted client review portal','WhatsApp approval and revision requests','Recurring reports and growth panels'].map(x=><li key={x} className="flex items-center gap-3 text-sm font-bold"><span className="grid h-6 w-6 place-items-center rounded-full bg-[#071414] text-[#26CECE]"><Check className="h-3.5 w-3.5"/></span>{x}</li>)}</ul></div><div className="relative min-h-[420px] bg-[#cceaea] p-8"><div className="absolute inset-8 rounded-[24px] bg-white p-5 shadow-[0_30px_70px_rgba(7,40,40,.15)]"><div className="flex items-center justify-between border-b border-[#d8e5e5] pb-4"><div><p className="text-[10px] font-black uppercase tracking-[.18em] text-[#829494]">Client review</p><p className="mt-1 font-black">September product launch</p></div><span className="rounded-full bg-[#fff0ce] px-3 py-1 text-[10px] font-black text-[#765700]">Needs review</span></div><div className="mt-5 rounded-2xl bg-[#f2f7f7] p-4"><div className="h-28 rounded-xl bg-[linear-gradient(135deg,#071414,#247c7c)] p-4 text-white"><p className="text-xs font-bold text-[#26CECE]">NORTHLANE</p><p className="mt-5 max-w-[180px] text-xl font-black leading-tight">The campaign that follows through.</p></div><p className="mt-4 text-sm font-semibold">Launch week starts with a system the whole team can see.</p></div><div className="mt-5 grid grid-cols-2 gap-3"><button className="rounded-full border border-[#c9dada] py-3 text-xs font-black">Request changes</button><button className="rounded-full bg-[#071414] py-3 text-xs font-black text-white">Approve post</button></div></div></div></div></section>
                <section className="border-y border-[#d8e5e5] bg-white px-4 py-24 sm:px-6"><div className="mx-auto max-w-5xl"><div className="text-center"><p className="text-xs font-black uppercase tracking-[.2em] text-[#159f9f]">Questions, answered</p><h2 className="mt-4 text-4xl font-black tracking-[-.04em] sm:text-5xl">Know what happens before you connect.</h2></div><div className="mt-12 grid gap-x-10 md:grid-cols-2">{FAQ.map(([q,a])=><details key={q} className="group border-b border-[#d8e5e5] py-5"><summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-black"><span>{q}</span><span className="text-xl text-[#159f9f] transition group-open:rotate-45">+</span></summary><p className="pt-4 text-sm leading-relaxed text-[#5f7070]">{a}</p></details>)}</div></div></section>
                <section className="px-4 py-24 sm:px-6"><div className="relative mx-auto max-w-6xl overflow-hidden rounded-[34px] bg-[#26CECE] px-7 py-16 text-center sm:px-12"><div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full border-[40px] border-[#071414]/5"/><Zap className="mx-auto h-8 w-8 fill-[#071414]"/><h2 className="mx-auto mt-6 max-w-3xl text-4xl font-black leading-tight tracking-[-.045em] sm:text-6xl">Put your whole social workflow on one screen.</h2><p className="mx-auto mt-5 max-w-xl text-[#0a5050]">Start your 15-day trial and bring your first Facebook, Instagram, or LinkedIn account into Bitlance.</p><div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"><Link to={primaryDest} className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[#071414] px-7 text-sm font-black text-white">{primaryLabel}<ArrowRight className="h-4 w-4"/></Link><Link to="/pricing" className="inline-flex min-h-12 items-center gap-2 rounded-full border border-[#0d8888] px-7 text-sm font-black">View pricing</Link></div></div></section>
            </main>
            <footer className="bg-[#071414] px-4 py-12 text-white sm:px-6"><div className="mx-auto flex max-w-6xl flex-col gap-8 sm:flex-row sm:items-center sm:justify-between"><div><Logo className="h-8"/><p className="mt-3 max-w-sm text-xs leading-relaxed text-[#9bb4b4]">Social publishing, approvals, and reporting for teams that manage more than one account.</p></div><div className="flex flex-wrap gap-x-6 gap-y-3 text-xs font-bold text-[#c0d1d1]"><Link to="/pricing">Pricing</Link><Link to="/privacy-policy">Privacy</Link><Link to="/terms-policy">Terms</Link><Link to="/data-deletion">Data deletion</Link></div><p className="text-xs text-[#789292]">© {new Date().getFullYear()} Bitlance</p></div></footer>
        </div>
    );
};

export default LandingPage;
