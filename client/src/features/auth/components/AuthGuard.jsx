import React, { useEffect, useState } from 'react';
import { fetchMyBilling } from '@/features/billing/lib/billingApi';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/features/auth/context/AuthContext';
import Logo from '@/shared/components/layout/Logo';

const PLAN_CACHE_MS = 2 * 60 * 1000;
const planCacheKey = userId => `social-dashboard:active-plan:${userId}`;

function recentActivePlan(userId) {
    if (!userId) return false;
    try {
        const cached = JSON.parse(sessionStorage.getItem(planCacheKey(userId)) || 'null');
        return cached?.active === true && Date.now() - cached.checkedAt < PLAN_CACHE_MS;
    } catch { return false; }
}

function rememberActivePlan(userId, active) {
    try {
        if (active) sessionStorage.setItem(planCacheKey(userId), JSON.stringify({ active: true, checkedAt: Date.now() }));
        else sessionStorage.removeItem(planCacheKey(userId));
    } catch { /* Storage can be unavailable in private browsing. */ }
}

export function DashboardLoading({ error, onRetry }) {
    return <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]" aria-busy={!error}>
        <header className="flex h-20 items-center border-b border-[var(--border)] bg-[var(--surface)] px-6 sm:px-10">
            <Logo className="h-8" />
        </header>
        <main className="mx-auto max-w-6xl px-6 py-10 sm:px-10">
            {error ? <div role="alert" className="max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
                <h1 className="text-lg font-semibold">Dashboard is taking longer to load</h1>
                <p className="mt-2 text-sm text-[var(--muted)]">We couldn’t verify your access right now. Please try again.</p>
                <div className="mt-5 flex gap-3 text-sm"><button onClick={onRetry} className="rounded-lg bg-[var(--accent)] px-4 py-2 font-medium text-white">Try again</button>
                    <a href="/billing" className="rounded-lg border border-[var(--border)] px-4 py-2">Open Billing</a></div>
            </div> : <div role="status" aria-label="Loading dashboard" className="animate-pulse">
                <div className="h-8 w-52 rounded-lg bg-[var(--surface)]" />
                <div className="mt-8 grid gap-5 sm:grid-cols-3">
                    {[0, 1, 2].map(item => <div key={item} className="h-32 rounded-2xl border border-[var(--border)] bg-[var(--surface)]" />)}
                </div>
                <div className="mt-6 h-72 rounded-2xl border border-[var(--border)] bg-[var(--surface)]" />
            </div>}
        </main>
    </div>;
}

const AuthGuard = ({ children }) => {
    const { user, loading, isAdmin } = useAuth();
    const location = useLocation();
    const [billing, setBilling] = useState(null);
    const [billingError, setBillingError] = useState(false);
    const [retry, setRetry] = useState(0);
    const exempt = location.pathname === '/billing' || isAdmin;
    const userId = user?.id;

    useEffect(() => {
        if (!userId || exempt) return;
        let current = true;
        fetchMyBilling().then(result => {
            if (!current) return;
            rememberActivePlan(userId, result.active);
            setBilling({ active: result.active, userId });
            setBillingError(false);
        }).catch(() => { if (current) setBillingError(true); });
        return () => { current = false; };
    }, [userId, exempt, retry]);

    if (loading) return <DashboardLoading />;
    if (!user) return <Navigate to="/login" state={{ from: location }} replace />;

    if (!exempt) {
        const verified = billing?.userId === userId ? billing.active : recentActivePlan(userId);
        if (billing?.userId === userId && !billing.active) return <Navigate to="/billing" replace />;
        if (!verified) return <DashboardLoading error={billingError} onRetry={() => { setBillingError(false); setRetry(value => value + 1); }} />;
    }
    return children;
};

export default AuthGuard;
