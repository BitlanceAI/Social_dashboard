/**
 * occasionDates.js — the date half of the occasion calendar.
 *
 * `occasionTemplates.js` describes ~156 Indian occasions (symbols, palette,
 * mood, region) but stores only a MONTH. That gap is why the content planner
 * was left to "research the calendar" itself, and why a 15 August campaign came
 * back as a 1 August punyatithi: a language model was deciding dates.
 *
 * This file makes the date deterministic. Nothing here is inferred at runtime.
 *
 * Three kinds of occasion:
 *
 *   FIXED        — same Gregorian date every year (Republic Day, Gandhi Jayanti,
 *                  every modern figure's jayanti/punyatithi, UN observances).
 *                  The large majority.
 *   NTH_WEEKDAY  — "second Sunday in May". Computed exactly.
 *   MOVABLE      — lunar/Islamic/Nanakshahi. These genuinely shift each year and
 *                  CANNOT be derived here. They need a verified per-year entry.
 *                  Until one exists, resolveOccasionDate returns null and the
 *                  caller must ask rather than guess.
 *
 * Returning null is the point: a wrong date published to a politician's feed is
 * far worse than a question.
 *
 * Admin-verified per-year dates live in the `occasion_dates` Supabase table
 * (see modules/occasions) and take precedence over everything here.
 */

// slug → 'MM-DD'
export const FIXED = {
    // ── January ──
    'new-year': '01-01',
    'savitribai-phule-jayanti': '01-03',
    'shastri-punyatithi': '01-11',
    'vivekananda-jayanti': '01-12',
    'lohri': '01-13',
    'makar-sankranti': '01-14',
    'pongal': '01-14',
    'magh-bihu': '01-14',
    'army-day': '01-15',
    'maharana-pratap-punyatithi': '01-19',
    'manipur-statehood-day': '01-21',
    'tripura-statehood-day': '01-21',
    'meghalaya-statehood-day': '01-21',
    'netaji-jayanti': '01-23',
    'girl-child-day': '01-24',
    'karpoori-thakur-jayanti': '01-24',
    'voters-day': '01-25',
    'himachal-day': '01-25',
    'republic-day': '01-26',
    'gandhi-punyatithi': '01-30',

    // ── February ──
    'world-cancer-day': '02-04',
    'valentines-day': '02-14',
    'shivaji-jayanti': '02-19',
    'chandrashekhar-azad-punyatithi': '02-27',
    'science-day': '02-28',

    // ── March ──
    'womens-day': '03-08',
    'savitribai-phule-punyatithi': '03-10',
    'consumer-rights-day': '03-15',
    'bihar-diwas': '03-22',
    'world-water-day': '03-22',
    'shaheed-diwas-march': '03-23',
    'rajasthan-diwas': '03-30',

    // ── April ──
    'utkal-divas': '04-01',
    'world-health-day': '04-07',
    'jyotirao-phule-jayanti': '04-11',
    'baisakhi': '04-13',
    'ambedkar-jayanti': '04-14',
    'puthandu': '04-14',
    'vishu': '04-14',
    'poila-boishakh': '04-14',
    'bohag-bihu': '04-14',
    'radhakrishnan-punyatithi': '04-17',
    'earth-day': '04-22',
    'world-book-day': '04-23',

    // ── May ──
    'maharashtra-day': '05-01',
    'gujarat-day': '05-01',
    'labour-day': '05-01',
    'tagore-jayanti': '05-07',
    'technology-day': '05-11',
    'sikkim-statehood-day': '05-16',
    'nehru-punyatithi': '05-27',

    // ── June ──
    'telangana-formation-day': '06-02',
    'environment-day': '06-05',
    'birsa-munda-punyatithi': '06-09',
    'blood-donor-day': '06-14',
    'lakshmibai-punyatithi': '06-18',
    'yoga-day': '06-21',
    'world-music-day': '06-21',
    'statistics-day': '06-29',

    // ── July ──
    'doctors-day': '07-01',
    'vivekananda-punyatithi': '07-04',
    'tilak-jayanti': '07-23',
    'kargil-vijay-diwas': '07-26',
    'kalam-punyatithi': '07-27',

    // ── August ──
    'tilak-punyatithi': '08-01',
    'annabhau-sathe-jayanti': '08-01',
    'hiroshima-day': '08-06',
    'tagore-punyatithi': '08-07',
    'handloom-day': '08-07',
    'kranti-din': '08-08',
    'youth-day-international': '08-12',
    'independence-day': '08-15',
    'vajpayee-punyatithi': '08-16',
    'netaji-punyatithi': '08-18',
    'photography-day': '08-19',
    'rajiv-gandhi-jayanti': '08-20',
    'senior-citizens-day': '08-21',
    'womens-equality-day': '08-26',
    'dhyan-chand-jayanti': '08-29',

    // ── September ──
    'teachers-day': '09-05',
    'literacy-day': '09-08',
    'hindi-diwas': '09-14',
    'engineers-day': '09-15',
    'vishwakarma-puja': '09-17',
    'periyar-jayanti': '09-17',
    'peace-day': '09-21',
    'tourism-day': '09-27',
    'bhagat-singh-jayanti': '09-28',
    'world-heart-day': '09-29',

    // ── October ──
    'older-persons-day': '10-01',
    'gandhi-jayanti': '10-02',
    'shastri-jayanti': '10-02',
    'world-animal-day': '10-04',
    'air-force-day': '10-08',
    'mental-health-day': '10-10',
    'kalam-jayanti': '10-15',
    'world-food-day': '10-16',
    'patel-jayanti': '10-31',

    // ── November ──
    'karnataka-rajyotsava': '11-01',
    'kerala-piravi': '11-01',
    'andhra-formation-day': '11-01',
    'haryana-day': '11-01',
    'punjab-day': '11-01',
    'mp-foundation-day': '11-01',
    'chhattisgarh-foundation-day': '11-01',
    'uttarakhand-formation-day': '11-09',
    'education-day': '11-11',
    'childrens-day': '11-14',
    'birsa-munda-jayanti': '11-15',
    'jharkhand-formation-day': '11-15',
    'indira-gandhi-jayanti': '11-19',
    'lakshmibai-jayanti': '11-19',
    'guru-tegh-bahadur-shaheedi': '11-24',
    'constitution-day': '11-26',

    // ── December ──
    'nagaland-statehood-day': '12-01',
    'world-aids-day': '12-01',
    'pollution-control-day': '12-02',
    'dhyan-chand-punyatithi': '12-03',
    'disabilities-day': '12-03',
    'navy-day': '12-04',
    'ambedkar-punyatithi': '12-06',
    'patel-punyatithi': '12-15',
    'vijay-diwas': '12-16',
    'goa-liberation-day': '12-19',
    'kisan-diwas': '12-23',
    'periyar-punyatithi': '12-24',
    'christmas': '12-25',
    'vajpayee-jayanti': '12-25',
};

