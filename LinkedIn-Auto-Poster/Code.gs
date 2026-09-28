/**
 * ============================================================================
 *  💼 LinkedIn Auto Poster
 * ============================================================================
 *  Automated LinkedIn publishing system built with:
 *    • Google Apps Script
 *    • Google Sheets          (content queue)
 *    • Google Drive           (images)
 *    • LinkedIn Posts API     (versioned REST API, /rest/posts)
 *    • OAuth2 for Apps Script (googleworkspace/apps-script-oauth2)
 *
 *  What it does:
 *    1. Reads the next unpublished post from a Google Sheet queue.
 *    2. Escapes the post text for LinkedIn's "Little Text Format".
 *    3. Appends the project (GitHub) link and the portfolio link.
 *    4. Optionally uploads an image from a Google Drive link.
 *    5. Publishes the post to the authenticated LinkedIn member profile.
 *    6. Writes back the status (Publishing / Published / Failed) + timestamp.
 *
 *  Author : Faheem Abbas — AI Automation Specialist
 *  Repo   : https://github.com/bluemoonways/LinkedIn-Auto-Poster
 * ============================================================================
 */


/* ==========================================================================
 *  CONFIGURATION
 * ========================================================================== */

/**
 * LinkedIn versioned API version, format: YYYYMM (year + month).
 * LinkedIn ships a new version every month and supports each version for
 * a minimum of 12 months. Bump this if LinkedIn ever retires the version
 * (a retired version returns HTTP 400 / 426 with a "version not supported").
 */
const LINKEDIN_API_VERSION_ = '202604';

const LINKEDIN_API_BASE_ = 'https://api.linkedin.com';
const LINKEDIN_REST_BASE_ = LINKEDIN_API_BASE_ + '/rest';
const LINKEDIN_USERINFO_URL_ = LINKEDIN_API_BASE_ + '/v2/userinfo';

/** OAuth2 service name used inside the Apps Script property store. */
const LINKEDIN_SERVICE_NAME_ = 'LinkedIn';

/** Fixed portfolio link — appended below the GitHub link on every post. */
const PORTFOLIO_LINK_ = 'https://bluemoonways.vercel.app/';

/** LinkedIn hard limit for the `commentary` field. */
const LINKEDIN_MAX_COMMENTARY_LENGTH_ = 3000;

/**
 * Script Property keys (Project Settings → Script Properties).
 * NEVER hardcode real credentials inside this file.
 */
const PROP_LINKEDIN_CLIENT_ID_ = 'LINKEDIN_CLIENT_ID';
const PROP_LINKEDIN_CLIENT_SECRET_ = 'LINKEDIN_CLIENT_SECRET';
const PROP_SPREADSHEET_ID_ = 'LINKEDIN_POSTS_SPREADSHEET_ID';
const PROP_PERSON_URN_ = 'LINKEDIN_PERSON_URN';

/** Sheet header names the script looks for (case-insensitive). */
const HEADER_POST_CONTENT_ = 'post content';
const HEADER_GITHUB_LINK_ = 'github link';
const HEADER_IMAGE_LINK_ = 'image link';
const HEADER_LINKEDIN_STATUS_ = 'linkedin status';
const HEADER_PUBLISHED_AT_ = 'published at';
const HEADER_REPO_ = 'repo';
const HEADER_SERIAL_ = 'serial';

/** Status values written into the "LinkedIn Status" column. */
const STATUS_PUBLISHING_ = 'Publishing';
const STATUS_PUBLISHED_ = 'Published';
const STATUS_FAILED_ = 'Failed';


/* ==========================================================================
 *  CONFIG HELPERS
 * ========================================================================== */

/** Shortcut for the Script Properties store. */
function getProps_() {
  return PropertiesService.getScriptProperties();
}

/** Read a required Script Property or fail with a clear message. */
function getRequiredProperty_(key) {
  const value = getProps_().getProperty(key);

  if (!value) {
    throw new Error(
      'Missing Script Property: "' + key + '". ' +
      'Open Project Settings → Script Properties and add it.'
    );
  }

  return String(value).trim();
}

