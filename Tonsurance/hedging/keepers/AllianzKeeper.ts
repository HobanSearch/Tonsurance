import { Address, Contract, ContractProvider, Sender } from '@ton/core';
import { HedgeCoordinator, VenueType, HedgeStatus } from '../../wrappers/HedgeCoordinator';
import { AllianzConnector } from '../services/AllianzConnector';

/**
 * AllianzKeeper - Automated keeper service for parametric insurance hedge execution
 *
 * Responsibilities:
 * - Listen for hedge execution requests from HedgeCoordinator
 * - Bind parametric insurance policies with Allianz
 * - Report execution results back to HedgeCoordinator
 * - File claims when triggers are met
 */

export interface AllianzKeeperConfig {
    coordinatorAddress: Address;
    keeperWallet: Sender;
    allianzConnector: AllianzConnector;
    pollInterval?: number; // Default: 10000ms (10 seconds, slower than others)
}

export class AllianzKeeper {
    private config: AllianzKeeperConfig;
    private coordinator: Contract;
    private running: boolean = false;
    private intervalId: NodeJS.Timeout | null = null;
    private pendingHedges: Set<string> = new Set();

    constructor(config: AllianzKeeperConfig) {
        this.config = config;
        this.coordinator = {
            address: config.coordinatorAddress,
        } as Contract;
    }

    /**
     * Start keeper service
     */
    start(): void {
        if (this.running) {
            console.warn('AllianzKeeper is already running');
            return;
        }

        this.running = true;
        console.log('🚀 AllianzKeeper started');
        console.log(`   Coordinator: ${this.config.coordinatorAddress.toString()}`);
        console.log(`   Poll interval: ${this.config.pollInterval || 10000}ms`);

        // Start polling for hedge requests
        this.intervalId = setInterval(async () => {
            try {
                await this.processPendingHedges();
            } catch (error: any) {
                console.error('❌ Error processing hedges:', error.message);
            }
        }, this.config.pollInterval || 10000);
    }

    /**
     * Stop keeper service
     */
    stop(): void {
        if (!this.running) {
            return;
        }

        this.running = false;

        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }

