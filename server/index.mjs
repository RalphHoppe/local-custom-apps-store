import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import multer from 'multer'
import { createStoreDatabase } from './database.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dataRoot = path.resolve(process.env.STORE_DATA_DIR || path.join(root, 'data'))
const uploadsRoot = path.join(dataRoot, 'uploads')
const screenshotsRoot = path.join(uploadsRoot, 'screenshots')
const installersRoot = path.join(uploadsRoot, 'installers')
const iconsRoot = path.join(uploadsRoot, 'icons')
const overridesFile = path.join(dataRoot, 'apps.json')
const usersFile = path.join(dataRoot, 'users.json')
const sessionsFile = path.join(dataRoot, 'sessions.json')
const seedCatalogFile = path.join(root, 'public', 'apps.json')
const isProduction = process.env.NODE_ENV === 'production'
const port = Number(process.env.PORT || 5173)
const sessionLifetime = 30 * 24 * 60 * 60 * 1000

await Promise.all([
  fs.mkdir(screenshotsRoot, { recursive: true }),
  fs.mkdir(installersRoot, { recursive: true }),
  fs.mkdir(iconsRoot, { recursive: true }),
])

const database = await createStoreDatabase(dataRoot)
await Promise.all([
  database.migrateJsonDocument('apps', overridesFile, []),
  database.migrateJsonDocument('users', usersFile, []),
  database.migrateJsonDocument('sessions', sessionsFile, []),
])
database.pruneAnalytics(Number(process.env.ANALYTICS_RETENTION_DAYS || 90))

const documentKeys = new Map([[overridesFile, 'apps'], [usersFile, 'users'], [sessionsFile, 'sessions']])
function normalizePreferences(value = {}) {
  return { soundEnabled: true, soundVolume: 0.35, soundScope: 'important', liveToasts: true, browserNotifications: false, ...value }
}
function normalizeUser(user) {
  return {
    ...user,
    emailVerified: user.emailVerified ?? Boolean(user.isBootstrapAdmin),
    emailVerifiedAt: user.emailVerifiedAt ?? (user.isBootstrapAdmin ? user.createdAt : null),
    publisherProfile: { headline: '', about: '', accent: 'violet', logoImage: '', coverImage: '', websiteUrl: '', supportUrl: '', documentationUrl: '', supportEmail: '', ...(user.publisherProfile ?? {}) },
    publisherVerified: Boolean(user.publisherVerified),
    publisherVerifiedAt: user.publisherVerifiedAt ?? null,
    publisherVerifiedBy: user.publisherVerifiedBy ?? null,
    publisherVerificationNote: user.publisherVerificationNote ?? '',
    notificationPreferences: normalizePreferences(user.notificationPreferences),
  }
}

async function readJson(file, fallback = []) {
  const key = documentKeys.get(file)
  if (key) {
    const value = database.readDocument(key, fallback)
    return key === 'users' ? value.map(normalizeUser) : value
  }
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback
    throw error
  }
}

async function writeJson(file, value) {
  const key = documentKeys.get(file)
  if (key) { database.writeDocument(key, value); return }
  const temporary = `${file}.${crypto.randomUUID()}.tmp`
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await fs.rename(temporary, file)
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const digest = crypto.scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${digest}`
}

function verifyPassword(password, saved) {
  try {
    const [salt, expectedHex] = saved.split(':')
    const actual = crypto.scryptSync(password, salt, 64)
    const expected = Buffer.from(expectedHex, 'hex')
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}

function publicUser(user) {
  if (!user) return null
  const { passwordHash: _passwordHash, ...safe } = user
  return safe
}

async function ensureBootstrapAdmin() {
  const users = await readJson(usersFile)
  if (users.some((user) => user.isBootstrapAdmin || user.username.toLowerCase() === 'admin')) return
  const now = new Date().toISOString()
  users.unshift({
    id: crypto.randomUUID(),
    username: 'admin',
    email: 'admin@local.store',
    displayName: 'Administrator',
    passwordHash: hashPassword('admin123'),
    requestedRole: 'admin',
    role: 'admin',
    status: 'approved',
    reviewNote: '',
    createdAt: now,
    reviewedAt: now,
    isBootstrapAdmin: true,
  })
  await writeJson(usersFile, users)
}

await ensureBootstrapAdmin()

function parseCookies(request) {
  return Object.fromEntries((request.headers.cookie ?? '').split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
    const index = part.indexOf('=')
    return [decodeURIComponent(part.slice(0, index)), decodeURIComponent(part.slice(index + 1))]
  }))
}

function sessionCookie(request, token, maxAge = sessionLifetime / 1000) {
  const forwardedSecure = request.headers['x-forwarded-proto'] === 'https'
  return [`local_store_session=${encodeURIComponent(token)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${Math.floor(maxAge)}`, ...(isProduction || forwardedSecure ? ['Secure'] : [])].join('; ')
}

async function resolveAuth(request, _response, next) {
  try {
    const token = parseCookies(request).local_store_session
    if (!token) { request.user = null; next(); return }
    const [sessions, users] = await Promise.all([readJson(sessionsFile), readJson(usersFile)])
    const now = Date.now()
    const session = sessions.find((item) => item.token === token && new Date(item.expiresAt).getTime() > now)
    request.user = session ? users.find((user) => user.id === session.userId) ?? null : null
    next()
  } catch (error) {
    next(error)
  }
}

function requireSignedIn(request, response, next) {
  if (!request.user) { response.status(401).json({ error: 'Sign in to continue.' }); return }
  next()
}

function requireApproved(request, response, next) {
  if (!request.user) { response.status(401).json({ error: 'Sign in to continue.' }); return }
  if (request.user.status !== 'approved') { response.status(403).json({ error: 'Your account must be approved before you can do that.' }); return }
  if (!request.user.emailVerified) { response.status(403).json({ error: 'Verify your email before using account features.' }); return }
  next()
}

function requirePublisher(request, response, next) {
  requireApproved(request, response, () => {
    if (!['publisher', 'admin'].includes(request.user.role)) { response.status(403).json({ error: 'Publisher access is required.' }); return }
    next()
  })
}

function requireAdmin(request, response, next) {
  requireApproved(request, response, () => {
    if (request.user.role !== 'admin') { response.status(403).json({ error: 'Administrator access is required.' }); return }
    next()
  })
}

const workflowKeys = new Set([
  'submissionStatus', 'reviewNote', 'reviewHistory', 'submittedAt', 'reviewedAt', 'reviewedBy',
  'ownerId', 'ownerName', 'publishedSnapshot', 'pendingRelease', 'releaseSubmissionStatus',
  'releaseReviewNote', 'releaseSubmittedAt', 'source',
])

function toPublished(app) {
  const published = {}
  for (const [key, value] of Object.entries(app)) {
    if (!workflowKeys.has(key)) published[key] = value
  }
  published.isCustom = Boolean(app.isCustom)
  return published
}

async function getCatalogData() {
  const [seedApps, storedOverrides] = await Promise.all([readJson(seedCatalogFile), readJson(overridesFile)])
  let changed = false
  const overrides = storedOverrides.map((listing) => {
    const due = (listing.releases ?? []).find((release) => release.status === 'scheduled' && release.scheduledAt && new Date(release.scheduledAt).getTime() <= Date.now())
    if (!due) return listing
    changed = true
    const activated = { ...due, status: (due.rolloutPercentage ?? 100) < 100 ? 'rolling' : 'published', publishedAt: new Date().toISOString(), subscribersNotifiedAt: new Date().toISOString() }
    const next = applyRelease({ ...listing, releases: listing.releases.map((release) => release.id === due.id ? activated : release) }, activated)
    const subscribers = database.all('SELECT user_id FROM app_subscriptions WHERE app_id = ?', listing.id)
    subscribers.forEach(({ user_id }) => createNotification(user_id, { title: `${listing.name} ${activated.version} is available`, body: activated.notes?.[0] ?? 'A scheduled release is now available.', kind: 'release', priority: activated.channel === 'stable' ? 'important' : 'normal', href: `/app/${listing.id}#release-channels` }))
    emitEvent('catalog.changed', { appId: listing.id })
    return next
  })
  if (changed) await writeJson(overridesFile, overrides)
  return { seedApps, overrides }
}

function effectivePublicApp(override) {
  const status = override.submissionStatus ?? 'approved'
  if (status === 'unpublished') return null
  if (status === 'approved') return override.publishedSnapshot ?? toPublished(override)
  return override.publishedSnapshot ?? null
}

function rolloutEligible(key, release) {
  const bucket = crypto.createHash('sha256').update(`${key}:${release.id}`).digest().readUInt32BE(0) % 100
  return bucket < (release.rolloutPercentage ?? 100)
}
async function getPublicCatalog(audienceKey = 'guest') {
  const { seedApps, overrides } = await getCatalogData()
  const byId = new Map(overrides.map((app) => [app.id, app]))
  const merged = seedApps.flatMap((seed) => {
    const override = byId.get(seed.id)
    if (!override) return [seed]
    const effective = effectivePublicApp(override)
    return effective ? [effective] : []
  })
  const seedIds = new Set(seedApps.map((app) => app.id))
  for (const override of overrides) {
    if (seedIds.has(override.id)) continue
    const effective = effectivePublicApp(override)
    if (effective) merged.push(effective)
  }
  for (const listing of merged) {
    if (!database.get('SELECT 1 AS value FROM security_reports WHERE app_id = ? AND version = ?', listing.id, listing.version)) await scanBuild(listing).catch(() => undefined)
  }
  const users = await readJson(usersFile)
  return merged.map((app) => {
    const owner = users.find((user) => user.id === app.ownerId)
    const summary = database.get("SELECT COUNT(*) AS total, AVG(rating) AS average FROM reviews WHERE app_id = ? AND status = 'published'", app.id)
    const latestReport = database.get('SELECT * FROM security_reports WHERE app_id = ? AND version = ? ORDER BY scanned_at DESC LIMIT 1', app.id, app.version)
    const trust = latestReport ? securityProfile(app, latestReport) : app.trust
    const releases = (app.releases ?? []).map((release) => ({ ...release, channel: release.channel ?? 'stable', status: release.status ?? 'published', rolloutPercentage: release.rolloutPercentage ?? 100, audienceEligible: rolloutEligible(audienceKey, release) }))
    return { ...app, releases, trust, publisherUsername: owner?.username, publisherName: owner?.displayName ?? app.developer, publisherVerified: Boolean(owner?.publisherVerified), ratingAverage: Number(summary?.average ?? 0), ratingCount: Number(summary?.total ?? 0) }
  })
}

async function getInternalCatalog() {
  const { seedApps, overrides } = await getCatalogData()
  const byId = new Map(overrides.map((app) => [app.id, app]))
  const merged = seedApps.map((seed) => byId.has(seed.id) ? { ...byId.get(seed.id), isCustom: true, source: 'catalog' } : { ...seed, submissionStatus: 'approved', source: 'catalog' })
  const seedIds = new Set(seedApps.map((app) => app.id))
  return [...merged, ...overrides.filter((app) => !seedIds.has(app.id)).map((app) => ({ ...app, isCustom: true, source: 'server' }))]
}

async function getInternalApp(id) {
  return (await getInternalCatalog()).find((app) => app.id === id)
}

async function upsertOverride(listing) {
  const overrides = await readJson(overridesFile)
  const next = overrides.some((item) => item.id === listing.id)
    ? overrides.map((item) => item.id === listing.id ? listing : item)
    : [listing, ...overrides]
  await writeJson(overridesFile, next)
  return listing
}

