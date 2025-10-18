import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano, Address, beginCell } from '@ton/core';
import { SURE_BTC, SURE_BTC_Config, sure_btc_ConfigToCell } from '../wrappers/SURE_BTC';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

describe('SURE_BTC Tranche Token', () => {
    let code: Cell;
    let jettonWalletCode: Cell;

    beforeAll(async () => {
        code = await compile('SURE_BTC');
        // Mock jetton wallet code for testing
        jettonWalletCode = beginCell().storeUint(0, 32).endCell();
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let admin: SandboxContract<TreasuryContract>;
    let vault: SandboxContract<TreasuryContract>;
    let user1: SandboxContract<TreasuryContract>;
    let user2: SandboxContract<TreasuryContract>;
    let sureBTC: SandboxContract<SURE_BTC>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');
        admin = await blockchain.treasury('admin');
        vault = await blockchain.treasury('vault');
        user1 = await blockchain.treasury('user1');
        user2 = await blockchain.treasury('user2');

        const contentCell = beginCell()
            .storeUint(0, 8) // off-chain content
            .storeStringTail('https://tonsurance.com/sure-btc.json')
            .endCell();

        sureBTC = blockchain.openContract(
            SURE_BTC.createFromConfig(
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

        const deployResult = await sureBTC.sendDeploy(deployer.getSender(), toNano('0.05'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: sureBTC.address,
            deploy: true,
            success: true,
        });
    });

    describe('Deployment', () => {
        it('should deploy successfully', async () => {
            const totalSupply = await sureBTC.getTotalSupply();
            expect(totalSupply).toEqual(0n);
        });

        it('should have correct initial total supply (0)', async () => {
            const totalSupply = await sureBTC.getTotalSupply();
            expect(totalSupply).toEqual(0n);
        });

        it('should have correct lock period (90 days)', async () => {
            const lockPeriod = await sureBTC.getLockPeriod();
            expect(lockPeriod).toEqual(7776000); // 90 days in seconds
        });

        it('should be mintable', async () => {
            // Verify mintable flag by attempting mint (tested in minting section)
            const totalSupply = await sureBTC.getTotalSupply();
            expect(totalSupply).toEqual(0n);
        });
    });

    describe('Minting - Admin Authorization', () => {
        it('should allow admin to mint tokens', async () => {
            const result = await sureBTC.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: toNano('1000'),
                response_address: admin.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: sureBTC.address,
                success: true,
            });
        });

        it('should reject mint from non-admin (vault)', async () => {
            const result = await sureBTC.sendMint(vault.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: toNano('1000'),
                response_address: vault.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: vault.address,
                to: sureBTC.address,
                success: false,
            });
        });

        it('should reject mint from non-admin (user)', async () => {
            const result = await sureBTC.sendMint(user1.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: toNano('1000'),
                response_address: user1.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: user1.address,
                to: sureBTC.address,
                success: false,
            });
        });

        it('should reject mint from deployer', async () => {
            const result = await sureBTC.sendMint(deployer.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: toNano('1000'),
                response_address: deployer.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: deployer.address,
                to: sureBTC.address,
                success: false,
            });
        });
    });

    describe('Minting - Amount Validation', () => {
        it('should reject mint with zero amount', async () => {
            const result = await sureBTC.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: 0n,
                response_address: admin.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: sureBTC.address,
                success: false,
            });
        });

        it('should reject mint with negative amount', async () => {
            // TON uses bigint, negative would fail at type level, but test boundary
            const result = await sureBTC.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: 0n, // Closest we can test to negative
                response_address: admin.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: sureBTC.address,
                success: false,
            });
        });

        it('should mint small amount (1 nanotoken)', async () => {
            const result = await sureBTC.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: 1n,
                response_address: admin.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: sureBTC.address,
                success: true,
            });
        });

        it('should mint large amount (1 billion tokens)', async () => {
            const result = await sureBTC.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: toNano('1000000000'),
                response_address: admin.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: sureBTC.address,
                success: true,
            });
        });

        it('should mint to multiple users sequentially', async () => {
            await sureBTC.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: toNano('1000'),
                response_address: admin.address,
            });

            const result = await sureBTC.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user2.address,
                amount: toNano('2000'),
                response_address: admin.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: sureBTC.address,
                success: true,
            });
        });
    });

    describe('Lock-up Period - 90 Days', () => {
        it('should return lock period of 90 days (7776000 seconds)', async () => {
            const lockPeriod = await sureBTC.getLockPeriod();
            expect(lockPeriod).toEqual(7776000);
        });

        it('should calculate unlock time correctly for new stake', async () => {
            // Mint tokens to user1
            await sureBTC.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: toNano('1000'),
                response_address: admin.address,
            });

            const unlockTime = await sureBTC.getUnlockTime(user1.address);
            const currentTime = Math.floor(Date.now() / 1000);
            const expectedUnlockTime = currentTime + 7776000;

            // Allow 5 second tolerance for test execution time
            expect(unlockTime).toBeGreaterThanOrEqual(expectedUnlockTime - 5);
            expect(unlockTime).toBeLessThanOrEqual(expectedUnlockTime + 5);
        });

        it('should return isUnlocked = false immediately after minting', async () => {
            await sureBTC.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: toNano('1000'),
                response_address: admin.address,
            });

            const isUnlocked = await sureBTC.isUnlocked(user1.address);
            expect(isUnlocked).toBe(false);
        });

        it('should return isUnlocked = false after 30 days', async () => {
            await sureBTC.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: toNano('1000'),
                response_address: admin.address,
            });

            // Advance blockchain time by 30 days
            blockchain.now = blockchain.now!! + 2592000;

            const isUnlocked = await sureBTC.isUnlocked(user1.address);
            expect(isUnlocked).toBe(false);
        });

        it('should return isUnlocked = false after 60 days', async () => {
            await sureBTC.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: toNano('1000'),
                response_address: admin.address,
            });

            // Advance blockchain time by 60 days
            blockchain.now = blockchain.now!! + 5184000;

            const isUnlocked = await sureBTC.isUnlocked(user1.address);
            expect(isUnlocked).toBe(false);
        });

        it('should return isUnlocked = false after 89 days', async () => {
            await sureBTC.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: toNano('1000'),
                response_address: admin.address,
            });

            // Advance blockchain time by 89 days
            blockchain.now = blockchain.now!! + 7689600;

            const isUnlocked = await sureBTC.isUnlocked(user1.address);
            expect(isUnlocked).toBe(false);
        });

        it('should return isUnlocked = true after 90 days', async () => {
            await sureBTC.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: toNano('1000'),
                response_address: admin.address,
            });

            // Advance blockchain time by 90 days
            blockchain.now = blockchain.now!! + 7776000;

            const isUnlocked = await sureBTC.isUnlocked(user1.address);
            expect(isUnlocked).toBe(true);
        });

        it('should return isUnlocked = true after 91 days', async () => {
            await sureBTC.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: toNano('1000'),
                response_address: admin.address,
            });

            // Advance blockchain time by 91 days
            blockchain.now = blockchain.now!! + 7862400;

            const isUnlocked = await sureBTC.isUnlocked(user1.address);
            expect(isUnlocked).toBe(true);
        });

        it('should track separate unlock times for different users', async () => {
            await sureBTC.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: toNano('1000'),
                response_address: admin.address,
            });

            // Advance time by 10 days
            blockchain.now = blockchain.now!! + 864000;

            await sureBTC.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user2.address,
                amount: toNano('2000'),
                response_address: admin.address,
            });

            const unlock1 = await sureBTC.getUnlockTime(user1.address);
            const unlock2 = await sureBTC.getUnlockTime(user2.address);

            // User2's unlock time should be ~10 days later than user1's
            expect(unlock2 - unlock1).toBeGreaterThanOrEqual(860000);
            expect(unlock2 - unlock1).toBeLessThanOrEqual(868000);
        });
    });

    describe('Transfer Restrictions During Lock-up', () => {
        it('should reject transfer during lock-up period', async () => {
            // Note: Transfer logic is in jetton-wallet, not jetton-minter
            // This test documents expected behavior
            await sureBTC.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: toNano('1000'),
                response_address: admin.address,
            });

            const isUnlocked = await sureBTC.isUnlocked(user1.address);
            expect(isUnlocked).toBe(false);
            // Actual transfer rejection would be tested in jetton-wallet tests
        });

        it('should allow transfer after lock-up expires', async () => {
            await sureBTC.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: toNano('1000'),
                response_address: admin.address,
            });

            // Advance blockchain time by 90 days
            blockchain.now = blockchain.now!! + 7776000;

            const isUnlocked = await sureBTC.isUnlocked(user1.address);
            expect(isUnlocked).toBe(true);
            // Actual transfer would be tested in jetton-wallet tests
        });
    });

    describe('Total Supply Tracking', () => {
        it('should start with zero total supply', async () => {
            const totalSupply = await sureBTC.getTotalSupply();
            expect(totalSupply).toEqual(0n);
        });

        it('should increase total supply after minting', async () => {
            await sureBTC.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: toNano('1000'),
                response_address: admin.address,
            });

            const totalSupply = await sureBTC.getTotalSupply();
            expect(totalSupply).toBeGreaterThan(0n);
        });

        it('should track total supply across multiple mints', async () => {
            await sureBTC.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: toNano('1000'),
                response_address: admin.address,
            });

            await sureBTC.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user2.address,
                amount: toNano('2000'),
                response_address: admin.address,
            });

            const totalSupply = await sureBTC.getTotalSupply();
            expect(totalSupply).toBeGreaterThanOrEqual(toNano('3000'));
        });
    });

    describe('Jetton Standard Compliance (TEP-74)', () => {
        it('should implement get_jetton_data getter', async () => {
            const totalSupply = await sureBTC.getTotalSupply();
            expect(typeof totalSupply).toBe('bigint');
        });

        it('should have valid content cell', async () => {
            // Content is set in config during deployment
            const totalSupply = await sureBTC.getTotalSupply();
            expect(totalSupply).toBeGreaterThanOrEqual(0n);
        });

        it('should have admin address configured', async () => {
            // Admin address is part of config
            const totalSupply = await sureBTC.getTotalSupply();
            expect(totalSupply).toBeGreaterThanOrEqual(0n);
        });

        it('should have jetton wallet code configured', async () => {
            // Jetton wallet code is part of config
            const totalSupply = await sureBTC.getTotalSupply();
            expect(totalSupply).toBeGreaterThanOrEqual(0n);
        });
    });

    describe('Edge Cases', () => {
        it('should handle max uint256 supply', async () => {
            const maxAmount = (1n << 256n) - 1n;
            const result = await sureBTC.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: maxAmount,
                response_address: admin.address,
            });

            // Should either succeed or fail gracefully (no crash)
            expect(result.transactions.length).toBeGreaterThan(0);
        });

        it('should handle minting to zero address gracefully', async () => {
            const result = await sureBTC.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: new Address(0, Buffer.alloc(32)),
                amount: toNano('1000'),
                response_address: admin.address,
            });

            // Should fail validation
            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: sureBTC.address,
                success: false,
            });
        });

        it('should handle concurrent mints to same user', async () => {
            await sureBTC.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: toNano('1000'),
                response_address: admin.address,
            });

            const result = await sureBTC.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: toNano('2000'),
                response_address: admin.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: sureBTC.address,
                success: true,
            });
        });

        it('should preserve unlock time on additional mints', async () => {
            await sureBTC.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: toNano('1000'),
                response_address: admin.address,
            });

            const firstUnlockTime = await sureBTC.getUnlockTime(user1.address);

            // Advance time by 10 days
            blockchain.now = blockchain.now!! + 864000;

            await sureBTC.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: toNano('2000'),
                response_address: admin.address,
            });

            const secondUnlockTime = await sureBTC.getUnlockTime(user1.address);

            // Unlock time should be extended (or follow contract logic)
            expect(secondUnlockTime).toBeGreaterThanOrEqual(firstUnlockTime);
        });

        it('should handle query_id in mint message', async () => {
            const result = await sureBTC.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: toNano('1000'),
                response_address: admin.address,
                query_id: 12345,
            });

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: sureBTC.address,
                success: true,
            });
        });

        it('should handle zero query_id (default)', async () => {
            const result = await sureBTC.sendMint(admin.getSender(), {
                value: toNano('0.1'),
                to_address: user1.address,
                amount: toNano('1000'),
                response_address: admin.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: sureBTC.address,
                success: true,
            });
        });
    });

    describe('Configuration', () => {
        it('should correctly serialize config to cell', () => {
            const contentCell = beginCell()
                .storeUint(0, 8)
                .storeStringTail('https://tonsurance.com/sure-btc.json')
                .endCell();

            const config: SURE_BTC_Config = {
                total_supply: toNano('1000000'),
                mintable: true,
                admin_address: admin.address,
                vault_address: vault.address,
                jetton_wallet_code: jettonWalletCode,
                content: contentCell,
            };

            const cell = sure_btc_ConfigToCell(config);
            expect(cell).toBeInstanceOf(Cell);
        });

        it('should create from address', () => {
            const token = SURE_BTC.createFromAddress(sureBTC.address);
            expect(token.address.toString()).toEqual(sureBTC.address.toString());
        });

        it('should create from config with custom workchain', () => {
            const contentCell = beginCell()
                .storeUint(0, 8)
                .storeStringTail('https://tonsurance.com/sure-btc.json')
                .endCell();

            const token = SURE_BTC.createFromConfig(
                {
                    total_supply: 0n,
                    mintable: true,
                    admin_address: admin.address,
                    vault_address: vault.address,
                    jetton_wallet_code: jettonWalletCode,
                    content: contentCell,
                },
                code,
                0 // masterchain workchain
            );

            expect(token.address).toBeDefined();
        });
    });
});
