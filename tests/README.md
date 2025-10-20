# Automated Test Suite

## Quick Start

```bash
# Run all tests
npm test

# Quick health check
npm run test:monitor

# Interactive UI mode
npm run test:ui
```

## Test Suites

| Suite | Command | Description |
|-------|---------|-------------|
| **Monitor** | `npm run test:monitor` | Quick infrastructure health check |
| **Basic** | `npm run test:basic` | UI and upload functionality |
| **HA Tests** | `npm run test:ha` | Load balancing and failover |
| **Health** | `npm run test:health` | API endpoints and monitoring |
| **All** | `npm test` | Complete test suite |

## Test Files

1. **01-basic-functionality.spec.js** - UI rendering and interactions
2. **02-upload-functionality.spec.js** - Image upload workflows
3. **03-ha-load-balancing.spec.js** - Load balancer verification
4. **04-health-monitoring.spec.js** - Health checks and API tests
5. **05-database-integration.spec.js** - Database and storage tests
6. **06-failover-simulation.spec.js** - HA failover scenarios
7. **monitor.spec.js** - System health monitoring

## Key Features Tested

✅ **Application Functionality**
- Page loading and rendering
- Form interactions
- Image uploads
- Data persistence

✅ **High Availability**
- VIP accessibility (192.168.64.10)
- Load balancing (round-robin)
- Server redundancy
- Failover resilience

✅ **Infrastructure**
- HAProxy load balancing
- MySQL read/write split
- MinIO object storage
- Keepalived VIP

✅ **Monitoring**
- Health endpoints
- API responses
- Console errors
- Network requests
- Performance metrics

## Test Results

View the latest test report:
```bash
npm run test:report
```

Results include:
- Test pass/fail status
- Screenshots on failure
- Videos of failed tests
- Performance metrics
- Console logs

## Continuous Monitoring

Set up automated monitoring:

```bash
# Run every 5 minutes
*/5 * * * * cd /path/to/cloud-project && npm run test:monitor >> /var/log/playwright-monitor.log 2>&1
```

## Debugging

```bash
# Debug mode
npx playwright test --debug

# Headed mode (see browser)
npm run test:headed

# UI mode (interactive)
npm run test:ui
```

## See Also

- [TESTING.md](../TESTING.md) - Complete testing guide
- [README.md](../README.md) - Project documentation
- [Playwright Docs](https://playwright.dev)

