import React from 'react';

/**
 * Small mono status chip used across every admin table. Amber/red states
 * use fixed colors (there are no warning/danger design tokens yet); teal
 * states use the accent tokens so they follow the theme.
 */
const STYLES = {
    accent: { className: 'bg-[var(--accent-muted)] text-[var(--accent)]' },
    neutral: { className: 'bg-[var(--surface-2)] text-[var(--muted)]' },
    warning: { style: { background: 'rgba(251, 191, 36, 0.1)', color: '#FBBF24' } },
    danger: { style: { background: 'rgba(248, 113, 113, 0.1)', color: '#F87171' } },
};

const TONE_BY_STATUS = {
    // connection / token health
    healthy: 'accent',
    'long-lived': 'accent',
    expiring: 'warning',
    expired: 'danger',
    disconnected: 'neutral',
    // user status
    active: 'accent',
    'token-expiring': 'warning',
    'token-expired': 'danger',
    'no-connection': 'neutral',
    // post status
    published: 'accent',
    pending: 'neutral',
    processing: 'neutral',
    failed: 'danger',
    cancelled: 'neutral',
};

const StatusChip = ({ status, label }) => {
    const tone = STYLES[TONE_BY_STATUS[status] || 'neutral'];
    return (
        <span
            className={`inline-block text-[10px] font-mono px-2 py-0.5 rounded-md whitespace-nowrap ${tone.className || ''}`}
            style={tone.style}
        >
            {label || status.replace(/-/g, ' ')}
        </span>
    );
};

export default StatusChip;
