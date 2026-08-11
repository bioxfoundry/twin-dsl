"""Deterministic GraphArtifact construction and projections for document diagrams.

The parser is deliberately conservative.  It only promotes labels that already occur in the
source transcription and only emits edges supported by an explicit arrow or ``v`` connector.
No language model participates in this path.
"""

from __future__ import annotations

import hashlib
import html
import json
import re
from typing import Any, Dict, List, Optional, Sequence, Tuple

DIAGRAM_GRAPH_SCHEMA = "f2md.diagram-graph/v1"

_BORDER = re.compile(r"^\+[-+=]+(?:\+[-+=]*)*\+$")
_BRACKET_NODE = re.compile(r"^\[([^\]]{2,120})\]$")
_TREE_MARKER = re.compile(r"(?:├──|└──)")
_DECORATION = re.compile(r"^[|+\\/\s─│├└┌┐┘┬┴=_-]+$")
_NODE_ID = re.compile(r"^node-[a-z0-9-]+-[a-f0-9]{10}$")
_EDGE_ID = re.compile(r"^edge-[a-f0-9]{10}$")


def _normalized(value: str) -> str:
    return re.sub(r"[^\w]+", " ", value.casefold(), flags=re.UNICODE).strip()


def _clean_label(value: str) -> str:
    label = value.strip().strip("|").strip()
    label = re.sub(r"^[│├└─\s]+", "", label)
    label = re.sub(r"[│├└─\s]+$", "", label)
    bracket = _BRACKET_NODE.fullmatch(label)
    if bracket:
        label = bracket.group(1).strip()
    label = re.sub(r"\s+", " ", label).strip()
    return label


def _valid_label(value: str) -> bool:
    return (
        2 <= len(value) <= 120
        and not _DECORATION.fullmatch(value)
        and not value.startswith(("- ", "• ", "("))
        and bool(re.search(r"[^\W\d_]", value, flags=re.UNICODE))
    )


