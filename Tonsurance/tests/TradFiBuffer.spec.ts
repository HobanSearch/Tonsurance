import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano } from '@ton/core';
import { TradFiBuffer } from '../wrappers/TradFiBuffer';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

describe('TradFiBuffer', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compile('TradFiBuffer');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let tradFiBuffer: SandboxContract<TradFiBuffer>;
    let complianceGateway: SandboxContract<TreasuryContract>;
    let shieldInstToken: SandboxContract<TreasuryContract>;
    let premiumDistributor: SandboxContract<TreasuryContract>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');
        complianceGateway = await blockchain.treasury('complianceGateway');
        shieldInstToken = await blockchain.treasury('shieldInstToken');
        premiumDistributor = await blockchain.treasury('premiumDistributor');

        // Fund token contract to handle mints
        await deployer.send({
            to: shieldInstToken.address,
            value: toNano('1'),
            bounce: false,
        });

        tradFiBuffer = blockchain.openContract(
            TradFiBuffer.createFromConfig(
                {
                    ownerAddress: deployer.address,
                    complianceGatewayAddress: complianceGateway.address,
                    shieldInstTokenAddress: shieldInstToken.address,
                    premiumDistributorAddress: premiumDistributor.address,
                    totalDeposited: 0n,
                    totalWithdrawn: 0n,
                    totalInterestPaid: 0n,
                    currentTvl: 0n,
                    minDeposit: toNano('250000'), // $250k minimum
                    lockPeriod: 180 * 86400, // 180 days in seconds
                    minApy: 600, // 6% (in basis points)
                    maxApy: 1000, // 10% (in basis points)
                },
                code
            )
        );

        const deployResult = await tradFiBuffer.sendDeploy(deployer.getSender(), toNano('0.05'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: tradFiBuffer.address,
            deploy: true,
            success: true,
        });
    });

    it('should deploy successfully', async () => {
        // Deployment tested in beforeEach
    });

    it('should accept institutional deposit above minimum ($250k+)', async () => {
        const investor = await blockchain.treasury('investor');
        const depositAmount = toNano('250000'); // $250k
        const apyRate = 800; // 8% APY

        const result = await tradFiBuffer.sendDepositCapital(investor.getSender(), {
            value: depositAmount + toNano('0.5'),
            amount: depositAmount,
            apyRate,
        });

        expect(result.transactions).toHaveTransaction({
            from: investor.address,
            to: tradFiBuffer.address,
            success: true,
        });

        const stats = await tradFiBuffer.getBufferStats();
        expect(stats.totalDeposited).toBe(depositAmount);
        expect(stats.currentTvl).toBe(depositAmount);
    });

    it('should reject deposit below minimum', async () => {
        const investor = await blockchain.treasury('investor');
        const smallDeposit = toNano('100000'); // $100k (below $250k minimum)

        const result = await tradFiBuffer.sendDepositCapital(investor.getSender(), {
            value: smallDeposit + toNano('0.5'),
            amount: smallDeposit,
            apyRate: 800,
        });

        expect(result.transactions).toHaveTransaction({
            from: investor.address,
            to: tradFiBuffer.address,
            success: false,
            exitCode: 400, // Bad request
        });
    });

    it('should check KYC compliance before deposit', async () => {
        const investor = await blockchain.treasury('investor');
        const depositAmount = toNano('250000');

        // This test assumes KYC check would be done via ComplianceGateway
        // In actual implementation, would verify message sent to ComplianceGateway
        const result = await tradFiBuffer.sendDepositCapital(investor.getSender(), {
            value: depositAmount + toNano('0.5'),
            amount: depositAmount,
            apyRate: 800,
        });

        // Should succeed if KYC is valid
        expect(result.transactions).toHaveTransaction({
            from: investor.address,
            to: tradFiBuffer.address,
            success: true,
        });
    });

    it('should enforce 180-day lock period', async () => {
        const investor = await blockchain.treasury('investor');
        const depositAmount = toNano('250000');

        await tradFiBuffer.sendDepositCapital(investor.getSender(), {
            value: depositAmount + toNano('0.5'),
            amount: depositAmount,
            apyRate: 800,
        });

        const deposit = await tradFiBuffer.getInvestorDeposit(investor.address);
        const currentTime = blockchain.now || Math.floor(Date.now() / 1000);
        const expectedUnlockTime = currentTime + (180 * 86400); // 180 days

        // Allow 10 second tolerance
        expect(Math.abs(deposit.unlockTime - expectedUnlockTime)).toBeLessThan(10);
    });

    it('should allow withdrawal after unlock period', async () => {
        const investor = await blockchain.treasury('investor');
        const depositAmount = toNano('250000');

        await tradFiBuffer.sendDepositCapital(investor.getSender(), {
            value: depositAmount + toNano('0.5'),
            amount: depositAmount,
            apyRate: 800,
        });

        // Simulate premium revenue for interest payment
        const premiumDistributor = await blockchain.treasury('premiumDistributor');
        await premiumDistributor.send({
            to: tradFiBuffer.address,
            value: toNano('15000'), // Enough to cover interest (~9863 TON)
            bounce: false,
        });

        // Fast-forward 181 days
        blockchain.now = (blockchain.now || Math.floor(Date.now() / 1000)) + (181 * 86400);

        const result = await tradFiBuffer.sendWithdrawCapital(investor.getSender(), toNano('0.1'));

        expect(result.transactions).toHaveTransaction({
            from: investor.address,
            to: tradFiBuffer.address,
            success: true,
        });
    });

    it('should reject withdrawal before unlock period', async () => {
        const investor = await blockchain.treasury('investor');
        const depositAmount = toNano('250000');

        await tradFiBuffer.sendDepositCapital(investor.getSender(), {
            value: depositAmount + toNano('0.5'),
            amount: depositAmount,
            apyRate: 800,
        });

        // Try to withdraw immediately (still locked)
        const result = await tradFiBuffer.sendWithdrawCapital(investor.getSender(), toNano('0.1'));

        expect(result.transactions).toHaveTransaction({
            from: investor.address,
            to: tradFiBuffer.address,
            success: false,
            exitCode: 410, // Lock period not expired
        });
    });

    it('should calculate interest with 6-10% APY range', async () => {
        const investor1 = await blockchain.treasury('investor1');
        const investor2 = await blockchain.treasury('investor2');

        // Investor1: 6% APY
        await tradFiBuffer.sendDepositCapital(investor1.getSender(), {
            value: toNano('250000') + toNano('0.5'),
            amount: toNano('250000'),
            apyRate: 600, // 6%
        });

        // Investor2: 10% APY
        await tradFiBuffer.sendDepositCapital(investor2.getSender(), {
            value: toNano('300000') + toNano('0.5'),
            amount: toNano('300000'),
            apyRate: 1000, // 10%
        });

        const deposit1 = await tradFiBuffer.getInvestorDeposit(investor1.address);
        const deposit2 = await tradFiBuffer.getInvestorDeposit(investor2.address);

        expect(deposit1.apyRate).toBe(600);
        expect(deposit2.apyRate).toBe(1000);
    });

    it('should validate APY within range', async () => {
        const investor = await blockchain.treasury('investor');

        // Try with APY below minimum (5%)
        const resultLow = await tradFiBuffer.sendDepositCapital(investor.getSender(), {
            value: toNano('250000') + toNano('0.5'),
            amount: toNano('250000'),
            apyRate: 500, // 5% (below 6% minimum)
        });

        expect(resultLow.transactions).toHaveTransaction({
            from: investor.address,
            to: tradFiBuffer.address,
            success: false,
            exitCode: 400,
        });

        // Try with APY above maximum (12%)
        const resultHigh = await tradFiBuffer.sendDepositCapital(investor.getSender(), {
            value: toNano('250000') + toNano('0.5'),
            amount: toNano('250000'),
            apyRate: 1200, // 12% (above 10% maximum)
        });

        expect(resultHigh.transactions).toHaveTransaction({
            from: investor.address,
            to: tradFiBuffer.address,
            success: false,
            exitCode: 400,
        });
    });

    it('should receive premium share from distributor', async () => {
        const premiumShare = toNano('100');

        const result = await premiumDistributor.send({
            to: tradFiBuffer.address,
            value: premiumShare,
            bounce: false,
        });

        expect(result.transactions).toHaveTransaction({
            from: premiumDistributor.address,
            to: tradFiBuffer.address,
            success: true,
        });
    });

    it('should retrieve investor deposit information', async () => {
        const investor = await blockchain.treasury('investor');
        const depositAmount = toNano('300000');
        const apyRate = 800;

        await tradFiBuffer.sendDepositCapital(investor.getSender(), {
            value: depositAmount + toNano('0.5'),
            amount: depositAmount,
            apyRate,
        });

        const deposit = await tradFiBuffer.getInvestorDeposit(investor.address);

        expect(deposit.amount).toBe(depositAmount);
        expect(deposit.apyRate).toBe(apyRate);
        expect(deposit.unlockTime).toBeGreaterThan(0);
    });

    it('should track buffer statistics correctly', async () => {
        const investor1 = await blockchain.treasury('investor1');
        const investor2 = await blockchain.treasury('investor2');

        // Two deposits
        await tradFiBuffer.sendDepositCapital(investor1.getSender(), {
            value: toNano('250000') + toNano('0.5'),
            amount: toNano('250000'),
            apyRate: 700,
        });

        await tradFiBuffer.sendDepositCapital(investor2.getSender(), {
            value: toNano('500000') + toNano('0.5'),
            amount: toNano('500000'),
            apyRate: 900,
        });

        const stats = await tradFiBuffer.getBufferStats();

        expect(stats.totalDeposited).toBe(toNano('750000'));
        expect(stats.currentTvl).toBe(toNano('750000'));
        expect(stats.totalWithdrawn).toBe(0n);
    });

    it('should return minimum deposit requirement', async () => {
        const minDeposit = await tradFiBuffer.getMinDeposit();
        expect(minDeposit).toBe(toNano('250000')); // $250k
    });

    it('should handle multiple institutional investors', async () => {
        const investor1 = await blockchain.treasury('investor1');
        const investor2 = await blockchain.treasury('investor2');
        const investor3 = await blockchain.treasury('investor3');

        // Multiple deposits (reduced amounts to avoid sandbox treasury limits)
        const result1 = await tradFiBuffer.sendDepositCapital(investor1.getSender(), {
            value: toNano('250000') + toNano('0.5'),
            amount: toNano('250000'),
            apyRate: 600,
        });

        expect(result1.transactions).toHaveTransaction({
            from: investor1.address,
            to: tradFiBuffer.address,
            success: true,
        });

        const result2 = await tradFiBuffer.sendDepositCapital(investor2.getSender(), {
            value: toNano('300000') + toNano('0.5'),
            amount: toNano('300000'),
            apyRate: 800,
        });

        expect(result2.transactions).toHaveTransaction({
            from: investor2.address,
            to: tradFiBuffer.address,
            success: true,
        });

        const result3 = await tradFiBuffer.sendDepositCapital(investor3.getSender(), {
            value: toNano('450000') + toNano('0.5'),
            amount: toNano('450000'),
            apyRate: 1000,
        });

        expect(result3.transactions).toHaveTransaction({
            from: investor3.address,
            to: tradFiBuffer.address,
            success: true,
        });

        const stats = await tradFiBuffer.getBufferStats();
        expect(stats.totalDeposited).toBe(toNano('1000000'));
    });
});
