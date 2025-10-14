/**
 * PolicyManager Smart Contract Tests
 *
 * Tests core insurance policy lifecycle:
 * - Policy creation with valid parameters
 * - Premium payment validation
 * - Trigger detection and confirmation
 * - Payout calculation (linear between trigger and floor)
 * - 4-hour confirmation period
 * - Policy cancellation
 * - NFT minting to beneficiary
 */

import { Blockchain, SandboxContract, TreasuryContract } from '@ton-community/sandbox';
import { Cell, toNano, Address, beginCell } from 'ton-core';
import { PolicyManager } from '../wrappers/PolicyManager';
import '@ton-community/test-utils';
import { compile } from '@ton-community/blueprint';

describe('PolicyManager', () => {
    let code: Cell;
    let blockchain: Blockchain;
    let policyManager: SandboxContract<PolicyManager>;
    let deployer: SandboxContract<TreasuryContract>;
    let buyer: SandboxContract<TreasuryContract>;
    let beneficiary: SandboxContract<TreasuryContract>;
    let vault: SandboxContract<TreasuryContract>;
    let oracle: SandboxContract<TreasuryContract>;

    beforeAll(async () => {
        code = await compile('PolicyManager');
    });

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');
        buyer = await blockchain.treasury('buyer');
        beneficiary = await blockchain.treasury('beneficiary');
        vault = await blockchain.treasury('vault');
        oracle = await blockchain.treasury('oracle');

        policyManager = blockchain.openContract(
            PolicyManager.createFromConfig(
                {
                    policyCount: 0,
                    vaultAddress: vault.address,
                    oracleAddress: oracle.address,
                    minConfirmationPeriod: 14400, // 4 hours
                },
                code
            )
        );

        const deployResult = await policyManager.sendDeploy(deployer.getSender(), toNano('0.05'));
        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: policyManager.address,
            deploy: true,
            success: true,
        });
    });

    describe('Policy Creation', () => {
        it('should create policy with valid parameters', async () => {
            const result = await policyManager.sendCreatePolicy(
                buyer.getSender(),
                {
                    beneficiary: beneficiary.address,
                    assetType: 0, // USDC
                    coverageAmount: toNano('100000'), // $100k
                    premiumAmount: toNano('1000'), // $1k premium
                    triggerPrice: 9700, // $0.97
                    floorPrice: 9000, // $0.90
                    durationSeconds: 7776000, // 90 days
                },
                toNano('1000.1') // Premium + gas
            );

            expect(result.transactions).toHaveTransaction({
                from: buyer.address,
                to: policyManager.address,
                success: true,
            });

            // Verify policy count increased
            const policyCount = await policyManager.getPolicyCount();
            expect(policyCount).toBe(1n);

            // Verify policy details
            const policy = await policyManager.getPolicy(1n);
            expect(policy.buyer.equals(buyer.address)).toBe(true);
            expect(policy.beneficiary.equals(beneficiary.address)).toBe(true);
            expect(policy.coverageAmount).toBe(toNano('100000'));
            expect(policy.status).toBe(0); // STATUS_ACTIVE
        });

        it('should reject policy with zero coverage', async () => {
            const result = await policyManager.sendCreatePolicy(
                buyer.getSender(),
                {
                    beneficiary: beneficiary.address,
                    assetType: 0,
                    coverageAmount: toNano('0'),
                    premiumAmount: toNano('1000'),
                    triggerPrice: 9700,
                    floorPrice: 9000,
                    durationSeconds: 7776000,
                },
                toNano('1000.1')
            );

            expect(result.transactions).toHaveTransaction({
                from: buyer.address,
                to: policyManager.address,
                success: false,
                exitCode: 100,
            });
        });

        it('should reject policy with trigger <= floor', async () => {
            const result = await policyManager.sendCreatePolicy(
                buyer.getSender(),
                {
                    beneficiary: beneficiary.address,
                    assetType: 0,
                    coverageAmount: toNano('100000'),
                    premiumAmount: toNano('1000'),
                    triggerPrice: 9000,
                    floorPrice: 9000,
                    durationSeconds: 7776000,
                },
                toNano('1000.1')
            );

            expect(result.transactions).toHaveTransaction({
                success: false,
                exitCode: 102,
            });
        });

        it('should reject insufficient premium payment', async () => {
            const result = await policyManager.sendCreatePolicy(
                buyer.getSender(),
                {
                    beneficiary: beneficiary.address,
                    assetType: 0,
                    coverageAmount: toNano('100000'),
                    premiumAmount: toNano('1000'),
                    triggerPrice: 9700,
                    floorPrice: 9000,
                    durationSeconds: 7776000,
                },
                toNano('500') // Insufficient
            );

            expect(result.transactions).toHaveTransaction({
                success: false,
                exitCode: 107,
            });
        });

        it('should transfer premium to vault', async () => {
            const vaultBalanceBefore = await vault.getBalance();

            await policyManager.sendCreatePolicy(
                buyer.getSender(),
                {
                    beneficiary: beneficiary.address,
                    assetType: 0,
                    coverageAmount: toNano('100000'),
                    premiumAmount: toNano('1000'),
                    triggerPrice: 9700,
                    floorPrice: 9000,
                    durationSeconds: 7776000,
                },
                toNano('1000.1')
            );

            const vaultBalanceAfter = await vault.getBalance();
            expect(vaultBalanceAfter).toBeGreaterThan(vaultBalanceBefore);
        });
    });

    describe('Trigger Detection', () => {
        beforeEach(async () => {
            // Create a policy first
            await policyManager.sendCreatePolicy(
                buyer.getSender(),
                {
                    beneficiary: beneficiary.address,
                    assetType: 0,
                    coverageAmount: toNano('100000'),
                    premiumAmount: toNano('1000'),
                    triggerPrice: 9700, // $0.97
                    floorPrice: 9000,
                    durationSeconds: 7776000,
                },
                toNano('1000.1')
            );
        });

        it('should detect trigger when price < trigger_price', async () => {
            const result = await policyManager.sendCheckTrigger(
                oracle.getSender(),
                {
                    policyId: 1n,
                    currentPrice: 9600, // $0.96 < $0.97 trigger
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: oracle.address,
                to: policyManager.address,
                success: true,
            });

            // Verify policy status updated
            const policy = await policyManager.getPolicy(1n);
            expect(policy.status).toBe(1); // STATUS_TRIGGERED
            expect(policy.triggerTimestamp).toBeGreaterThan(0);
        });

        it('should not trigger when price >= trigger_price', async () => {
            await policyManager.sendCheckTrigger(
                oracle.getSender(),
                {
                    policyId: 1n,
                    currentPrice: 9800, // $0.98 >= $0.97
                }
            );

            const policy = await policyManager.getPolicy(1n);
            expect(policy.status).toBe(0); // Still STATUS_ACTIVE
            expect(policy.triggerTimestamp).toBe(0);
        });

        it('should only allow oracle to check trigger', async () => {
            const result = await policyManager.sendCheckTrigger(
                buyer.getSender(), // Not oracle
                {
                    policyId: 1n,
                    currentPrice: 9600,
                }
            );

            expect(result.transactions).toHaveTransaction({
                success: false,
                exitCode: 200,
            });
        });

        it('should require 4-hour confirmation period', async () => {
            // First trigger detection
            await policyManager.sendCheckTrigger(
                oracle.getSender(),
                {
                    policyId: 1n,
                    currentPrice: 9600,
                }
            );

            let policy = await policyManager.getPolicy(1n);
            expect(policy.confirmed).toBe(false);

            // Advance time by 3 hours (not enough)
            blockchain.now = blockchain.now + 10800;

            await policyManager.sendCheckTrigger(
                oracle.getSender(),
                {
                    policyId: 1n,
                    currentPrice: 9600,
                }
            );

            policy = await policyManager.getPolicy(1n);
            expect(policy.confirmed).toBe(false);

            // Advance time by another 2 hours (total 5 hours)
            blockchain.now = blockchain.now + 7200;

            await policyManager.sendCheckTrigger(
                oracle.getSender(),
                {
                    policyId: 1n,
                    currentPrice: 9600,
                }
            );

            policy = await policyManager.getPolicy(1n);
            expect(policy.confirmed).toBe(true);
        });

        it('should reset trigger if price recovers', async () => {
            // Trigger initially
            await policyManager.sendCheckTrigger(
                oracle.getSender(),
                {
                    policyId: 1n,
                    currentPrice: 9600,
                }
            );

            let policy = await policyManager.getPolicy(1n);
            expect(policy.status).toBe(1); // TRIGGERED

            // Price recovers
            await policyManager.sendCheckTrigger(
                oracle.getSender(),
                {
                    policyId: 1n,
                    currentPrice: 9800, // Above trigger
                }
            );

            policy = await policyManager.getPolicy(1n);
            expect(policy.status).toBe(0); // Back to ACTIVE
            expect(policy.triggerTimestamp).toBe(0);
            expect(policy.confirmed).toBe(false);
        });
    });

    describe('Payout Calculation', () => {
        it('should calculate correct payout at trigger price', async () => {
            await policyManager.sendCreatePolicy(
                buyer.getSender(),
                {
                    beneficiary: beneficiary.address,
                    assetType: 0,
                    coverageAmount: toNano('100000'),
                    premiumAmount: toNano('1000'),
                    triggerPrice: 9700,
                    floorPrice: 9000,
                    durationSeconds: 7776000,
                },
                toNano('1000.1')
            );

            const payout = await policyManager.calculateExpectedPayout(1n, 9700);
            expect(payout).toBe(0n); // At trigger, payout = 0
        });

        it('should calculate correct payout at floor price', async () => {
            await policyManager.sendCreatePolicy(
                buyer.getSender(),
                {
                    beneficiary: beneficiary.address,
                    assetType: 0,
                    coverageAmount: toNano('100000'),
                    premiumAmount: toNano('1000'),
                    triggerPrice: 9700,
                    floorPrice: 9000,
                    durationSeconds: 7776000,
                },
                toNano('1000.1')
            );

            const payout = await policyManager.calculateExpectedPayout(1n, 9000);
            expect(payout).toBe(toNano('100000')); // At floor, payout = full coverage
        });

        it('should calculate linear payout between trigger and floor', async () => {
            await policyManager.sendCreatePolicy(
                buyer.getSender(),
                {
                    beneficiary: beneficiary.address,
                    assetType: 0,
                    coverageAmount: toNano('100000'),
                    premiumAmount: toNano('1000'),
                    triggerPrice: 9700,
                    floorPrice: 9000,
                    durationSeconds: 7776000,
                },
                toNano('1000.1')
            );

            // At $0.935 (midpoint between $0.97 and $0.90)
            // Payout should be ~50% of coverage
            const payout = await policyManager.calculateExpectedPayout(1n, 9350);

            const expectedPayout = toNano('50000'); // Approximately 50%
            const tolerance = toNano('1000'); // Allow 1% tolerance

            expect(payout).toBeGreaterThan(expectedPayout - tolerance);
            expect(payout).toBeLessThan(expectedPayout + tolerance);
        });
    });

    describe('Payout Execution', () => {
        beforeEach(async () => {
            await policyManager.sendCreatePolicy(
                buyer.getSender(),
                {
                    beneficiary: beneficiary.address,
                    assetType: 0,
                    coverageAmount: toNano('100000'),
                    premiumAmount: toNano('1000'),
                    triggerPrice: 9700,
                    floorPrice: 9000,
                    durationSeconds: 7776000,
                },
                toNano('1000.1')
            );
        });

        it('should execute payout after confirmation', async () => {
            // Trigger
            await policyManager.sendCheckTrigger(
                oracle.getSender(),
                {
                    policyId: 1n,
                    currentPrice: 9350,
                }
            );

            // Wait 4 hours
            blockchain.now = blockchain.now + 14400;

            // Confirm
            await policyManager.sendCheckTrigger(
                oracle.getSender(),
                {
                    policyId: 1n,
                    currentPrice: 9350,
                }
            );

            // Execute payout
            const result = await policyManager.sendExecutePayout(
                oracle.getSender(),
                {
                    policyId: 1n,
                    currentPrice: 9350,
                }
            );

            expect(result.transactions).toHaveTransaction({
                success: true,
            });

            // Verify policy marked as paid
            const policy = await policyManager.getPolicy(1n);
            expect(policy.status).toBe(2); // STATUS_PAID
        });

        it('should not allow payout before confirmation', async () => {
            // Trigger but don't wait
            await policyManager.sendCheckTrigger(
                oracle.getSender(),
                {
                    policyId: 1n,
                    currentPrice: 9350,
                }
            );

            // Attempt payout
            const result = await policyManager.sendExecutePayout(
                oracle.getSender(),
                {
                    policyId: 1n,
                    currentPrice: 9350,
                }
            );

            expect(result.transactions).toHaveTransaction({
                success: false,
                exitCode: 302,
            });
        });
    });

    describe('Policy Cancellation', () => {
        beforeEach(async () => {
            await policyManager.sendCreatePolicy(
                buyer.getSender(),
                {
                    beneficiary: beneficiary.address,
                    assetType: 0,
                    coverageAmount: toNano('100000'),
                    premiumAmount: toNano('1000'),
                    triggerPrice: 9700,
                    floorPrice: 9000,
                    durationSeconds: 7776000,
                },
                toNano('1000.1')
            );
        });

        it('should allow buyer to cancel active policy', async () => {
            const result = await policyManager.sendCancelPolicy(
                buyer.getSender(),
                {
                    policyId: 1n,
                }
            );

            expect(result.transactions).toHaveTransaction({
                success: true,
            });

            const policy = await policyManager.getPolicy(1n);
            expect(policy.status).toBe(5); // STATUS_CANCELLED
        });

        it('should not allow non-buyer to cancel', async () => {
            const result = await policyManager.sendCancelPolicy(
                beneficiary.getSender(),
                {
                    policyId: 1n,
                }
            );

            expect(result.transactions).toHaveTransaction({
                success: false,
                exitCode: 401,
            });
        });
    });
});
