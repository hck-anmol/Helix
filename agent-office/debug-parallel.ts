import { execSync } from 'child_process';
try {
    execSync('npm run demo-parallel', { stdio: 'inherit' });
} catch (e) {}
