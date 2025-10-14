import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';

export type ComplianceGatewayConfig = {
    ownerAddress: Address;
    tradfiBufferAddress: Address;
    totalApproved: number;
    totalRejected: number;
    totalExpired: number;
};

export function complianceGatewayConfigToCell(config: ComplianceGatewayConfig): Cell {
    return beginCell()
        .storeAddress(config.ownerAddress)
        .storeAddress(config.tradfiBufferAddress)
        .storeDict(null) // compliance_registry
        .storeDict(null) // admin_list
        .storeUint(config.totalApproved, 32)
        .storeUint(config.totalRejected, 32)
        .storeUint(config.totalExpired, 32)
        .endCell();
}

export class ComplianceGateway implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell }
    ) {}

    static createFromAddress(address: Address) {
        return new ComplianceGateway(address);
    }

    static createFromConfig(config: ComplianceGatewayConfig, code: Cell, workchain = 0) {
        const data = complianceGatewayConfigToCell(config);
        const init = { code, data };
        return new ComplianceGateway(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendSubmitKycApplication(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            tier: number; // 1=Basic, 2=Enhanced, 3=Institutional
            kycProviderId: number;
            kycDataHash: Cell;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x01, 32) // op: submit_kyc_application
                .storeUint(opts.tier, 8)
                .storeUint(opts.kycProviderId, 16)
                .storeRef(opts.kycDataHash)
                .endCell(),
        });
    }

    async sendApproveKyc(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            applicant: Address;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x02, 32) // op: approve_kyc
                .storeAddress(opts.applicant)
                .endCell(),
        });
    }

    async sendRejectKyc(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            applicant: Address;
            reasonCode: number;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x03, 32) // op: reject_kyc
                .storeAddress(opts.applicant)
                .storeUint(opts.reasonCode, 32)
                .endCell(),
        });
    }

    async sendRevokeCompliance(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            investor: Address;
            reasonCode: number;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x04, 32) // op: revoke_compliance
                .storeAddress(opts.investor)
                .storeUint(opts.reasonCode, 32)
                .endCell(),
        });
    }

    async getComplianceStatus(provider: ContractProvider, investor: Address): Promise<{
        status: number; // 0=Pending, 1=Approved, 2=Rejected, 3=Expired
        tier: number;
        approvalTime: number;
        expiryTime: number;
    }> {
        const result = await provider.get('get_compliance_status', [
            { type: 'slice', cell: beginCell().storeAddress(investor).endCell() }
        ]);
        return {
            status: result.stack.readNumber(),
            tier: result.stack.readNumber(),
            approvalTime: result.stack.readNumber(),
            expiryTime: result.stack.readNumber(),
        };
    }

    async isCompliant(provider: ContractProvider, investor: Address): Promise<boolean> {
        const result = await provider.get('is_compliant', [
            { type: 'slice', cell: beginCell().storeAddress(investor).endCell() }
        ]);
        return result.stack.readBoolean();
    }

    async getComplianceStats(provider: ContractProvider): Promise<{
        totalApproved: number;
        totalRejected: number;
        totalExpired: number;
    }> {
        const result = await provider.get('get_compliance_stats', []);
        return {
            totalApproved: result.stack.readNumber(),
            totalRejected: result.stack.readNumber(),
            totalExpired: result.stack.readNumber(),
        };
    }
}
