import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

function formatAdaShort(lovelace) {
  if (lovelace == null) return '—'
  const ada = Number(lovelace) / 1_000_000
  if (!Number.isFinite(ada)) return '—'
  if (ada >= 1e9) return (ada / 1e9).toFixed(2) + 'B ₳'
  if (ada >= 1e6) return (ada / 1e6).toFixed(1) + 'M ₳'
  if (ada >= 1e3) return (ada / 1e3).toFixed(0) + 'K ₳'
  return ada.toFixed(0) + ' ₳'
}

function formatAda(lovelace) {
  if (lovelace == null) return '—'
  const ada = Number(lovelace) / 1_000_000
  if (!Number.isFinite(ada)) return '—'
  return ada.toLocaleString(undefined, { maximumFractionDigits: 0 }) + ' ₳'
}

function clamp01(x) {
  const n = Number(x)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(1, n))
}

function Badge({ children, tone = 'neutral' }) {
  const tones = {
    neutral: { bg: 'var(--panel)', b: 'var(--border)' },
    good: { bg: 'rgba(46,213,115,0.12)', b: 'rgba(46,213,115,0.25)' },
    warn: { bg: 'rgba(255,165,2,0.12)', b: 'rgba(255,165,2,0.25)' },
    bad: { bg: 'rgba(255,71,87,0.14)', b: 'rgba(255,71,87,0.30)' },
    info: { bg: 'rgba(83,82,237,0.14)', b: 'rgba(83,82,237,0.30)' }
  }
  const t = tones[tone] || tones.neutral
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '2px 10px',
        borderRadius: 999,
        border: `1px solid ${t.b}`,
        background: t.bg,
        color: 'var(--text)',
        fontSize: 12,
        lineHeight: '20px',
        whiteSpace: 'nowrap'
      }}
    >
      {children}
    </span>
  )
}

function AnimNum({ value, suffix = '' }) {
  const [display, setDisplay] = useState(0)
  const raf = useRef(null)

  useEffect(() => {
    let start = null
    const from = display
    const to = Number(value) || 0
    const dur = 800
    const step = ts => {
      if (!start) start = ts
      const p = Math.min((ts - start) / dur, 1)
      const ease = 1 - Math.pow(1 - p, 3)
      setDisplay(Math.round(from + (to - from) * ease))
      if (p < 1) raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
    return () => raf.current && cancelAnimationFrame(raf.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return (
    <>
      {display.toLocaleString()}
      {suffix}
    </>
  )
}

function SatBar({ ratio }) {
  const pct = clamp01(ratio) * 100
  const color = pct >= 100 ? '#ff4757' : pct >= 95 ? '#ffa502' : pct >= 80 ? '#2ed573' : '#5352ed'
  return (
    <div style={{ width: '100%', height: 8, borderRadius: 8, background: 'var(--panel)', overflow: 'hidden', border: '1px solid var(--border)' }}>
      <div
        style={{
          width: `${Math.min(pct, 100)}%`,
          height: '100%',
          background: `linear-gradient(90deg, ${color}88, ${color})`,
          transition: 'width 0.5s cubic-bezier(.4,0,.2,1)'
        }}
      />
    </div>
  )
}

function externalLinks(poolId) {
  const id = poolId
  return {
    cexplorer: `https://cexplorer.io/pool/${encodeURIComponent(id)}`,
    poolpm: `https://pool.pm/${encodeURIComponent(id)}`
  }
}

function Modal({ title, onClose, children }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        zIndex: 50,
        padding: 18,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(860px, 96vw)',
          maxHeight: '86vh',
          overflow: 'auto',
          borderRadius: 18,
          border: '1px solid var(--border)',
          background: 'var(--bg)',
          color: 'var(--text)',
          boxShadow: '0 18px 70px rgba(0,0,0,0.45)'
        }}
      >
        <div style={{ padding: 16, borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ fontWeight: 900 }}>{title}</div>
          <button
            onClick={onClose}
            style={{
              border: '1px solid var(--border)',
              background: 'var(--panel)',
              color: 'var(--text)',
              borderRadius: 12,
              padding: '6px 10px',
              cursor: 'pointer'
            }}
          >
            Close
          </button>
        </div>
        <div style={{ padding: 16 }}>{children}</div>
      </div>
    </div>
  )
}

function Drawer({ open, onClose, children }) {
  if (!open) return null
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        zIndex: 40
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          height: '100%',
          width: 'min(420px, 92vw)',
          borderLeft: '1px solid var(--border)',
          background: 'var(--bg)',
          padding: 16,
          overflow: 'auto'
        }}
      >
        {children}
      </div>
    </div>
  )
}

