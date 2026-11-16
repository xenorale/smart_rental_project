import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowDownWideNarrow, ArrowRight, ChevronDown, Clock3, Heart, House, Info, MapPin, Search } from 'lucide-react';
import { api, money, roomName, searchHomes } from './api';
import RentalMap from './Map';
import { HomeDetails, PointEditor } from './Dialogs';
import { MoreFilters, SearchFilters } from './Filters';
import '@fontsource-variable/inter';
import './styles.css';

const EMPTY_LIST = [];
const emptyPoint = { name: '', lat: null, lon: null, mode: 'walk', limit: 20 };
const defaultFilters = {
  district: null, area: null, price_min: null, price_max: 45000, rooms: [], points: [],
  size_min: null, size_max: null, floor_min: null, floor_max: null, no_first: false, no_last: false, no_commission: false,
};

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
          {home.times.length ? <div className="times">
            {home.times.map((duration, index) => <span title={points[index]?.name} key={index}>
              <i className={'marker-' + index}>{index + 1}</i>{duration} мин
            </span>)}
          </div> : <span className="listing-floor">Этаж {home.floor} · {home.district}</span>}
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
  const [filters, setFilters] = useState(defaultFilters);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [sort, setSort] = useState('price');
  const [editor, setEditor] = useState(null);
  const [picking, setPicking] = useState(null);
  const [more, setMore] = useState(false);
  const [active, setActive] = useState(null);
  const [favorites, setFavorites] = useState(savedHomes);
  const mapAnchor = useRef(null);
  const points = filters.points;
  const applied = result?.points ?? EMPTY_LIST;

  useEffect(() => {
    const controller = new AbortController();
    api('/config', { signal: controller.signal }).then(setConfig).catch(error => {
      if (error.name !== 'AbortError') setError(error.message);
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (filters.price_min !== null && filters.price_max !== null && filters.price_min > filters.price_max) {
      setError('Цена «от» должна быть не выше цены «до»');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const data = await searchHomes(filters, controller.signal);
        if (!controller.signal.aborted) setResult({ ...data, points: filters.points });
      } catch (error) {
        if (!controller.signal.aborted) setError(error.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [filters, refreshKey]);

  useEffect(() => {
    try { localStorage.setItem('closer.saved', JSON.stringify(favorites)); } catch {}
  }, [favorites]);

  const homes = useMemo(() => {
    if (tab === 'saved') return Object.values(favorites);
    const list = result?.listings ?? EMPTY_LIST;
    return [...list].sort((a, b) => {
      const byTime = (home) => home.times.reduce((sum, time) => sum + time, 0);
      return (sort === 'time' ? byTime(a) - byTime(b) : 0) || a.price - b.price;
    });
  }, [tab, favorites, result, sort]);

  const openHome = useCallback(home => {
    setActive(home.routePoints ? home : { ...home, routePoints: applied, routeSource: result?.route_source });
  }, [applied, result?.route_source]);

  function changeFilters(change) {
    setFilters(current => ({ ...current, ...change }));
  }

  function toggleFavorite(home) {
    setFavorites(current => {
      const next = { ...current };
      if (next[home.id]) delete next[home.id];
      else next[home.id] = { ...home, routePoints: home.routePoints || applied, routeSource: home.routeSource || result?.route_source };
      return next;
    });
  }

  function editPoint(index) {
    setEditor({ point: points[index] ?? emptyPoint, index, isNew: !points[index] });
  }

  function savePoint(point) {
    changeFilters({ points: editor.isNew ? [...points, point] : points.map((old, index) => index === editor.index ? point : old) });
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

  function switchTab(next) {
    setTab(next);
    setPicking(null);
  }

  function applyExample() {
    const [first, second] = ['kolts24', 'gallery'].map(id => config.places.find(place => place.id === id));
    changeFilters({ points: [{ ...first, mode: 'car', limit: 20 }, { ...second, mode: 'walk', limit: 5 }] });
  }

  const isSearch = tab === 'search';

  return <>
    <Header tab={tab} count={Object.keys(favorites).length} onChange={switchTab} />
    <main className="page">
      {isSearch ? <>
        <div className="intro">
          <div>
            <div className="eyebrow"><span /> ДОЛГОСРОЧНАЯ АРЕНДА</div>
            <h1>Снять квартиру <span>в Воронеже.</span></h1>
            <p>Выберите район и параметры жилья. Если важно время в дороге, добавьте свои точки</p>
          </div>
          <details className="demo-note">
            <summary><Info size={16} /> Демо-каталог</summary>
            <p>Квартиры, цены и отзывы приведены для примера. Время в пути рассчитано по дорожной сети города</p>
          </details>
        </div>
        <SearchFilters config={config} filters={filters} change={changeFilters} editPoint={editPoint}
          reset={() => { setFilters(defaultFilters); setSort('price'); }}
          showMore={() => setMore(true)} clearArea={() => changeFilters({ area: null })}
          applyExample={applyExample} refresh={() => setRefreshKey(value => value + 1)} />
      </> : <div className="intro saved-intro">
        <div><h1>Избранное<span>.</span></h1><p>Квартиры, которые вы сохранили в этом браузере</p></div>
      </div>}

      {isSearch && error && <div className="search-error" role="alert">{error}</div>}
      {isSearch && !loading && result?.route_source === 'fallback' &&
        <div className="search-error" role="status">Пробки сейчас недоступны. Показываем расчёт по дорожной сети OpenStreetMap</div>}

      <div className="workspace" ref={mapAnchor}>
        <RentalMap points={isSearch ? applied : EMPTY_LIST} result={isSearch ? result : null}
          homes={homes} active={active?.id} onOpen={openHome}
          area={isSearch ? filters.area : null} onArea={isSearch ? area => changeFilters({ area }) : undefined}
          picking={Boolean(picking)} onPick={selectMapPoint} onCancel={() => { setEditor(picking); setPicking(null); }} />
        <section className="results" aria-label={isSearch ? 'Результаты поиска' : 'Сохранённые квартиры'}>
          <div className="results-heading">
            <div>
              <h2>{isSearch ? 'Квартиры' : 'Сохранённые квартиры'}</h2>
              <p aria-live="polite">{isSearch && loading ? 'Обновляем подбор…' :
                <>{homes.length} {plural(homes.length, ['вариант', 'варианта', 'вариантов'])}{isSearch && ' по вашим условиям'}</>}</p>
            </div>
            {isSearch && <label className="sort">
              <ArrowDownWideNarrow size={16} />
              <select value={applied.length ? sort : 'price'} aria-label="Сортировка" onChange={event => setSort(event.target.value)}>
                <option value="price">По цене</option><option value="time" disabled={!applied.length}>По времени</option>
              </select><ChevronDown size={13} />
            </label>}
          </div>
          <div className={'listing-list' + (isSearch && loading ? ' updating' : '')}>
            {homes.map(home => <Listing key={home.id} home={home} points={home.routePoints || applied}
              saved={Boolean(favorites[home.id])} onOpen={() => openHome(home)} onSave={() => toggleFavorite(home)} />)}
            {!homes.length && (!isSearch || (!loading && !error)) && <div className="empty">
              {isSearch ? <House size={28} /> : <Heart size={27} />}
              <h3>{isSearch ? 'К сожалению, ничего не подобрали' : 'Пока ничего не сохранено'}</h3>
              <p>{!isSearch ? 'Сохраните понравившийся вариант кнопкой с сердцем' : result?.property_matches && points.length ?
                'В демо-каталоге нет квартиры, которая укладывается во все лимиты. Попробуйте дать больше времени на дорогу' :
                'Попробуйте расширить область на карте или изменить фильтры квартиры'}</p>
              {!isSearch && <button className="secondary-button" onClick={() => switchTab('search')}>Перейти к поиску <ArrowRight size={16} /></button>}
            </div>}
            {!homes.length && isSearch && loading && <div className="loading-bars" aria-hidden="true"><i /><i /><i /></div>}
          </div>
        </section>
      </div>

      <footer className="footer">
        <span>Ближе<span className="brand-dot">.</span> <span className="footer-separator">/</span> Воронеж</span>
        <span><Clock3 size={14} /> {isSearch && result?.route_source === 'traffic' ?
          'Время на машине с пробками от Яндекс Карт · заливка по графу OSM' :
          'Время в пути по OpenStreetMap, без учёта пробок'}</span>
      </footer>
    </main>
    {editor && <PointEditor editor={editor} places={config.places} canRemove={!editor.isNew}
      onClose={() => setEditor(null)} onSave={savePoint} onPick={startPicking}
      onRemove={() => { changeFilters({ points: points.filter((_, index) => index !== editor.index) }); setEditor(null); }} />}
    {more && <MoreFilters filters={filters} onClose={() => setMore(false)} onSave={values => { changeFilters(values); setMore(false); }} />}
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
