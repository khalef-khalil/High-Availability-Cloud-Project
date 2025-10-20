# Playwright Testing Guide

Automated testing suite for the High Availability Cloud Application using Playwright.

## 🎯 Overview

This project includes comprehensive automated tests that verify:
- ✅ Basic application functionality
- ✅ Image upload and storage
- ✅ Load balancing and HA features
- ✅ Health monitoring and failover
- ✅ Database integration
- ✅ System resilience

## 📦 Installation

Playwright is already installed. If you need to reinstall browsers:

```bash
npx playwright install chromium
```

## 🚀 Running Tests

### All Tests
```bash
npm test
```

### Specific Test Suites

**Basic Functionality Tests**
```bash
npm run test:basic
```

**High Availability Tests**
```bash
npm run test:ha
```

**Health Monitoring**
```bash
npm run test:health
```

**System Monitor (Quick Health Check)**
```bash
npm run test:monitor
```

### Interactive Mode

**UI Mode (Recommended for Development)**
```bash
npm run test:ui
```

**Headed Mode (See Browser)**
```bash
npm run test:headed
```

### View Test Report
```bash
npm run test:report
```

## 📋 Test Suites

### 1. Basic Functionality (`01-basic-functionality.spec.js`)
- Page loading and rendering
- Form dialog interactions
- Server number display
- UI element visibility

### 2. Upload Functionality (`02-upload-functionality.spec.js`)
- Image upload process
- Form validation
- Data persistence
- Sequential uploads

### 3. HA Load Balancing (`03-ha-load-balancing.spec.js`)
- VIP accessibility
- Round-robin distribution
- Server identity verification
- Session management

### 4. Health Monitoring (`04-health-monitoring.spec.js`)
- Health check endpoints
- API responses
- HAProxy stats
- Response time measurement
- Console error detection
- Network request monitoring

### 5. Database Integration (`05-database-integration.spec.js`)
- Data persistence across reloads
- Latest image queries
- Read/write split verification
- MinIO storage integration
- Concurrent request handling

### 6. Failover Simulation (`06-failover-simulation.spec.js`)
- VIP failover detection
- Load balancer redundancy
- App server health checks
- Rapid request resilience
- Data consistency during load
- Manual failover instructions

### 7. System Monitor (`monitor.spec.js`)
- Comprehensive infrastructure health check
- Real-time status of all components
- Health score calculation
- Critical component validation

## 🔍 Test Configuration

Configuration is in `playwright.config.js`:

```javascript
{
  baseURL: 'http://192.168.64.10',  // VIP address
  workers: 1,                         // Sequential execution
  fullyParallel: false,              // For proper HA testing
  timeout: 30000,                    // 30 second timeout
}
```

## 📊 Test Results

After running tests, view results:

```bash
# Open HTML report
npm run test:report

# Results are saved in:
# - test-results/       (screenshots, videos)
# - playwright-report/  (HTML report)
```

## 🎥 Screenshots and Videos

- **Screenshots**: Captured on test failure
- **Videos**: Recorded on test failure
- **Traces**: Available for debugging

View in the HTML report or in `test-results/` directory.

## 🧪 Writing New Tests

Create a new test file in `tests/`:

```javascript
import { test, expect } from '@playwright/test';

test.describe('My New Tests', () => {
  test('should do something', async ({ page }) => {
    await page.goto('/');
    // Your test code
  });
});
```

## 🏥 Continuous Monitoring

Run the monitor test periodically to check system health:

```bash
# Run every 5 minutes (example using watch)
watch -n 300 "npm run test:monitor"

# Or set up a cron job:
# */5 * * * * cd /path/to/project && npm run test:monitor >> /var/log/ha-monitor.log 2>&1
```

## 📈 CI/CD Integration

Add to your CI/CD pipeline:

```yaml
# Example GitHub Actions
- name: Install Playwright
  run: npm install

- name: Install Playwright Browsers
  run: npx playwright install --with-deps chromium

- name: Run Playwright tests
  run: npm test

- name: Upload test results
  if: always()
  uses: actions/upload-artifact@v3
  with:
    name: playwright-report
    path: playwright-report/
```

## 🐛 Debugging Tests

### Run in Debug Mode
```bash
npx playwright test --debug
```

### Run Specific Test
```bash
npx playwright test tests/01-basic-functionality.spec.js --debug
```

### View Trace
```bash
npx playwright show-trace test-results/trace.zip
```

## ✅ Best Practices

1. **Run tests against VIP** (192.168.64.10) to test the full HA stack
2. **Check HAProxy stats** to verify load distribution
3. **Monitor console logs** during tests for errors
4. **Use headed mode** for visual debugging
5. **Review test reports** after each run

## 🚨 Troubleshooting

### Tests Fail to Connect
```bash
# Check if VIP is accessible
curl http://192.168.64.10/health

# Check if app servers are running
ssh cloud-app1@192.168.64.13 "systemctl status cloud-app"
ssh cloud-app1@192.168.64.16 "systemctl status cloud-app"
```

### Slow Tests
```bash
# Increase timeout in playwright.config.js
timeout: 60000  // 60 seconds

# Or per test:
test('my slow test', async ({ page }) => {
  test.setTimeout(60000);
  // ...
});
```

### Browser Installation Issues
```bash
# Reinstall browsers
npx playwright install --force chromium
```

## 📚 Documentation

- [Playwright Documentation](https://playwright.dev)
- [Test API Reference](https://playwright.dev/docs/api/class-test)
- [Best Practices](https://playwright.dev/docs/best-practices)

## 🎯 Test Coverage

Current test coverage:
- ✅ Frontend functionality
- ✅ API endpoints
- ✅ Load balancing
- ✅ Database operations
- ✅ File storage (MinIO)
- ✅ Health monitoring
- ✅ Failover scenarios

## 🔄 Next Steps

Consider adding:
- [ ] Performance testing (load tests)
- [ ] Security testing (XSS, CSRF)
- [ ] Accessibility testing
- [ ] Mobile responsiveness tests
- [ ] API contract testing
- [ ] Database replication lag tests

---

**Happy Testing! 🎭**

