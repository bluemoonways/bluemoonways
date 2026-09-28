/**
 * Offline test harness for Code.gs — no LinkedIn account or Google account needed.
 *
 * It mocks the Apps Script services (SpreadsheetApp, UrlFetchApp, OAuth2, …)
 * and LinkedIn API responses, then runs the real script logic through the full
 * publishing flow: queue lookup, text escaping, image upload, posting,
 * status/timestamp updates, failure handling, token refresh and triggers.
 *
 * Usage (Node.js 18+):
 *   node tests/local-test.js
 *
 * Expected output: "RESULT: 56 passed, 0 failed"
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');

let pass = 0, fail = 0;
function check(label, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + label); }
  else { fail++; console.log('  ❌ ' + label + (extra !== undefined ? ' → ' + JSON.stringify(extra) : '')); }
}

function buildContext(opts) {
  opts = opts || {};
  const logs = [];
  const writes = [];
  const props = opts.replaceProps ? Object.assign({}, opts.props || {}) : Object.assign({
    LINKEDIN_CLIENT_ID: 'client-id',
    LINKEDIN_CLIENT_SECRET: 'client-secret',
    LINKEDIN_POSTS_SPREADSHEET_ID: 'sheet-id-123'
  }, opts.props || {});

  const rows = (opts.rows || []).map(r => r.slice());
  const sheet = {
    getDataRange: () => ({ getValues: () => rows.map(r => r.slice()) }),
    getRange: (row, col) => ({
      setValue: v => {
        writes.push({ row, col, value: v });
        if (rows[row - 1]) rows[row - 1][col - 1] = v;
      }
    })
  };

  const fetchCalls = [];
  const fetch = (url, options) => {
    fetchCalls.push({ url, options });
    const respond = opts.respond || (() => ({ code: 500, body: 'no mock', headers: {} }));
    const r = respond(url, options);
    return {
      getResponseCode: () => r.code,
      getContentText: () => r.body,
      getHeaders: () => r.headers || {},
      getBlob: () => ({ getContentType: () => 'image/png', getBytes: () => [1, 2, 3] })
    };
  };

  const tokenState = { value: opts.token || null, refreshes: 0 };

  const OAuth2 = {
    createService: () => {
      const svc = {
        setAuthorizationBaseUrl: () => svc,
        setTokenUrl: () => svc,
        setClientId: () => svc,
        setClientSecret: () => svc,
        setCallbackFunction: () => svc,
        setPropertyStore: () => svc,
        setScope: () => svc,
        getAuthorizationUrl: () => 'https://www.linkedin.com/oauth/v2/authorization?mocked=1',
        handleCallback: () => true,
        hasAccess: () => false,
        getLastError: () => null,
        getToken: () => tokenState.value,
        reset: () => { tokenState.value = null; },
        refresh: () => {
          tokenState.refreshes++;
          if (opts.refreshResult === 'fail') throw new Error('refresh denied');
          tokenState.value = { access_token: 'refreshed-token', expiresAt: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r1' };
        }
      };
      return svc;
    },
    getRedirectUri: () => 'https://script.google.com/macros/d/SCRIPT_ID/usercallback'
  };

  const ctx = {
    Logger: { log: m => logs.push(String(m)) },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: k => (props[k] === undefined ? null : props[k]),
        setProperty: (k, v) => { props[k] = v; },
        deleteProperty: k => { delete props[k]; },
        getProperties: () => Object.assign({}, props)
      })
    },
    OAuth2,
    SpreadsheetApp: { openById: () => ({ getSheets: () => [sheet] }), flush: () => {} },
    DriveApp: {
      getFileById: id => {
        if (opts.driveFails) throw new Error('Drive access denied');
        return { getBlob: () => ({ getContentType: () => 'image/jpeg', getBytes: () => [9, 9, 9] }) };
      }
    },
    UrlFetchApp: { fetch },
    HtmlService: { createHtmlOutput: h => h },
    ScriptApp: {
      getProjectTriggers: () => [{ getHandlerFunction: () => 'publishNextLinkedInPost' }, { getHandlerFunction: () => 'other' }],
      deleteTrigger: () => {},
      newTrigger: () => ({ timeBased: function () { return this; }, atHour: function () { return this; }, everyDays: function () { return this; }, create: function () { return {}; } })
    },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    Utilities: {
      base64DecodeWebSafe: () => [], newBlob: () => ({ getDataAsString: () => '{}' })
    },
    Date, Number, String, Object, JSON, Array, Math, Error, console
  };
  ctx.globalThis = ctx;

  vm.createContext(ctx);
  vm.runInContext(SRC, ctx, { filename: 'Code.gs' });

  return { ctx, logs, writes, rows, fetchCalls, props, tokenState };
}

const FUTURE = Math.floor(Date.now() / 1000) + 3600;
const VALID_TOKEN = { access_token: 'valid-token', expiresAt: FUTURE, refresh_token: 'r1' };

function linkedInResponder(postStatus) {
  return (url, options) => {
    if (url.includes('/v2/userinfo')) return { code: 200, body: JSON.stringify({ sub: 'PERSON123', name: 'Faheem' }) };
    if (url.includes('/rest/images?action=initializeUpload')) return { code: 200, body: JSON.stringify({ value: { uploadUrl: 'https://upload.linkedin.example/1', image: 'urn:li:image:IMG1' } }) };
    if (url === 'https://upload.linkedin.example/1') return { code: 201, body: '' };
    if (url.includes('/rest/posts')) return { code: postStatus || 201, body: postStatus && postStatus !== 201 ? '{"message":"mock error"}' : '', headers: { 'x-restli-id': 'urn:li:share:777' } };
    return { code: 404, body: 'unexpected url ' + url };
  };
}

const HEADERS = ['Serial', 'Repo', 'Post Content', 'GitHub Link', 'Image Link', 'LinkedIn Status', 'Published At'];
const QUEUE = [
  HEADERS,
  [1, 'linkedin-auto-poster', 'Check (this) *post* @here!', 'https://github.com/bluemoonways/LinkedIn-Auto-Poster', 'https://drive.google.com/file/d/FILE123/view?usp=sharing', '', ''],
  [2, 'repo-b', 'Second post', 'https://github.com/a/b', '', 'Published', '2026-01-01']
];

/* ───────────── 1. Text escaping & commentary building ───────────── */
console.log('\n1) Text formatting');
{
  const { ctx } = buildContext();
  const escaped = ctx.escapeLinkedInText_('Check (this) *bold* @here [x] {y} a_b ~c~');
  check('escapes (), *, @, [], {}, _, ~',
    escaped === 'Check \\(this\\) \\*bold\\* \\@here \\[x\\] \\{y\\} a\\_b \\~c\\~', escaped);

  const commentary = ctx.buildLinkedInCommentary_('Hello (world)', 'https://github.com/x/y');
  check('URL is NOT escaped', commentary.includes('\nhttps://github.com/x/y'), commentary);
  check('GitHub label present', commentary.includes('🔗 View Project:'), commentary);
  check('Portfolio link appended', commentary.includes('\n🌐 Portfolio:\nhttps://bluemoonways.vercel.app/'), commentary);
  check('post text escaped inside commentary', commentary.startsWith('Hello \\(world\\)'), commentary);
}

