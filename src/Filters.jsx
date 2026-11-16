import React, { useState } from 'react';
import { Car, ChevronDown, Footprints, MapPin, Plus, RefreshCw, SlidersHorizontal, X } from 'lucide-react';
import { Modal } from './Dialogs';

const roomOptions = ['Студия', '1', '2', '3', '4+'];

function Numeric({ label, value, onChange, min = 0, placeholder }) {
  return <input type="number" inputMode="numeric" min={min} aria-label={label}
    value={value ?? ''} placeholder={placeholder} onChange={event => onChange(event.target.value === '' ? null : Number(event.target.value))} />;
}

export function Range({ title, low, high, onLow, onHigh, min }) {
  return <div className="range-input" role="group" aria-label={title}>
    <Numeric label={title + ' от'} value={low} onChange={onLow} min={min} placeholder="От" />
    <span aria-hidden="true">–</span>
    <Numeric label={title + ' до'} value={high} onChange={onHigh} min={min} placeholder="До" />
  </div>;
}

export function SearchFilters({ config, filters, change, editPoint, reset, showMore, clearArea, applyExample, refresh }) {
  const points = filters.points;
  const extraCount = [filters.size_min !== null || filters.size_max !== null,
    filters.floor_min !== null || filters.floor_max !== null,
    filters.no_first, filters.no_last, filters.no_commission].filter(Boolean).length;
  const toggleRoom = room => change({ rooms: filters.rooms.includes(room) ? filters.rooms.filter(value => value !== room) : [...filters.rooms, room] });
  return <section className="search-panel property-search" aria-label="Фильтры поиска">
    <div className="property-row">
      <label className="filter-field district-field">
        <span className="field-label"><MapPin size={15} /> РАЙОН</span>
        <span className="select-field">
          <select aria-label="Район" value={filters.district ?? ''} onChange={event => change({ district: event.target.value || null })}>
            <option value="">Весь Воронеж</option>
            {config?.districts.map(district => <option key={district}>{district}</option>)}
          </select><ChevronDown size={15} />
        </span>
      </label>
      <div className="filter-field">
        <span className="field-label" id="room-label">КОМНАТЫ</span>
        <div className="room-options" role="group" aria-labelledby="room-label">
          {roomOptions.map((label, index) => <button key={label} aria-pressed={filters.rooms.includes(index)} type="button"
            aria-label={index === 0 ? 'Студия' : 'Комнат: ' + label} onClick={() => toggleRoom(index)}>{label}</button>)}
        </div>
      </div>
      <div className="filter-field price-field">
        <span className="field-label">АРЕНДА, ₽ / МЕС.</span>
        <Range title="Цена" low={filters.price_min} high={filters.price_max}
          onLow={value => change({ price_min: value })} onHigh={value => change({ price_max: value })} />
      </div>
      <div className="property-actions">
        <button className="secondary-button more-filters" onClick={showMore}><SlidersHorizontal size={17} /> Фильтры{extraCount > 0 && <b>{extraCount}</b>}</button>
        <button className="reset-filters" onClick={reset}>Сбросить</button>
      </div>
    </div>
    {filters.area && <div className="area-chip">
      <MapPin size={15} /> Выбрана область карты
      <button className="icon-button" aria-label="Убрать область карты" onClick={clearArea}><X size={15} /></button>
    </div>}
    <div className="route-row">
      <div className="route-label">
        <strong>Время в пути</strong>
        <span>{points.length ? 'Из квартиры до каждой точки' : 'По желанию'}</span>
      </div>
      <div className="point-buttons">
        {points.map((point, index) => <button className="point-button" type="button" key={index}
          aria-label={'Изменить точку: ' + point.name} onClick={() => editPoint(index)}>
          <span className={'point-index marker-' + index}>{index + 1}</span>
          <span className="point-text"><strong>{point.name}</strong>
            <span>{point.mode === 'walk' ? <Footprints size={13} /> : <Car size={13} />}
              {point.mode === 'walk' ? 'Пешком' : 'На машине'} · до {point.limit} мин</span>
          </span><ChevronDown className="point-chevron" size={15} />
        </button>)}
        {config && points.length < 3 && <button className="add-point" type="button" onClick={() => editPoint(points.length)}><Plus size={17} /> Добавить точку</button>}
        {config && !points.length && <button className="example-button" type="button" onClick={applyExample}>Попробовать пример</button>}
      </div>
      {config?.traffic_configured && points.some(point => point.mode === 'car') &&
        <button className="icon-button" aria-label="Обновить время в пути" onClick={refresh}><RefreshCw size={18} /></button>}
    </div>
  </section>;
}

export function MoreFilters({ filters, onSave, onClose }) {
  const [values, setValues] = useState({
    size_min: filters.size_min, size_max: filters.size_max, floor_min: filters.floor_min, floor_max: filters.floor_max,
    no_first: filters.no_first, no_last: filters.no_last, no_commission: filters.no_commission,
  });
  const set = (key, value) => setValues(current => ({ ...current, [key]: value }));
  const invalid = [['size_min', 'size_max'], ['floor_min', 'floor_max']].some(([min, max]) =>
    values[min] !== null && values[max] !== null && values[min] > values[max]);
  return <Modal title="Параметры квартиры" onClose={onClose}>
    <form className="extra-filter-form" onSubmit={event => { event.preventDefault(); if (!invalid) onSave(values); }}>
      <div className="extra-fields">
        <div className="filter-field">
          <span className="field-label">ПЛОЩАДЬ, М²</span>
          <Range title="Площадь" low={values.size_min} high={values.size_max} onLow={value => set('size_min', value)} onHigh={value => set('size_max', value)} />
        </div>
        <div className="filter-field">
          <span className="field-label">ЭТАЖ</span>
          <Range title="Этаж" low={values.floor_min} high={values.floor_max} min={1} onLow={value => set('floor_min', value)} onHigh={value => set('floor_max', value)} />
        </div>
      </div>
      {[['no_first', 'Не первый этаж'], ['no_last', 'Не последний этаж'], ['no_commission', 'Без комиссии']].map(([key, label]) =>
        <label className="check-filter" key={key}><input type="checkbox" checked={values[key]} onChange={event => set(key, event.target.checked)} />{label}</label>
      )}
      {invalid && <p className="form-error" role="alert">Значение «от» должно быть меньше или равно значению «до»</p>}
      <div className="modal-actions"><button className="primary-button" disabled={invalid}>Применить</button></div>
    </form>
  </Modal>;
}
