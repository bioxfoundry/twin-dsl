import type { ResourceRecord, SourceRole } from "../core/types.js";
import { contentUri, sha256 } from "../core/canonical.js";
export function resourceFromText(id:string, logicalUri:string, sourcePath:string, text:string, parentUri?:string,sourceRole?:SourceRole,labels:string[]=[]):ResourceRecord { const hash=sha256(text);return{schema:'subactor.resource/v1',id,uri:contentUri('resource',text),logicalUri,mediaType:'text/markdown',sha256:hash,size:Buffer.byteLength(text),sourcePath,sourceRole,labels:[...new Set(labels)],parentUri,derived:false,derivedFrom:[],createdAt:new Date().toISOString()}; }

/** Binary / non-extracted asset: path+hash provenance without body text (CAD, PDF without Docling, etc.). */
export function resourceFromBinary(
  id:string,
  logicalUri:string,
  sourcePath:string,
  bytes:Buffer|string,
  mediaType:string,
  sourceRole?:SourceRole,
  labels:string[]=[],
):ResourceRecord {
  const payload = typeof bytes === "string" ? Buffer.from(bytes) : bytes;
  const hash = sha256(payload);
  const size = typeof bytes === "string" ? Buffer.byteLength(bytes) : bytes.length;
  const body = `binary-stub\npath:${sourcePath}\nsha256:${hash}\nmediaType:${mediaType}\nsize:${size}\n`;
  return {
    schema:"subactor.resource/v1",
    id,
    uri:contentUri("resource", body),
    logicalUri,
    mediaType,
    sha256:hash,
    size,
    sourcePath,
    sourceRole,
    labels:[...new Set(["binary-stub","content-not-extracted",...labels])],
    derived:false,
    derivedFrom:[],
    createdAt:new Date().toISOString(),
  };
}
