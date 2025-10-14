import { Address, Contract, ContractProvider, Sender } from '@ton/core';
import { HedgeCoordinator, VenueType, HedgeStatus } from '../../wrappers/HedgeCoordinator';
import { PolymarketConnector } from '../services/PolymarketConnector';

/**
 * PolymarketKeeper - Automated keeper service for Polymarket hedge execution
 *
 * Responsibilities:
 * - Listen for hedge execution requests from HedgeCoordinator
 * - Execute hedge orders on Polymarket
 * - Report execution results back to HedgeCoordinator
 * - Liquidate hedges when requested
 */

export interface PolymarketKeeperConfig {
    coordinatorAddress: Address;
    keeperWallet: Sender;
    polymarketConnector: PolymarketConnector;
    pollInterval?: number; // Default: 5000ms (5 seconds)
}

export class PolymarketKeeper {
    private config: PolymarketKeeperConfig;
    private coordinator: Contract;
    private running: boolean = false;
    private intervalId: NodeJS.Timeout | null = null;
    private pendingHedges: Set<string> = new Set();

    constructor(config: PolymarketKeeperConfig) {
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
            console.warn('PolymarketKeeper is already running');
            return;
        }

        this.running = true;
        console.log('🚀 PolymarketKeeper started');
        console.log(`   Coordinator: ${this.config.coordinatorAddress.toString()}`);
        console.log(`   Poll interval: ${this.config.pollInterval || 5000}ms`);

        // Start polling for hedge requests
        this.intervalId = setInterval(async () => {
            try {
                await this.processPendingHedges();
            } catch (error: any) {
                console.error('❌ Error processing hedges:', error.message);
            }
        }, this.config.pollInterval || 5000);
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

        console.log('🛑 PolymarketKeeper stopped');
    }

    /**
     * Execute hedge for a specific policy
     */
    async executeHedge(opts: {
        policyId: bigint;
        coverageType: 'depeg' | 'exploit' | 'bridge';
        amount: bigint;
        provider: ContractProvider;
    }): Promise<void> {
        const { policyId, coverageType, amount, provider } = opts;

        const policyIdStr = policyId.toString();

        // Skip if already processing
        if (this.pendingHedges.has(policyIdStr)) {
            console.log(`⏳ Policy ${policyIdStr} already being processed`);
            return;
        }

        this.pendingHedges.add(policyIdStr);

        try {
            console.log(`📈 Executing Polymarket hedge for policy ${policyIdStr}`);
            console.log(`   Coverage type: ${coverageType}`);
            console.log(`   Amount: ${amount.toString()} nanoTON`);

            // Convert nanoTON to dollars (assuming 1 TON = $5 for simplicity)
            const amountUSD = Number(amount) / 1e9 * 5;

            // Execute hedge on Polymarket
            const result = await this.config.polymarketConnector.placeOrder({
                coverageType,
                amount: amountUSD,
                side: 'YES',
                type: 'MARKET',
            });

            console.log(`✅ Polymarket hedge executed: ${result.externalId}`);
            console.log(`   Status: ${result.status}`);
            console.log(`   Cost: $${result.cost}`);

            // Report execution to HedgeCoordinator
            const coordinator = provider.open(
                HedgeCoordinator.fromAddress(this.config.coordinatorAddress)
            ) as any;

            await coordinator.sendRegisterHedge(this.config.keeperWallet, {
                value: BigInt(50000000), // 0.05 TON gas
                policyId,
                venueId: VenueType.POLYMARKET,
                amount,
                externalId: result.externalId,
                status: result.status === 'FILLED' ? HedgeStatus.ACTIVE : HedgeStatus.PENDING,
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
                    venueId: VenueType.POLYMARKET,
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
     * Liquidate hedge for a policy
     */
    async liquidateHedge(opts: {
        policyId: bigint;
        externalId: string;
        amount: number;
        reserveVault: Address;
        provider: ContractProvider;
    }): Promise<void> {
        const { policyId, externalId, amount, reserveVault, provider } = opts;

        try {
            console.log(`💰 Liquidating Polymarket hedge for policy ${policyId.toString()}`);
            console.log(`   External ID: ${externalId}`);
            console.log(`   Amount: ${amount}`);

            // Liquidate position on Polymarket
            const result = await this.config.polymarketConnector.liquidatePosition({
                externalId,
                amount,
            });

            console.log(`✅ Polymarket position liquidated`);
            console.log(`   Proceeds: $${result.proceeds}`);
            console.log(`   Slippage: ${(result.slippage * 100).toFixed(2)}%`);

            // Convert proceeds back to nanoTON
            const proceedsNanoTON = BigInt(Math.floor(result.proceeds / 5 * 1e9));

            // Report liquidation to HedgeCoordinator
            const coordinator = provider.open(
                HedgeCoordinator.fromAddress(this.config.coordinatorAddress)
            ) as any;

            await coordinator.sendReportLiquidation(this.config.keeperWallet, {
                value: BigInt(100000000), // 0.1 TON gas
                policyId,
                venueId: VenueType.POLYMARKET,
                proceeds: proceedsNanoTON,
                reserveVault,
            });

            console.log(`📝 Liquidation reported to HedgeCoordinator`);
        } catch (error: any) {
            console.error(`❌ Failed to liquidate hedge for policy ${policyId.toString()}:`, error.message);
            throw error;
        }
    }

    /**
     * Process pending hedge execution requests
     * (In real implementation, this would query on-chain events)
     */
    private async processPendingHedges(): Promise<void> {
        // This is a simplified implementation
        // In production, you would:
        // 1. Query HedgeCoordinator for pending hedge requests
        // 2. Filter for requests assigned to this keeper
        // 3. Execute hedges for each pending request
        // 4. Report results back to coordinator

        console.log('🔄 Checking for pending Polymarket hedge requests...');

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
        provider: ContractProvider;
    }): Promise<void> {
        await this.executeHedge(opts);
    }

    /**
     * Manual trigger for liquidation (for testing)
     */
    async manualLiquidate(opts: {
        policyId: bigint;
        externalId: string;
        amount: number;
        reserveVault: Address;
        provider: ContractProvider;
    }): Promise<void> {
        await this.liquidateHedge(opts);
    }
}
