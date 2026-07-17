// Polls the App Store Connect API until the just-submitted build finishes
// Apple's own TestFlight processing (processingState becomes VALID), rather
// than treating "eas submit succeeded" as "available" — that only means the
// upload went through, not that Apple is done validating it.
//
// Required env: ASC_KEY_ID, ASC_ISSUER_ID, ASC_PRIVATE_KEY (the .p8 file's
// full contents), ASC_APP_ID, BUILD_NUMBER.

import crypto from 'node:crypto';

const { ASC_KEY_ID, ASC_ISSUER_ID, ASC_PRIVATE_KEY, ASC_APP_ID, BUILD_NUMBER } = process.env;

if (!ASC_KEY_ID || !ASC_ISSUER_ID || !ASC_PRIVATE_KEY || !ASC_APP_ID || !BUILD_NUMBER) {
  console.error(
    'Missing required env vars (ASC_KEY_ID, ASC_ISSUER_ID, ASC_PRIVATE_KEY, ASC_APP_ID, BUILD_NUMBER).'
  );
  process.exit(1);
}

const POLL_INTERVAL_MS = 30_000;
const MAX_WAIT_MS = 90 * 60 * 1000; // 90 minutes — generously past typical processing time
const TOKEN_LIFETIME_S = 60 * 19; // ASC tokens must be <= 20 minutes

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// Standard App Store Connect API auth: an ES256 JWT signed with the .p8 key.
function makeToken() {
  const header = { alg: 'ES256', kid: ASC_KEY_ID, typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = { iss: ASC_ISSUER_ID, iat: now, exp: now + TOKEN_LIFETIME_S, aud: 'appstoreconnect-v1' };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = crypto
    .createSign('SHA256')
    .update(unsigned)
    .end()
    // JWS/JWT wants the raw R||S signature, not the DER encoding Node produces by default.
    .sign({ key: ASC_PRIVATE_KEY, dsaEncoding: 'ieee-p1363' });
  const encodedSignature = signature
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `${unsigned}.${encodedSignature}`;
}

async function fetchProcessingState() {
  const url =
    `https://api.appstoreconnect.apple.com/v1/builds` +
    `?filter[app]=${encodeURIComponent(ASC_APP_ID)}` +
    `&filter[version]=${encodeURIComponent(BUILD_NUMBER)}` +
    `&fields[builds]=processingState,version,uploadedDate` +
    `&sort=-uploadedDate&limit=1`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${makeToken()}` } });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`App Store Connect API error ${response.status}: ${body}`);
  }
  const json = await response.json();
  return json.data?.[0]?.attributes?.processingState ?? null;
}

async function main() {
  console.log(`Waiting for build ${BUILD_NUMBER} to finish TestFlight processing...`);
  const startedAt = Date.now();
  for (;;) {
    let state = null;
    try {
      state = await fetchProcessingState();
      if (state) console.log(`processingState=${state}`);
    } catch (error) {
      console.error(`Poll failed, will retry: ${error.message}`);
    }

    if (state === 'VALID') {
      console.log('Build finished processing — available in TestFlight.');
      return;
    }
    if (state === 'FAILED' || state === 'INVALID') {
      throw new Error(`Apple rejected the build during processing: ${state}`);
    }
    if (Date.now() - startedAt > MAX_WAIT_MS) {
      throw new Error('Timed out waiting for TestFlight processing to finish.');
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