function cleanName(originalName, fallback) {
  const extension = path.extname(originalName).toLowerCase().replace(/[^.a-z0-9]/g, '')
  const base = path.basename(originalName, path.extname(originalName)).normalize('NFKD').replace(/[^a-zA-Z0-9-_]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || fallback
  return `${base}-${crypto.randomUUID().slice(0, 8)}${extension}`
}

const storage = multer.diskStorage({
  destination(_request, file, callback) {
    if (file.fieldname === 'screenshots' || file.fieldname === 'publisherCover') callback(null, screenshotsRoot)
    else if (file.fieldname === 'icon' || file.fieldname === 'publisherLogo') callback(null, iconsRoot)
    else callback(null, installersRoot)
  },
  filename(_request, file, callback) {
    const fallback = ['screenshots', 'publisherCover'].includes(file.fieldname) ? 'image' : ['icon', 'publisherLogo'].includes(file.fieldname) ? 'icon' : 'app'
    callback(null, cleanName(file.originalname, fallback))
  },
})

const upload = multer({
  storage,
  limits: { files: 12, fileSize: 2 * 1024 * 1024 * 1024, fields: 5 },
  fileFilter(_request, file, callback) {
    const safeImageTypes = new Set(['image/png', 'image/jpeg', 'image/webp'])
    if (['screenshots', 'icon', 'publisherLogo', 'publisherCover'].includes(file.fieldname) && !safeImageTypes.has(file.mimetype)) {
      const error = new Error(`${file.originalname} must be a PNG, JPG, or WebP image.`)
      error.status = 400
      callback(error)
      return
    }
    callback(null, true)
  },
})

function uploadedPath(file) {
  const folder = ['screenshots', 'publisherCover'].includes(file.fieldname) ? 'screenshots' : ['icon', 'publisherLogo'].includes(file.fieldname) ? 'icons' : 'installers'
  return `/uploads/${folder}/${file.filename}`
}

function localUploadPath(publicPath) {
  if (typeof publicPath !== 'string' || !publicPath.startsWith('/uploads/')) return null
  const resolved = path.resolve(uploadsRoot, publicPath.slice('/uploads/'.length))
  return resolved.startsWith(`${uploadsRoot}${path.sep}`) ? resolved : null
}

const permissionDetails = {
  network: ['Network access', 'Connects to the internet or local network.'], notifications: ['Notifications', 'Can show system notifications and reminders.'], files: ['Files & folders', 'Can open, create, or change files you choose.'], camera: ['Camera', 'Can capture photos or video when allowed.'], microphone: ['Microphone', 'Can capture audio when allowed.'], location: ['Location', 'Can request approximate or precise location.'], clipboard: ['Clipboard', 'Can read from or write to the clipboard.'], screen_capture: ['Screen capture', 'Can capture a screen, window, or display.'], accessibility: ['Accessibility control', 'Can request control of other apps or input.'], background: ['Runs in background', 'Can keep working when its window is closed.'],
}
function artifactLocalPath(publicPath) {
  const uploaded = localUploadPath(publicPath)
  if (uploaded) return uploaded
  if (typeof publicPath === 'string' && publicPath.startsWith('/downloads/')) {
    const resolved = path.resolve(path.join(root, 'public'), publicPath.slice(1))
    return resolved.startsWith(path.join(root, 'public') + path.sep) ? resolved : null
  }
  return null
}
async function digestFile(filePath) {
  const buffer = await fs.readFile(filePath)
  return { sha256: crypto.createHash('sha256').update(buffer).digest('hex'), size: buffer.length, sample: buffer.subarray(0, 1024 * 1024).toString('latin1').toLowerCase() }
}
async function scanBuild(app, release = null) {
  const version = release?.version ?? app.version
  const artifactUrl = app.delivery === 'web' ? app.webUrl ?? `web:${app.id}` : release?.downloadUrl ?? app.downloadUrl ?? `missing:${app.id}:${version}`
  const localPath = artifactLocalPath(artifactUrl)
  const source = app.delivery === 'web' ? 'web' : localPath ? (artifactUrl.startsWith('/uploads/') ? 'hosted' : 'catalog') : 'external'
  let sha256 = null, fileSize = null, scanStatus = 'not_applicable', integrityStatus = 'not_applicable', findings = [], fileName = release?.uploadedFileName ?? app.uploadedFileName ?? (typeof artifactUrl === 'string' ? decodeURIComponent(artifactUrl.split('/').pop() || '') : null)
  if (localPath) {
    try {
      const digest = await digestFile(localPath)
      sha256 = digest.sha256; fileSize = digest.size; scanStatus = 'passed'; integrityStatus = 'verified'
      const risky = [{ code: 'encoded_powershell', pattern: 'powershell -enc', title: 'Encoded PowerShell command' }, { code: 'destructive_shell', pattern: 'rm -rf /', title: 'Destructive shell command' }, { code: 'credential_access', pattern: '/etc/shadow', title: 'Credential file reference' }]
      findings = risky.filter((rule) => digest.sample.includes(rule.pattern)).map((rule) => ({ severity: 'warning', code: rule.code, title: rule.title, detail: 'A focused string check found a pattern that should be reviewed manually.' }))
      if (findings.length) scanStatus = 'warning'
      const previous = database.get('SELECT sha256 FROM security_reports WHERE app_id = ? AND version = ? AND artifact_url = ?', app.id, version, artifactUrl)
      if (previous?.sha256 && previous.sha256 !== sha256) integrityStatus = 'changed'
    } catch (error) {
      scanStatus = 'unavailable'; integrityStatus = 'unavailable'; findings = [{ severity: 'warning', code: 'file_unavailable', title: 'File unavailable', detail: 'The local build could not be read during validation.' }]
    }
  } else if (source === 'external') {
    sha256 = release?.providedChecksum ?? app.providedChecksum ?? null
    scanStatus = 'not_scanned'; integrityStatus = sha256 ? 'publisher_provided' : 'unavailable'
    if (!sha256) findings = [{ severity: 'warning', code: 'checksum_missing', title: 'Publisher checksum missing', detail: 'External builds should include a Publisher-provided SHA-256 checksum.' }]
  }
  const now = new Date().toISOString()
  const existing = database.get('SELECT id FROM security_reports WHERE app_id = ? AND version = ? AND artifact_url = ?', app.id, version, artifactUrl)
  const id = existing?.id ?? crypto.randomUUID()
  database.run(`INSERT INTO security_reports(id, app_id, version, release_id, artifact_url, source, file_name, sha256, file_size, scan_status, integrity_status, signature_status, scanner, scanner_version, findings, scanned_at, verified_at)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(app_id, version, artifact_url) DO UPDATE SET release_id=excluded.release_id, source=excluded.source, file_name=excluded.file_name, sha256=excluded.sha256, file_size=excluded.file_size, scan_status=excluded.scan_status, integrity_status=excluded.integrity_status, signature_status=excluded.signature_status, findings=excluded.findings, scanned_at=excluded.scanned_at, verified_at=excluded.verified_at`,
    id, app.id, version, release?.id ?? null, artifactUrl, source, fileName || null, sha256, fileSize, scanStatus, integrityStatus, (release?.signature ?? app.signature) ? 'declared' : 'not_provided', 'local-validator', '1.0', JSON.stringify(findings), now, localPath ? now : null)
  return database.get('SELECT * FROM security_reports WHERE id = ?', id)
}
function securityProfile(app, report, release = null) {
  const permissions = release?.permissions ?? app.permissions ?? []
  const signature = release?.signature ?? app.signature ?? null
  const badges = []
  if (report.scan_status === 'passed') badges.push({ id: 'local_scan', label: 'Local checks passed', tone: 'green' })
  if (report.sha256) badges.push({ id: 'checksum', label: 'SHA-256 published', tone: 'violet' })
  if (report.integrity_status === 'verified') badges.push({ id: 'integrity', label: 'Integrity verified', tone: 'green' })
  if (signature) badges.push({ id: 'signature', label: 'Signature declared', tone: 'blue' })
  if (permissions.length) badges.push({ id: 'permissions', label: `${permissions.length} permissions declared`, tone: 'neutral' })
  return {
    reportId: report.id, appId: app.id, appName: app.name, version: report.version, releaseId: report.release_id ?? undefined,
    source: report.source, fileName: report.file_name, fileSize: report.file_size, sha256: report.sha256,
    scanStatus: report.scan_status, integrityStatus: report.integrity_status, hasChecksum: Boolean(report.sha256), signatureStatus: signature ? 'declared' : 'not_provided', permissionCount: permissions.length, badges,
    scanner: report.scanner, scannerVersion: report.scanner_version, findings: JSON.parse(report.findings || '[]'), scannedAt: report.scanned_at, verifiedAt: report.verified_at,
    signature, permissions, permissionDetails: permissions.map((id) => ({ id, label: permissionDetails[id]?.[0] ?? id, description: permissionDetails[id]?.[1] ?? '' })),
    canVerify: ['hosted', 'catalog'].includes(report.source), disclosure: report.source === 'external' ? 'Local does not fetch or scan this external build. The checksum is Publisher-provided.' : report.source === 'web' ? 'Web apps have no installer to scan.' : 'Local computes SHA-256 and runs focused file checks. This is not a complete antivirus guarantee.',
  }
}
async function securityForApp(app, version = app.version) {
  const release = (app.releases ?? []).find((item) => item.version === version) ?? (app.pendingRelease?.version === version ? app.pendingRelease : null)
  let report = database.get('SELECT * FROM security_reports WHERE app_id = ? AND version = ? ORDER BY scanned_at DESC LIMIT 1', app.id, version)
  if (!report) report = await scanBuild(app, release)
  return securityProfile(app, report, release)
}

async function removeLocalFile(publicPath) {
  const resolved = localUploadPath(publicPath)
  if (!resolved) return
  try { await fs.unlink(resolved) } catch (error) { if (error?.code !== 'ENOENT') console.error(`Could not remove ${resolved}:`, error) }
}

function removeNewUploads(files) {
  const allFiles = [...(files?.appFile ?? []), ...(files?.releaseFile ?? []), ...(files?.icon ?? []), ...(files?.screenshots ?? []), ...(files?.publisherLogo ?? []), ...(files?.publisherCover ?? [])]
  return Promise.all(allFiles.map((file) => fs.unlink(file.path).catch(() => undefined)))
}

function collectAssetPaths(value, result = new Set()) {
  if (!value || typeof value !== 'object') return result
  for (const [key, item] of Object.entries(value)) {
    if (['downloadUrl', 'iconImage'].includes(key) && typeof item === 'string' && item.startsWith('/uploads/')) result.add(item)
    else if (key === 'screenshots' && Array.isArray(item)) item.filter((pathValue) => typeof pathValue === 'string' && pathValue.startsWith('/uploads/')).forEach((pathValue) => result.add(pathValue))
    else if (typeof item === 'object') collectAssetPaths(item, result)
  }
  return result
}

async function cleanupRemovedAssets(previous, next) {
  const previousPaths = collectAssetPaths(previous)
  const retainedPaths = collectAssetPaths(next)
  await Promise.all([...previousPaths].filter((item) => !retainedPaths.has(item)).map(removeLocalFile))
}

function validateListing(app, screenshotCount, hasNewInstaller) {
  const errors = []
  if (!app || typeof app !== 'object') errors.push('The listing details are missing.')
  else {
    if (!/^[a-z0-9][a-z0-9-]{0,100}$/.test(app.id ?? '')) errors.push('The app ID is invalid.')
    if (!app.name?.trim()) errors.push('The app name is required.')
    if (!app.tagline?.trim()) errors.push('The tagline is required.')
    if (!app.description?.trim()) errors.push('The description is required.')
    if (!Array.isArray(app.platforms) || app.platforms.length === 0) errors.push('Choose at least one platform.')
    if (app.delivery === 'web' && !app.webUrl?.trim()) errors.push('A web app URL is required.')
    if (app.delivery === 'download' && !app.downloadUrl?.trim() && !hasNewInstaller) errors.push('Upload an app file or add its URL.')
    if (app.delivery === 'download' && /^https?:\/\//.test(app.downloadUrl ?? '') && !/^[a-fA-F0-9]{64}$/.test(String(app.providedChecksum ?? '').replace(/\s/g, ''))) errors.push('External downloads require a 64-character SHA-256 checksum.')
    if (app.signature && (!app.signature.signer?.trim() || !['authenticode', 'apple_developer_id', 'android', 'gpg', 'other'].includes(app.signature.type))) errors.push('Complete the signature metadata or remove it.')
    if (!Array.isArray(app.permissions) || app.permissions.some((id) => !permissionDetails[id])) errors.push('Choose valid permission declarations.')
  }
  if (screenshotCount < 3 || screenshotCount > 10) errors.push('Add between 3 and 10 screenshots.')
  return errors
}

function canManageApp(user, app) {
  return user?.role === 'admin' || (user?.role === 'publisher' && app?.ownerId === user.id)
}

function reviewEntry(action, note, admin) {
  return { id: crypto.randomUUID(), action, note: note ?? '', adminId: admin.id, adminName: admin.displayName, date: new Date().toISOString() }
}

const liveClients = new Map()
function emitEvent(type, data = {}, userIds = null) {
  const payload = `data: ${JSON.stringify({ type, data })}\n\n`
  for (const [response, client] of liveClients) {
    if (userIds && !userIds.includes(client.userId)) continue
    response.write(payload)
  }
}
function readNotifications() { return database.readDocument('notifications', []) }
function writeNotifications(items) { database.writeDocument('notifications', items) }
function createNotification(userId, { title, body, kind = 'system', priority = 'normal', href = '/' }) {
  if (!userId) return null
  const notification = { id: crypto.randomUUID(), userId, title, body, kind, priority, href, createdAt: new Date().toISOString(), readAt: null }
  writeNotifications([notification, ...readNotifications()].slice(0, 2000))
  emitEvent('notification.created', { notification }, [userId])
  return notification
}
async function notifyAdmins(notification) {
  const users = await readJson(usersFile)
  users.filter((user) => user.role === 'admin' && user.status === 'approved').forEach((user) => createNotification(user.id, notification))
}
function slugify(value) { return String(value).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) }
function optionalHttpUrl(value) {
  const input = String(value ?? '').trim(); if (!input) return ''
  try { const parsed = new URL(input); if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(); return parsed.toString() }
  catch { const error = new Error('Publisher links must use a valid http or https address.'); error.status = 400; throw error }
}
function safeMetadata(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value).slice(0, 20).map(([key, item]) => [String(key).slice(0, 60), typeof item === 'string' ? item.slice(0, 240) : typeof item === 'number' || typeof item === 'boolean' ? item : String(item).slice(0, 240)]))
}
function tokenHash(value) { return crypto.createHash('sha256').update(value).digest('hex') }
function issueAuthToken(user, type, lifetimeMs) {
  const raw = crypto.randomBytes(32).toString('base64url')
  const now = new Date().toISOString()
  database.run('UPDATE auth_tokens SET used_at = ? WHERE user_id = ? AND type = ? AND used_at IS NULL', now, user.id, type)
  database.run('INSERT INTO auth_tokens(id, user_id, type, token_hash, expires_at, used_at, created_at) VALUES(?, ?, ?, ?, ?, NULL, ?)', crypto.randomUUID(), user.id, type, tokenHash(raw), new Date(Date.now() + lifetimeMs).toISOString(), now)
  const actionPath = type === 'verify_email' ? `/verify-email?token=${encodeURIComponent(raw)}` : `/reset-password?token=${encodeURIComponent(raw)}`
  database.run('INSERT INTO email_outbox(id, recipient, subject, text_body, action_url, kind, status, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?)', crypto.randomUUID(), user.email, type === 'verify_email' ? 'Verify your Local email' : 'Reset your Local password', type === 'verify_email' ? 'Verify your email to activate account features.' : 'Use this one-time link to reset your password.', actionPath, type, 'preview', now)
  return actionPath
}
function consumeAuthToken(raw, type) {
  const row = database.get('SELECT * FROM auth_tokens WHERE token_hash = ? AND type = ? AND used_at IS NULL', tokenHash(String(raw ?? '')), type)
  if (!row || new Date(row.expires_at).getTime() <= Date.now()) return null
  database.run('UPDATE auth_tokens SET used_at = ? WHERE id = ?', new Date().toISOString(), row.id)
  return row
}

