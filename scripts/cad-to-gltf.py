#!/usr/bin/env python3
"""Deterministic CAD geometry compiler.

Bulk mode keeps the historical STL/STEP -> GLB bridge. Geometry-build mode adds the
fail-closed SCAD -> canonical 3MF -> GLB/USDA pipeline and emits a reproducible receipt.
Only Python's standard library is required for STL, 3MF, GLB, USDA and receipt handling.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import math
import os
import shlex
import shutil
import struct
import subprocess
import sys
import tempfile
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any, Iterable

SUPPORTED = {".stl", ".step", ".stp", ".3mf", ".scad", ".obj"}
CAD = {".stl", ".step", ".stp", ".f3d", ".scad", ".3mf", ".obj"}
UNIT_TO_M = {
    "micron": 1e-6,
    "millimeter": 1e-3,
    "centimeter": 1e-2,
    "meter": 1.0,
    "inch": 0.0254,
    "foot": 0.3048,
}
PROCESS_URI = "subactor://process/geometry/openscad/compile"


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    hasher = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def tree_hash(path: Path) -> str:
    if path.is_file():
        return sha256_file(path)
    if not path.is_dir():
        raise RuntimeError(f"GEOMETRY_DEPENDENCY_MISSING:{path}")
    hasher = hashlib.sha256()
    files = sorted(item for item in path.rglob("*") if item.is_file())
    if not files:
        raise RuntimeError(f"GEOMETRY_DEPENDENCY_EMPTY:{path}")
    for item in files:
        relative = item.relative_to(path).as_posix().encode()
        hasher.update(struct.pack("<I", len(relative)))
        hasher.update(relative)
        hasher.update(bytes.fromhex(sha256_file(item)))
    return hasher.hexdigest()


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


def content_uri(kind: str, digest: str) -> str:
    return f"urn:subactor:{kind}:sha256:{digest}"


def safe_relative(value: str, label: str) -> Path:
    candidate = Path(value)
    if candidate.is_absolute() or ".." in candidate.parts or not candidate.parts:
        raise RuntimeError(f"GEOMETRY_{label}_PATH_INVALID:{value}")
    return candidate


def resolve_declared(base: Path, value: str) -> Path:
    path = Path(value)
    return path.resolve() if path.is_absolute() else (base / path).resolve()


def bounds(values: list[float]) -> tuple[list[float], list[float]]:
    if len(values) < 3 or len(values) % 3:
        raise RuntimeError("GEOMETRY_VERTEX_TABLE_INVALID")
    if not all(math.isfinite(value) for value in values):
        raise RuntimeError("GEOMETRY_NON_FINITE")
    return ([min(values[i::3]) for i in range(3)], [max(values[i::3]) for i in range(3)])


def triangle_normal(a: tuple[float, float, float], b: tuple[float, float, float], c: tuple[float, float, float]) -> tuple[float, float, float]:
    ab = tuple(b[i] - a[i] for i in range(3))
    ac = tuple(c[i] - a[i] for i in range(3))
    raw = (ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0])
    length = math.hypot(*raw)
    return tuple(value / length for value in raw) if length else (0.0, 0.0, 0.0)


def write_glb(positions: list[float], normals: list[float], target: Path) -> None:
    if len(positions) != len(normals) or not positions:
        raise RuntimeError("GEOMETRY_GLTF_ATTRIBUTE_TABLE_INVALID")
    pos = struct.pack("<%sf" % len(positions), *positions)
    nrm = struct.pack("<%sf" % len(normals), *normals)
    blob = pos + nrm
    while len(blob) % 4:
        blob += b"\0"
    pmin, pmax = bounds(positions)
    document = {
        "asset": {"version": "2.0", "generator": "subactor-geometry-compiler"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0}],
        "meshes": [{"primitives": [{"attributes": {"POSITION": 0, "NORMAL": 1}, "mode": 4}]}],
        "accessors": [
            {"bufferView": 0, "componentType": 5126, "count": len(positions) // 3, "type": "VEC3", "min": pmin, "max": pmax},
            {"bufferView": 1, "componentType": 5126, "count": len(normals) // 3, "type": "VEC3"},
        ],
        "bufferViews": [
            {"buffer": 0, "byteOffset": 0, "byteLength": len(pos), "target": 34962},
            {"buffer": 0, "byteOffset": len(pos), "byteLength": len(nrm), "target": 34962},
        ],
        "buffers": [{"byteLength": len(blob)}],
    }
    encoded = canonical_json(document).encode()
    while len(encoded) % 4:
        encoded += b" "
    glb = struct.pack("<4sII", b"glTF", 2, 12 + 8 + len(encoded) + 8 + len(blob))
    glb += struct.pack("<I4s", len(encoded), b"JSON") + encoded
    glb += struct.pack("<I4s", len(blob), b"BIN\0") + blob
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(glb)


def read_mtl(path: Path) -> dict[str, dict[str, Any]]:
    """Read the deterministic subset of MTL needed for glTF PBR appearance."""
    materials: dict[str, dict[str, Any]] = {}
    current: dict[str, Any] | None = None
    if not path.is_file():
        return materials
    for raw in path.read_text(encoding="utf-8", errors="replace").splitlines():
        fields = raw.strip().split()
        if not fields or fields[0].startswith("#"):
            continue
        if fields[0].lower() == "newmtl" and len(fields) > 1:
            current = materials.setdefault(" ".join(fields[1:]), {})
        elif current is not None and fields[0].lower() in {"kd", "ks"} and len(fields) >= 4:
            current[fields[0].lower()] = [float(value) for value in fields[1:4]]
        elif current is not None and fields[0].lower() in {"d", "tr", "ns", "ni"} and len(fields) >= 2:
            current[fields[0].lower()] = float(fields[1])
    return materials


def write_indexed_glb(
    positions: list[float],
    normals: list[float],
    groups: list[dict[str, Any]],
    material_source: dict[str, dict[str, Any]],
    target: Path,
    name: str,
) -> None:
    if len(positions) != len(normals) or not positions or not groups:
        raise RuntimeError("GEOMETRY_GLTF_INDEXED_TABLE_INVALID")
    pos = struct.pack("<%sf" % len(positions), *positions)
    nrm = struct.pack("<%sf" % len(normals), *normals)
    chunks = [pos, nrm]
    buffer_views: list[dict[str, Any]] = [
        {"buffer": 0, "byteOffset": 0, "byteLength": len(pos), "target": 34962},
        {"buffer": 0, "byteOffset": len(pos), "byteLength": len(nrm), "target": 34962},
    ]
    accessors: list[dict[str, Any]] = [
        {"bufferView": 0, "componentType": 5126, "count": len(positions) // 3, "type": "VEC3", "min": bounds(positions)[0], "max": bounds(positions)[1]},
        {"bufferView": 1, "componentType": 5126, "count": len(normals) // 3, "type": "VEC3"},
    ]
    offset = len(pos) + len(nrm)
    material_names = list(dict.fromkeys(str(group["material"]) for group in groups))
    material_index = {value: index for index, value in enumerate(material_names)}
    materials = []
    for material_name in material_names:
        source = material_source.get(material_name, {})
        color = [max(0.0, min(1.0, float(value))) for value in source.get("kd", [0.62, 0.64, 0.66])]
        alpha = max(0.0, min(1.0, float(source.get("d", 1.0 - source.get("tr", 0.0)))))
        shininess = max(0.0, float(source.get("ns", 128.0)))
        roughness = max(0.04, min(1.0, math.sqrt(2.0 / (shininess + 2.0))))
        specular = source.get("ks", [0.0, 0.0, 0.0])
        metallic = max(0.0, min(1.0, sum(float(value) for value in specular) / 3.0))
        materials.append({
            "name": material_name,
            "pbrMetallicRoughness": {"baseColorFactor": [*color, alpha], "metallicFactor": metallic, "roughnessFactor": roughness},
            **({"alphaMode": "BLEND", "doubleSided": True} if alpha < 0.999 else {}),
        })
    primitives = []
    for group in groups:
        indices = list(group["indices"])
        if not indices:
            continue
        data = struct.pack("<%sI" % len(indices), *indices)
        while len(data) % 4:
            data += b"\0"
        view_index = len(buffer_views)
        accessor_index = len(accessors)
        buffer_views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(data), "target": 34963})
        accessors.append({
            "bufferView": view_index, "componentType": 5125, "count": len(indices), "type": "SCALAR",
            "min": [min(indices)], "max": [max(indices)],
        })
        chunks.append(data)
        offset += len(data)
        primitives.append({
            "attributes": {"POSITION": 0, "NORMAL": 1}, "indices": accessor_index, "mode": 4,
            "material": material_index[str(group["material"])],
            "extras": {"group": str(group["name"]), "sourceMaterial": str(group["material"])},
        })
    blob = b"".join(chunks)
    while len(blob) % 4:
        blob += b"\0"
    document = {
        "asset": {"version": "2.0", "generator": "subactor-geometry-compiler", "extras": {"sourceFormat": "obj", "provenancePreserved": ["groups", "normals", "materials"]}},
        "scene": 0, "scenes": [{"nodes": [0]}], "nodes": [{"name": name, "mesh": 0}],
        "meshes": [{"name": name, "primitives": primitives}], "materials": materials,
        "accessors": accessors, "bufferViews": buffer_views, "buffers": [{"byteLength": len(blob)}],
    }
    encoded = canonical_json(document).encode()
    while len(encoded) % 4:
        encoded += b" "
    glb = struct.pack("<4sII", b"glTF", 2, 12 + 8 + len(encoded) + 8 + len(blob))
    glb += struct.pack("<I4s", len(encoded), b"JSON") + encoded
    glb += struct.pack("<I4s", len(blob), b"BIN\0") + blob
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(glb)


def run_obj(source: Path, target: Path) -> None:
    """Convert OBJ to indexed multi-material GLB while preserving group identity."""
    source_positions: list[tuple[float, float, float]] = []
    source_normals: list[tuple[float, float, float]] = []
    positions: list[float] = []
    normals: list[float] = []
    vertex_map: dict[tuple[int, int], int] = {}
    groups: list[dict[str, Any]] = []
    active_name, active_material = "default", "default"
    active: dict[str, Any] = {"name": active_name, "material": active_material, "indices": []}
    groups.append(active)
    material_library: Path | None = None

    def obj_index(raw: str, length: int) -> int:
        value = int(raw)
        resolved = value - 1 if value > 0 else length + value
        if resolved < 0 or resolved >= length:
            raise RuntimeError("CAD_OBJ_INDEX_OUT_OF_BOUNDS")
        return resolved

    def switch_group() -> None:
        nonlocal active
        if not active["indices"]:
            active["name"], active["material"] = active_name, active_material
        else:
            active = {"name": active_name, "material": active_material, "indices": []}
            groups.append(active)

    with source.open("r", encoding="utf-8", errors="replace") as stream:
        for raw in stream:
            fields = raw.strip().split()
            if not fields or fields[0].startswith("#"):
                continue
            command = fields[0].lower()
            if command == "v" and len(fields) >= 4:
                source_positions.append(tuple(float(value) for value in fields[1:4]))
            elif command == "vn" and len(fields) >= 4:
                source_normals.append(tuple(float(value) for value in fields[1:4]))
            elif command == "mtllib" and len(fields) > 1:
                material_library = source.parent / " ".join(fields[1:])
            elif command in {"g", "o"}:
                active_name = " ".join(fields[1:]) or "default"
                switch_group()
            elif command == "usemtl":
                active_material = " ".join(fields[1:]) or "default"
                switch_group()
            elif command == "f" and len(fields) >= 4:
                face: list[tuple[int, int | None]] = []
                for token in fields[1:]:
                    parts = token.split("/")
                    position_index = obj_index(parts[0], len(source_positions))
                    normal_index = obj_index(parts[2], len(source_normals)) if len(parts) > 2 and parts[2] else None
                    face.append((position_index, normal_index))
                for offset in range(1, len(face) - 1):
                    triangle = [face[0], face[offset], face[offset + 1]]
                    fallback = triangle_normal(*(source_positions[item[0]] for item in triangle))
                    for position_index, normal_index in triangle:
                        key = (position_index, normal_index if normal_index is not None else -(len(active["indices"]) + 1))
                        output_index = vertex_map.get(key)
                        if output_index is None:
                            output_index = len(positions) // 3
                            vertex_map[key] = output_index
                            positions.extend(source_positions[position_index])
                            normals.extend(source_normals[normal_index] if normal_index is not None else fallback)
                        active["indices"].append(output_index)
    groups = [group for group in groups if group["indices"]]
    if not positions or not groups:
        raise RuntimeError("CAD_OBJ_FACE_TABLE_INVALID")
    write_indexed_glb(positions, normals, groups, read_mtl(material_library) if material_library else {}, target, source.stem)


def run_stl(source: Path, target: Path) -> None:
    """Write a minimal standards-compliant GLB directly from binary or ASCII STL."""
    raw = source.read_bytes()
    positions: list[float] = []
    normals: list[float] = []
    count = struct.unpack_from("<I", raw, 80)[0] if len(raw) >= 84 else 0
    if count and 84 + count * 50 <= len(raw):
        for index in range(count):
            offset = 84 + index * 50
            normal = struct.unpack_from("<3f", raw, offset)
            for vertex in range(3):
                positions.extend(struct.unpack_from("<3f", raw, offset + 12 + vertex * 12))
                normals.extend(normal)
    else:
        text = raw.decode("utf-8", errors="ignore")
        values: list[float] = []
        for line in text.splitlines():
            fields = line.strip().split()
            if len(fields) == 4 and fields[0].lower() == "vertex":
                values.extend(float(value) for value in fields[1:])
        if len(values) < 9 or len(values) % 9:
            raise RuntimeError("CAD_STL_FACET_TABLE_INVALID")
        for index in range(0, len(values), 9):
            vertices = [tuple(values[index + vertex:index + vertex + 3]) for vertex in (0, 3, 6)]
            normal = triangle_normal(*vertices)
            positions.extend(values[index:index + 9])
            normals.extend(normal * 3)
    write_glb(positions, normals, target)


def run_step(source: Path, target: Path) -> None:
    dependencies = os.environ.get("CADQUERY_PATH", "/tmp/cadquery-deps")
    if dependencies not in sys.path:
        sys.path.insert(0, dependencies)
    try:
        import cadquery as cq  # type: ignore
    except Exception as exc:
        raise RuntimeError("CAD_TESSELLATOR_BACKEND_REQUIRED:.step:" + str(exc)) from exc
    with tempfile.NamedTemporaryFile(suffix=".stl") as mesh:
        shape = cq.importers.importStep(str(source))
        cq.exporters.export(shape, mesh.name, exportType="STL")
        run_stl(Path(mesh.name), target)


def identity_transform() -> tuple[float, ...]:
    return (1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0)


def parse_transform(raw: str | None) -> tuple[float, ...]:
    if not raw:
        return identity_transform()
    values = tuple(float(value) for value in raw.split())
    if len(values) != 12 or not all(math.isfinite(value) for value in values):
        raise RuntimeError("GEOMETRY_3MF_TRANSFORM_INVALID")
    return values


def transform_point(point: tuple[float, float, float], transform: tuple[float, ...]) -> tuple[float, float, float]:
    x, y, z = point
    # 3MF uses an affine 4x3 row-vector transform.
    return (
        x * transform[0] + y * transform[3] + z * transform[6] + transform[9],
        x * transform[1] + y * transform[4] + z * transform[7] + transform[10],
        x * transform[2] + y * transform[5] + z * transform[8] + transform[11],
    )


def compose_transform(first: tuple[float, ...], second: tuple[float, ...]) -> tuple[float, ...]:
    origin = transform_point(transform_point((0, 0, 0), first), second)
    axes = []
    for point in ((1, 0, 0), (0, 1, 0), (0, 0, 1)):
        transformed = transform_point(transform_point(point, first), second)
        axes.append(tuple(transformed[i] - origin[i] for i in range(3)))
    return (
        axes[0][0], axes[0][1], axes[0][2],
        axes[1][0], axes[1][1], axes[1][2],
        axes[2][0], axes[2][1], axes[2][2],
        origin[0], origin[1], origin[2],
    )


def read_3mf(source: Path) -> tuple[str, list[tuple[float, float, float]], list[tuple[int, int, int]]]:
    try:
        with zipfile.ZipFile(source) as package:
            names = sorted(name for name in package.namelist() if name.lower().endswith(".model"))
            if not names:
                raise RuntimeError("GEOMETRY_3MF_MODEL_MISSING")
            root = ET.fromstring(package.read(names[0]))
    except zipfile.BadZipFile as exc:
        raise RuntimeError("GEOMETRY_3MF_PACKAGE_INVALID") from exc
    unit = root.attrib.get("unit", "millimeter").lower()
    if unit not in UNIT_TO_M:
        raise RuntimeError(f"GEOMETRY_UNIT_UNKNOWN:{unit}")
    resources = root.find("{*}resources")
    if resources is None:
        raise RuntimeError("GEOMETRY_3MF_RESOURCES_MISSING")
    objects: dict[str, dict[str, Any]] = {}
    for element in resources.findall("{*}object"):
        object_id = element.attrib.get("id")
        if not object_id:
            continue
        mesh = element.find("{*}mesh")
        components = element.find("{*}components")
        if mesh is not None:
            vertices_node = mesh.find("{*}vertices")
            triangles_node = mesh.find("{*}triangles")
            if vertices_node is None or triangles_node is None:
                raise RuntimeError("GEOMETRY_3MF_MESH_INVALID")
            vertices = [
                (float(vertex.attrib["x"]), float(vertex.attrib["y"]), float(vertex.attrib["z"]))
                for vertex in vertices_node.findall("{*}vertex")
            ]
            triangles = [
                (int(triangle.attrib["v1"]), int(triangle.attrib["v2"]), int(triangle.attrib["v3"]))
                for triangle in triangles_node.findall("{*}triangle")
            ]
            objects[object_id] = {"vertices": vertices, "triangles": triangles}
        elif components is not None:
            objects[object_id] = {
                "components": [
                    (component.attrib["objectid"], parse_transform(component.attrib.get("transform")))
                    for component in components.findall("{*}component")
                ]
            }

    output_vertices: list[tuple[float, float, float]] = []
    output_triangles: list[tuple[int, int, int]] = []
    active: set[str] = set()

    def flatten(object_id: str, transform: tuple[float, ...]) -> None:
        if object_id in active:
            raise RuntimeError("GEOMETRY_3MF_COMPONENT_CYCLE")
        item = objects.get(object_id)
        if item is None:
            raise RuntimeError(f"GEOMETRY_3MF_OBJECT_MISSING:{object_id}")
        active.add(object_id)
        if "vertices" in item:
            offset = len(output_vertices)
            output_vertices.extend(transform_point(point, transform) for point in item["vertices"])
            for triangle in item["triangles"]:
                if any(index < 0 or index >= len(item["vertices"]) for index in triangle):
                    raise RuntimeError("GEOMETRY_3MF_TRIANGLE_INDEX_INVALID")
                output_triangles.append(tuple(offset + index for index in triangle))
        else:
            for child_id, child_transform in item.get("components", []):
                flatten(child_id, compose_transform(child_transform, transform))
        active.remove(object_id)

    build = root.find("{*}build")
    items = build.findall("{*}item") if build is not None else []
    if items:
        for item in items:
            flatten(item.attrib["objectid"], parse_transform(item.attrib.get("transform")))
    else:
        for object_id, item in objects.items():
            if "vertices" in item:
                flatten(object_id, identity_transform())
    if not output_vertices or not output_triangles:
        raise RuntimeError("GEOMETRY_EMPTY_MESH")
    return unit, output_vertices, output_triangles


def geometry_hash(unit: str, vertices: Iterable[tuple[float, float, float]], triangles: Iterable[tuple[int, int, int]]) -> str:
    # OpenSCAD may serialize the same triangle soup using a different vertex/index order.
    # A physical identity hash must therefore follow geometry, not container ordering.
    vertex_table = list(vertices)
    faces: list[bytes] = []
    for triangle in triangles:
        points = sorted(tuple(round(value, 9) for value in vertex_table[index]) for index in triangle)
        faces.append(struct.pack("<9d", *(value for point in points for value in point)))
    faces.sort()
    hasher = hashlib.sha256(f"subactor.semantic-triangle-soup/v2\0{unit}\0".encode())
    for face in faces:
        hasher.update(face)
    return hasher.hexdigest()


def write_usda(vertices_m: list[tuple[float, float, float]], triangles: list[tuple[int, int, int]], target: Path) -> None:
    points = ",\n                ".join(f"({x:.12g}, {y:.12g}, {z:.12g})" for x, y, z in vertices_m)
    indices = ", ".join(str(index) for triangle in triangles for index in triangle)
    counts = ", ".join("3" for _ in triangles)
    text = (
        "#usda 1.0\n"
        "(\n    defaultPrim = \"Asset\"\n    metersPerUnit = 1\n    upAxis = \"Z\"\n)\n\n"
        "def Xform \"Asset\"\n{\n"
        "    def Mesh \"Mesh\"\n    {\n"
        f"        point3f[] points = [\n                {points}\n        ]\n"
        f"        int[] faceVertexCounts = [{counts}]\n"
        f"        int[] faceVertexIndices = [{indices}]\n"
        "        uniform token subdivisionScheme = \"none\"\n"
        "    }\n}\n"
    )
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding="utf-8")


def run_3mf(source: Path, target: Path, usda_target: Path | None = None) -> dict[str, Any]:
    unit, vertices, triangles = read_3mf(source)
    scale = UNIT_TO_M[unit]
    vertices_m = [tuple(value * scale for value in vertex) for vertex in vertices]
    positions: list[float] = []
    normals: list[float] = []
    for triangle in triangles:
        points = [vertices_m[index] for index in triangle]
        normal = triangle_normal(*points)
        for point in points:
            positions.extend(point)
            normals.extend(normal)
    write_glb(positions, normals, target)
    if usda_target:
        write_usda(vertices_m, triangles, usda_target)
    pmin, pmax = bounds([coordinate for vertex in vertices_m for coordinate in vertex])
    return {
        "unit": unit,
        "vertices": len(vertices_m),
        "triangles": len(triangles),
        "bboxM": {"min": pmin, "max": pmax},
        "geometryArtifactHash": geometry_hash(unit, vertices, triangles),
    }


def validate_glb(path: Path) -> dict[str, Any]:
    raw = path.read_bytes()
    if len(raw) < 20 or raw[:4] != b"glTF" or struct.unpack_from("<I", raw, 4)[0] != 2 or struct.unpack_from("<I", raw, 8)[0] != len(raw):
        raise RuntimeError("GEOMETRY_GLB_HEADER_INVALID")
    json_length, chunk_type = struct.unpack_from("<I4s", raw, 12)
    if chunk_type != b"JSON" or 20 + json_length > len(raw):
        raise RuntimeError("GEOMETRY_GLB_JSON_INVALID")
    document = json.loads(raw[20:20 + json_length].decode())
    primitive = document["meshes"][0]["primitives"][0]
    accessor = document["accessors"][primitive["attributes"]["POSITION"]]
    if accessor.get("componentType") != 5126 or accessor.get("type") != "VEC3" or int(accessor.get("count", 0)) < 3:
        raise RuntimeError("GEOMETRY_GLB_POSITION_ACCESSOR_INVALID")
    return {"vertices": int(accessor["count"]), "bboxM": {"min": accessor["min"], "max": accessor["max"]}}


def validate_usd(path: Path) -> tuple[bool, bool]:
    try:
        from pxr import Usd  # type: ignore
    except Exception:
        return False, False
    stage = Usd.Stage.Open(str(path))
    return True, bool(stage and stage.GetDefaultPrim())


def bbox_delta(first: dict[str, list[float]], second: dict[str, list[float]]) -> float:
    return max(abs(float(first[key][axis]) - float(second[key][axis])) for key in ("min", "max") for axis in range(3))


def bbox_extent(box: dict[str, list[float]]) -> list[float]:
    return [float(box["max"][axis]) - float(box["min"][axis]) for axis in range(3)]


def extent_delta(first: dict[str, list[float]], second: dict[str, list[float]]) -> float:
    return max(abs(a - b) for a, b in zip(bbox_extent(first), bbox_extent(second)))


def openscad_binary() -> str:
    configured = os.environ.get("OPENSCAD_BIN")
    local = Path(__file__).resolve().parent.parent / ".geometry-toolchain" / "openscad-2021.01" / "root" / "usr" / "bin" / "openscad"
    candidate = configured if configured else (shutil.which("openscad") or (str(local) if local.is_file() else None))
    if not candidate or not Path(candidate).is_file() or not os.access(candidate, os.X_OK):
        raise RuntimeError("GEOMETRY_OPENSCAD_BACKEND_REQUIRED")
    return candidate


def openscad_runtime_environment(binary: str, extra: dict[str, str] | None = None) -> dict[str, str]:
    environment = {**os.environ, **(extra or {})}
    path = Path(binary).resolve()
    # Unprivileged local bootstrap layout: <cache>/root/usr/bin/openscad. Dynamic
    # libraries stay next to that root and never need system-wide installation.
    if len(path.parents) >= 3 and path.parent.name == "bin" and path.parent.parent.name == "usr" and path.parents[2].name == "root":
        root = path.parents[2]
        library_dirs = sorted(str(item) for item in (root / "usr" / "lib").glob("*-linux-gnu") if item.is_dir())
        library_dirs += sorted(str(item) for item in (root / "lib").glob("*-linux-gnu") if item.is_dir())
        existing = environment.get("LD_LIBRARY_PATH")
        environment["LD_LIBRARY_PATH"] = ":".join([*library_dirs, *([existing] if existing else [])])
    return environment


def openscad_version(binary: str) -> str:
    process = subprocess.run([binary, "--version"], capture_output=True, text=True, timeout=15, check=False, env=openscad_runtime_environment(binary))
    value = (process.stdout or process.stderr).strip()
    if process.returncode or not value:
        raise RuntimeError("GEOMETRY_OPENSCAD_VERSION_UNAVAILABLE")
    return value


def scad_literal(value: Any) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)) and math.isfinite(value):
        return repr(value)
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False)
    raise RuntimeError("GEOMETRY_PARAMETER_TYPE_INVALID")


def parse_dependency_file(path: Path, work: Path, source_name: str) -> list[str]:
    if not path.is_file():
        raise RuntimeError("GEOMETRY_DEPENDENCY_RECEIPT_MISSING")
    text = path.read_text(encoding="utf-8", errors="replace").replace("\\\n", " ")
    body = text.split(":", 1)[1] if ":" in text else text
    dependencies = []
    for raw in shlex.split(body):
        candidate = Path(raw)
        candidate = candidate if candidate.is_absolute() else (work / candidate)
        resolved = candidate.resolve()
        try:
            relative = resolved.relative_to(work / "libs").as_posix()
            dependencies.append(relative)
            continue
        except ValueError:
            pass
        try:
            relative = resolved.relative_to(work / "input").as_posix()
            dependencies.append(source_name if relative == source_name else f"input/{relative}")
        except ValueError:
            dependencies.append(f"external:{resolved}")
    return sorted(set(dependencies))


def dependency_closure(actual: list[str], expected: list[dict[str, Any]], source_name: str) -> list[str]:
    drift: list[str] = []
    for dependency in expected:
        entrypoint = dependency["path"]
        if entrypoint not in actual:
            drift.append(f"missing:{entrypoint}")
    mounts = [dependency["mountPath"].rstrip("/") for dependency in expected]
    for dependency in actual:
        if dependency == source_name:
            continue
        if dependency.startswith("external:") or not any(dependency == mount or dependency.startswith(mount + "/") for mount in mounts):
            drift.append(f"undeclared:{dependency}")
    return sorted(set(drift))


def artifact(path: Path, media_type: str) -> dict[str, Any]:
    digest = sha256_file(path)
    return {"uri": content_uri("geometry", digest), "sha256": digest, "path": str(path.resolve()), "bytes": path.stat().st_size, "mediaType": media_type}


def error_urn(code: str) -> str:
    slug = code.lower().replace("_", "-")
    return f"urn:subactor:error:geometry:{slug}"


def repair_uri(code: str) -> str:
    if "BACKEND" in code or "VERSION" in code:
        action = "install-openscad-backend"
    elif "DEPENDENCY" in code:
        action = "resolve-dependency-closure"
    elif "HASH" in code:
        action = "refresh-content-hashes"
    elif "SCAD" in code:
        action = "repair-scad-source"
    elif "REFERENCE" in code:
        action = "reconcile-source-evidence"
    else:
        action = "repair-geometry-output"
    return f"subactor://process/repair/geometry/{action}"


def validate_geometry_contract(contract: Any) -> dict[str, Any]:
    if not isinstance(contract, dict) or contract.get("schema") != "subactor.geometry-build/v1":
        raise RuntimeError("GEOMETRY_BUILD_CONTRACT_INVALID")
    required = ["id", "source", "engine", "target", "coordinateSystem", "dependencies", "parameters", "compilerOptions", "outputs", "validations"]
    if any(key not in contract for key in required):
        raise RuntimeError("GEOMETRY_BUILD_CONTRACT_INCOMPLETE")
    if contract["source"].get("format") != "scad" or contract["engine"].get("type") != "openscad":
        raise RuntimeError("GEOMETRY_BUILD_PROFILE_UNSUPPORTED")
    unit = contract["coordinateSystem"].get("unit")
    if unit not in UNIT_TO_M:
        raise RuntimeError("GEOMETRY_UNIT_UNKNOWN")
    if not isinstance(contract["dependencies"], list) or not isinstance(contract["parameters"].get("values"), dict):
        raise RuntimeError("GEOMETRY_BUILD_CONTRACT_INVALID")
    return contract


def build_identity(contract: dict[str, Any], version: str) -> dict[str, Any]:
    return {
        "profile": "subactor.geometry-build/openscad-v1",
        "source": {key: contract["source"][key] for key in ("uri", "sha256", "format")},
        "dependencies": sorted(
            ({key: dependency[key] for key in ("path", "mountPath", "uri", "sha256")} for dependency in contract["dependencies"]),
            key=lambda dependency: dependency["path"],
        ),
        "parameters": contract["parameters"],
        "engine": {"name": "openscad", "version": version, "imageDigest": contract["engine"].get("imageDigest")},
        "compilerOptions": contract["compilerOptions"],
        "coordinateSystem": contract["coordinateSystem"],
        "outputs": contract["outputs"],
    }


def compile_scad_to_3mf(
    binary: str,
    source: Path,
    dependencies: list[tuple[dict[str, Any], Path]],
    contract: dict[str, Any],
    artifact_root: Path,
    canonical: Path,
) -> list[str]:
    artifact_root.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="subactor-openscad-") as temporary:
        work = Path(temporary)
        input_root, library_root = work / "input", work / "libs"
        input_root.mkdir()
        library_root.mkdir()
        worker_source = input_root / source.name
        shutil.copy2(source, worker_source)
        for dependency, dependency_source in dependencies:
            mount = library_root / safe_relative(dependency["mountPath"], "DEPENDENCY_MOUNT")
            mount.parent.mkdir(parents=True, exist_ok=True)
            if dependency_source.is_dir():
                shutil.copytree(dependency_source, mount)
            else:
                shutil.copy2(dependency_source, mount)
        worker_3mf = work / "model.model.3mf"
        dependency_file = work / "dependencies.mk"
        command = [binary, "-o", str(worker_3mf), "-d", str(dependency_file)]
        options = contract["compilerOptions"]
        if options.get("hardWarnings"):
            command.append("--hardwarnings")
        command.extend(["--check-parameters=true", "--check-parameter-ranges=true"])
        values = dict(contract["parameters"]["values"])
        for key, option in (("$fa", "fa"), ("$fs", "fs"), ("$fn", "fn")):
            if option in options:
                values[key] = options[option]
        for name, value in sorted(values.items()):
            command.extend(["-D", f"{name}={scad_literal(value)}"])
        command.append(str(worker_source))
        environment = openscad_runtime_environment(binary, {
            "OPENSCADPATH": str(library_root),
            "QT_QPA_PLATFORM": os.environ.get("QT_QPA_PLATFORM", "offscreen"),
        })
        try:
            process = subprocess.run(
                command,
                cwd=work,
                env=environment,
                capture_output=True,
                text=True,
                timeout=int(options["timeoutSeconds"]),
                check=False,
            )
        except subprocess.TimeoutExpired as exc:
            raise RuntimeError("GEOMETRY_OPENSCAD_TIMEOUT") from exc
        (artifact_root / "openscad.log").write_text((process.stdout or "") + (process.stderr or ""), encoding="utf-8")
        if process.returncode or not worker_3mf.is_file():
            detail = ((process.stderr or process.stdout) or "no output").strip()[-2000:]
            raise RuntimeError(f"GEOMETRY_OPENSCAD_COMPILE_FAILED:{detail}")
        actual = parse_dependency_file(dependency_file, work, source.name)
        drift = dependency_closure(actual, contract["dependencies"], source.name)
        if drift:
            raise RuntimeError("GEOMETRY_DEPENDENCY_DRIFT:" + "|".join(drift))
        shutil.copy2(worker_3mf, canonical)
        return actual


def run_scad(contract_path: Path, output_root: Path, receipt_path: Path) -> dict[str, Any]:
    started = utc_now()
    raw_contract: dict[str, Any] = {}
    version = "unavailable"
    parameter_hash = "0" * 64
    validation_hash = "0" * 64
    build_hash = "0" * 64
    dependency_hash = "0" * 64
    actual_dependencies: list[str] = []
    artifacts: dict[str, Any] = {}
    mesh: dict[str, Any] | None = None
    glb_ok = False
    usd_available = False
    usd_open = False
    delta: float | None = None
    reference_match: bool | None = None
    reference_delta: float | None = None
    compile_cache_hit = False
    canonical_receipt: Path | None = None
    try:
        contract = validate_geometry_contract(json.loads(contract_path.read_text(encoding="utf-8")))
        raw_contract = contract
        base = contract_path.parent.resolve()
        source = resolve_declared(base, contract["source"]["path"])
        if not source.is_file():
            raise RuntimeError(f"GEOMETRY_SOURCE_MISSING:{source}")
        if sha256_file(source) != contract["source"]["sha256"]:
            raise RuntimeError("GEOMETRY_SOURCE_HASH_MISMATCH")
        dependencies: list[tuple[dict[str, Any], Path]] = []
        for dependency in contract["dependencies"]:
            dependency_source = resolve_declared(base, dependency["sourcePath"])
            if tree_hash(dependency_source) != dependency["sha256"]:
                raise RuntimeError(f"GEOMETRY_DEPENDENCY_HASH_MISMATCH:{dependency['path']}")
            safe_relative(dependency["path"], "DEPENDENCY")
            safe_relative(dependency["mountPath"], "DEPENDENCY_MOUNT")
            dependencies.append((dependency, dependency_source))
        parameter_hash = sha256_bytes(canonical_json(contract["parameters"]).encode())
        validation_hash = sha256_bytes(canonical_json(contract["validations"]).encode())
        dependency_hash = sha256_bytes(canonical_json(sorted(
            ({key: dependency[key] for key in ("path", "mountPath", "uri", "sha256")} for dependency in contract["dependencies"]),
            key=lambda dependency: dependency["path"],
        )).encode())
        binary = openscad_binary()
        version = openscad_version(binary)
        expected_version = contract["engine"].get("version")
        if expected_version and expected_version not in version:
            raise RuntimeError(f"GEOMETRY_ENGINE_VERSION_MISMATCH:{expected_version}:{version}")
        build_hash = sha256_bytes(canonical_json(build_identity(contract, version)).encode())
        artifact_root = output_root.resolve() / "artifacts" / build_hash
        canonical = artifact_root / "model.model.3mf"
        glb = artifact_root / "model.glb"
        usda = artifact_root / "model.usda"
        canonical_receipt = output_root.resolve() / "receipts" / f"{contract['id']}-{build_hash}.json"
        if canonical_receipt.is_file():
            cached = json.loads(canonical_receipt.read_text(encoding="utf-8"))
            cached_artifacts = cached.get("artifacts", {})
            required_artifacts = [cached_artifacts.get(name) for name in ("3mf", "glb", "usda")]
            intact = all(
                isinstance(item, dict)
                and isinstance(item.get("path"), str)
                and isinstance(item.get("sha256"), str)
                and Path(item["path"]).is_file()
                and sha256_file(Path(item["path"])) == item["sha256"]
                for item in required_artifacts
            )
            if intact and cached.get("status") == "succeeded" and cached.get("validationPolicyHash") == validation_hash and cached.get("geometryHashProfile") == "subactor.semantic-triangle-soup/v2":
                cached.update({"cacheHit": True, "startedAt": started, "completedAt": utc_now()})
                receipt_path.parent.mkdir(parents=True, exist_ok=True)
                receipt_path.write_text(json.dumps(cached, indent=2) + "\n", encoding="utf-8")
                return cached
            if intact:
                canonical = Path(cached_artifacts["3mf"]["path"])
                glb = Path(cached_artifacts["glb"]["path"])
                usda = Path(cached_artifacts["usda"]["path"])
                actual_dependencies = list(cached.get("dependencies", {}).get("actual", []))
                compile_cache_hit = True

        if not compile_cache_hit:
            actual_dependencies = compile_scad_to_3mf(binary, source, dependencies, contract, artifact_root, canonical)

        mesh = run_3mf(canonical, glb, usda)
        if mesh["unit"] != contract["coordinateSystem"]["unit"]:
            raise RuntimeError(f"GEOMETRY_UNIT_MISMATCH:{contract['coordinateSystem']['unit']}:{mesh['unit']}")
        if mesh["triangles"] > int(contract["compilerOptions"]["maxTriangles"]):
            raise RuntimeError(f"GEOMETRY_TRIANGLE_LIMIT_EXCEEDED:{mesh['triangles']}")
        glb_validation = validate_glb(glb)
        glb_ok = True
        delta = bbox_delta(mesh["bboxM"], glb_validation["bboxM"])
        if delta > float(contract["validations"]["bboxToleranceM"]):
            raise RuntimeError(f"GEOMETRY_BBOX_DRIFT:{delta}")
        usd_available, usd_open = validate_usd(usda)
        if contract["validations"].get("usdStageOpen") and (not usd_available or not usd_open):
            raise RuntimeError("GEOMETRY_USD_VALIDATION_UNAVAILABLE" if not usd_available else "GEOMETRY_USD_STAGE_INVALID")
        artifacts = {
            "3mf": artifact(canonical, "model/3mf"),
            "glb": artifact(glb, "model/gltf-binary"),
            "usda": artifact(usda, "model/vnd.usda"),
        }
        reference = contract["validations"].get("reference")
        if reference:
            reference_path = resolve_declared(base, reference["path"])
            if not reference_path.is_file():
                raise RuntimeError(f"GEOMETRY_REFERENCE_MISSING:{reference_path}")
            if sha256_file(reference_path) != reference["sha256"]:
                raise RuntimeError("GEOMETRY_REFERENCE_HASH_MISMATCH")
            reference_validation = validate_glb(reference_path)
            reference_scale = UNIT_TO_M[reference["unit"]]
            reference_bbox_m = {
                key: [float(value) * reference_scale for value in reference_validation["bboxM"][key]]
                for key in ("min", "max")
            }
            reference_delta = extent_delta(mesh["bboxM"], reference_bbox_m)
            # An independent STEP tessellation is not the same operation as serializing our
            # canonical 3MF into GLB. Keep its explicit comparison tolerance separate so a
            # justified CAD-kernel discretization budget never weakens the internal round trip.
            reference_tolerance = float(reference.get("extentToleranceM", contract["validations"]["bboxToleranceM"]))
            reference_match = reference_delta <= reference_tolerance
            if not reference_match:
                actual_extent = ",".join(f"{value:.9g}" for value in bbox_extent(mesh["bboxM"]))
                expected_extent = ",".join(f"{value:.9g}" for value in bbox_extent(reference_bbox_m))
                raise RuntimeError(f"GEOMETRY_REFERENCE_EXTENT_DRIFT:{reference_delta:.9g}:actual={actual_extent}:reference={expected_extent}")
        receipt = {
            "schema": "subactor.geometry-build-receipt/v1",
            "id": f"{contract['id']}-{build_hash[:16]}",
            "status": "succeeded",
            "processUri": PROCESS_URI,
            "cacheHit": compile_cache_hit,
            "startedAt": started,
            "completedAt": utc_now(),
            "source": contract["source"],
            "target": contract["target"],
            "coordinateSystem": contract["coordinateSystem"],
            "engine": {"name": "openscad", "version": version, **({"imageDigest": contract["engine"]["imageDigest"]} if contract["engine"].get("imageDigest") else {})},
            "dependencies": {"expected": contract["dependencies"], "actual": actual_dependencies, "dependencySetHash": dependency_hash, "drift": []},
            "parameterSetHash": parameter_hash,
            "validationPolicyHash": validation_hash,
            "geometryBuildHash": build_hash,
            "geometryHashProfile": "subactor.semantic-triangle-soup/v2",
            "geometryArtifactHash": mesh["geometryArtifactHash"],
            "artifacts": artifacts,
            "validation": {
                "ok": True,
                "nonEmpty": mesh["triangles"] > 0,
                "finite": True,
                "dependencyClosure": True,
                "triangleCount": mesh["triangles"],
                "bboxM": mesh["bboxM"],
                "unit": contract["coordinateSystem"]["unit"],
                "glbLoad": True,
                "usdStageOpen": usd_open,
                "usdValidationAvailable": usd_available,
                "bboxDeltaM": delta,
                **({"referenceMatch": reference_match, "referenceExtentDeltaM": reference_delta} if reference_match is not None else {}),
                "failures": [],
            },
        }
        canonical_receipt.parent.mkdir(parents=True, exist_ok=True)
        canonical_receipt.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    except Exception as exc:
        message = str(exc)
        code = message.split(":", 1)[0] or "GEOMETRY_BUILD_FAILED"
        contract = raw_contract
        build_hash = build_hash if build_hash != "0" * 64 else sha256_bytes(canonical_json({"contract": contract, "engineVersion": version}).encode())
        receipt = {
            "schema": "subactor.geometry-build-receipt/v1",
            "id": f"{contract.get('id', 'invalid-build')}-{build_hash[:16]}",
            "status": "failed",
            "processUri": PROCESS_URI,
            "repairProcess": repair_uri(code),
            "cacheHit": compile_cache_hit,
            "startedAt": started,
            "completedAt": utc_now(),
            "source": contract.get("source", {"path": str(contract_path), "uri": content_uri("resource", "0" * 64), "sha256": "0" * 64, "format": "scad"}),
            "target": contract.get("target", {"componentId": "unknown", "scenePath": "/Invalid", "kind": "equipment"}),
            "coordinateSystem": contract.get("coordinateSystem", {"unit": "millimeter", "upAxis": "Z", "handedness": "right"}),
            "engine": {"name": "openscad", "version": version},
            "dependencies": {"expected": contract.get("dependencies", []), "actual": actual_dependencies, "dependencySetHash": dependency_hash, "drift": [message] if "DEPENDENCY" in code else []},
            "parameterSetHash": parameter_hash,
            "validationPolicyHash": validation_hash,
            "geometryBuildHash": build_hash,
            "geometryHashProfile": "subactor.semantic-triangle-soup/v2",
            **({"geometryArtifactHash": mesh["geometryArtifactHash"]} if mesh else {}),
            "artifacts": artifacts,
            "validation": {
                "ok": False,
                "nonEmpty": bool(mesh and mesh.get("triangles", 0) > 0),
                "finite": bool(mesh),
                "dependencyClosure": "DEPENDENCY" not in code,
                "triangleCount": int(mesh["triangles"]) if mesh else 0,
                **({"bboxM": mesh["bboxM"]} if mesh else {}),
                "unit": contract.get("coordinateSystem", {}).get("unit", "millimeter"),
                "glbLoad": glb_ok,
                "usdStageOpen": usd_open,
                "usdValidationAvailable": usd_available,
                **({"bboxDeltaM": delta} if delta is not None else {}),
                **({"referenceMatch": reference_match, "referenceExtentDeltaM": reference_delta} if reference_match is not None else {}),
                "failures": [code],
            },
            "error": {"code": error_urn(code), "message": message[:4000]},
        }
        if canonical_receipt is not None:
            canonical_receipt.parent.mkdir(parents=True, exist_ok=True)
            canonical_receipt.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    receipt_path.parent.mkdir(parents=True, exist_ok=True)
    receipt_path.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    return receipt


def bulk(args: argparse.Namespace) -> int:
    root, out = Path(args.source_root).resolve(), Path(args.output_root).resolve()
    records = []
    for source in sorted(path for path in root.rglob("*") if path.is_file() and path.suffix.lower() in CAD):
        digest = sha256_file(source)
        suffix = ".step.glb" if source.suffix.lower() in {".step", ".stp"} else ".glb"
        relative = source.relative_to(root)
        target = out / relative.parent / (source.stem + suffix)
        record: dict[str, Any] = {"source": str(source), "sourceSha256": digest, "target": str(target), "format": source.suffix.lower()}
        try:
            if source.suffix.lower() not in SUPPORTED:
                raise RuntimeError("CAD_TESSELLATOR_BACKEND_REQUIRED:" + source.suffix.lower())
            if source.suffix.lower() in {".step", ".stp"}:
                run_step(source, target)
            elif source.suffix.lower() == ".stl":
                run_stl(source, target)
            elif source.suffix.lower() == ".3mf":
                run_3mf(source, target)
            elif source.suffix.lower() == ".obj":
                run_obj(source, target)
            else:
                raise RuntimeError("GEOMETRY_BUILD_CONTRACT_REQUIRED:.scad")
            record.update({"status": "converted", "targetSha256": sha256_file(target), "bytes": target.stat().st_size})
        except Exception as exc:
            record.update({"status": "failed", "error": str(exc)})
        records.append(record)
    report = {
        "schema": "subactor.cad-tessellation-report/v1",
        "converter": "subactor-cad-to-gltf",
        "records": records,
        "converted": sum(record["status"] == "converted" for record in records),
        "failed": sum(record["status"] == "failed" for record in records),
    }
    report_path = Path(args.report) if args.report else out / "cad-tessellation.report.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0 if report["failed"] == 0 else 2


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("source_root", nargs="?")
    parser.add_argument("output_root", nargs="?")
    parser.add_argument("--report", default=None)
    parser.add_argument("--geometry-build", default=None, metavar="CONTRACT_JSON")
    parser.add_argument("--geometry-output", default=None, metavar="OUTPUT_ROOT")
    parser.add_argument("--receipt", default=None, metavar="RECEIPT_JSON")
    args = parser.parse_args()
    if args.geometry_build:
        output = Path(args.geometry_output or ".geometry-build")
        receipt_path = Path(args.receipt or output / "geometry-build-receipt.json")
        receipt = run_scad(Path(args.geometry_build).resolve(), output, receipt_path)
        print(json.dumps(receipt, indent=2))
        return 0 if receipt["status"] == "succeeded" else 2
    if not args.source_root or not args.output_root:
        parser.error("bulk mode requires source_root and output_root")
    return bulk(args)


if __name__ == "__main__":
    raise SystemExit(main())
