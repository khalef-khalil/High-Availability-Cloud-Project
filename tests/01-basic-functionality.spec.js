import { test, expect } from '@playwright/test';

test.describe('Basic Application Functionality', () => {
  
  test('should load the application homepage', async ({ page }) => {
    await page.goto('/');
    
    // Check page title
    await expect(page).toHaveTitle(/Cloud Project/i);
    
    // Check main elements exist
    await expect(page.locator('#container')).toBeVisible();
    await expect(page.locator('#info-bar')).toBeVisible();
    await expect(page.locator('#image-wrapper')).toBeVisible();
  });

  test('should display server information', async ({ page }) => {
    await page.goto('/');
    
    // Check server number is displayed
    const serverNumber = page.locator('#server-number');
    await expect(serverNumber).toBeVisible();
    
    const serverText = await serverNumber.textContent();
    console.log('Connected to server:', serverText);
    
    // Server number should be 1 or 2
    expect(serverText).toMatch(/serveur.*[12]/i);
  });

  test('should show "Open Form" button', async ({ page }) => {
    await page.goto('/');
    
    const openFormButton = page.locator('#open-form');
    await expect(openFormButton).toBeVisible();
    await expect(openFormButton).toHaveText(/Ouvrir le formulaire/i);
  });

  test('should open upload form dialog', async ({ page }) => {
    await page.goto('/');
    
    // Click the open form button
    await page.click('#open-form');
    
    // Check dialog is visible
    const dialog = page.locator('#form-dialog');
    await expect(dialog).toBeVisible();
    
    // Check form elements
    await expect(page.locator('#name-input')).toBeVisible();
    await expect(page.locator('#file-input')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('should close form dialog', async ({ page }) => {
    await page.goto('/');
    
    // Open dialog
    await page.click('#open-form');
    await expect(page.locator('#form-dialog')).toBeVisible();
    
    // Close dialog
    await page.click('#close-form');
    
    // Dialog should be hidden
    const dialog = page.locator('#form-dialog');
    await expect(dialog).not.toBeVisible();
  });

  test('should validate required fields', async ({ page }) => {
    await page.goto('/');
    
    // Open form
    await page.click('#open-form');
    
    // Try to submit without filling fields
    await page.click('button[type="submit"]');
    
    // HTML5 validation should prevent submission
    const nameInput = page.locator('#name-input');
    const fileInput = page.locator('#file-input');
    
    // Check required attributes
    await expect(nameInput).toHaveAttribute('required', '');
    await expect(fileInput).toHaveAttribute('required', '');
  });
});

