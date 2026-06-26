type TransitionCallback = () => void;

let _onTrigger: TransitionCallback | null = null;

export function registerTransitionHandler(handler: TransitionCallback) {
  _onTrigger = handler;
  return () => {
    if (_onTrigger === handler) {
      _onTrigger = null;
    }
  };
}

export function triggerExpandTransition() {
  _onTrigger?.();
}
