"""Output-aware PDF figure materialization.

Conversion backends return an in-memory envelope and therefore cannot safely choose paths for
binary artifacts.  The mirrored-tree writer calls this module once the destination is known.  It
extracts only figures that correspond to picture transcriptions already classified by the quality
layer; page logos and unrelated decorative images are deliberately left alone.
"""

from __future__ import annotations

import hashlib
import importlib
import mimetypes
import os
import re
from copy import deepcopy
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

from .quality import normalize_document, refresh_quality_status
from .types import ConvertedDocument

_GENERATED_ASSET = re.compile(r"^page-\d+-figure-\d+-[a-f0-9]{12}\.[a-z0-9]+$")
_PAGE_ANCHOR = re.compile(r"<!--\s*source-page:(\d+)")
_DIAGRAM_START = "<!-- f2md-semantic:false type=diagram reason=ocr-transcription -->"


@dataclass(frozen=True)
class _Candidate:
    page: int
    bbox: Tuple[float, float, float, float]
    payload: bytes
    extension: str
    media_type: str

    @property
    def area(self) -> float:
        return max(0.0, self.bbox[2] - self.bbox[0]) * max(0.0, self.bbox[3] - self.bbox[1])


@dataclass(frozen=True)
class _Asset:
    page: int
    bbox: Tuple[float, float, float, float]
    relative_path: str
    sha256: str
    media_type: str


def _safe_extension(value: Any) -> str:
    extension = re.sub(r"[^a-z0-9]", "", str(value or "png").casefold())
    return extension if extension in {"png", "jpg", "jpeg", "webp", "tif", "tiff", "bmp"} else "png"


def _bbox(value: Any) -> Optional[Tuple[float, float, float, float]]:
    if not isinstance(value, (tuple, list)) or len(value) != 4:
        return None
    try:
        box = tuple(float(item) for item in value)
    except (TypeError, ValueError):
        return None
    if box[2] <= box[0] or box[3] <= box[1]:
        return None
    return box  # type: ignore[return-value]


def _drawing_bbox(page: Any) -> Optional[Tuple[float, float, float, float]]:
    """Return a conservative union for vector graphics when a page has no embedded image."""
    try:
        boxes = [_bbox(tuple(item.get("rect"))) for item in page.get_drawings() if item.get("rect") is not None]
    except Exception:  # noqa: BLE001 - optional backend API
        return None
    present = [box for box in boxes if box is not None]
    if not present:
        return None
    return (
        min(box[0] for box in present),
        min(box[1] for box in present),
        max(box[2] for box in present),
        max(box[3] for box in present),
    )


def _page_candidates(document: Any, page_number: int) -> List[_Candidate]:
    page = document[page_number - 1]
    page_box = _bbox(tuple(page.rect))
    if page_box is None:
        return []
    page_area = (page_box[2] - page_box[0]) * (page_box[3] - page_box[1])
    candidates: List[_Candidate] = []
    try:
        image_info = page.get_image_info(xrefs=True)
    except Exception:  # noqa: BLE001 - old PyMuPDF or malformed image table
        image_info = []
    for info in image_info:
        if not isinstance(info, dict):
            continue
        box = _bbox(info.get("bbox"))
        width = int(info.get("width", 0) or 0)
        height = int(info.get("height", 0) or 0)
        if box is None or width < 48 or height < 48:
            continue
        area = (box[2] - box[0]) * (box[3] - box[1])
        if area < page_area * 0.005:
            continue
        xref = int(info.get("xref", 0) or 0)
        payload = b""
        extension = "png"
        media_type = "image/png"
        if xref > 0:
            try:
                extracted = document.extract_image(xref)
                payload = bytes(extracted.get("image", b""))
                extension = _safe_extension(extracted.get("ext"))
                media_type = mimetypes.types_map.get("." + extension, "image/" + extension)
            except Exception:  # noqa: BLE001 - rasterized fallback below
                payload = b""
        if not payload:
            try:
                pymupdf = importlib.import_module("pymupdf")

                payload = page.get_pixmap(
                    matrix=pymupdf.Matrix(2, 2), clip=pymupdf.Rect(box), alpha=False,
                ).tobytes("png")
                extension = "png"
                media_type = "image/png"
            except Exception:  # noqa: BLE001
                continue
        candidates.append(_Candidate(page_number, box, payload, extension, media_type))

    # Some architecture diagrams are vector paths rather than image XObjects.  Rasterize their
    # drawing union only when no embedded candidate exists and the union is neither a tiny icon nor
    # effectively the entire page (which would reintroduce headers and body text into the asset).
    if not candidates:
        vector_box = _drawing_bbox(page)
        if vector_box is not None:
            vector_area = (vector_box[2] - vector_box[0]) * (vector_box[3] - vector_box[1])
            vector_width = vector_box[2] - vector_box[0]
            vector_height = vector_box[3] - vector_box[1]
            if (
                vector_width >= 48
                and vector_height >= 48
                and page_area * 0.005 <= vector_area <= page_area * 0.85
            ):
                try:
                    pymupdf = importlib.import_module("pymupdf")

                    payload = page.get_pixmap(
                        matrix=pymupdf.Matrix(2, 2), clip=pymupdf.Rect(vector_box), alpha=False,
                    ).tobytes("png")
                    candidates.append(_Candidate(
                        page_number, vector_box, payload, "png", "image/png",
                    ))
                except Exception:  # noqa: BLE001
                    pass
    return candidates


