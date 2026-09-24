import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Logo from '@/shared/components/layout/Logo';
import { WorkspaceSwitcher } from '@/features/workspace';
import { useAuth } from '@/features/auth/context/AuthContext';
import toast from 'react-hot-toast';
import { useTheme } from '@/shared/context/ThemeContext';
import {
    UserCircle,
    HardDrive,
    Send,
    BarChart3,
    PenSquare,
    LogOut,
    ShieldCheck,
    CheckCircle2,
    CreditCard,
    Sun,
    Moon,
    Bot,
    ChevronUp,
    CalendarRange,
} from 'lucide-react';

/**
 * Dashboard sidebar.
 *
 * Uses the same design tokens as the public site (--bg / --surface / --border
 * / --accent), so light and dark are handled by CSS rather than dark: variants.
 *
 * Only lists version-one features — the ones this app actually ships. Items
 * that depend on a connected Meta account are disabled until one exists, so
 * the nav never opens an empty tab.
 */

const NAV = [
    { id: 'create', label: 'Create a Post', short: 'Create', icon: PenSquare, needsConnection: false },
    { id: 'pipelines', label: 'AI Pipelines', short: 'Pipelines', icon: Bot, needsConnection: false },
    { id: 'approvals', label: 'Approval Queue', short: 'Review', icon: CheckCircle2, needsConnection: false },
    { id: 'profiles', label: 'Social Profiles', short: 'Profiles', icon: UserCircle, needsConnection: false },
    { id: 'library', label: 'Media Library', short: 'Library', icon: HardDrive, needsConnection: false },
    { id: 'history', label: 'Post History', short: 'History', icon: Send, needsConnection: true },
    { id: 'analytics', label: 'Analytics', short: 'Stats', icon: BarChart3, needsConnection: true },
];

const INSIGHTS_NAV = NAV.filter(({ id }) => id === 'history' || id === 'analytics');
const PRIMARY_NAV = NAV.filter(({ id }) => id !== 'history' && id !== 'analytics');

const itemClass = (disabled, isActive) =>
    `w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors text-left ${
        disabled
            ? 'text-[var(--muted-2)] cursor-not-allowed'
            : isActive
                ? 'bg-[var(--accent-muted)] text-[var(--accent)]'
                : 'text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--text)]'
    }`;

const footerLink =
    'w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--text)] transition-colors text-left';