function applyRelease(app, release) {
  const previousReleases = app.releases?.length ? app.releases : [{
    id: crypto.randomUUID(), version: app.version, date: app.updated,
    notes: app.whatsNew?.length ? app.whatsNew : ['Initial store release'], size: app.size,
    downloadUrl: app.delivery === 'download' ? app.downloadUrl : undefined,
    uploadedFileName: app.uploadedFileName, channel: 'stable', status: 'published', rolloutPercentage: 100,
    permissions: app.permissions ?? [], signature: app.signature, providedChecksum: app.providedChecksum,
  }]
  const publishedBase = app.publishedSnapshot ?? toPublished(app)
  const releases = [release, ...previousReleases.filter((item) => item.id !== release.id)]
  const activatesStable = (release.channel ?? 'stable') === 'stable' && release.status !== 'scheduled'
  const releaseFields = activatesStable ? {
    version: release.version, updated: release.date, size: release.size,
    downloadUrl: app.delivery === 'download' ? release.downloadUrl : undefined,
    uploadedFileName: release.uploadedFileName, whatsNew: release.notes, permissions: release.permissions ?? [], signature: release.signature, providedChecksum: release.providedChecksum,
    releases, isNew: false,
  } : { releases }
  return {
    ...app, ...releaseFields,
    publishedSnapshot: { ...publishedBase, ...releaseFields },
    pendingRelease: undefined, releaseSubmissionStatus: undefined,
    releaseReviewNote: '', releaseSubmittedAt: undefined,
  }
}

const app = express()
app.disable('x-powered-by')
app.use((request, response, next) => {
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.setHeader('X-Frame-Options', 'SAMEORIGIN')
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && request.headers.origin) {
    try {
      const originHost = new URL(request.headers.origin).host
      const requestHosts = [request.headers.host, request.headers['x-forwarded-host']].filter(Boolean).flatMap((value) => String(value).split(',').map((item) => item.trim()))
      if (!requestHosts.includes(originHost)) { response.status(403).json({ error: 'Cross-origin state changes are not allowed.' }); return }
    } catch { response.status(403).json({ error: 'The request origin is invalid.' }); return }
  }
  next()
})
app.use('/uploads', express.static(uploadsRoot, {
  fallthrough: false, maxAge: isProduction ? '7d' : 0,
  setHeaders(response, filePath) { if (filePath.startsWith(installersRoot)) response.setHeader('Content-Disposition', 'attachment') },
}))
app.use(express.json({ limit: '1mb' }))
app.use('/api', resolveAuth)

app.get('/api/health', (_request, response) => response.json({ ok: true, storage: dataRoot, database: database.databasePath }))

app.get('/api/events', (request, response) => {
  response.setHeader('Content-Type', 'text/event-stream')
  response.setHeader('Cache-Control', 'no-cache, no-transform')
  response.setHeader('Connection', 'keep-alive')
  response.flushHeaders()
  const client = { userId: request.user?.id ?? null }
  liveClients.set(response, client)
  response.write(`data: ${JSON.stringify({ type: 'connected', data: {} })}\n\n`)
  const heartbeat = setInterval(() => response.write(': heartbeat\n\n'), 25_000)
  request.on('close', () => { clearInterval(heartbeat); liveClients.delete(response) })
})

// Authentication
app.get('/api/auth/me', (request, response) => response.json({ user: publicUser(request.user) }))

app.post('/api/auth/signup', async (request, response, next) => {
  try {
    const { username = '', email = '', displayName = '', password = '', requestedRole = 'member' } = request.body ?? {}
    const normalizedUsername = username.trim().toLowerCase()
    const normalizedEmail = email.trim().toLowerCase()
    if (!/^[a-z0-9_.-]{3,30}$/.test(normalizedUsername)) { response.status(400).json({ error: 'Username must be 3–30 characters using letters, numbers, dots, dashes, or underscores.' }); return }
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) { response.status(400).json({ error: 'Enter a valid email address.' }); return }
    if (displayName.trim().length < 2) { response.status(400).json({ error: 'Enter your display name.' }); return }
    if (password.length < 8) { response.status(400).json({ error: 'Password must be at least 8 characters.' }); return }
    if (!['member', 'publisher'].includes(requestedRole)) { response.status(400).json({ error: 'Choose a valid account type.' }); return }
    const users = await readJson(usersFile)
    if (users.some((user) => user.username.toLowerCase() === normalizedUsername)) { response.status(409).json({ error: 'That username is already taken.' }); return }
    if (users.some((user) => user.email.toLowerCase() === normalizedEmail)) { response.status(409).json({ error: 'That email is already registered.' }); return }
    const user = {
      id: crypto.randomUUID(), username: normalizedUsername, email: normalizedEmail,
      displayName: displayName.trim(), passwordHash: hashPassword(password), requestedRole,
      role: requestedRole, status: 'pending', reviewNote: '', createdAt: new Date().toISOString(),
      reviewedAt: null, emailVerified: false, emailVerifiedAt: null, isBootstrapAdmin: false,
      publisherProfile: { headline: '', about: '', accent: 'violet', logoImage: '', coverImage: '', websiteUrl: '', supportUrl: '', documentationUrl: '', supportEmail: '' },
      publisherVerified: false, publisherVerifiedAt: null, publisherVerifiedBy: null, publisherVerificationNote: '',
      notificationPreferences: normalizePreferences(),
    }
    users.push(user)
    await writeJson(usersFile, users)
    const previewUrl = issueAuthToken(user, 'verify_email', 24 * 60 * 60 * 1000)
    await notifyAdmins({ title: 'New account request', body: `${user.displayName} requested ${requestedRole} access.`, kind: 'account_review', priority: 'important', href: '/admin/users' })
    emitEvent('admin.users.changed', { userId: user.id })
    response.status(201).json({ user: publicUser(user), previewUrl, message: 'Account created. Verify your email while an administrator reviews it.' })
  } catch (error) { next(error) }
})

app.post('/api/auth/login', async (request, response, next) => {
  try {
    const identifier = String(request.body?.identifier ?? '').trim().toLowerCase()
    const password = String(request.body?.password ?? '')
    const users = await readJson(usersFile)
    const user = users.find((item) => item.username.toLowerCase() === identifier || item.email.toLowerCase() === identifier)
    if (!user || !verifyPassword(password, user.passwordHash)) { response.status(401).json({ error: 'The username/email or password is incorrect.' }); return }
    const token = crypto.randomBytes(32).toString('hex')
    const sessions = (await readJson(sessionsFile)).filter((session) => new Date(session.expiresAt).getTime() > Date.now())
    sessions.push({ token, userId: user.id, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + sessionLifetime).toISOString() })
    await writeJson(sessionsFile, sessions)
    response.setHeader('Set-Cookie', sessionCookie(request, token))
    response.json({ user: publicUser(user) })
  } catch (error) { next(error) }
})

app.post('/api/auth/logout', async (request, response, next) => {
  try {
    const token = parseCookies(request).local_store_session
    if (token) await writeJson(sessionsFile, (await readJson(sessionsFile)).filter((session) => session.token !== token))
    response.setHeader('Set-Cookie', sessionCookie(request, '', 0))
    response.status(204).end()
  } catch (error) { next(error) }
})

app.post('/api/auth/verify-email', async (request, response, next) => {
  try {
    const token = consumeAuthToken(request.body?.token, 'verify_email')
    if (!token) { response.status(400).json({ error: 'This verification link is invalid, expired, or already used.' }); return }
    const users = await readJson(usersFile)
    const target = users.find((user) => user.id === token.user_id)
    if (!target) { response.status(404).json({ error: 'That account no longer exists.' }); return }
    const now = new Date().toISOString()
    await writeJson(usersFile, users.map((user) => user.id === target.id ? { ...user, emailVerified: true, emailVerifiedAt: now } : user))
    database.appendAudit({ actorId: target.id, actorName: target.displayName, action: 'email.verified', targetType: 'user', targetId: target.id, summary: 'Email address verified' })
    emitEvent('account.changed', { userId: target.id }, [target.id])
    response.json({ ok: true })
  } catch (error) { next(error) }
})

app.post('/api/auth/resend-verification', requireSignedIn, async (request, response, next) => {
  try {
    if (request.user.emailVerified) { response.json({ message: 'Your email is already verified.' }); return }
    response.json({ previewUrl: issueAuthToken(request.user, 'verify_email', 24 * 60 * 60 * 1000) })
  } catch (error) { next(error) }
})

app.post('/api/auth/forgot-password', async (request, response, next) => {
  try {
    const identifier = String(request.body?.identifier ?? '').trim().toLowerCase()
    const users = await readJson(usersFile)
    const user = users.find((item) => item.username.toLowerCase() === identifier || item.email.toLowerCase() === identifier)
    const previewUrl = user ? issueAuthToken(user, 'reset_password', 60 * 60 * 1000) : undefined
    response.json({ message: 'If that account exists, a reset link is ready.', ...(previewUrl ? { previewUrl } : {}) })
  } catch (error) { next(error) }
})

app.post('/api/auth/reset-password', async (request, response, next) => {
  try {
    const password = String(request.body?.password ?? '')
    if (password.length < 8) { response.status(400).json({ error: 'Password must be at least 8 characters.' }); return }
    const token = consumeAuthToken(request.body?.token, 'reset_password')
    if (!token) { response.status(400).json({ error: 'This reset link is invalid, expired, or already used.' }); return }
    const users = await readJson(usersFile)
    const target = users.find((user) => user.id === token.user_id)
    if (!target) { response.status(404).json({ error: 'That account no longer exists.' }); return }
    await writeJson(usersFile, users.map((user) => user.id === target.id ? { ...user, passwordHash: hashPassword(password) } : user))
    await writeJson(sessionsFile, (await readJson(sessionsFile)).filter((session) => session.userId !== target.id))
    database.appendAudit({ actorId: target.id, actorName: target.displayName, action: 'password.reset', targetType: 'user', targetId: target.id, summary: 'Password reset and sessions revoked' })
    emitEvent('account.changed', { userId: target.id }, [target.id])
    response.json({ ok: true })
  } catch (error) { next(error) }
})

app.patch('/api/auth/notification-preferences', requireSignedIn, async (request, response, next) => {
  try {
    const users = await readJson(usersFile)
    const preferences = normalizePreferences({ ...request.user.notificationPreferences, ...request.body })
    preferences.soundVolume = Math.max(0, Math.min(1, Number(preferences.soundVolume) || 0))
    if (!['important', 'all'].includes(preferences.soundScope)) preferences.soundScope = 'important'
    const updated = { ...request.user, notificationPreferences: preferences }
    await writeJson(usersFile, users.map((user) => user.id === updated.id ? updated : user))
    response.json({ user: publicUser(updated) })
  } catch (error) { next(error) }
})

app.patch('/api/auth/profile', requireApproved, async (request, response, next) => {
  try {
    const displayName = String(request.body?.displayName ?? '').trim()
    if (displayName.length < 2) { response.status(400).json({ error: 'Enter your display name.' }); return }
    const users = await readJson(usersFile)
    const nextUsers = users.map((user) => user.id === request.user.id ? { ...user, displayName } : user)
    await writeJson(usersFile, nextUsers)
    response.json({ user: publicUser(nextUsers.find((user) => user.id === request.user.id)) })
  } catch (error) { next(error) }
})

