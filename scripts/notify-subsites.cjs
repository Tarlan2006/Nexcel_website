const fs = require('node:fs');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const { validateNavigation } = require('./lib/navigation.cjs');
const PUBLIC_NAV_URL = 'https://nexcel.kz/shared/nav.json';

async function notifySubsites({ hookUrl, expected, revision = '', request = fetch,
  pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)), attempts = 60, delayMs = 10000 } = {}) {
  if (!hookUrl) return { skipped: true, reason: 'PHOTO_DEPLOY_HOOK is not configured.' };
  let hook;
  try { hook = new URL(hookUrl); } catch { throw new Error('PHOTO_DEPLOY_HOOK must be an HTTPS URL.'); }
  if (hook.protocol !== 'https:' || hook.username || hook.password) throw new Error('PHOTO_DEPLOY_HOOK must be an HTTPS URL without credentials.');
  validateNavigation(expected);
  const publicUrl = new URL(PUBLIC_NAV_URL);
  if (revision) publicUrl.searchParams.set('revision', revision);
  let published = false;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await request(publicUrl.href, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(15000) });
      if (response.ok) {
        if (isDeepStrictEqual(await response.json(), expected)) { published = true; break; }
      } else { await response.body?.cancel(); }
    } catch { /* A pending deployment or transient GET failure does not trigger a subsite yet. */ }
    if (attempt < attempts - 1) await pause(delayMs);
  }
  if (!published) throw new Error('Expected nav.json was not published in time; photo deployment was not triggered.');
  let response;
  try { response = await request(hook.href, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000) }); }
  catch { throw new Error('Cloudflare deploy hook request failed. The URL is hidden.'); }
  if (!response.ok) throw new Error('Cloudflare deploy hook returned HTTP ' + response.status + '. The URL is hidden.');
  await response.body?.cancel();
  return { skipped: false, triggered: true };
}

if (require.main === module) {
  const hookUrl = process.env.PHOTO_DEPLOY_HOOK;
  const expected = hookUrl ? JSON.parse(fs.readFileSync(path.resolve(__dirname, '../shared/nav.json'), 'utf8')) : undefined;
  notifySubsites({ hookUrl, expected, revision: process.env.GITHUB_SHA }).then(result => {
    console.log(result.skipped ? 'SKIP: ' + result.reason : 'Published nav.json confirmed. Photo deployment triggered.');
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { notifySubsites };
