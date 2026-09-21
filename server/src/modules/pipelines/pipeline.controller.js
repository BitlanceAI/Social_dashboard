/**
 * Pipeline Controller Handlers
 */

import * as svc from './pipeline.service.js';
import { runPipeline, fetchGoogleSheetRows } from './pipeline_executor.service.js';

export const listPipelines = async (req, res) => {
    try {
        const pipelines = await svc.getPipelines(req.workspaceId);
        res.json({ success: true, pipelines });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const getPipeline = async (req, res) => {
    try {
        const pipeline = await svc.getPipelineById(req.params.id, req.workspaceId);
        res.json({ success: true, pipeline });
    } catch (err) {
        res.status(404).json({ success: false, error: err.message });
    }
};

export const createPipeline = async (req, res) => {
    try {
        const pipeline = await svc.createPipeline(req.workspaceId, req.user.id, req.body || {});
        res.status(201).json({ success: true, pipeline });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

export const updatePipeline = async (req, res) => {
    try {
        const pipeline = await svc.updatePipeline(req.params.id, req.workspaceId, req.body || {});
        res.json({ success: true, pipeline });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

export const deletePipeline = async (req, res) => {
    try {
        await svc.deletePipeline(req.params.id, req.workspaceId);
        res.json({ success: true, message: 'Pipeline deleted' });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

export const runPipelineNow = async (req, res) => {
    try {
        const result = await runPipeline(req.params.id, req.workspaceId);
        res.json({ success: true, result });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const getQueue = async (req, res) => {
    try {
        const queue = await svc.getQueueItems(req.params.id, req.workspaceId);
        res.json({ success: true, queue });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const syncSheetQueue = async (req, res) => {
    try {
        const pipeline = await svc.getPipelineById(req.params.id, req.workspaceId);
        if (!pipeline.sheet_url) {
            return res.status(400).json({ success: false, error: 'No Google Sheet URL set on this pipeline' });
        }

        const rows = await fetchGoogleSheetRows(pipeline.sheet_url);
        const added = await svc.addQueueItems(req.params.id, req.workspaceId, rows);

        res.json({ success: true, count: added.length, items: added });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const importQueue = async (req, res) => {
    try {
        const { items } = req.body || {};
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ success: false, error: 'An array of content items is required' });
        }

        const added = await svc.addQueueItems(req.params.id, req.workspaceId, items);
        res.json({ success: true, count: added.length, items: added });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const clearQueue = async (req, res) => {
    try {
        await svc.clearQueueItems(req.params.id, req.workspaceId);
        res.json({ success: true, message: 'Queue cleared' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
