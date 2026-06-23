// EditSheet — pure presentational edit sheet: text inputs for editable fields + qa_status stepper.
// PURE: no service imports, no fetch. Data-in / events-out via onSubmit/onCancel only.
// Import EDITABLE_FIELDS_BY_TABLE + QA_ORDER from contentEdit (single source of truth).
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { Eyebrow, CardFooter } from './cardChrome';
import { CtaButton } from './CtaButton';
import { EDITABLE_FIELDS_BY_TABLE, QA_ORDER } from '../services/contentEdit';
import type { EditableTable, QaStatus } from '../services/index';

// Re-export QA_ORDER so callers can reference it without touching contentEdit directly.
export { QA_ORDER } from '../services/contentEdit';

export interface EditSheetProps {
  table: EditableTable;
  initial: {
    gloss_en?: string;
    target?: string;
    usage_note?: string;
    literal_gloss?: string;
    qa_status: QaStatus;
  };
  /** Called with only the changed fields + qa_status (if stepped). Parent maps to ContentEditRequest. */
  onSubmit: (patch: {
    fields?: Partial<Record<'gloss_en' | 'target' | 'usage_note' | 'literal_gloss', string>>;
    qa_status?: QaStatus;
  }) => void;
  onCancel: () => void;
  submitting?: boolean;
}

// Human-friendly labels for each field column.
const FIELD_LABELS: Record<string, string> = {
  gloss_en: 'English gloss',
  target: 'Target (Latvian)',
  usage_note: 'Usage note',
  literal_gloss: 'Literal gloss',
};

type EditableFieldKey = 'gloss_en' | 'target' | 'usage_note' | 'literal_gloss';

export function EditSheet({
  table,
  initial,
  onSubmit,
  onCancel,
  submitting = false,
}: EditSheetProps): React.JSX.Element {
  const T = useTheme();

  // Build per-field state from the editable fields for this table.
  const editableFields = EDITABLE_FIELDS_BY_TABLE[table] as readonly EditableFieldKey[];

  // Field values state (keyed by column name).
  const [fieldValues, setFieldValues] = useState<Record<EditableFieldKey, string>>(() => {
    const init: Record<string, string> = {};
    for (const col of editableFields) {
      init[col] = initial[col] ?? '';
    }
    return init as Record<EditableFieldKey, string>;
  });

  // qa_status state.
  const [qaStatus, setQaStatus] = useState<QaStatus>(initial.qa_status);

  // Stepper helpers.
  const qaIndex = QA_ORDER.indexOf(qaStatus);
  const canStepBack = qaIndex > 0;
  const canStepForward = qaIndex < QA_ORDER.length - 1;

  const stepBack = (): void => {
    if (canStepBack) setQaStatus(QA_ORDER[qaIndex - 1] as QaStatus);
  };
  const stepForward = (): void => {
    if (canStepForward) setQaStatus(QA_ORDER[qaIndex + 1] as QaStatus);
  };

  // Submit: emit only changed fields + qa_status if it changed.
  const handleSubmit = (): void => {
    const changedFields: Partial<Record<EditableFieldKey, string>> = {};
    for (const col of editableFields) {
      const original = initial[col] ?? '';
      const current = fieldValues[col];
      if (current !== original) {
        changedFields[col] = current;
      }
    }

    const patch: Parameters<EditSheetProps['onSubmit']>[0] = {};

    if (Object.keys(changedFields).length > 0) {
      patch.fields = changedFields;
    }

    if (qaStatus !== initial.qa_status) {
      patch.qa_status = qaStatus;
    }

    onSubmit(patch);
  };

  return (
    <View style={[styles.sheet, { backgroundColor: T.surface, borderColor: T.hair }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Eyebrow>{`Edit ${table}`}</Eyebrow>

        {/* Per-field text inputs — only for tables that have editable fields */}
        {editableFields.map((col) => (
          <View key={col} style={styles.fieldRow}>
            <Text style={[styles.label, { color: T.faint }]}>
              {FIELD_LABELS[col] ?? col}
            </Text>
            <TextInput
              testID={`input-${col}`}
              style={[
                styles.input,
                {
                  color: T.ink,
                  backgroundColor: T.bg,
                  borderColor: T.hair,
                },
              ]}
              value={fieldValues[col]}
              onChangeText={(text) =>
                setFieldValues((prev) => ({ ...prev, [col]: text }))
              }
              multiline={col === 'usage_note' || col === 'literal_gloss'}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!submitting}
              placeholderTextColor={T.faint}
              placeholder={FIELD_LABELS[col] ?? col}
            />
          </View>
        ))}

        {/* qa_status stepper — always present */}
        <View testID="qa-stepper" style={styles.stepperRow}>
          <Text style={[styles.label, { color: T.faint }]}>QA Status</Text>
          <View style={styles.stepperControls}>
            <Pressable
              testID="qa-step-back"
              accessibilityRole="button"
              accessibilityLabel="Step qa_status back"
              onPress={stepBack}
              disabled={!canStepBack}
              style={[
                styles.stepBtn,
                {
                  borderColor: T.hair,
                  backgroundColor: T.surface,
                  opacity: canStepBack ? 1 : 0.35,
                },
              ]}
            >
              <Text style={[styles.stepBtnText, { color: T.sub }]}>{'◀'}</Text>
            </Pressable>

            <Text style={[styles.qaValue, { color: T.ink }]}>{qaStatus}</Text>

            <Pressable
              testID="qa-step-forward"
              accessibilityRole="button"
              accessibilityLabel="Step qa_status forward"
              onPress={stepForward}
              disabled={!canStepForward}
              style={[
                styles.stepBtn,
                {
                  borderColor: T.hair,
                  backgroundColor: T.surface,
                  opacity: canStepForward ? 1 : 0.35,
                },
              ]}
            >
              <Text style={[styles.stepBtnText, { color: T.sub }]}>{'▶'}</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>

      <CardFooter>
        <CtaButton
          testID="submit-button"
          title={submitting ? 'Saving…' : 'Save'}
          onPress={handleSubmit}
          disabled={submitting}
        />
        <CtaButton
          title="Cancel"
          onPress={onCancel}
          variant="outline"
          disabled={submitting}
        />
      </CardFooter>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    overflow: 'hidden',
  },
  scrollContent: {
    padding: 20,
    rowGap: 16,
  },
  fieldRow: {
    rowGap: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    minHeight: 42,
  },
  stepperRow: {
    rowGap: 8,
  },
  stepperControls: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 16,
  },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  qaValue: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
  },
});
