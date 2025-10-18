import { useState } from 'react';
import { useTonAddress } from '@tonconnect/ui-react';
import { toNano } from '@ton/core';
import { useContracts } from '../hooks/useContracts';
import { TerminalWindow, RetroButton, InfoPanel } from '../components/terminal';
import type { Blockchain, Stablecoin } from '../components/ChainSelector';
import { ChainSelector } from '../components/ChainSelector';

interface EmployeeRow {
  id: string;
  walletAddress: string;
  coverageAmount: number;
  name?: string;
  email?: string;
}

interface BulkQuote {
  totalEmployees: number;
  totalCoverageAmount: number;
  basePerEmployeePremium: number;
  bulkDiscount: number; // percentage
  totalPremium: number;
  savingsFromBulk: number;
  durationDays: number;
}

export const EnterpriseBulk = () => {
  const userAddress = useTonAddress();
  const { contracts, sender } = useContracts();

  // Chain and asset
  const [selectedChain, setSelectedChain] = useState<Blockchain>('ethereum');
  const [selectedStablecoin, setSelectedStablecoin] = useState<Stablecoin>('USDC');

  // Employee data
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [isParsingCsv, setIsParsingCsv] = useState(false);

  // Configuration
  const [coveragePerEmployee, setCoveragePerEmployee] = useState<string>('5000');
  const [durationDays, setDurationDays] = useState<string>('90');

  // Quote
  const [quote, setQuote] = useState<BulkQuote | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvFile(file);
    setIsParsingCsv(true);

    try {
      const text = await file.text();
      const rows = text.split('\n').filter(row => row.trim());

      // Parse CSV: wallet_address, name, email, coverage_amount
      const parsed: EmployeeRow[] = [];

      for (let i = 1; i < rows.length; i++) { // Skip header
        const cols = rows[i].split(',').map(c => c.trim());
        if (cols.length >= 1 && cols[0]) {
          parsed.push({
            id: `emp-${i}`,
            walletAddress: cols[0],
            name: cols[1] || undefined,
            email: cols[2] || undefined,
            coverageAmount: cols[3] ? parseFloat(cols[3]) : parseFloat(coveragePerEmployee)
          });
        }
      }

      setEmployees(parsed);
      calculateBulkQuote(parsed);
    } catch (error) {
      console.error('Failed to parse CSV:', error);
      alert('Failed to parse CSV file. Please check format.');
    } finally {
      setIsParsingCsv(false);
    }
  };

  const calculateBulkQuote = async (employeeList: EmployeeRow[] = employees) => {
    if (employeeList.length === 0) {
      setQuote(null);
      return;
    }

    setIsCalculating(true);

    try {
      const days = parseFloat(durationDays) || 0;
      const totalCoverageAmount = employeeList.reduce((sum, emp) => sum + emp.coverageAmount, 0);

      // Base premium per employee (0.8% APR)
      const baseAPR = 0.008;
      const basePerEmployeePremium = parseFloat(coveragePerEmployee) * baseAPR * (days / 365);

      // Bulk discount tiers:
      // 10-49 employees: 5%
      // 50-99: 10%
      // 100-199: 15%
      // 200+: 20%
      let bulkDiscount = 0;
      if (employeeList.length >= 200) bulkDiscount = 0.20;
      else if (employeeList.length >= 100) bulkDiscount = 0.15;
      else if (employeeList.length >= 50) bulkDiscount = 0.10;
      else if (employeeList.length >= 10) bulkDiscount = 0.05;

      const totalBeforeDiscount = basePerEmployeePremium * employeeList.length;
      const savingsFromBulk = totalBeforeDiscount * bulkDiscount;
      const totalPremium = totalBeforeDiscount - savingsFromBulk;

      setQuote({
        totalEmployees: employeeList.length,
        totalCoverageAmount,
        basePerEmployeePremium,
        bulkDiscount: bulkDiscount * 100,
        totalPremium,
        savingsFromBulk,
        durationDays: days
      });
    } catch (error) {
      console.error('Failed to calculate bulk quote:', error);
    } finally {
      setIsCalculating(false);
    }
  };

  const handleAddManualEmployee = () => {
    const newEmployee: EmployeeRow = {
      id: `emp-${Date.now()}`,
      walletAddress: '',
      coverageAmount: parseFloat(coveragePerEmployee)
    };
    const updated = [...employees, newEmployee];
    setEmployees(updated);
    calculateBulkQuote(updated);
  };

  const handleRemoveEmployee = (id: string) => {
    const updated = employees.filter(emp => emp.id !== id);
    setEmployees(updated);
    calculateBulkQuote(updated);
  };

  const handleUpdateEmployee = (id: string, field: keyof EmployeeRow, value: any) => {
    const updated = employees.map(emp =>
      emp.id === id ? { ...emp, [field]: value } : emp
    );
    setEmployees(updated);
    calculateBulkQuote(updated);
  };

  const handleBulkPurchase = async () => {
    if (!userAddress || !contracts.hedgedPolicyFactory || !quote) {
      return;
    }

    setIsLoading(true);

    try {
      // In production: Call bulk purchase contract method
      // await contracts.hedgedPolicyFactory.sendBulkCreatePolicies(...)

      alert(`Bulk policies created successfully!\n\nEmployees: ${quote.totalEmployees}\nTotal Coverage: $${quote.totalCoverageAmount.toLocaleString()}\nTotal Premium: $${quote.totalPremium.toFixed(2)}\nSavings: $${quote.savingsFromBulk.toFixed(2)}`);
    } catch (error) {
      console.error('Failed to create bulk policies:', error);
      alert('Bulk purchase failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const downloadCsvTemplate = () => {
    const template = `wallet_address,name,email,coverage_amount
0QC...,John Doe,john@company.com,5000
0QC...,Jane Smith,jane@company.com,10000
0QC...,Bob Johnson,bob@company.com,5000`;

    const blob = new Blob([template], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tonsurance_bulk_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8 pb-20">
      {/* Header */}
      <TerminalWindow title="ENTERPRISE_BULK_INSURANCE">
        <div className="font-mono text-sm text-text-secondary">
          &gt; Bulk Discounts • CSV Import • Automated Distribution
          <div className="mt-2 text-xs">
            Protect your entire team with stablecoin insurance. Upload a CSV of employee
            wallets and coverage amounts, or add them manually. Enjoy volume discounts
            up to 20% for teams of 200+.
          </div>
        </div>
      </TerminalWindow>

      {/* Step 1: Chain & Asset */}
      <TerminalWindow title="STEP 1: SELECT BLOCKCHAIN & ASSET">
        <ChainSelector
          selectedChain={selectedChain}
          selectedStablecoin={selectedStablecoin}
          onChainChange={setSelectedChain}
          onStablecoinChange={setSelectedStablecoin}
        />
      </TerminalWindow>

      {/* Step 2: Coverage Configuration */}
      <TerminalWindow title="STEP 2: CONFIGURE COVERAGE">
        <div className="space-y-6">
          <div>
            <h3 className="text-text-secondary font-mono text-xs font-semibold mb-3 uppercase">
              Default Coverage Per Employee ({selectedStablecoin})
            </h3>
            <div className="flex gap-3">
              <input
                type="number"
                value={coveragePerEmployee}
                onChange={e => {
                  setCoveragePerEmployee(e.target.value);
                  calculateBulkQuote();
                }}
                className="flex-1 bg-cream-300/50 border border-cream-400 px-4 py-3 text-text-primary font-mono focus:border-copper-500 focus:outline-none outline-none"
              />
              <div className="grid grid-cols-4 gap-2">
                {['1000', '5000', '10000', '25000'].map(preset => (
                  <RetroButton
                    key={preset}
                    onClick={() => {
                      setCoveragePerEmployee(preset);
                      calculateBulkQuote();
                    }}
                    variant={coveragePerEmployee === preset ? 'primary' : 'secondary'}
                  >
                    ${preset}
                  </RetroButton>
                ))}
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-green-400 font-mono text-sm mb-3">
              DURATION (DAYS)
            </h3>
            <div className="flex gap-3">
              <input
                type="number"
                value={durationDays}
                onChange={e => {
                  setDurationDays(e.target.value);
                  calculateBulkQuote();
                }}
                className="flex-1 bg-cream-300/50 border border-cream-400 px-4 py-3 text-text-primary font-mono focus:border-copper-500 focus:outline-none outline-none"
              />
              <div className="grid grid-cols-4 gap-2">
                {['30', '90', '180', '365'].map(preset => (
                  <RetroButton
                    key={preset}
                    onClick={() => {
                      setDurationDays(preset);
                      calculateBulkQuote();
                    }}
                    variant={durationDays === preset ? 'primary' : 'secondary'}
                  >
                    {preset}d
                  </RetroButton>
                ))}
              </div>
            </div>
          </div>
        </div>
      </TerminalWindow>

      {/* Step 3: Employee List */}
      <TerminalWindow title="STEP 3: EMPLOYEE LIST">
        <div className="space-y-4">
          {/* CSV Upload */}
          <div className="border border-gray-700 bg-black/50 p-4">
            <h4 className="text-green-400 font-mono text-sm mb-3">
              IMPORT FROM CSV
            </h4>
            <div className="flex gap-3">
              <label className="flex-1">
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleCsvUpload}
                  className="hidden"
                  disabled={isParsingCsv}
                />
                <div className="bg-black border-2 border-gray-600 px-4 py-3 text-center text-gray-400 font-mono cursor-pointer hover:border-green-400 transition-colors">
                  {csvFile ? csvFile.name : 'CHOOSE CSV FILE'}
                </div>
              </label>
              <RetroButton onClick={downloadCsvTemplate} variant="secondary">
                DOWNLOAD TEMPLATE
              </RetroButton>
            </div>
            {isParsingCsv && (
              <div className="mt-2 text-xs text-yellow-400 font-mono animate-pulse">
                Parsing CSV file...
              </div>
            )}
          </div>

          {/* Manual Add */}
          <div className="flex justify-between items-center">
            <div className="text-gray-400 font-mono text-sm">
              {employees.length} EMPLOYEES LOADED
            </div>
            <RetroButton onClick={handleAddManualEmployee} variant="secondary">
              + ADD EMPLOYEE MANUALLY
            </RetroButton>
          </div>

          {/* Employee Table */}
          {employees.length > 0 && (
            <div className="border border-gray-700 overflow-auto max-h-96">
              <table className="w-full font-mono text-xs">
                <thead className="bg-gray-900 sticky top-0">
                  <tr>
                    <th className="text-left p-3 text-green-400">#</th>
                    <th className="text-left p-3 text-green-400">WALLET ADDRESS</th>
                    <th className="text-left p-3 text-green-400">NAME</th>
                    <th className="text-left p-3 text-green-400">EMAIL</th>
                    <th className="text-right p-3 text-green-400">COVERAGE</th>
                    <th className="text-center p-3 text-green-400">ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((emp, idx) => (
                    <tr key={emp.id} className="border-t border-gray-800 hover:bg-gray-900/50">
                      <td className="p-3 text-gray-500">{idx + 1}</td>
                      <td className="p-3">
                        <input
                          type="text"
                          value={emp.walletAddress}
                          onChange={e => handleUpdateEmployee(emp.id, 'walletAddress', e.target.value)}
                          className="w-full bg-transparent border border-gray-700 px-2 py-1 text-gray-300 focus:border-green-400 outline-none"
                          placeholder="0QC..."
                        />
                      </td>
                      <td className="p-3">
                        <input
                          type="text"
                          value={emp.name || ''}
                          onChange={e => handleUpdateEmployee(emp.id, 'name', e.target.value)}
                          className="w-full bg-transparent border border-gray-700 px-2 py-1 text-gray-300 focus:border-green-400 outline-none"
                          placeholder="Optional"
                        />
                      </td>
                      <td className="p-3">
                        <input
                          type="email"
                          value={emp.email || ''}
                          onChange={e => handleUpdateEmployee(emp.id, 'email', e.target.value)}
                          className="w-full bg-transparent border border-gray-700 px-2 py-1 text-gray-300 focus:border-green-400 outline-none"
                          placeholder="Optional"
                        />
                      </td>
                      <td className="p-3 text-right">
                        <input
                          type="number"
                          value={emp.coverageAmount}
                          onChange={e => handleUpdateEmployee(emp.id, 'coverageAmount', parseFloat(e.target.value))}
                          className="w-24 bg-transparent border border-gray-700 px-2 py-1 text-gray-300 text-right focus:border-green-400 outline-none"
                        />
                      </td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() => handleRemoveEmployee(emp.id)}
                          className="text-red-400 hover:text-red-300 px-2"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </TerminalWindow>

      {/* Bulk Quote */}
      {quote && quote.totalEmployees > 0 && (
        <TerminalWindow title="BULK QUOTE">
          <div className="space-y-4 font-mono text-sm">
            <div className="grid grid-cols-3 gap-4">
              <div className="border border-gray-700 p-3">
                <div className="text-gray-500 text-xs mb-1">Total Employees</div>
                <div className="text-green-400 text-2xl">{quote.totalEmployees}</div>
              </div>
              <div className="border border-gray-700 p-3">
                <div className="text-gray-500 text-xs mb-1">Total Coverage</div>
                <div className="text-green-400 text-2xl">${quote.totalCoverageAmount.toLocaleString()}</div>
              </div>
              <div className="border border-gray-700 p-3">
                <div className="text-gray-500 text-xs mb-1">Bulk Discount</div>
                <div className="text-yellow-400 text-2xl">{quote.bulkDiscount}%</div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-400">Base Premium (per employee):</span>
                <span className="text-gray-300">${quote.basePerEmployeePremium.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Subtotal ({quote.totalEmployees} employees):</span>
                <span className="text-gray-300">${(quote.totalPremium + quote.savingsFromBulk).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-yellow-400">Bulk Discount ({quote.bulkDiscount}%):</span>
                <span className="text-yellow-400">-${quote.savingsFromBulk.toFixed(2)}</span>
              </div>
              <div className="border-t border-gray-700 pt-2"></div>
              <div className="flex justify-between text-lg">
                <span className="text-green-400">Total Premium:</span>
                <span className="text-green-400 font-bold">${quote.totalPremium.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Avg per employee:</span>
                <span className="text-gray-400">${(quote.totalPremium / quote.totalEmployees).toFixed(2)}</span>
              </div>
            </div>

            {/* Discount Tier Info */}
            <div className="border border-gray-700 bg-black/50 p-3 text-xs">
              <div className="text-gray-400 mb-2">VOLUME DISCOUNT TIERS:</div>
              <div className="grid grid-cols-4 gap-2">
                <div className={quote.totalEmployees >= 10 && quote.totalEmployees < 50 ? 'text-yellow-400' : 'text-gray-600'}>
                  10-49: 5%
                </div>
                <div className={quote.totalEmployees >= 50 && quote.totalEmployees < 100 ? 'text-yellow-400' : 'text-gray-600'}>
                  50-99: 10%
                </div>
                <div className={quote.totalEmployees >= 100 && quote.totalEmployees < 200 ? 'text-yellow-400' : 'text-gray-600'}>
                  100-199: 15%
                </div>
                <div className={quote.totalEmployees >= 200 ? 'text-yellow-400' : 'text-gray-600'}>
                  200+: 20%
                </div>
              </div>
            </div>
          </div>
        </TerminalWindow>
      )}

      {/* Purchase Button */}
      <div className="flex gap-4">
        <RetroButton
          onClick={handleBulkPurchase}
          disabled={!userAddress || !quote || quote.totalEmployees === 0 || isLoading}
          variant="primary"
          className="flex-1 py-4 text-lg"
        >
          {isLoading ? 'PROCESSING...' : `PURCHASE FOR ${quote?.totalEmployees || 0} EMPLOYEES ($${quote?.totalPremium.toFixed(2) || '0.00'})`}
        </RetroButton>
      </div>

      {!userAddress && (
        <InfoPanel variant="warning">
          Please connect your TON wallet to purchase bulk parametric coverage
        </InfoPanel>
      )}

      {employees.length > 0 && employees.some(emp => !emp.walletAddress) && (
        <InfoPanel variant="error">
          Some employees are missing wallet addresses. Please fill in all required fields.
        </InfoPanel>
      )}
    </div>
  );
};
