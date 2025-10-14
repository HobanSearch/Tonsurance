import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano, beginCell } from '@ton/core';
import { ShieldLP } from '../wrappers/ShieldLP';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

describe('ShieldLP', () => {
    let code: Cell;
    let walletCode: Cell;

    beforeAll(async () => {
        code = await compile('ShieldLP');
        walletCode = await compile('JettonWallet');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let shieldLP: SandboxContract<ShieldLP>;
    let primaryVault: SandboxContract<TreasuryContract>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');
        primaryVault = await blockchain.treasury('primaryVault');

        const content = beginCell()
            .storeUint(0, 8)
            .storeStringTail('https://tonsurance.com/shieldlp.json')
            .endCell();

        shieldLP = blockchain.openContract(
            ShieldLP.createFromConfig(
                {
                    totalSupply: 0n,
                    mintable: true,
                    adminAddress: deployer.address,
                    primaryVaultAddress: primaryVault.address,
                    jettonWalletCode: walletCode,
                    content,
                },
                code
            )
        );

        const deployResult = await shieldLP.sendDeploy(deployer.getSender(), toNano('0.05'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: shieldLP.address,
            deploy: true,
            success: true,
        });
    });

    it('should deploy successfully', async () => {
        // Deployment tested in beforeEach
    });

    it('should have correct initial jetton data', async () => {
        const jettonData = await shieldLP.getJettonData();

        expect(jettonData.totalSupply).toBe(0n);
        expect(jettonData.mintable).toBe(true);
        expect(jettonData.adminAddress.equals(deployer.address)).toBe(true);
    });

    it('should allow Primary Vault to mint tokens', async () => {
        const user = await blockchain.treasury('user');
        const mintAmount = toNano('1000');

        const result = await shieldLP.sendMint(primaryVault.getSender(), {
            value: toNano('0.5'),
            queryId: 1n,
            toAddress: user.address,
            amount: mintAmount,
            responseAddress: primaryVault.address,
        });

        expect(result.transactions).toHaveTransaction({
            from: primaryVault.address,
            to: shieldLP.address,
            success: true,
        });

        const jettonData = await shieldLP.getJettonData();
        expect(jettonData.totalSupply).toBe(mintAmount);
    });

    it('should reject minting from non-vault address', async () => {
        const attacker = await blockchain.treasury('attacker');
        const user = await blockchain.treasury('user');

        const result = await shieldLP.sendMint(attacker.getSender(), {
            value: toNano('0.5'),
            queryId: 1n,
            toAddress: user.address,
            amount: toNano('1000'),
            responseAddress: attacker.address,
        });

        expect(result.transactions).toHaveTransaction({
            from: attacker.address,
            to: shieldLP.address,
            success: false,
            exitCode: 403, // Unauthorized
        });
    });

    it('should calculate wallet address for LP provider', async () => {
        const lpProvider = await blockchain.treasury('lpProvider');
        const walletAddress = await shieldLP.getWalletAddress(lpProvider.address);

        expect(walletAddress).toBeDefined();
        expect(walletAddress.toString()).toMatch(/^[0-9A-Za-z_-]{48}$/);
    });

    it('should update total supply when minting', async () => {
        const user1 = await blockchain.treasury('user1');
        const user2 = await blockchain.treasury('user2');

        // Mint to user1
        await shieldLP.sendMint(primaryVault.getSender(), {
            value: toNano('0.5'),
            queryId: 1n,
            toAddress: user1.address,
            amount: toNano('1000'),
            responseAddress: primaryVault.address,
        });

        // Mint to user2
        await shieldLP.sendMint(primaryVault.getSender(), {
            value: toNano('0.5'),
            queryId: 2n,
            toAddress: user2.address,
            amount: toNano('2000'),
            responseAddress: primaryVault.address,
        });

        const totalSupply = await shieldLP.getTotalSupply();
        expect(totalSupply).toBe(toNano('3000'));
    });

    it('should retrieve primary vault address', async () => {
        const vaultAddress = await shieldLP.getPrimaryVault();
        expect(vaultAddress.equals(primaryVault.address)).toBe(true);
    });

    it('should have mintable flag set correctly', async () => {
        const jettonData = await shieldLP.getJettonData();
        expect(jettonData.mintable).toBe(true);
    });

    it('should create separate wallets for different LP providers', async () => {
        const lp1 = await blockchain.treasury('lp1');
        const lp2 = await blockchain.treasury('lp2');

        const wallet1 = await shieldLP.getWalletAddress(lp1.address);
        const wallet2 = await shieldLP.getWalletAddress(lp2.address);

        expect(wallet1.equals(wallet2)).toBe(false);
    });

    it('should mint to multiple LP providers independently', async () => {
        const lp1 = await blockchain.treasury('lp1');
        const lp2 = await blockchain.treasury('lp2');
        const lp3 = await blockchain.treasury('lp3');

        await shieldLP.sendMint(primaryVault.getSender(), {
            value: toNano('0.5'),
            queryId: 1n,
            toAddress: lp1.address,
            amount: toNano('500'),
            responseAddress: primaryVault.address,
        });

        await shieldLP.sendMint(primaryVault.getSender(), {
            value: toNano('0.5'),
            queryId: 2n,
            toAddress: lp2.address,
            amount: toNano('1500'),
            responseAddress: primaryVault.address,
        });

        await shieldLP.sendMint(primaryVault.getSender(), {
            value: toNano('0.5'),
            queryId: 3n,
            toAddress: lp3.address,
            amount: toNano('2000'),
            responseAddress: primaryVault.address,
        });

        const totalSupply = await shieldLP.getTotalSupply();
        expect(totalSupply).toBe(toNano('4000'));
    });

    it('should enforce vault-only minting access control', async () => {
        const user = await blockchain.treasury('user');
        const nonVault = await blockchain.treasury('nonVault');

        const result = await shieldLP.sendMint(nonVault.getSender(), {
            value: toNano('0.5'),
            queryId: 1n,
            toAddress: user.address,
            amount: toNano('1000'),
            responseAddress: nonVault.address,
        });

        expect(result.transactions).toHaveTransaction({
            from: nonVault.address,
            to: shieldLP.address,
            success: false,
            exitCode: 403,
        });

        const totalSupply = await shieldLP.getTotalSupply();
        expect(totalSupply).toBe(0n);
    });

    it('should handle large mint amounts', async () => {
        const lp = await blockchain.treasury('lp');
        const largeMint = toNano('10000000'); // 10 million tokens

        const result = await shieldLP.sendMint(primaryVault.getSender(), {
            value: toNano('0.5'),
            queryId: 1n,
            toAddress: lp.address,
            amount: largeMint,
            responseAddress: primaryVault.address,
        });

        expect(result.transactions).toHaveTransaction({
            from: primaryVault.address,
            to: shieldLP.address,
            success: true,
        });

        const totalSupply = await shieldLP.getTotalSupply();
        expect(totalSupply).toBe(largeMint);
    });
});
