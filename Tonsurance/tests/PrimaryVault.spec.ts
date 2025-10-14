import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano } from '@ton/core';
import { PrimaryVault } from '../wrappers/PrimaryVault';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

describe('PrimaryVault', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compile('PrimaryVault');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let primaryVault: SandboxContract<PrimaryVault>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');

        const claimsProcessor = await blockchain.treasury('claimsProcessor');

        primaryVault = blockchain.openContract(
            PrimaryVault.createFromConfig(
                {
                    ownerAddress: deployer.address,
                    totalLpCapital: 0n,
                    totalSupply: 0n,
                    maxSupply: toNano('1000000'), // 1M tokens
                    priceMin: toNano('1'), // 1.0 USDT
                    priceMax: toNano('1.5'), // 1.5 USDT (50% appreciation)
                    accumulatedYield: 0n,
                    lossesAbsorbed: 0n,
                    claimsProcessorAddress: claimsProcessor.address,
                },
                code
            )
        );

        // Send >= 0.1 TON since empty body triggers deposit logic
        const deployResult = await primaryVault.sendDeploy(deployer.getSender(), toNano('0.1'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: primaryVault.address,
            deploy: true,
            success: true,
        });
    });

    it('should deploy successfully', async () => {
        // Deployment tested in beforeEach
    });

    it('should have correct initial state', async () => {
        const totalCapital = await primaryVault.getTotalLpCapital();
        const totalSupply = await primaryVault.getTotalSupply();
        const currentPrice = await primaryVault.getCurrentPrice();

        // Deployment sends 0.1 TON which gets deposited
        expect(totalCapital).toBe(toNano('0.1'));
        expect(totalSupply).toBe(toNano('0.1')); // 0.1 TON / 1.0 price = 0.1 tokens
        expect(currentPrice).toBe(toNano('1')); // Starting price (still at min since utilization is tiny)
    });

    it('should accept LP capital deposit', async () => {
        const depositor = await blockchain.treasury('depositor');
        const depositAmount = toNano('1000');

        const result = await primaryVault.sendDeposit(depositor.getSender(), {
            value: toNano('0.1'),
            amount: depositAmount,
        });

        expect(result.transactions).toHaveTransaction({
            from: depositor.address,
            to: primaryVault.address,
            success: true,
        });

        const totalCapital = await primaryVault.getTotalLpCapital();
        // Total includes deployment 0.1 TON + deposit
        expect(totalCapital).toBe(depositAmount + toNano('0.1'));
    });

    it('should track individual LP balances', async () => {
        const depositor = await blockchain.treasury('depositor');
        const depositAmount = toNano('1000');

        await primaryVault.sendDeposit(depositor.getSender(), {
            value: toNano('0.1'),
            amount: depositAmount,
        });

        const balance = await primaryVault.getLpBalance(depositor.address);
        expect(balance).toBeGreaterThan(0n);
    });

    it('should increase price with utilization (exponential bonding curve)', async () => {
        const depositor1 = await blockchain.treasury('depositor1');
        const depositor2 = await blockchain.treasury('depositor2');

        // Get initial price
        const initialPrice = await primaryVault.getCurrentPrice();

        // First deposit (10% of max supply)
        await primaryVault.sendDeposit(depositor1.getSender(), {
            value: toNano('0.1'),
            amount: toNano('100000'),
        });

        const priceAfterFirst = await primaryVault.getCurrentPrice();

        // Second deposit (another 10% of max supply)
        await primaryVault.sendDeposit(depositor2.getSender(), {
            value: toNano('0.1'),
            amount: toNano('100000'),
        });

        const priceAfterSecond = await primaryVault.getCurrentPrice();

        // Verify price increased
        expect(Number(priceAfterFirst)).toBeGreaterThan(Number(initialPrice));
        expect(Number(priceAfterSecond)).toBeGreaterThan(Number(priceAfterFirst));
    });

    it('should allow withdrawal of LP capital', async () => {
        const depositor = await blockchain.treasury('depositor');

        // First deposit
        await primaryVault.sendDeposit(depositor.getSender(), {
            value: toNano('0.1'),
            amount: toNano('1000'),
        });

        const balanceBefore = await primaryVault.getLpBalance(depositor.address);

        // Withdraw half
        const withdrawTokens = balanceBefore / 2n;
        const result = await primaryVault.sendWithdraw(depositor.getSender(), {
            value: toNano('0.1'),
            tokens: withdrawTokens,
        });

        expect(result.transactions).toHaveTransaction({
            from: depositor.address,
            to: primaryVault.address,
            success: true,
        });

        const balanceAfter = await primaryVault.getLpBalance(depositor.address);
        expect(balanceAfter).toBeLessThan(balanceBefore);
    });

    it('should receive premium share from distributor', async () => {
        const distributor = await blockchain.treasury('distributor');
        const premiumShare = toNano('100');

        const result = await primaryVault.sendReceivePremiumShare(distributor.getSender(), {
            value: toNano('0.1'),
            amount: premiumShare,
            policyId: 1n,
        });

        expect(result.transactions).toHaveTransaction({
            from: distributor.address,
            to: primaryVault.address,
            success: true,
        });

        // Premium shares add to accumulated_yield, not total_lp_capital
        const stats = await primaryVault.getVaultStats();
        expect(stats.accumulatedYield).toBe(premiumShare);
        // Capital should still be just the deployment amount
        expect(stats.totalLpCapital).toBe(toNano('0.1'));
    });

    it('should handle claim loss absorption (first-loss capital)', async () => {
        const claimsProcessor = await blockchain.treasury('claimsProcessor');
        const claimant = await blockchain.treasury('claimant');

        // First, add capital
        const depositor = await blockchain.treasury('depositor');
        await primaryVault.sendDeposit(depositor.getSender(), {
            value: toNano('0.1'),
            amount: toNano('10000'),
        });

        const lossAmount = toNano('1000');

        const result = await primaryVault.sendAbsorbLoss(claimsProcessor.getSender(), {
            value: toNano('0.15'),
            lossAmount,
            claimant: claimant.address,
        });

        expect(result.transactions).toHaveTransaction({
            from: claimsProcessor.address,
            to: primaryVault.address,
            success: true,
        });

        // Verify loss was paid to claimant
        expect(result.transactions).toHaveTransaction({
            from: primaryVault.address,
            to: claimant.address,
            success: true,
        });

        // Verify capital decreased (from 10000 + 0.1 deployment)
        const totalCapitalAfter = await primaryVault.getTotalLpCapital();
        expect(totalCapitalAfter).toBeLessThan(toNano('10000') + toNano('0.1'));
    });

    it('should enforce minimum deposit amount', async () => {
        const depositor = await blockchain.treasury('depositor');
        const tinyAmount = toNano('0.05'); // Below 0.1 TON minimum

        const result = await primaryVault.sendDeposit(depositor.getSender(), {
            value: toNano('0.1'),
            amount: tinyAmount,
        });

        expect(result.transactions).toHaveTransaction({
            from: depositor.address,
            to: primaryVault.address,
            success: false,
            exitCode: 400, // Bad request
        });
    });

    it('should calculate vault stats correctly', async () => {
        const depositor = await blockchain.treasury('depositor');
        await primaryVault.sendDeposit(depositor.getSender(), {
            value: toNano('0.1'),
            amount: toNano('5000'),
        });

        const stats = await primaryVault.getVaultStats();
        const currentPrice = await primaryVault.getCurrentPrice();

        // Total includes deployment 0.1 TON
        expect(stats.totalLpCapital).toBe(toNano('5000') + toNano('0.1'));
        expect(stats.totalSupply).toBeGreaterThan(0n);
        expect(currentPrice).toBeGreaterThan(0n);
    });

    it('should handle multiple depositors correctly', async () => {
        const depositor1 = await blockchain.treasury('depositor1');
        const depositor2 = await blockchain.treasury('depositor2');
        const depositor3 = await blockchain.treasury('depositor3');

        // Three different deposits
        await primaryVault.sendDeposit(depositor1.getSender(), {
            value: toNano('0.1'),
            amount: toNano('1000'),
        });

        await primaryVault.sendDeposit(depositor2.getSender(), {
            value: toNano('0.1'),
            amount: toNano('2000'),
        });

        await primaryVault.sendDeposit(depositor3.getSender(), {
            value: toNano('0.1'),
            amount: toNano('1500'),
        });

        const balance1 = await primaryVault.getLpBalance(depositor1.address);
        const balance2 = await primaryVault.getLpBalance(depositor2.address);
        const balance3 = await primaryVault.getLpBalance(depositor3.address);

        expect(balance1).toBeGreaterThan(0n);
        expect(balance2).toBeGreaterThan(0n);
        expect(balance3).toBeGreaterThan(0n);

        const totalCapital = await primaryVault.getTotalLpCapital();
        expect(totalCapital).toBe(toNano('4500') + toNano('0.1'));
    });

    it('should price reach maximum at full capacity', async () => {
        const depositor = await blockchain.treasury('depositor');

        // Make multiple deposits to push utilization high
        // First 500k TON at low price
        await primaryVault.sendDeposit(depositor.getSender(), {
            value: toNano('1'),
            amount: toNano('500000'),
        });

        // Then another 400k to get close to max
        await primaryVault.sendDeposit(depositor.getSender(), {
            value: toNano('1'),
            amount: toNano('400000'),
        });

        const finalPrice = await primaryVault.getCurrentPrice();

        // At 90%+ utilization, price should be significantly higher
        // With exponential curve, 90% utilization = 1.0 + 0.5*(0.9)^2 = 1.405
        expect(Number(finalPrice)).toBeGreaterThan(Number(toNano('1.3')));
        expect(Number(finalPrice)).toBeLessThanOrEqual(Number(toNano('1.5')));
    });

    it('should distribute yields to LPs from premium shares', async () => {
        const depositor = await blockchain.treasury('depositor');
        const distributor = await blockchain.treasury('distributor');

        // LP deposits
        await primaryVault.sendDeposit(depositor.getSender(), {
            value: toNano('0.1'),
            amount: toNano('10000'),
        });

        const statsBefore = await primaryVault.getVaultStats();

        // Receive premium shares (simulating yield)
        await primaryVault.sendReceivePremiumShare(distributor.getSender(), {
            value: toNano('0.1'),
            amount: toNano('100'),
            policyId: 1n,
        });

        const statsAfter = await primaryVault.getVaultStats();

        // Accumulated yield should increase (not capital)
        expect(statsAfter.accumulatedYield).toBeGreaterThan(statsBefore.accumulatedYield);
        expect(statsAfter.accumulatedYield).toBe(statsBefore.accumulatedYield + toNano('100'));
        // Capital stays the same
        expect(statsAfter.totalLpCapital).toBe(statsBefore.totalLpCapital);
    });

    it('should be liquid (no lock period)', async () => {
        const depositor = await blockchain.treasury('depositor');

        // Deposit
        await primaryVault.sendDeposit(depositor.getSender(), {
            value: toNano('0.1'),
            amount: toNano('1000'),
        });

        const balance = await primaryVault.getLpBalance(depositor.address);

        // Immediate withdrawal (no lock)
        const result = await primaryVault.sendWithdraw(depositor.getSender(), {
            value: toNano('0.1'),
            tokens: balance,
        });

        expect(result.transactions).toHaveTransaction({
            from: depositor.address,
            to: primaryVault.address,
            success: true,
        });
    });
});
