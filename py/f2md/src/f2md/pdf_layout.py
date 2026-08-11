"""Layout-first PDF extraction into :mod:`f2md.document_ast`.

This module never emits Markdown.  It reads native PDF geometry, classifies blocks before any
pipe-table parser runs, and retains tables/images/code as typed artifacts with page bounding boxes.
OCR is intentionally absent: a scan is declined so an explicit OCR backend can own provenance.
"""

from __future__ import annotations

import html
import importlib
import json
import math
import re
import statistics
from dataclasses import dataclass
from difflib import SequenceMatcher
from typing import Any, Dict, List, Optional, Sequence, Tuple

from .diagram_graph import build_ascii_diagram_graph
from .document_ast import build_document_ast, make_artifact, source_sha256
from .types import ConversionError, ExternalConverterRequired

_PAGE_NUMBER = re.compile(r"^\s*(?:page\s+)?\d{1,4}(?:\s*(?:/|of)\s*\d{1,4})?\s*$", re.IGNORECASE)
_ASCII_STRONG = re.compile(
    r"\+[-=]{2,}\+|\][ \t]*\|{2,}[ \t]*\[|(?:--+>|<--+)|[┌┐└┘├┤┬┴─│]{2,}"
)
_LIST_ITEM = re.compile(r"^\s*(?:[-*+•▪◦]|\d+[.)])\s+(.+)$")
_MONO_FONT = re.compile(r"mono|courier|consolas|code|typewriter", re.IGNORECASE)


@dataclass
class _TextBlock:
    page: int
    bbox: Tuple[float, float, float, float]
    text: str
    max_size: float
    bold: bool
    mono_ratio: float
    order: int


def _bbox(value: Any) -> Optional[Tuple[float, float, float, float]]:
    if not isinstance(value, (tuple, list)) or len(value) != 4:
        return None
    try:
        result = tuple(float(item) for item in value)
    except (TypeError, ValueError):
        return None
    if result[2] <= result[0] or result[3] <= result[1]:
        return None
    return result  # type: ignore[return-value]


def _area(box: Sequence[float]) -> float:
    return max(0.0, box[2] - box[0]) * max(0.0, box[3] - box[1])


def _intersection(left: Sequence[float], right: Sequence[float]) -> float:
    width = max(0.0, min(left[2], right[2]) - max(left[0], right[0]))
    height = max(0.0, min(left[3], right[3]) - max(left[1], right[1]))
    return width * height


def _overlap(box: Sequence[float], region: Sequence[float]) -> float:
    return _intersection(box, region) / max(_area(box), 1.0)


def _union(boxes: Sequence[Sequence[float]]) -> Optional[Tuple[float, float, float, float]]:
    if not boxes:
        return None
    return (
        min(box[0] for box in boxes), min(box[1] for box in boxes),
        max(box[2] for box in boxes), max(box[3] for box in boxes),
    )


