<p align="center">
  <a href="https://imbue.com/product/blueprint">
    <img src="https://github.com/imbue-ai/blueprint-vscode/raw/main/resources/readme-header.png" alt="Blueprint" />
  </a>
</p>

# Blueprint

Planning copilot for coding agents. Blueprint asks the right questions before you write code, then hands your agent a plan it can execute in one shot.

Install from the [VS Code marketplace](https://marketplace.visualstudio.com/items?itemName=Imbue.imbue-blueprint). For Cursor and Windsurf, download the [latest release](https://github.com/imbue-ai/blueprint-vscode/releases/latest/download/blueprint.vsix).

https://github.com/user-attachments/assets/77870e65-5c36-4bd0-bc4a-2d75ea7e7c7e

## Why Blueprint

Most coding agents rush to code or guess at the plan. Blueprint slows down just enough to ask the right questions. It reads your codebase and asks multiple-choice questions you can answer easily. The output is a markdown plan any coding agent can execute.

**You stay in control without doing the tedious work.** Blueprint splits planning between you and the agent. The initial idea comes from you. Enumerating all the considerations and choices comes from the agent. Decisions come from you. You skip the tedious parts of planning but stay in the driver's seat.

**Questions that make you think.** Blueprint asks questions that surface real design choices — the kind that engage you and make you think about what you actually want. It surfaces things you wouldn't have thought to ask about.

**Easy to answer.** Each round is a small chunk of work. Questions start broad and get more specific as the plan takes shape.

**Scales to however much planning you want.** You repeat this small loop until you decide to stop. If you don't want to plan much, you have a quick out — generate the plan after one round. If you want to plan extensively, the agent helps you keep exploring while keeping track of everything. This keeps you in control in two ways: you make the decisions, and you decide how much to plan.

> "Catches things that I didn't think to think about."
>
> "A way to get ideas out of your mind and into a spec."
>
> "I'm never going back to not using it again."

## Install

Install **[Blueprint](https://marketplace.visualstudio.com/items?itemName=Imbue.imbue-blueprint)** from the VS Code marketplace.

**Cursor and Windsurf:** Download the [latest release](https://github.com/imbue-ai/blueprint-vscode/releases/latest/download/blueprint.vsix), then install it with `Extensions: Install from VSIX...` from the command palette.

## Quickstart

1. Click the Blueprint icon in the activity bar to open the sidebar.
2. Describe your task.
3. Answer the questions Blueprint asks. Skip what you don't care about.
4. Generate the plan when you've covered enough ground.
5. Refine in chat, or hand the plan to your coding agent.

The plan is written to `blueprint/<slug>/plan.md`.

## Templates

Onboarding generates a starter "Default" template from the sections, writing style, and depth you pick. You can edit it, add more templates, or describe a custom one from **Settings**.

## When to use it

**Best fit.** Greenfield projects. Large new features on existing codebases. Incremental changes big enough to warrant a plan. Research experiments. New models, systems, or subsystems.

**Less ideal.** Frontends where most decisions are visual. Small refactors. Debug-polish work.

## Also available

Prefer the terminal? Blueprint also ships as agent-agnostic skills for Claude Code, Codex CLI, Gemini CLI, and other compatible harnesses. See [imbue-ai/blueprint](https://github.com/imbue-ai/blueprint).

## Community

- [@Imbue_AI on X](https://x.com/imbue_ai)
- [Subscribe to our newsletter](https://tryimbue.link/get-email-updates)
- [Read the blog](https://imbue.com/blog/blueprint)

## Related reading

- [Introducing Blueprint](https://imbue.com/product/blueprint/)