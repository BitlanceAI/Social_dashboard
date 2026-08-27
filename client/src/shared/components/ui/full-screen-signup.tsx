"use client";

import { Bot as BotIcon, Mail, User, Phone, Lock, CheckCircle, Eye, EyeOff, AlertCircle } from "lucide-react";
import React, { useState } from "react";
import { ElegantShape } from "./shape-landing-hero";

const TEAL = '#26CECE';

interface FullScreenSignupProps {
    formData: any;
    handleChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    handleSubmit: (e: React.FormEvent) => void;
    loading: boolean;
    error: string;
    success: string;
}

function getPasswordStrength(pw: string): { label: string; color: string; width: string } {
    if (pw.length === 0) return { label: '', color: '#333', width: '0%' };
    if (pw.length < 6)   return { label: 'Too short', color: '#ef4444', width: '25%' };
    if (pw.length < 10)  return { label: 'Weak', color: '#f97316', width: '50%' };
    if (pw.length < 14 || !/[0-9]/.test(pw)) return { label: 'Good', color: '#eab308', width: '75%' };
    return { label: 'Strong', color: TEAL, width: '100%' };
}

export const FullScreenSignup = ({
    formData,
    handleChange,
    handleSubmit,
    loading,
    error,
    success
}: FullScreenSignupProps) => {
    const [showPassword, setShowPassword] = useState(false);
    const [touched, setTouched] = useState<Record<string, boolean>>({});

    const markTouched = (name: string) =>
        setTouched(prev => ({ ...prev, [name]: true }));

    const emailInvalid = touched.email && formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email);
    const passwordShort = touched.password && formData.password && formData.password.length < 6;
    const strength = getPasswordStrength(formData.password);

    const fieldBorder = (name: string, invalid?: boolean) => {
        if (invalid) return '#ef4444';
        if (touched[name] && formData[name]) return TEAL;
        return '#222';
    };

    return (
        <div className="min-h-screen flex items-center justify-center overflow-auto p-4 bg-white" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            <div className="w-full relative max-w-5xl overflow-hidden flex flex-col md:flex-row shadow-2xl my-8" style={{ borderRadius: 2, border: '1px solid #1E1E1E' }}>

                {/* Left side — Branding */}
                <div className="w-full md:w-1/2 relative overflow-hidden bg-gray-50 flex flex-col justify-end min-h-[400px] border-b md:border-b-0 md:border-r border-gray-200">
                    <div className="absolute inset-0 overflow-hidden pointer-events-none">
                        <ElegantShape delay={0.3} width={600} height={140} rotate={12} gradient="from-[#26CECE]/[0.15]" className="left-[-15%] top-[15%]" />
                        <ElegantShape delay={0.5} width={500} height={120} rotate={-15} gradient="from-[#26CECE]/[0.10]" className="right-[-10%] top-[70%]" />
                        <ElegantShape delay={0.7} width={300} height={80} rotate={-8} gradient="from-indigo-500/[0.15]" className="left-[5%] bottom-[10%]" />
                    </div>
                    <div className="absolute inset-0 opacity-20" style={{ backgroundImage: `radial-gradient(${TEAL} 1px, transparent 1px)`, backgroundSize: '20px 20px' }} />
                    <div className="absolute inset-0 bg-gradient-to-t from-white via-white/80 to-transparent" />

                    <div className="relative z-10 p-8 md:p-12 text-black pb-16">
                        <div style={{ fontFamily: "'DM Mono', monospace", color: TEAL, fontSize: 11, letterSpacing: '0.14em', marginBottom: 16 }}>
                            AGENT DEPLOYMENT
                        </div>
                        <h1 className="text-3xl md:text-5xl font-extrabold leading-[1.1] tracking-tight text-black mb-6">
                            Build AI Agents that Close Deals.
                        </h1>
                        <p className="text-black/60 text-lg leading-relaxed">
                            Bitlance Platform gives you the tools to build, deploy, and scale intelligent automation.
                        </p>
                    </div>
                </div>

                {/* Right side — Form */}
                <div className="p-8 md:p-12 md:w-1/2 flex flex-col bg-white z-20 text-black justify-center">
                    <div className="flex flex-col items-start mb-8">
                        <div className="mb-6 flex items-center justify-center w-12 h-12" style={{ background: `${TEAL}15`, border: `1px solid ${TEAL}40`, borderRadius: 2, color: TEAL }}>
                            <BotIcon size={24} />
                        </div>
                        <h2 className="text-3xl font-bold tracking-tight mb-2">Create Account</h2>
                        <p className="text-gray-600" style={{ fontFamily: "'DM Mono', monospace", fontSize: 13 }}>
                            Takes less than 60 seconds · No credit card required
                        </p>
                    </div>

                    {error && (
                        <div className="mb-6 p-4 flex items-start gap-3" style={{ background: '#ef444415', border: '1px solid #ef444450', borderRadius: 2, color: '#fca5a5' }}>
                            <AlertCircle size={20} className="flex-shrink-0 mt-0.5" />
                            <span className="text-sm font-bold">{error}</span>
                        </div>
                    )}

                    {success && (
                        <div className="mb-6 p-4 flex items-start gap-3" style={{ background: `${TEAL}15`, border: `1px solid ${TEAL}50`, borderRadius: 2, color: TEAL }}>
                            <CheckCircle size={20} className="flex-shrink-0 mt-0.5" />
                            <span className="text-sm font-bold">{success}</span>
                        </div>
                    )}

                    <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>

                        {/* Email — first, lowest friction */}
                        <div>
                            <label htmlFor="email" className="block text-xs uppercase tracking-widest font-bold mb-2 text-gray-600" style={{ fontFamily: "'DM Mono', monospace" }}>
                                Email Address
                            </label>
                            <div className="relative">
                                <input
                                    type="email"
                                    id="email"
                                    name="email"
                                    placeholder="hi@bitlance.in"
                                    autoComplete="email"
                                    className="w-full pl-11 py-3 px-3 focus:outline-none transition-all"
                                    style={{ background: '#ffffff', border: `1px solid ${fieldBorder('email', emailInvalid)}`, borderRadius: 2, color: '#000000' }}
                                    value={formData.email}
                                    onChange={handleChange}
                                    onFocus={(e) => e.target.style.borderColor = emailInvalid ? '#ef4444' : TEAL}
                                    onBlur={(e) => { markTouched('email'); e.target.style.borderColor = fieldBorder('email', emailInvalid); }}
                                    required
                                />
                                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                            </div>
                            {emailInvalid && (
                                <p className="mt-1 text-xs text-red-400">Enter a valid email address</p>
                            )}
                        </div>

                        {/* Full Name */}
                        <div>
                            <label htmlFor="name" className="block text-xs uppercase tracking-widest font-bold mb-2 text-gray-600" style={{ fontFamily: "'DM Mono', monospace" }}>
                                Full Name
                            </label>
                            <div className="relative">
                                <input
                                    type="text"
                                    id="name"
                                    name="name"
                                    placeholder="John Doe"
                                    autoComplete="name"
                                    className="w-full pl-11 py-3 px-3 focus:outline-none transition-all"
                                    style={{ background: '#ffffff', border: `1px solid ${fieldBorder('name')}`, borderRadius: 2, color: '#000000' }}
                                    value={formData.name}
                                    onChange={handleChange}
                                    onFocus={(e) => e.target.style.borderColor = TEAL}
                                    onBlur={(e) => { markTouched('name'); e.target.style.borderColor = fieldBorder('name'); }}
                                    required
                                />
                                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                            </div>
                        </div>

                        {/* Phone — with context explaining why it's needed */}
                        <div>
                            <label htmlFor="phone" className="block text-xs uppercase tracking-widest font-bold mb-2 text-gray-600" style={{ fontFamily: "'DM Mono', monospace" }}>
                                Phone Number
                            </label>
                            <div className="relative">
                                <input
                                    type="tel"
                                    id="phone"
                                    name="phone"
                                    placeholder="+91 98765 43210"
                                    autoComplete="tel"
                                    className="w-full pl-11 py-3 px-3 focus:outline-none transition-all"
                                    style={{ background: '#ffffff', border: `1px solid ${fieldBorder('phone')}`, borderRadius: 2, color: '#000000' }}
                                    value={formData.phone}
                                    onChange={handleChange}
                                    onFocus={(e) => e.target.style.borderColor = TEAL}
                                    onBlur={(e) => { markTouched('phone'); e.target.style.borderColor = fieldBorder('phone'); }}
                                />
                                <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                            </div>
                            <p className="mt-1 text-xs" style={{ color: '#555', fontFamily: "'DM Mono', monospace" }}>
                                {'Optional - Used for onboarding assistance only'}
                            </p>
                        </div>

                        {/* Password — with strength meter and upfront hint */}
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <label htmlFor="password" className="block text-xs uppercase tracking-widest font-bold text-gray-600" style={{ fontFamily: "'DM Mono', monospace" }}>
                                    Password
                                </label>
                                <span className="text-xs" style={{ color: '#555', fontFamily: "'DM Mono', monospace" }}>Min. 6 characters</span>
                            </div>
                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    id="password"
                                    name="password"
                                    placeholder="••••••••"
                                    autoComplete="new-password"
                                    className="w-full pl-11 pr-11 py-3 px-3 focus:outline-none transition-all"
                                    style={{ background: '#ffffff', border: `1px solid ${fieldBorder('password', passwordShort)}`, borderRadius: 2, color: '#000000' }}
                                    value={formData.password}
                                    onChange={handleChange}
                                    onFocus={(e) => e.target.style.borderColor = passwordShort ? '#ef4444' : TEAL}
                                    onBlur={(e) => { markTouched('password'); e.target.style.borderColor = fieldBorder('password', passwordShort); }}
                                    required
                                />
                                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-600"
                                    tabIndex={-1}
                                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                                >
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                            {/* Strength meter */}
                            {formData.password.length > 0 && (
                                <div className="mt-2">
                                    <div className="h-1 w-full rounded-full" style={{ background: '#222' }}>
                                        <div
                                            className="h-1 rounded-full transition-all duration-300"
                                            style={{ width: strength.width, background: strength.color }}
                                        />
                                    </div>
                                    {strength.label && (
                                        <p className="mt-1 text-xs" style={{ color: strength.color, fontFamily: "'DM Mono', monospace" }}>
                                            {strength.label}
                                        </p>
                                    )}
                                </div>
                            )}
                            {passwordShort && (
                                <p className="mt-1 text-xs text-red-400">Password must be at least 6 characters</p>
                            )}
                        </div>

                        <div className="text-sm font-bold p-4 text-center mt-2 flex items-center justify-center gap-2" style={{ background: `${TEAL}15`, border: `1px solid ${TEAL}40`, borderRadius: 2, color: TEAL }}>
                            🎁 <span>New accounts get <strong>50 free credits</strong> to start!</span>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full font-bold py-4 px-4 transition-all mt-2 flex justify-center items-center hover:scale-[1.02] active:scale-95 disabled:hover:scale-100 disabled:opacity-50"
                            style={{ background: TEAL, color: '#070707', border: 'none', borderRadius: 2 }}
                        >
                            {loading ? 'CREATING ACCOUNT...' : 'CREATE ACCOUNT & CLAIM 50 CREDITS'}
                        </button>

                        <div className="text-center text-xs mt-2 text-gray-600" style={{ fontFamily: "'DM Mono', monospace" }}>
                            🔒 100% FREE · NO CREDIT CARD REQUIRED · YOUR DATA IS SAFE
                        </div>

                        <div className="text-center text-gray-600 text-sm mt-4">
                            Already have an account?{" "}
                            <a href="/login" className="font-bold hover:underline" style={{ color: TEAL }}>
                                Login
                            </a>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};
