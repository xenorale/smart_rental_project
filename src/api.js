export async function api(path, options = {}) {
  const response = await fetch('/api' + path, options);
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(typeof result.detail === 'string' ? result.detail : 'Не удалось загрузить данные. Попробуйте ещё раз');
  }
  return response.json();
}

export function searchHomes(query, signal) {
  return api('/search', {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(query),
  });
}

export const money = value => new Intl.NumberFormat('ru-RU').format(value) + ' ₽';
export const roomName = rooms => rooms === 0 ? 'Студия' : rooms + '-комнатная';

export function mapsRoute(home, point) {
  const params = new URLSearchParams({
    rtext: home.lat + ',' + home.lon + '~' + point.lat + ',' + point.lon,
    rtt: point.mode === 'car' ? 'auto' : 'pd',
  });
  return 'https://yandex.ru/maps/?' + params;
}