/** Google Sheet ID that holds the post queue. */
function getSpreadsheetId_() {
  return getRequiredProperty_(PROP_SPREADSHEET_ID_);
}

/** LinkedIn OAuth2 client ID (from the LinkedIn Developer Portal). */
function getLinkedInClientId_() {
  return getRequiredProperty_(PROP_LINKEDIN_CLIENT_ID_);
}

/** LinkedIn OAuth2 client secret (from the LinkedIn Developer Portal). */
function getLinkedInClientSecret_() {
  return getRequiredProperty_(PROP_LINKEDIN_CLIENT_SECRET_);
}


/* ==========================================================================
 *  OAUTH2 SERVICE
 * ========================================================================== */

/**
 * Build the LinkedIn OAuth2 service.
 *
 * Scopes:
 *   • openid + profile  → read the authenticated member information
 *                         (needed for urn:li:person:{id})
 *   • w_member_social   → create posts on behalf of the member
 *
 * These scopes come from the LinkedIn products
 * "Sign In with LinkedIn using OpenID Connect" and "Share on LinkedIn".
 */
function getLinkedInService_() {
  const props = getProps_();

  return OAuth2.createService(LINKEDIN_SERVICE_NAME_)
    .setAuthorizationBaseUrl('https://www.linkedin.com/oauth/v2/authorization')
    .setTokenUrl('https://www.linkedin.com/oauth/v2/accessToken')
    .setClientId(props.getProperty(PROP_LINKEDIN_CLIENT_ID_))
    .setClientSecret(props.getProperty(PROP_LINKEDIN_CLIENT_SECRET_))
    .setCallbackFunction('authCallback')
    .setPropertyStore(PropertiesService.getScriptProperties())
    .setScope('openid profile w_member_social');
}


/**
 * Read the stored LinkedIn token.
 *
 * This deliberately does NOT use service.hasAccess(): the OAuth2 library can
 * return false from hasAccess() when the OpenID Connect ID token has expired,
 * even though the LinkedIn *access* token is still perfectly valid for posting.
 */
function getStoredLinkedInToken_() {
  return getLinkedInService_().getToken();
}


/**
 * Get a usable LinkedIn access token.
 *
 * If the stored access token has expired but a refresh token exists, one
 * refresh attempt is made before failing.
 */
function getValidLinkedInAccessToken_() {

  let token = getStoredLinkedInToken_();

  if (!token || !token.access_token) {
    throw new Error(
      'LinkedIn access token not found. Please authorize LinkedIn first ' +
      '(run authorizeLinkedIn()).'
    );
  }

  // expiresAt is stored by the OAuth2 library as Unix seconds.
  const expiresAt = token.expiresAt ? Number(token.expiresAt) : 0;
  const now = Math.floor(Date.now() / 1000);

  if (expiresAt && expiresAt <= now + 60) {

    Logger.log('LinkedIn access token expired — trying to refresh it.');

    if (token.refresh_token) {

      try {

        const service = getLinkedInService_();

        service.refresh();

        token = getStoredLinkedInToken_();

      } catch (refreshErr) {

        Logger.log('Token refresh failed: ' + refreshErr);
      }
    }

    const refreshedExpiry =
      token && token.expiresAt ? Number(token.expiresAt) : 0;

    if (!token || !token.access_token ||
        (refreshedExpiry && refreshedExpiry <= now + 60)) {

      throw new Error(
        'LinkedIn access token has expired and could not be refreshed. ' +
        'Please run resetLinkedInAuthorization() and then ' +
        'authorizeLinkedIn() again.'
      );
    }

    Logger.log('LinkedIn access token refreshed successfully.');
  }

  return token.access_token;
}


/** Check whether the actual LinkedIn access token is usable. */
function hasValidLinkedInAccessToken_() {

  try {

    getValidLinkedInAccessToken_();

    return true;

  } catch (err) {

    return false;
  }
}


/* ==========================================================================
 *  AUTHORIZATION FLOW
 * ========================================================================== */

