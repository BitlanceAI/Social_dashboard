import { supabaseAdmin } from '../../config/supabaseClient.js';

// Get all profiles for a user
export const getProfiles = async (req, res) => {
    try {
        const userId = req.user.id;

        const { data, error } = await supabaseAdmin
            .from('blog_profiles')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching profiles:', error);
            return res.status(500).json({ success: false, error: 'Failed to fetch profiles' });
        }

        res.json({ success: true, profiles: data });
    } catch (error) {
        console.error('Get Profiles Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// Create a new profile
export const createProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        const { name, role, bio, profile_image, social_links } = req.body;

        if (!name) {
            return res.status(400).json({ success: false, error: 'Name is required' });
        }

        const { data, error } = await supabaseAdmin
            .from('blog_profiles')
            .insert({
                user_id: userId,
                name,
                role,
                bio,
                profile_image,
                social_links
            })
            .select()
            .single();

        if (error) {
            console.error('Error creating profile:', error);
            return res.status(500).json({ success: false, error: 'Failed to create profile' });
        }

        res.json({ success: true, profile: data });
    } catch (error) {
        console.error('Create Profile Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// Update a profile
export const updateProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;
        const { name, role, bio, profile_image, social_links } = req.body;

        const { data, error } = await supabaseAdmin
            .from('blog_profiles')
            .update({
                name,
                role,
                bio,
                profile_image,
                social_links
            })
            .eq('id', id)
            .eq('user_id', userId) // Ensure ownership
            .select()
            .single();

        if (error) {
            console.error('Error updating profile:', error);
            return res.status(500).json({ success: false, error: 'Failed to update profile' });
        }

        res.json({ success: true, profile: data });
    } catch (error) {
        console.error('Update Profile Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// Delete a profile
export const deleteProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;

        const { error } = await supabaseAdmin
            .from('blog_profiles')
            .delete()
            .eq('id', id)
            .eq('user_id', userId);

        if (error) {
            console.error('Error deleting profile:', error);
            return res.status(500).json({ success: false, error: 'Failed to delete profile' });
        }

        res.json({ success: true, message: 'Profile deleted' });
    } catch (error) {
        console.error('Delete Profile Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};
