import { mkdir, readFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import type { GeometryBuildContract, GeometryBuildReceipt, PhysicalEvidenceDocument, ResourceRecord } from "../core/types.js";
import { OpenScadGeometryBackend } from "../adapters/openscad.js";
import { validateGeometryBuild } from "./build-contract.js";
import { geometryReceiptEvidence, geometryReceiptResource } from "./physical-evidence-adapter.js";
import { resolveGeometryDependencies } from "./dependency-resolver.js";

export interface GeometryMaterialization {
  contract: GeometryBuildContract;
  receipt: GeometryBuildReceipt;
  evidence?: PhysicalEvidenceDocument;
  resource?: ResourceRecord;
}

export class GeometryService {
  constructor(readonly backend = new OpenScadGeometryBackend()) {}

  async materializeFile(contractPath: string, outputRoot: string, projectId: string): Promise<GeometryMaterialization> {
    const absoluteContract = resolve(contractPath);
    const contract = validateGeometryBuild(JSON.parse(await readFile(absoluteContract, "utf8")));
    await resolveGeometryDependencies(contract, absoluteContract);
    await mkdir(outputRoot, { recursive: true });
    const receiptPath = join(resolve(outputRoot), "latest", `${basename(contract.id)}.geometry-build-receipt.json`);
    const receipt = await this.backend.materialize({
      contractPath: absoluteContract,
      outputRoot,
      receiptPath,
      timeoutSeconds: contract.compilerOptions.timeoutSeconds,
    });
    const evidence = geometryReceiptEvidence(receipt);
    const resource = await geometryReceiptResource(receipt, projectId);
    return { contract, receipt, evidence, resource };
  }

  async materializeFiles(contractPaths: string[], outputRoot: string, projectId: string): Promise<GeometryMaterialization[]> {
    const results: GeometryMaterialization[] = [];
    // Geometry compilers are intentionally serialized: each one is CPU/RAM intensive and each
    // contract has its own timeout/receipt, so one failure cannot hide another.
    for (const contractPath of contractPaths) results.push(await this.materializeFile(contractPath, outputRoot, projectId));
    return results;
  }
}
