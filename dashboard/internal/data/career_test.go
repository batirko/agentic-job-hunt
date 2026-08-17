package data

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/batirko/agentic-job-hunt/dashboard/internal/model"
)

func TestParseApplicationsUsesTrackerNumberColumn(t *testing.T) {
	tempDir := t.TempDir()
	dataDir := filepath.Join(tempDir, "data")
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		t.Fatalf("failed to create data dir: %v", err)
	}

	applications := `# Applications Tracker

| # | Date | Company | Role | Score | Status | PDF | Report | Notes |
|---|------|---------|------|-------|--------|-----|--------|-------|
| 140 | 2026-04-16 | Arize AI | AI Engineer, Instrumentation | 4.7/5 | Evaluated | ✅ | [140](reports/140-arize-ai-engineer-instrumentation-2026-04-16.md) | Strong fit |
| 143 | 2026-04-16 | Arize AI | AI Sales Engineer, US | 4.1/5 | Evaluated | ❌ | [143](reports/143-arize-ai-sales-engineer-us-2026-04-16.md) | Good fit |
`

	applicationsPath := filepath.Join(dataDir, "applications.md")
	if err := os.WriteFile(applicationsPath, []byte(applications), 0o644); err != nil {
		t.Fatalf("failed to write applications tracker: %v", err)
	}

	apps := ParseApplications(tempDir)
	if len(apps) != 2 {
		t.Fatalf("expected 2 parsed applications, got %d", len(apps))
	}

	if apps[0].Number != 140 {
		t.Fatalf("expected first application number to be 140, got %d", apps[0].Number)
	}
	if apps[1].Number != 143 {
		t.Fatalf("expected second application number to be 143, got %d", apps[1].Number)
	}
	if apps[0].ReportNumber != "140" || apps[1].ReportNumber != "143" {
		t.Fatalf("expected report numbers to stay aligned with tracker IDs, got %q and %q", apps[0].ReportNumber, apps[1].ReportNumber)
	}
}

// writeTracker writes a tracker file under the temp project's data/ directory.
func writeTracker(t *testing.T, root, name, content string) {
	t.Helper()
	dataDir := filepath.Join(root, "data")
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		t.Fatalf("failed to create data dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dataDir, name), []byte(content), 0o644); err != nil {
		t.Fatalf("failed to write %s: %v", name, err)
	}
}

const canonicalHeader = "| Date | Company | Role | Fit | Odds | Priority | Status | Output | Report | Location | Reasoning | URL |\n" +
	"| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n"

