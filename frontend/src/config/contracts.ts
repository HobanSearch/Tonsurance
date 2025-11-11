/**
 * Tonsurance Contract Addresses (Testnet)
 *
 * NOTE: Update these addresses after running:
 * npx blueprint run scripts/v3/deployHackathonDemo.ts
 */

export const CONTRACTS = {
  // Core Protocol
  masterFactory: 'EQA...',  // UPDATE: MasterFactory address
  policyNFTMinter: 'EQB...',  // UPDATE: PolicyNFTMinter address
  multiTrancheVault: 'EQC...',  // UPDATE: MultiTrancheVault address
  priceOracle: 'EQD...',  // UPDATE: PriceOracle address

  // DeFi Products (Depeg Insurance)
  defi: {
    depegSubFactory: 'EQE...',  // UPDATE: DepegSubFactory address
    children: {
      usdt: 'EQF...',  // UPDATE: USDT StablecoinChild address
      usdc: 'EQG...',  // UPDATE: USDC StablecoinChild address
      usde: 'EQH...',  // UPDATE: USDe StablecoinChild address
    },
  },

  // TradFi Products (Natural Catastrophe)
  tradfi: {
    natCatFactory: 'EQI...',  // UPDATE: TradFiNatCatFactory address
    children: {
      hurricane: 'EQJ...',  // UPDATE: Hurricane NatCatChild address
      earthquake: 'EQK...',  // UPDATE: Earthquake NatCatChild address
    },
  },
};

/**
 * Asset ID mapping (matches on-chain contract IDs)
 */
export const ASSET_IDS = {
  defi: {
    USDT: 1,
    USDC: 2,
    USDe: 7,
  },
  tradfi: {
    HURRICANE: 1,
    EARTHQUAKE: 2,
  },
};

/**
 * Product type IDs (matches MasterFactory routing)
 */
export const PRODUCT_TYPES = {
  DEPEG: 1,
  BRIDGE: 2,
  ORACLE: 3,
  CONTRACT: 4,
  TRADFI_NATCAT: 5,
};

/**
 * Helper function to check if contracts are configured
 */
export function areContractsConfigured(): boolean {
  return (
    !CONTRACTS.masterFactory.startsWith('EQA...') &&
    !CONTRACTS.defi.depegSubFactory.startsWith('EQE...') &&
    !CONTRACTS.tradfi.natCatFactory.startsWith('EQI...')
  );
}

/**
 * Get contract address by product type and asset symbol
 */
export function getContractAddress(
  productType: 'defi' | 'tradfi',
  assetSymbol: string
): string {
  if (productType === 'defi') {
    const symbol = assetSymbol.toLowerCase();
    return CONTRACTS.defi.children[symbol as keyof typeof CONTRACTS.defi.children] || '';
  } else if (productType === 'tradfi') {
    const symbol = assetSymbol.toLowerCase();
    return CONTRACTS.tradfi.children[symbol as keyof typeof CONTRACTS.tradfi.children] || '';
  }
  return '';
}

/**
 * Get asset ID by product type and symbol
 */
export function getAssetId(
  productType: 'defi' | 'tradfi',
  assetSymbol: string
): number {
  if (productType === 'defi') {
    return ASSET_IDS.defi[assetSymbol.toUpperCase() as keyof typeof ASSET_IDS.defi] || 0;
  } else if (productType === 'tradfi') {
    return ASSET_IDS.tradfi[assetSymbol.toUpperCase() as keyof typeof ASSET_IDS.tradfi] || 0;
  }
  return 0;
}
