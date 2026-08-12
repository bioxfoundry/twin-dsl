#!/usr/bin/env node
import { access, cp, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const sourceRoot=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const projectRoot=resolve(process.argv[2]??"");
if(!process.argv[2]) throw new Error("VENDORED_RUNTIME_ARGUMENT_REQUIRED:usage=sync-vendored-runtime.mjs <living-project-root>");
await access(join(projectRoot,"project.projectdsl"));

const sourcePackage=JSON.parse(await readFile(join(sourceRoot,"package.json"),"utf8"));
if(typeof sourcePackage.version!=="string"||!sourcePackage.version.trim()) throw new Error("RUNTIME_PACKAGE_VERSION_MISSING");

const vendorParent=join(projectRoot,"vendor");
const vendor=join(vendorParent,"runtime");
try {
  const existing=JSON.parse(await readFile(join(vendor,"package.json"),"utf8"));
  if(existing.name!=="living-digital-twin-runtime-image") throw new Error("VENDORED_RUNTIME_IDENTITY_MISMATCH");
} catch(error) {
  if(error instanceof SyntaxError||String(error).includes("VENDORED_RUNTIME_IDENTITY_MISMATCH")) throw error;
}

await mkdir(vendorParent,{recursive:true});
const staging=await mkdtemp(join(vendorParent,".runtime-sync-"));
try {
  for(const entry of ["dist","schemas","proto","deploy","public","error","docs"]) {
    await cp(join(sourceRoot,entry),join(staging,entry),{recursive:true});
  }
  await mkdir(join(staging,"scripts"),{recursive:true});
  await cp(join(sourceRoot,"scripts/cad-to-gltf.py"),join(staging,"scripts/cad-to-gltf.py"));
  await writeFile(join(staging,"package.json"),JSON.stringify({
    name:"living-digital-twin-runtime-image",version:sourcePackage.version,private:true,type:"module",
  },null,2)+"\n");
  await cp(join(sourceRoot,"deploy/runtime/Dockerfile"),join(staging,"Dockerfile"));
  await rm(vendor,{recursive:true,force:true});
  await rename(staging,vendor);
} catch(error) {
  await rm(staging,{recursive:true,force:true});
  throw error;
}

process.stdout.write(`${JSON.stringify({project:projectRoot,runtimeVersion:sourcePackage.version,vendor},null,2)}\n`);
