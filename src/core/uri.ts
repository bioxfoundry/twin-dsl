export function assertProcessUri(uri: string): void {
  const p=/^[a-z][a-z0-9+.-]*:\/\/[^/]+\/[^/]+\/[^/]+\/[^/]+$/;
  if(!p.test(uri)) throw new Error(`INVALID_PROCESS_URI:${uri}`);
}
export function assertResourceUri(uri: string): void {
  if(!/^urn:subactor:[a-z0-9-]+:sha256:[a-f0-9]{64}(#.*)?$/.test(uri) && !/^subactor:\/\//.test(uri)) throw new Error(`INVALID_RESOURCE_URI:${uri}`);
}
export function isImmutableResourceUri(uri:string):boolean { return /^urn:subactor:/.test(uri); }
