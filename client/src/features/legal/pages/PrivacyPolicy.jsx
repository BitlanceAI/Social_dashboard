import React from 'react';
import { Link } from 'react-router-dom';
import SEOHead from '@/shared/components/layout/SEOHead';
import LegalLayout, { BODY, LIST, LegalSection } from '@/features/legal/components/LegalLayout';
import LegalContact from '@/features/legal/components/LegalContact';

const A = 'text-[var(--accent)] hover:underline';
const SUBHEAD = 'text-[10px] font-mono uppercase tracking-widest text-[var(--muted)] mb-2';

const PrivacyPolicy = () => (
    <LegalLayout
        eyebrow={`Last updated ${new Date().toLocaleDateString()}`}
        title="Privacy Policy"
        lede="What we collect when you use Bitlance Tech Hub, why we collect it, who it is shared with, and how to have it removed."
    >
        <SEOHead
            title="Privacy Policy"
            description="How Bitlance Tech Hub collects, uses, stores and deletes your personal and Meta platform data."
            canonicalUrl="https://www.bitlancetechhub.com/privacy-policy"
        />

        <LegalSection title="Information we collect">
            <div className="space-y-6">
                <div>
                    <h3 className={SUBHEAD}>Personal information</h3>
                    <p className={BODY}>
                        Name, email address, phone number, company name, job title (if applicable),
                        billing address and payment details (processed securely through third-party
                        providers).
                    </p>
                </div>
                <div>
                    <h3 className={SUBHEAD}>Technical &amp; usage information</h3>
                    <p className={BODY}>
                        IP address and device information, browser type and operating system, pages
                        visited, time spent, and interactions on our website. Log data from usage of
                        our AI tools, including inputs and outputs (anonymized where possible).
                    </p>
                </div>
                <div>
                    <h3 className={SUBHEAD}>Account data (for registered users)</h3>
                    <p className={BODY}>
                        Login credentials, purchase history, subscription or license status, support
                        queries or feedback.
                    </p>
                </div>
            </div>
        </LegalSection>

        <LegalSection title="How we use your information">
            <ul className={LIST}>
                <li>Process orders, subscriptions, or service usage.</li>
                <li>Provide access to our AI tools and features.</li>
                <li>Improve, maintain, and personalize the user experience.</li>
                <li>Respond to customer support inquiries.</li>
                <li>Send important updates, including billing and system notices.</li>
                <li>Market relevant updates or new tools (only if you opt in).</li>
            </ul>
        </LegalSection>

        <LegalSection title="Sharing and disclosure">
            <p className={`${BODY} mb-4`}>We do not sell or rent your personal information.</p>
            <p className={`${BODY} mb-2`}>
                <strong className="text-[var(--text)]">We may share your data with:</strong>
            </p>
            <ul className={`${LIST} mb-4`}>
                <li>Payment processors (e.g., Stripe, Razorpay) to handle transactions securely.</li>
                <li>Hosting and infrastructure providers to run and deliver our AI services.</li>
                <li>Analytics platforms to understand product performance and improve features.</li>
                <li>Legal authorities when required by law or to protect our rights.</li>
            </ul>
            <p className={BODY}>
                All third parties are bound by confidentiality agreements and data protection
                obligations.
            </p>
        </LegalSection>

        <LegalSection title="Facebook and Instagram data">
            <p className={`${BODY} mb-4`}>
                When you connect a Meta account, we use Facebook Login and the official Meta Graph
                API. We never ask for or store your Facebook or Instagram password.
            </p>
            <p className={`${BODY} mb-2`}>
                <strong className="text-[var(--text)]">What we access, and why:</strong>
            </p>
            <ul className={`${LIST} mb-6`}>
                <li>
                    <strong className="text-[var(--text)]">Your Facebook Pages</strong> (name,
                    category, Page access token) &mdash; so you can choose which Page to publish to.
                </li>
                <li>
                    <strong className="text-[var(--text)]">Linked Instagram Business account</strong>{' '}
                    (account ID, username, profile picture, follower count, and your existing media)
                    &mdash; so you can select it as a publishing target and see what has already been
                    posted.
                </li>
                <li>
                    <strong className="text-[var(--text)]">Publishing access</strong> &mdash; to
                    create the posts you compose and schedule in this application. We publish only
                    content you supply, at the time you choose.
                </li>
            </ul>
            <p className={`${BODY} mb-2`}>
                <strong className="text-[var(--text)]">What we do not do:</strong>
            </p>
            <ul className={`${LIST} mb-6`}>
                <li>We do not read or store your Facebook or Instagram direct messages.</li>
                <li>We do not sell, rent, or share Meta platform data with third parties.</li>
                <li>We do not use Meta platform data to build advertising profiles or train models.</li>
            </ul>
            <p className={`${BODY} mb-4`}>
                Access tokens are encrypted at rest and are used only to make requests you initiate.
                You can disconnect at any time from the Meta dashboard inside this application, or by
                removing the app in your Facebook settings &mdash; either action deletes the stored
                token and connection immediately.
            </p>
            <p className={BODY}>
                To request deletion of all data associated with your Meta account, follow the{' '}
                <Link to="/data-deletion" className={A}>
                    data deletion instructions
                </Link>{' '}
                or email{' '}
                <a href="mailto:bitlancetechhub@gmail.com" className={A}>
                    bitlancetechhub@gmail.com
                </a>
                . We honour Meta&apos;s deauthorization and data deletion callbacks automatically.
            </p>
        </LegalSection>

        <LegalSection title="Data storage and retention">
            <ul className={LIST}>
                <li>Data is stored on secure servers.</li>
                <li>Retention lasts as long as your account is active or legally required.</li>
                <li>
                    Anonymized tool usage data may be retained for performance optimization and AI
                    model improvement.
                </li>
            </ul>
        </LegalSection>

        <LegalSection title="Your rights">
            <ul className={`${LIST} mb-4`}>
                <li>Access or correct your personal data.</li>
                <li>Request deletion of your account and associated data.</li>
                <li>Object to marketing communications.</li>
                <li>Export or download your data (where applicable).</li>
            </ul>
            <p className={BODY}>
                To exercise any of these rights, contact us at{' '}
                <a href="mailto:bitlancetechhub@gmail.com" className={A}>
                    bitlancetechhub@gmail.com
                </a>
                .
            </p>
        </LegalSection>

        <LegalSection title="Security measures">
            <ul className={LIST}>
                <li>We use encryption, firewalls, and access controls to protect your data.</li>
                <li>No system is 100% secure, but we take reasonable steps to ensure protection.</li>
            </ul>
        </LegalSection>

        <LegalSection title="Cookies and tracking technologies">
            <ul className={`${LIST} mb-4`}>
                <li>Enable essential site functions.</li>
                <li>Remember user preferences.</li>
                <li>Track website analytics.</li>
            </ul>
            <p className={BODY}>You can manage cookie preferences via your browser settings.</p>
        </LegalSection>

        <LegalSection title="Third-party integrations">
            <ul className={LIST}>
                <li>
                    Some AI tools may integrate with third-party APIs or platforms (e.g., Google,
                    OpenAI, AWS).
                </li>
                <li>
                    Any data shared with these platforms is subject to their respective privacy
                    policies.
                </li>
            </ul>
        </LegalSection>

        <LegalSection title="Children’s privacy">
            <ul className={LIST}>
                <li>Our services are not intended for individuals under the age of 18.</li>
                <li>We do not knowingly collect data from minors.</li>
            </ul>
        </LegalSection>

        <LegalSection title="Changes to this policy">
            <p className={BODY}>
                We may revise this policy from time to time. When we do, we will update the
                &ldquo;last updated&rdquo; date and notify users of significant changes via email or
                on our website.
            </p>
        </LegalSection>

        <LegalContact />
    </LegalLayout>
);

export default PrivacyPolicy;
