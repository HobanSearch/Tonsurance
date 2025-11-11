import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano, Address, Dictionary, beginCell } from '@ton/core';
import {
    MultiTrancheVault,
    TRANCHE_BTC,
    TRANCHE_SNR,
    TRANCHE_MEZZ,
    TRANCHE_JNR,
    TRANCHE_JNR_PLUS,
    TRANCHE_EQT,
    CURVE_FLAT,
    CURVE_LINEAR,
    CURVE_LOGARITHMIC,
    DECIMALS,
    MIN_DEPOSIT,
    calculateFlatNav,
    calculateLinearNav,
    calculateCappedExponentialNav,
} from '../../wrappers/v3/MultiTrancheVault';
import '@ton/test-utils';
import { compileV3 } from './compile-helper';

describe('MultiTrancheVault', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compileV3('MultiTrancheVault');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let masterFactory: SandboxContract<TreasuryContract>;
    let claimsProcessor: SandboxContract<TreasuryContract>;
    let floatManager: SandboxContract<TreasuryContract>;
    let vault: SandboxContract<MultiTrancheVault>;

    // Helper to create tranche data cell
    function createTrancheDataCell(): Cell {
        const tranches = Dictionary.empty(Dictionary.Keys.Uint(8), Dictionary.Values.Cell());

        const trancheConfigs = [
            { id: TRANCHE_BTC, capital: 0n, apyMin: 400, apyMax: 400, curve: CURVE_FLAT, allocation: 15 },
            { id: TRANCHE_SNR, capital: 0n, apyMin: 400, apyMax: 800, curve: CURVE_LOGARITHMIC, allocation: 20 },
            { id: TRANCHE_MEZZ, capital: 0n, apyMin: 1000, apyMax: 1000, curve: CURVE_LINEAR, allocation: 25 },
            { id: TRANCHE_JNR, capital: 0n, apyMin: 800, apyMax: 2500, curve: 4, allocation: 20 },
            { id: TRANCHE_JNR_PLUS, capital: 0n, apyMin: 1000, apyMax: 2000, curve: 5, allocation: 15 },
            { id: TRANCHE_EQT, capital: 0n, apyMin: 1500, apyMax: 2500, curve: 6, allocation: 5 },
        ];

        for (const t of trancheConfigs) {
            const nullAddress = Address.parse('0:0000000000000000000000000000000000000000000000000000000000000000');
            const trancheCell = beginCell()
                .storeCoins(t.capital)
                .storeUint(t.apyMin, 16)
                .storeUint(t.apyMax, 16)
                .storeUint(t.curve, 8)
                .storeUint(t.allocation, 8)
                .storeCoins(0n)
                .storeAddress(nullAddress)
                .storeCoins(0n)
                .endCell();
            tranches.set(t.id, trancheCell);
        }

        return beginCell().storeDictDirect(tranches).endCell();
    }

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');
        masterFactory = await blockchain.treasury('master_factory');
        claimsProcessor = await blockchain.treasury('claims_processor');
        floatManager = await blockchain.treasury('float_manager');

        const trancheData = createTrancheDataCell();

        vault = blockchain.openContract(
            MultiTrancheVault.createFromConfig(
                {
                    masterFactoryAddress: masterFactory.address,
                    claimsProcessorAddress: claimsProcessor.address,
                    floatManagerAddress: floatManager.address,
                    totalCapital: 0n,
                    totalCoverageSold: 0n,
                    accumulatedPremiums: 0n,
                    accumulatedLosses: 0n,
                    protocolEarnedCapital: 0n,
                    trancheData: trancheData,
                    depositorBalances: Dictionary.empty(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell()),
                    paused: false,
                    reentrancyGuard: false,
                    seqNo: 0,
                    circuitBreakerWindowStart: 0,
                    circuitBreakerLosses: 0n,
                    trancheDepositTimes: Dictionary.empty(Dictionary.Keys.Uint(8), Dictionary.Values.Uint(32)),
                    pendingTxs: Dictionary.empty(Dictionary.Keys.Uint(64), Dictionary.Values.Cell()),
                    trancheLocks: Dictionary.empty(Dictionary.Keys.Uint(8), Dictionary.Values.Cell()),
                    testMode: true,
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

    describe('Initialization', () => {
        it('should initialize with correct configuration', async () => {
            const totalCapital = await vault.getTotalCapital();
            expect(totalCapital).toEqual(0n);

            const version = await vault.getVersion();
            expect(version).toEqual(3);

            const testMode = await vault.getTestMode();
            expect(testMode).toBe(true);
        });

        it('should have all 6 tranches configured', async () => {
            for (let trancheId = TRANCHE_BTC; trancheId <= TRANCHE_EQT; trancheId++) {
                const capital = await vault.getTrancheCapital(trancheId);
                expect(capital).toEqual(0n);
            }
        });
    });

    describe('Tranche Info', () => {
        it('should return correct APY ranges', async () => {
            const btcApy = await vault.getTrancheApy(TRANCHE_BTC);
            expect(btcApy.min).toEqual(400); // 4%
            expect(btcApy.max).toEqual(400);

            const snrApy = await vault.getTrancheApy(TRANCHE_SNR);
            expect(snrApy.min).toEqual(400); // 4-8%
            expect(snrApy.max).toEqual(800);

            const mezzApy = await vault.getTrancheApy(TRANCHE_MEZZ);
            expect(mezzApy.min).toEqual(1000); // 10%
            expect(mezzApy.max).toEqual(1000);
        });

        it('should calculate initial NAV as 1.0', async () => {
            const nav = await vault.getTrancheNav(TRANCHE_BTC);
            expect(nav).toEqual(BigInt(DECIMALS)); // 1.0 in fixed-point
        });
    });

    describe('Admin Functions', () => {
        it('should allow master factory to pause', async () => {
            const result = await vault.sendPause(masterFactory.getSender(), toNano('0.05'));

            expect(result.transactions).toHaveTransaction({
                from: masterFactory.address,
                to: vault.address,
                success: true,
            });

            const paused = await vault.getPaused();
            expect(paused).toBe(true);
        });

        it('should allow unpause', async () => {
            await vault.sendPause(masterFactory.getSender(), toNano('0.05'));
            await vault.sendUnpause(masterFactory.getSender(), toNano('0.05'));

            const paused = await vault.getPaused();
            expect(paused).toBe(false);
        });

        it('should allow setting float manager', async () => {
            const newFloatManager = await blockchain.treasury('new_float_manager');

            const result = await vault.sendSetFloatManager(masterFactory.getSender(), {
                value: toNano('0.05'),
                floatManagerAddress: newFloatManager.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: masterFactory.address,
                to: vault.address,
                success: true,
            });
        });
    });

    describe('NAV Calculations', () => {
        it('should calculate flat NAV correctly (BTC)', () => {
            const nav1 = calculateFlatNav(1.0); // 1 year
            expect(nav1).toBeCloseTo(1.04, 2);

            const nav2 = calculateFlatNav(2.0); // 2 years
            expect(nav2).toBeCloseTo(1.08, 2);
        });

        it('should calculate linear NAV correctly (MEZZ)', () => {
            const nav1 = calculateLinearNav(1.0); // 1 year
            expect(nav1).toBeCloseTo(1.10, 2);

            const nav2 = calculateLinearNav(2.0); // 2 years
            expect(nav2).toBeCloseTo(1.20, 2);
        });

        it('should calculate capped exponential NAV with 25% cap (EQT)', () => {
            const nav1 = calculateCappedExponentialNav(0.5); // 6 months
            expect(nav1).toBeLessThan(1.25);

            const nav2 = calculateCappedExponentialNav(3.0); // 3 years - should cap
            expect(nav2).toEqual(1.25); // Capped at 25%
        });
    });

    describe('Constants', () => {
        it('should have correct tranche IDs', () => {
            expect(TRANCHE_BTC).toEqual(1);
            expect(TRANCHE_SNR).toEqual(2);
            expect(TRANCHE_MEZZ).toEqual(3);
            expect(TRANCHE_JNR).toEqual(4);
            expect(TRANCHE_JNR_PLUS).toEqual(5);
            expect(TRANCHE_EQT).toEqual(6);
        });

        it('should have correct decimals and minimum deposit', () => {
            expect(DECIMALS).toEqual(1000000000);
            expect(MIN_DEPOSIT).toEqual(100000000); // 0.1 TON
        });
    });

    describe('Stats', () => {
        it('should track accumulated premiums', async () => {
            const premiums = await vault.getAccumulatedPremiums();
            expect(premiums).toEqual(0n);
        });

        it('should track accumulated losses', async () => {
            const losses = await vault.getAccumulatedLosses();
            expect(losses).toEqual(0n);
        });

        it('should track protocol earned capital', async () => {
            const earned = await vault.getProtocolEarnedCapital();
            expect(earned).toEqual(0n);
        });

        it('should track total coverage sold', async () => {
            const coverage = await vault.getTotalCoverageSold();
            expect(coverage).toEqual(0n);
        });
    });
});
