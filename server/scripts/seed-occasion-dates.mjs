/**
 * Push the deterministic half of the occasion calendar into Supabase.
 *
 * `shared/utils/occasionDates.js` stays the source of truth for occasions whose
 * date is computable — FIXED ('08-15' every year) and NTH_WEEKDAY ("second
 * Sunday in May"). This script materialises those rules as `occasion_dates`
 * rows for a range of years, so the whole calendar is queryable in Postgres
 * (joins, date-range scans, the admin panel) rather than only in JS memory.
 *
 * MOVABLE occasions are deliberately NOT seeded. Their dates shift with the
 * lunar / Hijri / Nanakshahi calendars and are not derivable here; a person
 * enters each verified date in the admin Occasions tab. Guessing them is the
 * exact failure the occasion module exists to prevent.
 *
 * Rows land with source='rule'. Rows a person has already set (source='admin')
 * are never touched, so this is safe to re-run after any admin edit.
 *
 * Usage (run from the server workspace so .env loads):
 *   node scripts/seed-occasion-dates.mjs               # current year .. +4
 *   node scripts/seed-occasion-dates.mjs 2026 2030     # explicit range
 */

import '../src/config/env.js';

import { supabaseAdmin } from '../src/config/supabase.js';
import { FIXED, NTH_WEEKDAY, resolveOccasionDate } from '../src/shared/utils/occasionDates.js';

const thisYear = new Date().getFullYear();
const from = Number(process.argv[2] || thisYear);
const to = Number(process.argv[3] || from + 4);

if (!Number.isInteger(from) || !Number.isInteger(to) || from < 2000 || to > 2100 || to < from) {
    console.error(`Bad year range ${from}..${to} — expected 2000 <= from <= to <= 2100`);
    process.exit(1);
}

// Only the computable rules. MOVABLE is a human's job, by design.
const SLUGS = [...Object.keys(FIXED), ...Object.keys(NTH_WEEKDAY)];

const chunk = (arr, size) =>
    Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, (i + 1) * size));

let seeded = 0;
let skipped = 0;

for (let year = from; year <= to; year += 1) {
    // Whatever a person has decided for this year wins and stays untouched.
    const { data: adminRows, error: readErr } = await supabaseAdmin
        .from('occasion_dates')
        .select('slug')
        .eq('year', year)
        .eq('source', 'admin');
    if (readErr) {
        console.error(`[${year}] could not read existing entries:`, readErr.message);
        process.exit(1);
    }
    const held = new Set((adminRows || []).map((r) => r.slug));

    const rows = [];
    for (const slug of SLUGS) {
        if (held.has(slug)) { skipped += 1; continue; }
        const date = resolveOccasionDate(slug, year);
        if (!date) continue;                    // e.g. a 5th-weekday rule that overflows
        // `name` stays null: the service derives the label from the slug, so the
        // display name has exactly one definition.
        rows.push({ slug, year, date, source: 'rule', updated_at: new Date().toISOString() });
    }

    for (const batch of chunk(rows, 250)) {
        const { error } = await supabaseAdmin
            .from('occasion_dates')
            .upsert(batch, { onConflict: 'slug,year' });
        if (error) {
            console.error(`[${year}] upsert failed:`, error.message);
            process.exit(1);
        }
    }

    seeded += rows.length;
    console.log(`[${year}] ${rows.length} rule dates seeded${held.size ? `, ${held.size} admin entries left alone` : ''}`);
}

console.log(`\nDone — ${seeded} rows seeded across ${from}..${to}, ${skipped} admin entries preserved.`);
console.log('Movable occasions (Diwali, Eid, Holi …) still need verified dates in the admin Occasions tab.');
