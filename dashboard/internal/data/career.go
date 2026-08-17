package data

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/batirko/agentic-job-hunt/dashboard/internal/model"
)

var (
	reReportLink     = regexp.MustCompile(`\[(\d+)\]\(([^)]+)\)`)
	reScoreValue     = regexp.MustCompile(`(\d+\.?\d*)/5`)
	reArchetype      = regexp.MustCompile(`(?i)\*\*Arquetipo(?:\s+detectado)?\*\*\s*\|\s*(.+)`)
	reTlDr           = regexp.MustCompile(`(?i)\*\*TL;DR\*\*\s*\|\s*(.+)`)
	reTlDrColon      = regexp.MustCompile(`(?i)\*\*TL;DR:\*\*\s*(.+)`)
	reRemote         = regexp.MustCompile(`(?i)\*\*Remote\*\*\s*\|\s*(.+)`)
	reComp           = regexp.MustCompile(`(?i)\*\*Comp\*\*\s*\|\s*(.+)`)
	reArchetypeColon = regexp.MustCompile(`(?i)\*\*Arquetipo:\*\*\s*(.+)`)
	reReportURL      = regexp.MustCompile(`(?m)^\*\*URL:\*\*\s*(https?://\S+)`)
	reBatchID        = regexp.MustCompile(`(?m)^\*\*Batch ID:\*\*\s*(\d+)`)
)

// trackerFiles returns every file holding tracker rows, live file first.
//
// The tracker is split in two. applications.md holds the rows a decision is
// still owed on (evaluated, in conversation, sent) and applications-archive.md
// holds the closed ones (skip, rejected, discarded, ignored). Both use the same
// schema. The dashboard reports on the whole record, so it reads both: the
// archive is where the rejections and the silences live, and a funnel computed
// without them is meaningless.
//
// Both layouts the project has shipped are supported: files under data/
// (current) and in the project root (original).
func trackerFiles(careerOpsPath string) []string {
	var files []string
	for _, name := range []string{"applications.md", "applications-archive.md"} {
		for _, dir := range []string{careerOpsPath, filepath.Join(careerOpsPath, "data")} {
			p := filepath.Join(dir, name)
			if _, err := os.Stat(p); err == nil {
				files = append(files, p)
				break
			}
		}
	}
	return files
}

// The tracker's column layout is read from the table's own header row, never
// hardcoded. The schema has changed over time and both layouts still exist in
// the wild:
//
//	canonical: | Date | Company | Role | Fit | Odds | Priority | Status |
//	             Output | Report | Location | Reasoning | URL |
//	legacy:    | # | Date | Company | Role | Score | Status | PDF | Report | Notes |
//
// Hardcoding offsets is what broke this parser before: the legacy positions
// survived the schema change, so every field read was off by one and the
// dashboard displayed the Priority column as the status. tracker-core.mjs maps
// header labels to fields for the same reason -- keep the two in sync.
var trackerHeaderFields = map[string]string{
	"#": "num", "num": "num",
	"date": "date", "fecha": "date",
	"company": "company", "empresa": "company",
	"role": "role", "puesto": "role", "position": "role",
	"fit":      "fit",
	"odds":     "odds",
	"priority": "priority", "prioridad": "priority",
	"score": "score", "puntuacion": "score",
	"status": "status", "estado": "status",
	"output": "output", "pdf": "output",
	"report": "report", "informe": "report",
	"location": "location", "ubicacion": "location",
	"reasoning": "notes", "notes": "notes", "notas": "notes", "razonamiento": "notes",
	"url": "url", "link": "url",
}

// Positional fallbacks, used only when no header row is recognizable.
//
// Indices are 0-based: splitTrackerRow drops the empty cells the outer pipes
// create, so the first real column is 0. tracker-core.mjs keeps the leading
// empty cell, so its numbers are all one higher.
var (
	canonicalPositions = map[string]int{
		"date": 0, "company": 1, "role": 2, "fit": 3, "odds": 4, "priority": 5,
		"status": 6, "output": 7, "report": 8, "location": 9, "notes": 10, "url": 11,
	}
	legacyPositions = map[string]int{
		"num": 0, "date": 1, "company": 2, "role": 3, "score": 4, "status": 5,
		"output": 6, "report": 7, "notes": 8,
	}
)

var (
	// A separator row is written "| --- | --- |" with spaces, not "|---|---|".
	// Matching on a "|---" prefix missed it, and the row was counted as an
	// application.
	reSeparatorRow  = regexp.MustCompile(`^\|[\s:|-]+\|?\s*$`)
	reTrackerDate   = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)
	reScoreCell     = regexp.MustCompile(`^\*{0,2}\d+(\.\d+)?/5\*{0,2}$`)
	reNonLabelChars = regexp.MustCompile(`[^a-z#]`)
)

