import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano } from '@ton/core';
import { AdvancedPremiumDistributor } from '../wrappers/AdvancedPremiumDistributor';
import { MultiTrancheVault } from '../wrappers/MultiTrancheVault';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

describe('AdvancedPremiumDistributor', () => {
    let distributorCode: Cell;
    let vaultCode: Cell;

    beforeAll(async () => {
        distributorCode = await compile('AdvancedPremiumDistributor');
        vaultCode = await compile('MultiTrancheVault');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let distributor: SandboxContract<AdvancedPremiumDistributor>;
    let multiTrancheVault: SandboxContract<MultiTrancheVault>;
    let protocolTreasury: SandboxContract<TreasuryContract>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');
        protocolTreasury = await blockchain.treasury('protocolTreasury');

        multiTrancheVault = blockchain.openContract(
            MultiTrancheVault.createFromConfig({ ownerAddress: deployer.address, adminAddress: deployer.address }, vaultCode)
        );
        await multiTrancheVault.sendDeploy(deployer.getSender(), toNano('0.1'));

        distributor = blockchain.openContract(
            AdvancedPremiumDistributor.createFromConfig(
                {
                    ownerAddress: deployer.address,
                    multiTrancheVaultAddress: multiTrancheVault.address,
                    protocolTreasuryAddress: protocolTreasury.address,
                    // ... other addresses can be mocked or use deployer address for this test
                    referralManagerAddress: deployer.address, 
                    oracleRewardsAddress: deployer.address,
                },
                distributorCode
            )
        );

        await distributor.sendDeploy(deployer.getSender(), toNano('0.05'));
    });

    it('should distribute premium to the MultiTrancheVault', async () => {
        const sender = await blockchain.treasury('sender');
        const premiumAmount = toNano('100');

        const vaultBalanceBefore = (await blockchain.getContract(multiTrancheVault.address)).balance;

        const result = await distributor.sendDistributePremium(sender.getSender(), {
            value: premiumAmount + toNano('0.1'), // premium + gas
            premiumAmount,
        });

        // Check that the main distribution message was sent
        expect(result.transactions).toHaveTransaction({
            from: distributor.address,
            to: multiTrancheVault.address,
            op: 0x03, // op: distribute_premiums
            success: true,
        });

        const vaultBalanceAfter = (await blockchain.getContract(multiTrancheVault.address)).balance;
        const vaultReceived = vaultBalanceAfter - vaultBalanceBefore;

        // Check that the vault received the correct LP share (65%)
        const expectedLpShare = premiumAmount * 65n / 100n;
        
        // Allow for some gas fees
        expect(vaultReceived).toBeGreaterThan(expectedLpShare - toNano('0.01'));
        expect(vaultReceived).toBeLessThan(expectedLpShare + toNano('0.01'));
    });
});
