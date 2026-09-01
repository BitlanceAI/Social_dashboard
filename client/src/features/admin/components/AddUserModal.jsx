import React, { useState } from 'react';
import { X } from 'lucide-react';
import toast from 'react-hot-toast';
import { createUser } from '../lib/adminApi';

const inputClass =
    'w-full px-3.5 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-sm text-[var(--text)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)] transition-colors';

/**
 * Admin "add user" dialog. The account is created through the server's
 * Supabase admin API with the email pre-confirmed, so the person can sign
 * in with these credentials immediately.
 */
const AddUserModal = ({ onClose, onCreated }) => {
    const [form, setForm] = useState({ name: '', email: '', password: '', role: 'user' });
    const [submitting, setSubmitting] = useState(false);

    const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (submitting) return;
        setSubmitting(true);
        try {
            const res = await createUser(form);
            toast.success(`Created ${res.user.email}`);
            onCreated();
        } catch (err) {
            toast.error(err.message || 'Could not create the user');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60" onClick={onClose}>
            <div
                className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center mb-1">
                    <h2 className="flex-1 text-[15px] font-semibold">Add user</h2>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
                <p className="text-xs text-[var(--muted)] mb-5">
                    The email is confirmed automatically — they can sign in with this password right away.
                </p>

                <form onSubmit={handleSubmit} className="space-y-3.5">
                    <label className="block">
                        <span className="block text-[10px] font-mono uppercase tracking-widest text-[var(--muted)] mb-1.5">Name</span>
                        <input value={form.name} onChange={update('name')} placeholder="Their display name" className={inputClass} />
                    </label>
                    <label className="block">
                        <span className="block text-[10px] font-mono uppercase tracking-widest text-[var(--muted)] mb-1.5">Email</span>
                        <input type="email" required value={form.email} onChange={update('email')} placeholder="name@company.com" className={inputClass} />
                    </label>
                    <label className="block">
                        <span className="block text-[10px] font-mono uppercase tracking-widest text-[var(--muted)] mb-1.5">Password</span>
                        <input
                            type="password"
                            required
                            minLength={8}
                            value={form.password}
                            onChange={update('password')}
                            placeholder="At least 8 characters"
                            className={inputClass}
                        />
                    </label>
                    <label className="block">
                        <span className="block text-[10px] font-mono uppercase tracking-widest text-[var(--muted)] mb-1.5">Role</span>
                        <select value={form.role} onChange={update('role')} className={inputClass}>
                            <option value="user">User</option>
                            <option value="admin">Admin</option>
                        </select>
                    </label>

                    <div className="flex gap-2.5 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-2 rounded-xl border border-[var(--border)] text-sm text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors"
                        >
                            Cancel
                        </button>
                        <button type="submit" disabled={submitting} className="flex-1 btn-primary rounded-xl py-2 text-sm disabled:opacity-60">
                            {submitting ? 'Creating…' : 'Create user'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AddUserModal;
