import { test, expect } from '@playwright/test';

test.describe('Health & Monitoring', () => {
  
  test('should respond to health check endpoint', async ({ page }) => {
    const response = await page.request.get('/health');
    
    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(body).toBe('OK');
    
    console.log('✅ Health check: OK');
  });

  test('should provide server info via API', async ({ page }) => {
    const response = await page.request.get('/api/info');
    
    expect(response.status()).toBe(200);
    const data = await response.json();
    
    // Validate response structure
    expect(data).toHaveProperty('ip');
    expect(data).toHaveProperty('port');
    expect(data).toHaveProperty('serverNumber');
    
    console.log('Server Details:');
    console.log(`  IP: ${data.ip}`);
    console.log(`  Port: ${data.port}`);
    console.log(`  Server Number: ${data.serverNumber}`);
    
    expect(data.port).toBe(8000);
  });

  test('should fetch latest image from database', async ({ page }) => {
    const response = await page.request.get('/api/latest');
    
    expect(response.status()).toBe(200);
    const data = await response.json();
    
    expect(data).toHaveProperty('item');
    expect(data).toHaveProperty('serverNumber');
    
    if (data.item) {
      console.log('Latest image:');
      console.log(`  ID: ${data.item.id}`);
      console.log(`  Name: ${data.item.name}`);
      console.log(`  URL: ${data.item.imageUrl}`);
      console.log(`  Created: ${data.item.createdAt}`);
    } else {
      console.log('ℹ️  No images in database');
    }
    
    console.log(`✅ Served by server #${data.serverNumber}`);
  });

  test('should check HAProxy stats page', async ({ page }) => {
    // Try to access HAProxy stats
    const response = await page.request.get('http://192.168.64.10:8404/stats');
    
    expect(response.status()).toBe(200);
    const body = await response.text();
    
    // Check if HAProxy stats page is present
    expect(body).toContain('HAProxy');
    expect(body).toContain('Statistics Report');
    
    console.log('✅ HAProxy stats page accessible');
  });

  test('should verify both app servers are registered', async ({ page }) => {
    const response = await page.request.get('http://192.168.64.10:8404/stats');
    const body = await response.text();
    
    // Check if both app servers are mentioned
    const hasApp1 = body.includes('app1') || body.includes('192.168.64.13');
    const hasApp2 = body.includes('app2') || body.includes('192.168.64.16');
    
    console.log(`App1 registered: ${hasApp1}`);
    console.log(`App2 registered: ${hasApp2}`);
    
    expect(hasApp1).toBeTruthy();
    expect(hasApp2).toBeTruthy();
    
    console.log('✅ Both app servers are registered in HAProxy');
  });

  test('should measure response time', async ({ page }) => {
    const startTime = Date.now();
    
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const endTime = Date.now();
    const responseTime = endTime - startTime;
    
    console.log(`Response time: ${responseTime}ms`);
    
    // Should respond within reasonable time
    expect(responseTime).toBeLessThan(5000);
    
    if (responseTime < 1000) {
      console.log('✅ Excellent response time');
    } else if (responseTime < 2000) {
      console.log('✅ Good response time');
    } else {
      console.log('⚠️  Slow response time');
    }
  });

  test('should check console for errors', async ({ page }) => {
    const consoleErrors = [];
    
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    if (consoleErrors.length > 0) {
      console.log('❌ Console errors detected:');
      consoleErrors.forEach(err => console.log(`  - ${err}`));
    } else {
      console.log('✅ No console errors');
    }
    
    expect(consoleErrors.length).toBe(0);
  });

  test('should check for failed network requests', async ({ page }) => {
    const failedRequests = [];
    
    page.on('requestfailed', request => {
      failedRequests.push({
        url: request.url(),
        failure: request.failure().errorText
      });
    });
    
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    if (failedRequests.length > 0) {
      console.log('❌ Failed requests:');
      failedRequests.forEach(req => {
        console.log(`  - ${req.url}: ${req.failure}`);
      });
    } else {
      console.log('✅ All network requests successful');
    }
    
    expect(failedRequests.length).toBe(0);
  });
});

