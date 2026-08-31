import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/features/auth';
import API_BASE_URL from '@/shared/config';

/**
 * The active workspace.
 *
 * Mirrors ThemeContext, including its localStorage-persisted selection, with
 * two deliberate differences:
 *
 *  1. The storage key is namespaced by user id. A bare key on a shared browser
 *     would hand the next person the previous one's workspace and earn a 403 on
 *     every request.
 *  2. It never gates rendering on `loading`. Unlike AuthProvider this wraps the
 *     public routes too, so blocking on a fetch that requires auth would hold up
 *     the landing and login pages.
 */

const WorkspaceContext = createContext();

const storageKeyFor = (userId) => `workspaceId:${userId}`;

export const WorkspaceProvider = ({ children }) => {
    const { user, token } = useAuth();

    const [workspaces, setWorkspaces] = useState([]);
    const [activeWorkspaceId, setActiveWorkspaceId] = useState(null);
    const [loading, setLoading] = useState(false);

    const load = useCallback(async () => {
        if (!user || !token) {
            setWorkspaces([]);
            setActiveWorkspaceId(null);
            return;
        }

        setLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}/api/workspaces`, {
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                    'ngrok-skip-browser-warning': 'true',
                },
            });
            const data = await response.json();

            if (!response.ok || !data.success) {
                console.error('[Workspace] Could not load workspaces:', data.error);
                return;
            }

            const list = data.workspaces || [];
            setWorkspaces(list);

            // Honour the remembered choice only if it is still one of ours —
            // membership can be revoked between sessions.
            let remembered = null;
            try {
                remembered = localStorage.getItem(storageKeyFor(user.id));
            } catch {
                // Private mode or blocked storage: fall through to the default.
            }

            const valid = list.some((w) => w.id === remembered);
            setActiveWorkspaceId(valid ? remembered : (data.defaultWorkspaceId || list[0]?.id || null));
        } catch (error) {
            console.error('[Workspace] Load failed:', error);
        } finally {
            setLoading(false);
        }
    }, [user, token]);

    useEffect(() => { load(); }, [load]);

    // Persist the selection per user.
    useEffect(() => {
        if (!user || !activeWorkspaceId) return;
        try {
            localStorage.setItem(storageKeyFor(user.id), activeWorkspaceId);
        } catch {
            // Not being able to remember is not worth breaking the app over.
        }
    }, [user, activeWorkspaceId]);

    const switchWorkspace = useCallback((id) => {
        setActiveWorkspaceId(id);
    }, []);

    const createWorkspace = useCallback(async (name) => {
        const response = await fetch(`${API_BASE_URL}/api/workspaces`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
                'ngrok-skip-browser-warning': 'true',
            },
            body: JSON.stringify({ name }),
        });
        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.error || 'Could not create the workspace');
        }

        setWorkspaces((prev) => [...prev, data.workspace]);
        setActiveWorkspaceId(data.workspace.id);
        return data.workspace;
    }, [token]);

    const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId) || null;

    return (
        <WorkspaceContext.Provider value={{
            workspaces,
            activeWorkspace,
            activeWorkspaceId,
            loading,
            switchWorkspace,
            createWorkspace,
            refreshWorkspaces: load,
        }}>
            {children}
        </WorkspaceContext.Provider>
    );
};

export const useWorkspace = () => useContext(WorkspaceContext);

export default WorkspaceContext;
