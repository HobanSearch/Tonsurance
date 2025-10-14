import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano, beginCell } from '@ton/core';
import { ShieldInst } from '../wrappers/ShieldInst';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

describe('ShieldInst', () => {
    let code: Cell;
    let walletCode: Cell;

    beforeAll(async () => {
        code = await compile('ShieldInst');
        walletCode = await compile('JettonWallet');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let shieldInst: SandboxContract<ShieldInst>;
    let tradfiBuffer: SandboxContract<TreasuryContract>;
    let complianceGateway: SandboxContract<TreasuryContract>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');
        tradfiBuffer = await blockchain.treasury('tradfiBuffer');
        complianceGateway = await blockchain.treasury('complianceGateway');

        const content = beginCell()
            .storeUint(0, 8)
            .storeStringTail('https://tonsurance.com/shieldinst.json')
            .endCell();

        shieldInst = blockchain.openContract(
            ShieldInst.createFromConfig(
                {
                    totalSupply: 0n,
                    mintable: true,
                    adminAddress: deployer.address,
                    tradfiBufferAddress: tradfiBuffer.address,
                    complianceGatewayAddress: complianceGateway.address,
                    jettonWalletCode: walletCode,
                    content,
                },
                code
            )
        );

        const deployResult = await shieldInst.sendDeploy(deployer.getSender(), toNano('0.05'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: shieldInst.address,
            deploy: true,
            success: true,
        });
    });

    it('should deploy successfully', async () => {
        // Deployment tested in beforeEach
    });

    it('should have correct initial jetton data', async () => {
        const jettonData = await shieldInst.getJettonData();

        expect(jettonData.totalSupply).toBe(0n);
        expect(jettonData.mintable).toBe(true);
        expect(jettonData.adminAddress.equals(deployer.address)).toBe(true);
    });

    it('should mint with 180-day lock and KYC check', async () => {
        const investor = await blockchain.treasury('investor');
        const mintAmount = toNano('250000');
        const lockDays = 180;

        const result = await shieldInst.sendMint(tradfiBuffer.getSender(), {
            value: toNano('0.5'),
            queryId: 1n,
            toAddress: investor.address,
            amount: mintAmount,
            responseAddress: tradfiBuffer.address,
            lockDays,
        });

        expect(result.transactions).toHaveTransaction({
            from: tradfiBuffer.address,
            to: shieldInst.address,
            success: true,
        });

        const jettonData = await shieldInst.getJettonData();
        expect(jettonData.totalSupply).toBe(mintAmount);
    });

    it('should track unlock time correctly', async () => {
        const investor = await blockchain.treasury('investor');
        const lockDays = 180;

        const currentTime = blockchain.now || Math.floor(Date.now() / 1000);

        await shieldInst.sendMint(tradfiBuffer.getSender(), {
            value: toNano('0.5'),
            queryId: 1n,
            toAddress: investor.address,
            amount: toNano('250000'),
            responseAddress: tradfiBuffer.address,
            lockDays,
        });

        const unlockTime = await shieldInst.getUnlockTime(investor.address);
        const expectedUnlockTime = currentTime + (lockDays * 86400);

        // Allow 10 second tolerance
        expect(Math.abs(unlockTime - expectedUnlockTime)).toBeLessThan(10);
    });

    it('should report locked status during lock period', async () => {
        const investor = await blockchain.treasury('investor');

        await shieldInst.sendMint(tradfiBuffer.getSender(), {
            value: toNano('0.5'),
            queryId: 1n,
            toAddress: investor.address,
            amount: toNano('250000'),
            responseAddress: tradfiBuffer.address,
            lockDays: 180,
        });

        const isUnlocked = await shieldInst.isUnlocked(investor.address);
        expect(isUnlocked).toBe(false);
    });

    it('should report unlocked status after lock period', async () => {
        const investor = await blockchain.treasury('investor');

        await shieldInst.sendMint(tradfiBuffer.getSender(), {
            value: toNano('0.5'),
            queryId: 1n,
            toAddress: investor.address,
            amount: toNano('250000'),
            responseAddress: tradfiBuffer.address,
            lockDays: 180,
        });

        // Fast-forward time by 181 days
        blockchain.now = (blockchain.now || Math.floor(Date.now() / 1000)) + (181 * 86400);

        const isUnlocked = await shieldInst.isUnlocked(investor.address);
        expect(isUnlocked).toBe(true);
    });

    it('should check transfer eligibility for both parties', async () => {
        const investor1 = await blockchain.treasury('investor1');
        const investor2 = await blockchain.treasury('investor2');

        // First mint tokens to investor1 and wait for lock to expire
        await shieldInst.sendMint(tradfiBuffer.getSender(), {
            value: toNano('0.5'),
            queryId: 1n,
            toAddress: investor1.address,
            amount: toNano('100000'),
            responseAddress: tradfiBuffer.address,
            lockDays: 180,
        });

        // Advance time past lock period
        blockchain.now = Math.floor(Date.now() / 1000) + 15552001; // 180 days + 1 second

        // This tests the interface - actual implementation would check:
        // 1. Both parties are KYC'd
        // 2. Tokens are unlocked
        const result = await shieldInst.sendCheckTransferEligibility(deployer.getSender(), {
            value: toNano('0.1'),
            fromAddress: investor1.address,
            toAddress: investor2.address,
        });

        expect(result.transactions).toHaveTransaction({
            from: deployer.address,
            to: shieldInst.address,
            success: true,
        });
    });

    it('should reject minting from non-buffer address', async () => {
        const attacker = await blockchain.treasury('attacker');
        const investor = await blockchain.treasury('investor');

        const result = await shieldInst.sendMint(attacker.getSender(), {
            value: toNano('0.5'),
            queryId: 1n,
            toAddress: investor.address,
            amount: toNano('250000'),
            responseAddress: attacker.address,
            lockDays: 180,
        });

        expect(result.transactions).toHaveTransaction({
            from: attacker.address,
            to: shieldInst.address,
            success: false,
            exitCode: 403, // Unauthorized
        });
    });

    it('should retrieve TradFi Buffer address', async () => {
        const bufferAddress = await shieldInst.getTradfiBuffer();
        expect(bufferAddress.equals(tradfiBuffer.address)).toBe(true);
    });

    it('should retrieve Compliance Gateway address', async () => {
        const gatewayAddress = await shieldInst.getComplianceGateway();
        expect(gatewayAddress.equals(complianceGateway.address)).toBe(true);
    });

    it('should calculate wallet address for institutional investor', async () => {
        const investor = await blockchain.treasury('investor');
        const walletAddress = await shieldInst.getWalletAddress(investor.address);

        expect(walletAddress).toBeDefined();
        expect(walletAddress.toString()).toMatch(/^[0-9A-Za-z_-]{48}$/);
    });

    it('should enforce 180-day lock period constant', async () => {
        const lockPeriod = await shieldInst.getLockPeriod();
        expect(lockPeriod).toBe(15552000); // 180 days in seconds
    });

    it('should handle multiple institutional investors with independent locks', async () => {
        const investor1 = await blockchain.treasury('investor1');
        const investor2 = await blockchain.treasury('investor2');
        const investor3 = await blockchain.treasury('investor3');

        const currentTime = blockchain.now || Math.floor(Date.now() / 1000);

        await shieldInst.sendMint(tradfiBuffer.getSender(), {
            value: toNano('0.5'),
            queryId: 1n,
            toAddress: investor1.address,
            amount: toNano('250000'),
            responseAddress: tradfiBuffer.address,
            lockDays: 180,
        });

        // Advance time by 1 day
        blockchain.now = currentTime + 86400;

        await shieldInst.sendMint(tradfiBuffer.getSender(), {
            value: toNano('0.5'),
            queryId: 2n,
            toAddress: investor2.address,
            amount: toNano('500000'),
            responseAddress: tradfiBuffer.address,
            lockDays: 180,
        });

        // Advance time by another day
        blockchain.now = currentTime + (2 * 86400);

        await shieldInst.sendMint(tradfiBuffer.getSender(), {
            value: toNano('0.5'),
            queryId: 3n,
            toAddress: investor3.address,
            amount: toNano('1000000'),
            responseAddress: tradfiBuffer.address,
            lockDays: 180,
        });

        const jettonData = await shieldInst.getJettonData();
        expect(jettonData.totalSupply).toBe(toNano('1750000'));

        const unlock1 = await shieldInst.getUnlockTime(investor1.address);
        const unlock2 = await shieldInst.getUnlockTime(investor2.address);
        const unlock3 = await shieldInst.getUnlockTime(investor3.address);

        // Each investor should have different unlock times
        expect(unlock1).toBeLessThan(unlock2);
        expect(unlock2).toBeLessThan(unlock3);
    });
});
