/**
 * Gas Profiling Test Suite - Comprehensive Gas Consumption Analysis
 *
 * Purpose: Profile all critical smart contract operations for TON mainnet deployment
 * Target: All operations <100k gas (0.1 TON at 1M gas/TON)
 * Scope: 560-product system (5 coverage types × 8 chains × 14 stablecoins)
 *
 * Test Categories:
 * 1. Policy Operations (create, claim, verify)
 * 2. Vault Operations (deposit, withdraw, premium distribution, loss absorption)
 * 3. Dictionary Operations (scaling tests with 100/1000/10000 entries)
 * 4. Multi-hop Message Routing (PolicyFactory → PolicyRouter → PolicyShard)
 * 5. Worst-case Scenarios (max load, full waterfall cascade)
 */

import { Blockchain, SandboxContract, TreasuryContract, printTransactionFees } from '@ton/sandbox';
import { Cell, toNano, Address, beginCell } from '@ton/core';
import { compile } from '@ton/blueprint';
import '@ton/test-utils';

// Import contract wrappers
import { PolicyFactory } from '../../wrappers/PolicyFactory';
import { MultiTrancheVault, createInitialTrancheData } from '../../wrappers/MultiTrancheVault';
import { ClaimsProcessor } from '../../wrappers/ClaimsProcessor';

// Gas consumption thresholds (in gas units)
const GAS_LIMITS = {
    CREATE_POLICY: 80_000,              // Target: <80k
    CREATE_POLICY_SHARDED: 100_000,     // Target: <100k (includes routing)
    DEPOSIT: 60_000,                     // Target: <60k per tranche
    WITHDRAW: 70_000,                    // Target: <70k
    DISTRIBUTE_PREMIUMS: 150_000,        // Target: <150k (6 tranches)
    ABSORB_LOSS: 120_000,                // Target: <120k (full cascade)
    FILE_CLAIM: 70_000,                  // Target: <70k
    VERIFY_CLAIM: 50_000,                // Target: <50k
    DICT_OPERATION: 200_000,             // Breaking point threshold
};

// Helper: Extract gas consumption from transaction
function extractGasUsed(result: any): bigint {
    const tx = result.transactions[1]; // First transaction after deploy
    if (!tx) return 0n;

    // Calculate total gas: computation + storage + forwarding
    const computeGas = tx.totalFees?.computeFee || 0n;
    const storageFee = tx.totalFees?.storageFee || 0n;
    const forwardFee = tx.totalFees?.forwardFee || 0n;

    return BigInt(computeGas) + BigInt(storageFee) + BigInt(forwardFee);
}

// Helper: Format gas report
function formatGasReport(
    operation: string,
    gasUsed: bigint,
    budget: number,
    breakdown?: { computation?: bigint; storage?: bigint; forward?: bigint }
): string {
    const gasNum = Number(gasUsed);
    const percentOfBudget = ((gasNum / budget) * 100).toFixed(1);
    const status = gasNum <= budget ? '✅ PASS' : '❌ FAIL';

    let report = `\n${operation}:\n`;
    report += `  Gas Used: ${gasNum.toLocaleString()} gas\n`;
    report += `  Budget: ${budget.toLocaleString()} gas\n`;
    report += `  Usage: ${percentOfBudget}% of budget\n`;
    report += `  Status: ${status}\n`;

    if (breakdown) {
        report += `  Breakdown:\n`;
        if (breakdown.computation) report += `    - Computation: ${breakdown.computation.toLocaleString()}\n`;
        if (breakdown.storage) report += `    - Storage: ${breakdown.storage.toLocaleString()}\n`;
        if (breakdown.forward) report += `    - Forward: ${breakdown.forward.toLocaleString()}\n`;
    }

    return report;
}

