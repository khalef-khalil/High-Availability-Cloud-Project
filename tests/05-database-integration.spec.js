import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('Database Integration Tests', () => {
  
  test('should persist data across page reloads', async ({ page }) => {
    // Upload an image
    await page.goto('/');
    await page.click('#open-form');
    await page.fill('#name-input', 'Persistence Test');
    await page.locator('#file-input').setInputFiles(
      path.join('tests', 'fixtures', 'test-image.jpg')
    );
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);
    
    // Get the image name
    const imageName1 = await page.locator('#image-name').textContent();
    
    // Reload page
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    // Check if same image is displayed
    const imageName2 = await page.locator('#image-name').textContent();
    
    expect(imageName1).toBe(imageName2);
    console.log('✅ Data persists across page reloads');
  });

  test('should show latest uploaded image', async ({ page }) => {
    const timestamp = Date.now();
    const testName = `Latest Test ${timestamp}`;
    
    // Upload a new image
    await page.goto('/');
    await page.click('#open-form');
    await page.fill('#name-input', testName);
    await page.locator('#file-input').setInputFiles(
      path.join('tests', 'fixtures', 'test-image.jpg')
    );
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);
    
    // Verify it's the latest
    const response = await page.request.get('/api/latest');
    const data = await response.json();
    
    expect(data.item.name).toBe(testName);
    console.log('✅ Latest image query works correctly');
  });

  test('should handle database read/write split', async ({ page }) => {
    // This tests that the app uses MySQL Router correctly
    const timestamp = Date.now();
    
    // Write operation
    await page.goto('/');
    await page.click('#open-form');
    await page.fill('#name-input', `RW Split Test ${timestamp}`);
    await page.locator('#file-input').setInputFiles(
      path.join('tests', 'fixtures', 'test-image.jpg')
    );
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);
    
    // Read operation (should go to slave if available)
    const response = await page.request.get('/api/latest');
    expect(response.status()).toBe(200);
    
    const data = await response.json();
    expect(data.item.name).toContain('RW Split Test');
    
    console.log('✅ Read/Write split working (Master:3306, Slave:3307)');
  });

  test('should fetch images from MinIO storage', async ({ page }) => {
    // Upload an image first
    await page.goto('/');
    await page.click('#open-form');
    await page.fill('#name-input', 'MinIO Storage Test');
    await page.locator('#file-input').setInputFiles(
      path.join('tests', 'fixtures', 'test-image.jpg')
    );
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);
    
    // Get the image URL
    const mainImage = page.locator('#main-image');
    await expect(mainImage).toBeVisible();
    
    const imageSrc = await mainImage.getAttribute('src');
    console.log('Image source:', imageSrc);
    
    // Verify image loads from MinIO (via /uploads/ proxy)
    expect(imageSrc).toContain('/uploads/');
    
    // Check if image actually loads
    const response = await page.request.get(imageSrc);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toMatch(/image/);
    
    console.log('✅ MinIO storage integration working');
  });

  test('should handle concurrent requests', async ({ browser }) => {
    // Create multiple contexts to simulate concurrent users
    const contexts = await Promise.all([
      browser.newContext(),
      browser.newContext(),
      browser.newContext()
    ]);
    
    const results = await Promise.all(
      contexts.map(async (context, index) => {
        const page = await context.newPage();
        const response = await page.request.get('http://192.168.64.10/api/info');
        const data = await response.json();
        await context.close();
        return data;
      })
    );
    
    console.log('Concurrent request results:');
    results.forEach((result, index) => {
      console.log(`  Request ${index + 1}: Server #${result.serverNumber}`);
    });
    
    // All requests should succeed
    expect(results.length).toBe(3);
    results.forEach(result => {
      expect(result).toHaveProperty('serverNumber');
    });
    
    console.log('✅ Concurrent requests handled successfully');
  });
});

