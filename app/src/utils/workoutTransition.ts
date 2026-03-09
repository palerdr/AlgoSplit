type TransitionCallback = () => void;

let _onTrigger: TransitionCallback | null = null;

export function registerTransitionHandler(handler: TransitionCallback) {
  _onTrigger = handler;
}

export function triggerExpandTransition() {
  _onTrigger?.();
}
