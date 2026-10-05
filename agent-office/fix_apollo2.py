import re

with open("src/demo-parallel-failure.ts", "r") as f:
    code = f.read()

apollo_mock = """let apolloCallCount = 0;
    apollo.invoke = async (prompt, context) => {
        apolloCallCount++;
        if (apolloCallCount === 1) {
            return {
                success: true,
                data: {
                    type: "VERIFICATION",
                    status: "FAIL",
                    evidence: ["Tests failed"],
                    failures: ["Server crashed"],
                    requiredFixes: ["Fix server crash"]
                }
            };
        }
        return {
            success: true,
            data: {
                type: "VERIFICATION",
                status: "PASS",
                evidence: ["Tests passed"],
                failures: [],
                requiredFixes: []
            }
        };
    };"""

code = re.sub(r"apollo\.invoke\s*=\s*async\s*\(prompt,\s*context\)\s*=>\s*\{.*?(?:return\s+\{\s*success:\s*true.*?\n\s*\};\n|\n\s*\};\n|return.*?\n\s*\};)", apollo_mock, code, flags=re.DOTALL)

with open("src/demo-parallel-failure.ts", "w") as f:
    f.write(code)
