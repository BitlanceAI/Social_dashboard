import React from 'react';
import { Mail, MapPin, Phone } from 'lucide-react';

const PrivacyPolicy = () => {
    return (
        <div className="min-h-screen bg-gray-50 dark:bg-slate-900 pt-24 pb-12 px-4 sm:px-6 lg:px-8 transition-colors duration-300">
            <div className="max-w-4xl mx-auto bg-white dark:bg-slate-800 rounded-2xl shadow-xl overflow-hidden">
                <div className="bg-gradient-to-r from-blue-600 to-indigo-700 px-8 py-10 text-white">
                    <h1 className="text-3xl md:text-4xl font-bold mb-2">Privacy Policy</h1>
                    <p className="text-blue-100 text-lg">Last Updated: {new Date().toLocaleDateString()}</p>
                </div>

                <div className="p-8 md:p-12 space-y-8 text-gray-700 dark:text-gray-300">
                    <section>
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                            <span className="w-1.5 h-8 bg-blue-600 rounded-full mr-2"></span>
                            Information We Collect
                        </h2>
                        <div className="space-y-4 pl-4 border-l-2 border-gray-200 dark:border-gray-700 ml-1">
                            <div>
                                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2">Personal Information</h3>
                                <p className="leading-relaxed">
                                    Name, email address, phone number, company name, job title (if applicable), billing address and payment details (processed securely through third-party providers).
                                </p>
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2">Technical & Usage Information</h3>
                                <p className="leading-relaxed">
                                    IP address and device information, browser type and operating system, pages visited, time spent, and interactions on our website. Log data from usage of our AI tools, including inputs and outputs (anonymized where possible).
                                </p>
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2">Account Data (for registered users)</h3>
                                <p className="leading-relaxed">
                                    Login credentials, purchase history, subscription or license status, support queries or feedback.
                                </p>
                            </div>
                        </div>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                            <span className="w-1.5 h-8 bg-blue-600 rounded-full mr-2"></span>
                            How We Use Your Information
                        </h2>
                        <ul className="list-disc pl-6 space-y-2 marker:text-blue-500">
                            <li>Process orders, subscriptions, or service usage.</li>
                            <li>Provide access to our AI tools and features.</li>
                            <li>Improve, maintain, and personalize the user experience.</li>
                            <li>Respond to customer support inquiries.</li>
                            <li>Send important updates, including billing and system notices.</li>
                            <li>Market relevant updates or new tools (only if you opt-in).</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                            <span className="w-1.5 h-8 bg-blue-600 rounded-full mr-2"></span>
                            Sharing and Disclosure
                        </h2>
                        <p className="mb-4">We do not sell or rent your personal information.</p>
                        <p className="mb-2 font-medium">We may share your data with:</p>
                        <ul className="list-disc pl-6 space-y-2 marker:text-blue-500 mb-4">
                            <li>Payment processors (e.g., Stripe, Razorpay) to handle transactions securely.</li>
                            <li>Hosting and infrastructure providers to run and deliver our AI services.</li>
                            <li>Analytics platforms to understand product performance and improve features.</li>
                            <li>Legal authorities when required by law or to protect our rights.</li>
                        </ul>
                        <p className="text-sm italic text-gray-500 dark:text-gray-400">All third parties are bound by confidentiality agreements and data protection obligations.</p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                            <span className="w-1.5 h-8 bg-blue-600 rounded-full mr-2"></span>
                            Facebook and Instagram Data
                        </h2>
                        <p className="mb-4">
                            When you connect a Meta account, we use Facebook Login and the official
                            Meta Graph API. We never ask for or store your Facebook or Instagram password.
                        </p>
                        <p className="mb-2 font-semibold">What we access, and why:</p>
                        <ul className="list-disc pl-6 space-y-2 marker:text-blue-500 mb-4">
                            <li><strong>Your Facebook Pages</strong> (name, category, Page access token) &mdash; so you can choose which Page to publish to.</li>
                            <li><strong>Linked Instagram Business account</strong> (account ID, username, profile picture, follower count, and your existing media) &mdash; so you can select it as a publishing target and see what has already been posted.</li>
                            <li><strong>Publishing access</strong> &mdash; to create the posts you compose and schedule in this application. We publish only content you supply, at the time you choose.</li>
                        </ul>
                        <p className="mb-2 font-semibold">What we do not do:</p>
                        <ul className="list-disc pl-6 space-y-2 marker:text-blue-500 mb-4">
                            <li>We do not read or store your Facebook or Instagram direct messages.</li>
                            <li>We do not sell, rent, or share Meta platform data with third parties.</li>
                            <li>We do not use Meta platform data to build advertising profiles or train models.</li>
                        </ul>
                        <p className="mb-4">
                            Access tokens are encrypted at rest and are used only to make requests you
                            initiate. You can disconnect at any time from the Meta dashboard inside this
                            application, or by removing the app in your Facebook settings &mdash; either
                            action deletes the stored token and connection immediately.
                        </p>
                        <p>
                            To request deletion of all data associated with your Meta account, remove the
                            app from your Facebook Settings &rarr; Apps and Websites, or email{' '}
                            <a href="mailto:support@bitlancetechhub.com" className="text-blue-600 hover:underline">support@bitlancetechhub.com</a>.
                            We honour Meta&apos;s deauthorization and data deletion callbacks automatically.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                            <span className="w-1.5 h-8 bg-blue-600 rounded-full mr-2"></span>
                            Data Storage and Retention
                        </h2>
                        <ul className="list-disc pl-6 space-y-2 marker:text-blue-500">
                            <li>Data is stored on secure servers.</li>
                            <li>Retention lasts as long as your account is active or legally required.</li>
                            <li>Anonymized tool usage data may be retained for performance optimization and AI model improvement.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                            <span className="w-1.5 h-8 bg-blue-600 rounded-full mr-2"></span>
                            Your Rights
                        </h2>
                        <ul className="list-disc pl-6 space-y-2 marker:text-blue-500 mb-4">
                            <li>Access or correct your personal data.</li>
                            <li>Request deletion of your account and associated data.</li>
                            <li>Object to marketing communications.</li>
                            <li>Export or download your data (where applicable).</li>
                        </ul>
                        <p>To exercise any of these rights, please contact us at <a href="mailto:support@bitlancetechhub.com" className="text-blue-600 hover:underline">support@bitlancetechhub.com</a>.</p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                            <span className="w-1.5 h-8 bg-blue-600 rounded-full mr-2"></span>
                            Security Measures
                        </h2>
                        <ul className="list-disc pl-6 space-y-2 marker:text-blue-500">
                            <li>We use encryption, firewalls, and access controls to protect your data.</li>
                            <li>No system is 100% secure, but we take reasonable steps to ensure protection.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                            <span className="w-1.5 h-8 bg-blue-600 rounded-full mr-2"></span>
                            Cookies and Tracking Technologies
                        </h2>
                        <ul className="list-disc pl-6 space-y-2 marker:text-blue-500">
                            <li>Enable essential site functions.</li>
                            <li>Remember user preferences.</li>
                            <li>Track website analytics.</li>
                        </ul>
                        <p className="mt-2">You can manage cookie preferences via your browser settings.</p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                            <span className="w-1.5 h-8 bg-blue-600 rounded-full mr-2"></span>
                            Third-Party Integrations
                        </h2>
                        <ul className="list-disc pl-6 space-y-2 marker:text-blue-500">
                            <li>Some AI tools may integrate with third-party APIs or platforms (e.g., Google, OpenAI, AWS).</li>
                            <li>Any data shared with these platforms is subject to their respective privacy policies.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                            <span className="w-1.5 h-8 bg-blue-600 rounded-full mr-2"></span>
                            Children’s Privacy
                        </h2>
                        <ul className="list-disc pl-6 space-y-2 marker:text-blue-500">
                            <li>Our services are not intended for individuals under the age of 18.</li>
                            <li>We do not knowingly collect data from minors.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                            <span className="w-1.5 h-8 bg-blue-600 rounded-full mr-2"></span>
                            Changes to This Privacy Policy
                        </h2>
                        <p className="mb-2">We may revise this policy from time to time.</p>
                        <p>When we do, we will update the "Last Updated" date and notify users of significant changes via email or on our website.</p>
                    </section>

                    <div className="bg-gray-50 dark:bg-slate-700/50 rounded-xl p-6 border border-gray-200 dark:border-slate-700 mt-8">
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Contact Us</h2>
                        <div className="space-y-4">
                            <div className="flex items-start gap-4">
                                <div className="bg-blue-100 dark:bg-blue-900/30 p-2.5 rounded-lg text-blue-600 dark:text-blue-400 mt-1">
                                    <Mail className="w-5 h-5" />
                                </div>
                                <div>
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Email Us</p>
                                    <a href="mailto:ceo@bitlancetechhub.com" className="text-lg font-medium hover:text-blue-600 transition-colors">
                                        ceo@bitlancetechhub.com
                                    </a>
                                </div>
                            </div>

                            <div className="flex items-start gap-4">
                                <div className="bg-blue-100 dark:bg-blue-900/30 p-2.5 rounded-lg text-blue-600 dark:text-blue-400 mt-1">
                                    <MapPin className="w-5 h-5" />
                                </div>
                                <div>
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Visit Us</p>
                                    <p className="text-lg font-medium">
                                        Blue Ridge Town Pune, Phase 1, Hinjawadi Rajiv Gandhi Infotech Park, Hinjawadi, Pune, Pimpri-Chinchwad, Maharashtra 411057
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-start gap-4">
                                <div className="bg-blue-100 dark:bg-blue-900/30 p-2.5 rounded-lg text-blue-600 dark:text-blue-400 mt-1">
                                    <Phone className="w-5 h-5" />
                                </div>
                                <div>
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Call Us</p>
                                    <a href="tel:7391025059" className="text-lg font-medium hover:text-blue-600 transition-colors">
                                        7391025059
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PrivacyPolicy;
