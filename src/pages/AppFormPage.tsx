import { ArrowLeft, Check, Download, FileArchive, Globe2, ImagePlus, Info, Link2, LoaderCircle, Plus, Save, UploadCloud, X } from 'lucide-react'
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AppIcon } from '../components/AppIcon'
import { AppCardSkeleton, EmptyState } from '../components/StoreStates'
import { useStore } from '../store/StoreContext'
import type { Accent, Delivery, Platform, StoreApp } from '../types'
import { accentOptions, slugify } from '../utils'

const platforms: Platform[] = ['Windows', 'macOS', 'Linux', 'Android', 'iOS']
const iconOptions = [
  ['panels', 'Panels'], ['timer', 'Timer'], ['notebook', 'Notes'], ['scan', 'Scanner'],
  ['palette', 'Design'], ['clipboard', 'Clipboard'], ['headphones', 'Audio'], ['tools', 'Utility'],
]

type DownloadSource = 'upload' | 'url'
type PendingScreenshot = { id: string; file: File; preview: string }

const blankApp: StoreApp = {
  id: '', name: '', tagline: '', description: '', category: 'Productivity', delivery: 'download',
  platforms: ['Windows'], version: '1.0.0', size: '', updated: new Date().toISOString().slice(0, 10),
  accent: 'violet', icon: 'panels', featured: false, isNew: true, downloadUrl: '', screenshots: [],
  features: [], whatsNew: [], developer: 'Local Studio', isCustom: true,
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(bytes > 100 * 1024 * 1024 ? 0 : 1)} MB`
}

function displayFileName(app: StoreApp) {
  if (app.uploadedFileName) return app.uploadedFileName
  if (!app.downloadUrl || /^https?:\/\//.test(app.downloadUrl)) return ''
  return decodeURIComponent(app.downloadUrl.split('/').pop() ?? '')
}

export function AppFormPage() {
  const { appId } = useParams()
  const navigate = useNavigate()
  const { apps, user, getManagedApp, saveApp } = useStore()
  const [editingApp, setEditingApp] = useState<StoreApp | null>(null)
  const [editLoading, setEditLoading] = useState(Boolean(appId))
  const [editError, setEditError] = useState('')
  const [form, setForm] = useState<StoreApp>(blankApp)
  const [featuresText, setFeaturesText] = useState('')
  const [newsText, setNewsText] = useState('')
  const [screenshotUrls, setScreenshotUrls] = useState<string[]>([])
  const [screenshotFiles, setScreenshotFiles] = useState<PendingScreenshot[]>([])
  const [screenshotUrlInput, setScreenshotUrlInput] = useState('')
  const [downloadSource, setDownloadSource] = useState<DownloadSource>('upload')
  const [appFile, setAppFile] = useState<File | null>(null)
  const [iconFile, setIconFile] = useState<File | null>(null)
  const [iconPreview, setIconPreview] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [serverError, setServerError] = useState('')
  const [saving, setSaving] = useState(false)
  const screenshotInputRef = useRef<HTMLInputElement>(null)
  const appFileInputRef = useRef<HTMLInputElement>(null)
  const iconInputRef = useRef<HTMLInputElement>(null)
  const isEditing = Boolean(appId)
  const screenshotCount = screenshotUrls.length + screenshotFiles.length

  useEffect(() => {
    if (!appId && user) setForm((current) => ({ ...current, developer: user.displayName }))
  }, [appId, user])

  useEffect(() => {
    if (!appId) { setEditLoading(false); return }
    let active = true
    setEditLoading(true)
    getManagedApp(appId)
      .then((app) => { if (active) setEditingApp(app) })
      .catch((cause) => { if (active) setEditError(cause instanceof Error ? cause.message : 'The listing could not be loaded.') })
      .finally(() => { if (active) setEditLoading(false) })
    return () => { active = false }
  }, [appId, getManagedApp])

  useEffect(() => {
    if (!editingApp) return
    setForm(editingApp)
    setFeaturesText(editingApp.features.join('\n'))
    setNewsText(editingApp.whatsNew.join('\n'))
    setScreenshotUrls(editingApp.screenshots)
    setScreenshotFiles([])
    setIconFile(null)
    setIconPreview(editingApp.iconImage ?? '')
    setDownloadSource(editingApp.downloadUrl && /^https?:\/\//.test(editingApp.downloadUrl) ? 'url' : 'upload')
  }, [editingApp])

  const setField = <K extends keyof StoreApp>(key: K, value: StoreApp[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
    setErrors((current) => ({ ...current, [key]: '' }))
  }

  const changeDelivery = (delivery: Delivery) => {
    if (delivery === 'web') setAppFile(null)
    setForm((current) => ({
      ...current,
      delivery,
      platforms: delivery === 'web' ? ['Web'] : current.platforms.filter((item) => item !== 'Web').length ? current.platforms.filter((item) => item !== 'Web') : ['Windows'],
      size: delivery === 'web' ? 'Web app' : current.size === 'Web app' ? '' : current.size,
    }))
  }

  const changeDownloadSource = (source: DownloadSource) => {
    setDownloadSource(source)
    setAppFile(null)
    setErrors((current) => ({ ...current, downloadUrl: '', appFile: '' }))
    setForm((current) => {
      const hasRemoteUrl = /^https?:\/\//.test(current.downloadUrl ?? '')
      const shouldClear = (source === 'upload' && hasRemoteUrl) || (source === 'url' && current.downloadUrl?.startsWith('/'))
      return shouldClear ? { ...current, downloadUrl: '', uploadedFileName: undefined } : current
    })
  }

  const togglePlatform = (platform: Platform) => {
    setForm((current) => ({
      ...current,
      platforms: current.platforms.includes(platform) ? current.platforms.filter((item) => item !== platform) : [...current.platforms, platform],
    }))
    setErrors((current) => ({ ...current, platforms: '' }))
  }

  const chooseAppFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setAppFile(file)
    setField('size', formatBytes(file.size))
    setErrors((current) => ({ ...current, appFile: '', downloadUrl: '' }))
    event.target.value = ''
  }

  const chooseIcon = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setErrors((current) => ({ ...current, icon: 'Choose a PNG, JPG, or WebP image.' }))
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setErrors((current) => ({ ...current, icon: 'The icon must be smaller than 5 MB.' }))
      return
    }
    if (iconPreview.startsWith('blob:')) URL.revokeObjectURL(iconPreview)
    setIconFile(file)
    setIconPreview(URL.createObjectURL(file))
    setErrors((current) => ({ ...current, icon: '' }))
  }

  const removeIcon = () => {
    if (iconPreview.startsWith('blob:')) URL.revokeObjectURL(iconPreview)
    setIconFile(null)
    setIconPreview('')
    setField('iconImage', undefined)
  }

  const chooseScreenshots = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (!selected.length) return
    const invalid = selected.find((file) => !['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
    if (invalid) {
      setErrors((current) => ({ ...current, screenshots: `${invalid.name} is not an image.` }))
      return
    }
    const tooLarge = selected.find((file) => file.size > 15 * 1024 * 1024)
    if (tooLarge) {
      setErrors((current) => ({ ...current, screenshots: `${tooLarge.name} is larger than 15 MB.` }))
      return
    }
    const room = 10 - screenshotCount
    if (selected.length > room) {
      setErrors((current) => ({ ...current, screenshots: `You can add ${room} more screenshot${room === 1 ? '' : 's'}.` }))
      return
    }
    const pending = selected.map((file) => ({ id: crypto.randomUUID(), file, preview: URL.createObjectURL(file) }))
    setScreenshotFiles((current) => [...current, ...pending])
    setErrors((current) => ({ ...current, screenshots: '' }))
  }

  const addScreenshotUrl = () => {
    const value = screenshotUrlInput.trim()
    if (!value) return
    if (screenshotCount >= 10) {
      setErrors((current) => ({ ...current, screenshots: 'A listing can have up to 10 screenshots.' }))
      return
    }
    setScreenshotUrls((current) => [...current, value])
    setScreenshotUrlInput('')
    setErrors((current) => ({ ...current, screenshots: '' }))
  }

  const removeScreenshotUrl = (index: number) => setScreenshotUrls((current) => current.filter((_, itemIndex) => itemIndex !== index))
  const removeScreenshotFile = (id: string) => {
    setScreenshotFiles((current) => {
      const target = current.find((item) => item.id === id)
      if (target) URL.revokeObjectURL(target.preview)
      return current.filter((item) => item.id !== id)
    })
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setServerError('')
    const nextErrors: Record<string, string> = {}
    if (!form.name.trim()) nextErrors.name = 'Give the app a name.'
    if (!form.tagline.trim()) nextErrors.tagline = 'Add a short one-line description.'
    if (!form.description.trim()) nextErrors.description = 'Tell people what the app does.'
    if (!form.category.trim()) nextErrors.category = 'Add a category.'
    if (!form.platforms.length) nextErrors.platforms = 'Choose at least one platform.'
    if (form.delivery === 'web' && !form.webUrl?.trim()) nextErrors.webUrl = 'Add the web app address.'
    if (form.delivery === 'download' && downloadSource === 'url' && !form.downloadUrl?.trim()) nextErrors.downloadUrl = 'Add the installer URL.'
    if (form.delivery === 'download' && downloadSource === 'upload' && !appFile && !form.downloadUrl?.startsWith('/')) nextErrors.appFile = 'Choose the app file to upload.'
    if (screenshotCount < 3 || screenshotCount > 10) nextErrors.screenshots = 'Add between 3 and 10 screenshots.'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) {
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    let id = form.id || slugify(form.name)
    if (!form.id && apps.some((app) => app.id === id)) id = `${id}-${Date.now().toString().slice(-4)}`
    const listing: StoreApp = {
      ...form,
      id,
      name: form.name.trim(),
      tagline: form.tagline.trim(),
      description: form.description.trim(),
      category: form.category.trim(),
      downloadUrl: form.delivery === 'download' ? form.downloadUrl?.trim() : undefined,
      webUrl: form.delivery === 'web' ? form.webUrl?.trim() : undefined,
      size: form.delivery === 'web' ? 'Web app' : (form.size.trim() || (appFile ? formatBytes(appFile.size) : 'Size varies')),
      screenshots: screenshotUrls,
      features: featuresText.split('\n').map((item) => item.trim()).filter(Boolean),
      whatsNew: newsText.split('\n').map((item) => item.trim()).filter(Boolean),
      updated: new Date().toISOString().slice(0, 10),
      isCustom: true,
    }

    setSaving(true)
    try {
      await saveApp({ app: listing, appFile: listing.delivery === 'download' ? appFile ?? undefined : undefined, iconFile: iconFile ?? undefined, screenshotFiles: screenshotFiles.map((item) => item.file) })
      screenshotFiles.forEach((item) => URL.revokeObjectURL(item.preview))
      if (iconPreview.startsWith('blob:')) URL.revokeObjectURL(iconPreview)
      navigate('/manage')
    } catch (cause) {
      setServerError(cause instanceof Error ? cause.message : 'The app could not be saved.')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } finally {
      setSaving(false)
    }
  }

  if (editLoading && isEditing) return <div className="page"><AppCardSkeleton count={4} /></div>
  if (isEditing && (editError || !editingApp)) return <div className="page page--centered"><EmptyState title="Listing not found" body={editError || 'This app may have been removed in another tab.'} action={<Link to="/manage" className="button button--primary">Back to manage</Link>} /></div>

  const preview = { ...form, name: form.name || 'Your app', tagline: form.tagline || 'A short, useful description.', accent: form.accent, iconImage: iconPreview || undefined } as StoreApp
  const existingFileName = displayFileName(form)

  return (
    <div className="page form-page">
      <Link to="/manage" className="back-link"><ArrowLeft size={17} /> Back to manage</Link>
      <section className="page-title-row form-title">
        <div><p className="eyebrow">{isEditing ? 'Keep it current' : user?.role === 'admin' ? 'Publish to the shelf' : 'Create a submission'}</p><h1>{isEditing ? `Edit ${editingApp?.name}` : 'Add an app'}</h1><p>{user?.role === 'admin' ? 'Administrator changes publish directly to the store.' : 'Save a complete draft here, then submit it for administrator review.'}</p></div>
      </section>

      <form onSubmit={submit} noValidate>
        <div className="form-layout">
          <div className="form-main">
            {(Object.values(errors).some(Boolean) || serverError) && <div className="form-error-summary"><Info size={18} /><span><strong>{serverError || 'A few details need attention.'}</strong>{!serverError && ' Check the highlighted fields below.'}</span></div>}

            <FormSection number="01" title="The basics" description="The name and short story people see first.">
              <div className="field-row field-row--two">
                <Field label="App name" error={errors.name}><input value={form.name} onChange={(event) => setField('name', event.target.value)} placeholder="e.g. Quiet Notes" /></Field>
                <Field label="Developer"><input value={form.developer} onChange={(event) => setField('developer', event.target.value)} placeholder="Your name or studio" /></Field>
              </div>
              <Field label="Tagline" hint={`${form.tagline.length}/70`} error={errors.tagline}><input maxLength={70} value={form.tagline} onChange={(event) => setField('tagline', event.target.value)} placeholder="One simple sentence about the app" /></Field>
              <Field label="Description" error={errors.description}><textarea rows={5} value={form.description} onChange={(event) => setField('description', event.target.value)} placeholder="What does it do, and who is it for?" /></Field>
              <div className="field-row field-row--two">
                <Field label="Category" error={errors.category}><input value={form.category} onChange={(event) => setField('category', event.target.value)} placeholder="Productivity" /></Field>
                <Field label="Version"><input value={form.version} onChange={(event) => setField('version', event.target.value)} placeholder="1.0.0" /></Field>
              </div>
            </FormSection>

            <FormSection number="02" title="How people get it" description="Upload an app file to this server, use a URL, or open a web app.">
              <div className="delivery-toggle">
                <button type="button" className={form.delivery === 'download' ? 'is-active' : ''} onClick={() => changeDelivery('download')}><Download size={20} /><span><strong>Downloadable</strong><small>Desktop or mobile file</small></span>{form.delivery === 'download' && <Check size={17} />}</button>
                <button type="button" className={form.delivery === 'web' ? 'is-active' : ''} onClick={() => changeDelivery('web')}><Globe2 size={20} /><span><strong>Web app</strong><small>Opens in the browser</small></span>{form.delivery === 'web' && <Check size={17} />}</button>
              </div>

              {form.delivery === 'download' ? (
                <>
                  <Field label="Platforms" error={errors.platforms}>
                    <div className="checkbox-chips">{platforms.map((platform) => <button type="button" key={platform} className={form.platforms.includes(platform) ? 'is-active' : ''} onClick={() => togglePlatform(platform)}>{form.platforms.includes(platform) && <Check size={14} />}{platform}</button>)}</div>
                  </Field>
                  <div className="upload-source-tabs" role="group" aria-label="Choose where the app file comes from">
                    <button type="button" className={downloadSource === 'upload' ? 'is-active' : ''} onClick={() => changeDownloadSource('upload')}><UploadCloud size={16} /> Upload a file</button>
                    <button type="button" className={downloadSource === 'url' ? 'is-active' : ''} onClick={() => changeDownloadSource('url')}><Link2 size={16} /> Use a URL</button>
                  </div>
                  {downloadSource === 'upload' ? (
                    <div className={`field ${errors.appFile ? 'field--error' : ''}`}>
                      <span className="field__label">App file <small>Required · up to 2 GB</small></span>
                      <input ref={appFileInputRef} className="native-file-input" hidden aria-hidden="true" tabIndex={-1} type="file" onChange={chooseAppFile} accept=".exe,.msi,.msix,.dmg,.pkg,.zip,.apk,.aab,.deb,.rpm,.AppImage,.tar,.gz" />
                      {appFile || existingFileName ? (
                        <div className="selected-file">
                          <span className="selected-file__icon"><FileArchive size={22} /></span>
                          <span><strong>{appFile?.name ?? existingFileName}</strong><small>{appFile ? formatBytes(appFile.size) : `${form.size || 'Uploaded file'} · currently stored`}</small></span>
                          <button type="button" className="button button--secondary" onClick={() => appFileInputRef.current?.click()}>Replace</button>
                        </div>
                      ) : (
                        <button type="button" className="file-drop" onClick={() => appFileInputRef.current?.click()}>
                          <span className="upload-drop__icon"><UploadCloud size={23} /></span><span className="upload-drop__copy"><strong>Choose the app file</strong><small>EXE, MSI, DMG, ZIP, APK, AAB, DEB, and more</small></span>
                        </button>
                      )}
                      {errors.appFile && <span className="field__error"><Info size={14} /> {errors.appFile}</span>}
                    </div>
                  ) : (
                    <Field label="Download URL" hint="Required" error={errors.downloadUrl}><input value={form.downloadUrl ?? ''} onChange={(event) => setField('downloadUrl', event.target.value)} placeholder="https://downloads.example/my-app.zip" inputMode="url" /></Field>
                  )}
                  <Field label="Download size" hint={appFile ? 'Filled from the selected file' : undefined}><input value={form.size} onChange={(event) => setField('size', event.target.value)} placeholder="48 MB" /></Field>
                  <p className="field-note"><Info size={15} /> Uploaded files are stored on this store’s server and become immediately downloadable to visitors.</p>
                </>
              ) : (
                <Field label="Web app URL" hint="Required" error={errors.webUrl}><input value={form.webUrl ?? ''} onChange={(event) => setField('webUrl', event.target.value)} placeholder="https://your-app.example" inputMode="url" /></Field>
              )}
            </FormSection>

            <FormSection number="03" title="Screenshot gallery" description="Add 3 to 10 images by uploading them or pasting image URLs.">
              <div className={`field ${errors.screenshots ? 'field--error' : ''}`}>
                <span className="field__label">Screenshots <small>{screenshotCount}/10 · minimum 3</small></span>
                {screenshotCount > 0 && (
                  <div className="screenshot-editor-grid">
                    {screenshotUrls.map((url, index) => (
                      <div className="screenshot-editor-item" key={`${url}-${index}`}>
                        <img src={url} alt={`Screenshot ${index + 1}`} />
                        <span>{url.startsWith('/uploads/') ? 'Uploaded' : 'URL'}</span>
                        <button type="button" onClick={() => removeScreenshotUrl(index)} aria-label={`Remove screenshot ${index + 1}`}><X size={15} /></button>
                      </div>
                    ))}
                    {screenshotFiles.map((item, index) => (
                      <div className="screenshot-editor-item is-new" key={item.id}>
                        <img src={item.preview} alt={`New screenshot ${screenshotUrls.length + index + 1}`} />
                        <span>New upload</span>
                        <button type="button" onClick={() => removeScreenshotFile(item.id)} aria-label={`Remove ${item.file.name}`}><X size={15} /></button>
                      </div>
                    ))}
                  </div>
                )}
                {screenshotCount < 10 && (
                  <>
                    <input ref={screenshotInputRef} className="native-file-input" hidden aria-hidden="true" tabIndex={-1} type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={chooseScreenshots} />
                    <button type="button" className="screenshot-upload-button" onClick={() => screenshotInputRef.current?.click()}><span className="upload-drop__icon"><ImagePlus size={20} /></span><span className="upload-drop__copy"><strong>Upload screenshots</strong><small>PNG, JPG, WebP · up to 15 MB each</small></span><Plus className="upload-drop__plus" size={16} /></button>
                    <div className="or-divider"><span>or add an image URL</span></div>
                    <div className="url-adder"><div className="input-with-icon"><Link2 size={17} /><input value={screenshotUrlInput} onChange={(event) => setScreenshotUrlInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addScreenshotUrl() } }} placeholder="https://example.com/screenshot.jpg" /></div><button type="button" className="button button--secondary" onClick={addScreenshotUrl}>Add</button></div>
                  </>
                )}
                {errors.screenshots && <span className="field__error"><Info size={14} /> {errors.screenshots}</span>}
              </div>
            </FormSection>

            <FormSection number="04" title="Look & feel" description="Upload your own icon or use one of the store’s built-in symbols.">
              <div className={`field ${errors.icon ? 'field--error' : ''}`}>
                <span className="field__label">Custom app icon <small>Optional · square image up to 5 MB</small></span>
                <input ref={iconInputRef} className="native-file-input" hidden aria-hidden="true" tabIndex={-1} type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseIcon} />
                {iconPreview ? (
                  <div className="icon-upload-preview">
                    <div className="icon-upload-preview__image"><img src={iconPreview} alt="Custom app icon preview" /></div>
                    <span><strong>{iconFile?.name ?? 'Uploaded icon'}</strong><small>{iconFile ? formatBytes(iconFile.size) : 'Currently stored on the server'}</small></span>
                    <div><button type="button" className="button button--secondary" onClick={() => iconInputRef.current?.click()}>Replace</button><button type="button" className="icon-button danger-hover" onClick={removeIcon} aria-label="Remove custom icon"><X size={17} /></button></div>
                  </div>
                ) : (
                  <button type="button" className="icon-upload-button" onClick={() => iconInputRef.current?.click()}><span className="upload-drop__icon"><UploadCloud size={21} /></span><span className="upload-drop__copy"><strong>Upload a custom icon</strong><small>PNG, JPG, or WebP · 1:1 ratio recommended</small></span><Plus className="upload-drop__plus" size={16} /></button>
                )}
                {errors.icon && <span className="field__error"><Info size={14} /> {errors.icon}</span>}
              </div>
              <Field label="Accent color">
                <div className="color-picker">{accentOptions.map((color) => <button key={color} type="button" className={`color-choice accent-${color} ${form.accent === color ? 'is-active' : ''}`} onClick={() => setField('accent', color as Accent)} aria-label={`${color} accent`}><span />{form.accent === color && <Check size={15} />}</button>)}</div>
              </Field>
              <Field label="Built-in icon" hint={iconPreview ? 'Used if the custom icon is removed' : 'Choose one'}>
                <div className="icon-picker">{iconOptions.map(([icon, label]) => <button type="button" key={icon} className={form.icon === icon ? 'is-active' : ''} onClick={() => setField('icon', icon)}><AppIcon app={{ name: label, icon, accent: form.accent }} size="small" /><span>{label}</span></button>)}</div>
              </Field>
            </FormSection>

            <FormSection number="05" title="Useful details" description="One item per line. Keep them short and honest.">
              <div className="field-row field-row--two">
                <Field label="Key features"><textarea rows={5} value={featuresText} onChange={(event) => setFeaturesText(event.target.value)} placeholder={'Works offline\nInstant search\nSimple export'} /></Field>
                <Field label="What’s new"><textarea rows={5} value={newsText} onChange={(event) => setNewsText(event.target.value)} placeholder={'A faster launch\nImproved export\nSmall fixes'} /></Field>
              </div>
            </FormSection>
          </div>

          <aside className="form-aside">
            <div className="preview-card">
              <p className="section-kicker">Live preview</p>
              <div className="preview-card__app"><AppIcon app={preview} size="large" /><div><h3>{preview.name}</h3><p>{preview.tagline}</p></div></div>
              <div className="preview-card__meta"><span>{preview.category || 'Category'}</span><span>{preview.platforms.join(' · ') || 'Platform'}</span></div>
              <button type="button" className="get-button">{preview.delivery === 'web' ? <Globe2 size={15} /> : <Download size={15} />}{preview.delivery === 'web' ? 'Open' : 'Get'}</button>
            </div>
            <div className="form-actions">
              <button type="submit" className="button button--primary button--large button--full" disabled={saving}>{saving ? <LoaderCircle className="spin" size={18} /> : <Save size={18} />} {saving ? 'Uploading…' : user?.role === 'admin' ? isEditing ? 'Save & publish changes' : 'Publish listing' : isEditing ? 'Save draft changes' : 'Save as draft'}</button>
              <Link to="/manage" className="button button--ghost button--full">Cancel</Link>
              <small>{user?.role === 'admin' ? 'Administrator changes become public immediately.' : 'Drafts stay private until you submit and an administrator approves them.'}</small>
            </div>
          </aside>
        </div>
      </form>
    </div>
  )
}

function FormSection({ number, title, description, children }: { number: string; title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="form-section">
      <div className="form-section__heading"><span>{number}</span><div><h2>{title}</h2><p>{description}</p></div></div>
      <div className="form-section__fields">{children}</div>
    </section>
  )
}

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <label className={`field ${error ? 'field--error' : ''}`}>
      <span className="field__label">{label}{hint && <small>{hint}</small>}</span>
      {children}
      {error && <span className="field__error"><Info size={14} /> {error}</span>}
    </label>
  )
}
