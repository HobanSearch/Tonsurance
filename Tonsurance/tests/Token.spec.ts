import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano } from '@ton/core';
import { Token } from '../wrappers/Token';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

describe('Token', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compile('Token');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let token: SandboxContract<Token>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        token = blockchain.openContract(Token.createFromConfig({}, code));

        deployer = await blockchain.treasury('deployer');

        const deployResult = await token.sendDeploy(deployer.getSender(), toNano('0.05'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: token.address,
            deploy: true,
            success: true,
        });
    });

    it('should deploy', async () => {
        // the check is done inside beforeEach
        // blockchain and token are ready to use
    });
});
