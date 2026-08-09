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
  return {
    schema:"subactor.resource/v1",
    id,
    uri:`urn:subactor:resource:sha256:${hash}`,
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

/** Register content-addressed binary evidence when its digest and byte size were computed by streaming. */
export function resourceFromBinaryDigest(
  id:string,
  logicalUri:string,
  sourcePath:string,
  digest:string,
  size:number,
  mediaType:string,
  sourceRole?:SourceRole,
  labels:string[]=[] ,
):ResourceRecord {
  if(!/^[a-f0-9]{64}$/.test(digest)) throw new Error(`RESOURCE_DIGEST_INVALID:${sourcePath}`);
  return {
    schema:"subactor.resource/v1",
    id,
    uri:`urn:subactor:resource:sha256:${digest}`,
    logicalUri,
    mediaType,
    sha256:digest,
    size,
    sourcePath,
    sourceRole,
    labels:[...new Set(["binary-stub","content-not-extracted",...labels])],
    derived:false,
    derivedFrom:[],
    createdAt:new Date().toISOString(),
  };
}
