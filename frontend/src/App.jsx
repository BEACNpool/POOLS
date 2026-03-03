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
    neutral: { bg: 'var(--panel)', b: 'var(--border)', c: 'var(--text)' },
    good: { bg: 'rgba(46,213,115,0.12)', b: 'rgba(46,213,115,0.25)', c: 'var(--text)' },
    warn: { bg: 'rgba(255,165,2,0.12)', b: 'rgba(255,165,2,0.25)', c: 'var(--text)' },
    bad: { bg: 'rgba(255,71,87,0.14)', b: 'rgba(255,71,87,0.30)', c: 'var(--text)' },
    info: { bg: 'rgba(83,82,237,0.14)', b: 'rgba(83,82,237,0.30)', c: 'var(--text)' }
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
        color: t.c,
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
    const from = 0
    const to = Number(value) || 0
    const dur = 900
    const step = ts => {
      if (!start) start = ts
      const p = Math.min((ts - start) / dur, 1)
      const ease = 1 - Math.pow(1 - p, 3)
      setDisplay(Math.round(from + (to - from) * ease))
      if (p < 1) raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
    return () => raf.current && cancelAnimationFrame(raf.current)
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

function Modal({ open, title, onClose, children }) {
  if (!open) return null
  return (
    <div
      role="dialog"
      aria-modal="true"
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 18
      }}
    >
      <div style={{ maxWidth: 860, width: '100%', borderRadius: 18, border: '1px solid var(--border)', background: 'var(--bg)', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: 14, borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontWeight: 900 }}>{title}</div>
          <button
            onClick={onClose}
            style={{ padding: '6px 10px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)', cursor: 'pointer' }}
          >
            Close
          </button>
        </div>
        <div style={{ padding: 14, color: 'var(--muted)', lineHeight: 1.6 }}>{children}</div>
      </div>
    </div>
  )
}

