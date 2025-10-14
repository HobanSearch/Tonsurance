import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano, beginCell } from '@ton/core';
import { SUREToken } from '../wrappers/SUREToken';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

describe('SUREToken', () => {
    let code: Cell;
    let walletCode: Cell;

    beforeAll(async () => {
        code = await compile('SUREToken');
        walletCode = await compile('JettonWallet');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let sureToken: SandboxContract<SUREToken>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');

        const content = beginCell()
            .storeUint(0, 8) // off-chain content
            .storeStringTail('https://tonsurance.com/sure.json')
            .endCell();

        sureToken = blockchain.openContract(
            SUREToken.createFromConfig(
                {
                    totalSupply: 0n,
                    mintable: true,
                    adminAddress: deployer.address,
                    jettonWalletCode: walletCode,
                    content,
                },
                code
            )
        );

        const deployResult = await sureToken.sendDeploy(deployer.getSender(), toNano('0.05'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: sureToken.address,
            deploy: true,
            success: true,
        });
    });

    it('should deploy successfully', async () => {
        // Deployment tested in beforeEach
    });

    it('should have correct initial jetton data', async () => {
        const jettonData = await sureToken.getJettonData();

        expect(jettonData.totalSupply).toBe(0n);
        expect(jettonData.mintable).toBe(true);
        expect(jettonData.adminAddress.equals(deployer.address)).toBe(true);
    });

    it('should calculate wallet address for user', async () => {
        const user = await blockchain.treasury('user');
        const walletAddress = await sureToken.getWalletAddress(user.address);

        expect(walletAddress).toBeDefined();
        // Wallet address should be a valid address
        expect(walletAddress.toString()).toMatch(/^[0-9A-Za-z_-]{48}$/);
    });

    it('should allow admin to mint tokens', async () => {
        const user = await blockchain.treasury('user');
        const mintAmount = toNano('1000'); // 1000 SURE tokens

        const result = await sureToken.sendMint(deployer.getSender(), {
            value: toNano('0.5'),
            toAddress: user.address,
            amount: mintAmount,
            responseAddress: deployer.address,
        });

        expect(result.transactions).toHaveTransaction({
            from: deployer.address,
            to: sureToken.address,
            success: true,
        });

        // Check total supply increased
        const jettonData = await sureToken.getJettonData();
        expect(jettonData.totalSupply).toBe(mintAmount);
    });

    it('should reject mint from non-admin', async () => {
        const attacker = await blockchain.treasury('attacker');
        const user = await blockchain.treasury('user');

        const result = await sureToken.sendMint(attacker.getSender(), {
            value: toNano('0.5'),
            toAddress: user.address,
            amount: toNano('1000'),
            responseAddress: attacker.address,
        });

        expect(result.transactions).toHaveTransaction({
            from: attacker.address,
            to: sureToken.address,
            success: false,
            exitCode: 403, // Unauthorized
        });
    });

    it('should update total supply when minting', async () => {
        const user1 = await blockchain.treasury('user1');
        const user2 = await blockchain.treasury('user2');

        // Mint to user1
        await sureToken.sendMint(deployer.getSender(), {
            value: toNano('0.5'),
            toAddress: user1.address,
            amount: toNano('1000'),
            responseAddress: deployer.address,
        });

        // Mint to user2
        await sureToken.sendMint(deployer.getSender(), {
            value: toNano('0.5'),
            toAddress: user2.address,
            amount: toNano('2000'),
            responseAddress: deployer.address,
        });

        const jettonData = await sureToken.getJettonData();
        expect(jettonData.totalSupply).toBe(toNano('3000'));
    });

    it('should have mintable flag set correctly', async () => {
        const jettonData = await sureToken.getJettonData();
        expect(jettonData.mintable).toBe(true);
    });

    it('should create separate wallets for different users', async () => {
        const user1 = await blockchain.treasury('user1');
        const user2 = await blockchain.treasury('user2');

        const wallet1 = await sureToken.getWalletAddress(user1.address);
        const wallet2 = await sureToken.getWalletAddress(user2.address);

        expect(wallet1.equals(wallet2)).toBe(false);
    });

    it('should mint to multiple wallets independently', async () => {
        const user1 = await blockchain.treasury('user1');
        const user2 = await blockchain.treasury('user2');
        const user3 = await blockchain.treasury('user3');

        // Mint to three different users
        await sureToken.sendMint(deployer.getSender(), {
            value: toNano('0.5'),
            toAddress: user1.address,
            amount: toNano('500'),
            responseAddress: deployer.address,
        });

        await sureToken.sendMint(deployer.getSender(), {
            value: toNano('0.5'),
            toAddress: user2.address,
            amount: toNano('1500'),
            responseAddress: deployer.address,
        });

        await sureToken.sendMint(deployer.getSender(), {
            value: toNano('0.5'),
            toAddress: user3.address,
            amount: toNano('2000'),
            responseAddress: deployer.address,
        });

        const jettonData = await sureToken.getJettonData();
        expect(jettonData.totalSupply).toBe(toNano('4000'));
    });

    it('should enforce admin-only minting', async () => {
        const user = await blockchain.treasury('user');
        const nonAdmin = await blockchain.treasury('nonAdmin');

        // Non-admin tries to mint
        const result = await sureToken.sendMint(nonAdmin.getSender(), {
            value: toNano('0.5'),
            toAddress: user.address,
            amount: toNano('1000'),
            responseAddress: nonAdmin.address,
        });

        expect(result.transactions).toHaveTransaction({
            from: nonAdmin.address,
            to: sureToken.address,
            success: false,
            exitCode: 403,
        });

        // Total supply should remain 0
        const jettonData = await sureToken.getJettonData();
        expect(jettonData.totalSupply).toBe(0n);
    });

    it('should handle large mint amounts', async () => {
        const user = await blockchain.treasury('user');
        const largeMint = toNano('1000000'); // 1 million SURE tokens

        const result = await sureToken.sendMint(deployer.getSender(), {
            value: toNano('0.5'),
            toAddress: user.address,
            amount: largeMint,
            responseAddress: deployer.address,
        });

        expect(result.transactions).toHaveTransaction({
            from: deployer.address,
            to: sureToken.address,
            success: true,
        });

        const jettonData = await sureToken.getJettonData();
        expect(jettonData.totalSupply).toBe(largeMint);
    });

    it('should maintain correct admin address', async () => {
        const jettonData = await sureToken.getJettonData();

        expect(jettonData.adminAddress.equals(deployer.address)).toBe(true);
    });
});
