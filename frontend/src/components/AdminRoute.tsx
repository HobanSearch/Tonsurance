import { useTonAddress } from '@tonconnect/ui-react';
import { Navigate } from 'react-router-dom';
import { TerminalWindow, TerminalOutput } from './terminal';

// Admin wallet addresses (whitelist)
const ADMIN_ADDRESSES = [
  // Add admin wallet addresses here
  'EQCj...', // Example admin address
  'UQAA...' // Another admin address
];

interface AdminRouteProps {
  children: React.ReactNode;
}

export const AdminRoute = ({ children }: AdminRouteProps) => {
  const userFriendlyAddress = useTonAddress();

  // If no wallet connected, show login prompt
  if (!userFriendlyAddress) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <TerminalWindow title="ADMIN_ACCESS_REQUIRED">
          <TerminalOutput>
            <div className="font-mono text-sm space-y-4">
              <div className="text-red-600">&gt; ERROR: UNAUTHORIZED_ACCESS</div>
              <div>&gt; Admin dashboard requires wallet authentication</div>
              <div className="pl-4 text-text-secondary">
                <div>1. Connect your wallet using the button in the navigation</div>
                <div>2. Ensure your wallet is whitelisted as an admin</div>
                <div>3. Return to this page after connecting</div>
              </div>
              <div className="pt-4">
                <button
                  onClick={() => window.location.href = '/'}
                  className="px-4 py-2 bg-copper-500 text-cream-50 border-2 border-copper-600 font-mono text-sm hover:bg-copper-600 transition-colors"
                >
                  &gt; RETURN_TO_HOME
                </button>
              </div>
            </div>
          </TerminalOutput>
        </TerminalWindow>
      </div>
    );
  }

  // Check if wallet is in admin list
  const isAdmin = ADMIN_ADDRESSES.some(addr => userFriendlyAddress.includes(addr.slice(0, 10)));

  // For development: allow all connected wallets (remove this in production)
  const isDevelopment = import.meta.env.DEV;

  if (!isAdmin && !isDevelopment) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <TerminalWindow title="ACCESS_DENIED">
          <TerminalOutput>
            <div className="font-mono text-sm space-y-4">
              <div className="text-red-600">&gt; ERROR: INSUFFICIENT_PRIVILEGES</div>
              <div>&gt; Connected wallet: {userFriendlyAddress.slice(0, 8)}...{userFriendlyAddress.slice(-6)}</div>
              <div>&gt; This wallet is not authorized to access the admin dashboard</div>
              <div className="pl-4 text-text-secondary">
                <div>Contact the system administrator to request admin access</div>
              </div>
              <div className="pt-4">
                <button
                  onClick={() => window.location.href = '/'}
                  className="px-4 py-2 bg-copper-500 text-cream-50 border-2 border-copper-600 font-mono text-sm hover:bg-copper-600 transition-colors"
                >
                  &gt; RETURN_TO_HOME
                </button>
              </div>
            </div>
          </TerminalOutput>
        </TerminalWindow>
      </div>
    );
  }

  // User is admin, render the admin dashboard
  return <>{children}</>;
};

// Hook to check if current user is admin
export const useIsAdmin = (): boolean => {
  const userFriendlyAddress = useTonAddress();
  const isDevelopment = import.meta.env.DEV;

  if (!userFriendlyAddress) return false;

  const isAdmin = ADMIN_ADDRESSES.some(addr => userFriendlyAddress.includes(addr.slice(0, 10)));

  return isAdmin || isDevelopment;
};