// Notifications
app.get('/api/notifications', requireSignedIn, (request, response) => response.json(readNotifications().filter((item) => item.userId === request.user.id).slice(0, 100)))
app.patch('/api/notifications/:id', requireSignedIn, (request, response) => {
  const notifications = readNotifications()
  const target = notifications.find((item) => item.id === request.params.id && item.userId === request.user.id)
  if (!target) { response.status(404).json({ error: 'That notification was not found.' }); return }
  const updated = { ...target, readAt: request.body?.read === false ? null : target.readAt ?? new Date().toISOString() }
  writeNotifications(notifications.map((item) => item.id === target.id ? updated : item))
  response.json(updated)
})
app.post('/api/notifications/read-all', requireSignedIn, (request, response) => {
  const now = new Date().toISOString()
  writeNotifications(readNotifications().map((item) => item.userId === request.user.id && !item.readAt ? { ...item, readAt: now } : item))
  response.status(204).end()
})
app.delete('/api/notifications/read', requireSignedIn, (request, response) => {
  writeNotifications(readNotifications().filter((item) => item.userId !== request.user.id || !item.readAt))
  response.status(204).end()
})

// Public and managed catalogs
app.get('/api/apps', async (request, response, next) => {
  try { response.json(await getPublicCatalog(request.user?.id ?? request.ip ?? 'guest')) } catch (error) { next(error) }
})

app.get('/api/manage/apps', requirePublisher, async (request, response, next) => {
  try {
    const catalog = await getInternalCatalog()
    response.json(request.user.role === 'admin' ? catalog : catalog.filter((item) => item.ownerId === request.user.id))
  } catch (error) { next(error) }
})

app.get('/api/manage/apps/:id', requirePublisher, async (request, response, next) => {
  try {
    const listing = await getInternalApp(request.params.id)
    if (!listing || !canManageApp(request.user, listing)) { response.status(404).json({ error: 'That managed listing was not found.' }); return }
    response.json(listing)
  } catch (error) { next(error) }
})

app.post('/api/apps', requirePublisher, upload.fields([
  { name: 'appFile', maxCount: 1 }, { name: 'icon', maxCount: 1 }, { name: 'screenshots', maxCount: 10 },
]), async (request, response, next) => {
  const files = request.files ?? {}
  try {
    let listing
    try { listing = JSON.parse(request.body.listing) } catch {
      await removeNewUploads(files); response.status(400).json({ error: 'The listing details could not be read.' }); return
    }
    const existing = await getInternalApp(listing.id)
    if (existing && !canManageApp(request.user, existing)) { await removeNewUploads(files); response.status(403).json({ error: 'You cannot edit this listing.' }); return }
    const uploadedScreenshots = files.screenshots ?? []
    const oversizedImage = uploadedScreenshots.find((file) => file.size > 15 * 1024 * 1024)
    const uploadedIcon = files.icon?.[0]
    if (oversizedImage || (uploadedIcon && uploadedIcon.size > 5 * 1024 * 1024)) {
      await removeNewUploads(files); response.status(400).json({ error: `${(oversizedImage ?? uploadedIcon).originalname} is too large.` }); return
    }
    const existingScreenshots = Array.isArray(listing.screenshots) ? listing.screenshots.filter((item) => typeof item === 'string' && item.trim()) : []
    const errors = validateListing(listing, existingScreenshots.length + uploadedScreenshots.length, Boolean(files.appFile?.[0]))
    if (errors.length) { await removeNewUploads(files); response.status(400).json({ error: errors.join(' ') }); return }

    const newInstaller = files.appFile?.[0]
    const now = new Date().toISOString()
    const cleanListing = toPublished(listing)
    const nextScreenshots = [...existingScreenshots, ...uploadedScreenshots.map(uploadedPath)]
    const base = {
      ...cleanListing,
      downloadUrl: cleanListing.delivery === 'download' ? (newInstaller ? uploadedPath(newInstaller) : cleanListing.downloadUrl) : undefined,
      webUrl: cleanListing.delivery === 'web' ? cleanListing.webUrl : undefined,
      screenshots: nextScreenshots,
      iconImage: uploadedIcon ? uploadedPath(uploadedIcon) : cleanListing.iconImage,
      uploadedFileName: cleanListing.delivery === 'download' ? (newInstaller?.originalname ?? cleanListing.uploadedFileName) : undefined,
      isCustom: true,
      ownerId: existing?.ownerId ?? request.user.id,
      ownerName: existing?.ownerName ?? request.user.displayName,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      releases: existing?.releases ?? cleanListing.releases ?? [],
      pendingRelease: existing?.pendingRelease,
      releaseSubmissionStatus: existing?.releaseSubmissionStatus,
      releaseReviewNote: existing?.releaseReviewNote,
      reviewHistory: existing?.reviewHistory ?? [],
    }
    const nextListing = request.user.role === 'admin'
      ? { ...base, submissionStatus: 'approved', reviewNote: '', publishedSnapshot: toPublished(base), reviewedAt: now, reviewedBy: request.user.displayName }
      : {
          ...base,
          submissionStatus: 'draft',
          reviewNote: existing?.reviewNote ?? '',
          publishedSnapshot: existing?.publishedSnapshot ?? ((existing?.submissionStatus ?? 'approved') === 'approved' && existing ? toPublished(existing) : undefined),
        }
    await upsertOverride(nextListing)
    if (existing) await cleanupRemovedAssets(existing, nextListing)
    await scanBuild(nextListing).catch((error) => console.error('Security scan failed:', error))
    database.appendAudit({ actorId: request.user.id, actorName: request.user.displayName, action: existing ? 'listing.updated' : 'listing.created', targetType: 'app', targetId: nextListing.id, summary: `${nextListing.name} ${existing ? 'updated' : 'created'}` })
    emitEvent(request.user.role === 'admin' ? 'catalog.changed' : 'managed.changed', { appId: nextListing.id })
    emitEvent('security.changed', { appId: nextListing.id })
    response.status(existing ? 200 : 201).json(nextListing)
  } catch (error) { await removeNewUploads(files); next(error) }
})

app.post('/api/apps/:id/submit', requirePublisher, async (request, response, next) => {
  try {
    const listing = await getInternalApp(request.params.id)
    if (!listing || request.user.role === 'admin' || listing.ownerId !== request.user.id) { response.status(404).json({ error: 'That draft was not found.' }); return }
    if (!['draft', 'changes_requested', 'declined'].includes(listing.submissionStatus)) { response.status(409).json({ error: 'This listing has already been submitted.' }); return }
    const nextListing = { ...listing, submissionStatus: 'pending', submittedAt: new Date().toISOString(), reviewNote: listing.reviewNote ?? '' }
    await upsertOverride(nextListing)
    await notifyAdmins({ title: 'Listing ready for review', body: `${request.user.displayName} submitted ${listing.name}.`, kind: 'listing_review', priority: 'important', href: '/admin/reviews' })
    database.appendAudit({ actorId: request.user.id, actorName: request.user.displayName, action: 'listing.submitted', targetType: 'app', targetId: listing.id, summary: `${listing.name} submitted for review` })
    emitEvent('managed.changed', { appId: listing.id })
    response.json(nextListing)
  } catch (error) { next(error) }
})

// Version and update submissions
app.post('/api/apps/:id/releases', requirePublisher, upload.single('releaseFile'), async (request, response, next) => {
  try {
    const current = await getInternalApp(request.params.id)
    if (!current || !canManageApp(request.user, current)) { if (request.file) await fs.unlink(request.file.path).catch(() => undefined); response.status(404).json({ error: 'That app no longer exists.' }); return }
    let input
    try { input = JSON.parse(request.body.release) } catch { if (request.file) await fs.unlink(request.file.path).catch(() => undefined); response.status(400).json({ error: 'The update details could not be read.' }); return }
    const notes = Array.isArray(input.notes) ? input.notes.map((note) => String(note).trim()).filter(Boolean) : []
    if (!input.version?.trim() || notes.length === 0) { if (request.file) await fs.unlink(request.file.path).catch(() => undefined); response.status(400).json({ error: 'A version and at least one release note are required.' }); return }
    if ((current.releases ?? []).some((release) => release.version === input.version.trim())) { if (request.file) await fs.unlink(request.file.path).catch(() => undefined); response.status(409).json({ error: `Version ${input.version.trim()} already exists.` }); return }
    if (current.delivery === 'download' && !request.file && !input.downloadUrl?.trim()) { response.status(400).json({ error: 'Upload the new app file or add its download URL.' }); return }
    if (current.delivery === 'download' && !request.file && !/^[a-fA-F0-9]{64}$/.test(String(input.providedChecksum ?? '').replace(/\s/g, ''))) { response.status(400).json({ error: 'External downloads require a 64-character SHA-256 checksum.' }); return }
    const date = /^\d{4}-\d{2}-\d{2}$/.test(input.date ?? '') ? input.date : new Date().toISOString().slice(0, 10)
    const release = {
      id: crypto.randomUUID(), version: input.version.trim(), date, notes,
      channel: ['stable', 'beta', 'preview'].includes(input.channel) ? input.channel : 'stable',
      status: input.scheduledAt && new Date(input.scheduledAt).getTime() > Date.now() ? 'scheduled' : Number(input.rolloutPercentage) < 100 ? 'rolling' : 'published',
      rolloutPercentage: Math.max(5, Math.min(100, Number(input.rolloutPercentage) || 100)),
      scheduledAt: input.scheduledAt || undefined, scheduleTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      permissions: Array.isArray(input.permissions) ? input.permissions.filter((id) => permissionDetails[id]) : [],
      signature: input.signature?.type && input.signature?.signer ? input.signature : undefined,
      providedChecksum: String(input.providedChecksum ?? '').replace(/\s/g, '').toLowerCase() || undefined,
      previousVersion: current.version, previousSize: current.size, previousDownloadUrl: current.downloadUrl, previousUploadedFileName: current.uploadedFileName, previousWhatsNew: current.whatsNew, previousUpdated: current.updated, previousPermissions: current.permissions ?? [], previousSignature: current.signature, previousProvidedChecksum: current.providedChecksum,
      size: current.delivery === 'download' ? (input.size?.trim() || current.size) : 'Web app',
      downloadUrl: current.delivery === 'download' ? (request.file ? uploadedPath(request.file) : input.downloadUrl.trim()) : undefined,
      uploadedFileName: request.file?.originalname,
    }
    let nextListing
    if (request.user.role === 'admin') {
      nextListing = { ...applyRelease(current, release), releaseReviewNote: '', releaseReviewedAt: new Date().toISOString() }
    } else {
      if (!current.publishedSnapshot && current.submissionStatus !== 'approved') { if (request.file) await fs.unlink(request.file.path).catch(() => undefined); response.status(409).json({ error: 'The app must be approved before you can submit an update.' }); return }
      nextListing = { ...current, pendingRelease: release, releaseSubmissionStatus: 'pending', releaseReviewNote: '', releaseSubmittedAt: new Date().toISOString() }
      if (current.pendingRelease?.downloadUrl !== release.downloadUrl) await removeLocalFile(current.pendingRelease?.downloadUrl)
    }
    await upsertOverride(nextListing)
    await scanBuild(nextListing, release).catch((error) => console.error('Release scan failed:', error))
    if (request.user.role === 'admin') {
      const subscribers = database.all('SELECT user_id FROM app_subscriptions WHERE app_id = ?', current.id)
      subscribers.forEach(({ user_id }) => createNotification(user_id, { title: `${current.name} ${release.version} is available`, body: `${release.channel === 'stable' ? 'Stable' : release.channel === 'beta' ? 'Beta' : 'Preview'} release: ${release.notes[0]}`, kind: 'release', priority: release.channel === 'stable' ? 'important' : 'normal', href: `/app/${current.id}#release-channels` }))
      emitEvent('catalog.changed', { appId: current.id })
    } else {
      await notifyAdmins({ title: 'Update ready for review', body: `${request.user.displayName} submitted ${current.name} ${release.version}.`, kind: 'update_review', priority: 'important', href: '/admin/reviews' })
      emitEvent('managed.changed', { appId: current.id })
    }
    emitEvent('security.changed', { appId: current.id })
    database.appendAudit({ actorId: request.user.id, actorName: request.user.displayName, action: 'release.submitted', targetType: 'app', targetId: current.id, summary: `${current.name} ${release.version} submitted`, details: { channel: release.channel, rolloutPercentage: release.rolloutPercentage } })
    response.status(201).json(nextListing)
  } catch (error) { if (request.file) await fs.unlink(request.file.path).catch(() => undefined); next(error) }
})

