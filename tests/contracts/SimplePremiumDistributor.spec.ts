import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano } from '@ton/core';
import { SimplePremiumDistributor } from '../wrappers/SimplePremiumDistributor';
import { MultiTrancheVault } from '../wrappers/MultiTrancheVault';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

describe('SimplePremiumDistributor', () => {
    let distributorCode: Cell;
    let vaultCode: Cell;

    beforeAll(async () => {
        distributorCode = await compile('SimplePremiumDistributor');
        vaultCode = await compile('MultiTrancheVault');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let simplePremiumDistributor: SandboxContract<SimplePremiumDistributor>;
    let multiTrancheVault: SandboxContract<MultiTrancheVault>;
    let protocolTreasury: SandboxContract<TreasuryContract>;
    let reserveFund: SandboxContract<TreasuryContract>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');
        protocolTreasury = await blockchain.treasury('protocolTreasury');
        reserveFund = await blockchain.treasury('reserveFund');

        multiTrancheVault = blockchain.openContract(
            MultiTrancheVault.createFromConfig({ ownerAddress: deployer.address, adminAddress: deployer.address }, vaultCode)
        );
        await multiTrancheVault.sendDeploy(deployer.getSender(), toNano('0.1'));

        simplePremiumDistributor = blockchain.openContract(
            SimplePremiumDistributor.createFromConfig(
                {
                    ownerAddress: deployer.address,
                    multiTrancheVaultAddress: multiTrancheVault.address,
                    protocolTreasuryAddress: protocolTreasury.address,
                    reserveFundAddress: reserveFund.address,
                },
                distributorCode
            )
        );

        const deployResult = await simplePremiumDistributor.sendDeploy(deployer.getSender(), toNano('0.05'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: simplePremiumDistributor.address,
            deploy: true,
            success: true,
        });
    });

    it('should distribute premium to 3 parties', async () => {
        const treasury = await blockchain.treasury('treasury');
        const premiumAmount = toNano('100');

        const result = await simplePremiumDistributor.sendDistributePremium(treasury.getSender(), {
            value: toNano('0.2'),
            premiumAmount,
        });

        expect(result.transactions).toHaveTransaction({
            from: simplePremiumDistributor.address,
            to: multiTrancheVault.address,
            op: 0x03, // op: distribute_premiums
            success: true,
        });

        expect(result.transactions).toHaveTransaction({
            from: simplePremiumDistributor.address,
            to: protocolTreasury.address,
            success: true,
        });

        expect(result.transactions).toHaveTransaction({
            from: simplePremiumDistributor.address,
            to: reserveFund.address,
            success: true,
        });
    });

    it('should distribute correct percentages (65/25/10)', async () => {
        const treasury = await blockchain.treasury('treasury');
        const premiumAmount = toNano('1000');

        const vaultBalanceBefore = (await blockchain.getContract(multiTrancheVault.address)).balance;
        const protocolTreasuryBalanceBefore = (await blockchain.getContract(protocolTreasury.address)).balance;
        const reserveFundBalanceBefore = (await blockchain.getContract(reserveFund.address)).balance;

        await simplePremiumDistributor.sendDistributePremium(treasury.getSender(), {
            value: premiumAmount + toNano('0.5'),
            premiumAmount,
        });

        const vaultBalanceAfter = (await blockchain.getContract(multiTrancheVault.address)).balance;
        const protocolTreasuryBalanceAfter = (await blockchain.getContract(protocolTreasury.address)).balance;
        const reserveFundBalanceAfter = (await blockchain.getContract(reserveFund.address)).balance;

        const vaultReceived = vaultBalanceAfter - vaultBalanceBefore;
        const protocolReceived = protocolTreasuryBalanceAfter - protocolTreasuryBalanceBefore;
        const reserveReceived = reserveFundBalanceAfter - reserveFundBalanceBefore;

        // Verify approximate percentages (65% to vault, 25% to treasury, 10% to reserve)
        expect(Number(vaultReceived)).toBeGreaterThan(Number(toNano('640')));
        expect(Number(protocolReceived)).toBeGreaterThan(Number(toNano('240')));
        expect(Number(reserveReceived)).toBeGreaterThan(Number(toNano('90')));
    });
});
