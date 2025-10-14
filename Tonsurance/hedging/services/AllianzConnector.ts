import axios, { AxiosInstance } from 'axios';

/**
 * AllianzConnector - Execute parametric insurance hedges with Allianz
 *
 * NOTE: This is a MOCK implementation for development/testing.
 * In production, this would integrate with Allianz's actual parametric insurance API.
 *
 * Parametric insurance pays out automatically when predefined triggers are met,
 * without requiring proof of loss.
 */

export interface AllianzPolicy {
    externalId: string;
    policyNumber: string;
    coverageType: 'depeg' | 'exploit' | 'bridge';
    coverageAmount: number;
    premium: number;
    trigger: {
        type: 'price_below' | 'hack_confirmed' | 'bridge_exploit';
        threshold: number | string;
        duration: number; // Hours
    };
    startDate: Date;
    endDate: Date;
    status: 'ACTIVE' | 'EXPIRED' | 'CLAIMED';
}

export interface AllianzOrderResult {
    externalId: string;
    policyNumber: string;
    status: 'ACTIVE' | 'PENDING' | 'FAILED';
    coverageType: 'depeg' | 'exploit' | 'bridge';
    coverageAmount: number;
    premium: number;
    certificateUrl: string;
    venue: 'allianz';
}

export interface AllianzQuote {
    coverageType: 'depeg' | 'exploit' | 'bridge';
    coverageAmount: number;
    duration: number; // Days
    premium: number;
    premiumRate: number; // Per $1000 coverage
    validUntil: Date;
}

export interface AllianzClaim {
    policyNumber: string;
    claimAmount: number;
    triggerMet: boolean;
    payout: number;
    processingTime: number; // Days
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
}

export interface AllianzConnectorConfig {
    apiUrl: string;
    apiKey: string;
    clientId: string;
    useMock?: boolean; // Use mock responses for testing
}

export class AllianzConnector {
    private client: AxiosInstance;
    private config: AllianzConnectorConfig;
    private policies: Map<string, AllianzPolicy> = new Map();
    public retryCount: number = 0;

    constructor(config: AllianzConnectorConfig) {
        this.config = config;
        this.client = axios.create({
            baseURL: config.apiUrl,
            timeout: 30000, // 30s (parametric insurance may be slower)
            headers: {
                'X-API-Key': config.apiKey,
                'X-Client-ID': config.clientId,
                'Content-Type': 'application/json',
            },
        });
    }

    /**
     * Get quote for parametric insurance coverage
     */
    async getQuote(opts: {
        coverageType: 'depeg' | 'exploit' | 'bridge';
        coverageAmount: number;
        duration: number; // Days
    }): Promise<AllianzQuote> {
        const { coverageType, coverageAmount, duration } = opts;

        // Mock implementation
        if (this.config.useMock !== false) {
            return this.mockGetQuote(opts);
        }

        try {
            const response = await this.client.post('/parametric/quote', {
                product: 'defi_risk',
                coverage_type: coverageType,
                coverage_amount: coverageAmount,
                duration_days: duration,
                currency: 'USD',
            });

            const quote = response.data;

            return {
                coverageType,
                coverageAmount,
                duration,
                premium: quote.premium,
                premiumRate: quote.rate_per_1000,
                validUntil: new Date(quote.valid_until),
            };
        } catch (error: any) {
            throw new Error(`Allianz quote failed: ${error.message}`);
        }
    }

    /**
     * Purchase parametric insurance policy
     */
    async placeOrder(opts: {
        coverageType: 'depeg' | 'exploit' | 'bridge';
        coverageAmount: number;
        duration: number; // Days
        expectedPremium: number;
    }): Promise<AllianzOrderResult> {
        const { coverageType, coverageAmount, duration, expectedPremium } = opts;

        // Mock implementation
        if (this.config.useMock !== false) {
            return this.mockPlaceOrder(opts);
        }

        try {
            const response = await this.client.post('/parametric/bind', {
                product: 'defi_risk',
                coverage_type: coverageType,
                coverage_amount: coverageAmount,
                duration_days: duration,
                premium: expectedPremium,
                currency: 'USD',
                trigger_parameters: this.getTriggerParameters(coverageType),
            });

            const policy = response.data;

            const result: AllianzOrderResult = {
                externalId: policy.policy_id,
                policyNumber: policy.policy_number,
                status: policy.status === 'bound' ? 'ACTIVE' : 'PENDING',
                coverageType,
                coverageAmount,
                premium: policy.premium,
                certificateUrl: policy.certificate_url,
                venue: 'allianz',
            };

            // Track policy
            this.trackPolicy(result.externalId, {
                externalId: result.externalId,
                policyNumber: result.policyNumber,
                coverageType,
                coverageAmount,
                premium: policy.premium,
                trigger: this.getTriggerParameters(coverageType),
                startDate: new Date(policy.effective_date),
                endDate: new Date(policy.expiry_date),
                status: 'ACTIVE',
            });

            return result;
        } catch (error: any) {
            // Handle rate limiting
            if (error.response?.status === 429 && this.retryCount < 3) {
                this.retryCount++;
                await this.sleep(2000 * Math.pow(2, this.retryCount));
                return this.placeOrder(opts);
            }

            this.retryCount = 0;
            throw new Error(`Allianz policy binding failed: ${error.message}`);
        }
    }

