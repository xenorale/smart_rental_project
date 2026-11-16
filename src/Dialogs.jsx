import React, { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Car, Footprints, Heart, MapPin, Sparkles, X } from 'lucide-react';
import { api, money, roomName } from './api';

export function Modal({ title, onClose, children, className = '' }) {
  const dialog = useRef(null);
  useEffect(() => { dialog.current.showModal(); }, []);
  return (
    <dialog ref={dialog} className={'modal ' + className}
      onCancel={event => { event.preventDefault(); onClose(); }}
      onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="modal-inner">
        <div className="modal-heading">
          <h2>{title}</h2>
          <button className="icon-button" aria-label="Закрыть" onClick={onClose}><X size={22} /></button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

export function PointEditor({ editor, places, canRemove, onClose, onSave, onRemove, onPick }) {
  const [point, setPoint] = useState(editor.point);
  const change = (key, value) => setPoint(p => ({ ...p, [key]: value }));
  const isPreset = places.some(p => p.lat === point.lat && p.lon === point.lon);
  const canSubmit = point.name.trim() && Number.isFinite(point.lat) && point.limit >= 5 && point.limit <= 60;
  return (
    <Modal title={editor.isNew ? 'Новая точка' : 'Изменить точку'} onClose={onClose}>
      <form className="point-editor" onSubmit={event => {
        event.preventDefault();
        if (canSubmit) onSave({ ...point, name: point.name.trim(), limit: Number(point.limit) });
      }}>
        <fieldset>
          <legend>Куда нужно добираться</legend>
          <div className="place-list">
            {places.map(place => <button key={place.id} type="button"
              className={point.lat === place.lat && point.lon === place.lon ? 'selected' : ''}
              onClick={() => setPoint(p => ({ ...p, name: place.name, lat: place.lat, lon: place.lon }))}>
              <MapPin size={16} /><span>{place.name}<small>{place.hint}</small></span>
            </button>)}
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
            <input type="number" min="5" max="60" required value={point.limit} onChange={event => change('limit', event.target.value)} />
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

export function HomeDetails({ home, points, saved, onSave, onClose }) {
  const [reviews, setReviews] = useState(null);
  const [summary, setSummary] = useState(null);
  const [status, setStatus] = useState({ loading: false, error: '' });
  useEffect(() => {
    const controller = new AbortController();
    api('/homes/' + home.id, { signal: controller.signal }).then(data => setReviews(data.reviews))
      .catch(error => { if (error.name !== 'AbortError') setReviews([]); });
    return () => controller.abort();
  }, [home.id]);

  async function summarize() {
    setStatus({ loading: true, error: '' });
    try {
      setSummary(await api('/homes/' + home.id + '/summary', { method: 'POST' }));
      setStatus({ loading: false, error: '' });
    } catch (error) {
      setStatus({ loading: false, error: error.message });
    }
  }
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
        {home.times.map((time, index) => <div key={index}>
          <span className={'point-index marker-' + index}>{index + 1}</span>
          <span>{points[index]?.name || 'Точка ' + (index + 1)}</span>
          <strong>{time} мин</strong>
        </div>)}
      </div>}
      {home.offers.length > 1 && <details className="detail-offers">
        <summary>{home.offers.length} объявления об этой квартире <ArrowUpRight size={15} /></summary>
        {home.offers.map(offer => <div key={offer.name}>{offer.name}<strong>{money(offer.price)}</strong></div>)}
      </details>}
      <section className="review-section">
        <h3><Sparkles size={19} /> Что пишут о доме</h3>
        <p>Сводка по демонстрационным отзывам</p>
        {!summary && <button className="secondary-button" onClick={summarize} disabled={status.loading}>
          {status.loading ? 'Читаем отзывы…' : 'Сделать сводку'} <ArrowUpRight size={16} />
        </button>}
        {status.error && <p className="error" role="alert">{status.error}</p>}
        {summary && <div className="review-summary" aria-live="polite">
          {[['pros', 'Плюсы'], ['cons', 'Минусы']].map(([key, title]) => <div key={key}>
            <strong>{title}</strong>
            {summary[key].length ? summary[key].map(item => <p key={item.source}>
              «{item.quote}» <small>Отзыв {item.source}</small>
            </p>) : <p>Недостаточно данных</p>}
          </div>)}
          <small>Локальная модель {summary.model}</small>
        </div>}
        {reviews && <details className="raw-reviews">
          <summary>Исходные отзывы</summary>
          {reviews.length ? <ol>{reviews.map(review => <li key={review}>{review}</li>)}</ol> : <p>Отзывы недоступны</p>}
        </details>}
      </section>
    </Modal>
  );
}
