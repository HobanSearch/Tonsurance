/**
 * AGENT-B: Circuit Breaker Sliding Window Tests
 *
 * Tests for window boundary edge case fix in MultiTrancheVault.fc
 *
 * Target: Verify that circuit breaker correctly prevents attacks
 * that time losses across 24-hour window boundaries.
 */

import { Blockchain, SandboxContract, TreasuryContract, printTransactionFees } from '@ton/sandbox';
import { Cell, toNano, beginCell, Address } from '@ton/core';
import { MultiTrancheVault } from '../wrappers/MultiTrancheVault';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

describe('Agent-B: Circuit Breaker Sliding Window Tests', () => {
    let code: Cell;
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let vault: SandboxContract<MultiTrancheVault>;
    let claimsProcessor: SandboxContract<TreasuryContract>;

    const INITIAL_CAPITAL = toNano('10000000'); // $10M vault
    const THRESHOLD_10_PERCENT = toNano('1000000'); // $1M = 10% of $10M

    beforeAll(async () => {
        code = await compile('MultiTrancheVault');
    });

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');
        claimsProcessor = await blockchain.treasury('claims_processor');

        // Deploy vault
        vault = blockchain.openContract(
            MultiTrancheVault.createFromConfig(
                {
                    owner: deployer.address,
                    admin: deployer.address,
                    claims_processor: claimsProcessor.address,
                    total_capital: INITIAL_CAPITAL,
                    paused: false,
                },
                code
            )
        );

        const deployResult = await vault.sendDeploy(deployer.getSender(), toNano('1'));
        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: vault.address,
            deploy: true,
            success: true,
        });
    });

    /**
     * TEST 1: Window Boundary Attack Prevention
     *
     * Verifies that attacker cannot split 18% loss across window boundary
     * to bypass 10% circuit breaker threshold.
     */
    describe('TEST-1: Window Boundary Attack Prevention', () => {
        it('should prevent window boundary attack with 9% + 9% losses', async () => {
            // Setup: Vault has $10M capital, 10% threshold = $1M

            // STEP 1: Attacker triggers 9% loss at 23:59:00 (before window expires)
            // Advance time to 23:59:00 of first window
            blockchain.now = Math.floor(Date.now() / 1000);
            const windowStart = blockchain.now;
            blockchain.now = windowStart + 86400 - 60; // 23:59:00

            const loss1 = toNano('900000'); // $900k = 9%
            const result1 = await vault.sendAbsorbLoss(
                claimsProcessor.getSender(),
                {
                    loss_amount: loss1,
                    value: toNano('0.2'),
                }
            );

            expect(result1.transactions).toHaveTransaction({
                from: claimsProcessor.address,
                to: vault.address,
                success: true,
            });

            // Verify: Circuit breaker NOT triggered (9% < 10%)
            const status1 = await vault.getCircuitBreakerStatus();
            expect(status1.losses).toBeLessThan(THRESHOLD_10_PERCENT);
            expect(await vault.getPaused()).toBe(false);

            // STEP 2: Advance time to 00:00:01 (window boundary crossed)
            blockchain.now = windowStart + 86400 + 1; // 00:00:01 of new window

            // STEP 3: Attacker tries another 9% loss immediately
            const loss2 = toNano('900000'); // $900k = 9%
            const result2 = await vault.sendAbsorbLoss(
                claimsProcessor.getSender(),
                {
                    loss_amount: loss2,
                    value: toNano('0.2'),
                }
            );

            // AGENT-B FIX VERIFICATION:
            // Before fix: circuit_breaker_losses would reset to 0, allowing 2nd loss through
            // After fix: overlap_losses = 900k carried forward, total = 1.8M > 1M threshold

            // Verify: Circuit breaker SHOULD trigger (9% + 9% = 18% > 10%)
            expect(result2.transactions).toHaveTransaction({
                from: claimsProcessor.address,
                to: vault.address,
                success: true,
            });

            // Verify: Vault auto-paused due to circuit breaker
            const isPaused = await vault.getPaused();
            expect(isPaused).toBe(true);

            // Verify: Circuit breaker event (0x40) emitted
            expect(result2.transactions).toHaveTransaction({
                from: vault.address,
                to: undefined, // External message (event log)
                outMessagesCount: 1, // Circuit breaker event
            });

            // Verify: Total losses tracked correctly
            const status2 = await vault.getCircuitBreakerStatus();
            expect(status2.losses).toBeGreaterThanOrEqual(THRESHOLD_10_PERCENT);
        });

        it('should track multiple losses across window boundary', async () => {
            // Setup: Multiple small losses that accumulate across boundary
            blockchain.now = Math.floor(Date.now() / 1000);
            const windowStart = blockchain.now;

            // Loss 1: 3% at 23:30 (30 min before expiry, IN overlap window)
            blockchain.now = windowStart + 86400 - 1800; // 23:30:00
            await vault.sendAbsorbLoss(claimsProcessor.getSender(), {
                loss_amount: toNano('300000'), // $300k
                value: toNano('0.2'),
            });

            // Loss 2: 3% at 23:45 (15 min before expiry, IN overlap window)
            blockchain.now = windowStart + 86400 - 900; // 23:45:00
            await vault.sendAbsorbLoss(claimsProcessor.getSender(), {
                loss_amount: toNano('300000'), // $300k
                value: toNano('0.2'),
            });

            // Loss 3: 3% at 23:55 (5 min before expiry, IN overlap window)
            blockchain.now = windowStart + 86400 - 300; // 23:55:00
            await vault.sendAbsorbLoss(claimsProcessor.getSender(), {
                loss_amount: toNano('300000'), // $300k
                value: toNano('0.2'),
            });

            // Verify: Before window reset, losses = 9%
            const statusBefore = await vault.getCircuitBreakerStatus();
            expect(statusBefore.losses).toEqual(toNano('900000'));

            // Cross window boundary
            blockchain.now = windowStart + 86400 + 1; // 00:00:01

            // Loss 4: 3% in new window
            const result4 = await vault.sendAbsorbLoss(claimsProcessor.getSender(), {
                loss_amount: toNano('300000'), // $300k
                value: toNano('0.2'),
            });

            // Verify: Overlap losses (last 1 hour) = 900k carried forward
            // Total = 900k + 300k = 1.2M > 1M threshold → TRIGGER
            expect(await vault.getPaused()).toBe(true);
        });

        it('should correctly exclude losses outside overlap window', async () => {
            blockchain.now = Math.floor(Date.now() / 1000);
            const windowStart = blockchain.now;

            // Loss 1: 5% at 22:30 (1.5 hours before expiry, OUTSIDE overlap)
            blockchain.now = windowStart + 86400 - 5400; // 22:30:00
            await vault.sendAbsorbLoss(claimsProcessor.getSender(), {
                loss_amount: toNano('500000'), // $500k
                value: toNano('0.2'),
            });

            // Loss 2: 4% at 23:30 (30 min before expiry, IN overlap)
            blockchain.now = windowStart + 86400 - 1800; // 23:30:00
            await vault.sendAbsorbLoss(claimsProcessor.getSender(), {
                loss_amount: toNano('400000'), // $400k
                value: toNano('0.2'),
            });

            // Cross boundary
            blockchain.now = windowStart + 86400 + 1; // 00:00:01

            // Loss 3: 5% in new window
            const result3 = await vault.sendAbsorbLoss(claimsProcessor.getSender(), {
                loss_amount: toNano('500000'), // $500k
                value: toNano('0.2'),
            });

            // Verify: Only loss 2 (400k) carried forward from overlap
            // Total = 400k + 500k = 900k < 1M threshold → NO TRIGGER
            expect(await vault.getPaused()).toBe(false);

            // One more 2% loss should trigger (400k + 500k + 200k = 1.1M > 1M)
            const result4 = await vault.sendAbsorbLoss(claimsProcessor.getSender(), {
                loss_amount: toNano('200000'), // $200k
                value: toNano('0.2'),
            });
            expect(await vault.getPaused()).toBe(true);
        });
    });

    /**
     * TEST 2: Sliding Window Mechanics
     *
     * Verifies correct calculation of overlap losses during window transitions.
     */
    describe('TEST-2: Sliding Window Mechanics', () => {
        it('should calculate overlap losses correctly on window reset', async () => {
            blockchain.now = Math.floor(Date.now() / 1000);
            const windowStart = blockchain.now;

            // Create losses throughout window
            const lossEvents = [
                { time: windowStart + 82800, amount: toNano('100000') }, // 23:00 (in overlap)
                { time: windowStart + 84600, amount: toNano('150000') }, // 23:30 (in overlap)
                { time: windowStart + 85800, amount: toNano('200000') }, // 23:50 (in overlap)
            ];

            for (const event of lossEvents) {
                blockchain.now = event.time;
                await vault.sendAbsorbLoss(claimsProcessor.getSender(), {
                    loss_amount: event.amount,
                    value: toNano('0.2'),
                });
            }

            // Verify total before reset
            const statusBefore = await vault.getCircuitBreakerStatus();
            expect(statusBefore.losses).toEqual(toNano('450000'));

            // Trigger window reset by crossing boundary
            blockchain.now = windowStart + 86400 + 1;

            // Send small loss to trigger recalculation
            const resetResult = await vault.sendAbsorbLoss(claimsProcessor.getSender(), {
                loss_amount: toNano('1000'), // Tiny loss
                value: toNano('0.2'),
            });

            // Verify: Window reset event (0x42) emitted with overlap details
            expect(resetResult.transactions).toHaveTransaction({
                from: vault.address,
                outMessagesCount: 1, // Window reset event
            });

            // Verify: Overlap losses = all 3 losses (all in last hour)
            // Total = 450k + 1k = 451k
            const statusAfter = await vault.getCircuitBreakerStatus();
            expect(statusAfter.losses).toEqual(toNano('451000'));
            expect(statusAfter.window_start).toEqual(windowStart + 86400 + 1);
        });

        it('should handle empty overlap window gracefully', async () => {
            blockchain.now = Math.floor(Date.now() / 1000);
            const windowStart = blockchain.now;

            // Loss at 22:00 (OUTSIDE overlap window)
            blockchain.now = windowStart + 79200; // 22:00:00
            await vault.sendAbsorbLoss(claimsProcessor.getSender(), {
                loss_amount: toNano('500000'), // $500k
                value: toNano('0.2'),
            });

            // No losses in overlap period (23:00-00:00)

            // Cross boundary
            blockchain.now = windowStart + 86400 + 1;

            // Trigger window reset
            await vault.sendAbsorbLoss(claimsProcessor.getSender(), {
                loss_amount: toNano('1000'),
                value: toNano('0.2'),
            });

            // Verify: Overlap losses = 0 (no losses in last hour)
            const status = await vault.getCircuitBreakerStatus();
            expect(status.losses).toEqual(toNano('1000')); // Only new loss
        });

        it('should handle multiple window resets correctly', async () => {
            blockchain.now = Math.floor(Date.now() / 1000);
            let currentWindowStart = blockchain.now;

            // Cycle through 3 windows with losses
            for (let window = 0; window < 3; window++) {
                // Loss at 23:45 (in overlap)
                blockchain.now = currentWindowStart + 86400 - 900;
                await vault.sendAbsorbLoss(claimsProcessor.getSender(), {
                    loss_amount: toNano('200000'), // $200k
                    value: toNano('0.2'),
                });

                // Move to next window
                currentWindowStart += 86400;
                blockchain.now = currentWindowStart + 1;
            }

            // Final loss in 4th window
            const finalResult = await vault.sendAbsorbLoss(claimsProcessor.getSender(), {
                loss_amount: toNano('600000'), // $600k
                value: toNano('0.2'),
            });

            // Verify: Should carry forward 200k from last window
            // Total = 200k + 600k = 800k < 1M → NO TRIGGER
            expect(await vault.getPaused()).toBe(false);

            // One more loss should trigger
            await vault.sendAbsorbLoss(claimsProcessor.getSender(), {
                loss_amount: toNano('300000'), // $300k
                value: toNano('0.2'),
            });
            expect(await vault.getPaused()).toBe(true);
        });
    });

    /**
     * TEST 3: Storage Cleanup
     *
     * Verifies that old loss records are properly cleaned up
     * to prevent unbounded storage growth.
     */
    describe('TEST-3: Storage Cleanup', () => {
        it('should cleanup losses older than 25 hours', async () => {
            blockchain.now = Math.floor(Date.now() / 1000);
            const startTime = blockchain.now;

            // Create losses over 30 hours
            for (let hour = 0; hour < 30; hour++) {
                blockchain.now = startTime + hour * 3600;
                await vault.sendAbsorbLoss(claimsProcessor.getSender(), {
                    loss_amount: toNano('10000'), // $10k per hour
                    value: toNano('0.2'),
                });
            }

            // Verify: Storage should only contain last ~25 hours
            // (Exact count depends on cleanup implementation)
            const status = await vault.getCircuitBreakerStatus();

            // Total should be approximately 25 * 10k = 250k (not 30 * 10k = 300k)
            expect(status.losses).toBeLessThanOrEqual(toNano('260000'));
        });

        it('should handle cleanup during high-frequency losses', async () => {
            blockchain.now = Math.floor(Date.now() / 1000);
            const startTime = blockchain.now;

            // Simulate 1 loss per minute for 2 hours (120 losses)
            for (let min = 0; min < 120; min++) {
                blockchain.now = startTime + min * 60;
                await vault.sendAbsorbLoss(claimsProcessor.getSender(), {
                    loss_amount: toNano('1000'), // $1k per minute
                    value: toNano('0.2'),
                });
            }

            // Advance 24+ hours
            blockchain.now = startTime + 86400 + 1;

            // Trigger cleanup with new loss
            await vault.sendAbsorbLoss(claimsProcessor.getSender(), {
                loss_amount: toNano('1000'),
                value: toNano('0.2'),
            });

            // Verify: Old losses (120 losses from 24+ hours ago) should be cleaned up
            // Only last hour (60 losses) + new loss should remain
            const status = await vault.getCircuitBreakerStatus();
            expect(status.losses).toBeLessThanOrEqual(toNano('62000')); // ~60-61k
        });
    });

    /**
     * TEST 4: Gas Cost Verification
     *
     * Verifies that sliding window implementation has acceptable gas costs.
     */
    describe('TEST-4: Gas Cost Verification', () => {
        it('should have acceptable gas cost per loss event', async () => {
            blockchain.now = Math.floor(Date.now() / 1000);

            // Measure gas for single loss
            const result = await vault.sendAbsorbLoss(claimsProcessor.getSender(), {
                loss_amount: toNano('100000'),
                value: toNano('0.2'),
            });

            printTransactionFees(result.transactions);

            // Verify: Gas cost should be < 0.00005 TON per loss
            const txFee = result.transactions[1].totalFees.coins;
            expect(txFee).toBeLessThan(toNano('0.00005'));
        });

        it('should handle window reset gas cost gracefully', async () => {
            blockchain.now = Math.floor(Date.now() / 1000);
            const windowStart = blockchain.now;

            // Create 50 losses in overlap window (worst-case for reset)
            for (let i = 0; i < 50; i++) {
                blockchain.now = windowStart + 86400 - 3600 + i * 60; // One per minute
                await vault.sendAbsorbLoss(claimsProcessor.getSender(), {
                    loss_amount: toNano('10000'),
                    value: toNano('0.2'),
                });
            }

            // Trigger window reset
            blockchain.now = windowStart + 86400 + 1;
            const resetResult = await vault.sendAbsorbLoss(claimsProcessor.getSender(), {
                loss_amount: toNano('1000'),
                value: toNano('0.2'),
            });

            printTransactionFees(resetResult.transactions);

            // Verify: Gas cost for reset should be < 0.0002 TON
            const txFee = resetResult.transactions[1].totalFees.coins;
            expect(txFee).toBeLessThan(toNano('0.0002'));
        });
    });

    /**
     * TEST 5: Edge Cases
     *
     * Tests boundary conditions and edge cases.
     */
    describe('TEST-5: Edge Cases', () => {
        it('should handle loss exactly at window boundary (t=86400)', async () => {
            blockchain.now = Math.floor(Date.now() / 1000);
            const windowStart = blockchain.now;

            // Loss at exactly t=86400 (window boundary)
            blockchain.now = windowStart + 86400;
            const result = await vault.sendAbsorbLoss(claimsProcessor.getSender(), {
                loss_amount: toNano('500000'),
                value: toNano('0.2'),
            });

            expect(result.transactions).toHaveTransaction({
                from: claimsProcessor.address,
                to: vault.address,
                success: true,
            });

            // Verify: Loss tracked in new window
            const status = await vault.getCircuitBreakerStatus();
            expect(status.window_start).toEqual(windowStart + 86400);
        });

        it('should handle zero losses gracefully', async () => {
            blockchain.now = Math.floor(Date.now() / 1000);
            const windowStart = blockchain.now;

            // Cross window boundary with no losses
            blockchain.now = windowStart + 86400 + 1;

            // First loss in new window
            await vault.sendAbsorbLoss(claimsProcessor.getSender(), {
                loss_amount: toNano('100000'),
                value: toNano('0.2'),
            });

            // Verify: Works correctly with empty overlap
            const status = await vault.getCircuitBreakerStatus();
            expect(status.losses).toEqual(toNano('100000'));
        });

        it('should handle loss amount exactly at threshold', async () => {
            blockchain.now = Math.floor(Date.now() / 1000);

            // Loss exactly at 10% threshold
            const result = await vault.sendAbsorbLoss(claimsProcessor.getSender(), {
                loss_amount: THRESHOLD_10_PERCENT,
                value: toNano('0.2'),
            });

            // Verify: Should NOT trigger at exactly 10% (> not >=)
            expect(await vault.getPaused()).toBe(false);

            // One more tiny loss should trigger
            await vault.sendAbsorbLoss(claimsProcessor.getSender(), {
                loss_amount: toNano('1'),
                value: toNano('0.2'),
            });
            expect(await vault.getPaused()).toBe(true);
        });
    });
});
