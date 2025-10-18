import { toNano, Address } from '@ton/core';
import { ParametricEscrow, ParametricEscrowConfig } from '../wrappers/ParametricEscrow';
import { compile, NetworkProvider } from '@ton/blueprint';

/**
 * Deployment Script for Parametric Escrow Contract
 *
 * Purpose: Deploy a single escrow instance for conditional payment
 * Network: Testnet/Mainnet
 *
 * The escrow contract supports:
 * - Conditional release based on oracle verification
 * - Multi-party distribution (split payments to multiple recipients)
 * - Automatic timeout handling (refund, release, or split)
 * - Dispute freezing mechanism
 * - Emergency withdrawal after 30 days of dispute
 *
 * Use Cases:
 * 1. Payment escrow for services (freelancer work, deliveries)
 * 2. Smart contract-based milestone payments
 * 3. Decentralized dispute resolution
 * 4. Insurance claim escrow (hold payout until verification)
 * 5. Conditional rewards/incentives
 *
 * Configuration Options:
 * - Timeout Action: refund_payer | release_payee | split (with percentage)
 * - Additional Parties: Optional list of addresses + percentages for splits
 * - Protection Policy: Optional insurance policy ID for escrow protection
 * - Condition Hash: Hash of off-chain conditions (verified by oracle)
 */

