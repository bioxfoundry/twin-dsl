"""Deterministic CAD tessellation bridge.

Blender is used only for triangle meshes (STL). STEP/F3D/SCAD require an OpenCascade/OpenSCAD
backend and are reported as explicit, non-renderable failures instead of being mislabeled as GLB.
"""
import argparse, hashlib, json, os, struct, tempfile, sys
from pathlib import Path

SUPPORTED = {".stl", ".step", ".stp"}
CAD = {".stl", ".step", ".stp", ".f3d", ".scad"}

def run_stl(source: Path, target: Path) -> None:
    """Write a minimal standards-compliant GLB directly from binary STL."""
    raw = source.read_bytes()
    positions, normals = [], []
    count = struct.unpack_from("<I", raw, 80)[0] if len(raw) >= 84 else 0
    if count and 84 + count * 50 <= len(raw):
        for i in range(count):
            off = 84 + i * 50
            normal = struct.unpack_from("<3f", raw, off)
            for vertex in range(3):
                positions.extend(struct.unpack_from("<3f", raw, off + 12 + vertex * 12))
                normals.extend(normal)
    else:
        # OpenSCAD commonly emits ASCII STL despite the .stl extension.
        text = raw.decode("utf-8", errors="ignore")
        values = []
        for line in text.splitlines():
            fields = line.strip().split()
            if len(fields) == 4 and fields[0].lower() == "vertex":
                values.extend(float(x) for x in fields[1:])
        if len(values) < 9 or len(values) % 9:
            raise RuntimeError("CAD_STL_FACET_TABLE_INVALID")
        for i in range(0, len(values), 9):
            ab = [b-a for a,b in zip(values[i:i+3], values[i+3:i+6])]
            ac = [b-a for a,b in zip(values[i:i+3], values[i+6:i+9])]
            normal = [ab[1]*ac[2]-ab[2]*ac[1], ab[2]*ac[0]-ab[0]*ac[2], ab[0]*ac[1]-ab[1]*ac[0]]
            positions.extend(values[i:i+9]); normals.extend(normal * 3)
    pos = struct.pack("<%sf" % len(positions), *positions)
    nrm = struct.pack("<%sf" % len(normals), *normals)
    blob = pos + nrm
    while len(blob) % 4: blob += b"\0"
    def bounds(values):
        return [min(values[i::3]) for i in range(3)], [max(values[i::3]) for i in range(3)]
    pmin, pmax = bounds(positions)
    json_doc = {"asset":{"version":"2.0","generator":"subactor-cad-tessellator"},"scene":0,"scenes":[{"nodes":[0]}],"nodes":[{"mesh":0}],"meshes":[{"primitives":[{"attributes":{"POSITION":0,"NORMAL":1},"mode":4}]}],"accessors":[{"bufferView":0,"componentType":5126,"count":len(positions)//3,"type":"VEC3","min":pmin,"max":pmax},{"bufferView":1,"componentType":5126,"count":len(normals)//3,"type":"VEC3"}],"bufferViews":[{"buffer":0,"byteOffset":0,"byteLength":len(pos),"target":34962},{"buffer":0,"byteOffset":len(pos),"byteLength":len(nrm),"target":34962}],"buffers":[{"byteLength":len(blob)}]}
    encoded = json.dumps(json_doc,separators=(",",":" )).encode()
    while len(encoded) % 4: encoded += b" "
    glb = struct.pack("<4sII", b"glTF", 2, 12 + 8 + len(encoded) + 8 + len(blob))
    glb += struct.pack("<I4s", len(encoded), b"JSON") + encoded
    glb += struct.pack("<I4s", len(blob), b"BIN\0") + blob
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(glb)

def run_step(source: Path, target: Path) -> None:
    deps = os.environ.get("CADQUERY_PATH", "/tmp/cadquery-deps")
    if deps not in sys.path: sys.path.insert(0, deps)
    try:
        import cadquery as cq
    except Exception as exc:
        raise RuntimeError("CAD_TESSELLATOR_BACKEND_REQUIRED:.step:" + str(exc)) from exc
    with tempfile.NamedTemporaryFile(suffix=".stl") as mesh:
        shape = cq.importers.importStep(str(source))
        cq.exporters.export(shape, mesh.name, exportType="STL")
        run_stl(Path(mesh.name), target)

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("source_root")
    ap.add_argument("output_root")
    ap.add_argument("--report", default=None)
    args = ap.parse_args()
    root, out = Path(args.source_root).resolve(), Path(args.output_root).resolve()
    records = []
    for source in sorted(p for p in root.rglob("*") if p.is_file() and p.suffix.lower() in CAD):
        digest = hashlib.sha256(source.read_bytes()).hexdigest()
        suffix = ".step.glb" if source.suffix.lower() in {".step", ".stp"} else ".glb"
        target = out / (source.stem + suffix)
        record = {"source": str(source), "sourceSha256": digest, "target": str(target), "format": source.suffix.lower()}
        try:
            if source.suffix.lower() not in SUPPORTED:
                raise RuntimeError("CAD_TESSELLATOR_BACKEND_REQUIRED:" + source.suffix.lower())
            if source.suffix.lower() in {".step", ".stp"}: run_step(source, target)
            else: run_stl(source, target)
            record.update({"status": "converted", "targetSha256": hashlib.sha256(target.read_bytes()).hexdigest(), "bytes": target.stat().st_size})
        except Exception as exc:
            record.update({"status": "failed", "error": str(exc)})
        records.append(record)
    report = {"schema": "subactor.cad-tessellation-report/v1", "converter": "blender-stl-to-gltf", "records": records, "converted": sum(r["status"] == "converted" for r in records), "failed": sum(r["status"] == "failed" for r in records)}
    report_path = Path(args.report) if args.report else out / "cad-tessellation.report.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))
    return 0 if report["failed"] == 0 else 2

if __name__ == "__main__":
    raise SystemExit(main())
