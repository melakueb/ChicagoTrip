import { expect, test } from '@playwright/test'

test('mobile agenda edits, undo, favorites, and persistence', async ({
  page,
}) => {
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: 'Chicago Getaway' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Unstar Millennium Park' }).click()
  await page.getByRole('button', { name: 'Add stop', exact: true }).click()
  await page
    .getByRole('textbox', { name: 'Find a place' })
    .fill('Chicago Theatre')
  await page
    .getByRole('button', { name: 'Chicago Theatre Marquee The Loop' })
    .click()
  await page
    .getByRole('combobox', { name: 'Day', exact: true })
    .selectOption('3')
  await page
    .getByRole('combobox', { name: 'Scheduling mode' })
    .selectOption('Fixed time')
  await page.getByLabel('Start time (CT)').fill('13:15')
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Add stop' })
    .click()
  await expect(page.getByText('1:15 PM')).toBeVisible()
  await page.reload()
  await expect(
    page.getByRole('button', { name: 'Star Millennium Park' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'SUN Jan 3 Day 3' }).click()
  await page
    .getByRole('button', { name: 'Actions for Chicago Theatre Marquee' })
    .click()
  await page.getByRole('button', { name: 'Remove stop' }).click()
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByText('1:15 PM')).toBeVisible()
  await page.getByRole('button', { name: 'Trip', exact: true }).click()
  await page.getByRole('button', { name: 'Restore original itinerary' }).click()
  await page
    .getByRole('button', { name: 'Restore itinerary', exact: true })
    .click()
  await page.getByRole('button', { name: 'Agenda', exact: true }).click()
  await page.getByRole('button', { name: 'SUN Jan 3 Day 3' }).click()
  await expect(page.getByText('1:15 PM')).toHaveCount(0)
})

test('offline reload, map synchronization and location denial', async ({
  page,
  context,
}) => {
  await page.addInitScript(() => {
    navigator.geolocation.getCurrentPosition = (_ok, error) =>
      error?.({
        code: 1,
        message: 'Denied',
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Actions for Primark' }).click()
  await page.getByRole('button', { name: 'Mark skipped' }).click()
  await page.getByRole('button', { name: 'Map', exact: true }).first().click()
  await expect(page.getByText('Local route diagram')).toBeVisible()
  await page.getByRole('button', { name: 'Use my location' }).click()
  await expect(
    page.getByText('Location unavailable.', { exact: false }),
  ).toBeVisible()
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await context.setOffline(true)
  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'Chicago Getaway' }),
  ).toBeVisible()
  await expect(page.getByText('Skipped', { exact: true })).toBeVisible()
})

test('local discovery adds a bakery to Chinatown and updates the map', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'SUN Jan 3 Day 3' }).click()
  await page.getByRole('button', { name: 'Discover', exact: true }).click()
  await page.getByRole('button', { name: 'Bakeries', exact: true }).click()
  await expect(
    page.getByText('Live search is unconfigured.', { exact: false }),
  ).toBeVisible()
  const result = page
    .getByRole('article')
    .filter({ hasText: 'Chiu Quon Bakery' })
  await result.getByRole('button', { name: 'Add to agenda' }).click()
  await expect(page.getByRole('combobox', { name: 'Position' })).toHaveValue(
    '1',
  )
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Add stop' })
    .click()
  await page.getByRole('button', { name: 'List', exact: true }).click()
  await page
    .getByRole('button', { name: 'Actions for Chiu Quon Bakery' })
    .click()
  await page.getByRole('button', { name: 'Move up', exact: true }).click()
  await expect(page.locator('[data-stop]').first()).toContainText(
    'Chiu Quon Bakery',
  )
  await page.getByRole('button', { name: 'Map', exact: true }).first().click()
  await expect(
    page.getByRole('button', { name: 'Chiu Quon Bakery', exact: true }),
  ).toHaveText('1')
})
