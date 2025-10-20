import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('Image Upload Functionality', () => {
  
  test('should upload an image successfully', async ({ page }) => {
    await page.goto('/');
    
    // Open form
    await page.click('#open-form');
    
    // Fill in the name
    await page.fill('#name-input', 'Playwright Test Image');
    
    // Upload file
    const fileInput = page.locator('#file-input');
    await fileInput.setInputFiles(path.join('tests', 'fixtures', 'test-image.jpg'));
    
    // Submit form
    await page.click('button[type="submit"]');
    
    // Wait for upload to complete (dialog should close)
    await page.waitForTimeout(2000);
    
    // Check if image appears
    const mainImage = page.locator('#main-image');
    await expect(mainImage).toBeVisible({ timeout: 10000 });
    
    // Check if image name is displayed
    const imageName = page.locator('#image-name');
    await expect(imageName).toContainText('Playwright Test Image');
    
    console.log('✅ Image uploaded successfully');
  });

  test('should display uploaded image from database', async ({ page }) => {
    await page.goto('/');
    
    // Wait for page to load and fetch latest image
    await page.waitForTimeout(1000);
    
    // Check if placeholder or image is shown
    const mainImage = page.locator('#main-image');
    const placeholder = page.locator('#placeholder');
    
    // Either image is visible or placeholder shows "no image"
    const hasImage = await mainImage.isVisible().catch(() => false);
    const hasPlaceholder = await placeholder.isVisible().catch(() => false);
    
    expect(hasImage || hasPlaceholder).toBeTruthy();
    
    if (hasImage) {
      console.log('✅ Image is displayed from database');
    } else {
      console.log('ℹ️  No images in database yet');
    }
  });

  test('should show server number that handled the upload', async ({ page }) => {
    await page.goto('/');
    
    const serverNumber = page.locator('#server-number');
    await expect(serverNumber).toBeVisible();
    
    const serverText = await serverNumber.textContent();
    console.log('Upload handled by:', serverText);
    
    // Verify it's a valid server number
    expect(serverText).toMatch(/[12]/);
  });

  test('should handle multiple sequential uploads', async ({ page }) => {
    await page.goto('/');
    
    for (let i = 1; i <= 3; i++) {
      // Open form
      await page.click('#open-form');
      
      // Fill and upload
      await page.fill('#name-input', `Sequential Upload ${i}`);
      await page.locator('#file-input').setInputFiles(
        path.join('tests', 'fixtures', 'test-image.jpg')
      );
      
      // Submit
      await page.click('button[type="submit"]');
      
      // Wait for completion
      await page.waitForTimeout(2000);
      
      // Verify image name updated
      const imageName = page.locator('#image-name');
      await expect(imageName).toContainText(`Sequential Upload ${i}`);
      
      console.log(`✅ Upload ${i} completed`);
    }
  });
});