// normalizeHeaderLabel reduces a header cell to its bare label for lookup.
func normalizeHeaderLabel(s string) string {
	s = strings.ReplaceAll(s, "**", "")
	return reNonLabelChars.ReplaceAllString(strings.ToLower(strings.TrimSpace(s)), "")
}

// isSeparatorRow reports whether a line is the table's ---|--- rule.
func isSeparatorRow(line string) bool {
	return reSeparatorRow.MatchString(strings.TrimSpace(line))
}

// splitTrackerRow splits one table row into trimmed cells.
//
// A literal pipe inside a cell is written `\|` -- the markdown convention
// markdown-core.mjs writes -- and real job data is full of them ("Senior PM
// (m\|w\|d)"). Splitting on every pipe shifts each field after the first one,
// so escaped pipes are unescaped in place instead of separating cells.
//
// The "| " + tab layout some older batch writers produced is also accepted.
func splitTrackerRow(line string) []string {
	line = strings.TrimSpace(line)

	if strings.Contains(line, "\t") {
		body := strings.TrimSpace(strings.TrimPrefix(line, "|"))
		fields := make([]string, 0, strings.Count(body, "\t")+1)
		for _, p := range strings.Split(body, "\t") {
			fields = append(fields, strings.TrimSpace(strings.Trim(p, "|")))
		}
		return fields
	}

	cells := make([]string, 0, 12)
	var cur strings.Builder
	for i := 0; i < len(line); i++ {
		switch {
		case line[i] == '\\' && i+1 < len(line) && line[i+1] == '|':
			cur.WriteByte('|')
			i++
		case line[i] == '|':
			cells = append(cells, strings.TrimSpace(cur.String()))
			cur.Reset()
		default:
			cur.WriteByte(line[i])
		}
	}
	cells = append(cells, strings.TrimSpace(cur.String()))

	// Drop only the empty cells the outer pipes create, never an empty cell
	// between two real ones.
	if strings.HasPrefix(line, "|") && len(cells) > 1 {
		cells = cells[1:]
	}
	if strings.HasSuffix(line, "|") && !strings.HasSuffix(line, `\|`) && len(cells) > 1 {
		cells = cells[:len(cells)-1]
	}
	return cells
}

// detectTrackerColumns builds a field -> column-index map from the table header.
//
// The header is the pipe row immediately followed by the separator row. A file
// whose header names neither Status nor Company is not a tracker table.
func detectTrackerColumns(lines []string) map[string]int {
	for i, line := range lines {
		trimmed := strings.TrimSpace(line)
		if !strings.HasPrefix(trimmed, "|") || isSeparatorRow(trimmed) {
			continue
		}
		if i+1 >= len(lines) || !isSeparatorRow(lines[i+1]) {
			continue
		}

		columns := make(map[string]int)
		for c, cell := range splitTrackerRow(trimmed) {
			field, ok := trackerHeaderFields[normalizeHeaderLabel(cell)]
			if !ok {
				continue
			}
			if _, seen := columns[field]; !seen {
				columns[field] = c
			}
		}
		_, hasStatus := columns["status"]
		_, hasCompany := columns["company"]
		if hasStatus && hasCompany {
			return columns
		}
	}
	return nil
}

// detectColumnsByShape guesses the layout from a row when the header is missing.
func detectColumnsByShape(cells []string) map[string]int {
	if len(cells) > 3 && reTrackerDate.MatchString(cells[0]) && reScoreCell.MatchString(cells[3]) {
		return canonicalPositions
	}
	if len(cells) > 1 && reTrackerDate.MatchString(cells[1]) {
		if _, err := strconv.Atoi(cells[0]); err == nil {
			return legacyPositions
		}
	}
	return nil
}

// cellAt returns the value of a mapped field, or "" when the column is absent.
func cellAt(cells []string, columns map[string]int, field string) string {
	idx, ok := columns[field]
	if !ok || idx >= len(cells) {
		return ""
	}
	return cells[idx]
}

// reportPathFromTracker rewrites a report link to a careerOpsPath-relative path.
//
// Links are written relative to the tracker file, which lives in data/, so
// "../reports/x.md" points at the project root's reports/ directory. Every
// consumer joins the path onto careerOpsPath, so it is rebased here once
// instead of at each call site.
func reportPathFromTracker(link, trackerFile, careerOpsPath string) string {
	if link == "" {
		return ""
	}
	abs := filepath.Join(filepath.Dir(trackerFile), link)
	rel, err := filepath.Rel(careerOpsPath, abs)
	if err != nil || strings.HasPrefix(rel, "..") {
		return link
	}
	return rel
}

