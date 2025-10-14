import { Link } from 'react-router-dom';
import { TerminalWindow, TerminalOutput, RetroButton } from '../components/terminal';

export const Home = () => {
  return (
    <div className="space-y-6">
      {/* Hero Terminal */}
      <TerminalWindow title="WELCOME">
        <TerminalOutput type="info">
          <pre className="ascii-art text-copper-500 opacity-80 mb-4">
{`
 _____ ___  _   _ ____  _   _ ____      _    _   _  ____ _____
|_   _/ _ \\| \\ | / ___|| | | |  _ \\    / \\  | \\ | |/ ___| ____|
  | || | | |  \\| \\___ \\| | | | |_) |  / _ \\ |  \\| | |   |  _|
  | || |_| | |\\  |___) | |_| |  _ <  / ___ \\| |\\  | |___| |___
  |_| \\___/|_| \\_|____/ \\___/|_| \\_\\/_/   \\_\\_| \\_|\\____|_____|
`}
          </pre>
          <div className="space-y-1.5 text-sm">
            <div>&gt; System initialized...</div>
            <div>&gt; Loading protocol modules...</div>
            <div className="output-success">&gt; ✓ Connected to TON Network</div>
            <div className="text-text-secondary mt-3 text-base leading-relaxed">
              Decentralized risk vault protocol with on-chain collateral and instant claims.
              <br />
              Choose between fixed-rate or dynamic hedged coverage products.
            </div>
          </div>
        </TerminalOutput>
      </TerminalWindow>

      {/* Product Cards */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Core Coverage */}
        <TerminalWindow title="CORE_COVERAGE">
          <div className="space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b-2 border-cream-400">
              <span className="text-2xl">🛡️</span>
              <h2 className="text-lg font-bold text-copper-500">CORE COVERAGE</h2>
            </div>

            <TerminalOutput>
              <div className="text-base text-text-secondary leading-relaxed">
                100% on-chain collateral with fixed APR pricing.
                Perfect for retail users and Telegram bots.
              </div>
            </TerminalOutput>

            <div className="space-y-1.5 text-sm">
              <div className="flex items-center gap-2">
                <span className="output-success">✓</span> Fixed 0.8% APR pricing
              </div>
              <div className="flex items-center gap-2">
                <span className="output-success">✓</span> Three-tier risk vault system
              </div>
              <div className="flex items-center gap-2">
                <span className="output-success">✓</span> Instant claim payouts
              </div>
              <div className="flex items-center gap-2">
                <span className="output-success">✓</span> 200-250% capital efficiency
              </div>
            </div>

            <Link to="/policy">
              <RetroButton variant="primary" className="w-full">
                BUY CORE COVERAGE &gt;&gt;
              </RetroButton>
            </Link>
          </div>
        </TerminalWindow>

        {/* Hedged Coverage */}
        <TerminalWindow title="HEDGED_COVERAGE">
          <div className="space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b-2 border-cream-400">
              <span className="text-2xl">⚡</span>
              <h2 className="text-lg font-bold text-copper-500">HEDGED COVERAGE</h2>
            </div>

            <TerminalOutput>
              <div className="text-base text-text-secondary leading-relaxed">
                Dynamic swing pricing with prediction markets, perpetuals, and off-chain reinsurance.
                15-30% lower premiums when markets are favorable.
              </div>
            </TerminalOutput>

            <div className="space-y-1.5 text-sm">
              <div className="flex items-center gap-2">
                <span className="output-success">✓</span> Real-time pricing (5s updates)
              </div>
              <div className="flex items-center gap-2">
                <span className="output-success">✓</span> 80/20 on-chain/external hedges
              </div>
              <div className="flex items-center gap-2">
                <span className="output-success">✓</span> Multi-venue optimization
              </div>
              <div className="flex items-center gap-2">
                <span className="output-success">✓</span> Lower premiums on average
              </div>
            </div>

            <Link to="/hedged">
              <RetroButton variant="primary" className="w-full">
                GET HEDGED QUOTE &gt;&gt;
              </RetroButton>
            </Link>
          </div>
        </TerminalWindow>
      </div>

      {/* Stats Terminal */}
      <TerminalWindow title="SYSTEM_STATS">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-terminal-green">$0M</div>
            <div className="text-xs text-text-secondary mt-1">Total Value Locked</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-terminal-green">0</div>
            <div className="text-xs text-text-secondary mt-1">Active Policies</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-terminal-green">$0M</div>
            <div className="text-xs text-text-secondary mt-1">Coverage Provided</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-terminal-green">100%</div>
            <div className="text-xs text-text-secondary mt-1">Claims Paid Out</div>
          </div>
        </div>
      </TerminalWindow>

      {/* CTA Terminal */}
      <TerminalWindow title="QUICK_START">
        <div className="text-center space-y-4">
          <TerminalOutput>
            <div className="text-lg font-bold text-copper-500 mb-2">
              &gt; READY TO PROTECT YOUR ASSETS?
            </div>
            <div className="text-base text-text-secondary">
              Connect your wallet to get started in less than 60 seconds
            </div>
          </TerminalOutput>

          <div className="flex justify-center gap-3 pt-2">
            <Link to="/vaults">
              <RetroButton>EARN YIELD</RetroButton>
            </Link>
            <Link to="/policy">
              <RetroButton variant="primary">BUY COVERAGE</RetroButton>
            </Link>
          </div>
        </div>
      </TerminalWindow>
    </div>
  );
};