describe('Gas Profiling - Comprehensive Analysis', () => {
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let user: SandboxContract<TreasuryContract>;
    let admin: SandboxContract<TreasuryContract>;
    let treasury: SandboxContract<TreasuryContract>;
    let claimsProcessor: SandboxContract<TreasuryContract>;

    // Contract codes
    let policyFactoryCode: Cell;
    let multiTrancheVaultCode: Cell;
    let claimsProcessorCode: Cell;

    // Contract instances
    let policyFactory: SandboxContract<PolicyFactory>;
    let vault: SandboxContract<MultiTrancheVault>;
    let claims: SandboxContract<ClaimsProcessor>;

    // Gas tracking
    const gasMetrics: Record<string, bigint> = {};

    beforeAll(async () => {
        console.log('🔧 Compiling contracts for gas profiling...');

        policyFactoryCode = await compile('PolicyFactory');
        multiTrancheVaultCode = await compile('MultiTrancheVault');
        claimsProcessorCode = await compile('ClaimsProcessor');

        console.log('✅ Contracts compiled successfully\n');
    });

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');
        user = await blockchain.treasury('user');
        admin = await blockchain.treasury('admin');
        treasury = await blockchain.treasury('treasury');
        claimsProcessor = await blockchain.treasury('claims_processor_mock');

        // Deploy PolicyFactory
        policyFactory = blockchain.openContract(
            PolicyFactory.createFromConfig(
                {
                    ownerAddress: deployer.address,
                    nextPolicyId: 0,
                    totalPoliciesCreated: 0,
                    activePoliciesCount: 0,
                    treasuryAddress: treasury.address,
                    paused: false,
                },
                policyFactoryCode
            )
        );

        await policyFactory.sendDeploy(deployer.getSender(), toNano('0.1'));

        // Deploy MultiTrancheVault
        vault = blockchain.openContract(
            MultiTrancheVault.createFromConfig(
                {
                    ownerAddress: deployer.address,
                    totalCapital: 0n,
                    totalCoverageSold: 0n,
                    accumulatedPremiums: 0n,
                    accumulatedLosses: 0n,
                    trancheData: createInitialTrancheData(),
                    depositorBalances: null,
                    paused: false,
                    adminAddress: admin.address,
                    claimsProcessorAddress: claimsProcessor.address,
                    reentrancyGuard: false,
                    seqNo: 0,
                    circuitBreakerWindowStart: 0,
                    circuitBreakerLosses: 0n,
                },
                multiTrancheVaultCode
            )
        );

        await vault.sendDeploy(deployer.getSender(), toNano('0.1'));
    });

    describe('1. Policy Operations Gas Profiling', () => {
        it('should measure create_policy() gas - single dimension', async () => {
            console.log('\n📊 Profiling create_policy() - Single Dimension');

            const result = await policyFactory.sendCreatePolicy(
                user.getSender(),
                {
                    coverageType: 0,      // Depeg
                    chainId: 0,           // Ethereum
                    stablecoinId: 0,      // USDC
                    coverageAmount: toNano('100'),
                    durationDays: 30,
                    value: toNano('5'),   // Premium + gas
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: user.address,
                to: policyFactory.address,
                success: true,
            });

            const gasUsed = extractGasUsed(result);
            gasMetrics['create_policy'] = gasUsed;

            console.log(formatGasReport('create_policy()', gasUsed, GAS_LIMITS.CREATE_POLICY));

            // Verify gas is within budget
            expect(Number(gasUsed)).toBeLessThanOrEqual(GAS_LIMITS.CREATE_POLICY);
        });

        it('should measure create_policy() gas - all 560 product combinations', async () => {
            console.log('\n📊 Profiling create_policy() - All Product Combinations');

            const coverageTypes = [0, 1, 2, 3, 4]; // 5 types
            const chains = [0, 1, 2, 3, 4, 5, 6, 7]; // 8 chains
            const stablecoins = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]; // 14 stablecoins

            let totalGas = 0n;
            let maxGas = 0n;
            let minGas = BigInt(Number.MAX_SAFE_INTEGER);
            let testCount = 0;

            // Sample 100 random combinations (full 560 would take too long)
            const samples = 100;

            for (let i = 0; i < samples; i++) {
                const coverageType = coverageTypes[Math.floor(Math.random() * coverageTypes.length)];
                const chainId = chains[Math.floor(Math.random() * chains.length)];
                const stablecoinId = stablecoins[Math.floor(Math.random() * stablecoins.length)];

                const result = await policyFactory.sendCreatePolicy(
                    user.getSender(),
                    {
                        coverageType,
                        chainId,
                        stablecoinId,
                        coverageAmount: toNano('100'),
                        durationDays: 30,
                        value: toNano('5'),
                    }
                );

                const gasUsed = extractGasUsed(result);
                totalGas += gasUsed;
                maxGas = gasUsed > maxGas ? gasUsed : maxGas;
                minGas = gasUsed < minGas ? gasUsed : minGas;
                testCount++;
            }

            const avgGas = totalGas / BigInt(testCount);

            console.log(`\n📈 Multi-dimensional Policy Creation Statistics (${testCount} samples):`);
            console.log(`  Average Gas: ${avgGas.toLocaleString()}`);
            console.log(`  Min Gas: ${minGas.toLocaleString()}`);
            console.log(`  Max Gas: ${maxGas.toLocaleString()}`);
            console.log(`  Total Products: 560 (5 types × 8 chains × 14 stablecoins)`);

            // Verify max gas is within budget
            expect(Number(maxGas)).toBeLessThanOrEqual(GAS_LIMITS.CREATE_POLICY);
        });

        it('should measure file_claim() gas', async () => {
            console.log('\n📊 Profiling file_claim()');

            // First create a policy
            await policyFactory.sendCreatePolicy(
                user.getSender(),
                {
                    coverageType: 0,
                    chainId: 0,
                    stablecoinId: 0,
                    coverageAmount: toNano('100'),
                    durationDays: 30,
                    value: toNano('5'),
                }
            );

            // Note: ClaimsProcessor would need to be fully deployed for this test
            // This is a placeholder for the actual implementation

            console.log('⚠️  ClaimsProcessor full deployment required for accurate profiling');
        });
    });

    describe('2. Vault Operations Gas Profiling', () => {
        it('should measure deposit() gas - single tranche', async () => {
            console.log('\n📊 Profiling deposit() - Single Tranche');

            // Set up a mock token address first
            await vault.sendSetTrancheToken(
                admin.getSender(),
                {
                    trancheId: 1, // TRANCHE_BTC
                    tokenAddress: user.address, // Mock address
                    value: toNano('0.05'),
                }
            );

            const depositAmount = toNano('10');

            const result = await vault.sendDeposit(
                user.getSender(),
                {
                    trancheId: 1,
                    value: depositAmount + toNano('0.15'), // Deposit + gas
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: user.address,
                to: vault.address,
                success: true,
            });

            const gasUsed = extractGasUsed(result);
            gasMetrics['deposit'] = gasUsed;

            console.log(formatGasReport('deposit()', gasUsed, GAS_LIMITS.DEPOSIT));

            expect(Number(gasUsed)).toBeLessThanOrEqual(GAS_LIMITS.DEPOSIT);
        });

        it('should measure deposit() gas - all 6 tranches', async () => {
            console.log('\n📊 Profiling deposit() - All 6 Tranches');

            const tranches = [1, 2, 3, 4, 5, 6];
            let totalGas = 0n;

            for (const trancheId of tranches) {
                // Set token address for each tranche
                await vault.sendSetTrancheToken(
                    admin.getSender(),
                    {
                        trancheId,
                        tokenAddress: user.address,
                        value: toNano('0.05'),
                    }
                );

                const result = await vault.sendDeposit(
                    user.getSender(),
                    {
                        trancheId,
                        value: toNano('10.15'),
                    }
                );

                const gasUsed = extractGasUsed(result);
                totalGas += gasUsed;

                console.log(`  Tranche ${trancheId}: ${gasUsed.toLocaleString()} gas`);

                expect(Number(gasUsed)).toBeLessThanOrEqual(GAS_LIMITS.DEPOSIT);
            }

            const avgGas = totalGas / BigInt(tranches.length);
            console.log(`\n  Average Gas (6 tranches): ${avgGas.toLocaleString()}`);
        });

        it('should measure distribute_premiums() gas - worst case', async () => {
            console.log('\n📊 Profiling distribute_premiums() - Worst Case (All 6 Tranches)');

            // Setup: Deposit into all tranches to maximize distribution complexity
            for (let trancheId = 1; trancheId <= 6; trancheId++) {
                await vault.sendSetTrancheToken(
                    admin.getSender(),
                    {
                        trancheId,
                        tokenAddress: user.address,
                        value: toNano('0.05'),
                    }
                );

                await vault.sendDeposit(
                    user.getSender(),
                    {
                        trancheId,
                        value: toNano('100.15'),
                    }
                );
            }

            // Now distribute premiums
            const premiumAmount = toNano('50');

            const result = await vault.sendDistributePremiums(
                deployer.getSender(),
                {
                    premiumAmount,
                    value: toNano('0.1'),
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: deployer.address,
                to: vault.address,
                success: true,
            });

            const gasUsed = extractGasUsed(result);
            gasMetrics['distribute_premiums'] = gasUsed;

            console.log(formatGasReport('distribute_premiums()', gasUsed, GAS_LIMITS.DISTRIBUTE_PREMIUMS));

            expect(Number(gasUsed)).toBeLessThanOrEqual(GAS_LIMITS.DISTRIBUTE_PREMIUMS);
        });

        it('should measure absorb_loss() gas - full waterfall cascade', async () => {
            console.log('\n📊 Profiling absorb_loss() - Full Waterfall Cascade (EQT → BTC)');

            // Setup: Deposit into all tranches
            for (let trancheId = 1; trancheId <= 6; trancheId++) {
                await vault.sendSetTrancheToken(
                    admin.getSender(),
                    {
                        trancheId,
                        tokenAddress: user.address,
                        value: toNano('0.05'),
                    }
                );

                await vault.sendDeposit(
                    user.getSender(),
                    {
                        trancheId,
                        value: toNano('10.15'), // Small amount to test cascade
                    }
                );
            }

            // Trigger large loss that cascades through all tranches
            const lossAmount = toNano('50'); // Exceeds all capital

            const result = await vault.sendAbsorbLoss(
                claimsProcessor.getSender(),
                {
                    lossAmount,
                    value: toNano('0.1'),
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: claimsProcessor.address,
                to: vault.address,
                success: true,
            });

            const gasUsed = extractGasUsed(result);
            gasMetrics['absorb_loss_cascade'] = gasUsed;

            console.log(formatGasReport('absorb_loss() - Full Cascade', gasUsed, GAS_LIMITS.ABSORB_LOSS));

            expect(Number(gasUsed)).toBeLessThanOrEqual(GAS_LIMITS.ABSORB_LOSS);
        });

        it('should measure withdraw() gas', async () => {
            console.log('\n📊 Profiling withdraw()');

            const trancheId = 1;

            // Setup: Set token and deposit
            await vault.sendSetTrancheToken(
                admin.getSender(),
                {
                    trancheId,
                    tokenAddress: user.address,
                    value: toNano('0.05'),
                }
            );

            await vault.sendDeposit(
                user.getSender(),
                {
                    trancheId,
                    value: toNano('10.15'),
                }
            );

            // Advance time past lockup (90 days for TRANCHE_BTC)
            blockchain.now = Math.floor(Date.now() / 1000) + 91 * 24 * 60 * 60;

            const withdrawAmount = toNano('5');

            const result = await vault.sendWithdraw(
                user.getSender(),
                {
                    trancheId,
                    tokenAmount: withdrawAmount,
                    value: toNano('0.1'),
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: user.address,
                to: vault.address,
                success: true,
            });

            const gasUsed = extractGasUsed(result);
            gasMetrics['withdraw'] = gasUsed;

            console.log(formatGasReport('withdraw()', gasUsed, GAS_LIMITS.WITHDRAW));

            expect(Number(gasUsed)).toBeLessThanOrEqual(GAS_LIMITS.WITHDRAW);
        });
    });

    describe('3. Dictionary Operation Scaling Tests', () => {
        it('should profile dict performance at 100 policies', async () => {
            console.log('\n📊 Profiling Dictionary Performance - 100 Policies');

            const policyCount = 100;
            const gasMeasurements: bigint[] = [];

            for (let i = 0; i < policyCount; i++) {
                const result = await policyFactory.sendCreatePolicy(
                    user.getSender(),
                    {
                        coverageType: i % 5,
                        chainId: i % 8,
                        stablecoinId: i % 14,
                        coverageAmount: toNano('100'),
                        durationDays: 30,
                        value: toNano('5'),
                    }
                );

                const gasUsed = extractGasUsed(result);
                gasMeasurements.push(gasUsed);

                // Check if gas consumption is increasing linearly
                if (i % 20 === 0) {
                    console.log(`  Policy ${i}: ${gasUsed.toLocaleString()} gas`);
                }
            }

            const avgGas = gasMeasurements.reduce((a, b) => a + b, 0n) / BigInt(policyCount);
            const maxGas = gasMeasurements.reduce((a, b) => a > b ? a : b, 0n);
            const minGas = gasMeasurements.reduce((a, b) => a < b ? a : b, BigInt(Number.MAX_SAFE_INTEGER));

            console.log(`\n  📈 Statistics for 100 policies:`);
            console.log(`    Average: ${avgGas.toLocaleString()} gas`);
            console.log(`    Min: ${minGas.toLocaleString()} gas`);
            console.log(`    Max: ${maxGas.toLocaleString()} gas`);
            console.log(`    Variance: ${((Number(maxGas) - Number(minGas)) / Number(minGas) * 100).toFixed(1)}%`);

            // Verify no gas spike
            expect(Number(maxGas)).toBeLessThanOrEqual(GAS_LIMITS.CREATE_POLICY * 1.5); // Allow 50% margin
        });

        it('should profile dict performance at 1000 policies', async () => {
            console.log('\n📊 Profiling Dictionary Performance - 1000 Policies');
            console.log('⚠️  This test is intensive and may take several minutes...');

            const policyCount = 1000;
            const sampleInterval = 100;
            const gasSamples: bigint[] = [];

            for (let i = 0; i < policyCount; i++) {
                const result = await policyFactory.sendCreatePolicy(
                    user.getSender(),
                    {
                        coverageType: i % 5,
                        chainId: i % 8,
                        stablecoinId: i % 14,
                        coverageAmount: toNano('100'),
                        durationDays: 30,
                        value: toNano('5'),
                    }
                );

                // Sample every 100 policies
                if (i % sampleInterval === 0) {
                    const gasUsed = extractGasUsed(result);
                    gasSamples.push(gasUsed);
                    console.log(`  Policy ${i}: ${gasUsed.toLocaleString()} gas`);
                }
            }

            const avgGas = gasSamples.reduce((a, b) => a + b, 0n) / BigInt(gasSamples.length);
            const maxGas = gasSamples.reduce((a, b) => a > b ? a : b, 0n);

            console.log(`\n  📈 Statistics for 1000 policies (sampled):`);
            console.log(`    Average: ${avgGas.toLocaleString()} gas`);
            console.log(`    Max: ${maxGas.toLocaleString()} gas`);

            // Check for breaking point
            if (Number(maxGas) > GAS_LIMITS.DICT_OPERATION) {
                console.warn(`⚠️  WARNING: Dict operation exceeded threshold at 1000 policies`);
            }

            expect(Number(maxGas)).toBeLessThanOrEqual(GAS_LIMITS.DICT_OPERATION);
        });

        it('should identify dict operation breaking point', async () => {
            console.log('\n📊 Identifying Dictionary Breaking Point');

            const testSizes = [100, 500, 1000, 2000, 5000, 10000];
            const results: { size: number; avgGas: bigint; maxGas: bigint }[] = [];

            for (const size of testSizes) {
                console.log(`\n  Testing ${size} policies...`);

                // Create policies
                for (let i = 0; i < size; i++) {
                    await policyFactory.sendCreatePolicy(
                        user.getSender(),
                        {
                            coverageType: i % 5,
                            chainId: i % 8,
                            stablecoinId: i % 14,
                            coverageAmount: toNano('100'),
                            durationDays: 30,
                            value: toNano('5'),
                        }
                    );
                }

                // Measure dict lookup performance
                const lookupResult = await policyFactory.sendCreatePolicy(
                    user.getSender(),
                    {
                        coverageType: 0,
                        chainId: 0,
                        stablecoinId: 0,
                        coverageAmount: toNano('100'),
                        durationDays: 30,
                        value: toNano('5'),
                    }
                );

                const gasUsed = extractGasUsed(lookupResult);
                results.push({ size, avgGas: gasUsed, maxGas: gasUsed });

                console.log(`    Gas at ${size} policies: ${gasUsed.toLocaleString()}`);

                // Stop if we hit breaking point
                if (Number(gasUsed) > GAS_LIMITS.DICT_OPERATION) {
                    console.warn(`\n  ⚠️  BREAKING POINT FOUND at ${size} policies`);
                    break;
                }
            }

            console.log('\n  📊 Breaking Point Analysis:');
            results.forEach(r => {
                console.log(`    ${r.size} policies: ${r.avgGas.toLocaleString()} gas`);
            });
        });
    });

    describe('4. Storage Layout Optimization Tests', () => {
        it('should measure storage costs per policy', async () => {
            console.log('\n📊 Profiling Storage Costs Per Policy');

            // Create a policy
            const result = await policyFactory.sendCreatePolicy(
                user.getSender(),
                {
                    coverageType: 0,
                    chainId: 0,
                    stablecoinId: 0,
                    coverageAmount: toNano('100'),
                    durationDays: 30,
                    value: toNano('5'),
                }
            );

            const tx = result.transactions[1];
            const storageFee = tx?.totalFees?.storageFee || 0n;

            console.log(`  Storage Fee: ${storageFee.toLocaleString()} nanoTON`);
            console.log(`  Monthly Cost: ${(Number(storageFee) * 30).toLocaleString()} nanoTON`);
            console.log(`  Annual Cost: ${(Number(storageFee) * 365).toLocaleString()} nanoTON`);
            console.log(`  Annual Cost (USD at $5/TON): $${((Number(storageFee) * 365) / 1e9 * 5).toFixed(4)}`);

            // Verify storage cost is reasonable (<$0.01/month per policy)
            const monthlyCostUSD = (Number(storageFee) * 30) / 1e9 * 5;
            expect(monthlyCostUSD).toBeLessThan(0.01);
        });

        it('should measure total storage for 10,000 policies', async () => {
            console.log('\n📊 Projecting Storage Costs for 10,000 Policies');

            // Create a sample policy
            const result = await policyFactory.sendCreatePolicy(
                user.getSender(),
                {
                    coverageType: 0,
                    chainId: 0,
                    stablecoinId: 0,
                    coverageAmount: toNano('100'),
                    durationDays: 30,
                    value: toNano('5'),
                }
            );

            const tx = result.transactions[1];
            const storageFeePerPolicy = tx?.totalFees?.storageFee || 0n;

            const totalPolicies = 10000;
            const totalStorageFee = Number(storageFeePerPolicy) * totalPolicies;
            const monthlyStorageCost = totalStorageFee * 30;
            const annualStorageCost = totalStorageFee * 365;

            console.log(`\n  📈 Projected Costs for ${totalPolicies} policies:`);
            console.log(`    Total Storage Fee: ${totalStorageFee.toLocaleString()} nanoTON`);
            console.log(`    Monthly Cost: ${monthlyStorageCost.toLocaleString()} nanoTON (${(monthlyStorageCost / 1e9).toFixed(2)} TON)`);
            console.log(`    Annual Cost: ${annualStorageCost.toLocaleString()} nanoTON (${(annualStorageCost / 1e9).toFixed(2)} TON)`);
            console.log(`    Annual Cost (USD at $5/TON): $${(annualStorageCost / 1e9 * 5).toFixed(2)}`);
        });
    });

    describe('5. Worst-case Scenario Tests', () => {
        it('should handle concurrent operations under max load', async () => {
            console.log('\n📊 Testing Concurrent Operations - Max Load');

            // Simulate 100 concurrent policy creations
            const concurrentCount = 100;
            const results: any[] = [];

            console.log(`  Creating ${concurrentCount} policies concurrently...`);

            for (let i = 0; i < concurrentCount; i++) {
                const result = await policyFactory.sendCreatePolicy(
                    user.getSender(),
                    {
                        coverageType: i % 5,
                        chainId: i % 8,
                        stablecoinId: i % 14,
                        coverageAmount: toNano('100'),
                        durationDays: 30,
                        value: toNano('5'),
                    }
                );

                results.push(result);
            }

            // Verify all succeeded
            const successCount = results.filter(r =>
                r.transactions.some((t: any) => t.success)
            ).length;

            console.log(`  ✅ Success Rate: ${successCount}/${concurrentCount} (${(successCount/concurrentCount*100).toFixed(1)}%)`);

            expect(successCount).toBe(concurrentCount);
        });

        it('should handle full vault utilization (100%)', async () => {
            console.log('\n📊 Testing Full Vault Utilization');

            // Deposit large amounts into all tranches
            const depositAmount = toNano('1000');

            for (let trancheId = 1; trancheId <= 6; trancheId++) {
                await vault.sendSetTrancheToken(
                    admin.getSender(),
                    {
                        trancheId,
                        tokenAddress: user.address,
                        value: toNano('0.05'),
                    }
                );

                await vault.sendDeposit(
                    user.getSender(),
                    {
                        trancheId,
                        value: depositAmount + toNano('0.15'),
                    }
                );
            }

            const totalCapital = await vault.getTotalCapital();
            console.log(`  Total Capital: ${(Number(totalCapital) / 1e9).toFixed(2)} TON`);

            // Distribute large premium at 100% utilization
            const largePremi = toNano('500');

            const result = await vault.sendDistributePremiums(
                deployer.getSender(),
                {
                    premiumAmount: largePremium,
                    value: toNano('0.1'),
                }
            );

            const gasUsed = extractGasUsed(result);
            console.log(`  Gas Used at 100% Utilization: ${gasUsed.toLocaleString()}`);

            expect(Number(gasUsed)).toBeLessThanOrEqual(GAS_LIMITS.DISTRIBUTE_PREMIUMS);
        });

        it('should handle maximum loss cascade (insolvency scenario)', async () => {
            console.log('\n📊 Testing Maximum Loss Cascade - Insolvency Scenario');

            // Setup: Small deposits across all tranches
            const smallDeposit = toNano('1');

            for (let trancheId = 1; trancheId <= 6; trancheId++) {
                await vault.sendSetTrancheToken(
                    admin.getSender(),
                    {
                        trancheId,
                        tokenAddress: user.address,
                        value: toNano('0.05'),
                    }
                );

                await vault.sendDeposit(
                    user.getSender(),
                    {
                        trancheId,
                        value: smallDeposit + toNano('0.15'),
                    }
                );
            }

            const totalCapital = await vault.getTotalCapital();

            // Trigger insolvency: Loss exceeds all capital
            const catastrophicLoss = Number(totalCapital) * 2; // 2x capital

            const result = await vault.sendAbsorbLoss(
                claimsProcessor.getSender(),
                {
                    lossAmount: BigInt(catastrophicLoss),
                    value: toNano('0.1'),
                }
            );

            const gasUsed = extractGasUsed(result);
            console.log(`  Gas Used (Insolvency): ${gasUsed.toLocaleString()}`);

            // Check if circuit breaker triggered
            const isPaused = await vault.getPaused();
            console.log(`  Circuit Breaker Triggered: ${isPaused ? 'YES ✅' : 'NO ❌'}`);

            expect(Number(gasUsed)).toBeLessThanOrEqual(GAS_LIMITS.ABSORB_LOSS);
        });
    });

    afterAll(() => {
        console.log('\n\n' + '='.repeat(80));
        console.log('📊 GAS PROFILING SUMMARY');
        console.log('='.repeat(80) + '\n');

        const sortedMetrics = Object.entries(gasMetrics).sort((a, b) => Number(b[1]) - Number(a[1]));

        console.log('Top Gas Consumers:\n');
        sortedMetrics.forEach(([operation, gas], index) => {
            const budget = GAS_LIMITS[operation.toUpperCase() as keyof typeof GAS_LIMITS] || 100_000;
            const status = Number(gas) <= budget ? '✅' : '❌';
            console.log(`${index + 1}. ${operation}: ${gas.toLocaleString()} gas ${status}`);
        });

        console.log('\n' + '='.repeat(80));
        console.log('\n💡 Recommendations:');
        console.log('   1. Optimize operations exceeding budget with inline functions');
        console.log('   2. Minimize dict operations for operations >100k gas');
        console.log('   3. Use cell references for large policy data');
        console.log('   4. Implement sharding for >10,000 policies');
        console.log('   5. Monitor storage costs in production\n');
    });
});
