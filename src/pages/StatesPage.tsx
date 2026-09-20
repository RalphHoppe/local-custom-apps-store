import { ArrowLeft, Bell, CheckCircle2, CloudOff, Info, TriangleAlert } from 'lucide-react'
import { Link } from 'react-router-dom'
import { AppCardSkeleton, EmptyState, ErrorState } from '../components/StoreStates'
import { useStore } from '../store/StoreContext'

export function StatesPage() {
  const { notify } = useStore()
  return (
    <div className="page states-page">
      <Link to="/" className="back-link"><ArrowLeft size={17} /> Back to discover</Link>
      <section className="page-title-row">
        <div><p className="eyebrow">Interface state library</p><h1>Every moment, considered.</h1><p>A quiet reference for the states people may see while using the store.</p></div>
      </section>

      <section className="state-showcase">
        <div className="state-showcase__heading"><span>01</span><div><h2>Loading</h2><p>Content keeps its shape so the page never jumps.</p></div></div>
        <div className="state-frame"><AppCardSkeleton count={2} /></div>
      </section>

      <section className="state-showcase">
        <div className="state-showcase__heading"><span>02</span><div><h2>Empty</h2><p>A useful next step instead of a dead end.</p></div></div>
        <div className="state-frame"><EmptyState kind="favorites" action={<button className="button button--primary" type="button">Explore apps</button>} /></div>
      </section>

      <section className="state-showcase">
        <div className="state-showcase__heading"><span>03</span><div><h2>Error & offline</h2><p>Plain language, a clear recovery, and no blame.</p></div></div>
        <div className="state-frame state-frame--split">
          <ErrorState compact retry={() => notify('Trying the catalog again…', 'info')} />
          <div className="offline-state"><div className="state-icon"><CloudOff /></div><h3>You’re offline</h3><p>Saved apps remain available until you reconnect.</p><span><i /> Waiting for connection</span></div>
        </div>
      </section>

      <section className="state-showcase">
        <div className="state-showcase__heading"><span>04</span><div><h2>Feedback</h2><p>Small confirmations that stay out of the way.</p></div></div>
        <div className="state-frame notification-demo">
          <button type="button" className="button button--secondary" onClick={() => notify('Saved to favorites')}><CheckCircle2 size={17} /> Success toast</button>
          <button type="button" className="button button--secondary" onClick={() => notify('Opening web app', 'info')}><Info size={17} /> Info toast</button>
          <button type="button" className="button button--secondary" onClick={() => notify('The download is not available yet.', 'error')}><TriangleAlert size={17} /> Error toast</button>
          <button type="button" className="button button--secondary" onClick={() => notify('You’re all caught up.', 'info')}><Bell size={17} /> Neutral notice</button>
        </div>
      </section>
    </div>
  )
}
