import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { won } from '../format.js';

export function HomePage() {
  const [summary, setSummary] = useState(null);
  const [items, setItems] = useState([]);
  const [name, setName] = useState('');
  const [error, setError] = useState(null);

  async function load() {
    try {
      const [s, list] = await Promise.all([api.getSummary(), api.listItems()]);
      setSummary(s);
      setItems(list);
    } catch (e) { setError(e.message); }
  }

  useEffect(() => { load(); }, []);

  async function addItem(e) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await api.createItem(name.trim());
      setName('');
      await load();
    } catch (e) { setError(e.message); }
  }

  return (
    <main className="container">
      <h1>혼수 목록</h1>
      <p className="nav"><Link to="/layout">평면도 배치 →</Link></p>
      {summary && (
        <div className="summary" role="status">
          확정 합계 <strong>{won(summary.confirmed_total)}</strong> · 미확정 {summary.unconfirmed_count}건
        </div>
      )}
      {error && <p className="error">{error}</p>}
      <form onSubmit={addItem} className="add-row">
        <input
          aria-label="새 항목 이름"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="예: 냉장고"
        />
        <button type="submit">＋ 항목 추가</button>
      </form>
      <ul className="item-list">
        {items.map((it) => (
          <li key={it.id}>
            <Link to={`/items/${it.id}`}>
              <span className="item-name">{it.name}</span>
              {it.confirmed_candidate_id ? (
                <span className="badge confirmed">✅ {won(it.confirmed_price)}</span>
              ) : (
                <span className="badge">⚪ 비교중</span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
