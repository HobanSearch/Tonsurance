/**
 * Load Test: Policy Creation
 * Tests system performance under high concurrent load
 *
 * Scenarios:
 * - Ramp-up: 0 → 100 users over 2 minutes
 * - Sustain: 100 users for 10 minutes
 * - Spike: 100 → 1000 users in 2 minutes
 * - Soak: 50 users for 30 minutes
 *
 * Metrics:
 * - Throughput: policies/second
 * - Latency: p50, p95, p99
 * - Error rate: <1%
 * - Gas costs: track per operation
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const policyCreationLatency = new Trend('policy_creation_latency');
const premiumCalculationLatency = new Trend('premium_calculation_latency');
const gasCostMetric = new Trend('gas_cost_ton');
const policiesCreated = new Counter('policies_created');

// Test configuration
export const options = {
    scenarios: {
        ramp_up: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '2m', target: 100 },  // Ramp up to 100 users
                { duration: '10m', target: 100 }, // Sustain 100 users
                { duration: '2m', target: 0 },    // Ramp down
            ],
            gracefulRampDown: '30s',
        },
        spike: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '30s', target: 100 },  // Baseline
                { duration: '1m', target: 1000 },  // Spike to 1000
                { duration: '2m', target: 1000 },  // Sustain spike
                { duration: '1m', target: 100 },   // Return to baseline
                { duration: '30s', target: 0 },    // Ramp down
            ],
            startTime: '15m', // Start after ramp_up completes
        },
        soak: {
            executor: 'constant-vus',
            vus: 50,
            duration: '30m',
            startTime: '20m', // Start after spike
        },
    },
    thresholds: {
        'http_req_duration': ['p(95)<500'],     // 95% of requests < 500ms
        'http_req_failed': ['rate<0.01'],        // <1% error rate
        'policy_creation_latency': ['p(99)<2000'], // 99% < 2 seconds
        'gas_cost_ton': ['avg<0.15'],            // Average gas < 0.15 TON
    },
};

const API_BASE_URL = __ENV.API_URL || 'http://localhost:8080';
const TESTNET_RPC = __ENV.TON_RPC || 'https://testnet.toncenter.com/api/v2';

// Coverage types for testing
const COVERAGE_TYPES = [
    { type: 0, name: 'Depeg', baseAmount: 10000 },
    { type: 1, name: 'Bridge', baseAmount: 25000 },
    { type: 2, name: 'CEX', baseAmount: 50000 },
    { type: 3, name: 'Protocol', baseAmount: 15000 },
    { type: 4, name: 'Composite', baseAmount: 30000 },
];

const CHAINS = [0, 1, 2, 3, 4, 5, 6, 7]; // 8 chains
const STABLECOINS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]; // 14 stablecoins

export default function () {
    // Select random product
    const coverage = COVERAGE_TYPES[Math.floor(Math.random() * COVERAGE_TYPES.length)];
    const chainId = CHAINS[Math.floor(Math.random() * CHAINS.length)];
    const stablecoinId = STABLECOINS[Math.floor(Math.random() * STABLECOINS.length)];

    const policyParams = {
        coverage_type: coverage.type,
        chain_id: chainId,
        stablecoin_id: stablecoinId,
        coverage_amount: coverage.baseAmount * (1 + Math.random()),
        duration_days: Math.floor(7 + Math.random() * 353), // 7-360 days
        user_address: `EQTestUser${__VU}_${__ITER}...`, // Virtual user ID + iteration
    };

    // Step 1: Get premium quote
    const quoteStart = Date.now();
    const quoteResponse = http.post(
        `${API_BASE_URL}/api/premium/quote`,
        JSON.stringify(policyParams),
        {
            headers: { 'Content-Type': 'application/json' },
            tags: { name: 'GetPremiumQuote' },
        }
    );

    const quoteLatency = Date.now() - quoteStart;
    premiumCalculationLatency.add(quoteLatency);

    const quoteSuccess = check(quoteResponse, {
        'quote status 200': (r) => r.status === 200,
        'quote has premium': (r) => JSON.parse(r.body).premium !== undefined,
        'quote latency <200ms': () => quoteLatency < 200,
    });

    if (!quoteSuccess) {
        errorRate.add(1);
        console.error(`Quote failed: ${quoteResponse.status} - ${quoteResponse.body}`);
        return;
    }

    const quoteData = JSON.parse(quoteResponse.body);
    console.log(`Quote: ${quoteData.premium} TON for ${coverage.name} on chain ${chainId}`);

    // Step 2: Create policy
    const createStart = Date.now();
    const createResponse = http.post(
        `${API_BASE_URL}/api/policy/create`,
        JSON.stringify({
            ...policyParams,
            premium: quoteData.premium,
        }),
        {
            headers: { 'Content-Type': 'application/json' },
            tags: { name: 'CreatePolicy' },
        }
    );

    const createLatency = Date.now() - createStart;
    policyCreationLatency.add(createLatency);

    const createSuccess = check(createResponse, {
        'create status 200': (r) => r.status === 200,
        'policy has ID': (r) => JSON.parse(r.body).policy_id !== undefined,
        'create latency <1000ms': () => createLatency < 1000,
    });

    if (!createSuccess) {
        errorRate.add(1);
        console.error(`Policy creation failed: ${createResponse.status} - ${createResponse.body}`);
        return;
    }

    const policyData = JSON.parse(createResponse.body);
    policiesCreated.add(1);

    // Step 3: Get gas cost (from transaction hash)
    if (policyData.tx_hash) {
        const txResponse = http.get(
            `${TESTNET_RPC}/getTransactions?address=${policyData.contract_address}&limit=1`,
            {
                tags: { name: 'GetTransaction' },
            }
        );

        if (txResponse.status === 200) {
            const txData = JSON.parse(txResponse.body);
            if (txData.result && txData.result.length > 0) {
                const gasCost = txData.result[0].total_fees / 1e9; // Convert to TON
                gasCostMetric.add(gasCost);
                console.log(`Gas cost: ${gasCost.toFixed(6)} TON`);
            }
        }
    }

    console.log(`Policy created: ${policyData.policy_id} (${createLatency}ms)`);

    // Pace requests (realistic user behavior)
    sleep(Math.random() * 3 + 1); // 1-4 seconds between requests
}

export function handleSummary(data) {
    return {
        'stdout': textSummary(data, { indent: ' ', enableColors: true }),
        'load-test-results.json': JSON.stringify(data, null, 2),
        'load-test-report.html': htmlReport(data),
    };
}

function textSummary(data, options = {}) {
    const { indent = '', enableColors = false } = options;

    let output = '\n';
    output += `${indent}Load Test Summary\n`;
    output += `${indent}${'='.repeat(80)}\n\n`;

    // Overall metrics
    const metrics = data.metrics;

    output += `${indent}Policies Created: ${metrics.policies_created.values.count}\n`;
    output += `${indent}Error Rate: ${(metrics.errors.values.rate * 100).toFixed(2)}%\n`;
    output += `${indent}HTTP Requests: ${metrics.http_reqs.values.count}\n`;
    output += `${indent}Failed Requests: ${metrics.http_req_failed.values.count}\n\n`;

    // Latency stats
    output += `${indent}Latency Metrics:\n`;
    output += `${indent}  Policy Creation:\n`;
    output += `${indent}    p50: ${metrics.policy_creation_latency.values.p50.toFixed(2)}ms\n`;
    output += `${indent}    p95: ${metrics.policy_creation_latency.values.p95.toFixed(2)}ms\n`;
    output += `${indent}    p99: ${metrics.policy_creation_latency.values.p99.toFixed(2)}ms\n`;
    output += `${indent}    max: ${metrics.policy_creation_latency.values.max.toFixed(2)}ms\n\n`;

    output += `${indent}  Premium Calculation:\n`;
    output += `${indent}    p50: ${metrics.premium_calculation_latency.values.p50.toFixed(2)}ms\n`;
    output += `${indent}    p95: ${metrics.premium_calculation_latency.values.p95.toFixed(2)}ms\n`;
    output += `${indent}    p99: ${metrics.premium_calculation_latency.values.p99.toFixed(2)}ms\n\n`;

    // Gas costs
    output += `${indent}Gas Costs:\n`;
    output += `${indent}  Average: ${metrics.gas_cost_ton.values.avg.toFixed(6)} TON\n`;
    output += `${indent}  Min: ${metrics.gas_cost_ton.values.min.toFixed(6)} TON\n`;
    output += `${indent}  Max: ${metrics.gas_cost_ton.values.max.toFixed(6)} TON\n\n`;

    // Throughput
    const duration = (data.state.testRunDurationMs / 1000).toFixed(0);
    const throughput = (metrics.policies_created.values.count / duration).toFixed(2);
    output += `${indent}Throughput: ${throughput} policies/second\n`;
    output += `${indent}Test Duration: ${duration}s\n\n`;

    // Threshold results
    output += `${indent}Threshold Results:\n`;
    for (const [name, result] of Object.entries(data.thresholds)) {
        const status = result.ok ? '✓ PASS' : '✗ FAIL';
        output += `${indent}  ${status}: ${name}\n`;
    }

    output += `\n${indent}${'='.repeat(80)}\n`;

    return output;
}

function htmlReport(data) {
    const metrics = data.metrics;

    return `
<!DOCTYPE html>
<html>
<head>
    <title>Load Test Report - Policy Creation</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        h1 { color: #333; }
        .metric-card {
            background: #f5f5f5;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
        }
        .metric-title { font-size: 18px; font-weight: bold; margin-bottom: 10px; }
        .metric-value { font-size: 32px; color: #0066cc; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #0066cc; color: white; }
        .pass { color: green; }
        .fail { color: red; }
    </style>
</head>
<body>
    <h1>Load Test Report: Policy Creation</h1>
    <p>Generated: ${new Date().toISOString()}</p>

    <div class="metric-card">
        <div class="metric-title">Policies Created</div>
        <div class="metric-value">${metrics.policies_created.values.count}</div>
    </div>

    <div class="metric-card">
        <div class="metric-title">Error Rate</div>
        <div class="metric-value">${(metrics.errors.values.rate * 100).toFixed(2)}%</div>
    </div>

    <div class="metric-card">
        <div class="metric-title">Average Latency</div>
        <div class="metric-value">${metrics.policy_creation_latency.values.avg.toFixed(0)}ms</div>
    </div>

    <div class="metric-card">
        <div class="metric-title">Average Gas Cost</div>
        <div class="metric-value">${metrics.gas_cost_ton.values.avg.toFixed(6)} TON</div>
    </div>

    <h2>Latency Distribution</h2>
    <table>
        <tr>
            <th>Percentile</th>
            <th>Policy Creation</th>
            <th>Premium Calculation</th>
        </tr>
        <tr>
            <td>p50 (median)</td>
            <td>${metrics.policy_creation_latency.values.p50.toFixed(2)}ms</td>
            <td>${metrics.premium_calculation_latency.values.p50.toFixed(2)}ms</td>
        </tr>
        <tr>
            <td>p95</td>
            <td>${metrics.policy_creation_latency.values.p95.toFixed(2)}ms</td>
            <td>${metrics.premium_calculation_latency.values.p95.toFixed(2)}ms</td>
        </tr>
        <tr>
            <td>p99</td>
            <td>${metrics.policy_creation_latency.values.p99.toFixed(2)}ms</td>
            <td>${metrics.premium_calculation_latency.values.p99.toFixed(2)}ms</td>
        </tr>
        <tr>
            <td>Max</td>
            <td>${metrics.policy_creation_latency.values.max.toFixed(2)}ms</td>
            <td>${metrics.premium_calculation_latency.values.max.toFixed(2)}ms</td>
        </tr>
    </table>

    <h2>Threshold Results</h2>
    <table>
        <tr>
            <th>Threshold</th>
            <th>Result</th>
        </tr>
        ${Object.entries(data.thresholds)
            .map(
                ([name, result]) => `
            <tr>
                <td>${name}</td>
                <td class="${result.ok ? 'pass' : 'fail'}">${result.ok ? '✓ PASS' : '✗ FAIL'}</td>
            </tr>
        `
            )
            .join('')}
    </table>
</body>
</html>
    `;
}

/**
 * Expected Performance Targets:
 *
 * - Throughput: >100 policies/second
 * - Latency (p95): <500ms
 * - Latency (p99): <2000ms
 * - Error rate: <1%
 * - Gas cost: <0.15 TON average
 *
 * Load Scenarios:
 * 1. Ramp-up: 0 → 100 users (14 minutes total)
 * 2. Spike: 100 → 1000 users (5 minutes at 15m mark)
 * 3. Soak: 50 users sustained (30 minutes at 20m mark)
 *
 * Total test duration: ~50 minutes
 */
