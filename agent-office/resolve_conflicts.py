import os
import re

def resolve_file(filepath):
    try:
        with open(filepath, 'r') as f:
            content = f.read()
    except:
        return
        
    if '<<<<<<< HEAD' not in content:
        return

    # Replace conflict markers by just keeping both blocks
    # <<<<<<< HEAD\n(block1)\n=======\n(block2)\n>>>>>>> ...
    pattern = r'<<<<<<< HEAD\n(.*?)\n=======\n(.*?)\n>>>>>>> [a-f0-9]+'
    
    def replacer(match):
        block1 = match.group(1)
        block2 = match.group(2)
        # Check if the block has commas at the end of lines (JSON-like)
        if filepath.endswith('.json'):
            b1_lines = [l for l in block1.split('\n') if l.strip()]
            b2_lines = [l for l in block2.split('\n') if l.strip()]
            
            if b1_lines and b2_lines and not b1_lines[-1].strip().endswith(','):
                 b1_lines[-1] = b1_lines[-1] + ','
            
            return '\n'.join(b1_lines + b2_lines)
            
        return block1 + '\n' + block2

    new_content = re.sub(pattern, replacer, content, flags=re.DOTALL)
    
    with open(filepath, 'w') as f:
        f.write(new_content)
    
    print(f"Resolved {filepath}")

files = [
    "package.json",
    "src/agents/base/BaseAgent.ts",
    "src/demo-failure.ts",
    "src/demo-multi-issue.ts",
    "src/demo-review-failure.ts",
    "src/demo-review.ts",
    "src/demo-testing-failure.ts",
    "src/demo-testing.ts",
    "src/demo.ts",
    "src/orchestration/Orchestrator.ts",
    "src/persistence/repositories/AgentRunRepository.ts"
]

for file in files:
    resolve_file(file)