const DashboardSidebar = ({
    active, onNavigate, isConnected,
    pageCount = 0, scheduledCount = 0, publishedCount = 0, approvalCount = 0,
}) => {
    const counts = { approvals: approvalCount, profiles: pageCount, scheduled: scheduledCount, history: publishedCount };
    const { theme, toggleTheme } = useTheme();
    const { user, signOut } = useAuth();
    const navigate = useNavigate();
    const [profileMenuOpen, setProfileMenuOpen] = useState(false);
    const [insightsOpen, setInsightsOpen] = useState(active === 'history' || active === 'analytics');
    const profileMenuRef = useRef(null);

    useEffect(() => {
        if (!profileMenuOpen) return undefined;

        const closeOnOutsideClick = (event) => {
            if (!profileMenuRef.current?.contains(event.target)) setProfileMenuOpen(false);
        };
        const closeOnEscape = (event) => {
            if (event.key === 'Escape') setProfileMenuOpen(false);
        };

        document.addEventListener('pointerdown', closeOnOutsideClick);
        document.addEventListener('keydown', closeOnEscape);
        return () => {
            document.removeEventListener('pointerdown', closeOnOutsideClick);
            document.removeEventListener('keydown', closeOnEscape);
        };
    }, [profileMenuOpen]);

    const handleLogout = async () => {
        try {
            setProfileMenuOpen(false);
            await signOut();
            navigate('/login', { replace: true });
        } catch {
            toast.error('Could not sign out');
        }
    };

    // Supabase keeps whatever was passed at signup; fall back to the address
    const displayName = user?.user_metadata?.name || user?.email?.split('@')[0] || 'Account';
    const initial = (displayName[0] || '?').toUpperCase();

    return (
        <aside className="hidden lg:flex lg:flex-col w-64 shrink-0 sticky top-0 h-screen border-r border-[var(--border)] bg-[var(--bg)] px-4 py-6">
            {/* Brand */}
            <Link to="/" className="flex items-center justify-center px-1 mb-5">
                <Logo className="h-7" />
            </Link>

            {/* Which client's accounts you are working in */}
            <div className="mb-6">
                <WorkspaceSwitcher />
            </div>


            {/* Navigation */}
            <nav className="space-y-1">
                {PRIMARY_NAV.map(({ id, label, icon: Icon, needsConnection }) => {
                    const disabled = needsConnection && !isConnected;
                    const isActive = active === id && !disabled;
                    const count = counts[id];
                    return (
                        <button
                            key={id}
                            onClick={() => { if (!disabled) onNavigate(id); }}
                            disabled={disabled}
                            aria-current={isActive ? 'page' : undefined}
                            className={itemClass(disabled, isActive)}
                        >
                            {React.createElement(Icon, { className: 'h-4 w-4 shrink-0' })}
                            <span className="flex-1 text-sm">{label}</span>
                            {!disabled && count > 0 && (
                                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-[var(--surface-2)] text-[var(--muted)]">
                                    {count}
                                </span>
                            )}
                        </button>
                    );
                })}

                <div>
                    <button
                        type="button"
                        onClick={() => { if (isConnected) setInsightsOpen((open) => !open); }}
                        disabled={!isConnected}
                        aria-expanded={insightsOpen}
                        aria-controls="history-analytics-menu"
                        className={itemClass(!isConnected, active === 'history' || active === 'analytics')}
                    >
                        <BarChart3 className="h-4 w-4 shrink-0" />
                        <span className="flex-1 text-sm">History &amp; Analytics</span>
                        {isConnected && publishedCount > 0 && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-[var(--surface-2)] text-[var(--muted)]">
                                {publishedCount}
                            </span>
                        )}
                        <ChevronUp className={`h-3.5 w-3.5 shrink-0 transition-transform ${insightsOpen ? '' : 'rotate-180'}`} />
                    </button>

                    {isConnected && insightsOpen && (
                        <div id="history-analytics-menu" className="mt-1 ml-5 pl-3 border-l border-[var(--border)] space-y-1">
                            {INSIGHTS_NAV.map(({ id, label, icon: Icon }) => {
                                const isActive = active === id;
                                return (
                                    <button
                                        key={id}
                                        type="button"
                                        onClick={() => onNavigate(id)}
                                        aria-current={isActive ? 'page' : undefined}
                                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors ${isActive
                                            ? 'bg-[var(--accent-muted)] text-[var(--accent)]'
                                            : 'text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--text)]'
                                        }`}
                                    >
                                        {React.createElement(Icon, { className: 'h-3.5 w-3.5 shrink-0' })}
                                        <span className="text-sm">{label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </nav>

            <Link to="/portal" className="mt-4 flex items-center gap-3 border border-[var(--border)] px-3 py-2.5 text-sm font-semibold text-[var(--text)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]">
                <CalendarRange className="h-4 w-4 shrink-0" />
                Client portal
            </Link>

            {/* Account menu */}
            <div ref={profileMenuRef} className="relative mt-auto pt-6">
                {profileMenuOpen && (
                    <div
                        id="dashboard-profile-menu"
                        role="menu"
                        aria-label="Account options"
                        className="absolute inset-x-0 bottom-full mb-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-xl"
                    >
                        <button onClick={toggleTheme} role="menuitem" className={footerLink}>
                            {theme === 'dark' ? <Sun className="h-4 w-4 shrink-0" /> : <Moon className="h-4 w-4 shrink-0" />}
                            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
                        </button>
                        <Link to="/billing" role="menuitem" onClick={() => setProfileMenuOpen(false)} className={footerLink}>
                            <CreditCard className="h-4 w-4 shrink-0" />
                            Billing & plan
                        </Link>
                        <Link to="/data-deletion" role="menuitem" onClick={() => setProfileMenuOpen(false)} className={footerLink}>
                            <ShieldCheck className="h-4 w-4 shrink-0" />
                            Your data
                        </Link>
                        <div className="my-1 border-t border-[var(--border)]" />
                        <button onClick={handleLogout} role="menuitem" className={`${footerLink} hover:text-red-500`}>
                            <LogOut className="h-4 w-4 shrink-0" />
                            Log out
                        </button>
                    </div>
                )}

                <button
                    type="button"
                    onClick={() => setProfileMenuOpen((open) => !open)}
                    aria-expanded={profileMenuOpen}
                    aria-haspopup="menu"
                    aria-controls="dashboard-profile-menu"
                    className="w-full border-t border-[var(--border)] flex items-center gap-3 px-1 pt-3 text-left group"
                >
                    <span className="w-8 h-8 rounded-full bg-[var(--accent-muted)] text-[var(--accent)] text-sm font-semibold flex items-center justify-center shrink-0">
                        {initial}
                    </span>
                    <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-[var(--text)] truncate">{displayName}</span>
                        <span className="block text-xs text-[var(--muted)] truncate">{user?.email}</span>
                    </span>
                    <ChevronUp className={`h-4 w-4 shrink-0 text-[var(--muted)] transition-transform ${profileMenuOpen ? '' : 'rotate-180'}`} />
                </button>
            </div>
        </aside>
    );
};

/**
 * Mobile navigation — floating bar shown only below the lg breakpoint,
 * where the sidebar is hidden.
 */
export const DashboardMobileNav = ({ active, onNavigate, isConnected, approvalCount = 0 }) => (
    <>

        <nav className="lg:hidden fixed inset-x-0 bottom-0 z-40 px-3 pb-[env(safe-area-inset-bottom)]">
            <div className="mx-auto max-w-md mb-3 flex items-stretch gap-1 rounded-2xl border border-[var(--border)] bg-[var(--bg)]/95 backdrop-blur-xl shadow-lg p-1.5">
                {NAV.map(({ id, label, short, icon: Icon, needsConnection }) => {
                    const disabled = needsConnection && !isConnected;
                    const isActive = active === id && !disabled;
                    return (
                        <button
                            key={id}
                            onClick={() => { if (!disabled) onNavigate(id); }}
                            disabled={disabled}
                            aria-current={isActive ? 'page' : undefined}
                            aria-label={id === 'approvals' ? `${label}, ${approvalCount} pending` : label}
                            className={`relative flex-1 min-w-0 flex flex-col items-center gap-1 py-2 rounded-xl transition-colors ${
                                disabled
                                    ? 'text-[var(--muted-2)]'
                                    : isActive
                                        ? 'bg-[var(--accent-muted)] text-[var(--accent)]'
                                        : 'text-[var(--muted)] active:bg-[var(--surface)]'
                            }`}
                        >
                            {React.createElement(Icon, { className: 'h-5 w-5 shrink-0' })}
                            {id === 'approvals' && approvalCount > 0 && <span className="absolute top-0 right-0 rounded-full bg-[var(--accent)] text-[var(--bg)] px-1 text-[9px]">{approvalCount > 99 ? '99+' : approvalCount}</span>}
                            <span className="text-[9px] font-mono uppercase tracking-widest leading-none truncate w-full text-center">
                                {short}
                            </span>
                        </button>
                    );
                })}
            </div>
        </nav>
    </>
);

export default DashboardSidebar;
