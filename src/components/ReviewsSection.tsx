import {
  AlertTriangle,
  BadgeCheck,
  Check,
  ChevronDown,
  Flag,
  LoaderCircle,
  MessageCircle,
  PenLine,
  Star,
  ThumbsUp,
  Trash2,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { getResponseError, useStore } from '../store/StoreContext'
import type { AppReview, AppReviewsResponse, StoreApp } from '../types'

const emptyReviews: AppReviewsResponse = {
  summary: { average: 0, total: 0, breakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } },
  reviews: [],
  eligibility: { canReview: false, hasVerifiedUse: false, reason: 'sign_in', existingReview: null, canRespond: false },
}

function reviewDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))
}

function initials(name: string) {
  return name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()
}

export function ReviewsSection({ app }: { app: StoreApp }) {
  const { user, openAuth, notify, trackEvent, realtimeSignal } = useStore()
  const [data, setData] = useState<AppReviewsResponse>(emptyReviews)
  const [sort, setSort] = useState<'helpful' | 'newest'>('helpful')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [writing, setWriting] = useState(false)
  const [reporting, setReporting] = useState<AppReview | null>(null)
  const [replying, setReplying] = useState<AppReview | null>(null)
  const requestRef = useRef(0)

  const load = useCallback(async (silent = false) => {
    const requestId = ++requestRef.current
    if (silent) setRefreshing(true); else setLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/apps/${encodeURIComponent(app.id)}/reviews?sort=${sort}`)
      if (!response.ok) throw new Error(await getResponseError(response))
      const nextData = await response.json() as AppReviewsResponse
      if (requestRef.current === requestId) setData(nextData)
    } catch (cause) {
      if (requestRef.current === requestId) setError(cause instanceof Error ? cause.message : 'Reviews could not be loaded.')
    } finally {
      if (requestRef.current === requestId) { setLoading(false); setRefreshing(false) }
    }
  }, [app.id, sort])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!['reviews.changed', 'review_eligibility.changed'].includes(realtimeSignal.type) || realtimeSignal.appId !== app.id) return
    const timer = window.setTimeout(() => void load(true), 250)
    return () => window.clearTimeout(timer)
  }, [app.id, load, realtimeSignal.appId, realtimeSignal.sequence, realtimeSignal.type])

  const voteHelpful = async (review: AppReview) => {
    if (!user) { openAuth('signin'); return }
    try {
      const response = await fetch(`/api/reviews/${review.id}/helpful`, { method: 'POST' })
      if (!response.ok) throw new Error(await getResponseError(response))
      const updated = await response.json() as AppReview
      setData((current) => ({ ...current, reviews: current.reviews.map((item) => item.id === updated.id ? updated : item) }))
    } catch (cause) { notify(cause instanceof Error ? cause.message : 'Your vote could not be saved.', 'error') }
  }

  const saved = (review: AppReview, created: boolean) => {
    setWriting(false)
    setData((current) => ({ ...current, eligibility: { ...current.eligibility, existingReview: review } }))
    trackEvent('review', app.id, { action: created ? 'created' : 'updated' })
    notify(created ? 'Your verified review is live' : 'Your review was updated')
    void load(true)
  }

  return (
    <section className="reviews-section" id="reviews" aria-labelledby="reviews-heading">
      <header className="reviews-heading">
        <div><p className="section-kicker">Verified community feedback</p><h2 id="reviews-heading">Ratings & reviews</h2><p>Only approved members who downloaded or opened this app can publish a review.</p></div>
        {refreshing && <span className="reviews-refreshing"><LoaderCircle className="spin" /> Updating</span>}
      </header>

      {error && <div className="reviews-error"><AlertTriangle /><span>{error}</span><button type="button" onClick={() => void load()}>Try again</button></div>}
      {loading ? <ReviewsSkeleton /> : (
        <>
          <div className="reviews-overview">
            <RatingSummary data={data} />
            <ReviewInvitation eligibility={data.eligibility} writing={writing} setWriting={setWriting} signIn={() => openAuth('signin')} />
          </div>

          {writing && <ReviewEditor app={app} existing={data.eligibility.existingReview} cancel={() => setWriting(false)} saved={saved} removed={() => { setWriting(false); void load() }} />}

          <div className="reviews-list-heading">
            <div><strong>{data.summary.total ? `${data.summary.total} verified ${data.summary.total === 1 ? 'review' : 'reviews'}` : 'Community reviews'}</strong><span>{data.summary.total ? 'From people who used this app' : 'Be the first to share a verified experience'}</span></div>
            <label className="reviews-sort"><span className="sr-only">Sort reviews</span><select value={sort} onChange={(event) => setSort(event.target.value as 'helpful' | 'newest')}><option value="helpful">Most helpful</option><option value="newest">Newest first</option></select><ChevronDown /></label>
          </div>

          <div className="reviews-list">
            {data.reviews.map((review) => (
              <article className="review-card" key={review.id}>
                <header><div className="review-avatar">{initials(review.userName)}</div><div><strong>{review.userName}</strong><span><BadgeCheck /> Verified use · {reviewDate(review.createdAt)}</span></div><StarRow rating={review.rating} /></header>
                <div className="review-card__body"><h3>{review.title}</h3><p>{review.body}</p>{review.updatedAt !== review.createdAt && <small>Edited {reviewDate(review.updatedAt)}</small>}</div>
                {review.publisherReply && <div className="publisher-response"><div><MessageCircle /><strong>Publisher response</strong><span>{review.publisherRepliedAt ? reviewDate(review.publisherRepliedAt) : ''}</span></div><p>{review.publisherReply}</p></div>}
                <footer>
                  <button type="button" className={review.helpfulByViewer ? 'is-active' : ''} onClick={() => void voteHelpful(review)} disabled={review.isOwn}><ThumbsUp fill={review.helpfulByViewer ? 'currentColor' : 'none'} /> Helpful{review.helpfulCount ? ` · ${review.helpfulCount}` : ''}</button>
                  {data.eligibility.canRespond && <button type="button" onClick={() => setReplying(review)}><MessageCircle /> {review.publisherReply ? 'Edit response' : 'Respond'}</button>}
                  {user && !review.isOwn && <button type="button" onClick={() => setReporting(review)}><Flag /> Report</button>}
                </footer>
              </article>
            ))}
            {!data.reviews.length && <div className="reviews-empty"><span><Star /></span><h3>No reviews yet</h3><p>Verified ratings will appear here without made-up sample feedback.</p></div>}
          </div>
        </>
      )}
      {reporting && <ReportDialog review={reporting} close={() => setReporting(null)} done={() => { setReporting(null); notify('Report sent to the moderation team') }} />}
      {replying && <ReplyDialog review={replying} close={() => setReplying(null)} done={() => { setReplying(null); void load(true) }} />}
    </section>
  )
}

function RatingSummary({ data }: { data: AppReviewsResponse }) {
  return <article className="rating-summary"><div className="rating-summary__score"><strong>{data.summary.total ? data.summary.average.toFixed(1) : '—'}</strong><StarRow rating={Math.round(data.summary.average)} /><span>{data.summary.total ? `${data.summary.total} verified` : 'Not rated yet'}</span></div><div className="rating-breakdown">{[5, 4, 3, 2, 1].map((rating) => { const count = data.summary.breakdown[String(rating) as '1' | '2' | '3' | '4' | '5']; const width = data.summary.total ? count / data.summary.total * 100 : 0; return <div key={rating}><span>{rating}<Star /></span><i><b style={{ width: `${width}%` }} /></i><small>{count}</small></div> })}</div></article>
}

function ReviewInvitation({ eligibility, writing, setWriting, signIn }: { eligibility: AppReviewsResponse['eligibility']; writing: boolean; setWriting: (value: boolean) => void; signIn: () => void }) {
  const content = {
    eligible: ['Your experience is verified', eligibility.existingReview ? 'You can update your review whenever your experience changes.' : 'Help others decide whether this app fits their day.'],
    sign_in: ['Share your experience', 'Sign in with an approved account after using the app to write a review.'],
    approval_required: ['Account access required', 'Email verification and Administrator approval are required before reviewing.'],
    use_required: ['Use the app first', 'Download or open this app once, then come back to leave a verified review.'],
    owner: ['This is your app', 'Publisher responses are available on every published review.'],
    moderated: ['Review hidden by moderation', 'Your review cannot be edited while it is hidden.'],
  }[eligibility.reason]
  return <article className="review-invitation"><span className="review-invitation__icon">{eligibility.hasVerifiedUse ? <BadgeCheck /> : <PenLine />}</span><div><p className="section-kicker">{eligibility.hasVerifiedUse ? 'Verified use' : 'Community standard'}</p><h3>{content[0]}</h3><p>{content[1]}</p></div>{eligibility.canReview && <button type="button" className="button button--primary" onClick={() => setWriting(!writing)}>{writing ? <X /> : <PenLine />}{writing ? 'Close editor' : eligibility.existingReview ? 'Edit your review' : 'Write a review'}</button>}{eligibility.reason === 'sign_in' && <button type="button" className="button button--primary" onClick={signIn}>Sign in to review</button>}</article>
}

function ReviewEditor({ app, existing, cancel, saved, removed }: { app: StoreApp; existing: AppReview | null; cancel: () => void; saved: (review: AppReview, created: boolean) => void; removed: () => void }) {
  const [rating, setRating] = useState(existing?.rating ?? 0)
  const [title, setTitle] = useState(existing?.title ?? '')
  const [body, setBody] = useState(existing?.body ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const response = await fetch(`/api/apps/${encodeURIComponent(app.id)}/reviews`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rating, title, body }) })
      if (!response.ok) throw new Error(await getResponseError(response))
      saved(await response.json() as AppReview, !existing)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Your review could not be saved.') }
    finally { setBusy(false) }
  }
  const remove = async () => {
    if (!existing) return
    setBusy(true); setError('')
    try {
      const response = await fetch(`/api/reviews/${existing.id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error(await getResponseError(response))
      removed()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Your review could not be removed.') }
    finally { setBusy(false) }
  }
  return <form className="review-editor" onSubmit={submit}><div className="review-editor__heading"><div><p className="section-kicker">{existing ? 'Update your perspective' : 'Your verified experience'}</p><h3>{existing ? 'Edit your review' : `Review ${app.name}`}</h3></div>{existing && <button type="button" className="review-delete" onClick={() => setConfirmDelete(true)}><Trash2 /> Remove review</button>}</div><fieldset><legend>Your rating</legend><div className="star-picker">{[1, 2, 3, 4, 5].map((value) => <button type="button" key={value} className={value <= rating ? 'is-active' : ''} onClick={() => setRating(value)} aria-label={`${value} star${value === 1 ? '' : 's'}`} aria-pressed={value === rating}><Star fill={value <= rating ? 'currentColor' : 'none'} /></button>)}</div></fieldset><label><span>Review title <small>{title.length}/80</small></span><input value={title} onChange={(event) => setTitle(event.target.value.slice(0, 80))} placeholder="Sum it up in a few words" minLength={3} required /></label><label><span>Your review <small>{body.length}/2,000</small></span><textarea rows={6} value={body} onChange={(event) => setBody(event.target.value.slice(0, 2000))} placeholder="What worked well? What should others know?" minLength={20} required /></label>{error && <div className="reviews-error"><AlertTriangle /><span>{error}</span></div>}<div className="review-editor__actions"><button type="button" className="button button--secondary" onClick={cancel}>Cancel</button><button type="submit" className="button button--primary" disabled={busy || !rating || title.trim().length < 3 || body.trim().length < 20}>{busy ? <LoaderCircle className="spin" /> : <Check />}{busy ? 'Publishing…' : existing ? 'Save changes' : 'Publish review'}</button></div>{confirmDelete && <div className="review-confirm"><AlertTriangle /><div><strong>Remove your review?</strong><p>Your rating, written review, helpful votes, and Publisher response will be permanently removed.</p></div><button type="button" className="button button--secondary" onClick={() => setConfirmDelete(false)}>Keep it</button><button type="button" className="button button--danger" onClick={() => void remove()} disabled={busy}>Remove</button></div>}</form>
}

function ReportDialog({ review, close, done }: { review: AppReview; close: () => void; done: () => void }) {
  const [reason, setReason] = useState('spam')
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const response = await fetch(`/api/reviews/${review.id}/reports`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason, details }) })
      if (!response.ok) throw new Error(await getResponseError(response))
      done()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The report could not be sent.') }
    finally { setBusy(false) }
  }
  return createPortal(<div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}><form className="review-dialog" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="report-title"><button type="button" className="auth-close" onClick={close} aria-label="Close report dialog"><X /></button><span className="review-dialog__icon"><Flag /></span><h2 id="report-title">Report this review</h2><p>Reports are private and reviewed by an Administrator. They never remove content automatically.</p><label><span>Reason</span><span className="dialog-select"><select value={reason} onChange={(event) => setReason(event.target.value)}><option value="spam">Spam or promotion</option><option value="abuse">Abusive or hateful content</option><option value="conflict">Conflict of interest</option><option value="other">Something else</option></select><ChevronDown /></span></label><label><span>Details {reason === 'other' ? '· Required' : '· Optional'}</span><textarea rows={4} maxLength={500} value={details} onChange={(event) => setDetails(event.target.value)} placeholder="Help the moderation team understand the issue…" /></label>{error && <div className="reviews-error"><AlertTriangle /><span>{error}</span></div>}<div className="review-dialog__actions"><button type="button" className="button button--secondary" onClick={close}>Cancel</button><button type="submit" className="button button--primary" disabled={busy || (reason === 'other' && details.trim().length < 5)}>{busy ? <LoaderCircle className="spin" /> : <Flag />} Send report</button></div></form></div>, document.body)
}