def _node_id(label: str, line: int, occurrence: int) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", label.casefold()).strip("-")[:32] or "node"
    digest = hashlib.sha256(
        json.dumps([label, line, occurrence], ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    ).hexdigest()[:10]
    return f"node-{slug}-{digest}"


def _meaningful_line(lines: Sequence[str], start: int, step: int) -> Optional[Tuple[int, str]]:
    index = start
    while 0 <= index < len(lines):
        raw = lines[index].strip()
        label = _clean_label(raw)
        if _valid_label(label) and not _BORDER.fullmatch(raw) and raw.casefold() not in {"v", "^"}:
            return index, label
        index += step
    return None


def build_ascii_diagram_graph(text: str) -> Optional[Dict[str, Any]]:
    """Build a provenance-bound graph from explicit ASCII boxes, nodes and arrows."""
    lines = [line.rstrip() for line in text.splitlines()]
    candidates: List[Tuple[int, str]] = []

    def add(line: int, label: str) -> None:
        cleaned = _clean_label(label)
        item = (line, cleaned)
        if _valid_label(cleaned) and item not in candidates:
            candidates.append(item)

    for index, raw in enumerate(lines):
        stripped = raw.strip()
        bracket = _BRACKET_NODE.fullmatch(stripped)
        if bracket:
            add(index, bracket.group(1))
        if _TREE_MARKER.search(stripped):
            add(index, _TREE_MARKER.split(stripped, maxsplit=1)[-1])
        if stripped.startswith("| "):
            add(index, stripped)

    # A boxed region may have lost its horizontal coordinates during text extraction.  Its first
    # non-decorative line is still a source-backed node label; descriptions and bullet lists remain
    # inside the node rather than becoming invented graph vertices.
    borders = [index for index, line in enumerate(lines) if _BORDER.fullmatch(line.strip())]
    for left, right in zip(borders, borders[1:]):
        if right - left <= 1:
            continue
        for index in range(left + 1, right):
            raw = lines[index].strip()
            label = _clean_label(raw)
            if _valid_label(label) and not raw.startswith(("-", "•")):
                add(index, label)
                break

    if any(_TREE_MARKER.search(line) for line in lines):
        root = _meaningful_line(lines, 0, 1)
        if root is not None:
            add(*root)

    # Arrow tables often have no boxes (for example ``/topic ---> Twin.Property``).  The adjacent
    # labels are admissible because both are present verbatim in the same source transcription.
    arrow_lines: List[Tuple[int, str]] = []
    for index, raw in enumerate(lines):
        if "--->" not in raw and "<---" not in raw:
            continue
        before = _meaningful_line(lines, index - 1, -1)
        after = _meaningful_line(lines, index + 1, 1)
        if before is not None and after is not None:
            add(*before)
            add(*after)
            arrow_lines.append((index, "left" if "<---" in raw else "right"))

    candidates.sort(key=lambda item: (item[0], item[1].encode("utf-8")))
    if len(candidates) < 2:
        return None

    occurrences: Dict[str, int] = {}
    nodes: List[Dict[str, Any]] = []
    for line, label in candidates:
        occurrences[label] = occurrences.get(label, 0) + 1
        nodes.append({
            "id": _node_id(label, line, occurrences[label]),
            "label": label,
            "sourceLines": [line + 1],
        })

    def nearest(line: int, direction: int) -> Optional[Dict[str, Any]]:
        eligible = [
            node for node in nodes
            if (int(node["sourceLines"][0]) - 1 - line) * direction > 0
        ]
        if not eligible:
            return None
        return min(eligible, key=lambda node: abs(int(node["sourceLines"][0]) - 1 - line))

    edge_specs: List[Tuple[str, str, int, float]] = []
    for line, direction in arrow_lines:
        previous = nearest(line, -1)
        following = nearest(line, 1)
        if previous is None or following is None:
            continue
        source, target = (following, previous) if direction == "left" else (previous, following)
        edge_specs.append((str(source["id"]), str(target["id"]), line + 1, 0.96))

    for index, raw in enumerate(lines):
        if raw.strip().casefold() != "v":
            continue
        previous = nearest(index, -1)
        following = nearest(index, 1)
        if previous is not None and following is not None:
            edge_specs.append((str(previous["id"]), str(following["id"]), index + 1, 0.92))

    edges: List[Dict[str, Any]] = []
    seen_edges: set[Tuple[str, str]] = set()
    for edge_source_id, edge_target_id, source_line, confidence in edge_specs:
        if edge_source_id == edge_target_id or (edge_source_id, edge_target_id) in seen_edges:
            continue
        seen_edges.add((edge_source_id, edge_target_id))
        digest = hashlib.sha256(
            f"{edge_source_id}\0{edge_target_id}\0{source_line}".encode("utf-8")
        ).hexdigest()[:10]
        edges.append({
            "id": f"edge-{digest}",
            "from": edge_source_id,
            "to": edge_target_id,
            "directed": True,
            "confidence": confidence,
            "sourceLines": [source_line],
        })

    graph: Dict[str, Any] = {
        "schema": DIAGRAM_GRAPH_SCHEMA,
        "generation": "deterministic-ascii-v1",
        "sourceTextSha256": hashlib.sha256(text.encode("utf-8")).hexdigest(),
        "nodes": nodes,
        "edges": edges,
    }
    graph["validation"] = diagram_graph_metrics(graph, text)
    return graph


def diagram_graph_metrics(graph: Any, source_text: str) -> Dict[str, Any]:
    """Validate graph identity, label provenance and edge endpoints without repairing anything."""
    nodes = graph.get("nodes", []) if isinstance(graph, dict) else []
    edges = graph.get("edges", []) if isinstance(graph, dict) else []
    source_hash_matches = (
        isinstance(graph, dict)
        and graph.get("sourceTextSha256") == hashlib.sha256(source_text.encode("utf-8")).hexdigest()
    )
    if not isinstance(nodes, list) or not isinstance(edges, list):
        return {
            "valid": False, "nodes": 0, "edges": 0, "nodeLabelsInSource": 0,
            "labelCoverage": 0.0, "danglingEdges": 0, "meanEdgeConfidence": None,
            "sourceHashMatches": source_hash_matches,
        }
    source_line_count = len(source_text.splitlines())

    def valid_source_lines(value: Any) -> bool:
        return (
            isinstance(value, list)
            and bool(value)
            and all(
                isinstance(line, int) and not isinstance(line, bool)
                and 1 <= line <= source_line_count
                for line in value
            )
        )

    nodes_well_formed = all(
        isinstance(node, dict)
        and isinstance(node.get("id"), str)
        and _NODE_ID.fullmatch(node["id"]) is not None
        and isinstance(node.get("label"), str)
        and _valid_label(node["label"])
        and valid_source_lines(node.get("sourceLines"))
        for node in nodes
    )
    node_ids = [node.get("id") for node in nodes if isinstance(node, dict)]
    known = {value for value in node_ids if isinstance(value, str)}
    normalized_source = _normalized(source_text)
    labels_in_source = sum(
        bool(_normalized(str(node.get("label", ""))))
        and _normalized(str(node.get("label", ""))) in normalized_source
        for node in nodes if isinstance(node, dict)
    )
    dangling = sum(
        not isinstance(edge, dict)
        or edge.get("from") not in known
        or edge.get("to") not in known
        or edge.get("from") == edge.get("to")
        for edge in edges
    )
    confidences = [
        float(edge["confidence"]) for edge in edges
        if isinstance(edge, dict)
        and isinstance(edge.get("confidence"), (int, float))
        and not isinstance(edge.get("confidence"), bool)
    ]
    unique_nodes = len(known) == len(nodes) and len(node_ids) == len(nodes)
    edge_ids = [edge.get("id") for edge in edges if isinstance(edge, dict)]
    unique_edges = len(set(edge_ids)) == len(edges) and len(edge_ids) == len(edges)
    edges_well_formed = all(
        isinstance(edge, dict)
        and isinstance(edge.get("id"), str)
        and _EDGE_ID.fullmatch(edge["id"]) is not None
        and isinstance(edge.get("from"), str)
        and isinstance(edge.get("to"), str)
        and isinstance(edge.get("directed"), bool)
        and isinstance(edge.get("confidence"), (int, float))
        and not isinstance(edge.get("confidence"), bool)
        and 0 <= float(edge["confidence"]) <= 1
        and valid_source_lines(edge.get("sourceLines"))
        for edge in edges
    )
    valid = (
        isinstance(graph, dict)
        and graph.get("schema") == DIAGRAM_GRAPH_SCHEMA
        and graph.get("generation") in {"deterministic-ascii-v1", "deterministic-layout-v1"}
        and source_hash_matches
        and len(nodes) >= 2
        and unique_nodes
        and nodes_well_formed
        and unique_edges
        and edges_well_formed
        and labels_in_source == len(nodes)
        and dangling == 0
    )
    return {
        "valid": valid,
        "nodes": len(nodes),
        "edges": len(edges),
        "nodeLabelsInSource": labels_in_source,
        "labelCoverage": round(labels_in_source / len(nodes), 4) if nodes else 0.0,
        "danglingEdges": dangling,
        "meanEdgeConfidence": round(sum(confidences) / len(confidences), 4) if confidences else None,
        "sourceHashMatches": source_hash_matches,
    }


def render_diagram_mermaid(graph: Dict[str, Any], source_text: str) -> str:
    metrics = diagram_graph_metrics(graph, source_text)
    if not metrics["valid"]:
        raise ValueError("DIAGRAM_GRAPH_INVALID")
    lines = ["flowchart TD"]
    for node in graph["nodes"]:
        label = html.escape(str(node["label"]), quote=True).replace("\n", "<br/>")
        lines.append(f"  {node['id']}[\"{label}\"]")
    for edge in graph["edges"]:
        connector = "-->" if edge.get("directed") else "---"
        lines.append(f"  {edge['from']} {connector} {edge['to']}")
    return "\n".join(lines) + "\n"


def render_diagram_svg(graph: Dict[str, Any], source_text: str) -> str:
    metrics = diagram_graph_metrics(graph, source_text)
    if not metrics["valid"]:
        raise ValueError("DIAGRAM_GRAPH_INVALID")
    nodes = list(graph["nodes"])
    columns = 2 if len(nodes) > 3 else 1
    node_width, node_height = 360, 64
    gap_x, gap_y, margin = 80, 48, 40
    rows = (len(nodes) + columns - 1) // columns
    width = margin * 2 + columns * node_width + (columns - 1) * gap_x
    height = margin * 2 + rows * node_height + max(0, rows - 1) * gap_y
    positions: Dict[str, Tuple[float, float]] = {}
    for index, node in enumerate(nodes):
        row, column = divmod(index, columns)
        positions[str(node["id"])] = (
            float(margin + column * (node_width + gap_x)),
            float(margin + row * (node_height + gap_y)),
        )
    output = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
        "  <defs><marker id=\"arrow\" markerWidth=\"10\" markerHeight=\"7\" refX=\"9\" refY=\"3.5\" orient=\"auto\"><path d=\"M0,0 L10,3.5 L0,7 Z\" fill=\"#334155\"/></marker></defs>",
        '  <rect width="100%" height="100%" fill="#ffffff"/>',
    ]
    for edge in graph["edges"]:
        source = positions[str(edge["from"])]
        target = positions[str(edge["to"])]
        x1, y1 = source[0] + node_width / 2, source[1] + node_height / 2
        x2, y2 = target[0] + node_width / 2, target[1] + node_height / 2
        marker = ' marker-end="url(#arrow)"' if edge.get("directed") else ""
        output.append(
            f'  <line x1="{x1:.2f}" y1="{y1:.2f}" x2="{x2:.2f}" y2="{y2:.2f}" stroke="#334155" stroke-width="2"{marker}/>'
        )
    for node in nodes:
        x, y = positions[str(node["id"])]
        label = html.escape(str(node["label"]))
        output.extend([
            f'  <rect x="{x:.2f}" y="{y:.2f}" width="{node_width}" height="{node_height}" rx="8" fill="#eff6ff" stroke="#2563eb" stroke-width="2"/>',
            f'  <text x="{x + node_width / 2:.2f}" y="{y + node_height / 2 + 5:.2f}" text-anchor="middle" font-family="sans-serif" font-size="15" fill="#0f172a">{label}</text>',
        ])
    output.append("</svg>")
    return "\n".join(output) + "\n"


