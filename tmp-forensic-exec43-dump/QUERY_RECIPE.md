# Forensic dump recipe — exec_43_1789402538385

Requires `.env` with `DB_URI` (Mongo Atlas). Do not commit dumps with secrets.

```bash
cd unagency-backend
node <<'EOF'
require('dotenv').config({ path: '.env' });
const { MongoClient } = require('mongodb');
const fs = require('fs');
const out = 'tmp-forensic-exec43-dump';
fs.mkdirSync(out, { recursive: true });

const EXEC = 'exec_43_1789402538385';
const JOB = 'job_46_1789402538414';
const SESSION = 'cdf_mu1fz0gn_b5q62iyz';
const ART = 'cdfart_mu1g380n_2_social-media-output';
const MEDIA = 'art_syncimg_53_1789402565789_0';

(async () => {
  const client = new MongoClient(process.env.DB_URI, { serverSelectionTimeoutMS: 30000 });
  await client.connect();
  const db = client.db();

  const ex = await db.collection('enterprise_executions').findOne({ executionId: EXEC });
  const extras = await db.collection('enterprise_execution_extras').findOne({ executionId: EXEC });
  const job = await db.collection('enterprise_jobs').findOne({
    $or: [{ jobId: JOB }, { jobId: ex?.jobId }, { 'payload.metadata.executionId': EXEC }],
  });
  const sess = await db.collection('cdf_sessions').findOne({ sessionId: SESSION });
  const bag = await db.collection('cdf_canonical_artifact_bags').findOne({ bagKey: 'global' });
  const arts = (bag?.snapshot?.artifacts || []).filter(
    (a) => a.sessionId === SESSION || a.artifactId === ART || String(a.artifactId).includes('mu1g1wsi'),
  );
  const ids = new Set(arts.map((a) => a.artifactId).concat([ART]));
  const vers = (bag?.snapshot?.versions || []).filter((v) => ids.has(v.artifactId));
  const media = await db.collection('enterprise_artifacts').find({
    $or: [{ executionId: EXEC }, { artifactId: MEDIA }],
  }).toArray();
  const obs = await db.collection('enterprise_execution_observability').findOne({ executionId: EXEC });
  const perf = await db.collection('enterprise_model_performance_evidence').find({ executionId: EXEC }).toArray();

  fs.writeFileSync(`${out}/01_execution.json`, JSON.stringify(ex, null, 2));
  fs.writeFileSync(`${out}/02_extras.json`, JSON.stringify(extras, null, 2));
  fs.writeFileSync(`${out}/03_job.json`, JSON.stringify(job, null, 2));
  fs.writeFileSync(`${out}/04_session.json`, JSON.stringify(sess, null, 2));
  fs.writeFileSync(`${out}/05_cdf_artifacts_versions.json`, JSON.stringify({ arts, vers }, null, 2));
  fs.writeFileSync(`${out}/06_observability.json`, JSON.stringify(obs, null, 2));
  fs.writeFileSync(`${out}/07_enterprise_artifacts.json`, JSON.stringify(media, null, 2));
  fs.writeFileSync(`${out}/08_performance_evidence.json`, JSON.stringify(perf, null, 2));

  const meta = { ...(extras?.createMetadataSnapshot || {}), ...(job?.payload?.metadata || {}) };
  console.log({
    execution: !!ex,
    extras: !!extras,
    job: job?.jobId,
    session: !!sess,
    arts: arts.length,
    vers: vers.length,
    media: media.length,
    cdfStructuralComplianceStatus: meta.cdfStructuralComplianceStatus,
    cdfStructuralCompliance: meta.cdfStructuralCompliance,
    cdfCanonicalContextApplied: meta.cdfCanonicalContextApplied,
    deliverableComposition: meta.cdfCanonicalSectionsPresent?.deliverableComposition,
    promptFingerprint: meta.promptFingerprint,
  });
  await client.close();
})();
EOF
```

Also inspect live stdout for this run (already captured):

- `tmp-forensic-exec43-dump/00_live_backend_stdout_terminal1.txt`
- Original: Cursor terminals `1.txt` (npm start)
