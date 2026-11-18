const assert = require('node:assert/strict');
const { test } = require('node:test');
const { notifySubsites } = require('../scripts/notify-subsites.cjs');
const expected = require('../shared/nav.json');
const hookUrl = 'https://api.cloudflare.com/test-only-hook';

test('missing secret is a successful skip without network requests', async () => {
  const result=await notifySubsites({request:()=>assert.fail('No request should be sent')});
  assert.equal(result.skipped,true);
});

test('waits for the new public JSON and sends exactly one POST afterwards', async () => {
  const calls=[];let gets=0;
  const result=await notifySubsites({hookUrl,expected,revision:'test-commit',pause:async()=>{},attempts:3,
    request:async(url,options)=>{
      calls.push({url,method:options.method||'GET'});
      if(options.method==='POST') return {ok:true,body:{cancel:async()=>{}}};
      gets++;return {ok:true,json:async()=>gets===1?{...expected,updatedAt:'2020-01-01T00:00:00.000Z'}:expected};
    }});
  assert.equal(result.triggered,true);
  assert.deepEqual(calls.map(item=>item.method),['GET','GET','POST']);
  assert.ok(calls[0].url.startsWith('https://nexcel.kz/shared/nav.json?revision='));
  assert.equal(calls.at(-1).url,hookUrl);
});

test('failed publication never triggers a subsite and does not expose the secret', async () => {
  let posts=0;
  await assert.rejects(()=>notifySubsites({hookUrl,expected,pause:async()=>{},attempts:2,
    request:async(_url,options)=>{if(options.method==='POST')posts++;return {ok:false};}}),/not published/);
  assert.equal(posts,0);
});

test('hook failures and redirects are not retried and never print the URL', async () => {
  let posts=0;
  await assert.rejects(()=>notifySubsites({hookUrl,expected,
    request:async(_url,options)=>{
      if(options.method!=='POST')return {ok:true,json:async()=>expected};
      posts++;assert.equal(options.redirect,'error');throw new Error('secret URL: '+hookUrl);
    }}),error=>!error.message.includes(hookUrl)&&error.message.includes('URL is hidden'));
  assert.equal(posts,1);
});