def render_diagram_dsl(artifact_urn: str, graph: Dict[str, Any], source_text: str) -> str:
    metrics = diagram_graph_metrics(graph, source_text)
    if not metrics["valid"]:
        raise ValueError("DIAGRAM_GRAPH_INVALID")
    lines = [
        f"DIAGRAM_GRAPH {artifact_urn}",
        f"SCHEMA {graph['schema']}",
        f"GENERATION {graph['generation']}",
    ]
    for node in graph["nodes"]:
        lines.append(f"NODE {node['id']} {json.dumps(node['label'], ensure_ascii=False)}")
    for edge in graph["edges"]:
        lines.append(
            f"EDGE {edge['id']} {edge['from']} {edge['to']} "
            f"DIRECTED {'true' if edge.get('directed') else 'false'} CONFIDENCE {edge['confidence']}"
        )
    lines.extend([
        f"NODE_COVERAGE {metrics['nodeLabelsInSource']}/{metrics['nodes']}",
        f"DANGLING_EDGES {metrics['danglingEdges']}",
        f"SOURCE_TEXT_HASH {'PASS' if metrics['sourceHashMatches'] else 'FAIL'}",
        "RESULT PASS",
        "END_DIAGRAM_GRAPH",
    ])
    return "\n".join(lines) + "\n"
