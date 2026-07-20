import 'react-native-gesture-handler';
import { registerRootComponent } from 'expo';

import App from './App';
import { endRestLiveActivity } from './src/workout/restLiveActivity';

// A force-quit can outlive the React rest overlay. Clear that orphan before a
// restored workout renders; a newly mounted timer queues its start afterward.
void endRestLiveActivity();

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