// ParseApplications reads the tracker files and returns parsed applications.
func ParseApplications(careerOpsPath string) []model.CareerApplication {
	files := trackerFiles(careerOpsPath)
	if len(files) == 0 {
		return nil
	}

	apps := make([]model.CareerApplication, 0)

	for _, file := range files {
		content, err := os.ReadFile(file)
		if err != nil {
			continue
		}
		lines := strings.Split(string(content), "\n")
		headerColumns := detectTrackerColumns(lines)

		for _, line := range lines {
			trimmed := strings.TrimSpace(line)
			if !strings.HasPrefix(trimmed, "|") || isSeparatorRow(trimmed) {
				continue
			}

			cells := splitTrackerRow(trimmed)
			columns := headerColumns
			if columns == nil {
				columns = detectColumnsByShape(cells)
			}
			if columns == nil {
				continue
			}

			// The Date column is what separates a data row from the header row
			// and from any prose the file carries above the table.
			date := cellAt(cells, columns, "date")
			company := cellAt(cells, columns, "company")
			if !reTrackerDate.MatchString(date) || company == "" {
				continue
			}

			// Fit is the canonical primary score; Score is its legacy name.
			scoreRaw := cellAt(cells, columns, "fit")
			if scoreRaw == "" {
				scoreRaw = cellAt(cells, columns, "score")
			}
			output := cellAt(cells, columns, "output")

			app := model.CareerApplication{
				Date:     date,
				Company:  company,
				Role:     cellAt(cells, columns, "role"),
				Status:   cellAt(cells, columns, "status"),
				ScoreRaw: scoreRaw,
				Notes:    cellAt(cells, columns, "notes"),
				// Legacy wrote a bare ✅/❌; the canonical Output column holds
				// a link to the generated folder, or "-" for nothing.
				HasPDF: strings.Contains(output, "✅") || strings.Contains(output, "]("),
			}

			if sm := reScoreValue.FindStringSubmatch(scoreRaw); sm != nil {
				app.Score, _ = strconv.ParseFloat(sm[1], 64)
			}

			// The canonical schema dropped the '#' column; the report link's
			// label carries the same number.
			num, _ := strconv.Atoi(cellAt(cells, columns, "num"))
			if rm := reReportLink.FindStringSubmatch(cellAt(cells, columns, "report")); rm != nil {
				app.ReportNumber = rm[1]
				app.ReportPath = reportPathFromTracker(rm[2], file, careerOpsPath)
				if num == 0 {
					num, _ = strconv.Atoi(rm[1])
				}
			}
			if num == 0 {
				// Neither a '#' column nor a report link: fall back to the row's
				// position so the number is never zero.
				num = len(apps) + 1
			}
			app.Number = num

			// The canonical schema carries the posting URL itself, which beats
			// every heuristic below it.
			if u := cellAt(cells, columns, "url"); strings.HasPrefix(u, "http") {
				app.JobURL = u
			}

			apps = append(apps, app)
		}
	}

	// Enrich with job URLs using 5-tier strategy:
	// 1. **URL:** field in report header (newest reports)
	// 2. **Batch ID:** in report -> batch-input.tsv URL lookup
	// 3. report_num -> batch-state completed mapping (legacy)
	// 4. scan-history.tsv (pipeline scan entries matched by company+role)
	// 5. company name fallback from batch-input.tsv
	batchURLs := loadBatchInputURLs(careerOpsPath)
	reportNumURLs := loadJobURLs(careerOpsPath)

	for i := range apps {
		if apps[i].JobURL != "" || apps[i].ReportPath == "" {
			continue
		}
		fullReport := filepath.Join(careerOpsPath, apps[i].ReportPath)
		reportContent, err := os.ReadFile(fullReport)
		if err != nil {
			continue
		}
		header := string(reportContent)
		// Only scan the header (first 1000 bytes) for speed
		if len(header) > 1000 {
			header = header[:1000]
		}

		// Strategy 1: **URL:** in report
		if m := reReportURL.FindStringSubmatch(header); m != nil {
			apps[i].JobURL = m[1]
			continue
		}

		// Strategy 2: **Batch ID:** -> batch-input.tsv
		if m := reBatchID.FindStringSubmatch(header); m != nil {
			if url, ok := batchURLs[m[1]]; ok {
				apps[i].JobURL = url
				continue
			}
		}

		// Strategy 3: report_num -> batch-state completed mapping
		if reportNumURLs != nil {
			if url, ok := reportNumURLs[apps[i].ReportNumber]; ok {
				apps[i].JobURL = url
				continue
			}
		}
	}

	// Strategy 4: scan-history.tsv (pipeline scan entries matched by company+role)
	enrichFromScanHistory(careerOpsPath, apps)

	// Strategy 5: company name fallback from batch-input.tsv
	enrichAppURLsByCompany(careerOpsPath, apps)

	return apps
}