/**
 * Start LinkedIn authorization.
 * Run this manually (View → Logs) and open the printed URL in the browser.
 */
function authorizeLinkedIn() {

  // Fail early with a clear message when the credentials are missing.
  getRequiredProperty_(PROP_LINKEDIN_CLIENT_ID_);
  getRequiredProperty_(PROP_LINKEDIN_CLIENT_SECRET_);

  if (hasValidLinkedInAccessToken_()) {

    Logger.log('LinkedIn access token is already valid. Nothing to do.');
    return;
  }

  const authorizationUrl = getLinkedInService_().getAuthorizationUrl();

  Logger.log('=========================================');
  Logger.log('Open this URL to authorize LinkedIn:');
  Logger.log(authorizationUrl);
  Logger.log('=========================================');
}


/** OAuth2 redirect callback (served by the deployed Web App). */
function authCallback(request) {

  const isAuthorized = getLinkedInService_().handleCallback(request);

  if (isAuthorized) {

    return HtmlService.createHtmlOutput(
      '<h2>LinkedIn authorization successful!</h2>' +
      '<p>You can close this tab and go back to the Apps Script editor.</p>'
    );
  }

  return HtmlService.createHtmlOutput(
    '<h2>LinkedIn authorization denied.</h2>' +
    '<p>You can close this tab and go back to the Apps Script editor.</p>'
  );
}


/** Manually check whether LinkedIn is authorized. */
function checkLinkedInAuthorization() {

  if (hasValidLinkedInAccessToken_()) {

    Logger.log('SUCCESS: LinkedIn access token is valid.');

  } else {

    Logger.log('NOT AUTHORIZED / ACCESS TOKEN EXPIRED — run authorizeLinkedIn().');
  }
}


/** Log the exact OAuth redirect URI that must be whitelisted on LinkedIn. */
function logRedirectUri() {

  const redirectUri = OAuth2.getRedirectUri();

  Logger.log('LinkedIn Redirect URI (whitelist this exact URL):');
  Logger.log(redirectUri);

  return redirectUri;
}


/** Reset LinkedIn authorization (deletes the stored token). */
function resetLinkedInAuthorization() {

  getLinkedInService_().reset();

  getProps_().deleteProperty(PROP_PERSON_URN_);

  Logger.log('LinkedIn authorization has been reset. Run authorizeLinkedIn().');
}


/**
 * Full OAuth diagnostic — useful when LinkedIn starts rejecting requests.
 */
function diagnoseLinkedInAuth() {

  const props = getProps_();
  const service = getLinkedInService_();
  const token = service.getToken();

  Logger.log('===== LINKEDIN AUTH DIAGNOSTIC =====');

  Logger.log(
    'Script Property Keys: ' +
    Object.keys(props.getProperties()).join(', ')
  );

  Logger.log('Token exists: ' + (token ? 'YES' : 'NO'));

  if (token) {

    Logger.log(
      'Token has access_token: ' + (token.access_token ? 'YES' : 'NO')
    );

    Logger.log(
      'Token has expiresAt: ' + (token.expiresAt ? 'YES' : 'NO')
    );

    if (token.expiresAt) {
      Logger.log(
        'Token expiresAt: ' + new Date(Number(token.expiresAt) * 1000)
      );
    }

    Logger.log(
      'Token has refresh_token: ' + (token.refresh_token ? 'YES' : 'NO')
    );

    if (token.id_token) {

      const parts = token.id_token.split('.');

      if (parts.length === 3) {

        try {

          const payload = JSON.parse(
            Utilities.newBlob(
              Utilities.base64DecodeWebSafe(parts[1])
            ).getDataAsString()
          );

          Logger.log(
            'ID Token exp: ' +
            (payload.exp ? new Date(Number(payload.exp) * 1000) : 'no exp claim')
          );

        } catch (err) {

          Logger.log('ID Token could not be decoded: ' + err);
        }

      } else {

        Logger.log('ID Token format is unexpected.');
      }

    } else {

      Logger.log('ID Token: NOT FOUND');
    }
  }

  Logger.log('OAuth2 library hasAccess(): ' + service.hasAccess());
  Logger.log('Actual access-token valid: ' + hasValidLinkedInAccessToken_());
  Logger.log('LinkedIn API version: ' + LINKEDIN_API_VERSION_);

  Logger.log(
    'Last OAuth Error: ' +
    (service.getLastError() ? service.getLastError() : 'NONE')
  );

  Logger.log('===== END DIAGNOSTIC =====');
}


