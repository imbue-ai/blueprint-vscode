// --- Prompt questioning phase ---

export const QUESTION_PROMPT = `The user wants to make the following change to this codebase:
{{userPrompt}}

Later, this change will be documented in a spec. Read the spec template at {{specTemplatePath}} to understand the structure and level of detail expected.

Your task is to help the user think through everything they'd need to answer in order to write that spec well.

First, use the available tools (Read, Glob, Grep, WebSearch, WebFetch) to understand the user's request in the context of this codebase. Read the actual source files that are relevant — understand how the system currently works and what would need to change. Use web search to look up external documentation, APIs, or tools when relevant.

Then ask 3-5 questions. Use what you learned from the codebase to inform your questions, at the level of abstraction the spec template calls for.

Your questions must match the level and perspective of the spec template — if the template asks about external behavior, ask about external behavior. If it asks about implementation details, ask about implementation details. The template defines what kind of thinking is needed.

IMPORTANT: Output each question using XML tags with JSON inside:

<question>
{
  "text": "The question text",
  "context": "Optional, one sentence on why this matters",
  "choices": ["Option 1", "Option 2", "Option 3"],
  "multiSelect": false
}
</question>

Guidelines:
- For questions with clear enumerable options, include a "choices" array
- For open-ended questions, omit "choices"
- For questions where the user should select multiple options, set "multiSelect": true
- Keep text between questions brief — a sentence or two of context at most, not a full analysis
- Ground your questions in what you found in the codebase — do NOT ask questions whose answers are already obvious from the code
- Use your tools to gather facts before asking — if something can be determined by reading code, searching docs, or looking up external references, find the answer yourself. Do not make subjective decisions on behalf of the user
- Users generally expect to continue existing patterns and expand their system — only question existing patterns when the user's change clearly conflicts with them. Focus on what's new or ambiguous
- Do NOT ask questions about the spec template itself — ask questions that help define what to build
- Do NOT ask about implementation details unless the spec template explicitly calls for them`;

export const QUESTION_CONTINUE_PROMPT = `The user has answered your previous questions:

{{qaPairs}}

Continue helping the user think through everything they'd need to answer in order to write that spec well. Use the available tools to explore the codebase further if needed.

Ask 3-5 more questions. These may be follow-ups to their answers or additional topics that still need to be discussed. Use what you learned from the codebase to inform your questions. Use the same <question> XML format.

Refer back to the spec template at {{specTemplatePath}} — your questions should match its level and perspective.

Reminders:
- Include a "choices" array for questions with enumerable options; omit for open-ended questions
- Set "multiSelect": true when multiple selections apply
- Be brief between questions — a sentence or two, not a full analysis
- Stay grounded in what you know about the codebase — avoid asking what's already obvious from the code
- Assume existing patterns continue unless the change clearly conflicts with them
- Ask about what to build, not about the template itself
- Match the template's level — avoid implementation details unless the template calls for them`;

export const REFINEMENT_PROMPT = `You are helping refine a user's prompt by incorporating answers to clarifying questions.

Your task is to ADD new information to the original prompt based on the user's answers. Do NOT rephrase or modify any existing text.

Guidelines:
- NEVER change the wording of the original prompt - keep it exactly as written
- ONLY add new bullet points (using markdown * syntax) to incorporate the clarifications
- Insert new bullet points in logical locations near related content
- Each new bullet point should synthesize the question and all of its answers into a single concise statement
- Add exactly one bullet point per question
- Do not add explanations or commentary, just output the refined prompt
- Output ONLY the refined prompt, nothing else

---

Original prompt:
{{originalPrompt}}

---

Clarifications:
{{qaPairs}}

---

Refined prompt:`;

// --- Spec generation phase ---

export const SPEC_PROMPT = `The spec should contain EXACTLY the following in the specified order:
- Overview: an overview of the system/feature and the UX of using it
- Summary: a summary of how the system will work and the key data flows
- Implementation: the full list of files, classes, methods, functions, data types, etc you plan to create and what they will do. Also, include any existing things you want to modify
- Implementation phases: break the implementation into ordered phases, where each phase builds on the previous and results in a working (but potentially incomplete) system
- Open questions: list any unresolved design decisions, trade-offs, or ambiguities that need further discussion before implementation`;

// --- Spec editing phase ---

export const EDITING_PROMPT =
  'Your job is to help me refine a spec. Read the spec file at {{specFilePath}} and understand it. Then use your tools to explore the relevant parts of the codebase related to the spec contents — read the key files, modules, and patterns referenced in the spec so you have the context needed to make accurate edits. When refining the spec, MAKE SURE TO SAVE IT BACK TO {{specFilePath}}. DO NOT CREATE OR MODIFY ANY OTHER FILES.';

export const FEEDBACK_PROMPT = `I have feedback on the following sections of the spec:

{{feedbackText}}

Please update the spec to address this feedback.`;

export const AGENTIC_SPEC_QUESTION_PROMPT = `Read the spec file at {{specFilePath}} and use the available tools (Read, Glob, Grep) to understand the codebase and current patterns relevant to this spec.

Then list any open questions that would help refine the spec. Focus on high-level design decisions that don't have a clear answer, not inane questions with an obvious best answer.

CRITICAL: if the spec lists several options for something, MAKE SURE TO INCLUDE THAT AS A QUESTION.

For questions with clear enumerable options, provide a "choices" array. For open-ended questions, omit "choices". An "Other/Custom" option is automatically added to all MCQs.

IMPORTANT: For each question, include an "anchor" field containing a short, unique text snippet (5-20 words) copied exactly from the spec that the question relates to.

Output your questions as a JSON array with this exact format:
[
  {
    "text": "The question text",
    "context": "Optional explanation of why this matters",
    "choices": ["Option 1", "Option 2", "Option 3"],
    "anchor": "exact phrase from the spec"
  }
]

If a question is better answered with free text, omit the "choices" field.
Output ONLY the JSON array, no other text.`;

export const AGENTIC_SPEC_QUESTION_CONTINUE_PROMPT = `The user has answered your questions:

{{qaPairs}}

The spec at {{specFilePath}} may have been updated based on these answers. Re-read it and ask 3-5 follow-up questions about remaining design decisions.

Use the available tools to explore the codebase further if needed. Do NOT repeat questions that have already been answered.

Use the same JSON array format as before. Output ONLY the JSON array, no other text.`;

export const SPEC_REFINE_PROMPT = `Please update the spec based on my answers to the clarifying questions:

{{qaPairs}}`;
