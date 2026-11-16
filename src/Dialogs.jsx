import React, { useEffect, useId, useRef, useState } from 'react';
import { ArrowUpRight, Car, Footprints, Heart, MapPin, Search, Sparkles, X } from 'lucide-react';
import { api, mapsRoute, money, roomName } from './api';

export function Modal({ title, onClose, children, className = '' }) {
  const dialog = useRef(null);
  const titleId = useId();
  useEffect(() => { dialog.current.showModal(); }, []);
  return (
    <dialog ref={dialog} aria-labelledby={titleId} className={'modal ' + className}
      onCancel={event => { event.preventDefault(); onClose(); }}
      onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="modal-inner">
        <div className="modal-heading">
          <h2 id={titleId}>{title}</h2>
          <button className="icon-button" aria-label="Закрыть" onClick={onClose}><X size={22} /></button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

export function PointEditor({ editor, places, canRemove, onClose, onSave, onRemove, onPick }) {
  const [point, setPoint] = useState(editor.point);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState(null);
  const change = (key, value) => setPoint(p => ({ ...p, [key]: value }));
  const isPreset = places.some(p => p.lat === point.lat && p.lon === point.lon);
  const canSubmit = point.name.trim() && Number.isFinite(point.lat) && Number.isInteger(Number(point.limit)) && point.limit >= 1 && point.limit <= 90;

  useEffect(() => {
    if (!query.trim()) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api('/places?q=' + encodeURIComponent(query.trim()), { signal: controller.signal })
        .then(setSuggestions).catch(error => { if (error.name !== 'AbortError') setSuggestions([]); });
    }, 180);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query]);

  const options = query.trim() ? suggestions : [
    ...['kolts24', 'gallery', 'arena'].map(id => places.find(place => place.id === id)),
    ...places.filter(place => !['kolts24', 'gallery', 'arena'].includes(place.id)),
  ].filter(Boolean);

  return (
    <Modal title={editor.isNew ? 'Новая точка' : 'Изменить точку'} onClose={onClose}>
      <form className="point-editor" onSubmit={event => {
        event.preventDefault();
        if (canSubmit) onSave({ ...point, name: point.name.trim(), limit: Number(point.limit) });
      }}>
        <fieldset>
          <legend>Куда нужно добираться</legend>
          <label className="place-search"><Search size={17} />
            <input type="search" aria-label="Адрес или место" value={query} maxLength={80} placeholder="Улица, номер дома или место"
              onChange={event => { setSuggestions(null); setQuery(event.target.value); }} />
          </label>
          <div className="place-list" aria-label="Подсказки адресов">
            {options?.map(place => <button key={place.id} type="button"
              className={point.lat === place.lat && point.lon === place.lon ? 'selected' : ''}
              onClick={() => setPoint(p => ({ ...p, name: place.name, lat: place.lat, lon: place.lon }))}>
              <MapPin size={16} /><span>{place.name}<small>{place.hint}</small></span>
            </button>)}
            {options?.length === 0 && <p>Адрес не найден. Уточните запрос или выберите точку на карте</p>}
            {!options && <p role="status">Ищем адрес…</p>}
          </div>
          <button className="secondary-button map-pick-button" type="button" onClick={() => onPick(point)}>
            <MapPin size={17} /> {isPreset || !Number.isFinite(point.lat) ? 'Выбрать на карте' : 'Перенести точку на карте'}
          </button>
          {Number.isFinite(point.lat) && !isPreset && <label className="field">Название точки
            <input value={point.name} maxLength={80} required onChange={event => change('name', event.target.value)} />
          </label>}
        </fieldset>
        <div className="editor-settings">
          <fieldset>
            <legend>Как добираться</legend>
            <div className="segmented">
              <button type="button" aria-pressed={point.mode === 'walk'} onClick={() => change('mode', 'walk')}><Footprints size={17} /> Пешком</button>
              <button type="button" aria-pressed={point.mode === 'car'} onClick={() => change('mode', 'car')}><Car size={17} /> На машине</button>
            </div>
          </fieldset>
          <label className="field">Макс. минут
            <input type="number" min="1" max="90" required value={point.limit} onChange={event => change('limit', event.target.value)} />
          </label>
        </div>
        <div className="modal-actions">
          {canRemove && <button className="text-button" type="button" onClick={onRemove}>Удалить точку</button>}
          <button className="primary-button" disabled={!canSubmit}>Сохранить</button>
        </div>
      </form>
    </Modal>
  );
}

const sections = [['flat', 'Квартира'], ['building', 'Дом'], ['district', 'Район']];

