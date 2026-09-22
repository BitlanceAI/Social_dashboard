import InstagramService from './instagram.service.js';
import { encryptData, decryptData } from '../../shared/utils/encryption.js';

/** Used by both HTTP routes and the scheduler, including quiet token renewal. */
export async function instagramClient(db, connection) {
    if (!connection?.is_active) throw new Error('Instagram is disconnected. Please reconnect.');
    const remaining = new Date(connection.token_expires_at).getTime() - Date.now();
    if (!Number.isFinite(remaining) || remaining <= 0) {
        throw new Error('Your Instagram connection expired. Please reconnect.');
    }
    const service = new InstagramService(decryptData(connection.access_token));
    if (remaining < 7 * 86400000) {
        // Long-lived tokens can be renewed after they are at least 24 hours old.
        const refreshed = await service.refreshToken();
        const { error } = await db.from('instagram_connections').update({
            access_token: encryptData(refreshed.access_token),
            token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
            updated_at: new Date().toISOString(),
        }).eq('id', connection.id).eq('access_token', connection.access_token);
        if (error) throw new Error('Could not save the renewed Instagram connection.');
        service.accessToken = refreshed.access_token;
    }
    return service;
}