def _normalized_margin(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip().casefold()


def _dehyphenate(value: str) -> str:
    return re.sub(r"(?m)([^\W\d_]{2,})-\s*\n\s*([^\W\d_A-Z][^\W\d_]*)", r"\1\2", value)


def _extract_text_blocks(page: Any, page_number: int) -> List[_TextBlock]:
    try:
        value = page.get_text("dict", sort=True)
    except Exception as error:  # noqa: BLE001
        raise ConversionError(f"PYMUPDF_LAYOUT_TEXT:{page_number}:{error}") from error
    blocks: List[_TextBlock] = []
    for order, block in enumerate(value.get("blocks", [])):
        if not isinstance(block, dict) or int(block.get("type", 0)) != 0:
            continue
        box = _bbox(block.get("bbox"))
        if box is None:
            continue
        lines: List[str] = []
        sizes: List[float] = []
        bold_chars = 0
        mono_chars = 0
        total_chars = 0
        for line in block.get("lines", []):
            spans = line.get("spans", []) if isinstance(line, dict) else []
            line_text = "".join(str(span.get("text", "")) for span in spans if isinstance(span, dict)).rstrip()
            if line_text:
                lines.append(line_text)
            for span in spans:
                if not isinstance(span, dict):
                    continue
                text = str(span.get("text", ""))
                length = len(text.strip())
                total_chars += length
                size = span.get("size")
                if isinstance(size, (int, float)):
                    sizes.append(float(size))
                font = str(span.get("font", ""))
                flags = int(span.get("flags", 0) or 0)
                if "bold" in font.casefold() or flags & 16:
                    bold_chars += length
                if _MONO_FONT.search(font):
                    mono_chars += length
        text = _dehyphenate(html.unescape("\n".join(lines))).strip()
        if not text:
            continue
        blocks.append(_TextBlock(
            page_number, box, text, max(sizes, default=0.0),
            bold_chars >= max(1, total_chars // 2),
            mono_chars / max(total_chars, 1), order,
        ))
    return blocks


def _repeated_furniture(
    blocks_by_page: Dict[int, List[_TextBlock]], pages: Sequence[Dict[str, Any]],
) -> set[Tuple[int, int]]:
    if len(pages) < 3:
        return set()
    page_heights = {int(page["number"]): float(page["height"]) for page in pages}
    values: Dict[str, set[int]] = {}
    positions: Dict[str, List[Tuple[int, int]]] = {}
    for page_number, blocks in blocks_by_page.items():
        height = page_heights[page_number]
        for index, block in enumerate(blocks):
            if block.bbox[1] > height * 0.15 and block.bbox[3] < height * 0.85:
                continue
            normalized = _normalized_margin(block.text)
            if not 3 <= len(normalized) <= 180 or _PAGE_NUMBER.match(normalized):
                continue
            values.setdefault(normalized, set()).add(page_number)
            positions.setdefault(normalized, []).append((page_number, index))
    threshold = max(2, math.ceil(len(pages) * 0.55))
    repeated = {value for value, page_set in values.items() if len(page_set) >= threshold}
    return {position for value in repeated for position in positions[value]}


def _clean_cell(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def _extract_tables(page: Any, page_number: int, source_hash: str) -> List[Dict[str, Any]]:
    try:
        found = page.find_tables()
        raw_tables = list(getattr(found, "tables", []))
    except Exception:  # noqa: BLE001 - table detection is a typed optional pass
        return []
    artifacts: List[Dict[str, Any]] = []
    for table in raw_tables:
        box = _bbox(getattr(table, "bbox", None))
        if box is None:
            continue
        try:
            extracted = table.extract()
        except Exception:  # noqa: BLE001
            continue
        grid = [[_clean_cell(cell) for cell in row] for row in extracted if isinstance(row, list)]
        columns = max((len(row) for row in grid), default=0)
        if not grid or columns < 2:
            continue
        grid = [row + [""] * (columns - len(row)) for row in grid]
        header = getattr(table, "header", None)
        header_names = [_clean_cell(value) for value in getattr(header, "names", [])] if header else []
        header_rows = 1 if header_names and any(header_names) else 0
        raw_cells = list(getattr(table, "cells", []))
        cells: List[Dict[str, Any]] = []
        for row_index, row in enumerate(grid):
            for column_index, text in enumerate(row):
                flat_index = row_index * columns + column_index
                cell_box = _bbox(raw_cells[flat_index]) if flat_index < len(raw_cells) else None
                cells.append({
                    "row": row_index,
                    "column": column_index,
                    "text": text,
                    "rowSpan": 1,
                    "colSpan": 1,
                    "bbox": list(cell_box) if cell_box is not None else None,
                })
        content = {
            "columns": columns,
            "rows": len(grid),
            "headerRows": header_rows,
            "grid": grid,
            "cells": cells,
            "detector": "pymupdf.find_tables",
        }
        artifacts.append(make_artifact(
            source_hash, "table", [page_number], box, content,
            subtype="grid", confidence=0.96, quality="validated",
            source_bboxes=[{"page": page_number, "bbox": box}],
        ))
    return artifacts


def _word_lines(page: Any) -> List[List[Tuple[Any, ...]]]:
    grouped: List[List[Tuple[Any, ...]]] = []
    for word in page.get_text("words", sort=True):
        if not grouped or abs(float(grouped[-1][0][1]) - float(word[1])) > 1.5:
            grouped.append([word])
        else:
            grouped[-1].append(word)
    return grouped


def _line_clusters(words: Sequence[Tuple[Any, ...]]) -> List[List[Tuple[Any, ...]]]:
    # PyMuPDF retains a separate line id for cells that share the same visual baseline.  Prefer
    # that structural signal over whitespace: narrow table columns often have only a 10 px gap,
    # while centred values can begin a few pixels to the left of their column anchor.
    by_pdf_line: Dict[Tuple[int, int], List[Tuple[Any, ...]]] = {}
    for word in words:
        if len(word) >= 7:
            by_pdf_line.setdefault((int(word[5]), int(word[6])), []).append(word)
    pdf_clusters = sorted(by_pdf_line.values(), key=lambda cluster: float(cluster[0][0]))
    if 3 <= len(pdf_clusters) <= 8:
        return pdf_clusters

    clusters: List[List[Tuple[Any, ...]]] = []
    for word in sorted(words, key=lambda item: float(item[0])):
        if not clusters or float(word[0]) - float(clusters[-1][-1][2]) >= 30:
            clusters.append([word])
        else:
            clusters[-1].append(word)
    return clusters


def _words_bbox(words: Sequence[Tuple[Any, ...]]) -> Tuple[float, float, float, float]:
    return (
        min(float(word[0]) for word in words), min(float(word[1]) for word in words),
        max(float(word[2]) for word in words), max(float(word[3]) for word in words),
    )


def _append_cell(existing: str, value: str) -> str:
    value = value.strip()
    if not value:
        return existing
    if existing.endswith("-") and re.match(r"^[^\W\d_]", value):
        return existing[:-1] + value
    return (existing + " " + value).strip()


def _toc_content(grid: Sequence[Sequence[str]]) -> Optional[Dict[str, Any]]:
    if len(grid) < 4 or any(len(row) != 3 for row in grid):
        return None
    numbered = [
        row for row in grid
        if re.match(r"^(?:[IVXLCDM]+|\d+(?:\.\d+)*)(?:\s|$)", row[0].strip(), re.IGNORECASE)
        and re.search(r"\d", row[2])
    ]
    if len(numbered) / len(grid) < 0.75:
        return None
    items: List[Dict[str, Any]] = []
    for row in grid:
        raw_label = " ".join(cell for cell in row[:2] if cell).strip()
        label = re.sub(r"(?:\s*\.\s*){3,}", " ", raw_label)
        label = re.sub(r"\s+", " ", label).strip(" .")
        page_match = re.search(r"\d+", row[2])
        if not label or page_match is None:
            continue
        number = re.match(r"^([IVXLCDM]+|\d+(?:\.\d+)*)", label, re.IGNORECASE)
        token = number.group(1) if number else ""
        level = 1 if re.fullmatch(r"[IVXLCDM]+", token, re.IGNORECASE) else token.count(".") + 1
        items.append({"label": label, "targetPage": int(page_match.group()), "level": level})
    if len(items) < 4:
        return None
    return {"items": items, "rawGrid": [list(row) for row in grid], "detector": "f2md.toc-v1"}


def _column_for_start(anchors: Sequence[float], start: float) -> int:
    """Map left- or right-aligned cell text to the preceding column anchor."""
    return max(
        (position for position, anchor in enumerate(anchors) if start >= anchor - 6),
        default=0,
    )


def _occupied_columns(words: Sequence[Tuple[Any, ...]], anchors: Sequence[float]) -> set[int]:
    return {
        _column_for_start(anchors, float(cluster[0][0]))
        for cluster in _line_clusters(words)
        if anchors[0] - 5 <= float(cluster[0][0]) <= anchors[-1] + 180
    }


def _extract_layout_tables(
    page: Any,
    page_number: int,
    source_hash: str,
    text_blocks: Sequence[_TextBlock],
    occupied: Sequence[Sequence[float]],
) -> List[Dict[str, Any]]:
    """Recover borderless tables from repeated PDF x-coordinate anchors."""
    try:
        lines = _word_lines(page)
    except Exception:  # noqa: BLE001
        return []
    artifacts: List[Dict[str, Any]] = []
    index = 0
    while index < len(lines):
        header_words = lines[index]
        header_box = _words_bbox(header_words)
        clusters = _line_clusters(header_words)
        if not 3 <= len(clusters) <= 8 or any(_overlap(header_box, box) > 0.5 for box in occupied):
            index += 1
            continue
        overlapping_mono = [
            block for block in text_blocks
            if block.mono_ratio >= 0.5 and _overlap(header_box, block.bbox) > 0.5
        ]
        # Classification precedes table parsing: pipes and aligned labels inside an ASCII graph
        # are topology, not columns.  A monospaced matrix with only a dashed rule remains eligible.
        if any(_ascii_diagram(block.text) for block in overlapping_mono):
            index += 1
            continue
        anchors = [float(cluster[0][0]) for cluster in clusters]
        aligned_followers = 0
        for follower in lines[index + 1:index + 13]:
            if float(follower[0][1]) - float(header_box[3]) > 150:
                break
            aligned_followers += len(_occupied_columns(follower, anchors)) >= 2
        if aligned_followers < 1:
            index += 1
            continue

        header = [" ".join(str(word[4]) for word in cluster) for cluster in clusters]
        grid: List[List[str]] = [header]
        cell_words: List[List[List[Tuple[Any, ...]]]] = [[list(cluster) for cluster in clusters]]
        # A wrapped header (for example ``šal-`` / ``tinis``) is a continuation of row zero,
        # not an orphan data row.  The first real row replaces these pointers below.
        current_row: Optional[List[str]] = grid[0]
        current_words: Optional[List[List[Tuple[Any, ...]]]] = cell_words[0]
        previous_bottom = float(header_box[3])
        consumed = index + 1
        while consumed < len(lines):
            words = lines[consumed]
            box = _words_bbox(words)
            vertical_gap = float(box[1]) - previous_bottom
            matched_anchors = len(_occupied_columns(words, anchors))
            starts_outside_table = float(box[0]) < anchors[0] - 5
            if (
                vertical_gap > 32
                or (matched_anchors == 0 and vertical_gap > 14)
                or (matched_anchors < 2 and vertical_gap > 20)
                or (matched_anchors <= 1 and starts_outside_table and vertical_gap > 6)
            ):
                break
            visible = "".join(str(word[4]) for word in words).strip()
            if _PAGE_NUMBER.fullmatch(visible):
                break
            if re.fullmatch(r"[-=_]{8,}", visible):
                previous_bottom = float(box[3])
                consumed += 1
                continue
            cells = ["" for _ in anchors]
            words_by_cell: List[List[Tuple[Any, ...]]] = [[] for _ in anchors]
            for cluster in _line_clusters(words):
                cluster_start = float(cluster[0][0])
                column = _column_for_start(anchors, cluster_start)
                value = " ".join(str(word[4]) for word in cluster)
                cells[column] = _append_cell(cells[column], value)
                words_by_cell[column].extend(cluster)
            occupied_cells = sum(bool(cell) for cell in cells)
            new_row = bool(cells[0]) and occupied_cells >= 2
            if current_row is None or new_row:
                current_row = cells
                current_words = words_by_cell
                grid.append(current_row)
                cell_words.append(current_words)
            else:
                assert current_words is not None
                for column, value in enumerate(cells):
                    current_row[column] = _append_cell(current_row[column], value)
                    current_words[column].extend(words_by_cell[column])
            previous_bottom = float(box[3])
            consumed += 1
        fragment_at_page_bottom = (
            len(grid) == 2 and float(_words_bbox(
                [word for row in cell_words for cell in row for word in cell]
            )[3]) >= float(page.rect.height) * 0.85
        )
        if len(grid) < 3 and not fragment_at_page_bottom:
            index += 1
            continue
        all_words = [word for row in cell_words for cell in row for word in cell]
        table_box = _words_bbox(all_words)
        serialized_cells: List[Dict[str, Any]] = []
        for row_index, row in enumerate(grid):
            for column_index, text in enumerate(row):
                words = cell_words[row_index][column_index]
                serialized_cells.append({
                    "row": row_index, "column": column_index, "text": text,
                    "rowSpan": 1, "colSpan": 1,
                    "bbox": list(_words_bbox(words)) if words else None,
                })
        content = {
            "columns": len(anchors), "rows": len(grid), "headerRows": 1,
            "grid": grid, "cells": serialized_cells, "columnAnchors": anchors,
            "detector": "f2md.layout-table-v1",
        }
        toc = _toc_content(grid)
        if toc is not None:
            artifacts.append(make_artifact(
                source_hash, "list", [page_number], table_box, toc,
                subtype="table-of-contents", confidence=0.94, quality="reconstructed",
                source_bboxes=[{"page": page_number, "bbox": table_box}],
            ))
            index = consumed
            continue
        artifacts.append(make_artifact(
            source_hash, "table", [page_number], table_box, content,
            subtype="borderless-grid", confidence=0.91, quality="reconstructed",
            source_bboxes=[{"page": page_number, "bbox": table_box}],
        ))
        index = consumed
    return artifacts


def _ascii_diagram(text: str) -> bool:
    lines = [line for line in text.splitlines() if line.strip()]
    if len(lines) < 3:
        return False
    pipe_counts = [line.count("|") for line in lines]
    irregular = len(set(pipe_counts)) >= 2 and sum(pipe_counts) >= 3
    whitespace = sum(char.isspace() for char in text) / max(len(text), 1)
    arrows = bool(re.search(r"(?:--+>|<--+|\bv\b|\^)", text))
    tree_symbols = len(re.findall(r"[│├└─]", text))
    return bool(_ASCII_STRONG.search(text)) or tree_symbols >= 3 or (irregular and whitespace >= 0.2 and arrows)


def _code_language(text: str) -> str:
    sample = text.strip()
    if re.search(r"(?m)^\s*\[(?:Unit|Service|Install|Socket|Timer)\]\s*$", sample):
        return "systemd"
    if re.search(r"^\s*(?:<\?xml|</?[A-Za-z][^>]*>)", sample, re.MULTILINE):
        return "xml"
    if sample.startswith(("{", "[")):
        try:
            json.loads(sample)
            return "json"
        except json.JSONDecodeError:
            pass
    if re.search(
        r"(?m)^\s*(?:from\s+[\w.]+\s+import|import\s+[\w.]+|def\s+\w+\(|class\s+\w+|print\s*\()",
        sample,
    ):
        return "python"
    if re.search(
        r"(?m)^\s*(?:sudo\s+|pip(?:3)?\s+|apt(?:-get)?\s+|cd\s+|curl\s+|wget\s+|export\s+|"
        r"avahi-browse\s+|systemctl\s+|ufw\s+|pytest(?:\s|$)|python(?:3)?\s+-m\s+)",
        sample,
    ):
        return "bash"
    if len(re.findall(r"(?m)^\s*[A-Za-z_][\w.-]*:\s+\S+", sample)) >= 2:
        return "yaml"
    if re.search(r"\b(?:module|difference|union|translate|rotate|cylinder|cube)\s*\(", sample):
        return "openscad"
    return "text"


def _image_artifacts(page: Any, page_number: int, source_hash: str) -> List[Dict[str, Any]]:
    try:
        info = page.get_image_info(xrefs=True)
    except Exception:  # noqa: BLE001
        return []
    page_area = float(page.rect.width * page.rect.height)
    artifacts: List[Dict[str, Any]] = []
    for index, image in enumerate(info, 1):
        box = _bbox(image.get("bbox")) if isinstance(image, dict) else None
        if box is None or _area(box) < page_area * 0.005:
            continue
        width = int(image.get("width", 0) or 0)
        height = int(image.get("height", 0) or 0)
        if width < 48 or height < 48:
            continue
        content = {
            "xref": int(image.get("xref", 0) or 0),
            "imageIndex": index,
            "width": width,
            "height": height,
            "alt": f"Source figure on page {page_number}",
            "extractor": "pymupdf-image-xobject",
        }
        artifacts.append(make_artifact(
            source_hash, "figure", [page_number], box, content,
            subtype="illustration", semantic=False, confidence=1.0, quality="raw",
            source_bboxes=[{"page": page_number, "bbox": box}],
        ))
    return artifacts


def _vector_artifact(
    page: Any,
    page_number: int,
    source_hash: str,
    text_blocks: Sequence[_TextBlock],
    table_boxes: Sequence[Sequence[float]],
) -> Optional[Dict[str, Any]]:
    try:
        drawings = page.get_drawings()
    except Exception:  # noqa: BLE001
        return None
    boxes = [box for item in drawings if isinstance(item, dict) and (box := _bbox(item.get("rect"))) is not None]
    if len(boxes) < 5:
        return None
    union = _union(boxes)
    if union is None:
        return None
    page_area = float(page.rect.width * page.rect.height)
    area = _area(union)
    if not page_area * 0.02 <= area <= page_area * 0.85:
        return None
    if any(_overlap(union, table_box) > 0.45 for table_box in table_boxes):
        return None
    labels = [block.text for block in text_blocks if _overlap(block.bbox, union) >= 0.5]
    source_text = "\n".join(labels)
    numeric_labels = len(re.findall(r"(?<!\w)-?\d+(?:[.,]\d+)?(?!\w)", source_text))
    chart = numeric_labels >= 4 and len(drawings) >= 8
    artifact_type = "chart" if chart else "diagram"
    subtype = "data-chart" if chart else "architecture-diagram"
    content = {
        "drawingCount": len(drawings),
        "sourceText": source_text,
        "extractor": "pymupdf-vector-drawings",
    }
    if chart:
        content["data"] = None
    else:
        content["graph"] = None
    return make_artifact(
        source_hash, artifact_type, [page_number], union, content,
        subtype=subtype, semantic=False, confidence=0.78, quality="reconstructed",
        source_bboxes=[{"page": page_number, "bbox": union}],
    )


def _text_artifact(
    block: _TextBlock,
    source_hash: str,
    median_size: float,
    heading_sizes: Sequence[float],
) -> Dict[str, Any]:
    text = block.text.strip()
    if _ascii_diagram(text):
        graph = build_ascii_diagram_graph(text)
        return make_artifact(
            source_hash, "diagram", [block.page], block.bbox, {"text": text, "graph": graph},
            subtype="ascii-diagram", semantic=False, confidence=0.98, quality="validated",
        )
    lines = text.splitlines()
    list_items = [match.group(1).strip() for line in lines if (match := _LIST_ITEM.match(line))]
    if list_items and len(list_items) == len([line for line in lines if line.strip()]):
        return make_artifact(
            source_hash, "list", [block.page], block.bbox, {"items": list_items},
            subtype="unordered", confidence=0.96, quality="validated",
        )
    language = _code_language(text)
    # A natural-language pair such as ``Stiprybės:`` / ``Silpnybės:`` satisfies a shallow
    # YAML regex.  Proportional body text is not promoted to YAML without typographic evidence.
    if language == "yaml" and block.mono_ratio < 0.4:
        language = "text"
    if block.mono_ratio >= 0.55 or language != "text":
        return make_artifact(
            source_hash, "code", [block.page], block.bbox,
            {"text": text, "language": language}, subtype="source-code",
            confidence=0.95 if language != "text" else 0.72,
            quality="validated" if language != "text" else "reconstructed",
        )
    short = len(text) <= 180 and len(lines) <= 2
    normalized_label = re.sub(r"\s+", " ", text).strip()
    numbered_heading = block.bold and bool(re.match(r"^\d+(?:\.\d+)*\s+\S", normalized_label))
    named_heading = normalized_label.casefold() in {"santrauka", "studijos santrauka", "turinys"}
    toc_lead = bool(re.fullmatch(r"studijos santrauka\s+\d{1,4}", normalized_label, re.IGNORECASE))
    is_heading = short and (
        block.max_size >= median_size * 1.22 or numbered_heading or named_heading or toc_lead
    )
    if is_heading:
        nearest = min(range(len(heading_sizes)), key=lambda index: abs(heading_sizes[index] - block.max_size))
        return make_artifact(
            source_hash, "heading", [block.page], block.bbox,
            {"text": re.sub(r"\s+", " ", text), "level": min(nearest + 1, 6)},
            subtype="section-heading", confidence=0.92, quality="validated",
        )
    return make_artifact(
        source_hash, "paragraph", [block.page], block.bbox, {"text": text},
        subtype="prose", confidence=0.94, quality="validated",
    )


def _heading_level(text: str, fallback: int, *, first: bool = False) -> int:
    normalized = re.sub(r"\s+", " ", text).strip()
    if first:
        return 1
    if re.match(r"^Dalis\s+[IVXLCDM]+\b", normalized, re.IGNORECASE):
        return 2
    number = re.match(r"^(\d+(?:\.\d+)*)\b", normalized)
    if number:
        return min(3 + number.group(1).count("."), 6)
    if normalized.casefold() in {"santrauka", "studijos santrauka", "turinys"}:
        return 2
    return max(2, min(fallback, 6))


def _normalize_headings(artifacts: Sequence[Dict[str, Any]], source_hash: str) -> List[Dict[str, Any]]:
    """Apply document numbering after classification, rebuilding content-addressed identities."""
    output: List[Dict[str, Any]] = []
    first_heading = True
    index = 0
    while index < len(artifacts):
        artifact = artifacts[index]
        if artifact.get("type") != "heading":
            output.append(artifact)
            index += 1
            continue
        content = artifact.get("content", {})
        text = re.sub(r"\s+", " ", str(content.get("text", ""))).strip()
        pages = list(artifact.get("pages", []))
        boxes = list(artifact.get("sourceBboxes", [])) or [
            {"page": pages[0], "bbox": artifact["bbox"]}
        ]
        bbox = artifact.get("bbox")
        if (
            re.fullmatch(r"Dalis\s+[IVXLCDM]+", text, re.IGNORECASE)
            and index + 1 < len(artifacts)
            and artifacts[index + 1].get("type") == "heading"
            and artifacts[index + 1].get("pages") == pages
        ):
            following = artifacts[index + 1]
            following_text = re.sub(
                r"\s+", " ", str(following.get("content", {}).get("text", ""))
            ).strip()
            text = f"{text} — {following_text}"
            next_box = following.get("bbox")
            bbox = _union([value for value in (bbox, next_box) if value is not None])
            boxes.extend(list(following.get("sourceBboxes", [])) or [
                {"page": pages[0], "bbox": following["bbox"]}
            ])
            index += 1
        level = _heading_level(text, int(content.get("level", 2)), first=first_heading)
        first_heading = False
        output.append(make_artifact(
            source_hash, "heading", pages, bbox, {"text": text, "level": level},
            subtype=artifact.get("subtype"), semantic=bool(artifact.get("semantic", True)),
            confidence=artifact.get("confidence"), quality=str(artifact.get("quality", "validated")),
            source_bboxes=boxes,
        ))
        index += 1
    return output


def _merge_toc_lead_ins(artifacts: Sequence[Dict[str, Any]], source_hash: str) -> List[Dict[str, Any]]:
    output: List[Dict[str, Any]] = []
    for artifact in artifacts:
        if artifact.get("subtype") != "table-of-contents" or not output:
            output.append(artifact)
            continue
        leads: List[Tuple[Dict[str, Any], re.Match[str]]] = []
        while output:
            lead = output[-1]
            lead_text = str(lead.get("content", {}).get("text", ""))
            match = re.fullmatch(r"(.+?)\s+(\d{1,4})", re.sub(r"\s+", " ", lead_text).strip())
            if lead.get("type") != "heading" or lead.get("pages") != artifact.get("pages") or match is None:
                break
            leads.insert(0, (output.pop(), match))
        if not leads:
            output.append(artifact)
            continue
        content = dict(artifact.get("content", {}))
        content["items"] = [
            *(
                {"label": match.group(1), "targetPage": int(match.group(2)), "level": 1}
                for _lead, match in leads
            ),
            *list(content.get("items", [])),
        ]
        boxes = [
            value for value in [*(lead.get("bbox") for lead, _match in leads), artifact.get("bbox")]
            if value is not None
        ]
        confidence = min([
            *(float(lead.get("confidence") or 0) for lead, _match in leads),
            float(artifact.get("confidence") or 0),
        ])
        source_bboxes = [
            {"page": int(lead["pages"][0]), "bbox": lead["bbox"]}
            for lead, _match in leads
        ]
        output.append(make_artifact(
            source_hash, "list", artifact["pages"], _union(boxes), content,
            subtype="table-of-contents", confidence=confidence, quality="reconstructed",
            source_bboxes=[
                *source_bboxes,
                *artifact.get("sourceBboxes", [
                    {"page": int(artifact["pages"][0]), "bbox": artifact["bbox"]},
                ]),
            ],
        ))
    return output


def _merge_monospace_blocks(blocks: Sequence[_TextBlock]) -> List[_TextBlock]:
    merged: List[_TextBlock] = []
    for block in sorted(blocks, key=lambda item: (item.bbox[1], item.bbox[0])):
        if not merged:
            merged.append(block)
            continue
        previous = merged[-1]
        vertical_gap = block.bbox[1] - previous.bbox[3]
        if previous.mono_ratio >= 0.55 and block.mono_ratio >= 0.55 and vertical_gap <= 20:
            union = _union([previous.bbox, block.bbox])
            merged[-1] = _TextBlock(
                previous.page,
                union if union is not None else previous.bbox,
                previous.text.rstrip() + "\n" + block.text.lstrip(),
                max(previous.max_size, block.max_size),
                previous.bold and block.bold,
                min(previous.mono_ratio, block.mono_ratio),
                previous.order,
            )
        else:
            merged.append(block)
    return merged


def _header_similarity(left: Sequence[Any], right: Sequence[Any]) -> float:
    a = "|".join(_clean_cell(value).casefold() for value in left)
    b = "|".join(_clean_cell(value).casefold() for value in right)
    return SequenceMatcher(None, a, b).ratio() if a and b else 0.0


def _stitch_tables(
    artifacts: Sequence[Dict[str, Any]], pages: Sequence[Dict[str, Any]], source_hash: str,
) -> List[Dict[str, Any]]:
    page_height = {int(page["number"]): float(page["height"]) for page in pages}
    output: List[Dict[str, Any]] = []
    for artifact in artifacts:
        if artifact.get("type") != "table" or not output or output[-1].get("type") != "table":
            output.append(artifact)
            continue
        previous = output[-1]
        previous_page = int(previous["pages"][-1])
        current_page = int(artifact["pages"][0])
        left, right = previous["content"], artifact["content"]
        previous_box = previous.get("sourceBboxes", [{"bbox": previous["bbox"]}])[-1]["bbox"]
        current_box = artifact.get("sourceBboxes", [{"bbox": artifact["bbox"]}])[0]["bbox"]
        same_columns = left.get("columns") == right.get("columns")
        aligned = abs(float(previous_box[0]) - float(current_box[0])) <= 24 and abs(
            float(previous_box[2]) - float(current_box[2])
        ) <= 24
        boundary = (
            float(previous_box[3]) >= page_height[previous_page] * 0.75
            and float(current_box[1]) <= page_height[current_page] * 0.28
        )
        previous_header = left.get("grid", [[]])[0] if left.get("headerRows") else []
        current_header = right.get("grid", [[]])[0] if right.get("headerRows") else []
        header_match = _header_similarity(previous_header, current_header) >= 0.82
        if not (
            current_page == previous_page + 1 and same_columns and aligned and boundary and header_match
        ):
            output.append(artifact)
            continue
        current_rows = list(right["grid"])
        if current_header:
            current_rows = current_rows[1:]
        merged_grid = [*left["grid"], *current_rows]
        merged_cells = [
            {"row": row, "column": column, "text": text, "rowSpan": 1, "colSpan": 1, "bbox": None}
            for row, values in enumerate(merged_grid) for column, text in enumerate(values)
        ]
        content = {
            **left,
            "rows": len(merged_grid),
            "grid": merged_grid,
            "cells": merged_cells,
            "stitched": True,
            "repeatedHeadersRemoved": int(bool(current_header)),
        }
        merged = make_artifact(
            source_hash, "table", [*previous["pages"], current_page], previous["bbox"], content,
            subtype="cross-page-grid", confidence=0.94, quality="validated",
            source_bboxes=[*previous.get("sourceBboxes", []), *artifact.get("sourceBboxes", [])],
        )
        output[-1] = merged
    return output


def _stitch_monospace_artifacts(
    artifacts: Sequence[Dict[str, Any]], pages: Sequence[Dict[str, Any]], source_hash: str,
) -> List[Dict[str, Any]]:
    page_height = {int(page["number"]): float(page["height"]) for page in pages}
    output: List[Dict[str, Any]] = []
    for artifact in artifacts:
        if not output:
            output.append(artifact)
            continue
        previous = output[-1]
        same_subtype = artifact.get("subtype") == previous.get("subtype")
        compatible = (
            same_subtype
            and artifact.get("type") in {"code", "diagram"}
            and previous.get("type") == artifact.get("type")
        )
        previous_page = int(previous.get("pages", [0])[-1])
        current_page = int(artifact.get("pages", [0])[0])
        boundary = (
            previous.get("bbox") is not None and artifact.get("bbox") is not None
            and float(previous["bbox"][3]) >= page_height.get(previous_page, 1.0) * 0.88
            and float(artifact["bbox"][1]) <= page_height.get(current_page, 1.0) * 0.16
        )
        if not (compatible and current_page == previous_page + 1 and boundary):
            output.append(artifact)
            continue
        content = dict(previous["content"])
        content["text"] = str(previous["content"].get("text", "")).rstrip() + "\n" + str(
            artifact["content"].get("text", "")
        ).lstrip()
        if previous.get("subtype") == "ascii-diagram":
            content["graph"] = build_ascii_diagram_graph(str(content["text"]))
        output[-1] = make_artifact(
            source_hash, str(previous["type"]), [*previous["pages"], *artifact["pages"]],
            previous["bbox"], content, subtype=previous.get("subtype"),
            semantic=bool(previous.get("semantic", True)), confidence=min(
                float(previous.get("confidence") or 0), float(artifact.get("confidence") or 0),
            ), quality="validated",
            source_bboxes=[*previous.get("sourceBboxes", [
                {"page": previous_page, "bbox": previous["bbox"]},
            ]), *artifact.get("sourceBboxes", [
                {"page": current_page, "bbox": artifact["bbox"]},
            ])],
        )
    return output


def _attach_section_relations(artifacts: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    relations: List[Dict[str, Any]] = []
    current_heading: Optional[str] = None
    semantic_predicate = {
        "table": "DESCRIBES",
        "figure": "DEPICTS",
        "diagram": "DEPICTS",
        "chart": "DEPICTS",
        "code": "IMPLEMENTS",
    }
    for artifact in artifacts:
        if artifact["type"] == "heading":
            current_heading = artifact["id"]
            continue
        if current_heading and artifact["type"] != "heading":
            relation = {
                "from": artifact["id"], "predicate": "PART_OF", "to": current_heading,
                "confidence": 0.9,
            }
            artifact["relations"].append(relation)
            relations.append(relation)
            predicate = semantic_predicate.get(str(artifact["type"]))
            if predicate is not None:
                semantic_relation = {
                    "from": artifact["id"], "predicate": predicate, "to": current_heading,
                    "confidence": 0.75,
                }
                artifact["relations"].append(semantic_relation)
                relations.append(semantic_relation)
    return relations


def extract_pdf_ast(path: str, *, min_chars: int = 32) -> Dict[str, Any]:
    """Extract a PDF into typed, page-addressed artifacts without serializing Markdown."""
    try:
        pymupdf: Any = importlib.import_module("pymupdf")
    except ImportError:
        raise ExternalConverterRequired(".pdf") from None
    try:
        pdf: Any = pymupdf.open(path)
    except Exception as error:  # noqa: BLE001
        raise ConversionError(f"PYMUPDF_LAYOUT_OPEN:{error}") from error
    source_hash = source_sha256(path)
    pages: List[Dict[str, Any]] = []
    blocks_by_page: Dict[int, List[_TextBlock]] = {}
    tables_by_page: Dict[int, List[Dict[str, Any]]] = {}
    figures_by_page: Dict[int, List[Dict[str, Any]]] = {}
    vectors_by_page: Dict[int, Optional[Dict[str, Any]]] = {}
    try:
        for page_index, page in enumerate(pdf):
            number = page_index + 1
            pages.append({"number": number, "width": float(page.rect.width), "height": float(page.rect.height)})
            text_blocks = _extract_text_blocks(page, number)
            tables = _extract_tables(page, number, source_hash)
            tables.extend(_extract_layout_tables(
                page, number, source_hash, text_blocks, [artifact["bbox"] for artifact in tables],
            ))
            table_boxes = [artifact["bbox"] for artifact in tables]
            blocks_by_page[number] = text_blocks
            tables_by_page[number] = tables
            figures_by_page[number] = _image_artifacts(page, number, source_hash)
            vectors_by_page[number] = _vector_artifact(
                page, number, source_hash, text_blocks, table_boxes,
            )
    finally:
        version = str(getattr(pymupdf, "VersionBind", "unknown"))
        pdf.close()

    native_text = "\n".join(block.text for blocks in blocks_by_page.values() for block in blocks)
    if len(native_text.strip()) < min_chars:
        raise ExternalConverterRequired(".pdf")
    furniture = _repeated_furniture(blocks_by_page, pages)
    font_sizes = [block.max_size for blocks in blocks_by_page.values() for block in blocks if block.max_size > 0]
    median_size = statistics.median(font_sizes) if font_sizes else 10.0
    heading_sizes = sorted({size for size in font_sizes if size >= median_size * 1.22}, reverse=True) or [median_size]

    artifacts: List[Dict[str, Any]] = []
    for page in pages:
        number = int(page["number"])
        tables = tables_by_page[number]
        table_boxes = [artifact["bbox"] for artifact in tables]
        vector = vectors_by_page[number]
        vector_box = vector["bbox"] if vector is not None else None
        page_artifacts: List[Dict[str, Any]] = [*tables, *figures_by_page[number]]
        if vector is not None:
            page_artifacts.append(vector)
        eligible_blocks: List[_TextBlock] = []
        for block_index, block in enumerate(blocks_by_page[number]):
            if (number, block_index) in furniture or _PAGE_NUMBER.match(block.text.strip()):
                continue
            if any(_overlap(block.bbox, box) >= 0.5 for box in table_boxes):
                continue
            if vector_box is not None and _overlap(block.bbox, vector_box) >= 0.65:
                continue
            eligible_blocks.append(block)
        page_artifacts.extend(
            _text_artifact(block, source_hash, median_size, heading_sizes)
            for block in _merge_monospace_blocks(eligible_blocks)
        )
        page_artifacts.sort(key=lambda item: (
            float(item["bbox"][1]) if item.get("bbox") else 0.0,
            float(item["bbox"][0]) if item.get("bbox") else 0.0,
        ))
        artifacts.extend(page_artifacts)
    artifacts = _stitch_tables(artifacts, pages, source_hash)
    artifacts = _stitch_monospace_artifacts(artifacts, pages, source_hash)
    artifacts = _normalize_headings(artifacts, source_hash)
    artifacts = _merge_toc_lead_ins(artifacts, source_hash)
    relations = _attach_section_relations(artifacts)
    return build_document_ast(
        path, pages, artifacts, extractor="pymupdf-layout", version=version, relations=relations,
    )