def _cleanup_generated(asset_dir: Path) -> None:
    if not asset_dir.is_dir() or asset_dir.is_symlink():
        return
    for child in asset_dir.iterdir():
        if child.is_file() and not child.is_symlink() and _GENERATED_ASSET.match(child.name):
            child.unlink()
    try:
        asset_dir.rmdir()
    except OSError:
        # Preserve a directory containing anything not owned by this generator.
        pass


def _extract_assets(
    source_path: str,
    target_path: str,
    required_by_page: Dict[int, int],
) -> List[_Asset]:
    try:
        pymupdf = importlib.import_module("pymupdf")
    except ImportError:
        return []
    asset_dir = Path(target_path[:-3] + ".assets" if target_path.endswith(".md") else target_path + ".assets")
    _cleanup_generated(asset_dir)
    try:
        pdf = pymupdf.open(source_path)
    except Exception:  # noqa: BLE001 - an optional repair must not invalidate conversion
        return []
    selected: List[_Candidate] = []
    try:
        for page_number, required in sorted(required_by_page.items()):
            if required <= 0 or page_number < 1 or page_number > len(pdf):
                continue
            candidates = sorted(_page_candidates(pdf, page_number), key=lambda item: item.area, reverse=True)
            selected.extend(sorted(candidates[:required], key=lambda item: (item.bbox[1], item.bbox[0])))
    finally:
        pdf.close()
    if not selected:
        return []
    asset_dir.mkdir(parents=True, exist_ok=True)
    assets: List[_Asset] = []
    per_page: Dict[int, int] = {}
    for candidate in selected:
        per_page[candidate.page] = per_page.get(candidate.page, 0) + 1
        digest = hashlib.sha256(candidate.payload).hexdigest()
        name = (
            f"page-{candidate.page}-figure-{per_page[candidate.page]}-"
            f"{digest[:12]}.{candidate.extension}"
        )
        destination = asset_dir / name
        destination.write_bytes(candidate.payload)
        relative = os.path.relpath(destination, Path(target_path).parent).replace(os.sep, "/")
        assets.append(_Asset(
            candidate.page, candidate.bbox, relative, digest, candidate.media_type,
        ))
    return assets


def _insert_figure_links(markdown: str, assets: Sequence[_Asset]) -> str:
    by_page: Dict[int, List[_Asset]] = {}
    for asset in assets:
        by_page.setdefault(asset.page, []).append(asset)
    lines: List[str] = []
    page = 1
    for line in markdown.splitlines():
        anchor = _PAGE_ANCHOR.match(line)
        if anchor:
            page = int(anchor.group(1))
        if line == _DIAGRAM_START and by_page.get(page):
            asset = by_page[page].pop(0)
            lines.extend([
                "<!-- f2md-semantic:false type=figure reason=source-layout -->",
                f"![Source figure on page {page}]({asset.relative_path})",
                "<!-- /f2md-semantic -->",
                "",
            ])
        lines.append(line)
    return "\n".join(lines).rstrip() + "\n"


def _set_check(report: Dict[str, Any], replacement: Dict[str, Any]) -> None:
    checks = report.setdefault("checks", [])
    if not isinstance(checks, list):
        report["checks"] = [replacement]
        return
    for index, check in enumerate(checks):
        if isinstance(check, dict) and check.get("id") == replacement["id"]:
            checks[index] = replacement
            return
    checks.append(replacement)


def _text_tokens(value: str) -> List[str]:
    without_markup = re.sub(r"<!--.*?-->|!\[[^]]*\]\([^)]+\)", " ", value, flags=re.DOTALL)
    return re.findall(r"[^\W_]+", without_markup.casefold(), flags=re.UNICODE)


def _contains_tokens(longer: Sequence[str], shorter: Sequence[str]) -> bool:
    if not shorter or len(shorter) > len(longer):
        return False
    width = len(shorter)
    return any(list(longer[index:index + width]) == list(shorter) for index in range(len(longer) - width + 1))


