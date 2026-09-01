import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Logo from '@/shared/components/layout/Logo';
import { useAuth } from '@/features/auth';
import { useTheme } from '@/shared/context/ThemeContext';
import toast from 'react-hot-toast';
import {
    LayoutGrid,
    Users,
    Link2,
    HardDrive,
    LogOut,
    Sun,
    Moon,
    ArrowLeft,
} from 'lucide-react';

/**
 * Admin panel sidebar. Mirrors DashboardSidebar's anatomy and tokens so the
 * admin surface reads as the same product, with an ADMIN badge to make the
 * elevated context unmissable.
 */

const NAV = [
    { id: 'overview', label: 'Overview', icon: LayoutGrid },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'connections', label: 'Connections', icon: Link2 },
    { id: 'storage', label: 'Storage', icon: HardDrive },
];

const itemClass = (isActive) =>
    `w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors text-left ${
        isActive
            ? 'bg-[var(--accent-muted)] text-[var(--accent)]'
            : 'text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--text)]'
    }`;

const footerLink =
    'w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--text)] transition-colors text-left';

const AdminSidebar = ({ active, onNavigate, counts = {} }) => {
    const { theme, toggleTheme } = useTheme();
    const { user, signOut } = useAuth();
    const navigate = useNavigate();

    const handleLogout = async () => {
        try {
            await signOut();
            navigate('/login', { replace: true });
        } catch {
            toast.error('Could not sign out');
        }
    };

    const displayName = user?.user_metadata?.name || user?.email?.split('@')[0] || 'Account';
    const initial = (displayName[0] || '?').toUpperCase();

    return (
        <aside className="hidden lg:flex lg:flex-col w-64 shrink-0 sticky top-0 h-screen border-r border-[var(--border)] bg-[var(--bg)] px-4 py-6">
            {/* Brand + admin badge */}
            <Link to="/" className="flex items-center justify-center gap-2 px-1 mb-6">
                <Logo className="h-7" />
                <span className="text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded-md bg-[var(--accent-muted)] text-[var(--accent)]">
                    Admin
                </span>
            </Link>

            <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--muted-2)] px-1 mb-2">
                Manage
            </div>

            {/* Navigation */}
            <nav className="space-y-1">
                {NAV.map(({ id, label, icon }) => {
                    const Icon = icon;
                    const count = counts[id];
                    return (
                        <button key={id} onClick={() => onNavigate(id)} className={itemClass(active === id)}>
                            <Icon className="h-4 w-4 shrink-0" />
                            <span className="flex-1 text-sm">{label}</span>
                            {count > 0 && (
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
                <Link to="/socialdashboad" className={footerLink}>
                    <ArrowLeft className="h-4 w-4 shrink-0" />
                    Back to dashboard
                </Link>
                <button onClick={toggleTheme} className={footerLink}>
                    {theme === 'dark' ? <Sun className="h-4 w-4 shrink-0" /> : <Moon className="h-4 w-4 shrink-0" />}
                    {theme === 'dark' ? 'Light mode' : 'Dark mode'}
                </button>
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

export default AdminSidebar;