function ReplyDialog({ review, close, done }: { review: AppReview; close: () => void; done: () => void }) {
  const [reply, setReply] = useState(review.publisherReply ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const response = await fetch(`/api/reviews/${review.id}/reply`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reply }) })
      if (!response.ok) throw new Error(await getResponseError(response))
      done()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The response could not be saved.') }
    finally { setBusy(false) }
  }
  return createPortal(<div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}><form className="review-dialog" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="reply-title"><button type="button" className="auth-close" onClick={close} aria-label="Close response dialog"><X /></button><span className="review-dialog__icon"><MessageCircle /></span><h2 id="reply-title">Respond as the Publisher</h2><p>Your response appears publicly below {review.userName}’s review.</p><label><span>Publisher response <small>{reply.length}/1,000</small></span><textarea rows={6} maxLength={1000} value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Thank them, clarify details, or share what changed…" autoFocus /></label>{error && <div className="reviews-error"><AlertTriangle /><span>{error}</span></div>}<div className="review-dialog__actions">{review.publisherReply && <button type="button" className="button button--danger" onClick={() => setReply('')}>Remove response</button>}<button type="button" className="button button--secondary" onClick={close}>Cancel</button><button type="submit" className="button button--primary" disabled={busy || (reply.length > 0 && reply.trim().length < 2)}>{busy ? <LoaderCircle className="spin" /> : <Check />} Save response</button></div></form></div>, document.body)
}

function StarRow({ rating }: { rating: number }) {
  return <span className="star-row" aria-label={`${rating} out of 5 stars`}>{[1, 2, 3, 4, 5].map((value) => <Star key={value} fill={value <= rating ? 'currentColor' : 'none'} />)}</span>
}

function ReviewsSkeleton() {
  return <div className="reviews-skeleton" aria-label="Loading reviews"><div /><div /><div /></div>
}
