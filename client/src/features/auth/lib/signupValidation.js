export const MIN_PASSWORD_LENGTH = 8;

export function validateSignup(form) {
    const errors = {};
    if (!form.name.trim()) errors.name = 'Enter your full name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.email = 'Enter a valid email address.';
    if (form.password.length < MIN_PASSWORD_LENGTH) errors.password = 'Use at least 8 characters.';
    if (form.phone.trim() && !/^\+?[\d\s()-]+$/.test(form.phone.trim())) errors.phone = 'Enter a valid phone number with country code.';
    const digits = form.phone.replace(/\D/g, '');
    if (form.phone.trim() && (digits.length < 10 || digits.length > 15)) errors.phone = 'Use 10–15 digits, including your country code.';
    if (form.callConsent && !form.phone.trim()) errors.phone = 'Enter a phone number to request an onboarding call.';
    return errors;
}
