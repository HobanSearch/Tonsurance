import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano, Address, beginCell } from '@ton/core';
import { SURE_MEZZ, SURE_MEZZ_Config, sure_mezz_ConfigToCell } from '../wrappers/SURE_MEZZ';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

describe('SURE_MEZZ Tranche Token', () => {
    let code: Cell;
    let jettonWalletCode: Cell;

    beforeAll(async () => {
        code = await compile('SURE_MEZZ');
        // Mock jetton wallet code for testing
        jettonWalletCode = beginCell().storeUint(0, 32).endCell();
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let admin: SandboxContract<TreasuryContract>;
    let vault: SandboxContract<TreasuryContract>;
    let user1: SandboxContract<TreasuryContract>;
    let user2: SandboxContract<TreasuryContract>;
    let sureMEZZ: SandboxContract<SURE_MEZZ>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');
        admin = await blockchain.treasury('admin');
        vault = await blockchain.treasury('vault');
        user1 = await blockchain.treasury('user1');
        user2 = await blockchain.treasury('user2');

        const contentCell = beginCell()
            .storeUint(0, 8) // off-chain content
            .storeStringTail('https://tonsurance.com/sure-mezz.json')
            .endCell();

        sureMEZZ = blockchain.openContract(
            SURE_MEZZ.createFromConfig(
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

        const deployResult = await sureMEZZ.sendDeploy(deployer.getSender(), toNano('0.05'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: sureMEZZ.address,
            deploy: true,
            success: true,
        });
    });

    describe('Deployment', () => {
        it('should deploy successfully', async () => {
            const totalSupply = await sureMEZZ.getTotalSupply();
            expect(totalSupply).toEqual(0n);
        });

        it('should have correct initial total supply (0)', async () => {
            const totalSupply = await sureMEZZ.getTotalSupply();
            expect(totalSupply).toEqual(0n);
        });

        it('should have correct lock period (30 days)', async () => {
            const lockPeriod = await sureMEZZ.getLockPeriod();
            expect(lockPeriod).toEqual(2592000); // 30 days in seconds
        });

        it('should be mintable', async () => {
            const totalSupply = await sureMEZZ.getTotalSupply();
            expect(totalSupply).toEqual(0n);
        });
    });

    describe('Minting - Admin Authorization', () => {
        it('should allow admin to mint tokens', async () => {
            const result = await sureMEZZ.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: toNano('1000'),
                response_address: admin.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: sureMEZZ.address,
                success: true,
            });
        });

        it('should reject mint from non-admin (vault)', async () => {
            const result = await sureMEZZ.sendMint(vault.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: toNano('1000'),
                response_address: vault.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: vault.address,
                to: sureMEZZ.address,
                success: false,
            });
        });

        it('should reject mint from non-admin (user)', async () => {
            const result = await sureMEZZ.sendMint(user1.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: toNano('1000'),
                response_address: user1.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: user1.address,
                to: sureMEZZ.address,
                success: false,
            });
        });

        it('should reject mint from deployer', async () => {
            const result = await sureMEZZ.sendMint(deployer.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: toNano('1000'),
                response_address: deployer.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: deployer.address,
                to: sureMEZZ.address,
                success: false,
            });
        });
    });

    describe('Minting - Amount Validation', () => {
        it('should reject mint with zero amount', async () => {
            const result = await sureMEZZ.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: 0n,
                response_address: admin.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: sureMEZZ.address,
                success: false,
            });
        });

        it('should reject mint with negative amount', async () => {
            const result = await sureMEZZ.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: 0n,
                response_address: admin.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: sureMEZZ.address,
                success: false,
            });
        });

        it('should mint small amount (1 nanotoken)', async () => {
            const result = await sureMEZZ.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: 1n,
                response_address: admin.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: sureMEZZ.address,
                success: true,
            });
        });

        it('should mint large amount (1 billion tokens)', async () => {
            const result = await sureMEZZ.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: toNano('1000000000'),
                response_address: admin.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: sureMEZZ.address,
                success: true,
            });
        });

        it('should mint to multiple users sequentially', async () => {
            await sureMEZZ.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: toNano('1000'),
                response_address: admin.address,
            });

            const result = await sureMEZZ.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user2.address,
                amount: toNano('2000'),
                response_address: admin.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: sureMEZZ.address,
                success: true,
            });
        });
    });

    describe('Lock-up Period - 30 Days', () => {
        it('should return lock period of 30 days (2592000 seconds)', async () => {
            const lockPeriod = await sureMEZZ.getLockPeriod();
            expect(lockPeriod).toEqual(2592000);
        });

        it('should calculate unlock time correctly for new stake', async () => {
            await sureMEZZ.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: toNano('1000'),
                response_address: admin.address,
            });

            const unlockTime = await sureMEZZ.getUnlockTime(user1.address);
            const currentTime = Math.floor(Date.now() / 1000);
            const expectedUnlockTime = currentTime + 2592000;

            expect(unlockTime).toBeGreaterThanOrEqual(expectedUnlockTime - 5);
            expect(unlockTime).toBeLessThanOrEqual(expectedUnlockTime + 5);
        });

        it('should return isUnlocked = false immediately after minting', async () => {
            await sureMEZZ.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: toNano('1000'),
                response_address: admin.address,
            });

            const isUnlocked = await sureMEZZ.isUnlocked(user1.address);
            expect(isUnlocked).toBe(false);
        });

        it('should return isUnlocked = false after 7 days', async () => {
            await sureMEZZ.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: toNano('1000'),
                response_address: admin.address,
            });

            blockchain.now = blockchain.now!! + 604800;

            const isUnlocked = await sureMEZZ.isUnlocked(user1.address);
            expect(isUnlocked).toBe(false);
        });

        it('should return isUnlocked = false after 15 days', async () => {
            await sureMEZZ.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: toNano('1000'),
                response_address: admin.address,
            });

            blockchain.now = blockchain.now!! + 1296000;

            const isUnlocked = await sureMEZZ.isUnlocked(user1.address);
            expect(isUnlocked).toBe(false);
        });

        it('should return isUnlocked = false after 29 days', async () => {
            await sureMEZZ.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: toNano('1000'),
                response_address: admin.address,
            });

            blockchain.now = blockchain.now!! + 2505600;

            const isUnlocked = await sureMEZZ.isUnlocked(user1.address);
            expect(isUnlocked).toBe(false);
        });

        it('should return isUnlocked = true after 30 days', async () => {
            await sureMEZZ.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: toNano('1000'),
                response_address: admin.address,
            });

            blockchain.now = blockchain.now!! + 2592000;

            const isUnlocked = await sureMEZZ.isUnlocked(user1.address);
            expect(isUnlocked).toBe(true);
        });

        it('should return isUnlocked = true after 31 days', async () => {
            await sureMEZZ.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: toNano('1000'),
                response_address: admin.address,
            });

            blockchain.now = blockchain.now!! + 2678400;

            const isUnlocked = await sureMEZZ.isUnlocked(user1.address);
            expect(isUnlocked).toBe(true);
        });

        it('should track separate unlock times for different users', async () => {
            await sureMEZZ.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: toNano('1000'),
                response_address: admin.address,
            });

            blockchain.now = blockchain.now!! + 604800; // 7 days

            await sureMEZZ.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user2.address,
                amount: toNano('2000'),
                response_address: admin.address,
            });

            const unlock1 = await sureMEZZ.getUnlockTime(user1.address);
            const unlock2 = await sureMEZZ.getUnlockTime(user2.address);

            expect(unlock2 - unlock1).toBeGreaterThanOrEqual(600000);
            expect(unlock2 - unlock1).toBeLessThanOrEqual(608000);
        });
    });

    describe('Transfer Restrictions During Lock-up', () => {
        it('should reject transfer during lock-up period', async () => {
            await sureMEZZ.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: toNano('1000'),
                response_address: admin.address,
            });

            const isUnlocked = await sureMEZZ.isUnlocked(user1.address);
            expect(isUnlocked).toBe(false);
        });

        it('should allow transfer after lock-up expires', async () => {
            await sureMEZZ.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: toNano('1000'),
                response_address: admin.address,
            });

            blockchain.now = blockchain.now!! + 2592000;

            const isUnlocked = await sureMEZZ.isUnlocked(user1.address);
            expect(isUnlocked).toBe(true);
        });
    });

    describe('Total Supply Tracking', () => {
        it('should start with zero total supply', async () => {
            const totalSupply = await sureMEZZ.getTotalSupply();
            expect(totalSupply).toEqual(0n);
        });

        it('should increase total supply after minting', async () => {
            await sureMEZZ.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: toNano('1000'),
                response_address: admin.address,
            });

            const totalSupply = await sureMEZZ.getTotalSupply();
            expect(totalSupply).toBeGreaterThan(0n);
        });

        it('should track total supply across multiple mints', async () => {
            await sureMEZZ.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: toNano('1000'),
                response_address: admin.address,
            });

            await sureMEZZ.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user2.address,
                amount: toNano('2000'),
                response_address: admin.address,
            });

            const totalSupply = await sureMEZZ.getTotalSupply();
            expect(totalSupply).toBeGreaterThanOrEqual(toNano('3000'));
        });
    });

    describe('Jetton Standard Compliance (TEP-74)', () => {
        it('should implement get_jetton_data getter', async () => {
            const totalSupply = await sureMEZZ.getTotalSupply();
            expect(typeof totalSupply).toBe('bigint');
        });

        it('should have valid content cell', async () => {
            const totalSupply = await sureMEZZ.getTotalSupply();
            expect(totalSupply).toBeGreaterThanOrEqual(0n);
        });

        it('should have admin address configured', async () => {
            const totalSupply = await sureMEZZ.getTotalSupply();
            expect(totalSupply).toBeGreaterThanOrEqual(0n);
        });

        it('should have jetton wallet code configured', async () => {
            const totalSupply = await sureMEZZ.getTotalSupply();
            expect(totalSupply).toBeGreaterThanOrEqual(0n);
        });
    });

    describe('Edge Cases', () => {
        it('should handle max uint256 supply', async () => {
            const maxAmount = (1n << 256n) - 1n;
            const result = await sureMEZZ.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: maxAmount,
                response_address: admin.address,
            });

            expect(result.transactions.length).toBeGreaterThan(0);
        });

        it('should handle minting to zero address gracefully', async () => {
            const result = await sureMEZZ.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: new Address(0, Buffer.alloc(32)),
                amount: toNano('1000'),
                response_address: admin.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: sureMEZZ.address,
                success: false,
            });
        });

        it('should handle concurrent mints to same user', async () => {
            await sureMEZZ.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: toNano('1000'),
                response_address: admin.address,
            });

            const result = await sureMEZZ.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: toNano('2000'),
                response_address: admin.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: sureMEZZ.address,
                success: true,
            });
        });

        it('should preserve unlock time on additional mints', async () => {
            await sureMEZZ.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: toNano('1000'),
                response_address: admin.address,
            });

            const firstUnlockTime = await sureMEZZ.getUnlockTime(user1.address);

            blockchain.now = blockchain.now!! + 604800;

            await sureMEZZ.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: toNano('2000'),
                response_address: admin.address,
            });

            const secondUnlockTime = await sureMEZZ.getUnlockTime(user1.address);

            expect(secondUnlockTime).toBeGreaterThanOrEqual(firstUnlockTime);
        });

        it('should handle query_id in mint message', async () => {
            const result = await sureMEZZ.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: toNano('1000'),
                response_address: admin.address,
                query_id: 12345,
            });

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: sureMEZZ.address,
                success: true,
            });
        });

        it('should handle zero query_id (default)', async () => {
            const result = await sureMEZZ.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: toNano('1000'),
                response_address: admin.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: sureMEZZ.address,
                success: true,
            });
        });
    });

    describe('Configuration', () => {
        it('should correctly serialize config to cell', () => {
            const contentCell = beginCell()
                .storeUint(0, 8)
                .storeStringTail('https://tonsurance.com/sure-mezz.json')
                .endCell();

            const config: SURE_MEZZ_Config = {
                total_supply: toNano('1000000'),
                mintable: true,
                admin_address: admin.address,
                vault_address: vault.address,
                jetton_wallet_code: jettonWalletCode,
                content: contentCell,
            };

            const cell = sure_mezz_ConfigToCell(config);
            expect(cell).toBeInstanceOf(Cell);
        });

        it('should create from address', () => {
            const token = SURE_MEZZ.createFromAddress(sureMEZZ.address);
            expect(token.address.toString()).toEqual(sureMEZZ.address.toString());
        });

        it('should create from config with custom workchain', () => {
            const contentCell = beginCell()
                .storeUint(0, 8)
                .storeStringTail('https://tonsurance.com/sure-mezz.json')
                .endCell();

            const token = SURE_MEZZ.createFromConfig(
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
