import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano, Address, beginCell } from '@ton/core';
import { MultiTrancheVault, createInitialTrancheData } from '../../wrappers/MultiTrancheVault';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

/**
 * ASYNC DEPOSIT FLOW TESTS
 *
 * Tests comprehensive async deposit scenarios including:
 * - Successful two-phase deposit with mint confirmation
 * - Retry logic on mint failures
 * - Complete rollback on max retries exceeded
 * - Timeout-based automatic rollback
 * - Concurrent deposits with proper locking
 * - Deposits during paused state
 *
 * Coverage Target: 100% of deposit flow code paths
 */
describe('MultiTrancheVault - Async Deposit Flow', () => {
    let code: Cell;
    let tokenCode: Cell;

    beforeAll(async () => {
        code = await compile('MultiTrancheVault');
        // Mock token contract for mint operations
        tokenCode = await compile('SURE_BTC'); // Using existing token contract
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let admin: SandboxContract<TreasuryContract>;
    let claimsProcessor: SandboxContract<TreasuryContract>;
    let multiTrancheVault: SandboxContract<MultiTrancheVault>;
    let mockToken: SandboxContract<TreasuryContract>; // Mock token contract

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');
        admin = await blockchain.treasury('admin');
        claimsProcessor = await blockchain.treasury('claims_processor');
        mockToken = await blockchain.treasury('mock_token');

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
                    claimsProcessorAddress: claimsProcessor.address,
                    reentrancyGuard: false,
                    seqNo: 0,
                    circuitBreakerWindowStart: 0,
                    circuitBreakerLosses: 0n,
                },
                code
            )
        );

        const deployResult = await multiTrancheVault.sendDeploy(deployer.getSender(), toNano('0.05'));
        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: multiTrancheVault.address,
            deploy: true,
            success: true,
        });

        // Set token address for TRANCHE_BTC (1)
        await multiTrancheVault.sendSetTrancheToken(
            admin.getSender(),
            toNano('0.05'),
            1,
            mockToken.address
        );
    });

    describe('Test 1: Deposit → Mint → Success Confirmation → Balance Updated', () => {
        it('should complete full two-phase deposit successfully', async () => {
            const depositor = await blockchain.treasury('depositor');
            const depositAmount = toNano('100');
            const trancheId = 1;

            // Step 1: Send deposit
            const depositResult = await multiTrancheVault.sendDeposit(
                depositor.getSender(),
                trancheId,
                depositAmount + toNano('0.2') // Add gas
            );

            // Verify deposit initiated
            expect(depositResult.transactions).toHaveTransaction({
                from: depositor.address,
                to: multiTrancheVault.address,
                success: true,
            });

            // Verify mint message sent to token contract
            expect(depositResult.transactions).toHaveTransaction({
                from: multiTrancheVault.address,
                to: mockToken.address,
                op: 21, // OP_MINT
                success: true,
            });

            // Extract tx_id from deposit event (0x30)
            const seqNo = await multiTrancheVault.getSeqNo();
            const txId = Number(seqNo - 1n); // Previous seq_no was used

            // Step 2: Simulate mint confirmation from token contract
            const mintConfirmation = await blockchain.sendMessage({
                info: {
                    type: 'internal',
                    src: mockToken.address,
                    dest: multiTrancheVault.address,
                    value: toNano('0.01'),
                    bounce: false,
                },
                body: beginCell()
                    .storeUint(0x15, 32) // OP_MINT_CONFIRMATION
                    .storeUint(txId, 64)
                    .storeCoins(depositAmount) // tokens_minted
                    .endCell(),
            });

            // Verify mint confirmation processed
            expect(mintConfirmation.transactions).toHaveTransaction({
                from: mockToken.address,
                to: multiTrancheVault.address,
                success: true,
            });

            // Step 3: Verify final state
            // Check tranche capital increased
            const trancheCapital = await multiTrancheVault.getTrancheCapital(trancheId);
            expect(trancheCapital).toEqual(depositAmount);

            // Check total capital increased
            const totalCapital = await multiTrancheVault.getTotalCapital();
            expect(totalCapital).toEqual(depositAmount);

            // Check depositor balance updated
            const depositorBalance = await multiTrancheVault.getDepositorBalance(depositor.address);
            expect(depositorBalance.trancheId).toEqual(BigInt(trancheId));
            expect(depositorBalance.balance).toEqual(depositAmount);
            expect(depositorBalance.stakeStartTime).toBeGreaterThan(0n);

            // Check lock-up set (TRANCHE_BTC requires 90-day lock)
            const expectedLockUntil = BigInt(Math.floor(Date.now() / 1000) + 7776000); // 90 days
            expect(depositorBalance.lockUntil).toBeGreaterThan(0n);
            expect(depositorBalance.lockUntil).toBeCloseTo(expectedLockUntil, 10); // Within 10 seconds

            console.log('✅ Test 1 passed: Full two-phase deposit completed successfully');
        });

        it('should emit correct events for deposit lifecycle', async () => {
            const depositor = await blockchain.treasury('depositor');
            const depositAmount = toNano('50');
            const trancheId = 1;

            const depositResult = await multiTrancheVault.sendDeposit(
                depositor.getSender(),
                trancheId,
                depositAmount + toNano('0.2')
            );

            // Verify deposit initiated event (0x30)
            // Event structure: depositor, tranche_id, amount, tokens, tx_id
            const depositEvent = depositResult.externals.find(
                (ext) => ext.body.beginParse().loadUint(32) === 0x30
            );
            expect(depositEvent).toBeDefined();

            // Simulate mint confirmation
            const seqNo = await multiTrancheVault.getSeqNo();
            const txId = Number(seqNo - 1n);

            const confirmResult = await blockchain.sendMessage({
                info: {
                    type: 'internal',
                    src: mockToken.address,
                    dest: multiTrancheVault.address,
                    value: toNano('0.01'),
                    bounce: false,
                },
                body: beginCell()
                    .storeUint(0x15, 32)
                    .storeUint(txId, 64)
                    .storeCoins(depositAmount)
                    .endCell(),
            });

            // Verify deposit success event (0x9B)
            const successEvent = confirmResult.externals.find(
                (ext) => ext.body.beginParse().loadUint(32) === 0x9B
            );
            expect(successEvent).toBeDefined();

            console.log('✅ Events emitted correctly for deposit lifecycle');
        });
    });

    describe('Test 2: Deposit → Mint Fails → Retry (5x) → Success on Retry 3', () => {
        it('should retry failed mint up to 3 times before succeeding', async () => {
            const depositor = await blockchain.treasury('depositor');
            const depositAmount = toNano('100');
            const trancheId = 1;

            // Create a mock token that bounces first 2 mints, succeeds on 3rd
            let mintAttempts = 0;

            // Step 1: Initial deposit
            const depositResult = await multiTrancheVault.sendDeposit(
                depositor.getSender(),
                trancheId,
                depositAmount + toNano('0.2')
            );

            expect(depositResult.transactions).toHaveTransaction({
                from: depositor.address,
                to: multiTrancheVault.address,
                success: true,
            });

            const seqNo = await multiTrancheVault.getSeqNo();
            const txId = Number(seqNo - 1n);

            // Step 2: Simulate bounced mint (attempt 1)
            const bounce1 = await blockchain.sendMessage({
                info: {
                    type: 'internal',
                    src: mockToken.address,
                    dest: multiTrancheVault.address,
                    value: toNano('0.05'),
                    bounced: true,
                },
                body: beginCell()
                    .storeUint(0xffffffff, 32) // Bounce prefix
                    .storeUint(21, 32) // OP_MINT
                    .storeUint(txId, 64)
                    .storeCoins(depositAmount)
                    .endCell(),
            });

            // Verify retry event emitted (0x95)
            const retryEvent1 = bounce1.externals.find(
                (ext) => {
                    const slice = ext.body.beginParse();
                    if (slice.remainingBits < 32) return false;
                    return slice.loadUint(32) === 0x95;
                }
            );
            expect(retryEvent1).toBeDefined();

            // Verify retry message sent with increased gas
            expect(bounce1.transactions).toHaveTransaction({
                from: multiTrancheVault.address,
                to: mockToken.address,
                op: 21, // OP_MINT retry
                success: true,
            });

            // Step 3: Simulate bounced mint (attempt 2)
            const bounce2 = await blockchain.sendMessage({
                info: {
                    type: 'internal',
                    src: mockToken.address,
                    dest: multiTrancheVault.address,
                    value: toNano('0.05'),
                    bounced: true,
                },
                body: beginCell()
                    .storeUint(0xffffffff, 32)
                    .storeUint(21, 32)
                    .storeUint(txId, 64)
                    .storeCoins(depositAmount)
                    .endCell(),
            });

            // Verify second retry
            expect(bounce2.transactions).toHaveTransaction({
                from: multiTrancheVault.address,
                to: mockToken.address,
                op: 21,
                success: true,
            });

            // Step 4: Mint succeeds on third attempt
            const success = await blockchain.sendMessage({
                info: {
                    type: 'internal',
                    src: mockToken.address,
                    dest: multiTrancheVault.address,
                    value: toNano('0.01'),
                    bounce: false,
                },
                body: beginCell()
                    .storeUint(0x15, 32) // OP_MINT_CONFIRMATION
                    .storeUint(txId, 64)
                    .storeCoins(depositAmount)
                    .endCell(),
            });

            expect(success.transactions).toHaveTransaction({
                from: mockToken.address,
                to: multiTrancheVault.address,
                success: true,
            });

            // Verify final state
            const trancheCapital = await multiTrancheVault.getTrancheCapital(trancheId);
            expect(trancheCapital).toEqual(depositAmount);

            const depositorBalance = await multiTrancheVault.getDepositorBalance(depositor.address);
            expect(depositorBalance.balance).toEqual(depositAmount);

            console.log('✅ Test 2 passed: Retry logic succeeded on 3rd attempt');
        });
    });

    describe('Test 3: Deposit → Mint Fails 5x → Rollback + Refund', () => {
        it('should rollback deposit and refund after max retries exceeded', async () => {
            const depositor = await blockchain.treasury('depositor');
            const depositAmount = toNano('100');
            const trancheId = 1;
            const initialBalance = await depositor.getBalance();

            // Step 1: Initial deposit
            await multiTrancheVault.sendDeposit(
                depositor.getSender(),
                trancheId,
                depositAmount + toNano('0.2')
            );

            const seqNo = await multiTrancheVault.getSeqNo();
            const txId = Number(seqNo - 1n);

            // Step 2: Simulate 5 consecutive mint bounces
            for (let i = 0; i < 5; i++) {
                const bounceResult = await blockchain.sendMessage({
                    info: {
                        type: 'internal',
                        src: mockToken.address,
                        dest: multiTrancheVault.address,
                        value: toNano('0.05'),
                        bounced: true,
                    },
                    body: beginCell()
                        .storeUint(0xffffffff, 32)
                        .storeUint(21, 32)
                        .storeUint(txId, 64)
                        .storeCoins(depositAmount)
                        .endCell(),
                });

                if (i < 4) {
                    // Retries 1-4: should retry
                    expect(bounceResult.transactions).toHaveTransaction({
                        from: multiTrancheVault.address,
                        to: mockToken.address,
                        op: 21,
                    });
                } else {
                    // 5th bounce: should rollback and refund
                    // Verify rollback event (0x99)
                    const rollbackEvent = bounceResult.externals.find(
                        (ext) => {
                            const slice = ext.body.beginParse();
                            if (slice.remainingBits < 32) return false;
                            return slice.loadUint(32) === 0x99;
                        }
                    );
                    expect(rollbackEvent).toBeDefined();

                    // Verify refund sent
                    expect(bounceResult.transactions).toHaveTransaction({
                        from: multiTrancheVault.address,
                        to: depositor.address,
                        value: depositAmount, // Original deposit refunded
                        body: (body) => {
                            const slice = body.beginParse();
                            // Check for refund message
                            return slice.loadUint(32) === 0; // Empty op = text comment
                        },
                    });
                }
            }

            // Step 3: Verify rollback state
            // Tranche capital should be 0 (rolled back)
            const trancheCapital = await multiTrancheVault.getTrancheCapital(trancheId);
            expect(trancheCapital).toEqual(0n);

            // Total capital should be 0
            const totalCapital = await multiTrancheVault.getTotalCapital();
            expect(totalCapital).toEqual(0n);

            // Depositor balance should not exist
            const depositorBalance = await multiTrancheVault.getDepositorBalance(depositor.address);
            expect(depositorBalance.balance).toEqual(0n);

            // Depositor should have received refund (minus gas)
            const finalBalance = await depositor.getBalance();
            const gasSpent = initialBalance - finalBalance;
            expect(gasSpent).toBeLessThan(toNano('0.5')); // Only gas was spent

            console.log('✅ Test 3 passed: Rollback and refund after max retries');
        });
    });

    describe('Test 4: Deposit → Mint Timeout (1 hour) → Automatic Rollback', () => {
        it('should automatically rollback deposit after timeout', async () => {
            const depositor = await blockchain.treasury('depositor');
            const depositAmount = toNano('100');
            const trancheId = 1;

            // Step 1: Initial deposit
            await multiTrancheVault.sendDeposit(
                depositor.getSender(),
                trancheId,
                depositAmount + toNano('0.2')
            );

            const seqNo = await multiTrancheVault.getSeqNo();
            const txId = Number(seqNo - 1n);

            // Step 2: Advance blockchain time by 1 hour + 1 second
            blockchain.now = blockchain.now + 3601;

            // Step 3: Attempt to send mint confirmation (should be rejected as stale)
            // or trigger timeout handler
            // In production, a keeper would call a timeout handler
            // For this test, we simulate the timeout by bouncing after time elapsed
            const timeoutBounce = await blockchain.sendMessage({
                info: {
                    type: 'internal',
                    src: mockToken.address,
                    dest: multiTrancheVault.address,
                    value: toNano('0.05'),
                    bounced: true,
                },
                body: beginCell()
                    .storeUint(0xffffffff, 32)
                    .storeUint(21, 32)
                    .storeUint(txId, 64)
                    .storeCoins(depositAmount)
                    .endCell(),
            });

            // Since tx is > 1 hour old, should_retry_tx returns false
            // This triggers automatic rollback

            // Verify rollback event
            const rollbackEvent = timeoutBounce.externals.find(
                (ext) => {
                    const slice = ext.body.beginParse();
                    if (slice.remainingBits < 32) return false;
                    return slice.loadUint(32) === 0x99;
                }
            );
            expect(rollbackEvent).toBeDefined();

            // Verify refund sent
            expect(timeoutBounce.transactions).toHaveTransaction({
                from: multiTrancheVault.address,
                to: depositor.address,
                value: depositAmount,
            });

            // Verify state rolled back
            const trancheCapital = await multiTrancheVault.getTrancheCapital(trancheId);
            expect(trancheCapital).toEqual(0n);

            console.log('✅ Test 4 passed: Automatic rollback after timeout');
        });
    });

    describe('Test 5: Concurrent Deposits to Same Tranche → Both Succeed (Locking Works)', () => {
        it('should handle concurrent deposits with proper tranche locking', async () => {
            const depositor1 = await blockchain.treasury('depositor1');
            const depositor2 = await blockchain.treasury('depositor2');
            const depositAmount1 = toNano('100');
            const depositAmount2 = toNano('200');
            const trancheId = 1;

            // Initiate both deposits in quick succession (simulating race condition)
            const deposit1Promise = multiTrancheVault.sendDeposit(
                depositor1.getSender(),
                trancheId,
                depositAmount1 + toNano('0.2')
            );

            const deposit2Promise = multiTrancheVault.sendDeposit(
                depositor2.getSender(),
                trancheId,
                depositAmount2 + toNano('0.2')
            );

            // Wait for both to complete
            const [result1, result2] = await Promise.all([deposit1Promise, deposit2Promise]);

            // Both should succeed (locking prevents race conditions)
            expect(result1.transactions).toHaveTransaction({
                from: depositor1.address,
                to: multiTrancheVault.address,
                success: true,
            });

            expect(result2.transactions).toHaveTransaction({
                from: depositor2.address,
                to: multiTrancheVault.address,
                success: true,
            });

            // Simulate both mint confirmations
            const seqNo = await multiTrancheVault.getSeqNo();
            const txId1 = Number(seqNo - 2n);
            const txId2 = Number(seqNo - 1n);

            await blockchain.sendMessage({
                info: {
                    type: 'internal',
                    src: mockToken.address,
                    dest: multiTrancheVault.address,
                    value: toNano('0.01'),
                    bounce: false,
                },
                body: beginCell()
                    .storeUint(0x15, 32)
                    .storeUint(txId1, 64)
                    .storeCoins(depositAmount1)
                    .endCell(),
            });

            await blockchain.sendMessage({
                info: {
                    type: 'internal',
                    src: mockToken.address,
                    dest: multiTrancheVault.address,
                    value: toNano('0.01'),
                    bounce: false,
                },
                body: beginCell()
                    .storeUint(0x15, 32)
                    .storeUint(txId2, 64)
                    .storeCoins(depositAmount2)
                    .endCell(),
            });

            // Verify both deposits reflected in tranche capital
            const trancheCapital = await multiTrancheVault.getTrancheCapital(trancheId);
            expect(trancheCapital).toEqual(depositAmount1 + depositAmount2);

            // Verify both depositors have correct balances
            const balance1 = await multiTrancheVault.getDepositorBalance(depositor1.address);
            expect(balance1.balance).toEqual(depositAmount1);

            const balance2 = await multiTrancheVault.getDepositorBalance(depositor2.address);
            expect(balance2.balance).toEqual(depositAmount2);

            console.log('✅ Test 5 passed: Concurrent deposits handled correctly with locking');
        });

        it('should properly acquire and release tranche locks', async () => {
            const depositor = await blockchain.treasury('depositor');
            const depositAmount = toNano('100');
            const trancheId = 1;

            // Make a deposit
            const depositResult = await multiTrancheVault.sendDeposit(
                depositor.getSender(),
                trancheId,
                depositAmount + toNano('0.2')
            );

            // Lock should be acquired and released within the transaction
            // Verify by checking that a subsequent deposit succeeds immediately
            const depositor2 = await blockchain.treasury('depositor2');
            const result2 = await multiTrancheVault.sendDeposit(
                depositor2.getSender(),
                trancheId,
                depositAmount + toNano('0.2')
            );

            expect(result2.transactions).toHaveTransaction({
                from: depositor2.address,
                to: multiTrancheVault.address,
                success: true,
                exitCode: undefined, // Should not fail with ERR_TRANCHE_LOCKED (410)
            });

            console.log('✅ Tranche locks acquired and released properly');
        });
    });

    describe('Test 6: Deposit During Paused State → Rejected', () => {
        it('should reject deposits when vault is paused', async () => {
            const depositor = await blockchain.treasury('depositor');
            const depositAmount = toNano('100');
            const trancheId = 1;

            // Pause the vault
            await multiTrancheVault.sendPause(admin.getSender(), toNano('0.05'));

            // Verify paused
            const paused = await multiTrancheVault.getPaused();
            expect(paused).toBe(true);

            // Attempt deposit
            const depositResult = await multiTrancheVault.sendDeposit(
                depositor.getSender(),
                trancheId,
                depositAmount + toNano('0.2')
            );

            // Should fail with ERR_PAUSED (402)
            expect(depositResult.transactions).toHaveTransaction({
                from: depositor.address,
                to: multiTrancheVault.address,
                success: false,
                exitCode: 402, // ERR_PAUSED
            });

            // Verify no capital increase
            const trancheCapital = await multiTrancheVault.getTrancheCapital(trancheId);
            expect(trancheCapital).toEqual(0n);

            console.log('✅ Test 6 passed: Deposits rejected during paused state');
        });

        it('should accept deposits after unpausing', async () => {
            const depositor = await blockchain.treasury('depositor');
            const depositAmount = toNano('100');
            const trancheId = 1;

            // Pause and unpause
            await multiTrancheVault.sendPause(admin.getSender(), toNano('0.05'));
            await multiTrancheVault.sendUnpause(admin.getSender(), toNano('0.05'));

            // Verify unpaused
            const paused = await multiTrancheVault.getPaused();
            expect(paused).toBe(false);

            // Attempt deposit
            const depositResult = await multiTrancheVault.sendDeposit(
                depositor.getSender(),
                trancheId,
                depositAmount + toNano('0.2')
            );

            // Should succeed
            expect(depositResult.transactions).toHaveTransaction({
                from: depositor.address,
                to: multiTrancheVault.address,
                success: true,
            });

            console.log('✅ Deposits work after unpausing');
        });
    });

    describe('Edge Cases and Additional Coverage', () => {
        it('should reject deposit with invalid tranche ID', async () => {
            const depositor = await blockchain.treasury('depositor');
            const depositAmount = toNano('100');
            const invalidTrancheId = 0; // Invalid (must be 1-6)

            const result = await multiTrancheVault.sendDeposit(
                depositor.getSender(),
                invalidTrancheId,
                depositAmount + toNano('0.2')
            );

            expect(result.transactions).toHaveTransaction({
                from: depositor.address,
                to: multiTrancheVault.address,
                success: false,
                exitCode: 401, // ERR_INVALID_TRANCHE
            });
        });

        it('should reject deposit below minimum amount', async () => {
            const depositor = await blockchain.treasury('depositor');
            const tinyAmount = toNano('0.05'); // Below MIN_DEPOSIT (0.1 TON)
            const trancheId = 1;

            const result = await multiTrancheVault.sendDeposit(
                depositor.getSender(),
                trancheId,
                tinyAmount + toNano('0.2')
            );

            expect(result.transactions).toHaveTransaction({
                from: depositor.address,
                to: multiTrancheVault.address,
                success: false,
                exitCode: 400, // ERR_INVALID_AMOUNT
            });
        });

        it('should reject deposit to tranche without token address set', async () => {
            const depositor = await blockchain.treasury('depositor');
            const depositAmount = toNano('100');
            const trancheId = 2; // SNR tranche - no token set yet

            const result = await multiTrancheVault.sendDeposit(
                depositor.getSender(),
                trancheId,
                depositAmount + toNano('0.2')
            );

            expect(result.transactions).toHaveTransaction({
                from: depositor.address,
                to: multiTrancheVault.address,
                success: false,
                exitCode: 407, // ERR_TOKEN_NOT_SET
            });
        });

        it('should handle multiple positions for same depositor', async () => {
            const depositor = await blockchain.treasury('depositor');
            const trancheId = 1;

            // First deposit
            const deposit1 = toNano('100');
            await multiTrancheVault.sendDeposit(
                depositor.getSender(),
                trancheId,
                deposit1 + toNano('0.2')
            );

            const seqNo1 = await multiTrancheVault.getSeqNo();
            const txId1 = Number(seqNo1 - 1n);

            await blockchain.sendMessage({
                info: {
                    type: 'internal',
                    src: mockToken.address,
                    dest: multiTrancheVault.address,
                    value: toNano('0.01'),
                    bounce: false,
                },
                body: beginCell()
                    .storeUint(0x15, 32)
                    .storeUint(txId1, 64)
                    .storeCoins(deposit1)
                    .endCell(),
            });

            // Second deposit
            const deposit2 = toNano('200');
            await multiTrancheVault.sendDeposit(
                depositor.getSender(),
                trancheId,
                deposit2 + toNano('0.2')
            );

            const seqNo2 = await multiTrancheVault.getSeqNo();
            const txId2 = Number(seqNo2 - 1n);

            await blockchain.sendMessage({
                info: {
                    type: 'internal',
                    src: mockToken.address,
                    dest: multiTrancheVault.address,
                    value: toNano('0.01'),
                    bounce: false,
                },
                body: beginCell()
                    .storeUint(0x15, 32)
                    .storeUint(txId2, 64)
                    .storeCoins(deposit2)
                    .endCell(),
            });

            // Verify total balance is sum of both deposits
            const balance = await multiTrancheVault.getDepositorBalance(depositor.address);
            expect(balance.balance).toEqual(deposit1 + deposit2);

            console.log('✅ Multiple positions tracked correctly');
        });
    });
});
