# PDF quality acceptance fixtures

These fixtures test semantic invariants, not byte-for-byte agreement between conversion backends.
The reduced Lithuanian fixture retains repeated page furniture, visible page numbers, layout
hyphenation, `<mark>` code, picture-text/ASCII diagram content, a Markdown table, inconsistent
heading levels and an OCR case anomaly. It contains no source-document prose beyond the minimum
needed to reproduce those layout defects.

A full-corpus acceptance run may substitute the original PDF pages, but must keep the same
invariants: page furniture is absent from visible Markdown, code is fenced, diagrams are
non-semantic, uncertain tokens remain unchanged and diagnostic, and the result cannot enter
SSOT/current while its quality status is `DEGRADED`.

`atvirojo-artifact-invariants.json` is the layout-first acceptance contract for the real study PDF.
It records only its basename, SHA-256 and semantic invariants; the copyrighted source stays in the
external corpus. The Python suite discovers that file through `F2MD_QUALITY_PDF` or the standard
bioxfoundry workspace path and skips the corpus test when the binary is not available.
