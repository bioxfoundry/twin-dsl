import type { MathDocument, MathExpr, MathValue, Rational } from "../core/types.js";
import { lines, list, unquote } from "./parser-util.js";

function rational(v:string):Rational|undefined { const m=v.match(/^(-?\d+)\/([1-9]\d*)$/);return m?{numerator:m[1],denominator:m[2]}:undefined; }
function value(v:string):MathValue {
  if(v==='true'||v==='false') return v==='true';
  const r=rational(v); if(r)return r;
  if(/^-?\d+(?:\.\d+)?$/.test(v)) return Number(v);
  return unquote(v);
}
function expr(s:string):MathExpr {
  const x=s.trim();
  if(x.startsWith('AND(')) return {kind:'and',args:list(x.slice(4,-1)).map(expr)};
  if(x.startsWith('OR(')) return {kind:'or',args:list(x.slice(3,-1)).map(expr)};
  if(x.startsWith('NOT(')) return {kind:'not',arg:expr(x.slice(4,-1))};
  for(const [prefix,kind] of [['EQ','eq'],['GTE','gte'],['LTE','lte'],['GT','gt'],['LT','lt']] as const){if(x.startsWith(`${prefix}(`)){const [a,b]=list(x.slice(prefix.length+1,-1));if(a===undefined||b===undefined)throw new Error(`BAD_${prefix}`);return{kind,left:expr(a),right:expr(b)};}}
  if(x==='true'||x==='false'||/^-?\d+(?:\.\d+)?$/.test(x)||/^-?\d+\/[1-9]\d*$/.test(x))return{kind:'literal',value:value(x)};
  return {kind:'ref',name:x};
}
export function parseMathDsl(source:string):MathDocument {
  const xs=lines(source);const h=xs[0]?.match(/^MATH\s+(\S+)/);if(!h)throw new Error('MATH_HEADER_REQUIRED');
  const bindings:MathDocument['bindings']=[],expressions:Record<string,MathExpr>={};
  for(const l of xs.slice(1)){
    let m=l.match(/^BIND\s+(\S+)\s*=\s*(\S+)(?:\s+UNIT\s+(\S+))?(?:\s+FROM\s+(.+))?$/);
    if(m){bindings.push({name:m[1],value:value(m[2]),unit:m[3],sourceUris:m[4]?list(m[4]):[]});continue;}
    m=l.match(/^EXPR\s+(\S+)\s*=\s*(.+)$/);if(m)expressions[m[1]]=expr(m[2]);
  }
  return{schema:'subactor.math/v1',id:h[1],bindings,expressions};
}
function truth(v:MathValue|undefined):boolean{if(typeof v==='boolean')return v;throw new Error('NON_BOOLEAN_VALUE');}
function numeric(v:MathValue):number{if(typeof v==='number')return v;if(typeof v==='object'&&v!==null&&'numerator'in v)return Number(v.numerator)/Number(v.denominator);throw new Error('NON_NUMERIC_VALUE');}
export function evaluateMath(doc:MathDocument,name:string):MathValue{
  const env=new Map(doc.bindings.map(b=>[b.name,b.value]));
  const ev=(e:MathExpr):MathValue=>{switch(e.kind){
    case'literal':return e.value;
    case'ref':{const v=env.get(e.name);if(v!==undefined)return v;const nested=doc.expressions[e.name];if(nested)return ev(nested);throw new Error(`MISSING_BINDING:${e.name}`);}
    case'and':return e.args.every(a=>truth(ev(a)));
    case'or':return e.args.some(a=>truth(ev(a)));
    case'not':return !truth(ev(e.arg));
    case'eq':return JSON.stringify(ev(e.left))===JSON.stringify(ev(e.right));
    case'gte':return numeric(ev(e.left))>=numeric(ev(e.right));
    case'lte':return numeric(ev(e.left))<=numeric(ev(e.right));
    case'gt':return numeric(ev(e.left))>numeric(ev(e.right));
    case'lt':return numeric(ev(e.left))<numeric(ev(e.right));
    case'weightedSum':return e.terms.reduce((sum,t)=>sum+(Number(t.weight.numerator)/Number(t.weight.denominator))*numeric(env.get(t.ref)??(()=>{throw new Error(`MISSING_BINDING:${t.ref}`)})()),0);
  }};
  const e=doc.expressions[name];if(!e)throw new Error(`MISSING_EXPRESSION:${name}`);return ev(e);
}
export function renderMathDsl(doc:MathDocument):string{
  const val=(v:MathValue|undefined)=>typeof v==='object'&&v!==null&&'numerator'in v?`${v.numerator}/${v.denominator}`:String(v);
  const ex=(e:MathExpr):string=>{switch(e.kind){case'literal':return val(e.value);case'ref':return e.name;case'and':return`AND(${e.args.map(ex).join(', ')})`;case'or':return`OR(${e.args.map(ex).join(', ')})`;case'not':return`NOT(${ex(e.arg)})`;case'eq':case'gte':case'lte':case'gt':case'lt':return`${e.kind.toUpperCase()}(${ex(e.left)}, ${ex(e.right)})`;case'weightedSum':return`WEIGHTED_SUM(${e.terms.map(t=>`${t.weight.numerator}/${t.weight.denominator}*${t.ref}`).join(', ')})`;}};
  return [`MATH ${doc.id}`,...doc.bindings.map(b=>`BIND ${b.name} = ${val(b.value)}${b.unit?` UNIT ${b.unit}`:''}${b.sourceUris.length?` FROM [${b.sourceUris.join(', ')}]`:''}`),...Object.entries(doc.expressions).map(([k,v])=>`EXPR ${k} = ${ex(v)}`)].join('\n');
}