export async function run(provider: NetworkProvider) {
    const ui = provider.ui();

    // Prompt for escrow configuration
    ui.write('=== Parametric Escrow Deployment ===\n\n');

    const escrowIdStr = await ui.input('Enter Escrow ID (unique identifier): ');
    const escrowId = BigInt(escrowIdStr);

    const payerAddressStr = await ui.input('Enter Payer Address: ');
    const payerAddress = Address.parse(payerAddressStr);

    const payeeAddressStr = await ui.input('Enter Payee Address: ');
    const payeeAddress = Address.parse(payeeAddressStr);

    const oracleAddressStr = await ui.input('Enter Oracle Address (backend service): ');
    const oracleAddress = Address.parse(oracleAddressStr);

    const timeoutSecondsStr = await ui.input('Enter Timeout Duration (seconds, e.g., 3600 for 1 hour): ');
    const timeoutSeconds = parseInt(timeoutSecondsStr);

    ui.write('\nTimeout Action Options:\n');
    ui.write('1. Refund to Payer\n');
    ui.write('2. Release to Payee\n');
    ui.write('3. Split between Payer and Payee\n');

    const timeoutActionChoice = await ui.input('Select timeout action (1-3): ');

    let timeoutAction;
    if (timeoutActionChoice === '1') {
        timeoutAction = { type: 'refund_payer' as const };
    } else if (timeoutActionChoice === '2') {
        timeoutAction = { type: 'release_payee' as const };
    } else if (timeoutActionChoice === '3') {
        const splitPercentageStr = await ui.input('Enter percentage for payee (0-100): ');
        const splitPercentage = parseInt(splitPercentageStr);
        timeoutAction = { type: 'split' as const, percentage: splitPercentage };
    } else {
        throw new Error('Invalid timeout action choice');
    }

    const conditionHashStr = await ui.input('Enter Condition Hash (hex, e.g., 0x1234...): ');
    const conditionHash = BigInt(conditionHashStr);

    const hasProtectionPolicy = await ui.input('Link to protection policy? (y/n): ');
    let protectionPolicyId: bigint | undefined;
    if (hasProtectionPolicy.toLowerCase() === 'y') {
        const policyIdStr = await ui.input('Enter Protection Policy ID: ');
        protectionPolicyId = BigInt(policyIdStr);
    }

    const hasAdditionalParties = await ui.input('Add additional payment parties? (y/n): ');
    let additionalParties;
    if (hasAdditionalParties.toLowerCase() === 'y') {
        const partiesCountStr = await ui.input('Enter number of additional parties (1-10): ');
        const partiesCount = parseInt(partiesCountStr);

        additionalParties = [];
        for (let i = 0; i < partiesCount; i++) {
            ui.write(`\nParty ${i + 1}:\n`);
            const partyAddressStr = await ui.input('  Address: ');
            const partyPercentageStr = await ui.input('  Percentage (0-100): ');

            additionalParties.push({
                address: Address.parse(partyAddressStr),
                percentage: parseInt(partyPercentageStr),
            });
        }
    }

    ui.write('\n--- Configuration Summary ---\n');
    ui.write(`Escrow ID: ${escrowId}\n`);
    ui.write(`Payer: ${payerAddress.toString()}\n`);
    ui.write(`Payee: ${payeeAddress.toString()}\n`);
    ui.write(`Oracle: ${oracleAddress.toString()}\n`);
    ui.write(`Timeout: ${timeoutSeconds}s\n`);
    ui.write(`Timeout Action: ${JSON.stringify(timeoutAction)}\n`);
    ui.write(`Condition Hash: 0x${conditionHash.toString(16)}\n`);
    if (protectionPolicyId) {
        ui.write(`Protection Policy ID: ${protectionPolicyId}\n`);
    }
    if (additionalParties) {
        ui.write(`Additional Parties: ${additionalParties.length}\n`);
    }
    ui.write('----------------------------\n\n');

    const confirm = await ui.input('Deploy with this configuration? (y/n): ');
    if (confirm.toLowerCase() !== 'y') {
        ui.write('Deployment cancelled.\n');
        return;
    }

    // Compile contract
    ui.write('Compiling ParametricEscrow contract...\n');
    const code = await compile('ParametricEscrow');

    // Create configuration
    const config: ParametricEscrowConfig = {
        escrowId,
        payerAddress,
        payeeAddress,
        oracleAddress,
        amount: 0n, // Will be set during initialization
        status: 0, // PENDING
        createdAt: Math.floor(Date.now() / 1000),
        timeoutSeconds,
        timeoutAction,
        conditionHash,
        additionalParties,
        protectionPolicyId,
    };

    // Create contract instance
    const parametricEscrow = provider.open(
        ParametricEscrow.createFromConfig(config, code)
    );

    ui.write(`Deploying to address: ${parametricEscrow.address}\n\n`);

    // Deploy contract (requires payer to send funds)
    ui.write('NOTE: The payer must send the escrow amount when initializing.\n');
    ui.write('Deployment will create the contract but NOT initialize it yet.\n');
    ui.write('After deployment, the payer should call sendDeploy() with the escrow amount.\n\n');

    const deployAmountStr = await ui.input('Enter deployment fee amount (TON, e.g., 0.05): ');
    const deployAmount = toNano(deployAmountStr);

    await parametricEscrow.sendDeploy(provider.sender(), deployAmount);

    await provider.waitForDeploy(parametricEscrow.address);

    ui.write('\n=== Deployment Complete ===\n');
    ui.write(`Contract Address: ${parametricEscrow.address}\n`);
    ui.write(`Escrow ID: ${escrowId}\n\n`);

    // Get initial contract state
    try {
        const status = await parametricEscrow.getStatus();
        const statusNames = ['PENDING', 'ACTIVE', 'RELEASED', 'CANCELLED', 'DISPUTED', 'TIMED_OUT'];
        ui.write(`Current Status: ${statusNames[status]}\n`);

        const amount = await parametricEscrow.getAmount();
        ui.write(`Escrowed Amount: ${amount} nanoTON\n`);

        const timeRemaining = await parametricEscrow.getTimeRemaining();
        ui.write(`Time Remaining: ${timeRemaining} seconds\n`);
    } catch (error) {
        ui.write('Note: Contract state will be available after initialization.\n');
    }

    ui.write('\n=== Next Steps ===\n');
    ui.write('1. Payer should call sendDeploy() with the escrow amount to initialize\n');
    ui.write('2. Oracle monitors off-chain conditions\n');
    ui.write('3. When conditions met, Oracle calls sendRelease() or sendMultiPartyRelease()\n');
    ui.write('4. If conditions not met by timeout, anyone can call sendHandleTimeout()\n');
    ui.write('5. Payer or Payee can call sendCancel() to cancel escrow\n');
    ui.write('\n=== Oracle Integration ===\n');
    ui.write(`Export this contract address to your backend:\n`);
    ui.write(`ESCROW_CONTRACT_ADDRESS=${parametricEscrow.address}\n`);
    ui.write(`ESCROW_ID=${escrowId}\n`);
    ui.write(`CONDITION_HASH=0x${conditionHash.toString(16)}\n`);
}
