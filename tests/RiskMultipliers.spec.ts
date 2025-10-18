import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano } from '@ton/core';
import { RiskMultipliersTest } from '../wrappers/RiskMultipliersTest';
import { compile } from '@ton/blueprint';
import '@ton/test-utils';
import {
    CHAIN_IDS,
    STABLECOIN_IDS,
    COVERAGE_TYPE_IDS,
    CHAIN_MULTIPLIERS,
    STABLECOIN_ADJUSTMENTS,
    BASE_RATES,
    generateAllProducts,
    calculateAdjustedRate,
    calculateProductHash,
    calculatePremium,
    isValidCombination,
} from './fixtures/products';

describe('RiskMultipliers Library Tests', () => {
    let code: Cell;
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let riskMultipliers: SandboxContract<RiskMultipliersTest>;

    beforeAll(async () => {
        code = await compile('RiskMultipliersTest');
    });

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');

        riskMultipliers = blockchain.openContract(
            RiskMultipliersTest.createFromConfig(
                { ownerAddress: deployer.address },
                code
            )
        );

        await riskMultipliers.sendDeploy(deployer.getSender(), toNano('0.05'));
    });

    describe('Chain Risk Multipliers', () => {
        it('should return 10000 (1.0x) for Ethereum (chain_id=0)', async () => {
            const multiplier = await riskMultipliers.getChainRiskMultiplier(0);
            expect(multiplier).toBe(10000);
            expect(multiplier).toBe(CHAIN_MULTIPLIERS['Ethereum']);
        });

        it('should return 11000 (1.1x) for Arbitrum (chain_id=1)', async () => {
            const multiplier = await riskMultipliers.getChainRiskMultiplier(1);
            expect(multiplier).toBe(11000);
            expect(multiplier).toBe(CHAIN_MULTIPLIERS['Arbitrum']);
        });

        it('should return 11000 (1.1x) for Base (chain_id=2)', async () => {
            const multiplier = await riskMultipliers.getChainRiskMultiplier(2);
            expect(multiplier).toBe(11000);
            expect(multiplier).toBe(CHAIN_MULTIPLIERS['Base']);
        });

        it('should return 12000 (1.2x) for Polygon (chain_id=3)', async () => {
            const multiplier = await riskMultipliers.getChainRiskMultiplier(3);
            expect(multiplier).toBe(12000);
            expect(multiplier).toBe(CHAIN_MULTIPLIERS['Polygon']);
        });

        it('should return 9000 (0.9x discount) for Bitcoin (chain_id=4)', async () => {
            const multiplier = await riskMultipliers.getChainRiskMultiplier(4);
            expect(multiplier).toBe(9000);
            expect(multiplier).toBe(CHAIN_MULTIPLIERS['Bitcoin']);
        });

        it('should return 13000 (1.3x) for Lightning (chain_id=5)', async () => {
            const multiplier = await riskMultipliers.getChainRiskMultiplier(5);
            expect(multiplier).toBe(13000);
            expect(multiplier).toBe(CHAIN_MULTIPLIERS['Lightning']);
        });

        it('should return 11500 (1.15x) for TON (chain_id=6)', async () => {
            const multiplier = await riskMultipliers.getChainRiskMultiplier(6);
            expect(multiplier).toBe(11500);
            expect(multiplier).toBe(CHAIN_MULTIPLIERS['TON']);
        });

        it('should return 14000 (1.4x) for Solana (chain_id=7)', async () => {
            const multiplier = await riskMultipliers.getChainRiskMultiplier(7);
            expect(multiplier).toBe(14000);
            expect(multiplier).toBe(CHAIN_MULTIPLIERS['Solana']);
        });

        it('should throw error 400 for invalid chain_id=8', async () => {
            await expect(riskMultipliers.getChainRiskMultiplier(8)).rejects.toThrow();
        });

        it('should throw error for negative chain_id', async () => {
            await expect(riskMultipliers.getChainRiskMultiplier(-1)).rejects.toThrow();
        });
    });

    describe('Stablecoin Risk Adjustments', () => {
        // Tier 1: Fiat-backed majors (0 bps)
        it('should return 0 bps for USDC (stablecoin_id=0)', async () => {
            const adjustment = await riskMultipliers.getStablecoinRiskAdjustment(0);
            expect(adjustment).toBe(0);
        });

        it('should return 0 bps for USDT (stablecoin_id=1)', async () => {
            const adjustment = await riskMultipliers.getStablecoinRiskAdjustment(1);
            expect(adjustment).toBe(0);
        });

        it('should return 0 bps for USDP (stablecoin_id=2)', async () => {
            const adjustment = await riskMultipliers.getStablecoinRiskAdjustment(2);
            expect(adjustment).toBe(0);
        });

        // Tier 2: Established crypto-collateralized
        it('should return 0 bps for DAI (stablecoin_id=3)', async () => {
            const adjustment = await riskMultipliers.getStablecoinRiskAdjustment(3);
            expect(adjustment).toBe(0);
        });

        it('should return 10 bps for LUSD (stablecoin_id=11)', async () => {
            const adjustment = await riskMultipliers.getStablecoinRiskAdjustment(11);
            expect(adjustment).toBe(10);
        });

        // Tier 3: Newer fiat-backed
        it('should return 50 bps for BUSD (stablecoin_id=5)', async () => {
            const adjustment = await riskMultipliers.getStablecoinRiskAdjustment(5);
            expect(adjustment).toBe(50);
        });

        it('should return 25 bps for PYUSD (stablecoin_id=9)', async () => {
            const adjustment = await riskMultipliers.getStablecoinRiskAdjustment(9);
            expect(adjustment).toBe(25);
        });

        // Tier 4: Algorithmic/hybrid
        it('should return 75 bps for FRAX (stablecoin_id=4)', async () => {
            const adjustment = await riskMultipliers.getStablecoinRiskAdjustment(4);
            expect(adjustment).toBe(75);
        });

        it('should return 50 bps for GHO (stablecoin_id=10)', async () => {
            const adjustment = await riskMultipliers.getStablecoinRiskAdjustment(10);
            expect(adjustment).toBe(50);
        });

        it('should return 60 bps for crvUSD (stablecoin_id=12)', async () => {
            const adjustment = await riskMultipliers.getStablecoinRiskAdjustment(12);
            expect(adjustment).toBe(60);
        });

        it('should return 70 bps for mkUSD (stablecoin_id=13)', async () => {
            const adjustment = await riskMultipliers.getStablecoinRiskAdjustment(13);
            expect(adjustment).toBe(70);
        });

        // Tier 5: Delta-neutral / Yield-bearing
        it('should return 100 bps for USDe (stablecoin_id=6)', async () => {
            const adjustment = await riskMultipliers.getStablecoinRiskAdjustment(6);
            expect(adjustment).toBe(100);
        });

        it('should return 125 bps for sUSDe (stablecoin_id=7)', async () => {
            const adjustment = await riskMultipliers.getStablecoinRiskAdjustment(7);
            expect(adjustment).toBe(125);
        });

        it('should return 110 bps for USDY (stablecoin_id=8)', async () => {
            const adjustment = await riskMultipliers.getStablecoinRiskAdjustment(8);
            expect(adjustment).toBe(110);
        });

        it('should throw error 401 for invalid stablecoin_id=14', async () => {
            await expect(riskMultipliers.getStablecoinRiskAdjustment(14)).rejects.toThrow();
        });
    });

    describe('Coverage Type Base Rates', () => {
        it('should return 80 bps (0.8% APR) for Depeg (coverage_type=0)', async () => {
            const baseRate = await riskMultipliers.getCoverageTypeBaseRate(0);
            expect(baseRate).toBe(80);
            expect(baseRate).toBe(BASE_RATES['depeg']);
        });

        it('should return 200 bps (2.0% APR) for Smart Contract (coverage_type=1)', async () => {
            const baseRate = await riskMultipliers.getCoverageTypeBaseRate(1);
            expect(baseRate).toBe(200);
            expect(baseRate).toBe(BASE_RATES['smart_contract']);
        });

        it('should return 180 bps (1.8% APR) for Oracle Failure (coverage_type=2)', async () => {
            const baseRate = await riskMultipliers.getCoverageTypeBaseRate(2);
            expect(baseRate).toBe(180);
            expect(baseRate).toBe(BASE_RATES['oracle_failure']);
        });

        it('should return 200 bps (2.0% APR) for Bridge Exploit (coverage_type=3)', async () => {
            const baseRate = await riskMultipliers.getCoverageTypeBaseRate(3);
            expect(baseRate).toBe(200);
            expect(baseRate).toBe(BASE_RATES['bridge_exploit']);
        });

        it('should return 300 bps (3.0% APR) for CEX Liquidation (coverage_type=4)', async () => {
            const baseRate = await riskMultipliers.getCoverageTypeBaseRate(4);
            expect(baseRate).toBe(300);
            expect(baseRate).toBe(BASE_RATES['cex_liquidation']);
        });

        it('should throw error 402 for invalid coverage_type=5', async () => {
            await expect(riskMultipliers.getCoverageTypeBaseRate(5)).rejects.toThrow();
        });
    });

    describe('Stablecoin Risk Tiers', () => {
        it('should return tier 0 for USDC, USDT, USDP', async () => {
            expect(await riskMultipliers.getStablecoinRiskTier(0)).toBe(0); // USDC
            expect(await riskMultipliers.getStablecoinRiskTier(1)).toBe(0); // USDT
            expect(await riskMultipliers.getStablecoinRiskTier(2)).toBe(0); // USDP
        });

        it('should return tier 1 for DAI and LUSD', async () => {
            expect(await riskMultipliers.getStablecoinRiskTier(3)).toBe(1);  // DAI
            expect(await riskMultipliers.getStablecoinRiskTier(11)).toBe(1); // LUSD
        });

        it('should return tier 2 for BUSD and PYUSD', async () => {
            expect(await riskMultipliers.getStablecoinRiskTier(5)).toBe(2); // BUSD
            expect(await riskMultipliers.getStablecoinRiskTier(9)).toBe(2); // PYUSD
        });
    });

    describe('Chain-Stablecoin Pair Validation', () => {
        it('should accept Ethereum + any stablecoin', async () => {
            for (let stablecoinId = 0; stablecoinId <= 13; stablecoinId++) {
                const valid = await riskMultipliers.validateChainStablecoinPair(0, stablecoinId);
                expect(valid).toBe(true);
            }
        });

        it('should accept Bitcoin + USDT only', async () => {
            const usdtValid = await riskMultipliers.validateChainStablecoinPair(4, 1); // Bitcoin + USDT
            expect(usdtValid).toBe(true);

            const usdcInvalid = await riskMultipliers.validateChainStablecoinPair(4, 0); // Bitcoin + USDC
            expect(usdcInvalid).toBe(false);
        });

        it('should accept Lightning + USDC or USDT', async () => {
            const usdcValid = await riskMultipliers.validateChainStablecoinPair(5, 0); // Lightning + USDC
            expect(usdcValid).toBe(true);

            const usdtValid = await riskMultipliers.validateChainStablecoinPair(5, 1); // Lightning + USDT
            expect(usdtValid).toBe(true);

            const daiInvalid = await riskMultipliers.validateChainStablecoinPair(5, 3); // Lightning + DAI
            expect(daiInvalid).toBe(false);
        });
    });

    describe('Product Hash Calculation', () => {
        it('should calculate product hash = (coverage_type << 16) | (chain_id << 8) | stablecoin_id', async () => {
            // Example: Depeg (0) + Ethereum (0) + USDC (0) = 0
            const hash1 = await riskMultipliers.calculateProductHash(0, 0, 0);
            expect(hash1).toBe(0);
            expect(hash1).toBe(calculateProductHash('depeg', 'Ethereum', 'USDC'));

            // Example: Bridge (3) + Solana (7) + USDT (1) = (3 << 16) | (7 << 8) | 1 = 197633
            const hash2 = await riskMultipliers.calculateProductHash(3, 7, 1);
            expect(hash2).toBe((3 << 16) | (7 << 8) | 1);
            expect(hash2).toBe(197633);

            // Example: CEX_liquidation (4) + Arbitrum (1) + DAI (3) = (4 << 16) | (1 << 8) | 3 = 262403
            const hash3 = await riskMultipliers.calculateProductHash(4, 1, 3);
            expect(hash3).toBe((4 << 16) | (1 << 8) | 3);
            expect(hash3).toBe(262403);
        });

        it('should decompose product hash back to components', async () => {
            const hash = 197633; // Bridge (3) + Solana (7) + USDT (1)
            const { coverageType, chainId, stablecoinId } = await riskMultipliers.decomposeProductHash(hash);

            expect(coverageType).toBe(3);
            expect(chainId).toBe(7);
            expect(stablecoinId).toBe(1);
        });

        it('should be reversible (hash -> decompose -> hash)', async () => {
            const originalHash = await riskMultipliers.calculateProductHash(2, 3, 5); // Oracle + Polygon + BUSD
            const { coverageType, chainId, stablecoinId } = await riskMultipliers.decomposeProductHash(originalHash);
            const recomputedHash = await riskMultipliers.calculateProductHash(coverageType, chainId, stablecoinId);

            expect(recomputedHash).toBe(originalHash);
        });
    });

    describe('Multi-Dimensional Premium Calculation', () => {
        it('should calculate premium for standard USDC depeg on Ethereum', async () => {
            // Coverage: 10,000 TON, Duration: 90 days
            // Base rate: 80 bps, Chain: 1.0x, Stablecoin: 0 bps
            // Adjusted rate: 80 bps
            // Premium = (10000 * 80 * 90 / 365 / 10000) * 1.0 = 1.97 TON

            const coverageAmount = toNano('10000');
            const premium = await riskMultipliers.calculateMultiDimensionalPremium(0, 0, 0, coverageAmount, 90);

            const expectedPremium = calculatePremium(
                { coverageTypeId: 0, chainId: 0, stablecoinId: 0, adjustedRate: 80 } as any,
                coverageAmount,
                90
            );

            // Allow small rounding differences
            const premiumTON = Number(premium) / 1e9;
            const expectedTON = Number(expectedPremium) / 1e9;
            expect(Math.abs(premiumTON - expectedTON)).toBeLessThan(0.01);
        });

        it('should calculate higher premium for Solana (1.4x chain multiplier)', async () => {
            // Coverage: 10,000 TON, Duration: 90 days
            // Base rate: 80 bps, Chain: 1.4x, Stablecoin: 0 bps
            // Adjusted rate: 80 * 1.4 = 112 bps
            // Premium should be 1.4x higher than Ethereum

            const coverageAmount = toNano('10000');
            const ethereumPremium = await riskMultipliers.calculateMultiDimensionalPremium(0, 0, 0, coverageAmount, 90);
            const solanaPremium = await riskMultipliers.calculateMultiDimensionalPremium(0, 7, 0, coverageAmount, 90);

            // Solana premium should be ~1.4x Ethereum premium
            const ratio = Number(solanaPremium) / Number(ethereumPremium);
            expect(ratio).toBeGreaterThan(1.35);
            expect(ratio).toBeLessThan(1.45);
        });

        it('should calculate higher premium for sUSDe (+125 bps adjustment)', async () => {
            // sUSDe has +125 bps adjustment
            // Base: 80 bps, Chain: 1.0x, Stablecoin: +125 bps
            // Adjusted rate: 80 + 125 = 205 bps

            const coverageAmount = toNano('10000');
            const usdcPremium = await riskMultipliers.calculateMultiDimensionalPremium(0, 0, 0, coverageAmount, 90);
            const sUSDePremium = await riskMultipliers.calculateMultiDimensionalPremium(0, 0, 7, coverageAmount, 90);

            // sUSDe should be significantly more expensive
            expect(sUSDePremium).toBeGreaterThan(usdcPremium);

            const ratio = Number(sUSDePremium) / Number(usdcPremium);
            expect(ratio).toBeGreaterThan(2.0); // At least 2x more expensive
        });

        it('should calculate highest premium for CEX liquidation coverage', async () => {
            // CEX liquidation has 300 bps base rate (vs 80 for depeg)
            const coverageAmount = toNano('10000');
            const depegPremium = await riskMultipliers.calculateMultiDimensionalPremium(0, 0, 0, coverageAmount, 90);
            const cexPremium = await riskMultipliers.calculateMultiDimensionalPremium(4, 0, 0, coverageAmount, 90);

            // CEX liquidation should be 300/80 = 3.75x more expensive
            const ratio = Number(cexPremium) / Number(depegPremium);
            expect(ratio).toBeGreaterThan(3.5);
            expect(ratio).toBeLessThan(4.0);
        });

        it('should apply time multiplier for 30-day coverage (1.2x)', async () => {
            const coverageAmount = toNano('10000');
            const premium90 = await riskMultipliers.calculateMultiDimensionalPremium(0, 0, 0, coverageAmount, 90);
            const premium30 = await riskMultipliers.calculateMultiDimensionalPremium(0, 0, 0, coverageAmount, 30);

            // 30-day should cost more per day due to 1.2x multiplier
            const daily90 = Number(premium90) / 90;
            const daily30 = Number(premium30) / 30;

            expect(daily30).toBeGreaterThan(daily90);
        });

        it('should apply time discount for 180-day coverage (0.9x)', async () => {
            const coverageAmount = toNano('10000');
            const premium90 = await riskMultipliers.calculateMultiDimensionalPremium(0, 0, 0, coverageAmount, 90);
            const premium180 = await riskMultipliers.calculateMultiDimensionalPremium(0, 0, 0, coverageAmount, 180);

            // 180-day should cost less per day due to 0.9x discount
            const daily90 = Number(premium90) / 90;
            const daily180 = Number(premium180) / 180;

            expect(daily180).toBeLessThan(daily90);
        });
    });

    describe('50 Random Product Combinations', () => {
        it('should calculate premiums for 50 random valid products', async () => {
            const allProducts = generateAllProducts().filter(p => p.valid);

            // Seed random for reproducibility
            const random = (seed: number) => {
                const x = Math.sin(seed++) * 10000;
                return x - Math.floor(x);
            };

            const randomProducts = [];
            for (let i = 0; i < 50; i++) {
                const index = Math.floor(random(i * 42) * allProducts.length);
                randomProducts.push(allProducts[index]);
            }

            const coverageAmount = toNano('5000');
            const durations = [30, 90, 180];

            for (const product of randomProducts) {
                const duration = durations[Math.floor(random(product.productHash) * durations.length)];

                const contractPremium = await riskMultipliers.calculateMultiDimensionalPremium(
                    product.coverageTypeId,
                    product.chainId,
                    product.stablecoinId,
                    coverageAmount,
                    duration
                );

                const fixturePremium = calculatePremium(product, coverageAmount, duration);

                // Contract and fixture calculations should match (within rounding)
                const diff = Number(contractPremium) - Number(fixturePremium);
                expect(Math.abs(diff)).toBeLessThan(1000n); // Within 1000 nanoTON

                // Premium should be positive
                expect(contractPremium).toBeGreaterThan(0n);
            }
        });
    });

    describe('Edge Cases and Overflow Protection', () => {
        it('should throw error for invalid coverage type', async () => {
            const valid = await riskMultipliers.validateCoverageType(0);
            expect(valid).toBe(true);

            const invalid = await riskMultipliers.validateCoverageType(5);
            expect(invalid).toBe(false);
        });

        it('should throw error for invalid chain ID', async () => {
            const valid = await riskMultipliers.validateChainId(7);
            expect(valid).toBe(true);

            const invalid = await riskMultipliers.validateChainId(8);
            expect(invalid).toBe(false);
        });

        it('should throw error for invalid stablecoin ID', async () => {
            const valid = await riskMultipliers.validateStablecoinId(13);
            expect(valid).toBe(true);

            const invalid = await riskMultipliers.validateStablecoinId(14);
            expect(invalid).toBe(false);
        });

        it('should handle very large coverage amounts without overflow', async () => {
            const largeCoverage = toNano('1000000'); // 1M TON
            const premium = await riskMultipliers.calculateMultiDimensionalPremium(0, 0, 0, largeCoverage, 90);

            expect(premium).toBeGreaterThan(0n);
            // Premium should be proportional (1M TON coverage = 100x more than 10k TON)
            const smallPremium = await riskMultipliers.calculateMultiDimensionalPremium(0, 0, 0, toNano('10000'), 90);
            const ratio = Number(premium) / Number(smallPremium);
            expect(Math.abs(ratio - 100)).toBeLessThan(1); // Should be ~100x
        });

        it('should handle minimum coverage amount', async () => {
            const minCoverage = toNano('1'); // 1 TON
            const premium = await riskMultipliers.calculateMultiDimensionalPremium(0, 0, 0, minCoverage, 30);

            expect(premium).toBeGreaterThan(0n);
        });
    });
});
