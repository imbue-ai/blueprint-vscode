import { VscodeCheckbox, VscodeRadio, VscodeRadioGroup } from '@vscode-elements/react-elements';
import { useId, useRef, useState } from 'react';

import type { QuestionBase } from '../../types/question';
import { formatAnswer } from '../../utils/questionUtils';
import { Textarea, Textfield } from './InputComponents';

interface Props {
  question: QuestionBase;
  frozen?: boolean;
  showBorder?: boolean;
  lineLabel?: string | null;
  onAnswerChange: (textAnswer: string, chosenIndices: number[]) => void;
  onJumpToLine?: () => void;
}

export function QuestionItem({ question, frozen, showBorder = true, lineLabel, onAnswerChange, onJumpToLine }: Props) {
  if (frozen) {
    return <FrozenDisplay question={question} showBorder={showBorder} />;
  }

  return (
    <InteractiveDisplay
      question={question}
      showBorder={showBorder}
      lineLabel={lineLabel}
      onAnswerChange={onAnswerChange}
      onJumpToLine={onJumpToLine}
    />
  );
}

function FrozenDisplay({ question, showBorder }: { question: QuestionBase; showBorder: boolean }) {
  const answer = formatAnswer(question);

  return (
    <div
      style={{
        padding: '8px 10px',
        marginBottom: 8,
        borderRadius: 4,
        background: 'var(--vscode-textBlockQuote-background)',
        opacity: 0.8,
        fontSize: 12,
        borderBottom: showBorder ? '1px solid var(--vscode-input-border)' : undefined,
      }}
    >
      <div style={{ fontWeight: 500, marginBottom: 4 }}>{question.text}</div>
      {answer ? (
        <div style={{ fontSize: 12, opacity: 0.8 }}>{answer}</div>
      ) : (
        <div style={{ fontSize: 12, fontStyle: 'italic', opacity: 0.5 }}>No answer provided</div>
      )}
    </div>
  );
}

function InteractiveDisplay({ question, showBorder, lineLabel, onAnswerChange, onJumpToLine }: Omit<Props, 'frozen'>) {
  const radioGroupName = useId();
  const [textAnswer, setTextAnswer] = useState(question.textAnswer);
  const chosenRef = useRef(question.chosenIndices);
  chosenRef.current = question.chosenIndices;

  const choices = question.choices ?? [];
  const isMcq = choices.length > 0 && !question.multiSelect;
  const isMultiSelect = choices.length > 0 && !!question.multiSelect;

  const handleTextChange = (text: string) => {
    setTextAnswer(text);
    onAnswerChange(text, chosenRef.current);
  };

  const handleSingleSelect = (index: number) => {
    const newChosen = question.chosenIndices[0] === index ? [] : [index];
    onAnswerChange(textAnswer, newChosen);
  };

  const handleMultiSelect = (index: number) => {
    const current = new Set(question.chosenIndices);
    if (current.has(index)) current.delete(index);
    else current.add(index);
    onAnswerChange(textAnswer, Array.from(current));
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        paddingBottom: 16,
        marginBottom: 16,
        borderBottom: showBorder ? '1px solid var(--vscode-input-border)' : '1px solid var(--vscode-widget-border)',
      }}
    >
      <div style={{ fontWeight: 500 }}>{question.text}</div>
      {question.context && <div style={{ fontSize: 11, opacity: 0.7 }}>{question.context}</div>}
      {lineLabel && onJumpToLine && (
        <button
          onClick={onJumpToLine}
          title="Jump to this line in the plan"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--vscode-textLink-foreground)',
            padding: 0,
            fontSize: 12,
            textAlign: 'left',
          }}
        >
          {lineLabel}
        </button>
      )}

      {isMcq && (
        <div>
          <VscodeRadioGroup variant="vertical">
            {choices.map((opt, i) => (
              <div key={i}>
                <VscodeRadio
                  name={radioGroupName}
                  checked={question.chosenIndices[0] === i}
                  onChange={() => handleSingleSelect(i)}
                >
                  {opt}
                </VscodeRadio>
              </div>
            ))}
          </VscodeRadioGroup>
          <button
            onClick={() => onAnswerChange(textAnswer, [])}
            disabled={question.chosenIndices.length === 0}
            aria-hidden={question.chosenIndices.length === 0}
            tabIndex={question.chosenIndices.length === 0 ? -1 : 0}
            style={{
              fontSize: 11,
              background: 'none',
              border: 'none',
              color: 'var(--vscode-textLink-foreground)',
              cursor: 'pointer',
              marginTop: 4,
              padding: 0,
              visibility: question.chosenIndices.length > 0 ? 'visible' : 'hidden',
            }}
          >
            Reset
          </button>
        </div>
      )}

      {isMultiSelect && (
        <div>
          <div style={{ fontSize: 11, opacity: 0.6, fontStyle: 'italic', marginBottom: 4 }}>Select all that apply</div>
          {choices.map((opt, i) => (
            <div key={i}>
              <VscodeCheckbox checked={question.chosenIndices.includes(i)} onChange={() => handleMultiSelect(i)}>
                {opt}
              </VscodeCheckbox>
            </div>
          ))}
        </div>
      )}

      {choices.length > 0 ? (
        <Textfield
          value={textAnswer}
          onInput={(e) => handleTextChange((e.target as HTMLInputElement).value)}
          placeholder="Other answer or additional context"
          style={{ width: '100%' }}
        />
      ) : (
        <Textarea
          value={textAnswer}
          onInput={(e) => handleTextChange((e.target as HTMLTextAreaElement).value)}
          placeholder="Enter your answer"
          rows={3}
          style={{ width: '100%' }}
        />
      )}
    </div>
  );
}
