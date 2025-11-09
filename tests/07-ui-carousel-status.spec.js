import { test, expect } from '@playwright/test'
import path from 'path'

test.describe('Carousel & Status UI', () => {
  async function uploadFixture(page, name) {
    await page.goto('/')
    await page.click('#open-form')
    await page.fill('#name-input', name)
    await page.locator('#file-input').setInputFiles(
      path.join('tests', 'fixtures', 'test-image.jpg')
    )
    await page.click('button[type="submit"]')
    await page.waitForTimeout(1500)
  }

  async function expectObjectRemoved(request, url) {
    for (let attempt = 0; attempt < 6; attempt++) {
      const response = await request.get(url)
      if (response.status() === 404) return
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    const finalResponse = await request.get(url)
    expect(finalResponse.status()).toBe(404)
  }

  test('should sync carousel, gallery list and status badge', async ({ page }) => {
    const ts = Date.now()
    await uploadFixture(page, `Carousel Sync ${ts}`)
    await uploadFixture(page, `Carousel Sync ${ts + 1}`)

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await expect(page.locator('#carousel-prev')).toBeVisible()
    await expect(page.locator('#carousel-next')).toBeVisible()

    const badgeText = await page.locator('#server-number').innerText()
    expect(badgeText.trim()).toMatch(/^Serveur #\d+$/)
    expect(badgeText).not.toContain('read=')
    expect(badgeText).not.toContain('write=')

    await expect(page.locator('#image-caption')).toContainText('Carousel Sync')

    // Carousel displays recent uploads and reacts to navigation
    const cards = page.locator('#carousel-track .carousel-card')
    const cardCount = await cards.count()
    expect(cardCount).toBeGreaterThan(1)
    const activeBefore = await page.locator('#carousel-track .carousel-card.active h4').innerText()

    await page.click('#carousel-next')
    await page.waitForTimeout(300)
    const activeAfter = await page.locator('#carousel-track .carousel-card.active h4').innerText()
    expect(activeAfter).not.toBe(activeBefore)

    // Paginated list shows the same uploads with thumbnails
    const rows = page.locator('#images-table tbody tr')
    const rowCount = await rows.count()
    expect(rowCount).toBeGreaterThan(0)
    const firstRow = rows.first()
    await expect(firstRow.locator('td').nth(1)).toContainText('Carousel Sync')
    const thumbSrc = await firstRow.locator('img.thumbnail').getAttribute('src')
    expect(thumbSrc).toContain('/uploads/')

    const pageInfo = await page.locator('#page-info').innerText()
    expect(pageInfo).toMatch(/Page \d+\/\d+/)
  })

  test('should delete image and remove storage object', async ({ page }) => {
    const ts = Date.now()
    const name = `Delete Test ${ts}`
    await uploadFixture(page, name)

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const firstRow = page.locator('#images-table tbody tr').first()
    await expect(firstRow).toContainText(name)
    const thumbSrc = await firstRow.locator('img.thumbnail').getAttribute('src')

    page.once('dialog', (dialog) => dialog.accept())
    await firstRow.locator('button.icon-btn').click()

    const filteredRows = page.locator('#images-table tbody tr').filter({ hasText: name })
    await expect(filteredRows).toHaveCount(0)

    await expectObjectRemoved(page.request, thumbSrc)
  })
})

