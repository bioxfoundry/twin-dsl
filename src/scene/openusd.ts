import type { SceneDocument, TwinDocument, TwinComponent, SceneBinding } from "../core/types.js";
import { flattenTwin } from "../dsl/twin.js";
function ident(x:string):string{return x.replace(/[^A-Za-z0-9_]/g,'_').replace(/^([0-9])/,'_$1')||'Node';}
/** Sanitize a USD attribute name, preserving its `ns:name` namespacing. */
function attrName(x:string):string{return x.split(':').filter(Boolean).map(ident).join(':')||'subactor:unnamed';}
function q(x:string):string{return JSON.stringify(x);}
function vec(v:readonly number[]|undefined,def:[number,number,number]):string{const x=v&&v.length===3?v:def;return`(${x.map(n=>Number.isFinite(n)?n:0).join(', ')})`;}
function primitive(binding:SceneBinding):string{switch(binding.primitive){case'cylinder':return'Cylinder';case'sphere':return'Sphere';case'scope':return'Scope';default:return'Cube';}}
function colorFor(type:string|undefined):[number,number,number]{
  switch(type){
    case'facility':case'facility-module':return[0.55,0.55,0.6];
    case'system-layer':return[0.25,0.45,0.85];
    case'reference-workflow':return[0.85,0.45,0.15];
    case'equipment':return[0.2,0.7,0.45];
    case'equipment-placeholder':return[0.55,0.75,0.35];
    case'software-service':return[0.65,0.35,0.85];
    case'cad-part':return[0.75,0.75,0.25];
    default:return[0.5,0.5,0.5];
  }
}

/** Scene tree node: mirrors one `scenePath` segment so USD paths match `subactor:scenePath`. */
interface SceneNode{segment:string;name:string;children:Map<string,SceneNode>;binding?:SceneBinding}

/**
 * Build the prim tree from `scenePath`, so nesting is preserved and two distinct
 * paths can never collapse onto the same prim (which makes the layer unloadable).
 */
function buildTree(bindings:SceneBinding[]):Map<string,SceneNode>{
  const roots=new Map<string,SceneNode>();
  for(const binding of bindings){
    const segments=binding.scenePath.split('/').filter(Boolean);
    if(!segments.length) continue;
    let level=roots,node:SceneNode|undefined;
    for(const segment of segments){
      let next=level.get(segment);
      if(!next){next={segment,name:'',children:new Map()};level.set(segment,next);}
      node=next;level=next.children;
    }
    if(node) node.binding=binding;
  }
  assignNames(roots);
  return roots;
}

/** Assign a unique USD identifier per sibling group; `ident()` can map distinct segments together. */
function assignNames(level:Map<string,SceneNode>):void{
  const used=new Set<string>();
  for(const node of level.values()){
    const base=ident(node.segment);
    let name=base;
    for(let n=2;used.has(name);n++) name=`${base}_${n}`;
    used.add(name);node.name=name;
    assignNames(node.children);
  }
}

function emitAttribute(lines:string[],pad:string,emitted:Set<string>,name:string,value:unknown):void{
  const attr=attrName(name);
  if(emitted.has(attr)) return;
  if(typeof value==='number') lines.push(`${pad}custom double ${attr} = ${Number.isFinite(value)?value:0}`);
  else if(typeof value==='boolean') lines.push(`${pad}custom bool ${attr} = ${value}`);
  else if(Array.isArray(value)) lines.push(`${pad}custom string ${attr} = ${q(JSON.stringify(value))}`);
  else if(value!==null&&value!==undefined) lines.push(`${pad}custom string ${attr} = ${q(String(value).slice(0,2000))}`);
  else return;
  emitted.add(attr);
}

function emitGeometry(lines:string[],pad:string,binding:SceneBinding,type:string|undefined):void{
  const p=primitive(binding),rgb=colorFor(type);
  if(p==='Scope'){lines.push(`${pad}def Scope "Metadata" {}`);return;}
  lines.push(`${pad}def ${p} "Geometry" {`);
  // Unit cube (`size = 1`) spans -0.5..0.5, so the scale factor is the extent itself.
  if(p==='Cube') lines.push(`${pad}    double size = 1`,`${pad}    double3 xformOp:scale = ${vec(binding.size,[1,1,1])}`,`${pad}    uniform token[] xformOpOrder = ["xformOp:scale"]`,`${pad}    color3f[] primvars:displayColor = [(${rgb.join(', ')})]`);
  else if(p==='Cylinder') lines.push(`${pad}    double radius = ${(binding.size?.[0]??1)/2}`,`${pad}    double height = ${binding.size?.[2]??1}`,`${pad}    color3f[] primvars:displayColor = [(${rgb.join(', ')})]`);
  else lines.push(`${pad}    double radius = ${(binding.size?.[0]??1)/2}`,`${pad}    color3f[] primvars:displayColor = [(${rgb.join(', ')})]`);
  lines.push(`${pad}}`);
}

