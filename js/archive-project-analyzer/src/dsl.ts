import type { ArchiveProjectAnalysis } from "./types.js";

function quoted(value: string): string { return JSON.stringify(value); }

export function renderArchiveAnalysisDsl(analysis: ArchiveProjectAnalysis): string {
  const selected = new Set([...analysis.selectedTextEntries, ...analysis.selectedGeometryEntries]);
  const visibleCandidates = analysis.candidates
    .filter((candidate) => selected.has(candidate.path) || candidate.score >= 70)
    .slice(0, 120);
  const lines = [
    `ARCHIVE_PROJECT ${analysis.archive.sha256.slice(0, 16)}`,
    `SOURCE ${analysis.archive.uri}`,
    `PATH ${quoted(analysis.archive.path)}`,
    `SIZE ${analysis.archive.size}`,
    `ENTRY_COUNT ${analysis.coverage.entries}`,
    `SAFE_ENTRY_COUNT ${analysis.coverage.safeEntries}`,
    `GEOMETRY_ENTRY_COUNT ${analysis.coverage.geometryEntries}`,
    `ASSEMBLY_EVIDENCE_COUNT ${analysis.coverage.assemblyEntries}`,
    `DOCUMENTATION_ENTRY_COUNT ${analysis.coverage.documentationEntries}`,
    `SOURCE_CODE_ENTRY_COUNT ${analysis.coverage.sourceCodeEntries}`,
    `MATERIALIZABLE_GEOMETRY_COUNT ${analysis.coverage.materializableGeometryEntries}`,
    `UNSUPPORTED_CAD_COUNT ${analysis.coverage.unsupportedCadEntries}`,
  ];
  for (const root of analysis.projectRoots) lines.push(`PROJECT_ROOT ${quoted(root)}`);
  for (const candidate of visibleCandidates) lines.push(
    `CANDIDATE ${candidate.kind} ${candidate.expectedUse} ${candidate.materializable ? "MATERIALIZABLE" : "METADATA_ONLY"} SCORE ${candidate.score} SIZE ${candidate.uncompressedSize} PATH ${quoted(candidate.path)}`,
  );
  if (analysis.candidates.length > visibleCandidates.length) lines.push(`CANDIDATES_OMITTED ${analysis.candidates.length-visibleCandidates.length} FULL_REPORT ${analysis.archive.uri}`);
  for (const path of analysis.selectedTextEntries) lines.push(`SELECT_TEXT ${quoted(path)}`);
  for (const path of analysis.selectedGeometryEntries) lines.push(`SELECT_GEOMETRY ${quoted(path)}`);
  for (const finding of analysis.findings) lines.push(
    `FINDING ${finding.severity.toUpperCase()} ${finding.code} ERROR_URI ${finding.errorUri} REPAIR ${finding.repairProcess}${finding.entryPath ? ` PATH ${quoted(finding.entryPath)}` : ""}`,
  );
  lines.push("END_ARCHIVE_PROJECT", "");
  return lines.join("\n");
}

export function renderArchiveAnalysisMarkdown(analysis: ArchiveProjectAnalysis): string {
  const c = analysis.coverage;
  return [
    `# Archive project analysis: ${analysis.archive.path.split("/").at(-1)}`,
    "",
    `- Content URI: \`${analysis.archive.uri}\``,
    `- Entries: ${c.entries} (${c.safeEntries} safe, ${c.unsafeEntries} unsafe)`,
    `- Geometry candidates: ${c.geometryEntries}; materializable now: ${c.materializableGeometryEntries}`,
    `- Assembly evidence: ${c.assemblyEntries}; unsupported native CAD: ${c.unsupportedCadEntries}`,
    `- Documentation: ${c.documentationEntries}; source code: ${c.sourceCodeEntries}`,
    "",
    "## Highest-value candidates",
    "",
    ...analysis.candidates.slice(0, 30).map((candidate) => `- **${candidate.kind} / ${candidate.expectedUse} / score ${candidate.score}:** \`${candidate.path}\` — ${candidate.reason}`),
    "",
    "## Findings",
    "",
    ...(analysis.findings.length ? analysis.findings.map((finding) => `- ${finding.severity.toUpperCase()} \`${finding.code}\`: ${finding.message} Repair: \`${finding.repairProcess}\``) : ["- No archive-structure errors detected."]),
    "",
  ].join("\n");
}
