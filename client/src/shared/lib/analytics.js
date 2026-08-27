/**
 * analytics.js
 * Centralized GA4 event tracking helpers.
 * Import `track` wherever you need to fire a custom event.
 * All events follow GA4 recommended naming conventions.
 */
import ReactGA from 'react-ga4';

/**
 * Generic event sender.
 * @param {string} eventName  - GA4 event name (snake_case)
 * @param {object} params     - Additional event parameters
 */
export const track = (eventName, params = {}) => {
    ReactGA.event(eventName, params);
};

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const trackLogin = (method = 'email') =>
    track('login', { method });

export const trackSignup = (method = 'email') =>
    track('sign_up', { method });

export const trackLoginError = (errorMessage) =>
    track('login_error', { error_message: errorMessage });

export const trackSignupError = (errorMessage) =>
    track('signup_error', { error_message: errorMessage });

// ─── Navigation / Agents ──────────────────────────────────────────────────────

export const trackAgentOpen = (agentName) =>
    track('agent_open', { agent_name: agentName });

// ─── Contact Form ─────────────────────────────────────────────────────────────

export const trackContactFormSubmit = () =>
    track('contact_form_submit');

export const trackContactFormSuccess = () =>
    track('contact_form_success');

export const trackContactFormError = (errorMessage) =>
    track('contact_form_error', { error_message: errorMessage });

// ─── General Engagement ───────────────────────────────────────────────────────

export const trackCtaClick = (buttonText, location) =>
    track('cta_clicked', { button_text: buttonText, location });

export const trackFormStart = (formName) =>
    track('form_started', { form_name: formName });

// ─── In-App Actions ───────────────────────────────────────────────────────────

export const trackFeatureUsed = (agentName, featureName) =>
    track('feature_used', { agent_name: agentName, feature_name: featureName });

export const trackAppError = (errorType, errorMessage) =>
    track('error_occurred', { error_type: errorType, error_message: errorMessage });

// ─── Demo / Lead Gen (Real Estate Funnel) ─────────────────────────────────────

export const trackDemoClick = (source = 'unknown') =>
    track('demo_click', { source });

export const trackLeadQualified = () =>
    track('lead_qualified');

export const trackLeadDisqualified = () =>
    track('lead_disqualified');

export const trackBookingSuccess = () =>
    track('booking_success');

// ─── Settings ─────────────────────────────────────────────────────────────────

export const trackSettingsSave = (section) =>
    track('settings_save', { section });

// ─── Blog ─────────────────────────────────────────────────────────────────────

export const trackBlogRead = (title) =>
    track('blog_read', { content_title: title });

// ─── Social / Outbound Link Clicks ────────────────────────────────────────────

export const trackSocialClick = (platform) =>
    track('social_click', { platform });
