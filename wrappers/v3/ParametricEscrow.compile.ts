import { CompilerConfig } from '@ton/blueprint';

export const compile: CompilerConfig = {
    lang: 'func',
    targets: [
        'contracts/v3/escrow/ParametricEscrow.fc',
    ],
};
