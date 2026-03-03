import { useEffect, useMemo, useState } from 'react'
import './App.css'

function formatAda(lovelace) {
  if (lovelace == null) return '—'
  const ada = Number(lovelace) / 1_000_000
  if (!Number.isFinite(ada)) return '—'
  return ada.toLocaleString(undefined, { maximumFractionDigits: 0 }) + ' ₳'
}

function Badge({ children }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 999,
      border: '1px solid var(--border)',
      background: 'var(--panel)',
      color: 'var(--text)',
      fontSize: 12,
      lineHeight: '18px'
    }}>
      {children}
    </span>
  )
}

export default function App() {
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)
  const [q, setQ] = useState('')
  const [preferSpo, setPreferSpo] = useState(true)
  const [avoidSaturated, setAvoidSaturated] = useState(true)
  const [hideTooSmall, setHideTooSmall] = useState(false)
  const [maxMargin, setMaxMargin] = useState(5) // percent
  const [minCost, setMinCost] = useState('any') // any|170|340

  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('theme')
    return saved || 'dark'
  })

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('theme', theme)
  }, [theme])

  useEffect(() => {
    // On GitHub Pages this site is served under /POOLS/
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
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return pools.filter(p => {
      if (preferSpo && p.flags?.is_mpo) return false
      if (avoidSaturated && (p.flags?.is_saturated || p.flags?.is_near_saturated)) return false
      if (hideTooSmall && p.flags?.under_1_block_expected) return false

      const marginPct = (Number(p.margin) || 0) * 100
      if (marginPct > maxMargin) return false

      const costAda = (Number(p.fixed_cost_lovelace) || 0) / 1_000_000
      if (minCost === '170' && Math.round(costAda) !== 170) return false
      if (minCost === '340' && Math.round(costAda) !== 340) return false

      if (!s) return true
      return [p.ticker, p.name, p.pool_id_bech32].some(v => (v || '').toLowerCase().includes(s))
    })
  }, [pools, q, preferSpo, avoidSaturated, hideTooSmall, maxMargin, minCost])

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 24 }}>
      <header style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0 }}>How to find a stake pool operator (SPO)</h1>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ opacity: 0.8, fontSize: 12 }}>Theme</span>
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              style={{
                padding: '6px 10px',
                borderRadius: 10,
                border: '1px solid var(--border)',
                background: 'var(--panel)',
                color: 'var(--text)',
                cursor: 'pointer'
              }}
            >
              {theme === 'dark' ? 'Dark' : 'Light'}
            </button>
          </div>
        </div>

        <p style={{ marginTop: 8, color: 'var(--muted)' }}>
          A community-built explorer to help delegators choose pools that support decentralization—without giving up solid rewards.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search ticker, name, or pool id…"
            style={{
              padding: '10px 12px',
              borderRadius: 10,
              minWidth: 320,
              border: '1px solid var(--border)',
              background: 'var(--panel)',
              color: 'var(--text)'
            }}
          />
          {data?.network_summary && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Badge>Epoch {data.network_summary.epoch_no}</Badge>
              <Badge>k={data.network_summary.k_optimal_pool_count}</Badge>
              <Badge>Saturation ≈ {formatAda(data.network_summary.saturation_cap_lovelace)}</Badge>
              <Badge>~1 block/epoch ≈ {formatAda(data.network_summary.stake_for_1_block_expected_lovelace)}</Badge>
              <Badge>MPO stake: {(data.network_summary.mpo_stake_pct ?? 0).toFixed(1)}%</Badge>
            </div>
          )}
        </div>

        {data?.network_summary && (
          <section style={{ marginTop: 14, padding: 12, borderRadius: 14, border: '1px solid var(--border)', background: 'var(--panel2)' }}>
            <h2 style={{ marginTop: 0, marginBottom: 8 }}>How rewards + saturation work (delegator version)</h2>
            <p style={{ marginTop: 0, opacity: 0.9, lineHeight: 1.5 }}>
              Cardano has an “optimal pool count” parameter <b>k</b>. Roughly: <b>network stake / k</b> gives the <b>saturation cap</b>.
              Above that cap, rewards <b>taper</b>—you’re not getting “more” for piling into an already-big pool.
            </p>
            <p style={{ marginTop: 0, opacity: 0.9, lineHeight: 1.5 }}>
              A pool’s expected blocks per epoch scales with stake. A very rough rule of thumb is you need about <b>{formatAda(data.network_summary.stake_for_1_block_expected_lovelace)}</b>
              active stake to have <b>~1 block expected per epoch</b>. Below that, you can still earn rewards, but variance gets brutal.
            </p>
            <p style={{ marginTop: 0, marginBottom: 0, opacity: 0.85, lineHeight: 1.5 }}>
              Concentration risk: when too much stake piles into a small set of operators (especially MPOs/exchanges), it weakens decentralization and increases correlated failure/attack risk.
            </p>
          </section>
        )}
      </header>

      {err && (
        <div style={{ padding: 12, border: '1px solid rgba(255,80,80,0.5)', borderRadius: 12 }}>
          Couldn’t load /data/latest.json: {err}
        </div>
      )}

      {!data && !err && <div style={{ opacity: 0.8 }}>Loading latest snapshot…</div>}

      {data && (
        <>
          <section style={{ marginTop: 18 }}>
            <h2 style={{ marginBottom: 8 }}>Quick tips (the boring truth)</h2>
            <ul style={{ marginTop: 0, opacity: 0.9, lineHeight: 1.5 }}>
              <li><b>Ignore “luck.”</b> Look at long-run consistency and fee structure.</li>
              <li><b>Avoid concentration.</b> Prefer single-operator pools and smaller operators when everything else is equal.</li>
              <li><b>Fees matter, but not that much.</b> Extreme fees are red flags; normal fees are fine.</li>
              <li><b>Transparency wins.</b> If an operator hides who they are / what else they run, that’s a signal too.</li>
            </ul>
          </section>

          <section style={{ marginTop: 18 }}>
            <h2 style={{ marginBottom: 8 }}>Find pools (filters)</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 12 }}>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="checkbox" checked={preferSpo} onChange={e => setPreferSpo(e.target.checked)} />
                Prefer single operators (hide MPO pools)
              </label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="checkbox" checked={avoidSaturated} onChange={e => setAvoidSaturated(e.target.checked)} />
                Hide near-saturated pools
              </label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="checkbox" checked={hideTooSmall} onChange={e => setHideTooSmall(e.target.checked)} />
                Hide “too small to expect 1 block/epoch”
              </label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                Max margin: <b>{maxMargin}%</b>
                <input type="range" min={0} max={10} step={0.5} value={maxMargin} onChange={e => setMaxMargin(Number(e.target.value))} />
              </label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                Min pool cost:
                <select value={minCost} onChange={e => setMinCost(e.target.value)}>
                  <option value="any">Any</option>
                  <option value="170">170 ₳</option>
                  <option value="340">340 ₳</option>
                </select>
              </label>
            </div>

            <h2 style={{ marginBottom: 8 }}>Pools</h2>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.15)' }}>
                    <th style={{ padding: '10px 8px' }}>Ticker</th>
                    <th style={{ padding: '10px 8px' }}>Name</th>
                    <th style={{ padding: '10px 8px' }}>Website</th>
                    <th style={{ padding: '10px 8px' }}>Active stake</th>
                    <th style={{ padding: '10px 8px' }}>MPO</th>
                    <th style={{ padding: '10px 8px' }}>Evidence</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 250).map(p => (
                    <tr
                      key={p.pool_id_bech32}
                      style={{
                        borderBottom: '1px solid rgba(255,255,255,0.08)',
                        background: p.flags?.is_saturated
                          ? 'rgba(255, 60, 60, 0.18)'
                          : p.flags?.is_near_saturated
                            ? 'rgba(255, 170, 0, 0.14)'
                            : p.flags?.is_mpo
                              ? 'rgba(160, 120, 255, 0.10)'
                              : p.flags?.under_1_block_expected
                                ? 'rgba(120, 190, 255, 0.08)'
                                : 'transparent'
                      }}
                    >
                      <td style={{ padding: '10px 8px', fontWeight: 700 }}>{p.ticker || '—'}</td>
                      <td style={{ padding: '10px 8px' }}>{p.name || '—'}</td>
                      <td style={{ padding: '10px 8px' }}>
                        {p.homepage ? (
                          <a href={p.homepage} target="_blank" rel="noreferrer" style={{ color: '#9fd3ff', textDecoration: 'none' }}>
                            {p.homepage.replace(/^https?:\/\//, '')}
                          </a>
                        ) : (
                          <span style={{ opacity: 0.7 }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '10px 8px' }}>{formatAda(p.active_stake_lovelace)}</td>
                      <td style={{ padding: '10px 8px' }}>
                        {p.mpo ? <Badge>Yes</Badge> : <span style={{ opacity: 0.75 }}>No</span>}
                      </td>
                      <td style={{ padding: '10px 8px', opacity: 0.9 }}>
                        {p.mpo?.evidence?.slice?.(0, 2)?.map((e, i) => (
                          <span key={i} style={{ marginRight: 8 }}>
                            <Badge>{e.type}</Badge>
                          </span>
                        ))}
                        {!p.mpo?.evidence?.length && <span style={{ opacity: 0.7 }}>—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ opacity: 0.7, marginTop: 10 }}>
              Showing {Math.min(filtered.length, 250).toLocaleString()} of {filtered.length.toLocaleString()} pools (v0 UI cap).
            </p>
          </section>

          <footer style={{ marginTop: 26, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.12)', opacity: 0.8 }}>
            <p style={{ margin: 0 }}>
              Open-source community project. Data derived from Cardano db-sync (relay), Koios, and metadata URLs. MPO detection is best-effort with evidence + confidence.
            </p>
          </footer>
        </>
      )}
    </div>
  )
}
