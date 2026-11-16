import React, { useEffect, useRef, useState } from 'react';
import { LocateFixed, Minus, Plus, Scan, X } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api, money } from './api';

const center = [51.675, 39.205];
const bounds = [[51.611, 39.116], [51.737, 39.300]];
const pointColors = ['#5652a4', '#96533f', '#356c68'];
const zoneColors = ['#7568bc', '#ab705e', '#478881'];
const styles = {
  water: { color: '#d0d9e8', fillColor: '#dce5ed', fillOpacity: 1, weight: .8 },
  park: { color: '#e0e8d9', fillColor: '#e4ebdd', fillOpacity: 1, weight: .6 },
  rail: { color: '#c2c7bd', weight: 1.35, dashArray: '4 4' },
  path: { color: '#d3d8cd', weight: .75, opacity: .72 },
  street: { color: '#fffefa', weight: 1.7 },
  main: { color: '#fffefa', weight: 2.9 },
  arterial: { color: '#fffdf2', weight: 4.1 },
};
const roadOrder = ['park', 'water', 'path', 'street', 'rail', 'main', 'arterial'];
const labels = [
  ['ЦЕНТРАЛЬНЫЙ', 51.683, 39.211],
  ['ЛЕНИНСКИЙ', 51.655, 39.182],
  ['ЛЕВОБЕРЕЖНЫЙ', 51.659, 39.252],
  ['Воронежское\nводохранилище', 51.6615, 39.225],
  ['Воронеж-1', 51.6794, 39.2037],
  ['Адмиралтейская пл.', 51.6543, 39.214],
  ['парк «Алые паруса»', 51.655, 39.241],
  ['Чернавский мост', 51.6689, 39.233],
];

function textIcon(content, className, anchor) {
  const node = document.createElement('span');
  node.textContent = content;
  return L.divIcon({ className, html: node, iconAnchor: anchor, iconSize: [0, 0] });
}