// loadBatchInputURLs reads batch-input.tsv and returns a map of batch ID -> job URL.
func loadBatchInputURLs(careerOpsPath string) map[string]string {
	inputPath := filepath.Join(careerOpsPath, "batch", "batch-input.tsv")
	inputData, err := os.ReadFile(inputPath)
	if err != nil {
		return nil
	}
	result := make(map[string]string)
	for _, line := range strings.Split(string(inputData), "\n") {
		fields := strings.Split(line, "\t")
		if len(fields) < 4 || fields[0] == "id" {
			continue
		}
		id := fields[0]
		notes := fields[3]
		// Extract real job URL from notes: "Title @ Company | Match% | https://actual-url"
		if idx := strings.LastIndex(notes, "| "); idx >= 0 {
			u := strings.TrimSpace(notes[idx+2:])
			if strings.HasPrefix(u, "http") {
				result[id] = u
				continue
			}
		}
		// Fallback: use JackJill URL
		if strings.HasPrefix(fields[1], "http") {
			result[id] = fields[1]
		}
	}
	return result
}

// batchEntry holds parsed data from batch-input.tsv.
type batchEntry struct {
	id      string
	url     string
	company string
	role    string
}

// loadJobURLs reads batch TSV files and returns a map of report_num -> job URL.
// Uses two strategies: (1) report_num mapping for completed jobs, (2) company name
// matching as fallback for failed/missing jobs.
func loadJobURLs(careerOpsPath string) map[string]string {
	// Read batch-input.tsv: id \t url \t source \t notes
	inputPath := filepath.Join(careerOpsPath, "batch", "batch-input.tsv")
	inputData, err := os.ReadFile(inputPath)
	if err != nil {
		return nil
	}

	// Parse batch-input: extract job URL, company, and role from notes
	entries := make(map[string]batchEntry) // keyed by id
	for _, line := range strings.Split(string(inputData), "\n") {
		fields := strings.Split(line, "\t")
		if len(fields) < 4 || fields[0] == "id" {
			continue
		}
		e := batchEntry{id: fields[0]}
		notes := fields[3]

		// Extract URL from notes: "Title @ Company | Match% | https://actual-url"
		if idx := strings.LastIndex(notes, "| "); idx >= 0 {
			u := strings.TrimSpace(notes[idx+2:])
			if strings.HasPrefix(u, "http") {
				e.url = u
			}
		}
		// Fallback: use JackJill URL from field 1
		if e.url == "" && strings.HasPrefix(fields[1], "http") {
			e.url = fields[1]
		}

		// Extract company and role: "Role @ Company | Match% | URL"
		notesPart := notes
		if pipeIdx := strings.Index(notesPart, " | "); pipeIdx >= 0 {
			notesPart = notesPart[:pipeIdx]
		}
		if atIdx := strings.LastIndex(notesPart, " @ "); atIdx >= 0 {
			e.role = strings.TrimSpace(notesPart[:atIdx])
			e.company = strings.TrimSpace(notesPart[atIdx+3:])
		}

		if e.url != "" {
			entries[fields[0]] = e
		}
	}

	// Read batch-state.tsv: id \t url \t status \t ... \t report_num \t ...
	statePath := filepath.Join(careerOpsPath, "batch", "batch-state.tsv")
	stateData, err := os.ReadFile(statePath)
	if err != nil {
		return nil
	}

	// Strategy 1: map report_num -> URL only for COMPLETED jobs
	reportToURL := make(map[string]string)
	for _, line := range strings.Split(string(stateData), "\n") {
		fields := strings.Split(line, "\t")
		if len(fields) < 6 || fields[0] == "id" {
			continue
		}
		id := fields[0]
		status := fields[2]
		reportNum := fields[5]
		if status != "completed" || reportNum == "" || reportNum == "-" {
			continue
		}
		if e, ok := entries[id]; ok {
			reportToURL[reportNum] = e.url
			if len(reportNum) < 3 {
				reportToURL[fmt.Sprintf("%03s", reportNum)] = e.url
			}
		}
	}

	return reportToURL
}

// scanHistoryPath returns the scan history file, preferring the current
// data/ layout over the original project-root one.
func scanHistoryPath(careerOpsPath string) string {
	inData := filepath.Join(careerOpsPath, "data", "scan-history.tsv")
	if _, err := os.Stat(inData); err == nil {
		return inData
	}
	return filepath.Join(careerOpsPath, "scan-history.tsv")
}

// tsvColumns maps a TSV header row's labels to their column index.
//
// Same reasoning as the tracker table: scan-history.tsv gained a leading date
// column, so any hardcoded offset is one schema change away from reading the
// wrong field.
func tsvColumns(header string) map[string]int {
	columns := make(map[string]int)
	for i, label := range strings.Split(header, "\t") {
		label = strings.ToLower(strings.TrimSpace(label))
		if label == "" {
			continue
		}
		if _, seen := columns[label]; !seen {
			columns[label] = i
		}
	}
	return columns
}

