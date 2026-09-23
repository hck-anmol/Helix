import fs from "fs";
import path from "path";

async function runTests() {
    const testFiles = fs.readdirSync(__dirname).filter(f => f.endsWith(".test.ts"));
    let passed = 0;
    let failed = 0;

    for (const file of testFiles) {
        console.log(`\n--- Running ${file} ---`);
        try {
            const mod = await import(path.join(__dirname, file));
            if (mod.run) {
                await mod.run();
                console.log(`✅ ${file} passed`);
                passed++;
            }
        } catch (e: any) {
            console.error(`❌ ${file} failed:`, e);
            failed++;
        }
    }

    console.log(`\n========================================`);
    console.log(`Tests run: ${passed + failed}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    
    if (failed > 0) {
        process.exit(1);
    }
}

runTests();
