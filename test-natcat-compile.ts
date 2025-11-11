import { compileV3 } from './tests/v3/compile-helper';

async function main() {
    console.log('🔨 Compiling NatCatChild contract...\n');

    try {
        const code = await compileV3('NatCatChild');
        console.log('✅ NatCatChild compiled successfully!');
        console.log('📦 Code hash:', code.hash().toString('hex'));
        console.log('📏 Code size:', code.toBoc().length, 'bytes\n');
        console.log('✨ Contract supports hours-based duration (6-8760 hours)');
        console.log('✨ Minimum coverage: 6 hours (overnight nat cat bonds)');
        console.log('✨ Radius range: 10-5000 km');
    } catch (error: any) {
        console.error('❌ Compilation failed:');
        console.error(error.message);
        process.exit(1);
    }
}

main();
