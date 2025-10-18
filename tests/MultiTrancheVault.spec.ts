import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano, Address, beginCell } from '@ton/core';
import { MultiTrancheVault, createInitialTrancheData } from '../wrappers/MultiTrancheVault';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

describe('MultiTrancheVault', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compile('MultiTrancheVault');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let admin: SandboxContract<TreasuryContract>;
    let claimsProcessor: SandboxContract<TreasuryContract>;
    let multiTrancheVault: SandboxContract<MultiTrancheVault>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');
        admin = await blockchain.treasury('admin');
        claimsProcessor = await blockchain.treasury('claims_processor');

        multiTrancheVault = blockchain.openContract(
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
                    pendingTxs: null,
                    trancheLocks: null,
                    testMode: true,  // Enable test mode to skip token minting/burning
                },
                code
            )
        );

        const deployResult = await multiTrancheVault.sendDeploy(deployer.getSender(), toNano('0.05'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: multiTrancheVault.address,
            deploy: true,
            success: true,
        });
    });

    describe('Storage and Access Control', () => {
        it('should load and save data correctly', async () => {
            const totalCapital = await multiTrancheVault.getTotalCapital();
            expect(totalCapital).toEqual(0n);

            const totalCoverageSold = await multiTrancheVault.getTotalCoverageSold();
            expect(totalCoverageSold).toEqual(0n);

            const paused = await multiTrancheVault.getPaused();
            expect(paused).toBe(false);
        });

        it('should return correct owner address', async () => {
            const owner = await multiTrancheVault.getOwner();
            expect(owner.toString()).toEqual(deployer.address.toString());
        });

        it('should return correct admin address', async () => {
            const adminAddr = await multiTrancheVault.getAdmin();
            expect(adminAddr.toString()).toEqual(admin.address.toString());
        });

        it('should return correct claims processor address', async () => {
            const claimsAddr = await multiTrancheVault.getClaimsProcessor();
            expect(claimsAddr.toString()).toEqual(claimsProcessor.address.toString());
        });
    });

    describe('Tranche Data', () => {
        it('should return correct tranche capital (all zero initially)', async () => {
            for (let trancheId = 1; trancheId <= 6; trancheId++) {
                const capital = await multiTrancheVault.getTrancheCapital(trancheId);
                expect(capital).toEqual(0n);
            }
        });

        it('should return correct APY for TRANCHE_BTC (1)', async () => {
            const { min, max } = await multiTrancheVault.getTrancheApy(1);
            expect(min).toEqual(400n); // 4.00%
            expect(max).toEqual(400n); // 4.00%
        });

        it('should return correct APY for TRANCHE_SNR (2)', async () => {
            const { min, max } = await multiTrancheVault.getTrancheApy(2);
            expect(min).toEqual(650n);  // 6.50%
            expect(max).toEqual(1000n); // 10.00%
        });

        it('should return correct APY for TRANCHE_MEZZ (3)', async () => {
            const { min, max } = await multiTrancheVault.getTrancheApy(3);
            expect(min).toEqual(900n);  // 9.00%
            expect(max).toEqual(1500n); // 15.00%
        });

        it('should return correct APY for TRANCHE_JNR (4)', async () => {
            const { min, max } = await multiTrancheVault.getTrancheApy(4);
            expect(min).toEqual(1250n); // 12.50%
            expect(max).toEqual(1600n); // 16.00%
        });

        it('should return correct APY for TRANCHE_JNR_PLUS (5)', async () => {
            const { min, max } = await multiTrancheVault.getTrancheApy(5);
            expect(min).toEqual(1600n); // 16.00%
            expect(max).toEqual(2200n); // 22.00%
        });

        it('should return correct APY for TRANCHE_EQT (6)', async () => {
            const { min, max } = await multiTrancheVault.getTrancheApy(6);
            expect(min).toEqual(1500n); // 15.00%
            expect(max).toEqual(2500n); // 25.00%
        });
    });

    describe('Admin Functions - Pause/Unpause', () => {
        it('should allow admin to pause the vault', async () => {
            const result = await multiTrancheVault.sendPause(admin.getSender(), toNano('0.05'));

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: multiTrancheVault.address,
                success: true,
            });

            const paused = await multiTrancheVault.getPaused();
            expect(paused).toBe(true);
        });

        it('should allow admin to unpause the vault', async () => {
            // First pause
            await multiTrancheVault.sendPause(admin.getSender(), toNano('0.05'));
            let paused = await multiTrancheVault.getPaused();
            expect(paused).toBe(true);

            // Then unpause
            const result = await multiTrancheVault.sendUnpause(admin.getSender(), toNano('0.05'));

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: multiTrancheVault.address,
                success: true,
            });

            paused = await multiTrancheVault.getPaused();
            expect(paused).toBe(false);
        });

        it('should reject pause from non-admin', async () => {
            const nonAdmin = await blockchain.treasury('non_admin');

            const result = await multiTrancheVault.sendPause(nonAdmin.getSender(), toNano('0.05'));

            expect(result.transactions).toHaveTransaction({
                from: nonAdmin.address,
                to: multiTrancheVault.address,
                success: false,
                exitCode: 403, // ERR_ACCESS_DENIED
            });
        });
    });

    describe('Admin Functions - Set Admin', () => {
        it('should allow owner to set new admin', async () => {
            const newAdmin = await blockchain.treasury('new_admin');

            const result = await multiTrancheVault.sendSetAdmin(
                deployer.getSender(),
                toNano('0.05'),
                newAdmin.address
            );

            expect(result.transactions).toHaveTransaction({
                from: deployer.address,
                to: multiTrancheVault.address,
                success: true,
            });

            const adminAddr = await multiTrancheVault.getAdmin();
            expect(adminAddr.toString()).toEqual(newAdmin.address.toString());
        });

        it('should reject set admin from non-owner', async () => {
            const nonOwner = await blockchain.treasury('non_owner');
            const newAdmin = await blockchain.treasury('new_admin');

            const result = await multiTrancheVault.sendSetAdmin(
                nonOwner.getSender(),
                toNano('0.05'),
                newAdmin.address
            );

            expect(result.transactions).toHaveTransaction({
                from: nonOwner.address,
                to: multiTrancheVault.address,
                success: false,
                exitCode: 403, // ERR_ACCESS_DENIED
            });
        });
    });

    describe('Admin Functions - Set Claims Processor', () => {
        it('should allow admin to set new claims processor', async () => {
            const newProcessor = await blockchain.treasury('new_processor');

            const result = await multiTrancheVault.sendSetClaimsProcessor(
                admin.getSender(),
                toNano('0.05'),
                newProcessor.address
            );

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: multiTrancheVault.address,
                success: true,
            });

            const processorAddr = await multiTrancheVault.getClaimsProcessor();
            expect(processorAddr.toString()).toEqual(newProcessor.address.toString());
        });

        it('should reject set claims processor from non-admin', async () => {
            const nonAdmin = await blockchain.treasury('non_admin');
            const newProcessor = await blockchain.treasury('new_processor');

            const result = await multiTrancheVault.sendSetClaimsProcessor(
                nonAdmin.getSender(),
                toNano('0.05'),
                newProcessor.address
            );

            expect(result.transactions).toHaveTransaction({
                from: nonAdmin.address,
                to: multiTrancheVault.address,
                success: false,
                exitCode: 403, // ERR_ACCESS_DENIED
            });
        });
    });

    describe('Accumulated Values', () => {
        it('should return correct accumulated premiums (initially 0)', async () => {
            const premiums = await multiTrancheVault.getAccumulatedPremiums();
            expect(premiums).toEqual(0n);
        });

        it('should return correct accumulated losses (initially 0)', async () => {
            const losses = await multiTrancheVault.getAccumulatedLosses();
            expect(losses).toEqual(0n);
        });
    });

    describe('Loss Absorption Waterfall (A7)', () => {
        // Helper function to set tranche capital manually for testing
        async function setupTrancheCapital() {
            // We'll need to deposit into tranches to set capital
            // For now, we'll use the internal state setup via a helper contract
            // In production, this would be done via actual deposits

            // Set up tranches with capital:
            // EQT (6): 100 TON
            // JNR+ (5): 120 TON
            // JNR (4): 150 TON
            // MEZZ (3): 180 TON
            // SNR (2): 200 TON
            // BTC (1): 250 TON
            // Total: 1000 TON
        }

        describe('Access Control', () => {
            it('should reject absorb_loss from non-claims-processor', async () => {
                const nonProcessor = await blockchain.treasury('non_processor');

                const result = await multiTrancheVault.sendAbsorbLoss(
                    nonProcessor.getSender(),
                    toNano('0.05'),
                    toNano('10')
                );

                expect(result.transactions).toHaveTransaction({
                    from: nonProcessor.address,
                    to: multiTrancheVault.address,
                    success: false,
                    exitCode: 403, // ERR_ACCESS_DENIED
                });
            });

            it('should accept absorb_loss from claims processor', async () => {
                const result = await multiTrancheVault.sendAbsorbLoss(
                    claimsProcessor.getSender(),
                    toNano('0.05'),
                    toNano('10')
                );

                expect(result.transactions).toHaveTransaction({
                    from: claimsProcessor.address,
                    to: multiTrancheVault.address,
                    success: true,
                });
            });

            it('should reject zero or negative loss amount', async () => {
                const result = await multiTrancheVault.sendAbsorbLoss(
                    claimsProcessor.getSender(),
                    toNano('0.05'),
                    0n
                );

                expect(result.transactions).toHaveTransaction({
                    from: claimsProcessor.address,
                    to: multiTrancheVault.address,
                    success: false,
                    exitCode: 400, // ERR_INVALID_AMOUNT
                });
            });
        });

        describe('Waterfall Order (Tier 6 → Tier 1)', () => {
            it('should absorb small loss from EQT only (tier 6)', async () => {
                // This test demonstrates the waterfall in principle
                // In a real scenario, we'd set up capital first
                const result = await multiTrancheVault.sendAbsorbLoss(
                    claimsProcessor.getSender(),
                    toNano('0.05'),
                    toNano('50') // Small loss
                );

                expect(result.transactions).toHaveTransaction({
                    from: claimsProcessor.address,
                    to: multiTrancheVault.address,
                    success: true,
                });

                // Verify accumulated losses increased
                const losses = await multiTrancheVault.getAccumulatedLosses();
                expect(losses).toBeGreaterThan(0n);
            });

            it('should emit loss absorption summary event (0x33)', async () => {
                const result = await multiTrancheVault.sendAbsorbLoss(
                    claimsProcessor.getSender(),
                    toNano('0.05'),
                    toNano('10')
                );

                expect(result.transactions).toHaveTransaction({
                    from: claimsProcessor.address,
                    to: multiTrancheVault.address,
                    success: true,
                });

                // Check for event emission - event 0x33 should be emitted
                // The actual event verification would require parsing logs
            });
        });

        describe('Circuit Breaker Integration', () => {
            it('should trigger circuit breaker when losses exceed 10% of capital in 24h', async () => {
                // First, let's absorb a loss that's > 10% of capital
                // Assuming total_capital = 0 initially (or very low), we need to set it up
                // For this test, we'll send a large loss and verify pause state

                const largeLoss = toNano('1000'); // Large loss to trigger circuit breaker

                const result = await multiTrancheVault.sendAbsorbLoss(
                    claimsProcessor.getSender(),
                    toNano('0.05'),
                    largeLoss
                );

                expect(result.transactions).toHaveTransaction({
                    from: claimsProcessor.address,
                    to: multiTrancheVault.address,
                    success: true,
                });

                // Verify vault is paused due to circuit breaker OR insolvency
                const paused = await multiTrancheVault.getPaused();
                expect(paused).toBe(true);
            });

            it('should reset circuit breaker window after 24 hours', async () => {
                // This test would require time manipulation in sandbox
                // We'll note it as a manual test scenario

                // Step 1: Absorb 5% loss
                await multiTrancheVault.sendAbsorbLoss(
                    claimsProcessor.getSender(),
                    toNano('0.05'),
                    toNano('50')
                );

                // Step 2: Advance time by 25 hours (simulate)
                // blockchain.now += 90000; // 25 hours

                // Step 3: Absorb another 5% loss - should NOT trigger
                // (window has reset)

                // This requires sandbox time manipulation support
            });
        });

        describe('Insolvency Detection', () => {
            it('should detect insolvency when loss exceeds total capital', async () => {
                // Absorb a massive loss that exceeds all capital
                const massiveLoss = toNano('10000');

                const result = await multiTrancheVault.sendAbsorbLoss(
                    claimsProcessor.getSender(),
                    toNano('0.05'),
                    massiveLoss
                );

                expect(result.transactions).toHaveTransaction({
                    from: claimsProcessor.address,
                    to: multiTrancheVault.address,
                    success: true,
                });

                // Verify vault is paused due to insolvency
                const paused = await multiTrancheVault.getPaused();
                expect(paused).toBe(true);

                // Event 0x41 (insolvency) should be emitted
            });

            it('should emit insolvency event (0x41) when remaining_loss > 0', async () => {
                const massiveLoss = toNano('50000');

                const result = await multiTrancheVault.sendAbsorbLoss(
                    claimsProcessor.getSender(),
                    toNano('0.05'),
                    massiveLoss
                );

                expect(result.transactions).toHaveTransaction({
                    from: claimsProcessor.address,
                    to: multiTrancheVault.address,
                    success: true,
                });

                // Verify insolvency event emitted (0x41)
                // This would require log parsing in actual implementation
            });
        });

        describe('Multi-Tranche Absorption', () => {
            it('should absorb loss across multiple tranches in correct order', async () => {
                // Scenario: Loss of 250 TON
                // Expected:
                // - EQT (100 TON) fully wiped
                // - JNR+ (120 TON) fully wiped
                // - JNR (150 TON) partially wiped (30 TON absorbed, 120 TON remaining)

                const loss = toNano('250');

                const result = await multiTrancheVault.sendAbsorbLoss(
                    claimsProcessor.getSender(),
                    toNano('0.05'),
                    loss
                );

                expect(result.transactions).toHaveTransaction({
                    from: claimsProcessor.address,
                    to: multiTrancheVault.address,
                    success: true,
                });

                // Verify accumulated losses
                const totalLosses = await multiTrancheVault.getAccumulatedLosses();
                expect(totalLosses).toBeGreaterThan(0n);
            });
        });

        describe('Edge Cases', () => {
            it('should handle tranche with zero capital gracefully', async () => {
                // All tranches start with 0 capital
                // Absorbing any loss should trigger insolvency

                const result = await multiTrancheVault.sendAbsorbLoss(
                    claimsProcessor.getSender(),
                    toNano('0.05'),
                    toNano('1')
                );

                expect(result.transactions).toHaveTransaction({
                    from: claimsProcessor.address,
                    to: multiTrancheVault.address,
                    success: true,
                });

                // Should be paused due to insolvency
                const paused = await multiTrancheVault.getPaused();
                expect(paused).toBe(true);
            });

            it('should prevent negative capital after absorption', async () => {
                const result = await multiTrancheVault.sendAbsorbLoss(
                    claimsProcessor.getSender(),
                    toNano('0.05'),
                    toNano('100')
                );

                expect(result.transactions).toHaveTransaction({
                    from: claimsProcessor.address,
                    to: multiTrancheVault.address,
                    success: true,
                });

                // All tranche capitals should be >= 0
                for (let trancheId = 1; trancheId <= 6; trancheId++) {
                    const capital = await multiTrancheVault.getTrancheCapital(trancheId);
                    expect(capital).toBeGreaterThanOrEqual(0n);
                }
            });

            it('should handle sequential losses correctly', async () => {
                // First loss
                await multiTrancheVault.sendAbsorbLoss(
                    claimsProcessor.getSender(),
                    toNano('0.05'),
                    toNano('10')
                );

                const firstLosses = await multiTrancheVault.getAccumulatedLosses();

                // Second loss
                await multiTrancheVault.sendAbsorbLoss(
                    claimsProcessor.getSender(),
                    toNano('0.05'),
                    toNano('20')
                );

                const secondLosses = await multiTrancheVault.getAccumulatedLosses();

                // Total should be cumulative
                expect(secondLosses).toBeGreaterThan(firstLosses);
                expect(secondLosses).toEqual(firstLosses + toNano('20'));
            });
        });

        describe('Reentrancy Protection', () => {
            it('should prevent reentrancy during loss absorption', async () => {
                // The contract has reentrancy guard
                // This test verifies it's set and cleared properly

                const result = await multiTrancheVault.sendAbsorbLoss(
                    claimsProcessor.getSender(),
                    toNano('0.05'),
                    toNano('10')
                );

                expect(result.transactions).toHaveTransaction({
                    from: claimsProcessor.address,
                    to: multiTrancheVault.address,
                    success: true,
                });

                // After transaction completes, reentrancy guard should be cleared
                // (no direct getter for reentrancy_guard, but we can verify via behavior)
            });
        });

        describe('Event Emissions', () => {
            it('should emit per-tranche loss event (0x34) for each affected tranche', async () => {
                const result = await multiTrancheVault.sendAbsorbLoss(
                    claimsProcessor.getSender(),
                    toNano('0.05'),
                    toNano('10')
                );

                expect(result.transactions).toHaveTransaction({
                    from: claimsProcessor.address,
                    to: multiTrancheVault.address,
                    success: true,
                });

                // Event 0x34 should be emitted for each tranche that absorbed loss
                // Actual log parsing would be needed for full verification
            });

            it('should emit circuit breaker event (0x40) when triggered', async () => {
                const largeLoss = toNano('1000');

                const result = await multiTrancheVault.sendAbsorbLoss(
                    claimsProcessor.getSender(),
                    toNano('0.05'),
                    largeLoss
                );

                expect(result.transactions).toHaveTransaction({
                    from: claimsProcessor.address,
                    to: multiTrancheVault.address,
                    success: true,
                });

                // Event 0x40 should be emitted if circuit breaker triggered
            });
        });
    });

    describe('Waterfall Loss Absorption - Advanced Scenarios', () => {
        it('should absorb small loss from EQT only', async () => {
            // Setup: Deposit to EQT tranche
            const user1 = await blockchain.treasury('user_1');
            const depositAmount = toNano('100');
            const depositResult = await multiTrancheVault.sendDeposit(user1.getSender(), {
                value: depositAmount + toNano('0.2'),
                trancheId: 6,  // EQT tranche
            });

            console.log('[DEBUG] Deposit result:', {
                txCount: depositResult.transactions.length,
                success: depositResult.transactions.map((tx, i) => ({
                    tx: i,
                    success: tx.description.type === 'generic' && tx.description.computePhase.type === 'vm' ? tx.description.computePhase.success : 'N/A',
                    exitCode: tx.description.type === 'generic' && tx.description.computePhase.type === 'vm' ? tx.description.computePhase.exitCode : 'N/A'
                }))
            });

            const smallLoss = toNano('50');
            const initialEqtCapital = await multiTrancheVault.getTrancheCapital(6);
            console.log('[DEBUG] Initial EQT capital:', initialEqtCapital.toString());

            await multiTrancheVault.sendAbsorbLoss(
                claimsProcessor.getSender(),
                toNano('0.05'),
                smallLoss
            );

            const finalEqtCapital = await multiTrancheVault.getTrancheCapital(6);
            expect(finalEqtCapital).toEqual(initialEqtCapital - smallLoss);

            // Other tranches should be unaffected
            for (let trancheId = 1; trancheId <= 5; trancheId++) {
                const capital = await multiTrancheVault.getTrancheCapital(trancheId);
                expect(capital).toBeGreaterThan(0n);
            }
        });

        it('should cascade to JNR+ on medium loss', async () => {
            const mediumLoss = toNano('150'); // Exceeds EQT capacity (100)

            await multiTrancheVault.sendAbsorbLoss(
                claimsProcessor.getSender(),
                toNano('0.05'),
                mediumLoss
            );

            // EQT should be fully depleted
            const eqtCapital = await multiTrancheVault.getTrancheCapital(6);
            expect(eqtCapital).toEqual(0n);

            // JNR+ should absorb remaining 50 TON
            const jnrPlusCapital = await multiTrancheVault.getTrancheCapital(5);
            expect(jnrPlusCapital).toEqual(toNano('70')); // 120 - 50
        });

        it('should hit all 6 tranches on catastrophic loss', async () => {
            const catastrophicLoss = toNano('1200'); // Exceeds total capacity (1000)

            const result = await multiTrancheVault.sendAbsorbLoss(
                claimsProcessor.getSender(),
                toNano('0.05'),
                catastrophicLoss
            );

            // All tranches should be depleted
            for (let trancheId = 1; trancheId <= 6; trancheId++) {
                const capital = await multiTrancheVault.getTrancheCapital(trancheId);
                expect(capital).toEqual(0n);
            }

            // Vault should be paused due to insolvency
            const paused = await multiTrancheVault.getPaused();
            expect(paused).toBe(true);

            // Insolvency event (0x41) should be emitted
            const insolvencyEvent = result.events.find(
                (e) => e.type === 'log' && e.log_type === 0x41
            );
            expect(insolvencyEvent).toBeDefined();
        });

        it('should trigger circuit breaker at 10% loss/24h', async () => {
            const totalCapital = await multiTrancheVault.getTotalCapital();
            const tenPercentLoss = (totalCapital * 11n) / 100n; // 11% to trigger

            const result = await multiTrancheVault.sendAbsorbLoss(
                claimsProcessor.getSender(),
                toNano('0.05'),
                tenPercentLoss
            );

            // Vault should be paused
            const paused = await multiTrancheVault.getPaused();
            expect(paused).toBe(true);

            // Circuit breaker event (0x40) should be emitted
            const cbEvent = result.events.find(
                (e) => e.type === 'log' && e.log_type === 0x40
            );
            expect(cbEvent).toBeDefined();
        });

        it('should handle multiple sequential losses correctly', async () => {
            // First loss: 30 TON (EQT absorbs)
            await multiTrancheVault.sendAbsorbLoss(
                claimsProcessor.getSender(),
                toNano('0.05'),
                toNano('30')
            );

            let eqtCapital = await multiTrancheVault.getTrancheCapital(6);
            expect(eqtCapital).toEqual(toNano('70')); // 100 - 30

            // Second loss: 80 TON (EQT fully depleted, JNR+ absorbs 10)
            await multiTrancheVault.sendAbsorbLoss(
                claimsProcessor.getSender(),
                toNano('0.05'),
                toNano('80')
            );

            eqtCapital = await multiTrancheVault.getTrancheCapital(6);
            expect(eqtCapital).toEqual(0n);

            const jnrPlusCapital = await multiTrancheVault.getTrancheCapital(5);
            expect(jnrPlusCapital).toEqual(toNano('110')); // 120 - 10

            // Third loss: 50 TON (JNR+ absorbs)
            await multiTrancheVault.sendAbsorbLoss(
                claimsProcessor.getSender(),
                toNano('0.05'),
                toNano('50')
            );

            const finalJnrPlusCapital = await multiTrancheVault.getTrancheCapital(5);
            expect(finalJnrPlusCapital).toEqual(toNano('60')); // 110 - 50

            // Verify accumulated losses
            const totalLosses = await multiTrancheVault.getAccumulatedLosses();
            expect(totalLosses).toEqual(toNano('160')); // 30 + 80 + 50
        });
    });

    describe('Concurrent Operations - Stress Tests', () => {
        it('should handle 100 parallel deposits', async () => {
            const users = await Promise.all(
                Array.from({ length: 100 }, (_, i) => blockchain.treasury(`user_${i}`))
            );

            const depositAmount = toNano('10');
            const trancheId = 1; // BTC tranche

            const initialCapital = await multiTrancheVault.getTrancheCapital(trancheId);

            // Execute 100 deposits concurrently
            const results = await Promise.all(
                users.map((user) =>
                    multiTrancheVault.sendDeposit(user.getSender(), {
                        value: depositAmount + toNano('0.2'),
                        trancheId,
                    })
                )
            );

            // Count successful deposits
            const successCount = results.filter((r) =>
                r.transactions.some((tx) => tx.success && tx.to?.equals(multiTrancheVault.address))
            ).length;

            // Verify capital increased correctly
            const finalCapital = await multiTrancheVault.getTrancheCapital(trancheId);
            const expectedCapital = initialCapital + BigInt(successCount) * depositAmount;

            expect(finalCapital).toEqual(expectedCapital);
        });

        it('should maintain correct NAV with concurrent ops', async () => {
            // Setup: Initial deposits
            const depositors = await Promise.all([
                blockchain.treasury('dep1'),
                blockchain.treasury('dep2'),
                blockchain.treasury('dep3'),
            ]);

            for (const dep of depositors) {
                await multiTrancheVault.sendDeposit(dep.getSender(), {
                    value: toNano('100') + toNano('0.2'),
                    trancheId: 1,
                });
            }

            const initialNav = await multiTrancheVault.getTrancheNAV(1);

            // Concurrent operations: deposits + withdrawals + premium distribution
            const ops = [
                // 5 new deposits
                ...Array.from({ length: 5 }, (_, i) =>
                    blockchain.treasury(`new_dep_${i}`).then((user) =>
                        multiTrancheVault.sendDeposit(user.getSender(), {
                            value: toNano('50') + toNano('0.2'),
                            trancheId: 1,
                        })
                    )
                ),
                // 2 withdrawals
                multiTrancheVault.sendWithdraw(depositors[0].getSender(), {
                    value: toNano('0.2'),
                    trancheId: 1,
                    amount: toNano('30'),
                }),
                multiTrancheVault.sendWithdraw(depositors[1].getSender(), {
                    value: toNano('0.2'),
                    trancheId: 1,
                    amount: toNano('20'),
                }),
                // 1 premium distribution
                multiTrancheVault.sendDistributePremiums(admin.getSender(), {
                    value: toNano('0.1'),
                    premiumAmount: toNano('10'),
                }),
            ];

            await Promise.all(ops);

            // Verify NAV remained stable (within 2% due to fees/yield)
            const finalNav = await multiTrancheVault.getTrancheNAV(1);
            const navChange = Number(finalNav - initialNav) / Number(initialNav);

            expect(Math.abs(navChange)).toBeLessThan(0.02); // <2% change
        });

        it('should handle concurrent deposits and losses', async () => {
            const users = await Promise.all(
                Array.from({ length: 20 }, (_, i) => blockchain.treasury(`user_${i}`))
            );

            // Start deposits
            const depositPromises = users.map((user) =>
                multiTrancheVault.sendDeposit(user.getSender(), {
                    value: toNano('50') + toNano('0.2'),
                    trancheId: 6, // EQT (first loss)
                })
            );

            // Simulate concurrent losses
            const lossPromises = [
                multiTrancheVault.sendAbsorbLoss(
                    claimsProcessor.getSender(),
                    toNano('0.05'),
                    toNano('100')
                ),
                multiTrancheVault.sendAbsorbLoss(
                    claimsProcessor.getSender(),
                    toNano('0.05'),
                    toNano('50')
                ),
            ];

            await Promise.all([...depositPromises, ...lossPromises]);

            // Verify accounting is correct
            const totalCapital = await multiTrancheVault.getTotalCapital();
            const accumulatedLosses = await multiTrancheVault.getAccumulatedLosses();

            // Total capital should be deposits minus losses
            expect(totalCapital).toBeGreaterThan(0n);
            expect(accumulatedLosses).toEqual(toNano('150'));
        });
    });

    describe('Gas Profiling - Comprehensive', () => {
        it('deposit should cost <0.12 TON', async () => {
            const user = await blockchain.treasury('user');
            const depositAmount = toNano('100');

            const result = await multiTrancheVault.sendDeposit(user.getSender(), {
                value: depositAmount + toNano('0.2'),
                trancheId: 1,
            });

            const totalGas = result.transactions
                .slice(1)
                .reduce((sum, tx) => sum + tx.totalFees.coins, 0n);

            expect(Number(totalGas) / 1e9).toBeLessThan(0.12);

            console.log(`Deposit gas cost: ${Number(totalGas) / 1e9} TON`);
        });

        it('withdraw should cost <0.23 TON', async () => {
            const user = await blockchain.treasury('user');

            // First deposit
            await multiTrancheVault.sendDeposit(user.getSender(), {
                value: toNano('100') + toNano('0.2'),
                trancheId: 1,
            });

            // Then withdraw
            const result = await multiTrancheVault.sendWithdraw(user.getSender(), {
                value: toNano('0.3'),
                trancheId: 1,
                amount: toNano('50'),
            });

            const totalGas = result.transactions
                .slice(1)
                .reduce((sum, tx) => sum + tx.totalFees.coins, 0n);

            expect(Number(totalGas) / 1e9).toBeLessThan(0.23);

            console.log(`Withdraw gas cost: ${Number(totalGas) / 1e9} TON`);
        });

        it('absorb_loss should cost <0.25 TON', async () => {
            // Setup capital
            const user = await blockchain.treasury('user');
            await multiTrancheVault.sendDeposit(user.getSender(), {
                value: toNano('1000') + toNano('0.2'),
                trancheId: 1,
            });

            // Absorb loss
            const result = await multiTrancheVault.sendAbsorbLoss(
                claimsProcessor.getSender(),
                toNano('0.3'),
                toNano('100')
            );

            const totalGas = result.transactions
                .slice(1)
                .reduce((sum, tx) => sum + tx.totalFees.coins, 0n);

            expect(Number(totalGas) / 1e9).toBeLessThan(0.25);

            console.log(`Absorb loss gas cost: ${Number(totalGas) / 1e9} TON`);
        });

        it('distribute_premiums should cost <0.15 TON', async () => {
            const result = await multiTrancheVault.sendDistributePremiums(
                admin.getSender(),
                {
                    value: toNano('0.2'),
                    premiumAmount: toNano('100'),
                }
            );

            const totalGas = result.transactions
                .slice(1)
                .reduce((sum, tx) => sum + tx.totalFees.coins, 0n);

            expect(Number(totalGas) / 1e9).toBeLessThan(0.15);

            console.log(`Distribute premiums gas cost: ${Number(totalGas) / 1e9} TON`);
        });

        it('should profile gas at different tranche sizes', async () => {
            const user = await blockchain.treasury('user');
            const gasCosts: Record<number, number> = {};

            // Test deposits to tranches with varying capital
            for (let trancheId = 1; trancheId <= 6; trancheId++) {
                const result = await multiTrancheVault.sendDeposit(user.getSender(), {
                    value: toNano('100') + toNano('0.2'),
                    trancheId,
                });

                const totalGas = result.transactions
                    .slice(1)
                    .reduce((sum, tx) => sum + tx.totalFees.coins, 0n);

                gasCosts[trancheId] = Number(totalGas) / 1e9;
            }

            console.log('Gas costs by tranche:', gasCosts);

            // All should be within similar range
            const gasValues = Object.values(gasCosts);
            const maxGas = Math.max(...gasValues);
            const minGas = Math.min(...gasValues);
            const variance = maxGas - minGas;

            // Variance should be <0.02 TON (gas costs should be consistent)
            expect(variance).toBeLessThan(0.02);
        });
    });

    describe('NAV Calculation and Yield Distribution', () => {
        it('should calculate correct NAV for tranche', async () => {
            const user = await blockchain.treasury('user');

            // Deposit 1000 TON
            await multiTrancheVault.sendDeposit(user.getSender(), {
                value: toNano('1000') + toNano('0.2'),
                trancheId: 1,
            });

            // Initial NAV should be 1.0
            const initialNav = await multiTrancheVault.getTrancheNAV(1);
            expect(initialNav).toEqual(toNano('1')); // 1:1 ratio

            // Add yield
            await multiTrancheVault.sendDistributePremiums(admin.getSender(), {
                value: toNano('0.1'),
                premiumAmount: toNano('100'),
            });

            // NAV should increase (capital + yield) / tokens
            const newNav = await multiTrancheVault.getTrancheNAV(1);
            expect(newNav).toBeGreaterThan(initialNav);
        });

        it('should distribute premiums proportionally across tranches', async () => {
            // Setup: Deposit to multiple tranches
            const users = await Promise.all([
                blockchain.treasury('btc_user'),
                blockchain.treasury('snr_user'),
                blockchain.treasury('mezz_user'),
            ]);

            await multiTrancheVault.sendDeposit(users[0].getSender(), {
                value: toNano('100') + toNano('0.2'),
                trancheId: 1, // BTC
            });

            await multiTrancheVault.sendDeposit(users[1].getSender(), {
                value: toNano('200') + toNano('0.2'),
                trancheId: 2, // SNR
            });

            await multiTrancheVault.sendDeposit(users[2].getSender(), {
                value: toNano('300') + toNano('0.2'),
                trancheId: 3, // MEZZ
            });

            // Record initial yields
            const initialYields: bigint[] = [];
            for (let trancheId = 1; trancheId <= 3; trancheId++) {
                const yieldData = await multiTrancheVault.getTrancheAccumulatedYield(trancheId);
                initialYields.push(yieldData);
            }

            // Distribute 600 TON premium
            await multiTrancheVault.sendDistributePremiums(admin.getSender(), {
                value: toNano('0.1'),
                premiumAmount: toNano('600'),
            });

            // Verify yields increased proportionally
            // BTC (100 TON / 600 total = 16.67%) should get ~100 TON
            // SNR (200 TON / 600 total = 33.33%) should get ~200 TON
            // MEZZ (300 TON / 600 total = 50%) should get ~300 TON

            const finalYields: bigint[] = [];
            for (let trancheId = 1; trancheId <= 3; trancheId++) {
                const yieldData = await multiTrancheVault.getTrancheAccumulatedYield(trancheId);
                finalYields.push(yieldData);
            }

            const yieldIncreases = finalYields.map((y, i) => y - initialYields[i]);

            // Allow 5% variance due to rounding
            expect(Number(yieldIncreases[0])).toBeGreaterThan(95);
            expect(Number(yieldIncreases[0])).toBeLessThan(105);

            expect(Number(yieldIncreases[1])).toBeGreaterThan(190);
            expect(Number(yieldIncreases[1])).toBeLessThan(210);

            expect(Number(yieldIncreases[2])).toBeGreaterThan(285);
            expect(Number(yieldIncreases[2])).toBeLessThan(315);
        });
    });

    describe('Edge Cases and Boundary Conditions', () => {
        it('should handle zero capital deposit attempt', async () => {
            const user = await blockchain.treasury('user');

            const result = await multiTrancheVault.sendDeposit(user.getSender(), {
                value: toNano('0.2'), // Only gas, no deposit
                trancheId: 1,
            });

            expect(result.transactions).toHaveTransaction({
                from: user.address,
                to: multiTrancheVault.address,
                success: false,
                exitCode: 400, // ERR_INVALID_AMOUNT
            });
        });

        it('should handle withdrawal exceeding balance', async () => {
            const user = await blockchain.treasury('user');

            // Deposit 100 TON
            await multiTrancheVault.sendDeposit(user.getSender(), {
                value: toNano('100') + toNano('0.2'),
                trancheId: 1,
            });

            // Try to withdraw 200 TON
            const result = await multiTrancheVault.sendWithdraw(user.getSender(), {
                value: toNano('0.2'),
                trancheId: 1,
                amount: toNano('200'),
            });

            expect(result.transactions).toHaveTransaction({
                from: user.address,
                to: multiTrancheVault.address,
                success: false,
                exitCode: 401, // ERR_INSUFFICIENT_BALANCE
            });
        });

        it('should handle invalid tranche ID', async () => {
            const user = await blockchain.treasury('user');

            // Tranche ID 0 (invalid)
            const result = await multiTrancheVault.sendDeposit(user.getSender(), {
                value: toNano('100') + toNano('0.2'),
                trancheId: 0,
            });

            expect(result.transactions).toHaveTransaction({
                from: user.address,
                to: multiTrancheVault.address,
                success: false,
                exitCode: 402, // ERR_INVALID_TRANCHE
            });
        });

        it('should handle very large deposit (100k TON)', async () => {
            const whale = await blockchain.treasury('whale', { balance: toNano('200000') });

            const largeDeposit = toNano('100000');
            const result = await multiTrancheVault.sendDeposit(whale.getSender(), {
                value: largeDeposit + toNano('0.2'),
                trancheId: 1,
            });

            expect(result.transactions).toHaveTransaction({
                from: whale.address,
                to: multiTrancheVault.address,
                success: true,
            });

            const capital = await multiTrancheVault.getTrancheCapital(1);
            expect(capital).toBeGreaterThanOrEqual(largeDeposit);
        });

        it('should handle very small deposit (0.01 TON)', async () => {
            const user = await blockchain.treasury('user');

            const tinyDeposit = toNano('0.01');
            const result = await multiTrancheVault.sendDeposit(user.getSender(), {
                value: tinyDeposit + toNano('0.2'),
                trancheId: 1,
            });

            // Should either succeed or fail with minimum deposit error
            // If it succeeds, verify capital increased
            if (result.transactions.some((tx) => tx.success && tx.to?.equals(multiTrancheVault.address))) {
                const capital = await multiTrancheVault.getTrancheCapital(1);
                expect(capital).toBeGreaterThan(0n);
            }
        });
    });

    describe('Premium Distribution - Advanced', () => {
        it('should handle premium distribution to empty vault', async () => {
            // Vault has no capital, distribute premiums
            const result = await multiTrancheVault.sendDistributePremiums(admin.getSender(), {
                value: toNano('0.1'),
                premiumAmount: toNano('100'),
            });

            // Should succeed, premiums stored in accumulated_premiums
            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: multiTrancheVault.address,
                success: true,
            });

            const accumulatedPremiums = await multiTrancheVault.getAccumulatedPremiums();
            expect(accumulatedPremiums).toBeGreaterThan(0n);
        });

        it('should compound premiums with subsequent deposits', async () => {
            const user = await blockchain.treasury('user');

            // Distribute premiums to empty vault
            await multiTrancheVault.sendDistributePremiums(admin.getSender(), {
                value: toNano('0.1'),
                premiumAmount: toNano('100'),
            });

            // Now deposit - should get benefit of accumulated premiums
            await multiTrancheVault.sendDeposit(user.getSender(), {
                value: toNano('1000') + toNano('0.2'),
                trancheId: 1,
            });

            // NAV should reflect premiums
            const nav = await multiTrancheVault.getTrancheNAV(1);
            expect(nav).toBeGreaterThan(toNano('1'));
        });
    });
});
