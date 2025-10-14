import { Address, TonClient } from '@ton/ton';
import { HedgedPolicyFactory } from '../../wrappers/HedgedPolicyFactory';
import { HedgeCoordinator } from '../../wrappers/HedgeCoordinator';

export interface ExposureByType {
    coverageType: 'depeg' | 'exploit' | 'bridge';
    totalCoverage: bigint;
    requiredHedge: bigint;  // 20% of total
    currentHedge: bigint;
    hedgeDeficit: bigint;
}

export interface HedgeOrder {
    coverageType: 'depeg' | 'exploit' | 'bridge';
    venue: 'polymarket' | 'perpetuals' | 'allianz';
    action: 'increase' | 'decrease';
    amount: bigint;
}

export interface RiskCalculatorConfig {
    tonClient: TonClient;
    factoryAddress: Address;
    coordinatorAddress: Address;
}

export class RiskCalculator {
    private tonClient: TonClient;
    private factory: HedgedPolicyFactory;
    private coordinator: HedgeCoordinator;

    constructor(config: RiskCalculatorConfig) {
        this.tonClient = config.tonClient;
        this.factory = new HedgedPolicyFactory(config.factoryAddress);
        this.coordinator = new HedgeCoordinator(config.coordinatorAddress);
    }

    /**
     * Calculate total exposure by coverage type
     */
    async calculateExposure(): Promise<ExposureByType[]> {
        const exposureMap = new Map<string, ExposureByType>();

        // Get next policy ID to know how many policies exist
        const nextPolicyId = await this.factory.getNextPolicyId(
            this.tonClient.provider(this.factory.address)
        );

        // Iterate through all policies
        for (let i = 1n; i < nextPolicyId; i++) {
            try {
                const policy = await this.factory.getPolicy(
                    this.tonClient.provider(this.factory.address),
                    i
                );

                // Skip inactive or expired policies
                if (!policy.isActive || policy.expiryTime < Math.floor(Date.now() / 1000)) {
                    continue;
                }

                const coverageTypeStr = this.getCoverageTypeString(policy.coverageType);

                // Get or create exposure record
                let exposure = exposureMap.get(coverageTypeStr);
                if (!exposure) {
                    exposure = {
                        coverageType: coverageTypeStr as 'depeg' | 'exploit' | 'bridge',
                        totalCoverage: 0n,
                        requiredHedge: 0n,
                        currentHedge: 0n,
                        hedgeDeficit: 0n,
                    };
                    exposureMap.set(coverageTypeStr, exposure);
                }

                // Add to total coverage
                exposure.totalCoverage += policy.coverageAmount;

                // Get current hedge amounts for this policy
                try {
                    const hedgePosition = await this.coordinator.getHedgePosition(
                        this.tonClient.provider(this.coordinator.address),
                        i
                    );

                    exposure.currentHedge += hedgePosition.polymarketAmount;
                    exposure.currentHedge += hedgePosition.perpetualsAmount;
                    exposure.currentHedge += hedgePosition.allianzAmount;
                } catch (err) {
                    // Policy might not have hedge position yet
                    console.warn(`No hedge position for policy ${i}`);
                }
            } catch (err) {
                // Policy might not exist (gaps in IDs)
                continue;
            }
        }

        // Calculate required hedge and deficit for each coverage type
        const exposures: ExposureByType[] = [];
        for (const exposure of exposureMap.values()) {
            exposure.requiredHedge = (exposure.totalCoverage * 20n) / 100n; // 20% hedge ratio
            exposure.hedgeDeficit = exposure.requiredHedge - exposure.currentHedge;

            exposures.push(exposure);
        }

        return exposures;
    }

    /**
     * Check if rebalancing is needed (deficit exceeds 5% threshold)
     */
    async needsRebalancing(): Promise<boolean> {
        const exposures = await this.calculateExposure();

        for (const exposure of exposures) {
            if (exposure.requiredHedge === 0n) continue;

            const deficitPercent = Number(exposure.hedgeDeficit * 100n / exposure.requiredHedge);

            // Rebalance if deficit exceeds 5%
            if (Math.abs(deficitPercent) > 5) {
                return true;
            }
        }

        return false;
    }

    /**
     * Calculate rebalance orders to bring hedges to target
     */
    async calculateRebalanceOrders(): Promise<HedgeOrder[]> {
        const exposures = await this.calculateExposure();
        const orders: HedgeOrder[] = [];

        for (const exposure of exposures) {
            if (exposure.hedgeDeficit === 0n) continue;

            const action = exposure.hedgeDeficit > 0n ? 'increase' : 'decrease';
            const absDeficit = exposure.hedgeDeficit > 0n ? exposure.hedgeDeficit : -exposure.hedgeDeficit;

            // Distribute deficit across venues (40/40/20 split)
            const polymarketAmount = (absDeficit * 40n) / 100n;
            const perpetualsAmount = (absDeficit * 40n) / 100n;
            const allianzAmount = (absDeficit * 20n) / 100n;

            if (polymarketAmount > 0n) {
                orders.push({
                    coverageType: exposure.coverageType,
                    venue: 'polymarket',
                    action,
                    amount: polymarketAmount,
                });
            }

            if (perpetualsAmount > 0n) {
                orders.push({
                    coverageType: exposure.coverageType,
                    venue: 'perpetuals',
                    action,
                    amount: perpetualsAmount,
                });
            }

            if (allianzAmount > 0n) {
                orders.push({
                    coverageType: exposure.coverageType,
                    venue: 'allianz',
                    action,
                    amount: allianzAmount,
                });
            }
        }

        return orders;
    }

    /**
     * Get coverage type string from numeric value
     */
    private getCoverageTypeString(coverageType: number): string {
        switch (coverageType) {
            case 1:
                return 'depeg';
            case 2:
                return 'exploit';
            case 3:
                return 'bridge';
            default:
                throw new Error(`Invalid coverage type: ${coverageType}`);
        }
    }

    /**
     * Get real-time exposure summary
     */
    async getExposureSummary(): Promise<{
        totalCoverage: bigint;
        totalRequiredHedge: bigint;
        totalCurrentHedge: bigint;
        totalDeficit: bigint;
        exposuresByType: ExposureByType[];
    }> {
        const exposures = await this.calculateExposure();

        const summary = {
            totalCoverage: 0n,
            totalRequiredHedge: 0n,
            totalCurrentHedge: 0n,
            totalDeficit: 0n,
            exposuresByType: exposures,
        };

        for (const exposure of exposures) {
            summary.totalCoverage += exposure.totalCoverage;
            summary.totalRequiredHedge += exposure.requiredHedge;
            summary.totalCurrentHedge += exposure.currentHedge;
            summary.totalDeficit += exposure.hedgeDeficit;
        }

        return summary;
    }
}
