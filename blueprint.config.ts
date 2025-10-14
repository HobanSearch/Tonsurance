import { Config } from '@ton/blueprint';

export const config: Config = {
    project: {
        type: 'ton',
        contracts: ['contracts/core', 'contracts/hedged', 'contracts/shared']
    },
    network: {
        version: 'v4',
        workchain: 0
    }
};
