import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import multer from 'multer'

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

async function readJson(file, fallback = []) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback
    throw error
  }
}

async function writeJson(file, value) {
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
  const [seedApps, overrides] = await Promise.all([readJson(seedCatalogFile), readJson(overridesFile)])
  return { seedApps, overrides }
}

function effectivePublicApp(override) {
  const status = override.submissionStatus ?? 'approved'
  if (status === 'unpublished') return null
  if (status === 'approved') return override.publishedSnapshot ?? toPublished(override)
  return override.publishedSnapshot ?? null
}

async function getPublicCatalog() {
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
  return merged
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
    if (file.fieldname === 'screenshots') callback(null, screenshotsRoot)
    else if (file.fieldname === 'icon') callback(null, iconsRoot)
    else callback(null, installersRoot)
  },
  filename(_request, file, callback) {
    const fallback = file.fieldname === 'screenshots' ? 'screenshot' : file.fieldname === 'icon' ? 'icon' : 'app'
    callback(null, cleanName(file.originalname, fallback))
  },
})

const upload = multer({
  storage,
  limits: { files: 12, fileSize: 2 * 1024 * 1024 * 1024, fields: 5 },
  fileFilter(_request, file, callback) {
    const safeImageTypes = new Set(['image/png', 'image/jpeg', 'image/webp'])
    if ((file.fieldname === 'screenshots' || file.fieldname === 'icon') && !safeImageTypes.has(file.mimetype)) {
      const error = new Error(`${file.originalname} must be a PNG, JPG, or WebP image.`)
      error.status = 400
      callback(error)
      return
    }
    callback(null, true)
  },
})

function uploadedPath(file) {
  const folder = file.fieldname === 'screenshots' ? 'screenshots' : file.fieldname === 'icon' ? 'icons' : 'installers'
  return `/uploads/${folder}/${file.filename}`
}

function localUploadPath(publicPath) {
  if (typeof publicPath !== 'string' || !publicPath.startsWith('/uploads/')) return null
  const resolved = path.resolve(uploadsRoot, publicPath.slice('/uploads/'.length))
  return resolved.startsWith(`${uploadsRoot}${path.sep}`) ? resolved : null
}

async function removeLocalFile(publicPath) {
  const resolved = localUploadPath(publicPath)
  if (!resolved) return
  try { await fs.unlink(resolved) } catch (error) { if (error?.code !== 'ENOENT') console.error(`Could not remove ${resolved}:`, error) }
}

function removeNewUploads(files) {
  const allFiles = [...(files?.appFile ?? []), ...(files?.releaseFile ?? []), ...(files?.icon ?? []), ...(files?.screenshots ?? [])]
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

function applyRelease(app, release) {
  const previousReleases = app.releases?.length ? app.releases : [{
    id: crypto.randomUUID(), version: app.version, date: app.updated,
    notes: app.whatsNew?.length ? app.whatsNew : ['Initial store release'], size: app.size,
    downloadUrl: app.delivery === 'download' ? app.downloadUrl : undefined,
    uploadedFileName: app.uploadedFileName,
  }]
  const publishedBase = app.publishedSnapshot ?? toPublished(app)
  const releaseFields = {
    version: release.version, updated: release.date, size: release.size,
    downloadUrl: app.delivery === 'download' ? release.downloadUrl : undefined,
    uploadedFileName: release.uploadedFileName, whatsNew: release.notes,
    releases: [release, ...previousReleases], isNew: false,
  }
  return {
    ...app, ...releaseFields,
    publishedSnapshot: { ...publishedBase, ...releaseFields },
    pendingRelease: undefined, releaseSubmissionStatus: undefined,
    releaseReviewNote: '', releaseSubmittedAt: undefined,
  }
}

const app = express()
app.disable('x-powered-by')
app.use('/uploads', express.static(uploadsRoot, {
  fallthrough: false, maxAge: isProduction ? '7d' : 0,
  setHeaders(response, filePath) { if (filePath.startsWith(installersRoot)) response.setHeader('Content-Disposition', 'attachment') },
}))
app.use(express.json({ limit: '1mb' }))
app.use('/api', resolveAuth)

app.get('/api/health', (_request, response) => response.json({ ok: true, storage: dataRoot }))

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
      reviewedAt: null, isBootstrapAdmin: false,
    }
    users.push(user)
    await writeJson(usersFile, users)
    response.status(201).json({ user: publicUser(user), message: 'Account created and sent for administrator review.' })
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

// Public and managed catalogs
app.get('/api/apps', async (_request, response, next) => {
  try { response.json(await getPublicCatalog()) } catch (error) { next(error) }
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
    const date = /^\d{4}-\d{2}-\d{2}$/.test(input.date ?? '') ? input.date : new Date().toISOString().slice(0, 10)
    const release = {
      id: crypto.randomUUID(), version: input.version.trim(), date, notes,
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
    response.status(201).json(nextListing)
  } catch (error) { if (request.file) await fs.unlink(request.file.path).catch(() => undefined); next(error) }
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
    if (action === 'approve') updated = { ...target, status: 'approved', role: ['member', 'publisher'].includes(role) ? role : target.requestedRole, reviewNote: String(note).trim(), reviewedAt: now }
    else if (action === 'decline') updated = { ...target, status: 'declined', reviewNote: String(note).trim(), reviewedAt: now }
    else if (action === 'suspend') updated = { ...target, status: 'suspended', reviewNote: String(note).trim(), reviewedAt: now }
    else if (action === 'reactivate') updated = { ...target, status: 'approved', reviewNote: String(note).trim(), reviewedAt: now }
    else if (action === 'change_role' && ['member', 'publisher', 'admin'].includes(role)) updated = { ...target, role, reviewNote: String(note).trim(), reviewedAt: now }
    else { response.status(400).json({ error: 'Choose a valid account action.' }); return }
    await writeJson(usersFile, users.map((user) => user.id === target.id ? updated : user))
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