/* ───────────── 2. Drive URL parsing ───────────── */
console.log('\n2) Google Drive link parsing');
{
  const { ctx } = buildContext();
  check('/file/d/ID/view', ctx.getDriveFileIdFromUrl_('https://drive.google.com/file/d/ABC-123_x/view?usp=sharing') === 'ABC-123_x');
  check('?id=ID', ctx.getDriveFileIdFromUrl_('https://drive.google.com/uc?export=download&id=XYZ789') === 'XYZ789');
  check('empty → null', ctx.getDriveFileIdFromUrl_('') === null);
  check('junk → null', ctx.getDriveFileIdFromUrl_('https://example.com/image.png') === null);
}

/* ───────────── 3. Full successful publish (with image) ───────────── */
console.log('\n3) publishNextLinkedInPost() — success with image');
{
  const h = buildContext({ rows: QUEUE, token: VALID_TOKEN, respond: linkedInResponder(201) });
  h.ctx.publishNextLinkedInPost();

  const posted = h.fetchCalls.find(c => c.url.includes('/rest/posts'));
  const payload = posted && JSON.parse(posted.options.payload);

  check('posted to /rest/posts', !!posted);
  check('author URN correct', payload && payload.author === 'urn:li:person:PERSON123', payload && payload.author);
  check('commentary escaped', payload && payload.commentary.includes('Check \\(this\\) \\*post\\* \\@here!'), payload && payload.commentary);
  check('GitHub + portfolio links in commentary',
    payload && payload.commentary.includes('https://github.com/bluemoonways/LinkedIn-Auto-Poster') && payload.commentary.includes('https://bluemoonways.vercel.app/'));
  check('image attached', payload && payload.content && payload.content.media.id === 'urn:li:image:IMG1', payload && payload.content);
  check('Linkedin-Version header set', posted && posted.options.headers['Linkedin-Version'] === '202604');
  check('X-Restli-Protocol-Version set', posted && posted.options.headers['X-Restli-Protocol-Version'] === '2.0.0');
  check('Bearer token used', posted && posted.options.headers['Authorization'] === 'Bearer valid-token');
  check('visibility PUBLIC + PUBLISHED lifecycle',
    payload && payload.visibility === 'PUBLIC' && payload.lifecycleState === 'PUBLISHED');

  check('row 2 status = Published', h.rows[1][5] === 'Published', h.rows[1][5]);
  check('row 2 Published At timestamp written', h.rows[1][6] instanceof Date, h.rows[1][6]);
  check('row marked Publishing before publish',
    h.writes[0].row === 2 && h.writes[0].col === 6 && h.writes[0].value === 'Publishing', h.writes[0]);
  check('person URN cached in properties', h.props.LINKEDIN_PERSON_URN === 'urn:li:person:PERSON123', h.props.LINKEDIN_PERSON_URN);
  check('second (already published) row untouched', h.rows[2][5] === 'Published' && h.rows[2][6] === '2026-01-01');
}

