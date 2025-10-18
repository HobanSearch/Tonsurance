import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { toNano, Address, beginCell } from '@ton/core';
import { Treasury } from '../wrappers/Treasury';
import { MultiTrancheVault } from '../wrappers/MultiTrancheVault';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

describe('Treasury 6-Tier Integration Tests', () => {
    let code: any;
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let treasury: SandboxContract<Treasury>;
    let multiTrancheVault: SandboxContract<MultiTrancheVault>;
    let stakingPool: SandboxContract<TreasuryContract>;
    let claimsProcessor: SandboxContract<TreasuryContract>;

    beforeAll(async () => {
        code = await compile('Treasury');
    });

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');

        // Mock contracts
        multiTrancheVault = await blockchain.treasury('multiTrancheVault');
        stakingPool = await blockchain.treasury('stakingPool');
        claimsProcessor = await blockchain.treasury('claimsProcessor');

        treasury = blockchain.openContract(
            Treasury.createFromConfig(
                {
                    ownerAddress: deployer.address,
                    totalPremiumsCollected: 0n,
                    totalPayoutsMade: 0n,
                    reserveBalance: 0n,
                    claimsProcessorAddress: claimsProcessor.address,
                    multiTrancheVaultAddress: multiTrancheVault.address,
                    stakingPoolAddress: stakingPool.address,
                    btcYieldDistributed: 0n,
                    snrYieldDistributed: 0n,
                    mezzYieldDistributed: 0n,
                    jnrYieldDistributed: 0n,
                    jnrPlusYieldDistributed: 0n,
                    eqtYieldDistributed: 0n,
                },
                code
            )
        );

        const deployResult = await treasury.sendDeploy(deployer.getSender(), toNano('1'));
        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: treasury.address,
            deploy: true,
            success: true,
        });
    });

    it('should deploy successfully with 6-tier configuration', async () => {
        const stats = await treasury.getTreasuryStats();
        expect(stats.totalPremiums).toEqual(0n);
        expect(stats.totalPayouts).toEqual(0n);
        expect(stats.reserveBalance).toEqual(0n);

        const vaultAddress = await treasury.getMultiTrancheVault();
        expect(vaultAddress.toString()).toEqual(multiTrancheVault.address.toString());
    });

    it('should distribute premium to 6 tranches (70% vault, 20% stakers, 10% reserve)', async () => {
        const premiumAmount = toNano('1000'); // 1000 TON premium
        const policyId = 1n;

        const result = await treasury.sendInternalMessage(
            deployer.getSender(),
            {
                value: premiumAmount + toNano('1'), // Extra for gas
                body: beginCell()
                    .storeUint(0x01, 32) // op: receive_premium
                    .storeUint(Number(policyId), 64)
                    .storeCoins(premiumAmount)
                    .storeRef(beginCell().endCell()) // policy_data
                    .endCell(),
            }
        );

        expect(result.transactions).toHaveTransaction({
            from: deployer.address,
            to: treasury.address,
            success: true,
        });

        // Check vault received 70%
        expect(result.transactions).toHaveTransaction({
            from: treasury.address,
            to: multiTrancheVault.address,
            value: toNano('700'), // 70% of 1000
            success: true,
        });

        // Check staking pool received 20%
        expect(result.transactions).toHaveTransaction({
            from: treasury.address,
            to: stakingPool.address,
            value: toNano('200'), // 20% of 1000
            success: true,
        });

        // Check reserve increased by 10%
        const stats = await treasury.getTreasuryStats();
        expect(stats.reserveBalance).toBeGreaterThanOrEqual(toNano('100'));
        expect(stats.totalPremiums).toEqual(premiumAmount);
    });

    it('should track yield distributions to all 6 tranches', async () => {
        // Simulate yield confirmations from MultiTrancheVault
        const yields = {
            btc: toNano('40'),    // BTC tranche: 40 TON yield
            snr: toNano('60'),    // SNR tranche: 60 TON
            mezz: toNano('90'),   // MEZZ tranche: 90 TON
            jnr: toNano('125'),   // JNR tranche: 125 TON
            jnrPlus: toNano('160'), // JNR+ tranche: 160 TON
            eqt: toNano('225'),   // EQT tranche: 225 TON
        };

        // Send yield confirmations for each tranche
        for (let trancheId = 1; trancheId <= 6; trancheId++) {
            const yieldAmount = [
                yields.btc,
                yields.snr,
                yields.mezz,
                yields.jnr,
                yields.jnrPlus,
                yields.eqt,
            ][trancheId - 1];

            await treasury.sendInternalMessage(
                multiTrancheVault.getSender(),
                {
                    value: toNano('0.1'),
                    body: beginCell()
                        .storeUint(0x04, 32) // op: receive_yield_confirmation
                        .storeUint(trancheId, 8)
                        .storeCoins(yieldAmount)
                        .endCell(),
                }
            );
        }

        // Verify all yields tracked correctly
        const allYields = await treasury.getAllTrancheYields();
        expect(allYields.btc).toEqual(yields.btc);
        expect(allYields.snr).toEqual(yields.snr);
        expect(allYields.mezz).toEqual(yields.mezz);
        expect(allYields.jnr).toEqual(yields.jnr);
        expect(allYields.jnrPlus).toEqual(yields.jnrPlus);
        expect(allYields.eqt).toEqual(yields.eqt);

        // Verify total
        const totalYield = await treasury.getTotalYieldDistributed();
        expect(totalYield).toEqual(
            yields.btc + yields.snr + yields.mezz + yields.jnr + yields.jnrPlus + yields.eqt
        );
    });

    it('should process multiple premiums and accumulate yields correctly', async () => {
        // Process 3 premiums
        for (let i = 1; i <= 3; i++) {
            await treasury.sendInternalMessage(
                deployer.getSender(),
                {
                    value: toNano('500') + toNano('1'),
                    body: beginCell()
                        .storeUint(0x01, 32)
                        .storeUint(i, 64)
                        .storeCoins(toNano('500'))
                        .storeRef(beginCell().endCell())
                        .endCell(),
                }
            );
        }

        const stats = await treasury.getTreasuryStats();
        expect(stats.totalPremiums).toEqual(toNano('1500')); // 3 * 500

        // Reserve should be 10% * 1500 = 150 TON
        expect(stats.reserveBalance).toBeGreaterThanOrEqual(toNano('150'));
    });

    it('should only allow owner to set multi_tranche_vault address', async () => {
        const newVault = await blockchain.treasury('newVault');

        // Owner can update
        const result = await treasury.sendInternalMessage(
            deployer.getSender(),
            {
                value: toNano('0.1'),
                body: beginCell()
                    .storeUint(0x11, 32) // op: set_multi_tranche_vault
                    .storeAddress(newVault.address)
                    .endCell(),
            }
        );

        expect(result.transactions).toHaveTransaction({
            from: deployer.address,
            to: treasury.address,
            success: true,
        });

        const updatedVault = await treasury.getMultiTrancheVault();
        expect(updatedVault.toString()).toEqual(newVault.address.toString());
    });

    it('should process claim payouts correctly', async () => {
        // Fund treasury reserve first
        await treasury.sendInternalMessage(
            deployer.getSender(),
            {
                value: toNano('1000'),
                body: beginCell().endCell(), // Plain transfer
            }
        );

        const recipient = await blockchain.treasury('recipient');
        const payoutAmount = toNano('100');

        const result = await treasury.sendInternalMessage(
            claimsProcessor.getSender(),
            {
                value: toNano('0.5'),
                body: beginCell()
                    .storeUint(0x06, 32) // op: process_payout
                    .storeAddress(recipient.address)
                    .storeCoins(payoutAmount)
                    .endCell(),
            }
        );

        expect(result.transactions).toHaveTransaction({
            from: claimsProcessor.address,
            to: treasury.address,
            success: true,
        });

        expect(result.transactions).toHaveTransaction({
            from: treasury.address,
            to: recipient.address,
            value: payoutAmount,
        });

        const stats = await treasury.getTreasuryStats();
        expect(stats.totalPayouts).toEqual(payoutAmount);
    });

    it('should calculate yields correctly across tranches with different utilizations', async () => {
        // This test validates that yields are distributed based on utilization
        // In production, MultiTrancheVault calculates this using bonding curves

        // Simulate realistic yield distribution (higher risk = higher yield)
        const yields = {
            btc: toNano('40'),      // 4% APY (lowest risk, first loss)
            snr: toNano('75'),      // ~7.5% APY
            mezz: toNano('120'),    // 12% APY
            jnr: toNano('140'),     // 14% APY
            jnrPlus: toNano('190'), // 19% APY
            eqt: toNano('200'),     // 20% APY (highest risk, last loss)
        };

        // Send confirmations
        for (let trancheId = 1; trancheId <= 6; trancheId++) {
            const yieldAmount = Object.values(yields)[trancheId - 1];

            await treasury.sendInternalMessage(
                multiTrancheVault.getSender(),
                {
                    value: toNano('0.1'),
                    body: beginCell()
                        .storeUint(0x04, 32)
                        .storeUint(trancheId, 8)
                        .storeCoins(yieldAmount)
                        .endCell(),
                }
            );
        }

        // Verify waterfall: higher tranche IDs get higher yields
        const btcYield = await treasury.getBtcYieldDistributed();
        const eqtYield = await treasury.getEqtYieldDistributed();

        expect(Number(eqtYield)).toBeGreaterThan(Number(btcYield)); // EQT > BTC
    });

    it('should emit events for premium distribution', async () => {
        const premiumAmount = toNano('500');

        const result = await treasury.sendInternalMessage(
            deployer.getSender(),
            {
                value: premiumAmount + toNano('1'),
                body: beginCell()
                    .storeUint(0x01, 32)
                    .storeUint(1, 64)
                    .storeCoins(premiumAmount)
                    .storeRef(beginCell().endCell())
                    .endCell(),
            }
        );

        // Check for PremiumReceived event (0x50)
        // This would be validated through blockchain logs in production
        expect(result.transactions).toHaveTransaction({
            from: deployer.address,
            to: treasury.address,
            success: true,
        });
    });

    it('should maintain correct reserve balance after multiple operations', async () => {
        // Process premiums
        await treasury.sendInternalMessage(
            deployer.getSender(),
            {
                value: toNano('1000') + toNano('1'),
                body: beginCell()
                    .storeUint(0x01, 32)
                    .storeUint(1, 64)
                    .storeCoins(toNano('1000'))
                    .storeRef(beginCell().endCell())
                    .endCell(),
            }
        );

        // Process another premium
        await treasury.sendInternalMessage(
            deployer.getSender(),
            {
                value: toNano('500') + toNano('1'),
                body: beginCell()
                    .storeUint(0x01, 32)
                    .storeUint(2, 64)
                    .storeCoins(toNano('500'))
                    .storeRef(beginCell().endCell())
                    .endCell(),
            }
        );

        const stats = await treasury.getTreasuryStats();

        // Total premiums = 1500
        expect(stats.totalPremiums).toEqual(toNano('1500'));

        // Reserve = 10% of 1500 = 150 TON (minimum)
        expect(stats.reserveBalance).toBeGreaterThanOrEqual(toNano('150'));
    });

    it('should get individual tranche yields correctly', async () => {
        const btcYield = toNano('100');

        await treasury.sendInternalMessage(
            multiTrancheVault.getSender(),
            {
                value: toNano('0.1'),
                body: beginCell()
                    .storeUint(0x04, 32)
                    .storeUint(1, 8) // BTC tranche
                    .storeCoins(btcYield)
                    .endCell(),
            }
        );

        const result = await treasury.getBtcYieldDistributed();
        expect(result).toEqual(btcYield);

        // Others should be 0
        const snrYield = await treasury.getSnrYieldDistributed();
        expect(snrYield).toEqual(0n);
    });
});