func TestParseApplicationsCanonicalTwelveColumnSchema(t *testing.T) {
	tempDir := t.TempDir()
	writeTracker(t, tempDir, "applications.md", `# Applications Tracker — open rows

> This file holds every row a decision is still owed on.

`+canonicalHeader+
		"| 2026-08-14 | Ebury | Senior Product Manager - Client Platform | 3.8/5 | 2.6/5 | 3.3/5 |  | - | [260](../reports/260-ebury-2026-08-14.md) | Madrid, Spain | Below gate. | https://www.linkedin.com/jobs/view/4454576040 |\n"+
		"| 2026-08-12 | Zalando | Senior Principal Product Manager | 3.5/5 | 2.3/5 | 3.4/5 | ✅ | [📁](../output/zalando) | [245](../reports/245-zalando-2026-08-12.md) | Berlin, Germany | Applied 2026-08-13 | https://www.linkedin.com/jobs/view/4432215664 |\n")

	apps := ParseApplications(tempDir)
	if len(apps) != 2 {
		t.Fatalf("expected 2 parsed applications, got %d", len(apps))
	}

	first := apps[0]
	if first.Date != "2026-08-14" {
		t.Errorf("Date: got %q, want 2026-08-14", first.Date)
	}
	if first.Company != "Ebury" {
		t.Errorf("Company: got %q, want Ebury", first.Company)
	}
	if first.Role != "Senior Product Manager - Client Platform" {
		t.Errorf("Role: got %q", first.Role)
	}
	// Fit is the primary score. Reading one column to the left or right lands on
	// Odds (2.6) or Priority (3.3), which is exactly the old off-by-one bug.
	if first.Score != 3.8 {
		t.Errorf("Score: got %v, want 3.8 (Fit, not Odds or Priority)", first.Score)
	}
	// An evaluated row has a blank status. The old offsets showed Priority here.
	if first.Status != "" {
		t.Errorf("Status: got %q, want empty for an evaluated row", first.Status)
	}
	if first.Notes != "Below gate." {
		t.Errorf("Notes: got %q, want the Reasoning column", first.Notes)
	}
	if first.JobURL != "https://www.linkedin.com/jobs/view/4454576040" {
		t.Errorf("JobURL: got %q, want the URL column value", first.JobURL)
	}
	if first.ReportNumber != "260" || first.Number != 260 {
		t.Errorf("report number: got %q / %d, want 260 / 260", first.ReportNumber, first.Number)
	}
	// The link is written relative to data/, so it must be rebased to the
	// project root every consumer joins onto.
	if first.ReportPath != filepath.Join("reports", "260-ebury-2026-08-14.md") {
		t.Errorf("ReportPath: got %q, want reports/260-ebury-2026-08-14.md", first.ReportPath)
	}
	if first.HasPDF {
		t.Error("HasPDF: got true for an empty Output column")
	}

	second := apps[1]
	if second.Status != "✅" {
		t.Errorf("Status: got %q, want ✅", second.Status)
	}
	if !second.HasPDF {
		t.Error("HasPDF: got false for an Output column holding a folder link")
	}
	if second.Number != 245 {
		t.Errorf("Number: got %d, want 245", second.Number)
	}
}

func TestParseApplicationsSkipsHeaderAndSeparatorRows(t *testing.T) {
	tempDir := t.TempDir()
	// The separator is written with spaces around the dashes, so a "|---" prefix
	// check does not catch it.
	writeTracker(t, tempDir, "applications.md", canonicalHeader+
		"| 2026-08-14 | Ebury | Senior PM | 3.8/5 | 2.6/5 | 3.3/5 |  | - | [260](../reports/260-ebury-2026-08-14.md) | Madrid | note | https://example.com/1 |\n")

	apps := ParseApplications(tempDir)
	if len(apps) != 1 {
		t.Fatalf("expected 1 application, got %d (header or separator row counted)", len(apps))
	}
	for _, app := range apps {
		if app.Company == "Company" || strings.Contains(app.Company, "---") {
			t.Fatalf("parsed a non-data row as an application: %+v", app)
		}
	}
}

func TestParseApplicationsReadsLiveAndArchiveFiles(t *testing.T) {
	tempDir := t.TempDir()
	writeTracker(t, tempDir, "applications.md", canonicalHeader+
		"| 2026-08-14 | Ebury | Senior PM | 3.8/5 | 2.6/5 | 3.3/5 | ✅ | - | [260](../reports/260-ebury-2026-08-14.md) | Madrid | Applied | https://example.com/1 |\n")
	writeTracker(t, tempDir, "applications-archive.md", canonicalHeader+
		"| 2026-07-01 | Datadog | Product Manager | 4.1/5 | 3.0/5 | 4.0/5 | ❌ | - | [180](../reports/180-datadog-2026-07-01.md) | Paris | Rejected | https://example.com/2 |\n")

	apps := ParseApplications(tempDir)
	if len(apps) != 2 {
		t.Fatalf("expected rows from both tracker files, got %d", len(apps))
	}
	if apps[0].Company != "Ebury" || apps[1].Company != "Datadog" {
		t.Fatalf("expected live rows first then archive rows, got %q then %q", apps[0].Company, apps[1].Company)
	}
	// The archive is where the rejections live; a funnel without them is wrong.
	if apps[1].Status != "❌" {
		t.Errorf("archive Status: got %q, want ❌", apps[1].Status)
	}
}

