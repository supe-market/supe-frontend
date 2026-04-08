import { ArrowUpOutlined, SearchOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import { QUICK_ASK_QUESTIONS } from '../questionSuggestions';
import styles from '../SupeLayout.module.css';

export const LEADERSHIP_PROMPT_SUGGESTIONS = QUICK_ASK_QUESTIONS;

function rankSuggestions(query: string, suggestions: string[]) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return suggestions;
  }

  return suggestions
    .map((suggestion) => {
      const normalizedSuggestion = suggestion.toLowerCase();
      const startsWith = normalizedSuggestion.startsWith(normalizedQuery);
      const includes = normalizedSuggestion.includes(normalizedQuery);
      return {
        suggestion,
        score: startsWith ? 3 : includes ? 2 : 0
      };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.suggestion.localeCompare(right.suggestion))
    .map((item) => item.suggestion);
}

export function PromptCommandBar({
  onSubmit,
  onQuickPick,
  disabled = false,
  submitLabel = 'Ask',
  compact = false,
  suggestions = LEADERSHIP_PROMPT_SUGGESTIONS
}: {
  onSubmit: (value: string) => void;
  onQuickPick?: (value: string) => void;
  disabled?: boolean;
  submitLabel?: string;
  compact?: boolean;
  suggestions?: string[];
}) {
  const [value, setValue] = useState('');
  const [typedPlaceholder, setTypedPlaceholder] = useState('');
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const filteredSuggestions = useMemo(() => rankSuggestions(value, suggestions).slice(0, 6), [value, suggestions]);

  const autoCompleteTail = useMemo(() => {
    if (!value.trim()) {
      return '';
    }
    const firstSuggestion = filteredSuggestions[0];
    if (!firstSuggestion) {
      return '';
    }
    const normalizedValue = value.toLowerCase();
    const normalizedSuggestion = firstSuggestion.toLowerCase();
    if (!normalizedSuggestion.startsWith(normalizedValue)) {
      return '';
    }
    return firstSuggestion.slice(value.length);
  }, [filteredSuggestions, value]);

  useEffect(() => {
    if (value) {
      return undefined;
    }

    const source = suggestions[placeholderIndex % suggestions.length] || '';
    let frame = 0;
    let deleting = false;
    let timeoutId: number | undefined;

    const tick = () => {
      if (!source) {
        return;
      }

      if (!deleting) {
        frame += 1;
        setTypedPlaceholder(source.slice(0, frame));
        if (frame >= source.length) {
          deleting = true;
          timeoutId = window.setTimeout(tick, 1200);
          return;
        }
      } else {
        frame -= 1;
        setTypedPlaceholder(source.slice(0, Math.max(frame, 0)));
        if (frame <= 0) {
          setPlaceholderIndex((current) => (current + 1) % suggestions.length);
          return;
        }
      }

      timeoutId = window.setTimeout(tick, deleting ? 20 : 42);
    };

    timeoutId = window.setTimeout(tick, 200);
    return () => {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [placeholderIndex, suggestions, value]);

  const handleSubmit = () => {
    const nextValue = value.trim();
    if (!nextValue || disabled) {
      return;
    }
    onSubmit(nextValue);
    setValue('');
    setShowSuggestions(false);
  };

  const handleQuickPick = (question: string) => {
    if (onQuickPick) {
      onQuickPick(question);
    } else {
      onSubmit(question);
    }
    setValue('');
    setShowSuggestions(false);
  };

  return (
    <div className={`${styles.promptComposer} ${compact ? styles.promptComposerCompact : ''}`}>
      <div className={styles.promptComposerFrame}>
        <div className={styles.promptComposerField}>
          <SearchOutlined className={styles.promptComposerIcon} />
          <div className={styles.promptComposerInputWrap}>
            <input
              ref={inputRef}
              value={value}
              disabled={disabled}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => window.setTimeout(() => setShowSuggestions(false), 120)}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Tab' && autoCompleteTail) {
                  event.preventDefault();
                  setValue((current) => current + autoCompleteTail);
                  return;
                }
                if (event.key === 'Enter') {
                  event.preventDefault();
                  handleSubmit();
                }
              }}
              className={styles.promptComposerInput}
              placeholder={typedPlaceholder || 'Ask a question about your business...'}
              aria-label="Ask a question"
            />
            {!value && typedPlaceholder ? <span className={styles.promptComposerGhost}>{typedPlaceholder}</span> : null}
            {value && autoCompleteTail ? (
              <span className={styles.promptComposerGhost} onMouseDown={(event) => event.preventDefault()} onClick={() => setValue((current) => current + autoCompleteTail)}>
                {value}
                <span className={styles.promptComposerGhostTail}>{autoCompleteTail}</span>
              </span>
            ) : null}
          </div>
          <Button
            type="primary"
            shape="round"
            icon={<ArrowUpOutlined />}
            className={styles.promptComposerSubmit}
            onClick={handleSubmit}
            disabled={disabled || !value.trim()}
          >
            {submitLabel}
          </Button>
        </div>

        {!compact ? (
          <div className={styles.promptComposerQuickRow}>
            {suggestions.slice(0, 4).map((question) => (
              <button key={question} type="button" className={styles.promptComposerChip} onClick={() => handleQuickPick(question)}>
                {question}
              </button>
            ))}
          </div>
        ) : null}

        {showSuggestions && filteredSuggestions.length ? (
          <div className={styles.promptComposerDropdown}>
            {filteredSuggestions.map((suggestion) => (
              <button key={suggestion} type="button" className={styles.promptComposerOption} onMouseDown={(event) => event.preventDefault()} onClick={() => handleQuickPick(suggestion)}>
                {suggestion}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