/* ==========================================================================
 *  LINKEDIN MEMBER (AUTHOR URN)
 * ========================================================================== */

/**
 * Fetch the authenticated member ID from the OpenID Connect userinfo endpoint
 * and return the full author URN: urn:li:person:{id}
 *
 * The URN is cached in Script Properties so the API is called only once.
 */
function getLinkedInPersonUrn_(accessToken) {

  const cachedUrn = getProps_().getProperty(PROP_PERSON_URN_);

  if (cachedUrn) {
    return cachedUrn;
  }

  const response = UrlFetchApp.fetch(LINKEDIN_USERINFO_URL_, {
    method: 'get',
    headers: { 'Authorization': 'Bearer ' + accessToken },
    muteHttpExceptions: true
  });

  const statusCode = response.getResponseCode();
  const responseText = response.getContentText();

  Logger.log('Userinfo HTTP Status: ' + statusCode);

  if (statusCode !== 200) {
    throw new Error(
      'LinkedIn userinfo request failed. HTTP ' + statusCode + ': ' + responseText
    );
  }

  const data = JSON.parse(responseText);

  if (!data.sub) {
    throw new Error('LinkedIn user ID was not found in the userinfo response.');
  }

  const personUrn = 'urn:li:person:' + data.sub;

  getProps_().setProperty(PROP_PERSON_URN_, personUrn);

  Logger.log('PERSON URN: ' + personUrn);

  return personUrn;
}


/** Public helper: log and return the authenticated LinkedIn person ID. */
function getLinkedInPersonId() {

  const personUrn = getLinkedInPersonUrn_(getValidLinkedInAccessToken_());

  const personId = personUrn.replace('urn:li:person:', '');

  Logger.log('PERSON ID: ' + personId);

  return personId;
}


/* ==========================================================================
 *  TEXT FORMATTING
 * ========================================================================== */

/**
 * Escape text for LinkedIn "Little Text Format".
 *
 * LinkedIn treats characters such as ( ) { } [ ] @ * _ ~ as formatting /
 * mention syntax. Escaping them keeps the post text exactly as written.
 *
 * NOTE: only the post body is escaped — the GitHub and portfolio URLs are
 * appended afterwards so LinkedIn still renders them as clickable links.
 */
function escapeLinkedInText_(text) {

  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/@/g, '\\@')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/</g, '\\<')
    .replace(/>/g, '\\>')
    .replace(/\*/g, '\\*')
    .replace(/_/g, '\\_')
    .replace(/~/g, '\\~');
}


/**
 * Build the final commentary:
 *   escaped post text + GitHub link + portfolio link.
 */
function buildLinkedInCommentary_(postContent, githubLink) {

  let commentary = escapeLinkedInText_(postContent);

  if (githubLink) {

    commentary += '\n\n🔗 View Project:\n' + githubLink;
  }

  commentary += '\n\n🌐 Portfolio:\n' + PORTFOLIO_LINK_;

  return commentary;
}


/* ==========================================================================
 *  IMAGES (GOOGLE DRIVE → LINKEDIN)
 * ========================================================================== */

/** Extract the Google Drive file ID from a typical share/download URL. */
function getDriveFileIdFromUrl_(url) {

  if (!url) {
    return null;
  }

  const match = String(url).match(/\/d\/([a-zA-Z0-9_-]+)/);

  if (match && match[1]) {
    return match[1];
  }

  const altMatch = String(url).match(/[?&]id=([a-zA-Z0-9_-]+)/);

  if (altMatch && altMatch[1]) {
    return altMatch[1];
  }

  return null;
}