// slug → [month (1-12), weekday (0=Sun), nth (1-based)]
export const NTH_WEEKDAY = {
    'friendship-day': [8, 0, 1],       // first Sunday in August
    'mothers-day': [5, 0, 2],          // second Sunday in May
    'fathers-day': [6, 0, 3],          // third Sunday in June
    'safer-internet-day': [2, 2, 2],   // second Tuesday in February
};

/**
 * Lunar / Islamic / Nanakshahi occasions — the date moves every year and cannot
 * be computed from the Gregorian calendar.
 *
 * Populate as `'holi': { 2026: '2026-03-03', 2027: '...' }` from a verified
 * panchang or an official holiday list. DO NOT fill these in from memory — a
 * wrong festival date is the exact failure this file exists to prevent.
 *
 * Until a year is present, resolveOccasionDate returns null for that occasion
 * and the caller asks the user instead of guessing.
 */
export const MOVABLE = {
    'guru-gobind-singh-jayanti': {},
    'sant-ravidas-jayanti': {},
    'shab-e-barat': {},
    'holi': {},
    'world-sleep-day': {},
    'hanuman-jayanti': {},
    'mahavir-jayanti': {},
    'maharana-pratap-jayanti': {},
    'basava-jayanti': {},
    'kabir-jayanti': {},
    'guru-purnima': {},
    'raksha-bandhan': {},
    'narali-purnima': {},
    'navroz': {},
    'das-lakshana': {},
    'valmiki-jayanti': {},
    'ayudha-puja': {},
    'sharad-purnima': {},
    'dhamma-chakra-din': {},
    'guru-nanak-jayanti': {},
    'tulsi-vivah': {},
    'kartik-purnima': {},

    // Hindu lunar
    'vasant-panchami': {},
    'ratha-saptami': {},
    'shivratri': {},
    'gudi-padwa': {},
    'ugadi': {},
    'chaitra-navratri': {},
    'ram-navami': {},
    'akshaya-tritiya': {},
    'buddha-purnima': {},
    'ganga-dussehra': {},
    'vat-purnima': {},
    'rath-yatra': {},
    'hariyali-teej': {},
    'nag-panchami': {},
    'janmashtami': {},
    'ganesh-chaturthi': {},
    'sharad-navratri': {},
    'durga-puja': {},
    'dussehra': {},
    'dhanteras': {},
    'naraka-chaturdashi': {},
    'diwali': {},
    'govardhan-puja': {},
    'bhai-dooj': {},
    'karva-chauth': {},
    'kali-puja': {},
    'chhath-puja': {},
    'gita-jayanti': {},
    'vaikuntha-ekadashi': {},

    // Regional solar/lunar
    'onam': {},
    'thaipusam': {},
    'karthigai-deepam': {},
    'narayana-guru-jayanti': {},

    // Islamic (Hijri)
    'ramadan': {},
    'eid-ul-fitr': {},
    'eid-ul-adha': {},
    'muharram': {},
    'milad-un-nabi': {},

    // Jain
    'paryushan': {},

    // Christian (Computus — derivable, but kept here so it is verified rather
    // than computed wrong)
    'good-friday': {},
    'easter': {},
};

