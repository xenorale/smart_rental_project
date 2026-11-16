import { expect, test } from '@playwright/test';

test('квартиры фильтруются сразу, комнаты выбираются вместе', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const list = page.getByRole('region', { name: 'Результаты поиска' });
  await expect(list.getByText('25 вариантов по вашим условиям')).toBeVisible();
  await page.getByRole('button', { name: 'Комнат: 3' }).click();
  await expect(list.locator('.listing-card')).toHaveCount(2);
  await page.getByRole('button', { name: 'Комнат: 4+' }).click();
  await expect(list.locator('.listing-card')).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Комнат: 3' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Фильтры', exact: true }).click();
  await page.getByText('Не последний этаж', { exact: true }).click();
  await page.getByRole('button', { name: 'Применить' }).click();
  await expect(list.locator('.listing-card')).toHaveCount(2);
  await page.getByLabel('Район', { exact: true }).selectOption('Советский');
  await expect(list.locator('.listing-card')).toHaveCount(1);
  const home = page.getByRole('button', { name: 'Открыть квартиру: Маршака, 14' });
  await expect(home).toBeVisible();
  await home.click();
  await page.getByRole('button', { name: 'В избранное', exact: true }).click();
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.getByRole('navigation').getByRole('button', { name: /Избранное/ }).click();
  await expect(home).toBeVisible();
  await page.reload();
  await page.getByRole('navigation').getByRole('button', { name: /Избранное/ }).click();
  await expect(home).toBeVisible();
  expect(errors).toEqual([]);
});

test('Кольцовская и Галерея дают результат, замена на Арену даёт пустую выдачу', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Попробовать пример' }).click();
  const home = page.getByRole('button', { name: 'Открыть квартиру: Кольцовская, 35А' });
  await expect(home).toBeVisible();
  await expect(page.getByText('1 вариант по вашим условиям')).toBeVisible();
  await home.click();
  await expect(page.getByRole('link', { name: 'Маршрут в Яндекс Картах: Кольцовская, 24' })).toHaveAttribute('href', /rtt=auto$/);
  await expect(page.getByRole('link', { name: 'Маршрут в Яндекс Картах: Галерея Чижова' })).toHaveAttribute('href', /rtt=pd$/);
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.getByRole('button', { name: 'Изменить точку: Галерея Чижова' }).click();
  await page.getByLabel('Адрес или место').fill('арена');
  await page.getByRole('button', { name: /ТРК Арена/ }).click();
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByText('К сожалению, ничего не подобрали')).toBeVisible();
  await expect(page.getByText('Пешком · до 5 мин')).toBeVisible();
});

test('можно выбрать адрес, видимую область карты и снять ограничение', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Искать в этой области' }).click();
  await expect(page.getByText('Выбрана область карты')).toBeVisible();
  await page.getByRole('button', { name: 'Убрать область карты' }).click();
  await expect(page.getByText('Выбрана область карты')).toHaveCount(0);
  await page.getByRole('button', { name: 'Добавить точку' }).click();
  await page.getByLabel('Адрес или место').fill('Кольцовская 35А');
  await page.getByRole('button', { name: /Кольцовская улица, 35А/ }).click();
  await page.getByLabel('Макс. минут').fill('5');
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByText('Пешком · до 5 мин')).toBeVisible();
  await page.getByRole('button', { name: 'Изменить точку: Кольцовская улица, 35А' }).click();
  await page.getByRole('button', { name: 'Удалить точку' }).click();
  await expect(page.getByRole('button', { name: 'Попробовать пример' })).toBeVisible();
});

test('на мобильном экран помещается по ширине', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('.listing-card').first()).toBeAttached();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('в карточке есть квартира, дом и район, модель выдаёт цитаты', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Открыть квартиру: Проспект Революции, 9А' }).click();
  await expect(page.getByText('Комиссия', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Район', exact: true }).click();
  await expect(page.getByRole('dialog').getByText('Центральный', { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog').getByText('Расстояния по прямой · OpenStreetMap')).toBeVisible();
  await page.getByRole('button', { name: 'Дом', exact: true }).click();
  await expect(page.getByText('Этажей в доме')).toBeVisible();
  await page.getByText('Исходные отзывы').click();
  await expect(page.getByText(/набережной легко дойти/)).toBeVisible();
  if (process.env.RENTAL_TEST_MODEL === '1') {
    test.setTimeout(70_000);
    await page.getByRole('button', { name: 'Сделать сводку' }).click();
    await expect(page.getByText('Локальная модель qwen2.5:1.5b')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('Отзыв 3')).toBeVisible();
  }
});
