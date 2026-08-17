# Mode: pdf — ATS-Optimized PDF Generation

## ATS Rules & Strict Formatting (MANDATORY)

- **Single-Column Layout**: No sidebars, no parallel columns, no tables. All content flows vertically.
- **Standard Hierarchy**: Professional Summary, Work Experience, Skills, Education, Languages. Do not create custom sections like "Core Competencies" unless they are integrated under Skills.
- **Experience Header**: Exact format `[Company Name] | [Job Title] | [Dates] | [Location]`.
- **Context Line**: Each role must include a `Product: [Brief 1-2 line description]` line immediately after the header and before the bullets.
- **Linear Skills Section**: Comma-separated list categorized by domain (e.g., Tools: Jira, Figma, etc.). No tables.
- **Metrics Focus**: Retain and highlight ALL KPIs and quantitative achievements from the original CV.
- **Humanize AI Text**: Use the `humanize-ai-text` skill to ensure keyword integration is natural and does not sound robotic.

## Full Pipeline

1. Read `cv.md` as the source of truth.
1b. Read `article-digest.md` for exact product names and proof points.
2. Ask the user for the JD if it is not in context.
3. Detect role archetype. Read the base CV with the JD in mind — identify what is already strong, what is underemphasized, and what is genuinely absent.
4. Define paper format (Letter for US/CA, A4 for rest of world).
5. Apply tailoring (see Tailoring Philosophy below).
6. Generate full HTML using the master as the structural base.
7. Generate PDF using `generate-pdf.mjs`.

## PDF Design (Visual match PDF 2)

- **Fonts**: Space Grotesk (headings) + DM Sans (body).
- **Header**: Name 28px bold, thin gradient line, contact row separated by pipes `|`.
- **Section Headers**: 12px bold, uppercase, subtle bottom border.
- **Company names**: Accent purple color `hsl(270,70%,45%)` in experience headers.
- **Product context**: Italic or font-weight 500 to differentiate from bullets.
- **Margins**: 0.6in.

## Section Order (optimized for "6-second recruiter scan")

1. Header (Large name, gradient, contact info)
2. Professional Summary (2-3 lines, honest and direct)
3. Work Experience (Reverse chronological)
4. Skills (Technical + Domain)
5. Education & Certifications
6. Projects (Top 3-4 most relevant - Optional, only if space permits)

## Tailoring Philosophy (MANDATORY)

The base CV is the authentic record. Tailoring adjusts what signals the reader sees first — not what the candidate has done. A good tailoring change is one where the information was already there, the framing becomes truer or more specific for this context, and the CV still reads as the same person after the change. If a change requires inventing something, rewriting what was there, or importing JD language that doesn't reflect the actual work — it is not a tailoring change, it is a corruption of the document.

The test for any individual change: is this surfacing something true that the reader would otherwise miss, or is it manufacturing relevance that isn't there?

## HTML Template

Use the template in `cv-template.html`. Replace placeholders `{{...}}` with personalized content:

| Placeholder | Content |
|-------------|-----------|
| `{{LANG}}` | `en` |
| `{{PAGE_WIDTH}}` | `8.5in` (letter) or `210mm` (A4) |
| `{{NAME}}` | (from profile.yml) |
| `{{PHONE}}` | (from profile.yml) |
| `{{EMAIL}}` | (from profile.yml) |
| `{{LINKEDIN_URL}}` | [from profile.yml] |
| `{{LINKEDIN_DISPLAY}}` | [from profile.yml] |
| `{{LOCATION}}` | [from profile.yml] |
| `{{SECTION_SUMMARY}}` | Professional Summary |
| `{{SUMMARY_TEXT}}` | Personalized summary with keywords |
| `{{SECTION_EXPERIENCE}}` | Work Experience |
| `{{EXPERIENCE}}` | HTML for each job with reordered bullets |
| `{{SECTION_EDUCATION}}` | Education |
| `{{EDUCATION}}` | HTML for education |
| `{{SECTION_SKILLS}}` | Skills & Competencies |
| `{{SKILLS}}` | HTML for skills (Linear list) |

## Output File Structure

All generated files go into `output/{company-slug}/`:

```
output/{company-slug}/
├── {Name} - {Role Title}.md      # Source MD for iteration
├── {Name} - {Role Title}.pdf      # Final CV PDF
└── {Name} - Cover Letter.pdf      # Cover letter PDF (when generated)
```

Example:
```
output/snowflake/
├── {Your Name} - {Standard Title}.md
├── {Your Name} - {Standard Title}.pdf
└── {Your Name} - Cover Letter.pdf

output/helsing/
├── {Your Name} - {Variant Title}.md
└── {Your Name} - {Variant Title}.pdf
```

## PDF Generation

1. Generate the MD source file in `output/{company-slug}/`
2. Read the MD and convert to HTML for PDF generation
   - Currently manual: copy `templates/cv-template.html`, populate sections from MD
   - Maintain placeholders: `{{NAME}}`, `{{EMAIL}}`, `{{LINKEDIN_URL}}`, etc.
3. Create the PDF using `generate-pdf.mjs`:
```bash
node generate-pdf.mjs "output/{company-slug}/{Name} - {Role Title}.html" "output/{company-slug}/{Name} - {Role Title}.pdf" --format=a4
```

