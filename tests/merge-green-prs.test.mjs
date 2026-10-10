import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {trustedPullRequest,verifiedChecks,validTrigger,branchIncludesCurrentMain,runMergeBot} from '../scripts/merge-green-prs.mjs';

const repo='neophilism/SceneSignal', head='a'.repeat(40), main='b'.repeat(40);
const pr={number:17,state:'open',draft:false,user:{login:'neophilism'},
  base:{ref:'main',repo:{full_name:repo}},
  head:{ref:'feat/ss17-spatial-preview',sha:head,repo:{full_name:repo}}};
const workflows=[
  {id:1,name:'SceneSignal CI',event:'pull_request',head_sha:head,head_branch:pr.head.ref,status:'completed',conclusion:'success'},
  {id:2,name:'Planning CI',event:'pull_request',head_sha:head,head_branch:pr.head.ref,status:'completed',conclusion:'success'}
];
const event={action:'completed',workflow_run:{name:'Planning CI',event:'pull_request',head_sha:head,conclusion:'success'}};

test('only owner-authored same-repo development heads are eligible',()=>{
  assert.equal(trustedPullRequest(pr),true);
  for(const bad of [
    {...pr,user:{login:'stranger'}},
    {...pr,head:{...pr.head,repo:{full_name:'other/fork'}}},
    {...pr,base:{...pr.base,ref:'release'}},
    {...pr,draft:true},
    {...pr,head:{...pr.head,ref:'malicious/feature'}},
    {...pr,head:{...pr.head,sha:'invalid'}}
  ])assert.equal(trustedPullRequest(bad),false);
});
test('require both latest workflow runs for exact same SHA and branch',()=>{
  assert.equal(verifiedChecks(pr,workflows),true);
  assert.equal(verifiedChecks(pr,workflows.slice(0,1)),false);
  assert.equal(verifiedChecks(pr,[...workflows,{...workflows[0],id:3,conclusion:'failure'}]),false);
  assert.equal(verifiedChecks(pr,workflows.map(w=>({...w,head_sha:main}))),false);
  assert.equal(verifiedChecks(pr,workflows.map(w=>({...w,head_branch:'other'}))),false);
  assert.equal(verifiedChecks(pr,workflows.map(w=>({...w,status:'queued',conclusion:null}))),false);
});
test('trigger must be a successful named PR workflow in SceneSignal',()=>{
  assert.equal(validTrigger(event,repo),true);
  assert.equal(validTrigger(event,'other/repo'),false);
  assert.equal(validTrigger({...event,workflow_run:{...event.workflow_run,event:'push'}},repo),false);
  assert.equal(validTrigger({...event,workflow_run:{...event.workflow_run,conclusion:'failure'}},repo),false);
  assert.equal(branchIncludesCurrentMain({behind_by:0,status:'ahead'}),true);
  assert.equal(branchIncludesCurrentMain({behind_by:1,status:'diverged'}),false);
});
async function exercise(responseFor) {
  const dir=await mkdtemp(join(tmpdir(),'ss-merge-test-'));
  const eventPath=join(dir,'event.json');await writeFile(eventPath,JSON.stringify(event));
  const calls=[];
  const fetcher=async(url,options)=>{
    const u=new URL(url);
    calls.push({path:u.pathname+u.search,method:options.method});
    const value=responseFor(u,options);
    return new Response(JSON.stringify(value),{status:200,headers:{'content-type':'application/json'}});
  };
  try {
    const result=await runMergeBot({
      env:{GITHUB_EVENT_PATH:eventPath,GITHUB_REPOSITORY:repo,GITHUB_TOKEN:'fake-test-token'},
      fetcher,log:()=>{}
    });
    return{result,calls};
  }finally{await rm(dir,{recursive:true,force:true});}
}
test('green and current main enables exactly one SHA-leased squash merge',async()=>{
  const r=await exercise((url,opts)=>{
    if(url.pathname.endsWith('/pulls')&&opts.method==='GET')return[pr];
    if(url.pathname.endsWith('/actions/runs'))return{workflow_runs:workflows};
    if(url.pathname.endsWith('/branches/main'))return{commit:{sha:main}};
    if(url.pathname.includes('/compare/'))return{behind_by:0,status:'ahead'};
    if(url.pathname.endsWith('/pulls/17/merge')&&opts.method==='PUT'){
      assert.deepEqual(JSON.parse(opts.body),{sha:head,merge_method:'squash'});
      return{merged:true};
    }
    throw Error('Unexpected network call: '+url.pathname);
  });
  assert.deepEqual(r.result,{status:'merged',number:17});
  assert.equal(r.calls.filter(c=>c.method==='PUT').length,1);
});
test('a previously green branch that is behind main remains open',async()=>{
  const r=await exercise((url,opts)=>{
    if(url.pathname.endsWith('/pulls'))return[pr];
    if(url.pathname.endsWith('/actions/runs'))return{workflow_runs:workflows};
    if(url.pathname.endsWith('/branches/main'))return{commit:{sha:main}};
    if(url.pathname.includes('/compare/'))return{behind_by:2,status:'diverged'};
    throw Error('Unexpected write');
  });
  assert.deepEqual(r.result,{status:'no-eligible-pr'});
  assert.equal(r.calls.some(c=>c.method!=='GET'),false);
});