/**
 * Get an image blob from Google Drive.
 *
 * Tries DriveApp first (works when the script account owns/can access the
 * file). Falls back to the public "anyone with the link" download URL when the
 * file belongs to another Google account.
 */
function getImageBlobFromDrive_(fileId) {

  try {

    const blob = DriveApp.getFileById(fileId).getBlob();

    Logger.log('Image fetched via DriveApp for file ID: ' + fileId);

    return blob;

  } catch (driveErr) {

    Logger.log(
      'DriveApp access failed (' + driveErr +
      '), falling back to public download URL.'
    );

    const downloadUrl =
      'https://drive.google.com/uc?export=download&id=' + fileId;

    const downloadResponse = UrlFetchApp.fetch(downloadUrl, {
      muteHttpExceptions: true
    });

    const downloadStatus = downloadResponse.getResponseCode();

    if (downloadStatus !== 200) {

      Logger.log(
        'Public download fallback also failed. HTTP ' + downloadStatus +
        '. Skipping image.'
      );

      return null;
    }

    Logger.log('Image fetched via public download URL for file ID: ' + fileId);

    return downloadResponse.getBlob();
  }
}


/**
 * Upload an image to LinkedIn and return its image URN (asset id).
 *
 * Returns null when the image cannot be uploaded, so the post still goes out
 * as text-only instead of failing completely.
 */
function uploadImageToLinkedIn_(accessToken, authorUrn, driveImageUrl) {

  try {

    const fileId = getDriveFileIdFromUrl_(driveImageUrl);

    if (!fileId) {

      Logger.log('Could not extract a Drive file ID from: ' + driveImageUrl);

      return null;
    }

    const blob = getImageBlobFromDrive_(fileId);

    if (!blob) {

      Logger.log('Could not obtain the image blob. Skipping image.');

      return null;
    }

    // ------------------------------------------------------------------
    // STEP 1 — Initialize upload
    // ------------------------------------------------------------------
    const initResponse = UrlFetchApp.fetch(
      LINKEDIN_REST_BASE_ + '/images?action=initializeUpload',
      {
        method: 'post',
        contentType: 'application/json',
        headers: {
          'Authorization': 'Bearer ' + accessToken,
          'Linkedin-Version': LINKEDIN_API_VERSION_,
          'X-Restli-Protocol-Version': '2.0.0'
        },
        payload: JSON.stringify({
          initializeUploadRequest: { owner: authorUrn }
        }),
        muteHttpExceptions: true
      }
    );

    const initStatus = initResponse.getResponseCode();
    const initText = initResponse.getContentText();

    Logger.log('Image init HTTP Status: ' + initStatus);

    if (initStatus !== 200) {

      Logger.log('Image upload initialization failed: ' + initText);
      Logger.log('Skipping image.');

      return null;
    }

    const initData = JSON.parse(initText);

    const uploadUrl = initData.value && initData.value.uploadUrl;
    const imageUrn = initData.value && initData.value.image;

    if (!uploadUrl || !imageUrn) {

      Logger.log('Image init response was missing uploadUrl/image. Skipping image.');

      return null;
    }

    // ------------------------------------------------------------------
    // STEP 2 — Upload the raw image bytes
    // ------------------------------------------------------------------
    const uploadResponse = UrlFetchApp.fetch(uploadUrl, {
      method: 'put',
      contentType: blob.getContentType() || 'application/octet-stream',
      payload: blob.getBytes(),
      headers: { 'Authorization': 'Bearer ' + accessToken },
      muteHttpExceptions: true
    });

    const uploadStatus = uploadResponse.getResponseCode();

    Logger.log('Image binary upload HTTP Status: ' + uploadStatus);

    if (uploadStatus !== 201 && uploadStatus !== 200) {

      Logger.log('Image binary upload failed. Skipping image.');

      return null;
    }

    Logger.log('Image uploaded successfully. URN: ' + imageUrn);

    return imageUrn;

  } catch (err) {

    Logger.log('Image upload threw an error, skipping image: ' + err);

    return null;
  }
}