## Canva CV Generation (optional)

If `config/profile.yml` has `canva_resume_design_id` set, offer the user a choice before generating:
- **"HTML/PDF (fast, ATS-optimized)"** — existing flow above
- **"Canva CV (visual, design-preserving)"** — new flow below

If the user has no `canva_resume_design_id`, skip this prompt and use the HTML/PDF flow.

### Canva workflow

#### Step 1 — Duplicate the base design

a. `export-design` the base design (using `canva_resume_design_id`) as PDF → get download URL
b. `import-design-from-url` using that download URL → creates a new editable design (the duplicate)
c. Note the new `design_id` for the duplicate

#### Step 2 — Read the design structure

a. `get-design-content` on the new design → returns all text elements (richtexts) with their content
b. Map text elements to CV sections by content matching:
   - Look for the candidate's name → header section
   - Look for "Summary" or "Professional Summary" → summary section
   - Look for company names from cv.md → experience sections
   - Look for degree/school names → education section
   - Look for skill keywords → skills section
c. If mapping fails, show the user what was found and ask for guidance

#### Step 3 — Generate tailored content

Same content generation as the HTML flow (Steps 1-11 above):
- Rewrite Professional Summary with JD keywords + exit narrative
- Reorder experience bullets by JD relevance
- Select top competencies from JD requirements
- Inject keywords naturally (NEVER invent)

**IMPORTANT — Character budget rule:** Each replacement text MUST be approximately the same length as the original text it replaces (within ±15% character count). If tailored content is longer, condense it. The Canva design has fixed-size text boxes — longer text causes overlapping with adjacent elements. Count the characters in each original element from Step 2 and enforce this budget when generating replacements.

#### Step 4 — Apply edits

a. `start-editing-transaction` on the duplicate design
b. `perform-editing-operations` with `find_and_replace_text` for each section:
   - Replace summary text with tailored summary
   - Replace each experience bullet with reordered/rewritten bullets
   - Replace competency/skills text with JD-matched terms
   - Replace project descriptions with top relevant projects
c. **Reflow layout after text replacement:**
   After applying all text replacements, the text boxes auto-resize but neighboring elements stay in place. This causes uneven spacing between work experience sections. Fix this:
   1. Read the updated element positions and dimensions from the `perform-editing-operations` response
   2. For each work experience section (top to bottom), calculate where the bullets text box ends: `end_y = top + height`
   3. The next section's header should start at `end_y + consistent_gap` (use the original gap from the template, typically ~30px)
   4. Use `position_element` to move the next section's date, company name, role title, and bullets elements to maintain even spacing
   5. Repeat for all work experience sections
d. **Verify layout before commit:**
   - `get-design-thumbnail` with the transaction_id and page_index=1
   - Visually inspect the thumbnail for: text overlapping, uneven spacing, text cut off, text too small
   - If issues remain, adjust with `position_element`, `resize_element`, or `format_text`
   - Repeat until layout is clean
d. Show the user the final preview and ask for approval
e. `commit-editing-transaction` to save (ONLY after user approval)

#### Step 5 — Export and download PDF

a. `export-design` the duplicate as PDF (format: a4 or letter based on JD location)
b. **IMMEDIATELY** download the PDF using Bash:
   ```bash
   curl -sL -o "output/{company-slug}/{Name} - {Role Title}.pdf" "{download_url}"
   ```
   The export URL is a pre-signed S3 link that expires in ~2 hours. Download it right away.
c. Verify the download:
   ```bash
   file "output/{company-slug}/{Name} - {Role Title}.pdf"
   ```
   Must show "PDF document". If it shows XML or HTML, the URL expired — re-export and retry.
d. Report: PDF path, file size, Canva design URL (for manual tweaking)

#### Error handling

- If `import-design-from-url` fails → fall back to HTML/PDF pipeline with message
- If text elements can't be mapped → warn user, show what was found, ask for manual mapping
- If `find_and_replace_text` finds no matches → try broader substring matching
- Always provide the Canva design URL so the user can edit manually if auto-edit fails

## Pre-save Checklist (run before writing output files)

1. **Forbidden terms**: Scan the Skills section for "Portfolio Management" — remove if present, replace with "Roadmap Planning" or "Technical Discovery".
2. **Header format**: Every experience entry must follow `Company | Title | Dates | Location` — no variations.
3. **Recent roles need metrics**: your two most recent roles must each carry at least one real outcome metric (adoption, coverage, conversion, time saved). If the source `cv.md` has no metric, add a directional signal rather than leaving bullets 100% qualitative.
4. **Authenticity**: No skill added that the candidate doesn't have. Only reformulate real experience.
5. **Proof point verification**: Confirm summary uses exact product names from article-digest.md (e.g., "Agent Gateway" not "AI assistant"), not generic terms.
6. **Metric check**: Verify any eval/metric claims include numeric thresholds from article-digest.md (>20%, >80%, etc.).
7. **JD language mirror**: Verify closing summary includes working-style language that mirrors the JD (e.g., "bias toward building and iterating quickly" if present in JD).

## Post-generation

Update tracker if the offer is already registered: change PDF from ❌ to ✅.
