import { Address } from '@ton/core';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Centralized configuration for Phase 4 Hedged Insurance
 */

export interface HedgingConfig {
    // TON Blockchain
    ton: {
        network: 'testnet' | 'mainnet';
        apiEndpoint: string;
        apiKey: string;
    };

    // Smart Contract Addresses
    contracts: {
        pricingOracle: Address | null;
        hedgeCoordinator: Address | null;
        hedgedPolicyFactory: Address | null;
        reserveVault: Address | null;
    };

    // Keeper Configuration
    keeper: {
        mnemonic: string;
        address: Address | null;
    };

    // External APIs
    apis: {
        polymarket: {
            url: string;
            apiKey: string;
            apiSecret: string;
        };
        binance: {
            url: string;
            apiKey: string;
            apiSecret: string;
            testnet: boolean;
        };
        allianz: {
            url: string;
            apiKey: string;
            clientId: string;
            useMock: boolean;
        };
    };

    // API Server
    server: {
        port: number;
        corsOrigin: string;
        wsUpdateInterval: number;
    };

    // Keeper Intervals
    intervals: {
        pricingOracleUpdate: number;
        polymarketKeeperPoll: number;
        perpKeeperPoll: number;
        allianzKeeperPoll: number;
    };

    // Feature Flags
    features: {
        multiSigEnabled: boolean;
        apiLoggingEnabled: boolean;
    };

    // Environment
    env: 'development' | 'staging' | 'production';
    logLevel: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * Load configuration from environment variables
 */
export function loadConfig(): HedgingConfig {
    return {
        ton: {
            network: (process.env.TON_NETWORK as 'testnet' | 'mainnet') || 'testnet',
            apiEndpoint: process.env.TON_API_ENDPOINT || 'https://testnet.toncenter.com/api/v2/jsonRPC',
            apiKey: process.env.TON_API_KEY || '',
        },

        contracts: {
            pricingOracle: process.env.PRICING_ORACLE_ADDRESS
                ? Address.parse(process.env.PRICING_ORACLE_ADDRESS)
                : null,
            hedgeCoordinator: process.env.HEDGE_COORDINATOR_ADDRESS
                ? Address.parse(process.env.HEDGE_COORDINATOR_ADDRESS)
                : null,
            hedgedPolicyFactory: process.env.HEDGED_POLICY_FACTORY_ADDRESS
                ? Address.parse(process.env.HEDGED_POLICY_FACTORY_ADDRESS)
                : null,
            reserveVault: process.env.RESERVE_VAULT_ADDRESS
                ? Address.parse(process.env.RESERVE_VAULT_ADDRESS)
                : null,
        },

        keeper: {
            mnemonic: process.env.KEEPER_MNEMONIC || '',
            address: process.env.KEEPER_ADDRESS
                ? Address.parse(process.env.KEEPER_ADDRESS)
                : null,
        },

        apis: {
            polymarket: {
                url: process.env.POLYMARKET_API_URL || 'https://clob.polymarket.com',
                apiKey: process.env.POLYMARKET_API_KEY || '',
                apiSecret: process.env.POLYMARKET_API_SECRET || '',
            },
            binance: {
                url: process.env.BINANCE_API_URL || 'https://fapi.binance.com',
                apiKey: process.env.BINANCE_API_KEY || '',
                apiSecret: process.env.BINANCE_API_SECRET || '',
                testnet: process.env.BINANCE_TESTNET === 'true',
            },
            allianz: {
                url: process.env.ALLIANZ_API_URL || 'https://api.allianz-parametric.com',
                apiKey: process.env.ALLIANZ_API_KEY || '',
                clientId: process.env.ALLIANZ_CLIENT_ID || '',
                useMock: process.env.ALLIANZ_USE_MOCK !== 'false',
            },
        },

        server: {
            port: parseInt(process.env.API_PORT || '3000'),
            corsOrigin: process.env.API_CORS_ORIGIN || '*',
            wsUpdateInterval: parseInt(process.env.WS_UPDATE_INTERVAL || '5000'),
        },

        intervals: {
            pricingOracleUpdate: parseInt(process.env.PRICING_ORACLE_UPDATE_INTERVAL || '5000'),
            polymarketKeeperPoll: parseInt(process.env.POLYMARKET_KEEPER_POLL_INTERVAL || '5000'),
            perpKeeperPoll: parseInt(process.env.PERP_KEEPER_POLL_INTERVAL || '5000'),
            allianzKeeperPoll: parseInt(process.env.ALLIANZ_KEEPER_POLL_INTERVAL || '10000'),
        },

        features: {
            multiSigEnabled: process.env.MULTI_SIG_ENABLED === 'true',
            apiLoggingEnabled: process.env.ENABLE_API_LOGGING !== 'false',
        },

        env: (process.env.NODE_ENV as any) || 'development',
        logLevel: (process.env.LOG_LEVEL as any) || 'debug',
    };
}

/**
 * Validate configuration
 */
export function validateConfig(config: HedgingConfig): void {
    const errors: string[] = [];

    // Check required fields
    if (!config.ton.apiKey && config.env === 'production') {
        errors.push('TON_API_KEY is required for production');
    }

    if (!config.contracts.pricingOracle) {
        errors.push('PRICING_ORACLE_ADDRESS is required');
    }

    if (!config.contracts.hedgeCoordinator) {
        errors.push('HEDGE_COORDINATOR_ADDRESS is required');
    }

    if (!config.contracts.hedgedPolicyFactory) {
        errors.push('HEDGED_POLICY_FACTORY_ADDRESS is required');
    }

    if (!config.keeper.mnemonic && config.env === 'production') {
        errors.push('KEEPER_MNEMONIC is required for production');
    }

    // API keys (warn only in development)
    if (config.env === 'production') {
        if (!config.apis.polymarket.apiKey) {
            errors.push('POLYMARKET_API_KEY is required for production');
        }

        if (!config.apis.binance.apiKey) {
            errors.push('BINANCE_API_KEY is required for production');
        }

        if (!config.apis.allianz.apiKey && !config.apis.allianz.useMock) {
            errors.push('ALLIANZ_API_KEY is required when not using mock');
        }
    }

    if (errors.length > 0) {
        throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
    }
}

/**
 * Get configuration (singleton)
 */
let configInstance: HedgingConfig | null = null;

export function getConfig(): HedgingConfig {
    if (!configInstance) {
        configInstance = loadConfig();
        validateConfig(configInstance);
    }
    return configInstance;
}

/**
 * Reset configuration (for testing)
 */
export function resetConfig(): void {
    configInstance = null;
}
