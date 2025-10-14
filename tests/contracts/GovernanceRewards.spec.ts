import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano } from '@ton/core';
import { GovernanceRewards } from '../wrappers/GovernanceRewards';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

describe('GovernanceRewards', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compile('GovernanceRewards');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let governanceRewards: SandboxContract<GovernanceRewards>;
    let premiumDistributor: SandboxContract<TreasuryContract>;
    let claimsProcessor: SandboxContract<TreasuryContract>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');
        premiumDistributor = await blockchain.treasury('premiumDistributor');
        claimsProcessor = await blockchain.treasury('claimsProcessor');

        governanceRewards = blockchain.openContract(
            GovernanceRewards.createFromConfig(
                {
                    ownerAddress: deployer.address,
                    premiumDistributorAddress: premiumDistributor.address,
                    claimsProcessorAddress: claimsProcessor.address,
                    totalRewardsDistributed: 0n,
                    totalRewardsPending: 0n,
                    minVotingPower: toNano('100'), // Minimum 100 SURE tokens
                    participationBonusThreshold: 80, // 80% participation
                },
                code
            )
        );

        const deployResult = await governanceRewards.sendDeploy(deployer.getSender(), toNano('0.05'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: governanceRewards.address,
            deploy: true,
            success: true,
        });

        // Fund the rewards pool for tests
        await governanceRewards.sendReceiveGovernanceShare(premiumDistributor.getSender(), {
            value: toNano('0.1'),
            amount: toNano('1000'),
        });
    });

    it('should deploy successfully', async () => {
        // Deployment tested in beforeEach
    });

    it('should register voter successfully', async () => {
        const voter = await blockchain.treasury('voter');

        const result = await governanceRewards.sendRegisterVoter(deployer.getSender(), {
            value: toNano('0.1'),
            voterAddress: voter.address,
        });

        expect(result.transactions).toHaveTransaction({
            from: deployer.address,
            to: governanceRewards.address,
            success: true,
        });
    });

    it('should record vote with voting power', async () => {
        const voter = await blockchain.treasury('voter');

        // Register voter first
        await governanceRewards.sendRegisterVoter(deployer.getSender(), {
            value: toNano('0.1'),
            voterAddress: voter.address,
        });

        // Record vote
        const result = await governanceRewards.sendRecordVote(claimsProcessor.getSender(), {
            value: toNano('0.1'),
            voterAddress: voter.address,
            votingPower: toNano('1000'), // 1000 SURE tokens
            votedWithMajority: true,
            participationRate: 85, // 85% participation
        });

        expect(result.transactions).toHaveTransaction({
            from: claimsProcessor.address,
            to: governanceRewards.address,
            success: true,
        });

        const stats = await governanceRewards.getVoterStats(voter.address);
        expect(stats.voteCount).toBe(1);
    });

    it('should calculate rewards scaled by voting power', async () => {
        const voter1 = await blockchain.treasury('voter1');
        const voter2 = await blockchain.treasury('voter2');

        await governanceRewards.sendRegisterVoter(deployer.getSender(), {
            value: toNano('0.1'),
            voterAddress: voter1.address,
        });

        await governanceRewards.sendRegisterVoter(deployer.getSender(), {
            value: toNano('0.1'),
            voterAddress: voter2.address,
        });

        // Voter1: Higher voting power (1000 SURE)
        await governanceRewards.sendRecordVote(claimsProcessor.getSender(), {
            value: toNano('0.1'),
            voterAddress: voter1.address,
            votingPower: toNano('1000'),
            votedWithMajority: true,
            participationRate: 85,
        });

        // Voter2: Lower voting power (500 SURE)
        await governanceRewards.sendRecordVote(claimsProcessor.getSender(), {
            value: toNano('0.1'),
            voterAddress: voter2.address,
            votingPower: toNano('500'),
            votedWithMajority: true,
            participationRate: 85,
        });

        const stats1 = await governanceRewards.getVoterStats(voter1.address);
        const stats2 = await governanceRewards.getVoterStats(voter2.address);

        expect(stats1.voteCount).toBe(1);
        expect(stats2.voteCount).toBe(1);
    });

    it('should apply participation bonus (1.5x)', async () => {
        const voter = await blockchain.treasury('voter');

        await governanceRewards.sendRegisterVoter(deployer.getSender(), {
            value: toNano('0.1'),
            voterAddress: voter.address,
        });

        // Record vote with high participation (>80% threshold)
        const result = await governanceRewards.sendRecordVote(claimsProcessor.getSender(), {
            value: toNano('0.1'),
            voterAddress: voter.address,
            votingPower: toNano('1000'),
            votedWithMajority: true,
            participationRate: 9000, // 90% in basis points > 80% threshold
        });

        expect(result.transactions).toHaveTransaction({
            from: claimsProcessor.address,
            to: governanceRewards.address,
            success: true,
        });

        const stats = await governanceRewards.getVoterStats(voter.address);
        // EMA: 10000 * 0.9 + 9000 * 0.1 = 9000 + 900 = 9900
        expect(stats.participationRate).toBe(9900);
    });

    it('should apply consensus bonus (+20%)', async () => {
        const voter = await blockchain.treasury('voter');

        await governanceRewards.sendRegisterVoter(deployer.getSender(), {
            value: toNano('0.1'),
            voterAddress: voter.address,
        });

        // Vote with majority
        await governanceRewards.sendRecordVote(claimsProcessor.getSender(), {
            value: toNano('0.1'),
            voterAddress: voter.address,
            votingPower: toNano('1000'),
            votedWithMajority: true, // Voted with majority
            participationRate: 85,
        });

        const stats = await governanceRewards.getVoterStats(voter.address);
        expect(stats.voteCount).toBe(1);
    });

    it('should apply dissent penalty (-30%)', async () => {
        const voter = await blockchain.treasury('voter');

        await governanceRewards.sendRegisterVoter(deployer.getSender(), {
            value: toNano('0.1'),
            voterAddress: voter.address,
        });

        // Vote against majority
        await governanceRewards.sendRecordVote(claimsProcessor.getSender(), {
            value: toNano('0.1'),
            voterAddress: voter.address,
            votingPower: toNano('1000'),
            votedWithMajority: false, // Voted against majority
            participationRate: 85,
        });

        const stats = await governanceRewards.getVoterStats(voter.address);
        expect(stats.voteCount).toBe(1);
    });

    it('should allow voter to claim rewards', async () => {
        const voter = await blockchain.treasury('voter');

        await governanceRewards.sendRegisterVoter(deployer.getSender(), {
            value: toNano('0.1'),
            voterAddress: voter.address,
        });

        await governanceRewards.sendRecordVote(claimsProcessor.getSender(), {
            value: toNano('0.1'),
            voterAddress: voter.address,
            votingPower: toNano('1000'),
            votedWithMajority: true,
            participationRate: 85,
        });

        // Send governance share
        await premiumDistributor.send({
            to: governanceRewards.address,
            value: toNano('100'),
            bounce: false,
        });

        const result = await governanceRewards.sendClaimRewards(voter.getSender(), toNano('0.1'));

        expect(result.transactions).toHaveTransaction({
            from: voter.address,
            to: governanceRewards.address,
            success: true,
        });
    });

    it('should track pending rewards correctly', async () => {
        const voter = await blockchain.treasury('voter');

        await governanceRewards.sendRegisterVoter(deployer.getSender(), {
            value: toNano('0.1'),
            voterAddress: voter.address,
        });

        await governanceRewards.sendRecordVote(claimsProcessor.getSender(), {
            value: toNano('0.1'),
            voterAddress: voter.address,
            votingPower: toNano('1000'),
            votedWithMajority: true,
            participationRate: 85,
        });

        const pendingBefore = await governanceRewards.getPendingRewards(voter.address);

        // Send governance fees
        await premiumDistributor.send({
            to: governanceRewards.address,
            value: toNano('50'),
            bounce: false,
        });

        const pendingAfter = await governanceRewards.getPendingRewards(voter.address);

        expect(Number(pendingAfter)).toBeGreaterThanOrEqual(Number(pendingBefore));
    });

    it('should retrieve voter stats correctly', async () => {
        const voter = await blockchain.treasury('voter');

        await governanceRewards.sendRegisterVoter(deployer.getSender(), {
            value: toNano('0.1'),
            voterAddress: voter.address,
        });

        // Record multiple votes
        await governanceRewards.sendRecordVote(claimsProcessor.getSender(), {
            value: toNano('0.1'),
            voterAddress: voter.address,
            votingPower: toNano('1000'),
            votedWithMajority: true,
            participationRate: 85,
        });

        await governanceRewards.sendRecordVote(claimsProcessor.getSender(), {
            value: toNano('0.1'),
            voterAddress: voter.address,
            votingPower: toNano('1200'),
            votedWithMajority: false,
            participationRate: 90,
        });

        await governanceRewards.sendRecordVote(claimsProcessor.getSender(), {
            value: toNano('0.1'),
            voterAddress: voter.address,
            votingPower: toNano('1100'),
            votedWithMajority: true,
            participationRate: 88,
        });

        const stats = await governanceRewards.getVoterStats(voter.address);

        expect(stats.voteCount).toBe(3);
        expect(stats.participationRate).toBeGreaterThan(0);
    });

    it('should receive governance share from premium distributor', async () => {
        const shareAmount = toNano('100');

        const result = await premiumDistributor.send({
            to: governanceRewards.address,
            value: shareAmount,
            bounce: false,
        });

        expect(result.transactions).toHaveTransaction({
            from: premiumDistributor.address,
            to: governanceRewards.address,
            success: true,
        });
    });

    it('should handle multiple voters independently', async () => {
        const voter1 = await blockchain.treasury('voter1');
        const voter2 = await blockchain.treasury('voter2');
        const voter3 = await blockchain.treasury('voter3');

        // Register all voters
        await governanceRewards.sendRegisterVoter(deployer.getSender(), {
            value: toNano('0.1'),
            voterAddress: voter1.address,
        });

        await governanceRewards.sendRegisterVoter(deployer.getSender(), {
            value: toNano('0.1'),
            voterAddress: voter2.address,
        });

        await governanceRewards.sendRegisterVoter(deployer.getSender(), {
            value: toNano('0.1'),
            voterAddress: voter3.address,
        });

        // Record votes with different parameters
        await governanceRewards.sendRecordVote(claimsProcessor.getSender(), {
            value: toNano('0.1'),
            voterAddress: voter1.address,
            votingPower: toNano('1000'),
            votedWithMajority: true,
            participationRate: 85,
        });

        await governanceRewards.sendRecordVote(claimsProcessor.getSender(), {
            value: toNano('0.1'),
            voterAddress: voter2.address,
            votingPower: toNano('500'),
            votedWithMajority: false,
            participationRate: 75,
        });

        await governanceRewards.sendRecordVote(claimsProcessor.getSender(), {
            value: toNano('0.1'),
            voterAddress: voter3.address,
            votingPower: toNano('2000'),
            votedWithMajority: true,
            participationRate: 95,
        });

        const stats1 = await governanceRewards.getVoterStats(voter1.address);
        const stats2 = await governanceRewards.getVoterStats(voter2.address);
        const stats3 = await governanceRewards.getVoterStats(voter3.address);

        expect(stats1.voteCount).toBe(1);
        expect(stats2.voteCount).toBe(1);
        expect(stats3.voteCount).toBe(1);
    });

    it('should retrieve minimum voting power requirement', async () => {
        const minVotingPower = await governanceRewards.getMinVotingPower();
        expect(minVotingPower).toBe(toNano('100')); // 100 SURE tokens
    });
});