function emitNode(lines:string[],node:SceneNode,depth:number,components:Map<string,TwinComponent>):void{
  const pad='    '.repeat(depth),inner='    '.repeat(depth+1),binding=node.binding;
  if(!binding){
    // Intermediate grouping segment with no binding of its own.
    lines.push(`${pad}def Scope "${node.name}" {`);
    for(const child of node.children.values()) emitNode(lines,child,depth+1,components);
    lines.push(`${pad}}`);
    return;
  }
  const component=binding.componentId?components.get(binding.componentId):undefined;
  const label=typeof component?.properties?.label==='string'?component.properties.label:node.name;
  const sourceUris=component?.sourceUris??[];
  lines.push(
    `${pad}def Xform "${node.name}" {`,
    `${inner}double3 xformOp:translate = ${vec(binding.position,[0,0,0])}`,
    `${inner}uniform token[] xformOpOrder = ["xformOp:translate"]`,
  );
  const emitted=new Set<string>();
  emitAttribute(lines,inner,emitted,'subactor:twinUri',binding.twinUri);
  emitAttribute(lines,inner,emitted,'subactor:componentId',binding.componentId??'');
  emitAttribute(lines,inner,emitted,'subactor:scenePath',binding.scenePath);
  emitAttribute(lines,inner,emitted,'subactor:label',label);
  emitAttribute(lines,inner,emitted,'subactor:componentType',component?.type??'');
  // Asset-typed so external CAD/mesh evidence survives into the layer without composing it in.
  if(binding.assetUri){lines.push(`${inner}custom asset subactor:assetUri = @${binding.assetUri}@`);emitted.add('subactor:assetUri');}
  lines.push(`${inner}custom string[] subactor:sourceUris = [${sourceUris.map(q).join(', ')}]`);
  emitted.add('subactor:sourceUris');
  emitAttribute(lines,inner,emitted,'subactor:sourceUriCount',sourceUris.length);
  if(component){
    for(const [key,value] of Object.entries(component.properties)){
      if(['position','size'].includes(key)) continue;
      emitAttribute(lines,inner,emitted,binding.propertyMap?.[key]??`subactor:${key}`,value);
    }
  }
  emitGeometry(lines,inner,binding,component?.type);
  for(const child of node.children.values()) emitNode(lines,child,depth+1,components);
  lines.push(`${pad}}`);
}

export function renderOpenUsd(scene:SceneDocument,twin:TwinDocument):string{
  const components=new Map(flattenTwin(twin).map(x=>[x.id,x]));
  const roots=buildTree(scene.bindings);
  const fallbackRoot=scene.id.toLowerCase().includes('biofoundry')||scene.bindings.some(b=>b.scenePath.startsWith('/Biofoundry'))?'Biofoundry':'LivingProject';
  const rootName=[...roots.values()][0]?.name??fallbackRoot;
  const lines=['#usda 1.0','(',`    defaultPrim = "${rootName}"`,'    metersPerUnit = 1','    upAxis = "Z"',`    doc = ${q('Semantic Digital Twin scene; geometryEvidence may be placeholder')}`,')',''];
  if(!roots.size){
    lines.push(`def Xform "${rootName}" {`,`    custom string subactor:sceneId = ${q(scene.id)}`,`    custom string subactor:sourceTwinId = ${q(scene.sourceTwinId??'')}`,'    custom int subactor:bindingCount = 0','}','');
    return lines.join('\n');
  }
  let first=true;
  for(const root of roots.values()){
    const body:string[]=[];
    emitNode(body,root,0,components);
    if(first){
      // Scene-level provenance lives on the default prim.
      body.splice(1,0,`    custom string subactor:sceneId = ${q(scene.id)}`,`    custom string subactor:sourceTwinId = ${q(scene.sourceTwinId??'')}`,`    custom int subactor:bindingCount = ${scene.bindings.length}`);
      first=false;
    }
    lines.push(...body);
  }
  lines.push('');
  return lines.join('\n');
}
export function sceneDiff(before:SceneDocument|undefined,after:SceneDocument):{added:string[];changed:string[];removed:string[]}{const key=(b:SceneDocument['bindings'][number])=>b.componentId??b.scenePath;const a=new Map(after.bindings.map(x=>[key(x),JSON.stringify(x)])),b=new Map((before?.bindings??[]).map(x=>[key(x),JSON.stringify(x)]));return{added:[...a.keys()].filter(k=>!b.has(k)),changed:[...a.keys()].filter(k=>b.has(k)&&a.get(k)!==b.get(k)),removed:[...b.keys()].filter(k=>!a.has(k))};}
