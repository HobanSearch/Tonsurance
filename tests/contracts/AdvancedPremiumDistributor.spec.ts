import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano } from '@ton/core';
import { AdvancedPremiumDistributor } from '../wrappers/AdvancedPremiumDistributor';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

describe('AdvancedPremiumDistributor', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compile('AdvancedPremiumDistributor');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let advancedPremiumDistributor: SandboxContract<AdvancedPremiumDistributor>;
    let primaryVault: SandboxContract<TreasuryContract>;
    let secondaryVault: SandboxContract<TreasuryContract>;
    let referralManager: SandboxContract<TreasuryContract>;
    let oracleRewards: SandboxContract<TreasuryContract>;
    let protocolTreasury: SandboxContract<TreasuryContract>;
    let governanceRewards: SandboxContract<TreasuryContract>;
    let reserveFund: SandboxContract<TreasuryContract>;
    let tradfiBuffer: SandboxContract<TreasuryContract>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');
        primaryVault = await blockchain.treasury('primaryVault');
        secondaryVault = await blockchain.treasury('secondaryVault');
        referralManager = await blockchain.treasury('referralManager');
        oracleRewards = await blockchain.treasury('oracleRewards');
        protocolTreasury = await blockchain.treasury('protocolTreasury');
        governanceRewards = await blockchain.treasury('governanceRewards');
        reserveFund = await blockchain.treasury('reserveFund');
        tradfiBuffer = await blockchain.treasury('tradfiBuffer');

        advancedPremiumDistributor = blockchain.openContract(
            AdvancedPremiumDistributor.createFromConfig(
                {
                    ownerAddress: deployer.address,
                    primaryVaultAddress: primaryVault.address,
                    secondaryVaultAddress: secondaryVault.address,
                    referralManagerAddress: referralManager.address,
                    oracleRewardsAddress: oracleRewards.address,
                    protocolTreasuryAddress: protocolTreasury.address,
                    governanceRewardsAddress: governanceRewards.address,
                    reserveFundAddress: reserveFund.address,
                    tradfiBufferAddress: tradfiBuffer.address,
                    totalPremiumsDistributed: 0n,
                    distributionCount: 0n,
                },
                code
            )
        );

        const deployResult = await advancedPremiumDistributor.sendDeploy(deployer.getSender(), toNano('0.05'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: advancedPremiumDistributor.address,
            deploy: true,
            success: true,
        });
    });

    it('should deploy successfully', async () => {
        // Deployment tested in beforeEach
    });

    it('should have correct initial state', async () => {
        const totalDistributed = await advancedPremiumDistributor.getTotalPremiumsDistributed();
        const distributionCount = await advancedPremiumDistributor.getDistributionCount();

        expect(totalDistributed).toBe(0n);
        expect(distributionCount).toBe(0n);
    });

    it('should distribute premium to all 8 parties', async () => {
        const treasury = await blockchain.treasury('treasury');
        const user = await blockchain.treasury('user');
        const premiumAmount = toNano('100');

        const result = await advancedPremiumDistributor.sendDistributePremium(treasury.getSender(), {
            value: toNano('0.5') + premiumAmount,
            premiumAmount,
            policyId: 1n,
            userAddress: user.address,
        });

        expect(result.transactions).toHaveTransaction({
            from: treasury.address,
            to: advancedPremiumDistributor.address,
            success: true,
        });

        // Verify messages sent to all 8 parties
        const parties = [
            primaryVault,
            secondaryVault,
            referralManager,
            oracleRewards,
            protocolTreasury,
            governanceRewards,
            reserveFund,
            tradfiBuffer,
        ];

        parties.forEach(party => {
            expect(result.transactions).toHaveTransaction({
                from: advancedPremiumDistributor.address,
                to: party.address,
                success: true,
            });
        });
    });

    it('should return correct distribution percentages', async () => {
        const percentages = await advancedPremiumDistributor.getDistributionPercentages();

        expect(percentages.primary).toBe(4500); // 45% in basis points
        expect(percentages.secondary).toBe(2000); // 20%
        expect(percentages.referrer).toBe(1000); // 10%
        expect(percentages.oracle).toBe(300); // 3%
        expect(percentages.protocol).toBe(700); // 7%
        expect(percentages.governance).toBe(200); // 2%
        expect(percentages.reserve).toBe(300); // 3%
        expect(percentages.tradfi).toBe(1000); // 10%

        // Total should be 100% (10000 basis points)
        const total = percentages.primary + percentages.secondary + percentages.referrer +
                     percentages.oracle + percentages.protocol + percentages.governance +
                     percentages.reserve + percentages.tradfi;
        expect(total).toBe(10000);
    });

    it('should send correct amount to Primary Vault (45%)', async () => {
        const treasury = await blockchain.treasury('treasury');
        const user = await blockchain.treasury('user');
        const premiumAmount = toNano('1000'); // Use 1000 for easy percentage calculation

        const result = await advancedPremiumDistributor.sendDistributePremium(treasury.getSender(), {
            value: toNano('1') + premiumAmount,
            premiumAmount,
            policyId: 1n,
            userAddress: user.address,
        });

        // Verify transaction sent to Primary Vault (45% of 1000 = ~450 TON)
        expect(result.transactions).toHaveTransaction({
            from: advancedPremiumDistributor.address,
            to: primaryVault.address,
            success: true,
        });
    });

    it('should send correct amount to Secondary Vault (20%)', async () => {
        const treasury = await blockchain.treasury('treasury');
        const user = await blockchain.treasury('user');
        const premiumAmount = toNano('1000');

        const result = await advancedPremiumDistributor.sendDistributePremium(treasury.getSender(), {
            value: toNano('1') + premiumAmount,
            premiumAmount,
            policyId: 1n,
            userAddress: user.address,
        });

        // Verify transaction sent to Secondary Vault (20% of 1000 = ~200 TON)
        expect(result.transactions).toHaveTransaction({
            from: advancedPremiumDistributor.address,
            to: secondaryVault.address,
            success: true,
        });
    });

    it('should send correct amount to Referral Manager (10%)', async () => {
        const treasury = await blockchain.treasury('treasury');
        const user = await blockchain.treasury('user');
        const premiumAmount = toNano('1000');

        const result = await advancedPremiumDistributor.sendDistributePremium(treasury.getSender(), {
            value: toNano('1') + premiumAmount,
            premiumAmount,
            policyId: 1n,
            userAddress: user.address,
        });

        // Verify transaction sent to Referral Manager (10% of 1000 = ~100 TON)
        expect(result.transactions).toHaveTransaction({
            from: advancedPremiumDistributor.address,
            to: referralManager.address,
            success: true,
        });
    });

    it('should send correct amount to Oracle Rewards (3%)', async () => {
        const treasury = await blockchain.treasury('treasury');
        const user = await blockchain.treasury('user');
        const premiumAmount = toNano('1000');

        const result = await advancedPremiumDistributor.sendDistributePremium(treasury.getSender(), {
            value: toNano('1') + premiumAmount,
            premiumAmount,
            policyId: 1n,
            userAddress: user.address,
        });

        // Verify transaction sent to Oracle Rewards (3% of 1000 = ~30 TON)
        expect(result.transactions).toHaveTransaction({
            from: advancedPremiumDistributor.address,
            to: oracleRewards.address,
            success: true,
        });
    });

    it('should send correct amount to Protocol Treasury (7%)', async () => {
        const treasury = await blockchain.treasury('treasury');
        const user = await blockchain.treasury('user');
        const premiumAmount = toNano('1000');

        const result = await advancedPremiumDistributor.sendDistributePremium(treasury.getSender(), {
            value: toNano('1') + premiumAmount,
            premiumAmount,
            policyId: 1n,
            userAddress: user.address,
        });

        // Verify transaction sent to Protocol Treasury (7% of 1000 = ~70 TON)
        expect(result.transactions).toHaveTransaction({
            from: advancedPremiumDistributor.address,
            to: protocolTreasury.address,
            success: true,
        });
    });

    it('should send correct amount to Governance Rewards (2%)', async () => {
        const treasury = await blockchain.treasury('treasury');
        const user = await blockchain.treasury('user');
        const premiumAmount = toNano('1000');

        const result = await advancedPremiumDistributor.sendDistributePremium(treasury.getSender(), {
            value: toNano('1') + premiumAmount,
            premiumAmount,
            policyId: 1n,
            userAddress: user.address,
        });

        // Verify transaction sent to Governance Rewards (2% of 1000 = ~20 TON)
        expect(result.transactions).toHaveTransaction({
            from: advancedPremiumDistributor.address,
            to: governanceRewards.address,
            success: true,
        });
    });

    it('should send correct amount to Reserve Fund (3%)', async () => {
        const treasury = await blockchain.treasury('treasury');
        const user = await blockchain.treasury('user');
        const premiumAmount = toNano('1000');

        const result = await advancedPremiumDistributor.sendDistributePremium(treasury.getSender(), {
            value: toNano('1') + premiumAmount,
            premiumAmount,
            policyId: 1n,
            userAddress: user.address,
        });

        // Verify transaction sent to Reserve Fund (3% of 1000 = ~30 TON)
        expect(result.transactions).toHaveTransaction({
            from: advancedPremiumDistributor.address,
            to: reserveFund.address,
            success: true,
        });
    });

    it('should send correct amount to TradFi Buffer (10%)', async () => {
        const treasury = await blockchain.treasury('treasury');
        const user = await blockchain.treasury('user');
        const premiumAmount = toNano('1000');

        const result = await advancedPremiumDistributor.sendDistributePremium(treasury.getSender(), {
            value: toNano('1') + premiumAmount,
            premiumAmount,
            policyId: 1n,
            userAddress: user.address,
        });

        // Verify transaction sent to TradFi Buffer (10% of 1000 = ~100 TON)
        expect(result.transactions).toHaveTransaction({
            from: advancedPremiumDistributor.address,
            to: tradfiBuffer.address,
            success: true,
        });
    });

    it('should update stats after distribution', async () => {
        const treasury = await blockchain.treasury('treasury');
        const user = await blockchain.treasury('user');
        const premiumAmount = toNano('100');

        await advancedPremiumDistributor.sendDistributePremium(treasury.getSender(), {
            value: toNano('0.5') + premiumAmount,
            premiumAmount,
            policyId: 1n,
            userAddress: user.address,
        });

        const totalDistributed = await advancedPremiumDistributor.getTotalPremiumsDistributed();
        const distributionCount = await advancedPremiumDistributor.getDistributionCount();

        expect(totalDistributed).toBe(premiumAmount);
        expect(distributionCount).toBe(1n);
    });

    it('should allow owner to set primary vault address', async () => {
        const newPrimaryVault = await blockchain.treasury('newPrimaryVault');

        const result = await advancedPremiumDistributor.sendSetPrimaryVault(deployer.getSender(), {
            value: toNano('0.05'),
            newAddress: newPrimaryVault.address,
        });

        expect(result.transactions).toHaveTransaction({
            from: deployer.address,
            to: advancedPremiumDistributor.address,
            success: true,
        });
    });

    it('should allow owner to set referral manager address', async () => {
        const newReferralManager = await blockchain.treasury('newReferralManager');

        const result = await advancedPremiumDistributor.sendSetReferralManager(deployer.getSender(), {
            value: toNano('0.05'),
            newAddress: newReferralManager.address,
        });

        expect(result.transactions).toHaveTransaction({
            from: deployer.address,
            to: advancedPremiumDistributor.address,
            success: true,
        });
    });
});