function PropertyNotes({ homeId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [scope, setScope] = useState('flat');
  const [summary, setSummary] = useState({});
  const [pending, setPending] = useState(null);
  const [errors, setErrors] = useState({});
  const summaryRequest = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    api('/homes/' + homeId, { signal: controller.signal }).then(value => setData(value.sections))
      .catch(error => { if (error.name !== 'AbortError') setError(error.message); });
    return () => { controller.abort(); summaryRequest.current?.abort(); };
  }, [homeId]);

  async function summarize() {
    setPending(scope);
    setErrors(previous => ({ ...previous, [scope]: '' }));
    const controller = new AbortController();
    summaryRequest.current = controller;
    try {
      const value = await api('/homes/' + homeId + '/summary?scope=' + scope, { method: 'POST', signal: controller.signal });
      setSummary(previous => ({ ...previous, [scope]: value }));
    } catch (error) {
      if (!controller.signal.aborted) setErrors(previous => ({ ...previous, [scope]: error.message }));
    } finally {
      if (!controller.signal.aborted) setPending(null);
    }
  }

  const current = data?.[scope];
  const result = summary[scope];
  return <section className="property-notes" aria-label="Квартира, дом и район">
    <div className="section-tabs" role="group" aria-label="Что посмотреть">
      {sections.map(([key, label]) => <button key={key} type="button" aria-pressed={scope === key} onClick={() => setScope(key)}>{label}</button>)}
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {current && <>
      <dl className="fact-list">
        {current.facts.map(fact => <div key={fact.label}>
          <dt>{fact.label}</dt>
          <dd>{fact.osm ? <a href={fact.osm} target="_blank" rel="noreferrer" title="Объект на OpenStreetMap">{fact.value} <ArrowUpRight size={13} /></a> : fact.value}</dd>
        </div>)}
      </dl>
      {scope === 'district' && current.facts.some(fact => fact.osm) && <p className="nearby-note">Расстояния по прямой · OpenStreetMap</p>}
      <section className="review-section">
        <h3><Sparkles size={19} /> Что пишут</h3>
        <p>Демонстрационные отзывы</p>
        {!result && !!current.reviews.length && <button className="secondary-button" onClick={summarize} disabled={pending !== null}>
          {pending === scope ? 'Читаем отзывы…' : 'Сделать сводку'} <ArrowUpRight size={16} />
        </button>}
        {errors[scope] && <p className="error" role="alert">{errors[scope]}</p>}
        {result && <div className="review-summary" aria-live="polite">
          {[['pros', 'Плюсы'], ['cons', 'Минусы']].map(([key, title]) => <div key={key}>
            <strong>{title}</strong>
            {result[key].length ? result[key].map(item => <p key={item.source}>«{item.quote}» <small>Отзыв {item.source}</small></p>) : <p>Недостаточно данных</p>}
          </div>)}
          <small>Локальная модель {result.model}</small>
        </div>}
        <details className="raw-reviews" key={scope}>
          <summary>Исходные отзывы</summary>
          {current.reviews.length ? <ol>{current.reviews.map(review => <li key={review}>{review}</li>)}</ol> : <p>Отзывов пока нет</p>}
        </details>
      </section>
    </>}
  </section>;
}

export function HomeDetails({ home, points, saved, onSave, onClose }) {
  return (
    <Modal title={home.address} onClose={onClose} className="home-modal">
      <img className="detail-photo" src={home.photo} alt="Пример интерьера" />
      <div className="detail-price">
        <div><strong>{money(home.price)}</strong> <span>/ мес.</span><p>{roomName(home.rooms)} · {home.area} м² · этаж {home.floor}</p></div>
        <button className={'icon-button favorite' + (saved ? ' saved' : '')}
          aria-label={saved ? 'Убрать из избранного' : 'В избранное'} aria-pressed={saved} onClick={onSave}><Heart size={20} /></button>
      </div>
      {home.times?.length > 0 && <div className="detail-routes">
        <h3>Время в пути</h3>
        {home.times.map((time, index) => {
          const point = points[index];
          return <div key={index}>
            <span className={'point-index marker-' + index}>{index + 1}</span>
            <span>{point?.name || 'Точка ' + (index + 1)}</span>
            <strong>{time} мин</strong>
            {point && <a className="route-link" href={mapsRoute(home, point)} target="_blank" rel="noreferrer"
              aria-label={'Маршрут в Яндекс Картах: ' + point.name}>На карте <ArrowUpRight size={13} /></a>}
          </div>;
        })}
        <p>{home.routeSource === 'traffic' ? 'Автомобильное время с пробками на момент подбора' : 'Расчёт по OpenStreetMap, без учёта пробок'}</p>
      </div>}
      {home.offers.length > 1 && <details className="detail-offers">
        <summary>{home.offers.length} объявления об этой квартире <ArrowUpRight size={15} /></summary>
        {home.offers.map(offer => <div key={offer.name}>{offer.name}<strong>{money(offer.price)}</strong></div>)}
      </details>}
      <PropertyNotes homeId={home.id} />
    </Modal>
  );
}
