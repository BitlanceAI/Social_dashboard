import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/context/AuthContext';
import { FullScreenSignup } from '@/shared/components/ui/full-screen-signup';
import { trackSignup, trackSignupError } from '@/shared/lib/analytics';
import { validateSignup } from '@/features/auth/lib/signupValidation';

async function makeOutboundCall(phoneNumber, name, instructions, firstLine) {
    const AGENT_API_URL = "https://pua3ipajtt6cplmdwh7z79eo.187.127.133.164.sslip.io/api/call/outbound";

    try {
        const response = await fetch(AGENT_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                phone_number: phoneNumber,
                name: name,
                instructions: instructions,
                first_line: firstLine
            })
        });

        const data = await response.json();

        if (response.ok) {
            console.log("Call initiated successfully!", data);
        } else {
            console.error("Failed to initiate call:", data.detail);
        }
    } catch (error) {
        console.error("Network error:", error);
    }
}

const SignupPage = () => {
    const navigate = useNavigate();
    const { signUp } = useAuth();

    const [formData, setFormData] = useState({
        name: '',
        phone: '',
        email: '',
        password: '',
        callConsent: false,
    });

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const handleChange = (e) => {
        const { name, type, checked, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    };

    const handleSignup = async (e) => {
        e.preventDefault();
        if (loading || success) return;
        setLoading(true);
        setError('');
        setSuccess('');

        const validationErrors = validateSignup(formData);
        if (Object.keys(validationErrors).length) {
            setError(Object.values(validationErrors)[0]);
            setLoading(false);
            return;
        }

        try {
            const { data, error } = await signUp({
                email: formData.email.trim(),
                password: formData.password,
                options: {
                    data: {
                        name: formData.name.trim(),
                        phone: formData.phone.trim(),
                        onboarding_call_consent: formData.callConsent,
                        onboarding_call_consent_at: formData.callConsent ? new Date().toISOString() : null,
                    }
                }
            });

            if (error) throw error;

            trackSignup('email');

            try {
                void fetch('https://bitlancetechhub.app.n8n.cloud/webhook/signupbitlance', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        name: formData.name,
                        // Do not pass phone details into onboarding automation without opt-in.
                        phone: formData.callConsent ? formData.phone.trim() : '',
                        email: formData.email.trim(),
                        onboarding_call_consent: formData.callConsent,
                    })
                }).catch(webhookError => console.error('Webhook error:', webhookError));
            } catch (webhookError) {
                console.error('Webhook error:', webhookError);
            }

            // Email confirmation is disabled for this project, so the account
            // is usable immediately — no "check your inbox" theater.
            setSuccess('Account created. Complete payment authorization to start your trial.');
            if (data?.session) navigate('/billing');
            else setSuccess('Check your email to confirm your account, then sign in to complete payment setup.');

            if (formData.callConsent && formData.phone.trim()) {
                setTimeout(() => {
                    makeOutboundCall(
                        formData.phone,
                        formData.name,
                        "You are the Bitlance platform onboarding AI. You just saw the user sign up 20 seconds ago. Greet them, welcome them to the platform, and ask if they need any assistance to get started.",
                        `Hi ${formData.name}, this is the Bitlance onboarding assistant calling to welcome you! Thanks for signing up.`
                    );
                }, 20000);
            }
        } catch (error) {
            trackSignupError(error.message);
            setError(error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <FullScreenSignup
            formData={formData}
            handleChange={handleChange}
            handleSubmit={handleSignup}
            loading={loading}
            error={error}
            success={success}
        />
    );
};

export default SignupPage;
