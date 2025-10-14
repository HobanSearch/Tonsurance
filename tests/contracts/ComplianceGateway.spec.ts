import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano, beginCell } from '@ton/core';
import { ComplianceGateway } from '../wrappers/ComplianceGateway';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

describe('ComplianceGateway', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compile('ComplianceGateway');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let complianceGateway: SandboxContract<ComplianceGateway>;
    let tradfiBuffer: SandboxContract<TreasuryContract>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');
        tradfiBuffer = await blockchain.treasury('tradfiBuffer');

        complianceGateway = blockchain.openContract(
            ComplianceGateway.createFromConfig(
                {
                    ownerAddress: deployer.address,
                    tradfiBufferAddress: tradfiBuffer.address,
                    totalApproved: 0,
                    totalRejected: 0,
                    totalExpired: 0,
                },
                code
            )
        );

        const deployResult = await complianceGateway.sendDeploy(deployer.getSender(), toNano('0.05'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: complianceGateway.address,
            deploy: true,
            success: true,
        });
    });

    it('should deploy successfully', async () => {
        // Deployment tested in beforeEach
    });

    it('should submit KYC application successfully', async () => {
        const applicant = await blockchain.treasury('applicant');
        const kycDataHash = beginCell().storeUint(123456, 256).endCell();

        const result = await complianceGateway.sendSubmitKycApplication(applicant.getSender(), {
            value: toNano('0.1'),
            tier: 3, // Institutional tier
            kycProviderId: 1,
            kycDataHash,
        });

        expect(result.transactions).toHaveTransaction({
            from: applicant.address,
            to: complianceGateway.address,
            success: true,
        });
    });

    it('should validate tier (1/2/3)', async () => {
        const applicant = await blockchain.treasury('applicant');
        const kycDataHash = beginCell().storeUint(123456, 256).endCell();

        // Valid tier 1 (Basic)
        const result1 = await complianceGateway.sendSubmitKycApplication(applicant.getSender(), {
            value: toNano('0.1'),
            tier: 1,
            kycProviderId: 1,
            kycDataHash,
        });
        expect(result1.transactions).toHaveTransaction({
            from: applicant.address,
            to: complianceGateway.address,
            success: true,
        });

        // Invalid tier (0)
        const applicant2 = await blockchain.treasury('applicant2');
        const result2 = await complianceGateway.sendSubmitKycApplication(applicant2.getSender(), {
            value: toNano('0.1'),
            tier: 0, // Invalid
            kycProviderId: 1,
            kycDataHash,
        });
        expect(result2.transactions).toHaveTransaction({
            from: applicant2.address,
            to: complianceGateway.address,
            success: false,
            exitCode: 400,
        });

        // Invalid tier (4)
        const applicant3 = await blockchain.treasury('applicant3');
        const result3 = await complianceGateway.sendSubmitKycApplication(applicant3.getSender(), {
            value: toNano('0.1'),
            tier: 4, // Invalid
            kycProviderId: 1,
            kycDataHash,
        });
        expect(result3.transactions).toHaveTransaction({
            from: applicant3.address,
            to: complianceGateway.address,
            success: false,
            exitCode: 400,
        });
    });

    it('should allow admin to approve KYC', async () => {
        const applicant = await blockchain.treasury('applicant');
        const kycDataHash = beginCell().storeUint(123456, 256).endCell();

        // Submit application
        await complianceGateway.sendSubmitKycApplication(applicant.getSender(), {
            value: toNano('0.1'),
            tier: 3,
            kycProviderId: 1,
            kycDataHash,
        });

        // Admin approves
        const result = await complianceGateway.sendApproveKyc(deployer.getSender(), {
            value: toNano('0.1'),
            applicant: applicant.address,
        });

        expect(result.transactions).toHaveTransaction({
            from: deployer.address,
            to: complianceGateway.address,
            success: true,
        });

        const status = await complianceGateway.getComplianceStatus(applicant.address);
        expect(status.status).toBe(1); // Approved
    });

    it('should allow admin to reject KYC', async () => {
        const applicant = await blockchain.treasury('applicant');
        const kycDataHash = beginCell().storeUint(123456, 256).endCell();

        // Submit application
        await complianceGateway.sendSubmitKycApplication(applicant.getSender(), {
            value: toNano('0.1'),
            tier: 3,
            kycProviderId: 1,
            kycDataHash,
        });

        // Admin rejects
        const result = await complianceGateway.sendRejectKyc(deployer.getSender(), {
            value: toNano('0.1'),
            applicant: applicant.address,
            reasonCode: 100, // Insufficient documentation
        });

        expect(result.transactions).toHaveTransaction({
            from: deployer.address,
            to: complianceGateway.address,
            success: true,
        });

        const status = await complianceGateway.getComplianceStatus(applicant.address);
        expect(status.status).toBe(2); // Rejected
    });

    it('should allow admin to revoke compliance', async () => {
        const investor = await blockchain.treasury('investor');
        const kycDataHash = beginCell().storeUint(123456, 256).endCell();

        // Submit and approve
        await complianceGateway.sendSubmitKycApplication(investor.getSender(), {
            value: toNano('0.1'),
            tier: 3,
            kycProviderId: 1,
            kycDataHash,
        });

        await complianceGateway.sendApproveKyc(deployer.getSender(), {
            value: toNano('0.1'),
            applicant: investor.address,
        });

        // Revoke compliance
        const result = await complianceGateway.sendRevokeCompliance(deployer.getSender(), {
            value: toNano('0.1'),
            investor: investor.address,
            reasonCode: 200, // Suspicious activity
        });

        expect(result.transactions).toHaveTransaction({
            from: deployer.address,
            to: complianceGateway.address,
            success: true,
        });
    });

    it('should retrieve compliance status correctly', async () => {
        const applicant = await blockchain.treasury('applicant');
        const kycDataHash = beginCell().storeUint(123456, 256).endCell();

        await complianceGateway.sendSubmitKycApplication(applicant.getSender(), {
            value: toNano('0.1'),
            tier: 2, // Enhanced
            kycProviderId: 1,
            kycDataHash,
        });

        await complianceGateway.sendApproveKyc(deployer.getSender(), {
            value: toNano('0.1'),
            applicant: applicant.address,
        });

        const status = await complianceGateway.getComplianceStatus(applicant.address);

        expect(status.status).toBe(1); // Approved
        expect(status.tier).toBe(2); // Enhanced tier
        expect(status.approvalTime).toBeGreaterThan(0);
        expect(status.expiryTime).toBeGreaterThan(status.approvalTime);
    });

    it('should check compliance status with is_compliant', async () => {
        const applicant = await blockchain.treasury('applicant');
        const kycDataHash = beginCell().storeUint(123456, 256).endCell();

        // Before approval
        const compliantBefore = await complianceGateway.isCompliant(applicant.address);
        expect(compliantBefore).toBe(false);

        // Submit and approve
        await complianceGateway.sendSubmitKycApplication(applicant.getSender(), {
            value: toNano('0.1'),
            tier: 3,
            kycProviderId: 1,
            kycDataHash,
        });

        await complianceGateway.sendApproveKyc(deployer.getSender(), {
            value: toNano('0.1'),
            applicant: applicant.address,
        });

        // After approval
        const compliantAfter = await complianceGateway.isCompliant(applicant.address);
        expect(compliantAfter).toBe(true);
    });

    it('should enforce 1-year expiry period', async () => {
        const applicant = await blockchain.treasury('applicant');
        const kycDataHash = beginCell().storeUint(123456, 256).endCell();

        await complianceGateway.sendSubmitKycApplication(applicant.getSender(), {
            value: toNano('0.1'),
            tier: 3,
            kycProviderId: 1,
            kycDataHash,
        });

        await complianceGateway.sendApproveKyc(deployer.getSender(), {
            value: toNano('0.1'),
            applicant: applicant.address,
        });

        const status = await complianceGateway.getComplianceStatus(applicant.address);
        const approvalTime = status.approvalTime;
        const expiryTime = status.expiryTime;

        // Should be approximately 1 year (365 days)
        const oneYear = 365 * 86400;
        expect(Math.abs((expiryTime - approvalTime) - oneYear)).toBeLessThan(100);
    });

    it('should handle expired compliance', async () => {
        const applicant = await blockchain.treasury('applicant');
        const kycDataHash = beginCell().storeUint(123456, 256).endCell();

        await complianceGateway.sendSubmitKycApplication(applicant.getSender(), {
            value: toNano('0.1'),
            tier: 3,
            kycProviderId: 1,
            kycDataHash,
        });

        await complianceGateway.sendApproveKyc(deployer.getSender(), {
            value: toNano('0.1'),
            applicant: applicant.address,
        });

        // Fast-forward time by 366 days (past expiry)
        blockchain.now = (blockchain.now || Math.floor(Date.now() / 1000)) + (366 * 86400);

        const isCompliant = await complianceGateway.isCompliant(applicant.address);
        expect(isCompliant).toBe(false); // Should be expired
    });

    it('should reject admin operations from non-admin', async () => {
        const attacker = await blockchain.treasury('attacker');
        const applicant = await blockchain.treasury('applicant');

        const result = await complianceGateway.sendApproveKyc(attacker.getSender(), {
            value: toNano('0.1'),
            applicant: applicant.address,
        });

        expect(result.transactions).toHaveTransaction({
            from: attacker.address,
            to: complianceGateway.address,
            success: false,
            exitCode: 403, // Unauthorized
        });
    });

    it('should track compliance statistics', async () => {
        const applicant1 = await blockchain.treasury('applicant1');
        const applicant2 = await blockchain.treasury('applicant2');
        const applicant3 = await blockchain.treasury('applicant3');
        const kycDataHash = beginCell().storeUint(123456, 256).endCell();

        // Application 1: Approved
        await complianceGateway.sendSubmitKycApplication(applicant1.getSender(), {
            value: toNano('0.1'),
            tier: 3,
            kycProviderId: 1,
            kycDataHash,
        });
        await complianceGateway.sendApproveKyc(deployer.getSender(), {
            value: toNano('0.1'),
            applicant: applicant1.address,
        });

        // Application 2: Rejected
        await complianceGateway.sendSubmitKycApplication(applicant2.getSender(), {
            value: toNano('0.1'),
            tier: 3,
            kycProviderId: 1,
            kycDataHash,
        });
        await complianceGateway.sendRejectKyc(deployer.getSender(), {
            value: toNano('0.1'),
            applicant: applicant2.address,
            reasonCode: 100,
        });

        // Application 3: Approved
        await complianceGateway.sendSubmitKycApplication(applicant3.getSender(), {
            value: toNano('0.1'),
            tier: 3,
            kycProviderId: 1,
            kycDataHash,
        });
        await complianceGateway.sendApproveKyc(deployer.getSender(), {
            value: toNano('0.1'),
            applicant: applicant3.address,
        });

        const stats = await complianceGateway.getComplianceStats();
        expect(stats.totalApproved).toBe(2);
        expect(stats.totalRejected).toBe(1);
    });

    it('should handle multiple applications independently', async () => {
        const applicant1 = await blockchain.treasury('applicant1');
        const applicant2 = await blockchain.treasury('applicant2');
        const applicant3 = await blockchain.treasury('applicant3');
        const kycDataHash = beginCell().storeUint(123456, 256).endCell();

        // Different tiers
        await complianceGateway.sendSubmitKycApplication(applicant1.getSender(), {
            value: toNano('0.1'),
            tier: 1, // Basic
            kycProviderId: 1,
            kycDataHash,
        });

        await complianceGateway.sendSubmitKycApplication(applicant2.getSender(), {
            value: toNano('0.1'),
            tier: 2, // Enhanced
            kycProviderId: 2,
            kycDataHash,
        });

        await complianceGateway.sendSubmitKycApplication(applicant3.getSender(), {
            value: toNano('0.1'),
            tier: 3, // Institutional
            kycProviderId: 3,
            kycDataHash,
        });

        // Approve all
        await complianceGateway.sendApproveKyc(deployer.getSender(), {
            value: toNano('0.1'),
            applicant: applicant1.address,
        });

        await complianceGateway.sendApproveKyc(deployer.getSender(), {
            value: toNano('0.1'),
            applicant: applicant2.address,
        });

        await complianceGateway.sendApproveKyc(deployer.getSender(), {
            value: toNano('0.1'),
            applicant: applicant3.address,
        });

        const status1 = await complianceGateway.getComplianceStatus(applicant1.address);
        const status2 = await complianceGateway.getComplianceStatus(applicant2.address);
        const status3 = await complianceGateway.getComplianceStatus(applicant3.address);

        expect(status1.tier).toBe(1);
        expect(status2.tier).toBe(2);
        expect(status3.tier).toBe(3);
        expect(status1.status).toBe(1); // All approved
        expect(status2.status).toBe(1);
        expect(status3.status).toBe(1);
    });

    it('should enforce tier limits correctly', async () => {
        const applicant = await blockchain.treasury('applicant');
        const kycDataHash = beginCell().storeUint(123456, 256).endCell();

        // Tier 1 (Basic): 1-3
        const result1 = await complianceGateway.sendSubmitKycApplication(applicant.getSender(), {
            value: toNano('0.1'),
            tier: 1,
            kycProviderId: 1,
            kycDataHash,
        });
        expect(result1.transactions).toHaveTransaction({
            from: applicant.address,
            to: complianceGateway.address,
            success: true,
        });

        const applicant2 = await blockchain.treasury('applicant2');
        // Tier 2 (Enhanced)
        const result2 = await complianceGateway.sendSubmitKycApplication(applicant2.getSender(), {
            value: toNano('0.1'),
            tier: 2,
            kycProviderId: 1,
            kycDataHash,
        });
        expect(result2.transactions).toHaveTransaction({
            from: applicant2.address,
            to: complianceGateway.address,
            success: true,
        });

        const applicant3 = await blockchain.treasury('applicant3');
        // Tier 3 (Institutional)
        const result3 = await complianceGateway.sendSubmitKycApplication(applicant3.getSender(), {
            value: toNano('0.1'),
            tier: 3,
            kycProviderId: 1,
            kycDataHash,
        });
        expect(result3.transactions).toHaveTransaction({
            from: applicant3.address,
            to: complianceGateway.address,
            success: true,
        });
    });
});
