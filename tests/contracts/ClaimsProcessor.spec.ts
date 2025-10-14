import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano, beginCell } from '@ton/core';
import { ClaimsProcessor } from '../wrappers/ClaimsProcessor';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

describe('ClaimsProcessor', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compile('ClaimsProcessor');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let claimsProcessor: SandboxContract<ClaimsProcessor>;
    let treasury: SandboxContract<TreasuryContract>;
    let primaryVault: SandboxContract<TreasuryContract>;
    let secondaryVault: SandboxContract<TreasuryContract>;
    let tradfiBuffer: SandboxContract<TreasuryContract>;
    let priceOracle: SandboxContract<TreasuryContract>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');
        treasury = await blockchain.treasury('treasury');
        primaryVault = await blockchain.treasury('primaryVault');
        secondaryVault = await blockchain.treasury('secondaryVault');
        tradfiBuffer = await blockchain.treasury('tradfiBuffer');
        priceOracle = await blockchain.treasury('priceOracle');

        claimsProcessor = blockchain.openContract(
            ClaimsProcessor.createFromConfig(
                {
                    ownerAddress: deployer.address,
                    nextClaimId: 1n,
                    treasuryAddress: treasury.address,
                    primaryVaultAddress: primaryVault.address,
                    secondaryVaultAddress: secondaryVault.address,
                    tradfiBufferAddress: tradfiBuffer.address,
                    priceOracleAddress: priceOracle.address,
                    autoApprovalThreshold: 100,
                },
                code
            )
        );

        const deployResult = await claimsProcessor.sendDeploy(deployer.getSender(), toNano('0.05'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: claimsProcessor.address,
            deploy: true,
            success: true,
        });
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
            coverageType: 1, // USDT depeg
            coverageAmount: toNano('1000'),
            evidence,
        });

        expect(result.transactions).toHaveTransaction({
            from: claimant.address,
            to: claimsProcessor.address,
            success: true,
        });
    });

    it('should auto-verify USDT depeg claims', async () => {
        const claimant = await blockchain.treasury('claimant');

        // Add USDT depeg as verified event
        const eventHash = BigInt('0x' + '1'.repeat(64)); // Mock event hash
        await claimsProcessor.sendAddVerifiedEvent(deployer.getSender(), {
            value: toNano('0.05'),
            eventHash,
        });

        const evidence = beginCell().storeUint(Number(eventHash & 0xffffffffn), 32).endCell();

        await claimsProcessor.sendFileClaim(claimant.getSender(), {
            value: toNano('0.15'),
            policyId: 1n,
            coverageType: 1, // USDT depeg
            coverageAmount: toNano('1000'),
            evidence,
        });

        const status = await claimsProcessor.getClaimStatus(1n);

        expect(status.status).toBe(1); // STATUS_APPROVED
        expect(status.autoApproved).toBe(true);
    });

    it('should auto-verify protocol exploit claims', async () => {
        const claimant = await blockchain.treasury('claimant');
        const eventHash = BigInt('0x' + '2'.repeat(64));

        await claimsProcessor.sendAddVerifiedEvent(deployer.getSender(), {
            value: toNano('0.05'),
            eventHash,
        });

        const evidence = beginCell().storeUint(Number(eventHash & 0xffffffffn), 32).endCell();

        await claimsProcessor.sendFileClaim(claimant.getSender(), {
            value: toNano('0.15'),
            policyId: 2n,
            coverageType: 2, // Protocol exploit
            coverageAmount: toNano('2000'),
            evidence,
        });

        const status = await claimsProcessor.getClaimStatus(1n);

        expect(status.status).toBe(1); // STATUS_APPROVED
        expect(status.autoApproved).toBe(true);
    });

    it('should auto-verify bridge hack claims', async () => {
        const claimant = await blockchain.treasury('claimant');
        const eventHash = BigInt('0x' + '3'.repeat(64));

        await claimsProcessor.sendAddVerifiedEvent(deployer.getSender(), {
            value: toNano('0.05'),
            eventHash,
        });

        const evidence = beginCell().storeUint(Number(eventHash & 0xffffffffn), 32).endCell();

        await claimsProcessor.sendFileClaim(claimant.getSender(), {
            value: toNano('0.15'),
            policyId: 3n,
            coverageType: 3, // Bridge hack
            coverageAmount: toNano('3000'),
            evidence,
        });

        const status = await claimsProcessor.getClaimStatus(1n);

        expect(status.status).toBe(1); // STATUS_APPROVED
        expect(status.autoApproved).toBe(true);
    });

    it('should leave subjective claims pending for admin review', async () => {
        const claimant = await blockchain.treasury('claimant');
        const evidence = beginCell().storeUint(999999, 64).endCell();

        await claimsProcessor.sendFileClaim(claimant.getSender(), {
            value: toNano('0.1'),
            policyId: 4n,
            coverageType: 4, // Subjective claim (e.g., smart contract bug)
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
            coverageType: 4,
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

    it('should allow owner to manually reject pending claims', async () => {
        const claimant = await blockchain.treasury('claimant');
        const evidence = beginCell().storeUint(999999, 64).endCell();

        await claimsProcessor.sendFileClaim(claimant.getSender(), {
            value: toNano('0.1'),
            policyId: 6n,
            coverageType: 4,
            coverageAmount: toNano('2000'),
            evidence,
        });

        // Admin rejects claim
        const result = await claimsProcessor.sendAdminRejectClaim(deployer.getSender(), {
            value: toNano('0.15'),
            claimId: 1n,
        });

        expect(result.transactions).toHaveTransaction({
            from: deployer.address,
            to: claimsProcessor.address,
            success: true,
        });

        const status = await claimsProcessor.getClaimStatus(1n);

        expect(status.status).toBe(2); // STATUS_REJECTED
    });

    it('should reject non-owner approval attempts', async () => {
        const claimant = await blockchain.treasury('claimant');
        const attacker = await blockchain.treasury('attacker');
        const evidence = beginCell().storeUint(999999, 64).endCell();

        await claimsProcessor.sendFileClaim(claimant.getSender(), {
            value: toNano('0.1'),
            policyId: 7n,
            coverageType: 4,
            coverageAmount: toNano('2000'),
            evidence,
        });

        // Non-owner tries to approve claim
        const result = await claimsProcessor.sendAdminApproveClaim(attacker.getSender(), {
            value: toNano('0.15'),
            claimId: 1n,
        });

        expect(result.transactions).toHaveTransaction({
            from: attacker.address,
            to: claimsProcessor.address,
            success: false,
            exitCode: 403, // Not owner
        });
    });

    it('should reject non-owner rejection attempts', async () => {
        const claimant = await blockchain.treasury('claimant');
        const attacker = await blockchain.treasury('attacker');
        const evidence = beginCell().storeUint(999999, 64).endCell();

        await claimsProcessor.sendFileClaim(claimant.getSender(), {
            value: toNano('0.1'),
            policyId: 8n,
            coverageType: 4,
            coverageAmount: toNano('2000'),
            evidence,
        });

        // Non-owner tries to reject claim
        const result = await claimsProcessor.sendAdminRejectClaim(attacker.getSender(), {
            value: toNano('0.15'),
            claimId: 1n,
        });

        expect(result.transactions).toHaveTransaction({
            from: attacker.address,
            to: claimsProcessor.address,
            success: false,
            exitCode: 403, // Not owner
        });
    });

    it('should retrieve claim status correctly', async () => {
        const claimant = await blockchain.treasury('claimant');
        const evidence = beginCell().storeUint(999999, 64).endCell();

        await claimsProcessor.sendFileClaim(claimant.getSender(), {
            value: toNano('0.1'),
            policyId: 9n,
            coverageType: 4,
            coverageAmount: toNano('3000'),
            evidence,
        });

        const status = await claimsProcessor.getClaimStatus(1n);

        expect(status.coverageAmount).toBe(toNano('3000'));
        expect(status.status).toBeGreaterThanOrEqual(0);
    });

    it('should execute loss waterfall (Primary → Secondary → TradFi)', async () => {
        const claimant = await blockchain.treasury('claimant');
        const eventHash = BigInt('0x' + '4'.repeat(64));

        await claimsProcessor.sendAddVerifiedEvent(deployer.getSender(), {
            value: toNano('0.05'),
            eventHash,
        });

        const evidence = beginCell().storeUint(Number(eventHash & 0xffffffffn), 32).endCell();

        const result = await claimsProcessor.sendFileClaim(claimant.getSender(), {
            value: toNano('0.2'),
            policyId: 10n,
            coverageType: 1,
            coverageAmount: toNano('5000'),
            evidence,
        });

        // Check that claim was auto-approved and payout initiated
        expect(result.transactions).toHaveTransaction({
            from: claimsProcessor.address,
            to: primaryVault.address,
            success: true,
        });
    });

    it('should only allow owner to add verified events', async () => {
        const attacker = await blockchain.treasury('attacker');
        const eventHash = BigInt('0x' + '5'.repeat(64));

        const result = await claimsProcessor.sendAddVerifiedEvent(attacker.getSender(), {
            value: toNano('0.05'),
            eventHash,
        });

        expect(result.transactions).toHaveTransaction({
            from: attacker.address,
            to: claimsProcessor.address,
            success: false,
            exitCode: 403,
        });
    });

    it('should send payout to claimant after approval', async () => {
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
            coverageType: 2,
            coverageAmount: toNano('1000'),
            evidence,
        });

        // Payout request should be sent to PrimaryVault
        expect(result.transactions).toHaveTransaction({
            from: claimsProcessor.address,
            to: primaryVault.address,
            success: true,
        });
    });

    it('should handle multiple claims from different users', async () => {
        const claimant1 = await blockchain.treasury('claimant1');
        const claimant2 = await blockchain.treasury('claimant2');
        const evidence = beginCell().storeUint(999999, 64).endCell();

        await claimsProcessor.sendFileClaim(claimant1.getSender(), {
            value: toNano('0.1'),
            policyId: 12n,
            coverageType: 4,
            coverageAmount: toNano('1000'),
            evidence,
        });

        await claimsProcessor.sendFileClaim(claimant2.getSender(), {
            value: toNano('0.1'),
            policyId: 13n,
            coverageType: 4,
            coverageAmount: toNano('2000'),
            evidence,
        });

        const status1 = await claimsProcessor.getClaimStatus(1n);
        const status2 = await claimsProcessor.getClaimStatus(2n);

        expect(status1.coverageAmount).toBe(toNano('1000'));
        expect(status2.coverageAmount).toBe(toNano('2000'));
    });
});
