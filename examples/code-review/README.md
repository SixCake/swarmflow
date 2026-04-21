# Code Review — Distributed Multi-Agent Review

A SwarmFlow example demonstrating distributed code review where multiple specialized agents review code from different perspectives, then converge on a unified assessment.

## What This Example Does

1. **Independent Review** (Parallel Phase) — Each reviewer independently analyzes the code
2. **Discussion** (Interactive Phase) — Reviewers discuss disagreements and refine their assessments
3. **Final Assessment** (Aggregate Phase) — Each reviewer provides their final verdict

## Agents

| Role | Focus Area | Capabilities |
|------|-----------|-------------|
| **Security Reviewer** | Vulnerabilities, injection attacks, auth issues | security, analysis |
| **Performance Reviewer** | Bottlenecks, complexity, resource usage | performance, analysis |
| **Maintainability Reviewer** | Code quality, readability, SOLID principles | quality, analysis |
| **Architecture Reviewer** | Design patterns, coupling, scalability | architecture, analysis |

## Running

```bash
# From the repository root
npx tsx examples/code-review/index.ts
```

## Key Concepts Demonstrated

- **4-agent parallel review** with specialized capabilities
- **Interactive discussion** for resolving conflicting assessments
- **Convergence** using `bothAgree` policy (all reviewers must agree to stop)
- **Score-based assessment** with structured output (score, severity tags)
- **AggregationDigest** for combining review scores and key findings

## Architecture

```
Mission: Review Pull Request #42
├── Phase 1: Independent Review (parallel)
│   ├── Task: security review
│   ├── Task: performance review
│   ├── Task: maintainability review
│   └── Task: architecture review
├── Phase 2: Discussion (interactive)
│   ├── Round 1: address disagreements
│   └── Round 2: refine positions
└── Phase 3: Final Assessment (aggregate)
    ├── Task: security verdict
    ├── Task: performance verdict
    ├── Task: maintainability verdict
    └── Task: architecture verdict
```

## Output

The final report includes:
- **Overall score** (average across all reviewers)
- **Confidence level** of each assessment
- **Key findings** aggregated from all perspectives
- **Convergence rate** indicating reviewer agreement
