import { expect, test } from '@playwright/test';

test('поиск, карточка, избранное и фильтры', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByText('8 вариантов в пределах бюджета')).toBeVisible();
  await expect(page.locator('.map-canvas canvas')).toBeVisible();
  const first = page.getByRole('button', { name: 'Открыть квартиру: Проспект Революции, 9А' });
  await first.click();
  await expect(page.getByRole('dialog').getByText('Время в пути')).toBeVisible();
  await page.getByText('2 объявления об этой квартире').click();
  await expect(page.getByText('Демо-объявление B')).toBeVisible();
  await page.getByText('Исходные отзывы').click();
  await expect(page.getByText(/набережной легко дойти/)).toBeVisible();
  await page.getByRole('button', { name: 'В избранное', exact: true }).click();
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.getByRole('navigation').getByRole('button', { name: /Избранное/ }).click();
  await expect(page.locator('.listing-card')).toHaveCount(1);
  await page.reload();
  await page.getByRole('navigation').getByRole('button', { name: /Избранное/ }).click();
  await expect(page.locator('.listing-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Поиск', exact: true }).click();
  await page.getByLabel('Бюджет в рублях').fill('1000');
  await page.getByRole('button', { name: 'Найти жильё' }).click();
  await expect(page.getByText('Квартиры не найдены')).toBeVisible();
  expect(errors).toEqual([]);
});

test('редактирование точки и новый поиск', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.listing-card')).toHaveCount(8);
  await page.getByRole('button', { name: 'Изменить точку: Площадь Ленина' }).click();
  await page.getByRole('button', { name: 'На машине' }).click();
  await page.getByLabel('Макс. минут').fill('15');
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByText('На машине · до 15 мин')).toBeVisible();
  const response = page.waitForResponse(r => r.url().endsWith('/api/search') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Найти жильё' }).click();
  expect((await response).request().postDataJSON().points[0]).toMatchObject({ mode: 'car', limit: 15 });
  await page.getByRole('button', { name: 'Добавить точку' }).click();
  await page.getByRole('button', { name: 'Выбрать на карте' }).click();
  await expect(page.getByText('Кликните по карте')).toBeVisible();
  await page.locator('.map-canvas').click({ position: { x: 380, y: 185 } });
  await page.getByLabel('Название точки').fill('Мой адрес');
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByRole('button', { name: 'Изменить точку: Мой адрес' })).toBeVisible();
});

test('на мобильном экран помещается по ширине', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByText('8 вариантов в пределах бюджета')).toBeAttached();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('локальная модель возвращает сводку с источниками', async ({ page }) => {
  test.skip(process.env.RENTAL_TEST_MODEL !== '1', 'Нужна локальная модель');
  test.setTimeout(70_000);
  await page.goto('/');
  await page.getByRole('button', { name: 'Открыть квартиру: Проспект Революции, 9А' }).click();
  await page.getByRole('button', { name: 'Сделать сводку' }).click();
  await expect(page.getByText('Локальная модель qwen2.5:1.5b')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('Отзыв 3')).toBeVisible();
});