        console.log('🛑 AllianzKeeper stopped');
    }

    /**
     * Execute hedge for a specific policy (bind parametric insurance)
     */
    async executeHedge(opts: {
        policyId: bigint;
        coverageType: 'depeg' | 'exploit' | 'bridge';
        amount: bigint;
        duration: number; // Days
        provider: ContractProvider;
    }): Promise<void> {
        const { policyId, coverageType, amount, duration, provider } = opts;

        const policyIdStr = policyId.toString();

        // Skip if already processing
        if (this.pendingHedges.has(policyIdStr)) {
            console.log(`⏳ Policy ${policyIdStr} already being processed`);
            return;
        }

        this.pendingHedges.add(policyIdStr);

        try {
            console.log(`🏢 Executing Allianz hedge for policy ${policyIdStr}`);
            console.log(`   Coverage type: ${coverageType}`);
            console.log(`   Amount: ${amount.toString()} nanoTON`);
            console.log(`   Duration: ${duration} days`);

            // Convert nanoTON to dollars (assuming 1 TON = $5 for simplicity)
            const amountUSD = Number(amount) / 1e9 * 5;

            // Get quote first
            const quote = await this.config.allianzConnector.getQuote({
                coverageType,
                coverageAmount: amountUSD,
                duration,
            });

            console.log(`   Quote received: $${quote.premium}`);

            // Bind parametric insurance policy
            const result = await this.config.allianzConnector.placeOrder({
                coverageType,
                coverageAmount: amountUSD,
                duration,
                expectedPremium: quote.premium,
            });

            console.log(`✅ Allianz policy bound: ${result.policyNumber}`);
            console.log(`   Policy number: ${result.policyNumber}`);
            console.log(`   Status: ${result.status}`);
            console.log(`   Premium: $${result.premium}`);
            console.log(`   Certificate: ${result.certificateUrl}`);

            // Report execution to HedgeCoordinator
            const coordinator = provider.open(
                HedgeCoordinator.fromAddress(this.config.coordinatorAddress)
            ) as any;

            await coordinator.sendRegisterHedge(this.config.keeperWallet, {
                value: BigInt(50000000), // 0.05 TON gas
                policyId,
                venueId: VenueType.ALLIANZ,
                amount,
                externalId: result.policyNumber,
                status: result.status === 'ACTIVE' ? HedgeStatus.ACTIVE : HedgeStatus.PENDING,
            });

            console.log(`📝 Hedge registered in HedgeCoordinator`);
        } catch (error: any) {
            console.error(`❌ Failed to execute hedge for policy ${policyIdStr}:`, error.message);

            // Report failure to HedgeCoordinator
            try {
                const coordinator = provider.open(
                    HedgeCoordinator.fromAddress(this.config.coordinatorAddress)
                ) as any;

                await coordinator.sendRegisterHedge(this.config.keeperWallet, {
                    value: BigInt(50000000),
                    policyId,
                    venueId: VenueType.ALLIANZ,
                    amount: 0n,
                    externalId: '',
                    status: HedgeStatus.FAILED,
                });
            } catch (reportError: any) {
                console.error(`❌ Failed to report hedge failure:`, reportError.message);
            }
        } finally {
            this.pendingHedges.delete(policyIdStr);
        }
    }

    /**
     * Liquidate hedge for a policy (file parametric claim)
     */
    async liquidateHedge(opts: {
        policyId: bigint;
        policyNumber: string;
        triggerEvidence: any;
        reserveVault: Address;
        provider: ContractProvider;
    }): Promise<void> {
        const { policyId, policyNumber, triggerEvidence, reserveVault, provider } = opts;

        try {
            console.log(`💰 Filing Allianz claim for policy ${policyId.toString()}`);
            console.log(`   Policy number: ${policyNumber}`);

            // File parametric claim
            const claim = await this.config.allianzConnector.fileClaim({
                externalId: policyNumber,
                policyNumber,
                triggerEvidence,
            });

            console.log(`✅ Allianz claim filed`);
            console.log(`   Claim amount: $${claim.claimAmount}`);
            console.log(`   Trigger met: ${claim.triggerMet}`);
            console.log(`   Payout: $${claim.payout}`);
            console.log(`   Processing time: ${claim.processingTime} days`);
            console.log(`   Status: ${claim.status}`);

            // Convert payout to nanoTON
            const proceedsNanoTON = BigInt(Math.floor(claim.payout / 5 * 1e9));

            // Report liquidation to HedgeCoordinator
            // Note: Allianz claims take 3-5 days to process
            // In production, this would be called after the claim is actually paid
            const coordinator = provider.open(
                HedgeCoordinator.fromAddress(this.config.coordinatorAddress)
            ) as any;

            await coordinator.sendReportLiquidation(this.config.keeperWallet, {
                value: BigInt(100000000), // 0.1 TON gas
                policyId,
                venueId: VenueType.ALLIANZ,
                proceeds: proceedsNanoTON,
                reserveVault,
            });

            console.log(`📝 Liquidation reported to HedgeCoordinator`);
            console.log(`   ⚠️  Note: Actual payout will arrive in ${claim.processingTime} days`);
        } catch (error: any) {
            console.error(`❌ Failed to liquidate hedge for policy ${policyId.toString()}:`, error.message);
            throw error;
        }
    }

    /**
     * Check policy status
     */
    async checkPolicyStatus(policyNumber: string): Promise<void> {
        try {
            const policy = await this.config.allianzConnector.getPolicyStatus(policyNumber);

            if (policy) {
                console.log(`📋 Policy ${policyNumber} status:`);
                console.log(`   Coverage type: ${policy.coverageType}`);
                console.log(`   Coverage amount: $${policy.coverageAmount}`);
                console.log(`   Premium: $${policy.premium}`);
                console.log(`   Status: ${policy.status}`);
                console.log(`   Start date: ${policy.startDate.toISOString()}`);
                console.log(`   End date: ${policy.endDate.toISOString()}`);
            } else {
                console.log(`❌ Policy ${policyNumber} not found`);
            }
        } catch (error: any) {
            console.error(`❌ Failed to check policy status:`, error.message);
        }
    }

    /**
     * Process pending hedge execution requests
     * (In real implementation, this would query on-chain events)
     */
    private async processPendingHedges(): Promise<void> {
        console.log('🔄 Checking for pending Allianz hedge requests...');

        // TODO: Implement event polling from HedgeCoordinator
        // For now, this method is called manually when needed
    }

    /**
     * Get keeper status
     */
    getStatus(): {
        running: boolean;
        pendingHedges: number;
        coordinatorAddress: string;
    } {
        return {
            running: this.running,
            pendingHedges: this.pendingHedges.size,
            coordinatorAddress: this.config.coordinatorAddress.toString(),
        };
    }

    /**
     * Manual trigger for hedge execution (for testing)
     */
    async manualExecute(opts: {
        policyId: bigint;
        coverageType: 'depeg' | 'exploit' | 'bridge';
        amount: bigint;
        duration: number;
        provider: ContractProvider;
    }): Promise<void> {
        await this.executeHedge(opts);
    }

    /**
     * Manual trigger for liquidation (for testing)
     */
    async manualLiquidate(opts: {
        policyId: bigint;
        policyNumber: string;
        triggerEvidence: any;
        reserveVault: Address;
        provider: ContractProvider;
    }): Promise<void> {
        await this.liquidateHedge(opts);
    }
}
