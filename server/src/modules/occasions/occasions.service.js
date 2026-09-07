/**
 * Occasion calendar — static date rules merged with admin-entered dates.
 *
 * Resolution order for a (slug, year):
 *   1. `occasion_dates` row (admin-verified; also how MOVABLE occasions and
 *      brand-new occasions get dates at all)
 *   2. the static resolver in shared/utils/occasionDates.js
 *   3. null — which callers must treat as "ask", never "pick something".
 */

import '../../config/env.js';

import { supabaseAdmin } from '../../config/supabase.js';
import {
    FIXED, NTH_WEEKDAY, MOVABLE, UNDATED, resolveOccasionDate,
} from '../../shared/utils/occasionDates.js';

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const kindOf = (slug) => {
    if (FIXED[slug]) return 'fixed';
    if (NTH_WEEKDAY[slug]) return 'nth-weekday';
    if (MOVABLE[slug]) return 'movable';
    if (UNDATED.includes(slug)) return 'undated';
    return 'custom';
};

/** 'guru-nanak-jayanti' → 'Guru Nanak Jayanti' (fallback when no stored name). */
const labelFromSlug = (slug) =>
    String(slug).split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

const dbRowsForYear = async (year) => {
    const { data, error } = await supabaseAdmin
        .from('occasion_dates')
        .select('slug, year, date, name, notes, source, updated_at')
        .eq('year', year);
    if (error) throw error;
    return data || [];
};

/**
 * Exact date for one occasion, DB entry first, then the static rules.
 * Returns 'YYYY-MM-DD' or null. This is the function other modules
 * (content planner, scheduler) should call.
 */
export const resolveDate = async (slug, year) => {
    const { data, error } = await supabaseAdmin
        .from('occasion_dates')
        .select('date')
        .eq('slug', slug)
        .eq('year', year)
        .maybeSingle();
    if (error) throw error;
    return data?.date || resolveOccasionDate(slug, year) || null;
};

/**
 * The full calendar for a year: every known slug with its resolved date and
 * where that date came from. Unresolved movables come back with date: null so
 * the UI can surface them as the gap they are.
 */
export const getCalendar = async (year) => {
    const rows = await dbRowsForYear(year);
    const bySlug = new Map(rows.map((r) => [r.slug, r]));

    const slugs = new Set([
        ...Object.keys(FIXED),
        ...Object.keys(NTH_WEEKDAY),
        ...Object.keys(MOVABLE),
        ...UNDATED,
        ...bySlug.keys(),
    ]);

    const occasions = [...slugs].map((slug) => {
        const row = bySlug.get(slug);
        const staticDate = resolveOccasionDate(slug, year);
        return {
            slug,
            name: row?.name || labelFromSlug(slug),
            kind: kindOf(slug),
            date: row?.date || staticDate,
            source: row ? (row.source || 'admin') : (staticDate ? 'rule' : null),
            staticDate,                 // what the rule alone says (null for movables)
            notes: row?.notes || null,
            updatedAt: row?.updated_at || null,
        };
    });

    occasions.sort((a, b) => {
        if (a.date && b.date) return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
        if (a.date) return -1;          // dated first, unresolved at the end
        if (b.date) return 1;
        return a.slug < b.slug ? -1 : 1;
    });

    return {
        year,
        occasions,
        unresolved: occasions.filter((o) => !o.date).map((o) => o.slug),
    };
};

/** Dated occasions between two ISO bounds, DB entries included. */
export const listBetween = async (fromIso, toIso) => {
    if (!ISO_DATE_RE.test(fromIso || '') || !ISO_DATE_RE.test(toIso || '')) {
        const e = new Error('from and to must be YYYY-MM-DD');
        e.status = 400;
        throw e;
    }
    const years = new Set([Number(fromIso.slice(0, 4)), Number(toIso.slice(0, 4))]);
    const out = [];
    for (const year of years) {
        const { occasions } = await getCalendar(year);
        for (const o of occasions) {
            if (o.date && o.date >= fromIso && o.date <= toIso) out.push(o);
        }
    }
    return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
};

/** Upsert one admin-verified date. */
export const setDate = async (slug, year, { date, name, notes }, updatedBy = null) => {
    if (!SLUG_RE.test(slug || '')) {
        const e = new Error('slug must be lowercase-kebab-case');
        e.status = 400;
        throw e;
    }
    const y = Number(year);
    if (!Number.isInteger(y) || y < 2000 || y > 2100) {
        const e = new Error('year must be between 2000 and 2100');
        e.status = 400;
        throw e;
    }
    if (!ISO_DATE_RE.test(date || '') || Number(date.slice(0, 4)) !== y) {
        const e = new Error(`date must be YYYY-MM-DD and fall inside ${y}`);
        e.status = 400;
        throw e;
    }

    const { data, error } = await supabaseAdmin
        .from('occasion_dates')
        .upsert({
            slug,
            year: y,
            date,
            name: name?.trim() || null,
            notes: notes?.trim() || null,
            source: 'admin',
            updated_by: updatedBy,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'slug,year' })
        .select('slug, year, date, name, notes, source, updated_at')
        .single();
    if (error) throw error;
    return data;
};

/** Remove an admin entry; the occasion falls back to its static rule (if any). */
export const removeDate = async (slug, year) => {
    const { error, count } = await supabaseAdmin
        .from('occasion_dates')
        .delete({ count: 'exact' })
        .eq('slug', slug)
        .eq('year', Number(year));
    if (error) throw error;
    if (!count) {
        const e = new Error('No entry for that occasion and year');
        e.status = 404;
        throw e;
    }
};
