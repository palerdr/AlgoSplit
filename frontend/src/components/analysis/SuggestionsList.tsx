import { useState } from 'react';
import { AlertTriangle, AlertCircle, Info, ChevronDown, ChevronUp } from 'lucide-react';
import type { OptimizationSuggestion } from '@/types/api.types';
import { cn } from '@/lib/utils';

interface SuggestionsListProps {
  suggestions: OptimizationSuggestion[];
  maxItems?: number;
}

const priorityConfig = {
  HIGH: {
    icon: AlertTriangle,
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/30',
    iconColor: 'text-red-400',
    label: 'High Priority',
  },
  MEDIUM: {
    icon: AlertCircle,
    bgColor: 'bg-yellow-500/10',
    borderColor: 'border-yellow-500/30',
    iconColor: 'text-yellow-400',
    label: 'Medium Priority',
  },
  LOW: {
    icon: Info,
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
    iconColor: 'text-blue-400',
    label: 'Low Priority',
  },
};

export function SuggestionsList({ suggestions, maxItems }: SuggestionsListProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (suggestions.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-500/10 mb-3">
          <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-foreground font-medium">Looking good!</p>
        <p className="text-sm text-muted mt-1">No major optimization suggestions at this time.</p>
      </div>
    );
  }

  // Sort by priority: HIGH > MEDIUM > LOW
  const priorityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  const sortedSuggestions = [...suggestions].sort(
    (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]
  );

  // Show all if expanded, otherwise respect maxItems
  const displaySuggestions = (maxItems && !isExpanded)
    ? sortedSuggestions.slice(0, maxItems)
    : sortedSuggestions;

  const remaining = sortedSuggestions.length - (maxItems || sortedSuggestions.length);
  const canExpand = maxItems && remaining > 0;

  return (
    <div className="space-y-3">
      {displaySuggestions.map((suggestion, index) => {
        const config = priorityConfig[suggestion.priority];
        const Icon = config.icon;

        return (
          <div
            key={index}
            className={cn(
              'p-4 rounded-lg border',
              config.bgColor,
              config.borderColor
            )}
          >
            <div className="flex items-start gap-3">
              <Icon className={cn('w-5 h-5 mt-0.5 flex-shrink-0', config.iconColor)} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-foreground">
                    {suggestion.muscle}
                  </span>
                  <span className={cn('text-xs px-1.5 py-0.5 rounded', config.bgColor, config.iconColor)}>
                    {config.label}
                  </span>
                </div>
                <p className="text-sm text-secondary mt-1">{suggestion.issue}</p>
                <p className="text-sm text-foreground mt-2">{suggestion.suggestion}</p>
              </div>
            </div>
          </div>
        );
      })}

      {canExpand && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-center gap-1 text-sm text-crimson hover:text-crimson-hover py-2 transition-colors"
        >
          {isExpanded ? (
            <>
              <ChevronUp className="w-4 h-4" />
              Show less
            </>
          ) : (
            <>
              <ChevronDown className="w-4 h-4" />
              +{remaining} more suggestion{remaining > 1 ? 's' : ''}
            </>
          )}
        </button>
      )}
    </div>
  );
}

// Compact version showing just counts by priority
export function SuggestionsSummary({ suggestions }: { suggestions: OptimizationSuggestion[] }) {
  const counts = {
    HIGH: suggestions.filter(s => s.priority === 'HIGH').length,
    MEDIUM: suggestions.filter(s => s.priority === 'MEDIUM').length,
    LOW: suggestions.filter(s => s.priority === 'LOW').length,
  };

  if (suggestions.length === 0) {
    return (
      <span className="text-green-400 text-sm">No issues found</span>
    );
  }

  return (
    <div className="flex items-center gap-3">
      {counts.HIGH > 0 && (
        <span className="flex items-center gap-1 text-red-400 text-sm">
          <AlertTriangle className="w-4 h-4" />
          {counts.HIGH}
        </span>
      )}
      {counts.MEDIUM > 0 && (
        <span className="flex items-center gap-1 text-yellow-400 text-sm">
          <AlertCircle className="w-4 h-4" />
          {counts.MEDIUM}
        </span>
      )}
      {counts.LOW > 0 && (
        <span className="flex items-center gap-1 text-blue-400 text-sm">
          <Info className="w-4 h-4" />
          {counts.LOW}
        </span>
      )}
    </div>
  );
}