/* ==========================================================================
 *  LINKEDIN POSTS API
 * ========================================================================== */

/**
 * Publish a post (text, or text + image) to LinkedIn.
 * Returns the LinkedIn post ID (x-restli-id) on success.
 */
function publishLinkedInPost_(accessToken, authorUrn, commentary, imageUrn) {

  if (commentary.length > LINKEDIN_MAX_COMMENTARY_LENGTH_) {

    throw new Error(
      'Post is too long for LinkedIn: ' + commentary.length + ' characters. ' +
      'The maximum allowed length is ' + LINKEDIN_MAX_COMMENTARY_LENGTH_ + '.'
    );
  }

  const payload = {
    author: authorUrn,
    commentary: commentary,
    visibility: 'PUBLIC',
    distribution: {
      feedDistribution: 'MAIN_FEED',
      targetEntities: [],
      thirdPartyDistributionChannels: []
    },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false
  };

  if (imageUrn) {

    payload.content = { media: { id: imageUrn } };
  }

  const payloadText = JSON.stringify(payload);

  Logger.log('Payload commentary length: ' + commentary.length);
  Logger.log('Payload JSON length: ' + payloadText.length);
  Logger.log('Image attached: ' + (imageUrn ? 'YES (' + imageUrn + ')' : 'NO'));

  const response = UrlFetchApp.fetch(LINKEDIN_REST_BASE_ + '/posts', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Authorization': 'Bearer ' + accessToken,
      'Linkedin-Version': LINKEDIN_API_VERSION_,
      'X-Restli-Protocol-Version': '2.0.0'
    },
    payload: payloadText,
    muteHttpExceptions: true
  });

  const statusCode = response.getResponseCode();
  const responseText = response.getContentText();
  const postId = response.getHeaders()['x-restli-id'] || '';

  Logger.log('HTTP Status: ' + statusCode);
  Logger.log('Response: ' + responseText);
  Logger.log('LinkedIn Post ID: ' + (postId || 'Not returned'));

  if (statusCode !== 201) {

    throw new Error(
      'LinkedIn post failed. HTTP ' + statusCode + ': ' + responseText
    );
  }

  Logger.log('SUCCESS: LinkedIn post published.');

  return postId;
}


/**
 * Test publish — posts directly to the authenticated member profile.
 * Run this manually to verify credentials + scopes end to end.
 */
function testLinkedInPost() {

  const accessToken = getValidLinkedInAccessToken_();
  const authorUrn = getLinkedInPersonUrn_(accessToken);

  publishLinkedInPost_(
    accessToken,
    authorUrn,
    '🚀 Testing my LinkedIn automation with Google Apps Script.\n\n' +
    'This is a test post.',
    null
  );
}


/* ==========================================================================
 *  GOOGLE SHEET QUEUE
 * ========================================================================== */

/** Open the queue spreadsheet (first sheet). */
function getQueueSheet_() {

  return SpreadsheetApp.openById(getSpreadsheetId_()).getSheets()[0];
}


/** Map every header name to its column index (case-insensitive). */
function getHeaderMap_(headerRow) {

  const map = {};

  headerRow.forEach(function(header, index) {

    map[String(header).trim().toLowerCase()] = index;
  });

  return map;
}


/** Throw a clear error when a required column is missing. */
function requireColumn_(headerMap, headerName) {

  const index = headerMap[headerName];

  if (index === undefined) {

    throw new Error(
      'The "' + headerName + '" column was not found in the Google Sheet.'
    );
  }

  return index;
}


/**
 * Find the first row that still needs publishing.
 *
 * A row is publishable when it has post content and its LinkedIn Status is
 * neither "published" nor "publishing".
 *
 * Returns { rowNumber, rowData, headerMap, data } or null when the queue is done.
 */
