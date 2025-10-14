import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano } from '@ton/core';
import { ReferralManager } from '../wrappers/ReferralManager';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

describe('ReferralManager', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compile('ReferralManager');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let referralManager: SandboxContract<ReferralManager>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');

        referralManager = blockchain.openContract(
            ReferralManager.createFromConfig(
                {
                    ownerAddress: deployer.address,
                    totalReferralRewardsDistributed: 0n,
                },
                code
            )
        );

        const deployResult = await referralManager.sendDeploy(deployer.getSender(), toNano('0.05'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: referralManager.address,
            deploy: true,
            success: true,
        });
    });

    it('should deploy successfully', async () => {
        // Deployment tested in beforeEach
    });

    it('should register referral successfully', async () => {
        const user = await blockchain.treasury('user');
        const referrer = await blockchain.treasury('referrer');

        const result = await referralManager.sendRegisterReferral(deployer.getSender(), {
            value: toNano('0.1'),
            userAddress: user.address,
            referrerAddress: referrer.address,
        });

        expect(result.transactions).toHaveTransaction({
            from: deployer.address,
            to: referralManager.address,
            success: true,
        });

        // Verify referrer is set
        const directReferrer = await referralManager.getDirectReferrer(user.address);
        expect(directReferrer?.equals(referrer.address)).toBe(true);
    });

    it('should prevent self-referral', async () => {
        const user = await blockchain.treasury('user');

        const result = await referralManager.sendRegisterReferral(deployer.getSender(), {
            value: toNano('0.1'),
            userAddress: user.address,
            referrerAddress: user.address, // Self-referral
        });

        expect(result.transactions).toHaveTransaction({
            from: deployer.address,
            to: referralManager.address,
            success: false,
            exitCode: 400, // Bad request
        });
    });

    it('should prevent referral cycles', async () => {
        const user1 = await blockchain.treasury('user1');
        const user2 = await blockchain.treasury('user2');

        // User1 refers User2
        await referralManager.sendRegisterReferral(deployer.getSender(), {
            value: toNano('0.1'),
            userAddress: user2.address,
            referrerAddress: user1.address,
        });

        // User2 tries to refer User1 (would create cycle)
        const result = await referralManager.sendRegisterReferral(deployer.getSender(), {
            value: toNano('0.1'),
            userAddress: user1.address,
            referrerAddress: user2.address,
        });

        expect(result.transactions).toHaveTransaction({
            from: deployer.address,
            to: referralManager.address,
            success: false,
            exitCode: 400,
        });
    });

    it('should retrieve 5-level referral chain', async () => {
        const level1 = await blockchain.treasury('level1');
        const level2 = await blockchain.treasury('level2');
        const level3 = await blockchain.treasury('level3');
        const level4 = await blockchain.treasury('level4');
        const level5 = await blockchain.treasury('level5');
        const user = await blockchain.treasury('user');

        // Build chain: user -> level1 -> level2 -> level3 -> level4 -> level5
        await referralManager.sendRegisterReferral(deployer.getSender(), {
            value: toNano('0.1'),
            userAddress: user.address,
            referrerAddress: level1.address,
        });

        await referralManager.sendRegisterReferral(deployer.getSender(), {
            value: toNano('0.1'),
            userAddress: level1.address,
            referrerAddress: level2.address,
        });

        await referralManager.sendRegisterReferral(deployer.getSender(), {
            value: toNano('0.1'),
            userAddress: level2.address,
            referrerAddress: level3.address,
        });

        await referralManager.sendRegisterReferral(deployer.getSender(), {
            value: toNano('0.1'),
            userAddress: level3.address,
            referrerAddress: level4.address,
        });

        await referralManager.sendRegisterReferral(deployer.getSender(), {
            value: toNano('0.1'),
            userAddress: level4.address,
            referrerAddress: level5.address,
        });

        const chain = await referralManager.getFullChain(user.address);

        expect(chain.level1?.equals(level1.address)).toBe(true);
        expect(chain.level2?.equals(level2.address)).toBe(true);
        expect(chain.level3?.equals(level3.address)).toBe(true);
        expect(chain.level4?.equals(level4.address)).toBe(true);
        expect(chain.level5?.equals(level5.address)).toBe(true);
        expect(chain.chainLength).toBe(5);
    });

    it('should calculate correct chain length', async () => {
        const referrer1 = await blockchain.treasury('referrer1');
        const referrer2 = await blockchain.treasury('referrer2');
        const user = await blockchain.treasury('user');

        // Chain of 2: user -> referrer1 -> referrer2
        await referralManager.sendRegisterReferral(deployer.getSender(), {
            value: toNano('0.1'),
            userAddress: user.address,
            referrerAddress: referrer1.address,
        });

        await referralManager.sendRegisterReferral(deployer.getSender(), {
            value: toNano('0.1'),
            userAddress: referrer1.address,
            referrerAddress: referrer2.address,
        });

        const chain = await referralManager.getFullChain(user.address);
        expect(chain.chainLength).toBe(2);
    });

    it('should distribute referral rewards to all 5 levels', async () => {
        const level1 = await blockchain.treasury('level1');
        const level2 = await blockchain.treasury('level2');
        const level3 = await blockchain.treasury('level3');
        const level4 = await blockchain.treasury('level4');
        const level5 = await blockchain.treasury('level5');
        const user = await blockchain.treasury('user');

        // Build 5-level chain
        await referralManager.sendRegisterReferral(deployer.getSender(), {
            value: toNano('0.1'),
            userAddress: user.address,
            referrerAddress: level1.address,
        });

        await referralManager.sendRegisterReferral(deployer.getSender(), {
            value: toNano('0.1'),
            userAddress: level1.address,
            referrerAddress: level2.address,
        });

        await referralManager.sendRegisterReferral(deployer.getSender(), {
            value: toNano('0.1'),
            userAddress: level2.address,
            referrerAddress: level3.address,
        });

        await referralManager.sendRegisterReferral(deployer.getSender(), {
            value: toNano('0.1'),
            userAddress: level3.address,
            referrerAddress: level4.address,
        });

        await referralManager.sendRegisterReferral(deployer.getSender(), {
            value: toNano('0.1'),
            userAddress: level4.address,
            referrerAddress: level5.address,
        });

        // Distribute rewards
        const totalRewards = toNano('100');
        const result = await referralManager.sendDistributeReferralRewards(deployer.getSender(), {
            value: toNano('1') + totalRewards,  // Must include reward amount in value
            totalAmount: totalRewards,
            userAddress: user.address,
            policyId: 1n,
        });

        // Verify rewards sent to all 5 levels
        expect(result.transactions).toHaveTransaction({
            from: referralManager.address,
            to: level1.address,
            success: true,
        });

        expect(result.transactions).toHaveTransaction({
            from: referralManager.address,
            to: level2.address,
            success: true,
        });

        expect(result.transactions).toHaveTransaction({
            from: referralManager.address,
            to: level3.address,
            success: true,
        });

        expect(result.transactions).toHaveTransaction({
            from: referralManager.address,
            to: level4.address,
            success: true,
        });

        expect(result.transactions).toHaveTransaction({
            from: referralManager.address,
            to: level5.address,
            success: true,
        });
    });

    it('should apply correct reward splits (60/25/10/3/2)', async () => {
        const level1 = await blockchain.treasury('level1');
        const level2 = await blockchain.treasury('level2');
        const level3 = await blockchain.treasury('level3');
        const level4 = await blockchain.treasury('level4');
        const level5 = await blockchain.treasury('level5');
        const user = await blockchain.treasury('user');

        // Build 5-level chain
        await referralManager.sendRegisterReferral(deployer.getSender(), {
            value: toNano('0.1'),
            userAddress: user.address,
            referrerAddress: level1.address,
        });

        await referralManager.sendRegisterReferral(deployer.getSender(), {
            value: toNano('0.1'),
            userAddress: level1.address,
            referrerAddress: level2.address,
        });

        await referralManager.sendRegisterReferral(deployer.getSender(), {
            value: toNano('0.1'),
            userAddress: level2.address,
            referrerAddress: level3.address,
        });

        await referralManager.sendRegisterReferral(deployer.getSender(), {
            value: toNano('0.1'),
            userAddress: level3.address,
            referrerAddress: level4.address,
        });

        await referralManager.sendRegisterReferral(deployer.getSender(), {
            value: toNano('0.1'),
            userAddress: level4.address,
            referrerAddress: level5.address,
        });

        const totalRewards = toNano('1000'); // Use 1000 for easy percentage calculation

        const level1BalanceBefore = (await blockchain.getContract(level1.address)).balance;
        const level2BalanceBefore = (await blockchain.getContract(level2.address)).balance;
        const level3BalanceBefore = (await blockchain.getContract(level3.address)).balance;
        const level4BalanceBefore = (await blockchain.getContract(level4.address)).balance;
        const level5BalanceBefore = (await blockchain.getContract(level5.address)).balance;

        await referralManager.sendDistributeReferralRewards(deployer.getSender(), {
            value: totalRewards + toNano('1'),
            totalAmount: totalRewards,
            userAddress: user.address,
            policyId: 1n,
        });

        const level1BalanceAfter = (await blockchain.getContract(level1.address)).balance;
        const level2BalanceAfter = (await blockchain.getContract(level2.address)).balance;
        const level3BalanceAfter = (await blockchain.getContract(level3.address)).balance;
        const level4BalanceAfter = (await blockchain.getContract(level4.address)).balance;
        const level5BalanceAfter = (await blockchain.getContract(level5.address)).balance;

        // Calculate received amounts
        const level1Received = level1BalanceAfter - level1BalanceBefore;
        const level2Received = level2BalanceAfter - level2BalanceBefore;
        const level3Received = level3BalanceAfter - level3BalanceBefore;
        const level4Received = level4BalanceAfter - level4BalanceBefore;
        const level5Received = level5BalanceAfter - level5BalanceBefore;

        // Verify approximate percentages (60%, 25%, 10%, 3%, 2%)
        expect(Number(level1Received)).toBeGreaterThan(Number(toNano('500'))); // ~60%
        expect(Number(level2Received)).toBeGreaterThan(Number(toNano('200'))); // ~25%
        expect(Number(level3Received)).toBeGreaterThan(Number(toNano('80'))); // ~10%
        expect(Number(level4Received)).toBeGreaterThan(Number(toNano('20'))); // ~3%
        expect(Number(level5Received)).toBeGreaterThan(Number(toNano('15'))); // ~2%
    });

    it('should track referrer stats correctly', async () => {
        const referrer = await blockchain.treasury('referrer');
        const user1 = await blockchain.treasury('user1');
        const user2 = await blockchain.treasury('user2');
        const user3 = await blockchain.treasury('user3');

        // Referrer gets 3 direct referrals
        await referralManager.sendRegisterReferral(deployer.getSender(), {
            value: toNano('0.1'),
            userAddress: user1.address,
            referrerAddress: referrer.address,
        });

        await referralManager.sendRegisterReferral(deployer.getSender(), {
            value: toNano('0.1'),
            userAddress: user2.address,
            referrerAddress: referrer.address,
        });

        await referralManager.sendRegisterReferral(deployer.getSender(), {
            value: toNano('0.1'),
            userAddress: user3.address,
            referrerAddress: referrer.address,
        });

        const stats = await referralManager.getReferrerStats(referrer.address);
        expect(stats.referralCount).toBe(3);
    });

    it('should retrieve direct referrer correctly', async () => {
        const user = await blockchain.treasury('user');
        const referrer = await blockchain.treasury('referrer');

        await referralManager.sendRegisterReferral(deployer.getSender(), {
            value: toNano('0.1'),
            userAddress: user.address,
            referrerAddress: referrer.address,
        });

        const directReferrer = await referralManager.getDirectReferrer(user.address);
        expect(directReferrer?.equals(referrer.address)).toBe(true);
    });

    it('should handle multiple referral chains independently', async () => {
        const chain1_user = await blockchain.treasury('chain1_user');
        const chain1_ref = await blockchain.treasury('chain1_ref');
        const chain2_user = await blockchain.treasury('chain2_user');
        const chain2_ref = await blockchain.treasury('chain2_ref');

        // Create two independent chains
        await referralManager.sendRegisterReferral(deployer.getSender(), {
            value: toNano('0.1'),
            userAddress: chain1_user.address,
            referrerAddress: chain1_ref.address,
        });

        await referralManager.sendRegisterReferral(deployer.getSender(), {
            value: toNano('0.1'),
            userAddress: chain2_user.address,
            referrerAddress: chain2_ref.address,
        });

        const chain1 = await referralManager.getDirectReferrer(chain1_user.address);
        const chain2 = await referralManager.getDirectReferrer(chain2_user.address);

        expect(chain1?.equals(chain1_ref.address)).toBe(true);
        expect(chain2?.equals(chain2_ref.address)).toBe(true);
        expect(chain1?.equals(chain2_ref.address)).toBe(false);
    });

    it('should track total rewards distributed', async () => {
        const level1 = await blockchain.treasury('level1');
        const user = await blockchain.treasury('user');

        await referralManager.sendRegisterReferral(deployer.getSender(), {
            value: toNano('0.1'),
            userAddress: user.address,
            referrerAddress: level1.address,
        });

        // First distribution
        await referralManager.sendDistributeReferralRewards(deployer.getSender(), {
            value: toNano('1') + toNano('100'),
            totalAmount: toNano('100'),
            userAddress: user.address,
            policyId: 1n,
        });

        // Second distribution
        await referralManager.sendDistributeReferralRewards(deployer.getSender(), {
            value: toNano('1') + toNano('200'),
            totalAmount: toNano('200'),
            userAddress: user.address,
            policyId: 2n,
        });

        const totalRewards = await referralManager.getTotalReferralRewards();
        expect(totalRewards).toBe(toNano('300'));
    });

    it('should handle missing chain levels gracefully', async () => {
        const level1 = await blockchain.treasury('level1');
        const user = await blockchain.treasury('user');

        // Only 1 level chain
        await referralManager.sendRegisterReferral(deployer.getSender(), {
            value: toNano('0.1'),
            userAddress: user.address,
            referrerAddress: level1.address,
        });

        const chain = await referralManager.getFullChain(user.address);

        expect(chain.level1?.equals(level1.address)).toBe(true);
        expect(chain.level2).toBeNull();
        expect(chain.level3).toBeNull();
        expect(chain.level4).toBeNull();
        expect(chain.level5).toBeNull();
        expect(chain.chainLength).toBe(1);
    });

    it('should handle orphaned users (no referrer)', async () => {
        const orphanUser = await blockchain.treasury('orphanUser');

        const directReferrer = await referralManager.getDirectReferrer(orphanUser.address);
        expect(directReferrer).toBeNull();

        const chain = await referralManager.getFullChain(orphanUser.address);
        expect(chain.chainLength).toBe(0);
    });

    it('should update referrer earnings stats', async () => {
        const referrer = await blockchain.treasury('referrer');
        const user = await blockchain.treasury('user');

        await referralManager.sendRegisterReferral(deployer.getSender(), {
            value: toNano('0.1'),
            userAddress: user.address,
            referrerAddress: referrer.address,
        });

        const rewardAmount = toNano('100');
        await referralManager.sendDistributeReferralRewards(deployer.getSender(), {
            value: toNano('1') + rewardAmount,
            totalAmount: rewardAmount,
            userAddress: user.address,
            policyId: 1n,
        });

        const stats = await referralManager.getReferrerStats(referrer.address);
        // Level 1 gets 60% of rewards
        expect(Number(stats.totalEarned)).toBeGreaterThan(Number(toNano('50')));
    });
});
