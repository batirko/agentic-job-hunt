/**
 * match-core.mjs — Shared company/role matching for career-ops tracker writes
 *
 * Two scripts decide whether an incoming row is "the same role" as one already
 * in the tracker: merge-tracker.mjs (does this addition open a new row or
 * update an old one?) and dedup-tracker.mjs (are these two rows one role?).
 * They used to carry separate copies of the rule and drifted apart, so the
 * rule lives here.
 *
 * The rule has to hold in both directions:
 *
 *   Over-matching loses data. merge-tracker.mjs drops an addition whose match
 *   already scores higher, so a false match silently discards a real role.
 *   dedup-tracker.mjs collapses the rows outright.
 *
 *   Under-matching duplicates rows, which verify-pipeline.mjs reports and
 *   dedup-tracker.mjs can still clean up. That is the safer failure, so where
 *   the two pull against each other this errs toward keeping rows apart.
 */

/** Company names compare on letters and digits only: "n8n.io" === "N8N io". */
export function normalizeCompany(name) {
  return (name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Tokens that almost every role shares — must NOT count as signal.
// Includes seniority, work-mode, contract, and common locations.
const ROLE_STOPWORDS = new Set([
  // generic role nouns — every row in this tracker is a PM role, so these
  // carry no signal. Without them a short title like "Senior Product Manager
  // (YouTrack)" matches any other "Product Manager ..." at the same company
  // on these two words alone.
  'product', 'manager', 'managers', 'management', 'owner',
  // seniority / level
  'junior', 'mid', 'middle', 'senior', 'staff', 'principal', 'lead', 'head',
  'chief', 'associate', 'intern', 'entry', 'level', 'sr', 'snr', 'jr',
  'ii', 'iii', 'iv', 'vp',
  // abbreviations of the stem above — the tracker is written by hand and
  // shortens the title, the posting spells it out.
  'pm', 'po', 'tpm', 'apm', 'gpm',
  // contract / mode
  'remote', 'hybrid', 'onsite', 'contract', 'contractor', 'freelance',
  'fulltime', 'parttime', 'permanent', 'temporary', 'intern', 'internship',
  // generic job words
  'role', 'position', 'opportunity', 'team', 'based', 'job', 'genders',
  // very common locations (extend in portals.yml later if needed)
  'bangalore', 'bengaluru', 'mumbai', 'delhi', 'hyderabad', 'pune', 'chennai',
  'london', 'berlin', 'paris', 'madrid', 'barcelona', 'amsterdam', 'dublin',
  'york', 'francisco', 'seattle', 'boston', 'austin', 'chicago', 'toronto',
  'tokyo', 'singapore', 'sydney', 'melbourne', 'lisbon', 'warsaw', 'vienna',
  // regions / countries
  'europe', 'emea', 'apac', 'latam', 'americas', 'india', 'spain', 'germany',
  'france', 'italy', 'canada', 'brazil', 'mexico', 'japan', 'israel',
  // function words. The tokenizer keeps two-letter tokens so that domain
  // qualifiers survive ("AI", "ML", "UX"), which lets these through unless
  // they are named.
  'and', 'for', 'the', 'of', 'in', 'at', 'to', 'on', 'or', 'an', 'as', 'by',
  'its', 'our', 'all', 'new', 'per', 'via', 'de', 'la', 'el', 'du', 'der',
  'die', 'das', 'und', 'fur', 'mit', 'im', 'am',
  'with', 'from', 'into', 'over', 'this', 'that',
]);

/**
 * The distinguishing tokens of a title: what is left after the shared stem.
 *
 * Two-letter tokens are kept on purpose. The qualifier that separates
 * "AI Senior Product Manager" from "Product Manager - Infrastructure
 * Monitoring" at the same company is often exactly two characters, and a
 * longer filter erased it — leaving both titles with no signal at all.
 */
export function roleTokens(s) {
  return (s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2 && !/^\d+$/.test(w) && !ROLE_STOPWORDS.has(w));
}

/** Every word of a title, stem included, order-independent. */
function stemKey(s) {
  return (s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ');
}

/**
 * Are these two titles the same role? Assumes the caller already matched the
 * company — this compares titles only.
 *
 * A company running several openings at once is the case that decides the
 * rule. One employer can have five product roles live at the same time, and
 * the shared stem ("Product Manager") is identical across all of them, so the
 * domain qualifier is the only thing that separates them.
 */
export function roleFuzzyMatch(a, b) {
  const wordsA = roleTokens(a);
  const wordsB = roleTokens(b);

  // Neither title carries a qualifier ("Senior Product Manager"). There is
  // nothing distinguishing to compare, so fall back to the whole title:
  // identical titles are still the same role, and anything else is not.
  if (wordsA.length === 0 || wordsB.length === 0) {
    const keyA = stemKey(a);
    return keyA !== '' && keyA === stemKey(b);
  }

  const setA = new Set(wordsA);
  const setB = new Set(wordsB);
  const exclusiveA = [...setA].some(w => !setB.has(w));
  const exclusiveB = [...setB].some(w => !setA.has(w));

  // Same qualifiers, however the title was written around them. This is the
  // case that has to keep working: the tracker abbreviates and the posting
  // spells out, so "Senior PM, AI" and "Senior Product Manager - AI" are one
  // role, as are "Senior Product Manager (YouTrack)" and "PM, YouTrack".
  if (!exclusiveA && !exclusiveB) return true;

  // Both sides name something the other does not. Two different roles:
  //
  //   "AI Agents (Config & Personalization)" vs "AI Agents Testing"
  //   "Product Owner AI Platform"            vs "Product Owner Data Platform"
  //
  // A shared prefix is not agreement — the differentiator has to agree too,
  // and here it disagrees. The old rule counted shared tokens and called
  // two-of-three close enough, which merged both of these pairs.
  if (exclusiveA && exclusiveB) return false;

  // One side is the other plus more detail. That is the same title enriched
  // ("Technical PM - GenAI Platforms" vs "... GenAI Platforms & Integrations")
  // ONLY when the shorter side is specific enough to mean something on its
  // own. A lone qualifier is not: "Senior Product Manager, AI" would otherwise
  // swallow every other AI role the company has open, which at SIXT is three.
  return Math.min(setA.size, setB.size) >= 2;
}

/** The leading `[123]` of a report link, or null. */
export function extractReportNum(reportStr) {
  const m = (reportStr ?? '').match(/\[(\d+)\]/);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * The tracker row an incoming addition belongs to, or null to open a new one.
 *
 * Company agreement is required on BOTH paths. Report numbers are not unique
 * keys (CLAUDE.md §"Pipeline Integrity"): concurrent sessions have handed the
 * same number to different companies, and matching on the number alone let an
 * addition resolve to an unrelated employer's row, losing the evaluation.
 */
export function findDuplicate(apps, addition) {
  const normCompany = normalizeCompany(addition.company);
  const sameCompany = apps.filter(app => normalizeCompany(app.company) === normCompany);
  if (sameCompany.length === 0) return null;

  const reportNum = extractReportNum(addition.report);
  if (reportNum !== null) {
    const byNum = sameCompany.find(app => extractReportNum(app.report) === reportNum);
    if (byNum) return byNum;
  }

  return sameCompany.find(app => roleFuzzyMatch(addition.role, app.role)) || null;
}