function findNextUnpublishedRow_() {

  const sheet = getQueueSheet_();
  const data = sheet.getDataRange().getValues();

  if (data.length < 2) {

    throw new Error('No posts found in the Google Sheet.');
  }

  const headerMap = getHeaderMap_(data[0]);

  const postContentColumn = requireColumn_(headerMap, HEADER_POST_CONTENT_);
  const statusColumn = requireColumn_(headerMap, HEADER_LINKEDIN_STATUS_);

  for (let i = 1; i < data.length; i++) {

    const postContent = String(data[i][postContentColumn] || '').trim();

    const status = String(data[i][statusColumn] || '')
      .trim()
      .toLowerCase();

    if (
      postContent &&
      status !== STATUS_PUBLISHED_.toLowerCase() &&
      status !== STATUS_PUBLISHING_.toLowerCase()
    ) {

      return {
        rowNumber: i + 1,
        rowData: data[i],
        headerMap: headerMap,
        data: data
      };
    }
  }

  return null;
}


/** Extract the values we care about from a queue row. */
function parseQueueRow_(row, headerMap, rowNumber) {

  const value = function(headerName) {

    const index = headerMap[headerName];

    return index === undefined ? '' : String(row[index] || '').trim();
  };

  return {
    rowNumber: rowNumber,
    postContent: value(HEADER_POST_CONTENT_),
    githubLink: value(HEADER_GITHUB_LINK_),
    imageLink: value(HEADER_IMAGE_LINK_),
    repo: value(HEADER_REPO_),
    serial: headerMap[HEADER_SERIAL_] === undefined
      ? rowNumber - 1
      : row[headerMap[HEADER_SERIAL_]]
  };
}


/** Write a status value (and optionally a timestamp) back to the sheet. */
function setRowStatus_(sheet, rowNumber, headerMap, status, timestampColumn) {

  sheet
    .getRange(rowNumber, headerMap[HEADER_LINKEDIN_STATUS_] + 1)
    .setValue(status);

  if (timestampColumn !== undefined) {

    sheet
      .getRange(rowNumber, timestampColumn + 1)
      .setValue(new Date());
  }

  SpreadsheetApp.flush();
}


/** Log the complete final content of the next post. */
function logPostPlan_(post, commentary, imageUrn) {

  Logger.log('====================================');
  Logger.log('Preparing LinkedIn post');
  Logger.log('Sheet row: ' + post.rowNumber);
  Logger.log('Serial: ' + post.serial);
  Logger.log('Repo: ' + post.repo);
  Logger.log('Post Content Length: ' + post.postContent.length);
  Logger.log('GitHub Link: ' + post.githubLink);
  Logger.log('Portfolio Link: ' + PORTFOLIO_LINK_);
  Logger.log('Image Link: ' + (post.imageLink || 'None'));
  Logger.log('Image attached: ' + (imageUrn ? 'YES' : 'NO'));
  Logger.log('Final Post Content Length: ' + commentary.length);
  Logger.log('----- COMPLETE FINAL CONTENT START -----');
  Logger.log(commentary);
  Logger.log('----- COMPLETE FINAL CONTENT END -----');
  Logger.log('====================================');
}


/* ==========================================================================
 *  PREVIEW / PUBLISH
 * ========================================================================== */

/**
 * Dry run — logs exactly what the next post will look like
 * (including the linked image status) without publishing anything.
 */
function previewNextLinkedInPost() {

  const next = findNextUnpublishedRow_();

  if (!next) {

    Logger.log('No unpublished LinkedIn posts remaining.');
    return;
  }

  const post = parseQueueRow_(next.rowData, next.headerMap, next.rowNumber);

  const commentary = buildLinkedInCommentary_(post.postContent, post.githubLink);

  let imageUrn = null;

  if (post.imageLink) {

    const accessToken = getValidLinkedInAccessToken_();

    imageUrn = uploadImageToLinkedIn_(
      accessToken,
      getLinkedInPersonUrn_(accessToken),
      post.imageLink
    );
  }

  logPostPlan_(post, commentary, imageUrn);

  Logger.log('PREVIEW ONLY — nothing was published.');
}