// enrichFromScanHistory fills JobURL from scan-history.tsv by matching company name.
func enrichFromScanHistory(careerOpsPath string, apps []model.CareerApplication) {
	scanData, err := os.ReadFile(scanHistoryPath(careerOpsPath))
	if err != nil {
		return
	}

	lines := strings.Split(string(scanData), "\n")
	if len(lines) == 0 {
		return
	}
	columns := tsvColumns(lines[0])
	urlCol, hasURL := columns["url"]
	companyCol, hasCompany := columns["company"]
	if !hasURL || !hasCompany {
		return
	}
	titleCol, hasTitle := columns["title"]

	// Build company -> URL index from scan-history
	type scanEntry struct {
		url   string
		title string
	}
	byCompany := make(map[string][]scanEntry)
	for _, line := range lines[1:] {
		fields := strings.Split(line, "\t")
		if len(fields) <= urlCol || len(fields) <= companyCol {
			continue
		}
		url := strings.TrimSpace(fields[urlCol])
		if !strings.HasPrefix(url, "http") {
			continue
		}
		title := ""
		if hasTitle && len(fields) > titleCol {
			title = fields[titleCol]
		}
		key := normalizeCompany(fields[companyCol])
		byCompany[key] = append(byCompany[key], scanEntry{url: url, title: title})
	}

	for i := range apps {
		if apps[i].JobURL != "" {
			continue
		}
		key := normalizeCompany(apps[i].Company)
		matches := byCompany[key]
		if len(matches) == 1 {
			apps[i].JobURL = matches[0].url
		} else if len(matches) > 1 {
			// Multiple entries: pick best role match
			appRole := strings.ToLower(apps[i].Role)
			best := matches[0].url
			bestScore := 0
			for _, m := range matches {
				score := 0
				mTitle := strings.ToLower(m.title)
				for _, word := range strings.Fields(appRole) {
					if len(word) > 2 && strings.Contains(mTitle, word) {
						score++
					}
				}
				if score > bestScore {
					bestScore = score
					best = m.url
				}
			}
			apps[i].JobURL = best
		}
	}
}

// normalizeCompany strips common suffixes and lowercases a company name.
func normalizeCompany(name string) string {
	s := strings.ToLower(strings.TrimSpace(name))
	for _, suffix := range []string{" inc.", " inc", " llc", " ltd", " corp", " corporation", " technologies", " technology", " group", " co."} {
		s = strings.TrimSuffix(s, suffix)
	}
	return strings.TrimSpace(s)
}

// enrichAppURLsByCompany fills in JobURL for apps that didn't get one via report_num mapping.
// It matches by company name from batch-input.tsv notes.
func enrichAppURLsByCompany(careerOpsPath string, apps []model.CareerApplication) {
	inputPath := filepath.Join(careerOpsPath, "batch", "batch-input.tsv")
	inputData, err := os.ReadFile(inputPath)
	if err != nil {
		return
	}

	// Build company -> []entry index
	type entry struct {
		role string
		url  string
	}
	byCompany := make(map[string][]entry)
	for _, line := range strings.Split(string(inputData), "\n") {
		fields := strings.Split(line, "\t")
		if len(fields) < 4 || fields[0] == "id" {
			continue
		}
		notes := fields[3]
		var url string
		if idx := strings.LastIndex(notes, "| "); idx >= 0 {
			u := strings.TrimSpace(notes[idx+2:])
			if strings.HasPrefix(u, "http") {
				url = u
			}
		}
		if url == "" && strings.HasPrefix(fields[1], "http") {
			url = fields[1]
		}
		if url == "" {
			continue
		}
		notesPart := notes
		if pipeIdx := strings.Index(notesPart, " | "); pipeIdx >= 0 {
			notesPart = notesPart[:pipeIdx]
		}
		if atIdx := strings.LastIndex(notesPart, " @ "); atIdx >= 0 {
			role := strings.TrimSpace(notesPart[:atIdx])
			company := strings.TrimSpace(notesPart[atIdx+3:])
			key := normalizeCompany(company)
			byCompany[key] = append(byCompany[key], entry{role: role, url: url})
		}
	}

	for i := range apps {
		if apps[i].JobURL != "" {
			continue
		}
		key := normalizeCompany(apps[i].Company)
		matches := byCompany[key]
		if len(matches) == 1 {
			apps[i].JobURL = matches[0].url
		} else if len(matches) > 1 {
			// Multiple entries for same company: pick best role match
			appRole := strings.ToLower(apps[i].Role)
			best := matches[0].url
			bestScore := 0
			for _, m := range matches {
				score := 0
				mRole := strings.ToLower(m.role)
				// Count matching words
				for _, word := range strings.Fields(appRole) {
					if len(word) > 2 && strings.Contains(mRole, word) {
						score++
					}
				}
				if score > bestScore {
					bestScore = score
					best = m.url
				}
			}
			apps[i].JobURL = best
		}
	}
}