/**
 * Occasions in the dataset with no date rule at all — neither fixed, nor a
 * weekday rule, nor a declared movable. Listed so they surface as a known gap
 * instead of silently resolving to null like a typo would.
 *
 * 'tamil-nadu-day' is here because sources disagree on which date the dataset
 * means; it needs a human to decide before it can be pinned.
 */
export const UNDATED = ['tamil-nadu-day'];

const pad = (n) => String(n).padStart(2, '0');

/** Nth given weekday of a month, e.g. the 2nd Sunday in May. */
function nthWeekdayOf(year, month, weekday, nth) {
    const first = new Date(Date.UTC(year, month - 1, 1));
    const shift = (weekday - first.getUTCDay() + 7) % 7;
    const day = 1 + shift + (nth - 1) * 7;
    const d = new Date(Date.UTC(year, month - 1, day));
    // Guard against a 5th-weekday request that overflows into the next month.
    return d.getUTCMonth() === month - 1 ? d : null;
}

/**
 * Exact date for an occasion in a given year, as 'YYYY-MM-DD'.
 * Returns null when the occasion is movable and that year has not been filled
 * in — callers must treat null as "ask", never as "pick something".
 */
export function resolveOccasionDate(slug, year) {
    if (!slug || !year) return null;

    const fixed = FIXED[slug];
    if (fixed) return `${year}-${fixed}`;

    const rule = NTH_WEEKDAY[slug];
    if (rule) {
        const d = nthWeekdayOf(year, rule[0], rule[1], rule[2]);
        return d ? `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` : null;
    }

    const movable = MOVABLE[slug];
    if (movable) return movable[year] || movable[String(year)] || null;

    return null;
}

/** True when the occasion exists but its date for `year` is not known yet. */
export function isUnresolvedMovable(slug, year) {
    return Boolean(MOVABLE[slug]) && !resolveOccasionDate(slug, year);
}

/** Every occasion falling on a given 'YYYY-MM-DD'. */
export function occasionsOnDate(isoDate) {
    const year = Number(String(isoDate).slice(0, 4));
    if (!year) return [];

    const slugs = [
        ...Object.keys(FIXED),
        ...Object.keys(NTH_WEEKDAY),
        ...Object.keys(MOVABLE),
    ];
    return slugs.filter((slug) => resolveOccasionDate(slug, year) === isoDate);
}

/** Occasions between two 'YYYY-MM-DD' bounds, inclusive, soonest first. */
export function occasionsBetween(fromIso, toIso) {
    const years = new Set([
        Number(String(fromIso).slice(0, 4)),
        Number(String(toIso).slice(0, 4)),
    ]);

    const out = [];
    for (const year of years) {
        if (!year) continue;
        for (const slug of [...Object.keys(FIXED), ...Object.keys(NTH_WEEKDAY), ...Object.keys(MOVABLE)]) {
            const date = resolveOccasionDate(slug, year);
            if (date && date >= fromIso && date <= toIso) out.push({ slug, date });
        }
    }
    return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
