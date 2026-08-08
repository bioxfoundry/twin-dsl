"""Quality audit for converted Markdown trees and generated Digital Twin artifacts."""

from __future__ import annotations

import argparse
import json
import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

from .detect import detect_document_kind


@dataclass
class Finding:
    severity: str
    code: str
    path: str
    message: str
    hint: str = ""

    def as_dict(self) -> Dict[str, str]:
        return {"severity": self.severity, "code": self.code, "path": self.path,
                "message": self.message, "hint": self.hint}


@dataclass
class AuditReport:
    findings: List[Finding] = field(default_factory=list)
    metrics: Dict[str, Any] = field(default_factory=dict)

    def add(self, severity: str, code: str, path: str, message: str, hint: str = "") -> None:
        self.findings.append(Finding(severity, code, path, message, hint))

    @property
    def errors(self) -> int:
        return sum(f.severity == "ERROR" for f in self.findings)

    @property
    def warnings(self) -> int:
        return sum(f.severity == "WARNING" for f in self.findings)

    def as_dict(self) -> Dict[str, Any]:
        return {"schema": "subactor.audit-report/v1", "ok": self.errors == 0,
                "errors": self.errors, "warnings": self.warnings,
                "metrics": self.metrics, "findings": [f.as_dict() for f in self.findings]}


def _front_matter(text: str) -> Dict[str, str]:
    if not text.startswith("---\n"):
        return {}
    end = text.find("\n---", 4)
    if end < 0:
        return {}
    out: Dict[str, str] = {}
    for line in text[4:end].splitlines():
        match = re.match(r"^([A-Za-z][A-Za-z0-9_]*):\s*\"?(.*?)\"?$", line)
        if match:
            out[match.group(1)] = match.group(2)
    return out


def _md_target(out: Path, relative: Path, confidential: bool, language: Optional[str]) -> Path:
    marker = ".secret" if confidential else ""
    suffix = f".{language}" if language and language != "en" else ""
    return out / f"{relative}{marker}{suffix}.md"


def audit_markdown_tree(source: str | Path, output: str | Path, secret_pattern: str = "") -> AuditReport:
    src, out = Path(source).resolve(), Path(output).resolve()
    report = AuditReport(metrics={"sourceFiles": 0, "markdownFiles": 0, "converted": 0,
                                   "translated": 0, "missing": 0, "byConverter": {},
                                   "headings": 0, "tables": 0})
    pattern = re.compile(secret_pattern, re.IGNORECASE) if secret_pattern else None
    for path in sorted(p for p in src.rglob("*") if p.is_file() and ".git" not in p.parts):
        report.metrics["sourceFiles"] += 1
        rel = path.relative_to(src)
        kind = detect_document_kind(str(path))
        if kind == "":
            continue
        if pattern:
            try:
                sample = path.open("rb").read(200_000).decode("utf-8", errors="ignore")
            except OSError:
                sample = ""
            expected_secret = bool(pattern.search(sample))
        else:
            expected_secret = False
        # For prose documents, a missing language detector is a warning; LaTeX is expected to be
        # translated when its source language is not English.
        candidates = [p for p in out.glob(f"{rel}*.md")]
        if not candidates:
            report.metrics["missing"] += 1
            report.add("ERROR", "OUTPUT_MISSING", str(rel), "No Markdown output exists", "Run f2md --tree for this source tree.")
            continue
        for target in candidates:
            report.metrics["markdownFiles"] += 1
            try:
                text = target.read_text(encoding="utf-8")
            except UnicodeDecodeError:
                report.add("ERROR", "OUTPUT_NOT_UTF8", str(target), "Generated output is not UTF-8", "Rewrite the file through f2md.")
                continue
            fm = _front_matter(text)
            body = text.split("\n---\n", 1)[-1]
            if not fm:
                report.add("ERROR", "FRONT_MATTER_MISSING", str(target), "Provenance envelope is missing", "Every generated Markdown file must have front matter.")
                continue
            if fm.get("source") != str(path):
                report.add("ERROR", "SOURCE_MISMATCH", str(target), "Front matter source does not match input", "Regenerate the tree from the canonical source path.")
            converter = fm.get("converter", "")
            report.metrics["byConverter"][converter] = report.metrics["byConverter"].get(converter, 0) + 1
            report.metrics["converted"] += fm.get("converted") == "true"
            report.metrics["translated"] += fm.get("translatedFrom") == "lt" or fm.get("translatedFrom") == "unknown"
            if kind == ".tex" and converter != "pandoc":
                report.add("ERROR", "LATEX_NOT_STRUCTURED", str(target), f"LaTeX used {converter or 'unknown'} instead of Pandoc", "Install Pandoc and rerun conversion.")
            expected_for_output = expected_secret or ".secret" in target.name
            if fm.get("confidential") != ("true" if expected_for_output else "false"):
                report.add("WARNING", "CONFIDENTIALITY_MISMATCH", str(target), "Confidentiality marker differs from configured pattern", "Use the same --secret-pattern on every run.")
            if body.count("```") % 2:
                report.add("ERROR", "UNCLOSED_CODE_FENCE", str(target), "Markdown contains an unclosed code fence", "Protect fences during translation and regenerate.")
            headings = len(re.findall(r"(?m)^#{1,6}\s+", body))
            report.metrics["headings"] += headings
            report.metrics["tables"] += bool(re.search(r"(?m)^\|.*\|$", body))
            if kind == ".tex" and headings < 3:
                report.add("WARNING", "LOW_STRUCTURE", str(target), "Converted LaTeX contains very few headings", "Check whether Pandoc or a fallback backend was used.")
    return report


