import {
	type SaveState,
	begin,
	clearError,
	fail,
	idleState,
	stripText,
	succeed,
} from './logic/autosave.js';

/** Reactive wrapper over the pure autosave state for one open record. */
export class SaveStatus {
	state = $state.raw<SaveState>(idleState());
	strip = $derived(stripText(this.state));

	start() {
		this.state = begin(this.state);
	}
	done(key: string) {
		this.state = succeed(this.state, key);
	}
	failed(key: string, reason: string) {
		this.state = fail(this.state, key, reason);
	}
	clear(key: string) {
		this.state = clearError(this.state, key);
	}
}
