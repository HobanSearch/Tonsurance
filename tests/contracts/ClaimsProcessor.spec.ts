import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano, beginCell, Address } from '@ton/core';
import { ClaimsProcessor, claimsProcessorConfigToCell } from '../wrappers/ClaimsProcessor';
import { MultiTrancheVault, createInitialTrancheData } from '../wrappers/MultiTrancheVault';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

describe('ClaimsProcessor', () => {
    let claimsProcessorCode: Cell;
    let multiTrancheVaultCode: Cell;

    beforeAll(async () => {
        claimsProcessorCode = await compile('ClaimsProcessor';
        multiTrancheVaultCode = await compile('MultiTrancheVault');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let claimsProcessor: SandboxContract<ClaimsProcessor>;
    let treasury: SandboxContract<TreasuryContract>;
    let multiTrancheVault: SandboxContract<MultiTrancheVault>;
    let priceOracle: SandboxContract<TreasuryContract>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');
        treasury = await blockchain.treasury('treasury');
        priceOracle = await blockchain.treasury('priceOracle');

        // Deploy MultiTrancheVault
        multiTrancheVault = blockchain.openContract(
            MultiTrancheVault.createFromConfig(
                {
                    ownerAddress: deployer.address,
                    adminAddress: deployer.address,
                    claimsProcessorAddress: Address.parse('EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c'), // Temp address
                    trancheData: createInitialTrancheData(),
                },
                multiTrancheVaultCode
            )
        );
        await multiTrancheVault.sendDeploy(deployer.getSender(), toNano('1'));

        // Deploy ClaimsProcessor
        claimsProcessor = blockchain.openContract(
            ClaimsProcessor.createFromConfig(
                {
                    ownerAddress: deployer.address,
                    nextClaimId: 1n,
                    treasuryAddress: treasury.address,
                    multiTrancheVaultAddress: multiTrancheVault.address,
                    priceOracleAddress: priceOracle.address,
                    autoApprovalThreshold: 10000,
                },
                claimsProcessorCode
            )
        );

        const deployResult = await claimsProcessor.sendDeploy(deployer.getSender(), toNano('0.05'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: claimsProcessor.address,
            deploy: true,
            success: true,
        });

        // Set the actual ClaimsProcessor address in the vault
        await multiTrancheVault.sendSetClaimsProcessor(deployer.getSender(), toNano('0.05'), claimsProcessor.address);
    });

    it('should deploy successfully', async () => {
        // Deployment tested in beforeEach
    });

    it('should allow user to file claim', async () => {
        const claimant = await blockchain.treasury('claimant');
        const evidence = beginCell().storeUint(123456, 64).endCell();

        const result = await claimsProcessor.sendFileClaim(claimant.getSender(), {
            value: toNano('0.1'),
            policyId: 1n,
            coverageType: 0, // Depeg
            chainId: 0, // Ethereum
            stablecoinId: 0, // USDC
            coverageAmount: toNano('1000'),
            evidence,
        });

        expect(result.transactions).toHaveTransaction({
            from: claimant.address,
            to: claimsProcessor.address,
            success: true,
        });
    });

    it('should auto-verify claims if event is verified', async () => {
        const claimant = await blockchain.treasury('claimant');

        // Add a verified event by owner
        const eventHash = BigInt('0x' + '1'.repeat(64)); // Mock event hash
        await claimsProcessor.sendAddVerifiedEvent(deployer.getSender(), {
            value: toNano('0.05'),
            eventHash,
        });

        const evidence = beginCell().storeUint(Number(eventHash & 0xffffffffn), 32).endCell();

        await claimsProcessor.sendFileClaim(claimant.getSender(), {
            value: toNano('0.15'),
            policyId: 1n,
            coverageType: 0, // Depeg
            chainId: 0, // Ethereum
            stablecoinId: 0, // USDC
            coverageAmount: toNano('1000'),
            evidence,
        });

        const status = await claimsProcessor.getClaimStatus(1n);

        expect(status.status).toBe(1); // STATUS_APPROVED
        expect(status.autoApproved).toBe(true);
    });

    it('should leave claims pending for admin review if no event verified', async () => {
        const claimant = await blockchain.treasury('claimant');
        const evidence = beginCell().storeUint(999999, 64).endCell();

        await claimsProcessor.sendFileClaim(claimant.getSender(), {
            value: toNano('0.1'),
            policyId: 4n,
            coverageType: 1, // Smart Contract
            chainId: 0,
            stablecoinId: 0,
            coverageAmount: toNano('2000'),
            evidence,
        });

        const status = await claimsProcessor.getClaimStatus(1n);

        expect(status.status).toBe(0); // STATUS_PENDING
        expect(status.autoApproved).toBe(false);
    });

    it('should allow owner to manually approve pending claims', async () => {
        const claimant = await blockchain.treasury('claimant');
        const evidence = beginCell().storeUint(999999, 64).endCell();

        await claimsProcessor.sendFileClaim(claimant.getSender(), {
            value: toNano('0.1'),
            policyId: 5n,
            coverageType: 1,
            chainId: 0,
            stablecoinId: 0,
            coverageAmount: toNano('2000'),
            evidence,
        });

        // Admin approves claim
        const result = await claimsProcessor.sendAdminApproveClaim(deployer.getSender(), {
            value: toNano('0.15'),
            claimId: 1n,
        });

        expect(result.transactions).toHaveTransaction({
            from: deployer.address,
            to: claimsProcessor.address,
            success: true,
        });

        const status = await claimsProcessor.getClaimStatus(1n);

        expect(status.status).toBe(1); // STATUS_APPROVED
        expect(status.autoApproved).toBe(false); // Manually approved
    });

    it('should send payout request to MultiTrancheVault after approval', async () => {
        const claimant = await blockchain.treasury('claimant');
        const eventHash = BigInt('0x' + '6'.repeat(64));

        await claimsProcessor.sendAddVerifiedEvent(deployer.getSender(), {
            value: toNano('0.05'),
            eventHash,
        });

        const evidence = beginCell().storeUint(Number(eventHash & 0xffffffffn), 32).endCell();

        const result = await claimsProcessor.sendFileClaim(claimant.getSender(), {
            value: toNano('0.2'),
            policyId: 11n,
            coverageType: 2, // Oracle Failure
            chainId: 0,
            stablecoinId: 0,
            coverageAmount: toNano('1000'),
            evidence,
        });

        // Payout request should be sent to MultiTrancheVault
        expect(result.transactions).toHaveTransaction({
            from: claimsProcessor.address,
            to: multiTrancheVault.address,
            op: 0x04, // op: absorb_loss
            success: true,
        });
    });
});
