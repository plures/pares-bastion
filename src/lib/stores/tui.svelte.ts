/** Reactive TUI mode state shared across the application. */
export const tuiState = $state({ enabled: false });

export function setTui(value: boolean): void {
	tuiState.enabled = value;
}
