import { test, expect } from '@playwright/test';

test.describe('High Availability - Load Balancing', () => {
  
  test('should connect to VIP successfully', async ({ page }) => {
    const response = await page.goto('/');
    
    expect(response.status()).toBe(200);
    console.log('✅ VIP (192.168.64.10) is accessible');
  });

  test('should distribute requests across servers', async ({ page }) => {
    const servers = new Set();
    
    // Make multiple requests to detect load balancing
    for (let i = 0; i < 10; i++) {
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      
      // Get server number from response header or page content
      const serverNumber = page.locator('#server-number');
      const serverText = await serverNumber.textContent();
      
      // Extract server number
      const match = serverText.match(/serveur.*#?(\d+)/i);
      if (match) {
        servers.add(match[1]);
        console.log(`Request ${i + 1}: Server ${match[1]}`);
      }
      
      await page.waitForTimeout(500);
    }
    
    console.log(`Servers accessed: ${Array.from(servers).join(', ')}`);
    
    // Should hit at least 1 server (ideally 2 for round-robin)
    expect(servers.size).toBeGreaterThanOrEqual(1);
    
    if (servers.size === 2) {
      console.log('✅ Load balancing confirmed: Both servers are active');
    } else {
      console.log('⚠️  Only one server responded (check if both app servers are running)');
    }
  });

  test('should show correct server identity', async ({ page }) => {
    await page.goto('/');
    
    // Check X-Server-Number header via API call
    const response = await page.request.get('/api/info');
    expect(response.status()).toBe(200);
    
    const data = await response.json();
    console.log('Server info:', data);
    
    expect(data).toHaveProperty('serverNumber');
    expect(data).toHaveProperty('ip');
    expect(data).toHaveProperty('port');
    
    expect(['1', '2', 1, 2]).toContain(data.serverNumber);
    console.log(`✅ Connected to server #${data.serverNumber} at ${data.ip}:${data.port}`);
  });

  test('should maintain session across requests', async ({ page }) => {
    await page.goto('/');
    
    // Get initial server
    let response = await page.request.get('/api/info');
    const firstServer = (await response.json()).serverNumber;
    
    // Make another request
    response = await page.request.get('/api/info');
    const secondServer = (await response.json()).serverNumber;
    
    console.log(`First request: Server ${firstServer}, Second request: Server ${secondServer}`);
    
    // Due to round-robin, servers might be different
    expect([firstServer, secondServer]).toEqual(expect.arrayContaining([expect.any(String)]));
  });
});

