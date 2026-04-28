
**IMPORTANT WORKFLOW INSTRUCTIONS:**
- Never commit code unless specifically requested to.
- KEEP FILES SHORT, around ~200 lines maximum. Pull out code to submodules if necessary
	- When you're done adding code to a file, check to make sure it's not too long
	- If it is, split it
	- If you're writing a test file, it's okay to make it as long as you need.
- ALWAYS split tests into a separate file - never combine with actual source code.
- When you add a new system or feature, make sure to add/update documentation in docs/
	- Only update relevant files
	- Keep doc files concise. Stick mostly to external APIs and important notes about algorithms used, how the system works and ESPECIALLY any gotchas that could cause bugs
	- Don't talk too much about implementation details/future work unless instructed otherwise
	- Do not talk about the benefits/drawbacks of the current system, only talk about the system itself
	- DO NOT ADD CODE SNIPPETS FROM THE ACTUAL SOURCE CODE
		- Use code snippets to show example API usage where relevant
	- Feel free to create new doc files when you introduce a new system/feature
- Read relevant documentation in the docs/ folder
- Read the docs/README.md file for context on the project before writing any code
- Use sentence case for UI copy (buttons, labels, headers, menu items, command titles, etc.) wherever it makes sense. Exceptions: proper nouns and product names (e.g. "Blueprint", "Claude Code", "VS Code").
