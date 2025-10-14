import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode, TupleBuilder } from '@ton/core';

export type ClaimsProcessorConfig = {
    ownerAddress: Address;
    nextClaimId: bigint;
    treasuryAddress: Address;
    primaryVaultAddress: Address;
    secondaryVaultAddress: Address;
    tradfiBufferAddress: Address;
    priceOracleAddress: Address;
    autoApprovalThreshold: number;
};

export function claimsProcessorConfigToCell(config: ClaimsProcessorConfig): Cell {
    // Store vault addresses in first reference cell
    const vaultsCell = beginCell()
        .storeAddress(config.treasuryAddress)
        .storeAddress(config.primaryVaultAddress)
        .storeAddress(config.secondaryVaultAddress)
        .endCell();

    // Store oracle addresses in second reference cell
    const oraclesCell = beginCell()
        .storeAddress(config.tradfiBufferAddress)
        .storeAddress(config.priceOracleAddress)
        .endCell();

    return beginCell()
        .storeAddress(config.ownerAddress)
        .storeUint(config.nextClaimId, 64)
        .storeDict(null) // claims_dict
        .storeRef(vaultsCell)
        .storeRef(oraclesCell)
        .storeUint(config.autoApprovalThreshold, 16)
        .storeDict(null) // verified_events
        .endCell();
}

export class ClaimsProcessor implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell }
    ) {}

    static createFromAddress(address: Address) {
        return new ClaimsProcessor(address);
    }

    static createFromConfig(config: ClaimsProcessorConfig, code: Cell, workchain = 0) {
        const data = claimsProcessorConfigToCell(config);
        const init = { code, data };
        return new ClaimsProcessor(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendFileClaim(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            policyId: bigint;
            coverageType: number;
            coverageAmount: bigint;
            evidence: Cell;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x01, 32) // op: file_claim
                .storeUint(opts.policyId, 64)
                .storeUint(opts.coverageType, 8)
                .storeCoins(opts.coverageAmount)
                .storeRef(opts.evidence)
                .endCell(),
        });
    }

    async sendAdminApproveClaim(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            claimId: bigint;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x02, 32) // op: admin_approve_claim
                .storeUint(opts.claimId, 64)
                .endCell(),
        });
    }

    async sendAdminRejectClaim(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            claimId: bigint;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x03, 32) // op: admin_reject_claim
                .storeUint(opts.claimId, 64)
                .endCell(),
        });
    }

    async sendAddVerifiedEvent(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            eventHash: bigint;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x10, 32) // op: add_verified_event
                .storeUint(opts.eventHash, 256)
                .endCell(),
        });
    }

    async getClaimStatus(provider: ContractProvider, claimId: bigint): Promise<{
        status: number;
        autoApproved: boolean;
        coverageAmount: bigint;
    }> {
        const result = await provider.get('get_claim_status', [
            { type: 'int', value: claimId }
        ]);
        return {
            status: result.stack.readNumber(),
            autoApproved: result.stack.readBoolean(),
            coverageAmount: result.stack.readBigNumber(),
        };
    }

}
