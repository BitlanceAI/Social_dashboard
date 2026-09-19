import React, { useEffect, useState } from 'react';
import { fetchMyBilling } from '@/features/billing/lib/billingApi';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from "@/features/auth/context/AuthContext";

const AuthGuard = ({ children }) => {
    const { user, loading, isAdmin } = useAuth();
    const location = useLocation();
    const [billing, setBilling] = useState(null);
    const [billingError, setBillingError] = useState('');
    const exempt = location.pathname === '/billing' || isAdmin;

    useEffect(() => {
        let mounted = true;
        if (user && !exempt) {
            fetchMyBilling().then(result => {
                if (mounted) { setBilling({ ...result, userId: user.id, path: location.pathname }); setBillingError(''); }
            }).catch(() => { if (mounted) setBillingError('Could not check your plan. Open Billing to retry.'); });
        }
        return () => { mounted = false; };
    }, [user, exempt, location.pathname]);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            </div>
        );
    }

    if (!user) {
        // Redirect to login but save the attempted location
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    if (!exempt) {
        if (billingError) return <div role="alert" className="p-8">{billingError} <a href="/billing">Open Billing</a></div>;
        if (!billing || billing.userId !== user.id || billing.path !== location.pathname) return <div className="p-8">Checking your plan…</div>;
        if (!billing.active) return <Navigate to="/billing" replace />;
    }
    return children;
};

export default AuthGuard;
