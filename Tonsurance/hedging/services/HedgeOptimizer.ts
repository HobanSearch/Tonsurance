export interface MarketData {
    polymarket: VenueData;
    perpetuals: VenueData;
    allianz: VenueData;
}

export interface VenueData {
    cost: number;        // Cost as percentage (0.025 = 2.5%)
    capacity: number;    // Available capacity in TON
    confidence: number;  // Market confidence 0-1
}

export interface OptimizationConstraints {
    maxPerVenue?: number;      // Max allocation to single venue (0.5 = 50%)
    minPerVenue?: number;      // Min allocation to venue (0.15 = 15%)
    targetCost?: number;       // Target maximum cost (0.03 = 3%)
    requireDiversification?: boolean;  // Force all venues to have some allocation
}

export interface HedgeAllocation {
    polymarket: number;
    perpetuals: number;
    allianz: number;
    totalCost: number;
    score: number;  // Optimization score
}

export interface HedgeROI {
    venue: 'polymarket' | 'perpetuals' | 'allianz';
    coverageType: 'depeg' | 'exploit' | 'bridge';
    expectedPayout: number;
    totalCost: number;
    netROI: number;
    probability: number;
    expectedValue: number;
}

export class HedgeOptimizer {
    /**
     * Optimize hedge allocation across three venues
     */
    optimizeAllocation(opts: {
        totalHedgeNeeded: number;
        marketData: MarketData;
        constraints?: OptimizationConstraints;
    }): HedgeAllocation {
        const { totalHedgeNeeded, marketData, constraints = {} } = opts;

        // Default constraints
        const maxPerVenue = constraints.maxPerVenue || 0.5;  // 50%
        const minPerVenue = constraints.minPerVenue || 0.15; // 15%
        const requireDiversification = constraints.requireDiversification !== false;

        // Create array of venues sorted by cost efficiency
        const venues = [
            { name: 'polymarket', ...marketData.polymarket },
            { name: 'perpetuals', ...marketData.perpetuals },
            { name: 'allianz', ...marketData.allianz },
        ].sort((a, b) => a.cost - b.cost); // Sort by cost ascending

        const allocation: any = {
            polymarket: 0,
            perpetuals: 0,
            allianz: 0,
        };

        let remaining = totalHedgeNeeded;

        // If diversification required, allocate minimum to each venue first
        if (requireDiversification) {
            const minAllocation = totalHedgeNeeded * minPerVenue;

            for (const venue of venues) {
                const capped = Math.min(minAllocation, venue.capacity, remaining);
                allocation[venue.name] = capped;
                remaining -= capped;
            }
        }

        // Allocate remaining to venues by cost efficiency
        for (const venue of venues) {
            if (remaining <= 0) break;

            const maxAdditional = Math.min(
                totalHedgeNeeded * maxPerVenue - allocation[venue.name],
                venue.capacity - allocation[venue.name],
                remaining
            );

            if (maxAdditional > 0) {
                allocation[venue.name] += maxAdditional;
                remaining -= maxAdditional;
            }
        }

        // Calculate total cost
        const totalCost =
            (allocation.polymarket * marketData.polymarket.cost) +
            (allocation.perpetuals * marketData.perpetuals.cost) +
            (allocation.allianz * marketData.allianz.cost);

        // Calculate optimization score (lower cost = higher score)
        // Normalize totalCost to -100 to +100 range for better score sensitivity
        const normalizedCost = totalCost / 100;  // Scale costs to reasonable range
        const costScore = 1 - normalizedCost;  // Higher score for lower (more negative) costs
        const diversificationScore = this.calculateDiversificationScore(allocation, totalHedgeNeeded);
        const score = costScore * 0.8 + diversificationScore * 0.2;  // Increase cost weight

        return {
            polymarket: allocation.polymarket,
            perpetuals: allocation.perpetuals,
            allianz: allocation.allianz,
            totalCost,
            score,
        };
    }

