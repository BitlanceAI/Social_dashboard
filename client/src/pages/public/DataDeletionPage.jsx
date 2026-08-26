import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import Logo from '../../components/layout/Logo';
import DataDeletionSteps from '../../components/legal/DataDeletionSteps';

/**
 * Standalone data deletion instructions.
 *
 * This is the URL to put in Meta App Dashboard -> Settings -> Basic ->
 * "Data Deletion Instructions URL". It must be publicly reachable without
 * logging in.
 */
const DataDeletionPage = () => (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
        <header className="px-6 py-4 border-b border-[var(--border)]">
            <div className="max-w-3xl mx-auto flex items-center justify-between">
                <Link
                    to="/"
                    className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-[var(--border)] text-[10px] font-mono uppercase tracking-widest text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <Logo className="h-5" />
                </Link>
                <Link
                    to="/privacy-policy"
                    className="px-4 py-1.5 rounded-full text-[10px] font-mono uppercase tracking-widest text-[var(--muted)] hover:text-[var(--accent)] hover:bg-[var(--surface)] transition-colors"
                >
                    Privacy Policy
                </Link>
            </div>
        </header>

        <main className="max-w-3xl mx-auto px-6 py-16">
            <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--accent)] mb-3">
                Your data
            </p>
            <h1 className="font-['Space_Grotesk'] text-3xl sm:text-4xl font-extrabold tracking-tight mb-8">
                Data Deletion Instructions
            </h1>
            <p className="text-[var(--muted)] text-sm leading-relaxed mb-12 max-w-2xl">
                This page explains what data we hold when you connect a Facebook or
                Instagram account, and how to have it deleted.
            </p>

            <DataDeletionSteps />
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

export default DataDeletionPage;
