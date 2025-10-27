"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ComplianceGateway = void 0;
exports.complianceGatewayConfigToCell = complianceGatewayConfigToCell;
const core_1 = require("@ton/core");
function complianceGatewayConfigToCell(config) {
    return (0, core_1.beginCell)()
        .storeAddress(config.ownerAddress)
        .storeAddress(config.tradfiBufferAddress)
        .storeDict(null) // compliance_registry
        .storeDict(null) // admin_list
        .storeUint(config.totalApproved, 32)
        .storeUint(config.totalRejected, 32)
        .storeUint(config.totalExpired, 32)
        .endCell();
}
class ComplianceGateway {
    constructor(address, init) {
        this.address = address;
        this.init = init;
    }
    static createFromAddress(address) {
        return new ComplianceGateway(address);
    }
    static createFromConfig(config, code, workchain = 0) {
        const data = complianceGatewayConfigToCell(config);
        const init = { code, data };
        return new ComplianceGateway((0, core_1.contractAddress)(workchain, init), init);
    }
    async sendDeploy(provider, via, value) {
        await provider.internal(via, {
            value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)().endCell(),
        });
    }
    async sendSubmitKycApplication(provider, via, opts) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)()
                .storeUint(0x01, 32) // op: submit_kyc_application
                .storeUint(opts.tier, 8)
                .storeUint(opts.kycProviderId, 16)
                .storeRef(opts.kycDataHash)
                .endCell(),
        });
    }
    async sendApproveKyc(provider, via, opts) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)()
                .storeUint(0x02, 32) // op: approve_kyc
                .storeAddress(opts.applicant)
                .endCell(),
        });
    }
    async sendRejectKyc(provider, via, opts) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)()
                .storeUint(0x03, 32) // op: reject_kyc
                .storeAddress(opts.applicant)
                .storeUint(opts.reasonCode, 32)
                .endCell(),
        });
    }
    async sendRevokeCompliance(provider, via, opts) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)()
                .storeUint(0x04, 32) // op: revoke_compliance
                .storeAddress(opts.investor)
                .storeUint(opts.reasonCode, 32)
                .endCell(),
        });
    }
    async getComplianceStatus(provider, investor) {
        const result = await provider.get('get_compliance_status', [
            { type: 'slice', cell: (0, core_1.beginCell)().storeAddress(investor).endCell() }
        ]);
        return {
            status: result.stack.readNumber(),
            tier: result.stack.readNumber(),
            approvalTime: result.stack.readNumber(),
            expiryTime: result.stack.readNumber(),
        };
    }
    async isCompliant(provider, investor) {
        const result = await provider.get('is_compliant', [
            { type: 'slice', cell: (0, core_1.beginCell)().storeAddress(investor).endCell() }
        ]);
        return result.stack.readBoolean();
    }
    async getComplianceStats(provider) {
        const result = await provider.get('get_compliance_stats', []);
        return {
            totalApproved: result.stack.readNumber(),
            totalRejected: result.stack.readNumber(),
            totalExpired: result.stack.readNumber(),
        };
    }
}
exports.ComplianceGateway = ComplianceGateway;
