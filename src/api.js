export async function api(path, options = {}) {
  const response = await fetch('/api' + path, options);
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(typeof result.detail === 'string' ? result.detail : 'Не удалось загрузить данные. Попробуйте ещё раз');
  }
  return response.json();
}

export function searchHomes(points, budget, rooms) {
  return api('/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ points, budget: Number(budget), rooms: rooms === '' ? null : Number(rooms) }),
  });
}

export const money = value => new Intl.NumberFormat('ru-RU').format(value) + ' ₽';
export const roomName = rooms => rooms === 0 ? 'Студия' : rooms + '-комнатная';
