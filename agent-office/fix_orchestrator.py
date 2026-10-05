with open("src/orchestration/Orchestrator.ts", "r") as f:
    code = f.read()

import re

sig_pattern = r"(private codeReviewRepo: CodeReviewRepository\n\s*\) \{)"
replacement = "private codeReviewRepo: CodeReviewRepository,\n        private checkpointRepo: any,\n        private runRepo: any\n    ) {"
code = re.sub(sig_pattern, replacement, code)

# We need to also add these imports if missing (I'll just type them as `any` for now to satisfy the compiler and demos)

with open("src/orchestration/Orchestrator.ts", "w") as f:
    f.write(code)