def _match_score(target: Sequence[str], candidate: Sequence[str]) -> float:
    if _contains_tokens(candidate, target):
        return 1.0
    if _contains_tokens(target, candidate):
        return len(candidate) / len(target)
    target_terms, candidate_terms = set(target), set(candidate)
    overlap = len(target_terms & candidate_terms)
    if not overlap:
        return 0.0
    recall = overlap / len(target_terms)
    precision = overlap / len(candidate_terms)
    return recall * 0.7 + precision * 0.3


def _bind_pdf_layout(source_path: str, structure: Dict[str, Any]) -> Dict[str, Any]:
    eligible = [
        block for block in structure.get("blocks", [])
        if isinstance(block, dict)
        and block.get("semantic") is True
        and block.get("type") not in {"figure", "diagram"}
        and _text_tokens(str(block.get("normalizedText", "")))
    ]
    try:
        pymupdf = importlib.import_module("pymupdf")
        pdf = pymupdf.open(source_path)
    except Exception as error:  # noqa: BLE001 - layout evidence is optional and fail-closed
        return {
            "status": "not-run",
            "engine": "pymupdf",
            "version": "unavailable",
            "eligibleBlocks": len(eligible),
            "mappedBlocks": 0,
            "coverage": 0.0 if eligible else 1.0,
            "reason": type(error).__name__,
        }
    candidates_by_page: Dict[int, List[Tuple[Tuple[float, float, float, float], List[str]]]] = {}
    try:
        pages_by_number = {
            int(page.get("number", 0)): page
            for page in structure.get("pages", [])
            if isinstance(page, dict)
        }
        for page_index, page in enumerate(pdf):
            number = page_index + 1
            page_record = pages_by_number.get(number)
            if page_record is not None:
                page_record["width"] = float(page.rect.width)
                page_record["height"] = float(page.rect.height)
            page_candidates: List[Tuple[Tuple[float, float, float, float], List[str]]] = []
            for item in page.get_text("blocks", sort=True):
                if len(item) < 7 or int(item[6]) != 0:
                    continue
                box = _bbox(item[:4])
                tokens = _text_tokens(str(item[4]))
                if box is not None and tokens:
                    page_candidates.append((box, tokens))
            candidates_by_page[number] = page_candidates

        mapped = 0
        for block in eligible:
            target = _text_tokens(str(block.get("normalizedText", "")))
            candidates = candidates_by_page.get(int(block.get("page", 1)), [])
            scored = [(_match_score(target, tokens), box) for box, tokens in candidates]
            score, box = max(scored, default=(0.0, (0.0, 0.0, 0.0, 0.0)), key=lambda item: item[0])
            if score < 0.55:
                continue
            block["bbox"] = list(box)
            block["confidence"] = round(score, 4)
            mapped += 1
    except Exception as error:  # noqa: BLE001 - malformed page layout becomes NOT RUN
        return {
            "status": "not-run",
            "engine": "pymupdf",
            "version": str(getattr(pymupdf, "VersionBind", "unknown")),
            "eligibleBlocks": len(eligible),
            "mappedBlocks": 0,
            "coverage": 0.0 if eligible else 1.0,
            "reason": type(error).__name__,
        }
    finally:
        pdf.close()
    coverage = mapped / len(eligible) if eligible else 1.0
    return {
        "status": "pass" if coverage >= 0.8 else "degraded",
        "engine": "pymupdf",
        "version": str(getattr(pymupdf, "VersionBind", "unknown")),
        "eligibleBlocks": len(eligible),
        "mappedBlocks": mapped,
        "coverage": round(coverage, 4),
        "reason": "",
    }


