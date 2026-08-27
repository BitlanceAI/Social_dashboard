import { supabase } from '../../config/supabaseClient.js';

/**
 * Login user
 * POST /api/auth/login
 */
export const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                error: 'Email and password are required'
            });
        }

        // Sign in with Supabase Auth
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (error) {
            console.error('Login error:', error);
            return res.status(401).json({
                success: false,
                error: error.message || 'Invalid credentials'
            });
        }

        res.json({
            success: true,
            token: data.session.access_token,
            user: {
                id: data.user.id,
                email: data.user.email,
                role: data.user.user_metadata?.role || 'user'
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            error: 'Login failed'
        });
    }
};

/**
 * Signup new user
 * POST /api/auth/signup
 */
export const signup = async (req, res) => {
    try {
        const { email, password, name } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                error: 'Email and password are required'
            });
        }

        // Sign up with Supabase Auth
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    name: name || email.split('@')[0],
                    role: 'user'
                }
            }
        });

        if (error) {
            console.error('Signup error:', error);
            return res.status(400).json({
                success: false,
                error: error.message || 'Signup failed'
            });
        }

        // Create user credits record
        if (data.user) {
            try {
                const { error: creditsError } = await supabase
                    .from('user_credits')
                    .insert({
                        user_id: data.user.id,
                        balance: 5000, // Initial credits
                        updated_at: new Date().toISOString()
                    });

                if (creditsError) {
                    console.error('Failed to create credits record:', creditsError);
                }
            } catch (err) {
                console.error('Credits initialization error:', err);
            }
        }

        res.json({
            success: true,
            message: 'Signup successful. Please check your email to verify your account.',
            token: data.session?.access_token,
            user: {
                id: data.user.id,
                email: data.user.email
            }
        });

    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({
            success: false,
            error: 'Signup failed'
        });
    }
};

/**
 * Logout user
 * POST /api/auth/logout
 */
export const logout = async (req, res) => {
    try {
        const { error } = await supabase.auth.signOut();

        if (error) {
            console.error('Logout error:', error);
            return res.status(500).json({
                success: false,
                error: 'Logout failed'
            });
        }

        res.json({
            success: true,
            message: 'Logged out successfully'
        });

    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({
            success: false,
            error: 'Logout failed'
        });
    }
};

/**
 * Get current user
 * GET /api/auth/me
 */
export const getCurrentUser = async (req, res) => {
    try {
        // User is already attached by authMiddleware
        const userId = req.user.id;

        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', userId)
            .single();

        if (error) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        res.json({
            success: true,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role
            }
        });

    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get user'
        });
    }
};

/**
 * Refresh token
 * POST /api/auth/refresh
 */
export const refreshToken = async (req, res) => {
    try {
        const { refresh_token } = req.body;

        if (!refresh_token) {
            return res.status(400).json({
                success: false,
                error: 'Refresh token is required'
            });
        }

        const { data, error } = await supabase.auth.refreshSession({
            refresh_token
        });

        if (error) {
            return res.status(401).json({
                success: false,
                error: 'Invalid refresh token'
            });
        }

        res.json({
            success: true,
            token: data.session.access_token,
            refresh_token: data.session.refresh_token
        });

    } catch (error) {
        console.error('Refresh token error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to refresh token'
        });
    }
};
