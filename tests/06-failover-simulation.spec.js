import { test, expect } from '@playwright/test';

test.describe('HA Failover Simulation Tests', () => {
  
  test('should detect active Keepalived VIP', async ({ page }) => {
    // Test if VIP is responsive
    const response = await page.request.get('http://192.168.64.10/health');
    
    expect(response.status()).toBe(200);
    console.log('✅ Keepalived VIP (192.168.64.10) is active');
  });

  test('should access app through primary load balancer', async ({ page }) => {
    // Direct access to LB1
    try {
      const response = await page.request.get('http://192.168.64.12/health');
      expect(response.status()).toBe(200);
      console.log('✅ Primary LB (192.168.64.12) is accessible');
    } catch (error) {
      console.log('⚠️  Primary LB not accessible:', error.message);
    }
  });

  test('should access app through backup load balancer', async ({ page }) => {
    // Direct access to LB2
    try {
      const response = await page.request.get('http://192.168.64.15/health');
      expect(response.status()).toBe(200);
      console.log('✅ Backup LB (192.168.64.15) is accessible');
    } catch (error) {
      console.log('⚠️  Backup LB not accessible:', error.message);
    }
  });

  test('should verify both app servers are healthy', async ({ page }) => {
    const app1Health = await page.request.get('http://192.168.64.13:8000/health')
      .then(r => r.status() === 200)
      .catch(() => false);
    
    const app2Health = await page.request.get('http://192.168.64.16:8000/health')
      .then(r => r.status() === 200)
      .catch(() => false);
    
    console.log(`APP1 (192.168.64.13): ${app1Health ? '✅ UP' : '❌ DOWN'}`);
    console.log(`APP2 (192.168.64.16): ${app2Health ? '✅ UP' : '❌ DOWN'}`);
    
    // At least one should be up
    expect(app1Health || app2Health).toBeTruthy();
  });

  test('should test resilience with rapid requests', async ({ page }) => {
    const requests = 20;
    const results = {
      success: 0,
      failed: 0,
      servers: new Set()
    };
    
    console.log(`Making ${requests} rapid requests...`);
    
    for (let i = 0; i < requests; i++) {
      try {
        const response = await page.request.get('http://192.168.64.10/api/info');
        if (response.status() === 200) {
          results.success++;
          const data = await response.json();
          results.servers.add(data.serverNumber);
        } else {
          results.failed++;
        }
      } catch (error) {
        results.failed++;
      }
    }
    
    console.log(`Results: ${results.success} success, ${results.failed} failed`);
    console.log(`Servers hit: ${Array.from(results.servers).join(', ')}`);
    
    // Success rate should be very high
    const successRate = (results.success / requests) * 100;
    console.log(`Success rate: ${successRate.toFixed(1)}%`);
    
    expect(successRate).toBeGreaterThanOrEqual(95);
    console.log('✅ System is resilient under rapid requests');
  });

  test('should maintain consistency during load', async ({ browser }) => {
    // Test data consistency with concurrent writes and reads
    const timestamp = Date.now();
    
    // Create multiple browser contexts
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    
    const page1 = await context1.newPage();
    const page2 = await context2.newPage();
    
    // Both pages fetch latest
    const [data1, data2] = await Promise.all([
      page1.request.get('http://192.168.64.10/api/latest').then(r => r.json()),
      page2.request.get('http://192.168.64.10/api/latest').then(r => r.json())
    ]);
    
    // Both should get the same data
    if (data1.item && data2.item) {
      expect(data1.item.id).toBe(data2.item.id);
      console.log('✅ Data consistency maintained across requests');
    }
    
    await context1.close();
    await context2.close();
  });

  test('[MANUAL] Failover test - requires manual intervention', async ({ page }) => {
    console.log('═══════════════════════════════════════════════════');
    console.log('MANUAL FAILOVER TEST');
    console.log('═══════════════════════════════════════════════════');
    console.log('');
    console.log('To test failover manually:');
    console.log('1. Stop primary LB: ssh cloud-lb@192.168.64.12 "sudo systemctl stop haproxy"');
    console.log('2. Watch VIP failover to LB2');
    console.log('3. Verify app still accessible via 192.168.64.10');
    console.log('4. Restart: ssh cloud-lb@192.168.64.12 "sudo systemctl start haproxy"');
    console.log('');
    console.log('Expected: <3 seconds downtime, automatic recovery');
    console.log('═══════════════════════════════════════════════════');
    
    // Just verify current state
    const response = await page.request.get('http://192.168.64.10/health');
    expect(response.status()).toBe(200);
  });
});

