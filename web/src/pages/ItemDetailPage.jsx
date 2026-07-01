import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api.js';
import { won } from '../format.js';
import { catKey, catColor, catSoft, catLabel } from '../categories.js';
import { CategoryIcon } from '../icons.jsx';

const EMPTY = { name: '', price: '', url: '', memo: '', width_cm: '', depth_cm: '', height_cm: '' };

export function ItemDetailPage() {
  const { id } = useParams();
  const itemId = Number(id);
  const [item, setItem] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState(null);

  async function load() {
    try { setItem(await api.getItem(itemId)); } catch (e) { setError(e.message); }
  }
  useEffect(() => { load(); }, [itemId]);

  async function addCandidate(e) {
    e.preventDefault();
    try { await api.addCandidate(itemId, form); setForm(EMPTY); await load(); }
    catch (e) { setError(e.message); }
  }
  async function confirm(cid) {
    try { await api.confirm(itemId, cid); await load(); } catch (e) { setError(e.message); }
  }
  async function unconfirm() {
    try { await api.unconfirm(itemId); await load(); } catch (e) { setError(e.message); }
  }
  async function removeCandidate(cid) {
    try { await api.deleteCandidate(cid); await load(); } catch (e) { setError(e.message); }
  }
  async function changeCategory(e) {
    const value = e.target.value;
    try { await api.updateItem(itemId, { category: value }); await load(); }
    catch (e) { setError(e.message); }
  }

  if (!item) {
    return (
      <main className="container">
        <Link to="/" className="back">← 목록</Link>
        {error && <p className="error">{error}</p>}
      </main>
    );
  }

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const key = catKey(item.category);

  const priced = item.candidates.filter((c) => c.price != null);
  const minP = priced.length ? Math.min(...priced.map((c) => c.price)) : null;
  const maxP = priced.length ? Math.max(...priced.map((c) => c.price)) : null;
  const cheapestId = priced.length
    ? priced.reduce((a, b) => (a.price <= b.price ? a : b)).id
    : null;
  const confirmedCand = item.candidates.find((c) => c.id === item.confirmed_candidate_id);
  const posOf = (p) => (maxP > minP ? ((p - minP) / (maxP - minP)) * 100 : 0);

  function dims(c) {
    if (!c.width_cm && !c.depth_cm && !c.height_cm) return null;
    return `${c.width_cm ?? '—'} × ${c.depth_cm ?? '—'} × ${c.height_cm ?? '—'} cm`;
  }

  return (
    <main className="container detail">
      <Link to="/" className="back">← 목록</Link>

      <header className="detail-head">
        <span className="ico-sq ico-sq-lg" style={{ background: catSoft(key), color: catColor(key) }}>
          <CategoryIcon category={key} size={24} />
        </span>
        <div className="detail-titles">
          <h1 className="detail-name">{item.name}</h1>
          <div className="detail-sub">{catLabel(item.category)} · 후보 {item.candidates.length}</div>
        </div>
        <label className="cat-select">
          <select aria-label="분류 변경" value={item.category ?? ''} onChange={changeCategory}>
            <option value="">미분류</option>
            <option value="appliance">가전</option>
            <option value="furniture">가구</option>
          </select>
        </label>
      </header>

      {error && <p className="error">{error}</p>}

      {priced.length > 0 && (
        <section className="price-range">
          <div className="pr-head">
            <span className="pr-label">후보 가격대</span>
            <span className="pr-minmax">
              최저 <b className="num pr-low">{minP.toLocaleString('ko-KR')}</b> ~ 최고{' '}
              <b className="num">{maxP.toLocaleString('ko-KR')}원</b>
            </span>
          </div>
          <div className="pr-track">
            <span className="pr-dot pr-dot-low" style={{ left: '0%' }} />
            {confirmedCand?.price != null && (
              <span className="pr-dot pr-dot-conf" style={{ left: `${posOf(confirmedCand.price)}%` }} />
            )}
            <span className="pr-dot pr-dot-high" style={{ left: '100%' }} />
          </div>
          <div className="pr-legend">
            <span><span className="dot dot-low" />최저가</span>
            <span><span className="dot dot-conf" />확정</span>
          </div>
        </section>
      )}

      <div className="cand-list">
        {item.candidates.map((c) => {
          const isConfirmed = c.id === item.confirmed_candidate_id;
          const isCheapest = c.id === cheapestId && !isConfirmed;
          const d = dims(c);
          return (
            <div key={c.id} className={`cand-card${isConfirmed ? ' confirmed' : ''}`}>
              {isConfirmed && <span className="conf-pill">✓ 확정된 후보</span>}
              <div className="cand-top">
                <div className="cand-title">
                  <span className="cand-name">{c.name}</span>
                  {isCheapest && <span className="cheapest-chip">최저가</span>}
                </div>
                <span className={`cand-price num${isConfirmed ? ' price-conf' : ''}`}>{won(c.price)}</span>
              </div>
              {d && <div className="chip-row"><span className="spec-chip num">{d}</span></div>}
              {c.memo && <p className="cand-memo">{c.memo}</p>}
              <div className="cand-actions">
                {isConfirmed ? (
                  <button className="btn-unconfirm" onClick={unconfirm}>확정 해제</button>
                ) : (
                  <button className="btn-confirm" onClick={() => confirm(c.id)}>이걸로 확정</button>
                )}
                {c.url && (
                  <a className="btn-link" href={c.url} target="_blank" rel="noreferrer">링크 ↗</a>
                )}
                <button className="danger" onClick={() => removeCandidate(c.id)}>삭제</button>
              </div>
            </div>
          );
        })}
      </div>

      <form onSubmit={addCandidate} className="cand-form">
        <h2>후보 추가</h2>
        <input aria-label="후보 이름" placeholder="이름" value={form.name} onChange={set('name')} />
        <input aria-label="가격" placeholder="가격(원)" value={form.price} onChange={set('price')} />
        <input aria-label="URL" placeholder="URL" value={form.url} onChange={set('url')} />
        <input aria-label="메모" placeholder="메모" value={form.memo} onChange={set('memo')} />
        <input aria-label="가로" placeholder="가로(cm)" value={form.width_cm} onChange={set('width_cm')} />
        <input aria-label="세로" placeholder="세로(cm)" value={form.depth_cm} onChange={set('depth_cm')} />
        <input aria-label="높이" placeholder="높이(cm)" value={form.height_cm} onChange={set('height_cm')} />
        <button type="submit">추가</button>
      </form>
    </main>
  );
}
