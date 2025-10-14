import { Address, Contract, ContractProvider, Sender } from '@ton/core';
import { HedgeCoordinator, VenueType, HedgeStatus } from '../../wrappers/HedgeCoordinator';
import { PerpetualConnector } from '../services/PerpetualConnector';

/**
 * PerpKeeper - Automated keeper service for perpetual futures hedge execution
 *
 * Responsibilities:
 * - Listen for hedge execution requests from HedgeCoordinator
 * - Execute short positions on perpetual futures exchanges
 * - Report execution results back to HedgeCoordinator
 * - Close positions when liquidation requested
 */

export interface PerpKeeperConfig {
    coordinatorAddress: Address;
    keeperWallet: Sender;
    perpetualConnector: PerpetualConnector;
    pollInterval?: number; // Default: 5000ms (5 seconds)
}

export class PerpKeeper {
    private config: PerpKeeperConfig;
    private coordinator: Contract;
    private running: boolean = false;
    private intervalId: NodeJS.Timeout | null = null;
    private pendingHedges: Set<string> = new Set();

    constructor(config: PerpKeeperConfig) {
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
            console.warn('PerpKeeper is already running');
            return;
        }

        this.running = true;
        console.log('🚀 PerpKeeper started');
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

        console.log('🛑 PerpKeeper stopped');
    }

    /**
     * Execute hedge for a specific policy
     */
    async executeHedge(opts: {
        policyId: bigint;
        coverageType: 'depeg' | 'exploit' | 'bridge';
        amount: bigint;
        leverage?: number;
        provider: ContractProvider;
    }): Promise<void> {
        const { policyId, coverageType, amount, leverage = 1, provider } = opts;

        const policyIdStr = policyId.toString();

        // Skip if already processing
        if (this.pendingHedges.has(policyIdStr)) {
            console.log(`⏳ Policy ${policyIdStr} already being processed`);
            return;
        }

        this.pendingHedges.add(policyIdStr);

        try {
            console.log(`📉 Executing Perpetual hedge for policy ${policyIdStr}`);
            console.log(`   Coverage type: ${coverageType}`);
            console.log(`   Amount: ${amount.toString()} nanoTON`);
            console.log(`   Leverage: ${leverage}x`);

            // Convert nanoTON to dollars (assuming 1 TON = $5 for simplicity)
            const amountUSD = Number(amount) / 1e9 * 5;

            // Execute short position on perpetual exchange
            const result = await this.config.perpetualConnector.placeOrder({
                coverageType,
                amount: amountUSD,
                leverage,
            });

            console.log(`✅ Perpetual hedge executed: ${result.externalId}`);
            console.log(`   Symbol: ${result.symbol}`);
            console.log(`   Side: ${result.side}`);
            console.log(`   Size: ${result.size}`);
            console.log(`   Entry price: $${result.fillPrice}`);
            console.log(`   Cost: $${result.cost}`);

            // Track position in connector
            this.config.perpetualConnector.trackPosition(result.externalId, {
                externalId: result.externalId,
                venue: 'binance',
                symbol: result.symbol,
                side: result.side,
                size: result.size,
                entryPrice: result.fillPrice,
                currentPrice: result.fillPrice,
                unrealizedPnL: 0,
                fundingRate: 0, // Will be updated
            });

            // Report execution to HedgeCoordinator
            const coordinator = provider.open(
                HedgeCoordinator.fromAddress(this.config.coordinatorAddress)
            ) as any;

            await coordinator.sendRegisterHedge(this.config.keeperWallet, {
                value: BigInt(50000000), // 0.05 TON gas
                policyId,
                venueId: VenueType.PERPETUALS,
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
                    venueId: VenueType.PERPETUALS,
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
     * Liquidate hedge for a policy (close short position)
     */
    async liquidateHedge(opts: {
        policyId: bigint;
        externalId: string;
        symbol: string;
        size: number;
        reserveVault: Address;
        provider: ContractProvider;
    }): Promise<void> {
        const { policyId, externalId, symbol, size, reserveVault, provider } = opts;

        try {
            console.log(`💰 Liquidating Perpetual hedge for policy ${policyId.toString()}`);
            console.log(`   External ID: ${externalId}`);
            console.log(`   Symbol: ${symbol}`);
            console.log(`   Size: ${size}`);

            // Close position on perpetual exchange
            const result = await this.config.perpetualConnector.liquidatePosition({
                externalId,
                symbol,
                size,
            });

            console.log(`✅ Perpetual position closed`);
            console.log(`   Proceeds: $${result.proceeds}`);
            console.log(`   PnL: $${result.pnl}`);
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
                venueId: VenueType.PERPETUALS,
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
     * Monitor funding rates and position PnL
     */
    async monitorPositions(): Promise<void> {
        console.log('📊 Monitoring perpetual positions...');

        // Get all tracked positions
        const positions = Array.from(this.config.perpetualConnector['positions'].values());

        for (const position of positions) {
            try {
                // Update position with current market price
                await this.config.perpetualConnector.updatePosition(position.externalId);

                const updatedPosition = this.config.perpetualConnector.getPosition(position.externalId);
                if (updatedPosition) {
                    console.log(`   Position ${position.externalId}:`);
                    console.log(`     Symbol: ${updatedPosition.symbol}`);
                    console.log(`     Entry: $${updatedPosition.entryPrice}`);
                    console.log(`     Current: $${updatedPosition.currentPrice}`);
                    console.log(`     PnL: $${updatedPosition.unrealizedPnL.toFixed(2)}`);
                }
            } catch (error: any) {
                console.error(`❌ Failed to update position ${position.externalId}:`, error.message);
            }
        }
    }

    /**
     * Process pending hedge execution requests
     * (In real implementation, this would query on-chain events)
     */
    private async processPendingHedges(): Promise<void> {
        console.log('🔄 Checking for pending Perpetual hedge requests...');

        // TODO: Implement event polling from HedgeCoordinator
        // For now, this method is called manually when needed
    }

    /**
     * Get keeper status
     */
    getStatus(): {
        running: boolean;
        pendingHedges: number;
        activePositions: number;
        coordinatorAddress: string;
    } {
        return {
            running: this.running,
            pendingHedges: this.pendingHedges.size,
            activePositions: this.config.perpetualConnector['positions'].size,
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
        leverage?: number;
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
        symbol: string;
        size: number;
        reserveVault: Address;
        provider: ContractProvider;
    }): Promise<void> {
        await this.liquidateHedge(opts);
    }
}
