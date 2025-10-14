import { useMemo } from 'react';
import { useTonConnectUI, useTonAddress } from '@tonconnect/ui-react';
import {
  tonClient,
  policyFactory,
  hedgedPolicyFactory,
  primaryVault,
  secondaryVault,
  tradfiBuffer,
  claimsProcessor,
  pricingOracle,
  hedgeCoordinator,
  areContractsConfigured
} from '../lib/contracts';
import type { Sender, SenderArguments } from '@ton/core';
import { Address } from '@ton/core';

export const useContracts = () => {
  const [tonConnectUI] = useTonConnectUI();
  const userAddress = useTonAddress();

  // Create a Sender object for transactions
  const sender = useMemo<Sender>(() => {
    return {
      address: userAddress ? Address.parse(userAddress) : undefined,
      async send(args: SenderArguments) {
        if (!tonConnectUI.connected) {
          throw new Error('Wallet not connected');
        }

        await tonConnectUI.sendTransaction({
          validUntil: Math.floor(Date.now() / 1000) + 300, // 5 minutes
          messages: [
            {
              address: args.to.toString(),
              amount: args.value.toString(),
              payload: args.body?.toBoc().toString('base64'),
            },
          ],
        });
      },
    };
  }, [tonConnectUI, userAddress]);

  return {
    tonClient,
    sender,
    contracts: {
      policyFactory,
      hedgedPolicyFactory,
      primaryVault,
      secondaryVault,
      tradfiBuffer,
      claimsProcessor,
      pricingOracle,
      hedgeCoordinator,
    },
    isConfigured: areContractsConfigured(),
    isConnected: tonConnectUI.connected,
    userAddress,
  };
};
