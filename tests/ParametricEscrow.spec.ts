import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano, Address, beginCell } from '@ton/core';
import { ParametricEscrow, ParametricEscrowConfig, EscrowStatus, TimeoutAction, PartyAllocation } from '../wrappers/ParametricEscrow';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

describe('ParametricEscrow', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compile('ParametricEscrow');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let payer: SandboxContract<TreasuryContract>;
    let payee: SandboxContract<TreasuryContract>;
    let oracle: SandboxContract<TreasuryContract>;
    let thirdParty: SandboxContract<TreasuryContract>;
    let parametricEscrow: SandboxContract<ParametricEscrow>;

    const ESCROW_ID = 12345n;
    const ESCROW_AMOUNT = toNano('10');
    const CONDITION_HASH = 0x1234567890abcdefn;
    const TIMEOUT_SECONDS = 3600; // 1 hour

    function createEscrowConfig(
        timeoutAction: TimeoutAction,
        additionalParties?: PartyAllocation[],
        protectionPolicyId?: bigint
    ): ParametricEscrowConfig {
        return {
            escrowId: ESCROW_ID,
            payerAddress: payer.address,
            payeeAddress: payee.address,
            oracleAddress: oracle.address,
            amount: 0n, // Will be set during initialization
            status: EscrowStatus.PENDING,
            createdAt: Math.floor(Date.now() / 1000),
            timeoutSeconds: TIMEOUT_SECONDS,
            timeoutAction,
            conditionHash: CONDITION_HASH,
            additionalParties,
            protectionPolicyId,
        };
    }

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');
        payer = await blockchain.treasury('payer');
        payee = await blockchain.treasury('payee');
        oracle = await blockchain.treasury('oracle');
        thirdParty = await blockchain.treasury('third_party');

        const config = createEscrowConfig({ type: 'refund_payer' });

        parametricEscrow = blockchain.openContract(
            ParametricEscrow.createFromConfig(config, code)
        );

        // Deploy contract (but don't initialize yet)
        const deployResult = await parametricEscrow.sendDeploy(payer.getSender(), toNano('0.05'));

        expect(deployResult.transactions).toHaveTransaction({
            from: payer.address,
            to: parametricEscrow.address,
            deploy: true,
            success: true,
        });
    });

    describe('Deployment and Initialization', () => {
        it('should deploy successfully', async () => {
            const status = await parametricEscrow.getStatus();
            expect(status).toBe(EscrowStatus.ACTIVE); // Becomes active after deploy+initialize
        });

        it('should store correct escrow data', async () => {
            const data = await parametricEscrow.getEscrowData();
            expect(data.escrowId).toBe(ESCROW_ID);
            expect(data.payer.toString()).toBe(payer.address.toString());
            expect(data.payee.toString()).toBe(payee.address.toString());
            expect(data.oracle.toString()).toBe(oracle.address.toString());
        });

        it('should have correct condition hash', async () => {
            const hash = await parametricEscrow.getConditionHash();
            expect(hash).toBe(CONDITION_HASH);
        });

        it('should reject initialization from non-payer', async () => {
            // Create a new escrow that hasn't been initialized
            const config = createEscrowConfig({ type: 'refund_payer' });
            const newEscrow = blockchain.openContract(
                ParametricEscrow.createFromConfig(config, code)
            );

            const result = await newEscrow.sendDeploy(payee.getSender(), ESCROW_AMOUNT);

            expect(result.transactions).toHaveTransaction({
                from: payee.address,
                to: newEscrow.address,
                success: false,
                exitCode: 411, // ERROR_PAYER_ONLY
            });
        });

        it('should reject double initialization', async () => {
            // First initialization succeeded in beforeEach
            // Try to initialize again
            const result = await parametricEscrow.sendDeploy(payer.getSender(), ESCROW_AMOUNT);

            expect(result.transactions).toHaveTransaction({
                from: payer.address,
                to: parametricEscrow.address,
                success: false,
                exitCode: 409, // ERROR_ALREADY_INITIALIZED
            });
        });

        it('should store correct escrow amount after initialization', async () => {
            const amount = await parametricEscrow.getAmount();
            expect(amount).toBeGreaterThan(0n); // Should have escrowed funds
        });

        it('should have correct timeout configuration', async () => {
            const timeoutDetails = await parametricEscrow.getTimeoutDetails();
            expect(timeoutDetails.timeoutAction).toBe(0); // TIMEOUT_REFUND_PAYER
        });
    });

    describe('Simple Release (No Additional Parties)', () => {
        it('should release funds to payee when oracle provides correct hash', async () => {
            const payeeBalanceBefore = await payee.getBalance();

            const result = await parametricEscrow.sendRelease(
                oracle.getSender(),
                {
                    conditionHash: CONDITION_HASH,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: parametricEscrow.address,
                to: payee.address,
                success: true,
            });

            const status = await parametricEscrow.getStatus();
            expect(status).toBe(EscrowStatus.RELEASED);

            const amount = await parametricEscrow.getAmount();
            expect(amount).toBe(0n);

            const payeeBalanceAfter = await payee.getBalance();
            expect(payeeBalanceAfter).toBeGreaterThan(payeeBalanceBefore);
        });

        it('should reject release from non-oracle', async () => {
            const result = await parametricEscrow.sendRelease(
                payer.getSender(),
                {
                    conditionHash: CONDITION_HASH,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: payer.address,
                to: parametricEscrow.address,
                success: false,
                exitCode: 402, // ERROR_ORACLE_ONLY
            });
        });

        it('should reject release with wrong condition hash', async () => {
            const wrongHash = 0xdeadbeefn;

            const result = await parametricEscrow.sendRelease(
                oracle.getSender(),
                {
                    conditionHash: wrongHash,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: oracle.address,
                to: parametricEscrow.address,
                success: false,
                exitCode: 404, // ERROR_INVALID_CONDITION_HASH
            });
        });

        it('should send notification to payer after release', async () => {
            const result = await parametricEscrow.sendRelease(
                oracle.getSender(),
                {
                    conditionHash: CONDITION_HASH,
                }
            );

            // Check for notification message to payer
            expect(result.transactions).toHaveTransaction({
                from: parametricEscrow.address,
                to: payer.address,
                success: true,
            });
        });
    });

    describe('Multi-Party Release', () => {
        let party1: SandboxContract<TreasuryContract>;
        let party2: SandboxContract<TreasuryContract>;
        let party3: SandboxContract<TreasuryContract>;

        beforeEach(async () => {
            party1 = await blockchain.treasury('party1');
            party2 = await blockchain.treasury('party2');
            party3 = await blockchain.treasury('party3');
        });

        it('should distribute funds to multiple parties correctly', async () => {
            const additionalParties: PartyAllocation[] = [
                { address: party1.address, percentage: 20 },
                { address: party2.address, percentage: 15 },
                { address: party3.address, percentage: 10 },
            ];

            const payeeBalanceBefore = await payee.getBalance();
            const party1BalanceBefore = await party1.getBalance();
            const party2BalanceBefore = await party2.getBalance();
            const party3BalanceBefore = await party3.getBalance();

            const result = await parametricEscrow.sendMultiPartyRelease(
                oracle.getSender(),
                {
                    conditionHash: CONDITION_HASH,
                    additionalParties,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: parametricEscrow.address,
                to: party1.address,
                success: true,
            });

            expect(result.transactions).toHaveTransaction({
                from: parametricEscrow.address,
                to: party2.address,
                success: true,
            });

            expect(result.transactions).toHaveTransaction({
                from: parametricEscrow.address,
                to: party3.address,
                success: true,
            });

            expect(result.transactions).toHaveTransaction({
                from: parametricEscrow.address,
                to: payee.address,
                success: true,
            });

            const status = await parametricEscrow.getStatus();
            expect(status).toBe(EscrowStatus.RELEASED);

            // Verify balances increased
            expect(await party1.getBalance()).toBeGreaterThan(party1BalanceBefore);
            expect(await party2.getBalance()).toBeGreaterThan(party2BalanceBefore);
            expect(await party3.getBalance()).toBeGreaterThan(party3BalanceBefore);
            expect(await payee.getBalance()).toBeGreaterThan(payeeBalanceBefore);
        });

        it('should give remaining funds to primary payee', async () => {
            const additionalParties: PartyAllocation[] = [
                { address: party1.address, percentage: 30 },
            ];

            await parametricEscrow.sendMultiPartyRelease(
                oracle.getSender(),
                {
                    conditionHash: CONDITION_HASH,
                    additionalParties,
                }
            );

            // Payee should receive 70% (100% - 30%)
            const status = await parametricEscrow.getStatus();
            expect(status).toBe(EscrowStatus.RELEASED);
        });

        it('should reject multi-party release from non-oracle', async () => {
            const additionalParties: PartyAllocation[] = [
                { address: party1.address, percentage: 20 },
            ];

            const result = await parametricEscrow.sendMultiPartyRelease(
                payer.getSender(),
                {
                    conditionHash: CONDITION_HASH,
                    additionalParties,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: payer.address,
                to: parametricEscrow.address,
                success: false,
                exitCode: 402, // ERROR_ORACLE_ONLY
            });
        });

        it('should reject multi-party release with wrong hash', async () => {
            const additionalParties: PartyAllocation[] = [
                { address: party1.address, percentage: 20 },
            ];

            const result = await parametricEscrow.sendMultiPartyRelease(
                oracle.getSender(),
                {
                    conditionHash: 0xbadhashn,
                    additionalParties,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: oracle.address,
                to: parametricEscrow.address,
                success: false,
                exitCode: 404, // ERROR_INVALID_CONDITION_HASH
            });
        });
    });

    describe('Cancellation', () => {
        it('should allow payer to cancel', async () => {
            const payerBalanceBefore = await payer.getBalance();

            const result = await parametricEscrow.sendCancel(payer.getSender());

            expect(result.transactions).toHaveTransaction({
                from: parametricEscrow.address,
                to: payer.address,
                success: true,
            });

            const status = await parametricEscrow.getStatus();
            expect(status).toBe(EscrowStatus.CANCELLED);

            const amount = await parametricEscrow.getAmount();
            expect(amount).toBe(0n);

            // Payer should receive refund
            const payerBalanceAfter = await payer.getBalance();
            expect(payerBalanceAfter).toBeGreaterThan(payerBalanceBefore);
        });

        it('should allow payee to cancel', async () => {
            const result = await parametricEscrow.sendCancel(payee.getSender());

            expect(result.transactions).toHaveTransaction({
                from: parametricEscrow.address,
                to: payer.address,
                success: true,
            });

            const status = await parametricEscrow.getStatus();
            expect(status).toBe(EscrowStatus.CANCELLED);
        });

        it('should reject cancellation from unauthorized party', async () => {
            const result = await parametricEscrow.sendCancel(thirdParty.getSender());

            expect(result.transactions).toHaveTransaction({
                from: thirdParty.address,
                to: parametricEscrow.address,
                success: false,
                exitCode: 405, // ERROR_INVALID_CANCELLER
            });
        });

        it('should send notification to other party', async () => {
            const result = await parametricEscrow.sendCancel(payer.getSender());

            // Should notify payee
            expect(result.transactions).toHaveTransaction({
                from: parametricEscrow.address,
                to: payee.address,
                success: true,
            });
        });

        it('should not allow cancellation after release', async () => {
            // First release
            await parametricEscrow.sendRelease(oracle.getSender(), {
                conditionHash: CONDITION_HASH,
            });

            // Then try to cancel
            const result = await parametricEscrow.sendCancel(payer.getSender());

            expect(result.transactions).toHaveTransaction({
                from: payer.address,
                to: parametricEscrow.address,
                success: false,
                exitCode: 403, // ERROR_NOT_ACTIVE
            });
        });
    });

    describe('Timeout Handling - Refund Payer', () => {
        let timedOutEscrow: SandboxContract<ParametricEscrow>;

        beforeEach(async () => {
            const config = createEscrowConfig({ type: 'refund_payer' });
            config.timeoutSeconds = 10; // 10 seconds

            timedOutEscrow = blockchain.openContract(
                ParametricEscrow.createFromConfig(config, code)
            );

            await timedOutEscrow.sendDeploy(payer.getSender(), ESCROW_AMOUNT);
        });

        it('should refund payer after timeout', async () => {
            // Advance time past timeout
            blockchain.now = Math.floor(Date.now() / 1000) + 100;

            const payerBalanceBefore = await payer.getBalance();

            const result = await timedOutEscrow.sendHandleTimeout(thirdParty.getSender());

            expect(result.transactions).toHaveTransaction({
                from: timedOutEscrow.address,
                to: payer.address,
                success: true,
            });

            const status = await timedOutEscrow.getStatus();
            expect(status).toBe(EscrowStatus.TIMED_OUT);

            const payerBalanceAfter = await payer.getBalance();
            expect(payerBalanceAfter).toBeGreaterThan(payerBalanceBefore);
        });

        it('should reject timeout handling before timeout', async () => {
            const result = await timedOutEscrow.sendHandleTimeout(thirdParty.getSender());

            expect(result.transactions).toHaveTransaction({
                from: thirdParty.address,
                to: timedOutEscrow.address,
                success: false,
                exitCode: 407, // ERROR_NOT_TIMED_OUT
            });
        });

        it('should notify both parties on timeout', async () => {
            blockchain.now = Math.floor(Date.now() / 1000) + 100;

            const result = await timedOutEscrow.sendHandleTimeout(thirdParty.getSender());

            expect(result.transactions).toHaveTransaction({
                from: timedOutEscrow.address,
                to: payer.address,
                success: true,
            });

            expect(result.transactions).toHaveTransaction({
                from: timedOutEscrow.address,
                to: payee.address,
                success: true,
            });
        });
    });

    describe('Timeout Handling - Release to Payee', () => {
        let timedOutEscrow: SandboxContract<ParametricEscrow>;

        beforeEach(async () => {
            const config = createEscrowConfig({ type: 'release_payee' });
            config.timeoutSeconds = 10;

            timedOutEscrow = blockchain.openContract(
                ParametricEscrow.createFromConfig(config, code)
            );

            await timedOutEscrow.sendDeploy(payer.getSender(), ESCROW_AMOUNT);
        });

        it('should release to payee after timeout', async () => {
            blockchain.now = Math.floor(Date.now() / 1000) + 100;

            const payeeBalanceBefore = await payee.getBalance();

            const result = await timedOutEscrow.sendHandleTimeout(thirdParty.getSender());

            expect(result.transactions).toHaveTransaction({
                from: timedOutEscrow.address,
                to: payee.address,
                success: true,
            });

            const status = await timedOutEscrow.getStatus();
            expect(status).toBe(EscrowStatus.TIMED_OUT);

            const payeeBalanceAfter = await payee.getBalance();
            expect(payeeBalanceAfter).toBeGreaterThan(payeeBalanceBefore);
        });
    });

    describe('Timeout Handling - Split', () => {
        let splitEscrow: SandboxContract<ParametricEscrow>;

        beforeEach(async () => {
            const config = createEscrowConfig({ type: 'split', percentage: 60 }); // 60% to payee, 40% to payer
            config.timeoutSeconds = 10;

            splitEscrow = blockchain.openContract(
                ParametricEscrow.createFromConfig(config, code)
            );

            await splitEscrow.sendDeploy(payer.getSender(), ESCROW_AMOUNT);
        });

        it('should split funds between payer and payee after timeout', async () => {
            blockchain.now = Math.floor(Date.now() / 1000) + 100;

            const payerBalanceBefore = await payer.getBalance();
            const payeeBalanceBefore = await payee.getBalance();

            const result = await splitEscrow.sendHandleTimeout(thirdParty.getSender());

            expect(result.transactions).toHaveTransaction({
                from: splitEscrow.address,
                to: payer.address,
                success: true,
            });

            expect(result.transactions).toHaveTransaction({
                from: splitEscrow.address,
                to: payee.address,
                success: true,
            });

            const status = await splitEscrow.getStatus();
            expect(status).toBe(EscrowStatus.TIMED_OUT);

            const payerBalanceAfter = await payer.getBalance();
            const payeeBalanceAfter = await payee.getBalance();

            expect(payerBalanceAfter).toBeGreaterThan(payerBalanceBefore);
            expect(payeeBalanceAfter).toBeGreaterThan(payeeBalanceBefore);
        });

        it('should split with correct percentages', async () => {
            blockchain.now = Math.floor(Date.now() / 1000) + 100;

            const timeoutDetails = await splitEscrow.getTimeoutDetails();
            expect(timeoutDetails.splitPercentage).toBe(60);
        });
    });

    describe('Dispute Freezing', () => {
        it('should allow oracle to freeze escrow', async () => {
            const result = await parametricEscrow.sendFreeze(oracle.getSender());

            expect(result.transactions).toHaveTransaction({
                from: oracle.address,
                to: parametricEscrow.address,
                success: true,
            });

            const status = await parametricEscrow.getStatus();
            expect(status).toBe(EscrowStatus.DISPUTED);
        });

        it('should reject freeze from non-oracle', async () => {
            const result = await parametricEscrow.sendFreeze(payer.getSender());

            expect(result.transactions).toHaveTransaction({
                from: payer.address,
                to: parametricEscrow.address,
                success: false,
                exitCode: 402, // ERROR_ORACLE_ONLY
            });
        });

        it('should notify both parties when frozen', async () => {
            const result = await parametricEscrow.sendFreeze(oracle.getSender());

            expect(result.transactions).toHaveTransaction({
                from: parametricEscrow.address,
                to: payer.address,
                success: true,
            });

            expect(result.transactions).toHaveTransaction({
                from: parametricEscrow.address,
                to: payee.address,
                success: true,
            });
        });

        it('should not allow release when disputed', async () => {
            await parametricEscrow.sendFreeze(oracle.getSender());

            const result = await parametricEscrow.sendRelease(oracle.getSender(), {
                conditionHash: CONDITION_HASH,
            });

            expect(result.transactions).toHaveTransaction({
                from: oracle.address,
                to: parametricEscrow.address,
                success: false,
                exitCode: 403, // ERROR_NOT_ACTIVE
            });
        });
    });

    describe('Oracle Management', () => {
        let newOracle: SandboxContract<TreasuryContract>;

        beforeEach(async () => {
            newOracle = await blockchain.treasury('new_oracle');
        });

        it('should allow oracle to update oracle address', async () => {
            const result = await parametricEscrow.sendUpdateOracle(oracle.getSender(), {
                newOracle: newOracle.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: oracle.address,
                to: parametricEscrow.address,
                success: true,
            });

            const data = await parametricEscrow.getEscrowData();
            expect(data.oracle.toString()).toBe(newOracle.address.toString());
        });

        it('should reject oracle update from non-oracle', async () => {
            const result = await parametricEscrow.sendUpdateOracle(payer.getSender(), {
                newOracle: newOracle.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: payer.address,
                to: parametricEscrow.address,
                success: false,
                exitCode: 402, // ERROR_ORACLE_ONLY
            });
        });

        it('should allow new oracle to perform operations', async () => {
            // Update oracle
            await parametricEscrow.sendUpdateOracle(oracle.getSender(), {
                newOracle: newOracle.address,
            });

            // New oracle should be able to release
            const result = await parametricEscrow.sendRelease(newOracle.getSender(), {
                conditionHash: CONDITION_HASH,
            });

            expect(result.transactions).toHaveTransaction({
                from: parametricEscrow.address,
                to: payee.address,
                success: true,
            });
        });
    });

    describe('Emergency Withdrawal', () => {
        it('should allow payer to emergency withdraw after 30 days in disputed status', async () => {
            // Freeze escrow
            await parametricEscrow.sendFreeze(oracle.getSender());

            // Advance time by 31 days
            blockchain.now = Math.floor(Date.now() / 1000) + (31 * 24 * 60 * 60);

            const payerBalanceBefore = await payer.getBalance();

            const result = await parametricEscrow.sendEmergencyWithdraw(payer.getSender());

            expect(result.transactions).toHaveTransaction({
                from: parametricEscrow.address,
                to: payer.address,
                success: true,
            });

            const status = await parametricEscrow.getStatus();
            expect(status).toBe(EscrowStatus.CANCELLED);

            const payerBalanceAfter = await payer.getBalance();
            expect(payerBalanceAfter).toBeGreaterThan(payerBalanceBefore);
        });

        it('should reject emergency withdraw before 30 days', async () => {
            await parametricEscrow.sendFreeze(oracle.getSender());

            // Only 10 days
            blockchain.now = Math.floor(Date.now() / 1000) + (10 * 24 * 60 * 60);

            const result = await parametricEscrow.sendEmergencyWithdraw(payer.getSender());

            expect(result.transactions).toHaveTransaction({
                from: payer.address,
                to: parametricEscrow.address,
                success: false,
                exitCode: 407, // ERROR_NOT_TIMED_OUT
            });
        });

        it('should reject emergency withdraw from non-payer', async () => {
            await parametricEscrow.sendFreeze(oracle.getSender());
            blockchain.now = Math.floor(Date.now() / 1000) + (31 * 24 * 60 * 60);

            const result = await parametricEscrow.sendEmergencyWithdraw(payee.getSender());

            expect(result.transactions).toHaveTransaction({
                from: payee.address,
                to: parametricEscrow.address,
                success: false,
                exitCode: 411, // ERROR_PAYER_ONLY
            });
        });

        it('should reject emergency withdraw if not disputed', async () => {
            blockchain.now = Math.floor(Date.now() / 1000) + (31 * 24 * 60 * 60);

            const result = await parametricEscrow.sendEmergencyWithdraw(payer.getSender());

            expect(result.transactions).toHaveTransaction({
                from: payer.address,
                to: parametricEscrow.address,
                success: false,
                exitCode: 410, // ERROR_INVALID_STATUS
            });
        });
    });

    describe('Get Methods', () => {
        it('should return correct time remaining', async () => {
            const timeRemaining = await parametricEscrow.getTimeRemaining();
            expect(timeRemaining).toBeGreaterThan(0);
            expect(timeRemaining).toBeLessThanOrEqual(TIMEOUT_SECONDS);
        });

        it('should return zero time remaining after timeout', async () => {
            blockchain.now = Math.floor(Date.now() / 1000) + TIMEOUT_SECONDS + 100;

            const timeRemaining = await parametricEscrow.getTimeRemaining();
            expect(timeRemaining).toBe(0);
        });

        it('should correctly check if timed out', async () => {
            let isTimedOut = await parametricEscrow.isTimedOut();
            expect(isTimedOut).toBe(false);

            blockchain.now = Math.floor(Date.now() / 1000) + TIMEOUT_SECONDS + 100;

            isTimedOut = await parametricEscrow.isTimedOut();
            expect(isTimedOut).toBe(true);
        });

        it('should return correct created timestamp', async () => {
            const createdAt = await parametricEscrow.getCreatedAt();
            expect(createdAt).toBeGreaterThan(0);
        });

        it('should return correct protection policy ID', async () => {
            const policyId = await parametricEscrow.getProtectionPolicyId();
            expect(policyId).toBe(0n); // Default is 0
        });
    });

    describe('Gas Usage Estimation', () => {
        it('should estimate gas for deployment', async () => {
            const config = createEscrowConfig({ type: 'refund_payer' });
            const newEscrow = blockchain.openContract(
                ParametricEscrow.createFromConfig(config, code)
            );

            const result = await newEscrow.sendDeploy(payer.getSender(), ESCROW_AMOUNT);

            console.log('Deploy gas usage:', result.transactions[1].totalFees);
        });

        it('should estimate gas for release', async () => {
            const result = await parametricEscrow.sendRelease(oracle.getSender(), {
                conditionHash: CONDITION_HASH,
            });

            console.log('Release gas usage:', result.transactions[1].totalFees);
        });

        it('should estimate gas for multi-party release', async () => {
            const party1 = await blockchain.treasury('party1');
            const party2 = await blockchain.treasury('party2');

            const result = await parametricEscrow.sendMultiPartyRelease(oracle.getSender(), {
                conditionHash: CONDITION_HASH,
                additionalParties: [
                    { address: party1.address, percentage: 30 },
                    { address: party2.address, percentage: 20 },
                ],
            });

            console.log('Multi-party release gas usage:', result.transactions[1].totalFees);
        });

        it('should estimate gas for timeout handling', async () => {
            blockchain.now = Math.floor(Date.now() / 1000) + TIMEOUT_SECONDS + 100;

            const result = await parametricEscrow.sendHandleTimeout(thirdParty.getSender());

            console.log('Timeout handling gas usage:', result.transactions[1].totalFees);
        });
    });
});