/**
 * Publish the next unpublished LinkedIn post.
 *
 * Sheet columns used (matched by header name):
 *   Post Content      → post text
 *   GitHub Link       → project link
 *   Image Link        → Google Drive image URL (optional)
 *   LinkedIn Status   → Publishing / Published / Failed  (script managed)
 *   Published At      → publication timestamp            (script managed)
 *   Repo / Serial     → optional reference info
 */
function publishNextLinkedInPost() {

  const lock = LockService.getScriptLock();

  if (!lock.tryLock(30000)) {

    throw new Error('Another LinkedIn publishing process is already running.');
  }

  try {

    const sheet = getQueueSheet_();
    const next = findNextUnpublishedRow_();

    if (!next) {

      Logger.log('No unpublished LinkedIn posts remaining.');
      return;
    }

    const post = parseQueueRow_(next.rowData, next.headerMap, next.rowNumber);
    const headerMap = next.headerMap;

    const commentary = buildLinkedInCommentary_(
      post.postContent,
      post.githubLink
    );

    // ------------------------------------------------------------------
    // Mark the row as publishing so a concurrent run cannot grab it.
    // ------------------------------------------------------------------
    setRowStatus_(sheet, post.rowNumber, headerMap, STATUS_PUBLISHING_);

    const accessToken = getValidLinkedInAccessToken_();
    const authorUrn = getLinkedInPersonUrn_(accessToken);

    // ------------------------------------------------------------------
    // Optional image upload
    // ------------------------------------------------------------------
    let imageUrn = null;

    if (post.imageLink) {

      imageUrn = uploadImageToLinkedIn_(accessToken, authorUrn, post.imageLink);
    }

    logPostPlan_(post, commentary, imageUrn);

    // ------------------------------------------------------------------
    // Publish
    // ------------------------------------------------------------------
    try {

      publishLinkedInPost_(accessToken, authorUrn, commentary, imageUrn);

      setRowStatus_(
        sheet,
        post.rowNumber,
        headerMap,
        STATUS_PUBLISHED_,
        headerMap[HEADER_PUBLISHED_AT_]
      );

      Logger.log('Published content length: ' + commentary.length);
      Logger.log('GitHub link included: ' + (post.githubLink ? 'YES' : 'NO'));
      Logger.log('Portfolio link included: YES');
      Logger.log('Image included: ' + (imageUrn ? 'YES' : 'NO'));

    } catch (publishErr) {

      setRowStatus_(sheet, post.rowNumber, headerMap, STATUS_FAILED_);

      throw publishErr;
    }

  } finally {

    lock.releaseLock();
  }
}


/* ==========================================================================
 *  TRIGGERS — DAILY AUTOMATIC PUBLISHING
 * ========================================================================== */

/**
 * Create a daily trigger that runs publishNextLinkedInPost() automatically.
 *
 * Run this ONCE manually. Any existing trigger for the same function is
 * removed first, so it is safe to run again to reset the schedule.
 *
 * @param {number} hour Hour of the day (0–23) in the script's timezone.
 *                      Defaults to 14 (2 PM).
 */
function setupDailyLinkedInTrigger(hour) {

  const triggerHour = (hour === undefined || hour === null) ? 14 : Number(hour);

  const triggers = ScriptApp.getProjectTriggers();

  triggers.forEach(function(trigger) {

    if (trigger.getHandlerFunction() === 'publishNextLinkedInPost') {

      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger('publishNextLinkedInPost')
    .timeBased()
    .atHour(triggerHour)
    .everyDays(1)
    .create();

  Logger.log(
    'Daily trigger set: publishNextLinkedInPost() will run around ' +
    triggerHour + ':00 every day (script timezone).'
  );
}


/** Remove the daily LinkedIn publishing trigger. */
function removeDailyLinkedInTrigger() {

  const triggers = ScriptApp.getProjectTriggers();

  let removedCount = 0;

  triggers.forEach(function(trigger) {

    if (trigger.getHandlerFunction() === 'publishNextLinkedInPost') {

      ScriptApp.deleteTrigger(trigger);
      removedCount++;
    }
  });

  Logger.log(removedCount + ' trigger(s) removed.');
}
