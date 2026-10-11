import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const TRUSTED_REPOSITORY = 'neophilism/SceneSignal';
export const REQUIRED_CHECKS = ['SceneSignal CI','Planning CI'];
const allowBranch = /^(?:feat\/|feature\/|ci\/)[A-Za-z0-9_.\/-]{1,127}$/;
const shaPattern = /^[0-9a-f]{40}$/;

/** Restrict automatic merges to explicitly owner-authored PRs in this repository. */
export function trustedPullRequest(pr) {
  return pr && pr.state === 'open' && !pr.draft &&
    pr.user?.login === 'neophilism' &&
    pr.base?.ref === 'main' &&
    pr.base?.repo?.full_name === TRUSTED_REPOSITORY &&
    pr.head?.repo?.full_name === TRUSTED_REPOSITORY &&
    shaPattern.test(pr.head?.sha ?? '') && allowBranch.test(pr.head?.ref ?? '');
}
/** Never count old attempts, canceled checks, or checks for another branch head. */
export function verifiedChecks(pr, workflowRuns) {
  if (!trustedPullRequest(pr)) return false;
  for (const name of REQUIRED_CHECKS) {
    const matching = workflowRuns.filter(run =>
      run.name === name && run.event === 'pull_request' &&
      run.head_sha === pr.head.sha && run.head_branch === pr.head.ref
    ).sort((a, b) => b.id - a.id);
    if (!matching.length || matching[0].status !== 'completed' || matching[0].conclusion !== 'success') return false;
  }
  return true;
}
export function validTrigger(event, repository) {
  const w = event?.workflow_run;
  return repository === TRUSTED_REPOSITORY &&
    event?.action === 'completed' &&
    REQUIRED_CHECKS.includes(w?.name) && w?.event === 'pull_request' &&
    w?.conclusion === 'success' && shaPattern.test(w?.head_sha ?? '');
}
export function branchIncludesCurrentMain(comparison) {
  return comparison && Number.isInteger(comparison.behind_by) && comparison.behind_by === 0 &&
    comparison.status !== 'diverged';
}

/** Only GitHub's default-branch workflow uses this token; never check out PR code. */
export async function runMergeBot({env=process.env,fetcher=fetch,log=console.log} = {}) {
  if (!env.GITHUB_EVENT_PATH || !env.GITHUB_REPOSITORY) throw Error('Missing GitHub workflow identity');
  const event = JSON.parse(await readFile(env.GITHUB_EVENT_PATH, 'utf8'));
  if (!validTrigger(event, env.GITHUB_REPOSITORY)) return {status:'ignored'};
  if (!env.GITHUB_TOKEN) throw Error('Missing scoped GitHub token');
  async function api(path, method='GET', body) {
    const response=await fetcher('https://api.github.com/'+path,{
      method,redirect:'error',signal:AbortSignal.timeout(15000),
      headers:{
        Accept:'application/vnd.github+json',Authorization:'Bearer '+env.GITHUB_TOKEN,
        'X-GitHub-Api-Version':'2022-11-28',
        ...(body?{'Content-Type':'application/json'}:{})
      },
      ...(body?{body:JSON.stringify(body)}:{})
    });
    if (!response.ok) throw Error('GitHub API '+method+' '+response.status);
    return response.json();
  }
  const repo=TRUSTED_REPOSITORY;
  const [open, workflows, main]=await Promise.all([
    api('repos/'+repo+'/pulls?state=open&per_page=100'),
    api('repos/'+repo+'/actions/runs?head_sha='+event.workflow_run.head_sha+'&per_page=100'),
    api('repos/'+repo+'/branches/main')
  ]);
  const candidates=open.filter(pr=>pr.head?.sha===event.workflow_run.head_sha &&
    verifiedChecks(pr,workflows.workflow_runs ?? []));
  for(const pr of candidates){
    // A green PR tested on an older base must be reconciled and retested first.
    const comparison=await api('repos/'+repo+'/compare/'+main.commit.sha+'...'+pr.head.sha);
    if(!branchIncludesCurrentMain(comparison)){log('Skipping PR #'+pr.number+': branch needs fresh main merge and tests');continue;}
    try {
      // The SHA lease prevents merging a changed PR using stale CI evidence.
      const merged=await api('repos/'+repo+'/pulls/'+pr.number+'/merge','PUT',
        {sha:pr.head.sha,merge_method:'squash'});
      if(merged.merged===true){log('Merged trusted, green PR #'+pr.number);return{status:'merged',number:pr.number};}
    } catch(error) {
      // Could be branch protection, review rules, permission limits, or conflicts.
      // Leave PR open for explicit remediation rather than bypassing checks.
      log('PR #'+pr.number+' remains open: '+(error instanceof Error?error.message:'GitHub rejection'));
    }
  }
  return {status:'no-eligible-pr'};
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result=await runMergeBot();
    console.log('SceneSignal owner PR merge check: '+result.status);
  } catch (error) {
    console.error(error instanceof Error?error.message:'Owner PR merge checker failed');
    process.exitCode=1;
  }
}
