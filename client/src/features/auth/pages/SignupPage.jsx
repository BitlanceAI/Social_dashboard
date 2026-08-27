import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { FullScreenSignup } from '../../components/ui/full-screen-signup';
import { trackSignup, trackSignupError } from '../../lib/analytics';

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
        password: ''
    });

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSignup = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setSuccess('');

        if (formData.password.length < 6) {
            setError('Password must be at least 6 characters');
            setLoading(false);
            return;
        }

        try {
            const { error } = await signUp({
                email: formData.email,
                password: formData.password,
                options: {
                    data: {
                        name: formData.name,
                        phone: formData.phone
                    }
                }
            });

            if (error) throw error;

            trackSignup('email');

            try {
                await fetch('https://bitlancetechhub.app.n8n.cloud/webhook/signupbitlance', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        name: formData.name,
                        phone: formData.phone,
                        email: formData.email
                    })
                });
            } catch (webhookError) {
                console.error('Webhook error:', webhookError);
            }

            setSuccess('Account created! Please check your email and click the verification link before logging in.');

            if (formData.phone) {
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
