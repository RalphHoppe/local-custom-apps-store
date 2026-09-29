export type Platform = 'Windows' | 'macOS' | 'Linux' | 'Android' | 'iOS' | 'Web'
export type Delivery = 'web' | 'download'
export type Accent = 'violet' | 'plum' | 'green' | 'coral' | 'blue' | 'pink' | 'amber' | 'teal'

export type ReleaseChannel = 'stable' | 'beta' | 'preview'
export type ReleaseStatus = 'scheduled' | 'rolling' | 'published' | 'rolled_back'
export type AppPermissionId = 'network' | 'notifications' | 'files' | 'camera' | 'microphone' | 'location' | 'clipboard' | 'screen_capture' | 'accessibility' | 'background'
export type SignatureType = 'authenticode' | 'apple_developer_id' | 'android' | 'gpg' | 'other'
export type SecurityScanStatus = 'passed' | 'warning' | 'blocked' | 'not_scanned' | 'not_applicable' | 'unavailable'
export type IntegrityStatus = 'verified' | 'changed' | 'publisher_provided' | 'not_applicable' | 'unavailable'

export interface SignatureMetadata {
  type: SignatureType
  signer: string
  fingerprint?: string
}

export interface TrustBadge {
  id: 'local_scan' | 'checksum' | 'integrity' | 'signature' | 'permissions' | 'verified_publisher'
  label: string
  tone: 'green' | 'violet' | 'blue' | 'neutral'
}

export interface TrustSummary {
  scanStatus: SecurityScanStatus
  integrityStatus: IntegrityStatus
  source: 'hosted' | 'catalog' | 'external' | 'web'
  hasChecksum: boolean
  signatureStatus: 'declared' | 'not_provided'
  permissionCount: number
  badges: TrustBadge[]
}

export interface SecurityFinding {
  severity: 'info' | 'warning' | 'blocked'
  code: string
  title: string
  detail: string
}

export interface AppSecurityProfile extends TrustSummary {
  reportId: string
  appId: string
  appName: string
  version: string
  releaseId?: string
  fileName: string | null
  fileSize: number | null
  sha256: string | null
  scanner: string
  scannerVersion: string
  findings: SecurityFinding[]
  scannedAt: string | null
  verifiedAt: string | null
  signature: SignatureMetadata | null
  permissions: AppPermissionId[]
  permissionDetails: Array<{ id: AppPermissionId; label: string; description: string }>
  canVerify: boolean
  disclosure: string
}

export interface AppRelease {
  id: string
  version: string
  date: string
  notes: string[]
  size?: string
  downloadUrl?: string
  uploadedFileName?: string
  channel?: ReleaseChannel
  status?: ReleaseStatus
  rolloutPercentage?: number
  scheduledAt?: string
  scheduleTimezone?: string
  publishedAt?: string
  rolledBackAt?: string
  rollbackReason?: string
  previousVersion?: string
  previousSize?: string
  previousDownloadUrl?: string
  previousUploadedFileName?: string
  previousWhatsNew?: string[]
  previousUpdated?: string
  previousPermissions?: AppPermissionId[]
  previousSignature?: SignatureMetadata
  previousProvidedChecksum?: string
  permissions?: AppPermissionId[]
  signature?: SignatureMetadata
  providedChecksum?: string
  trust?: TrustSummary
  audienceEligible?: boolean
  subscribersNotifiedAt?: string
  securityHoldAt?: string
  securityHoldReason?: string
}

export interface StoreApp {
  id: string
  name: string
  tagline: string
  description: string
  category: string
  delivery: Delivery
  platforms: Platform[]
  version: string
  size: string
  updated: string
  accent: Accent
  icon: string
  iconImage?: string
  featured: boolean
  isNew: boolean
  downloadUrl?: string
  uploadedFileName?: string
  webUrl?: string
  screenshots: string[]
  features: string[]
  whatsNew: string[]
  developer: string
  publisherUsername?: string
  publisherName?: string
  publisherVerified?: boolean
  ratingAverage?: number
  ratingCount?: number
  permissions?: AppPermissionId[]
  signature?: SignatureMetadata
  providedChecksum?: string
  trust?: TrustSummary
  isCustom?: boolean
  source?: 'catalog' | 'server'
  ownerId?: string
  ownerName?: string
  submissionStatus?: SubmissionStatus
  reviewNote?: string
  submittedAt?: string
  reviewedAt?: string
  reviewedBy?: string
  publishedSnapshot?: StoreApp
  reviewHistory?: ReviewHistoryEntry[]
  releases?: AppRelease[]
  pendingRelease?: AppRelease
  releaseSubmissionStatus?: 'pending' | 'changes_requested' | 'declined'
  releaseReviewNote?: string
  releaseSubmittedAt?: string
}

