/**
 * One-off: copy GraphicTemplate (and optionally DesignJob) documents from the
 * old MongoDB into the new Supabase tables.
 *
 * Requires `mongodb` available (npm i mongodb) and:
 *   MONGO_URL="mongodb+srv://…"  MONGO_DB="yourdb"  node scripts/migrate-templates-from-mongo.mjs
 *
 * Idempotent: templates upsert by `key`. DesignJob migration is opt-in via
 * MIGRATE_JOBS=true and needs a USER_ID_MAP (Mongo userId → Supabase auth uid)
 * or it skips jobs whose user can't be resolved.
 */

import '../src/config/env.js';

import { supabaseAdmin } from '../src/config/supabase.js';

const die = (m) => { console.error(`\n❌ ${m}\n`); process.exit(1); };

// Normalize a niche into a stable slug so casing/whitespace variants collapse
// into one gallery chip: "Occasion ", "Occasion", "occasion" → "occasion";
// "Real Estate" → "real_estate"; "Fitness Wellness" → "fitness_wellness".
const slugifyNiche = (raw) =>
    String(raw || 'general').trim().toLowerCase()
        .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'general';

// Accept whatever the connection string is named.
const MONGO_URL = process.env.MONGO_URL || process.env.MONGODB_URI
    || process.env.MONGO_URI || process.env.DATABASE_URL;
if (!MONGO_URL) die('No Mongo connection string found. Set MONGO_URL (or MONGODB_URI / MONGO_URI) in server/.env.');

// A DB name may be given explicitly, but only if it's a real name (not a
// URL and no dots). Otherwise we auto-discover it after connecting.
let MONGO_DB = process.env.MONGO_DB;
if (MONGO_DB && (MONGO_DB.includes('.') || MONGO_DB.includes('://'))) MONGO_DB = null;

let MongoClient;
try { ({ MongoClient } = await import('mongodb')); }
catch { die('Install the mongodb driver first:  npm i mongodb  (in server/)'); }

/** Find the database that actually contains the graphictemplates collection. */
const resolveDb = async (client) => {
    if (MONGO_DB) return MONGO_DB;
    const admin = client.db().admin();
    const { databases } = await admin.listDatabases();
    for (const { name } of databases) {
        if (['admin', 'local', 'config'].includes(name)) continue;
        const cols = await client.db(name).listCollections({ name: 'graphictemplates' }).toArray();
        if (cols.length) return name;
    }
    die('No database contains a "graphictemplates" collection. Set MONGO_DB=<yourdb> in server/.env.');
    return null;
};

const main = async () => {
    const client = new MongoClient(MONGO_URL);
    await client.connect();
    const dbName = await resolveDb(client);
    console.log(`🔗 Mongo DB: ${dbName}`);
    const db = client.db(dbName);

    // ── Templates ──
    const templates = await db.collection('graphictemplates').find({}).toArray();
    console.log(`📦 ${templates.length} templates in Mongo`);
    let ok = 0;
    for (const t of templates) {
        const row = {
            key: t.key,
            number: t.number,
            title: t.title,
            niche: slugifyNiche(t.niche),
            tags: t.tags || [],
            mood: t.mood || [],
            canvas_size: t.canvas_size || '1080x1350',
            thumbnail_url: t.thumbnail_url || null,
            dynamic_fields: t.dynamic_fields || [],
            prompt_template: t.prompt_template,
            is_active: t.is_active !== false,
            updated_at: new Date().toISOString(),
        };
        const { error } = await supabaseAdmin
            .from('graphic_templates').upsert(row, { onConflict: 'key' });
        if (error) console.error(`  ✗ ${t.key}: ${error.message}`);
        else ok += 1;
    }
    console.log(`✅ Upserted ${ok}/${templates.length} templates into Supabase`);

    // ── Design jobs (opt-in) ──
    if (process.env.MIGRATE_JOBS === 'true') {
        const map = JSON.parse(process.env.USER_ID_MAP || '{}'); // { mongoUserId: supabaseUid }
        const jobs = await db.collection('designjobs').find({}).toArray();
        let jok = 0;
        for (const j of jobs) {
            const userId = map[j.userId];
            if (!userId) continue; // can't resolve owner → skip
            const { error } = await supabaseAdmin.from('design_jobs').insert({
                user_id: userId,
                property_type: j.property_type, location: j.location, price: j.price,
                builder: j.builder, phone: j.phone, email: j.email, address: j.address,
                flyer_url: j.flyer_url, background_url: j.background_url,
                title: j.title, subline: j.subline, amenities: j.amenities || [],
                cta: j.cta, status: j.status || 'completed',
                error_message: j.error_message, credits_used: j.credits_used || 0,
                metadata: j.metadata || {},
                completed_at: j.completed_at || null,
                created_at: j.createdAt || new Date().toISOString(),
            });
            if (!error) jok += 1;
        }
        console.log(`✅ Migrated ${jok}/${jobs.length} design jobs (unmapped users skipped)`);
    }

    await client.close();
    process.exit(0);
};

main().catch((e) => die(e.message));