/* ───────────── 4. Failure path ───────────── */
console.log('\n4) publishNextLinkedInPost() — API failure');
{
  const h = buildContext({ rows: QUEUE, token: VALID_TOKEN, respond: linkedInResponder(400) });
  let err = null;
  try { h.ctx.publishNextLinkedInPost(); } catch (e) { err = e; }
  check('throws error', !!err && /HTTP 400/.test(err.message), err && err.message);
  check('row 2 status = Failed', h.rows[1][5] === 'Failed', h.rows[1][5]);
  check('no timestamp written on failure', !(h.rows[1][6] instanceof Date), h.rows[1][6]);
}

/* ───────────── 5. Image upload failure → text-only post ───────────── */
console.log('\n5) Image fails → text-only post still published');
{
  const h = buildContext({
    rows: QUEUE, token: VALID_TOKEN, driveFails: true,
    respond: (url, options) => {
      if (url.includes('drive.google.com/uc')) return { code: 404, body: 'not public' };
      return linkedInResponder(201)(url, options);
    }
  });
  h.ctx.publishNextLinkedInPost();
  const payload = JSON.parse(h.fetchCalls.find(c => c.url.includes('/rest/posts')).options.payload);
  check('post published without image', !payload.content, payload.content);
  check('row 2 status = Published', h.rows[1][5] === 'Published', h.rows[1][5]);
}

/* ───────────── 6. Queue exhausted ───────────── */
console.log('\n6) Queue exhausted');
{
  const h = buildContext({ rows: [HEADERS, [1, 'r', 'Done post', 'https://x', '', 'PUBlisHED', '']], token: VALID_TOKEN, respond: linkedInResponder(201) });
  h.ctx.publishNextLinkedInPost();
  check('no API post call made', !h.fetchCalls.some(c => c.url.includes('/rest/posts')));
  check('logs "No unpublished"', h.logs.some(l => l.includes('No unpublished LinkedIn posts remaining')), h.logs.slice(-2));
}

/* ───────────── 7. Preview (dry run) ───────────── */
console.log('\n7) previewNextLinkedInPost() — dry run');
{
  const h = buildContext({ rows: QUEUE, token: VALID_TOKEN, respond: linkedInResponder(201) });
  h.ctx.previewNextLinkedInPost();
  check('nothing published', !h.fetchCalls.some(c => c.url.includes('/rest/posts')));
  check('no sheet status write', h.writes.length === 0, h.writes);
  check('logs PREVIEW ONLY', h.logs.some(l => l.includes('PREVIEW ONLY')), h.logs.slice(-2));
  check('logs final content', h.logs.some(l => l.includes('COMPLETE FINAL CONTENT START')) && h.logs.some(l => l.includes('Portfolio')));
}

/* ───────────── 8. Token handling ───────────── */
console.log('\n8) Token handling');
{
  const noToken = buildContext({ props: {} });
  let e1 = null; try { noToken.ctx.getValidLinkedInAccessToken_(); } catch (e) { e1 = e; }
  check('missing token → clear error', !!e1 && /access token not found/.test(e1.message), e1 && e1.message);

  const expiredNoRefresh = buildContext({ token: { access_token: 'old', expiresAt: Math.floor(Date.now() / 1000) - 10 } });
  let e2 = null; try { expiredNoRefresh.ctx.getValidLinkedInAccessToken_(); } catch (e) { e2 = e; }
  check('expired + no refresh token → clear error', !!e2 && /has expired/.test(e2.message), e2 && e2.message);
  check('hasValidLinkedInAccessToken_ returns false (no throw)', expiredNoRefresh.ctx.hasValidLinkedInAccessToken_() === false);

  const refreshable = buildContext({ token: { access_token: 'old', expiresAt: Math.floor(Date.now() / 1000) - 10, refresh_token: 'r1' } });
  const newToken = refreshable.ctx.getValidLinkedInAccessToken_();
  check('expired token refreshed automatically', newToken === 'refreshed-token', newToken);
  check('refresh() was called once', refreshable.tokenState.refreshes === 1);
  check('valid token returned as-is', buildContext({ token: VALID_TOKEN }).ctx.getValidLinkedInAccessToken_() === 'valid-token');
}