export interface EditorialCollection {
  id: string
  title: string
  description: string
  accent: Accent
  published: boolean
  appIds: string[]
  createdAt: string
  updatedAt: string
}

export interface DiscoveryTrend {
  appId: string
  rank: number
  signal: 'rising' | 'popular' | 'new' | 'steady'
}

export interface DiscoveryData {
  generatedAt: string
  trending: DiscoveryTrend[]
  collections: EditorialCollection[]
  followedPublishers: string[]
  privacy: {
    browsingHistoryStoredOnServer: boolean
    personalizationScope: string
  }
}

export interface RecentView {
  appId: string
  viewedAt: string
}

export interface AppReview {
  id: string
  appId: string
  userName: string
  isOwn: boolean
  rating: number
  title: string
  body: string
  status: 'published' | 'hidden'
  helpfulCount: number
  helpfulByViewer: boolean
  publisherReply: string | null
  publisherRepliedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ReviewSummary {
  average: number
  total: number
  breakdown: Record<'1' | '2' | '3' | '4' | '5', number>
}

export interface ReviewEligibility {
  canReview: boolean
  hasVerifiedUse: boolean
  reason: 'eligible' | 'sign_in' | 'approval_required' | 'use_required' | 'owner' | 'moderated'
  existingReview: AppReview | null
  canRespond: boolean
}

export interface AppReviewsResponse {
  summary: ReviewSummary
  reviews: AppReview[]
  eligibility: ReviewEligibility
}

export type UserRole = 'member' | 'publisher' | 'admin'
export type AccountStatus = 'pending' | 'approved' | 'declined' | 'suspended'
export type SubmissionStatus = 'draft' | 'pending' | 'changes_requested' | 'approved' | 'declined' | 'unpublished'

export interface NotificationPreferences {
  soundEnabled: boolean
  soundVolume: number
  soundScope: 'important' | 'all'
  liveToasts: boolean
  browserNotifications: boolean
}

export interface ActivityNotification {
  id: string
  userId: string
  title: string
  body: string
  kind: 'account_review' | 'listing_review' | 'update_review' | 'account_status' | 'listing_decision' | 'update_decision' | 'publication' | 'customer_review' | 'review_reply' | 'review_report' | 'review_moderation' | 'release' | 'publisher_verification' | 'system'
  priority: 'normal' | 'important'
  href: string
  createdAt: string
  readAt: string | null
}

export interface RealtimeSignal {
  sequence: number
  type: string
  appId?: string
  userId?: string
  username?: string
  collectionId?: string
}

export interface PublisherProfile {
  username: string
  name: string
  headline: string
  about: string
  accent: Accent
  logoImage: string
  coverImage: string
  websiteUrl: string
  supportUrl: string
  documentationUrl: string
  supportEmail: string
  verified: boolean
  verifiedAt: string | null
  joinedAt: string
  followerCount?: number
  releaseSubscriberCount?: number
  publishedAppCount?: number
  followedByViewer?: boolean
  isOwn?: boolean
}

export interface UserAccount {
  id: string
  username: string
  email: string
  displayName: string
  requestedRole: UserRole
  role: UserRole
  status: AccountStatus
  reviewNote: string
  createdAt: string
  reviewedAt?: string | null
  emailVerified: boolean
  emailVerifiedAt?: string | null
  isBootstrapAdmin?: boolean
  publisherProfile?: Omit<PublisherProfile, 'username' | 'verified' | 'verifiedAt' | 'joinedAt' | 'followerCount' | 'releaseSubscriberCount' | 'publishedAppCount' | 'followedByViewer' | 'isOwn'>
  publisherVerified?: boolean
  publisherVerifiedAt?: string | null
  publisherVerifiedBy?: string | null
  publisherVerificationNote?: string
  notificationPreferences: NotificationPreferences
}

export interface ReviewHistoryEntry {
  id: string
  action: string
  note: string
  adminId: string
  adminName: string
  date: string
}

export type ToastKind = 'success' | 'info' | 'error'
export interface ToastMessage { id: number; message: string; kind: ToastKind }
