import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const relationalTables = [
  'analytics_events', 'verified_app_usage', 'reviews', 'review_reports', 'audit_logs', 'auth_tokens', 'email_outbox',
  'app_subscriptions', 'publisher_follows', 'editorial_collections', 'collection_apps', 'security_reports',
]

export async function createStoreDatabase(dataRoot) {
  await fs.mkdir(dataRoot, { recursive: true })
  const databasePath = path.join(dataRoot, 'store.sqlite')
  const backupsRoot = path.join(dataRoot, 'backups')
  await fs.mkdir(backupsRoot, { recursive: true })
  const db = new DatabaseSync(databasePath)
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS documents (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS analytics_events (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      app_id TEXT,
      anonymous_id TEXT,
      user_id TEXT,
      platform TEXT,
      metadata TEXT NOT NULL DEFAULT '{}',
      occurred_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS analytics_events_date_idx ON analytics_events(occurred_at);
    CREATE INDEX IF NOT EXISTS analytics_events_app_idx ON analytics_events(app_id, occurred_at);
    CREATE TABLE IF NOT EXISTS verified_app_usage (
      user_id TEXT NOT NULL,
      app_id TEXT NOT NULL,
      action_type TEXT NOT NULL CHECK(action_type IN ('download', 'web_open')),
      first_used_at TEXT NOT NULL,
      last_used_at TEXT NOT NULL,
      PRIMARY KEY(user_id, app_id)
    );
    CREATE INDEX IF NOT EXISTS verified_app_usage_app_idx ON verified_app_usage(app_id, last_used_at);
    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      app_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'published',
      helpful_count INTEGER NOT NULL DEFAULT 0,
      helpful_users TEXT NOT NULL DEFAULT '[]',
      publisher_reply TEXT,
      publisher_replied_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(app_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS reviews_app_idx ON reviews(app_id, status, created_at);
    CREATE TABLE IF NOT EXISTS review_reports (
      id TEXT PRIMARY KEY,
      review_id TEXT NOT NULL,
      app_id TEXT NOT NULL,
      reporter_id TEXT NOT NULL,
      reporter_name TEXT NOT NULL,
      reason TEXT NOT NULL,
      details TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open',
      resolution_note TEXT,
      created_at TEXT NOT NULL,
      resolved_at TEXT,
      resolved_by TEXT,
      UNIQUE(review_id, reporter_id),
      FOREIGN KEY(review_id) REFERENCES reviews(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS review_reports_status_idx ON review_reports(status, created_at);
    CREATE INDEX IF NOT EXISTS review_reports_review_idx ON review_reports(review_id);
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      actor_id TEXT,
      actor_name TEXT NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT,
      summary TEXT NOT NULL,
      details TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS audit_logs_date_idx ON audit_logs(created_at);
    CREATE TABLE IF NOT EXISTS auth_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS email_outbox (
      id TEXT PRIMARY KEY,
      recipient TEXT NOT NULL,
      subject TEXT NOT NULL,
      text_body TEXT NOT NULL,
      action_url TEXT,
      kind TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'preview',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS app_subscriptions (
      user_id TEXT NOT NULL,
      app_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY(user_id, app_id)
    );
    CREATE TABLE IF NOT EXISTS publisher_follows (
      user_id TEXT NOT NULL,
      publisher_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY(user_id, publisher_id)
    );
    CREATE TABLE IF NOT EXISTS editorial_collections (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      accent TEXT NOT NULL DEFAULT 'violet',
      published INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS collection_apps (
      collection_id TEXT NOT NULL,
      app_id TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(collection_id, app_id),
      FOREIGN KEY(collection_id) REFERENCES editorial_collections(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS security_reports (
      id TEXT PRIMARY KEY,
      app_id TEXT NOT NULL,
      version TEXT NOT NULL,
      release_id TEXT,
      artifact_url TEXT NOT NULL,
      source TEXT NOT NULL,
      file_name TEXT,
      sha256 TEXT,
      file_size INTEGER,
      scan_status TEXT NOT NULL,
      integrity_status TEXT NOT NULL,
      signature_status TEXT NOT NULL DEFAULT 'not_provided',
      scanner TEXT NOT NULL DEFAULT 'local-validator',
      scanner_version TEXT NOT NULL DEFAULT '1.0',
      findings TEXT NOT NULL DEFAULT '[]',
      scanned_at TEXT NOT NULL,
      verified_at TEXT,
      UNIQUE(app_id, version, artifact_url)
    );
    CREATE INDEX IF NOT EXISTS security_reports_app_idx ON security_reports(app_id, version, scanned_at);
  `)

  const securityColumns = new Set(db.prepare('PRAGMA table_info(security_reports)').all().map((column) => column.name))
  if (!securityColumns.has('artifact_url')) {
    db.exec(`
      ALTER TABLE security_reports RENAME TO security_reports_legacy;
      CREATE TABLE security_reports (
        id TEXT PRIMARY KEY,
        app_id TEXT NOT NULL,
        version TEXT NOT NULL,
        release_id TEXT,
        artifact_url TEXT NOT NULL,
        source TEXT NOT NULL,
        file_name TEXT,
        sha256 TEXT,
        file_size INTEGER,
        scan_status TEXT NOT NULL,
        integrity_status TEXT NOT NULL,
        signature_status TEXT NOT NULL DEFAULT 'not_provided',
        scanner TEXT NOT NULL DEFAULT 'local-validator',
        scanner_version TEXT NOT NULL DEFAULT '1.0',
        findings TEXT NOT NULL DEFAULT '[]',
        scanned_at TEXT NOT NULL,
        verified_at TEXT,
        UNIQUE(app_id, version, artifact_url)
      );
      INSERT INTO security_reports(
        id, app_id, version, release_id, artifact_url, source, file_name, sha256, file_size,
        scan_status, integrity_status, signature_status, scanner, scanner_version, findings, scanned_at, verified_at
      ) SELECT
        id, app_id, version, NULL, 'legacy:' || id, 'unknown', file_name, sha256, file_size,
        scan_status, 'unavailable', signature_status, scanner, 'legacy', findings, scanned_at, NULL
      FROM security_reports_legacy;
      DROP TABLE security_reports_legacy;
      CREATE INDEX IF NOT EXISTS security_reports_app_idx ON security_reports(app_id, version, scanned_at);
    `)
  }

  const documentStatement = db.prepare('SELECT value FROM documents WHERE key = ?')
  const writeDocumentStatement = db.prepare(`
    INSERT INTO documents(key, value, updated_at) VALUES(?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `)

  function readDocument(key, fallback = []) {
    const row = documentStatement.get(key)
    if (!row) return structuredClone(fallback)
    return JSON.parse(row.value)
  }

  function writeDocument(key, value) {
    writeDocumentStatement.run(key, JSON.stringify(value), new Date().toISOString())
  }

  async function migrateJsonDocument(key, file, fallback = []) {
    if (documentStatement.get(key)) return
    try { writeDocument(key, JSON.parse(await fs.readFile(file, 'utf8'))) }
    catch (error) {
      if (error?.code !== 'ENOENT') throw error
      writeDocument(key, fallback)
    }
  }

  function run(sql, ...params) { return db.prepare(sql).run(...params) }
  function get(sql, ...params) { return db.prepare(sql).get(...params) }
  function all(sql, ...params) { return db.prepare(sql).all(...params) }
  function transaction(work) {
    db.exec('BEGIN IMMEDIATE')
    try { const value = work(); db.exec('COMMIT'); return value }
    catch (error) { db.exec('ROLLBACK'); throw error }
  }

  function appendAudit({ actorId = null, actorName = 'System', action, targetType, targetId = null, summary, details = {} }) {
    run('INSERT INTO audit_logs(id, actor_id, actor_name, action, target_type, target_id, summary, details, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)',
      crypto.randomUUID(), actorId, actorName, action, targetType, targetId, summary, JSON.stringify(details), new Date().toISOString())
  }

  function pruneAnalytics(retentionDays = 90) {
    const cutoff = new Date(Date.now() - retentionDays * 86_400_000).toISOString()
    run('DELETE FROM analytics_events WHERE occurred_at < ?', cutoff)
  }

  async function createBackup() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
    const name = `local-store_${timestamp}.json`
    const payload = {
      format: 'local-store-backup-v1',
      createdAt: new Date().toISOString(),
      documents: Object.fromEntries(all('SELECT key, value FROM documents').map((row) => [row.key, JSON.parse(row.value)])),
      tables: Object.fromEntries(relationalTables.map((table) => [table, all(`SELECT * FROM ${table}`)])),
    }
    await fs.writeFile(path.join(backupsRoot, name), `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
    return { name, createdAt: payload.createdAt, size: Buffer.byteLength(JSON.stringify(payload)) }
  }

  async function listBackups() {
    const files = (await fs.readdir(backupsRoot)).filter((name) => /^local-store_[\w.-]+\.json$/.test(name))
    const results = await Promise.all(files.map(async (name) => {
      const stat = await fs.stat(path.join(backupsRoot, name))
      return { name, createdAt: stat.mtime.toISOString(), size: stat.size }
    }))
    return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async function restoreBackup(name) {
    if (!/^local-store_[\w.-]+\.json$/.test(name)) throw new Error('That backup name is invalid.')
    const payload = JSON.parse(await fs.readFile(path.join(backupsRoot, name), 'utf8'))
    if (payload.format !== 'local-store-backup-v1' || !payload.documents || !payload.tables) throw new Error('That file is not a compatible Local store backup.')
    transaction(() => {
      for (const table of [...relationalTables].reverse()) run(`DELETE FROM ${table}`)
      run('DELETE FROM documents')
      for (const [key, value] of Object.entries(payload.documents)) writeDocument(key, value)
      for (const table of relationalTables) {
        const rows = payload.tables[table] ?? []
        for (const originalRow of rows) {
          const row = table === 'security_reports' && !originalRow.artifact_url ? {
            ...originalRow,
            release_id: null,
            artifact_url: `legacy:${originalRow.id}`,
            source: 'unknown',
            integrity_status: 'unavailable',
            scanner_version: 'legacy',
            verified_at: null,
          } : originalRow
          const columns = Object.keys(row)
          if (!columns.length) continue
          run(`INSERT INTO ${table}(${columns.join(',')}) VALUES(${columns.map(() => '?').join(',')})`, ...columns.map((column) => row[column]))
        }
      }
    })
    return payload
  }

  return {
    databasePath, backupsRoot, db, readDocument, writeDocument, migrateJsonDocument,
    run, get, all, transaction, appendAudit, pruneAnalytics, createBackup, listBackups, restoreBackup,
  }
}
