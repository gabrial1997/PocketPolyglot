// EditSheet.test.tsx — TDD tests for the pure EditSheet component (Task F3)
// Tests: (a) lemmas 4 inputs; (b) minimal_pairs 0 text inputs; (c) edit gloss_en + submit;
//        (d) step qa_status + submit; (e) stepper clamps; (f) snapshot.
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ThemeProvider } from '../theme/ThemeProvider';
import { EditSheet } from './EditSheet';
import type { EditSheetProps } from './EditSheet';

// Render helper wraps in ThemeProvider (required by useTheme inside EditSheet).
function renderSheet(props: EditSheetProps) {
  return render(
    <ThemeProvider>
      <EditSheet {...props} />
    </ThemeProvider>,
  );
}

const lemmaInitial: EditSheetProps['initial'] = {
  gloss_en: 'hello',
  target: 'sveiki',
  usage_note: 'informal greeting',
  literal_gloss: undefined,
  qa_status: 'draft',
};

const minimalPairInitial: EditSheetProps['initial'] = {
  qa_status: 'draft',
};

describe('EditSheet', () => {
  // (a) table='lemmas' → all 4 text inputs render
  it('(a) table=lemmas → all 4 TextInputs render', () => {
    const onSubmit = jest.fn();
    const onCancel = jest.fn();
    const u = renderSheet({
      table: 'lemmas',
      initial: lemmaInitial,
      onSubmit,
      onCancel,
    });
    // All 4 editable fields should have an input
    expect(u.getByDisplayValue('hello')).toBeTruthy();       // gloss_en
    expect(u.getByDisplayValue('sveiki')).toBeTruthy();      // target
    expect(u.getByDisplayValue('informal greeting')).toBeTruthy(); // usage_note
    // literal_gloss is undefined → renders empty string in input
    // Verify all 4 inputs by testID
    expect(u.getByTestId('input-gloss_en')).toBeTruthy();
    expect(u.getByTestId('input-target')).toBeTruthy();
    expect(u.getByTestId('input-usage_note')).toBeTruthy();
    expect(u.getByTestId('input-literal_gloss')).toBeTruthy();
  });

  // (b) table='minimal_pairs' → ZERO text inputs, only stepper renders
  it('(b) table=minimal_pairs → zero TextInputs, only stepper visible', () => {
    const u = renderSheet({
      table: 'minimal_pairs',
      initial: minimalPairInitial,
      onSubmit: jest.fn(),
      onCancel: jest.fn(),
    });
    // No text input test IDs present for field columns
    expect(u.queryByTestId('input-gloss_en')).toBeNull();
    expect(u.queryByTestId('input-target')).toBeNull();
    expect(u.queryByTestId('input-usage_note')).toBeNull();
    expect(u.queryByTestId('input-literal_gloss')).toBeNull();
    // Stepper is present
    expect(u.getByTestId('qa-stepper')).toBeTruthy();
  });

  // (c) edit gloss_en then submit → onSubmit called with { fields: { gloss_en: 'new' } }, qa_status OMITTED
  it('(c) edit gloss_en then submit → onSubmit receives changed field; qa_status omitted (unchanged)', () => {
    const onSubmit = jest.fn();
    const u = renderSheet({
      table: 'lemmas',
      initial: lemmaInitial,
      onSubmit,
      onCancel: jest.fn(),
    });
    // Change gloss_en
    fireEvent.changeText(u.getByTestId('input-gloss_en'), 'new');
    // Press submit
    fireEvent.press(u.getByTestId('submit-button'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const call = onSubmit.mock.calls[0][0];
    // Only changed field
    expect(call.fields).toEqual({ gloss_en: 'new' });
    // qa_status unchanged → must be OMITTED from patch (not just undefined-valued; key absent)
    expect(call.qa_status).toBeUndefined();
    expect('qa_status' in call).toBe(false);
  });

  // (d) step draft→native_ok then submit → payload has qa_status: 'native_ok'
  it('(d) step qa_status forward then submit → payload has new qa_status', () => {
    const onSubmit = jest.fn();
    const u = renderSheet({
      table: 'lemmas',
      initial: { ...lemmaInitial, qa_status: 'draft' },
      onSubmit,
      onCancel: jest.fn(),
    });
    // Press forward stepper (▶)
    fireEvent.press(u.getByTestId('qa-step-forward'));
    // Press submit
    fireEvent.press(u.getByTestId('submit-button'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const call = onSubmit.mock.calls[0][0];
    expect(call.qa_status).toBe('native_ok');
  });

  // (e) stepper clamps at 'locked' (▶ no-op) and at 'draft' (◀ no-op)
  //     qa_status must be OMITTED from patch when clamp holds (no change occurred)
  it('(e) stepper clamps — ▶ at locked is no-op, ◀ at draft is no-op; qa_status omitted', () => {
    const onSubmit = jest.fn();
    // Start at 'locked' — ▶ should not advance; qa_status stays 'locked' (= initial) → OMITTED
    const u1 = renderSheet({
      table: 'lemmas',
      initial: { ...lemmaInitial, qa_status: 'locked' },
      onSubmit,
      onCancel: jest.fn(),
    });
    fireEvent.press(u1.getByTestId('qa-step-forward'));
    fireEvent.press(u1.getByTestId('submit-button'));
    const call1 = onSubmit.mock.calls[0][0];
    // Clamp held: no change → qa_status must be absent from patch
    expect(call1.qa_status).toBeUndefined();
    expect('qa_status' in call1).toBe(false);

    onSubmit.mockClear();

    // Start at 'draft' — ◀ should not go below; qa_status stays 'draft' (= initial) → OMITTED
    const u2 = renderSheet({
      table: 'lemmas',
      initial: { ...lemmaInitial, qa_status: 'draft' },
      onSubmit,
      onCancel: jest.fn(),
    });
    fireEvent.press(u2.getByTestId('qa-step-back'));
    fireEvent.press(u2.getByTestId('submit-button'));
    const call2 = onSubmit.mock.calls[0][0];
    // Clamp held: no change → qa_status must be absent from patch
    expect(call2.qa_status).toBeUndefined();
    expect('qa_status' in call2).toBe(false);
  });

  // (f) snapshot of the lemmas sheet
  it('(f) snapshot — lemmas sheet', () => {
    const u = renderSheet({
      table: 'lemmas',
      initial: lemmaInitial,
      onSubmit: jest.fn(),
      onCancel: jest.fn(),
    });
    expect(u.toJSON()).toMatchSnapshot();
  });
});