    /**
     * Calculate diversification score (higher = more diversified)
     */
    private calculateDiversificationScore(allocation: any, total: number): number {
        const venues = ['polymarket', 'perpetuals', 'allianz'];
        const weights = venues.map(v => allocation[v] / total);

        // Calculate entropy (Shannon diversity index)
        let entropy = 0;
        for (const weight of weights) {
            if (weight > 0) {
                entropy -= weight * Math.log(weight);
            }
        }

        // Normalize to 0-1 (max entropy for 3 venues is ln(3) ≈ 1.099)
        return entropy / 1.099;
    }

    /**
     * Calculate expected ROI for a hedge
     */
    calculateHedgeROI(opts: {
        venue: 'polymarket' | 'perpetuals' | 'allianz';
        coverageType: 'depeg' | 'exploit' | 'bridge';
        amount: number;
        duration: number;
        marketData?: VenueData;
    }): HedgeROI {
        const { venue, coverageType, amount, duration, marketData } = opts;

        // Default market data if not provided
        const defaultData: VenueData = {
            cost: 0.025,
            capacity: 100000,
            confidence: 0.8,
        };

        const data = marketData || defaultData;

        // Expected payout is the hedge amount (if event occurs)
        const expectedPayout = amount;

        // Total cost depends on venue type
        let totalCost: number;
        let probability: number;

        switch (venue) {
            case 'polymarket':
                // Cost = amount * odds
                totalCost = amount * data.cost;
                probability = data.cost; // Odds represent probability
                break;

            case 'perpetuals':
                // Cost = amount * funding_rate * duration
                totalCost = amount * Math.abs(data.cost) * duration;
                probability = this.getDefaultProbability(coverageType);
                break;

            case 'allianz':
                // Cost = amount * quote (flat rate)
                totalCost = amount * data.cost;
                probability = this.getDefaultProbability(coverageType);
                break;
        }

        const netROI = expectedPayout - totalCost;
        const expectedValue = netROI * probability;

        return {
            venue,
            coverageType,
            expectedPayout,
            totalCost,
            netROI,
            probability,
            expectedValue,
        };
    }

    /**
     * Get default probability for coverage type
     */
    private getDefaultProbability(coverageType: 'depeg' | 'exploit' | 'bridge'): number {
        switch (coverageType) {
            case 'depeg':
                return 0.025; // 2.5% annual probability
            case 'exploit':
                return 0.030; // 3% annual probability
            case 'bridge':
                return 0.015; // 1.5% annual probability
            default:
                return 0.025;
        }
    }

    /**
     * Compare multiple allocation strategies
     */
    compareStrategies(opts: {
        totalHedgeNeeded: number;
        marketData: MarketData;
        strategies: OptimizationConstraints[];
    }): HedgeAllocation[] {
        const { totalHedgeNeeded, marketData, strategies } = opts;

        return strategies.map(constraints =>
            this.optimizeAllocation({ totalHedgeNeeded, marketData, constraints })
        ).sort((a, b) => b.score - a.score); // Sort by score descending
    }

    /**
     * Calculate optimal rebalance based on current vs target allocation
     */
    calculateRebalance(opts: {
        currentAllocation: HedgeAllocation;
        targetAllocation: HedgeAllocation;
    }): {
        polymarket: { action: 'increase' | 'decrease' | 'hold'; amount: number };
        perpetuals: { action: 'increase' | 'decrease' | 'hold'; amount: number };
        allianz: { action: 'increase' | 'decrease' | 'hold'; amount: number };
    } {
        const { currentAllocation, targetAllocation } = opts;

        return {
            polymarket: this.getRebalanceAction(
                currentAllocation.polymarket,
                targetAllocation.polymarket
            ),
            perpetuals: this.getRebalanceAction(
                currentAllocation.perpetuals,
                targetAllocation.perpetuals
            ),
            allianz: this.getRebalanceAction(
                currentAllocation.allianz,
                targetAllocation.allianz
            ),
        };
    }

    /**
     * Get rebalance action for a single venue
     */
    private getRebalanceAction(
        current: number,
        target: number
    ): { action: 'increase' | 'decrease' | 'hold'; amount: number } {
        const diff = target - current;
        const absDiff = Math.abs(diff);

        // 1% threshold for rebalancing
        if (absDiff / current < 0.01) {
            return { action: 'hold', amount: 0 };
        }

        return {
            action: diff > 0 ? 'increase' : 'decrease',
            amount: absDiff,
        };
    }
}