/* ───────────── 9. Missing config / missing columns ───────────── */
console.log('\n9) Configuration & column validation');
{
  const missingProp = buildContext({ replaceProps: true, props: { LINKEDIN_CLIENT_ID: 'x' }, token: VALID_TOKEN });
  let e = null; try { missingProp.ctx.getSpreadsheetId_(); } catch (err) { e = err; }
  check('missing Script Property → clear error', !!e && /Missing Script Property/.test(e.message), e && e.message);

  const badSheet = buildContext({
    rows: [['Serial', 'Repo', 'Anything', 'LinkedIn Status'], [1, 'r', 'text', '']],
    token: VALID_TOKEN
  });
  let e2 = null; try { badSheet.ctx.publishNextLinkedInPost(); } catch (err) { e2 = err; }
  check('missing "Post Content" column → clear error', !!e2 && /post content/.test(e2.message), e2 && e2.message);
}

/* ───────────── 10. Commentary length guard ───────────── */
console.log('\n10) LinkedIn 3000-character guard');
{
  const longRows = [HEADERS, [1, 'r', 'A'.repeat(3200), '', '', '', '']];
  const h = buildContext({ rows: longRows, token: VALID_TOKEN, respond: linkedInResponder(201) });
  let e = null; try { h.ctx.publishNextLinkedInPost(); } catch (err) { e = err; }
  check('over-long post rejected before API call', !!e && /too long/.test(e.message), e && e.message);
  check('no /rest/posts call made', !h.fetchCalls.some(c => c.url.includes('/rest/posts')));
  check('row marked Failed', h.rows[1][5] === 'Failed', h.rows[1][5]);
}

/* ───────────── 11. Triggers & helpers ───────────── */
console.log('\n11) Trigger + helper functions');
{
  const h = buildContext({ token: VALID_TOKEN });
  h.ctx.setupDailyLinkedInTrigger();
  check('setupDailyLinkedInTrigger() runs', h.logs.some(l => l.includes('Daily trigger set')), h.logs.slice(-1));
  h.ctx.setupDailyLinkedInTrigger(9);
  check('custom hour honoured', h.logs.some(l => l.includes('around 9:00')), h.logs.slice(-1));
  h.ctx.removeDailyLinkedInTrigger();
  check('removeDailyLinkedInTrigger() reports removals', h.logs.some(l => /trigger\(s\) removed/.test(l)), h.logs.slice(-1));
  check('logRedirectUri() returns callback URL', h.ctx.logRedirectUri() === 'https://script.google.com/macros/d/SCRIPT_ID/usercallback');
  h.ctx.checkLinkedInAuthorization();
  check('checkLinkedInAuthorization() logs success', h.logs.some(l => l.includes('SUCCESS: LinkedIn access token is valid')));
  h.ctx.diagnoseLinkedInAuth();
  check('diagnoseLinkedInAuth() completes', h.logs.some(l => l.includes('END DIAGNOSTIC')));
  h.ctx.resetLinkedInAuthorization();
  check('reset clears cached person URN', h.props.LINKEDIN_PERSON_URN === undefined);

  const auth = buildContext({ token: VALID_TOKEN });
  auth.ctx.authorizeLinkedIn();
  check('authorizeLinkedIn() skips when token valid', auth.logs.some(l => l.includes('already valid')));
  const auth2 = buildContext({});
  auth2.ctx.authorizeLinkedIn();
  check('authorizeLinkedIn() prints auth URL when unset', auth2.logs.some(l => l.includes('linkedin.com/oauth/v2/authorization')));
}

/* ───────────── 12. testLinkedInPost ───────────── */
console.log('\n12) testLinkedInPost()');
{
  const h = buildContext({ token: VALID_TOKEN, respond: linkedInResponder(201) });
  h.ctx.testLinkedInPost();
  const payload = JSON.parse(h.fetchCalls.find(c => c.url.includes('/rest/posts')).options.payload);
  check('test post published', payload.commentary.includes('Testing my LinkedIn automation'));
  check('no image in test post', !payload.content);
}

console.log('\n────────────────────────────────────────');
console.log(`RESULT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
