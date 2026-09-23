import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle, Eye, EyeOff, AlertCircle, CalendarClock, Layers, MessageCircle } from 'lucide-react';
import { validateSignup, MIN_PASSWORD_LENGTH } from '@/features/auth/lib/signupValidation';

interface SignupForm {
    name: string;
    phone: string;
    email: string;
    password: string;
    callConsent: boolean;
}
interface FullScreenSignupProps {
    formData: SignupForm;
    handleChange: (e: ChangeEvent<HTMLInputElement>) => void;
    handleSubmit: (e: FormEvent) => void;
    loading: boolean;
    error: string;
    success: string;
}
const fields = [
    { name: 'email', label: 'Email address', type: 'email', autocomplete: 'email', placeholder: 'you@company.com' },
    { name: 'name', label: 'Full name', type: 'text', autocomplete: 'name', placeholder: 'Your full name' },
    { name: 'password', label: 'Password', type: 'password', autocomplete: 'new-password', placeholder: 'At least 8 characters' },
    { name: 'phone', label: 'Phone number', type: 'tel', autocomplete: 'tel', placeholder: '+91 98765 43210' },
] as const;

export function FullScreenSignup({ formData, handleChange, handleSubmit, loading, error, success }: FullScreenSignupProps) {
    const [showPassword, setShowPassword] = useState(false);
    const [touched, setTouched] = useState<Record<string, boolean>>({});
    const [submitted, setSubmitted] = useState(false);
    const errors = validateSignup(formData);
    const submit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setSubmitted(true);
        if (loading || success) return;
        if (Object.keys(errors).length) {
            event.currentTarget.querySelector<HTMLInputElement>(`[name="${Object.keys(errors)[0]}"]`)?.focus();
            return;
        }
        handleSubmit(event);
    };
    return (
        <main className="min-h-screen bg-[var(--bg)] text-[var(--text)] px-4 py-5 sm:p-8 flex items-center justify-center">
            <div className="w-full max-w-5xl overflow-hidden rounded-2xl border border-[var(--border)] grid lg:grid-cols-[0.85fr_1.15fr]">
                <aside className="hidden lg:flex flex-col justify-between bg-[var(--surface)] p-10 border-r border-[var(--border)]">
                    <Link to="/" className="text-lg font-bold tracking-tight">Bitlance<span className="text-[var(--accent)]">.</span></Link>
                    <div className="py-12">
                        <p className="text-xs font-semibold uppercase tracking-widest mb-4">Your publishing workspace</p>
                        <h2 className="text-4xl font-bold leading-tight tracking-tight border-l-4 border-[var(--accent)] pl-4">Create. Schedule.<br />Stay consistent.</h2>
                        <p className="mt-5 text-sm leading-relaxed text-[var(--text)]/75">Bring your social content, connected accounts, and approvals together in one place.</p>
                        <ul className="mt-8 space-y-5 text-sm">
                            <li className="flex items-center gap-3"><CalendarClock aria-hidden="true" className="w-5 h-5 text-[var(--accent)]" /> Plan your posts ahead</li>
                            <li className="flex items-center gap-3"><Layers aria-hidden="true" className="w-5 h-5 text-[var(--accent)]" /> Manage multiple accounts</li>
                            <li className="flex items-center gap-3"><MessageCircle aria-hidden="true" className="w-5 h-5 text-[var(--accent)]" /> Review content with your team</li>
                        </ul>
                    </div>
                    <Link to="/pricing" className="text-sm underline underline-offset-4">Explore plans and trial details</Link>
                </aside>
                <section className="p-5 sm:p-8 lg:p-10">
                    <Link to="/" className="lg:hidden inline-block text-sm font-bold mb-5">Bitlance<span className="text-[var(--accent)]">.</span></Link>
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Create your account</h1>
                    <p className="mt-2 mb-5 text-sm leading-relaxed text-[var(--text)]/75">Next, choose a plan and authorize payment to start your trial.</p>
                    {error && <div role="alert" className="mb-4 rounded-xl border border-[var(--signup-error)] p-3 text-[var(--signup-error)] text-sm flex gap-2"><AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />{error}</div>}
                    {success && <div role="status" className="mb-4 rounded-xl bg-[var(--accent-muted)] p-3 text-sm flex gap-2"><CheckCircle className="h-5 w-5 shrink-0 text-[var(--accent)]" aria-hidden="true" />{success}</div>}
                    <form onSubmit={submit} noValidate aria-busy={loading}>
                        <fieldset disabled={loading || Boolean(success)} className="space-y-4 disabled:opacity-70">
                            <legend className="sr-only">Account details</legend>
                            {fields.map(field => {
                                const invalid = Boolean((submitted || touched[field.name]) && errors[field.name]);
                                return <div key={field.name}>
                                    <label htmlFor={`signup-${field.name}`} className="block text-sm font-medium mb-1.5">{field.label}{field.name === 'phone' && <span className="font-normal text-[var(--text)]/65"> (optional)</span>}</label>
                                    <div className="relative">
                                        <input id={`signup-${field.name}`} name={field.name} type={field.name === 'password' && showPassword ? 'text' : field.type}
                                            autoComplete={field.autocomplete} placeholder={field.placeholder} value={formData[field.name]} onChange={handleChange}
                                            onBlur={() => setTouched(prev => ({ ...prev, [field.name]: true }))}
                                            required={field.name !== 'phone'} minLength={field.name === 'password' ? MIN_PASSWORD_LENGTH : undefined}
                                            aria-invalid={invalid} aria-describedby={invalid ? `${field.name}-error` : field.name === 'password' ? 'password-help' : undefined}
                                            className={`w-full min-w-0 rounded-xl border bg-[var(--bg)] px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[var(--accent)] placeholder:text-[var(--text)]/50 ${field.name === 'password' ? 'pr-12' : ''} ${invalid ? 'border-[var(--signup-error)]' : 'border-[var(--border)]'}`} />
                                        {field.name === 'password' && <button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}
                                            className="absolute right-1 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-lg focus-visible:outline focus-visible:outline-[var(--accent)]">
                                            {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                                        </button>}
                                    </div>
                                    {field.name === 'password' && <p id="password-help" className="mt-1 text-xs text-[var(--text)]/70">Use at least 8 characters. A longer, unique passphrase is best.</p>}
                                    {invalid && <p id={`${field.name}-error`} className="mt-1 text-xs text-[var(--signup-error)]">{errors[field.name]}</p>}
                                </div>;
                            })}
                            <label className="flex items-start gap-2.5 text-xs leading-relaxed cursor-pointer">
                                <input type="checkbox" name="callConsent" checked={formData.callConsent} onChange={handleChange} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]" />
                                <span>I would like an automated AI onboarding call at this number after signup. Optional.</span>
                            </label>
                            <p className="text-xs leading-relaxed text-[var(--text)]/75">By creating an account, you agree to the <Link to="/terms-policy" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">Terms of Service</Link> and acknowledge the <Link to="/privacy-policy" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">Privacy Policy</Link>.</p>
                            <button type="submit" className="btn-primary w-full rounded-xl py-3 px-4 flex items-center justify-center gap-2 disabled:cursor-wait" disabled={loading || Boolean(success)}>
                                {loading ? 'Creating account…' : success ? 'Account created' : 'Create account'}<ArrowRight aria-hidden="true" className="h-4 w-4" />
                            </button>
                        </fieldset>
                        <p className="mt-3 text-xs leading-relaxed text-[var(--text)]/70">Payment authorization is required for the trial. Subscription billing begins after the trial; plan details are shown before authorization.</p>
                        <p className="mt-5 text-center text-sm">Already have an account? <Link to="/login" className="font-semibold underline underline-offset-4">Log in</Link></p>
                    </form>
                </section>
            </div>
        </main>
    );
}
