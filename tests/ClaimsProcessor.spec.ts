import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano, Address, beginCell } from '@ton/core';
import { ClaimsProcessor } from '../wrappers/ClaimsProcessor';
import { MultiTrancheVault, createInitialTrancheData } from '../wrappers/MultiTrancheVault';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

describe('ClaimsProcessor - 6-Tier Waterfall Integration', () => {
    let claimsProcessorCode: Cell;
    let vaultCode: Cell;

    beforeAll(async () => {
        claimsProcessorCode = await compile('ClaimsProcessor');
        vaultCode = await compile('MultiTrancheVault');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let admin: SandboxContract<TreasuryContract>;
    let user: SandboxContract<TreasuryContract>;
    let treasury: SandboxContract<TreasuryContract>;
    let priceOracle: SandboxContract<TreasuryContract>;
    let claimsProcessor: SandboxContract<ClaimsProcessor>;
    let multiTrancheVault: SandboxContract<MultiTrancheVault>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');
        admin = await blockchain.treasury('admin');
        user = await blockchain.treasury('user');
        treasury = await blockchain.treasury('treasury');
        priceOracle = await blockchain.treasury('price_oracle');

        // Deploy MultiTrancheVault first
        multiTrancheVault = blockchain.openContract(
            MultiTrancheVault.createFromConfig(
                {
                    ownerAddress: deployer.address,
                    totalCapital: 0n,
                    totalCoverageSold: 0n,
                    accumulatedPremiums: 0n,
                    accumulatedLosses: 0n,
                    trancheData: createInitialTrancheData(),
                    depositorBalances: null,
                    paused: false,
                    adminAddress: admin.address,
                    claimsProcessorAddress: Address.parse('EQD__________________________________________0vo'), // placeholder, will update
                    reentrancyGuard: false,
                    seqNo: 0,
                    circuitBreakerWindowStart: 0,
                    circuitBreakerLosses: 0n,
                },
                vaultCode
            )
        );

        await multiTrancheVault.sendDeploy(deployer.getSender(), toNano('0.05'));

        // Deploy ClaimsProcessor
        claimsProcessor = blockchain.openContract(
            ClaimsProcessor.createFromConfig(
                {
                    ownerAddress: deployer.address,
                    nextClaimId: 0n,
                    treasuryAddress: treasury.address,
                    multiTrancheVaultAddress: multiTrancheVault.address,
                    priceOracleAddress: priceOracle.address,
                    autoApprovalThreshold: 500, // 5%
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

        // Update vault's claims processor address
        await multiTrancheVault.sendSetClaimsProcessor(
            admin.getSender(),
            toNano('0.05'),
            claimsProcessor.address
        );
    });

    describe('Deployment and Configuration', () => {
        it('should deploy successfully', async () => {
            const vaultAddr = await claimsProcessor.getVaultAddress();
            expect(vaultAddr.toString()).toEqual(multiTrancheVault.address.toString());
        });

        it('should have correct initial state', async () => {
            const totalLosses = await claimsProcessor.getTotalLosses();
            expect(totalLosses).toEqual(0n);
        });

        it('should have zero losses for all tranches initially', async () => {
            for (let trancheId = 1; trancheId <= 6; trancheId++) {
                const losses = await claimsProcessor.getTrancheLosses(trancheId);
                expect(losses).toEqual(0n);
            }
        });
    });

    describe('Claim Filing', () => {
        it('should file a claim successfully', async () => {
            const evidence = beginCell().storeUint(123456, 256).endCell();

            const result = await claimsProcessor.sendFileClaim(
                user.getSender(),
                {
                    value: toNano('0.1'),
                    policyId: 1n,
                    coverageType: 0, // DEPEG
                    chainId: 0, // ETHEREUM
                    stablecoinId: 0, // USDC
                    coverageAmount: toNano('1000'),
                    evidence,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: user.address,
                to: claimsProcessor.address,
                success: true,
            });

            // Check claim status
            const status = await claimsProcessor.getClaimStatus(0n);
            expect(status.status).toBe(0); // PENDING
            expect(status.coverageAmount).toEqual(toNano('1000'));
        });
    });

    describe('Claim Approval and Payout', () => {
        it('should approve claim and trigger vault loss absorption', async () => {
            // File a claim
            const evidence = beginCell().storeUint(123456, 256).endCell();
            await claimsProcessor.sendFileClaim(user.getSender(), {
                value: toNano('0.1'),
                policyId: 1n,
                coverageType: 0,
                chainId: 0,
                stablecoinId: 0,
                coverageAmount: toNano('1000'),
                evidence,
            });

            // Approve claim (as owner)
            const result = await claimsProcessor.sendAdminApproveClaim(
                deployer.getSender(),
                {
                    value: toNano('0.2'),
                    claimId: 0n,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: deployer.address,
                to: claimsProcessor.address,
                success: true,
            });

            // Should send absorb_loss message to vault
            expect(result.transactions).toHaveTransaction({
                from: claimsProcessor.address,
                to: multiTrancheVault.address,
                success: true,
            });

            // Check claim is now approved
            const status = await claimsProcessor.getClaimStatus(0n);
            expect(status.status).toBe(1); // APPROVED
        });
    });

    describe('Claim Rejection', () => {
        it('should reject claim successfully', async () => {
            // File a claim
            const evidence = beginCell().storeUint(123456, 256).endCell();
            await claimsProcessor.sendFileClaim(user.getSender(), {
                value: toNano('0.1'),
                policyId: 1n,
                coverageType: 0,
                chainId: 0,
                stablecoinId: 0,
                coverageAmount: toNano('1000'),
                evidence,
            });

            // Reject claim
            const result = await claimsProcessor.sendAdminRejectClaim(
                deployer.getSender(),
                {
                    value: toNano('0.1'),
                    claimId: 0n,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: deployer.address,
                to: claimsProcessor.address,
                success: true,
            });

            // Check claim is now rejected
            const status = await claimsProcessor.getClaimStatus(0n);
            expect(status.status).toBe(2); // REJECTED
        });

        it('should prevent non-owner from rejecting claim', async () => {
            // File a claim
            const evidence = beginCell().storeUint(123456, 256).endCell();
            await claimsProcessor.sendFileClaim(user.getSender(), {
                value: toNano('0.1'),
                policyId: 1n,
                coverageType: 0,
                chainId: 0,
                stablecoinId: 0,
                coverageAmount: toNano('1000'),
                evidence,
            });

            // Try to reject from non-owner
            const result = await claimsProcessor.sendAdminRejectClaim(
                user.getSender(),
                {
                    value: toNano('0.1'),
                    claimId: 0n,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: user.address,
                to: claimsProcessor.address,
                success: false,
                exitCode: 403, // Access denied
            });
        });
    });

    describe('Auto-Verification', () => {
        it('should auto-verify claim when event is verified', async () => {
            // Add a verified event
            const eventHash = 12345678901234567890n;
            await claimsProcessor.sendAddVerifiedEvent(
                deployer.getSender(),
                {
                    value: toNano('0.1'),
                    eventHash,
                }
            );

            // File a claim for auto-verifiable type
            const evidence = beginCell().storeUint(123456, 256).endCell();
            const result = await claimsProcessor.sendFileClaim(user.getSender(), {
                value: toNano('0.1'),
                policyId: 1n,
                coverageType: 0, // DEPEG - auto-verifiable
                chainId: 0, // ETHEREUM
                stablecoinId: 0,
                coverageAmount: toNano('1000'),
                evidence,
            });

            expect(result.transactions).toHaveTransaction({
                from: user.address,
                to: claimsProcessor.address,
                success: true,
            });

            // Claim should be auto-approved
            const status = await claimsProcessor.getClaimStatus(0n);
            expect(status.autoApproved).toBe(true);
        });
    });

    describe('Multiple Claims', () => {
        it('should handle multiple sequential claims', async () => {
            const evidence = beginCell().storeUint(123456, 256).endCell();

            // File 3 claims
            for (let i = 0; i < 3; i++) {
                await claimsProcessor.sendFileClaim(user.getSender(), {
                    value: toNano('0.1'),
                    policyId: BigInt(i + 1),
                    coverageType: 0,
                    chainId: 0,
                    stablecoinId: 0,
                    coverageAmount: toNano('1000'),
                    evidence,
                });
            }

            // Check all claims exist
            for (let i = 0; i < 3; i++) {
                const status = await claimsProcessor.getClaimStatus(BigInt(i));
                expect(status.status).toBe(0); // All PENDING
                expect(status.coverageAmount).toEqual(toNano('1000'));
            }
        });
    });

    describe('Gas Optimization', () => {
        it('should use reasonable gas for claim filing', async () => {
            const evidence = beginCell().storeUint(123456, 256).endCell();

            const result = await claimsProcessor.sendFileClaim(user.getSender(), {
                value: toNano('0.1'),
                policyId: 1n,
                coverageType: 0,
                chainId: 0,
                stablecoinId: 0,
                coverageAmount: toNano('1000'),
                evidence,
            });

            // Count transactions (should be 2-3 max: external -> internal -> result)
            expect(result.transactions.length).toBeLessThanOrEqual(5);
        });

        it('should use reasonable gas for claim approval', async () => {
            // File a claim first
            const evidence = beginCell().storeUint(123456, 256).endCell();
            await claimsProcessor.sendFileClaim(user.getSender(), {
                value: toNano('0.1'),
                policyId: 1n,
                coverageType: 0,
                chainId: 0,
                stablecoinId: 0,
                coverageAmount: toNano('1000'),
                evidence,
            });

            const result = await claimsProcessor.sendAdminApproveClaim(
                deployer.getSender(),
                {
                    value: toNano('0.2'),
                    claimId: 0n,
                }
            );

            // Should include: external -> approve -> vault message
            expect(result.transactions.length).toBeLessThanOrEqual(6);
        });
    });
});