app.post('/api/apps/:id/releases/:releaseId/rollback', requireAdmin, async (request, response, next) => {
  try {
    const listing = await getInternalApp(request.params.id); const release = listing?.releases?.find((item) => item.id === request.params.releaseId)
    if (!listing || !release || (release.channel ?? 'stable') !== 'stable' || !release.previousVersion) { response.status(404).json({ error: 'That stable release cannot be rolled back.' }); return }
    if (listing.version !== release.version) { response.status(409).json({ error: 'Only the currently active stable release can be rolled back.' }); return }
    const reason = String(request.body?.reason ?? '').trim(); if (reason.length < 5) { response.status(400).json({ error: 'Add a rollback reason.' }); return }
    const releases = listing.releases.map((item) => item.id === release.id ? { ...item, status: 'rolled_back', rolledBackAt: new Date().toISOString(), rollbackReason: reason } : item)
    const rollbackFields = { version: release.previousVersion, size: release.previousSize ?? listing.size, downloadUrl: release.previousDownloadUrl, uploadedFileName: release.previousUploadedFileName, whatsNew: release.previousWhatsNew ?? listing.whatsNew, updated: release.previousUpdated ?? new Date().toISOString().slice(0, 10), permissions: release.previousPermissions ?? [], signature: release.previousSignature, providedChecksum: release.previousProvidedChecksum, releases }
    const nextListing = { ...listing, ...rollbackFields, publishedSnapshot: { ...(listing.publishedSnapshot ?? toPublished(listing)), ...rollbackFields } }
    await upsertOverride(nextListing); const subscribers = database.all('SELECT user_id FROM app_subscriptions WHERE app_id = ?', listing.id); subscribers.forEach(({ user_id }) => createNotification(user_id, { title: `${listing.name} returned to ${release.previousVersion}`, body: reason, kind: 'release', priority: 'important', href: `/app/${listing.id}#release-channels` })); database.appendAudit({ actorId: request.user.id, actorName: request.user.displayName, action: 'release.rolled_back', targetType: 'app', targetId: listing.id, summary: `${listing.name} rolled back from ${release.version} to ${release.previousVersion}`, details: { reason } }); emitEvent('catalog.changed', { appId: listing.id }); response.json(nextListing)
  } catch (error) { next(error) }
})

app.delete('/api/apps/:id/releases/:releaseId', requirePublisher, async (request, response, next) => {
  try {
    const listing = await getInternalApp(request.params.id)
    if (!listing || !canManageApp(request.user, listing)) { response.status(404).json({ error: 'That update no longer exists.' }); return }
    const release = listing.releases?.find((item) => item.id === request.params.releaseId)
    if (!release) { response.status(404).json({ error: 'That update no longer exists.' }); return }
    if (listing.releases?.[0]?.id === release.id) { response.status(409).json({ error: 'Publish a newer update before removing the current version.' }); return }
    const nextListing = { ...listing, releases: listing.releases.filter((item) => item.id !== release.id) }
    if (nextListing.publishedSnapshot) nextListing.publishedSnapshot = { ...nextListing.publishedSnapshot, releases: nextListing.releases }
    await upsertOverride(nextListing)
    await removeLocalFile(release.downloadUrl)
    response.status(204).end()
  } catch (error) { next(error) }
})

app.delete('/api/apps/:id', requirePublisher, async (request, response, next) => {
  try {
    const listing = await getInternalApp(request.params.id)
    if (!listing || !canManageApp(request.user, listing)) { response.status(404).json({ error: 'That listing no longer exists.' }); return }
    if (request.user.role !== 'admin' && (listing.publishedSnapshot || listing.submissionStatus === 'approved')) { response.status(403).json({ error: 'Only an administrator can remove a published app.' }); return }
    const overrides = await readJson(overridesFile)
    if (!overrides.some((item) => item.id === request.params.id)) { response.status(403).json({ error: 'Starter catalog apps cannot be deleted. Unpublish them instead.' }); return }
    await writeJson(overridesFile, overrides.filter((item) => item.id !== request.params.id))
    await Promise.all([...collectAssetPaths(listing)].map(removeLocalFile))
    response.status(204).end()
  } catch (error) { next(error) }
})

// Privacy-conscious aggregate analytics
app.post('/api/analytics', async (request, response, next) => {
  try {
    const eventType = String(request.body?.eventType ?? '')
    if (!['view', 'download', 'web_open', 'favorite', 'search'].includes(eventType)) { response.status(400).json({ error: 'Unsupported analytics event.' }); return }
    const appId = request.body?.appId ? String(request.body.appId) : null
    if (appId && !(await getPublicCatalog()).some((item) => item.id === appId)) { response.status(404).json({ error: 'That app was not found.' }); return }
    const rotation = Math.floor(Date.now() / (30 * 86_400_000))
    const anonymousId = crypto.createHash('sha256').update(`${process.env.ANALYTICS_SALT || 'local-store'}:${rotation}:${request.ip}:${request.headers['user-agent'] ?? ''}`).digest('hex').slice(0, 32)
    const metadata = safeMetadata(request.body?.metadata)
    for (const key of Object.keys(metadata)) if (key !== 'queryLength' && /query|search|email|name|token|password/i.test(key)) delete metadata[key]
    database.run('INSERT INTO analytics_events(id, event_type, app_id, anonymous_id, user_id, platform, metadata, occurred_at) VALUES(?, ?, ?, ?, NULL, ?, ?, ?)', crypto.randomUUID(), eventType, appId, anonymousId, String(request.body?.platform ?? 'Unknown').slice(0, 80), JSON.stringify(metadata), new Date().toISOString())
    if (request.user?.status === 'approved' && request.user.emailVerified && appId && ['download', 'web_open'].includes(eventType)) {
      const now = new Date().toISOString()
      database.run(`INSERT INTO verified_app_usage(user_id, app_id, action_type, first_used_at, last_used_at) VALUES(?, ?, ?, ?, ?)
        ON CONFLICT(user_id, app_id) DO UPDATE SET action_type=excluded.action_type, last_used_at=excluded.last_used_at`, request.user.id, appId, eventType, now, now)
      emitEvent('review_eligibility.changed', { appId, userId: request.user.id }, [request.user.id])
    }
    emitEvent('analytics.changed', { appId })
    response.status(202).json({ accepted: true })
  } catch (error) { next(error) }
})

app.get('/api/analytics/summary', requirePublisher, async (request, response, next) => {
  try {
    const days = [7, 30, 90].includes(Number(request.query.days)) ? Number(request.query.days) : 30
    const allApps = await getInternalCatalog()
    const allowedApps = request.user.role === 'admin' ? allApps : allApps.filter((item) => item.ownerId === request.user.id)
    const ids = new Set(allowedApps.map((item) => item.id))
    const periodStart = new Date(Date.now() - days * 86_400_000).toISOString()
    const previousStart = new Date(Date.now() - days * 2 * 86_400_000).toISOString()
    const rows = database.all('SELECT * FROM analytics_events WHERE occurred_at >= ?', previousStart).filter((row) => !row.app_id || ids.has(row.app_id))
    const current = rows.filter((row) => row.occurred_at >= periodStart)
    const previous = rows.filter((row) => row.occurred_at < periodStart)
    const summarize = (events) => {
      const views = events.filter((row) => row.event_type === 'view').length
      const actions = events.filter((row) => ['download', 'web_open'].includes(row.event_type)).length
      const visitors = new Set(events.map((row) => row.anonymous_id).filter(Boolean)).size
      const favorites = events.filter((row) => row.event_type === 'favorite').length
      return { views, actions, visitors, favorites, conversion: views ? Math.round(actions / views * 1000) / 10 : 0, actionsPerVisitor: visitors ? Math.round(actions / visitors * 100) / 100 : 0 }
    }
    const totals = summarize(current)
    const previousTotals = summarize(previous)
    const dailyMap = new Map()
    current.forEach((row) => { const date = row.occurred_at.slice(0, 10); const item = dailyMap.get(date) ?? { date, views: 0, actions: 0, visitorIds: new Set() }; if (row.event_type === 'view') item.views++; if (['download', 'web_open'].includes(row.event_type)) item.actions++; if (row.anonymous_id) item.visitorIds.add(row.anonymous_id); dailyMap.set(date, item) })
    const daily = [...dailyMap.values()].map((item) => ({ date: item.date, views: item.views, actions: item.actions, visitors: item.visitorIds.size })).sort((a, b) => a.date.localeCompare(b.date))
    const apps = allowedApps.map((item) => { const events = current.filter((row) => row.app_id === item.id); const summary = summarize(events); return { id: item.id, name: item.name, category: item.category, version: item.version, views: summary.views, actions: summary.actions, visitors: summary.visitors, conversion: summary.conversion } }).filter((item) => item.views || item.actions).sort((a, b) => b.actions - a.actions || b.views - a.views)
    const actions = current.filter((row) => ['download', 'web_open'].includes(row.event_type))
    const platformCounts = new Map(); actions.forEach((row) => platformCounts.set(row.platform || 'Unknown', (platformCounts.get(row.platform || 'Unknown') ?? 0) + 1))
    const platforms = [...platformCounts].map(([name, count]) => ({ name, count, percentage: actions.length ? Math.round(count / actions.length * 1000) / 10 : 0 })).sort((a, b) => b.count - a.count)
    const releaseCounts = new Map(); actions.forEach((row) => { const meta = JSON.parse(row.metadata || '{}'); const appItem = allowedApps.find((item) => item.id === row.app_id); if (!appItem) return; const version = String(meta.version ?? appItem.version); const key = `${appItem.id}:${version}`; const value = releaseCounts.get(key) ?? { appId: appItem.id, appName: appItem.name, version, actions: 0 }; value.actions++; releaseCounts.set(key, value) })
    const releases = [...releaseCounts.values()].map((item) => ({ ...item, percentage: actions.length ? Math.round(item.actions / actions.length * 1000) / 10 : 0 })).sort((a, b) => b.actions - a.actions)
    const currentVisitors = new Set(current.map((row) => row.anonymous_id).filter(Boolean)); const previousVisitors = new Set(previous.map((row) => row.anonymous_id).filter(Boolean)); const returningVisitors = [...currentVisitors].filter((id) => previousVisitors.has(id)).length
    const eventCounts = new Map(); current.forEach((row) => eventCounts.set(row.event_type, (eventCounts.get(row.event_type) ?? 0) + 1))
    response.json({ days, generatedAt: new Date().toISOString(), totals, previousTotals, retention: { returningVisitors, rate: currentVisitors.size ? Math.round(returningVisitors / currentVisitors.size * 1000) / 10 : 0 }, daily, apps, platforms, releases, eventBreakdown: [...eventCounts].map(([type, count]) => ({ type, count })), privacy: { retentionDays: Number(process.env.ANALYTICS_RETENTION_DAYS || 90), anonymous: true, storesAccountIds: false, storesIpAddresses: false, storesRawUserAgent: false } })
  } catch (error) { next(error) }
})

app.post('/api/apps/:id/use', requireApproved, async (request, response, next) => {
  try { const listing = await getInternalApp(request.params.id); if (!listing) { response.status(404).json({ error: 'That app was not found.' }); return } const now = new Date().toISOString(); const action = listing.delivery === 'web' ? 'web_open' : 'download'; database.run(`INSERT INTO verified_app_usage(user_id, app_id, action_type, first_used_at, last_used_at) VALUES(?, ?, ?, ?, ?) ON CONFLICT(user_id, app_id) DO UPDATE SET action_type=excluded.action_type, last_used_at=excluded.last_used_at`, request.user.id, listing.id, action, now, now); emitEvent('review_eligibility.changed', { appId: listing.id, userId: request.user.id }, [request.user.id]); response.status(204).end() } catch (error) { next(error) }
})

// Release subscriptions
app.get('/api/apps/:id/subscription', async (request, response) => {
  const count = Number(database.get('SELECT COUNT(*) AS count FROM app_subscriptions WHERE app_id = ?', request.params.id)?.count ?? 0)
  const subscribed = request.user ? Boolean(database.get('SELECT 1 AS value FROM app_subscriptions WHERE user_id = ? AND app_id = ?', request.user.id, request.params.id)) : false
  response.json({ subscribed, subscriberCount: count })
})
app.post('/api/apps/:id/subscription', requireApproved, async (request, response, next) => {
  try {
    const listing = await getInternalApp(request.params.id)
    if (!listing) { response.status(404).json({ error: 'That app was not found.' }); return }
    if (request.body?.subscribed === false) database.run('DELETE FROM app_subscriptions WHERE user_id = ? AND app_id = ?', request.user.id, listing.id)
    else database.run('INSERT OR IGNORE INTO app_subscriptions(user_id, app_id, created_at) VALUES(?, ?, ?)', request.user.id, listing.id, new Date().toISOString())
    const count = Number(database.get('SELECT COUNT(*) AS count FROM app_subscriptions WHERE app_id = ?', listing.id)?.count ?? 0)
    const subscribed = Boolean(database.get('SELECT 1 AS value FROM app_subscriptions WHERE user_id = ? AND app_id = ?', request.user.id, listing.id))
    emitEvent('subscriptions.changed', { appId: listing.id })
    response.json({ subscribed, subscriberCount: count })
  } catch (error) { next(error) }
})

// Build provenance and integrity
app.get('/api/apps/:id/security', async (request, response, next) => {
  try { const listing = await getInternalApp(request.params.id); if (!listing || !effectivePublicApp(listing) && listing.source !== 'catalog') { response.status(404).json({ error: 'That app was not found.' }); return } response.json(await securityForApp(listing, String(request.query.version || listing.version))) } catch (error) { next(error) }
})
app.post('/api/apps/:id/security/verify', async (request, response, next) => {
  try {
    const listing = await getInternalApp(request.params.id); if (!listing) { response.status(404).json({ error: 'That app was not found.' }); return }
    const version = String(request.body?.version || listing.version); const release = (listing.releases ?? []).find((item) => item.version === version) ?? null
    const previous = database.get('SELECT * FROM security_reports WHERE app_id = ? AND version = ? ORDER BY scanned_at DESC LIMIT 1', listing.id, version)
    const report = await scanBuild(listing, release)
    const profile = securityProfile(listing, report, release)
    emitEvent('security.changed', { appId: listing.id })
    response.status(previous?.sha256 && report.sha256 && previous.sha256 !== report.sha256 ? 409 : 200).json(profile)
  } catch (error) { next(error) }
})

