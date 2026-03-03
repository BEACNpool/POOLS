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
    const from = display
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

export default function App() {
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)

  // UI state
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark')
  const [q, setQ] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [selected, setSelected] = useState(null)

  // filters (warnings are flags, not exclusions; user can choose)
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
      .slice(0, 1200) // guardrail for browser perf
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
              <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em' }}>POOLS — How to find an SPO</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                Community-built. Uses db-sync + metadata. MPO detection is best-effort with evidence.
              </div>
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
          <div style={{ marginTop: 16, padding: 12, border: '1px solid rgba(255,80,80,0.5)', borderRadius: 12 }}>
            Couldn’t load snapshot: {err}
          </div>
        )}

        {!data && !err && <div style={{ marginTop: 16, opacity: 0.85 }}>Loading latest snapshot…</div>}

        {data && (
          <>
            {/* HERO STATS */}
            <section
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                gap: 14,
                marginTop: 18
              }}
            >
              <div style={{ border: '1px solid var(--border)', background: 'var(--panel2)', borderRadius: 18, padding: 18 }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Active pools (delegated)</div>
                <div style={{ fontSize: 32, fontWeight: 900, marginTop: 8 }}>
                  <AnimNum value={ns?.active_pools ?? counts.total} />
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
                  Pools with &gt; 0 stake this epoch
                </div>
              </div>
              <div style={{ border: '1px solid var(--border)', background: 'var(--panel2)', borderRadius: 18, padding: 18 }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Saturation cap</div>
                <div style={{ fontSize: 22, fontWeight: 900, marginTop: 10 }}>{formatAdaShort(ns?.saturation_cap_lovelace)}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>≈ network stake ÷ k</div>
              </div>
              <div style={{ border: '1px solid var(--border)', background: 'var(--panel2)', borderRadius: 18, padding: 18 }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>~1 block expected / epoch</div>
                <div style={{ fontSize: 22, fontWeight: 900, marginTop: 10 }}>{formatAdaShort(ns?.stake_for_1_block_expected_lovelace)}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>Rule-of-thumb variance cutoff</div>
              </div>
              <div style={{ border: '1px solid var(--border)', background: 'var(--panel2)', borderRadius: 18, padding: 18 }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>MPO concentration</div>
                <div style={{ fontSize: 32, fontWeight: 900, marginTop: 8 }}>
                  <AnimNum value={Math.round(ns?.mpo_stake_pct ?? 0)} suffix="%" />
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>Flagged MPO stake share (best-effort)</div>
              </div>
            </section>

            {/* EDUCATION */}
            <section style={{ marginTop: 16, padding: 16, borderRadius: 18, border: '1px solid var(--border)', background: 'var(--panel2)' }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
                <Badge tone="info">k={ns?.k_optimal_pool_count ?? '—'}</Badge>
                <Badge tone="neutral">Saturation ≈ {formatAda(ns?.saturation_cap_lovelace)}</Badge>
                <Badge tone="neutral">Blocks/epoch ≈ {ns?.blocks_per_epoch ?? '—'}</Badge>
              </div>
              <h2 style={{ margin: 0, fontSize: 16 }}>How rewards + saturation work (delegator version)</h2>
              <p style={{ marginTop: 10, marginBottom: 8, color: 'var(--muted)', lineHeight: 1.55 }}>
                Cardano’s <b>k</b> (optimal pool count) sets a target decentralization level. Roughly, <b>network stake / k</b> is the <b>saturation cap</b>.
                Above that cap, rewards <b>taper</b>.
              </p>
              <p style={{ marginTop: 0, marginBottom: 0, color: 'var(--muted)', lineHeight: 1.55 }}>
                “Too small” pools can still produce rewards, but if they’re below about <b>{formatAda(ns?.stake_for_1_block_expected_lovelace)}</b> active stake,
                they may have <b>&lt; 1 block expected per epoch</b> and variance gets ugly.
              </p>
            </section>

            {/* Search + toolbar */}
            <section style={{ marginTop: 18, display: 'flex', gap: 10, alignItems: 'stretch', flexWrap: 'wrap' }}>
              <div
                style={{
                  flex: 1,
                  minWidth: 320,
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
                  <button
                    onClick={() => setQ('')}
                    style={{ border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer' }}
                  >
                    ✕
                  </button>
                )}
              </div>

              <button
                onClick={() => setShowFilters(s => !s)}
                style={{
                  padding: '10px 14px',
                  borderRadius: 14,
                  border: '1px solid var(--border)',
                  background: showFilters ? 'rgba(83,82,237,0.14)' : 'var(--panel)',
                  color: 'var(--text)',
                  cursor: 'pointer'
                }}
              >
                ⚙ Filters
                <span style={{ marginLeft: 8, opacity: 0.8, fontSize: 12 }}>
                  ({[hideMpo, hideNearSat, hideTooSmall].filter(Boolean).length})
                </span>
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Badge tone="neutral">Showing {filtered.length.toLocaleString()} pools</Badge>
              </div>
            </section>

            {/* Filter panel */}
            {showFilters && (
              <section
                style={{
                  marginTop: 12,
                  padding: 14,
                  borderRadius: 18,
                  border: '1px solid var(--border)',
                  background: 'var(--panel2)'
                }}
              >
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
                              Pool details
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
                              Delegation impact
                            </div>
                            <div style={{ color: 'var(--muted)', lineHeight: 1.5 }}>
                              {p.flags?.is_mpo ? (
                                <>
                                  <b>Warning:</b> this pool is flagged as part of a <b>multi-pool operator (MPO)</b>. Choosing it can increase stake concentration.
                                </>
                              ) : (
                                <>
                                  <b>Nice:</b> this looks like a <b>single-operator</b> pool (based on current evidence). This generally helps decentralization.
                                </>
                              )}
                              {p.flags?.under_1_block_expected ? (
                                <>
                                  <br />
                                  <br />
                                  <b>Variance note:</b> under ~1 expected block/epoch means rewards can be spiky.
                                </>
                              ) : null}
                            </div>
                            <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                              {p.mpo?.evidence?.slice?.(0, 4)?.map((e, i) => (
                                <Badge key={i} tone="info">
                                  {e.type}: {String(e.value).slice(0, 28)}
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
                                      Raw metadata URL →
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

            <footer style={{ marginTop: 22, paddingTop: 16, borderTop: '1px solid var(--border)', color: 'var(--muted)', lineHeight: 1.55 }}>
              <div>
                Built as a community resource to help delegators make informed choices. Data: db-sync (relay), metadata URLs, and best-effort MPO inference.
              </div>
              <div style={{ marginTop: 6 }}>
                Note: “max rewards” claims are not guaranteed; saturation and pool size mostly affect variance and tapering.
              </div>
            </footer>
          </>
        )}
      </div>
    </div>
  )
}
