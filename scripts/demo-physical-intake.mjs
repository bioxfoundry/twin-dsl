/**
 * Physical Evidence Intake demo — drives the real living-project runtime twice:
 * once with placeholder geometry, once after a floor-plan/register intake lands.
 * Asserts the contract: componentId and scenePath stay stable, only geometry and provenance move.
 */
import { rm, readFile, writeFile } from 'node:fs/promises';
import { createLivingProject } from '../dist/src/project/wizard.js';
import { LivingProjectRuntime } from '../dist/src/runtime/living-project.js';

const root = '.physical-intake-demo';
const projectDir = `${root}/project`;
const out = `${projectDir}/.living-runtime`;
await rm(root, { recursive: true, force: true });

const created = await createLivingProject({
  name: 'Biofoundry Physical Twin',
  outDir: projectDir,
  profile: 'biofoundry',
  managerIntent: 'Replace placeholder geometry with surveyed facility evidence without changing component identity.',
});
const runtime = new LivingProjectRuntime();

// --- Revision 1: conceptual twin, geometry still explicitly placeholder ------------------------
const conceptual = await runtime.iterate(created.configPath, out, 'deterministic');
const beforeScene = JSON.parse(await readFile(`${out}/current/scene.json`, 'utf8'));
const beforeTwin = JSON.parse(await readFile(`${out}/current/twin.json`, 'utf8'));

// --- Physical evidence arrives: floor plan for the Build zone, register entry for the handler ---
const evidence = {
  schema: 'subactor.physical-evidence/v1',
  id: 'site-intake-2026-08',
  coordinateSystem: { unit: 'm', upAxis: 'Z', origin: 'site-datum-A' },
  records: [
    { componentId: 'build', kind: 'space', evidence: 'cad', position: [7.5, 9, 0], size: [12.4, 14.2, 3.2], sourceRef: 'plan:A3-sheet2' },
    { componentId: 'liquid_handler_01', kind: 'equipment', evidence: 'measured', position: [4.6, 10.1, 0.9], size: [2.24, 1.58, 1.81], sourceRef: 'register:LH-01', properties: { manufacturer: 'unspecified', assetId: 'LH-01' } },
    // Refused on purpose: a weaker claim must not overwrite better geometry, and unknown ids never land.
    { componentId: 'liquid_handler_99', kind: 'equipment', evidence: 'ifc', size: [1, 1, 1] },
  ],
};
await writeFile(`${projectDir}/baseline/physical-evidence.json`, JSON.stringify(evidence, null, 2) + '\n');
const dsl = await readFile(created.configPath, 'utf8');
await writeFile(created.configPath, dsl.replace(/\n$/, '') + '\nSCENE_PHYSICAL_EVIDENCE_FILE "baseline/physical-evidence.json"\n');

// --- Revision 2: same identity, physical representation --------------------------------------
const physical = await runtime.iterate(created.configPath, out, 'deterministic');
const afterScene = JSON.parse(await readFile(`${out}/current/scene.json`, 'utf8'));
const afterTwin = JSON.parse(await readFile(`${out}/current/twin.json`, 'utf8'));
const report = JSON.parse(await readFile(`${out}/current/physical-evidence.report.json`, 'utf8'));

const evidenceOf = (twin, id) => twin.components.find((c) => c.id === id)?.properties.geometryEvidence;
const sizeOf = (scene, id) => scene.bindings.find((b) => b.componentId === id)?.size;

const summary = {
  revisions: { conceptual: conceptual.iterationUri, physical: physical.iterationUri },
  newRevision: conceptual.iterationUri !== physical.iterationUri,
  geometryTransition: {
    build: `${evidenceOf(beforeTwin, 'build')} -> ${evidenceOf(afterTwin, 'build')}`,
    liquid_handler_01: `${evidenceOf(beforeTwin, 'liquid_handler_01')} -> ${evidenceOf(afterTwin, 'liquid_handler_01')}`,
  },
  geometryApplied: { build: sizeOf(afterScene, 'build'), liquid_handler_01: sizeOf(afterScene, 'liquid_handler_01') },
  componentIdsStable: JSON.stringify(beforeTwin.components.map((c) => c.id)) === JSON.stringify(afterTwin.components.map((c) => c.id)),
  scenePathsStable: JSON.stringify(beforeScene.bindings.map((b) => b.scenePath)) === JSON.stringify(afterScene.bindings.map((b) => b.scenePath)),
  rejected: report.rejected,
};

const failures = [];
if (!summary.newRevision) failures.push('physical evidence did not produce a new twin revision');
if (!summary.componentIdsStable) failures.push('componentIds changed');
if (!summary.scenePathsStable) failures.push('scenePaths changed');
if (summary.geometryTransition.build !== 'placeholder -> cad') failures.push(`build: ${summary.geometryTransition.build}`);
if (summary.geometryTransition.liquid_handler_01 !== 'placeholder -> measured') failures.push(`liquid_handler_01: ${summary.geometryTransition.liquid_handler_01}`);
if (!report.rejected.some((r) => r.componentId === 'liquid_handler_99' && r.reason === 'UNKNOWN_COMPONENT')) failures.push('unknown componentId was not rejected');

await writeFile(`${root}/summary.json`, JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
if (failures.length) {
  console.error('PHYSICAL_INTAKE_DEMO_FAILED:\n - ' + failures.join('\n - '));
  process.exit(1);
}
