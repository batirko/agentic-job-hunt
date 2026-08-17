#!/usr/bin/env node

/**
 * scan-core.mjs — Shared logic for the portal scanners.
 *
 * Used by scan.mjs (ATS boards) and scan-linkedin.mjs (LinkedIn guest API).
 *
 * Holds three things:
 *   1. Geography tables + the location tier resolver
 *   2. Dedup that survives URL-format drift (LinkedIn especially)
 *   3. pipeline.md / scan-history.tsv writers
 *
 * Geography is system knowledge and lives here. WHICH tier a country lands in
 * is a personal preference and lives in config/profile.yml under `location.tiers`.
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'fs';
import yaml from 'js-yaml';
import { escapeCell, splitRow } from './markdown-core.mjs';

export const SCAN_HISTORY_PATH = 'data/scan-history.tsv';
export const PIPELINE_PATH = 'data/pipeline.md';
export const APPLICATIONS_PATH = 'data/applications.md';
export const APPLICATIONS_ARCHIVE_PATH = 'data/applications-archive.md';

// Every file holding tracker rows. Dedup must span both: a role that was
// skipped or rejected months ago lives in the archive, and a scanner that only
// reads the live tracker will queue it again on the next sweep.
export const APPLICATIONS_PATHS = [APPLICATIONS_PATH, APPLICATIONS_ARCHIVE_PATH];
export const PROFILE_PATH = 'config/profile.yml';

// Section new offers get appended to. Kept in English to match pipeline.md.
const PIPELINE_SECTION = '## New (Today)';

// ── Geography ───────────────────────────────────────────────────────

export const EU_MEMBERS = [
  'austria', 'belgium', 'bulgaria', 'croatia', 'cyprus', 'czechia',
  'czech republic', 'denmark', 'estonia', 'finland', 'france', 'germany',
  'deutschland', 'greece', 'hungary', 'ireland', 'italy', 'latvia',
  'lithuania', 'luxembourg', 'malta', 'netherlands', 'poland', 'portugal',
  'romania', 'slovakia', 'slovenia', 'spain', 'sweden',
];

export const EUROPE_NON_EU = [
  'switzerland', 'united kingdom', 'uk', 'great britain', 'england',
  'scotland', 'wales', 'northern ireland', 'norway', 'iceland',
  'liechtenstein', 'serbia', 'ukraine', 'moldova', 'albania',
  'bosnia and herzegovina', 'bosnia', 'north macedonia', 'macedonia',
  'montenegro', 'kosovo', 'belarus', 'turkey', 'turkiye', 'armenia',
];

// Region words that mean "anywhere in Europe" — reachable from Austria, so they
// resolve to the EU tier rather than to any single country's tier.
const EU_REGION_WORDS = [
  'european union', 'europe', 'european', 'eu', 'emea', 'eea', 'cet', 'cest',
  'eu remote', 'europe remote',
];

const GLOBAL_REMOTE_WORDS = [
  'global', 'globally', 'worldwide', 'anywhere', 'work from anywhere',
  'fully distributed', 'distributed', 'any location', 'international',
];

const REMOTE_WORDS = ['remote', 'hybrid', 'work from home', 'wfh'];

// Explicitly outside scope. Listed so "Remote - United States" is recognised as
// out rather than falling into the ambiguous-remote bucket.
export const NON_EUROPEAN = [
  'united states', 'usa', 'us', 'america', 'canada', 'india', 'singapore',
  'japan', 'china', 'australia', 'new zealand', 'brazil', 'mexico',
  'argentina', 'chile', 'colombia', 'peru', 'uruguay', 'costa rica',
  'united arab emirates', 'uae', 'saudi arabia', 'qatar', 'south africa',
  'kenya', 'nigeria', 'egypt', 'south korea', 'korea', 'taiwan',
  'hong kong', 'thailand', 'vietnam', 'philippines', 'indonesia',
  'malaysia', 'pakistan', 'bangladesh', 'latam', 'apac', 'anz', 'amer',
  // cities
  'san francisco', 'bay area', 'new york', 'nyc', 'brooklyn', 'seattle',
  'austin', 'boston', 'chicago', 'denver', 'los angeles', 'san jose',
  'palo alto', 'mountain view', 'sunnyvale', 'santa clara', 'cupertino',
  'redmond', 'atlanta', 'miami', 'dallas', 'houston', 'portland',
  'phoenix', 'washington dc', 'san diego', 'salt lake city', 'raleigh',
  'toronto', 'vancouver', 'montreal', 'ottawa', 'waterloo',
  'bangalore', 'bengaluru', 'hyderabad', 'mumbai', 'pune', 'new delhi',
  'gurgaon', 'gurugram', 'noida', 'chennai', 'kolkata', 'ahmedabad',
  'tokyo', 'osaka', 'kyoto', 'seoul', 'shanghai', 'beijing', 'shenzhen',
  'guangzhou', 'taipei', 'sydney', 'melbourne', 'brisbane', 'perth',
  'auckland', 'wellington', 'sao paulo', 'rio de janeiro', 'belo horizonte',
  'mexico city', 'guadalajara', 'buenos aires', 'bogota', 'santiago',
  'lima', 'montevideo', 'dubai', 'abu dhabi', 'riyadh', 'doha',
  'cape town', 'johannesburg', 'nairobi', 'lagos', 'cairo', 'bangkok',
  'ho chi minh', 'hanoi', 'manila', 'jakarta', 'kuala lumpur',
  'karachi', 'lahore', 'dhaka', 'colombo',
];

// City → country. Diacritics are folded before matching, so the ASCII form
// here also catches "München", "Zürich", "Kraków", "București".
export const CITY_TO_COUNTRY = {
  austria: ['vienna', 'wien', 'linz', 'graz', 'salzburg', 'innsbruck', 'klagenfurt'],
  germany: ['berlin', 'munich', 'munchen', 'hamburg', 'cologne', 'koln',
    'frankfurt', 'stuttgart', 'dusseldorf', 'leipzig', 'dresden', 'nuremberg',
    'nurnberg', 'karlsruhe', 'heidelberg', 'bonn', 'essen', 'bremen',
    'hannover', 'hanover', 'munster', 'mannheim', 'potsdam', 'darmstadt',
    'aachen', 'freiburg', 'jena', 'walldorf', 'ismaning', 'unterfohring'],
  switzerland: ['zurich', 'zug', 'geneva', 'geneve', 'lausanne', 'basel',
    'bern', 'lugano', 'st gallen', 'winterthur', 'lucerne'],
  romania: ['bucharest', 'bucuresti', 'cluj', 'cluj-napoca', 'iasi',
    'timisoara', 'brasov', 'sibiu', 'oradea', 'constanta'],
  'united kingdom': ['london', 'manchester', 'edinburgh', 'cambridge',
    'oxford', 'bristol', 'glasgow', 'leeds', 'birmingham', 'belfast',
    'reading', 'sheffield', 'newcastle', 'brighton', 'nottingham'],
  israel: ['tel aviv', 'herzliya', 'haifa', 'jerusalem', 'raanana',
    "ra'anana", 'petah tikva', 'netanya', 'beer sheva', 'ramat gan',
    'rehovot', 'yokneam'],
  france: ['paris', 'lyon', 'toulouse', 'marseille', 'bordeaux', 'lille',
    'nantes', 'nice', 'grenoble', 'montpellier', 'sophia antipolis',
    'rennes', 'strasbourg'],
  belgium: ['brussels', 'bruxelles', 'brussel', 'antwerp', 'antwerpen',
    'ghent', 'gent', 'leuven', 'liege', 'mechelen'],
  netherlands: ['amsterdam', 'rotterdam', 'utrecht', 'eindhoven',
    'the hague', 'den haag', 'delft', 'groningen', 'hilversum', 'haarlem'],
  spain: ['madrid', 'barcelona', 'valencia', 'seville', 'sevilla', 'malaga',
    'bilbao', 'zaragoza', 'palma', 'alicante'],
  portugal: ['lisbon', 'lisboa', 'porto', 'braga', 'coimbra', 'aveiro'],
  ireland: ['dublin', 'cork', 'galway', 'limerick'],
  poland: ['warsaw', 'warszawa', 'krakow', 'wroclaw', 'gdansk', 'poznan',
    'katowice', 'lodz', 'szczecin'],
  czechia: ['prague', 'praha', 'brno', 'ostrava', 'plzen'],
  sweden: ['stockholm', 'gothenburg', 'goteborg', 'malmo', 'lund', 'uppsala'],
  denmark: ['copenhagen', 'kobenhavn', 'aarhus', 'odense', 'aalborg'],
  finland: ['helsinki', 'espoo', 'tampere', 'oulu', 'turku'],
  italy: ['milan', 'milano', 'rome', 'roma', 'turin', 'torino', 'bologna',
    'florence', 'firenze', 'naples', 'napoli', 'padua', 'padova'],
  greece: ['athens', 'thessaloniki', 'patras'],
  hungary: ['budapest', 'debrecen', 'szeged'],
  bulgaria: ['sofia', 'plovdiv', 'varna', 'burgas'],
  croatia: ['zagreb', 'split', 'rijeka', 'osijek'],
  slovakia: ['bratislava', 'kosice'],
  slovenia: ['ljubljana', 'maribor'],
  estonia: ['tallinn', 'tartu'],
  latvia: ['riga'],
  lithuania: ['vilnius', 'kaunas'],
  luxembourg: ['luxembourg city'],
  malta: ['valletta', 'sliema'],
  cyprus: ['nicosia', 'limassol'],
  norway: ['oslo', 'bergen', 'trondheim', 'stavanger'],
  iceland: ['reykjavik'],
  serbia: ['belgrade', 'beograd', 'novi sad'],
  ukraine: ['kyiv', 'kiev', 'lviv', 'kharkiv', 'odesa', 'odessa', 'dnipro'],
  turkey: ['istanbul', 'ankara', 'izmir'],
  armenia: ['yerevan'],
  moldova: ['chisinau'],
  albania: ['tirana'],
  bosnia: ['sarajevo', 'banja luka'],
  'north macedonia': ['skopje'],
  montenegro: ['podgorica'],
  belarus: ['minsk'],
};

// ── Normalization + matching ────────────────────────────────────────

/**
 * Fold to a form the keyword lists can match: lowercase, diacritics stripped,
 * periods removed ("U.S.A." → "usa"), separators collapsed to spaces.
 */
