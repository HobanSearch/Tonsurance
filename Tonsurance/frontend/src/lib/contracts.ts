import { TonClient, Address } from '@ton/ton';
import { PolicyFactory } from '../../../wrappers/PolicyFactory';
import { HedgedPolicyFactory } from '../../../wrappers/HedgedPolicyFactory';
import { PrimaryVault } from '../../../wrappers/PrimaryVault';
import { SecondaryVault } from '../../../wrappers/SecondaryVault';
import { TradFiBuffer } from '../../../wrappers/TradFiBuffer';
import { ClaimsProcessor } from '../../../wrappers/ClaimsProcessor';
import { PricingOracle } from '../../../wrappers/PricingOracle';
import { HedgeCoordinator } from '../../../wrappers/HedgeCoordinator';

// Get environment variables
const TON_ENDPOINT = import.meta.env.VITE_TON_API_ENDPOINT || 'https://testnet.toncenter.com/api/v2/jsonRPC';
const TON_API_KEY = import.meta.env.VITE_TON_API_KEY;

// Contract addresses from environment
const POLICY_FACTORY_ADDRESS = import.meta.env.VITE_POLICY_FACTORY_ADDRESS;
const HEDGED_POLICY_FACTORY_ADDRESS = import.meta.env.VITE_HEDGED_POLICY_FACTORY_ADDRESS;
const PRIMARY_VAULT_ADDRESS = import.meta.env.VITE_PRIMARY_VAULT_ADDRESS;
const SECONDARY_VAULT_ADDRESS = import.meta.env.VITE_SECONDARY_VAULT_ADDRESS;
const TRADFI_BUFFER_ADDRESS = import.meta.env.VITE_TRADFI_BUFFER_ADDRESS;
const CLAIMS_PROCESSOR_ADDRESS = import.meta.env.VITE_CLAIMS_PROCESSOR_ADDRESS;
const PRICING_ORACLE_ADDRESS = import.meta.env.VITE_PRICING_ORACLE_ADDRESS;
const HEDGE_COORDINATOR_ADDRESS = import.meta.env.VITE_HEDGE_COORDINATOR_ADDRESS;

// Initialize TON Client
export const tonClient = new TonClient({
  endpoint: TON_ENDPOINT,
  apiKey: TON_API_KEY,
});

// Contract instances
export const policyFactory = POLICY_FACTORY_ADDRESS
  ? tonClient.open(PolicyFactory.createFromAddress(Address.parse(POLICY_FACTORY_ADDRESS)))
  : null;

export const hedgedPolicyFactory = HEDGED_POLICY_FACTORY_ADDRESS
  ? tonClient.open(HedgedPolicyFactory.createFromAddress(Address.parse(HEDGED_POLICY_FACTORY_ADDRESS)))
  : null;

export const primaryVault = PRIMARY_VAULT_ADDRESS
  ? tonClient.open(PrimaryVault.createFromAddress(Address.parse(PRIMARY_VAULT_ADDRESS)))
  : null;

export const secondaryVault = SECONDARY_VAULT_ADDRESS
  ? tonClient.open(SecondaryVault.createFromAddress(Address.parse(SECONDARY_VAULT_ADDRESS)))
  : null;

export const tradfiBuffer = TRADFI_BUFFER_ADDRESS
  ? tonClient.open(TradFiBuffer.createFromAddress(Address.parse(TRADFI_BUFFER_ADDRESS)))
  : null;

export const claimsProcessor = CLAIMS_PROCESSOR_ADDRESS
  ? tonClient.open(ClaimsProcessor.createFromAddress(Address.parse(CLAIMS_PROCESSOR_ADDRESS)))
  : null;

export const pricingOracle = PRICING_ORACLE_ADDRESS
  ? tonClient.open(PricingOracle.createFromAddress(Address.parse(PRICING_ORACLE_ADDRESS)))
  : null;

export const hedgeCoordinator = HEDGE_COORDINATOR_ADDRESS
  ? tonClient.open(HedgeCoordinator.createFromAddress(Address.parse(HEDGE_COORDINATOR_ADDRESS)))
  : null;

// Export addresses for reference
export const CONTRACT_ADDRESSES = {
  policyFactory: POLICY_FACTORY_ADDRESS,
  hedgedPolicyFactory: HEDGED_POLICY_FACTORY_ADDRESS,
  primaryVault: PRIMARY_VAULT_ADDRESS,
  secondaryVault: SECONDARY_VAULT_ADDRESS,
  tradfiBuffer: TRADFI_BUFFER_ADDRESS,
  claimsProcessor: CLAIMS_PROCESSOR_ADDRESS,
  pricingOracle: PRICING_ORACLE_ADDRESS,
  hedgeCoordinator: HEDGE_COORDINATOR_ADDRESS,
};

// Helper function to check if contracts are configured
export const areContractsConfigured = () => {
  return !!(
    POLICY_FACTORY_ADDRESS &&
    PRIMARY_VAULT_ADDRESS &&
    SECONDARY_VAULT_ADDRESS
  );
};
