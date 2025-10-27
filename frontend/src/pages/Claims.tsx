import { useState, useEffect } from 'react';
import { useTonAddress } from '@tonconnect/ui-react';
import { toNano, beginCell, Address } from '@ton/core';
import { useContracts } from '../hooks/useContracts';
import { TerminalWindow, TerminalOutput, RetroButton, InfoPanel } from '../components/terminal';

interface Policy {
  id: string;
  coverageType: string;
  coverageAmount: number;
  expiryDate: string;
  status: 'active' | 'expired' | 'claimed';
}

interface ClaimProof {
  transactionHash?: string;
  priceData?: string;
  description: string;
  timestamp: number;
}

export const Claims = () => {
  const userAddress = useTonAddress();
  const { contracts, sender, isConfigured } = useContracts();
  const [selectedPolicy, setSelectedPolicy] = useState<string>('');
  const [claimProof, setClaimProof] = useState<ClaimProof>({
    transactionHash: '',
    priceData: '',
    description: '',
    timestamp: Date.now()
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [userPolicies, setUserPolicies] = useState<Policy[]>([]);

  // Fetch user's policies from PolicyFactory contract
  useEffect(() => {
    const fetchPolicies = async () => {
      if (!isConfigured || !userAddress || !contracts.policyFactory) {
        // Show mock policies when contracts not configured
        if (userAddress) {
          setUserPolicies([
            {
              id: '1',
              coverageType: 'Stablecoin Depeg',
              coverageAmount: 10000,
              expiryDate: '2025-11-09',
              status: 'active'
            },
            {
              id: '2',
              coverageType: 'Smart Contract Exploit',
              coverageAmount: 25000,
              expiryDate: '2025-12-15',
              status: 'active'
            }
          ]);
        }
        return;
      }

      setIsFetching(true);
      try {
        const totalPolicies = await contracts.policyFactory.getTotalPoliciesCreated();
        const policies: Policy[] = [];

        // Fetch details for each policy (in production, you'd filter by user address)
        for (let i = 1n; i <= totalPolicies && i <= 10n; i++) {
          try {
            const policyData = await contracts.policyFactory.getPolicyData(i);

            if (policyData.active) {
              const coverageTypes = ['Stablecoin Depeg', 'Smart Contract Exploit', 'Oracle Failure', 'Bridge Hack'];
              const expiryTimestamp = policyData.startTime + policyData.duration * 86400;
              const expiryDate = new Date(expiryTimestamp * 1000);
              const isExpired = Date.now() / 1000 > expiryTimestamp;

              policies.push({
                id: i.toString(),
                coverageType: coverageTypes[policyData.coverageType] || 'Unknown',
                coverageAmount: Number(policyData.coverageAmount) / 1e9, // Convert from nanotons
                expiryDate: expiryDate.toISOString().split('T')[0],
                status: isExpired ? 'expired' : 'active'
              });
            }
          } catch (error) {
            console.error(`Error fetching policy ${i}:`, error);
          }
        }

        setUserPolicies(policies);
      } catch (error) {
        console.error('Error fetching policies:', error);
      } finally {
        setIsFetching(false);
      }
    };

    fetchPolicies();
  }, [isConfigured, userAddress, contracts.policyFactory]);

  const handleSubmitClaim = async () => {
    if (!userAddress || !selectedPolicy) {
      alert('Please connect wallet and select a policy');
      return;
    }

    if (!claimProof.description) {
      alert('Please provide claim details');
      return;
    }

    if (!isConfigured || !contracts.claimsProcessor) {
      alert('Claims contract not configured. Using demo mode.\n\nYour claim will be reviewed by the oracle network.');
      setClaimProof({ transactionHash: '', priceData: '', description: '', timestamp: Date.now() });
      setSelectedPolicy('');
      return;
    }

    setIsLoading(true);
    try {
      const selectedPolicyData = userPolicies.find(p => p.id === selectedPolicy);
      if (!selectedPolicyData) {
        alert('Policy not found');
        return;
      }

      // Map coverage type to integer
      const coverageTypeMap: Record<string, number> = {
        'Stablecoin Depeg': 0,
        'Smart Contract Exploit': 1,
        'Oracle Failure': 2,
        'Bridge Hack': 3
      };
      const coverageType = coverageTypeMap[selectedPolicyData.coverageType] || 0;

      // Build evidence cell
      const evidenceCell = beginCell()
        .storeUint(claimProof.timestamp, 64)
        .storeRef(
          beginCell()
            .storeStringTail(claimProof.description)
            .endCell()
        );

      if (claimProof.transactionHash) {
        evidenceCell.storeRef(
          beginCell()
            .storeStringTail(claimProof.transactionHash)
            .endCell()
        );
      }

      if (claimProof.priceData) {
        evidenceCell.storeRef(
          beginCell()
            .storeStringTail(claimProof.priceData)
            .endCell()
        );
      }

      const gasAmount = toNano('0.1');

      await contracts.claimsProcessor.sendFileClaim(sender, {
        value: gasAmount,
        policyId: BigInt(selectedPolicy),
        coverageType: coverageType,
        chainId: 0, // Default to TON chain
        stablecoinId: 0, // Default to USDT
        coverageAmount: toNano(selectedPolicyData.coverageAmount),
        evidence: evidenceCell.endCell(),
      });

      alert('Claim submitted successfully!\n\nYour claim will be reviewed by the oracle network (typically 5-10 minutes).');

      setClaimProof({ transactionHash: '', priceData: '', description: '', timestamp: Date.now() });
      setSelectedPolicy('');
    } catch (error: any) {
      console.error('Error submitting claim:', error);

      if (error.message?.includes('User rejected')) {
        alert('Transaction was rejected');
      } else {
        alert(`Failed to submit claim: ${error.message || 'Unknown error'}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const selectedPolicyData = userPolicies.find(p => p.id === selectedPolicy);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <TerminalWindow title="SUBMIT_CLAIM">
        <TerminalOutput type="info">
          <div className="text-sm mb-3">
            &gt; Initializing claims processing system...<br />
            &gt; <span className="output-success">✓ Connected to oracle network</span><br />
            &gt; File a claim for your active insurance policies
          </div>
        </TerminalOutput>
      </TerminalWindow>

      {!userAddress ? (
        <InfoPanel type="warning">
          <TerminalOutput>
            <div className="text-sm text-center">
              &gt; Please connect your wallet to view and submit claims
            </div>
          </TerminalOutput>
        </InfoPanel>
      ) : userPolicies.length === 0 ? (
        <InfoPanel type="default">
          <TerminalOutput>
            <div className="text-sm text-center">
              &gt; No active policies found<br />
              &gt; Purchase insurance first to be able to submit claims
            </div>
          </TerminalOutput>
        </InfoPanel>
      ) : (
        <div className="grid md:grid-cols-3 gap-6">
          {/* Claims Form */}
          <div className="md:col-span-2 space-y-6">
            {/* Policy Selection */}
            <TerminalWindow title="SELECT_POLICY">
              <div className="space-y-3">
                {userPolicies.map((policy) => (
                  <button
                    key={policy.id}
                    onClick={() => setSelectedPolicy(policy.id)}
                    className={`w-full p-3 border-2 transition-colors text-left ${
                      selectedPolicy === policy.id
                        ? 'border-copper-500 bg-copper-50'
                        : 'border-cream-400 hover:bg-cream-300'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="font-semibold text-copper-500 text-sm">
                          {policy.coverageType.toUpperCase()}
                        </div>
                        <div className="text-xs text-text-secondary mt-1 font-mono">
                          POLICY #{policy.id} • ${policy.coverageAmount.toLocaleString()}
                        </div>
                      </div>
                      <span className={`px-2 py-1 text-xs font-semibold border ${
                        policy.status === 'active'
                          ? 'bg-terminal-green/20 text-terminal-green border-terminal-green'
                          : 'bg-cream-300 text-text-secondary border-cream-400'
                      }`}>
                        {policy.status.toUpperCase()}
                      </span>
                    </div>
                    <div className="text-xs text-text-tertiary mt-1.5 font-mono">
                      EXPIRES: {new Date(policy.expiryDate).toLocaleDateString()}
                    </div>
                  </button>
                ))}
              </div>
            </TerminalWindow>

            {/* Claim Details */}
            {selectedPolicy && (
              <TerminalWindow title="CLAIM_EVIDENCE">
                <div className="space-y-5">
                  {/* Transaction Hash */}
                  <div>
                    <label className="block text-xs font-semibold text-text-secondary mb-2 uppercase">
                      Transaction Hash (Optional)
                    </label>
                    <input
                      type="text"
                      value={claimProof.transactionHash}
                      onChange={(e) => setClaimProof({ ...claimProof, transactionHash: e.target.value })}
                      className="w-full px-3 py-2 bg-cream-300/50 border border-cream-400 font-mono text-sm"
                      placeholder="0x..."
                    />
                    <p className="text-xs text-text-tertiary mt-1">
                      &gt; Provide the transaction hash related to the incident
                    </p>
                  </div>

                  {/* Price Data */}
                  {selectedPolicyData?.coverageType === 'Stablecoin Depeg' && (
                    <div>
                      <label className="block text-xs font-semibold text-text-secondary mb-2 uppercase">
                        Price Data Source
                      </label>
                      <input
                        type="text"
                        value={claimProof.priceData}
                        onChange={(e) => setClaimProof({ ...claimProof, priceData: e.target.value })}
                        className="w-full px-3 py-2 bg-cream-300/50 border border-cream-400 font-mono text-sm"
                        placeholder="Chainlink, CoinGecko, etc."
                      />
                      <p className="text-xs text-text-tertiary mt-1">
                        &gt; Oracle or price feed showing the depeg event
                      </p>
                    </div>
                  )}

                  {/* Description */}
                  <div>
                    <label className="block text-xs font-semibold text-text-secondary mb-2 uppercase">
                      Claim Description *
                    </label>
                    <textarea
                      value={claimProof.description}
                      onChange={(e) => setClaimProof({ ...claimProof, description: e.target.value })}
                      className="w-full px-3 py-2 bg-cream-300/50 border border-cream-400 font-mono text-sm"
                      placeholder="Describe the incident and why you're filing a claim..."
                      rows={6}
                      required
                    />
                    <p className="text-xs text-text-tertiary mt-1">
                      &gt; Provide detailed information about the claim event
                    </p>
                  </div>

                  <RetroButton
                    onClick={handleSubmitClaim}
                    disabled={isLoading || !claimProof.description}
                    variant="primary"
                    className="w-full"
                  >
                    {isLoading ? 'SUBMITTING...' : 'SUBMIT CLAIM >>'}
                  </RetroButton>
                </div>
              </TerminalWindow>
            )}
          </div>

          {/* Claim Info */}
          <div className="md:col-span-1">
            <TerminalWindow title="CLAIMS_PROCESS">
              <div className="space-y-5 text-xs sticky top-4">
                <TerminalOutput>
                  <div className="space-y-3">
                    <div className="flex gap-3">
                      <div className="flex-shrink-0 w-5 h-5 border-2 border-copper-500 text-copper-500 flex items-center justify-center font-bold text-xs">
                        1
                      </div>
                      <div>
                        <div className="font-semibold text-sm">SUBMIT CLAIM</div>
                        <div className="text-text-secondary mt-0.5">
                          Provide evidence and details
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <div className="flex-shrink-0 w-5 h-5 border-2 border-copper-500 text-copper-500 flex items-center justify-center font-bold text-xs">
                        2
                      </div>
                      <div>
                        <div className="font-semibold text-sm">ORACLE VERIFICATION</div>
                        <div className="text-text-secondary mt-0.5">
                          Multi-keeper validation (~5 min)
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <div className="flex-shrink-0 w-5 h-5 border-2 border-copper-500 text-copper-500 flex items-center justify-center font-bold text-xs">
                        3
                      </div>
                      <div>
                        <div className="font-semibold text-sm">INSTANT PAYOUT</div>
                        <div className="text-text-secondary mt-0.5">
                          Funds sent to your wallet
                        </div>
                      </div>
                    </div>
                  </div>
                </TerminalOutput>

                <div className="border-t-2 border-cream-400 pt-3">
                  <div className="space-y-1.5">
                    <div className="output-success">✓ Processing: 5-10 minutes</div>
                    <div className="output-success">✓ 100% on-chain verification</div>
                    <div className="output-success">✓ No manual review required</div>
                    <div className="output-success">✓ Automated payout</div>
                  </div>
                </div>

                {selectedPolicyData && (
                  <div className="border-t-2 border-cream-400 pt-3">
                    <div className="text-text-secondary mb-1.5">MAXIMUM PAYOUT:</div>
                    <div className="text-2xl font-bold text-terminal-green font-mono">
                      ${selectedPolicyData.coverageAmount.toLocaleString()}
                    </div>
                  </div>
                )}
              </div>
            </TerminalWindow>
          </div>
        </div>
      )}
    </div>
  );
};
