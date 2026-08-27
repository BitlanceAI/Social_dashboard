"use client";

import { Bot as BotIcon, Mail, Lock, Eye, EyeOff, AlertCircle } from "lucide-react";
import React, { useState } from "react";
import { ElegantShape } from "./shape-landing-hero";

const TEAL = '#26CECE';

interface FullScreenLoginProps {
    email: string;
    setEmail: (value: string) => void;
    password: string;
    setPassword: (value: string) => void;
    handleSubmit: (e: React.FormEvent) => void;
    loading: boolean;
}

export const FullScreenLogin = ({
    email,
    setEmail,
    password,
    setPassword,
    handleSubmit,
    loading
}: FullScreenLoginProps) => {
    const [showPassword, setShowPassword] = useState(false);

    return (
        <div className="min-h-screen flex items-center justify-center overflow-hidden p-4 bg-white" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            <div className="w-full relative max-w-5xl overflow-hidden flex flex-col md:flex-row shadow-2xl" style={{ borderRadius: 2, border: '1px solid #1E1E1E' }}>

                {/* Left side Image & Branding */}
                <div className="w-full md:w-1/2 relative overflow-hidden bg-gray-50 flex flex-col justify-end min-h-[400px] border-b md:border-b-0 md:border-r border-gray-200">
                    {/* Animated Shapes Background */}
                    <div className="absolute inset-0 overflow-hidden pointer-events-none">
                        <ElegantShape
                            delay={0.3}
                            width={600}
                            height={140}
                            rotate={12}
                            gradient="from-[#26CECE]/[0.15]"
                            className="left-[-15%] top-[15%]"
                        />
                        <ElegantShape
                            delay={0.5}
                            width={500}
                            height={120}
                            rotate={-15}
                            gradient="from-[#26CECE]/[0.10]"
                            className="right-[-10%] top-[70%]"
                        />
                        <ElegantShape
                            delay={0.7}
                            width={300}
                            height={80}
                            rotate={-8}
                            gradient="from-indigo-500/[0.15]"
                            className="left-[5%] bottom-[10%]"
                        />
                    </div>

                    {/* Brutalist Pattern Background */}
                    <div
                        className="absolute inset-0 opacity-20"
                        style={{
                            backgroundImage: `radial-gradient(${TEAL} 1px, transparent 1px)`,
                            backgroundSize: '20px 20px'
                        }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-white via-white/80 to-transparent"></div>

                    <div className="relative z-10 p-8 md:p-12 text-black pb-16">
                        <div style={{ fontFamily: "'DM Mono', monospace", color: TEAL, fontSize: 11, letterSpacing: '0.14em', marginBottom: 16 }}>
                            SECURE ACCESS
                        </div>
                        <h1 className="text-3xl md:text-5xl font-extrabold leading-[1.1] tracking-tight text-black mb-6">
                            Welcome back to<br />
                            <span style={{ color: TEAL }}>Bitlance.</span>
                        </h1>
                        <p className="text-black/60 text-lg leading-relaxed">
                            Sign in to access your intelligent automation agents and continue building.
                        </p>
                    </div>
                </div>

                {/* Right side form */}
                <div className="p-8 md:p-12 md:w-1/2 flex flex-col bg-white z-20 text-black justify-center">
                    <div className="flex flex-col items-start mb-8">
                        <div className="mb-6 flex items-center justify-center w-12 h-12" style={{ background: `${TEAL}15`, border: `1px solid ${TEAL}40`, borderRadius: 2, color: TEAL }}>
                            <BotIcon size={24} />
                        </div>
                        <h2 className="text-3xl font-bold tracking-tight mb-2">
                            Sign In
                        </h2>
                        <p className="text-gray-600" style={{ fontFamily: "'DM Mono', monospace", fontSize: 13 }}>
                            Access your AI agents
                        </p>
                    </div>

                    <form
                        className="flex flex-col gap-6"
                        onSubmit={handleSubmit}
                    >
                        {/* Email Field */}
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
                                    className="w-full pl-11 py-3 px-3 focus:outline-none transition-all"
                                    style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 2, color: '#000000' }}
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    onFocus={(e) => e.target.style.borderColor = TEAL}
                                    onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                                    required
                                />
                                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                            </div>
                        </div>

                        {/* Password Field */}
                        <div>
                            <label htmlFor="password" className="block text-xs uppercase tracking-widest font-bold mb-2 text-gray-600" style={{ fontFamily: "'DM Mono', monospace" }}>
                                Password
                            </label>
                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    id="password"
                                    name="password"
                                    placeholder="••••••••"
                                    className="w-full pl-11 pr-11 py-3 px-3 focus:outline-none transition-all"
                                    style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 2, color: '#000000' }}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    onFocus={(e) => e.target.style.borderColor = TEAL}
                                    onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                                    required
                                />
                                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-600"
                                    tabIndex={-1}
                                >
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full font-bold py-4 px-4 transition-all mt-4 flex justify-center items-center hover:scale-[1.02] active:scale-95 disabled:hover:scale-100 disabled:opacity-50"
                            style={{ background: TEAL, color: '#070707', border: 'none', borderRadius: 2 }}
                        >
                            {loading ? 'SIGNING IN...' : 'SIGN IN'}
                        </button>

                        <div className="text-center text-gray-600 text-sm mt-4">
                            Don't have an account?{" "}
                            <a href="/signup" className="font-bold hover:underline" style={{ color: TEAL }}>
                                Create account
                            </a>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};
