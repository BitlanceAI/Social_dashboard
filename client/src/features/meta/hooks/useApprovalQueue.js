import { useCallback, useEffect, useRef, useState } from 'react';
import API_BASE_URL from '@/shared/config';

export default function useApprovalQueue(token, workspaceId, active) {
    const [pages, setPages] = useState({ workspaceId, pending: 1, approved: 1 });
    const pendingPage = pages.workspaceId === workspaceId ? pages.pending : 1;
    const approvedPage = pages.workspaceId === workspaceId ? pages.approved : 1;
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);
    const request = useRef({ sequence: 0, controller: null });
    const refresh = useCallback(async () => {
        request.current.controller?.abort();
        const sequence = ++request.current.sequence;
        if (!token || !workspaceId) return;
        const controller = new AbortController();
        request.current.controller = controller;
        setLoading(true);
        setError(null);
        try {
            const response = await fetch(`${API_BASE_URL}/api/approvals/pending?pendingPage=${pendingPage}&approvedPage=${approvedPage}`, {
                headers: { Authorization: `Bearer ${token}`, 'x-workspace-id': workspaceId, 'ngrok-skip-browser-warning': 'true' },
                signal: controller.signal,
            });
            const data = await response.json();
            if (!response.ok || !data.success) throw new Error(data.error || 'Could not load approval queue.');
            if (sequence !== request.current.sequence) return;
            setResult({ workspaceId, data });
            const lastPending = Math.max(1, Math.ceil(data.pendingCount / data.pageSize));
            const lastApproved = Math.max(1, Math.ceil(data.approvedCount / data.pageSize));
            if (pendingPage > lastPending || approvedPage > lastApproved) {
                setPages({ workspaceId, pending: Math.min(pendingPage, lastPending), approved: Math.min(approvedPage, lastApproved) });
            }
        } catch (err) {
            if (sequence === request.current.sequence && err.name !== 'AbortError') setError({ workspaceId, message: err.message });
        } finally {
            if (sequence === request.current.sequence) setLoading(false);
        }
    }, [token, workspaceId, pendingPage, approvedPage]);

    useEffect(() => {
        const currentRequest = request.current;
        // Fetch external data when the workspace or queue page changes.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        refresh();
        const visibleRefresh = () => { if (document.visibilityState === 'visible') refresh(); };
        const interval = setInterval(visibleRefresh, 30000);
        window.addEventListener('focus', visibleRefresh);
        document.addEventListener('visibilitychange', visibleRefresh);
        return () => {
            clearInterval(interval);
            window.removeEventListener('focus', visibleRefresh);
            document.removeEventListener('visibilitychange', visibleRefresh);
            currentRequest.controller?.abort();
            ++currentRequest.sequence;
        };
    }, [refresh, active]);

    return {
        data: result?.workspaceId === workspaceId ? result.data : null,
        error: error?.workspaceId === workspaceId ? error.message : null,
        loading, refresh, pendingPage, approvedPage,
        setPage: (section, page) => setPages({ workspaceId, pending: pendingPage, approved: approvedPage, [section]: page }),
    };
}