// Verified-use reviews and moderation
function publicReview(row, viewerId) {
  const helpfulUsers = JSON.parse(row.helpful_users || '[]')
  return { id: row.id, appId: row.app_id, userName: row.user_name, isOwn: row.user_id === viewerId, rating: row.rating, title: row.title, body: row.body, status: row.status, helpfulCount: row.helpful_count, helpfulByViewer: helpfulUsers.includes(viewerId), publisherReply: row.publisher_reply, publisherRepliedAt: row.publisher_replied_at, createdAt: row.created_at, updatedAt: row.updated_at }
}
async function reviewEligibility(request, appId) {
  const listing = await getInternalApp(appId)
  const existingRow = request.user ? database.get('SELECT * FROM reviews WHERE app_id = ? AND user_id = ?', appId, request.user.id) : null
  const canRespond = Boolean(request.user && listing && canManageApp(request.user, listing))
  if (!request.user) return { canReview: false, hasVerifiedUse: false, reason: 'sign_in', existingReview: null, canRespond }
  const existingReview = existingRow ? publicReview(existingRow, request.user.id) : null
  if (request.user.status !== 'approved' || !request.user.emailVerified) return { canReview: false, hasVerifiedUse: false, reason: 'approval_required', existingReview, canRespond }
  if (listing?.ownerId === request.user.id) return { canReview: false, hasVerifiedUse: false, reason: 'owner', existingReview, canRespond }
  if (existingRow?.status === 'hidden') return { canReview: false, hasVerifiedUse: true, reason: 'moderated', existingReview, canRespond }
  const hasVerifiedUse = Boolean(database.get('SELECT 1 AS value FROM verified_app_usage WHERE user_id = ? AND app_id = ?', request.user.id, appId))
  return { canReview: hasVerifiedUse, hasVerifiedUse, reason: hasVerifiedUse ? 'eligible' : 'use_required', existingReview, canRespond }
}
app.get('/api/apps/:id/reviews', async (request, response, next) => {
  try {
    const listing = await getInternalApp(request.params.id); if (!listing) { response.status(404).json({ error: 'That app was not found.' }); return }
    const order = request.query.sort === 'newest' ? 'created_at DESC' : 'helpful_count DESC, created_at DESC'
    const rows = database.all(`SELECT * FROM reviews WHERE app_id = ? AND (status = 'published' OR user_id = ?) ORDER BY ${order}`, listing.id, request.user?.id ?? '')
    const published = rows.filter((row) => row.status === 'published')
    const breakdown = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 }; published.forEach((row) => breakdown[String(row.rating)]++)
    const total = published.length; const average = total ? Math.round(published.reduce((sum, row) => sum + row.rating, 0) / total * 10) / 10 : 0
    response.json({ summary: { average, total, breakdown }, reviews: rows.map((row) => publicReview(row, request.user?.id)), eligibility: await reviewEligibility(request, listing.id) })
  } catch (error) { next(error) }
})
app.post('/api/apps/:id/reviews', requireApproved, async (request, response, next) => {
  try {
    const listing = await getInternalApp(request.params.id); if (!listing) { response.status(404).json({ error: 'That app was not found.' }); return }
    const eligibility = await reviewEligibility(request, listing.id)
    if (!eligibility.canReview) { response.status(403).json({ error: eligibility.reason === 'use_required' ? 'Download or open this app before reviewing it.' : 'You cannot review this app.' }); return }
    const rating = Number(request.body?.rating); const title = String(request.body?.title ?? '').trim(); const body = String(request.body?.body ?? '').trim()
    if (!Number.isInteger(rating) || rating < 1 || rating > 5 || title.length < 2 || body.length < 10) { response.status(400).json({ error: 'Choose 1–5 stars and add a useful title and review.' }); return }
    const existing = database.get('SELECT * FROM reviews WHERE app_id = ? AND user_id = ?', listing.id, request.user.id); const now = new Date().toISOString(); const id = existing?.id ?? crypto.randomUUID()
    database.run(`INSERT INTO reviews(id, app_id, user_id, user_name, rating, title, body, status, helpful_count, helpful_users, publisher_reply, publisher_replied_at, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, 'published', 0, '[]', NULL, NULL, ?, ?)
      ON CONFLICT(app_id, user_id) DO UPDATE SET user_name=excluded.user_name, rating=excluded.rating, title=excluded.title, body=excluded.body, updated_at=excluded.updated_at`, id, listing.id, request.user.id, request.user.displayName, rating, title.slice(0, 120), body.slice(0, 2000), existing?.created_at ?? now, now)
    const row = database.get('SELECT * FROM reviews WHERE id = ?', id)
    if (listing.ownerId && listing.ownerId !== request.user.id) createNotification(listing.ownerId, { title: `New review for ${listing.name}`, body: `${request.user.displayName} left a ${rating}-star review.`, kind: 'customer_review', href: `/app/${listing.id}#reviews` })
    emitEvent('reviews.changed', { appId: listing.id }); emitEvent('catalog.changed', { appId: listing.id })
    response.status(existing ? 200 : 201).json(publicReview(row, request.user.id))
  } catch (error) { next(error) }
})
app.delete('/api/reviews/:id', requireApproved, (request, response) => {
  const review = database.get('SELECT * FROM reviews WHERE id = ?', request.params.id)
  if (!review || (review.user_id !== request.user.id && request.user.role !== 'admin')) { response.status(404).json({ error: 'That review was not found.' }); return }
  database.run('DELETE FROM reviews WHERE id = ?', review.id); emitEvent('reviews.changed', { appId: review.app_id }); emitEvent('catalog.changed', { appId: review.app_id }); response.status(204).end()
})
app.post('/api/reviews/:id/helpful', requireApproved, (request, response) => {
  const review = database.get("SELECT * FROM reviews WHERE id = ? AND status = 'published'", request.params.id)
  if (!review) { response.status(404).json({ error: 'That review was not found.' }); return }
  const users = new Set(JSON.parse(review.helpful_users || '[]')); if (users.has(request.user.id)) users.delete(request.user.id); else users.add(request.user.id)
  database.run('UPDATE reviews SET helpful_users = ?, helpful_count = ?, updated_at = ? WHERE id = ?', JSON.stringify([...users]), users.size, new Date().toISOString(), review.id)
  emitEvent('reviews.changed', { appId: review.app_id }); response.json({ helpfulCount: users.size, helpfulByViewer: users.has(request.user.id) })
})
app.post('/api/reviews/:id/reports', requireApproved, async (request, response, next) => {
  try {
    const review = database.get("SELECT * FROM reviews WHERE id = ? AND status = 'published'", request.params.id); if (!review) { response.status(404).json({ error: 'That review was not found.' }); return }
    if (review.user_id === request.user.id) { response.status(400).json({ error: 'You cannot report your own review.' }); return }
    const reason = String(request.body?.reason ?? 'other'); const details = String(request.body?.details ?? '').trim()
    if (!['spam', 'abuse', 'conflict', 'other'].includes(reason)) { response.status(400).json({ error: 'Choose a valid report reason.' }); return }
    database.run('INSERT INTO review_reports(id, review_id, app_id, reporter_id, reporter_name, reason, details, status, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)', crypto.randomUUID(), review.id, review.app_id, request.user.id, request.user.displayName, reason, details.slice(0, 1000), 'open', new Date().toISOString())
    await notifyAdmins({ title: 'Review report needs attention', body: `${request.user.displayName} reported a review.`, kind: 'review_report', priority: 'important', href: '/admin/reviews#community-reports' })
    emitEvent('review_reports.changed', { appId: review.app_id }); response.status(201).json({ reported: true })
  } catch (error) { if (String(error.message).includes('UNIQUE')) response.status(409).json({ error: 'You already reported this review.' }); else next(error) }
})
app.put('/api/reviews/:id/reply', requirePublisher, async (request, response, next) => {
  try {
    const review = database.get('SELECT * FROM reviews WHERE id = ?', request.params.id); const listing = review ? await getInternalApp(review.app_id) : null
    if (!review || !listing || !canManageApp(request.user, listing)) { response.status(404).json({ error: 'That review was not found.' }); return }
    const reply = String(request.body?.reply ?? '').trim(); if (reply.length === 1) { response.status(400).json({ error: 'Write a longer reply or remove it completely.' }); return }
    const now = new Date().toISOString(); database.run('UPDATE reviews SET publisher_reply = ?, publisher_replied_at = ?, updated_at = ? WHERE id = ?', reply ? reply.slice(0, 1500) : null, reply ? now : null, now, review.id)
    if (reply) createNotification(review.user_id, { title: `${listing.name} replied to your review`, body: reply.slice(0, 180), kind: 'review_reply', href: `/app/${listing.id}#reviews` })
    emitEvent('reviews.changed', { appId: listing.id }); response.json(publicReview(database.get('SELECT * FROM reviews WHERE id = ?', review.id), request.user.id))
  } catch (error) { next(error) }
})
app.get('/api/admin/review-reports', requireAdmin, async (request, response, next) => {
  try {
    const status = ['open', 'resolved', 'dismissed'].includes(String(request.query.status)) ? String(request.query.status) : 'open'; const apps = await getInternalCatalog()
    response.json(database.all('SELECT rr.*, r.user_name, r.rating, r.title, r.body, r.status AS review_status, r.created_at AS review_created_at FROM review_reports rr JOIN reviews r ON r.id = rr.review_id WHERE rr.status = ? ORDER BY rr.created_at DESC', status).map((row) => ({ id: row.id, reviewId: row.review_id, appId: row.app_id, appName: apps.find((item) => item.id === row.app_id)?.name ?? row.app_id, reporterName: row.reporter_name, reason: row.reason, details: row.details, status: row.status, resolutionNote: row.resolution_note ?? '', createdAt: row.created_at, resolvedAt: row.resolved_at, resolvedBy: row.resolved_by, review: { userName: row.user_name, rating: row.rating, title: row.title, body: row.body, status: row.review_status, createdAt: row.review_created_at } })))
  } catch (error) { next(error) }
})
app.post('/api/admin/reviews/:id/moderate', requireAdmin, (request, response) => {
  const review = database.get('SELECT * FROM reviews WHERE id = ?', request.params.id); if (!review) { response.status(404).json({ error: 'That review was not found.' }); return }
  const action = String(request.body?.action ?? ''); const note = String(request.body?.note ?? '').trim(); const now = new Date().toISOString()
  if (action === 'hide') { if (note.length < 5) { response.status(400).json({ error: 'Add a reason for the reviewer.' }); return } database.run("UPDATE reviews SET status = 'hidden', updated_at = ? WHERE id = ?", now, review.id); database.run("UPDATE review_reports SET status = 'resolved', resolution_note = ?, resolved_at = ?, resolved_by = ? WHERE review_id = ? AND status = 'open'", note, now, request.user.displayName, review.id); createNotification(review.user_id, { title: 'Your review was hidden', body: note, kind: 'review_moderation', priority: 'important', href: `/app/${review.app_id}#reviews` }) }
  else if (action === 'restore') { database.run("UPDATE reviews SET status = 'published', updated_at = ? WHERE id = ?", now, review.id) }
  else if (action === 'dismiss') { database.run("UPDATE review_reports SET status = 'dismissed', resolution_note = ?, resolved_at = ?, resolved_by = ? WHERE review_id = ? AND status = 'open'", note || 'No violation found.', now, request.user.displayName, review.id) }
  else { response.status(400).json({ error: 'Choose a valid moderation action.' }); return }
  database.appendAudit({ actorId: request.user.id, actorName: request.user.displayName, action: `review.${action}`, targetType: 'review', targetId: review.id, summary: `Review ${action}` })
  emitEvent('reviews.changed', { appId: review.app_id }); emitEvent('review_reports.changed', { appId: review.app_id }); emitEvent('catalog.changed', { appId: review.app_id }); response.json({ ok: true })
})

