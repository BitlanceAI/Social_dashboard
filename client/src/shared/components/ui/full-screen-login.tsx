import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, AlertCircle, CalendarClock } from 'lucide-react';

interface FullScreenLoginProps {
    email: string;
    setEmail: (value: string) => void;
    password: string;
    setPassword: (value: string) => void;
    handleSubmit: (e: FormEvent) => void;
    loading: boolean;
    error?: string;
}

export function FullScreenLogin({ email, setEmail, password, setPassword, handleSubmit, loading, error }: FullScreenLoginProps) {
    const [showPassword, setShowPassword] = useState(false);
    const inputClass = 'w-full min-w-0 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[var(--accent)] placeholder:text-[var(--text)]/50';
    return (
        <main className="min-h-screen bg-[var(--bg)] text-[var(--text)] px-4 py-5 sm:p-8 flex items-center justify-center">
            <div className="w-full max-w-5xl overflow-hidden rounded-2xl border border-[var(--border)] grid lg:grid-cols-[0.85fr_1.15fr]">
                <aside className="hidden lg:flex flex-col justify-between bg-[var(--surface)] p-10 border-r border-[var(--border)]">
                    <Link to="/" className="text-lg font-bold tracking-tight">Bitlance<span className="text-[var(--accent)]">.</span></Link>
                    <div className="py-12">
                        <CalendarClock aria-hidden="true" className="w-8 h-8 text-[var(--accent)] mb-6" />
                        <h2 className="text-4xl font-bold leading-tight tracking-tight border-l-4 border-[var(--accent)] pl-4">Your next post<br />starts here.</h2>
                        <p className="mt-5 text-sm leading-relaxed text-[var(--text)]/75">Pick up where you left off. Manage your content, connected accounts, and approvals in one place.</p>
                    </div>
                    <p className="text-xs text-[var(--text)]/70">Your publishing workspace</p>
                </aside>
                <section className="p-5 sm:p-8 lg:p-10 flex flex-col justify-center">
                    <Link to="/" className="lg:hidden inline-block text-sm font-bold mb-6">Bitlance<span className="text-[var(--accent)]">.</span></Link>
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Welcome back</h1>
                    <p className="mt-2 mb-7 text-sm text-[var(--text)]/75">Log in to your Bitlance account.</p>
                    {error && <div role="alert" id="login-error" className="mb-5 rounded-xl border border-[var(--signup-error)] p-3 text-[var(--signup-error)] text-sm flex gap-2"><AlertCircle aria-hidden="true" className="h-5 w-5 shrink-0" />{error}</div>}
                    <form onSubmit={handleSubmit} aria-busy={loading} aria-describedby={error ? 'login-error' : undefined}>
                        <fieldset disabled={loading} className="space-y-5 disabled:opacity-70">
                            <legend className="sr-only">Login details</legend>
                            <div>
                                <label htmlFor="login-email" className="block text-sm font-medium mb-1.5">Email address</label>
                                <input id="login-email" name="email" type="email" autoComplete="email" placeholder="you@company.com" required value={email} onChange={e => setEmail(e.target.value)} className={inputClass} />
                            </div>
                            <div>
                                <label htmlFor="login-password" className="block text-sm font-medium mb-1.5">Password</label>
                                <div className="relative">
                                    <input id="login-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Enter your password" required value={password} onChange={e => setPassword(e.target.value)} className={`${inputClass} pr-12`} />
                                    <button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} className="absolute right-1 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-lg focus-visible:outline focus-visible:outline-[var(--accent)]">
                                        {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                                    </button>
                                </div>
                            </div>
                            <button type="submit" disabled={loading} className="btn-primary w-full rounded-xl py-3 px-4 flex items-center justify-center gap-2 disabled:cursor-wait">
                                {loading ? 'Logging in…' : 'Log in'}<ArrowRight aria-hidden="true" className="h-4 w-4" />
                            </button>
                        </fieldset>
                        <p className="mt-6 text-center text-sm">New to Bitlance? <Link to="/signup" className="font-semibold underline underline-offset-4">Create account</Link></p>
                    </form>
                    <div className="mt-7 flex justify-center gap-4 text-xs text-[var(--text)]/70">
                        <Link to="/terms-policy" className="underline underline-offset-2">Terms of Service</Link>
                        <Link to="/privacy-policy" className="underline underline-offset-2">Privacy Policy</Link>
                    </div>
                </section>
            </div>
        </main>
    );
}