func TestParseApplicationsHandlesEscapedPipes(t *testing.T) {
	tempDir := t.TempDir()
	writeTracker(t, tempDir, "applications.md", canonicalHeader+
		`| 2026-08-14 | STARCON \| HR Experts | Senior PM (m\|w\|d) | 3.8/5 | 2.6/5 | 3.3/5 | ✅ | - | [261](../reports/261-starcon-2026-08-14.md) | Berlin | note | https://example.com/1 |`+"\n")

	apps := ParseApplications(tempDir)
	if len(apps) != 1 {
		t.Fatalf("expected 1 application, got %d", len(apps))
	}
	if apps[0].Company != "STARCON | HR Experts" {
		t.Errorf("Company: got %q, want STARCON | HR Experts", apps[0].Company)
	}
	if apps[0].Role != "Senior PM (m|w|d)" {
		t.Errorf("Role: got %q, want Senior PM (m|w|d)", apps[0].Role)
	}
	// An escaped pipe must not shift the columns after it.
	if apps[0].Status != "✅" {
		t.Errorf("Status: got %q, want ✅ (columns shifted by an escaped pipe)", apps[0].Status)
	}
}

func TestParseApplicationsFallsBackToRowShapeWithoutHeader(t *testing.T) {
	tempDir := t.TempDir()
	writeTracker(t, tempDir, "applications.md",
		"| 2026-08-14 | Ebury | Senior PM | 3.8/5 | 2.6/5 | 3.3/5 | ✅ | - | [260](../reports/260-ebury-2026-08-14.md) | Madrid | note | https://example.com/1 |\n")

	apps := ParseApplications(tempDir)
	if len(apps) != 1 {
		t.Fatalf("expected 1 application, got %d", len(apps))
	}
	if apps[0].Score != 3.8 || apps[0].Status != "✅" {
		t.Errorf("shape fallback misread the row: score %v, status %q", apps[0].Score, apps[0].Status)
	}
}

func TestNormalizeStatusEmojiVocabulary(t *testing.T) {
	// The tracker writes emoji and nothing else. Text labels are the legacy form.
	cases := map[string]string{
		"":                    "evaluated",
		"  ":                  "evaluated",
		"✅":                   "applied",
		"📬":                   "responded",
		"🎯":                   "interview",
		"💰":                   "offer",
		"❌":                   "rejected",
		"🚫":                   "discarded",
		"👻":                   "ignored",
		"⏭️":                  "skip",
		"⏭":                   "skip",
		"Applied":             "applied",
		"aplicado 2026-03-12": "applied",
		"**Rejected**":        "rejected",
	}
	for raw, want := range cases {
		if got := NormalizeStatus(raw); got != want {
			t.Errorf("NormalizeStatus(%q) = %q, want %q", raw, got, want)
		}
	}
}

func TestComputeProgressMetricsCountsEmojiStatuses(t *testing.T) {
	apps := []model.CareerApplication{
		{Status: ""},   // evaluated
		{Status: "✅"},  // applied
		{Status: "❌"},  // rejected, but it was applied to
		{Status: "👻"},  // silent, but it was applied to
		{Status: "🎯"},  // interview
		{Status: "⏭️"}, // skipped, never applied
	}

	pm := ComputeProgressMetrics(apps)
	want := map[string]int{"Evaluated": 6, "Applied": 4, "Responded": 1, "Interview": 1, "Offer": 0}
	for _, stage := range pm.FunnelStages {
		if got := stage.Count; got != want[stage.Label] {
			t.Errorf("funnel %s = %d, want %d", stage.Label, got, want[stage.Label])
		}
	}
	// Skipped, rejected and ignored rows are closed; they are not active work.
	if pm.ActiveApps != 3 {
		t.Errorf("ActiveApps = %d, want 3", pm.ActiveApps)
	}
}

