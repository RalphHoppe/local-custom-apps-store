import {
  Accessibility,
  Bell,
  Camera,
  Clipboard,
  FileKey2,
  FolderOpen,
  Info,
  MapPin,
  Mic,
  MonitorUp,
  Network,
  RefreshCw,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'
import type { AppPermissionId, SignatureMetadata, SignatureType } from '../types'

export const permissionDefinitions: Array<{ id: AppPermissionId; label: string; description: string; icon: LucideIcon }> = [
  { id: 'network', label: 'Network access', description: 'Connects to the internet or local network.', icon: Network },
  { id: 'notifications', label: 'Notifications', description: 'Can show system notifications and reminders.', icon: Bell },
  { id: 'files', label: 'Files & folders', description: 'Can open, create, or change files you choose.', icon: FolderOpen },
  { id: 'camera', label: 'Camera', description: 'Can capture photos or video when allowed.', icon: Camera },
  { id: 'microphone', label: 'Microphone', description: 'Can capture audio when allowed.', icon: Mic },
  { id: 'location', label: 'Location', description: 'Can request approximate or precise location.', icon: MapPin },
  { id: 'clipboard', label: 'Clipboard', description: 'Can read from or write to the clipboard.', icon: Clipboard },
  { id: 'screen_capture', label: 'Screen capture', description: 'Can capture a screen, window, or display.', icon: MonitorUp },
  { id: 'accessibility', label: 'Accessibility control', description: 'Can request control of other apps or input.', icon: Accessibility },
  { id: 'background', label: 'Runs in background', description: 'Can keep working when its window is closed.', icon: RefreshCw },
]

const signatureOptions: Array<{ value: SignatureType; label: string }> = [
  { value: 'authenticode', label: 'Microsoft Authenticode' },
  { value: 'apple_developer_id', label: 'Apple Developer ID' },
  { value: 'android', label: 'Android app signing' },
  { value: 'gpg', label: 'GPG / detached signature' },
  { value: 'other', label: 'Other signing method' },
]

interface TrustMetadataFieldsProps {
  delivery: 'web' | 'download'
  permissions: AppPermissionId[]
  onPermissionsChange: (permissions: AppPermissionId[]) => void
  signature?: SignatureMetadata
  onSignatureChange: (signature: SignatureMetadata | undefined) => void
  checksum?: string
  onChecksumChange: (checksum: string) => void
  externalArtifact?: boolean
  errors?: Record<string, string>
  compact?: boolean
}

export function TrustMetadataFields({
  delivery,
  permissions,
  onPermissionsChange,
  signature,
  onSignatureChange,
  checksum = '',
  onChecksumChange,
  externalArtifact = false,
  errors = {},
  compact = false,
}: TrustMetadataFieldsProps) {
  const togglePermission = (id: AppPermissionId) => {
    onPermissionsChange(permissions.includes(id) ? permissions.filter((item) => item !== id) : [...permissions, id])
  }
  const chooseSignature = (value: string) => {
    if (!value) onSignatureChange(undefined)
    else onSignatureChange({ type: value as SignatureType, signer: signature?.signer ?? '', fingerprint: signature?.fingerprint ?? '' })
  }

  return (
    <div className={`trust-metadata-fields ${compact ? 'is-compact' : ''}`}>
      <fieldset className="permission-editor">
        <legend>Permissions used <small>{permissions.length ? `${permissions.length} declared` : 'No special access declared'}</small></legend>
        <p>Choose every device or system capability the app may request. People see this before they install or open it.</p>
        <div>
          {permissionDefinitions.map(({ id, label, description, icon: Icon }) => {
            const selected = permissions.includes(id)
            return (
              <button type="button" key={id} className={selected ? 'is-selected' : ''} role="checkbox" aria-checked={selected} onClick={() => togglePermission(id)}>
                <span><Icon /></span><span><strong>{label}</strong><small>{description}</small></span><i>{selected ? 'Declared' : 'Not used'}</i>
              </button>
            )
          })}
        </div>
      </fieldset>

      {delivery === 'download' && (
        <section className="signature-editor">
          <div className="signature-editor__heading"><span><FileKey2 /></span><div><strong>Build signature</strong><small>Optional Publisher-provided signing metadata</small></div></div>
          <div className="field-row field-row--two">
            <label className={`field ${errors.signature ? 'field--error' : ''}`}>
              <span className="field__label">Signing method</span>
              <select value={signature?.type ?? ''} onChange={(event) => chooseSignature(event.target.value)}>
                <option value="">No signature provided</option>
                {signatureOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
              </select>
              {errors.signature && <span className="field__error"><Info /> {errors.signature}</span>}
            </label>
            <label className="field">
              <span className="field__label">Signer name {signature && <small>Required</small>}</span>
              <input value={signature?.signer ?? ''} disabled={!signature} maxLength={120} onChange={(event) => signature && onSignatureChange({ ...signature, signer: event.target.value })} placeholder="Studio or certificate subject" />
            </label>
          </div>
          {signature && <label className={`field ${errors.fingerprint ? 'field--error' : ''}`}><span className="field__label">Certificate fingerprint <small>Optional · SHA-1 or SHA-256</small></span><input className="trust-mono-input" value={signature.fingerprint ?? ''} onChange={(event) => onSignatureChange({ ...signature, fingerprint: event.target.value })} placeholder="64 hexadecimal characters" spellCheck={false} />{errors.fingerprint && <span className="field__error"><Info /> {errors.fingerprint}</span>}</label>}
          <p className="field-note"><ShieldCheck /> Signature details are clearly marked as Publisher-provided. Local records the metadata but does not claim cryptographic verification.</p>
        </section>
      )}

      {delivery === 'download' && externalArtifact && (
        <label className={`field external-checksum-field ${errors.providedChecksum ? 'field--error' : ''}`}>
          <span className="field__label">Publisher SHA-256 checksum <small>Required for an external file</small></span>
          <input className="trust-mono-input" value={checksum} onChange={(event) => onChecksumChange(event.target.value)} placeholder="64 hexadecimal characters" maxLength={95} spellCheck={false} />
          <span className="field-note"><Info /> Local does not fetch external builds. This checksum is published for independent comparison.</span>
          {errors.providedChecksum && <span className="field__error"><Info /> {errors.providedChecksum}</span>}
        </label>
      )}
    </div>
  )
}