export function normalizeLocation(raw) {
  return (raw || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/[|/,;()\[\]—–-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Word-boundary match. Substring matching is unsafe here — "us" appears inside
 * "austria", "eu" inside "deutschland".
 */
function hasToken(haystack, token) {
  return new RegExp(`\\b${escapeRegex(token)}\\b`).test(haystack);
}

function hasAny(haystack, tokens) {
  return tokens.some(t => hasToken(haystack, t));
}

// ── Tier resolver ───────────────────────────────────────────────────

const DEFAULT_TIERS = {
  S: { score: 5.0, countries: ['austria', 'germany'], eu: true, global_remote: true },
  A: { score: 4.0, countries: ['switzerland', 'romania', 'united kingdom'] },
  B: { score: 3.0, countries: ['israel'], other_europe: true },
  C: { score: 2.0, countries: ['france', 'belgium'] },
};

const TIER_ORDER = ['S', 'A', 'B', 'C'];

/**
 * Build a resolver from the tier config in config/profile.yml.
 *
 * Precedence, highest wins:
 *   1. Explicitly named country (France beats the EU catch-all)
 *   2. EU membership       → the tier flagged `eu: true`
 *   3. Other European      → the tier flagged `other_europe: true`
 *   4. Global remote       → the tier flagged `global_remote: true`
 *   5. Nothing matched     → untiered
 *
 * A multi-location posting is judged by its BEST tier: "Paris | Berlin"
 * is a Berlin opportunity that also happens to offer Paris.
 */
export function buildTierResolver(tierConfig) {
  const tiers = tierConfig && Object.keys(tierConfig).length ? tierConfig : DEFAULT_TIERS;

  // country → tier, from the explicit country lists
  const countryTier = new Map();
  for (const name of TIER_ORDER) {
    for (const country of tiers[name]?.countries || []) {
      countryTier.set(country.toLowerCase(), name);
    }
  }

  const tierWithFlag = (flag) => TIER_ORDER.find(n => tiers[n]?.[flag]) || null;
  const euTier = tierWithFlag('eu');
  const otherEuropeTier = tierWithFlag('other_europe');
  const globalTier = tierWithFlag('global_remote');

  const scoreOf = (name) => tiers[name]?.score ?? null;
  const rank = (name) => (name ? TIER_ORDER.indexOf(name) : Infinity);

  return function resolveTier(rawLocation) {
    const loc = normalizeLocation(rawLocation);

    if (!loc) {
      return { tier: null, score: null, country: null, reason: 'no-location', keep: true };
    }

    // 1. Which countries does this string name, directly or via a city?
    const matched = new Set();
    for (const country of [...EU_MEMBERS, ...EUROPE_NON_EU, 'israel']) {
      if (hasToken(loc, country)) matched.add(country);
    }
    for (const [country, cities] of Object.entries(CITY_TO_COUNTRY)) {
      if (hasAny(loc, cities)) matched.add(country);
    }

    // Normalize UK aliases onto the canonical name used in the tier config
    const UK_ALIASES = ['uk', 'great britain', 'england', 'scotland', 'wales', 'northern ireland'];
    if (UK_ALIASES.some(a => matched.has(a))) {
      UK_ALIASES.forEach(a => matched.delete(a));
      matched.add('united kingdom');
    }
    if (matched.has('czech republic')) { matched.delete('czech republic'); matched.add('czechia'); }
    if (matched.has('deutschland')) { matched.delete('deutschland'); matched.add('germany'); }

    let best = null;
    let bestCountry = null;
    for (const country of matched) {
      const t = countryTier.get(country)
        ?? (EU_MEMBERS.includes(country) ? euTier : otherEuropeTier);
      if (!t) continue;
      if (rank(t) < rank(best)) { best = t; bestCountry = country; }
    }
    if (best) {
      return { tier: best, score: scoreOf(best), country: bestCountry, reason: 'country', keep: true };
    }

    // 2. No country named. Region-wide Europe/EU remote is reachable from home.
    const isRemote = hasAny(loc, REMOTE_WORDS);
    if (hasAny(loc, EU_REGION_WORDS) && euTier) {
      return { tier: euTier, score: scoreOf(euTier), country: null, reason: 'eu-region', keep: true };
    }

    // 3. Global remote.
    if (hasAny(loc, GLOBAL_REMOTE_WORDS) && globalTier) {
      const outside = hasAny(loc, NON_EUROPEAN);
      if (!outside) {
        return { tier: globalTier, score: scoreOf(globalTier), country: null, reason: 'global-remote', keep: true };
      }
    }

    // 4. Explicitly somewhere else.
    if (hasAny(loc, NON_EUROPEAN)) {
      return { tier: null, score: null, country: null, reason: 'outside-scope', keep: false };
    }

    // 5. Bare "Remote" with no region at all — ambiguous, worth a human look.
    if (isRemote) {
      return { tier: null, score: null, country: null, reason: 'unqualified-remote', keep: true };
    }

    return { tier: null, score: null, country: null, reason: 'unrecognized', keep: false };
  };
}

/** Read `location.tiers` out of config/profile.yml. Falls back to defaults. */
export function loadTierConfig(path = PROFILE_PATH) {
  if (!existsSync(path)) return null;
  try {
    const profile = yaml.load(readFileSync(path, 'utf-8'));
    return profile?.location?.tiers || null;
  } catch {
    return null;
  }
}

// ── Title filter ────────────────────────────────────────────────────

/**
 * Three-way title classifier.
 *
 *   'pass'    — a product role naming one of the target domains
 *   'generic' — a product role whose title names no domain at all
 *   'reject'  — not a product role, or carrying a disqualifying keyword
 *
 * The distinction matters. A bare "Senior Product Manager" is not a negative
 * signal, it is the ABSENCE of a signal, and treating the two the same silently
 * discards real roles: a coverage audit on 2026-08-03 found nine relevant
 * postings (Bynder, Teya, Secfi, Quinyx, Finom, Iterable, Bloomreach, Toptal,
 * Smartex) dropped purely for having uninformative titles. Callers keep
 * 'generic' and let a later, better-informed layer judge it.
 */
export function classifyTitle(titleFilter) {
  const positive = (titleFilter?.positive || []).map(k => k.toLowerCase());
  const negative = (titleFilter?.negative || []).map(k => k.toLowerCase());
  // role_gate: the title must look like a product role at all. Without this,
  // broad topic keywords ("AI", "Agent") pull in engineers, advocates and marketers.
  const roleGate = (titleFilter?.role_gate || []).map(k => k.toLowerCase());

  return (title) => {
    const lower = (title || '').toLowerCase();
    if (roleGate.length > 0 && !roleGate.some(k => lower.includes(k))) return 'reject';
    if (negative.some(k => lower.includes(k))) return 'reject';
    if (positive.length === 0 || positive.some(k => lower.includes(k))) return 'pass';
    return 'generic';
  };
}

/** Boolean form, kept for callers that only want pass/fail (scan.mjs). */
export function buildTitleFilter(titleFilter) {
  const classify = classifyTitle(titleFilter);
  return (title) => classify(title) === 'pass';
}

// ── URL canonicalization ────────────────────────────────────────────

/**
 * LinkedIn serves the same posting under many URLs: country subdomains
 * (de./www./uk.), slugged paths, and tracking query strings. Dedup has to key
 * on the numeric job ID or the same role reappears every scan.
 */
export function linkedinJobId(url) {
  if (!url || !/linkedin\.com/i.test(url)) return null;
  const m =
    url.match(/\/jobs\/view\/(?:[^/?#]*-)?(\d{6,})/i) ||
    url.match(/currentJobId=(\d{6,})/i) ||
    url.match(/urn:li:jobPosting:(\d{6,})/i);
  return m ? m[1] : null;
}

export function canonicalLinkedInUrl(jobId) {
  return `https://www.linkedin.com/jobs/view/${jobId}`;
}

/** Every key a URL should be remembered under. */
export function dedupKeys(url) {
  const keys = [url];
  const id = linkedinJobId(url);
  if (id) keys.push(`li:${id}`);
  return keys;
}

// ── Dedup ───────────────────────────────────────────────────────────

export function loadSeenUrls() {
  const seen = new Set();
  const add = (url) => dedupKeys(url).forEach(k => seen.add(k));

  if (existsSync(SCAN_HISTORY_PATH)) {
    for (const line of readFileSync(SCAN_HISTORY_PATH, 'utf-8').split('\n').slice(1)) {
      const url = line.split('\t')[0];
      if (url) add(url);
    }
  }

  // Match ANY url in pipeline.md, not just "- [ ]" lines. Entries arrive as bare
  // URLs too (pasted by hand, or written by an older scanner), and missing them
  // means re-adding roles that are already queued.
  for (const path of [PIPELINE_PATH, ...APPLICATIONS_PATHS]) {
    if (!existsSync(path)) continue;
    const text = readFileSync(path, 'utf-8');
    for (const match of text.matchAll(/https?:\/\/[^\s|)\]]+/g)) {
      add(match[0].replace(/[.,]+$/, ''));
    }
  }

  return seen;
}

export function loadSeenCompanyRoles() {
  const seen = new Set();

  for (const path of APPLICATIONS_PATHS) {
    if (!existsSync(path)) continue;
    const text = readFileSync(path, 'utf-8');
    for (const match of text.matchAll(/\|[^|]+\|[^|]+\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|/g)) {
      const company = match[1].trim().toLowerCase();
      const role = match[2].trim().toLowerCase();
      if (company && role && company !== 'company') seen.add(`${company}::${role}`);
    }
  }

  // Also index the pending inbox. One opening is commonly reachable through two
  // sources — its Greenhouse URL and its LinkedIn URL — so URL dedup alone lets
  // the second scanner re-add a role the first already queued.
  if (existsSync(PIPELINE_PATH)) {
    for (const line of readFileSync(PIPELINE_PATH, 'utf-8').split('\n')) {
      if (!line.trim().startsWith('- [')) continue;
      const entry = parsePipelineLine(line.trim());
      if (!entry) continue;
      const company = entry.company.toLowerCase();
      const role = entry.title.toLowerCase();
      if (company && role) seen.add(`${company}::${role}`);
    }
  }

  // And the scan history, which is the only record that survives a role leaving
  // the inbox. Without it, anything cleared by `triage.mjs --drain` loses its
  // company+role key and comes straight back the moment the board re-serves the
  // same opening under a new posting id — which N26 does for every city it
  // lists a req in.
  if (existsSync(SCAN_HISTORY_PATH)) {
    for (const line of readFileSync(SCAN_HISTORY_PATH, 'utf-8').split('\n').slice(1)) {
      const [, , , title, company] = line.split('\t');
      if (!company || !title) continue;
      seen.add(`${company.trim().toLowerCase()}::${title.trim().toLowerCase()}`);
    }
  }

  return seen;
}

export function isSeen(seen, url, company, title, seenRoles) {
  if (dedupKeys(url).some(k => seen.has(k))) return true;
  return seenRoles.has(`${company.toLowerCase()}::${title.toLowerCase()}`);
}

export function markSeen(seen, seenRoles, url, company, title) {
  dedupKeys(url).forEach(k => seen.add(k));
  seenRoles.add(`${company.toLowerCase()}::${title.toLowerCase()}`);
}

// ── Pipeline line format ────────────────────────────────────────────
//
// A pipeline line is `- [ ] url | company | title | location | markers…`, so
// the pipe is the field separator. Escaping and splitting live in
// markdown-core.mjs, shared with the tracker files that use the same
// convention. Only the line's own shape is decided here.

const PIPELINE_MARKER = /^(tier [SABC]|posted \d{4}-\d{2}-\d{2}|title-generic)$/;

/**
 * Parse one `- [ ]` pipeline line into its fields.
 *
 * Trailing markers (tier / posted / title-generic) have fixed shapes, so they
 * are pulled off first from any position. What remains is url, company, title
 * and an optional location. Extra fields there mean an unescaped legacy line:
 * fold them into the title rather than into the location, because a split
 * title is the common case and the domain half is the part worth keeping.
 */
export function parsePipelineLine(line) {
  const parts = splitRow(line);
  const url = (parts[0].match(/https?:\/\/\S+/) || [])[0];
  if (!url || parts.length < 3) return null;

  const markers = [];
  for (let i = parts.length - 1; i >= 3; i--) {
    if (PIPELINE_MARKER.test(parts[i])) markers.unshift(...parts.splice(i, 1));
  }

  const tier = (markers.find(m => m.startsWith('tier ')) || '').replace('tier ', '') || null;
  const posted = (markers.find(m => m.startsWith('posted ')) || '').replace('posted ', '') || '';
  const titleGeneric = markers.includes('title-generic');

  // parts is now [url, company, title…, location?]. A bare three-field line
  // carries no location, so never let the title be read as one.
  const location = parts.length > 3 ? parts.pop() : '';
  const title = parts.slice(2).join(' | ');

  return { url, company: parts[1], title, location, tier, posted, titleGeneric };
}

// ── Writers ─────────────────────────────────────────────────────────

function formatOfferLine(o) {
  const parts = [o.url, escapeCell(o.company), escapeCell(o.title)];
  if (o.location) parts.push(escapeCell(o.location));
  if (o.tier) parts.push(`tier ${o.tier}`);
  if (o.posted) parts.push(`posted ${o.posted}`);
  // Marks a title that named no target domain. triage.mjs buckets these apart
  // so they never dilute the worth-evaluating list.
  if (o.titleGeneric) parts.push('title-generic');
  return `- [ ] ${parts.join(' | ')}`;
}

export function appendToPipeline(offers) {
  if (offers.length === 0) return;

  let text = existsSync(PIPELINE_PATH)
    ? readFileSync(PIPELINE_PATH, 'utf-8')
    : '# Pipeline — Pending Evaluation\n';

  const block = offers.map(formatOfferLine).join('\n');
  const idx = text.indexOf(PIPELINE_SECTION);

  if (idx === -1) {
    // Create the section directly under the H1 so new offers stay at the top.
    const firstBreak = text.indexOf('\n\n');
    const insertAt = firstBreak === -1 ? text.length : firstBreak + 2;
    text = `${text.slice(0, insertAt)}${PIPELINE_SECTION}\n\n${block}\n\n${text.slice(insertAt)}`;
  } else {
    const afterMarker = idx + PIPELINE_SECTION.length;
    const nextSection = text.indexOf('\n## ', afterMarker);
    const insertAt = nextSection === -1 ? text.length : nextSection;
    text = `${text.slice(0, insertAt).replace(/\s+$/, '')}\n${block}\n${text.slice(insertAt)}`;
  }

  writeFileSync(PIPELINE_PATH, text, 'utf-8');
}

export function appendToScanHistory(offers, date) {
  if (offers.length === 0) return;
  if (!existsSync(SCAN_HISTORY_PATH)) {
    writeFileSync(SCAN_HISTORY_PATH, 'url\tfirst_seen\tportal\ttitle\tcompany\tstatus\n', 'utf-8');
  }
  const lines = offers
    .map(o => `${o.url}\t${date}\t${o.source}\t${o.title}\t${o.company}\tadded`)
    .join('\n') + '\n';
  appendFileSync(SCAN_HISTORY_PATH, lines, 'utf-8');
}

// ── Fetch helpers ───────────────────────────────────────────────────

export const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

export async function fetchWithTimeout(url, { timeoutMs = 10_000, headers = {} } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers });
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return res;
  } finally {
    clearTimeout(timer);
  }
}

export const sleep = (ms) => new Promise(r => setTimeout(r, ms));
