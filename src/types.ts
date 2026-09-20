export type Platform = 'Windows' | 'macOS' | 'Linux' | 'Android' | 'iOS' | 'Web'
export type Delivery = 'web' | 'download'
export type Accent = 'violet' | 'plum' | 'green' | 'coral' | 'blue' | 'pink' | 'amber' | 'teal'

export interface AppRelease {
  id: string
  version: string
  date: string
  notes: string[]
  size?: string
  downloadUrl?: string
  uploadedFileName?: string
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
  featured: boolean
  isNew: boolean
  webUrl?: string
  downloadUrl?: string
  uploadedFileName?: string
  iconImage?: string
  screenshots: string[]
  releases?: AppRelease[]
  features: string[]
  whatsNew: string[]
  developer: string
  isCustom?: boolean
  source?: 'catalog' | 'server'
  ownerId?: string
  ownerName?: string
  publishedSnapshot?: Partial<StoreApp>
  submissionStatus?: SubmissionStatus
  reviewNote?: string
  submittedAt?: string
  reviewedAt?: string
  reviewedBy?: string
  pendingRelease?: AppRelease
  releaseSubmissionStatus?: SubmissionStatus
  releaseReviewNote?: string
  releaseSubmittedAt?: string
}

export type UserRole = 'member' | 'publisher' | 'admin'
export type AccountStatus = 'pending' | 'approved' | 'declined' | 'suspended'
export type SubmissionStatus = 'draft' | 'pending' | 'changes_requested' | 'approved' | 'declined' | 'unpublished'

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
  isBootstrapAdmin?: boolean
}

export type ToastKind = 'success' | 'info' | 'error'

export interface ToastMessage {
  id: number
  message: string
  kind: ToastKind
}