// ComputeMetrics calculates aggregate metrics from applications.
func ComputeMetrics(apps []model.CareerApplication) model.PipelineMetrics {
	m := model.PipelineMetrics{
		Total:    len(apps),
		ByStatus: make(map[string]int),
	}

	var totalScore float64
	var scored int

	for _, app := range apps {
		status := NormalizeStatus(app.Status)
		m.ByStatus[status]++

		if app.Score > 0 {
			totalScore += app.Score
			scored++
			if app.Score > m.TopScore {
				m.TopScore = app.Score
			}
		}
		if app.HasPDF {
			m.WithPDF++
		}
		if status != "skip" && status != "rejected" && status != "discarded" && status != "ignored" {
			m.Actionable++
		}
	}

	if scored > 0 {
		m.AvgScore = totalScore / float64(scored)
	}

	return m
}

// statusEmoji maps the canonical status vocabulary to its state id.
//
// The tracker's status column holds an emoji and nothing else -- that is the
// rule states.yml states, and every row in both tracker files follows it. The
// text labels NormalizeStatus also accepts are the older, hand-written form
// that still appears in legacy files.
var statusEmoji = map[string]string{
	"✅": "applied",
	"📬": "responded",
	"🎯": "interview",
	"💰": "offer",
	"❌": "rejected",
	"🚫": "discarded",
	"👻": "ignored",
	"⏭": "skip",
}

// NormalizeStatus normalizes a raw status cell to a canonical state id.
// Aliases match states.yml -- keep in sync with career-ops/states.yml
func NormalizeStatus(raw string) string {
	// Strip markdown bold and the emoji variation selector, which rides along
	// on ⏭️ but not on 👻, so a plain comparison would miss one of them.
	s := strings.ReplaceAll(raw, "**", "")
	s = strings.ReplaceAll(s, "\uFE0F", "")
	s = strings.TrimSpace(s)

	// A blank status is not missing data: it is "evaluated, decision pending".
	if s == "" {
		return "evaluated"
	}
	if id, ok := statusEmoji[s]; ok {
		return id
	}

	s = strings.ToLower(s)
	// Strip trailing date (e.g., "aplicado 2026-03-12")
	if idx := strings.Index(s, " 202"); idx > 0 {
		s = strings.TrimSpace(s[:idx])
	}

	switch {
	// Most restrictive first — accepts both English and Spanish
	case strings.Contains(s, "no aplicar") || strings.Contains(s, "no_aplicar") || s == "skip" || strings.Contains(s, "geo blocker"):
		return "skip"
	case strings.Contains(s, "interview") || strings.Contains(s, "entrevista"):
		return "interview"
	case s == "offer" || strings.Contains(s, "oferta"):
		return "offer"
	case strings.Contains(s, "responded") || strings.Contains(s, "respondido"):
		return "responded"
	case strings.Contains(s, "applied") || strings.Contains(s, "aplicado") || s == "enviada" || s == "aplicada" || s == "sent":
		return "applied"
	case strings.Contains(s, "rejected") || strings.Contains(s, "rechazado") || s == "rechazada":
		return "rejected"
	case strings.Contains(s, "ignored") || strings.Contains(s, "ghosted") || s == "no_response" || s == "no response":
		return "ignored"
	case strings.Contains(s, "discarded") || strings.Contains(s, "descartado") || s == "descartada" || s == "cerrada" || s == "cancelada" ||
		strings.HasPrefix(s, "duplicado") || strings.HasPrefix(s, "dup"):
		return "discarded"
	case strings.Contains(s, "evaluated") || strings.Contains(s, "evaluada") || s == "condicional" || s == "hold" || s == "monitor" || s == "evaluar" || s == "verificar":
		return "evaluated"
	default:
		return s
	}
}

// LoadReportSummary extracts key fields from a report file.
func LoadReportSummary(careerOpsPath, reportPath string) (archetype, tldr, remote, comp string) {
	fullPath := filepath.Join(careerOpsPath, reportPath)
	content, err := os.ReadFile(fullPath)
	if err != nil {
		return
	}
	text := string(content)

	if m := reArchetype.FindStringSubmatch(text); m != nil {
		archetype = cleanTableCell(m[1])
	} else if m := reArchetypeColon.FindStringSubmatch(text); m != nil {
		archetype = cleanTableCell(m[1])
	}

	// Try table-format TL;DR first (most reports), then colon format
	if m := reTlDr.FindStringSubmatch(text); m != nil {
		tldr = cleanTableCell(m[1])
	} else if m := reTlDrColon.FindStringSubmatch(text); m != nil {
		tldr = cleanTableCell(m[1])
	}

	if m := reRemote.FindStringSubmatch(text); m != nil {
		remote = cleanTableCell(m[1])
	}

	if m := reComp.FindStringSubmatch(text); m != nil {
		comp = cleanTableCell(m[1])
	}

	// Truncate long fields
	if len(tldr) > 120 {
		tldr = tldr[:117] + "..."
	}

	return
}

