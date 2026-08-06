/**
 * Offline demo of cryptographic mutation grants + propose-only code mutation pipeline.
 * Reuses patterns from subactor/runtime apply-grant and todo2code propose-source-patch.
 */
import {mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {issueMutationGrant,verifyMutationGrantDocument} from '../dist/src/runtime/mutation-grant.js';
import {proposeCodeMutation} from '../dist/src/runtime/mutation-pipeline.js';
import {validateAutonomCycle,summarizeProbeCycle} from '../dist/src/adapters/twin-probes.js';

const root='.mutation-demo';
const secret='demo-mutation-grant-secret';
process.env.MUTATION_GRANT_HMAC_SECRET=secret;
await rm(root,{recursive:true,force:true});
await mkdir(join(root,'code'),{recursive:true});
await writeFile(join(root,'code','index.ts'),'export const ready=true;\n');

const plan={
  schema:'t2c.code-change-plan/v1',
  id:'plan-demo',
  planHash:'aa'.repeat(32),
  target:{paths:['index.ts']},
  status:'proposed',
};
await writeFile(join(root,'plan.json'),JSON.stringify(plan,null,2)+'\n');

const project={
  schema:'subactor.living-project/v1',
  id:'mutation-demo',
  name:'Mutation Demo',
  profile:'generic',
  managerIntent:'Demonstrate propose-only mutation with crypto grant',
  sources:[],
  development:{root:'code'},
  observations:{paths:['logs'],logicalRoot:'subactor://project/mutation-demo/runtime'},
  policy:{
    approved:true,requireResearch:true,requireDevelopmentEvidence:true,requireDevelopmentAcceptance:true,
    allowDevelopmentFixture:true,requireRuntimeEvidence:true,autoPublishScene:false,
    allowRuntimeSelfModification:false,autonomyMode:'propose',requireSignedMutationGrant:true,
    maxIterationsPerHour:12,maxConsecutiveFailures:5,
  },
  scene:{format:'openusd'},
};

const issued=issueMutationGrant({
  runId:'demo-run',
  actor:'manager@example.com',
  planHash:plan.planHash,
  artifactSha256:'bb'.repeat(32),
  target:'code/',
  projectId:project.id,
  ttlSeconds:900,
},{env:process.env});
if(!issued.ok)throw new Error(issued.error);

const verified=verifyMutationGrantDocument(issued.document,{projectId:project.id,planHash:plan.planHash,env:process.env});
const proposed=await proposeCodeMutation({
  project,
  projectBase:root,
  developmentRoot:join(root,'code'),
  planPath:join(root,'plan.json'),
  grant:issued.document,
  outDir:join(root,'out'),
  keepWorkspace:false,
});

const cycle=validateAutonomCycle({
  schema:'subactor.autonom-cycle/v1',
  host:'mutation-demo',
  startedAt:new Date().toISOString(),
  results:[{
    id:'demo.probe',
    ok:true,
    watches:['code/index.ts'],
    tags:['demo'],
    facts:{lines:'1'},
  }],
});
const probeSummary=summarizeProbeCycle(cycle);

const summary={
  grant:{ok:verified.ok,jti:issued.document.jti,grantHash:issued.document.grantHash},
  proposal:{status:proposed.status,grantVerified:proposed.grantVerified,sourcePatchPath:proposed.sourcePatchPath,workspaceKind:proposed.workspace?.kind??null},
  probes:{probeCount:probeSummary.probeCount,healthy:probeSummary.healthyCount,cycleUri:probeSummary.cycleUri},
};
await writeFile(join(root,'summary.json'),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
