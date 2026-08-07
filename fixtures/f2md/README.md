# Shared f2md conformance fixtures

Both `py/f2md` and `js/f2md` convert these files and must produce the same **envelope shape** and
the same routing decisions. The Markdown body is allowed to differ — the backends genuinely differ
— but `converter` category, `backendType`, `inputKind`, `fallbackDepth` semantics and the key set
must not drift apart, or a pipeline that mixes both languages loses its provenance guarantees.
