# Product Evaluation — Multi-Dimensional Assessment Space

A comprehensive SwarmFlow example demonstrating a full product evaluation space where specialized agents assess a product from multiple dimensions, discuss trade-offs, and produce a unified evaluation report.

## What This Example Does

1. **Independent Assessment** (Parallel Phase) — Each evaluator independently scores the product from their dimension
2. **Cross-Dimension Discussion** (Interactive Phase) — Evaluators discuss trade-offs and conflicting priorities
3. **Unified Report** (Aggregate Phase) — Each evaluator provides their final weighted assessment

## Agents

| Role | Dimension | Capabilities |
|------|----------|-------------|
| **UX Evaluator** | User experience, usability, accessibility | ux, evaluation |
| **Technical Evaluator** | Architecture, performance, reliability | technical, evaluation |
| **Business Evaluator** | Market fit, pricing, ROI, competitive position | business, evaluation |
| **Compliance Evaluator** | Data privacy, regulatory compliance, security standards | compliance, evaluation |
| **Innovation Evaluator** | Novelty, differentiation, future potential | innovation, evaluation |

## Running

```bash
# From the repository root
npx tsx examples/product-evaluation/index.ts
```

## Key Concepts Demonstrated

- **5-agent evaluation** with distinct assessment dimensions
- **Structured scoring** with dimension-specific criteria
- **`fixedRounds` convergence** — exactly 2 discussion rounds for thorough cross-pollination
- **Weighted aggregation** via AggregationDigest
- **Rich context passing** — product details, evaluation criteria, scoring rubric

## Architecture

```
Mission: Evaluate "CloudSync Pro" SaaS Product
├── Phase 1: Independent Assessment (parallel)
│   ├── Task: UX evaluation
│   ├── Task: Technical evaluation
│   ├── Task: Business evaluation
│   ├── Task: Compliance evaluation
│   └── Task: Innovation evaluation
├── Phase 2: Cross-Dimension Discussion (interactive, 2 fixed rounds)
│   ├── Round 1: share findings, identify conflicts
│   └── Round 2: resolve trade-offs, align priorities
└── Phase 3: Unified Report (aggregate)
    ├── Task: UX final score
    ├── Task: Technical final score
    ├── Task: Business final score
    ├── Task: Compliance final score
    └── Task: Innovation final score
```

## Output

The final report includes:
- **Dimension scores** (1-10) from each evaluator
- **Overall weighted score** combining all dimensions
- **Key strengths and weaknesses** aggregated across dimensions
- **Go/No-Go recommendation** based on threshold scoring
- **Confidence levels** for each assessment
