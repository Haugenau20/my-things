import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

// Evaluate synthetic requests only. This API neither reads inventory nor writes objects or rules.
const [flag, projectId, ...extra] = process.argv.slice(2);
if (flag !== '--project' || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId ?? '') || extra.length)
  throw new Error('Supply an explicit Firebase project: --project PROJECT_ID');
const require = createRequire(import.meta.url);
const auth = require('firebase-tools/lib/auth');
const { requireAuth } = require('firebase-tools/lib/requireAuth');
const { Client } = require('firebase-tools/lib/apiv2');
const options = { project: projectId, nonInteractive: true };
const account = auth.getProjectDefaultAccount(process.cwd()) || auth.getGlobalDefaultAccount();
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && account) auth.setActiveAccount(options, account);
await requireAuth(options);

const root = '/databases/(default)/documents/inventories/synthetic';
const item = root + '/items/synthetic-item';
const path =
  '/b/synthetic-bucket/o/inventories/synthetic/items/synthetic-item/photos/synthetic-photo/detail.jpg';
const functionMocks = [
  { function: 'firestore.exists', args: [{ anyValue: {} }], result: { value: true } },
  {
    function: 'firestore.get',
    args: [{ exactValue: root }],
    result: { value: { data: { schemaVersion: 2, ownerUid: 'synthetic-owner' } } },
  },
  {
    function: 'firestore.get',
    args: [{ exactValue: item }],
    result: {
      value: {
        data: {
          recordState: 'draft',
          photos: [
            {
              id: 'synthetic-photo',
              state: 'pending',
              detail: { byteSize: 4 },
              thumbnail: { byteSize: 4 },
            },
          ],
        },
      },
    },
  },
];
const cases = [
  { name: 'owner without optional metadata', expectation: 'ALLOW' },
  { name: 'owner with empty metadata', expectation: 'ALLOW', metadata: {} },
  { name: 'extra metadata', expectation: 'DENY', metadata: { unexpected: 'synthetic' } },
  {
    name: 'explicit download token',
    expectation: 'DENY',
    metadata: { firebaseStorageDownloadTokens: 'synthetic-token' },
  },
  { name: 'anonymous upload', expectation: 'DENY', uid: null },
  { name: 'unrelated upload', expectation: 'DENY', uid: 'synthetic-unrelated' },
  { name: 'wrong byte size', expectation: 'DENY', size: 3 },
  { name: 'wrong content type', expectation: 'DENY', contentType: 'text/html' },
  { name: 'replacement upload', expectation: 'DENY', existing: true },
];
const testCases = cases.map((test) => ({
  expectation: test.expectation,
  resource: test.existing ? { size: 4, contentType: 'image/jpeg', metadata: {} } : null,
  functionMocks,
  request: {
    auth: test.uid === null ? null : { uid: test.uid ?? 'synthetic-owner', token: {} },
    method: 'create',
    path,
    resource: {
      size: test.size ?? 4,
      contentType: test.contentType ?? 'image/jpeg',
      ...(test.metadata === undefined ? {} : { metadata: test.metadata }),
    },
  },
}));
const client = new Client({ urlPrefix: 'https://firebaserules.googleapis.com', apiVersion: 'v1' });
const response = await client.post(
  `/projects/${projectId}:test`,
  {
    source: {
      files: [{ name: 'storage.rules', content: await readFile('storage.rules', 'utf8') }],
    },
    testSuite: { testCases },
  },
  { skipLog: { body: true, resBody: true } },
);
const results = response.body.testResults ?? [];
for (const [index, result] of results.entries())
  console.log(`${result.state}: ${cases[index].name}`);
if (
  results.length !== cases.length ||
  results.some((result) => result.state !== 'SUCCESS') ||
  response.body.issues?.some((issue) => issue.severity === 'ERROR')
)
  throw new Error(
    'Synthetic cloud Storage policy checks failed. No data or deployed rules changed.',
  );
console.log('All synthetic cloud policy checks passed. No data or deployed rules changed.');