def audit_twin_artifacts(root: str | Path, report: Optional[AuditReport] = None) -> AuditReport:
    report = report or AuditReport()
    base = Path(root).resolve()
    json_files = list(base.rglob("*.json")) if base.exists() else []
    report.metrics.setdefault("twinJsonFiles", len(json_files))
    twin = next((p for p in json_files if p.name == "twin.json"), None)
    scene = next((p for p in json_files if p.name == "scene.json"), None)
    usda = next((p for p in base.rglob("scene.usda")), None)
    if not twin:
        report.add("ERROR", "TWIN_MISSING", str(base), "Generated twin.json was not found", "Run a validated project iteration first.")
    else:
        try:
            value = json.loads(twin.read_text(encoding="utf-8"))
            components = value.get("components", [])
            report.metrics["twinComponents"] = len(components)
            if value.get("schema") != "subactor.twin/v1" or not components:
                report.add("ERROR", "TWIN_INVALID", str(twin), "Twin schema or components are invalid", "Run validateTwin and inspect generation-audit.json.")
            grades = [str(c.get("properties", {}).get("geometryEvidence", "placeholder"))
                      for c in components if isinstance(c, dict)]
            report.metrics["geometryEvidence"] = {grade: grades.count(grade) for grade in sorted(set(grades))}
            missing_geometry = sum(grade == "placeholder" for grade in grades)
            report.metrics["componentsWithoutGeometry"] = missing_geometry
            if missing_geometry:
                report.add("WARNING", "GEOMETRY_UNGROUNDED", str(twin), f"{missing_geometry} components have only placeholder geometry", "Add CAD/IFC/floor-plan evidence and run physical-intake.")
        except (OSError, json.JSONDecodeError) as error:
            report.add("ERROR", "TWIN_JSON_INVALID", str(twin), str(error), "Regenerate the candidate artifact.")
    if not scene:
        report.add("ERROR", "SCENE_MISSING", str(base), "Generated scene.json was not found", "Run scene-render/project-iterate.")
    else:
        try:
            value = json.loads(scene.read_text(encoding="utf-8"))
            bindings = value.get("bindings", [])
            report.metrics["sceneBindings"] = len(bindings)
            if value.get("schema") != "subactor.scene/v1" or not bindings:
                report.add("ERROR", "SCENE_INVALID", str(scene), "Scene schema or bindings are invalid", "Validate scene against subactor.scene/v1.")
        except (OSError, json.JSONDecodeError) as error:
            report.add("ERROR", "SCENE_JSON_INVALID", str(scene), str(error), "Regenerate the candidate artifact.")
    if not usda or usda.stat().st_size < 100:
        report.add("ERROR", "USD_MISSING_OR_EMPTY", str(base), "scene.usda is missing or empty", "Run scene-render after scene validation.")
    return report


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(prog="f2md-audit")
    parser.add_argument("source")
    parser.add_argument("output")
    parser.add_argument("--twin", default=None, help="generated Digital Twin runtime directory")
    parser.add_argument("--secret-pattern", default="")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)
    report = audit_markdown_tree(args.source, args.output, args.secret_pattern)
    if args.twin:
        audit_twin_artifacts(args.twin, report)
    payload = report.as_dict()
    if args.json:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        print(f"f2md-audit: {'OK' if report.errors == 0 else 'ERROR'} errors={report.errors} warnings={report.warnings}")
        print(json.dumps(payload["metrics"], ensure_ascii=False, indent=2))
        for finding in report.findings:
            print(f"{finding.severity} {finding.code} {finding.path}: {finding.message} | {finding.hint}")
    return 0 if report.errors == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