// Publisher identity and following
async function publisherProfile(user, viewer) {
  const apps = (await getInternalCatalog()).filter((item) => item.ownerId === user.id && (item.submissionStatus ?? 'approved') === 'approved')
  const followerCount = Number(database.get('SELECT COUNT(*) AS count FROM publisher_follows WHERE publisher_id = ?', user.id)?.count ?? 0)
  const releaseSubscriberCount = apps.reduce((sum, item) => sum + Number(database.get('SELECT COUNT(*) AS count FROM app_subscriptions WHERE app_id = ?', item.id)?.count ?? 0), 0)
  return { username: user.username, name: user.displayName, ...user.publisherProfile, verified: Boolean(user.publisherVerified), verifiedAt: user.publisherVerifiedAt ?? null, joinedAt: user.createdAt, followerCount, releaseSubscriberCount, publishedAppCount: apps.length, followedByViewer: Boolean(viewer && database.get('SELECT 1 AS value FROM publisher_follows WHERE user_id = ? AND publisher_id = ?', viewer.id, user.id)), isOwn: viewer?.id === user.id }
}
app.get('/api/publishers/:username', async (request, response, next) => {
  try { const users = await readJson(usersFile); const publisher = users.find((user) => user.username === String(request.params.username).toLowerCase() && user.role === 'publisher' && user.status === 'approved'); if (!publisher) { response.status(404).json({ error: 'That Publisher page was not found.' }); return } response.json(await publisherProfile(publisher, request.user)) } catch (error) { next(error) }
})
app.post('/api/publishers/:username/follow', requireApproved, async (request, response, next) => {
  try {
    const users = await readJson(usersFile); const publisher = users.find((user) => user.username === String(request.params.username).toLowerCase() && user.role === 'publisher' && user.status === 'approved')
    if (!publisher) { response.status(404).json({ error: 'That Publisher was not found.' }); return } if (publisher.id === request.user.id) { response.status(400).json({ error: 'You already own this Publisher page.' }); return }
    if (request.body?.following === false) database.run('DELETE FROM publisher_follows WHERE user_id = ? AND publisher_id = ?', request.user.id, publisher.id)
    else database.run('INSERT OR IGNORE INTO publisher_follows(user_id, publisher_id, created_at) VALUES(?, ?, ?)', request.user.id, publisher.id, new Date().toISOString())
    const followerCount = Number(database.get('SELECT COUNT(*) AS count FROM publisher_follows WHERE publisher_id = ?', publisher.id)?.count ?? 0); const following = Boolean(database.get('SELECT 1 AS value FROM publisher_follows WHERE user_id = ? AND publisher_id = ?', request.user.id, publisher.id))
    emitEvent('publisher.follow.changed', { username: publisher.username }); response.json({ following, followerCount })
  } catch (error) { next(error) }
})
app.get('/api/publisher/profile', requirePublisher, async (request, response, next) => { try { response.json(await publisherProfile(request.user, request.user)) } catch (error) { next(error) } })
app.patch('/api/publisher/profile', requirePublisher, upload.fields([{ name: 'publisherLogo', maxCount: 1 }, { name: 'publisherCover', maxCount: 1 }]), async (request, response, next) => {
  const files = request.files ?? {}
  try {
    let input; try { input = JSON.parse(request.body.profile ?? '{}') } catch { await removeNewUploads(files); response.status(400).json({ error: 'The Publisher profile could not be read.' }); return }
    const name = String(input.name ?? '').trim(); const headline = String(input.headline ?? '').trim(); if (name.length < 2 || headline.length < 2) { await removeNewUploads(files); response.status(400).json({ error: 'Add a Publisher name and headline.' }); return }
    const logo = files.publisherLogo?.[0]; const cover = files.publisherCover?.[0]; if ((logo && logo.size > 5 * 1024 * 1024) || (cover && cover.size > 15 * 1024 * 1024)) { await removeNewUploads(files); response.status(400).json({ error: 'A selected image is too large.' }); return }
    const supportEmail = String(input.supportEmail ?? '').trim(); if (supportEmail && !/^\S+@\S+\.\S+$/.test(supportEmail)) { await removeNewUploads(files); response.status(400).json({ error: 'Enter a valid public support email.' }); return }
    const current = request.user.publisherProfile ?? {}; const profile = { headline: headline.slice(0, 140), about: String(input.about ?? '').trim().slice(0, 1200), accent: ['violet','plum','green','coral','blue','pink','amber','teal'].includes(input.accent) ? input.accent : 'violet', logoImage: input.removeLogo ? '' : logo ? uploadedPath(logo) : current.logoImage ?? '', coverImage: input.removeCover ? '' : cover ? uploadedPath(cover) : current.coverImage ?? '', websiteUrl: optionalHttpUrl(input.websiteUrl), supportUrl: optionalHttpUrl(input.supportUrl), documentationUrl: optionalHttpUrl(input.documentationUrl), supportEmail }
    const users = await readJson(usersFile); const updated = { ...request.user, displayName: name.slice(0, 80), publisherProfile: profile }; await writeJson(usersFile, users.map((user) => user.id === updated.id ? updated : user))
    if ((input.removeLogo || logo) && current.logoImage && current.logoImage !== profile.logoImage) await removeLocalFile(current.logoImage); if ((input.removeCover || cover) && current.coverImage && current.coverImage !== profile.coverImage) await removeLocalFile(current.coverImage)
    database.appendAudit({ actorId: updated.id, actorName: updated.displayName, action: 'publisher.profile.updated', targetType: 'publisher', targetId: updated.id, summary: 'Publisher profile updated' }); emitEvent('publisher.changed', { username: updated.username }); emitEvent('account.changed', { userId: updated.id }, [updated.id]); response.json(await publisherProfile(updated, updated))
  } catch (error) { await removeNewUploads(files); next(error) }
})
app.post('/api/admin/users/:id/publisher-verification', requireAdmin, async (request, response, next) => {
  try {
    const users = await readJson(usersFile); const target = users.find((user) => user.id === request.params.id && user.role === 'publisher'); if (!target) { response.status(404).json({ error: 'That Publisher was not found.' }); return }
    const verified = Boolean(request.body?.verified); const now = new Date().toISOString(); const updated = { ...target, publisherVerified: verified, publisherVerifiedAt: verified ? now : null, publisherVerifiedBy: verified ? request.user.displayName : null, publisherVerificationNote: String(request.body?.note ?? '').trim() }
    await writeJson(usersFile, users.map((user) => user.id === updated.id ? updated : user)); createNotification(updated.id, { title: verified ? 'Publisher identity verified' : 'Publisher verification removed', body: updated.publisherVerificationNote || (verified ? 'Your public Publisher page now carries a verified badge.' : 'Your verification badge was removed by an Administrator.'), kind: 'publisher_verification', priority: 'important', href: `/publisher/${updated.username}` }); database.appendAudit({ actorId: request.user.id, actorName: request.user.displayName, action: verified ? 'publisher.verified' : 'publisher.unverified', targetType: 'publisher', targetId: updated.id, summary: `${updated.displayName} verification ${verified ? 'granted' : 'removed'}` }); emitEvent('publisher.changed', { username: updated.username }); response.json(publicUser(updated))
  } catch (error) { next(error) }
})

// Discovery and editorial shelves
function collectionFromRow(row) { return { id: row.id, title: row.title, description: row.description, accent: row.accent, published: Boolean(row.published), appIds: database.all('SELECT app_id FROM collection_apps WHERE collection_id = ? ORDER BY position', row.id).map((item) => item.app_id), createdAt: row.created_at, updatedAt: row.updated_at } }
app.get('/api/discovery', async (request, response, next) => {
  try {
    const cutoff = new Date(Date.now() - 14 * 86_400_000).toISOString(); const events = database.all("SELECT app_id, event_type FROM analytics_events WHERE occurred_at >= ? AND app_id IS NOT NULL", cutoff); const scores = new Map(); events.forEach((row) => scores.set(row.app_id, (scores.get(row.app_id) ?? 0) + (row.event_type === 'view' ? 1 : ['download','web_open','favorite'].includes(row.event_type) ? 3 : 0)))
    const catalog = await getPublicCatalog(request.user?.id ?? request.ip ?? 'guest'); const trending = catalog.map((item) => ({ appId: item.id, score: scores.get(item.id) ?? 0, signal: item.isNew ? 'new' : (scores.get(item.id) ?? 0) > 4 ? 'rising' : (scores.get(item.id) ?? 0) > 0 ? 'popular' : 'steady' })).sort((a, b) => b.score - a.score).map((item, index) => ({ appId: item.appId, rank: index + 1, signal: item.signal })).slice(0, 12)
    const collections = database.all('SELECT * FROM editorial_collections WHERE published = 1 ORDER BY updated_at DESC').map(collectionFromRow); const users = await readJson(usersFile); const followedIds = request.user ? database.all('SELECT publisher_id FROM publisher_follows WHERE user_id = ?', request.user.id).map((item) => item.publisher_id) : []; const followedPublishers = followedIds.map((id) => users.find((user) => user.id === id)?.username).filter(Boolean)
    response.json({ generatedAt: new Date().toISOString(), trending, collections, followedPublishers, privacy: { browsingHistoryStoredOnServer: false, personalizationScope: 'Recent views and category interests stay in this browser.' } })
  } catch (error) { next(error) }
})
app.get('/api/admin/editorial/collections', requireAdmin, (_request, response) => response.json(database.all('SELECT * FROM editorial_collections ORDER BY updated_at DESC').map(collectionFromRow)))
app.post('/api/admin/editorial/collections', requireAdmin, (request, response) => {
  const title = String(request.body?.title ?? '').trim(); if (!title) { response.status(400).json({ error: 'Add a collection title.' }); return } const now = new Date().toISOString(); let id = slugify(request.body?.id || title) || crypto.randomUUID(); if (database.get('SELECT 1 AS value FROM editorial_collections WHERE id = ?', id)) id = `${id}-${crypto.randomBytes(2).toString('hex')}`
  database.transaction(() => { database.run('INSERT INTO editorial_collections(id, title, description, accent, published, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?)', id, title.slice(0, 120), String(request.body?.description ?? '').trim().slice(0, 1200), request.body?.accent ?? 'violet', request.body?.published ? 1 : 0, now, now); (Array.isArray(request.body?.appIds) ? request.body.appIds : []).forEach((appId, position) => database.run('INSERT INTO collection_apps(collection_id, app_id, position) VALUES(?, ?, ?)', id, String(appId), position)) }); database.appendAudit({ actorId: request.user.id, actorName: request.user.displayName, action: 'collection.created', targetType: 'collection', targetId: id, summary: `${title} collection created` }); emitEvent('discovery.changed', { collectionId: id }); response.status(201).json(collectionFromRow(database.get('SELECT * FROM editorial_collections WHERE id = ?', id)))
})
app.patch('/api/admin/editorial/collections/:id', requireAdmin, (request, response) => {
  const current = database.get('SELECT * FROM editorial_collections WHERE id = ?', request.params.id); if (!current) { response.status(404).json({ error: 'That collection was not found.' }); return } const title = String(request.body?.title ?? current.title).trim(); const now = new Date().toISOString()
  database.transaction(() => { database.run('UPDATE editorial_collections SET title = ?, description = ?, accent = ?, published = ?, updated_at = ? WHERE id = ?', title.slice(0, 120), String(request.body?.description ?? '').trim().slice(0, 1200), request.body?.accent ?? current.accent, request.body?.published ? 1 : 0, now, current.id); database.run('DELETE FROM collection_apps WHERE collection_id = ?', current.id); (Array.isArray(request.body?.appIds) ? request.body.appIds : []).forEach((appId, position) => database.run('INSERT INTO collection_apps(collection_id, app_id, position) VALUES(?, ?, ?)', current.id, String(appId), position)) }); database.appendAudit({ actorId: request.user.id, actorName: request.user.displayName, action: 'collection.updated', targetType: 'collection', targetId: current.id, summary: `${title} collection updated` }); emitEvent('discovery.changed', { collectionId: current.id }); response.json(collectionFromRow(database.get('SELECT * FROM editorial_collections WHERE id = ?', current.id)))
})
app.delete('/api/admin/editorial/collections/:id', requireAdmin, (request, response) => { const current = database.get('SELECT * FROM editorial_collections WHERE id = ?', request.params.id); if (!current) { response.status(404).json({ error: 'That collection was not found.' }); return } database.run('DELETE FROM editorial_collections WHERE id = ?', current.id); database.appendAudit({ actorId: request.user.id, actorName: request.user.displayName, action: 'collection.deleted', targetType: 'collection', targetId: current.id, summary: `${current.title} collection deleted` }); emitEvent('discovery.changed', { collectionId: current.id }); response.status(204).end() })

// Administrator user management
app.get('/api/admin/users', requireAdmin, async (_request, response, next) => {
  try { response.json((await readJson(usersFile)).map(publicUser)) } catch (error) { next(error) }
})

