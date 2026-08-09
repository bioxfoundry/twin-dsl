"""Fallback SCAD source converter when Docling/OpenSCAD is unavailable."""
import argparse, hashlib, json, re
from pathlib import Path

def main():
    ap=argparse.ArgumentParser(); ap.add_argument("source"); ap.add_argument("markdown"); ap.add_argument("intent"); ap.add_argument("--compile-report"); ap.add_argument("--preserve-markdown",action="store_true"); a=ap.parse_args()
    src=Path(a.source).resolve(); text=src.read_text(encoding="utf-8",errors="replace"); digest=hashlib.sha256(src.read_bytes()).hexdigest()
    params=[]
    for match in re.finditer(r"(?m)^\s*([A-Za-z_][\w]*)\s*=\s*([^;]+);",text): params.append({"name":match.group(1),"value":match.group(2).strip()})
    includes=re.findall(r"(?m)^\s*(?:use|include)\s*<([^>]+)>",text)
    primitives=sorted(set(re.findall(r"\b(cylinder|sphere|cube|polyhedron|linear_extrude|rotate_extrude|translate|rotate|scale|mirror|hull|minkowski|difference|union|intersection)\s*\(",text)))
    modules=re.findall(r"(?m)^\s*module\s+([A-Za-z_][\w]*)\s*\(",text)
    calls=sorted(set(re.findall(r"(?m)^\s*([A-Za-z_][\w]*)\s*\(",text)))
    md='''---\nsource: %s\nsourceRelative: %s\ninputKind: ".scad"\nmediaType: "text/x-scad"\nconverter: "scad-source"\nconverterVersion: "1.1.0"\nconverted: true\nsourceSha256: %s\n---\n\n# %s\n\n## Extracted SCAD intent\n\n- Parameters: %d\n- Dependencies: %s\n- Modules: %s\n- Geometry/operators: %s\n\n## Source\n\n```scad\n%s\n```\n''' % (str(src),src.name,digest,src.name,len(params),", ".join(includes) or "none",", ".join(modules) or "none",", ".join(primitives) or "none",text.rstrip())
    markdown_path=Path(a.markdown)
    if a.preserve_markdown:
        md=markdown_path.read_text(encoding="utf-8")
    else:
        markdown_path.parent.mkdir(parents=True,exist_ok=True); markdown_path.write_text(md,encoding="utf-8")
    records=[]
    for index,item in enumerate(params): records.append({"schema":"t2c.intent/v1","id":hashlib.sha256((f"param:{index}:{item['name']}:{item['value']}:{digest}").encode()).hexdigest()[:16],"type":"claim","text":f"SCAD parameter {item['name']} = {item['value']}","actor":"scad-parser","targetUris":[f"urn:subactor:resource:sha256:{digest}"],"source":{"artifactUri":f"urn:subactor:resource:sha256:{digest}","revisionHash":digest,"fragment":f"{item['name']}@{index + 1}","converter":"scad-source","converterVersion":"1.1.0"}})
    for dep in includes: records.append({"schema":"t2c.intent/v1","id":hashlib.sha256(("dep:"+dep+digest).encode()).hexdigest()[:16],"type":"claim","text":f"SCAD dependency use <{dep}>","actor":"scad-parser","targetUris":[f"urn:subactor:resource:sha256:{digest}"],"source":{"artifactUri":f"urn:subactor:resource:sha256:{digest}","revisionHash":digest,"fragment":dep,"converter":"scad-source","converterVersion":"1.1.0"}})
    records.append({"schema":"t2c.intent/v1","id":hashlib.sha256(("geometry:"+digest).encode()).hexdigest()[:16],"type":"claim","text":f"SCAD geometry operators: {', '.join(primitives) or 'none'}; modules: {', '.join(modules) or 'none'}; source lines: {len(text.splitlines())}","actor":"scad-parser","targetUris":[f"urn:subactor:resource:sha256:{digest}"],"source":{"artifactUri":f"urn:subactor:resource:sha256:{digest}","revisionHash":digest,"fragment":"geometry","converter":"scad-source","converterVersion":"1.1.0"}})
    pack={"schema":"t2c.intent-pack/v1","source":str(Path(a.markdown).resolve()),"sourceHash":hashlib.sha256(md.encode()).hexdigest(),"records":records}
    Path(a.intent).parent.mkdir(parents=True,exist_ok=True); Path(a.intent).write_text(json.dumps(pack,indent=2)+"\n",encoding="utf-8")
    if a.compile_report:
        report_path=Path(a.compile_report).resolve(); report=json.loads(report_path.read_text(encoding="utf-8")); packs=[]
        for path in sorted(report_path.parent.rglob("*.intent.json")):
            parsed=json.loads(path.read_text(encoding="utf-8")); packs.append(parsed)
        report["files"]=len(packs); report["records"]=sum(len(pack.get("records",[])) for pack in packs)
        report_path.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({"source":str(src),"markdown":str(Path(a.markdown).resolve()),"intent":str(Path(a.intent).resolve()),"parameters":len(params),"dependencies":len(includes),"modules":len(modules),"operators":primitives},indent=2))
if __name__ == "__main__": main()
