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
      border: '1px solid rgba(255,255,255,0.18)',
      background: 'rgba(255,255,255,0.06)',
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
    if (!s) return pools
    return pools.filter(p => {
      return [p.ticker, p.name, p.pool_id_bech32].some(v => (v || '').toLowerCase().includes(s))
    })
  }, [pools, q])

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 24 }}>
      <header style={{ marginBottom: 18 }}>
        <h1 style={{ margin: 0 }}>How to find a stake pool operator (SPO)</h1>
        <p style={{ marginTop: 8, opacity: 0.85 }}>
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
              border: '1px solid rgba(255,255,255,0.18)',
              background: 'rgba(255,255,255,0.04)',
              color: 'white'
            }}
          />
          {data?.network_summary && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Badge>Epoch {data.network_summary.epoch_no}</Badge>
              <Badge>Active pools: {data.network_summary.active_pools?.toLocaleString?.() ?? '—'}</Badge>
              <Badge>MPO stake: {(data.network_summary.mpo_stake_pct ?? 0).toFixed(1)}%</Badge>
            </div>
          )}
        </div>
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
            <h2 style={{ marginBottom: 8 }}>Pools</h2>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.15)' }}>
                    <th style={{ padding: '10px 8px' }}>Ticker</th>
                    <th style={{ padding: '10px 8px' }}>Name</th>
                    <th style={{ padding: '10px 8px' }}>Active stake</th>
                    <th style={{ padding: '10px 8px' }}>MPO</th>
                    <th style={{ padding: '10px 8px' }}>Evidence</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 250).map(p => (
                    <tr key={p.pool_id_bech32} style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                      <td style={{ padding: '10px 8px', fontWeight: 700 }}>{p.ticker || '—'}</td>
                      <td style={{ padding: '10px 8px' }}>{p.name || '—'}</td>
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