app.patch('/api/admin/users/:id', requireAdmin, async (request, response, next) => {
  try {
    const users = await readJson(usersFile)
    const target = users.find((user) => user.id === request.params.id)
    if (!target) { response.status(404).json({ error: 'That account no longer exists.' }); return }
    const { action, role, note = '' } = request.body ?? {}
    if (target.isBootstrapAdmin && ['decline', 'suspend', 'delete', 'change_role'].includes(action)) { response.status(403).json({ error: 'The bootstrap administrator is protected.' }); return }
    if (['decline', 'suspend'].includes(action) && !String(note).trim()) { response.status(400).json({ error: 'Add a reason for this decision.' }); return }
    if (action === 'delete') {
      await writeJson(usersFile, users.filter((user) => user.id !== target.id))
      await writeJson(sessionsFile, (await readJson(sessionsFile)).filter((session) => session.userId !== target.id))
      response.status(204).end(); return
    }
    let updated = target
    const now = new Date().toISOString()
    if (action === 'approve') updated = { ...target, status: 'approved', role: ['member', 'publisher', 'admin'].includes(role) ? role : target.requestedRole, reviewNote: String(note).trim(), reviewedAt: now }
    else if (action === 'decline') updated = { ...target, status: 'declined', reviewNote: String(note).trim(), reviewedAt: now }
    else if (action === 'suspend') updated = { ...target, status: 'suspended', reviewNote: String(note).trim(), reviewedAt: now }
    else if (action === 'reactivate') updated = { ...target, status: 'approved', reviewNote: String(note).trim(), reviewedAt: now }
    else if (action === 'change_role' && ['member', 'publisher', 'admin'].includes(role)) updated = { ...target, role, reviewNote: String(note).trim(), reviewedAt: now }
    else { response.status(400).json({ error: 'Choose a valid account action.' }); return }
    await writeJson(usersFile, users.map((user) => user.id === target.id ? updated : user))
    createNotification(updated.id, { title: `Account ${updated.status}`, body: updated.reviewNote || `Your Local account is now ${updated.status}.`, kind: 'account_status', priority: 'important', href: '/profile' })
    database.appendAudit({ actorId: request.user.id, actorName: request.user.displayName, action: `user.${action}`, targetType: 'user', targetId: updated.id, summary: `${updated.displayName}: ${action}`, details: { role: updated.role, note: updated.reviewNote } })
    emitEvent('admin.users.changed', { userId: updated.id }); emitEvent('account.changed', { userId: updated.id }, [updated.id])
    response.json(publicUser(updated))
  } catch (error) { next(error) }
})

// Administrator review and store controls
app.get('/api/admin/apps', requireAdmin, async (_request, response, next) => {
  try { response.json(await getInternalCatalog()) } catch (error) { next(error) }
})

app.post('/api/admin/apps/:id/review', requireAdmin, async (request, response, next) => {
  try {
    const listing = await getInternalApp(request.params.id)
    if (!listing?.isCustom) { response.status(404).json({ error: 'That submission was not found.' }); return }
    const { action, note = '' } = request.body ?? {}
    if (!['approve', 'request_changes', 'decline'].includes(action)) { response.status(400).json({ error: 'Choose a valid review decision.' }); return }
    if (action !== 'approve' && !String(note).trim()) { response.status(400).json({ error: 'Explain what the publisher needs to know.' }); return }
    const now = new Date().toISOString()
    let nextListing
    if (action === 'approve') {
      const approvedBase = { ...listing, submissionStatus: 'approved', reviewNote: String(note).trim(), reviewedAt: now, reviewedBy: request.user.displayName }
      nextListing = { ...approvedBase, publishedSnapshot: toPublished(approvedBase), reviewHistory: [...(listing.reviewHistory ?? []), reviewEntry(action, note, request.user)] }
    } else {
      nextListing = { ...listing, submissionStatus: action === 'request_changes' ? 'changes_requested' : 'declined', reviewNote: String(note).trim(), reviewedAt: now, reviewedBy: request.user.displayName, reviewHistory: [...(listing.reviewHistory ?? []), reviewEntry(action, note, request.user)] }
    }
    await upsertOverride(nextListing)
    if (action === 'approve') await cleanupRemovedAssets(listing, nextListing)
    createNotification(listing.ownerId, { title: action === 'approve' ? `${listing.name} was published` : `${listing.name} needs attention`, body: String(note).trim() || (action === 'approve' ? 'Your listing is now available on Local.' : 'Open Publisher studio to review the decision.'), kind: 'listing_decision', priority: 'important', href: action === 'approve' ? `/app/${listing.id}` : '/manage' })
    database.appendAudit({ actorId: request.user.id, actorName: request.user.displayName, action: `listing.${action}`, targetType: 'app', targetId: listing.id, summary: `${listing.name}: ${action}`, details: { note } })
    emitEvent('managed.changed', { appId: listing.id }); if (action === 'approve') emitEvent('catalog.changed', { appId: listing.id })
    response.json(nextListing)
  } catch (error) { next(error) }
})

app.post('/api/admin/apps/:id/release-review', requireAdmin, async (request, response, next) => {
  try {
    const listing = await getInternalApp(request.params.id)
    if (!listing?.pendingRelease) { response.status(404).json({ error: 'That update submission was not found.' }); return }
    const { action, note = '' } = request.body ?? {}
    if (!['approve', 'request_changes', 'decline'].includes(action)) { response.status(400).json({ error: 'Choose a valid review decision.' }); return }
    if (action !== 'approve' && !String(note).trim()) { response.status(400).json({ error: 'Explain what the publisher needs to know.' }); return }
    let nextListing
    if (action === 'approve') {
      nextListing = { ...applyRelease(listing, listing.pendingRelease), releaseReviewNote: String(note).trim(), releaseReviewedAt: new Date().toISOString(), releaseReviewedBy: request.user.displayName }
    } else {
      nextListing = { ...listing, releaseSubmissionStatus: action === 'request_changes' ? 'changes_requested' : 'declined', releaseReviewNote: String(note).trim(), releaseReviewedAt: new Date().toISOString(), releaseReviewedBy: request.user.displayName }
    }
    await upsertOverride(nextListing)
    createNotification(listing.ownerId, { title: action === 'approve' ? `${listing.name} ${listing.pendingRelease.version} approved` : `${listing.name} update needs attention`, body: String(note).trim() || (action === 'approve' ? 'The approved release is available on its selected channel.' : 'Open release management to review the decision.'), kind: 'update_decision', priority: 'important', href: `/manage/${listing.id}/updates` })
    if (action === 'approve') { const subscribers = database.all('SELECT user_id FROM app_subscriptions WHERE app_id = ?', listing.id); subscribers.forEach(({ user_id }) => createNotification(user_id, { title: `${listing.name} ${listing.pendingRelease.version} is available`, body: listing.pendingRelease.notes?.[0] ?? 'A new release is ready.', kind: 'release', priority: listing.pendingRelease.channel === 'stable' ? 'important' : 'normal', href: `/app/${listing.id}#release-channels` })) }
    database.appendAudit({ actorId: request.user.id, actorName: request.user.displayName, action: `release.${action}`, targetType: 'app', targetId: listing.id, summary: `${listing.name} ${listing.pendingRelease.version}: ${action}`, details: { note } })
    emitEvent('managed.changed', { appId: listing.id }); if (action === 'approve') emitEvent('catalog.changed', { appId: listing.id })
    response.json(nextListing)
  } catch (error) { next(error) }
})

app.post('/api/admin/apps/:id/unpublish', requireAdmin, async (request, response, next) => {
  try {
    const listing = await getInternalApp(request.params.id)
    if (!listing) { response.status(404).json({ error: 'That app was not found.' }); return }
    const nextListing = { ...listing, isCustom: true, submissionStatus: 'unpublished', publishedSnapshot: undefined, reviewNote: String(request.body?.note ?? '').trim() }
    await upsertOverride(nextListing)
    response.json(nextListing)
  } catch (error) { next(error) }
})

app.post('/api/admin/apps/:id/republish', requireAdmin, async (request, response, next) => {
  try {
    const listing = await getInternalApp(request.params.id)
    if (!listing) { response.status(404).json({ error: 'That app was not found.' }); return }
    const nextListing = { ...listing, isCustom: true, submissionStatus: 'approved', publishedSnapshot: toPublished(listing), reviewNote: '' }
    await upsertOverride(nextListing)
    response.json(nextListing)
  } catch (error) { next(error) }
})

// Administrator trust and recovery operations
async function securityAdminPayload() {
  const apps = await getInternalCatalog()
  for (const listing of apps) {
    if (!database.get('SELECT 1 AS value FROM security_reports WHERE app_id = ? AND version = ?', listing.id, listing.version)) await scanBuild(listing).catch(() => undefined)
  }
  const reports = database.all('SELECT * FROM security_reports ORDER BY scanned_at DESC').map((report) => {
    const listing = apps.find((item) => item.id === report.app_id); if (!listing) return null
    const release = (listing.releases ?? []).find((item) => item.version === report.version) ?? (listing.pendingRelease?.version === report.version ? listing.pendingRelease : null)
    return { ...securityProfile(listing, report, release), app: { id: listing.id, name: listing.name, icon: listing.icon, accent: listing.accent, iconImage: listing.iconImage }, ownerName: listing.ownerName ?? listing.developer, listingStatus: listing.submissionStatus ?? 'approved', publicBuild: Boolean(listing.source === 'catalog' || (listing.publishedSnapshot && listing.publishedSnapshot.version === report.version) || listing.version === report.version && listing.submissionStatus === 'approved') }
  }).filter(Boolean)
  return { generatedAt: new Date().toISOString(), scanner: { name: 'local-validator', version: '1.0', mode: 'focused local checks' }, totals: { builds: reports.length, passed: reports.filter((item) => item.scanStatus === 'passed').length, attention: reports.filter((item) => ['warning', 'blocked', 'unavailable'].includes(item.scanStatus) || item.integrityStatus === 'changed').length, external: reports.filter((item) => item.source === 'external').length }, reports }
}
app.get('/api/admin/security', requireAdmin, async (_request, response, next) => { try { response.json(await securityAdminPayload()) } catch (error) { next(error) } })
app.post('/api/admin/security/:id/rescan', requireAdmin, async (request, response, next) => {
  try { const old = database.get('SELECT * FROM security_reports WHERE id = ?', request.params.id); if (!old) { response.status(404).json({ error: 'That report was not found.' }); return } const listing = await getInternalApp(old.app_id); const release = (listing?.releases ?? []).find((item) => item.version === old.version) ?? (listing?.pendingRelease?.version === old.version ? listing.pendingRelease : null); const report = await scanBuild(listing, release); database.appendAudit({ actorId: request.user.id, actorName: request.user.displayName, action: 'security.rescanned', targetType: 'app', targetId: listing.id, summary: `${listing.name} ${old.version} re-scanned` }); emitEvent('security.changed', { appId: listing.id }); response.json(securityProfile(listing, report, release)) } catch (error) { next(error) }
})
app.post('/api/admin/security/rescan-all', requireAdmin, async (request, response, next) => {
  try { const apps = await getInternalCatalog(); for (const listing of apps) { await scanBuild(listing); for (const release of listing.releases ?? []) await scanBuild(listing, release) } database.appendAudit({ actorId: request.user.id, actorName: request.user.displayName, action: 'security.rescanned_all', targetType: 'system', summary: 'All builds re-scanned' }); emitEvent('security.changed', {}); response.json(await securityAdminPayload()) } catch (error) { next(error) }
})
app.get('/api/admin/system', requireAdmin, async (_request, response, next) => {
  try { const stat = await fs.stat(database.databasePath).catch(() => ({ size: 0 })); const backups = (await database.listBackups()).map((item) => ({ name: item.name, createdAt: item.createdAt, sizeBytes: item.size })); response.json({ database: { path: database.databasePath, sizeBytes: stat.size, journalMode: String(database.get('PRAGMA journal_mode')?.journal_mode ?? 'wal') }, backups, auditCount: Number(database.get('SELECT COUNT(*) AS count FROM audit_logs')?.count ?? 0), analyticsDays: Number(process.env.ANALYTICS_RETENTION_DAYS || 90), recentAudit: database.all('SELECT actor_name, action, target_type, target_id, summary, created_at FROM audit_logs ORDER BY created_at DESC LIMIT 30').map((row) => ({ actorName: row.actor_name, action: row.action, targetType: row.target_type, targetId: row.target_id, summary: row.summary, createdAt: row.created_at })) }) } catch (error) { next(error) }
})
app.post('/api/admin/system/backups', requireAdmin, async (request, response, next) => { try { const backup = await database.createBackup(); database.appendAudit({ actorId: request.user.id, actorName: request.user.displayName, action: 'backup.created', targetType: 'system', targetId: backup.name, summary: 'Database backup created' }); response.status(201).json(backup) } catch (error) { next(error) } })
app.post('/api/admin/system/backups/:name/restore', requireAdmin, async (request, response, next) => { try { const safety = await database.createBackup(); await database.restoreBackup(request.params.name); database.writeDocument('sessions', []); database.appendAudit({ actorId: request.user.id, actorName: request.user.displayName, action: 'backup.restored', targetType: 'system', targetId: request.params.name, summary: `Backup restored; safety backup ${safety.name} created` }); emitEvent('catalog.changed', {}); emitEvent('admin.users.changed', {}); response.setHeader('Set-Cookie', sessionCookie(request, '', 0)); response.json({ restored: true, safetyBackup: safety.name }) } catch (error) { next(error) } })

if (isProduction) {
  const dist = path.join(root, 'dist')
  app.use(express.static(dist))
  app.get('*', (_request, response) => response.sendFile(path.join(dist, 'index.html')))
} else {
  const { createServer } = await import('vite')
  const vite = await createServer({ root, server: { middlewareMode: true, allowedHosts: true }, appType: 'spa' })
  app.use(vite.middlewares)
}

app.use((error, _request, response, _next) => {
  console.error(error)
  if (error instanceof multer.MulterError) {
    response.status(400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'A selected file is too large.' : error.message })
    return
  }
  response.status(error.status ?? 500).json({ error: error.message ?? 'The store server hit an unexpected problem.' })
})

app.listen(port, '0.0.0.0', () => {
  console.log(`Local store running at http://0.0.0.0:${port}`)
  console.log(`Uploads and account data are stored in ${dataRoot}`)
})