// statusIDEmoji maps a canonical state id to the cell the tracker stores.
// Inverse of statusEmoji, plus the blank cell "evaluated" is written as.
var statusIDEmoji = map[string]string{
	"evaluated": "",
	"applied":   "✅",
	"responded": "📬",
	"interview": "🎯",
	"offer":     "💰",
	"rejected":  "❌",
	"discarded": "🚫",
	"ignored":   "👻",
	"skip":      "⏭️",
}

// canonicalStatusCell converts any accepted spelling of a status to the cell
// the tracker stores.
//
// states.yml is the source of truth: the status column holds one emoji or
// nothing at all, never a text label. The UI's status picker offers labels
// ("Applied", "SKIP"), so the translation happens here rather than at every
// call site. An unrecognized status is rejected instead of written, because the
// blank cell means "evaluated" and silently clearing a status is worse than
// refusing the edit.
func canonicalStatusCell(status string) (string, bool) {
	cell, ok := statusIDEmoji[NormalizeStatus(status)]
	return cell, ok
}

// splitRowRaw splits on unescaped pipes, preserving every cell verbatim.
// Joining the result with "|" reproduces the line exactly, so a writer can
// replace one cell and leave the rest of the row -- spacing and `\|` escaping
// included -- untouched.
func splitRowRaw(line string) []string {
	var cells []string
	start := 0
	for i := 0; i < len(line); i++ {
		if line[i] == '\\' {
			i++
			continue
		}
		if line[i] == '|' {
			cells = append(cells, line[start:i])
			start = i + 1
		}
	}
	return append(cells, line[start:])
}

// replaceStatusCell rewrites one column of a table row in place.
func replaceStatusCell(line string, column int, value string) (string, error) {
	raw := splitRowRaw(line)
	// raw[0] holds whatever precedes the leading pipe, so the first real cell
	// is at index 1.
	idx := column + 1
	if idx >= len(raw) {
		return "", fmt.Errorf("row has no column %d", column)
	}
	raw[idx] = " " + value + " "
	return strings.Join(raw, "|"), nil
}

// UpdateApplicationStatus updates the status of an application in whichever
// tracker file holds it.
//
// A row that closes stays in the live file until archive-tracker.mjs moves it,
// and a row that re-opens is moved back by hand. Neither is this function's job:
// it rewrites one cell in place and leaves the row where it found it.
//
// Rows are keyed on company plus date. Report numbers are NOT unique -- parallel
// sessions have handed the same number to different companies -- so matching on
// one would edit an unrelated row.
func UpdateApplicationStatus(careerOpsPath string, app model.CareerApplication, newStatus string) error {
	files := trackerFiles(careerOpsPath)
	if len(files) == 0 {
		return fmt.Errorf("no tracker file found under %s", careerOpsPath)
	}

	cell, ok := canonicalStatusCell(newStatus)
	if !ok {
		return fmt.Errorf("unknown status %q", newStatus)
	}

	for _, filePath := range files {
		content, err := os.ReadFile(filePath)
		if err != nil {
			continue
		}

		lines := strings.Split(string(content), "\n")
		headerColumns := detectTrackerColumns(lines)

		for i, line := range lines {
			trimmed := strings.TrimSpace(line)
			if !strings.HasPrefix(trimmed, "|") || isSeparatorRow(trimmed) {
				continue
			}

			cells := splitTrackerRow(trimmed)
			columns := headerColumns
			if columns == nil {
				columns = detectColumnsByShape(cells)
			}
			if columns == nil {
				continue
			}
			if cellAt(cells, columns, "date") != app.Date ||
				cellAt(cells, columns, "company") != app.Company ||
				cellAt(cells, columns, "role") != app.Role {
				continue
			}

			statusCol, ok := columns["status"]
			if !ok {
				return fmt.Errorf("%s has no status column", filePath)
			}
			updated, err := replaceStatusCell(line, statusCol, cell)
			if err != nil {
				return fmt.Errorf("%s: %w", filePath, err)
			}
			lines[i] = updated
			return os.WriteFile(filePath, []byte(strings.Join(lines, "\n")), 0644)
		}
	}

	return fmt.Errorf("application not found: %s / %s (%s)", app.Company, app.Role, app.Date)
}

// cleanTableCell removes trailing pipes and whitespace from a table cell value.
func cleanTableCell(s string) string {
	s = strings.TrimSpace(s)
	s = strings.TrimRight(s, "|")
	return strings.TrimSpace(s)
}