export default function App() {
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)

  // UX flow
  const [view, setView] = useState('intro') // intro | results
  const [howOpen, setHowOpen] = useState(false)

  // UI state
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark')
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState(null)
  const [filtersOpen, setFiltersOpen] = useState(false)

  // filters (warnings are flags, not exclusions)
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
    const total = pools.length
    let mpo = 0
    let sat = 0
    let small = 0
    for (const p of pools) {
      if (p.flags?.is_mpo) mpo++
      if (p.flags?.is_saturated || p.flags?.is_near_saturated) sat++
      if (p.flags?.under_1_block_expected) small++
    }
    return { total, mpo, sat, small }
  }, [pools])

  function applyPreset(preset) {
    // We still allow users to override; this just sets sane defaults.
    if (preset === 'max') {
      setHideMpo(false)
      setHideNearSat(false)
      setHideTooSmall(true)
      setMaxMargin(5)
      setMinCost('any')
    } else if (preset === 'balanced') {
      setHideMpo(false)
      setHideNearSat(true)
      setHideTooSmall(true)
      setMaxMargin(3)
      setMinCost('any')
    } else if (preset === 'decentralize') {
      setHideMpo(true)
      setHideNearSat(true)
      setHideTooSmall(false)
      setMaxMargin(5)
      setMinCost('any')
    }
    setFiltersOpen(false)
    setSelected(null)
    setQ('')
    setView('results')
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        color: 'var(--text)',
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, sans-serif"
      }}
    >
      {/* background grid */}
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

      {/* ambient glows */}
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

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 1280, margin: '0 auto', padding: 24 }}>
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
            padding: '18px 0 16px',
            borderBottom: '1px solid var(--border)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 12,
                background: 'linear-gradient(135deg, #5352ed, #2ed573)',
                boxShadow: '0 0 24px rgba(83,82,237,0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                color: 'white'
              }}
            >
              P
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: '-0.02em' }}>POOLS — Find a Cardano SPO</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Fast filters + clear warnings. No bullshit.</div>
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

        <Modal open={howOpen} title="How it works" onClose={() => setHowOpen(false)}>
          <p style={{ marginTop: 0 }}>
            Cardano uses an “optimal pool count” parameter <b>k</b>. Roughly, <b>network stake / k</b> gives a <b>saturation cap</b>. Above that cap, rewards
            <b> taper</b>.
          </p>
          <p>
            A rough variance rule-of-thumb: around <b>{formatAda(ns?.stake_for_1_block_expected_lovelace)}</b> active stake is about
            <b> ~1 block expected per epoch</b>. Smaller pools can still earn rewards, but results can be spiky.
          </p>
          <p style={{ marginBottom: 0 }}>
            MPO flags are best-effort inference with evidence. We show warnings, not certainty.
          </p>
        </Modal>

        {err && (
          <div style={{ marginTop: 16, padding: 12, border: '1px solid rgba(255,80,80,0.5)', borderRadius: 12 }}>
            Couldn’t load snapshot: {err}
          </div>
        )}

        {!data && !err && <div style={{ marginTop: 16, opacity: 0.85 }}>Loading latest snapshot…</div>}

        {data && view === 'intro' && (
          <>
            <section style={{ marginTop: 20, padding: 18, borderRadius: 18, border: '1px solid var(--border)', background: 'var(--panel2)' }}>
              <h1 style={{ margin: 0, fontSize: 22, letterSpacing: '-0.02em' }}>Pick what matters to you.</h1>
              <p style={{ marginTop: 10, marginBottom: 0, color: 'var(--muted)', lineHeight: 1.6 }}>
                This is a community tool to help delegators choose pools with eyes open: saturation, fees, variance, and concentration risk.
              </p>
            </section>

            <section style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 14 }}>
              <button
                onClick={() => applyPreset('max')}
                style={{ padding: 16, borderRadius: 18, border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)', cursor: 'pointer', textAlign: 'left' }}
              >
                <div style={{ fontWeight: 900, fontSize: 16 }}>Max rewards</div>
                <div style={{ marginTop: 8, color: 'var(--muted)', lineHeight: 1.5 }}>
                  Prioritizes avoiding tiny pools. Warnings still shown.
                </div>
                <div style={{ marginTop: 10 }}>
                  <Badge tone="bad">Can worsen concentration (MPOs)</Badge>
                </div>
              </button>

              <button
                onClick={() => applyPreset('balanced')}
                style={{ padding: 16, borderRadius: 18, border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)', cursor: 'pointer', textAlign: 'left' }}
              >
                <div style={{ fontWeight: 900, fontSize: 16 }}>Balanced</div>
                <div style={{ marginTop: 8, color: 'var(--muted)', lineHeight: 1.5 }}>
                  Hides near-saturated pools and tiny variance traps.
                </div>
                <div style={{ marginTop: 10 }}>
                  <Badge tone="neutral">Good default</Badge>
                </div>
              </button>

              <button
                onClick={() => applyPreset('decentralize')}
                style={{ padding: 16, borderRadius: 18, border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)', cursor: 'pointer', textAlign: 'left' }}
              >
                <div style={{ fontWeight: 900, fontSize: 16 }}>Help decentralization</div>
                <div style={{ marginTop: 8, color: 'var(--muted)', lineHeight: 1.5 }}>
                  Hides MPO pools by default. (You can toggle later.)
                </div>
                <div style={{ marginTop: 10 }}>
                  <Badge tone="good">Recommended</Badge>
                </div>
              </button>
            </section>

            <section style={{ marginTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <Badge tone="info">Active pools (delegated): {ns?.active_pools?.toLocaleString?.() ?? '—'}</Badge>
                <Badge tone="neutral">Pools known: {ns?.pools_known?.toLocaleString?.() ?? counts.total.toLocaleString()}</Badge>
                <Badge tone="neutral">Saturation cap: {formatAdaShort(ns?.saturation_cap_lovelace)}</Badge>
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <button
                  onClick={() => setHowOpen(true)}
                  style={{ border: 'none', background: 'transparent', color: 'var(--link)', cursor: 'pointer' }}
                >
                  How it works
                </button>
                <button
                  onClick={() => setView('results')}
                  style={{ border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer' }}
                >
                  Skip → browse all pools
                </button>
              </div>
            </section>
          </>
        )}

        {data && view === 'results' && (
          <>
            {/* Top bar */}
            <section style={{ marginTop: 18, display: 'flex', gap: 10, alignItems: 'stretch', flexWrap: 'wrap' }}>
              <button
                onClick={() => {
                  setView('intro')
                  setFiltersOpen(false)
                }}
                style={{ padding: '10px 14px', borderRadius: 14, border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)', cursor: 'pointer' }}
              >
                ← Back
              </button>

              <div
                style={{
                  flex: 1,
                  minWidth: 260,
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
                onClick={() => setFiltersOpen(o => !o)}
                style={{
                  padding: '10px 14px',
                  borderRadius: 14,
                  border: '1px solid var(--border)',
                  background: filtersOpen ? 'rgba(83,82,237,0.14)' : 'var(--panel)',
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
                onClick={() => setHowOpen(true)}
                style={{ padding: '10px 14px', borderRadius: 14, border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)', cursor: 'pointer' }}
              >
                ? How
              </button>

              <div style={{ display: 'flex', alignItems: 'center' }}>
                <Badge tone="neutral">Showing {filtered.length.toLocaleString()}</Badge>
              </div>
            </section>

            {/* Slide-over filters */}
            {filtersOpen && (
              <section style={{ marginTop: 12, padding: 14, borderRadius: 18, border: '1px solid var(--border)', background: 'var(--panel2)' }}>
                <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center' }}>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input type="checkbox" checked={hideMpo} onChange={e => setHideMpo(e.target.checked)} />
                    Hide MPO pools
                  </label>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input type="checkbox" checked={hideNearSat} onChange={e => setHideNearSat(e.target.checked)} />
                    Hide near-saturated
                  </label>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input type="checkbox" checked={hideTooSmall} onChange={e => setHideTooSmall(e.target.checked)} />
                    Hide &lt; 1 expected block/epoch
                  </label>
                  <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    Max margin: <b>{maxMargin}%</b>
                    <input type="range" min={0} max={10} step={0.5} value={maxMargin} onChange={e => setMaxMargin(Number(e.target.value))} />
                  </label>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    Fixed fee:
                    <select value={minCost} onChange={e => setMinCost(e.target.value)}>
                      <option value="any">Any</option>
                      <option value="170">170 ₳</option>
                      <option value="340">340 ₳</option>
                    </select>
                  </label>

                  <button
                    onClick={() => {
                      setHideMpo(false)
                      setHideNearSat(false)
                      setHideTooSmall(false)
                      setMaxMargin(5)
                      setMinCost('any')
                    }}
                    style={{ marginLeft: 'auto', padding: '8px 12px', borderRadius: 14, border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)', cursor: 'pointer' }}
                  >
                    Reset
                  </button>
                </div>

                <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <Badge tone="info">Flagged MPO pools: {counts.mpo.toLocaleString()}</Badge>
                  <Badge tone="warn">Near/saturated: {counts.sat.toLocaleString()}</Badge>
                  <Badge tone="neutral">Under ~1 block/epoch: {counts.small.toLocaleString()}</Badge>
                </div>
              </section>
            )}

            {/* TABLE */}
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
                      : p.flags?.under_1_block_expected
                        ? 'neutral'
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
                          <span style={{ fontWeight: 700 }}>{p.name || '—'}</span>
                          {p.flags?.is_mpo ? <Badge tone="bad">MPO</Badge> : <Badge tone="good">SINGLE</Badge>}
                          {p.flags?.is_saturated ? <Badge tone="bad">SATURATED</Badge> : null}
                          {!p.flags?.is_saturated && p.flags?.is_near_saturated ? <Badge tone="warn">NEAR SAT</Badge> : null}
                          {p.flags?.under_1_block_expected ? <Badge tone="neutral">VARIANCE</Badge> : null}
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
                        <Badge tone={Number(marginPct) <= 1 ? 'good' : Number(marginPct) <= 3 ? 'neutral' : 'warn'}>{marginPct}%</Badge>
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
                            <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Pool details</div>
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
                            <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Warnings</div>
                            <div style={{ color: 'var(--muted)', lineHeight: 1.5 }}>
                              {p.flags?.is_mpo ? (
                                <>
                                  <b>Blunt warning:</b> this pool is flagged as part of a <b>multi-pool operator (MPO)</b>. Choosing it can actively worsen decentralization.
                                </>
                              ) : (
                                <>
                                  <b>Good sign:</b> this looks like a <b>single-operator</b> pool (based on current evidence).
                                </>
                              )}
                              {p.flags?.under_1_block_expected ? (
                                <>
                                  <br />
                                  <br />
                                  <b>Variance note:</b> under ~1 expected block/epoch can be spiky.
                                </>
                              ) : null}
                            </div>
                            {p.mpo?.evidence?.length ? (
                              <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                {p.mpo.evidence.slice(0, 4).map((e, i) => (
                                  <Badge key={i} tone="info">
                                    {e.type}: {String(e.value).slice(0, 28)}
                                  </Badge>
                                ))}
                              </div>
                            ) : null}
                          </div>

                          <div style={{ border: '1px solid var(--border)', borderRadius: 14, padding: 12, background: 'var(--panel2)' }}>
                            <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Links</div>
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
                                      Raw metadata URL →
                                    </a>
                                  ) : null}
                                </div>
                              )
                            })()}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </section>

            <footer style={{ marginTop: 22, paddingTop: 16, borderTop: '1px solid var(--border)', color: 'var(--muted)', lineHeight: 1.55 }}>
              <div>Community resource. Data: db-sync + metadata. MPO detection: best-effort inference with evidence.</div>
            </footer>
          </>
        )}
      </div>
    </div>
  )
}
