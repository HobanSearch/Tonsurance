import { TonConnectButton, useTonConnectUI, useTonAddress } from '@tonconnect/ui-react';
import { useEffect, useState } from 'react';
import { Address } from '@ton/core';

export const WalletConnect = () => {
  const [tonConnectUI] = useTonConnectUI();
  const userFriendlyAddress = useTonAddress();
  const [balance, setBalance] = useState<string>('...');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (userFriendlyAddress) {
      // Fetch balance when wallet is connected
      fetchBalance(userFriendlyAddress);
      // Refresh balance every 30 seconds
      const interval = setInterval(() => fetchBalance(userFriendlyAddress), 30000);
      return () => clearInterval(interval);
    } else {
      setBalance('...');
    }
  }, [userFriendlyAddress]);

  const fetchBalance = async (address: string) => {
    if (isLoading) return;

    try {
      setIsLoading(true);

      // Use TON API to fetch balance
      const response = await fetch(
        `https://toncenter.com/api/v2/getAddressBalance?address=${address}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch balance');
      }

      const data = await response.json();

      if (data.ok && data.result) {
        // Convert nanotons to TON (1 TON = 10^9 nanotons)
        const balanceInTon = (parseInt(data.result) / 1_000_000_000).toFixed(2);
        setBalance(balanceInTon);
      } else {
        setBalance('0.00');
      }
    } catch (error) {
      console.error('Error fetching balance:', error);
      setBalance('0.00');
    } finally {
      setIsLoading(false);
    }
  };

  const formatAddress = (address: string) => {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  return (
    <div className="flex items-center gap-3">
      {userFriendlyAddress && (
        <div className="hidden md:flex flex-col items-end font-mono">
          <div className="flex items-center gap-2 px-3 py-1 bg-cream-300 border-2 border-cream-400">
            <div className="w-2 h-2 bg-terminal-green rounded-full animate-pulse"></div>
            <span className="text-text-primary text-xs font-semibold">
              {formatAddress(userFriendlyAddress)}
            </span>
          </div>
          <span className="text-text-tertiary text-[10px] mt-0.5 px-3">
            {balance} TON
          </span>
        </div>
      )}
      <TonConnectButton />
    </div>
  );
};
