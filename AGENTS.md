# AGENTS.md — Chalk

Deliberately lean. State each rule once. (GPT‑5.6 performs better with concise, non-repetitive guidance.)

## What Chalk is
A teacher tool for mixed-ability classrooms. Input: a photo of a student's handwritten work, or a concept. Output: a diagnosed, teacher-confirmed, self-verified differentiated intervention (Scaffolded / Core / Extension) with a fraction-bar manipulative and targeted practice. Pilot subject: middle-school fractions.

## Architecture (do not deviate)
1. **Diagnose** — GPT‑5.6 vision maps the work to the fixed misconception library → strict JSON.
2. **Teacher confirms** the hypothesis (human-in-the-loop) before any generation.
3. **Generate** — GPT‑5.6 multi-agent: parallel subagents produce explanations, a manipulative **spec** (declarative JSON), and practice + answer key.
4. **Verify** — Codex generates and runs a test suite against the spec, and repairs the spec on failure (max 3 cycles).
5. **Render** — a fixed, vetted `FractionBar` React component renders the verified spec.

**Never generate arbitrary HTML/JS at runtime.** GPT‑5.6 returns specs; the renderer is pre-built and tested. Codex generates specs, tests, practice logic, and repairs — not the renderer.

## Stack
Next.js + TypeScript + Tailwind. OpenAI Responses API. Codex SDK / non-interactive mode for runtime verification. State is in-memory/session only — no database, no accounts.

## Model routing
- Diagnosis & verification synthesis: `gpt-5.6-sol`, `reasoning.mode: "pro"`, `reasoning.effort: "high"`.
- Drafting subagents (explanations, practice): `gpt-5.6-terra` or `gpt-5.6-luna`.
- Vision: image `detail: "original"` (preserve handwriting).
- Carry diagnosis reasoning into generation with `reasoning.context: "all_turns"` + `previous_response_id`.
- Cache the fixed pedagogy system prompts (explicit prompt caching).

## Autonomy & approval policy
For requests to answer, explain, review, or plan: inspect and report; don't implement unless asked.
For requests to change, build, or fix: make in-scope local changes and run non-destructive validation (read files, edit in-scope code, run tests, run the local dev server) without asking first.
Require confirmation for external writes, destructive actions, adding dependencies with side effects, or expanding scope.

## Verification rules (the core of the product)
Codex must, for each lesson spec, generate and run: numerical assertions (the math is correct), schema validation, answer-key checks, state-transition checks (the manipulative behaves), and misconception-alignment (the lesson targets the confirmed misconception). On failure, repair the spec and re-run, max 3 cycles. Emit a verification result and a user-facing receipt. A lesson is never shown unverified.

## Privacy (non-negotiable)
Strip EXIF on upload. Blur likely name regions. No persistent storage. Demo data must be synthetic or consented. Show an accurate data-retention note in the UI. Chalk assists a teacher; it never autonomously grades or labels a child.

## Definition of done
Two to three golden fraction cases run end-to-end reliably. Diagnosis shows evidence + confidence + alternatives + teacher confirmation. The fraction-bar interactive is deterministic and print-friendly. The verification receipt is visible. README documents setup + exactly how Codex and GPT‑5.6 are used.

## Do not
Add accounts, databases, LMS integrations, extra subjects, or extra manipulative types for the hackathon build. Keep scope narrow and the golden path flawless.
