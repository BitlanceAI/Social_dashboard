import React from 'react';
import { Mail, MapPin, Phone } from 'lucide-react';
import { BODY, CARD, CARD_TITLE } from './LegalLayout';

/**
 * Contact block shared by the legal pages. Same card scale as every other
 * section so it reads as part of the document, not a separate widget.
 */

const ROWS = [
    {
        icon: <Mail className="w-4 h-4" />,
        label: 'Email us',
        content: (
            <a href="mailto:ceo@bitlancetechhub.com" className="text-[var(--accent)] hover:underline">
                ceo@bitlancetechhub.com
            </a>
        ),
    },
    {
        icon: <MapPin className="w-4 h-4" />,
        label: 'Visit us',
        content:
            'Blue Ridge Town Pune, Phase 1, Hinjawadi Rajiv Gandhi Infotech Park, Hinjawadi, Pune, Pimpri-Chinchwad, Maharashtra 411057',
    },
    {
        icon: <Phone className="w-4 h-4" />,
        label: 'Call us',
        content: (
            <a href="tel:7391025059" className="text-[var(--accent)] hover:underline">
                7391025059
            </a>
        ),
    },
];

const LegalContact = () => (
    <section className={CARD}>
        <h2 className={CARD_TITLE}>Contact us</h2>
        <ul className="space-y-4">
            {ROWS.map(({ icon, label, content }) => (
                <li
                    key={label}
                    className="flex gap-4 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-5 py-4"
                >
                    <span className="w-8 h-8 rounded-full bg-[var(--accent-muted)] text-[var(--accent)] flex items-center justify-center shrink-0">
                        {icon}
                    </span>
                    <span className={BODY}>
                        <strong className="block text-[10px] font-mono uppercase tracking-widest text-[var(--muted)] mb-1">
                            {label}
                        </strong>
                        <span className="text-[var(--text)]">{content}</span>
                    </span>
                </li>
            ))}
        </ul>
    </section>
);

export default LegalContact;
