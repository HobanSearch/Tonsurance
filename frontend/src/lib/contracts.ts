import { TonClient, Address } from '@ton/ton';
import { PolicyFactory } from '../../../wrappers/PolicyFactory';
import { HedgedPolicyFactory } from '../../../wrappers/HedgedPolicyFactory';
import { ClaimsProcessor } from '../../../wrappers/ClaimsProcessor';
import { PricingOracle } from '../../../wrappers/PricingOracle';
import { HedgeCoordinator } from '../../../wrappers/HedgeCoordinator';
import { MultiTrancheVault } from '../../../wrappers/MultiTrancheVault';
import { DynamicPricingOracle } from '../../../wrappers/DynamicPricingOracle';
import { PolicyRouter } from '../../../wrappers/PolicyRouter';
import { PolicyShard } from '../../../wrappers/PolicyShard';
import { Treasury } from '../../../wrappers/Treasury';

// Get environment variables
const TON_ENDPOINT = import.meta.env.VITE_TON_API_ENDPOINT || 'https://testnet.toncenter.com/api/v2/jsonRPC';
const TON_API_KEY = import.meta.env.VITE_TON_API_KEY;

// Contract addresses from environment
const POLICY_FACTORY_ADDRESS = import.meta.env.VITE_POLICY_FACTORY_ADDRESS;
const HEDGED_POLICY_FACTORY_ADDRESS = import.meta.env.VITE_HEDGED_POLICY_FACTORY_ADDRESS;
const CLAIMS_PROCESSOR_ADDRESS = import.meta.env.VITE_CLAIMS_PROCESSOR_ADDRESS;
const PRICING_ORACLE_ADDRESS = import.meta.env.VITE_PRICING_ORACLE_ADDRESS;
const HEDGE_COORDINATOR_ADDRESS = import.meta.env.VITE_HEDGE_COORDINATOR_ADDRESS;
const MULTI_TRANCHE_VAULT_ADDRESS = import.meta.env.VITE_MULTI_TRANCHE_VAULT_ADDRESS;
const DYNAMIC_PRICING_ORACLE_ADDRESS = import.meta.env.VITE_DYNAMIC_PRICING_ORACLE_ADDRESS;
const POLICY_ROUTER_ADDRESS = import.meta.env.VITE_POLICY_ROUTER_ADDRESS;
const TREASURY_ADDRESS = import.meta.env.VITE_TREASURY_ADDRESS;

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

export const claimsProcessor = CLAIMS_PROCESSOR_ADDRESS
  ? tonClient.open(ClaimsProcessor.createFromAddress(Address.parse(CLAIMS_PROCESSOR_ADDRESS)))
  : null;

export const pricingOracle = PRICING_ORACLE_ADDRESS
  ? tonClient.open(PricingOracle.createFromAddress(Address.parse(PRICING_ORACLE_ADDRESS)))
  : null;

export const hedgeCoordinator = HEDGE_COORDINATOR_ADDRESS
  ? tonClient.open(HedgeCoordinator.createFromAddress(Address.parse(HEDGE_COORDINATOR_ADDRESS)))
  : null;

export const multiTrancheVault = MULTI_TRANCHE_VAULT_ADDRESS
  ? tonClient.open(MultiTrancheVault.createFromAddress(Address.parse(MULTI_TRANCHE_VAULT_ADDRESS)))
  : null;

export const dynamicPricingOracle = DYNAMIC_PRICING_ORACLE_ADDRESS
  ? tonClient.open(DynamicPricingOracle.createFromAddress(Address.parse(DYNAMIC_PRICING_ORACLE_ADDRESS)))
  : null;

export const policyRouter = POLICY_ROUTER_ADDRESS
  ? tonClient.open(PolicyRouter.createFromAddress(Address.parse(POLICY_ROUTER_ADDRESS)))
  : null;

export const treasury = TREASURY_ADDRESS
  ? tonClient.open(Treasury.createFromAddress(Address.parse(TREASURY_ADDRESS)))
  : null;

// Export addresses for reference
export const CONTRACT_ADDRESSES = {
  policyFactory: POLICY_FACTORY_ADDRESS,
  hedgedPolicyFactory: HEDGED_POLICY_FACTORY_ADDRESS,
  claimsProcessor: CLAIMS_PROCESSOR_ADDRESS,
  pricingOracle: PRICING_ORACLE_ADDRESS,
  hedgeCoordinator: HEDGE_COORDINATOR_ADDRESS,
  multiTrancheVault: MULTI_TRANCHE_VAULT_ADDRESS,
  dynamicPricingOracle: DYNAMIC_PRICING_ORACLE_ADDRESS,
  policyRouter: POLICY_ROUTER_ADDRESS,
  treasury: TREASURY_ADDRESS,
};

// Helper function to check if contracts are configured
export const areContractsConfigured = () => {
  return !!(
    POLICY_FACTORY_ADDRESS &&
    MULTI_TRANCHE_VAULT_ADDRESS
  );
};