func TestUpdateApplicationStatusWritesCanonicalEmoji(t *testing.T) {
	tempDir := t.TempDir()
	// A blank status is the dangerous case: a substring replace of "" prepends
	// to the line and the row stops being a table row at all.
	row := "| 2026-08-14 | Ebury | Senior PM | 3.8/5 | 2.6/5 | 3.3/5 |  | - | [260](../reports/260-ebury-2026-08-14.md) | Madrid | ✅ shipped before | https://example.com/1 |"
	writeTracker(t, tempDir, "applications.md", canonicalHeader+row+"\n")

	apps := ParseApplications(tempDir)
	if len(apps) != 1 {
		t.Fatalf("expected 1 application, got %d", len(apps))
	}
	if err := UpdateApplicationStatus(tempDir, apps[0], "Applied"); err != nil {
		t.Fatalf("UpdateApplicationStatus: %v", err)
	}

	content, err := os.ReadFile(filepath.Join(tempDir, "data", "applications.md"))
	if err != nil {
		t.Fatalf("read back: %v", err)
	}
	var dataRow string
	for _, line := range strings.Split(string(content), "\n") {
		if strings.HasPrefix(line, "| 2026-08-14") {
			dataRow = line
		}
	}
	if dataRow == "" {
		t.Fatalf("the data row no longer starts with a pipe:\n%s", content)
	}
	want := "| 2026-08-14 | Ebury | Senior PM | 3.8/5 | 2.6/5 | 3.3/5 | ✅ | - | [260](../reports/260-ebury-2026-08-14.md) | Madrid | ✅ shipped before | https://example.com/1 |"
	if dataRow != want {
		t.Errorf("row rewritten wrongly.\n got: %s\nwant: %s", dataRow, want)
	}

	// Re-reading must see the new status, and only the status.
	reloaded := ParseApplications(tempDir)
	if reloaded[0].Status != "✅" {
		t.Errorf("Status after update = %q, want ✅", reloaded[0].Status)
	}
	if reloaded[0].Notes != "✅ shipped before" {
		t.Errorf("Notes changed: %q", reloaded[0].Notes)
	}
}

func TestUpdateApplicationStatusInArchiveAndRejectsUnknown(t *testing.T) {
	tempDir := t.TempDir()
	writeTracker(t, tempDir, "applications.md", canonicalHeader+
		"| 2026-08-14 | Ebury | Senior PM | 3.8/5 | 2.6/5 | 3.3/5 | ✅ | - | [260](../reports/260-ebury.md) | Madrid | note | https://example.com/1 |\n")
	archiveRow := `| 2026-07-01 | STARCON \| HR Experts | PM (m\|w\|d) | 4.1/5 | 3.0/5 | 4.0/5 | ❌ | - | [180](../reports/180-starcon.md) | Paris | note | https://example.com/2 |`
	writeTracker(t, tempDir, "applications-archive.md", canonicalHeader+archiveRow+"\n")

	apps := ParseApplications(tempDir)
	archived := apps[1]

	if err := UpdateApplicationStatus(tempDir, archived, "nonsense"); err == nil {
		t.Error("expected an unknown status to be rejected, not written as blank")
	}

	if err := UpdateApplicationStatus(tempDir, archived, "SKIP"); err != nil {
		t.Fatalf("UpdateApplicationStatus: %v", err)
	}
	content, err := os.ReadFile(filepath.Join(tempDir, "data", "applications-archive.md"))
	if err != nil {
		t.Fatalf("read back: %v", err)
	}
	// The escaped pipes must survive the rewrite untouched.
	want := strings.Replace(archiveRow, "| ❌ |", "| ⏭️ |", 1)
	if !strings.Contains(string(content), want) {
		t.Errorf("archive row rewritten wrongly:\n%s", content)
	}
	// The live file must not be touched.
	live, _ := os.ReadFile(filepath.Join(tempDir, "data", "applications.md"))
	if !strings.Contains(string(live), "| ✅ |") {
		t.Errorf("live tracker changed by an archive update:\n%s", live)
	}
}
