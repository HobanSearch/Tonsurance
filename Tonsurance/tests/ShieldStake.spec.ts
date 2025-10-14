import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano, beginCell } from '@ton/core';
import { ShieldStake } from '../wrappers/ShieldStake';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

describe('ShieldStake', () => {
    let code: Cell;
    let walletCode: Cell;

    beforeAll(async () => {
        code = await compile('ShieldStake');
        walletCode = await compile('JettonWallet');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let shieldStake: SandboxContract<ShieldStake>;
    let secondaryVault: SandboxContract<TreasuryContract>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');
        secondaryVault = await blockchain.treasury('secondaryVault');

        const content = beginCell()
            .storeUint(0, 8)
            .storeStringTail('https://tonsurance.com/shieldstake.json')
            .endCell();

        shieldStake = blockchain.openContract(
            ShieldStake.createFromConfig(
                {
                    totalSupply: 0n,
                    mintable: true,
                    adminAddress: deployer.address,
                    secondaryVaultAddress: secondaryVault.address,
                    jettonWalletCode: walletCode,
                    content,
                },
                code
            )
        );

        const deployResult = await shieldStake.sendDeploy(deployer.getSender(), toNano('0.05'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: shieldStake.address,
            deploy: true,
            success: true,
        });
    });

    it('should deploy successfully', async () => {
        // Deployment tested in beforeEach
    });

    it('should have correct initial jetton data', async () => {
        const jettonData = await shieldStake.getJettonData();

        expect(jettonData.totalSupply).toBe(0n);
        expect(jettonData.mintable).toBe(true);
        expect(jettonData.adminAddress.equals(deployer.address)).toBe(true);
    });

    it('should mint with 90-day lock', async () => {
        const staker = await blockchain.treasury('staker');
        const mintAmount = toNano('1000');
        const lockDuration = 90; // days

        const result = await shieldStake.sendMint(secondaryVault.getSender(), {
            value: toNano('0.5'),
            queryId: 1n,
            toAddress: staker.address,
            amount: mintAmount,
            responseAddress: secondaryVault.address,
            lockDuration,
        });

        expect(result.transactions).toHaveTransaction({
            from: secondaryVault.address,
            to: shieldStake.address,
            success: true,
        });

        const jettonData = await shieldStake.getJettonData();
        expect(jettonData.totalSupply).toBe(mintAmount);
    });

    it('should track unlock time correctly', async () => {
        const staker = await blockchain.treasury('staker');
        const lockDuration = 90;

        const currentTime = blockchain.now || Math.floor(Date.now() / 1000);

        await shieldStake.sendMint(secondaryVault.getSender(), {
            value: toNano('0.5'),
            queryId: 1n,
            toAddress: staker.address,
            amount: toNano('1000'),
            responseAddress: secondaryVault.address,
            lockDuration,
        });

        const unlockTime = await shieldStake.getUnlockTime(staker.address);
        const expectedUnlockTime = currentTime + (lockDuration * 86400); // 90 days in seconds

        // Allow 10 second tolerance for test execution time
        expect(Math.abs(unlockTime - expectedUnlockTime)).toBeLessThan(10);
    });

    it('should report locked status during lock period', async () => {
        const staker = await blockchain.treasury('staker');

        await shieldStake.sendMint(secondaryVault.getSender(), {
            value: toNano('0.5'),
            queryId: 1n,
            toAddress: staker.address,
            amount: toNano('1000'),
            responseAddress: secondaryVault.address,
            lockDuration: 90,
        });

        const isUnlocked = await shieldStake.isUnlocked(staker.address);
        expect(isUnlocked).toBe(false);
    });

    it('should report unlocked status after lock period', async () => {
        const staker = await blockchain.treasury('staker');

        await shieldStake.sendMint(secondaryVault.getSender(), {
            value: toNano('0.5'),
            queryId: 1n,
            toAddress: staker.address,
            amount: toNano('1000'),
            responseAddress: secondaryVault.address,
            lockDuration: 90,
        });

        // Fast-forward time by 91 days
        blockchain.now = (blockchain.now || Math.floor(Date.now() / 1000)) + (91 * 86400);

        const isUnlocked = await shieldStake.isUnlocked(staker.address);
        expect(isUnlocked).toBe(true);
    });

    it('should enforce 90-day lock period constant', async () => {
        const staker = await blockchain.treasury('staker');
        const lockDuration = 90;

        await shieldStake.sendMint(secondaryVault.getSender(), {
            value: toNano('0.5'),
            queryId: 1n,
            toAddress: staker.address,
            amount: toNano('1000'),
            responseAddress: secondaryVault.address,
            lockDuration,
        });

        const unlockTime = await shieldStake.getUnlockTime(staker.address);
        const currentTime = blockchain.now || Math.floor(Date.now() / 1000);

        const lockPeriodSeconds = unlockTime - currentTime;
        const lockPeriodDays = lockPeriodSeconds / 86400;

        // Should be approximately 90 days
        expect(Math.abs(lockPeriodDays - 90)).toBeLessThan(1);
    });

    it('should reject minting from non-vault address', async () => {
        const attacker = await blockchain.treasury('attacker');
        const staker = await blockchain.treasury('staker');

        const result = await shieldStake.sendMint(attacker.getSender(), {
            value: toNano('0.5'),
            queryId: 1n,
            toAddress: staker.address,
            amount: toNano('1000'),
            responseAddress: attacker.address,
            lockDuration: 90,
        });

        expect(result.transactions).toHaveTransaction({
            from: attacker.address,
            to: shieldStake.address,
            success: false,
            exitCode: 403, // Unauthorized
        });
    });

    it('should update total supply when minting', async () => {
        const staker1 = await blockchain.treasury('staker1');
        const staker2 = await blockchain.treasury('staker2');

        await shieldStake.sendMint(secondaryVault.getSender(), {
            value: toNano('0.5'),
            queryId: 1n,
            toAddress: staker1.address,
            amount: toNano('1000'),
            responseAddress: secondaryVault.address,
            lockDuration: 90,
        });

        await shieldStake.sendMint(secondaryVault.getSender(), {
            value: toNano('0.5'),
            queryId: 2n,
            toAddress: staker2.address,
            amount: toNano('2000'),
            responseAddress: secondaryVault.address,
            lockDuration: 90,
        });

        const totalSupply = await shieldStake.getTotalSupply();
        expect(totalSupply).toBe(toNano('3000'));
    });

    it('should retrieve secondary vault address', async () => {
        const vaultAddress = await shieldStake.getSecondaryVault();
        expect(vaultAddress.equals(secondaryVault.address)).toBe(true);
    });

    it('should calculate wallet address for staker', async () => {
        const staker = await blockchain.treasury('staker');
        const walletAddress = await shieldStake.getWalletAddress(staker.address);

        expect(walletAddress).toBeDefined();
        expect(walletAddress.toString()).toMatch(/^[0-9A-Za-z_-]{48}$/);
    });

    it('should create separate wallets for different stakers', async () => {
        const staker1 = await blockchain.treasury('staker1');
        const staker2 = await blockchain.treasury('staker2');

        const wallet1 = await shieldStake.getWalletAddress(staker1.address);
        const wallet2 = await shieldStake.getWalletAddress(staker2.address);

        expect(wallet1.equals(wallet2)).toBe(false);
    });

    it('should handle multiple stakes with independent lock periods', async () => {
        const staker1 = await blockchain.treasury('staker1');
        const staker2 = await blockchain.treasury('staker2');
        const staker3 = await blockchain.treasury('staker3');

        const currentTime = blockchain.now || Math.floor(Date.now() / 1000);

        await shieldStake.sendMint(secondaryVault.getSender(), {
            value: toNano('0.5'),
            queryId: 1n,
            toAddress: staker1.address,
            amount: toNano('500'),
            responseAddress: secondaryVault.address,
            lockDuration: 90,
        });

        // Advance time by 1 day
        blockchain.now = currentTime + 86400;

        await shieldStake.sendMint(secondaryVault.getSender(), {
            value: toNano('0.5'),
            queryId: 2n,
            toAddress: staker2.address,
            amount: toNano('1500'),
            responseAddress: secondaryVault.address,
            lockDuration: 90,
        });

        // Advance time by another day
        blockchain.now = currentTime + (2 * 86400);

        await shieldStake.sendMint(secondaryVault.getSender(), {
            value: toNano('0.5'),
            queryId: 3n,
            toAddress: staker3.address,
            amount: toNano('2000'),
            responseAddress: secondaryVault.address,
            lockDuration: 90,
        });

        const totalSupply = await shieldStake.getTotalSupply();
        expect(totalSupply).toBe(toNano('4000'));

        const unlock1 = await shieldStake.getUnlockTime(staker1.address);
        const unlock2 = await shieldStake.getUnlockTime(staker2.address);
        const unlock3 = await shieldStake.getUnlockTime(staker3.address);

        // Each stake should have different unlock times
        expect(unlock1).toBeLessThan(unlock2);
        expect(unlock2).toBeLessThan(unlock3);
    });

    it('should have mintable flag set correctly', async () => {
        const jettonData = await shieldStake.getJettonData();
        expect(jettonData.mintable).toBe(true);
    });
});
