import { test, expect } from '@playwright/test';

/**
 * Continuous monitoring test suite
 * Can be run periodically to monitor system health
 */

test.describe('System Health Monitoring', () => {
  
  test('Infrastructure Health Check', async ({ page }) => {
    console.log('');
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║     HIGH AVAILABILITY SYSTEM HEALTH CHECK       ║');
    console.log('╚══════════════════════════════════════════════════╝');
    console.log('');
    
    const checks = {
      vip: false,
      lb1: false,
      lb2: false,
      app1: false,
      app2: false,
      haproxy: false,
      database: false,
      storage: false
    };
    
    // Check VIP
    console.log('🔍 Checking Keepalived VIP...');
    try {
      const vipResponse = await page.request.get('http://192.168.64.10/health');
      checks.vip = vipResponse.status() === 200;
      console.log(`   ${checks.vip ? '✅' : '❌'} VIP (192.168.64.10): ${checks.vip ? 'UP' : 'DOWN'}`);
    } catch (e) {
      console.log(`   ❌ VIP (192.168.64.10): DOWN - ${e.message}`);
    }
    
    // Check Load Balancers
    console.log('');
    console.log('🔍 Checking Load Balancers...');
    try {
      const lb1Response = await page.request.get('http://192.168.64.12/health');
      checks.lb1 = lb1Response.status() === 200;
      console.log(`   ${checks.lb1 ? '✅' : '❌'} LB1 (192.168.64.12): ${checks.lb1 ? 'UP' : 'DOWN'}`);
    } catch (e) {
      console.log(`   ❌ LB1 (192.168.64.12): DOWN`);
    }
    
    try {
      const lb2Response = await page.request.get('http://192.168.64.15/health');
      checks.lb2 = lb2Response.status() === 200;
      console.log(`   ${checks.lb2 ? '✅' : '❌'} LB2 (192.168.64.15): ${checks.lb2 ? 'UP' : 'DOWN'}`);
    } catch (e) {
      console.log(`   ❌ LB2 (192.168.64.15): DOWN`);
    }
    
    // Check App Servers
    console.log('');
    console.log('🔍 Checking Application Servers...');
    try {
      const app1Response = await page.request.get('http://192.168.64.13:8000/health');
      checks.app1 = app1Response.status() === 200;
      
      if (checks.app1) {
        const info1 = await page.request.get('http://192.168.64.13:8000/api/info');
        const data1 = await info1.json();
        console.log(`   ✅ APP1 (192.168.64.13:8000): UP - Server #${data1.serverNumber}`);
      }
    } catch (e) {
      console.log(`   ❌ APP1 (192.168.64.13:8000): DOWN`);
    }
    
    try {
      const app2Response = await page.request.get('http://192.168.64.16:8000/health');
      checks.app2 = app2Response.status() === 200;
      
      if (checks.app2) {
        const info2 = await page.request.get('http://192.168.64.16:8000/api/info');
        const data2 = await info2.json();
        console.log(`   ✅ APP2 (192.168.64.16:8000): UP - Server #${data2.serverNumber}`);
      }
    } catch (e) {
      console.log(`   ❌ APP2 (192.168.64.16:8000): DOWN`);
    }
    
    // Check HAProxy Stats
    console.log('');
    console.log('🔍 Checking HAProxy Statistics...');
    try {
      const statsResponse = await page.request.get('http://192.168.64.10:8404/stats');
      checks.haproxy = statsResponse.status() === 200;
      console.log(`   ${checks.haproxy ? '✅' : '❌'} HAProxy Stats: ${checks.haproxy ? 'ACCESSIBLE' : 'UNAVAILABLE'}`);
    } catch (e) {
      console.log(`   ❌ HAProxy Stats: UNAVAILABLE`);
    }
    
    // Check Database via API
    console.log('');
    console.log('🔍 Checking Database Connection...');
    try {
      const latestResponse = await page.request.get('http://192.168.64.10/api/latest');
      checks.database = latestResponse.status() === 200;
      console.log(`   ${checks.database ? '✅' : '❌'} Database: ${checks.database ? 'CONNECTED' : 'ERROR'}`);
      
      if (checks.database) {
        const data = await latestResponse.json();
        if (data.item) {
          console.log(`      Latest record: "${data.item.name}" (ID: ${data.item.id})`);
        } else {
          console.log(`      Database empty (no records)`);
        }
      }
    } catch (e) {
      console.log(`   ❌ Database: ERROR`);
    }
    
    // Check MinIO Storage
    console.log('');
    console.log('🔍 Checking Object Storage...');
    try {
      // Check if we can access uploaded files
      const latest = await page.request.get('http://192.168.64.10/api/latest');
      const latestData = await latest.json();
      
      if (latestData.item && latestData.item.imageUrl) {
        const imageResponse = await page.request.get(`http://192.168.64.10${latestData.item.imageUrl}`);
        checks.storage = imageResponse.status() === 200;
        console.log(`   ${checks.storage ? '✅' : '❌'} MinIO Storage: ${checks.storage ? 'ACCESSIBLE' : 'ERROR'}`);
      } else {
        console.log(`   ℹ️  MinIO Storage: No files to verify`);
        checks.storage = true; // Assume OK if no files
      }
    } catch (e) {
      console.log(`   ❌ MinIO Storage: ERROR`);
    }
    
    // Summary
    console.log('');
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║                  SUMMARY                         ║');
    console.log('╚══════════════════════════════════════════════════╝');
    
    const totalChecks = Object.keys(checks).length;
    const passedChecks = Object.values(checks).filter(v => v).length;
    const healthPercentage = ((passedChecks / totalChecks) * 100).toFixed(1);
    
    console.log(`Health Score: ${passedChecks}/${totalChecks} (${healthPercentage}%)`);
    console.log('');
    
    Object.entries(checks).forEach(([key, value]) => {
      console.log(`  ${value ? '✅' : '❌'} ${key.toUpperCase()}`);
    });
    
    console.log('');
    console.log('═══════════════════════════════════════════════════');
    console.log('');
    
    // Critical checks must pass
    expect(checks.vip).toBeTruthy();
    expect(checks.app1 || checks.app2).toBeTruthy(); // At least one app server
    expect(checks.database).toBeTruthy();
  });
});