def materialize_pdf_assets(
    document: ConvertedDocument,
    source_path: str,
    target_path: str,
) -> ConvertedDocument:
    """Extract figure assets and bind them to canonical blocks, leaving failures explicit."""
    if document.input_kind != ".pdf":
        return document
    old_structure = document.metadata.get("structure")
    old_quality = document.metadata.get("conversionQuality")
    if not isinstance(old_structure, dict) or not isinstance(old_quality, dict):
        return document
    target_diagrams = [
        block for block in old_structure.get("blocks", [])
        if isinstance(block, dict)
        and block.get("type") == "diagram"
        and block.get("reason") == "ocr-transcription"
        and not block.get("asset")
    ]
    required_by_page: Dict[int, int] = {}
    for block in target_diagrams:
        page = int(block.get("page", 1))
        required_by_page[page] = required_by_page.get(page, 0) + 1
    extracted = _extract_assets(source_path, target_path, required_by_page) if required_by_page else []
    markdown = _insert_figure_links(document.markdown, extracted) if extracted else document.markdown
    raw_ocr = old_structure.get("ocr")
    ocr: Dict[str, Any] = dict(raw_ocr) if isinstance(raw_ocr, dict) else {}
    if extracted:
        rebuilt = normalize_document(markdown, source_path, normalize=False, ocr_audit=ocr)
        structure = rebuilt.structure
        structure["pages"] = deepcopy(old_structure.get("pages", structure["pages"]))
        structure["rawMarkdownSha256"] = old_structure.get(
            "rawMarkdownSha256", structure["rawMarkdownSha256"],
        )
        quality = rebuilt.quality
        old_checks = old_quality.get("checks", [])
        current_ids = {
            check.get("id") for check in quality.get("checks", []) if isinstance(check, dict)
        }
        if isinstance(old_checks, list):
            quality["checks"].extend(
                check for check in old_checks
                if isinstance(check, dict) and check.get("id") not in current_ids
            )
    else:
        structure = deepcopy(old_structure)
        quality = deepcopy(old_quality)

    by_path = {asset.relative_path: asset for asset in extracted}
    available_by_page: Dict[int, List[_Asset]] = {}
    for extracted_asset in extracted:
        available_by_page.setdefault(extracted_asset.page, []).append(extracted_asset)
    linked_diagrams = 0
    for block in structure["blocks"]:
        current_asset: Optional[_Asset] = None
        if block.get("type") == "figure" and isinstance(block.get("asset"), str):
            current_asset = by_path.get(block["asset"])
        elif block.get("type") == "diagram" and block.get("reason") == "ocr-transcription":
            page_assets = available_by_page.get(int(block.get("page", 1)), [])
            if page_assets:
                current_asset = page_assets.pop(0)
                linked_diagrams += 1
            elif block.get("asset"):
                linked_diagrams += 1
        if current_asset is not None:
            block["asset"] = current_asset.relative_path
            block["assetSha256"] = current_asset.sha256
            block["mediaType"] = current_asset.media_type
            block["bbox"] = list(current_asset.bbox)

    if ocr.get("ocrActuallyUsed"):
        regions = [item for item in ocr.get("ocrRegions", []) if isinstance(item, dict)]
        known = {str(item.get("asset", "")) for item in regions}
        for asset in extracted:
            if asset.relative_path in known:
                continue
            regions.append({
                "page": asset.page,
                "bbox": list(asset.bbox),
                "kind": "diagram",
                "asset": asset.relative_path,
                "engine": str(ocr.get("ocrEngine", "unknown")),
                "confidence": None,
            })
        structure["ocr"]["ocrRegions"] = regions

    layout = _bind_pdf_layout(source_path, structure)
    structure["layoutAudit"] = layout
    quality["metrics"]["bboxEligibleBlocks"] = layout["eligibleBlocks"]
    quality["metrics"]["bboxMappedBlocks"] = layout["mappedBlocks"]
    quality["metrics"]["bboxCoverage"] = layout["coverage"]
    _set_check(quality, {
        "id": "BLOCK_BBOX_COVERAGE",
        "status": "pass" if layout["status"] == "pass" else "warn",
        "actual": layout["coverage"] if layout["status"] != "not-run" else "not-run",
        "expected": ">=0.8",
    })

    old_repairs = old_quality.get("repairs")
    quality["repairs"] = dict(old_repairs) if isinstance(old_repairs, dict) else {}
    quality["repairs"]["figureAssetsExtracted"] = len(extracted)
    quality["metrics"]["figureAssets"] = len(extracted)
    quality["metrics"]["figuresLinked"] = linked_diagrams
    required = len(target_diagrams)
    _set_check(quality, {
        "id": "FIGURES_LINKED",
        "status": "pass" if linked_diagrams == required else "warn",
        "actual": f"{linked_diagrams}/{required}",
        "expected": f"{required}/{required}",
    })
    refresh_quality_status(quality)

    metadata = dict(document.metadata)
    metadata["structure"] = structure
    metadata["conversionQuality"] = quality
    metadata["ocrAudit"] = structure["ocr"]
    warnings = [value for value in document.warnings if not value.startswith("MARKDOWN_QUALITY:")]
    if quality["status"] != "pass":
        warnings.append(f"MARKDOWN_QUALITY:{quality['status'].upper()}:{quality['score']}")
    all_assets = list(dict.fromkeys([*document.assets, *(asset.relative_path for asset in extracted)]))
    return replace(
        document, markdown=markdown, metadata=metadata, assets=all_assets, warnings=warnings,
    )