    /**
     * File claim on parametric policy
     */
    async fileClaim(opts: {
        externalId: string;
        policyNumber: string;
        triggerEvidence: any;
    }): Promise<AllianzClaim> {
        const { policyNumber, triggerEvidence } = opts;

        // Mock implementation
        if (this.config.useMock !== false) {
            return this.mockFileClaim(opts);
        }

        try {
            const response = await this.client.post('/parametric/claim', {
                policy_number: policyNumber,
                trigger_evidence: triggerEvidence,
                claim_date: new Date().toISOString(),
            });

            const claim = response.data;

            return {
                policyNumber,
                claimAmount: claim.claim_amount,
                triggerMet: claim.trigger_met,
                payout: claim.payout,
                processingTime: claim.processing_days,
                status: claim.status,
            };
        } catch (error: any) {
            throw new Error(`Allianz claim filing failed: ${error.message}`);
        }
    }

    /**
     * Get policy status
     */
    async getPolicyStatus(policyNumber: string): Promise<AllianzPolicy | null> {
        const policy = this.policies.get(policyNumber);
        if (policy) return policy;

        // Mock implementation
        if (this.config.useMock !== false) {
            return null;
        }

        try {
            const response = await this.client.get(`/parametric/policy/${policyNumber}`);
            const data = response.data;

            return {
                externalId: data.policy_id,
                policyNumber: data.policy_number,
                coverageType: data.coverage_type,
                coverageAmount: data.coverage_amount,
                premium: data.premium,
                trigger: data.trigger_parameters,
                startDate: new Date(data.effective_date),
                endDate: new Date(data.expiry_date),
                status: data.status,
            };
        } catch (error: any) {
            console.error(`Failed to fetch policy ${policyNumber}:`, error.message);
            return null;
        }
    }

    /**
     * Track policy internally
     */
    private trackPolicy(externalId: string, policy: AllianzPolicy): void {
        this.policies.set(externalId, policy);
        this.policies.set(policy.policyNumber, policy); // Also index by policy number
    }

    /**
     * Get trigger parameters based on coverage type
     */
    private getTriggerParameters(
        coverageType: 'depeg' | 'exploit' | 'bridge'
    ): AllianzPolicy['trigger'] {
        const triggers: Record<string, AllianzPolicy['trigger']> = {
            depeg: {
                type: 'price_below',
                threshold: 0.95,
                duration: 4, // USDT below $0.95 for 4+ hours
            },
            exploit: {
                type: 'hack_confirmed',
                threshold: 'protocol_hack',
                duration: 24, // Hack confirmed by 3+ sources within 24h
            },
            bridge: {
                type: 'bridge_exploit',
                threshold: 'bridge_loss',
                duration: 12, // Bridge exploit confirmed within 12h
            },
        };

        return triggers[coverageType];
    }

    /**
     * Sleep utility
     */
    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    // ===== MOCK IMPLEMENTATIONS FOR TESTING =====

    private mockGetQuote(opts: {
        coverageType: 'depeg' | 'exploit' | 'bridge';
        coverageAmount: number;
        duration: number;
    }): AllianzQuote {
        const { coverageType, coverageAmount, duration } = opts;

        // Mock premium rates (per $1000 coverage)
        const rates: Record<string, number> = {
            depeg: 0.0045, // $4.50 per $1000
            exploit: 0.0060, // $6.00 per $1000
            bridge: 0.0050, // $5.00 per $1000
        };

        const rate = rates[coverageType];
        const premium = (coverageAmount * rate * duration) / 365;

        return {
            coverageType,
            coverageAmount,
            duration,
            premium,
            premiumRate: rate,
            validUntil: new Date(Date.now() + 10 * 60 * 1000), // 10 min validity
        };
    }

    private mockPlaceOrder(opts: {
        coverageType: 'depeg' | 'exploit' | 'bridge';
        coverageAmount: number;
        duration: number;
        expectedPremium: number;
    }): AllianzOrderResult {
        const { coverageType, coverageAmount, expectedPremium } = opts;

        const policyNumber = `ALZ-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

        const result: AllianzOrderResult = {
            externalId: `allianz-${Date.now()}`,
            policyNumber,
            status: 'ACTIVE',
            coverageType,
            coverageAmount,
            premium: expectedPremium,
            certificateUrl: `https://allianz.com/certificates/${policyNumber}.pdf`,
            venue: 'allianz',
        };

        // Track policy
        this.trackPolicy(result.externalId, {
            externalId: result.externalId,
            policyNumber,
            coverageType,
            coverageAmount,
            premium: expectedPremium,
            trigger: this.getTriggerParameters(coverageType),
            startDate: new Date(),
            endDate: new Date(Date.now() + opts.duration * 24 * 60 * 60 * 1000),
            status: 'ACTIVE',
        });

        return result;
    }

    private mockFileClaim(opts: {
        externalId: string;
        policyNumber: string;
        triggerEvidence: any;
    }): AllianzClaim {
        const policy = this.policies.get(opts.externalId);

        return {
            policyNumber: opts.policyNumber,
            claimAmount: policy?.coverageAmount || 0,
            triggerMet: true,
            payout: policy?.coverageAmount || 0,
            processingTime: 3, // 3-5 days typical
            status: 'APPROVED',
        };
    }
}