export default function RentalMap({ points, result, homes, active, onOpen, area, onArea, picking, onPick, onCancel }) {
  const element = useRef(null);
  const mapRef = useRef(null);
  const clicks = useRef({ picking, onPick });
  const [mapError, setMapError] = useState(false);
  const [zoom, setZoom] = useState(null);
  clicks.current = { picking, onPick };

  useEffect(() => {
    const map = L.map(element.current, {
      zoomControl: false, attributionControl: false, preferCanvas: true,
      minZoom: 11, maxZoom: 17, zoomSnap: .25, maxBounds: bounds, maxBoundsViscosity: .8,
      scrollWheelZoom: false,
    }).setView(center, element.current.clientWidth < 500 ? 11.75 : 12.75);
    mapRef.current = { map, overlay: L.layerGroup().addTo(map) };
    setZoom(map.getZoom());
    map.on('zoomend', () => setZoom(map.getZoom()));
    for (const [name, lat, lon] of labels) {
      L.marker([lat, lon], {
        icon: textIcon(name, 'map-label' + (name.includes('водохранилище') ? ' water-label' : ''), [0, 0]),
        interactive: false, keyboard: false,
      }).addTo(map);
    }
    const controller = new AbortController();
    api('/map', { signal: controller.signal }).then(data => {
      const features = [...data.features].sort((a, b) => roadOrder.indexOf(a.properties.style) - roadOrder.indexOf(b.properties.style));
      L.geoJSON(features, { style: f => styles[f.properties.style], interactive: false }).addTo(map).bringToBack();
    }).catch(error => { if (error.name !== 'AbortError') setMapError(true); });

    map.on('click', event => {
      const { lat, lng } = event.latlng;
      if (clicks.current.picking && lat >= bounds[0][0] && lat <= bounds[1][0] && lng >= bounds[0][1] && lng <= bounds[1][1]) {
        clicks.current.onPick(lat, lng);
      }
    });
    const resize = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    resize.observe(element.current);
    return () => { controller.abort(); resize.disconnect(); map.remove(); };
  }, []);

  useEffect(() => {
    const { map, overlay } = mapRef.current;
    overlay.clearLayers();
    if (area) L.rectangle([[area.south, area.west], [area.north, area.east]], {
      color: '#3b4931', weight: 2, fill: false, dashArray: '7 6', interactive: false,
    }).addTo(overlay);
    result?.areas.forEach((area, index) => {
      if (area) L.geoJSON(area, {
        style: { color: zoneColors[index], opacity: .65, fillOpacity: .08, weight: 1.5, dashArray: '5 6' },
        interactive: false,
      }).addTo(overlay);
    });
    if (result?.overlap) L.geoJSON(result.overlap, {
      style: { color: '#859a29', fillColor: '#d6ee61', fillOpacity: .43, weight: 2 },
      interactive: false,
    }).addTo(overlay);

    points.forEach((point, index) => {
      const icon = textIcon(index + 1, 'map-destination marker-' + index, [16, 16]);
      L.marker([point.lat, point.lon], { icon, title: point.name, zIndexOffset: 400, interactive: false, keyboard: false }).addTo(overlay);
    });
    const groups = new Map();
    for (const home of homes) {
      const pixel = map.project([home.lat, home.lon], zoom ?? map.getZoom());
      const key = (zoom ?? map.getZoom()) < 14.5 ? [Math.round(pixel.x / 76), Math.round(pixel.y / 36)].join(':') : home.id;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(home);
    }
    for (const group of groups.values()) {
      const home = group[0];
      if (group.length > 1) {
        const groupBounds = L.latLngBounds(group.map(item => [item.lat, item.lon]));
        const badge = textIcon(group.length, 'map-cluster', [16, 16]);
        const marker = L.marker(groupBounds.getCenter(), {
          icon: badge, title: group.length + ' квартир. Приблизить', interactive: !picking, keyboard: !picking,
        });
        marker.on('click', () => map.fitBounds(groupBounds, { padding: [65, 80], maxZoom: 15 }));
        marker.addTo(overlay);
        continue;
      }
      const icon = textIcon(money(home.price), 'map-price' + (home.id === active ? ' active' : ''), [0, 13]);
      const marker = L.marker([home.lat, home.lon], { icon, title: home.address, interactive: !picking, keyboard: !picking, zIndexOffset: home.id === active ? 300 : 0 });
      marker.on('click', () => { if (!clicks.current.picking) onOpen(home); });
      marker.addTo(overlay);
    }
  }, [points, result, homes, active, onOpen, picking, area, zoom]);

  function reset() {
    const map = mapRef.current.map;
    const view = points.length ? L.latLngBounds(points.map(point => [point.lat, point.lon])) : null;
    if (view) {
      for (const home of homes) view.extend([home.lat, home.lon]);
      map.fitBounds(view, { padding: [45, 60], maxZoom: 14 });
    } else {
      map.setView(center, element.current.clientWidth < 500 ? 11.75 : 12.75);
    }
  }

  function useVisibleArea() {
    const view = mapRef.current.map.getBounds();
    const next = {
      south: Math.max(bounds[0][0], view.getSouth()), west: Math.max(bounds[0][1], view.getWest()),
      north: Math.min(bounds[1][0], view.getNorth()), east: Math.min(bounds[1][1], view.getEast()),
    };
    if (next.south < next.north && next.west < next.east) onArea(next);
  }

  useEffect(() => {
    if (points.length) reset();
  }, [points]);

  return (
    <section className={'map-panel' + (picking ? ' is-picking' : '')} aria-label="Карта Воронежа">
      <div ref={element} className="map-canvas" />
      <div className="map-status">
        {picking ? <>Кликните по карте <button className="icon-button" aria-label="Отменить выбор точки" onClick={onCancel}><X size={16} /></button></> :
          <><span className="status-dot" /> {mapError ? 'Схема улиц недоступна' : points.length ? 'Карта доступности' : 'Квартиры на карте'}</>}
      </div>
      <div className="map-tools">
        <div className="zoom">
          <button aria-label="Приблизить карту" onClick={() => mapRef.current.map.zoomIn()}><Plus size={19} /></button>
          <button aria-label="Отдалить карту" onClick={() => mapRef.current.map.zoomOut()}><Minus size={19} /></button>
        </div>
        <button aria-label="Показать всю область" onClick={reset}><LocateFixed size={18} /></button>
      </div>
      {onArea && !picking && <button className="map-area-button" type="button" onClick={useVisibleArea}>
        <Scan size={16} /> Искать в этой области
      </button>}
      {points.length > 0 && <div className="map-legend">
        <span><i className="legend-area" />{points.length > 1 ? 'Зона по всем точкам' : 'Зона доступности'}</span>
        {points.map((point, index) => <span key={index} title={point.name}><i style={{ background: pointColors[index] }}>{index + 1}</i>{point.name}</span>)}
      </div>}
      <a className="map-attribution" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a>
    </section>
  );
}
