const fs = require('fs');
const path = require('path');
const { withDangerousMod, withInfoPlist } = require('@expo/config-plugins');

const TARGET_NAME = 'AlgoSplitLiveActivity';

function withRestAlarm(config) {
  config = withInfoPlist(config, (modConfig) => {
    modConfig.modResults.NSAlarmKitUsageDescription =
      'AlgoSplit uses a timer to alert you when your rest period ends, even while the app is in the background.';
    return modConfig;
  });

  return withDangerousMod(config, [
    'ios',
    async (modConfig) => {
      if (modConfig.modRequest.introspect) return modConfig;

      const templatePath = path.join(
        modConfig.modRequest.projectRoot,
        'modules',
        'rest-alarm',
        'widget',
        'VoltraWidgetBundle.swift'
      );
      const generatedBundlePath = path.join(
        modConfig.modRequest.platformProjectRoot,
        TARGET_NAME,
        'VoltraWidgetBundle.swift'
      );
      const appDelegatePath = path.join(
        modConfig.modRequest.platformProjectRoot,
        modConfig.modRequest.projectName,
        'AppDelegate.swift'
      );

      if (!fs.existsSync(generatedBundlePath)) {
        throw new Error(
          `RestAlarm expected Voltra to generate ${generatedBundlePath}. ` +
            'Keep withRestAlarm registered before @use-voltra/ios-client so this mod runs afterward.'
        );
      }

      fs.copyFileSync(templatePath, generatedBundlePath);

      const packageMarker = 'struct AlgoSplitAppIntentsPackage: AppIntentsPackage';
      let appDelegate = fs.readFileSync(appDelegatePath, 'utf8');
      if (!appDelegate.includes(packageMarker)) {
        appDelegate += `

#if canImport(AppIntents) && canImport(AlarmKit) && canImport(RestAlarm)
import AppIntents
import RestAlarm

@available(iOS 26.0, *)
${packageMarker} {
  static var includedPackages: [any AppIntentsPackage.Type] {
    [RestAlarmIntentsPackage.self]
  }
}
#endif
`;
        fs.writeFileSync(appDelegatePath, appDelegate);
      }
      return modConfig;
    },
  ]);
}

module.exports = withRestAlarm;
