import test from "node:test";
import assert from "node:assert/strict";
import { parseDql } from "../src/dsl/dql.js";
import { DqlCrawler } from "../src/research/crawler.js";

test('DQL walks sitemap, applies host/path/context budgets and materializes Markdown',async()=>{
  const plan=parseDql('DQL x\nSITEMAPS [https://example.test/sitemap.xml]\nSEEDS []\nALLOW_HOSTS [example.test]\nINCLUDE [/docs/**]\nEXCLUDE [/docs/private]\nCONTEXT [biofoundry, bioreactor]\nMAX_URLS 5\nMAX_SITEMAPS 2\nSAME_ORIGIN true\nRESPECT_ROBOTS true\nOUTPUT markdown\nVALIDATE [citations]');
  const pages:Record<string,string>={
    'https://example.test/sitemap.xml':'<urlset><url><loc>https://example.test/docs/twin</loc></url><url><loc>https://example.test/docs/private</loc></url></urlset>',
    'https://example.test/docs/twin':'<html><head><title>Twin</title></head><body><h1>Biofoundry</h1><p>A bioreactor digital twin.</p></body></html>',
  };
  const fetcher:typeof fetch=async(input)=>new Response(pages[String(input)]??'no',{status:pages[String(input)]?200:404});
  const result=await new DqlCrawler(fetcher,async()=>{}).crawl(plan);assert.equal(result.pages.length,1);assert.match(result.pages[0].markdown,/bioreactor/);assert.match(result.pages[0].resource.uri,/^urn:subactor:resource:sha256:/);assert.equal(result.warnings.length,0);
});
