"""``f2md`` command line entry point."""

from __future__ import annotations

import argparse
import json
import sys
from typing import List, Optional

from . import __version__
from .chain import ConverterChain, default_chain
from .converters import DoclingHttpConverter, DoclingLocalConverter, LocalToolConverter, TextConverter
from .detect import detect_document_kind, media_type_for
from .tree import convert_tree
from .types import ConversionError


def _build_chain(args: argparse.Namespace) -> ConverterChain:
    if args.backend == "auto":
        return default_chain(args.docling_url)
    if args.backend == "text":
        return ConverterChain([TextConverter()])
    if args.backend == "local":
        return ConverterChain([TextConverter(), LocalToolConverter()])
    if args.backend == "docling":
        return ConverterChain([DoclingHttpConverter(args.docling_url)])
    return ConverterChain([DoclingLocalConverter()])


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(prog="f2md", description="Convert any file to unified Markdown.")
    parser.add_argument("paths", nargs="*", metavar="FILE")
    parser.add_argument("--json", action="store_true", help="emit the full envelope instead of Markdown")
    parser.add_argument("--detect", action="store_true", help="only report detected kind and media type")
    parser.add_argument(
        "--backend",
        choices=["auto", "text", "local", "docling", "docling-local"],
        default="auto",
        help="force a backend instead of the fallback chain",
    )
    parser.add_argument("--docling-url", default=None, help="Docling service URL (or set DOCLING_URL)")
    parser.add_argument(
        "--tree",
        nargs=2,
        metavar=("SRC", "OUT"),
        help="mirror a directory tree: SRC/a/b.pdf -> OUT/a/b.pdf.md, with provenance front matter",
    )
    parser.add_argument("--only", default=None, help="with --tree, restrict to these kinds, e.g. .pdf,.docx")
    parser.add_argument("--quiet", action="store_true", help="with --tree, suppress per-file progress")
    parser.add_argument("--version", action="version", version=f"f2md {__version__}")
    args = parser.parse_args(argv)

    if args.tree:
        src, out = args.tree
        only = tuple(k.strip() for k in args.only.split(",")) if args.only else None

        def progress(index: int, total: int, relative: str, note: str) -> None:
            if not args.quiet:
                print(f"[{index}/{total}] {relative} -> {note}", file=sys.stderr)

        try:
            result = convert_tree(src, out, docling_url=args.docling_url, on_progress=progress, only=only)
        except ConversionError as error:
            print(f"f2md: {error}", file=sys.stderr)
            return 2
        print(json.dumps(result.to_dict(), ensure_ascii=False, indent=2))
        return 0

    if not args.paths:
        parser.error("no input files (use --tree SRC OUT to convert a directory)")

    if args.detect:
        for path in args.paths:
            print(json.dumps({"path": path, "kind": detect_document_kind(path), "mediaType": media_type_for(path)}))
        return 0

    chain = _build_chain(args)
    failures = 0
    for path in args.paths:
        try:
            document = chain.convert(path)
        except ConversionError as error:
            # Failures go to stderr so `f2md *.pdf > out.md` stays usable when one file is bad.
            print(f"f2md: {path}: {error}", file=sys.stderr)
            failures += 1
            continue
        if args.json:
            print(json.dumps(document.to_dict(), ensure_ascii=False))
        else:
            if len(args.paths) > 1:
                print(f"<!-- f2md source={path} converter={document.converter} -->")
            print(document.markdown)
    return 1 if failures else 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