// StatusPriority returns the sort priority for a status (lower = higher priority).
func StatusPriority(status string) int {
	switch NormalizeStatus(status) {
	case "interview":
		return 0
	case "offer":
		return 1
	case "responded":
		return 2
	case "applied":
		return 3
	case "evaluated":
		return 4
	case "skip":
		return 5
	case "rejected":
		return 6
	case "discarded":
		return 7
	case "ignored":
		return 8
	default:
		return 9
	}
}

// ComputeProgressMetrics computes progress-oriented analytics from applications.
func ComputeProgressMetrics(apps []model.CareerApplication) model.ProgressMetrics {
	pm := model.ProgressMetrics{}

	// Count by normalized status
	statusCounts := make(map[string]int)
	var totalScore float64
	var scored int

	for _, app := range apps {
		norm := NormalizeStatus(app.Status)
		statusCounts[norm]++

		if app.Score > 0 {
			totalScore += app.Score
			scored++
			if app.Score > pm.TopScore {
				pm.TopScore = app.Score
			}
		}

		if norm == "offer" {
			pm.TotalOffers++
		}
		if norm != "skip" && norm != "rejected" && norm != "discarded" && norm != "ignored" {
			pm.ActiveApps++
		}
	}

	if scored > 0 {
		pm.AvgScore = totalScore / float64(scored)
	}

	// Funnel: each stage counts all apps that reached at least that stage.
	// An app in "interview" has passed through evaluated -> applied -> responded -> interview.
	total := len(apps)
	// "ignored" counts as applied: the application was genuinely sent, it just
	// never got an answer.
	applied := statusCounts["applied"] + statusCounts["responded"] + statusCounts["interview"] + statusCounts["offer"] + statusCounts["rejected"] + statusCounts["ignored"]
	responded := statusCounts["responded"] + statusCounts["interview"] + statusCounts["offer"]
	interview := statusCounts["interview"] + statusCounts["offer"]
	offer := statusCounts["offer"]

	pm.FunnelStages = []model.FunnelStage{
		{Label: "Evaluated", Count: total, Pct: 100.0},
		{Label: "Applied", Count: applied, Pct: safePct(applied, total)},
		{Label: "Responded", Count: responded, Pct: safePct(responded, applied)},
		{Label: "Interview", Count: interview, Pct: safePct(interview, applied)},
		{Label: "Offer", Count: offer, Pct: safePct(offer, applied)},
	}

	// Rates (relative to applied)
	if applied > 0 {
		pm.ResponseRate = float64(responded) / float64(applied) * 100
		pm.InterviewRate = float64(interview) / float64(applied) * 100
		pm.OfferRate = float64(offer) / float64(applied) * 100
	}

	// Score distribution
	buckets := [5]int{} // 0: 4.5-5.0, 1: 4.0-4.4, 2: 3.5-3.9, 3: 3.0-3.4, 4: <3.0
	for _, app := range apps {
		if app.Score <= 0 {
			continue
		}
		switch {
		case app.Score >= 4.5:
			buckets[0]++
		case app.Score >= 4.0:
			buckets[1]++
		case app.Score >= 3.5:
			buckets[2]++
		case app.Score >= 3.0:
			buckets[3]++
		default:
			buckets[4]++
		}
	}
	pm.ScoreBuckets = []model.ScoreBucket{
		{Label: "4.5-5.0", Count: buckets[0]},
		{Label: "4.0-4.4", Count: buckets[1]},
		{Label: "3.5-3.9", Count: buckets[2]},
		{Label: "3.0-3.4", Count: buckets[3]},
		{Label: "  <3.0", Count: buckets[4]},
	}

	// Weekly activity: group by ISO week from Date field, show last 8 weeks.
	weekCounts := make(map[string]int)
	for _, app := range apps {
		if app.Date == "" {
			continue
		}
		t, err := time.Parse("2006-01-02", app.Date)
		if err != nil {
			continue
		}
		year, week := t.ISOWeek()
		key := fmt.Sprintf("%d-W%02d", year, week)
		weekCounts[key]++
	}

	// Sort weeks and take last 8
	var weeks []string
	for w := range weekCounts {
		weeks = append(weeks, w)
	}
	sort.Strings(weeks)
	if len(weeks) > 8 {
		weeks = weeks[len(weeks)-8:]
	}

	for _, w := range weeks {
		pm.WeeklyActivity = append(pm.WeeklyActivity, model.WeekActivity{
			Week:  w,
			Count: weekCounts[w],
		})
	}

	return pm
}

// safePct returns the percentage of part/whole, or 0 if whole is 0.
func safePct(part, whole int) float64 {
	if whole == 0 {
		return 0
	}
	return float64(part) / float64(whole) * 100
}