export default function App() {
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)

  // View state: clean two-screen layout
  const [view, setView] = useState('intro1') // intro1 | intro2 | results
  const [goal, setGoal] = useState(null) // 'max' | 'decentralize'

  // UI state
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark')
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState(null)
  const [showFilters, setShowFilters] = useState(false)
  const [showHow, setShowHow] = useState(false)

  // Filters (user-controlled; nothing is hidden by default unless a path sets it)
  const [hideMpo, setHideMpo] = useState(false)
  const [hideNearSat, setHideNearSat] = useState(false)
  const [hideTooSmall, setHideTooSmall] = useState(false)
  const [maxMargin, setMaxMargin] = useState(5)
  const [minCost, setMinCost] = useState('any')

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('theme', theme)
  }, [theme])

  useEffect(() => {
    const base = import.meta.env.BASE_URL || '/'
    fetch(`${base}data/latest.json`, { cache: 'no-store' })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(setData)
      .catch(e => setErr(e.message || String(e)))
  }, [])

  const pools = data?.pools || []
  const ns = data?.network_summary

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return pools
      .filter(p => {
        if (hideMpo && p.flags?.is_mpo) return false
        if (hideNearSat && (p.flags?.is_saturated || p.flags?.is_near_saturated)) return false
        if (hideTooSmall && p.flags?.under_1_block_expected) return false

        const marginPct = (Number(p.margin) || 0) * 100
        if (marginPct > maxMargin) return false

        const costAda = (Number(p.fixed_cost_lovelace) || 0) / 1_000_000
        if (minCost === '170' && Math.round(costAda) !== 170) return false
        if (minCost === '340' && Math.round(costAda) !== 340) return false

        if (!s) return true
        return [p.ticker, p.name, p.pool_id_bech32].some(v => (v || '').toLowerCase().includes(s))
      })
      .slice(0, 1200)
  }, [pools, q, hideMpo, hideNearSat, hideTooSmall, maxMargin, minCost])

  const counts = useMemo(() => {
    const totalKnown = pools.length
    let mpo = 0
    let sat = 0
    let small = 0
    for (const p of pools) {
      if (p.flags?.is_mpo) mpo++
      if (p.flags?.is_saturated || p.flags?.is_near_saturated) sat++
      if (p.flags?.under_1_block_expected) small++
    }
    return { totalKnown, mpo, sat, small }
  }, [pools])

  function applyGoal(nextGoal) {
    setGoal(nextGoal)
    // Reset to neutral before the fee-step applies a specific preference
    setHideNearSat(true)
    setHideTooSmall(true)
    // Goal effects
    if (nextGoal === 'decentralize') setHideMpo(true)
    else setHideMpo(false)

    setView('intro2')
  }

  function applyFeePreference(pref) {
    // pref: 'percent' | 'fixed'
    // Percent: prefer low margin (keep fixed cost any)
    if (pref === 'percent') {
      setMaxMargin(1)
      setMinCost('any')
    }
    // Fixed: prefer minimum fixed fee (170) (keep margin moderate)
    if (pref === 'fixed') {
      setMinCost('170')
      setMaxMargin(5)
    }

    setView('results')
  }

  return (
    <div style={{ minHeight: '100vh', color: 'var(--text)' }}>
      {/* subtle background */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 0,
          opacity: theme === 'dark' ? 0.06 : 0.05,
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)",
          backgroundSize: '70px 70px',
          pointerEvents: 'none'
        }}
      />
      <div
        style={{
          position: 'fixed',
          top: -220,
          right: -220,
          width: 620,
          height: 620,
          zIndex: 0,
          background: 'radial-gradient(circle, rgba(83,82,237,0.18) 0%, transparent 70%)',
          filter: 'blur(50px)',
          pointerEvents: 'none'
        }}
      />
      <div
        style={{
          position: 'fixed',
          bottom: -320,
          left: -160,
          width: 820,
          height: 820,
          zIndex: 0,
          background: 'radial-gradient(circle, rgba(46,213,115,0.14) 0%, transparent 70%)',
          filter: 'blur(65px)',
          pointerEvents: 'none'
        }}
      />

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 1200, margin: '0 auto', padding: 22 }}>
        {/* HEADER */}
        <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center', padding: '10px 0 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                background: 'linear-gradient(135deg, #5352ed, #2ed573)',
                boxShadow: '0 0 22px rgba(83,82,237,0.22)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 900,
                color: 'white'
              }}
            >
              P
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: '-0.02em' }}>How to find a Cardano SPO</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Community explorer (db-sync + metadata). Flags warn; you decide.</div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            {ns && <Badge tone="info">Epoch {ns.epoch_no}</Badge>}
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              style={{
                padding: '8px 12px',
                borderRadius: 12,
                border: '1px solid var(--border)',
                background: 'var(--panel)',
                color: 'var(--text)',
                cursor: 'pointer'
              }}
            >
              Theme: {theme}
            </button>
          </div>
        </header>

        {err && (
          <div style={{ marginTop: 10, padding: 12, border: '1px solid rgba(255,80,80,0.5)', borderRadius: 12 }}>
            Couldn’t load snapshot: {err}
          </div>
        )}

        {!data && !err && <div style={{ marginTop: 14, opacity: 0.85 }}>Loading latest snapshot…</div>}

        {data && view === 'intro1' && (
          <section style={{ marginTop: 14, border: '1px solid var(--border)', background: 'var(--panel2)', borderRadius: 18, padding: 18 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 950, letterSpacing: '-0.02em' }}>Step 1 — Choose your goal</div>
                <div style={{ marginTop: 8, color: 'var(--muted)', lineHeight: 1.55 }}>
                  Quick setup. You can always change filters later.
                </div>
              </div>
              <button
                onClick={() => setShowHow(true)}
                style={{ border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)', borderRadius: 12, padding: '8px 10px', cursor: 'pointer' }}
              >
                How this works
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, marginTop: 16 }}>
              <button
                onClick={() => applyGoal('max')}
                style={{ textAlign: 'left', border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)', borderRadius: 18, padding: 16, cursor: 'pointer' }}
              >
                <div style={{ fontWeight: 950, fontSize: 16 }}>Max rewards</div>
                <div style={{ marginTop: 8, color: 'var(--muted)', lineHeight: 1.5 }}>
                  Shows everything. Flags warn you.
                  <br />
                  <b>Can actively worsen decentralization</b> via concentration.
                </div>
              </button>

              <button
                onClick={() => applyGoal('decentralize')}
                style={{ textAlign: 'left', border: '1px solid rgba(46,213,115,0.32)', background: 'rgba(46,213,115,0.10)', color: 'var(--text)', borderRadius: 18, padding: 16, cursor: 'pointer' }}
              >
                <div style={{ fontWeight: 950, fontSize: 16 }}>Help decentralization</div>
                <div style={{ marginTop: 8, color: 'var(--muted)', lineHeight: 1.5 }}>
                  Prefer single operators, avoid MPO concentration.
                </div>
              </button>
            </div>

            <div style={{ marginTop: 14, display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ color: 'var(--muted)', fontSize: 12 }}>
                Snapshot: epoch {ns?.epoch_no} • saturation ≈ {formatAdaShort(ns?.saturation_cap_lovelace)} • ~1 block/epoch ≈ {formatAdaShort(ns?.stake_for_1_block_expected_lovelace)}
              </div>
              <button
                onClick={() => setView('results')}
                style={{ border: 'none', background: 'transparent', color: 'var(--link)', cursor: 'pointer', padding: 0, fontSize: 12 }}
              >
                Skip → browse all pools
              </button>
            </div>
          </section>
        )}

        {data && view === 'intro2' && (
          <section style={{ marginTop: 14, border: '1px solid var(--border)', background: 'var(--panel2)', borderRadius: 18, padding: 18 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 950, letterSpacing: '-0.02em' }}>Step 2 — Choose a fee preference</div>
                <div style={{ marginTop: 8, color: 'var(--muted)', lineHeight: 1.55 }}>
                  Goal: <b style={{ color: 'var(--text)' }}>{goal === 'decentralize' ? 'Help decentralization' : 'Max rewards'}</b>
                </div>
              </div>
              <button
                onClick={() => setView('intro1')}
                style={{ border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)', borderRadius: 12, padding: '8px 10px', cursor: 'pointer' }}
              >
                ← Back
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, marginTop: 16 }}>
              <button
                onClick={() => applyFeePreference('percent')}
                style={{ textAlign: 'left', border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)', borderRadius: 18, padding: 16, cursor: 'pointer' }}
              >
                <div style={{ fontWeight: 950, fontSize: 16 }}>% margin (low)</div>
                <div style={{ marginTop: 8, color: 'var(--muted)', lineHeight: 1.5 }}>
                  Starts with <b>max margin = 1%</b>.
                </div>
              </button>

              <button
                onClick={() => applyFeePreference('fixed')}
                style={{ textAlign: 'left', border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)', borderRadius: 18, padding: 16, cursor: 'pointer' }}
              >
                <div style={{ fontWeight: 950, fontSize: 16 }}>Fixed fee (min)</div>
                <div style={{ marginTop: 8, color: 'var(--muted)', lineHeight: 1.5 }}>
                  Starts with <b>fixed fee = 170 ₳</b>.
                </div>
              </button>
            </div>

            <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setView('results')}
                style={{ border: 'none', background: 'transparent', color: 'var(--link)', cursor: 'pointer', padding: 0, fontSize: 12 }}
              >
                Skip → browse all pools
              </button>
            </div>
          </section>
        )}

        {data && view === 'results' && (
          <>
            {/* Top bar: back + search + filters */}
            <section style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'stretch', flexWrap: 'wrap' }}>
              <button
                onClick={() => {
                  setView('intro')
                  setShowFilters(false)
                  setSelected(null)
                }}
                style={{
                  padding: '10px 14px',
                  borderRadius: 14,
                  border: '1px solid var(--border)',
                  background: 'var(--panel)',
                  color: 'var(--text)',
                  cursor: 'pointer'
                }}
              >
                ← Preferences
              </button>

              <div
                style={{
                  flex: 1,
                  minWidth: 300,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 12px',
                  borderRadius: 14,
                  border: '1px solid var(--border)',
                  background: 'var(--panel)'
                }}
              >
                <span style={{ opacity: 0.7 }}>⌕</span>
                <input
                  value={q}
                  onChange={e => setQ(e.target.value)}
                  placeholder="Search ticker, name, or pool id…"
                  style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', color: 'var(--text)' }}
                />
                {q && (
                  <button onClick={() => setQ('')} style={{ border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer' }}>
                    ✕
                  </button>
                )}
              </div>

              <button
                onClick={() => setShowFilters(true)}
                style={{
                  padding: '10px 14px',
                  borderRadius: 14,
                  border: '1px solid var(--border)',
                  background: 'var(--panel)',
                  color: 'var(--text)',
                  cursor: 'pointer'
                }}
              >
                ⚙ Filters
                <span style={{ marginLeft: 8, opacity: 0.8, fontSize: 12 }}>
                  ({[hideMpo, hideNearSat, hideTooSmall].filter(Boolean).length})
                </span>
              </button>

              <button
                onClick={() => setShowHow(true)}
                style={{
                  padding: '10px 14px',
                  borderRadius: 14,
                  border: '1px solid var(--border)',
                  background: 'var(--panel)',
                  color: 'var(--text)',
                  cursor: 'pointer'
                }}
              >
                ?
              </button>
            </section>

            {/* Small stat strip */}
            <section style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <Badge tone="neutral">Showing {filtered.length.toLocaleString()} pools</Badge>
              <Badge tone="info">Active pools (delegated): {ns?.active_pools?.toLocaleString?.() ?? '—'}</Badge>
              <Badge tone="neutral">Saturation cap: {formatAdaShort(ns?.saturation_cap_lovelace)}</Badge>
              <Badge tone="neutral">MPO stake: {Math.round(ns?.mpo_stake_pct ?? 0)}%</Badge>
            </section>

            {/* Table */}
            <section style={{ marginTop: 14, border: '1px solid var(--border)', background: 'var(--panel2)', borderRadius: 18, overflow: 'hidden' }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '90px 1.6fr 1.1fr 0.7fr 1.3fr 90px',
                  gap: 12,
                  padding: '12px 16px',
                  borderBottom: '1px solid var(--border)',
                  fontSize: 11,
                  color: 'var(--muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em'
                }}
              >
                <div>Ticker</div>
                <div>Pool</div>
                <div>Stake</div>
                <div>Margin</div>
                <div>Saturation</div>
                <div style={{ textAlign: 'right' }}>Info</div>
              </div>

              {filtered.map(p => {
                const marginPct = ((Number(p.margin) || 0) * 100).toFixed(1)
                const satPct = (clamp01(p.saturation_ratio) * 100).toFixed(1)

                const rowTone = p.flags?.is_saturated
                  ? 'bad'
                  : p.flags?.is_near_saturated
                    ? 'warn'
                    : p.flags?.is_mpo
                      ? 'info'
                      : 'neutral'

                return (
                  <div key={p.pool_id_bech32}>
                    <div
                      onClick={() => setSelected(sel => (sel === p.pool_id_bech32 ? null : p.pool_id_bech32))}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '90px 1.6fr 1.1fr 0.7fr 1.3fr 90px',
                        gap: 12,
                        padding: '14px 16px',
                        borderBottom: '1px solid rgba(255,255,255,0.06)',
                        cursor: 'pointer',
                        background: selected === p.pool_id_bech32 ? 'rgba(83,82,237,0.10)' : 'transparent'
                      }}
                    >
                      <div style={{ fontWeight: 900, letterSpacing: '0.02em' }}>{p.ticker || '—'}</div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 750 }}>{p.name || '—'}</span>
                          {p.flags?.is_mpo ? <Badge tone="bad">MPO</Badge> : <Badge tone="good">SINGLE</Badge>}
                          {p.flags?.is_saturated ? <Badge tone="bad">SAT</Badge> : null}
                          {!p.flags?.is_saturated && p.flags?.is_near_saturated ? <Badge tone="warn">NEAR</Badge> : null}
                          {p.flags?.under_1_block_expected ? <Badge tone="neutral">VAR</Badge> : null}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                          {p.homepage ? (
                            <a href={p.homepage} target="_blank" rel="noreferrer" style={{ color: 'var(--link)', textDecoration: 'none' }}>
                              {p.homepage.replace(/^https?:\/\//, '')}
                            </a>
                          ) : (
                            <span style={{ opacity: 0.7 }}>No website listed</span>
                          )}
                          <span style={{ opacity: 0.65 }}>•</span>
                          <span style={{ opacity: 0.85 }}>{p.pool_id_bech32}</span>
                        </div>
                      </div>

                      <div style={{ fontWeight: 650 }}>{formatAdaShort(p.active_stake_lovelace)}</div>

                      <div>
                        <Badge tone={Number(marginPct) <= 1 ? 'good' : Number(marginPct) <= 3 ? 'neutral' : 'warn'}>
                          {marginPct}%
                        </Badge>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{satPct}%</span>
                          <Badge tone={rowTone}>{p.flags?.is_saturated ? 'tapering' : p.flags?.is_near_saturated ? 'near cap' : 'ok'}</Badge>
                        </div>
                        <SatBar ratio={p.saturation_ratio} />
                      </div>

                      <div style={{ textAlign: 'right', color: 'var(--muted)' }}>{selected === p.pool_id_bech32 ? '▴' : '▾'}</div>
                    </div>

                    {selected === p.pool_id_bech32 && (
                      <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                          <div style={{ border: '1px solid var(--border)', borderRadius: 14, padding: 12, background: 'var(--panel2)' }}>
                            <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                              Details
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                              <span style={{ color: 'var(--muted)' }}>Pledge</span>
                              <span>{formatAda(p.pledge_lovelace)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                              <span style={{ color: 'var(--muted)' }}>Fixed fee</span>
                              <span>{formatAda(p.fixed_cost_lovelace)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                              <span style={{ color: 'var(--muted)' }}>Margin</span>
                              <span>{marginPct}%</span>
                            </div>
                          </div>

                          <div style={{ border: '1px solid var(--border)', borderRadius: 14, padding: 12, background: 'var(--panel2)' }}>
                            <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                              Warnings
                            </div>
                            <div style={{ color: 'var(--muted)', lineHeight: 1.5 }}>
                              {p.flags?.is_mpo ? (
                                <>
                                  <b>Flagged MPO:</b> this pool is inferred as part of a multi-pool operator. Choosing it can increase stake concentration.
                                </>
                              ) : (
                                <>
                                  <b>Single operator:</b> no MPO evidence found in current snapshot.
                                </>
                              )}
                              {p.flags?.under_1_block_expected ? (
                                <>
                                  <br />
                                  <br />
                                  <b>Variance:</b> under ~1 expected block/epoch.
                                </>
                              ) : null}
                            </div>
                            <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                              {p.mpo?.evidence?.slice?.(0, 4)?.map((e, i) => (
                                <Badge key={i} tone="info">
                                  {e.type}
                                </Badge>
                              ))}
                              {!p.mpo?.evidence?.length && <span style={{ color: 'var(--muted)' }}>No MPO evidence.</span>}
                            </div>
                          </div>

                          <div style={{ border: '1px solid var(--border)', borderRadius: 14, padding: 12, background: 'var(--panel2)' }}>
                            <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                              Links
                            </div>
                            {(() => {
                              const links = externalLinks(p.pool_id_bech32)
                              return (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                  <a href={links.cexplorer} target="_blank" rel="noreferrer" style={{ color: 'var(--link)', textDecoration: 'none' }}>
                                    View on CExplorer →
                                  </a>
                                  <a href={links.poolpm} target="_blank" rel="noreferrer" style={{ color: 'var(--link)', textDecoration: 'none' }}>
                                    View on pool.pm →
                                  </a>
                                  {p.homepage ? (
                                    <a href={p.homepage} target="_blank" rel="noreferrer" style={{ color: 'var(--link)', textDecoration: 'none' }}>
                                      Pool website →
                                    </a>
                                  ) : null}
                                  {p.metadata_url ? (
                                    <a href={p.metadata_url} target="_blank" rel="noreferrer" style={{ color: 'var(--link)', textDecoration: 'none' }}>
                                      Raw metadata →
                                    </a>
                                  ) : null}
                                </div>
                              )
                            })()}
                          </div>
                        </div>

                        {p.description ? (
                          <div style={{ marginTop: 12, color: 'var(--muted)', lineHeight: 1.55 }}>
                            <b style={{ color: 'var(--text)' }}>Description:</b> {p.description}
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                )
              })}
            </section>
          </>
        )}

        {/* How it works modal (tucked away) */}
        {showHow && (
          <Modal title="How it works" onClose={() => setShowHow(false)}>
            <div style={{ lineHeight: 1.6, color: 'var(--muted)' }}>
              <p style={{ marginTop: 0 }}>
                Cardano has an “optimal pool count” parameter <b>k</b>. Roughly, <b>network stake / k</b> gives the <b>saturation cap</b>. Above that cap, rewards <b>taper</b>.
              </p>
              <p>
                A pool’s expected blocks per epoch scales with stake. A rough rule of thumb is ~<b>{formatAda(ns?.stake_for_1_block_expected_lovelace)}</b> active stake for <b>~1 block expected/epoch</b>.
                Below that, rewards can be spiky (variance).
              </p>
              <p style={{ marginBottom: 0 }}>
                MPO flags are best-effort inference using db-sync evidence (owners/reward accounts/relays). We show evidence types; you decide.
              </p>
            </div>
            <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Badge tone="info">k={ns?.k_optimal_pool_count ?? '—'}</Badge>
              <Badge tone="neutral">Saturation cap: {formatAda(ns?.saturation_cap_lovelace)}</Badge>
              <Badge tone="neutral">Blocks/epoch ≈ {ns?.blocks_per_epoch ?? '—'}</Badge>
            </div>
          </Modal>
        )}

        {/* Filters drawer */}
        <Drawer open={showFilters} onClose={() => setShowFilters(false)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
            <div style={{ fontWeight: 950, fontSize: 16 }}>Filters</div>
            <button
              onClick={() => setShowFilters(false)}
              style={{ border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)', borderRadius: 12, padding: '6px 10px', cursor: 'pointer' }}
            >
              Done
            </button>
          </div>

          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input type="checkbox" checked={hideMpo} onChange={e => setHideMpo(e.target.checked)} />
              Hide MPO pools
            </label>
            <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input type="checkbox" checked={hideNearSat} onChange={e => setHideNearSat(e.target.checked)} />
              Hide near-saturated pools
            </label>
            <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input type="checkbox" checked={hideTooSmall} onChange={e => setHideTooSmall(e.target.checked)} />
              Hide &lt; 1 expected block/epoch
            </label>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
              <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 8 }}>Max margin: <b style={{ color: 'var(--text)' }}>{maxMargin}%</b></div>
              <input type="range" min={0} max={10} step={0.5} value={maxMargin} onChange={e => setMaxMargin(Number(e.target.value))} style={{ width: '100%' }} />
            </div>

            <div>
              <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 8 }}>Fixed fee</div>
              <select value={minCost} onChange={e => setMinCost(e.target.value)} style={{ width: '100%', padding: '10px 10px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)' }}>
                <option value="any">Any</option>
                <option value="170">170 ₳</option>
                <option value="340">340 ₳</option>
              </select>
            </div>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Badge tone="info">Flagged MPO: {counts.mpo.toLocaleString()}</Badge>
              <Badge tone="warn">Near/sat: {counts.sat.toLocaleString()}</Badge>
              <Badge tone="neutral">Variance: {counts.small.toLocaleString()}</Badge>
            </div>

            <button
              onClick={() => {
                setHideMpo(false)
                setHideNearSat(false)
                setHideTooSmall(false)
                setMaxMargin(5)
                setMinCost('any')
              }}
              style={{
                marginTop: 6,
                padding: '10px 12px',
                borderRadius: 12,
                border: '1px solid var(--border)',
                background: 'var(--panel)',
                color: 'var(--text)',
                cursor: 'pointer'
              }}
            >
              Reset filters
            </button>
          </div>
        </Drawer>

        <footer style={{ marginTop: 20, paddingTop: 14, borderTop: '1px solid var(--border)', color: 'var(--muted)', fontSize: 12 }}>
          Open-source community project. Data: db-sync + metadata URLs. MPO inference is best-effort with evidence.
        </footer>
      </div>
    </div>
  )
}
