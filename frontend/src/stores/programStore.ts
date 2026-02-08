import { create } from 'zustand';

interface ProgramState {
  // Active program
  activeProgramId: string | null;

  // Calendar
  calendarView: 'month' | 'week';
  calendarDate: string; // ISO date string for current view center

  // Multi-select
  selectedDates: string[];

  // Drag state
  draggingTemplateId: string | null;

  // Diagnostics panel
  diagnosticsOpen: boolean;
  diagnosticsLevel: 'session' | 'micro' | 'meso' | 'macro';
  diagnosticsTargetId: string | null;

  // Periodization
  activeTab: 'calendar' | 'periodization';
  selectedMacroId: string | null;
  selectedMesoId: string | null;
  selectedMicroId: string | null;

  // Actions
  setActiveProgramId: (id: string | null) => void;
  setCalendarView: (view: 'month' | 'week') => void;
  setCalendarDate: (date: string) => void;
  toggleSelectedDate: (date: string) => void;
  clearSelectedDates: () => void;
  setDraggingTemplateId: (id: string | null) => void;
  openDiagnostics: (level: 'session' | 'micro' | 'meso' | 'macro', targetId: string) => void;
  closeDiagnostics: () => void;
  setActiveTab: (tab: 'calendar' | 'periodization') => void;
  setSelectedMacroId: (id: string | null) => void;
  setSelectedMesoId: (id: string | null) => void;
  setSelectedMicroId: (id: string | null) => void;
}

export const useProgramStore = create<ProgramState>()((set) => ({
  activeProgramId: null,
  calendarView: 'month',
  calendarDate: new Date().toISOString().split('T')[0],
  selectedDates: [],
  draggingTemplateId: null,
  diagnosticsOpen: false,
  diagnosticsLevel: 'session',
  diagnosticsTargetId: null,
  activeTab: 'calendar',
  selectedMacroId: null,
  selectedMesoId: null,
  selectedMicroId: null,

  setActiveProgramId: (id) => set({ activeProgramId: id }),
  setCalendarView: (view) => set({ calendarView: view }),
  setCalendarDate: (date) => set({ calendarDate: date }),
  toggleSelectedDate: (date) =>
    set((state) => ({
      selectedDates: state.selectedDates.includes(date)
        ? state.selectedDates.filter((d) => d !== date)
        : [...state.selectedDates, date],
    })),
  clearSelectedDates: () => set({ selectedDates: [] }),
  setDraggingTemplateId: (id) => set({ draggingTemplateId: id }),
  openDiagnostics: (level, targetId) =>
    set({ diagnosticsOpen: true, diagnosticsLevel: level, diagnosticsTargetId: targetId }),
  closeDiagnostics: () =>
    set({ diagnosticsOpen: false, diagnosticsTargetId: null }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setSelectedMacroId: (id) => set({ selectedMacroId: id }),
  setSelectedMesoId: (id) => set({ selectedMesoId: id }),
  setSelectedMicroId: (id) => set({ selectedMicroId: id }),
}));
