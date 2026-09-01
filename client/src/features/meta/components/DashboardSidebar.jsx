import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Logo from '@/shared/components/layout/Logo';
import { WorkspaceSwitcher } from '@/features/workspace';
import { useAuth } from '@/features/auth/context/AuthContext';
import toast from 'react-hot-toast';
import { useTheme } from '@/shared/context/ThemeContext';
import {
    UserCircle,
    HardDrive,
    CalendarClock,
    Send,
    BarChart3,
    PenSquare,
    LogOut,
    ShieldCheck,
    Sun,
    Moon,
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
    { id: 'profiles', label: 'Social Profiles', short: 'Profiles', icon: UserCircle, needsConnection: false },
    { id: 'library', label: 'Media Library', short: 'Library', icon: HardDrive, needsConnection: false },
    { id: 'scheduled', label: 'Scheduled Posts', short: 'Queue', icon: CalendarClock, needsConnection: true },
    { id: 'history', label: 'Post History', short: 'History', icon: Send, needsConnection: true },
    { id: 'analytics', label: 'Analytics', short: 'Stats', icon: BarChart3, needsConnection: true },
];

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
    pageCount = 0, scheduledCount = 0, publishedCount = 0,
}) => {
    const counts = { profiles: pageCount, scheduled: scheduledCount, history: publishedCount };
    const { theme, toggleTheme } = useTheme();
    const { user, signOut } = useAuth();
    const navigate = useNavigate();

    const handleLogout = async () => {
        try {
            await signOut();
            navigate('/login', { replace: true });
        } catch (e) {
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
                {NAV.map(({ id, label, icon: Icon, needsConnection }) => {
                    const disabled = needsConnection && !isConnected;
                    const isActive = active === id && !disabled;
                    const count = counts[id];
                    return (
                        <button
                            key={id}
                            onClick={() => !disabled && onNavigate(id)}
                            disabled={disabled}
                            className={itemClass(disabled, isActive)}
                        >
                            <Icon className="h-4 w-4 shrink-0" />
                            <span className="flex-1 text-sm">{label}</span>
                            {!disabled && count > 0 && (
                                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-[var(--surface-2)] text-[var(--muted)]">
                                    {count}
                                </span>
                            )}
                        </button>
                    );
                })}
            </nav>

            {/* Footer */}
            <div className="mt-auto pt-6 space-y-1">
                <button onClick={toggleTheme} className={footerLink}>
                    {theme === 'dark' ? <Sun className="h-4 w-4 shrink-0" /> : <Moon className="h-4 w-4 shrink-0" />}
                    {theme === 'dark' ? 'Light mode' : 'Dark mode'}
                </button>
                <Link to="/data-deletion" className={footerLink}>
                    <ShieldCheck className="h-4 w-4 shrink-0" />
                    Your data
                </Link>
                <button onClick={handleLogout} className={footerLink}>
                    <LogOut className="h-4 w-4 shrink-0" />
                    Log out
                </button>

                {/* Who is signed in */}
                <div className="mt-3 pt-3 border-t border-[var(--border)] flex items-center gap-3 px-1">
                    <span className="w-8 h-8 rounded-full bg-[var(--accent-muted)] text-[var(--accent)] text-sm font-semibold flex items-center justify-center shrink-0">
                        {initial}
                    </span>
                    <span className="min-w-0">
                        <span className="block text-sm font-medium text-[var(--text)] truncate">{displayName}</span>
                        <span className="block text-xs text-[var(--muted)] truncate">{user?.email}</span>
                    </span>
                </div>
            </div>
        </aside>
    );
};

/**
 * Mobile navigation — floating bar shown only below the lg breakpoint,
 * where the sidebar is hidden.
 */
export const DashboardMobileNav = ({ active, onNavigate, isConnected }) => (
    <>

        <nav className="lg:hidden fixed inset-x-0 bottom-0 z-40 px-3 pb-[env(safe-area-inset-bottom)]">
            <div className="mx-auto max-w-md mb-3 flex items-stretch gap-1 rounded-2xl border border-[var(--border)] bg-[var(--bg)]/95 backdrop-blur-xl shadow-lg p-1.5">
                {NAV.map(({ id, short, icon: Icon, needsConnection }) => {
                    const disabled = needsConnection && !isConnected;
                    const isActive = active === id && !disabled;
                    return (
                        <button
                            key={id}
                            onClick={() => !disabled && onNavigate(id)}
                            disabled={disabled}
                            className={`flex-1 min-w-0 flex flex-col items-center gap-1 py-2 rounded-xl transition-colors ${
                                disabled
                                    ? 'text-[var(--muted-2)]'
                                    : isActive
                                        ? 'bg-[var(--accent-muted)] text-[var(--accent)]'
                                        : 'text-[var(--muted)] active:bg-[var(--surface)]'
                            }`}
                        >
                            <Icon className="h-5 w-5 shrink-0" />
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
