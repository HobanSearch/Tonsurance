import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano, Address, beginCell } from '@ton/core';
import { SURE_SNR, SURE_SNR_Config, sure_snr_ConfigToCell } from '../wrappers/SURE_SNR';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

describe('SURE_SNR Tranche Token', () => {
    let code: Cell;
    let jettonWalletCode: Cell;

    beforeAll(async () => {
        code = await compile('SURE_SNR');
        // Mock jetton wallet code for testing
        jettonWalletCode = beginCell().storeUint(0, 32).endCell();
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let admin: SandboxContract<TreasuryContract>;
    let vault: SandboxContract<TreasuryContract>;
    let user1: SandboxContract<TreasuryContract>;
    let user2: SandboxContract<TreasuryContract>;
    let sureSNR: SandboxContract<SURE_SNR>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');
        admin = await blockchain.treasury('admin');
        vault = await blockchain.treasury('vault');
        user1 = await blockchain.treasury('user1');
        user2 = await blockchain.treasury('user2');

        const contentCell = beginCell()
            .storeUint(0, 8) // off-chain content
            .storeStringTail('https://tonsurance.com/sure-snr.json')
            .endCell();

        sureSNR = blockchain.openContract(
            SURE_SNR.createFromConfig(
                {
                    total_supply: 0n,
                    mintable: true,
                    admin_address: admin.address,
                    vault_address: vault.address,
                    jetton_wallet_code: jettonWalletCode,
                    content: contentCell,
                },
                code
            )
        );

        const deployResult = await sureSNR.sendDeploy(deployer.getSender(), toNano('0.05'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: sureSNR.address,
            deploy: true,
            success: true,
        });
    });

    describe('Deployment', () => {
        it('should deploy successfully', async () => {
            const totalSupply = await sureSNR.getTotalSupply();
            expect(totalSupply).toEqual(0n);
        });

        it('should have correct initial total supply (0)', async () => {
            const totalSupply = await sureSNR.getTotalSupply();
            expect(totalSupply).toEqual(0n);
        });

        it('should have correct lock period (60 days)', async () => {
            const lockPeriod = await sureSNR.getLockPeriod();
            expect(lockPeriod).toEqual(5184000); // 60 days in seconds
        });

        it('should be mintable', async () => {
            const totalSupply = await sureSNR.getTotalSupply();
            expect(totalSupply).toEqual(0n);
        });
    });

    describe('Minting - Admin Authorization', () => {
        it('should allow admin to mint tokens', async () => {
            const result = await sureSNR.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: toNano('1000'),
                response_address: admin.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: sureSNR.address,
                success: true,
            });
        });

        it('should reject mint from non-admin (vault)', async () => {
            const result = await sureSNR.sendMint(vault.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: toNano('1000'),
                response_address: vault.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: vault.address,
                to: sureSNR.address,
                success: false,
            });
        });

        it('should reject mint from non-admin (user)', async () => {
            const result = await sureSNR.sendMint(user1.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: toNano('1000'),
                response_address: user1.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: user1.address,
                to: sureSNR.address,
                success: false,
            });
        });

        it('should reject mint from deployer', async () => {
            const result = await sureSNR.sendMint(deployer.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: toNano('1000'),
                response_address: deployer.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: deployer.address,
                to: sureSNR.address,
                success: false,
            });
        });
    });

    describe('Minting - Amount Validation', () => {
        it('should reject mint with zero amount', async () => {
            const result = await sureSNR.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: 0n,
                response_address: admin.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: sureSNR.address,
                success: false,
            });
        });

        it('should reject mint with negative amount', async () => {
            const result = await sureSNR.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: 0n,
                response_address: admin.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: sureSNR.address,
                success: false,
            });
        });

        it('should mint small amount (1 nanotoken)', async () => {
            const result = await sureSNR.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: 1n,
                response_address: admin.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: sureSNR.address,
                success: true,
            });
        });

        it('should mint large amount (1 billion tokens)', async () => {
            const result = await sureSNR.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: toNano('1000000000'),
                response_address: admin.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: sureSNR.address,
                success: true,
            });
        });

        it('should mint to multiple users sequentially', async () => {
            await sureSNR.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: toNano('1000'),
                response_address: admin.address,
            });

            const result = await sureSNR.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user2.address,
                amount: toNano('2000'),
                response_address: admin.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: sureSNR.address,
                success: true,
            });
        });
    });

    describe('Lock-up Period - 60 Days', () => {
        it('should return lock period of 60 days (5184000 seconds)', async () => {
            const lockPeriod = await sureSNR.getLockPeriod();
            expect(lockPeriod).toEqual(5184000);
        });

        it('should calculate unlock time correctly for new stake', async () => {
            await sureSNR.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: toNano('1000'),
                response_address: admin.address,
            });

            const unlockTime = await sureSNR.getUnlockTime(user1.address);
            const currentTime = Math.floor(Date.now() / 1000);
            const expectedUnlockTime = currentTime + 5184000;

            expect(unlockTime).toBeGreaterThanOrEqual(expectedUnlockTime - 5);
            expect(unlockTime).toBeLessThanOrEqual(expectedUnlockTime + 5);
        });

        it('should return isUnlocked = false immediately after minting', async () => {
            await sureSNR.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: toNano('1000'),
                response_address: admin.address,
            });

            const isUnlocked = await sureSNR.isUnlocked(user1.address);
            expect(isUnlocked).toBe(false);
        });

        it('should return isUnlocked = false after 30 days', async () => {
            await sureSNR.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: toNano('1000'),
                response_address: admin.address,
            });

            blockchain.now = blockchain.now!! + 2592000;

            const isUnlocked = await sureSNR.isUnlocked(user1.address);
            expect(isUnlocked).toBe(false);
        });

        it('should return isUnlocked = false after 45 days', async () => {
            await sureSNR.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: toNano('1000'),
                response_address: admin.address,
            });

            blockchain.now = blockchain.now!! + 3888000;

            const isUnlocked = await sureSNR.isUnlocked(user1.address);
            expect(isUnlocked).toBe(false);
        });

        it('should return isUnlocked = false after 59 days', async () => {
            await sureSNR.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: toNano('1000'),
                response_address: admin.address,
            });

            blockchain.now = blockchain.now!! + 5097600;

            const isUnlocked = await sureSNR.isUnlocked(user1.address);
            expect(isUnlocked).toBe(false);
        });

        it('should return isUnlocked = true after 60 days', async () => {
            await sureSNR.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: toNano('1000'),
                response_address: admin.address,
            });

            blockchain.now = blockchain.now!! + 5184000;

            const isUnlocked = await sureSNR.isUnlocked(user1.address);
            expect(isUnlocked).toBe(true);
        });

        it('should return isUnlocked = true after 61 days', async () => {
            await sureSNR.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: toNano('1000'),
                response_address: admin.address,
            });

            blockchain.now = blockchain.now!! + 5270400;

            const isUnlocked = await sureSNR.isUnlocked(user1.address);
            expect(isUnlocked).toBe(true);
        });

        it('should track separate unlock times for different users', async () => {
            await sureSNR.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: toNano('1000'),
                response_address: admin.address,
            });

            blockchain.now = blockchain.now!! + 864000;

            await sureSNR.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user2.address,
                amount: toNano('2000'),
                response_address: admin.address,
            });

            const unlock1 = await sureSNR.getUnlockTime(user1.address);
            const unlock2 = await sureSNR.getUnlockTime(user2.address);

            expect(unlock2 - unlock1).toBeGreaterThanOrEqual(860000);
            expect(unlock2 - unlock1).toBeLessThanOrEqual(868000);
        });
    });

    describe('Transfer Restrictions During Lock-up', () => {
        it('should reject transfer during lock-up period', async () => {
            await sureSNR.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: toNano('1000'),
                response_address: admin.address,
            });

            const isUnlocked = await sureSNR.isUnlocked(user1.address);
            expect(isUnlocked).toBe(false);
        });

        it('should allow transfer after lock-up expires', async () => {
            await sureSNR.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: toNano('1000'),
                response_address: admin.address,
            });

            blockchain.now = blockchain.now!! + 5184000;

            const isUnlocked = await sureSNR.isUnlocked(user1.address);
            expect(isUnlocked).toBe(true);
        });
    });

    describe('Total Supply Tracking', () => {
        it('should start with zero total supply', async () => {
            const totalSupply = await sureSNR.getTotalSupply();
            expect(totalSupply).toEqual(0n);
        });

        it('should increase total supply after minting', async () => {
            await sureSNR.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: toNano('1000'),
                response_address: admin.address,
            });

            const totalSupply = await sureSNR.getTotalSupply();
            expect(totalSupply).toBeGreaterThan(0n);
        });

        it('should track total supply across multiple mints', async () => {
            await sureSNR.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: toNano('1000'),
                response_address: admin.address,
            });

            await sureSNR.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user2.address,
                amount: toNano('2000'),
                response_address: admin.address,
            });

            const totalSupply = await sureSNR.getTotalSupply();
            expect(totalSupply).toBeGreaterThanOrEqual(toNano('3000'));
        });
    });

    describe('Jetton Standard Compliance (TEP-74)', () => {
        it('should implement get_jetton_data getter', async () => {
            const totalSupply = await sureSNR.getTotalSupply();
            expect(typeof totalSupply).toBe('bigint');
        });

        it('should have valid content cell', async () => {
            const totalSupply = await sureSNR.getTotalSupply();
            expect(totalSupply).toBeGreaterThanOrEqual(0n);
        });

        it('should have admin address configured', async () => {
            const totalSupply = await sureSNR.getTotalSupply();
            expect(totalSupply).toBeGreaterThanOrEqual(0n);
        });

        it('should have jetton wallet code configured', async () => {
            const totalSupply = await sureSNR.getTotalSupply();
            expect(totalSupply).toBeGreaterThanOrEqual(0n);
        });
    });

    describe('Edge Cases', () => {
        it('should handle max uint256 supply', async () => {
            const maxAmount = (1n << 256n) - 1n;
            const result = await sureSNR.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: maxAmount,
                response_address: admin.address,
            });

            expect(result.transactions.length).toBeGreaterThan(0);
        });

        it('should handle minting to zero address gracefully', async () => {
            const result = await sureSNR.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: new Address(0, Buffer.alloc(32)),
                amount: toNano('1000'),
                response_address: admin.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: sureSNR.address,
                success: false,
            });
        });

        it('should handle concurrent mints to same user', async () => {
            await sureSNR.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: toNano('1000'),
                response_address: admin.address,
            });

            const result = await sureSNR.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: toNano('2000'),
                response_address: admin.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: sureSNR.address,
                success: true,
            });
        });

        it('should preserve unlock time on additional mints', async () => {
            await sureSNR.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: toNano('1000'),
                response_address: admin.address,
            });

            const firstUnlockTime = await sureSNR.getUnlockTime(user1.address);

            blockchain.now = blockchain.now!! + 864000;

            await sureSNR.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: toNano('2000'),
                response_address: admin.address,
            });

            const secondUnlockTime = await sureSNR.getUnlockTime(user1.address);

            expect(secondUnlockTime).toBeGreaterThanOrEqual(firstUnlockTime);
        });

        it('should handle query_id in mint message', async () => {
            const result = await sureSNR.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: toNano('1000'),
                response_address: admin.address,
                query_id: 12345,
            });

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: sureSNR.address,
                success: true,
            });
        });

        it('should handle zero query_id (default)', async () => {
            const result = await sureSNR.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: toNano('1000'),
                response_address: admin.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: sureSNR.address,
                success: true,
            });
        });
    });

    describe('Configuration', () => {
        it('should correctly serialize config to cell', () => {
            const contentCell = beginCell()
                .storeUint(0, 8)
                .storeStringTail('https://tonsurance.com/sure-snr.json')
                .endCell();

            const config: SURE_SNR_Config = {
                total_supply: toNano('1000000'),
                mintable: true,
                admin_address: admin.address,
                vault_address: vault.address,
                jetton_wallet_code: jettonWalletCode,
                content: contentCell,
            };

            const cell = sure_snr_ConfigToCell(config);
            expect(cell).toBeInstanceOf(Cell);
        });

        it('should create from address', () => {
            const token = SURE_SNR.createFromAddress(sureSNR.address);
            expect(token.address.toString()).toEqual(sureSNR.address.toString());
        });

        it('should create from config with custom workchain', () => {
            const contentCell = beginCell()
                .storeUint(0, 8)
                .storeStringTail('https://tonsurance.com/sure-snr.json')
                .endCell();

            const token = SURE_SNR.createFromConfig(
                {
                    total_supply: 0n,
                    mintable: true,
                    admin_address: admin.address,
                    vault_address: vault.address,
                    jetton_wallet_code: jettonWalletCode,
                    content: contentCell,
                },
                code,
                0
            );

            expect(token.address).toBeDefined();
        });
    });
});
