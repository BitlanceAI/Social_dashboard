import React from 'react';
import { Link } from 'react-router-dom';
import SEOHead from '../../components/layout/SEOHead';
import LegalLayout, { BODY, LIST, CARD, CARD_TITLE } from '../../components/legal/LegalLayout';
import LegalContact from '../../components/legal/LegalContact';

const A = 'text-[var(--accent)] hover:underline';

/** Numbered clause — same numbered-row treatment as the data deletion steps. */
const Clause = ({ num, title, children }) => (
    <section className={CARD}>
        <div className="flex gap-4">
            <span className="w-8 h-8 rounded-full bg-[var(--accent-muted)] text-[var(--accent)] font-mono text-[10px] flex items-center justify-center shrink-0">
                {num}
            </span>
            <div className="min-w-0">
                <h2 className={`${CARD_TITLE} mb-3`}>{title}</h2>
                {children}
            </div>
        </div>
    </section>
);

const TermsPage = () => (
    <LegalLayout
        eyebrow="For AI tools purchasing"
        title="Terms and Conditions"
        lede={
            <>
                Welcome to <strong className="text-[var(--text)]">Bitlance Tech Hub</strong>
                {' '}(&ldquo;Company,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;).
                These Terms govern your access to and use of our AI tools, services, websites, and
                software (collectively, &ldquo;Services&rdquo;). By purchasing or using any of our
                Services, you agree to be bound by these Terms.
            </>
        }
    >
        <SEOHead
            title="Terms and Conditions"
            description="The terms governing your purchase and use of Bitlance Tech Hub's AI tools and services."
            canonicalUrl="https://www.bitlancetechhub.com/terms-policy"
        />

        <Clause num="01" title="Eligibility">
            <p className={BODY}>
                By using our Services, you represent that you are at least 18 years old and have the
                legal capacity to enter into a binding contract. If you are using the Services on
                behalf of an organization, you represent that you have authority to bind that
                organization.
            </p>
        </Clause>

        <Clause num="02" title="Purchases and payments">
            <ul className={LIST}>
                <li>
                    All purchases of AI tools or subscriptions are subject to applicable fees as
                    displayed at the time of purchase.
                </li>
                <li>Payments are processed via third-party providers (e.g., Stripe, Razorpay).</li>
                <li>
                    You agree to provide accurate billing information and authorize us to charge
                    applicable fees.
                </li>
                <li>All fees are non-refundable unless otherwise stated in a specific refund policy.</li>
            </ul>
        </Clause>

        <Clause num="03" title="License and usage rights">
            <ul className={LIST}>
                <li>
                    You are granted a limited, non-exclusive, non-transferable license to use the AI
                    tools solely for your internal or commercial use.
                </li>
                <li>You agree not to resell, sublicense, or redistribute the tools.</li>
                <li>
                    You agree not to reverse-engineer, copy, or modify the tools without our
                    permission.
                </li>
                <li>
                    You agree not to use the tools for unlawful purposes (e.g., fraud,
                    discrimination, deepfake generation).
                </li>
            </ul>
        </Clause>

        <Clause num="04" title="Account and access">
            <p className={BODY}>
                You are responsible for maintaining the confidentiality of your credentials and all
                activities under your account. We reserve the right to suspend or terminate access if
                you violate these Terms.
            </p>
        </Clause>

        <Clause num="05" title="Intellectual property">
            <p className={BODY}>
                All content, software, models, and documentation provided through our Services are
                the intellectual property of Bitlance Tech Hub or our licensors. No ownership rights
                are transferred to you under these Terms.
            </p>
        </Clause>

        <Clause num="06" title="Service availability and updates">
            <p className={BODY}>
                We strive to maintain reliable access to our AI tools but do not guarantee
                uninterrupted availability. We may perform updates, modify features, or discontinue
                services with or without prior notice.
            </p>
        </Clause>

        <Clause num="07" title="Data usage and privacy">
            <p className={BODY}>
                By using our tools, you may provide input data and receive output data. We handle all
                user data in accordance with our{' '}
                <Link to="/privacy-policy" className={A}>
                    Privacy Policy
                </Link>
                . You retain ownership of your input data; we may use anonymized outputs to improve
                our models unless you opt out where applicable. You can remove your data at any time
                using the{' '}
                <Link to="/data-deletion" className={A}>
                    data deletion instructions
                </Link>
                .
            </p>
        </Clause>

        <Clause num="08" title="Refunds and cancellations">
            <p className={BODY}>
                Refunds are only issued in accordance with our Refund Policy. For subscription-based
                products, you may cancel any time, but access continues until the end of the billing
                cycle.
            </p>
        </Clause>

        <Clause num="09" title="Limitation of liability">
            <p className={`${BODY} mb-3`}>
                <strong className="text-[var(--text)]">
                    To the maximum extent permitted by law:
                </strong>
            </p>
            <ul className={LIST}>
                <li>
                    We shall not be liable for any indirect, incidental, consequential, or punitive
                    damages.
                </li>
                <li>
                    Our total liability under these Terms shall not exceed the total amount paid by
                    you in the last 3 months.
                </li>
                <li>
                    Use of the AI tools is at your own risk, especially in sensitive decision-making
                    contexts.
                </li>
            </ul>
        </Clause>

        <Clause num="10" title="Indemnification">
            <p className={BODY}>
                You agree to indemnify, defend, and hold harmless Bitlance Tech Hub, its affiliates,
                and employees from any claims or liabilities arising out of your misuse of the
                Services or violation of these Terms.
            </p>
        </Clause>

        <Clause num="11" title="Governing law and dispute resolution">
            <p className={BODY}>
                These Terms are governed by the laws of India. Any disputes arising under these Terms
                shall be subject to the exclusive jurisdiction of the courts located in Pune,
                Maharashtra.
            </p>
        </Clause>

        <Clause num="12" title="Changes to these terms">
            <p className={BODY}>
                We may revise these Terms at any time. Material changes will be notified via email or
                posted on our site. Continued use of the Services after changes constitutes
                acceptance.
            </p>
        </Clause>

        <LegalContact />
    </LegalLayout>
);

export default TermsPage;
