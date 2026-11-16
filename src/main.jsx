import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowDownWideNarrow, ArrowRight, Car, ChevronDown, Clock3, Footprints, Heart, House,
  Info, MapPin, Plus, Search, SlidersHorizontal,
} from 'lucide-react';
import { api, money, roomName, searchHomes } from './api';
import RentalMap from './Map';
import { HomeDetails, PointEditor } from './Dialogs';
import '@fontsource-variable/inter';
import './styles.css';

const EMPTY_LIST = [];
const blankPoint = { name: '', lat: null, lon: null, mode: 'walk', limit: 25 };

function savedHomes() {
  try {
    const value = JSON.parse(localStorage.getItem('closer.saved') || '{}');
    return value && !Array.isArray(value) && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

function Listing({ home, points, saved, onOpen, onSave }) {
  return (
    <article className="listing-card">
      <button className="listing-main" type="button" onClick={onOpen} aria-label={'Открыть квартиру: ' + home.address}>
        <img src={home.photo} alt="" loading="lazy" />
        <div className="listing-info">
          <div className="listing-price">{money(home.price)} <span>/ мес.</span></div>
          <h3>{roomName(home.rooms)} · {home.area} м²</h3>
          <p>{home.address}</p>
          <div className="times">
            {home.times.map((duration, index) => <span title={points[index]?.name} key={index}>
              <i className={'marker-' + index}>{index + 1}</i>{duration} мин
            </span>)}
          </div>
        </div>
      </button>
      <button className={'icon-button favorite' + (saved ? ' saved' : '')} type="button"
        aria-label={(saved ? 'Убрать из избранного: ' : 'В избранное: ') + home.address}
        aria-pressed={saved} onClick={onSave}><Heart size={18} /></button>
    </article>
  );
}

function Header({ tab, count, onChange }) {
  return <header className="site-header">
    <div className="header-inner">
      <button className="brand" onClick={() => onChange('search')} aria-label="Ближе. К поиску">
        <img src="/icon.svg" alt="" /><span>ближе<span className="brand-dot">.</span></span>
      </button>
      <nav className="navbar" aria-label="Разделы">
        <button aria-current={tab === 'search' ? 'page' : undefined} onClick={() => onChange('search')}><Search size={16} /> Поиск</button>
        <button aria-current={tab === 'saved' ? 'page' : undefined} onClick={() => onChange('saved')}><Heart size={16} /> Избранное{count > 0 && <span>{count}</span>}</button>
      </nav>
      <div className="city"><MapPin size={17} /> Воронеж</div>
    </div>
  </header>;
}

function App() {
  const [tab, setTab] = useState('search');
  const [config, setConfig] = useState(null);
  const [points, setPoints] = useState([]);
  const [applied, setApplied] = useState([]);
  const [budget, setBudget] = useState(null);
  const [rooms, setRooms] = useState('');
  const [sort, setSort] = useState('time');
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState({ loading: true, error: '' });
  const [editor, setEditor] = useState(null);
  const [picking, setPicking] = useState(null);
  const [active, setActive] = useState(null);
  const [favorites, setFavorites] = useState(savedHomes);
  const mapAnchor = useRef(null);
  const request = useRef(0);

  async function runSearch(nextPoints, nextBudget, nextRooms) {
    const current = ++request.current;
    setStatus({ loading: true, error: '' });
    try {
      const data = await searchHomes(nextPoints, nextBudget, nextRooms);
      if (current !== request.current) return;
      setApplied(nextPoints);
      setResult(data);
      setStatus({ loading: false, error: '' });
    } catch (error) {
      if (current === request.current) setStatus({ loading: false, error: error.message });
    }
  }

  async function load() {
    setStatus({ loading: true, error: '' });
    try {
      const data = await api('/config');
      setConfig(data);
      setPoints(data.points);
      setBudget(value => value ?? String(data.budget));
      await runSearch(data.points, data.budget, '');
    } catch (error) {
      setStatus({ loading: false, error: error.message });
    }
  }

  useEffect(() => { load(); }, []);
  useEffect(() => {
    try { localStorage.setItem('closer.saved', JSON.stringify(favorites)); } catch {}
  }, [favorites]);

  const homes = useMemo(() => {
    if (tab === 'saved') return Object.values(favorites);
    const list = result?.listings || EMPTY_LIST;
    return sort === 'price' ? [...list].sort((a, b) => a.price - b.price) : list;
  }, [tab, favorites, result, sort]);

  const openHome = useCallback(home => {
    setActive(home.routePoints ? home : { ...home, routePoints: applied });
  }, [applied]);

  function toggleFavorite(home) {
    setFavorites(current => {
      const next = { ...current };
      if (next[home.id]) delete next[home.id];
      else next[home.id] = { ...home, routePoints: home.routePoints || applied };
      return next;
    });
  }

  function savePoint(point) {
    setPoints(current => editor.isNew ? [...current, point] : current.map((old, index) => index === editor.index ? point : old));
    setEditor(null);
  }

  function startPicking(point) {
    setPicking({ ...editor, point });
    setEditor(null);
    setTimeout(() => mapAnchor.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 0);
  }

  function selectMapPoint(lat, lon) {
    setEditor({ ...picking, point: { ...picking.point, name: 'Точка на карте', lat, lon } });
    setPicking(null);
  }

  function cancelPick() {
    setEditor(picking);
    setPicking(null);
  }

  function switchTab(next) {
    setTab(next);
    setPicking(null);
  }

  return <>
    <Header tab={tab} count={Object.keys(favorites).length} onChange={switchTab} />
    <main className="page">
      {tab === 'search' ? <>
        <div className="intro">
          <div>
            <div className="eyebrow"><span /> ДОЛГОСРОЧНАЯ АРЕНДА</div>
            <h1>Жильё ближе <span>к делам.</span></h1>
            <p>Укажите важные места и найдите квартиру, откуда удобно до них добираться</p>
          </div>
          <details className="demo-note">
            <summary><Info size={16} /> Демо-каталог</summary>
            <p>Квартиры, цены и отзывы приведены для примера. Время в пути рассчитано по улицам Воронежа</p>
          </details>
        </div>
        <form className="search-panel" onSubmit={event => { event.preventDefault(); runSearch(points, budget, rooms); }}>
          <div className="destinations">
            <div className="field-label"><MapPin size={15} /> КУДА ВАМ НУЖНО</div>
            <div className="point-buttons">
              {points.map((point, index) => <button className="point-button" type="button" key={index}
                aria-label={'Изменить точку: ' + point.name} onClick={() => setEditor({ point, index, isNew: false })}>
                <span className={'point-index marker-' + index}>{index + 1}</span>
                <span className="point-text"><strong>{point.name}</strong>
                  <span>{point.mode === 'walk' ? <Footprints size={13} /> : <Car size={13} />}
                    {point.mode === 'walk' ? 'Пешком' : 'На машине'} · до {point.limit} мин</span>
                </span>
                <ChevronDown className="point-chevron" size={15} />
              </button>)}
              {config && points.length < 3 && <button className="add-point" type="button"
                onClick={() => setEditor({ point: blankPoint, index: points.length, isNew: true })}><Plus size={17} /> Добавить точку</button>}
            </div>
          </div>
          <div className="filters">
            <label className="filter-field">
              <span className="field-label"><SlidersHorizontal size={14} /> БЮДЖЕТ</span>
              <span className="number-field"><input aria-label="Бюджет в рублях" type="number" min="1000" max="150000" step="1"
                required value={budget ?? ''} onChange={event => setBudget(event.target.value)} /><span>₽</span></span>
            </label>
            <label className="filter-field room-filter">
              <span className="field-label">КОМНАТЫ</span>
              <span className="select-field">
                <select aria-label="Комнаты" value={rooms} onChange={event => setRooms(event.target.value)}>
                  <option value="">Любые</option><option value="0">Студия</option><option value="1">1 комната</option><option value="2">2 комнаты</option>
                </select><ChevronDown size={15} />
              </span>
            </label>
            <button className="primary-button search-button" disabled={!points.length || status.loading} type="submit">
              {status.loading ? 'Считаем…' : 'Найти жильё'} <ArrowRight size={20} />
            </button>
          </div>
        </form>
      </> : <div className="intro saved-intro">
        <div><h1>Избранное<span>.</span></h1><p>Квартиры, которые вы сохранили в этом браузере</p></div>
      </div>}

      {tab === 'search' && status.error && <div className="search-error" role="alert">{status.error}
        {!config && <button className="secondary-button" onClick={load}>Повторить</button>}
      </div>}

      <div className="workspace" ref={mapAnchor}>
        <RentalMap points={tab === 'search' ? (result ? applied : points) : EMPTY_LIST}
          result={tab === 'search' ? result : null} homes={homes} active={active?.id} onOpen={openHome}
          picking={Boolean(picking)} onPick={selectMapPoint} onCancel={cancelPick} />
        <section className="results" aria-label={tab === 'search' ? 'Результаты поиска' : 'Сохранённые квартиры'}>
          <div className="results-heading">
            <div>
              <h2>{tab === 'search' ? 'Подходящие квартиры' : 'Сохранённые квартиры'}</h2>
              <p aria-live="polite">{tab === 'search' && status.loading ? 'Рассчитываем время в пути…' :
                status.error && !result && tab === 'search' ? 'Не удалось получить результаты' : <>{homes.length} {plural(homes.length, ['вариант', 'варианта', 'вариантов'])}{tab === 'search' && ' в пределах бюджета'}</>}</p>
            </div>
            {tab === 'search' && <label className="sort">
              <ArrowDownWideNarrow size={16} />
              <select value={sort} aria-label="Сортировка" onChange={event => setSort(event.target.value)}>
                <option value="time">По времени</option><option value="price">По цене</option>
              </select><ChevronDown size={13} />
            </label>}
          </div>
          <div className="listing-list">
            {homes.map(home => <Listing key={home.id} home={home} points={home.routePoints || applied}
              saved={Boolean(favorites[home.id])} onOpen={() => openHome(home)} onSave={() => toggleFavorite(home)} />)}
            {!homes.length && (tab === 'saved' || (!status.loading && !status.error)) && <div className="empty">
              {tab === 'saved' ? <Heart size={27} /> : <House size={28} />}
              <h3>{tab === 'saved' ? 'Пока ничего не сохранено' : 'Квартиры не найдены'}</h3>
              <p>{tab === 'saved' ? 'Сохраните понравившийся вариант кнопкой с сердцем' : 'Попробуйте увеличить время в пути или изменить бюджет'}</p>
              {tab === 'saved' && <button className="secondary-button" onClick={() => switchTab('search')}>Перейти к поиску <ArrowRight size={16} /></button>}
            </div>}
            {!homes.length && tab === 'search' && status.loading && <div className="loading-bars" aria-hidden="true"><i /><i /><i /></div>}
          </div>
        </section>
      </div>

      <footer className="footer">
        <span>Ближе<span className="brand-dot">.</span> <span className="footer-separator">/</span> Воронеж</span>
        <span><Clock3 size={14} /> Время в пути приблизительное, без учёта пробок</span>
      </footer>
    </main>
    {editor && <PointEditor editor={editor} places={config.places} canRemove={!editor.isNew && points.length > 1}
      onClose={() => setEditor(null)} onSave={savePoint} onPick={startPicking}
      onRemove={() => { setPoints(current => current.filter((_, index) => index !== editor.index)); setEditor(null); }} />}
    {active && <HomeDetails key={active.id} home={active} points={active.routePoints} saved={Boolean(favorites[active.id])}
      onSave={() => toggleFavorite(active)} onClose={() => setActive(null)} />}
  </>;
}

function plural(number, words) {
  const ten = number % 10;
  const hundred = number % 100;
  if (hundred >= 11 && hundred <= 14) return words[2];
  return words[ten === 1 ? 0 : ten >= 2 && ten <= 4 ? 1 : 2];
}

createRoot(document.getElementById('root')).render(<App />);
