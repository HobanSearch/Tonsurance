/**
 * MultiTrancheVault Smart Contract Tests
 *
 * Tests multi-tranche capital structure:
 * - Deposits to different tranches
 * - LP token minting with correct NAV
 * - Withdrawals with NAV calculation
 * - Loss waterfall (junior → senior)
 * - Yield distribution
 * - Premium collection
 * - Payout execution
 */

import { Blockchain, SandboxContract, TreasuryContract } from '@ton-community/sandbox';
import { Cell, toNano } from 'ton-core';
import { MultiTrancheVault } from '../wrappers/MultiTrancheVault';
import '@ton-community/test-utils';
import { compile } from '@ton-community/blueprint';

describe('MultiTrancheVault', () => {
    let code: Cell;
    let blockchain: Blockchain;
    let vault: SandboxContract<MultiTrancheVault>;
    let deployer: SandboxContract<TreasuryContract>;
    let policyManager: SandboxContract<TreasuryContract>;
    let depositor1: SandboxContract<TreasuryContract>;
    let depositor2: SandboxContract<TreasuryContract>;
    let oracle: SandboxContract<TreasuryContract>;

    const TRANCHE_BTC_SENIOR = 1;
    const TRANCHE_STABLE_SENIOR = 2;
    const TRANCHE_OPPORTUNISTIC = 3;
    const TRANCHE_RWA = 4;
    const TRANCHE_DEFI_YIELD = 5;
    const TRANCHE_NATURAL_HEDGE = 6;

    beforeAll(async () => {
        code = await compile('MultiTrancheVault');
    });

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');
        policyManager = await blockchain.treasury('policyManager');
        depositor1 = await blockchain.treasury('depositor1');
        depositor2 = await blockchain.treasury('depositor2');
        oracle = await blockchain.treasury('oracle');

        vault = blockchain.openContract(
            MultiTrancheVault.createFromConfig(
                {
                    totalCapital: 0n,
                    totalCoverageSold: 0n,
                    policyManagerAddress: policyManager.address,
                    oracleAddress: oracle.address,
                    adminAddress: deployer.address,
                },
                code
            )
        );

        await vault.sendDeploy(deployer.getSender(), toNano('0.05'));
    });

    describe('Deposits', () => {
        it('should accept deposit to BTC Senior tranche', async () => {
            const result = await vault.sendDeposit(
                depositor1.getSender(),
                {
                    trancheId: TRANCHE_BTC_SENIOR,
                    depositAmount: toNano('100000'),
                },
                toNano('100000.1')
            );

            expect(result.transactions).toHaveTransaction({
                from: depositor1.address,
                to: vault.address,
                success: true,
            });

            const tranche = await vault.getTranche(TRANCHE_BTC_SENIOR);
            expect(tranche.totalDeposits).toBe(toNano('100000'));
        });

        it('should mint LP tokens proportional to NAV', async () => {
            // First deposit (NAV = 1.0)
            await vault.sendDeposit(
                depositor1.getSender(),
                {
                    trancheId: TRANCHE_NATURAL_HEDGE,
                    depositAmount: toNano('100000'),
                },
                toNano('100000.1')
            );

            let tranche = await vault.getTranche(TRANCHE_NATURAL_HEDGE);
            const initialLpTokens = tranche.totalLpTokens;

            // Second deposit (still NAV = 1.0)
            await vault.sendDeposit(
                depositor2.getSender(),
                {
                    trancheId: TRANCHE_NATURAL_HEDGE,
                    depositAmount: toNano('50000'),
                },
                toNano('50000.1')
            );

            tranche = await vault.getTranche(TRANCHE_NATURAL_HEDGE);

            // Second depositor should get 50% as many LP tokens
            const expectedLpTokens = initialLpTokens * 3n / 2n; // 1.5x
            expect(tranche.totalLpTokens).toBeCloseTo(expectedLpTokens, toNano('100'));
        });

        it('should reject deposit to invalid tranche', async () => {
            const result = await vault.sendDeposit(
                depositor1.getSender(),
                {
                    trancheId: 99, // Invalid
                    depositAmount: toNano('100000'),
                },
                toNano('100000.1')
            );

            expect(result.transactions).toHaveTransaction({
                success: false,
                exitCode: 100,
            });
        });

        it('should update total vault capital', async () => {
            await vault.sendDeposit(
                depositor1.getSender(),
                {
                    trancheId: TRANCHE_BTC_SENIOR,
                    depositAmount: toNano('100000'),
                },
                toNano('100000.1')
            );

            const totalCapital = await vault.getTotalCapital();
            expect(totalCapital).toBe(toNano('100000'));
        });
    });

    describe('Withdrawals', () => {
        beforeEach(async () => {
            // Deposit first
            await vault.sendDeposit(
                depositor1.getSender(),
                {
                    trancheId: TRANCHE_STABLE_SENIOR,
                    depositAmount: toNano('100000'),
                },
                toNano('100000.1')
            );
        });

        it('should allow withdrawal with correct LP tokens', async () => {
            const tranche = await vault.getTranche(TRANCHE_STABLE_SENIOR);
            const lpTokens = tranche.totalLpTokens;

            const result = await vault.sendWithdraw(
                depositor1.getSender(),
                {
                    trancheId: TRANCHE_STABLE_SENIOR,
                    lpTokensToBurn: lpTokens / 2n, // Withdraw 50%
                }
            );

            expect(result.transactions).toHaveTransaction({
                success: true,
            });

            const updatedTranche = await vault.getTranche(TRANCHE_STABLE_SENIOR);
            expect(updatedTranche.totalLpTokens).toBe(lpTokens / 2n);
        });

        it('should calculate withdrawal amount based on NAV', async () => {
            const tranche = await vault.getTranche(TRANCHE_STABLE_SENIOR);
            const lpTokens = tranche.totalLpTokens;

            const depositor1BalanceBefore = await depositor1.getBalance();

            await vault.sendWithdraw(
                depositor1.getSender(),
                {
                    trancheId: TRANCHE_STABLE_SENIOR,
                    lpTokensToBurn: lpTokens,
                }
            );

            const depositor1BalanceAfter = await depositor1.getBalance();

            // Should receive approximately the original deposit (minus gas)
            const received = depositor1BalanceAfter - depositor1BalanceBefore;
            expect(received).toBeGreaterThan(toNano('99000')); // Allow gas costs
        });

        it('should reject withdrawal with insufficient LP tokens', async () => {
            const tranche = await vault.getTranche(TRANCHE_STABLE_SENIOR);
            const lpTokens = tranche.totalLpTokens;

            const result = await vault.sendWithdraw(
                depositor1.getSender(),
                {
                    trancheId: TRANCHE_STABLE_SENIOR,
                    lpTokensToBurn: lpTokens * 2n, // More than exists
                }
            );

            expect(result.transactions).toHaveTransaction({
                success: false,
                exitCode: 202,
            });
        });
    });

    describe('Loss Waterfall', () => {
        beforeEach(async () => {
            // Deposit to all tranches
            for (let tranche = 1; tranche <= 6; tranche++) {
                await vault.sendDeposit(
                    depositor1.getSender(),
                    {
                        trancheId: tranche,
                        depositAmount: toNano('100000'),
                    },
                    toNano('100000.1')
                );
            }
        });

        it('should apply losses to junior tranche first', async () => {
            // Simulate $50k payout (should hit junior tranche only)
            await vault.sendRequestPayout(
                policyManager.getSender(),
                {
                    policyId: 1n,
                    beneficiary: depositor2.address,
                    payoutAmount: toNano('50000'),
                }
            );

            const juniorTranche = await vault.getTranche(TRANCHE_NATURAL_HEDGE);
            expect(juniorTranche.accumulatedLosses).toBe(toNano('50000'));

            // Other tranches should be unaffected
            const seniorTranche = await vault.getTranche(TRANCHE_BTC_SENIOR);
            expect(seniorTranche.accumulatedLosses).toBe(0n);
        });

        it('should cascade losses through tranches', async () => {
            // Simulate $250k payout (should hit multiple tranches)
            await vault.sendRequestPayout(
                policyManager.getSender(),
                {
                    policyId: 1n,
                    beneficiary: depositor2.address,
                    payoutAmount: toNano('250000'),
                }
            );

            // Junior tranche fully depleted
            const t6 = await vault.getTranche(TRANCHE_NATURAL_HEDGE);
            expect(t6.accumulatedLosses).toBe(toNano('100000'));

            // Next tranche partially hit
            const t5 = await vault.getTranche(TRANCHE_DEFI_YIELD);
            expect(t5.accumulatedLosses).toBe(toNano('100000'));

            // Remaining loss on next tranche
            const t4 = await vault.getTranche(TRANCHE_RWA);
            expect(t4.accumulatedLosses).toBe(toNano('50000'));

            // Senior tranches unaffected
            const t1 = await vault.getTranche(TRANCHE_BTC_SENIOR);
            expect(t1.accumulatedLosses).toBe(0n);
        });

        it('should update NAV after losses', async () => {
            const navBefore = await vault.getNavPerToken(TRANCHE_NATURAL_HEDGE);

            // Apply $50k loss
            await vault.sendRequestPayout(
                policyManager.getSender(),
                {
                    policyId: 1n,
                    beneficiary: depositor2.address,
                    payoutAmount: toNano('50000'),
                }
            );

            const navAfter = await vault.getNavPerToken(TRANCHE_NATURAL_HEDGE);

            // NAV should decrease by 50%
            expect(navAfter).toBeLessThan(navBefore / 2n);
        });
    });

    describe('Premium Collection', () => {
        it('should accept premium from PolicyManager', async () => {
            const result = await vault.sendReceivePremium(
                policyManager.getSender(),
                {
                    premiumAmount: toNano('1000'),
                    coverageAmount: toNano('100000'),
                },
                toNano('1000.1')
            );

            expect(result.transactions).toHaveTransaction({
                success: true,
            });

            const totalCapital = await vault.getTotalCapital();
            expect(totalCapital).toBe(toNano('1000'));

            const totalCoverage = await vault.getTotalCoverageSold();
            expect(totalCoverage).toBe(toNano('100000'));
        });

        it('should reject premium from non-PolicyManager', async () => {
            const result = await vault.sendReceivePremium(
                depositor1.getSender(),
                {
                    premiumAmount: toNano('1000'),
                    coverageAmount: toNano('100000'),
                },
                toNano('1000.1')
            );

            expect(result.transactions).toHaveTransaction({
                success: false,
                exitCode: 300,
            });
        });
    });

    describe('Yield Distribution', () => {
        beforeEach(async () => {
            await vault.sendDeposit(
                depositor1.getSender(),
                {
                    trancheId: TRANCHE_BTC_SENIOR,
                    depositAmount: toNano('100000'),
                },
                toNano('100000.1')
            );
        });

        it('should accumulate yield over time', async () => {
            // Advance time by 1 year
            blockchain.now = blockchain.now + 31536000;

            const accruedYield = await vault.getAccruedYield(TRANCHE_BTC_SENIOR);

            // BTC Senior target yield = 6% annually
            // Expected yield = $100k × 0.06 = $6k
            const expectedYield = toNano('6000');
            const tolerance = toNano('100');

            expect(accruedYield).toBeGreaterThan(expectedYield - tolerance);
            expect(accruedYield).toBeLessThan(expectedYield + tolerance);
        });

        it('should distribute yield when triggered', async () => {
            // Advance time
            blockchain.now = blockchain.now + 31536000;

            const result = await vault.sendDistributeYield(
                deployer.getSender(),
                {
                    trancheId: TRANCHE_BTC_SENIOR,
                }
            );

            expect(result.transactions).toHaveTransaction({
                success: true,
            });

            const tranche = await vault.getTranche(TRANCHE_BTC_SENIOR);
            expect(tranche.accumulatedYields).toBeGreaterThan(0n);
        });

        it('should only allow admin to distribute yield', async () => {
            const result = await vault.sendDistributeYield(
                depositor1.getSender(),
                {
                    trancheId: TRANCHE_BTC_SENIOR,
                }
            );

            expect(result.transactions).toHaveTransaction({
                success: false,
                exitCode: 500,
            });
        });
    });

    describe('Utilization Ratio', () => {
        it('should calculate correct utilization ratio', async () => {
            // Deposit capital
            await vault.sendDeposit(
                depositor1.getSender(),
                {
                    trancheId: TRANCHE_BTC_SENIOR,
                    depositAmount: toNano('1000000'),
                },
                toNano('1000000.1')
            );

            // Receive premium with coverage
            await vault.sendReceivePremium(
                policyManager.getSender(),
                {
                    premiumAmount: toNano('5000'),
                    coverageAmount: toNano('500000'),
                },
                toNano('5000.1')
            );

            const utilization = await vault.getUtilizationRatio();

            // Utilization = 500k / 1005k ≈ 49.75% = 4975 basis points
            expect(utilization).toBeGreaterThan(4900);
            expect(utilization).toBeLessThan(5000);
        });
    });
});
