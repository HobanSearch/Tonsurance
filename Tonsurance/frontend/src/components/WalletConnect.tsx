import { TonConnectButton, useTonConnectUI, useTonAddress } from '@tonconnect/ui-react';
import { useEffect, useState } from 'react';

export const WalletConnect = () => {
  const [tonConnectUI] = useTonConnectUI();
  const userFriendlyAddress = useTonAddress();
  const [balance, setBalance] = useState<string>('0');

  useEffect(() => {
    if (userFriendlyAddress) {
      // Fetch balance when wallet is connected
      fetchBalance(userFriendlyAddress);
    }
  }, [userFriendlyAddress]);

  const fetchBalance = async (address: string) => {
    try {
      // TODO: Implement balance fetching using TON SDK
      // For now, just show 0
      setBalance('0');
    } catch (error) {
      console.error('Error fetching balance:', error);
      setBalance('0');
    }
  };

  const formatAddress = (address: string) => {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  return (
    <div className="flex items-center gap-4">
      {userFriendlyAddress && (
        <div className="hidden md:flex flex-col items-end text-sm">
          <span className="text-gray-600 dark:text-gray-400">
            {formatAddress(userFriendlyAddress)}
          </span>
          <span className="text-gray-500 dark:text-gray-500 text-xs">
            Balance: {balance} TON
          </span>
        </div>
      )}
      <TonConnectButton />
    </div>
  );
};
